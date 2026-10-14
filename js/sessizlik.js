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
 * 3.4 adım 7 (kapsam ve korunan katmanlar): kapsamAraligi (Seçili klip | In → Out | Sekans), korumaOner
 * (KS_getTrackLayout düzeninden dinlenecek ses + korunan katman önerisi ve uyarılar: korunan video + ripple,
 * bağlı video–ses çiftinin ayrılması), korumaYuku (KS_applyCuts protect).
 *
 * Saf (ES5, UMD): DOM'a, Premiere'e ve ffmpeg'e dokunmaz; Node'da test edilir (tests/test-sessizlik.js).
 * Clean-room: "canlı yeniden analiz + kısa konuşma birleştirme" ve "zaman çizelgesi kapsamı + korunan katman"
 * fikirleri Premiere TR'den (MIT) esinlenir; kod kopyalanmadı (onun kilit açıp kapama yöntemi de kullanılmadı).
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

  /* ---------------- Kapsam ve korunan katmanlar (3.4 adım 7) ---------------- */

  /*
   * Kesim kapsamının sekans aralığı (sn). ctx: KS_getContext özeti ({ hasSeq, sel, seqIn, seqOut, seqDur, frame }).
   * kapsam: "clip" (seçili klip) | "inout" (sekansın In → Out'u) | "entire" (tüm sekans).
   * Döner { start, end } ya da { hata: "klip" | "sekans" | "inout" } (panel metni koda göre kurar).
   */
  function kapsamAraligi(kapsam, ctx) {
    ctx = ctx || {};
    if (kapsam !== "inout" && kapsam !== "entire") {
      var s = ctx.sel;
      if (!s || !(num(s.clipEnd, 0) > num(s.clipStart, 0))) return { hata: "klip" };
      return { start: num(s.clipStart, 0), end: num(s.clipEnd, 0) };
    }
    if (!ctx.hasSeq) return { hata: "sekans" };
    var kare = num(ctx.frame, 0) > 0 ? num(ctx.frame, 0) : 1 / 30;
    if (kapsam === "inout") {
      var a = num(ctx.seqIn, 0), b = num(ctx.seqOut, 0), sd = num(ctx.seqDur, 0);
      if (sd > 0 && b > sd) b = sd;
      if (!(b - a > kare)) return { hata: "inout" };
      /*
       * İşaretsiz sekansı Premiere In = 0, Out = sekans sonu diye okur: bu "In / Out yok" demektir (Hız Rampası
       * inOutVar ile aynı kural). Yoksa In → Out kapsamı sessizce tüm sekansı keserdi.
       */
      if (!(a > kare || (sd > 0 && b < sd - kare))) return { hata: "inout" };
      return { start: Math.max(0, a), end: b };
    }
    var d = num(ctx.seqDur, 0);
    if (!(d > kare)) return { hata: "sekans" };
    return { start: 0, end: d };
  }

  /*
   * Arka plan sesi adı: bu adı taşıyan SES katmanı varsayılan olarak korunur (kesilmez, kaymaz).
   * Ad Türkçe büyük / küçük harf farkı ve şapkasız yazım gözetilerek karşılaştırılır ("MÜZİK", "Sarki").
   * Yalnız SÖZCÜK BAŞINDA aranır (camelCase sözcük sayılır: "BackgroundMusic"): "Songül", "Kemal Sarkis" gibi kişi
   * adları müzik sayılmaz. müzik / music / bgm / ambiyans / ambience ekli de olur ("Müziği", "Musical"); "şarkı" yalnız
   * Türkçe ekleriyle ("şarkılar", "şarkısı"), "song" yalnız "song" / "songs" olarak.
   */
  var MUZIK_RE = /(^|[^a-zçğıöşüâîû])(m[uü]zi[kğg]|music|bgm|ambiyans|ambience|[sş]ark[iı](lar|ler|s[iı]|n[iı]n|m|n)?(?![a-zçğıöşüâîû])|songs?(?![a-zçğıöşüâîû]))/;
  function adNormal(ad) {
    return String(ad || "").replace(/([a-zçğıöşü])([A-ZÇĞİÖŞÜ])/g, "$1 $2")
      .replace(/İ/g, "i").replace(/I/g, "i").replace(/ı/g, "i").toLowerCase();
  }
  function muzikAdi(ad) { return MUZIK_RE.test(adNormal(ad)); }

  // Çip etiketi: "A2", özel adlı katmanda "A2 · Müzik" (Premiere'in varsayılan "Audio 2" / "Ses 2" adı yazılmaz)
  function izEtiketi(tur, i, ad) {
    var kisa = (tur === "video" ? "V" : "A") + (Math.floor(num(i, 0)) + 1);
    var a = String(ad || "").replace(/^\s+|\s+$/g, "");
    if (!a || /^(audio|video|ses|görüntü|goruntu|a|v)(\s*track)?\s*\d+$/i.test(a)) return kisa;
    return kisa + " · " + a;
  }

  function iceriyor(liste, x) {
    for (var i = 0; i < liste.length; i++) if (liste[i] === x) return true;
    return false;
  }
  // Geçerli, tekil, sıralı dizin listesi (0 ≤ i < n)
  function dizinler(liste, n) {
    var out = [];
    (liste || []).forEach(function (v) {
      var i = Number(v);
      if (i === Math.floor(i) && i >= 0 && i < n && !iceriyor(out, i)) out.push(i);
    });
    return out.sort(function (a, b) { return a - b; });
  }
  function ortSn(s, e, a, b) { return Math.min(e, b) - Math.max(s, a); }
  function izKlipleri(iz) { return iz && iz.klipler && iz.klipler.length ? iz.klipler : []; }

  // Katmanda aralığa değen klip var mı (klipler yoksa katman özetinden: clipCount, first, last)
  function izDolu(iz, bas, son) {
    if (!iz) return false;
    var k = izKlipleri(iz);
    if (k.length) {
      for (var i = 0; i < k.length; i++) if (ortSn(num(k[i].s, 0), num(k[i].e, 0), bas, son) > 1e-3) return true;
      return false;
    }
    if (!(num(iz.clipCount, 0) > 0)) return false;
    if (iz.last === undefined || iz.first === undefined) return true;
    return num(iz.last, 0) > bas + 1e-3 && num(iz.first, 0) < son - 1e-3;
  }

  // Aralığın en az `oran`ını TEK bir klip kaplıyor mu (sürekli müzik / ambiyans izi)
  function uzunKlip(iz, bas, son, oran) {
    var k = izKlipleri(iz), boy = son - bas;
    if (!(boy > 0)) return null;
    for (var i = 0; i < k.length; i++) {
      if (ortSn(num(k[i].s, 0), num(k[i].e, 0), bas, son) >= oran * boy - 1e-6) return k[i];
    }
    return null;
  }
  function tekKlipKaplar(iz, bas, son, oran) { return !!uzunKlip(iz, bas, son, oran); }

  // Klibin kendisi müziğe benziyor mu: klip / dosya adında müzik sözcüğü ya da sıkıştırılmış müzik dosyası uzantısı
  function muzikKlibi(kl) {
    if (!kl) return false;
    var dosya = String(kl.yol || "").replace(/^.*[\\\/]/, "");
    return muzikAdi(kl.ad) || muzikAdi(dosya.replace(/\.[^.]*$/, "")) || /\.(mp3|m4a|aac|ogg|oga|opus|flac|wma)$/i.test(dosya);
  }

  /*
   * Bağlı video–ses klip çiftleri. Ses klibinin `bag` listesi (Premiere getLinkedItems: [{ s, e, yol, tur }])
   * varsa o esas alınır (bağlı video öğesi aynı başlangıç / bitişli video klibiyle eşlenir). bag yoksa (eski
   * Premiere: API yok) sezgi: aynı medya + aynı kaynak hizası (inPoint − start, ±50 ms) + zamanda örtüşme.
   * Döner: [{ audio, video, a: sesKlibi, v: videoKlibi }]
   */
  function bagliCiftler(layout) {
    var V = (layout && layout.video) || [], A = (layout && layout.audio) || [], out = [];
    A.forEach(function (aiz, ai) {
      izKlipleri(aiz).forEach(function (ak) {
        V.forEach(function (viz, vi) {
          izKlipleri(viz).forEach(function (vk) {
            var bag = false;
            if (ak.bag && ak.bag.length !== undefined) {
              for (var b = 0; b < ak.bag.length && !bag; b++) {
                var x = ak.bag[b] || {};
                if (x.tur && !/video/i.test(String(x.tur))) continue;
                bag = Math.abs(num(x.s, NaN) - num(vk.s, 0)) < 0.01 && Math.abs(num(x.e, NaN) - num(vk.e, 0)) < 0.01;
              }
            } else if (ak.yol && vk.yol) {
              bag = String(ak.yol).toLowerCase() === String(vk.yol).toLowerCase() &&
                Math.abs(num(ak.hiza, 0) - num(vk.hiza, 0)) <= 0.05 && ortSn(num(ak.s, 0), num(ak.e, 0), num(vk.s, 0), num(vk.e, 0)) > 1e-3;
            }
            if (bag) out.push({ audio: ai, video: vi, a: ak, v: vk });
          });
        });
      });
    });
    return out;
  }

  // Klip [s, e] kesimlerden birine değiyor mu (kesimler yoksa aralığa)
  function kesilir(k, kesimler, bas, son) {
    var s = num(k.s, 0), e = num(k.e, 0);
    if (!kesimler) return ortSn(s, e, bas, son) > 1e-3;
    for (var i = 0; i < kesimler.length; i++) {
      if (ortSn(s, e, num(kesimler[i].start, 0), num(kesimler[i].end, 0)) > 1e-3) return true;
    }
    return false;
  }

  /*
   * Kapsamın katman önerisi ve uyarıları. Saf: Premiere'e dokunmaz.
   * layout: KS_getTrackLayout({ klipler: true, start, end }) çıktısı:
   *   { video: [{ index, name, locked, muted, clipCount, first, last, klipler: [{ s, e, ad, yol, hiza, bag }] }], audio: [...] }
   * o: { start, end (sekans aralığı), dinle?: [i] (kullanıcının seçimi; yoksa varsayılan), koru?: { video, audio }
   *      (kullanıcının seçimi; yoksa varsayılan), mod: "ripple" | "gap" | "select", kesimler?: [{ start, end }] (etkin
   *      kesimler, sekans zamanı; varsa bağlı çift uyarısı yalnız gerçekten kesilen klipler için), dinleGerekli?: bool,
   *      ciftler?: bagliCiftler(layout) (panel önbelleği; yoksa hesaplanır) }
   * Kurallar:
   *  - Adı müzik / music / bgm / şarkı / song / ambiyans / ambience olan SES katmanı korunur (önceden işaretli).
   *  - Bir klibi aralığın %80'ini ya da fazlasını kaplayan, dinlenmeyen ve korunmayan ses katmanı yalnız ÖNERİLİR
   *    (oner.audio: vurgulanır, işaretlenmez): tek uzun klip konuşma da olabilir. Videoya bağlı ses yokken birden
   *    çok varsayılan dinlenen katman varsa (hangisi konuşma bilinemez) dinlenen böyle bir katman da önerilir.
   *  - Video katmanı hiçbir zaman önceden işaretlenmez.
   *  - Dinlenecek ses (varsayılan): aralıkta klibi olan, adı müzik olmayan ses katmanları; susturulmamış olanlar
   *    varsa yalnız onlar; videoya bağlı (kamera sesi) olanlar varsa yalnız onlar.
   * Uyarılar:
   *  - { kod: "video-ripple", izler }: ripple'da korunan video katmanı kaymaz, kurgunun geri kalanıyla senkronu bozulur
   *    (panel boşluk modunu önerir ya da uygulamaz).
   *  - { kod: "bagli", ciftler: [{ audio, video, start, end, ad, koruTaraf }], toplam }: bağlı çiftin bir tarafı korunurken
   *    öbür tarafı kesiliyor (kamera sesi ile görüntüsü ayrılır).
   *  - { kod: "dinle-yok" }: dinleGerekli iken dinlenecek ses katmanı yok.
   * Döner: { dinle, koru: { video, audio }, oner: { audio }, adla: { audio }, kilitli: { video, audio }, uyarilar }
   */
  function korumaOner(layout, o) {
    o = o || {};
    var V = (layout && layout.video) || [], A = (layout && layout.audio) || [];
    var bas = num(o.start, 0), son = num(o.end, num(layout && layout.duration, 0));
    if (!(son > bas)) son = bas;
    var ciftler = o.ciftler || bagliCiftler(layout);
    var adla = [], kilitV = [], kilitA = [];
    A.forEach(function (iz, i) {
      if (iz && muzikAdi(iz.name)) adla.push(i);
      if (iz && iz.locked) kilitA.push(i);
    });
    V.forEach(function (iz, i) { if (iz && iz.locked) kilitV.push(i); });

    var koru = o.koru
      ? { video: dizinler(o.koru.video, V.length), audio: dizinler(o.koru.audio, A.length) }
      : { video: [], audio: adla.slice() };

    var dinle, belirsiz = false;
    if (o.dinle) dinle = dizinler(o.dinle, A.length);
    else {
      var aday = [];
      A.forEach(function (iz, i) { if (izDolu(iz, bas, son) && !iceriyor(adla, i) && !iz.locked) aday.push(i); });
      var sesli = aday.filter(function (i) { return !A[i].muted; });
      if (sesli.length) aday = sesli;
      var bagli = aday.filter(function (i) {
        return ciftler.some(function (c) { return c.audio === i && ortSn(num(c.a.s, 0), num(c.a.e, 0), bas, son) > 1e-3; });
      });
      dinle = bagli.length ? bagli : aday;
      // videoya bağlı ses yok ve birden çok aday: hangisinin konuşma, hangisinin adsız müzik olduğu bilinemez
      belirsiz = !bagli.length && aday.length > 1;
    }

    /*
     * Kaplama önerisi. Belirsiz varsayılanda (bağlı ses yok, birden çok aday) tek uzun klipli DİNLENEN katman da
     * önerilir, adsız müzik yatağı sessizce karışıma katılmış olabilir: başka bir aday parça parça (kurgulanmış konuşma)
     * ise ya da klibin adı / dosyası müziğe benziyorsa (mp3, "music"…). Tek parça konuşma kayıtları (iki konuşmacılı
     * podcast) birbirinden ayrılamaz: önerilmez. Önerilen yalnız vurgulanır, dinlemeden çıkarılmaz (yanlış çıkarılan
     * konuşma katmanı sessiz sanılıp kesilirdi).
     */
    var karsit = belirsiz && dinle.some(function (i) { return !tekKlipKaplar(A[i], bas, son, 0.8); });
    var oner = [];
    A.forEach(function (iz, i) {
      if (iceriyor(koru.audio, i) || (iz && iz.locked)) return;
      var uzun = uzunKlip(iz, bas, son, 0.8);
      if (!uzun) return;
      if (iceriyor(dinle, i) && !(belirsiz && (karsit || muzikKlibi(uzun)))) return;
      oner.push(i);
    });

    var uyarilar = [];
    if (o.dinleGerekli && !dinle.length) uyarilar.push({ kod: "dinle-yok" });
    var kesimler = o.kesimler && o.kesimler.length ? o.kesimler : null;
    if (o.mod === "ripple" && koru.video.length) {
      // ilk kesimden sonra içeriği olan korunan video katmanı ripple'da geride kalır
      var ilk = bas;
      if (kesimler) { ilk = Infinity; kesimler.forEach(function (k) { if (num(k.start, Infinity) < ilk) ilk = num(k.start, Infinity); }); }
      var kayan = koru.video.filter(function (i) {
        var iz = V[i] || {};
        if (iz.locked) return false;
        if (!(num(iz.clipCount, 0) > 0) && !izKlipleri(iz).length) return false;
        if (iz.last !== undefined) return num(iz.last, 0) > ilk + 1e-3;
        return izKlipleri(iz).some(function (k) { return num(k.e, 0) > ilk + 1e-3; });
      });
      if (kayan.length) uyarilar.push({ kod: "video-ripple", izler: kayan });
    }
    var kopan = [], gor = {};
    ciftler.forEach(function (c) {
      var aK = iceriyor(koru.audio, c.audio), vK = iceriyor(koru.video, c.video);
      if (aK === vK) return;
      // kesilen taraf: korunmayan (kilitli katman zaten kesilmez)
      var kesilen = aK ? c.v : c.a;
      if (aK ? (V[c.video] && V[c.video].locked) : (A[c.audio] && A[c.audio].locked)) return;
      if (!kesilir(kesilen, kesimler, bas, son)) return;
      var anahtar = c.audio + "|" + c.video + "|" + num(c.v.s, 0).toFixed(3);
      if (gor[anahtar]) return;
      gor[anahtar] = 1;
      // çiftin kapsam içindeki kısmı: klip kapsamında aralığın önünden başlayan çift eksi zaman göstermesin
      kopan.push({ audio: c.audio, video: c.video, start: Math.max(bas, num(c.a.s, 0), num(c.v.s, 0)),
        end: Math.max(bas, Math.min(son, num(c.a.e, 0), num(c.v.e, 0))), ad: String(c.v.ad || c.a.ad || ""), koruTaraf: aK ? "audio" : "video" });
    });
    if (kopan.length) {
      kopan.sort(function (x, y) { return x.start - y.start; });
      uyarilar.push({ kod: "bagli", ciftler: kopan.slice(0, 20), toplam: kopan.length });
    }
    return { dinle: dinle, koru: koru, oner: { audio: oner }, adla: { audio: adla }, kilitli: { video: kilitV, audio: kilitA }, uyarilar: uyarilar };
  }

  /*
   * KS_applyCuts'a gidecek koruma: yalnız gerçekten korunan katman varsa { video, audio }, yoksa null
   * (protect gönderilmez: host çıktısı 3.3 ile birebir aynı kalır).
   */
  function korumaYuku(koru) {
    if (!koru) return null;
    var v = dizinler(koru.video, Infinity), a = dizinler(koru.audio, Infinity);
    return v.length || a.length ? { video: v, audio: a } : null;
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
    onbellekYap: onbellekYap,
    kapsamAraligi: kapsamAraligi,
    muzikAdi: muzikAdi,
    izEtiketi: izEtiketi,
    bagliCiftler: bagliCiftler,
    korumaOner: korumaOner,
    korumaYuku: korumaYuku
  };
});
