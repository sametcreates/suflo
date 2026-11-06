// Suflo testi: js/kufur-maske.js — "Küfürleri maskele" (yalnız çıktı anında; transkript değişmez)
var path = require("path"), fs = require("fs");
var M = require(path.join(__dirname, "..", "js", "kufur-maske.js"));
var SE = require(path.join(__dirname, "..", "js", "style-engine.js"));
var C = require(path.join(__dirname, "..", "js", "caption-text.js"));
var CL = require(path.join(__dirname, "..", "js", "caption-layout.js"));

var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

ok("ilk harf kalir, gerisi yildiz", M.maskele("Siktir git") === "S***** git", M.maskele("Siktir git"));
ok("ekli bicimler: sikerim, siktiğim, amına, orospunun, piçler, götü",
  ["sikerim", "siktiğim", "amına", "orospunun", "piçler", "götü"].every(function (w) { return M.kufurMu(w); }));
// Scunthorpe sorunu: önek eşleşmesi masum sözcükleri yerdi
var masum = ["sikke", "sikkeler", "siklon", "amca", "amcam", "amcalar", "ama", "ambar", "götür", "götürdü", "götürmek", "boks", "bokser",
  "yaralı", "pişman", "kahve", "assess", "assessment", "class", "Scunthorpe", "cocktail", "bitcoin", "hello", "mesih", "şikayet"];
ok("masum sozcukler maskelenmez (sikke, amca, götür, boks, assess, siklon…)", masum.every(function (w) { return !M.kufurMu(w); }),
  masum.filter(function (w) { return M.kufurMu(w); }).join(","));
ok("Turkce sinir: kesme isaretinden sonraki ek kokle birlikte maskelenmez", M.maskele("orospu'nun oğlu") === "o*****'nun oğlu", M.maskele("orospu'nun oğlu"));
ok("Ingilizce buyuk harf ('SHIT', 'FUCKING') — Türkçe katlama 'I'yi 'ı' yapsa da", M.maskele("SHIT happens, FUCKING hell") === "S*** happens, F****** hell", M.maskele("SHIT happens, FUCKING hell"));
ok("Turkce buyuk harf ('SİKTİR')", M.maskele("SİKTİR") === "S*****", M.maskele("SİKTİR"));
ok("eslesme yoksa metin aynen", M.maskele("Bugün harika bir gün!") === "Bugün harika bir gün!" && !M.varMi("Bugün harika bir gün!") && M.varMi("bok gibi"));
ok("sozcuk sayisi degismez (kelime zamanlari tutar)", M.maskele("bu bok gibi iş").split(/\s+/).length === 4);
// *vurgu* yolu: stil motoru "b**" sonundaki yıldızları kapanış sanmasın
var g = M.maskele("bu *siktir* ve bok iş", { koruma: true });
var isaret = SE.markEmphasis(SE.splitToWords([{ start: 0, end: 2, text: g }]));
ok("koruma: stil motoru maskeyi yutmaz, vurgu yalniz isaretli kelimede", isaret.map(function (c) { return c.text.replace(/​/g, "") + (c.vurgu ? "!" : ""); }).join(" ") === "bu s*****! ve b** iş",
  JSON.stringify(isaret.map(function (c) { return c.text + (c.vurgu ? "!" : ""); })));
ok("koruma: caption-text emphasisMask ayni sonucu verir", JSON.stringify(C.emphasisMask(g)) === "[false,true,false,false,false]", JSON.stringify(C.emphasisMask(g)));
ok("korumasiz (SRT) ciktida gorunmez karakter yok", !/​/.test(M.maskele("bok gibi")));

/* captions.js cueler: ayar açıkken maske, kapalıyken aynen; transkript değişmez */
var src = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
function kes(imza) { var i = src.indexOf(imza); if (i === -1) throw new Error("yok: " + imza); return src.slice(i, src.indexOf("\n  }\n", i) + 4); }
function ortam(ayar, seg) {
  return new Function("SEG", "CT", "CL", "AYAR", "KM", [
    "var segments = SEG, emojisizCikti = false;",
    "var K = { settings: function () { return AYAR; } }, window = { SufloKufurMaske: KM };",
    "function styleText(t) { return t; }",
    kes("function satirlariTopla("), kes("function cueler("), kes("function kufurMaskesiAcik("), kes("function kufurMaskele("),
    "return { cueler: cueler, segments: segments };"
  ].join("\n"))(seg, C, CL, ayar, M);
}
var seg = [{ start: 0, end: 1, text: "bu *bok* gibi", orig: "this is shit", words: [{ text: "bu", start: 0, end: 0.3 }, { text: "bok", start: 0.3, end: 0.6 }, { text: "gibi", start: 0.6, end: 1 }] }];
var acik = ortam({ kufurMaske: true }, seg), kapali = ortam({}, seg);
ok("cueler: kapaliyken aynen", kapali.cueler()[0].text === "bu bok gibi" && kapali.cueler({ vurgu: true })[0].text === "bu *bok* gibi");
ok("cueler: SRT/VTT/caption izi maskeli, gorunmez karakter yok", acik.cueler()[0].text === "bu b** gibi", JSON.stringify(acik.cueler()[0].text));
ok("cueler: cift dil orijinali de maskeli", acik.cueler({ ciftDil: true })[0].text === "this is s***\nbu b** gibi", JSON.stringify(acik.cueler({ ciftDil: true })[0].text));
var stilli = acik.cueler({ vurgu: true, kelimeler: true })[0];
ok("cueler: stilli yol vurguyu korur, kelimeler maskeli ve sayisi ayni", stilli.text === "bu *b**​* gibi" && stilli.words.length === 3 && stilli.words[1].text === "b**",
  JSON.stringify(stilli));
ok("transkript (segments) degismez", seg[0].text === "bu *bok* gibi" && seg[0].words[1].text === "bok" && seg[0].orig === "this is shit");
ok("TXT disa aktarma ve onizleme de maskeyi kullanir", (src.match(/styleText\(kufurMaskele\(CT\.stripEmphasis\(/g) || []).length >= 3);
ok("index.html: kufur-maske.js captions.js'ten once yuklenir", (function () {
  var h = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  var a = h.indexOf('<script src="js/kufur-maske.js"></script>'), b = h.indexOf('<script src="js/captions.js"></script>');
  return a > 0 && a < b;
})());

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
