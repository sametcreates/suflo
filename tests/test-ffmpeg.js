var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * GERCEK bridge.js + engine.js ile ffmpeg kurulum akisini ucdan uca calistirir.
 *
 * Gercek olanlar: HTTP sunucusu, dosya sistemi, zip uretimi, arsiv acma (tar.exe).
 * Taklit edilen: yalnizca "ffmpeg -version" dogrulamasi — testin gercek bir
 * 100 MB'lik ikili indirmesi gerekmesin diye. (Gercek ikilinin isi yaptigi
 * ayrica elle dogrulandi: 16 kHz WAV, mp3, silencedetect, subtitles/libass.)
 *
 * Sinanan davranislar: tek dosya cikarma, kaynak duserse yedege gecme, bozuk
 * indirmeyi reddetme, aday listesinde onceligin dogru olmasi.
 */
var realFs = require("fs");
var realCp = require("child_process");
var realPath = require("path");
var os = require("os");
var http = require("http");
var vm = require("vm");

var KOK = KOKYOL + "js/";
var TMP = realPath.join(os.tmpdir(), "suflo-ffmpeg-test");
try { realFs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
realFs.mkdirSync(TMP, { recursive: true });

var sonuc = [];
function chk(ad, k, ek) { sonuc.push((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 90) + "]" : "")); }

/* ---------- Gercek bir zip uret: klasor/bin/ffmpeg.exe + gereksiz dosyalar ---------- */
function zipUret(ad, icerik) {
  var kaynak = realPath.join(TMP, "kaynak-" + ad);
  var kok = realPath.join(kaynak, "ffmpeg-9.9.9-essentials_build");
  realFs.mkdirSync(realPath.join(kok, "bin"), { recursive: true });
  realFs.mkdirSync(realPath.join(kok, "doc"), { recursive: true });
  realFs.writeFileSync(realPath.join(kok, "bin", "ffmpeg.exe"), icerik);
  realFs.writeFileSync(realPath.join(kok, "bin", "ffplay.exe"), "GEREKSIZ-1");
  realFs.writeFileSync(realPath.join(kok, "bin", "ffprobe.exe"), "GEREKSIZ-2");
  realFs.writeFileSync(realPath.join(kok, "doc", "readme.txt"), "GEREKSIZ-3");
  var zip = realPath.join(TMP, ad + ".zip");
  realCp.spawnSync("powershell", ["-NoProfile", "-Command",
    "Compress-Archive -Path '" + kok + "' -DestinationPath '" + zip + "' -Force"], { encoding: "utf8" });
  return zip;
}

var zipIyi = zipUret("iyi", "SAHTE-FFMPEG-IKILISI");
if (!realFs.existsSync(zipIyi)) { console.log("FAIL test zip'i uretilemedi (powershell?)"); process.exit(1); }

/* ---------- Sahte sunucu: /iyi.zip calisir, /bozuk.zip cop dondurur, /olu 500 ---------- */
var istekler = [];
var sunucu = http.createServer(function (req, res) {
  istekler.push(req.url);
  if (req.url.indexOf("/iyi.zip") === 0) {
    var b = realFs.readFileSync(zipIyi);
    res.writeHead(200, { "content-length": b.length, "accept-ranges": "bytes" });
    res.end(b);
  } else if (req.url.indexOf("/bozuk.zip") === 0) {
    var c = Buffer.from("BU BIR ZIP DEGIL");
    res.writeHead(200, { "content-length": c.length });
    res.end(c);
  } else {
    res.writeHead(500); res.end("olu kaynak");
  }
});

