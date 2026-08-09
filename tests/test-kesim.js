/*
 * Kesim modülü ffmpeg'in GERÇEK çıktısını okuyabiliyor mu?
 *
 * magiccut.js'in parseSilence'ı kaynaktan kesilip, gerçek ffmpeg'in
 * silencedetect çıktısına karşı çalıştırılır: sentetik "konuşma-sessizlik-
 * konuşma" wav'ı üretilir, sessiz aralık ±150 ms içinde bulunmalı.
 * ffmpeg log biçimi sürümle değişirse burada patlar — üründe değil.
 *
 * Kullanım: node tests/test-kesim.js [ffmpeg-yolu]
 */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var cp = require("child_process");

var KOK = pathm.join(__dirname, "..");
var FF = process.argv[2] || "ffmpeg";
var TMP = pathm.join(os.tmpdir(), "suflo-kesim-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 90) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

/* ---------------- parseSilence'ı gerçek kaynaktan kes ---------------- */

var src = fs.readFileSync(pathm.join(KOK, "js", "magiccut.js"), "utf8");
var i0 = src.indexOf("function parseSilence(");
var i1 = src.indexOf("\n  }", i0);
if (i0 === -1 || i1 === -1) { console.log("FAIL parseSilence kaynakta bulunamadi"); process.exit(1); }
var parseSilence = new Function("stderr", src.slice(i0, i1 + 4) + "\nreturn parseSilence(stderr);");

// filtre parametreleri üründekiyle aynı kalıpta mı? (arayüz değişirse yakala)
ok("silencedetect filtresi urunde bekleneni kuruyor",
  /silencedetect=noise=.*dB:d=/.test(src), "noise=..dB:d=..");

/* ================= 1) Sabit metinle birim test ================= */

var ornek = [
  "[silencedetect @ 0x1] silence_start: 1.02367",
  "baska bir satir",
  "[silencedetect @ 0x1] silence_end: 2.51733 | silence_duration: 1.49366"
].join("\n");
var r = parseSilence(ornek);
ok("tek aralik cozuluyor", r.length === 1 && Math.abs(r[0].start - 1.02367) < 1e-4 &&
  Math.abs(r[0].end - 2.51733) < 1e-4, JSON.stringify(r));
ok("negatif start 0'a kirpiliyor",
  parseSilence("silence_start: -0.01\nsilence_end: 1.0")[0].start === 0);
ok("end'siz start yutulmuyor ama aralik uretmiyor",
  parseSilence("silence_start: 3.0").length === 0);
ok("bos girdi bos liste", parseSilence("").length === 0);

/* ================= 2) Gerçek ffmpeg ile uçtan uca ================= */

// 1 sn 440 Hz ton + 1.5 sn sessizlik + 1 sn ton
var wav = pathm.join(TMP, "konusma.wav");
var uret = cp.spawnSync(FF, [
  "-hide_banner", "-y",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
  "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1.5",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
  "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]",
  "-map", "[a]", wav
], { encoding: "utf8", timeout: 60000 });

if (uret.status !== 0 || !fs.existsSync(wav)) {
  console.log("SKIP gercek-ffmpeg testleri (ffmpeg yok ya da uretim basarisiz: " +
    String(uret.stderr).slice(-200) + ")");
} else {
  // üründeki filtreyle birebir aynı çağrı biçimi
  var analiz = cp.spawnSync(FF, [
    "-hide_banner", "-i", wav,
    "-af", "silencedetect=noise=-30dB:d=0.8",
    "-f", "null", "-"
  ], { encoding: "utf8", timeout: 60000 });

  var stderr = analiz.stderr || "";
  ok("ffmpeg silencedetect calisti", analiz.status === 0, "exit " + analiz.status);
  ok("ciktida silence_start var", stderr.indexOf("silence_start") !== -1);

  var gercek = parseSilence(stderr);
  ok("gercek ciktidan 1 sessiz aralik", gercek.length === 1, JSON.stringify(gercek));
  if (gercek.length === 1) {
    ok("sessizlik baslangici ~1.0 sn (+-150 ms)", Math.abs(gercek[0].start - 1.0) < 0.15,
      gercek[0].start.toFixed(3));
    ok("sessizlik bitisi ~2.5 sn (+-150 ms)", Math.abs(gercek[0].end - 2.5) < 0.15,
      gercek[0].end.toFixed(3));
  }

  // ürünün pad/kirpma mantığının önkoşulu: aralıklar sıralı ve pozitif
  ok("araliklar sirali ve pozitif", gercek.every(function (a) { return a.end > a.start && a.start >= 0; }));
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
process.exit(kaldi ? 1 : 0);
