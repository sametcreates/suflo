/*
 * Suflo Highlights — viral anlar (Shorts / Reels / TikTok bulucu)
 *
 * Uzun bir konuşmanın altyazısından kendi başına anlam taşıyan, güçlü bir
 * kancayla başlayan 15-60 sn'lik bölümleri seçer. Seçimi bulut LLM yapar
 * (çeviriyle aynı anahtar); istem, yanıt ayrıştırma ve sınır denetimi burada.
 * Aralıklar her zaman satır sınırlarına oturtulur — cümle ortasından kesilmez.
 * Saf modül: DOM'a, ağa ve Premiere'e dokunmaz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloHighlights = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var VARSAYILAN = { minDur: 15, maxDur: 60, adet: 5 };

  function num(v) { v = Number(v); return isFinite(v) ? v : NaN; }

  function clean(segments) {
    return (segments || []).filter(function (s) {
      return s && String(s.text || "").trim() && isFinite(Number(s.start)) && isFinite(Number(s.end));
    }).map(function (s) {
      return { start: Number(s.start), end: Number(s.end), text: String(s.text).replace(/\s+/g, " ").trim() };
    }).sort(function (a, b) { return a.start - b.start; });
  }

  /*
   * LLM istemi: numaralı satırlar ([i] [sn] metin). Model satır NUMARASI döndürür;
   * saniye döndürmesinden daha güvenilir (uydurma zaman yerine var olan sınır).
   */
  function buildPrompt(segments, opts) {
    opts = opts || {};
    var segs = clean(segments);
    var minDur = opts.minDur || VARSAYILAN.minDur, maxDur = opts.maxDur || VARSAYILAN.maxDur;
    var adet = opts.adet || VARSAYILAN.adet;
    var maxChars = opts.maxChars || 16000;
    var lines = segs.map(function (s, i) { return "[" + i + "] [" + Math.round(s.start) + "s] " + s.text; });
    // Cok uzun metin: satirlari esit aralikla seyrelt (numaralar korunur)
    var toplam = lines.reduce(function (a, l) { return a + l.length + 1; }, 0);
    var adim = 1;
    if (toplam > maxChars) {
      adim = Math.ceil(toplam / maxChars);
      lines = lines.filter(function (l, i) { return i % adim === 0; });
    }
    var dil = { tr: "Turkish", az: "Azerbaijani", en: "English", ru: "Russian", de: "German", ar: "Arabic", es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese" }[opts.lang || "tr"] || "the transcript's language";
    return {
      system: "You are a short-form video editor. From a long talk transcript, pick the " + adet +
        " best standalone clips for YouTube Shorts / Reels / TikTok. Each clip must: start with a strong hook " +
        "(a surprising claim, question, or emotional line), make sense without the rest of the video, end on a " +
        "complete thought, and last " + minDur + "-" + maxDur + " seconds. Do not overlap clips. " +
        "Reply ONLY with JSON {\"clips\":[{\"from\":<first line number>,\"to\":<last line number>," +
        "\"title\":\"<catchy title, max 7 words, in " + dil + ">\",\"hook\":\"<why it works, max 12 words, in " + dil +
        ">\",\"score\":<1-10 virality>}]} ordered by score, best first.",
      user: "Transcript lines as [line number] [start seconds] text:\n" + lines.join("\n"),
      // seyreltme adimi: model yalniz her adim'inci satiri gordu (parseResponse'a verilir)
      adim: adim
    };
  }

  /*
   * Yanıtı ayrıştır ve denetle. Doner: [{ start, end, title, hook, score, from, to }]
   *   - satır numaraları geçerli aralığa sıkıştırılır, from>to ise yer değişir
   *   - süre minDur'dan kısaysa komşu satırlarla uzatılır, maxDur'dan uzunsa kırpılır
   *     (her zaman satır sınırında)
   *   - üst üste binenlerden puanı yüksek olan kalır
   */
  function parseResponse(content, segments, opts) {
    opts = opts || {};
    var segs = clean(segments);
    if (!segs.length) return [];
    var minDur = opts.minDur || VARSAYILAN.minDur, maxDur = opts.maxDur || VARSAYILAN.maxDur;
    var data;
    try { data = typeof content === "string" ? JSON.parse(content) : content; } catch (e) { return []; }
    var raw = data && (data.clips || data.Clips || data.highlights);
    if (!(raw instanceof Array)) return [];
    var son = segs.length - 1;
    var adim = Math.max(1, Math.round(Number(opts.adim) || 1));
    var adaylar = [];
    raw.forEach(function (c) {
      // null / eksik girdi: atla (num(null) 0 olur ve modelin secmedigi bir klip uretirdi)
      if (!c || typeof c !== "object" || c.from == null || c.to == null) return;
      var a = Math.round(num(c.from)), b = Math.round(num(c.to));
      if (!isFinite(a) || !isFinite(b)) return;
      if (a > b) { var t = a; a = b; b = t; }
      a = Math.max(0, Math.min(son, a));
      b = Math.max(0, Math.min(son, b));
      // Seyreltilmis istemde model "to" olarak gordugu son satiri verdi; dusunce
      // gizli satirlarda (to+1 .. to+adim-1) suruyor olabilir: o satirlari da kapsa
      if (adim > 1) b = Math.min(son, b + adim - 1);
      // cok kisa: once sona dogru uzat; sona eklemek ust siniri asacaksa (uzun bosluk)
      // basa dogru uzat
      while (segs[b].end - segs[a].start < minDur && (b < son || a > 0)) {
        var ileri = b < son && segs[b + 1].end - segs[a].start <= maxDur;
        if (ileri) b++;
        else if (a > 0) a--;
        else if (b < son) b++;
        else break;
      }
      // cok uzun: sondan kirp (kanca basta kalsin)
      while (segs[b].end - segs[a].start > maxDur && b > a) b--;
      var dur = segs[b].end - segs[a].start;
      if (dur < Math.min(minDur, segs[son].end - segs[0].start) - 0.01 || dur > maxDur + 0.01) return;
      var title = String(c.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
      var score = num(c.score);
      adaylar.push({
        from: a, to: b, start: segs[a].start, end: segs[b].end,
        title: title || ("Klip " + (adaylar.length + 1)),
        hook: String(c.hook || "").replace(/\s+/g, " ").trim().slice(0, 140),
        score: isFinite(score) ? Math.max(1, Math.min(10, score)) : 5
      });
    });
    // puana gore sirala, cakisanlari ele
    adaylar.sort(function (x, y) { return y.score - x.score || x.start - y.start; });
    var secilen = [];
    adaylar.forEach(function (c) {
      var cakisir = secilen.some(function (s) { return c.start < s.end - 0.01 && s.start < c.end - 0.01; });
      if (!cakisir) secilen.push(c);
    });
    return secilen;
  }

  // Sonuç metni (kopyalanabilir liste)
  function format(clips) {
    function tc(sec) {
      var t = Math.max(0, Math.floor(sec)), m = Math.floor(t / 60), s = t % 60;
      return m + ":" + (s < 10 ? "0" : "") + s;
    }
    return (clips || []).map(function (c, i) {
      return (i + 1) + ". " + c.title + " (" + tc(c.start) + "–" + tc(c.end) + ", " +
        Math.round(c.end - c.start) + " sn)" + (c.hook ? " — " + c.hook : "");
    }).join("\n");
  }

  return { VARSAYILAN: VARSAYILAN, buildPrompt: buildPrompt, parseResponse: parseResponse, format: format };
});
