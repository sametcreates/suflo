// Suflo testi: js/egri.js — Eğri sekmesi (3.4 adım 10; sahte DOM, sahte Premiere köprüsü, sahte Pro), test-speedramp-ui.js düzeni.
// init / render Premiere'e gitmez; yoklama yalnız sekme görünür + panel odakta + host boştayken; KS_easeScan yalnız imza
// değişince ya da playhead kapsamdan çıkınca; kısayollar yazı alanında yok sayılır; Uygula 'curves' kapısından (3 deneme)
// geçer, hak yalnız başarıda ve bir kez düşer; geri al kapısız; kayıtlar SufloKeyRecords deposunda; CEP tuş ilgisi.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms || 5); }); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8").replace(/\r\n/g, "\n"); }

/* ---------------- sahte DOM ---------------- */
function eleman(tag, id) {
  var x = { tagName: String(tag || "div").toUpperCase(), id: id || "", children: [], className: "", disabled: false, hidden: false, value: "", checked: false,
    type: "", style: {}, _o: {}, _a: {}, _text: "", parentNode: null };
  Object.defineProperty(x, "textContent", {
    get: function () { return x.children.length ? x.children.map(function (c) { return c.textContent; }).join("") : x._text; },
    set: function (v) { x._text = String(v); x.children.forEach(function (c) { c.parentNode = null; }); x.children = []; }
  });
  Object.defineProperty(x, "firstChild", { get: function () { return x.children[0] || null; } });
  x.appendChild = function (c) { c.parentNode = x; x.children.push(c); return c; };
  x.removeChild = function (c) { x.children = x.children.filter(function (k) { return k !== c; }); c.parentNode = null; return c; };
  x.addEventListener = function (t, fn) { (x._o[t] = x._o[t] || []).push(fn); };
  x.tetikle = function (t, e) { (x._o[t] || []).forEach(function (fn) { fn(e || { target: x, preventDefault: function () {} }); }); };
  x.setAttribute = function (k, v) { x._a[k] = String(v); };
  x.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(x._a, k) ? x._a[k] : null; };
  x.focus = function () {};
  x.getBoundingClientRect = function () { return { left: 0, top: 0, width: 320, height: 220 }; };
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

var IDLER = ["tab-egri", "egri-tanitim", "egri-gorunum-deger", "egri-gorunum-hiz", "egri-editor", "egri-sahne", "egri-kare", "egri-css", "egri-p1x", "egri-p1y",
  "egri-p2x", "egri-p2y", "egri-cevir", "egri-ters", "egri-kaydet", "egri-onayarlar", "egri-yenile", "egri-sonraki", "egri-hedef", "egri-ozellikler",
  "egri-yogunluk", "egri-pr-onizle", "egri-geri-tumu", "egri-uygula", "egri-status",
  // Varışta yaylan (3.4 adım 14)
  "egri-yaylan", "egri-yaylan-grafik", "egri-yaylan-hedef", "egri-yaylan-varis", "egri-yaylan-yol", "egri-yaylan-genlik", "egri-yaylan-genlik-deger",
  "egri-yaylan-frekans", "egri-yaylan-frekans-deger", "egri-yaylan-sonum", "egri-yaylan-sonum-deger", "egri-yaylan-tum", "egri-yaylan-sure", "egri-yaylan-uygula"];

/*
 * o: { cevap(fn, arg, n) → yanıt, pro, kurulu (deneme kurulu), hostMesgul, odak, gizli, aktif (sekme), depo (localStorage içeriği), dil }
 */
function kur(o) {
  o = o || {};
  var dom = {}, cagri = [], kapi = [], harcanan = [], toastlar = [], ilgi = [], raf = [];
  IDLER.forEach(function (id) { dom[id] = eleman(/^egri-(css|p[12][xy])$/.test(id) ? "input" : id === "egri-yogunluk" ? "select" : "div", id); });
  dom["egri-yogunluk"].value = "1";
  if (o.aktif !== false) dom["tab-egri"].classList.add("active");
  var depo = o.depo || {};
  var ls = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(depo, k) ? depo[k] : null; }, setItem: function (k, v) { depo[k] = String(v); },
    removeItem: function (k) { delete depo[k]; }, key: function (i) { return Object.keys(depo)[i]; } };
  Object.defineProperty(ls, "length", { get: function () { return Object.keys(depo).length; } });
  var durumlar = { odak: o.odak !== false, gizli: !!o.gizli, hostMesgul: !!o.hostMesgul };
  var belge = {
    getElementById: function (id) { return dom[id] || null; },
    createElement: function (t) { return eleman(t); },
    createElementNS: function (ns, t) { return eleman(t); },
    createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; },
    addEventListener: function (t, fn) { (belge._o[t] = belge._o[t] || []).push(fn); },
    hasFocus: function () { return durumlar.odak; },
    activeElement: null, _o: {}
  };
  Object.defineProperty(belge, "hidden", { get: function () { return durumlar.gizli; } });
  var ctx = {
    document: belge, localStorage: ls, console: console, Date: Date, JSON: JSON, Math: Math, Promise: Promise,
    setTimeout: function (fn, ms) { return setTimeout(fn, Math.min(ms || 0, 2)); }, clearTimeout: clearTimeout,
    setInterval: function (fn, ms) { ctx._aralik.push({ fn: fn, ms: ms }); return ctx._aralik.length; }, _aralik: [],
    requestAnimationFrame: function (fn) { raf.push(fn); return raf.length; },
    __adobe_cep__: { registerKeyEventsInterest: function (s) { ilgi.push(s); } },
    K: {
      MAC: false,
      call: function (fn, arg, sure) {
        cagri.push({ fn: fn, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)), sure: sure });
        try { return Promise.resolve(o.cevap ? o.cevap(fn, arg, cagri.length) : { ok: false }); } catch (e) { return Promise.reject(e); }
      },
      hostMesgul: function () { return durumlar.hostMesgul; }
    },
    KApp: { toast: function (m, t, s, e) { toastlar.push({ m: m, t: t, e: e }); }, onTab: function (ad, fn) { ctx._tab[ad] = fn; }, onContext: function () {}, onPoll: function () {} },
    _tab: {},
    Pro: {
      isPro: function () { return !!o.pro; }, on: function () {}, denemeAcik: function () { return !!o.kurulu; },
      gate: function (f, op) { kapi.push([f, op]); return !!o.kurulu || !!o.pro; },
      denemeHarca: function (f, bildir) { harcanan.push(f); bildir("1 deneme hakkı kullanıldı · 2 kaldı", "good"); return 2; }
    }
  };
  ctx.window = ctx;
  if (o.dil) {
    var I18N = require(path.join(KOK, "js", "i18n.js"));
    ctx.SufloI18n = { getLang: function () { return o.dil; }, tr: function (s) { return o.dil === "en" ? I18N.translate(s) : s; }, onChange: function () {} };
  }
  vm.createContext(ctx);
  ["ease-curve.js", "key-records.js", "egri-model.js", "egri.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(KOK, "js", f), "utf8"), ctx, { filename: "js/" + f });
  });
  var G = ctx.KEgri;
  var onceInit = cagri.length;
  G.init();
  return { G: G, ctx: ctx, dom: dom, cagri: cagri, kapi: kapi, harcanan: harcanan, toastlar: toastlar, depo: depo, ilgi: ilgi, raf: raf, durumlar: durumlar,
    onceInit: onceInit, cagriAdlari: function () { return cagri.map(function (c) { return c.fn; }); } };
}

/* ---------------- sahte host yanıtları ---------------- */
function prop(nodeId, ad, ci, pi, keys, pair, v0, v1, ek) {
  var p = { nodeId: nodeId, clipName: ad, clipStart: 10, clipEnd: 20, track: 0, compIdx: ci, propIdx: pi, matchName: ci === 0 ? "AE.ADBE Motion/Position" : "AE.ADBE Opacity/Opacity",
    label: ci === 0 ? "Konum" : "Opaklık", labelTablo: true, opak: ci === 1, tur: ci === 0 ? "xy" : "sayi", keys: keys, kesik: false, toplam: keys.length,
    pair: pair, v0: v0, v1: v1, fps: 25 };
  for (var k in ek || {}) p[k] = ek[k];
  return p;
}
function tarama(ph, props, ek) {
  var r = { ok: true, seqId: "s1", ph: ph, fps: 25, proje: "C:/p/deneme.prproj", kaynak: "playhead", kapsam: [10, 20],
    klipler: [{ nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10, clipEnd: 20, track: 0 }], props: props, atlanan: 0 };
  for (var k in ek || {}) r[k] = ek[k];
  return r;
}
function ikiProp(ph) {
  // Konum 11 → 13, Opaklık 12 → 14 (playhead 12,5 ikisinin de içinde)
  return [prop("nA", "Röportaj.mp4", 0, 0, [11, 13], ph >= 11 && ph <= 13 ? { t0: 11, t1: 13, i0: 0, i1: 1, ic: 0, kayitli: false } : null, [0.5, 0.5], [0.8, 0.3]),
    prop("nA", "Röportaj.mp4", 1, 0, [12, 14], ph >= 12 && ph <= 14 ? { t0: 12, t1: 14, i0: 0, i1: 1, ic: 0, kayitli: false } : null, 0, 100)];
}
function peek(ph, selSig, seqId) { return { ok: true, seqId: seqId === undefined ? "s1" : seqId, ph: ph, selSig: selSig || "", fps: 25, proje: "C:/p/deneme.prproj" }; }

