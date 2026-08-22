/*
 * Suflo Pro CDN yukleme agaci + SHA-256 manifesti
 *
 * Kullanim:
 *   node tools/build-pro-cdn.js ".../Suflo Pro Pack" 2026.08.21.1 [dist/cikis]
 */
"use strict";
var fs = require("fs"), path = require("path"), crypto = require("crypto");
var root = path.join(__dirname, "..");
var source = process.argv[2] ? path.resolve(process.argv[2]) : "";
var version = String(process.argv[3] || "");
var outRoot = process.argv[4] ? path.resolve(process.argv[4]) : path.join(root, "dist", "pro-cdn");
var upload = path.join(outRoot, "upload");
var publicDir = path.join(upload, "public_html", "pro", "v1");
var privateDir = path.join(upload, "private", "pro-v1");
var contentDir = path.join(privateDir, "content");

function fail(msg) { console.error("HATA: " + msg); process.exit(1); }
function inside(parent, child) {
  var p = path.resolve(parent), c = path.resolve(child);
  return c === p || c.indexOf(p + path.sep) === 0;
}
if (!source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) fail("Paket klasoru bulunamadi.");
if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(version)) fail("Gecerli bir icerik surumu yaz.");
if (!inside(path.join(root, "dist"), outRoot) || path.resolve(outRoot) === path.resolve(path.join(root, "dist"))) fail("Guvenli olmayan cikti yolu.");
if (!fs.existsSync(path.join(source, "mogrt")) || !fs.existsSync(path.join(source, "sfx"))) fail("Kaynakta mogrt/ ve sfx/ klasorleri olmali.");

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(contentDir, { recursive: true });
fs.copyFileSync(path.join(root, "server", "pro-v1", "index.php"), path.join(publicDir, "index.php"));
fs.copyFileSync(path.join(root, "server", "pro-v1", ".htaccess"), path.join(publicDir, ".htaccess"));

var AUDIO = /\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i;
var files = [];
function walk(dir, base) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name.charAt(0) === ".") return;
    var full = path.join(dir, entry.name);
    var rel = path.relative(base, full).split(path.sep).join("/");
    if (entry.isSymbolicLink && entry.isSymbolicLink()) fail("Sembolik bag desteklenmiyor: " + full);
    if (entry.isDirectory()) { walk(full, base); return; }
    var allowed = /^mogrt\/.+\.mogrt$/i.test(rel)
      || (/^sfx\//i.test(rel) && AUDIO.test(rel))
      || /^motionbg\/.+\.(mp4|mov|m4v|webm)$/i.test(rel);
    if (!allowed) return;
    var target = path.join(contentDir, rel.split("/").join(path.sep));
    if (!inside(contentDir, target)) fail("Guvenli olmayan kaynak yolu: " + rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(full, target);
    var buf = fs.readFileSync(full);
    files.push({ path: rel, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") });
  });
}
walk(source, source);
files.sort(function (a, b) { return a.path.localeCompare(b.path, "en"); });
var mogrt = files.filter(function (f) { return /^mogrt\//.test(f.path); }).length;
var sfx = files.filter(function (f) { return /^sfx\//.test(f.path); }).length;
var motionbg = files.filter(function (f) { return /^motionbg\//.test(f.path); }).length;
if (!mogrt || !sfx) fail("MOGRT veya SFX icerigi bulunamadi.");
var manifest = {
  schema: 1,
  content_version: version,
  generated_at: new Date().toISOString(),
  counts: { mogrt: mogrt, sfx: sfx, motionbg: motionbg, total: files.length },
  total_bytes: files.reduce(function (sum, f) { return sum + f.bytes; }, 0),
  files: files
};
fs.writeFileSync(path.join(privateDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
var secret = crypto.randomBytes(48).toString("hex");
var config = "<?php\nreturn [\n" +
  "    'token_secret' => '" + secret + "',\n" +
  "    'token_ttl' => 7200,\n" +
  "    'store_id' => 454844,\n" +
  "    'product_id' => 1302656,\n" +
  "    'variant_id' => 0,\n" +
  "    'content_root' => __DIR__ . '/content',\n" +
  "    'manifest_path' => __DIR__ . '/manifest.json'\n" +
  "];\n";
fs.writeFileSync(path.join(privateDir, "config.php"), config, "utf8");
fs.writeFileSync(path.join(upload, "YUKLEME.txt"),
  "Hostinger domain kokunde public_html/ ve private/ klasorlerini ayni seviyeye yukle.\r\n" +
  "API: https://assets.suflo.app/pro/v1/index.php\r\n" +
  "Icerik: " + version + " | MOGRT=" + mogrt + " | SFX=" + sfx + " | MotionBG=" + motionbg + "\r\n", "utf8");
console.log("Suflo Pro CDN hazir: version=" + version + " files=" + files.length + " mogrt=" + mogrt + " sfx=" + sfx + " motionbg=" + motionbg + " bytes=" + manifest.total_bytes);
console.log("Yukleme klasoru: " + upload);
