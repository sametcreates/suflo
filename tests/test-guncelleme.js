var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * Otomatik guncelleme seridi HER IKI PLATFORMDA da calisiyor mu?
 *
 * GERCEK app.js + bridge.js'i once "macOS" sonra "Windows" gibi davranan sahte
 * ortamlarda calistirir; GitHub API yaniti taklit edilir. Olculen: serit aciliyor
 * mu, dogru surum yaziliyor mu, indirme dogru klasore gidiyor mu ve dosya
 * platformun DOGRU komutuyla aciliyor mu (mac: /usr/bin/open, win: cmd start).
 */
var realFs = require("fs");
var vm = require("vm");
var pathPosix = require("path").posix;
var pathWin = require("path").win32;

var KOK = KOKYOL + "js/";
var sonuc = [];
function chk(ad, k, ek) { sonuc.push((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 95) + "]" : "")); }

/* ---------- sahte DOM: app.js'in dokundugu ogeler ---------- */
function sahteDom() {
  var ogeler = {};
  function oge(id) {
    if (ogeler[id]) return ogeler[id];
    var o = {
      id: id, _metin: "", hidden: true, disabled: false, value: "", className: "",
      style: {}, dataset: {}, children: [],
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
      addEventListener: function (e, f) { o["on_" + e] = f; },
      appendChild: function () {}, remove: function () {}, querySelector: function () { return null; },
      querySelectorAll: function () { return []; }, focus: function () {}, click: function () {},
      insertBefore: function () {}, setAttribute: function () {}, removeAttribute: function () {}
    };
    Object.defineProperty(o, "textContent", {
      get: function () { return o._metin; }, set: function (v) { o._metin = String(v); }
    });
    Object.defineProperty(o, "innerHTML", {
      get: function () { return o._metin; }, set: function (v) { o._metin = String(v); }
    });
    ogeler[id] = o;
    return o;
  }
  var belgeOlaylari = {};
  return {
    ogeler: ogeler,
    belgeOlaylari: belgeOlaylari,
    belge: {
      getElementById: oge,
      createElement: function () { return oge("_gecici_" + Math.random()); },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      // app.js dinleyicileri init() icinde bagliyor; init DOMContentLoaded ile
      // tetikleniyor, bu yuzden olayi saklayip testte elle atesliyoruz
      addEventListener: function (e, f) { belgeOlaylari[e] = f; },
      body: oge("_body"),
      documentElement: oge("_html")
    }
  };
}

