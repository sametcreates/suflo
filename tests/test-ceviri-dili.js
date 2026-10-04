// Suflo testi: ceviri sonrasi buyuk harf kurali hedef dile uyar; ceviri durumu veriden turer
// (captions.js'teki GERCEK styleText/styleLocale/ceviriVar kaynagi kesilip calistirilir)
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8");
function kes(imza) {
  var i = src.indexOf(imza); if (i === -1) throw new Error("yok: " + imza);
  return src.slice(i, src.indexOf("\n  }", i) + 4);
}
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

var M = new Function("DOM", "SEG", "CT_", [
  "var segments = SEG; var algilananDil = ''; var ceviriDili = '';",
  "function el(id) { return DOM[id]; }",
  kes("function ceviriVar("), kes("function styleLocale("), kes("function styleText("),
  "var CT = CT_;",
  "return { styleText: styleText, set: function (d) { ceviriDili = d; } };"
].join("\n"));

var DOM = { "cap-case": { value: "upper" }, "cap-punct": { checked: true }, "cap-lang": { value: "tr" } };
var segs = [{ text: "this is it", orig: "işte bu" }];
var m = M(DOM, segs, require(path.join(__dirname, "..", "js", "caption-text.js")));
ok("eski taslak (hedef dil kayitsiz), Ingilizce ceviri: THIS (THİS degil)", m.styleText("this is it") === "THIS IS IT", m.styleText("this is it"));
segs[0] = { text: "bu bir şey", orig: "this is a thing" };
ok("eski taslak, Turkceye ceviri: Turkce İ kurali tahmin edilir", m.styleText("bir şey") === "BİR ŞEY", m.styleText("bir şey"));
segs[0] = { text: "this is it", orig: "işte bu" };
m.set("en");
ok("Ingilizceye cevrilmis metin BUYUK HARF'te 'THIS' (THİS degil)", m.styleText("this is it") === "THIS IS IT", m.styleText("this is it"));
ok("orijinal (kaynakDili) metin hala Turkce kuralla", m.styleText("işte bu", true) === "İŞTE BU", m.styleText("işte bu", true));
segs[0] = { text: "this is it" };   // ceviri geri alindi: orig yok
ok("satirlarda orig kalmayinca kaynak kurala doner", m.styleText("bir") === "BİR");

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
