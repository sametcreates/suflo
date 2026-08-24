/*
 * Suflo Stil Motoru v3
 *
 * Yedi preset yalnız renk/font değiştirmez. Her biri kendi kelime kurgusunu,
 * kompozisyonunu, arka plan katmanlarını ve hareket ritmini üretir. Motor DOM'a
 * ve Premiere'e bağımlı değildir; zamanlı cue'lardan katmanlı ASS döndürür.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloStyleEngine = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
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
      id: "capcut", name: "CapCut Clean", description: "Temiz kelime vurgusu ve kompakt pill",
      text: { maxlen: "k1", kase: "normal", punct: false },
      style: { aile: "capcut", yogunluk: "balanced", font: "Montserrat", fontFile: "Montserrat.ttf",
        boyut: 78, renk: "#ffffff", konturRenk: "#07090d", vurguRenk: "#b8ff5a",
        kontur: 1, konum: 5, kutu: true, animasyon: "capcut" }
    },
    saas: {
      id: "saas", name: "SaaS Glass", description: "Apple sadeliginde cam altyazi sistemi",
      text: { maxlen: "k1", kase: "normal", punct: true },
      style: { aile: "saas", yogunluk: "soft", font: "Montserrat", fontFile: "Montserrat.ttf",
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
      style: { aile: "premium", yogunluk: "soft", font: "Montserrat", fontFile: "Montserrat.ttf",
        boyut: 98, renk: "#f7f5ef", konturRenk: "#08090c", vurguRenk: "#d9bc74",
        kontur: 1, konum: 5, kutu: false, animasyon: "premium" }
    }
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
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
    return String(value || "").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\r?\n/g, "\\N");
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
      out.push({ start: start, end: end, text: value });
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
      if (current.length >= limit || gap > 0.7 || /[.!?…]$/.test(cue.text)) flush();
    });
    flush();
    return groups;
  }

  function meaningfulWord(group) {
    var ignore = /^(ve|ile|bir|bu|şu|o|da|de|mi|mı|mu|mü|için|ama|the|a|an|and|or|of|to)$/i;
    var best = 0, score = -99;
    group.forEach(function (cue, index) {
      var clean = String(cue.text || "").replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]/g, "");
      var value = clean.length + (/\d/.test(clean) ? 8 : 0) - (ignore.test(clean) ? 7 : 0);
      if (value > score) { best = index; score = value; }
    });
    return best;
  }

  function scaled(value, height) {
    return Math.max(1, Math.round(Number(value || 1) * height / 1080));
  }

  function anchor(style, id, width, height) {
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

  function dialogue(layer, start, end, value) {
    return "Dialogue: " + layer + "," + timecode(start) + "," + timecode(end) + ",Suflo,,0,0,0,," + value;
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

  function balancedText(value, max) {
    var words = String(value || "").split(/\s+/).filter(Boolean);
    if (String(value || "").length <= max || words.length < 3) return esc(value);
    var best = 1, bestScore = 9999;
    for (var i = 1; i < words.length; i++) {
      var left = words.slice(0, i).join(" ").length;
      var right = words.slice(i).join(" ").length;
      var score = Math.abs(left - right) + (Math.max(left, right) > max ? 12 : 0);
      if (score < bestScore) { best = i; bestScore = score; }
    }
    return esc(words.slice(0, best).join(" ")) + "\\N" + esc(words.slice(best).join(" "));
  }

  function viralMarkup(group, active, style, fontSize) {
    var normal = assColor(style.renk), accent = assColor(style.vurguRenk);
    var words = group.map(function (cue, index) {
      var word = esc(cue.text);
      if (index !== active) return word;
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
    var fs = scaled(style.boyut, height), outline = Math.max(2, scaled(style.kontur, height));
    groupWords(cues, 3).forEach(function (group) {
      var start = group[0].start, end = group[group.length - 1].end;
      var longest = group.reduce(function (n, cue) { return Math.max(n, String(cue.text).length); }, 4);
      var twoLines = group.length >= 3;
      var panelW = Math.min(width * 0.76, Math.max(width * 0.32, fs * (twoLines ? Math.max(5.8, longest * 1.35) : group.length * 3.4) + fs));
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
    var fs = scaled(style.boyut, height), outline = Math.max(3, scaled(style.kontur, height));
    groupWords(cues, 3).forEach(function (group) {
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
        var underlineW = Math.max(fs * 1.2, Math.min(width * .28, String(cue.text).length * fs * .54));
        events.push(dialogue(3, cue.start, activeEnd, shape(a.x - underlineW / 2, a.y + fs * .78,
          style.vurguRenk, 0x00, roundedRect(underlineW, Math.max(3, fs * .075), fs * .035),
          "\\fscx0\\t(0," + ms + ",0.55,\\fscx100)\\fad(0,70)")));
      });
    });
    return events;
  }

  function renderCapCut(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "capcut", width, height);
    var fs = scaled(style.boyut, height), outline = Math.max(1, scaled(style.kontur, height));
    groupWords(cues, 4).forEach(function (group) {
      var start = group[0].start, end = group[group.length - 1].end;
      var twoLines = group.length >= 3;
      var firstLine = group.slice(0, twoLines ? 2 : group.length).map(function (cue) { return String(cue.text); }).join(" ");
      var secondLine = twoLines ? group.slice(2).map(function (cue) { return String(cue.text); }).join(" ") : "";
      var lineChars = Math.max(firstLine.length, secondLine.length);
      var panelW = Math.min(width * .76, Math.max(width * .3, fs * (lineChars * .62 + 1.8)));
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
    var fs = scaled(style.boyut, height);
    groupWords(cues, 6).forEach(function (group) {
      var start = group[0].start, end = group[group.length - 1].end;
      var twoLines = group.length >= 3;
      var firstLine = group.slice(0, twoLines ? 2 : group.length).map(function (cue) { return String(cue.text); }).join(" ");
      var secondLine = twoLines ? group.slice(2).map(function (cue) { return String(cue.text); }).join(" ") : "";
      var lineChars = Math.max(firstLine.length, secondLine.length);
      var panelW = Math.min(width * .78, Math.max(width * .36, fs * (lineChars * .6 + 2.4)));
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
      var p = palettes[index % palettes.length], off = offsets[index % offsets.length];
      var cx = a.x + width * off[0], cy = a.y + height * off[1];
      var chars = Math.max(3, String(cue.text).length);
      var cardW = Math.min(width * 0.58, Math.max(fs * 2.45, fs * (chars * 0.6 + 0.9)));
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

      var textTag = "{\\an5\\pos(" + Math.round(cx) + "," + Math.round(cy) + ")\\fs" + fs + org +
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

  function renderDoc(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "doc", width, height);
    var fs = scaled(style.boyut, height), pad = fs * 0.72;
    cues.forEach(function (cue) {
      var markup = balancedText(cue.text, 38);
      var lines = markup.indexOf("\\N") !== -1 ? 2 : 1;
      var maxChars = String(cue.text).split(/\s+/).reduce(function (state, word) {
        var last = state.parts[state.parts.length - 1];
        if ((last + " " + word).trim().length > 38) state.parts.push(word);
        else state.parts[state.parts.length - 1] = (last + " " + word).trim();
        return state;
      }, { parts: [""] }).parts.reduce(function (n, part) { return Math.max(n, part.length); }, 10);
      var panelW = Math.min(width * 0.76, Math.max(width * 0.34, maxChars * fs * 0.53 + pad * 2.35));
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
      return index === highlight ? "{\\1c" + gold + "}" + esc(cue.text) + "{\\1c" + normal + "}" : esc(cue.text);
    });
    if (words.length >= 4 || words.join(" ").length > 20) {
      var half = Math.ceil(words.length / 2);
      return words.slice(0, half).join(" ") + "\\N" + words.slice(half).join(" ");
    }
    return words.join(" ");
  }

  function renderPremium(cues, style, width, height, factor) {
    var events = [], a = anchor(style, "premium", width, height);
    var fs = scaled(style.boyut, height);
    groupWords(cues, 4).forEach(function (group) {
      var start = group[0].start, end = group[group.length - 1].end;
      var markup = premiumMarkup(group, meaningfulWord(group), style);
      var twoLines = markup.indexOf("\\N") !== -1;
      var panelW = width * 0.72, panelH = fs * (twoLines ? 2.45 : 1.52);
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

  function compile(options) {
    options = options || {};
    var id = STYLES[options.styleId] ? options.styleId : "viral";
    var source = STYLES[id];
    var style = Object.assign({}, source.style, options.overrides || {});
    var width = Math.max(320, Math.round(options.width || 1920));
    var height = Math.max(180, Math.round(options.height || 1080));
    var cues = normaliseCues(options.cues, options.offset);
    var factor = intensity(options.intensity || style.yogunluk);
    var events;
    if (id === "mrbeast") events = renderMrBeast(cues, style, width, height, factor);
    else if (id === "capcut") events = renderCapCut(cues, style, width, height, factor);
    else if (id === "saas") events = renderSaas(cues, style, width, height, factor);
    else if (id === "pop") events = renderPop(cues, style, width, height, factor);
    else if (id === "doc") events = renderDoc(cues, style, width, height, factor);
    else if (id === "premium") events = renderPremium(cues, style, width, height, factor);
    else events = renderViral(cues, style, width, height, factor);

    return {
      id: id,
      version: 3,
      style: clone(style),
      fontFiles: [style.fontFile],
      ass: header(style, id, width, height).concat(events).join("\n") + "\n",
      eventCount: events.length
    };
  }

  return {
    version: 3,
    preset: preset,
    list: list,
    compile: compile,
    assColor: assColor,
    timecode: timecode
  };
});