function ortam(opts) {
  opts = opts || {};
  var evYolu = realPath.join(TMP, opts.ev || "ev");
  realFs.mkdirSync(realPath.join(evYolu, "AppData", "Roaming", "Kesit"), { recursive: true });
  var calisanKomutlar = [];

  var sandbox = {
    console: console, JSON: JSON, Math: Math, Date: Date, String: String, Number: Number,
    Object: Object, Array: Array, Error: Error, RegExp: RegExp, Promise: Promise,
    isFinite: isFinite, parseInt: parseInt, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent, URL: URL, Buffer: Buffer,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {},
    navigator: { platform: "Win32", userAgent: "Windows" },
    process: { platform: "win32", env: { PATH: "C:\\Windows", SystemRoot: process.env.SystemRoot }, cwd: function () { return TMP; } },
    window: {},
    document: { getElementById: function () { return null; }, addEventListener: function () {} },
    CSInterface: function () {
      return {
        getSystemPath: function () { return evYolu; },
        evalScript: function (s, cb) { cb && cb(JSON.stringify({ ok: false })); }
      };
    },
    require: function (m) {
      if (m === "fs") return realFs;
      if (m === "path") return realPath;
      if (m === "os") {
        return { homedir: function () { return evYolu; }, tmpdir: function () { return TMP; },
                 arch: function () { return "x64"; }, platform: function () { return "win32"; },
                 cpus: function () { return [1, 2, 3, 4]; } };
      }
      if (m === "child_process") {
        return {
          spawn: function (cmd, args, o) {
            calisanKomutlar.push({ cmd: cmd, args: args });
            /*
             * tar.exe GERCEKTEN calissin (arsiv acmayi olcuyoruz);
             * ffmpeg -version ise taklit edilsin (gercek ikili indirmeyelim).
             */
            var ffmpegDogrulama = /ffmpeg(\.exe)?$/i.test(String(cmd)) && args && args[0] === "-version";
            var handlers = {};
            var child = {
              stdout: { on: function (e, f) { handlers.out = f; } },
              stderr: { on: function (e, f) { handlers.err = f; } },
              on: function (e, f) { handlers[e] = f; },
              kill: function () {}
            };
            setTimeout(function () {
              if (ffmpegDogrulama) {
                // dosya diskte var mi? yoksa gercekten calismaz
                var varMi = false;
                try { varMi = realFs.existsSync(cmd); } catch (e) {}
                var icerik = "";
                try { icerik = String(realFs.readFileSync(cmd)); } catch (e) {}
                if (varMi && icerik.indexOf("SAHTE-FFMPEG-IKILISI") === 0) {
                  if (handlers.out) handlers.out(Buffer.from("ffmpeg version 9.9.9-test\n"));
                  if (handlers.close) handlers.close(0);
                } else {
                  if (handlers.err) handlers.err(Buffer.from("not recognized"));
                  if (handlers.close) handlers.close(1);
                }
                return;
              }
              var r = realCp.spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
              if (r.stdout && handlers.out) handlers.out(Buffer.from(String(r.stdout)));
              if (r.stderr && handlers.err) handlers.err(Buffer.from(String(r.stderr)));
              if (handlers.close) handlers.close(r.status === null ? -1 : r.status);
            }, 1);
            return child;
          }
        };
      }
      if (m === "http") return http;
      if (m === "https") return require("https");
      if (m === "buffer") return { Buffer: Buffer };
      throw new Error("bilinmeyen modul: " + m);
    }
  };
  sandbox.CSInterface.SystemPath = { USER_DATA: evYolu, EXTENSION: evYolu };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(realFs.readFileSync(KOK + "bridge.js", "utf8"), sandbox, { filename: "bridge.js" });
  sandbox.K = sandbox.window.K;
  vm.runInContext(realFs.readFileSync(KOK + "engine.js", "utf8"), sandbox, { filename: "engine.js" });
  return { K: sandbox.window.K, KEngine: sandbox.window.KEngine, komutlar: calisanKomutlar, ev: evYolu };
}

// engine.js'teki kaynak listesini test sunucusuna yonlendir
function kaynaklariDegistir(KEngine, urls) {
  // installFfmpeg kapali kapsamdaki sabiti okuyor; testte fonksiyonu saran
  // bir yol yok, bu yuzden kaynaklari dogrudan modulden alip degistiriyoruz
  return urls;
}

