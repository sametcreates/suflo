// Suflo testi: js/caption-layout.js — okunabilir altyazı düzeni (3.2 adım 4)
//   kelimeden satır, 2 × 42 dengeli kırılım, kısa parça birleştirme, karakterle bölme, ekran süresi,
//   düzenlemede kelime hizalama (LCS) ve panel bağlantısı (captions.js, caption-text.js, index.html)
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var CL = require(path.join(KOK, "js", "caption-layout.js"));
var WW = require(path.join(KOK, "js", "whisper-words.js"));
var CT = require(path.join(KOK, "js", "caption-text.js"));

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : ""));
}
function J(x) { return JSON.stringify(x); }
function metinler(liste) { return liste.map(function (x) { return x.text; }).join("|"); }
// Kelimeleri sırayla zamanla: her kelime 0,3 sn, aralarda 0,05 sn (duraklama yok)
function zamanla(cumle, bas, adim) {
  bas = bas || 0; adim = adim || 0.35;
  return cumle.split(" ").map(function (t, i) { return { text: t, start: +(bas + i * adim).toFixed(3), end: +(bas + i * adim + 0.3).toFixed(3) }; });
}
function hepsi(ws) { return ws.map(function (w) { return w.text; }).join(" "); }
function satirlar(t) { return String(t).split("\n"); }

/* ---------------- 1) dengeliSar: 21/21, 38/4 değil ---------------- */
// açgözlü sarma 39/3 verirdi: 42'ye kadar doldurur, son kelime alt satıra tek başına kalır
var cumle = "Bugün size kamerayla ilgili birkaç şeyi ama";
ok("açgözlü sarma bu cümlede dengesiz (39 / 3)", (function () {
  var ws = cumle.split(" "), s = [], cur = "";
  ws.forEach(function (w) { var a = cur ? cur + " " + w : w; if (cur && a.length > 42) { s.push(cur); cur = w; } else cur = a; });
  s.push(cur);
  return s.length === 2 && s[0].length === 39 && s[1].length === 3;
})(), cumle.length);
var dengeli = CL.dengeliSar(cumle, 42, 2);
var ds = satirlar(dengeli);
ok("dengeliSar: iki satır, en uzun satır en kısa (≈ yarı yarıya)", ds.length === 2 && Math.abs(ds[0].length - ds[1].length) <= 6 && Math.max(ds[0].length, ds[1].length) <= 30, J(ds));
var yirmiBir = "aaaa bbbb cccc dddd e ffff gggg hhhh iiii j";   // 43 karakter
var y21 = satirlar(CL.dengeliSar(yirmiBir, 42, 2));
ok("dengeliSar: 21/21 kırılım", y21.length === 2 && y21[0].length === 21 && y21[1].length === 21, J(y21));
ok("dengeliSar: tek satıra sığan metin aynen (kırılımsız)", CL.dengeliSar("Kısa bir altyazı", 42, 2) === "Kısa bir altyazı");
ok("dengeliSar: maxLines 1 tek satır döner (sarmaz)", CL.dengeliSar(cumle, 42, 1) === cumle);
ok("dengeliSar: eski kırılımları ve çoklu boşluğu düzler", CL.dengeliSar("Kısa\n  bir   altyazı", 42, 2) === "Kısa bir altyazı");
var tasan = "Şuadresi https://ornek.com/cok-uzun-bir-baglanti-adresi-burada-yazili ziyaret edin lütfen";
var tasanS = satirlar(CL.dengeliSar(tasan, 42, 2));
ok("dengeliSar: sığmayan (42'den uzun tek kelime) açgözlü sarmaya düşer, hiçbir kelime atılmaz",
  tasanS.join(" ") === tasan && tasanS.length >= 2, J(tasanS));
ok("dengeliSar: 3 satıra izin varsa sığan en az satır seçilir; hiç sığmıyorsa açgözlü (kelime atılmaz)", (function () {
  var t = "bir iki üç dört beş altı yedi sekiz dokuz on onbir oniki onüç ondört onbeş onaltı onyedi";
  var r = satirlar(CL.dengeliSar(t, 32, 3)), r30 = satirlar(CL.dengeliSar(t, 30, 3));
  return r.length === 3 && r.every(function (x) { return x.length <= 32; }) && r.join(" ") === t &&
    r30.length === 4 && r30.join(" ") === t;
})());

/* ---------------- 2) ikiyeBolNoktasi = stil motorunun eski bölmesi ---------------- */
function eskiStilBolme(words, max) {
  var best = 1, bestScore = 9999;
  for (var i = 1; i < words.length; i++) {
    var left = words.slice(0, i).join(" ").length;
    var right = words.slice(i).join(" ").length;
    var score = Math.abs(left - right) + (Math.max(left, right) > max ? 12 : 0);
    if (score < bestScore) { best = i; bestScore = score; }
  }
  return best;
}
var tohum = 7;
function rastgele() { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; }
var ayrisan = [];
for (var r = 0; r < 600; r++) {
  var n = 3 + Math.floor(rastgele() * 12), kel = [];
  for (var k = 0; k < n; k++) kel.push(new Array(1 + Math.floor(rastgele() * 11)).join("x") + "y");
  [22, 38, 42].forEach(function (mx) { if (CL.ikiyeBolNoktasi(kel) !== eskiStilBolme(kel, mx)) ayrisan.push(J(kel) + "@" + mx); });
}
ok("ikiyeBolNoktasi: stil motorunun eski \\N bölmesiyle 1800 rastgele girdide aynı (stil çıktısı değişmez)", ayrisan.length === 0, ayrisan.slice(0, 2).join(" "));
ok("ikiyeBolNoktasi: tek kelimede -1", CL.ikiyeBolNoktasi(["tek"]) === -1);

