// Suflo testi: js/diller.js — altyazı dili seçicisinin "Diğer diller" grubu ve glif uyarısı
var fs = require("fs"), path = require("path");
var D = require(path.join(__dirname, "..", "js", "diller.js"));
var ayikla = require("./_ayikla.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var kodlar = D.WHISPER.map(function (d) { return d[0]; });
var tekil = kodlar.filter(function (k, i) { return kodlar.indexOf(k) === i; });
ok("Whisper listesi en az 99 dil, kodlar tekil", kodlar.length >= 99 && tekil.length === kodlar.length, kodlar.length);
ok("her kodun adı var", D.WHISPER.every(function (d) { return /^[a-z]{2,3}$/.test(d[0]) && typeof d[1] === "string" && d[1].length > 1; }));
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var sec = /<select id="cap-lang">([\s\S]*?)<\/select>/.exec(html)[1];
var htmlKod = (sec.match(/value="([a-z]*)"/g) || []).map(function (m) { return m.slice(7, -1); }).filter(Boolean);
ok("öne çıkanlar index.html'deki seçeneklerle aynı", JSON.stringify(htmlKod) === JSON.stringify(D.FEATURED), htmlKod.join(","));
var diger = D.moreLanguages();
ok("Diğer diller: öne çıkanlar tekrar edilmez", diger.length === kodlar.length - D.FEATURED.length &&
  diger.every(function (d) { return D.FEATURED.indexOf(d[0]) === -1; }), diger.length);
ok("Diğer diller ada göre sıralı", diger.every(function (d, i) { return i === 0 || diger[i - 1][1].localeCompare(d[1]) <= 0; }));
ok("isWhisperLang", D.isWhisperLang("ja") && D.isWhisperLang("yue") && !D.isWhisperLang("xx") && !D.isWhisperLang(""));
ok("glif uyarısı: CJK ve Hint alfabeleri", D.glyphWarning("zh") && D.glyphWarning("ja") && D.glyphWarning("ko") && D.glyphWarning("hi") && D.glyphWarning("ta"));
ok("glif uyarısı yok: Latin/Kiril/Arapça ve Otomatik", !D.glyphWarning("tr") && !D.glyphWarning("en") && !D.glyphWarning("ru") && !D.glyphWarning("ar") && !D.glyphWarning("") && !D.glyphWarning(null));
ok("index.html: glif notu ve diller.js betiği var", /id="cap-lang-glif" hidden/.test(html) && html.indexOf('<script src="js/diller.js"></script>') !== -1 &&
  html.indexOf('<script src="js/diller.js"></script>') < html.indexOf('<script src="js/captions.js"></script>'));
var src = ayikla(fs.readFileSync(path.join(__dirname, "..", "js", "diller.js"), "utf8"));
var YASAK = [/\?\.[A-Za-z_$(\[]/, /\?\?/, /=>/, /\bconst\b|\blet\b|`/];
ok("diller.js: ES5 / Chromium 74 uyumlu", !src.split("\n").some(function (s) { return YASAK.some(function (r) { return r.test(s); }); }));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
