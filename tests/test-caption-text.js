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

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
