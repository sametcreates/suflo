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
  var KASE = ["normal", "upper", "lower"];
  var RENK = /^#[0-9a-f]{6}$/i;
  // Panelle gelen yazı tipleri (style-share.js yoksa yedek liste)
  var FONTLAR = SS && SS.fontNames ? SS.fontNames() : ["Anton", "Archivo Black", "Bebas Neue", "Bungee", "Lora", "Montserrat"];

  /*
   * Hazır görünümler. "temiz" stil motorundaki efekt varsayılanıyla birebir aynı (test denetler).
   * kase: yazım biçimi (Altyazı ayarları › Yazım biçimi), görünüm seçilince o da dolar.
   */
  var GORUNUMLER = [
    { id: "temiz", ad: "Temiz", ayar: {
      giris: "fade", aktif: "yok", vurgu: true, vurguRenk: "#ffd23f", renk: "#ffffff", font: "Montserrat",
      kalin: true, italik: false, boyut: 76, kontur: 5, konturRenk: "#000000", konum: 2, satir: 2, kelime: 5, kase: "normal" } },
    { id: "vurucu", ad: "Vurucu", ayar: {
      giris: "pop", aktif: "zipla", vurgu: true, vurguRenk: "#ffe600", renk: "#ffffff", font: "Anton",
      kalin: true, italik: false, boyut: 112, kontur: 8, konturRenk: "#000000", konum: 5, satir: 2, kelime: 3, kase: "upper" } },
    { id: "canli", ad: "Canlı", ayar: {
      giris: "zipla", aktif: "zipla", vurgu: true, vurguRenk: "#ff5fa2", renk: "#ffffff", font: "Archivo Black",
      kalin: true, italik: false, boyut: 92, kontur: 6, konturRenk: "#16121f", konum: 5, satir: 2, kelime: 3, kase: "upper" } },
    { id: "zarif", ad: "Zarif", ayar: {
      giris: "yukari", aktif: "yok", vurgu: true, vurguRenk: "#e3c27a", renk: "#f7f3ea", font: "Lora",
      kalin: false, italik: false, boyut: 70, kontur: 2, konturRenk: "#0b0b0d", konum: 2, satir: 2, kelime: 6, kase: "normal" } },
    { id: "glitch", ad: "Glitch", ayar: {
      giris: "asagi", aktif: "glitch", vurgu: true, vurguRenk: "#2af5ff", renk: "#ffffff", font: "Bebas Neue",
      kalin: true, italik: false, boyut: 118, kontur: 3, konturRenk: "#0b1020", konum: 5, satir: 1, kelime: 3, kase: "upper" } }
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
    return out;
  }

  // Stil motoruna / SFL1 koduna giden ince ayar (kase metin kuralıdır, buraya girmez; guvenli çağıranın)
  function overrides(ayar) {
    var n = normalize(ayar);
    return {
      font: n.font, renk: n.renk, konturRenk: n.konturRenk, vurguRenk: n.vurguRenk, boyut: n.boyut, kontur: n.kontur, konum: n.konum,
      giris: n.giris, aktif: n.aktif, vurgu: n.vurgu, kalin: n.kalin, italik: n.italik, satir: n.satir, kelime: n.kelime
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
   * Görünüm seçimi hâlâ ayarlarla aynı mı? (Kontrol elle değişince seçili çip kalkar.) kase hariç:
   * yazım biçimi Altyazı ayarlarında, kullanıcı ayrıca değiştirebilir.
   */
  function gorunumuBul(ayar) {
    var n = normalize(ayar);
    for (var i = 0; i < GORUNUMLER.length; i++) {
      var g = GORUNUMLER[i].ayar, ayni = true;
      for (var k in g) if (own(g, k) && k !== "kase" && String(g[k]).toLowerCase() !== String(n[k]).toLowerCase()) { ayni = false; break; }
      if (ayni) return GORUNUMLER[i].id;
    }
    return "";
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
   * Gölge ve arka plan kutusu oluşturucuya 3.3'ün sonraki adımında gelir: şimdilik [0].
   */
  function sablonStili(ayar, o) {
    var n = normalize(ayar);
    var olcek = o && typeof o.olcek === "number" && isFinite(o.olcek) && o.olcek > 0 ? o.olcek : 1;
    var ind = sablonIndeksleri(n);
    var kontur = n.kontur > 0 ? [1].concat(rgb(n.konturRenk), [n.kontur]) : [0];
    return [rgb(n.vurgu ? n.vurguRenk : n.renk), rgb(n.renk), sablonFontu(n), Math.round(n.boyut * olcek), kontur, [0], [0], ind.textAnim, ind.hlAnim];
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
    sablonIndeksleri: sablonIndeksleri,
    sablonFontu: sablonFontu,
    sablonStili: sablonStili
  };
});
