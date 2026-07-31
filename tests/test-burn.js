var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * ASS ciktisini ffmpeg/libass ile GERCEKTEN videoya gomup goruntu uretiyor mu diye olcer.
 * Altyazisiz kare ile altyazili kare bayt bayt farkli olmali.
 */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var cp = require("child_process");

// ffmpeg: argumanla verilebilir, verilmezse PATH'ten
var FF = process.argv[2] || "ffmpeg";
var TMP = pathm.join(os.tmpdir(), "suflo-burn-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

/*
 * Gomulecek ASS'i test-export.js uretir. Yoksa (veya bu test tek basina
 * kosuluyorsa) once onu calistir: test sirasina bagimli olmasin.
 */
var kaynakAss = pathm.join(os.tmpdir(), "suflo-export-test", "test.ass");
if (!fs.existsSync(kaynakAss)) {
  var ur = cp.spawnSync(process.execPath, [pathm.join(__dirname, "test-export.js")], { encoding: "utf8" });
  if (!fs.existsSync(kaynakAss)) {
    console.log("FAIL ASS uretilemedi (test-export.js): " +
      String(ur.stderr || ur.stdout || "").split("\n").slice(-3).join(" ").slice(0, 200));
    process.exit(1);
  }
}

var ASS = pathm.join(TMP, "alt.ass");
fs.copyFileSync(kaynakAss, ASS);

function kare(ad, filtre) {
  var cikis = pathm.join(TMP, ad);
  var args = ["-y", "-f", "lavfi", "-i", "color=c=black:s=640x360:d=3:r=25", "-ss", "1", "-frames:v", "1"];
  if (filtre) args = args.concat(["-vf", filtre]);
  args.push(cikis);
  var r = cp.spawnSync(FF, args, { encoding: "utf8" });
  return { ok: r.status === 0 && fs.existsSync(cikis), yol: cikis, err: String(r.stderr || "") };
}

var sonuc = [];
function chk(ad, k, ek) { sonuc.push((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

var bos = kare("bos.png", null);
chk("altyazisiz kare uretildi", bos.ok, bos.err.split("\n").slice(-2).join(" ").slice(0, 100));

// Windows'ta subtitles filtresi icin yol kacisi: C\:/... bicimi
var assFiltreYolu = ASS.replace(/\\/g, "/").replace(/:/g, "\\:");
var dolu = kare("dolu.png", "subtitles='" + assFiltreYolu + "'");
chk("ASS gomulu kare uretildi", dolu.ok, dolu.err.split("\n").slice(-3).join(" ").slice(0, 160));

if (bos.ok && dolu.ok) {
  var a = fs.readFileSync(bos.yol), b = fs.readFileSync(dolu.yol);
  chk("altyazi GORUNTUYE cizildi (kareler farkli)", Buffer.compare(a, b) !== 0,
    "bos=" + a.length + " bayt, altyazili=" + b.length + " bayt");
  chk("altyazili kare belirgin sekilde daha buyuk (piksel eklendi)", b.length > a.length * 1.2,
    "oran " + (b.length / a.length).toFixed(2) + "x");
}

console.log(sonuc.join("\n"));
var f = sonuc.filter(function (x) { return x.indexOf("FAIL") === 0; }).length;
console.log("\n" + (sonuc.length - f) + "/" + sonuc.length + " gecti");
console.log("kareler: " + TMP);
process.exit(f ? 1 : 0);
