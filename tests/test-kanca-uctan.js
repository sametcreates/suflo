// Suflo testi: kanca.js'in GERCEK ekleme akisi — panelin kurdugu ffmpeg komutu seffaf .mov uretir,
// KS_placeOverlay'e dogru argumanlar gider, gecici klasor temizlenir (sahte K + gercek ffmpeg)
var fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm"), cp = require("child_process");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 220) + "]" : "")); }
var ff = null;
try { cp.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); ff = "ffmpeg"; } catch (e) {}
if (!ff) { console.log("ATLA: ffmpeg yok"); console.log("0/0 gecti"); process.exit(0); }

var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-kanca-uc-"));
var tmp = path.join(kok, "tmp"), srt = path.join(kok, "srt dir #1");   // bosluk ve # iceren yol
fs.mkdirSync(tmp); fs.mkdirSync(srt);
var cagrilar = [], toastlar = [];
var DOM = {};
function elem(id, v) { DOM[id] = { id: id, value: v, hidden: true, disabled: false, textContent: "", className: "", addEventListener: function () {} }; }
elem("kanca-metin", "Bunu bilmeden *para* biriktirme"); elem("kanca-stil", "kutu"); elem("kanca-sure", "2"); elem("kanca-konum", "ust");
elem("kanca-renk", "#ffe600"); elem("kanca-durum"); elem("kanca-ekle"); elem("kanca-resim"); elem("tab-kanca");
var K = {
  fs: fs, path: path, log: function () {},
  tmpDir: function () { return tmp; }, srtDir: function () { return srt; },
  extensionPath: function () { return path.join(__dirname, ".."); },
  findFfmpeg: function () { return Promise.resolve(ff); },
  hataYardimi: function (e) { return e && e.message ? e.message : String(e); },
  run: function (exe, args, o) {
    return new Promise(function (res) {
      cp.execFile(exe, args, { cwd: o && o.cwd, maxBuffer: 1 << 26 }, function (err, so, se) { res({ code: err ? (err.code || 1) : 0, stdout: so, stderr: se }); });
    });
  },
  call: function (fn, arg) {
    cagrilar.push({ fn: fn, arg: arg });
    if (fn === "KS_overlaySpec") return Promise.resolve({ ok: true, width: 541, height: 960, fps: 25 });   // tek genislik: cift'e yuvarlanmali
    if (fn === "KS_placeOverlay") return Promise.resolve({ ok: true, trackName: "V3", newTrack: false });
    return Promise.resolve({ ok: false });
  }
};
var ctx = { window: {}, document: { getElementById: function (id) { return DOM[id] || null; } }, K: K,
  KApp: { toast: function (m, c) { toastlar.push([m, c]); } }, Pro: { gate: function () { return true; } },
  decodeURI: decodeURI, Date: Date, Math: Math, String: String, Number: Number, Object: Object, Promise: Promise, Error: Error, isFinite: isFinite };
ctx.window.SufloHookTitle = require(path.join(__dirname, "..", "js", "hook-title.js"));
ctx.window.SufloOverlayRender = require(path.join(__dirname, "..", "js", "overlay-render.js"));   // ekleme ortak render'dan
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "kanca.js"), "utf8"), ctx);

