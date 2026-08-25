/*
 * Suflo Caption Quality
 *
 * Transkripsiyon motorundan bagimsiz, deterministik altyazi kalite katmani.
 * Metni normalize eder, okunabilirlik/zamanlama sorunlarini bulur ve kullanici
 * isterse satirlari guvenli sinirlara getirir. Node testleri ve CEP ayni kodu
 * calistirsin diye UMD olarak yazildi.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloCaptionQuality = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var VERSION = 1;

  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : (fallback || 0);
  }

  function copySegment(s) {
    var out = {};
    Object.keys(s || {}).forEach(function (k) { out[k] = s[k]; });
    out.start = num(out.start, 0);
    out.end = num(out.end, out.start);
    out.text = String(out.text || "");
    return out;
  }

  function locale(lang) {
    lang = String(lang || "").toLowerCase();
    return lang === "tr" || lang === "az" ? lang : undefined;
  }

  function capitalize(text, lang) {
    var loc = locale(lang);
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (/[A-Za-z\u00c0-\u024f\u0400-\u04ff]/.test(ch)) {
        var up = loc ? ch.toLocaleUpperCase(loc) : ch.toUpperCase();
        return text.slice(0, i) + up + text.slice(i + 1);
      }
    }
    return text;
  }

  function normalizeText(text, lang) {
    var s = String(text || "")
      .replace(/[\t\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([!?;:])([^\s!?;:])/g, "$1 $2")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/([!?])\1{2,}/g, "$1$1")
      .replace(/\.{4,}/g, "…")
      .trim();
    return capitalize(s, lang);
  }

  function maxChars(options) {
    var m = parseInt(options && options.maxChars, 10);
    return m > 10 ? m : 42;
  }

  function issue(code, level, label) {
    return { code: code, level: level, label: label };
  }

  function inspectSegment(s, index, all, options) {
    options = options || {};
    var start = num(s && s.start, 0);
    var end = num(s && s.end, start);
    var text = String(s && s.text || "").trim();
    var dur = Math.max(0, end - start);
    var cps = dur > 0 ? text.length / dur : 0;
    var issues = [];
    var wordMode = !!options.wordMode;
    var next = all && all[index + 1];
    var confidence = s && s.confidence !== undefined ? num(s.confidence, 1) : null;

    if (!text) issues.push(issue("empty", "bad", "Boş satır"));
    if (end <= start) issues.push(issue("time", "bad", "Geçersiz süre"));
    if (next && end > num(next.start, end) + 0.015) issues.push(issue("overlap", "bad", "Sonraki satırla çakışıyor"));
    if (!wordMode && dur > 0 && dur < 0.55) issues.push(issue("short", "warn", "Ekranda çok kısa kalıyor"));
    if (!wordMode && dur > 7.0) issues.push(issue("long-time", "warn", "Ekranda gereğinden uzun kalıyor"));
    if (!wordMode && text.length > maxChars(options)) issues.push(issue("long-text", "warn", "Satır çok uzun"));
    if (!wordMode && cps > 22) issues.push(issue("fast", "bad", "Okuma hızı çok yüksek"));
    else if (!wordMode && cps > 18) issues.push(issue("fast", "warn", "Hızlı okunuyor"));
    if (/\s{2,}|\s+[,.!?;:]/.test(String(s && s.text || ""))) issues.push(issue("spacing", "warn", "Boşluk düzeni bozuk"));
    if (/\b([^\s]+)(?:\s+\1){2,}\b/i.test(text)) issues.push(issue("repeat", "warn", "Tekrarlanan kelime"));
    if (confidence !== null && confidence < 0.62) issues.push(issue("confidence", "bad", "Motor bu metinden emin değil"));
    else if (confidence !== null && confidence < 0.78) issues.push(issue("confidence", "warn", "Kontrol edilmesi önerilir"));

    return {
      index: index,
      duration: dur,
      chars: text.length,
      words: text ? text.split(/\s+/).length : 0,
      cps: cps,
      confidence: confidence,
      issues: issues,
      bad: issues.some(function (x) { return x.level === "bad"; }),
      flagged: issues.length > 0
    };
  }

  function analyze(segments, options) {
    var list = segments || [];
    var rows = list.map(function (s, i) { return inspectSegment(s, i, list, options); });
    var bad = 0, warn = 0, words = 0, chars = 0, duration = 0, flagged = 0;
    rows.forEach(function (r) {
      words += r.words;
      chars += r.chars;
      duration += r.duration;
      if (r.flagged) flagged++;
      r.issues.forEach(function (x) { if (x.level === "bad") bad++; else warn++; });
    });
    var score = Math.max(0, Math.min(100, Math.round(100 - bad * 12 - warn * 4 - (list.length ? flagged / list.length * 8 : 0))));
    return {
      version: VERSION,
      rows: rows,
      total: list.length,
      words: words,
      chars: chars,
      duration: duration,
      flagged: flagged,
      bad: bad,
      warn: warn,
      avgCps: duration > 0 ? chars / duration : 0,
      score: score
    };
  }

  function splitText(text, limit) {
    var words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var out = [], line = "";
    words.forEach(function (w) {
      var candidate = line ? line + " " + w : w;
      if (line && candidate.length > limit) { out.push(line); line = w; }
      else line = candidate;
    });
    if (line) out.push(line);
    return out;
  }

  function splitOverlong(segments, options) {
    var out = [];
    var limit = maxChars(options);
    (segments || []).forEach(function (source) {
      var s = copySegment(source);
      var parts = splitText(s.text, limit);
      if (parts.length <= 1) { out.push(s); return; }
      var totalChars = parts.reduce(function (n, p) { return n + Math.max(1, p.length); }, 0);
      var cursor = s.start;
      parts.forEach(function (part, i) {
        var share = Math.max(1, part.length) / totalChars;
        var end = i === parts.length - 1 ? s.end : cursor + Math.max(0.25, (s.end - s.start) * share);
        if (end > s.end) end = s.end;
        var piece = copySegment(s);
        piece.start = cursor;
        piece.end = Math.max(cursor + 0.12, end);
        piece.text = part;
        out.push(piece);
        cursor = piece.end;
      });
    });
    return out;
  }

  function fixTiming(segments, options) {
    options = options || {};
    var gap = options.wordMode ? 0.01 : 0.08;
    var minDur = options.wordMode ? 0.08 : 0.60;
    var out = (segments || []).map(copySegment).sort(function (a, b) { return a.start - b.start; });
    out.forEach(function (s, i) {
      s.start = Math.max(0, s.start);
      s.end = Math.max(s.start + minDur, s.end);
      var next = out[i + 1];
      if (next && s.end > next.start - gap) {
        var clipped = next.start - gap;
        s.end = clipped > s.start + (options.wordMode ? 0.04 : 0.25) ? clipped : Math.max(s.start + (options.wordMode ? 0.04 : 0.25), next.start);
      }
    });
    return out;
  }

  function autoFix(segments, options) {
    options = options || {};
    var out = (segments || []).map(function (source) {
      var s = copySegment(source);
      s.text = normalizeText(s.text, options.lang);
      return s;
    }).filter(function (s) { return !!s.text; });
    if (!options.wordMode) out = splitOverlong(out, options);
    return fixTiming(out, options);
  }

  return {
    version: VERSION,
    normalizeText: normalizeText,
    inspectSegment: inspectSegment,
    analyze: analyze,
    splitText: splitText,
    splitOverlong: splitOverlong,
    fixTiming: fixTiming,
    autoFix: autoFix
  };
});
