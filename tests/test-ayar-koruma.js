// Suflo testi: okunamayan settings.json acilista ezilmez; ingilizce arayuzde klip/sekans/Shorts
// adlari (kullanici icerigi) cevrilmez.
//
// 3.1'de rehber (onboarding) ve davet modulu panel acilirken ayarlari kaydediyor. settings.json
// bozuksa (yarim yazim, elle duzenleme) ya da Not Defteri BOM'la kaydettiyse JSON.parse dusuyor,
// varsayilanlar yukleniyor ve ilk kayit dosyayi KULLANICI HICBIR SEY YAPMADAN eziyordu (API
// anahtari, stiller, klasorler kaybolurdu). 3.0'da acilista kayit yoktu.
var fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var KOK = path.join(__dirname, "..");
var SRC = fs.readFileSync(path.join(KOK, "js", "bridge.js"), "utf8");

function kopru(dizin) {
  var sandbox = {
    window: {}, console: console, require: require, process: process,
    URL: URL, Promise: Promise, Buffer: Buffer, JSON: JSON, Math: Math, Date: Date,
    setTimeout: setTimeout, clearTimeout: clearTimeout, String: String, Number: Number,
    Object: Object, Array: Array, Error: Error, RegExp: RegExp, isFinite: isFinite,
    CSInterface: function () { return { getSystemPath: function () { return dizin; }, evalScript: function () {} }; }
  };
  sandbox.CSInterface.SystemPath = { USER_DATA: "u", EXTENSION: "e" };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "bridge.js" });
  return sandbox.window.K;
}
var gecici = [];
function ortam(icerik) {
  var dizin = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ayar-"));
  gecici.push(dizin);
  fs.mkdirSync(path.join(dizin, "Kesit"));
  var p = path.join(dizin, "Kesit", "settings.json");
  if (icerik !== null) fs.writeFileSync(p, icerik, "utf8");
  return { dizin: dizin, p: p, kesit: path.join(dizin, "Kesit") };
}
function yedekler(o) { return fs.readdirSync(o.kesit).filter(function (f) { return /^settings\.bozuk-\d+\.json$/.test(f); }); }

// 1) BOM'lu (Not Defteri) settings.json okunur, degerler korunur
(function () {
  var o = ortam("﻿" + JSON.stringify({ apiKey: "gsk_gizli", provider: "groq", folders: ["/a"] }));
  var K = kopru(o.dizin);
  var s = K.settings();
  ok("BOM'lu settings.json okunur", s.apiKey === "gsk_gizli" && s.provider === "groq", JSON.stringify(s).slice(0, 120));
  s.davetRefId = "x";
  K.saveSettings();
  var disk = JSON.parse(fs.readFileSync(o.p, "utf8"));
  ok("BOM'lu dosya kaydedilince degerler kaybolmaz", disk.apiKey === "gsk_gizli" && disk.davetRefId === "x" && yedekler(o).length === 0);
})();

// 2) Bozuk settings.json: ilk kayittan once yedeklenir, ozgun icerik kaybolmaz
(function () {
  var bozuk = '{"apiKey":"gsk_gizli","folders":["/a"],';   // yarim yazilmis
  var o = ortam(bozuk);
  var K = kopru(o.dizin);
  K.settings().onboarding = { surum: 1 };
  ok("bozuk dosyada ayarlar varsayilana duser (cokme yok)", K.settings().provider === "local");
  ok("bozuk dosya: eski kurulum sayilir", K.ayarDosyasiVardi() === true);
  var r = K.saveSettings();
  var y = yedekler(o);
  ok("bozuk dosya ilk kayittan once yedeklenir", r === true && y.length === 1 && fs.readFileSync(path.join(o.kesit, y[0]), "utf8") === bozuk, y.join(","));
  ok("yedekten sonra yeni ayarlar yazilir", JSON.parse(fs.readFileSync(o.p, "utf8")).onboarding.surum === 1);
  K.saveSettings();
  ok("yedek yalniz bir kez alinir", yedekler(o).length === 1);
})();

// 3) JSON nesnesi olmayan icerik ("str", [], null) da yedeklenir; harfler ayar anahtari olmaz
(function () {
  var o = ortam('"str"');
  var K = kopru(o.dizin);
  var s = K.settings();
  ok("nesne olmayan settings.json: harf anahtarlari eklenmez", !Object.prototype.hasOwnProperty.call(s, "0"));
  K.saveSettings();
  ok("nesne olmayan settings.json yedeklenir", yedekler(o).length === 1);
})();

