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
  // parti 8: bilinmeyen hatada stderr'in son satırı (hataMetni)
  ok("render başarısız: hata mesajı, Premiere'e dokunulmaz", !r7.ok && r7.hata === "Altyazı katmanı üretilemedi: kotu filtre" && adlar(K7) === "KS_getContext", r7.hata + " " + adlar(K7));
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

  /* ---------------- parti 8: ilerleme, iptal, parçalı render, hata metinleri ---------------- */
  var IC = OR.ilerlemeCoz;
  ok("ilerleme: out_time_ms mikrosaniye (ffmpeg adlandırması), son geçerli değer", IC(["frame=10", "out_time_ms=2500000", "out_time_ms=5000000"], 10) === 0.5);
  ok("ilerleme: out_time_us ve out_time (SS:DD:SS.mikro)", IC(["out_time_us=1000000"], 4) === 0.25 && IC(["out_time=00:01:30.000000"], 180) === 0.5);
  ok("ilerleme: N/A ve bozuk değer atlanır, öncekisi kalır", IC(["out_time_ms=3000000", "out_time_ms=N/A", "out_time=N/A", "out_time_us=12abc"], 6) === 0.5 &&
    IC(["out_time_ms=N/A"], 6) === null && IC([], 6) === null);
  ok("ilerleme: süreyi aşan değer 1'e, eksi değer 0'a sıkışır", IC(["out_time_ms=99000000"], 6) === 1 && IC(["out_time_us=-23220"], 6) === 0);
  ok("ilerleme: progress=end → 1; süre geçersizse null", IC(["out_time_ms=1", "progress=end"], 6) === 1 && IC(["out_time_ms=1000000"], 0) === null && IC(["out_time_ms=1000000"], NaN) === null);
  ok("ilerleme: metinde yarım son satır okunmaz (\"out_time_ms=12\" aslında 12345678 olabilir)", IC("out_time_ms=3000000\nout_time_ms=12", 6) === 0.5 &&
    IC("out_time_ms=3000000\r\nout_time_ms=6000000\r\n", 6) === 1);
  var akanlar = [], oku = OR.ilerlemeOkuyucu(10, function (p) { akanlar.push(p); });
  ["frame=1\nout_ti", "me_ms=20", "00000\nprogress=cont", "inue\nout_time_ms=N/A\n", "out_time_ms=5000000\n"].forEach(oku);
  ok("akan okuyucu: parça sınırında bölünen satır birleştirilir, N/A bildirilmez", JSON.stringify(akanlar) === JSON.stringify([0.2, 0.5]), JSON.stringify(akanlar));
  ok("ilerleme metni: transkripsiyonla aynı kalıp ve kalan süre", OR.ilerlemeMetni(0.42, 50700) === "Altyazı katmanı çiziliyor · %42 · ~1 dk 10 sn kaldı" &&
    OR.ilerlemeMetni(0.01, 5000) === "Altyazı katmanı çiziliyor · %1" && OR.ilerlemeMetni(0.5, 500) === "Altyazı katmanı çiziliyor · %50" &&
    OR.ilerlemeMetni(1, 9000, "Başlık çiziliyor") === "Başlık çiziliyor · %100", OR.ilerlemeMetni(0.42, 50700));
  var I18Nb = require(path.join(__dirname, "..", "js", "i18n.js"));
  I18Nb.setDictionary(require(path.join(__dirname, "..", "i18n", "en.js")));
  var ilEn = I18Nb.translate(OR.ilerlemeMetni(0.42, 50700));
  ok("ilerleme metni İngilizce", !/[ıİşŞğĞçÇ]|kaldı|çiziliyor/.test(ilEn) && /42%/.test(ilEn) && /left/.test(ilEn), ilEn);

  var PP = OR.parcaPlani;
  function toplamKare(pl) { return pl.reduce(function (a, x) { return a + x.kare; }, 0); }
  function sinirli(pl, fps) { return pl.every(function (x, i) { return x.bas === (i ? pl[i - 1].bas + pl[i - 1].kare : 0) && Math.abs(x.t0 - x.bas / fps) < 1e-9 && x.kare >= 1; }); }
  ok("parça planı: 45 sn ve altı tek parça (1080p)", PP(45, 30, 8).length === 1 && PP(46, 30, 8).length === 4 && PP(96, 30, 4).length === 3);
  ok("parça planı: çekirdek 1-2 → tek parça; 3 → 2; 64 → en çok 4", PP(96, 30, 1).length === 1 && PP(96, 30, 2).length === 1 && PP(96, 30, 3).length === 2 &&
    PP(96, 30, 5).length === 4 && PP(96, 30, 64).length === 4 && PP(96, 30, NaN).length === 1 && PP(96, 30, 0).length === 1);
  [[96, 30000 / 1001, 4], [96.0123, 24000 / 1001, 5], [61.7, 29.97, 64], [600, 254016000000 / 8475667008, 16], [47.3, 25, 3], [3600, 59.94, 8]].forEach(function (c) {
    var pl = PP(c[0], c[1], c[2]);
    ok("parça planı (" + c.join(", ") + "): kare sınırında, toplam = round(sure·fps), parçalar dengeli", sinirli(pl, c[1]) && toplamKare(pl) === Math.round(c[0] * c[1]) &&
      Math.max.apply(null, pl.map(function (x) { return x.kare; })) - Math.min.apply(null, pl.map(function (x) { return x.kare; })) <= 1, JSON.stringify(pl));
  });
  ok("parça planı: geçersiz süre [], fps 0 / NaN → 25", PP(0, 30, 8).length === 0 && PP(NaN, 30, 8).length === 0 && PP(-3, 30, 8).length === 0 &&
    toplamKare(PP(60, 0, 8)) === 1500 && toplamKare(PP(60, NaN, 8)) === 1500 && toplamKare(PP(60, 1e9, 8)) === 1500);
  ok("parça planı: çok kısa katman (< 1 sn) zorlansa da kareden çok parça olmaz", PP(0.1, 30, 8, 4).length === 3 && toplamKare(PP(0.1, 30, 8, 4)) === 3 &&
    PP(0.01, 30, 8, 4).length === 1 && toplamKare(PP(0.01, 30, 8)) === 1);
  ok("parça planı: zorla 3 → eşik / çekirdek yok sayılır", PP(6, 30, 1, 3).length === 3 && toplamKare(PP(6, 30, 1, 3)) === 180);
  ok("parça planı: 4K'da eşik piksel oranına bölünür (30 sn 4K parçalı, 30 sn 1080p tek)", PP(30, 30, 4, 0, 4).length === 3 && PP(30, 30, 4, 0, 1).length === 1 &&
    PP(11, 30, 4, 0, 4).length === 1 && PP(30, 30, 4, 0, 0.25).length === 1);
  ok("kare sayısı: round(sure·fps), en az 1", OR.kareSayisi(2, 25) === 50 && OR.kareSayisi(6.02, 30000 / 1001) === 180 && OR.kareSayisi(0.001, 25) === 1 && OR.kareSayisi(0, 25) === 0);

  var pa = OR.parcaArgs({ assName: "altyazi.ass", fontsdir: ".", w: 1920, h: 1080, fps: 30, bas: 960, kare: 960, out: "parca.mov" });
  ok("parça argümanları: mutlak zaman (setpts=PTS+bas) → libass → sıfırla; kesin kare; ilerleme; çıktı sonda",
    pa[4] === "color=c=black@0.0:s=1920x1080:r=30:d=32.03333333333333,setpts=PTS+960,format=rgba,subtitles=f=altyazi.ass:alpha=1:fontsdir=.,unpremultiply=inplace=1,setpts=PTS-STARTPTS" &&
    JSON.stringify(pa.slice(5)) === JSON.stringify(["-c:v", "qtrle", "-an", "-frames:v", "960", "-nostats", "-progress", "pipe:1", "parca.mov"]), pa.join(" "));
  var paL = OR.parcaArgs({ assName: "a.ass", w: 640, h: 360, fps: 25, bas: 50, kare: 50, logo: { name: "logo.png", lw: 64, x: 14, y: "14" }, out: "parca.mov" });
  ok("parça argümanları: logo aynı filtreyle, sıfırlanmış zamanla bindirilir", paL[4].indexOf("fontsdir") === -1 && /setpts=PTS-STARTPTS$/.test(paL[4]) &&
    paL[paL.indexOf("-filter_complex") + 1] === "[1:v]scale=64:-2,format=rgba[l];[0:v][l]overlay=x=14:y=14:format=auto:shortest=1", paL.join(" "));
  ok("buildArgs: kare + ilerleme çıktıdan hemen önce; ikisi yoksa eski argümanlar", JSON.stringify(OR.buildArgs(Object.assign({}, TABAN, { kare: 300, ilerleme: true })).slice(-8)) ===
    JSON.stringify(["qtrle", "-an", "-frames:v", "300", "-nostats", "-progress", "pipe:1", "/o.mov"]));
  ok("birleştirme listesi: tırnaklı / ters bölülü yol kaçırılır", OR.concatSatiri("parca-0/parca.mov") === "file 'parca-0/parca.mov'" &&
    OR.concatSatiri("C:\\Users\\O'Brien\\p.mov") === "file 'C:/Users/O'\\''Brien/p.mov'", OR.concatSatiri("C:\\Users\\O'Brien\\p.mov"));

  var HM = OR.hataMetni, HS = OR.hataSinifi;
  var bag = { cikti: "/Users/Şule/Suflo Çıktı/suflo-altyazi-1.mov", g: 1921, y: 1080 };
  ok("hata: libass yok → Suflo ffmpeg'i", HM("[AVFilterGraph @ 0x55d] No such filter: 'subtitles'\nError initializing complex filters.", 1, bag) ===
    "ffmpeg'in altyazı filtresi yok: Ayarlar › ffmpeg'den Suflo ffmpeg'ini kur." && HS("No such filter: 'ass'", 1) === "filtre" && HS("[x @ 0x1] Unknown filter 'subtitles'", 1) === "filtre");
  ok("hata: disk dolu (ENOSPC / No space left) + çıktı klasörü", HS("av_interleaved_write_frame(): No space left on device", 1) === "disk" && HS("Error: ENOSPC: write", 1) === "disk" &&
    /^Diskte yer kalmadı: .*Çıktı klasörü: \/Users\/Şule\/Suflo Çıktı$/.test(HM("No space left on device", 1, bag)), HM("No space left on device", 1, bag));
  ok("hata: izin yok (EACCES / Permission denied)", HS("/out/x.mov: Permission denied", 1) === "izin" && HS("EACCES: permission denied, mkdir", -1) === "izin" &&
    /^Çıktı klasörüne yazılamıyor \(izin yok\)\..*Çıktı klasörü: \/Users\/Şule\/Suflo Çıktı$/.test(HM("Permission denied", 1, bag)));
  ok("hata: geçersiz / tek sayı boyut", HS("[Parsed_color_0 @ 0x1] Invalid frame size: 0x1080", 1) === "boyut" && HS("width not divisible by 2 (1921x1080)", 1) === "boyut" &&
    HM("Picture size 0x0 is invalid", 1, bag) === "Katman boyutu geçersiz (1921×1080): sekans ayarlarında kare boyutunu denetle, genişlik ve yükseklik çift sayı olmalı.");
  ok("hata: font yüklenemedi (gerçek hata ya da son satır)", HS("[Parsed_subtitles_0 @ 0x1] Error opening memory font: Anton.ttf\nfoo", 1) === "font" &&
    HS("x\n[Parsed_subtitles_0 @ 0x1] fontselect: failed to find any fallback with glyph", 1) === "font" &&
    /^Yazı tipi yüklenemedi/.test(HM("No usable fontconfig configuration file found", 1, bag)));
  // doğrulama: ffmpeg mesajsız çöktü / öldürüldü; son satır libass'in başarıda da yazdığı bilgi satırı → font DEĞİL
  ok("hata: libass bilgi satırı (fontselect eşlemesi, emoji yedek fontu) son satırsa font sayılmaz",
    HS("Input #0, lavfi\n[Parsed_subtitles_1 @ 0x55d0] fontselect: (Inter, 700, 0) -> /tmp/x/Inter-Bold.ttf, 0, Inter-Bold\n", 1) === "bilinmiyor" &&
    HS("[Parsed_subtitles_1 @ 0x5] Glyph 0x1F525 not found, selecting one more font for (Inter, 700, 0)\n", 137) === "bilinmiyor" &&
    /^Altyazı katmanı üretilemedi: fontselect: \(Inter/.test(HM("[Parsed_subtitles_1 @ 0x5] fontselect: (Inter, 700, 0) -> /x.ttf, 0, Inter", 1, bag)),
    HS("[Parsed_subtitles_1 @ 0x55d0] fontselect: (Inter, 700, 0) -> /tmp/x/Inter-Bold.ttf, 0, Inter-Bold", 1));
  // doğrulama: fontsdir=. ile libass çalışma klasöründeki HER dosyayı font diye dener; her çizimde (başarıda da)
  // "Error opening memory font 'altyazi.ass'" yazar. Font olmayan dosyanın satırı font hatası değildir.
  var LIBASS_GERCEK = "ffmpeg version 6.1.1 Copyright (c) 2000-2023 the FFmpeg developers\n" +
    "Input #0, lavfi, from 'color=c=black@0.0:s=1280x720:r=25:d=3,format=rgba':\n" +
    "  Duration: N/A, start: 0.000000, bitrate: N/A\n" +
    "  Stream #0:0: Video: rawvideo (RGBA / 0x41424752), rgba, 1280x720 [SAR 1:1 DAR 16:9], 25 tbr, 25 tbn\n" +
    "[Parsed_subtitles_1 @ 0x55d0c] Error opening memory font 'altyazi.ass'\n" +
    "[Parsed_subtitles_1 @ 0x55d0c] Error opening memory font: 'logo.png'\n" +
    "[Parsed_subtitles_1 @ 0x55d0c] Using font provider fontconfig\n";
  ok("hata: libass'in ASS / logo dosyasını font diye deneme satırı font hatası sayılmaz; salt okunur disk 'izin'",
    HS(LIBASS_GERCEK + "[out#0/mov @ 0x55d0d] Error opening output /Volumes/USB/suflo.mov: Read-only file system\nError opening output files: Read-only file system\n", 1) === "izin" &&
    HS(LIBASS_GERCEK + "Error: EROFS: read-only file system, open '/mnt/x/a.mov'", -1) === "izin" &&
    HS(LIBASS_GERCEK + "[out#0/mov @ 0x1] Error writing trailer: Input/output error\n", 1) === "bilinmiyor" &&
    /Input\/output error$/.test(HM(LIBASS_GERCEK + "[out#0/mov @ 0x1] Error writing trailer: Input/output error\n", 1, bag)),
    [HS(LIBASS_GERCEK + "Error opening output files: Read-only file system\n", 1), HS(LIBASS_GERCEK + "Error writing trailer: Input/output error\n", 1)].join(","));
  ok("hata: öldürülen süreç (son satır ilerleme) font sayılmaz; gerçek font dosyası hatası hâlâ font",
    HS(LIBASS_GERCEK + "frame=  120 fps= 60 q=-0.0 size=    1024kB time=00:00:04.80 bitrate=1747.6kbits/s speed=2.4x\n", 137) === "bilinmiyor" &&
    HS(LIBASS_GERCEK + "[Parsed_subtitles_1 @ 0x55d0c] Error opening memory font: 'Anton-Regular.ttf'\n", 1) === "font" &&
    HS("[Parsed_subtitles_1 @ 0x1] Error opening font: '/x/Inter.OTF', 0\n", 1) === "font" &&
    HS("[Parsed_subtitles_1 @ 0x1] Loading font file './logo.png'\n[Parsed_subtitles_1 @ 0x1] Error opening memory font 'logo.png'\n", 139) === "bilinmiyor",
    HS(LIBASS_GERCEK + "frame=  120 fps= 60 q=-0.0 size=    1024kB time=00:00:04.80\n", 137));
  ok("hata: Windows'un her çizimdeki fontconfig uyarısı tek başına font hatası sayılmaz",
    HS("Fontconfig error: Cannot load default config file: No such file: (null)\nConversion failed!", 1) === "bilinmiyor" &&
    HM("Fontconfig error: Cannot load default config file\nConversion failed!", 1, bag) === "Altyazı katmanı üretilemedi: Conversion failed!");
  ok("hata: zaman aşımı ve iptal", HS("abc\n[zaman aşımı]", -1) === "zaman" && /^Katman çizimi zaman sınırını aştı/.test(HM("abc\n[zaman aşımı]", -1, bag)) &&
    HM("", -2, bag) === "İptal edildi" && HS("No space left on device", -2) === "iptal");
  ok("hata: bilinmeyen → son stderr satırı (ffmpeg öneki atılmış, kırpılmış), önek verilebilir",
    HM("a\n  [mov @ 0x55aa] moov atom not found  \n\n", 1, { onek: "Başlık katmanı üretilemedi: " }) === "Başlık katmanı üretilemedi: moov atom not found" &&
    HM("", 3, {}) === "Altyazı katmanı üretilemedi: ffmpeg kod 3" && HM(new Array(50).join("x") + new Array(400).join("y"), 1).length <= 230);
  var hEn = [HM("No such filter: 'subtitles'", 1, bag), HM("No space left on device", 1, bag), HM("Permission denied", 1, bag), HM("Invalid frame size", 1, bag),
    HM("Error opening font: 'Anton.ttf'", 1, bag), HM("[zaman aşımı]", -1, bag), HM("", -2, bag), HM("x\nbozuk", 1, bag)].map(function (m) { return I18Nb.translate(m); });
  ok("hata metinleri İngilizce (yol ve ffmpeg satırı çevrilmeden)", hEn.every(function (t) { return !/kaldı|yazılamıyor|geçersiz|yüklenemedi|aştı|edildi|üretilemedi|filtresi/.test(t); }) &&
    /Suflo Çıktı$/.test(hEn[1]) && /: bozuk$/.test(hEn[7]), hEn.join(" | "));

  // sahte K ile render: ilerleme, uyarlanan süre sınırı, iptal (yarım dosya ve geçici klasör silinir), parça hatasında tek süreç
  function akisK(o) {
    var K = sahteK();
    K.os = { cpus: function () { return new Array(o.cpus || 1); } };
    K.calisan = [];
    K.run = function (exe, args, opt) {
      var c = { args: args, cwd: opt.cwd, timeout: opt.timeout, iptal: opt.iptal, dosyalar: fs.readdirSync(opt.cwd) };
      K.calisan.push(c);
      var out = args[args.length - 1];
      var hedef = path.isAbsolute(out) ? out : path.join(opt.cwd, out);
      return new Promise(function (res) {
        var bitti = false;
        function kapat(x) { if (!bitti) { bitti = true; res(x); } }
        fs.writeFileSync(hedef, "yarim");
        if (opt.iptal) opt.iptal.dinle(function () { c.olduruldu = true; kapat({ code: -2, iptal: true, stderr: "" }); });
        var h = o.hata && o.hata(c);
        if (opt.onStdout) { opt.onStdout("out_time_ms=500000\nprogress=contin"); opt.onStdout("ue\nout_time_ms=N/A\n"); }
        if (h) { try { fs.unlinkSync(hedef); } catch (e) {} kapat(h); return; }
        if (o.bekle) { c.bitir = function () { kapat({ code: 0, stderr: "" }); }; return; }
        setTimeout(function () { kapat({ code: 0, stderr: "" }); }, 2);
      });
    };
    return K;
  }
  var dz = [], Ka = akisK({});
  var ra = await OR.render(Ka, { ass: ASS, fontFiles: ["ArchivoBlack.ttf"], g: 640, y: 360, fps: 25, sure: 2, cikti: path.join(srt, "a.mov"), durum: function (m) { dz.push(m); } });
  var aa = Ka.calisan[0];
  ok("render: -progress pipe:1 -nostats ve kesin kare (-frames:v 50)", aa.args.join(" ").indexOf("-frames:v 50 -nostats -progress pipe:1 " + path.join(srt, "a.mov")) !== -1 && ra.kare === 50 && ra.parca === 1, aa.args.join(" "));
  ok("render: ilerleme durum satırına (%25)", dz.indexOf("Altyazı katmanı çiziliyor · %25") !== -1, dz.join(" | "));
  // doğrulama: çağıran sınır vermezse eski 1 saatlik taban korunur (yavaş bilgisayarda ağır 4K katman 10 dk'yı aşabilir)
  ok("render: süre sınırı verilmezse eskisi gibi 1 saat (3 × süre daha büyükse o)", aa.timeout === 3600000, aa.timeout);
  var Kt5 = akisK({});
  await OR.render(Kt5, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 5, cikti: path.join(srt, "t5.mov"), timeout: 300000 });
  ok("render: çağıranın küçük sınırı (kanca 5 dk) en az 10 dk'ya çıkar", Kt5.calisan[0].timeout === 600000, Kt5.calisan[0].timeout);
  var Kt = akisK({});
  await OR.render(Kt, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 3600, cikti: path.join(srt, "t.mov") });
  var Kt2 = akisK({});
  await OR.render(Kt2, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 10, cikti: path.join(srt, "t2.mov"), timeout: 1800000 });
  ok("render: 1 saatlik katmanda 3 saat; çağıranın büyük sınırı korunur", Kt.calisan[0].timeout === 10800000 && Kt2.calisan[0].timeout === 1800000, Kt.calisan[0].timeout + " / " + Kt2.calisan[0].timeout);
  var Kf = akisK({});
  var rf = await OR.render(Kf, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: NaN, sure: 1, cikti: path.join(srt, "f.mov") });
  ok("render: fps NaN / 0 → 25", rf.fps === 25 && Kf.calisan[0].args[4].indexOf(":r=25:") !== -1 && (await OR.render(akisK({}), { ass: ASS, g: 64, y: 36, fps: 0, sure: 1, cikti: path.join(srt, "f0.mov") })).fps === 25);

  // iptal (tek süreç)
  var Ki = akisK({ bekle: true }), ji = OR.yerelJeton(), hi = null;
  var pi = OR.render(Ki, { ass: ASS, fontFiles: ["ArchivoBlack.ttf"], g: 640, y: 360, fps: 25, sure: 2, cikti: path.join(srt, "iptal.mov"), iptal: ji });
  await new Promise(function (r) { setTimeout(r, 10); });
  ji.iptal();
  try { await pi; } catch (e) { hi = e; }
  ok("iptal: ffmpeg öldürüldü, e.iptal + 'İptal edildi'", hi && hi.iptal === true && hi.message === "İptal edildi" && Ki.calisan[0].olduruldu === true, hi && hi.message);
  ok("iptal: yarım çıktı ve geçici klasör silindi", !fs.existsSync(path.join(srt, "iptal.mov")) && fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join(","));
  var Ki2 = akisK({}), j2 = OR.yerelJeton(); j2.iptal();
  var h2 = null;
  try { await OR.render(Ki2, { ass: ASS, g: 640, y: 360, fps: 25, sure: 2, cikti: path.join(srt, "i2.mov"), iptal: j2 }); } catch (e) { h2 = e; }
  ok("iptal: önceden iptal edilmiş jetonla süreç hiç açılmaz, klasör açılmaz", h2 && h2.iptal && Ki2.calisan.length === 0 && fs.readdirSync(tmp).length === 0);

  // parçalı (sahte): her parça kendi klasöründe ASS + font kopyasıyla; birleştirme listesi göreli
  var Kp = akisK({ cpus: 4 });
  var rp = await OR.render(Kp, { ass: ASS, fontFiles: ["ArchivoBlack.ttf"], g: 640, y: 360, fps: 25, sure: 50, cikti: path.join(srt, "p.mov") });
  var parcalar = Kp.calisan.slice(0, 3), birlestir = Kp.calisan[3];
  ok("parçalı: 50 sn, 4 çekirdek → 3 parça + birleştirme", rp.parca === 3 && Kp.calisan.length === 4, Kp.calisan.length);
  ok("parçalı: her parça kendi klasöründe, ASS + font kopyasıyla", parcalar.every(function (c, i) { return /parca-\d$/.test(c.cwd) && c.dosyalar.sort().join() === "ArchivoBlack.ttf,altyazi.ass"; }) &&
    parcalar[0].cwd !== parcalar[1].cwd, parcalar.map(function (c) { return c.cwd + ":" + c.dosyalar; }).join(" | "));
  ok("parçalı: kareler 417 + 417 + 416 = 1250, mutlak zaman ofsetleri 0 / 417 / 834", parcalar.map(function (c) { return c.args[c.args.indexOf("-frames:v") + 1]; }).join() === "417,417,416" &&
    /setpts=PTS\+0,/.test(parcalar[0].args[4]) && /setpts=PTS\+417,/.test(parcalar[1].args[4]) && /setpts=PTS\+834,/.test(parcalar[2].args[4]));
  ok("parçalı: concat demuxer, -c copy, ses yok, çıktı son argüman", JSON.stringify(birlestir.args) === JSON.stringify(["-y", "-hide_banner", "-nostats", "-f", "concat", "-safe", "0", "-i", "parcalar.txt", "-c", "copy", "-an", path.join(srt, "p.mov")]) &&
    !/parca-/.test(birlestir.cwd), birlestir.args.join(" "));
  ok("parçalı: geçici klasörler (parça alt klasörleri dahil) silindi", fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join(","));

  // parçalı iptal: bütün parçalar ölür, birleştirme yok
  var Kpi = akisK({ cpus: 4, bekle: true }), jpi = OR.yerelJeton(), hpi = null;
  var ppi = OR.render(Kpi, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 50, cikti: path.join(srt, "pi.mov"), iptal: jpi });
  await new Promise(function (r) { setTimeout(r, 10); });
  jpi.iptal();
  try { await ppi; } catch (e) { hpi = e; }
  ok("parçalı iptal: bütün parça süreçleri öldürüldü, birleştirme yok, temiz", hpi && hpi.iptal && Kpi.calisan.length === 3 && Kpi.calisan.every(function (c) { return c.olduruldu; }) &&
    !fs.existsSync(path.join(srt, "pi.mov")) && fs.readdirSync(tmp).length === 0, Kpi.calisan.length);

  // parça hatası: kardeşler durdurulur, neden günlüğe, tek süreçle yeniden
  var loglar = [];
  var Kph = akisK({ cpus: 4, hata: function (c) { return /parca-1$/.test(c.cwd) ? { code: 1, stderr: "[x @ 0x1] bozuk\n" } : null; } });
  Kph.log = function (m) { loglar.push(m); };
  var rph = await OR.render(Kph, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 50, cikti: path.join(srt, "ph.mov") });
  var son = Kph.calisan[Kph.calisan.length - 1];
  ok("parça hatası: tek süreçle yeniden çizilir (1250 kare), neden günlükte", rph.parca === 1 && son.cwd.indexOf("parca-") === -1 && son.args.indexOf("1250") !== -1 &&
    loglar.some(function (l) { return /parçalı render başarısız, tek süreçle yeniden: parça 2: bozuk \(kod 1\)/.test(l); }), loglar.join(" | "));
  // tekrarlanmaz hata (disk dolu): tek süreçle boşuna denenmez
  var Kpd = akisK({ cpus: 4, hata: function (c) { return /parca-0$/.test(c.cwd) ? { code: 1, stderr: "No space left on device\n" } : null; } }), hpd = null;
  try { await OR.render(Kpd, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 50, cikti: path.join(srt, "pd.mov") }); } catch (e) { hpd = e; }
  ok("parça hatası disk dolu: tek süreçle yeniden denenmez, anlaşılır hata", hpd && /^Diskte yer kalmadı/.test(hpd.message) && Kpd.calisan.every(function (c) { return /parca-/.test(c.cwd); }),
    hpd && hpd.message);
  // doğrulama: birleştirmede disk dolu (parçalar + çıktı = 2 kat yer): parça klasörleri silinince tek süreç sığabilir → yeniden dener
  var Kcd = akisK({ cpus: 4, hata: function (c) { return c.args.indexOf("concat") !== -1 ? { code: 1, stderr: "[out @ 0x1] Error writing trailer: No space left on device\n" } : null; } });
  var rcd = await OR.render(Kcd, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 50, cikti: path.join(srt, "cd.mov") });
  var sonCd = Kcd.calisan[Kcd.calisan.length - 1];
  ok("birleştirmede disk dolu: parçalar silinip tek süreçle yeniden çizilir", rcd.parca === 1 && Kcd.calisan.length === 5 && sonCd.cwd.indexOf("parca-") === -1 &&
    sonCd.args.indexOf("concat") === -1 && sonCd.args.indexOf("1250") !== -1, Kcd.calisan.length);
  // doğrulama: bir parça hata verince kardeş parçalar öldürülür (boşuna çizmesin); yalnız öldürülerek bitebilen sahte süreçler
  var Kpk = akisK({ cpus: 4, bekle: true, hata: function (c) { return /parca-1$/.test(c.cwd) ? { code: 1, stderr: "[x @ 0x1] bozuk\n" } : null; } });
  var ppk = OR.render(Kpk, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 50, cikti: path.join(srt, "pk.mov") });
  await new Promise(function (r) { setTimeout(r, 20); });
  var kardesler = Kpk.calisan.slice(0, 3).filter(function (c) { return !/parca-1$/.test(c.cwd); });
  ok("parça hatası: kardeş parça süreçleri öldürülür", kardesler.length === 2 && kardesler.every(function (c) { return c.olduruldu === true; }),
    kardesler.map(function (c) { return c.cwd.slice(-7) + ":" + !!c.olduruldu; }).join(","));
  Kpk.calisan.forEach(function (c) { if (c.bitir) c.bitir(); });
  await new Promise(function (r) { setTimeout(r, 20); });
  Kpk.calisan.forEach(function (c) { if (c.bitir) c.bitir(); });
  var rpk = await ppk;
  ok("parça hatası (kardeşler öldürülünce): tek süreçle biter", rpk.parca === 1, rpk.parca);
  // doğrulama: parça klasörüne kopyalarken disk doldu (ENOSPC): ham hata değil, tek süreçle (tek kopya yeter) yeniden; hiçbir parça başlamaz
  var Kcp = akisK({ cpus: 4 }), cpLog = [];
  Kcp.log = function (m) { cpLog.push(m); };
  Kcp.fs = Object.assign({}, fs, { copyFileSync: function (a, b) {
    if (/parca-2/.test(b)) { var e = new Error("ENOSPC: no space left on device, copyfile '" + a + "' -> '" + b + "'"); e.code = "ENOSPC"; throw e; }
    return fs.copyFileSync(a, b);
  } });
  var rcp = await OR.render(Kcp, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 50, cikti: path.join(srt, "cp.mov") });
  ok("parça klasörü kopyası ENOSPC: tek süreçle yeniden, parça süreci hiç başlamaz, neden günlükte", rcp.parca === 1 && Kcp.calisan.length === 1 &&
    Kcp.calisan[0].cwd.indexOf("parca-") === -1 && cpLog.some(function (l) { return /tek süreçle yeniden: parça klasörü hazırlanamadı: ENOSPC/.test(l); }) &&
    fs.readdirSync(tmp).length === 0, Kcp.calisan.length + " | " + cpLog.join(" | "));
  var Kcp2 = akisK({ cpus: 4 }), hcp2 = null;
  Kcp2.fs = Object.assign({}, fs, { copyFileSync: function (a, b) { var e = new Error("ENOSPC: no space left on device, copyfile"); e.code = "ENOSPC"; throw e; } });
  Kcp2.run = (function (eski) { return function (exe, args, opt) { return opt.cwd.indexOf("parca-") === -1 ? Promise.resolve({ code: 1, stderr: "[out @ 0x1] No space left on device\n" }) : eski(exe, args, opt); }; })(Kcp2.run);
  try { await OR.render(Kcp2, { ass: ASS, fontFiles: [], g: 640, y: 360, fps: 25, sure: 50, cikti: path.join(srt, "cp2.mov") }); } catch (e) { hcp2 = e; }
  ok("tek süreç de diske sığmazsa: anlaşılır 'Diskte yer kalmadı' (ham ENOSPC değil)", hcp2 && /^Diskte yer kalmadı/.test(hcp2.message), hcp2 && hcp2.message);
  ok("parça hataları sonrası geçici klasör yok", fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join(","));
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
