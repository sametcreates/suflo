// Suflo testi: animasyon motoru v2 — yazı animasyonlarının GERÇEK çizimi (ffmpeg / libass; tools/test.js libassGerekli).
// Her animasyon için saydam zeminde kare alınır (tests/test-animasyon.js, test-kalite-libass.js düzeni):
//  - hareket sürerken iki farklı anın kareleri FARKLI (animasyon gerçekten çiziliyor)
//  - hareket bittikten sonraki kare, aynı andaki klasik durağan Altyazı Efektleri karesiyle (giriş yok, vurgu yok)
//    piksel piksel aynı ya da farkı ≤ %0,5 (son kare yerinde; 16:9 ve 9:16 + "Platform arayüzünden kaçın")
//  - yazı kadrajın içinde (alfa kutusu kenarlara değmez)
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var KOK = path.join(__dirname, "..");
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
var YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var ff = cp.spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
if (ff.error || ff.status !== 0 || !/\ssubtitles\s/.test(String(ff.stdout || ""))) {
  console.log("(ffmpeg / libass yok: gerçek çizim atlandı)");
  console.log("\n0/0 gecti");
  process.exit(0);
}

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-yazi-anim-"));
// Üç kelime, her biri 0,8 sn (kart 0,2 - 2,6 sn); vurgu açık (etkin kelime vurgu renginde)
var CUES = ["Bunu", "gören", "herkes"].map(function (w, i) { return { start: 0.2 + i * 0.8, end: 1.0 + i * 0.8, text: w }; });
var SON = 2.5;
var KADRAJ = [{ ad: "16:9", w: 960, h: 540, guvenli: false }, { ad: "9:16 güvenli", w: 540, h: 960, guvenli: true }];
// Hareketin sürdüğü iki an (sn): kart / ilk kelime 0,2'de başlar
var ANLAR = { "daktilo": [0.24, 0.42] };

function derle(ov, k) {
  return SE.compile({ styleId: "efekt", cues: CUES, cueKind: "words", width: k.w, height: k.h, overrides: Object.assign({ guvenli: k.guvenli }, ov) });
}
function kare(r, t, k) {
  (r.fontFiles || []).filter(Boolean).forEach(function (f) { fs.copyFileSync(path.join(KOK, "fonts", f), path.join(tmp, f)); });
  fs.writeFileSync(path.join(tmp, "a.ass"), r.ass, "utf8");
  var p = cp.spawnSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i",
    "color=c=black@0:s=" + k.w + "x" + k.h + ":r=100:d=2.7,format=rgba,subtitles=f=a.ass:alpha=1:fontsdir=.",
    "-ss", String(t), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: tmp, maxBuffer: 64 * 1024 * 1024 });
  return p.stdout || Buffer.alloc(0);
}
// Farklı piksel oranı (renk ya da alfa farkı > 8) ve görünür piksel sayısı
function fark(a, b) {
  if (a.length !== b.length || !a.length) return { oran: 1, n: 0 };
  var n = 0, gorunur = 0;
  for (var i = 0; i < a.length; i += 4) {
    if (a[i + 3] > 8 || b[i + 3] > 8) gorunur++;
    if (Math.abs(a[i] - b[i]) > 8 || Math.abs(a[i + 1] - b[i + 1]) > 8 || Math.abs(a[i + 2] - b[i + 2]) > 8 || Math.abs(a[i + 3] - b[i + 3]) > 8) n++;
  }
  return { oran: n / (a.length / 4), n: n, gorunur: gorunur };
}
function kutu(b, k) {
  var o = { sol: k.w, sag: -1, ust: k.h, alt: -1 };
  for (var y = 0; y < k.h; y++) for (var x = 0; x < k.w; x++) {
    if (b[(y * k.w + x) * 4 + 3] > 16) { if (x < o.sol) o.sol = x; if (x > o.sag) o.sag = x; if (y < o.ust) o.ust = y; if (y > o.alt) o.alt = y; }
  }
  return o;
}
function icinde(o, k) { return o.sag > 0 && o.sol > 0 && o.sag < k.w - 1 && o.ust > 0 && o.alt < k.h - 1; }

try {
  var taban = AE.overrides(AE.gorunum("temiz").ayar);
  YA.kimlikler().forEach(function (id) {
    KADRAJ.forEach(function (k, ki) {
      var r = derle(Object.assign({}, taban, { anim: id }), k);
      var duragan = derle(Object.assign({}, taban, { giris: "yok", aktif: "yok" }), k);
      if (ki === 0) {
        var an = ANLAR[id] || [0.24, 0.31];
        var a1 = kare(r, an[0], k), a2 = kare(r, an[1], k), d1 = fark(a1, a2);
        ok(id + ": hareket sürerken iki an farklı (" + an.join(" / ") + " sn)", d1.n > 30 && (d1.gorunur > 0), d1.n + " piksel");
        ok(id + ": hareket sürerken yazı kadrajın içinde", icinde(kutu(a2, k), k), JSON.stringify(kutu(a2, k)));
      }
      var son = kare(r, SON, k), sabit = kare(duragan, SON, k), d2 = fark(son, sabit);
      ok(id + " [" + k.ad + "]: hareket bitince kare klasik durağan kareyle aynı (fark ≤ %0,5)", sabit.length > 0 && d2.gorunur > 200 && d2.oran <= 0.005,
        (d2.oran * 100).toFixed(3) + "% · " + d2.n + " piksel / görünür " + d2.gorunur);
      ok(id + " [" + k.ad + "]: son karede yazı kadrajın içinde", icinde(kutu(son, k), k), JSON.stringify(kutu(son, k)));
    });
  });
  // Gölge + kutu ile de (yandan kay: kutu kartla kayar; netleş: gölgenin bulanıklığı) son kare aynı
  var k0 = KADRAJ[0];
  [["yandan-kay", { kutu: true, kutuOpak: 60 }], ["netles", { golge: { renk: "#000000", opak: 80, mesafe: 6, yumusak: 8 } }],
    ["kelime-pop", { golge: { renk: "#000000", opak: 80, mesafe: 6, yumusak: 0 }, kutu: true }]].forEach(function (x) {
    var ov = Object.assign({}, taban, x[1]);
    var d3 = fark(kare(derle(Object.assign({}, ov, { anim: x[0] }), k0), SON, k0), kare(derle(Object.assign({}, ov, { giris: "yok", aktif: "yok" }), k0), SON, k0));
    ok(x[0] + " + " + Object.keys(x[1]).join(" + ") + ": son kare klasik durağanla aynı", d3.gorunur > 200 && d3.oran <= 0.005, (d3.oran * 100).toFixed(3) + "%");
  });
  // Ölçek darbesi kelimeyi yerinde büyütür: tepe anında alfa kutusunun ortası durağan karenin ortasından az kayar
  var odR = derle(Object.assign({}, taban, { anim: "olcek-darbe" }), k0), odS = derle(Object.assign({}, taban, { giris: "yok", aktif: "yok" }), k0);
  var tepe = kutu(kare(odR, 0.28, k0), k0), sabitK = kutu(kare(odS, 0.28, k0), k0);
  var kayma = Math.abs((tepe.sol + tepe.sag) / 2 - (sabitK.sol + sabitK.sag) / 2);
  ok("olcek-darbe: tepe anında yazı büyür, kart ortası yerinde (≤ 6 px)", tepe.sag - tepe.sol > sabitK.sag - sabitK.sol && kayma <= 6,
    "genişlik " + (tepe.sag - tepe.sol) + " / " + (sabitK.sag - sabitK.sol) + " · kayma " + kayma);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
