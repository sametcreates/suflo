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
chk("c20: uzun satır ölçülmüş kelime sınırında bölünür, parçalar kelimelerini taşır",
  c20.mode === "plain" && c20.segments.length === 6 && c20.segments[0].text === "Bu ışık hiç de" && Math.abs(c20.segments[1].start - 11.06) < 1e-9 &&
  c20.segments.every(function (x) { return x.words && icinde(x); }) && sirali(c20.segments),
  c20.segments.map(function (x) { return x.text + "@" + x.start.toFixed(2); }).join(" | "));
chk("c42: kısa satırlar kelimeleriyle aynen kalır", T.segmentleriKur(esli, "c42").segments[0].words.length === 8);
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

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
