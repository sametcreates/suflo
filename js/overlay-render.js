/*
 * Suflo — şeffaf katman render'ı (ortak): ASS + fontlar → ffmpeg/libass → qtrle .mov
 *
 * captions.js'teki "Suflo Stilleri ile ekle" (overlayUygula) akışından çıkarıldı; deneme
 * çıktılarının satın alma sonrası temiz yeniden oluşturulması da aynı yolu kullanır.
 * Zincir: color=black@0 → format=rgba → subtitles(alpha=1) → unpremultiply → qtrle.
 *   alpha=1 ZORUNLU: yazılmazsa libass alfayı işlemez, video tamamen görünmez çıkar.
 *   unpremultiply: ffmpeg premultiplied üretir, Premiere straight bekler (koyu hale olmasın).
 *   qtrle: saydam karede ProRes 4444'ten ~12 kat küçük ve kayıpsız.
 * ffmpeg altyazı filtresi mutlak yol kabul etmez: ASS ve fontlar geçici klasöre yazılır,
 * ffmpeg orada çalışır (fontsdir=. göreli).
 *
 * K (bridge.js arayüzü) dışarıdan verilir; bu yüzden modül sahte K ile node'da test edilir.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloOverlayRender = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // ProRes 4:4:4 tek sayı boyut kabul etmez; qtrle için de zararsız
  function ciftBoyut(n) {
    n = Math.round(Number(n) || 0);
    return n + (n % 2);
  }

  function kaynak(o) {
    return "color=c=black@0.0:s=" + o.g + "x" + o.y + ":r=" + o.fps + ":d=" + o.sure +
      ",format=rgba,subtitles=f=" + (o.assAd || "altyazi.ass") + ":alpha=1" + (o.fontsdir || "") + ",unpremultiply=inplace=1";
  }

  function ffmpegArgs(src, cikti) {
    return ["-y", "-f", "lavfi", "-i", src, "-c:v", "qtrle", "-an", cikti];
  }

  function uzantiFontlari(K) {
    var kok;
    try { kok = decodeURI(K.extensionPath()); } catch (e) { kok = K.extensionPath(); }
    return K.path.join(kok, "fonts");
  }

  function klasoruSil(K, dizin) {
    try {
      K.fs.readdirSync(dizin).forEach(function (f) { try { K.fs.unlinkSync(K.path.join(dizin, f)); } catch (e) {} });
      K.fs.rmdirSync(dizin);
    } catch (e2) {}
  }

  function stderrSonu(r, n) {
    return String(r && r.stderr || "").split("\n").filter(function (s) { return s.trim(); }).slice(-(n || 3)).join(" ").slice(0, 200);
  }

  /*
   * o: { ass, fontFiles, g, y, fps, sure, cikti?, assAd?, onek?, fontDizini?, timeout?, durum?(msg), hataOneki? }
   * Döner: { path, g, y, fps, sure }. Hata: Error (geçici klasör her durumda silinir).
   */
  async function render(K, o) {
    o = o || {};
    var g = ciftBoyut(o.g), y = ciftBoyut(o.y);
    var fps = Number(o.fps) > 0 ? Number(o.fps) : 25;
    var sure = Number(o.sure);
    if (!(g > 0 && y > 0 && sure > 0)) throw new Error("Katman boyutu ya da süresi geçersiz.");
    if (typeof o.ass !== "string" || !o.ass) throw new Error("Yazılacak altyazı yok.");
    var assAd = o.assAd || "altyazi.ass";
    // "overlay-" öneki: yarıda kalan klasörü bridge.js sweepTemp bir gün sonra süpürür
    var dizin = K.path.join(K.tmpDir(), (o.onek || "overlay-") + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
    K.fs.mkdirSync(dizin, { recursive: true });
    try {
      K.fs.writeFileSync(K.path.join(dizin, assAd), o.ass, "utf8");
      var fontsdir = "";
      var fontKok = o.fontDizini || uzantiFontlari(K);
      (o.fontFiles || []).filter(Boolean).forEach(function (f) {
        var ad = K.path.basename(String(f));   // yalnız dosya adı: kayıttan gelen yol klasör dışına çıkamaz
        try {
          var src = K.path.join(fontKok, ad);
          if (K.fs.existsSync(src)) {
            K.fs.copyFileSync(src, K.path.join(dizin, ad));
            fontsdir = ":fontsdir=.";
          } else if (K.log) K.log("[katman] paket font dosyası yok: " + src);
        } catch (eF) { if (K.log) K.log("[katman] font kopyalanamadı: " + eF.message); }
      });

      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı.");
      if (K.libassUyarisi && K.libassUyarisi()) throw new Error(K.libassUyarisi());

      var cikti = o.cikti || K.path.join(K.srtDir(), "suflo-altyazi-" + Date.now() + ".mov");
      K.fs.mkdirSync(K.path.dirname(cikti), { recursive: true });
      if (typeof o.durum === "function") o.durum("Altyazı katmanı hazırlanıyor… (" + Math.round(sure) + " sn)");
      var r = await K.run(ff, ffmpegArgs(kaynak({ g: g, y: y, fps: fps, sure: sure, assAd: assAd, fontsdir: fontsdir }), cikti),
        { timeout: o.timeout || 3600000, cwd: dizin });
      if (r.code !== 0 || !K.fs.existsSync(cikti)) {
        throw new Error(o.hataOneki ? o.hataOneki + stderrSonu(r, 3) : "Altyazı katmanı üretilemedi: " + stderrSonu(r, 3));
      }
      return { path: cikti, g: g, y: y, fps: fps, sure: sure };
    } finally {
      klasoruSil(K, dizin);
    }
  }

  /*
   * Satın alma sonrası: deneme çıktısını (filigranlı) filigransız yeniden üret ve değiştir.
   *   1) Premiere'de kaydın sekansı açık olmalı (değilse "O sekansı aç")
   *   2) kaydedilen temiz ASS aynı boyut/fps/süreyle yeniden render edilir
   *   3) KS_placeOverlay ile kaydın başlangıcına konur
   *   4) YALNIZ yerleştirme başarılıysa eski katman KS_removeOverlay ile kaldırılır: yalnız
   *      {path} verilir, ASLA nodeId verilmez (host.jsx: nodeId eşleşmesi kullanıcının eski
   *      kliplerini silebiliyordu). Deneme dosyasının yolu benzersizdir (zaman damgalı).
   * Döner: { ok, hata?, sekansAc?, yer?, kaldirilan?, kaldirmaHatasi?, path? }
   */
  async function temizYenidenOlustur(K, kayit, o) {
    o = o || {};
    if (!kayit || typeof kayit.assTemiz !== "string" || !kayit.path || !kayit.sequenceId) {
      return { ok: false, hata: "Deneme kaydı okunamadı." };
    }
    var sekansMesaji = kayit.sekans ? "O sekansı aç: " + kayit.sekans + "." : "O sekansı aç.";
    async function ayniSekans() {
      var c = await K.call("KS_getContext", undefined, 15000);
      if (!c || c.ok === false) return { ok: false, hata: (c && c.error) || "Premiere yanıt vermedi." };
      if (!c.sequenceId || String(c.sequenceId) !== String(kayit.sequenceId)) return { ok: false, sekansAc: true, hata: sekansMesaji };
      return { ok: true };
    }
    var s1 = await ayniSekans();
    if (!s1.ok) return s1;

    var cikti = K.path.join(K.srtDir(), "suflo-temiz-" + (kayit.tur === "kanca" ? "kanca" : "altyazi") + "-" + Date.now() + ".mov");
    function ciktiyiSil() { try { K.fs.unlinkSync(cikti); } catch (e) {} }
    try {
      await render(K, {
        ass: kayit.assTemiz, fontFiles: kayit.fontFiles, g: kayit.g, y: kayit.y, fps: kayit.fps, sure: kayit.sure,
        cikti: cikti, assAd: kayit.tur === "kanca" ? "kanca.ass" : "altyazi.ass", onek: "overlay-temiz-",
        fontDizini: o.fontDizini, durum: o.durum
      });
    } catch (e) {
      ciktiyiSil();
      return { ok: false, hata: e && e.message ? e.message : String(e) };
    }
    // Render dakikalar sürebilir: bu arada başka sekansa geçildiyse yanlış sekansa koyma
    var s2 = await ayniSekans();
    if (!s2.ok) { ciktiyiSil(); return s2; }

    var yer = await K.call("KS_placeOverlay", { path: cikti, at: kayit.start, name: kayit.ad || "Suflo Stil" }, 120000);
    if (!yer || !yer.ok) {
      ciktiyiSil();
      return { ok: false, hata: (yer && yer.error) || "Temiz katman timeline'a konamadı." };
    }
    var kal = await K.call("KS_removeOverlay", { path: kayit.path }, 60000);
    return {
      ok: true, yer: yer, path: cikti,
      kaldirilan: kal && kal.ok ? (Number(kal.removed) || 0) : 0,
      kaldirmaHatasi: kal && kal.ok ? "" : ((kal && kal.error) || "Eski katman kaldırılamadı.")
    };
  }

  /*
   * Deneme (filigranlı) çıktısını, satın alma sonrası temiz yeniden oluşturulsun diye kaydet.
   * Katman az önce konduğu için etkin sekans o sekanstır: kimliği taze sorulur.
   * k: { tur, start, path, ad, assTemiz, fontFiles, g, y, fps, sure }. Hata işlemi bozmaz (false).
   */
  async function denemeKaydet(K, Pro, k) {
    if (!Pro || !Pro.denemeCiktisiEkle || !k) return false;
    try {
      var c = await K.call("KS_getContext", undefined, 15000);
      if (!c || c.ok === false || !c.sequenceId) return false;
      k.sequenceId = String(c.sequenceId);
      k.sekans = String(c.sequence || "");
      k.ts = Date.now();
      return Pro.denemeCiktisiEkle(k) === true;
    } catch (e) { return false; }
  }

  return { ciftBoyut: ciftBoyut, kaynak: kaynak, ffmpegArgs: ffmpegArgs, render: render, temizYenidenOlustur: temizYenidenOlustur, denemeKaydet: denemeKaydet };
});
