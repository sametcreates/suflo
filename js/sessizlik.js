/*
 * Suflo — Canlı eşikli sessizlik kesimi (3.4, Otomatik Kesim)
 *
 * Klibin sesi BİR KEZ çözülür (ffmpeg → s16le, özgün örnekleme hızı ve kanal sayısı, pipe:1) ve 10 ms'lik
 * pencerelerden bir TEPE zarfı (dBFS) çıkarılır. Eşik / Min. sessizlik / Tampon / Min. konuşma
 * kaydırıcıları bu zarf üzerinde bul() ile anında yeniden hesaplanır: ffmpeg her değişimde
 * yeniden çalışmaz. Uygula'da ffmpeg silencedetect son ayarlarla bir kez daha koşar (eski
 * akışla birebir aynı sonuç); kullanıcının kapattığı bölgeler ayrı bir karar listesinde (kararYaz)
 * tutulur, her yeni küme o listeyle eşlenir (kararEsle). Önizleme ile doğrulama farklıysa Uygula
 * önce farkı gösterir (kesimlerAyni).
 *
 * Zarf TEPE (en büyük |örnek|) değeridir, RMS DEĞİL: silencedetect de örnek genliğine bakar.
 * multicam.energyFromPcm RMS'tir; burada kullanılmaz. Örnekleme hızı DEĞİŞTİRİLMEZ: silencedetect de
 * dosyanın kendi hızındaki örneklere bakar. 16 kHz'e indirmek 8 kHz üstünü süzüp tıslama tabanını (ve 10 ms'de
 * bakılan örnek sayısını) düşürüyordu: gürültülü kayıtta zarf tabanı silencedetect'in gördüğünden ~6 dB alçak
 * kalıyor, önizlemenin gösterdiği kesimleri doğrulama atıyor, Otomatik eşik sessizlik bulunmayan yere düşüyordu.
 *
 * Saf (ES5, UMD): DOM'a, Premiere'e ve ffmpeg'e dokunmaz; Node'da test edilir (tests/test-sessizlik.js).
 * Clean-room: "canlı yeniden analiz + kısa konuşma birleştirme" fikri Premiere TR'den (MIT) esinlenir;
 * kod kopyalanmadı.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloSessizlik = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var TABAN = -120;     // dBFS: tam sessizlik (0 örnek) buraya kırpılır
  // zarfBesle'nin sr verilmezse varsaydığı hız. Panel gerçek hızı ffmpeg'in "Output #0" satırından okur
  // (cikisBilgisi); çözümleme özgün hızda yapılır, bu sabit ffmpeg'e GİTMEZ.
  var SR = 16000;
  var PENCERE = 0.01;   // sn: zarf penceresi (saniyede 100 değer)
  var TAM = 32768;      // s16 tam ölçek

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

  function dbfs(tepe) {
    if (!(tepe > 0)) return TABAN;
    var d = 20 * Math.log(tepe / TAM) / Math.LN10;
    return d < TABAN ? TABAN : d;
  }

  /* ---------------- ffmpeg argümanları ---------------- */

  /*
   * Tek çözümleme: özgün kanal sayısı korunur (-ac 1 YOK: tek taraflı bir mikrofon aşağı
   * karışımda 3–6 dB düşer ve eşiğin altına kayardı). Özgün örnekleme hızı korunur (-ar YOK:
   * silencedetect dosyanın kendi hızında ölçer; 16 kHz'e indirmek tıslamayı ~6 dB alçak gösteriyordu).
   * -map 0:a:0? : silencedetect'le aynı akış.
   *
   * ZAMAN EKSENİ: ham s16le zaman damgası taşımaz; zarf ilk çözülen örnekten başlardı. silencedetect
   * ise kare PTS'ini raporlar: ses akışının başlangıç kayması (video 0'da, ses 0.45 sn'de: OBS, ekran
   * kaydı, AVCHD/MTS) ve PTS boşlukları dahil. ZAMAN_SUZGECI baştaki kaymayı ve boşlukları sessizlikle
   * doldurur (first_pts=0; async: 10 ms'den büyük farkta örnek ekler / atar, esnetmez), zarf
   * silencedetect'le aynı eksende kalır. Panel Uygula'daki silencedetect'i de aynı süzgeçten geçirir
   * (magiccut sessizlikBul): baştaki doldurulmuş boşluğu ikisi de sessizlik sayar. Kaymasız dosyada
   * çıktı birebir aynıdır.
   */
  var ZAMAN_SUZGECI = "aresample=async=1:min_hard_comp=0.01:first_pts=0";
  function cozumlemeArgs(media, inPoint, dur) {
    return ["-hide_banner", "-nostdin", "-nostats",
      "-ss", String(num(inPoint, 0)), "-t", String(num(dur, 0)),
      "-i", String(media),
      "-map", "0:a:0?", "-vn", "-af", ZAMAN_SUZGECI, "-acodec", "pcm_s16le", "-f", "s16le", "pipe:1"];
  }

  // Çıkış akışının kanal sayısı ve örnekleme hızı ffmpeg'in stderr'indeki "Output #0" bölümünden okunur (bilinmiyorsa 0)
  var DUZEN = {
    "mono": 1, "stereo": 2, "downmix": 2, "2.1": 3, "3.0": 3, "3.0(back)": 3, "4.0": 4, "quad": 4, "quad(side)": 4,
    "3.1": 4, "5.0": 5, "5.0(side)": 5, "4.1": 5, "5.1": 6, "5.1(side)": 6, "6.0": 6, "6.0(front)": 6,
    "hexagonal": 6, "6.1": 7, "6.1(back)": 7, "6.1(front)": 7, "7.0": 7, "7.0(front)": 7, "7.1": 8,
    "7.1(wide)": 8, "7.1(wide-side)": 8, "7.1(top)": 8, "octagonal": 8, "hexadecagonal": 16, "22.2": 24
  };
  function kanalBul(parca, d, hz) {
    if (Object.prototype.hasOwnProperty.call(DUZEN, d)) return DUZEN[d];
    var n = d.match(/^(\d+)\s*channels?/);
    if (n) return parseInt(n[1], 10);
    // bilinmeyen düzen adı: s16 bit hızından (kanal başına sr × 16 bit)
    var b = parca.match(/Audio:\s*pcm_s16le[^\n]*?(\d+)\s*kb\/s/);
    if (b && hz > 0) {
      var k = Math.round(parseInt(b[1], 10) * 1000 / (hz * 16));
      if (k >= 1 && k <= 64) return k;
    }
    return 0;
  }
  /*
   * Döner: { kanal, sr }; okunamazsa ikisi de 0. Kanal ve hız aynı satırdan gelir: kanal okunduysa hız da
   * okunmuştur. Panel zarfı bu hızla besler (pencere = sr × 10 ms örnek): çözümleme özgün hızda yapılır.
   */
  function cikisBilgisi(stderr) {
    var s = String(stderr || "");
    var o = s.indexOf("Output #0");
    if (o === -1) return { kanal: 0, sr: 0 };
    var parca = s.slice(o);
    var m = parca.match(/Audio:\s*pcm_s16le[^,\n]*,\s*(\d+)\s*Hz,\s*([^,\n]+)/);
    if (!m) return { kanal: 0, sr: 0 };
    var hz = parseInt(m[1], 10);
    if (!(hz > 0)) return { kanal: 0, sr: 0 };
    var kanal = kanalBul(parca, m[2].replace(/^\s+|\s+$/g, "").toLowerCase(), hz);
    return kanal ? { kanal: kanal, sr: hz } : { kanal: 0, sr: 0 };
  }
  function kanalSayisi(stderr) { return cikisBilgisi(stderr).kanal; }

  /* ---------------- Tepe zarfı (artımlı) ---------------- */

  function tepeZarfi() {
    return { zarf: [], tepe: 0, n: 0, kalan: [], kanal: 0, adim: 0, boy: 0, bayt: 0 };
  }

  /*
   * k. pencerenin örnek sayısı. Sınırlar birikimli: k. pencere round((k + 1) × sr × win). örnekte biter (k 0'dan).
   * sr × win tam sayı değilse (22050 Hz → 220,5) pencereler 220 / 221 örnek olur ve zarf ekseni kaymaz
   * (sabit 221 örnekle 1 saatte ~8 sn kayardı).
   */
  function pencereBoyu(adim, k) { return Math.max(1, Math.round((k + 1) * adim) - Math.round(k * adim)); }

  /*
   * buf: s16le, kanallar iç içe (L R L R …) Buffer / Uint8Array parçası. Parça sınırında kalan
   * yarım örnek / yarım kare st.kalan'da bir sonraki parçaya taşınır. Her pencere TÜM kanallardaki
   * en büyük |örnek|; dBFS, -120'de kırpılır. o.sr akışın GERÇEK örnekleme hızı olmalı (cikisBilgisi).
   */
  function zarfBesle(st, buf, o) {
    o = o || {};
    var kanal = Math.max(1, Math.floor(num(o.kanal, 1)));
    var adim = Math.max(1, num(o.sr, SR) * num(o.win, PENCERE));
    if (!st.adim) { st.adim = adim; st.kanal = kanal; st.boy = pencereBoyu(adim, st.zarf.length); }
    else if (st.adim !== adim || st.kanal !== kanal) throw new Error("zarfBesle: channel count / window cannot change mid-stream");
    if (!buf || !buf.length) return st;
    var kb = 2 * kanal, L = buf.length, i = 0, c, v, m;
    var zarf = st.zarf;
    st.bayt += L;
    if (st.kalan.length) {
      while (st.kalan.length < kb && i < L) st.kalan.push(buf[i++]);
      if (st.kalan.length < kb) return st;
      m = st.tepe;
      for (c = 0; c < kb; c += 2) {
        v = st.kalan[c] | (st.kalan[c + 1] << 8);
        if (v >= 32768) v = 65536 - v;
        if (v > m) m = v;
      }
      st.tepe = m;
      st.kalan = [];
      if (++st.n >= st.boy) { zarf.push(dbfs(st.tepe)); st.tepe = 0; st.n = 0; st.boy = pencereBoyu(adim, zarf.length); }
    }
    var son = L - ((L - i) % kb);
    var n = st.n, boy = st.boy;
    m = st.tepe;
    for (; i < son; i += kb) {
      for (c = 0; c < kb; c += 2) {
        v = buf[i + c] | (buf[i + c + 1] << 8);
        if (v >= 32768) v = 65536 - v;   // |negatif örnek|; -32768 → 32768 (0 dBFS)
        if (v > m) m = v;
      }
      if (++n >= boy) { zarf.push(dbfs(m)); m = 0; n = 0; boy = pencereBoyu(adim, zarf.length); }
    }
    st.tepe = m; st.n = n; st.boy = boy;
    for (; i < L; i++) st.kalan.push(buf[i]);
    return st;
  }

  // Akış bitti: yarım pencere de zarfa girer (yarım kare baytları atılır). Zarfı döner.
  function zarfBitir(st) {
    if (st.n > 0) { st.zarf.push(dbfs(st.tepe)); st.tepe = 0; st.n = 0; }
    st.kalan = [];
    return st.zarf;
  }

  /* ---------------- Kesim haritası ---------------- */

  // Eşiğin altındaki (zarf < esik) pencere koşuları; minSessizlik ve üstü olanlar [{ start, end }] (sn)
  function sessizAraliklar(zarf, o) {
    o = o || {};
    var win = num(o.win, PENCERE), esik = num(o.esik, -38), minS = num(o.minSessizlik, 0.8);
    var n = zarf ? zarf.length : 0;
    var sure = num(o.sure, n * win);
    var out = [], bas = -1;
    for (var i = 0; i <= n; i++) {
      if (i < n && zarf[i] < esik) { if (bas < 0) bas = i; continue; }
      if (bas >= 0) {
        var s = bas * win, e = Math.min(i * win, sure);
        if (e - s >= minS - 1e-9) out.push({ start: s, end: e });
        bas = -1;
      }
    }
    return out;
  }

  /*
   * Ham sessizlikler (zarftan ya da silencedetect'ten) → kesimler. Sıra eski magiccut akışıyla aynı:
   * tampon (pay) içe → minKesim'den kısa kesim düşer → Min. konuşma birleştirmesi (aradaki konuşma
   * adası TAMPONDAN SONRA ölçülür) → [kenar, sure − kenar] kırpması. minKonusma 0 iken sonuç
   * 3.3'teki akışla birebir aynıdır.
   * Döner: { kesimler: [{ start, end, birlesik?, adaSayisi? }], adalar: [{ start, end }] }
   */
  function kesimlereCevir(ham, o) {
    o = o || {};
    var pay = num(o.pay, 0.15), minKesim = num(o.minKesim, 0.25), minKonusma = Math.max(0, num(o.minKonusma, 0));
    var kenar = num(o.kenar, 0.05), sure = num(o.sure, Infinity);
    var liste = (ham || []).filter(function (h) { return h && isFinite(h.start) && isFinite(h.end); })
      .slice().sort(function (a, b) { return a.start - b.start; });
    var dolgu = [];
    liste.forEach(function (h) {
      var s = h.start + pay, e = h.end - pay;
      if (e - s < minKesim) return;
      dolgu.push({ start: s, end: e });
    });
    var birlesmis = [], adalar = [];
    dolgu.forEach(function (k) {
      var onceki = birlesmis.length ? birlesmis[birlesmis.length - 1] : null;
      if (onceki && minKonusma > 0 && k.start - onceki.end < minKonusma) {
        adalar.push({ start: onceki.end, end: k.start });
        onceki.end = Math.max(onceki.end, k.end);
        onceki.birlesik = true;
        onceki.adaSayisi = (onceki.adaSayisi || 0) + 1;
        return;
      }
      birlesmis.push({ start: k.start, end: k.end });
    });
    var kesimler = [];
    birlesmis.forEach(function (k) {
      var s = Math.max(k.start, kenar), e = Math.min(k.end, sure - kenar);
      if (e <= s) return;
      var r = { start: s, end: e };
      if (k.birlesik) { r.birlesik = true; r.adaSayisi = k.adaSayisi; }
      kesimler.push(r);
    });
    return { kesimler: kesimler, adalar: adalar };
  }

  // o: { win, esik, minSessizlik, pay, minKonusma, minKesim: 0.25, sure, kenar: 0.05 }
  function bul(zarf, o) {
    o = o || {};
    var win = num(o.win, PENCERE);
    var sure = num(o.sure, (zarf ? zarf.length : 0) * win);
    var oo = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) oo[k] = o[k];
    oo.win = win; oo.sure = sure;
    return kesimlereCevir(sessizAraliklar(zarf, oo), oo);
  }

  /* ---------------- Otomatik eşik ---------------- */

  function yuzdelik(sirali, q) {
    var i = Math.round(q * (sirali.length - 1));
    return sirali[Math.max(0, Math.min(sirali.length - 1, i))];
  }
  /*
   * Arka plan tabanı = p10, konuşma = p95. Eşik tabanın 8 dB üstü, -60…-20 dB'e kırpılır (kaydırıcı aralığı).
   * dusukSnr: konuşma ile taban arası 12 dB'den azsa eşik güvenilir değildir (gürültülü kayıt).
   */
  function esikOner(zarf) {
    if (!zarf || !zarf.length) return null;
    var s = Array.prototype.slice.call(zarf).sort(function (a, b) { return a - b; });
    var p10 = yuzdelik(s, 0.10), p95 = yuzdelik(s, 0.95);
    var esik = Math.round(p10 + 8);
    if (esik < -60) esik = -60;
    if (esik > -20) esik = -20;
    return { esik: esik, taban: p10, konusma: p95, dusukSnr: p95 - p10 < 12 };
  }

  /* ---------------- Çizim ---------------- */

  // Zarfı px sütuna indirger: [[min, max], …] (zarf px'ten kısaysa zarf uzunluğu kadar)
  function kucult(zarf, px) {
    var n = zarf ? zarf.length : 0;
    px = Math.max(1, Math.floor(num(px, 1)));
    if (!n) return [];
    var k = Math.min(px, n), out = [];
    for (var b = 0; b < k; b++) {
      var i0 = Math.floor(b * n / k), i1 = Math.max(i0 + 1, Math.floor((b + 1) * n / k));
      var mn = Infinity, mx = -Infinity;
      for (var i = i0; i < i1 && i < n; i++) {
        if (zarf[i] < mn) mn = zarf[i];
        if (zarf[i] > mx) mx = zarf[i];
      }
      out.push([mn, mx]);
    }
    return out;
  }

  /* ---------------- Kullanıcı kararları ---------------- */

  function ortusme(a, b) { return Math.min(a.end, b.end) - Math.max(a.start, b.start); }
  // a ile b "aynı yer" mi: örtüşme iki aralıktan kısa olanın en az %50'si
  function eslesir(a, b) {
    var ort = ortusme(a, b);
    if (ort <= 0) return false;
    var olcu = Math.min(a.end - a.start, b.end - b.start);
    return olcu > 0 && ort >= 0.5 * olcu - 1e-9;
  }

  /*
   * Ayar değişince yeni aralıklar gelir; kullanıcının KAPATTIĞI (keep:false) bir aralıkla örtüşmesi
   * iki aralıktan kısa olanın %50'si ya da fazlası olan yeni aralık da kapalı başlar. Gerisi açık.
   * (Kısa olana göre ölçmek: kapatılan aralığı yutan birleşik bir kesim de kapalı kalır, kullanıcının
   * "bunu kesme" dediği yer sessizce kesilmez.)
   * Panel `eski` olarak bir önceki türetilmiş kümeyi DEĞİL, kararYaz'ın tuttuğu karar listesini verir.
   */
  function kararEsle(eski, yeni) {
    var kapali = (eski || []).filter(function (r) { return r && r.keep === false; });
    return (yeni || []).map(function (r) {
      var o = {};
      for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
      var keep = true;
      for (var i = 0; i < kapali.length; i++) {
        if (eslesir(r, kapali[i])) { keep = false; break; }
      }
      o.keep = keep;
      return o;
    });
  }

  /*
   * Kullanıcının kararları türetilmiş kesim kümesinden AYRI tutulur: yalnız çubuk / liste tıklaması
   * yazar, her yeniden hesaplanan küme bu listeyle eşlenir. Küme bir öncekiyle eşlenince, aradaki bir
   * kaydırıcı konumunda kapatılan kesimle örtüşen aralık kalmadığında karar kayboluyor; kapatılan
   * kesim komşularıyla birleşip yeniden ayrılınca "kapalı" komşulara yayılıyordu.
   * kararYaz(liste, aralik, keep, guncel) → yeni liste ({ start, end, keep:false } bölgeleri):
   *  - keep false: aralık listeye eklenir.
   *  - keep true: aralığı kapalı gösteren (eslesir) her kayıt için: kayıt büyük ölçüde (≥ %50) bu
   *    aralıksa ve ekranda başka bir kesimi kapalı tutmuyorsa silinir (aynı kesim, kenarları tampon /
   *    eşikle kaymış). Değilse (ör. birleşik bir kesimden kalan daha geniş bölge) yalnız aralık kadarı
   *    açılır; minParca'dan (0.25 sn, en kısa kesim) kısa artıklar atılır.
   * guncel: ekrandaki kesimler (isteğe bağlı; aralığın kendisi sayılmaz).
   */
  function kararYaz(liste, aralik, keep, guncel, minParca) {
    var r = aralik || {};
    var MIN = num(minParca, 0.25), out = [];
    if (!(r.end > r.start)) return (liste || []).slice();
    (liste || []).forEach(function (x) {
      if (!x || !(x.end > x.start) || x.keep !== false) return;
      if (keep === false || !eslesir(r, x)) { out.push({ start: x.start, end: x.end, keep: false }); return; }
      var baskasi = (guncel || []).some(function (g) {
        return g && g !== r && !(g.start === r.start && g.end === r.end) && eslesir(g, x);
      });
      if (!baskasi && ortusme(r, x) >= 0.5 * (x.end - x.start) - 1e-9) return;
      if (r.start - x.start >= MIN - 1e-9) out.push({ start: x.start, end: Math.min(x.end, r.start), keep: false });
      if (x.end - r.end >= MIN - 1e-9) out.push({ start: Math.max(x.start, r.end), end: x.end, keep: false });
    });
    if (keep === false) out.push({ start: r.start, end: r.end, keep: false });
    return out;
  }

  /*
   * Önizlenen ve uygulanacak kesimler aynı mı: sayı aynı ve her kenar tol içinde (varsayılan 0.05 sn:
   * zarf ile silencedetect arasındaki belirtilen eşleşme sınırı). Panel farkı göstermeden uygulamaz.
   */
  function kesimlerAyni(a, b, tol) {
    tol = num(tol, 0.05);
    a = a || []; b = b || [];
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (Math.abs(a[i].start - b[i].start) > tol + 1e-9 || Math.abs(a[i].end - b[i].end) > tol + 1e-9) return false;
    }
    return true;
  }

  /* ---------------- Bellek önbelleği ---------------- */

  // mediaPath|in|dur — Uygula'dan sonra ve klip değişince panel önbelleği boşaltır
  function anahtar(mediaPath, inPoint, dur) {
    return String(mediaPath) + "|" + num(inPoint, 0).toFixed(3) + "|" + num(dur, 0).toFixed(3);
  }
  function onbellekYap(max) {
    max = Math.max(1, Math.floor(num(max, 4)));
    var sira = [], veri = {};
    return {
      al: function (k) { return Object.prototype.hasOwnProperty.call(veri, k) ? veri[k] : null; },
      koy: function (k, v) {
        if (!Object.prototype.hasOwnProperty.call(veri, k)) sira.push(k);
        veri[k] = v;
        while (sira.length > max) delete veri[sira.shift()];
      },
      temizle: function () { sira = []; veri = {}; },
      boyut: function () { return sira.length; }
    };
  }

  return {
    TABAN: TABAN, SR: SR, PENCERE: PENCERE, ZAMAN_SUZGECI: ZAMAN_SUZGECI,
    dbfs: dbfs,
    cozumlemeArgs: cozumlemeArgs,
    kanalSayisi: kanalSayisi,
    cikisBilgisi: cikisBilgisi,
    tepeZarfi: tepeZarfi,
    zarfBesle: zarfBesle,
    zarfBitir: zarfBitir,
    sessizAraliklar: sessizAraliklar,
    kesimlereCevir: kesimlereCevir,
    bul: bul,
    esikOner: esikOner,
    kucult: kucult,
    kararEsle: kararEsle,
    kararYaz: kararYaz,
    kesimlerAyni: kesimlerAyni,
    anahtar: anahtar,
    onbellekYap: onbellekYap
  };
});
