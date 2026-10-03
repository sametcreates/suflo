// Suflo testi: ses.js'in GERCEK iyilestirme akisi — gecikme olcumu + telafi, cikti WAV senkron,
// kanal sayisi, KS_placeCleanAudio argumanlari, ses akisi olmayan klipte anlasilir hata
var fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm"), cp = require("child_process");
var A = require(path.join(__dirname, "..", "js", "audio-clean.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 220) + "]" : "")); }
var ff = null;
try { cp.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); ff = "ffmpeg"; } catch (e) {}
if (!ff) { console.log("ATLA: ffmpeg yok"); console.log("0/0 gecti"); process.exit(0); }

var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ses-uc-"));
var tmp = path.join(kok, "tmp"), srt = path.join(kok, "çıktı #2");
fs.mkdirSync(tmp); fs.mkdirSync(srt);
// 5.1 kaynak: 3 sn'de tik sesi (senkron olcumu icin) + gurultu
var kaynak = path.join(kok, "kamera 5.1.mov");
cp.execFileSync(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=d=8:s=320x240",
  "-f", "lavfi", "-i", "aevalsrc='0.3*sin(2*PI*(200+150*t)*t)*(0.5+0.5*sin(2*PI*2*t))':d=8:s=48000",
  "-filter_complex", "[1]pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0[a]", "-map", "0:v", "-map", "[a]", "-c:v", "mpeg4", "-c:a", "pcm_s16le", kaynak]);
var sessiz = path.join(kok, "sessiz.mp4");
cp.execFileSync(ff, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=d=3:s=160x120", "-c:v", "mpeg4", sessiz]);

var cagrilar = [], DOM = {}, secili = null;
function elem(id, v) { DOM[id] = { id: id, value: v, hidden: true, disabled: false, textContent: "", className: "", src: "", addEventListener: function () {} }; }
["ses-status", "ses-olc", "ses-go", "ses-audio", "ses-card"].forEach(function (id) { elem(id); });
elem("ses-hedef", "youtube"); elem("ses-guc", "standart");
var K = {
  fs: fs, path: path, log: function () {}, tmpDir: function () { return tmp; }, srtDir: function () { return srt; },
  findFfmpeg: function () { return Promise.resolve(ff); },
  hataYardimi: function (e) { return e && e.message ? e.message : String(e); },
  run: function (exe, args, o) {
    return new Promise(function (res) {
      cp.execFile(exe, args, { cwd: o && o.cwd, maxBuffer: 1 << 26 }, function (err, so, se) { res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout: so, stderr: se }); });
    });
  },
  call: function (fn, arg) {
    cagrilar.push({ fn: fn, arg: arg });
    if (fn === "KS_getSelectedClips") return Promise.resolve({ ok: true, clips: [secili] });
    if (fn === "KS_placeCleanAudio") return Promise.resolve({ ok: true, trackName: "A3", disabled: 1, skipped: 0 });
    return Promise.resolve({ ok: false });
  }
};
var ctx = { window: {}, document: { getElementById: function (id) { return DOM[id] || null; } }, K: K,
  KApp: { ctx: function () { return { sel: secili }; }, toast: function () {}, onContext: function () {} }, Pro: { gate: function () { return true; } },
  encodeURI: encodeURI, Date: Date, Math: Math, String: String, Number: Number, Object: Object, Promise: Promise, Error: Error,
  isFinite: isFinite, Float32Array: Float32Array };
ctx.window.SufloAudioClean = A;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "ses.js"), "utf8"), ctx);
// iyilestir disariya acik degil: init'in bagladigi tiklamayi yakala
var tik = {};
DOM["ses-go"].addEventListener = function (ev, fn) { tik.go = fn; };
DOM["ses-olc"].addEventListener = function (ev, fn) { tik.olc = fn; };
ctx.window.KSes.init();

function bekle() { return new Promise(function (r) { var t = setInterval(function () { if (!/ölçülüyor|temizleniyor|yerleştiriliyor/i.test(DOM["ses-status"].textContent)) { clearInterval(t); r(); } }, 50); }); }
function f32(file) {
  var b = cp.execFileSync(ff, ["-v", "error", "-i", file, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], { maxBuffer: 1 << 26 });
  var a = new Float32Array(b.length / 4); for (var i = 0; i < a.length; i++) a[i] = b.readFloatLE(i * 4); return a;
}

(async function () {
  // klip: kaynagin 2..6 sn'si, timeline 10..14
  secili = { name: "kamera 5.1", mediaPath: kaynak, clipStart: 10, clipEnd: 14, inPoint: 2, outPoint: 6 };
  await tik.go(); await bekle();
  var yer = cagrilar.filter(function (c) { return c.fn === "KS_placeCleanAudio"; })[0];
  ok("iyilestir tamamlandi", yer && /Bitti/.test(DOM["ses-status"].textContent), DOM["ses-status"].textContent);
  if (yer) {
    ok("KS_placeCleanAudio: klip araligi, kaynak hizasi, tek akista orijinal kapatilir", yer.arg.start === 10 && yer.arg.end === 14 && yer.arg.inPoint === 2 && yer.arg.disableOriginal === true, JSON.stringify(yer.arg));
    var w = yer.arg.path;
    var pr = JSON.parse(cp.execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=channels,sample_rate:format=duration", "-of", "json", w]).toString());
    ok("cikti: 5.1 kaynak -> stereo, 48 kHz, tam 4 sn", pr.streams[0].channels === 2 && pr.streams[0].sample_rate === "48000" && Math.abs(Number(pr.format.duration) - 4) < 0.002, JSON.stringify(pr));
    var ref = f32(kaynak).subarray(2 * 8000, 6 * 8000), out = f32(w);
    var lag = A.measureLag(ref, out, 8000, 100);
    ok("senkron: temiz ses kaynakla hizali (< 1 ms)", Math.abs(lag) < 0.001, (lag * 1000).toFixed(2) + " ms");
    ok("cikti bosluk/Turkce/# iceren klasorde", w.indexOf(srt) === 0 && fs.existsSync(w));
  }
  // ses akisi olmayan klip
  secili = { name: "sessiz", mediaPath: sessiz, clipStart: 0, clipEnd: 3, inPoint: 0, outPoint: 3 };
  await tik.go(); await bekle();
  ok("sessiz klipte anlasilir hata", /Bu klipte ses yok/.test(DOM["ses-status"].textContent), DOM["ses-status"].textContent);
  ok("gecici probe dosyalari kalmadi", fs.readdirSync(tmp).length === 0, fs.readdirSync(tmp).join(","));
  try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + e.stack); process.exit(1); });
