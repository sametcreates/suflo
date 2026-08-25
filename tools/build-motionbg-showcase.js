/* Suflo Pro Motion BG: ucretsiz pakete yalniz kucuk satis onizlemeleri koyar. */
"use strict";
var fs = require("fs"), path = require("path"), cp = require("child_process");
var root = path.join(__dirname, "..");

function newestSource() {
  var dist = path.join(root, "dist"), dirs = [];
  try {
    dirs = fs.readdirSync(dist, { withFileTypes: true })
      .filter(function (e) { return e.isDirectory() && /^pro-source-/i.test(e.name); })
      .map(function (e) { return path.join(dist, e.name, "motionbg"); })
      .filter(function (d) { return fs.existsSync(d); }).sort().reverse();
  } catch (e) {}
  return dirs[0] || "";
}

var source = path.resolve(process.argv[2] || newestSource());
var out = path.join(root, "assets", "pro-motionbg-showcase"), previews = path.join(out, "previews");
if (!source || !fs.existsSync(source)) { console.error("Motion BG kaynagi bulunamadi: " + source); process.exit(1); }

function run(args) {
  var r = cp.spawnSync("ffmpeg", args, { encoding: null, maxBuffer: 96 * 1024 * 1024, windowsHide: true });
  if (r.error || r.status !== 0) throw new Error("ffmpeg: " + (r.error ? r.error.message : String(r.stderr || "")));
  return r.stdout;
}
function slug(v) { return String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function name(file) {
  var cleaned = path.basename(file, path.extname(file)).replace(/^SUFLO\s*(?:BG|MOTION BG)?\s*-\s*/i, "")
    .replace(/\bKopie van\b/ig, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "Motion BG";
  var key = cleaned.toLowerCase();
  var pretty = {
    "1": "Neon Lines", "2 (2)": "Light Streaks", "4 (2)": "Perspective Grid",
    "abstract background - 107308 (1080p)": "Purple Abstract Wave",
    "abstract-digital-technology-background-loop-sbv-347335449-hd": "Digital Particle Network",
    "black - 13495 (540p)": "Black Particle Field",
    "cinematic mastery best film overlay for 2024 content creators!": "Cinematic Film Overlay 02",
    "gradient-wavy-motion-background-sbv-346650750-hd": "Gradient Wave",
    "dan koe style overlay - 1": "Creator Texture 01", "dan koe style overlay - 2": "Creator Texture 02",
    "dan koe style overlay - 3": "Creator Texture 03", "dan koe style overlay - 4": "Creator Texture 04",
    "dan koe style overlay - 5": "Creator Texture 05"
  };
  return pretty[key] || cleaned;
}

var files = fs.readdirSync(source).filter(function (f) { return /\.(mp4|mov|m4v|webm)$/i.test(f); })
  .sort(function (a, b) { return a.localeCompare(b, "tr", { numeric: true }); });
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(previews, { recursive: true });
var items = files.map(function (file, i) {
  var full = path.join(source, file), display = name(file), base = String(i + 1).padStart(2, "0") + "-" + slug(display);
  var still = run(["-hide_banner", "-loglevel", "error", "-ss", "0.35", "-i", full,
    "-frames:v", "1", "-vf", "scale=640:-2:force_original_aspect_ratio=decrease",
    "-c:v", "libwebp", "-quality", "76", "-compression_level", "6", "-f", "webp", "pipe:1"]);
  var motion = run(["-hide_banner", "-loglevel", "error", "-i", full, "-t", "2.8", "-an",
    "-vf", "fps=10,scale=480:-2:force_original_aspect_ratio=decrease",
    "-c:v", "libvpx-vp9", "-crf", "45", "-b:v", "0", "-deadline", "good", "-cpu-used", "4", "-row-mt", "1",
    "-f", "webm", "pipe:1"]);
  fs.writeFileSync(path.join(previews, base + ".webp"), still);
  fs.writeFileSync(path.join(previews, base + ".webm"), motion);
  return { id: base, name: display, category: /overlay|grain|dust|scratch|vhs|glitch/i.test(display) ? "Overlay" : "Motion Background",
    preview: "previews/" + base + ".webp", video: "previews/" + base + ".webm" };
});
fs.writeFileSync(path.join(out, "catalog.json"), JSON.stringify({ version: 1, collection: "Suflo Pro — Motion BG",
  creator: "sametcreates", publicPreviewOnly: true, itemCount: items.length, items: items }, null, 2) + "\n");
var bytes = fs.readdirSync(previews).reduce(function (s, f) { return s + fs.statSync(path.join(previews, f)).size; }, 0);
console.log("Motion BG vitrini hazir: " + items.length + " kart, " + (bytes / 1024 / 1024).toFixed(2) + " MB");
