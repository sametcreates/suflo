/*
 * Suflo — B-roll önerileri
 *
 * Transkriptten, ara görüntü (B-roll) konması gereken anları ve stok video
 * sitelerinde aranacak İngilizce anahtar kelimeleri bulut LLM'iyle seçer.
 * Bu modül istemi kurar, yanıtı satır sınırlarına oturtur, çakışanları eler ve
 * Pexels / Pixabay arama bağlantılarını üretir. Saf modül: DOM'a ve ağa dokunmaz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloBroll = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var DIL = { tr: "Turkish", az: "Azerbaijani", en: "English", ru: "Russian", de: "German", ar: "Arabic",
    es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese" };

  function clean(segments) {
    return (segments || []).filter(function (s) {
      return s && String(s.text || "").trim() && isFinite(Number(s.start)) && isFinite(Number(s.end));
    }).map(function (s) {
      return { start: Number(s.start), end: Number(s.end), text: String(s.text).replace(/\*/g, "").replace(/\s+/g, " ").trim() };
    }).sort(function (a, b) { return a.start - b.start; });
  }

  /*
   * opts: { lang, adet (varsayılan süreye göre: dakikada ~1, 4-15), maxChars }
   * Model satır NUMARASI döndürür (uydurma saniye yerine var olan satır).
   */
  function buildPrompt(segments, opts) {
    opts = opts || {};
    var segs = clean(segments);
    var sure = segs.length ? segs[segs.length - 1].end - segs[0].start : 0;
    var adet = opts.adet || Math.max(4, Math.min(15, Math.round(sure / 60)));
    var lines = segs.map(function (s, i) { return "[" + i + "] " + s.text; });
    var maxChars = opts.maxChars || 14000, toplam = lines.join("\n").length, adim = 1;
    if (toplam > maxChars) {
      adim = Math.ceil(toplam / maxChars);
      lines = lines.filter(function (l, i) { return i % adim === 0; });
    }
    var dil = DIL[opts.lang] || "the transcript's language";
    return {
      system: "You are a video editor choosing B-roll (cutaway footage) for a talking-head video. Pick the " + adet +
        " lines where showing footage would help most: concrete objects, places, actions, data or examples the speaker mentions. " +
        "Skip greetings, opinions without a visual, and lines next to each other. For each, give 2-4 SHORT English stock-footage " +
        "search keywords (what to search on Pexels), and a short reason in " + dil + ". " +
        "Reply ONLY with JSON {\"broll\":[{\"line\":<line number>,\"keywords\":\"...\",\"why\":\"...\"}]} in transcript order.",
      user: "Transcript lines as [line number] text:\n" + lines.join("\n"),
      adim: adim
    };
  }

  /*
   * Yanıt -> [{ start, end, keywords, why, line }]. Aralık satırın başından en çok
   * maxDur (varsayılan 5 sn) sürer; birbirine minGap'ten (6 sn) yakın öneriler elenir.
   */
  function parseResponse(content, segments, opts) {
    opts = opts || {};
    var segs = clean(segments);
    if (!segs.length) return [];
    var data;
    try { data = typeof content === "string" ? JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) : content; } catch (e) { return []; }
    var raw = data && (data.broll || data.items || data.suggestions);
    if (!(raw instanceof Array)) return [];
    var maxDur = opts.maxDur || 5, minGap = opts.minGap != null ? opts.minGap : 6;
    var out = [];
    raw.forEach(function (r) {
      if (!r || typeof r !== "object" || r.line == null) return;
      var i = Math.round(Number(r.line));
      if (!isFinite(i) || i < 0 || i >= segs.length) return;
      var kw = (r.keywords instanceof Array ? r.keywords.join(", ") : String(r.keywords || ""))
        .replace(/[#*"]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!kw) return;
      var s = segs[i];
      out.push({
        line: i, start: s.start, end: Math.min(s.start + maxDur, Math.max(s.end, s.start + 1.5)),
        keywords: kw, why: String(r.why || "").replace(/\s+/g, " ").trim().slice(0, 140)
      });
    });
    out.sort(function (a, b) { return a.start - b.start; });
    var secilen = [];
    out.forEach(function (o) {
      var son = secilen[secilen.length - 1];
      if (son && o.start - son.start < minGap) return;
      secilen.push(o);
    });
    return secilen;
  }

  // Stok arama bağlantıları (ilk anahtar kelime öbeği)
  function searchUrls(keywords) {
    var q = String(keywords || "").split(",")[0].trim() || String(keywords || "").trim();
    var e = encodeURIComponent(q);
    return {
      pexels: "https://www.pexels.com/search/videos/" + e + "/",
      pixabay: "https://pixabay.com/videos/search/" + e + "/"
    };
  }

  return { buildPrompt: buildPrompt, parseResponse: parseResponse, searchUrls: searchUrls };
});
