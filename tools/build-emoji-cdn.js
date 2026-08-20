/*
 * Suflo Emoji CDN paketi uretir (Hostinger ve diger statik hostingler).
 *
 * Kullanim:
 *   node tools/build-emoji-cdn.js --source "D:\lisansli-emojiler" \
 *     --out "dist\hostinger-emoji" --rights-confirmed \
 *     --license-name "Suflo owned assets"
 *
 * UYARI: --rights-confirmed bilincli bir kapidir. Yalnizca dagitim hakkina sahip
 * oldugunuz veya lisansi buna izin veren varliklarla kullanin.
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

function arg(name) {
  var i = process.argv.indexOf("--" + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : "";
}
function has(name) { return process.argv.indexOf("--" + name) !== -1; }
function fail(message) { console.error("HATA: " + message); process.exit(1); }
function sha256(file) {
  var hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}
function fold(value) {
  return String(value || "").toLowerCase()
    .replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ıİi]/g, "i")
    .replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function displayName(file) {
  var value = path.basename(file, path.extname(file));
  value = value.replace(/^Suflo\s+Sametcreates\s*-\s*/i, "");
  value = value.replace(/\s*\[[^\]]*\]\s*/g, " ");
  value = value.replace(/(?:[_\s-](?:u\+)?[0-9a-f]{4,6})(?:-fe0f)?$/i, "");
  value = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return value || "Emoji";
}
function slug(value) {
  var out = fold(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (out || "emoji").slice(0, 52);
}
function visualFiles(dir, out, depth) {
  out = out || [];
  depth = depth === undefined ? 12 : depth;
  if (depth < 0) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    if (entry.name.charAt(0) === ".") return;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) visualFiles(full, out, depth - 1);
    else if (/\.(png|webp|gif|jpe?g)$/i.test(entry.name)) out.push(full);
  });
  return out;
}
function inside(parent, child) {
  var rel = path.relative(parent, child);
  return !!rel && rel !== ".." && rel.indexOf(".." + path.sep) !== 0 && !path.isAbsolute(rel);
}

var source = arg("source");
var output = arg("out");
var baseUrl = arg("base-url").replace(/\/+$/, "");
var licenseName = arg("license-name") || "Kullanim haklari varlik sahibine aittir";
var licenseUrl = arg("license-url");
var licenseFile = arg("license-file");

if (!has("rights-confirmed")) fail("Dagitim hakkini dogrulamak icin --rights-confirmed gerekli.");
if (!source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) fail("Gecerli --source klasoru gerekli.");
if (!output) fail("--out klasoru gerekli.");
source = path.resolve(source);
output = path.resolve(output);
var assetsDir = path.join(output, "assets");
var thumbsDir = path.join(output, "thumbs");
if (output === source || output === path.parse(output).root || inside(output, source) || inside(source, output)) {
  fail("--source ve --out birbirinden tamamen ayri, guvenli klasorler olmali.");
}
if (baseUrl) {
  try {
    var base = new URL(baseUrl);
    if (base.protocol !== "https:" || base.username || base.password) throw new Error("https");
    baseUrl = base.toString().replace(/\/+$/, "");
  } catch (eUrl) { fail("--base-url gecerli ve kimlik bilgisiz bir HTTPS adresi olmali."); }
}
try { fs.rmSync(assetsDir, { recursive: true, force: true }); } catch (e0) {}
try { fs.rmSync(thumbsDir, { recursive: true, force: true }); } catch (e1) {}
fs.mkdirSync(assetsDir, { recursive: true });
fs.mkdirSync(thumbsDir, { recursive: true });

function ffmpegAvailable() {
  try { return require("child_process").spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0; }
  catch (e) { return false; }
}
var makeThumbs = ffmpegAvailable();
function thumbnail(file, dest) {
  if (!makeThumbs) return false;
  var result = require("child_process").spawnSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", file, "-frames:v", "1",
    "-vf", "scale=240:240:force_original_aspect_ratio=decrease,pad=240:240:-1:-1:color=0x00000000",
    "-c:v", "libwebp", "-quality", "78", "-compression_level", "5", dest
  ], { encoding: "utf8" });
  return result.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 0;
}

