// Suflo testi: kanca basligi — js/hook-title.js (ASS), libass render, host KS_placeOverlay "at"
var fs = require("fs"), path = require("path"), vm = require("vm"), os = require("os"), cp = require("child_process");
var HT = require(path.join(__dirname, "..", "js", "hook-title.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

var metin = "Bunu bilmeden *para* biriktirmeye başlama";
var boyutlar = [[1920, 1080], [1080, 1920]];
HT.list().forEach(function (s) {
  boyutlar.forEach(function (b) {
    var r = HT.build({ text: metin, stil: s.id, width: b[0], height: b[1], dur: 3 });
    var ad = s.id + " " + b[0] + "x" + b[1];
    ok(ad + ": yildiz sizmaz", !/\*/.test(r.ass));
    ok(ad + ": PlayRes sekans boyutunda", r.ass.indexOf("PlayResX: " + b[0]) !== -1 && r.ass.indexOf("PlayResY: " + b[1]) !== -1);
    ok(ad + ": en fazla 3 satir", r.satir >= 1 && r.satir <= 3, r.satir);
    ok(ad + ": tum olaylar sure icinde", r.ass.split("\n").filter(function (l) { return /^Dialogue/.test(l); }).every(function (l) {
      return /,0:00:0[0-3]\.\d\d,Kanca,/.test(l);
    }));
    ok(ad + ": font dosyasi paketle gelir", r.fontFiles.every(function (f) { return fs.existsSync(path.join(__dirname, "..", "fonts", f)); }), r.fontFiles);
  });
});
var toks = HT.tokens("*iki kelime* sonra *tek*.");
ok("tokens: aralik ve noktalama", JSON.stringify(toks) === JSON.stringify([{ w: "iki", v: true }, { w: "kelime", v: true }, { w: "sonra", v: false }, { w: "tek.", v: true }]), JSON.stringify(toks));
ok("bos metin hata verir", (function () { try { HT.build({ text: "  " }); return false; } catch (e) { return true; } })());
ok("ASS kacisi: suslu parantez metni komut olmaz", HT.build({ text: "a {\\b1} b" }).ass.indexOf("{\\b1}") === -1);
ok("buyuk harf Turkce: i -> İ", HT.build({ text: "bilgi", stil: "kutu" }).ass.indexOf("BİLGİ") !== -1);
var uzun = HT.build({ text: "çok çok uzun bir başlık metni burada kadraja sığmalı ve taşmamalı tamam mı", stil: "sade", width: 1080, height: 1920 });
var fsz = Number(/Style: Kanca,[^,]+,(\d+)/.exec(uzun.ass)[1]);
ok("uzun metinde font kuculur (dikey)", fsz < Math.round(92 * 1080 / 1080), fsz);
var satirlar = HT.satirlar(HT.tokens("a b c d e f g h"), 4);
ok("satirlar: kelime kaybi yok", satirlar.reduce(function (n, l) { return n + l.length; }, 0) === 8 && satirlar.length <= 3);

// libass ile gercek render: seffaf zeminde opak piksel var mi
var ff = null;
try { cp.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); ff = "ffmpeg"; } catch (e) {}
if (ff) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-kanca-"));
  var built = HT.build({ text: metin, stil: "kutu", width: 640, height: 360, dur: 2 });
  fs.writeFileSync(path.join(dir, "kanca.ass"), built.ass);
  built.fontFiles.forEach(function (f) { fs.copyFileSync(path.join(__dirname, "..", "fonts", f), path.join(dir, f)); });
  try {
    var raw = cp.execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", "color=c=black@0.0:s=640x360:r=10:d=2,format=rgba,subtitles=f=kanca.ass:alpha=1:fontsdir=.",
      "-ss", "1", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { cwd: dir, maxBuffer: 1 << 24 });
    var opak = 0, sari = 0;
    for (var i = 0; i < raw.length; i += 4) {
      if (raw[i + 3] > 200) { opak++; if (raw[i] > 200 && raw[i + 1] > 180 && raw[i + 2] < 80) sari++; }
    }
    ok("render: seffaf zeminde baslik ciziliyor", opak > 2000, opak);
    ok("render: kutu vurgu renginde (sari)", sari > 1000, sari);
  } catch (eR) { ok("render calisti", false, eR.message); }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (eD) {}
} else {
  console.log("ATLA render: ffmpeg yok");
}

// host: KS_placeOverlay "at" parametresi
function FakeTime() { this.seconds = 0; }
var konan = [];
var seq = { getPlayerPosition: function () { var t = new FakeTime(); t.seconds = 42.5; return t; },
  getInPointAsTime: function () { var t = new FakeTime(); t.seconds = 10; return t; }, videoTracks: [{}, {}] };
var item = { name: "", setColorLabel: function () {}, getOutPoint: function () { return { seconds: 3 }; }, getInPoint: function () { return { seconds: 0 }; } };
var ctx = { app: { version: "25.0.0", project: { activeSequence: seq, importFiles: function () {}, rootItem: { findItemsMatchingMediaPath: function () { return [item]; } } } },
  Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, isFinite: isFinite, Math: Math,
  String: String, Number: Number, Error: Error, File: function () { this.exists = true; }, Folder: function () {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
ctx.KS_findBin = function () { return {}; };
ctx.KS_findFreeVideoTrack = function () { return 1; };
ctx.KS_tryPlace = function (track, it, startSec) { konan.push(startSec); return { start: { seconds: startSec }, end: { seconds: startSec + 3 }, nodeId: "n" }; };
function call(fn, arg) { return JSON.parse(ctx[fn](encodeURIComponent(JSON.stringify(arg)))); }
var r1 = call("KS_placeOverlay", { path: "/x/k.mov", at: "playhead", name: "k" });
ok("host: at=playhead oynatma kafasina koyar", r1.ok && konan[0] === 42.5, JSON.stringify(r1));
var r2 = call("KS_placeOverlay", { path: "/x/k.mov", at: 12.25, name: "k" });
ok("host: at=sayi o ana koyar", r2.ok && konan[1] === 12.25);
call("KS_placeOverlay", { path: "/x/k.mov", scope: "inout", name: "k" });
ok("host: at yoksa eski davranis (inout -> In noktasi)", konan[2] === 10);
call("KS_placeOverlay", { path: "/x/k.mov", at: -4, name: "k" });
ok("host: gecersiz at yok sayilir", konan[3] === 0);

// panel baglantilari
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
ok("index: sekme, betikler ve sol menu", /id="tab-kanca"/.test(html) && /js\/hook-title\.js/.test(html) && /js\/kanca\.js/.test(html) && /data-tab="kanca"/.test(html));
var kanca = fs.readFileSync(path.join(__dirname, "..", "js", "kanca.js"), "utf8");
ok("kanca.js: ekleme Pro kapili, onizleme degil", /async function ekle[\s\S]*?Pro\.gate\("overlay"\)/.test(kanca) && !/async function onizle\(\)[\s\S]*?Pro\.gate[\s\S]*?async function ekle/.test(kanca));
ok("kanca.js: gecici klasor sweepTemp onekiyle", /"overlay-kanca-"/.test(kanca));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
