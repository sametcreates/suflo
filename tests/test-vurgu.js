// Suflo testi: anahtar kelime vurgusu (*kelime*) — motor, otomatik vurgu, cikti temizligi
var fs = require("fs"), path = require("path");
var E = require(path.join(__dirname, "..", "js", "style-engine.js"));
var C = require(path.join(__dirname, "..", "js", "caption-text.js"));

var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

// --- motor ---
var m = E.markEmphasis(E.splitToWords([{ start: 0, end: 3, text: "bu *çok önemli* bir *100* TL" }]));
ok("markEmphasis: isaret temizlenir, cok kelimeli aralik", m.map(function (c) { return c.text + (c.vurgu ? "!" : ""); }).join(" ") === "bu çok! önemli! bir 100! TL",
  m.map(function (c) { return c.text + (c.vurgu ? "!" : ""); }).join(" "));
var acik = E.markEmphasis([{ text: "*kapanmayan", lineEnd: true }, { text: "sonraki" }]);
ok("kapanmayan isaret satir sonunda kapanir", acik[0].vurgu && !acik[1].vurgu);
ok("yalniz yildiz olan kelime atilir", E.markEmphasis([{ text: "**" }, { text: "a" }]).length === 1);

var stiller = E.list().map(function (p) { return p.id; });
var vurguRenk = "#12ab34", vurguAss = E.assColor(vurguRenk);
stiller.forEach(function (id) {
  var cue = { start: 0, end: 3, text: "bunu *kimse* bilmiyor dostum" };
  var r = E.compile({ styleId: id, cueKind: "lines", cues: [cue], overrides: { vurguRenk: vurguRenk } });
  var olay = r.ass.split("\n").filter(function (l) { return /^Dialogue/.test(l) && /kimse/.test(l); });
  ok(id + ": yildiz ciktiya sizmaz", !/\*/.test(r.ass));
  // 'kimse' kelimesi, aktif olmadigi bir anda da vurgu renginde (ya da Neon'da tam parlak) cizilir
  var renkli = olay.some(function (l) {
    var i = l.indexOf("kimse"), on = l.slice(Math.max(0, i - 60), i);
    return on.indexOf(vurguAss) !== -1 || on.indexOf("\\1a&H00&") !== -1;
  });
  // Pop'ta kelime kendi kartinda: vurgulu kelimenin karti vurgu renginde
  if (id === "pop") renkli = r.ass.split("\n").some(function (l) { return /\\p1/.test(l) && l.indexOf(vurguAss) !== -1; });
  ok(id + ": vurgulu kelime vurgu renginde", renkli);
});
// isaretsiz metinde hicbir kelime vurgulu sayilmaz
ok("isaretsiz metin: vurgu yok", E.markEmphasis(E.splitToWords([{ start: 0, end: 2, text: "bir iki 5*3" }])).every(function (c) { return !c.vurgu; }));
var sw = E.splitToWords([{ start: 0, end: 2, text: "*aa* bb" }]);
ok("kelime suresi isaretten etkilenmez", Math.abs((sw[0].end - sw[0].start) - (sw[1].end - sw[1].start)) < 1e-9);

// --- caption-text ---
ok("stripEmphasis", C.stripEmphasis("bu *çok önemli* 5*3 = * x") === "bu çok önemli 5*3 = * x");
ok("stripEmphasis satir sonlarini korur", C.stripEmphasis("*a*\nb") === "a\nb");
ok("auto: para birimiyle", C.autoEmphasis("Bu ayda tam 100 TL kazandım.") === "Bu ayda tam *100 TL* kazandım.");
ok("auto: yuzde", C.autoEmphasis("%50 indirim var") === "*%50* indirim var");
ok("auto: noktalama yildiz disinda", C.autoEmphasis("Toplam 5 milyon.") === "Toplam *5 milyon*.", C.autoEmphasis("Toplam 5 milyon."));
ok("auto: sayisiz satirda tek anlamli kelime", C.autoEmphasis("Bunu kesinlikle bilmeniz gereken bir sır var!") === "Bunu *kesinlikle* bilmeniz gereken bir sır var!");
ok("auto: kisa satira dokunmaz", C.autoEmphasis("çok güzel") === "çok güzel");
ok("auto: isaretli satira dokunmaz", C.autoEmphasis("Zaten *işaretli* 100 metin") === "Zaten *işaretli* 100 metin");
ok("toggleWord ac/kapa", C.toggleWord("bir iki üç", 1) === "bir *iki* üç" && C.toggleWord("bir *iki* üç", 1) === "bir iki üç");
ok("hasEmphasis", C.hasEmphasis("a *b*") && !C.hasEmphasis("5*3"));

