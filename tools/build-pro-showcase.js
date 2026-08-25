/*
 * Suflo Pro MOGRT satis vitrini olusturucu
 *
 * Ucretsiz kuruluma yalniz kucuk WEBP/WEBM onizlemeleri, isimler ve grup
 * bilgisi girer. Ucretli .mogrt dosyalari ASLA assets/ altina kopyalanmaz.
 *
 * Kullanim:
 *   node tools/build-pro-showcase.js [Pro kaynagindaki mogrt klasoru]
 *
 * Kaynak verilmezse dist/pro-source-* altindaki en yeni tam arsiv bulunur;
 * o da yoksa paketle gelen content/mogrt kullanilir.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var root = path.join(__dirname, "..");
var outputDir = path.join(root, "assets", "pro-mogrt-showcase");
var previewDir = path.join(outputDir, "previews");
var motionLimit = 56;

function fail(message) {
  console.error("HATA: " + message);
  process.exit(1);
}

function newestFullSource() {
  var dist = path.join(root, "dist");
  var candidates = [];
  try {
    candidates = fs.readdirSync(dist, { withFileTypes: true })
      .filter(function (entry) { return entry.isDirectory() && /^pro-source-/i.test(entry.name); })
      .map(function (entry) { return path.join(dist, entry.name, "mogrt"); })
      .filter(function (dir) { return fs.existsSync(dir); })
      .sort().reverse();
  } catch (e) {}
  return candidates[0] || path.join(root, "content", "mogrt");
}

var sourceDir = path.resolve(process.argv[2] || newestFullSource());
var sourceCatalog = path.join(root, "content", "mogrt", "catalog.json");

function slug(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function command(name, args, input, optional) {
  var result = cp.spawnSync(name, args, {
    cwd: root,
    input: input,
    encoding: null,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    if (optional) return null;
    var detail = result.error ? result.error.message : String(result.stderr || "").trim();
    fail(name + " calismadi" + (detail ? ": " + detail : ""));
  }
  return result.stdout;
}

function walk(dir) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name.charAt(0) === ".") return;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else if (/\.mogrt$/i.test(entry.name)) out.push(full);
  });
  return out;
}

function cleanName(file) {
  return path.basename(file, path.extname(file))
    .replace(/^SUFLO\s+(?:TEXT|BUTON|MOGRT)\s*-\s*(?:\d+[.\)]?\s*)?/i, "")
    .replace(/^\d+[.\)]\s*/, "")
    .replace(/\bKopie van\b/ig, "")
    .replace(/\s+new\s*$/i, "")
    .replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "Suflo Animation";
}

function nameKey(value) {
  var base = path.basename(String(value || ""), path.extname(String(value || "")));
  base = base.replace(/^SUFLO\s+(?:TEXT|BUTON|MOGRT)\s*-\s*(?:\d+[.\)]?\s*)?/i, "");
  return base.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, "");
}

function groupFor(file, relative) {
  var base = path.basename(file, path.extname(file));
  var hay = relative.replace(/\\/g, "/") + " " + base;
  if (/^SUFLO\s+BUTON\b/i.test(base)) return "buton";
  if (/\b(?:icons?|speech bubble|thinking bubble|logo|lower[\s_-]*third|comments?|list elements?|podcast title|camera overlay|focus frame|shapes?|transition|electro|energy seamless|grid|magic sparks?)\b/i.test(hay)) return "other";
  if (/^SUFLO\s+TEXT\b/i.test(base) || /(^|\/)(?:Text Animations?|Text Effects?|Typewriter|Text MOGRT Collection)(\/|$)/i.test(hay)) return "text";
  return "other";
}

function categoryFor(group, relative, display, known) {
  if (known && known.category) return String(known.category);
  if (group === "buton") return "CTA Button";
  if (group === "text") return "Text Animation";
  var top = relative.replace(/\\/g, "/").split("/")[0];
  if (/transitions?/i.test(top)) return "Transition";
  if (/elements?/i.test(top)) return "Graphic Element";
  if (/comments?/i.test(display)) return "Social Comment";
  if (/icons?|bubble/i.test(display)) return "Icon & Bubble";
  return top && !/\.mogrt$/i.test(top) ? top.replace(/[-_]+/g, " ") : "Other Animation";
}

if (!fs.existsSync(sourceDir)) fail("MOGRT kaynak klasoru bulunamadi: " + sourceDir);

var known = {};
try {
  var rawKnown = JSON.parse(fs.readFileSync(sourceCatalog, "utf8"));
  (rawKnown.items || []).forEach(function (item) { known[nameKey(item.file || item.name)] = item; });
} catch (e) {}

