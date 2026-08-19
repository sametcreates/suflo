var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * MOGRT ve SFX kutuphaneleri gercek kaynak koddan calistirilir.
 * Derin klasor taramasi ile Pro timeline koprusunun kaybolmasini yakalar.
 */
var fs = require("fs");
var os = require("os");
var path = require("path");
var vm = require("vm");

var TMP = path.join(os.tmpdir(), "suflo-kutuphane-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(path.join(TMP, "deep", "one", "two", "three"), { recursive: true });
fs.mkdirSync(path.join(TMP, ".hidden"), { recursive: true });
fs.writeFileSync(path.join(TMP, "root.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "deep", "one", "two", "three", "nested.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, ".hidden", "skip.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "deep", "one", "hit.wav"), "wav");
fs.writeFileSync(path.join(TMP, "deep", "one", "two", "whoosh.mp3"), "mp3");
fs.writeFileSync(path.join(TMP, "deep", "ignore.txt"), "txt");

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + kanit + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

function walkAudio(dir, limit, depth) {
  var out = [];
  if (depth < 0) return out;
  var entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.forEach(function (entry) {
    if (out.length >= limit || entry.name.charAt(0) === ".") return;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walkAudio(full, limit - out.length, depth - 1));
    else if (/\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i.test(entry.name)) out.push(full);
  });
  return out;
}

var settings = { mogrtEkKlasor: TMP, sfxEkKlasor: TMP, sfxFavs: [], sfxRecent: [] };
var ctx = {
  console: console,
  Promise: Promise,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  document: {
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; }
  },
  Audio: function () {
    this.pause = function () {};
    this.play = function () { return Promise.resolve(); };
  },
  K: {
    nodeOK: true,
    fs: fs, path: path, os: os,
    settingsPath: function () { return path.join(TMP, "settings.json"); },
    settings: function () { return settings; },
    saveSettings: function () { return true; },
    walkAudio: walkAudio,
    unzip: function () { return Promise.reject(new Error("test mogrt zip degil")); },
    log: function () {}
  }
};
ctx.window = ctx;
vm.createContext(ctx);

async function run() {
  var libSrc = fs.readFileSync(KOKYOL + "js/library.js", "utf8");
  vm.runInContext(libSrc, ctx, { filename: "js/library.js" });
  await ctx.KLib.tara();
  ok("MOGRT taramasi derin klasore iniyor", ctx.KLib.sayisi() === 2, ctx.KLib.sayisi());

  var sfxSrc = fs.readFileSync(KOKYOL + "js/sfx.js", "utf8");
  vm.runInContext(sfxSrc, ctx, { filename: "js/sfx.js" });
  ctx.KSfx.tara();
  ok("SFX taramasi WAV ve MP3 dosyalarini derinden buluyor", ctx.KSfx.sayisi() === 2, ctx.KSfx.sayisi());

  var host = fs.readFileSync(KOKYOL + "jsx/host.jsx", "utf8");
  ok("SFX playhead koprusu var", /function KS_insertSfx\(/.test(host));
  ok("SFX bos audio katmanini tum sure icin kontrol ediyor",
    /KS_findFreeAudioTrack\(seq, start, start \+ dur\)/.test(host));
  ok("SFX yerlestirme guvenli ortak makineyi kullaniyor",
    /KS_tryPlace\(seq\.audioTracks\[idx\], item, start\)/.test(host));

  var html = fs.readFileSync(KOKYOL + "index.html", "utf8");
  ok("SFX Pro sekmesi ve betigi yuklu",
    /id="tab-sfx"/.test(html) && /src="js\/sfx\.js"/.test(html));

  var pro = fs.readFileSync(KOKYOL + "js/pro.js", "utf8");
  ok("SFX lisans kapisinda Pro ozelligi", /sfx:\s*'SFX kutuphanesi/.test(pro));

  console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(kaldi ? 1 : 0);
}

run().catch(function (e) {
  console.log("FAIL test kosumu   [" + (e && e.stack ? e.stack : e) + "]");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
