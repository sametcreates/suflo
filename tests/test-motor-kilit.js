// Suflo testi: KEngine kurulum kilitleri (js/engine.js) — sanal dosya sistemi ve sahte indiriciyle.
//   * aynı anda iki installModel('turbo') tek indirmeyi paylaşır
//   * installModel settings.provider / settings.model'e dokunmaz; arka plan yükseltmesi
//     kullanıcının o arada seçtiği modeli ezmez (SufloOnboarding.modelGecisi)
//   * install() modül düzeyinde kilitli (app.js + Doctor aynı .part'a yazmasın)
//   * ffmpegArkada: ffmpeg motordan ÖNCE indirilmez, model inince arka planda başlar
//   * rehber kurulumu kurulu cuBLAS motorunu CPU sürümüyle ezmez
//   * installFfmpeg kilidi ilerlemeyi her bekleyene iletir
var fs = require("fs"), path = require("path"), vm = require("vm");
var SO = require(path.join(__dirname, "..", "js", "onboarding-steps.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }

var MB = 1048576;
function motor(opts) {
  opts = opts || {};
  var vfs = {};                 // yol -> boyut (dizinler: -1)
  var indirmeler = [];          // { anahtar, hedef }
  var ffAranma = 0;
  var ayarlar = opts.ayarlar || { provider: "groq", model: "small", engineBuild: "cpu" };
  var kok = "/sanal/whisper";
  function dizinMi(p) { return vfs[p] === -1; }
  var sfs = {
    existsSync: function (p) { return Object.prototype.hasOwnProperty.call(vfs, p); },
    mkdirSync: function (p) { vfs[p] = -1; },
    readdirSync: function (d) {
      var out = [];
      Object.keys(vfs).forEach(function (p) { if (path.dirname(p) === d && out.indexOf(path.basename(p)) === -1) out.push(path.basename(p)); });
      return out;
    },
    statSync: function (p) {
      if (!sfs.existsSync(p)) { var e = new Error("ENOENT " + p); e.code = "ENOENT"; throw e; }
      return { size: dizinMi(p) ? 0 : vfs[p], isDirectory: function () { return dizinMi(p); } };
    },
    unlinkSync: function (p) { delete vfs[p]; },
    chmodSync: function () {}
  };
  var K = {
    nodeOK: true, MAC: false, path: path, fs: sfs, os: { arch: function () { return "x64"; } },
    whisperDir: function () { return kok; },
    ffmpegDir: function () { return "/sanal/ffmpeg"; },
    settings: function () { return ayarlar; }, saveSettings: function () { return true; },
    log: function () {},
    brewYolu: function () { return null; }, macMetal: function () { return false; },
    whisperLocal: function (o) {
      if (o && o.skipModel) return { exe: kok + "/whisper-cli.exe", model: null, dir: kok };
      var m = path.join(kok, "models", "ggml-small-q5_1.bin");
      return sfs.existsSync(m) || sfs.existsSync(path.join(kok, "models", "ggml-large-v3-turbo-q5_0.bin")) ? { exe: kok + "/whisper-cli.exe", model: m, dir: kok } : null;
    },
    findFfmpeg: function () { ffAranma++; return Promise.resolve(opts.ffmpeg ? "/usr/bin/ffmpeg" : null); },
    httpGet: function () { return Promise.resolve({ status: 404, body: "" }); },     // SHA bilinmiyor: boyutla devam
    download: function (url, hedef, ilerleme, r, d, meta) {
      indirmeler.push({ anahtar: meta && meta.key, hedef: hedef });
      return new Promise(function (coz) {
        setTimeout(function () {
          if (/^ffmpeg:/.test(meta && meta.key)) { coz({ ok: false, error: "test: ag yok" }); return; }
          vfs[hedef] = Math.round(((meta && meta.expectedMB) || 1) * MB);
          if (ilerleme) ilerleme(1);
          coz({ ok: true });
        }, 15);
      });
    },
    unzip: function () { return Promise.resolve(false); },
    rmrf: function () {},
    run: function () { return Promise.resolve({ code: 0, stdout: "", stderr: "" }); }
  };
  vfs["/sanal"] = -1; vfs[kok] = -1;
  var ctx = { window: {}, K: K, setTimeout: setTimeout, Promise: Promise, Math: Math, JSON: JSON, Error: Error,
    require: require, process: { env: {}, platform: "win32" }, console: console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "engine.js"), "utf8"), ctx);
  return { E: ctx.window.KEngine, vfs: vfs, indirmeler: indirmeler, ayarlar: ayarlar, ffAranma: function () { return ffAranma; } };
}

