// Suflo testi: B-roll onerileri — istem, ayristirma, arama baglantilari, host marker etiketi
var fs = require("fs"), path = require("path"), vm = require("vm");
var B = require(path.join(__dirname, "..", "js", "broll.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

var segs = [];
for (var i = 0; i < 100; i++) segs.push({ start: i * 4, end: i * 4 + 3.5, text: "satır " + i + " *araba* sürdük" });
var p = B.buildPrompt(segs, { lang: "tr" });
ok("istem: sureye gore adet (~dakikada 1), Ingilizce anahtar, Turkce gerekce", /Pick the 7 lines/.test(p.system) && /English stock-footage/.test(p.system) && /reason in Turkish/.test(p.system), p.system.slice(0, 90));
ok("istem: satir numarali, yildizsiz", /\[0\] satır 0 araba sürdük/.test(p.user));
var r = B.parseResponse(JSON.stringify({ broll: [
  { line: 10, keywords: ["city traffic", "car driving"], why: "araba anlatılıyor" },
  { line: 11, keywords: "steering wheel", why: "çok yakın, elenmeli" },
  { line: 30, keywords: "#sunset *beach*", why: "" },
  { line: 999, keywords: "x" }, null, { line: 40 }, { line: "abc", keywords: "y" }
] }), segs);
ok("ayristirma: gecersiz/eksik satirlar atlanir, yakin oneri elenir", r.length === 2 && r[0].line === 10 && r[1].line === 30, JSON.stringify(r.map(function (x) { return x.line; })));
ok("ayristirma: dizi anahtar kelime birlesir, # ve * temizlenir", r[0].keywords === "city traffic, car driving" && r[1].keywords === "sunset beach");
ok("ayristirma: aralik satir basinda, en fazla 5 sn", r[0].start === 40 && r[0].end - r[0].start <= 5 && r[0].end - r[0].start >= 1.5);
ok("bozuk JSON bos", B.parseResponse("{", segs).length === 0);
var u = B.searchUrls("city traffic, car driving");
ok("arama baglantilari: ilk obek, kodlanmis", u.pexels === "https://www.pexels.com/search/videos/city%20traffic/" && u.pixabay === "https://pixabay.com/videos/search/city%20traffic/");

// host: etiket ve renk; viral marker'lari b-roll eklenirken silinmez
var markers = [];
function FakeTime() { this.seconds = 0; }
var seq = { markers: {
  createMarker: function (t) { var m = { start: t, setColorByIndex: function (i) { this.renk = i; } }; markers.push(m); return m; },
  getFirstMarker: function () { return markers[0] || null; },
  getNextMarker: function (m) { return markers[markers.indexOf(m) + 1] || null; },
  deleteMarker: function (m) { markers.splice(markers.indexOf(m), 1); } } };
var ctx = { app: { project: { activeSequence: seq } }, Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
  isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, File: function () {}, Folder: function () {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
function call(fn, arg) { return JSON.parse(ctx[fn](encodeURIComponent(JSON.stringify(arg)))); }
call("KS_addRangeMarkers", { ranges: [{ start: 5, end: 30, name: "viral" }], replace: true });
var b1 = call("KS_addRangeMarkers", { ranges: [{ start: 40, end: 45, name: "B-roll: car" }], replace: true, etiket: "Suflo B-roll", renk: 0 });
var b2 = call("KS_addRangeMarkers", { ranges: [{ start: 50, end: 55, name: "B-roll: sea" }], replace: true, etiket: "Suflo B-roll", renk: 0 });
ok("host: b-roll yesil ve kendi etiketiyle; tekrar eklemede yalniz b-roll yenilenir", b1.ok && b2.removed === 1 && markers.length === 2 &&
  markers[0].comments.indexOf("Suflo viral:") === 0 && markers[0].renk === 1 && markers[1].comments.indexOf("Suflo B-roll:") === 0 && markers[1].renk === 0,
  JSON.stringify(markers.map(function (m) { return [m.comments, m.renk]; })));

var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var ui = fs.readFileSync(path.join(__dirname, "..", "js", "broll-ui.js"), "utf8");
ok("panel: kutu, betikler, metinler textContent ile", /id="cap-br-box"/.test(html) && html.indexOf("js/broll.js") < html.indexOf("js/broll-ui.js") &&
  (ui.match(/innerHTML\s*=/g) || []).length === (ui.match(/innerHTML = "";/g) || []).length && /KS_setPlayerPosition", \{ sec:/.test(ui));
// tum AI ayristiricilari ```json kod citine dayanikli
var Hh = require(path.join(__dirname, "..", "js", "highlights.js")), Tt = require(path.join(__dirname, "..", "js", "hook-title.js")), Cc = require(path.join(__dirname, "..", "js", "chapters.js"));
var s30 = []; for (var z = 0; z < 30; z++) s30.push({ start: z * 5, end: z * 5 + 4, text: "s" + z });
ok("kod citi: viral, b-roll, kanca, bolumler", Hh.parseResponse("```json\n{\"clips\":[{\"from\":2,\"to\":6,\"title\":\"t\",\"score\":5}]}\n```", s30, {}).length === 1 &&
  B.parseResponse("```\n{\"broll\":[{\"line\":3,\"keywords\":\"car\"}]}\n```", s30).length === 1 && Tt.parseSuggestions("```json\n{\"hooks\":[\"a *b*\"]}\n```").length === 1 &&
  /JSON\.parse\(content\.trim\(\)\.replace\(\/\^```/.test(fs.readFileSync(path.join(__dirname, "..", "js", "chapters.js"), "utf8")));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
