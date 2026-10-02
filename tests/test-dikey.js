// Suflo testi: 9:16 dikey sekans — stil olcegi, guvenli alan konumu, tasma (libass render)
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var E = require(path.join(__dirname, "..", "js", "style-engine.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

function fsDegerleri(ass) { return (ass.match(/\\fs(\d+)/g) || []).map(function (x) { return Number(x.slice(3)); }); }
function poslar(ass) {
  var out = [], re = /\\(?:pos|move)\((-?\d+),(-?\d+)/g, m;
  while ((m = re.exec(ass))) out.push({ x: Number(m[1]), y: Number(m[2]) });
  return out;
}
var cue = [{ start: 0, end: 3, text: "BU AY TAM *100 TL* KAZANDIM ARKADAŞLAR" }];

// 16:9 davranisi degismedi: Creator Punch 1080p'de boyut 132
var yatay = E.compile({ styleId: "mrbeast", cueKind: "lines", width: 1920, height: 1080, cues: cue }).ass;
ok("16:9 olcek ayni (mrbeast \\fs132)", fsDegerleri(yatay).indexOf(132) !== -1, fsDegerleri(yatay).slice(0, 3));
var dikey = E.compile({ styleId: "mrbeast", cueKind: "lines", width: 1080, height: 1920, cues: cue }).ass;
ok("9:16'da yukseklikle sisirilmez (\\fs132, 235 degil)", Math.max.apply(null, fsDegerleri(dikey)) < 160, Math.max.apply(null, fsDegerleri(dikey)));
ok("baslik stili de kisa kenarla", /Style: Suflo,[^,]+,132,/.test(dikey));

E.list().forEach(function (p) {
  var r = E.compile({ styleId: p.id, cueKind: "lines", width: 1080, height: 1920, cues: cue }).ass;
  var metinY = poslar(r).filter(function (q) { return q.y > 0; }).map(function (q) { return q.y; });
  ok(p.id + ": metin TikTok/Reels alt arayuzunun ustunde (y <= %78)", metinY.length && metinY.every(function (y) { return y <= 1920 * 0.78; }), Math.max.apply(null, metinY));
});

// Gercek render: yazi kadrajin sol/sag kenarina tasmiyor
var ff = null;
try { cp.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); ff = "ffmpeg"; } catch (e) {}
if (ff) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-dikey-"));
  [[540, 960], [960, 540]].forEach(function (boy) {
  var W = boy[0], H = boy[1];
  E.list().forEach(function (p) {
    var built = E.compile({ styleId: p.id, cueKind: "lines", width: W, height: H, cues: [{ start: 0, end: 3, text: "KAZANDIMMMM ARKADAŞLARRR MÜKEMMELLL" }] });
    fs.writeFileSync(path.join(dir, p.id + ".ass"), built.ass);
    built.fontFiles.forEach(function (f) { try { fs.copyFileSync(path.join(__dirname, "..", "fonts", f), path.join(dir, f)); } catch (e) {} });
    var kenar = 0, opak = 0;
    [0.5, 1.2, 2.4].forEach(function (t) {
      var raw = cp.execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", "color=c=black@0.0:s=" + W + "x" + H + ":r=10:d=3,format=rgba,subtitles=f=" + p.id + ".ass:alpha=1:fontsdir=.",
        "-ss", String(t), "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: dir, maxBuffer: 1 << 25 });
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var a = raw[(y * W + x) * 4 + 3];
          if (a > 128) { opak++; if (x < 3 || x >= W - 3) kenar++; }
        }
      }
    });
    ok(p.id + " " + W + "x" + H + ": uzun kelimeler kadraja sigiyor", opak > 500 && kenar === 0, "opak " + opak + " kenar " + kenar);
  });
  });
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
} else {
  console.log("ATLA render: ffmpeg yok");
}

// Panel: onizleme sekans oranini izler, guvenli alan kutulari
var src = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8");
function kes(imza) { var i = src.indexOf(imza); return src.slice(i, src.indexOf("\n  }", i) + 4); }
var G = new Function(kes("function onizlemeBoyutu(") + "\n" + src.slice(src.indexOf("  var GUVENLI_ALAN"), src.indexOf("  function sahneOraniniAyarla")) +
  "\nreturn { b: onizlemeBoyutu, f: guvenliAlanFiltresi };")();
ok("onizleme: 9:16 -> 304x540 dikey", JSON.stringify(G.b({ width: 1080, height: 1920 })) === JSON.stringify({ w: 304, h: 540, dikey: true }));
ok("onizleme: sekans yoksa 960x540", JSON.stringify(G.b({})) === JSON.stringify({ w: 960, h: 540, dikey: false }));
ok("guvenli alan: uc bolge, dolgu + cerceve", (G.f(304, 540).match(/drawbox=/g) || []).length === 6);
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