function ortam(opts) {
  opts = opts || {};
  var mac = !!opts.mac;
  var P = mac ? pathPosix : pathWin;
  var ev = mac ? "/Users/samet" : "C:\\Users\\samet";
  var dom = sahteDom();
  var komutlar = [];
  var indirmeler = [];
  var dosyalar = {};
  dosyalar[P.join(ev, "Downloads")] = true;

  var sandbox = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    JSON: JSON, Math: Math, Date: Date, String: String, Number: Number, Boolean: Boolean,
    Object: Object, Array: Array, Error: Error, RegExp: RegExp, Promise: Promise,
    isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    URL: URL, Buffer: Buffer, setTimeout: function () {}, clearTimeout: function () {},
    setInterval: function () {}, clearInterval: function () {},
    navigator: { platform: mac ? "MacIntel" : "Win32", userAgent: mac ? "Mac OS X" : "Windows" },
    process: { platform: mac ? "darwin" : "win32", env: { PATH: "/usr/bin", SystemRoot: "C:\\Windows" }, cwd: function () { return ev; } },
    window: { addEventListener: function () {} },
    document: dom.belge,
    CSInterface: function () {
      return {
        getSystemPath: function () { return ev; },
        evalScript: function (s, cb) { cb && cb(JSON.stringify({ ok: false })); },
        openURLInDefaultBrowser: function (u) { komutlar.push({ cmd: "TARAYICI", args: [u] }); }
      };
    },
    require: function (m) {
      if (m === "fs") {
        return {
          existsSync: function (p) { return !!dosyalar[String(p)]; },
          mkdirSync: function (p) { dosyalar[String(p)] = true; },
          readdirSync: function () { return []; },
          statSync: function () { return { size: 1, mtimeMs: Date.now(), isDirectory: function () { return false; } }; },
          readFileSync: function () { return "{}"; },
          writeFileSync: function (p) { dosyalar[String(p)] = true; },
          unlinkSync: function (p) { delete dosyalar[String(p)]; },
          renameSync: function () {}, accessSync: function () {}, rmSync: function () {},
          chmodSync: function () {}, copyFileSync: function () {}, utimesSync: function () {},
          constants: { W_OK: 2 },
          createWriteStream: function () { return { on: function () {}, close: function (cb) { cb && cb(); }, destroy: function () {} }; }
        };
      }
      if (m === "path") return P;
      if (m === "os") {
        return { homedir: function () { return ev; }, tmpdir: function () { return P.join(ev, "tmp"); },
                 arch: function () { return mac ? "arm64" : "x64"; },
                 platform: function () { return mac ? "darwin" : "win32"; },
                 cpus: function () { return [1, 2, 3, 4]; } };
      }
      if (m === "child_process") {
        return {
          spawn: function (cmd, args) {
            komutlar.push({ cmd: cmd, args: args || [] });
            var h = {};
            var c = { stdout: { on: function (e, f) { h.out = f; } }, stderr: { on: function (e, f) { h.err = f; } },
                      on: function (e, f) { h[e] = f; }, kill: function () {} };
            Promise.resolve().then(function () { if (h.close) h.close(0); });
            return c;
          }
        };
      }
      if (m === "http" || m === "https") {
        var istek = function () {
          var n = { on: function (e, f) { if (e === "error") Promise.resolve().then(function () { f(new Error("testte ag yok")); }); return n; },
                    setTimeout: function () { return n; }, destroy: function () {}, end: function () {}, write: function () {} };
          return n;
        };
        return { get: istek, request: istek };
      }
      if (m === "buffer") return { Buffer: Buffer };
      throw new Error("bilinmeyen modul: " + m);
    }
  };
  sandbox.CSInterface.SystemPath = { USER_DATA: ev, EXTENSION: ev };
  sandbox.global = sandbox;
  vm.createContext(sandbox);

  vm.runInContext(realFs.readFileSync(KOK + "bridge.js", "utf8"), sandbox, { filename: "bridge.js" });
  var K = sandbox.window.K;

  // Ag ve indirmeyi kontrol altina al
  K.httpGet = function (url) {
    return Promise.resolve(opts.apiYanit || { status: 200, body: JSON.stringify({
      tag_name: "v9.9.9",
      body: "## Suflo 9.9.9 — deneme\n\nBu surumde ffmpeg artik kendi kuruluyor ve her sey guzel.",
      assets: [{ name: "Suflo-9.9.9.zxp", browser_download_url: "https://ornek/Suflo-9.9.9.zxp" }]
    }) });
  };
  K.download = function (url, hedef) {
    indirmeler.push({ url: url, hedef: hedef });
    dosyalar[String(hedef)] = true;
    return Promise.resolve({ ok: true });
  };

  sandbox.K = K;
  // app.js KEngine/KCaptions'a dokunuyor: yalnizca guncelleme yolunu olcuyoruz, gerisi bos
  sandbox.window.KEngine = { installedModels: function () { return []; }, activeModel: function () { return null; },
    gpuInfo: function () { return null; }, installedBuild: function () { return "cpu"; }, vadPath: function () { return null; },
    MODELS: [], detectGpu: function () { return Promise.resolve({ kind: "none" }); }, fmtMB: function (n) { return n + " MB"; } };
  sandbox.window.KCaptions = { refreshSetup: function () {}, glossaryText: function () { return ""; },
    parseGlossary: function () { return []; }, init: function () {} };
  sandbox.window.KSfx = { init: function () {} };
  sandbox.window.KCut = { init: function () {} };
  sandbox.window.KMotion = { init: function () {} };

  vm.runInContext(realFs.readFileSync(KOK + "app.js", "utf8"), sandbox, { filename: "app.js" });

  return { K: K, KApp: sandbox.window.KApp, ogeler: dom.ogeler, belgeOlaylari: dom.belgeOlaylari, komutlar: komutlar, indirmeler: indirmeler, P: P, ev: ev };
}

