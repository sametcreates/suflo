// Suflo test yardımcısı (tools/test.js bunu koşmaz: "_" ile başlar):
// js/bridge.js'i GERÇEK child_process ile, js/magiccut.js'i (Otomatik Kesim paneli) sahte DOM ile yükler.
// test-kesim.js (gerçek ffmpeg ile uçtan uca) ve test-arayuz.js (deneme hakkı) kullanır.
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");

// Köprü: gerçek süreçler (K.run / K.runAkis), sahte CSInterface
function kopruYukle() {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-kesim-kopru-"));
  var sandbox = {
    window: {}, console: console, require: require, process: process, Buffer: Buffer,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    setImmediate: setImmediate, URL: URL, Promise: Promise, JSON: JSON, Math: Math, Date: Date,
    navigator: { platform: process.platform, userAgent: "" },
    CSInterface: function () { return { getSystemPath: function () { return tmp; }, evalScript: function () {} }; }
  };
  sandbox.CSInterface.SystemPath = { USER_DATA: "u", EXTENSION: "e" };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "bridge.js"), "utf8"), sandbox, { filename: "bridge.js" });
  return sandbox.window.K;
}

// Sahte DOM öğesi: yalnız magiccut.js'in dokunduğu yüzey
function eleman(id) {
  var e = {
    id: id, tagName: "DIV", value: "", textContent: "", className: "", hidden: false, disabled: false, checked: false,
    title: "", type: "", style: {}, dataset: {}, children: [], attrs: {}, _h: {}, onclick: null, onchange: null,
    clientWidth: 320, clientHeight: 56, width: 0, height: 0,
    setAttribute: function (a, v) { e.attrs[a] = String(v); },
    getAttribute: function (a) { return Object.prototype.hasOwnProperty.call(e.attrs, a) ? e.attrs[a] : null; },
    addEventListener: function (t, f) { (e._h[t] = e._h[t] || []).push(f); },
    fire: function (t, ev) { var r; (e._h[t] || []).forEach(function (f) { r = f.call(e, ev || { detail: 0 }); }); return r; },
    appendChild: function (c) { e.children.push(c); return c; },
    removeAttribute: function () {}, load: function () {}, pause: function () {},
    querySelectorAll: function () { return []; },
    classList: {
      _s: {},
      toggle: function (c, b) { if (b === undefined) b = !e.classList._s[c]; e.classList._s[c] = !!b; },
      add: function (c) { e.classList._s[c] = true; }, remove: function (c) { delete e.classList._s[c]; },
      contains: function (c) { return !!e.classList._s[c]; }
    },
    getContext: function () {
      var n = function () {};
      return { clearRect: n, fillRect: n, save: n, restore: n, beginPath: n, rect: n, clip: n, moveTo: n, lineTo: n, stroke: n, setLineDash: n };
    }
  };
  Object.defineProperty(e, "innerHTML", { get: function () { return ""; }, set: function () { e.children = []; } });
  return e;
}

/*
 * Paneli yükle. o: { K (köprü), ffmpeg (yol), clip, applyCuts(payload) → sonuç,
 *   ctx?: { hasSeq, sequenceId, seqIn, seqOut, seqDur, frame } (3.4 adım 7: sekans kapsamı),
 *   call?(fn, payload) → sonuç (verilirse her K.call buna gider; KS_exportAudio / KS_getTrackLayout sahtesi),
 *   fs? (K.fs yerine) }
 * Döner: { el, KCut, kayit: { gate, harca, toast, call, run, runAkis }, ctx(sel, ek), bekle(ms), kapsam(s), hedef(m) }
 */
