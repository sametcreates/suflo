/*
 * Suflo — Altyazı Efektleri oluşturucusunun saf modeli (3.3)
 *
 * Altyazı sekmesindeki "Altyazı Efektleri" bölümü tek bir temel stil üretir: stil motorundaki
 * "efekt" (js/style-engine.js). Bu modül arayüzden bağımsız kısmı taşır:
 *   - GIRISLER / AKTIFLER: giriş ve vurgu animasyonlarının kimlik ve adları
 *   - GORUNUMLER: "Hazır görünümler" (kontrolleri dolduran 5 başlangıç; rozet yok)
 *   - normalize(ayar): oluşturucu ayarını doğrular, eksik / geçersiz alan varsayılana döner
 *   - overrides(ayar): stil motoruna ve SFL1 koduna giden ince ayar (styleId "efekt")
 *   - eskiGorunum / eskiStilden: eski Suflo stil kimlikleri (Creator Punch, Bold Box…) en yakın
 *     görünüme taşınır (kayıtlı tercih, eski SFL1 kodu, Shorts paketi seçimi)
 *   - sablonIndeksleri / sablonStili: TranscriptAI altyazı şablonunun JSON_Input sözleşmesiyle
 *     1:1 eşleme. Yerel (render'sız) MOGRT çıktısı 3.3'ün sonraki adımında bu ek yeri kullanır.
 *     Yalnız veri düzeni izlenir (birlikte çalışabilirlik); şablondan kod alınmadı.
 *   - 3.3 adım 17: gölge (golge), arka plan kutusu (kutu, kutuRenk, kutuOpak), serbest konum
 *     (konumX / konumY, %5-95) ve önizlemede sürükleme: konumNoktasi, surukle (hazır konumlara ±%3
 *     yapışır), kaydir (ok tuşları), sifirla (çift tık), konumEtiketi ("X %50 · Y %85").
 *     Şablonun sözleşmesinde konum yok: sablonKonumu klibin Motion › Position'ı için oranı verir.
 *
 * Sözleşme sırası (JSON_Input dizisi): [vurguRGB, yaziRGB, font (PostScript adı), punto, kontur [1,r,g,b,kalınlık]|[0],
 *   gölge [1,r,g,b,opaklık,mesafe,yumuşaklık]|[0], kutu [1,r,g,b,opaklık]|[0], textAnim 0-5, hlAnim 0-3, satırlar]
 *
 * DOM'a, Premiere'e, dosya sistemine dokunmaz. ES5, UMD (Node 12 / CEF 74).
 */
