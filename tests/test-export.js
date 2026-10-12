var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * captions.js icindeki GERCEK disa aktarma kaynagini calistirir ve ciktilari
 * ffmpeg'e okutur — "gecerli dosya uretiyoruz" iddiasi gercek bir ayristiriciyla sinanir.
 */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var cp = require("child_process");

var SRC = KOKYOL + "js/captions.js";
var src = fs.readFileSync(SRC, "utf8");

function kes(imza) {
  var i = src.indexOf(imza);
  if (i === -1) throw new Error("bulunamadi: " + imza);
  var son = src.indexOf("\n  }", i);
  if (son === -1) throw new Error("kapanis yok: " + imza);
  return src.slice(i, son + 4);
}

// Gercek kaynak: cueler, tc, assTc, assMetin, assKaraokeSatirlari, buildSrt, buildVtt, buildAss
  var animBlok = (function () {
    var i = src.indexOf("var ANIMASYONLAR = {");
    var j = src.indexOf("};", i);
    return src.slice(i, j + 2);
  })();
var kod = [
  animBlok,
  kes("function assCapa("),
  kes("function tc(sec, comma)"),
  kes("function satirlariTopla("),
  kes("function cueler("),
  kes("function buildSrt("),
  kes("function buildVtt("),
  kes("function assTc("),
  kes("function assMetin("),
  kes("function assKaraokeSatirlari("),
  kes("function assSatirKaraoke("),
  kes("function assRenk("),
  kes("function stilRecetesi("),
  kes("function yogunlukCarpani("),
  kes("function vurguKelimesi("),
  kes("function buildAss(")
].join("\n");

/*
 * styleText ve segments testin kontrolunde. stil() panele bagli oldugu icin
 * (DOM okur) burada varsayilan gorunumle taklit edilir — bu dosya BICIM
 * dogrulugunu olcuyor, gorunum dogrulugu tests/test-stil.js'in isi.
 */
globalThis.__SufloCT = require(require("path").join(__dirname, "..", "js", "caption-text.js"));
globalThis.__SufloCL = require(require("path").join(__dirname, "..", "js", "caption-layout.js"));
var f = new Function("SEGMENTS", "STYLE", `
  var segments = SEGMENTS;
  var CT = globalThis.__SufloCT;
  var CL = globalThis.__SufloCL;
  function styleText(t) { return STYLE(t); }
  function styleLocale() { return "tr-TR"; }
  function stil() {
    return { font: "Arial", boyut: 72, renk: "#ffffff", konturRenk: "#000000",
             vurguRenk: "#8b7cf6", kontur: 4, konum: 2, kutu: false };
  }
  ${kod}
  return { buildSrt: buildSrt, buildVtt: buildVtt, buildAss: buildAss,
           cueler: cueler, assTc: assTc, assMetin: assMetin };
`);