function kesimPaneli(o) {
  var els = {};
  var VARSAYILAN = { "cut-noise": "-38", "cut-minsil": "0.8", "cut-pad": "0.15", "cut-minkeep": "0", "cut-mode": "select" };
  function el(id) {
    if (!els[id]) { els[id] = eleman(id); if (VARSAYILAN[id] !== undefined) els[id].value = VARSAYILAN[id]; }
    return els[id];
  }
  ["cut-result", "cut-progress", "cut-cancel", "cut-wave", "cut-here-row", "cut-koru-uyari", "cut-dinle-satir", "cut-koru-satir"].forEach(function (id) { el(id).hidden = true; });
  // #cut-scope: üç kapsam düğmesi (data-s), tıklanabilir
  var kapsamDugmeleri = ["clip", "inout", "entire"].map(function (k) { var b = eleman(""); b.tagName = "BUTTON"; b.dataset.s = k; return b; });
  el("cut-scope").querySelectorAll = function () { return kapsamDugmeleri; };
  // #cut-target: Kopya sekansta (açık) | Bu sekansta (data-m), tıklanabilir
  var hedefDugmeleri = ["clone", "here"].map(function (m) { var b = eleman(""); b.tagName = "BUTTON"; b.dataset.m = m; return b; });
  el("cut-target").querySelectorAll = function () { return hedefDugmeleri; };
  var kayit = { gate: [], harca: [], toast: [], call: [], run: [], runAkis: [] };
  var sel = o.clip || null, dinleyiciler = [], ekCtx = o.ctx || {};
  function ctxNesnesi() {
    var c = { sel: sel, connected: true };
    for (var k in ekCtx) c[k] = ekCtx[k];
    return c;
  }
  var gercekK = o.K;
  var K = {};
  for (var k in gercekK) K[k] = gercekK[k];
  // o.fs: K.fs sahtesi (ör. Windows'taki gibi açık dosyayı silemeyen unlinkSync)
  if (o.fs) K.fs = o.fs;
  K.findFfmpeg = function () { return Promise.resolve(o.ffmpeg); };
  K.log = function () {};
  K.hataYardimi = function (e) { return String(e && e.message || e); };
  K.run = function (cmd, args, opts) { kayit.run.push(args); return gercekK.run(cmd, args, opts); };
  K.runAkis = o.runAkisYok ? undefined : function (cmd, args, opts) { kayit.runAkis.push(args); return gercekK.runAkis(cmd, args, opts); };
  K.call = function (fn, payload) {
    kayit.call.push({ fn: fn, payload: payload });
    if (o.call) return Promise.resolve(o.call(fn, payload));
    return Promise.resolve(o.applyCuts ? o.applyCuts(payload) : { ok: true, newSeq: "Kopya" });
  };
  var sandbox = {
    console: console, Promise: Promise, JSON: JSON, Math: Math, Date: Date, Array: Array, Object: Object, String: String,
    Number: Number, Error: Error, RegExp: RegExp, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    devicePixelRatio: 1,
    addEventListener: function () {},
    document: { getElementById: el, createElement: function (t) { var x = eleman(""); x.tagName = String(t).toUpperCase(); return x; } },
    K: K,
    KApp: {
      ctx: ctxNesnesi,
      onContext: function (fn) { dinleyiciler.push(fn); },
      toast: function (m, t) { kayit.toast.push([m, t]); },
      davetAni: function () {}
    },
    Pro: {
      gate: function (ozellik, secenek) { kayit.gate.push([ozellik, secenek && secenek.deneme]); return true; },
      denemeHarca: function (ozellik) { kayit.harca.push(ozellik); }
    },
    SufloSessizlik: require(path.join(KOK, "js", "sessizlik.js"))
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "magiccut.js"), "utf8"), sandbox, { filename: "magiccut.js" });
  sandbox.KCut.init();
  return {
    el: el, KCut: sandbox.KCut, kayit: kayit,
    ctx: function (yeni, ek) {
      sel = yeni;
      if (ek) for (var k in ek) ekCtx[k] = ek[k];
      dinleyiciler.forEach(function (f) { f(ctxNesnesi()); });
    },
    kapsam: function (s) { kapsamDugmeleri.forEach(function (b) { if (b.dataset.s === s) b.fire("click"); }); },
    hedef: function (m) { hedefDugmeleri.forEach(function (b) { if (b.dataset.m === m) b.fire("click"); }); },
    tikla: function (id) { return Promise.resolve(el(id).fire("click", { detail: 0 })); },
    kaydir: function (id, deger) { el(id).value = String(deger); el(id).fire("input"); },
    bekle: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  };
}

// silencedetect stderr → ham aralıklar (magiccut.js'in kendi parseSilence'ı)
function parseSilenceYukle() {
  var src = fs.readFileSync(path.join(KOK, "js", "magiccut.js"), "utf8");
  var i0 = src.indexOf("function parseSilence(");
  var i1 = src.indexOf("\n  }", i0);
  return new Function("stderr", src.slice(i0, i1 + 4) + "\nreturn parseSilence(stderr);");
}

module.exports = { kopruYukle: kopruYukle, kesimPaneli: kesimPaneli, eleman: eleman, parseSilenceYukle: parseSilenceYukle };