/* ---------------- 3) kelimedenSatirlar ---------------- */
var akis = zamanla("Bu ışık hiç de kötü değil, değil mi? Şimdi kamerayı biraz sola çevirelim.");
var l42 = CL.kelimedenSatirlar(akis, { maxChars: 42, maxLines: 1 });
ok("kelimedenSatirlar: cümle sonunda (? .) kırılır, kelimeler korunur", metinler(l42) === "Bu ışık hiç de kötü değil, değil mi?|Şimdi kamerayı biraz sola çevirelim." &&
  l42.every(function (c) { return CL.hizali(c); }), metinler(l42));
ok("kelimedenSatirlar: cue başı ilk, sonu son kelimenin ölçülmüş zamanı", l42[0].start === akis[0].start && l42[0].end === akis[7].end && l42[1].start === akis[8].start);
var l20 = CL.kelimedenSatirlar(akis, { maxChars: 20, maxLines: 1 });
ok("kelimedenSatirlar: karakter sınırı aşılmaz", l20.every(function (c) { return c.text.length <= 20; }), metinler(l20));
ok("kelimedenSatirlar: aynı satır sayısıyla dengeli (\"mi?\" gibi tek kelimelik artık yok)",
  metinler(l20).split("|")[0] === "Bu ışık hiç de kötü" && metinler(l20).split("|")[1] === "değil, değil mi?", metinler(l20));
var w3 = CL.kelimedenSatirlar(akis, { maxChars: 42, maxLines: 1, maxWords: 3 });
ok("kelimedenSatirlar: kelime sınırı (3) aşılmaz", w3.every(function (c) { return c.words.length <= 3; }) && hepsi(akis) === w3.map(function (c) { return c.text; }).join(" "), metinler(w3));
ok("kelimedenSatirlar: kelime sınırı 1 → 2'ye çekilir (0 kapalı)", CL.kelimedenSatirlar(akis, { maxWords: 1 }).every(function (c) { return c.words.length <= 2; }) &&
  CL.kelimedenSatirlar(akis, { maxWords: 0 }).length === 2);
var duraklama = zamanla("Merhaba arkadaşlar", 0).concat(zamanla("bugün buradayız", 2.0));
ok("kelimedenSatirlar: araKir'dan (0,6 sn) uzun duraklamada kırılır", metinler(CL.kelimedenSatirlar(duraklama, {})) === "Merhaba arkadaşlar|bugün buradayız");
var tirnak = zamanla("Bana “Geliyorum.” dedi ve gitti");
ok("kelimedenSatirlar: kapanış tırnaklı cümle sonu da kırılır, tırnak kelimede kalır", metinler(CL.kelimedenSatirlar(tirnak, {})) === "Bana “Geliyorum.”|dedi ve gitti", metinler(CL.kelimedenSatirlar(tirnak, {})));
var yavas = zamanla("bir iki üç dört beş altı yedi sekiz", 0, 1.0);
var sureli = CL.kelimedenSatirlar(yavas, { maxSure: 3, araKir: 2 });
ok("kelimedenSatirlar: maxSure aşılmaz", sureli.length > 1 && sureli.every(function (c) { return c.end - c.start <= 3 + 1e-9; }), J(sureli.map(function (c) { return [c.start, c.end]; })));
var iki = CL.kelimedenSatirlar(zamanla("Bu cümle iki satıra sığacak kadar uzun ama üç satır gerektirecek kadar değil işte"), { maxChars: 42, maxLines: 2 });
ok("kelimedenSatirlar: 2 × 42 bütçesi (iki satıra sığan tek cue)", iki.length === 1 && CL.sigarMi(iki[0].text.split(" "), 42, 2), metinler(iki));
ok("kelimedenSatirlar: kelime güveni (p) ortalaması confidence olur", (function () {
  var ws = [{ text: "a", start: 0, end: 0.2, p: 0.5 }, { text: "b", start: 0.3, end: 0.5, p: 0.9 }];
  return Math.abs(CL.kelimedenSatirlar(ws, {})[0].confidence - 0.7) < 1e-9 && CL.kelimedenSatirlar(ws, {})[0].words[1].p === 0.9;
})());
ok("kelimedenSatirlar: boş / bozuk girdi fırlatmaz", J(CL.kelimedenSatirlar(null, {})) === "[]" && CL.kelimedenSatirlar([null, { text: "", start: 0 }, { text: "x", start: "y" }], {}).length === 0);

