/*
 * Suflo — Ses zarfı ve konuşma başlangıçları (senkron doğrulama, adım 1)
 *
 * Altyazı kelimelerinin gerçek sesle karşılaştırılması için klibin sesi 16 kHz mono s16le PCM'e
 * çözülür (ffmpeg, pipe:1, geçici dosya yok) ve 10 ms'lik pencerelerden şunlar çıkarılır:
 *   db      pencere RMS'i (dBFS, -120 tabanı)
 *   aki     spektral akı (log bant güçlerindeki ARTIŞ; 256 örnek Hann, 18 bant 125 Hz–7,5 kHz):
 *           sessizlik olmadan birbirine bağlanan kelimelerde de yeni kelimenin başını gösterir
 *   taban   uyarlanır gürültü tabanı: 2,5 sn'lik bloklarda %10 yüzdelik, 5 komşu blokla ortanca (7,5 sn'den kısa
 *           kesintisiz konuşma tabanı yükseltmez), yakın bloklar arası doğrusal geçiş; 6 dB'den büyük sıçramada
 *           (klima açıldı) basamak: eşik en geç bir blok içinde yeni tabana uyar
 *   aktif   konuşma / sessizlik (histerezisli eşik: açılış taban + d, kapanış taban + 0,6 d)
 *   bolumler   konuşma aralıkları [{ bas, son }] (sn)
 *   onsetler   konuşma başlangıçları [{ t, g }] (sn, güç 0..1): sessizlikten çıkış (g = 1) + akı tepeleri
 *   bitisler   enerji düşüşleri [{ t, g }]: sessizliğe giriş (g = 1) + kelimeler arası çukurlar
 *   kontrast   konuşma (%95) − taban (%10), dB: düşükse (gürültü / müzik altında konuşma) senkron
 *              motoru zamanlara dokunmaz, yalnız işaretler (js/senkron.js)
 * Sınırlar alt-pencere hassasiyetinde hesaplanır: kısmen dolu pencerenin gücü (P − taban) / (P_dolu − taban)
 * oranı sesin pencerenin ne kadarını kapladığını verir; 10 ms ızgarası tek başına ±5 ms hata bırakırdı.
 *
 * Neden sessizlik.js'nin zarfı değil: o zarf TEPE değeridir ve silencedetect'le birebir aynı kalmak için
 * özgün örnekleme hızında / kanal sayısında çıkarılır. Kelime hizası RMS + akı ister ve 16 kHz mono
 * whisper'ın duyduğu sesle aynıdır. Zaman ekseni süzgeci (ZAMAN_SUZGECI: baştaki ses kayması ve PTS
 * boşlukları sessizlikle dolar) sessizlik.js ile AYNIDIR: kelime zamanları klip başına göre ölçülür.
 *
 *   analizci(o)                 -> { besle(Int16Array | Float32Array | Buffer(s16le)), bitir() -> analiz }  (akış)
 *   analizEt(pcm, o)            -> analiz (tek seferde)
 *   analizEtAsync(pcm, o)       -> Promise<analiz | { iptal: true }> (o.iptal: K.iptalJetonu, o.parca örnek)
 *   cikarmaArgs(media, in, dur) -> ffmpeg argümanları (16 kHz mono s16le, pipe:1)
 *   sesZarfiCikar(o)            -> Promise<{ analiz, onbellekten? } | { iptal: true } | { neden }>
 *                                  o: { K, media, inPoint, dur, iptal, onIlerleme(oran) }; ffmpeg K.findFfmpeg'den,
 *                                  akış K.runAkis ile (iptal süreç ağacını öldürür); sonuç medya + aralık + dosya
 *                                  boyutu / değişim zamanı özetine göre bellekte tutulur (onbellek)
 *   konusmaOrani(analiz, bas, son), enYakin(liste, t), yuzdelik(dizi, p)
 *
 * Saf UMD modülü: DOM'a ve Premiere'e dokunmaz; ffmpeg / dosya sistemi K ile enjekte edilir. ES5 (CEF 74 / Node 12).
 * Testler: tests/test-ses-zarf.js (sentetik ton / gürültü patlamaları, gerçek ffmpeg varsa wav, 1 saatlik başarım, iptal).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloSesZarf = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var SURUM = 2;            // analiz biçimi: önbellek anahtarına girer (2: yüksek bant ile genişleyen konuşma kenarları)
  var SR = 16000;
  var HOP = 160;            // 10 ms
  var HOP_SN = HOP / SR;
  var N = 256;              // akı penceresi (16 ms; pencere karenin SONUNDA biter: akış için ileri bakış yok)
  var M = N / 2;
  var TABAN_DB = -120;
  var BLOK = 250;           // taban bloğu: 2,5 sn
  var GAMMA = 1e7;          // log(1 + γ P): ~-70 dBFS altı bant gücü akıya katılmaz
  var YB_ALT = 40, YB_UST = 120;   // yüksek bant: 2,5–7,5 kHz (256 noktalı FFT, 62,5 Hz / bin)
  var YB_PAY = 10;          // yüksek bant kendi tabanının bu kadar dB üstündeyse ses var (sürtünmeli ünsüz)
  var YB_MAX = 20;          // yüksek bantla kenar genişletme en çok 200 ms
  var YB_OLCEK = 2 / (N * N * 0.375);   // |X|² toplamı → bant ortalama karesi (tek yan, Hann enerjisi)
  var ZAMAN_SUZGECI = "aresample=async=1:min_hard_comp=0.01:first_pts=0";

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function ms(t) { return Math.round(t * 1000) / 1000; }
  function kirp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------------- FFT (256 gerçek → 128 karmaşık, radix-2) ---------------- */

  var _cos = null, _sin = null, _rev = null, _hann = null, _wc = null, _ws = null, _bant = null;
  function hazirla() {
    if (_cos) return;
    var i;
    _cos = new Float64Array(M / 2); _sin = new Float64Array(M / 2);
    for (i = 0; i < M / 2; i++) { _cos[i] = Math.cos(-2 * Math.PI * i / M); _sin[i] = Math.sin(-2 * Math.PI * i / M); }
    _rev = new Uint16Array(M);
    var bit = Math.round(Math.log(M) / Math.LN2);
    for (i = 0; i < M; i++) {
      var r = 0;
      for (var b = 0; b < bit; b++) if (i & (1 << b)) r |= 1 << (bit - 1 - b);
      _rev[i] = r;
    }
    _hann = new Float64Array(N);
    for (i = 0; i < N; i++) _hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    _wc = new Float64Array(M + 1); _ws = new Float64Array(M + 1);
    for (i = 0; i <= M; i++) { _wc[i] = Math.cos(2 * Math.PI * i / N); _ws[i] = Math.sin(2 * Math.PI * i / N); }
    // 18 bant, 2. bin (125 Hz) .. 120. bin (7,5 kHz), logaritmik aralık
    _bant = [];
    var alt = 2, ust = 120, BS = 18;
    for (i = 0; i <= BS; i++) _bant.push(Math.round(alt * Math.pow(ust / alt, i / BS)));
    for (i = 1; i < _bant.length; i++) if (_bant[i] <= _bant[i - 1]) _bant[i] = _bant[i - 1] + 1;
  }

  // x: Float64Array(N) pencerelenmiş gerçek örnekler -> guc: Float64Array(M + 1) |X[k]|²
  function gucSpektrumu(x, re, im, guc) {
    var i, j, k, t;
    for (i = 0; i < M; i++) { j = _rev[i]; re[j] = x[2 * i]; im[j] = x[2 * i + 1]; }
    for (var boy = 2; boy <= M; boy <<= 1) {
      var yarim = boy >> 1, adim = M / boy;
      for (i = 0; i < M; i += boy) {
        for (j = 0; j < yarim; j++) {
          k = j * adim;
          var a = i + j, b = a + yarim;
          var tre = re[b] * _cos[k] - im[b] * _sin[k];
          var tim = re[b] * _sin[k] + im[b] * _cos[k];
          re[b] = re[a] - tre; im[b] = im[a] - tim;
          re[a] += tre; im[a] += tim;
        }
      }
    }
    for (k = 0; k <= M; k++) {
      var ka = k % M, kb = (M - k) % M;
      var ar = re[ka], ai = im[ka], cr = re[kb], ci = im[kb];
      var er = (ar + cr) / 2, ei = (ai - ci) / 2;
      var or = (ai + ci) / 2, oi = -(ar - cr) / 2;
      // W = e^{-i 2πk/N}
      var c = _wc[k], s = _ws[k];
      var xr = er + c * or + s * oi;
      var xi = ei + c * oi - s * or;
      t = xr * xr + xi * xi;
      guc[k] = t;
    }
    return guc;
  }

  /* ---------------- Akış analizcisi ---------------- */

  function buyut(dizi, n) {
    if (n <= dizi.length) return dizi;
    var y = new Float32Array(Math.max(n, dizi.length * 2));
    y.set(dizi);
    return y;
  }

  function analizci(o) {
    o = o || {};
    hazirla();
    var gecmis = new Float64Array(N);   // son N örnek
    var cerceve = new Float64Array(HOP);
    var dolu = 0;
    var x = new Float64Array(N), re = new Float64Array(M), im = new Float64Array(M), guc = new Float64Array(M + 1);
    var BS = _bant.length - 1;
    var oncekiBant = new Float64Array(BS), bant = new Float64Array(BS);
    var ilk = true;
    var db = new Float32Array(4096), aki = new Float32Array(4096), yb = new Float32Array(4096), n = 0;
    var artikBayt = -1;     // Buffer akışında tek kalan bayt
    var ornek = 0;
    var bitti = null;

    function kare() {
      var i, kt = 0;
      for (i = 0; i < HOP; i++) kt += cerceve[i] * cerceve[i];
      gecmis.copyWithin(0, HOP);
      gecmis.set(cerceve, N - HOP);
      for (i = 0; i < N; i++) x[i] = gecmis[i] * _hann[i];
      gucSpektrumu(x, re, im, guc);
      var f = 0;
      for (var b = 0; b < BS; b++) {
        var top = 0;
        for (var k = _bant[b]; k < _bant[b + 1]; k++) top += guc[k];
        var l = Math.log(1 + GAMMA * top / N);
        bant[b] = l;
        if (!ilk) { var d = l - oncekiBant[b]; if (d > 0) f += d; }
      }
      var tmp = oncekiBant; oncekiBant = bant; bant = tmp;
      ilk = false;
      var ybt = 0;
      for (var kb = YB_ALT; kb <= YB_UST; kb++) ybt += guc[kb];
      ybt *= YB_OLCEK;
      db = buyut(db, n + 1); aki = buyut(aki, n + 1); yb = buyut(yb, n + 1);
      var ybv = ybt > 0 ? 10 * Math.log(ybt) / Math.LN10 : TABAN_DB;
      yb[n] = ybv < TABAN_DB ? TABAN_DB : (ybv > 0 ? 0 : ybv);
      var ort = kt / HOP;
      var v = ort > 0 ? 10 * Math.log(ort) / Math.LN10 : TABAN_DB;
      db[n] = v < TABAN_DB ? TABAN_DB : v;
      aki[n] = f / BS;
      n++;
      dolu = 0;
    }

    function ekle(v) {
      cerceve[dolu++] = v;
      if (dolu === HOP) kare();
    }

    var api = {
      besle: function (veri) {
        if (bitti) throw new Error("analizci bitti");
        if (!veri) return api;
        var i, L;
        if (veri instanceof Float32Array || veri instanceof Float64Array) {
          L = veri.length;
          for (i = 0; i < L; i++) ekle(veri[i]);
          ornek += L;
        } else if (veri instanceof Int16Array) {
          L = veri.length;
          for (i = 0; i < L; i++) ekle(veri[i] / 32768);
          ornek += L;
        } else {
          // Buffer / Uint8Array: s16le baytları (parça sınırında tek bayt taşınır)
          L = veri.length;
          i = 0;
          if (artikBayt >= 0 && L > 0) {
            var s0 = artikBayt | (veri[0] << 8);
            if (s0 >= 32768) s0 -= 65536;
            ekle(s0 / 32768); ornek++;
            artikBayt = -1; i = 1;
          }
          for (; i + 1 < L; i += 2) {
            var s = veri[i] | (veri[i + 1] << 8);
            if (s >= 32768) s -= 65536;
            ekle(s / 32768);
            ornek++;
          }
          if (i < L) artikBayt = veri[i];
        }
        return api;
      },
      ornek: function () { return ornek; },
      kareSayisi: function () { return n; },
      bitir: function () {
        if (bitti) return bitti;
        if (dolu > 0) {
          // yarım son pencere: sıfırla doldurulmaz, kendi örnekleri üzerinden ortalanır
          var kalan = dolu;
          var kt = 0;
          for (var i = 0; i < kalan; i++) kt += cerceve[i] * cerceve[i];
          for (var j = kalan; j < HOP; j++) cerceve[j] = 0;
          kare();
          var ort = kt / kalan;
          var v = ort > 0 ? 10 * Math.log(ort) / Math.LN10 : TABAN_DB;
          db[n - 1] = v < TABAN_DB ? TABAN_DB : v;
        }
        bitti = ozetle(db.subarray(0, n), aki.subarray(0, n), o, yb.subarray(0, n));
        bitti.ornek = ornek;
        return bitti;
      }
    };
    return api;
  }

  /* ---------------- Yüzdelik (histogram, O(n)) ---------------- */

  var HB = 0.25;   // dB kutu genişliği
  var HK = Math.round(-TABAN_DB / HB) + 1;
  function histogram(db, a, b) {
    var h = new Int32Array(HK);
    for (var i = a; i < b; i++) {
      var k = Math.round((db[i] - TABAN_DB) / HB);
      h[k < 0 ? 0 : (k >= HK ? HK - 1 : k)]++;
    }
    return h;
  }
  function histYuzde(h, toplam, p) {
    if (!toplam) return TABAN_DB;
    var hedef = Math.max(1, Math.ceil(toplam * p)), say = 0;
    for (var k = 0; k < HK; k++) { say += h[k]; if (say >= hedef) return TABAN_DB + k * HB; }
    return 0;
  }
  // genel yüzdelik (küçük diziler için; sıralı kopya)
  function yuzdelik(dizi, p) {
    var a = Array.prototype.slice.call(dizi).filter(function (v) { return isFinite(v); }).sort(function (x, y) { return x - y; });
    if (!a.length) return NaN;
    var i = kirp(Math.ceil(a.length * p) - 1, 0, a.length - 1);
    return a[i];
  }

  /* ---------------- Özet: taban, eşik, bölümler, onset / bitiş ---------------- */

  function guc(dbv) { return Math.pow(10, dbv / 10); }

  /*
   * Uyarlanır taban (dB dizisi için): 2,5 sn'lik bloklarda %10 yüzdelik, 5 komşu blokla ortanca, yakın bloklar
   * arası doğrusal geçiş; 6 dB'den büyük sıçramada basamak. Döner: Float32Array(n).
   */
  function blokTaban(dizi, n) {
    var bs = Math.max(1, Math.ceil(n / BLOK)), bt = [], b, i;
    for (b = 0; b < bs; b++) {
      var ba = b * BLOK, bb = Math.min(n, ba + BLOK);
      bt.push(histYuzde(histogram(dizi, ba, bb), bb - ba, 0.10));
    }
    var bt2 = bt.map(function (v, k) {
      var u = [];
      for (var j = k - 2; j <= k + 2; j++) u.push(bt[kirp(j, 0, bs - 1)]);
      u.sort(function (x, y) { return x - y; });
      return u[2];
    });
    var out = new Float32Array(n);
    for (i = 0; i < n; i++) {
      var kb = (i + 0.5) / BLOK - 0.5, k0 = Math.floor(kb), f = kb - k0;
      var v0 = bt2[kirp(k0, 0, bs - 1)], v1 = bt2[kirp(k0 + 1, 0, bs - 1)];
      out[i] = Math.abs(v1 - v0) < 6 ? v0 + (v1 - v0) * f : bt2[kirp(Math.floor(i / BLOK), 0, bs - 1)];
    }
    return out;
  }

  /*
   * yb (isteğe bağlı): pencere başına yüksek bant (2,5–7,5 kHz) düzeyi, dB. Varsa konuşma bölümünün kenarları, geniş
   * bant eşiğinin altında kalan ama yüksek bantta tabanının YB_PAY dB üstünde süren kısma (en çok 200 ms, komşu bölüme
   * geçmeden) genişler: müzik yatağı altında s / f / h / t / p / k ile başlayan kelimenin başı ünlüye değil ünsüze düşer.
   */
  function ozetle(db, aki, o, yb) {
    o = o || {};
    var n = db.length, i, b;
    var a = {
      surum: SURUM, sr: SR, hop: HOP_SN, n: n, sure: n * HOP_SN, t0: num(o.t0, 0),
      db: db, aki: aki, yb: yb && yb.length === n ? yb : null,
      taban: new Float32Array(n), esik: new Float32Array(n), esikK: new Float32Array(n),
      aktif: new Uint8Array(n), aktifTop: new Int32Array(n + 1),
      bolumler: [], onsetler: [], bitisler: [],
      tabanDb: TABAN_DB, konusmaDb: TABAN_DB, kontrast: 0, konusmaOrani: 0
    };
    if (!n) return a;
    var hg = histogram(db, 0, n);
    a.tabanDb = histYuzde(hg, n, 0.10);
    a.konusmaDb = histYuzde(hg, n, 0.95);
    a.kontrast = a.konusmaDb - a.tabanDb;

    // blok tabanları
    var tabanD = blokTaban(db, n);
    var ybT = a.yb ? blokTaban(a.yb, n) : null;
    for (i = 0; i < n; i++) {
      var tb = tabanD[i];
      var d = kirp(0.4 * (a.konusmaDb - tb), 6, 15);
      a.taban[i] = tb;
      a.esik[i] = tb + d;
      a.esikK[i] = tb + 0.6 * d;
    }

    // histerezisli konuşma / sessizlik
    var ici = false, bas = 0;
    var ham = [];
    for (i = 0; i < n; i++) {
      if (!ici && db[i] >= a.esik[i]) { ici = true; bas = i; }
      else if (ici && db[i] < a.esikK[i]) { ici = false; ham.push([bas, i]); }
    }
    if (ici) ham.push([bas, n]);
    // 20 ms'den kısa boşlukları birleştir, 30 ms'den kısa konuşmayı at (tıkırtı)
    var bl = [];
    ham.forEach(function (s) {
      var son = bl[bl.length - 1];
      if (son && s[0] - son[1] < 2) son[1] = s[1];
      else bl.push([s[0], s[1]]);
    });
    bl = bl.filter(function (s) { return s[1] - s[0] >= 3; });
    // aktif'i başlangıç eşiğinin altına inen kenar pencerelerine doğru genişlet (alt-pencere sınırı için); sonra yüksek
    // bantta tabanının üstünde süren kenar (müzik / gürültü yatağının örttüğü sürtünmeli ünsüz) — komşu bölüme geçmez
    var ybd = a.yb;
    bl.forEach(function (s, si) {
      var x0 = s[0], x1 = s[1];
      while (x0 > 0 && db[x0 - 1] >= a.esikK[x0 - 1]) x0--;
      while (x1 < n && db[x1] >= a.esikK[x1]) x1++;
      if (ybd) {
        var alt = si > 0 ? bl[si - 1][1] : 0, ust = si + 1 < bl.length ? bl[si + 1][0] : n;
        var g0 = x0, g1 = x1, lim0 = Math.max(alt, x0 - YB_MAX), lim1 = Math.min(ust, x1 + YB_MAX);
        while (x0 > lim0 && ybd[x0 - 1] >= ybT[x0 - 1] + YB_PAY) x0--;
        while (x1 < lim1 && ybd[x1] >= ybT[x1] + YB_PAY) x1++;
        // tek pencerelik yüksek bant tıkırtıdır (sert kesilen sesin sıçraması; akı penceresi önceki karenin 96 örneğini
        // de görür): en az iki pencere sürmeyen genişleme yok sayılır
        if (g0 - x0 < 2) x0 = g0;
        if (x1 - g1 < 2) x1 = g1;
        s.ybBas = x0 < g0; s.ybSon = x1 > g1;
      }
      s[0] = x0; s[1] = x1;
      for (var j = x0; j < x1; j++) a.aktif[j] = 1;
    });
    for (i = 0; i < n; i++) a.aktifTop[i + 1] = a.aktifTop[i] + a.aktif[i];
    a.konusmaOrani = a.aktifTop[n] / n;

    // bölümler ve kesin (g = 1) sınırlar
    var onset = [], bitis = [];
    bl.forEach(function (s) {
      var tb = s.ybBas ? basSiniri(a, s[0], ybd, ybT) : basSiniri(a, s[0]);
      var ts = s.ybSon ? sonSiniri(a, s[1] - 1, ybd, ybT) : sonSiniri(a, s[1] - 1);
      if (!(ts > tb)) { tb = s[0] * HOP_SN; ts = s[1] * HOP_SN; }
      a.bolumler.push({ bas: ms(tb), son: ms(ts) });
      onset.push({ t: ms(tb), g: 1, k: s[0] });
      bitis.push({ t: ms(ts), g: 1, k: s[1] });
    });

    // akı tepeleri (bağlı konuşma içindeki kelime başları)
    var pref = new Float64Array(n + 1);
    for (i = 0; i < n; i++) pref[i + 1] = pref[i] + aki[i];
    // ölçek: bölüm başları DIŞINDAKİ konuşma pencerelerinde akının ortancası (sessizlikten çıkışın dev akısı ölçeği bozmasın)
    var bolumBasi = new Uint8Array(n);
    onset.forEach(function (x) { for (var j = Math.max(0, x.k - 4); j <= Math.min(n - 1, x.k + 4); j++) bolumBasi[j] = 1; });
    var akiAktif = [];
    for (i = 0; i < n; i++) if (a.aktif[i] && !bolumBasi[i]) akiAktif.push(aki[i]);
    var akiOrta = akiAktif.length ? yuzdelik(akiAktif, 0.5) : 0;
    if (!(akiOrta > 0)) akiOrta = 0.05;
    for (i = 1; i < n - 1; i++) {
      if (!a.aktif[i] || bolumBasi[i]) continue;
      var v = aki[i];
      var tepe = true;
      for (var j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) {
        if (j !== i && (aki[j] > v || (aki[j] === v && j < i))) { tepe = false; break; }
      }
      if (!tepe) continue;
      var w0 = Math.max(0, i - 50), w1 = Math.min(n, i + 51);
      var yerel = (pref[w1] - pref[w0]) / (w1 - w0);
      if (!(v > 2.5 * yerel && v > 5 * akiOrta)) continue;
      // tepeden sonraki 40 ms'de konuşma sürmeli (kelime başı, kuyruk yankısı değil)
      var mx = TABAN_DB;
      for (j = i; j < Math.min(n, i + 4); j++) if (db[j] > mx) mx = db[j];
      if (mx < a.esik[i]) continue;
      onset.push({ t: ms(akiZamani(a, i)), g: Math.round(kirp(v / (20 * akiOrta), 0.1, 0.9) * 1000) / 1000, k: i });
    }

    // bölüm içi enerji çukurları (kelime sonu): 8 dB'den derin düşüş, düşüşün en dik yeri
    for (i = 2; i < n - 2; i++) {
      if (!a.aktif[i] || !a.aktif[i - 1]) continue;
      var dus = db[i - 1] - db[i + 1];
      if (dus < 8) continue;
      if (db[i - 2] - db[i] > dus || db[i] - db[i + 2] > dus) continue;
      // çukur gerçekten bir dip olmalı: 60 ms içinde enerji geri yükselir ya da düşük kalır
      var dip = db[i + 1];
      if (dip > a.esik[i] + 6 && db[i + 1] > a.konusmaDb - 10) continue;
      var Pa = guc(db[i - 1]), Pi = guc(db[i]), Pb = guc(db[i + 1]);
      var fr = Pa > Pb ? kirp((Pi - Pb) / (Pa - Pb), 0, 1) : 0.5;
      var tt = (i + fr) * HOP_SN;
      var yakinBitis = bitis.some(function (x) { return Math.abs(x.t - tt) < 0.04; });
      if (yakinBitis) continue;
      bitis.push({ t: ms(tt), g: Math.round(kirp(dus / 24, 0.2, 0.9) * 1000) / 1000, k: i });
      i += 2;
    }

    onset.sort(function (x, y) { return x.t - y.t; });
    bitis.sort(function (x, y) { return x.t - y.t; });
    a.onsetler = onset.map(function (x) { return { t: x.t, g: x.g }; });
    a.bitisler = bitis.map(function (x) { return { t: x.t, g: x.g }; });
    return a;
  }

  /*
   * Konuşmanın başladığı pencere k: kısmen dolu olabilir. Taban üstü gücün bir sonraki (dolu) pencereye
   * oranı sesin k penceresinin ne kadarını kapladığını verir: başlangıç = (k + 1 − oran) × 10 ms.
   */
  // dizi / taban: verilmezse geniş bant (a.db / a.taban); yüksek bantla genişlemiş kenarda yüksek bant
  function basSiniri(a, k, dizi, taban) {
    var db = dizi || a.db, n = a.n;
    var Pn = guc((taban || a.taban)[k]);
    var Pk = guc(db[k]) - Pn;
    var Pd = k + 1 < n ? guc(db[k + 1]) - Pn : Pk;
    if (k + 2 < n) Pd = Math.max(Pd, Math.min(Pd * 1.5, guc(db[k + 2]) - Pn));
    var oran = Pd > 0 ? kirp(Pk / Pd, 0, 1) : 1;
    return (k + 1 - oran) * HOP_SN;
  }
  // Konuşmanın son penceresi k: bitiş = (k + oran) × 10 ms (oran k'nın bir önceki dolu pencereye göre gücü)
  function sonSiniri(a, k, dizi, taban) {
    var db = dizi || a.db;
    var Pn = guc((taban || a.taban)[k]);
    var Pk = guc(db[k]) - Pn;
    var Pd = k > 0 ? guc(db[k - 1]) - Pn : Pk;
    if (k > 1) Pd = Math.max(Pd, Math.min(Pd * 1.5, guc(db[k - 2]) - Pn));
    var oran = Pd > 0 ? kirp(Pk / Pd, 0, 1) : 1;
    return (k + oran) * HOP_SN;
  }
  /*
   * Akı tepesi i: pencere karenin sonunda bittiği için değişim i. pencerede (ya da Hann kenarında kalıp i+1'de)
   * görünür. Tepe çevresinde 3 dB'den büyük enerji sıçraması varsa alt-pencere sınırı oradan; yoksa
   * akının iki komşusuna göre parabolik tepe konumu.
   */
  function akiZamani(a, i) {
    var db = a.db, aki = a.aki, n = a.n, enIyi = -1, enFark = 3;
    for (var j = Math.max(1, i - 2); j <= Math.min(n - 2, i + 1); j++) {
      var fark = db[j + 1] - db[j - 1];
      if (fark > enFark) { enFark = fark; enIyi = j; }
    }
    if (enIyi > 0) {
      var P0 = guc(db[enIyi - 1]), P1 = guc(db[enIyi]), P2 = guc(db[enIyi + 1]);
      var oran = P2 > P0 ? kirp((P1 - P0) / (P2 - P0), 0, 1) : 0.5;
      return (enIyi + 1 - oran) * HOP_SN;
    }
    var y0 = aki[i - 1], y1 = aki[i], y2 = aki[i + 1];
    var pay = y0 - 2 * y1 + y2;
    var del = pay < 0 ? kirp(0.5 * (y0 - y2) / pay, -0.5, 0.5) : 0;
    // Hann penceresinin ağırlık merkezi karenin başından ~2 ms sonra: değişim tepe penceresinin başında
    return Math.max(0, (i + del) * HOP_SN);
  }

  /* ---------------- Yardımcılar ---------------- */

  // [bas, son) aralığında (sn, analiz ekseni) konuşma penceresi oranı 0..1
  function konusmaOrani(a, bas, son) {
    if (!a || !a.n) return 0;
    var h = a.hop || HOP_SN;
    var f0 = Math.floor(bas / h), f1 = Math.ceil(son / h);
    if (f1 <= f0) f1 = f0 + 1;
    var top = 0, say = f1 - f0;
    var x0 = kirp(f0, 0, a.n), x1 = kirp(f1, 0, a.n);
    if (x1 > x0) top = a.aktifTop[x1] - a.aktifTop[x0];
    return top / say;
  }

  // t'ye en yakın öğe (liste t'ye göre sıralı); { i, x, d } | null
  function enYakin(liste, t) {
    if (!liste || !liste.length) return null;
    var lo = 0, hi = liste.length - 1;
    while (lo < hi) { var m = (lo + hi) >> 1; if (liste[m].t < t) lo = m + 1; else hi = m; }
    var en = lo;
    if (lo > 0 && Math.abs(liste[lo - 1].t - t) <= Math.abs(liste[lo].t - t)) en = lo - 1;
    return { i: en, x: liste[en], d: Math.abs(liste[en].t - t) };
  }
  // [a, b] aralığındaki öğeler
  function aralikta(liste, a, b) {
    var out = [];
    if (!liste || !liste.length) return out;
    var lo = 0, hi = liste.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (liste[m].t < a) lo = m + 1; else hi = m; }
    for (var i = lo; i < liste.length && liste[i].t <= b; i++) out.push(liste[i]);
    return out;
  }

  function analizEt(pcm, o) {
    var an = analizci(o);
    an.besle(pcm);
    return an.bitir();
  }

  function sonrakiTur(fn) {
    if (typeof setImmediate === "function") setImmediate(fn); else setTimeout(fn, 0);
  }

  // Bellekteki PCM'i parça parça işler, arada olay döngüsüne döner; o.iptal (K.iptalJetonu) iptal ederse { iptal: true }
  function analizEtAsync(pcm, o) {
    o = o || {};
    var parca = Math.max(HOP, Math.floor(num(o.parca, SR * 30)));
    var an = analizci(o);
    var i = 0;
    var bayt = !(pcm instanceof Float32Array || pcm instanceof Float64Array || pcm instanceof Int16Array);
    if (bayt && parca % 2) parca++;
    return new Promise(function (resolve, reject) {
      function adim() {
        try {
          if (o.iptal && o.iptal.iptalEdildi) { resolve({ iptal: true }); return; }
          var son = Math.min(pcm.length, i + parca);
          an.besle(pcm.subarray ? pcm.subarray(i, son) : pcm.slice(i, son));
          i = son;
          if (typeof o.onIlerleme === "function") { try { o.onIlerleme(pcm.length ? i / pcm.length : 1); } catch (e0) {} }
          if (i >= pcm.length) { resolve(an.bitir()); return; }
          sonrakiTur(adim);
        } catch (e) { reject(e); }
      }
      adim();
    });
  }

  /* ---------------- ffmpeg çıkarma + önbellek ---------------- */

  function cikarmaArgs(media, inPoint, dur) {
    var a = ["-hide_banner", "-nostdin", "-nostats"];
    if (num(inPoint, 0) > 0) a.push("-ss", String(ms(num(inPoint, 0))));
    if (num(dur, 0) > 0) a.push("-t", String(ms(num(dur, 0))));
    return a.concat(["-i", String(media), "-map", "0:a:0?", "-vn", "-af", ZAMAN_SUZGECI,
      "-ac", "1", "-ar", String(SR), "-acodec", "pcm_s16le", "-f", "s16le", "pipe:1"]);
  }

  // FNV-1a 32 bit (onbellek anahtarı kısa kalsın; yol ve aralık açık metin olarak taşınmaz)
  function ozet(s) {
    s = String(s);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  function anahtar(media, inPoint, dur, st) {
    var ek = st ? "|" + num(st.size, 0) + "|" + Math.round(num(st.mtimeMs, num(st.mtime && st.mtime.getTime && st.mtime.getTime(), 0))) : "";
    var ham = "v" + SURUM + "|" + String(media) + "|" + num(inPoint, 0).toFixed(3) + "|" + num(dur, 0).toFixed(3) + ek;
    return ozet(ham) + ozet(ham.split("").reverse().join("")) + "-" + ham.length;
  }

  // LRU: en çok 6 analiz ya da toplam ~2,5 M pencere (≈ 7 saat ses, ~30 MB)
  var ONB_MAX = 6, ONB_KARE = 2500000;
  var onbSira = [], onbVeri = {};
  var onbellek = {
    al: function (k) {
      if (!Object.prototype.hasOwnProperty.call(onbVeri, k)) return null;
      onbSira.splice(onbSira.indexOf(k), 1); onbSira.push(k);
      return onbVeri[k];
    },
    koy: function (k, v) {
      if (Object.prototype.hasOwnProperty.call(onbVeri, k)) onbSira.splice(onbSira.indexOf(k), 1);
      onbSira.push(k); onbVeri[k] = v;
      var top = 0, i;
      for (i = 0; i < onbSira.length; i++) top += onbVeri[onbSira[i]].n || 0;
      while (onbSira.length > 1 && (onbSira.length > ONB_MAX || top > ONB_KARE)) {
        var at = onbSira.shift();
        top -= onbVeri[at].n || 0;
        delete onbVeri[at];
      }
    },
    temizle: function () { onbSira = []; onbVeri = {}; },
    boyut: function () { return onbSira.length; }
  };

  function dosyaBilgisi(K, media) {
    try { if (K && K.fs && K.fs.statSync) return K.fs.statSync(String(media)); } catch (e) {}
    return null;
  }

  /*
   * o: { K, media, inPoint, dur, iptal, onIlerleme(oran 0..1), onbellek: false (okuma da yazma da yok) }
   * Döner: { analiz, onbellekten } | { iptal: true } | { neden: "ffmpeg" | "kopru" | "kod ..." | "ses yok" }
   * analiz.t0 = 0: klibin inPoint'i. Çağıran sekans zamanına çevirirken klibin timeline başını t0'a yazar.
   */
  function sesZarfiCikar(o) {
    o = o || {};
    var K = o.K || (typeof window !== "undefined" ? window.K : null);
    var dur = num(o.dur, 0);
    if (!K || typeof K.runAkis !== "function" || typeof K.findFfmpeg !== "function") return Promise.resolve({ neden: "kopru" });
    if (o.iptal && o.iptal.iptalEdildi) return Promise.resolve({ iptal: true });
    var st = dosyaBilgisi(K, o.media);
    var k = anahtar(o.media, o.inPoint, dur, st);
    if (o.onbellek !== false) {
      var hazir = onbellek.al(k);
      if (hazir) return Promise.resolve({ analiz: hazir, onbellekten: true, anahtar: k });
    }
    return Promise.resolve(K.findFfmpeg()).then(function (ff) {
      if (!ff) return { neden: "ffmpeg" };
      if (o.iptal && o.iptal.iptalEdildi) return { iptal: true };
      var an = analizci();
      var sonOran = -1;
      return K.runAkis(ff, cikarmaArgs(o.media, o.inPoint, dur), {
        timeout: Math.max(300000, dur * 2000), iptal: o.iptal || null,
        onData: function (b) {
          an.besle(b);
          if (typeof o.onIlerleme === "function" && dur > 0) {
            var oran = kirp(an.ornek() / (dur * SR), 0, 1);
            if (oran - sonOran >= 0.01) { sonOran = oran; try { o.onIlerleme(oran); } catch (e0) {} }
          }
        }
      }).then(function (res) {
        if ((res && res.iptal) || (o.iptal && o.iptal.iptalEdildi)) return { iptal: true };
        if (!res || res.code !== 0) {
          var son = String(res && res.stderr || "").split("\n").filter(function (s) { return s.replace(/\s+/g, ""); }).slice(-1)[0] || "";
          return { neden: "kod " + (res ? res.code : "?") + (res && res.hata ? " " + res.hata : "") + (son ? " " + son.slice(0, 160) : "") };
        }
        var analiz = an.bitir();
        if (!analiz.n) return { neden: "ses yok" };
        // onbellek: false (geçici ses dosyası) önbelleğe yazılmaz: sınırlı önbellekte gerçek kliplerin analizini düşürmesin
        if (o.onbellek !== false) onbellek.koy(k, analiz);
        if (K.log) K.log("[senkron] zarf: " + analiz.n + " pencere, kontrast " + analiz.kontrast.toFixed(1) + " dB, " +
          analiz.onsetler.length + " başlangıç, konuşma %" + Math.round(analiz.konusmaOrani * 100));
        return { analiz: analiz, onbellekten: false, anahtar: k };
      });
    });
  }

  return {
    SURUM: SURUM, SR: SR, HOP: HOP, HOP_SN: HOP_SN, ZAMAN_SUZGECI: ZAMAN_SUZGECI,
    analizci: analizci,
    analizEt: analizEt,
    analizEtAsync: analizEtAsync,
    cikarmaArgs: cikarmaArgs,
    sesZarfiCikar: sesZarfiCikar,
    anahtar: anahtar,
    onbellek: onbellek,
    konusmaOrani: konusmaOrani,
    enYakin: enYakin,
    aralikta: aralikta,
    yuzdelik: yuzdelik,
    _ozetle: ozetle
  };
});
