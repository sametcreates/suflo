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
/*
 * Gerçek yapıştırma (Chromium / CEF 74, TextFieldInputType): öğe index.html'deki etiketine göre. Tek satırlık
 * <input type="text">: sondaki satır sonları atılır, kalanlar boşluğa döner, maxlength'te kesilir. <textarea>: satır
 * sonları kalır (maxlength varsa kesilir). Sahte DOM .value'yu olduğu gibi tuttuğundan paylaşım testleri bununla yapıştırır.
 */
var PANEL_HTML = oku("index.html");
function yapistirSim(x, id, metin) {
  var m = new RegExp('<(input|textarea)\\b[^>]*\\bid="' + id + '"[^>]*>').exec(PANEL_HTML);
  if (!m) throw new Error(id + " index.html'de yok");
  var ml = /\bmaxlength="(\d+)"/.exec(m[0]), t = String(metin);
  if (m[1] === "input") t = t.replace(/[\r\n]+$/, "").replace(/\r\n|\r|\n/g, " ");
  if (ml) t = t.slice(0, Number(ml[1]));
  x.dom[id].value = t;
  return t;
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
  "egri-yaylan-frekans", "egri-yaylan-frekans-deger", "egri-yaylan-sonum", "egri-yaylan-sonum-deger", "egri-yaylan-tum", "egri-yaylan-sure", "egri-yaylan-uygula",
  // Paylaşım ve önayar düzeni (3.4 adım 15)
  "egri-onayar-duzen", "egri-onayar-ad", "egri-onayar-adlandir", "egri-onayar-sola", "egri-onayar-saga", "egri-paylas", "egri-kod", "egri-kod-yukle",
  "egri-kod-kopyala", "egri-ice-aktar", "egri-disa-aktar"];

/*
 * o: { cevap(fn, arg, n) → yanıt, pro, kurulu (deneme kurulu), hostMesgul, odak, gizli, aktif (sekme), depo (localStorage içeriği), dil }
 */
