/* Suflo Caption Editor ve tek motor kalite katmani. */
var fs = require("fs");
var path = require("path");
var ROOT = path.resolve(__dirname, "..");
var Q = require(path.join(ROOT, "js", "caption-quality.js"));
var pass = 0, fail = 0;

function ok(name, condition, detail) {
  if (condition) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ " + name + (detail ? " — " + detail : "")); }
}

ok("kalite motoru surumlenmis", Q.version === 1, Q.version);
ok("Turkce metin bosluk ve buyuk harf duzeltilir",
  Q.normalizeText("  şimdi  başlıyoruz  !  ", "tr") === "Şimdi başlıyoruz!",
  Q.normalizeText("  şimdi  başlıyoruz  !  ", "tr"));
ok("tekrarlanan noktalama sinirlanir", Q.normalizeText("inanılmaz!!!!", "tr") === "İnanılmaz!!");

var broken = [
  { start: 0, end: 0.35, text: "bu satır ekranda aşırı kısa kalacak ve okunamayacak", confidence: .55 },
  { start: 0.30, end: 3.2, text: "ikinci satır", confidence: .92 }
];
var report = Q.analyze(broken, { lang: "tr", maxChars: 32 });
ok("dusuk guven isaretlenir", report.rows[0].issues.some(function (x) { return x.code === "confidence"; }));
ok("cakisma isaretlenir", report.rows[0].issues.some(function (x) { return x.code === "overlap"; }));
ok("uzun ve hizli satir isaretlenir", report.rows[0].issues.some(function (x) { return x.code === "long-text"; }) && report.rows[0].issues.some(function (x) { return x.code === "fast"; }));
ok("sorunlu metnin puani 100 degildir", report.score < 100, report.score);

var fixed = Q.autoFix(broken, { lang: "tr", maxChars: 32 });
ok("nizami duzeltme uzun satiri boler", fixed.length > broken.length, fixed.length);
ok("nizami duzeltme metni normalize eder", fixed[0].text.charAt(0) === "B", fixed[0].text);
ok("nizami duzeltme negatif zaman uretmez", fixed.every(function (s) { return s.start >= 0 && s.end > s.start; }));
ok("nizami duzeltme sirayi korur", fixed.every(function (s, i) { return i === 0 || s.start >= fixed[i - 1].start; }));

var word = Q.fixTiming([
  { start: 1, end: 1.04, text: "merhaba" },
  { start: 1.05, end: 1.10, text: "dünya" }
], { wordMode: true });
ok("kelime zamanli mod kisa cuelari zorla uzatmaz", word[0].end - word[0].start < .2, word[0]);

/* ---- yerel motor (-ojf): satır güveni belirteç p ortalamasından, düşük güven işaretlenir ---- */
var WW = require(path.join(ROOT, "js", "whisper-words.js"));
var yerel = WW.segmentleriCoz(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "whisper-ojf-dusuk-guven.json")));
ok("yerel satırların güveni tanımlı (eskiden hep undefined)", yerel.every(function (s) { return typeof s.confidence === "number"; }), JSON.stringify(yerel.map(function (s) { return s.confidence; })));
var yerelRapor = Q.analyze(yerel, { lang: "tr", maxChars: 42 });
ok("dusuk belirtec p'li yerel satir 'Motor bu metinden emin degil' alir", yerelRapor.rows[0].issues.some(function (x) { return x.code === "confidence" && x.level === "bad" && /emin değil/.test(x.label); }),
  JSON.stringify(yerelRapor.rows[0].issues));
ok("emin olunan yerel satir isaretlenmez", !yerelRapor.rows[1].issues.some(function (x) { return x.code === "confidence"; }));
var k1Yerel = Q.analyze(WW.duzlestir(yerel), { lang: "tr", wordMode: true });
ok("kelime modunda dusuk p'li kelime ('Sufle' 0.33) isaretlenir", k1Yerel.rows[0].issues.some(function (x) { return x.code === "confidence"; }) && k1Yerel.rows[0].confidence === 0.33);
var belirtecsiz = WW.segmentleriCoz(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "whisper-oj-belirtecsiz.json")));
ok("belirtecsiz eski derlemede guven yok, uyari da yok", Q.analyze(belirtecsiz, { lang: "tr" }).rows.every(function (r) { return !r.issues.some(function (x) { return x.code === "confidence"; }); }));
var bolunen = Q.autoFix([{ start: 0, end: 4, text: "bir iki üç dört beş altı yedi sekiz dokuz on", words: "bir iki üç dört beş altı yedi sekiz dokuz on".split(" ").map(function (t, i) { return { text: t, start: i * 0.4, end: i * 0.4 + 0.3 }; }) }], { lang: "tr", maxChars: 20 });
ok("nizami duzeltme uzun satiri bolerken olculmus kelimeleri parcalara dagitir", bolunen.length > 1 &&
  bolunen.reduce(function (n, s) { return n + (s.words ? s.words.length : 0); }, 0) === 10 && bolunen.every(function (s) { return !s.words || s.words.every(function (w) { return (w.start + w.end) / 2 >= s.start - 0.3; }); }),
  JSON.stringify(bolunen.map(function (s) { return [s.text, s.words && s.words.length]; })));

