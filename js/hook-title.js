/*
 * Suflo Kanca Başlığı — Shorts/Reels açılış başlık kartı
 *
 * Kısa (2-4 sn) animasyonlu başlık kartının ASS'ini üretir; panel bunu
 * ffmpeg/libass ile şeffaf .mov'a çevirip timeline'a koyar. *kelime*
 * işaretli kelimeler vurgu renginde. Saf modül: DOM'a, ağa, Premiere'e dokunmaz.
 */
(function (root, factory) {
  // Paket fontlari (style-share) ve platform guvenli alani (style-engine) ortak kaynaktan
  function yukle(ad, dosya) {
    if (root && root[ad]) return root[ad];
    if (typeof require === "function") { try { return require(dosya); } catch (e) {} }
    return null;
  }
  var api = factory(yukle("SufloStyleShare", "./style-share.js"), yukle("SufloStyleEngine", "./style-engine.js"));
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloHookTitle = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (SS, SE) {
  "use strict";

  var STILLER = {
    kutu: { ad: "Kutu", font: "Anton", fontFile: "Anton.ttf", genislik: .47, boyut: 118, kase: "upper" },
    serit: { ad: "Şerit", font: "Montserrat", fontFile: "Montserrat-Bold.ttf", genislik: .64, boyut: 76, kase: "normal" },
    sade: { ad: "Sade", font: "Archivo Black", fontFile: "ArchivoBlack.ttf", genislik: .72, boyut: 92, kase: "upper" },
    neon: { ad: "Neon", font: "Bebas Neue", fontFile: "BebasNeue.ttf", genislik: .43, boyut: 132, kase: "upper" },
    // Bungee libass'ta \fs'e gore cok kucuk cizilir (dikey olculeri genis): etiket Archivo Black kullanir
    etiket: { ad: "Etiket", font: "Archivo Black", fontFile: "ArchivoBlack.ttf", genislik: .72, boyut: 80, kase: "upper" }
  };

  function assColor(hex, alpha) {
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) h = "ffffff";
    var a = Math.max(0, Math.min(255, Number(alpha || 0)));
    return ("&H" + ("0" + a.toString(16)).slice(-2) + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2)).toUpperCase();
  }

  function tcode(sec) {
    var cs = Math.max(0, Math.round(Number(sec || 0) * 100));
    var h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return h + ":" + p(m) + ":" + p(s) + "." + p(c);
  }

  function esc(v) {
    return String(v || "").replace(/\\/g, "⧵").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  }

  // kapanis yildizindan sonra Turkce ek ("*Instagram*'da") ve/veya noktalama olabilir
  var KAPANIS = /\*+((?:['’][^\s*'’.,!?;:…»"()\[\]]+)?[.,!?;:…»"'’)\]]*)$/;

  // "*iki kelime* daha" -> [{ w, v }]
  function tokens(text) {
    var acik = false;
    return String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).map(function (w) {
      var dolu = w.replace(/\*/g, "").length > 0;
      var bas = dolu && /^\*/.test(w), son = dolu && KAPANIS.test(w);
      var v = acik || bas;
      if (bas && !son) acik = true;
      if (son) acik = false;
      return { w: w.replace(/^\*+/, "").replace(KAPANIS, "$1"), v: v };
    }).filter(function (t) { return t.w; });
  }

  /*
   * Kelimeleri en fazla 3 satıra, satır uzunluğu ~maxChars olacak şekilde
   * dengeli böl. Doner: [[token, ...], ...]
   */
  function satirlar(toks, maxChars) {
    var toplam = toks.reduce(function (n, t) { return n + t.w.length + 1; }, -1);
    var adet = Math.max(1, Math.min(3, Math.ceil(toplam / maxChars)));
    adet = Math.min(adet, toks.length);
    var hedef = toplam / adet, out = [[]], uz = 0;
    toks.forEach(function (t, i) {
      var kalanKelime = toks.length - i, kalanSatir = adet - out.length;
      if (out[out.length - 1].length && out.length < adet &&
          (uz + t.w.length / 2 > hedef || kalanKelime <= kalanSatir)) {
        out.push([]); uz = 0;
      }
      out[out.length - 1].push(t);
      uz += t.w.length + 1;
    });
    return out;
  }

  // Buyuk harf kurali dile gore: yalniz tr/az'de i -> İ ("THIS", "THİS" degil)
  function kase(text, mod, loc) {
    if (mod !== "upper") return text;
    if (!loc) return text.toUpperCase();
    try { return text.toLocaleUpperCase(loc); } catch (e) { return text.toUpperCase(); }
  }

  // Diger ASS'lerle birlestirilen kopyalar (Shorts paketinde CTA) kendi stil adini tasir
  function stilAdi(ad) {
    return typeof ad === "string" && /^[A-Za-z][A-Za-z0-9]{0,15}$/.test(ad) ? ad : "Kanca";
  }

  /*
   * opts: { text, stil, width, height, dur, renk, vurguRenk, konum ("ust"|"orta"|"alt"), loc,
   *         font (Marka Kiti: paket fontlarindan biri; gecersizse stilin kendi fontu),
   *         styleName (ASS stil adi; varsayilan "Kanca" — verilmezse cikti bayt bayt eskisi) }
   * "alt": blok dikeyde platform alt arayuzunun (%78) ustunde, yatayda alt ucte biter.
   * Doner: { ass, fontFiles, dur }
   */
  function build(opts) {
    opts = opts || {};
    var st = STILLER[opts.stil] || STILLER.kutu;
    if (SS && typeof opts.font === "string" && SS.hasFont(opts.font) && opts.font !== st.font) {
      st = { ad: st.ad, font: opts.font, fontFile: SS.fontFile(opts.font), genislik: SS.FONTS[opts.font].genislik, boyut: st.boyut, kase: st.kase };
    }
    var W = Math.max(320, Math.round(opts.width || 1920)), H = Math.max(180, Math.round(opts.height || 1080));
    var dur = Math.max(1, Math.min(10, Number(opts.dur) || 3));
    // renkler yalniz #rrggbb (assColor gecersizi beyaza cevirir; vurgu icin kendi varsayilani)
    var renk = /^#[0-9a-f]{6}$/i.test(String(opts.renk || "")) ? opts.renk : "#ffffff";
    var vurgu = /^#[0-9a-f]{6}$/i.test(String(opts.vurguRenk || "")) ? opts.vurguRenk : "#ffe600";
    var kisa = Math.min(W, H);
    var loc = opts.loc || { tr: "tr-TR", az: "az" }[opts.lang || "tr"];
    var toks = tokens(kase(String(opts.text || ""), st.kase, loc));
    if (!toks.length) throw new Error("Başlık metni boş.");
    var maxChars = W < H ? 14 : 22;
    var lines = satirlar(toks, maxChars);
    var enUzun = lines.reduce(function (n, l) {
      return Math.max(n, l.map(function (t) { return t.w; }).join(" ").length);
    }, 1);
    var fs = Math.round(st.boyut * kisa / 1080);
    var maxW = W * .84;
    if (enUzun * fs * st.genislik > maxW) fs = Math.max(10, Math.floor(maxW / (enUzun * st.genislik)));
    var satirH = fs * 1.18, blokH = satirH * lines.length;
    var cx = Math.round(W / 2);
    var cy = Math.round(opts.konum === "orta" ? H * .5
      : opts.konum === "alt" ? H * (W < H ? .74 : .84) - blokH / 2
      : H * (W < H ? .2 : .22) + blokH / 2);
    var stilAd = stilAdi(opts.styleName);
    var giris = .28, cikis = .22;

    var ev = [];
    function d(layer, a, b, txt) {
      ev.push("Dialogue: " + layer + "," + tcode(a) + "," + tcode(b) + "," + stilAd + ",,0,0,0,," + txt);
    }
    // ekVurgu/ekNormal: vurgulu kelimeye ozel ek ASS etiketleri (or. kontur) ve geri alinisi
    function satirMetni(l, normal, accent, ekVurgu, ekNormal) {
      return l.map(function (t) {
        return t.v ? "{\\1c" + accent + (ekVurgu || "") + "}" + esc(t.w) + "{\\1c" + normal + (ekNormal || "") + "}" : esc(t.w);
      }).join(" ");
    }
    function kutuYolu(w, h, r) {
      w = Math.round(w); h = Math.round(h); r = Math.max(2, Math.round(r));
      return "m " + r + " 0 l " + (w - r) + " 0 b " + w + " 0 " + w + " 0 " + w + " " + r +
        " l " + w + " " + (h - r) + " b " + w + " " + h + " " + w + " " + h + " " + (w - r) + " " + h +
        " l " + r + " " + h + " b 0 " + h + " 0 " + h + " 0 " + (h - r) + " l 0 " + r + " b 0 0 0 0 " + r + " 0";
    }
    var ms = Math.round(giris * 1000), msOut = Math.round(cikis * 1000);
    var bord = Math.max(2, Math.round(fs * .07));

    lines.forEach(function (l, i) {
      var y = Math.round(cy - blokH / 2 + satirH * (i + .5));
      var gecikme = i * .09, bas = gecikme;
      var uz = l.map(function (t) { return t.w; }).join(" ").length;
      var kutuW = uz * fs * st.genislik + fs * .7, kutuH = satirH * .98;
      var gm = Math.round(gecikme * 1000);
      if (opts.stil === "serit") {
        // koyu serit soldan acilir, metin arkasindan kayar; vurgu kelime renkli
        d(0, bas, dur, "{\\an7\\pos(" + Math.round(cx - kutuW / 2) + "," + Math.round(y - kutuH / 2) + ")\\bord0\\shad0\\1c" +
          assColor("#0b0d12", 0x10) + "\\clip(0,0," + Math.round(cx - kutuW / 2) + "," + H + ")" +
          "\\t(0," + ms + ",\\clip(0,0," + W + "," + H + "))\\fad(0," + msOut + ")\\p1}" + kutuYolu(kutuW, kutuH, fs * .14) + "{\\p0}");
        d(0, bas, dur, "{\\an7\\pos(" + Math.round(cx - kutuW / 2) + "," + Math.round(y - kutuH / 2) + ")\\bord0\\shad0\\1c" +
          assColor(vurgu) + "\\fscy0\\t(0," + ms + ",\\fscy100)\\fad(0," + msOut + ")\\p1}" + kutuYolu(fs * .12, kutuH, fs * .05) + "{\\p0}");
        d(1, bas, dur, "{\\an5\\move(" + (cx - Math.round(fs * .6)) + "," + y + "," + cx + "," + y + "," + Math.round(ms * .4) + "," + (ms + 80) + ")" +
          "\\fs" + fs + "\\bord0\\shad0\\1c" + assColor(renk) + "\\alpha&HFF&\\t(" + Math.round(ms * .4) + "," + (ms + 40) + ",\\alpha&H00&)" +
          "\\fad(0," + msOut + ")}" + satirMetni(l, assColor(renk), assColor(vurgu)));
      } else if (opts.stil === "neon") {
        // bulanik renkli parilti + beyaz cekirdek; titreyerek yanar
        var titre = "\\alpha&HFF&\\t(" + gm + "," + (gm + 60) + ",\\alpha&H30&)\\t(" + (gm + 60) + "," + (gm + 110) + ",\\alpha&HA0&)\\t(" + (gm + 110) + "," + (gm + ms) + ",\\alpha&H00&)";
        // vurgulu kelime: parilti beyaz, cekirdek vurgu renginde (ayni renk parilti icinde kaybolurdu)
        var parilti = l.map(function (t) {
          return t.v ? "{\\3c" + assColor("#ffffff") + "}" + esc(t.w) + "{\\3c" + assColor(vurgu) + "}" : esc(t.w);
        }).join(" ");
        d(0, bas, dur, "{\\an5\\pos(" + cx + "," + y + ")\\fs" + fs + "\\1a&HFF&\\3c" + assColor(vurgu) + "\\bord" + Math.max(3, Math.round(fs * .12)) +
          "\\blur" + Math.max(4, Math.round(fs * .16)) + "\\shad0" + titre + "\\fad(0," + msOut + ")}" + parilti);
        d(1, bas, dur, "{\\an5\\pos(" + cx + "," + y + ")\\fs" + fs + "\\1c" + assColor(renk) + "\\3c" + assColor(vurgu) + "\\bord" + Math.max(1, Math.round(fs * .03)) +
          "\\blur1\\shad0" + titre + "\\fad(0," + msOut + ")}" + satirMetni(l, assColor(renk), assColor(vurgu)));
      } else if (opts.stil === "etiket") {
        // egik beyaz cikartma: golge + beyaz kart, koyu metin; vurgu kelime renkli; sekerek gelir
        var aci = (i % 2 ? 3 : -3);
        var o2 = "\\org(" + cx + "," + y + ")\\frz" + aci;
        var sek = "\\fscx20\\fscy20\\t(" + gm + "," + (gm + ms) + ",0.45,\\fscx112\\fscy112)\\t(" + (gm + ms) + "," + (gm + ms + 110) + ",\\fscx100\\fscy100)";
        var golge = Math.max(3, Math.round(fs * .08));
        d(0, 0, dur, "{\\an7\\pos(" + Math.round(cx - kutuW / 2 + golge) + "," + Math.round(y - kutuH / 2 + golge) + ")" + o2 + "\\bord0\\shad0\\1c" + assColor("#000000", 0x60) +
          "\\alpha&HFF&\\t(" + gm + "," + (gm + 40) + ",\\alpha&H60&)" + sek + "\\fad(0," + msOut + ")\\p1}" + kutuYolu(kutuW, kutuH, fs * .2) + "{\\p0}");
        d(0, 0, dur, "{\\an7\\pos(" + Math.round(cx - kutuW / 2) + "," + Math.round(y - kutuH / 2) + ")" + o2 + "\\bord0\\shad0\\1c" + assColor("#ffffff") +
          "\\alpha&HFF&\\t(" + gm + "," + (gm + 40) + ",\\alpha&H00&)" + sek + "\\fad(0," + msOut + ")\\p1}" + kutuYolu(kutuW, kutuH, fs * .2) + "{\\p0}");
        d(1, 0, dur, "{\\an5\\pos(" + cx + "," + y + ")" + o2 + "\\fs" + fs + "\\bord0\\shad0\\1c" + assColor("#15131f") +
          "\\alpha&HFF&\\t(" + gm + "," + (gm + 40) + ",\\alpha&H00&)" + sek + "\\fad(0," + msOut + ")}" + satirMetni(l, assColor("#15131f"), assColor(vurgu)));
      } else if (opts.stil === "sade") {
        // buyuk metin asagidan yukselir, golge; vurgu kelime renkli
        d(1, bas, dur, "{\\an5\\move(" + cx + "," + (y + Math.round(fs * .35)) + "," + cx + "," + y + ",0," + ms + ")" +
          "\\fs" + fs + "\\1c" + assColor(renk) + "\\3c" + assColor("#000000") + "\\bord" + bord +
          "\\shad" + Math.max(1, Math.round(fs * .06)) + "\\4c" + assColor("#000000", 0x50) +
          "\\fad(" + Math.round(ms * .8) + "," + msOut + ")}" + satirMetni(l, assColor(renk), assColor(vurgu)));
      } else {
        // kutu: vurgu renginde kutu pop ile acilir, metin koyu; vurgu kelime beyaz.
        // Beyaz, acik kutu renginde (varsayilan sari #ffe600) okunmuyordu: koyu kontur sart.
        var vurguKontur = "\\3c" + assColor("#111111") + "\\bord" + Math.max(2, Math.round(fs * .07));
        var org = "\\org(" + cx + "," + y + ")";
        var pop = "\\fscx40\\fscy40\\t(" + gm + "," + (gm + ms) + ",0.5,\\fscx106\\fscy106)\\t(" + (gm + ms) + "," + (gm + ms + 90) + ",\\fscx100\\fscy100)";
        d(0, 0, dur, "{\\an7\\pos(" + Math.round(cx - kutuW / 2) + "," + Math.round(y - kutuH / 2) + ")" + org +
          "\\frz" + (i % 2 ? 1.2 : -1.2) + "\\bord0\\shad0\\1c" + assColor(vurgu) + "\\alpha&HFF&\\t(" + gm + "," + (gm + 40) + ",\\alpha&H00&)" +
          pop + "\\fad(0," + msOut + ")\\p1}" + kutuYolu(kutuW, kutuH, fs * .16) + "{\\p0}");
        d(1, 0, dur, "{\\an5\\pos(" + cx + "," + y + ")" + org + "\\frz" + (i % 2 ? 1.2 : -1.2) +
          "\\fs" + fs + "\\bord0\\shad0\\1c" + assColor("#111111") + "\\alpha&HFF&\\t(" + gm + "," + (gm + 40) + ",\\alpha&H00&)" +
          pop + "\\fad(0," + msOut + ")}" + satirMetni(l, assColor("#111111"), assColor("#ffffff"), vurguKontur, "\\bord0"));
      }
    });

    var ass = [
      "[Script Info]", "; Suflo Kanca Basligi", "ScriptType: v4.00+", "WrapStyle: 2",
      "ScaledBorderAndShadow: yes", "YCbCr Matrix: None", "PlayResX: " + W, "PlayResY: " + H, "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      "Style: " + stilAd + "," + st.font + "," + fs + "," + assColor(renk) + "," + assColor(renk) + "," + assColor("#000000") + "," +
        assColor("#000000", 0x80) + ",-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1",
      "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ].concat(ev).join("\n") + "\n";
    return { ass: ass, fontFiles: [st.fontFile], dur: dur, satir: lines.length };
  }

  var DIL_ADI = { tr: "Turkish", az: "Azerbaijani", en: "English", ru: "Russian", de: "German", ar: "Arabic",
    es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese" };

  /*
   * AI ile kanca basligi onerisi istemi. Metin cok uzunsa basi (ilk ~%60) ve
   * esit aralikli ornekler alinir: kanca cogu zaman videonun vaadinden cikar.
   * opts: { lang, adet, maxChars, aralik: {start, end} (yalniz o anin metni) }
   */
  function suggestPrompt(segments, opts) {
    opts = opts || {};
    var segs = (segments || []).filter(function (s) {
      if (!s || !String(s.text || "").trim()) return false;
      if (opts.aralik) return Number(s.end) > opts.aralik.start && Number(s.start) < opts.aralik.end;
      return true;
    });
    var metin = segs.map(function (s) { return String(s.text).replace(/\*/g, "").replace(/\s+/g, " ").trim(); }).join(" ");
    var max = opts.maxChars || 6000;
    if (metin.length > max) {
      var bas = metin.slice(0, Math.round(max * 0.6));
      var kalan = metin.slice(Math.round(max * 0.6));
      var parca = 5, boy = Math.round(max * 0.4 / parca), adim = Math.floor(kalan.length / parca);
      var ornek = [];
      for (var i = 0; i < parca; i++) ornek.push(kalan.substr(i * adim, boy));
      metin = bas + " … " + ornek.join(" … ");
    }
    var dil = DIL_ADI[opts.lang] || "the transcript's language";
    var adet = opts.adet || 5;
    return {
      system: "You write on-screen hook titles for the first second of YouTube Shorts / Reels / TikTok. Write " + adet +
        " different hooks in " + dil + " for this video: max 7 words each, curiosity or a bold promise, no clickbait lies, " +
        "no hashtags, no emojis, no quotes. Wrap the single most important word (or number with its unit) in single asterisks, " +
        "like *this*. Reply ONLY with JSON {\"hooks\":[\"...\"]}.",
      user: "Transcript:\n" + metin
    };
  }

  // Yanit -> temiz baslik listesi (en fazla 7 kelime, tekrarsiz, markdown temiz)
  function parseSuggestions(content) {
    var data;
    try { data = typeof content === "string" ? JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) : content; } catch (e) { return []; }
    var raw = data && (data.hooks || data.titles || data.Hooks);
    if (!(raw instanceof Array)) return [];
    var gorulen = {};
    return raw.map(function (h) {
      var t = String(h == null ? "" : h).replace(/\*\*([^*]+)\*\*/g, "*$1*").replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
        .replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
      var kelimeler = t.split(" ");
      if (kelimeler.length > 9) t = kelimeler.slice(0, 9).join(" ");
      // tek kalan yildiz (kirpma/hata) -> yildizlari tamamen at
      if ((t.match(/\*/g) || []).length % 2) t = t.replace(/\*/g, "");
      return t;
    }).filter(function (t) {
      var k = t.replace(/\*/g, "").toLocaleLowerCase("tr");
      if (!k || gorulen[k]) return false;
      gorulen[k] = 1;
      return true;
    }).slice(0, 8);
  }

  // TikTok / Reels / Shorts arayuzunun kapattigi bolgeler: tek kaynak stil motoru (Altyazi onizlemesiyle ayni)
  var GUVENLI_ALAN = (SE && SE.GUVENLI_ALAN) || [{ x: 0, y: 0, w: 1, h: 0.07 }, { x: 0.87, y: 0.35, w: 0.13, h: 0.43 }, { x: 0, y: 0.78, w: 1, h: 0.22 }];
  function safeZoneFilter(w, h) {
    return GUVENLI_ALAN.map(function (b) {
      var x = Math.round(b.x * w), y = Math.round(b.y * h), bw = Math.round(b.w * w), bh = Math.round(b.h * h);
      return "drawbox=x=" + x + ":y=" + y + ":w=" + bw + ":h=" + bh + ":color=0xff3b5c@0.22:t=fill," +
        "drawbox=x=" + x + ":y=" + y + ":w=" + bw + ":h=" + bh + ":color=0xff3b5c@0.7:t=1";
    }).join(",");
  }

  function list() {
    return Object.keys(STILLER).map(function (id) { return { id: id, ad: STILLER[id].ad }; });
  }

  return { STILLER: STILLER, stilAdi: stilAdi, safeZoneFilter: safeZoneFilter, build: build, suggestPrompt: suggestPrompt, parseSuggestions: parseSuggestions, tokens: tokens, satirlar: satirlar, list: list };
});
