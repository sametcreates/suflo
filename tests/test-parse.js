var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * captions.js icindeki GERCEK tcParse + parseSrt kaynagini dosyadan kesip calistirir.
 * Amac: VTT ice aktarmanin gercekten calisip calismadigini olcmek.
 */
var fs = require("fs");
var SRC = KOKYOL + "js/captions.js";
var src = fs.readFileSync(SRC, "utf8");

// Fonksiyon govdesini kapanis satirindan kes (regex icindeki } sayimi bozuyor).
// Kod tabani 2 bosluk girintili: modul seviyesindeki fonksiyon "\n  }" ile biter.
function kes(imza) {
  var i = src.indexOf(imza);
  if (i === -1) throw new Error("bulunamadi: " + imza);
  var son = src.indexOf("\n  }", i);
  if (son === -1) throw new Error("kapanis bulunamadi: " + imza);
  return src.slice(i, son + 4);
}

// VARLIKLAR sabitini de kaynaktan al (elle yeniden yazma)
var vi = src.indexOf("var VARLIKLAR");
var varliklar = src.slice(vi, src.indexOf("\n", vi) + 1);

var kod = varliklar + "\n" + kes("function temizleEtiket(") + "\n" +
  kes("function tcParse(") + "\n" + kes("function parseSrt(");
var f = new Function(kod + "; return { tcParse: tcParse, parseSrt: parseSrt, temizleEtiket: temizleEtiket };");
var M = f();

var sonuc = [];
function chk(ad, kosul, ek) {
  sonuc.push((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : ""));
}

/* ---------- tcParse ---------- */
chk("SRT hh:mm:ss,ms", M.tcParse("00:00:01,380") === 1.38, M.tcParse("00:00:01,380"));
chk("VTT hh:mm:ss.ms", M.tcParse("00:00:04.000") === 4, M.tcParse("00:00:04.000"));
chk("elle mm:ss.ms", M.tcParse("01:23.500") === 83.5, M.tcParse("01:23.500"));
// 1-2 haneli kesir milisaniye SANILMAMALI: ".5" = 500 ms (eski hata: 5 ms okunuyordu)
chk("elle mm:ss.k tek hane", M.tcParse("01:23.5") === 83.5, M.tcParse("01:23.5"));
chk("SRT hh:mm:ss,kk cift hane", M.tcParse("00:00:01,38") === 1.38, M.tcParse("00:00:01,38"));
chk("VTT hh:mm:ss.ms + cue ayarlari",
  M.tcParse("00:00:04.000 align:start position:50%") === 4,
  M.tcParse("00:00:04.000 align:start position:50%"));
chk("VTT mm:ss.ms + cue ayarlari (kisa bicim)",
  M.tcParse("00:04.000 align:start") === 4,
  M.tcParse("00:04.000 align:start"));
chk("saat tasmali (01:00:00,000 = 3600)", M.tcParse("01:00:00,000") === 3600, M.tcParse("01:00:00,000"));

/* ---------- parseSrt: duz SRT ---------- */
var srt = [
  "1", "00:00:00,200 --> 00:00:00,900", "Merhaba", "",
  "2", "00:00:02,000 --> 00:00:04,000", "iki satirlik", "bir cue", ""
].join("\n");
var a = M.parseSrt(srt);
chk("SRT: 2 cue okundu", a.length === 2, a.length);
chk("SRT: zamanlar dogru", a[0] && a[0].start === 0.2 && a[0].end === 0.9, JSON.stringify(a[0]));
chk("SRT: cok satirli metin birlestirildi", a[1] && a[1].text === "iki satirlik bir cue", a[1] && a[1].text);

/* ---------- parseSrt: gercek WebVTT (YouTube tarzi) ---------- */
var vtt = [
  "WEBVTT",
  "Kind: captions",
  "Language: tr",
  "",
  "NOTE bu bir yorum satiri",
  "",
  "1",
  "00:00:00.200 --> 00:00:00.900 align:start position:0%",
  "Merhaba",
  "",
  "00:00:02.000 --> 00:00:04.000",
  "<v Konusmaci>Selam <b>dunya</b>",
  "",
  "00:00:05.000 --> 00:00:06.000",
  "5 &amp; 6 aras&#305;",
  ""
].join("\n");
var b = M.parseSrt(vtt);
chk("VTT: 3 cue okundu (WEBVTT/NOTE atlandi)", b.length === 3, b.length + " -> " + JSON.stringify(b.map(function (x) { return x.text; })));
chk("VTT: cue ayarli satirin BITIS zamani dogru", b[0] && b[0].end === 0.9, b[0] && b[0].end);
chk("VTT: <v>/<b> etiketleri temizlendi", b[1] && b[1].text === "Selam dunya", b[1] && b[1].text);
// &amp; -> & (tek gecis, dogru) ve &#305; -> Turkce noktasiz i
chk("VTT: HTML varliklari cozuldu", b[2] && b[2].text === "5 & 6 arası", b[2] && b[2].text);
chk("VTT: cift cozme YOK (&amp;lt; -> &lt;)", M.temizleEtiket("&amp;lt;") === "&lt;", M.temizleEtiket("&amp;lt;"));
chk("bilinmeyen varlik oldugu gibi kalir", M.temizleEtiket("&bogus;") === "&bogus;", M.temizleEtiket("&bogus;"));

/* ---------- parseSrt: kisa bicimli VTT (saat alansiz) ---------- */
var vtt2 = ["WEBVTT", "", "00:01.000 --> 00:03.500", "kisa bicim", ""].join("\n");
var c = M.parseSrt(vtt2);
chk("VTT kisa bicim: cue okundu", c.length === 1, c.length);
chk("VTT kisa bicim: zamanlar dogru", c[0] && c[0].start === 1 && c[0].end === 3.5, JSON.stringify(c[0]));

/* ---------- SRT icinde stil etiketleri ---------- */
var srt2 = ["1", "00:00:01,000 --> 00:00:02,000", "{\\an8}<i>egik yazi</i>", ""].join("\n");
var d = M.parseSrt(srt2);
chk("SRT: <i> ve {\\an8} temizlendi", d[0] && d[0].text === "egik yazi", d[0] && d[0].text);

/* ---------- CRLF + BOM ---------- */
var srt3 = "\ufeff1\r\n00:00:01,000 --> 00:00:02,000\r\nBOM testi\r\n\r\n";
var e = M.parseSrt(srt3);
chk("BOM + CRLF okundu", e.length === 1 && e[0].text === "BOM testi", JSON.stringify(e));

console.log(sonuc.join("\n"));
var f2 = sonuc.filter(function (x) { return x.indexOf("FAIL") === 0; }).length;
console.log("\n" + (sonuc.length - f2) + "/" + sonuc.length + " gecti");