/* ---------------- 4) kisaBirlestir ---------------- */
function c(s, e, t, ws) { var x = { start: s, end: e, text: t }; if (ws) x.words = ws; return x; }
var parcalar = [c(0, 0.6, "Bugün"), c(0.7, 1.4, "size anlatacağım."), c(1.5, 2.2, "Sonra"), c(2.3, 3, "devam ederiz")];
var bir = CL.kisaBirlestir(parcalar, { maxChars: 42 });
ok("kisaBirlestir: arası ≤ 0,2 sn ve sığan komşular birleşir", metinler(bir) === "Bugün size anlatacağım.|Sonra devam ederiz", metinler(bir));
ok("kisaBirlestir: '.' sonrasında birleştirmez (cümle sonunu aşmaz)", metinler(CL.kisaBirlestir([c(0, 1, "Tamam."), c(1.05, 2, "Sonra")], {})) === "Tamam.|Sonra");
ok("kisaBirlestir: aralık büyükse birleştirmez", CL.kisaBirlestir([c(0, 1, "a"), c(1.5, 2, "b")], {}).length === 2);
ok("kisaBirlestir: birleşik metin sığmıyorsa birleştirmez", CL.kisaBirlestir([c(0, 1, "otuz karakterlik bir satır metni"), c(1.1, 2, "ve devamı burada")], { maxChars: 42 }).length === 2);
ok("kisaBirlestir: maxSure'yi aşmaz", CL.kisaBirlestir([c(0, 4, "a"), c(4.1, 7, "b")], { maxSure: 6 }).length === 2);
ok("kisaBirlestir: kelime sınırını aşmaz", CL.kisaBirlestir([c(0, 1, "bir iki"), c(1.1, 2, "üç dört")], { maxWords: 3 }).length === 2);
var kb = CL.kisaBirlestir([c(0, 1, "bir iki", zamanla("bir iki", 0)), c(1.1, 2, "üç", [{ text: "üç", start: 1.1, end: 1.5 }])], {});
ok("kisaBirlestir: kelimeler birleşir, girdi değişmez", kb.length === 1 && hepsi(kb[0].words) === "bir iki üç" && parcalar[0].text === "Bugün");
ok("kisaBirlestir: bir tarafın kelimesi metinle tutmuyorsa birleşik satır kelimesiz kalır", !CL.kisaBirlestir([c(0, 1, "bir iki", zamanla("bir", 0)), c(1.1, 2, "üç", [{ text: "üç", start: 1.1, end: 1.5 }])], {})[0].words);

/* ---------------- 5) karakterleBol ---------------- */
var uzun = c(10, 16, "Bu ışık hiç de kötü değil, değil mi? Şimdi kamerayı biraz sola çevirelim.");
var b20 = CL.karakterleBol(uzun, 20);
ok("karakterleBol: hiçbir parça bütçeyi aşmaz (eşit kelime bölmesi aşabiliyordu)", b20.every(function (p) { return p.text.length <= 20; }), metinler(b20));
ok("karakterleBol: metin korunur, süre karakter oranıyla, ardışık", b20.map(function (p) { return p.text; }).join(" ") === uzun.text &&
  b20[0].start === 10 && b20[b20.length - 1].end === 16 && b20.every(function (p, i) { return i === 0 || Math.abs(p.start - b20[i - 1].end) < 1e-9; }));
var olcu = c(10, 13.5, "Bu ışık hiç de kötü değil, değil mi?", zamanla("Bu ışık hiç de kötü değil, değil mi?", 10));
var bo = CL.karakterleBol(olcu, 20);
ok("karakterleBol: kelimeler metinle tutuyorsa parça ölçülmüş kelime başında başlar, kelimeler bölünür",
  bo.length === 2 && bo[1].start === olcu.words[5].start && hepsi(bo[0].words) === bo[0].text && hepsi(bo[1].words) === bo[1].text, J(bo.map(function (p) { return [p.text, p.start]; })));
ok("karakterleBol: sığan satıra dokunmaz", CL.karakterleBol(c(0, 1, "kısa"), 42).length === 1);
ok("karakterleBol: enAz (süre) ile en az parça", CL.karakterleBol(c(0, 12, "bir iki üç dört"), 42, { enAz: 3 }).length === 3);
var b2 = CL.karakterleBol(c(0, 10, "Bu çok uzun bir cümle ve iki satıra sığması gereken bir altyazı metni olarak yazıldı bakalım ne olacak"), 42, { maxLines: 2 });
ok("karakterleBol: 2 satır bütçesi — her parça iki satıra sığar", b2.length === 2 && b2.every(function (p) { return CL.sigarMi(p.text.split(" "), 42, 2); }), metinler(b2));
var tekUzun = CL.karakterleBol(c(0, 2, "https://ornek.com/cok-uzun-bir-baglanti-adresi-burada-yazili-duruyor"), 20);
ok("karakterleBol: tek kelime bütçeden uzunsa atılmaz (tek parça)", tekUzun.length === 1 && tekUzun[0].text.indexOf("https://") === 0);

