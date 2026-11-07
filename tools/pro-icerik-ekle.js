/*
 * Suflo Pro: CANLI icerik katalogunu silmeden yeni dosya ekleyen ek paket
 *
 * build-pro-cdn.js tum paketi bastan kurar; elindeki yerel Pro Pack klasoru sunucudakinden
 * eksikse (eski SFX / preset / altyazi stilleri) o manifest kullanicilarda icerik siler. Bu arac
 * sunucudaki GUNCEL manifest.json'u okur, yalniz ek klasordeki dosyalari ekler ve yeni surumle
 * birlestirilmis manifest uretir. Var olan kayitlara dokunmaz; ayni yolu farkli icerikle ezmez.
 *
 * Kullanim:
 *   node tools/pro-icerik-ekle.js <sunucudaki private/pro-v1/manifest.json> <ek klasoru> <yeni-icerik-surumu> [dist/cikis] [--tur=mogrt]
 *
 * --tur=mogrt,sfx,...: yalniz bu turler eklenir (ornek: AutoCaptions'in .prfpset'leri panelde listelenmez, ek pakete girmez).
 *
 * Ek klasoru, paket duzenindedir: mogrt/**.mogrt, presets/**.prfpset, sfx/**, motionbg/**
 * (ornek: suflo-pro-icerik/autocaptions; after-effects/ ve manifest.json gibi digerleri alinmaz).
 * Cikti: <cikis>/content/... (yalniz yeni dosyalar), <cikis>/manifest.json, dist/Suflo-Pro-Ek-<surum>.zip
 * Sunucuda: ZIP'i private/pro-v1/ icine cikar (content/ birlesir, manifest.json degisir). config.php'ye dokunmaz.
 */
"use strict";
var fs = require("fs"), path = require("path"), crypto = require("crypto"), cp = require("child_process");
var root = path.join(__dirname, "..");
var argv = process.argv.slice(2);
var turArg = argv.filter(function (a) { return /^--tur=/.test(a); })[0];
var turler = turArg ? turArg.slice(6).split(",").map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean) : null;
argv = argv.filter(function (a) { return !/^--tur=/.test(a); });
var manifestPath = argv[0] ? path.resolve(argv[0]) : "";
var source = argv[1] ? path.resolve(argv[1]) : "";
var version = String(argv[2] || "");
var outRoot = argv[3] ? path.resolve(argv[3]) : path.join(root, "dist", "pro-ek");

function fail(msg) { console.error("HATA: " + msg); process.exit(1); }
function inside(parent, child) {
  var p = path.resolve(parent), c = path.resolve(child);
  return c === p || c.indexOf(p + path.sep) === 0;
}
// js/pro-sync.js safeItem ile ayni izinli turler
function izinli(rel) {
  return /^mogrt\/.+\.mogrt$/i.test(rel) || /^sfx\/.+\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i.test(rel) ||
    /^motionbg\/.+\.(mp4|mov|m4v|webm)$/i.test(rel) || /^presets\/.+\.prfpset$/i.test(rel);
}

if (!manifestPath || !fs.existsSync(manifestPath)) fail("Sunucudaki guncel manifest.json bulunamadi (private/pro-v1/manifest.json).");
if (!source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) fail("Ek klasoru bulunamadi.");
if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(version)) fail("Gecerli bir icerik surumu yaz.");
if (!inside(path.join(root, "dist"), outRoot) || path.resolve(outRoot) === path.resolve(path.join(root, "dist"))) fail("Guvenli olmayan cikti yolu.");

var eski;
try { eski = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch (e) { fail("manifest.json okunamadi: " + e.message); }
if (!eski || eski.schema !== 1 || !Array.isArray(eski.files) || !eski.files.length) fail("manifest.json Suflo Pro katalogu degil.");
if (String(eski.content_version) === version) fail("Yeni surum eskisiyle ayni: " + version);

var mevcut = {};
eski.files.forEach(function (f) { mevcut[String(f.path).toLowerCase()] = f; });

var eklenen = [], ayni = [];
var contentDir = path.join(outRoot, "content");
fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(contentDir, { recursive: true });
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name.charAt(0) === ".") return;
    var full = path.join(dir, entry.name);
    if (entry.isSymbolicLink && entry.isSymbolicLink()) fail("Sembolik bag desteklenmiyor: " + full);
    if (entry.isDirectory()) return walk(full);
    var rel = path.relative(source, full).split(path.sep).join("/");
    if (!izinli(rel)) return;
    if (turler && turler.indexOf(rel.split("/")[0].toLowerCase()) === -1) return;
    var buf = fs.readFileSync(full);
    var kayit = { path: rel, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
    var var_ = mevcut[rel.toLowerCase()];
    if (var_) {
      if (var_.path !== rel) fail("Buyuk/kucuk harf cakismasi (Linux sunucuda 404): " + var_.path + " <-> " + rel);
      if (var_.sha256 !== kayit.sha256) fail("Katalogda ayni yol farkli icerikle var (ezilmez): " + rel);
      ayni.push(rel);
      return;
    }
    var target = path.join(contentDir, rel.split("/").join(path.sep));
    if (!inside(contentDir, target)) fail("Guvenli olmayan kaynak yolu: " + rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(full, target);
    eklenen.push(kayit);
    mevcut[rel.toLowerCase()] = kayit;
  });
})(source);
if (!eklenen.length) fail("Eklenecek yeni dosya yok" + (ayni.length ? " (" + ayni.length + " dosya katalogda zaten aynı)" : "") + ".");

var files = eski.files.concat(eklenen).sort(function (a, b) { return a.path.localeCompare(b.path, "en"); });
function say(re) { return files.filter(function (f) { return re.test(f.path); }).length; }
var manifest = {
  schema: 1,
  content_version: version,
  generated_at: new Date().toISOString(),
  counts: { mogrt: say(/^mogrt\//), sfx: say(/^sfx\//), motionbg: say(/^motionbg\//), presets: say(/^presets\//), total: files.length },
  total_bytes: files.reduce(function (sum, f) { return sum + f.bytes; }, 0),
  files: files
};
fs.writeFileSync(path.join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

// ZIP: content/ + manifest.json (private/pro-v1/ icine cikarilir). Windows'ta sistemin bsdtar'i ZIP yazar.
var zip = path.join(root, "dist", "Suflo-Pro-Ek-" + version + ".zip");
fs.rmSync(zip, { force: true });
var tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "";
var r = tar ? cp.spawnSync(tar, ["-a", "-cf", zip, "content", "manifest.json"], { cwd: outRoot, windowsHide: true })
  : cp.spawnSync("zip", ["-qr", zip, "content", "manifest.json"], { cwd: outRoot });
if (r.error || r.status !== 0) fail("ZIP olusturulamadi: " + (r.error ? r.error.message : String(r.stderr || "")));

console.log("Ek paket hazir: " + eklenen.length + " yeni dosya (" +
  (eklenen.reduce(function (s, f) { return s + f.bytes; }, 0) / 1024 / 1024).toFixed(1) + " MB)" +
  (ayni.length ? ", " + ayni.length + " dosya zaten katalogda" : "") + "; " +
  eski.content_version + " -> " + version + ", katalog " + eski.files.length + " -> " + files.length + " dosya");
console.log("ZIP: " + zip);