ctx.window.KKanca.ekle({ at: 12.5 }).then(function (sonuc) {
  ok("ekle basarili doner ({ ok, yer, dur }: eski cagiranlar icin truthy)", !!sonuc && sonuc.ok === true && sonuc.yer && sonuc.yer.trackName === "V3" && sonuc.dur === 2,
    JSON.stringify(sonuc) + " " + JSON.stringify(toastlar));
  var yer = cagrilar.filter(function (c) { return c.fn === "KS_placeOverlay"; })[0];
  ok("KS_placeOverlay: verilen an ve ad", yer && yer.arg.at === 12.5 && /^Suflo Kanca · Bunu bilmeden para/.test(yer.arg.name), yer && JSON.stringify(yer.arg));
  var mov = yer && yer.arg.path;
  ok("cikti .mov bosluk/# iceren klasorde olustu", mov && fs.existsSync(mov) && mov.indexOf(srt) === 0, mov);
  if (mov && fs.existsSync(mov)) {
    var p = cp.execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,pix_fmt:format=duration", "-of", "json", mov]).toString();
    var j = JSON.parse(p), st = j.streams[0];
    ok("qtrle, alfa kanalli, cift boyut (541 -> 542)", st.codec_name === "qtrle" && /a/.test(st.pix_fmt) && st.width === 542 && st.height === 960, JSON.stringify(st));
    ok("sure = secilen 2 sn", Math.abs(Number(j.format.duration) - 2) < 0.1, j.format.duration);
    var raw = cp.execFileSync(ff, ["-v", "error", "-ss", "1", "-i", mov, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 26 });
    var opak = 0, seffaf = 0;
    for (var i = 3; i < raw.length; i += 4) { if (raw[i] > 200) opak++; else if (raw[i] < 10) seffaf++; }
    ok("kare: baslik opak, zemin seffaf", opak > 5000 && seffaf > raw.length / 4 * 0.7, "opak " + opak + " seffaf " + seffaf);
  }
  // Shorts paketi secenekleri: stil / sure / an / beklenen sekans / ad, sessiz
  var toastOnce = toastlar.length;
  return ctx.window.KKanca.ekle({ text: "Paket *kanca*", at: 0, stil: "sade", dur: 1.5, expectSeqId: "dik9", ad: "Suflo Paket · Kanca", sessiz: true }).then(function (r2) {
    var yer2 = cagrilar.filter(function (c) { return c.fn === "KS_placeOverlay"; }).pop();
    ok("ekle: expectSeqId ve ad KS_placeOverlay'e gecer, an 0", r2 && r2.ok && yer2.arg.expectSeqId === "dik9" && yer2.arg.name === "Suflo Paket · Kanca" && yer2.arg.at === 0,
      JSON.stringify(yer2 && yer2.arg));
    ok("ekle: secilen sure kullanilir, sessizde bildirim yok", r2.dur === 1.5 && toastlar.length === toastOnce, JSON.stringify(r2) + " " + JSON.stringify(toastlar.slice(toastOnce)));
    var eskiCall = K.call;
    K.call = function (fn, arg) {
      if (fn === "KS_placeOverlay") return Promise.resolve({ ok: false, error: "Etkin sekans degisti; katman konmadi." });
      return eskiCall(fn, arg);
    };
    return ctx.window.KKanca.ekle({ text: "x", at: 0, expectSeqId: "baska", sessiz: true }).then(function (r3) {
      ok("ekle sessiz hata: { ok: false, hata } doner, bildirim yok", r3 && r3.ok === false && /Etkin sekans degisti/.test(r3.hata) && toastlar.length === toastOnce, JSON.stringify(r3));
      return ctx.window.KKanca.ekle({ text: "x", at: 0, expectSeqId: "baska" });
    }).then(function (r4) {
      ok("ekle sessiz degilken hata: eskisi gibi false ve bildirim", r4 === false && toastlar.length === toastOnce + 1);
      K.call = eskiCall;
    });
  }).then(function () {
  return ctx.window.KKanca.onizle(); }).then(function () {
    var img = DOM["kanca-resim"];
    ok("onizleme: dikey sekansta PNG uretildi (guvenli alanla)", img.hidden === false && /^data:image\/png;base64,/.test(img.src || "") && (img.src || "").length > 2000, (img.src || "").slice(0, 40));
  }).then(function () {
  var kalan = fs.readdirSync(tmp);
  ok("gecici overlay-kanca klasoru temizlendi", kalan.length === 0, kalan.join(","));
  try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
  });
}).catch(function (e) { console.log("FAIL istisna " + e.stack); process.exit(1); });
