/*
 * Suflo — Podcast Modu paneli (mikrofona göre otomatik kamera geçişi + konuşmacı renkli altyazı)
 *
 * Mantık js/multicam.js'te (saf, testli). Burada: sekansı tara → eşleme tablosu, her mikrofonu
 * Premiere'den ayrı dışa aktarıp enerji serisine çevirme, ritim ayarlarıyla canlı plan ve
 * önizleme, host'ta önce tüm kesimler sonra tüm aç/kapa (parça parça, ilerleme çubuğuyla).
 * Altyazı (captions.js) konuşmacıyı bellekteki önbellekten okur: KMulticam.speakerFor.
 */
window.KMulticam = (function () {
  "use strict";

  var M = window.SufloMulticam;
  var WIN = 0.1;
  var RENKLER = ["#ffd23f", "#4fd1ff", "#ff6b9a", "#7cf0a0"];
  var HARF = ["A", "B", "C", "D"];
  var RAZOR_PARCA = 40, ENABLE_PARCA = 40;

  var layout = null;        // KS_getTrackLayout
  var esleme = null;        // { speakers: [{ name, mic, cam, color }], wide }
  var onbellek = null;      // { seqId, seqIds: {}, duration, names, series, norm, act, win }
  var plan = [];
  var hedef = "clone";
  var mesgul = false;

  function el(id) { return document.getElementById(id); }
  function durum(msg, cls) {
    var e = el("pc-durum");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }
  function ilerleme(oran) {
    var p = el("pc-progress");
    if (!p) return;
    p.hidden = oran === null;
    var i = p.querySelector("i");
    if (i && oran !== null) i.style.width = Math.round(Math.max(0, Math.min(1, oran)) * 100) + "%";
  }

  /* ---------------- ayarlar ---------------- */
  function ayarlar() {
    var s = {};
    try { s = (K.settings().podcast) || {}; } catch (e) {}
    return s;
  }
  function ayarKaydet() {
    try {
      var s = K.settings();
      s.podcast = {
        minShot: sayi("pc-min", 2), maxShot: sayi("pc-max", 12), hassas: sayi("pc-hassas", 6), hold: sayi("pc-hold", 400),
        capraz: kutu("pc-capraz"), periyotAcik: kutu("pc-periyot-ac"), periyot: sayi("pc-periyot", 20),
        renkler: esleme ? esleme.speakers.map(function (s2) { return s2.color; }) : undefined,
        renkAcik: kutu("pc-renk")
      };
      K.saveSettings();
    } catch (e) {}
  }
  function sayi(id, d) { var e = el(id); var v = e ? Number(e.value) : NaN; return isFinite(v) ? v : d; }
  function kutu(id) { var e = el(id); return !!(e && e.checked); }

  /* ---------------- 1. Sekansı tara ---------------- */
  async function tara() {
    if (mesgul) return;
    mesgul = true;
    durum("Sekans taranıyor…");
    try {
      var r = await K.call("KS_getTrackLayout");
      if (!r.ok) throw new Error(r.error);
      layout = r;
      var oneri = M.suggestMapping(r);
      var kayitli = ayarlar().renkler || [];
      oneri.speakers.forEach(function (s, i) { s.color = kayitli[i] || RENKLER[i]; });
      esleme = oneri;
      onbellek = null; plan = [];
      tabloCiz();
      sonucGizle();
      var uyar = r.video.some(function (t) { return t.hasMulticam; });
      durum(r.name + " · " + r.audio.length + " ses, " + r.video.length + " video katmanı" +
        (uyar ? " · Multicam kaynak klibi olan katmanlar kamera olarak seçilemez." : ""), uyar ? "warn" : "good");
    } catch (e) {
      durum(e.message, "bad");
    } finally { mesgul = false; }
  }

  function secenek(sel, deger, metin) {
    var o = document.createElement("option");
    o.value = String(deger); o.textContent = metin;
    sel.appendChild(o);
  }
  function izAdi(t, harf) {
    return harf + (t.index + 1) + (t.name ? " · " + t.name : "") + (t.clipCount ? "" : " · boş");
  }

  function tabloCiz() {
    var kutuEl = el("pc-esleme");
    if (!kutuEl) return;
    kutuEl.innerHTML = "";
    kutuEl.hidden = !esleme;
    el("pc-esleme-alt").hidden = !esleme;
    if (!esleme) return;
    var bas = document.createElement("div");
    bas.className = "pc-satir pc-bas";
    ["Konuşmacı", "Mikrofon", "Kamera", "Renk"].forEach(function (b) {
      var s = document.createElement("span"); s.textContent = b; bas.appendChild(s);
    });
    kutuEl.appendChild(bas);
    esleme.speakers.forEach(function (sp, i) {
      var sat = document.createElement("div");
      sat.className = "pc-satir";
      var ad = document.createElement("input");
      ad.type = "text"; ad.maxLength = 24; ad.value = sp.name; ad.setAttribute("aria-label", "Konuşmacı adı");
      ad.addEventListener("input", function () { sp.name = ad.value.trim() || HARF[i]; planla(); });
      var mik = document.createElement("select");
      mik.setAttribute("aria-label", "Mikrofon ses katmanı");
      secenek(mik, -1, "—");
      layout.audio.forEach(function (t) { secenek(mik, t.index, izAdi(t, "A")); });
      mik.value = String(sp.mic);
      mik.addEventListener("change", function () { sp.mic = Number(mik.value); onbellek = null; sonucGizle(); });
      var kam = document.createElement("select");
      kam.setAttribute("aria-label", "Kamera video katmanı");
      secenek(kam, -1, "—");
      layout.video.forEach(function (t) { if (!t.hasMulticam) secenek(kam, t.index, izAdi(t, "V")); });
      kam.value = String(sp.cam);
      kam.addEventListener("change", function () { sp.cam = Number(kam.value); planla(); });
      var renk = document.createElement("input");
      renk.type = "color"; renk.value = sp.color; renk.setAttribute("aria-label", "Konuşmacı rengi");
      renk.addEventListener("input", function () { sp.color = renk.value; onizlemeCiz(); ayarKaydet(); });
      [ad, mik, kam, renk].forEach(function (x) { sat.appendChild(x); });
      kutuEl.appendChild(sat);
    });
    var genis = el("pc-genis");
    genis.innerHTML = "";
    secenek(genis, -1, "Yok");
    layout.video.forEach(function (t) { if (!t.hasMulticam) secenek(genis, t.index, izAdi(t, "V")); });
    genis.value = String(esleme.wide);
    el("pc-ekle").disabled = esleme.speakers.length >= 4;
    el("pc-cikar").disabled = esleme.speakers.length <= 2;
  }

  function konusmaciSayisi(fark) {
    if (!esleme || !layout) return;
    var n = Math.max(2, Math.min(4, esleme.speakers.length + fark));
    if (n === esleme.speakers.length) return;
    if (fark > 0) {
      var i = esleme.speakers.length;
      var oneri = M.suggestMapping(layout, n).speakers[i];
      esleme.speakers.push({ name: oneri.name, mic: oneri.mic, cam: oneri.cam, color: RENKLER[i] });
    } else esleme.speakers.pop();
    onbellek = null; plan = [];
    tabloCiz();
    sonucGizle();
  }

  function eslemeHatasi(h) {
    if (!h) return "";
    var ad = esleme && esleme.speakers[h.i] ? esleme.speakers[h.i].name : "";
    if (h.kod === "sayi") return "2 ile 4 arası konuşmacı gerekli.";
    if (h.kod === "mik_yok") return ad + ": mikrofon katmanı seç.";
    if (h.kod === "kam_yok") return ad + ": kamera katmanı seç.";
    if (h.kod === "mik_ayni") return ad + ": her konuşmacının kendi mikrofonu olmalı.";
    if (h.kod === "genis_ayni") return "Geniş plan katmanı bir konuşmacının kamerasıyla aynı olamaz.";
    return "Eşleme geçersiz.";
  }

  /* ---------------- 2. Analiz ---------------- */
  function bundledEpr() {
    try { return window.KCaptions && KCaptions.bundledEpr ? KCaptions.bundledEpr() : []; } catch (e) { return []; }
  }

  function izSatiri(i, metin, cls) {
    var liste = el("pc-izler");
    if (!liste) return;
    var id = "pc-iz-" + i, sat = el(id);
    if (!sat) {
      sat = document.createElement("div");
      sat.id = id; sat.className = "pc-iz";
      liste.appendChild(sat);
    }
    sat.className = "pc-iz" + (cls ? " " + cls : "");
    sat.textContent = metin;
  }

  // Düz klip yedeği: Premiere dışa aktaramazsa sesi doğrudan dosyadan oku (birleşik / multicam
  // değil, tek klip, başka mikrofonla paylaşılmayan dosya)
  function duzKlip(micIdx) {
    var t = layout.audio[micIdx];
    if (!t || !t.plain || !t.plain.path) return null;
    var ayni = esleme.speakers.filter(function (s) {
      var o = layout.audio[s.mic];
      return o && o.plain && String(o.plain.path).toLowerCase() === String(t.plain.path).toLowerCase();
    }).length;
    return ayni === 1 ? t.plain : null;
  }

  async function micEnerji(i, sp, ff) {
    var etiket = sp.name + " · A" + (sp.mic + 1);
    var dep = { run: K.run, fs: K.fs, path: K.path };
    izSatiri(i, etiket + ": Premiere'den dışa aktarılıyor…");
    var ex = await K.call("KS_exportAudio", { scope: "entire", epr: bundledEpr(), tracks: [sp.mic], unmuteWanted: true }, 3600000);
    var seri;
    if (ex.ok) {
      izSatiri(i, etiket + ": ses çözülüyor…");
      seri = await M.energyFromFile(dep, { ff: ff, input: ex.wav, tmpDir: K.tmpDir(), silInput: true, win: WIN });
    } else {
      var duz = duzKlip(sp.mic);
      if (!duz) throw new Error(ex.error ? etiket + " · " + ex.error : etiket + ": dışa aktarılamadı");
      K.log("[podcast] dışa aktarım olmadı, düz klipten okunuyor: " + ex.error);
      izSatiri(i, etiket + ": dosyadan okunuyor…");
      seri = await M.energyFromFile(dep, { ff: ff, input: duz.path, tmpDir: K.tmpDir(), silInput: false, win: WIN,
        ss: duz.inPoint, t: duz.end - duz.start, offset: duz.start });
    }
    var p95 = M.percentile(seri, 95);
    if (p95 < M.SESSIZ_P95) {
      izSatiri(i, etiket + ": sessiz — kapalı veya solo mu?", "bad");
      var hata = new Error(etiket + ": sessiz — kapalı veya solo mu?");
      hata.gosterildi = true;
      throw hata;
    }
    izSatiri(i, etiket + ": hazır", "good");
    return seri;
  }

  async function analiz() {
    if (mesgul) return;
    if (!esleme || !layout) { durum("Önce sekansı tara.", "bad"); return; }
    var h = M.checkMapping(esleme);
    if (h) { durum(eslemeHatasi(h), "bad"); return; }
    var ff = await K.findFfmpeg();
    if (!ff) { durum("Podcast Modu için ffmpeg gerekli (Ayarlar → ffmpeg).", "bad"); return; }
    mesgul = true;
    el("pc-analiz").disabled = true;
    el("pc-izler").innerHTML = "";
    sonucGizle();
    try {
      var bas = await K.call("KS_getTrackLayout");
      if (!bas.ok) throw new Error(bas.error);
      if (bas.seqId !== layout.seqId) throw new Error("Aktif sekans değişti; sekansı yeniden tara.");
      var seriler = [];
      for (var i = 0; i < esleme.speakers.length; i++) {
        durum("Mikrofonlar okunuyor… " + (i + 1) + "/" + esleme.speakers.length);
        ilerleme(i / esleme.speakers.length);
        seriler.push(await micEnerji(i, esleme.speakers[i], ff));
      }
      var n = Math.ceil((Number(layout.duration) || 0) / WIN);
      seriler = M.padSeries(seriler, n);
      var ids = {}; ids[layout.seqId] = 1;
      onbellek = { seqId: layout.seqId, seqIds: ids, duration: Number(layout.duration) || seriler[0].length * WIN,
        names: esleme.speakers.map(function (s) { return s.name; }), series: seriler,
        norm: M.normalizeSeries(seriler), act: null, win: WIN };
      planla();
      durum("Analiz bitti. Ritmi ayarla, önizlemeye bak, sonra uygula.", "good");
    } catch (e) {
      if (!e.gosterildi) K.log("[podcast] analiz: " + e.message);
      durum(e.message, "bad");
    } finally {
      ilerleme(null);
      mesgul = false;
      el("pc-analiz").disabled = false;
    }
  }

  /* ---------------- 3. Ritim + canlı plan ---------------- */
  function secenekler() {
    var genis = esleme && esleme.wide >= 0;
    return {
      win: WIN, minShot: sayi("pc-min", 2), maxShot: sayi("pc-max", 12), holdMs: sayi("pc-hold", 400),
      wideCam: genis, wideOnCrosstalk: kutu("pc-capraz"),
      widePeriodic: kutu("pc-periyot-ac") ? sayi("pc-periyot", 20) : 0,
      duration: onbellek ? onbellek.duration : 0
    };
  }

  function etiketGuncelle() {
    var y = [["pc-min", "pc-min-val", " sn"], ["pc-max", "pc-max-val", " sn"], ["pc-hassas", "pc-hassas-val", " dB"], ["pc-hold", "pc-hold-val", " ms"]];
    y.forEach(function (x) { var v = el(x[1]); if (v && el(x[0])) v.textContent = el(x[0]).value + x[2]; });
  }

  function planla() {
    etiketGuncelle();
    if (!onbellek || !esleme) { sonucGizle(); return; }
    onbellek.act = M.activity(onbellek.norm.levels, { switchMarginDb: sayi("pc-hassas", 6), gateDb: -25 });
    onbellek.names = esleme.speakers.map(function (s) { return s.name; });
    plan = M.buildPlan(onbellek.act, secenekler());
    onizlemeCiz();
  }

  function sonucGizle() {
    var s = el("pc-sonuc");
    if (s) s.hidden = true;
  }

  function kameraAdi(cam) {
    if (cam === M.WIDE) return "Geniş";
    var sp = esleme.speakers[cam];
    return sp ? sp.name : "?";
  }
  function kameraRengi(cam) {
    if (cam === M.WIDE) return "#9aa3b8";
    var sp = esleme.speakers[cam];
    return sp ? sp.color : "#888";
  }

  function onizlemeCiz() {
    var kutuEl = el("pc-onizleme"), sonuc = el("pc-sonuc");
    if (!kutuEl || !sonuc) return;
    sonuc.hidden = !plan.length;
    kutuEl.innerHTML = "";
    if (!plan.length) return;
    var toplam = onbellek.duration || plan[plan.length - 1].end;
    var kameralar = esleme.speakers.map(function (s, i) { return i; });
    if (esleme.wide >= 0) kameralar.push(M.WIDE);
    kameralar.forEach(function (cam) {
      var ad = document.createElement("span");
      ad.className = "pc-kam";
      ad.textContent = kameraAdi(cam);
      var bar = document.createElement("div");
      bar.className = "cut-bar pc-bar";
      // magiccut renderBar gibi: ardışık span'lar, açık olduğu parçalar kameranın renginde
      var pos = 0;
      plan.forEach(function (s) {
        if (s.cam !== cam) return;
        if (s.start > pos) {
          var bos = document.createElement("span");
          bos.className = "keep";
          bos.style.width = ((s.start - pos) / toplam * 100) + "%";
          bar.appendChild(bos);
        }
        var on = document.createElement("span");
        on.className = "pc-on";
        on.style.width = ((s.end - s.start) / toplam * 100) + "%";
        on.style.background = kameraRengi(cam);
        bar.appendChild(on);
        pos = s.end;
      });
      if (pos < toplam) {
        var kuyruk = document.createElement("span");
        kuyruk.className = "keep";
        kuyruk.style.width = ((toplam - pos) / toplam * 100) + "%";
        bar.appendChild(kuyruk);
      }
      kutuEl.appendChild(ad);
      kutuEl.appendChild(bar);
    });
    var st = M.planStats(plan);
    var parcalar = [st.switches + " kamera geçişi"];
    st.cams.forEach(function (c) { parcalar.push(kameraAdi(c) + " %" + Math.round(st.share[c] * 100)); });
    el("pc-ozet").textContent = parcalar.join(" · ");
    var uyari = el("pc-uyari");
    if (uyari) {
      uyari.hidden = !st.warn;
      uyari.textContent = st.warn ? "Çok sık geçiş (" + st.switches + "). En kısa planı ya da bekleme süresini artır." : "";
    }
  }

  /* ---------------- 4. Uygula ---------------- */
  async function uygula() {
    if (mesgul) return;
    if (!plan.length || !onbellek) { durum("Önce analiz et.", "bad"); return; }
    if (typeof Pro !== "undefined" && !Pro.gate("multicam")) return;
    var h = M.checkMapping(esleme);
    if (h) { durum(eslemeHatasi(h), "bad"); return; }
    var hp = M.hostPlan(plan, esleme.speakers.map(function (s) { return s.cam; }), esleme.wide);
    mesgul = true;
    el("pc-uygula").disabled = true;
    try {
      durum(hedef === "clone" ? "Kopya sekans hazırlanıyor…" : "Katmanlar denetleniyor…");
      ilerleme(0);
      var ad = (layout && layout.name ? layout.name : "Podcast") + " - Suflo Podcast";
      var pr = await K.call("KS_multicamPrepare", { camTracks: hp.tracks, cloneFirst: hedef === "clone", cloneName: ad, seqId: onbellek.seqId }, 120000);
      if (!pr.ok) throw new Error(hostHatasi(pr));
      onbellek.seqIds[pr.seqId] = 1;
      var razorlar = M.chunk(hp.cuts, RAZOR_PARCA);
      var enablePar = M.chunk(hp.plan, ENABLE_PARCA);
      var adim = razorlar.length + enablePar.length, yapilan = 0, kesim = 0, degisen = 0, geriAlinan = 0;
      // önce TÜM kesimler (parça sınırında yanlış orta nokta olmasın), sonra TÜM aç/kapa
      for (var i = 0; i < razorlar.length; i++) {
        durum("Kamera katmanları kesiliyor… " + (i + 1) + "/" + razorlar.length);
        var rr = await K.call("KS_multicamRazor", { seqId: pr.seqId, cuts: razorlar[i] }, 300000);
        if (!rr.ok) throw new Error(hostHatasi(rr));
        kesim += rr.cuts;
        ilerleme(++yapilan / adim);
      }
      for (var j = 0; j < enablePar.length; j++) {
        durum("Kameralar açılıp kapatılıyor… " + (j + 1) + "/" + enablePar.length);
        var g = enablePar[j];
        var re = await K.call("KS_multicamEnable", { seqId: pr.seqId, plan: hp.plan, camTracks: hp.tracks,
          from: j === 0 ? null : g[0].s, to: j === enablePar.length - 1 ? null : g[g.length - 1].e }, 300000);
        if (!re.ok) throw new Error(hostHatasi(re));
        degisen += re.changed; geriAlinan += re.linkedRestored || 0;
        ilerleme(++yapilan / adim);
      }
      var st = M.planStats(plan);
      var parcalar = [pr.cloned ? "Kopyada " + st.switches + " kamera geçişi uygulandı" : "Bu sekansta " + st.switches + " kamera geçişi uygulandı",
        kesim + " kesim"];
      if (geriAlinan) parcalar.push("bağlı " + geriAlinan + " ses klibi açık tutuldu");
      var msg = parcalar.join(" · ");
      durum(msg, "good");
      if (window.KApp && KApp.toast) KApp.toast(msg, "good");
    } catch (e) {
      durum(e.message, "bad");
    } finally {
      ilerleme(null);
      mesgul = false;
      el("pc-uygula").disabled = false;
    }
  }

  function hostHatasi(r) {
    var v = typeof r.track === "number" && r.track >= 0 ? "V" + (r.track + 1) : "";
    if (r.kod === "kilitli") return "Kamera katmanı kilitli: " + v + ". Kilidi açıp yeniden dene.";
    if (r.kod === "bos") return "Kamera katmanında klip yok: " + v + ".";
    if (r.kod === "multicam") return "Multicam kaynak klibi desteklenmiyor (" + v + "): açıyı değiştirecek bir API yok. Kameraları ayrı katmanlara koy.";
    if (r.kod === "iz_yok") return v ? "Kamera katmanı bulunamadı: " + v + ". Sekansı yeniden tara." : "Kamera katmanı bulunamadı. Sekansı yeniden tara.";
    if (r.kod === "sekans") return "Aktif sekans değişti; işlem durduruldu. Sekansı yeniden tara.";
    if (r.kod === "kopya") return "Kopya sekans oluşturulamadı. 'Bu sekansta' modunu dene.";
    if (r.kod === "linkedConflict") return "Kamera klipleri sesle bağlı ve birlikte kapanıyor. Kamera kliplerinin bağlantısını kopar (Ctrl+L), sonra yeniden uygula.";
    return r.error || "Premiere işlemi tamamlanamadı.";
  }

  /* ---------------- 5. Konuşmacı renkleri (Altyazı okur) ---------------- */
  function colorsEnabled() {
    if (!kutu("pc-renk") || !onbellek || !onbellek.act) return false;
    var c = window.KApp && window.KApp.ctx ? window.KApp.ctx() : null;
    if (c && c.sequenceId && !onbellek.seqIds[c.sequenceId]) return false;
    return true;
  }
  function speakerFor(a, b) {
    if (!onbellek || !onbellek.act) return -1;
    if (a > onbellek.duration + 0.5) return -1;
    return M.speakerFor({ act: onbellek.act, win: onbellek.win }, a, b);
  }
  function speakerColors() {
    return esleme ? esleme.speakers.map(function (s) { return s.color; }) : [];
  }
  // Altyazı derlemesi için: kapalıysa seçenekler aynen döner (çıktı değişmez)
  function captionOptions(o) {
    if (!colorsEnabled() || !o || !o.cues) return o;
    o.cues = o.cues.map(function (c) {
      var k = {};
      for (var x in c) if (Object.prototype.hasOwnProperty.call(c, x)) k[x] = c[x];
      // cue zamanı sekans zamanıdır (In noktası offset'i derlemede düşülür); önizleme gibi
      // zamanı kaydırılmış cue'lar konuşmacıyı kendisi taşır (-1: bilinmiyor, stilin rengi)
      if (typeof c.speaker === "number") return k;
      var sp = speakerFor(Number(c.start) || 0, Number(c.end) || 0);
      if (sp >= 0) k.speaker = sp;
      return k;
    });
    o.speakerColors = speakerColors();
    return o;
  }

  function init() {
    if (!M || !el("tab-podcast")) return;
    var s = ayarlar();
    function ata(id, v) { var e = el(id); if (e && v !== undefined && v !== null) { if (e.type === "checkbox") e.checked = !!v; else e.value = v; } }
    ata("pc-min", s.minShot); ata("pc-max", s.maxShot); ata("pc-hassas", s.hassas); ata("pc-hold", s.hold);
    ata("pc-capraz", s.capraz); ata("pc-periyot-ac", s.periyotAcik); ata("pc-periyot", s.periyot); ata("pc-renk", s.renkAcik);
    etiketGuncelle();
    el("pc-tara").addEventListener("click", tara);
    el("pc-analiz").addEventListener("click", analiz);
    el("pc-uygula").addEventListener("click", uygula);
    el("pc-ekle").addEventListener("click", function () { konusmaciSayisi(1); });
    el("pc-cikar").addEventListener("click", function () { konusmaciSayisi(-1); });
    el("pc-genis").addEventListener("change", function () { if (esleme) { esleme.wide = Number(el("pc-genis").value); planla(); } });
    ["pc-min", "pc-max", "pc-hassas", "pc-hold", "pc-periyot"].forEach(function (id) {
      el(id).addEventListener("input", function () { planla(); });
      el(id).addEventListener("change", ayarKaydet);
    });
    ["pc-capraz", "pc-periyot-ac", "pc-renk"].forEach(function (id) {
      el(id).addEventListener("change", function () { planla(); ayarKaydet(); });
    });
    Array.prototype.forEach.call(el("pc-hedef").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("pc-hedef").querySelectorAll("button"), function (x) { x.classList.toggle("on", x === b); });
        hedef = b.dataset.m;
      });
    });
  }

  return {
    init: init,
    colorsEnabled: colorsEnabled,
    speakerFor: speakerFor,
    speakerColors: speakerColors,
    captionOptions: captionOptions,
    // testler / tanılama
    _durum: function () { return { layout: layout, esleme: esleme, onbellek: onbellek, plan: plan }; },
    _kur: function (o, e) { onbellek = o; esleme = e; }
  };
})();
