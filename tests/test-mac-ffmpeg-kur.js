// Suflo testi: macOS'ta Ayarlar › ffmpeg kurulumu (gerçek app.js + bridge.js, sahte DOM / sahte Node).
//   * Homebrew'un sade ffmpeg'i libass'siz: libassUyarisi "Suflo'nun ffmpeg'ini kur" der; düğme artık brew'u
//     yeniden koşup "kuruldu" demez, Suflo'nun libass'li ffmpeg'ini (KEngine.installFfmpeg) indirir
//   * durum satırı libass'siz ffmpeg'e yeşil ✓ demez
//   * hiç ffmpeg yokken brew denenir; sonucu libass'siz ise yine Suflo'nun ffmpeg'i iner
//   * Premiere Rosetta'da açıldıysa /opt/homebrew'daki brew arch -arm64 ile çağrılır
var realFs = require("fs"), vm = require("vm"), P = require("path").posix, path = require("path");
var ROOT = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

function ortam(o) {
  o = o || {};
  var ev = "/Users/samet", ogeler = {}, belgeOlay = {}, komutlar = [], dosyalar = {};
  (o.dosyalar || []).forEach(function (d) { dosyalar[d] = true; });
  function oge(id) {
    if (ogeler[id]) return ogeler[id];
    var x = { id: id, _m: "", hidden: true, disabled: false, value: "", className: "", style: {}, dataset: {}, children: [], checked: false,
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
      addEventListener: function (e, f) { x["on_" + e] = f; }, appendChild: function () {}, remove: function () {},
      querySelector: function () { return null; }, querySelectorAll: function () { return []; }, focus: function () {}, click: function () {},
      insertBefore: function () {}, setAttribute: function () {}, removeAttribute: function () {}, getAttribute: function () { return null; } };
    Object.defineProperty(x, "textContent", { get: function () { return x._m; }, set: function (v) { x._m = String(v); } });
    Object.defineProperty(x, "innerHTML", { get: function () { return x._m; }, set: function (v) { x._m = String(v); } });
    ogeler[id] = x; return x;
  }
  // brew install ffmpeg: Homebrew'un sade (libass'siz) ffmpeg'ini kurar
  function brewKurar() { dosyalar["/opt/homebrew/bin/ffmpeg"] = true; }
  var sandbox = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    JSON: JSON, Math: Math, Date: Date, String: String, Number: Number, Boolean: Boolean, Object: Object, Array: Array,
    Error: Error, RegExp: RegExp, Promise: Promise, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, URL: URL, Buffer: Buffer,
    setTimeout: function () {}, clearTimeout: function () {}, setInterval: function () {}, clearInterval: function () {},
    navigator: { platform: "MacIntel", userAgent: "Mac OS X" },
    process: { platform: "darwin", env: { PATH: "/usr/bin" }, cwd: function () { return ev; } },
    window: { addEventListener: function () {} },
    document: { getElementById: oge, createElement: function () { return oge("_g" + Math.random()); }, querySelector: function () { return null; },
      querySelectorAll: function () { return []; }, addEventListener: function (e, f) { belgeOlay[e] = f; }, body: oge("_body"), documentElement: oge("_html") },
    CSInterface: function () { return { getSystemPath: function () { return ev; }, evalScript: function (s, cb) { cb && cb('{"ok":false}'); },
      openURLInDefaultBrowser: function () {} }; },
    require: function (m) {
      if (m === "fs") return {
        existsSync: function (p) { return !!dosyalar[String(p)]; }, mkdirSync: function (p) { dosyalar[String(p)] = true; },
        readdirSync: function () { return []; }, statSync: function () { return { size: 1, mtimeMs: Date.now(), isDirectory: function () { return false; } }; },
        readFileSync: function () { return "{}"; }, writeFileSync: function (p) { dosyalar[String(p)] = true; }, unlinkSync: function () {},
        renameSync: function () {}, accessSync: function () {}, chmodSync: function () {}, copyFileSync: function () {}, constants: { W_OK: 2 } };
      if (m === "path") return P;
      if (m === "os") return { homedir: function () { return ev; }, tmpdir: function () { return "/tmp"; }, arch: function () { return o.arch || "arm64"; },
        platform: function () { return "darwin"; }, cpus: function () { return [1, 2]; } };
      if (m === "child_process") return {
        execFileSync: function (cmd, args) {
          if (cmd === "/usr/sbin/sysctl" && o.rosetta) return "1\n";
          throw new Error("sysctl: unknown oid 'sysctl.proc_translated'");
        },
        spawn: function (cmd, args) {
          komutlar.push(cmd + " " + (args || []).join(" "));
          var h = {};
          var c = { stdout: { setEncoding: function () {}, on: function (e, f) { h.out = f; } }, stderr: { setEncoding: function () {}, on: function (e, f) { h.err = f; } },
            on: function (e, f) { h[e] = f; }, kill: function () {} };
          var isFf = /ffmpeg$/.test(cmd), kod = 0, cikti = "";
          var brewMu = /brew$/.test(cmd) || (cmd === "/usr/bin/arch" && /brew$/.test(String(args[1])));
          if (isFf && !dosyalar[cmd] && cmd !== "ffmpeg") kod = 1;
          else if (isFf && cmd === "ffmpeg" && !dosyalar["/opt/homebrew/bin/ffmpeg"]) kod = 1;   // PATH'te de yok
          else if (isFf && args[0] === "-version") cikti = "ffmpeg version 8.0 Copyright (c) 2000-2025";
          else if (isFf && args.indexOf("-filters") !== -1) cikti = " ... scale  V->V  Scale the input video size\n";   // subtitles/ass yok
          else if (brewMu) { brewKurar(); cikti = "==> Pouring ffmpeg"; }
          else if (!isFf) kod = 1;
          Promise.resolve().then(function () { if (cikti && h.out) h.out(cikti); if (h.close) h.close(kod); });
          return c;
        }
      };
      if (m === "http" || m === "https") { var ist = function () { var n = { on: function (e, f) { if (e === "error") Promise.resolve().then(function () { f(new Error("ag yok")); }); return n; }, setTimeout: function () { return n; }, destroy: function () {}, end: function () {}, write: function () {} }; return n; }; return { get: ist, request: ist }; }
      if (m === "buffer") return { Buffer: Buffer };
      if (m === "crypto") return require("crypto");
      throw new Error("modul: " + m);
    }
  };
  sandbox.CSInterface.SystemPath = { USER_DATA: ev, EXTENSION: ev };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(realFs.readFileSync(path.join(ROOT, "js", "bridge.js"), "utf8"), sandbox, { filename: "bridge.js" });
  var K = sandbox.window.K; sandbox.K = K;
  var sayac = { suflo: 0 };
  sandbox.window.KEngine = { installedModels: function () { return []; }, activeModel: function () { return null; }, gpuInfo: function () { return null; },
    installedBuild: function () { return "cpu"; }, vadPath: function () { return null; }, MODELS: [], fmtMB: function (n) { return n + " MB"; },
    detectGpu: function () { return Promise.resolve({ kind: "metal" }); },
    installFfmpeg: function () { sayac.suflo++; return Promise.resolve(ev + "/Library/Application Support/Suflo/ffmpeg/ffmpeg"); } };
  sandbox.KEngine = sandbox.window.KEngine;
  sandbox.Pro = { isPro: function () { return false; }, gate: function () { return false; }, on: function () {}, onUpgrade: function () {}, init: function () {}, status: function () { return { pro: false }; } };
  sandbox.KCaptions = sandbox.window.KCaptions = { refreshSetup: function () {}, glossaryText: function () { return ""; }, parseGlossary: function () { return []; }, init: function () {},
    ayarDegisti: function () {}, onbellegiTemizle: function () {}, transcriptCache: function () { return null; } };
  vm.runInContext(realFs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8"), sandbox, { filename: "app.js" });
  try { belgeOlay.DOMContentLoaded(); } catch (e) {}
  return { K: K, oge: oge, komutlar: komutlar, sayac: sayac };
}
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  // 1) Homebrew'un libass'siz ffmpeg'i kurulu: uyarının yönlendirdiği düğme Suflo'nun ffmpeg'ini kurar
  var a = ortam({ dosyalar: ["/opt/homebrew/bin/brew", "/opt/homebrew/bin/ffmpeg"] });
  await bekle(30);
  await a.K.findFfmpeg(true);
  ok("libass'siz brew ffmpeg seçili, uyarı Suflo'nun ffmpeg'ini önerir", a.K.ffmpegLibass() === false && /Suflo'nun ffmpeg'ini kur/.test(a.K.libassUyarisi()));
  var btn = a.oge("set-ffmpeg-install");
  ok("Ayarlar düğmesi 'Homebrew ile kur' değil, 'Suflo'nun ffmpeg'ini kur'", btn.textContent === "Suflo'nun ffmpeg'ini kur", btn.textContent);
  ok("durum satırı libass'siz ffmpeg'e yeşil ✓ demez", /warn/.test(a.oge("set-ffmpeg-status").className) && !/^✓/.test(a.oge("set-ffmpeg-status").textContent) &&
    /libass yok/.test(a.oge("set-ffmpeg-status").textContent), a.oge("set-ffmpeg-status").textContent);
  a.komutlar.length = 0;
  btn.on_click();
  await bekle(80);
  ok("tıklama brew install ffmpeg koşmaz, Suflo'nun ffmpeg'ini (KEngine.installFfmpeg) indirir",
    !a.komutlar.some(function (k) { return /brew install/.test(k); }) && a.sayac.suflo === 1, JSON.stringify(a.komutlar) + " suflo=" + a.sayac.suflo);

  // 2) brew var, hiç ffmpeg yok: brew denenir, kurduğu libass'siz çıkınca yine Suflo'nun ffmpeg'i iner
  var b = ortam({ dosyalar: ["/opt/homebrew/bin/brew"] });
  await bekle(30);
  b.komutlar.length = 0;
  b.oge("set-ffmpeg-install").on_click();
  await bekle(80);
  ok("ffmpeg yokken brew denenir; libass'siz sonuç 'kuruldu' sayılmaz, Suflo'nun ffmpeg'i iner",
    b.komutlar.some(function (k) { return k === "/opt/homebrew/bin/brew install ffmpeg"; }) && b.sayac.suflo === 1, JSON.stringify(b.komutlar) + " suflo=" + b.sayac.suflo);

  // 3) Apple Silicon, Premiere Rosetta'da: /opt/homebrew'daki brew arch -arm64 ile
  var c = ortam({ dosyalar: ["/opt/homebrew/bin/brew"], arch: "x64", rosetta: true });
  await bekle(30);
  c.komutlar.length = 0;
  c.oge("set-ffmpeg-install").on_click();
  await bekle(80);
  ok("Rosetta: brew /usr/bin/arch -arm64 ile çağrılır ('Cannot install under Rosetta 2' yok)",
    c.komutlar.some(function (k) { return k === "/usr/bin/arch -arm64 /opt/homebrew/bin/brew install ffmpeg"; }) && !c.komutlar.some(function (k) { return /^\/opt\/homebrew\/bin\/brew /.test(k); }),
    JSON.stringify(c.komutlar));
  ok("Rosetta: Apple Silicon sayılır (Metal), Intel'de çeviri yok", c.K.macMetal() === true && c.K.rosettaAltinda() === true &&
    ortam({ arch: "x64" }).K.macMetal() === false);

  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL beklenmeyen hata: " + (e && e.stack || e)); process.exit(1); });
