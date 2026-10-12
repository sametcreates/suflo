// Suflo testi: js/caption-text.js saf altyazi metin islevleri
var path = require("path");
var T = require(path.join(__dirname, "..", "js", "caption-text.js"));

var gecen = 0, toplam = 0;
function chk(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : ""));
}
function seg(s, e, t) { return { start: s, end: e, text: t }; }

/* cleanSegments: halusinasyon + takilma */
var c = T.cleanSegments([
  seg(0, 1, "Merhaba"), seg(1, 2, "..."), seg(2, 3, "Abone olmayı unutmayın"),
  seg(3, 4, "tamam"), seg(4, 5, "Tamam."), seg(5, 6, "tamam"), seg(6, 7, "son")
]);
chk("cleanSegments: noktalama ve kalip atildi, 3. tekrar atildi",
  c.map(function (s) { return s.text; }).join("|") === "Merhaba|tamam|Tamam.|son",
  c.map(function (s) { return s.text; }).join("|"));

/* sondaTakilma: whisper sona kadar ayni satiri tekrarlarsa */
var tk = [seg(0, 1, "Kozmelan."), seg(1, 2, "Q-switch uygulaması."), seg(2, 3, "Q-switch uygulaması"),
  seg(3, 4, "q-switch uygulaması."), seg(4, 5, ""), seg(5, 6, "Q-switch uygulaması.")];
chk("sondaTakilma: sona kadar tekrar -> baslangic indeksi", T.sondaTakilma(tk, 3) === 1, T.sondaTakilma(tk, 3));
var ortada = [seg(0, 1, "Akne protokolü."), seg(1, 2, "Akne protokolü."), seg(2, 3, "Akne protokolü."), seg(3, 4, "Leke.")];
chk("sondaTakilma: ortadaki gercek tekrar sayilmaz", T.sondaTakilma(ortada, 3) === -1, T.sondaTakilma(ortada, 3));
chk("sondaTakilma: 2 tekrar yetmez", T.sondaTakilma([seg(0, 1, "a"), seg(1, 2, "b"), seg(2, 3, "b")], 3) === -1);
chk("sondaTakilma: kelime modunda esik", T.sondaTakilma([seg(0, 1, "çok"), seg(1, 2, "çok"), seg(2, 3, "çok")], 6) === -1);
chk("sondaTakilma: bos liste", T.sondaTakilma([], 3) === -1);
// Premiere'de gorulen gercek desen: 271 tekrar + sonda "Altyazi M.K." halusinasyonu
var gercek = [seg(0, 1, "Kozmelan."), seg(1, 2, "Q-switch.")];
for (var gi = 0; gi < 20; gi++) gercek.push(seg(2 + gi, 3 + gi, "Q-switch uygulaması."));
gercek.push(seg(30, 31, "Altyazı M.K."));
chk("sondaTakilma: sondaki halusinasyon satiri atlanir", T.sondaTakilma(gercek, 3) === 2, T.sondaTakilma(gercek, 3));
var uzunOrta = [seg(0, 1, "a")];
for (var ui = 0; ui < 9; ui++) uzunOrta.push(seg(1 + ui, 2 + ui, "aynı satır"));
uzunOrta.push(seg(20, 21, "sonra gelen konuşma"));
chk("sondaTakilma: ortada 8+ ayni satir da takilma", T.sondaTakilma(uzunOrta, 3) === 1, T.sondaTakilma(uzunOrta, 3));

/* katmanSuresi: kuyruk sekansi uzatmaz */
chk("katmanSuresi: uzun sekansta 2 sn kuyruk", T.katmanSuresi(100.3, 454) === 103);
chk("katmanSuresi: Shorts'ta sekans sonunda biter", T.katmanSuresi(38.0, 38.02) === 38.02, T.katmanSuresi(38.0, 38.02));
chk("katmanSuresi: 25 fps'te kare izgarasina asagi (36.65 -> 36.64)", Math.abs(T.katmanSuresi(36.63, 36.65, 25) - 36.64) < 1e-9,
  T.katmanSuresi(36.63, 36.65, 25));
chk("katmanSuresi: kalan bilinmiyorsa eski davranis", T.katmanSuresi(38.0, 0) === 40);
chk("katmanSuresi: altyazi sekansa sigmiyorsa kesilmez", T.katmanSuresi(50, 30) === 52);
/* tamSekans (Marka Kiti logosu): katman sekansin kalanini kaplar, kare izgarasinda, asla uzun degil */
chk("katmanSuresi tamSekans: uzun sekansta kalanin tamami", T.katmanSuresi(10, 454, 25, true) === 454, T.katmanSuresi(10, 454, 25, true));
var tsFps = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60], tsKotu = [];
[12.345, 38.02, 61.7071, 100.01, 3599.99].forEach(function (kalan) {
  tsFps.forEach(function (f) {
    var s = T.katmanSuresi(5, kalan, f, true), kare = s * f;
    if (!(s <= kalan + 1e-9 && Math.abs(kare - Math.round(kare)) < 1e-6 && kalan - s < 1 / f)) tsKotu.push(kalan + "@" + f + "=" + s);
  });
});
chk("katmanSuresi tamSekans: kare izgarasinda, sekanstan uzun degil, en fazla bir kare kisa", tsKotu.length === 0, tsKotu.slice(0, 3).join(" "));
chk("katmanSuresi tamSekans: altyazi sekanstan uzunsa yine sekans kadar", T.katmanSuresi(50, 30, 25, true) === 30);
chk("katmanSuresi tamSekans: kalan bilinmiyorsa eski davranis", T.katmanSuresi(38.0, 0, 25, true) === 40);
chk("katmanSuresi tamSekans: fps yoksa kalanin kendisi", T.katmanSuresi(5, 12.3, 0, true) === 12.3);
/* logoKatmanKalan: logolu katman secilen kapsamin sonuna kadar (sekans sonuna degil) */
var lkSpec = { end: 1200, inPoint: 600, outPoint: 630 };
chk("logoKatmanKalan: tum sekans → sekans sonu", T.logoKatmanKalan("entire", lkSpec, 0, 20) === 1200);
chk("logoKatmanKalan: In/Out → Out noktasi (katman In'den baslar)", T.logoKatmanKalan("inout", lkSpec, 600, 25) === 30, T.logoKatmanKalan("inout", lkSpec, 600, 25));
chk("logoKatmanKalan: In/Out, Out yok ya da In'den once → sekans sonu", T.logoKatmanKalan("inout", { end: 100, inPoint: 10, outPoint: 0 }, 10, 5) === 90 &&
  T.logoKatmanKalan("inout", { end: 100, inPoint: 10, outPoint: 5 }, 10, 5) === 90);
