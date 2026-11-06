// Suflo test yardımcısı: gerçek ffmpeg çalıştıran küçük K (bridge.js K.run'ın node karşılığı).
// cwd, timeout, onStdout (akan stdout), iptal (bridge iptalJetonu arayüzü: süreç SIGKILL ile öldürülür,
// { code: -2, iptal: true } döner). Açılan her süreç K.surecler'de: testler hepsinin kapandığını denetler.
// "_" ile başladığı için tools/test.js bunu test diye koşmaz.
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");

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
        var c = cp.spawn(exe, args, { cwd: opt.cwd });
        K.surecler.push(c);
        var out = "", err = "", bitti = false, birak = null;
        function kapat(r) { if (bitti) return; bitti = true; clearTimeout(t); if (birak) birak(); res(r); }
        var t = setTimeout(function () { try { c.kill("SIGKILL"); } catch (e) {} kapat({ code: -1, stdout: out, stderr: err + "\n[zaman aşımı]" }); }, opt.timeout || 300000);
        if (j) birak = j.dinle(function () { try { c.kill("SIGKILL"); } catch (e) {} kapat({ code: -2, iptal: true, stdout: out, stderr: err }); });
        c.stdout.setEncoding("utf8"); c.stderr.setEncoding("utf8");
        c.stdout.on("data", function (d) { out += d; if (opt.onStdout && !bitti) opt.onStdout(d); });
        c.stderr.on("data", function (d) { err += d; });
        c.on("error", function (e) { err += String(e); kapat({ code: -1, stdout: out, stderr: err }); });
        c.on("close", function (code) { kapat({ code: code, stdout: out, stderr: err }); });
      });
    }
  };
  return K;
};

// Bütün süreçler kapandı mı (iptal sonrası zombi / yetim ffmpeg kalmasın)
module.exports.hepsiKapandi = function (K, ms) {
  var son = Date.now() + (ms || 3000);
  return new Promise(function (res) {
    (function bak() {
      var acik = K.surecler.filter(function (c) { return c.exitCode === null && c.signalCode === null; });
      if (!acik.length || Date.now() > son) { res(acik.length === 0); return; }
      setTimeout(bak, 50);
    })();
  });
};
