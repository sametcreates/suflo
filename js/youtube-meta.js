/*
 * Suflo — YouTube metni: başlık önerileri, açıklama, etiketler, hashtag'ler
 *
 * Transkriptten bulut LLM'iyle (çeviriyle aynı anahtar) üretilir. Bu modül
 * istemi kurar, yanıtı YouTube sınırlarına göre temizler ve bölümlerle birlikte
 * yapıştırılmaya hazır açıklamayı birleştirir. Saf modül: DOM'a ve ağa dokunmaz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloYouTubeMeta = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // YouTube sınırları
  var SINIR = { baslik: 100, aciklama: 5000, etiketToplam: 500, hashtag: 3 };
  var DIL = { tr: "Turkish", az: "Azerbaijani", en: "English", ru: "Russian", de: "German", ar: "Arabic",
    es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese" };

  function metin(segments, maxChars) {
    var t = (segments || []).map(function (s) {
      return String(s && s.text || "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
    }).filter(Boolean).join(" ");
    maxChars = maxChars || 12000;
    if (t.length <= maxChars) return t;
    // baş (vaat) + eşit aralıklı örnekler: konu bütün videoya yayılır
    var bas = t.slice(0, Math.round(maxChars * 0.5)), kalan = t.slice(Math.round(maxChars * 0.5));
    var parca = 6, boy = Math.round(maxChars * 0.5 / parca), adim = Math.floor(kalan.length / parca), ornek = [];
    for (var i = 0; i < parca; i++) ornek.push(kalan.substr(i * adim, boy));
    return bas + " … " + ornek.join(" … ");
  }

  function buildPrompt(segments, opts) {
    opts = opts || {};
    var dil = DIL[opts.lang] || "the transcript's language";
    return {
      system: "You are a YouTube SEO copywriter. From the video transcript, write in " + dil + ": " +
        "5 title options (max 70 characters, curiosity + clear benefit, no clickbait lies, no ALL CAPS, no emojis); " +
        "a description of 2 short paragraphs (what the viewer learns, then who it is for) without timestamps, links or hashtags; " +
        "12-20 search tags (short phrases people actually search, most specific first); 3 hashtags. " +
        "Reply ONLY with JSON {\"titles\":[...],\"description\":\"...\",\"tags\":[...],\"hashtags\":[...]}.",
      user: "Transcript:\n" + metin(segments, opts.maxChars)
    };
  }

  function temizSatir(s) {
    return String(s == null ? "" : s).replace(/\*\*?/g, "").replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
      .replace(/\s+/g, " ").trim();
  }

  function parseResponse(content) {
    var data;
    try { data = typeof content === "string" ? JSON.parse(content) : content; } catch (e) { return null; }
    if (!data || typeof data !== "object") return null;
    var gorulen = {};
    var basliklar = (data.titles instanceof Array ? data.titles : []).map(temizSatir).filter(function (t) {
      var k = t.toLocaleLowerCase("tr");
      if (!t || gorulen[k]) return false;
      gorulen[k] = 1;
      return true;
    }).map(function (t) { return t.length > SINIR.baslik ? t.slice(0, SINIR.baslik - 1).replace(/\s+\S*$/, "") + "…" : t; }).slice(0, 5);

    var aciklama = String(data.description == null ? "" : data.description).replace(/\r\n/g, "\n")
      .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\n{3,}/g, "\n\n").trim();

    // etiketler: virgulsuz, tekrarsiz, toplam 500 karakter (YouTube virgulleri de sayar)
    var etiketler = [], toplam = 0, eg = {};
    (data.tags instanceof Array ? data.tags : String(data.tags || "").split(",")).forEach(function (t) {
      t = temizSatir(t).replace(/^#/, "").replace(/[,<>]/g, " ").replace(/\s+/g, " ").trim();
      var k = t.toLocaleLowerCase("tr");
      if (!t || t.length > 60 || eg[k]) return;
      var ek = t.length + (etiketler.length ? 1 : 0) + (/\s/.test(t) ? 2 : 0);   // bosluklu etiket tirnakla sayilir
      if (toplam + ek > SINIR.etiketToplam) return;
      eg[k] = 1; etiketler.push(t); toplam += ek;
    });

    var hg = {};
    var hashtagler = (data.hashtags instanceof Array ? data.hashtags : []).map(function (h) {
      // bosluk ve noktalama hashtag'i keser: tek kelimeye indir
      var t = temizSatir(h).replace(/^#+/, "").replace(/[\s.,!?;:'"()\[\]{}#]+/g, "");
      return t ? "#" + t : "";
    }).filter(function (h) {
      var k = h.toLocaleLowerCase("tr");
      if (!h || hg[k]) return false;
      hg[k] = 1;
      return true;
    }).slice(0, SINIR.hashtag);

    if (!basliklar.length && !aciklama) return null;
    return { basliklar: basliklar, aciklama: aciklama, etiketler: etiketler, hashtagler: hashtagler };
  }

  /*
   * Yapıştırılmaya hazır açıklama: metin + (varsa) bölümler + hashtag'ler.
   * 5000 karakteri aşarsa önce açıklama metni kısaltılır; bölümler bozulmaz.
   */
  function compose(o) {
    o = o || {};
    var bolum = String(o.bolumler || "").trim();
    var etiket = (o.hashtagler || []).join(" ");
    var parcalar = [];
    var govde = String(o.aciklama || "").trim();
    var sabit = (bolum ? bolum.length + 2 : 0) + (etiket ? etiket.length + 2 : 0);
    var yer = SINIR.aciklama - sabit;
    if (govde.length > yer) govde = govde.slice(0, Math.max(0, yer - 1)).replace(/\s+\S*$/, "") + "…";
    if (govde) parcalar.push(govde);
    if (bolum) parcalar.push(bolum);
    if (etiket) parcalar.push(etiket);
    return parcalar.join("\n\n");
  }

  return { SINIR: SINIR, buildPrompt: buildPrompt, parseResponse: parseResponse, compose: compose, metin: metin };
});