chk("logoKatmanKalan: Out sekans sonundan sonra → sekans sonu", T.logoKatmanKalan("inout", { end: 100, inPoint: 10, outPoint: 150 }, 10, 5) === 90);
chk("logoKatmanKalan: klip → 0 (altyazilar boyunca, tam sekans yok)", T.logoKatmanKalan("clip", lkSpec, 0, 20) === 0);
chk("logoKatmanKalan: altyazi siniri asiyorsa 0 (logosuz hesap)", T.logoKatmanKalan("inout", lkSpec, 600, 45) === 0);
chk("logoKatmanKalan: 20 dk sekansta 30 sn In/Out, katman ~30 sn", T.katmanSuresi(25, T.logoKatmanKalan("inout", lkSpec, 600, 25), 25, true) === 30);

/* karaoke */
var w = [seg(0, 0.5, "bir"), seg(0.4, 0.9, "iki"), seg(3, 3.01, "üç")];
var kw = T.karaokeWords(w);
chk("karaokeWords: cakisma kirpildi", kw[0].end === 0.4, kw[0].end);
chk("karaokeWords: cok kisa kelime en az 0.12 sn", Math.abs(kw[2].end - 3.12) < 1e-9, kw[2].end);
var kc = T.karaokeCumulative(w, 4);
chk("karaokeCumulative: satir birikir", kc[1].text === "bir iki", kc[1].text);
chk("karaokeCumulative: uzun boslukta sifirlanir", kc[2].text === "üç", kc[2].text);

/* splitWords / splitLong */
var sw = T.splitWords([seg(0, 6, "a b c d e f")], 2);
chk("splitWords: 3 parca", sw.length === 3 && sw[1].text === "c d" && sw[1].start === 2, JSON.stringify(sw[1]));
var sl = T.splitLong([seg(0, 10, "kelime ".repeat(20).trim())], 42, 4.5);
chk("splitLong: uzun satir bolundu, metin korundu",
  sl.length > 1 && sl.map(function (s) { return s.text; }).join(" ") === "kelime ".repeat(20).trim(), sl.length);
chk("splitLong: kisa satira dokunmaz", T.splitLong([seg(0, 1, "kısa")], 42, 4.5).length === 1);

/* trimOverlongCues */
var tr = T.trimOverlongCues([seg(0, 17, "Kısa cümle."), seg(17.2, 18, "x")]);
chk("trimOverlongCues: 17 sn'lik kisa cumle kirpildi", tr[0].end < 3, tr[0].end);

/* sozluk */
var g = T.parseGlossary("suflo => Suflo\nbozuk satir\n premier =>  Premiere ");
chk("parseGlossary: 2 kural", g.length === 2 && g[1].from === "premier" && g[1].to === "Premiere", JSON.stringify(g));
chk("trReplace: kelime siniri", T.trReplace("premiere premier", "premier", "Premiere") === "premiere Premiere");
chk("trReplace: Turkce buyuk I", T.trReplace("İSTANBUL güzel", "istanbul", "İstanbul") === "İstanbul güzel");
chk("trReplace: Turkce harf siniri (ş harf sayilir)", T.trReplace("aşk ask", "ask", "X") === "aşk X");

/* ---------------- Ölçülmüş kelime zamanları (yerel -ojf, js/whisper-words.js) ---------------- */
var fs = require("fs");
var WW = require(path.join(__dirname, "..", "js", "whisper-words.js"));
var olcum = WW.segmentleriCoz(fs.readFileSync(path.join(__dirname, "fixtures", "whisper-ojf-tr.json")), null, { vadAcik: false });
// go() gibi: klip sekansta 10. saniyede, hız 1
var esli = WW.zamanEsle(olcum, 10, 1).map(function (s) { return { start: s.start, end: s.end, text: s.text, confidence: s.confidence, words: s.words }; });
var duzK = WW.duzlestir(esli);
function sirali(liste) { return liste.every(function (x, i) { return i === 0 || x.start >= liste[i - 1].start; }); }
function icinde(cue) { return (cue.words || []).every(function (w, i) { return w.start >= cue.start - 1e-9 && w.end <= cue.end + 1e-9 && (i === 0 || w.start >= cue.words[i - 1].start); }); }

var k1 = T.segmentleriKur(esli, "k1");
chk("k1: satırların ölçülmüş kelimelerinden (tek transkripsiyon), 18 kelime cue'su", k1.mode === "k1" && k1.segments.length === 18 &&
  k1.segments[1].text === "ışık" && Math.abs(k1.segments[1].start - 10.22) < 1e-9, k1.segments.slice(0, 3).map(function (x) { return x.text + "@" + x.start; }).join(" "));
chk("k1: başlangıçlar ölçülmüş zamanlar, sıralı, çakışmasız", sirali(k1.segments) && k1.segments.every(function (x, i) {
  return Math.abs(x.start - duzK[i].start) < 1e-9 && (i === k1.segments.length - 1 || x.end <= k1.segments[i + 1].start + 1e-9);
}));
chk("k1: kelime güveni (p) cue'ya geçer", k1.segments[1].confidence === 0.873, k1.segments[1].confidence);
var kc = T.segmentleriKur(esli, "kc");
chk("kc: birikimli satır ölçülmüş kelimelerden, uzun duraklamada sıfırlanır", kc.mode === "kc" && kc.segments.length === 18 &&
  kc.segments[3].text === "Bu ışık hiç de" && kc.segments[4].text === "kötü" && kc.segments[13].text === "Güzel." && sirali(kc.segments),
  kc.segments.slice(0, 6).map(function (x) { return x.text; }).join(" | "));
var w3 = T.segmentleriKur(esli, "w3");
chk("w3: kelimeGrupla — segment sınırını aşar, cümle sonunda kırılır", w3.mode === "w" &&
  w3.segments.map(function (x) { return x.text; }).join("|") === "Bu ışık hiç|de kötü değil,|değil mi?|Şimdi kamerayı biraz|sola çevirelim.|Güzel.|Peki, sonra tekrar|deneyelim!",
  w3.segments.map(function (x) { return x.text; }).join("|"));
