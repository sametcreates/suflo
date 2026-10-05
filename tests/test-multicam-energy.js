// Suflo testi: Podcast Modu enerji hattı gerçek ffmpeg ile (Türkçe harfli ve boşluklu yol):
// iki mikrofon WAV'ı (karşılıklı sızıntılı) → 8 kHz mono ham PCM → dBFS → plan; geçici dosyalar silinir
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var M = require(path.join(__dirname, "..", "js", "multicam.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }

var SR = 16000;
// konuşma: [konuşmacı, sn]; konuşan mikrofonda tam seviye, diğerinde −12 dB sızıntı, hep −60 dB taban gürültüsü
var KONUSMA = [[0, 5.3], [1, 4.1], [-1, 1.2], [0, 6.4], [1, 3.6], [0, 4]];
var tohum = 11;
function rnd() { tohum = (tohum * 16807) % 2147483647; return tohum / 2147483647 * 2 - 1; }
function wav(mik) {
  var toplamSn = KONUSMA.reduce(function (a, p) { return a + p[1]; }, 0);
  var n = Math.round(toplamSn * SR), veri = Buffer.alloc(44 + n * 2);
  veri.write("RIFF", 0); veri.writeUInt32LE(36 + n * 2, 4); veri.write("WAVE", 8); veri.write("fmt ", 12);
  veri.writeUInt32LE(16, 16); veri.writeUInt16LE(1, 20); veri.writeUInt16LE(1, 22); veri.writeUInt32LE(SR, 24);
  veri.writeUInt32LE(SR * 2, 28); veri.writeUInt16LE(2, 32); veri.writeUInt16LE(16, 34); veri.write("data", 36); veri.writeUInt32LE(n * 2, 40);
  var i = 0;
  KONUSMA.forEach(function (p) {
    var son = i + Math.round(p[1] * SR);
    for (; i < son; i++) {
      var t = i / SR, v = 0.001 * rnd();
      if (p[0] >= 0) {
        // konuşmaya benzer: 140 Hz temel + harmonik, 4 Hz hece zarfı
        var ses = (Math.sin(2 * Math.PI * 140 * t) + 0.5 * Math.sin(2 * Math.PI * 280 * t) + 0.3 * rnd()) * (0.55 + 0.45 * Math.abs(Math.sin(2 * Math.PI * 2 * t)));
        v += ses * (p[0] === mik ? 0.35 : 0.35 * Math.pow(10, -12 / 20));
      }
      veri.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
    }
  });
  return veri;
}

function ffmpegVar() { var r = cp.spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }); return !r.error && r.status === 0; }
if (!ffmpegVar()) { console.log("ATLA ffmpeg yok"); process.exit(0); }

var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-podcast-"));
var klasor = path.join(kok, "Çekim günü ş ğ ı");
fs.mkdirSync(klasor, { recursive: true });
var tmp = path.join(kok, "geçici klasör");
fs.mkdirSync(tmp, { recursive: true });
var yollar = [0, 1].map(function (m) { var y = path.join(klasor, "mikrofon " + (m ? "B" : "A") + " şarkı.wav"); fs.writeFileSync(y, wav(m)); return y; });

var dep = {
  fs: fs, path: path,
  run: function (cmd, args, opts) {
    return new Promise(function (resolve) {
      var c = cp.spawn(cmd, args, { windowsHide: true }), err = "";
      c.stderr.on("data", function (d) { err += d; });
      c.on("error", function (e) { resolve({ code: -1, stderr: String(e) }); });
      c.on("close", function (code) { resolve({ code: code, stderr: err }); });
    });
  }
};

(async function () {
  try {
    // ikinci mikrofon Premiere dışa aktarımı gibi geçici kopyadan okunur (silInput: girdi de silinir)
    var kopya = path.join(tmp, "seq_123 ş.wav");
    fs.copyFileSync(yollar[1], kopya);
    var a = await M.energyFromFile(dep, { ff: "ffmpeg", input: yollar[0], tmpDir: tmp, win: 0.1 });
    var b = await M.energyFromFile(dep, { ff: "ffmpeg", input: kopya, tmpDir: tmp, win: 0.1, silInput: true });
    var toplamSn = KONUSMA.reduce(function (x, p) { return x + p[1]; }, 0);
    ok("energyFromFile: Türkçe / boşluklu yoldan 100 ms'lik seri (süre ±1 pencere)", Math.abs(a.length - toplamSn * 10) <= 1 && Math.abs(b.length - toplamSn * 10) <= 1, a.length + " / " + b.length);
    ok("energyFromFile: geçici PCM ve silInput girdisi silindi, kaynak dosyalar duruyor",
      fs.readdirSync(tmp).length === 0 && fs.existsSync(yollar[0]) && fs.existsSync(yollar[1]), fs.readdirSync(tmp).join(","));
    var seriler = M.padSeries([a, b]);
    var n = M.normalizeSeries(seriler);
    var act = M.activity(n.levels, { switchMarginDb: 6, gateDb: -25 });
    var plan = M.buildPlan(act, { minShot: 2, holdMs: 400, duration: seriler[0].length * 0.1 });
    // gerçek geçişler: konuşmacı değiştiği anlar (sessizlik kamerayı tutar)
    var gercek = [], t = 0, onceki = null;
    KONUSMA.forEach(function (p) { if (p[0] >= 0) { if (onceki !== null && p[0] !== onceki) gercek.push(t); onceki = p[0]; } t += p[1]; });
    var bulunan = plan.slice(1).map(function (s) { return s.start; });
    var uyumlu = bulunan.length === gercek.length && bulunan.every(function (x, i) { return Math.abs(x - gercek[i]) <= 0.2 + 1e-9; });
    ok("gerçek ffmpeg: geçişler gerçeğin ±0.2 sn içinde, sızıntı geçiş yaptırmaz", uyumlu, "bulunan " + JSON.stringify(bulunan) + " gerçek " + JSON.stringify(gercek));
    ok("gerçek ffmpeg: kameralar sırayla A, B, A, B, A", JSON.stringify(plan.map(function (s) { return s.cam; })) === JSON.stringify([0, 1, 0, 1, 0]), JSON.stringify(plan));
    var hata = null;
    try { await M.energyFromFile(dep, { ff: "ffmpeg", input: path.join(klasor, "olmayan ş.wav"), tmpDir: tmp }); } catch (e) { hata = e; }
    ok("energyFromFile: bozuk / olmayan girdi hata verir ve geçici dosya bırakmaz", hata && /ffmpeg/.test(hata.message) && fs.readdirSync(tmp).length === 0, hata && hata.message);
    var ofset = await M.energyFromFile(dep, { ff: "ffmpeg", input: yollar[0], tmpDir: tmp, win: 0.1, ss: 1, t: 2, offset: 3 });
    ok("energyFromFile: düz klip yedeği (ss / t / offset) sekans zamanına hizalanır", ofset.length >= 49 && ofset.length <= 51 && ofset.slice(0, 30).every(function (v) { return v === M.FLOOR; }) && ofset[35] > -40, ofset.length);
  } catch (e) {
    ok("beklenmeyen hata", false, e && e.stack);
  } finally {
    try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e2) {}
  }
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})();
