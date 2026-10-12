// Suflo testi: K.run iptali ve canlı stdout (3.2 adım 3, js/bridge.js)
//  - sahte child_process.spawn: hiç bitmeyen süreç; iptal Windows'ta taskkill /pid N /T /F,
//    macOS'ta SIGKILL; sonuç { code: -2, iptal: true }; aktifSurec sayacı düşer; zamanlayıcı temizlenir
//  - opts.onStdout parça parça çağrılır, tam çıktı yine birikir
//  - K.iptalJetonu: dinle / bırak / ikinci iptal etkisiz; başlamadan iptal edilmiş iş süreç açmaz
//  - K.download iptali: istek kesilir, .part korunur, sonraki indirme kaldığı yerden devam eder
//  - K.httpUpload iptali: istek kesilir, { status: 0, iptal: true }
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm"), http = require("http");
var EventEmitter = require("events");
var SRC = fs.readFileSync(path.join(__dirname, "..", "js", "bridge.js"), "utf8");

var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function js(x) { try { return JSON.stringify(x); } catch (e) { return String(x); } }

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-iptal-"));

/*
 * Köprüyü sahte platform ve sahte child_process ile yükle.
 * Döner: { K, cagrilar, cocuklar, zamanlayicilar() → bekleyen zamanlayıcı sayısı }
 */
function yukle(platform) {
  var cagrilar = { spawn: [], execFile: [], kill: [] };
  var cocuklar = [];
  function sahteCocuk() {
    var c = new EventEmitter();
    c.pid = 7000 + cocuklar.length;
    c.stdout = new EventEmitter(); c.stdout.setEncoding = function () {};
    c.stderr = new EventEmitter(); c.stderr.setEncoding = function () {};
    // hiç bitmez: kill yalnız kaydedilir (gerçek bir takılmış whisper-cli gibi)
    c.kill = function (sig) { cagrilar.kill.push({ pid: c.pid, sig: sig === undefined ? "(varsayilan)" : sig }); return true; };
    cocuklar.push(c);
    return c;
  }
  var sahteCp = {
    spawn: function (cmd, args, o) { cagrilar.spawn.push({ cmd: cmd, args: args, o: o }); return sahteCocuk(); },
    execFile: function (cmd, args, o, cb) {
      cagrilar.execFile.push({ cmd: cmd, args: args, o: o });
      if (typeof cb === "function") setImmediate(function () { cb(null, "", ""); });
      return new EventEmitter();
    },
    execSync: function () { return ""; },
    execFileSync: function () { return ""; }
  };
  var bekleyen = {};
  var sayac = 0;
  var sandbox = {
    window: {}, console: console,
    require: function (ad) { return ad === "child_process" ? sahteCp : require(ad); },
    process: { platform: platform, env: { PATH: "/usr/bin" }, versions: process.versions, arch: process.arch },
    URL: URL, Promise: Promise, Buffer: Buffer, JSON: JSON, Math: Math, Date: Date,
    setTimeout: function (fn, ms) {
      var id = ++sayac;
      var h = setTimeout(function () { delete bekleyen[id]; fn(); }, ms);
      bekleyen[id] = h;
      return { _id: id, _h: h };
    },
    clearTimeout: function (t) { if (t && t._id) { clearTimeout(t._h); delete bekleyen[t._id]; } else clearTimeout(t); },
    setImmediate: setImmediate, String: String, Number: Number,
    Object: Object, Array: Array, Error: Error, RegExp: RegExp, isFinite: isFinite,
    navigator: { platform: platform === "darwin" ? "MacIntel" : "Win32", userAgent: "" },
    CSInterface: function () {
      return { getSystemPath: function () { return TMP; }, evalScript: function () {} };
    }
  };
  sandbox.CSInterface.SystemPath = { USER_DATA: "u", EXTENSION: "e" };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "bridge.js" });
  return {
    K: sandbox.window.K, cagrilar: cagrilar, cocuklar: cocuklar,
    zamanlayicilar: function () { return Object.keys(bekleyen).length; }
  };
}

