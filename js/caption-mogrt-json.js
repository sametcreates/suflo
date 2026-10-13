/*
 * Suflo — Altyazı Efektleri › Premiere yerel çıktı (render yok) için saf model (3.3 adım 21)
 *
 * Altyazı Efektleri oluşturucusunun ana çıktısı Premiere'in kendi klibidir: TranscriptAI'ın (Animated Captions,
 * MIT, Copyright (c) 2026 Aktuğ Antika) altyazı şablonu assets/mogrt/altyazi-efekt-v1.mogrt yazarın izniyle pakette
 * gelir (THIRD_PARTY_NOTICES.md). Şablonun "JSON_Input" metin kontrolü tek bir dizi okur:
 *   [vurguRGB, yaziRGB, font (PostScript adı), punto, kontur [1,r,g,b,kalınlık]|[0], gölge [1,r,g,b,opak,mesafe,yumuşak]|[0],
 *    kutu [1,r,g,b,opak]|[0], textAnim 0-5, hlAnim 0-3, satırlar [[başMs, sonMs, metin, [kb, ks, kb, ks, …]], …]]
 * Satır zamanları klibin başına göre ms'dir. İlk dokuz alan js/altyazi-efekt.js sablonStili'nden gelir (1:1 eşleme).
 *
 * Bu modül:
 *   - build(cues, ayar, o): kartları önizlemeyle AYNI kurar (stil motorunun efektSatirlari'ı: kelimeye bölme, *vurgu*,
 *     en çok kelime, satır kırılımı) ve parçalara böler: her parça bir klip, en çok 45 sn ve 8 KB (şablonun metin
 *     sınırı ve her karedeki JSON.parse maliyeti; Premiere denemesi sonrası ayarlanır). Parça sınırları kareye oturur.
 *     *Vurgu* işaretleri ayıklanır (şablonda kelime başına vurgu bayrağı yok: sayısı vurguKaybi'nde). Şablon satırı
 *     kadraja sığdırmaz: o.kadraj ile her kartın önizlemedeki gibi sığdırılmış puntosu alınır, parçaya en küçüğü yazılır
 *     (puntosu %10'dan çok farklı kart yeni parça başlatır; PUNTO_ORANI).
 *   - yerlesim(w, h, oran, o): şablonun 1920×1080 kompozisyonunu sekansa yerleştiren Motion › Scale (kartı kapsayan en
 *     küçük ölçek: AE şablonu kompozisyon çözünürlüğünde çizilir, %100 üstü yumuşatır) ve Caption_Position.
 *   - izAraligi(parcalar): grubun izdeki ayak izi (importMGT şablonu 1 saatlik overwrite eder, sonra kırpılır).
 *   - bildirimEkleri(o): yerel çıktının önizlemeden farkları (Arial, italik, vurgu, Marka Kiti logosu, konuşmacı renkleri).
 *   - fontSecimi / fontKuruluMu / fontKlasorleri / adobeFontKlasorleri / fontPostScriptAdlari / fontKurulumPlani:
 *     Premiere yalnız sisteme kurulu (ya da Adobe Fonts'ta etkin) fontu çizer. Bilinen aile (PostScript eşlemesi olan)
 *     kurulu değilse, aile bilinmiyorsa ya da font bu oturumda kurulduysa (Premiere yeniden başlayınca görür) Arial'a
 *     düşülür ve uyarılır; isteğe bağlı "Suflo fontlarını kur" kullanıcı font klasörüne kopyalar (Windows: HKCU kaydı,
 *     reg args dizisiyle).
 *   - yerelDestek(app, probe): Premiere 22 (2022) ve üstü, importMGT var.
 *
 * Bilinen şablon özelliği: EG'deki Highlight_Color kontrolü yok sayılır (ifadesi değeri okumaz); renk JSON'dan gelir,
 * Suflo o kontrole yazmaz. DOM'a, Premiere'e, dosya sistemine dokunmaz. ES5, UMD (Node 12 / CEF 74).
 */
