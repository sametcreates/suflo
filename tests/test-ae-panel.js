/*
 * After Effects (deneysel) — panel bağlantıları: manifest (AEFT eklendi, Premiere satırı aynı), .debug, köprünün ana
 * uygulama tespiti ve K.call eşlemesi (Premiere'de betik bayt bayt aynı; AE'de karşılık / dönüştürme / engel),
 * index.html ve CSS (Premiere'e özgü öğeler işaretli, AE öğeleri yalnız AE'de), js/ae-panel.js sahte DOM'da (Premiere'de
 * hiçbir şey yapmaz; AE'de sekmeleri gizler, host-ae.jsx'i yükler; ücretsiz düz ekleme kapısız; stilli ekleme
 * denemesiz Pro.gate("overlay"), filigran ve hak harcama yok; kaldırma), köprünün AE'de host-ae.jsx'i KSAE_* çağrısından
 * önce yüklemesi ve zaman aşımı metni, app.js / captions.js bağlantıları ve paketleme.
 * Çalıştır: node tests/test-ae-panel.js
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var KOK = path.join(__dirname, "..");
var ayikla = require("./_ayikla.js");

var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8"); }
function js(x) { return JSON.stringify(x); }

/* ---------------- manifest ve .debug ---------------- */
var manifest = oku("CSXS/manifest.xml");
ok("manifest: Premiere satırı aynı ([14.4,99.9]), After Effects eklendi ([17.0,99.9])",
  /<Host Name="PPRO" Version="\[14\.4,99\.9\]"\/>/.test(manifest) && /<Host Name="AEFT" Version="\[17\.0,99\.9\]"\/>/.test(manifest));
ok("manifest: tek uzantı, ScriptPath host.jsx (host-ae.jsx panelden yüklenir), CSXS 10",
  (manifest.match(/<ScriptPath>/g) || []).length === 1 && /<ScriptPath>\.\/jsx\/host\.jsx<\/ScriptPath>/.test(manifest) &&
  /RequiredRuntime Name="CSXS" Version="10\.0"/.test(manifest) && (manifest.match(/<Extension Id=/g) || []).length === 2);
var debug = oku(".debug");
ok(".debug: Premiere 8092, After Effects 8093", /<Host Name="PPRO" Port="8092"\/>/.test(debug) && /<Host Name="AEFT" Port="8093"\/>/.test(debug));

/* ---------------- köprü: ana uygulama ve K.call eşlemesi ---------------- */
function kopru(env, aePanel) {
  var bekleyen = [];
  var sb = {
    console: console, JSON: JSON, Math: Math, Date: Date, String: String, Number: Number, Object: Object, Array: Array,
    Error: Error, RegExp: RegExp, Promise: Promise, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
    navigator: { platform: "Win32", userAgent: "Windows" },
    document: { getElementById: function () { return null; }, addEventListener: function () {} },
    CSInterface: function () {
      var o = { getSystemPath: function () { return ""; }, evalScript: function (s, cb) { bekleyen.push({ s: s, cb: cb }); } };
      if (env !== undefined) o.getHostEnvironment = function () { if (env === "hata") throw new Error("yok"); return env; };
      return o;
    }
  };
  sb.CSInterface.SystemPath = { EXTENSION: "extension", USER_DATA: "userData" };
  sb.window = sb;
  if (aePanel) sb.SufloAePanel = aePanel;
  vm.createContext(sb);
  vm.runInContext(oku("js/ae-plan.js"), sb, { filename: "js/ae-plan.js" });
  vm.runInContext(oku("js/bridge.js"), sb, { filename: "js/bridge.js" });
  return { K: sb.K, bekleyen: bekleyen };
}

