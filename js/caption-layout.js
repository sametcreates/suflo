/*
 * Suflo — okunabilir altyazı düzeni (3.2 adım 4)
 *
 * Portions adapted from Raunen (https://github.com/Zeyphers/raunen), MIT, Copyright (c) 2026 Jacob Szczepaniak. See THIRD_PARTY_NOTICES.md.
 * (wrapText ve shapeSegments'in birleştirme, bölme ve süre geçişleri ES5'e taşındı, Suflo için genişletildi.)
 *
 * Ölçülmüş kelime zamanlarından (js/whisper-words.js) okunabilir altyazı satırları kurar:
 *   kelimedenSatirlar(words, o)  -> karakter (satır × satır uzunluğu), kelime sayısı, duraklama, cümle
 *                                   sonu ve süre sınırında kırılan cue'lar { start, end, text, words, confidence }
 *   dengeliSar(text, maxChars, maxLines, dil) -> en uzun satırı en kısa olan kırılım ("\n"); 38/4 değil 21/21
 *   kisaBirlestir(cues, o)       -> arası kısa, birlikte sığan komşu parçaları birleştirir (cümle sonunu aşmaz)
 *   karakterleBol(cue, maxChars, o) -> sığmayan cue'yu karakter bütçesiyle böler (zaman kelimelerden)
 *   zamanHijyeni(cues, o)        -> en kısa / en uzun ekran süresi, çakışma yok (caption-quality fixTiming anlamı)
 *   kelimeleriHizala(eski, metin, bas, son, loc) -> düzenlenen metne ölçülmüş kelime zamanlarını taşır (LCS)
 *   kelimeleriOlcekle(words, eskiBas, eskiSon, yeniBas, yeniSon) -> elle değişen satır sınırına doğrusal
 *   satirKiriklariniKoru(eski, yeni) -> kelime sayısı aynıysa satır kırılımını aynı kelimeye geri koyar
 *   ikiyeBolNoktasi(words, dil)  -> iki satırlık en dengeli kırılım (stil motoru da bunu kullanır; dil false: eski kural)
 *   parcalaCezali(words, k, o)   -> k parçaya (satır / kart) dengeli ve Türkçe-duyarlı bölme (kalite motoru)
 *   uzunlukAyari(lenVal, kadraj) -> "l42" / "c42x2" / "c60" / "w3" / "k1" / "auto" (kadraja göre) ayrıştırması
 *   otomatikUzunluk(kadraj)      -> "auto"nun somut değeri: yatay c42x2, kare / 4:5 c32x2, 9:16 c24x2, boyut yoksa l42
 *
 * Kalite motoru (parti 1): satır ve parça kırılımları js/tr-kirilim.js kirilimCezasi ile seçilir. dil parametresi
 * isteğe bağlıdır (dengeliSar'da son argüman, kelimedenSatirlar / karakterleBol'da o.dil): verilmezse tr + en kuralları,
 * false ise hiç ceza yok (stil motorunun eski stilleri bayt bayt aynı). js/tr-kirilim.js yüklenmediyse ceza 0.
 *
 * Karakter + kelime sınırıyla satır kurma ve LCS ile yeniden hizalama Suflo'nun kendi kodu
 * (Animated Captions / TranscriptAI'dan yalnız fikir: satırı karakter ve kelime sınırıyla kurarken
 * kelime zamanlarını korumak; onların hizasız words[] hatasına düşmemek: her satırın kelimeleri
 * metnin kelimeleriyle bire bir tutar).
 *
 * Saf UMD modülü: DOM yok, dosya sistemi yok, ES5 (CEF 74 / Node 12.3).
 */