(function (root, factory) {
  function yukle(ad, yol) {
    var m = (root && root[ad]) || null;
    if (!m && typeof require === "function") { try { m = require(yol); } catch (e) { m = null; } }
    return m;
  }
  var api = factory(yukle("SufloStyleShare", "./style-share.js"));
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAltyaziEfekt = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (SS) {
  "use strict";

  var STIL = "efekt";

  // Dizin sırası şablonun textAnim / hlAnim değeridir (stil motorunun GIRISLER / AKTIFLER'iyle aynı)
  var GIRISLER = [
    { id: "yok", ad: "Yok" },
    { id: "pop", ad: "Pop" },
    { id: "fade", ad: "Belirme" },
    { id: "yukari", ad: "Yukarı kay" },
    { id: "asagi", ad: "Aşağı kay" },
    { id: "zipla", ad: "Zıpla" }
  ];
  var AKTIFLER = [
    { id: "yok", ad: "Yok" },
    { id: "zipla", ad: "Zıpla" },
    { id: "titre", ad: "Titre" },
    { id: "glitch", ad: "Glitch" }
  ];

  var KONUMLAR = [1, 2, 5, 8];
  /*
   * Hazır konumların önizlemedeki noktası (% kadraj; stil motorunun efekt bağlantı noktasıyla aynı:
   * alt sol x %8,5 y %85,5, alt %84, orta %62, üst %22) ve adları. Sürüklerken ±%3 içinde yapışılır.
   */
  var KONUM_NOKTALARI = { 1: { x: 8.5, y: 85.5, ad: "Alt sol" }, 2: { x: 50, y: 84, ad: "Alt" }, 5: { x: 50, y: 62, ad: "Orta" }, 8: { x: 50, y: 22, ad: "Üst" } };
  var YAPISMA = 3;
  // Stil motoru / paylaşım koduyla aynı aralıklar (test eşleşmeyi denetler)
  var GOLGE_VARSAYILAN = { renk: "#000000", opak: 75, mesafe: 5, yumusak: 5 };
  var GOLGE_ARALIK = { opak: [0, 100], mesafe: [0, 20], yumusak: [0, 30] };
  var KUTU_OPAK = [0, 100], KONUM_YUZDE = [5, 95];
  var KASE = ["normal", "upper", "lower"];
  var RENK = /^#[0-9a-f]{6}$/i;
  // Panelle gelen yazı tipleri (style-share.js yoksa yedek liste)
  var FONTLAR = SS && SS.fontNames ? SS.fontNames() : ["Anton", "Archivo Black", "Bebas Neue", "Bungee", "Lora", "Montserrat"];

  /*
   * Hazır görünümler. "temiz" stil motorundaki efekt varsayılanıyla birebir aynı (test denetler).
   * kase / punct: yazım biçimi ve noktalama (Altyazı ayarları), görünüm seçilince onlar da dolar (3.2'nin
   * noktalamasız stillerinin yerini alan Vurucu / Canlı / Glitch noktalamasız).
   * Her görünüm her alanı VARSAYILAN sırasıyla taşır (normalize'dan aynen geçer). Adım 17: Vurucu sert,
   * Zarif yumuşak gölgeli; "Kutulu" yarı saydam arka plan kutusu (konturusuz, okunur).
   */
  var GORUNUMLER = [
    { id: "temiz", ad: "Temiz", ayar: {
      giris: "fade", aktif: "yok", vurgu: true, vurguRenk: "#ffd23f", renk: "#ffffff", font: "Montserrat",
      kalin: true, italik: false, boyut: 76, kontur: 5, konturRenk: "#000000", konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true,
      golge: null, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null } },
    { id: "vurucu", ad: "Vurucu", ayar: {
      giris: "pop", aktif: "zipla", vurgu: true, vurguRenk: "#ffe600", renk: "#ffffff", font: "Anton",
      kalin: true, italik: false, boyut: 112, kontur: 8, konturRenk: "#000000", konum: 5, satir: 2, kelime: 3, kase: "upper", punct: false,
      golge: { renk: "#000000", opak: 85, mesafe: 7, yumusak: 0 }, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null } },
    { id: "canli", ad: "Canlı", ayar: {
      giris: "zipla", aktif: "zipla", vurgu: true, vurguRenk: "#ff5fa2", renk: "#ffffff", font: "Archivo Black",
      kalin: true, italik: false, boyut: 92, kontur: 6, konturRenk: "#16121f", konum: 5, satir: 2, kelime: 3, kase: "upper", punct: false,
      golge: null, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null } },
    { id: "zarif", ad: "Zarif", ayar: {
      giris: "yukari", aktif: "yok", vurgu: true, vurguRenk: "#e3c27a", renk: "#f7f3ea", font: "Lora",
      kalin: false, italik: false, boyut: 70, kontur: 2, konturRenk: "#0b0b0d", konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true,
      golge: { renk: "#000000", opak: 60, mesafe: 3, yumusak: 10 }, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null } },
    { id: "kutulu", ad: "Kutulu", ayar: {
      giris: "fade", aktif: "yok", vurgu: true, vurguRenk: "#ffd23f", renk: "#ffffff", font: "Montserrat",
      kalin: true, italik: false, boyut: 64, kontur: 0, konturRenk: "#000000", konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true,
      golge: null, kutu: true, kutuRenk: "#000000", kutuOpak: 65, konumX: null, konumY: null } },
    { id: "glitch", ad: "Glitch", ayar: {
      giris: "asagi", aktif: "glitch", vurgu: true, vurguRenk: "#2af5ff", renk: "#ffffff", font: "Bebas Neue",
      kalin: true, italik: false, boyut: 118, kontur: 3, konturRenk: "#0b1020", konum: 5, satir: 1, kelime: 3, kase: "upper", punct: false,
      golge: null, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null } }
  ];

  // Eski stil kimliği → en yakın görünüm
  var ESKI = {
    mrbeast: "vurucu", hormozi: "vurucu", viral: "vurucu",
    pop: "canli", ziplama: "canli",
    capcut: "temiz", saas: "temiz", dolgu: "temiz", daktilo: "temiz",
    doc: "zarif", premium: "zarif",
    neon: "glitch"
  };

  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function kopya(o) { return JSON.parse(JSON.stringify(o)); }
  function idler(liste) { return liste.map(function (x) { return x.id; }); }
  function sayi(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
    return null;
  }

  function gorunum(id) {
    for (var i = 0; i < GORUNUMLER.length; i++) if (GORUNUMLER[i].id === id) return kopya(GORUNUMLER[i]);
    return null;
  }

  var VARSAYILAN = GORUNUMLER[0].ayar;

  /*
   * Oluşturucu ayarını doğrula. Eksik ya da geçersiz alan taban değere (verilmezse "Temiz") döner;
   * sayılar aralığa kırpılır. Dönen nesnede her alan VAR.
   */
  function normalize(ayar, taban) {
    var a = ayar !== null && typeof ayar === "object" && !(ayar instanceof Array) ? ayar : {};
    var t = taban && typeof taban === "object" ? normalize(taban) : kopya(VARSAYILAN);
    var out = kopya(t);
    if (own(a, "giris") && idler(GIRISLER).indexOf(a.giris) !== -1) out.giris = a.giris;
    if (own(a, "aktif") && idler(AKTIFLER).indexOf(a.aktif) !== -1) out.aktif = a.aktif;
    ["vurgu", "kalin", "italik"].forEach(function (k) { if (own(a, k) && typeof a[k] === "boolean") out[k] = a[k]; });
    ["vurguRenk", "renk", "konturRenk"].forEach(function (k) { if (own(a, k) && typeof a[k] === "string" && RENK.test(a[k])) out[k] = a[k].toLowerCase(); });
    if (own(a, "font") && FONTLAR.indexOf(a.font) !== -1) out.font = a.font;
    function aralik(k, en, ust) {
      if (!own(a, k)) return;
      var n = sayi(a[k]);
      if (n !== null) out[k] = Math.max(en, Math.min(ust, Math.round(n)));
    }
    aralik("boyut", 36, 180);
    aralik("kontur", 0, 16);
    aralik("satir", 1, 3);
    aralik("kelime", 1, 10);
    if (own(a, "konum")) { var p = sayi(a.konum); if (KONUMLAR.indexOf(p) !== -1) out.konum = p; }
    if (own(a, "kase") && KASE.indexOf(a.kase) !== -1) out.kase = a.kase;
    if (own(a, "punct") && typeof a.punct === "boolean") out.punct = a.punct;
    // Adım 17: gölge (null = yok), kutu, serbest konum
    if (own(a, "golge")) {
      if (a.golge === null || a.golge === false) out.golge = null;
      else if (a.golge && typeof a.golge === "object" && !(a.golge instanceof Array)) out.golge = golgeNormalize(a.golge);
    }
    if (own(a, "kutu") && typeof a.kutu === "boolean") out.kutu = a.kutu;
    if (own(a, "kutuRenk") && typeof a.kutuRenk === "string" && RENK.test(a.kutuRenk)) out.kutuRenk = a.kutuRenk.toLowerCase();
    aralik("kutuOpak", KUTU_OPAK[0], KUTU_OPAK[1]);
    // Konum ikisi birlikte: biri geçersizse (ya da null) hazır konuma dönülür
    if (own(a, "konumX") || own(a, "konumY")) {
      var x = sayi(a.konumX), y = sayi(a.konumY);
      if (x !== null && y !== null) { out.konumX = kirp(x, KONUM_YUZDE); out.konumY = kirp(y, KONUM_YUZDE); }
      else { out.konumX = null; out.konumY = null; }
    }
    return out;
  }

  function kirp(n, ar) { return Math.max(ar[0], Math.min(ar[1], Math.round(n))); }
  function golgeNormalize(g) {
    var out = kopya(GOLGE_VARSAYILAN);
    if (typeof g.renk === "string" && RENK.test(g.renk)) out.renk = g.renk.toLowerCase();
    ["opak", "mesafe", "yumusak"].forEach(function (k) { var n = sayi(g[k]); if (n !== null) out[k] = kirp(n, GOLGE_ARALIK[k]); });
    return out;
  }

  // Stil motoruna / SFL1 koduna giden ince ayar (kase / punct metin kuralıdır, buraya girmez; guvenli çağıranın)
  function overrides(ayar) {
    var n = normalize(ayar);
    return {
      font: n.font, renk: n.renk, konturRenk: n.konturRenk, vurguRenk: n.vurguRenk, boyut: n.boyut, kontur: n.kontur, konum: n.konum,
      giris: n.giris, aktif: n.aktif, vurgu: n.vurgu, kalin: n.kalin, italik: n.italik, satir: n.satir, kelime: n.kelime,
      golge: n.golge ? kopya(n.golge) : null, kutu: n.kutu, kutuRenk: n.kutuRenk, kutuOpak: n.kutuOpak, konumX: n.konumX, konumY: n.konumY
    };
  }

  function eskiGorunum(styleId) {
    return typeof styleId === "string" && own(ESKI, styleId) ? ESKI[styleId] : null;
  }

  /*
   * Eski stil (kayıtlı tercih, 3.2 SFL1 kodu, Shorts paketi) → oluşturucu ayarı: en yakın görünüm,
   * üstüne eski ayarın marka alanları (paket yazı tipi, yazı / kontur / vurgu rengi, konum).
   * Punto ve kontur kalınlığı görünümden gelir: eski stillerin ölçüsü kendi kompozisyonlarına göreydi.
   * Bilinmeyen kimlikte null.
   */
  function eskiStilden(styleId, stil) {
    var g = gorunum(eskiGorunum(styleId));
    if (!g) return null;
    var s = stil && typeof stil === "object" ? stil : {};
    var marka = {};
    ["font", "renk", "konturRenk", "vurguRenk", "konum"].forEach(function (k) { if (own(s, k)) marka[k] = s[k]; });
    return normalize(marka, g.ayar);
  }

  /*
   * Görünüm seçimi hâlâ ayarlarla aynı mı? (Kontrol elle değişince seçili çip kalkar.) kase / punct hariç:
   * yazım biçimi ve noktalama Altyazı ayarlarında, kullanıcı ayrıca değiştirebilir. Kutu kapalıyken kutunun rengi /
   * opaklığı görünmez, sayılmaz.
   */
  function gorunurAyar(a) {
    var n = normalize(a);
    delete n.kase;
    delete n.punct;
    if (!n.kutu) { delete n.kutuRenk; delete n.kutuOpak; }
    return JSON.stringify(n).toLowerCase();
  }
  function gorunumuBul(ayar) {
    var n = gorunurAyar(ayar);
    for (var i = 0; i < GORUNUMLER.length; i++) if (gorunurAyar(GORUNUMLER[i].ayar) === n) return GORUNUMLER[i].id;
    return "";
  }

  /* ---------------- Serbest konum: önizlemede sürükleme (adım 17) ---------------- */

  // Ayarın önizlemedeki noktası (%): serbest konum ya da hazır konumun noktası
  function konumNoktasi(ayar) {
    var n = normalize(ayar);
    if (n.konumX !== null && n.konumY !== null) return { x: n.konumX, y: n.konumY, konum: n.konum, serbest: true };
    var p = KONUM_NOKTALARI[n.konum];
    return { x: p.x, y: p.y, konum: n.konum, serbest: false };
  }

  /*
   * Sürükleme (x, y: kadrajın %'si) → ayarın konum alanları. Bir hazır konumun noktasına ±%3 içinde
   * yapışır: o hazır konum seçilir, serbest konum silinir. Değilse %5-95'e kırpılmış tam sayılar; hazır
   * konum (konum) olduğu gibi kalır (çift tık / sıfırla ona döner).
   * Döner: { konum, konumX, konumY, x, y, yapisti: 0 | hazır konum }
   */
  function surukle(ayar, x, y) {
    var n = normalize(ayar);
    var px = sayi(x), py = sayi(y);
    if (px === null || py === null) return { konum: n.konum, konumX: n.konumX, konumY: n.konumY, x: konumNoktasi(n).x, y: konumNoktasi(n).y, yapisti: 0 };
    for (var i = 0; i < KONUMLAR.length; i++) {
      var p = KONUM_NOKTALARI[KONUMLAR[i]];
      if (Math.abs(px - p.x) <= YAPISMA && Math.abs(py - p.y) <= YAPISMA) return { konum: KONUMLAR[i], konumX: null, konumY: null, x: p.x, y: p.y, yapisti: KONUMLAR[i] };
    }
    var kx = kirp(px, KONUM_YUZDE), ky = kirp(py, KONUM_YUZDE);
    return { konum: n.konum, konumX: kx, konumY: ky, x: kx, y: ky, yapisti: 0 };
  }

  // Ok tuşu: dx / dy % (Shift ile 5). Hazır konumdan başlanırsa onun noktasından; yapışmaz
  function kaydir(ayar, dx, dy) {
    var n = normalize(ayar), p = konumNoktasi(n);
    var kx = kirp(p.x + (sayi(dx) || 0), KONUM_YUZDE), ky = kirp(p.y + (sayi(dy) || 0), KONUM_YUZDE);
    return { konum: n.konum, konumX: kx, konumY: ky, x: kx, y: ky, yapisti: 0 };
  }

  // Çift tık: serbest konum silinir, hazır konum (konum) geçerli olur
  function sifirla(ayar) {
    var n = normalize(ayar), p = KONUM_NOKTALARI[n.konum];
    return { konum: n.konum, konumX: null, konumY: null, x: p.x, y: p.y, yapisti: n.konum };
  }

  /*
   * Önizleme etiketi (Türkçe yazım; İngilizce arayüzde i18n deseni "X 50% · Y 85%" yapar). Hazır konumda
   * adı: "Alt · hazır konum".
   */
  function konumEtiketi(nokta) {
    if (!nokta) return "";
    if (nokta.yapisti && KONUM_NOKTALARI[nokta.yapisti]) return KONUM_NOKTALARI[nokta.yapisti].ad + " · hazır konum";
    return "X %" + Math.round(nokta.x) + " · Y %" + Math.round(nokta.y);
  }

  /*
   * Yerel MOGRT (3.3 sonraki adım): şablonun JSON sözleşmesinde konum yok; klibin Motion › Position'ı
   * için kartın ortasının kadraj oranı (0-1). Hazır konumda o konumun noktası.
   */
  function sablonKonumu(ayar) {
    var p = konumNoktasi(ayar);
    return { x: Math.round(p.x * 10) / 1000, y: Math.round(p.y * 10) / 1000, serbest: p.serbest };
  }

  /* ---------------- TranscriptAI şablonu sözleşmesi (yerel MOGRT çıktısı için ek yeri) ---------------- */

  function rgb(hex) {
    var h = String(hex || "").replace("#", "");
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }

  /*
   * Şablonun yazı tipi alanı (3.) Premiere'in setFont'una giden PostScript adıdır; kalın / italik
   * yalnız bu adla taşınır (sözleşmede ayrı bayrak yok; TranscriptAI istemcisi de aile + kalın +
   * italik → PostScript adı eşler). Yalnız Suflo'nun paketlediği yüzler (fonts/ dosyalarının nameID 6'sı
   * ve Lora'nın adlı örnekleri): kurulu olmayan bir ad (ör. Montserrat-Italic) şablonda yazı tipini
   * tümden düşürür, eksik yüz yerine en yakın paket yüzü gider. Tek ağırlıklı görüntü fontlarında
   * (Anton, Archivo Black, Bebas Neue, Bungee) kalın / italik yüz yok; italik hiçbir pakette yok.
   * Yerel MOGRT adımı bu fontları kullanıcıya kurmalı ya da kurulu değilse libass katmanına düşmeli
   * (Premiere yalnız sisteme kurulu fontu çizer).
   */
  var POSTSCRIPT = {
    "Anton": { n: "Anton-Regular" },
    "Archivo Black": { n: "ArchivoBlack-Regular" },
    "Bebas Neue": { n: "BebasNeue-Regular" },
    "Bungee": { n: "Bungee-Regular" },
    "Lora": { n: "Lora-Regular", b: "Lora-Bold" },
    "Montserrat": { n: "Montserrat-Regular", b: "Montserrat-Bold" }
  };
  function sablonFontu(ayar) {
    var n = normalize(ayar);
    var e = own(POSTSCRIPT, n.font) ? POSTSCRIPT[n.font] : null;
    if (!e) return n.font;
    return n.kalin && e.b ? e.b : e.n;
  }

  function sablonIndeksleri(ayar) {
    var n = normalize(ayar);
    return { textAnim: Math.max(0, idler(GIRISLER).indexOf(n.giris)), hlAnim: Math.max(0, idler(AKTIFLER).indexOf(n.aktif)) };
  }

  /*
   * Sözleşmenin ilk 9 alanı (satırlar hariç). o.olcek: punto çarpanı (sekans yüksekliği / 1080 gibi;
   * yerleştirme adımı kendi ölçüsünü verir). Kelime vurgusu kapalıysa vurgu rengi yazı rengidir.
   * Gölge [1, r, g, b, opaklık, mesafe, yumuşaklık] | [0]; kutu [1, r, g, b, opaklık] | [0] (adım 17).
   */
  function sablonStili(ayar, o) {
    var n = normalize(ayar);
    var olcek = o && typeof o.olcek === "number" && isFinite(o.olcek) && o.olcek > 0 ? o.olcek : 1;
    var ind = sablonIndeksleri(n);
    var kontur = n.kontur > 0 ? [1].concat(rgb(n.konturRenk), [n.kontur]) : [0];
    var golge = n.golge ? [1].concat(rgb(n.golge.renk), [n.golge.opak, n.golge.mesafe, n.golge.yumusak]) : [0];
    var kutu = n.kutu ? [1].concat(rgb(n.kutuRenk), [n.kutuOpak]) : [0];
    return [rgb(n.vurgu ? n.vurguRenk : n.renk), rgb(n.renk), sablonFontu(n), Math.round(n.boyut * olcek), kontur, golge, kutu, ind.textAnim, ind.hlAnim];
  }

  return {
    STIL: STIL,
    GIRISLER: kopya(GIRISLER),
    AKTIFLER: kopya(AKTIFLER),
    GORUNUMLER: kopya(GORUNUMLER),
    VARSAYILAN: kopya(VARSAYILAN),
    gorunum: gorunum,
    normalize: normalize,
    overrides: overrides,
    eskiGorunum: eskiGorunum,
    eskiStilden: eskiStilden,
    gorunumuBul: gorunumuBul,
    KONUM_NOKTALARI: kopya(KONUM_NOKTALARI),
    YAPISMA: YAPISMA,
    konumNoktasi: konumNoktasi,
    surukle: surukle,
    kaydir: kaydir,
    sifirla: sifirla,
    konumEtiketi: konumEtiketi,
    sablonKonumu: sablonKonumu,
    sablonIndeksleri: sablonIndeksleri,
    sablonFontu: sablonFontu,
    sablonStili: sablonStili
  };
});