// --- captions.js: dis ciktilar isareti kaldirir, Suflo Stili korur ---
var src = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8");
function kes(imza) {
  var i = src.indexOf(imza); if (i === -1) throw new Error("yok: " + imza);
  return src.slice(i, src.indexOf("\n  }", i) + 4);
}
var M = new Function("SEG", "CT", [
  "var segments = SEG;",
  "function styleText(t) { return t; }",
  kes("function cueler("),
  "return { cueler: cueler };"
].join("\n"));
var cm = M([{ start: 0, end: 1, text: "*100 TL* kazandım", orig: "*won* 100" }], C);
ok("cueler: varsayilan (SRT/VTT/caption) isaretsiz", cm.cueler()[0].text === "100 TL kazandım");
ok("cueler: cift dil orijinali de isaretsiz", cm.cueler({ ciftDil: true })[0].text === "won 100\n100 TL kazandım");
ok("cueler: Suflo Stili icin isaret korunur", cm.cueler({ vurgu: true })[0].text === "*100 TL* kazandım");
ok("motor cagrilari vurgu ister", (src.match(/cueler\(\{ vurgu: true \}\)/g) || []).length >= 3);
ok("getSegments isaretsiz kopya verir", /text: CT\.stripEmphasis\(String\(s\.text/.test(src));
ok("index.html: Otomatik vurgu dugmesi", /id="cap-auto-vurgu"/.test(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")));


/* dorduncu inceleme: noktalama sonrasi kapanis, acik kalan isaret, AI turu */
["Bu ürün sadece 100 TL. Gerçekten çok iyi", "Toplam 5 milyon!", "Evet, bunu kesinlikle başardık?"].forEach(function (x) {
  var a = C.autoEmphasis(x);
  ok("gidis-donus: strip(auto(x)) === x  [" + x + "]", C.stripEmphasis(a) === x && E.stripEmphasis(a) === x, a + " -> " + C.stripEmphasis(a));
  var m2 = E.markEmphasis(E.splitToWords([{ start: 0, end: 3, text: a }]));
  ok("motor: sizinti yok ve vurgu yalniz isaretli kelimede  [" + x + "]", m2.every(function (c) { return c.text.indexOf("*") === -1; }) &&
    m2.filter(function (c) { return c.vurgu; }).length === C.emphasisMask(a).filter(Boolean).length,
    JSON.stringify(m2.map(function (c) { return c.text + (c.vurgu ? "!" : ""); })));
});
var sonda = E.markEmphasis(E.splitToWords([{ start: 0, end: 3, text: "Evet, kesinlikle *kazandık*! Sonra devam" }]));
ok("cumle sonu isaret kapanir, sonraki kelimeler vurgusuz", sonda.filter(function (c) { return c.vurgu; }).map(function (c) { return c.text; }).join(" ") === "kazandık!",
  JSON.stringify(sonda.map(function (c) { return c.text + (c.vurgu ? "!" : ""); })));
var kelimeler = [{ text: "*önemli" }].concat("a b c d e f g h".split(" ").map(function (w) { return { text: w }; }));
var km = E.markEmphasis(kelimeler);
ok("kelime modunda kapanmayan isaret sinirli surer", km.filter(function (c) { return c.vurgu; }).length <= 6 && !km[km.length - 1].vurgu);
ok("tek basina yildiz isaret acmaz", E.markEmphasis([{ text: "*" }, { text: "a" }, { text: "b" }]).every(function (c) { return !c.vurgu; }));
ok("toggleWord noktalamayi disarida birakir", C.toggleWord("TL.", 0) === "*TL*." && C.toggleWord("*TL*.", 0) === "TL.");
ok("reapplyEmphasis: kelime sirasiyla geri koyar", C.reapplyEmphasis("bu *önemli* bir şey", "bu önemli bir şeydi") === "bu *önemli* bir şeydi");
ok("reapplyEmphasis: kelime sayisi degisirse null", C.reapplyEmphasis("bu *önemli* şey", "bu çok önemli şey") === null);
ok("reapplyEmphasis: isaretsizde aynen", C.reapplyEmphasis("a b", "a c") === "a c");
ok("normalizeEmphasis: **x** -> *x*", C.normalizeEmphasis("bu **önemli** an") === "bu *önemli* an");
ok("AI kontrolu isaretsiz metin gonderir", /originals\.slice\(i, i \+ BATCH\)\.map\(CT\.stripEmphasis\)/.test(src));
ok("ceviri istemi isaretleri korumayi ister", /wrap the corresponding translated words in single asterisks/.test(src));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