async function surecTestleri() {
  /* ---------- Windows: taskkill ağacı ---------- */
  var w = yukle("win32");
  ok("Windows yüklendi: K.WIN, iptal yardımcıları dışa açık", w.K.WIN === true && typeof w.K.iptalJetonu === "function" && typeof w.K.iptalHatasi === "function");
  var j = w.K.iptalJetonu();
  ok("jeton başlangıçta iptal değil", j.iptalEdildi === false);
  var stdoutParcalari = [];
  var is = w.K.run("whisper-cli.exe", ["-m", "model.bin"], {
    timeout: 3600000, iptal: j, onStdout: function (s) { stdoutParcalari.push(s); }
  });
  ok("süreç açıldı, aktif süreç sayısı 1, zaman aşımı zamanlayıcısı kurulu", w.cagrilar.spawn.length === 1 && w.K.surecSayisi() === 1 && w.zamanlayicilar() === 1,
    "surec=" + w.K.surecSayisi() + " zaman=" + w.zamanlayicilar());
  var cocuk = w.cocuklar[0];
  cocuk.stdout.emit("data", "[00:00:00.000 --> 00:00:01.000]  Mer");
  cocuk.stdout.emit("data", "haba\n");
  cocuk.stderr.emit("data", "whisper_print_progress_callback: progress =   5%\n");
  ok("onStdout her parçada çağrılır", stdoutParcalari.length === 2 && stdoutParcalari.join("") === "[00:00:00.000 --> 00:00:01.000]  Merhaba\n", js(stdoutParcalari));
  j.iptal();
  var r = await is;
  ok("iptal sonucu { code: -2, iptal: true }", r.code === -2 && r.iptal === true, js({ code: r.code, iptal: r.iptal }));
  ok("iptal sonucu o ana kadarki stdout/stderr'i taşır", r.stdout === "[00:00:00.000 --> 00:00:01.000]  Merhaba\n" && /progress =\s+5%/.test(r.stderr), js(r.stdout));
  ok("Windows: taskkill /pid <pid> /T /F, windowsHide", w.cagrilar.execFile.length === 1 && w.cagrilar.execFile[0].cmd === "taskkill" &&
    js(w.cagrilar.execFile[0].args) === js(["/pid", String(cocuk.pid), "/T", "/F"]) && w.cagrilar.execFile[0].o && w.cagrilar.execFile[0].o.windowsHide === true,
    js(w.cagrilar.execFile));
  ok("Windows: child.kill çağrılmaz (taskkill başarılı)", w.cagrilar.kill.length === 0, js(w.cagrilar.kill));
  ok("aktif süreç sayısı 0'a döndü", w.K.surecSayisi() === 0, w.K.surecSayisi());
  ok("zaman aşımı zamanlayıcısı temizlendi", w.zamanlayicilar() === 0, w.zamanlayicilar());
  cocuk.stdout.emit("data", "[00:00:01.000 --> 00:00:02.000]  geç gelen\n");
  ok("iptalden sonra onStdout çağrılmaz", stdoutParcalari.length === 2);
  cocuk.emit("close", 1);
  await bekle(5);
  ok("geç gelen close sonucu ve sayacı bozmaz", w.K.surecSayisi() === 0);
  j.iptal();
  ok("ikinci iptal etkisiz (taskkill bir kez)", w.cagrilar.execFile.length === 1);
  ok("günlükte iptal satırı", /run IPTAL \[whisper-cli\.exe\]/.test(w.K.logText()));

  /* ---------- macOS: SIGKILL ---------- */
  var m = yukle("darwin");
  ok("macOS yüklendi: K.MAC", m.K.MAC === true && m.K.WIN === false);
  var jm = m.K.iptalJetonu();
  var ism = m.K.run("/opt/homebrew/bin/whisper-cli", ["-f", "a.wav"], { iptal: jm, timeout: 7200000 });
  ok("macOS: süreç açıldı (PATH Homebrew'la genişletilmiş)", m.cagrilar.spawn.length === 1 && /\/opt\/homebrew\/bin/.test(m.cagrilar.spawn[0].o.env.PATH) && m.K.surecSayisi() === 1);
  jm.iptal();
  var rm = await ism;
  ok("macOS: child.kill('SIGKILL'), taskkill yok", m.cagrilar.kill.length === 1 && m.cagrilar.kill[0].sig === "SIGKILL" && m.cagrilar.execFile.length === 0, js(m.cagrilar));
  ok("macOS: { code: -2, iptal: true }, sayaç 0, zamanlayıcı yok", rm.code === -2 && rm.iptal === true && m.K.surecSayisi() === 0 && m.zamanlayicilar() === 0);

  /* ---------- birden çok süreç: yalnız iptal edilen ölür ---------- */
  var w2 = yukle("win32");
  var ja = w2.K.iptalJetonu(), jb = w2.K.iptalJetonu();
  var isA = w2.K.run("ffmpeg.exe", ["-i", "a"], { iptal: ja });
  var isB = w2.K.run("ffmpeg.exe", ["-i", "b"], { iptal: jb });
  var isC = w2.K.run("ffmpeg.exe", ["-i", "c"], {});
  ok("üç süreç: sayaç 3, üç zamanlayıcı", w2.K.surecSayisi() === 3 && w2.zamanlayicilar() === 3);
  ja.iptal();
  var rA = await isA;
  ok("A iptal: sayaç 2, B ve C sürüyor, yalnız A'nın pid'i öldürüldü", rA.iptal === true && w2.K.surecSayisi() === 2 && w2.zamanlayicilar() === 2 &&
    w2.cagrilar.execFile.length === 1 && w2.cagrilar.execFile[0].args[1] === String(w2.cocuklar[0].pid));
  w2.cocuklar[1].emit("close", 0);
  var rB = await isB;
  ok("B normal bitti: kod 0, iptal alanı yok, sayaç 1", rB.code === 0 && rB.iptal === undefined && w2.K.surecSayisi() === 1);
  jb.iptal();
  ok("biten işin jetonunu iptal etmek süreci öldürmeye çalışmaz", w2.cagrilar.execFile.length === 1);
  w2.cocuklar[2].emit("close", 0);
  await isC;
  ok("hepsi bitti: sayaç 0, zamanlayıcı 0", w2.K.surecSayisi() === 0 && w2.zamanlayicilar() === 0);

  /* ---------- başlamadan iptal edilmiş iş ---------- */
  var w3 = yukle("win32");
  var j3 = w3.K.iptalJetonu();
  j3.iptal();
  var r3 = await w3.K.run("whisper-cli.exe", [], { iptal: j3 });
  ok("iptal edilmiş jetonla run süreç açmaz", r3.code === -2 && r3.iptal === true && w3.cagrilar.spawn.length === 0 && w3.K.surecSayisi() === 0);

  /* ---------- zaman aşımı yolu eskisi gibi; jeton dinleyicisi bırakılır ---------- */
  var w4 = yukle("win32");
  var j4 = w4.K.iptalJetonu();
  var r4 = await w4.K.run("ffmpeg.exe", [], { iptal: j4, timeout: 20 });
  ok("zaman aşımı: kod -1, [zaman aşımı], sayaç 0", r4.code === -1 && /zaman aşımı/.test(r4.stderr) && w4.K.surecSayisi() === 0 && w4.zamanlayicilar() === 0);
  j4.iptal();
  ok("zaman aşımından sonra iptal: taskkill çağrılmaz (dinleyici bırakıldı)", w4.cagrilar.execFile.length === 0);

  /* ---------- jeton ---------- */
  var w5 = yukle("win32");
  var j5 = w5.K.iptalJetonu(), say = 0;
  var birak = j5.dinle(function () { say += 10; });
  j5.dinle(function () { say += 1; });
  birak();
  j5.iptal(); j5.iptal();
  var hemen = 0;
  j5.dinle(function () { hemen++; });
  ok("jeton: bırakılan dinleyici çağrılmaz, iptal bir kez, sonradan dinleyen hemen çağrılır", say === 1 && hemen === 1 && j5.iptalEdildi === true, "say=" + say + " hemen=" + hemen);
  var hata = w5.K.iptalHatasi();
  ok("iptalHatasi: e.iptal ve 'İptal edildi', özel mesaj", hata.message === "İptal edildi" && hata.iptal === true && w5.K.iptalHatasi("x").message === "x");
}