/* ---------------- 6) zamanHijyeni ---------------- */
var zh = CL.zamanHijyeni([c(0, 0.3, "kısa"), c(2, 12, "çok uzun"), c(12.05, 12.5, "yapışık"), c(12.6, 13.0, "son")], { minSure: 0.8, maxSure: 7 });
ok("zamanHijyeni: kısa satır boşluğa uzar (≥ minSure)", Math.abs(zh[0].end - 0.8) < 1e-9, zh[0].end);
ok("zamanHijyeni: uzun satır maxSure'de kırpılır", Math.abs(zh[1].end - 9) < 1e-9, zh[1].end);
ok("zamanHijyeni: hiçbir satır sonrakiyle çakışmaz", zh.every(function (x, i) { return i === zh.length - 1 || x.end <= zh[i + 1].start + 1e-9; }), J(zh.map(function (x) { return [x.start, x.end]; })));
ok("zamanHijyeni: sonraki satıra 0,08 sn boşluk bırakır (kırpma 0,25 sn'den kısa bırakmıyorsa)", Math.abs(zh[2].end - 12.52) < 1e-9, zh[2].end);
var siki = CL.zamanHijyeni([c(5, 5.1, "a"), c(5.15, 6, "b")], {});
ok("zamanHijyeni: sıkışık satırda sonrakinin başında biter (çakışma yok)", siki[0].end <= siki[1].start && siki[0].end > siki[0].start, J(siki));
var zw = CL.zamanHijyeni([c(0, 10, "a b", [{ text: "a", start: 0, end: 1 }, { text: "b", start: 8, end: 9.5 }])], { maxSure: 7 });
ok("zamanHijyeni: kırpılan satırın kelimeleri satıra sıkışır, sayı korunur", zw[0].words.length === 2 && zw[0].words[1].start === 7 && zw[0].words[1].end === 7, J(zw[0].words));
ok("zamanHijyeni: sıralar, girdiyi değiştirmez", (function () {
  var g = [c(3, 4, "b"), c(0, 1, "a")];
  var o = CL.zamanHijyeni(g, {});
  return metinler(o) === "a|b" && g[0].text === "b" && g[0].end === 4;
})());
var rastgeleCue = [];
for (var q = 0; q < 300; q++) { var bs = rastgele() * 100; rastgeleCue.push(c(bs, bs + rastgele() * 9, "x" + q)); }
var rz = CL.zamanHijyeni(rastgeleCue, { minSure: 0.8, maxSure: 6 });
ok("zamanHijyeni: 300 rastgele satırda çakışma yok, hiçbiri maxSure'yi aşmaz, uzama yalnız boş zamana",
  rz.every(function (x, i) { return x.end - x.start <= 6 + 1e-9 && x.end >= x.start && (i === rz.length - 1 || x.end <= rz[i + 1].start + 1e-9); }));

/* ---------------- 7) kelimeleriHizala (LCS) ---------------- */
var eskiW = [{ text: "Bu", start: 1, end: 1.2, p: 0.9 }, { text: "ışık", start: 1.3, end: 1.6, p: 0.8 }, { text: "hiç", start: 1.7, end: 1.9 },
  { text: "de", start: 2.0, end: 2.1 }, { text: "kötü", start: 2.2, end: 2.6 }, { text: "değil.", start: 2.7, end: 3.1 }];
var ayni = CL.kelimeleriHizala(eskiW, "Bu ışık hiç de kötü değil.", 1, 3.2, "tr");
ok("hizala: aynı metin aynı zamanlar (p korunur)", J(ayni) === J(eskiW), J(ayni));
var buyuk = CL.kelimeleriHizala(eskiW, "BU IŞIK HİÇ DE KÖTÜ DEĞİL", 1, 3.2, "tr");
ok("hizala: Türkçe BÜYÜK HARF (I → ı, İ → i) ve noktalamasız metin eşleşir", buyuk.length === 6 && buyuk.every(function (w, i) { return w.start === eskiW[i].start && w.end === eskiW[i].end; }) && buyuk[1].text === "IŞIK", J(buyuk));
var dilsiz = CL.kelimeleriHizala(eskiW, "BU IŞIK HİÇ DE KÖTÜ DEĞİL", 1, 3.2);
ok("hizala: dil bilinmese de (ı/i ayrımı yapılmadan) eşleşir", dilsiz.every(function (w, i) { return w.start === eskiW[i].start; }));
var eklenen = CL.kelimeleriHizala(eskiW, "Bu ışık hiç de çok kötü değil.", 1, 3.2, "tr");
ok("hizala: eklenen kelime komşularının arasına (de 2.1 – kötü 2.2), diğerleri ölçülmüş zamanını korur",
  eklenen.length === 7 && eklenen[4].text === "çok" && eklenen[4].start >= 2.1 - 1e-9 && eklenen[4].end <= 2.2 + 1e-9 &&
  eklenen[5].start === 2.2 && eklenen[0].start === 1 && eklenen[6].start === 2.7, J(eklenen));
