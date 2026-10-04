/*
 * Suflo — paylaşılabilir stil kodları (SFL1.…) ve stil ince ayarının doğrulaması
 *
 * Bir Suflo Stili + ince ayarı (yazı tipi, renkler, punto, kontur, konum, platform güvenli
 * yerleşimi) + metin biçimi (satır uzunluğu, yazım, noktalama) + isteğe bağlı yazar adı
 * tek satırlık bir koda paketlenir: "SFL1." + base64url(UTF-8 JSON). Kod hem panelde
 * ("Kod yapıştır") hem suflo.app/stil#KOD sayfasında çözülür; bu yüzden aynı dosyanın
 * bayt bayt kopyası docs/js/style-share.js'tedir (test denetler).
 *
 * Güvenlik: kod yabancı kaynaktan gelir ve değerleri ASS Style satırına yazılır.
 *   - renkler yalnız #rrggbb, yazı tipi yalnız paketle gelen 6 OFL fontundan biri
 *   - konum ∈ {1, 2, 5, 8}; punto 36-180, kontur 0-16 aralığına kırpılır
 *   - bilinmeyen anahtarlar ve __proto__ atılır; fontFile ASLA girdiden alınmaz,
 *     yazı tipinden yerelde türetilir (yol kaçışı olmasın)
 *   - yerel yollar (logo vb.) koda hiç yazılmaz
 *   - decode() asla fırlatmaz: { ok, recipe, warnings, error }
 *
 * Saf ve durumsuz (ES5, UMD): Node 12'de btoa yok, base64 burada elle yazıldı.
 * style-engine.js'ten ÖNCE yüklenir; captions.js FONTLAR ve genişlik katsayıları buradan okur.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloStyleShare = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var ONEK = "SFL1.";
  var SURUM = 1;
  var EN_UZUN_GIRDI = 2048;
  var PAYLASIM_ADRESI = "https://suflo.app/stil";

  // Panelle gelen fontlar (Google Fonts, OFL; Türkçe glifler tam). genislik: ortalama
  // karakter genişliği / punto (satır sığdırma hesabı için kaba katsayı)
  var FONTS = {
    "Anton": { file: "Anton.ttf", genislik: 0.47 },
    "Archivo Black": { file: "ArchivoBlack.ttf", genislik: 0.72 },
    "Bebas Neue": { file: "BebasNeue.ttf", genislik: 0.43 },
    "Bungee": { file: "Bungee.ttf", genislik: 0.8 },
    "Lora": { file: "Lora.ttf", genislik: 0.55 },
    // statik Bold: libass değişken fontu seçemiyor, DejaVu'ya düşüyordu
    "Montserrat": { file: "Montserrat-Bold.ttf", genislik: 0.64 }
  };

  var KONUMLAR = [1, 2, 5, 8];
  var YOGUNLUK = ["soft", "balanced", "hard"];
  var KASE = ["normal", "upper", "lower"];
  var MAXLEN = /^(w[2-5]|c(32|42|60)|k1|kc)$/;
  var YAZAR = /^[A-Za-z0-9_.ÇĞİÖŞÜçğıöşü-]{1,32}$/;
  var STIL_KIMLIGI = /^[a-z0-9_-]{1,24}$/;
  var RENK = /^#[0-9a-f]{6}$/i;
  var RENK_ANAHTARLARI = ["renk", "konturRenk", "vurguRenk"];

  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function hasFont(name) { return typeof name === "string" && own(FONTS, name); }
  function fontFile(name) { return hasFont(name) ? FONTS[name].file : null; }
  function fontNames() { return Object.keys(FONTS); }
  function fontFiles() {
    var o = {};
    fontNames().forEach(function (n) { o[n] = FONTS[n].file; });
    return o;
  }
  function widths() {
    var o = {};
    fontNames().forEach(function (n) { o[n] = FONTS[n].genislik; });
    return o;
  }
  function isColor(v) { return typeof v === "string" && RENK.test(v); }

  function sayi(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
    return null;
  }
  function kirp(n, a, b) { return Math.max(a, Math.min(b, Math.round(n))); }

  /*
   * İnce ayar değerlerini doğrula. Geçersiz değer atılır (stilin kendi değeri kalır),
   * aralık dışı sayı kırpılır. uyarilar (dizi) verilirse atılan / kırpılan alanlar yazılır.
   * Dönen nesnede yalnız: font + fontFile, renk, konturRenk, vurguRenk, boyut, kontur, konum, guvenli
   */
  function sanitizeOverrides(o, uyarilar) {
    var out = {};
    function uyar(m) { if (uyarilar && uyarilar.push) uyarilar.push(m); }
    if (o === null || typeof o !== "object" || o instanceof Array) return out;
    if (own(o, "font")) {
      if (hasFont(o.font)) { out.font = o.font; out.fontFile = FONTS[o.font].file; }
      else uyar("font");
    }
    RENK_ANAHTARLARI.forEach(function (k) {
      if (!own(o, k)) return;
      if (isColor(o[k])) out[k] = o[k].toLowerCase();
      else uyar(k);
    });
    if (own(o, "boyut")) {
      var b = sayi(o.boyut);
      if (b === null) uyar("boyut");
      else { out.boyut = kirp(b, 36, 180); if (out.boyut !== b) uyar("boyut"); }
    }
    if (own(o, "kontur")) {
      var k = sayi(o.kontur);
      if (k === null) uyar("kontur");
      else { out.kontur = kirp(k, 0, 16); if (out.kontur !== k) uyar("kontur"); }
    }
    if (own(o, "konum")) {
      var p = sayi(o.konum);
      if (p !== null && KONUMLAR.indexOf(p) !== -1) out.konum = p;
      else uyar("konum");
    }
    if (own(o, "guvenli")) {
      if (typeof o.guvenli === "boolean") out.guvenli = o.guvenli;
      else uyar("guvenli");
    }
    Object.keys(o).forEach(function (key) {
      // fontFile de uyarı sayılır: girdiden ASLA alınmaz, yazı tipinden türetilir
      if (["font", "renk", "konturRenk", "vurguRenk", "boyut", "kontur", "konum", "guvenli"].indexOf(key) === -1) uyar(key);
    });
    return out;
  }

  /* ---------------- base64url (UTF-8) ---------------- */
  var ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  function b64urlEncode(str) {
    var bin = unescape(encodeURIComponent(String(str)));
    var out = "", i;
    for (i = 0; i + 2 < bin.length; i += 3) {
      var n = (bin.charCodeAt(i) << 16) | (bin.charCodeAt(i + 1) << 8) | bin.charCodeAt(i + 2);
      out += ABC.charAt((n >> 18) & 63) + ABC.charAt((n >> 12) & 63) + ABC.charAt((n >> 6) & 63) + ABC.charAt(n & 63);
    }
    var kalan = bin.length - i;
    if (kalan === 1) {
      var a = bin.charCodeAt(i) << 16;
      out += ABC.charAt((a >> 18) & 63) + ABC.charAt((a >> 12) & 63);
    } else if (kalan === 2) {
      var c = (bin.charCodeAt(i) << 16) | (bin.charCodeAt(i + 1) << 8);
      out += ABC.charAt((c >> 18) & 63) + ABC.charAt((c >> 12) & 63) + ABC.charAt((c >> 6) & 63);
    }
    return out;
  }

  // Geçersizse null (fırlatmaz)
  function b64urlDecode(s) {
    if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
    var bin = "", bits = 0, deger = 0;
    for (var i = 0; i < s.length; i++) {
      deger = (deger << 6) | ABC.indexOf(s.charAt(i));
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bin += String.fromCharCode((deger >> bits) & 255);
        deger &= (1 << bits) - 1;
      }
    }
    try { return decodeURIComponent(escape(bin)); } catch (e) { return null; }
  }

  function validAuthor(a) { return typeof a === "string" && YAZAR.test(a); }

  // Paylaşılacak tarifin temiz hâli (encode ile decode aynı kuralı kullanır)
  function metinTemiz(t, uyar) {
    var out = {};
    if (t === null || typeof t !== "object" || t instanceof Array) return out;
    if (own(t, "maxlen")) { if (typeof t.maxlen === "string" && MAXLEN.test(t.maxlen)) out.maxlen = t.maxlen; else uyar("text.maxlen"); }
    if (own(t, "kase")) { if (KASE.indexOf(t.kase) !== -1) out.kase = t.kase; else uyar("text.kase"); }
    if (own(t, "punct")) { if (typeof t.punct === "boolean") out.punct = t.punct; else uyar("text.punct"); }
    return out;
  }

  /*
   * r: { styleId, intensity?, overrides?, text?: { maxlen, kase, punct }, author? }
   * Döner: "SFL1.…". Geçersiz stil kimliği hata fırlatır (arayüz yalnız motor stiliyle çağırır).
   * Geçersiz yazar adı koda yazılmaz; fontFile ve tanınmayan alanlar (logo yolu vb.) hiç yazılmaz.
   */
  function encode(r) {
    r = r || {};
    if (typeof r.styleId !== "string" || !STIL_KIMLIGI.test(r.styleId)) throw new Error("Stil kimliği geçersiz.");
    var yok = function () {};
    var ov = sanitizeOverrides(r.overrides || {});
    delete ov.fontFile;
    var obj = { v: SURUM, styleId: r.styleId };
    if (YOGUNLUK.indexOf(r.intensity) !== -1) obj.intensity = r.intensity;
    if (Object.keys(ov).length) obj.overrides = ov;
    var t = metinTemiz(r.text, yok);
    if (Object.keys(t).length) obj.text = t;
    if (validAuthor(r.author)) obj.author = r.author;
    return ONEK + b64urlEncode(JSON.stringify(obj));
  }

  function izinli(liste, id) {
    if (!liste) return STIL_KIMLIGI.test(id);
    if (typeof liste === "function") return !!liste(id);
    if (liste instanceof Array) return liste.indexOf(id) !== -1;
    return own(liste, id);
  }

  function hata(mesaj) { return { ok: false, recipe: null, warnings: [], error: mesaj }; }

  /*
   * Kodu çöz. Girdi tam paylaşım bağlantısı da olabilir (…/stil#SFL1.…); boşluk ve satır
   * sonları (yapıştırırken bölünen kod) yok sayılır. izinliStiller: dizi, { id: … } ya da işlev.
   * Döner: { ok, recipe: { styleId, intensity?, overrides, text, author? }, warnings: [alan], error? }
   */
  function decode(code, izinliStiller) {
    try {
      if (typeof code !== "string") return hata("Stil kodu boş.");
      if (code.length > EN_UZUN_GIRDI) return hata("Stil kodu çok uzun.");
      var s = code.replace(/\s+/g, "");
      var kare = s.lastIndexOf("#");
      if (kare !== -1) s = s.slice(kare + 1);
      if (!s) return hata("Stil kodu boş.");
      if (s.indexOf(ONEK) !== 0) return hata("Bu bir Suflo stil kodu değil (SFL1. ile başlamalı).");
      var json = b64urlDecode(s.slice(ONEK.length));
      if (json === null) return hata("Stil kodu bozuk; eksik kopyalanmış olabilir.");
      var obj;
      try { obj = JSON.parse(json); } catch (eJ) { return hata("Stil kodu bozuk; eksik kopyalanmış olabilir."); }
      if (obj === null || typeof obj !== "object" || obj instanceof Array) return hata("Stil kodu bozuk; eksik kopyalanmış olabilir.");
      if (own(obj, "v") && typeof obj.v === "number" && obj.v > SURUM) return hata("Bu kod daha yeni bir Suflo sürümüyle yapılmış; Suflo'yu güncelle.");
      var id = own(obj, "styleId") ? obj.styleId : null;
      if (typeof id !== "string" || !STIL_KIMLIGI.test(id) || !izinli(izinliStiller, id)) {
        return hata("Bu stil bu Suflo sürümünde yok" + (typeof id === "string" && STIL_KIMLIGI.test(id) ? ": " + id : "") + ".");
      }
      var author = own(obj, "author") ? obj.author : undefined;
      if (author !== undefined && author !== null && author !== "" && !validAuthor(author)) return hata("Stil kodundaki yazar adı geçersiz.");
      var uyarilar = [];
      var uyar = function (m) { uyarilar.push(m); };
      var recipe = { styleId: id, overrides: {}, text: {} };
      if (own(obj, "intensity")) {
        if (YOGUNLUK.indexOf(obj.intensity) !== -1) recipe.intensity = obj.intensity;
        else uyar("intensity");
      }
      recipe.overrides = sanitizeOverrides(own(obj, "overrides") ? obj.overrides : {}, uyarilar);
      recipe.text = metinTemiz(own(obj, "text") ? obj.text : {}, uyar);
      if (validAuthor(author)) recipe.author = author;
      Object.keys(obj).forEach(function (k) {
        if (["v", "styleId", "intensity", "overrides", "text", "author"].indexOf(k) === -1) uyar(k);
      });
      return { ok: true, recipe: recipe, warnings: uyarilar };
    } catch (e) {
      return hata("Stil kodu okunamadı.");
    }
  }

  // Paylaşım bağlantısı: kod # ile (sunucuya gitmez, günlüğe düşmez)
  function shareUrl(code) { return PAYLASIM_ADRESI + "#" + code; }

  return {
    PREFIX: ONEK,
    VERSION: SURUM,
    MAX_INPUT: EN_UZUN_GIRDI,
    SHARE_BASE: PAYLASIM_ADRESI,
    FONTS: FONTS,
    hasFont: hasFont,
    fontFile: fontFile,
    fontNames: fontNames,
    fontFiles: fontFiles,
    widths: widths,
    isColor: isColor,
    validAuthor: validAuthor,
    sanitizeOverrides: sanitizeOverrides,
    b64urlEncode: b64urlEncode,
    b64urlDecode: b64urlDecode,
    encode: encode,
    decode: decode,
    shareUrl: shareUrl
  };
});