/* ---------- indirme ve yükleme iptali (gerçek HTTP) ---------- */

var TOPLAM = 4 * 1024 * 1024;
var VERI = Buffer.alloc(TOPLAM);
for (var i = 0; i < TOPLAM; i++) VERI[i] = (i * 7) % 251;
var yuklemeGeldi = 0;
var sunucu = http.createServer(function (req, res) {
  if (req.method === "POST") {
    yuklemeGeldi++;
    req.on("data", function () {});
    // cevap hiç gelmez (yavaş bulut API'si gibi); istemci iptal edince bağlantı kapanır
    return;
  }
  var bas = 0;
  var m = /bytes=(\d+)-/.exec(req.headers.range || "");
  if (m) bas = Number(m[1]);
  if (req.url === "/hizli" || bas > 0) {
    res.writeHead(bas > 0 ? 206 : 200, bas > 0
      ? { "content-length": String(TOPLAM - bas), "content-range": "bytes " + bas + "-" + (TOPLAM - 1) + "/" + TOPLAM }
      : { "content-length": String(TOPLAM) });
    res.end(VERI.slice(bas));
    return;
  }
  // yavaş: 64 KB parçalar, 10 ms arayla
  res.writeHead(200, { "content-length": String(TOPLAM) });
  var p = 0;
  (function yaz() {
    if (p >= TOPLAM || res.destroyed) { try { res.end(); } catch (e) {} return; }
    res.write(VERI.slice(p, p + 65536));
    p += 65536;
    setTimeout(yaz, 10);
  })();
});

