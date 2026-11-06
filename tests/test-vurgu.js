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
var M = new Function("SEG", "CT", "CL", [
  "var segments = SEG;",
  "function styleText(t) { return t; }",
  "var K = { settings: function () { return {}; } }, window = {}, emojisizCikti = false;",
  kes("function kufurMaskesiAcik("),
  kes("function kufurMaskele("),
  kes("function satirlariTopla("),
  kes("function cueler("),
  "return { cueler: cueler };"
].join("\n"));
var cm = M([{ start: 0, end: 1, text: "*100 TL* kazandım", orig: "*won* 100" }], C, require(path.join(__dirname, "..", "js", "caption-layout.js")));
ok("cueler: varsayilan (SRT/VTT/caption) isaretsiz", cm.cueler()[0].text === "100 TL kazandım");
ok("cueler: cift dil orijinali de isaretsiz", cm.cueler({ ciftDil: true })[0].text === "won 100\n100 TL kazandım");
ok("cueler: Suflo Stili icin isaret korunur", cm.cueler({ vurgu: true })[0].text === "*100 TL* kazandım");
ok("motor cagrilari vurgu (ve olculmus kelimeleri) ister", (src.match(/cueler\(\{ vurgu: true(, kelimeler: true)? \}\)/g) || []).length >= 3);
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
// 3.2 adim 4: satir kirilimi da modele gitmez (tek satir), donuste geri konur
ok("AI kontrolu isaretsiz (ve tek satir) metin gonderir", /originals\.slice\(i, i \+ BATCH\)\.map\(function \(t\) \{ return CL\.duzMetin\(CT\.stripEmphasis\(t\)\); \}\)/.test(src));
ok("ceviri istemi isaretleri korumayi ister", /wrap the corresponding translated words in single asterisks/.test(src));


/* editor kisayolu Ctrl+B (toggleRange) */
function tr(x, a, b) { return C.toggleRange(x, a, b).text; }
ok("Ctrl+B: imlecteki kelime", tr("bu çok önemli", 4, 4) === "bu *çok* önemli");
ok("Ctrl+B: tekrar basinca kalkar", tr("bu *çok* önemli", 5, 5) === "bu çok önemli");
ok("Ctrl+B: secim tek aralik olur", tr("bu çok önemli bir şey", 3, 13) === "bu *çok önemli* bir şey");
ok("Ctrl+B: araliktan tek kelime cikar, digeri vurgulu kalir", tr("bu *çok önemli* bir şey", 4, 6) === "bu çok *önemli* bir şey");
ok("Ctrl+B: noktalama disarida", tr("100 TL kazandım.", 8, 8) === "100 TL *kazandım*.");
ok("Ctrl+B: bosluktaki imlec degistirmez", tr("bu   ", 4, 4) === "bu   ");
var corr = new Function("CT", kes("function correctionFromEdit(") + "\nreturn correctionFromEdit;")(C);
ok("vurgu eklemek sozluk duzeltmesi sayilmaz", corr("bu kelime", "bu *kelime*") === null);
ok("gercek duzeltme yine onerilir (vurgulu kelimede de)", JSON.stringify(corr("bu *kelme*", "bu *kelime*")) === JSON.stringify({ from: "kelme", to: "kelime" }));


/* besinci inceleme: ekli kapanis, yildiz biriktirme */
ok("ekli kapanis: *Instagram*'da yalniz o kelime", JSON.stringify(C.emphasisMask("*Instagram*'da para kazan")) === "[true,false,false]");
ok("ekli kapanis strip", C.stripEmphasis("*Instagram*’dan para *kazan*!") === "Instagram’dan para kazan!");
ok("ekli kapanis motor", E.markEmphasis(E.splitToWords([{ start: 0, end: 2, text: "*YouTube*'a gel *hemen*" }])).map(function (c) { return c.text + (c.vurgu ? "!" : ""); }).join(" ") === "YouTube'a! gel hemen!");
ok("parantezli kapanis", JSON.stringify(C.emphasisMask("bunu *kimse*) bilmiyor")) === "[false,true,false]");
ok("Ctrl+B yalniz yildizli kelimeye yildiz eklemez", C.toggleRange("a * b", 2, 2).text === "a * b" && C.toggleRange("*", 0, 1).text === "*");


