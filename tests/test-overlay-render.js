// Suflo testi: js/overlay-render.js — ortak şeffaf katman render'ı ve satın alma sonrası
// deneme çıktısının temiz yeniden oluşturulması: önce projede yerinde değiştir (düzenlemeler
// korunur); olmazsa yalnız ilk hâlindeki tek klibi yenile (yerleştir → YALNIZ sonra {path} ile
// kaldır), düzenlenmiş klibe dokunma
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var OR = require(path.join(__dirname, "..", "js", "overlay-render.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

/* ---------------- saf parçalar ---------------- */
ok("çift boyut (541 → 542, 1080 → 1080)", OR.ciftBoyut(541) === 542 && OR.ciftBoyut(1080) === 1080 && OR.ciftBoyut("1919") === 1920);
ok("kaynak: captions.js'teki zincirin aynısı (alpha=1 + unpremultiply)",
  OR.kaynak({ g: 1920, y: 1080, fps: 25, sure: 12, assAd: "altyazi.ass", fontsdir: ":fontsdir=." }) ===
  "color=c=black@0.0:s=1920x1080:r=25:d=12,format=rgba,subtitles=f=altyazi.ass:alpha=1:fontsdir=.,unpremultiply=inplace=1");
ok("ffmpeg argümanları: lavfi → qtrle, ses yok", JSON.stringify(OR.ffmpegArgs("X", "/o.mov")) === JSON.stringify(["-y", "-f", "lavfi", "-i", "X", "-c:v", "qtrle", "-an", "/o.mov"]));

/* ---------------- buildArgs / previewArgs (Marka Kiti logosu) ---------------- */
var TABAN = { assName: "altyazi.ass", fontsdir: ".", w: 1920, h: 1080, fps: 25, dur: 12, out: "/o.mov" };
ok("buildArgs: logo yokken bugünkü argümanların aynısı",
  JSON.stringify(OR.buildArgs(TABAN)) === JSON.stringify(OR.ffmpegArgs(OR.kaynak({ g: 1920, y: 1080, fps: 25, sure: 12, assAd: "altyazi.ass", fontsdir: ":fontsdir=." }), "/o.mov")));
ok("buildArgs: fontsdir yoksa filtrede fontsdir yok", OR.buildArgs(Object.assign({}, TABAN, { fontsdir: "" }))[4].indexOf("fontsdir") === -1);
var logoArg = OR.buildArgs(Object.assign({}, TABAN, { logo: { name: "logo.png", lw: 240, x: 43, y: "1037-overlay_h" } }));
ok("buildArgs: logo ikinci girdi (-loop 1), bindirme unpremultiply'dan SONRA",
  JSON.stringify(logoArg.slice(5)) === JSON.stringify(["-loop", "1", "-i", "logo.png", "-filter_complex",
    "[1:v]scale=240:-2,format=rgba[l];[0:v][l]overlay=x=43:y=1037-overlay_h:format=auto:shortest=1", "-c:v", "qtrle", "-an", "/o.mov"]) &&
  /unpremultiply=inplace=1$/.test(logoArg[4]), logoArg.join(" "));
[{ name: "logo.png;rm", lw: 10, x: 1, y: "1" }, { name: "../logo.png", lw: 10, x: 1, y: "1" }, { name: "logo.png", lw: 10, x: 1, y: "1,drawbox" },
  { name: "logo.gif", lw: 10, x: 1, y: "1" }, { name: "logo.png", lw: "x", x: 1, y: "1" }].forEach(function (l, i) {
  ok("buildArgs: geçersiz logo yok sayılır (" + i + ")", JSON.stringify(OR.buildArgs(Object.assign({}, TABAN, { logo: l }))) === JSON.stringify(OR.buildArgs(TABAN)));
});
var onz = OR.previewArgs({ assName: "p.ass", w: 320, h: 568, dur: 3.2, ekVf: "drawbox=x=0", out: "p.webm" });
ok("previewArgs: logo yokken eski önizleme komutu (renkli zemin)", JSON.stringify(onz) === JSON.stringify(["-y", "-f", "lavfi", "-i", "color=c=#101522:s=320x568:r=24:d=3.20",
  "-vf", "ass=p.ass:fontsdir=.,drawbox=x=0", "-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0", "-pix_fmt", "yuv420p", "-an", "p.webm"]), onz.join(" "));
var onzK = OR.previewArgs({ assName: "p.ass", w: 320, h: 568, dur: 3, kare: "/k.png", out: "p.webm" });
ok("previewArgs: kare zeminli eski komut", JSON.stringify(onzK.slice(0, 8)) === JSON.stringify(["-y", "-loop", "1", "-i", "/k.png", "-t", "3.00", "-vf"]) &&
  onzK[8] === "scale=320:568:force_original_aspect_ratio=increase,crop=320:568,ass=p.ass:fontsdir=.");
var onzL = OR.previewArgs({ assName: "p.ass", w: 320, h: 568, dur: 3, logo: { name: "logo.jpg", lw: 44, x: 12, y: "31" }, ekVf: "drawbox=x=0", out: "p.webm" });
ok("previewArgs: logo aynı filtreyle, güvenli alan kutuları en üstte",
  onzL.indexOf("-filter_complex") !== -1 && onzL[onzL.indexOf("-filter_complex") + 1] ===
  "[0:v]ass=p.ass:fontsdir=.[s];[1:v]scale=44:-2,format=rgba[l];[s][l]overlay=x=12:y=31:format=auto:shortest=1,drawbox=x=0" &&
  onzL.indexOf("-t") > onzL.indexOf("-filter_complex"), onzL.join(" "));

var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-orender-"));
var tmp = path.join(kok, "tmp"), srt = path.join(kok, "srt dir #1");
fs.mkdirSync(tmp); fs.mkdirSync(srt);
var ASS = "[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n\n[V4+ Styles]\n" +
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n" +
  "Style: Suflo,Archivo Black,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,10,10,20,1\n\n[Events]\n" +
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:02.00,Suflo,,0,0,0,,TEMİZ ÇIKTI\n";

/* ---------------- sahte K (ffmpeg yerine dosya yazan) ---------------- */
function sahteK(o) {
  o = o || {};
  var K = {
    fs: fs, path: path, log: function () {}, cagrilar: [], calisan: [],
    tmpDir: function () { return tmp; }, srtDir: function () { return srt; },
    extensionPath: function () { return path.join(__dirname, ".."); },
    findFfmpeg: function () { return Promise.resolve(o.ff === undefined ? "ffmpeg" : o.ff); },
    run: function (exe, args, opt) {
      K.calisan.push({ args: args, cwd: opt.cwd, dosyalar: fs.readdirSync(opt.cwd) });
      if (o.renderHata) return Promise.resolve({ code: 1, stderr: "Error opening\nkotu filtre" });
      fs.writeFileSync(args[args.length - 1], "mov");
      return Promise.resolve({ code: 0, stderr: "" });
    },
    call: function (fn, arg) {
      K.cagrilar.push({ fn: fn, arg: arg });
      if (fn === "KS_getContext") {
        var n = K.cagrilar.filter(function (c) { return c.fn === "KS_getContext"; }).length;
        var seq = (o.sekanslar || ["seq-1"])[Math.min(n - 1, (o.sekanslar || ["seq-1"]).length - 1)];
        return Promise.resolve({ ok: true, sequenceId: seq, sequence: "x" });
      }
      if (fn === "KS_swapOverlayMedia") {
        if (o.swapHata) return Promise.resolve({ ok: false, error: "EvalScript error." });
        var sw = o.swap || { items: 1, swapped: 1, reason: "" };
        return Promise.resolve({ ok: true, items: sw.items, swapped: sw.swapped, reason: sw.reason || "" });
      }
      if (fn === "KS_overlayInstances") {
        if (o.ornekHata) return Promise.resolve({ ok: false, error: "Aktif sequence yok." });
        return Promise.resolve({ ok: true, frame: 1 / 25, instances: o.ornekler !== undefined ? o.ornekler : [ilk()] });
      }
      if (fn === "KS_placeOverlay") return Promise.resolve(o.yerHata ? { ok: false, error: "Klip katmana yerlestirilemedi." } : { ok: true, trackName: "V4", start: arg.at, end: arg.at + 3 });
      if (fn === "KS_removeOverlay") return Promise.resolve(o.silHata ? { ok: false, error: "x" } : { ok: true, removed: 1 });
      return Promise.resolve({ ok: false });
    }
  };
  return K;
}
var kayit = { tur: "altyazi", sequenceId: "seq-1", sekans: "Röportaj 01", start: 12.5, path: path.join(srt, "suflo-altyazi-1.mov"), ad: "Suflo Stil · mrbeast",
  assTemiz: ASS, fontFiles: ["ArchivoBlack.ttf", "../ArchivoBlack.ttf"], g: 641, y: 360, fps: 25, sure: 3 };
// deneme klibi ilk konduğu gibi: tek örnek, kayıttaki başlangıç, kırpılmamış (3 sn)
function ilk(ek) { return Object.assign({ track: 2, trackName: "V3", start: 12.5, end: 15.5, inPoint: 0, outPoint: 3 }, ek || {}); }
var SWAP_YOK = { items: 1, swapped: 0, reason: "canChangeMediaPath false" };
function adlar(K) { return K.cagrilar.map(function (c) { return c.fn; }).join(","); }
// render'ın yazdığı temiz dosya (ffmpeg argümanlarının sonu): silinip silinmediğine dosya adıyla bakılır
// (Date.now() aynı milisaniyeye düşerse sayım yanıltır)
function renderCiktisi(K) { var a = K.calisan[0].args; return a[a.length - 1]; }

(async function () {
  // 1) başka sekans açık: render bile yok
  var K1 = sahteK({ sekanslar: ["seq-2"] });
  var r1 = await OR.temizYenidenOlustur(K1, kayit);
  ok("sekans eşleşmiyor: 'O sekansı aç' + ad, render/yerleştirme/kaldırma yok", !r1.ok && r1.sekansAc && r1.hata === "O sekansı aç: Röportaj 01." &&
    K1.calisan.length === 0 && adlar(K1) === "KS_getContext", JSON.stringify(r1) + " " + adlar(K1));

  // 2) başarılı: projede yerinde değiştir (changeMediaPath) — timeline'a yerleştirme/kaldırma YOK
  var K2 = sahteK();
  var r2 = await OR.temizYenidenOlustur(K2, kayit);
  ok("yerinde değiştirme: bağlam → render → değiştir; yerleştirme/kaldırma yok", r2.ok && r2.yontem === "degistir" && adlar(K2) === "KS_getContext,KS_swapOverlayMedia" &&
    r2.degisen === 1 && r2.degismeyen === 0, adlar(K2) + " " + JSON.stringify(r2));
  var sw2 = K2.cagrilar[1].arg;
  ok("değiştirme: eski deneme yolu → yeni temiz dosya", sw2.path === kayit.path && sw2.newPath === r2.path && /suflo-temiz-altyazi-\d+\.mov$/.test(sw2.newPath) &&
    fs.existsSync(sw2.newPath) && JSON.stringify(Object.keys(sw2)) === '["path","newPath"]', JSON.stringify(sw2));
  var c = K2.calisan[0];
  ok("render: kayıttaki temiz ASS, çift boyut, kayıttaki fps/süre, göreli fontsdir", c.args[4] === "color=c=black@0.0:s=642x360:r=25:d=3,format=rgba,subtitles=f=altyazi.ass:alpha=1:fontsdir=.,unpremultiply=inplace=1" &&
    fs.existsSync(c.cwd) === false && c.dosyalar.sort().join(",") === "ArchivoBlack.ttf,altyazi.ass", c.args[4] + " " + c.dosyalar.join(","));
  ok("kayıttaki font yolu klasör dışına çıkamaz (yalnız dosya adı kopyalanır)", c.dosyalar.indexOf("..") === -1 && !fs.existsSync(path.join(tmp, "ArchivoBlack.ttf")));
  var K2b = sahteK({ swap: { items: 3, swapped: 2 } });
  var r2b = await OR.temizYenidenOlustur(K2b, kayit);
  ok("kısmi değiştirme: başarı ama değişmeyen öğe sayısı döner", r2b.ok && r2b.yontem === "degistir" && r2b.degisen === 2 && r2b.degismeyen === 1, JSON.stringify(r2b));
  // İnceleme bulgusu: yerinde değiştirme sekanstan bağımsız (proje öğesi); render sırasında sekans değişse de güvenli
  var K2c = sahteK({ sekanslar: ["seq-1", "seq-9"] });
  var r2c = await OR.temizYenidenOlustur(K2c, kayit);
  ok("yerinde değiştirme render sırasında sekans değişse de yapılır (proje düzeyinde)", r2c.ok && r2c.yontem === "degistir" && adlar(K2c) === "KS_getContext,KS_swapOverlayMedia", adlar(K2c));

  // 3) yedek yol: değiştirilemedi + tek, ilk hâlinde klip → yerleştir, SONRA yalnız {path} ile kaldır
  var K3 = sahteK({ swap: SWAP_YOK });
  var r3 = await OR.temizYenidenOlustur(K3, kayit);
  ok("yedek: ilk hâlindeki tek klip → bağlam → render → değiştir(0) → bağlam → örnekler → yerleştir → kaldır",
    r3.ok && r3.yontem === "yerineKoy" && adlar(K3) === "KS_getContext,KS_swapOverlayMedia,KS_getContext,KS_overlayInstances,KS_placeOverlay,KS_removeOverlay" && r3.kaldirilan === 1,
    adlar(K3) + " " + JSON.stringify(r3));
  var yer = K3.cagrilar[4].arg, sil = K3.cagrilar[5].arg;
  ok("yedek yerleştirme: yeni temiz dosya, kaydın başlangıcı ve adı", yer.path !== kayit.path && /suflo-temiz-altyazi-\d+\.mov$/.test(yer.path) && yer.at === 12.5 && yer.name === "Suflo Stil · mrbeast" && fs.existsSync(yer.path), JSON.stringify(yer));
  ok("kaldırma YALNIZ {path} ile (nodeId asla)", JSON.stringify(Object.keys(sil)) === '["path"]' && sil.path === kayit.path, JSON.stringify(sil));
  ok("örnek sorgusu yalnız {path} ile", JSON.stringify(K3.cagrilar[3].arg) === JSON.stringify({ path: kayit.path }));
  var K3b = sahteK({ swapHata: true });
  var r3b = await OR.temizYenidenOlustur(K3b, kayit);
  ok("değiştirme çağrısı hata verirse de yedek yola geçilir", r3b.ok && r3b.yontem === "yerineKoy", adlar(K3b));
  var K3c = sahteK({ swap: { items: 0, swapped: 0, reason: "proje ogesi yok" }, ornekler: [ilk({ start: 12.5 + 0.01, end: 15.5 + 0.01 })] });
  ok("bir karenin altındaki sapma düzenleme sayılmaz", (await OR.temizYenidenOlustur(K3c, kayit)).yontem === "yerineKoy", adlar(K3c));

  // 4) İnceleme bulgusu: düzenlenmiş deneme klibi (taşınmış/kırpılmış/bölünmüş/çoğaltılmış) EZİLMEZ
  var duzenler = [
    ["taşınmış (12 sn'ye)", [ilk({ start: 12, end: 15 })]],
    ["baştan kırpılmış", [ilk({ start: 13, inPoint: 0.5 })]],
    ["sondan kırpılmış (2 sn)", [ilk({ end: 14.5, outPoint: 2 })]],
    ["jilet ile bölünmüş (iki parça)", [ilk({ end: 14, outPoint: 1.5 }), ilk({ start: 14, inPoint: 1.5 })]],
    ["ripple ile kaymış parçalar", [ilk({ end: 13.5, outPoint: 1 }), ilk({ start: 13.5, end: 15.5, inPoint: 2, outPoint: 3 })]],
    ["iki yere kopyalanmış", [ilk(), ilk({ track: 3, trackName: "V4", start: 40, end: 43 })]],
    ["hızı değiştirilmiş (%200)", [ilk({ end: 14 })]]
  ];
  for (var di = 0; di < duzenler.length; di++) {
    var Kd = sahteK({ swap: SWAP_YOK, ornekler: duzenler[di][1] });
    var rd = await OR.temizYenidenOlustur(Kd, kayit);
    ok("düzenlenmiş klip — " + duzenler[di][0] + ": yerleştirme/kaldırma YOK, elle değiştirme yolu",
      !rd.ok && rd.elle === true && adlar(Kd).indexOf("KS_placeOverlay") === -1 && adlar(Kd).indexOf("KS_removeOverlay") === -1 &&
      rd.path === renderCiktisi(Kd) && fs.existsSync(rd.path) && rd.hata.indexOf(rd.path) !== -1 && /Replace Footage/.test(rd.hata) && rd.hata.indexOf("\"Suflo Stil · mrbeast\"") !== -1,
      adlar(Kd) + " " + JSON.stringify(rd).slice(0, 200));
  }

  // 5) hiç örnek yok (kullanıcı timeline'dan silmiş): kaydın başlangıcına konur, kaldırma çağrısı yok
  var K5y = sahteK({ swap: { items: 0, swapped: 0 }, ornekler: [] });
  var r5y = await OR.temizYenidenOlustur(K5y, kayit);
  ok("örnek yok: temiz klip ilk konduğu ana, kaldırma yok", r5y.ok && r5y.yontem === "yerlestir" && adlar(K5y) === "KS_getContext,KS_swapOverlayMedia,KS_getContext,KS_overlayInstances,KS_placeOverlay" &&
    K5y.cagrilar[4].arg.at === 12.5, adlar(K5y) + " " + JSON.stringify(r5y));
  var K5h = sahteK({ swap: SWAP_YOK, ornekHata: true });
  var r5h = await OR.temizYenidenOlustur(K5h, kayit);
  ok("örnek sorgusu başarısız: Premiere'e dokunulmaz, dosya silinir", !r5h.ok && /Aktif sequence yok/.test(r5h.hata) && adlar(K5h).indexOf("KS_placeOverlay") === -1 && !fs.existsSync(renderCiktisi(K5h)), adlar(K5h));

  // 6) yerleştirme başarısız: eski katmana dokunulmaz, yeni dosya silinir
  var K6 = sahteK({ yerHata: true, swap: SWAP_YOK });
  var r6 = await OR.temizYenidenOlustur(K6, kayit);
  ok("yerleştirme başarısız: KS_removeOverlay çağrılmaz", !r6.ok && adlar(K6).indexOf("KS_removeOverlay") === -1 && /yerlestirilemedi/.test(r6.hata), adlar(K6));
  ok("yerleştirme başarısız: üretilen temiz dosya silinir", !fs.existsSync(renderCiktisi(K6)), renderCiktisi(K6));

  // 7) render başarısız: Premiere'e dokunulmaz
  var K7 = sahteK({ renderHata: true });
  var r7 = await OR.temizYenidenOlustur(K7, kayit);
  ok("render başarısız: hata mesajı, Premiere'e dokunulmaz", !r7.ok && /Altyazı katmanı üretilemedi: Error opening kotu filtre/.test(r7.hata) && adlar(K7) === "KS_getContext", r7.hata + " " + adlar(K7));
  var K7b = sahteK({ ff: null });
  var r7b = await OR.temizYenidenOlustur(K7b, kayit);
  ok("ffmpeg yok: anlaşılır hata", !r7b.ok && r7b.hata === "ffmpeg bulunamadı.", r7b.hata);

  // 8) yedek yolda render sırasında başka sekansa geçildi
  var K8 = sahteK({ sekanslar: ["seq-1", "seq-9"], swap: SWAP_YOK });
  var r8 = await OR.temizYenidenOlustur(K8, kayit);
  ok("yedek yol + render sırasında sekans değişti: yerleştirilmez, dosya silinir", !r8.ok && r8.sekansAc && adlar(K8) === "KS_getContext,KS_swapOverlayMedia,KS_getContext" && !fs.existsSync(renderCiktisi(K8)), adlar(K8));

  // 9) eski katman kaldırılamadı: başarı ama uyarı
  var K9 = sahteK({ silHata: true, swap: SWAP_YOK });
  var r9 = await OR.temizYenidenOlustur(K9, Object.assign({}, kayit, { tur: "kanca" }));
  ok("kaldırma başarısız: temiz katman yerinde, uyarı döner; kanca ASS adı", r9.ok && r9.kaldirilan === 0 && r9.kaldirmaHatasi && /suflo-temiz-kanca-/.test(r9.path) && /subtitles=f=kanca\.ass/.test(K9.calisan[0].args[4]), JSON.stringify(r9));

  /* ---------------- saf: ilkHalinde + bildirim metinleri ---------------- */
  var IH = OR.ilkHalinde;
  ok("ilkHalinde: dokunulmamış tek klip", IH(kayit, [ilk()], 1 / 25) === true);
  ok("ilkHalinde: kare yuvarlaması (süre bir kare uzun) düzenleme sayılmaz", IH(Object.assign({}, kayit, { sure: 12.34 }), [ilk({ end: 12.5 + 12.36, outPoint: 12.36 })], 1 / 25) === true);
  ok("ilkHalinde: bir kare taşıma, iki kare kırpma düzenlemedir", IH(kayit, [ilk({ start: 12.54, end: 15.54 })], 1 / 25) === false && IH(kayit, [ilk({ end: 15.42, outPoint: 2.92 })], 1 / 25) === false);
  ok("ilkHalinde: örnek yok / iki örnek / bozuk sayı → false", IH(kayit, [], 1 / 25) === false && IH(kayit, [ilk(), ilk()], 1 / 25) === false &&
    IH(kayit, [ilk({ start: -1 })], 1 / 25) === false && IH(kayit, [ilk({ inPoint: "x" })], 1 / 25) === false && IH(null, [ilk()]) === false);
  ok("ilkHalinde: kare bilinmiyorsa kaydın fps'i", IH(kayit, [ilk({ start: 12.51, end: 15.51 })], 0) === true && IH(kayit, [ilk({ start: 12.6, end: 15.6 })], 0) === false);
  var m1 = OR.sonucMesaji({ yontem: "degistir", degisen: 1, degismeyen: 0 });
  ok("bildirim: yerinde değiştirme iyi haber, düzenlemelerin duruyor", m1.tur === "good" && /Filigran kaldırıldı/.test(m1.metin) && /düzenlemelerin aynen duruyor/.test(m1.metin), m1.metin);
  var m2 = OR.sonucMesaji({ yontem: "degistir", degisen: 1, degismeyen: 2, path: "/x/temiz.mov" });
  ok("bildirim: kısmi değiştirme uyarı + temiz dosya yolu", m2.tur === "warn" && /2 proje öğesi değiştirilemedi/.test(m2.metin) && /\/x\/temiz\.mov$/.test(m2.metin), m2.metin);
  var m3 = OR.sonucMesaji({ yontem: "yerlestir", yer: { trackName: "V4", start: 12.5 } });
  ok("bildirim: örnek yoksa ilk konduğu yer (iz, sn) söylenir", m3.tur === "warn" && m3.metin === "Bu sekansta deneme klibi bulunamadı: temiz katman ilk konduğu yere kondu (V4, 12,5 sn)", m3.metin);
  var m4 = OR.sonucMesaji({ yontem: "yerineKoy", yer: { trackName: "V4" }, kaldirilan: 1 });
  var m5 = OR.sonucMesaji({ yontem: "yerineKoy", yer: { trackName: "V4" }, kaldirilan: 0, kaldirmaHatasi: "x" });
  ok("bildirim: yerine koyma (mevcut metinler)", m4.tur === "good" && m4.metin === "Temiz katman V4 katmanına kondu" &&
    m5.tur === "warn" && m5.metin === "Temiz katman V4 katmanına kondu · eski filigranlı katman kaldırılamadı, elle sil", m4.metin + " | " + m5.metin);
  var I18N = require(path.join(__dirname, "..", "js", "i18n.js"));
  I18N.setDictionary(require(path.join(__dirname, "..", "i18n", "en.js")));
  var elle = OR.elleMesaji({ ad: "Suflo Kanca · Bu hata pahalı" }, "C:\\Users\\Şule\\Suflo · Altyazı\\suflo-temiz-kanca-1.mov");
  var elleEn = I18N.translate(elle), m2En = I18N.translate(OR.sonucMesaji({ yontem: "degistir", degismeyen: 1, path: "/Ş · x/t.mov" }).metin);
  ok("İngilizce: Premiere öğe adı ve dosya yolu çevrilmeden kalır", /^The trial clip was edited/.test(elleEn) && elleEn.indexOf("\"Suflo Kanca · Bu hata pahalı\"") !== -1 &&
    /Clean file: C:\\Users\\Şule\\Suflo · Altyazı\\suflo-temiz-kanca-1\.mov$/.test(elleEn) && /^Watermark partly removed: 1 project item couldn't .*: \/Ş · x\/t\.mov$/.test(m2En), elleEn + " | " + m2En);
  ["degistir", "yerlestir", "yerineKoy"].forEach(function (y) {
    var t = I18N.translate(OR.sonucMesaji({ yontem: y, degisen: 1, degismeyen: 0, yer: { trackName: "V4", start: 3 }, kaldirilan: 1 }).metin);
    ok("İngilizce bildirim: " + y, !/[ıİşŞğĞ]/.test(t) && /^(Watermark|No trial|Clean layer)/.test(t), t);
  });

  ok("bozuk kayıt: hiçbir çağrı yok", !(await OR.temizYenidenOlustur(sahteK(), { tur: "altyazi" })).ok);
  ok("geçici render klasörleri temizlendi", fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join(","));

  // 7) gerçek ffmpeg (libass'li) ile render
  var lib = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
  if (lib.error || !/\ssubtitles\s/.test(String(lib.stdout || ""))) {
    console.log("ATLA gerçek render: libass'li ffmpeg yok");
  } else {
    var gercekK = sahteK();
    gercekK.run = function (exe, args, opt) {
      return new Promise(function (res) {
        cp.execFile(exe, args, { cwd: opt.cwd, maxBuffer: 1 << 26 }, function (err, so, se) { res({ code: err ? (err.code || 1) : 0, stdout: so, stderr: se }); });
      });
    };
    var durumlar = [];
    var out = await OR.render(gercekK, { ass: ASS, fontFiles: ["ArchivoBlack.ttf"], g: 641, y: 360, fps: 25, sure: 2, cikti: path.join(srt, "gercek.mov"), durum: function (m) { durumlar.push(m); } });
    var p = JSON.parse(cp.execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,pix_fmt:format=duration", "-of", "json", out.path]).toString());
    var st = p.streams[0];
    ok("gerçek render: qtrle, alfalı, çift boyut, süre", st.codec_name === "qtrle" && /a/.test(st.pix_fmt) && st.width === 642 && st.height === 360 && Math.abs(Number(p.format.duration) - 2) < 0.1, JSON.stringify(p));
    var raw = cp.execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", out.path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 26 });
    var opak = 0, seffaf = 0;
    for (var i = 3; i < raw.length; i += 4) { if (raw[i] > 200) opak++; else if (raw[i] < 10) seffaf++; }
    ok("gerçek render: yazı opak, zemin saydam; durum satırı", opak > 500 && seffaf > raw.length / 4 * 0.7 && /hazırlanıyor… \(2 sn\)/.test(durumlar[0]), opak + " / " + seffaf + " " + durumlar[0]);
    ok("gerçek render: geçici klasör silindi", fs.readdirSync(tmp).length === 0);

    // Marka Kiti logosu: %50 alfalı turuncu logo straight alfayla birebir, yazı pikselleri değişmez
    var logoYol = path.join(kok, "marka logo.png");
    cp.execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xFF33007F:s=64x40,format=rgba", "-frames:v", "1", logoYol]);
    var cikLogolu = await OR.render(gercekK, { ass: ASS, fontFiles: ["ArchivoBlack.ttf"], g: 640, y: 360, fps: 25, sure: 2, cikti: path.join(srt, "logolu.mov"),
      logo: { path: logoYol, kose: "ss", oran: 0.1, guvenli: false } });
    var cikDuz = await OR.render(gercekK, { ass: ASS, fontFiles: ["ArchivoBlack.ttf"], g: 640, y: 360, fps: 25, sure: 2, cikti: path.join(srt, "duz.mov") });
    ok("logolu render: sonuç logo:true", cikLogolu.logo === true && cikLogolu.logoAtlandi === false && cikDuz.logo === false);
    function kare(f) { return cp.execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", f, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 26 }); }
    var kL = kare(cikLogolu.path), kD = kare(cikDuz.path);
    // sol üst, oran 0.1 → 64 px genişlik, kenar payı min(640,360)*0.04 = 14
    var pi = (30 * 640 + 40) * 4;
    ok("logo pikseli straight alfa (255,51,0,127)", kL[pi] === 255 && kL[pi + 1] === 51 && kL[pi + 2] === 0 && kL[pi + 3] === 127, [kL[pi], kL[pi + 1], kL[pi + 2], kL[pi + 3]].join(","));
    var fark = 0;
    for (var yy = 0; yy < 360; yy++) for (var xx = 0; xx < 640; xx++) {
      if (xx >= 14 && xx < 78 && yy >= 14 && yy < 54) continue;
      var j = (yy * 640 + xx) * 4;
      if (kL[j] !== kD[j] || kL[j + 1] !== kD[j + 1] || kL[j + 2] !== kD[j + 2] || kL[j + 3] !== kD[j + 3]) fark++;
    }
    ok("logo dışındaki (yazı) pikseller bayt bayt aynı", fark === 0 && kD.length === kL.length, fark + " piksel");
    var pr = cp.execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_name,pix_fmt,nb_read_frames", "-of", "json", cikLogolu.path]).toString();
    var ps = JSON.parse(pr).streams[0];
    ok("logolu çıktı qtrle argb, 2 sn × 25 = 50 kare", ps.codec_name === "qtrle" && ps.pix_fmt === "argb" && Number(ps.nb_read_frames) === 50, pr.replace(/\s+/g, " "));
    // Deneme (filigranlı) katman: opak logo hiçbir köşede filigranı örtmez (sağ köşeler sola geçer)
    var FL = require(path.join(__dirname, "..", "js", "filigran.js"));
    var assF = FL.ekle(ASS, { width: 640, height: 360 });
    var opakYol = path.join(kok, "opak.png");
    cp.execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x00FF00FF:s=100x100,format=rgba", "-frames:v", "1", opakYol]);
    var cikF = await OR.render(gercekK, { ass: assF, fontFiles: ["ArchivoBlack.ttf"], g: 640, y: 360, fps: 25, sure: 2, cikti: path.join(srt, "filigran.mov") });
    var kF = kare(cikF.path);
    // filigran kutusu: \an9\pos(621,14), boy 10 px → x 540..640, y 10..32
    function filigranBolgesi(k) { var o = []; for (var fy = 10; fy < 32; fy++) for (var fx = 540; fx < 640; fx++) { var q = (fy * 640 + fx) * 4; o.push(k[q], k[q + 1], k[q + 2], k[q + 3]); } return o.join(","); }
    var bolgeF = filigranBolgesi(kF), filigranGorunur = bolgeF.split(",").some(function (v, i) { return i % 4 === 3 && Number(v) > 20; });
    var ortulen = [];
    for (var ki = 0; ki < 4; ki++) {
      var kose = ["su", "ss", "as", "au"][ki];
      var cikK = await OR.render(gercekK, { ass: assF, fontFiles: ["ArchivoBlack.ttf"], g: 640, y: 360, fps: 25, sure: 2, cikti: path.join(srt, "f-" + kose + ".mov"),
        logo: { path: opakYol, kose: kose, oran: 0.25, guvenli: false } });
      if (!cikK.logo || filigranBolgesi(kare(cikK.path)) !== bolgeF) ortulen.push(kose);
    }
    ok("deneme: filigran görünür ve opak logo hiçbir köşede onu örtmez", filigranGorunur && ortulen.length === 0, ortulen.join(","));
    ok("filigranaGoreLogo: yalnız filigranlı ASS'te sağ köşe sola geçer, kayıt değişmez", (function () {
      var lg = { path: "a.png", kose: "su", oran: 0.2 };
      return OR.filigranaGoreLogo(lg, assF).kose === "ss" && OR.filigranaGoreLogo(lg, ASS) === lg && lg.kose === "su" &&
        OR.filigranaGoreLogo({ kose: "as" }, assF).kose === "au" && OR.filigranaGoreLogo(null, assF) === null;
    })());
    var yok = await OR.render(gercekK, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 1, cikti: path.join(srt, "yok.mov"),
      logo: { path: path.join(kok, "olmayan.png"), kose: "su", oran: 0.1 } });
    ok("logo dosyası yoksa logosuz üretilir, logoAtlandi bildirilir", yok.logo === false && yok.logoAtlandi === true && fs.existsSync(yok.path));
    // panel önizlemesi (kare zeminli + logo): iki döngülü girdi süreye kırpılır, webm biter
    var onzDizin = path.join(kok, "onizleme");
    fs.mkdirSync(onzDizin);
    fs.writeFileSync(path.join(onzDizin, "p.ass"), ASS, "utf8");
    cp.execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=640x360", "-frames:v", "1", path.join(onzDizin, "kare.png")]);
    fs.copyFileSync(logoYol, path.join(onzDizin, "logo.png"));
    var onzR = cp.spawnSync("ffmpeg", OR.previewArgs({ assName: "p.ass", w: 320, h: 180, dur: 1.5, kare: "kare.png",
      logo: { name: "logo.png", lw: 32, x: 7, y: "173-overlay_h" }, ekVf: "drawbox=x=0:y=0:w=10:h=10:color=red@0.5:t=fill", out: "p.webm" }), { cwd: onzDizin, timeout: 60000 });
    var onzSure = onzR.status === 0 ? Number(cp.execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(onzDizin, "p.webm")]).toString()) : 0;
    ok("önizleme (kare + logo) süreye kırpılır", onzR.status === 0 && Math.abs(onzSure - 1.5) < 0.1, onzR.status + " · " + onzSure);
    ok("logolu render sonrası geçici klasör silindi", fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join(","));
  }

  try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); process.exit(1); });
