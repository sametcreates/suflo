/*
 * Suflo — Tek Tık Shorts Paketi: plan, metin ve iş durumu (saf modül)
 *
 * Seçili viral anlardan bitmiş Shorts: her an için 9:16 sekans, markalı altyazı, kanca
 * başlığı, "Çerçeve" katmanı (ilerleme çubuğu + CTA + logo) ve paylaşım metinleri.
 * Bu modül Premiere'e ve DOM'a dokunmaz:
 *   planla       — yeteneklere ve seçime göre her Short'un adımları (atlananlar gerekçeli)
 *   captionCues  — Shorts transkriptinden stilin harf / noktalama kuralıyla cue'lar
 *   packPrompt / parsePack / paketMetni — tek LLM çağrısında YouTube Shorts, TikTok, Reels
 *   paylasimTxt / paylasimCsv / dosyaAdi — paylaşım paketi dosyaları
 *   retryDelay   — 429 / 5xx için bekleme (gövdedeki "try again in 7.66s" okunur)
 *   newJob / nextStep / markDone / markFail / resumeJob / runJob — iş durumu (her adımdan
 *   sonra ayarlara yazılır; Premiere çağrıları runJob'a dışarıdan verilir, node'da test edilir)
 */
(function (root, factory) {
  function yukle(ad, dosya) {
    if (root && root[ad]) return root[ad];
    if (typeof require === "function") { try { return require(dosya); } catch (e) {} }
    return null;
  }
  var api = factory(yukle("SufloCaptionText", "./caption-text.js"), yukle("SufloStyleEngine", "./style-engine.js"),
    yukle("SufloYouTubeMeta", "./youtube-meta.js"), yukle("SufloMarkaKiti", "./marka-kiti.js"),
    yukle("SufloShortsEkler", "./shorts-ekler.js"));
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloShortsPlan = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (CT, SE, YM, MK, EK) {
  "use strict";

  var ADIMLAR = ["sekans", "altyazi", "kanca", "cerceve", "metin"];
  var PREMIERE_ADIMLARI = ["altyazi", "kanca", "cerceve"];
  // Timeline'daki katman adları: devam ederken (yanıtı kaybolan çağrı dahil) konmuş katman tanınır
  var KATMAN = { altyazi: "Suflo Paket · Altyazı", kanca: "Suflo Paket · Kanca", cerceve: "Suflo Paket · Çerçeve" };
  var KATMAN_ONEKI = "Suflo Paket ·";

  // Atlama / uyarı gerekçeleri (panel gösterir; İngilizcesi i18n/en.js'te)
  var NEDEN = {
    kapali: "kapalı",
    ffmpeg: "ffmpeg yok (Ayarlar → ffmpeg)",
    libass: "ffmpeg'de altyazı filtresi (libass) yok",
    "sekans-yok": "Short sekansı oluşmadı",
    "sekans-acilmadi": "Short sekansı açılamadı",
    miras: "kaynakta altyazı katmanı vardı, Short'a kopyalandı (çift altyazı olmasın diye atlandı)",
    "cerceve-bos": "çubuk, CTA ve logo kapalı",
    "logo-yok": "Marka Kiti'nde logo yok (Ayarlar › Marka Kiti)",
    "ai-yok": "AI anahtarı yok: paylaşım metni yapay zekâsız hazırlanır",
    "cta-kisa": "CTA atlandı: Short 8 sn'den kısa",
    "cta-cakisma": "CTA atlandı: kanca başlığıyla çakışıyordu",
    "secim-yok": "Pakete alınacak an seçilmedi.",
    mogrt: "MOGRT stilleri pakette kullanılamaz: her altyazı satırı ayrı Premiere çağrısı ister. Bir Suflo Stili seç.",
    "reframe-yok": "Bu Premiere sürümünde Auto Reframe yok: 9:16 paket yapılamaz. Yatay paket için onay ver ya da Premiere'i güncelle.",
    iptal: "iptal edildi",
    "altyazi-bos": "Short'ta altyazı satırı yok",
    "9x16-yok": "9:16 kopya oluşmadı: Short yatay kaldı",
    "kanca-miras": "kaynaktaki kanca başlığı Short'a da kopyalandı; gerekirse sil",
    "ai-hata": "AI yanıt vermedi: paylaşım metni yapay zekâsız hazırlandı",
    "ai-bozuk": "AI yanıtı okunamadı: paylaşım metni yapay zekâsız hazırlandı"
  };

  var GENEL_HASHTAG = { tr: ["#shorts", "#keşfet", "#viral"], en: ["#shorts", "#fyp", "#viral"] };

  function dilKodu(lang) { return lang === "tr" || lang === "az" ? "tr" : "en"; }
  function locFor(lang) { return { tr: "tr-TR", az: "az", ru: "ru" }[lang]; }
  function renkMi(v) { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v); }
  function yildizsiz(t) { return String(t == null ? "" : t).replace(/\*/g, "").replace(/\s+/g, " ").trim(); }
  function kopya(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------------- seçim ---------------- */

  /*
   * Paketin seçenekleri (panel kutuları). Bozuk / eksik değer varsayılana döner.
   * kit: normalize edilmiş Marka Kiti (açıksa ilerleme rengi / kalınlığı, CTA ve logo oradan).
   */
  function secimNormalize(raw, kit) {
    var r = raw && typeof raw === "object" ? raw : {};
    var k = kit && kit.on ? kit : null;
    function b(v, d) { return typeof v === "boolean" ? v : d; }
    var s = {
      stilId: typeof r.stilId === "string" ? r.stilId : (k && k.stil && k.stil.id) || "viral",
      altyazi: b(r.altyazi, true),
      kanca: b(r.kanca, true),
      ilerleme: b(r.ilerleme, !k || k.ilerleme.konum !== "yok"),
      ilerlemeKonum: r.ilerlemeKonum === "alt" || r.ilerlemeKonum === "ust" ? r.ilerlemeKonum : (k && k.ilerleme.konum === "alt" ? "alt" : "ust"),
      ilerlemeRenk: renkMi(r.ilerlemeRenk) ? r.ilerlemeRenk.toLowerCase() : (k ? k.ilerleme.renk : "#8b7cf6"),
      ilerlemeStil: EK && EK.ILERLEME_STILLERI.indexOf(r.ilerlemeStil) !== -1 ? r.ilerlemeStil : "ince",
      cta: b(r.cta, true),
      ctaSecim: ["takip", "part2", "link", "ozel"].indexOf(r.ctaSecim) !== -1 ? r.ctaSecim : (k && k.cta.acik && k.cta.metin ? "ozel" : "takip"),
      ctaOzel: typeof r.ctaOzel === "string" ? r.ctaOzel.slice(0, 40) : (k && k.cta.metin) || "",
      logo: b(r.logo, !!(k && k.logo.path)),
      metin: b(r.metin, true),
      kredi: b(r.kredi, false),
      yatay: r.yatay === true
    };
    return s;
  }

  /*
   * o: { anlar: [{ id, start, end, title, reason, score, hooks, kancaNo }], kit, secim,
   *      yetenek: { autoReframe, ffmpeg, libass, groq } }
   * Döner: { hata? (NEDEN anahtarı), dikey, metinAI, logoAcik, secim, kisalar: [...],
   *          atlananlar: [{ adim, neden }], uyarilar: [neden] }
   */
  function planla(o) {
    o = o || {};
    var anlar = (o.anlar || []).filter(function (a) { return a && Number(a.end) > Number(a.start); });
    var yet = o.yetenek || {};
    var kit = o.kit && o.kit.on ? o.kit : null;
    var secim = secimNormalize(o.secim, kit);
    if (!anlar.length) return { hata: "secim-yok" };
    if (SE && !SE.has(secim.stilId)) return { hata: "mogrt" };
    var dikey = yet.autoReframe !== false;
    if (!dikey && !secim.yatay) return { hata: "reframe-yok" };

    var atlananlar = [], uyarilar = [];
    function atla(adim, neden) { atlananlar.push({ adim: adim, neden: neden }); return neden; }
    var renderNeden = !yet.ffmpeg ? "ffmpeg" : (!yet.libass ? "libass" : "");
    var logoAcik = !!(secim.logo && kit && kit.logo && kit.logo.path);
    if (secim.logo && !logoAcik) uyarilar.push("logo-yok");
    var metinAI = !!yet.groq;
    if (secim.metin && !metinAI) uyarilar.push("ai-yok");

    var durum = {
      altyazi: !secim.altyazi ? atla("altyazi", "kapali") : (renderNeden ? atla("altyazi", renderNeden) : ""),
      kanca: !secim.kanca ? atla("kanca", "kapali") : (renderNeden ? atla("kanca", renderNeden) : ""),
      cerceve: !(secim.ilerleme || secim.cta || logoAcik) ? atla("cerceve", "cerceve-bos") : (renderNeden ? atla("cerceve", renderNeden) : ""),
      metin: !secim.metin ? atla("metin", "kapali") : ""
    };

    var kisalar = anlar.map(function (a, i) {
      var adimlar = { sekans: "bekliyor" }, notlar = {};
      Object.keys(durum).forEach(function (ad) {
        adimlar[ad] = durum[ad] ? "atlandi" : "bekliyor";
        if (durum[ad]) notlar[ad] = durum[ad];
      });
      var baslik = yildizsiz(a.title) || ("Shorts " + (i + 1));
      var hooks = a.hooks instanceof Array ? a.hooks : [];
      var kanca = hooks[Math.round(Number(a.kancaNo) || 0)] || hooks[0] || a.title || "";
      return {
        no: i + 1, anId: a.id, start: Number(a.start), end: Number(a.end),
        ad: ("Shorts " + (i + 1) + " · " + baslik).replace(/[\r\n\t]+/g, " ").slice(0, 70),
        baslik: baslik, kanca: String(kanca).replace(/[\r\n\t]+/g, " ").trim(), neden: String(a.reason || ""),
        puan: Math.round(Number(a.score) || 0),
        seqId: "", dikeyId: "", adimlar: adimlar, notlar: notlar, hatalar: {}, paylasim: null
      };
    });
    return { dikey: dikey, metinAI: metinAI, logoAcik: logoAcik, secim: secim, kisalar: kisalar, atlananlar: atlananlar, uyarilar: uyarilar };
  }

  /* ---------------- altyazı ---------------- */

  /*
   * Shorts kaydı (ayarlar.shortsAltyazi[id]: viral.js shortsKaydet, zamanlar Short'un 0'ına
   * kaydırılmış) → stil motoru cue'ları. o: { styleId, lang, kase?, punct? }
   * Stilin harf ve noktalama kuralı (preset.text) uygulanır; emoji atılır; *vurgu* kalır;
   * en az 0,3 sn, hiçbir cue sonrakiyle çakışmaz. Döner: { cues, cueKind }
   */
  function captionCues(kayit, o) {
    o = o || {};
    var preset = SE && o.styleId ? SE.preset(o.styleId) : null;
    var kase = o.kase || (preset ? preset.text.kase : "normal");
    var punct = typeof o.punct === "boolean" ? o.punct : (preset ? !!preset.text.punct : true);
    var loc = locFor(o.lang);
    var segs = (kayit && kayit.segs instanceof Array ? kayit.segs : []).filter(function (s) {
      return s && isFinite(Number(s.start)) && isFinite(Number(s.end));
    }).map(function (s) { return { start: Math.max(0, Number(s.start)), end: Math.max(0, Number(s.end)), text: s.text }; })
      .sort(function (a, b) { return a.start - b.start; });
    var ara = [];
    segs.forEach(function (s) {
      var t = CT.metinStili(CT.emojiSil(s.text), { kase: kase, punct: punct, loc: loc });
      if (!CT.stripEmphasis(t).replace(/\s+/g, "")) return;
      ara.push({ start: s.start, end: s.end, text: t });
    });
    var cues = [];
    for (var i = 0; i < ara.length; i++) {
      var c = ara[i], next = ara[i + 1];
      var end = Math.max(c.end, c.start + 0.3);
      if (next && end > next.start) end = next.start;
      if (end - c.start < 0.01) {
        // aynı anda başlayan iki satır: metin bir sonrakine katılır (kaybolmaz, çakışmaz)
        if (next) next.text = c.text + " " + next.text;
        continue;
      }
      cues.push({ start: c.start, end: end, text: c.text });
    }
    var mod = kayit && kayit.mod;
    return { cues: cues, cueKind: mod === "k1" ? "words" : (mod === "kc" ? "cumulative" : "lines") };
  }

  /*
   * Stil motoruna giden ince ayar: stilin kendi değerleri + Marka Kiti (açıksa: yazı tipi, renkler,
   * konum) + 9:16'da "platform arayüzünden kaçın". Döner: { overrides, konum }
   */
  function stilAyarlari(styleId, kit, dikey) {
    var p = SE ? SE.preset(styleId) : null;
    var st = p ? p.style : {};
    if (kit && kit.on && MK) st = MK.mergeBrandKit(st, kit);
    return {
      overrides: { font: st.font, renk: st.renk, konturRenk: st.konturRenk, vurguRenk: st.vurguRenk,
        boyut: st.boyut, kontur: st.kontur, konum: st.konum, guvenli: !!dikey },
      konum: Number(st.konum) || 5
    };
  }

  /* ---------------- çerçeve ---------------- */

  /*
   * Çerçeve katmanında ne var? o: { W, H, dur (Short süresi), secim, kit, logoAcik, hookDur (kanca
   * konacaksa süresi), altyaziKonum, altyaziAcik, lang, font, renk, vurguRenk, ctaStil }
   * Döner: { progress?, cta? ({ ass, start, fontFiles }), ctaNeden?, logo: { path, kose, oran, guvenli }|null, bos }
   */
  function cercevePlani(o) {
    o = o || {};
    var s = o.secim || secimNormalize({}, o.kit);
    var out = { progress: null, cta: null, ctaNeden: "", logo: null, bos: true };
    if (!EK) return out;
    if (s.ilerleme) {
      out.progress = EK.progressBarEvents({ W: o.W, H: o.H, dur: o.dur, renk: s.ilerlemeRenk, konum: s.ilerlemeKonum, stil: s.ilerlemeStil,
        kalinlik: o.kit && o.kit.on ? o.kit.ilerleme.kalinlik : 8 });
    }
    if (s.cta) {
      var metin = EK.ctaMetni(s.ctaSecim, s.ctaOzel, o.lang);
      var c = EK.ctaEvents({ W: o.W, H: o.H, dur: o.dur, metin: metin, sure: o.kit && o.kit.on ? o.kit.cta.sure : 2.5,
        hookDur: o.hookDur, stil: o.ctaStil || "serit", konum: EK.ctaKonum(o.altyaziKonum, o.altyaziAcik),
        font: o.font, renk: o.renk, vurguRenk: o.vurguRenk, lang: o.lang });
      if (c.ass) out.cta = c;
      else if (c.atla === "kisa") out.ctaNeden = "cta-kisa";
      else if (c.atla === "cakisma") out.ctaNeden = "cta-cakisma";
    }
    if (o.logoAcik && o.kit && o.kit.logo && o.kit.logo.path) {
      out.logo = { path: o.kit.logo.path, kose: o.kit.logo.kose, oran: o.kit.logo.oran, guvenli: o.H > o.W * 1.2 };
    }
    out.bos = !out.progress && !out.cta && !out.logo;
    return out;
  }

  /* ---------------- paylaşım metni ---------------- */

  var DIL_ADI = { tr: "Turkish", az: "Azerbaijani", en: "English", ru: "Russian", de: "German", ar: "Arabic",
    es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese" };

  /*
   * Tek çağrıda üç platform. segs: Short'un satırları; o: { lang, genre, title, hook }
   */
  function packPrompt(segs, o) {
    o = o || {};
    var dil = DIL_ADI[o.lang] || "the transcript's language";
    var metin = YM ? YM.metin(segs, 4000) : (segs || []).map(function (s) { return yildizsiz(s && s.text); }).join(" ").slice(0, 4000);
    var ust = [];
    if (o.genre) ust.push("Genre: " + yildizsiz(o.genre).slice(0, 40));
    if (o.title) ust.push("Clip title: " + yildizsiz(o.title).slice(0, 120));
    if (o.hook) ust.push("On-screen hook: " + yildizsiz(o.hook).slice(0, 120));
    return {
      system: "You are a short-form social media copywriter. For ONE vertical short clip, write posting copy in " + dil +
        " for three platforms in a single reply. youtube (YouTube Shorts): 3 title options (max 70 characters, curiosity + clear benefit), " +
        "a description of 1-3 sentences without links, 3 hashtags. tiktok: 3 opening hook lines (max 80 characters), a caption " +
        "body of 1-3 short lines ending with a call to action (comment, save or follow), 5 hashtags. reels (Instagram Reels): " +
        "same shape as tiktok, 5 hashtags. No clickbait lies, no ALL CAPS, at most one emoji per platform, hashtags without spaces. " +
        "Reply ONLY with JSON {\"youtube\":{\"titles\":[],\"description\":\"\",\"hashtags\":[]}," +
        "\"tiktok\":{\"titles\":[],\"description\":\"\",\"hashtags\":[]},\"reels\":{\"titles\":[],\"description\":\"\",\"hashtags\":[]}}.",
      user: (ust.length ? ust.join("\n") + "\n" : "") + "Transcript:\n" + metin
    };
  }

  var PLATFORM_ANAHTARI = [["youtube", "shorts", ["youtube", "shorts", "youtube_shorts"]], ["tiktok", "tiktok", ["tiktok"]],
    ["reels", "instagram", ["reels", "instagram", "instagram_reels"]]];

  /*
   * Yanıt → { youtube, tiktok, reels }: her biri youtube-meta parseResponse çıktısı ya da null.
   * Bozuk alt nesne yalnız kendi platformunu düşürür.
   */
  function parsePack(content) {
    var data = null;
    try {
      data = typeof content === "string" ? JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) : content;
    } catch (e) { data = null; }
    var out = { youtube: null, tiktok: null, reels: null };
    if (!data || typeof data !== "object" || !YM) return out;
    PLATFORM_ANAHTARI.forEach(function (p) {
      var sub = null;
      p[2].forEach(function (k) { if (!sub && data[k] && typeof data[k] === "object" && !(data[k] instanceof Array)) sub = data[k]; });
      out[p[0]] = sub ? YM.parseResponse(sub, { platform: p[1] }) : null;
    });
    return out;
  }

  function yedekPlatform(kisa, pf, o) {
    var dil = dilKodu(o.lang);
    var aciklama = String(kisa.neden || "").trim();
    var kanca = pf === "shorts" ? "" : yildizsiz(kisa.kanca);
    return {
      baslik: yildizsiz(kisa.baslik).slice(0, 100),
      aciklama: YM ? YM.compose({ aciklama: aciklama, hashtagler: GENEL_HASHTAG[dil], platform: pf, kanca: kanca, kredi: o.kredi || "" })
        : [kanca, aciklama, GENEL_HASHTAG[dil].join(" ")].filter(Boolean).join("\n\n"),
      ai: false
    };
  }

  /*
   * Platform metinleri: { youtube, tiktok, reels } her biri { baslik, aciklama, ai }.
   * parsed: parsePack çıktısı ya da null (AI yok / başarısız) → yapay zekâsız yedek
   * (başlık + anın gerekçesi + 3 genel hashtag). o: { lang, kredi ("" = kredi satırı yok) }
   */
  function paketMetni(parsed, kisa, o) {
    o = o || {};
    kisa = kisa || {};
    var out = {};
    PLATFORM_ANAHTARI.forEach(function (p) {
      var r = parsed && parsed[p[0]];
      if (!r || !YM) { out[p[0]] = yedekPlatform(kisa, p[1], o); return; }
      var baslik = r.basliklar[0] || yildizsiz(kisa.baslik);
      out[p[0]] = {
        baslik: baslik.slice(0, 100),
        aciklama: YM.compose({ aciklama: r.aciklama, hashtagler: r.hashtagler, platform: p[1],
          kanca: p[1] === "shorts" ? "" : (r.basliklar[0] || yildizsiz(kisa.kanca)), kredi: o.kredi || "" }),
        ai: true
      };
    });
    return out;
  }

  /*
   * LLM yeniden deneme beklemesi (ms) ya da -1 (deneme yok). K.httpJson başlık döndürmez:
   * süre gövdeden okunur ("try again in 7.66s", "450ms", "1m2.5s"); yoksa 2 / 4 / 8 / 16 sn.
   * Yalnız 429 ve 5xx; en çok 4 yeniden deneme (attempt: şimdiye kadarki yeniden deneme sayısı); en çok 60 sn.
   */
  var EN_COK_DENEME = 4;
  function retryDelay(status, body, attempt) {
    status = Number(status) || 0;
    attempt = Math.max(0, Math.floor(Number(attempt) || 0));
    if (!(status === 429 || (status >= 500 && status < 600))) return -1;
    if (attempt >= EN_COK_DENEME) return -1;
    var ms = 0;
    var m = /try again in\s*(?:(\d+(?:\.\d+)?)m(?!s))?\s*(?:(\d+(?:\.\d+)?)\s*(ms|s)\b)?/i.exec(String(body || ""));
    if (m && (m[1] || m[2])) {
      ms = (m[1] ? Number(m[1]) * 60000 : 0) + (m[2] ? Number(m[2]) * (m[3].toLowerCase() === "ms" ? 1 : 1000) : 0);
    }
    if (!(ms > 0)) ms = 2000 * Math.pow(2, attempt);
    return Math.min(60000, Math.ceil(ms));
  }

  /* ---------------- paylaşım paketi dosyaları ---------------- */

  var ETIKET = {
    tr: { bas: "Suflo — Shorts paylaşım paketi", kanca: "Kanca", baslik: "Başlık", aciklama: "Açıklama", puan: "puan", sn: "sn",
      yt: "YouTube Shorts", tt: "TikTok", ig: "Instagram Reels", hata: "Tamamlanmayan adımlar",
      csv: ["No", "Short", "Başlangıç", "Bitiş", "Süre (sn)", "Puan", "Kanca", "YouTube başlığı", "YouTube açıklaması", "TikTok metni", "Reels metni"] },
    en: { bas: "Suflo — Shorts posting pack", kanca: "Hook", baslik: "Title", aciklama: "Description", puan: "score", sn: "s",
      yt: "YouTube Shorts", tt: "TikTok", ig: "Instagram Reels", hata: "Unfinished steps",
      csv: ["No", "Short", "Start", "End", "Length (s)", "Score", "Hook", "YouTube title", "YouTube description", "TikTok caption", "Reels caption"] }
  };

  function tc(sec) {
    var t = Math.max(0, Math.floor(Number(sec) || 0)), m = Math.floor(t / 60), s = t % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function crlf(t) { return String(t == null ? "" : t).replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n"); }

  /*
   * TXT: UTF-8 BOM + CRLF (Windows Not Defteri dahil her yerde doğru açılır).
   * kisalar: [{ no, ad, start, end, puan, kanca, paylasim: paketMetni çıktısı, hatalar }]
   * o: { lang (arayüz dili), kaynak (sekans adı), tarih (metin) }
   */
  function paylasimTxt(kisalar, o) {
    o = o || {};
    var E = ETIKET[dilKodu(o.lang)];
    var s = [E.bas];
    var alt = [o.tarih, o.kaynak].filter(Boolean).join(" · ");
    if (alt) s.push(alt);
    (kisalar || []).forEach(function (k) {
      s.push("", "=== " + k.no + ". " + yildizsiz(k.ad || k.baslik) + " (" + tc(k.start) + "–" + tc(k.end) + " · " +
        Math.round(Number(k.end) - Number(k.start)) + " " + E.sn + (k.puan ? " · " + k.puan + "/100 " + E.puan : "") + ") ===");
      if (k.kanca) s.push(E.kanca + ": " + yildizsiz(k.kanca));
      var p = k.paylasim;
      if (p) {
        [["youtube", E.yt], ["tiktok", E.tt], ["reels", E.ig]].forEach(function (x) {
          var m = p[x[0]];
          if (!m) return;
          s.push("", "[" + x[1] + "]");
          if (x[0] === "youtube") s.push(E.baslik + ": " + m.baslik);
          s.push(E.aciklama + ":", m.aciklama);
        });
      }
      var hk = Object.keys(k.hatalar || {});
      if (hk.length) s.push("", E.hata + ": " + hk.map(function (a) { return a + " (" + String(k.hatalar[a]).replace(/\s+/g, " ").slice(0, 160) + ")"; }).join("; "));
    });
    return "﻿" + crlf(s.join("\n")) + "\r\n";
  }

  // RFC 4180 alanı: virgül, tırnak, satır sonu varsa tırnakla; tablo programında formül olmasın
  function csvAlan(v) {
    var t = String(v == null ? "" : v).replace(/\r\n?/g, "\n");
    if (/^[=+\-@\t]/.test(t)) t = "'" + t;
    return /[",\n]/.test(t) ? "\"" + t.replace(/"/g, "\"\"") + "\"" : t;
  }

  function paylasimCsv(kisalar, o) {
    o = o || {};
    var E = ETIKET[dilKodu(o.lang)];
    var satirlar = [E.csv.map(csvAlan).join(",")];
    (kisalar || []).forEach(function (k) {
      var p = k.paylasim || {};
      satirlar.push([k.no, yildizsiz(k.ad || k.baslik), tc(k.start), tc(k.end), Math.round(Number(k.end) - Number(k.start)), k.puan || "",
        yildizsiz(k.kanca), p.youtube ? p.youtube.baslik : "", p.youtube ? p.youtube.aciklama : "",
        p.tiktok ? p.tiktok.aciklama : "", p.reels ? p.reels.aciklama : ""].map(csvAlan).join(","));
    });
    return "﻿" + satirlar.join("\r\n") + "\r\n";
  }

  /*
   * Güvenli dosya adı: Windows'un yasak karakterleri (<>:"/\|?* ve denetim) ve ayrılmış adları
   * (CON, PRN, AUX, NUL, COM1-9, LPT1-9) düzeltilir; Türkçe harfler kalır; sondaki nokta/boşluk atılır.
   */
  function dosyaAdi(ad) {
    var s = String(ad == null ? "" : ad).replace(/[<>:"\/\\|?*\u0000-\u001f\u007f]/g, "-").replace(/\s+/g, " ").trim();
    s = s.replace(/[. ]+$/, "").slice(0, 100).replace(/[. ]+$/, "");
    if (!s) s = "Suflo";
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(s)) s = "_" + s;
    return s;
  }

  function zamanDamgasi(d) {
    d = d instanceof Date ? d : new Date(Number(d) || Date.now());
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function paketDosyaAdi(d) { return dosyaAdi("Suflo-Shorts-paylasim-paketi-" + zamanDamgasi(d)); }

  /* ---------------- iş durumu ---------------- */

  /*
   * o: { plan (planla çıktısı), kaynakId, kaynakAd, lang, ts }
   * İş ayarlara (settings.shortsPaketIs) her adımdan sonra yazılır; "Devam et" kaldığı yerden sürer.
   */
  function newJob(o) {
    o = o || {};
    var plan = o.plan || {};
    return {
      v: 1, ts: Number(o.ts) || Date.now(), kaynakId: String(o.kaynakId || ""), kaynakAd: String(o.kaynakAd || ""),
      lang: String(o.lang || "tr"), dikey: plan.dikey !== false, metinAI: !!plan.metinAI, logoAcik: !!plan.logoAcik,
      secim: kopya(plan.secim || secimNormalize({})), durum: "calisiyor", kisalar: kopya(plan.kisalar || [])
    };
  }

  // Sıra: önce tüm sekanslar (1. evre), sonra her Short için altyazı → kanca → çerçeve → metin
  function nextStep(job) {
    if (!job || !job.kisalar) return null;
    for (var i = 0; i < job.kisalar.length; i++) if (job.kisalar[i].adimlar.sekans === "bekliyor") return { i: i, adim: "sekans" };
    for (var j = 0; j < job.kisalar.length; j++) {
      for (var a = 1; a < ADIMLAR.length; a++) if (job.kisalar[j].adimlar[ADIMLAR[a]] === "bekliyor") return { i: j, adim: ADIMLAR[a] };
    }
    return null;
  }

  function markDone(job, i, adim, veri) {
    var k = job.kisalar[i];
    if (!k) return job;
    k.adimlar[adim] = "tamam";
    delete k.hatalar[adim];
    if (adim === "sekans" && veri) {
      if (veri.id) k.seqId = String(veri.id);
      if (veri.dikeyId) k.dikeyId = String(veri.dikeyId);
    }
    if (adim === "metin" && veri && veri.paylasim) k.paylasim = veri.paylasim;
    return job;
  }

  function markSkip(job, i, adim, neden) {
    var k = job.kisalar[i];
    if (!k) return job;
    k.adimlar[adim] = "atlandi";
    k.notlar[adim] = String(neden || "");
    return job;
  }

  // Sekans oluşmazsa o Short'un Premiere adımları atlanır (metin yine yazılır: sekans istemez)
  function markFail(job, i, adim, hata) {
    var k = job.kisalar[i];
    if (!k) return job;
    k.adimlar[adim] = "hata";
    k.hatalar[adim] = String(hata && hata.message ? hata.message : (hata || "?")).slice(0, 300);
    if (adim === "sekans") {
      PREMIERE_ADIMLARI.forEach(function (a) {
        if (k.adimlar[a] === "bekliyor") { k.adimlar[a] = "atlandi"; k.notlar[a] = "sekans-yok"; }
      });
    }
    return job;
  }

  // "Devam et": hatalı adımlar ve sekans yüzünden atlananlar yeniden denenir; bitenler atlanır
  function resumeJob(job) {
    if (!job || !job.kisalar) return job;
    job.durum = "calisiyor";
    job.kisalar.forEach(function (k) {
      ADIMLAR.forEach(function (a) {
        if (k.adimlar[a] === "hata") { k.adimlar[a] = "bekliyor"; delete k.hatalar[a]; }
        if (k.adimlar[a] === "atlandi" && (k.notlar[a] === "sekans-yok" || k.notlar[a] === "sekans-acilmadi")) {
          k.adimlar[a] = "bekliyor"; delete k.notlar[a];
        }
      });
    });
    return job;
  }

  function ozet(job) {
    var o = { kisa: 0, bitenKisa: 0, tamam: 0, hata: 0, atlandi: 0, bekliyor: 0 };
    (job && job.kisalar || []).forEach(function (k) {
      o.kisa++;
      var hatasiz = true;
      ADIMLAR.forEach(function (a) {
        var d = k.adimlar[a];
        if (o[d] !== undefined) o[d]++;
        if (d === "hata" || d === "bekliyor") hatasiz = false;
      });
      if (hatasiz && k.adimlar.sekans === "tamam") o.bitenKisa++;
    });
    return o;
  }

  function devamEdilebilir(job) {
    if (!(job && job.v === 1 && job.kisalar instanceof Array && job.kisalar.length)) return false;
    return job.durum !== "bitti" || ozet(job).hata > 0;
  }

  function hataMetni(e) { return e && e.message ? e.message : String(e || "?"); }

  /*
   * İşi çalıştır. deps (hepsi async olabilir):
   *   makeShorts(k, job) → { ok, id, dikeyId, hata }        (1. evre, her an için)
   *   activate(k, job)   → { ok, paket: [katman adları], miras: { altyazi }, width, height, end, fps, hata }
   *   altyazi / kanca / cerceve (k, ctx, job) → { ok } | { atla: neden } | { ok: false, hata }
   *   metin(k, job)      → { ok, paylasim }
   *   kaydet(job), ilerleme(job, i, adim), iptalMi(), anaSekansaDon(job)
   * Bir adımın hatası diğer Shorts'u durdurmaz; ana sekans hata olsa da geri açılır.
   */
  async function runJob(job, deps) {
    deps = deps || {};
    function kaydet() { try { if (deps.kaydet) deps.kaydet(job); } catch (e) {} }
    function ilerle(i, adim) { try { if (deps.ilerleme) deps.ilerleme(job, i, adim); } catch (e) {} }
    var aktif = -1, ctx = null;
    try {
      for (var tur = 0; tur < 1000; tur++) {
        if (deps.iptalMi && deps.iptalMi()) { job.durum = "iptal"; break; }
        var s = nextStep(job);
        if (!s) { job.durum = "bitti"; break; }
        var k = job.kisalar[s.i];
        ilerle(s.i, s.adim);
        try {
          if (s.adim === "sekans") {
            var r = await deps.makeShorts(k, job);
            if (!r || !r.ok) throw new Error((r && (r.hata || r.error)) || NEDEN["sekans-yok"]);
            markDone(job, s.i, "sekans", r);
          } else if (s.adim === "metin") {
            var m = await deps.metin(k, job);
            if (!m || !m.ok) throw new Error((m && m.hata) || "?");
            markDone(job, s.i, "metin", m);
          } else {
            if (aktif !== s.i) {
              ctx = await deps.activate(k, job);
              if (!ctx || !ctx.ok) {
                var neden = (ctx && (ctx.hata || ctx.error)) || NEDEN["sekans-acilmadi"];
                PREMIERE_ADIMLARI.forEach(function (a) {
                  if (k.adimlar[a] === "bekliyor") { markFail(job, s.i, a, neden); }
                });
                aktif = -1;
                kaydet();
                continue;
              }
              aktif = s.i;
              // yanıtı kaybolmuş çağrının koyduğu katman: o adım bitmiş sayılır
              var konanlar = ctx.paket || [];
              PREMIERE_ADIMLARI.forEach(function (a) {
                if (k.adimlar[a] === "bekliyor" && konanlar.indexOf(KATMAN[a]) !== -1) markDone(job, s.i, a);
              });
              if (k.adimlar.altyazi === "bekliyor" && ctx.miras && Number(ctx.miras.altyazi) > 0) markSkip(job, s.i, "altyazi", "miras");
              kaydet();
              continue;
            }
            var sonuc = await deps[s.adim](k, ctx, job);
            if (sonuc && sonuc.atla) markSkip(job, s.i, s.adim, sonuc.atla);
            else if (!sonuc || !sonuc.ok) throw new Error((sonuc && (sonuc.hata || sonuc.error)) || "?");
            else markDone(job, s.i, s.adim, sonuc);
          }
        } catch (e) {
          markFail(job, s.i, s.adim, hataMetni(e));
          // sekans değişmiş olabilir: bu Short'un sonraki adımı onu yeniden açar
          if (PREMIERE_ADIMLARI.indexOf(s.adim) !== -1) aktif = -1;
        }
        kaydet();
        ilerle(s.i, s.adim);
      }
    } finally {
      kaydet();
      if (deps.anaSekansaDon) { try { await deps.anaSekansaDon(job); } catch (e2) {} }
    }
    return job;
  }

  return {
    ADIMLAR: ADIMLAR.slice(),
    KATMAN: KATMAN,
    KATMAN_ONEKI: KATMAN_ONEKI,
    NEDEN: NEDEN,
    GENEL_HASHTAG: GENEL_HASHTAG,
    secimNormalize: secimNormalize,
    planla: planla,
    captionCues: captionCues,
    stilAyarlari: stilAyarlari,
    cercevePlani: cercevePlani,
    packPrompt: packPrompt,
    parsePack: parsePack,
    paketMetni: paketMetni,
    retryDelay: retryDelay,
    paylasimTxt: paylasimTxt,
    paylasimCsv: paylasimCsv,
    dosyaAdi: dosyaAdi,
    zamanDamgasi: zamanDamgasi,
    paketDosyaAdi: paketDosyaAdi,
    newJob: newJob,
    nextStep: nextStep,
    markDone: markDone,
    markSkip: markSkip,
    markFail: markFail,
    resumeJob: resumeJob,
    ozet: ozet,
    devamEdilebilir: devamEdilebilir,
    runJob: runJob
  };
});
