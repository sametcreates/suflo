/*
 * Suflo Pro MOGRT vitrini olusturucu
 *
 * Ucretsiz kuruluma yalniz kucuk WEBP onizlemeleri ve isim katalogunu koyar.
 * MOGRT dosyalarini ASLA assets/ altina kopyalamaz.
 *
 * Kullanim: node tools/build-pro-showcase.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var root = path.join(__dirname, "..");
var sourceDir = path.join(root, "content", "mogrt");
var sourceCatalog = path.join(sourceDir, "catalog.json");
var outputDir = path.join(root, "assets", "pro-mogrt-showcase");
var previewDir = path.join(outputDir, "previews");

function fail(message) {
  console.error("HATA: " + message);
  process.exit(1);
}

function slug(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function command(name, args, input) {
  var result = cp.spawnSync(name, args, {
    cwd: root,
    input: input,
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    var detail = result.error ? result.error.message : String(result.stderr || "").trim();
    fail(name + " calismadi" + (detail ? ": " + detail : ""));
  }
  return result.stdout;
}

if (!fs.existsSync(sourceCatalog)) fail("Kaynak katalog bulunamadi: " + sourceCatalog);
var catalog = JSON.parse(fs.readFileSync(sourceCatalog, "utf8"));
if (!Array.isArray(catalog.items) || !catalog.items.length) fail("Kaynak katalog bos.");

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(previewDir, { recursive: true });

var seen = {};
var publicItems = catalog.items.map(function (item, index) {
  if (!item || !item.file || !item.name) fail("Katalogda eksik kayit: " + (index + 1));
  var mogrtPath = path.join(sourceDir, item.file);
  if (!fs.existsSync(mogrtPath)) fail("MOGRT bulunamadi: " + item.file);

  var order = String(index + 1).padStart(2, "0");
  var base = order + "-" + (slug(item.name) || "text-effect");
  if (seen[base]) fail("Ayni vitrin kimligi iki kez olustu: " + base);
  seen[base] = true;

  var png = command("tar", ["-xOf", mogrtPath, "thumb.png"]);
  if (!png || png.length < 8 || png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) {
    fail("Gecerli thumb.png cikarilamadi: " + item.file);
  }

  var webp = command("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-i", "pipe:0",
    "-vf", "scale=640:-2:force_original_aspect_ratio=decrease",
    "-frames:v", "1",
    "-c:v", "libwebp", "-quality", "78", "-compression_level", "6",
    "-f", "webp", "pipe:1"
  ], png);
  if (!webp || webp.length < 12 || webp.slice(0, 4).toString("ascii") !== "RIFF" || webp.slice(8, 12).toString("ascii") !== "WEBP") {
    fail("WEBP onizleme olusturulamadi: " + item.file);
  }

  var previewName = base + ".webp";
  fs.writeFileSync(path.join(previewDir, previewName), webp);
  var publicItem = {
    id: base,
    name: String(item.name),
    category: String(item.category || "Text Animation"),
    match: String(item.file),
    preview: "previews/" + previewName
  };

  // MOGRT kendi hareketli thumb.mp4 dosyasini tasiyorsa, onu da kucuk ve
  // sessiz bir WEBM'e cevir. Kart yalniz hover sirasinda oynattigi icin 40
  // videoyu ayni anda calistirip Premiere panelini yormaz.
  var entries = command("tar", ["-tf", mogrtPath]).toString("utf8").split(/\r?\n/);
  if (entries.indexOf("thumb.mp4") !== -1) {
    var mp4 = command("tar", ["-xOf", mogrtPath, "thumb.mp4"]);
    var motion = command("ffmpeg", [
      "-hide_banner", "-loglevel", "error",
      "-i", "pipe:0", "-an",
      "-vf", "fps=12,scale=480:-2:force_original_aspect_ratio=decrease",
      "-c:v", "libvpx-vp9", "-crf", "43", "-b:v", "0",
      "-deadline", "good", "-cpu-used", "3", "-row-mt", "1",
      "-f", "webm", "pipe:1"
    ], mp4);
    if (!motion || motion.length < 4 || motion.slice(0, 4).toString("hex") !== "1a45dfa3") {
      fail("WEBM hareketli onizleme olusturulamadi: " + item.file);
    }
    var motionName = base + ".webm";
    fs.writeFileSync(path.join(previewDir, motionName), motion);
    publicItem.video = "previews/" + motionName;
  }
  return publicItem;
});

var publicCatalog = {
  version: 1,
  collection: "Suflo Pro — Text Animations",
  creator: "sametcreates",
  publicPreviewOnly: true,
  items: publicItems
};
fs.writeFileSync(path.join(outputDir, "catalog.json"), JSON.stringify(publicCatalog, null, 2) + "\n", "utf8");

var bytes = fs.readdirSync(previewDir).reduce(function (sum, file) {
  return sum + fs.statSync(path.join(previewDir, file)).size;
}, 0);
var motionCount = publicItems.filter(function (item) { return item.video; }).length;
console.log("Suflo Pro vitrini hazir: " + publicItems.length + " onizleme (" + motionCount + " hareketli), " + (bytes / 1024 / 1024).toFixed(2) + " MB");