/* parti 6: ekli birim, okunusla sayi, hitap/dolgu, deger sozlugu, satir basina sinir */
function av(x) { return C.autoEmphasis(x); }
ok("ekli birim: '3 ayda' ve '10 bin' ayri vurgu", av("Bu yöntemle 3 ayda 10 bin takipçi kazandım") === "Bu yöntemle *3 ayda* *10 bin* takipçi kazandım",
  av("Bu yöntemle 3 ayda 10 bin takipçi kazandım"));
ok("ekli birimler: saatte, günde, dakikada, yılda, TL'ye, bin'e, milyonluk",
  av("2 saatte bitti") === "*2 saatte* bitti" && av("Günde 5 dakikada hallet") === "Günde *5 dakikada* hallet" &&
  av("100 TL'ye aldım bunu") === "*100 TL'ye* aldım bunu" && av("5 bin'e sattım") === "*5 bin'e* sattım" &&
  av("1 milyonluk ev aldı") === "*1 milyonluk* ev aldı" && av("10 yılda değişti") === "*10 yılda* değişti",
  [av("2 saatte bitti"), av("Günde 5 dakikada hallet"), av("100 TL'ye aldım bunu"), av("5 bin'e sattım"), av("1 milyonluk ev aldı")].join(" | "));
ok("buyukluk + birim zinciri: '10 bin TL', '3 milyon dolar'", av("Ayda 10 bin TL kazanıyorum") === "Ayda *10 bin TL* kazanıyorum" && av("Toplam 3 milyon dolar.") === "Toplam *3 milyon dolar*.");
ok("hitap/dolgu vurgulanmaz: 'Gerçekten inanılmaz bir deneyimdi arkadaşlar'", av("Gerçekten inanılmaz bir deneyimdi arkadaşlar") === "Gerçekten *inanılmaz* bir deneyimdi arkadaşlar",
  av("Gerçekten inanılmaz bir deneyimdi arkadaşlar"));
ok("okunusla sayi: 'Yüzde elli indirim fırsatı kaçmaz'", av("Yüzde elli indirim fırsatı kaçmaz") === "*Yüzde elli* indirim fırsatı kaçmaz", av("Yüzde elli indirim fırsatı kaçmaz"));
ok("okunusla sayi: 'İki milyon', 'iki buçuk saat', 'Bir milyon dolar', 'yüzde 30'",
  av("İki milyon kişi izledi") === "*İki milyon* kişi izledi" && av("iki buçuk saat sürdü") === "*iki buçuk saat* sürdü" &&
  av("Bir milyon dolar") === "*Bir milyon dolar*" && av("yüzde 30 indirim") === "*yüzde 30* indirim");
ok("cok anlamli sayi sozcukleri tek basina sayi degil ('bir gün', 'yedi', 'iki kişi', 'altı')",
  av("bir gün gelecek") === "bir gün gelecek" && av("iki kişi geldi") === "iki kişi geldi" && !/\*yedi\*/.test(av("Yemeği yedi ve gitti hemen oradan")) &&
  av("masanın altı dolu") === "masanın altı dolu");
ok("deger sozlugu onceligi: 'ücretsiz' kisa satirda da", av("Bu tamamen ücretsiz!") === "Bu tamamen *ücretsiz*!", av("Bu tamamen ücretsiz!"));
ok("deger sozlugu: 'en iyi' tek aralik, cumlecik basina bir, uzun satirda en cok 2",
  av("Bunu asla yapma, en iyi yol bu değil, ilk adım şu") === "Bunu *asla* yapma, *en iyi* yol bu değil, ilk adım şu",
  av("Bunu asla yapma, en iyi yol bu değil, ilk adım şu"));