function kur(o) {
  o = o || {};
  var dom = {}, cagri = [], kapi = [], harcanan = [], toastlar = [], ilgi = [], raf = [];
  IDLER.forEach(function (id) { dom[id] = eleman(/^egri-(css|p[12][xy]|onayar-ad)$/.test(id) ? "input" : id === "egri-kod" ? "textarea" : id === "egri-yogunluk" ? "select" : "div", id); });
  dom["egri-onayar-duzen"].hidden = true;
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
      hostMesgul: function () { return durumlar.hostMesgul; },
      fs: o.kfs, path: require("path"), os: { homedir: function () { return "/ev"; } }
    },
    KApp: { toast: function (m, t, s, e) { toastlar.push({ m: m, t: t, e: e }); }, onTab: function (ad, fn) { ctx._tab[ad] = fn; }, onContext: function () {}, onPoll: function () {} },
    _tab: {},
    // 3.4 adım 15: CEP dosya pencereleri (o.cepFs), Node fs (o.kfs), pano (o.pano: { metin } ya da false)
    cep: o.cepFs ? { fs: o.cepFs } : undefined,
    navigator: o.pano ? { clipboard: { writeText: function (s) { o.pano.metin = s; return o.pano.hata ? Promise.reject(new Error("izin")) : Promise.resolve(); } } } : undefined,
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
    I18N.translate("Geri alındı: 0 anahtar kare silindi") === "Undone: 0 keyframes removed" &&
    /^the keyframes of 1 records changed/.test(I18N.translate("1 kaydın anahtar kareleri değişmiş (klibin hızı ya da uç anahtar kareleri); dokunulmadı, kayıtlar saklandı.")));
  // inceleme r2: karışık nedenler ilk kaydın nedeniyle anlatılmaz; her neden kendi sayısıyla. 'kismi' (Suflo anahtarlarının bir kısmı
  // silinmiş) ve 'kilitli' kayıtları saklanır
  KR.depo(gg.ctx.localStorage).ekle("C:/p/deneme.prproj", [eskiKayit, Object.assign({}, eskiKayit, { id: "kreski2" }), Object.assign({}, eskiKayit, { id: "kreski3" }),
    Object.assign({}, eskiKayit, { id: "kreski4" })]);
  gd.cevap = { ok: true, sonuclar: [], atlanan: [{ id: "kreski1", kod: "klipYok" }, { id: "kreski2", kod: "degisti" }, { id: "kreski3", kod: "kismi", kalan: 24 },
    { id: "kreski4", kod: "kilitli" }] };
  await gg.G.geriAlTumu();
  var karisik = gg.dom["egri-status"].textContent;
  ok("geri al, karışık nedenler: her neden kendi sayısıyla (1 değişmiş, 1 kısmen silinmiş, 1 kilitli, 1 bulunamadı); kayıtlar saklanır",
    /Geri alındı: 0 anahtar kare silindi · 1 kaydın anahtar kareleri değişmiş .* · 1 kaydın Suflo anahtar karelerinin bir kısmı silinmiş; kalanlara dokunulmadı.* · 1 kaydın katmanı kilitli; .* · 1 kaydın klibi ya da özelliği bulunamadı; kayıtlar saklandı\.$/.test(karisik) &&
    !/4 kayd/.test(karisik) && KR.depo(gg.ctx.localStorage).oku("C:/p/deneme.prproj").length === 4, karisik);
  ok("İngilizce: geri al neden cümleleri çevrilir", I18N.translate("1 kaydın Suflo anahtar karelerinin bir kısmı silinmiş; kalanlara dokunulmadı, kayıtlar saklandı (kalanları Effect Controls'ten silebilirsin).") ===
    "some of the Suflo keyframes of 1 records were deleted; the rest were left untouched and the records were kept (you can delete the rest in Effect Controls)." &&
    I18N.translate("2 kaydın katmanı kilitli; dokunulmadı, kayıtlar saklandı. Kilidi açıp yeniden dene.") === "the track of 2 records is locked; nothing was touched and the records were kept. Unlock it and try again." &&
    I18N.translate("3 kayıt başka bir sekansta; kayıtlar saklandı, o sekansı açıp yeniden dene.") === "3 records are in another sequence; they were kept, open that sequence and try again." &&
    I18N.translate("1 kaydın klibi ya da özelliği bulunamadı; kayıtlar saklandı.") === "the clip or property of 1 records wasn't found; the records were kept." &&
    I18N.translate(": " + require(path.join(KOK, "js", "egri-model.js")).nedenMetni("kilitli")) === ": the track is locked; unlock it and try again");

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
  var DEGERLER = { 0: [[0.5, 0.5], [0.8, 0.3]], 1: [0, 80] };   // 3.4 adım 14 inceleme: 100'e inen opaklık aşım yazmaz ('sinir'), 80'e iniş yazılır
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
  // 3.4 adım 14 inceleme: kartın kaydırıcısında / Tüm varışlar kutusunda Enter Eğri'yi değil yaylanmayı uygular
  var yEnter = kur({ kurulu: false, cevap: function () { throw new Error("çağrılmamalı"); } });
  yEnter.ctx._tab.egri();
  var kartHedef = function (tip) { return { tagName: "INPUT", type: tip, closest: function (s) { return s === "#egri-yaylan" ? yEnter.dom["egri-yaylan"] : null; } }; };
  var engelE = 0;
  yEnter.G._tus({ key: "Enter", target: kartHedef("range"), preventDefault: function () { engelE++; } });
  yEnter.G._tus({ key: "Enter", target: kartHedef("checkbox"), preventDefault: function () { engelE++; } });
  await bekle(5);
  ok("kısayol Enter Varışta yaylan kartında: yaylanmanın kapısı (yeniden: yaylanUygula), Eğri uygulanmaz, Premiere'e gidilmez",
    yEnter.kapi.length === 2 && yEnter.kapi.every(function (k) { return k[0] === "curves" && /yaylanUygula\(\)/.test(String(k[1].yeniden)); }) && engelE === 2 &&
    yEnter.cagri.filter(function (c) { return c.fn === "KS_easeBake"; }).length === 0, js(yEnter.kapi.map(function (k) { return String(k[1].yeniden); })));
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
    yo1.t0 === 14 && yo1.v0 === 80 && yo1.keys.every(function (q) { return q.v >= 0 && q.v <= 100; }) && yuBake[0].arg.target.seqId === "s1" && yuBake[0].arg.dogrusal === undefined,
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
  var bekleyen = prop("nA", "Röportaj.mp4", 1, 0, [11, 12, 15], null, null, null, { degerlerHazir: [0, 80, 80] });
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
  // 3.4 adım 14 inceleme: 40'tan çok iniş aynı klibin birkaç KS_easeBake çağrısına bölünür (host 40'tan çok öğeyi reddeder);
  // Bulanıklık gibi desteklenmeyen özellik Tüm varışlarda da seçilmez
  var cokKeys = [], cokVals = [];
  for (var ci2 = 0; ci2 < 46; ci2++) { cokKeys.push(Math.round((10.2 + ci2 * 0.2) * 1e4) / 1e4); cokVals.push(ci2 % 2 ? 120 : 100); }
  var olcCok = prop("nA", "Röportaj.mp4", 0, 1, cokKeys, null, null, null, { matchName: "AE.ADBE Motion/Scale", label: "Ölçek", tur: "sayi", degerlerHazir: cokVals });
  var bulan = prop("nA", "Röportaj.mp4", 2, 0, [11, 12], null, null, null, { matchName: "AE.ADBE Gaussian Blur 2/Blurriness", label: "Gaussian Blur › Blurriness",
    labelTablo: false, opak: false, tur: "sayi", degerlerHazir: [50, 0] });
  var yc = kur({ kurulu: true, depo: { "suflo.egri.yaylan": JSON.stringify({ tum: true, sonum: 10 }) }, cevap: function (fn, arg) {
    if (fn === "KS_easePeek") return peek(10.1);
    if (fn === "KS_easeScan") return tarama(10.1, degerli([olcCok, bulan], arg));
    if (fn === "KS_easeBake") return arg.items.length > 40 ? { ok: false, kod: "gecersiz", error: "Gecersiz egri plani." } : yaylanBake(arg);
    return { ok: false };
  } });
  yc.ctx._tab.egri(); await bekle(10);
  var ycKutular = hepsi(yc.dom["egri-ozellikler"], function (c) { return c.type === "checkbox"; });
  await yc.G.yaylanUygula();
  var ycBake = yc.cagri.filter(function (c) { return c.fn === "KS_easeBake"; });
  var ycTar = yc.cagri.filter(function (c) { return c.fn === "KS_easeScan" && c.arg && c.arg.degerIste; });
  var ycBil = yc.toastlar.filter(function (t) { return t.e && t.e.metin === "Geri al"; })[0];
  ok("Tüm varışlar: 45 iniş iki çağrıda (40 + 5), hepsi yazılır, hak bir kez; Bulanıklık satırı seçilemez ve değeri istenmez",
    ycBake.length === 2 && ycBake[0].arg.items.length === 40 && ycBake[1].arg.items.length === 5 && js(yc.harcanan) === js(["curves"]) &&
    !!ycBil && /^Varışta yaylanma uygulandı: 45 varış · \d+ anahtar kare$/.test(ycBil.m.textContent) && ycKutular.length === 2 && ycKutular[1].disabled === true &&
    ycTar.length >= 1 && ycTar.every(function (c) { return js(c.arg.degerIste) === js([{ nodeId: "nA", compIdx: 0, propIdx: 1 }]); }),
    js([ycBake.map(function (c) { return c.arg.items.length; }), ycBil && ycBil.m.textContent, ycKutular.map(function (c) { return c.disabled; })]));
  // İnceleme 3 (bulgu): Geri al kayıtları proje başına 300 (Eğri ile ortak). Projede 290 eski Eğri kaydı varken Tüm varışlar 45 kayıt
  // yazacaksa önce sorulur; hayır → Premiere'e yazılmaz, hak düşmez, eski kayıtlar yerinde. Evet → yazılır, atılan eski kayıtlar söylenir
  function doluDepo(n, ek) {
    var dp = {}, depoD = KR.depo({ getItem: function (k) { return dp[k] === undefined ? null : dp[k]; }, setItem: function (k, v) { dp[k] = v; }, removeItem: function (k) { delete dp[k]; } },
      { simdi: function () { return 1000; } });
    var eskiler = [];
    for (var e1 = 0; e1 < n; e1++) {
      eskiler.push({ id: "kreski" + e1, tur: "egri", seqId: "s1", nodeId: "nZ", clipName: "Başka.mp4", clipStart: 0, matchName: "AE.ADBE Opacity/Opacity", compIdx: 1, propIdx: 0,
        uclar: [e1, e1 + 0.5], times: [e1 + 0.2], createdAt: 1000 + e1 });
    }
    depoD.ekle("C:/p/deneme.prproj", eskiler);
    for (var k1 in ek || {}) dp[k1] = ek[k1];
    return dp;
  }
  function egriSayisi(G) { return KR.depo(G.ctx.localStorage).oku("C:/p/deneme.prproj").filter(function (r) { return r.tur === "egri"; }).length; }
  function yerKur(cevapEvet, tum, props, n) {
    var sorular = [];
    var k2 = kur({ kurulu: true, depo: doluDepo(n || 290, { "suflo.egri.yaylan": JSON.stringify({ tum: tum, sonum: 10 }) }), cevap: function (fn, arg) {
      if (fn === "KS_easePeek") return peek(tum ? 10.1 : 12.5);
      if (fn === "KS_easeScan") return tarama(tum ? 10.1 : 12.5, degerli(props, arg));
      if (fn === "KS_easeBake") return yaylanBake(arg);
      return { ok: false };
    } });
    k2.ctx.confirm = function (s) { sorular.push(s); return cevapEvet; };
    k2.sorular = sorular;
    return k2;
  }
  var yh = yerKur(false, true, [olcCok]);
  yh.ctx._tab.egri(); await bekle(10);
  await yh.G.yaylanUygula();
  ok("Tüm varışlar, Geri al kayıtlarına yer yok (290 + 45 > 300): önce sorulur; hayır → KS_easeBake yok, hak düşmez, eski kayıtlar yerinde, durum söyler",
    yh.sorular.length === 1 && /^Bu uygulama 45 yaylanma kaydı yazacak; projede Geri al için 10 kayıtlık yer kaldı \(Eğri ve yaylanma kayıtları proje başına en çok 300\)\. Sürdürürsen en eski 35 /.test(yh.sorular[0]) &&
    yh.cagri.filter(function (c) { return c.fn === "KS_easeBake"; }).length === 0 && yh.harcanan.length === 0 && egriSayisi(yh) === 290 &&
    /^Hiçbir şey yazılmadı: Geri al kayıtlarına yer yok/.test(yh.dom["egri-status"].textContent) && /warn/.test(yh.dom["egri-status"].className),
    js([yh.sorular, yh.dom["egri-status"].textContent]));
  var ye = yerKur(true, true, [olcCok]);
  ye.ctx._tab.egri(); await bekle(10);
  await ye.G.yaylanUygula();
  var yeSak = KR.depo(ye.ctx.localStorage).oku("C:/p/deneme.prproj");
  var yeUyari = ye.toastlar.filter(function (t) { return typeof t.m === "string" && /^Yer açmak için en eski/.test(t.m); })[0];
  ok("Tüm varışlar, evet: 45 varış yazılır, hak bir kez; en eski 35 kayıt atılır ve bildirimle söylenir (sessiz değil)",
    ye.sorular.length === 1 && ye.cagri.filter(function (c) { return c.fn === "KS_easeBake"; }).length === 2 && js(ye.harcanan) === js(["curves"]) &&
    yeSak.length === 300 && yeSak.filter(function (r) { return r.tur === "yaylan"; }).length === 45 && egriSayisi(ye) === 255 && !!yeUyari && yeUyari.t === "warn" &&
    yeUyari.m === "Yer açmak için en eski 35 Suflo Geri al kaydı silindi; o anahtar kareler Premiere'de kalır ama Suflo onları artık geri alamaz.",
    js([ye.sorular.length, yeSak.length, ye.toastlar.map(function (t) { return typeof t.m === "string" ? t.m : t.m.textContent; })]));
  // tek varış (Eğri gibi en çok 40 kayıt): sorulmaz; yer yoksa en eskiler atılır ve bildirim söyler
  var ys = yerKur(false, false, ikiProp(12.5), 299), ys2 = yerKur(false, false, ikiProp(12.5));
  ys.ctx._tab.egri(); ys2.ctx._tab.egri(); await bekle(10);
  await ys.G.yaylanUygula();
  await ys2.G.yaylanUygula();
  ok("tek varış (Eğri gibi en çok 40 kayıt): sorulmaz, yazılır; 299 + 2 kayıtta en eski 1 kayıt atılır ve bildirim söyler; 290 + 2 sığar, uyarı yok",
    ys.sorular.length === 0 && ys.cagri.filter(function (c) { return c.fn === "KS_easeBake"; }).length === 1 && egriSayisi(ys) === 298 &&
    ys.toastlar.some(function (t) { return t.m === "Yer açmak için en eski 1 Suflo Geri al kaydı silindi; o anahtar kareler Premiere'de kalır ama Suflo onları artık geri alamaz."; }) &&
    ys2.sorular.length === 0 && egriSayisi(ys2) === 290 && !ys2.toastlar.some(function (t) { return typeof t.m === "string" && /^Yer açmak/.test(t.m); }),
    js(ys.toastlar.map(function (t) { return typeof t.m === "string" ? t.m : ""; })));
  var I18Nyer = require(path.join(KOK, "js", "i18n.js"));
  I18Nyer.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("İngilizce: yer sorusu, yazılmadı ve atılan kayıt bildirimi", /^This will write 45 follow-through records, but the project only has room for 10 more undo records \(curves and follow-through keep at most 300 per project\)\. If you go on, the 35 oldest/.test(I18Nyer.translate(yh.sorular[0])) &&
    /^Nothing was written: there's no room for the undo records\./.test(I18Nyer.translate(yh.dom["egri-status"].textContent)) &&
    I18Nyer.translate(yeUyari ? yeUyari.m : "") === "To make room, the 35 oldest Suflo undo records were deleted; those keyframes stay in Premiere, but Suflo can no longer undo them." &&
    I18Nyer.translate(": " + "400'den çok anahtar kare var; Tüm varışlar'ı kapatıp varışlara tek tek uygula") === ": there are more than 400 keyframes; turn off Every landing and apply to the landings one at a time",
    js([I18Nyer.translate(yh.sorular[0] || ""), I18Nyer.translate(yeUyari ? yeUyari.m : "")]));
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
  // Sonraki çift: canlı yaylanmanın ara anahtarları tek tek gezilmez (iniş 14 → son yaylanma anahtarı 14,4)
  var dpS2 = {};
  KR.depo({ getItem: function (k) { return dpS2[k] === undefined ? null : dpS2[k]; }, setItem: function (k, v) { dpS2[k] = v; }, removeItem: function (k) { delete dpS2[k]; } }).ekle("C:/p/deneme.prproj", [yKay]);
  var ysc = kur({ depo: dpS2, cevap: function (fn) {
    if (fn === "KS_easePeek") return peek(14.02);
    if (fn === "KS_easeScan") return tarama(14.02, [prop("nA", "Röportaj.mp4", 1, 0, [12, 14, 14.08, 14.24, 14.4, 16], { t0: 14, t1: 14.08, i0: 1, i1: 2, ic: 0, kayitli: false }, 100, 100)]);
    if (fn === "KS_setPlayerPosition") return { ok: true };
    return { ok: false };
  } });
  ysc.ctx._tab.egri(); await bekle(10);
  ysc.dom["egri-sonraki"].tetikle("click");
  await bekle(20);
  var ygit = ysc.cagri.filter(function (c) { return c.fn === "KS_setPlayerPosition"; }).map(function (c) { return c.arg.sec; });
  ok("Sonraki çift: yaylanmanın ara anahtarları atlanır (14,02 → 14,4 + 0,25 kare)", js(ygit) === js([14.41]), js(ygit));
  // İngilizce: kart ve bildirim metinleri çevrilir
  var I18Nyy = require(path.join(KOK, "js", "i18n.js"));
  I18Nyy.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("İngilizce: Varışta yaylan kartı ve göstergeler", I18Nyy.translate("Varışta yaylan") === "Follow-through" && I18Nyy.translate("Tüm varışlar") === "Every landing" &&
    I18Nyy.translate("0,30 sn") === "0.30 s" && I18Nyy.translate("4,5 Hz") === "4.5 Hz" && I18Nyy.translate("Oturma ≈ 0,48 sn") === "Settles in ≈ 0.48 s" &&
    I18Nyy.translate("Varışta yaylanma uygulandı: 2 varış · 17 anahtar kare") === "Follow-through applied: 2 landings · 17 keyframes" &&
    I18Nyy.translate("🔒 Varışta yaylan") === "🔒 Follow-through" && I18Nyy.translate(": sonraki anahtar kareye ya da klibin sonuna 2 kareden az yer var") ===
    ": there's less than 2 frames of room before the next keyframe or the clip end");

  /* ---------- 12) paylaşım ve önayar düzeni (3.4 adım 15): ücretsiz, Premiere'e gitmez, kapı yok ---------- */
  var Ep = require(path.join(KOK, "js", "ease-curve.js"));
  var cokN = Ep.builtin("cift-yumusak").curve;
  var hizKodu = Ep.paylasimKodla({ tur: "hiz", ad: "Dalış", keys: [[0, 100], [0.5, 30], [1, 100]], hit: 0.5 });
  var pano = { metin: "" };
  var p12 = kur({ pano: pano, cevap: function () { throw new Error("çağrılmamalı"); } });
  ok("paylaşım: init'te önayar satırı gizli (hazır eğri seçili), kod kutusu boş", p12.dom["egri-onayar-duzen"].hidden === true && p12.dom["egri-kod"].value === "");
  // tek kod (adıyla) → düzenleyici; Önayar olarak kaydet kodun adını kullanır
  var kodAdli = Ep.paylasimKodla({ ad: "Arkadaşımın eğrisi", curve: cokN });
  p12.dom["egri-kod"].value = "https://suflo.app/egri#" + kodAdli;
  p12.dom["egri-kod-yukle"].tetikle("click");
  ok("Kod yapıştır: bağlantıdaki tek eğri düzenleyiciye gelir, kutu boşalır, durum adıyla", js(p12.G._durum().egri) === js(Ep.normalize(cokN)) && p12.dom["egri-kod"].value === "" &&
    p12.dom["egri-status"].textContent === "Yüklendi: Arkadaşımın eğrisi. Saklamak için Önayar olarak kaydet." && p12.G._durum().seciliOnayar === "", p12.dom["egri-status"].textContent);
  p12.dom["egri-kaydet"].tetikle("click");
  var on12 = JSON.parse(p12.depo["suflo.egri.onayarlar"]);
  ok("Önayar olarak kaydet: koddan yüklenen eğri kodun adıyla saklanır; önayar satırı adla görünür", on12.length === 1 && on12[0].ad === "Arkadaşımın eğrisi" &&
    p12.dom["egri-onayar-duzen"].hidden === false && p12.dom["egri-onayar-ad"].value === "Arkadaşımın eğrisi", js(on12));
  // Kodu kopyala: seçili kendi önayarının adıyla kod + bağlantı
  p12.dom["egri-kod-kopyala"].tetikle("click");
  await bekle(5);
  var kopyalanan = pano.metin.split("\n");
  ok("Kodu kopyala: SFC1 kodu + suflo.app/egri bağlantısı panoya, önayarın adı kodda; bildirim", kopyalanan.length === 2 && Ep.paylasimCoz(kopyalanan[0]).ad === "Arkadaşımın eğrisi" &&
    kopyalanan[1] === "https://suflo.app/egri#" + kopyalanan[0] && p12.toastlar.some(function (t) { return t.m === "Eğri kodu ve suflo.app/egri bağlantısı kopyalandı"; }), pano.metin);
  // cubic-bezier (CSS bildirimi, y kırpılır)
  p12.dom["egri-kod"].value = "transition: transform .4s cubic-bezier(0.6, -1.8, 0.3, 1.2);";
  p12.dom["egri-kod-yukle"].tetikle("click");
  ok("Kod yapıştır: CSS bildirimindeki cubic-bezier yüklenir, y -1'e kırpılır (uyarı)", p12.dom["egri-css"].value === "cubic-bezier(0.6, -1, 0.3, 1.2)" &&
    p12.dom["egri-status"].className.indexOf("warn") !== -1, p12.dom["egri-css"].value);
  // satır satır birkaç kod → önayarlara; ikinci kez yineleme
  var cokKod = [Ep.paylasimKodla({ ad: "Bir", curve: { type: "bezier", x1: 0.1, y1: 0, x2: 0.2, y2: 1 } }), Ep.paylasimKodla({ ad: "İki", curve: { type: "spring", response: 0.4, bounce: 0.3 } })].join("\n");
  p12.dom["egri-kod"].value = cokKod;
  p12.dom["egri-kod-yukle"].tetikle("click");
  var on12b = JSON.parse(p12.depo["suflo.egri.onayarlar"]).map(function (o) { return o.ad; });
  ok("Kod yapıştır: birden çok kod önayarlara eklenir (özet)", js(on12b) === js(["Arkadaşımın eğrisi", "Bir", "İki"]) && p12.dom["egri-status"].textContent === "Eğri önayarlarına eklendi: 2" &&
    p12.dom["egri-onayarlar"].children.length === 18, p12.dom["egri-status"].textContent);
  p12.dom["egri-kod"].value = cokKod;
  p12.dom["egri-kod-yukle"].tetikle("click");
  ok("Kod yapıştır: aynı kodlar ikinci kez eklenmez (yineleme, uyarı)", JSON.parse(p12.depo["suflo.egri.onayarlar"]).length === 3 &&
    p12.dom["egri-status"].textContent === "Yeni önayar eklenmedi · 2 yineleme atlandı" && p12.dom["egri-status"].className.indexOf("warn") !== -1, p12.dom["egri-status"].textContent);
  p12.dom["egri-kod"].value = hizKodu;
  p12.dom["egri-kod-yukle"].tetikle("click");
  ok("Kod yapıştır: Hız Rampası kodu Hız Rampası'na gider (o sekme yoksa saklanamadı uyarısı)", p12.dom["egri-status"].textContent === "Yeni önayar eklenmedi · 1 önayar saklanamadı", p12.dom["egri-status"].textContent);
  p12.dom["egri-kod"].value = "merhaba dünya";
  p12.dom["egri-kod-yukle"].tetikle("click");
  ok("Kod yapıştır: tanınmayan metin nedeniyle uyarı; JSON gibi başlayan bozuk dosya metni ayrı uyarı", p12.dom["egri-status"].textContent === "Tanınmadı: SFC1 kodu, suflo.app/egri bağlantısı ya da cubic-bezier(…) yapıştır." &&
    (p12.dom["egri-kod"].value = '{"a":1}', p12.dom["egri-kod-yukle"].tetikle("click"), p12.dom["egri-status"].textContent === "Tanınmayan dosya: .suflo-egri dosyası ya da bir eğri aracının JSON dışa aktarmasını seç."),
    p12.dom["egri-status"].textContent);
  // Enter ile yükle
  var engel12 = 0;
  p12.dom["egri-kod"].value = "ease-in";
  p12.dom["egri-kod"].tetikle("keydown", { key: "Enter", target: p12.dom["egri-kod"], preventDefault: function () { engel12++; } });
  ok("Kod kutusunda Enter yükler (önayar kısayolu değil)", p12.dom["egri-css"].value === "cubic-bezier(0.42, 0, 1, 1)" && engel12 === 1);
  // cubic-bezier alanı da kod / bağlantı / CSS kabul eder
  p12.dom["egri-css"].value = kodAdli;
  p12.dom["egri-css"].tetikle("change");
  ok("cubic-bezier alanı: SFC1 kodu yapıştırılınca eğri yüklenir", js(p12.G._durum().egri) === js(Ep.normalize(cokN)) && /^Yüklendi: Arkadaşımın eğrisi/.test(p12.dom["egri-status"].textContent));
  p12.dom["egri-css"].value = "ease-out";
  p12.dom["egri-css"].tetikle("change");
  ok("cubic-bezier alanı: CSS anahtar sözcüğü; Hız Rampası kodu yönlendirilir", p12.dom["egri-css"].value === "cubic-bezier(0, 0, 0.58, 1)" &&
    (p12.dom["egri-css"].value = hizKodu, p12.dom["egri-css"].tetikle("change"), /Hız Rampası kodu/.test(p12.dom["egri-status"].textContent)));
  // 3.4 adım 15 incelemesi: yapıştırma gerçek kutudaki gibi (yapistirSim). Kod kutusu çok satırlı: alt alta kodlar ve
  // Kodu kopyala çıktıları (kod + bağlantı) satır sonlarıyla gelir, hiçbiri düşmez; büyük dosya metni kesilmez
  ok("kod kutusu index.html'de çok satırlı <textarea> (satır sonu korunur), 64 KB'tan kısa maxlength yok",
    /<textarea id="egri-kod"[^>]*>/.test(PANEL_HTML) && !/<textarea id="egri-kod"[^>]*maxlength/.test(PANEL_HTML) && /<textarea id="hiz-ozel-kod"[^>]*>/.test(PANEL_HTML) &&
    !/<textarea id="hiz-ozel-kod"[^>]*maxlength/.test(PANEL_HTML));
  var p12c = kur({ cevap: function () { throw new Error("çağrılmamalı"); } });
  var kopyaCikti = function (k) { return k + "\n" + Ep.egriAdresi(k); };
  var uc12 = ["Bir", "İki", "Üç"].map(function (ad, q) { return kopyaCikti(Ep.paylasimKodla({ ad: ad, curve: { type: "bezier", x1: 0.1 + q / 10, y1: 0, x2: 0.6, y2: 1 } })); }).join("\n");
  yapistirSim(p12c, "egri-kod", uc12);
  p12c.dom["egri-kod-yukle"].tetikle("click");
  ok("Kod yapıştır (gerçek kutu): üç 'Kodu kopyala' çıktısı üç önayar olur (yalnız sonuncusu değil)", js(JSON.parse(p12c.depo["suflo.egri.onayarlar"] || "[]").map(function (o) { return o.ad; })) ===
    js(["Bir", "İki", "Üç"]) && p12c.dom["egri-status"].textContent === "Eğri önayarlarına eklendi: 3", p12c.dom["egri-status"].textContent);
  var onCok = [];
  for (var q12 = 0; q12 < 12; q12++) onCok.push({ ad: "Önayar " + q12, curve: { type: "multi", pts: [{ x: 0, y: 0, ox: 0.123456, oy: 0.012345 }, { x: 0.333333, y: 0.712345 - q12 / 100, ix: 0.211111, iy: 0.7, ox: 0.411111, oy: 0.7, smooth: true },
    { x: 0.666667, y: 0.912345, ix: 0.588888, iy: 0.9, ox: 0.744444, oy: 0.95 }, { x: 1, y: 1, ix: 0.876543, iy: 1 }] } });
  var dosyaCok = Ep.dosyaYaz(onCok).metin;
  yapistirSim(p12c, "egri-kod", dosyaCok);
  p12c.dom["egri-kod-yukle"].tetikle("click");
  ok("Kod yapıştır (gerçek kutu): 4096 karakterden uzun .suflo-egri metni kesilmeden okunur", dosyaCok.length > 4096 && JSON.parse(p12c.depo["suflo.egri.onayarlar"]).length === 15 &&
    p12c.dom["egri-status"].textContent === "Eğri önayarlarına eklendi: 12", dosyaCok.length + " " + p12c.dom["egri-status"].textContent);
  // cubic-bezier alanı tek satırlık: Kodu kopyala çıktısı (adlı, çok noktalı) satır sonu boşluk olarak ve maxlength'e takılmadan gelir
  var kodUzun = Ep.paylasimKodla({ ad: "Yumuşak çıkış ve biraz taşma", curve: onCok[0].curve });
  var cssYap = yapistirSim(p12c, "egri-css", kopyaCikti(kodUzun));
  p12c.dom["egri-css"].tetikle("change");
  ok("cubic-bezier alanı (gerçek kutu): adlı çok noktalı eğrinin Kodu kopyala çıktısı kesilmeden yüklenir", cssYap.length > 200 && js(p12c.G._durum().egri) === js(Ep.normalize(onCok[0].curve)) &&
    /^Yüklendi: Yumuşak çıkış ve biraz taşma/.test(p12c.dom["egri-status"].textContent), cssYap.length + " " + p12c.dom["egri-status"].textContent);
  yapistirSim(p12c, "egri-css", Ep.paylasimKodla({ ad: "X", curve: cokN }) + " " + kodUzun);
  p12c.dom["egri-css"].tetikle("change");
  ok("cubic-bezier alanı: iki farklı kod yapıştırılınca biri sessizce seçilmez, nedeni yazılır", js(p12c.G._durum().egri) === js(Ep.normalize(onCok[0].curve)) &&
    p12c.dom["egri-status"].textContent === "Birden çok farklı kod var; burada tek kod kullanılır. Birkaçını önayarlara eklemek için Eğri sekmesindeki kod kutusuna yapıştır.",
    p12c.dom["egri-status"].textContent);
  var sh12 = 0;
  p12c.dom["egri-kod"].value = "ease-in";
  p12c.dom["egri-kod"].tetikle("keydown", { key: "Enter", shiftKey: true, target: p12c.dom["egri-kod"], preventDefault: function () { sh12++; } });
  ok("kod kutusunda Shift+Enter alt satıra geçer (yüklemez)", sh12 === 0 && p12c.dom["egri-kod"].value === "ease-in");
  // yeniden adlandır ve taşı
  var onIdler = JSON.parse(p12.depo["suflo.egri.onayarlar"]).map(function (o) { return o.id; });
  var kartBul = function (x, id) { return x.dom["egri-onayarlar"].children.filter(function (c) { return c.getAttribute("data-id") === id; })[0]; };
  kartBul(p12, onIdler[1]).tetikle("click");
  ok("kendi önayarı seçilince satır: ad kutusu, ◀ ▶ (uçta kapalı değil)", p12.dom["egri-onayar-duzen"].hidden === false && p12.dom["egri-onayar-ad"].value === "Bir" &&
    p12.dom["egri-onayar-sola"].disabled === false && p12.dom["egri-onayar-saga"].disabled === false);
  p12.dom["egri-onayar-ad"].value = "  Birinci\u0007 ";
  p12.dom["egri-onayar-adlandir"].tetikle("click");
  ok("Adı değiştir: ad temizlenir, depo ve kart güncellenir; boş ad uyarı", JSON.parse(p12.depo["suflo.egri.onayarlar"])[1].ad === "Birinci" && kartBul(p12, onIdler[1]).getAttribute("title") === "Birinci" &&
    (p12.dom["egri-onayar-ad"].value = "  ", p12.dom["egri-onayar-adlandir"].tetikle("click"), p12.dom["egri-status"].textContent === "Önayara bir ad yaz."), js(JSON.parse(p12.depo["suflo.egri.onayarlar"])));
  p12.dom["egri-onayar-sola"].tetikle("click");
  ok("◀: önayar bir sola, seçim korunur; en solda ◀ kapanır", js(JSON.parse(p12.depo["suflo.egri.onayarlar"]).map(function (o) { return o.id; })) === js([onIdler[1], onIdler[0], onIdler[2]]) &&
    p12.G._durum().seciliOnayar === onIdler[1] && p12.dom["egri-onayar-sola"].disabled === true);
  p12.dom["egri-onayar-saga"].tetikle("click");
  p12.dom["egri-onayar-saga"].tetikle("click");
  ok("▶ ▶: en sağa; ▶ kapanır", js(JSON.parse(p12.depo["suflo.egri.onayarlar"]).map(function (o) { return o.id; })) === js([onIdler[0], onIdler[2], onIdler[1]]) && p12.dom["egri-onayar-saga"].disabled === true);
  // sürükle-bırak: yalnız kullanıcı kartları sürüklenebilir
  var kSur = kartBul(p12, onIdler[1]), kHedef = kartBul(p12, onIdler[0]), dt = { setData: function () {} };
  kSur.tetikle("dragstart", { dataTransfer: dt });
  var izin = 0;
  kHedef.tetikle("dragover", { dataTransfer: dt, preventDefault: function () { izin++; } });
  kHedef.tetikle("drop", { dataTransfer: dt, preventDefault: function () {} });
  ok("sürükle-bırak: kullanıcı kartı başka kullanıcı kartının yerine taşınır; hazır kartlar sürüklenmez", izin === 1 &&
    js(JSON.parse(p12.depo["suflo.egri.onayarlar"]).map(function (o) { return o.id; })) === js([onIdler[1], onIdler[0], onIdler[2]]) &&
    kSur.getAttribute("draggable") === "true" && p12.dom["egri-onayarlar"].children[0].getAttribute("draggable") === null);
  ok("paylaşım: hiçbir eylem Premiere'e gitmez ve Pro kapısından geçmez", p12.cagri.length === 0 && p12.kapi.length === 0, js(p12.kapi));
  // pano yoksa kod kutuya konur
  var p12b = kur({ cevap: function () { return { ok: false }; } });
  p12b.dom["egri-kod-kopyala"].tetikle("click");
  await bekle(5);
  ok("Kodu kopyala: pano yoksa kod kutuya konur, uyarı (Ctrl+C)", Ep.paylasimCoz(p12b.dom["egri-kod"].value).ok && p12b.dom["egri-status"].textContent === "Kopyalanamadı; kod aşağıdaki kutuda, Ctrl+C ile kopyala.");
  // Dışa / içe aktar (window.cep.fs pencereleri + Node fs)
  var yazilan = {}, okunacak = {}, pencereler = [];
  var kfs = {
    writeFileSync: function (p, m) { yazilan[p] = m; },
    statSync: function (p) { return { size: Buffer.byteLength(okunacak[p] || "", "utf8") }; },
    readFileSync: function (p) { if (!(p in okunacak)) throw new Error("ENOENT"); return okunacak[p]; },
    existsSync: function () { return false; }
  };
  var secilecek = "/ev/egriler";
  var cepFs = {
    showSaveDialogEx: function (baslik, bas, turler, ad) { pencereler.push(["kaydet", baslik, js(turler), ad]); return { err: 0, data: secilecek }; },
    showOpenDialogEx: function (cok, klasor, baslik, bas, turler) { pencereler.push(["ac", baslik, js(turler)]); return { err: 0, data: secilecek ? [secilecek] : [] }; }
  };
  var p13 = kur({ cepFs: cepFs, kfs: kfs, cevap: function () { throw new Error("çağrılmamalı"); } });
  p13.dom["egri-disa-aktar"].tetikle("click");
  ok("Dışa aktar: önayar yoksa uyarı, pencere açılmaz", pencereler.length === 0 && p13.dom["egri-status"].textContent === "Dışa aktarılacak önayar yok: önce bir eğriyi Önayar olarak kaydet.");
  p13.dom["egri-kod"].value = cokKod;
  p13.dom["egri-kod-yukle"].tetikle("click");
  p13.dom["egri-disa-aktar"].tetikle("click");
  var dosyaMetni = yazilan["/ev/egriler.suflo-egri"];
  ok("Dışa aktar: kaydetme penceresi (.suflo-egri, varsayılan ad); uzantı eklenir; dosya geri okunur", !!dosyaMetni && pencereler[0][0] === "kaydet" && pencereler[0][2] === js(["suflo-egri"]) &&
    pencereler[0][3] === "suflo-egriler.suflo-egri" && Ep.dosyaOku(dosyaMetni).presets.length === 2 && p13.dom["egri-status"].textContent === "Dışa aktarıldı: 2 önayar → /ev/egriler.suflo-egri",
    p13.dom["egri-status"].textContent);
  // 3.4 adım 15 incelemesi: uzantı pencereden sonra eklenince pencerenin üzerine yazma sorusu o adı görmedi; dosya varsa sorulur
  var yaz14 = {}, sorular14 = [], evet14 = false, secilen14 = "/ev/egrilerim";
  var kfs14 = { writeFileSync: function (p, m) { yaz14[p] = m; }, existsSync: function (p) { return p === "/ev/egrilerim.suflo-egri"; },
    statSync: function () { return { size: 0 }; }, readFileSync: function () { throw new Error("ENOENT"); } };
  var p14 = kur({ cepFs: { showSaveDialogEx: function () { return { err: 0, data: secilen14 }; } }, kfs: kfs14, cevap: function () { throw new Error("çağrılmamalı"); } });
  p14.ctx.confirm = function (s) { sorular14.push(s); return evet14; };
  p14.dom["egri-kod"].value = cokKod;
  p14.dom["egri-kod-yukle"].tetikle("click");
  var durum14 = p14.dom["egri-status"].textContent;
  p14.dom["egri-disa-aktar"].tetikle("click");
  ok("Dışa aktar: uzantı eklenen ad zaten varsa sorulur; hayır → eski dosya yerinde, durum değişmez", sorular14.length === 1 &&
    sorular14[0] === "Bu adla bir dosya zaten var: egrilerim.suflo-egri. Üzerine yazılsın mı?" && !Object.keys(yaz14).length && p14.dom["egri-status"].textContent === durum14, js(sorular14));
  evet14 = true;
  p14.dom["egri-disa-aktar"].tetikle("click");
  ok("...evet → üzerine yazılır", sorular14.length === 2 && !!yaz14["/ev/egrilerim.suflo-egri"] && p14.dom["egri-status"].textContent === "Dışa aktarıldı: 2 önayar → /ev/egrilerim.suflo-egri");
  secilen14 = "/ev/egrilerim.suflo-egri";
  p14.dom["egri-disa-aktar"].tetikle("click");
  ok("...ad uzantısıyla geldiyse (pencere zaten sordu) yeniden sorulmaz", sorular14.length === 2);
  var I18N14 = require(path.join(KOK, "js", "i18n.js"));
  I18N14.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("İngilizce: üzerine yazma sorusu ve çoklu kod uyarısı", I18N14.translate("Bu adla bir dosya zaten var: egrilerim.suflo-egri. Üzerine yazılsın mı?") ===
    "A file with this name already exists: egrilerim.suflo-egri. Overwrite it?" &&
    I18N14.translate("Birden çok farklı kod var; burada tek kod kullanılır. Birkaçını önayarlara eklemek için Eğri sekmesindeki kod kutusuna yapıştır.") !==
    "Birden çok farklı kod var; burada tek kod kullanılır. Birkaçını önayarlara eklemek için Eğri sekmesindeki kod kutusuna yapıştır.");
  // içe aktar: dış biçim (anahtar adı birleştirilerek) + BOM, yineleme
  var disO = {}; disO["open" + "curve"] = 1;
  disO.presets = [{ name: "Dış kübik", curve: [0.3, 0.1, 0.1, 1] }, { name: "Dış çok noktalı", curve: { points: [[0, 0], [0.4, 0.9], [1, 1]] } }, { name: "Yay", curve: { type: "spring" } }];
  okunacak["/ev/dis.json"] = "﻿" + JSON.stringify(disO);
  secilecek = "/ev/dis.json";
  p13.dom["egri-ice-aktar"].tetikle("click");
  var on13 = JSON.parse(p13.depo["suflo.egri.onayarlar"]).map(function (o) { return o.ad; });
  ok("İçe aktar: açma penceresi (.suflo-egri, json); dış biçimin tek kübik ve çok noktalı eğrileri eklenir, tanınmayan uyarıyla atlanır", pencereler[1][0] === "ac" &&
    pencereler[1][2] === js(["suflo-egri", "json"]) && js(on13) === js(["Bir", "İki", "Dış kübik", "Dış çok noktalı"]) &&
    p13.dom["egri-status"].textContent === "Eğri önayarlarına eklendi: 2 · 1 tanınmayan eğri atlandı (yalnız tek kübik ve çok noktalı eğriler okunur)", p13.dom["egri-status"].textContent);
  okunacak["/ev/buyuk.suflo-egri"] = new Array(70000).join("a");
  secilecek = "/ev/buyuk.suflo-egri";
  p13.dom["egri-ice-aktar"].tetikle("click");
  ok("İçe aktar: 64 KB'tan büyük dosya okunmadan reddedilir", p13.dom["egri-status"].textContent === "Dosya çok büyük (en çok 64 KB).");
  var once13 = p13.dom["egri-status"].textContent;
  secilecek = "";
  p13.dom["egri-ice-aktar"].tetikle("click");
  ok("İçe aktar: pencere iptal edilince hiçbir şey değişmez", p13.dom["egri-status"].textContent === once13 && JSON.parse(p13.depo["suflo.egri.onayarlar"]).length === 4);
  okunacak["/ev/tek.suflo-egri"] = Ep.dosyaYaz([{ ad: "Tek", curve: { type: "bezier", x1: 0.9, y1: 0, x2: 0.1, y2: 1 } }]).metin;
  secilecek = "/ev/tek.suflo-egri";
  p13.dom["egri-ice-aktar"].tetikle("click");
  var tekId = JSON.parse(p13.depo["suflo.egri.onayarlar"]).filter(function (o) { return o.ad === "Tek"; })[0];
  ok("İçe aktar: tek eğri eklenince seçilir ve düzenleyiciye gelir", !!tekId && p13.G._durum().seciliOnayar === tekId.id && p13.dom["egri-css"].value === "cubic-bezier(0.9, 0, 0.1, 1)" &&
    p13.dom["egri-onayar-duzen"].hidden === false && p13.dom["egri-onayar-ad"].value === "Tek");
  var p13b = kur({ cevap: function () { return { ok: false }; } });
  p13b.dom["egri-ice-aktar"].tetikle("click");
  ok("İçe aktar: dosya penceresi yoksa (CEP dışı) kopyala-yapıştır önerilir", p13b.dom["egri-status"].textContent === "Dosya penceresi açılamadı; kodu kopyalayıp yapıştırarak paylaş.");
  ok("dosya işlemleri de Premiere'e gitmez, kapısız", p13.cagri.length === 0 && p13.kapi.length === 0);
  // Uygula hâlâ 'curves' kapısından (içe aktarılan eğriyle)
  var p14 = kur({ kurulu: false, cevap: function (fn) { if (fn === "KS_easePeek") return peek(12.5); if (fn === "KS_easeScan") return tarama(12.5, ikiProp(12.5)); return { ok: false }; } });
  p14.dom["egri-kod"].value = kodAdli;
  p14.dom["egri-kod-yukle"].tetikle("click");
  p14.ctx._tab.egri(); await bekle(10);
  await p14.G.uygula();
  ok("içe aktarılan eğriyi uygulamak 'curves' kapısından (3 deneme) geçer; kapı kapalıyken yazılmaz", p14.kapi.length === 1 && p14.kapi[0][0] === "curves" && p14.kapi[0][1].deneme === true &&
    p14.cagriAdlari().indexOf("KS_easeBake") === -1);
  // İngilizce
  var I18N15 = require(path.join(KOK, "js", "i18n.js"));
  I18N15.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("İngilizce: paylaşım metinleri ve özet kalıpları", I18N15.translate("Kodu kopyala") === "Copy code" && I18N15.translate("Paylaş ve içe aktar") === "Share and import" &&
    I18N15.translate("Eğri önayarlarına eklendi: 3") === "Added to curve presets: 3" && I18N15.translate("2 yineleme atlandı") === "2 duplicates skipped" &&
    I18N15.translate("Dışa aktarıldı: 4 önayar →") === "Exported: 4 presets →" && I18N15.translate("5 eğri sığmadı (en çok 24 önayar)") === "5 curves didn't fit (up to 24 presets)");

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
