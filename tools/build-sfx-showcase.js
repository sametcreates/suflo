/* Ucretsiz kurulum icin yalniz SFX klasor adlari + adetleri. Ses dosyasi kopyalamaz. */
"use strict";
var fs = require("fs"), path = require("path");
var root = path.join(__dirname, "..");
var source = process.argv[2] ? path.resolve(process.argv[2]) : "";
var out = path.join(root, "assets", "pro-sfx-showcase");
var AUDIO = /\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i;
function fail(msg) { console.error("HATA: " + msg); process.exit(1); }
if (!source || !fs.existsSync(source) || !fs.statSync(source).isDirectory()) fail("SFX klasoru bulunamadi.");
var folders = [];
fs.readdirSync(source, { withFileTypes: true }).filter(function (e) { return e.isDirectory() && e.name.charAt(0) !== "."; }).forEach(function (entry) {
  var count = 0, bytes = 0;
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name.charAt(0) === ".") return;
      var full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (AUDIO.test(e.name)) { count++; bytes += fs.statSync(full).size; }
    });
  }
  walk(path.join(source, entry.name));
  if (count) folders.push({ name: entry.name.replace(/^SUFLO\s*-\s*/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim(), count: count, bytes: bytes });
});
folders.sort(function (a, b) {
  if (a.name === "sametcreates Essentials") return -1;
  if (b.name === "sametcreates Essentials") return 1;
  return b.count - a.count || a.name.localeCompare(b.name, "en");
});
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "catalog.json"), JSON.stringify({ version: 1, collection: "Suflo Pro SFX", publicPreviewOnly: true, total: folders.reduce(function (s, f) { return s + f.count; }, 0), folders: folders }, null, 2) + "\n", "utf8");
console.log("SFX vitrini hazir: " + folders.length + " klasor, " + folders.reduce(function (s, f) { return s + f.count; }, 0) + " ses");
