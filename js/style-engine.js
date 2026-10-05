/*
 * Suflo Stil Motoru v3
 *
 * Yedi preset yalnız renk/font değiştirmez. Her biri kendi kelime kurgusunu,
 * kompozisyonunu, arka plan katmanlarını ve hareket ritmini üretir. Motor DOM'a
 * ve Premiere'e bağımlı değildir; zamanlı cue'lardan katmanlı ASS döndürür.
 */
(function (root, factory) {
  // Paylasim kodu modulu (paket fontlari) style-engine'den ONCE yuklenir; yoksa motor yine calisir
  var SS = (root && root.SufloStyleShare) || null;
  if (!SS && typeof require === "function") { try { SS = require("./style-share.js"); } catch (e) { SS = null; } }
  var api = factory(SS);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloStyleEngine = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (SS) {
  "use strict";

  var STYLES = {
    mrbeast: {
      id: "mrbeast", name: "Creator Punch", description: "Kalın creator vurgusu ve punch ritmi",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "mrbeast", yogunluk: "hard", font: "Archivo Black", fontFile: "ArchivoBlack.ttf",
        boyut: 132, renk: "#ffffff", konturRenk: "#05070b", vurguRenk: "#ffe342",
        kontur: 9, konum: 5, kutu: false, animasyon: "mrbeast" }
    },
    capcut: {
      id: "capcut", name: "Clean Pill", description: "Temiz kelime vurgusu ve kompakt pill",
      text: { maxlen: "k1", kase: "normal", punct: false },
      style: { aile: "capcut", yogunluk: "balanced", font: "Montserrat", fontFile: "Montserrat-Bold.ttf",
        boyut: 78, renk: "#ffffff", konturRenk: "#07090d", vurguRenk: "#b8ff5a",
        kontur: 1, konum: 5, kutu: true, animasyon: "capcut" }
    },
    saas: {
      id: "saas", name: "SaaS Glass", description: "Apple sadeliginde cam altyazi sistemi",
      text: { maxlen: "k1", kase: "normal", punct: true },
      style: { aile: "saas", yogunluk: "soft", font: "Montserrat", fontFile: "Montserrat-Bold.ttf",
        boyut: 66, renk: "#f8f9ff", konturRenk: "#090a0f", vurguRenk: "#a9a7ff",
        kontur: 0, konum: 5, kutu: true, animasyon: "saas" }
    },
    viral: {
      id: "viral", name: "Viral Vurgu", description: "Katmanlı creator tipografisi",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "viral", yogunluk: "balanced", font: "Archivo Black", fontFile: "ArchivoBlack.ttf",
        boyut: 118, renk: "#ffffff", konturRenk: "#05070b", vurguRenk: "#ffd83d",
        kontur: 8, konum: 5, kutu: false, animasyon: "viral" }
    },
    pop: {
      id: "pop", name: "Pop", description: "Renkli sticker vuruşları",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "pop", yogunluk: "hard", font: "Bungee", fontFile: "Bungee.ttf",
        boyut: 164, renk: "#ffffff", konturRenk: "#11131c", vurguRenk: "#ff4fc8",
        kontur: 3, konum: 5, kutu: false, animasyon: "pop" }
    },
    doc: {
      id: "doc", name: "Belgesel", description: "Editoryal alt bant",
      text: { maxlen: "c60", kase: "normal", punct: true },
      style: { aile: "doc", yogunluk: "soft", font: "Lora", fontFile: "Lora.ttf",
        boyut: 70, renk: "#f5f0e7", konturRenk: "#071016", vurguRenk: "#d6b56f",
        kontur: 0, konum: 1, kutu: true, animasyon: "doc" }
    },
    premium: {
      id: "premium", name: "Premium", description: "Sinematik başlık sistemi",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "premium", yogunluk: "soft", font: "Montserrat", fontFile: "Montserrat-Bold.ttf",
        boyut: 98, renk: "#f7f5ef", konturRenk: "#08090c", vurguRenk: "#d9bc74",
        kontur: 1, konum: 5, kutu: false, animasyon: "premium" }
    }
    ,
    // ---- v3.0: Suflo'nun kendi animasyonlu stilleri ----
    hormozi: {
      id: "hormozi", name: "Bold Box", description: "Kalın büyük harf, aktif kelime renk değiştirip zıplar",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "hormozi", yogunluk: "hard", font: "Anton", fontFile: "Anton.ttf",
        boyut: 124, renk: "#ffffff", konturRenk: "#000000", vurguRenk: "#ffe600",
        kontur: 8, konum: 5, kutu: false, animasyon: "hormozi" }
    },
    neon: {
      id: "neon", name: "Neon", description: "Parlayan neon ışık, aktif kelime yanar",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "neon", yogunluk: "balanced", font: "Bebas Neue", fontFile: "BebasNeue.ttf",
        boyut: 118, renk: "#f4fbff", konturRenk: "#0b1020", vurguRenk: "#2af5ff",
        kontur: 2, konum: 5, kutu: false, animasyon: "neon" }
    },
    daktilo: {
      id: "daktilo", name: "Daktilo", description: "Kelimeler yazılıyormuş gibi tek tek belirir",
      text: { maxlen: "k1", kase: "normal", punct: true },
      style: { aile: "daktilo", yogunluk: "soft", font: "Montserrat", fontFile: "Montserrat-Bold.ttf",
        boyut: 70, renk: "#ffffff", konturRenk: "#0a0c12", vurguRenk: "#7cf0a0",
        kontur: 3, konum: 2, kutu: false, animasyon: "daktilo" }
    },
    ziplama: {
      id: "ziplama", name: "Zıplayan", description: "Her kelime yukarıdan düşüp esneyerek yerine oturur",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "ziplama", yogunluk: "balanced", font: "Archivo Black", fontFile: "ArchivoBlack.ttf",
        boyut: 104, renk: "#ffffff", konturRenk: "#111111", vurguRenk: "#ff5f7a",
        kontur: 7, konum: 5, kutu: false, animasyon: "ziplama" }
    },
    dolgu: {
      id: "dolgu", name: "Karaoke Dolgu", description: "Satır konuşmayla birlikte soldan sağa dolar",
      text: { maxlen: "k1", kase: "normal", punct: false },
      style: { aile: "dolgu", yogunluk: "soft", font: "Montserrat", fontFile: "Montserrat-Bold.ttf",
        boyut: 78, renk: "#ffffff", konturRenk: "#0a0a0f", vurguRenk: "#8b7cf6",
        kontur: 4, konum: 2, kutu: false, animasyon: "dolgu" }
    }
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function has(id) { return !!STYLES[id]; }
  // Kelime zamanli stil mi (satir modundaki altyazi once kelimelere bolunur)
  function wordBased(id) { return !!STYLES[id] && /^k/.test(STYLES[id].text.maxlen); }

  /*
   * Satir cue'larini kelime cue'larina bol: sure, kelime uzunluguyla orantili
   * paylastirilir. Gercek kelime zamani olmayan (SRT/satir modu) altyazilarda
   * kelime stillerinin anlamli calismasini saglar.
   */
  // Podcast Modu: cue'nun konusmaci sirasi (sayi) donusumlerde tasinir; yoksa alan hic eklenmez
  function konusmaciTasi(kaynak, hedef) {
    if (kaynak && typeof kaynak.speaker === "number" && isFinite(kaynak.speaker)) hedef.speaker = kaynak.speaker;
    return hedef;
  }

  function splitToWords(cues) {
    var out = [];
    (cues || []).forEach(function (cue) {
      var words = String(cue.text || "").trim().split(/\s+/).filter(Boolean);
      var start = Number(cue.start || 0), end = Number(cue.end || 0);
      if (words.length <= 1) { if (words.length) out.push(konusmaciTasi(cue, { start: start, end: end, text: words[0], lineEnd: true })); return; }
      var weights = words.map(function (w) { return w.replace(/\*/g, "").length + 1; });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var t = start;
      words.forEach(function (w, i) {
        var d = (end - start) * weights[i] / total;
        out.push(konusmaciTasi(cue, { start: t, end: i === words.length - 1 ? end : t + d, text: w, lineEnd: i === words.length - 1 }));
        t += d;
      });
    });
    return out;
  }

  // Birikimli karaoke cue'lari ("bir", "bir iki", ...) -> her cue'nun son kelimesi
  function lastWords(cues) {
    return (cues || []).map(function (cue) {
      var words = String(cue.text || "").trim().split(/\s+/).filter(Boolean);
      return konusmaciTasi(cue, { start: cue.start, end: cue.end, text: words[words.length - 1] || "" });
    }).filter(function (c) { return c.text; });
  }
  /*
   * Anahtar kelime vurgusu: altyazi metninde *kelime* ya da *iki kelime* ile
   * isaretlenen kelimeler her stilde surekli vurgu renginde cizilir.
   * markEmphasis kelime cue'larindaki isaretleri temizleyip cue.vurgu bayragi koyar;
   * acik kalan isaret satir sonunda (lineEnd) kapanir.
   */
  // kapanis yildizindan sonra noktalama olabilir: "*100 TL*."
  // kapanis yildizindan sonra Turkce ek ("*Instagram*'da") ve/veya noktalama olabilir
  var VURGU_SON = /\*+((?:['’][^\s*'’.,!?;:…»"()\[\]]+)?[.,!?;:…»"'’)\]]*)$/;
  function isaretsiz(w) { return w.replace(/^\*+/, "").replace(VURGU_SON, "$1"); }
  var VURGU_EN_COK = 6;   // kapanmayan isaret en fazla bu kadar kelime surer
  function markEmphasis(cues) {
    var acik = false, sayac = 0;
    return (cues || []).map(function (cue) {
      var t = String(cue.text || "");
      var dolu = t.replace(/\*/g, "").length > 0;
      // yalniz yildizdan olusan kelime isaret acmaz/kapatmaz
      var bas = dolu && /^\*/.test(t), son = dolu && VURGU_SON.test(t);
      var temiz = isaretsiz(t);
      if (acik && ++sayac > VURGU_EN_COK) acik = false;
      var vurgu = acik || bas;
      if (bas && !son) { acik = true; sayac = 1; }
      if (son) acik = false;
      // satir/cumle sonunda acik isaret kapanir (kelime modunda lineEnd gelmez)
      if (cue.lineEnd || /[.!?…]["')\]»]*$/.test(temiz)) acik = false;
      var out = {};
      for (var k in cue) if (Object.prototype.hasOwnProperty.call(cue, k)) out[k] = cue[k];
      out.text = temiz || t;
      if (vurgu && temiz) out.vurgu = true;
      return out;
    }).filter(function (c) { return String(c.text).replace(/\*/g, "").trim(); });
  }

  // Satir metnini kelime parcalarina ayir: [{ w, v }] (v = vurgulu)
  function emphasisTokens(text) {
    var words = String(text || "").trim().split(/\s+/).filter(Boolean);
    var cues = words.map(function (w, i) { return { text: w, lineEnd: i === words.length - 1 }; });
    return markEmphasis(cues).map(function (c) { return { w: c.text, v: !!c.vurgu }; });
  }

  // Isaretleri tamamen kaldir (vurgu desteklemeyen ciktilar icin)
  function stripEmphasis(text) {
    return String(text == null ? "" : text).split(/(\s+)/).map(function (p) {
      return /\S/.test(p) && p.replace(/\*/g, "") ? isaretsiz(p) : p;
    }).join("");
  }

  function preset(id) { return STYLES[id] ? clone(STYLES[id]) : null; }
  function list() { return Object.keys(STYLES).map(function (id) { return preset(id); }); }

  function intensity(value) {
    if (value === "soft") return 0.76;
    if (value === "hard") return 1.28;
    return 1;
  }

  function assColor(hex, alpha) {
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var a = Math.max(0, Math.min(255, Number(alpha || 0)));
    return ("&H" + ("0" + a.toString(16)).slice(-2) + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2)).toUpperCase();
  }

  function timecode(seconds) {
    var cs = Math.max(0, Math.round(Number(seconds || 0) * 100));
    var h = Math.floor(cs / 360000);
    var m = Math.floor((cs % 360000) / 6000);
    var s = Math.floor((cs % 6000) / 100);
    var c = cs % 100;
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    return h + ":" + pad(m) + ":" + pad(s) + "." + pad(c);
  }

  function esc(value) {
    // Ters bolu ASS komutu baslatir (\N, \h, \n): kullanici metninde benzer gorunen
    // isarete cevrilir. Satir sonu, ters bolu donusumunden SONRA \N olur.
    return String(value || "").replace(/\\/g, "\u29F5").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
  }

  function normaliseCues(cues, offset) {
    var out = [];
    (cues || []).forEach(function (cue) {
      var start = Number(cue.start || 0) - Number(offset || 0);
      var end = Number(cue.end || 0) - Number(offset || 0);
      var value = String(cue.text || "").trim();
      if (!value || end <= 0) return;
      start = Math.max(0, start);
      end = Math.max(start + 0.08, end);
      out.push(konusmaciTasi(cue, { start: start, end: end, text: value }));
    });
    return out;
  }

  function groupWords(cues, limit) {
    var groups = [], current = [];
    function flush() { if (current.length) { groups.push(current); current = []; } }
    cues.forEach(function (cue, index) {
      current.push(cue);
      var next = cues[index + 1];
      var gap = next ? next.start - cue.end : 99;
      // lineEnd: satirdan bolunmus kelimelerde gruplar satir sinirini asmaz;
      // konusmaci degisince grup kapanir (iki kisinin sozu tek kartta birlesmez)
      var konusmaciDegisir = next && next.speaker !== cue.speaker;
      if (current.length >= limit || gap > 0.7 || cue.lineEnd || /[.!?…]$/.test(cue.text) || konusmaciDegisir) flush();
    });
    flush();
    return groups;
  }

  function meaningfulWord(group) {
    for (var v = 0; v < group.length; v++) if (group[v].vurgu) return v;
    var ignore = /^(ve|ile|bir|bu|şu|o|da|de|mi|mı|mu|mü|için|ama|the|a|an|and|or|of|to)$/i;
    var best = 0, score = -99;
    group.forEach(function (cue, index) {
      var clean = String(cue.text || "").replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]/g, "");
      var value = clean.length + (/\d/.test(clean) ? 8 : 0) - (ignore.test(clean) ? 7 : 0);
      if (value > score) { best = index; score = value; }
    });
    return best;
  }

  /*
   * Ilk yedi stilin olcegi. compile() olcekRef'i kisa kenara ayarlar: 16:9'da kisa
   * kenar zaten yukseklik (taban boyut degismez); 9:16'da yukseklikle olceklemek
   * yaziyi 1.78 kat buyutup kadrajdan tasiriyordu. Not: kadraja sigmayan cok uzun
   * kelime gruplari (fitSize) 16:9'da da kucultulur — onceden kadrajdan tasiyordu.
   */
  var olcekRef = 0;

  /*
   * TikTok / Reels / Shorts arayuzunun kapattigi bolgeler (1080x1920 olcumlerinden, oransal):
   * ust durum cubugu, sag ikon sutunu, alt aciklama + dugmeler. Tek kaynak: panel onizlemesi
   * (captions.js) ve kanca basligi (hook-title.js) buradan okur.
   */
  var GUVENLI_ALAN = [
    { x: 0, y: 0, w: 1, h: 0.07 },
    { x: 0.87, y: 0.35, w: 0.13, h: 0.43 },
    { x: 0, y: 0.78, w: 1, h: 0.22 }
  ];

  /*
   * "Platform arayuzunden kacin" (overrides.guvenli) dikey kadrajda: yazi ve paneller
   * kadrajin %74'u genisligine sigdirilir; ortalanmis metnin sag kenari %87'deki ikon
   * sutununun solunda kalir. compile() ayarlar, bitince sifirlar. 0 = kapali (cikti ayni).
   */
  var guvenliW = 0;
  function alanW(width) { return guvenliW ? Math.min(width, guvenliW) : width; }

  function scaled(value, height) {
    return Math.max(1, Math.round(Number(value || 1) * (olcekRef || height) / 1080));
  }

  // Dikey (9:16) kadrajda TikTok/Reels/Shorts alt arayuzu ~%78'den asagisini kapatir:
  // orta konumlu stiller en fazla %64'e, alt konum %74'e cekilir.
  function anchor(style, id, width, height) {
    var a = anchorTemel(style, id, width, height);
    if (height > width * 1.2) {
      if (a.an === 5) a.y = Math.min(a.y, Math.round(height * 0.64));
      else if (a.an === 2 || a.an === 1) a.y = Math.min(a.y, Math.round(height * 0.74));
    }
    return a;
  }

  function anchorTemel(style, id, width, height) {
    var pos = Number(style.konum || 5);
    if (pos === 8) return { an: 8, x: Math.round(width / 2), y: Math.round(height * 0.22) };
    if (pos === 2) return { an: 2, x: Math.round(width / 2), y: Math.round(height * 0.84) };
    if (pos === 1) return { an: 1, x: Math.round(width * 0.085), y: Math.round(height * 0.855) };
    if (id === "mrbeast") return { an: 5, x: Math.round(width / 2), y: Math.round(height * 0.64) };
    if (id === "capcut") return { an: 5, x: Math.round(width / 2), y: Math.round(height * 0.72) };
    if (id === "saas") return { an: 5, x: Math.round(width / 2), y: Math.round(height * 0.76) };
    if (id === "viral") return { an: 5, x: Math.round(width / 2), y: Math.round(height * 0.67) };
    if (id === "pop") return { an: 5, x: Math.round(width / 2), y: Math.round(height * 0.56) };
    if (id === "premium") return { an: 5, x: Math.round(width / 2), y: Math.round(height * 0.61) };
    return { an: 5, x: Math.round(width / 2), y: Math.round(height * 0.62) };
  }

  function styleLine(style, id, height) {
    var size = scaled(style.boyut, height);
    var outline = scaled(style.kontur || 0, height);
    var spacing = id === "premium" ? scaled(5, height) : id === "saas" ? scaled(.8, height) : id === "doc" ? scaled(0.6, height) : 0;
    return "Style: Suflo," + style.font + "," + size + "," + assColor(style.renk) + "," +
      assColor(style.renk) + "," + assColor(style.konturRenk) + "," + assColor("#000000", 0x80) +
      ",-1,0,0,0,100,100," + spacing + ",0,1," + outline + ",0," + (style.konum || 5) + ",90,90,70,1";
  }

  function header(style, id, width, height) {
    return [
      "[Script Info]", "; Suflo Stil Motoru v3", "ScriptType: v4.00+", "WrapStyle: 2",
      "ScaledBorderAndShadow: yes", "YCbCr Matrix: None", "PlayResX: " + width, "PlayResY: " + height, "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      styleLine(style, id, height), "", "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ];
  }

  // Konusmaci renkleri: compile() o konusmacinin satirlarini cizerken metnin basina {\1c...} koyar
  var renkOnek = "";
  function dialogue(layer, start, end, value) {
    return "Dialogue: " + layer + "," + timecode(start) + "," + timecode(end) + ",Suflo,,0,0,0,," + renkOnek + value;
  }

  function roundedRect(width, height, radius) {
    var w = Math.round(width), h = Math.round(height), r = Math.max(2, Math.round(radius));
    var k = Math.round(r * 0.55);
    return "m " + r + " 0 l " + (w - r) + " 0 b " + (w - k) + " 0 " + w + " " + k + " " + w + " " + r +
      " l " + w + " " + (h - r) + " b " + w + " " + (h - k) + " " + (w - k) + " " + h + " " + (w - r) + " " + h +
      " l " + r + " " + h + " b " + k + " " + h + " 0 " + (h - k) + " 0 " + (h - r) +
      " l 0 " + r + " b 0 " + k + " " + k + " 0 " + r + " 0";
  }

  function rect(width, height) {
    var w = Math.round(width), h = Math.round(height);
    return "m 0 0 l " + w + " 0 " + w + " " + h + " 0 " + h;
  }

  function shape(x, y, color, alpha, path, extra) {
    return "{\\an7\\pos(" + Math.round(x) + "," + Math.round(y) + ")\\bord0\\shad0\\1c" +
      assColor(color, alpha) + (extra || "") + "\\p1}" + path + "{\\p0}";
  }

  // accent/normal verilirse *vurgulu* kelimeler o renkte yazilir
  function balancedText(value, max, accent, normal) {
    var tokens = emphasisTokens(value);
    var words = tokens.map(function (t) { return t.w; });
    var parts = tokens.map(function (t) {
      return t.v && accent ? "{\\1c" + accent + "}" + esc(t.w) + "{\\1c" + normal + "}" : esc(t.w);
    });
    if (words.join(" ").length <= max || words.length < 3) return parts.join(" ");
    var best = 1, bestScore = 9999;
    for (var i = 1; i < words.length; i++) {
      var left = words.slice(0, i).join(" ").length;
      var right = words.slice(i).join(" ").length;
      var score = Math.abs(left - right) + (Math.max(left, right) > max ? 12 : 0);
      if (score < bestScore) { best = i; bestScore = score; }
    }
    return parts.slice(0, best).join(" ") + "\\N" + parts.slice(best).join(" ");
  }

  function viralMarkup(group, active, style, fontSize) {
    var normal = assColor(style.renk), accent = assColor(style.vurguRenk);
    var words = group.map(function (cue, index) {
      var word = esc(cue.text);
      if (index !== active) return cue.vurgu ? "{\\1c" + accent + "}" + word + "{\\1c" + normal + "}" : word;
      return "{\\1c" + accent + "\\fs" + Math.round(fontSize * 1.11) + "}" + word +
        "{\\1c" + normal + "\\fs" + fontSize + "}";
    });
    if (words.length >= 3) return words.slice(0, 2).join(" ") + "\\N" + words.slice(2).join(" ");
    return words.join(" ");
  }

  function viralPlain(group) {
    var words = group.map(function (cue) { return esc(cue.text); });
    return words.length >= 3 ? words.slice(0, 2).join(" ") + "\\N" + words.slice(2).join(" ") : words.join(" ");
  }

  function renderViral(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "viral", width, height);
    var fs0 = scaled(style.boyut, height), outline = Math.max(2, scaled(style.kontur, height));
    groupWords(cues, 3).forEach(function (group) {
      var fs = fitSize(fs0, group, group.length >= 3 ? 2 : 0, style, width, 1.12);
      var start = group[0].start, end = group[group.length - 1].end;
      var longest = group.reduce(function (n, cue) { return Math.max(n, String(cue.text).length); }, 4);
      var twoLines = group.length >= 3;
      var panelW = Math.min(alanW(width) * 0.76, Math.max(alanW(width) * 0.32, fs * (twoLines ? Math.max(5.8, longest * 1.35) : group.length * 3.4) + fs));
      var panelH = fs * (twoLines ? 2.35 : 1.45);
      var left = a.x - panelW / 2, top = a.y - panelH / 2;
      var radius = fs * 0.22, intro = Math.round(170 / factor);
      var panelPath = roundedRect(panelW, panelH, radius);
      var grow = "\\fscx94\\fscy94\\t(0," + intro + ",0.55,\\fscx100\\fscy100)\\fad(70,90)";
      events.push(dialogue(0, start, end, shape(left + fs * 0.08, top + fs * 0.1, "#00bff3", 0x35, panelPath, grow)));
      events.push(dialogue(1, start, end, shape(left, top, "#05070b", 0x18, panelPath, grow)));
      events.push(dialogue(2, start, end, shape(left + fs * 0.34, top - fs * 0.055, style.vurguRenk, 0x00,
        roundedRect(panelW * 0.22, fs * 0.09, fs * 0.04), "\\fad(90,90)")));

      group.forEach(function (cue, index) {
        var activeEnd = index + 1 < group.length ? group[index + 1].start : end;
        activeEnd = Math.max(cue.start + 0.08, activeEnd);
        var hit = Math.round(103 + factor * 3), hitMs = Math.round(105 / factor);
        var motion = "\\fscx96\\fscy96\\t(0," + hitMs + ",0.42,\\fscx" + hit + "\\fscy" + hit + ")" +
          "\\t(" + hitMs + "," + (hitMs + 85) + ",0.8,\\fscx100\\fscy100)";
        var baseTag = "{\\an5\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2" + motion;
        events.push(dialogue(3, cue.start, activeEnd, baseTag + "\\1c" + assColor("#00bff3", 0x45) +
          "\\3c" + assColor("#05070b") + "\\bord" + outline + "}" + viralPlain(group)));
        events.push(dialogue(4, cue.start, activeEnd, baseTag + "\\1c" + assColor(style.renk) +
          "\\3c" + assColor(style.konturRenk) + "\\bord" + outline + "\\shad" + Math.max(1, scaled(2, height)) + "}" +
          viralMarkup(group, index, style, fs)));
      });
    });
    return events;
  }

  function renderMrBeast(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "mrbeast", width, height);
    var fs0 = scaled(style.boyut, height), outline = Math.max(3, scaled(style.kontur, height));
    groupWords(cues, 3).forEach(function (group) {
      var fs = fitSize(fs0, group, group.length >= 3 ? 2 : 0, style, width, 1.12);
      var end = group[group.length - 1].end;
      group.forEach(function (cue, active) {
        var activeEnd = active + 1 < group.length ? group[active + 1].start : end;
        activeEnd = Math.max(cue.start + .08, activeEnd);
        var ms = Math.round(112 / factor), over = Math.round(108 + factor * 3);
        var motion = "\\fscx92\\fscy92\\t(0," + ms + ",0.38,\\fscx" + over + "\\fscy" + over + ")" +
          "\\t(" + ms + "," + (ms + 85) + ",0.78,\\fscx100\\fscy100)";
        var tag = "{\\an5\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2" + motion;
        var plain = viralPlain(group);
        // Creator kartlarindaki mavi derinlik ikinci bir metin katmanidir;
        // yalniz outline/shadow degildir, bu nedenle gercek sahnede okunur.
        events.push(dialogue(1, cue.start, activeEnd, tag + "\\1c" + assColor("#2f8cff") +
          "\\3c" + assColor("#05070b") + "\\bord" + outline + "\\shad" + scaled(6, height) +
          "\\xshad" + scaled(7, height) + "\\yshad" + scaled(8, height) + "}" + plain));
        events.push(dialogue(2, cue.start, activeEnd, tag + "\\1c" + assColor(style.renk) +
          "\\3c" + assColor(style.konturRenk) + "\\bord" + outline + "\\shad" + Math.max(1, scaled(2, height)) + "}" +
          viralMarkup(group, active, style, fs)));
        var underlineW = Math.max(fs * 1.2, Math.min(alanW(width) * .28, String(cue.text).length * fs * .54));
        events.push(dialogue(3, cue.start, activeEnd, shape(a.x - underlineW / 2, a.y + fs * .78,
          style.vurguRenk, 0x00, roundedRect(underlineW, Math.max(3, fs * .075), fs * .035),
          "\\fscx0\\t(0," + ms + ",0.55,\\fscx100)\\fad(0,70)")));
      });
    });
    return events;
  }

  function renderCapCut(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "capcut", width, height);
    var fs0 = scaled(style.boyut, height), outline = Math.max(1, scaled(style.kontur, height));
    groupWords(cues, 4).forEach(function (group) {
      // panel kadrajin %76'si: metin panele sigsin
      var fs = fitSize(fs0, group, group.length >= 3 ? 2 : 0, style, alanW(width) * .76 / .88, 1.12);
      var start = group[0].start, end = group[group.length - 1].end;
      var twoLines = group.length >= 3;
      var firstLine = group.slice(0, twoLines ? 2 : group.length).map(function (cue) { return String(cue.text); }).join(" ");
      var secondLine = twoLines ? group.slice(2).map(function (cue) { return String(cue.text); }).join(" ") : "";
      var lineChars = Math.max(firstLine.length, secondLine.length);
      var panelW = Math.min(alanW(width) * .76, Math.max(alanW(width) * .3, fs * (lineChars * .62 + 1.8)));
      var panelH = fs * (twoLines ? 2.45 : 1.48), left = a.x - panelW / 2, top = a.y - panelH / 2;
      var ms = Math.round(180 / factor), panel = roundedRect(panelW, panelH, fs * .38);
      events.push(dialogue(0, start, end, shape(left + scaled(4, height), top + scaled(7, height), "#000000", 0x4a,
        panel, "\\fad(" + ms + ",130)")));
      events.push(dialogue(1, start, end, shape(left, top, "#090b10", 0x24,
        panel, "\\fscy92\\t(0," + ms + ",0.62,\\fscy100)\\fad(" + ms + ",130)")));
      group.forEach(function (cue, active) {
        var activeEnd = active + 1 < group.length ? group[active + 1].start : end;
        activeEnd = Math.max(cue.start + .08, activeEnd);
        var motion = "\\fscx98\\fscy98\\t(0," + Math.round(95 / factor) + ",0.45,\\fscx102\\fscy102)" +
          "\\t(" + Math.round(95 / factor) + ",180,0.8,\\fscx100\\fscy100)";
        events.push(dialogue(2, cue.start, activeEnd, "{\\an5\\pos(" + a.x + "," + a.y + ")\\fs" + fs +
          "\\q2" + motion + "\\1c" + assColor(style.renk) + "\\3c" + assColor(style.konturRenk) +
          "\\bord" + outline + "}" + viralMarkup(group, active, style, fs)));
      });
    });
    return events;
  }

  function renderSaas(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "saas", width, height);
    var fs0 = scaled(style.boyut, height);
    groupWords(cues, 6).forEach(function (group) {
      var fs = fitSize(fs0, group, group.length >= 3 ? 2 : 0, style, alanW(width) * .78 / .88, 1.1);
      var start = group[0].start, end = group[group.length - 1].end;
      var twoLines = group.length >= 3;
      var firstLine = group.slice(0, twoLines ? 2 : group.length).map(function (cue) { return String(cue.text); }).join(" ");
      var secondLine = twoLines ? group.slice(2).map(function (cue) { return String(cue.text); }).join(" ") : "";
      var lineChars = Math.max(firstLine.length, secondLine.length);
      var panelW = Math.min(alanW(width) * .78, Math.max(alanW(width) * .36, fs * (lineChars * .6 + 2.4)));
      var panelH = fs * (twoLines ? 2.48 : 1.58), left = a.x - panelW / 2, top = a.y - panelH / 2;
      var radius = fs * .42, ms = Math.round(260 / factor), panel = roundedRect(panelW, panelH, radius);
      events.push(dialogue(0, start, end, shape(left + scaled(4, height), top + scaled(8, height), "#000000", 0x58,
        panel, "\\blur1.2\\fad(" + ms + ",220)")));
      // Dis cizgi + cam dolgu iki ayri vektor katmanidir.
      events.push(dialogue(1, start, end, shape(left - scaled(1, height), top - scaled(1, height), "#ffffff", 0xb4,
        roundedRect(panelW + scaled(2, height), panelH + scaled(2, height), radius + scaled(1, height)),
        "\\fscy94\\t(0," + ms + ",0.62,\\fscy100)\\fad(" + ms + ",220)")));
      events.push(dialogue(2, start, end, shape(left, top, "#161822", 0x28, panel,
        "\\fscy94\\t(0," + ms + ",0.62,\\fscy100)\\fad(" + ms + ",220)")));
      events.push(dialogue(3, start, end, shape(left + fs * .42, a.y - fs * .065, style.vurguRenk, 0x00,
        roundedRect(fs * .13, fs * .13, fs * .065), "\\fad(" + ms + ",220)")));
      group.forEach(function (cue, active) {
        var activeEnd = active + 1 < group.length ? group[active + 1].start : end;
        activeEnd = Math.max(cue.start + .08, activeEnd);
        var textX = a.x + fs * .16;
        events.push(dialogue(4, cue.start, activeEnd, "{\\an5\\move(" + Math.round(textX) + "," + Math.round(a.y + scaled(8, height)) + "," +
          Math.round(textX) + "," + Math.round(a.y) + ",0," + Math.round(150 / factor) + ")\\fs" + fs + "\\q2" +
          "\\1c" + assColor(style.renk) + "\\bord0\\shad0\\fad(70,150)}" + viralMarkup(group, active, style, fs)));
      });
    });
    return events;
  }

  function renderPop(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "pop", width, height);
    var fs = scaled(style.boyut * 1.18, height), outline = Math.max(1, scaled(style.kontur, height));
    var palettes = [
      { fill: "#ff4fc8", text: "#ffffff", accent: "#ffe45e" },
      { fill: "#42ddff", text: "#10131d", accent: "#ff4fc8" },
      { fill: "#ffe45e", text: "#15131c", accent: "#7657ff" },
      { fill: "#ff6b5f", text: "#ffffff", accent: "#42ddff" }
    ];
    var offsets = [[-0.08, -0.03], [0.07, 0.02], [-0.04, 0.04], [0.05, -0.035]];
    cues.forEach(function (cue, index) {
      var next = cues[index + 1], end = next ? next.start : cue.end;
      end = Math.max(cue.start + 0.24, end);
      var p = cue.vurgu ? { fill: style.vurguRenk, text: "#15131f", accent: "#ffffff" } : palettes[index % palettes.length], off = offsets[index % offsets.length];
      // Podcast Modu: konuşmacı rengi kartın dolgusu olur (metin rengi palet yazısını ezmesin diye
      // kart boyanır; yazı koyu / açık, okunur olanı)
      if (style.konusmaciRenk && !cue.vurgu) p = { fill: style.konusmaciRenk, text: parlaklik(style.konusmaciRenk) > 150 ? "#15131f" : "#ffffff", accent: p.accent };
      var cx = a.x + width * off[0], cy = a.y + height * off[1];
      var chars = Math.max(3, String(cue.text).length);
      var cardW = Math.min(alanW(width) * 0.58, Math.max(fs * 2.45, fs * (chars * 0.6 + 0.9)));
      var cardH = fs * 1.16, left = cx - cardW / 2, top = cy - cardH / 2;
      var radius = fs * 0.2, angle = (index % 2 ? 3.2 : -4.2) * factor;
      var ms = Math.round(135 / factor), over = Math.round(112 + 6 * factor);
      var org = "\\org(" + Math.round(cx) + "," + Math.round(cy) + ")\\frz" + angle;
      var pop = org + "\\fscx18\\fscy18\\t(0," + ms + ",0.42,\\fscx" + over + "\\fscy" + over + ")" +
        "\\t(" + ms + "," + (ms + 95) + ",0.78,\\fscx100\\fscy100)\\fad(0,80)";
      var path = roundedRect(cardW, cardH, radius);
      events.push(dialogue(0, cue.start, end, shape(left + fs * 0.11, top + fs * 0.13, "#15131f", 0x12, path, pop)));
      events.push(dialogue(1, cue.start, end, shape(left - fs * 0.055, top - fs * 0.055, "#ffffff", 0x00,
        roundedRect(cardW + fs * 0.11, cardH + fs * 0.11, radius + fs * 0.05), pop)));
      events.push(dialogue(2, cue.start, end, shape(left, top, p.fill, 0x00, path, pop)));

      // Bungee'yi libass usWin metrikleriyle (1647+927 / 1000) yaklasik yari boyda cizer:
      // yazi karti doldursun diye buyutulur, uzun kelimede kart genisligine sigdirilir
      var fsMetin = Math.round(Math.min(fs * 1.75, (cardW - fs * 0.5) / (chars * 0.75 * 0.39)));
      var textTag = "{\\an5\\pos(" + Math.round(cx) + "," + Math.round(cy) + ")\\fs" + fsMetin + org +
        "\\fscx18\\fscy18\\t(0," + ms + ",0.42,\\fscx" + over + "\\fscy" + over + ")" +
        "\\t(" + ms + "," + (ms + 95) + ",0.78,\\fscx100\\fscy100)\\fad(0,80)";
      events.push(dialogue(3, cue.start, end, textTag + "\\1c" + assColor("#15131f", 0x30) + "\\bord" + outline + "}" + esc(cue.text)));
      events.push(dialogue(4, cue.start, end, textTag + "\\1c" + assColor(p.text) + "\\3c" + assColor("#15131f") +
        "\\bord" + outline + "}" + esc(cue.text)));

      var confEnd = Math.min(end, cue.start + 0.52);
      [[-0.58, -0.55, 0.15, 0.055], [0.48, -0.5, 0.06, 0.17], [0.55, 0.5, 0.14, 0.05]].forEach(function (c, ci) {
        var cw = fs * c[2], ch = fs * c[3];
        var px = cx + cardW * c[0], py = cy + cardH * c[1];
        events.push(dialogue(5, cue.start, confEnd, shape(px, py, ci === 1 ? p.accent : "#ffffff", 0x00,
          roundedRect(cw, ch, Math.min(cw, ch) / 2), "\\frz" + ((ci - 1) * 32) + "\\fad(50,120)")));
      });
    });
    return events;
  }

  // balancedText'in en uzun satirinin karakter sayisi (ayni bolme kurali)
  function dengeliUzunluk(value, max) {
    var words = String(value || "").split(/\s+/).filter(Boolean);
    var tum = words.join(" ").length;
    if (tum <= max || words.length < 3) return tum;
    var best = tum, bestScore = 9999;
    for (var i = 1; i < words.length; i++) {
      var left = words.slice(0, i).join(" ").length, right = words.slice(i).join(" ").length;
      var score = Math.abs(left - right) + (Math.max(left, right) > max ? 12 : 0);
      if (score < bestScore) { best = Math.max(left, right); bestScore = score; }
    }
    return best;
  }

  function renderDoc(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "doc", width, height);
    var fsTemel = scaled(style.boyut, height);
    cues.forEach(function (cue) {
      // dar kadrajda (9:16) en uzun satir panele sigmiyorsa bu cue icin font kuculur
      var satirSiniri = width < height ? 22 : 38;   // dikeyde iki kisa satir, tek uzun minik satir degil
      var enUzun = dengeliUzunluk(stripEmphasis(cue.text), satirSiniri);
      var fs = Math.max(8, Math.min(fsTemel, Math.floor(alanW(width) * 0.76 / (enUzun * 0.53 + 0.72 * 2.35))));
      var pad = fs * 0.72;
      var markup = balancedText(cue.vurgu ? "*" + cue.text + "*" : cue.text, satirSiniri, assColor(style.vurguRenk), assColor(style.renk));
      cue = { start: cue.start, end: cue.end, text: stripEmphasis(cue.text) };
      var lines = markup.indexOf("\\N") !== -1 ? 2 : 1;
      var maxChars = String(cue.text).split(/\s+/).reduce(function (state, word) {
        var last = state.parts[state.parts.length - 1];
        if ((last + " " + word).trim().length > satirSiniri) state.parts.push(word);
        else state.parts[state.parts.length - 1] = (last + " " + word).trim();
        return state;
      }, { parts: [""] }).parts.reduce(function (n, part) { return Math.max(n, part.length); }, 10);
      var panelW = Math.min(alanW(width) * 0.76, Math.max(alanW(width) * 0.34, maxChars * fs * 0.53 + pad * 2.35));
      var panelH = lines * fs * 1.28 + pad * 1.25;
      var left = a.x, top = a.y - panelH;
      var ms = Math.round(360 / factor), slide = scaled(30, height);
      var move = "\\move(" + Math.round(left - slide) + "," + Math.round(top) + "," + Math.round(left) + "," + Math.round(top) + ",0," + ms + ")";
      events.push(dialogue(0, cue.start, cue.end, shape(left + scaled(8, height), top + scaled(10, height), "#000000", 0x48,
        roundedRect(panelW, panelH, fs * 0.12), "\\fad(" + ms + ",260)")));
      events.push(dialogue(1, cue.start, cue.end, shape(left, top, "#071016", 0x28,
        roundedRect(panelW, panelH, fs * 0.12), move + "\\fad(" + ms + ",260)")));
      events.push(dialogue(2, cue.start, cue.end, shape(left, top, style.vurguRenk, 0x00,
        roundedRect(fs * 0.08, panelH, fs * 0.03), "\\fscy0\\t(0," + ms + ",0.65,\\fscy100)\\fad(0,260)")));
      events.push(dialogue(2, cue.start, cue.end, shape(left + pad, top + pad * 0.52, style.vurguRenk, 0x30,
        rect(Math.min(panelW * 0.22, fs * 3.2), Math.max(1, scaled(2, height))), "\\fad(" + ms + ",260)")));
      events.push(dialogue(3, cue.start, cue.end, "{\\an7\\move(" + Math.round(left + pad - slide) + "," + Math.round(top + pad * 0.72) + "," +
        Math.round(left + pad) + "," + Math.round(top + pad * 0.72) + ",0," + ms + ")\\fs" + fs +
        "\\1c" + assColor(style.renk) + "\\3c" + assColor("#000000", 0x55) + "\\bord" + Math.max(0, scaled(0.6, height)) +
        "\\shad" + Math.max(1, scaled(1, height)) + "\\q2\\fad(" + ms + ",260)}" + markup));
    });
    return events;
  }

  function premiumMarkup(group, highlight, style) {
    var normal = assColor(style.renk), gold = assColor(style.vurguRenk);
    var words = group.map(function (cue, index) {
      return index === highlight || cue.vurgu ? "{\\1c" + gold + "}" + esc(cue.text) + "{\\1c" + normal + "}" : esc(cue.text);
    });
    if (words.length >= 4 || words.join(" ").length > 20) {
      var half = Math.ceil(words.length / 2);
      return words.slice(0, half).join(" ") + "\\N" + words.slice(half).join(" ");
    }
    return words.join(" ");
  }

  function renderPremium(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "premium", width, height);
    var fs0 = scaled(style.boyut, height);
    groupWords(cues, 4).forEach(function (group) {
      // metin \clip acilim penceresine (panelin %84'u) sigsin; premiumMarkup ile ayni kirilma
      var uzun = group.map(function (c) { return c.text; }).join(" ").length > 20;
      var br = group.length >= 4 || uzun ? Math.ceil(group.length / 2) : 0;
      if (br >= group.length) br = 0;
      var fs = fitSize(fs0, group, br, style, alanW(width) * 0.72 * 0.84 / 0.88, 1.15);
      var start = group[0].start, end = group[group.length - 1].end;
      var markup = premiumMarkup(group, meaningfulWord(group), style);
      var twoLines = markup.indexOf("\\N") !== -1;
      var panelW = alanW(width) * 0.72, panelH = fs * (twoLines ? 2.45 : 1.52);
      var left = a.x - panelW / 2, top = a.y - panelH / 2;
      var ms = Math.round(430 / factor), lineW = panelW * 0.25;
      events.push(dialogue(0, start, end, shape(left, top, "#050608", 0x62,
        roundedRect(panelW, panelH, fs * 0.08), "\\fad(" + ms + ",320)")));
      events.push(dialogue(1, start, end, shape(a.x - lineW - fs * 0.45, top + fs * 0.22, style.vurguRenk, 0x20,
        rect(lineW, Math.max(1, scaled(2, height))), "\\fscx0\\t(0," + ms + ",0.7,\\fscx100)\\fad(0,300)")));
      events.push(dialogue(1, start, end, shape(a.x + fs * 0.45, top + fs * 0.22, style.vurguRenk, 0x20,
        rect(lineW, Math.max(1, scaled(2, height))), "\\fscx0\\t(0," + ms + ",0.7,\\fscx100)\\fad(0,300)")));
      events.push(dialogue(2, start, end, shape(a.x - scaled(4, height), top + fs * 0.15, style.vurguRenk, 0x00,
        rect(scaled(8, height), scaled(8, height)), "\\frz45\\fad(" + ms + ",300)")));
      var revealL = Math.round(a.x - panelW * 0.42), revealR = Math.round(a.x + panelW * 0.42);
      events.push(dialogue(3, start, end, "{\\an5\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2" +
        "\\1c" + assColor(style.renk) + "\\3c" + assColor(style.konturRenk, 0x48) + "\\bord" + Math.max(1, scaled(style.kontur, height)) +
        "\\blur0.25\\fscx96\\fscy96\\clip(" + a.x + ",0," + a.x + "," + height + ")" +
        "\\t(0," + ms + ",0.62,\\fscx100\\fscy100\\clip(" + revealL + ",0," + revealR + "," + height + "))" +
        "\\fad(" + Math.round(ms * 0.55) + ",300)}" + markup));
    });
    return events;
  }

  /*
   * v3.0 stilleri icin yerlesim yardimcilari. Font boyutu kisa kenara gore
   * olceklenir (9:16'da yukseklige gore buyuyup kadrajdan tasmasin), 3+
   * kelimelik gruplar iki dengeli satira bolunur ve en uzun satir kadraj
   * genisliginin %88'ini asarsa boyut kucultulur.
   */
  // Katsayilar paket fontlariyla birlikte style-share.js'te (tek kaynak)
  var KARAKTER_GENISLIK = SS ? SS.widths() : { "Anton": .47, "Bebas Neue": .43, "Archivo Black": .72, "Montserrat": .64, "Bungee": .8, "Lora": .55 };

  function minScaled(value, width, height) {
    return Math.max(1, Math.round(Number(value || 1) * Math.min(width, height) / 1080));
  }

  // Grup icin satir kirilma indeksi (ikinci satirin ilk kelimesi); 0 = tek satir
  function breakIndex(group, minWords) {
    if (group.length < (minWords || 3)) return 0;
    var best = 1, bestScore = 1e9;
    for (var i = 1; i < group.length; i++) {
      var left = group.slice(0, i).map(function (c) { return c.text; }).join(" ").length;
      var right = group.slice(i).map(function (c) { return c.text; }).join(" ").length;
      var score = Math.abs(left - right);
      if (score < bestScore) { best = i; bestScore = score; }
    }
    return best;
  }

  function fitSize(fs, group, br, style, width, extra) {
    var k = KARAKTER_GENISLIK[style.font] || .62;
    var lines = br ? [group.slice(0, br), group.slice(br)] : [group];
    var longest = lines.reduce(function (n, ln) {
      return Math.max(n, ln.map(function (c) { return String(c.text); }).join(" ").length);
    }, 1);
    var maxW = alanW(width) * .88;
    var need = longest * fs * k * (extra || 1);
    return need > maxW ? Math.max(8, Math.floor(fs * maxW / need)) : fs;
  }

  // Kelimeleri birlestir; br indeksinde \N
  function joinWords(parts, br) {
    var out = "";
    for (var i = 0; i < parts.length; i++) {
      if (i > 0) out += (br && i === br) ? "\\N" : " ";
      out += parts[i];
    }
    return out;
  }

  // Hormozi: buyuk harf, aktif kelime sari/yesil donusumlu renk + pop
  function renderHormozi(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "hormozi", width, height);
    var outline = Math.max(3, minScaled(style.kontur, width, height));
    var renkler = [style.vurguRenk, "#3dff6e"];
    groupWords(cues, 3).forEach(function (group, gi) {
      var end = group[group.length - 1].end;
      var br = breakIndex(group, 3);
      var fs = fitSize(minScaled(style.boyut, width, height), group, br, style, width, 1.12);
      var vurgu = assColor(renkler[gi % 2]), normal = assColor(style.renk);
      group.forEach(function (cue, active) {
        var activeEnd = active + 1 < group.length ? group[active + 1].start : end;
        activeEnd = Math.max(cue.start + .08, activeEnd);
        var ms = Math.round(90 / factor), over = Math.round(112 + factor * 4);
        var words = group.map(function (c, i) {
          var w = esc(c.text);
          // anahtar kelime grup renginden bagimsiz hep ana vurgu renginde
          if (i !== active) return c.vurgu ? "{\\1c" + assColor(style.vurguRenk) + "}" + w + "{\\1c" + normal + "}" : w;
          return "{\\1c" + vurgu + "\\fscx86\\fscy86\\t(0," + ms + ",\\fscx" + over + "\\fscy" + over + ")" +
            "\\t(" + ms + "," + (ms + 80) + ",\\fscx100\\fscy100)}" + w + "{\\1c" + normal + "\\fscx100\\fscy100}";
        });
        events.push(dialogue(1, cue.start, activeEnd, "{\\an5\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2" +
          "\\1c" + normal + "\\3c" + assColor(style.konturRenk) + "\\bord" + outline +
          "\\shad" + minScaled(5, width, height) + "\\4c" + assColor("#000000", 0x60) + "}" + joinWords(words, br)));
      });
    });
    return events;
  }

  // Neon: bulanik renkli parilti katmani + ince cizgili metin; aktif kelime tam parlak
  function renderNeon(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "neon", width, height);
    var glow = assColor(style.vurguRenk), beyaz = assColor(style.renk);
    groupWords(cues, 4).forEach(function (group) {
      var start = group[0].start, end = group[group.length - 1].end;
      var br = breakIndex(group, 3);
      var fs = fitSize(minScaled(style.boyut, width, height), group, br, style, width);
      var plain = joinWords(group.map(function (c) { return esc(c.text); }), br);
      // Parilti: dolgu her zaman seffaf (\1a), yalniz bulanik kontur (\3a) titreyerek yanar.
      // \alpha kullanilmaz: \1a'yi ezip her kelimenin altina beyaz dolgu ciziyordu.
      var flicker = "\\3a&HFF&\\t(0,60,\\3a&H40&)\\t(60,110,\\3a&HB0&)\\t(110," + Math.round(200 / factor) + ",\\3a&H00&)";
      events.push(dialogue(0, start, end, "{\\an5\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2\\1a&HFF&" +
        "\\3c" + glow + "\\bord" + minScaled(10, width, height) + "\\blur" + minScaled(14, width, height) + "\\shad0" + flicker + "\\fad(0,180)}" + plain));
      group.forEach(function (cue, active) {
        var activeEnd = active + 1 < group.length ? group[active + 1].start : end;
        activeEnd = Math.max(cue.start + .08, activeEnd);
        // Soluk kelime: \1a ile yari saydam (libass \1c icindeki alfa baytini yok sayar)
        var words = group.map(function (c, i) {
          return (i === active || c.vurgu ? "{\\1a&H00&\\3c" + glow + "\\blur1}" : "{\\1a&H78&\\3c" + glow + "\\blur0}") + esc(c.text);
        });
        events.push(dialogue(1, cue.start, activeEnd, "{\\an5\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2" +
          "\\1c" + beyaz + "\\bord" + Math.max(1, minScaled(style.kontur, width, height)) + "\\shad0}" + joinWords(words, br)));
      });
    });
    return events;
  }

  // Daktilo: kelimeler sirayla belirir, sonda yanip sonen imlec
  function renderDaktilo(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "daktilo", width, height);
    var outline = Math.max(1, minScaled(style.kontur, width, height));
    var imlec = assColor(style.vurguRenk);
    groupWords(cues, 6).forEach(function (group) {
      var end = group[group.length - 1].end;
      var br = breakIndex(group, 4);
      var fs = fitSize(minScaled(style.boyut, width, height), group, br, style, width);
      group.forEach(function (cue, k) {
        var stepEnd = k + 1 < group.length ? group[k + 1].start : end;
        stepEnd = Math.max(cue.start + .06, stepEnd);
        // Gizli kelimeler de seffaf yazilir: satir duzeni sabit kalir, metin kaymaz
        var parts = group.map(function (c, i) {
          var w = esc(c.text);
          if (c.vurgu) w = "{\\1c" + imlec + "}" + w + "{\\1c" + assColor(style.renk) + "}";
          if (i < k) return w;
          if (i === k) return w + "{\\1c" + imlec + "\\t(0,260,\\alpha&HFF&)}_{\\alpha&HFF&}";
          return w;
        });
        events.push(dialogue(1, cue.start, stepEnd, "{\\an" + a.an + "\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2" +
          "\\1c" + assColor(style.renk) + "\\3c" + assColor(style.konturRenk) + "\\bord" + outline + "\\shad0}" + joinWords(parts, br)));
      });
    });
    return events;
  }

  // Ziplayan: son gelen kelime yukaridan dusup esneyerek oturur, oncekiler kalir
  function renderZiplama(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "ziplama", width, height);
    var outline = Math.max(2, minScaled(style.kontur, width, height));
    var vurgu = assColor(style.vurguRenk), normal = assColor(style.renk);
    groupWords(cues, 3).forEach(function (group) {
      var end = group[group.length - 1].end;
      var br = breakIndex(group, 3);
      var fs = fitSize(minScaled(style.boyut, width, height), group, br, style, width, 1.18);
      group.forEach(function (cue, k) {
        var stepEnd = k + 1 < group.length ? group[k + 1].start : end;
        stepEnd = Math.max(cue.start + .08, stepEnd);
        var t1 = Math.round(110 / factor), t2 = t1 + Math.round(90 / factor), t3 = t2 + 70;
        var words = group.map(function (c, i) {
          var w = esc(c.text);
          if (i > k) return "{\\alpha&HFF&}" + w + "{\\alpha&H00&}";
          if (i < k) return c.vurgu ? "{\\1c" + vurgu + "}" + w + "{\\1c" + normal + "}" : w;
          return "{\\1c" + vurgu + "\\fscx70\\fscy140\\t(0," + t1 + ",\\fscx118\\fscy82)" +
            "\\t(" + t1 + "," + t2 + ",\\fscx94\\fscy108)\\t(" + t2 + "," + t3 + ",\\fscx100\\fscy100)}" + w +
            "{\\1c" + normal + "\\fscx100\\fscy100}";
        });
        events.push(dialogue(1, cue.start, stepEnd, "{\\an5\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2" +
          "\\1c" + normal + "\\3c" + assColor(style.konturRenk) + "\\bord" + outline +
          "\\shad" + minScaled(4, width, height) + "}" + joinWords(words, br)));
      });
    });
    return events;
  }

  // Karaoke dolgu: \kf ile satir konusma hizinda soldan saga renklenir
  function renderDolgu(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "dolgu", width, height);
    var outline = Math.max(1, minScaled(style.kontur, width, height));
    groupWords(cues, 6).forEach(function (group) {
      var start = group[0].start, end = group[group.length - 1].end;
      var br = breakIndex(group, 4);
      var fs = fitSize(minScaled(style.boyut, width, height), group, br, style, width);
      var parts = group.map(function (c, i) {
        var next = group[i + 1];
        var dur = Math.max(.05, (next ? next.start : c.end) - c.start);
        // vurgulu kelime: dolmadan once de vurgu rengini tasir (\\2c), biraz buyuk
        if (c.vurgu) return "{\\kf" + Math.round(dur * 100) + "\\2c" + assColor(style.vurguRenk) + "\\fscx112\\fscy112}" +
          esc(c.text) + "{\\2c" + assColor(style.renk) + "\\fscx100\\fscy100}";
        return "{\\kf" + Math.round(dur * 100) + "}" + esc(c.text);
      });
      events.push(dialogue(1, start, end, "{\\an" + (a.an || 5) + "\\pos(" + a.x + "," + a.y + ")\\fs" + fs + "\\q2" +
        "\\1c" + assColor(style.vurguRenk) + "\\2c" + assColor(style.renk) +
        "\\3c" + assColor(style.konturRenk) + "\\bord" + outline + "\\shad" + minScaled(2, width, height) +
        "\\fad(" + Math.round(120 / factor) + ",120)}" + joinWords(parts, br)));
    });
    return events;
  }

  /*
   * Ince ayar degerleri ASS Style satirina ve etiketlere yazilir: once yeniden dogrulanir.
   * Gecersiz deger stilin kendi degerine duser. Ornek: font "Arial,0,0}{\\pos(0,0)" virgulle
   * ayrilan Style satirini bozuyordu. Gecerli degerlerde cikti bayt bayt ayni kalir.
   */
  var FONT_ADI = /^[A-Za-z0-9 ]{1,40}$/;
  var HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  function sayiMi(v) { return typeof v === "number" && isFinite(v); }
  function guvenliStil(preset, overrides) {
    var ov = overrides && typeof overrides === "object" ? overrides : {};
    var style = Object.assign({}, preset);
    Object.keys(ov).forEach(function (k) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") return;
      var v = ov[k];
      if (k === "font") { if (typeof v === "string" && FONT_ADI.test(v)) style.font = v; return; }
      if (k === "fontFile" || k === "guvenli") return;   // fontFile asagida yazi tipinden turetilir
      if (k === "renk" || k === "konturRenk" || k === "vurguRenk") { if (typeof v === "string" && HEX.test(v)) style[k] = v; return; }
      if (k === "boyut" || k === "kontur") { if (sayiMi(v) && v >= 0 && v <= 1000) style[k] = v; return; }
      if (k === "konum") { if (v === 1 || v === 2 || v === 5 || v === 8) style.konum = v; return; }
      if (k === "kutu") { style.kutu = !!v; return; }
      if (k === "animasyon" || k === "aile" || k === "yogunluk") { if (typeof v === "string" && /^[a-z0-9_-]{1,24}$/.test(v)) style[k] = v; return; }
    });
    // fontFile girdiden alinmaz: paket fontuysa dosyasi, stilin kendi fontuysa onunki, degilse yok
    if (SS && SS.hasFont(style.font)) style.fontFile = SS.fontFile(style.font);
    else if (style.font === preset.font) style.fontFile = preset.fontFile;
    else style.fontFile = undefined;
    return style;
  }

  // speakerColors: konusmaci sirasina gore "#rrggbb" dizisi; gecerli renk yoksa null (cikti degismez)
  function konusmaciRenkleri(liste) {
    if (!liste || typeof liste !== "object") return null;
    var out = [], var1 = false;
    for (var i = 0; i < Math.min(16, Number(liste.length) || 0); i++) {
      var v = liste[i];
      if (typeof v === "string" && HEX.test(v)) { out[i] = v; var1 = true; } else out[i] = null;
    }
    return var1 ? out : null;
  }
  function konusmaciKosulari(cues, renkler) {
    var kosular = [], son = null;
    cues.forEach(function (cue) {
      var r = typeof cue.speaker === "number" && renkler[cue.speaker] ? renkler[cue.speaker] : null;
      var anahtar = typeof cue.speaker === "number" ? cue.speaker : -1;
      if (!son || son.anahtar !== anahtar) { son = { anahtar: anahtar, renk: r, cues: [] }; kosular.push(son); }
      son.cues.push(cue);
    });
    return kosular;
  }

  function rgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }
  function parlaklik(hex) { var c = rgb(hex); return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
  // Algıya yakın RGB uzaklığı (0..~765)
  function renkUzakligi(a, b) {
    var x = rgb(a), y = rgb(b), rm = (x[0] + y[0]) / 2;
    var dr = x[0] - y[0], dg = x[1] - y[1], db = x[2] - y[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }
  var VURGU_YAKIN = 150;
  // Konuşmacı rengi stilin vurgu rengine yakınsa (sarı konuşmacı + sarı vurgu) etkin kelime ve
  // *anahtar kelime* kaybolur: o koşuda vurgu stilin asıl yazı rengine (çoğunlukla beyaz) geçer;
  // o da yakınsa beyaz, o da yakınsa koyu
  function konusmaciStili(style, renk) {
    var st = Object.assign({}, style, { renk: renk, konusmaciRenk: renk });
    if (renkUzakligi(renk, style.vurguRenk) < VURGU_YAKIN) {
      var adaylar = [style.renk, "#ffffff", "#15131f"];
      st.vurguRenk = adaylar[adaylar.length - 1];
      for (var i = 0; i < adaylar.length; i++) {
        if (renkUzakligi(renk, adaylar[i]) >= VURGU_YAKIN) { st.vurguRenk = adaylar[i]; break; }
      }
    }
    return st;
  }

  function compile(options) {
    options = options || {};
    var id = STYLES[options.styleId] ? options.styleId : "viral";
    var source = STYLES[id];
    var style = guvenliStil(source.style, options.overrides);
    var width = Math.max(320, Math.round(options.width || 1920));
    var height = Math.max(180, Math.round(options.height || 1080));
    var cues = normaliseCues(options.cues, options.offset);
    // Renk verilmediyse konusmaci alani hic kullanilmaz: varsayilan cikti bayt bayt ayni kalir
    if (!konusmaciRenkleri(options.speakerColors)) cues.forEach(function (c) { delete c.speaker; });
    // Kelime stilleri kelime cue'su ister: satir/birikimli altyazi once donusturulur
    if (wordBased(id)) {
      if (options.cueKind === "lines") cues = splitToWords(cues);
      else if (options.cueKind === "cumulative") cues = lastWords(cues);
    }
    if (wordBased(id) || options.cueKind === "words") cues = markEmphasis(cues);
    var factor = intensity(options.intensity || style.yogunluk);
    var events;
    var renkler = konusmaciRenkleri(options.speakerColors);
    olcekRef = Math.min(width, height);
    guvenliW = options.overrides && options.overrides.guvenli === true && height > width * 1.2 ? Math.round(width * 0.74) : 0;
    function ciz(liste, st) {
      if (id === "mrbeast") return renderMrBeast(liste, st, width, height, factor);
      if (id === "capcut") return renderCapCut(liste, st, width, height, factor);
      if (id === "saas") return renderSaas(liste, st, width, height, factor);
      if (id === "pop") return renderPop(liste, st, width, height, factor);
      if (id === "doc") return renderDoc(liste, st, width, height, factor);
      if (id === "premium") return renderPremium(liste, st, width, height, factor);
      if (id === "hormozi") return renderHormozi(liste, st, width, height, factor);
      if (id === "neon") return renderNeon(liste, st, width, height, factor);
      if (id === "daktilo") return renderDaktilo(liste, st, width, height, factor);
      if (id === "ziplama") return renderZiplama(liste, st, width, height, factor);
      if (id === "dolgu") return renderDolgu(liste, st, width, height, factor);
      return renderViral(liste, st, width, height, factor);
    }
    try {
    if (!renkler) events = ciz(cues, style);
    else {
      /*
       * Podcast Modu: ardışık aynı konuşmacılı cue'lar bir koşu olur; her koşu kendi
       * renginde çizilir (metin rengi = konuşmacı rengi, satır başında \1c). Rengi olmayan
       * konuşmacı ya da konuşmacısız cue stilin kendi renginde kalır.
       */
      events = [];
      konusmaciKosulari(cues, renkler).forEach(function (kosu) {
        var st = style;
        if (kosu.renk) { st = konusmaciStili(style, kosu.renk); renkOnek = "{\\1c" + assColor(kosu.renk) + "}"; }
        try { events = events.concat(ciz(kosu.cues, st)); } finally { renkOnek = ""; }
      });
    }
    var basliklar = header(style, id, width, height);
    } finally { olcekRef = 0; guvenliW = 0; renkOnek = ""; }

    return {
      id: id,
      version: 3,
      style: clone(style),
      fontFiles: [style.fontFile],
      ass: basliklar.concat(events).join("\n") + "\n",
      eventCount: events.length
    };
  }

  return {
    version: 3,
    preset: preset,
    list: list,
    has: has,
    wordBased: wordBased,
    splitToWords: splitToWords,
    lastWords: lastWords,
    markEmphasis: markEmphasis,
    stripEmphasis: stripEmphasis,
    compile: compile,
    GUVENLI_ALAN: GUVENLI_ALAN,
    assColor: assColor,
    timecode: timecode
  };
});
