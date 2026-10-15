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

// opts (3.4 adım 19): { ag: true } js/ag-dayanim.js de yüklenir; { dns } "dns" modülünün sahtesi;
// { http } "http" modülünün sahtesi; { cp } "child_process" sahtesi; { process } sahte süreç (platform)
function loadBridge(opts) {
  opts = opts || {};
  var code = fs.readFileSync(SRC, "utf8");
  var sahteRequire = function (m) {
    if (m === "dns" && opts.dns) return opts.dns;
    if (m === "http" && opts.http) return opts.http;
    if (m === "child_process" && opts.cp) return opts.cp;
    return require(m);
  };
  var sandbox = {
    window: {}, console: console, require: sahteRequire, process: opts.process || process,
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
  if (opts.ag) vm.runInContext(fs.readFileSync(KOKYOL + "js/ag-dayanim.js", "utf8"), sandbox, { filename: "ag-dayanim.js" });
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

  // 7d) bulut transkripsiyonu (httpUpload), çeviri/LLM (httpJson) da vekilden geçer: eskiden doğrudan
  // bağlanıyor, yalnız vekille çıkan ağda "vekil tanımla" ipucu kullanıcıyı döngüye sokuyordu
  var tuneller = [], mutlak = null;
  var pxy3 = http.createServer(function (rq, rs) {
    var govde = "";
    rq.on("data", function (d) { govde += d; });
    rq.on("end", function () { mutlak = rq.method + " " + rq.url + " " + govde; rs.writeHead(200, { "content-type": "application/json" }); rs.end('{"ok":true}'); });
  });
  pxy3.on("connect", function (rq, socket) { tuneller.push(rq.url); socket.write("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"); socket.end(); });
  await new Promise(function (r) { pxy3.listen(0, r); });
  process.env.HTTPS_PROXY = "http://127.0.0.1:" + pxy3.address().port;
  var up = await K.httpUpload("https://api.groq.invalid/openai/v1/audio/transcriptions", { Authorization: "Bearer x" }, { model: "m" }, Buffer.from("ses"), "a.mp3", "audio/mpeg");
  chk("httpUpload vekilden CONNECT ile gider (doğrudan DNS değil)", tuneller.indexOf("api.groq.invalid:443") !== -1 && up.status === 0 && /407/.test(up.body), JSON.stringify(tuneller) + " " + up.body);
  var js1 = await K.httpJson("https://api.openai.invalid/v1/chat/completions", { Authorization: "Bearer x" }, { a: 1 });
  chk("httpJson vekilden CONNECT ile gider", tuneller.indexOf("api.openai.invalid:443") !== -1 && js1.status === 0 && /407/.test(js1.body), JSON.stringify(tuneller) + " " + js1.body);
  var js2 = await K.httpJson("http://ornek.gecersiz/json", {}, { b: 2 });
  chk("httpJson http hedef: vekile mutlak adresli POST, gövdesiyle", js2.status === 200 && mutlak === 'POST http://ornek.gecersiz/json {"b":2}', String(mutlak));
  pxy3.close();
  // 7e) açık :80 portlu vekil 8080'e gitmez (new URL portu siler); port yazılmadıysa eskisi gibi 8080
  process.env.HTTPS_PROXY = "http://127.0.0.1:80";
  await K.download("https://huggingface.co/y.bin", pathm.join(TMP, "port80.bin"), null, 0, undefined, { key: "model:y" });
  process.env.HTTPS_PROXY = "127.0.0.1:080";
  await K.download("https://huggingface.co/y.bin", pathm.join(TMP, "port80b.bin"), null, 0, undefined, { key: "model:y" });
  var tunelLog = K.logText().split("\n").filter(function (s) { return /proxy CONNECT tuneli: 127\.0\.0\.1:/.test(s); }).slice(-2);
  chk("vekil http://host:80 ve host:080 → port 80 (8080 değil)", tunelLog.length === 2 && tunelLog.every(function (s) { return /127\.0\.0\.1:80 ->/.test(s); }), tunelLog.join(" | "));
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

  await kurumsalAg(base);

  srv.close();
  console.log(results.join("\n"));
  var fail = results.filter(function (r) { return r.indexOf("FAIL") === 0; }).length;
  console.log("\n" + (results.length - fail) + "/" + results.length + " gecti");
  process.exit(fail ? 1 : 0);
}
/*
 * 3.4 adım 19 — kurumsal ağ dayanıklılığı. Sunucu, test kökü (tests/fixtures/ag-tls/ca.pem; YALNIZ
 * test için üretilmiş, gizli değil) ile imzalı sertifika sunar: Node'un yerleşik kökleri onu tanımaz,
 * tıpkı HTTPS denetleyen bir kurumsal ağ gibi. Bağlantılar TCP düzeyinde sayılır.
 */
async function kurumsalAg(base) {
  var https = require("https");
  var TLSD = pathm.join(__dirname, "fixtures", "ag-tls");
  var baglanti = 0;
  var tsrv = https.createServer({
    key: fs.readFileSync(pathm.join(TLSD, "sunucu-anahtar.pem")),
    cert: fs.readFileSync(pathm.join(TLSD, "sunucu.pem"))
  }, function (rq, rs) {
    if (rq.method === "HEAD") { rs.writeHead(200); rs.end(); return; }
    // engel sunucusu taklidi (Umbrella kökü sistem deposunda: TLS geçer, sayfa 200 döner)
    if (rq.url === "/engel") { rs.writeHead(200, { "content-type": "text/html; charset=utf-8" }); rs.end(ENGEL_SAYFASI); return; }
    if (rq.url === "/kucuk") { rs.writeHead(200, { "content-type": "application/octet-stream", "content-length": "84" }); rs.end(Buffer.alloc(84, 7)); return; }
    if (rq.url === "/kucuk-parcali") { rs.writeHead(200, { "content-type": "application/octet-stream" }); rs.write(Buffer.alloc(40, 7)); rs.end(Buffer.alloc(44, 7)); return; }
    rs.writeHead(200, { "content-length": String(TOTAL) });
    rs.end(REF);
  });
  var ENGEL_SAYFASI = "<!doctype html><html><body>This site is blocked.</body></html>";
  tsrv.on("connection", function () { baglanti++; });
  await new Promise(function (r) { tsrv.listen(0, "127.0.0.1", r); });
  var tbase = "https://127.0.0.1:" + tsrv.address().port + "/";
  var caPem = fs.readFileSync(pathm.join(TLSD, "ca.pem"), "utf8");
  var baskaPem = fs.readFileSync(pathm.join(TLSD, "baska-ca.pem"), "utf8");
  var aramalar = [];
  // harita: ada özel adres (yoksa adres)
  var sahteDns = { adres: "127.0.0.1", harita: {}, lookup: function (h, o, cb) {
    aramalar.push(h);
    var a = Object.prototype.hasOwnProperty.call(sahteDns.harita, h) ? sahteDns.harita[h] : sahteDns.adres;
    cb(null, [{ address: a, family: 4 }]);
  } };
  var K2 = loadBridge({ ag: true, dns: sahteDns });

  // 10a) ek kök yok (Linux ya da dışa aktarma boş): yeniden deneme YOK, tek bağlantı
  K2._ekSertifikaOnbellek([]);
  baglanti = 0;
  var r10a = await K2.download(tbase + "ok", pathm.join(TMP, "tls-a.bin"), null, 0, undefined, { key: "model:x" });
  chk("adım 19: ek kök yokken sertifika hatası tek denemede döner (aynı köklerle boş tekrar yok)",
    !r10a.ok && r10a.sertifika === true && !r10a.caDenendi && baglanti === 1, "bag=" + baglanti + " err=" + r10a.error);

  // 10b) yanlış ek kök: TAM OLARAK bir yeniden deneme, doğrulama kapatılmadığı için yine düşer
  K2._ekSertifikaOnbellek([baskaPem]);
  baglanti = 0;
  var r10b = await K2.download(tbase + "ok", pathm.join(TMP, "tls-b.bin"), null, 0, undefined, { key: "model:x" });
  chk("adım 19: sertifika hatasında yalnız BİR yeniden deneme (2 bağlantı), ilgisiz kökle yine reddedilir",
    !r10b.ok && r10b.caDenendi === true && r10b.sertifika === true && baglanti === 2, "bag=" + baglanti + " err=" + r10b.error);

  // 10c) kurumsal kök sistem deposundan geldi: ikinci denemede iner, dosya birebir
  K2._ekSertifikaOnbellek([caPem]);
  baglanti = 0;
  var dC = pathm.join(TMP, "tls-c.bin");
  var r10c = await K2.download(tbase + "ok", dC, null, 0, undefined, { key: "model:x" });
  chk("adım 19: tls.rootCertificates + kurumsal kökle ikinci deneme iner, dosya birebir",
    r10c.ok && baglanti === 2 && Buffer.compare(fs.readFileSync(dC), REF) === 0, "bag=" + baglanti + " err=" + (r10c.error || ""));

  // 10a/10b) yeniden deneme iddiası YALNIZ gerçekten yapıldığında hataya yazılır
  chk("adım 19: ikinci deneme yapıldıysa hata bunu söyler, yapılmadıysa söylemez",
    /bir kez daha denedi/.test(r10b.error) && !/bir kez daha denedi/.test(r10a.error), r10a.error + " || " + r10b.error);

  // 10d) httpGet (HEAD, Doctor sınaması) aynı tek yeniden denemeyi yapar (sistemKokleri: true ile)
  K2._ekSertifikaOnbellek([caPem]);
  baglanti = 0;
  var h10 = await K2.httpGet(tbase, {}, { method: "HEAD", timeout: 5000, sistemKokleri: true });
  chk("adım 19: httpGet HEAD sertifika hatasında ek köklerle bir kez daha → 200, caDenendi",
    h10.status === 200 && h10.caDenendi === true, JSON.stringify(h10));
  // 10d2) istenmeden (panel açılışındaki sessiz güncelleme denetimi gibi) sistem kökleri sorulmaz
  baglanti = 0;
  var h10s = await K2.httpGet(tbase, {});
  chk("adım 19: sistemKokleri istenmeyen httpGet yeniden denemez (tek bağlantı, işletim sistemi komutu yok)",
    h10s.status === 0 && /certificate/i.test(h10s.body) && !h10s.caDenendi && baglanti === 1, JSON.stringify(h10s) + " bag=" + baglanti);
  K2._ekSertifikaOnbellek([]);
  var h10b = await K2.httpGet(tbase, {}, { method: "HEAD", timeout: 5000, sistemKokleri: true });
  chk("adım 19: httpGet ek kök yokken sertifika hatası iletisiyle döner",
    h10b.status === 0 && /certificate/i.test(h10b.body) && !h10b.caDenendi, JSON.stringify(h10b));

  // 10e) HEAD zaman aşımı: yanıt vermeyen sunucu sınıra takılır (Doctor 5 sn; burada 300 ms)
  var sessiz = http.createServer(function () {});
  await new Promise(function (r) { sessiz.listen(0, "127.0.0.1", r); });
  var t0 = Date.now();
  var h10e = await K2.httpGet("http://127.0.0.1:" + sessiz.address().port + "/", {}, { method: "HEAD", timeout: 300 });
  chk("adım 19: HEAD zaman aşımı seçeneğe uyar (status 0, ETIMEDOUT)", h10e.status === 0 && h10e.kod === "ETIMEDOUT" && Date.now() - t0 < 3000, JSON.stringify(h10e));
  sessiz.close();

  // 10e2) bağlantı HİÇ kurulamıyor (güvenlik duvarı SYN'i düşürüyor): Node'un req.setTimeout'u soket
  // 'connect' olmadan saymaz (Node 12'nin globalAgent'ında zaman aşımı da yok). Sahte http modülü
  // bağlanmayan istek döndürür; sınır duvar saatiyle tutulmalı, istek yıkılmalı
  var asili = [];
  var asiliHttp = {
    request: function () {
      var EE = require("events");
      var rq = new EE();
      rq.setTimeout = function () { return rq; };   // bağlantı yokken hiç tetiklenmez (Node gibi)
      rq.end = function () {};
      rq.destroy = function () { rq.yikildi = true; };
      asili.push(rq);
      return rq;
    }
  };
  asiliHttp.get = asiliHttp.request;
  var K5 = loadBridge({ ag: true, http: asiliHttp });
  K5.settings().noProxy = "*";   // ortamdaki HTTPS_PROXY karışmasın: doğrudan bağlantı
  var t2 = Date.now();
  var h10f = await Promise.race([
    K5.httpGet("http://10.255.255.1/", {}, { method: "HEAD", timeout: 300 }),
    new Promise(function (r) { setTimeout(function () { r({ askida: true }); }, 4000); })
  ]);
  chk("adım 19: bağlantı kurulamazken zaman aşımı duvar saatiyle tutar (ETIMEDOUT, istek yıkılır)",
    h10f.status === 0 && h10f.kod === "ETIMEDOUT" && Date.now() - t2 < 2000 && asili.length === 1 && asili[0].yikildi === true,
    JSON.stringify(h10f) + " " + (Date.now() - t2) + " ms");

  // 10e3) vekil sunucu CONNECT'e hiç yanıt vermiyor: tünelin kendi 30 sn'si sınırı aşmaz
  var sessizVekil = require("net").createServer(function () {});
  await new Promise(function (r) { sessizVekil.listen(0, "127.0.0.1", r); });
  var K6 = loadBridge({ ag: true });
  K6.settings().proxyUrl = "http://127.0.0.1:" + sessizVekil.address().port;
  K6.settings().noProxy = "baska.invalid";
  var t3 = Date.now();
  var h10g = await Promise.race([
    K6.httpGet("https://huggingface.invalid/", {}, { method: "HEAD", timeout: 400 }),
    new Promise(function (r) { setTimeout(function () { r({ askida: true }); }, 6000); })
  ]);
  chk("adım 19: yanıtsız vekilde CONNECT de sınıra uyar (30 sn değil)",
    h10g.status === 0 && h10g.kod === "ETIMEDOUT" && Date.now() - t3 < 2500, JSON.stringify(h10g) + " " + (Date.now() - t3) + " ms");
  sessizVekil.close();

  // 10e4) sistem kökü dışa aktarması başarısızsa önbelleğe alınmaz: sonraki deneme yeniden sorar
  var cagri = 0;
  var sahteCp = {
    spawn: function () {
      cagri++;
      var EE = require("events");
      var c = new EE();
      c.stdout = new EE(); c.stderr = new EE();
      var n = cagri;
      setTimeout(function () {
        if (n === 1) { c.stderr.emit("data", "zaman asimi"); c.emit("close", 1); }
        else { c.stdout.emit("data", caPem); c.emit("close", 0); }
      }, 5);
      return c;
    }
  };
  var sahteSurec = Object.create(process);
  Object.defineProperty(sahteSurec, "platform", { value: "win32" });
  var K7 = loadBridge({ ag: true, cp: sahteCp, process: sahteSurec });
  var p1 = await K7.ekSertifikalar();
  var p2 = await K7.ekSertifikalar();
  var p3 = await K7.ekSertifikalar();
  chk("adım 19: başarısız sertifika dışa aktarması oturumu 'ek kök yok'a kilitlemez; başarılı olan önbelleğe girer",
    p1.length === 0 && p2.length === 1 && p3.length === 1 && cagri === 2, "cagri=" + cagri + " " + [p1.length, p2.length, p3.length].join(","));

  /*
   * 10e5) inceleme 2: Doctor'un 5 sn'lik sınırı soğuk PowerShell dışa aktarmasını da kapsar. Sınır dışa aktarma
   * sürerken dolarsa dönüş "zaman aşımı" (güvenlik duvarı) DEĞİL, ilk denemenin sertifika hatası + caSuresiDoldu;
   * dışa aktarma arka planda bitip önbelleğe girer, sonraki sınama ondan yararlanır. (Ölçek: sınır 300 ms, dışa
   * aktarma 700 ms.)
   */
  var yavasCp = {
    spawn: function () {
      var EE = require("events");
      var c = new EE();
      c.stdout = new EE(); c.stderr = new EE();
      setTimeout(function () { c.stdout.emit("data", caPem); c.emit("close", 0); }, 700);
      return c;
    }
  };
  var K8 = loadBridge({ ag: true, cp: yavasCp, process: sahteSurec });
  var AGm = require(pathm.join(KOKYOL, "js", "ag-dayanim.js"));
  var t5 = Date.now();
  var h5 = await K8.httpGet(tbase, {}, { method: "HEAD", timeout: 300, sistemKokleri: true });
  chk("adım 19 inceleme 2: sınır sistem kökleri okunurken dolarsa sertifika hatası döner (ETIMEDOUT / 'güvenlik duvarı' değil)",
    h5.status === 0 && h5.kod !== "ETIMEDOUT" && AGm.sertifikaHatasiMi({ code: h5.kod, message: h5.body }) && h5.caSuresiDoldu === true &&
    !h5.caDenendi && Date.now() - t5 < 650 && AGm.agHatasiAcikla({ code: h5.kod, message: h5.body }).tur === "sertifika", JSON.stringify(h5));
  await new Promise(function (r) { setTimeout(r, 600); });
  var h5b = await K8.httpGet(tbase, {}, { method: "HEAD", timeout: 300, sistemKokleri: true });
  chk("adım 19 inceleme 2: dışa aktarma arka planda bitip önbelleğe girer; sonraki sınama kurumsal kökle ulaşır",
    h5b.status === 200 && h5b.caDenendi === true && !h5b.caSuresiDoldu, JSON.stringify(h5b));

  // 10e6) kökler hazır ama ikinci bağlantı yanıtsız kalıyor: sınır yine sertifika hatasını söyler
  var aracBag = 0;
  var arac = require("net").createServer(function (soket) {
    aracBag++;
    if (aracBag > 1) { soket.on("error", function () {}); return; }   // ikinci deneme: hiç yanıt yok
    var hedef = require("net").connect(tsrv.address().port, "127.0.0.1");
    hedef.on("error", function () {}); soket.on("error", function () {});
    soket.pipe(hedef); hedef.pipe(soket);
  });
  await new Promise(function (r) { arac.listen(0, "127.0.0.1", r); });
  K2._ekSertifikaOnbellek([caPem]);
  var h6 = await K2.httpGet("https://127.0.0.1:" + arac.address().port + "/", {}, { method: "HEAD", timeout: 400, sistemKokleri: true });
  chk("adım 19 inceleme 2: ikinci deneme sınıra takılırsa da ilk denemenin sertifika hatası döner (2 bağlantı)",
    h6.status === 0 && h6.kod !== "ETIMEDOUT" && AGm.sertifikaHatasiMi({ code: h6.kod, message: h6.body }) && h6.caSuresiDoldu === true && aracBag === 2,
    JSON.stringify(h6) + " bag=" + aracBag);
  arac.close();

  /*
   * 10e7) inceleme 2: macOS'ta System.keychain dökümü "Asla Güvenme" (Deny) sertifikaları da içerir. Yönetici (-d) ya da
   * kullanıcı güven ayarında Deny olan kök ek köklere girmez; ayar dosyaları geçici klasörden silinir.
   */
  function sha1Iz(pem) {
    var b64 = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s+/g, "");
    return require("crypto").createHash("sha1").update(Buffer.from(b64, "base64")).digest("hex").toUpperCase();
  }
  function guvenPlist(girdiler) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n\t<key>trustList</key>\n\t<dict>\n' +
      girdiler.map(function (g) {
        return "\t\t<key>" + g.iz + "</key>\n\t\t<dict>\n\t\t\t<key>issuerName</key>\n\t\t\t<data>AAAA</data>\n\t\t\t<key>trustSettings</key>\n\t\t\t<array>\n" +
          (g.sonuc ? "\t\t\t\t<dict>\n\t\t\t\t\t<key>kSecTrustSettingsPolicyName</key>\n\t\t\t\t\t<string>sslServer</string>\n" +
            "\t\t\t\t\t<key>kSecTrustSettingsResult</key>\n\t\t\t\t\t<integer>" + g.sonuc + "</integer>\n\t\t\t\t</dict>\n" : "") +
          "\t\t\t</array>\n\t\t</dict>\n";
      }).join("") + "\t</dict>\n\t<key>trustVersion</key>\n\t<integer>1</integer>\n</dict>\n</plist>\n";
  }
  var macCagri = [], macDosyalar = [];
  var macCp = {
    spawn: function (cmd, args) {
      macCagri.push(args.join(" "));
      var EE = require("events");
      var c = new EE();
      c.stdout = new EE(); c.stderr = new EE();
      setTimeout(function () {
        if (args[0] === "find-certificate") { c.stdout.emit("data", caPem + baskaPem); c.emit("close", 0); return; }
        var dosya = args[args.length - 1];
        macDosyalar.push(dosya);
        // yönetici alanı: kurumsal köke güven (sonuç yok = kök olarak güven); kullanıcı alanı: ilgisiz kök "Asla Güvenme"
        if (args.indexOf("-d") !== -1) fs.writeFileSync(dosya, guvenPlist([{ iz: sha1Iz(caPem), sonuc: 0 }]));
        else fs.writeFileSync(dosya, guvenPlist([{ iz: sha1Iz(baskaPem).toLowerCase(), sonuc: 3 }]));
        c.emit("close", 0);
      }, 2);
      return c;
    }
  };
  var macSurec = Object.create(process);
  Object.defineProperty(macSurec, "platform", { value: "darwin" });
  var K10 = loadBridge({ ag: true, cp: macCp, process: macSurec });
  var macPem = await K10.ekSertifikalar();
  chk("adım 19 inceleme 2: macOS'ta kullanıcının 'Asla Güvenme' dediği kök ek köklere girmez, güvenilen kalır",
    macPem.length === 1 && macPem[0].replace(/\s+/g, "") === caPem.replace(/\s+/g, ""), macPem.length + " " + macCagri.join(" | "));
  chk("adım 19 inceleme 2: macOS güven ayarı iki alandan (yönetici -d ve kullanıcı) okunur, dosyalar silinir",
    macCagri.filter(function (a) { return /^trust-settings-export -d /.test(a); }).length === 1 &&
    macCagri.filter(function (a) { return /^trust-settings-export (?!-d)/.test(a); }).length === 1 &&
    macDosyalar.length === 2 && macDosyalar.every(function (d) { return !fs.existsSync(d) && !fs.existsSync(pathm.dirname(d)); }), macCagri.join(" | "));
  // ayar yok (komut sıfırdan farklı kodla biter): hiçbir kök atılmaz
  var bosCp = {
    spawn: function (cmd, args) {
      var EE = require("events");
      var c = new EE();
      c.stdout = new EE(); c.stderr = new EE();
      setTimeout(function () {
        if (args[0] === "find-certificate") { c.stdout.emit("data", caPem + baskaPem); c.emit("close", 0); return; }
        c.stderr.emit("data", "SecTrustSettingsCreateExternalRepresentation: No Trust Settings were found.");
        c.emit("close", 1);
      }, 2);
      return c;
    }
  };
  var K11 = loadBridge({ ag: true, cp: bosCp, process: macSurec });
  chk("adım 19 inceleme 2: macOS'ta güven ayarı yoksa System.keychain kökleri olduğu gibi kalır",
    (await K11.ekSertifikalar()).length === 2);

  // 10f) sertifika doğrulaması hiçbir yerde kapatılmaz
  var jsDir = pathm.join(KOKYOL, "js");
  var kapatan = fs.readdirSync(jsDir).filter(function (f) { return /\.js$/.test(f) && /rejectUnauthorized\s*[:=]/.test(fs.readFileSync(pathm.join(jsDir, f), "utf8")); });
  chk("adım 19: js/ altında rejectUnauthorized ayarı yok (doğrulama hep açık)", kapatan.length === 0, kapatan.join(","));

  // 10g) DNS filtresi: Cisco Umbrella aralığı (146.112.0.0/16) hataya teşhis olarak eklenir
  sahteDns.adres = "146.112.61.106";
  aramalar = [];
  var r10g = await K2.download(base + "503", pathm.join(TMP, "umb.bin"), null, 0, undefined, { key: "model:x" });
  chk("adım 19: Umbrella aralığına çözülen ad 'Kurumsal ağ filtresi … Cisco Umbrella' ipucu verir",
    !r10g.ok && r10g.dnsEngeli === "146.112.61.106" && /Kurumsal ağ filtresi 127\.0\.0\.1 adresini engelliyor \(Cisco Umbrella, 146\.112\.61\.106\)/.test(r10g.error) && aramalar.length === 1,
    String(r10g.error));
  chk("adım 19: DNS ipucu hataYardimi'nda içe aktarma çözümünü getirir", /Model dosyası içe aktar/.test(K2.hataYardimi(new Error(r10g.error))));
  sahteDns.adres = "0.0.0.0";
  var r10h = await K2.download(base + "503", pathm.join(TMP, "sifir.bin"), null, 0, undefined, { key: "model:x" });
  chk("adım 19: 0.0.0.0'a çözülen ad da kurumsal filtre sayılır", !r10h.ok && r10h.dnsEngeli === "0.0.0.0" && /Kurumsal ağ filtresi/.test(r10h.error), String(r10h.error));
  sahteDns.adres = "146.113.1.1";
  var r10i = await K2.download(base + "503", pathm.join(TMP, "normal.bin"), null, 0, undefined, { key: "model:x" });
  chk("adım 19: aralık dışı adres ipucu eklemez (hata aynen)", !r10i.ok && !r10i.dnsEngeli && r10i.error === "HTTP 503", String(r10i.error));
  aramalar = [];
  sahteDns.adres = "146.112.61.106";
  var rOk = await K2.download(base + "ok", pathm.join(TMP, "dnsok.bin"), null, 0, undefined, { key: "model:x" });
  chk("adım 19: başarılı indirmede DNS sorgusu yapılmaz", rOk.ok && aramalar.length === 0, "aramalar=" + aramalar.length);

  await engelSayfasi(K2, tbase, sahteDns, function () { return aramalar; }, caPem);
  tsrv.close();
}