chk("w3: her grup kelimelerini taşır; başlangıçlar sıralı ve cue içinde", w3.segments.every(function (x) { return x.words && x.words.length >= 1 && icinde(x); }) && sirali(w3.segments));
chk("w3: grup başı = ilk ölçülmüş kelime (orantılı bölme değil)", Math.abs(w3.segments[1].start - 10.92) < 1e-9 && Math.abs(w3.segments[2].start - 12.1) < 1e-9, w3.segments[2].start);
var w3eski = T.segmentleriKur(esli.map(function (s) { return { start: s.start, end: s.end, text: s.text }; }), "w3");
chk("w3 kelimesiz: bugünkü orantılı bölme (splitWords) aynen", JSON.stringify(w3eski.segments) ===
  JSON.stringify(T.splitWords(T.trimOverlongCues(T.cleanSegments(esli.map(function (s) { return { start: s.start, end: s.end, text: s.text }; }))), 3)));
var jp = [{ start: 0, end: 2, text: "今日はいい天気です。", words: [{ text: "今日はいい天気です。", start: 0, end: 2 }] },
  { start: 2, end: 4, text: "散歩に行きましょう。", words: [{ text: "散歩に行きましょう。", start: 2, end: 4 }] }];
chk("w3 boşluksuz yazı (Japonca): satırlar birleşmez, bugünkü bölme", T.segmentleriKur(jp, "w3").segments.length === 2);
var c20 = T.segmentleriKur(esli, "c20");
// 3.2 adım 4: eşit kelime bölmesi ("Bu ışık hiç de" | "kötü değil, değil mi?" = 21 karakter) 20'yi aşıyordu;
// karakterle bölme (caption-layout.js karakterleBol) bütçeyi hiç aşmaz ve parçaları dengeler
chk("c20: uzun satır ölçülmüş kelime sınırında, bütçeyi aşmadan bölünür, parçalar kelimelerini taşır",
  c20.mode === "plain" && c20.segments.length === 6 && c20.segments[0].text === "Bu ışık hiç de kötü" && Math.abs(c20.segments[1].start - 11.44) < 1e-9 &&
  c20.segments.every(function (x) { return x.words && icinde(x) && x.text.length <= 20; }) && sirali(c20.segments),
  c20.segments.map(function (x) { return x.text + "@" + x.start.toFixed(2); }).join(" | "));
chk("c42: kısa satırlar kelimeleriyle aynen kalır", T.segmentleriKur(esli, "c42").segments[0].words.length === 8);

/* ---- 3.2 adım 4: okunabilir satır modları (l32 / l42 / c42x2, js/caption-layout.js) ---- */
function metinler2(r) { return r.segments.map(function (x) { return x.text; }).join("|"); }
var l42 = T.segmentleriKur(esli, "l42");
chk("l42: satırlar ölçülmüş kelimelerden; cümle sonunda kırılır (\"Güzel.\" ayrı), satır sonu son kelimenin sonu",
  l42.mode === "plain" && metinler2(l42) === "Bu ışık hiç de kötü değil, değil mi?|Şimdi kamerayı biraz sola çevirelim.|Güzel.|Peki, sonra tekrar deneyelim!" &&
  Math.abs(l42.segments[0].end - 12.86) < 1e-9 && l42.segments.every(function (x) { return x.words && icinde(x); }), metinler2(l42));
chk("l42: kısa \"Güzel.\" en kısa süreye (0,8 sn) sonraki satıra çarpmadan uzar", l42.segments[2].end > l42.segments[2].start + 0.4 &&
  l42.segments[2].end <= l42.segments[3].start - 0.08 + 1e-9, l42.segments[2].start + "–" + l42.segments[2].end);
var l32 = T.segmentleriKur(esli, "l32");
chk("l32: 32 karakter aşılmaz, aynı satır sayısıyla dengeli (\"mi?\" tek başına kalmaz)",
  metinler2(l32) === "Bu ışık hiç de kötü|değil, değil mi?|Şimdi kamerayı biraz|sola çevirelim.|Güzel.|Peki, sonra tekrar deneyelim!" &&
  l32.segments.every(function (x) { return x.text.length <= 32; }), metinler2(l32));
chk("l32/l42: satırlar sıralı, çakışmasız", [l32, l42].every(function (r) { return r.segments.every(function (x, i) { return i === 0 || x.start >= r.segments[i - 1].end - 1e-9; }); }));
var x2 = T.segmentleriKur(esli, "c42x2");
chk("c42x2: kısa satırlar tek satır kalır (kırılım yalnız 42'yi aşınca)", metinler2(x2) === metinler2(l42), metinler2(x2));
var uzunKel = "Bugün size kamerayla ilgili birkaç şey anlatacağım ve sonra da ışığı nasıl kuracağımızı göstereceğim.".split(" ").map(function (t, i) {
  return { text: t, start: +(i * 0.3).toFixed(2), end: +(i * 0.3 + 0.25).toFixed(2) };
});
var uzunSeg = [{ start: 0, end: 5, text: uzunKel.map(function (w) { return w.text; }).join(" "), words: uzunKel }];
var x2u = T.segmentleriKur(uzunSeg, "c42x2");
chk("c42x2: 42'yi aşan satır iki dengeli satıra kırılır ('\\n'), her satır ≤ 42, kelimeler tutar",
  x2u.segments.length >= 1 && x2u.segments.every(function (x) { var sat = x.text.split("\n"); return sat.length <= 2 && sat.every(function (l) { return l.length <= 42; }) && x.words.length === x.text.split(/\s+/).length; }) &&
  x2u.segments.some(function (x) { return x.text.indexOf("\n") !== -1; }), JSON.stringify(x2u.segments.map(function (x) { return x.text; })));
var l42u = T.segmentleriKur(uzunSeg, "l42");
chk("l42 aynı metin: tek satırlık parçalar (42'yi aşmaz), c42x2'den çok satır", l42u.segments.every(function (x) { return x.text.length <= 42 && x.text.indexOf("\n") === -1; }) &&
  l42u.segments.length > x2u.segments.length, l42u.segments.length + " / " + x2u.segments.length);
chk("kelime sınırı (maxWords 3): her satır ≤ 3 kelime; 0 kapalı", T.segmentleriKur(esli, "l42", { maxWords: 3 }).segments.every(function (x) { return x.words.length <= 3; }) &&
  metinler2(T.segmentleriKur(esli, "l42", { maxWords: 0 })) === metinler2(l42));
