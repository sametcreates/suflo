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
    rs.writeHead(200, { "content-length": String(TOTAL) });
    rs.end(REF);
  });
  tsrv.on("connection", function () { baglanti++; });
  await new Promise(function (r) { tsrv.listen(0, "127.0.0.1", r); });
  var tbase = "https://127.0.0.1:" + tsrv.address().port + "/";
  var caPem = fs.readFileSync(pathm.join(TLSD, "ca.pem"), "utf8");
  var baskaPem = fs.readFileSync(pathm.join(TLSD, "baska-ca.pem"), "utf8");
  var aramalar = [];
  var sahteDns = { adres: "127.0.0.1", lookup: function (h, o, cb) { aramalar.push(h); cb(null, [{ address: sahteDns.adres, family: 4 }]); } };
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
  tsrv.close();
}

main().catch(function (e) { console.error("HARNESS HATA: " + e.stack); process.exit(2); });