/*
 * 3.4 adım 19 inceleme: Cisco Umbrella kökü Windows deposundaysa sertifika yeniden denemesi engel
 * sunucusunda TLS'i geçer ve engel sayfası HTTP 200 döner. Bu "indi" sayılırsa sayfa model adıyla
 * kaydedilir, DNS ipucu hiç çıkmaz. İkili dosya beklenirken (expectedMB) gelen text/html ve
 * meta.enAzBayt'tan küçük yanıt başarısızdır, hedefe dokunulmaz; o zaman DNS teşhisi çalışır.
 */
async function engelSayfasi(K2, tbase, sahteDns, aramalar, caPem) {
  var MB = 1048576;
  // (a) bulgu senaryosu: TLS denetimi + kurumsal kök + DNS 146.112.x + 200 HTML. Hedefte içe aktarılmış
  // model var: engel sayfası onun yerine geçmemeli
  K2._ekSertifikaOnbellek([caPem]);
  sahteDns.adres = "146.112.61.106";
  var hedefA = pathm.join(TMP, "engel-model.bin");
  fs.writeFileSync(hedefA, "ICE AKTARILMIS MODEL");
  var rA = await K2.download(tbase + "engel", hedefA, null, 0, undefined, { key: "model:turbo", expectedMB: 574 });
  chk("adım 19 inceleme: kurumsal kökle TLS geçip 200 HTML engel sayfası gelince indirme BAŞARISIZ, DNS ipucu eklenir",
    !rA.ok && rA.sayfa === true && rA.dnsEngeli === "146.112.61.106" && !rA.sertifika &&
    /web sayfası gönderdi/.test(rA.error) && /Kurumsal ağ filtresi 127\.0\.0\.1 adresini engelliyor \(Cisco Umbrella, 146\.112\.61\.106\)/.test(rA.error),
    JSON.stringify(rA));
  chk("adım 19 inceleme: engel sayfası hedefteki dosyanın yerine geçmez, .part bırakmaz",
    fs.readFileSync(hedefA, "utf8") === "ICE AKTARILMIS MODEL" && !fs.existsSync(hedefA + ".part") && !fs.existsSync(hedefA + ".part.json"));
  chk("adım 19 inceleme: engel sayfası hatası hataYardimi'nda kurumsal filtre çözümünü (içe aktarma) getirir",
    /Model dosyası içe aktar/.test(K2.hataYardimi(new Error(rA.error))), K2.hataYardimi(new Error(rA.error)));

  // (b) DNS filtresi yok (başka bir filtre, ör. Zscaler sayfası): yine başarısız, tarafsız ipucu
  sahteDns.adres = "127.0.0.1";
  var hedefB = pathm.join(TMP, "engel-b.bin");
  var rB = await K2.download(tbase + "engel", hedefB, null, 0, undefined, { key: "model:turbo", expectedMB: 574 });
  chk("adım 19 inceleme: DNS engeli yokken de HTML dosya sayılmaz, dosya oluşmaz, ağ filtresi ipucu",
    !rB.ok && rB.sayfa === true && !rB.dnsEngeli && !fs.existsSync(hedefB) &&
    /Ağ filtresi bu indirmeyi engelliyor olabilir/.test(K2.hataYardimi(new Error(rB.error))), JSON.stringify(rB));

  // (c) expectedMB yoksa (ör. sürüm notu / güncelleme sayfası) HTML eskisi gibi iner
  var hedefC = pathm.join(TMP, "engel-c.html");
  var rC = await K2.download(tbase + "engel", hedefC, null, 0, undefined, { key: "sayfa" });
  chk("adım 19 inceleme: expectedMB verilmeyen indirmede HTML yine kabul edilir", rC.ok && fs.existsSync(hedefC), JSON.stringify(rC));

  // (d) meta.enAzBayt: bildirilen boyut (84 B) sınırın altında: hiçbir şey yazılmaz, DNS teşhisi çalışır
  sahteDns.adres = "146.112.61.106";
  var hedefD = pathm.join(TMP, "kucuk.bin");
  fs.writeFileSync(hedefD, "ICE AKTARILMIS MODEL");
  var rD = await K2.download(tbase + "kucuk", hedefD, null, 0, undefined, { key: "model:turbo", expectedMB: 574, enAzBayt: Math.floor(574 * MB * 0.85) + 1 });
  chk("adım 19 inceleme: enAzBayt altındaki yanıt başarısız (boyut iletisi + DNS ipucu), hedef değişmez",
    !rD.ok && rD.kucuk === true && rD.dnsEngeli === "146.112.61.106" &&
    /çok küçük bir yanıt gönderdi \(1 KB, beklenen ~574 MB\)/.test(rD.error) &&
    fs.readFileSync(hedefD, "utf8") === "ICE AKTARILMIS MODEL" && !fs.existsSync(hedefD + ".part"), JSON.stringify(rD));

  // (e) boyut bildirmeyen (chunked) küçük yanıt: indikten sonra yakalanır, .part atılır, hedef değişmez
  sahteDns.adres = "127.0.0.1";
  var hedefE = pathm.join(TMP, "kucuk-parcali.bin");
  fs.writeFileSync(hedefE, "ICE AKTARILMIS MODEL");
  var rE = await K2.download(tbase + "kucuk-parcali", hedefE, null, 0, undefined, { key: "model:turbo", expectedMB: 574, enAzBayt: 1000 });
  chk("adım 19 inceleme: chunked küçük yanıt da başarısız, .part silinir, hedef değişmez",
    !rE.ok && rE.kucuk === true && !fs.existsSync(hedefE + ".part") && !fs.existsSync(hedefE + ".part.json") &&
    fs.readFileSync(hedefE, "utf8") === "ICE AKTARILMIS MODEL", JSON.stringify(rE));

  // (f) gerçek dosya (sınırın üstünde, ikili) eskisi gibi iner; DNS'e bakılmaz (Umbrella seçici vekili)
  sahteDns.adres = "146.112.61.106";
  var oncekiArama = aramalar().length;
  var hedefF = pathm.join(TMP, "gercek.bin");
  var rF = await K2.download(tbase + "ok", hedefF, null, 0, undefined, { key: "model:x", expectedMB: 1, enAzBayt: 900000 });
  chk("adım 19 inceleme: sınırın üstündeki ikili dosya iner, DNS sorgusu yok",
    rF.ok && Buffer.compare(fs.readFileSync(hedefF), REF) === 0 && aramalar().length === oncekiArama, JSON.stringify(rF));

  // (g) yönlendirmede iki ad: ikisi de engelliyse istenen ad söylenir (engel sunucusu block.opendns.com'a
  // yönlendirse de kullanıcıya huggingface.co anlatılır); yalnız son ad engelliyse o söylenir
  var sahteHttp = {
    get: function (o, cb) {
      var EE = require("events");
      var rq = new EE();
      rq.setTimeout = function () { return rq; };
      rq.destroy = function () {};
      rq.end = function () {};
      setTimeout(function () {
        var rs = new EE();
        rs.resume = function () {};
        rs.headers = {};
        if (o.hostname === "huggingface.invalid") { rs.statusCode = 302; rs.headers.location = "http://block.opendns.invalid/?url=x"; }
        else rs.statusCode = 503;
        cb(rs);
      }, 1);
      return rq;
    }
  };
  sahteHttp.request = sahteHttp.get;
  var yAramalar = [];
  var yDns = { harita: {}, lookup: function (h, o, cb) { yAramalar.push(h); cb(null, [{ address: yDns.harita[h] || "1.2.3.4", family: 4 }]); } };
  var K9 = loadBridge({ ag: true, http: sahteHttp, dns: yDns });
  K9.settings().noProxy = "*";   // ortamdaki HTTP(S)_PROXY karışmasın
  yDns.harita = { "huggingface.invalid": "146.112.61.106", "block.opendns.invalid": "146.112.61.104" };
  var rG = await K9.download("http://huggingface.invalid/m.bin", pathm.join(TMP, "yon-g.bin"), null, 0, undefined, { key: "model:x" });
  chk("adım 19 inceleme: yönlendirmede ikisi de engelliyse istenen ad (huggingface) söylenir, iki ad da sorulur",
    !rG.ok && rG.dnsEngeli === "146.112.61.106" && /Kurumsal ağ filtresi huggingface\.invalid adresini engelliyor/.test(rG.error) &&
    yAramalar.indexOf("huggingface.invalid") !== -1 && yAramalar.indexOf("block.opendns.invalid") !== -1, JSON.stringify(rG) + " " + yAramalar.join(","));
  yDns.harita = { "block.opendns.invalid": "146.112.61.104" };
  var rH = await K9.download("http://huggingface.invalid/m.bin", pathm.join(TMP, "yon-h.bin"), null, 0, undefined, { key: "model:x" });
  chk("adım 19 inceleme: yalnız son (yönlendirilen) ad engelliyse o söylenir",
    !rH.ok && rH.dnsEngeli === "146.112.61.104" && /Kurumsal ağ filtresi block\.opendns\.invalid adresini engelliyor/.test(rH.error), JSON.stringify(rH));
}

main().catch(function (e) { console.error("HARNESS HATA: " + e.stack); process.exit(2); });
