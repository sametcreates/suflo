/*
 * Suflo — stil kodu (SFL1.) ek alanları: geriye uyumlu sarmalayıcı (animasyon motoru v2)
 *
 * js/style-share.js'e DOKUNULMAZ: o dosya suflo.app/stil sayfasıyla bayt bayt aynıdır (docs/js/style-share.js) ve
 * 3.3 / 3.4 panelleriyle aynı kodu çözer. Yeni alanlar kodun JSON'una üst düzey "ek" nesnesiyle girer:
 *   { v: 1, styleId: "efekt", overrides: { …, giris: <klasik>, aktif: <klasik> }, …, ek: { anim: "kelime-pop" } }
 * Önek "SFL1." ve v: 1 aynı kalır. Eski paneller ve site üst düzeydeki bilinmeyen anahtarı yalnız uyarıyla geçer
 * ("1 geçersiz ayar atlandı") ve kodu en yakın KLASİK karşılıkla (overrides'taki giris / aktif) uygular / gösterir.
 * 3.2 paneli "efekt" stilini zaten tanımaz (yeni kod da eski efekt kodları gibi "bu sürümde yok" diye reddedilir).
 *
 * encode(recipe): SS.encode ile aynı girdi; recipe.overrides.anim (katalog kimliği, yalnız "efekt") koddan ÇIKARILIR,
 *   giris / aktif katalogdaki klasik çifte çevrilir, anim "ek"e yazılır. anim yoksa çıktı SS.encode'unkiyle aynı.
 * decode(code, izinliStiller): SS.decode; ardından "ek" burada doğrulanır (beyaz liste, katalog kimliği, tür, boyut
 *   sınırı; __proto__ ve iç içe nesneler yok sayılır). Geçerli anim recipe.overrides.anim'e (yalnız "efekt") ve
 *   recipe.ek'e girer; "ek" uyarı listesinden düşer, geçersiz alt alan "ek.<alan>" uyarısı olur. Asla fırlatmaz.
 *
 * Saf, ES5, UMD (Node 12 / CEF 74). index.html'de style-share.js ve yazi-animasyonlari.js'ten SONRA yüklenir.
 */
(function (root, factory) {
  var SS = (root && root.SufloStyleShare) || null;
  if (!SS && typeof require === "function") { try { SS = require("./style-share.js"); } catch (e) { SS = null; } }
  var YA = (root && root.SufloYaziAnimasyon) || null;
  if (!YA && typeof require === "function") { try { YA = require("./yazi-animasyonlari.js"); } catch (e2) { YA = null; } }
  var api = factory(SS, YA);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloStilKodu = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (SS, YA) {
  "use strict";

  var EK = "ek";
  // "ek"in tanınan alanları (sonraki partiler buraya ekler) ve JSON boyut sınırı (kodun tamamı zaten 2048 karakter)
  var EK_ALANLARI = ["anim"];
  var EK_EN_UZUN = 512;
  var EFEKT = "efekt";

  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function animGecerli(v) { return typeof v === "string" && v.length > 0 && v.length <= 40 && !!(YA && YA.bul && YA.bul(v)); }

  function encode(r) {
    if (!SS) throw new Error("Stil kodu modülü yüklenemedi.");
    r = r || {};
    var ov = r.overrides && typeof r.overrides === "object" ? r.overrides : {};
    var anim = r.styleId === EFEKT && own(ov, "anim") && animGecerli(ov.anim) ? ov.anim : "";
    var kopya = {};
    Object.keys(r).forEach(function (k) { kopya[k] = r[k]; });
    var temiz = {};
    Object.keys(ov).forEach(function (k) { if (k !== "anim") temiz[k] = ov[k]; });
    if (anim) {
      var k = YA.klasik(anim);
      temiz.giris = k.giris;
      temiz.aktif = k.aktif;
    }
    kopya.overrides = temiz;
    var kod = SS.encode(kopya);
    if (!anim) return kod;
    var obj = JSON.parse(SS.b64urlDecode(kod.slice(SS.PREFIX.length)));
    obj[EK] = { anim: anim };
    return SS.PREFIX + SS.b64urlEncode(JSON.stringify(obj));
  }

  // decode'un girdisindeki kodun JSON nesnesi (SS.decode'un ayıklamasıyla aynı: boşluk, bağlantı #); okunamazsa null
  function hamNesne(code) {
    try {
      var s = String(code).replace(/\s+/g, "");
      var kare = s.lastIndexOf("#");
      if (kare !== -1) s = s.slice(kare + 1);
      if (s.indexOf(SS.PREFIX) !== 0) return null;
      var json = SS.b64urlDecode(s.slice(SS.PREFIX.length));
      if (json === null) return null;
      var o = JSON.parse(json);
      return o !== null && typeof o === "object" && !(o instanceof Array) ? o : null;
    } catch (e) { return null; }
  }

  // Bilinmeyen alt alanın uyarı adı (kullanıcıya gösterilir: yalnız güvenli kısa ad)
  function alanAdi(k) { return /^[A-Za-z0-9_]{1,24}$/.test(k) ? EK + "." + k : EK; }

  function decode(code, izinliStiller) {
    if (!SS) return { ok: false, recipe: null, warnings: [], error: "Stil kodu modülü yüklenemedi." };
    var d = SS.decode(code, izinliStiller);
    if (!d || !d.ok) return d;
    try {
      var obj = hamNesne(code);
      if (!obj || !own(obj, EK)) return d;
      var uyarilar = d.warnings.filter(function (w) { return w !== EK; });
      var ek = obj[EK], temiz = {};
      var boyut = -1;
      try { boyut = JSON.stringify(ek).length; } catch (eB) { boyut = -1; }
      if (ek === null || typeof ek !== "object" || ek instanceof Array || boyut < 0 || boyut > EK_EN_UZUN) {
        uyarilar.push(EK);
      } else {
        Object.keys(ek).forEach(function (k) {
          if (EK_ALANLARI.indexOf(k) === -1) { uyarilar.push(alanAdi(k)); return; }
          if (k === "anim") {
            if (animGecerli(ek.anim)) temiz.anim = ek.anim;
            else if (ek.anim !== "") uyarilar.push(alanAdi(k));
          }
        });
      }
      var recipe = d.recipe;
      if (Object.keys(temiz).length) recipe.ek = temiz;
      // Yazı animasyonu yalnız Altyazı Efektleri'nde çizilir (eski stil kimliğiyle gelirse yok sayılır)
      if (temiz.anim) {
        if (recipe.styleId === EFEKT) recipe.overrides.anim = temiz.anim;
        else { delete recipe.ek; uyarilar.push(alanAdi("anim")); }
      }
      return { ok: true, recipe: recipe, warnings: uyarilar };
    } catch (e) {
      return d;
    }
  }

  return {
    EK_ALANLARI: EK_ALANLARI.slice(),
    EK_EN_UZUN: EK_EN_UZUN,
    encode: encode,
    decode: decode
  };
});