var files = visualFiles(source).sort(function (a, b) { return a.localeCompare(b); });
if (!files.length) fail("Kaynak klasorde PNG, WEBP, GIF veya JPG bulunamadi.");
if (files.length > 2000) fail("Tek katalog en fazla 2000 gorsel icerebilir.");

var seenHash = {};
var seenId = {};
var items = [];
files.forEach(function (file) {
  var bytes = fs.statSync(file).size;
  if (!(bytes > 0) || bytes > 50 * 1024 * 1024) fail("Dosya 1 bayt ile 50 MB arasinda olmali: " + file);
  var hash = sha256(file);
  if (seenHash[hash]) return;
  seenHash[hash] = true;
  var name = displayName(file);
  var extension = path.extname(file).toLowerCase();
  if (extension === ".jpeg") extension = ".jpg";
  var id = slug(name) + "-" + hash.slice(0, 16);
  if (seenId[id]) fail("Benzersiz emoji kimligi uretilemedi: " + name);
  seenId[id] = true;
  var outName = id + extension;
  fs.copyFileSync(file, path.join(assetsDir, outName));
  var rel = "assets/" + outName;
  var thumbName = id + ".webp";
  var thumbRel = thumbnail(file, path.join(thumbsDir, thumbName)) ? "thumbs/" + thumbName : rel;
  items.push({
    id: id,
    name: name,
    file: baseUrl ? baseUrl + "/" + rel : rel,
    preview: baseUrl ? baseUrl + "/" + thumbRel : thumbRel,
    format: extension.slice(1).toUpperCase(),
    bytes: bytes,
    sha256: hash,
    category: "emoji",
    keywords: fold(name).split(/\s+/).filter(Boolean)
  });
});

if (licenseFile) {
  if (!fs.existsSync(licenseFile)) fail("--license-file bulunamadi: " + licenseFile);
  fs.copyFileSync(licenseFile, path.join(output, "LICENSE.txt"));
}

var catalog = {
  schema: "suflo-emoji-catalog/v1",
  version: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
  updatedAt: new Date().toISOString(),
  count: items.length,
  license: { name: licenseName, url: licenseUrl || undefined, notice: licenseFile ? "LICENSE.txt" : undefined },
  items: items
};
fs.writeFileSync(path.join(output, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n", "utf8");

var htaccess = [
  "Options -Indexes",
  "<IfModule mod_headers.c>",
  "  Header set Access-Control-Allow-Origin \"*\"",
  "  Header set X-Content-Type-Options \"nosniff\"",
  "  <FilesMatch \"\\.(png|webp|gif|jpg|jpeg)$\">",
  "    Header set Cache-Control \"public, max-age=31536000, immutable\"",
  "  </FilesMatch>",
  "  <FilesMatch \"catalog\\.json$\">",
  "    Header set Cache-Control \"no-cache, max-age=0\"",
  "  </FilesMatch>",
  "</IfModule>", ""
].join("\n");
fs.writeFileSync(path.join(output, ".htaccess"), htaccess, "utf8");

var readme = [
  "SUFLO EMOJI CDN - HOSTINGER",
  "",
  "1. Bu klasorun ICINDEKILERI Hostinger public_html altinda istedigin klasore yukle.",
  "2. Tarayicida catalog.json adresini acip JSON geldigini kontrol et.",
  "3. Suflo > Ayarlar > Emoji CDN alanina catalog.json adresini yapistir.",
  "",
  "Ornek: https://assets.suflo.app/emoji/v1/catalog.json",
  "Not: Yalnizca dagitim hakkina sahip oldugun varliklari yukle.", ""
].join("\n");
fs.writeFileSync(path.join(output, "HOSTINGER-KURULUM.txt"), readme, "utf8");

console.log("Emoji CDN paketi hazir: " + output);
console.log("Asset: " + items.length + " | Katalog: " + path.join(output, "catalog.json"));