ok("5 kelimelik satirda en cok 1 vurgu (degerli sozcuklerden yalniz biri)", C.emphasisMask(av("Asla bedava gizli sır yok")).filter(Boolean).length === 1 &&
  C.emphasisMask(av("Asla bedava gizli sır yok ama yarın")).filter(Boolean).length === 1, av("Asla bedava gizli sır yok"));
ok("sayi gruplari siniri doldurunca anahtar kelime eklenmez", av("Bu yöntemle 3 ayda 10 bin takipçi ücretsiz") === "Bu yöntemle *3 ayda* *10 bin* takipçi ücretsiz");
ok("'son olarak' dolgu, 'son şans' deger", av("Son olarak şunu söyleyeyim size") .indexOf("*Son") === -1 && av("Bu son şans") === "Bu *son* şans");
ok("Hatay / sonra / ilkokul deger sozlugune takilmaz", !/\*(Hatay|sonra|ilkokul)\*/.test(av("Hatay sonra ilkokul")), av("Hatay sonra ilkokul"));
["Bu yöntemle 3 ayda 10 bin takipçi kazandım", "Yüzde elli indirim fırsatı kaçmaz", "Bunu asla yapma, en iyi yol bu değil, ilk adım şu", "Bu tamamen ücretsiz!", "1 milyonluk ev aldı"].forEach(function (x) {
  var a = av(x);
  ok("idempotent ve geri donuslu  [" + x + "]", av(a) === a && C.stripEmphasis(a) === x && E.stripEmphasis(a) === x, a);
});
ok("elle isaretli satira dokunulmaz (yeni kurallarla da)", av("Bu *benim* 3 ayda ücretsiz") === "Bu *benim* 3 ayda ücretsiz");
ok("durak listesi: stil motorunun Altyazı Efektleri listesiyle ayni", JSON.stringify(E.ANLAMSIZ_KELIME) === JSON.stringify(C.VURGU_DURAK_KELIMELER) &&
  ["arkadaşlar", "gerçekten", "aslında", "şimdi", "tabii", "yani", "işte", "evet", "tamam", "bence", "sanki"].every(function (w) { return C.VURGU_DURAK_KELIMELER.indexOf(w) !== -1; }));
// Altyazı Efektleri büyüyen vurgu: işaret yokken anahtar hitap değil, en uzun ANLAMLI kelime
var kelimeCue = ["harika", "bir", "gün", "arkadaşlar"].map(function (w, i) { return { start: i * 0.4, end: i * 0.4 + 0.36, text: w }; });
var buy = E.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: { anim: "buyuyen-vurgu" } }).ass;
ok("efekt büyüyen vurgu: hitap ('arkadaşlar') değil 'harika' büyür", /\{\\fscx1\d\d\\fscy1\d\d\}harika/.test(buy) && !/\{\\fscx1[1-9]\d\\fscy1[1-9]\d\}arkadaşlar/.test(buy),
  (buy.match(/\\fscx\d+\\fscy\d+\}[^{]+/g) || []).slice(0, 6).join(" "));
var hepsiDurak = ["evet", "tamam", "arkadaşlar"].map(function (w, i) { return { start: i * 0.4, end: i * 0.4 + 0.36, text: w }; });
var buy2 = E.compile({ styleId: "efekt", cues: hepsiDurak, cueKind: "words", width: 1920, height: 1080, overrides: { anim: "buyuyen-vurgu" } }).ass;
ok("efekt büyüyen vurgu: kartta yalnız durak sözcüğü varsa eski seçim (en uzun)", /\{\\fscx1\d\d\\fscy1\d\d\}arkadaşlar/.test(buy2));
// eski stillerin meaningfulWord'ü değişmedi
var SE_SRC = fs.readFileSync(path.join(__dirname, "..", "js", "style-engine.js"), "utf8");
ok("eski stillerin meaningfulWord listesi aynen", /var ignore = \/\^\(ve\|ile\|bir\|bu\|şu\|o\|da\|de\|mi\|mı\|mu\|mü\|için\|ama\|the\|a\|an\|and\|or\|of\|to\)\$\/i;/.test(SE_SRC));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
