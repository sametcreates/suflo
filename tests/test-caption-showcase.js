/* Ucretsiz kullanici 31 gercek altyazi stilini (17 + 14 AutoCaptions) dosyalari satin almadan gorur. */
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

ok("Vitrin tam 31 benzersiz altyazi stili tasir (17 + 14 AutoCaptions)",
  catalog.styleCount === 31 && catalog.items.length === 31 && Object.keys(keys).length === 31 && catalog.fileCount === 65,
  "katalog=" + catalog.items.length);
// AutoCaptions (ClashiVFX, yazarin izniyle; tools/build-autocaptions-showcase.js): Pro paketindeki
// "SUFLO MOGRT - AutoCaptions <Ad>.mogrt" dosyasinin panel adi styleKey'dir, gercek kartla vitrin karti tekillesir
var ac = catalog.items.filter(function (item) { return item.collection === "AutoCaptions"; });
ok("AutoCaptions: 14 vitrin karti katalogun sonunda, ad = styleKey = \"AutoCaptions <Ad>\"",
  ac.length === 14 && catalog.items.slice(-14).every(function (item) { return item.collection === "AutoCaptions"; }) &&
  ac.every(function (item) { return /^AutoCaptions [A-Z]/.test(item.name) && item.styleKey === item.name && item.category === "Subtitle Style"; }),
  ac.map(function (item) { return item.name; }).join(","));
ok("Her stil gercek statik ve hareketli MOGRT onizlemesine sahiptir",
  stills.length === 31 && videos.length === 31 && catalog.items.every(function (item) { return item.preview && item.video; }),
  "webp=" + stills.length + " webm=" + videos.length);
ok("Public vitrinde ucretli MOGRT dosyasi yoktur", !files.some(function (f) { return /\.mogrt$/i.test(f); }));
ok("Ucretsiz Stil alani public vitrini okur ve dosyasiz kartlari kabul eder",
  /pro-caption-showcase/.test(source) && /showcase:\s*true/.test(source) && /path:\s*""/.test(source));
ok("Node olmayan panel onizlemesi de altyazi vitrinini baslatir",
  /if \(!K\.nodeOK[\s\S]{0,420}altyaziStilleriniGonder\(\)/.test(library));
ok("Kilitli altyazi karti ozellige ozel satis kapisini acar",
  /Pro\.gate\("captionStyles"\)/.test(source) && /captionStyles:\s*'31 gerçek altyazı stili'/.test(pro));
ok("Gercek ve vitrin kartlari canonical stil anahtariyla tekillestirilir",
  /item\.styleKey\s*\|\|\s*temizMogrtAdi/.test(source));
ok("CEP acilisinda 17 WebM decoder'i birden baslatilmaz",
  /previewVideo\.preload\s*=\s*"none"/.test(source) &&
  !/motion\.preload\s*=\s*"metadata"/.test(source) &&
  /previewVideo\.removeAttribute\("src"\)/.test(source));
ok("Siparis kaynagi Lemon Squeezy siparis verisine eklenir",
  // ödeme bağlantısı js/pricing.js'e taşındı (fiyatla aynı para birimi); app.js onu kullanır
  /checkout%5Bcustom%5D%5Bsource%5D=suflo_panel/.test(fs.readFileSync(path.join(__dirname, "..", "js", "pricing.js"), "utf8")) &&
  /app_version/.test(fs.readFileSync(path.join(__dirname, "..", "js", "pricing.js"), "utf8")) && /SufloPricing\.checkoutUrl\(/.test(app));
ok("Web sitesi altyazi stillerini ilk Pro galerisinde gercek onizlemelerle gosterir",
  /class="on" data-g="captions"/.test(site) && (site.match(/gorseller\/caption-styles\/.+?\.webm/g) || []).length >= 8);
ok("Web odemesi sayfa ici pencere ve kaynak olcumuyle hazirdir",
  /app\.lemonsqueezy\.com\/js\/lemon\.js/.test(site) && /lemonsqueezy-button/.test(site) && /source%5D=suflo_website/.test(site));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