chk("en uzun süre (maxSure 1,5): satırlar 1,5 sn'yi aşmaz", T.segmentleriKur(esli, "l42", { maxSure: 1.5 }).segments.every(function (x) { return x.end - x.start <= 1.5 + 1e-9; }));
chk("en kısa süre (minSure 0,3): \"Güzel.\" uzamaz", Math.abs(T.segmentleriKur(esli, "l42", { minSure: 0.3 }).segments[2].end - 17.7) < 1e-9);
var kopuk = [{ start: 0, end: 1, text: "Bugün", words: [{ text: "Bugün", start: 0, end: 0.8 }] },
  { start: 0.9, end: 2, text: "size anlatacağım", words: [{ text: "size", start: 0.9, end: 1.3 }, { text: "anlatacağım", start: 1.35, end: 2 }] }];
chk("kısa parça birleştirme: segment sınırını aşan cümle tek satır; kapalıyken de kelimeden satır aynı",
  metinler2(T.segmentleriKur(kopuk, "l42")) === "Bugün size anlatacağım" && metinler2(T.segmentleriKur(kopuk, "l42", { birlestir: false })) === "Bugün size anlatacağım");
// kelimesiz (bulut satır modu, eski önbellek): l32/l42 bugünkü c32/c42 yolunun aynısı
var kelimesiz = esli.map(function (s) { return { start: s.start, end: s.end, text: s.text, confidence: s.confidence }; });
chk("kelimesiz l42 = c42 ve l32 = c32 (bugünkü yol)", JSON.stringify(T.segmentleriKur(kelimesiz, "l42")) === JSON.stringify(T.segmentleriKur(kelimesiz, "c42")) &&
  JSON.stringify(T.segmentleriKur(kelimesiz, "l32")) === JSON.stringify(T.segmentleriKur(kelimesiz, "c32")));
var kelimesizUzun = [{ start: 0, end: 9, text: "Bu çok uzun bir cümle ve iki satıra sığması gereken bir altyazı metni olarak yazıldı bakalım ne olacak" }];
var kx2 = T.segmentleriKur(kelimesizUzun, "c42x2").segments;
chk("kelimesiz c42x2: iki satırlık bütçeyle bölünür, her parça ≤ 2 × 42, kelime atılmaz, çakışma yok",
  kx2.length === 2 && kx2.every(function (x) { var sat = x.text.split("\n"); return sat.length <= 2 && sat.every(function (l) { return l.length <= 42; }); }) &&
  kx2.map(function (x) { return x.text.replace(/\n/g, " "); }).join(" ") === kelimesizUzun[0].text && kx2[0].end <= kx2[1].start, JSON.stringify(kx2));
chk("kelimesiz c42x2: kısa parçalar birleşir (aralık ≤ 0,2 sn, sığıyor); 'Kısa parçaları birleştir' kapalıyken birleşmez",
  T.segmentleriKur([seg(0, 1, "Bugün"), seg(1.1, 2, "size anlatacağım")], "c42x2").segments.map(function (x) { return x.text; }).join("|") === "Bugün size anlatacağım" &&
  T.segmentleriKur([seg(0, 1, "Bugün"), seg(1.1, 2, "size anlatacağım")], "c42x2", { birlestir: false }).segments.length === 2 &&
  T.segmentleriKur([seg(0, 1, "Tamam."), seg(1.1, 2, "Sonra")], "c42x2").segments.length === 2);
// En uzun süre 4,5 sn'nin altındayken uzun satır BÖLÜNÜR, kırpılmaz (konuşma sürerken altyazı kaybolmaz)
var sureUzun = [seg(10, 14.4, "Bugün size kamerayla ilgili birkaç şey anlatacağım ve sonra da göstereceğim")];
var kx3 = T.segmentleriKur(sureUzun, "c42x2", { maxSure: 3 }).segments;
chk("kelimesiz c42x2 + en uzun süre 3: 4,4 sn'lik satır bölünür (kırpılmaz), parçalar ≤ 3 sn, konuşmanın sonuna kadar sürer",
  kx3.length === 2 && kx3.every(function (x) { return x.end - x.start <= 3 + 1e-9; }) && Math.abs(kx3[kx3.length - 1].end - 14.4) < 1e-9 &&
  kx3.map(function (x) { return x.text.replace(/\n/g, " "); }).join(" ") === sureUzun[0].text, JSON.stringify(kx3));
chk("kelimesiz c42x2 + en uzun süre 6 (varsayılan): 4,4 sn'lik iki satıra sığan satır tek kalır",
  T.segmentleriKur(sureUzun, "c42x2").segments.length === 1);
// Bozuk kelime zamanı (motor kelimeleri segment başına yığmış): satır modu segment zamanına düşer
function yigit(bas, metin) { return metin.split(" ").map(function (t) { return { text: t, start: bas, end: bas }; }); }
var yM1 = "Bugün size yeni bir kamera tanıtacağım ve bunu çok seviyorum gerçekten yeni bir";
var yM2 = "şey daha var onu da seviyorum";
var bozukW = [{ start: 0, end: 5, text: yM1, words: yigit(0, yM1) }, { start: 5.5, end: 7, text: yM2, words: yigit(5.5, yM2) }];
var bozuksuz = bozukW.map(function (x) { return { start: x.start, end: x.end, text: x.text }; });
chk("kelimeZamaniBozuk: yığılmış kelimeler bozuk, gerçek fikstür ve kelimesiz liste değil",
  T.kelimeZamaniBozuk(bozukW) === true && T.kelimeZamaniBozuk(esli) === false && T.kelimeZamaniBozuk(bozuksuz) === false &&
  T.kelimeZamaniBozuk([{ start: 5, end: 6, text: "a b c d e f g h", words: yigit(5.1, "a b c d e f g h").map(function (w, i) { w.start = 5.1 + i * 0.1; return w; }) }]) === true);
var bl42 = T.segmentleriKur(bozukW, "l42"), bx2 = T.segmentleriKur(bozukW, "c42x2");
chk("bozuk kelime zamanı: l42 ve c42x2 segment zamanıyla kurulur (kelimesiz yolla aynı), sıfır süreli satır yok",
  JSON.stringify(bl42) === JSON.stringify(T.segmentleriKur(bozuksuz, "l42")) && JSON.stringify(bx2) === JSON.stringify(T.segmentleriKur(bozuksuz, "c42x2")) &&
  bl42.segments.concat(bx2.segments).every(function (x) { return x.end - x.start >= 0.5 && !x.words; }) && Math.abs(bl42.segments[1].end - 5) < 1e-9,
  JSON.stringify(bl42.segments.map(function (x) { return [x.start, x.end]; })));
