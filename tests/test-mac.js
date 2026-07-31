var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * GERCEK bridge.js + engine.js'i "macOS" gibi davranan bir ortamda calistirir.
 * process.platform, os.homedir, os.arch ve fs sahte; boylece Windows'ta
 * mac yollarinin/kararlarinin dogrulugu olculebilir.
 */
var realFs = require("fs");
var pathPosix = require("path").posix;
var vm = require("vm");

var KOK = KOKYOL + "js/";
var sonuc = [];
function chk(ad, k, ek) { sonuc.push((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

/* ---------- sahte dosya sistemi ---------- */
function sahteFs(varOlanlar) {
  var kume = {};
  varOlanlar.forEach(function (p) { kume[p] = true; });
  return {
    _kume: kume,
    existsSync: function (p) { return !!kume[String(p)]; },
    mkdirSync: function (p) { kume[String(p)] = true; },
    // gercek bir dizin gibi davran: kayitli yollardan bu dizinin cocuklarini uret
    readdirSync: function (p) {
      var dir = String(p).replace(/\/+$/, "") + "/";
      var cocuklar = {}, bulundu = !!kume[String(p)];
      Object.keys(kume).forEach(function (yol) {
        if (yol.indexOf(dir) !== 0) return;
        bulundu = true;
        cocuklar[yol.slice(dir.length).split("/")[0]] = true;
      });
      if (!bulundu) { var e = new Error("ENOENT " + p); throw e; }
      return Object.keys(cocuklar);
    },
    statSync: function (p) { return { size: 999999999, mtimeMs: Date.now(), isDirectory: function () { return false; } }; },
    readFileSync: function () { return "{}"; },
    writeFileSync: function (p) { kume[String(p)] = true; },
    unlinkSync: function (p) { delete kume[String(p)]; },
    renameSync: function (a, b) { delete kume[String(a)]; kume[String(b)] = true; },
    createWriteStream: function () { return { on: function () {}, close: function (cb) { cb && cb(); }, destroy: function () {} }; },
    accessSync: function () {},
    constants: { W_OK: 2 },
    utimesSync: function () {},
    rmSync: function () {}
  };
}

function macOrtam(opts) {
  opts = opts || {};
  var fsStub = sahteFs(opts.dosyalar || []);
  var kosulanKomutlar = [];

  var sandbox = {
    console: console, JSON: JSON, Math: Math, Date: Date, String: String, Number: Number,
    Object: Object, Array: Array, Error: Error, RegExp: RegExp, Promise: Promise,
    isFinite: isFinite, parseInt: parseInt, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent, URL: URL, Buffer: Buffer,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () {},
    navigator: { platform: "MacIntel", userAgent: "Mac OS X" },
    process: { platform: "darwin", env: { PATH: "/usr/bin:/bin" }, cwd: function () { return "/"; } },
    window: {},
    document: { getElementById: function () { return null; }, addEventListener: function () {} },
    CSInterface: function () {
      return {
        getSystemPath: function () { return "/Users/samet/Library/Application Support"; },
        evalScript: function (s, cb) { cb && cb(JSON.stringify({ ok: false })); }
      };
    },
    require: function (m) {
      if (m === "fs") return fsStub;
      if (m === "path") return pathPosix;
      if (m === "os") {
        return {
          homedir: function () { return "/Users/samet"; },
          tmpdir: function () { return "/var/folders/tmp"; },
          arch: function () { return opts.arch || "arm64"; },
          platform: function () { return "darwin"; }
        };
      }
      if (m === "child_process") {
        return {
          spawn: function (cmd, args, o) {
            kosulanKomutlar.push({ cmd: cmd, args: args, env: o && o.env ? o.env.PATH : null });
            var cb = {};
            var handlers = {};
            var child = {
              stdout: { on: function (e, f) { handlers["out"] = f; } },
              stderr: { on: function (e, f) { handlers["err"] = f; } },
              on: function (e, f) { handlers[e] = f; },
              kill: function () {}
            };
            setTimeout(function () {
              var cikti = opts.komutCikti ? opts.komutCikti(cmd, args) : { code: 0, out: "", err: "" };
              if (cikti.out && handlers["out"]) handlers["out"](Buffer.from(cikti.out));
              if (cikti.err && handlers["err"]) handlers["err"](Buffer.from(cikti.err));
              if (handlers["close"]) handlers["close"](cikti.code);
            }, 1);
            return child;
          }
        };
      }
      /*
       * Ag sahtesi SESSIZCE ASILMAZ: hemen hata verir. Once hicbir sey yapmayan
       * bir stub vardi ve gercek kodda bir indirme eklendiginde test cikti
       * uretmeden donuyordu — kirilma "gecti" gibi gorunuyordu.
       */
      if (m === "http" || m === "https") {
        var sahteIstek = function () {
          var h = {};
          var nesne = {
            on: function (e, f) { if (e === "error") setTimeout(function () { f(new Error("testte ag yok")); }, 1); return nesne; },
            setTimeout: function () { return nesne; },
            destroy: function () {}, end: function () {}, write: function () {}
          };
          return nesne;
        };
        return { get: sahteIstek, request: sahteIstek };
      }
      if (m === "buffer") return { Buffer: Buffer };
      throw new Error("bilinmeyen modul: " + m);
    }
  };
  sandbox.CSInterface.SystemPath = { USER_DATA: "u", EXTENSION: "e" };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(realFs.readFileSync(KOK + "bridge.js", "utf8"), sandbox, { filename: "bridge.js" });
  sandbox.K = sandbox.window.K;
  vm.runInContext(realFs.readFileSync(KOK + "engine.js", "utf8"), sandbox, { filename: "engine.js" });
  return { K: sandbox.window.K, KEngine: sandbox.window.KEngine, komutlar: kosulanKomutlar, fs: fsStub };
}

/* ================= 1) Platform tespiti ve yollar ================= */
var e1 = macOrtam({});
chk("MAC dogru tespit edildi", e1.K.MAC === true);
chk("WIN false", e1.K.WIN === false);
chk("Apple Silicon -> Metal", e1.K.macMetal() === true);
chk("whisperDir mac yolunda (AppData YOK)",
  e1.K.whisperDir() === "/Users/samet/Library/Application Support/Suflo/whisper", e1.K.whisperDir());
chk("Intel Mac'te Metal kapali", macOrtam({ arch: "x64" }).K.macMetal() === false);

/* ================= 2) Homebrew tespiti ================= */
chk("brew yoksa null", e1.K.brewYolu() === null, String(e1.K.brewYolu()));
var e2 = macOrtam({ dosyalar: ["/opt/homebrew/bin/brew"] });
chk("Apple Silicon brew bulundu", e2.K.brewYolu() === "/opt/homebrew/bin/brew", e2.K.brewYolu());
var e3 = macOrtam({ dosyalar: ["/usr/local/bin/brew"] });
chk("Intel brew bulundu", e3.K.brewYolu() === "/usr/local/bin/brew", e3.K.brewYolu());

/* ================= 3) whisperLocal Homebrew motorunu buluyor ================= */
var e4 = macOrtam({ dosyalar: ["/opt/homebrew/bin/whisper-cli"] });
var lw = e4.K.whisperLocal({ skipModel: true });
chk("mac motoru brew yolundan bulundu", lw && lw.exe === "/opt/homebrew/bin/whisper-cli", lw && lw.exe);
chk("motor yoksa null doner", macOrtam({}).K.whisperLocal({ skipModel: true }) === null);

/* ================= 4) ffmpeg adaylari mac yollari ================= */
var ff = null;
(function () {
  /*
   * ffmpegCandidates disa acilmiyor; hangi yollarin denendigini komut kaydindan
   * goruyoruz. Diskte VAR OLAN yollar verilir: findFfmpeg olmayan mutlak yollari
   * bilerek atliyor (on iki aday icin bosuna surec baslatmasin diye).
   */
  var e = macOrtam({
    dosyalar: ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"],
    komutCikti: function (cmd) { return { code: 1, out: "", err: "" }; }
  });
  return e.K.findFfmpeg(true).then(function () {
    var denenen = e.komutlar.map(function (k) { return k.cmd; });
    chk("ffmpeg /opt/homebrew denendi", denenen.indexOf("/opt/homebrew/bin/ffmpeg") !== -1, denenen.join(", "));
    chk("ffmpeg /usr/local denendi", denenen.indexOf("/usr/local/bin/ffmpeg") !== -1);
    chk("Windows winget yollari DENENMEDI",
      denenen.filter(function (d) { return /WinGet|ffmpeg\.exe/i.test(d); }).length === 0);
    chk("spawn PATH'i Homebrew iceriyor",
      e.komutlar.length > 0 && /\/opt\/homebrew\/bin/.test(e.komutlar[0].env || ""), (e.komutlar[0] || {}).env);
  });
})();

/* Olmayan mutlak yollar icin surec baslatilmamali (kurulumu yavaslatiyordu) */
(function () {
  var e = macOrtam({ komutCikti: function () { return { code: 1, out: "", err: "" }; } });
  return e.K.findFfmpeg(true).then(function () {
    var mutlakDenemeler = e.komutlar.filter(function (k) { return /^\//.test(String(k.cmd)); });
    chk("diskte olmayan mutlak yollar denenmiyor", mutlakDenemeler.length === 0,
      mutlakDenemeler.map(function (k) { return k.cmd; }).join(", ") || "hicbiri");
  });
})();

/* ================= 5) unzip mac araclarini kullaniyor ================= */
(function () {
  var e = macOrtam({ komutCikti: function (cmd) { return { code: cmd === "/usr/bin/unzip" ? 0 : 1 }; } });
  return e.K.unzip("/tmp/a.zip", "/tmp/dest").then(function (ok) {
    chk("mac unzip basarili", ok === true);
    chk("/usr/bin/unzip kullanildi", e.komutlar[0] && e.komutlar[0].cmd === "/usr/bin/unzip",
      e.komutlar.map(function (k) { return k.cmd; }).join(", "));
    chk("powershell/tar.exe CAGRILMADI",
      e.komutlar.filter(function (k) { return /powershell|tar\.exe/i.test(k.cmd); }).length === 0);
  });
})();

/* ================= 6) install(): brew yoksa ANLASILIR hata ================= */
var isler = [];
isler.push((function () {
  var e = macOrtam({});
  return e.KEngine.install({ modelId: "turbo", useGpu: true, onStatus: function () {} })
    .then(function () { chk("brew yoksa install hata vermeli", false, "hata atmadi"); })
    .catch(function (err) {
      chk("brew yoksa Homebrew'i anlatan hata", /Homebrew/.test(err.message), err.message.slice(0, 90));
      chk("hata 'Motor arsivi acilamadi' DEGIL", !/arşivi açılamadı|arsivi acilamadi/i.test(err.message));
      chk("Groq alternatifi onerildi", /Groq/.test(err.message));
    });
})());

/* ================= 7) install(): brew varsa whisper-cpp kurulur, zip INMEZ ================= */
isler.push((function () {
  var e = macOrtam({
    // ffmpeg zaten kurulu: install() artik ffmpeg'i de kuruyor, burada olculen o degil
    dosyalar: ["/opt/homebrew/bin/brew", "/opt/homebrew/bin/ffmpeg"],
    komutCikti: function (cmd, args) {
      // brew install cagrildiktan sonra motor "kurulmus" olsun
      if (cmd === "/opt/homebrew/bin/brew" && args[0] === "install") {
        e.fs._kume["/opt/homebrew/bin/whisper-cli"] = true;
        return { code: 0, out: "installed", err: "" };
      }
      if (/ffmpeg$/.test(String(cmd)) && args && args[0] === "-version") {
        return { code: 0, out: "ffmpeg version 7.1", err: "" };
      }
      return { code: 0, out: "", err: "" };
    }
  });
  // model + VAD indirmesini atla: zaten kurulu say
  e.K.download = function () { return Promise.resolve({ ok: true }); };
  e.fs._kume["/Users/samet/Library/Application Support/Suflo/whisper/models/ggml-large-v3-turbo-q5_0.bin"] = true;
  e.fs._kume["/Users/samet/Library/Application Support/Suflo/whisper/models/ggml-silero-v5.1.2.bin"] = true;
  return e.KEngine.install({ modelId: "turbo", useGpu: true, onStatus: function () {} })
    .then(function (res) {
      var komutlar = e.komutlar.map(function (k) { return k.cmd + " " + (k.args || []).join(" "); });
      chk("brew install whisper-cpp kosuldu",
        komutlar.filter(function (c) { return /brew install whisper-cpp/.test(c); }).length === 1,
        komutlar.slice(0, 3).join(" | "));
      chk("Apple Silicon'da derleme 'metal'", res.build === "metal", res.build);
      chk("Windows zip'i INDIRILMEDI (nvidia-smi de cagrilmadi)",
        komutlar.filter(function (c) { return /nvidia-smi|engine-cuda|engine-cpu/.test(c); }).length === 0,
        komutlar.join(" | ").slice(0, 120));
    })
    .catch(function (err) { chk("brew varsa install gecmeli", false, err.message.slice(0, 120)); });
})());

Promise.all(isler).then(function () {
  setTimeout(function () {
    console.log(sonuc.join("\n"));
    var f = sonuc.filter(function (x) { return x.indexOf("FAIL") === 0; }).length;
    console.log("\n" + (sonuc.length - f) + "/" + sonuc.length + " gecti");
    process.exit(f ? 1 : 0);
  }, 200);
});
