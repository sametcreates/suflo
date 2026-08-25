/*
 * Suflo Pro altyazi stili vitrini olusturucu
 *
 * Ucretsiz kuruluma yalniz MOGRT'larin kendi kucuk WEBP/WEBM
 * onizlemelerini koyar. Ucretli .mogrt dosyalari public pakete GIRMEZ.
 *
 * Kullanim:
 *   node tools/build-caption-showcase.js [Captioneer klasoru]
 */
"use strict";

var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");

var root = path.join(__dirname, "..");
var defaultSource = process.platform === "win32"
  ? path.join(process.env.APPDATA || "", "Adobe", "Common", "Motion Graphics Templates", "Captioneer")
  : path.join(os.homedir(), "Library", "Application Support", "Adobe", "Common", "Motion Graphics Templates", "Captioneer");
var sourceRoot = path.resolve(process.argv[2] || defaultSource);
var sourceDir = ["Portrait", "Landscape", "Square"].map(function (name) { return path.join(sourceRoot, name); })
  .filter(function (dir) { return fs.existsSync(dir); })[0];
var outputDir = path.join(root, "assets", "pro-caption-showcase");
var previewDir = path.join(outputDir, "previews");

function fail(message) {
  console.error("HATA: " + message);
  process.exit(1);
}

function command(name, args, input) {
  var result = cp.spawnSync(name, args, {
    cwd: root,
    input: input,
    encoding: null,
    maxBuffer: 96 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    var detail = result.error ? result.error.message : String(result.stderr || "").trim();
    fail(name + " calismadi" + (detail ? ": " + detail : ""));
  }
  return result.stdout;
}

function cleanName(file) {
  return path.basename(file, path.extname(file))
    .replace(/^\s*(?:16[•x:._-]?9|9[•x:._-]?16|1[•x:._-]?1)\s*/i, "")
    .replace(/\s+Subtitles?\s*$/i, "")
    .trim();
}

function slug(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

var publicNames = {
  "mr beast": "Creator Punch",
  "tiktok": "Social Pop",
  "obviously": "Bold Statement"
};

if (!sourceDir) fail("Captioneer Landscape/Portrait/Square klasoru bulunamadi: " + sourceRoot);
var files = fs.readdirSync(sourceDir)
  .filter(function (file) { return /\.mogrt$/i.test(file); })
  .sort(function (a, b) { return cleanName(a).localeCompare(cleanName(b), "tr"); });
if (files.length !== 17) fail("Tam 17 altyazi stili bekleniyordu; bulunan: " + files.length);

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(previewDir, { recursive: true });

var items = files.map(function (file, index) {
  var mogrtPath = path.join(sourceDir, file);
  var originalName = cleanName(file);
  var publicName = publicNames[originalName.toLowerCase()] || originalName;
  var order = String(index + 1).padStart(2, "0");
  var base = order + "-" + slug(originalName);
  var png = command("tar", ["-xOf", mogrtPath, "thumb.png"]);
  if (!png || png.length < 8 || png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) {
    fail("Gecerli thumb.png cikarilamadi: " + file);
  }
  var webp = command("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
    "-vf", "scale=640:-2:force_original_aspect_ratio=decrease",
    "-frames:v", "1", "-c:v", "libwebp", "-quality", "80", "-compression_level", "6",
    "-f", "webp", "pipe:1"
  ], png);
  if (!webp || webp.length < 12 || webp.slice(0, 4).toString("ascii") !== "RIFF" || webp.slice(8, 12).toString("ascii") !== "WEBP") {
    fail("WEBP onizleme olusturulamadi: " + file);
  }
  var previewName = base + ".webp";
  fs.writeFileSync(path.join(previewDir, previewName), webp);

  var item = {
    id: base,
    name: publicName,
    styleKey: originalName,
    category: "Subtitle Style",
    preview: "previews/" + previewName
  };
  var entries = command("tar", ["-tf", mogrtPath]).toString("utf8").split(/\r?\n/);
  if (entries.indexOf("thumb.mp4") !== -1) {
    var mp4 = command("tar", ["-xOf", mogrtPath, "thumb.mp4"]);
    var motion = command("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-an",
      "-vf", "fps=12,scale=480:-2:force_original_aspect_ratio=decrease",
      "-c:v", "libvpx-vp9", "-crf", "42", "-b:v", "0",
      "-deadline", "good", "-cpu-used", "3", "-row-mt", "1",
      "-f", "webm", "pipe:1"
    ], mp4);
    if (!motion || motion.length < 4 || motion.slice(0, 4).toString("hex") !== "1a45dfa3") {
      fail("WEBM onizleme olusturulamadi: " + file);
    }
    var motionName = base + ".webm";
    fs.writeFileSync(path.join(previewDir, motionName), motion);
    item.video = "previews/" + motionName;
  }
  return item;
});

var catalog = {
  version: 1,
  collection: "Suflo Pro — Caption Styles",
  creator: "Suflo Pro",
  publicPreviewOnly: true,
  styleCount: 17,
  ratioCount: 3,
  fileCount: 51,
  items: items
};
fs.writeFileSync(path.join(outputDir, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n", "utf8");

var bytes = fs.readdirSync(previewDir).reduce(function (sum, file) {
  return sum + fs.statSync(path.join(previewDir, file)).size;
}, 0);
console.log("Altyazi stili vitrini hazir: 17 stil, " + items.filter(function (item) { return item.video; }).length +
  " hareketli onizleme, " + (bytes / 1024 / 1024).toFixed(2) + " MB");
