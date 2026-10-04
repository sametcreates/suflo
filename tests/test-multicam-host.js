// Suflo testi: Podcast Modu host işlevleri (sahte Premiere + sahte QE): KS_getTrackLayout,
// KS_multicamPrepare, KS_multicamRazor, KS_multicamEnable (bağlı klip koruması), KS_exportAudio unmuteWanted
var fs = require("fs"), path = require("path"), vm = require("vm");
var M = require(path.join(__dirname, "..", "js", "multicam.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

var TPS = 254016000000;
function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", {
  get: function () { return String(Math.round(this.seconds * TPS)); },
  set: function (v) { this.seconds = Number(v) / TPS; }
});
FakeTime.prototype.getFormatted = function () { return String(this.seconds); };

var yazmaSayaci = 0;
// bag: "yok" | "tek" (video → ses) | "cift" (iki yönlü)
function klip(bas, son, o) {
  o = o || {};
  var c = { start: { seconds: bas }, end: { seconds: son }, inPoint: { seconds: o.inPoint || 0 }, name: o.name || "klip",
    projectItem: { getMediaPath: function () { return o.yol || "C:\\cekim\\kamera.mov"; } }, _d: false, bag: null, tur: o.tur || "v" };
  if (o.multicam) c.projectItem.isMulticamClip = function () { return true; };
  if (o.merged) c.projectItem.isMergedClip = function () { return true; };
  Object.defineProperty(c, "disabled", {
    get: function () { return c._d; },
    set: function (v) {
      yazmaSayaci++;
      v = !!v;
      if (c._d === v) return;
      c._d = v;
      if (!c.bag || ortam.bag === "yok") return;
      if (c.tur === "v") c.bag._d = v;                     // video kapanınca bağlı ses de kapanır
      else if (ortam.bag === "cift") c.bag.forEach(function (vv) { vv._d = v; });   // ses → video
    }
  });
  return c;
}
var ortam = { bag: "yok" };
function iz(ad, klipler, o) {
  o = o || {};
  var t = { name: ad, _k: klipler, _kilit: !!o.kilit, _mute: !!o.mute,
    isLocked: function () { return t._kilit; }, isMuted: function () { return t._mute; }, setMute: function (v) { t._mute = !!v; } };
  Object.defineProperty(t, "clips", { get: function () {
    var col = { numItems: t._k.length }; t._k.forEach(function (k, i) { col[i] = k; }); return col;
  } });
  return t;
}
function izler(liste) { var o = { numTracks: liste.length }; liste.forEach(function (t, i) { o[i] = t; }); return o; }

var sekanslar = [], aktif = null, klonSayisi = 0;
function sekansYap(id, v, a) {
  var s = { sequenceID: id, name: "Podcast " + id, end: String(60 * TPS), timebase: String(TPS / 25),
    videoTracks: izler(v), audioTracks: izler(a),
    getSettings: function () { return { videoDisplayFormat: 100 }; },
    clone: function () {
      klonSayisi++;
      var kop = sekansYap(id + "-kopya", v.map(function (t) { return iz(t.name, t._k.map(function (k) { return klip(k.start.seconds, k.end.seconds); })); }),
        a.map(function (t) { return iz(t.name, t._k.slice()); }));
      sekanslar.push(kop); proje.sequences = koleksiyon();
    }
  };
  return s;
}
function koleksiyon() { var o = { numSequences: sekanslar.length }; sekanslar.forEach(function (s, i) { o[i] = s; }); return o; }
var proje = { openSequence: function (id) { sekanslar.forEach(function (s) { if (s.sequenceID === id) aktif = s; }); } };
Object.defineProperty(proje, "activeSequence", { get: function () { return aktif; }, set: function (v) { aktif = v; } });

// QE: razor yalnız o katmanı böler (bağlı ses bölünmez)
var razorlar = [];
var qe = { project: { getActiveSequence: function () {
  return { getVideoTrackAt: function (i) { return { razor: function (tc) { razorlar.push({ track: i, t: Number(tc) }); bol(aktif.videoTracks[i], Number(tc)); } }; },
    getAudioTrackAt: function (i) { return { razor: function () { razorlar.push({ track: "A" + i }); } }; } };
} } };
function bol(tr, t) {
  for (var i = 0; i < tr._k.length; i++) {
    var k = tr._k[i];
    if (t > k.start.seconds && t < k.end.seconds) {
      var yeni = klip(t, k.end.seconds, { yol: k.projectItem.getMediaPath() });
      yeni._d = k._d; yeni.bag = k.bag;
      if (k.bag && k.bag.bag) k.bag.bag.push(yeni);
      k.end = { seconds: t };
      tr._k.splice(i + 1, 0, yeni);
      return;
    }
  }
}

