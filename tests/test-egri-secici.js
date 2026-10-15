// Suflo testi: Geçiş, Zoom ve Hareket önayarlarının "Eğri" seçicisi (3.4 adım 12; js/egri.js SufloEgriSecici + SufloEgriIzgara,
// js/gecisler.js, js/zoom.js, js/presets.js). Sahte DOM ve sahte Premiere köprüsü (test-egri-ui.js düzeni):
// seçici Premiere'e gitmez; varsayılan Otomatik iken üç aracın Premiere yükü 3.4 adım 12 öncesiyle bayt bayt aynı; özel eğride
// yük yoğun plan / eğri tablosu taşır; seçim araç başına yerel depoda kalır (bozuk depo Otomatik); kapı aracın kendi kapısı.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms || 5); }); }
var E = require(path.join(KOK, "js", "ease-curve.js"));
var T = require(path.join(KOK, "js", "transitions.js"));
var Z = require(path.join(KOK, "js", "zoom.js"));

/* ---------------- sahte DOM ---------------- */
function eleman(tag, id) {
  var x = { tagName: String(tag || "div").toUpperCase(), id: id || "", children: [], className: "", disabled: false, hidden: false, value: "",
    type: "", style: {}, dataset: {}, innerHTML: "", _o: {}, _a: {}, _q: {}, _text: "", parentNode: null };
  Object.defineProperty(x, "textContent", {
    get: function () { return x.children.length ? x.children.map(function (c) { return c.textContent; }).join("") : x._text; },
    set: function (v) { x._text = String(v); x.children.forEach(function (c) { c.parentNode = null; }); x.children = []; }
  });
  Object.defineProperty(x, "firstChild", { get: function () { return x.children[0] || null; } });
  x.appendChild = function (c) { if (c.parentNode && c.parentNode.removeChild) c.parentNode.removeChild(c); c.parentNode = x; x.children.push(c); return c; };
  x.removeChild = function (c) { x.children = x.children.filter(function (k) { return k !== c; }); c.parentNode = null; return c; };
  x.addEventListener = function (t, fn) { (x._o[t] = x._o[t] || []).push(fn); };
  x.tetikle = function (t, e) { var r; (x._o[t] || []).forEach(function (fn) { r = fn(e || { target: x, preventDefault: function () {}, stopPropagation: function () {} }); }); return r; };
  x.setAttribute = function (k, v) { x._a[k] = String(v); };
  x.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(x._a, k) ? x._a[k] : null; };
  x.removeAttribute = function (k) { delete x._a[k]; };
  x.focus = function () { x._odak = (x._odak || 0) + 1; };
  // presets.js kartı innerHTML ile kurar ve querySelector ile düğmelerini bulur: seçici başına bir taslak eleman
  x.querySelector = function (s) { if (!x._q[s]) { x._q[s] = eleman("button"); x._q[s].parentNode = x; } return x._q[s]; };
  x.querySelectorAll = function () { return []; };
  var sinif = {};
  x.classList = {
    add: function (c) { sinif[c] = 1; }, remove: function (c) { delete sinif[c]; }, contains: function (c) { return !!sinif[c]; },
    toggle: function (c, on) { if (on === undefined ? !sinif[c] : on) sinif[c] = 1; else delete sinif[c]; }
  };
  return x;
}
function hepsi(kok, kosul, out) {
  out = out || [];
  (kok.children || []).forEach(function (c) { if (kosul(c)) out.push(c); hepsi(c, kosul, out); });
  return out;
}
function sinifli(kok, ad) { return hepsi(kok, function (c) { return String(c.className || "").split(" ").indexOf(ad) !== -1; }); }

var IDLER = ["gecis-grid", "gecis-status", "gecis-kaldir", "gecis-sayac", "gecis-sure", "gecis-guc", "gecis-egri",
  "tab-zoom", "zoom-run", "zoom-remove", "zoom-status", "zoom-progress", "zoom-aralik", "zoom-yogunluk", "zoom-hiz", "zoom-egri",
  "tab-presets", "preset-grid", "preset-empty", "preset-count", "preset-sayac", "preset-search", "preset-filter", "preset-proya-gec", "preset-kaldir",
  "preset-speed", "preset-strength", "preset-egri"];
var NOTLAR = { "gecis-egri": "Gelen klip (B) eğriyi izler…", "zoom-egri": "Jump Cut eğri kullanmaz…", "preset-egri": "Paket presetleri kendi eğrisini korur…" };

/*
 * o: { depo (localStorage içeriği), dil, pro (varsayılan true), kapi (Pro.gate yanıtı), ctx (KApp.ctx), stil }
 */
