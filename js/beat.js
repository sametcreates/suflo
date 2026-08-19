/*
 * Suflo — Ritim modülü
 *
 * Seçili klibin sesindeki vuruşları bulur ve timeline'a marker atar.
 *
 * Yöntem: spektral akı (spectral flux) onset tespiti. Ham enerji yerine
 * spektrumdaki ARTIŞ ölçülür — sürekli çalan bas gitarı değil, vuran kick'i
 * yakalar. Bant ayrımı FFT katmanında yapılır: bas (30-190 Hz) kick/808'i,
 * tiz (4 kHz+) snare/hi-hat'i verir. "Yapay zekâ" pazarlaması değil,
 * yerinde sinyal işleme; tamamı makinede çalışır, ses hiçbir yere gitmez.
 */
window.KBeat = (function () {
  "use strict";

  function el(id) { return document.getElementById(id); }
  function status(msg, cls) {
    var e = el("beat-status");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
    if (cls === "bad" && msg) K.log("[ritim] " + msg);
  }

  var clip = null;
  var vurusler = [];      // { t: timeline saniyesi, guc: 0..1, tip: "bass"|"tiz" }
  var bpm = 0;
  var busy = false;

  /* ---------------- FFT (radix-2, yerinde) ---------------- */

  var SR = 16000, N = 1024, HOP = 512;
  var _cosT = null, _sinT = null, _rev = null;

  function fftHazirla() {
    if (_cosT) return;
    _cosT = new Float64Array(N / 2);
    _sinT = new Float64Array(N / 2);
    for (var i = 0; i < N / 2; i++) {
      _cosT[i] = Math.cos(-2 * Math.PI * i / N);
      _sinT[i] = Math.sin(-2 * Math.PI * i / N);
    }
    _rev = new Uint16Array(N);
    var bits = Math.log2(N);
    for (var j = 0; j < N; j++) {
      var r = 0;
      for (var b = 0; b < bits; b++) if (j & (1 << b)) r |= 1 << (bits - 1 - b);
      _rev[j] = r;
    }
  }

  // re dizisini yerinde dönüştürür, büyüklük spektrumunu döndürür (N/2 bin)
  function fft(re) {
    fftHazirla();
    var im = new Float64Array(N);
    var i, j;
    // bit-reverse sırala
    for (i = 0; i < N; i++) {
      j = _rev[i];
      if (j > i) { var t = re[i]; re[i] = re[j]; re[j] = t; }
    }
    for (var boy = 2; boy <= N; boy <<= 1) {
      var yarim = boy >> 1, adim = N / boy;
      for (i = 0; i < N; i += boy) {
        for (j = 0; j < yarim; j++) {
          var k = j * adim;
          var tre = re[i + j + yarim] * _cosT[k] - im[i + j + yarim] * _sinT[k];
          var tim = re[i + j + yarim] * _sinT[k] + im[i + j + yarim] * _cosT[k];
          re[i + j + yarim] = re[i + j] - tre;
          im[i + j + yarim] = im[i + j] - tim;
          re[i + j] += tre;
          im[i + j] += tim;
        }
      }
    }
    var mag = new Float64Array(N / 2);
    for (i = 0; i < N / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    return mag;
  }

  /* ---------------- Onset tespiti ---------------- */

  /*
   * PCM (Float32) -> {bass:[{t,guc}], tiz:[...]}.
   * Bant sınırları: bas 2..12. bin (~31-188 Hz), tiz 256+ (4 kHz+).
   * Eşik uyarlanır: yerel ortanca * çarpan — sabit eşik sessiz şarkıda her
   * şeyi, gürültülü şarkıda hiçbir şeyi yakalar.
   */
  function onsetBul(pcm) {
    if (pcm.length < HOP) return { bass: [], tiz: [] };
    /*
     * Kenar dolgusu: dolgusuz halde klibin ilk ~80 ms'si ve son ~100-150 ms'si
     * hicbir pencereye tam oturmuyor, oradaki vuruslar asla bulunamiyordu.
     * Basa ve sona 2N sifir ekle; zamanlar asagida geri kaydirilir.
     */
    var pad = 2 * N;
    var kaynakSure = pcm.length / SR;
    var p2 = new Float32Array(pcm.length + 2 * pad);
    p2.set(pcm, pad);
    pcm = p2;
    var frameSayisi = Math.floor((pcm.length - N) / HOP);
    if (frameSayisi < 8) return { bass: [], tiz: [] };

    var basAki = new Float64Array(frameSayisi);
    var tizAki = new Float64Array(frameSayisi);
    var oncekiMag = null;
    var pencere = new Float64Array(N);
    // Hann penceresi: kenar sızıntısını azaltır
    var hann = new Float64Array(N);
    for (var h = 0; h < N; h++) hann[h] = 0.5 * (1 - Math.cos(2 * Math.PI * h / (N - 1)));

    for (var f = 0; f < frameSayisi; f++) {
      var ofset = f * HOP;
      for (var i = 0; i < N; i++) pencere[i] = pcm[ofset + i] * hann[i];
      var mag = fft(pencere);
      if (oncekiMag) {
        var b = 0, t = 0;
        for (var k = 2; k <= 12; k++) { var d1 = mag[k] - oncekiMag[k]; if (d1 > 0) b += d1; }
        for (var k2 = 256; k2 < N / 2; k2++) { var d2 = mag[k2] - oncekiMag[k2]; if (d2 > 0) t += d2; }
        basAki[f] = b;
        tizAki[f] = t;
      }
      oncekiMag = mag;
    }

    function tepeler(aki) {
      var out = [];
      var Y = 12;                       // yerel pencere yarıçapı (frame)
      var enB = 0;
      for (var i = 0; i < aki.length; i++) if (aki[i] > enB) enB = aki[i];
      if (enB <= 0) return out;

      for (var f = 2; f < aki.length - 2; f++) {
        // yerel ortanca eşiği
        var bas0 = Math.max(0, f - Y), son0 = Math.min(aki.length, f + Y);
        var dilim = [];
        for (var m = bas0; m < son0; m++) dilim.push(aki[m]);
        dilim.sort(function (a, b) { return a - b; });
        var ortanca = dilim[Math.floor(dilim.length / 2)];
        var esik = ortanca * 1.6 + enB * 0.02;

        if (aki[f] > esik &&
            aki[f] >= aki[f - 1] && aki[f] >= aki[f + 1] &&
            aki[f] > aki[f - 2] && aki[f] > aki[f + 2]) {
          /*
           * Parabolik interpolasyon: kare çözünürlüğü 32 ms (HOP/SR) —
           * marker'ı karenin ortasına değil, komşu akı değerlerinden
           * hesaplanan gerçek tepeye koyar. BPM tahmini de buna muhtaç:
           * 32 ms'e yapışık aralıklar 20 ms'lik sepetlerde 120 yerine
           * 115-117 gibi kayık tempo üretiyordu.
           */
          var payda = aki[f - 1] - 2 * aki[f] + aki[f + 1];
          var delta = payda !== 0 ? 0.5 * (aki[f - 1] - aki[f + 1]) / payda : 0;
          if (delta > 0.5) delta = 0.5; else if (delta < -0.5) delta = -0.5;
          var tSn = (f + delta) * HOP / SR;

          // min aralık 120 ms: çift tetiklemeyi önle
          if (out.length && tSn - out[out.length - 1].t < 0.12) {
            if (aki[f] > out[out.length - 1].ham) {
              out[out.length - 1] = { t: tSn, ham: aki[f] };
            }
            continue;
          }
          out.push({ t: tSn, ham: aki[f] });
        }
      }
      out.forEach(function (o) { o.guc = Math.min(1, o.ham / enB); delete o.ham; });
      return out;
    }

    // dolgu kaymasini geri al ve kaynak suresine kirp
    function kaydir(liste) {
      liste.forEach(function (o) {
        o.t = o.t - pad / SR;
        if (o.t < 0) o.t = 0;
        if (o.t > kaynakSure) o.t = kaynakSure;
      });
      return liste;
    }
    return { bass: kaydir(tepeler(basAki)), tiz: kaydir(tepeler(tizAki)) };
  }

  /*
   * BPM: vuruş aralıklarının histogramından (0.28-1 sn arası) en yoğun aralık.
   * Onset zamanları 32 ms karelere (HOP/SR) kuantalanmış geliyor; 20 ms'lik
   * sepetlere tek başına bakmak aynı temponun aralıklarını iki komşu sepete
   * böler ve sepet MERKEZİ kullanılırsa 120 yerine 115 gibi kayık değer çıkar.
   * Çare: kazananı komşularıyla birlikte seç, BPM'i sepet merkezinden değil
   * o penceredeki GERÇEK aralıkların ortalamasından hesapla.
   */
  function bpmTahmin(liste) {
    if (liste.length < 6) return 0;
    var sayi = {}, toplam = {};
    for (var i = 1; i < liste.length; i++) {
      var d = liste[i].t - liste[i - 1].t;
      // 2x/0.5x katlarını aynı sepete indir
      while (d < 0.28 && d > 0) d *= 2;
      while (d > 1.0) d /= 2;
      if (d < 0.28 || d > 1.0) continue;
      var anahtar = Math.round(d * 50);      // 20 ms sepetler
      sayi[anahtar] = (sayi[anahtar] || 0) + 1;
      toplam[anahtar] = (toplam[anahtar] || 0) + d;
    }
    var enIyiK = 0, enSkor = 0;
    Object.keys(sayi).forEach(function (ks) {
      var k = +ks;
      var skor = (sayi[k - 1] || 0) + sayi[k] + (sayi[k + 1] || 0);
      // eşitlikte merkezi kalabalık olan kazansın (kararlılık)
      if (skor > enSkor || (skor === enSkor && sayi[k] > (sayi[enIyiK] || 0))) {
        enSkor = skor; enIyiK = k;
      }
    });
    if (!enIyiK) return 0;
    var n = 0, t = 0;
    for (var k2 = enIyiK - 1; k2 <= enIyiK + 1; k2++) {
      if (sayi[k2]) { n += sayi[k2]; t += toplam[k2]; }
    }
    return n > 0 ? Math.round(60 / (t / n)) : 0;
  }

  /* ---------------- Akış ---------------- */

  function refreshButton() {
    var ctx = KApp.ctx();
    var b = el("beat-analyze");
    if (!b) return;
    b.disabled = busy || !ctx.sel;
    el("beat-info").textContent = ctx.sel ? ctx.sel.name : "önce timeline'da bir klip seç";
  }

  async function analyze() {
    if (typeof Pro !== "undefined" && !Pro.gate("beat")) return; // Pro: ritim analizi
    if (busy) return;
    /*
     * Analiz dakikalarca surebilir; bu sirada kullanici secimi degistirirse
     * onContext modul degiskeni clip'i null'lar ve analiz TypeError ile
     * cokerdi. Yerel kopya (k) uzerinden calis: analiz basladigi klibe kilitli.
     */
    var k = KApp.ctx().sel;
    clip = k;
    if (!k) { status("Önce timeline'da bir klip seç.", "warn"); return; }
    busy = true;
    el("beat-analyze").classList.add("busy");
    el("beat-progress").hidden = false;
    var temizle = [];
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı.");

      status("Ses çözülüyor…");
      var ham = K.path.join(K.tmpDir(), "beat_" + Date.now() + ".pcm");
      temizle.push(ham);
      var r = await K.run(ff, ["-y", "-ss", String(k.inPoint), "-t", String(k.dur),
        "-i", k.mediaPath, "-ac", "1", "-ar", String(SR), "-f", "s16le", ham],
        { timeout: 900000 });
      if (r.code !== 0 || !K.fs.existsSync(ham)) {
        throw new Error("Ses çözülemedi: " + String(r.stderr || "").split("\n").slice(-2).join(" ").slice(0, 140));
      }

      status("Vuruşlar aranıyor…");
      var buf = K.fs.readFileSync(ham);
      var ornekSayisi = Math.floor(buf.length / 2);
      var pcm = new Float32Array(ornekSayisi);
      for (var i = 0; i < ornekSayisi; i++) pcm[i] = buf.readInt16LE(i * 2) / 32768;

      var sonucB = onsetBul(pcm);

      // klip hızı değiştirilmişse kaynak süresi != timeline süresi
      var timelineSure = k.clipEnd - k.clipStart;
      var hiz = (k.dur > 0 && timelineSure > 0) ? timelineSure / k.dur : 1;

      var bant = el("beat-bant").value;
      vurusler = [];
      if (bant === "bass" || bant === "hepsi") {
        sonucB.bass.forEach(function (v) { vurusler.push({ t: k.clipStart + v.t * hiz, guc: v.guc, tip: "bass" }); });
      }
      if (bant === "tiz" || bant === "hepsi") {
        sonucB.tiz.forEach(function (v) { vurusler.push({ t: k.clipStart + v.t * hiz, guc: v.guc, tip: "tiz" }); });
      }
      vurusler.sort(function (a, b) { return a.t - b.t; });
      // 'hepsi' bandinda ayni vurus bas+tiz listelerinde iki kez cikabilir:
      // 60 ms icinde ust uste binenleri tekle, guclu olani tut
      var tekil = [];
      vurusler.forEach(function (v) {
        var son = tekil[tekil.length - 1];
        if (son && v.t - son.t < 0.06) {
          if (v.guc > son.guc) tekil[tekil.length - 1] = v;
        } else tekil.push(v);
      });
      vurusler = tekil;
      bpm = bpmTahmin(bant === "tiz" ? sonucB.tiz : sonucB.bass);
      // bas vurusu az olan parcada (akustik, lo-fi) tize dus — birlesik liste ASLA verilmez
      if (!bpm && bant === "hepsi") bpm = bpmTahmin(sonucB.tiz);

      if (!vurusler.length) {
        status("Belirgin vuruş bulunamadı. Müzik içeren bir klip seç ya da vuruş tipini değiştir.", "warn");
        el("beat-result").hidden = true;
        return;
      }

      status("");
      el("beat-result").hidden = false;
      el("beat-result-info").textContent = vurusler.length + " vuruş" + (bpm ? " · ~" + bpm + " BPM" : "");
      cizBar(timelineSure, k.clipStart);
      KApp.toast(vurusler.length + " vuruş bulundu" + (bpm ? " (" + bpm + " BPM)" : ""), "good");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      temizle.forEach(function (f) { try { K.fs.unlinkSync(f); } catch (e2) {} });
      busy = false;
      el("beat-analyze").classList.remove("busy");
      el("beat-progress").hidden = true;
      refreshButton();
    }
  }

  // Vuruşları yatay bir bantta göster: bas kalın/mor, tiz ince/mavi
  function cizBar(sure, t0) {
    var bar = el("beat-bar");
    if (!bar) return;
    bar.innerHTML = "";
    vurusler.forEach(function (v) {
      var tik = document.createElement("i");
      tik.className = "beat-tik " + v.tip;
      tik.style.left = Math.min(99.5, ((v.t - t0) / sure) * 100) + "%";
      tik.style.opacity = String(0.45 + v.guc * 0.55);
      bar.appendChild(tik);
    });
  }

  async function apply() {
    if (!vurusler.length) return;
    var siklik = parseInt(el("beat-siklik").value, 10) || 1;
    var secilen = vurusler.filter(function (v, i) { return i % siklik === 0; });
    el("beat-apply").disabled = true;
    try {
      var r = await K.call("KS_addMarkers", {
        times: secilen.map(function (v) { return v.t; }),
        name: "Vuruş" + (bpm ? " " + bpm + "bpm" : "")
      }, 120000);
      if (!r.ok) throw new Error(r.error);
      KApp.toast(r.added + " marker atıldı — timeline'da yeşil işaretler", "good");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      el("beat-apply").disabled = false;
    }
  }

  function init() {
    if (!el("beat-analyze")) return;
    el("beat-analyze").addEventListener("click", analyze);
    el("beat-apply").addEventListener("click", apply);
    KApp.onContext(function (ctx) {
      refreshButton();
      if (busy) return; // analiz surerken sonucu/klibi sifirlama — analiz yerel kopyayla bitiyor
      if (clip && (!ctx.sel || ctx.sel.mediaPath !== clip.mediaPath)) {
        el("beat-result").hidden = true;
        vurusler = [];
        clip = null;
      }
    });
    refreshButton();
  }

  return { init: init, _onsetBul: onsetBul, _bpmTahmin: bpmTahmin };
})();
