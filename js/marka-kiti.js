/*
 * Suflo — Marka Kiti (saf modül)
 *
 * Kullanıcının marka görünümü: yazı tipi, yazı / kontur / vurgu rengi, isteğe bağlı konum
 * (yoksa her stilin kendi konumu) ve köşe logosu. Açıkken her Suflo Stiline ve kanca
 * başlığına uygulanır. ilerleme (ilerleme çubuğu) ve cta (kapanış çağrısı) alanları
 * burada tanımlıdır; tek tık paket (yol haritası 8. adım) onları kullanır.
 *
 * Şema (normalize sonrası her alan VAR):
 *   on: bool
 *   stil:     { id: "" | motor stili, overrides: { font?, fontFile?, renk?, konturRenk?, vurguRenk?, konum? } }
 *   kanca:    { stil: "" | kanca stili, renk: "" | #rrggbb, sure: 1-5 sn }
 *   ilerleme: { konum: "ust" | "alt" | "yok", renk: #rrggbb, kalinlik: 2-24 (1080p'de px) }
 *   cta:      { acik: bool, metin: ≤40 karakter, sure: 1.5-4 sn }
 *   logo:     { path: "" | yerel .png/.jpg, kose: "su" | "ss" | "au" | "as", oran: 0.08-0.25 }
 *             kose: su = sağ üst, ss = sol üst, as = alt sağ, au = alt sol (sol üst varsayılan:
 *             deneme filigranı sağ üsttedir)
 *   kredi: false (paylaşılan kodda yazar kredisi; kit tarafında yalnız yer tutucu)
 *
 * DOM'a, Premiere'e, dosya sistemine dokunmaz (logo yolu yalnız biçimce denetlenir).
 */
