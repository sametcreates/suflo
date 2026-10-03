#!/usr/bin/env node
/*
 * Suflo test kosumu — her isletim sisteminde (CI dahil) calisir.
 *   node tools/test.js            tum testler
 *   node tools/test.js --hizli    ffmpeg gerektirenleri atla
 * Windows'ta tools/test.ps1 de ayni isi yapar.
 */
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var kok = path.resolve(__dirname, "..");
var testDir = path.join(kok, "tests");
var hizli = process.argv.indexOf("--hizli") !== -1;
var ffmpegGerekli = ["test-export.js", "test-burn.js"];
// libass'li ffmpeg (subtitles/ass filtresi) isteyen render testleri. Bazi dagitimlarin ffmpeg'i
// (orn. Homebrew'un sade "ffmpeg"i) libass'siz gelir: o zaman bu dosyalar "atlandi" sayilir.
var libassGerekli = ["test-animasyon.js", "test-burn.js", "test-dikey.js", "test-emoji-cdn.js", "test-kanca.js",
  "test-kanca-uctan.js", "test-overlay.js", "test-stil.js", "test-style-engine.js"];

function ffmpegVar() {
  var r = cp.spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return !r.error && r.status === 0;
}
function libassVar() {
  var r = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
  return !r.error && /\ssubtitles\s/.test(String(r.stdout || ""));
}
var ffmpeg = ffmpegVar();
var libass = ffmpeg && libassVar();

var dosyalar = fs.readdirSync(testDir).filter(function (f) { return /\.js$/.test(f) && f[0] !== "_"; }).sort();
var gecen = 0, kalan = [], atlanan = 0;

console.log("\nSuflo test kosumu (" + process.platform + ", node " + process.version + ")");
console.log("-".repeat(52));
dosyalar.forEach(function (ad) {
  if (ffmpegGerekli.indexOf(ad) !== -1 && (hizli || !ffmpeg)) {
    console.log("  ATLA  " + ad + (hizli ? "  --hizli" : "  ffmpeg bulunamadi"));
    atlanan++;
    return;
  }
  if (ffmpeg && !libass && libassGerekli.indexOf(ad) !== -1) {
    console.log("  ATLA  " + ad + "  ffmpeg libass'siz (subtitles filtresi yok)");
    atlanan++;
    return;
  }
  var bas = Date.now();
  var r = cp.spawnSync(process.execPath, [path.join(testDir, ad)], {
    cwd: kok, encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024
  });
  var sure = ((Date.now() - bas) / 1000).toFixed(1) + " sn";
  if (r.status === 0) {
    gecen++;
    console.log("  GECTI " + ad + "  " + sure);
  } else {
    kalan.push(ad);
    console.log("  KALDI " + ad + "  " + sure);
    var cikti = String(r.stdout || "") + String(r.stderr || "") + (r.error ? String(r.error) : "");
    cikti.split(/\r?\n/).filter(function (s) { return s && s.indexOf("PASS") !== 0; }).slice(-12)
      .forEach(function (s) { console.log("        " + s); });
  }
});
console.log("-".repeat(52));
console.log(gecen + " gecti, " + kalan.length + " kaldi, " + atlanan + " atlandi");
if (kalan.length) console.log("Kalanlar: " + kalan.join(", "));
process.exit(kalan.length ? 1 : 0);
