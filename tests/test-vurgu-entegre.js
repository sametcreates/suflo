// Suflo testi: *vurgulu* kelimeler Otomatik Zoom ve Akilli SFX'te kullanilir
var fs = require("fs"), path = require("path");
var C = require(path.join(__dirname, "..", "js", "caption-text.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

var v = C.emphasisInfo({ start: 10, end: 14, text: "bu ay tam *100 TL* kazandım" });
ok("emphasisInfo: kelime ve tahmini an", v && v.kelime === "100" && Math.abs(v.t - 11.6) < 1e-9 && v.adet === 2, JSON.stringify(v));
ok("emphasisInfo: vurgusuz null", C.emphasisInfo({ start: 0, end: 1, text: "düz metin" }) === null);
ok("emphasisInfo: noktalama kelimeden atilir", C.emphasisInfo({ start: 0, end: 2, text: "*kazandık*!" }).kelime === "kazandık");

// Zoom: zoom.js'teki gercek KZoomAkilliNoktalar
var zsrc = fs.readFileSync(path.join(__dirname, "..", "js", "zoom.js"), "utf8");
var zi = zsrc.indexOf("function KZoomAkilliNoktalar("), zj = zsrc.indexOf("\nfunction KZoomPlan(");
var Z = new Function(zsrc.slice(zi, zj) + "\nreturn KZoomAkilliNoktalar;")();
var cues = [
  { start: 0, end: 3, text: "merhaba arkadaşlar bugün" },
  { start: 3.1, end: 7.1, text: "bu ay tam 100 TL kazandım", vurgu: { kelime: "100", t: 4.9, adet: 2 } },
  { start: 7.2, end: 10, text: "nasıl mı anlatayım" }
];
var noktalar = Z({ dur: 10, offset: 0, interval: 5, cues: cues, segments: [] });
var kw = noktalar.filter(function (p) { return p.reason === "keyword"; });
ok("zoom: vurgulu kelimenin aninda punch-in", kw.length === 1 && Math.abs(kw[0].time - 4.9) < 1e-9, JSON.stringify(noktalar));
var off = Z({ dur: 10, offset: 100, interval: 5, cues: cues.map(function (c) { var o = JSON.parse(JSON.stringify(c)); o.start += 100; o.end += 100; if (o.vurgu) o.vurgu.t += 100; return o; }), segments: [] });
ok("zoom: klip baslangici (offset) dusulur", off.some(function (p) { return p.reason === "keyword" && Math.abs(p.time - 4.9) < 1e-9; }));

// SFX: sfx.js'teki gercek smartSuggestions (kural tablosu ve fold gercek, kutuphane siralamasi sahte)
var ssrc = fs.readFileSync(path.join(__dirname, "..", "js", "sfx.js"), "utf8");
function kes(imza) { var i = ssrc.indexOf(imza); return ssrc.slice(i, ssrc.indexOf("\n  }", i) + 4); }
var kurallar = ssrc.slice(ssrc.indexOf("  var SMART_RULES = ["), ssrc.indexOf("  var PLAY_SVG"));
var S = new Function([kurallar, kes("function fold("), kes("function ruleFor("),
  "function rankForRule() { return []; }", "function norm(x) { return x; }", "var smartDensity = 'balanced';",
  kes("function smartSuggestions("), "return smartSuggestions;"].join("\n"))();
var segs = [
  { start: 0, end: 2, text: "selam" },
  { start: 2.1, end: 5, text: "bu yöntemle çok para kazandım", vurgu: { kelime: "para", t: 3.4, adet: 1 } },
  { start: 5.2, end: 7, text: "sıradan bir cümle", vurgu: { kelime: "cümle", t: 6.5, adet: 1 } }
];
var oneriler = S(segs, { density: "soft" });
var para = oneriler.filter(function (c) { return c.isaretli && Math.abs(c.time - 3.4) < 1e-9; })[0];
ok("sfx: isaretli kelimede, kelimenin aninda, kelimenin kurali (Para)", para && para.rule.id === "money", JSON.stringify(oneriler.map(function (c) { return [c.time, c.rule.id, c.isaretli]; })));
var vurgu = oneriler.filter(function (c) { return Math.abs(c.time - 6.5) < 1e-9; })[0];
ok("sfx: kurali olmayan isaretli kelime 'Vurgu' ile, sakin modda bile", vurgu && vurgu.rule.id === "emphasis");
var cok = [];
for (var i = 0; i < 40; i++) cok.push({ start: i * 1.5, end: i * 1.5 + 1.2, text: "dikkat bu çok önemli!" });
cok.push({ start: 70, end: 72, text: "son söz", vurgu: { kelime: "söz", t: 71, adet: 1 } });
var sinirli = S(cok, { density: "balanced" });
ok("sfx: sinir asilinca isaretli kelime dusmez, sira zamana gore", sinirli.length === 16 && sinirli[sinirli.length - 1].time === 71 &&
  sinirli.every(function (c, k) { return !k || sinirli[k - 1].time <= c.time; }), sinirli.length);

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
