// Suflo testi: js/youtube-meta.js — YouTube basligi, aciklama, etiket, hashtag (sinirlar)
var fs = require("fs"), path = require("path");
var Y = require(path.join(__dirname, "..", "js", "youtube-meta.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

var segs = [];
for (var i = 0; i < 600; i++) segs.push({ start: i * 3, end: i * 3 + 2.5, text: "cümle " + i + " *önemli* bilgi burada" });
var p = Y.buildPrompt(segs, { lang: "tr" });
ok("istem: Turkce, JSON bicimi, 70 karakter", /in Turkish/.test(p.system) && /"titles"/.test(p.system) && /max 70 characters/.test(p.system));
ok("istem: uzun metin kirpilir, yildizlar gitmez", p.user.length < 12400 && p.user.indexOf("*") === -1, p.user.length);

var uzunEtiketler = [];
for (var k = 0; k < 60; k++) uzunEtiketler.push("premiere pro ders " + k);
var r = Y.parseResponse(JSON.stringify({
  titles: ["\"Premiere'de **Altyazı** Ekleme\"", "Premiere'de Altyazı Ekleme", "", null, new Array(130).join("a ")],
  description: "Bu videoda **altyazı** eklemeyi öğreneceksin.\r\n\n\n\nKimler için: yeni başlayanlar.",
  tags: ["premiere", "Premiere", "#altyazı", "a,b"].concat(uzunEtiketler),
  hashtags: ["#Premiere Pro", "altyazı", "#premierepro", "#dört", "#beş"]
}));
ok("basliklar: tirnak/markdown temiz, tekrar ve bos atilir", JSON.stringify(r.basliklar.slice(0, 1)) === JSON.stringify(["Premiere'de Altyazı Ekleme"]) && r.basliklar.length === 2, JSON.stringify(r.basliklar));
ok("basliklar: 100 karakter siniri", r.basliklar.every(function (t) { return t.length <= 100; }));
ok("aciklama: markdown ve fazla bos satir temiz", r.aciklama === "Bu videoda altyazı eklemeyi öğreneceksin.\n\nKimler için: yeni başlayanlar.", JSON.stringify(r.aciklama));
var etiketUzunluk = r.etiketler.reduce(function (n, t, j) { return n + t.length + (j ? 1 : 0) + (/\s/.test(t) ? 2 : 0); }, 0);
ok("etiketler: tekrarsiz, # ve virgulsuz, toplam <= 500", r.etiketler[0] === "premiere" && r.etiketler.indexOf("Premiere") === -1 && r.etiketler[1] === "altyazı" && r.etiketler[2] === "a b" && etiketUzunluk <= 500, etiketUzunluk);
ok("hashtagler: tek kelime, tekrarsiz, en fazla 3", JSON.stringify(r.hashtagler) === JSON.stringify(["#PremierePro", "#altyazı", "#dört"]), JSON.stringify(r.hashtagler));
ok("bozuk JSON / bos yanit null", Y.parseResponse("{x") === null && Y.parseResponse("{}") === null);

var tam = Y.compose({ aciklama: "Metin.", bolumler: "0:00 Giriş\n1:10 Konu", hashtagler: ["#a", "#b"] });
ok("compose: metin + bolumler + hashtag", tam === "Metin.\n\n0:00 Giriş\n1:10 Konu\n\n#a #b", JSON.stringify(tam));
var dev = Y.compose({ aciklama: new Array(800).join("kelime "), bolumler: "0:00 Giriş\n1:10 Konu" });
ok("compose: 5000 siniri, bolumler korunur", dev.length <= 5000 && /0:00 Giriş\n1:10 Konu$/.test(dev), dev.length);

var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
ok("index: youtube-meta bolumler.js'ten ONCE yuklenir", html.indexOf("js/youtube-meta.js") !== -1 && html.indexOf("js/youtube-meta.js") < html.indexOf("js/bolumler.js"));
var bj = fs.readFileSync(path.join(__dirname, "..", "js", "bolumler.js"), "utf8");
ok("bolumler: gecerli bolumler aciklamaya eklenir, basliklar textContent", /CH\.validate\(list, \{ origin: 0, end: bitis\(\) \}\)\.ok \? CH\.format/.test(bj) && /b\.textContent = t/.test(bj));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
