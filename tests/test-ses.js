// Suflo testi: Sesi iyilestir — filtre zinciri, olcum, gecikme telafisi (gercek ffmpeg), host yerlestirme
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), vm = require("vm");
var A = require(path.join(__dirname, "..", "js", "audio-clean.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

var z = A.filterChain({});
ok("zincir: highpass, afftdn, kompresor, loudnorm -14, 48k", /^highpass=f=80,/.test(z) && /afftdn=/.test(z) && /loudnorm=I=-14:/.test(z) && /aresample=48000$/.test(z), z);
ok("zincir: podcast -16, guclu temizlik", /loudnorm=I=-16/.test(A.filterChain({ hedef: "podcast", guc: "guclu" })) && /nf=-30/.test(A.filterChain({ guc: "guclu" })));
ok("zincir: gurultu/normalize kapatilabilir", !/afftdn|loudnorm/.test(A.filterChain({ gurultu: false, normalize: false })));
var ornek = "[Parsed_ebur128_0 @ 0x1] t: 1.2 M: -30\n[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -26.3 LUFS\n    Threshold: -36.5 LUFS\n\n  Loudness range:\n    LRA:         6.1 LU\n\n  True peak:\n    Peak:        -3.2 dBFS\n";
var e = A.parseEbur128(ornek);
ok("ebur128 ozeti ayristirilir", e.I === -26.3 && e.LRA === 6.1 && e.peak === -3.2, JSON.stringify(e));
ok("ebur128: sessiz (-inf) -> null", A.parseEbur128("Summary:\n I: -inf LUFS").I === null);
ok("describe: kisik / iyi / yuksek", /kısık/.test(A.describe(-26.3, -14)) && /iyi/.test(A.describe(-14.5, -14)) && /yüksek/.test(A.describe(-8, -14)) && /^−26,3 LUFS/.test(A.describe(-26.3, -14)));
ok("clipCheck: hizli klip reddedilir", /Hız/.test(A.clipCheck({ mediaPath: "a", clipStart: 0, clipEnd: 5, inPoint: 0, outPoint: 10 })));
ok("clipCheck: normal klip gecer", A.clipCheck({ mediaPath: "a", clipStart: 10, clipEnd: 20, inPoint: 3, outPoint: 13 }) === "");
ok("clipCheck: secim yok", /seç/.test(A.clipCheck(null)));

// measureLag sentetik: 37 ornek gecikme
var sr = 8000, n = sr * 3, ref = new Float32Array(n), out = new Float32Array(n);
for (var i = 0; i < n; i++) ref[i] = Math.sin(2 * Math.PI * (200 + 150 * i / sr) * i / sr) * (0.5 + 0.5 * Math.sin(i / 700));
for (var j = 37; j < n; j++) out[j] = 0.7 * ref[j - 37];
ok("measureLag: 37 ornek gecikmeyi bulur", Math.abs(A.measureLag(ref, out, sr) - 37 / sr) < 1e-9, A.measureLag(ref, out, sr) * sr);
ok("compensate: kucuk/negatif gecikmede zincir ayni", A.compensate("x", 0) === "x" && A.compensate("x", -0.01) === "x");
ok("compensate: atrim + apad eklenir", A.compensate("x", 0.025) === "x,atrim=start=0.02500,asetpts=PTS-STARTPTS,apad");

// Gercek ffmpeg: kirli ses -> panelin zinciri (telafili) -> senkron + seviye
var ff = null;
try { cp.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); ff = "ffmpeg"; } catch (eF) {}
if (ff) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ses-"));
  function raw(args) {
    var b = cp.execFileSync(ff, ["-v", "error"].concat(args).concat(["-ar", "8000", "-ac", "1", "-f", "f32le", "-"]), { maxBuffer: 1 << 26 });
    var a = new Float32Array(b.length / 4); for (var k = 0; k < a.length; k++) a[k] = b.readFloatLE(k * 4); return a;
  }
  // probe ile gecikme (paneldeki yol)
  var zincir = A.filterChain({});
  var lag = A.measureLag(raw(["-f", "lavfi", "-i", A.PROBE_KAYNAK, "-t", "4"]), raw(["-f", "lavfi", "-i", A.PROBE_KAYNAK, "-af", zincir, "-t", "4"]), 8000, 300);
  ok("probe: gurultu azaltici gecikmesi olculdu (>0)", lag > 0.001, (lag * 1000).toFixed(1) + " ms");
  // konusma benzeri sinyal + pembe gurultu, 1.5 sn'den baslayan 10 sn'lik "klip"
  var src = path.join(dir, "kirli.wav");
  cp.execFileSync(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc='0.05*sin(2*PI*(180+120*t)*t)*(0.5+0.5*sin(2*PI*2.3*t))':d=14:s=48000",
    "-f", "lavfi", "-i", "anoisesrc=d=14:c=pink:a=0.004", "-filter_complex", "[0][1]amix=inputs=2:normalize=0", "-ar", "48000", src]);
  var cikti = path.join(dir, "temiz.wav");
  cp.execFileSync(ff, ["-v", "error", "-y", "-ss", "1.5", "-t", "10", "-i", src, "-vn", "-af", A.compensate(zincir, lag), "-t", "10", "-ar", "48000", "-c:a", "pcm_s16le", cikti]);
  var sure = Number(cp.execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", cikti]).toString());
  ok("cikti suresi klip suresiyle ayni (10 sn)", Math.abs(sure - 10) < 0.002, sure);
  var kaynak = raw(["-ss", "1.5", "-t", "10", "-i", src, "-af", "highpass=f=80"]);
  var temiz = raw(["-i", cikti]);
  var kalan = A.measureLag(kaynak, temiz, 8000, 100);
  ok("senkron: temiz ses kaynakla hizali (< 1 ms)", Math.abs(kalan) < 0.001, (kalan * 1000).toFixed(2) + " ms");
  var sonra = A.parseEbur128(cp.spawnSync(ff, ["-hide_banner", "-nostats", "-i", cikti, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr);
  ok("seviye: hedef -14 LUFS'a yakin", sonra.I !== null && Math.abs(sonra.I + 14) < 1.5, sonra.I);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (eD) {}
} else {
  console.log("ATLA ffmpeg testleri: ffmpeg yok");
}

// Host: KS_placeCleanAudio (sahte Premiere)
function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", { get: function () { return String(Math.round(this.seconds * 254016000000)); } });
function klip(media, a, b) { return { projectItem: { getMediaPath: function () { return media; } }, start: { seconds: a }, end: { seconds: b }, disabled: false }; }
function iz(clips) { var t = { clips: { numItems: clips.length }, isLocked: function () { return false; } }; clips.forEach(function (c, i) { t.clips[i] = c; }); return t; }
function hizali(media, a, b, srcIn) { var k = klip(media, a, b); k.inPoint = { seconds: srcIn }; return k; }
var orijinal = hizali("/v/a.mp4", 10, 20, 3), baska = hizali("/v/a.mp4", 40, 50, 33), muzik = hizali("/m/x.mp3", 0, 60, 0);
var jlKesim = hizali("/v/a.mp4", 10, 22, 3);          // ayni hiza ama secimden 2 sn uzun (L-cut)
var baskaAn = hizali("/v/a.mp4", 12, 18, 90);         // ayni dosyanin baska ani, ortusuyor
var A1 = iz([orijinal, baska]), A2 = iz([muzik]), A4 = iz([jlKesim]), A5 = iz([baskaAn]);
var seq = { audioTracks: { numTracks: 4, 0: A1, 1: A2, 2: A4, 3: A5 } };
var eklenenIz = 0, konan = null;
var item = { name: "" };
var ctx = { app: { project: { activeSequence: seq, importFiles: function () {}, rootItem: { children: { numItems: 0 }, createBin: function () { return {}; }, findItemsMatchingMediaPath: function () { return [item]; } } },
  enableQE: function () {} }, Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, isFinite: isFinite, Math: Math,
  String: String, Number: Number, Error: Error, File: function () { this.exists = true; }, Folder: function () {} };
ctx.qe = { project: { getActiveSequence: function () { return { addTracks: function () {
  eklenenIz++; var y = iz([]); seq.audioTracks[seq.audioTracks.numTracks] = y; seq.audioTracks.numTracks++; } }; } } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
ctx.KS_tryPlace = function (track, it, startSec) { var c = klip("/t/temiz.wav", startSec, startSec + 10); track.clips[track.clips.numItems] = c; track.clips.numItems++; konan = { track: track, start: startSec }; return c; };
function call(fn, arg) { return JSON.parse(ctx[fn](encodeURIComponent(JSON.stringify(arg)))); }
var r = call("KS_placeCleanAudio", { path: "/t/temiz.wav", start: 10, end: 20, inPoint: 3, mediaPath: "/v/a.mp4", name: "Suflo temiz" });
ok("host: dolu kanallarda yeni ses kanali acilir ve klibin basina konur", r.ok && eklenenIz === 1 && konan.start === 10 && r.trackName === "A5", JSON.stringify(r));
ok("host: yalniz ayni hizadaki, aralik icindeki orijinal kapatilir", orijinal.disabled === true && baska.disabled === false && muzik.disabled === false && r.disabled === 1);
ok("host: J/L kesim ve ayni dosyanin baska ani kapatilmaz, atlandi bildirilir", jlKesim.disabled === false && baskaAn.disabled === false && r.skipped === 2, JSON.stringify(r));
A2.isMuted = function () { return true; };
A2.clips.numItems = 0;   // bos ama sessiz kanal
var r2 = call("KS_placeCleanAudio", { path: "/t/temiz.wav", start: 100, end: 110, inPoint: 93, mediaPath: "/v/a.mp4", disableOriginal: false });
ok("host: sessize alinmis kanal atlanir", r2.ok && r2.trackName !== "A2", r2.trackName);
ok("host: gecersiz aralik reddedilir", call("KS_placeCleanAudio", { path: "/t/x.wav", start: 5, end: 5 }).ok === false);

var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var sesjs = fs.readFileSync(path.join(__dirname, "..", "js", "ses.js"), "utf8");
ok("panel: kart, betikler, Pro kapisi", /id="ses-card"/.test(html) && /js\/audio-clean\.js/.test(html) && /js\/ses\.js/.test(html) && /Pro\.gate\("audioclean"\)/.test(sesjs));
var spl = "  Stream #0:0: Video: h264, yuv420p, 1920x1080\n  Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp (default)\n  Stream #0:2: Audio: pcm_s24le, 48000 Hz, 4 channels, s32\n  Stream #0:3: Audio: ac3, 48000 Hz, 5.1(side), fltp";
ok("parseStreams: stereo / 4 kanal / 5.1", JSON.stringify(A.parseStreams(spl)) === JSON.stringify([{ sira: 0, kanal: 2 }, { sira: 1, kanal: 4 }, { sira: 2, kanal: 6 }]), JSON.stringify(A.parseStreams(spl)));
ok("parseStreams: sessiz video -> bos", A.parseStreams("  Stream #0:0: Video: h264").length === 0);
ok("outputChannels: mono kalir, cok kanal stereo", A.outputChannels(1) === 1 && A.outputChannels(6) === 2 && A.outputChannels(2) === 2);
ok("panel: ilk ses akisi ve sabit kanal; cok akista orijinal kapatilmaz; ses yoksa anlasilir hata",
  /"-map", "0:a:0", "-af", son/.test(sesjs) && /"-ac", String\(AC\.outputChannels/.test(sesjs) && /disableOriginal: ak\.length === 1/.test(sesjs) && /Bu klipte ses yok/.test(sesjs));
ok("panel: gecikme olculup telafi edilir, cikti -t ile kesilir", /AC\.compensate\(zincir, await gecikme\(ff, zincir\)\)/.test(sesjs) && /"-af", son, "-t", String\(dur\)/.test(sesjs));
ok("panel: coklu secimde tum uygun klipler, gecikme bir kez olculur", /KS_getSelectedClips/.test(sesjs) && /for \(var i = 0; i < uygun\.length; i\+\+\)/.test(sesjs) && (sesjs.match(/await gecikme\(/g) || []).length === 1);
ok("panel: yerlestirilemeyen dosya silinir, yerlesen silinmez", /finally \{\s*if \(!yerlesti\) \{ try \{ K\.fs\.unlinkSync\(cikti\)/.test(sesjs));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