async function agTestleri() {
  await new Promise(function (r) { sunucu.listen(0, "127.0.0.1", r); });
  var url = "http://127.0.0.1:" + sunucu.address().port;
  var b = yukle(process.platform === "darwin" ? "darwin" : "win32");
  var K = b.K;
  var hedef = path.join(TMP, "model.bin");
  var j = K.iptalJetonu();
  var ilerleme = 0;
  var is = K.download(url + "/yavas", hedef, function (f) { ilerleme = f; }, 0, undefined, { key: "model:x", iptal: j });
  // .part 64 KB'ı geçince (devam eşiği) iptal et
  for (var t = 0; t < 400; t++) {
    await bekle(10);
    try { if (fs.statSync(hedef + ".part").size > 400000) break; } catch (e) {}
  }
  j.iptal();
  var r = await is;
  var part = 0;
  try { part = fs.statSync(hedef + ".part").size; } catch (e) {}
  ok("indirme iptali: { ok: false, iptal: true }, nihai dosya yok", r.ok === false && r.iptal === true && !fs.existsSync(hedef), js(r));
  ok("indirme iptali: .part ve kimlik dosyası korunur", part > 65536 && part < TOPLAM && fs.existsSync(hedef + ".part.json"), "part=" + part + " ilerleme=" + ilerleme.toFixed(2));
  ok("indirme iptali: kept korunan baytı söyler", r.kept > 0 && r.kept <= TOPLAM, "kept=" + r.kept);
  // sunucunun hızlı yolu: kaldığı yerden devam (206) ve dosya birebir
  var r2 = await K.download(url + "/hizli", hedef, null, 0, undefined, { key: "model:x" });
  ok("iptalden sonra kaldığı yerden devam: dosya birebir", r2.ok === true && Buffer.compare(fs.readFileSync(hedef), VERI) === 0, js(r2));
  var j2 = K.iptalJetonu();
  j2.iptal();
  var r3 = await K.download(url + "/hizli", path.join(TMP, "hic.bin"), null, 0, undefined, { key: "x", iptal: j2 });
  ok("iptal edilmiş jetonla indirme başlamaz", r3.ok === false && r3.iptal === true && !fs.existsSync(path.join(TMP, "hic.bin")));

  var ju = K.iptalJetonu();
  var up = K.httpUpload(url + "/yukle", {}, { model: "whisper" }, Buffer.from("ses"), "a.mp3", "audio/mpeg", { iptal: ju });
  for (var t2 = 0; t2 < 100 && !yuklemeGeldi; t2++) await bekle(10);
  ju.iptal();
  var ru = await up;
  ok("yükleme iptali: { status: 0, iptal: true }", ru.status === 0 && ru.iptal === true && yuklemeGeldi === 1, js(ru));
  sunucu.close();
}

surecTestleri().then(agTestleri).catch(function (e) { ok("beklenmeyen hata: " + (e && e.stack || e), false); }).then(function () {
  try { fs.readdirSync(TMP).forEach(function (f) { fs.unlinkSync(path.join(TMP, f)); }); fs.rmdirSync(TMP); } catch (e) {}
  try { sunucu.close(); } catch (e2) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
});
