/*
 * Suflo Chapters — konuşmadan YouTube bölümleri
 *
 * Altyazı satırlarından (sequence zamanı) bölüm önerir, YouTube açıklamasına
 * yapıştırılacak metni üretir ve kuralları denetler (ilk bölüm 0:00, en az 3
 * bölüm, her biri en az 10 sn). Yapay zekâ başlıkları isteğe bağlıdır: istem
 * ve yanıt ayrıştırma burada, ağ çağrısı panelde.
 * Saf modül: DOM'a ve Premiere'e dokunmaz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloChapters = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var YT_MIN_LEN = 10;      // YouTube: her bölüm en az 10 sn
  var YT_MIN_COUNT = 3;     // YouTube: en az 3 bölüm

  // Başlığa girmemesi gereken açılış sözcükleri
  var ACILIS = /^(ve|ama|yani|şey|işte|evet|tamam|peki|hani|ee+|ıı+|hm+|so|and|but|okay|ok|um+|uh+)\b[\s,]*/i;

  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }

  function clean(segments) {
    return (segments || []).filter(function (s) {
      return s && String(s.text || "").trim() && isFinite(Number(s.start)) && isFinite(Number(s.end));
    }).map(function (s) {
      return { start: num(s.start), end: num(s.end), text: String(s.text).replace(/\s+/g, " ").trim() };
    }).sort(function (a, b) { return a.start - b.start; });
  }

  function tc(sec) {
    var t = Math.max(0, Math.floor(sec));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    var ss = (s < 10 ? "0" : "") + s;
    return h ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
  }

  // Satır metninden kısa, temiz bir başlık
  function titleFrom(text, maxWords, lang) {
    var s = String(text || "").replace(/[«»"“”]/g, "").trim();
    for (var i = 0; i < 3; i++) s = s.replace(ACILIS, "");
    var words = s.split(/\s+/).filter(Boolean).slice(0, maxWords || 6);
    var t = words.join(" ").replace(/[,;:…\-–—]+$/, "").replace(/[.!?]+$/, "");
    if (!t) return "";
    var loc = lang === "az" ? "az" : (lang === "tr" || !lang ? "tr" : undefined);
    return (loc ? t.charAt(0).toLocaleUpperCase(loc) : t.charAt(0).toUpperCase()) + t.slice(1);
  }

  /*
   * Kural tabanlı öneri: içerik süresine göre hedef bölüm sayısı seçilir;
   * aday sınırlar cümle sonu + uzun duraksama ile puanlanır, aralarında en az
   * minGap saniye kalacak biçimde en güçlüler seçilir.
   *   opts.every    hedef bölüm uzunluğu (sn) — varsayılan 90
   *   opts.minGap   iki bölüm arası en az (sn) — varsayılan 30
   *   opts.max      en fazla bölüm — varsayılan 12
   *   opts.origin   videonun 0:00'ı (sequence zamanı) — varsayılan 0
   */
  function suggest(segments, opts) {
    opts = opts || {};
    var segs = clean(segments);
    if (!segs.length) return [];
    var origin = opts.origin != null ? num(opts.origin) : 0;
    var every = opts.every || 90;
    var minGap = opts.minGap || 30;
    var max = opts.max || 12;
    var lang = opts.lang || "tr";
    var end = segs[segs.length - 1].end;
    var total = end - origin;
    var hedef = Math.max(1, Math.min(max, Math.round(total / every)));
    // YouTube en az 3 bolum ister: sigiyorsa (3 x minGap) kisa videoda da 3 oner
    if (hedef < 3 && total >= 3 * minGap) hedef = 3;

    var adaylar = [];
    for (var i = 1; i < segs.length; i++) {
      var bosluk = segs[i].start - segs[i - 1].end;
      var cumleSonu = /[.!?…]$/.test(segs[i - 1].text) ? 1 : 0;
      var puan = Math.min(bosluk, 4) + cumleSonu * 0.8;
      adaylar.push({ i: i, t: segs[i].start, puan: puan });
    }
    adaylar.sort(function (a, b) { return b.puan - a.puan || a.t - b.t; });

    var secilen = [];
    for (var k = 0; k < adaylar.length && secilen.length < hedef - 1; k++) {
      var a = adaylar[k];
      if (a.t - origin < minGap || end - a.t < minGap) continue;
      var yakin = secilen.some(function (x) { return Math.abs(x.t - a.t) < minGap; });
      if (!yakin) secilen.push(a);
    }
    secilen.sort(function (a, b) { return a.t - b.t; });

    var out = [{ time: origin, title: titleFrom(segs[0].text, 6, lang) || "Giriş" }];
    secilen.forEach(function (a) {
      out.push({ time: a.t, title: titleFrom(segs[a.i].text, 6, lang) || "Bölüm " + (out.length + 1) });
    });
    return out;
  }

  /*
   * YouTube kurallarını denetle. Doner: { ok, errors: [..] }
   */
  function validate(chapters, opts) {
    opts = opts || {};
    var origin = opts.origin != null ? num(opts.origin) : 0;
    var end = opts.end != null ? num(opts.end) : null;
    var errors = [];
    var list = (chapters || []).slice().sort(function (a, b) { return a.time - b.time; });
    if (list.length < YT_MIN_COUNT) errors.push("YouTube en az " + YT_MIN_COUNT + " bölüm ister.");
    if (list.length && Math.abs(list[0].time - origin) > 0.5) errors.push("İlk bölüm 0:00'da başlamalı.");
    for (var i = 0; i < list.length; i++) {
      var sonraki = i + 1 < list.length ? list[i + 1].time : end;
      if (sonraki != null && sonraki - list[i].time < YT_MIN_LEN) {
        errors.push("\"" + (list[i].title || tc(list[i].time - origin)) + "\" " + YT_MIN_LEN + " sn'den kısa.");
      }
      if (!String(list[i].title || "").trim()) errors.push(tc(list[i].time - origin) + " bölümünün başlığı boş.");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  // YouTube açıklamasına yapıştırılacak metin
  function format(chapters, opts) {
    opts = opts || {};
    var origin = opts.origin != null ? num(opts.origin) : 0;
    return (chapters || []).slice().sort(function (a, b) { return a.time - b.time; }).map(function (c, i) {
      var t = i === 0 ? 0 : c.time - origin;
      return tc(t) + " " + String(c.title || "").trim();
    }).join("\n");
  }

  /*
   * Yapay zekâ istemi: zaman damgalı, sıkıştırılmış transkript. Çok uzun
   * metinde satırlar eşit aralıkla seyreltilir (istem ~maxChars'ı aşmaz).
   */
  function buildPrompt(segments, opts) {
    opts = opts || {};
    var segs = clean(segments);
    var origin = opts.origin != null ? num(opts.origin) : 0;
    var maxChars = opts.maxChars || 14000;
    var lines = segs.map(function (s) { return "[" + Math.round(s.start - origin) + "] " + s.text; });
    var toplam = lines.reduce(function (a, l) { return a + l.length + 1; }, 0);
    if (toplam > maxChars) {
      var oran = maxChars / toplam;
      var adim = Math.max(1, Math.ceil(1 / oran));
      lines = lines.filter(function (l, i) { return i % adim === 0; });
    }
    var total = segs.length ? segs[segs.length - 1].end - origin : 0;
    var hedef = Math.max(3, Math.min(opts.max || 12, Math.round(total / (opts.every || 90))));
    var dil = { tr: "Turkish", az: "Azerbaijani", en: "English", ru: "Russian", de: "German", ar: "Arabic", es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese" }[opts.lang || "tr"] || "the transcript's language";
    return {
      system: "You split a video transcript into YouTube chapters. Reply ONLY with JSON " +
        "{\"chapters\":[{\"t\":seconds,\"title\":\"...\"}]}. The first chapter must have t=0. " +
        "Use about " + hedef + " chapters, each at least 30 seconds long, placed where the topic changes. " +
        "Titles: 2-6 words, in " + dil + ", catchy but accurate, no emojis, no numbering.",
      user: "Transcript lines as [seconds] text:\n" + lines.join("\n")
    };
  }

  /*
   * Yapay zekâ yanıtını ayrıştır; zamanları en yakın satır başına oturt,
   * çakışan / çok yakın olanları ele. Doner: [{time, title}] (sequence zamanı)
   */
  function parseResponse(content, segments, opts) {
    opts = opts || {};
    var origin = opts.origin != null ? num(opts.origin) : 0;
    var minGap = opts.minGap || YT_MIN_LEN;
    var segs = clean(segments);
    var data;
    try { data = typeof content === "string" ? JSON.parse(content) : content; } catch (e) { return []; }
    var raw = data && (data.chapters || data.Chapters);
    if (!(raw instanceof Array)) return [];
    var starts = segs.map(function (s) { return s.start; });
    var out = [];
    raw.forEach(function (c) {
      var t = Number(c && (c.t != null ? c.t : c.time));
      var title = String(c && (c.title || c.name) || "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!isFinite(t) || !title) return;
      var abs = origin + Math.max(0, t);
      if (starts.length) {
        abs = starts.reduce(function (best, s) { return Math.abs(s - abs) < Math.abs(best - abs) ? s : best; }, starts[0]);
      }
      out.push({ time: abs, title: title });
    });
    out.sort(function (a, b) { return a.time - b.time; });
    var temiz = [];
    out.forEach(function (c) {
      var son = temiz[temiz.length - 1];
      if (!son || c.time - son.time >= minGap) temiz.push(c);
    });
    if (temiz.length) temiz[0].time = origin;
    return temiz;
  }

  return {
    suggest: suggest,
    validate: validate,
    format: format,
    buildPrompt: buildPrompt,
    parseResponse: parseResponse,
    titleFrom: titleFrom,
    tc: tc
  };
});