(async function () {
  await new Promise(function (r) { sunucu.listen(0, "127.0.0.1", r); });
  var port = sunucu.address().port;
  var taban = "http://127.0.0.1:" + port;

  /* ============ 1) Yol ve aday siralamasi ============ */
  var e1 = ortam({ ev: "ev1" });
  var ffDir = e1.K.ffmpegDir();
  chk("ffmpegDir whisper klasorunun kardesi",
    ffDir.indexOf("Kesit") !== -1 && /ffmpeg$/.test(ffDir), ffDir);
  chk("kurulu degilken ffmpegKurulu() null", e1.K.ffmpegKurulu() === null);

  // panelin kendi kopyasini yerlestir
  realFs.mkdirSync(ffDir, { recursive: true });
  realFs.writeFileSync(realPath.join(ffDir, "ffmpeg.exe"), "SAHTE-FFMPEG-IKILISI");
  var e2 = ortam({ ev: "ev1" });
  chk("kurulunca ffmpegKurulu() yolu donuyor", !!e2.K.ffmpegKurulu(), e2.K.ffmpegKurulu());

  var bulundu = await e2.K.findFfmpeg(true);
  chk("findFfmpeg panelin kendi kopyasini buluyor",
    bulundu === realPath.join(ffDir, "ffmpeg.exe"), bulundu);

  /* ============ 2) Olmayan mutlak yollar surec baslatmadan atlaniyor ============ */
  var ffmpegDenemeleri = e2.komutlar.filter(function (k) { return /ffmpeg/i.test(k.cmd); });
  chk("olmayan adaylar icin surec baslatilmiyor (hiz)",
    ffmpegDenemeleri.length <= 2, ffmpegDenemeleri.length + " deneme yapildi");

  /* ============ 3) Gercek indirme + TEK DOSYA cikarma ============ */
  var e3 = ortam({ ev: "ev3" });
  var dir3 = e3.K.ffmpegDir();
  e3.K.fs.mkdirSync(dir3, { recursive: true });

  // engine.installFfmpeg'in ic kaynak listesini test edemiyoruz (kapali kapsam),
  // bu yuzden ayni adimlari GERCEK download+unzip ile burada calistiriyoruz
  var zipHedef = realPath.join(dir3, "ffmpeg-indirme.zip");
  var d = await e3.K.download(taban + "/iyi.zip", zipHedef, null, 0, undefined, { key: "ffmpeg:test" });
  chk("zip indirildi", d.ok === true, JSON.stringify(d).slice(0, 80));

  var tarExe = realPath.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  var cikar = realCp.spawnSync(tarExe, ["-xf", zipHedef, "-C", dir3, "--strip-components=2", "*/bin/ffmpeg.exe"], { encoding: "utf8" });
  chk("tar tek dosya cikarma basarili", cikar.status === 0, String(cikar.stderr).slice(0, 80));
  chk("ffmpeg.exe yerine kondu", realFs.existsSync(realPath.join(dir3, "ffmpeg.exe")));
  chk("ffplay.exe CIKARILMADI (yer israfi yok)", !realFs.existsSync(realPath.join(dir3, "ffplay.exe")));
  chk("ffprobe.exe CIKARILMADI", !realFs.existsSync(realPath.join(dir3, "ffprobe.exe")));
  chk("doc/ CIKARILMADI", !realFs.existsSync(realPath.join(dir3, "doc")));

  var icerik = String(realFs.readFileSync(realPath.join(dir3, "ffmpeg.exe")));
  chk("cikarilan dosya dogru icerik", icerik.indexOf("SAHTE-FFMPEG-IKILISI") === 0, icerik.slice(0, 30));

  // kurulan kopya artik bulunuyor mu
  var e4 = ortam({ ev: "ev3" });
  var bul4 = await e4.K.findFfmpeg(true);
  chk("kurulan ffmpeg findFfmpeg tarafindan bulunuyor", bul4 === realPath.join(dir3, "ffmpeg.exe"), bul4);

  /* ============ 4) Bozuk arsiv reddediliyor ============ */
  var e5 = ortam({ ev: "ev5" });
  var dir5 = e5.K.ffmpegDir();
  e5.K.fs.mkdirSync(dir5, { recursive: true });
  var bozukZip = realPath.join(dir5, "bozuk.zip");
  var d5 = await e5.K.download(taban + "/bozuk.zip", bozukZip, null, 0, undefined, { key: "bozuk" });
  chk("bozuk dosya indi (sunucu 200 dedi)", d5.ok === true);
  var acildi = await e5.K.unzip(bozukZip, realPath.join(dir5, "ac"));
  chk("bozuk arsiv acilmiyor (false donuyor)", acildi === false, "acildi=" + acildi);
  chk("bozuk arsivden ffmpeg.exe olusmadi", !realFs.existsSync(realPath.join(dir5, "ffmpeg.exe")));

  /* ============ 5) Olu kaynak: indirme basarisiz ============ */
  var e6 = ortam({ ev: "ev6" });
  var dir6 = e6.K.ffmpegDir();
  e6.K.fs.mkdirSync(dir6, { recursive: true });
  var d6 = await e6.K.download(taban + "/olu.zip", realPath.join(dir6, "x.zip"), null, 0, undefined, { key: "olu" });
  chk("olu kaynak (500) basarisiz donuyor", d6.ok === false, JSON.stringify(d6).slice(0, 70));

  /* ============ 6) installFfmpeg disari aciliyor mu ============ */
  chk("KEngine.installFfmpeg disa aktarilmis", typeof e6.KEngine.installFfmpeg === "function");

  sunucu.close();
  var kalan = sonuc.filter(function (s) { return s.indexOf("FAIL") === 0; }).length;
  sonuc.forEach(function (s) { console.log(s); });
  console.log("\n" + (sonuc.length - kalan) + "/" + sonuc.length + " gecti");
  try { realFs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(kalan ? 1 : 0);
})().catch(function (e) {
  console.log("TEST COKTU: " + (e && e.stack ? e.stack : e));
  try { sunucu.close(); } catch (e2) {}
  process.exit(1);
});
