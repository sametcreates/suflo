/*
 * Suflo — kesimden sonra altyazıyı yeni kurguya uyarla (3.4 adım 8)
 *
 * Otomatik Kesim ve Konuşmadan kes kesimleri KS_applyCuts ile uygulayınca Altyazı sekmesindeki belge eski kurgunun
 * zamanlarında kalır. Bu saf modül zamanları yeni kurguya taşır:
 *   kesimleriDuzenle(cuts)       -> sıralı, çakışmasız kesimler (sırasız / üst üste / bitişik olanlar birleşir)
 *   kareyeOturt(cuts, kare)      -> kenarlar sekans karesine; KS_applyCuts'ın razor'u gibi (zaman kodu bulunduğu
 *                                   kareyi gösterir: aşağı yuvarlar). Kareden kısa kalan kesim düşer (razor iki kez aynı
 *                                   kareye iner, hiçbir şey silinmez)
 *   zamanEsle(t, cuts, mod)      -> 'ripple': önceki kesimlerin toplam süresi düşülür (kesimin içi kesimin başına);
 *                                   'gap' / 'select': zaman değişmez
 *   kelimeEsle(words, cuts, o)   -> ORTASI bir kesimde kalan kelime DÜŞER, kalanlar eşlenir (kelime kesimin içine
 *                                   kırpılmaz: sıfır süreli ya da üst üste cue çıkmaz)
 *   satirEsle(cues, cuts, o)     -> kelimeli cue kalan kelimelerinden (metin ve zaman) yeniden kurulur; kelimesiz cue'nun
 *                                   uçları eşlenir, tamamen kesimde kalan ya da kesimle 0,2 sn'nin altına inen düşer
 *                                   -> { cues, dusen, kirpilan, imza }
 *   imza(cuts, mod, kare)        -> aynı kesim kümesine aynı metin: aynı kesim bir belgeye iki kez uygulanmaz
 *   kelimelerdenSegment(words)   -> kelime listesini cümle / duraklama sınırında segmentlere böler (satır kurucuya girdi)
 *   uyarlamaPlani(r, o)          -> KS_applyCuts sonucundan kesim kaydı: { kaynak, hedef, mod, cuts, kare } ya da null
 *   yolBul(kayitlar, belge, hedef) -> oturumdaki kesim kayıtlarından belgenin sekansından hedef sekansa uygulanacak
 *                                   kayıtlar (sırayla); kopya sekans dalları ve aynı sekansta art arda kesimler dahil
 *   zincirEsle(cues, yol, o)     -> yoldaki kesimleri sırayla uygular (her kesim bir öncekinin kurgusunda ölçülmüştür)
 *
 * Kesim nesnesi { start, end, kayma? } (sekans zamanı, sn). kayma: host'un ripple'da ölçtüğü gerçek kayma (aralığın
 * içindeki kliplerin toplam süresi). Sekans kapsamında hiçbir katmanda klip olmayan boşluk da kesim aralığına girebilir;
 * Premiere orayı silemez, sonraki içerik aralığın tamamı kadar değil kayma kadar kayar. Yoksa aralığın uzunluğu.
 *
 * Mostly clean-room: Premiere TR'nin (premiere-tr-plugin, MIT) ~10 satırlık remapTime'ı yalnız fikir kaynağı; kod
 * alınmadı. Onun kesimin içine düşen zamanı kesime kırpma davranışı sıfır süreli / üst üste cue üretiyordu: burada
 * ortası kesimde kalan kelime düşer, kelimesiz cue kısalınca düşer.
 *
 * Saf UMD modülü: DOM yok, dosya sistemi yok, ES5 (CEF 74 / Node 12.3). Satır sarma js/caption-layout.js,
 * vurgu (*kelime*) js/caption-text.js; ikisi de bu dosyadan ÖNCE yüklenir.
 */
