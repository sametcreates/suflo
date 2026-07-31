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
var kod = [
  kes("function tc(sec, comma)"),
  kes("function cueler("),
  kes("function buildSrt("),
  kes("function buildVtt("),
  kes("function assTc("),
  kes("function assMetin("),
  kes("function assKaraokeSatirlari("),
  kes("function assRenk("),
  kes("function buildAss(")
].join("\n");

/*
 * styleText ve segments testin kontrolunde. stil() panele bagli oldugu icin
 * (DOM okur) burada varsayilan gorunumle taklit edilir — bu dosya BICIM
 * dogrulugunu olcuyor, gorunum dogrulugu tests/test-stil.js'in isi.
 */
var f = new Function("SEGMENTS", "STYLE", `
  var segments = SEGMENTS;
  function styleText(t) { return STYLE(t); }
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
var oass = ozel.buildAss({});
chk("ASS: susly parantez kacirildi", /sus\\\{lu\\\}/.test(oass), (oass.match(/^Dialogue.*/m) || [""])[0]);
chk("ASS: Turkce karakterler korundu", /\u00e7\u0131k\u0131\u015f/.test(oass));

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
}

console.log(sonuc.join("\n"));
var f2 = sonuc.filter(function (x) { return x.indexOf("FAIL") === 0; }).length;
var t = sonuc.filter(function (x) { return /^(PASS|FAIL)/.test(x); }).length;
console.log("\n" + (t - f2) + "/" + t + " gecti");
process.exit(f2 ? 1 : 0);
