var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * Gerçek bridge.js'i VM'e yükleyip download() davranışını ölçer.
 * Senaryolar: 429/503/403 -> .part korunur; 416 -> silinip baştan; farklı key -> silinir;
 * bozuk content-range -> silinip baştan; başarılı devam -> bayt bayt doğru dosya.
 */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var vm = require("vm");
var http = require("http");

var SRC = KOKYOL + "js/bridge.js";
var TMP = pathm.join(os.tmpdir(), "suflo-dl-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

// --- sunucu: yol kodu davranışı belirler ---
var TOTAL = 1000000;
var REF = Buffer.alloc(TOTAL);
for (var i = 0; i < TOTAL; i++) REF[i] = i % 251;

var srv = http.createServer(function (req, res) {
  var mode = req.url.slice(1).split("?")[0];
  var range = req.headers.range;
  var start = 0;
  if (range) {
    var m = /bytes=(\d+)-/.exec(range);
    if (m) start = Number(m[1]);
  }
  if (/^\d+$/.test(mode)) {                      // düz hata kodu
    res.writeHead(Number(mode)); res.end("err"); return;
  }
  if (mode === "badrange") {                     // yanlış toplam bildiren 206 (yalnız Range varsa)
    if (range) {
      res.writeHead(206, {
        "content-length": String(TOTAL - start),
        "content-range": "bytes " + start + "-" + (TOTAL - 1) + "/" + (TOTAL + 12345)
      });
      res.end(REF.slice(start));
    } else {
      res.writeHead(200, { "content-length": String(TOTAL) });
      res.end(REF);
    }
    return;
  }
  if (mode === "ignorerange") {                  // Range'i yok sayıp 200 döner
    res.writeHead(200, { "content-length": String(TOTAL) });
    res.end(REF); return;
  }
  if (range && start > 0) {
    res.writeHead(206, {
      "content-length": String(TOTAL - start),
      "content-range": "bytes " + start + "-" + (TOTAL - 1) + "/" + TOTAL
    });
    res.end(REF.slice(start));
  } else {
    res.writeHead(200, { "content-length": String(TOTAL) });
    res.end(REF);
  }
});

function loadBridge() {
  var code = fs.readFileSync(SRC, "utf8");
  var sandbox = {
    window: {}, console: console, require: require, process: process,
    URL: URL, Promise: Promise, Buffer: Buffer, JSON: JSON, Math: Math, Date: Date,
    setTimeout: setTimeout, clearTimeout: clearTimeout, String: String, Number: Number,
    Object: Object, Array: Array, Error: Error, RegExp: RegExp, isFinite: isFinite,
    CSInterface: function () {
      return { getSystemPath: function () { return TMP; }, evalScript: function () {} };
    }
  };
  sandbox.CSInterface.SystemPath = { USER_DATA: "u", EXTENSION: "e" };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "bridge.js" });
  return sandbox.window.K;
}

var K = loadBridge();
var results = [];
function chk(ad, kosul, ek) {
  results.push((kosul ? "PASS" : "FAIL") + "  " + ad + (ek ? "   " + ek : ""));
}

function seed(dest, bytes, key) {
  fs.writeFileSync(dest + ".part", REF.slice(0, bytes));
  if (key) fs.writeFileSync(dest + ".part.json", JSON.stringify({ key: key, total: TOTAL }));
  else { try { fs.unlinkSync(dest + ".part.json"); } catch (e) {} }
}
function partBytes(dest) {
  try { return fs.statSync(dest + ".part").size; } catch (e) { return -1; }
}

