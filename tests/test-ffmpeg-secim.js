// Suflo testi: findFfmpeg libass'li adayi tercih eder; yalniz libass'siz varsa onu secer ve uyarir
var fs = require("fs"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "js", "bridge.js"), "utf8").replace(/\r\n/g, "\n");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }
var a = src.indexOf("  var _libass = null;"), b = src.indexOf("\n  }\n", src.indexOf("  async function findFfmpeg(force) {")) + 4;
function kur(adaylar) {
  var calisan = [];
  var M = new Function("adaylar", "calisan", [
    "var _ffmpeg = null; var nodeOK = false; var fs = null; var loglar = [];",
    "function log(m) { loglar.push(m); }",
    "function ffmpegCandidates() { return adaylar.map(function (x) { return x.ad; }); }",
    "function run(exe, args) { calisan.push(exe + ' ' + args.join(' ')); var x = adaylar.filter(function (y) { return y.ad === exe; })[0];",
    "  if (!x || !x.calisir) return Promise.resolve({ code: 1, stdout: '', stderr: 'yok' });",
    "  if (args[0] === '-version') return Promise.resolve({ code: 0, stdout: 'ffmpeg version 7', stderr: '' });",
    "  return Promise.resolve({ code: 0, stdout: x.libass ? ' ... subtitles         V->V   Render text subtitles\\n' : ' ... scale  V->V\\n', stderr: '' }); }",
    src.slice(a, b),
    "return { find: findFfmpeg, libass: ffmpegLibass, uyari: libassUyarisi, loglar: loglar };"].join("\n"))(adaylar, calisan);
  return M;
}
(async function () {
  var m1 = kur([{ ad: "brew", calisir: true, libass: false }, { ad: "suflo", calisir: true, libass: true }]);
  ok("libass'siz brew once gelse de Suflo'nun libass'li ffmpeg'i secilir", (await m1.find(true)) === "suflo" && m1.libass() === true && m1.uyari() === "");
  var m2 = kur([{ ad: "kirik", calisir: false }, { ad: "brew", calisir: true, libass: false }]);
  ok("yalniz libass'siz varsa o secilir, uyari ve gunluk kaydi", (await m2.find(true)) === "brew" && m2.libass() === false && /libass yok/.test(m2.uyari()) && m2.loglar.length === 1);
  var m3 = kur([{ ad: "x", calisir: false }]);
  ok("hic ffmpeg yok: null, libass bilinmiyor", (await m3.find(true)) === null && m3.libass() === null);
  var kanca = fs.readFileSync(path.join(__dirname, "..", "js", "kanca.js"), "utf8"), cap = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8");
  ok("kanca ve stil katmani libass'siz ffmpeg'de anlasilir hata verir", (kanca.match(/K\.libassUyarisi\(\)/g) || []).length >= 2 && /if \(K\.libassUyarisi && K\.libassUyarisi\(\)\) throw new Error/.test(cap));
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + e.stack); process.exit(1); });
