/* Free kullanici 30 Motion BG'yi kaynak video sizmadan kilitli gorur. */
"use strict";
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var DIR = path.join(ROOT, "assets", "pro-motionbg-showcase");
var catalog = JSON.parse(fs.readFileSync(path.join(DIR, "catalog.json"), "utf8"));
var files = fs.readdirSync(DIR, { recursive: true }).map(String);
var source = fs.readFileSync(path.join(ROOT, "js", "motionbg.js"), "utf8");
var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name + (evidence === undefined ? "" : "   [" + evidence + "]")); }
  else { failed++; console.log("FAIL " + name + "   [" + evidence + "]"); }
}
ok("Motion BG vitrini 30 gercek onizleme tasir", catalog.items.length === 30 &&
  catalog.items.every(function (item) { return item.preview && item.video; }), catalog.items.length);
ok("Public vitrinde kaynak MP4 MOV dosyasi yoktur", !files.some(function (f) { return /\.(?:mp4|mov|m4v)$/i.test(f); }));
ok("Free Motion BG kartlari kilitli ve satin alma kapisina bagli",
  /item\.showcase \? " locked"/.test(source) && /Pro\.gate\("motionbg"\)/.test(source));
ok("Motion BG WebM yalniz hover sirasinda acilir",
  /hoverVideo\.preload = "none"/.test(source) && /removeAttribute\("src"\)/.test(source));
console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
