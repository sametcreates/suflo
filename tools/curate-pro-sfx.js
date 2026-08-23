/*
 * Mevcut Pro SFX ile SUFLO EDIT VAULT ana kutuphanesini birlestirir.
 * - SHA-256 ile ayni sesin kopyalarini eler.
 * - Kokte dosya birakmaz; kullanim amacina gore klasorler.
 * - Muzik dosyalarini SFX bulutuna almaz.
 *
 * Kullanim:
 *   node tools/curate-pro-sfx.js <mevcut-sfx> <vault-main-sfx> <dist-cikis>
 */
"use strict";

var fs = require("fs"), path = require("path"), crypto = require("crypto");
var root = path.join(__dirname, "..");
var dist = path.join(root, "dist");
var currentRoot = process.argv[2] ? path.resolve(process.argv[2]) : "";
var vaultRoot = process.argv[3] ? path.resolve(process.argv[3]) : "";
var outputRoot = process.argv[4] ? path.resolve(process.argv[4]) : path.join(dist, "pro-sfx-curated");
var AUDIO = /\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i;

function fail(message) { console.error("HATA: " + message); process.exit(1); }
function inside(parent, child) {
  var p = path.resolve(parent), c = path.resolve(child);
  return c === p || c.indexOf(p + path.sep) === 0;
}
function fold(value) {
  return String(value || "").toLowerCase()
    .replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ıİi]/g, "i")
    .replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u");
}
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function walk(dir, source, list) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name.charAt(0) === ".") return;
    var full = path.join(dir, entry.name);
    if (entry.isSymbolicLink && entry.isSymbolicLink()) fail("Sembolik bag desteklenmiyor: " + full);
    if (entry.isDirectory()) { walk(full, source, list); return; }
    if (!AUDIO.test(entry.name)) return;
    list.push({ source: source, root: dir === full ? path.dirname(full) : (source === "current" ? currentRoot : vaultRoot),
      full: full, rel: path.relative(source === "current" ? currentRoot : vaultRoot, full).split(path.sep).join("/") });
  });
}
function category(candidates) {
  var hay = fold(candidates.map(function (c) { return c.rel; }).join(" "));
  if (/(^|\/)seni sectim(\/|$)/.test(hay)) return "sametcreates Essentials";
  if (/whoosh|woosh|swoosh|swish|whip|air move|fly by|flyby/.test(hay)) return "Whooshes & Swishes";
  if (/riser|build up|buildup|ascending|uplifter|tension/.test(hay)) return "Risers & Build Ups";
  if (/impact|\bhits?\b|boom|slam|punch|drop|anvil|gong|subsonic|crash|bonk|doink|drum roll|struck down|hammer|nails?/.test(hay)) return "Impacts & Hits";
  if (/glitch|distort|static|stutter|malfunction|interference/.test(hay)) return "Glitches & Distortion";
  if (/camera|shutter|photo|flash|snapshot/.test(hay)) return "Camera & Shutters";
  if (/paper|cardboard|fabric|cloth|canvas|page|tear|rip|crumble/.test(hay)) return "Paper & Texture";
  if (/keyboard|typing|typewriter|mouse|\bclick|\btap\b|button|keypress/.test(hay)) return "Typing & Clicks";
  if (/notification|chime|\bding\b|alert|alarm|interface|\bui\b|digital|beep|bleep|technology|videogame|computer|phone|data processing|display digits|error|denied|game menu|\bgta\b|hacking|lock|unlock|message sound|menu select/.test(hay)) return "UI Digital & Notifications";
  if (/cartoon|comedy|comic|laugh|crowd|applause|\bwow\b|fail|awkward|spring|anime|reaction|boing|\bpop\b|disappointment|awww|blush|twitch|cuckoo|cute|depress|chicken|donkey|fart|gasp|grunt|twang|funny|\bgag\b|\bhmmm?\b|kids|mouth|puff|squish|blip/.test(hay)) return "Comedy & Reactions";
  if (/money|cash|coin|register|purchase|pay|cha.?ching/.test(hay)) return "Money & Coins";
  if (/scary|horror|suspense|ambient|cinematic|clock|tick|fire|burn|dark|dramatic|doom|critical point|gears?|crank|mechanic/.test(hay)) return "Cinematic & Atmosphere";
  if (/viral|transition|reveal|movement|slice|spin|swipe|counter|counting|reel|instagram|\bslide\b|character gone|appearance|discovery|twinkle/.test(hay)) return "Viral & Transitions";
  return "Everyday & Utility";
}
function isMusic(candidates) {
  return candidates.every(function (candidate) {
    var hay = fold(candidate.rel);
    return /(^|\/)music(\/|$)|suflo music|background music|podcast background|music while talking/.test(hay);
  });
}
function candidateScore(candidate) {
  var rel = fold(candidate.rel), score = candidate.source === "vault" ? 20 : 10;
  if (/(^|\/)(extra|random|sfx)(\/|$)/.test(rel)) score -= 8;
  if (/(^|\/)seni sectim(\/|$)/.test(rel)) score += 100;
  score -= candidate.rel.length / 1000;
  return score;
}
function cleanName(name, hash) {
  var ext = path.extname(name).toLowerCase();
  var stem = path.basename(name, path.extname(name))
    .replace(/^(?:SUFLO\s+(?:SFX|ASSET|MUSIC)|SF)\s*-\s*/i, "")
    .replace(/\s+-\s+copy(?:\s*\(\d+\))?$/i, "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").replace(/[ .]+$/g, "").trim();
  if (!stem) stem = "SFX " + hash.slice(0, 8);
  if (stem.length > 150) stem = stem.slice(0, 140).replace(/[ .]+$/g, "") + " - " + hash.slice(0, 8);
  return stem + ext;
}

