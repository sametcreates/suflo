// Suflo test yardımcısı: gerçek ffmpeg çalıştıran küçük K (bridge.js K.run'ın node karşılığı).
// cwd, timeout, onStdout (akan stdout), iptal (bridge iptalJetonu arayüzü: süreç AĞACI öldürülür,
// { code: -2, iptal: true } süreç gerçekten kapanınca döner — bridge.js gibi). Açılan her süreç K.surecler'de:
// testler hepsinin kapandığını denetler. "_" ile başladığı için tools/test.js bunu test diye koşmaz.
//
// Windows'un iki farkı burada da gözetilir (CI: windows-latest, ffmpeg Chocolatey'den):
//  - PATH'teki ffmpeg.exe çoğu zaman bir shim'dir (asıl ffmpeg.exe'yi alt süreç olarak açar). child.kill
//    (TerminateProcess) yalnız shim'i öldürür; asıl ffmpeg çizmeye, dosyaları kilitlemeye ve stdout borusunu açık
//    tutmaya (node süreci kapanamaz) devam eder. Bu yüzden ağaç öldürülür: Windows'ta taskkill /T /F (bridge.js
//    surecAgaciniOldur ile aynı), macOS / Linux'ta süreç kendi grubunda açılır ve grup öldürülür.
//  - Açık dosya / çalışma klasörü süreç kapanmadan silinemez (EBUSY). o.windowsKilidi: K.fs bunu Linux / macOS'ta da
//    taklit eder: kapanmamış ("close" gelmemiş) bir sürecin çalışma klasöründeki yol silinemez. Böylece "iptalden
//    sonra geçici klasör silindi" denetimi her işletim sisteminde Windows kadar sıkıdır.
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var WIN = process.platform === "win32";
var KAPANIS_MS = 3000;   // bridge.js IPTAL_KAPANIS_MS

function agaciOldur(c) {
  if (!c || !c.pid) return;
  if (WIN) {
    try {
      cp.execFile("taskkill", ["/pid", String(c.pid), "/T", "/F"], { windowsHide: true }, function (e) { if (e) { try { c.kill(); } catch (e2) {} } });
      return;
    } catch (e3) {}
  } else {
    try { process.kill(-c.pid, "SIGKILL"); return; } catch (e4) {}   // detached: süreç grubu (sarmalayıcı + asıl ffmpeg)
  }
  try { c.kill("SIGKILL"); } catch (e5) {}
}

// Süreç kapanınca (stdio'yu tutan bütün süreçler bitti) fn; gelmezse en geç KAPANIS_MS sonra
function kapanincaCagir(c, fn) {
  var bitti = false, t = null;
  function cagir() { if (bitti) return; bitti = true; if (t) clearTimeout(t); fn(); }
  if (c.suflo_kapandi) { cagir(); return; }
  c.once("suflo-kapandi", cagir);
  t = setTimeout(cagir, KAPANIS_MS);
}

function kilitliFs(K) {
  function kilitli(p) {
    var a = path.resolve(String(p));
    return K.surecler.some(function (c) {
      if (c.suflo_kapandi || !c.suflo_cwd) return false;
      var d = path.resolve(c.suflo_cwd);
      return a === d || a.indexOf(d + path.sep) === 0;
    });
  }
  function sar(ad) {
    return function (p) {
      if (kilitli(p)) {
        var e = new Error("EBUSY: resource busy or locked, " + ad + " '" + p + "' (Windows kilidi taklidi: süreç kapanmadı)");
        e.code = "EBUSY";
        throw e;
      }
      return fs[ad].apply(fs, arguments);
    };
  }
  var k = Object.create(fs);
  ["unlinkSync", "rmdirSync", "rmSync", "renameSync"].forEach(function (ad) { k[ad] = sar(ad); });
  return k;
}

module.exports = function gercekK(o) {
  o = o || {};
  var K = {
    fs: fs, path: path, os: o.os || os, surecler: [], loglar: [],
    log: function (m) { K.loglar.push(String(m)); },
    tmpDir: function () { return o.tmp; }, srtDir: function () { return o.srt; },
    extensionPath: function () { return path.join(__dirname, ".."); },
    findFfmpeg: function () { return Promise.resolve(o.ff || "ffmpeg"); },
    iptalHatasi: function (m) { var e = new Error(m || "İptal edildi"); e.iptal = true; return e; },
    run: function (exe, args, opt) {
      opt = opt || {};
      if (o.runSar) { var s = o.runSar(exe, args, opt); if (s) return s; }
      return new Promise(function (res) {
        var j = opt.iptal && typeof opt.iptal.dinle === "function" ? opt.iptal : null;
        if (j && j.iptalEdildi) { res({ code: -2, iptal: true, stdout: "", stderr: "" }); return; }
        var c = cp.spawn(exe, args, { cwd: opt.cwd, windowsHide: true, detached: !WIN });
        c.suflo_cwd = opt.cwd || process.cwd();
        K.surecler.push(c);
        var out = "", err = "", bitti = false, birak = null;
        function kapat(r, bekle) {
          if (bitti) return;
          bitti = true; clearTimeout(t); if (birak) birak();
          if (bekle) kapanincaCagir(c, function () { res(r); }); else res(r);
        }
        var t = setTimeout(function () { agaciOldur(c); kapat({ code: -1, stdout: out, stderr: err + "\n[zaman aşımı]" }, true); }, opt.timeout || 300000);
        if (j) birak = j.dinle(function () { agaciOldur(c); kapat({ code: -2, iptal: true, stdout: out, stderr: err }, true); });
        c.stdout.setEncoding("utf8"); c.stderr.setEncoding("utf8");
        c.stdout.on("data", function (d) { out += d; if (opt.onStdout && !bitti) opt.onStdout(d); });
        c.stderr.on("data", function (d) { err += d; });
        function kapandi() { if (c.suflo_kapandi) return; c.suflo_kapandi = true; c.emit("suflo-kapandi"); }
        c.on("error", function (e) { err += String(e); kapandi(); kapat({ code: -1, stdout: out, stderr: err }); });
        c.on("close", function (code) { kapandi(); kapat({ code: code, stdout: out, stderr: err }); });
      });
    }
  };
  if (o.windowsKilidi) K.fs = kilitliFs(K);
  return K;
};

module.exports.agaciOldur = agaciOldur;
module.exports.kapanincaCagir = kapanincaCagir;

// Bütün süreçler kapandı mı (iptal sonrası zombi / yetim ffmpeg kalmasın). "close": süreç ve stdio'sunu devralan
// alt süreçleri (shim'in asıl ffmpeg'i) bitti; yalnız exitCode'a bakmak öldürülen shim'i "kapandı" sayardı.
module.exports.hepsiKapandi = function (K, ms) {
  var son = Date.now() + (ms || 3000);
  return new Promise(function (res) {
    (function bak() {
      var acik = K.surecler.filter(function (c) { return !c.suflo_kapandi; });
      if (!acik.length || Date.now() > son) { res(acik.length === 0); return; }
      setTimeout(bak, 50);
    })();
  });
};