(function (root, factory) {
  var CL = (root && root.SufloCaptionLayout) || null;
  if (!CL && typeof require === "function") { try { CL = require("./caption-layout.js"); } catch (e) { CL = null; } }
  var CT = (root && root.SufloCaptionText) || null;
  if (!CT && typeof require === "function") { try { CT = require("./caption-text.js"); } catch (e2) { CT = null; } }
  var api = factory(CL, CT);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloKesimEsle = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (CL, CT) {
  "use strict";

  var EPS = 1e-6;
  var MIN_KALAN = 0.2;    // kelimesiz cue: kesim yüzünden bundan kısa kalırsa (ve yarısından fazlası gittiyse) düşer
  var MIN_SURE = 0.05;    // yeniden kurulan cue'nun en kısa süresi (caption-layout cueKur ile aynı)
  var CUMLE_SONU = /[.!?…]["'”’»)\]]*$/;
  var KAPANIS_NOKTALAMA = /^(.*?)([.,!?;:…»"')\]]*)$/;

  function dizi(x) { return Object.prototype.toString.call(x) === "[object Array]"; }
  function sayi(x) { var n = Number(x); return (x !== null && x !== undefined && x !== "" && isFinite(n)) ? n : NaN; }
  function gecerli(n) { return n === n; }   // NaN değil
  function ms(x) { return Math.round(x * 1000) / 1000; }
  function us(x) { return Math.round(x * 1e6) / 1e6; }
  function kopya(o) {
    var y = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) y[k] = o[k];
    return y;
  }
  function cueKopya(c) {
    var y = kopya(c);
    if (dizi(c.words)) y.words = c.words.map(function (w) { return w && typeof w === "object" ? kopya(w) : w; });
    if (dizi(c.origWords)) y.origWords = c.origWords.map(function (w) { return w && typeof w === "object" ? kopya(w) : w; });
    return y;
  }
  // Yalnız ripple ve gap zamanı değiştirir; select (kes + seç) hiçbir şeyi silmez
  function modu(m) { return m === "ripple" || m === "gap" ? m : null; }

  /* ---------------- kesimler ---------------- */

  function kaymaOku(c) {
    if (!c || c.kayma === null || c.kayma === undefined || c.kayma === "") return NaN;
    return sayi(c.kayma);
  }

  /*
   * Sıralı, çakışmasız kesimler. Geçersiz (sayı olmayan, boş ya da ters) aralık atılır. Üst üste binen ya da bitişik
   * kesimler birleşir; host'un ölçtüğü kaymalar toplanır, birleşik aralığın uzunluğunu aşmaz.
   */
  function kesimleriDuzenle(cuts) {
    var liste = [];
    (dizi(cuts) ? cuts : []).forEach(function (c) {
      if (!c) return;
      var a = sayi(c.start), b = sayi(c.end);
      if (!gecerli(a) || !gecerli(b) || b - a <= EPS) return;
      var k = { start: a, end: b };
      var ky = kaymaOku(c);
      if (gecerli(ky)) k.kayma = Math.max(0, Math.min(ky, b - a));
      liste.push(k);
    });
    liste.sort(function (x, y) { return x.start - y.start || x.end - y.end; });
    var out = [];
    liste.forEach(function (k) {
      var son = out[out.length - 1];
      if (son && k.start <= son.end + EPS) {
        var ortak = Math.max(0, Math.min(son.end, k.end) - k.start);
        var kaymali = son.kayma !== undefined || k.kayma !== undefined;
        var toplam = (son.kayma !== undefined ? son.kayma : son.end - son.start) + (k.kayma !== undefined ? k.kayma : k.end - k.start) - ortak;
        son.end = Math.max(son.end, k.end);
        if (kaymali) son.kayma = Math.max(0, Math.min(toplam, son.end - son.start));
        return;
      }
      out.push(k);
    });
    return out;
  }

  /*
   * Kesim kenarlarını sekans karesine oturt. KS_applyCuts sınırları KS_timecode → Time.getFormatted ile kare zaman
   * koduna çevirip QE razor'a verir; zaman kodu zamanın bulunduğu kareyi gösterir (aşağı yuvarlar). Kare ızgarasına
   * düşen kenar yerinde kalır (yuvarlama hatasına 1e-6 kare pay); işlem idempotent.
   */
  function kareyeOturt(cuts, kare) {
    var f = sayi(kare);
    var liste = kesimleriDuzenle(cuts);
    if (!(f > 0)) return liste;
    var out = [];
    liste.forEach(function (k) {
      var a = us(Math.floor(k.start / f + 1e-6) * f), b = us(Math.floor(k.end / f + 1e-6) * f);
      if (b - a < f / 2) return;
      var y = { start: a, end: b };
      if (k.kayma !== undefined) y.kayma = Math.min(k.kayma, b - a);
      out.push(y);
    });
    return kesimleriDuzenle(out);
  }

  // Eşleme tablosu: her kesimin önündeki toplam kayma (once) ve kendi kayması (kay)
  function hazirla(cuts, o) {
    o = o || {};
    var liste = sayi(o.kare) > 0 ? kareyeOturt(cuts, o.kare) : kesimleriDuzenle(cuts);
    var once = 0;
    liste.forEach(function (k) {
      k.once = once;
      k.kay = k.kayma !== undefined ? Math.min(k.end - k.start, k.kayma) : k.end - k.start;
      once += k.kay;
    });
    return liste;
  }

  // t'den önce başlayan son kesimin dizini (-1: yok); kesimler sıralı ve çakışmasız
  function oncekiKesim(hz, t) {
    var lo = 0, hi = hz.length - 1, cevap = -1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      if (hz[m].start < t - EPS) { cevap = m; lo = m + 1; } else hi = m - 1;
    }
    return cevap;
  }

  // t bir kesimin içinde mi (kenarlar dışarıda)
  function icinde(hz, t) {
    var i = oncekiKesim(hz, t);
    return i >= 0 && t < hz[i].end - EPS;
  }

  /*
   * Tek zamanı eşle. taraf: kesimin içine düşen zaman 'gap'te nereye gitsin ("bas": kesimin sonuna — içerik orada
   * yeniden başlar; "son": kesimin başına — içerik orada biter; verilmezse değişmez). 'ripple'da kesimin içi kesimin
   * (eşlenmiş) başıdır: o aralık artık yok.
   */
  function esle(hz, t, mod, taraf) {
    if (!hz.length || !gecerli(t)) return t;
    var i = oncekiKesim(hz, t);
    if (i < 0) return t;
    var k = hz[i];
    if (t < k.end - EPS) {
      if (mod === "ripple") return k.start - k.once;
      if (mod === "gap") return taraf === "bas" ? k.end : (taraf === "son" ? k.start : t);
      return t;
    }
    return mod === "ripple" ? t - k.once - k.kay : t;
  }

  // [a, b] aralığının kesimlerle örtüşen toplam süresi
  function ortusme(hz, a, b) {
    var top = 0;
    for (var i = 0; i < hz.length; i++) {
      if (hz[i].start >= b) break;
      var x = Math.max(a, hz[i].start), y = Math.min(b, hz[i].end);
      if (y > x) top += y - x;
    }
    return top;
  }

  // (a, b) aralığına giren ya da onunla örtüşen bir kesim var mı (gap'te cue'yu orada böler)
  function arada(hz, a, b) {
    for (var i = 0; i < hz.length; i++) {
      if (hz[i].start >= b - EPS) return false;
      if (hz[i].end > a + EPS) return true;
    }
    return false;
  }

  function zamanEsle(t, cuts, mod, taraf) {
    var n = sayi(t);
    if (!gecerli(n)) return t;
    return esle(hazirla(cuts), n, modu(mod), taraf);
  }

  function imzaHz(hz, mod) {
    return (mod || "-") + ":" + hz.map(function (k) {
      return k.start.toFixed(3) + "-" + k.end.toFixed(3) + (k.kayma !== undefined ? "~" + k.kay.toFixed(3) : "");
    }).join(",");
  }
  function imza(cuts, mod, kare) { return imzaHz(hazirla(cuts, { kare: kare }), modu(mod)); }

  /* ---------------- kelimeler ---------------- */

  // Bir kelime listesini eşle; düşen kelimelerin dizinleri ayrıca döner
  function kelimeListesi(words, hz, mod) {
    var out = [], kalan = [];
    (dizi(words) ? words : []).forEach(function (w, i) {
      if (!w || typeof w !== "object") return;
      var a = sayi(w.start), b = sayi(w.end);
      if (!gecerli(a)) return;
      if (!gecerli(b) || b < a) b = a;
      if (mod && icinde(hz, (a + b) / 2)) return;   // ortası kesimde: kelime kesildi
      var y = kopya(w);
      if (mod) {
        y.start = ms(esle(hz, a, mod, "bas"));
        y.end = ms(Math.max(esle(hz, b, mod, "son"), y.start));
      }
      out.push(y);
      kalan.push(i);
    });
    return { kelimeler: out, kalan: kalan };
  }

  /*
   * Kelimeleri eşle. o: { mod: "ripple" | "gap" | "select" (varsayılan ripple), kare }. Ortası bir kesimde kalan kelime
   * düşer (kesildi); kenarı kesime taşan kelimenin taşan ucu kesimin kenarına çekilir. "select" hiçbir şeyi silmez:
   * kelimeler aynen döner. Girdi değişmez.
   */
  function kelimeEsle(words, cuts, o) {
    o = o || {};
    var mod = o.mod === undefined || o.mod === null ? "ripple" : modu(o.mod);
    return kelimeListesi(words, hazirla(cuts, o), mod).kelimeler;
  }

  /* ---------------- satırlar ---------------- */

  function belirtecler(text) {
    return String(text == null ? "" : text).replace(/^\s+|\s+$/g, "").split(/\s+/).filter(function (t) { return t.length > 0; });
  }
  function icerikli(t) { return String(t).replace(/\*/g, "").length > 0; }
  function vurgusuz(t) { return CT && CT.stripEmphasis ? CT.stripEmphasis(t) : String(t).replace(/\*/g, ""); }

  /*
   * Kalan kelimelerin metni. Satırın metni kelimeleriyle bire bir tutuyorsa (düzenlemede yeniden hizalanmış) kullanıcının
   * belirteçleri korunur (noktalama, büyük harf, *vurgu*): kalan kelimelerin belirteçleri alınır, kopan vurgu aralıkları
   * yeniden kapatılır. Tutmuyorsa kelimelerin kendi metni. Satır kırılımı olan (2 satır × 42) metin dengeli yeniden sarılır.
   */
  function metinKur(text, kelimeler, secilen, o) {
    var tokens = belirtecler(text);
    var icerik = [];
    tokens.forEach(function (t, i) { if (icerikli(t)) icerik.push(i); });
    var parcalar;
    if (icerik.length && icerik.length === kelimeler.length) {
      var mask = CT && CT.emphasisMask ? CT.emphasisMask(text) : null;
      var vurguVar = !!(mask && mask.some(Boolean));
      parcalar = secilen.map(function (k) {
        var t = tokens[icerik[k]];
        return { t: vurguVar ? vurgusuz(t) : t, v: vurguVar && !!mask[icerik[k]] };
      });
      // vurgulu ardışık belirteçler yeniden tek *aralık*
      for (var i = 0; i < parcalar.length; i++) {
        if (!parcalar[i].v) continue;
        var j = i;
        while (j + 1 < parcalar.length && parcalar[j + 1].v) j++;
        var m = KAPANIS_NOKTALAMA.exec(parcalar[j].t);
        if (m && m[1]) {
          parcalar[i].t = "*" + parcalar[i].t;
          if (j === i) parcalar[j].t = "*" + m[1] + "*" + m[2];
          else parcalar[j].t = m[1] + "*" + m[2];
        }
        i = j;
      }
      parcalar = parcalar.map(function (p) { return p.t; });
    } else {
      parcalar = secilen.map(function (k) { return String(kelimeler[k].text == null ? "" : kelimeler[k].text).replace(/^\s+|\s+$/g, ""); })
        .filter(function (t) { return t.length > 0; });
    }
    var duz = parcalar.join(" ");
    var satirlar = String(text == null ? "" : text).split("\n");
    if (satirlar.length > 1 && CL && CL.dengeliSar) {
      var enUzun = 0;
      satirlar.forEach(function (s) { var n = s.replace(/^\s+|\s+$/g, "").length; if (n > enUzun) enUzun = n; });
      var maxChars = sayi(o && o.maxChars) > 0 ? sayi(o.maxChars) : Math.max(42, enUzun);
      var maxLines = sayi(o && o.maxLines) > 1 ? sayi(o.maxLines) : satirlar.length;
      return CL.dengeliSar(duz, maxChars, maxLines);
    }
    return duz;
  }

  // Kelimeli cue: kalan kelimeleri gruplara böl ('gap'te arada kesim olan yerden; 'ripple'da tek grup)
  function grupla(ws, kalan, hz, mod) {
    if (!kalan.length) return [];
    if (mod !== "gap") return [kalan];
    var gruplar = [[kalan[0]]];
    for (var n = 1; n < kalan.length; n++) {
      var onceki = ws[kalan[n - 1]], bu = ws[kalan[n]];
      var bol = kalan[n] > kalan[n - 1] + 1 || arada(hz, sayi(onceki.end), sayi(bu.start));
      if (bol) gruplar.push([kalan[n]]);
      else gruplar[gruplar.length - 1].push(kalan[n]);
    }
    return gruplar;
  }

  function guven(ws) {
    var top = 0, say = 0;
    ws.forEach(function (w) { var p = sayi(w && w.p); if (gecerli(p)) { top += p; say++; } });
    return say ? top / say : NaN;
  }

  /*
   * Çeviri sakladığı özgün dil (orig + origWords): "Orijinale dön" eski zamanları geri getirmesin. Kalan özgün kelimeler
   * eşlenir; kelime düştüyse özgün metin onlardan yeniden kurulur. Döner: false = özgün kelimelerin hepsi kesildi.
   */
  function ozgunEsle(y, c, hz, mod, o) {
    if (!dizi(c.origWords) || !c.origWords.length) return true;
    var r = kelimeListesi(c.origWords, hz, mod);
    if (!r.kelimeler.length) return false;
    y.origWords = r.kelimeler;
    if (r.kalan.length < c.origWords.length && typeof c.orig === "string") y.orig = metinKur(c.orig, c.origWords, r.kalan, o);
    return true;
  }

  /*
   * Tek cue'yu eşle. Döner: { cues: [...], kirpildi } — boş liste: cue düştü.
   */
  function cueEsle(c, hz, mod, o) {
    var a = sayi(c.start), b = sayi(c.end);
    if (!gecerli(a)) return { cues: [cueKopya(c)], kirpildi: false };
    if (!gecerli(b) || b < a) b = a;
    var ws = dizi(c.words) && c.words.length ? c.words : null;

    if (!ws) {
      var ust = ortusme(hz, a, b);
      var y0 = cueKopya(c);
      if (!ozgunEsle(y0, c, hz, mod, o)) return { cues: [], kirpildi: true };
      y0.start = ms(esle(hz, a, mod, "bas"));
      y0.end = ms(Math.max(esle(hz, b, mod, "son"), y0.start));
      if (ust <= EPS) return { cues: [y0], kirpildi: false };
      var kalanSure = (b - a) - ust;
      // tamamen kesimde (kalan 0) ya da kesim yüzünden 0,2 sn'nin altında ve yarısından azı kaldı: düşer.
      // Zaten kısa olan (kelime kelime modundaki tek kelime) cue'nun kenarı kesime değince düşmez.
      if (kalanSure <= EPS || (kalanSure < MIN_KALAN && kalanSure < (b - a) / 2)) return { cues: [], kirpildi: true };
      if (y0.end < y0.start + MIN_SURE) y0.end = ms(y0.start + MIN_SURE);
      return { cues: [y0], kirpildi: true };
    }

    var r = kelimeListesi(ws, hz, mod);
    if (!r.kelimeler.length) return { cues: [], kirpildi: true };
    var eslenen = {};
    r.kalan.forEach(function (i, n) { eslenen[i] = r.kelimeler[n]; });
    var gruplar = grupla(ws, r.kalan, hz, mod);
    var hepsi = r.kalan.length === ws.length && gruplar.length === 1;
    var out = [];
    gruplar.forEach(function (g) {
      var y = cueKopya(c);
      var kel = g.map(function (i) { return eslenen[i]; });
      var bas = g[0] === 0 ? esle(hz, a, mod, "bas") : kel[0].start;
      var son = g[g.length - 1] === ws.length - 1 ? esle(hz, b, mod, "son") : kel[kel.length - 1].end;
      bas = Math.min(bas, kel[0].start);
      son = Math.max(son, kel[kel.length - 1].end, bas + MIN_SURE);
      y.start = ms(bas);
      y.end = ms(son);
      y.words = kel;
      if (!hepsi) {
        y.text = metinKur(c.text, ws, g, o);
        var p = guven(kel);
        if (gecerli(p)) y.confidence = p;
      }
      out.push(y);
    });
    if (dizi(c.origWords) && c.origWords.length) {
      // kelimeli cue'da özgün dil yalnız bölünmeden kalan tek parçaya taşınır
      if (out.length === 1) { if (!ozgunEsle(out[0], c, hz, mod, o)) delete out[0].origWords; }
      else out.forEach(function (y) { delete y.origWords; delete y.orig; });
    }
    return { cues: out, kirpildi: !hepsi };
  }

  /*
   * Belgenin satırlarını kesimlere göre eşle. o: { mod, kare, maxChars, maxLines, uygulanan: [imza] }.
   *   - kelimeli cue kalan kelimelerinden yeniden kurulur (metin ve zaman); 'gap'te kesimin iki yanı ayrı cue olur
   *   - kelimesiz cue'nun uçları eşlenir; tamamen kesimde kalan ya da kesimle 0,2 sn'nin altına inen düşer
   *   - mod 'select' (ya da bilinmeyen) hiçbir şey yapmaz; imza o.uygulanan içindeyse de (aynı kesim ikinci kez) — tekrar
   * Döner: { cues, dusen, kirpilan, imza, tekrar? }. Girdi değişmez.
   */
  function satirEsle(cues, cuts, o) {
    o = o || {};
    var mod = modu(o.mod);
    var liste = dizi(cues) ? cues : [];
    var hz = hazirla(cuts, o);
    var im = imzaHz(hz, mod);
    var sonuc = { cues: [], dusen: 0, kirpilan: 0, imza: im };
    var tekrar = dizi(o.uygulanan) && o.uygulanan.indexOf(im) !== -1;
    if (!mod || !hz.length || tekrar) {
      sonuc.cues = liste.filter(Boolean).map(cueKopya);
      if (tekrar) sonuc.tekrar = true;
      return sonuc;
    }
    liste.forEach(function (c) {
      if (!c) return;
      var r = cueEsle(c, hz, mod, o);
      if (!r.cues.length) { sonuc.dusen++; return; }
      if (r.kirpildi) sonuc.kirpilan++;
      r.cues.forEach(function (y) { sonuc.cues.push(y); });
    });
    return sonuc;
  }

  /*
   * Kelime listesinden satır kurucuya (caption-text segmentleriKur) girdi: cümle sonunda, araKir'dan (1 sn) uzun
   * duraklamada ya da enCok (30) kelimede yeni segment. Kelimeler zamanına göre sıralanır; boş metinli kelime atılır.
   */
  function kelimelerdenSegment(words, o) {
    o = o || {};
    var araKir = sayi(o.araKir) > 0 ? sayi(o.araKir) : 1.0;
    var enCok = sayi(o.enCok) > 0 ? Math.floor(sayi(o.enCok)) : 30;
    var liste = [];
    (dizi(words) ? words : []).forEach(function (w, i) {
      if (!w) return;
      var a = sayi(w.start), b = sayi(w.end);
      var t = String(w.text == null ? "" : w.text).replace(/^\s+|\s+$/g, "");
      if (!gecerli(a) || !t) return;
      var y = kopya(w);
      y.text = t; y.start = a; y.end = gecerli(b) && b >= a ? b : a;
      liste.push({ w: y, i: i });
    });
    liste.sort(function (x, y) { return x.w.start - y.w.start || x.i - y.i; });
    var out = [], cur = [];
    function bosalt() {
      if (!cur.length) return;
      var g = { start: cur[0].start, end: Math.max(cur[cur.length - 1].end, cur[0].start + MIN_SURE),
        text: cur.map(function (w) { return w.text; }).join(" "), words: cur };
      var p = guven(cur);
      if (gecerli(p)) g.confidence = p;
      out.push(g);
      cur = [];
    }
    liste.forEach(function (x) {
      var onceki = cur[cur.length - 1];
      if (onceki && (x.w.start - onceki.end > araKir || cur.length >= enCok)) bosalt();
      cur.push(x.w);
      if (CUMLE_SONU.test(x.w.text)) bosalt();
    });
    bosalt();
    return out;
  }

  /* ---------------- kesim kayıtları ---------------- */

  /*
   * KS_applyCuts sonucundan kesim kaydı. r: host sonucu ({ ok, newSeq, rippleFallback, esleme? }); esleme host'un
   * raporudur: { kaynak (kesimden önceki sekans), seqId (kesilen sekans: kopya ya da aynısı), kare, kesimler: [{ start,
   * end, kayma? }] }. o: { removeMode (istenen), kaynak (analiz edilen sekans), ranges (gönderilen kesimler), kare }.
   * Mod: rippleFallback → 'gap', yoksa istenen; 'select' (kes + seç) null döner: hiçbir şey silinmedi.
   * Döner: { kaynak, hedef ("" = kopyanın kimliği bilinmiyor), hedefAd, mod, cuts, kare, imza } ya da null.
   */
  function uyarlamaPlani(r, o) {
    o = o || {};
    if (!r || !r.ok) return null;
    var mod = modu(r.rippleFallback ? "gap" : o.removeMode);
    if (!mod) return null;
    var es = r.esleme && typeof r.esleme === "object" ? r.esleme : {};
    var kaynak = String(es.kaynak || o.kaynak || "");
    if (!kaynak) return null;
    var hedef = String(es.seqId || "");
    if (!hedef && !r.newSeq) hedef = kaynak;
    var ham = dizi(es.kesimler) && es.kesimler.length ? es.kesimler : (dizi(o.ranges) ? o.ranges : []);
    // gap'te hiçbir şey kaymaz: host'un ripple kayması (varsa) yok sayılır
    var cuts = kesimleriDuzenle(ham).map(function (k) {
      var y = { start: k.start, end: k.end };
      if (mod === "ripple" && k.kayma !== undefined) y.kayma = k.kayma;
      return y;
    });
    if (!cuts.length) return null;
    var kare = sayi(es.kare) > 0 ? sayi(es.kare) : (sayi(o.kare) > 0 ? sayi(o.kare) : 0);
    return { kaynak: kaynak, hedef: hedef, hedefAd: String(r.newSeq || o.kaynakAd || ""), mod: mod, cuts: cuts, kare: kare,
      imza: imza(cuts, mod, kare) };
  }

  /*
   * Belgeyi (belge: { sekansId, sira } — sira: belgenin güncel olduğu son kayıt) hedef sekansın bugünkü kurgusuna
   * taşıyan kayıtlar. kayitlar: [{ sira, kaynak, hedef, ... }] (sira artan). Bir sekansın kaydı ya kendi kurgusunu
   * değiştirir (kaynak === hedef: "Bu sekansta") ya da yeni bir kopyaya dallanır ("Kopya sekansta": kaynak dokunulmaz).
   * Belgenin sekansındaki kendi kesimleri sırayla uygulanır; hedefe giden kopya dalına geçilir. Belge oluşturulmadan
   * önceki kayıtlar (sira ≤ belge.sira) uygulanmaz: o kesimler belgede zaten var.
   * Döner: kayıt listesi ([] = belge güncel), null = yol yok (belge başka bir sekansın).
   */
  function yolBul(kayitlar, belge, hedef) {
    var liste = (dizi(kayitlar) ? kayitlar : []).filter(function (k) { return k && k.kaynak && k.hedef && gecerli(sayi(k.sira)); })
      .slice().sort(function (x, y) { return Number(x.sira) - Number(y.sira); });
    hedef = String(hedef || "");
    var bas = belge && belge.sekansId ? String(belge.sekansId) : "";
    if (!bas || !hedef) return null;
    function ara(sekans, sira, derinlik) {
      if (derinlik > liste.length + 1) return null;
      var yol = [];
      for (var i = 0; i < liste.length; i++) {
        var k = liste[i];
        if (Number(k.sira) <= sira || String(k.kaynak) !== sekans) continue;
        if (String(k.hedef) === sekans) { yol.push(k); sira = Number(k.sira); continue; }
        if (sekans === hedef) continue;           // hedefteyiz: kopyaya dallanma hedefi değiştirmez
        var alt = ara(String(k.hedef), Number(k.sira), derinlik + 1);
        if (alt) return yol.concat([k], alt);
      }
      return sekans === hedef ? yol : null;
    }
    return ara(bas, Number(belge.sira) || 0, 0);
  }

  // Yoldaki kayıtları sırayla uygula. Döner: { cues, dusen, kirpilan }
  function zincirEsle(cues, yol, o) {
    o = o || {};
    var cur = (dizi(cues) ? cues : []).filter(Boolean).map(cueKopya), dusen = 0, kirpilan = 0;
    (dizi(yol) ? yol : []).forEach(function (k) {
      var r = satirEsle(cur, k.cuts, { mod: k.mod, kare: k.kare, maxChars: o.maxChars, maxLines: o.maxLines });
      cur = r.cues; dusen += r.dusen; kirpilan += r.kirpilan;
    });
    return { cues: cur, dusen: dusen, kirpilan: kirpilan };
  }

  return {
    MIN_KALAN: MIN_KALAN,
    kesimleriDuzenle: kesimleriDuzenle,
    kareyeOturt: kareyeOturt,
    zamanEsle: zamanEsle,
    kelimeEsle: kelimeEsle,
    satirEsle: satirEsle,
    imza: imza,
    kelimelerdenSegment: kelimelerdenSegment,
    uyarlamaPlani: uyarlamaPlani,
    yolBul: yolBul,
    zincirEsle: zincirEsle
  };
});
