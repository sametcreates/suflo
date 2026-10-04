/*
 * Suflo — Tek Tık Shorts Paketi (panel ve Premiere bağlantısı)
 *
 * "Pakete al" işaretli viral anlardan bitmiş Shorts:
 *   1. evre: her an için alt sekans + 9:16 Auto Reframe (KS_makeShorts, an başına ayrı çağrı)
 *   2. evre: her Short için Premiere'de o sekans açılır (KS_openSequenceById), sonra sırayla
 *      altyazı katmanı → kanca başlığı → "Çerçeve" (ilerleme çubuğu + CTA + logo, tek render)
 *      → paylaşım metni (tek LLM çağrısı, yoksa yedek)
 * Plan, metin ve iş durumu js/shorts-paket-plan.js'te (saf, testli); buradaki her Premiere
 * adımı runJob'a bağımlılık olarak verilir. İş her adımdan sonra ayarlara yazılır: panel
 * kapansa ya da Premiere yanıt vermese de "Devam et" kaldığı yerden sürer. Sonunda paylaşım
 * paketi .txt + .csv olarak proje klasörüne (yoksa Suflo çıktı klasörüne) yazılır.
 */
window.KShortsPaket = (function () {
  "use strict";

  var P = window.SufloShortsPlan, EK = window.SufloShortsEkler, SE = window.SufloStyleEngine;
  var CT = window.SufloCaptionText, OR = window.SufloOverlayRender, MK = window.SufloMarkaKiti;
  var calisiyorMu = false, iptalIstendi = false, sonKlasor = "";

  var ADIM_ETIKET = { sekans: "sekans", altyazi: "altyazı", kanca: "kanca", cerceve: "çerçeve", metin: "metin" };
  var DURUM_ETIKET = { bekliyor: "sırada", tamam: "tamam", hata: "hata", atlandi: "atlandı", calisiyor: "çalışıyor" };

  function el(id) { return document.getElementById(id); }
  function T(s) { var I = window.SufloI18n; return I && I.tr ? I.tr(s) : s; }
  function uiMetni(s) { return T(s); }   // diyalog metni arayüz dilinde (test-arayuz denetler)
  function arayuzDili() { var I = window.SufloI18n; return I && I.getLang ? I.getLang() : "tr"; }

  function durum(msg, cls) {
    var e = el("cap-paket-durum");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function nedenMetni(kod) { return P.NEDEN[kod] || String(kod || ""); }

  function uzantiDizini() {
    try { return decodeURI(K.extensionPath()); } catch (e) { return K.extensionPath(); }
  }

  // Kayıtlı Marka Kiti (yalnız açıksa)
  function markaKiti() {
    try {
      if (!MK) return null;
      var kit = MK.normalize(K.settings().markaKiti, { styleIds: function (id) { return !!(SE && SE.has(id)); } }).kit;
      return kit.on ? kit : null;
    } catch (e) { return null; }
  }

  function ciftBoyut(n, varsayilan) {
    n = Math.round(Number(n) || 0);
    if (!(n > 0)) n = varsayilan;
    return n + (n % 2);
  }

  /* ---------------- seçim (kutular) ---------------- */

  function secimOku() {
    function c(id, d) { var e = el(id); return e ? !!e.checked : d; }
    function v(id, d) { var e = el(id); return e && e.value ? e.value : d; }
    return {
      stilId: v("cap-paket-stil", "viral"),
      altyazi: c("cap-paket-altyazi", true),
      kanca: c("cap-paket-kanca", true),
      ilerleme: c("cap-paket-ilerleme", true),
      ilerlemeKonum: v("cap-paket-ilerleme-konum", "ust"),
      ilerlemeStil: v("cap-paket-ilerleme-stil", "ince"),
      ilerlemeRenk: v("cap-paket-ilerleme-renk", "#8b7cf6"),
      cta: c("cap-paket-cta", true),
      ctaSecim: v("cap-paket-cta-metin", "takip"),
      ctaOzel: el("cap-paket-cta-ozel") ? el("cap-paket-cta-ozel").value : "",
      logo: c("cap-paket-logo", false),
      metin: c("cap-paket-metin", true),
      kredi: c("cap-paket-kredi", false)
    };
  }

  function secimKaydet() {
    var s = K.settings();
    s.shortsPaketSecim = secimOku();
    K.saveSettings();
  }

  function secimYukle() {
    var kit = markaKiti();
    var s = P.secimNormalize(K.settings().shortsPaketSecim, kit);
    function c(id, v) { if (el(id)) el(id).checked = !!v; }
    function v(id, x) { if (el(id) && x !== undefined) el(id).value = x; }
    c("cap-paket-altyazi", s.altyazi); c("cap-paket-kanca", s.kanca); c("cap-paket-ilerleme", s.ilerleme);
    v("cap-paket-ilerleme-konum", s.ilerlemeKonum); v("cap-paket-ilerleme-stil", s.ilerlemeStil); v("cap-paket-ilerleme-renk", s.ilerlemeRenk);
    c("cap-paket-cta", s.cta); v("cap-paket-cta-metin", s.ctaSecim); v("cap-paket-cta-ozel", s.ctaOzel);
    c("cap-paket-logo", s.logo); c("cap-paket-metin", s.metin); c("cap-paket-kredi", s.kredi);
    ozelAlan();
    return s;
  }

  function ozelAlan() {
    if (el("cap-paket-cta-ozel")) el("cap-paket-cta-ozel").hidden = !(el("cap-paket-cta-metin") && el("cap-paket-cta-metin").value === "ozel");
  }

  // Stil seçimi: yalnız Suflo Stilleri (stil motoru). Varsayılan: Altyazı sekmesinde seçili Suflo Stili
  function stilleriCiz() {
    var sel = el("cap-paket-stil");
    if (!sel || !SE) return;
    var kayitli = (K.settings().shortsPaketSecim || {}).stilId;
    var panel = window.KCaptions && KCaptions.stilAyarlari ? KCaptions.stilAyarlari().aile : "";
    var mogrt = !!(window.KCaptions && KCaptions.mogrtSecili && KCaptions.mogrtSecili());
    sel.innerHTML = "";
    SE.list().forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.name;
      sel.appendChild(o);
    });
    var secilen = SE.has(kayitli) ? kayitli : (SE.has(panel) ? panel : "viral");
    if (!mogrt && SE.has(panel) && !kayitli) secilen = panel;
    sel.value = secilen;
    if (el("cap-paket-mogrt-not")) el("cap-paket-mogrt-not").hidden = !mogrt;
  }

  function logoNotu() {
    var kit = markaKiti();
    var var_ = !!(kit && kit.logo && kit.logo.path);
    if (el("cap-paket-logo-not")) el("cap-paket-logo-not").hidden = var_;
  }

  /* ---------------- durum gösterimi ---------------- */

  function kayitliIs() {
    var j = K.settings().shortsPaketIs;
    return P.devamEdilebilir(j) ? j : null;
  }

  // Düğmeler ve "Paketi oluştur (N Shorts)"
  function guncelle() {
    var btn = el("cap-paket-olustur");
    if (!btn) return;
    var n = window.KViral && KViral.paketAnlari ? KViral.paketAnlari().length : 0;
    btn.textContent = "Paketi oluştur (" + n + " Shorts)";
    btn.disabled = calisiyorMu || n === 0;
    if (el("cap-paket-iptal")) el("cap-paket-iptal").hidden = !calisiyorMu;
    if (el("cap-paket-devam")) el("cap-paket-devam").hidden = calisiyorMu || !kayitliIs();
    if (el("cap-paket-klasor")) el("cap-paket-klasor").hidden = calisiyorMu || !sonKlasor;
  }

  var aktifAdim = null;   // { i, adim } — çip "çalışıyor" görünür

  function listeCiz(job) {
    var kutu = el("cap-paket-liste");
    if (!kutu) return;
    kutu.innerHTML = "";
    if (!job) return;
    job.kisalar.forEach(function (k, i) {
      var satir = document.createElement("div");
      satir.className = "paket-kisa";
      var ad = document.createElement("div");
      ad.className = "paket-kisa-ad";
      ad.textContent = k.ad;   // AI metni: yalnız textContent
      ad.title = k.ad;
      satir.appendChild(ad);
      var cipler = document.createElement("div");
      cipler.className = "paket-cipler";
      var notlar = [];
      P.ADIMLAR.forEach(function (a) {
        var d = k.adimlar[a];
        var simdi = aktifAdim && aktifAdim.i === i && aktifAdim.adim === a && calisiyorMu && d === "bekliyor";
        var c = document.createElement("span");
        c.className = "paket-cip " + (simdi ? "calisiyor" : d);
        c.textContent = T(ADIM_ETIKET[a]);
        var aciklama = T(DURUM_ETIKET[simdi ? "calisiyor" : d] || d);
        if (d === "hata" && k.hatalar[a]) aciklama += ": " + k.hatalar[a];
        if (d === "atlandi" && k.notlar[a]) aciklama += ": " + T(nedenMetni(k.notlar[a]));
        c.title = aciklama;
        cipler.appendChild(c);
        if (d === "hata" && k.hatalar[a]) notlar.push({ m: T(ADIM_ETIKET[a]) + ": " + k.hatalar[a], hata: true });
      });
      ["cta", "sekans9x16", "kancaMiras", "logo", "metinAi"].forEach(function (n) {
        if (k.notlar[n]) notlar.push({ m: T(nedenMetni(k.notlar[n])), hata: false });
      });
      satir.appendChild(cipler);
      notlar.slice(0, 3).forEach(function (n) {
        var e = document.createElement("div");
        e.className = "paket-kisa-not" + (n.hata ? " hata" : "");
        e.textContent = n.m;
        satir.appendChild(e);
      });
      kutu.appendChild(satir);
    });
  }

  /* ---------------- yetenekler ---------------- */

  async function yetenekler() {
    var probe = await K.call("KS_apiProbe", undefined, 20000);
    var ff = null;
    try { ff = await K.findFfmpeg(); } catch (e) { ff = null; }
    return {
      autoReframe: probe && probe.ok ? probe.autoReframe !== false : true,
      subsequence: probe && probe.ok ? probe.subsequence !== false : true,
      ffmpeg: !!ff,
      libass: !!ff && !(K.libassUyarisi && K.libassUyarisi()),
      groq: !!(window.KCaptions && KCaptions.chatConfig && KCaptions.chatConfig())
    };
  }

  /* ---------------- LLM (yeniden denemeli) ---------------- */

  function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // K.httpJson başlık döndürmez: bekleme süresi gövdeden okunur (P.retryDelay)
  async function llm(cfg, body) {
    for (var deneme = 0; ; deneme++) {
      var r;
      if (K.nodeOK) {
        r = await K.httpJson(cfg.url, { "Authorization": "Bearer " + cfg.key }, body);
      } else {
        try {
          var res = await fetch(cfg.url, { method: "POST", headers: { "Authorization": "Bearer " + cfg.key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
          r = { status: res.status, body: await res.text() };
        } catch (eF) { r = { status: 0, body: String(eF) }; }
      }
      if (r.status >= 200 && r.status < 300) {
        var json = JSON.parse(r.body);
        return json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : "";
      }
      var ms = P.retryDelay(r.status, r.body, deneme);
      if (ms < 0 || iptalIstendi) {
        throw new Error(r.status === 0 ? "Bağlantı hatası: " + String(r.body).slice(0, 120) : "API " + r.status + ": " + String(r.body).slice(0, 140));
      }
      K.log("[shorts-paket] LLM " + r.status + ", " + ms + " ms sonra tekrar");
      await bekle(ms);
    }
  }

  function krediMetni(lang) {
    var dil = lang === "tr" || lang === "az" ? "tr" : "en";
    return window.SufloReferral && SufloReferral.creditLine ? SufloReferral.creditLine(dil) : (dil === "tr" ? "Altyazılar: Suflo · suflo.app" : "Captions: Suflo · suflo.app");
  }

  /* ---------------- Premiere adımları ---------------- */

  function shortsKaydi(k) {
    var harita = K.settings().shortsAltyazi || {};
    return harita[k.dikeyId] || harita[k.seqId] || null;
  }

  function cikti(tur, k) {
    return K.path.join(K.srtDir(), "suflo-paket-" + tur + "-" + Date.now() + "-" + k.no + ".mov");
  }
  function sil(p) { try { if (p && K.fs.existsSync(p)) K.fs.unlinkSync(p); } catch (e) {} }

  function bagimliliklar(job, kaynakSegs) {
    var kit = markaKiti();
    return {
      makeShorts: async function (k) {
        var r = await K.call("KS_makeShorts", { ranges: [{ start: k.start, end: k.end, name: k.ad }], dikey: job.dikey, sourceId: job.kaynakId }, 600000);
        var it = null;
        if (r && r.ok && r.items && r.items.length) {
          it = r.items[0];
          (r.errors || []).forEach(function (h) { if (/9:16/.test(h)) k.notlar.sekans9x16 = "9x16-yok"; });
        } else if (r && /zaman aşımı|yanıt vermedi/i.test(String(r.error || ""))) {
          // 600 sn doldu ama Auto Reframe bitmiş olabilir: sekansları adıyla geri al
          var bilinen = [];
          job.kisalar.forEach(function (x) { if (x.seqId) bilinen.push(x.seqId); if (x.dikeyId) bilinen.push(x.dikeyId); });
          var yat = await K.call("KS_findSequenceByName", { name: k.ad, haric: bilinen }, 30000);
          var dik = job.dikey ? await K.call("KS_findSequenceByName", { name: k.ad + " 9x16", haric: bilinen }, 30000) : null;
          if (yat && yat.ok && yat.id) it = { id: yat.id, dikeyId: dik && dik.ok ? dik.id : "" };
        }
        if (!it || !it.id) return { ok: false, hata: (r && r.error) || nedenMetni("sekans-yok") };
        if (job.dikey && !it.dikeyId) k.notlar.sekans9x16 = "9x16-yok";
        if (window.KViral && KViral.shortsKaydet) KViral.shortsKaydet([it], { start: k.start, end: k.end, title: k.baslik }, kaynakSegs);
        if (window.KViral && KViral.sekansiBagla) KViral.sekansiBagla(job.kaynakId);
        return { ok: true, id: it.id, dikeyId: it.dikeyId || "" };
      },

      activate: async function (k) {
        var id = k.dikeyId || k.seqId;
        var r = await K.call("KS_openSequenceById", { id: id }, 60000);
        if (!r || !r.ok) return { ok: false, hata: (r && r.error) || nedenMetni("sekans-acilmadi") };
        var l = await K.call("KS_sequenceSufloLayers", { id: id }, 30000);
        if (l && l.ok && l.kanca > 0) k.notlar.kancaMiras = "kanca-miras";
        return { ok: true, id: String(r.id || id), width: r.width, height: r.height, end: r.end, fps: r.fps,
          paket: r.paket || [], miras: l && l.ok ? l : null };
      },

      altyazi: async function (k, ctx) {
        var kayit = shortsKaydi(k);
        if (!kayit || !kayit.segs || !kayit.segs.length) return { ok: false, hata: T("Bu Short'un altyazı kaydı yok: Shorts sekansını Altyazı sekmesinde yazıya dökebilirsin.") };
        var cc = P.captionCues(kayit, { styleId: job.secim.stilId, lang: job.lang });
        if (!cc.cues.length) return { atla: "altyazi-bos" };
        var W = ciftBoyut(ctx.width, 1080), H = ciftBoyut(ctx.height, 1920), fps = Number(ctx.fps) > 0 ? Number(ctx.fps) : 30;
        var sa = P.stilAyarlari(job.secim.stilId, kit, H > W * 1.2);
        var der = SE.compile({ styleId: job.secim.stilId, cueKind: cc.cueKind, cues: cc.cues, offset: 0, width: W, height: H, overrides: sa.overrides });
        var sure = CT.katmanSuresi(cc.cues[cc.cues.length - 1].end, Number(ctx.end) || 0, fps, false);
        var yol = cikti("altyazi", k);
        await OR.render(K, { ass: der.ass, fontFiles: der.fontFiles, g: W, y: H, fps: fps, sure: sure, cikti: yol,
          onek: "overlay-paket-", fontDizini: K.path.join(uzantiDizini(), "fonts"), timeout: 1800000 });
        var yer = await K.call("KS_placeOverlay", { path: yol, at: 0, name: P.KATMAN.altyazi, expectSeqId: ctx.id }, 120000);
        if (!yer || !yer.ok) { sil(yol); return { ok: false, hata: (yer && yer.error) || "?" }; }
        return { ok: true };
      },

      kanca: async function (k, ctx) {
        if (!window.KKanca) return { ok: false, hata: "Kanca modülü yüklenemedi." };
        var r = await KKanca.ekle({ text: k.kanca, at: 0, stil: job.kancaStil, dur: job.kancaSure, expectSeqId: ctx.id, ad: P.KATMAN.kanca, sessiz: true });
        return r && r.ok ? { ok: true } : { ok: false, hata: (r && r.hata) || "Kanca başlığı eklenemedi." };
      },

      cerceve: async function (k, ctx) {
        var W = ciftBoyut(ctx.width, 1080), H = ciftBoyut(ctx.height, 1920), fps = Number(ctx.fps) > 0 ? Number(ctx.fps) : 30;
        var dur = Number(ctx.end) > 0 ? Number(ctx.end) : Math.max(1, k.end - k.start);
        var sa = P.stilAyarlari(job.secim.stilId, kit, H > W * 1.2);
        var hk = kit && MK ? MK.mergeHook({}, kit) : {};
        var cp = P.cercevePlani({ W: W, H: H, dur: dur, secim: job.secim, kit: kit, logoAcik: job.logoAcik,
          hookDur: k.adimlar.kanca === "tamam" || k.adimlar.kanca === "bekliyor" ? job.kancaSure : 0,
          altyaziKonum: sa.konum, altyaziAcik: k.adimlar.altyazi === "tamam", lang: job.lang,
          font: hk.font, renk: hk.renk, vurguRenk: hk.vurguRenk, ctaStil: kit && kit.kanca && kit.kanca.stil ? kit.kanca.stil : "serit" });
        if (cp.ctaNeden) k.notlar.cta = cp.ctaNeden;
        if (cp.bos) return { atla: cp.ctaNeden || "cerceve-bos" };
        var ass = EK.composeFrameAss({ W: W, H: H, ctaAss: cp.cta ? cp.cta.ass : "", ctaStart: cp.cta ? cp.cta.start : 0, progress: cp.progress });
        var yol = cikti("cerceve", k);
        var katman = await OR.render(K, { ass: ass, fontFiles: cp.cta ? cp.cta.fontFiles : [], g: W, y: H, fps: fps,
          sure: CT.katmanSuresi(dur, Number(ctx.end) || 0, fps, true), cikti: yol, assAd: "cerceve.ass", onek: "overlay-paket-",
          fontDizini: K.path.join(uzantiDizini(), "fonts"), logo: cp.logo, timeout: 1800000 });
        if (katman && katman.logoAtlandi) k.notlar.logo = "logo-yok";
        var yer = await K.call("KS_placeOverlay", { path: yol, at: 0, name: P.KATMAN.cerceve, expectSeqId: ctx.id }, 120000);
        if (!yer || !yer.ok) { sil(yol); return { ok: false, hata: (yer && yer.error) || "?" }; }
        return { ok: true };
      },

      metin: async function (k) {
        var kredi = job.secim.kredi ? krediMetni(job.lang) : "";
        var parsed = null;
        var cfg = job.metinAI && window.KCaptions && KCaptions.chatConfig ? KCaptions.chatConfig() : null;
        if (cfg) {
          var kayit = shortsKaydi(k);
          var segs = kayit && kayit.segs && kayit.segs.length ? kayit.segs : [{ start: 0, end: 1, text: k.neden || k.baslik }];
          var pr = P.packPrompt(segs, { lang: job.lang, genre: job.tur, title: k.baslik, hook: k.kanca });
          try {
            var icerik = await llm(cfg, { model: cfg.model, temperature: 0.7, response_format: { type: "json_object" },
              messages: [{ role: "system", content: pr.system }, { role: "user", content: pr.user }] });
            parsed = P.parsePack(icerik);
            if (!parsed.youtube && !parsed.tiktok && !parsed.reels) k.notlar.metinAi = "ai-bozuk";
          } catch (e) {
            K.log("[shorts-paket] paylaşım metni: " + (e && e.message ? e.message : e));
            k.notlar.metinAi = "ai-hata";
            parsed = null;
          }
        }
        return { ok: true, paylasim: P.paketMetni(parsed, k, { lang: job.lang, kredi: kredi }) };
      },

      kaydet: function (j) {
        try { K.settings().shortsPaketIs = j; K.saveSettings(); } catch (e) { K.log("[shorts-paket] iş kaydedilemedi: " + e.message); }
      },
      ilerleme: function (j, i, adim) {
        aktifAdim = { i: i, adim: adim };
        listeCiz(j);
        var k = j.kisalar[i];
        if (k && calisiyorMu) durum(T("Short") + " " + k.no + "/" + j.kisalar.length + " · " + T(ADIM_ETIKET[adim]) + "…");
      },
      iptalMi: function () { return iptalIstendi; },
      anaSekansaDon: async function (j) {
        if (j.kaynakId) await K.call("KS_openSequenceById", { id: j.kaynakId }, 60000);
      }
    };
  }

  /* ---------------- paylaşım paketi dosyaları ---------------- */

  async function dosyalariYaz(job) {
    var kisalar = job.kisalar.filter(function (k) { return k.paylasim || k.adimlar.sekans === "tamam"; });
    if (!kisalar.length) return null;
    var dir = "";
    try {
      var pd = await K.call("KS_projectDir", undefined, 15000);
      dir = pd && pd.ok && pd.dir ? String(pd.dir) : "";
    } catch (e) { dir = ""; }
    var ad = P.paketDosyaAdi(new Date(job.ts));
    var dil = arayuzDili();
    var tarih = new Date(job.ts).toLocaleString(dil === "en" ? "en-US" : "tr-TR");
    var txt = P.paylasimTxt(kisalar, { lang: dil, kaynak: job.kaynakAd, tarih: tarih });
    var csv = P.paylasimCsv(kisalar, { lang: dil });
    var adaylar = [dir, K.srtDir()].filter(Boolean);
    for (var i = 0; i < adaylar.length; i++) {
      try {
        K.fs.mkdirSync(adaylar[i], { recursive: true });
        var t = K.path.join(adaylar[i], ad + ".txt"), c = K.path.join(adaylar[i], ad + ".csv");
        K.fs.writeFileSync(t, txt, "utf8");
        K.fs.writeFileSync(c, csv, "utf8");
        return { dir: adaylar[i], txt: t, csv: c };
      } catch (e) { K.log("[shorts-paket] paket yazılamadı (" + adaylar[i] + "): " + e.message); }
    }
    return null;
  }

  function klasoruAc() {
    if (!sonKlasor) return;
    K.run(K.MAC ? "open" : "explorer", [sonKlasor]).catch(function () {});
  }

  /* ---------------- çalıştırma ---------------- */

  async function calistir(job, kaynakSegs) {
    calisiyorMu = true;
    iptalIstendi = false;
    sonKlasor = "";
    guncelle();
    listeCiz(job);
    var dosyalar = null;
    try {
      await P.runJob(job, bagimliliklar(job, kaynakSegs));
      if (job.secim.metin || job.kisalar.some(function (k) { return k.adimlar.sekans === "tamam"; })) dosyalar = await dosyalariYaz(job);
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      calisiyorMu = false;
      aktifAdim = null;
      listeCiz(job);
      if (dosyalar) sonKlasor = dosyalar.dir;
      guncelle();
    }
    var oz = P.ozet(job);
    var mesaj = (job.durum === "iptal" ? T("Paket durduruldu") : T("Shorts Paketi hazır")) + ": " + oz.bitenKisa + "/" + oz.kisa + " " + T("Short tamam") +
      (oz.hata ? " · " + oz.hata + " " + T("adım hatalı (Devam et ile yeniden dene)") : "") +
      (dosyalar ? " · " + T("paylaşım paketi klasörde") : "");
    durum(mesaj, oz.hata || job.durum === "iptal" ? "warn" : "good");
    KApp.toast(mesaj, oz.hata ? "warn" : "good", 10000, dosyalar ? { metin: T("Klasörü aç"), fn: klasoruAc } : null);
    if (oz.bitenKisa && KApp.davetAni) KApp.davetAni("shorts");
  }

  async function olustur() {
    if (calisiyorMu || !P) return;
    // Pro (deneme hakkı yok: tek seferde çok sayıda katman ve sekans üretir)
    if (typeof Pro !== "undefined" && !Pro.gate("shortsPaket")) return;
    if (window.KViral && KViral.mesgul && KViral.mesgul()) { durum(T("Viral anlar şu an meşgul, birazdan tekrar dene."), "warn"); return; }
    var anlar = window.KViral && KViral.paketAnlari ? KViral.paketAnlari() : [];
    if (!anlar.length) { durum(T(nedenMetni("secim-yok")), "warn"); return; }
    calisiyorMu = true;   // ilk await'ten ÖNCE: çift tıklama iki paket başlatmasın
    guncelle();
    var basladi = false;
    try {
      durum(T("Hazırlanıyor…"));
      var d = await KViral.sekansDenetle();
      if (d.uyari) { durum(T(d.uyari), "warn"); return; }
      var yet = await yetenekler();
      if (!yet.subsequence) { durum(T("Bu Premiere sürümü alt sekans oluşturmayı desteklemiyor."), "warn"); return; }
      var secim = secimOku();
      secimKaydet();
      if (!yet.autoReframe) {
        var onay = window.confirm ? window.confirm(uiMetni("Bu Premiere sürümünde Auto Reframe yok: 9:16 Shorts yapılamaz. Paket yatay sekanslarla hazırlansın mı?")) : false;
        if (!onay) { durum(T(nedenMetni("reframe-yok")), "warn"); return; }
        secim.yatay = true;
      }
      var kit = markaKiti();
      var plan = P.planla({ anlar: anlar, kit: kit, secim: secim, yetenek: yet });
      if (plan.hata) { durum(T(nedenMetni(plan.hata)), "warn"); return; }
      var ctx = window.KApp && KApp.ctx ? KApp.ctx() : {};
      var job = P.newJob({ plan: plan, kaynakId: d.sekans, kaynakAd: String(ctx.sequence || ""),
        lang: window.KCaptions && KCaptions.language ? KCaptions.language() : "tr", ts: Date.now() });
      job.tur = KViral.tur ? KViral.tur() : "";
      job.kancaStil = kit && kit.kanca.stil ? kit.kanca.stil : (el("kanca-stil") ? el("kanca-stil").value : "kutu");
      job.kancaSure = kit ? kit.kanca.sure : (Number(el("kanca-sure") ? el("kanca-sure").value : 3) || 3);
      plan.uyarilar.forEach(function (u) { K.log("[shorts-paket] " + nedenMetni(u)); });
      var kaynakSegs = KViral.kaynakSegs ? KViral.kaynakSegs() : null;
      basladi = true;
      calisiyorMu = false;   // calistir yeniden kurar
      await calistir(job, kaynakSegs);
      if (plan.uyarilar.length) KApp.toast(plan.uyarilar.map(function (u) { return T(nedenMetni(u)); }).join(" · "), "warn", 8000);
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      if (!basladi) { calisiyorMu = false; guncelle(); }
    }
  }

  async function devam() {
    if (calisiyorMu) return;
    if (typeof Pro !== "undefined" && !Pro.gate("shortsPaket")) return;
    var job = kayitliIs();
    if (!job) { guncelle(); return; }
    P.resumeJob(job);
    // panel yeniden açıldıysa arama transkripti yok: kayıtlı Shorts altyazısı ya da ekrandaki transkript kullanılır
    await calistir(job, window.KViral && KViral.kaynakSegs ? KViral.kaynakSegs() : null);
  }

  function iptal() {
    if (!calisiyorMu) return;
    iptalIstendi = true;
    durum(T("Sıradaki adımdan önce durduruluyor…"), "warn");
  }

  function init() {
    if (!P || !el("cap-paket")) return;
    stilleriCiz();
    secimYukle();
    logoNotu();
    el("cap-paket-olustur").addEventListener("click", olustur);
    el("cap-paket-iptal").addEventListener("click", iptal);
    el("cap-paket-devam").addEventListener("click", devam);
    el("cap-paket-klasor").addEventListener("click", klasoruAc);
    ["cap-paket-stil", "cap-paket-altyazi", "cap-paket-kanca", "cap-paket-ilerleme", "cap-paket-ilerleme-konum", "cap-paket-ilerleme-stil",
      "cap-paket-ilerleme-renk", "cap-paket-cta", "cap-paket-cta-metin", "cap-paket-cta-ozel", "cap-paket-logo", "cap-paket-metin", "cap-paket-kredi"].forEach(function (id) {
      if (el(id)) el(id).addEventListener("change", function () { ozelAlan(); secimKaydet(); });
    });
    // Paneli açınca: Altyazı sekmesindeki stil ve Marka Kiti logosu değişmiş olabilir
    el("cap-paket").addEventListener("toggle", function () {
      if (!el("cap-paket").open || calisiyorMu) return;
      var sec = el("cap-paket-stil").value;
      stilleriCiz();
      if (SE && SE.has(sec)) el("cap-paket-stil").value = sec;
      logoNotu();
      var j = kayitliIs();
      if (j && !el("cap-paket-liste").childNodes.length) listeCiz(j);
      guncelle();
    });
    var yarim = kayitliIs();
    if (yarim) listeCiz(yarim);
    guncelle();
  }

  return { init: init, guncelle: guncelle, calisiyor: function () { return calisiyorMu; } };
})();