chk("bozuk kelime zamanı: girdi değişmez (kelimeler yerinde)", bozukW[0].words.length === yM1.split(" ").length);
// Tek bozuk satır (sondaki yığılmış "İzlediğiniz için…") sağlam satırların ölçülmüş kelimelerini düşürmez:
// yalnız onun kelimeleri kendi satırına yayılır (3.2 adım 4 inceleme bulgusu)
function akici(bas, metin, adim) { return metin.split(" ").map(function (t, i) { return { text: t, start: +(bas + i * adim).toFixed(3), end: +(bas + i * adim + adim * 0.9).toFixed(3) }; }); }
function kseg(words) { return { start: words[0].start, end: words[words.length - 1].end, text: words.map(function (w) { return w.text; }).join(" "), words: words }; }
var tekBozuk = [kseg(akici(0, "Bugün size kamerayla ilgili birkaç şey anlatacağım.", 0.3)), kseg(akici(3.1, "Peki bu neden önemli?", 0.3)),
  kseg(akici(5.3, "Çünkü ışık her şeydir.", 0.3)), { start: 8.5, end: 11.5, text: "İzlediğiniz için çok teşekkür ederim", words: yigit(8.5, "İzlediğiniz için çok teşekkür ederim") }];
chk("kelimeSegmentiBozuk / kelimelerHepsiYigili: yalnız yığılmış satır bozuk, transkriptin tümü yığılmış değil",
  T.kelimeSegmentiBozuk(tekBozuk[3]) === true && !T.kelimeSegmentiBozuk(tekBozuk[0]) && T.kelimelerHepsiYigili(tekBozuk) === false &&
  T.kelimeZamaniBozuk(tekBozuk) === true);
["l42", "c42x2"].forEach(function (mod) {
  var r = T.segmentleriKur(JSON.parse(JSON.stringify(tekBozuk)), mod).segments;
  var olcu = {};
  tekBozuk.slice(0, 3).forEach(function (sg) { sg.words.forEach(function (w) { olcu[w.text] = w.start; }); });
  var saglamTutar = r.filter(function (x) { return x.start < 8; }).every(function (x) {
    return x.words && x.words.length && x.words.every(function (w) { return olcu[w.text] === w.start; });
  });
  var son = r[r.length - 1], sw = son.words || [];
  var yayildi = sw.length === 5 && sw.every(function (w, i) { return w.start >= 8.5 - 1e-9 && w.end <= son.end + 1e-9 && (i === 0 || w.start > sw[i - 1].start); }) &&
    sw[4].start > 10;
  chk("tek bozuk satır (" + mod + "): sağlam satırlar ölçülmüş kelimelerini korur, bozuk satırın kelimeleri kendi süresine yayılır",
    saglamTutar && yayildi && r.every(function (x) { return x.words && x.words.length; }), JSON.stringify(r.map(function (x) { return [x.start, x.end, x.words ? x.words.length : 0]; })));
});
chk("tek bozuk satır: girdi değişmez (yığılmış kelimeler yerinde)", tekBozuk[3].words.every(function (w) { return w.start === 8.5 && w.end === 8.5; }));
// VAD'ın uzattığı bozuk satır: kelimeler 17 sn'ye değil makul okuma süresine yayılır (tek tek kırılmaz)
var uzunBozuk = tekBozuk.slice(0, 3).concat([{ start: 8.5, end: 25.5, text: "İzlediğiniz için çok teşekkür ederim", words: yigit(8.5, "İzlediğiniz için çok teşekkür ederim") }]);
var ub = T.segmentleriKur(uzunBozuk, "l42").segments.filter(function (x) { return x.start >= 8.5; });
chk("uzatılmış bozuk satır: kelimeler makul süreye yayılır, satır tek kalır", ub.length === 1 && ub[0].end < 13 && (ub[0].words || []).length === 5,
  JSON.stringify(ub.map(function (x) { return [x.start, x.end]; })));
// Bütün kelimeler bir anda (8+, 1 sn'den kısa aralık): yine bütün transkript kelimesiz kurulur
var hepsiBirAnda = [{ start: 3, end: 5, text: "bir iki üç dört", words: yigit(3.1, "bir iki üç dört") }, { start: 5, end: 7, text: "beş altı yedi sekiz", words: yigit(3.2, "beş altı yedi sekiz") }];
chk("bütün kelimeler aynı anda (satır başına 4): l42 kelimesiz yolla aynı", T.kelimelerHepsiYigili(hepsiBirAnda) === true &&
  JSON.stringify(T.segmentleriKur(hepsiBirAnda, "l42")) === JSON.stringify(T.segmentleriKur(hepsiBirAnda.map(function (x) { return seg(x.start, x.end, x.text); }), "l42")));
// Son satır sesin / sekansın ötesine uzamaz (en kısa süre uzatması sonSinir'de durur; 3.2 adım 4 inceleme bulgusu)
var sonKisa = [kseg([{ text: "Bu", start: 57, end: 57.2 }, { text: "videoyu", start: 57.25, end: 57.7 }, { text: "beğenmeyi", start: 57.75, end: 58.3 }, { text: "unutmayın.", start: 58.35, end: 58.9 }]),
  kseg([{ text: "Görüşürüz!", start: 59.5, end: 59.95 }])];
["l42", "c42x2"].forEach(function (mod) {
  var verilen = T.segmentleriKur(JSON.parse(JSON.stringify(sonKisa)), mod, { sonSinir: 60 }).segments;
  var verilmez = T.segmentleriKur(JSON.parse(JSON.stringify(sonKisa)), mod).segments;
  var genis = T.segmentleriKur(JSON.parse(JSON.stringify(sonKisa)), mod, { sonSinir: 120 }).segments;
  var sV = verilen[verilen.length - 1].end, sY = verilmez[verilmez.length - 1].end, sG = genis[genis.length - 1].end;
  chk("sonSinir (" + mod + "): son satır sekans sonunda (60) biter, sınır yoksa motorun son bitişini aşmaz, geniş sınırda en kısa süreye uzar",
    Math.abs(sV - 60) < 1e-9 && Math.abs(sY - 59.95) < 1e-9 && Math.abs(sG - 60.3) < 1e-9 && T.katmanSuresi(sV, 60, 30, false) === 60, [sV, sY, sG].join(" "));
});
chk("sonSinir: satır kendi bitişinden kısalmaz (sınır yanlışsa yalnız uzatma durur)",
  Math.abs(T.segmentleriKur(JSON.parse(JSON.stringify(sonKisa)), "l42", { sonSinir: 59.7 }).segments[1].end - 59.95) < 1e-9);
