/*
 * Kesit — Kesim modülü
 * Seçili klip otomatik algılanır → "Duraksamaları bul" → görsel bar + liste →
 * varsayılan olarak kopya sekansta ripple uygular (orijinal hiç bozulmaz).
 *
 * 3.4 canlı eşik: ses BİR KEZ çözülür (K.runAkis → SufloSessizlik tepe zarfı, bellekte); Eşik /
 * Min. sessizlik / Tampon / Min. konuşma kaydırıcıları haritayı ~100 ms içinde yeniden çizer, ffmpeg
 * yeniden çalışmaz. Uygula'da silencedetect son ayarlarla bir kez koşar (eski akışla birebir); kesimler
 * önizlemeden farklı çıkarsa Uygula önce farkı gösterir, ikinci tık uygular. Kullanıcının kapattığı
 * bölgeler ayrı bir karar listesinde (kapatilanlar) tutulur. Çözümleme olmazsa eski silencedetect akışı
 * aynen çalışır.
 */
window.KCut = (function () {
  "use strict";

  var clip = null;
  var ranges = [];      // { start, end, keep, birlesik? } — sequence zamanı
  var adalar = [];      // Min. konuşma ile kesime katılan kısa konuşma adaları (sequence zamanı)
  /*
   * Kullanıcının kapattığı bölgeler (sequence zamanı, { start, end, keep:false }): türetilmiş `ranges`ten
   * AYRI. Yalnız çubuk / liste tıklaması yazar (S.kararYaz); her yeniden hesaplanan küme (kaydırıcı,
   * önbellek, Uygula doğrulaması) bununla eşlenir. Klip değişince ve Uygula'dan sonra boşalır.
   */
  var kapatilanlar = [];
  var target = "clone"; // clone | here
  var busy = false;
  /*
   * apply() sürerken (doğrulama + KS_applyCuts, 900 sn'ye dek): harita ve Uygula KİLİTLİ. busy yalnız ffmpeg
   * analizini / doğrulamasını kapsar; KS_applyCuts beklenirken kaydırıcı / Otomatik / kesim tıklaması
   * updateSummary'yle "Kesimleri uygula"yı yeniden açıyor, ikinci tık aynı sekans zamanlarını ikinci kez
   * kestiriyordu (ripple'dan sonra konuşma silerdi). Kilitliyken gelen kaydırıcı değişimi bekletilir (canliBekliyor),
   * kilit açılınca (Uygula başarısızsa) harita yeni ayarla kurulur.
   */
  var uygulaniyor = false;
  var canliBekliyor = false;
  // 3.4: tek çözümleme + canlı eşik
  var S = window.SufloSessizlik || null;
  var zarfOnbellek = S ? S.onbellekYap(4) : null;   // mediaPath|in|dur → tepe zarfı
  var zarf = null;          // geçerli klibin zarfı; null → eski (silencedetect) akış
  var hamSessizlik = null;  // eski akış: { liste, noise, minSil } silencedetect ham aralıkları
  var sdOnbellek = {};      // silencedetect sonucu: anahtar|eşik|min. sessizlik → ham aralıklar
  var sonAnahtar = "";
  var farkUyarisi = false;  // durum satırında "doğrulama kesimleri değiştirdi" uyarısı var (kaydırıcı silsin)
  var canliZaman = null;
  var CANLI_MS = 100;
  // Süren ffmpeg analizinin iptal jetonu (K.iptalJetonu): "İptal" düğmesi süreç ağacını öldürür
  var iptalJetonu = null;
  // setBusy(true) anı: "İptal" "Sessizlikleri bul"un yerinde belirir; çift tıklamanın ikinci tıkı analizi iptal etmesin
  var iptalAcilis = 0;
  // setBusy(false) anı: "Sessizlikleri bul" "İptal"in yerinde yeniden belirir; İptal'e çift tıkın ikinci tıkı yeni analiz başlatmasın
  var baslatAcilis = 0;

  function el(id) { return document.getElementById(id); }

  function status(msg, cls) {
    var e = el("cut-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function fmt(sec) {
    // once onda birlige yuvarla, sonra bol: 59.97 -> "1:00.0", "0:60.0" degil
    var t = Math.round(sec * 10) / 10;
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }

  function refreshButton() {
    var ctx = KApp.ctx();
    // Uygula sürerken de meşgul: "Sessizlikleri bul" kapalı, "Uygulanıyor…" silinmez, Uygula yeniden açılmaz
    var mesgul = busy || uygulaniyor;
    el("cut-analyze").disabled = mesgul || !ctx.sel;
    if (ctx.connected && !ctx.sel && !mesgul) status("Timeline'da bir klip seç.");
    else if (!mesgul) {
      /*
       * Uyarı/hata mesajına DOKUNMA: analyze'ın finally'si setBusy(false) →
       * buraya geliyor ve eski kod status("") ile hatayı daha kullanıcı
       * okuyamadan siliyordu — "tıklıyorum, hiçbir şey olmuyor" bunun sonucu.
       */
      var e = el("cut-status");
      if (!/warn|bad/.test(e.className)) status("");
    }
    // iş bitti: "Kesimleri uygula" meşgulken kapalıydı (updateSummary busy'ye bakar), yeniden aç
    if (!mesgul && clip && !el("cut-result").hidden) updateSummary();
  }

  /* ---------------- Analiz ---------------- */

  function parseSilence(stderr) {
    var out = [];
    var lines = stderr.split(/\r?\n/);
    var pending = null;
    for (var i = 0; i < lines.length; i++) {
      var mStart = lines[i].match(/silence_start:\s*(-?[\d.]+)/);
      if (mStart) { pending = parseFloat(mStart[1]); continue; }
      var mEnd = lines[i].match(/silence_end:\s*([\d.]+)/);
      if (mEnd && pending !== null) {
        out.push({ start: Math.max(0, pending), end: parseFloat(mEnd[1]) });
        pending = null;
      }
    }
    return out;
  }

  // Kaydırıcıların anlık değerleri (dur: klibin kaynak süresi)
  function ayarlar() {
    return {
      noise: el("cut-noise").value,
      esik: parseFloat(el("cut-noise").value),
      minSil: parseFloat(el("cut-minsil").value),
      pad: parseFloat(el("cut-pad").value),
      minKeep: el("cut-minkeep") ? parseFloat(el("cut-minkeep").value) || 0 : 0,
      dur: clip ? clip.outPoint - clip.inPoint : 0
    };
  }

  function kesimAyari(a) {
    return { win: S.PENCERE, esik: a.esik, minSessizlik: a.minSil, pay: a.pad, minKonusma: a.minKeep,
      minKesim: 0.25, kenar: 0.05, sure: a.dur };
  }

  // Klip-göreli kesimler → sequence zamanı
  function sekansaCevir(sonuc) {
    var offset = clip.clipStart;
    adalar = sonuc.adalar.map(function (a) { return { start: offset + a.start, end: offset + a.end }; });
    return sonuc.kesimler.map(function (k) {
      var r = { start: offset + k.start, end: offset + k.end, keep: true };
      if (k.birlesik) { r.birlesik = true; r.adaSayisi = k.adaSayisi; }
      return r;
    });
  }

  /*
   * ffmpeg silencedetect (eski akış ve Uygula'daki doğrulama aynı çağrıyı kullanır). Önce zarfla aynı
   * zaman süzgeci (S.ZAMAN_SUZGECI): ses akışı geç başlıyorsa (baştaki boşluk) ya da PTS boşluğu varsa
   * ikisi de onu sessizlik sayar, aynı eksende ölçer. Kaymasız dosyada sonuç 3.3'le aynıdır.
   */
  function sessizlikBul(ff, a, jeton) {
    return K.run(ff, [
      "-hide_banner",
      "-ss", String(clip.inPoint),
      "-t", String(a.dur),
      "-i", clip.mediaPath,
      "-map", "0:a:0?",
      "-af", S.ZAMAN_SUZGECI + ",silencedetect=noise=" + a.noise + "dB:d=" + a.minSil,
      "-f", "null", "-"
    ], { timeout: Math.max(300000, a.dur * 2000), iptal: jeton });
  }

  function sdAnahtar(a) { return sonAnahtar + "|" + a.noise + "|" + a.minSil; }

  /*
   * Tek çözümleme: s16le, özgün örnekleme hızı ve kanal sayısı, pipe:1 → tepe zarfı (saniyede 100
   * değer, geçici dosya yok, süre sınırı yok). Hız silencedetect'inkiyle aynı kalır (16 kHz'e inmez:
   * tıslamalı kayıtta önizleme doğrulamadan ~6 dB alçak ölçüyordu). Kanal sayısı ve hız stderr'deki
   * "Output #0" satırından okunur; okunana dek gelen parçalar bekletilir (en çok 16 MB, sonra
   * vazgeçilir → eski akış).
   * Döner: { zarf } | { iptal: true } | { neden }
   */
  async function zarfCikar(ff, a, jeton) {
    var st = S.tepeZarfi(), kanal = 0, sr = 0, stderr = "", bekleyen = [], bekleyenBayt = 0, vazgec = false;
    var yerel = K.iptalJetonu();
    var birak = jeton && jeton.dinle ? jeton.dinle(function () { yerel.iptal(); }) : null;
    function besle(b) { S.zarfBesle(st, b, { kanal: kanal, sr: sr, win: S.PENCERE }); }
    function bilgiOku(s) { var b = S.cikisBilgisi(s); kanal = b.kanal; sr = b.sr; }
    var res;
    try {
      res = await K.runAkis(ff, S.cozumlemeArgs(clip.mediaPath, clip.inPoint, a.dur), {
        timeout: Math.max(300000, a.dur * 2000), iptal: yerel,
        onStderr: function (s) {
          if (kanal) return;
          stderr += s;
          bilgiOku(stderr);
          if (kanal) { bekleyen.forEach(besle); bekleyen = []; bekleyenBayt = 0; }
        },
        onData: function (b) {
          if (kanal) { besle(b); return; }
          bekleyen.push(b); bekleyenBayt += b.length;
          if (bekleyenBayt > 16 * 1024 * 1024) { vazgec = true; bekleyen = []; yerel.iptal(); }
        }
      });
    } finally {
      if (birak) birak();
    }
    if (jeton && jeton.iptalEdildi) return { iptal: true };
    if (vazgec) return { neden: "no channel count" };
    if (!res || res.code !== 0) return { neden: "kod " + (res ? res.code : "?") + (res && res.hata ? " " + res.hata : "") };
    if (!kanal) {
      bilgiOku(res.stderr || "");
      if (!kanal) return { neden: "no channel count" };
      bekleyen.forEach(besle);
    }
    var z = S.zarfBitir(st);
    if (!z.length) return { neden: "no audio stream" };
    K.log("[kesim] zarf: " + z.length + " pencere, " + kanal + " kanal, " + sr + " Hz, " + res.bayt + " bayt");
    return { zarf: z };
  }

  async function analyze(ev) {
    // kapıdan ÖNCE: başıboş ikinci tık deneme penceresi de açmasın (Pro "yeniden" olay taşımaz, geçer)
    if (K.baslatTikiGecerli && !K.baslatTikiGecerli(ev, baslatAcilis)) return;
    // Pro: otomatik kesim (ucretsizde 3 deneme hakki; hak yalniz kesim uygulaninca duser)
    if (typeof Pro !== "undefined" && !Pro.gate("cut", { deneme: true, yeniden: analyze })) return;
    if (busy || uygulaniyor) return;
    sesiKapat();
    clip = KApp.ctx().sel;
    if (!clip) { status("Önce bir klip seç.", "warn"); return; }
    var benimKlip = clip;
    /*
     * Başka klip (ya da aynı klibin in/out'u kaydı): önceki analizin HİÇBİR parçası taşınmaz — kararlar,
     * zarf, ham silencedetect aralıkları ve ekrandaki sonuç. İlk await'ten ÖNCE: İptal / hata eski klibin
     * sesini yeni klibin in/out'uyla eşleştirilmiş halde bırakmasın. Aynı klipte iptal edilen yeniden
     * analizde önceki sonuç ekranda kalır.
     */
    var anahtar = S.anahtar(clip.mediaPath, clip.inPoint, clip.outPoint - clip.inPoint);
    if (anahtar !== sonAnahtar) {
      ranges = []; adalar = []; kapatilanlar = [];
      zarf = null; hamSessizlik = null; farkUyarisi = false;
      el("cut-result").hidden = true;
      render();   // çubuk / liste / özet boşalır, "Kesimleri uygula" kapanır
    }
    sonAnahtar = anahtar;
    busy = true;
    iptalJetonu = K.iptalJetonu ? K.iptalJetonu() : null;
    var jeton = iptalJetonu;
    setBusy(true);
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");
      if (jeton && jeton.iptalEdildi) { status("İptal edildi.", "warn"); return; }

      var a = ayarlar();
      var dur = a.dur, noise = a.noise;

      // 3.4: tek çözümleme → canlı eşik. Önbellekte varsa ffmpeg hiç çalışmaz.
      var z = zarfOnbellek.al(anahtar);
      if (!z && K.runAkis) {
        status("Ses çözümleniyor… (" + dur.toFixed(0) + " sn)");
        var c = await zarfCikar(ff, a, jeton);
        if (c.iptal) { status("İptal edildi.", "warn"); return; }
        if (clip !== benimKlip) return;   // analiz sürerken seçim değişti
        if (c.zarf) { z = c.zarf; zarfOnbellek.koy(anahtar, z); }
        else K.log("[kesim] PCM cozumleme olmadi (" + c.neden + "): silencedetect akisina donuluyor");
      }
      if (z) {
        zarf = z; hamSessizlik = null;
        el("cut-result").hidden = false;
        yenidenHesapla();
        if (ranges.length) KApp.toast(ranges.length + " kesim önerisi bulundu", "good");
        return;
      }
      zarf = null;

      status("Ses analiz ediliyor… (" + dur.toFixed(0) + " sn)");
      var res = await sessizlikBul(ff, a, jeton);
      // kullanıcı iptal etti: yarım sonucu öneri diye gösterme, önceki analiz ekranda kalır
      if (res.iptal) { status("İptal edildi.", "warn"); return; }
      if (clip !== benimKlip) return;
      var sil = parseSilence(res.stderr || "");
      K.log("[kesim] ffmpeg kod=" + res.code + " ham aralik=" + sil.length +
        " sure=" + dur.toFixed(1) + " esik=" + noise + "dB");
      /*
       * ffmpeg hata verdiyse (ses akışı yok, dosya okunamadı, codec eksik…)
       * bunu "duraksama yok" diye yutma — eski davranış kullanıcıyı eşikle
       * boğuşturuyordu, oysa sorun bambaşkaydı.
       */
      if (sil.length === 0 && res.code !== 0) {
        throw new Error("ses analizi başarısız: " +
          String(res.stderr || "").split("\n").filter(function (s) { return s.trim(); })
            .slice(-2).join(" ").slice(0, 180));
      }

      // tampon, 0.25 sn alt sınırı, Min. konuşma birleştirmesi ve kenar kırpması: SufloSessizlik (zarfla aynı kurallar)
      hamSessizlik = { liste: sil, noise: noise, minSil: a.minSil };
      if (res.code === 0) sdOnbellek[sdAnahtar(a)] = sil;
      ranges = S.kararEsle(kapatilanlar, sekansaCevir(S.kesimlereCevir(sil, kesimAyari(a))));

      if (ranges.length === 0) {
        el("cut-result").hidden = true;
        status("Bu eşikte duraksama yok — eşiği yükselt (-30 dB) ya da min. süreyi düşür.", "warn");
        return;
      }

      /*
       * ffmpeg hatayla bitti ama yine de aralik bulduysa (zaman asimi, yarim
       * okuma…) sonuc klibin yalnizca bir kismini kapsiyor olabilir. Bunu tam
       * sonucmus gibi sunmak, kullanicinin klibin sonundaki sessizlikleri
       * gozden kacirmasina yol acar — acikca soyle.
       */
      var kismi = res.code !== 0 && sil.length > 0;
      if (kismi) {
        status("⚠ Analiz tamamlanamadı — öneriler klibin yalnız bir kısmını kapsıyor olabilir. Tekrar dene.", "warn");
      } else {
        status("");
      }
      el("cut-result").hidden = false;
      render();
      KApp.toast(ranges.length + " kesim önerisi bulundu", kismi ? "warn" : "good");
    } catch (e) {
      status("✕ " + e.message, "bad");
    } finally {
      busy = false;
      iptalJetonu = null;
      setBusy(false);
    }
  }

  function setBusy(b) {
    el("cut-analyze").classList.toggle("busy", b);
    el("cut-progress").hidden = !b;
    // analiz sürerken "Sessizlikleri bul" yerine "İptal"
    var iptal = el("cut-cancel");
    if (iptal) {
      el("cut-analyze").hidden = b;
      iptal.hidden = !b;
      iptal.disabled = false;
    }
    iptalAcilis = b ? Date.now() : 0;
    baslatAcilis = b ? 0 : Date.now();
    if (!b) refreshButton();
  }

  function iptalEt(ev) {
    if (!busy || !iptalJetonu) return;
    if (K.iptalTikiGecerli && !K.iptalTikiGecerli(ev, iptalAcilis)) return;
    el("cut-cancel").disabled = true;
    iptalJetonu.iptal();
  }

  /* ---------------- Canlı eşik (3.4) ---------------- */

  var BOS_UYARI = "Bu eşikte duraksama yok — eşiği yükselt (-30 dB) ya da min. süreyi düşür.";
  var ESKI_UYARI = "Eşik ve min. sessizlik bu klipte canlı güncellenemiyor: Sessizlikleri bul ile yenile.";

  /*
   * Kaydırıcı değişti: zarf varsa bul() ile harita yeniden kurulur (ffmpeg yok); eski akışta yalnız
   * Tampon ve Min. konuşma canlıdır (ham silencedetect aralıkları üzerinden). Yeni aralıklar bir önceki
   * kümeyle değil, kullanıcının karar listesiyle (kapatilanlar) eşlenir: aradaki konumlarda karar kaybolmaz.
   */
  function yenidenHesapla() {
    if (!clip || !S) return;
    // Uygula sürerken harita değişmez (uygulanan küme ekranda kalır); kilit açılınca yeni ayarla kurulur
    if (uygulaniyor) { canliBekliyor = true; return; }
    var a = ayarlar(), sonuc;
    if (zarf) sonuc = S.bul(zarf, kesimAyari(a));
    else if (hamSessizlik) sonuc = S.kesimlereCevir(hamSessizlik.liste, kesimAyari(a));
    else return;
    ranges = S.kararEsle(kapatilanlar, sekansaCevir(sonuc));
    var e = el("cut-status");
    // "doğrulama kesimleri değiştirdi" uyarısı doğrulanmış haritayı anlatıyordu; harita artık önizleme
    var farkVardi = farkUyarisi;
    farkUyarisi = false;
    if (zarf && ranges.length === 0) status(BOS_UYARI, "warn");
    else if (!zarf && (String(a.noise) !== String(hamSessizlik.noise) || a.minSil !== hamSessizlik.minSil)) status(ESKI_UYARI, "warn");
    else if (farkVardi || e.textContent === BOS_UYARI || e.textContent === ESKI_UYARI ||
      (window.SufloI18n && SufloI18n.orig && (SufloI18n.orig(e) === BOS_UYARI || SufloI18n.orig(e) === ESKI_UYARI))) status("");
    // eski akışta "duraksama yok" sonucu gizlemişti; Tampon / Min. konuşma kesim çıkarınca geri gelsin
    if (ranges.length) el("cut-result").hidden = false;
    render();
  }

  // Kaydırıcı 'input' olayları ~100 ms'de bir toplanır (sürüklerken her piksel yeniden çizmesin)
  function canliGuncelle() {
    if (canliZaman) clearTimeout(canliZaman);
    canliZaman = setTimeout(function () {
      canliZaman = null;
      if (uygulaniyor) { canliBekliyor = true; return; }
      if (busy) return;
      yenidenHesapla();
    }, CANLI_MS);
  }

  // "Otomatik": eşiği klibin kendi zarfından öner (arka plan p10 + 8 dB); düşük SNR'de uyar
  function otomatikEsik() {
    if (uygulaniyor) return;   // Uygula sürerken eşik ve harita değişmez
    if (!zarf) {
      status("Önce Sessizlikleri bul: otomatik eşik klibin kendi sesinden ölçülür.", "warn");
      return;
    }
    var o = S.esikOner(zarf);
    if (!o) return;
    var inp = el("cut-noise");
    inp.value = String(o.esik);
    el("cut-noise-val").textContent = inp.value + " dB";
    if (canliZaman) { clearTimeout(canliZaman); canliZaman = null; }
    yenidenHesapla();
    if (o.dusukSnr) {
      status("⚠ Konuşma ile arka plan gürültüsü arasındaki fark az (" + Math.round(o.konusma - o.taban) +
        " dB): kesimler kelime kırpabilir ya da sessizlik kaçırabilir. Önce Sesi iyileştir'i dene ya da eşiği elle ayarla.", "warn");
    } else {
      status("Otomatik eşik: " + o.esik + " dB (arka plan " + Math.round(o.taban) + " dB, konuşma " + Math.round(o.konusma) + " dB)");
    }
  }

  /* ---------------- Görselleştirme ---------------- */

  function activeRanges() {
    return ranges.filter(function (r) { return r.keep; });
  }

  function render() {
    renderBar();
    renderWave();
    renderList();
    updateSummary();
  }

  /*
   * Kullanıcı bir kesimi açtı / kapattı (çubuk ya da liste): karar listesine yazılır, ekrandaki küme de
   * listeyle yeniden eşlenir (sonraki kaydırıcı hareketinin göstereceğiyle aynı görünsün).
   */
  function kararVer(r, keep) {
    // Uygula sürerken karar değişmez; liste onay kutusu tıklamayla değişmişse eski haline çizilir
    if (uygulaniyor) { render(); return; }
    kapatilanlar = S.kararYaz(kapatilanlar, r, keep, ranges);
    r.keep = keep;
    ranges = S.kararEsle(kapatilanlar, ranges);
    render();
  }

  // Bir kesimin içine düşen Min. konuşma adaları (taralı gösterilir)
  function kesimAdalari(r) {
    return adalar.filter(function (a) { return a.start >= r.start - 1e-6 && a.end <= r.end + 1e-6; });
  }

  function renderBar() {
    var bar = el("cut-bar");
    bar.innerHTML = "";
    if (!clip) return;
    var t0 = clip.clipStart, t1 = clip.clipEnd;
    var total = t1 - t0;
    if (total <= 0) return;
    var pos = t0;
    ranges.forEach(function (r, i) {
      if (r.start > pos) {
        var keep = document.createElement("span");
        keep.className = "keep";
        keep.style.width = ((r.start - pos) / total * 100) + "%";
        bar.appendChild(keep);
      }
      var baslik = fmt(r.start - t0) + " · −" + (r.end - r.start).toFixed(2) + " sn" +
        (r.birlesik ? " · kısa konuşma birleştirildi" : "") + (r.keep ? "" : " (kapalı)");
      var ic = r.birlesik ? kesimAdalari(r) : [];
      if (!ic.length) {
        var cut = document.createElement("span");
        cut.className = "cut" + (r.keep ? "" : " off");
        cut.style.width = ((r.end - r.start) / total * 100) + "%";
        cut.title = baslik;
        cut.onclick = function () { kararVer(r, !r.keep); };
        bar.appendChild(cut);
      } else {
        // birleşik kesim: sessiz parçalar düz, araya giren kısa konuşma adaları taralı (hepsi aynı aralığı açıp kapatır)
        var p = r.start, parcalar = [];
        ic.forEach(function (a) {
          if (a.start > p) parcalar.push({ s: p, e: a.start, ada: false });
          parcalar.push({ s: a.start, e: a.end, ada: true });
          p = a.end;
        });
        if (p < r.end) parcalar.push({ s: p, e: r.end, ada: false });
        parcalar.forEach(function (pc) {
          var sp = document.createElement("span");
          sp.className = "cut parca" + (pc.ada ? " ada" : "") + (r.keep ? "" : " off");
          sp.style.width = ((pc.e - pc.s) / total * 100) + "%";
          var adaSn = (pc.e - pc.s).toFixed(2);
          sp.title = pc.ada ? "Kısa konuşma (" + adaSn + " sn) — Min. konuşma nedeniyle kesime katıldı" + (r.keep ? "" : " (kapalı)") : baslik;
          sp.onclick = function () { kararVer(r, !r.keep); };
          bar.appendChild(sp);
        });
      }
      pos = r.end;
    });
    if (pos < t1) {
      var tail = document.createElement("span");
      tail.className = "keep";
      tail.style.width = ((t1 - pos) / total * 100) + "%";
      bar.appendChild(tail);
    }
  }

  /*
   * #cut-wave: tepe zarfı (sütun başına min/max), kesim bölgeleri, taralı Min. konuşma adaları ve
   * kesikli eşik çizgisi. Yalnız zarf varken görünür (eski silencedetect akışında zarf yok).
   */
  var DB_ALT = -70;
  function renderWave() {
    var cv = el("cut-wave");
    if (!cv) return;
    if (!zarf || !clip || !S) { cv.hidden = true; return; }
    cv.hidden = false;
    var g = cv.getContext ? cv.getContext("2d") : null;
    if (!g) return;
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round((cv.clientWidth || 320) * dpr));
    var h = Math.max(1, Math.round((cv.clientHeight || 56) * dpr));
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    g.clearRect(0, 0, w, h);
    var t0 = clip.clipStart, total = clip.clipEnd - clip.clipStart;
    if (!(total > 0)) return;
    function y(db) {
      var t = (Math.max(DB_ALT, Math.min(0, db)) - DB_ALT) / -DB_ALT;
      return h - t * h;
    }
    function x(t) { return (t - t0) / total * w; }
    // kesim bölgeleri
    ranges.forEach(function (r) {
      g.fillStyle = r.keep ? "rgba(114,124,255,.22)" : "rgba(255,255,255,.05)";
      g.fillRect(x(r.start), 0, Math.max(1, x(r.end) - x(r.start)), h);
    });
    // Min. konuşma adaları: taralı
    adalar.forEach(function (a) {
      var x0 = x(a.start), aw = Math.max(1, x(a.end) - x0);
      g.save();
      g.beginPath(); g.rect(x0, 0, aw, h); g.clip();
      g.strokeStyle = "rgba(234,200,119,.75)"; g.lineWidth = dpr;
      g.beginPath();
      for (var k = x0 - h; k < x0 + aw; k += 5 * dpr) { g.moveTo(k, h); g.lineTo(k + h, 0); }
      g.stroke();
      g.restore();
    });
    // zarf (zarf klibin kaynak süresini kapsar; tuval de klibin timeline süresini)
    var ciftler = S.kucult(zarf, w), sw = w / Math.max(1, ciftler.length);
    g.fillStyle = "rgba(203,210,255,.85)";
    for (var i = 0; i < ciftler.length; i++) {
      var yt = y(ciftler[i][1]), yb = y(ciftler[i][0]);
      g.fillRect(i * sw, yt, Math.max(1, sw), Math.max(dpr, yb - yt));
    }
    // eşik çizgisi (kesikli)
    var ye = Math.round(y(ayarlar().esik)) + 0.5;
    g.save();
    if (g.setLineDash) g.setLineDash([4 * dpr, 3 * dpr]);
    g.strokeStyle = "#eac877"; g.lineWidth = dpr;
    g.beginPath(); g.moveTo(0, ye); g.lineTo(w, ye); g.stroke();
    g.restore();
  }

  function renderList() {
    var box = el("cut-ranges");
    box.innerHTML = "";
    ranges.forEach(function (r, i) {
      var row = document.createElement("div");
      row.className = "seg cut-seg" + (r.keep ? "" : " off");

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = r.keep;
      cb.onchange = function () { kararVer(r, cb.checked); };

      var t = document.createElement("span");
      t.className = "seg-time mono";
      t.textContent = fmt(r.start - clip.clipStart);

      var d = document.createElement("span");
      d.className = "mc-cut-length";
      d.textContent = "−" + (r.end - r.start).toFixed(2) + " sn";

      row.appendChild(cb); row.appendChild(t); row.appendChild(d);
      if (r.birlesik) {
        var b = document.createElement("span");
        b.className = "mc-birlesik";
        // #cut-ranges kullanıcı içeriği kabı (i18n): rozet arayüz metni, adacık olarak işaretle
        b.setAttribute("data-i18n-ui", "");
        b.textContent = "birleşik";
        b.title = "Min. konuşma: araya giren kısa konuşma da bu kesime katıldı";
        row.appendChild(b);
      }
      box.appendChild(row);
    });
  }

  function updateSummary() {
    var act = activeRanges();
    var saved = act.reduce(function (a, r) { return a + (r.end - r.start); }, 0);
    var dur = clip ? (clip.outPoint - clip.inPoint) : 0;
    var birlesik = act.filter(function (r) { return r.birlesik; }).length;
    el("cut-summary").textContent = act.length + " kesim · −" + saved.toFixed(1) + " sn" +
      (dur > 0 ? " (%" + (saved / dur * 100).toFixed(0) + ")" : "") +
      (birlesik ? " · " + birlesik + " birleşik" : "");
    el("cut-apply").disabled = act.length === 0 || busy || uygulaniyor;
  }

  // Eski akışın ham silencedetect aralıkları ekrandaki ayarla (eşik + min. sessizlik) koşmuşsa onlar
  // (ffmpeg hatayla bitip yarım sonuç verdiyse de: kısmi uyarısıyla gösterilen buydu, 3.3 de bunu uygulardı)
  function hamGecerli(a) {
    if (!hamSessizlik) return null;
    return String(hamSessizlik.noise) === String(a.noise) && hamSessizlik.minSil === a.minSil ? hamSessizlik.liste : null;
  }

  /*
   * Uygula öncesi doğrulama (3.4): ffmpeg silencedetect son ayarlarla BİR KEZ koşar (eski akışla
   * birebir aynı kesimler); kullanıcının kararları (kapatilanlar) kararEsle ile eşlenir. Aynı ayarla
   * zaten koştuysa (önbellek ya da eski akışın ham aralıkları) yeniden koşmaz. Döner: aralıklar | null
   * (iptal / hata, durum yazıldı). Doğrulama ffmpeg hatasıyla biterse önizlemedeki (zarf) aralıklar
   * kullanılır ve günlüğe yazılır.
   */
  async function kesimleriDogrula() {
    var a = ayarlar(), benimKlip = clip;
    var ham = sdOnbellek[sdAnahtar(a)] || hamGecerli(a);
    if (!ham) {
      var ff = await K.findFfmpeg();
      if (!ff) { status("✕ ffmpeg bulunamadı — Ayarlar sekmesinden kur.", "bad"); return null; }
      busy = true;
      iptalJetonu = K.iptalJetonu ? K.iptalJetonu() : null;
      var jeton = iptalJetonu;
      setBusy(true);
      try {
        status("Kesimler doğrulanıyor… (" + a.dur.toFixed(0) + " sn)");
        var res = await sessizlikBul(ff, a, jeton);
        if (res.iptal) { status("İptal edildi.", "warn"); return null; }
        if (clip !== benimKlip) return null;
        var sil = parseSilence(res.stderr || "");
        K.log("[kesim] dogrulama ffmpeg kod=" + res.code + " ham aralik=" + sil.length + " esik=" + a.noise + "dB");
        if (res.code !== 0) {
          if (zarf) {
            K.log("[kesim] dogrulama tamamlanamadi: onizlemedeki kesimler uygulaniyor");
            return ranges.slice();
          }
          throw new Error("ses analizi başarısız: " +
            String(res.stderr || "").split("\n").filter(function (s) { return s.trim(); }).slice(-2).join(" ").slice(0, 180));
        }
        ham = sil;
        sdOnbellek[sdAnahtar(a)] = sil;
      } catch (e) {
        status("✕ " + e.message, "bad");
        return null;
      } finally {
        busy = false;
        iptalJetonu = null;
        setBusy(false);
      }
    }
    if (!clip || clip !== benimKlip) return null;
    var eslenmis = S.kararEsle(kapatilanlar, sekansaCevir(S.kesimlereCevir(ham, kesimAyari(a))));
    K.log("[kesim] dogrulama: onizleme=" + ranges.length + " silencedetect=" + eslenmis.length);
    ranges = eslenmis;
    render();
    return ranges;
  }

  /* ---------------- Uygulama ---------------- */

  async function apply() {
    if (typeof Pro !== "undefined" && !Pro.gate("cut", { deneme: true, yeniden: apply })) return; // Pro: otomatik kesim
    if (busy || uygulaniyor || !clip || activeRanges().length === 0) return;
    /*
     * Doğrulamadan KS_applyCuts dönene dek kilitli (uygulaniyor): kaydırıcı, Otomatik, kesim tıklaması ve
     * bağlam değişimi haritayı değiştirip "Kesimleri uygula"yı yeniden açamaz; ikinci tık geri döner.
     */
    uygulaniyor = true;
    el("cut-apply").disabled = true;
    var r = null;
    try {
      sesiKapat();
      farkUyarisi = false;
      var sade = function (k) { return { start: k.start, end: k.end }; };
      // 3.4: önizleme zarftan; uygulanan kesimler silencedetect doğrulamasından
      var onizleme = activeRanges().map(sade);
      var dogru = await kesimleriDogrula();
      if (!dogru) return;
      var act = dogru.filter(function (k) { return k.keep; }).map(sade);
      if (act.length === 0) {
        status("Doğrulamadan sonra uygulanacak kesim kalmadı — eşiği ya da min. sessizliği değiştir.", "warn");
        return;
      }
      /*
       * Doğrulama önizlemeden (dinlenen / haritada görülen) farklı kesim verdiyse sormadan uygulama:
       * doğrulanmış küme haritada (kesimleriDogrula çizdi), kullanıcı kontrol edip yeniden Uygula'ya basar;
       * ikinci tık doğrulama önbelleğinden gelir, ffmpeg yeniden koşmaz. (Sayı farkı ya da > 50 ms kenar kayması.)
       */
      if (!S.kesimlerAyni(onizleme, act)) {
        K.log("[kesim] dogrulama onizlemeden farkli: onizleme=" + onizleme.length + " dogrulama=" + act.length + " — uygulanmadi");
        status("Doğrulama kesimleri değiştirdi (önizleme " + onizleme.length + " kesim, doğrulama " + act.length +
          " kesim): haritayı kontrol et, sonra yeniden Kesimleri uygula.", "warn");
        farkUyarisi = true;
        return;
      }
      status("Uygulanıyor…");
      var mode = target === "clone" ? "ripple" : el("cut-mode").value;
      // Yuzlerce kesim uygulamak uzun surebilir: zaman asimini genis tut
      r = await K.call("KS_applyCuts", {
        ranges: act,
        removeMode: mode,
        cloneFirst: target === "clone"
      }, 900000);
      if (r.ok) {
        if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("cut", KApp.toast);   // deneme: yalniz basarida
        /*
         * Timeline değişti: önbellekler VE canlı analiz bayat. Zarf / ham aralıklar / harita bırakılır,
         * sonuç gizlenir, "Kesimleri uygula" yeni analize dek kapalı kalır: kaydırıcılar ve Otomatik
         * Uygula'dan önceki çözümlemeden taze görünümlü bir harita kurup eski konumlara ikinci kez
         * kesim uygulatamaz (ripple'dan sonra konuşma silerdi).
         */
        onbellekleriBosalt();
        analiziBirak();
        status("");
        var msg = r.newSeq
          ? "✂ Kopya sekansta uygulandı: " + r.newSeq
          : "✂ " + r.removed + " parça silindi" + (r.selected ? ", " + r.selected + " parça seçildi" : "");
        if (mode === "select") msg = "✂ Kesildi ve seçildi — silmek istersen Shift+Delete";
        if (r.rippleFallback) {
          // host, senkron kaybini onlemek icin ripple'i bosluk moduna dusurdu
          status("⚠ Bazı track'ler aralığı tam kaplamıyor — senkron bozulmasın diye kesimler boşluk bırakılarak silindi.", "warn");
          KApp.toast(msg + " (boşluk modunda)", "warn");
        } else {
          KApp.toast(msg, "good");
        }
        // ilk uygulanan kesim: davet seridinin anlarindan biri (mesgulken/yildiz seridi acikken cikmaz)
        if (KApp.davetAni) KApp.davetAni("cut");
      }
    } finally {
      kilidiAc();
    }
    // hata kilit açıldıktan sonra yazılır (bekleyen kaydırıcı haritayı yeniden kursa da silinmesin)
    if (r && !r.ok) status("✕ " + r.error, "bad");
  }

  /*
   * Kilit açılır: bekleyen kaydırıcı değişimi varsa harita yeni ayarla kurulur (Uygula başarısız / fark /
   * iptal); "Sessizlikleri bul" ve (sonuç görünürse) "Kesimleri uygula" yeniden açılır. Süreç satırı
   * ("Kesimler doğrulanıyor…", "Uygulanıyor…") kalmaz; uyarı ve hata (ör. boşluk modu) silinmez.
   */
  function kilidiAc() {
    if (!uygulaniyor) return;
    uygulaniyor = false;
    var bekleyen = canliBekliyor;
    canliBekliyor = false;
    if (bekleyen && clip && (zarf || hamSessizlik)) yenidenHesapla();
    var ctx = KApp.ctx(), e = el("cut-status");
    el("cut-analyze").disabled = busy || !ctx.sel;
    if (!/warn|bad/.test(e.className)) status(ctx.connected && !ctx.sel ? "Timeline'da bir klip seç." : "");
    if (clip && !el("cut-result").hidden) updateSummary();
  }

  // Canlı analizi bırak (Uygula'dan sonra): bir sonraki "Sessizlikleri bul" baştan çözümler
  function analiziBirak() {
    if (canliZaman) { clearTimeout(canliZaman); canliZaman = null; }
    canliBekliyor = false;
    zarf = null;
    hamSessizlik = null;
    ranges = [];
    adalar = [];
    kapatilanlar = [];
    farkUyarisi = false;
    clip = null;
    el("cut-result").hidden = true;
    render();   // çubuk / liste / dalga boşalır, "Kesimleri uygula" kapanır
  }

  /* ---------------- Dinle (önizleme) ---------------- */

  // Kesimler uygulanmis gibi sesi panelde cal (ortak oynatici: js/dinle.js)
  var oynatici = window.KDinle ? window.KDinle("cut-audio") : null;
  function sesiKapat() { if (oynatici) oynatici.kapat(); }

  async function dinle() {
    if (!clip || !window.SufloTextCut || !oynatici) return;
    var btn = el("cut-dinle");
    btn.disabled = true;
    // özgün Türkçe etiket: iş sürerken arayüz dili değişse de doğru dile döner (çevirmen çevirir)
    var eski = window.SufloI18n && SufloI18n.orig ? SufloI18n.orig(btn) : btn.textContent;
    btn.textContent = "Hazırlanıyor…";
    var benimKlip = clip;
    try {
      var dur = clip.outPoint - clip.inPoint;
      var r = await oynatici.cal({
        mediaPath: clip.mediaPath, inPoint: clip.inPoint, dur: dur, cuts: activeRanges(),
        clip: { clipStart: clip.clipStart, clipEnd: clip.clipEnd, dur: dur },
        gecerli: function () { return clip === benimKlip; }
      });
      if (r.ok && r.kisaltildi) status("Uzun klip: ilk " + Math.round(oynatici.MAX_SN / 60) + " dakika dinletiliyor.");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      btn.disabled = false;
      btn.textContent = eski;
    }
  }

  /* ---------------- Başlat ---------------- */

  function init() {
    function bindRange(id, valId, suffix) {
      var inp = el(id), out = el(valId);
      inp.addEventListener("input", function () { out.textContent = inp.value + suffix; });
    }
    bindRange("cut-noise", "cut-noise-val", " dB");
    bindRange("cut-minsil", "cut-minsil-val", " sn");
    bindRange("cut-pad", "cut-pad-val", " sn");
    if (el("cut-minkeep")) bindRange("cut-minkeep", "cut-minkeep-val", " sn");
    // 3.4 canlı eşik: analizden sonra kaydırıcılar haritayı ffmpeg'siz günceller
    ["cut-noise", "cut-minsil", "cut-pad", "cut-minkeep"].forEach(function (id) {
      if (el(id)) el(id).addEventListener("input", canliGuncelle);
    });
    if (el("cut-noise-auto")) el("cut-noise-auto").addEventListener("click", otomatikEsik);
    // panel genişliği değişince dalga yeniden çizilsin (tuval piksel boyu)
    window.addEventListener("resize", function () { if (zarf && !el("cut-result").hidden) renderWave(); });

    Array.prototype.forEach.call(el("cut-target").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("cut-target").querySelectorAll("button"), function (x) {
          x.classList.remove("on");
        });
        b.classList.add("on");
        target = b.dataset.m;
        el("cut-here-row").hidden = target !== "here";
      });
    });

    el("cut-analyze").addEventListener("click", analyze);
    if (el("cut-cancel")) el("cut-cancel").addEventListener("click", iptalEt);
    el("cut-apply").addEventListener("click", apply);
    if (el("cut-dinle")) el("cut-dinle").addEventListener("click", dinle);

    KApp.onContext(function (ctx) {
      refreshButton();
      // seçim değiştiyse eski analiz geçersiz
      if (clip && (!ctx.sel || ctx.sel.mediaPath !== clip.mediaPath || ctx.sel.clipStart !== clip.clipStart)) {
        el("cut-result").hidden = true;
        sesiKapat();
        ranges = [];
        adalar = [];
        kapatilanlar = [];
        farkUyarisi = false;
        clip = null;
        // 3.4: klip değişti → zarf ve doğrulama önbelleği geçersiz
        zarf = null;
        hamSessizlik = null;
        onbellekleriBosalt();
      }
    });
    refreshButton();
  }

  function onbellekleriBosalt() {
    if (zarfOnbellek) zarfOnbellek.temizle();
    sdOnbellek = {};
    sonAnahtar = "";
  }

  return { init: init };
})();
