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
      vurguRenk: el("kanca-renk") ? el("kanca-renk").value : "#ffe600"
    };
    for (var k in ek || {}) if (Object.prototype.hasOwnProperty.call(ek, k)) o[k] = ek[k];
    return o;
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
    var dizin = K.path.join(K.tmpDir(), "overlay-kanca-" + Date.now());
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
    var ff = await K.findFfmpeg();
    if (!ff) { durum("Önizleme için ffmpeg gerekli (Ayarlar → ffmpeg).", "warn"); return; }
    busy = true;
    var is = null;
    try {
      durum("Önizleme hazırlanıyor…");
      var b = await sekansBoyutu();
      // onizleme kucuk: kisa kenar 540
      var olcek = 540 / Math.min(b.w, b.h);
      var w = Math.round(b.w * olcek / 2) * 2, h = Math.round(b.h * olcek / 2) * 2;
      var built = HT.build({ text: o.text, stil: o.stil, width: w, height: h, dur: o.dur, konum: o.konum, vurguRenk: o.vurguRenk });
      is = hazirla(built);
      var png = K.path.join(is.dizin, "onizleme.png");
      var r = await K.run(ff, ["-y", "-f", "lavfi", "-i", "color=c=0x1c2433:s=" + w + "x" + h + ":d=" + built.dur,
        "-vf", "subtitles=f=kanca.ass" + is.fontsdir, "-ss", String(Math.min(1.2, built.dur * 0.5)), "-frames:v", "1", png],
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
    if (typeof Pro !== "undefined" && !Pro.gate("overlay")) return false;
    if (busy || !HT) return false;
    var o = ayarlar(ek);
    if (!String(o.text).trim()) { durum("Önce bir başlık yaz.", "warn"); return false; }
    var ff = await K.findFfmpeg();
    if (!ff) { KApp.toast("Kanca başlığı için ffmpeg gerekli (Ayarlar → ffmpeg).", "bad"); return false; }
    busy = true;
    var btn = el("kanca-ekle");
    if (btn) btn.disabled = true;
    var is = null;
    try {
      durum("Başlık hazırlanıyor…");
      var b = await sekansBoyutu();
      if (!b.ok) throw new Error("Aktif sekans yok.");
      var built = HT.build({ text: o.text, stil: o.stil, width: b.w, height: b.h, dur: o.dur, konum: o.konum, vurguRenk: o.vurguRenk });
      is = hazirla(built);
      var cikti = K.path.join(K.srtDir(), "suflo-kanca-" + Date.now() + ".mov");
      K.fs.mkdirSync(K.path.dirname(cikti), { recursive: true });
      // alpha=1 + unpremultiply: altyazi katmaniyla ayni seffaflik zinciri
      var kaynak = "color=c=black@0.0:s=" + b.w + "x" + b.h + ":r=" + b.fps + ":d=" + built.dur +
        ",format=rgba,subtitles=f=kanca.ass:alpha=1" + is.fontsdir + ",unpremultiply=inplace=1";
      var r = await K.run(ff, ["-y", "-f", "lavfi", "-i", kaynak, "-c:v", "qtrle", "-an", cikti], { timeout: 300000, cwd: is.dizin });
      if (r.code !== 0 || !K.fs.existsSync(cikti)) {
        throw new Error("Başlık katmanı üretilemedi: " + String(r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 200));
      }
      durum("Timeline'a yerleştiriliyor…");
      var at = typeof o.at === "number" && isFinite(o.at) ? Math.max(0, o.at) : "playhead";
      var ad = "Suflo Kanca · " + String(o.text).replace(/\*/g, "").slice(0, 40);
      var yer = await K.call("KS_placeOverlay", { path: cikti, at: at, name: ad }, 120000);
      if (!yer.ok) throw new Error(yer.error);
      durum("");
      KApp.toast("Kanca başlığı " + yer.trackName + " katmanına eklendi" + (yer.newTrack ? " (yeni katman)" : ""), "good");
      return true;
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
      KApp.toast("Kanca başlığı eklenemedi: " + K.hataYardimi(e), "bad");
      return false;
    } finally {
      if (is) temizle(is.dizin);
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  function init() {
    if (!HT || !el("tab-kanca")) return;
    el("kanca-onizle").addEventListener("click", onizle);
    el("kanca-ekle").addEventListener("click", function () { ekle(); });
    el("kanca-metin").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); onizle(); }
    });
    // ayar degisince eski onizleme yaniltmasin
    ["kanca-stil", "kanca-sure", "kanca-konum", "kanca-renk"].forEach(function (id) {
      el(id).addEventListener("change", function () { if (!el("kanca-resim").hidden) onizle(); });
    });
  }

  return { init: init, ekle: ekle, onizle: onizle };
})();
