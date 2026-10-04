// Suflo testi: "Suflo X.Y'de yeni" penceresi (js/app.js YENILIKLER) paket sürümüyle birlikte ilerlesin.
// Sürüm büyüdüğü hâlde liste eski kalırsa yükselten kullanıcı yeniliklerGoruldu yüzünden pencereyi hiç görmez.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 240) + "]" : "")); }
function oku(p) { return fs.readFileSync(path.join(KOK, p), "utf8"); }

var app = oku("js/app.js"), html = oku("index.html"), mf = oku("CSXS/manifest.xml"), ob = oku("js/onboarding.js");
var bas = app.indexOf("var YENILIKLER = {"), son = app.indexOf("function yenilikleriGoster");
var Y = null;
try { Y = vm.runInNewContext("(" + app.slice(bas + "var YENILIKLER = ".length, son).replace(/;\s*$/, "") + ")"); } catch (e) { Y = null; }
ok("YENILIKLER ayrıştırılabilir", !!Y && Y.maddeler && Y.maddeler.length > 0);
var surum = (mf.match(/ExtensionBundleVersion="(\d+)\.(\d+)\.\d+"/) || []).slice(1, 3).join(".");
ok("YENILIKLER.surum paket sürümünün major.minor'ı", !!Y && Y.surum === surum, (Y && Y.surum) + " / " + surum);
ok("onboarding.js yedek sürümü YENILIKLER ile aynı", !!Y && ob.indexOf('KApp.yenilikSurumu() : "' + Y.surum + '"') !== -1);
ok("başlık alt yazısı tanımlı", !!Y && typeof Y.alt === "string" && Y.alt.length > 3);

var sekmeler = {};
html.replace(/data-tab="([^"]+)"/g, function (_, t) { sekmeler[t] = 1; });
(Y ? Y.maddeler : []).forEach(function (m) {
  ok("madde '" + m.baslik + "': sekme var", !!sekmeler[m.sekme], m.sekme);
  var id = m.hedef || m.acilir;
  if (id) ok("madde '" + m.baslik + "': hedef öğe index.html'de", html.indexOf('id="' + id + '"') !== -1, id);
});
var hedefler = (Y ? Y.maddeler : []).map(function (m) { return m.sekme + ":" + (m.hedef || m.acilir || ""); }).join(" ");
["podcast:", "settings:grp-marka-kiti", "settings:grp-davet", "settings:set-ui-lang", "cut:tc-card"].forEach(function (h) {
  ok("v3.1 yeniliği duyuruluyor: " + h, hedefler.indexOf(h) !== -1);
});

// İngilizce karşılıklar
var EN = require(path.join(KOK, "i18n", "en.js"));
var sozluk = EN && (EN.strings || EN.dict || EN);
var metin = JSON.stringify(sozluk);
(Y ? Y.maddeler : []).forEach(function (m) {
  ok("EN karşılığı: " + m.baslik, metin.indexOf(JSON.stringify(m.baslik) + ":") !== -1 && metin.indexOf(JSON.stringify(m.metin) + ":") !== -1);
});
ok("EN karşılığı: alt başlık", !!Y && metin.indexOf(JSON.stringify(Y.alt) + ":") !== -1);

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
