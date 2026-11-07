/*
 * AutoCaptions (ClashiVFX, yazarin izniyle) altyazi MOGRT'leri icin Pro vitrini
 *
 * Suflo Pro icerik ekindeki (depo DISINDA) 14 Premiere MOGRT'inin KENDI thumb.png / thumb.mp4
 * onizlemelerinden kucuk WEBP / WEBM uretir ve assets/pro-caption-showcase/catalog.json'a
 * "collection": "AutoCaptions" kayitlari olarak ekler. Calistirmak tekrarlanabilir: onceki
 * AutoCaptions kayitlari ve onizlemeleri once silinir. Ucretli .mogrt dosyalari public pakete GIRMEZ.
 *
 * Kullanim:
 *   node tools/build-autocaptions-showcase.js [<suflo-pro-icerik>/autocaptions/mogrt/AutoCaptions Captions]
 */
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var root = path.join(__dirname, "..");
var sourceDir = path.resolve(process.argv[2] ||
  path.join(os.homedir(), "suflo-pro-icerik", "autocaptions", "mogrt", "AutoCaptions Captions"));
var outputDir = path.join(root, "assets", "pro-caption-showcase");
var previewDir = path.join(outputDir, "previews");
var catalogPath = path.join(outputDir, "catalog.json");
var COLLECTION = "AutoCaptions";
// Sablonun kendi onizlemesinde (640x360) yazi karenin ortasinda kucuk: ortadaki ~%28'lik alan buyutulur
var ZOOM = "crop=trunc(iw*0.28/2)*2:trunc(ih*0.28/2)*2";
var PREFIX = /^SUFLO\s+MOGRT\s*-\s*/i;
// Windows'ta Git Bash'in GNU tar'i "C:" yolunu uzak makine sanar: sistemin bsdtar'i (MOGRT = ZIP) kullanilir
var TAR = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";

function fail(message) {
  console.error("HATA: " + message);
  process.exit(1);
}

function command(name, args, input) {
  var result = cp.spawnSync(name, args, { cwd: root, input: input, encoding: null, maxBuffer: 96 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    var detail = result.error ? result.error.message : String(result.stderr || "").trim();
    fail(name + " calismadi" + (detail ? ": " + detail : ""));
  }
  return result.stdout;
}

function slug(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

if (!fs.existsSync(sourceDir)) fail("AutoCaptions MOGRT klasoru bulunamadi: " + sourceDir);
var files = fs.readdirSync(sourceDir).filter(function (f) { return /\.mogrt$/i.test(f); })
  .sort(function (a, b) { return a.localeCompare(b, "tr"); });
if (files.length !== 14) fail("Tam 14 AutoCaptions MOGRT'i bekleniyordu; bulunan: " + files.length);

var catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
var eski = catalog.items.filter(function (item) { return item.collection === COLLECTION; });
eski.forEach(function (item) {
  [item.preview, item.video].forEach(function (rel) { if (rel) fs.rmSync(path.join(outputDir, rel), { force: true }); });
});
var temel = catalog.items.filter(function (item) { return item.collection !== COLLECTION; });

var items = files.map(function (file, index) {
  var mogrtPath = path.join(sourceDir, file);
  // Kart adi, Pro paketindeki gercek dosyanin panel adiyla ayni (library.js "SUFLO MOGRT - " onekini atar)
  var name = path.basename(file, path.extname(file)).replace(PREFIX, "").trim();
  var base = String(temel.length + index + 1).padStart(2, "0") + "-" + slug(name);
  var entries = command(TAR, ["-tf", mogrtPath]).toString("utf8").split(/\r?\n/);
  if (entries.indexOf("thumb.png") === -1) fail("thumb.png yok: " + file);
  var png = command(TAR, ["-xOf", mogrtPath, "thumb.png"]);
  if (!png || png.length < 8 || png[0] !== 0x89 || png[1] !== 0x50) fail("Gecerli thumb.png cikarilamadi: " + file);
  var webp = command("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", "pipe:0",
    "-vf", ZOOM + ",scale=640:360:flags=lanczos", "-frames:v", "1",
    "-c:v", "libwebp", "-quality", "80", "-compression_level", "6", "-f", "webp", "pipe:1"], png);
  if (!webp || webp.slice(0, 4).toString("ascii") !== "RIFF" || webp.slice(8, 12).toString("ascii") !== "WEBP") fail("WEBP olusturulamadi: " + file);
  fs.writeFileSync(path.join(previewDir, base + ".webp"), webp);
  var item = { id: base, name: name, styleKey: name, category: "Subtitle Style", collection: COLLECTION, preview: "previews/" + base + ".webp" };
  // Hareketli onizleme de sablonun kendi thumb.png'si (1 sn): MOGRT'lerdeki thumb.mp4 bozuk render (isilti katmanlari
  // gri / mavi kutu olarak cikiyor, ilk saniyelerde hareket yok), vitrine konmaz. Simple ve Blanco con sombra'da hic yok.
  var mp4Var = false;
  // Giris MP4'te moov sonda olabilir: stdin yerine gecici dosyadan okunur
  var tmp = path.join(os.tmpdir(), "suflo-ac-" + process.pid + "-" + index + (mp4Var ? ".mp4" : ".png"));
  fs.writeFileSync(tmp, mp4Var ? command(TAR, ["-xOf", mogrtPath, "thumb.mp4"]) : png);
  var giris = mp4Var ? ["-i", tmp, "-t", "4"] : ["-loop", "1", "-i", tmp, "-t", "1"];
  var motion;
  try {
    motion = command("ffmpeg", ["-hide_banner", "-loglevel", "error"].concat(giris, ["-an",
      "-vf", ZOOM + ",fps=12,scale=480:270:flags=lanczos,format=yuv420p",
      "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0", "-deadline", "good", "-cpu-used", "3", "-row-mt", "1",
      "-f", "webm", "pipe:1"]));
  } finally { fs.rmSync(tmp, { force: true }); }
  if (!motion || motion.slice(0, 4).toString("hex") !== "1a45dfa3") fail("WEBM olusturulamadi: " + file);
  fs.writeFileSync(path.join(previewDir, base + ".webm"), motion);
  item.video = "previews/" + base + ".webm";
  return item;
});

catalog.items = temel.concat(items);
catalog.styleCount = catalog.items.length;
// Captioneer stilleri 3 oran dosyasi (17 x 3 = 51); AutoCaptions stilleri tek dosya, sekansa olceklenir
catalog.fileCount = temel.length * 3 + items.length;
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

var bytes = items.reduce(function (sum, item) {
  return sum + fs.statSync(path.join(outputDir, item.preview)).size + fs.statSync(path.join(outputDir, item.video)).size;
}, 0);
console.log("AutoCaptions vitrini hazir: " + items.length + " stil (toplam " + catalog.items.length + "), " +
  (bytes / 1024 / 1024).toFixed(2) + " MB onizleme");