// 4) Saglam dosya ve taze kurulumda yedek yok
(function () {
  var o = ortam(JSON.stringify({ apiKey: "k" }));
  var K = kopru(o.dizin);
  K.settings().x = 1; K.saveSettings();
  ok("saglam settings.json: yedek alinmaz", yedekler(o).length === 0 && JSON.parse(fs.readFileSync(o.p, "utf8")).apiKey === "k");
  var t = ortam(null);
  var K2 = kopru(t.dizin);
  K2.saveSettings();
  ok("taze kurulum: yedek alinmaz, dosya olusur", yedekler(t).length === 0 && fs.existsSync(t.p) && K2.ayarDosyasiVardi() === false);
})();

/* ---------- kullanici icerigi arayuz cevirisine girmez ---------- */
var I = require(path.join(KOK, "js", "i18n.js"));
I.setDictionary(require(path.join(KOK, "i18n", "en.js")));
ok("onkosul: sozluk 'Giriş' kelimesini cevirir (klip adi riski gercek)", I.translate("Giriş.mp4") !== "Giriş.mp4" && I.translate("Shorts 1 · Sonuç") !== "Shorts 1 · Sonuç");

function Text(v) { this.nodeType = 3; this.nodeValue = v; this.parentNode = null; }
function El(tag, attrs, kids) {
  this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = {}; this.childNodes = []; this.parentNode = null;
  var self = this;
  Object.keys(attrs || {}).forEach(function (a) { self.attrs[a] = attrs[a]; });
  (kids || []).forEach(function (c) { var n = typeof c === "string" ? new Text(c) : c; n.parentNode = self; self.childNodes.push(n); });
}
El.prototype.getAttribute = function (a) { return Object.prototype.hasOwnProperty.call(this.attrs, a) ? this.attrs[a] : null; };
El.prototype.setAttribute = function (a, v) { this.attrs[a] = String(v); };
var ad = new El("span", { "class": "sel-name", "data-i18n-skip": "" }, ["Giriş.mp4"]);
var kok = new El("div", { id: "context-strip" }, [ad, new El("span", { "class": "pill" }, ["Klip seçilmedi"])]);
I.apply(kok);
ok("data-i18n-skip'li klip adi cevrilmez, yanindaki arayuz metni cevrilir",
  ad.childNodes[0].nodeValue === "Giriş.mp4" && kok.childNodes[1].childNodes[0].nodeValue !== "Klip seçilmedi",
  ad.childNodes[0].nodeValue + " | " + kok.childNodes[1].childNodes[0].nodeValue);

var app = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
var selName = app.match(/<span id="ctx-text" class="sel-name"[^>]*>/g) || [];
ok("app.js: baglam seridindeki klip/sekans adi data-i18n-skip tasir", selName.length === 2 && selName.every(function (s) { return /data-i18n-skip/.test(s); }), selName.join(" "));
ok("app.js: deneme ciktilari listesindeki sekans adi data-i18n-skip tasir", /sekansAdi\.setAttribute\("data-i18n-skip"/.test(app));
var paket = fs.readFileSync(path.join(KOK, "js", "shorts-paket.js"), "utf8");
ok("shorts-paket.js: Shorts basligi data-i18n-skip tasir", /ad\.textContent = k\.ad;[\s\S]{0,140}ad\.setAttribute\("data-i18n-skip"/.test(paket));
var beat = fs.readFileSync(path.join(KOK, "js", "beat.js"), "utf8");
ok("beat.js: secili klip adi data-i18n-skip tasir", !/textContent = ctx\.sel \? ctx\.sel\.name/.test(beat) && /ad\.setAttribute\("data-i18n-skip", ""\);\s*ad\.textContent = ctx\.sel\.name/.test(beat));

gecici.forEach(function (d) {
  try {
    fs.readdirSync(path.join(d, "Kesit")).forEach(function (f) { fs.unlinkSync(path.join(d, "Kesit", f)); });
    fs.rmdirSync(path.join(d, "Kesit")); fs.rmdirSync(d);
  } catch (e) {}
});
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