(function (root, factory) {
  // Türkçe-duyarlı kırılım cezası (js/tr-kirilim.js) ONCE yüklenir; yoksa ceza 0 (eski en dengeli kırılım)
  var TK = (root && root.SufloTrKirilim) || null;
  if (!TK && typeof require === "function") { try { TK = require("./tr-kirilim.js"); } catch (e) { TK = null; } }
  var api = factory(TK);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloCaptionLayout = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (TK) {
  "use strict";

  // Cümle sonu: . ! ? … ardından kapanış tırnağı / parantez kalabilir ("geliyorum.”", «Tamam.»)
  var CUMLE_SONU = /[.!?…]["'”’»)\]]*$/;
  var BOSLUK = 0.08;      // zamanHijyeni: komşu cue'lar arası en az boşluk (fixTiming ile aynı)
  var TABAN = 0.25;       // zamanHijyeni: çakışma kırpmasında kalacak en kısa süre (fixTiming ile aynı)
  var EN_AZ_KELIME = 0.1; // kelimeleriHizala: eklenen kelime başına en az süre (yoksa komşudan paylaşılır)

  function dizi(x) { return Object.prototype.toString.call(x) === "[object Array]"; }
  function sayi(x, v) { var n = Number(x); return (x !== null && x !== undefined && x !== "" && isFinite(n)) ? n : v; }
  function ms(x) { return Math.round(x * 1000) / 1000; }
  function aralikta(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function kopya(o) {
    var y = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) y[k] = o[k];
    return y;
  }

  // Boşlukla ayrılmış belirteçler (satır kırılımı da boşluktur)
  function belirtecler(text) {
    return String(text == null ? "" : text).split(/\s+/).filter(function (t) { return t.length > 0; });
  }
  // *vurgu* yıldızları ayıklanınca boş kalmayan belirteç (stil motoru ve whisper-words ile aynı sayım)
  function icerikli(t) { return String(t).replace(/\*/g, "").length > 0; }
  // Tek satıra indir: satır kırılımları ve çoklu boşluk tek boşluk olur
  function duzMetin(text) { return String(text == null ? "" : text).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }

  function tamsayi(x, v, enAz, enCok) {
    var n = Math.floor(sayi(x, v));
    if (!isFinite(n)) n = v;
    return aralikta(n, enAz, enCok);
  }

  /*
   * "Otomatik (kadraja göre)": sekansın oranından satır bütçesi. Yatay (en / boy ≥ 1,3) 2 × 42, kare ve 4:5
   * (≥ 0,7) 2 × 32, dikey (9:16) 2 × 24. Boyut bilinmiyorsa eski varsayılan tek satır × 42 (l42).
   * kadraj: { w, h } ya da { width, height }. Döner: somut menü değeri ("c42x2", "c32x2", "c24x2", "l42").
   */
  function otomatikUzunluk(kadraj) {
    var w = Number(kadraj && (kadraj.w !== undefined ? kadraj.w : kadraj.width));
    var h = Number(kadraj && (kadraj.h !== undefined ? kadraj.h : kadraj.height));
    if (!(w > 0 && h > 0 && isFinite(w) && isFinite(h))) return "l42";
    var oran = w / h;
    if (oran >= 1.3) return "c42x2";
    if (oran >= 0.7) return "c32x2";
    return "c24x2";
  }

  /*
   * lenVal ayrıştırması (Satır uzunluğu menüsü):
   *   "l32" / "l42"  kelime zamanından tek satır (kelime yoksa "c32" / "c42" ile aynı yol)
   *   "c42x2"        iki satır × 42 karakter (YouTube / TV)
   *   "c32" "c42" "c60"  eski karakter modu · "wN" N kelime · "k1" / "kc" kelime kelime
   *   "auto"         kadraja göre (otomatikUzunluk); sonuçta otomatik: true ve deger: somut değer
   */
  function uzunlukAyari(lenVal, kadraj) {
    var v = String(lenVal || "c42"), m;
    if (v === "auto") {
      var somut = otomatikUzunluk(kadraj), r = uzunlukAyari(somut);
      r.otomatik = true;
      r.deger = somut;
      return r;
    }
    if (/^k/.test(v)) return { tur: "k", deger: v, maxChars: 0, maxLines: 1 };
    if ((m = /^w(\d+)$/.exec(v))) return { tur: "w", n: parseInt(m[1], 10) || 3, maxChars: 0, maxLines: 1 };
    if ((m = /^l(\d+)$/.exec(v))) return { tur: "l", maxChars: parseInt(m[1], 10) || 42, maxLines: 1 };
    if ((m = /^c(\d+)x(\d+)$/.exec(v))) return { tur: "c", maxChars: parseInt(m[1], 10) || 42, maxLines: aralikta(parseInt(m[2], 10) || 1, 1, 3) };
    return { tur: "c", maxChars: parseInt(v.slice(1), 10) || 42, maxLines: 1 };
  }

  /* ---------------- satır sarma ---------------- */

  // Açgözlü sarma: genişlik w ile satırlar (en az satır sayısını verir; tek kelime w'yi aşabilir)
  // Raunen: wrapText (greedy fallback)
  function acgozluSatirlar(words, w) {
    var satirlar = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var aday = cur ? cur + " " + words[i] : words[i];
      if (cur && aday.length > w) { satirlar.push(cur); cur = words[i]; }
      else cur = aday;
    }
    if (cur) satirlar.push(cur);
    return satirlar;
  }

  // Kelimeler maxLines satıra, her satır maxChars'ı aşmadan sığıyor mu?
  function sigarMi(words, maxChars, maxLines) {
    if (!words.length) return true;
    var s = acgozluSatirlar(words, maxChars);
    if (s.length > maxLines) return false;
    for (var i = 0; i < s.length; i++) if (s[i].length > maxChars) return false;
    return true;
  }

  /* ---------------- kırılım seçimi (kalite motoru) ---------------- */

  var AGIR = TK && TK.AGIR ? TK.AGIR : 10;
  // Denge payı: en uzun parça en iyi bölmenin en uzununa en çok bu kadar karakter eklenebilir
  function denge(enIyi) { return enIyi + Math.max(3, Math.ceil(enIyi * 0.15)); }
  // Kırılım cezaları: ceza[i] = words[i-1] ile words[i] arasında kırmanın cezası (dil false: hepsi 0)
  function kirilimCezalari(words, dil) {
    var c = [0];
    for (var i = 1; i < words.length; i++) c.push(dil === false || !TK ? 0 : TK.kirilimCezasi(words[i - 1], words[i], dil));
    return c;
  }
  // [ağır sayısı, toplam ceza, en uzun] sözlük sırasıyla küçük mü
  function dahaIyi(a, b) {
    for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  }

  /*
   * n kelimeyi tam k parçaya bölen dinamik programlama. uz(a, b): a..b-1 parçasının karakter uzunluğu;
   * uygun(a, b): sert sınırlar (karakter, kelime, süre); C: en uzun parçanın üst sınırı (Infinity olabilir).
   * cezasiz: yalnız en uzun parça (eski en dengeli kırılım). Eşitlikte ilk kırılım (eski kural).
   * Döner: { bas: [0, i1, …], skor: [ağır, ceza, en uzun] } ya da null (sığan bölme yok).
   */
  function bolDP(n, k, uz, uygun, cez, ekCeza, C, cezasiz, alt) {
    var f = [[[0, 0, 0]]], geri = [[]];
    for (var z = 1; z <= n; z++) f[0].push(null);
    for (var p = 1; p <= k; p++) {
      f.push([]); geri.push([]);
      for (var b = 0; b <= n; b++) {
        var en = null, arg = -1;
        // alt(b): b'de biten parçanın en küçük başı (kelime sınırı / uygunBas); döngü O(k · n · parça boyu) kalır
        for (var a = Math.max(p - 1, alt ? alt(b) : 0); a < b; a++) {
          var once = f[p - 1][a];
          if (!once) continue;
          var u = uz(a, b);
          if (u > C || !uygun(a, b)) continue;
          var aday;
          if (cezasiz) aday = [0, 0, Math.max(once[2], u)];
          else {
            var ek = ekCeza ? ekCeza(a, b) : 0, kc = a > 0 ? cez[a] : 0;
            aday = [once[0] + (kc >= AGIR ? 1 : 0) + (ek >= AGIR ? 1 : 0), once[1] + kc + ek, Math.max(once[2], u)];
          }
          if (!en || dahaIyi(aday, en)) { en = aday; arg = a; }
        }
        f[p].push(en);
        geri[p].push(arg);
      }
    }
    if (!f[k][n]) return null;
    var bas = [n];
    for (var q = k; q >= 1; q--) bas.unshift(geri[q][bas[0]]);
    bas.pop();
    return { bas: bas, skor: f[k][n] };
  }

  /*
   * Seçim kuralı (satır, altyazı parçası ve Altyazı Efektleri kartı için ortak):
   *   1) eski en dengeli bölmenin en uzun parçası M* (sert sınırlar içinde)
   *   2) en uzun parçası denge(M*) = M* + max(3, ⌈%15⌉) içinde kalan bölmelerden önce ağır kırılım sayısı,
   *      sonra toplam ceza, sonra en uzun parça en küçük (eşitlikte ilk kırılım)
   *   3) seçilen bölmede ağır kırılım varsa (soru eki satır başında, sayı biriminden ayrı…) sert sınırların
   *      tamamına bakılır; daha az ağır kırılımlı bölme varsa o alınır
   * Döner: parça başları ya da null (secSkorlu: { bas, agir } — seçilen bölmedeki ağır kırılım sayısı).
   */
  function secSkorlu(n, k, uz, uygun, cez, ekCeza, alt) {
    var temel = bolDP(n, k, uz, uygun, cez, ekCeza, Infinity, true, alt);
    if (!temel) return null;
    var r = bolDP(n, k, uz, uygun, cez, ekCeza, denge(temel.skor[2]), false, alt);
    if (!r) return { bas: temel.bas, agir: 0 };
    if (r.skor[0] > 0) {
      var genis = bolDP(n, k, uz, uygun, cez, ekCeza, Infinity, false, alt);
      if (genis && genis.skor[0] < r.skor[0]) r = genis;
    }
    return { bas: r.bas, agir: r.skor[0] };
  }
  function sec(n, k, uz, uygun, cez, ekCeza, alt) {
    var r = secSkorlu(n, k, uz, uygun, cez, ekCeza, alt);
    return r ? r.bas : null;
  }

  function onUzunluk(words) {
    var on = [0];
    for (var i = 0; i < words.length; i++) on.push(on[i] + String(words[i]).length);
    return function (a, b) { return on[b] - on[a] + (b - a - 1); };
  }

  /*
   * Kelimeleri tam k parçaya böl (satır ya da kart), kalite motorunun seçim kuralıyla (sec).
   * o: { dil (verilmezse tr + en, false: ceza yok), sinir (parça başına en çok karakter, sert), enCokKelime
   *      (parça başına en çok kelime, sert; 0 kapalı), parcaCezasi(a, b, n) (parçaya ek ceza; AGIR ve üstü ağır) }
   * Döner: parça başları [0, i1, …] ya da sert sınırlara uyan bölme yoksa null.
   */
  function parcalaCezali(words, k, o) {
    var r = parcalaSkorlu(words, k, o);
    return r ? r.bas : null;
  }
  // parcalaCezali'nin { bas, agir } döndüren hâli (agir: seçilen bölmedeki ağır kırılım sayısı)
  function parcalaSkorlu(words, k, o) {
    o = o || {};
    var liste = dizi(words) ? words : [];
    var n = liste.length;
    k = Math.max(1, Math.min(Math.floor(Number(k)) || 1, Math.max(1, n)));
    if (n === 0) return { bas: [0], agir: 0 };
    var uz = onUzunluk(liste);
    var sinir = Number(o.sinir) > 0 ? Number(o.sinir) : Infinity;
    var enCok = Math.floor(Number(o.enCokKelime)) > 0 ? Math.floor(Number(o.enCokKelime)) : 0;
    function uygun(a, b) { return uz(a, b) <= sinir && (!enCok || b - a <= enCok); }
    var ek = typeof o.parcaCezasi === "function" ? function (a, b) { return Number(o.parcaCezasi(a, b, n)) || 0; } : null;
    return secSkorlu(n, k, uz, uygun, kirilimCezalari(liste, o.dil), ek, enCok ? function (b) { return b - enCok; } : null);
  }

  /*
   * İki satırlık kırılım: ikinci satırın ilk kelimesinin indeksi (1..n-1), n < 2 ise -1.
   * dil === false: ESKİ kural, sağ ve sol satırın karakter farkı en küçük olan ilk kelime sınırı. Stil motorunun
   * eski stilleri (balancedText, dengeliUzunluk, breakIndex) bunu çağırır: çıktıları bayt bayt aynı kalır.
   * Diğer dillerde kalite motorunun seçimi (parcalaCezali): dengeli kırılımlar arasından Türkçe-duyarlı en iyisi.
   * sinir (isteğe bağlı): satır başına en çok karakter (ağır kırılımdan kaçarken aşılmaz).
   */
  function ikiyeBolNoktasi(words, dil, sinir) {
    var n = words ? words.length : 0;
    if (n < 2) return -1;
    if (dil === false || !TK) {
      var uz0 = onUzunluk(words), best = 1, bestScore = Infinity;
      for (var k = 1; k < n; k++) {
        var skor = Math.abs(uz0(0, k) - uz0(k, n));
        if (skor < bestScore) { best = k; bestScore = skor; }
      }
      return best;
    }
    var bas = parcalaCezali(words, 2, { dil: dil, sinir: sinir });
    if (!bas || bas.length < 2) bas = parcalaCezali(words, 2, { dil: dil });
    return bas && bas.length > 1 ? bas[1] : 1;
  }

  /*
   * Kelimeleri k parçaya böl (kalite motoru; sinir verilirse sert sınır, sığmazsa sınırsız seçime düşer).
   * Döner: her parçanın ilk kelime indeksi [0, i1, ...].
   */
  function dengeliParcalar(words, k, dil, sinir) {
    var n = words.length;
    k = Math.max(1, Math.min(k, n));
    if (k === 1) return [0];
    var bas = sinir ? parcalaCezali(words, k, { dil: dil, sinir: sinir }) : null;
    return bas || parcalaCezali(words, k, { dil: dil });
  }

  function parcaMetinleri(words, baslar) {
    var out = [];
    for (var i = 0; i < baslar.length; i++) out.push(words.slice(baslar[i], i + 1 < baslar.length ? baslar[i + 1] : words.length).join(" "));
    return out;
  }

  /*
   * Dengeli sarma: metin tek satıra sığıyorsa aynen (tek satır) döner; sığmıyorsa 2..maxLines satır
   * sırayla denenir ve en uzun satırı en kısa olan kırılım alınır (en az satırla). 38/4 yerine 21/21.
   * Kalite motoru: denge payı içindeki kırılımlardan Türkçe-duyarlı en iyisi ("yapabilir\nmisin" ve
   * "bir\nşey" yerine), maxChars ve maxLines sert sınır. dil (isteğe bağlı): altyazının dili.
   * Hiçbiri sığmıyorsa (tek kelime satırdan uzun) açgözlü sarmaya düşer: hiçbir kelime atılmaz.
   * Döner: satırlar "\n" ile ayrılmış metin.
   */
  // Raunen: wrapText
  function dengeliSar(text, maxChars, maxLines, dil) {
    var duz = duzMetin(text);
    maxChars = tamsayi(maxChars, 42, 1, 1000);
    maxLines = tamsayi(maxLines, 1, 1, 10);
    var words = belirtecler(duz);
    if (!words.length || duz.length <= maxChars || maxLines <= 1) return duz;
    /*
     * en az satırla; o satır sayısında maxChars'ı aşmayan bölmeler arasından kalite motorunun seçimi. En az satırlı
     * bölme ağır kırılım içeriyorsa ("yapabilir\nmisin") maxLines'a dek bir satır daha denenir; ağırsız bölme
     * bulunamazsa en az ağır kırılımlı (eşitlikte en az satırlı) bölme alınır.
     */
    var enIyi = null;
    for (var L = 2; L <= maxLines && L <= words.length; L++) {
      var r = parcalaSkorlu(words, L, { dil: dil, sinir: maxChars });
      if (!r) continue;
      if (!r.agir) return parcaMetinleri(words, r.bas).join("\n");
      if (!enIyi || r.agir < enIyi.agir) enIyi = r;
    }
    if (enIyi) return parcaMetinleri(words, enIyi.bas).join("\n");
    /*
     * sığmıyor: kelime düşürmeden açgözlü sarmanın satır sayısıyla (en az satır); kalite motoru o satır sayısında
     * maxChars'ı aşmayan dengeli, Türkçe-duyarlı bölmeyi seçer (zaten maxLines aşıldığından, o sayıdaki bölme ağır
     * kırılım içeriyorsa bir satır fazlası da denenir). Satırdan uzun tek kelime varsa (sığan bölme yok) açgözlü sarma aynen.
     */
    var acgozlu = acgozluSatirlar(words, maxChars);
    if (dil === false) return acgozlu.join("\n");
    var dengeli = parcalaSkorlu(words, acgozlu.length, { dil: dil, sinir: maxChars });
    if (dengeli && dengeli.agir && acgozlu.length < words.length) {
      var fazla = parcalaSkorlu(words, acgozlu.length + 1, { dil: dil, sinir: maxChars });
      if (fazla && fazla.agir < dengeli.agir) dengeli = fazla;
    }
    return dengeli ? parcaMetinleri(words, dengeli.bas).join("\n") : acgozlu.join("\n");
  }

  /* ---------------- kelimeden satır ---------------- */

  function kelime(w) {
    var y = { text: String(w && w.text != null ? w.text : "").replace(/^\s+|\s+$/g, ""), start: Number(w && w.start), end: Number(w && w.end) };
    if (!isFinite(y.end) || y.end < y.start) y.end = y.start;
    if (w && w.p !== undefined && w.p !== null && isFinite(Number(w.p))) y.p = Number(w.p);
    return y;
  }

  function guven(words) {
    var top = 0, say = 0;
    for (var i = 0; i < words.length; i++) if (words[i].p !== undefined) { top += words[i].p; say++; }
    return say ? top / say : undefined;
  }

  function cueKur(parca) {
    var g = {
      start: parca[0].start,
      end: Math.max(parca[parca.length - 1].end, parca[0].start + 0.05),
      text: parca.map(function (w) { return w.text; }).join(" "),
      words: parca.map(function (w) { var y = { text: w.text, start: w.start, end: w.end }; if (w.p !== undefined) y.p = w.p; return y; })
    };
    var c = guven(parca);
    if (c !== undefined) g.confidence = c;
    return g;
  }

  /*
   * Kelime listesinden (sıralı, ölçülmüş) satırlar.
   *   1) Kesin kırılım: önceki kelimeyle arasında araKir'dan uzun duraklama ya da cümle sonu (. ! ? …,
   *      kapanış tırnağı kalır) kelimesinden sonrası. İki kesin kırılım arası bir "öbek"tir.
   *   2) Her öbek açgözlü doldurmanın verdiği EN AZ satıra bölünür; bir satır
   *        - maxLines satıra maxChars genişlikte sığmalı,
   *        - en çok maxWords kelime içermeli (0 = kapalı; açıkken 2..12),
   *        - maxSure'den uzun sürmemeli.
   *      Aynı satır sayısıyla mümkün kırılımlardan en uzun satırı en kısa olan seçilir: açgözlü
   *      doldurmanın bıraktığı "mi?" gibi tek kelimelik artık satır kalmaz.
   * Tek kelime her zaman bir satırdır (sınırı aşsa da atılmaz). minSure ekran süresidir: zamanHijyeni
   * uygular. Satır metni tek satırdır (kırılımı dengeliSar koyar).
   * o: { maxChars: 42, maxLines: 1|2, maxWords: 0, maxSure: 6, minSure: 0.8, araKir: 0.6, dil }
   * Kalite motoru: aynı satır sayısıyla kırılım, denge payı içinde Türkçe-duyarlı en iyisi (o.dil).
   * Döner: [{ start, end, text, words, confidence }]
   */
  function kelimedenSatirlar(words, o) {
    o = o || {};
    var maxChars = tamsayi(o.maxChars, 42, 8, 500);
    var maxLines = tamsayi(o.maxLines, 1, 1, 3);
    var maxWords = Math.floor(sayi(o.maxWords, 0));
    maxWords = maxWords > 0 ? aralikta(maxWords, 2, 12) : 0;
    var maxSure = sayi(o.maxSure, 6);
    if (!(maxSure > 0)) maxSure = 6;
    var araKir = sayi(o.araKir, 0.6);
    if (!(araKir >= 0)) araKir = 0.6;
    // 1) öbekler
    var obekler = [], cur = [];
    (dizi(words) ? words : []).forEach(function (w0) {
      if (!w0) return;
      var w = kelime(w0);
      if (!w.text || !isFinite(w.start)) return;
      var onceki = cur[cur.length - 1];
      if (onceki && w.start - onceki.end > araKir) { obekler.push(cur); cur = []; }
      cur.push(w);
      if (CUMLE_SONU.test(w.text)) { obekler.push(cur); cur = []; }
    });
    if (cur.length) obekler.push(cur);
    // 2) her öbek en az satıra, dengeli
    var out = [];
    obekler.forEach(function (ob) {
      obekBol(ob, maxChars, maxLines, maxWords, maxSure, o.dil).forEach(function (parca) { out.push(cueKur(parca)); });
    });
    return out;
  }

  function obekBol(ob, maxChars, maxLines, maxWords, maxSure, dil) {
    var n = ob.length;
    var metin = ob.map(function (w) { return w.text; });
    // uygunBas[b]: ob[a..b) satırı sınırlara uyan en küçük a (a büyüdükçe satır kısalır, hep uyar)
    var uygunBas = [0];
    for (var b = 1; b <= n; b++) {
      var a = b - 1;                      // tek kelime her zaman bir satırdır
      while (a > 0) {
        var aday = a - 1;
        if (maxWords && b - aday > maxWords) break;
        if (ob[b - 1].end - ob[aday].start > maxSure) break;
        if (!sigarMi(metin.slice(aday, b), maxChars, maxLines)) break;
        a = aday;
      }
      uygunBas.push(a);
    }
    // açgözlü: en az satır sayısı (soldan en uzun uygun satırlar)
    var k = 0, bas = 0;
    while (bas < n) {
      var son = bas + 1;
      while (son < n && uygunBas[son + 1] <= bas) son++;
      k++;
      bas = son;
    }
    if (k <= 1) return [ob];
    // dengeli: k satırla, kalite motorunun seçimi (en uzun satır denge payında, Türkçe-duyarlı en iyi kırılım)
    var uz = onUzunluk(metin);
    function altBas(y) { return uygunBas[y] || 0; }
    var sinir = sec(n, k, uz, function (x, y) { return x >= altBas(y); }, kirilimCezalari(metin, dil), null, altBas);
    if (!sinir) return [ob];      // olmamalı: açgözlü kırılım uygundur
    sinir.push(n);
    var parcalar = [];
    for (var r = 0; r < k; r++) parcalar.push(ob.slice(sinir[r], sinir[r + 1]));
    return parcalar;
  }

  /* ---------------- kısa parça birleştirme ---------------- */

  // Satırın kelimeleri metniyle bire bir tutuyor mu (*vurgu* yalnız belirteçler sayılmaz)?
  function hizali(c) {
    return !!(c && dizi(c.words) && c.words.length && c.words.length === belirtecler(c.text).filter(icerikli).length);
  }

  /*
   * Arası aralik saniyeden kısa (0 dahil) komşu parçaları, birleşik metin maxLines × maxChars'a sığıyor
   * ve süre maxSure'yi aşmıyorsa birleştirir. Bitmiş cümleyi sonrakine yapıştırmaz; kelime sınırı
   * (maxWords) açıksa birleşik satır onu da aşmaz. Kelime modlarında (wN, k1, kc) çağrılmaz: ardışık
   * kelime grupları hep yan yana olduğundan ayarı geri alırdı.
   * o: { aralik: 0.2, maxChars: 42, maxLines: 1, maxSure: 6, maxWords: 0 }
   */
  // Raunen: shapeSegments (merge pass)
  function kisaBirlestir(cues, o) {
    o = o || {};
    var aralik = sayi(o.aralik, 0.2);
    var maxChars = tamsayi(o.maxChars, 42, 8, 500);
    var maxLines = tamsayi(o.maxLines, 1, 1, 3);
    var maxSure = sayi(o.maxSure, 6);
    if (!(maxSure > 0)) maxSure = 6;
    var maxWords = Math.floor(sayi(o.maxWords, 0));
    maxWords = maxWords > 0 ? aralikta(maxWords, 2, 12) : 0;
    var out = [];
    (dizi(cues) ? cues : []).forEach(function (c0) {
      if (!c0) return;
      var c = kopya(c0);
      if (dizi(c0.words)) c.words = c0.words.slice();
      var p = out[out.length - 1];
      if (p && aralik > 0) {
        var bosluk = Number(c.start) - Number(p.end);
        var birlesik = duzMetin(p.text) + " " + duzMetin(c.text);
        if (bosluk >= 0 && bosluk <= aralik && !CUMLE_SONU.test(duzMetin(p.text)) &&
            Number(c.end) - Number(p.start) <= maxSure && sigarMi(belirtecler(birlesik), maxChars, maxLines) &&
            (!maxWords || belirtecler(birlesik).filter(icerikli).length <= maxWords)) {
          var np = belirtecler(p.text).length, nc = belirtecler(c.text).length;
          var pw = hizali(p) ? p.words : (belirtecler(p.text).length ? null : []);
          var cw = hizali(c) ? c.words : (belirtecler(c.text).length ? null : []);
          p.text = birlesik;
          p.end = Math.max(Number(p.end), Number(c.end));
          if (pw && cw && pw.length + cw.length) p.words = pw.concat(cw); else delete p.words;
          if (isFinite(Number(p.confidence)) && isFinite(Number(c.confidence)) && np + nc > 0) {
            p.confidence = (Number(p.confidence) * np + Number(c.confidence) * nc) / (np + nc);
          } else if (isFinite(Number(c.confidence)) && !isFinite(Number(p.confidence))) {
            delete p.confidence;
          }
          return;
        }
      }
      out.push(c);
    });
    return out;
  }

  /* ---------------- karakterle bölme ---------------- */

  /*
   * Bütçeye (maxLines satır × maxChars) sığmayan cue'yu kelime sınırında böler. Parça sayısı açgözlü
   * karakter doldurmayla bulunur (eşit kelime bölmesi bütçeyi aşabiliyordu), sonra parçalar dengelenir
   * (en uzun parça en kısa; sondaki "mi?" gibi tek kelimelik artık kalmaz). o.enAz: en az parça (süre için).
   * Zaman: kelimeler metinle bire bir tutuyorsa her parça ilk kelimesinin ölçülmüş başında başlar;
   * tutmuyorsa karakter oranıyla paylaşılır (kelimeler orta noktalarına göre dağılır).
   * Döner: [{ start, end, text, confidence[, words] }] — bölünmesi gerekmiyorsa [cue].
   */
  // Raunen: shapeSegments (split pass)
  function karakterleBol(cue, maxChars, o) {
    o = o || {};
    if (!cue) return [];
    maxChars = tamsayi(maxChars, 42, 1, 1000);
    var maxLines = tamsayi(o.maxLines, 1, 1, 3);
    var tokens = belirtecler(cue.text);
    if (!tokens.length) return [];
    var enAz = Math.min(tokens.length, Math.max(1, Math.floor(sayi(o.enAz, 1))));
    // açgözlü parça sayısı (bütçeye sığan en az parça)
    var aSay = 0, cur = [];
    for (var i = 0; i < tokens.length; i++) {
      var aday = cur.concat([tokens[i]]);
      if (cur.length && !sigarMi(aday, maxChars, maxLines)) { aSay++; cur = [tokens[i]]; }
      else cur = aday;
    }
    if (cur.length) aSay++;
    var k = Math.max(aSay, enAz);
    if (k <= 1) return [cue];
    /*
     * dengeli parçalar (kalite motoru: denge payında Türkçe-duyarlı en iyi kırılım; tek satırda maxChars sert sınır);
     * bütçeye sığmayan parça kalırsa eski en dengeli bölme (ceza yok), o da sığmazsa (2 satırda) açgözlü parçalar
     */
    function sigar(bs) {
      return parcaMetinleri(tokens, bs).every(function (m) { return sigarMi(belirtecler(m), maxChars, maxLines); });
    }
    var baslar = dengeliParcalar(tokens, k, o.dil, maxLines === 1 ? maxChars : 0);
    if (!sigar(baslar)) baslar = dengeliParcalar(tokens, k, false);
    var metinler = parcaMetinleri(tokens, baslar);
    var hepsiSigar = sigar(baslar);
    if (!hepsiSigar) {
      baslar = [0]; cur = [];
      for (var g = 0; g < tokens.length; g++) {
        var ad2 = cur.concat([tokens[g]]);
        if (cur.length && !sigarMi(ad2, maxChars, maxLines)) { baslar.push(g); cur = [tokens[g]]; }
        else cur = ad2;
      }
      metinler = parcaMetinleri(tokens, baslar);
    }
    var bas = Number(cue.start), son = Number(cue.end);
    if (!isFinite(son) || son < bas) son = bas;
    var sure = son - bas;
    // parça sınırları: ölçülmüş (kelimeler metinle bire bir) ya da karakter oranı
    var sinirlar = null, olculmusSinir = false;
    var words = dizi(cue.words) && cue.words.length ? cue.words : null;
    var olcu = words && hizali(cue) ? words : null;
    // belirteç indeksi -> içerikli belirteç (kelime) indeksi
    var kelimeNo = [], say = 0;
    for (var t = 0; t < tokens.length; t++) { kelimeNo.push(say); if (icerikli(tokens[t])) say++; }
    if (olcu) {
      sinirlar = [bas];
      for (var j = 1; j < baslar.length; j++) {
        var w = olcu[Math.min(kelimeNo[baslar[j]], olcu.length - 1)];
        var tt = Number(w && w.start);
        if (!isFinite(tt) || tt <= sinirlar[j - 1] || tt >= son) { sinirlar = null; break; }
        sinirlar.push(tt);
      }
      if (sinirlar) { sinirlar.push(son); olculmusSinir = true; }
    }
    if (!sinirlar) {
      var toplam = 0;
      metinler.forEach(function (m) { toplam += m.length; });
      toplam = toplam || 1;
      var harcanan = 0;
      sinirlar = [bas];
      for (var q = 0; q < metinler.length - 1; q++) {
        harcanan += metinler[q].length;
        sinirlar.push(bas + sure * Math.min(harcanan / toplam, 1));
      }
      sinirlar.push(son);
    }
    var out = [];
    for (var r = 0; r < metinler.length; r++) {
      var a = sinirlar[r], b = sinirlar[r + 1];
      var parca = { start: a, end: b, text: metinler[r], confidence: cue.confidence };
      if (olculmusSinir) {
        var ilk = kelimeNo[baslar[r]], sonK = r + 1 < baslar.length ? kelimeNo[baslar[r + 1]] : olcu.length;
        if (sonK > ilk) parca.words = olcu.slice(ilk, sonK);
      } else if (words) {
        var ic = words.filter(function (x) {
          var orta = (Number(x.start) + Number(x.end)) / 2;
          return (r === 0 || orta >= a) && (r === metinler.length - 1 || orta < b);
        });
        if (ic.length) parca.words = ic;
      }
      out.push(parca);
    }
    return out;
  }

  /* ---------------- zaman hijyeni ---------------- */

  /*
   * Ekran süresi kuralları (caption-quality fixTiming ile aynı anlam): sıralı liste; satır maxSure'den
   * uzunsa kırpılır, minSure'den kısaysa sonraki satıra kadar olan BOŞ zamana uzatılır; sonraki satırla
   * arasında en az 0,08 sn kalır, kırpma satırı 0,25 sn'den kısa bırakacaksa satır sonraki satırın başında
   * biter. Hiçbir satır sonrakiyle çakışmaz. Kelimeler satırın içine sıkıştırılır (sayı korunur).
   * o.sonSinir (isteğe bağlı): en kısa süre uzatması bu ana kadar (ses / klip / sekans sonu): son satır
   *   sesin ötesine uzamaz (katman sekansı uzatır, dışa aktarımda siyah kuyruk kalırdı). Satır yine
   *   kendi bitişinden kısalmaz; sınır yalnız uzatmayı keser.
   * o: { minSure: 0.8, maxSure: 7, sonSinir: undefined }
   */
  // Raunen: shapeSegments (duration pass)
  function zamanHijyeni(cues, o) {
    o = o || {};
    var minSure = sayi(o.minSure, 0.8);
    if (!(minSure >= 0)) minSure = 0.8;
    var maxSure = sayi(o.maxSure, 7);
    if (!(maxSure > 0)) maxSure = 7;
    if (maxSure < minSure) maxSure = minSure;
    var tavan = sayi(o.sonSinir, Infinity);
    if (!(tavan > 0)) tavan = Infinity;
    var out = (dizi(cues) ? cues : []).filter(Boolean).map(function (c) {
      var y = kopya(c);
      y.start = sayi(c.start, 0);
      y.end = sayi(c.end, y.start);
      if (dizi(c.words)) y.words = c.words.map(kopya);
      return y;
    });
    // kararlı sıralama (V8 7.0+ / CEF 74)
    out.sort(function (a, b) { return a.start - b.start; });
    out.forEach(function (s, i) {
      s.start = Math.max(0, s.start);
      if (s.end < s.start) s.end = s.start;
      if (s.end - s.start > maxSure) s.end = s.start + maxSure;
      if (s.end - s.start < minSure) s.end = Math.max(s.end, Math.min(s.start + minSure, tavan));
      var next = out[i + 1];
      if (next && s.end > next.start - BOSLUK) {
        var kirp = ms(next.start - BOSLUK);
        s.end = kirp > s.start + TABAN ? kirp : Math.max(s.start, Math.min(next.start, s.start + TABAN));
      }
      if (dizi(s.words)) {
        s.words.forEach(function (w) {
          var a = aralikta(Number(w.start), s.start, s.end), b = aralikta(Number(w.end), a, s.end);
          if (a !== Number(w.start)) w.start = ms(a);
          if (b !== Number(w.end)) w.end = ms(b);
        });
      }
    });
    return out;
  }

  /* ---------------- düzenlemede kelime hizalama ---------------- */

  // Eşleştirme anahtarı: Türkçe-duyarlı küçük harf (İ/I, ı), noktalama ve *vurgu* atılır, ı ile i ayrılmaz
  // (BÜYÜK HARF dönüşümleri ve dil bilgisi olmayan çağrılar da eşleşsin)
  var NOKTALAMA = /[.,!?;:…"'«»“”‘’„()\[\]{}\-–—¿¡*%#&\/\\_~`^+=<>|♪♫、。，！？・]/g;
  function kucukHarf(s, loc) {
    var l = String(loc || "").toLowerCase().slice(0, 2);
    s = String(s == null ? "" : s);
    if (l === "tr" || l === "az") s = s.replace(/I/g, "ı");
    return s.replace(/İ/g, "i").toLowerCase().replace(/̇/g, "");
  }
  function anahtar(t, loc) { return kucukHarf(t, loc).replace(NOKTALAMA, "").replace(/ı/g, "i"); }

  /*
   * Satırın metni elle (ya da AI / sözlükle) değiştiğinde ölçülmüş kelime zamanlarını yeni metne taşır.
   * Eski kelimeler ile yeni metnin kelimeleri normalleştirilip (Türkçe küçük harf, noktalama yok) en uzun
   * ortak altdiziyle (LCS) eşleşir: eşleşen kelime kendi ölçülmüş zamanını korur; eşleşmeyen (eklenen ya
   * da değiştirilen) kelimeler komşu eşleşmelerin arasına (değiştirilen eski kelimelerin aralığına)
   * karakter ağırlığıyla yerleşir. Silinen kelimeler düşer. Sonuç yeni metnin *vurgu*suz kelimeleriyle
   * bire bir tutar; aynı metinle yeniden çağırmak sonucu değiştirmez.
   * Döner: [{ text, start, end[, p] }] (metin boşsa [])
   */
  function kelimeleriHizala(eskiKelimeler, yeniMetin, cueBas, cueSon, loc) {
    var tokens = belirtecler(yeniMetin).filter(icerikli);
    if (!tokens.length) return [];
    var eski = (dizi(eskiKelimeler) ? eskiKelimeler : []).filter(function (w) {
      return w && isFinite(Number(w.start)) && String(w.text == null ? "" : w.text).replace(/\s+/g, "").length;
    }).map(kelime);
    var bas = sayi(cueBas, eski.length ? eski[0].start : 0);
    var son = sayi(cueSon, eski.length ? eski[eski.length - 1].end : bas);
    if (son < bas) son = bas;
    var A = eski.map(function (w) { return anahtar(w.text, loc); });
    var B = tokens.map(function (t) { return anahtar(t, loc); });
    var n = A.length, m = B.length;
    // L[i][j]: A[i..] ile B[j..]'nin en uzun ortak altdizisi
    var L = [];
    for (var i = 0; i <= n; i++) { L.push(new Array(m + 1)); L[i][m] = 0; }
    for (var j0 = 0; j0 <= m; j0++) L[n][j0] = 0;
    for (var i2 = n - 1; i2 >= 0; i2--) {
      for (var j2 = m - 1; j2 >= 0; j2--) {
        L[i2][j2] = A[i2] === B[j2] ? L[i2 + 1][j2 + 1] + 1 : Math.max(L[i2 + 1][j2], L[i2][j2 + 1]);
      }
    }
    var es = [];   // es[j] = eşleşen eski kelime indeksi ya da -1
    for (var z = 0; z < m; z++) es.push(-1);
    var a = 0, b = 0;
    while (a < n && b < m) {
      if (A[a] === B[b]) { es[b] = a; a++; b++; }
      else if (L[a + 1][b] >= L[a][b + 1]) a++;
      else b++;
    }
    var out = [];
    for (var k = 0; k < m; k++) out.push(null);
    for (var k2 = 0; k2 < m; k2++) {
      if (es[k2] < 0) continue;
      var w = eski[es[k2]];
      var y = { text: tokens[k2].replace(/\*/g, ""), start: w.start, end: w.end };
      if (w.p !== undefined) y.p = w.p;
      out[k2] = y;
    }
    // eşleşmeyen koşular: önceki ve sonraki eşleşme arasına yerleşir
    var q = 0;
    while (q < m) {
      if (out[q]) { q++; continue; }
      var r = q;
      while (r < m && !out[r]) r++;
      var oncekiEski = q > 0 ? es[q - 1] : -1, sonrakiEski = r < m ? es[r] : n;
      var solSinir = q > 0 ? out[q - 1].end : bas;
      var sagSinir = r < m ? out[r].start : son;
      if (sagSinir < solSinir) sagSinir = solSinir;
      // arada eşleşmeyen eski kelimeler varsa (değiştirilen kelimeler) onların aralığı
      var x0 = Infinity, x1 = -Infinity;
      for (var e = oncekiEski + 1; e < sonrakiEski; e++) {
        if (eski[e].start < x0) x0 = eski[e].start;
        if (eski[e].end > x1) x1 = eski[e].end;
      }
      var a0 = solSinir, a1 = sagSinir;
      if (x1 >= x0) { a0 = aralikta(x0, solSinir, sagSinir); a1 = aralikta(x1, a0, sagSinir); }
      for (var s = q; s < r; s++) out[s] = { text: tokens[s].replace(/\*/g, "") };
      /*
       * Yer yoksa (satır sonuna / başına ya da bitişik iki kelimenin arasına eklenen kelime: satır
       * modunda cue son kelimenin sonunda biter) eklenenler sıfır süre alıp aynı anda yanıp sönerdi.
       * Kelime başına EN_AZ_KELIME kalana kadar komşu kelimeler (önce öncekiler, sonra sonrakiler)
       * aralığa katılır ve hepsi o aralığı karakter ağırlığıyla paylaşır.
       */
      var lo = q, hi = r;
      while (a1 - a0 < EN_AZ_KELIME * (hi - lo) - 1e-9) {
        if (lo > 0) { lo--; a0 = Math.min(a0, out[lo].start); }
        else if (hi < m && out[hi]) { a1 = Math.max(a1, out[hi].end); hi++; }
        else break;
      }
      paylastir(out, lo, hi, a0, a1);
      q = hi;
    }
    return out;
  }

  // out[lo..hi) kelimeleri [a0, a1] aralığını karakter ağırlığıyla, sırayla paylaşır
  function paylastir(out, lo, hi, a0, a1) {
    if (a1 < a0) a1 = a0;
    var agirlik = 0, ag = [];
    for (var s = lo; s < hi; s++) { var g = out[s].text.length + 1; ag.push(g); agirlik += g; }
    var t = a0;
    for (var s2 = lo; s2 < hi; s2++) {
      var bitis = s2 === hi - 1 ? a1 : t + (a1 - a0) * ag[s2 - lo] / agirlik;
      out[s2].start = ms(t);
      out[s2].end = ms(bitis);
      t = bitis;
    }
  }

  /*
   * Satırın başı / sonu elle değişince ölçülmüş kelimeler yeni aralığa doğrusal taşınır.
   * Eski aralık sıfırsa yalnız kaydırılır. Döner: yeni dizi (girdi değişmez).
   */
  function kelimeleriOlcekle(words, eskiBas, eskiSon, yeniBas, yeniSon) {
    if (!dizi(words)) return words;
    eskiBas = Number(eskiBas); eskiSon = Number(eskiSon); yeniBas = Number(yeniBas); yeniSon = Number(yeniSon);
    if (!isFinite(yeniSon) || yeniSon < yeniBas) yeniSon = yeniBas;
    var eskiSure = eskiSon - eskiBas;
    var k = eskiSure > 0 ? (yeniSon - yeniBas) / eskiSure : 1;
    function esle(t) {
      var v = eskiSure > 0 ? yeniBas + (Number(t) - eskiBas) * k : Number(t) + (yeniBas - eskiBas);
      return ms(aralikta(v, yeniBas, yeniSon));
    }
    return words.map(function (w) {
      var y = kopya(w);
      y.start = esle(w.start);
      y.end = Math.max(y.start, esle(w.end));
      return y;
    });
  }

  /*
   * AI kontrolü gibi satır kırılımını kaybedebilen düzeltmelerden sonra: eski metindeki "\n" kırılımları,
   * kelime sayısı aynıysa yeni metinde aynı kelimelerin arasına geri konur. Döner: yeni metin.
   */
  function satirKiriklariniKoru(eski, yeni) {
    eski = String(eski == null ? "" : eski);
    yeni = String(yeni == null ? "" : yeni);
    if (eski.indexOf("\n") === -1 || yeni.indexOf("\n") !== -1) return yeni;
    var yt = belirtecler(yeni);
    if (yt.length !== belirtecler(eski).length) return yeni;
    var kir = {}, say = 0, satirlar = eski.split("\n");
    for (var i = 0; i < satirlar.length - 1; i++) {
      say += belirtecler(satirlar[i]).length;
      if (say > 0 && say < yt.length) kir[say] = true;
    }
    var out = "";
    for (var j = 0; j < yt.length; j++) out += (j === 0 ? "" : (kir[j] ? "\n" : " ")) + yt[j];
    return out;
  }

  return {
    uzunlukAyari: uzunlukAyari,
    otomatikUzunluk: otomatikUzunluk,
    dengeliSar: dengeliSar,
    ikiyeBolNoktasi: ikiyeBolNoktasi,
    parcalaCezali: parcalaCezali,
    AGIR: AGIR,
    sigarMi: sigarMi,
    kelimedenSatirlar: kelimedenSatirlar,
    kisaBirlestir: kisaBirlestir,
    karakterleBol: karakterleBol,
    zamanHijyeni: zamanHijyeni,
    kelimeleriHizala: kelimeleriHizala,
    kelimeleriOlcekle: kelimeleriOlcekle,
    satirKiriklariniKoru: satirKiriklariniKoru,
    hizali: hizali,
    duzMetin: duzMetin,
    anahtar: anahtar,
    CUMLE_SONU: CUMLE_SONU
  };
});
