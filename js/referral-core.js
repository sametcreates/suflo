/*
 * Suflo — Davet et, kazan: saf mantık (SufloReferral)
 *
 * Davet kodu biçimi, paylaşım bağlantıları ve metinleri, ödeme bağlantısına
 * indirim kodu ekleme, kademe hesabı, davet şeridinin ne zaman çıkacağı,
 * "Made with Suflo" kredi satırı ve Story kartının ASS'i. DOM'a, ağa ve
 * Premiere'e dokunmaz; panel (js/davet.js) ve testler kullanır.
 *
 * Kod biçimi: SFL + 6 karakter [A-Z2-7]. Lemon Squeezy indirim kodları yalnız
 * büyük harf ve rakam kabul eder, tire yok. Ücretsiz kullanıcının kodu yoktur;
 * ona rastgele bir davet kimliği (10 karakter [a-z2-7]) üretilir. Kimlik makine
 * kimliğinden türetilmez: o, Lemon Squeezy lisans koltuğunun adında geçer.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloReferral = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var SITE = "https://suflo.app/";
  var KOD_RE = /^SFL[A-Z2-7]{6}$/;
  var REF_RE = /^[a-z2-7]{10}$/;
  var REF_ABC = "abcdefghijklmnopqrstuvwxyz234567";   // 32 karakter: bayt % 32 esit dagilir
  var TIERS = [1, 3, 10];
  var VARSAYILAN_YUZDE = 15;
  var BEKLEME_MS = 30 * 24 * 3600 * 1000;   // iki davet istemi arasi en az 30 gun
  var SAAT_PAYI_MS = 10 * 60 * 1000;        // saat kaymasi payi
  var BESINCI_UYGULAMA = 5;                 // 3. uygulama GitHub yildizi isteminde kalir

  function isValidCode(code) {
    return typeof code === "string" && KOD_RE.test(code);
  }

  // Kullanicinin yazdigi/yapistirdigi kod: bosluk ve tireleri at, buyut; gecersizse ""
  function kodTemizle(s) {
    var t = String(s == null ? "" : s).replace(/[\s\-–—]+/g, "").toUpperCase();
    return isValidCode(t) ? t : "";
  }

  function isValidRefId(id) {
    return typeof id === "string" && REF_RE.test(id);
  }

  function shareUrl(code) {
    return isValidCode(code) ? SITE + "?d=" + code : SITE;
  }

  function freeRefUrl(refId) {
    return isValidRefId(refId) ? SITE + "?ref=" + refId : SITE;
  }

  /*
   * 10 karakterlik davet kimligi. bytes: en az 10 rastgele bayt (crypto.randomBytes /
   * getRandomValues ciktisi); verilmezse ortamin rastgele kaynagi kullanilir.
   */
  function rastgeleBaytlar(n) {
    var out = [], i;
    try {
      if (typeof require === "function") {
        var b = require("crypto").randomBytes(n);
        for (i = 0; i < n; i++) out.push(b[i]);
        return out;
      }
    } catch (e) {}
    try {
      var c = typeof window !== "undefined" && (window.crypto || window.msCrypto);
      if (c && c.getRandomValues) {
        var u = new Uint8Array(n);
        c.getRandomValues(u);
        for (i = 0; i < n; i++) out.push(u[i]);
        return out;
      }
    } catch (e2) {}
    for (i = 0; i < n; i++) out.push(Math.floor(Math.random() * 256));
    return out;
  }
  function newRefId(bytes) {
    var b = bytes && bytes.length >= 10 ? bytes : rastgeleBaytlar(10);
    var s = "";
    for (var i = 0; i < 10; i++) s += REF_ABC.charAt((Number(b[i]) & 255) % 32);
    return s;
  }

  /* ---------------- Paylasim metinleri ---------------- */

  var METIN = {
    tr: {
      kodlu: "Premiere'de altyazılarımı Suflo ile yapıyorum: ücretsiz, Türkçe biliyor ve bilgisayarında çalışıyor. Suflo Pro'yu almak istersen davet kodumla %{y} indirim: {kod}",
      kodsuz: "Premiere'de altyazılarımı Suflo ile yapıyorum: ücretsiz, Türkçe biliyor ve bilgisayarında çalışıyor.",
      xKodlu: "Premiere'de altyazılarımı Suflo ile yapıyorum. Ücretsiz; Pro'da davet kodumla %{y} indirim: {kod}",
      xKodsuz: "Premiere'de altyazılarımı Suflo ile yapıyorum: ücretsiz, Türkçe biliyor, bilgisayarında çalışıyor.",
      igKodlu: "Altyazılarımı Suflo ile yapıyorum 🎬 Premiere paneli, ücretsiz. Pro'da %{y} indirim için davet kodum: {kod}",
      igKodsuz: "Altyazılarımı Suflo ile yapıyorum 🎬 Premiere paneli, ücretsiz.",
      kredi: "Altyazılar: Suflo · suflo.app"
    },
    en: {
      kodlu: "I make my Premiere captions with Suflo: it's free and runs on your own computer. Want Suflo Pro? My invite code gets you {y}% off: {kod}",
      kodsuz: "I make my Premiere captions with Suflo: it's free and runs on your own computer.",
      xKodlu: "I make my Premiere captions with Suflo. It's free; my invite code gets you {y}% off Pro: {kod}",
      xKodsuz: "I make my Premiere captions with Suflo: free, and it runs on your own computer.",
      igKodlu: "I make my captions with Suflo 🎬 A free Premiere panel. My invite code for {y}% off Pro: {kod}",
      igKodsuz: "I make my captions with Suflo 🎬 A free Premiere panel.",
      kredi: "Captions: Suflo · suflo.app"
    }
  };
  var KANALLAR = { whatsapp: 1, x: 1, instagram: 1, plain: 1 };
  var X_SINIR = 280;

  function dilSec(lang) { return lang === "en" ? "en" : "tr"; }

  function doldur(t, o) {
    return t.replace(/\{y\}/g, String(o.yuzde)).replace(/\{kod\}/g, o.kod);
  }

  /*
   * lang: "tr" | "en" · channel: "whatsapp" | "x" | "instagram" | "plain"
   * o: { code, link, percent }  (code yoksa / gecersizse kodsuz metin)
   */
  function shareText(lang, channel, o) {
    o = o || {};
    var M = METIN[dilSec(lang)];
    var ch = KANALLAR[channel] ? channel : "plain";
    var kod = isValidCode(o.code) ? o.code : "";
    var yuzde = Math.round(Number(o.percent)) > 0 && Math.round(Number(o.percent)) < 100 ? Math.round(Number(o.percent)) : VARSAYILAN_YUZDE;
    var link = String(o.link || (kod ? shareUrl(kod) : SITE)).replace(/\s+/g, "");
    var d = { kod: kod, yuzde: yuzde };
    var govde;
    if (ch === "x") govde = doldur(kod ? M.xKodlu : M.xKodsuz, d);
    else if (ch === "instagram") govde = doldur(kod ? M.igKodlu : M.igKodsuz, d);
    else govde = doldur(kod ? M.kodlu : M.kodsuz, d);
    if (ch === "x") {
      // X sinirina sigmazsa govde kisalir, kod ve bağlanti asla kesilmez
      var yer = X_SINIR - link.length - 1;
      if (govde.length > yer) govde = yer > 1 ? govde.slice(0, yer - 1).replace(/\s+\S*$/, "") + "…" : "";
      return (govde ? govde + " " : "") + link.slice(0, X_SINIR);
    }
    return govde + "\n" + link;
  }

  function whatsappUrl(text) { return "https://wa.me/?text=" + encodeURIComponent(String(text == null ? "" : text)); }
  function tweetUrl(text) { return "https://x.com/intent/tweet?text=" + encodeURIComponent(String(text == null ? "" : text)); }

  // Kanalin paylasim adresi; Instagram'in web paylasim adresi yok: null (yalniz kopyala)
  function channelUrl(channel, text) {
    if (channel === "whatsapp") return whatsappUrl(text);
    if (channel === "x") return tweetUrl(text);
    return null;
  }

  /* ---------------- Odeme baglantisi ---------------- */

  var INDIRIM_PARAM = "checkout%5Bdiscount_code%5D";
  var REF_PARAM = "checkout%5Bcustom%5D%5Bref%5D";

  function paramKoy(url, ad, deger) {
    var s = String(url || "");
    var hash = "";
    var h = s.indexOf("#");
    if (h !== -1) { hash = s.slice(h); s = s.slice(0, h); }
    var q = s.indexOf("?");
    var taban = q === -1 ? s : s.slice(0, q);
    var parcalar = q === -1 ? [] : s.slice(q + 1).split("&").filter(function (p) {
      if (!p) return false;
      var k = p.split("=")[0];
      var kc;
      try { kc = decodeURIComponent(k); } catch (e) { kc = k; }
      var ac;
      try { ac = decodeURIComponent(ad); } catch (e2) { ac = ad; }
      return kc !== ac;   // ayni parametre (kodlu ya da kodsuz yazilmis) yenisiyle degisir
    });
    parcalar.push(ad + "=" + encodeURIComponent(deger));
    return taban + "?" + parcalar.join("&") + hash;
  }

  // Gecerli kod yoksa adres aynen doner; checkout[custom] alanlari korunur
  function withDiscount(checkoutUrl, code) {
    if (!isValidCode(code)) return checkoutUrl;
    return paramKoy(checkoutUrl, INDIRIM_PARAM, code);
  }

  function withRef(checkoutUrl, refId) {
    if (!isValidRefId(refId)) return checkoutUrl;
    return paramKoy(checkoutUrl, REF_PARAM, refId);
  }

  /* ---------------- Kademeler ---------------- */

  function sayiyaIndir(n) { n = Math.floor(Number(n)); return isFinite(n) && n > 0 ? n : 0; }

  function tierFor(count) {
    var n = sayiyaIndir(count), t = 0;
    for (var i = 0; i < TIERS.length; i++) if (n >= TIERS[i]) t = TIERS[i];
    return t;
  }

  function nextTier(count) {
    var n = sayiyaIndir(count);
    for (var i = 0; i < TIERS.length; i++) if (n < TIERS[i]) return TIERS[i];
    return null;
  }

  var ODUL = {
    tr: {
      1: "Davetçi paketi: MOGRT altyazı şablonları ve yaklaşık 30 SFX",
      3: "Kurucu paketi ve beta erişimi",
      10: "Seninle iletişime geçeceğiz"
    },
    en: {
      1: "Inviter pack: MOGRT caption templates and about 30 SFX",
      3: "Founder pack and beta access",
      10: "We'll get in touch with you"
    }
  };

  /*
   * Ilerleme cubugu: { sayi, kademe, sonraki, oran (0-1), metin "2/3 davet", odul }
   * sonraki null ise (10+) cubuk dolu, odul en ust kademeninki.
   */
  function ilerleme(count, lang) {
    var n = sayiyaIndir(count);
    var L = dilSec(lang);
    var sonraki = nextTier(n), kademe = tierFor(n);
    var hedef = sonraki || TIERS[TIERS.length - 1];
    return {
      sayi: n, kademe: kademe, sonraki: sonraki,
      oran: sonraki ? Math.max(0, Math.min(1, n / sonraki)) : 1,
      metin: (sonraki ? n + "/" + sonraki : String(n)) + (L === "en" ? " invites" : " davet"),
      odul: ODUL[L][hedef]
    };
  }

  /* ---------------- Davet istemi (şerit) ---------------- */

  var OLAYLAR = { cut: 1, shorts: 1, apply: 1 };
  function olayTuru(event) { return typeof event === "string" ? event : (event && event.type) || ""; }

  /*
   * Karar ve nedeni: { goster, neden }
   *   neden: "ok" | "olay" (izlenmeyen olay / 5'ten az uygulama) | "never" ("bir daha gösterme")
   *          | "seen" (bu olayda zaten soruldu) | "busy" | "star" (yildiz seridi acik) | "cooldown"
   * state: { lastShown, never, seen: { cut, shorts, apply } }
   * ctx: { busy, starVisible }
   */
  function promptKarari(state, now, event, ctx) {
    state = state || {}; ctx = ctx || {};
    var tur = olayTuru(event);
    if (!OLAYLAR[tur]) return { goster: false, neden: "olay" };
    if (tur === "apply" && !(Number(event && event.count) >= BESINCI_UYGULAMA)) return { goster: false, neden: "olay" };
    if (state.never === true) return { goster: false, neden: "never" };
    if (state.seen && state.seen[tur]) return { goster: false, neden: "seen" };
    if (ctx.busy) return { goster: false, neden: "busy" };
    if (ctx.starVisible) return { goster: false, neden: "star" };
    var simdi = Number(now) || 0, son = Number(state.lastShown) || 0;
    // gelecek tarihli kayit (saat kaymasi payini asan) yok sayilir: istemi sonsuza dek susturmasin
    if (son > 0 && son <= simdi + SAAT_PAYI_MS && simdi - son < BEKLEME_MS) return { goster: false, neden: "cooldown" };
    return { goster: true, neden: "ok" };
  }

  function shouldPrompt(state, now, event, ctx) { return promptKarari(state, now, event, ctx).goster; }

  /*
   * Olayi isle: karar + yeni durum (girdi degismez).
   * Gosterilen ya da bekleme suresine takilan olay "goruldu" sayilir (ilk olay tek seferlik);
   * mesgul / yildiz seridi yuzunden cikamayan olay sonraki tekrarinda yine denenir.
   */
  function olayIsle(state, now, event, ctx) {
    var k = promptKarari(state, now, event, ctx);
    var yeni = durumKopya(state);
    var tur = olayTuru(event);
    if (k.goster || k.neden === "cooldown") yeni.seen[tur] = true;
    if (k.goster) yeni.lastShown = Number(now) || 0;
    return { goster: k.goster, neden: k.neden, state: yeni };
  }

  function durumKopya(state) {
    state = state || {};
    var seen = {};
    var eski = state.seen && typeof state.seen === "object" ? state.seen : {};
    for (var k in eski) if (Object.prototype.hasOwnProperty.call(eski, k) && OLAYLAR[k]) seen[k] = eski[k] === true;
    var out = { lastShown: Number(state.lastShown) || 0, never: state.never === true, seen: seen };
    return out;
  }

  /* ---------------- Kredi satiri ---------------- */

  function creditLine(lang) {
    return METIN[lang === "tr" || lang === "az" ? "tr" : "en"].kredi;
  }

  /* ---------------- Story karti (1080x1920 PNG icin ASS) ---------------- */

  function assEsc(v) {
    return String(v == null ? "" : v).replace(/[\r\n]+/g, " ").replace(/\\/g, "⧵").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  }
  function assRenk(hex, alfa) {
    var h = String(hex || "#ffffff").replace("#", "");
    var a = ("0" + Math.max(0, Math.min(255, Number(alfa) || 0)).toString(16)).slice(-2);
    return ("&H" + a + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2)).toUpperCase();
  }
  function kutu(w, h, r) {
    w = Math.round(w); h = Math.round(h); r = Math.max(2, Math.round(r));
    return "m " + r + " 0 l " + (w - r) + " 0 b " + w + " 0 " + w + " 0 " + w + " " + r +
      " l " + w + " " + (h - r) + " b " + w + " " + h + " " + w + " " + h + " " + (w - r) + " " + h +
      " l " + r + " " + h + " b 0 " + h + " 0 " + h + " 0 " + (h - r) + " l 0 " + r + " b 0 0 0 0 " + r + " 0";
  }

  var STORY_FONTLAR = ["Montserrat-Bold.ttf", "ArchivoBlack.ttf"];
  var STORY = {
    tr: { ust: "SUFLO · PREMIERE PANELİ", b1: "Premiere'de altyazı", b2: "2 dakikada", kodUst: "DAVET KODUM",
      alt: "Suflo Pro'da %{y} indirim", alt2: "Ücretsiz indir · Windows ve macOS", kodsuz: "Ücretsiz ve açık kaynak" },
    en: { ust: "SUFLO · PREMIERE PANEL", b1: "Premiere captions", b2: "in 2 minutes", kodUst: "MY INVITE CODE",
      alt: "{y}% off Suflo Pro", alt2: "Free download · Windows and macOS", kodsuz: "Free and open source" }
  };

  /*
   * Story karti: koyu zemin (ffmpeg lavfi color=0x101522) uzerine ust etiket, baslik,
   * vurgu renkli kutuda kod, indirim satiri ve suflo.app. Instagram/TikTok arayuzunun
   * kapattigi ust %12 ve alt %18'e onemli bir sey konmaz.
   * Doner: { ass, fontFiles, w, h }
   */
  function storyAss(code, w, h, o) {
    o = o || {};
    var W = Math.max(360, Math.round(Number(w) || 1080)), H = Math.max(640, Math.round(Number(h) || 1920));
    var L = STORY[dilSec(o.lang)];
    var kod = isValidCode(code) ? code : "";
    var yuzde = Math.round(Number(o.percent)) > 0 && Math.round(Number(o.percent)) < 100 ? Math.round(Number(o.percent)) : VARSAYILAN_YUZDE;
    var olcek = W / 1080;
    function px(n) { return Math.round(n * olcek); }
    var cx = Math.round(W / 2);
    var vurgu = "#8b7cf6", beyaz = "#ffffff", soluk = "#a3a3ad";
    var ev = [];
    function d(layer, txt) { ev.push("Dialogue: " + layer + ",0:00:00.00,0:00:05.00,Kart,,0,0,0,," + txt); }
    function yazi(y, fs, renk, metin, font, ek) {
      d(1, "{\\an5\\pos(" + cx + "," + Math.round(y) + ")\\fn" + font + "\\fs" + px(fs) + "\\1c" + assRenk(renk) + "\\bord0\\shad0" + (ek || "") + "}" + assEsc(metin));
    }
    yazi(H * 0.17, 34, vurgu, L.ust, "Montserrat", "\\fsp" + px(4));
    yazi(H * 0.27, 88, beyaz, L.b1, "Montserrat");
    yazi(H * 0.27 + px(104), 88, beyaz, L.b2, "Montserrat");
    var kutuW = px(820), kutuH = px(300), kutuY = Math.round(H * 0.47);
    d(0, "{\\an7\\pos(" + Math.round(cx - kutuW / 2) + "," + Math.round(kutuY - kutuH / 2) + ")\\bord0\\shad0\\1c" + assRenk(vurgu) + "\\p1}" + kutu(kutuW, kutuH, px(36)) + "{\\p0}");
    if (kod) {
      yazi(kutuY - px(82), 34, "#f4f2ff", L.kodUst, "Montserrat", "\\fsp" + px(5));
      yazi(kutuY + px(30), 132, beyaz, kod, "Archivo Black", "\\fsp" + px(4));
      yazi(H * 0.64, 54, beyaz, L.alt.replace(/\{y\}/g, String(yuzde)), "Montserrat");
    } else {
      yazi(kutuY, 96, beyaz, "suflo.app", "Archivo Black");
      yazi(H * 0.64, 54, beyaz, L.kodsuz, "Montserrat");
    }
    yazi(H * 0.72, 66, beyaz, kod ? "suflo.app/?d=" + kod : "suflo.app", "Montserrat");
    yazi(H * 0.77, 38, soluk, L.alt2, "Montserrat");
    var ass = [
      "[Script Info]", "; Suflo davet karti", "ScriptType: v4.00+", "WrapStyle: 2",
      "ScaledBorderAndShadow: yes", "YCbCr Matrix: None", "PlayResX: " + W, "PlayResY: " + H, "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      "Style: Kart,Montserrat," + px(60) + "," + assRenk(beyaz) + "," + assRenk(beyaz) + "," + assRenk("#000000") + "," +
        assRenk("#000000", 0x80) + ",-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1",
      "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ].concat(ev).join("\n") + "\n";
    return { ass: ass, fontFiles: STORY_FONTLAR.slice(), w: W, h: H };
  }

  // Masaustune kaydedilecek dosya adi (kod gecerli degilse genel ad)
  function storyDosyaAdi(code) {
    return "Suflo-Davet-" + (isValidCode(code) ? code : "suflo") + ".png";
  }

  return {
    SITE: SITE, TIERS: TIERS, VARSAYILAN_YUZDE: VARSAYILAN_YUZDE, BEKLEME_MS: BEKLEME_MS, BESINCI_UYGULAMA: BESINCI_UYGULAMA,
    X_SINIR: X_SINIR, ODUL: ODUL, STORY_FONTLAR: STORY_FONTLAR,
    isValidCode: isValidCode, kodTemizle: kodTemizle, isValidRefId: isValidRefId,
    shareUrl: shareUrl, freeRefUrl: freeRefUrl, newRefId: newRefId,
    shareText: shareText, whatsappUrl: whatsappUrl, tweetUrl: tweetUrl, channelUrl: channelUrl,
    withDiscount: withDiscount, withRef: withRef,
    tierFor: tierFor, nextTier: nextTier, ilerleme: ilerleme,
    promptKarari: promptKarari, shouldPrompt: shouldPrompt, olayIsle: olayIsle,
    creditLine: creditLine, storyAss: storyAss, storyDosyaAdi: storyDosyaAdi
  };
});