var dosyalar = {}, exportMute = null;
function FakeFile(p) { this.fsName = p; this.exists = !!dosyalar[p] || /\.epr$/.test(p); }
function FakeFolder(p) { this.fsName = p; this.exists = /temp/.test(p); this.create = function () {}; this.getFiles = function () { return []; }; }
FakeFolder.temp = { fsName: "C:\\temp" };

var ctx = { app: { version: "25.1.0", project: proje, enableQE: function () {} }, qe: qe, $: { os: "Windows 10" },
  Time: FakeTime, File: FakeFile, Folder: FakeFolder,
  decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, Date: Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
function call(fn, arg) { return JSON.parse(arg === undefined ? ctx[fn]() : ctx[fn](encodeURIComponent(JSON.stringify(arg)))); }

/* Podcast sekansı: V1 kamera A, V2 kamera B, V3 geniş, V4 logo (üstte, dokunulmaz); A1 / A2 mikrofonlar */
function podcast(id, o) {
  o = o || {};
  var kamA = klip(0, 60, { yol: "C:\\cekim\\A.mov" }), kamB = klip(0, 60, { yol: "C:\\cekim\\B.mov" }), genis = klip(0, 60, { yol: "C:\\cekim\\W.mov" });
  var micA = klip(0, 60, { yol: "C:\\ses\\A.wav", tur: "a" }), micB = klip(0, 60, { yol: "C:\\ses\\B.wav", tur: "a" });
  if (o.bagli) { kamA.bag = micA; micA.bag = [kamA]; kamB.bag = micB; micB.bag = [kamB]; }
  var s = sekansYap(id, [iz("Kamera A", [kamA], { kilit: o.kilit }), iz("Kamera B", [kamB]), iz("Geniş", [genis], { mc: 1 }), iz("Logo", [klip(0, 60, { yol: "C:\\logo.png" })])],
    [iz("Mik A", [micA], { mute: o.mute }), iz("Mik B", [micB]), iz("Müzik", [klip(0, 60, { yol: "C:\\m.mp3", tur: "a" }), klip(61, 70, { tur: "a" })])]);
  if (o.multicam) s.videoTracks[1]._k[0].projectItem.isMulticamClip = function () { return true; };
  sekanslar.push(s); proje.sequences = koleksiyon();
  aktif = s;
  return s;
}

/* ---------- KS_getTrackLayout ---------- */
var s0 = podcast("s0");
s0.audioTracks[1]._k[0].projectItem.isMergedClip = function () { return true; };
var lay = call("KS_getTrackLayout");
ok("getTrackLayout: sekans kimliği, süre ve katman sayıları", lay.ok && lay.seqId === "s0" && lay.duration === 60 && lay.video.length === 4 && lay.audio.length === 3, js(lay).slice(0, 200));
ok("getTrackLayout: katman başına ad, klip sayısı, ilk / son", lay.video[0].name === "Kamera A" && lay.video[0].clipCount === 1 && lay.video[0].first === 0 && lay.video[0].last === 60 &&
  lay.audio[2].clipCount === 2 && lay.audio[2].last === 70);
ok("getTrackLayout: birleşik klip işaretlenir; düz ses klibi 'plain' bilgisi taşır", lay.audio[1].hasMerged === true && !lay.audio[1].plain &&
  lay.audio[0].plain && lay.audio[0].plain.path === "C:\\ses\\A.wav" && !lay.audio[2].plain);
s0.videoTracks[1]._k[0].projectItem.isMulticamClip = function () { return true; };
ok("getTrackLayout: isMulticamClip yalnız varsa okunur (typeof koruması)", call("KS_getTrackLayout").video[1].hasMulticam === true && call("KS_getTrackLayout").video[0].hasMulticam === false);

/* ---------- KS_multicamPrepare ---------- */
var sK = podcast("sK", { kilit: true });
var once = klonSayisi;
var pk = call("KS_multicamPrepare", { camTracks: [0, 1, 2], cloneFirst: true, seqId: "sK" });
ok("prepare: kilitli katman hiçbir değişiklikten önce hata verir (kopya yok)", !pk.ok && pk.kod === "kilitli" && pk.track === 0 && klonSayisi === once && aktif === sK, js(pk));
var sM = podcast("sM", { multicam: true });
var pm = call("KS_multicamPrepare", { camTracks: [0, 1, 2], cloneFirst: true, seqId: "sM" });
ok("prepare: multicam kaynak klibi reddedilir", !pm.ok && pm.kod === "multicam" && pm.track === 1 && klonSayisi === once, js(pm));
ok("prepare: olmayan / boş katman", call("KS_multicamPrepare", { camTracks: [9], seqId: "sM" }).kod === "iz_yok" && call("KS_multicamPrepare", { camTracks: [], seqId: "sM" }).kod === "iz_yok");
ok("prepare: sekans kimliği tutmazsa durur", call("KS_multicamPrepare", { camTracks: [0], seqId: "baska" }).kod === "sekans");
var s1 = podcast("s1");
var pp = call("KS_multicamPrepare", { camTracks: [0, 1, 2], cloneFirst: true, cloneName: "Podcast - Suflo Kamera", seqId: "s1" });
ok("prepare: kopya sekans oluşur, etkin olur ve adlandırılır", pp.ok && pp.cloned && pp.seqId === "s1-kopya" && aktif.sequenceID === "s1-kopya" && aktif.name === "Podcast - Suflo Kamera" && s1.videoTracks[0]._k.length === 1, js(pp));
var pb = call("KS_multicamPrepare", { camTracks: [0, 1], cloneFirst: false, seqId: "s1-kopya" });
ok("prepare: 'Bu sekansta' kopyasız", pb.ok && !pb.cloned && pb.seqId === "s1-kopya");

/* ---------- Plan → razor → enable ---------- */
var plan = [{ start: 0, end: 7.5, cam: 0 }, { start: 7.5, end: 15, cam: 1 }, { start: 15, end: 19, cam: M.WIDE }, { start: 19, end: 33.2, cam: 0 }, { start: 33.2, end: 47, cam: 1 }, { start: 47, end: 60, cam: 0 }];
var hp = M.hostPlan(plan, [0, 1], 2);
function hepsiniUygula(seq, ciftAsama, parca) {
  razorlar = [];
  var sonuc = { razor: [], enable: [] };
  M.chunk(hp.cuts, parca || 1000).forEach(function (c) { sonuc.razor.push(call("KS_multicamRazor", { seqId: seq.sequenceID, cuts: c })); });
  if (ciftAsama) {
    for (var t = 0; t < 60; t += 13) sonuc.enable.push(call("KS_multicamEnable", { seqId: seq.sequenceID, plan: hp.plan, camTracks: hp.tracks, from: t, to: t + 13 }));
  } else sonuc.enable.push(call("KS_multicamEnable", { seqId: seq.sequenceID, plan: hp.plan, camTracks: hp.tracks }));
  return sonuc;
}
function durum(seq) {
  return [0, 1, 2, 3].map(function (i) { return seq.videoTracks[i]._k.map(function (k) { return [k.start.seconds, k.end.seconds, k._d]; }); });
}
var sA = podcast("sA");
var r1 = hepsiniUygula(sA, false);
ok("razor: yalnız kamera katmanları kesilir, ses ve üstteki katman dokunulmaz",
  razorlar.every(function (r) { return r.track === 0 || r.track === 1 || r.track === 2; }) && sA.videoTracks[3]._k.length === 1 && sA.audioTracks[0]._k.length === 1 && sA.audioTracks[2]._k.length === 2, js(razorlar));
function anlar(tr) { return razorlar.filter(function (r) { return r.track === tr; }).map(function (r) { return r.t; }); }
ok("razor: her kamera yalnız kendi açılış / kapanış anlarında", js(anlar(0)) === js([7.5, 19, 33.2, 47]) && js(anlar(1)) === js([7.5, 15, 33.2, 47]) && js(anlar(2)) === js([15, 19]), js([anlar(0), anlar(1), anlar(2)]));
function tekKamera(seq) {
  for (var t = 0.05; t < 60; t += 0.1) {
    var acik = 0;
    [0, 1, 2].forEach(function (i) { seq.videoTracks[i]._k.forEach(function (k) { if (!k._d && t >= k.start.seconds && t < k.end.seconds) acik++; }); });
    if (acik !== 1) return t;
  }
  return true;
}
ok("enable: her an tam olarak bir kamera açık", tekKamera(sA) === true && r1.enable[0].ok, tekKamera(sA) + " " + js(r1.enable));
ok("enable: plana uyar (19–33.2 arası kamera A)", sA.videoTracks[0]._k.some(function (k) { return k.start.seconds === 19 && k.end.seconds === 33.2 && !k._d; }));
yazmaSayaci = 0;
var r2 = call("KS_multicamEnable", { seqId: "sA", plan: hp.plan, camTracks: hp.tracks });
ok("enable: değişmeyen değer yeniden yazılmaz (ikinci çalıştırma sıfır yazma)", r2.ok && r2.changed === 0 && yazmaSayaci === 0 && r2.unchanged > 0, js(r2));
ok("razor: klip sınırına düşen an yeniden kesilmez (ikinci tur)", (function () { razorlar = []; var r = call("KS_multicamRazor", { seqId: "sA", cuts: hp.cuts }); return r.ok && r.cuts === 0 && razorlar.length === 0; })());
var sX = podcast("sX");
razorlar = [];
var rx = call("KS_multicamRazor", { seqId: "baska", cuts: hp.cuts });
var ex2 = call("KS_multicamEnable", { seqId: "baska", plan: hp.plan, camTracks: hp.tracks });
ok("razor / enable: sekans kimliği tutmazsa hiçbir şey yapılmaz", !rx.ok && rx.kod === "sekans" && !ex2.ok && razorlar.length === 0 && sX.videoTracks[0]._k.length === 1);
sX.videoTracks[1]._kilit = true;
var rk = call("KS_multicamRazor", { seqId: "sX", cuts: hp.cuts });
ok("razor: kilitli kamera katmanı hiçbir kesimden önce hata verir", !rk.ok && rk.kod === "kilitli" && razorlar.length === 0 && sX.videoTracks[0]._k.length === 1, js(rk));

/* parçalı iki aşamalı çalıştırma = tek geçiş */
var sB = podcast("sB");
var r3 = hepsiniUygula(sB, true, 3);
ok("parçalı iki aşama (3'lük razor, 13 sn'lik enable) tek geçişle aynı sonucu verir", js(durum(sB)) === js(durum(sA)) && r3.razor.length > 1 && r3.enable.length > 1, js(durum(sB)[0]));

/* bağlı klip koruması */
ortam.bag = "tek";
var sL = podcast("sL", { bagli: true });
var rl = hepsiniUygula(sL, false);
var sesAcik = sL.audioTracks[0]._k.every(function (k) { return !k._d; }) && sL.audioTracks[1]._k.every(function (k) { return !k._d; });
ok("bağlı klip: videoyla kapanan ses geri açılır ve sayılır", rl.enable[0].ok && rl.enable[0].linkedRestored > 0 && sesAcik && tekKamera(sL) === true, js(rl.enable[0]));
ortam.bag = "cift";
var sC = podcast("sC", { bagli: true });
var rc = hepsiniUygula(sC, false);
ok("bağlı klip: iki yönlü bağda linkedConflict ve Ctrl+L önerisi", !rc.enable[0].ok && rc.enable[0].kod === "linkedConflict" && /Ctrl\+L/.test(rc.enable[0].error), js(rc.enable[0]));
ortam.bag = "yok";

/* ---------- KS_exportAudio unmuteWanted ---------- */
var sE = podcast("sE", { mute: true });
sE.audioTracks[2]._mute = true;
sE.exportAsMediaDirect = function (out) { exportMute = [0, 1, 2].map(function (i) { return sE.audioTracks[i]._mute; }); dosyalar[out] = 1; return ""; };
var ea = call("KS_exportAudio", { scope: "entire", epr: ["C:\\ext\\wav16k.epr"], tracks: [0], unmuteWanted: true });
ok("exportAudio unmuteWanted: istenen susturulmuş katman dışa aktarımda açık, diğerleri susturulu", ea.ok && js(exportMute) === js([false, true, true]), js(exportMute) + " " + js(ea));
ok("exportAudio unmuteWanted: her susturma durumu geri yüklenir", js([0, 1, 2].map(function (i) { return sE.audioTracks[i]._mute; })) === js([true, false, true]));
var eb = call("KS_exportAudio", { scope: "entire", epr: ["C:\\ext\\wav16k.epr"], tracks: [0] });
ok("exportAudio varsayılan: susturulmuş istenen katmana dokunulmaz (eski davranış)", eb.ok && js(exportMute) === js([true, true, true]) && js([0, 1, 2].map(function (i) { return sE.audioTracks[i]._mute; })) === js([true, false, true]), js(exportMute));
var ec = call("KS_exportAudio", { scope: "entire", epr: ["C:\\ext\\wav16k.epr"], tracks: [0, 1, 2] });
ok("exportAudio varsayılan: tüm katmanlar seçiliyse hiçbir susturma değişmez", ec.ok && js(exportMute) === js([true, false, true]));
var ed = call("KS_exportAudio", { scope: "entire", epr: ["C:\\ext\\wav16k.epr"], tracks: [0, 1, 2], unmuteWanted: true });
ok("exportAudio unmuteWanted: tümü seçiliyken de susturulmuşlar açılır ve geri yüklenir", ed.ok && js(exportMute) === js([false, false, false]) && js([0, 1, 2].map(function (i) { return sE.audioTracks[i]._mute; })) === js([true, false, true]));
dosyalar = {};
sE.exportAsMediaDirect = function () { exportMute = [0, 1, 2].map(function (i) { return sE.audioTracks[i]._mute; }); throw new Error("encoder"); };
var ee = call("KS_exportAudio", { scope: "entire", epr: ["C:\\ext\\wav16k.epr"], tracks: [1], unmuteWanted: true });
ok("exportAudio unmuteWanted: dışa aktarım patlasa da susturmalar geri yüklenir", !ee.ok && js([0, 1, 2].map(function (i) { return sE.audioTracks[i]._mute; })) === js([true, false, true]));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
