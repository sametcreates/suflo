/*
 * Suflo — Shorts paketi ekleri (saf modül): ilerleme çubuğu, kapanış çağrısı (CTA) ve
 * ikisinin (istenirse kanca başlığıyla) tek ASS'te birleşmesi. Paket her Short için bu
 * ASS'i TEK ffmpeg geçişinde (Marka Kiti logosuyla birlikte) şeffaf "Çerçeve" katmanına çevirir.
 *
 * İlerleme çubuğu: soluk tam boy zemin + üstünde \clip'i 0'dan tam genişliğe \t ile açılan
 * dolgu. libass \clip'i \t içinde doğrusal canlandırır (ffmpeg 6.1 + libass: 10 sn'lik,
 * 1080 genişlikte çubukta 0,5 / 5 / 9,9 sn'de 56 / 540 / 1071 px).
 * Dikey (9:16) kadrajda çubuk platform arayüzünün dışında kalır: üstte durum çubuğunun (%7)
 * altında, altta açıklama alanının (%78) üstünde ve sağ ikon sütununun (%87) solunda biter.
 *
 * DOM'a, ağa, Premiere'e dokunmaz; node'da doğrudan test edilir.
 */
(function (root, factory) {
  function yukle(ad, dosya) {
    if (root && root[ad]) return root[ad];
    if (typeof require === "function") { try { return require(dosya); } catch (e) {} }
    return null;
  }
  var api = factory(yukle("SufloHookTitle", "./hook-title.js"), yukle("SufloCaptionText", "./caption-text.js"));
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloShortsEkler = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (HT, CT) {
  "use strict";

  var ILERLEME_STILLERI = ["ince", "kalin", "kapsul"];
  // Platform arayüzü (stil motorundaki GUVENLI_ALAN ile aynı oranlar)
  var UST_PAY = 0.07, IKON_X = 0.87, ALT_SINIR = 0.78;
  var CTA_EN_KISA_KLIP = 8;      // bu süreden kısa Short'ta CTA yok (kanca ile sıkışır)
  var CTA_KANCA_ARASI = 0.5;     // kanca bittikten en az bu kadar sonra başlar

  // Hazır CTA metinleri: videonun dilinde yazılır (Türkçe/Azerice → Türkçe, gerisi İngilizce)
  var CTA_HAZIR = {
    tr: { takip: "Takip et", part2: "Part 2 profilde", link: "Link açıklamada" },
    en: { takip: "Follow for more", part2: "Part 2 on my profile", link: "Link in description" }
  };

  function renkMi(v) { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v); }
  function sayi(v, varsayilan) { var n = Number(v); return isFinite(n) ? n : varsayilan; }

  // #rrggbb → &HBBGGRR& (ASS \1c)
  function assRenk(hex) {
    var h = renkMi(hex) ? hex.slice(1) : "ffffff";
    return ("&H" + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2) + "&").toUpperCase();
  }
  function assAlfa(a) {
    a = Math.max(0, Math.min(255, Math.round(Number(a) || 0)));
    return "&H" + ("0" + a.toString(16)).slice(-2).toUpperCase() + "&";
  }

  function tcode(sec) {
    var cs = Math.max(0, Math.round(Number(sec || 0) * 100));
    var h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return h + ":" + p(m) + ":" + p(s) + "." + p(c);
  }
  function saniye(tc) {
    var m = /^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(String(tc || "").trim());
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  }

  function dikeyMi(W, H) { return H > W * 1.2; }

  /*
   * Çubuğun yeri ve boyu. o: { W, H, kalinlik (1080p'de px, 2-24; Marka Kiti ilerleme.kalinlik),
   * konum: "ust" | "alt", stil: "ince" | "kalin" | "kapsul" }
   * Döner: { x, y, w, h, r (köşe yarıçapı; kapsülde h/2), konum, stil }
   */
  function progressGeometry(o) {
    o = o || {};
    var W = Math.max(64, Math.round(sayi(o.W, 1080))), H = Math.max(64, Math.round(sayi(o.H, 1920)));
    var stil = ILERLEME_STILLERI.indexOf(o.stil) !== -1 ? o.stil : "ince";
    var konum = o.konum === "alt" ? "alt" : "ust";
    var kisa = Math.min(W, H);
    var taban = Math.max(2, Math.min(24, sayi(o.kalinlik, 8))) * kisa / 1080;
    var kat = stil === "kalin" ? 1.6 : (stil === "kapsul" ? 1.4 : 0.75);
    var h = Math.max(2, Math.round(taban * kat));
    var pay = Math.round(kisa * 0.012);
    var kenar = stil === "kapsul" ? Math.round(W * 0.05) : 0;
    var x = kenar, sag = W - kenar, y;
    if (dikeyMi(W, H)) {
      if (konum === "ust") y = Math.ceil(H * UST_PAY) + pay;
      else {
        y = Math.floor(H * ALT_SINIR) - pay - h;
        sag = Math.min(sag, Math.floor(W * IKON_X) - pay);
      }
    } else {
      var ic = stil === "kapsul" ? pay : 0;
      y = konum === "ust" ? ic : H - ic - h;
    }
    return { x: x, y: y, w: Math.max(2, sag - x), h: h, r: stil === "kapsul" ? h / 2 : 0, konum: konum, stil: stil };
  }

  function kutuYolu(w, h, r) {
    w = Math.round(w); h = Math.round(h);
    if (!(r > 1)) return "m 0 0 l " + w + " 0 l " + w + " " + h + " l 0 " + h;
    r = Math.min(Math.round(r), Math.floor(h / 2), Math.floor(w / 2));
    return "m " + r + " 0 l " + (w - r) + " 0 b " + w + " 0 " + w + " 0 " + w + " " + r +
      " l " + w + " " + (h - r) + " b " + w + " " + h + " " + w + " " + h + " " + (w - r) + " " + h +
      " l " + r + " " + h + " b 0 " + h + " 0 " + h + " 0 " + (h - r) + " l 0 " + r + " b 0 0 0 0 " + r + " 0";
  }

  /*
   * İlerleme çubuğu olayları. o: progressGeometry girdisi + { dur (sn), renk (#rrggbb) }
   * Döner: { style: "Style: Ilerleme,…", events: ["Dialogue: …"], geo }
   */
  function progressBarEvents(o) {
    o = o || {};
    var geo = progressGeometry(o);
    var dur = Math.max(0.1, sayi(o.dur, 10));
    var ms = Math.round(dur * 1000);
    var renk = renkMi(o.renk) ? o.renk : "#8b7cf6";
    var yol = kutuYolu(geo.w, geo.h, geo.r);
    var H = Math.max(64, Math.round(sayi(o.H, 1920)));
    var bas = "{\\an7\\pos(" + geo.x + "," + geo.y + ")\\bord0\\shad0\\blur0";
    var zemin = "Dialogue: 0," + tcode(0) + "," + tcode(dur) + ",Ilerleme,,0,0,0,," + bas +
      "\\1c&H000000&\\1a" + assAlfa(0x70) + "\\p1}" + yol + "{\\p0}";
    var dolgu = "Dialogue: 1," + tcode(0) + "," + tcode(dur) + ",Ilerleme,,0,0,0,," + bas +
      "\\1c" + assRenk(renk) + "\\1a&H00&\\clip(" + geo.x + ",0," + geo.x + "," + H + ")" +
      "\\t(0," + ms + ",\\clip(" + geo.x + ",0," + (geo.x + geo.w) + "," + H + "))\\p1}" + yol + "{\\p0}";
    var style = "Style: Ilerleme,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1";
    return { style: style, events: [zemin, dolgu], geo: geo };
  }

  /*
   * CTA metni: hazır seçim ("takip" | "part2" | "link") videonun dilinde ya da kullanıcının
   * metni (≤40 karakter, emojisiz: libass çizemez). Boşsa "".
   */
  function ctaMetni(secim, ozel, lang) {
    var dil = lang === "tr" || lang === "az" ? "tr" : "en";
    var t = secim === "ozel" ? String(ozel == null ? "" : ozel) : (CTA_HAZIR[dil][secim] || "");
    t = (CT && CT.emojiSil ? CT.emojiSil(t) : t).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
    return t.length > 40 ? t.slice(0, 40).trim() : t;
  }

  /*
   * CTA hangi yükseklikte? Altyazı altta duruyorsa (konum 1/2) CTA üste geçer, yoksa alta.
   * Kanca açılışta üstte olduğundan CTA (son saniyeler) onunla zaman olarak çakışmaz.
   */
  function ctaKonum(altyaziKonum, altyaziAcik) {
    var k = Number(altyaziKonum);
    return altyaziAcik && (k === 1 || k === 2) ? "ust" : "alt";
  }

  /*
   * Kapanış çağrısı olayları (kanca başlığı oluşturucusuyla, "Cta" stil adıyla; konum "alt" ya da "ust").
   * o: { W, H, dur (Short süresi), metin, sure (CTA süresi, 1.5-4), hookDur (kanca süresi; yoksa 0),
   *      stil (kanca stili, varsayılan "serit"), konum, font, renk, vurguRenk, lang }
   * Döner: { ass, start, end, fontFiles } ya da { atla: "bos" | "kisa" | "cakisma" | "modul" }
   */
  function ctaEvents(o) {
    o = o || {};
    if (!HT) return { atla: "modul" };
    var metin = ctaMetni("ozel", o.metin, o.lang);
    if (!metin) return { atla: "bos" };
    var dur = sayi(o.dur, 0);
    if (!(dur >= CTA_EN_KISA_KLIP)) return { atla: "kisa" };
    var sure = Math.max(1.5, Math.min(4, sayi(o.sure, 2.5)));
    var bas = Math.max(0, dur - sure);
    var kanca = Math.max(0, sayi(o.hookDur, 0));
    if (kanca > 0 && bas < kanca + CTA_KANCA_ARASI) return { atla: "cakisma" };
    var built = HT.build({ text: metin, stil: o.stil || "serit", width: o.W, height: o.H, dur: sure,
      konum: o.konum === "ust" ? "ust" : "alt", styleName: "Cta", font: o.font, renk: o.renk, vurguRenk: o.vurguRenk, lang: o.lang });
    return { ass: built.ass, start: bas, end: bas + built.dur, fontFiles: built.fontFiles };
  }

  /* ---------------- ASS birleştirme ---------------- */

  function satirlar(ass) { return String(ass || "").replace(/\r\n/g, "\n").split("\n"); }

  // Stil adını hem Style: satırında hem Dialogue'larda değiştir
  function renameStyle(ass, eski, yeni) {
    return satirlar(ass).map(function (l) {
      if (l.indexOf("Style: " + eski + ",") === 0) return "Style: " + yeni + "," + l.slice(("Style: " + eski + ",").length);
      var m = /^(Dialogue: [^,]*,[^,]*,[^,]*,)([^,]*)(,.*)$/.exec(l);
      if (m && m[2] === eski) return m[1] + yeni + m[3];
      return l;
    }).join("\n");
  }

  function stilSatirlari(ass) { return satirlar(ass).filter(function (l) { return /^Style: /.test(l); }); }
  function olaylar(ass) { return satirlar(ass).filter(function (l) { return /^Dialogue: /.test(l); }); }
  function playRes(ass, ad) {
    var m = new RegExp("^PlayRes" + ad + ":\\s*(\\d+)", "m").exec(String(ass || ""));
    return m ? Number(m[1]) : 0;
  }

  // Olayı dt saniye kaydır (Start ve End)
  function kaydir(l, dt) {
    var m = /^(Dialogue: [^,]*,)([^,]*),([^,]*)(,.*)$/.exec(l);
    if (!m || !dt) return l;
    return m[1] + tcode(saniye(m[2]) + dt) + "," + tcode(saniye(m[3]) + dt) + m[4];
  }

  /*
   * Tek ASS: o: { W, H, hookAss?, ctaAss?, ctaStart (sn), progress? (progressBarEvents çıktısı) }
   * Kanca 0. saniyede kalır; CTA olayları ctaStart kadar kaydırılır ve stili "Cta" olur
   * (kancanın "Kanca" stiliyle çakışmasın). PlayRes W×H (verilmezse ilk ASS'inki).
   */
  function composeFrameAss(o) {
    o = o || {};
    var W = Math.round(sayi(o.W, 0)) || playRes(o.hookAss, "X") || playRes(o.ctaAss, "X") || 1080;
    var H = Math.round(sayi(o.H, 0)) || playRes(o.hookAss, "Y") || playRes(o.ctaAss, "Y") || 1920;
    var stiller = [], ev = [], gorulen = {};
    function stilEkle(l) {
      var ad = l.slice(7, l.indexOf(","));
      if (gorulen[ad]) return;
      gorulen[ad] = 1;
      stiller.push(l);
    }
    if (o.progress && o.progress.style) {
      stilEkle(o.progress.style);
      (o.progress.events || []).forEach(function (l) { ev.push(l); });
    }
    if (o.hookAss) {
      stilSatirlari(o.hookAss).forEach(stilEkle);
      olaylar(o.hookAss).forEach(function (l) { ev.push(l); });
    }
    if (o.ctaAss) {
      var cta = o.ctaAss;
      // eski (adsız) CTA çıktısı "Kanca" adını taşır: her durumda "Cta"ya çevrilir
      stilSatirlari(cta).forEach(function (l) {
        var ad = l.slice(7, l.indexOf(","));
        if (ad !== "Cta") cta = renameStyle(cta, ad, "Cta");
      });
      stilSatirlari(cta).forEach(stilEkle);
      var dt = Math.max(0, sayi(o.ctaStart, 0));
      olaylar(cta).forEach(function (l) { ev.push(kaydir(l, dt)); });
    }
    return [
      "[Script Info]", "; Suflo Shorts Paketi - Cerceve", "ScriptType: v4.00+", "WrapStyle: 2",
      "ScaledBorderAndShadow: yes", "YCbCr Matrix: None", "PlayResX: " + W, "PlayResY: " + H, "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
    ].concat(stiller, ["", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"], ev).join("\n") + "\n";
  }

  return {
    ILERLEME_STILLERI: ILERLEME_STILLERI.slice(),
    CTA_HAZIR: CTA_HAZIR,
    CTA_EN_KISA_KLIP: CTA_EN_KISA_KLIP,
    progressGeometry: progressGeometry,
    progressBarEvents: progressBarEvents,
    ctaMetni: ctaMetni,
    ctaKonum: ctaKonum,
    ctaEvents: ctaEvents,
    renameStyle: renameStyle,
    composeFrameAss: composeFrameAss,
    tcode: tcode
  };
});
