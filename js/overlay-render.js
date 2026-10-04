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
  // Marka Kiti logo yerlesimi (saf); yoksa logo verilen x/y ile kullanilir
  var MK = (root && root.SufloMarkaKiti) || null;
  if (!MK && typeof require === "function") { try { MK = require("./marka-kiti.js"); } catch (e) { MK = null; } }
  var api = factory(MK);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloOverlayRender = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (MK) {
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

  /*
   * Marka Kiti logosu: { name (geçici klasördeki göreli ad), lw (genişlik px), x, y (sayı ya da
   * "<alt kenar>-overlay_h") }. Sayılar ve ad doğrulanır: argümana tırnaksız yazılır.
   */
  function logoGecerli(logo) {
    return !!(logo && /^logo\.(png|jpe?g)$/i.test(String(logo.name || "")) &&
      Number(logo.lw) >= 2 && isFinite(Number(logo.lw)) && isFinite(Number(logo.x)) &&
      /^\d+(-overlay_h)?$/.test(String(logo.y)));
  }

  // [giris][logo] → logo bindirme. Ölçeklenen logo straight alfa (format=rgba); bindirme
  // unpremultiply'dan SONRA: önce yapılırsa logo rengi ikiye katlanıyor (denendi)
  function logoFiltresi(logo, giris, logoGiris) {
    return logoGiris + "scale=" + Math.round(Number(logo.lw)) + ":-2,format=rgba[l];" +
      giris + "[l]overlay=x=" + Math.round(Number(logo.x)) + ":y=" + logo.y + ":format=auto:shortest=1";
  }

  /*
   * Katman render'ının ffmpeg argümanları.
   * o: { assName, fontsdir ("." ya da ""), w, h, fps, dur, logo?, out }
   * logo yoksa bugünkü argümanların AYNISI (kaynak + ffmpegArgs).
   */
  function buildArgs(o) {
    o = o || {};
    var src = kaynak({ g: o.w, y: o.h, fps: o.fps, sure: o.dur, assAd: o.assName,
      fontsdir: o.fontsdir ? ":fontsdir=" + o.fontsdir : "" });
    if (!logoGecerli(o.logo)) return ffmpegArgs(src, o.out);
    return ["-y", "-f", "lavfi", "-i", src, "-loop", "1", "-i", o.logo.name,
      "-filter_complex", logoFiltresi(o.logo, "[0:v]", "[1:v]"), "-c:v", "qtrle", "-an", o.out];
  }

  /*
   * Panel önizlemesi (webm) aynı yerleşimle: stil + logo + isteğe bağlı güvenli alan kutuları.
   * o: { assName, w, h, dur, kare? (göreli ya da mutlak arka plan resmi), logo?, ekVf?, out }
   */
  function previewArgs(o) {
    o = o || {};
    var d = Number(o.dur).toFixed(2);
    var vf = "ass=" + o.assName + ":fontsdir=.";
    var args = ["-y"], on = "";
    if (o.kare) {
      args.push("-loop", "1", "-i", o.kare, "-t", d);
      on = "scale=" + o.w + ":" + o.h + ":force_original_aspect_ratio=increase,crop=" + o.w + ":" + o.h + ",";
    } else {
      args.push("-f", "lavfi", "-i", "color=c=#101522:s=" + o.w + "x" + o.h + ":r=24:d=" + d);
    }
    var ek = o.ekVf ? "," + o.ekVf : "";
    if (logoGecerli(o.logo)) {
      args.push("-loop", "1", "-i", o.logo.name, "-filter_complex",
        "[0:v]" + on + vf + "[s];" + logoFiltresi(o.logo, "[s]", "[1:v]") + ek);
      if (!o.kare) args.push("-t", d);
    } else {
      args.push("-vf", on + vf + ek);
    }
    args.push("-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0", "-pix_fmt", "yuv420p", "-an", o.out);
    return args;
  }

  /*
   * Kayıttaki logo ayarı ({ path, kose, oran, guvenli }) → geçici klasördeki kopya + yerleşim.
   * Dosya yoksa / okunamıyorsa null (katman logosuz üretilir, çağıran kullanıcıya söyler).
   */
  function logoHazirla(K, dizin, logo, w, h) {
    if (!logo || !logo.path) return null;
    var uzanti = (String(logo.path).match(/\.(png|jpe?g)$/i) || [])[1];
    if (!uzanti) return null;
    try {
      if (!K.fs.existsSync(logo.path)) return null;
      var ad = "logo." + uzanti.toLowerCase();
      K.fs.copyFileSync(logo.path, K.path.join(dizin, ad));
      var yer = MK ? MK.logoPlacement(w, h, logo.kose, logo.oran, logo.guvenli)
        : { lw: Math.max(2, Math.round(w * 0.14 / 2) * 2), x: Math.round(Math.min(w, h) * 0.04), yExpr: String(Math.round(Math.min(w, h) * 0.04)) };
      return { name: ad, lw: yer.lw, x: yer.x, y: yer.yExpr };
    } catch (e) {
      if (K.log) K.log("[katman] logo kopyalanamadı: " + e.message);
      return null;
    }
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
   * o: { ass, fontFiles, g, y, fps, sure, cikti?, assAd?, onek?, fontDizini?, timeout?, durum?(msg), durumMetni?,
   *      hataOneki?, logo?: { path, kose, oran, guvenli } }
   * Döner: { path, g, y, fps, sure, logo: bool, logoAtlandi: bool }. Hata: Error (geçici klasör her durumda silinir).
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
      var logo = o.logo ? logoHazirla(K, dizin, o.logo, g, y) : null;
      if (typeof o.durum === "function") o.durum((o.durumMetni || "Altyazı katmanı hazırlanıyor…") + " (" + Math.round(sure) + " sn)");
      var r = await K.run(ff, buildArgs({ assName: assAd, fontsdir: fontsdir ? "." : "", w: g, h: y, fps: fps, dur: sure, logo: logo, out: cikti }),
        { timeout: o.timeout || 3600000, cwd: dizin });
      if (r.code !== 0 || !K.fs.existsSync(cikti)) {
        throw new Error(o.hataOneki ? o.hataOneki + stderrSonu(r, 3) : "Altyazı katmanı üretilemedi: " + stderrSonu(r, 3));
      }
      return { path: cikti, g: g, y: y, fps: fps, sure: sure, logo: !!logo, logoAtlandi: !!(o.logo && o.logo.path && !logo) };
    } finally {
      klasoruSil(K, dizin);
    }
  }

  // Türkçe ondalık: 12.5 → "12,5"
  function saniyeMetni(x) {
    var n = Math.round((Number(x) || 0) * 10) / 10;
    return String(n).replace(".", ",");
  }

  /*
   * Deneme katmanı timeline'da ilk konduğu gibi mi? Tek örnek; başlangıcı kayıttaki an;
   * baştan ve sondan kırpılmamış; hızı değişmemiş. Yalnız o zaman "yeni temiz klibi koy,
   * eskisini kaldır" kurguyu bozmaz. ornekler: KS_overlayInstances çıktısı (sn).
   * Tolerans: başlangıç ve giriş için yarım kare, süre için bir kare (render kare yuvarlaması).
   */
  function ilkHalinde(kayit, ornekler, kare) {
    if (!kayit || !ornekler || ornekler.length !== 1) return false;
    var o = ornekler[0];
    var k = Number(kare) > 0 ? Number(kare) : (Number(kayit.fps) > 0 ? 1 / Number(kayit.fps) : 1 / 24);
    if (Number(kayit.fps) > 0) k = Math.max(k, 1 / Number(kayit.fps));
    var yarim = k / 2 + 0.002, tam = k + 0.002;
    var bas = Number(o.start), bit = Number(o.end), gir = Number(o.inPoint), cik = Number(o.outPoint), sure = Number(kayit.sure);
    if (![bas, bit, gir, cik, sure, Number(kayit.start)].every(function (x) { return isFinite(x) && x >= 0; })) return false;
    return Math.abs(bas - Number(kayit.start)) <= yarim &&
      Math.abs(gir) <= yarim &&
      Math.abs(cik - sure) <= tam &&
      Math.abs((bit - bas) - sure) <= tam;
  }

  // Düzenlenmiş deneme klibi: timeline'a dokunulmaz, temiz dosya elle bağlanır (Replace Footage)
  function elleMesaji(kayit, temizYol) {
    var ad = kayit && kayit.ad ? kayit.ad : "Suflo Stil";
    return "Deneme klibi timeline'da düzenlenmiş (taşınmış, kırpılmış, bölünmüş ya da kopyalanmış); kurgun bozulmasın diye Suflo ona dokunmadı. " +
      "Proje panelinde \"" + ad + "\" öğesine sağ tıkla, Replace Footage ile temiz dosyayı seç (düzenlemelerin korunur), sonra listeden çıkar. Temiz dosya: " + temizYol;
  }

  /*
   * Başarılı temiz yeniden oluşturma için bildirim: { metin, tur: "good"|"warn" }.
   *   degistir:  deneme dosyası projede yerinde temiz olanla değiştirildi (düzenlemeler korunur)
   *   yerineKoy: tek, düzenlenmemiş klip vardı: temiz klip aynı ana kondu, eskisi kaldırıldı
   *   yerlestir: bu sekansta deneme klibi yoktu: temiz klip ilk konduğu ana kondu
   */
  function sonucMesaji(r) {
    r = r || {};
    if (r.yontem === "degistir") {
      var kalan = Number(r.degismeyen) || 0;
      return kalan > 0
        ? { metin: "Filigran kısmen kaldırıldı: " + kalan + " proje öğesi değiştirilemedi. Proje panelinde ona sağ tıkla, Replace Footage ile temiz dosyayı seç: " + (r.path || ""), tur: "warn" }
        : { metin: "Filigran kaldırıldı: deneme dosyası projede temiz olanla değiştirildi, timeline'daki düzenlemelerin aynen duruyor", tur: "good" };
    }
    var iz = r.yer && r.yer.trackName ? r.yer.trackName : "V?";
    if (r.yontem === "yerlestir") {
      var an = r.yer && typeof r.yer.start === "number" ? r.yer.start : 0;
      return { metin: "Bu sekansta deneme klibi bulunamadı: temiz katman ilk konduğu yere kondu (" + iz + ", " + saniyeMetni(an) + " sn)", tur: "warn" };
    }
    var eski = r.kaldirmaHatasi ? " · eski filigranlı katman kaldırılamadı, elle sil"
      : (Number(r.kaldirilan) > 0 ? "" : " · eski filigranlı katman bulunamadı, varsa elle sil");
    return { metin: "Temiz katman " + iz + " katmanına kondu" + eski, tur: eski ? "warn" : "good" };
  }

  /*
   * Satın alma sonrası: deneme çıktısını (filigranlı) filigransız yeniden üret ve değiştir.
   *   1) Premiere'de kaydın sekansı açık olmalı (değilse "O sekansı aç")
   *   2) kaydedilen temiz ASS aynı boyut/fps/süreyle yeniden render edilir
   *   3) ÖNCE yerinde değiştirme: KS_swapOverlayMedia projedeki deneme öğesini temiz dosyaya
   *      bağlar (changeMediaPath). Kullanıcının taşıdığı, kırptığı, böldüğü, kopyaladığı her
   *      klip ve eklediği efektler olduğu gibi kalır. Proje düzeyinde: sekans değişse de güvenli.
   *   4) Değiştirilemezse (yedek yol) sekans yeniden doğrulanır ve deneme klibinin ŞİMDİKİ hâline
   *      bakılır (KS_overlayInstances, yalnız okur):
   *        - tek ve ilk hâlinde klip: temiz klip kaydın başlangıcına konur, YALNIZ yerleştirme
   *          başarılıysa eskisi KS_removeOverlay ile kaldırılır: yalnız {path} verilir, ASLA nodeId
   *          (host.jsx: nodeId eşleşmesi kullanıcının eski kliplerini silebiliyordu)
   *        - hiç klip yok: temiz klip kaydın başlangıcına konur (kaldırılacak bir şey yok)
   *        - düzenlenmiş (taşınmış/kırpılmış/bölünmüş/çoğaltılmış): timeline'a DOKUNULMAZ; temiz
   *          dosya bırakılır ve elle bağlama (Replace Footage) yolu söylenir ({ elle: true })
   * Döner: { ok, hata?, sekansAc?, elle?, yontem?, yer?, kaldirilan?, kaldirmaHatasi?, degisen?, degismeyen?, path? }
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
        fontDizini: o.fontDizini, durum: o.durum, logo: kayit.logo || null
      });
    } catch (e) {
      ciktiyiSil();
      return { ok: false, hata: e && e.message ? e.message : String(e) };
    }

    // 3) yerinde değiştir: timeline'daki her düzenleme korunur
    var sw = await K.call("KS_swapOverlayMedia", { path: kayit.path, newPath: cikti }, 60000);
    var degisen = sw && sw.ok ? (Number(sw.swapped) || 0) : 0;
    if (degisen > 0) {
      return { ok: true, yontem: "degistir", path: cikti, degisen: degisen, degismeyen: Math.max(0, (Number(sw.items) || 0) - degisen) };
    }
    var sebep = (sw && (sw.reason || sw.error)) || "-";
    if (K.log) K.log("[temiz] yerinde değiştirilemedi: " + sebep);

    // 4) yedek yol. Render dakikalar sürebilir: bu arada başka sekansa geçildiyse yanlış sekansa koyma
    var s2 = await ayniSekans();
    if (!s2.ok) { ciktiyiSil(); return s2; }
    var d = await K.call("KS_overlayInstances", { path: kayit.path }, 30000);
    if (!d || !d.ok) {
      ciktiyiSil();
      return { ok: false, hata: (d && d.error) || "Premiere yanıt vermedi." };
    }
    var ornekler = d.instances || [];
    if (ornekler.length && !ilkHalinde(kayit, ornekler, d.frame)) {
      return { ok: false, elle: true, path: cikti, hata: elleMesaji(kayit, cikti) };
    }

    var yer = await K.call("KS_placeOverlay", { path: cikti, at: kayit.start, name: kayit.ad || "Suflo Stil" }, 120000);
    if (!yer || !yer.ok) {
      ciktiyiSil();
      return { ok: false, hata: (yer && yer.error) || "Temiz katman timeline'a konamadı." };
    }
    if (!ornekler.length) return { ok: true, yontem: "yerlestir", yer: yer, path: cikti, kaldirilan: 0, kaldirmaHatasi: "" };
    var kal = await K.call("KS_removeOverlay", { path: kayit.path }, 60000);
    return {
      ok: true, yontem: "yerineKoy", yer: yer, path: cikti,
      kaldirilan: kal && kal.ok ? (Number(kal.removed) || 0) : 0,
      kaldirmaHatasi: kal && kal.ok ? "" : ((kal && kal.error) || "Eski katman kaldırılamadı.")
    };
  }

  /*
   * Deneme (filigranlı) çıktısını, satın alma sonrası temiz yeniden oluşturulsun diye kaydet.
   * Katman az önce konduğu için etkin sekans o sekanstır: kimliği taze sorulur.
   * k: { tur, start, path, ad, assTemiz, fontFiles, g, y, fps, sure, logo? }. Hata işlemi bozmaz (false).
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

  return {
    ciftBoyut: ciftBoyut, kaynak: kaynak, ffmpegArgs: ffmpegArgs, buildArgs: buildArgs, previewArgs: previewArgs,
    logoHazirla: logoHazirla, render: render,
    ilkHalinde: ilkHalinde, elleMesaji: elleMesaji, sonucMesaji: sonucMesaji,
    temizYenidenOlustur: temizYenidenOlustur, denemeKaydet: denemeKaydet
  };
});