function kur(o) {
  o = o || {};
  var dom = {}, cagri = [], kapi = [], toastlar = [], goster = [], harcanan = [];
  IDLER.forEach(function (id) { dom[id] = eleman(/sure|guc|speed|strength/.test(id) ? "select" : "div", id); });
  dom["gecis-sure"].value = "0.6"; dom["gecis-guc"].value = "1";
  dom["zoom-aralik"].value = "5"; dom["zoom-yogunluk"].value = "12"; dom["zoom-hiz"].value = "0.45";
  dom["preset-speed"].value = "0.45"; dom["preset-strength"].value = "1";
  Object.keys(NOTLAR).forEach(function (id) { var p = eleman("p"); p.className = "hint egri-secici-not"; p.textContent = NOTLAR[id]; dom[id].appendChild(p); });
  var depo = o.depo || {};
  var ls = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(depo, k) ? depo[k] : null; }, setItem: function (k, v) { depo[k] = String(v); },
    removeItem: function (k) { delete depo[k]; }, key: function (i) { return Object.keys(depo)[i]; } };
  Object.defineProperty(ls, "length", { get: function () { return Object.keys(depo).length; } });
  var belge = {
    getElementById: function (id) { return dom[id] || null; },
    createElement: function (t) { return eleman(t); },
    createElementNS: function (ns, t) { return eleman(t); },
    createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; },
    addEventListener: function (t, fn) { (belge._o[t] = belge._o[t] || []).push(fn); },
    querySelector: function (s) {
      if (s === "#zoom-mode .on") return { dataset: { m: "rhythm" } };
      if (s === "#zoom-stil .on") return { dataset: { s: o.stil || "smooth" } };
      if (s === "#zoom-nokta .on") return { dataset: { a: "0.5,0.5" } };
      return null;
    },
    querySelectorAll: function () { return []; },
    hasFocus: function () { return true; }, body: eleman("body"), _o: {}
  };
  var yanit = {
    KS_applyCutTransition: { ok: true, track: 1, half: 0.3, records: [], proje: "" },
    KS_autoZoom: { ok: true, applied: 1, records: [], proje: "" },
    KS_applyMotionPreset: { ok: true, applied: 1, records: [], proje: "" }
  };
  var ctx = {
    document: belge, localStorage: ls, console: console, Date: Date, JSON: JSON, Math: Math, Promise: Promise, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, isNaN: isNaN, Error: Error, RegExp: RegExp,
    setTimeout: function (fn, ms) { return setTimeout(fn, Math.min(ms || 0, 2)); }, clearTimeout: clearTimeout, setInterval: function () { return 0; },
    confirm: function () { return false; },
    K: {
      // gec: zaman aşımından sonra gelen cevabı alan işlev (K.call'un 4. bağımsız değişkeni); o.yanit yanıtları değiştirir
      call: function (fn, arg, sure, gec) {
        cagri.push({ fn: fn, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)), sure: sure, gec: gec });
        return Promise.resolve((o.yanit && o.yanit[fn]) || yanit[fn] || { ok: false });
      },
      settings: function () { return {}; }, saveSettings: function () {}, log: function () {}, nodeOK: false
    },
    KApp: {
      ctx: function () { return o.ctx || { frame: 1 / 25, sel: { name: "Konusma.mp4", clipStart: 10, clipEnd: 40, inPoint: 0, outPoint: 30, mediaPath: "x" } }; },
      toast: function (m, t, s, e) { toastlar.push({ m: m, t: t, e: e }); }, onTab: function () {}, goster: function (ad) { goster.push(ad); }
    },
    Pro: {
      isPro: function () { return o.pro !== false; }, on: function () {}, denemeAcik: function () { return false; },
      gate: function (f, op) { kapi.push(f); return o.kapi === undefined ? true : !!o.kapi; }, denemeHarca: function (f) { harcanan.push(f); }
    }
  };
  ctx.window = ctx;
  if (o.dil) ctx.SufloI18n = { getLang: function () { return o.dil; }, tr: function (s) { return s; }, onChange: function () {} };
  vm.createContext(ctx);
  ["ease-curve.js", "egri-secim.js", "key-records.js", "kayit-kaldir.js", "transitions.js", "egri-model.js", "egri.js", "gecisler.js", "zoom.js", "preset-pack.js", "presets.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(KOK, "js", f), "utf8"), ctx, { filename: "js/" + f });
  });
  ctx.KGecis.init();
  ctx.KZoom.init();
  ctx.KPresets.init();
  return { ctx: ctx, dom: dom, cagri: cagri, kapi: kapi, toastlar: toastlar, depo: depo, goster: goster, belge: belge, harcanan: harcanan,
    secici: function (arac) { return arac === "gecis" ? ctx.KGecis._secici() : arac === "zoom" ? ctx.KZoom._secici() : ctx.KPresets._secici(); } };
}
function dugmesi(kap) { return sinifli(kap, "egri-secici-dugme")[0]; }
function paneli(kap) { return sinifli(kap, "egri-secici-panel")[0]; }
function kartlari(kap) { return sinifli(paneli(kap), "egri-onayar"); }
function kartAc(h, id) { var d = dugmesi(h.dom[id]); d.tetikle("click"); return kartlari(h.dom[id]); }
function kartSec(h, id, ease) {
  var k = kartAc(h, id).filter(function (c) { return c.getAttribute("data-id") === ease; })[0];
  if (k) k.tetikle("click");
  return k;
}
function sonCagri(h, fn) { return h.cagri.filter(function (c) { return c.fn === fn; }).pop(); }

