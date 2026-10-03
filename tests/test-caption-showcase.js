/* Ucretsiz kullanici 17 gercek altyazi stilini dosyalari satin almadan gorur. */
"use strict";

var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var DIR = path.join(ROOT, "assets", "pro-caption-showcase");
var catalog = JSON.parse(fs.readFileSync(path.join(DIR, "catalog.json"), "utf8"));
var files = fs.readdirSync(DIR, { recursive: true }).map(String);
var source = fs.readFileSync(path.join(ROOT, "js", "captions.js"), "utf8");
var library = fs.readFileSync(path.join(ROOT, "js", "library.js"), "utf8");
var pro = fs.readFileSync(path.join(ROOT, "js", "pro.js"), "utf8");
var app = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
var site = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name + (evidence === undefined ? "" : "   [" + evidence + "]")); }
  else { failed++; console.log("FAIL " + name + "   [" + evidence + "]"); }
}

var stills = files.filter(function (f) { return /\.webp$/i.test(f); });
var videos = files.filter(function (f) { return /\.webm$/i.test(f); });
var keys = {};
catalog.items.forEach(function (item) { keys[String(item.styleKey).toLowerCase()] = 1; });

ok("Vitrin tam 17 benzersiz altyazi stili tasir",
  catalog.styleCount === 17 && catalog.items.length === 17 && Object.keys(keys).length === 17,
  "katalog=" + catalog.items.length);
ok("Her stil gercek statik ve hareketli MOGRT onizlemesine sahiptir",
  stills.length === 17 && videos.length === 17 && catalog.items.every(function (item) { return item.preview && item.video; }),
  "webp=" + stills.length + " webm=" + videos.length);
ok("Public vitrinde ucretli MOGRT dosyasi yoktur", !files.some(function (f) { return /\.mogrt$/i.test(f); }));
ok("Ucretsiz Stil alani public vitrini okur ve dosyasiz kartlari kabul eder",
  /pro-caption-showcase/.test(source) && /showcase:\s*true/.test(source) && /path:\s*""/.test(source));
ok("Node olmayan panel onizlemesi de altyazi vitrinini baslatir",
  /if \(!K\.nodeOK[\s\S]{0,420}altyaziStilleriniGonder\(\)/.test(library));
ok("Kilitli altyazi karti ozellige ozel satis kapisini acar",
  /Pro\.gate\("captionStyles"\)/.test(source) && /captionStyles:\s*'17 gerçek altyazı stili'/.test(pro));
ok("Gercek ve vitrin kartlari canonical stil anahtariyla tekillestirilir",
  /item\.styleKey\s*\|\|\s*temizMogrtAdi/.test(source));
ok("CEP acilisinda 17 WebM decoder'i birden baslatilmaz",
  /previewVideo\.preload\s*=\s*"none"/.test(source) &&
  !/motion\.preload\s*=\s*"metadata"/.test(source) &&
  /previewVideo\.removeAttribute\("src"\)/.test(source));
ok("Siparis kaynagi Lemon Squeezy siparis verisine eklenir",
  /checkout%5Bcustom%5D%5Bsource%5D=suflo_panel/.test(app) && /app_version/.test(app));
ok("Web sitesi altyazi stillerini ilk Pro galerisinde gercek onizlemelerle gosterir",
  /class="on" data-g="captions"/.test(site) && (site.match(/gorseller\/caption-styles\/.+?\.webm/g) || []).length >= 8);
ok("Web odemesi sayfa ici pencere ve kaynak olcumuyle hazirdir",
  /app\.lemonsqueezy\.com\/js\/lemon\.js/.test(site) && /lemonsqueezy-button/.test(site) && /source%5D=suflo_website/.test(site));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
