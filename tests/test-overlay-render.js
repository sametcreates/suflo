// Suflo testi: js/overlay-render.js — ortak şeffaf katman render'ı ve satın alma sonrası
// deneme çıktısının temiz yeniden oluşturulması (yerleştir → YALNIZ sonra {path} ile kaldır)
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
      if (fn === "KS_placeOverlay") return Promise.resolve(o.yerHata ? { ok: false, error: "Klip katmana yerlestirilemedi." } : { ok: true, trackName: "V4", start: arg.at, end: arg.at + 3 });
      if (fn === "KS_removeOverlay") return Promise.resolve(o.silHata ? { ok: false, error: "x" } : { ok: true, removed: 1 });
      return Promise.resolve({ ok: false });
    }
  };
  return K;
}
var kayit = { tur: "altyazi", sequenceId: "seq-1", sekans: "Röportaj 01", start: 12.5, path: path.join(srt, "suflo-altyazi-1.mov"), ad: "Suflo Stil · mrbeast",
  assTemiz: ASS, fontFiles: ["ArchivoBlack.ttf", "../ArchivoBlack.ttf"], g: 641, y: 360, fps: 25, sure: 3 };
function adlar(K) { return K.cagrilar.map(function (c) { return c.fn; }).join(","); }
function srtMovlar() { return fs.readdirSync(srt).filter(function (f) { return /^suflo-temiz-/.test(f); }); }

(async function () {
  // 1) başka sekans açık: render bile yok
  var K1 = sahteK({ sekanslar: ["seq-2"] });
  var r1 = await OR.temizYenidenOlustur(K1, kayit);
  ok("sekans eşleşmiyor: 'O sekansı aç' + ad, render/yerleştirme/kaldırma yok", !r1.ok && r1.sekansAc && r1.hata === "O sekansı aç: Röportaj 01." &&
    K1.calisan.length === 0 && adlar(K1) === "KS_getContext", JSON.stringify(r1) + " " + adlar(K1));

  // 2) başarılı: yerleştir, SONRA yalnız {path} ile kaldır
  var K2 = sahteK();
  var r2 = await OR.temizYenidenOlustur(K2, kayit);
  ok("başarılı akış: bağlam → render → bağlam → yerleştir → kaldır", r2.ok && adlar(K2) === "KS_getContext,KS_getContext,KS_placeOverlay,KS_removeOverlay" && r2.kaldirilan === 1, adlar(K2) + " " + JSON.stringify(r2));
  var yer = K2.cagrilar[2].arg, sil = K2.cagrilar[3].arg;
  ok("yerleştirme: yeni temiz dosya, kaydın başlangıcı ve adı", yer.path !== kayit.path && /suflo-temiz-altyazi-\d+\.mov$/.test(yer.path) && yer.at === 12.5 && yer.name === "Suflo Stil · mrbeast" && fs.existsSync(yer.path), JSON.stringify(yer));
  ok("kaldırma YALNIZ {path} ile (nodeId asla)", JSON.stringify(Object.keys(sil)) === '["path"]' && sil.path === kayit.path, JSON.stringify(sil));
  var c = K2.calisan[0];
  ok("render: kayıttaki temiz ASS, çift boyut, kayıttaki fps/süre, göreli fontsdir", c.args[4] === "color=c=black@0.0:s=642x360:r=25:d=3,format=rgba,subtitles=f=altyazi.ass:alpha=1:fontsdir=.,unpremultiply=inplace=1" &&
    fs.existsSync(c.cwd) === false && c.dosyalar.sort().join(",") === "ArchivoBlack.ttf,altyazi.ass", c.args[4] + " " + c.dosyalar.join(","));
  ok("kayıttaki font yolu klasör dışına çıkamaz (yalnız dosya adı kopyalanır)", c.dosyalar.indexOf("..") === -1 && !fs.existsSync(path.join(tmp, "ArchivoBlack.ttf")));

  // 3) yerleştirme başarısız: eski katmana dokunulmaz, yeni dosya silinir
  var once = srtMovlar().length;
  var K3 = sahteK({ yerHata: true });
  var r3 = await OR.temizYenidenOlustur(K3, kayit);
  ok("yerleştirme başarısız: KS_removeOverlay çağrılmaz", !r3.ok && adlar(K3).indexOf("KS_removeOverlay") === -1 && /yerlestirilemedi/.test(r3.hata), adlar(K3));
  ok("yerleştirme başarısız: üretilen temiz dosya silinir", srtMovlar().length === once, srtMovlar().join(","));

  // 4) render başarısız: yerleştirme/kaldırma yok
  var K4 = sahteK({ renderHata: true });
  var r4 = await OR.temizYenidenOlustur(K4, kayit);
  ok("render başarısız: hata mesajı, Premiere'e dokunulmaz", !r4.ok && /Altyazı katmanı üretilemedi: Error opening kotu filtre/.test(r4.hata) && adlar(K4) === "KS_getContext", r4.hata + " " + adlar(K4));
  var K4b = sahteK({ ff: null });
  var r4b = await OR.temizYenidenOlustur(K4b, kayit);
  ok("ffmpeg yok: anlaşılır hata", !r4b.ok && r4b.hata === "ffmpeg bulunamadı.", r4b.hata);

  // 5) render sırasında başka sekansa geçildi
  var K5 = sahteK({ sekanslar: ["seq-1", "seq-9"] });
  var r5 = await OR.temizYenidenOlustur(K5, kayit);
  ok("render sırasında sekans değişti: yerleştirilmez, dosya silinir", !r5.ok && r5.sekansAc && adlar(K5) === "KS_getContext,KS_getContext" && srtMovlar().length === once, adlar(K5));

  // 6) eski katman kaldırılamadı: başarı ama uyarı
  var K6 = sahteK({ silHata: true });
  var r6 = await OR.temizYenidenOlustur(K6, Object.assign({}, kayit, { tur: "kanca" }));
  ok("kaldırma başarısız: temiz katman yerinde, uyarı döner; kanca ASS adı", r6.ok && r6.kaldirilan === 0 && r6.kaldirmaHatasi && /suflo-temiz-kanca-/.test(r6.path) && /subtitles=f=kanca\.ass/.test(K6.calisan[0].args[4]), JSON.stringify(r6));

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
  }

  try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); process.exit(1); });