var KAYNAK = oku("js/egri.js");
function fnGovde(src, imza) { var i = src.indexOf(imza); return i < 0 ? "" : src.slice(i, src.indexOf("\n  }\n", i) + 4); }

(async function () {
  /* ---------- 1) init / render Premiere'e gitmez ---------- */
  var a = kur({ cevap: function () { throw new Error("çağrılmamalı"); } });
  ok("init: hiç K.call yok (panel açılışında Premiere'e gidilmez)", a.cagri.length === 0 && a.onceInit === 0, js(a.cagriAdlari()));
  a.G._render();
  ok("render: K.call yok", a.cagri.length === 0);
  ok("kaynakta: init / render / listeCiz / onayarKartlari gövdelerinde K.call yok", ["function init(", "function render(", "function listeCiz(", "function onayarKartlari(", "function alanlariCiz("].every(function (f) {
    var g = fnGovde(KAYNAK, f); return g.length > 20 && !/K\.call\(/.test(g);
  }));
  ok("init: yoklama zamanlayıcısı kurulmaz (yalnız sekme açılınca)", a.ctx._aralik.length === 0 && typeof a.ctx._tab.egri === "function");
  ok("init: 15 hazır eğri kartı, seçili 'Yumuşak', cubic-bezier alanı dolu", a.dom["egri-onayarlar"].children.length === 15 &&
    a.dom["egri-onayarlar"].children[1].className.indexOf(" on") !== -1 && a.dom["egri-css"].value === "cubic-bezier(0.25, 0.1, 0.25, 1)", a.dom["egri-css"].value);
  ok("init: düzenleyici SVG'si kuruldu (değer yolu + 2 tutamaç)", hepsi(a.dom["egri-editor"], function (c) { return c.tagName === "CIRCLE"; }).length === 2 &&
    hepsi(a.dom["egri-editor"], function (c) { return c.tagName === "PATH" && /^M/.test(c.getAttribute("d") || ""); }).length >= 1);
  ok("init: kayıt deposuna ve localStorage'a dokunulmaz (yalnız ayar okunur)", Object.keys(a.depo).length === 0);

  /* ---------- 2) yoklama koşulları ---------- */
  var y = kur({ aktif: true, cevap: function (fn) { return fn === "KS_easePeek" ? peek(12.5) : tarama(12.5, ikiProp(12.5)); } });
  y.durumlar.hostMesgul = true;
  await y.G._yokla();
  ok("yoklama: host meşgulken K.call yok", y.cagri.length === 0);
  y.durumlar.hostMesgul = false; y.durumlar.odak = false;
  await y.G._yokla();
  ok("yoklama: panel odakta değilken K.call yok", y.cagri.length === 0);
  y.durumlar.odak = true; y.durumlar.gizli = true;
  await y.G._yokla();
  ok("yoklama: belge gizliyken K.call yok", y.cagri.length === 0);
  y.durumlar.gizli = false;
  y.dom["tab-egri"].classList.remove("active");
  await y.G._yokla();
  ok("yoklama: sekme kapalıyken K.call yok", y.cagri.length === 0);
  y.dom["tab-egri"].classList.add("active");

  /* ---------- 3) tarama yalnız imza değişince / kapsam dışında ---------- */
  var cevaplar = { peek: peek(12.5), tar: tarama(12.5, ikiProp(12.5)) };
  var s = kur({ cevap: function (fn) { return fn === "KS_easePeek" ? cevaplar.peek : fn === "KS_easeScan" ? cevaplar.tar : { ok: false }; } });
  s.ctx._tab.egri();   // sekme açıldı
  await bekle(10);
  ok("sekme açılınca: peek + tarama, 1,2 sn'lik zamanlayıcı kuruldu, tuş ilgisi kaydedildi", js(s.cagriAdlari()) === js(["KS_easePeek", "KS_easeScan"]) &&
    s.ctx._aralik.length === 1 && s.ctx._aralik[0].ms === 1200 && s.ilgi.length === 1 && JSON.parse(s.ilgi[0]).length === 16, js([s.cagriAdlari(), s.ilgi.length]));
  var satirlar = hepsi(s.dom["egri-ozellikler"], function (c) { return /egri-satir( |$)/.test(c.className); });
  var cipler = hepsi(s.dom["egri-ozellikler"], function (c) { return c.className === "egri-cip"; }).map(function (c) { return c.textContent; });
  ok("liste: iki satır, aralık çipleri (sn → sn · kare)", satirlar.length === 2 && js(cipler) === js(["11,00 sn → 13,00 sn · 50 kare", "12,00 sn → 14,00 sn · 50 kare"]), js(cipler));
  ok("hedef satırı: klip adı çevrilmez (data-i18n-skip)", hepsi(s.dom["egri-hedef"], function (c) { return c.getAttribute && c.getAttribute("data-i18n-skip") === "" && c.textContent === "Röportaj.mp4"; }).length === 1);
  await s.G._yokla();
  ok("aynı imza + aynı playhead: yalnız peek", js(s.cagriAdlari()) === js(["KS_easePeek", "KS_easeScan", "KS_easePeek"]), js(s.cagriAdlari()));
  cevaplar.peek = peek(13.5);
  await s.G._yokla();
  cipler = hepsi(s.dom["egri-ozellikler"], function (c) { return /^egri-cip/.test(c.className); }).map(function (c) { return c.textContent; });
  ok("playhead kapsam içinde oynadı: tarama yok, çiftler önbellekten (Konum dışında, Opaklık 12 → 14)", s.cagriAdlari().filter(function (f) { return f === "KS_easeScan"; }).length === 1 &&
    cipler[0] === "playhead çiftin dışında" && cipler[1] === "12,00 sn → 14,00 sn · 50 kare", js(cipler));
  cevaplar.peek = peek(13.5, "nA|10|20");
  await s.G._yokla();
  ok("seçim imzası değişti: yeniden tarama", s.cagriAdlari().filter(function (f) { return f === "KS_easeScan"; }).length === 2, js(s.cagriAdlari()));
  cevaplar.peek = peek(21, "nA|10|20");
  await s.G._yokla();
  ok("playhead taranan kapsamın (klip 10–20) dışına çıktı: yeniden tarama", s.cagriAdlari().filter(function (f) { return f === "KS_easeScan"; }).length === 3, js(s.cagriAdlari()));
  cevaplar.peek = peek(21, "nA|10|20", "s2");
  await s.G._yokla();
  ok("sekans değişti: yeniden tarama", s.cagriAdlari().filter(function (f) { return f === "KS_easeScan"; }).length === 4);
  cevaplar.peek = peek(0, "", "");
  await s.G._yokla();
  ok("sekans yok: tarama yok, 'Aktif sekans yok' ipucu", s.cagriAdlari().filter(function (f) { return f === "KS_easeScan"; }).length === 4 && /Aktif sekans yok/.test(s.dom["egri-hedef"].textContent), s.dom["egri-hedef"].textContent);
  // sekmeden çıkınca tuşlar Premiere'e geri verilir
  s.dom["tab-egri"].classList.remove("active");
  await s.G._yokla();
  ok("sekme kapanınca tuş ilgisi bırakılır (\"\")", s.ilgi[s.ilgi.length - 1] === "", js(s.ilgi.slice(-1)));

  /* ---------- 4) kısayollar ---------- */
  var k = kur({ cevap: function () { return { ok: false }; } });
  var css0 = k.dom["egri-css"].value;
  k.G._tus({ key: "f", target: { tagName: "INPUT", type: "text" }, preventDefault: function () {} });
  ok("kısayol: yazı alanında F yok sayılır", k.dom["egri-css"].value === css0 && k.cagri.length === 0);
  k.G._tus({ key: "f", target: { tagName: "TEXTAREA" }, preventDefault: function () {} });
  ok("kısayol: textarea'da da yok sayılır", k.dom["egri-css"].value === css0);
  var engel = 0;
  k.G._tus({ key: "f", target: { tagName: "DIV" }, preventDefault: function () { engel++; } });
  ok("kısayol F: yön çevrilir (ease → 180° döndürülmüş), Premiere'e gitmez (preventDefault)", k.dom["egri-css"].value === "cubic-bezier(0.75, 0, 0.75, 0.9)" && engel === 1, k.dom["egri-css"].value);
  k.G._tus({ key: "v", target: { tagName: "DIV" }, preventDefault: function () {} });
  ok("kısayol V: Hız görünümü", k.G._durum().gorunum === "hiz" && k.dom["egri-gorunum-hiz"].classList.contains("on"));
  k.G._tus({ key: "3", target: { tagName: "DIV" }, preventDefault: function () {} });
  ok("kısayol 3: üçüncü önayar (Yumuşak giriş)", k.G._durum().seciliOnayar === "yumusak-giris" && k.dom["egri-css"].value === "cubic-bezier(0.42, 0, 1, 1)", k.dom["egri-css"].value);
  k.G._tus({ key: "i", target: { tagName: "DIV" }, preventDefault: function () {} });
  ok("kısayol I: ters çevir (eksen değişimi)", k.dom["egri-css"].value === "cubic-bezier(0, 0.42, 1, 1)", k.dom["egri-css"].value);
  k.G._tus({ key: "f", ctrlKey: true, target: { tagName: "DIV" }, preventDefault: function () {} });
  ok("kısayol: Ctrl'li tuş Premiere'e kalır", k.dom["egri-css"].value === "cubic-bezier(0, 0.42, 1, 1)");
  k.G._tus({ key: "12", target: { tagName: "DIV" }, preventDefault: function () {} });
  k.G._tus({ key: "i", target: { tagName: "DIV" }, preventDefault: function () {} });
  k.G._tus({ key: "u", target: { tagName: "INPUT", type: "number" }, preventDefault: function () {} });
  ok("kısayol U yazı alanında: geri al çağrılmaz", k.cagri.length === 0);
  k.G._tus({ key: "Enter", target: { tagName: "BUTTON" }, preventDefault: function () {} });
  ok("kısayol Enter düğmedeyken: düğme kendi işini yapar (uygula kapısı çağrılmaz)", k.kapi.length === 0);
  k.G._tus({ key: "Enter", target: { tagName: "DIV" }, preventDefault: function () {} });
  ok("kısayol Enter: Uygula (Pro kapısından)", k.kapi.length === 1 && k.kapi[0][0] === "curves");
  // Taşma (backOut) eğrisi tekdüze değil: ters çevirme reddedilir ve eğri değişmez
  k.G._tus({ key: "9", target: { tagName: "DIV" }, preventDefault: function () {} });   // 9. önayar: Geri çekil (backIn)
  k.G._tus({ key: "i", target: { tagName: "DIV" }, preventDefault: function () {} });
  ok("tekdüze olmayan eğride ters çevirme reddedilir, uyarı", k.G._durum().seciliOnayar === "geri-cekil" && /tekdüze/.test(k.dom["egri-status"].textContent), k.dom["egri-status"].textContent);

  /* ---------- 5) Uygula: kapı 'curves' + deneme, toplu, hak bir kez ---------- */
  var u0 = kur({ kurulu: false, cevap: function () { throw new Error("çağrılmamalı"); } });
  await u0.G.uygula();
  ok("kurulmamışken Premiere'e gidilmez; kapı 'curves' + deneme:true + yeniden", u0.cagri.length === 0 && u0.kapi.length === 1 && u0.kapi[0][0] === "curves" &&
    u0.kapi[0][1].deneme === true && typeof u0.kapi[0][1].yeniden === "function" && u0.harcanan.length === 0, js(u0.kapi));
  var UY = KAYNAK;
  ok("kaynakta: uygula'nın ilk satırı 'curves' kapısı", /async function uygula\(\) \{\n    if \(typeof Pro !== "undefined" && !Pro\.gate\("curves", \{ deneme: true, yeniden: function \(\) \{ uygula\(\); \} \}\)\) return;/.test(UY));
  // iki seçili klip: klip başına bir KS_easeBake; biri başarısız → hak bir kez
  var ikiKlip = tarama(12.5, ikiProp(12.5).concat([prop("nB", "B-roll.mov", 0, 0, [12, 13], { t0: 12, t1: 13, i0: 0, i1: 1, ic: 0, kayitli: false }, [0, 0], [1, 1])]),
    { kaynak: "secim", kapsam: [-1e9, 1e9], klipler: [{ nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10, track: 0 }, { nodeId: "nB", clipName: "B-roll.mov", clipStart: 10, track: 1 }] });
  var u = kur({ kurulu: true, cevap: function (fn, arg) {
    if (fn === "KS_easeScan") return ikiKlip;
    if (fn === "KS_easeBake") {
      if (arg.target.nodeId === "nB") return { ok: true, basarili: 0, sonuclar: [{ i: 0, ok: false, kod: "degisti" }], records: [], yazilan: 0 };
      return { ok: true, basarili: 2, yazilan: 98, sonuclar: [{ i: 0, ok: true }, { i: 1, ok: true }], records: arg.items.map(function (it) {
        var times = it.keys.map(function (q) { return q.t; });
        return { tur: "egri", seqId: "s1", nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10, matchName: it.matchName, compIdx: it.compIdx, propIdx: it.propIdx, uclar: [it.t0, it.t1], times: times };
      }) };
    }
    return { ok: false };
  } });
  await u.G.uygula();
  var bake = u.cagri.filter(function (c) { return c.fn === "KS_easeBake"; });
  ok("uygula: önce taze tarama (uç değerleri o anki hâlinden), sonra klip başına bir bake", u.cagri[0].fn === "KS_easeScan" && bake.length === 2 &&
    bake[0].arg.target.nodeId === "nA" && bake[0].arg.items.length === 2 && bake[1].arg.target.nodeId === "nB" && bake.every(function (c) { return c.sure === 120000 && c.arg.target.seqId === "s1"; }), js(u.cagriAdlari()));
  var konumOge = bake[0].arg.items[0], opakOge = bake[0].arg.items[1];
  ok("bake öğesi: uçlar, değerler, kimlik, 49 iç anahtar (her kare), [x,y] değerler", konumOge.t0 === 11 && konumOge.t1 === 13 && js(konumOge.v0) === js([0.5, 0.5]) &&
    konumOge.matchName === "AE.ADBE Motion/Position" && konumOge.keys.length === 49 && Array.isArray(konumOge.keys[0].v) && konumOge.degistir === false, js(konumOge).slice(0, 200));
  ok("Opaklık öğesi 0..100 içinde", opakOge.keys.every(function (q) { return q.v >= 0 && q.v <= 100; }));
  ok("en az bir başarıda hak bir kez düşer ('curves')", js(u.harcanan) === js(["curves"]) && u.toastlar.some(function (t) { return t.m === "1 deneme hakkı kullanıldı · 2 kaldı"; }), js(u.harcanan));
  var depoAnahtar = Object.keys(u.depo).filter(function (x) { return /^suflo\.anahtarKayit\.v1:/.test(x); })[0];
  var KR = require(path.join(KOK, "js", "key-records.js"));
  var saklanan = KR.depo(u.ctx.localStorage).oku("C:/p/deneme.prproj");
  ok("kayıtlar SufloKeyRecords deposunda (proje başına), id'li", !!depoAnahtar && saklanan.length === 2 && saklanan.every(function (r) { return r.tur === "egri" && /^kr/.test(r.id); }), js(saklanan.map(function (r) { return [r.matchName, r.times.length]; })));
  var bildirim = u.toastlar.filter(function (t) { return t.e && t.e.metin === "Geri al"; })[0];
  ok("bildirim: özet + atlanan neden + 'Geri al' eylemi", !!bildirim && /Eğri uygulandı: 2 özellik · 98 anahtar kare/.test(bildirim.m.textContent) && /uç anahtar karenin değeri değişmiş/.test(bildirim.m.textContent), bildirim && bildirim.m.textContent);
  // Geri al (bildirimden) kapısız; son uygulamanın kayıtları gider, sonuçlar depodan silinir
  var onceKapi = u.kapi.length;
  u.ctx.K.call = (function (eski) {
    return function (fn, arg, sure) {
      if (fn === "KS_easeUndo") { u.cagri.push({ fn: fn, arg: JSON.parse(JSON.stringify(arg)), sure: sure }); return Promise.resolve({ ok: true, sonuclar: arg.records.map(function (r) { return { id: r.id, ok: true, silinen: r.times.length }; }), atlanan: [] }); }
      return eski(fn, arg, sure);
    };
  })(u.ctx.K.call);
  bildirim.e.fn();
  await bekle(20);
  var geri = u.cagri.filter(function (c) { return c.fn === "KS_easeUndo"; });
  ok("Geri al: kapı çağrılmaz, son uygulamanın iki kaydı KS_easeUndo'ya", geri.length === 1 && geri[0].arg.records.length === 2 && u.kapi.length === onceKapi, js(geri.map(function (g) { return g.arg.records.length; })));
  ok("Geri al: kayıtlar depodan silindi, durum satırı", KR.depo(u.ctx.localStorage).oku("C:/p/deneme.prproj").length === 0 && /Geri alındı: 98 anahtar kare silindi/.test(u.dom["egri-status"].textContent), u.dom["egri-status"].textContent);

  // hepsi başarısız → hak düşmez, durum satırı nedeni söyler
  var h = kur({ kurulu: true, cevap: function (fn) {
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_easeBake") return { ok: false, kod: "klipTasindi" };
    return { ok: false };
  } });
  await h.G.uygula();
  ok("hiçbir özellik yazılmazsa hak düşmez; neden durumda", h.harcanan.length === 0 && /Uygulanamadı/.test(h.dom["egri-status"].textContent) && /bad/.test(h.dom["egri-status"].className), h.dom["egri-status"].textContent);
  // playhead hiçbir çiftte değil → Premiere'e yazma çağrısı yok
  var d = kur({ kurulu: true, cevap: function (fn) { return fn === "KS_easeScan" ? tarama(10.2, ikiProp(10.2)) : { ok: false }; } });
  await d.G.uygula();
  ok("uygulanacak çift yok: bake çağrılmaz, hak düşmez, açıklama", d.cagri.filter(function (c) { return c.fn === "KS_easeBake"; }).length === 0 && d.harcanan.length === 0 &&
    /Uygulanacak çift yok/.test(d.dom["egri-status"].textContent), d.dom["egri-status"].textContent);

  /* ---------- 6) kayıtlı aralık: yeniden uygulamada degistir yalnız o öğede; eski kayıt yerine yenisi ---------- */
  var times = []; for (var t = 1; t < 50; t++) times.push(Math.round((11 + t * 0.04) * 10000) / 10000);
  var eskiKayit = { id: "kreski1", tur: "egri", seqId: "s1", nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10, matchName: "AE.ADBE Motion/Position", compIdx: 0, propIdx: 0, uclar: [11, 13], times: times, createdAt: 1000 };
  var dp = {};
  KR.depo({ getItem: function (k) { return dp[k] === undefined ? null : dp[k]; }, setItem: function (k, v) { dp[k] = v; }, removeItem: function (k) { delete dp[k]; } }).ekle("C:/p/deneme.prproj", eskiKayit);
  var konumKeys = [11].concat(times).concat([13]);
  var kayitli = prop("nA", "Röportaj.mp4", 0, 0, konumKeys, { t0: 11, t1: 13, i0: 0, i1: 50, ic: 49, kayitli: true }, [0.5, 0.5], [0.8, 0.3]);
  var r6 = kur({ kurulu: true, depo: dp, cevap: function (fn, arg) {
    if (fn === "KS_easePeek") return peek(12.02);
    if (fn === "KS_easeScan") return tarama(12.02, [kayitli]);
    if (fn === "KS_easeBake") return { ok: true, basarili: 1, yazilan: 49, sonuclar: [{ i: 0, ok: true, silinen: 49 }], records: [{ tur: "egri", seqId: "s1", nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10,
      matchName: "AE.ADBE Motion/Position", compIdx: 0, propIdx: 0, uclar: [11, 13], times: arg.items[0].keys.map(function (q) { return q.t; }) }] };
    return { ok: false };
  } });
  r6.ctx._tab.egri();
  await bekle(10);
  var taramalar6 = r6.cagri.filter(function (c) { return c.fn === "KS_easeScan"; });
  ok("tarama ipuçları: ilk taramada önbellek boş; canlılık yeni anahtarlarla ölçülüp kaydın uçları ikinci taramayla host'a gider", taramalar6.length === 2 &&
    js(taramalar6[0].arg.ipuclari) === "[]" && js(taramalar6[1].arg.ipuclari) === js([{ nodeId: "nA", compIdx: 0, propIdx: 0, t0: 11, t1: 13 }]), js(taramalar6.map(function (c) { return c.arg; })));
  await r6.G._yokla();
  ok("sonraki yoklamada ipuçları değişmediyse tek tarama da yok (yalnız peek)", r6.cagri.filter(function (c) { return c.fn === "KS_easeScan"; }).length === 2);
  var satir6 = hepsi(r6.dom["egri-ozellikler"], function (c) { return /egri-satir( |$)/.test(c.className); })[0];
  ok("kayıtlı aralık: çip 11 → 13 (Suflo'nun iç anahtarları çifti bölmez), 'Suflo eğrisi' + satır Geri al", satir6 &&
    hepsi(satir6, function (c) { return c.className === "egri-cip"; })[0].textContent === "11,00 sn → 13,00 sn · 50 kare" &&
    hepsi(satir6, function (c) { return c.className === "egri-rozet"; }).length === 1 && hepsi(satir6, function (c) { return /egri-satir-geri/.test(c.className); }).length === 1, satir6 && satir6.textContent);
  await r6.G.uygula();
  var bake6 = r6.cagri.filter(function (c) { return c.fn === "KS_easeBake"; })[0];
  ok("yeniden uygulama: degistir yalnız kayıtlı öğede (çağrı genelinde değil)", bake6 && bake6.arg.items[0].degistir === true && !bake6.arg.degistir, bake6 && js({ d: bake6.arg.degistir, i: bake6.arg.items[0].degistir }));
  var son6 = KR.depo(r6.ctx.localStorage).oku("C:/p/deneme.prproj");
  ok("yeni kayıt eskinin yerine geçti (aynı satır, çakışan uçlar)", son6.length === 1 && son6[0].id !== "kreski1", js(son6.map(function (r) { return r.id; })));

  /* ---------- 7) Tümünü geri al: kapısız; bulunamayan klibin kaydı saklanır ---------- */
  var dp2 = {};
  var ikiKayit = [eskiKayit, { id: "krbaska", tur: "egri", seqId: "s1", nodeId: "nZ", clipName: "Silindi.mp4", clipStart: 30, matchName: "AE.ADBE Opacity/Opacity", compIdx: 1, propIdx: 0, uclar: [31, 32], times: [31.5], createdAt: 2000 },
    { id: "krdiger", tur: "egri", seqId: "s9", nodeId: "nQ", clipName: "Q.mp4", clipStart: 0, matchName: "x/y", compIdx: 0, propIdx: 0, uclar: [1, 2], times: [1.5], createdAt: 3000 }];
  KR.depo({ getItem: function (k) { return dp2[k] === undefined ? null : dp2[k]; }, setItem: function (k, v) { dp2[k] = v; }, removeItem: function (k) { delete dp2[k]; } }).ekle("C:/p/deneme.prproj", ikiKayit);
  var g7 = kur({ kurulu: false, depo: dp2, cevap: function (fn, arg) {
    if (fn === "KS_easePeek") return peek(12.5);
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_easeUndo") return { ok: true, sonuclar: [{ id: "kreski1", ok: true, silinen: 49 }], atlanan: [{ id: "krbaska", kod: "klipYok" }] };
    return { ok: false };
  } });
  g7.ctx._tab.egri();
  await bekle(10);
  await g7.G.geriAlTumu();
  var u7 = g7.cagri.filter(function (c) { return c.fn === "KS_easeUndo"; });
  ok("Tümünü geri al: kapısız (deneme kurulu değilken de), yalnız bu sekansın kayıtları", g7.kapi.length === 0 && u7.length === 1 &&
    js(u7[0].arg.records.map(function (r) { return r.id; }).sort()) === js(["krbaska", "kreski1"]), js(u7.map(function (c) { return c.arg.records.map(function (r) { return r.id; }); })));
  var kalan7 = KR.depo(g7.ctx.localStorage).oku("C:/p/deneme.prproj").map(function (r) { return r.id; }).sort();
  ok("geri alınan kayıt silindi; bulunamayan klibin ve başka sekansın kaydı saklandı", js(kalan7) === js(["krbaska", "krdiger"]) &&
    /bulunamadı; kayıtlar saklandı/.test(g7.dom["egri-status"].textContent), js(kalan7) + " " + g7.dom["egri-status"].textContent);

  /* ---------- 8) depo yazılamıyorsa: bellek kaydı, uyarı; iş yine biter ---------- */
  var b8 = kur({ kurulu: true, cevap: function (fn, arg) {
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_easeBake") return { ok: true, basarili: 1, yazilan: 49, sonuclar: [{ i: 0, ok: true }, { i: 1, ok: false, kod: "ucYok" }],
      records: [{ tur: "egri", seqId: "s1", nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10, matchName: "AE.ADBE Motion/Position", compIdx: 0, propIdx: 0, uclar: [11, 13], times: [11.04, 11.08] }] };
    return { ok: false };
  } });
  b8.ctx.localStorage.setItem = function () { throw new Error("QuotaExceededError"); };
  await b8.G.uygula();
  ok("depo yazılamazsa kayıt bu oturumun belleğinde, uyarı bildirimi; hak yine bir kez", b8.G._durum().bellek.length === 1 && js(b8.harcanan) === js(["curves"]) &&
    b8.toastlar.some(function (t) { return /saklanamadı/.test(typeof t.m === "string" ? t.m : ""); }), js(b8.G._durum().bellek.length));

  /* ---------- 9) etiketler ve İngilizce ---------- */
  var e9 = kur({ dil: "en", cevap: function (fn) {
    if (fn === "KS_easePeek") return peek(12.5);
    if (fn === "KS_easeScan") return tarama(12.5, [prop("nA", "Röportaj.mp4", 2, 0, [11, 13], { t0: 11, t1: 13, i0: 0, i1: 1, ic: 0, kayitli: false }, 0, 50,
      { label: "Gaussian Blur › Bulanıklık", labelTablo: false, matchName: "AE.ADBE Gaussian Blur 2/Blurriness" }), ikiProp(12.5)[0]]);
    return { ok: false };
  } });
  e9.ctx._tab.egri();
  await bekle(10);
  var adlar = hepsi(e9.dom["egri-ozellikler"], function (c) { return c.tagName === "SPAN" && c.parentNode && c.parentNode.className === "egri-satir-ad"; });
  ok("Premiere'in kendi özellik adı çevrilmez (data-i18n-skip), Suflo tablosundaki ad çevrilebilir", adlar.length === 2 && adlar[0].getAttribute("data-i18n-skip") === "" &&
    adlar[0].textContent === "Gaussian Blur › Bulanıklık" && adlar[1].getAttribute("data-i18n-skip") === null && adlar[1].textContent === "Konum", js(adlar.map(function (x) { return [x.textContent, x.getAttribute("data-i18n-skip")]; })));
  var kartlar = e9.dom["egri-onayarlar"].children;
  ok("İngilizce: önayar kartları SufloEase.builtinName ile ('Ease', 'Bounce out'), kart çeviriden muaf", kartlar[1].children[1].textContent === "Ease" &&
    kartlar[11].children[1].textContent === "Bounce out" && kartlar[1].getAttribute("data-i18n-skip") === "", kartlar[1].children[1].textContent + " / " + kartlar[11].children[1].textContent);
  var I18N = require(path.join(KOK, "js", "i18n.js"));
  I18N.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("İngilizce: aralık çipi '1.20 s → 2.00 s · 24 frames'", I18N.translate("1,20 sn → 2,00 sn · 24 kare") === "1.20 s → 2.00 s · 24 frames" && I18N.translate("0,00 sn → 0,04 sn · 1 kare") === "0.00 s → 0.04 s · 1 frame",
    I18N.translate("1,20 sn → 2,00 sn · 24 kare"));
  ok("İngilizce: Konum / Yönü çevir / Anahtar sıklığı / ortak 'Çevir' ve 'Yoğunluk' bozulmadı", I18N.translate("Konum") === "Position" && I18N.translate("Yönü çevir") === "Flip" &&
    I18N.translate("Anahtar sıklığı") === "Key density" && I18N.translate("Çevir") === "Translate" && I18N.translate("Yoğunluk") === "Intensity");
  ok("İngilizce: deneme ipucu 'Uygula'", I18N.translate(require(path.join(KOK, "js", "deneme.js")).tanitimIpucu("curves").mesaj) === "Trial on: now press \"Apply\"");

  /* ---------- 9b) inceleme: odak dönüşü, taze playhead, bildirimdeki Geri al, ret nedenleri, zaman aşımı, önayar adı ---------- */
  function taramaSayisi(x) { return x.cagri.filter(function (c) { return c.fn === "KS_easeScan"; }).length; }
  // odak Premiere'deyken kullanıcı Effect Controls'te anahtar ekler (seçim imzası aynı): odak dönünce bir kez taranır
  var od = { peek: peek(12.5), tar: tarama(12.5, []) };
  var f1 = kur({ cevap: function (fn) { return fn === "KS_easePeek" ? od.peek : fn === "KS_easeScan" ? od.tar : { ok: false }; } });
  f1.ctx._tab.egri();
  await bekle(10);
  await f1.G._yokla();
  ok("odak: ilk tarama + aynı imzada yalnız peek", taramaSayisi(f1) === 1 && /iki ya da daha çok anahtar kareli/.test(f1.dom["egri-hedef"].textContent), js(f1.cagriAdlari()));
  f1.durumlar.odak = false;
  await f1.G._yokla();
  var onceOdak = f1.cagri.length;
  od.tar = tarama(12.5, ikiProp(12.5));   // kullanıcı iki özelliğe anahtar koydu
  f1.durumlar.odak = true;
  await f1.G._yokla();
  ok("odak dönünce: imza ve playhead aynıyken de bir kez yeniden tarama, yeni anahtarlar listede", onceOdak === 3 && taramaSayisi(f1) === 2 &&
    hepsi(f1.dom["egri-ozellikler"], function (c) { return /egri-satir( |$)/.test(c.className); }).length === 2, js(f1.cagriAdlari()));
  await f1.G._yokla();
  ok("odak dönüşünden sonra yine yalnız peek (sürekli tarama yok)", taramaSayisi(f1) === 2);
  f1.dom["tab-egri"].classList.remove("active");
  f1.dom["tab-egri"].classList.add("active");
  f1.ctx._tab.egri();
  await bekle(10);
  ok("sekme yeniden açılınca bir kez yeniden tarama", taramaSayisi(f1) === 3, js(f1.cagriAdlari()));

  // panel odakta değilken playhead Premiere'de oynadı: 'Premiere'de önizle' önce peek eder, yeni çifti oynatır ve oraya döner
  var pz = { peek: peek(12.5) };
  var p1 = kur({ cevap: function (fn) {
    if (fn === "KS_easePeek") return pz.peek;
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_setPlayerPosition") return { ok: true };
    return { ok: false };
  } });
  p1.ctx._tab.egri();
  await bekle(10);
  pz.peek = peek(13.6);   // Konum 11–13 dışında, Opaklık 12–14 içinde
  var onceP = p1.cagri.length;
  p1.dom["egri-pr-onizle"].tetikle("click");
  for (var bk = 0; bk < 60 && p1.G._durum().mesgul; bk++) await bekle(5);
  var sonra = p1.cagri.slice(onceP), konumlar = sonra.filter(function (c) { return c.fn === "KS_setPlayerPosition"; }).map(function (c) { return c.arg.sec; });
  ok("Premiere'de önizle: önce peek; taze playhead'in çifti (12 → 14) oynatılır, sonda taze yere (13,6) döner", sonra[0].fn === "KS_easePeek" && konumlar[0] === 12 &&
    konumlar[konumlar.length - 2] === 14 && konumlar[konumlar.length - 1] === 13.6, js([sonra[0].fn, konumlar[0], konumlar.slice(-2)]));

  // Sonraki çift: canlı Suflo kaydının iç anahtarları atlanır (A içinden B'ye)
  var dpS = {};
  KR.depo({ getItem: function (k) { return dpS[k] === undefined ? null : dpS[k]; }, setItem: function (k, v) { dpS[k] = v; }, removeItem: function (k) { delete dpS[k]; } }).ekle("C:/p/deneme.prproj", eskiKayit);
  var abcKeys = [11].concat(times).concat([13, 15]);
  var sc = kur({ depo: dpS, cevap: function (fn) {
    if (fn === "KS_easePeek") return peek(12.02);
    if (fn === "KS_easeScan") return tarama(12.02, [prop("nA", "Röportaj.mp4", 0, 0, abcKeys, { t0: 11, t1: 13, i0: 0, i1: 50, ic: 49, kayitli: true }, [0.5, 0.5], [0.8, 0.3])]);
    if (fn === "KS_setPlayerPosition") return { ok: true };
    return { ok: false };
  } });
  sc.ctx._tab.egri();
  await bekle(10);
  sc.dom["egri-sonraki"].tetikle("click");
  await bekle(20);
  var git = sc.cagri.filter(function (c) { return c.fn === "KS_setPlayerPosition"; }).map(function (c) { return c.arg.sec; });
  var cipS = hepsi(sc.dom["egri-ozellikler"], function (c) { return /^egri-cip/.test(c.className); }).map(function (c) { return c.textContent; });
  ok("Sonraki çift: kayıtlı aralığın içinden B + 0,25 kareye (13,01), çip B → C; Suflo'nun anahtarları kare kare gezilmez", js(git) === js([13.01]) &&
    cipS[0] === "13,00 sn → 15,00 sn · 50 kare", js([git, cipS]));

  // bildirimdeki Geri al yalnız KENDİ uygulamasının kayıtlarını kaldırır (arada ikinci uygulama yapılsa da)
  var ikinci = 0;
  var gb = kur({ kurulu: true, cevap: function (fn, arg) {
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_easeBake") { ikinci++; return { ok: true, basarili: 1, yazilan: 2, sonuclar: [{ i: 0, ok: true }], records: [{ tur: "egri", seqId: "s1", nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10,
      matchName: "AE.ADBE Motion/Position", compIdx: 0, propIdx: ikinci, uclar: [11, 13], times: [11.04 + ikinci * 0.001, 11.08] }] }; }
    if (fn === "KS_easeUndo") return { ok: true, sonuclar: arg.records.map(function (r) { return { id: r.id, ok: true, silinen: 2 }; }), atlanan: [] };
    return { ok: false };
  } });
  await gb.G.uygula();
  var t1 = gb.toastlar.filter(function (t) { return t.e && t.e.metin === "Geri al"; })[0];
  var ilkId = gb.G._durum().sonUygulanan.slice();
  await gb.G.uygula();
  var ikinciId = gb.G._durum().sonUygulanan.slice();
  t1.e.fn();
  await bekle(20);
  var geriGb = gb.cagri.filter(function (c) { return c.fn === "KS_easeUndo"; });
  ok("ilk bildirimin Geri al'ı ilk uygulamanın kaydını gönderir (ikincinin değil)", geriGb.length === 1 && ilkId.length === 1 && ikinciId[0] !== ilkId[0] &&
    js(geriGb[0].arg.records.map(function (r) { return r.id; })) === js(ilkId), js([ilkId, ikinciId, geriGb.map(function (g) { return g.arg.records.map(function (r) { return r.id; }); })]));

  // klip başına ret (klip taşındı) ve kısmi yazım nedeniyle görünür
  var kt = kur({ kurulu: true, cevap: function (fn) {
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_easeBake") return { ok: false, kod: "klipTasindi" };
    return { ok: false };
  } });
  await kt.G.uygula();
  ok("klip taşındı: satırda 'klip taşınmış…' nedeni (genel 'uygulanamadı' değil)", /Konum: klip taşınmış; liste yenilendi, yeniden dene/.test(kt.dom["egri-status"].textContent), kt.dom["egri-status"].textContent);
  var ek = kur({ kurulu: true, cevap: function (fn) {
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_easeBake") return { ok: true, basarili: 2, yazilan: 60, sonuclar: [{ i: 0, ok: true, kod: "eksik" }, { i: 1, ok: true }], records: [] };
    return { ok: false };
  } });
  await ek.G.uygula();
  ok("kısmi yazım ('eksik'): durum ve bildirim uyarı, neden 'bazı anahtar kareler yazılamadı'", /warn/.test(ek.dom["egri-status"].className) &&
    /kısmen yazıldı: Konum: bazı anahtar kareler yazılamadı/.test(ek.dom["egri-status"].textContent), ek.dom["egri-status"].textContent);

  // zaman aşımı: hak düşmez, planlanan zamanlar geçici kayıt olarak saklanır (Geri al canlıysa kaldırır)
  var za = kur({ kurulu: true, cevap: function (fn) {
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_easeBake") return { ok: false, error: "Premiere yanıt vermedi (KS_easeBake) — işlem zaman aşımına uğradı." };
    return { ok: false };
  } });
  await za.G.uygula();
  var zaKayit = KR.depo(za.ctx.localStorage).oku("C:/p/deneme.prproj");
  ok("bake zaman aşımı: hak düşmez, neden söylenir, iki özelliğin planlanan zamanları kayıtta (U ile geri alınabilir)", za.harcanan.length === 0 &&
    /Premiere yanıt vermedi; yazılmış olabilecek/.test(za.dom["egri-status"].textContent) && zaKayit.length === 2 && zaKayit[0].times.length === 49 &&
    js(za.G._durum().sonUygulanan.slice().sort()) === js(zaKayit.map(function (r) { return r.id; }).sort()), js([za.harcanan, zaKayit.length, za.dom["egri-status"].textContent]));

  // geri al: host kaydı 'degisti' ile atladı → saklanır, neden söylenir; 'yok' → kayıt temizlenir, uyarı
  var dpG = {};
  KR.depo({ getItem: function (k) { return dpG[k] === undefined ? null : dpG[k]; }, setItem: function (k, v) { dpG[k] = v; }, removeItem: function (k) { delete dpG[k]; } }).ekle("C:/p/deneme.prproj", eskiKayit);
  var gd = { cevap: { ok: true, sonuclar: [], atlanan: [{ id: "kreski1", kod: "degisti" }] } };
  var gg = kur({ depo: dpG, cevap: function (fn) {
    if (fn === "KS_easePeek") return peek(12.5);
    if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5));
    if (fn === "KS_easeUndo") return gd.cevap;
    return { ok: false };
  } });
  gg.ctx._tab.egri();
  await bekle(10);
  await gg.G.geriAlTumu();
  ok("geri al 'degisti': kayıt saklanır, 'dokunulmadı' uyarısı", KR.depo(gg.ctx.localStorage).oku("C:/p/deneme.prproj").length === 1 &&
    /kaydın anahtar kareleri değişmiş .*dokunulmadı, kayıtlar saklandı/.test(gg.dom["egri-status"].textContent) && /warn/.test(gg.dom["egri-status"].className), gg.dom["egri-status"].textContent);
  gd.cevap = { ok: true, sonuclar: [{ id: "kreski1", ok: true, silinen: 0, kod: "yok" }], atlanan: [] };
  await gg.G.geriAlTumu();
  ok("geri al 'yok': Suflo'nun anahtarları zaten gitmiş → kayıt temizlenir, yeşil 'Geri alındı: 0' değil uyarı", KR.depo(gg.ctx.localStorage).oku("C:/p/deneme.prproj").length === 0 &&
    /zaten kaldırılmış; kayıt temizlendi/.test(gg.dom["egri-status"].textContent) && /warn/.test(gg.dom["egri-status"].className), gg.dom["egri-status"].textContent);

  // İngilizce arayüzde kullanıcı önayarının varsayılan adı İngilizce kaydedilir (kart çeviriden muaf)
  var on = kur({ dil: "en", cevap: function () { return { ok: false }; } });
  on.dom["egri-kaydet"].tetikle("click");
  on.dom["egri-kaydet"].tetikle("click");
  var onayarEn = JSON.parse(on.depo["suflo.egri.onayarlar"] || "[]").map(function (o) { return o.ad; });
  ok("İngilizce: kullanıcı önayarı 'My curve 1', 'My curve 2' adıyla", js(onayarEn) === js(["My curve 1", "My curve 2"]), js(onayarEn));
  var onTr = kur({ cevap: function () { return { ok: false }; } });
  onTr.dom["egri-kaydet"].tetikle("click");
  ok("Türkçe: kullanıcı önayarı 'Benim eğrim 1'", JSON.parse(onTr.depo["suflo.egri.onayarlar"])[0].ad === "Benim eğrim 1");
  ok("İngilizce: yeni ret nedenleri ve geri al iletileri çevrilir", I18N.translate(": klip taşınmış; liste yenilendi, yeniden dene") === ": the clip was moved; the list was refreshed, try again" &&
    I18N.translate(" · kısmen yazıldı: ") === " · partly written: " && I18N.translate("Suflo'nun anahtar kareleri zaten kaldırılmış; kayıt temizlendi.") === "Suflo's keyframes were already removed; the record was cleared." &&
    /^Undone: 0 keyframes removed · the keyframes of 1 records changed/.test(I18N.translate("Geri alındı: 0 anahtar kare silindi · 1 kaydın anahtar kareleri değişmiş (klibin hızı ya da uç anahtar kareleri); dokunulmadı, kayıtlar saklandı.")));

  /* ---------- 10) önizleme sahnesi ve düzenleyici ---------- */
  var p10 = kur({ cevap: function (fn) { return fn === "KS_easePeek" ? peek(12.5) : tarama(12.5, ikiProp(12.5)); } });
  p10.durumlar.gizli = true;
  p10.ctx._tab.egri();
  ok("önizleme sahnesi: belge gizliyken requestAnimationFrame başlamaz", p10.raf.length === 0);
  p10.durumlar.gizli = false;
  p10.ctx._tab.egri();
  ok("önizleme sahnesi: görünürken başlar ve kare çizer", p10.raf.length === 1);
  p10.raf[0](100); p10.raf[0](650);
  ok("önizleme sahnesi: kare eğriye göre kayar ve büyür", /%$/.test(p10.dom["egri-kare"].style.left) && /^scale\(/.test(p10.dom["egri-kare"].style.transform), js(p10.dom["egri-kare"].style));
  p10.dom["tab-egri"].classList.remove("active");
  var once10 = p10.raf.length;
  p10.raf[p10.raf.length - 1](900);
  ok("önizleme sahnesi: sekme kapanınca durur (yeni kare istenmez)", p10.raf.length === once10);
  var ed = p10.G._editor();
  var svg = p10.dom["egri-editor"].children[0];
  svg.tetikle("pointerdown", { clientX: 16 + 0.25 * 288, clientY: 0, pointerId: 1, preventDefault: function () {} });
  // ilk tutamaç (0.25, 0.1) ekranda (88, 147,6); onun üstüne bas ve sürükle (x 0,52 → Shift ile 0,5; y 0,11 → 0,1)
  svg.tetikle("pointerdown", { clientX: 88, clientY: 147.6, pointerId: 1, preventDefault: function () {} });
  svg.tetikle("pointermove", { clientX: 16 + 0.52 * 288, clientY: 146.66, shiftKey: true, pointerId: 1 });
  svg.tetikle("pointerup", { pointerId: 1 });
  ok("düzenleyici: tutamaç sürüklenir, Shift 0,05'e yapışır; alanlar ve hayalet güncellenir", p10.dom["egri-css"].value === "cubic-bezier(0.5, 0.1, 0.25, 1)" &&
    ed._d.hayalet && ed._d.hayalet.x1 === 0.25 && p10.G._durum().seciliOnayar === "", p10.dom["egri-css"].value);
  svg.tetikle("dblclick", { clientX: 16 + 0.5 * 288, clientY: 100 });
  ok("düzenleyici: çift tık nokta ekler (bezier → çok noktalı), metin alanı boşalır, sayılar kapanır", ed.egri().type === "multi" && ed.egri().pts.length === 3 &&
    p10.dom["egri-css"].value === "" && p10.dom["egri-p1x"].disabled === true, js(ed.egri().pts.length));
  p10.dom["tab-egri"].classList.add("active");
  p10.G._tus({ key: "Delete", target: { tagName: "DIV" }, preventDefault: function () {} });
  ok("Delete: seçili nokta silinir, eğri yine bezier", ed.egri().type === "bezier" && p10.dom["egri-css"].value !== "", p10.dom["egri-css"].value);

  /* ---------- 10b) Varışta yaylan (3.4 adım 14): ayarlar, önizleme, kapı, değerli tarama, öğeler, kayıt, rozet, geri al ---------- */
  var DEGERLER = { 0: [[0.5, 0.5], [0.8, 0.3]], 1: [0, 100] };
  function degerli(props, arg) {
    var iste = (arg && arg.degerIste) || [];
    return props.map(function (p) {
      var q = JSON.parse(JSON.stringify(p));
      if (iste.some(function (u) { return u.nodeId === p.nodeId && u.compIdx === p.compIdx && u.propIdx === p.propIdx; })) q.degerler = q.degerlerHazir || DEGERLER[p.compIdx];
      delete q.degerlerHazir;
      return q;
    });
  }
  function yaylanBake(arg, ek) {
    return { ok: true, basarili: arg.items.length, yazilan: arg.items.reduce(function (n, it) { return n + it.keys.length; }, 0),
      sonuclar: arg.items.map(function (it, i) { return { i: i, ok: true, interp: ek && ek.yogun ? "yogun" : "bezier" }; }),
      records: arg.items.map(function (it) {
        return { tur: "yaylan", seqId: "s1", nodeId: arg.target.nodeId, clipName: "Röportaj.mp4", clipStart: 10, clipEnd: 20, clipIn: 0, clipOut: 10, matchName: it.matchName,
          compIdx: it.compIdx, propIdx: it.propIdx, uclar: null, times: (ek && ek.yogun ? it.yogunKeys : it.keys).map(function (q) { return q.t; }), kenarDegerleri: [{ t: it.t0, v: it.v0 }] };
      }) };
  }
  var ya = kur({ cevap: function () { throw new Error("çağrılmamalı"); } });
  ok("yaylan: init/render Premiere'e gitmez; kart varsayılanlarla çizilir (0,10 sn · 3 Hz · 6 · Oturma ≈ 0,80 sn), önizleme yolu", ya.cagri.length === 0 &&
    ya.dom["egri-yaylan-genlik-deger"].textContent === "0,10 sn" && ya.dom["egri-yaylan-frekans-deger"].textContent === "3 Hz" && ya.dom["egri-yaylan-sonum-deger"].textContent === "6" &&
    ya.dom["egri-yaylan-sure"].textContent === "Oturma ≈ 0,80 sn" && /^M[\d.]+ [\d.]+ L/.test(ya.dom["egri-yaylan-yol"].getAttribute("d") || "") && !ya.dom["egri-yaylan-tum"].checked &&
    ya.dom["egri-yaylan-uygula"].textContent === "🔒 Varışta yaylan", js([ya.dom["egri-yaylan-sure"].textContent, ya.dom["egri-yaylan-uygula"].textContent]));
  ok("yaylan: init'te ayar deposuna yazılmaz", !Object.prototype.hasOwnProperty.call(ya.depo, "suflo.egri.yaylan"));
  ya.dom["egri-yaylan-genlik"].value = "0.3"; ya.dom["egri-yaylan-genlik"].tetikle("input");
  ya.dom["egri-yaylan-frekans"].value = "4.5"; ya.dom["egri-yaylan-frekans"].tetikle("input");
  ya.dom["egri-yaylan-sonum"].value = "99"; ya.dom["egri-yaylan-sonum"].tetikle("change");
  var yd0 = JSON.parse(ya.depo["suflo.egri.yaylan"] || "null");
  ok("yaylan: kaydırıcılar canlı önizler ve ayarı saklar (sönüm 10'a kırpılır); Premiere'e gidilmez", ya.cagri.length === 0 && yd0 && yd0.genlik === 0.3 && yd0.frekans === 4.5 &&
    yd0.sonum === 10 && ya.dom["egri-yaylan-genlik-deger"].textContent === "0,30 sn" && ya.dom["egri-yaylan-frekans-deger"].textContent === "4,5 Hz" &&
    ya.dom["egri-yaylan-sure"].textContent === "Oturma ≈ 0,48 sn", js([yd0, ya.dom["egri-yaylan-sure"].textContent]));
  var yb = kur({ depo: { "suflo.egri.yaylan": JSON.stringify({ genlik: 0.2, frekans: 2, sonum: 4, tum: true }) }, cevap: function () { throw new Error("çağrılmamalı"); } });
  ok("yaylan: saklanan ayar açılışta okunur (Tüm varışlar dahil); bozuk depo varsayılana döner", yb.G._durum().yaylan.genlik === 0.2 && yb.G._durum().yaylan.tum === true &&
    yb.dom["egri-yaylan-tum"].checked === true && kur({ depo: { "suflo.egri.yaylan": "{bozuk" } }).G._durum().yaylan.genlik === 0.1);
  var y0 = kur({ kurulu: false, cevap: function () { throw new Error("çağrılmamalı"); } });
  await y0.G.yaylanUygula();
  ok("yaylan: kurulmamışken Premiere'e gidilmez; kapı 'curves' + deneme:true + yeniden (Eğri ile ortak 3 hak)", y0.cagri.length === 0 && y0.kapi.length === 1 &&
    y0.kapi[0][0] === "curves" && y0.kapi[0][1].deneme === true && typeof y0.kapi[0][1].yeniden === "function" && y0.harcanan.length === 0);
  ok("kaynakta: yaylanUygula'nın ilk satırı 'curves' kapısı", /async function yaylanUygula\(\) \{\n    if \(typeof Pro !== "undefined" && !Pro\.gate\("curves", \{ deneme: true, yeniden: function \(\) \{ yaylanUygula\(\); \} \}\)\) return;/.test(KAYNAK));
  // uygulama: önbellekteki işaretli satırlar için değerli taze tarama → klip başına KS_easeBake (tur 'yaylan') → hak bir kez
  var yu = kur({ kurulu: true, cevap: function (fn, arg) {
    if (fn === "KS_easePeek") return peek(12.5);
    if (fn === "KS_easeScan") return tarama(12.5, degerli(ikiProp(12.5), arg));
    if (fn === "KS_easeBake") return yaylanBake(arg);
    return { ok: false };
  } });
  yu.ctx._tab.egri();
  await bekle(10);
  var yuOnce = yu.cagri.length;
  await yu.G.yaylanUygula();
  var yuTar = yu.cagri.slice(yuOnce).filter(function (c) { return c.fn === "KS_easeScan"; });
  var yuBake = yu.cagri.filter(function (c) { return c.fn === "KS_easeBake"; });
  ok("yaylan: değerler yalnız işaretli satırlar için istenir (yoklama taramasında istenmez)", yu.cagri.slice(0, yuOnce).every(function (c) { return !c.arg || !c.arg.degerIste; }) &&
    yuTar.length >= 1 && js(yuTar[0].arg.degerIste) === js([{ nodeId: "nA", compIdx: 0, propIdx: 0 }, { nodeId: "nA", compIdx: 1, propIdx: 0 }]), js(yuTar.map(function (c) { return c.arg; })));
  var yo0 = yuBake[0] && yuBake[0].arg.items[0], yo1 = yuBake[0] && yuBake[0].arg.items[1];
  ok("yaylan öğeleri: tur 'yaylan', iniş = çiftin ikinci ucu, sonraki anahtar yok → t1 null, anahtarlar inişten sonra; seyrek + 2 karede bir", yuBake.length === 1 &&
    yo0.tur === "yaylan" && yo0.t0 === 13 && yo0.t1 === null && js(yo0.v0) === js([0.8, 0.3]) && yo0.sinir === 20 && yo0.keys.length >= 3 &&
    yo0.keys.every(function (q) { return q.t > 13 && q.t < 20 && Array.isArray(q.v); }) && yo0.yogunKeys.length > yo0.keys.length && yo0.degistir === false &&
    yo1.t0 === 14 && yo1.v0 === 100 && yo1.keys.every(function (q) { return q.v >= 0 && q.v <= 100; }) && yuBake[0].arg.target.seqId === "s1" && yuBake[0].arg.dogrusal === undefined,
    js(yo0).slice(0, 240));
  ok("yaylan: başarıda hak bir kez düşer ('curves')", js(yu.harcanan) === js(["curves"]));
  var yuSak = KR.depo(yu.ctx.localStorage).oku("C:/p/deneme.prproj");
  ok("yaylan: kayıtlar depoda tur 'yaylan', iniş kenarDegerleri'nde", yuSak.length === 2 && yuSak.every(function (r) { return r.tur === "yaylan" && r.uclar === null && r.kenarDegerleri.length === 1; }),
    js(yuSak.map(function (r) { return [r.tur, r.kenarDegerleri]; })));
  var yuBil = yu.toastlar.filter(function (t) { return t.e && t.e.metin === "Geri al"; })[0];
  ok("yaylan bildirimi: 'Varışta yaylanma uygulandı: 2 varış · N anahtar kare' + Geri al", !!yuBil && /^Varışta yaylanma uygulandı: 2 varış · \d+ anahtar kare$/.test(yuBil.m.textContent) &&
    /good/.test(yu.dom["egri-status"].className), yuBil && yuBil.m.textContent);
  // yeniden uygulama aynı inişte: eski kayıt yerine geçer (depoda yine 2 kayıt)
  await yu.G.yaylanUygula();
  ok("yaylan yeniden uygulama: aynı inişin eski kaydı yerine geçer", KR.depo(yu.ctx.localStorage).oku("C:/p/deneme.prproj").length === 2 && js(yu.harcanan) === js(["curves", "curves"]));
  // Bezier yazılamadıysa (yoğun) bildirim söyler
  var yy = kur({ kurulu: true, cevap: function (fn, arg) {
    if (fn === "KS_easeScan") return tarama(12.5, degerli(ikiProp(12.5), arg));
    if (fn === "KS_easeBake") return yaylanBake(arg, { yogun: true });
    return { ok: false };
  } });
  yy.ctx._tab.egri(); await bekle(10);
  await yy.G.yaylanUygula();
  ok("yaylan: Premiere Bezier yazamadıysa '2 karede bir yazıldı' notu", /Premiere Bezier yazamadı; 2 karede bir yazıldı/.test(yy.dom["egri-status"].textContent), yy.dom["egri-status"].textContent);
  var yyTar = yy.cagri.filter(function (c) { return c.fn === "KS_easeScan"; });
  ok("yaylan: önbellek boşken (yoklama olmadan) ilk taramadan sonra işaretli satırların değerleri ikinci taramayla istenir", yyTar.length >= 2 && !yyTar[0].arg.degerIste &&
    yyTar[1].arg.degerIste && yyTar[1].arg.degerIste.length === 2, js(yyTar.map(function (c) { return c.arg.degerIste || null; })));
  // varış yok: playhead çiftlerin dışında, Tüm varışlar kapalı → bake yok, hak düşmez
  var yn = kur({ kurulu: true, cevap: function (fn, arg) { return fn === "KS_easeScan" ? tarama(10.2, degerli(ikiProp(10.2), arg)) : { ok: false }; } });
  yn.ctx._tab.egri(); await bekle(10);
  await yn.G.yaylanUygula();
  ok("yaylan: varış yoksa bake çağrılmaz, hak düşmez, açıklama", yn.cagri.filter(function (c) { return c.fn === "KS_easeBake"; }).length === 0 && yn.harcanan.length === 0 &&
    /Yaylanacak varış yok/.test(yn.dom["egri-status"].textContent), yn.dom["egri-status"].textContent);
  // Tüm varışlar açılınca playhead dışarıdaki satır da seçilebilir; bekleme anahtarları geçilir
  var bekleyen = prop("nA", "Röportaj.mp4", 1, 0, [11, 12, 15], null, null, null, { degerlerHazir: [0, 100, 100] });
  var yt = kur({ kurulu: true, cevap: function (fn, arg) {
    if (fn === "KS_easePeek") return peek(10.2);
    if (fn === "KS_easeScan") return tarama(10.2, degerli([bekleyen], arg));
    if (fn === "KS_easeBake") return yaylanBake(arg);
    return { ok: false };
  } });
  yt.ctx._tab.egri(); await bekle(10);
  var cbOnce = hepsi(yt.dom["egri-ozellikler"], function (c) { return c.type === "checkbox"; })[0];
  ok("Tüm varışlar kapalıyken playhead dışarıdaki satırın kutusu kapalı", cbOnce && cbOnce.disabled === true && cbOnce.checked === false);
  yt.dom["egri-yaylan-tum"].checked = true; yt.dom["egri-yaylan-tum"].tetikle("change");
  var cbSonra = hepsi(yt.dom["egri-ozellikler"], function (c) { return c.type === "checkbox"; })[0];
  ok("Tüm varışlar açılınca satır seçilebilir ve işaretli (Premiere'e gidilmeden)", cbSonra && cbSonra.disabled === false && cbSonra.checked === true &&
    yt.cagri.filter(function (c) { return c.fn !== "KS_easePeek" && c.fn !== "KS_easeScan"; }).length === 0);
  await yt.G.yaylanUygula();
  var ytBake = yt.cagri.filter(function (c) { return c.fn === "KS_easeBake"; })[0];
  ok("Tüm varışlar: tek iniş (12; 15 bekleme), sonraki anahtara (15) kadar", ytBake && ytBake.arg.items.length === 1 && ytBake.arg.items[0].t0 === 12 && ytBake.arg.items[0].t1 === 15 &&
    ytBake.arg.items[0].keys.every(function (q) { return q.t > 12 && q.t < 15; }), ytBake && js(ytBake.arg.items.map(function (x) { return [x.t0, x.t1]; })));
  // satır rozeti + satırın Geri al'ı (kapısız); geri alırken aynı sekansın Eğri kayıtları da host'a gider (ucu yaylanmada olan kalkar)
  var yKay = { id: "kryay1", tur: "yaylan", seqId: "s1", nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10, matchName: "AE.ADBE Opacity/Opacity", compIdx: 1, propIdx: 0,
    uclar: null, times: [14.08, 14.24, 14.4], kenarDegerleri: [{ t: 14, v: 100 }], createdAt: 5000 };
  var eKay = { id: "kregri9", tur: "egri", seqId: "s1", nodeId: "nA", clipName: "Röportaj.mp4", clipStart: 10, matchName: "AE.ADBE Opacity/Opacity", compIdx: 1, propIdx: 0,
    uclar: [14.08, 14.24], times: [14.12, 14.16, 14.2], createdAt: 6000 };
  var dpY = {};
  KR.depo({ getItem: function (k) { return dpY[k] === undefined ? null : dpY[k]; }, setItem: function (k, v) { dpY[k] = v; }, removeItem: function (k) { delete dpY[k]; } }).ekle("C:/p/deneme.prproj", [yKay, eKay]);
  var opakY = prop("nA", "Röportaj.mp4", 1, 0, [12, 14, 14.08, 14.12, 14.16, 14.2, 14.24, 14.4], { t0: 14.08, t1: 14.24, i0: 2, i1: 6, ic: 3, kayitli: true }, 100, 100);
  var yr = kur({ kurulu: false, depo: dpY, cevap: function (fn, arg) {
    if (fn === "KS_easePeek") return peek(14.1);
    if (fn === "KS_easeScan") return tarama(14.1, [opakY]);
    if (fn === "KS_easeUndo") return { ok: true, sonuclar: arg.records.map(function (r) { return { id: r.id, ok: true, silinen: r.times.length }; }), atlanan: [], egriBiten: ["kregri9"] };
    return { ok: false };
  } });
  yr.ctx._tab.egri(); await bekle(10);
  var satirY = hepsi(yr.dom["egri-ozellikler"], function (c) { return /egri-satir( |$)/.test(c.className); })[0];
  var gyDugme = satirY && hepsi(satirY, function (c) { return /egri-yaylan-geri/.test(c.className); })[0];
  ok("satır: canlı yaylanmanın penceresinde 'Suflo yaylanması' rozeti + Geri al", !!gyDugme && hepsi(satirY, function (c) { return c.className === "egri-rozet yaylan"; })[0].textContent === "Suflo yaylanması",
    satirY && satirY.textContent);
  gyDugme.tetikle("click");
  await bekle(20);
  var yrGeri = yr.cagri.filter(function (c) { return c.fn === "KS_easeUndo"; })[0];
  ok("yaylan Geri al: kapısız; kayıt + aynı sekansın Eğri kayıtları (egriler) host'a; biten Eğri de depodan düşer, durum satırı söyler", yrGeri && yr.kapi.length === 0 &&
    yrGeri.arg.records.length === 1 && yrGeri.arg.records[0].id === "kryay1" && yrGeri.arg.egriler.length === 1 && yrGeri.arg.egriler[0].id === "kregri9" &&
    KR.depo(yr.ctx.localStorage).oku("C:/p/deneme.prproj").length === 0 &&
    yr.dom["egri-status"].textContent === "Geri alındı: 3 anahtar kare silindi. · Uçları bu anahtar karelerde olan 1 Suflo eğrisi de kaldırıldı.", js([yrGeri && yrGeri.arg, yr.dom["egri-status"].textContent]));
  // İngilizce: kart ve bildirim metinleri çevrilir
  var I18Nyy = require(path.join(KOK, "js", "i18n.js"));
  I18Nyy.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("İngilizce: Varışta yaylan kartı ve göstergeler", I18Nyy.translate("Varışta yaylan") === "Follow-through" && I18Nyy.translate("Tüm varışlar") === "Every landing" &&
    I18Nyy.translate("0,30 sn") === "0.30 s" && I18Nyy.translate("4,5 Hz") === "4.5 Hz" && I18Nyy.translate("Oturma ≈ 0,48 sn") === "Settles in ≈ 0.48 s" &&
    I18Nyy.translate("Varışta yaylanma uygulandı: 2 varış · 17 anahtar kare") === "Follow-through applied: 2 landings · 17 keyframes" &&
    I18Nyy.translate("🔒 Varışta yaylan") === "🔒 Follow-through" && I18Nyy.translate(": sonraki anahtar kareye ya da klibin sonuna 2 kareden az yer var") ===
    ": there's less than 2 frames of room before the next keyframe or the clip end");

  /* ---------- 11) bağlantılar ---------- */
  var HTML = oku("index.html"), APP = oku("js/app.js");
  ok("Eğri tanıtım kartı 'curves' ve Pro'da gizli; app.js başlatır ve yan menüyü kilitler", /data-pro-feature="curves">Eğriyi aç — 749 TL</.test(HTML) && /"egri-tanitim"/.test(APP) &&
    /KEgri\.init\(\)/.test(APP) && /Pro\.markLocked\(document\.querySelector\('\.ky-oge\[data-tab="egri"\]'\), !s\.pro\)/.test(APP));
  var DM = require(path.join(KOK, "js", "deneme.js"));
  ok("deneme.js: curves 3 haklı, adı, tanıtım ipucu Uygula düğmesine", DM.listede("curves") && DM.kalan(DM.bos(), "curves") === 3 && DM.AD.curves === "Eğri (yumuşatma ve varışta yaylanma)" &&
    DM.tanitimIpucu("curves").hedef === "egri-uygula" && DM.tanitimIpucu("curves").eylem === "Uygula");
  ok("pro.js: curves etiketi", /curves:\s+'Eğri: kendi anahtar karelerine özel yumuşatma ve varışta yaylanma'/.test(oku("js/pro.js")));
  ok("Bezier tutamacı iddiası yok: arayüz 'tutamaç yazamaz, sık anahtar kare' der", /Bezier tutamaçlarını yazamadığı için Suflo eğriyi her kareye/.test(HTML));
  ok("temiz oda: lisanssız kaynağın adı / sözdizimi yok", ["js/egri.js", "js/egri-model.js", "index.html", "css/style.css"].every(function (f) { return !new RegExp("open" + "curve", "i").test(oku(f)); }));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL beklenmeyen hata: " + (e && e.stack || e)); process.exit(1); });