var m1 = motor();
var ilerlemeA = [], ilerlemeB = [];
var a = m1.E.installModel("turbo", function (s) { ilerlemeA.push(s); });
var b = m1.E.installModel("turbo", function (s) { ilerlemeB.push(s); });
ok("aynı anda iki installModel('turbo') aynı işi döndürür", a === b);
// indirme sürerken kullanıcı Ayarlar'dan başka model seçiyor
m1.ayarlar.model = "base";
Promise.all([a, b]).then(function (r) {
  var turbo = m1.indirmeler.filter(function (x) { return x.anahtar === "model:turbo"; });
  ok("tek indirme (aynı .part dosyasına iki yazıcı yok)", turbo.length === 1 && r[0] === r[1] && r[0].already === false, JSON.stringify(m1.indirmeler));
  ok("installModel settings.provider ve settings.model'e dokunmaz", m1.ayarlar.provider === "groq" && m1.ayarlar.model === "base", JSON.stringify(m1.ayarlar));
  ok("arka plan yükseltmesi kullanıcının seçtiği modeli ezmez", SO.modelGecisi(m1.ayarlar.model, "small", "turbo") === null);
  ok("model hâlâ rehberinkiyse Turbo'ya geçilir", SO.modelGecisi("small", "small", "turbo") === "turbo");
  ok("model kurulu sayılıyor", m1.E.installedModels().some(function (x) { return x.id === "turbo"; }));
  return m1.E.installModel("turbo").then(function (r2) {
    ok("kilit bırakıldı; kurulu modelde yeniden indirme yok", r2.already === true && m1.indirmeler.filter(function (x) { return x.anahtar === "model:turbo"; }).length === 1);
  });
}).then(function () {
  return m1.E.installModel("uydurma").then(function () { ok("bilinmeyen model reddedilir", false); }, function (e) {
    ok("bilinmeyen model reddedilir", /Bilinmeyen model/.test(e.message));
  });
}).then(function () {
  // install(): modül düzeyinde kilit + ffmpegArkada
  var m2 = motor({ ayarlar: { provider: "local", engineBuild: "cpu" } });
  var i1 = m2.E.install({ modelId: "small", useGpu: false, ffmpegArkada: true });
  var i2 = m2.E.install({ modelId: "small" });
  ok("eşzamanlı install() aynı işi paylaşır (app.js + Doctor)", i1 === i2 && m2.E.kurulumSuruyor() === true);
  return i1.then(function (r) {
    var sira = m2.indirmeler.map(function (x) { return x.anahtar; });
    var ilkFfmpeg = sira.findIndex(function (k) { return /^ffmpeg:/.test(k); });
    ok("ffmpegArkada: model ffmpeg'den önce iner, ffmpeg arkada başlar", sira[0] === "model:small" && ilkFfmpeg > sira.indexOf("model:small") && !!r.ffmpegIsi, JSON.stringify(sira));
    ok("install modeli ve yerel rotayı kaydeder (mevcut davranış)", m2.ayarlar.model === "small" && m2.ayarlar.provider === "local");
    ok("tek model indirmesi", sira.filter(function (k) { return k === "model:small"; }).length === 1);
    ok("kilit kurulum bitince bırakılır", m2.E.kurulumSuruyor() === false);
    return r.ffmpegIsi.then(function (yol) {
      ok("arka plan ffmpeg hatası kurulumu bozmaz (null döner)", yol === null);
    });
  });
}).then(function () {
  // ffmpegArkada olmadan: eski davranış, ffmpeg önce aranır/kurulur
  var m3 = motor({ ffmpeg: true, ayarlar: { provider: "local", engineBuild: "cpu" } });
  return m3.E.install({ modelId: "small" }).then(function (r) {
    ok("ffmpeg varsa önden arama yapılır, arka plan işi yok", m3.ffAranma() >= 2 && r.ffmpegIsi === null && r.ffmpeg === true);
  });
}).then(function () {
  // Rehberin kurulum seçenekleri kurulu cuBLAS motorunu CPU zip'iyle EZMEZ
  var m4 = motor({ ayarlar: { provider: "local", engineBuild: "cuda" } });
  var secenek = SO.kurulumSecenekleri({ model: "small", cudaKurulu: true });
  return m4.E.install(secenek).then(function (r) {
    var motorIndirme = m4.indirmeler.filter(function (x) { return /^motor:/.test(x.anahtar); });
    ok("cuBLAS kuruluyken rehber kurulumu motor indirmez, derleme 'cuda' kalır", motorIndirme.length === 0 && m4.ayarlar.engineBuild === "cuda" && r.build === "cuda",
      JSON.stringify(m4.indirmeler.map(function (x) { return x.anahtar; })));
    // Eski davranış (useGpu:false) neden hataydı: CPU zip'i cuBLAS'ın üstüne inerdi
    var m5 = motor({ ayarlar: { provider: "local", engineBuild: "cuda" } });
    return m5.E.install({ modelId: "small", useGpu: false }).then(function () { return null; }, function () { return null; }).then(function () {
      ok("(karşılaştırma) useGpu:false kurulu cuBLAS'ta 'motor:cpu' indirir", m5.indirmeler.some(function (x) { return x.anahtar === "motor:cpu"; }));
    });
  });
}).then(function () {
  // ffmpeg kilidi ilerlemeyi her bekleyene iletir (arkadaki kurulum + "Altyazı oluştur")
  var m6 = motor();
  var a = [], b = [];
  var f1 = m6.E.installFfmpeg(function (x) { a.push(x); });
  var f2 = m6.E.installFfmpeg(function (x) { b.push(x); });
  ok("eşzamanlı installFfmpeg aynı işi paylaşır", f1 === f2);
  ok("sonradan katılan son ilerleme metnini hemen alır", b.length === 1 && b[0] === a[a.length - 1] && /ffmpeg iniyor/.test(b[0]), JSON.stringify(b));
  return f1.then(function () { ok("test ağı yok: ffmpeg kurulamamalıydı", false); }, function () {
    ok("sonraki ilerleme mesajları da ikinci bekleyene akar", b.length >= 2 && b.length === a.length, a.length + " / " + b.length);
    return new Promise(function (coz) { setTimeout(coz, 0); });
  }).then(function () {
    var c = [];
    var f3 = m6.E.installFfmpeg(function (x) { c.push(x); });
    ok("iş bitince kilit ve dinleyiciler bırakılır (yeni iş, eski bekleyene mesaj yok)", f3 !== f1 && c.length >= 1 && b.length === a.length);
    return f3.then(null, function () {});
  });
}).then(function () {
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}).catch(function (e) {
  console.log("FAIL beklenmeyen hata: " + (e && e.stack || e));
  process.exit(1);
});
