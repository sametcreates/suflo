// Suflo testi: js/dinle.js — Dinle onizlemesi yarisi, dosya temizligi, uzun klip siniri
var fs = require("fs"), path = require("path"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

var dosyalar = {}, silinen = [], calismalar = [], bekleyen = [];
var audio = { hidden: true, src: "", paused: true, attrs: {},
  pause: function () { this.paused = true; }, play: function () { this.paused = false; return Promise.resolve(); },
  removeAttribute: function (a) { if (a === "src") this.src = ""; }, load: function () {} };
var K = {
  findFfmpeg: function () { return Promise.resolve("ffmpeg"); },
  tmpDir: function () { return "/tmp/x"; },
  path: path.posix,
  fs: { existsSync: function (p) { return !!dosyalar[p]; }, unlinkSync: function (p) { silinen.push(p); delete dosyalar[p]; } },
  run: function (ff, args) {
    calismalar.push(args);
    return new Promise(function (res) { bekleyen.push(function () { dosyalar[args[args.length - 1]] = 1; res({ code: 0 }); }); });
  }
};
var ctx = { window: {}, document: { getElementById: function () { return audio; } }, K: K, Date: Date, Math: Math, String: String, Number: Number, Promise: Promise, encodeURI: encodeURI, Error: Error };
ctx.window.SufloTextCut = require(path.join(__dirname, "..", "js", "textcut.js"));
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "dinle.js"), "utf8"), ctx);
var D = ctx.window.KDinle("a");
var clip = { clipStart: 0, clipEnd: 600, dur: 600 };
function bekle() { return new Promise(function (r) { setImmediate(r); }); }

(async function () {
  var gecerli = true;
  var p1 = D.cal({ mediaPath: "/m.mp4", inPoint: 0, dur: 600, cuts: [{ start: 10, end: 12 }, { start: 400, end: 410 }], clip: clip, gecerli: function () { return gecerli; } });
  await bekle();
  var a1 = calismalar[0];
  ok("uzun klip: yalniz ilk 300 sn okunur", a1[a1.indexOf("-t") + 1] === "300");
  var af = a1[a1.indexOf("-af") + 1];
  ok("uzun klip: sinir disi kesimler filtreye girmez", /between\(t,10\.000,12\.000\)/.test(af) && !/400/.test(af), af);
  gecerli = false;          // ffmpeg calisirken klip degisti
  bekleyen.shift()();
  var r1 = await p1;
  ok("klip degistiyse sonuc atilir, ses calmaz", r1.ok === false && audio.hidden === true && audio.paused, JSON.stringify(r1));
  ok("atilan dosya silinir", silinen.indexOf(a1[a1.length - 1]) !== -1);

  gecerli = true;
  var p2 = D.cal({ mediaPath: "/m.mp4", inPoint: 0, dur: 60, cuts: [], clip: { clipStart: 0, clipEnd: 60, dur: 60 }, gecerli: function () { return gecerli; } });
  await bekle();
  var p3 = D.cal({ mediaPath: "/m.mp4", inPoint: 0, dur: 60, cuts: [], clip: { clipStart: 0, clipEnd: 60, dur: 60 } });
  await bekle();
  bekleyen.shift()(); bekleyen.shift()();
  var r2 = await p2, r3 = await p3;
  ok("ust uste iki istek: yalniz sonuncusu calar", r2.ok === false && r3.ok === true && audio.hidden === false && !audio.paused);
  ok("kisa klip kisaltilmadi bayragi", r3.kisaltildi === false);
  var son = calismalar[2][calismalar[2].length - 1];
  D.kapat();
  ok("kapat: oynatici durur, src birakilir, dosya silinir", audio.paused && audio.src === "" && audio.hidden && silinen.indexOf(son) !== -1);

  var kk = fs.readFileSync(path.join(__dirname, "..", "js", "konusma-kes.js"), "utf8");
  var mc = fs.readFileSync(path.join(__dirname, "..", "js", "magiccut.js"), "utf8");
  ok("iki panel de ortak oynaticiyi kullanir", /KDinle\("tc-audio"\)/.test(kk) && /KDinle\("cut-audio"\)/.test(mc));
  ok("magiccut: analiz, uygulama ve secim degisiminde kapanir", (mc.match(/sesiKapat\(\);/g) || []).length >= 3);
  ok("konusma-kes: analiz ve uygulamada kapanir", (kk.match(/sesiKapat\(\);/g) || []).length >= 2);
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + e.stack); process.exit(1); });
