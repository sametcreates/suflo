#!/usr/bin/env node
/*
 * Suflo — katman render ölçümü (tek süreç / parçalı). Ağ yok; yalnız yerel ffmpeg.
 *   node tools/katman-olcum.js              96 sn 1080p30 + 30 sn 4K (2160p30)
 *   node tools/katman-olcum.js --kisa       yalnız 96 sn 1080p30
 *   node tools/katman-olcum.js --4k         yalnız 30 sn 4K
 * Örnek: Altyazı Efektleri "Vurucu" (pop giriş + zıplayan etkin kelime), 240 kelime, style-engine compile.
 * Parçalı yol bu makinenin çekirdek sayısıyla (os.cpus) planlanır; çıktıların kare sayısı ve baytları karşılaştırılır.
 */
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var KOK = path.resolve(__dirname, "..");
var OR = require(path.join(KOK, "js", "overlay-render.js"));
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
var gercekK = require(path.join(KOK, "tests", "_gercek-k.js"));

var SOZ = "bunu gören herkes şaşırdı çünkü hiç kimse böyle bir şey beklemiyordu ama oldu işte ve şimdi anlatıyorum".split(" ");
function ornek(w, h, sure, kelime) {
  var adim = (sure - 1) / kelime;
  var cues = [];
  for (var i = 0; i < kelime; i++) cues.push({ start: 0.2 + i * adim, end: 0.2 + i * adim + adim * 0.9, text: SOZ[i % SOZ.length] });
  return SE.compile({ styleId: "efekt", cues: cues, cueKind: "words", width: w, height: h, overrides: AE.overrides(AE.gorunum("vurucu").ayar) });
}
// Kare kare özet (ffmpeg framemd5): rgba baytları belleğe alınmaz (96 sn 1080p ≈ 24 GB)
function md5(f) { return cp.execFileSync("ffmpeg", ["-v", "error", "-i", f, "-pix_fmt", "rgba", "-f", "framemd5", "-"], { maxBuffer: 1 << 28 }).toString().replace(/^#.*\n/mg, ""); }

async function olc(ad, w, h, sure, kelime) {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-olcum-"));
  var der = ornek(w, h, sure, kelime);
  var olay = (der.ass.match(/^Dialogue:/mg) || []).length;
  var K = gercekK({ tmp: tmp, srt: tmp });
  var ortak = { ass: der.ass, fontFiles: der.fontFiles, g: w, y: h, fps: 30, sure: sure, fontDizini: path.join(KOK, "fonts") };
  var t = Date.now();
  var tek = await OR.render(K, Object.assign({ cikti: path.join(tmp, "tek.mov"), cpus: 1 }, ortak));
  var sTek = (Date.now() - t) / 1000;
  t = Date.now();
  var par = await OR.render(K, Object.assign({ cikti: path.join(tmp, "parca.mov") }, ortak));
  var sPar = (Date.now() - t) / 1000;
  var ayni = md5(tek.path) === md5(par.path);
  console.log(ad + ": " + kelime + " kelime, " + olay + " olay, " + os.cpus().length + " çekirdek → " + par.parca + " parça · tek " + sTek.toFixed(1) + " sn (" +
    (sure / sTek).toFixed(2) + "× gerçek zaman) · parçalı " + sPar.toFixed(1) + " sn (" + (sure / sPar).toFixed(2) + "×) · hızlanma " + (sTek / sPar).toFixed(2) + "× · kareler " + (ayni ? "bayt bayt aynı" : "FARKLI"));
  fs.rmSync(tmp, { recursive: true, force: true });
  return ayni;
}

(async function () {
  var a = process.argv.indexOf("--4k") === -1 ? await olc("96 sn 1080p30", 1920, 1080, 96, 240) : true;
  var b = process.argv.indexOf("--kisa") === -1 ? await olc("30 sn 2160p30", 3840, 2160, 30, 75) : true;
  process.exit(a && b ? 0 : 1);
})().catch(function (e) { console.error(e && e.stack); process.exit(1); });
