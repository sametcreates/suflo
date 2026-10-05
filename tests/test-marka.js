// Suflo testi: marka güvenli görünen adlar (global satış). Başkalarının marka ve kişi adları
// (CapCut, Hormozi, MrBeast) arayüzde, stil listesinde, yeniliklerde ve İngilizce sözlükte
// görünmez; stil kimlikleri (capcut, hormozi, mrbeast) kayıtlı tercihler bozulmasın diye aynı kalır.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var E = require(path.join(KOK, "js", "style-engine.js"));
var EN = require(path.join(KOK, "i18n", "en.js"));
var kapsama = require(path.join(KOK, "tools", "i18n-coverage.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
var MARKA = /CapCut|Hormozi|MrBeast|Mr\.? ?Beast/i;

var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
var gorunen = kapsama.extractHtml(html, true).filter(function (x) { return MARKA.test(x.text); });
ok("index.html görünen metin ve ipuçlarında marka adı yok", gorunen.length === 0, gorunen.map(function (x) { return x.line + ": " + x.text; }).join(" | "));
var optMetni = (html.match(/<option[^>]*>[^<]*<\/option>/g) || []).filter(function (o) { return MARKA.test(o.replace(/value="[^"]*"/, "")); });
ok("index.html seçenek metinlerinde marka adı yok (değerler aynı)", optMetni.length === 0, optMetni.join(" | "));

var adlar = E.list().map(function (s) { return s.name + " " + (s.description || ""); });
ok("SufloStyleEngine.list() adları marka güvenli", !adlar.some(function (a) { return MARKA.test(a); }), adlar.filter(function (a) { return MARKA.test(a); }).join(" | "));
ok("yeni adlar: capcut → Clean Pill, hormozi → Bold Box", E.preset("capcut").name === "Clean Pill" && E.preset("hormozi").name === "Bold Box" &&
  E.preset("mrbeast").name === "Creator Punch");
ok("kimlikler aynı: capcut / hormozi / mrbeast hâlâ çözülür", E.has("capcut") && E.has("hormozi") && E.has("mrbeast") &&
  E.preset("capcut").id === "capcut" && E.preset("hormozi").id === "hormozi" && E.preset("mrbeast").id === "mrbeast");

// Ad değişikliği çıktıyı değiştirmez: eski adlarla yüklenen motor bayt bayt aynı ASS üretir
var kaynak = fs.readFileSync(path.join(KOK, "js", "style-engine.js"), "utf8");
var eskiKaynak = kaynak.replace('name: "Clean Pill"', 'name: "CapCut Clean"').replace('name: "Bold Box"', 'name: "Hormozi"');
var kutu = { module: { exports: {} }, console: console };
kutu.exports = kutu.module.exports;
vm.runInNewContext(eskiKaynak, kutu);
var Eski = kutu.module.exports;
var cues = [{ start: 0, end: 0.4, text: "Bunu" }, { start: 0.4, end: 0.9, text: "sakın" }, { start: 0.9, end: 1.6, text: "kaçırma" },
  { start: 1.7, end: 2.2, text: "100" }, { start: 2.2, end: 2.9, text: "TL" }];
var ayni = ["capcut", "hormozi", "mrbeast"].every(function (id) {
  return [[1920, 1080], [1080, 1920]].every(function (wh) {
    var o = { styleId: id, cues: cues, width: wh[0], height: wh[1], cueKind: "words" };
    return Eski.preset(id).name !== E.preset(id).name || id === "mrbeast" ? Eski.compile(o).ass === E.compile(o).ass : false;
  });
});
ok("capcut ve hormozi render çıktısı ad değişikliğinden sonra aynı", ayni && Eski.preset("capcut").name === "CapCut Clean");

var app = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
var yen = app.slice(app.indexOf("var YENILIKLER = {"), app.indexOf("function yenilikleriGoster"));
ok("YENILIKLER penceresinde marka adı yok", yen.length > 100 && !MARKA.test(yen));
var pro = fs.readFileSync(path.join(KOK, "js", "pro.js"), "utf8");
var etiketler = pro.slice(pro.indexOf("var FEATURE_LABELS = {"), pro.indexOf("};", pro.indexOf("var FEATURE_LABELS = {")));
ok("Pro özellik etiketlerinde marka adı yok", !MARKA.test(etiketler));
var degerler = Object.keys(EN.strings).filter(function (k) { return MARKA.test(EN.strings[k]); });
ok("en.js değerlerinde marka adı yok", degerler.length === 0, degerler.join(" | "));
ok("en.js KEEP listesinde marka adı yok", !(EN.keep || []).some(function (k) { return MARKA.test(k); }));
var site = ["docs/index.html", "docs/blog/premiere-pro-turkce-altyazi-ekleme.html", "docs/blog/premiere-otomatik-altyazi-whisper.html", "README.md"]
  .filter(function (f) { return /Creator Punch, CapCut Clean|Hormozi, Neon|CapCut Clean/.test(fs.readFileSync(path.join(KOK, f), "utf8")); });
ok("site, blog ve README stil adları güncel", site.length === 0, site.join(","));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