if (!currentRoot || !fs.existsSync(currentRoot) || !fs.statSync(currentRoot).isDirectory()) fail("Mevcut SFX klasoru bulunamadi.");
if (!vaultRoot || !fs.existsSync(vaultRoot) || !fs.statSync(vaultRoot).isDirectory()) fail("Vault ana SFX klasoru bulunamadi.");
if (!inside(dist, outputRoot) || path.resolve(outputRoot) === path.resolve(dist)) fail("Cikis yalniz dist altinda olabilir.");

var all = [];
walk(currentRoot, "current", all);
walk(vaultRoot, "vault", all);
var byHash = {};
all.forEach(function (item) {
  item.bytes = fs.statSync(item.full).size;
  item.hash = sha256(item.full);
  (byHash[item.hash] = byHash[item.hash] || []).push(item);
});

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
var usedPaths = {}, categories = {}, skippedMusic = 0, totalBytes = 0, written = 0;
Object.keys(byHash).sort().forEach(function (hash) {
  var candidates = byHash[hash];
  if (isMusic(candidates)) { skippedMusic++; return; }
  candidates.sort(function (a, b) { return candidateScore(b) - candidateScore(a); });
  var chosen = candidates[0], folder = category(candidates), filename = cleanName(path.basename(chosen.full), hash);
  var key = (folder + "/" + filename).toLowerCase();
  if (usedPaths[key] && usedPaths[key] !== hash) {
    filename = path.basename(filename, path.extname(filename)) + " - " + hash.slice(0, 8) + path.extname(filename);
    key = (folder + "/" + filename).toLowerCase();
  }
  usedPaths[key] = hash;
  var target = path.join(outputRoot, folder, filename);
  if (!inside(outputRoot, target)) fail("Guvenli olmayan cikti yolu: " + target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(chosen.full, target);
  categories[folder] = (categories[folder] || 0) + 1;
  totalBytes += chosen.bytes; written++;
});

var report = {
  schema: 1,
  generated_at: new Date().toISOString(),
  sources: { current: currentRoot, vault: vaultRoot },
  scanned: all.length,
  unique_hashes: Object.keys(byHash).length,
  duplicates_removed: all.length - Object.keys(byHash).length,
  music_skipped: skippedMusic,
  files: written,
  total_bytes: totalBytes,
  categories: categories
};
fs.writeFileSync(path.join(outputRoot, "curation-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("Suflo SFX hazir: " + written + " benzersiz ses, " + Object.keys(categories).length + " klasor, " +
  (totalBytes / 1024 / 1024).toFixed(1) + " MB, " + report.duplicates_removed + " tekrar elendi, " + skippedMusic + " muzik atlandi.");
Object.keys(categories).sort(function (a, b) { return (a === "sametcreates Essentials" ? -1 : b === "sametcreates Essentials" ? 1 : a.localeCompare(b)); })
  .forEach(function (name) { console.log("  " + name + ": " + categories[name]); });
console.log("Cikis: " + outputRoot);