var duz = function (t) { return String(t || "").trim(); };
var sonuc = [];
function chk(ad, k, ek) { sonuc.push((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

var TMP = pathm.join(os.tmpdir(), "suflo-export-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

function ffmpeg() {
  var adaylar = [
    "ffmpeg",
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\ffmpeg.exe"
  ];
  var wg = pathm.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
  try {
    fs.readdirSync(wg).forEach(function (d) {
      if (!/ffmpeg/i.test(d)) return;
      var kok = pathm.join(wg, d);
      (function tara(p, derinlik) {
        if (derinlik > 3) return;
        fs.readdirSync(p, { withFileTypes: true }).forEach(function (e) {
          var tam = pathm.join(p, e.name);
          if (e.isDirectory()) tara(tam, derinlik + 1);
          else if (e.name.toLowerCase() === "ffmpeg.exe") adaylar.unshift(tam);
        });
      })(kok, 0);
    });
  } catch (e) {}
  for (var i = 0; i < adaylar.length; i++) {
    try {
      var r = cp.spawnSync(adaylar[i], ["-version"], { encoding: "utf8" });
      if (r.status === 0 && /ffmpeg version/i.test(String(r.stdout))) return adaylar[i];
    } catch (e) {}
  }
  return null;
}

/* ---------------- 1) Duz cumle altyazisi ---------------- */
var duzSegs = [
  { start: 0.2, end: 1.4, text: "Merhaba arkadaslar" },
  { start: 1.5, end: 3.0, text: "bugun altyazi konusacagiz" },
  { start: 3.1, end: 5.0, text: "Suflo ile ucretsiz" }
];
var M = f(duzSegs, duz);

var srt = M.buildSrt();
var vtt = M.buildVtt();
var ass = M.buildAss({});

chk("SRT 3 cue", (srt.match(/-->/g) || []).length === 3);
chk("VTT WEBVTT basligiyla basliyor", vtt.indexOf("WEBVTT\n") === 0, JSON.stringify(vtt.slice(0, 12)));
chk("VTT ms ayraci NOKTA", /00:00:00\.200 --> 00:00:01\.400/.test(vtt), vtt.split("\n")[3]);
chk("SRT ms ayraci VIRGUL", /00:00:00,200 --> 00:00:01,400/.test(srt), srt.split("\r\n")[1]);
chk("ASS [Script Info] ile basliyor", ass.indexOf("[Script Info]") === 0);
chk("ASS Style satiri var", /^Style: Suflo,/m.test(ass));
chk("ASS 3 Dialogue", (ass.match(/^Dialogue: /gm) || []).length === 3);
chk("ASS zaman bicimi H:MM:SS.cc", /Dialogue: 0,0:00:00\.20,0:00:01\.40,/.test(ass),
  (ass.match(/^Dialogue.*/m) || [""])[0].slice(0, 40));

/* ---------------- 2) Karaoke (kelime modu) ---------------- */
var kelimeler = [
  { start: 0.00, end: 0.30, text: "Bir" },
  { start: 0.30, end: 0.65, text: "iki" },
  { start: 0.65, end: 1.00, text: "uc" },
  { start: 1.00, end: 1.40, text: "dort." },
  { start: 2.50, end: 2.90, text: "Yeni" },
  { start: 2.90, end: 3.40, text: "cumle" }
];
var K = f(kelimeler, duz);
var kass = K.buildAss({ karaoke: true });
var dialoglar = kass.match(/^Dialogue: .*/gm) || [];
chk("karaoke: satirlar gruplandi (6 kelime -> 2 satir)", dialoglar.length === 2,
  dialoglar.length + " satir");
chk("karaoke: \\k etiketi santisaniye", /\{\\k30\}Bir \{\\k35\}iki/.test(kass),
  (dialoglar[0] || "").slice(-60));
chk("karaoke: noktalamadan sonra satir kapandi",
  /\{\\k40\}dort\.$/.test(dialoglar[0] || ""), (dialoglar[0] || "").slice(-20));
chk("karaoke: satir suresi ilk kelimeden son kelimeye",
  (dialoglar[0] || "").indexOf("0,0:00:00.00,0:00:01.40,") !== -1, (dialoglar[0] || "").slice(0, 40));

/* ---------------- 3) Kacis ve Turkce ---------------- */
var ozel = f([{ start: 0, end: 1, text: "sus{lu} ve \u00e7\u0131k\u0131\u015f" }], duz);

/* ---- 3.0: cift dilli altyazi (orijinal + ceviri) ---- */
var cift = f([
  { start: 0, end: 1, text: "Hello friends", orig: "Merhaba arkadaşlar" },
  { start: 1, end: 2, text: "Same", orig: "Same" },
  { start: 2, end: 3, text: "Not translated" }
], duz);
var ciftSrt = cift.buildSrt({ ciftDil: true });
// 3.2 adim 4: SRT'de cue icindeki satir kirilimi da CRLF (dosyanin geri kalaniyla ayni)
chk("cift dilli SRT: ust satir orijinal, alt satir ceviri", ciftSrt.indexOf("Merhaba arkadaşlar\r\nHello friends") !== -1, JSON.stringify(ciftSrt.slice(0, 80)));
chk("cift dilli: ayni metin iki kez yazilmaz", ciftSrt.indexOf("Same\r\nSame") === -1);
chk("cift dilli: cevirisi olmayan satir tek satir", ciftSrt.indexOf("Not translated") !== -1 && ciftSrt.indexOf("\nNot translated\n") === -1 || /3\r\n[^\r]*\r\nNot translated\r\n/.test(ciftSrt));
chk("varsayilan (secenek yok) tek dilli", cift.buildSrt().indexOf("Merhaba") === -1);
chk("cift dilli VTT", cift.buildVtt({ ciftDil: true }).indexOf("Merhaba arkadaşlar\nHello friends") !== -1);
var oass = ozel.buildAss({});
chk("ASS: susly parantez kacirildi", /sus\\\{lu\\\}/.test(oass), (oass.match(/^Dialogue.*/m) || [""])[0]);
chk("ASS: Turkce karakterler korundu", /\u00e7\u0131k\u0131\u015f/.test(oass));

/* ---- 3.2 adim 4: iki satirlik cue (2 satir × 42, Shift+Enter) ---- */
var ikiSatir = f([
  { start: 0, end: 2.5, text: "Bugün size kamerayla ilgili\nbirkaç şey anlatacağım." },
  { start: 2.6, end: 4, text: "Tek satır" },
  { start: 4.1, end: 5, text: "Boş satırlı\n\n  \nmetin" }
], duz);
var isrt = ikiSatir.buildSrt(), ivtt = ikiSatir.buildVtt(), iass = ikiSatir.buildAss({});
chk("SRT: iki satirlik cue icinde CRLF, bos satir yok (cue bolunmez)", isrt.indexOf("00:00:02,500\r\nBugün size kamerayla ilgili\r\nbirkaç şey anlatacağım.\r\n\r\n2\r\n") !== -1 &&
  isrt.indexOf("Boş satırlı\r\nmetin\r\n") !== -1 && (isrt.match(/-->/g) || []).length === 3, JSON.stringify(isrt.slice(0, 140)));
chk("VTT: iki satirlik cue LF ile, bos satir yok", ivtt.indexOf("Bugün size kamerayla ilgili\nbirkaç şey anlatacağım.\n\n2\n") !== -1 && ivtt.indexOf("Boş satırlı\nmetin\n") !== -1, JSON.stringify(ivtt.slice(0, 140)));
chk("ASS: satir kirilimi \\N", /Bugün size kamerayla ilgili\\Nbirkaç şey anlatacağım\./.test(iass), (iass.match(/^Dialogue.*/m) || [""])[0]);
var ciftIki = f([{ start: 0, end: 2, text: "Hello\nfriends", orig: "Merhaba\narkadaşlar" }], duz).buildSrt({ ciftDil: true });
chk("cift dilli + iki satirli: her dil tek satir (4 satirlik cue olmaz)", ciftIki.indexOf("Merhaba arkadaşlar\r\nHello friends\r\n") !== -1, JSON.stringify(ciftIki));

/* ---- 3.2 adim 4: satir modunda karaoke \k gercek kelime zamanlarindan ---- */
var satirKelime = [
  { start: 10, end: 12, text: "Bir iki üç", words: [{ text: "Bir", start: 10.2, end: 10.4 }, { text: "iki", start: 10.7, end: 11.0 }, { text: "üç", start: 11.4, end: 11.9 }] },
  { start: 12.5, end: 14, text: "Kelimesiz satır burada" }
];
var SK = f(satirKelime, duz);
var skass = SK.buildAss({ animasyon: "karaoke" });
var skd = skass.match(/^Dialogue: .*/gm) || [];
chk("satir modu karaoke: her satir tek olay, satir zamaninda", skd.length === 2 && skd[0].indexOf("0,0:00:10.00,0:00:12.00,") !== -1, skd.length + " | " + (skd[0] || "").slice(0, 50));
chk("satir modu karaoke: \\k gercek kelime zamanlarindan (bas bosluk 20, Bir→iki 50, iki→üç 70, üç→son 60)",
  /\{\\k20\}\{\\k50\}Bir \{\\k70\}iki \{\\k60\}üç$/.test(skd[0] || ""), (skd[0] || "").split(",,")[1]);
chk("satir modu karaoke: \\k toplami satir suresi (200 cs)", ((skd[0] || "").match(/\\k(\d+)/g) || []).reduce(function (n, k) { return n + Number(k.slice(2)); }, 0) === 200);
var kelimesizK = (skd[1] || "").match(/\\k(\d+)/g) || [];
chk("satir modu karaoke: kelimesiz satirda sure karakter oraniyla (3 hece, toplam 150 cs)", kelimesizK.length === 3 &&
  kelimesizK.reduce(function (n, k) { return n + Number(k.slice(2)); }, 0) === 150, kelimesizK.join(","));
var buyukK = f([{ start: 0, end: 1, text: "bir iki", words: [{ text: "bir", start: 0, end: 0.3 }, { text: "iki", start: 0.6, end: 1 }] }],
  function (t) { return String(t).toLocaleUpperCase("tr-TR"); }).buildAss({ animasyon: "akici" });
chk("satir modu akici: BÜYÜK HARF stilde de kelimeler eslesir (\\kf60 BİR \\kf40 İKİ)", /\{\\kf60\}BİR \{\\kf40\}İKİ$/.test((buyukK.match(/^Dialogue: .*/m) || [""])[0]), (buyukK.match(/^Dialogue: .*/m) || [""])[0]);
var ikiSatirK = f([{ start: 0, end: 2, text: "bir iki\nüç", words: [{ text: "bir", start: 0, end: 0.5 }, { text: "iki", start: 0.5, end: 1 }, { text: "üç", start: 1, end: 2 }] }], duz).buildAss({ animasyon: "karaoke" });
chk("satir modu karaoke: iki satirlik cue \\N ile", /\{\\k50\}bir \{\\k50\}iki\\N\{\\k100\}üç$/.test((ikiSatirK.match(/^Dialogue: .*/m) || [""])[0]), (ikiSatirK.match(/^Dialogue: .*/m) || [""])[0]);
var hicKelime = f([{ start: 0, end: 1, text: "Kelimesiz" }], duz).buildAss({ animasyon: "karaoke" });
chk("satir modu karaoke: transkriptte hic kelime zamani yoksa eskisi gibi fade", /\{\\fad\(180,180\)\}Kelimesiz/.test(hicKelime) && !/\\k\d/.test(hicKelime));

/* ---------------- 4) ffmpeg gercekten okuyabiliyor mu ---------------- */
var ff = ffmpeg();
if (!ff) {
  sonuc.push("ATLA  ffmpeg bulunamadi, ayristirma testi yapilamadi");
} else {
  sonuc.push("(ffmpeg: " + ff + ")");
  function ayristir(ad, icerik, etiket) {
    var p = pathm.join(TMP, ad);
    fs.writeFileSync(p, icerik, "utf8");
    // altyaziyi SRT'ye cevirmeye calis: ayristirilamazsa ffmpeg hata verir
    var cikis = pathm.join(TMP, ad + ".out.srt");
    var r = cp.spawnSync(ff, ["-y", "-i", p, "-f", "srt", cikis], { encoding: "utf8" });
    var hata = String(r.stderr || "");
    var ok = r.status === 0 && fs.existsSync(cikis) && fs.statSync(cikis).size > 0;
    chk(etiket + " ffmpeg ile ayristirildi", ok,
      ok ? "cikti " + fs.statSync(cikis).size + " bayt"
         : hata.split("\n").slice(-3).join(" ").slice(0, 120));
    return ok ? fs.readFileSync(cikis, "utf8") : "";
  }
  var g1 = ayristir("test.vtt", "\ufeff" + vtt, "VTT");
  chk("VTT: metin ve zaman korundu (ffmpeg cikisinda)",
    g1.indexOf("Merhaba arkadaslar") !== -1 && /00:00:00,200/.test(g1), g1.split("\n")[1]);

  var g2 = ayristir("test.ass", ass, "ASS");
  chk("ASS: metin korundu", g2.indexOf("Merhaba arkadaslar") !== -1, g2.split("\n").slice(0, 4).join(" | "));

  var g3 = ayristir("karaoke.ass", kass, "ASS (karaoke)");
  chk("ASS karaoke: kelimeler tek satirda birlesti", /Bir iki uc dort\./.test(g3), g3.split("\n")[2]);

  ayristir("test.srt", "\ufeff" + srt, "SRT (regresyon)");
  var g4 = ayristir("iki-satir.srt", "\ufeff" + isrt, "SRT (iki satirlik cue)");
  chk("SRT iki satir: ffmpeg iki satiri tek cue olarak okur", /Bugün size kamerayla ilgili\r?\nbirkaç şey anlatacağım\./.test(g4) && (g4.match(/-->/g) || []).length === 3, g4.split("\n").slice(0, 5).join(" | "));
  var g5 = ayristir("satir-karaoke.ass", skass, "ASS (satir modu karaoke)");
  chk("ASS satir karaoke: metin korunur", /Bir iki üç/.test(g5), g5.split("\n").slice(0, 4).join(" | "));
}

console.log(sonuc.join("\n"));
var f2 = sonuc.filter(function (x) { return x.indexOf("FAIL") === 0; }).length;
var t = sonuc.filter(function (x) { return /^(PASS|FAIL)/.test(x); }).length;
console.log("\n" + (t - f2) + "/" + t + " gecti");
process.exit(f2 ? 1 : 0);
