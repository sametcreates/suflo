// Suflo testi: js/scenes.js (sahne algilama) + host KS_splitSelectedAt (sahte Premiere/QE ile)
var fs = require("fs"), path = require("path"), vm = require("vm"), cp = require("child_process"), os = require("os");
var ROOT = path.join(__dirname, "..");
var S = require(path.join(ROOT, "js", "scenes.js"));

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : ""));
}

/* ---- saf modul ---- */
var ornek = [
  "[Parsed_showinfo_2 @ 0x1] config in time_base: 1/12800, frame_rate: 25/1",
  "[Parsed_showinfo_2 @ 0x1] n:   0 pts:  25600 pts_time:2       duration:    512 ...",
  "[Parsed_showinfo_2 @ 0x1] n:   1 pts:  26112 pts_time:2.04    duration:    512 ...",
  "[Parsed_showinfo_2 @ 0x1] n:   2 pts:  64000 pts_time:5       duration:    512 ...",
  "baska satir pts_time:9"
].join("\n");
var p = S.parse(ornek);
ok("parse: yalniz showinfo satirlari", p.length === 3 && p[0].t === 2 && p[2].t === 5, JSON.stringify(p));
var c = S.clean(p, { minGap: 1, dur: 7.5 });
ok("clean: 0.04 sn arayla iki degisim tek sahne", c.length === 2 && c[0].t === 2 && c[1].t === 5, JSON.stringify(c));
ok("clean: sona cok yakin degisim atilir", S.clean([{ t: 7.3 }], { minGap: 1, dur: 7.5 }).length === 0);
ok("clean: basa cok yakin degisim atilir", S.clean([{ t: 0.2 }], { minGap: 1 }).length === 0);
var sq = S.toSequence([{ t: 2 }, { t: 5 }], { clipStart: 10, clipEnd: 15, dur: 10 });
ok("toSequence: %200 hizli klipte zaman yariya iner", sq.length === 2 && sq[0].t === 11 && sq[1].t === 12.5, JSON.stringify(sq));
ok("toSequence: klip disi atilir", S.toSequence([{ t: 20 }], { clipStart: 0, clipEnd: 5, dur: 5 }).length === 0);
ok("esik: hassasiyet adlari ve sinir", S.esik("yuksek") < S.esik("dusuk") && S.esik(5) === 0.9);
var args = S.ffmpegArgs("a b.mp4", { ss: 3, t: 4, hassasiyet: "orta" });
ok("ffmpegArgs: -ss/-t girdiden once, yol tek arguman", args.indexOf("-ss") < args.indexOf("-i") && args[args.indexOf("-i") + 1] === "a b.mp4");

/* ---- gercek ffmpeg (varsa) ---- */
var ff = !cp.spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error;
if (ff) {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-sahne-"));
  var vid = path.join(tmp, "sahne.mp4");
  cp.spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=320x180:d=2:r=25",
    "-f", "lavfi", "-i", "testsrc=s=320x180:d=3:r=25", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=2.5:r=25",
    "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", "-pix_fmt", "yuv420p", vid]);
  var r = cp.spawnSync("ffmpeg", S.ffmpegArgs(vid, {}), { encoding: "utf8" });
  var bulunan = S.clean(S.parse(r.stderr), { dur: 7.5 }).map(function (x) { return x.t; });
  ok("gercek video: 2. ve 5. saniyede sahne degisimi", JSON.stringify(bulunan) === "[2,5]", JSON.stringify(bulunan));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
} else {
  console.log("ATLA gercek video testi (ffmpeg yok)");
}

/* ---- host: KS_splitSelectedAt ---- */
function list(items) { var o = { numItems: items.length }; items.forEach(function (x, i) { o[i] = x; }); return o; }
function tracks(arr) { var o = arr.map(function (cl) { return { clips: list(cl) }; }); var t = {}; o.forEach(function (x, i) { t[i] = x; }); t.numTracks = o.length; return t; }
var V = { start: { seconds: 10 }, end: { seconds: 20 }, nodeId: "v1" };
var A = { start: { seconds: 10 }, end: { seconds: 20 }, nodeId: "a1" };
var MUZIK = { start: { seconds: 0 }, end: { seconds: 60 }, nodeId: "m" };
var razor = [], markers = [], secim = [V, A];
var sequence = {
  timebase: "10160640000", videoTracks: tracks([[], [V]]), audioTracks: tracks([[A], [MUZIK]]),
  getSelection: function () { return secim; },
  getSettings: function () { return { videoDisplayFormat: 0 }; },
  markers: { createMarker: function (t) { var m = { t: t }; markers.push(m); return m; } }
};
function FakeTime() { this.seconds = 0; this.ticks = "0"; }
FakeTime.prototype.getFormatted = function () { return "TC" + this.seconds; };
var qseq = {
  getVideoTrackAt: function (i) { return { razor: function (tc) { razor.push("V" + i + "@" + tc); } }; },
  getAudioTrackAt: function (i) { return { razor: function (tc) { razor.push("A" + i + "@" + tc); } }; }
};
var ctx = {
  app: { project: { activeSequence: sequence }, enableQE: function () {} },
  qe: { project: { getActiveSequence: function () { return qseq; } } },
  Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
  isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, File: function () {}, Folder: function () {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), ctx, { filename: "jsx/host.jsx" });
function bol(arg) { return JSON.parse(ctx.KS_splitSelectedAt(encodeURIComponent(JSON.stringify(arg)))); }

var b = bol({ times: [5, 12, 15, 25], markers: true, name: "Sahne" });
ok("split: yalniz klip icindeki anlar (12, 15)", b.ok && b.cuts === 2, JSON.stringify(b));
ok("split: yalniz secili video V2 ve bagli ses A1 kesildi, muzik (A2) degil",
  JSON.stringify(razor.sort()) === JSON.stringify(["A0@TC12", "A0@TC15", "V1@TC12", "V1@TC15"]), JSON.stringify(razor));
ok("split: istege bagli marker", markers.length === 2 && markers[0].name === "Sahne", JSON.stringify(markers));
secim = [];
ok("split: secim yoksa anlasilir hata", /sec/.test(bol({ times: [12] }).error));
secim = [V];
ok("split: klip disi anlar hata verir", bol({ times: [1, 30] }).ok === false);

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