var seen = {};
var allSourceFiles = walk(sourceDir).filter(function (file) {
  return !/(^|[\\/])Caption Styles([\\/]|$)/i.test(file);
});
var files = allSourceFiles
  .sort(function (a, b) {
    var ar = path.relative(sourceDir, a), br = path.relative(sourceDir, b);
    var ap = /^SUFLO TEXT/i.test(path.basename(ar)) ? 0 : (/^SUFLO BUTON/i.test(path.basename(ar)) ? 2 : 1);
    var bp = /^SUFLO TEXT/i.test(path.basename(br)) ? 0 : (/^SUFLO BUTON/i.test(path.basename(br)) ? 2 : 1);
    return ap - bp || ar.localeCompare(br, "tr", { numeric: true });
  })
  .filter(function (file) {
    var key = nameKey(file);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
if (!files.length) fail("Kaynakta MOGRT bulunamadi: " + sourceDir);

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(previewDir, { recursive: true });

var motionCount = 0;
var missingThumb = 0;
var groupCounts = { text: 0, other: 0, buton: 0 };
var publicItems = files.map(function (mogrtPath, index) {
  var relative = path.relative(sourceDir, mogrtPath).replace(/\\/g, "/");
  var display = cleanName(mogrtPath);
  var group = groupFor(mogrtPath, relative);
  var knownItem = known[nameKey(mogrtPath)] || null;
  var order = String(index + 1).padStart(3, "0");
  var base = order + "-" + (slug(display) || "animation");
  groupCounts[group]++;

  var publicItem = {
    id: base,
    name: knownItem && knownItem.name ? String(knownItem.name) : display,
    category: categoryFor(group, relative, display, knownItem),
    group: group,
    match: relative
  };

  var png = command("tar", ["-xOf", mogrtPath, "thumb.png"], null, true);
  if (png && png.length >= 8 && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47) {
    var webp = command("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
      "-vf", "scale=640:-2:force_original_aspect_ratio=decrease",
      "-frames:v", "1", "-c:v", "libwebp", "-quality", "78", "-compression_level", "6",
      "-f", "webp", "pipe:1"
    ], png, true);
    if (webp && webp.length >= 12 && webp.slice(0, 4).toString("ascii") === "RIFF") {
      var previewName = base + ".webp";
      fs.writeFileSync(path.join(previewDir, previewName), webp);
      publicItem.preview = "previews/" + previewName;
    }
  } else {
    missingThumb++;
  }

  if (motionCount < motionLimit) {
    var entries = command("tar", ["-tf", mogrtPath], null, true);
    var hasMotion = entries && entries.toString("utf8").split(/\r?\n/).indexOf("thumb.mp4") !== -1;
    if (hasMotion) {
      var mp4 = command("tar", ["-xOf", mogrtPath, "thumb.mp4"], null, true);
      var motion = mp4 && command("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-an",
        "-vf", "fps=12,scale=480:-2:force_original_aspect_ratio=decrease",
        "-c:v", "libvpx-vp9", "-crf", "43", "-b:v", "0",
        "-deadline", "good", "-cpu-used", "3", "-row-mt", "1",
        "-f", "webm", "pipe:1"
      ], mp4, true);
      if (motion && motion.length >= 4 && motion.slice(0, 4).toString("hex") === "1a45dfa3") {
        var motionName = base + ".webm";
        fs.writeFileSync(path.join(previewDir, motionName), motion);
        publicItem.video = "previews/" + motionName;
        motionCount++;
      }
    }
  }
  return publicItem;
});

var publicCatalog = {
  version: 2,
  collection: "Suflo Pro — Full Animation Showcase",
  creator: "sametcreates",
  publicPreviewOnly: true,
  sourceFileCount: allSourceFiles.length,
  uniqueItemCount: publicItems.length,
  groupCounts: groupCounts,
  items: publicItems
};
fs.writeFileSync(path.join(outputDir, "catalog.json"), JSON.stringify(publicCatalog, null, 2) + "\n", "utf8");

var bytes = fs.readdirSync(previewDir).reduce(function (sum, file) {
  return sum + fs.statSync(path.join(previewDir, file)).size;
}, 0);
console.log("Suflo Pro tam vitrini hazir: " + publicItems.length + " benzersiz kart" +
  " (yazi " + groupCounts.text + ", diger " + groupCounts.other + ", buton " + groupCounts.buton + ")" +
  ", " + motionCount + " hareketli, " + missingThumb + " thumb eksik, " + (bytes / 1024 / 1024).toFixed(2) + " MB");