chk("kelimesiz c42x2: ses etiketi filtresi ve halüsinasyon temizliği yine çalışır", T.segmentleriKur([seg(0, 2, "[Müzik]"), seg(2, 4, "Merhaba")], "c42x2").segments.map(function (x) { return x.text; }).join("|") === "Merhaba");
chk("boşluksuz yazı (Japonca) l42: satırlar birleşmez, bugünkü yol", T.segmentleriKur(jp, "l42").segments.length === 2);
/* metinStili: satır kırılımı korunur */
chk("metinStili: noktalamasız stilde satır kırılımı kalır, yalnız noktalamalı satır düşer",
  T.metinStili("Bu ışık, hiç\nde kötü değil.", { punct: false }) === "Bu ışık hiç\nde kötü değil" &&
  T.metinStili("Merhaba\n...\nsonra", { punct: false }) === "Merhaba\nsonra" &&
  T.metinStili("bir\niki", { punct: true, kase: "upper", loc: "tr-TR" }) === "BİR\nİKİ");
// trimOverlongCues: ölçülmüş son kelimeden önce kırpmaz
var uzun = { start: 0, end: 17, text: "Bu kısa cümle", words: [{ text: "Bu", start: 0, end: 0.3 }, { text: "kısa", start: 0.4, end: 0.8 }, { text: "cümle", start: 0.9, end: 4.0 }] };
var kirp = T.trimOverlongCues([uzun])[0];
chk("trimOverlongCues: VAD uzattığı sonu kırpar ama ölçülmüş son kelimeden önce değil", kirp.end === 4 && kirp.words.length === 3, kirp.end);
// 8+ kelime aynı ana yığılmış: koruma ölçülmüş kelimelerde de çalışır
var yigili = [{ start: 5, end: 6, text: "bir iki üç dört beş altı yedi sekiz", words: "bir iki üç dört beş altı yedi sekiz".split(" ").map(function (t) { return { text: t, start: 5.1, end: 5.2 }; }) }];
var yHata = null;
try { T.segmentleriKur(yigili, "k1"); } catch (e) { yHata = e; }
chk("8+ kelime aynı anda: koruma yine fırlatır", yHata && /aynı anda/.test(yHata.message) && /8 kelime/.test(yHata.ayrinti || ""), yHata && yHata.ayrinti);
// kelimesiz eski karaoke yolu (-ml 1 / bulut kelimeleri) değişmedi
var eskiK = [seg(0, 0.4, "bir"), seg(0.5, 0.9, "iki"), seg(1.0, 1.3, "...")];
chk("kelimesiz k1: öğeler kelime, noktalama atılır (eski yol)", T.segmentleriKur(eskiK, "k1").segments.map(function (x) { return x.text; }).join("|") === "bir|iki");
// boşluklu tire ölçülmüş kelimelerde kendi öğesidir: k1/kc'de tek başına cue olmaz, w3'te satır metni korunur
var tireli = [{ start: 0, end: 2, text: "Evet - hayır", words: [{ text: "Evet", start: 0, end: 0.5 }, { text: "-", start: 0.5, end: 0.7 }, { text: "hayır", start: 0.7, end: 2 }] }];
chk("tire: k1'de '-' cue'su yok, 'Evet-' yok", T.segmentleriKur(tireli, "k1").segments.map(function (x) { return x.text; }).join("|") === "Evet|hayır");
chk("tire: w3 grubu satır metniyle aynı ('Evet - hayır')", T.segmentleriKur(tireli, "w3").segments.map(function (x) { return x.text; }).join("|") === "Evet - hayır");

/* ---------- Ses etiketi filtresi (3.2 adım 2; Raunen NOISE_PATTERNS + Türkçe sözlük) ---------- */
function metinler(liste) { return liste.map(function (x) { return x.text; }).join("|"); }
var etiketli = [
  seg(0, 2, "[BLANK_AUDIO]"), seg(2, 4, "[Müzik]"), seg(4, 5, "(müzik)"), seg(5, 6, "[MÜZİK]"), seg(6, 7, "(Alkış)"),
  seg(7, 8, "[ALKIŞ]"), seg(8, 9, "(gülüşmeler)"), seg(9, 10, "[Kahkaha]"), seg(10, 11, "[sessizlik]"), seg(11, 12, "(gürültü)"),
  seg(12, 13, "[anlaşılmıyor]"), seg(13, 14, "(şarkı)"), seg(14, 15, "[nefes]"), seg(15, 16, "(öksürük)"),
  seg(16, 17, "[Music]"), seg(17, 18, "(applause)"), seg(18, 19, "[LAUGHTER]"), seg(19, 20, "[Silence]"), seg(20, 21, "(noise)"),
  seg(21, 22, "[INAUDIBLE]"), seg(22, 23, "(singing)"), seg(23, 24, "[cough]"), seg(24, 25, "*laughs*"), seg(25, 26, "*Müzik*"),
  seg(26, 27, "♪ [Müzik] ♪"), seg(27, 28, "[♪ müzik ♪]"), seg(28, 29, "[Müzik] [Alkış]"), seg(29, 30, "[Müzik]."),
  seg(30, 31, "Gerçek konuşma.")
];
chk("etiket: Türkçe ve İngilizce ses etiketleri (köşeli, parantezli, *..*, ♪ sarılı, büyük harf) atılır",
  metinler(T.cleanSegments(etiketli)) === "Gerçek konuşma.", metinler(T.cleanSegments(etiketli)));
var notalar = [seg(0, 1, "♪"), seg(1, 2, "♪♪"), seg(2, 3, "♫ ♪ ♫"), seg(3, 4, "♪ la la la ♪"), seg(4, 5, "Selam")];
chk("etiket: yalnız ♪/♫ satırları atılır, ♪ arasındaki şarkı sözü kalır", metinler(T.cleanSegments(notalar)) === "♪ la la la ♪|Selam", metinler(T.cleanSegments(notalar)));
var vurgulu = [seg(0, 1, "Bugün *kelime* çok önemli"), seg(1, 2, "*Instagram*'da paylaş"), seg(2, 3, "*kelime*"), seg(3, 4, "[Konuşmacı 1] Merhaba")];
chk("etiket: *vurgu* gerçek kelimelerde kalır (yalnız sözlükteki ses adı etikettir); sözlük dışı [..] dokunulmaz",
  metinler(T.cleanSegments(vurgulu)) === "Bugün *kelime* çok önemli|*Instagram*'da paylaş|*kelime*|[Konuşmacı 1] Merhaba", metinler(T.cleanSegments(vurgulu)));