async function main() {
  await new Promise(function (r) { srv.listen(0, r); });
  var port = srv.address().port;
  var base = "http://127.0.0.1:" + port + "/";

  // 1) gecici hatalarda .part KORUNUR
  for (var _i = 0; _i < 4; _i++) {
    var kod = [429, 503, 403, 404][_i];
    var d = pathm.join(TMP, "t" + kod + ".bin");
    seed(d, 900000, "model:x");
    var r = await K.download(base + kod, d, null, 0, undefined, { key: "model:x", expectedMB: 1 });
    chk("HTTP " + kod + " -> .part korunur", !r.ok && partBytes(d) === 900000,
      "kept=" + r.kept + " part=" + partBytes(d));
  }

  // 2) 416 -> silip bastan indir, dosya dogru
  var d416 = pathm.join(TMP, "t416.bin");
  seed(d416, 900000, "model:x");
  var r416 = await K.download(base + "416", d416, null, 0, undefined, { key: "model:x" });
  chk("HTTP 416 -> silip bastan (ok degil, .part yok)", !r416.ok && partBytes(d416) === -1,
    "err=" + r416.error);

  // 3) basarili devam: yalnizca kalan inmeli, dosya birebir
  var dOK = pathm.join(TMP, "resume.bin");
  seed(dOK, 900000, "model:x");
  var rOK = await K.download(base + "ok", dOK, null, 0, undefined, { key: "model:x" });
  var esit = rOK.ok && Buffer.compare(fs.readFileSync(dOK), REF) === 0;
  chk("206 devam -> dosya birebir dogru", esit, "bytes=" + rOK.bytes);
  chk("206 devam -> sidecar temizlendi", !fs.existsSync(dOK + ".part.json"));

  // 4) BASKA key'e ait .part -> silinir, bastan iner, dosya dogru
  var dKey = pathm.join(TMP, "mismatch.bin");
  seed(dKey, 900000, "motor:cuda");
  var rKey = await K.download(base + "ok", dKey, null, 0, undefined, { key: "motor:cpu" });
  chk("farkli key -> bastan indi, dosya dogru",
    rKey.ok && Buffer.compare(fs.readFileSync(dKey), REF) === 0);

  // 5) content-range toplami uyusmuyor -> silip bastan, dosya dogru
  var dBad = pathm.join(TMP, "badrange.bin");
  seed(dBad, 900000, "model:x");
  var rBad = await K.download(base + "badrange", dBad, null, 0, undefined, { key: "model:x" });
  chk("bozuk content-range -> bastan indi",
    rBad.ok && fs.statSync(dBad).size === TOTAL, "size=" + (rBad.ok ? fs.statSync(dBad).size : "-"));

  // 6) sunucu Range'i yok sayip 200 dondu -> truncate yolu bozulmamis
  var dIgn = pathm.join(TMP, "ignore.bin");
  seed(dIgn, 900000, "model:x");
  var rIgn = await K.download(base + "ignorerange", dIgn, null, 0, undefined, { key: "model:x" });
  chk("Range yok sayildi (200) -> dosya dogru",
    rIgn.ok && Buffer.compare(fs.readFileSync(dIgn), REF) === 0);

  // 7) proxy: loopback hedefi her zaman muaf (localhost'a proxy'den gitmek anlamsiz)
  process.env.HTTPS_PROXY = "127.0.0.1:1";       // semasiz, calismayan proxy
  var dNo = pathm.join(TMP, "noproxy.bin");
  var rNo = await K.download(base + "ok", dNo, null, 0, undefined, { key: "model:x" });
  chk("loopback hedef -> proxy atlanir, indirme calisir", rNo.ok, "err=" + (rNo.error || ""));
  delete process.env.HTTPS_PROXY;

  // 7b) http hedef + proxy -> absolute-URI forward-proxy istegi (yerel sunucu proxy taklidi)
  var gorulen = null;
  var pxy = http.createServer(function (rq, rs) {
    gorulen = rq.url;                             // absolute-URI bekleniyor
    rs.writeHead(200, { "content-length": String(TOTAL) });
    rs.end(REF);
  });
  await new Promise(function (r) { pxy.listen(0, r); });
  process.env.HTTPS_PROXY = "http://127.0.0.1:" + pxy.address().port;
  var dFwd = pathm.join(TMP, "fwd.bin");
  var rFwd = await K.download("http://ornek.gecersiz/ok", dFwd, null, 0, undefined, { key: "model:x" });
  chk("http hedef proxy -> absolute-URI ile gitti",
    rFwd.ok && gorulen === "http://ornek.gecersiz/ok", "url=" + gorulen);
  pxy.close();

  // 7c) https hedef + proxy -> CONNECT tuneli kurulur; reddedilirse hata yuzeye cikar
  var connectPath = null;
  var pxy2 = http.createServer(function (rq, rs) { rs.writeHead(400); rs.end(); });
  pxy2.on("connect", function (rq, socket) {
    connectPath = rq.url;                         // "host:443" bekleniyor
    socket.write("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n");
    socket.end();
  });
  await new Promise(function (r) { pxy2.listen(0, r); });
  process.env.HTTPS_PROXY = "http://127.0.0.1:" + pxy2.address().port;
  var dTun = pathm.join(TMP, "tunnel.bin");
  var rTun = await K.download("https://huggingface.co/x.bin", dTun, null, 0, undefined, { key: "model:x" });
  chk("https hedef -> CONNECT gonderildi", connectPath === "huggingface.co:443", "path=" + connectPath);
  chk("CONNECT reddi hata olarak donuyor (sessiz degil)",
    !rTun.ok && /407/.test(String(rTun.error)), "err=" + String(rTun.error).slice(0, 60));
  pxy2.close();
  delete process.env.HTTPS_PROXY;

  // 8) sweepTemp: .srt korunur, ses artiklari silinir
  var sw = pathm.join(os.tmpdir(), "kesit");
  fs.mkdirSync(sw, { recursive: true });
  var eski = Date.now() - 200000000;
  ["suflo_1.srt", "montaj_2.srt", "cap_3.wav", "seq_4.wav", "warmup.wav", "baska.wav"].forEach(function (f) {
    var fp = pathm.join(sw, f);
    fs.writeFileSync(fp, "x");
    fs.utimesSync(fp, eski / 1000, eski / 1000);
  });
  K.sweepTemp();
  chk("sweep: suflo_1.srt KORUNDU", fs.existsSync(pathm.join(sw, "suflo_1.srt")));
  chk("sweep: montaj_2.srt KORUNDU", fs.existsSync(pathm.join(sw, "montaj_2.srt")));
  chk("sweep: cap_3.wav silindi", !fs.existsSync(pathm.join(sw, "cap_3.wav")));
  chk("sweep: seq_4.wav silindi", !fs.existsSync(pathm.join(sw, "seq_4.wav")));
  chk("sweep: warmup.wav silindi", !fs.existsSync(pathm.join(sw, "warmup.wav")));
  chk("sweep: ilgisiz dosyaya dokunulmadi", fs.existsSync(pathm.join(sw, "baska.wav")));

  // 9) srtDir supurulen klasorlerin DISINDA olmali (harness'ta USER_DATA temp'e sahte baglandi)
  var sd = K.srtDir();
  var supurulen = [pathm.join(os.tmpdir(), "kesit"), pathm.join(os.tmpdir(), "Suflo"), K.tmpDir()];
  chk("srtDir supurulen klasorlerden biri degil", sd && supurulen.indexOf(sd) === -1, sd);

  srv.close();
  console.log(results.join("\n"));
  var fail = results.filter(function (r) { return r.indexOf("FAIL") === 0; }).length;
  console.log("\n" + (results.length - fail) + "/" + results.length + " gecti");
  process.exit(fail ? 1 : 0);
}
main().catch(function (e) { console.error("HARNESS HATA: " + e.stack); process.exit(2); });