(async function () {
  /* ---------- 1) kuruluş: üç seçici, Premiere'e gidilmez, varsayılan Otomatik ---------- */
  var a = kur();
  ok("init: üç araçta seçici kuruldu, hiç K.call yok", ["gecis", "zoom", "hareket"].every(function (x) { return !!a.secici(x); }) && a.cagri.length === 0, js(a.cagri));
  ok("varsayılan: Otomatik ('auto'); düğme 'Eğri · Otomatik', ad çevrilir (data-i18n-skip yok)", ["gecis", "zoom", "hareket"].every(function (x) { return a.secici(x).deger() === "auto"; }) &&
    sinifli(a.dom["gecis-egri"], "egri-secici-ad")[0].textContent === "Otomatik" && sinifli(a.dom["gecis-egri"], "egri-secici-ad")[0].getAttribute("data-i18n-skip") === null &&
    sinifli(a.dom["gecis-egri"], "egri-secici-etiket")[0].textContent === "Eğri" && !dugmesi(a.dom["gecis-egri"]).classList.contains("ozel"));
  ok("açıklama (index.html) panele taşındı; panel kapalı, aria-expanded false", paneli(a.dom["gecis-egri"]).hidden === true &&
    sinifli(paneli(a.dom["gecis-egri"]), "egri-secici-not").length === 1 && sinifli(a.dom["gecis-egri"], "egri-secici-not")[0].parentNode === paneli(a.dom["gecis-egri"]) &&
    dugmesi(a.dom["gecis-egri"]).getAttribute("aria-expanded") === "false");

  /* ---------- 2) Otomatik: üç aracın Premiere yükü bayt bayt eskisi ---------- */
  var gk = hepsi(a.dom["gecis-grid"], function (c) { return c.tagName === "BUTTON"; });
  await gk[0].tetikle("click");
  var gc = sonCagri(a, "KS_applyCutTransition");
  ok("Geçiş (Otomatik): yük 3.4 adım 12 öncesiyle aynı (plan: hostPlan(id, {süre, güç}), süre 60 sn)", gc && js(gc.arg) === js({ plan: T.hostPlan("zoom-in", { duration: 0.6, strength: 1 }), tolerance: 1 }) &&
    gc.sure === 60000, gc && js(gc.arg).slice(0, 120));
  await a.dom["zoom-run"].tetikle("click");
  var zc = sonCagri(a, "KS_autoZoom");
  var eskiZ = Z.plan({ dur: 30, segments: [], points: [], intensity: 0.12, speed: 0.45, mode: "rhythm", interval: 5, style: "smooth" });
  ok("Zoom (Otomatik): yük eskisiyle aynı (çapa / dense alanı yok), süre 30 sn", zc && js(zc.arg) === js({ keys: eskiZ.keys.map(function (k) { return { time: 10 + k.time, value: k.value }; }),
    anchor: [0.5, 0.5], clearStart: 10, clearEnd: 40 }) && zc.sure === 30000, zc && js(zc.arg).slice(0, 160));
  await a.dom["preset-grid"].children[1]._q[".preset-apply"].tetikle("click");
  var pc = sonCagri(a, "KS_applyMotionPreset");
  ok("Hareket önayarı (Otomatik): yük eskisiyle aynı ({ id, duration, strength }), süre 30 sn", pc && js(pc.arg) === js({ id: "simple-zoom-in", duration: 0.45, strength: 1 }) && pc.sure === 30000, pc && js(pc.arg));
  ok("Otomatik: üç araçta geç cevap işlevi yok (K.call eskisi gibi üç bağımsız değişkenli)", gc.gec === undefined && zc.gec === undefined && pc.gec === undefined);

  /* ---------- 3) seçici: aç, kartlar, seç, depoya yaz ---------- */
  var b = kur({ depo: {
    "suflo.egri.onayarlar": js([{ id: "kab12", ad: "Kıvrak", curve: { type: "bezier", x1: 0.1, y1: 0.2, x2: 0.3, y2: 1 } },
      { id: "kcd34", ad: "Dalga", curve: { type: "multi", pts: [{ x: 0, y: 0 }, { x: 0.5, y: 0.8 }, { x: 1, y: 1 }] } }]),
    "suflo.egri.ayar": js({ egri: { type: "bezier", x1: 0.5, y1: 0, x2: 0.5, y2: 1 } })
  } });
  var kartlar = kartAc(b, "gecis-egri");
  var adlar = kartlar.map(function (k) { return k.children[1].textContent; });
  ok("açılınca: Otomatik, Eğri sekmesindeki eğri, 15 hazır eğri, Eğri sekmesindeki 2 önayar (küçük resimli kartlar)", kartlar.length === 19 && adlar[0] === "Otomatik" &&
    adlar[1] === "Eğri sekmesindeki eğri" && adlar[2] === "Doğrusal" && adlar[17] === "Kıvrak" && adlar[18] === "Dalga" &&
    kartlar.every(function (k) { return k.children[0].tagName === "SVG"; }) && paneli(b.dom["gecis-egri"]).hidden === false &&
    dugmesi(b.dom["gecis-egri"]).getAttribute("aria-expanded") === "true", js(adlar));
  ok("kartlar: Otomatik seçili (aria-pressed), kesikli 'oto' küçük resim; Suflo adları çevrilir, eğri / kullanıcı adları çeviriden muaf",
    kartlar[0].className.indexOf(" on") !== -1 && kartlar[0].getAttribute("aria-pressed") === "true" && kartlar[0].className.indexOf(" oto") !== -1 &&
    kartlar[0].children[0].getAttribute("class").indexOf("oto") !== -1 && kartlar[0].getAttribute("data-i18n-skip") === null && kartlar[1].getAttribute("data-i18n-skip") === null &&
    kartlar[2].getAttribute("data-i18n-skip") === "" && kartlar[17].getAttribute("data-i18n-skip") === "" && !kartlar.some(function (k) { return sinifli(k, "egri-onayar-sil").length; }));
  ok("kart kimlikleri ease metinleri: hazır eğri kimliği, cubic-bezier, SFC1 kodu", kartlar[2].getAttribute("data-id") === "dogrusal" &&
    kartlar[17].getAttribute("data-id") === "cubic-bezier(0.1, 0.2, 0.3, 1)" && /^SFC1\./.test(kartlar[18].getAttribute("data-id")) &&
    kartlar[1].getAttribute("data-id") === "cubic-bezier(0.5, 0, 0.5, 1)");
  kartlar.filter(function (k) { return k.getAttribute("data-id") === "sert-cikis"; })[0].tetikle("click");
  var sd = b.secici("gecis");
  ok("kart seçilince: değer 'sert-cikis', panel kapanır, odak düğmeye döner, düğmede hazır eğri adı (çeviriden muaf) ve 'ozel' vurgusu",
    sd.deger() === "sert-cikis" && paneli(b.dom["gecis-egri"]).hidden === true && dugmesi(b.dom["gecis-egri"])._odak >= 1 &&
    sinifli(b.dom["gecis-egri"], "egri-secici-ad")[0].textContent === "Sert çıkış" && sinifli(b.dom["gecis-egri"], "egri-secici-ad")[0].getAttribute("data-i18n-skip") === "" &&
    dugmesi(b.dom["gecis-egri"]).classList.contains("ozel"));
  ok("seçim araç başına yerel depoda ('suflo.egri.secim'); öbür araçlar Otomatik", JSON.parse(b.depo["suflo.egri.secim"]).gecis === "sert-cikis" &&
    b.secici("zoom").deger() === "auto" && b.secici("hareket").deger() === "auto");
  var dalgaKodu = kartAc(b, "zoom-egri")[18].getAttribute("data-id");
  dugmesi(b.dom["zoom-egri"]).tetikle("click");   // kapat
  kartSec(b, "zoom-egri", dalgaKodu);
  ok("kullanıcı önayarı (çok noktalı) seçilince düğmede adı, değer SFC1 kodu", /^SFC1\./.test(b.secici("zoom").deger()) &&
    sinifli(b.dom["zoom-egri"], "egri-secici-ad")[0].textContent === "Dalga", b.secici("zoom").deger());
  ok("seçici hiçbir zaman Premiere'e gitmez (aç / seç / kapat: K.call yok)", b.cagri.length === 0, js(b.cagri));

  // Escape ve dışarı tıklama kapatır; tek seçici açık kalır
  dugmesi(b.dom["preset-egri"]).tetikle("click");
  b.dom["preset-egri"].tetikle("keydown", { key: "Escape", preventDefault: function () {}, stopPropagation: function () {} });
  ok("Escape paneli kapatır", paneli(b.dom["preset-egri"]).hidden === true && dugmesi(b.dom["preset-egri"]).getAttribute("aria-expanded") === "false");
  dugmesi(b.dom["preset-egri"]).tetikle("click");
  dugmesi(b.dom["gecis-egri"]).tetikle("click");
  ok("yeni seçici açılınca öbürü kapanır", paneli(b.dom["preset-egri"]).hidden === true && paneli(b.dom["gecis-egri"]).hidden === false);
  b.belge._o.click.forEach(function (fn) { fn({ target: kartlari(b.dom["gecis-egri"])[3] }); });
  ok("seçicinin içine tıklama paneli kapatmaz", paneli(b.dom["gecis-egri"]).hidden === false);
  b.belge._o.click.forEach(function (fn) { fn({ target: b.dom["gecis-grid"] }); });
  ok("dışarı tıklama paneli kapatır (tek belge dinleyicisi)", paneli(b.dom["gecis-egri"]).hidden === true && b.belge._o.click.length === 1);
  dugmesi(b.dom["gecis-egri"]).tetikle("click");
  sinifli(paneli(b.dom["gecis-egri"]), "egri-secici-git")[0].tetikle("click");
  ok("'Kendi eğrini Eğri sekmesinde çiz' Eğri sekmesini açar", js(b.goster) === js(["egri"]) && paneli(b.dom["gecis-egri"]).hidden === true);

  /* ---------- 4) özel eğriyle yükler ---------- */
  var gk2 = hepsi(b.dom["gecis-grid"], function (c) { return c.tagName === "BUTTON"; });
  await gk2[0].tetikle("click");
  var gy = sonCagri(b, "KS_applyCutTransition");
  var bek = T.hostPlan("zoom-in", { duration: 0.6, strength: 1, ease: "sert-cikis", fps: 25 });
  ok("Geçiş (Sert çıkış): yük yoğun plan (sekansın 25 kare/sn'siyle), kapı yine 'transitions', süre anahtar sayısıyla", gy && js(gy.arg.plan) === js(bek) &&
    gy.arg.plan.dense === true && gy.arg.plan.ease === "sert-cikis" && b.kapi.indexOf("transitions") !== -1 && b.kapi.indexOf("curves") === -1 &&
    gy.sure === 60000 + 50 * (bek.out.scale.length + bek["in"].scale.length) && typeof gy.gec === "function", gy && js({ e: gy.arg.plan.ease, s: gy.sure }));
  await b.dom["zoom-run"].tetikle("click");
  var zy = sonCagri(b, "KS_autoZoom");
  var bekZ = Z.plan({ dur: 30, segments: [], points: [], intensity: 0.12, speed: 0.45, mode: "rhythm", interval: 5, style: "smooth", ease: b.secici("zoom").deger(), fps: 25 });
  ok("Zoom (kullanıcı eğrisi): yük dense, anahtarlar çapalı (a: 1) ve yoğun, kapı 'zoom'", zy && zy.arg.dense === true && zy.arg.keys.length === bekZ.keys.length &&
    zy.arg.keys.length > eskiZ.keys.length && zy.arg.keys.filter(function (k) { return k.a === 1; }).length === bekZ.seyrek &&
    zy.arg.keys.every(function (k, i) { return Math.abs(k.time - (10 + bekZ.keys[i].time)) < 1e-9 && k.value === bekZ.keys[i].value; }) &&
    b.kapi.indexOf("zoom") !== -1 && zy.sure === 30000 + Math.ceil(zy.arg.keys.length * 2 * 50) && typeof zy.gec === "function", zy && js({ n: zy.arg.keys.length, s: zy.sure }));
  kartSec(b, "preset-egri", "ziplama");
  await b.dom["preset-grid"].children[1]._q[".preset-apply"].tetikle("click");
  var py = sonCagri(b, "KS_applyMotionPreset");
  // tek klip (bağlamda selCount yok), 0,45 sn, 25 kare/sn: 1 × 2 × (12 + 5) = 34 anahtar üst sınırı → 30 sn + 34 × 50 ms
  ok("Hareket (Zıplama): yük eğriyi tablo olarak taşır (241 değer, uçlar 0 ve 1), kapı 'presets', süre üst sınır tahminiyle", py && py.arg.ease === "ziplama" && py.arg.egri.tablo.length === 241 &&
    py.arg.egri.tablo[0] === 0 && py.arg.egri.tablo[240] === 1 && py.arg.id === "simple-zoom-in" && b.kapi.indexOf("presets") !== -1 && py.sure === 30000 + 34 * 50 &&
    typeof py.gec === "function" && js(Object.keys(py.arg.egri)) === js(["tablo"]), py && js({ e: py.arg.ease, s: py.sure }));

  /* ---------- 4b) inceleme: yoğun yazımın süresi seçimle büyür; sınır; zaman aşımı ve geç cevap ---------- */
  var S12 = require(path.join(KOK, "js", "egri-secim.js"));
  var cok = kur({ ctx: { frame: 1 / 59.94, selCount: 30, sel: { name: "Konusma.mp4", clipStart: 10, clipEnd: 40, inPoint: 0, outPoint: 30, mediaPath: "x" } },
    depo: { "suflo.egri.secim": js({ hareket: "yumusak", zoom: "yumusak", gecis: "yumusak" }) } });
  cok.dom["preset-speed"].value = "1.5";
  await cok.dom["preset-grid"].children[4]._q[".preset-apply"].tetikle("click");
  var p30 = sonCagri(cok, "KS_applyMotionPreset");
  ok("Hareket: 30 klip, 1,5 sn, 59,94 kare/sn → süre 30 sn + 30 × 2 × 95 × 50 ms (eskiden 60 sn sabit)", p30 && p30.arg.id === "slide-in-left" &&
    p30.sure === 30000 + 30 * 2 * 95 * 50 && p30.sure === S12.cagriSuresi(30000, S12.hareketAnahtari({ klip: 30, sure: 1.5, fps: 59.94 })) && p30.sure > 60000, p30 && js({ id: p30.arg.id, s: p30.sure }));
  var tek = kur({ ctx: { frame: 1 / 59.94, selCount: 1, sel: { name: "K.mp4", clipStart: 10, clipEnd: 40, inPoint: 0, outPoint: 30, mediaPath: "x" } },
    depo: { "suflo.egri.secim": js({ hareket: "yumusak", zoom: "yumusak" }) } });
  tek.dom["preset-speed"].value = "1.5";
  await tek.dom["preset-grid"].children[4]._q[".preset-apply"].tetikle("click");
  ok("Hareket: süre seçili klip sayısıyla büyür (1 klip < 30 klip)", sonCagri(tek, "KS_applyMotionPreset").sure < p30.sure &&
    sonCagri(tek, "KS_applyMotionPreset").sure === 30000 + 2 * 95 * 50);
  await cok.dom["zoom-run"].tetikle("click");
  await tek.dom["zoom-run"].tetikle("click");
  var z30 = sonCagri(cok, "KS_autoZoom"), z1 = sonCagri(tek, "KS_autoZoom");
  ok("Zoom: host aynı planı her seçili klibe yazar → süre seçili klip sayısıyla (30 klip: anahtar × 2 × 30 × 50 ms)", z30 && z1 && z30.arg.dense === true &&
    z30.sure === Math.min(600000, 30000 + Math.ceil(z30.arg.keys.length * 2 * 30 * 50)) && z1.sure === 30000 + Math.ceil(z1.arg.keys.length * 2 * 50) && z30.sure > z1.sure,
    js({ n: z30.arg.keys.length, s30: z30.sure, s1: z1.sure }));

  // Host toplam sınırı aşıldı: anlaşılır metin (sayılarla), kayıt saklanmaz
  var sinir = kur({ yanit: { KS_applyMotionPreset: { ok: false, kod: "cokFazla", error: "Ozel egriyle cok fazla anahtar kare.", gereken: 6790, enCok: 6000 } },
    depo: { "suflo.egri.secim": js({ hareket: "yumusak" }) } });
  await sinir.dom["preset-grid"].children[1]._q[".preset-apply"].tetikle("click");
  await bekle(10);   // presets.js düğme dinleyicisi apply sözünü döndürmez
  ok("Hareket 'cokFazla': 'Özel eğriyle bu seçim 6790 anahtar kare ister; tek seferde en çok 6000…' (bad), başka bildirim yok",
    sinir.toastlar.length === 1 && sinir.toastlar[0].t === "bad" &&
    sinir.toastlar[0].m === "✕ Özel eğriyle bu seçim 6790 anahtar kare ister; tek seferde en çok 6000. Daha az klip seç ya da Eğri'yi Otomatik yap.", js(sinir.toastlar));

  // Zaman aşımı: hata + "yazım sürüyor olabilir" ipucu; geç gelen cevap kaydı yine saklar (Geri al çıkar)
  var ZA = function (fn) { return { ok: false, zamanAsimi: true, error: "Premiere yanıt vermedi (" + fn + ") — işlem zaman aşımına uğradı." }; };
  var asim = kur({ yanit: { KS_applyMotionPreset: ZA("KS_applyMotionPreset"), KS_autoZoom: ZA("KS_autoZoom"), KS_applyCutTransition: ZA("KS_applyCutTransition") },
    depo: { "suflo.egri.secim": js({ hareket: "yumusak", zoom: "yumusak", gecis: "yumusak" }) } });
  await asim.dom["preset-grid"].children[1]._q[".preset-apply"].tetikle("click");
  await bekle(10);   // presets.js düğme dinleyicisi apply sözünü döndürmez
  var pz = sonCagri(asim, "KS_applyMotionPreset");
  ok("Hareket zaman aşımı: önce hata (bad), sonra ipucu (warn): yazım sürüyor olabilir, bitince kayıt saklanır", asim.toastlar.length === 2 &&
    asim.toastlar[0].t === "bad" && /^✕ Premiere yanıt vermedi \(KS_applyMotionPreset\)/.test(asim.toastlar[0].m) &&
    asim.toastlar[1].t === "warn" && asim.toastlar[1].m === S12.GEC_IPUCU && /yazmayı sürdürüyor olabilir/.test(S12.GEC_IPUCU), js(asim.toastlar));
  var kayitH = { tur: "hareket", seqId: "S1", nodeId: "N1", clipName: "K.mp4", clipStart: 0, matchName: "AE.ADBE Motion", compIdx: 1, propIdx: 0,
    uclar: [0, 0.45], times: [0, 0.04, 0.08, 0.45], kenarDegerleri: [{ t: 0, v: 112 }, { t: 0.45, v: 100 }] };
  asim.toastlar.length = 0;
  pz.gec({ ok: true, applied: 30, records: [kayitH], proje: "" });
  var gt = asim.toastlar.filter(function (x) { return x.t === "good"; });
  ok("Hareket geç cevap: 'Premiere geç yanıt verdi: 30 klibe uygulandi · Simple Zoom In', kayıt saklandı (Geri al)", gt.length === 1 &&
    gt[0].m === "Premiere geç yanıt verdi: 30 klibe uygulandi · Simple Zoom In" && gt[0].e && gt[0].e.metin === "Geri al" &&
    asim.ctx.SufloKaldir.panel().kayitlar("").some(function (r) { return r.tur === "hareket" && r.times.length === 4; }), js(asim.toastlar.map(function (x) { return [x.t, x.m]; })));
  asim.toastlar.length = 0;
  pz.gec({ ok: false, error: "x" });
  ok("geç cevap başarısızsa hiçbir şey yapılmaz", asim.toastlar.length === 0);

  asim.toastlar.length = 0;
  await asim.dom["zoom-run"].tetikle("click");
  var zz = sonCagri(asim, "KS_autoZoom");
  ok("Zoom zaman aşımı: hata durum satırında, ipucu bildirimde; deneme hakkı düşmez", /^✕ Premiere yanıt vermedi \(KS_autoZoom\)/.test(asim.dom["zoom-status"].textContent) &&
    asim.toastlar.length === 1 && asim.toastlar[0].m === S12.GEC_IPUCU && asim.harcanan.indexOf("zoom") === -1, js([asim.dom["zoom-status"].textContent, asim.toastlar]));
  zz.gec({ ok: true, applied: 1, records: [], proje: "" });
  ok("Zoom geç cevap: bildirim 'Premiere geç yanıt verdi: … zoom hareketi eklendi', deneme hakkı o zaman düşer", asim.harcanan.indexOf("zoom") !== -1 &&
    asim.toastlar.some(function (x) { return x.t === "good" && /^Premiere geç yanıt verdi: \d+ zoom hareketi eklendi \(ritmik\)$/.test(x.m); }), js(asim.toastlar));

  asim.toastlar.length = 0;
  await hepsi(asim.dom["gecis-grid"], function (c) { return c.tagName === "BUTTON"; })[0].tetikle("click");
  var gz = sonCagri(asim, "KS_applyCutTransition");
  ok("Geçiş zaman aşımı: hata durum satırında, ipucu bildirimde; deneme hakkı düşmez", /^✕ Premiere yanıt vermedi \(KS_applyCutTransition\)/.test(asim.dom["gecis-status"].textContent) &&
    asim.toastlar.length === 1 && asim.toastlar[0].m === S12.GEC_IPUCU && asim.harcanan.indexOf("transitions") === -1, js([asim.dom["gecis-status"].textContent, asim.toastlar]));
  gz.gec({ ok: true, track: 2, half: 0.3, records: [], proje: "" });
  ok("Geçiş geç cevap: 'Premiere geç yanıt verdi: ↔ … · V2 kesimine eklendi', deneme hakkı o zaman düşer", asim.harcanan.indexOf("transitions") !== -1 &&
    asim.toastlar.some(function (x) { return x.t === "good" && /^Premiere geç yanıt verdi: ↔ .+ · V2 kesimine eklendi$/.test(x.m); }), js(asim.toastlar));
  // Otomatik'te zaman aşımı: eski davranış (ipucu yok; geç cevap işlevi yok)
  var asimOto = kur({ yanit: { KS_applyMotionPreset: ZA("KS_applyMotionPreset") } });
  await asimOto.dom["preset-grid"].children[1]._q[".preset-apply"].tetikle("click");
  await bekle(10);   // presets.js düğme dinleyicisi apply sözünü döndürmez
  ok("Otomatik zaman aşımı: yalnız hata (ipucu yok, geç cevap işlevi yok)", asimOto.toastlar.length === 1 && asimOto.toastlar[0].t === "bad" &&
    sonCagri(asimOto, "KS_applyMotionPreset").gec === undefined, js(asimOto.toastlar));
  // Jump Cut: eğri seçili olsa da sert kesme (yük Otomatik'teki gibi)
  var j = kur({ stil: "jumpcut", depo: { "suflo.egri.secim": js({ zoom: "yumusak" }) } });
  await j.dom["zoom-run"].tetikle("click");
  var jz = sonCagri(j, "KS_autoZoom");
  var eskiJ = Z.plan({ dur: 30, segments: [], points: [], intensity: 0.12, speed: 0.45, mode: "rhythm", interval: 5, style: "jumpcut" });
  ok("Zoom Jump Cut: eğri seçili olsa da yük eskisiyle aynı (sert kesme eğrisizdir)", j.secici("zoom").deger() === "yumusak" && jz && jz.arg.dense === undefined &&
    js(jz.arg.keys) === js(eskiJ.keys.map(function (k) { return { time: 10 + k.time, value: k.value }; })));
  // Kapı kapalıysa (Pro yok, deneme bitti): Premiere'e gidilmez; seçici yine çalışır (seçmek ücretsiz)
  var k = kur({ pro: false, kapi: false, depo: { "suflo.egri.secim": js({ gecis: "tasma" }) } });
  await hepsi(k.dom["gecis-grid"], function (c) { return c.tagName === "BUTTON"; })[0].tetikle("click");
  kartSec(k, "zoom-egri", "esnek");
  ok("kapı kapalı: Geçiş uygulanmaz (K.call yok), kapı 'transitions'; seçici ücretsiz çalışır", k.cagri.length === 0 && js(k.kapi) === js(["transitions"]) &&
    k.secici("zoom").deger() === "esnek" && k.secici("gecis").deger() === "tasma");

  /* ---------- 5) depo: kalıcılık, bozuk veri ---------- */
  var p1 = kur({ depo: { "suflo.egri.secim": js({ gecis: "yay-canli", zoom: "cubic-bezier(0.2,0,0.2,1)", hareket: "dalga" }) } });
  ok("depodaki seçim geri yüklenir (kanonik); geçersiz değer Otomatik", p1.secici("gecis").deger() === "yay-canli" && p1.secici("zoom").deger() === "cubic-bezier(0.2, 0, 0.2, 1)" &&
    p1.secici("hareket").deger() === "auto" && sinifli(p1.dom["zoom-egri"], "egri-secici-ad")[0].textContent === "cubic-bezier(0.2, 0, 0.2, 1)");
  var p2 = kur({ depo: { "suflo.egri.secim": "{bozuk", "suflo.egri.onayarlar": "[[[", "suflo.egri.ayar": "null" } });
  ok("bozuk depo yok sayılır: Otomatik, kartlar yine açılır (Otomatik + 15 hazır)", p2.secici("gecis").deger() === "auto" && kartAc(p2, "gecis-egri").length === 16);
  var atan = kur();
  atan.ctx.localStorage.setItem = function () { throw new Error("kota"); };
  atan.ctx.localStorage.getItem = function () { throw new Error("erişim yok"); };
  kartSec(atan, "gecis-egri", "guclu-s");
  ok("depo erişimi hata verse de seçim bu oturumda çalışır", atan.secici("gecis").deger() === "guclu-s");
  var silinmis = kur({ depo: { "suflo.egri.secim": js({ hareket: E.sfcKodla({ ad: "Silinen önayar", curve: E.builtin("cift-yumusak").curve }) }) } });
  ok("Eğri sekmesinde silinmiş önayarın kodu yine geçerli: eğri ve adı koddan", /^SFC1\./.test(silinmis.secici("hareket").deger()) &&
    sinifli(silinmis.dom["preset-egri"], "egri-secici-ad")[0].textContent === "Silinen önayar");

  /* ---------- 5b) yapıştır (3.4 adım 15): kod, bağlantı, cubic-bezier, CSS her seçicide ---------- */
  var y = kur();
  var degisen = [];
  var kodKutu = function (h, id) { return sinifli(paneli(h.dom[id]), "egri-secici-kod")[0]; };
  var hataKutu = function (h, id) { return sinifli(paneli(h.dom[id]), "egri-secici-hata")[0]; };
  dugmesi(y.dom["gecis-egri"]).tetikle("click");
  ok("yapıştır kutusu panelde (yer tutucu, etiket); hata satırı gizli", !!kodKutu(y, "gecis-egri") && kodKutu(y, "gecis-egri").getAttribute("placeholder") === "SFC1 kodu ya da cubic-bezier(…) yapıştır" &&
    hataKutu(y, "gecis-egri").hidden === true && sinifli(paneli(y.dom["gecis-egri"]), "egri-secici-kullan")[0].textContent === "Kullan");
  kodKutu(y, "gecis-egri").value = "transition-timing-function: cubic-bezier(.2, 0, 0, 1);";
  var engelY = 0, durduY = 0;
  kodKutu(y, "gecis-egri").tetikle("keydown", { key: "Enter", preventDefault: function () { engelY++; }, stopPropagation: function () { durduY++; } });
  ok("Enter: CSS bildirimindeki cubic-bezier seçilir (kanonik), panel kapanır, kutu boşalır", y.secici("gecis").deger() === "cubic-bezier(0.2, 0, 0, 1)" &&
    paneli(y.dom["gecis-egri"]).hidden === true && kodKutu(y, "gecis-egri").value === "" && engelY === 1 && durduY === 1 && JSON.parse(y.depo["suflo.egri.secim"]).gecis === "cubic-bezier(0.2, 0, 0, 1)");
  var adliKod = E.paylasimKodla({ ad: "Arkadaşın eğrisi", curve: E.builtin("cift-yumusak").curve });
  ok("api.yapistir: suflo.app/egri bağlantısı → kod, düğmede kodun adı", y.secici("zoom").yapistir("https://suflo.app/en/egri#" + adliKod) === true &&
    y.secici("zoom").deger() === adliKod && sinifli(y.dom["zoom-egri"], "egri-secici-ad")[0].textContent === "Arkadaşın eğrisi");
  dugmesi(y.dom["preset-egri"]).tetikle("click");
  ok("Hız Rampası kodu: seçilmez, panelde nedeni yazar; panel açık kalır", y.secici("hareket").yapistir(E.paylasimKodla({ tur: "hiz", keys: [[0, 100], [1, 300]] })) === false &&
    y.secici("hareket").deger() === "auto" && hataKutu(y, "preset-egri").hidden === false && /Hız Rampası kodu/.test(hataKutu(y, "preset-egri").textContent) &&
    paneli(y.dom["preset-egri"]).hidden === false);
  ok("boş / bozuk / x aralık dışı: nedenleriyle", y.secici("hareket").yapistir("  ") === false && hataKutu(y, "preset-egri").textContent === "Yapıştırılacak bir kod yok." &&
    y.secici("hareket").yapistir("SFC1.@@@") === false && hataKutu(y, "preset-egri").textContent === "Kod eksik ya da bozuk; baştan sona yeniden kopyala." &&
    y.secici("hareket").yapistir("cubic-bezier(1.5, 0, 0, 1)") === false && /^Geçersiz cubic-bezier/.test(hataKutu(y, "preset-egri").textContent));
  ok("y kırpılırsa uyarı bildirimi; geçerli seçim hata satırını gizler", y.secici("hareket").yapistir("cubic-bezier(0.5, -3, 0.5, 1)") === true &&
    y.secici("hareket").deger() === "cubic-bezier(0.5, -1, 0.5, 1)" && hataKutu(y, "preset-egri").hidden === true &&
    y.toastlar.some(function (t) { return t.m === "cubic-bezier'in y değerleri -1–2 aralığına kırpıldı." && t.t === "warn"; }));
  ok("yapıştırmak da Premiere'e gitmez ve kapıdan geçmez", y.cagri.length === 0 && y.kapi.length === 0);

  /* ---------- 6) İngilizce ---------- */
  var en = kur({ dil: "en", depo: { "suflo.egri.secim": js({ gecis: "ziplama" }) } });
  var enKart = kartAc(en, "zoom-egri");
  ok("İngilizce: hazır eğri adları SufloEase.builtinName ile ('Ease', 'Bounce out'), düğmede de", enKart[2].children[1].textContent === "Ease" &&
    enKart[12].children[1].textContent === "Bounce out" && sinifli(en.dom["gecis-egri"], "egri-secici-ad")[0].textContent === "Bounce out", js(enKart.slice(0, 3).map(function (k) { return k.children[1].textContent; })));
  var I18N = require(path.join(KOK, "js", "i18n.js"));
  I18N.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("İngilizce sözlük: Otomatik → Auto, Eğri → Easing, seçici metinleri", I18N.translate("Otomatik") === "Auto" && I18N.translate("Eğri") === "Easing" &&
    I18N.translate("Eğri sekmesindeki eğri") === "Curve from the Easing tab" && I18N.translate("Kendi eğrini Eğri sekmesinde çiz") === "Draw your own curve in the Easing tab" &&
    I18N.translate("Özel eğri") === "Custom curve" && I18N.translate("Geçersiz eğri: dalga") === "Invalid curve: dalga");

  /* ---------- 7) kaynak ---------- */
  var kaynak = fs.readFileSync(path.join(KOK, "js", "egri.js"), "utf8");
  var i0 = kaynak.indexOf("window.SufloEgriIzgara"), i1 = kaynak.indexOf("window.KEgri");
  ok("kaynakta: SufloEgriIzgara ve SufloEgriSecici gövdelerinde K.call yok; Eğri sekmesi aynı ızgarayı kullanır", i0 > 0 && i1 > i0 && !/K\.call\(/.test(kaynak.slice(i0, i1)) &&
    /SufloEgriIzgara\.ciz\(kap, tumOnayarlar\(\)/.test(kaynak));
  ["gecisler.js", "zoom.js", "presets.js"].forEach(function (f) {
    var s = fs.readFileSync(path.join(KOK, "js", f), "utf8");
    ok(f + ": seçiciyi init'te kurar, kapısı değişmedi (curves kapısı yok)", /SufloEgriSecici\.olustur\(/.test(s) && !/Pro\.gate\("curves"/.test(s));
  });
  ok("temiz oda: lisanssız kaynağın adı yok", ["js/egri.js", "js/egri-secim.js", "js/gecisler.js", "js/zoom.js", "js/presets.js"].every(function (f) {
    return !new RegExp("open" + "curve", "i").test(fs.readFileSync(path.join(KOK, f), "utf8"));
  }));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