var silinen = CL.kelimeleriHizala(eskiW, "Bu ışık kötü değil.", 1, 3.2, "tr");
ok("hizala: silinen kelimeler düşer, kalanlar zamanını korur", J(silinen.map(function (w) { return [w.text, w.start]; })) === J([["Bu", 1], ["ışık", 1.3], ["kötü", 2.2], ["değil.", 2.7]]));
var degisen = CL.kelimeleriHizala(eskiW, "Bu ışık hiç de iyi değil.", 1, 3.2, "tr");
ok("hizala: değiştirilen kelime eski kelimenin aralığını alır (kötü → iyi 2.2–2.6)", degisen[4].text === "iyi" && degisen[4].start === 2.2 && degisen[4].end === 2.6, J(degisen[4]));
var vurgu = CL.kelimeleriHizala(eskiW, "Bu *ışık* hiç de\nkötü değil.", 1, 3.2, "tr");
ok("hizala: *vurgu* ve satır kırılımı zamanları değiştirmez, kelime metni yıldızsız", vurgu.length === 6 && vurgu[1].text === "ışık" && vurgu.every(function (w, i) { return w.start === eskiW[i].start; }));
ok("hizala: sonuç yeni metnin kelimeleriyle bire bir (stil motoru sayımıyla)", CL.hizali({ text: "Bu *ışık* hiç de\nkötü değil.", words: vurgu }) && WW.belirtecSayisi("Bu *ışık* hiç de\nkötü değil.") === vurgu.length);
ok("hizala: idempotent (aynı metinle yeniden hizalama sonucu değiştirmez)", [eklenen, silinen, degisen, buyuk].every(function (h, i) {
  var t = ["Bu ışık hiç de çok kötü değil.", "Bu ışık kötü değil.", "Bu ışık hiç de iyi değil.", "BU IŞIK HİÇ DE KÖTÜ DEĞİL"][i];
  return J(CL.kelimeleriHizala(h, t, 1, 3.2, "tr")) === J(h);
}));
var bastaEk = CL.kelimeleriHizala(eskiW, "Evet bu ışık hiç de kötü değil.", 0.5, 3.2, "tr");
ok("hizala: başa eklenen kelime satır başı ile ilk eşleşme arasına", bastaEk[0].text === "Evet" && bastaEk[0].start >= 0.5 && bastaEk[0].end <= 1 + 1e-9 && bastaEk[1].start === 1, J(bastaEk[0]));
var kelimesiz = CL.kelimeleriHizala([], "bir iki üçüncü", 0, 3);
ok("hizala: eski kelime yoksa süre karakter ağırlığıyla paylaşılır", kelimesiz.length === 3 && kelimesiz[0].start === 0 && kelimesiz[2].end === 3 &&
  kelimesiz[2].end - kelimesiz[2].start > kelimesiz[0].end - kelimesiz[0].start, J(kelimesiz));
ok("hizala: boş metin []", J(CL.kelimeleriHizala(eskiW, "  ", 0, 1)) === "[]");
ok("hizala: sıralı ve satır içinde", [eklenen, silinen, degisen, bastaEk].every(function (h) {
  return h.every(function (w, i) { return w.start <= w.end && (i === 0 || w.start >= h[i - 1].start - 1e-9); });
}));

/* ---------------- 8) ölçek, kırılım koruma, uzunluk ayarı ---------------- */
var olc = CL.kelimeleriOlcekle(eskiW, 1, 3.2, 2, 6.4);
ok("kelimeleriOlcekle: doğrusal (1–3.2 → 2–6.4, kat 2)", olc[0].start === 2 && Math.abs(olc[1].start - 2.6) < 1e-9 && olc[5].end <= 6.4 && eskiW[0].start === 1, J(olc.slice(0, 2)));
ok("kelimeleriOlcekle: eski aralık sıfırsa yalnız kaydırır, yeni aralığa sıkıştırır", (function () {
  var o = CL.kelimeleriOlcekle([{ text: "a", start: 1, end: 1 }], 1, 1, 3, 4);
  return o[0].start === 3 && o[0].end === 3;
})());
ok("satirKiriklariniKoru: kelime sayısı aynıysa kırılım aynı kelimeye", CL.satirKiriklariniKoru("Bu ışık hiç\nde kötü", "Bu ışık hiç de iyi") === "Bu ışık hiç\nde iyi");
ok("satirKiriklariniKoru: sayı değiştiyse ya da yeni metinde kırılım varsa dokunmaz", CL.satirKiriklariniKoru("a b\nc", "a b c d") === "a b c d" && CL.satirKiriklariniKoru("a b\nc", "a\nb c") === "a\nb c");
ok("uzunlukAyari: l42 / c42x2 / c60 / w3 / k1", J(CL.uzunlukAyari("l42")) === J({ tur: "l", maxChars: 42, maxLines: 1 }) &&
  J(CL.uzunlukAyari("c42x2")) === J({ tur: "c", maxChars: 42, maxLines: 2 }) && CL.uzunlukAyari("c60").maxChars === 60 &&
  CL.uzunlukAyari("w3").n === 3 && CL.uzunlukAyari("k1").tur === "k" && CL.uzunlukAyari("").maxChars === 42);