(async function () {
  var pr = kopru({ appName: "PPRO", appVersion: "25.2" });
  ok("Premiere: hostKodu PPRO", pr.K.hostKodu() === "PPRO");
  var p1 = pr.K.call("KS_getSelectedClips", undefined, 1000);
  var c1 = pr.bekleyen.pop();
  ok("Premiere: betik eskisi gibi (KS_getSelectedClips())", c1 && c1.s === "KS_getSelectedClips()", c1 && c1.s);
  c1.cb(JSON.stringify({ ok: true, clips: [{ name: "a", mediaPath: "x", clipStart: 1 }] }));
  var r1 = await p1;
  ok("Premiere: cevap dönüştürülmez", r1.ok && r1.clips.length === 1 && r1.clips[0].clipStart === 1);
  var p2 = pr.K.call("KS_importSrtAsCaptions", { srtPath: "a.srt" }, 1000);
  var c2 = pr.bekleyen.pop();
  ok("Premiere: her KS_* gönderilir (argüman kodlaması aynı)", c2 && c2.s === 'KS_importSrtAsCaptions("' + encodeURIComponent(JSON.stringify({ srtPath: "a.srt" })) + '")');
  c2.cb(JSON.stringify({ ok: true }));
  await p2;

  var ae = kopru({ appName: "AEFT", appVersion: "24.6" });
  ok("After Effects: hostKodu AEFT", ae.K.hostKodu() === "AEFT");
  var a1 = ae.K.call("KS_getSelectedClips", undefined, 1000);
  var ac1 = ae.bekleyen.pop();
  ok("After Effects: seçili klip çağrısı KSAE_seciliKatmanlar'a gider", ac1 && ac1.s === "KSAE_seciliKatmanlar()", ac1 && ac1.s);
  ac1.cb(JSON.stringify({ ok: true, comp: { name: "C", id: 3, width: 1920, height: 1080, fps: 25, duration: 30 },
    katmanlar: [{ index: 1, name: "v.mp4", tur: "dosya", mediaPath: "/v.mp4", hasAudio: true, inPoint: 4, outPoint: 9, startTime: 2, stretch: 100, timeRemap: false }] }));
  var ar1 = await a1;
  ok("After Effects: cevap Premiere klibine çevrilir (ss = 2, süre 5)", ar1.ok && ar1.clips.length === 1 && ar1.clips[0].inPoint === 2 && ar1.clips[0].dur === 5 &&
    ar1.clips[0].clipStart === 4, js(ar1));
  var a2 = ae.K.call("KS_getContext", undefined, 1000);
  var ac2 = ae.bekleyen.pop();
  ac2.cb(JSON.stringify({ ok: true, comp: null, katmanlar: [] }));
  var ar2 = await a2;
  ok("After Effects: bağlam KSAE_baglam'dan, Premiere biçiminde", ac2.s === "KSAE_baglam()" && ar2.ok && ar2.hasSeq === false && ar2.host === "AEFT");
  var once = ae.bekleyen.length;
  var ar3 = await ae.K.call("KS_applyCuts", { cuts: [] }, 1000);
  ok("After Effects: karşılığı olmayan Premiere işlevi gönderilmez, Türkçe engel", ae.bekleyen.length === once && ar3.ok === false &&
    ar3.kod === "after-effects" && /After Effects'te kullanılamaz/.test(ar3.error), js(ar3));
  var a4 = ae.K.call("KSAE_altyaziOlustur", { surum: 1 }, 1000);
  var ac4 = ae.bekleyen.pop();
  ac4.cb(JSON.stringify({ ok: true, adet: 3 }));
  ok("After Effects: KSAE_* doğrudan gider", /^KSAE_altyaziOlustur\("/.test(ac4.s) && (await a4).adet === 3);
  ok("tarayıcı önizlemesi / okunamayan host ortamı: \"\" (Premiere davranışı)", kopru(undefined).K.hostKodu() === "" && kopru("hata").K.hostKodu() === "");

  // İnceleme bulgusu: açılıştaki host-ae.jsx yüklemesi başarısızsa bağlam yoklaması ve "Altyazı oluştur" KSAE_* işlevlerini
  // tanımsızken çağırıyordu; yalnız ekle/kaldır yeniden yüklüyordu. Köprü her KSAE_* çağrısından önce yüklemeyi bekler.
  var yukleme = { sayi: 0, sonuc: false, otomatik: [] };
  var aeStub = { hostYukle: function (otomatik) { yukleme.sayi++; yukleme.otomatik.push(otomatik); return Promise.resolve(yukleme.sonuc); } };
  var aeY = kopru({ appName: "AEFT", appVersion: "24.6" }, aeStub);
  var y1 = await aeY.K.call("KS_getContext", undefined, 1000);
  ok("AE köprüsü: host-ae.jsx yüklenemezse KSAE_baglam gönderilmez, Türkçe neden", aeY.bekleyen.length === 0 && y1.ok === false &&
    y1.error === "After Effects betiği (host-ae.jsx) yüklenemedi." && yukleme.sayi === 1 && yukleme.otomatik[0] === true, js(y1));
  var y2 = await aeY.K.call("KS_getSelectedClips", undefined, 1000);
  ok("AE köprüsü: 'Altyazı oluştur'un seçili katman çağrısı da önce yüklemeyi dener", aeY.bekleyen.length === 0 && y2.ok === false && yukleme.sayi === 2, js(y2));
  yukleme.sonuc = true;
  var y3 = aeY.K.call("KS_getContext", undefined, 1000);
  await Promise.resolve(); await Promise.resolve();
  var yc3 = aeY.bekleyen.pop();
  ok("AE köprüsü: yükleme sonradan başarılıysa KSAE_baglam gönderilir", yc3 && yc3.s === "KSAE_baglam()" && yukleme.sayi === 3, yc3 && yc3.s);
  yc3.cb(JSON.stringify({ ok: true, comp: null, katmanlar: [] }));
  ok("AE köprüsü: cevap yine Premiere biçiminde", (await y3).hasSeq === false);
  var yEngel = await aeY.K.call("KS_applyCuts", {}, 1000);
  ok("AE köprüsü: engelli Premiere işlevi yüklemeyi tetiklemez", yEngel.kod === "after-effects" && yukleme.sayi === 3);
  var prY = kopru({ appName: "PPRO", appVersion: "25.2" }, aeStub);
  prY.K.call("KS_getContext", undefined, 1000);
  ok("Premiere köprüsü: host-ae.jsx yüklemesi hiç çağrılmaz, betik hemen gider", prY.bekleyen.length === 1 && prY.bekleyen[0].s === "KS_getContext()" && yukleme.sayi === 3);
  prY.bekleyen[0].cb(JSON.stringify({ ok: true }));

  // İnceleme bulgusu: zaman aşımı After Effects'te de "Premiere yanıt vermedi" diyordu (ve Premiere ipucunu getiriyordu)
  var zaAe = await kopru({ appName: "AEFT", appVersion: "24.6" }).K.call("KSAE_altyaziOlustur", { surum: 1 }, 5);
  var zaPr = await kopru({ appName: "PPRO", appVersion: "25.2" }).K.call("KS_getContext", undefined, 5);
  ok("zaman aşımı metni ana uygulamanın adıyla; Premiere metni bayt bayt aynı", zaAe.zamanAsimi === true &&
    zaAe.error === "After Effects yanıt vermedi (KSAE_altyaziOlustur) — işlem zaman aşımına uğradı." &&
    zaPr.error === "Premiere yanıt vermedi (KS_getContext) — işlem zaman aşımına uğradı.", js([zaAe.error, zaPr.error]));
  var en = oku("i18n/en.js");
  ok("i18n: After Effects zaman aşımı metni çevrili", en.indexOf('"After Effects yanıt vermedi ({}) — işlem zaman aşımına uğradı.": ') !== -1);

  /* ---------------- index.html, CSS ---------------- */
  var html = oku("index.html");
  ok("index.html: ae-plan.js bridge.js'ten önce, ae-panel.js app.js'ten önce",
    html.indexOf('src="js/ae-plan.js"') !== -1 && html.indexOf('src="js/ae-plan.js"') < html.indexOf('src="js/bridge.js"') &&
    html.indexOf('src="js/ae-panel.js"') > html.indexOf('src="js/captions.js"') && html.indexOf('src="js/ae-panel.js"') < html.indexOf('src="js/app.js"'));
  ok("index.html: AE not ve ekleme kartı yalnız AE'de (data-yalniz-ae), düğmeler var",
    /id="ae-not"[^>]*data-yalniz-ae/.test(html) && /id="ae-altyazi"[^>]*data-yalniz-ae/.test(html) &&
    /id="ae-ekle"/.test(html) && /id="ae-ekle-stil"/.test(html) && /id="ae-kaldir"/.test(html));
  var premiereOzgu = ['data-s="inout"', 'data-s="entire"', 'id="cap-efekt-cikti-sar"', 'id="cap-stil-grid"', 'id="cap-vr-box"', 'id="cap-br-box"',
    'id="cap-ch-markers"', 'id="cap-shorts-al"', 'id="cap-apply-hint"', 'id="cap-style-upsell"', 'aria-label="Altyazıyı sekansa ekleme biçimi"'];
  var isaretsiz = premiereOzgu.filter(function (a) { var i = html.indexOf(a); return i === -1 || !/data-yalniz-premiere/.test(html.slice(i, html.indexOf(">", i))); });
  ok("index.html: Altyazı sekmesinde Premiere'e özgü öğeler data-yalniz-premiere", isaretsiz.length === 0, isaretsiz.join(", "));
  var css = oku("css/style.css");
  ok("CSS: Premiere'de AE öğeleri, AE'de Premiere öğeleri !important ile gizli",
    /body:not\(\.host-ae\) \[data-yalniz-ae\] \{ display: none !important; \}/.test(css) &&
    /body\.host-ae \[data-yalniz-premiere\], body\.host-ae \[data-ae-gizli\] \{ display: none !important; \}/.test(css));

  /* ---------------- js/ae-panel.js sahte DOM'da ---------------- */
  function Eleman(ad, ozn) {
    this.tag = ad; this.oz = {}; this.cocuk = []; this.dinleyici = {}; this.disabled = false; this.textContent = ""; this.title = "";
    var self = this;
    this.classList = { s: {}, add: function (c) { this.s[c] = 1; }, contains: function (c) { return !!this.s[c]; } };
    Object.keys(ozn || {}).forEach(function (k) { self.oz[k] = ozn[k]; });
    this.id = this.oz.id || "";
  }
  Eleman.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.oz, k) ? this.oz[k] : null; };
  Eleman.prototype.setAttribute = function (k, v) { this.oz[k] = String(v); };
  Eleman.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.oz, k); };
  Eleman.prototype.addEventListener = function (t, f) { this.dinleyici[t] = f; };

  function dom() {
    var navlar = ["captions", "cut", "zoom", "egri", "text", "presets", "settings", "settings"].map(function (t) { return new Eleman("button", { "data-tab": t }); });
    var basliklar = [new Eleman("div"), new Eleman("div")];
    var paneller = ["captions", "cut", "zoom", "egri", "text", "presets", "settings"].map(function (t) { return new Eleman("section", { id: "tab-" + t }); });
    var kapsam = new Eleman("button", { "data-s": "clip" }); kapsam.textContent = "Seçili klip";
    var idli = {};
    ["host-ad", "host-status", "ae-ekle", "ae-ekle-stil", "ae-kaldir"].forEach(function (id) { idli[id] = new Eleman("x", { id: id }); });
    idli["host-ad"].textContent = "PREMIERE";
    var body = new Eleman("body");
    return {
      navlar: navlar, basliklar: basliklar, paneller: paneller, kapsam: kapsam, idli: idli, body: body,
      document: {
        body: body,
        getElementById: function (id) { return idli[id] || null; },
        querySelector: function (q) { return q === '#cap-scope button[data-s="clip"]' ? kapsam : null; },
        querySelectorAll: function (q) {
          if (q === ".yan-menu .ky-oge[data-tab]") return navlar;
          if (q === ".yan-menu .ky-baslik") return basliklar;
          if (q === ".tabpane") return paneller;
          throw new Error("beklenmeyen seçici " + q);
        }
      }
    };
  }

  function panel(kod, o) {
    o = o || {};
    var d = dom();
    var kayit = { evalScript: [], cagri: [], toast: [], gate: [], harca: [] };
    var segs = o.segs === undefined ? [{ start: 1, end: 2, text: "Merhaba *dünya*" }] : o.segs;
    var sb = {
      console: console, JSON: JSON, Math: Math, Date: Date, String: String, Number: Number, Object: Object, Array: Array, Error: Error,
      Promise: Promise, setTimeout: setTimeout, document: d.document,
      K: {
        hostKodu: function () { return kod; },
        extensionPath: function () { return "C:\\Program Files\\Adobe\\CEP\\extensions\\Suflo\\"; },
        log: function () {},
        cs: { evalScript: function (s, cb) { kayit.evalScript.push(s); cb(o.hostYuklenmez ? "error: x" : "ok"); } },
        call: function (fn, arg) {
          kayit.cagri.push({ fn: fn, arg: arg });
          if (fn === "KS_getContext") return Promise.resolve(o.baglam || { ok: true, hasSeq: true, width: 1080, height: 1920, fps: 30, seqDur: 20 });
          if (fn === "KSAE_altyaziOlustur") return Promise.resolve(o.olustur || { ok: true, adet: arg.katmanlar.length, filigran: !!arg.filigran, eksikFont: o.eksikFont || [] });
          if (fn === "KSAE_altyaziKaldir") return Promise.resolve({ ok: true, removed: 4 });
          return Promise.resolve({ ok: false, error: "?" });
        }
      },
      KApp: { toast: function (m, t) { kayit.toast.push([m, t]); } },
      KCaptions: {
        hasSegments: function () { return segs.length > 0; },
        aeVerisi: function (stilli) {
          var AEm = require(path.join(KOK, "js", "altyazi-efekt.js"));
          return stilli ? { cues: segs, cueKind: "lines", ayar: AEm.gorunum("temiz").ayar, guvenli: false }
            : { cues: segs.map(function (s) { return { start: s.start, end: s.end, text: s.text.replace(/\*/g, "") }; }), cueKind: "lines", ayar: null, guvenli: false };
        }
      },
      Pro: o.pro === null ? undefined : {
        gate: function (f, op) { kayit.gate.push([f, op && op.deneme !== undefined ? op.deneme : null]); return o.kapi !== false; },
        filigranGerekli: function () { return o.isPro !== true; },
        denemeHarca: function (f) { kayit.harca.push(f); return 2; }
      }
    };
    sb.window = sb;
    if (o.akis) sb.SufloAltyaziAkis = o.akis;
    sb.SufloAePlan = require(path.join(KOK, "js", "ae-plan.js"));
    vm.createContext(sb);
    vm.runInContext(oku("js/ae-panel.js"), sb, { filename: "js/ae-panel.js" });
    sb.SufloAePanel.init();
    return { sb: sb, d: d, kayit: kayit, P: sb.SufloAePanel };
  }

  var pp = panel("PPRO");
  ok("Premiere'de ae-panel hiçbir şey yapmaz (sınıf, gizleme, betik, dinleyici yok)", pp.P.aktif() === false && !pp.d.body.classList.contains("host-ae") &&
    pp.d.navlar.every(function (n) { return !n.hasAttribute("data-ae-gizli"); }) && pp.kayit.evalScript.length === 0 &&
    !pp.d.idli["ae-ekle"].dinleyici.click && pp.d.idli["host-ad"].textContent === "PREMIERE" && pp.d.kapsam.textContent === "Seçili klip");
  ok("ana uygulama okunamazsa da Premiere davranışı", panel("").P.aktif() === false);

  var ap = panel("AEFT");
  ok("AE: body.host-ae, yalnız Altyazı ve Ayarlar menüde", ap.P.aktif() && ap.d.body.classList.contains("host-ae") &&
    ap.d.navlar.filter(function (n) { return !n.hasAttribute("data-ae-gizli"); }).map(function (n) { return n.getAttribute("data-tab"); }).join(",") === "captions,settings,settings");
  ok("AE: diğer sekme panelleri ve Kütüphane başlığı gizli", ap.d.paneller.filter(function (p) { return !p.hasAttribute("data-ae-gizli"); }).map(function (p) { return p.id; }).join(",") === "tab-captions,tab-settings" &&
    !ap.d.basliklar[0].hasAttribute("data-ae-gizli") && ap.d.basliklar[1].hasAttribute("data-ae-gizli"));
  ok("AE: üst şerit AFTER EFFECTS, kapsam 'Seçili katman'", ap.d.idli["host-ad"].textContent === "AFTER EFFECTS" && ap.d.idli["host-status"].title === "After Effects bağlantısı" &&
    ap.d.kapsam.textContent === "Seçili katman");
  ok("AE: host-ae.jsx uzantı kökünden $.evalFile ile yüklenir (ileri bölü)", ap.kayit.evalScript.length === 1 &&
    ap.kayit.evalScript[0].indexOf('$.evalFile(new File("C:/Program Files/Adobe/CEP/extensions/Suflo/jsx/host-ae.jsx"))') !== -1, ap.kayit.evalScript[0]);

  // ücretsiz düz ekleme: kapı yok, filigran yok
  await ap.P.ekle(false);
  var olus = ap.kayit.cagri.filter(function (c) { return c.fn === "KSAE_altyaziOlustur"; });
  ok("düz ekleme: Pro kapısı çağrılmaz, plan 'duz', filigransız, kompozisyon boyutuyla", ap.kayit.gate.length === 0 && olus.length === 1 &&
    olus[0].arg.mod === "duz" && olus[0].arg.filigran === null && olus[0].arg.comp.w === 1080 && olus[0].arg.comp.h === 1920 && olus[0].arg.comp.fps === 30 &&
    olus[0].arg.katmanlar[0].metin === "Merhaba dünya", js(olus[0] && olus[0].arg.comp));
  ok("düz ekleme: deneme hakkı düşmez, başarı bildirimi", ap.kayit.harca.length === 0 && ap.kayit.toast.some(function (t) { return t[0] === "1 altyazı katmanı eklendi" && t[1] === "good"; }), js(ap.kayit.toast));

  // İnceleme bulgusu: AE'de deneme filigranı silinebilir ayrı bir metin katmanıydı; bir deneme temiz, düzenlenebilir Pro
  // çıktısı veriyordu. Premiere'in yerel kuralı gibi: düzenlenebilir stilli yerel çıktı yalnız Pro, deneme hakkı yok.
  var st = panel("AEFT", { eksikFont: ["Montserrat-Bold"] });
  await st.P.ekle(true);
  var so = st.kayit.cagri.filter(function (c) { return c.fn === "KSAE_altyaziOlustur"; })[0];
  ok("stilli ekleme: denemesiz Pro.gate('overlay') (deneme düğmesi sunulmaz)", js(st.kayit.gate) === '[["overlay",null]]', js(st.kayit.gate));
  ok("stilli ekleme: plan 'stilli', filigran katmanı yok", so && so.arg.mod === "stilli" && so.arg.filigran === null);
  ok("stilli ekleme: deneme hakkı harcanmaz; düz bildirim; eksik font uyarısı", st.kayit.harca.length === 0 &&
    st.kayit.toast.some(function (t) { return t[0] === "1 altyazı katmanı eklendi" && t[1] === "good"; }) &&
    !st.kayit.toast.some(function (t) { return /deneme/.test(t[0]); }) &&
    st.kayit.toast.some(function (t) { return /kurulu olmayan font: Montserrat-Bold/.test(t[0]) && t[1] === "warn"; }), js(st.kayit.toast));
  var aeSrc = ayikla(oku("js/ae-panel.js"));
  ok("ae-panel.js: deneme / filigran / denemeHarca yok", !/deneme|denemeHarca|filigranGerekli/.test(aeSrc.replace(/"[^"\n]*"/g, '""')), (aeSrc.match(/[^\n]*(deneme|filigran)[^\n]*/) || [""])[0]);
  var htmlAe = oku("index.html");
  var aeIpucu = htmlAe.slice(htmlAe.indexOf('id="ae-altyazi"'), htmlAe.indexOf('id="ae-kaldir"'));
  ok("index.html: AE ipucu 'deneme hakkı yok' der, filigran demez", /Pro \(deneme hakkı yok\)/.test(aeIpucu) && !/filigran/.test(aeIpucu), aeIpucu.slice(-260));
  var readme = oku("README.md");
  ok("README: AE 'Altyazı Efektleriyle ekle' Pro, deneme hakkı yok (TR ve EN)", /\*\*Altyazı Efektleriyle ekle \(Pro; deneme hakkı yok\)/.test(readme) &&
    !/aynı deneme hakkı\)/.test(readme) && /Caption Effects styling and animation: Pro only, no free tries/.test(readme) && !/watermarked as a text layer/.test(readme));
  var pro = panel("AEFT", { isPro: true });
  await pro.P.ekle(true);
  ok("Pro: stilli ekleme filigransız", pro.kayit.cagri.filter(function (c) { return c.fn === "KSAE_altyaziOlustur"; })[0].arg.filigran === null);
  var kapali = panel("AEFT", { kapi: false });
  await kapali.P.ekle(true);
  ok("kapı geçmezse (upsell) After Effects'e hiçbir şey gönderilmez", kapali.kayit.cagri.length === 0 && kapali.kayit.harca.length === 0);
  var hatali = panel("AEFT", { olustur: { ok: false, error: "Altyazi katmanlari eklenemedi: x" } });
  await hatali.P.ekle(true);
  ok("host hatası: hak düşmez, hata bildirilir", hatali.kayit.harca.length === 0 && hatali.kayit.toast.some(function (t) { return t[1] === "bad" && /eklenemedi/.test(t[0]); }));
  // Parti 4 doğrulaması: üç adımlı akışın 3. adımı Premiere'de başarılı uygulamada (yildizIste) "hazır ✓" olur; AE'de
  // ekleme bunu hiç bildirmiyordu, adım çubuğu başarılı eklemeden sonra da "Uygula · şu an" kalıyordu
  var akisCagri = [], akisStub = { guncelle: function (ek) { akisCagri.push(ek); } };
  var akisOk = panel("AEFT", { akis: akisStub });
  await akisOk.P.ekle(false);
  ok("AE başarılı ekleme üç adımlı akışa bildirilir (3. adım hazır ✓)", js(akisCagri) === js([{ uygulandi: true }]), js(akisCagri));
  akisCagri.length = 0;
  await panel("AEFT", { akis: akisStub, olustur: { ok: false, error: "x eklenemedi" } }).P.ekle(true);
  await panel("AEFT", { akis: akisStub, kapi: false }).P.ekle(true);
  ok("AE: host hatasında ve kapı geçmezse akışa 'uygulandı' bildirilmez", akisCagri.length === 0, js(akisCagri));
  var compsuz = panel("AEFT", { baglam: { ok: true, hasSeq: false } });
  await compsuz.P.ekle(false);
  ok("kompozisyon yokken: Türkçe neden, ekleme çağrısı yok", compsuz.kayit.cagri.filter(function (c) { return c.fn === "KSAE_altyaziOlustur"; }).length === 0 &&
    compsuz.kayit.toast.some(function (t) { return t[0] === "After Effects'te bir kompozisyon aç."; }));
  var bos = panel("AEFT", { segs: [] });
  await bos.P.ekle(true);
  ok("altyazı yokken: kapı da açılmaz, uyarı", bos.kayit.gate.length === 0 && bos.kayit.cagri.length === 0 && bos.kayit.toast[0][0] === "Önce altyazı oluştur ya da SRT içe aktar.");
  var yuk = panel("AEFT", { hostYuklenmez: true });
  await Promise.resolve();   // açılıştaki başarısız yükleme sonuçlansın (kullanıcı tıklaması sonra gelir)
  await yuk.P.ekle(false);
  ok("host-ae.jsx yüklenemezse: bildirilir, sonraki eylem yeniden dener", yuk.kayit.toast.some(function (t) { return /host-ae\.jsx\) yüklenemedi/.test(t[0]); }) &&
    yuk.kayit.evalScript.length === 2);
  // Köprünün otomatik çağrıları (2,5 sn'lik bağlam yoklaması) kalıcı bir yükleme hatasında betiği her seferinde yeniden
  // evalFile etmesin: başarısızlıktan sonra 10 sn içinde otomatik deneme beklemeden false; kullanıcı eylemi yine dener
  var oto = await yuk.P.hostYukle(true);
  ok("otomatik yükleme: son başarısızlıktan 10 sn geçmeden yeniden evalFile yok", oto === false && yuk.kayit.evalScript.length === 2);
  await yuk.P.kaldir();
  ok("kullanıcı eylemi (kaldır) 10 sn beklemeden yeniden dener", yuk.kayit.evalScript.length === 3);
  var yukOk = panel("AEFT");
  await Promise.resolve();
  var okOto = await yukOk.P.hostYukle(true);
  ok("yüklendikten sonra otomatik çağrı önbellekten (yeniden evalFile yok)", okOto === true && yukOk.kayit.evalScript.length === 1);
  await ap.P.kaldir();
  ok("kaldır: KSAE_altyaziKaldir, sayılı bildirim", ap.kayit.cagri.some(function (c) { return c.fn === "KSAE_altyaziKaldir"; }) &&
    ap.kayit.toast.some(function (t) { return t[0] === "4 Suflo altyazı katmanı kaldırıldı"; }));

  /* ---------------- app.js / captions.js bağlantıları ---------------- */
  var app = ayikla(oku("js/app.js")), appHam = oku("js/app.js");
  ok("app.js: ae-panel dilden hemen sonra, guvenli içinde başlar", /guvenli\("Dil", arayuzDiliniBaslat\);\s*\n\s*\/\/[^\n]*\n\s*guvenli\("After Effects", function \(\) \{ if \(window\.SufloAePanel\) SufloAePanel\.init\(\); \}\);/.test(appHam));
  ok("app.js: Araç ara gizli AE araçlarını listelemez", /if \(b\.hasAttribute && b\.hasAttribute\("data-ae-gizli"\)\) return;/.test(appHam) &&
    /return !!t && !\(t\.hasAttribute && t\.hasAttribute\("data-ae-gizli"\)\);/.test(appHam));
  ok("app.js: bağlam şeridi AE'de kompozisyon / katman der, Premiere metinleri aynı", />Kompozisyon yok<\/span>/.test(appHam) && />Katman seçilmedi<\/span>/.test(appHam) &&
    /'<span id="ctx-text" class="dim">Sequence yok<\/span><span class="pill">bir sequence aç<\/span>'/.test(appHam) && />Klip seçilmedi<\/span>/.test(appHam) && app.length > 0);
  var cap = oku("js/captions.js");
  ok("captions.js: aeVerisi düz kipte cueler(), stilli kipte video katmanının girdisi", /aeVerisi: function \(stilli\) \{\s*if \(!stilli\) return \{ cues: cueler\(\), cueKind: "lines"/.test(cap) &&
    /return \{ cues: cueler\(\{ vurgu: true, kelimeler: true \}\), cueKind: motorCueTuru\(\), ayar: efektAyari\(\),/.test(cap));

  /* ---------------- paketleme ---------------- */
  var vr = oku("tools/verify-release.ps1");
  var gerekli = (/\$required = @\(([\s\S]*?)\n\s*\)/.exec(vr) || ["", ""])[1];
  ok("verify-release: ae-plan.js, ae-panel.js, host-ae.jsx zorunlu", /js\/ae-plan\\\.js\$/.test(gerekli) && /js\/ae-panel\\\.js\$/.test(gerekli) && /jsx\/host-ae\\\.jsx\$/.test(gerekli));
  ok("package.ps1 / kurucu-yap.ps1 / install betikleri js ve jsx klasörlerini taşır (yeni dosyalar kendiliğinden girer)",
    /\$stageItems = @\([^)]*"js"[^)]*"jsx"/.test(oku("tools/package.ps1")) && /\$panelItems = @\([^)]*"js"[^)]*"jsx"/.test(oku("tools/kurucu-yap.ps1")) &&
    /"js", "i18n", "jsx"/.test(oku("tools/install.ps1")) && /\bjs i18n jsx\b/.test(oku("tools/install.sh")) &&
    ["js/ae-plan.js", "js/ae-panel.js", "jsx/host-ae.jsx"].every(function (f) { return fs.existsSync(path.join(KOK, f)); }));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL beklenmeyen hata: " + (e && e.stack || e)); process.exit(1); });
