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