/* ---------------- 9) segmentleriKur ile gerçek fikstür (yerel -ojf) ---------------- */
var olcum = WW.segmentleriCoz(fs.readFileSync(path.join(__dirname, "fixtures", "whisper-ojf-tr.json")), null, { vadAcik: false });
var esli = WW.zamanEsle(olcum, 10, 1).map(function (s) { return { start: s.start, end: s.end, text: s.text, confidence: s.confidence, words: s.words }; });
var gercek = CT.segmentleriKur(esli, "c42x2", { maxWords: 4 });
ok("c42x2 + kelime sınırı 4: her satır ≤ 4 kelime, 2 × 42'ye sığar, kelimeler metinle tutar",
  gercek.segments.every(function (x) { return x.words.length <= 4 && CL.hizali(x) && satirlar(x.text).every(function (l) { return l.length <= 42; }); }), metinler(gercek.segments));

/* ---------------- 10) kaynak: ES5, Raunen atfı, NOTICE ---------------- */
var kaynak = fs.readFileSync(path.join(KOK, "js", "caption-layout.js"), "utf8").replace(/\r\n/g, "\n");
var ayikla = require("./_ayikla.js");
ok("Raunen dosya başlığı ve işaretleri (wrapText, shapeSegments geçişleri)",
  kaynak.indexOf("Portions adapted from Raunen (https://github.com/Zeyphers/raunen), MIT, Copyright (c) 2026 Jacob Szczepaniak. See THIRD_PARTY_NOTICES.md.") !== -1 &&
  /\/\/ Raunen: wrapText\n  function dengeliSar/.test(kaynak) && /\/\/ Raunen: shapeSegments \(merge pass\)\n  function kisaBirlestir/.test(kaynak) &&
  /\/\/ Raunen: shapeSegments \(split pass\)\n  function karakterleBol/.test(kaynak) && /\/\/ Raunen: shapeSegments \(duration pass\)\n  function zamanHijyeni/.test(kaynak));