(async function () {
  for (var i = 0; i < 2; i++) {
    var mac = i === 0;
    var etiket = mac ? "mac" : "win";
    var e = ortam({ mac: mac });
    // init(): dinleyiciler burada baglaniyor (DOMContentLoaded ile tetiklenir)
    if (e.belgeOlaylari.DOMContentLoaded) { try { e.belgeOlaylari.DOMContentLoaded(); } catch (eI) {} }

    /* 1) Guncelleme kontrolu seridi aciyor mu */
    await e.KApp.checkUpdate();
    var bar = e.ogeler["update-bar"];
    var baslik = e.ogeler["update-baslik"];
    var not = e.ogeler["update-not"];

    chk(etiket + ": guncelleme seridi ACILDI", bar && bar.hidden === false, bar && bar.hidden);
    chk(etiket + ": basligta yeni surum yaziyor", baslik && /9\.9\.9/.test(baslik.textContent), baslik && baslik.textContent);
    chk(etiket + ": surum notunun ilk satiri gosteriliyor",
      not && not.textContent.length > 10, not && not.textContent);
    chk(etiket + ": indir dugmesi etkin", e.ogeler["update-indir"].disabled === false);

    /* 2) Indirme dogru klasore gidiyor mu */
    var indirBtn = e.ogeler["update-indir"];
    if (indirBtn.on_click) await indirBtn.on_click();

    chk(etiket + ": zxp indirildi", e.indirmeler.length === 1, JSON.stringify(e.indirmeler[0] || {}).slice(0, 80));
    var beklenenKlasor = e.P.join(e.ev, "Downloads");
    chk(etiket + ": Downloads klasorune indi",
      e.indirmeler[0] && e.indirmeler[0].hedef.indexOf(beklenenKlasor) === 0,
      e.indirmeler[0] && e.indirmeler[0].hedef);

    /* 3) Dosya PLATFORMUN DOGRU komutuyla aciliyor mu */
    var acmaKomutlari = e.komutlar.filter(function (k) {
      return /open|start|explorer|cmd/i.test(String(k.cmd)) || (k.args || []).indexOf("start") !== -1;
    });
    var hepsi = e.komutlar.map(function (k) { return k.cmd + " " + (k.args || []).join(" "); }).join(" | ");

    if (mac) {
      chk("mac: /usr/bin/open ile acildi",
        acmaKomutlari.some(function (k) { return k.cmd === "/usr/bin/open"; }), hepsi);
      chk("mac: Windows komutu (cmd/explorer) CAGRILMADI",
        !e.komutlar.some(function (k) { return /^(cmd|explorer|powershell)$/i.test(String(k.cmd)); }), hepsi);
    } else {
      chk("win: cmd start ile acildi",
        acmaKomutlari.some(function (k) { return String(k.cmd) === "cmd" && (k.args || []).indexOf("start") !== -1; }), hepsi);
      chk("win: mac komutu (/usr/bin/open) CAGRILMADI",
        !e.komutlar.some(function (k) { return String(k.cmd).indexOf("/usr/bin/open") === 0; }), hepsi);
    }

    chk(etiket + ": indirme sonrasi kullaniciya ne yapacagi soyleniyor",
      /çift tıkla|yeniden başlat/i.test(e.ogeler["update-not"].textContent),
      e.ogeler["update-not"].textContent);
  }

  /* 4) Ayni surumde serit ACILMAMALI (gereksiz rahatsizlik) */
  var e2 = ortam({ mac: true, apiYanit: null });
  e2.K.httpGet = function () {
    return Promise.resolve({ status: 200, body: JSON.stringify({ tag_name: "v" + e2.K.VERSION, assets: [] }) });
  };
  await e2.KApp.checkUpdate();
  // seride hic dokunulmamis olabilir (oge bile olusmaz): o da "acilmadi" demektir
  var bar2 = e2.ogeler["update-bar"];
  chk("ayni surumde serit acilmiyor", !bar2 || bar2.hidden !== false, bar2 ? bar2.hidden : "seride hic dokunulmadi");

  /* 5) Daha ESKI surum yayindaysa serit acilmamali */
  var e3 = ortam({ mac: false });
  e3.K.httpGet = function () {
    return Promise.resolve({ status: 200, body: JSON.stringify({ tag_name: "v0.0.1", assets: [] }) });
  };
  await e3.KApp.checkUpdate();
  var bar3 = e3.ogeler["update-bar"];
  chk("eski surum yayindaysa serit acilmiyor", !bar3 || bar3.hidden !== false,
    bar3 ? bar3.hidden : "seride hic dokunulmadi");

  /*
   * 6) YALNIZ Kurulum ZIP'li release — v2.2.0'da yaşanan gerçek durum.
   * Eski kod yalnız .zxp aradığı için düğme sessizce devre dışı kalıyordu
   * ("güncelleme gelmiyor" şikayeti). ZIP artık birinci sınıf paket.
   */
  var e4 = ortam({ mac: false, apiYanit: { status: 200, body: JSON.stringify({
    tag_name: "v9.9.9",
    body: "## Suflo 9.9.9\n\nKesim geri geldi, ritim markerlari ve emoji secici eklendi.",
    assets: [{ name: "Suflo-9.9.9-Kurulum.zip", browser_download_url: "https://ornek/Suflo-9.9.9-Kurulum.zip" }]
  }) } });
  if (e4.belgeOlaylari.DOMContentLoaded) { try { e4.belgeOlaylari.DOMContentLoaded(); } catch (eI4) {} }
  await e4.KApp.checkUpdate();
  chk("zip-only: serit ACILDI", e4.ogeler["update-bar"].hidden === false);
  chk("zip-only: indir dugmesi ETKIN (eski hata: devre disiydi)",
    e4.ogeler["update-indir"].disabled === false);
  if (e4.ogeler["update-indir"].on_click) await e4.ogeler["update-indir"].on_click();
  chk("zip-only: Kurulum ZIP'i indirildi",
    e4.indirmeler.length === 1 && /Kurulum\.zip$/.test(e4.indirmeler[0].hedef),
    e4.indirmeler[0] && e4.indirmeler[0].hedef);
  chk("zip-only: kullaniciya AYIKLAMASI soyleniyor (zip icinden .bat calismaz)",
    /ZIP'i aç|ayıkla/i.test(e4.ogeler["update-not"].textContent),
    e4.ogeler["update-not"].textContent);

  /* 7) Iki paket birden varsa Kurulum ZIP tercih edilmeli (asil dagitim yolu) */
  var e5 = ortam({ mac: false, apiYanit: { status: 200, body: JSON.stringify({
    tag_name: "v9.9.9",
    body: "## Suflo 9.9.9\n\nIki paketli surum notu deneme metni.",
    assets: [
      { name: "Suflo-9.9.9.zxp", browser_download_url: "https://ornek/Suflo-9.9.9.zxp" },
      { name: "Suflo-9.9.9-Kurulum.zip", browser_download_url: "https://ornek/Suflo-9.9.9-Kurulum.zip" }
    ]
  }) } });
  if (e5.belgeOlaylari.DOMContentLoaded) { try { e5.belgeOlaylari.DOMContentLoaded(); } catch (eI5) {} }
  await e5.KApp.checkUpdate();
  if (e5.ogeler["update-indir"].on_click) await e5.ogeler["update-indir"].on_click();
  chk("iki paketli release'te Kurulum ZIP tercih ediliyor",
    e5.indirmeler.length === 1 && /Kurulum\.zip$/.test(e5.indirmeler[0].url),
    e5.indirmeler[0] && e5.indirmeler[0].url);

  /* ---------- otomatikKur: gercek ZIP + sahte CEP klasoru ---------- */
  await (async function () {
    var fs2 = require("fs"), path2 = require("path"), os2 = require("os"), cp2 = require("child_process");
    var TMP2 = path2.join(os2.tmpdir(), "suflo-otokur-test");
    try { fs2.rmSync(TMP2, { recursive: true, force: true }); } catch (e0) {}

    // 1) sahte guncelleme paketi: panel/index.html + CSXS/manifest.xml (v9.9.9)
    var pk = path2.join(TMP2, "paket", "panel");
    fs2.mkdirSync(path2.join(pk, "CSXS"), { recursive: true });
    fs2.writeFileSync(path2.join(pk, "index.html"), "<html>yeni surum</html>");
    fs2.writeFileSync(path2.join(pk, "CSXS", "manifest.xml"), '<Ext Version="9.9.9"/>');
    fs2.mkdirSync(path2.join(pk, "js"), { recursive: true });
    fs2.writeFileSync(path2.join(pk, "js", "app.js"), "// yeni");
    var zipYolu = path2.join(TMP2, "Suflo-9.9.9-Kurulum.zip");
    var tarExe = path2.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    cp2.execFileSync(tarExe, ["-a", "-cf", zipYolu, "-C", path2.join(TMP2, "paket"), "panel"]);

    // 2) sahte CEP hedefi (eski surum icinde)
    var cep = path2.join(TMP2, "cep", "Adobe", "CEP", "extensions", "com.sametcreates.kesit");
    fs2.mkdirSync(path2.join(cep, "CSXS"), { recursive: true });
    fs2.writeFileSync(path2.join(cep, "index.html"), "<html>eski</html>");
    fs2.writeFileSync(path2.join(cep, "CSXS", "manifest.xml"), '<Ext Version="1.0.0"/>');

    // 3) otomatikKur'u gercek kaynaktan kes, K stub'la calistir
    var asrc = fs2.readFileSync(KOKYOL + "js/app.js", "utf8");
    var oi = asrc.indexOf("async function otomatikKur(");
    var obody = asrc.slice(oi, asrc.indexOf("\n  }", oi) + 4);
    var Kstub = {
      tmpDir: function () { return path2.join(TMP2, "tmp"); },
      fs: fs2, path: path2, os: os2, MAC: false,
      log: function () {},
      unzip: async function (z, d) {
        fs2.mkdirSync(d, { recursive: true });
        cp2.execFileSync(tarExe, ["-xf", z, "-C", d]);
        return true;
      }
    };
    var eskiAppdata = process.env.APPDATA;
    process.env.APPDATA = path2.join(TMP2, "cep", "Adobe").replace(/[\\\/]Adobe$/, "");
    // APPDATA stub: cepHedef = APPDATA/Adobe/CEP/... olmali
    process.env.APPDATA = path2.join(TMP2, "cep");
    var calistir = new Function("K", "process", "return " + obody.replace("async function otomatikKur", "async function") + ";")(Kstub, process);
    var ok1 = await calistir(zipYolu, "9.9.9");
    process.env.APPDATA = eskiAppdata;

    chk("otomatikKur: kurulum basarili donuyor", ok1 === true, ok1);
    chk("otomatikKur: index.html yeni surumle degisti",
      fs2.readFileSync(path2.join(cep, "index.html"), "utf8").indexOf("yeni surum") !== -1);
    chk("otomatikKur: manifest 9.9.9 oldu",
      fs2.readFileSync(path2.join(cep, "CSXS", "manifest.xml"), "utf8").indexOf("9.9.9") !== -1);
    chk("otomatikKur: yeni dosya (js/app.js) kopyalandi",
      fs2.existsSync(path2.join(cep, "js", "app.js")));

    // 4) hedef klasor yoksa false donmeli (yanlis yere kurma korumasi)
    process.env.APPDATA = path2.join(TMP2, "olmayan");
    var ok2 = await calistir(zipYolu, "9.9.9");
    process.env.APPDATA = eskiAppdata;
    chk("otomatikKur: CEP klasoru yoksa elle akisa dusuyor (false)", ok2 === false, ok2);

    try { fs2.rmSync(TMP2, { recursive: true, force: true }); } catch (eS) {}
  })();

  var manifestText = realFs.readFileSync(KOKYOL + "CSXS/manifest.xml", "utf8");
  var releaseNotes = realFs.readFileSync(KOKYOL + "marketing/release-notes.md", "utf8");
  var currentVersion = (manifestText.match(/ExtensionBundleVersion="([^"]+)"/) || [])[1] || "";
  var firstReleaseHeading = (releaseNotes.match(/^##\s+[^\r\n]+/m) || [""])[0];
  chk("release notunun ilk basligi manifestteki guncel surumle ayni",
    !!currentVersion && firstReleaseHeading.indexOf(currentVersion) !== -1, firstReleaseHeading + " / " + currentVersion);

  var kalan = sonuc.filter(function (s) { return s.indexOf("FAIL") === 0; }).length;
  sonuc.forEach(function (s) { console.log(s); });
  console.log("\n" + (sonuc.length - kalan) + "/" + sonuc.length + " gecti");
  process.exit(kalan ? 1 : 0);
})().catch(function (e) {
  console.log("TEST COKTU: " + (e && e.stack ? e.stack : e));
  process.exit(1);
});