(function (root, factory) {
  var SS = (root && root.SufloStyleShare) ||
    (typeof require === "function" ? require("./style-share.js") : null);
  var api = factory(SS);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloMarkaKiti = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (SS) {
  "use strict";

  var KOSELER = ["su", "ss", "as", "au"];
  var ILERLEME = ["ust", "alt", "yok"];
  var KIT_ALANLARI = ["font", "fontFile", "renk", "konturRenk", "vurguRenk", "konum"];

  // TikTok / Reels / Shorts arayüzünün kapattığı bölgeler (stil motorundaki GUVENLI_ALAN ile aynı)
  var UST_PAY = 0.07, IKON_X = 0.87, ALT_SINIR = 0.78;

  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function nesne(o) { return o !== null && typeof o === "object" && !(o instanceof Array) ? o : {}; }
  function renkMi(v) { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v); }
  function sayi(v) {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
    return null;
  }
  function kirp(v, a, b, varsayilan) {
    var n = sayi(v);
    if (n === null) return varsayilan;
    return Math.max(a, Math.min(b, n));
  }
  function izinli(liste, id) {
    if (!liste) return true;
    if (typeof liste === "function") return !!liste(id);
    if (liste instanceof Array) return liste.indexOf(id) !== -1;
    return own(liste, id);
  }

  function defaults() {
    return {
      on: false,
      stil: { id: "", overrides: {} },
      kanca: { stil: "", renk: "", sure: 3 },
      ilerleme: { konum: "yok", renk: "#8b7cf6", kalinlik: 8 },
      cta: { acik: false, metin: "", sure: 2.5 },
      logo: { path: "", kose: "ss", oran: 0.14 },
      kredi: false
    };
  }

  // Yalnız yerel .png / .jpg yolu; denetim biçimseldir (varlığa panel bakar)
  function logoYoluMu(p) {
    return typeof p === "string" && p.length > 4 && p.length <= 1024 &&
      !/[\u0000-\u001f]/.test(p) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(p) && /\.(png|jpe?g)$/i.test(p);
  }

  // Kitte tutulan stil alanları: yazı tipi, üç renk, konum (punto / kontur stilin kendi değeri kalır)
  function kitOverrides(o, uyarilar) {
    var temiz = SS ? SS.sanitizeOverrides(nesne(o), uyarilar) : {};
    var out = {};
    KIT_ALANLARI.forEach(function (k) { if (own(temiz, k)) out[k] = temiz[k]; });
    return out;
  }

  /*
   * Kayıttaki (ya da elle düzenlenmiş) kiti şemaya oturt: geçersiz alan varsayılana döner,
   * sayı aralığa kırpılır. ctx: { styleIds, hookStyles } (dizi, { id: … } ya da işlev).
   * Döner: { kit, warnings: [alan] }
   */
  function normalize(raw, ctx) {
    ctx = ctx || {};
    var r = nesne(raw), k = defaults(), uyarilar = [];
    function uyar(m) { uyarilar.push(m); }

    k.on = r.on === true;

    var st = nesne(r.stil);
    if (typeof st.id === "string" && st.id && izinli(ctx.styleIds, st.id)) k.stil.id = st.id;
    else if (st.id) uyar("stil.id");
    var ou = [];
    k.stil.overrides = kitOverrides(st.overrides, ou);
    ou.forEach(function (a) { if (a !== "fontFile" && KIT_ALANLARI.indexOf(a) !== -1) uyar("stil.overrides." + a); });

    var kc = nesne(r.kanca);
    if (typeof kc.stil === "string" && kc.stil && izinli(ctx.hookStyles, kc.stil)) k.kanca.stil = kc.stil;
    else if (kc.stil) uyar("kanca.stil");
    if (renkMi(kc.renk)) k.kanca.renk = kc.renk.toLowerCase();
    else if (kc.renk) uyar("kanca.renk");
    k.kanca.sure = kirp(kc.sure, 1, 5, 3);

    var il = nesne(r.ilerleme);
    if (ILERLEME.indexOf(il.konum) !== -1) k.ilerleme.konum = il.konum;
    else if (il.konum !== undefined) uyar("ilerleme.konum");
    if (renkMi(il.renk)) k.ilerleme.renk = il.renk.toLowerCase();
    else if (il.renk !== undefined) uyar("ilerleme.renk");
    k.ilerleme.kalinlik = Math.round(kirp(il.kalinlik, 2, 24, 8));

    var ct = nesne(r.cta);
    k.cta.acik = ct.acik === true;
    if (typeof ct.metin === "string") {
      var m = ct.metin.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
      if (m.length > 40) { m = m.slice(0, 40).trim(); uyar("cta.metin"); }
      k.cta.metin = m;
    }
    k.cta.sure = kirp(ct.sure, 1.5, 4, 2.5);

    var lg = nesne(r.logo);
    if (logoYoluMu(lg.path)) k.logo.path = lg.path;
    else if (lg.path) uyar("logo.path");
    if (KOSELER.indexOf(lg.kose) !== -1) k.logo.kose = lg.kose;
    else if (lg.kose !== undefined) uyar("logo.kose");
    k.logo.oran = Math.round(kirp(lg.oran, 0.08, 0.25, 0.14) * 1000) / 1000;

    k.kredi = r.kredi === true;
    return { kit: k, warnings: uyarilar };
  }

  function acik(kit) { return !!(kit && kit.on === true); }

  /*
   * Stil (captions.js stil() biçimi ya da motor preset.style) + kit → yeni stil.
   * Öncelik: kit > stil. Kitte konum yoksa stilin kendi konumu kalır. Kit kapalıysa kopya döner.
   * fontFile her zaman yazı tipinden türetilir.
   */
  function mergeBrandKit(stil, kit) {
    var out = {};
    var s = nesne(stil);
    Object.keys(s).forEach(function (key) { out[key] = s[key]; });
    if (!acik(kit)) return out;
    var ov = kitOverrides(kit.stil && kit.stil.overrides);
    Object.keys(ov).forEach(function (key) {
      if (key === "fontFile") return;
      out[key] = ov[key];
    });
    if (ov.font) out.fontFile = ov.fontFile;
    return out;
  }

  /*
   * Kanca başlığı ayarlarına kiti uygula: yazı tipi, yazı rengi, vurgu rengi
   * (kanca.renk varsa o, yoksa kitin vurgu rengi). Stil ve süre kanca kartındaki seçim kalır.
   */
  function mergeHook(opts, kit) {
    var out = {};
    var o = nesne(opts);
    Object.keys(o).forEach(function (key) { out[key] = o[key]; });
    if (!acik(kit)) return out;
    var ov = kitOverrides(kit.stil && kit.stil.overrides);
    if (ov.font) out.font = ov.font;
    if (ov.renk) out.renk = ov.renk;
    var vurgu = kit.kanca && renkMi(kit.kanca.renk) ? kit.kanca.renk : ov.vurguRenk;
    if (vurgu) out.vurguRenk = vurgu;
    return out;
  }

  /*
   * "Şimdiki ayarlardan doldur": paneldeki stil → kitin stil alanları.
   * konumDahil false ise konum boş kalır ("stilin kendi konumu").
   * Paketle gelmeyen (sistem) yazı tipi kite alınmaz.
   */
  function fromCurrent(stil, kit, konumDahil) {
    var s = nesne(stil);
    var temel = normalize(kit || {}).kit;
    var ov = {};
    if (SS && SS.hasFont(s.font)) { ov.font = s.font; ov.fontFile = SS.fontFile(s.font); }
    ["renk", "konturRenk", "vurguRenk"].forEach(function (key) { if (renkMi(s[key])) ov[key] = s[key].toLowerCase(); });
    if (konumDahil) {
      var p = sayi(s.konum);
      if (p === 1 || p === 2 || p === 5 || p === 8) ov.konum = p;
    }
    temel.stil.overrides = ov;
    if (typeof s.aile === "string" && s.aile && s.aile !== "custom") temel.stil.id = s.aile;
    return temel;
  }

  /*
   * Logonun karedeki yeri. w, h: kare; kose: su|ss|as|au; oran: logo genişliği / kare genişliği.
   * guvenli + dikey (h > 1.2w): üst %7'den ve sağ ikon sütunundan (x > %87) uzak; alt köşeler
   * alt arayüzün (%78'den aşağısı) üstünde biter.
   * Döner: { lw (çift sayı), x, y, alt, yExpr } — alt köşede y logonun ALT kenarıdır,
   * ffmpeg için yExpr = "<y>-overlay_h" (logo yüksekliği oranına göre kendiliğinden yerleşir).
   */
  function logoPlacement(w, h, kose, oran, guvenli) {
    w = Math.max(2, Math.round(Number(w) || 0));
    h = Math.max(2, Math.round(Number(h) || 0));
    if (KOSELER.indexOf(kose) === -1) kose = "ss";
    var o = kirp(oran, 0.08, 0.25, 0.14);
    var lw = Math.max(2, Math.round(w * o / 2) * 2);
    var pay = Math.round(Math.min(w, h) * 0.04);
    var dikey = h > w * 1.2;
    var koru = !!guvenli && dikey;
    var sag = kose === "su" || kose === "as";
    var alt = kose === "as" || kose === "au";
    var x = sag ? w - pay - lw : pay;
    if (sag && koru) x = Math.min(x, Math.floor(w * IKON_X) - pay - lw);
    x = Math.max(0, x);
    var y;
    if (alt) {
      y = h - pay;
      if (koru) y = Math.min(y, Math.floor(h * ALT_SINIR) - pay);
    } else {
      y = pay;
      if (koru) y = Math.max(y, Math.ceil(h * UST_PAY) + pay);
    }
    return { lw: lw, x: x, y: y, alt: alt, yExpr: alt ? y + "-overlay_h" : String(y) };
  }

  return {
    CORNERS: KOSELER.slice(),
    defaults: defaults,
    normalize: normalize,
    isOn: acik,
    isLogoPath: logoYoluMu,
    mergeBrandKit: mergeBrandKit,
    mergeHook: mergeHook,
    fromCurrent: fromCurrent,
    logoPlacement: logoPlacement
  };
});
