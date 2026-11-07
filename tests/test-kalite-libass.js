// Suflo testi (libass): kalite motoru parti 1, durum e — tek başına kadraja sığmayan uzun kelime gerçek çizimde.
//   1080 × 1920, Anton, boyut 112, kelime 3, satır 1, cue'lar "Afyonkarahisarlılaştıramadıklarımızdanmışsınızcasına" ve
//   "tamam". Eskiden iki kelime tek kartta \fs32'ye küçülüyordu; şimdi uzun kelime kendi kartında (yalnız o kart
//   küçülür, taban + \fscx), "tamam" tam puntoda. Ölçüm: ffmpeg / libass ile saydam zeminde çizilen kare (test-stil.js,
//   test-animasyon.js gibi), alfa sınır kutusu ve beyaz dolgunun yüksekliği.
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");
var KOK = path.join(__dirname, "..");
var SE = require(path.join(KOK, "js", "style-engine.js"));
// ÖNCE: caption-layout.js'siz yüklenen motor (require yok: eski açgözlü gruplama ve eski kart küçültmesi)
var kutu = { module: { exports: {} }, console: console };
kutu.exports = kutu.module.exports;
require("vm").runInNewContext(fs.readFileSync(path.join(KOK, "js", "style-engine.js"), "utf8"), kutu);
var ESKI = kutu.module.exports;

var gecen = 0, kalan = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecen++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 200) + "]" : "")); }
  else { kalan++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 300) + "]"); }
}

var W = 1080, H = 1920;
var UZUN = "Afyonkarahisarlılaştıramadıklarımızdanmışsınızcasına";
var CUES = [{ start: 0, end: 1, text: UZUN }, { start: 1, end: 2, text: "tamam" }];
var AYAR = { font: "Anton", boyut: 112, kelime: 3, satir: 1, giris: "yok", vurgu: false };

function derle(ek, motor) {
  return (motor || SE).compile({ styleId: "efekt", cues: CUES, cueKind: "words", width: W, height: H, overrides: Object.assign({}, AYAR, ek || {}) });
}

var ff = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
if (ff.error || ff.status !== 0 || !/\ssubtitles\s/.test(String(ff.stdout || ""))) {
  console.log("(ffmpeg / libass yok: gerçek çizim atlandı)");
  console.log("\n0/0 gecti");
  process.exit(0);
}

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-kalite-libass-"));
// t saniyedeki kareyi saydam zeminde çiz; döner: rgba Buffer
function kare(r, t) {
  // eski motor (style-share.js'siz) font dosyasını bilmez: Anton her koşuda klasörde
  ["Anton.ttf"].concat(r.fontFiles || []).filter(Boolean).forEach(function (f) { fs.copyFileSync(path.join(KOK, "fonts", f), path.join(tmp, f)); });
  fs.writeFileSync(path.join(tmp, "a.ass"), r.ass, "utf8");
  var p = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i",
    "color=c=black@0:s=" + W + "x" + H + ":r=10:d=2.5,format=rgba,subtitles=f=a.ass:alpha=1:fontsdir=.",
    "-ss", String(t), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: tmp, maxBuffer: 64 * 1024 * 1024 });
  return p.stdout || Buffer.alloc(0);
}
// alfa sınır kutusu (alfa > 16) ve beyaz dolgu (r, g, b > 200, opak) yüksekliği
function olc(b) {
  var k = { sol: W, sag: -1, ust: H, alt: -1, dUst: H, dAlt: -1 };
  if (b.length < W * H * 4) return k;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = (y * W + x) * 4;
      if (b[i + 3] > 16) { if (x < k.sol) k.sol = x; if (x > k.sag) k.sag = x; if (y < k.ust) k.ust = y; if (y > k.alt) k.alt = y; }
      if (b[i + 3] > 200 && b[i] > 200 && b[i + 1] > 200 && b[i + 2] > 200) { if (y < k.dUst) k.dUst = y; if (y > k.dAlt) k.dAlt = y; }
    }
  }
  k.gen = k.sag - k.sol + 1; k.yuk = k.alt - k.ust + 1; k.dolgu = k.dAlt - k.dUst + 1;
  return k;
}
function yaz(k) { return "x " + k.sol + "-" + k.sag + " (%" + (k.gen / W * 100).toFixed(1) + ") · dolgu " + k.dolgu + " px"; }

try {
  var once = olc(kare(derle({}, ESKI), 0.5));
  ok("e ÖNCE (eski motor): iki kelime tek kartta \\fs32, uzun kelimenin dolgusu ~23 px", /\\fs32\\q2/.test(derle({}, ESKI).ass) && once.dolgu > 0 && once.dolgu < 30, yaz(once));
  [false, true].forEach(function (guv) {
    var r = derle({ guvenli: guv });
    var ilk = /\\fs(\d+)(?:\\fscx(\d+))?/.exec(r.ass.split("\n").filter(function (l) { return /^Dialogue: 1,0:00:00\.00/.test(l); })[0] || "");
    var u = olc(kare(r, 0.5)), t = olc(kare(r, 1.5));
    var ad = guv ? " + 'Platform arayüzünden kaçın'" : "";
    ok("e gerçek çizim" + ad + ": uzun kelime kartı kadrajın içinde (alfa kutusu genişliğin ≤ %92'si, iki kenardan da içeride)",
      u.sag > 0 && u.gen <= W * 0.92 && u.sol > 0 && u.sag < W - 1, yaz(u) + " · \\fs" + (ilk && ilk[1]) + " \\fscx" + (ilk && ilk[2]));
    ok("e gerçek çizim" + ad + ": uzun kelimenin glifi okunur boyda (taban \\fs62: beyaz dolgu ≥ 38 px, eskinin ~1,9 katı)",
      u.dolgu >= 38 && u.dolgu >= once.dolgu * 1.6, yaz(u));
    ok("e gerçek çizim" + ad + ": 'tamam' kendi kartında tam puntoda (\\fs112: küçük harf dolgusu ≥ 50 px), kadrajın içinde",
      t.dolgu >= 50 && t.gen <= W * 0.92 && t.sol > 0, yaz(t));
    if (guv) ok("e gerçek çizim + güvenli: uzun kelime sağdaki ikon sütununun (%87) solunda", u.sag + 1 <= W * 0.87, yaz(u));
  });
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
process.exit(kalan ? 1 : 0);
