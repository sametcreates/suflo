/*
 * Suflo — Altyazı senkron doğrulama ve hizalama motoru (senkron doğrulama, adım 2)
 *
 * Transkripsiyonun kelime / kart zamanlarını js/ses-zarf.js'nin çıkardığı ses analiziyle (enerji zarfı,
 * konuşma başlangıçları / bitişleri, konuşma bölümleri) karşılaştırır ve düzeltir. İç hesap milisaniye
 * çözünürlüktedir; kareye yuvarlama yalnız kart giriş / çıkışında ve istenirse yapılır (opts.fps).
 *
 *   hizala(kartlar, analiz, opts) -> { kartlar, rapor }
 *       kartlar: [{ start, end, text, words?: [{ start, end, text, ... }] , ... }] (sn, sekans zamanı)
 *       Girdi DEĞİŞTİRİLMEZ; dönen kartlar ve kelimeler kopyadır, bilinmeyen alanlar korunur.
 *       rapor: { duzeltilen, degisimOrtancaMs (değişenlerin başı ne kadar oynadı, ortanca), ortalamaOnceMs, ortalamaSonraMs
 *                (en yakın konuşma başlangıcına uzaklık: yaslamanın kendi hedefi, iç ölçü; doğruluk değildir), eminDegil: [...],
 *                kayma: { ms, guven, uygulandi, egim? (ppm: giderek büyüyen kayma doğrusu uygulandıysa) },
 *                kelimeGuven: [...], kartGuven: [...], kontrastDb, atlandi: null | neden, kelime, kart }
 *   kaymaBul(ogeler, analiz, opts)       -> { ms, guven, uygulanabilir }  (toplam gecikme)
 *   kelimeleriYasla(kelimeler, analiz, opts) -> { kelimeler, guven: [...], neden: [...] }
 *   kartlariYasla(kartlar, analiz, opts) -> kartlar (giriş / çıkış, çakışmasız)
 *   kareHizi(fps), kareNo(t, fps, yon), kareyeYuvarla(t, fps, yon), zamanKodu(t, fps, { dropFrame })
 *
 * Kurallar:
 *   - Kelime başı ±pencereMs (varsayılan 120) içindeki en uygun konuşma başlangıcına yaslanır; bitiş enerji
 *     düşüşüne (ya da bitişik kelimede sonraki kelimenin başına). Sıra korunur, kelimeler çakışmaz,
 *     en kısa kelime minKelimeMs (60). Başlangıç seçimi tüm kelimeler üzerinde dinamik programlamayla:
 *     iki kelime aynı başlangıcı paylaşamaz.
 *   - Toplam kayma: kelime / boşluk düzeninin konuşma etkinliğiyle ve başlangıçlarla ilintisi ±maxKaymaMs
 *     (800) içinde taranır, en iyi gecikme başlangıç farklarının ortancasıyla inceltilir. Tepe belirgin değilse
 *     (güven < 0,5) uygulanmaz. Kayma zamanla büyüyorsa (hız farkı: 23,976 / 24, yanlış etiketli örnekleme hızı) ~30 sn'lik
 *     kayan pencerelerin kaymalarına doğru oturtulur (Theil–Sen) ve her sınır kendi zamanındaki kaymayla düzeltilir;
 *     pencereler birbirini tutmuyorsa hiçbir şeye dokunulmaz (atlandi "kayma").
 *   - ASLA aşırı düzeltme yok: ses kontrastı düşükse (gürültü / müzik altında konuşma, kontrastMinDb 10)
 *     ya da konuşma neredeyse hiç yoksa zamanlar OLDUĞU GİBİ kalır, kartlar "emin değil" işaretlenir.
 *     Bir kelimenin yeni aralığı eskisinden belirgin daha az konuşma içeriyorsa o kelime geri alınır;
 *     tüm hizalama genel uyumu kötüleştiriyorsa hiçbir şey değişmez.
 *   - Kart: giriş = ilk kelimenin başı − onPayMs (0..40, varsayılan 20), çıkış = son kelimenin sonu +
 *     kuyrukMs (150), en az minKartMs (300); sessizlikte asılı kalmaz, sonraki kartla çakışmaz, kelimeler kartın içinde kalır.
 *   - Bitişik kelimeler arasındaki sınırda enerji çukuru varsa sınır doğrulanmış sayılır: önceki kelimenin içindeki
 *     hece / ünsüz başlangıcına çekilmez.
 *
 * Saf UMD modülü: DOM / Premiere / ffmpeg yok. ES5 (CEF 74 / Node 12). Testler: tests/test-senkron.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloSenkron = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var VARSAYILAN = {
    pencereMs: 120,       // kelime sınırı yaslama penceresi
    minKelimeMs: 60,
    maxKaymaMs: 800,      // toplam kayma taraması
    minKaymaMs: 30,       // bundan küçük toplam kayma uygulanmaz (kelime yaslaması zaten kapatır)
    kaymaGuvenMin: 0.5,
    kaymaUygula: true,
    onPayMs: 20,          // kart girişi ilk kelimeden bu kadar önce (0..40)
    kuyrukMs: 150,        // kart çıkışı son kelimeden bu kadar sonra
    minKartMs: 300,
    kontrastMinDb: 10,
    konusmaMinOran: 0.02,
    guvenEsik: 0.5,       // altı "emin değil"
    uyumMin: 0.3,         // kelime düzeni sesle bundan az örtüşüyorsa (−1..1) hiçbir şeye dokunulmaz
    baslangicUyumMin: 0.5, // kelimesiz kartlarda: kart başlarının başlangıçlara oturma oranı (rastlantıya göre, 0..1)
    fps: 0                // > 0: kart giriş / çıkışı kareye yuvarlanır
  };

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function ms(t) { return Math.round(t * 1000) / 1000; }
  function kirp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function kopya(o) {
    var y = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) y[k] = o[k];
    return y;
  }
  function ayar(opts) {
    var a = kopya(VARSAYILAN);
    if (opts) for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k) && opts[k] !== undefined) a[k] = opts[k];
    a.pencereMs = kirp(num(a.pencereMs, 120), 10, 1000);
    a.minKelimeMs = kirp(num(a.minKelimeMs, 60), 1, 1000);
    a.maxKaymaMs = kirp(num(a.maxKaymaMs, 800), 0, 5000);
    a.onPayMs = kirp(num(a.onPayMs, 20), 0, 40);
    a.kuyrukMs = kirp(num(a.kuyrukMs, 150), 0, 1000);
    a.minKartMs = kirp(num(a.minKartMs, 300), 1, 5000);
    return a;
  }
  function gecerli(w) { return w && isFinite(Number(w.start)) && isFinite(Number(w.end)) && Number(w.end) >= Number(w.start); }

  /* ---------------- Analiz erişimi ---------------- */

  function hopOf(a) { return a.hop || 0.01; }
  function oran(a, bas, son) {
    var h = hopOf(a);
    var f0 = Math.floor(bas / h + 1e-9), f1 = Math.ceil(son / h - 1e-9);
    if (f1 <= f0) f1 = f0 + 1;
    var x0 = kirp(f0, 0, a.n), x1 = kirp(f1, 0, a.n);
    var top = x1 > x0 ? a.aktifTop[x1] - a.aktifTop[x0] : 0;
    return top / (f1 - f0);
  }
  function enYakin(liste, t) {
    if (!liste || !liste.length) return null;
    var lo = 0, hi = liste.length - 1;
    while (lo < hi) { var m = (lo + hi) >> 1; if (liste[m].t < t) lo = m + 1; else hi = m; }
    var en = lo;
    if (lo > 0 && Math.abs(liste[lo - 1].t - t) <= Math.abs(liste[lo].t - t)) en = lo - 1;
    return { i: en, x: liste[en], d: Math.abs(liste[en].t - t) };
  }
  function aralikta(liste, a, b) {
    var out = [];
    if (!liste || !liste.length) return out;
    var lo = 0, hi = liste.length;
    while (lo < hi) { var m = (lo + hi) >> 1; if (liste[m].t < a) lo = m + 1; else hi = m; }
    for (var i = lo; i < liste.length && liste[i].t <= b; i++) out.push(liste[i]);
    return out;
  }
  function analizGecerli(a) {
    return !!(a && a.n > 0 && a.aktifTop && a.aktifTop.length === a.n + 1 && a.onsetler && a.bitisler);
  }
  // Ses güvenilir mi: { tamam, neden }
  function sesDurumu(a, o) {
    if (!analizGecerli(a)) return { tamam: false, neden: "analizYok" };
    if (!(a.kontrast >= o.kontrastMinDb)) return { tamam: false, neden: "dusukKontrast" };
    if (!(a.konusmaOrani >= o.konusmaMinOran)) return { tamam: false, neden: "konusmaYok" };
    // neredeyse her yer "konuşma": sürekli müzik / gürültü yatağı
    if (a.konusmaOrani > 0.97) return { tamam: false, neden: "dusukKontrast" };
    return { tamam: true, neden: null };
  }

  /* ---------------- Toplam kayma ---------------- */

  /*
   * ogeler: [{ start, end }] analiz ekseninde (sn). Puan(gecikme) =
   *   kelime içi konuşma oranı (+) ve kelimeler arası boşluktaki konuşma (−), süreyle ağırlıklı, [-1, 1]
   *   + kelime başlarının ±20 ms'sindeki başlangıç gücü ortalaması (0..1)
   * En iyi gecikmenin ±100 ms dışındaki en iyi rakibe üstünlüğü güveni verir.
   */
  // başlangıç gücü dizisi: her pencere için ±2 pencere içindeki en güçlü başlangıç (son analiz için saklanır: kayan
  // pencerelerle kayma ararken her pencere yeniden kurmasın)
  var ogSakla = { a: null, n: -1, sayi: -1, og: null };
  function baslangicGucu(a) {
    if (ogSakla.a === a && ogSakla.n === a.n && ogSakla.sayi === a.onsetler.length) return ogSakla.og;
    var h = hopOf(a), n = a.n, og = new Float32Array(n);
    a.onsetler.forEach(function (x) {
      var k = Math.round(x.t / h);
      for (var j = Math.max(0, k - 2); j <= Math.min(n - 1, k + 2); j++) if (x.g > og[j]) og[j] = x.g;
    });
    ogSakla = { a: a, n: n, sayi: a.onsetler.length, og: og };
    return og;
  }

  function kaymaBul(ogeler, a, opts) {
    var o = ayar(opts);
    var sonuc = { ms: 0, guven: 0, uygulanabilir: false, puan0: 0, puan: 0, uyum: null, baslangicUyum: null };
    if (!analizGecerli(a)) return sonuc;
    var liste = (ogeler || []).filter(gecerli).map(function (w) { return { s: Number(w.start), e: Number(w.end) }; });
    if (!liste.length) return sonuc;
    var h = hopOf(a), n = a.n, i;
    var og = baslangicGucu(a);
    var bosluklar = [];
    for (i = 0; i + 1 < liste.length; i++) {
      var gs = liste[i].e, ge = liste[i + 1].s;
      if (ge - gs >= 0.08 && ge - gs <= 2) bosluklar.push({ s: gs, e: ge });
    }
    var topSure = 0;
    liste.forEach(function (w) { topSure += Math.max(h, w.e - w.s); });
    bosluklar.forEach(function (g) { topSure += g.e - g.s; });
    // 4'ten az öğede kayma aranmaz (tepe anlamsız), yalnız gecikmesiz uyum ölçülür
    var adim = 10, L = liste.length < 4 ? 0 : Math.round(o.maxKaymaMs / adim);
    var puanlar = new Float64Array(2 * L + 1), uyumlar = new Float64Array(2 * L + 1);
    for (var li = -L; li <= L; li++) {
      var d = li * adim / 1000, A = 0, B = 0;
      for (i = 0; i < liste.length; i++) {
        var w = liste[i], sure = Math.max(h, w.e - w.s);
        A += sure * (2 * oran(a, w.s + d, w.e + d) - 1);
        var k = Math.round((w.s + d) / h);
        if (k >= 0 && k < n) B += og[k];
      }
      for (i = 0; i < bosluklar.length; i++) {
        var g = bosluklar[i];
        A += (g.e - g.s) * (1 - 2 * oran(a, g.s + d, g.e + d));
      }
      uyumlar[li + L] = A / topSure;
      puanlar[li + L] = A / topSure + B / liste.length - 0.00005 * Math.abs(li);
    }
    var en = 0;
    for (i = 1; i < puanlar.length; i++) if (puanlar[i] > puanlar[en]) en = i;
    var rakip = -Infinity, ayrim = Math.round(100 / adim);
    for (i = 0; i < puanlar.length; i++) if (Math.abs(i - en) > ayrim && puanlar[i] > rakip) rakip = puanlar[i];
    var enMs = (en - L) * adim;
    var p0 = puanlar[L];
    // inceltme: kaydırılmış kelime başlarına ±50 ms içindeki başlangıçların farkının ortancası
    var farklar = [];
    liste.forEach(function (w) {
      var y = enYakin(a.onsetler, w.s + enMs / 1000);
      if (y && y.d <= 0.05) farklar.push(y.x.t - (w.s + enMs / 1000));
    });
    // başlangıç uyumu: kaydırılmış başların ±50 ms'sinde başlangıç bulunan oranı, rastlantı oranına göre (0 = rastgele)
    var sans = Math.min(0.95, a.onsetler.length / Math.max(0.01, a.n * h) * 0.1);
    sonuc.baslangicUyum = Math.round((farklar.length / liste.length - sans) / (1 - sans) * 1000) / 1000;
    var ince = 0, yay = 1;
    if (farklar.length >= 3) {
      farklar.sort(function (x, y) { return x - y; });
      ince = farklar[Math.floor(farklar.length / 2)];
      var sap = farklar.map(function (x) { return Math.abs(x - ince); }).sort(function (x, y) { return x - y; });
      yay = sap[Math.floor(sap.length / 2)];
    }
    var ustunluk = rakip === -Infinity ? 1 : (puanlar[en] - rakip);
    var guven = kirp(ustunluk / 0.15, 0, 1) * kirp(farklar.length / Math.max(4, liste.length * 0.3), 0, 1) * (yay <= 0.03 ? 1 : 0.5);
    sonuc.ms = Math.round(enMs + ince * 1000);
    sonuc.guven = Math.round(guven * 1000) / 1000;
    sonuc.puan0 = p0; sonuc.puan = puanlar[en];
    // kelime içi konuşma − boşluktaki konuşma (süre ağırlıklı, en iyi gecikmede): transkript bu sese ait mi
    sonuc.uyum = Math.round(uyumlar[en] * 1000) / 1000;
    sonuc.uygulanabilir = liste.length >= 4 && sonuc.guven >= o.kaymaGuvenMin && Math.abs(sonuc.ms) >= o.minKaymaMs && puanlar[en] - p0 >= 0.05;
    return sonuc;
  }

  /* ---------------- Giderek büyüyen kayma (hız farkı) ---------------- */

  function ortanca(d) {
    if (!d.length) return 0;
    var x = d.slice().sort(function (p, q) { return p - q; });
    var m = x.length >> 1;
    return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
  }

  /*
   * Transkriptin saati sesten biraz farklı hızda işliyorsa (23,976 / 24 dönüşümü, 48k diye etiketli 44,1k ses, değişken
   * kare hızlı telefon kaydı) kayma zamanla doğrusal büyür: tek toplam kayma ve ±pencere yaslaması onu kapatamaz.
   * ogeler (analiz ekseninde, başa göre sıralı) ~30 sn'lik, %50 örtüşen pencerelere bölünür (her biri en az 8 öğe);
   * her pencerede kaymaBul. Güvenli pencerelerden (≥ 3) Theil–Sen doğrusu: kayma(t) = a + b·t (ms, t sn).
   * Döner: { durum: "yok" | "dogru" | "tutarsiz", a, b, pencereler: [{ t, ms, guven }], artikMs, yayMs }
   *   dogru     ortanca artık ≤ 40 ms ve öngörülen kayma aralığı > 60 ms: uygulanabilir
   *   tutarsiz  pencereler birbirini tutmuyor (doğruya oturmuyor ya da az pencerede ms'ler pencereMs'ten çok açık)
   */
  var KAYAN_PENCERE = 30, KAYAN_ADIM = 15, KAYAN_MIN_OGE = 8, KAYAN_ARTIK_MS = 40, KAYAN_ARALIK_MS = 60;
  function kayanKayma(ogeler, a, o) {
    var sonuc = { durum: "yok", a: 0, b: 0, pencereler: [], artikMs: null, yayMs: 0 };
    var liste = (ogeler || []).filter(gecerli).slice().sort(function (p, q) { return Number(p.start) - Number(q.start); });
    if (liste.length < 2 * KAYAN_MIN_OGE) return sonuc;
    var ilk = Number(liste[0].start), son = Number(liste[liste.length - 1].start);
    var pen = [];
    for (var b0 = ilk; b0 === ilk || b0 + KAYAN_PENCERE / 2 <= son; b0 += KAYAN_ADIM) {
      var icinde = liste.filter(function (w) { var t = Number(w.start); return t >= b0 && t < b0 + KAYAN_PENCERE; });
      if (icinde.length < KAYAN_MIN_OGE) continue;
      var ky = kaymaBul(icinde, a, o);
      if (!(ky.guven >= o.kaymaGuvenMin)) continue;
      var tm = 0;
      icinde.forEach(function (w) { tm += Number(w.start); });
      pen.push({ t: tm / icinde.length, ms: ky.ms, guven: ky.guven });
    }
    sonuc.pencereler = pen;
    if (!pen.length) return sonuc;
    var msler = pen.map(function (p) { return p.ms; });
    sonuc.yayMs = Math.max.apply(null, msler) - Math.min.apply(null, msler);
    if (pen.length < 3) {
      if (sonuc.yayMs > o.pencereMs) sonuc.durum = "tutarsiz";
      return sonuc;
    }
    var egimler = [];
    for (var i = 0; i < pen.length; i++) for (var j = i + 1; j < pen.length; j++) {
      if (pen[j].t - pen[i].t > 1) egimler.push((pen[j].ms - pen[i].ms) / (pen[j].t - pen[i].t));
    }
    var b = ortanca(egimler);
    var aa = ortanca(pen.map(function (p) { return p.ms - b * p.t; }));
    var artik = ortanca(pen.map(function (p) { return Math.abs(p.ms - (aa + b * p.t)); }));
    sonuc.a = aa; sonuc.b = b; sonuc.artikMs = Math.round(artik * 10) / 10;
    var aralik = Math.abs(b) * (son - ilk);
    if (artik <= KAYAN_ARTIK_MS && aralik > KAYAN_ARALIK_MS) sonuc.durum = "dogru";
    else if (artik > KAYAN_ARTIK_MS && sonuc.yayMs > o.pencereMs) sonuc.durum = "tutarsiz";
    return sonuc;
  }

  /* ---------------- Kelime yaslama ---------------- */

  /*
   * kelimeler: [{ start, end, ... }] analiz ekseninde. Geçersiz zamanlı kelime olduğu gibi kalır ve atlanır.
   * Döner: { kelimeler (kopya), guven: [0..1], neden: [null | "sessizlik" | "onsetYok"] }
   */
  function kelimeleriYasla(kelimeler, a, opts) {
    var o = ayar(opts);
    var W = o.pencereMs / 1000, minD = o.minKelimeMs / 1000;
    var out = (kelimeler || []).map(kopya);
    var idx = [];
    for (var i = 0; i < out.length; i++) if (gecerli(out[i])) idx.push(i);
    var guven = out.map(function () { return 0; }), neden = out.map(function () { return null; });
    if (!idx.length || !analizGecerli(a)) return { kelimeler: out, guven: guven, neden: neden };
    var S = idx.map(function (k) { return Number(out[k].start); });
    var E = idx.map(function (k) { return Number(out[k].end); });
    var m = idx.length, j;

    // 1) başlangıçlar: DP (aday = pencere içi başlangıçlar + "olduğu gibi")
    var adaylar = [];
    for (j = 0; j < m; j++) {
      var c = [];
      var sesteMi = oran(a, S[j], S[j] + 0.05) > 0.5;
      // olduğu gibi kalmanın bedeli: başı sessizliğe düşüyorsa yaslamaya daha istekli
      var kal = sesteMi ? 0 : 0.5;
      // bitişik kelime sınırı sesle doğrulanıyorsa (tam orada, ±25 ms, enerji çukuru / düşüşü var) yerinde kalmak
      // ödüllendirilir: bağlı konuşmada kelime sınırında başlangıç bulunmayabilir; en yakın başlangıç önceki
      // kelimenin içindeki bir hece ya da patlamalı ünsüz (p / t / k kapanması) olur ve doğru kelimeyi ~100 ms kaydırırdı.
      // Ödül tam değil (0,9 g): çukurun hemen ardındaki (~35 ms içi) güçlü başlangıç yine kazanır (kısa sessizlik sonrası)
      if (sesteMi && j > 0 && S[j] - E[j - 1] <= 0.03) {
        var yb = enYakin(a.bitisler, S[j]);
        if (yb && yb.d <= 0.025) kal = -0.9 * yb.x.g;
      }
      c.push({ t: S[j], cost: kal, onset: null });
      aralikta(a.onsetler, S[j] - W, S[j] + W).forEach(function (x) {
        var d = (x.t - S[j]) / W;
        c.push({ t: x.t, cost: d * d - x.g, onset: x });
      });
      adaylar.push(c);
    }
    var maliyet = [], geri = [];
    for (j = 0; j < m; j++) {
      var cj = adaylar[j], mj = [], gj = [];
      for (var p = 0; p < cj.length; p++) {
        if (j === 0) { mj.push(cj[p].cost); gj.push(-1); continue; }
        var enM = Infinity, enP = -1, cp = adaylar[j - 1];
        for (var q = 0; q < cp.length; q++) {
          var ceza = cj[p].t - cp[q].t >= minD - 1e-9 ? 0 : 10;
          // aynı başlangıcı iki kelime alamaz
          if (cj[p].onset && cj[p].onset === cp[q].onset) ceza = 20;
          var v = maliyet[j - 1][q] + ceza;
          if (v < enM) { enM = v; enP = q; }
        }
        mj.push(enM + cj[p].cost); gj.push(enP);
      }
      maliyet.push(mj); geri.push(gj);
    }
    var secim = new Array(m), son = maliyet[m - 1], enI = 0;
    for (j = 1; j < son.length; j++) if (son[j] < son[enI]) enI = j;
    for (j = m - 1; j >= 0; j--) { secim[j] = adaylar[j][enI]; enI = geri[j][enI]; }
    var yS = secim.map(function (x) { return x.t; });

    // 2) bitişler
    var yE = new Array(m);
    for (j = 0; j < m; j++) {
      var sonraki = j + 1 < m ? yS[j + 1] : Infinity;
      var bitisik = j + 1 < m && S[j + 1] - E[j] <= 0.03;
      var sessizde = oran(a, E[j] - 0.03, E[j]) < 0.5;
      var ilk = Math.max(yS[j] + minD, E[j] - (sessizde ? 2 * W : W));
      var cE = [{ t: E[j], cost: sessizde ? 0.5 : 0 }];
      aralikta(a.bitisler, ilk, E[j] + W).forEach(function (x) {
        if (x.t > sonraki + 1e-9) return;
        var d = (x.t - E[j]) / W;
        if (d < -1) d = -1;
        cE.push({ t: x.t, cost: d * d - x.g });
      });
      if (j + 1 < m && Math.abs(sonraki - E[j]) <= W) {
        var d2 = (sonraki - E[j]) / W;
        cE.push({ t: sonraki, cost: d2 * d2 - (bitisik ? 0.9 : 0.2) });
      }
      var en2 = cE[0];
      for (var r = 1; r < cE.length; r++) if (cE[r].cost < en2.cost) en2 = cE[r];
      yE[j] = en2.t;
    }

    // 3) aşırı düzeltme denetimi (kelime başına): yeni aralık belirgin daha az konuşma içeriyorsa geri al
    for (j = 0; j < m; j++) {
      var once = oran(a, S[j], E[j]), sonra = oran(a, yS[j], yE[j]);
      if (sonra < once - 0.2) { yS[j] = S[j]; yE[j] = E[j]; secim[j] = { t: S[j], onset: null }; }
    }

    // 4) sıra / çakışma / en kısa süre (tek yönlü süpürme: hiçbir kelime öncekine binmez). Sonraki kelimenin başı
    // en kısa süreye yer bırakıyorsa bu kelimenin sonu oraya kısalır; bırakmıyorsa en kısa süre korunur, sonraki itilir.
    for (j = 0; j < m; j++) {
      if (j > 0 && yS[j] < yE[j - 1]) yS[j] = yE[j - 1];
      if (yE[j] < yS[j] + minD) yE[j] = yS[j] + minD;
      if (j + 1 < m && yE[j] > yS[j + 1]) yE[j] = Math.max(yS[j] + minD, yS[j + 1]);
    }

    // 5) güven
    for (j = 0; j < m; j++) {
      var sr = oran(a, yS[j], yE[j]);
      var y = enYakin(a.onsetler, yS[j]);
      var yakinlik = y ? kirp(1 - y.d / W, 0, 1) : 0;
      var gg = y && y.d <= W ? y.x.g : 0;
      var gv = 0.5 * sr + 0.3 * yakinlik + 0.2 * gg;
      var k = idx[j];
      guven[k] = Math.round(gv * 1000) / 1000;
      if (sr < 0.3) neden[k] = "sessizlik";
      else if (yakinlik === 0) neden[k] = "onsetYok";
      out[k].start = ms(yS[j]);
      out[k].end = ms(yE[j]);
    }
    return { kelimeler: out, guven: guven, neden: neden };
  }

  /* ---------------- Kart giriş / çıkış ---------------- */

  // kelimeler kartın içinde kalsın (kare yuvarlama / komşu kartla sınır yüzünden)
  function kelimeleriKartaSigdir(c) {
    if (!c.words) return;
    c.words.forEach(function (w) {
      if (!gecerli(w)) return;
      if (w.start < c.start) w.start = c.start;
      if (w.end > c.end) w.end = c.end;
      if (w.start > c.end) w.start = c.end;
      if (w.end < w.start) w.end = w.start;
    });
  }

  /*
   * kartlar analiz ekseninde. Kelimeli kart: giriş / çıkış kelimelerden. Kelimesiz kart: ±pencere içinde başlangıç /
   * bitişe yaslanır. Çıkış sessizlikte asılı kalmaz (son konuşma bitişi + kuyruk), sonraki kartın girişini geçmez;
   * önceki kartın son kelimesi kesilmez. opts.fps > 0: kareye yuvarlanır, kelimeler kart içinde kalır.
   */
  function kartlariYasla(kartlar, a, opts) {
    var o = ayar(opts);
    var W = o.pencereMs / 1000, onPay = o.onPayMs / 1000, kuyruk = o.kuyrukMs / 1000, minK = o.minKartMs / 1000;
    var guvenli = analizGecerli(a) && sesDurumu(a, o).tamam;
    var out = (kartlar || []).map(function (c) {
      var y = kopya(c);
      if (c && c.words) y.words = c.words.map(kopya);
      return y;
    });
    var sira = [];
    out.forEach(function (c, i) { if (gecerli(c)) sira.push(i); });
    var bilgi = sira.map(function (i) {
      var c = out[i];
      var ws = (c.words || []).filter(gecerli);
      var ilkK = ws.length ? Number(ws[0].start) : null, sonK = ws.length ? Number(ws[ws.length - 1].end) : null;
      var gir = Number(c.start), cik = Number(c.end);
      if (ws.length) {
        gir = ilkK - onPay;
        cik = sonK + kuyruk;
        // tek kısa kelimeli kart (ör. kelime kelime stil) göz kırpmasın: en az minKartMs ekranda (sonraki kart keser)
        if (cik - gir < minK) cik = gir + minK;
      } else if (guvenli) {
        var y1 = null;
        aralikta(a.onsetler, gir - W, gir + W).forEach(function (x) {
          var d = (x.t - gir) / W, cost = d * d - x.g;
          if (!y1 || cost < y1.cost) y1 = { t: x.t, cost: cost };
        });
        if (y1 && y1.cost < 0) { ilkK = y1.t; gir = y1.t - onPay; }
        var y2 = null;
        aralikta(a.bitisler, cik - W, cik + W).forEach(function (x) {
          if (x.t <= (ilkK !== null ? ilkK : gir) + 0.05) return;
          var d = (x.t - cik) / W, cost = d * d - x.g;
          if (!y2 || cost < y2.cost) y2 = { t: x.t, cost: cost };
        });
        if (y2 && y2.cost < 0) { sonK = y2.t; cik = y2.t + kuyruk; }
      }
      // kelimesiz kart sessizlikte asılı kalmasın: kart içindeki son konuşma bitişi + kuyruk (kelimeli kartta
      // çıkış zaten son kelimenin sonu + kuyruk; son kelime sessizliğe düşüyorsa o kelime işaretlenir, kart da)
      if (guvenli && !ws.length) {
        var basT = ilkK !== null ? ilkK : gir, sonKonusma = null;
        a.bolumler.forEach(function (b) { if (b.son <= cik + 1e-9 && b.son > basT) sonKonusma = b.son; });
        if (sonKonusma !== null && cik - sonKonusma > kuyruk + 0.05 && sonKonusma - gir >= minK) {
          sonK = sonKonusma; cik = sonKonusma + kuyruk;
        }
      }
      return { i: i, gir: gir, cik: cik, ilkK: ilkK, sonK: sonK };
    });
    // önceki kartın son kelimesi kesilmez; çakışma yok
    for (var k = 0; k < bilgi.length; k++) {
      var b = bilgi[k];
      if (b.gir < 0) b.gir = 0;
      if (k > 0) {
        var p = bilgi[k - 1];
        var altSinir = p.sonK !== null ? p.sonK : p.gir;
        if (b.gir < altSinir) b.gir = Math.min(altSinir, b.ilkK !== null ? b.ilkK : altSinir);
      }
      if (b.cik < b.gir + 0.001) b.cik = b.gir + 0.001;
    }
    for (k = 0; k + 1 < bilgi.length; k++) {
      if (bilgi[k].cik > bilgi[k + 1].gir) bilgi[k].cik = Math.max(bilgi[k].gir + 0.001, bilgi[k + 1].gir);
      if (bilgi[k].cik > bilgi[k + 1].gir) bilgi[k + 1].gir = bilgi[k].cik;
    }
    // kare yuvarlama: giriş en yakın kare (ilk kelimenin başını geçerse aşağı), çıkış en yakın (son kelimeyi kesiyorsa yukarı)
    // ızgara SEKANS zamanındadır: analiz ekseni klibin başından (kareOfset = t0) başlıyorsa ızgara ona göre kayar
    var fps = num(o.fps, 0), ofs = num(o.kareOfset, 0);
    function R(t, yon) { return kareyeYuvarla(t + ofs, fps, yon) - ofs; }
    if (fps > 0) {
      bilgi.forEach(function (b) {
        var g = R(b.gir, "yakin");
        if (b.ilkK !== null && g > b.ilkK + 0.0005) g = R(b.gir, "asagi");
        var c2 = R(b.cik, "yakin");
        if (b.sonK !== null && c2 < b.sonK - 0.0005) c2 = R(b.cik, "yukari");
        b.gir = g; b.cik = c2;
      });
      var kare = 1 / kareHizi(fps).deger;
      for (k = 0; k < bilgi.length; k++) {
        if (k > 0 && bilgi[k].gir < bilgi[k - 1].cik) bilgi[k].gir = bilgi[k - 1].cik;
        if (bilgi[k].cik < bilgi[k].gir + kare - 1e-6) bilgi[k].cik = R(bilgi[k].gir + kare, "yakin");
        if (k + 1 < bilgi.length && bilgi[k].cik > bilgi[k + 1].gir) bilgi[k + 1].gir = bilgi[k].cik;
      }
    }
    bilgi.forEach(function (b) {
      var c = out[b.i];
      c.start = fps > 0 ? b.gir : ms(b.gir);
      c.end = fps > 0 ? b.cik : ms(b.cik);
      kelimeleriKartaSigdir(c);
    });
    return out;
  }

  /* ---------------- Üst düzey ---------------- */

  function ortalama(d) {
    if (!d.length) return 0;
    var t = 0;
    for (var i = 0; i < d.length; i++) t += d[i];
    return t / d.length;
  }

  function hizala(kartlar, a, opts) {
    var o = ayar(opts);
    var t0 = num(o.t0, a && isFinite(a.t0) ? a.t0 : 0);
    var girdi = kartlar || [];
    var rapor = {
      duzeltilen: 0, degisimOrtancaMs: 0, ortalamaOnceMs: 0, ortalamaSonraMs: 0, eminDegil: [],
      kayma: { ms: 0, guven: 0, uygulandi: false },
      kelimeGuven: [], kartGuven: [], kontrastDb: a && isFinite(a.kontrast) ? Math.round(a.kontrast * 10) / 10 : 0,
      atlandi: null, uyum: null, kelime: 0, kart: girdi.length
    };
    // yerel eksen (analiz zamanı) <-> sekans zamanı
    function yerel(c) {
      var y = kopya(c);
      if (gecerli(c)) { y.start = Number(c.start) - t0; y.end = Number(c.end) - t0; }
      if (c && c.words) y.words = c.words.map(function (w) {
        var z = kopya(w);
        if (gecerli(w)) { z.start = Number(w.start) - t0; z.end = Number(w.end) - t0; }
        return z;
      });
      return y;
    }
    var fps = num(o.fps, 0);
    function sekans(c) {
      var y = kopya(c);
      if (gecerli(c)) {
        y.start = fps > 0 ? kareyeYuvarla(Number(c.start) + t0, fps) : ms(Number(c.start) + t0);
        y.end = fps > 0 ? kareyeYuvarla(Number(c.end) + t0, fps) : ms(Number(c.end) + t0);
      }
      if (c && c.words) {
        y.words = c.words.map(function (w) {
          var z = kopya(w);
          if (gecerli(w)) { z.start = ms(Number(w.start) + t0); z.end = ms(Number(w.end) + t0); }
          return z;
        });
        if (gecerli(y)) kelimeleriKartaSigdir(y);
      }
      return y;
    }
    function aynen() {
      return girdi.map(function (c) { var y = kopya(c); if (c && c.words) y.words = c.words.map(kopya); return y; });
    }
    var kartlarY = girdi.map(yerel);
    // düz kelime listesi (kart, kelime) eşlemesiyle
    var duz = [], harita = [];
    kartlarY.forEach(function (c, ci) {
      (c.words || []).forEach(function (w, wi) { duz.push(w); harita.push({ c: ci, w: wi }); });
    });
    rapor.kelime = duz.length;
    rapor.kelimeGuven = duz.map(function () { return 0; });
    rapor.kartGuven = girdi.map(function () { return 0; });
    var durum = sesDurumu(a, o);
    if (!girdi.length) { rapor.atlandi = "kartYok"; return { kartlar: [], rapor: rapor }; }
    if (!durum.tamam) {
      rapor.atlandi = durum.neden;
      girdi.forEach(function (c, ci) {
        if (gecerli(c)) rapor.eminDegil.push({ tur: "kart", kart: ci, metin: String(c.text || ""), bas: ms(Number(c.start)), son: ms(Number(c.end)), guven: 0, neden: durum.neden === "konusmaYok" ? "sessizlik" : "gurultu" });
      });
      return { kartlar: aynen(), rapor: rapor };
    }

    // 1) toplam kayma (kelime yoksa kartlar öğe sayılır)
    var ogeler = duz.length ? duz : kartlarY;
    var ky = kaymaBul(ogeler, a, o);
    rapor.kayma = { ms: ky.ms, guven: ky.guven, uygulandi: false };
    // kelime düzeni (kelime / boşluk) kartlardan çok daha ayırt edicidir; kelimesiz kartlar boşlukları da kapsar:
    // onlarda kart başlarının konuşma başlangıçlarına oturması ölçülür
    var uy = duz.length ? ky.uyum : ky.baslangicUyum;
    rapor.uyum = uy;
    var uyumsuz = uy !== null && uy < (duz.length ? o.uyumMin : o.baslangicUyumMin);
    function hepsiniIsaretle(neden) {
      girdi.forEach(function (c, ci) {
        if (gecerli(c)) rapor.eminDegil.push({ tur: "kart", kart: ci, metin: String(c.text || ""), bas: ms(Number(c.start)), son: ms(Number(c.end)), guven: 0, neden: neden });
      });
    }
    /*
     * Giderek büyüyen kayma: tek toplam kayma uygulanamıyorsa (ya da kelime düzeni hiçbir sabit gecikmede oturmuyorsa)
     * kayan pencerelerle doğrusal kayma aranır. Uygulanan toplam kayma varsa da doğru belirgin biçimde daha iyi
     * açıklıyorsa (pencereler doğruya oturuyor, aralık > 60 ms) doğru kullanılır. Pencereler birbirini tutmuyorsa
     * yaslama rastgele başlangıçlara çekmek olurdu: hiçbir şeye dokunulmaz, "kayma" nedeniyle işaretlenir.
     */
    var kayan = null;
    if (o.kaymaUygula !== false && ogeler.filter(gecerli).length >= 4) kayan = kayanKayma(ogeler, a, o);
    if (kayan && kayan.durum === "tutarsiz" && !ky.uygulanabilir && !uyumsuz) {
      rapor.atlandi = "kayma";
      rapor.kayma = { ms: ky.ms, guven: ky.guven, uygulandi: false, pencere: kayan.pencereler.length, yayMs: Math.round(kayan.yayMs) };
      hepsiniIsaretle("kayma");
      return { kartlar: aynen(), rapor: rapor };
    }
    var dogru = kayan && kayan.durum === "dogru" ? kayan : null;
    if (uyumsuz && !dogru) {
      // kelimeler / boşluklar sesin konuşma düzenine hiçbir gecikmede oturmuyor: transkript bu sesin değil
      // (yanlış klip, başka dil kaydı, ağır müzik). Yaslamak rastgele başlangıçlara çekmek olurdu.
      rapor.atlandi = "uyumsuz";
      hepsiniIsaretle("uyumsuz");
      return { kartlar: aynen(), rapor: rapor };
    }
    var d = 0;
    if (dogru) {
      // kayma(t) ms, t transkriptin (yerel eksen) zamanı; kartın ve kelimelerinin her sınırı kendi zamanındaki kaymayla
      var ilkT = Infinity, sonT = -Infinity;
      ogeler.forEach(function (w) { if (gecerli(w)) { ilkT = Math.min(ilkT, Number(w.start)); sonT = Math.max(sonT, Number(w.start)); } });
      var k0 = dogru.a + dogru.b * ilkT, k1 = dogru.a + dogru.b * sonT;
      rapor.kayma = { ms: Math.round(Math.abs(k1) > Math.abs(k0) ? k1 : k0), guven: Math.round(ortanca(dogru.pencereler.map(function (p) { return p.guven; })) * 1000) / 1000,
        uygulandi: true, egim: Math.round(dogru.b * 1000), basMs: Math.round(k0), sonMs: Math.round(k1), pencere: dogru.pencereler.length };
      var kd = function (t) { return t + (dogru.a + dogru.b * t) / 1000; };
      var kaydirD = function (w) { if (gecerli(w)) { w.start = kd(Number(w.start)); w.end = Math.max(w.start, kd(Number(w.end))); } };
      kartlarY.forEach(function (c) { kaydirD(c); (c.words || []).forEach(kaydirD); });
    } else if (o.kaymaUygula !== false && ky.uygulanabilir) { d = ky.ms / 1000; rapor.kayma.uygulandi = true; }
    function kaydir(w) { if (gecerli(w)) { w.start = Number(w.start) + d; w.end = Number(w.end) + d; } }
    if (d) kartlarY.forEach(function (c) { kaydir(c); (c.words || []).forEach(kaydir); });

    // ölçü: kelime / kart başlarının en yakın başlangıca uzaklığı (300 ms içinde eşleşenler)
    function sapmalar(liste) {
      var r = [];
      liste.forEach(function (w) {
        if (!gecerli(w)) { r.push(null); return; }
        var y = enYakin(a.onsetler, Number(w.start));
        r.push(y && y.d <= 0.3 ? y.d * 1000 : null);
      });
      return r;
    }
    function uyum(liste) {
      var t = 0, say = 0;
      liste.forEach(function (w) {
        if (!gecerli(w)) return;
        var y = enYakin(a.onsetler, Number(w.start));
        t += oran(a, Number(w.start), Number(w.end)) + (y ? 0.5 * kirp(1 - y.d / 0.3, 0, 1) * y.x.g : 0);
        say++;
      });
      return say ? t / say : 0;
    }
    var onceListe = [];
    if (duz.length) girdi.map(yerel).forEach(function (c) { (c.words || []).forEach(function (w) { onceListe.push(w); }); });
    else onceListe = girdi.map(yerel);
    var olcuOnce = sapmalar(onceListe);
    var uyumOnce = uyum(onceListe);

    // 2) kelimeler
    var sonucKelime = null;
    if (duz.length) {
      var kaydirilmis = [];
      kartlarY.forEach(function (c) { (c.words || []).forEach(function (w) { kaydirilmis.push(w); }); });
      sonucKelime = kelimeleriYasla(kaydirilmis, a, o);
      sonucKelime.kelimeler.forEach(function (w, k) { var h = harita[k]; kartlarY[h.c].words[h.w] = w; });
    }
    // 3) kartlar
    var kartAyar = kopya(o); kartAyar.kareOfset = t0;
    var yeniKartlar = kartlariYasla(kartlarY, a, kartAyar);
    var sonKelimeler = [];
    yeniKartlar.forEach(function (c) { (c.words || []).forEach(function (w) { sonKelimeler.push(w); }); });
    var uyumSonra = uyum(duz.length ? sonKelimeler : yeniKartlar);
    if (uyumSonra < uyumOnce - 0.02) {
      // hizalama genel uyumu kötüleştirdi: hiçbir şeye dokunma
      rapor.atlandi = "iyilesmedi";
      rapor.kayma.uygulandi = false;
      return { kartlar: aynen(), rapor: rapor };
    }
    var olcuSonra = sapmalar(duz.length ? sonKelimeler : yeniKartlar);
    var dO = [], dS = [];
    olcuOnce.forEach(function (v, k) { if (v !== null && olcuSonra[k] !== null) { dO.push(v); dS.push(olcuSonra[k]); } });
    rapor.ortalamaOnceMs = Math.round(ortalama(dO));
    rapor.ortalamaSonraMs = Math.round(ortalama(dS));

    var cikti = yeniKartlar.map(sekans);
    // düzeltilen sayısı (5 ms'den büyük değişim), güven ve "emin değil" listesi
    var esik = 0.005, degisim = [];
    if (duz.length) {
      var k2 = 0;
      girdi.forEach(function (c, ci) {
        var gTop = 0, gSay = 0;
        (c.words || []).forEach(function (w, wi) {
          var yeni = cikti[ci].words[wi];
          if (gecerli(w) && (Math.abs(Number(yeni.start) - Number(w.start)) > esik || Math.abs(Number(yeni.end) - Number(w.end)) > esik)) {
            rapor.duzeltilen++;
            degisim.push(Math.abs(Number(yeni.start) - Number(w.start)) * 1000);
          }
          var gv = sonucKelime.guven[k2], nd = sonucKelime.neden[k2];
          rapor.kelimeGuven[k2] = gv;
          if (gecerli(w)) { gTop += gv; gSay++; }
          if (gecerli(w) && (gv < o.guvenEsik || nd === "sessizlik")) {
            rapor.eminDegil.push({ tur: "kelime", kart: ci, kelime: wi, i: k2, metin: String(w.text || ""), bas: yeni.start, son: yeni.end, guven: gv, neden: nd || "onsetYok" });
          }
          k2++;
        });
        rapor.kartGuven[ci] = gSay ? Math.round(gTop / gSay * 1000) / 1000 : kartGuveni(cikti[ci]);
      });
    } else {
      girdi.forEach(function (c, ci) {
        var yeni = cikti[ci];
        if (gecerli(c) && (Math.abs(yeni.start - c.start) > esik || Math.abs(yeni.end - c.end) > esik)) {
          rapor.duzeltilen++;
          degisim.push(Math.abs(Number(yeni.start) - Number(c.start)) * 1000);
        }
        var gv = kartGuveni(yeni);
        rapor.kartGuven[ci] = gv;
        if (gecerli(c) && gv < o.guvenEsik) rapor.eminDegil.push({ tur: "kart", kart: ci, metin: String(c.text || ""), bas: yeni.start, son: yeni.end, guven: gv, neden: "onsetYok" });
      });
    }
    // değişenlerin başlarının ne kadar oynadığı (ortanca, ms). ortalamaOnceMs / SonraMs yaslamanın kendi hedefine
    // (en yakın başlangıç) uzaklıktır: yaslama onu her zaman küçültür, doğruluk ölçüsü olarak gösterilmez
    rapor.degisimOrtancaMs = Math.round(ortanca(degisim));
    function kartGuveni(c) {
      if (!gecerli(c)) return 0;
      var s = Number(c.start) - t0, e = Number(c.end) - t0;
      var y = enYakin(a.onsetler, s + o.onPayMs / 1000);
      var yak = y ? kirp(1 - y.d / (o.pencereMs / 1000), 0, 1) : 0;
      return Math.round((0.6 * oran(a, s, e) + 0.4 * yak) * 1000) / 1000;
    }
    return { kartlar: cikti, rapor: rapor };
  }

  /* ---------------- Kare hızı ---------------- */

  // 23.976 → 24000/1001, 29.97 → 30000/1001, 59.94 → 60000/1001; tam sayılar olduğu gibi
  function kareHizi(fps) {
    var f = num(fps, 0);
    if (!(f > 0)) f = 25;
    var nominal = Math.round(f);
    var ntsc = Math.abs(f - nominal * 1000 / 1001) < 0.005 && Math.abs(f - nominal) > 0.005;
    var pay = ntsc ? nominal * 1000 : f, payda = ntsc ? 1001 : 1;
    if (!ntsc && Math.abs(f - nominal) > 1e-6) { pay = Math.round(f * 1000); payda = 1000; }
    return { pay: pay, payda: payda, deger: pay / payda, nominal: nominal, ntsc: ntsc, dropFrameOlur: ntsc && (nominal === 30 || nominal === 60) };
  }
  // yon: "yakin" (varsayılan) | "asagi" | "yukari"
  function kareNo(t, fps, yon) {
    var k = kareHizi(fps);
    var x = num(t, 0) * k.pay / k.payda;
    if (yon === "asagi") return Math.floor(x + 1e-6);
    if (yon === "yukari") return Math.ceil(x - 1e-6);
    return Math.round(x);
  }
  function kareZamani(n, fps) { var k = kareHizi(fps); return n * k.payda / k.pay; }
  function kareyeYuvarla(t, fps, yon) { return kareZamani(kareNo(t, fps, yon), fps); }

  function iki(n) { return (n < 10 ? "0" : "") + n; }
  /*
   * Gösterim: "SS:DD:SN:KK"; dropFrame (yalnız 29,97 / 59,94) "SS:DD:SN;KK" — atlanan kare NUMARALARIDIR,
   * zaman değişmez (iç zaman her zaman gerçek saniye). Zaman kodu 24 saatte başa döner (DF ve NDF).
   */
  function zamanKodu(t, fps, secenek) {
    var k = kareHizi(fps);
    var kare = kareNo(Math.max(0, num(t, 0)), fps, "yakin");
    var df = !!(secenek && secenek.dropFrame) && k.dropFrameOlur;
    var nom = k.nominal;
    if (df) {
      var dus = Math.round(nom / 15);   // 30 → 2, 60 → 4
      var on = Math.round(k.deger * 600);
      var dk = nom * 60 - dus;
      // drop-frame günü 24 saatlik ETİKET sayısıdır (29,97: 2 589 408, 59,94: 5 178 816), gerçek 86 400 sn'nin karesi değil
      var dGun = (nom * 600 - 9 * dus) * 144;
      kare = kare % dGun;
      var dd = Math.floor(kare / on), mm = kare % on;
      kare += dus * 9 * dd + (mm > dus ? dus * Math.floor((mm - dus) / dk) : 0);
    }
    else kare = kare % (nom * 86400);   // non-drop-frame de 24:00:00:00'da başa döner
    var kk = kare % nom, toplamSn = Math.floor(kare / nom);
    var sn = toplamSn % 60, dkk = Math.floor(toplamSn / 60) % 60, sa = Math.floor(toplamSn / 3600);
    return iki(sa) + ":" + iki(dkk) + ":" + iki(sn) + (df ? ";" : ":") + iki(kk);
  }

  return {
    VARSAYILAN: VARSAYILAN,
    hizala: hizala,
    kaymaBul: kaymaBul,
    kelimeleriYasla: kelimeleriYasla,
    kartlariYasla: kartlariYasla,
    sesDurumu: function (a, opts) { return sesDurumu(a, ayar(opts)); },
    konusmaOrani: oran,
    kareHizi: kareHizi,
    kareNo: kareNo,
    kareZamani: kareZamani,
    kareyeYuvarla: kareyeYuvarla,
    zamanKodu: zamanKodu
  };
});
