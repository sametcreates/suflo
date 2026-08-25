/*
 * Ucretsiz kullanici Pro MOGRT dosyalari olmadan da kilitli efekt vitrinini
 * gorur. Vitrin, gercek kutuphane sayisina karismaz ve Pro acilinca kalkar.
 */
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-pro-showcase-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
var EXT = path.join(TMP, "extension");
var SHOWCASE = path.join(EXT, "assets", "pro-mogrt-showcase");
fs.mkdirSync(path.join(SHOWCASE, "previews"), { recursive: true });
fs.writeFileSync(path.join(SHOWCASE, "catalog.json"), JSON.stringify({ items: [
  { id: "01-smooth-up", name: "Smooth Up", category: "Motion", match: "SUFLO TEXT - 01 Smooth Up.mogrt", preview: "previews/01.webp" },
  { id: "02-premium", name: "Premium Text", category: "Style", match: "SUFLO TEXT - 31 Premium Text.mogrt", preview: "previews/02.webp" }
] }));
fs.writeFileSync(path.join(SHOWCASE, "previews", "01.webp"), "preview");
fs.writeFileSync(path.join(SHOWCASE, "previews", "02.webp"), "preview");

var pro = false;
var ctx = {
  console: console, Promise: Promise, Buffer: Buffer,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: { getElementById: function () { return null; }, querySelectorAll: function () { return []; } },
  Pro: { isPro: function () { return pro; }, gate: function () { return false; }, on: function () {} },
  K: {
    nodeOK: true, fs: fs, path: path, os: os,
    settingsPath: function () { return path.join(TMP, "settings.json"); },
    extensionPath: function () { return EXT; },
    settings: function () { return {}; }, saveSettings: function () {},
    unzip: function () { return Promise.reject(new Error("no")); }, log: function () {}
  }
};
ctx.window = ctx;
vm.createContext(ctx);

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name + (evidence === undefined ? "" : "   [" + evidence + "]")); }
  else { failed++; console.log("FAIL " + name + "   [" + evidence + "]"); }
}

async function run() {
  var source = fs.readFileSync(path.join(ROOT, "js", "library.js"), "utf8");
  vm.runInContext(source, ctx, { filename: "js/library.js" });
  await ctx.KLib.tara();
  ok("Ucretsiz kullanici iki Pro vitrin kartini gorur", ctx.KLib.gorunenSayisi() === 2, ctx.KLib.gorunenSayisi());
  ok("Vitrin kartlari kilitli Pro onizlemesi olarak sayilir", ctx.KLib.vitrinSayisi() === 2, ctx.KLib.vitrinSayisi());
  ok("Vitrin gercek MOGRT dosyasi sayilmaz", ctx.KLib.sayisi() === 0 && ctx.KLib.yaziSayisi() === 0, "gercek=" + ctx.KLib.sayisi());
  ok("Vitrin karti bos yolu Premiere'e gondermeden Pro kapisinda durur",
    /if \(p\.showcase\)[\s\S]{0,320}Pro\.gate\("mogrt"\)/.test(source) && /path:\s*""/.test(source));

  pro = true;
  await ctx.KLib.tara();
  ok("Pro aktif olunca sanal vitrin gercek icerigin yerini tutmaz", ctx.KLib.gorunenSayisi() === 0, ctx.KLib.gorunenSayisi());

  var shippedCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "pro-mogrt-showcase", "catalog.json"), "utf8"));
  var previews = fs.readdirSync(path.join(ROOT, "assets", "pro-mogrt-showcase", "previews"));
  var stills = previews.filter(function (f) { return /\.webp$/i.test(f); });
  var motions = previews.filter(function (f) { return /\.webm$/i.test(f); });
  ok("Kurulum vitrini 40 efekt onizlemesi tasir", shippedCatalog.items.length === 40 && stills.length === 40,
    "katalog=" + shippedCatalog.items.length + " statik=" + stills.length);
  ok("Hareketli kaynak tasiyan efektler hover onizlemesiyle gelir",
    motions.length > 0 && shippedCatalog.items.filter(function (item) { return item.video; }).length === motions.length,
    "hareketli=" + motions.length);
  ok("CEP acilisinda MOGRT vitrini tum WebM decoder'larini birden baslatmaz",
    /previewVideo\.preload\s*=\s*"none"/.test(source) &&
    /previewVideo\.removeAttribute\("src"\)/.test(source) &&
    !/preload="metadata"/.test(source));
  ok("Public vitrinde MOGRT dosyasi yoktur",
    !fs.readdirSync(path.join(ROOT, "assets", "pro-mogrt-showcase"), { recursive: true }).some(function (f) { return /\.mogrt$/i.test(String(f)); }));

  console.log("\n" + passed + "/" + (passed + failed) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed ? 1 : 0);
}
run().catch(function (e) {
  console.log("FAIL test kosumu   [" + (e && e.stack ? e.stack : e) + "]");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
