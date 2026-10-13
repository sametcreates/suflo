// Suflo testi: KEngine kurulum kilitleri (js/engine.js) — sanal dosya sistemi ve sahte indiriciyle.
//   * aynı anda iki installModel('turbo') tek indirmeyi paylaşır
//   * installModel settings.provider / settings.model'e dokunmaz; arka plan yükseltmesi
//     kullanıcının o arada seçtiği modeli ezmez (SufloOnboarding.modelGecisi)
//   * install() modül düzeyinde kilitli (app.js + Doctor aynı .part'a yazmasın)
//   * ffmpegArkada: ffmpeg motordan ÖNCE indirilmez, model inince arka planda başlar
//   * rehber kurulumu kurulu cuBLAS motorunu CPU sürümüyle ezmez
//   * installFfmpeg kilidi ilerlemeyi her bekleyene iletir
//   * 3.2 İptal: işi başlatanın jetonu indirmeyi keser (.part korunur); sonradan katılanınki yalnız kendi beklemesini
//     ("Bekleme iptal edildi" der, indirme sürer); iptal edilen katılan artık ffmpeg ilerlemesi almaz;
//     GPU ısınması başarısız olunca inen CPU motoru da jetonla kesilir ("Hazır" denmez)
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
      indirmeler.push({ anahtar: meta && meta.key, hedef: hedef, iptal: meta && meta.iptal });
      if (opts.yavas && meta && meta.iptal) {
        // 3.2 İptal: jeton gelince istek kesilir, .part korunur (K.download sözleşmesi)
        return new Promise(function (coz) {
          var bitti = false;
          meta.iptal.dinle(function () { if (!bitti) { bitti = true; coz({ ok: false, iptal: true, error: "İptal edildi", kept: 5 * MB }); } });
          setTimeout(function () {
            if (bitti) return;
            bitti = true;
            vfs[hedef] = Math.round(((meta && meta.expectedMB) || 1) * MB);
            coz({ ok: true });
          }, 300);
        });
      }
      return new Promise(function (coz) {
        setTimeout(function () {
          if (/^ffmpeg:/.test(meta && meta.key)) { coz({ ok: false, error: "test: ag yok" }); return; }
          vfs[hedef] = Math.round(((meta && meta.expectedMB) || 1) * MB);
          if (ilerleme) ilerleme(1);
          coz({ ok: true });
        }, 15);
      });
    },
    unzip: opts.unzip || function () { return Promise.resolve(false); },
    rmrf: function () {},
    tmpDir: function () { return "/sanal/tmp"; },
    run: opts.run || function () { return Promise.resolve({ code: 0, stdout: "", stderr: "" }); }
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
  // 3.2 İptal: işi başlatanın jetonu indirmeyi keser; .part korunur, hata e.iptal taşır
  function jeton() {
    var d = [], j = { iptalEdildi: false, iptal: function () { if (j.iptalEdildi) return; j.iptalEdildi = true; d.splice(0).forEach(function (f) { f(); }); },
      dinle: function (f) { if (j.iptalEdildi) { f(); return function () {}; } d.push(f); return function () { var k = d.indexOf(f); if (k !== -1) d.splice(k, 1); }; } };
    return j;
  }
  var m7 = motor({ yavas: true });
  var j7 = jeton();
  var is7 = m7.E.installModel("small", function () {}, j7);
  setTimeout(function () { j7.iptal(); }, 30);
  return is7.then(function () { ok("iptal edilen model indirmesi başarılı dönmemeli", false); }, function (e) {
    ok("installModel iptali: e.iptal, '.part korundu' mesajı", e && e.iptal === true && /inen kısım korundu/.test(e.message), e && e.message);
    ok("installModel jetonu K.download'a gider (meta.iptal)", m7.indirmeler.length === 1 && m7.indirmeler[0].iptal === j7);
    ok("iptalden sonra model kurulu sayılmaz, kilit bırakılır", !m7.vfs[path.join("/sanal/whisper", "models", "ggml-small-q5_1.bin")]);
  }).then(function () {
    // sonradan katılanın iptali yalnız kendi beklemesini keser; işi başlatan sürer
    var m8 = motor({ yavas: true });
    var sahip = jeton(), katilan = jeton();
    var a8 = m8.E.installModel("small", function () {}, sahip);
    var b8 = m8.E.installModel("small", function () {}, katilan);
    setTimeout(function () { katilan.iptal(); }, 20);
    return b8.then(function () { ok("katılanın beklemesi iptal edilmeliydi", false); }, function (e) {
      ok("katılan iptal: kendi beklemesi e.iptal ile biter", e && e.iptal === true);
      return a8.then(function (r) {
        ok("işi başlatan sürer ve tamamlanır, tek indirme", r && r.model && r.model.id === "small" && m8.indirmeler.length === 1);
      });
    });
  }).then(function () {
    // install(): iptal edilmiş jetonla motor/model indirmeden durur
    var m9 = motor({ yavas: true, ayarlar: { provider: "local", engineBuild: "cpu" } });
    var j9 = jeton();
    var is9 = m9.E.install({ modelId: "small", useGpu: false, ffmpegArkada: true, iptal: j9 });
    setTimeout(function () { j9.iptal(); }, 30);
    return is9.then(function () { ok("iptal edilen kurulum başarılı dönmemeli", false); }, function (e) {
      ok("install iptali: e.iptal; modeli kaydetmez, kilit bırakılır", e && e.iptal === true && m9.ayarlar.provider === "local" && m9.ayarlar.model === undefined && m9.E.kurulumSuruyor() === false,
        (e && e.message) + " model=" + m9.ayarlar.model);
      ok("install iptali: yalnız kesilen indirme var, VAD'e geçilmedi", m9.indirmeler.length === 1 && m9.indirmeler[0].anahtar === "model:small", JSON.stringify(m9.indirmeler.map(function (x) { return x.anahtar; })));
    });
  }).then(function () {
    // installFfmpeg: işi başlatanın iptali sonraki aynaya geçmez
    var m10 = motor({ yavas: true });
    var j10 = jeton();
    var f10 = m10.E.installFfmpeg(function () {}, j10);
    setTimeout(function () { j10.iptal(); }, 20);
    return f10.then(function () { ok("iptal edilen ffmpeg kurulumu başarılı dönmemeli", false); }, function (e) {
      ok("installFfmpeg iptali: e.iptal, ikinci aynaya geçilmez", e && e.iptal === true && m10.indirmeler.length === 1, JSON.stringify(m10.indirmeler.map(function (x) { return x.anahtar; })));
    });
  });
}).then(function () {
  // İnceleme bulguları (3.2 adım 3): katılanın iptali, ffmpeg dinleyicisi, GPU ısınması sonrası CPU indirmesi
  function jeton() {
    var d = [], j = { iptalEdildi: false, iptal: function () { if (j.iptalEdildi) return; j.iptalEdildi = true; d.splice(0).forEach(function (f) { f(); }); },
      dinle: function (f) { if (j.iptalEdildi) { f(); return function () {}; } d.push(f); return function () { var k = d.indexOf(f); if (k !== -1) d.splice(k, 1); }; } };
    return j;
  }
  // (a) jetonsuz başlatılmış model indirmesine katılanın İptal'i "indirme iptal edildi" DEMEZ: indirme sürüyor
  var m11 = motor({ yavas: true });
  var sahip11 = jeton(), katilan11 = jeton();
  var a11 = m11.E.installModel("small", function () {}, sahip11);
  var b11 = m11.E.installModel("small", function () {}, katilan11);
  ok("aynı jetonla katılan işin kendisini alır (bekleme sarmalı yok)", m11.E.installModel("small", function () {}, sahip11) === a11);
  setTimeout(function () { katilan11.iptal(); }, 20);
  return b11.then(function () { ok("katılanın beklemesi iptal edilmeliydi", false); }, function (e) {
    ok("katılan iptali: 'Bekleme iptal edildi — başka bir kurulum…' (indirme durdu denmez)",
      e && e.iptal === true && /^Bekleme iptal edildi/.test(e.message) && !/inen kısım korundu/.test(e.message), e && e.message);
    return a11.then(function (r) { ok("katılan iptalinden sonra indirme sürer ve biter", !!(r && r.model) && m11.indirmeler.length === 1); });
  }).then(function () {
    // (b) Altyazı oluştur arkadaki ffmpeg kurulumuna katılıp İptal edince durum satırına ilerleme yazılmaz
    var m12 = motor({ yavas: true });
    var arka = jeton(), altyazi = jeton();
    var a = [], b = [], iptalSonrasiB = -1;
    var f1 = m12.E.installFfmpeg(function (x) { a.push(x); }, arka);
    var f2 = m12.E.installFfmpeg(function (x) { b.push(x); }, altyazi);
    var aIptalde = -1;
    setTimeout(function () { aIptalde = a.length; iptalSonrasiB = b.length; altyazi.iptal(); }, 20);
    return f2.then(function () { ok("katılan ffmpeg beklemesi iptal edilmeliydi", false); }, function (e) {
      ok("ffmpeg katılan iptali: e.iptal, bekleme mesajı", e && e.iptal === true && /^Bekleme iptal edildi/.test(e.message), e && e.message);
      return f1.then(function () { return null; }, function () { return null; });
    }).then(function () {
      ok("iptal edilen katılan artık ilerleme almaz; işi başlatan almaya devam eder",
        iptalSonrasiB >= 1 && b.length === iptalSonrasiB && a.length > aIptalde, "a=" + JSON.stringify(a) + " b=" + JSON.stringify(b));
    });
  }).then(function () {
    // (c) GPU ısınması "engine-run" ile başarısız → CPU motoru iner; İptal o indirmeyi de keser
    var m13 = motor({
      yavas: true, ffmpeg: true, ayarlar: { provider: "local", engineBuild: "cuda" },
      // motor açılır (-h 0 döner, kurulu motor yeniden inmez), ama CUDA'da çözümleme düşer
      run: function (exe, args) { return Promise.resolve(/whisper-cli/.test(exe) && !(args && args[0] === "-h") ? { code: 1, stdout: "", stderr: "CUDA error" } : { code: 0, stdout: "", stderr: "" }); }
    });
    var j13 = jeton();
    var is13 = m13.E.install({ modelId: "small", useGpu: true, iptal: j13 });
    var bekci = setInterval(function () {
      if (m13.indirmeler.some(function (x) { return x.anahtar === "motor:cpu"; })) { clearInterval(bekci); j13.iptal(); }
    }, 5);
    return is13.then(function () { clearInterval(bekci); ok("GPU ısınması sonrası CPU indirmesi iptal edilince kurulum 'Hazır' dönmemeli", false); }, function (e) {
      clearInterval(bekci);
      var cpu = m13.indirmeler.filter(function (x) { return x.anahtar === "motor:cpu"; });
      ok("ısınma sonrası CPU motoru indirmesi jetonu taşır ve iptal e.iptal ile biter",
        cpu.length === 1 && cpu[0].iptal === j13 && e && e.iptal === true && /inen kısım korundu/.test(e.message), (e && e.message) + " " + JSON.stringify(m13.indirmeler.map(function (x) { return x.anahtar; })));
      ok("kilit bırakılır, derleme 'cpu' diye kaydedilmez", m13.E.kurulumSuruyor() === false && m13.ayarlar.engineBuild === "cuda");
    });
  });
}).then(function () {
  // Bozuk motor (exe var, whisper.dll yarıda kalan arşivde gelmedi / antivirüs karantinası): eskiden derleme aynı
  // diye adım atlanıyor, Doctor'un "Motoru onar"ı hiçbir şey indirmeden "Hazır" diyordu
  var acildi = false, hYoklama = 0;
  var m14 = motor({
    ffmpeg: true, ayarlar: { provider: "local" },
    unzip: function () { acildi = true; return Promise.resolve(true); },
    run: function (exe, args) {
      if (/whisper-cli/.test(exe) && args && args[0] === "-h") { hYoklama++; return Promise.resolve(acildi ? { code: 0, stdout: "", stderr: "" } : { code: -1073741515, stdout: "", stderr: "" }); }
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    }
  });
  m14.vfs[path.join("/sanal/whisper", "models", "ggml-small-q5_1.bin")] = 200 * MB;
  return m14.E.install({ modelId: "small", useGpu: false }).then(function (r) {
    ok("açılmayan kurulu motor (0xC0000135) yeniden iner, açıldıktan sonra yoklanır, derleme kaydedilir",
      m14.indirmeler.some(function (x) { return x.anahtar === "motor:cpu"; }) && acildi && hYoklama >= 2 && m14.ayarlar.engineBuild === "cpu" && r.build === "cpu",
      JSON.stringify(m14.indirmeler.map(function (x) { return x.anahtar; })) + " h=" + hYoklama);
    var m15 = motor({ ffmpeg: true, ayarlar: { provider: "local", engineBuild: "cpu" } });
    return m15.E.install({ modelId: "small", useGpu: false }).then(function () { return null; }, function () { return null; }).then(function () {
      ok("açılan kurulu motor yeniden inmez", !m15.indirmeler.some(function (x) { return /^motor:/.test(x.anahtar); }), JSON.stringify(m15.indirmeler.map(function (x) { return x.anahtar; })));
    });
  }).then(function () {
    // cuBLAS'tan CPU'ya geçiş (Hızlandırma kapatıldı): CUDA DLL'leri silinir; kalırsa ggml_backend_load_all
    // ggml-cuda.dll'i yükler ve "CPU" yazan kurulum yine CUDA'da koşar
    var m16 = motor({ ffmpeg: true, ayarlar: { provider: "local", engineBuild: "cuda" }, unzip: function () { return Promise.resolve(true); } });
    var rel = path.join("/sanal/whisper", "Release");
    m16.vfs[rel] = -1;
    ["ggml-cuda.dll", "cublas64_12.dll", "cublasLt64_12.dll", "cudart64_12.dll", "nvblas64_12.dll", "nvrtc64_120_0.dll", "nvrtc-builtins64_128.dll", "ggml-cpu-haswell.dll", "whisper.dll"].forEach(function (f) { m16.vfs[path.join(rel, f)] = MB; });
    m16.vfs[path.join("/sanal/whisper", "models", "ggml-small-q5_1.bin")] = 200 * MB;
    return m16.E.install({ modelId: "small", useGpu: false }).then(function (r) {
      var kalan = Object.keys(m16.vfs).filter(function (p) { return path.dirname(p) === rel; }).map(function (p) { return path.basename(p); }).sort();
      ok("cuBLAS → CPU: CUDA DLL'leri (nvblas, nvrtc-builtins dahil) silinir, CPU dosyaları kalır, derleme 'cpu'",
        JSON.stringify(kalan) === JSON.stringify(["ggml-cpu-haswell.dll", "whisper.dll"]) && m16.ayarlar.engineBuild === "cpu" && r.build === "cpu", JSON.stringify(kalan));
    });
  });
}).then(function () {
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}).catch(function (e) {
  console.log("FAIL beklenmeyen hata: " + (e && e.stack || e));
  process.exit(1);
});