ok("ES5: let/const/ok işlevi/for-of/şablon dizgesi/padStart yok", !/\b(let|const)\s|=>|\bfor\s*\([^)]*\bof\b|padStart|Object\.values|`/.test(ayikla(kaynak)));
ok("DOM ve dosya sistemi yok (saf modül)", !/document\.|window\.[a-z]|require\("fs"\)|K\.fs/.test(ayikla(kaynak).replace(/typeof window !== "undefined" \? window/, "")));
var notice = fs.readFileSync(path.join(KOK, "THIRD_PARTY_NOTICES.md"), "utf8");
ok("THIRD_PARTY_NOTICES: Raunen girdisi js/caption-layout.js'i (wrapText, shapeSegments) listeler",
  /js\/caption-layout\.js/.test(notice) && /wrapText/.test(notice) && /shapeSegments/.test(notice));

/* ---------------- 11) panel bağlantısı ---------------- */
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
function sira(ad) { return html.indexOf('src="js/' + ad + '"'); }
ok("index.html: caption-layout.js caption-quality / caption-text / style-engine / captions'tan önce", sira("caption-layout.js") > 0 &&
  sira("caption-layout.js") < sira("caption-quality.js") && sira("caption-layout.js") < sira("caption-text.js") &&
  sira("caption-layout.js") < sira("style-engine.js") && sira("caption-layout.js") < sira("captions.js"));
ok("Satır uzunluğu: 32 / 42 karakter kelime zamanından (l32 / l42, varsayılan l42), '2 satır × 42 (YouTube/TV)', 60 karakter",
  /<option value="l32">32 karakter<\/option>/.test(html) && /<option value="l42" selected>42 karakter<\/option>/.test(html) &&
  /<option value="c42x2">2 satır × 42 \(YouTube\/TV\)<\/option>/.test(html) && /<option value="c60">60 karakter<\/option>/.test(html) && !/value="c42"/.test(html));
ok("Kelime sınırı: sayı alanı 0–12, varsayılan 0 (kapalı)", /<input id="cap-kelime-siniri" type="number" min="0" max="12" step="1" value="0"/.test(html) && />Kelime sınırı</.test(html));
var grp = html.slice(html.indexOf('id="grp-altyazi"'), html.indexOf('id="grp-marka-kiti"'));
ok("Ayarlar › Altyazı: en kısa / en uzun süre (0,8 / 6 sn) ve 'Kısa parçaları birleştir' (varsayılan açık)",
  /<input id="set-min-sure" type="number" min="0.3" max="3" step="0.1" value="0.8">/.test(grp) && /<input id="set-max-sure" type="number" min="2" max="15" step="0.5" value="6">/.test(grp) &&
  /<input id="set-kisa-birlestir" type="checkbox" checked>/.test(grp) && />Kısa parçaları birleştir</.test(grp));
ok("Editör kısayolları: Shift+Enter alt satır", /<kbd>Shift\+Enter<\/kbd> alt satır/.test(html));
var app = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8").replace(/\r\n/g, "\n");
ok("app.js: süre ayarları ve birleştirme kaydedilir (en uzun ≥ en kısa + 0,5)", /st\.altyaziMinSure = a;/.test(app) && /st\.altyaziMaxSure = b;/.test(app) &&
  /if \(b < a \+ 0\.5\) b = Math\.min\(15, a \+ 0\.5\);/.test(app) && /K\.settings\(\)\.kisaBirlestir = this\.checked;/.test(app) && /altyaziSureAyarlari\(s\);/.test(app));
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
function govde(imza) { var i = cap.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return cap.slice(i, cap.indexOf("\n  }\n", i) + 4); }
ok("captions.js: satır kurma seçenekleri (etiket, kelime sınırı, birleştirme, süreler) go() ve rehber örneğinde",
  (cap.match(/CT\.segmentleriKur\([a-z]+, lenVal, kurSecenekleri\(\)\)/g) || []).length === 2 &&
  /etiketKoru: sesEtiketKoru\(\),\s*maxWords: kelimeSiniri\(\),\s*birlestir: s\.kisaBirlestir !== false,\s*minSure: s\.altyaziMinSure,\s*maxSure: s\.altyaziMaxSure/.test(govde("function kurSecenekleri(")));
ok("captions.js: metin düzenlemesi kelimeleri LCS ile hizalar (odaktaki kelimelerden, kayma birikmez)",
  /var hiza = CL\.kelimeleriHizala\(odakKelimeleri, inp\.value, segments\[i\]\.start, segments\[i\]\.end, styleLocale\(\) \|\| algilananDil\);/.test(cap));
ok("captions.js: AI kontrolü, sözlük ve bul & değiştir kelimeleri yeniden hizalar (düşürmez)",
  /function kelimeleriMetinleDogrula\(s, eskiMetin\) \{ kelimeleriYenidenHizala\(s, eskiMetin\); \}/.test(cap) &&
  /function kelimeSayisiniKoru\(s, eskiMetin\) \{ kelimeleriYenidenHizala\(s, eskiMetin\); \}/.test(cap) && /return CL\.satirKiriklariniKoru\(originals\[i2\], geri\);/.test(cap));
ok("captions.js: Shift+Enter satır içi kırılım, Enter hâlâ böler", /if \(e\.shiftKey && !e\.altKey && !e\.ctrlKey && !e\.metaKey\) \{ satirKir\(inp\); return; \}/.test(cap) && /splitAt\(i, inp\.selectionStart\);/.test(cap));
ok("captions.js: menü eşlemesi (c32/c42 → l32/l42) tercih, şablon, stil kodu ve stil yedeğinde; paylaşılan kod eski sürümlerle uyumlu",
  /el\("cap-maxlen"\)\.value = uzunlukSecimi\(p\.maxlen\)/.test(cap) && /el\("cap-maxlen"\)\.value = uzunlukSecimi\(r\.text\.maxlen\)/.test(cap) &&
  /id === "cap-maxlen" \? uzunlukSecimi\(y\.alan\[id\]\)/.test(cap) && /el\("cap-maxlen"\)\.value\.replace\(\/\^l\(\\d\+\)\$\/, "c\$1"\)/.test(cap));
ok("captions.js: kalite denetimi satır modunun satır sayısını bilir (c42x2 → 2)", /maxLines: mc && mc\[2\] \? Number\(mc\[2\]\) : 1,/.test(cap));
ok("captions.js: dışa aktarma — SRT cue içi CRLF, boş satır yok, çift dilde her dil tek satır, TXT tek satır",
  /out\.push\(c\.text\.split\("\\n"\)\.join\("\\r\\n"\)\);/.test(govde("function buildSrt(")) && /satirlariTopla\(styleText/.test(govde("function cueler(")) &&
  /CL\.duzMetin\(styleText\(CT\.stripEmphasis\(s\.text\)\)\)/.test(cap));
ok("captions.js: ASS karaoke satır modunda gerçek kelime zamanlarıyla, kaydırılmış katmanda kelimeler de kayar",
  /cs\.forEach\(function \(c\) \{ olay\(c\.start, c\.end, assSatirKaraoke\(c, skTag, skDil\)\); \}\);/.test(cap) &&
  /if \(s\.words\) s\.words = WW\.kelimeleriKaydir\(s\.words, -offset\);/.test(govde("function buildAssKaydirilmis(")));
ok("captions.js: panel açılışında Premiere çağrısı yok (kelime sınırı ve süre ayarları yalnız DOM)", !/K\.call\(/.test(govde("function kelimeSiniriDurumu(")) && !/K\.call\(/.test(govde("function kurSecenekleri(")));

/* ---- editör işlevleri gerçek kaynaktan, sahte ortamla: bölme, Shift+Enter, zaman düzenleme ---- */
var toastlar = [];
var ED = new Function("WW", "CL", "toastlar", [
  "var segments = [];",
  "var BOSLUKSUZ = /[\\u3040-\\u30FF]/;",
  "var KApp = { toast: function (m) { toastlar.push(m); } };",
  "function snapshot() {} function render() {} function saveDraftSoon() {} function sortSegments() { segments.sort(function (a, b) { return a.start - b.start; }); }",
  "function tc(sec) { var ms = Math.round(sec * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000), x = ms % 1000;",
  "  function p(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; } return p(h, 2) + ':' + p(m, 2) + ':' + p(s, 2) + '.' + p(x, 3); }",
  "function tcParse(t) { var m = /(?:(\\d+):)?(\\d+):(\\d+)[.,](\\d+)/.exec(t); return m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + parseFloat('0.' + m[4]) : 0; }",
  "var acik = null; var document = { createElement: function () { acik = { value: '', focus: function () {}, select: function () {} }; return acik; } };",
  govde("function satirKir(inp)"), govde("function splitAt(i, pos)"), govde("function editTime(i, btn)"),
  "return { set: function (x) { segments = x; }, get: function () { return segments; }, satirKir: satirKir, splitAt: splitAt, editTime: editTime, acik: function () { return acik; } };"
].join("\n"))(WW, CL, toastlar);

// Shift+Enter: kırılım imleçte, kenar boşlukları atılır, oninput çağrılır
var giris = { value: "Bu ışık hiç de kötü", selectionStart: 11, selectionEnd: 11, setSelectionRange: function (a) { this.caret = a; }, oninput: function () { this.cagrildi = true; } };
ED.satirKir(giris);
ok("satirKir (Shift+Enter): 'Bu ışık hiç\\nde kötü', imleç kırılımdan sonra, hizalama tetiklenir", giris.value === "Bu ışık hiç\nde kötü" && giris.caret === 12 && giris.cagrildi === true, J(giris.value));
var kenar = { value: "tek", selectionStart: 3, selectionEnd: 3, setSelectionRange: function () {}, oninput: function () { this.cagrildi = true; } };
ED.satirKir(kenar);
ok("satirKir: metnin sonunda kırılım eklenmez", kenar.value === "tek" && !kenar.cagrildi);

// Bölme: imleçteki kelimede, kırılımlı metinde de boşluk sınırı bulunur; kelimeler o belirteçte ayrılır
var sw = zamanla("Bu ışık hiç de kötü", 10);
ED.set([{ start: 10, end: 11.8, text: "Bu ışık hiç\nde kötü", words: sw }]);
ED.splitAt(0, "Bu ışık hi".length);
var bolunmus = ED.get();
ok("splitAt: en yakın boşluk satır kırılımıysa orada böler, kelimeler o belirteçte ayrılır (ölçülmüş an)",
  bolunmus.length === 2 && bolunmus[0].text === "Bu ışık hiç" && bolunmus[1].text === "de kötü" && bolunmus[1].start === sw[3].start &&
  bolunmus[0].words.length === 3 && bolunmus[1].words.length === 2, J(bolunmus.map(function (x) { return [x.text, x.start]; })));
ED.set([{ start: 10, end: 11.8, text: "Bu ışık hiç\nde kötü", words: sw }]);
ED.splitAt(0, "Bu ı".length);
ok("splitAt: kırılımlı metinde soldaki boşluk daha yakınsa orada; ikinci parça kırılımını korur",
  ED.get()[0].text === "Bu" && ED.get()[1].text === "ışık hiç\nde kötü" && ED.get()[1].words.length === 4, J(ED.get().map(function (x) { return x.text; })));

// Zaman düzenleme: tek zaman taşır (kelimeler kayar), iki zaman sınırı değiştirir (kelimeler ölçeklenir)
function zamanDuzenle(deger) {
  var btn = { replaceWith: function () {} };
  ED.editTime(0, btn);
  var inp = ED.acik();
  inp.value = deger;
  inp.onblur();
}
ED.set([{ start: 10, end: 12, text: "bir iki", words: [{ text: "bir", start: 10, end: 10.8 }, { text: "iki", start: 11, end: 12 }] }]);
var onDeger = (function () { ED.editTime(0, { replaceWith: function () {} }); var v = ED.acik().value; return v; })();
ok("editTime: alan 'başlangıç – bitiş' gösterir", onDeger === "00:00:10.000 – 00:00:12.000", onDeger);
zamanDuzenle("00:00:20.000");
var tasinan = ED.get()[0];
ok("editTime: tek zaman satırı taşır, süre ve kelimeler aynı miktarda kayar", tasinan.start === 20 && tasinan.end === 22 && tasinan.words[0].start === 20 && tasinan.words[1].end === 22, J(tasinan));
zamanDuzenle("00:00:20.000 – 00:00:24.000");
var olcekli = ED.get()[0];
ok("editTime: başlangıç – bitiş satırı yeniden boyutlar, kelimeler doğrusal ölçeklenir", olcekli.start === 20 && olcekli.end === 24 &&
  olcekli.words[1].start === 22 && olcekli.words[1].end === 24 && olcekli.words[0].end === 21.6, J(olcekli.words));
toastlar.length = 0;
zamanDuzenle("00:00:25.000 – 00:00:24.000");
ok("editTime: bitiş başlangıçtan önceyse uyarır, satıra dokunmaz", ED.get()[0].start === 20 && toastlar.length === 1 && /dd:ss\.mmm – dd:ss\.mmm/.test(toastlar[0]), toastlar[0]);

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