var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var captions = fs.readFileSync(path.join(ROOT, "js", "captions.js"), "utf8");
// whisper-cli argümanları 3.2 adım 5'ten beri js/whisper-args.js'te (engine.js devreder)
var engine = fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "js", "whisper-args.js"), "utf8");
ok("arayuz tek Suflo Altyazi Motoru sunar", /Suflo Altyazı Motoru/.test(html) && /Bulut yedeği/.test(html));
ok("Caption Editor kalite puani ve filtreleri tasir", /SUFLO CAPTION EDITOR/.test(html) && /cap-quality-score/.test(html) && /cap-filter-issues/.test(html));
ok("tek motor yerel rota ve yedegi orkestre eder", /function transcribeSuflo/.test(captions) && /localEngineReady/.test(captions) && /cloudEngineReady/.test(captions));
ok("proje sozlugu decode promptuna girer", /prompt:\s*glossaryPrompt\((cevir)?\)/.test(captions) && /"--prompt"/.test(engine));
ok("yerel motor beam search kullanir (varsayilan 'En dogru')", /dogru: \{ bayrak: \["-bs", "5"\]/.test(engine) && /VARSAYILAN_COZME = "dogru"/.test(engine));
ok("Caption Editor ikinci metin kontrolunu satir sayisini koruyarak yapar", /async function proofreadAll/.test(captions) && /Never merge, split/.test(captions));
ok("duzeltme sonraki altyazilar icin ogrenilebilir", /function correctionFromEdit/.test(captions) && /function learnLastCorrection/.test(captions));
ok("kritik sorunlar timeline oncesi ikinci onay ister", /kritik \+ " kritik sorunla yine de uygula"/.test(captions) && /qualityReport\(\)/.test(captions));

/* ---- 3.2 adim 4: iki satirlik altyazi (2 satir × 42, Shift+Enter) ---- */
ok("normalizeText satir kirilimini tek \\n olarak korur", Q.normalizeText("  bir  iki \r\n\n  üç ", "tr") === "Bir iki\nüç", JSON.stringify(Q.normalizeText("  bir  iki \r\n\n  üç ", "tr")));
var ikiSatir = { start: 0, end: 3, text: "Bugün size kamerayla ilgili birkaç\nşey anlatacağım ve göstereceğim" };
ok("uzunluk denetimi satir basina: iki satir × 42 'Satır çok uzun' degil",
  !Q.inspectSegment(ikiSatir, 0, [ikiSatir], { maxChars: 42, maxLines: 2 }).issues.some(function (x) { return x.code === "long-text"; }));
ok("tek satir modunda da elle eklenen tek kirilim kabul edilir", !Q.inspectSegment(ikiSatir, 0, [ikiSatir], { maxChars: 42 }).issues.some(function (x) { return x.code === "long-text"; }));
var tekUzun = { start: 0, end: 3, text: "Bugün size kamerayla ilgili birkaç şey anlatacağım ve göstereceğim" };
ok("kirilimsiz 42'yi asan satir yine uyarilir", Q.inspectSegment(tekUzun, 0, [tekUzun], { maxChars: 42, maxLines: 2 }).issues.some(function (x) { return x.code === "long-text"; }));
var duzeltilen = Q.autoFix([tekUzun], { lang: "tr", maxChars: 42, maxLines: 2 });
ok("autoFix iki satir modunda bolmez, dengeli iki satira kirar", duzeltilen.length === 1 && duzeltilen[0].text.split("\n").length === 2 &&
  duzeltilen[0].text.split("\n").every(function (l) { return l.length <= 42; }), JSON.stringify(duzeltilen.map(function (x) { return x.text; })));
ok("autoFix tek satir modunda bugunku gibi boler", Q.autoFix([tekUzun], { lang: "tr", maxChars: 42 }).length === 2);
ok("autoFix ikiye sigan kirilimli satira dokunmaz", Q.autoFix([ikiSatir], { lang: "tr", maxChars: 42, maxLines: 2 })[0].text === ikiSatir.text);

console.log("\nCaption quality: " + pass + "/" + (pass + fail) + " gecti");
if (fail) process.exit(1);
