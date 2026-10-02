// Suflo testi: js/highlights.js — viral anlar (Shorts bulucu)
var path = require("path");
var H = require(path.join(__dirname, "..", "js", "highlights.js"));

var gecen = 0, toplam = 0;
function chk(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : ""));
}

// 10 dakikalik konusma: her satir 5 sn
var segs = [];
for (var i = 0; i < 120; i++) segs.push({ start: i * 5, end: i * 5 + 4.6, text: "Satır " + i + " burada bir şey söylüyorum." });

var p = H.buildPrompt(segs, { lang: "tr" });
chk("istem: satir numarali ve Turkce baslik istiyor", /\[0\] \[0s\]/.test(p.user) && /Turkish/.test(p.system) && /15-60 seconds/.test(p.system));
var seyrek = H.buildPrompt(segs, { maxChars: 800 });
chk("istem: uzun metin seyreltilir ama numaralar korunur", seyrek.user.length < 1300 && /\[\d+\] \[/.test(seyrek.user), seyrek.user.length);

var cevap = JSON.stringify({ clips: [
  { from: 10, to: 17, title: "Kimsenin bilmediği sır", hook: "Şaşırtıcı iddia", score: 9 },
  { from: 30, to: 30, title: "Kısa an", score: 7 },                 // 4.6 sn: uzatilmali
  { from: 50, to: 80, title: "Çok uzun", score: 6 },                // 154.6 sn: kirpilmali
  { from: 12, to: 15, title: "Çakışan", score: 5 },                 // ilki ile cakisiyor: elenmeli
  { from: 119, to: 125, title: "Sona taşan", score: 8 },            // sinir disi: sikistirilmali
  { from: "x", to: 3, title: "bozuk", score: 3 }
] });
var r = H.parseResponse(cevap, segs, {});
chk("puana gore sirali", r.length && r[0].score === 9 && r[0].title === "Kimsenin bilmediği sır", JSON.stringify(r.map(function (c) { return c.score; })));
chk("satir sinirina oturtulur", r.every(function (c) { return c.start === segs[c.from].start && c.end === segs[c.to].end; }));
chk("hepsi 15-60 sn", r.every(function (c) { return c.end - c.start >= 15 && c.end - c.start <= 60; }), JSON.stringify(r.map(function (c) { return Math.round(c.end - c.start); })));
chk("cakisan elendi", !r.some(function (c) { return c.title === "Çakışan"; }));
chk("bozuk girdi elendi", !r.some(function (c) { return c.title === "bozuk"; }));
var kisa = r.filter(function (c) { return c.title === "Kısa an"; })[0];
chk("kisa an satir eklenerek uzatildi (kanca basta)", kisa && kisa.from === 30 && kisa.end - kisa.start >= 15, kisa && JSON.stringify([kisa.from, kisa.to]));
var uzun = r.filter(function (c) { return c.title === "Çok uzun"; })[0];
chk("uzun an sondan kirpildi (kanca basta)", uzun && uzun.from === 50 && uzun.end - uzun.start <= 60, uzun && JSON.stringify([uzun.from, uzun.to]));
var sona = r.filter(function (c) { return c.title === "Sona taşan"; })[0];
chk("sinir disi numara sikistirildi", sona && sona.to === 119 && sona.end - sona.start >= 15, sona && JSON.stringify([sona.from, sona.to]));
chk("cakisma yok", r.every(function (a, i) { return r.every(function (b, j) { return i === j || a.end <= b.start + 0.01 || b.end <= a.start + 0.01; }); }));
chk("bozuk JSON bos liste", H.parseResponse("{bozuk", segs).length === 0);
chk("bos altyazi bos liste", H.parseResponse(cevap, []).length === 0);
var f = H.format(r.slice(0, 1));
chk("format: baslik, zaman, sure", /^1\. Kimsenin bilmediği sır \(0:50–1:29, 40 sn\) — Şaşırtıcı iddia$/.test(f), f);

// Kisa video (toplam 20 sn): 15 sn alt siniri saglanabiliyorsa uygulanir
var az = [];
for (var k = 0; k < 4; k++) az.push({ start: k * 5, end: k * 5 + 4.6, text: "x" + k });
var ra = H.parseResponse({ clips: [{ from: 0, to: 0, title: "a", score: 5 }] }, az, {});
chk("kisa videoda da uzatma calisir", ra.length === 1 && ra[0].end - ra[0].start >= 15, JSON.stringify(ra));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