var karisik = T.cleanSegments([seg(0, 3, "Merhaba [müzik]"), seg(3, 6, "(Alkış) Teşekkürler!"), seg(6, 9, "Bu ♪ [Müzik] ♪ harika"), seg(9, 10, "Tamam [BLANK_AUDIO].")]);
chk("etiket: karışık satır konuşmasını korur, satır içi etiket silinir ('Merhaba [müzik]' -> 'Merhaba')",
  metinler(karisik) === "Merhaba|Teşekkürler!|Bu harika|Tamam.", metinler(karisik));
chk("gurultuMu: yalnız tam satır etiketse true", T.gurultuMu("[Müzik]") && T.gurultuMu("♪") && T.gurultuMu("[BLANK_AUDIO]") &&
  !T.gurultuMu("Merhaba [müzik]") && !T.gurultuMu("*kelime*") && !T.gurultuMu("") && !T.gurultuMu("♪ la ♪"));
var koru = T.cleanSegments([seg(0, 1, "(müzik)"), seg(1, 2, "[MÜZİK]"), seg(2, 3, "*laughs*"), seg(3, 4, "[BLANK_AUDIO]"), seg(4, 5, "♪♪"),
  seg(5, 6, "Merhaba (alkış)"), seg(6, 7, "[INAUDIBLE]"), seg(7, 8, "♪ [şarkı] ♪"), seg(8, 9, "Bugün *kelime* var")], { etiketKoru: true });
chk("Ses etiketlerini koru: etiketler '[Müzik]' biçiminde kalır, [BLANK_AUDIO] yine atılır, nota satırı '♪'",
  metinler(koru) === "[Müzik]|[Müzik]|[Laughs]|♪|Merhaba [Alkış]|[Inaudible]|[Şarkı]|Bugün *kelime* var", metinler(koru));
var girdi = [seg(0, 3, "Merhaba [müzik]")];
T.cleanSegments(girdi);
chk("etiket: girdi satırı değiştirilmez (kopya döner)", girdi[0].text === "Merhaba [müzik]");
// ölçülmüş kelimeler: etiket kelimeleri atılır, satır kalan kelimeye daralır; koru açıkken tek etiket kelimesi
var olcEtiket = [
  { start: 0, end: 4, text: "[Müzik]", words: [{ text: "[Müzik]", start: 0, end: 4, p: 0.3 }] },
  { start: 4, end: 9, text: "Merhaba arkadaşlar [müzik]", confidence: 0.9, words: [{ text: "Merhaba", start: 4.2, end: 4.8, p: 0.9 },
    { text: "arkadaşlar", start: 4.9, end: 5.6, p: 0.95 }, { text: "[müzik]", start: 5.7, end: 9, p: 0.3 }] },
  { start: 9, end: 12, text: "( alkış ) tamam", words: [{ text: "(", start: 9, end: 9.1 }, { text: "alkış", start: 9.1, end: 9.8, p: 0.5 },
    { text: ")", start: 9.8, end: 9.9 }, { text: "tamam", start: 10, end: 10.5 }] },
  { start: 12, end: 14, text: "♪♪" }
];
var oe = T.cleanSegments(olcEtiket);
chk("etiket + ölçülmüş kelimeler: etiket kelimeleri atılır, sondaki/baştaki müzik satırı uzatmaz",
  metinler(oe) === "Merhaba arkadaşlar|tamam" && oe[0].words.length === 2 && oe[0].start === 4 && oe[0].end === 5.6 &&
  oe[1].words.length === 1 && oe[1].start === 10 && oe[1].end === 12, JSON.stringify(oe.map(function (x) { return [x.start, x.end, x.words.length]; })));
