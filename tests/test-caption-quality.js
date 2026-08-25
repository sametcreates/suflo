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

var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var captions = fs.readFileSync(path.join(ROOT, "js", "captions.js"), "utf8");
var engine = fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8");
ok("arayuz tek Suflo Altyazi Motoru sunar", /Suflo Altyazı Motoru/.test(html) && /Bulut yedeği/.test(html));
ok("Caption Editor kalite puani ve filtreleri tasir", /SUFLO CAPTION EDITOR/.test(html) && /cap-quality-score/.test(html) && /cap-filter-issues/.test(html));
ok("tek motor yerel rota ve yedegi orkestre eder", /function transcribeSuflo/.test(captions) && /localEngineReady/.test(captions) && /cloudEngineReady/.test(captions));
ok("proje sozlugu decode promptuna girer", /prompt:\s*glossaryPrompt\(\)/.test(captions) && /"--prompt"/.test(engine));
ok("yerel motor beam search kullanir", /"-bs",\s*"5"/.test(engine));
ok("Caption Editor ikinci metin kontrolunu satir sayisini koruyarak yapar", /async function proofreadAll/.test(captions) && /Never merge, split/.test(captions));
ok("duzeltme sonraki altyazilar icin ogrenilebilir", /function correctionFromEdit/.test(captions) && /function learnLastCorrection/.test(captions));
ok("kritik sorunlar timeline oncesi ikinci onay ister", /kritik \+ " kritik sorunla yine de uygula"/.test(captions) && /qualityReport\(\)/.test(captions));

console.log("\nCaption quality: " + pass + "/" + (pass + fail) + " gecti");
if (fail) process.exit(1);