(function (root, factory) {
  function yukle(ad, yol) {
    var m = (root && root[ad]) || null;
    if (!m && typeof require === "function") { try { m = require(yol); } catch (e) { m = null; } }
    return m;
  }
  var api = factory(function () { return yukle("SufloAltyaziEfekt", "./altyazi-efekt.js"); },
    function () { return yukle("SufloStyleEngine", "./style-engine.js"); });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloCaptionMogrtJson = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (aeBul, seBul) {
  "use strict";

  var AE_ = null, SE_ = null;
  function AE() { if (!AE_ && aeBul) AE_ = aeBul(); return AE_; }
  function SE() { if (!SE_ && seBul) SE_ = seBul(); return SE_; }

  // Paketteki şablon (yol uzantı köküne göre) ve sözleşmesi
  var SABLON = {
    yol: "assets/mogrt/altyazi-efekt-v1.mogrt",
    sha256: "32c2394de3f639fede180bc274e30166daa0375298af5c5f7ae3dfbf73989969",
    genislik: 1920,
    yukseklik: 1080,
    veriParam: "JSON_Input",
    konumParam: "Caption_Position",
    // Kompozisyon 1 saat: klip ucu kırpılır (zaman esnetmesi / Responsive Design yok)
    sure: 3600
  };
  // Parça sınırları: süre (sn) ve JSON_Input uzunluğu (karakter ≈ bayt; Türkçe harfler iki bayt sayılır)
  var SINIR = { sure: 45, bayt: 8000 };
  // Doğrulama tutmazsa (şablonun metin sınırı) panel daha küçük parçalarla yeniden dener
  var BAYT_KADEMELERI = [8000, 4000, 2000];
  var EN_AZ_PREMIERE = 22;
  /*
   * Satır sığdırma (3.3 adım 21 incelemesi). Şablon puntoyu (setFontSize(d[3])) olduğu gibi çizer, satırı kadraja
   * sığdırmaz; önizleme / video katmanı ise her kartı stil motorunun efektSigdir'iyle küçültür. build o.kadraj ile
   * kartın sığdırılmış puntosunu stil motorundan alır. Şablonda klip başına TEK punto var: parçadaki kartların en
   * küçüğü yazılır ve bir kart önizlemedeki puntosunun PUNTO_ORANI'ndan küçük çizilecekse yeni parça başlar (hiçbir kart
   * önizlemedekinden büyük, hiçbiri %90'ından küçük değil; puntosu aynı kalan kartlar tek klipte).
   * ARIAL_GENISLIK: Arial'a düşülünce (fontSecimi) genişlik katsayısı. Liberation Sans Bold (Arial'ın metrikleri) ile
   * ölçüldü: büyük harfli Türkçe metinde 0,65 em / karakter, karışık harfte 0,51; efektSigdir'in × 1,08'iyle 0,67.
   */
  var PUNTO_ORANI = 0.9;
  var ARIAL_GENISLIK = 0.62;

  function sayi(v) { var n = Number(v); return typeof v !== "boolean" && v !== null && v !== "" && isFinite(n) ? n : null; }
  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }

  /*
   * Metin güvenliği: JSON.stringify tırnak, ters bölü ve satır sonunu kaçırır; ama U+2028 / U+2029 ve diğer kontrol
   * karakterleri JSON.stringify'dan ham geçer ve ExtendScript'in eval tabanlı KJSON.parse'ında (ES3) dizgeyi
   * böler. Kart içindeki satır sonu yalnız "\n" (şablon satırı kırar); gerisi boşluk.
   */
  function temizMetin(t) {
    return String(t == null ? "" : t).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim();
  }

  // UTF-8 bayt sayısı (Türkçe harfler 2 bayt; şablon sınırı bayt cinsinden ölçülür)
  function baytSay(s) {
    var n = 0, t = String(s);
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  /*
   * Kadraj: { w, h, guvenli ("Platform arayüzünden kaçın") }; geçersizse null (satır sığdırma yapılmaz).
   * genislik: şablona giden font Arial'sa (o.font, fontSecimi'nin yedeği) Arial'ın katsayısı, değilse 0 (ailenin kendi).
   */
  function kadrajOku(o) {
    var k = o && o.kadraj;
    if (!k || typeof k !== "object" || !(sayi(k.w) > 0) || !(sayi(k.h) > 0)) return null;
    return { w: Number(k.w), h: Number(k.h), guvenli: k.guvenli === true,
      genislik: o && typeof o.font === "string" && /^arial/i.test(o.font) ? ARIAL_GENISLIK : 0 };
  }

  /*
   * Kartlar → satırlar: [{ start, end, text ("\n" satır kırılımı), kelimeler: [[bas, son], …], vurgu: [bool] }].
   * Kelime k, sonraki kelimenin başına kadar etkin (önizlemenin renderEfekt'iyle aynı); son kelime kart sonuna.
   * Kartlar üst üste binmez: kart sonu sonraki kartın başını geçemez. Metindeki kelime sayısı zaman çifti
   * sayısına HER ZAMAN eşittir (boş / yalnız kontrol karakterli kelime kart dışı kalır).
   * o.kadraj verilirse her satırda fs0 (punto) ve fs (kadraja sığdırılmış punto), kadraj pikseli (stil motorundan).
   */
  function satirlar(cues, ayar, o) {
    var se = SE();
    if (!se || typeof se.efektSatirlari !== "function") throw new Error("Stil motoru yüklenemedi.");
    var ae = AE();
    var ov = ae ? ae.overrides(ayar) : (ayar || {});
    var kad = kadrajOku(o);
    if (kad && kad.guvenli) ov.guvenli = true;
    var kartlar = se.efektSatirlari({ cues: cues || [], cueKind: o && o.cueKind ? o.cueKind : "lines" }, ov,
      kad ? { width: kad.w, height: kad.h, genislik: kad.genislik } : undefined);
    var out = [];
    kartlar.forEach(function (k) {
      var kel = [], kir = k.kir || [];
      k.kelimeler.forEach(function (w, i) {
        // Kelime boşluksuzdur (stil motoru \s+ ile böler): içindeki kontrol karakteri silinir, kelime bölünmez
        var t = String(w.text == null ? "" : w.text).replace(/[\u0000-\u001f\u007f\u2028\u2029\s]+/g, "");
        if (!t) return;
        kel.push({ start: Number(w.start) || 0, end: Number(w.end) || 0, text: t, vurgu: !!w.vurgu, kir: kir.indexOf(i) !== -1 });
      });
      if (!kel.length) return;
      var bas = kel[0].start, son = Math.max(kel[kel.length - 1].end, bas + 0.05);
      var metin = "", zam = [], vur = [], onceki = bas;
      kel.forEach(function (w, i) {
        if (i > 0) metin += w.kir ? "\n" : " ";
        metin += w.text;
        var kb = Math.max(onceki, Math.min(son, w.start));
        var ks = i + 1 < kel.length ? Math.max(kb, Math.min(son, kel[i + 1].start)) : son;
        zam.push([kb, ks]);
        vur.push(w.vurgu);
        onceki = kb;
      });
      var satir = { start: bas, end: son, text: metin, kelimeler: zam, vurgu: vur };
      if (kad && k.fs > 0 && k.fs0 > 0) { satir.fs = k.fs; satir.fs0 = k.fs0; }
      out.push(satir);
    });
    out.sort(function (a, b) { return a.start - b.start; });
    for (var i = 0; i + 1 < out.length; i++) {
      if (out[i].end > out[i + 1].start) {
        out[i].end = Math.max(out[i].start + 0.01, out[i + 1].start);
        out[i].kelimeler.forEach(function (z) { z[0] = Math.min(z[0], out[i].end); z[1] = Math.min(z[1], out[i].end); });
      }
    }
    return out;
  }

  function kare(t, fps, yukari) {
    if (!(fps > 0)) return t;
    var f = t * fps;
    var r = Math.round(f);
    if (Math.abs(f - r) < 1e-6) return r / fps;
    return (yukari ? Math.ceil(f) : Math.floor(f)) / fps;
  }

  function msDizi(satir, c0) {
    function ms(t) { return Math.max(0, Math.round((t - c0) * 1000)); }
    var z = [];
    satir.kelimeler.forEach(function (p) { z.push(ms(p[0])); z.push(ms(p[1])); });
    return [ms(satir.start), ms(satir.end), satir.text, z];
  }

  /*
   * Şablon stili (sözleşmenin ilk 9 alanı) + font seçimi. o.font: PostScript adı (fontSecimi; verilmezse
   * altyazi-efekt.js sablonFontu), o.punto: kompozisyon pikseli cinsinden punto çarpanı (yerlesim().punto).
   */
  function stilDizisi(ayar, o) {
    var ae = AE();
    if (!ae) throw new Error("Altyazı Efektleri modeli yüklenemedi.");
    var carpan = o && sayi(o.punto) !== null && o.punto > 0 ? Number(o.punto) : 1;
    var st = ae.sablonStili(ayar, { olcek: carpan });
    if (o && typeof o.font === "string" && o.font) st[2] = o.font;
    st[3] = Math.max(8, st[3]);
    /*
     * Kontur kalınlığı ve gölge mesafesi / yumuşaklığı da kompozisyon pikselidir: klibin Motion › Scale'i onları da
     * büyütür. Önizleme (stil motoru scaled / olcekRef) yazı gibi kısa kenara göre çizer; punto çarpanıyla arındırılır
     * (9:16'da kontur 5 ekranda 5 px, 8,9 değil).
     */
    function olc(v) { return Math.round(Number(v) * carpan * 10) / 10; }
    if (carpan !== 1) {
      if (st[4] && st[4][0] === 1 && st[4].length >= 5) st[4][4] = olc(st[4][4]);
      if (st[5] && st[5][0] === 1 && st[5].length >= 7) { st[5][5] = olc(st[5][5]); st[5][6] = olc(st[5][6]); }
    }
    return st;
  }

  /*
   * build(cues, ayar, o) → { parcalar: [{ start, end, json, bayt, satir, punto }], satirSayisi, vurguKaybi, asiri }
   * o: { cueKind ("lines" | "words" | "cumulative"), fps, font, punto, sure (sn), bayt, kadraj: { w, h, guvenli } }
   * Parça başı ve sonu kare sınırına oturur (Premiere klibi kareye yuvarlar; komşu parçalar aynı izde çakışmasın),
   * satır zamanları parçanın (kareye oturmuş) başına göredir. Tek satır sınırı aşarsa yine kendi parçasıdır (asiri).
   * o.kadraj (sekansın boyu; yerlesim'inkiyle aynı) verilirse satır sığdırma (PUNTO_ORANI): parçanın puntosu (d[3],
   * kompozisyon pikseli; parca.punto) kartlarının sığdırılmış puntolarının en küçüğü. Verilmezse punto ayarınki.
   */
  function build(cues, ayar, o) {
    o = o || {};
    var sureSinir = sayi(o.sure) > 0 ? Number(o.sure) : SINIR.sure;
    var baytSinir = sayi(o.bayt) > 0 ? Number(o.bayt) : SINIR.bayt;
    var fps = sayi(o.fps) > 0 ? Number(o.fps) : 0;
    var stil = stilDizisi(ayar, o);
    var liste = satirlar(cues, ayar, o);
    var vurguKaybi = 0;
    liste.forEach(function (s) { s.vurgu.forEach(function (v) { if (v) vurguKaybi++; }); });
    var kad = kadrajOku(o);
    // Kadraj pikseli → kompozisyon pikseli: yerlesim'in punto çarpanı = kısa kenar / 1080 / ölçek
    var kompBirim = kad ? (sayi(o.punto) > 0 ? Number(o.punto) : 1) * 1080 / Math.min(kad.w, kad.h) : 0;

    // Parçanın puntosu: kartların sığdırılmış puntolarının en küçüğü (hiçbiri sığdırılmadıysa ayarınki, stilDizisi)
    function punto(gruplar) {
      if (!kad) return stil[3];
      var enAz = Infinity, sigdi = false;
      gruplar.forEach(function (s) { if (s.fs > 0 && s.fs < s.fs0) { sigdi = true; enAz = Math.min(enAz, s.fs); } });
      if (!sigdi) return stil[3];
      // Aşağı yuvarlanır (0,1 px): ekrandaki punto sığdırılmış puntoyu geçmez
      return Math.min(stil[3], Math.max(1, Math.floor(enAz * kompBirim * 10 + 1e-6) / 10));
    }
    function paket(gruplar, c0) {
      var st = stil.slice();
      st[3] = punto(gruplar);
      return JSON.stringify(st.concat([gruplar.map(function (s) { return msDizi(s, c0); })]));
    }
    // Kart parçaya girerse parçadaki her kart önizlemedeki puntosunun en az PUNTO_ORANI'yla mı çizilir
    function puntoUyar(gruplar, aday) {
      if (!kad || !(aday.fs > 0)) return true;
      var enAz = aday.fs, enCok = aday.fs;
      gruplar.forEach(function (s) { if (s.fs > 0) { enAz = Math.min(enAz, s.fs); enCok = Math.max(enCok, s.fs); } });
      return enAz >= enCok * PUNTO_ORANI - 1e-9;
    }

    var parcalar = [], asiri = 0, i = 0, oncekiSon = 0;
    while (i < liste.length) {
      var c0 = Math.max(oncekiSon, kare(liste[i].start, fps, false));
      var grup = [liste[i]];
      var json = paket(grup, c0);
      var j = i + 1;
      while (j < liste.length) {
        if (!puntoUyar(grup, liste[j])) break;
        var aday = grup.concat([liste[j]]);
        if (liste[j].end - c0 > sureSinir) break;
        var aJson = paket(aday, c0);
        if (baytSay(aJson) > baytSinir) break;
        grup = aday; json = aJson; j++;
      }
      if (baytSay(json) > baytSinir) asiri++;
      var son = kare(grup[grup.length - 1].end, fps, true);
      if (j < liste.length) son = Math.min(son, Math.max(c0 + (fps > 0 ? 1 / fps : 0.04), kare(liste[j].start, fps, false)));
      son = Math.max(son, c0 + (fps > 0 ? 1 / fps : 0.04));
      parcalar.push({ start: c0, end: son, json: json, bayt: baytSay(json), satir: grup.length, punto: punto(grup) });
      oncekiSon = son;
      i = j;
    }
    return { parcalar: parcalar, satirSayisi: liste.length, vurguKaybi: vurguKaybi, asiri: asiri };
  }

  /*
   * Kartın dikey yarı yüksekliği (kadraj pikseli, cömert): ekrandaki punto (boyut × kısa kenar / 1080) × (satır başına
   * ~0,65 + giriş / vurgu hareketi ve kutu payı 0,6) + kontur + gölge. yerlesim kartın kompozisyon içinde kaldığını
   * bununla denetler (az tahmin yazıyı kompozisyon kenarında keser; fazlası yalnız biraz büyütür).
   */
  function kartPayi(ayar, w, h) {
    var ae = AE();
    var n = ae ? ae.normalize(ayar) : (ayar || {});
    var kisa = Math.min(sayi(w) > 0 ? Number(w) : SABLON.genislik, sayi(h) > 0 ? Number(h) : SABLON.yukseklik) / 1080;
    var boyut = sayi(n.boyut) > 0 ? Number(n.boyut) : 76, satir = sayi(n.satir) > 0 ? Number(n.satir) : 2;
    var ek = (sayi(n.kontur) > 0 ? Number(n.kontur) : 0) + (n.golge ? (Number(n.golge.mesafe) || 0) + (Number(n.golge.yumusak) || 0) : 0);
    return Math.round((boyut * (0.65 * satir + 0.6) + ek) * kisa);
  }

  /*
   * Şablon 1920×1080. Premiere AE şablonunu kendi kompozisyon boyutunda, sekansın ortasına koyar (Responsive Design
   * yok) ve kompozisyon çözünürlüğünde çizer: klibin Motion › Scale'i %100'ün üstünde o resmi BÜYÜTÜR (yazı yumuşar).
   * Ölçek bu yüzden en küçük yeterli değerdir:
   *   - kadraj kompozisyondan genişse (4K, 2560×1080) kompozisyon yatayda kadrajı kaplamalı: s = max(w/1920, h/1080);
   *   - değilse (9:16, 4:5, 720×1280) kompozisyon zaten yatayda kadrajı kaplar; dikeyde yalnız kartın bandını kaplaması
   *     yeter: s = (|kart ortası − kadraj ortası| + pay) / 540, en az 1 (9:16 Alt'ta %100, keskin), en çok kaplama oranı.
   * Küçük kadrajlarda (1280×720) küçültme: s = kaplama oranı (< 1, bulanıklık yok). Caption_Position kartın ortasının
   * (oran: altyazi-efekt.js sablonKonumu, kadrajın 0-1'i) kompozisyondaki pikselidir. Punto, önizlemedeki gibi kısa kenara
   * (min(w, h) / 1080) göre; ölçekten arındırılır (stilDizisi konturu ve gölgeyi de onunla çarpar).
   * o: { pay (kartın yarı yüksekliği, kadraj px; kartPayi), ayar (pay verilmezse ondan) }
   * Döner: { olcek (%), konum: [x, y] (kompozisyon px), konumOran: [x / 1920, y / 1080], punto (çarpan), buyutme (s > 1) }
   */
  function yerlesim(w, h, oran, o) {
    var W = sayi(w) > 0 ? Number(w) : SABLON.genislik, H = sayi(h) > 0 ? Number(h) : SABLON.yukseklik;
    var kapla = Math.max(W / SABLON.genislik, H / SABLON.yukseklik);
    var fx = oran && sayi(oran.x) !== null ? Math.max(0, Math.min(1, Number(oran.x))) : 0.5;
    var fy = oran && sayi(oran.y) !== null ? Math.max(0, Math.min(1, Number(oran.y))) : 0.84;
    var s = kapla;
    if (kapla > 1 && W <= SABLON.genislik) {
      var pay = o && sayi(o.pay) !== null && o.pay >= 0 ? Number(o.pay) : kartPayi(o && o.ayar, W, H);
      var gerek = (Math.abs(fy * H - H / 2) + pay) / (SABLON.yukseklik / 2);
      // Yuvarlanmış ölçek (%, 2 ondalık) kartı kesmesin: yukarı yuvarla
      s = Math.min(kapla, Math.max(1, Math.ceil(gerek * 10000) / 10000));
    }
    var cx = SABLON.genislik / 2 + (fx * W - W / 2) / s;
    var cy = SABLON.yukseklik / 2 + (fy * H - H / 2) / s;
    function yuvarla(v, b) { var k = Math.pow(10, b); return Math.round(v * k) / k; }
    return {
      olcek: yuvarla(s * 100, 2),
      konum: [yuvarla(cx, 1), yuvarla(cy, 1)],
      konumOran: [yuvarla(cx / SABLON.genislik, 4), yuvarla(cy / SABLON.yukseklik, 4)],
      punto: yuvarla(Math.min(W, H) / 1080 / s, 4),
      buyutme: s > 1.0001
    };
  }

  /* ---------------- Fontlar: Premiere yalnız sisteme kurulu fontu çizer ---------------- */

  function anahtar(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

  /*
   * Dosya adında aile adından sonra kalan kısım yalnız yüz ve değişken eksen adlarından oluşabilir. Öbür türlüsü BAŞKA
   * bir ailedir (PostScript adı farklı, Premiere eşlemez): InterTight-Bold, Inter_18pt-Bold (Google Fonts'un optik
   * boy kesimi, ps "Inter18pt-Bold"), NunitoSans-Regular, MontserratAlternates-Bold, BungeeShade-Regular.
   */
  var YUZ_ADLARI = ["thin", "extralight", "ultralight", "light", "regular", "normal", "book", "medium", "semibold",
    "demibold", "extrabold", "ultrabold", "bold", "black", "heavy", "italic", "oblique"];
  var EKSEN_ADLARI = ["variablefont", "opsz", "wght", "wdth", "ital", "slnt"];
  var DOSYA_PARCALARI = YUZ_ADLARI.concat(EKSEN_ADLARI);

  // "bolditalic" → ["bold", "italic"]; listede olmayan bir parça varsa null (en uzun eşleşme önce)
  function yuzParcalari(s) {
    var out = [];
    while (s) {
      var bulunan = "";
      for (var i = 0; i < DOSYA_PARCALARI.length; i++) {
        var p = DOSYA_PARCALARI[i];
        if (p.length > bulunan.length && s.indexOf(p) === 0) bulunan = p;
      }
      if (!bulunan) return null;
      out.push(bulunan);
      s = s.slice(bulunan.length);
    }
    return out;
  }

  /*
   * Aile bu dosya adlarından birinde var mı (Montserrat-Bold.ttf, ArchivoBlack.ttf, anton-regular.otf, "Bebas Neue
   * Regular.otf", Lora-VariableFont_wght.ttf…). yuz (isteğe bağlı): şablona gidecek PostScript adının yüzü ("Bold",
   * "Regular"): verilirse o yüz de aranır (yalnız Montserrat-Black.ttf kuruluysa "Montserrat-Bold" yok). Değişken font
   * ve yüz adı taşımayan tek dosya (Anton.ttf) her yüzü karşılar; italik dosya düz yüzü karşılamaz.
   */
  function fontKuruluMu(aile, dosyalar, yuz) {
    var k = anahtar(aile);
    if (!k) return false;
    var istenen = anahtar(yuz);
    return (dosyalar || []).some(function (d) {
      var ad = String(d || "").replace(/^.*[\\\/]/, "");
      if (!/\.(ttf|otf|ttc)$/i.test(ad)) return false;
      // Windows'un aynı adlı ikinci kurulumu: Montserrat-Bold_0.ttf, "Montserrat-Bold (1).ttf"
      var taban = anahtar(ad.replace(/\.[^.]+$/, "").replace(/(?:_\d+|\s*\(\d+\))$/, ""));
      if (taban.indexOf(k) !== 0) return false;
      var parca = yuzParcalari(taban.slice(k.length));
      if (!parca) return false;
      if (!istenen || !parca.length) return true;
      var italik = parca.indexOf("italic") !== -1 || parca.indexOf("oblique") !== -1;
      if (italik !== /italic|oblique/.test(istenen)) return false;
      if (parca.some(function (p) { return EKSEN_ADLARI.indexOf(p) !== -1; })) return true;
      var yuzAdi = parca.filter(function (p) { return p !== "italic" && p !== "oblique"; }).join("") || "regular";
      var istenenAd = istenen.replace(/italic|oblique/g, "") || "regular";
      if (istenenAd === "regular") return yuzAdi === "regular" || yuzAdi === "normal" || yuzAdi === "book";
      return yuzAdi === istenenAd;
    });
  }

  function arial(kalin, italik) {
    if (kalin && italik) return "Arial-BoldItalicMT";
    if (kalin) return "Arial-BoldMT";
    if (italik) return "Arial-ItalicMT";
    return "ArialMT";
  }

  /*
   * Şablona giden font. kurulu: Premiere'in gördüğü fontlar (işletim sisteminin font klasörlerindeki dosya adları ve
   * Adobe Fonts'un etkin fontlarının PostScript adları; verilmezse denetlenmez). o.bekleyen: bu oturumda "Suflo
   * fontlarını kur"un kopyaladığı dosyalar: Premiere onları ancak yeniden başlayınca görür, o zamana kadar Arial.
   * Aile Suflo'nun PostScript eşlemesinde (altyazi-efekt.js sablonFontu) değilse "bilinmiyor", kurulu değilse
   * "kurulu-degil", yalnız bu oturumda kurulduysa "yeniden-baslat": üçünde de Arial (kalın / italik korunur) ve
   * önizlemeyle sonucun farklı olabileceği uyarısı. italikYok: İtalik açık ama ailenin italik yüzü pakette yok (şablona
   * düz yüz gider; önizleme eğik çizer): uyarı gösterilir.
   * Döner: { ps, aile, yedek, neden: "" | "kurulu-degil" | "yeniden-baslat" | "bilinmiyor", italikYok }
   */
  function fontSecimi(ayar, kurulu, o) {
    var ae = AE();
    var n = ae ? ae.normalize(ayar) : (ayar || {});
    var ps = ae ? ae.sablonFontu(n) : String(n.font || "");
    var bilinen = !!ps && ps !== n.font;
    if (!bilinen) return { ps: arial(n.kalin, n.italik), aile: n.font, yedek: true, neden: "bilinmiyor", italikYok: false };
    // PostScript adının yüzü de kurulu olmalı (Montserrat-Bold → "Bold")
    var yuz = ps.lastIndexOf("-") > 0 ? ps.slice(ps.lastIndexOf("-") + 1) : "";
    if (kurulu && !fontKuruluMu(n.font, kurulu, yuz)) {
      var bekleyen = o && o.bekleyen && o.bekleyen.length ? o.bekleyen : null;
      return { ps: arial(n.kalin, n.italik), aile: n.font, yedek: true, italikYok: false,
        neden: bekleyen && fontKuruluMu(n.font, bekleyen, yuz) ? "yeniden-baslat" : "kurulu-degil" };
    }
    return { ps: ps, aile: n.font, yedek: false, neden: "", italikYok: !!n.italik && !/italic|oblique/i.test(ps) };
  }

  /*
   * Font dosyasının PostScript adları (name tablosu, nameID 6): Adobe Fonts etkin fontlarını sayısal adlı, uzantısız
   * dosyalarda tutar; Premiere onları PostScript adıyla görür. oku(konum, uzunluk) → Buffer / Uint8Array (dosyadan
   * yalnız başlık, tablo dizini ve name tablosu okunur). TrueType / OpenType (CFF) ve koleksiyon (ttcf). Bozuk ya da
   * font olmayan dosyada boş dizi. Kayıt: Windows (3, UTF-16BE) önce, yoksa Mac (1, Roman / ASCII).
   */
  function fontPostScriptAdlari(oku) {
    function u16(b, i) { return b && b.length >= i + 2 ? (b[i] << 8) | b[i + 1] : -1; }
    function u32(b, i) { return b && b.length >= i + 4 ? ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) : -1; }
    function etiket(b, i) { return b && b.length >= i + 4 ? String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]) : ""; }
    function yuzAdi(ofs) {
      var bas = oku(ofs, 12);
      var surum = etiket(bas, 0);
      if (surum !== "\u0000\u0001\u0000\u0000" && surum !== "OTTO" && surum !== "true") return "";
      var n = u16(bas, 4);
      if (!(n > 0 && n < 200)) return "";
      var dizin = oku(ofs + 12, n * 16);
      for (var i = 0; i < n; i++) {
        if (etiket(dizin, i * 16) !== "name") continue;
        var tOfs = u32(dizin, i * 16 + 8), tUz = u32(dizin, i * 16 + 12);
        if (!(tOfs > 0 && tUz > 6 && tUz < 1048576)) return "";
        var t = oku(tOfs, tUz);
        var sayi = u16(t, 2), depo = u16(t, 4), mac = "";
        for (var j = 0; j < sayi; j++) {
          var k = 6 + j * 12;
          var plat = u16(t, k), kod = u16(t, k + 2), adNo = u16(t, k + 6), uz = u16(t, k + 8), yer = depo + u16(t, k + 10);
          if (adNo !== 6 || uz <= 0 || yer + uz > t.length) continue;
          var s = "", c;
          if (plat === 3 || plat === 0) { for (c = 0; c + 1 < uz; c += 2) s += String.fromCharCode((t[yer + c] << 8) | t[yer + c + 1]); return s; }
          if (plat === 1 && kod === 0 && !mac) { for (c = 0; c < uz; c++) mac += String.fromCharCode(t[yer + c]); }
        }
        return mac;
      }
      return "";
    }
    try {
      var bas = oku(0, 12);
      if (etiket(bas, 0) === "ttcf") {
        var adet = u32(bas, 8);
        if (!(adet > 0 && adet < 64)) return [];
        var ofsler = oku(12, adet * 4), out = [];
        for (var i = 0; i < adet; i++) { var a = yuzAdi(u32(ofsler, i * 4)); if (a) out.push(a); }
        return out;
      }
      var tek = yuzAdi(0);
      return tek ? [tek] : [];
    } catch (e) { return []; }
  }

  // Adobe Fonts (Creative Cloud) etkin fontlarının klasörleri (dosyalar sayısal adlı; macOS'ta gizli). env: { APPDATA, HOME }
  function adobeFontKlasorleri(platform, env) {
    env = env || {};
    var kok = "";
    if (platform === "win32" && env.APPDATA) kok = birlestir(platform, env.APPDATA, "Adobe\\CoreSync\\plugins\\livetype");
    else if (platform === "darwin" && env.HOME) kok = birlestir(platform, env.HOME, "Library/Application Support/Adobe/CoreSync/plugins/livetype");
    if (!kok) return [];
    return [birlestir(platform, kok, ".r"), birlestir(platform, kok, "r")];
  }

  /*
   * Yerel ekleme bildiriminin ekleri (önizleme / video katmanından farkı). o: { font (fontSecimi), vurguKaybi (sayı),
   * logo (Marka Kiti logosu açık), konusmaci (Podcast Modu konuşmacı renkleri açık), konumYok (Caption_Position /
   * Motion › Scale yazılamadı) }. Logo ve konuşmacı renkleri yalnız video katmanında çizilir: yolu da söylenir.
   */
  function bildirimEkleri(o) {
    o = o || {};
    var ek = [], f = o.font || {};
    if (f.yedek) ek.push(f.neden === "yeniden-baslat" ? "yazı tipi Arial (Premiere'i yeniden başlat)" : "yazı tipi Arial");
    if (f.italikYok) ek.push("italik yerel çıktıda yok");
    if (o.vurguKaybi) ek.push("anahtar kelime vurgusu yerel çıktıda yok");
    if (o.logo) ek.push("Marka Kiti logosu yerel çıktıda yok");
    if (o.konusmaci) ek.push("konuşmacı renkleri yerel çıktıda yok");
    if (o.logo || o.konusmaci) ek.push("bunlar için Çıktı: Video katmanı");
    if (o.konumYok) ek.push("konum / ölçek Premiere'de elle ayarlanmalı");
    return ek;
  }

  /*
   * Grubun izdeki ayak izi: importMGT her parçayı şablonun TAM süresiyle (1 saat) overwrite eder, ucu sonra kırpılır.
   * İz ilk parçanın başından son parçanın başı + şablon süresine kadar boş olmalı (kırpma ezilen klibi geri getirmez).
   * Döner: { start, end } (sn)
   */
  function izAraligi(parcalar) {
    var p = parcalar || [];
    if (!p.length) return { start: 0, end: 0 };
    var ilk = p[0], son = p[p.length - 1];
    return { start: Number(ilk.start) || 0, end: Math.max(Number(son.end) || 0, (Number(son.start) || 0) + SABLON.sure) };
  }

  function birlestir(platform, a, b) {
    var ayrac = platform === "win32" ? "\\" : "/";
    return String(a).replace(/[\\\/]+$/, "") + ayrac + b;
  }

  // Taranacak font klasörleri (sistem + kullanıcı); env: { LOCALAPPDATA, WINDIR, HOME }
  function fontKlasorleri(platform, env) {
    env = env || {};
    if (platform === "win32") {
      var out = [birlestir(platform, env.WINDIR || env.windir || "C:\\Windows", "Fonts")];
      if (env.LOCALAPPDATA) out.push(birlestir(platform, env.LOCALAPPDATA, "Microsoft\\Windows\\Fonts"));
      return out;
    }
    if (platform === "darwin") {
      var m = ["/Library/Fonts", "/System/Library/Fonts", "/System/Library/Fonts/Supplemental"];
      if (env.HOME) m.unshift(birlestir(platform, env.HOME, "Library/Fonts"));
      return m;
    }
    return [];
  }

  /*
   * Paketin fonts/ klasöründen kurulacak dosyalar: aile başına (dosya adının "-" öncesi) statik yüzler varsa
   * (Montserrat-Regular / -Bold) onlar, yoksa tek dosya (Anton.ttf). Değişken ana dosya statiklerle birlikte
   * kurulmaz (Windows aynı aileyi iki kez görüp yanlış yüzü seçebilir). Lisans metinleri (.txt) dışarıda.
   */
  function paketFontlari(dosyalar) {
    var aileler = {}, sira = [];
    (dosyalar || []).forEach(function (d) {
      var ad = String(d || "").replace(/^.*[\\\/]/, "");
      if (!/\.(ttf|otf)$/i.test(ad)) return;
      var taban = ad.replace(/\.[^.]+$/, "");
      var aile = anahtar(taban.split("-")[0]);
      if (!aile) return;
      if (!aileler[aile]) { aileler[aile] = { tek: [], statik: [] }; sira.push(aile); }
      (taban.indexOf("-") !== -1 ? aileler[aile].statik : aileler[aile].tek).push(ad);
    });
    var out = [];
    sira.forEach(function (a) { out = out.concat(aileler[a].statik.length ? aileler[a].statik : aileler[a].tek); });
    return out;
  }

  var REG_FONTS = "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";

  /*
   * "Suflo fontlarını kur" planı: dosyalar [{ dosya (ad), kaynak (tam yol) }] kullanıcı font klasörüne kopyalanır.
   * Windows 10 1809+: %LOCALAPPDATA%\Microsoft\Windows\Fonts + HKCU Fonts değeri; reg komutu args dizisi
   * (kabuk yok). macOS: ~/Library/Fonts. Başka platform ya da klasör bilinmiyorsa boş plan.
   * Döner: [{ kaynak, hedef, reg: [args] | null }]
   */
  function fontKurulumPlani(platform, env, dosyalar) {
    env = env || {};
    var dizin = "";
    if (platform === "win32" && env.LOCALAPPDATA) dizin = birlestir(platform, env.LOCALAPPDATA, "Microsoft\\Windows\\Fonts");
    else if (platform === "darwin" && env.HOME) dizin = birlestir(platform, env.HOME, "Library/Fonts");
    if (!dizin) return [];
    var gorulen = {};
    return (dosyalar || []).filter(function (d) {
      var ad = d && String(d.dosya || "").replace(/^.*[\\\/]/, "");
      if (!ad || !/\.(ttf|otf)$/i.test(ad) || gorulen[ad.toLowerCase()] || !d.kaynak) return false;
      gorulen[ad.toLowerCase()] = 1;
      return true;
    }).map(function (d) {
      var ad = String(d.dosya).replace(/^.*[\\\/]/, "");
      var hedef = birlestir(platform, dizin, ad);
      var deger = ad.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") + (/\.otf$/i.test(ad) ? " (OpenType)" : " (TrueType)");
      return {
        kaynak: String(d.kaynak),
        hedef: hedef,
        dizin: dizin,
        reg: platform === "win32" ? ["add", REG_FONTS, "/v", deger, "/t", "REG_SZ", "/d", hedef, "/f"] : null
      };
    });
  }

  /*
   * Premiere 22 (2022) ve üstü + aktif sekansta importMGT. probe: KS_captionJsonMogrtProbe çıktısı
   * ({ app, seq, importMGT }). Döner: { ok, neden: "" | "surum" | "sekans" | "api" }
   */
  function yerelDestek(app, probe) {
    var ana = parseInt(String(app || (probe && probe.app) || ""), 10);
    if (!(ana >= EN_AZ_PREMIERE)) return { ok: false, neden: "surum" };
    if (probe && probe.seq === false) return { ok: false, neden: "sekans" };
    if (probe && probe.importMGT === false) return { ok: false, neden: "api" };
    return { ok: true, neden: "" };
  }

  return {
    SABLON: JSON.parse(JSON.stringify(SABLON)),
    SINIR: JSON.parse(JSON.stringify(SINIR)),
    BAYT_KADEMELERI: BAYT_KADEMELERI.slice(),
    PUNTO_ORANI: PUNTO_ORANI,
    ARIAL_GENISLIK: ARIAL_GENISLIK,
    EN_AZ_PREMIERE: EN_AZ_PREMIERE,
    temizMetin: temizMetin,
    baytSay: baytSay,
    satirlar: satirlar,
    stilDizisi: stilDizisi,
    build: build,
    kartPayi: kartPayi,
    yerlesim: yerlesim,
    izAraligi: izAraligi,
    bildirimEkleri: bildirimEkleri,
    fontKuruluMu: fontKuruluMu,
    fontSecimi: fontSecimi,
    fontPostScriptAdlari: fontPostScriptAdlari,
    fontKlasorleri: fontKlasorleri,
    adobeFontKlasorleri: adobeFontKlasorleri,
    paketFontlari: paketFontlari,
    fontKurulumPlani: fontKurulumPlani,
    yerelDestek: yerelDestek
  };
});