var k1e = T.segmentleriKur(olcEtiket, "k1");
chk("k1: yalnız-etiket kelimeleri kelime listesinden atılır", metinler(k1e.segments) === "Merhaba|arkadaşlar|tamam", metinler(k1e.segments));
chk("kc: etiket kelimesi birikimli satıra girmez", T.segmentleriKur(olcEtiket, "kc").segments.every(function (x) { return !/\[|\(|♪/.test(x.text); }));
var w3e = T.segmentleriKur(olcEtiket, "w3");
chk("w3: etiketsiz gruplar", metinler(w3e.segments) === "Merhaba arkadaşlar|tamam", metinler(w3e.segments));
var k1k = T.segmentleriKur(olcEtiket, "k1", { etiketKoru: true });
chk("k1 + koru: etiket tek kelime '[Müzik]' / '[Alkış]' (bölünmüş '( alkış )' birleşir)",
  metinler(k1k.segments) === "[Müzik]|Merhaba|arkadaşlar|[Müzik]|[Alkış]|tamam|♪", metinler(k1k.segments));
var bulutK = [seg(0, 0.4, "Hello"), seg(0.5, 3, "[Music]"), seg(3, 3.4, "(applause)"), seg(3.5, 4, "world")];
chk("bulut kelime öğeleri (ölçülmüş değil): etiket öğeleri atılır", metinler(T.segmentleriKur(bulutK, "k1").segments) === "Hello|world");
var c42e = T.segmentleriKur([seg(0, 2, "[Müzik]"), seg(2, 5, "Merhaba [müzik]")], "c42");
chk("satır modu: etiket satırı yok, karışık satır konuşmasıyla", metinler(c42e.segments) === "Merhaba");
chk("satır modu + koru: '[Müzik]' satırı kalır", metinler(T.segmentleriKur([seg(0, 2, "(müzik)"), seg(2, 5, "Merhaba")], "c42", { etiketKoru: true }).segments) === "[Müzik]|Merhaba");
// İnceleme: atılan etiket satırı takılma zincirini keser (filtre öncesi gibi); koru ayarı konuşmayı değiştirmez
var araEtiket = [["Teşekkürler.", 0], ["(alkış)", 2], ["Teşekkürler.", 4], ["(alkış)", 6], ["Teşekkürler.", 8], ["Gol!", 9],
  ["[Müzik]", 10], ["Gol!", 12], ["[Müzik]", 13], ["Gol!", 15]].map(function (x) { return seg(x[1], x[1] + 1, x[0]); });
function konusma(liste) { return liste.filter(function (x) { return !T.gurultuMu(x.text); }).map(function (x) { return x.start + ":" + x.text; }).join("|"); }
var araVars = T.cleanSegments(araEtiket), araKoru = T.cleanSegments(araEtiket, { etiketKoru: true });
chk("etiket satırı araya girince 3 aynı konuşma satırı takılma sayılmaz (alkış/müzik arası 'Teşekkürler.' ve 'Gol!' kalır)",
  konusma(araVars) === "0:Teşekkürler.|4:Teşekkürler.|8:Teşekkürler.|9:Gol!|12:Gol!|15:Gol!", konusma(araVars));
chk("aynı ses: 'Ses etiketlerini koru' açık ve kapalıyken aynı konuşma satırları", konusma(araVars) === konusma(araKoru), konusma(araKoru));
chk("gerçek takılma (aralıksız 3+ aynı satır) yine atılır",
  metinler(T.cleanSegments([seg(0, 1, "Tamam."), seg(1, 2, "Tamam."), seg(2, 3, "Tamam."), seg(3, 4, "Tamam.")])) === "Tamam.|Tamam.");
// İnceleme: koru açıkken uzun müziğin her penceresi '[Müzik]' kalır (takılma filtresi etiket satırını yemez)
var uzunMuzik = T.segmentleriKur([seg(0, 10, "[Müzik]"), seg(10, 20, "[Müzik]"), seg(20, 30, "(müzik)"), seg(30, 40, "[MÜZİK]"), seg(40, 41, "Merhaba")], "c42", { etiketKoru: true });
chk("koru: art arda 4 müzik penceresinin hepsi '[Müzik]' satırı verir",
  metinler(uzunMuzik.segments) === "[Müzik]|[Müzik]|[Müzik]|[Müzik]|Merhaba" &&
  uzunMuzik.segments.map(function (x) { return x.start; }).join(",") === "0,10,20,30,40", metinler(uzunMuzik.segments));
// İnceleme: [BLANK_AUDIO] koru açıkken de atılır; satır kalan konuşmaya daralır (sessizlikte ekranda beklemez)
var bosBas = { start: 0, end: 10, text: "[BLANK_AUDIO] Merhaba", words: [{ text: "[BLANK_AUDIO]", start: 0, end: 9 }, { text: " Merhaba", start: 9.2, end: 10 }] };
var bosSon = { start: 20, end: 30, text: "Görüşürüz [BLANK_AUDIO]", words: [{ text: "Görüşürüz", start: 20, end: 21 }, { text: " [BLANK_AUDIO]", start: 21, end: 30 }] };
[false, true].forEach(function (k) {
  var c = T.cleanSegments([bosBas, bosSon], { etiketKoru: k });
  var s42 = T.segmentleriKur([bosBas, bosSon], "c42", { etiketKoru: k }).segments;
  chk("[BLANK_AUDIO] baş/son: satır konuşmaya daralır (koru " + (k ? "açık" : "kapalı") + ")",
    metinler(c) === "Merhaba|Görüşürüz" && c[0].start === 9.2 && c[0].end === 10 && c[1].start === 20 && c[1].end === 21 &&
    s42[0].start === 9.2 && s42[1].end <= 21, JSON.stringify(c.map(function (x) { return [x.start, x.end]; })) + " " + JSON.stringify(s42.map(function (x) { return [x.start, x.end]; })));
});
var koruKenar = T.cleanSegments([{ start: 0, end: 6, text: "[müzik] Merhaba", words: [{ text: "[müzik]", start: 0.5, end: 5 }, { text: " Merhaba", start: 5.1, end: 6 }] }], { etiketKoru: true });
chk("koru: tutulan kenar etiketi satırı daraltmaz ('[Müzik] Merhaba' 0-6 kalır)",
  metinler(koruKenar) === "[Müzik] Merhaba" && koruKenar[0].start === 0 && koruKenar[0].end === 6, JSON.stringify(koruKenar));
// İnceleme: Object.prototype adları ses etiketi değildir (yazılım dersinde "(constructor)")
chk("'(constructor)', '[__proto__]', '*toString*' etiket değil: metin aynen kalır",
  !T.gurultuMu("(constructor)") && !T.gurultuMu("[__proto__]") && !T.gurultuMu("*toString*") && !T.gurultuMu("(hasOwnProperty)") &&
  T.sesEtiketleri("Sonra (constructor) yazıyoruz", false) === "Sonra (constructor) yazıyoruz" &&
  T.sesEtiketleri("Sonra (constructor) yazıyoruz", true) === "Sonra (constructor) yazıyoruz" &&
  metinler(T.cleanSegments([seg(0, 1, "(constructor)"), seg(1, 2, "[__proto__]")], { etiketKoru: true })) === "(constructor)|[__proto__]",
  T.sesEtiketleri("Sonra (constructor) yazıyoruz", true));
// Raunen atfı: dosya başlığı, işaretler ve THIRD_PARTY_NOTICES girdisi
var ctKaynak = require("fs").readFileSync(path.join(__dirname, "..", "js", "caption-text.js"), "utf8").replace(/\r\n/g, "\n");
chk("caption-text.js: Raunen başlığı ve '// Raunen: <ad>' işaretleri",
  ctKaynak.indexOf("Portions adapted from Raunen (https://github.com/Zeyphers/raunen), MIT, Copyright (c) 2026 Jacob Szczepaniak. See THIRD_PARTY_NOTICES.md.") !== -1 &&
  /\/\/ Raunen: NOISE_PATTERNS/.test(ctKaynak) && /\/\/ Raunen: isNoise\n  function gurultuMu/.test(ctKaynak));
chk("caption-text.js: whisper -sns kullanılmaz (noktalama belirteçlerini de bastırır)", !/"-sns"|--suppress-nst/.test(require("fs").readFileSync(path.join(__dirname, "..", "js", "engine.js"), "utf8")));
var bildirim = require("fs").readFileSync(path.join(__dirname, "..", "THIRD_PARTY_NOTICES.md"), "utf8");
chk("THIRD_PARTY_NOTICES: Raunen girdisinde js/caption-text.js (NOISE_PATTERNS)", /`js\/caption-text\.js` — `NOISE_PATTERNS`/.test(bildirim));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
