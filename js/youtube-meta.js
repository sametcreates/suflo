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
  // Platforma göre: açıklama sınırı, hashtag sayısı, etiket alanı var mı
  var PLATFORM = {
    youtube: { ad: "YouTube", aciklama: 5000, hashtag: 3, etiket: true },
    instagram: { ad: "Instagram Reels", aciklama: 2200, hashtag: 5, etiket: false },
    tiktok: { ad: "TikTok", aciklama: 2200, hashtag: 5, etiket: false },
    // Shorts paketi (js/shorts-paket-plan.js): başlık ≤100, etiket alanı yok; YouTube başlığın
    // üstünde yalnız ilk 3 hashtag'i gösterir, fazlası gürültü
    shorts: { ad: "YouTube Shorts", aciklama: 5000, hashtag: 3, etiket: false }
  };
  function platform(p) { return PLATFORM[p] ? p : "youtube"; }
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
    var pf = platform(opts.platform);
    if (pf !== "youtube") {
      return {
        system: "You are a short-form social media copywriter for " + PLATFORM[pf].ad + ". From the video transcript, write in " + dil + ": " +
          "5 opening hook lines for the caption (max 80 characters, makes people stop scrolling, no clickbait lies, at most one emoji); " +
          "a caption body of 2-4 short lines (value of the video, then a call to action like saving or commenting), no hashtags, no links; " +
          PLATFORM[pf].hashtag + " hashtags (mix 2 broad and the rest niche, no spaces). " +
          "Reply ONLY with JSON {\"titles\":[...],\"description\":\"...\",\"tags\":[],\"hashtags\":[...]}.",
        user: "Transcript:\n" + metin(segments, opts.maxChars)
      };
    }
    return {
      system: "You are a YouTube SEO copywriter. From the video transcript, write in " + dil + ": " +
        "5 title options (max 70 characters, curiosity + clear benefit, no clickbait lies, no ALL CAPS, no emojis); " +
        "a description of 2 short paragraphs (what the viewer learns, then who it is for) without timestamps, links or hashtags; " +
        "12-20 search tags (short phrases people actually search, most specific first); 3 hashtags. " +
        "Reply ONLY with JSON {\"titles\":[...],\"description\":\"...\",\"tags\":[...],\"hashtags\":[...]}.",
      user: "Transcript:\n" + metin(segments, opts.maxChars)
    };
  }

  // YouTube baslik/aciklamada < ve > kabul etmez
  function temizSatir(s) {
    return String(s == null ? "" : s).replace(/\*\*?/g, "").replace(/[<>]/g, "").replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
      .replace(/\s+/g, " ").trim();
  }

  // Model bazen dizi yerine metin, metin yerine nesne dondurur: hepsini metin dizisine indir
  function diziyeIndir(v, ayirici) {
    if (v == null) return [];
    if (typeof v === "string") return ayirici ? v.split(ayirici) : [v];
    if (!(v instanceof Array)) return [];
    return v.map(function (x) {
      if (typeof x === "string" || typeof x === "number") return String(x);
      if (x && typeof x === "object") return String(x.title || x.tag || x.text || x.name || "");
      return "";
    });
  }

  function jsonOku(content) {
    if (typeof content !== "string") return content;
    var t = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    return JSON.parse(t);
  }

  function parseResponse(content, opts) {
    var pf = PLATFORM[platform(opts && opts.platform)];
    var data;
    try { data = jsonOku(content); } catch (e) { return null; }
    if (!data || typeof data !== "object") return null;
    var gorulen = {};
    var basliklar = diziyeIndir(data.titles || data.title).map(temizSatir).filter(function (t) {
      var k = t.toLocaleLowerCase("tr");
      if (!t || gorulen[k]) return false;
      gorulen[k] = 1;
      return true;
    }).map(function (t) { return t.length > SINIR.baslik ? t.slice(0, SINIR.baslik - 1).replace(/\s+\S*$/, "") + "…" : t; }).slice(0, 5);

    var acik = data.description instanceof Array ? diziyeIndir(data.description).join("\n\n") : data.description;
    var aciklama = String(acik == null || typeof acik === "object" ? "" : acik).replace(/\r\n/g, "\n")
      .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/[<>]/g, "").replace(/\n{3,}/g, "\n\n").trim();

    // etiketler: virgulsuz, tekrarsiz, toplam 500 karakter (YouTube virgulleri de sayar)
    var etiketler = [], toplam = 0, eg = {};
    diziyeIndir(data.tags, ",").forEach(function (t) {
      t = temizSatir(t).replace(/^#/, "").replace(/[,<>]/g, " ").replace(/\s+/g, " ").trim();
      var k = t.toLocaleLowerCase("tr");
      if (!t || t.length > 60 || eg[k]) return;
      var ek = t.length + (etiketler.length ? 1 : 0) + (/\s/.test(t) ? 2 : 0);   // bosluklu etiket tirnakla sayilir
      if (toplam + ek > SINIR.etiketToplam) return;
      eg[k] = 1; etiketler.push(t); toplam += ek;
    });

    var hg = {};
    var hashtagler = diziyeIndir(data.hashtags, /\s+/).map(function (h) {
      // bosluk, tire ve noktalama hashtag'i keser: tek kelimeye indir
      var t = temizSatir(h).replace(/^#+/, "").replace(/[\s.,!?;:'"()\[\]{}#\-–—\/]+/g, "");
      return t ? "#" + t : "";
    }).filter(function (h) {
      var k = h.toLocaleLowerCase("tr");
      if (!h || hg[k]) return false;
      hg[k] = 1;
      return true;
    }).slice(0, pf.hashtag);

    if (!pf.etiket) etiketler = [];
    if (!basliklar.length && !aciklama) return null;
    return { basliklar: basliklar, aciklama: aciklama, etiketler: etiketler, hashtagler: hashtagler };
  }

  /*
   * Yapıştırılmaya hazır açıklama: metin + (varsa) bölümler + hashtag'ler + (isteğe bağlı) kredi.
   * o.kredi ("Altyazılar: Suflo · suflo.app") en sona eklenir ve sınır (YouTube 5000,
   * Reels/TikTok 2200) aşılınca İLK düşen odur: kredi için metin kısaltılmaz, bölümler bozulmaz.
   * Kredisiz metin sınırı aşarsa açıklama metni kısaltılır; bölümler bozulmaz.
   */
  function compose(o) {
    o = o || {};
    var pf = PLATFORM[platform(o.platform)];
    var kredi = String(o.kredi || "").replace(/\s+/g, " ").trim();
    var tasma = { kisaldi: false };
    var metin = composeGovde(o, pf, tasma);
    if (!kredi || tasma.kisaldi) return metin;
    var tam = metin ? metin + "\n\n" + kredi : kredi;
    return tam.length <= pf.aciklama ? tam : metin;
  }

  function composeGovde(o, pf, tasma) {
    // Reels/TikTok aciklamasinda bolum (zaman damgasi) anlamsiz; kanca ilk satira
    var bolum = pf.etiket ? String(o.bolumler || "").trim() : "";
    var kanca = pf.etiket ? "" : String(o.kanca || "").trim();
    var etiket = (o.hashtagler || []).join(" ");
    var parcalar = [];
    var govde = String(o.aciklama || "").trim();
    var sabit = (bolum ? bolum.length + 2 : 0) + (etiket ? etiket.length + 2 : 0) + (kanca ? kanca.length + 2 : 0);
    var yer = pf.aciklama - sabit;
    if (govde.length > yer) { govde = yer > 20 ? govde.slice(0, yer - 1).replace(/\s+\S*$/, "") + "…" : ""; tasma.kisaldi = true; }
    if (kanca) parcalar.push(kanca);
    if (govde) parcalar.push(govde);
    if (bolum) parcalar.push(bolum);
    if (etiket) parcalar.push(etiket);
    // bolumler tek basina sinirdan uzunsa: son care kirp (YouTube 5000'den uzununu reddeder)
    var sonuc = parcalar.join("\n\n");
    if (sonuc.length > pf.aciklama) tasma.kisaldi = true;
    return sonuc.slice(0, pf.aciklama);
  }

  return { SINIR: SINIR, PLATFORM: PLATFORM, buildPrompt: buildPrompt, parseResponse: parseResponse, compose: compose, metin: metin };
});
