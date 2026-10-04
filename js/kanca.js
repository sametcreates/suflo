/*
 * Suflo — Kanca başlığı (Shorts / Reels açılış başlık kartı)
 * ASS'i js/hook-title.js üretir (saf, testli); burada ffmpeg/libass ile
 * şeffaf .mov'a çevrilir ve KS_placeOverlay ile playhead'e (ya da verilen
 * ana) en üstteki boş video katmanına konur. Önizleme tek kare PNG'dir.
 */
window.KKanca = (function () {
  "use strict";

  var HT = window.SufloHookTitle;
  var busy = false;

  function el(id) { return document.getElementById(id); }

  function durum(msg, cls) {
    var e = el("kanca-durum");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function uzantiDizini() {
    try { return decodeURI(K.extensionPath()); } catch (e) { return K.extensionPath(); }
  }

  function ayarlar(ek) {
    var o = {
      text: el("kanca-metin") ? el("kanca-metin").value : "",
      stil: el("kanca-stil") ? el("kanca-stil").value : "kutu",
      dur: Number(el("kanca-sure") ? el("kanca-sure").value : 3) || 3,
      konum: el("kanca-konum") ? el("kanca-konum").value : "ust",
      vurguRenk: el("kanca-renk") ? el("kanca-renk").value : "#ffe600",
      lang: window.KCaptions && KCaptions.language ? KCaptions.language() : "tr"
    };
    for (var k in ek || {}) if (Object.prototype.hasOwnProperty.call(ek, k)) o[k] = ek[k];
    // Marka Kiti acikken: yazi tipi, yazi rengi ve vurgu rengi kitten (stil ve sure karttaki secim)
    var kit = markaKiti();
    if (kit && window.SufloMarkaKiti) o = window.SufloMarkaKiti.mergeHook(o, kit);
    return o;
  }

  // Kayitli Marka Kiti (Ayarlar), yalniz aciksa
  function markaKiti() {
    try {
      var MK = window.SufloMarkaKiti;
      if (!MK || typeof K === "undefined" || !K.settings) return null;
      var kit = MK.normalize(K.settings().markaKiti).kit;
      return kit.on ? kit : null;
    } catch (e) { return null; }
  }

  function kitIpucu() {
    var e = el("kanca-kit-not");
    if (e) e.hidden = !markaKiti();
  }

  function insaEt(o, w, h) {
    return HT.build({ text: o.text, stil: o.stil, width: w, height: h, dur: o.dur, konum: o.konum, vurguRenk: o.vurguRenk,
      renk: o.renk, font: o.font, lang: o.lang });
  }

  async function sekansBoyutu() {
    try {
      var spec = await K.call("KS_overlaySpec", {});
      if (spec && spec.ok && spec.width > 0 && spec.height > 0) {
        return { w: spec.width + (spec.width % 2), h: spec.height + (spec.height % 2), fps: spec.fps > 0 ? spec.fps : 25, ok: true };
      }
    } catch (e) {}
    return { w: 1920, h: 1080, fps: 25, ok: false };
  }

  // ASS + fontlari gecici klasore yaz (ffmpeg filtresi goreli yol ister)
  function hazirla(built) {
    var dizin = K.path.join(K.tmpDir(), "overlay-kanca-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
    K.fs.mkdirSync(dizin, { recursive: true });
    K.fs.writeFileSync(K.path.join(dizin, "kanca.ass"), built.ass, "utf8");
    var fontsdir = "";
    built.fontFiles.forEach(function (f) {
      try {
        var kaynak = K.path.join(uzantiDizini(), "fonts", f);
        if (K.fs.existsSync(kaynak)) { K.fs.copyFileSync(kaynak, K.path.join(dizin, f)); fontsdir = ":fontsdir=."; }
      } catch (e) { K.log("[kanca] font kopyalanamadı: " + e.message); }
    });
    return { dizin: dizin, fontsdir: fontsdir };
  }

  function temizle(dizin) {
    try {
      K.fs.readdirSync(dizin).forEach(function (f) { try { K.fs.unlinkSync(K.path.join(dizin, f)); } catch (e) {} });
      K.fs.rmdirSync(dizin);
    } catch (e) {}
  }

  async function onizle() {
    if (busy || !HT) return;
    var o = ayarlar();
    if (!String(o.text).trim()) { durum("Önce bir başlık yaz.", "warn"); return; }
    busy = true;   // ilk await'ten ONCE: cift tiklama iki render baslatmasin
    var is = null;
    try {
      var ff = await K.findFfmpeg();
      if (!ff) { durum("Önizleme için ffmpeg gerekli (Ayarlar → ffmpeg).", "warn"); return; }
      if (K.libassUyarisi && K.libassUyarisi()) { durum(K.libassUyarisi(), "warn"); return; }
      durum("Önizleme hazırlanıyor…");
      var b = await sekansBoyutu();
      // onizleme kucuk: kisa kenar 540
      var olcek = 540 / Math.min(b.w, b.h);
      var w = Math.round(b.w * olcek / 2) * 2, h = Math.round(b.h * olcek / 2) * 2;
      var built = insaEt(o, w, h);
      is = hazirla(built);
      var png = K.path.join(is.dizin, "onizleme.png");
      var r = await K.run(ff, ["-y", "-f", "lavfi", "-i", "color=c=0x1c2433:s=" + w + "x" + h + ":d=" + built.dur,
        "-vf", "subtitles=f=kanca.ass" + is.fontsdir + (h > w * 1.2 ? "," + HT.safeZoneFilter(w, h) : ""), "-ss", String(Math.min(1.2, built.dur * 0.5)), "-frames:v", "1", png],
        { timeout: 60000, cwd: is.dizin });
      if (r.code !== 0 || !K.fs.existsSync(png)) throw new Error("Önizleme üretilemedi: " + String(r.stderr || "").split("\n").slice(-2).join(" ").slice(0, 160));
      var img = el("kanca-resim");
      img.src = "data:image/png;base64," + K.fs.readFileSync(png).toString("base64");
      img.hidden = false;
      durum(b.ok ? "" : "Sekans açık değil: 16:9 varsayıldı.");
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      if (is) temizle(is.dizin);
      busy = false;
    }
  }

  /*
   * Basligi timeline'a ekle.
   *   ek.text / ek.at (sn; verilmezse playhead) — Viral anlar kartlari kullanir
   */
  async function ekle(ek) {
    // Pro (ucretsizde stilli katmanla ortak 3 deneme hakki; deneme ciktisi filigranli)
    if (typeof Pro !== "undefined" && !Pro.gate("overlay", { deneme: true, yeniden: function () { ekle(ek); } })) return false;
    if (!HT) return false;
    if (busy) { KApp.toast("Kanca başlığı şu an hazırlanıyor, birazdan tekrar dene.", "warn"); return false; }
    var o = ayarlar(ek);
    if (!String(o.text).trim()) { durum("Önce bir başlık yaz.", "warn"); return false; }
    busy = true;   // ilk await'ten ONCE: cift tiklama iki katman koymasin
    var btn = el("kanca-ekle");
    if (btn) btn.disabled = true;
    try {
      var ff = await K.findFfmpeg();
      if (!ff) { KApp.toast("Kanca başlığı için ffmpeg gerekli (Ayarlar → ffmpeg).", "bad"); return false; }
      if (K.libassUyarisi && K.libassUyarisi()) throw new Error(K.libassUyarisi());
      durum("Başlık hazırlanıyor…");
      var b = await sekansBoyutu();
      if (!b.ok) throw new Error("Aktif sekans yok.");
      var built = insaEt(o, b.w, b.h);
      // Deneme (Pro degil): sag ustte kucuk suflo.app filigrani; temiz ASS satin alma sonrasi icin saklanir
      var filigranli = typeof Pro !== "undefined" && !!Pro.filigranGerekli && Pro.filigranGerekli();
      if (filigranli && !window.SufloFiligran) throw new Error("Deneme filigranı yüklenemedi.");
      if (!window.SufloOverlayRender) throw new Error("Katman modülü yüklenemedi.");
      var cikti = K.path.join(K.srtDir(), "suflo-kanca-" + Date.now() + ".mov");
      // Ortak render (js/overlay-render.js): alpha=1 + unpremultiply, altyazi katmaniyla ayni seffaflik zinciri
      await window.SufloOverlayRender.render(K, {
        ass: filigranli ? window.SufloFiligran.ekle(built.ass, { width: b.w, height: b.h }) : built.ass,
        fontFiles: built.fontFiles, g: b.w, y: b.h, fps: b.fps, sure: built.dur, cikti: cikti,
        assAd: "kanca.ass", onek: "overlay-kanca-", fontDizini: K.path.join(uzantiDizini(), "fonts"), timeout: 300000,
        hataOneki: "Başlık katmanı üretilemedi: "
      });
      durum("Timeline'a yerleştiriliyor…");
      var at = typeof o.at === "number" && isFinite(o.at) ? Math.max(0, o.at) : "playhead";
      var ad = "Suflo Kanca · " + String(o.text).replace(/\*/g, "").slice(0, 40);
      var yer = await K.call("KS_placeOverlay", { path: cikti, at: at, name: ad }, 120000);
      if (!yer.ok) throw new Error(yer.error);
      durum("");
      KApp.toast("Kanca başlığı " + yer.trackName + " katmanına eklendi" + (yer.newTrack ? " (yeni katman)" : ""), "good");
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("overlay", KApp.toast);   // deneme: yalniz basarida
      if (filigranli && window.SufloOverlayRender) {
        await SufloOverlayRender.denemeKaydet(K, Pro, {
          tur: "kanca", start: typeof yer.start === "number" ? yer.start : (typeof at === "number" ? at : 0), path: cikti, ad: ad,
          assTemiz: built.ass, fontFiles: built.fontFiles, g: b.w, y: b.h, fps: b.fps, sure: built.dur
        });
      }
      return true;
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
      KApp.toast("Kanca başlığı eklenemedi: " + K.hataYardimi(e), "bad");
      return false;
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  // Transkriptten AI kanca onerileri; tiklayinca baslik kutusuna yazilir
  async function aiOner() {
    if (busy || !window.KCaptions) return;
    var segs = KCaptions.getSegments ? KCaptions.getSegments() : [];
    if (!segs.length) { durum("Önce Altyazı sekmesinde transkript oluştur.", "warn"); return; }
    var cfg = KCaptions.chatConfig && KCaptions.chatConfig();
    if (!cfg) {
      if (window.KOnboarding) KOnboarding.anahtarIste("Kanca önerileri");
      else KApp.toast("AI önerisi için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad");
      return;
    }
    busy = true;
    var btn = el("kanca-ai");
    btn.disabled = true;
    durum("Kanca başlıkları yazılıyor…");
    try {
      var p = HT.suggestPrompt(segs, { lang: KCaptions.language ? KCaptions.language() : "tr" });
      var json = await KCaptions.chatCall(cfg, {
        model: cfg.model, temperature: 0.8, response_format: { type: "json_object" },
        messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }]
      });
      var oneriler = HT.parseSuggestions(json.choices && json.choices[0] && json.choices[0].message.content);
      if (!oneriler.length) throw new Error("Öneri alınamadı, tekrar dene.");
      var box = el("kanca-oneriler");
      box.innerHTML = "";
      oneriler.forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "kanca-oneri";
        // *vurgu* kelimesi kalin gosterilir (textContent: HTML enjeksiyonu yok)
        o.split(/(\*[^*]+\*)/).forEach(function (parca) {
          if (!parca) return;
          if (/^\*[^*]+\*$/.test(parca)) { var v = document.createElement("b"); v.textContent = parca.slice(1, -1); b.appendChild(v); }
          else b.appendChild(document.createTextNode(parca));
        });
        b.addEventListener("click", function () {
          el("kanca-metin").value = o;
          el("kanca-resim").hidden = true;
          onizle();
        });
        box.appendChild(b);
      });
      box.hidden = false;
      durum("");
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }

  function init() {
    if (!HT || !el("tab-kanca")) return;
    el("kanca-onizle").addEventListener("click", onizle);
    if (el("kanca-ai")) el("kanca-ai").addEventListener("click", aiOner);
    el("kanca-ekle").addEventListener("click", function () { ekle(); });
    // metin degisince eski onizleme yaniltmasin
    el("kanca-metin").addEventListener("input", function () { el("kanca-resim").hidden = true; });
    el("kanca-metin").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); onizle(); }
    });
    // ayar degisince eski onizleme yaniltmasin
    ["kanca-stil", "kanca-sure", "kanca-konum", "kanca-renk"].forEach(function (id) {
      el(id).addEventListener("change", function () { if (!el("kanca-resim").hidden) onizle(); });
    });
    kitIpucu();
  }

  // Marka Kiti degisti (Ayarlar): ipucu ve acik onizleme guncellenir
  function kitDegisti() {
    kitIpucu();
    var img = el("kanca-resim");
    if (img && !img.hidden) onizle();
  }

  return { init: init, ekle: ekle, onizle: onizle, kitDegisti: kitDegisti };
})();
