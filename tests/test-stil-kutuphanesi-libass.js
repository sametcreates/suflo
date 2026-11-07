// Suflo testi (libass): stil kütüphanesi (parti 3) — her hazır görünümün gerçek çizimi.
//   Her görünüm 9:16'da "Platform arayüzünden kaçın" açıkken bir kare (animasyon bittikten sonra) ve 16:9'da bir kare
//   ffmpeg / libass ile saydam zeminde çizilir (test-kalite-libass.js, test-stil.js gibi). Denetim: alfa boş değil,
//   yazının rengi gerçekten çizilmiş, alfa sınır kutusu kadrajın içinde ve 9:16 güvenlide TikTok / Reels / Shorts
//   arayüzünün kapattığı bölgelerin (stil motorunun GUVENLI_ALAN'ı) dışında.
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");
var KOK = path.join(__dirname, "..");
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));

var gecen = 0, kalan = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecen++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 200) + "]" : "")); }
  else { kalan++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 300) + "]"); }
}

var ff = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
if (ff.error || ff.status !== 0 || !/\ssubtitles\s/.test(String(ff.stdout || ""))) {
  console.log("(ffmpeg / libass yok: gerçek çizim atlandı)");
  console.log("\n0/0 gecti");
  process.exit(0);
}

// Kelimeler 0,5 sn arayla; kare 1,15 sn: ikinci kelime ("sizlere") konuşuluyor. Her görünümde (en az 2 kelimelik kart) ilk
// kart 0,95 sn'dir açık: kart girişleri bitmiş, kartın bir sonraki kartın girişine (soluklaşma) denk gelmeyen anı
var CUES = ["Bugün", "*sizlere*", "çok", "önemli", "şeyler", "anlatacağım"].map(function (w, i) { return { start: 0.2 + i * 0.5, end: 0.2 + i * 0.5 + 0.48, text: w }; });
var ANI = 1.15;
var KADRAJLAR = [{ ad: "9:16 güvenli", w: 540, h: 960, guvenli: true }, { ad: "16:9", w: 960, h: 540, guvenli: false }];
var GA = SE.GUVENLI_ALAN;

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-kutuphane-libass-"));
function kare(r, w, h) {
  (r.fontFiles || []).filter(Boolean).forEach(function (f) { fs.copyFileSync(path.join(KOK, "fonts", f), path.join(tmp, f)); });
  fs.writeFileSync(path.join(tmp, "a.ass"), r.ass, "utf8");
  var p = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i",
    "color=c=black@0:s=" + w + "x" + h + ":r=20:d=3.5,format=rgba,subtitles=f=a.ass:alpha=1:fontsdir=.",
    "-ss", String(ANI), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: tmp, maxBuffer: 64 * 1024 * 1024 });
  return p.stdout || Buffer.alloc(0);
}
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
// alfa sınır kutusu (alfa > 24), dolu piksel sayısı ve yazı rengine yakın opak piksel sayısı
function olc(b, w, h, renk) {
  var k = { sol: w, sag: -1, ust: h, alt: -1, dolu: 0, yazi: 0 }, c = hex(renk);
  if (b.length < w * h * 4) return k;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4;
      if (b[i + 3] <= 24) continue;
      k.dolu++;
      if (x < k.sol) k.sol = x; if (x > k.sag) k.sag = x; if (y < k.ust) k.ust = y; if (y > k.alt) k.alt = y;
      if (b[i + 3] > 200 && Math.abs(b[i] - c[0]) + Math.abs(b[i + 1] - c[1]) + Math.abs(b[i + 2] - c[2]) < 60) k.yazi++;
    }
  }
  return k;
}
function yaz(k, w, h) {
  return "x %" + (k.sol / w * 100).toFixed(1) + "-" + (k.sag / w * 100).toFixed(1) + " · y %" + (k.ust / h * 100).toFixed(1) + "-" + (k.alt / h * 100).toFixed(1) +
    " · dolu " + k.dolu + " · yazı rengi " + k.yazi;
}

try {
  AE.GORUNUMLER.forEach(function (g) {
    KADRAJLAR.forEach(function (d) {
      var ov = AE.overrides(g.ayar);
      ov.guvenli = d.guvenli;
      var r = SE.compile({ styleId: "efekt", cues: CUES, cueKind: "words", width: d.w, height: d.h, overrides: ov });
      var k = olc(kare(r, d.w, d.h), d.w, d.h, g.ayar.renk);
      // gölge / bulanıklık birkaç piksel taşabilir: güvenli alan sınırlarında kadrajın %1'i pay
      var px = d.w * 0.01, py = d.h * 0.01;
      var icinde = k.dolu > 0 && k.sol > 0 && k.ust > 0 && k.sag < d.w - 1 && k.alt < d.h - 1;
      var guvenli = !d.guvenli || (k.ust >= GA[0].h * d.h - py && k.alt <= GA[2].y * d.h + py &&
        !(k.alt > GA[1].y * d.h && k.ust < (GA[1].y + GA[1].h) * d.h && k.sag > GA[1].x * d.w + px));
      ok(g.id + " (" + d.ad + "): alfa dolu, yazı rengi çizildi, kutu kadrajın içinde" + (d.guvenli ? ", platform arayüzünün dışında" : ""),
        k.dolu > 400 && k.yazi > 40 && icinde && guvenli, yaz(k, d.w, d.h));
    });
  });
} finally {
  try { fs.rmSync ? fs.rmSync(tmp, { recursive: true, force: true }) : fs.readdirSync(tmp).forEach(function (f) { fs.unlinkSync(path.join(tmp, f)); }); } catch (e) {}
}

console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
process.exit(kalan ? 1 : 0);
