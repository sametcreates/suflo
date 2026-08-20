/*
 * Suflo Stil Motoru
 *
 * Altyazi editöründen ve DOM'dan bağımsızdır. Girdi olarak zamanlı cue'ları
 * alır, seçilen görsel aileye göre katmanlı ASS üretir. Premiere'e yerleştirme
 * captions.js'te kalır; bu dosyanın tek işi görüntünün nasıl görüneceğidir.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloStyleEngine = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var STYLES = {
    viral: {
      id: "viral", name: "Viral Vurgu", description: "Kısa ifade, güçlü aktif kelime",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "viral", yogunluk: "balanced", font: "Anton", fontFile: "Anton.ttf",
        boyut: 104, renk: "#ffffff", konturRenk: "#050505", vurguRenk: "#ffe14d",
        kontur: 8, konum: 5, kutu: false, animasyon: "viral" }
    },
    pop: {
      id: "pop", name: "Pop", description: "Renkli, tek kelimelik vuruşlar",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "pop", yogunluk: "hard", font: "Bungee", fontFile: "Bungee.ttf",
        boyut: 142, renk: "#ffe45e", konturRenk: "#090812", vurguRenk: "#ff4fc8",
        kontur: 7, konum: 5, kutu: false, animasyon: "pop" }
    },
    doc: {
      id: "doc", name: "Belgesel", description: "Sakin, zarif alt bant",
      text: { maxlen: "c60", kase: "normal", punct: true },
      style: { aile: "doc", yogunluk: "soft", font: "Lora", fontFile: "Lora.ttf",
        boyut: 54, renk: "#f7f2e8", konturRenk: "#05080d", vurguRenk: "#c5a96b",
        kontur: 0, konum: 1, kutu: true, animasyon: "doc" }
    },
    premium: {
      id: "premium", name: "Premium", description: "Minimal, sinematik tipografi",
      text: { maxlen: "k1", kase: "upper", punct: false },
      style: { aile: "premium", yogunluk: "soft", font: "Montserrat", fontFile: "Montserrat.ttf",
        boyut: 78, renk: "#f7f5ef", konturRenk: "#0a0b0e", vurguRenk: "#d7bd78",
        kontur: 2, konum: 5, kutu: false, animasyon: "premium" }
    }
  };

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function preset(id) { return STYLES[id] ? clone(STYLES[id]) : null; }
  function list() { return Object.keys(STYLES).map(function (id) { return preset(id); }); }

  function intensity(value) {
    if (value === "soft") return 0.72;
    if (value === "hard") return 1.24;
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

  function text(value) {
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
      end = Math.max(start + 0.05, end);
      out.push({ start: start, end: end, text: value });
    });
    return out;
  }

  function groupWords(cues, limit) {
    var groups = [], current = [];
    function flush() { if (current.length) { groups.push(current); current = []; } }
    cues.forEach(function (cue, i) {
      current.push(cue);
      var next = cues[i + 1];
      var gap = next ? next.start - cue.end : 99;
      if (current.length >= limit || gap > 0.72 || /[.!?…]$/.test(cue.text)) flush();
    });
    flush();
    return groups;
  }

  function meaningfulWord(group) {
    var ignore = /^(ve|ile|bir|bu|şu|o|da|de|mi|mı|mu|mü|için|ama|the|a|an|and|or|of|to)$/i;
    var best = 0, score = -99;
    group.forEach(function (cue, i) {
      var clean = String(cue.text || "").replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]/g, "");
      var s = clean.length + (/\d/.test(clean) ? 8 : 0) - (ignore.test(clean) ? 7 : 0);
      if (s > score) { best = i; score = s; }
    });
    return best;
  }

  function anchor(style, width, height) {
    var pos = Number(style.konum || 5);
    if (pos === 8) return { an: 8, x: Math.round(width / 2), y: Math.round(height * 0.17) };
    if (pos === 2) return { an: 2, x: Math.round(width / 2), y: Math.round(height * 0.84) };
    if (pos === 1) return { an: 1, x: Math.round(width * 0.105), y: Math.round(height * 0.86) };
    return { an: 5, x: Math.round(width / 2), y: Math.round(height * 0.58) };
  }

  function styleLine(style, id) {
    var isDoc = id === "doc";
    var borderStyle = isDoc ? 3 : 1;
    var outline = isDoc ? 14 : Number(style.kontur || 0);
    var shadow = isDoc ? 0 : (id === "pop" ? 5 : id === "viral" ? 4 : 3);
    var spacing = id === "premium" ? 4 : (id === "pop" ? 1 : id === "doc" ? 0.4 : 0);
    var back = assColor(isDoc ? "#05080d" : "#000000", isDoc ? 0x2b : 0x80);
    return "Style: Suflo," + style.font + "," + style.boyut + "," + assColor(style.renk) + "," +
      assColor(style.renk) + "," + assColor(style.konturRenk) + "," + back +
      ",-1,0,0,0,100,100," + spacing + ",0," + borderStyle + "," + outline + "," + shadow +
      "," + (style.konum || 5) + ",100,100,80,1";
  }

  function header(style, id, width, height) {
    return [
      "[Script Info]", "; Suflo Stil Motoru", "ScriptType: v4.00+", "WrapStyle: 2",
      "ScaledBorderAndShadow: yes", "YCbCr Matrix: None", "PlayResX: " + width, "PlayResY: " + height, "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      styleLine(style, id), "", "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ];
  }

  function dialogue(layer, start, end, value) {
    return "Dialogue: " + layer + "," + timecode(start) + "," + timecode(end) + ",Suflo,,0,0,0,," + value;
  }

  function activePhrase(group, active, style) {
    var base = assColor(style.renk), accent = assColor(style.vurguRenk);
    return group.map(function (cue, i) {
      var value = text(cue.text);
      return i === active ? "{\\1c" + accent + "}" + value + "{\\1c" + base + "}" : value;
    }).join(" ");
  }

  function renderViral(cues, style, width, height, factor) {
    var events = [], a = anchor(style, width, height);
    groupWords(cues, 3).forEach(function (group) {
      var groupEnd = group[group.length - 1].end;
      group.forEach(function (cue, i) {
        var end = i + 1 < group.length ? group[i + 1].start : groupEnd;
        if (end - cue.start < 0.01) end = cue.start + 0.01;
        var hit = Math.round(105 + 4 * factor), ms = Math.round(115 / factor);
        var tag = "{\\an" + a.an + "\\pos(" + a.x + "," + a.y + ")\\fscx94\\fscy94\\blur0.8" +
          "\\t(0," + ms + ",0.48,\\fscx" + hit + "\\fscy" + hit + "\\blur0)" +
          "\\t(" + ms + "," + (ms + 90) + ",0.82,\\fscx100\\fscy100)}";
        events.push(dialogue(1, cue.start, end, tag + activePhrase(group, i, style)));
      });
    });
    return events;
  }

  function renderPop(cues, style, width, height, factor) {
    var events = [], a = anchor(style, width, height);
    var palette = [style.vurguRenk, "#45e6ff", style.renk, "#ff6b6b"];
    cues.forEach(function (cue, i) {
      var next = cues[i + 1];
      var end = next ? next.start : cue.end;
      if (end - cue.start < 0.12) end = Math.max(cue.end, cue.start + 0.12);
      var ms = Math.round(120 / factor), overshoot = Math.round(119 + 8 * factor);
      var angle = Math.round((i % 2 ? 3.5 : -4.5) * factor);
      var tag = "{\\an" + a.an + "\\pos(" + a.x + "," + a.y + ")\\1c" + assColor(palette[i % palette.length]) +
        "\\3c" + assColor(style.konturRenk) + "\\bord" + style.kontur + "\\shad5\\frz" + angle +
        "\\fscx18\\fscy18\\blur1.6\\t(0," + ms + ",0.48,\\fscx" + overshoot + "\\fscy" + overshoot + "\\blur0)" +
        "\\t(" + ms + "," + (ms + 95) + ",0.8,\\fscx100\\fscy100\\frz0)\\fad(0,70)}";
      events.push(dialogue(1, cue.start, end, tag + text(cue.text)));
    });
    return events;
  }

  function renderDoc(cues, style, width, height, factor) {
    var events = [], a = anchor(style, width, height);
    cues.forEach(function (cue) {
      var rise = Math.round(18 * factor), ms = Math.round(330 / factor);
      var tag = "{\\an1\\move(" + a.x + "," + (a.y + rise) + "," + a.x + "," + a.y + ",0," + ms + ")" +
        "\\fad(" + ms + ",260)\\blur0.35}";
      var barX = a.x - Math.round(width * 0.025), barY = a.y - Math.round(height * 0.075);
      var bar = "{\\an7\\pos(" + barX + "," + barY + ")\\1c" + assColor(style.vurguRenk) +
        "\\fad(" + ms + ",260)\\p1}m 0 0 l 6 0 6 58 0 58{\\p0}";
      events.push(dialogue(0, cue.start, cue.end, bar));
      events.push(dialogue(1, cue.start, cue.end, tag + text(cue.text)));
    });
    return events;
  }

  function renderPremium(cues, style, width, height, factor) {
    var events = [], a = anchor(style, width, height);
    groupWords(cues, 4).forEach(function (group) {
      var start = group[0].start, end = group[group.length - 1].end;
      var hi = meaningfulWord(group), ms = Math.round(360 / factor);
      var startScale = Math.max(94, 100 - Math.round(4 * factor));
      var tag = "{\\an" + a.an + "\\pos(" + a.x + "," + a.y + ")\\fad(" + ms + ",280)" +
        "\\fscx" + startScale + "\\fscy" + startScale + "\\blur0.8" +
        "\\t(0," + ms + ",0.65,\\fscx100\\fscy100\\blur0.1)}";
      events.push(dialogue(1, start, end, tag + activePhrase(group, hi, style)));

      var lineWidth = Math.round(width * 0.16), lineX = a.x - Math.round(lineWidth / 2), lineY = a.y + Math.round(height * 0.075);
      var line = "{\\an7\\pos(" + lineX + "," + lineY + ")\\1c" + assColor(style.vurguRenk, 0x28) +
        "\\fad(" + ms + ",280)\\p1}m 0 0 l " + lineWidth + " 0 " + lineWidth + " 2 0 2{\\p0}";
      events.push(dialogue(0, start, end, line));
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
    if (id === "pop") events = renderPop(cues, style, width, height, factor);
    else if (id === "doc") events = renderDoc(cues, style, width, height, factor);
    else if (id === "premium") events = renderPremium(cues, style, width, height, factor);
    else events = renderViral(cues, style, width, height, factor);

    return {
      id: id,
      style: clone(style),
      fontFiles: [style.fontFile],
      ass: header(style, id, width, height).concat(events).join("\n") + "\n",
      eventCount: events.length
    };
  }

  return {
    version: 1,
    preset: preset,
    list: list,
    compile: compile,
    assColor: assColor,
    timecode: timecode
  };
});
