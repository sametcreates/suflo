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
  var dom = {}, cagri = [], kapi = [], toastlar = [], goster = [];
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
      call: function (fn, arg, sure) { cagri.push({ fn: fn, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)), sure: sure }); return Promise.resolve(yanit[fn] || { ok: false }); },
      settings: function () { return {}; }, saveSettings: function () {}, log: function () {}, nodeOK: false
    },
    KApp: {
      ctx: function () { return o.ctx || { frame: 1 / 25, sel: { name: "Konusma.mp4", clipStart: 10, clipEnd: 40, inPoint: 0, outPoint: 30, mediaPath: "x" } }; },
      toast: function (m, t, s, e) { toastlar.push({ m: m, t: t }); }, onTab: function () {}, goster: function (ad) { goster.push(ad); }
    },
    Pro: {
      isPro: function () { return o.pro !== false; }, on: function () {}, denemeAcik: function () { return false; },
      gate: function (f, op) { kapi.push(f); return o.kapi === undefined ? true : !!o.kapi; }, denemeHarca: function () {}
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
  return { ctx: ctx, dom: dom, cagri: cagri, kapi: kapi, toastlar: toastlar, depo: depo, goster: goster, belge: belge,
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
    gy.sure === 60000 + 25 * (bek.out.scale.length + bek["in"].scale.length), gy && js({ e: gy.arg.plan.ease, s: gy.sure }));
  await b.dom["zoom-run"].tetikle("click");
  var zy = sonCagri(b, "KS_autoZoom");
  var bekZ = Z.plan({ dur: 30, segments: [], points: [], intensity: 0.12, speed: 0.45, mode: "rhythm", interval: 5, style: "smooth", ease: b.secici("zoom").deger(), fps: 25 });
  ok("Zoom (kullanıcı eğrisi): yük dense, anahtarlar çapalı (a: 1) ve yoğun, kapı 'zoom'", zy && zy.arg.dense === true && zy.arg.keys.length === bekZ.keys.length &&
    zy.arg.keys.length > eskiZ.keys.length && zy.arg.keys.filter(function (k) { return k.a === 1; }).length === bekZ.seyrek &&
    zy.arg.keys.every(function (k, i) { return Math.abs(k.time - (10 + bekZ.keys[i].time)) < 1e-9 && k.value === bekZ.keys[i].value; }) &&
    b.kapi.indexOf("zoom") !== -1 && zy.sure === 30000 + Math.ceil(zy.arg.keys.length * 2 * 25), zy && js({ n: zy.arg.keys.length, s: zy.sure }));
  kartSec(b, "preset-egri", "ziplama");
  await b.dom["preset-grid"].children[1]._q[".preset-apply"].tetikle("click");
  var py = sonCagri(b, "KS_applyMotionPreset");
  ok("Hareket (Zıplama): yük eğriyi tablo olarak taşır (241 değer, uçlar 0 ve 1), kapı 'presets', süre 60 sn", py && py.arg.ease === "ziplama" && py.arg.egri.tablo.length === 241 &&
    py.arg.egri.tablo[0] === 0 && py.arg.egri.tablo[240] === 1 && py.arg.id === "simple-zoom-in" && b.kapi.indexOf("presets") !== -1 && py.sure === 60000, py && js({ e: py.arg.ease, s: py.sure }));
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
