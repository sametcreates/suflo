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
ok("bolumler: gecerli bolumler aciklamaya eklenir, basliklar textContent", /bolumlerGecerli\(\) \? CH\.format/.test(bj) && /b\.textContent = t/.test(bj));

/* yedinci inceleme: tuhaf LLM ciktisi */
var t2 = Y.parseResponse("```json\n{\"titles\":\"Tek başlık <b>\",\"description\":[\"p1\",\"p2\"],\"tags\":[{\"tag\":\"a\"},\"b\",{\"x\":1}],\"hashtags\":\"#pre-miere #abc\"}\n```");
ok("kod citi, metin baslik, dizi aciklama, nesne etiket, metin hashtag", t2 && JSON.stringify(t2.basliklar) === JSON.stringify(["Tek başlık b"]) && t2.aciklama === "p1\n\np2" &&
  JSON.stringify(t2.etiketler) === JSON.stringify(["a", "b"]) && JSON.stringify(t2.hashtagler) === JSON.stringify(["#premiere", "#abc"]), JSON.stringify(t2));
var cokBolum = []; for (var q = 0; q < 400; q++) cokBolum.push(q + ":00 Bölüm başlığı uzun");
var tasan = Y.compose({ aciklama: "metin", bolumler: cokBolum.join("\n") });
ok("compose: bolumler tek basina tassa da 5000'i asmaz, tek '…' kalmaz", tasan.length <= 5000 && tasan.indexOf("…\n\n") === -1, tasan.length);

/* platformlar */
var pt = Y.buildPrompt(segs, { lang: "tr", platform: "tiktok" });
ok("TikTok istemi: kanca + 5 hashtag, YouTube etiketi yok", /TikTok/.test(pt.system) && /5 hashtags/.test(pt.system) && !/search tags/.test(pt.system));
var ri = Y.parseResponse(JSON.stringify({ titles: ["Kanca"], description: "Gövde", tags: ["a"], hashtags: ["a", "b", "c", "d", "e", "f"] }), { platform: "instagram" });
ok("Instagram: 5 hashtag, etiket yok", ri.hashtagler.length === 5 && ri.etiketler.length === 0);
var ci = Y.compose({ aciklama: "Gövde", hashtagler: ["#a"], bolumler: "0:00 Giriş", platform: "instagram", kanca: "Kanca" });
ok("Instagram aciklamasi: kanca ilk satir, bolum yok", ci === "Kanca\n\nGövde\n\n#a", JSON.stringify(ci));
ok("Reels/TikTok 2200 siniri", Y.compose({ aciklama: new Array(600).join("kelime "), platform: "tiktok" }).length <= 2200);
ok("bilinmeyen platform YouTube sayilir", Y.compose({ aciklama: "a", bolumler: "0:00 x", platform: "??" }) === "a\n\n0:00 x");

/* davet: "Made with Suflo" kredi satiri (istege bagli) */
var KREDI = "Altyazılar: Suflo · suflo.app";
var krediTam = Y.compose({ aciklama: "Metin.", bolumler: "0:00 Giriş\n1:10 Konu", hashtagler: ["#a", "#b"], kredi: KREDI });
ok("kredi: en sonda, hashtag'lerden sonra", krediTam === "Metin.\n\n0:00 Giriş\n1:10 Konu\n\n#a #b\n\n" + KREDI, JSON.stringify(krediTam));
ok("kredisiz cikti degismez", Y.compose({ aciklama: "Metin.", bolumler: "0:00 Giriş\n1:10 Konu", hashtagler: ["#a", "#b"] }) === tam &&
  Y.compose({ aciklama: "Metin.", bolumler: "0:00 Giriş\n1:10 Konu", hashtagler: ["#a", "#b"], kredi: "" }) === tam &&
  Y.compose({ aciklama: "Metin.", bolumler: "0:00 Giriş\n1:10 Konu", hashtagler: ["#a", "#b"], kredi: "   " }) === tam);
ok("kredi Reels'te de en sonda", Y.compose({ aciklama: "Gövde", hashtagler: ["#a"], platform: "instagram", kanca: "Kanca", kredi: KREDI }) ===
  "Kanca\n\nGövde\n\n#a\n\n" + KREDI);
// sinira tam sigan metin: kredi eklenince tasacak -> kredi duser, govde KISALMAZ
var sigan = new Array(4991).join("a");   // 4990 karakter
var siganSonuc = Y.compose({ aciklama: sigan, kredi: KREDI });
ok("kredi sinirda ilk duser, govde kisaltilmaz (YouTube 5000)", siganSonuc === sigan && siganSonuc.indexOf(KREDI) === -1, siganSonuc.length);
var reelsSigan = new Array(2191).join("b");
ok("kredi sinirda ilk duser (Reels/TikTok 2200)", Y.compose({ aciklama: reelsSigan, platform: "tiktok", kredi: KREDI }) === reelsSigan);
var devKredi = Y.compose({ aciklama: new Array(800).join("kelime "), bolumler: "0:00 Giriş\n1:10 Konu", kredi: KREDI });
ok("uzun metinde kredi duser, bolumler kesilmez, 5000 asilmaz", devKredi.length <= 5000 && /0:00 Giriş\n1:10 Konu$/.test(devKredi) && devKredi.indexOf(KREDI) === -1, devKredi.length);
ok("uzun metinde kredili ve kredisiz cikti ayni (kredi icin govde kirpilmaz)", devKredi === dev);
var tasanKredi = Y.compose({ aciklama: "metin", bolumler: cokBolum.join("\n"), kredi: KREDI });
ok("bolumler tek basina tasinca kredi eklenmez", tasanKredi === tasan && tasanKredi.length <= 5000);
var sinirTam = new Array(5000 - KREDI.length - 2 + 1).join("c");
ok("kredi tam sigiyorsa eklenir (5000 dahil)", Y.compose({ aciklama: sinirTam, kredi: KREDI }).length === 5000 &&
  /suflo\.app$/.test(Y.compose({ aciklama: sinirTam, kredi: KREDI })));
var bj2 = fs.readFileSync(path.join(__dirname, "..", "js", "bolumler.js"), "utf8");
ok("bolumler.js ytAciklama krediyi gecer, kutu #cap-yt-kredi", /kredi:\s*krediSatiri\(\)/.test(bj2) && /cap-yt-kredi/.test(bj2) && html.indexOf('id="cap-yt-kredi"') !== -1);
ok("kredi kutusunun varsayilani: Pro degilse acik, kullanici secene dek", /typeof s\.krediSatiri === "boolean"/.test(bj2) && /Pro\.isPro\(\)/.test(bj2));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
