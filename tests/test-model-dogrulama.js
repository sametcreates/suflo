// Suflo testi: engine.js model butunlugu (HuggingFace agac API'sinden SHA-256)
var vm = require("vm"), fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
var ROOT = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-model-"));
var icerik = Buffer.from("sahte model verisi " + Date.now());
var dogruOzet = crypto.createHash("sha256").update(icerik).digest("hex");
var agacYaniti = null, istekler = [], loglar = [];
var K = {
  settings: function () { return {}; }, log: function (m) { loglar.push(m); },
  fs: fs, path: path,
  httpGet: async function (u) { istekler.push(u); return agacYaniti ? { status: 200, body: JSON.stringify(agacYaniti) } : { status: 0, body: "ag yok" }; }
};
var ctx = { require: require, console: console, K: K, Promise: Promise, JSON: JSON };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8"), ctx);
var E = ctx.KEngine;

ok("hfDepo: whisper.cpp deposu", E._hfDepo(E.MODELS[0]) === "ggerganov/whisper.cpp");
ok("hfBeklenenOzet: lfs.oid okunur", E._hfBeklenenOzet([{ path: "a.bin", lfs: { oid: dogruOzet } }], "a.bin") === dogruOzet);
ok("hfBeklenenOzet: LFS olmayan / bozuk girdi bos", E._hfBeklenenOzet([{ path: "a.bin" }], "a.bin") === "" && E._hfBeklenenOzet(null, "a.bin") === "");

(async function () {
  var model = { file: "ggml-test.bin", urls: ["https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-test.bin"] };
  var yol = path.join(tmp, "ggml-test.bin");

  fs.writeFileSync(yol, icerik);
  agacYaniti = [{ type: "file", path: "ggml-test.bin", lfs: { oid: dogruOzet } }];
  ok("dogru dosya dogrulanir", await E._modelDogrula(model, yol) === true && fs.existsSync(yol));

  var model2 = { file: "ggml-test2.bin", urls: ["https://huggingface.co/baska/depo/resolve/main/ggml-test2.bin"] };
  var yol2 = path.join(tmp, "ggml-test2.bin");
  fs.writeFileSync(yol2, Buffer.from("bozuk"));
  agacYaniti = [{ type: "file", path: "ggml-test2.bin", lfs: { oid: dogruOzet } }];
  ok("bozuk dosya reddedilir ve silinir", await E._modelDogrula(model2, yol2) === false && !fs.existsSync(yol2));

  var model3 = { file: "ggml-test3.bin", urls: ["https://huggingface.co/ag/yok/resolve/main/ggml-test3.bin"] };
  var yol3 = path.join(tmp, "ggml-test3.bin");
  fs.writeFileSync(yol3, Buffer.from("x"));
  agacYaniti = null;
  ok("API'ye ulasilamazsa kurulum engellenmez (dosya kalir)", await E._modelDogrula(model3, yol3) === true && fs.existsSync(yol3));
  ok("ozet yalniz huggingface.co'dan istenir (ayna kendi dosyasini onaylamaz)",
    istekler.filter(function (u) { return /ag\/yok/.test(u); }).length === 1 && istekler.every(function (u) { return /^https:\/\/huggingface\.co\//.test(u); }), istekler.join(" "));

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})();
