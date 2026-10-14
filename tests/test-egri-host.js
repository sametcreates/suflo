// Suflo testi: host.jsx Eğri (3.4 adım 10) — KS_easePeek / KS_easeScan / KS_easeBake / KS_easeUndo ve
// KS_apiProbe.kfInterp, sahte Premiere nesne modeliyle gerçek çalıştırma (test-transition-host.js düzeni).
// Anahtarlar sahte modelde KAYNAK zamanında durur (Premiere gibi); panel timeline saniyesi gönderir.
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..");
var E = require(path.join(ROOT, "js", "ease-curve.js"));

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : ""));
}
function js(x) { return JSON.stringify(x); }
function yakin(a, b, e) { return Math.abs(a - b) <= (e || 1e-6); }

/* ---------------- sahte Premiere ---------------- */
var yazimlar = [];          // tüm setValueAtKey çağrıları (sıra + updateUI)
var bilesenOkuma = 0;       // KS_easePeek bileşen yürümemeli
function FakeTime() { this.seconds = 0; }
function kopyaDeger(v) { return v && typeof v === "object" ? v.slice() : v; }
function FakeProp(ad, deger, anahtarlar, matchName) {
  this.displayName = ad;
  if (matchName) this.matchName = matchName;
  this.value = deger;
  this.keys = (anahtarlar || []).map(function (k) { return { s: k[0], v: k[1] }; });
  this.interp = [];
  this.ui = [];
}
FakeProp.prototype.sirala = function () { this.keys.sort(function (a, b) { return a.s - b.s; }); };
FakeProp.prototype.bul = function (s) { for (var i = 0; i < this.keys.length; i++) if (Math.abs(this.keys[i].s - s) < 1e-9) return this.keys[i]; return null; };
FakeProp.prototype.getValue = function () { return kopyaDeger(this.value); };
FakeProp.prototype.isTimeVarying = function () { return this.keys.length > 0; };
FakeProp.prototype.getKeys = function () { this.sirala(); return this.keys.map(function (k) { return { seconds: k.s }; }); };
FakeProp.prototype.getValueAtKey = function (t) { var k = this.bul(t.seconds); if (!k) throw new Error("anahtar yok"); return kopyaDeger(k.v); };
FakeProp.prototype.addKey = function (t) { if (!this.bul(t.seconds)) this.keys.push({ s: t.seconds, v: kopyaDeger(this.value) }); };
FakeProp.prototype.setValueAtKey = function (t, v, ui) {
  var k = this.bul(t.seconds);
  if (!k) throw new Error("addKey olmadan setValueAtKey");
  k.v = kopyaDeger(v);
  yazimlar.push({ prop: this.displayName, s: t.seconds, ui: ui === true });
};
FakeProp.prototype.removeKey = function (t) { var s = t.seconds; this.keys = this.keys.filter(function (k) { return Math.abs(k.s - s) > 1e-9; }); };
FakeProp.prototype.setInterpolationTypeAtKey = function (t, tur, ui) { this.interp.push({ s: t.seconds, tur: tur, ui: ui }); };

function list(items) { var o = { numItems: items.length }; items.forEach(function (x, i) { o[i] = x; }); return o; }
// Klip: timeline [start, end], kaynak [inP, outP]; bileşenler [Hareket(Konum, Ölçek), Opaklık(Opaklık), Bulanıklık(Miktar)]
function klip(o) {
  var c = {
    name: o.ad || "Klip.mp4", nodeId: o.nodeId || "n-" + o.start, mediaType: o.mediaType || "Video",
    start: { seconds: o.start }, end: { seconds: o.end }, inPoint: { seconds: o.inP }, outPoint: { seconds: o.outP },
    isSpeedReversed: function () { return !!o.ters; }, projectItem: {}
  };
  c.konum = new FakeProp("Position", [0.5, 0.5], o.konum || [], o.matchNames ? "ADBE Position" : undefined);
  c.olcek = new FakeProp("Scale", 100, o.olcek || []);
  c.uniform = new FakeProp("Uniform Scale", true, []);
  c.opak = new FakeProp("Opacity", 100, o.opak || []);
  c.renk = new FakeProp("Color", [1, 0, 0, 1], o.renk || []);
  c.bulanik = new FakeProp("Blurriness", 0, o.bulanik || []);
  var bilesenler = [
    { matchName: "AE.ADBE Motion", displayName: "Motion", properties: list([c.konum, c.olcek, c.uniform]) },
    { matchName: "AE.ADBE Opacity", displayName: "Opacity", properties: list([c.opak]) },
    { matchName: "AE.ADBE Gaussian Blur 2", displayName: "Gaussian Blur", properties: list([c.bulanik, c.renk]) }
  ];
  var bl = list(bilesenler);
  Object.defineProperty(c, "components", { get: function () { bilesenOkuma++; return bl; } });
  return c;
}

var secim = [], playhead = 0, izler = [];
var sequence = {
  sequenceID: "seq-1", timebase: String(254016000000 / 25),
  getSelection: function () { return secim; },
  getPlayerPosition: function () { return { seconds: playhead }; }
};
function izKur(klipler) {
  izler = klipler;
  var v = { numTracks: klipler.length };
  klipler.forEach(function (k, i) { v[i] = { clips: list(k) }; });
  sequence.videoTracks = v;
}
var ctx = {
  app: { version: "25.1.0", project: { activeSequence: sequence, path: "C:\\proje\\deneme.prproj" }, enableQE: function () {} },
  Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
  isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, File: function () {}, Folder: function () {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), ctx, { filename: "jsx/host.jsx" });
function cagir(fn, arg) { return JSON.parse(ctx[fn](arg === undefined ? undefined : encodeURIComponent(JSON.stringify(arg)))); }

// Panelin yaptığı gibi: tarama sonucundan bakePlan ile iç anahtarlar
function plan(p, egri, adim) {
  var bp = E.bakePlan({ t0: p.pair.t0, t1: p.pair.t1, v0: p.v0, v1: p.v1, fps: p.fps, step: adim || 1,
    curve: egri || E.builtin("yumusak").curve, clampMin: p.opak ? 0 : undefined, clampMax: p.opak ? 100 : undefined });
  return { compIdx: p.compIdx, propIdx: p.propIdx, matchName: p.matchName, t0: p.pair.t0, t1: p.pair.t1, v0: p.v0, v1: p.v1, keys: bp.keys };
}
function hedef(p) { return { nodeId: p.nodeId, clipName: p.clipName, clipStart: p.clipStart, seqId: "seq-1" }; }
function bul(r, etiket) { return (r.props || []).filter(function (p) { return p.label === etiket; })[0]; }
function timeline(c, s) { return c.start.seconds + (s - c.inPoint.seconds) / (c.outPoint.seconds - c.inPoint.seconds) * (c.end.seconds - c.start.seconds); }

/* ---------- 1) peek: ucuz, bileşen yürümez ---------- */
var A = klip({ ad: "Röportaj.mp4", nodeId: "nA", start: 10, end: 20, inP: 5, outP: 15,
  konum: [[6, [0.5, 0.5]], [8, [0.8, 0.3]]], opak: [[7, 0], [9, 100]], olcek: [[5.5, 100]] });
var B = klip({ ad: "Ust.mp4", nodeId: "nB", start: 0, end: 4, inP: 0, outP: 4, opak: [[1, 100], [3, 0]] });
izKur([[A], [B]]);
playhead = 12.5;
secim = [];
bilesenOkuma = 0;
var pk = cagir("KS_easePeek");
ok("peek: sekans, playhead, fps, proje yolu; seçim yoksa imza boş", pk.ok && pk.seqId === "seq-1" && pk.ph === 12.5 && pk.fps === 25 && pk.selSig === "" && /deneme\.prproj$/.test(pk.proje), js(pk));
secim = [A, { mediaType: "Audio", nodeId: "ses", start: { seconds: 10 }, end: { seconds: 20 } }];
pk = cagir("KS_easePeek");
ok("peek: seçili video klibinin nodeId|başlangıç|bitiş imzası (ses öğesi atlanır)", pk.selSig === "nA|10|20", pk.selSig);
ok("peek: hiçbir bileşen okunmadı", bilesenOkuma === 0, bilesenOkuma);

/* ---------- 2) tarama: Konum [x,y] ve Opaklık, playhead'i saran çift ---------- */
secim = [];
var r = cagir("KS_easeScan", { maxProps: 40 });
ok("tarama: seçim yokken playhead'in altındaki en üstteki video klibi (kapsam = klip aralığı)", r.ok && r.kaynak === "playhead" && r.klipler.length === 1 &&
  r.klipler[0].nodeId === "nA" && r.kapsam[0] === 10 && r.kapsam[1] === 20, js([r.kaynak, r.klipler, r.kapsam]));
var konum = bul(r, "Konum"), opak = bul(r, "Opaklık");
ok("tarama: yalnız ≥2 anahtarlı sayı / [x,y] özellikler (tek anahtarlı Ölçek, renk, onay kutusu yok)", r.props.length === 2 && konum && opak, js(r.props.map(function (p) { return p.label; })));
ok("Konum: [x,y], anahtarlar timeline saniyesinde, çift playhead'i sarar, uç değerleri", konum.tur === "xy" && js(konum.keys) === js([11, 13]) &&
  konum.pair.t0 === 11 && konum.pair.t1 === 13 && konum.pair.ic === 0 && js(konum.v0) === js([0.5, 0.5]) && js(konum.v1) === js([0.8, 0.3]) && konum.labelTablo === true, js(konum));
ok("Opaklık: sayı, opak işaretli, çift 12 → 14", opak.tur === "sayi" && opak.opak === true && opak.pair.t0 === 12 && opak.pair.t1 === 14 && opak.v0 === 0 && opak.v1 === 100, js(opak));
ok("tarama: kimlik metni bileşen + özellik (efekt sırası değişince bake reddeder)", konum.matchName === "AE.ADBE Motion/Position" && opak.matchName === "AE.ADBE Opacity/Opacity" &&
  konum.compIdx === 0 && konum.propIdx === 0 && opak.compIdx === 1 && opak.propIdx === 0, js([konum.matchName, opak.matchName]));
playhead = 3;
var rb = cagir("KS_easeScan", {});
ok("tarama: playhead başka klipte → o klip (üst katman önce)", rb.klipler.length === 1 && rb.klipler[0].nodeId === "nB" && rb.props.length === 1 && rb.props[0].pair.t0 === 1, js(rb.klipler));
playhead = 30;
var bos = cagir("KS_easeScan", {});
ok("tarama: playhead altında klip yok, seçim yok → kaynak 'yok'", bos.ok && bos.kaynak === "yok" && bos.props.length === 0, js(bos));
playhead = 12.5;
secim = [B, A];
var rs = cagir("KS_easeScan", {});
ok("tarama: seçili video klipleri timeline sırasıyla (playhead'den bağımsız, kapsam sınırsız)", rs.kaynak === "secim" && rs.klipler.map(function (k) { return k.nodeId; }).join(",") === "nB,nA" &&
  rs.kapsam[0] < -1e8 && rs.kapsam[1] > 1e8, js([rs.kaynak, rs.klipler.map(function (k) { return k.nodeId; }), rs.kapsam]));
secim = [];
// playhead tam bir anahtarın üstünde: o anahtar ve sonraki; son anahtarda bir önceki
playhead = 11;
ok("çift: playhead anahtarın üstündeyse o ve sonraki", bul(cagir("KS_easeScan", {}), "Konum").pair.t0 === 11);
playhead = 13;
ok("çift: son anahtarda bir önceki çift", bul(cagir("KS_easeScan", {}), "Konum").pair.t1 === 13);
playhead = 10.5;
ok("çift: playhead anahtarların dışında → pair null (satır 'dışında' ipucu)", bul(cagir("KS_easeScan", {}), "Konum").pair === null);
playhead = 12.5;

/* ---------- 3) bake: Konum + Opaklık, yalnız son yazımda updateUI, doğrusal ---------- */
r = cagir("KS_easeScan", {});
konum = bul(r, "Konum"); opak = bul(r, "Opaklık");
var pk1 = plan(konum), po1 = plan(opak);
yazimlar = [];
var b1 = cagir("KS_easeBake", { target: hedef(konum), items: [pk1, po1], dogrusal: true });
ok("bake: iki özellik de yazıldı, kayıtlar döndü", b1.ok && b1.basarili === 2 && b1.records.length === 2 && b1.yazilan === pk1.keys.length + po1.keys.length, js(b1.sonuclar));
ok("bake: 2 sn @25 fps → 49 iç anahtar (Konum), Opaklık 49", pk1.keys.length === 49 && A.konum.keys.length === 51 && A.opak.keys.length === 51, A.konum.keys.length + "/" + A.opak.keys.length);
var uiOlan = yazimlar.filter(function (y) { return y.ui; });
ok("bake: updateUI yalnız EN SON yazımda (bir kez)", uiOlan.length === 1 && yazimlar[yazimlar.length - 1].ui === true && yazimlar.length === pk1.keys.length + po1.keys.length + 1, js([uiOlan.length, yazimlar.length]));
var kk = A.konum.keys.slice().sort(function (x, y) { return x.s - y.s; });
ok("bake: anahtarlar KAYNAK zamanında (timeline 11,04 → kaynak 6,04), değerler eğriyle", yakin(kk[1].s, 6.04) && yakin(kk[kk.length - 2].s, 7.96) &&
  Math.abs(kk[1].v[0] - (0.5 + 0.3 * E.toFunction(E.builtin("yumusak").curve)(0.02))) < 1e-5, js([kk[1], kk[kk.length - 2]]));
ok("bake: uç anahtarlar (kullanıcının) değişmedi", js(A.konum.bul(6).v) === js([0.5, 0.5]) && js(A.konum.bul(8).v) === js([0.8, 0.3]) && A.opak.bul(7).v === 0 && A.opak.bul(9).v === 100);
ok("bake: yazılan anahtarlar doğrusal (0); kullanıcının uçlarına dokunulmadı", A.konum.interp.length === 49 && A.konum.interp.every(function (x) { return x.tur === 0 && x.s > 6 && x.s < 8; }) &&
  b1.dogrusal === 98, js([A.konum.interp.length, b1.dogrusal]));
var kayK = b1.records[0];
ok("kayıt: tur egri, uçlar timeline, zamanlar timeline, kenar değerleri, kimlik", kayK.tur === "egri" && kayK.seqId === "seq-1" && kayK.nodeId === "nA" && kayK.clipName === "Röportaj.mp4" &&
  kayK.clipStart === 10 && js(kayK.uclar) === js([11, 13]) && kayK.times.length === 49 && yakin(kayK.times[0], 11.04) && kayK.matchName === "AE.ADBE Motion/Position" &&
  js(kayK.kenarDegerleri) === js([{ t: 11, v: [0.5, 0.5] }, { t: 13, v: [0.8, 0.3] }]), js(kayK).slice(0, 300));
// Opaklık değerleri 0..100 içinde (bakePlan clamp); Taşma eğrisi (aşar) ile
var C = klip({ nodeId: "nC", start: 0, end: 4, inP: 0, outP: 4, opak: [[1, 0], [3, 100]] });
izKur([[C]]);
playhead = 2;
var rc = cagir("KS_easeScan", {});
var oc = rc.props[0];
var pTas = plan(oc, E.builtin("tasma").curve);
var bc = cagir("KS_easeBake", { target: hedef(oc), items: [pTas] });
ok("Opaklık: taşan eğride (Taşma) değerler 0..100'e kırpılır", bc.ok && bc.basarili === 1 && C.opak.keys.every(function (k) { return k.v >= 0 && k.v <= 100; }) &&
  C.opak.keys.some(function (k) { return k.v === 100 && k.s < 3; }), js(C.opak.keys.map(function (k) { return k.v; })).slice(0, 200));

/* ---------- 4) %50 hız ve ters klip eşlemesi ---------- */
// %50: 10 sn timeline, 5 sn kaynak
var Y = klip({ nodeId: "nY", start: 10, end: 20, inP: 5, outP: 10, olcek: [[6, 100], [8, 200]] });
izKur([[Y]]);
playhead = 13;
var ry = cagir("KS_easeScan", {});
var oy = ry.props[0];
ok("%50 hız: kaynak 6/8 → timeline 12/16", oy && oy.pair.t0 === 12 && oy.pair.t1 === 16 && oy.v0 === 100 && oy.v1 === 200, js(oy));
var py = plan(oy, E.builtin("dogrusal").curve, 4);
var by = cagir("KS_easeBake", { target: hedef(oy), items: [py] });
var yk = Y.olcek.keys.slice().sort(function (a, b) { return a.s - b.s; });
ok("%50 hız: timeline 12,16 sn → kaynak 6,08; doğrusal değer 104", by.ok && yakin(yk[1].s, 6.08) && yakin(yk[1].v, 104) && yk.length === py.keys.length + 2, js(yk.slice(0, 3)));
// ters: kaynak 5..15 tersten; kaynak 14 → timeline 11, kaynak 12 → timeline 13
var T = klip({ nodeId: "nT", start: 10, end: 20, inP: 5, outP: 15, ters: true, olcek: [[14, 50], [12, 150]] });
izKur([[T]]);
playhead = 12;
var rt = cagir("KS_easeScan", {});
var ot = rt.props[0];
ok("ters klip: kaynak 14 → timeline 11, kaynak 12 → timeline 13 (timeline sırasıyla), değerler doğru uçta", ot.pair.t0 === 11 && ot.pair.t1 === 13 && ot.v0 === 50 && ot.v1 === 150, js(ot));
var pt = plan(ot, E.builtin("dogrusal").curve, 1);
var bt = cagir("KS_easeBake", { target: hedef(ot), items: [pt] });
var tk = T.olcek.keys.slice().sort(function (a, b) { return a.s - b.s; });
ok("ters klip: timeline 12 sn → kaynak 13 sn, değer 100 (ortası)", bt.ok && T.olcek.bul(13) && yakin(T.olcek.bul(13).v, 100) && tk.length === 2 + pt.keys.length, js(T.olcek.bul(13)));

/* ---------- 5) ret: taşınan klip, değişen v0/v1, iç anahtar, değişen özellik ---------- */
var D = klip({ nodeId: "nD", start: 0, end: 10, inP: 0, outP: 10, olcek: [[2, 100], [4, 150]] });
izKur([[D]]);
playhead = 3;
var rd = cagir("KS_easeScan", {});
var od = rd.props[0];
var pd = plan(od);
var tasindi = { nodeId: "nD", clipName: od.clipName, clipStart: od.clipStart + 1, seqId: "seq-1" };
var bd = cagir("KS_easeBake", { target: tasindi, items: [pd] });
ok("ret: klip taşınmış (başlangıç değişti) → klipTasindi, hiçbir şey yazılmaz", !bd.ok && bd.kod === "klipTasindi" && D.olcek.keys.length === 2, js(bd));
var degisti = JSON.parse(JSON.stringify(pd)); degisti.v1 = 160;
var bd2 = cagir("KS_easeBake", { target: hedef(od), items: [degisti] });
ok("ret: uç değeri değişmiş (v1 150 ≠ 160) → degisti, yazılmaz", bd2.ok && bd2.basarili === 0 && bd2.sonuclar[0].kod === "degisti" && D.olcek.keys.length === 2, js(bd2.sonuclar));
var baskaSeq = cagir("KS_easeBake", { target: { nodeId: "nD", clipStart: 0, seqId: "seq-2" }, items: [pd] });
ok("ret: başka sekans için hazırlanmış plan → sekans", !baskaSeq.ok && baskaSeq.kod === "sekans", js(baskaSeq));
var yanlisOz = JSON.parse(JSON.stringify(pd)); yanlisOz.matchName = "AE.ADBE Motion/Rotation";
ok("ret: özellik kimliği tutmuyor (efekt sırası değişti) → ozellik", cagir("KS_easeBake", { target: hedef(od), items: [yanlisOz] }).sonuclar[0].kod === "ozellik");
var ucsuz = JSON.parse(JSON.stringify(pd)); ucsuz.t1 = 4.5;
ok("ret: uçta anahtar yok → ucYok", cagir("KS_easeBake", { target: hedef(od), items: [ucsuz] }).sonuclar[0].kod === "ucYok");
var kimse = cagir("KS_easeBake", { target: { nodeId: "yok", clipName: "x", clipStart: 99, seqId: "seq-1" }, items: [pd] });
ok("ret: klip bulunamadı → klipYok", !kimse.ok && kimse.kod === "klipYok", js(kimse));
var bozukPlan = JSON.parse(JSON.stringify(pd)); bozukPlan.keys[0].t = 1;   // uçların dışında
ok("ret: uçların dışındaki plan anahtarı → gecersiz, yazılmaz", cagir("KS_easeBake", { target: hedef(od), items: [bozukPlan] }).sonuclar[0].kod === "gecersiz" && D.olcek.keys.length === 2);
// kullanıcının iç anahtarı: degistir olmadan reddedilir
D.olcek.keys.push({ s: 3, v: 130 });
var bi = cagir("KS_easeBake", { target: hedef(od), items: [pd] });
ok("ret: arada kullanıcının anahtarı var → icAnahtar (sayısıyla), dokunulmaz", bi.sonuclar[0].kod === "icAnahtar" && bi.sonuclar[0].ic === 1 && D.olcek.keys.length === 3 && D.olcek.bul(3).v === 130, js(bi.sonuclar));
var ogeli = JSON.parse(JSON.stringify(pd)); ogeli.degistir = true;
var bi1 = cagir("KS_easeBake", { target: hedef(od), items: [pd, ogeli] });
ok("degistir öğe başına: yalnız degistir'li öğe iç anahtarı siler (diğeri reddedilir)", bi1.sonuclar[0].kod === "icAnahtar" && bi1.sonuclar[1].ok && bi1.sonuclar[1].silinen === 1, js(bi1.sonuclar));
D.olcek.keys = [{ s: 2, v: 100 }, { s: 3, v: 130 }, { s: 4, v: 150 }];
var bi2 = cagir("KS_easeBake", { target: hedef(od), items: [pd], degistir: true });
ok("degistir: iç anahtar silinir, eğri yazılır", bi2.basarili === 1 && bi2.sonuclar[0].silinen === 1 && D.olcek.keys.length === 2 + pd.keys.length &&
  !D.olcek.bul(3) === (pd.keys.every(function (k) { return Math.abs(k.t - 3) > 1e-9; })), js(bi2.sonuclar));
// bir öğenin reddi diğerini durdurmaz
var E2 = klip({ nodeId: "nE", start: 0, end: 10, inP: 0, outP: 10, olcek: [[2, 100], [4, 150]], opak: [[2, 0], [4, 100]] });
izKur([[E2]]);
var re2 = cagir("KS_easeScan", {});
var oO = bul(re2, "Opaklık"), oS = bul(re2, "Ölçek");
var kotuS = plan(oS); kotuS.v0 = 1;
var be2 = cagir("KS_easeBake", { target: hedef(oO), items: [kotuS, plan(oO)] });
ok("bir öğenin reddi diğerini durdurmaz", be2.basarili === 1 && be2.sonuclar[0].kod === "degisti" && be2.sonuclar[1].ok && be2.records.length === 1 && E2.olcek.keys.length === 2, js(be2.sonuclar));
var cok = plan(oS); cok.keys = []; for (var ci = 0; ci < 2001; ci++) cok.keys.push({ t: 2.001 + ci * 0.0009, v: 100 });
ok("ret: öğede 2000'den çok anahtar → cokFazla", cagir("KS_easeBake", { target: hedef(oS), items: [cok] }).sonuclar[0].kod === "cokFazla");

/* ---------- 6) geri al: yalnız Suflo'nun ve hâlâ duran zamanları ---------- */
var G = klip({ nodeId: "nG", ad: "Geri.mp4", start: 0, end: 10, inP: 0, outP: 10, olcek: [[2, 100], [4, 200]] });
izKur([[G]]);
playhead = 3;
var rg = cagir("KS_easeScan", {});
var og = rg.props[0];
var bg = cagir("KS_easeBake", { target: hedef(og), items: [plan(og)] });
var kayitG = bg.records[0];
kayitG.id = "kr1";
// kullanıcı aralığa kendi anahtarını ekler (karelerin arasına) ve Suflo'nun bir anahtarını elle siler
G.olcek.keys.push({ s: 3.013, v: 777 });
G.olcek.removeKey({ seconds: kayitG.times[5] });
var onceSayi = G.olcek.keys.length;
yazimlar = [];
var ug = cagir("KS_easeUndo", { records: [kayitG] });
ok("geri al: kalan Suflo anahtarları silindi (elle silinen sayılmaz)", ug.ok && ug.sonuclar.length === 1 && ug.sonuclar[0].ok && ug.sonuclar[0].silinen === kayitG.times.length - 1 &&
  G.olcek.keys.length === onceSayi - (kayitG.times.length - 1), js(ug));
ok("geri al: kullanıcının eklediği anahtar ve uçlar kaldı", G.olcek.keys.length === 3 && G.olcek.bul(3.013).v === 777 && G.olcek.bul(2).v === 100 && G.olcek.bul(4).v === 200, js(G.olcek.keys));
ok("geri al: t0 değeri updateUI ile yeniden yazıldı (Program tazelenir)", yazimlar.length === 1 && yazimlar[0].ui === true && yazimlar[0].s === 2, js(yazimlar));
var ug2 = cagir("KS_easeUndo", { records: [kayitG] });
ok("geri al ikinci kez: silinecek bir şey yok → kod 'yok'", ug2.sonuclar[0].silinen === 0 && ug2.sonuclar[0].kod === "yok" && G.olcek.keys.length === 3, js(ug2));
// kayıt uçlarını içerse bile uçlar silinmez
var hileli = JSON.parse(JSON.stringify(kayitG)); hileli.times = [2, 4];
cagir("KS_easeUndo", { records: [hileli] });
ok("geri al: kayıtta geçse de uç anahtarlar (kullanıcının) silinmez", G.olcek.bul(2) && G.olcek.bul(4));
// bulunamayan klip / başka sekans / değişen özellik: kayıt dokunulmadan geri döner
var yokKlip = JSON.parse(JSON.stringify(kayitG)); yokKlip.id = "kr2"; yokKlip.nodeId = "silindi"; yokKlip.clipName = "Yok.mp4";
var baskaSekans = JSON.parse(JSON.stringify(kayitG)); baskaSekans.id = "kr3"; baskaSekans.seqId = "seq-9";
var baskaOz = JSON.parse(JSON.stringify(kayitG)); baskaOz.id = "kr4"; baskaOz.matchName = "AE.ADBE Motion/Rotation";
var ua = cagir("KS_easeUndo", { records: [yokKlip, baskaSekans, baskaOz] });
ok("geri al: bulunamayan klip, başka sekans, değişen özellik → atlanan (panel saklar)", ua.ok && ua.sonuclar.length === 0 &&
  js(ua.atlanan) === js([{ id: "kr2", kod: "klipYok" }, { id: "kr3", kod: "sekans" }, { id: "kr4", kod: "ozellik" }]), js(ua));
// nodeId değişse de ad + başlangıçla bulunur
var adli = JSON.parse(JSON.stringify(kayitG)); adli.nodeId = "eski-node"; adli.times = [];
ok("klip nodeId'siz kayıtta ad + başlangıçla bulunur", cagir("KS_easeUndo", { records: [adli] }).sonuclar.length === 1);

// uzun aralık: 2000 iç anahtar yazılır ve tamamı geri alınır (eşleştirme birleştirme yürüyüşüyle, iç içe döngü yok)
var U = klip({ nodeId: "nU", ad: "Uzun.mp4", start: 0, end: 100, inP: 0, outP: 100, olcek: [[0, 100], [80.04, 300]] });
izKur([[U]]);
playhead = 40;
var ru = cagir("KS_easeScan", {});
var pu = plan(ru.props[0], E.builtin("dogrusal").curve, 1);
var basU = Date.now();
var bu = cagir("KS_easeBake", { target: hedef(ru.props[0]), items: [pu] });
var kayitU = bu.records[0];
var uu = cagir("KS_easeUndo", { records: [kayitU] });
ok("uzun aralık: 2000 anahtar yazılır, kayıt 2000 zaman, geri al hepsini siler, uçlar kalır", pu.keys.length === 2000 && bu.basarili === 1 && kayitU.times.length === 2000 &&
  uu.sonuclar[0].silinen === 2000 && U.olcek.keys.length === 2 && U.olcek.bul(0) && U.olcek.bul(80.04), js([pu.keys.length, kayitU.times.length, uu.sonuclar[0].silinen, Date.now() - basU + " ms"]));

/* ---------- 7) ipucu: canlı kayıt aralığı çift olur; 400 / 40 sınırları ---------- */
var H = klip({ nodeId: "nH", start: 0, end: 10, inP: 0, outP: 10, olcek: [[2, 100], [4, 200]] });
izKur([[H]]);
playhead = 3;
var rh = cagir("KS_easeScan", {});
var bh = cagir("KS_easeBake", { target: hedef(rh.props[0]), items: [plan(rh.props[0])] });
var rh2 = cagir("KS_easeScan", {});
ok("ipucu yokken çift Suflo'nun iki iç anahtarı arasında", rh2.props[0].pair.ic === 0 && rh2.props[0].pair.t1 - rh2.props[0].pair.t0 < 0.05 && rh2.props[0].pair.kayitli === false, js(rh2.props[0].pair));
var rh3 = cagir("KS_easeScan", { ipuclari: [{ nodeId: "nH", compIdx: 0, propIdx: 1, t0: 2, t1: 4 }] });
ok("ipucu (canlı kayıt uçları): çift 2 → 4, iç anahtar sayısı, kayitli", rh3.props[0].pair.t0 === 2 && rh3.props[0].pair.t1 === 4 && rh3.props[0].pair.kayitli === true &&
  rh3.props[0].pair.ic === bh.records[0].times.length && rh3.props[0].v0 === 100 && rh3.props[0].v1 === 200, js(rh3.props[0].pair));
var cokAnahtar = [];
for (var n = 0; n < 900; n++) cokAnahtar.push([n * 0.04, n]);   // her karede bir anahtar (25 fps), 36 sn
var K4 = klip({ nodeId: "nK", start: 0, end: 40, inP: 0, outP: 40, olcek: cokAnahtar });
izKur([[K4]]);
playhead = 24.02;
var rk = cagir("KS_easeScan", {});
var ok4 = rk.props[0];
ok("400 sınırı: playhead çevresinde 400 anahtarlık pencere, kesik, kapsam daralır, çift doğru", ok4.keys.length === 400 && ok4.kesik === true && ok4.toplam === 900 &&
  ok4.pair && yakin(ok4.pair.t0, 24) && yakin(ok4.pair.t1, 24.04) && rk.kapsam[0] > 0 && rk.kapsam[1] < 40 && rk.kapsam[0] <= 24 && rk.kapsam[1] >= 24.04 &&
  yakin(ok4.keys[ok4.pair.i0], 24), js([ok4.keys[0], ok4.keys[399], rk.kapsam, ok4.pair]));
var kalabalik = [];
for (var m = 0; m < 21; m++) {
  var km = klip({ nodeId: "m" + m, start: m * 10, end: m * 10 + 10, inP: 0, outP: 10, olcek: [[1, 100], [2, 110]], opak: [[1, 0], [2, 100]] });
  kalabalik.push(km);
}
izKur([kalabalik]);
secim = kalabalik.slice();
var rm = cagir("KS_easeScan", { maxProps: 40 });
ok("sınırlar: en çok 20 klip, en çok 40 özellik; fazlası 'atlanan'", rm.klipler.length === 20 && rm.props.length === 40 && rm.atlanan === 0 &&
  cagir("KS_easeScan", { maxProps: 7 }).atlanan === 33, js([rm.klipler.length, rm.props.length]));
secim = [];

/* ---------- 7b) inceleme: taşınan klipte geri al, canlılık, yarı açık kayıt aralığı, kapsam, uzun kayıt ---------- */
function anahtarlar(p) { return p.keys.slice().sort(function (x, y) { return x.s - y.s; }); }
// klip taşındı: anahtarlar kaynak zamanında klip ile kayar, kayıt (timeline) kaymaz → kayma kadar kaydırılıp silinir
var MV = klip({ nodeId: "nMV", ad: "Tasinan.mp4", start: 10, end: 20, inP: 0, outP: 10, olcek: [[1, 100], [3, 200]] });
izKur([[MV]]);
playhead = 12;
var rmv = cagir("KS_easeScan", {});
var bmv = cagir("KS_easeBake", { target: hedef(rmv.props[0]), items: [plan(rmv.props[0])] });
var kayitMV = bmv.records[0]; kayitMV.id = "krmv";
MV.start.seconds = 12; MV.end.seconds = 22;   // 2 sn sağa sürüklendi (giriş / çıkış aynı)
var umv = cagir("KS_easeUndo", { records: [kayitMV] });
ok("geri al, klip 2 sn taşındıktan sonra: 49 Suflo anahtarı kayma kadar kaydırılıp silinir, uçlar kalır", umv.ok && umv.sonuclar.length === 1 && umv.sonuclar[0].silinen === 49 &&
  umv.atlanan.length === 0 && MV.olcek.keys.length === 2 && MV.olcek.bul(1).v === 100 && MV.olcek.bul(3).v === 200, js([umv, MV.olcek.keys.length]));
// 10 kare (0,4 sn) taşındı: kullanıcının baş anahtarı (kaynak 1 → timeline 11,4) kayıtlı bir iç zamana denk gelir; silinmez
var MV2 = klip({ nodeId: "nMV2", ad: "Az.mp4", start: 10, end: 20, inP: 0, outP: 10, konum: [[1, [0.1, 0.1]], [2, [0.9, 0.9]]] });
izKur([[MV2]]);
playhead = 11.5;
var rmv2 = cagir("KS_easeScan", {});
var kmv2 = bul(rmv2, "Konum");
var kayitMV2 = cagir("KS_easeBake", { target: hedef(kmv2), items: [plan(kmv2)] }).records[0]; kayitMV2.id = "krmv2";
MV2.start.seconds = 10.4; MV2.end.seconds = 20.4;
var umv2 = cagir("KS_easeUndo", { records: [kayitMV2] });
ok("geri al, klip 10 kare taşındı: kullanıcının uç anahtarları değeriyle kalır, Suflo'nunkilerin hepsi gider", umv2.sonuclar[0].silinen === 24 && MV2.konum.keys.length === 2 &&
  js(MV2.konum.bul(1).v) === js([0.1, 0.1]) && js(MV2.konum.bul(2).v) === js([0.9, 0.9]), js([umv2.sonuclar, anahtarlar(MV2.konum).map(function (k) { return k.s; }).slice(0, 4)]));
// klibin hızı değişti (eşleme başka): ne kaymasız ne kaymalı aday tutar → hiçbir şey silinmez, kayıt saklanır
var SP = klip({ nodeId: "nSP", ad: "Hiz.mp4", start: 10, end: 20, inP: 0, outP: 10, olcek: [[1, 100], [3, 200]] });
izKur([[SP]]);
playhead = 12;
var rsp = cagir("KS_easeScan", {});
var kayitSP = cagir("KS_easeBake", { target: hedef(rsp.props[0]), items: [plan(rsp.props[0])] }).records[0]; kayitSP.id = "krsp";
var spOnce = SP.olcek.keys.length;
SP.outPoint.seconds = 20;   // %50 hız
var usp = cagir("KS_easeUndo", { records: [kayitSP] });
ok("geri al, klibin hızı değişti: kayıt eşleşmez → atlanan 'degisti', hiçbir anahtar silinmez", usp.ok && usp.sonuclar.length === 0 && js(usp.atlanan) === js([{ id: "krsp", kod: "degisti" }]) &&
  SP.olcek.keys.length === spOnce, js(usp));
// baştan ripple kırpma ve slip: klibin başı yerinde, giriş noktası kayar → anahtarlar timeline'da -Δgiriş kadar kayar.
// Kayıt klibin kaynak çapasını (giriş / çıkış / bitiş / yön) taşır; geri al Suflo'nun anahtarlarını yine bulur.
var KRh = require(path.join(ROOT, "js", "key-records.js"));
var Mh = require(path.join(ROOT, "js", "egri-model.js"));
function capaKlibi(o) {
  var c = klip({ nodeId: o.nodeId, ad: o.ad, start: 10, end: 20, inP: o.inP === undefined ? 5 : o.inP, outP: o.outP === undefined ? 15 : o.outP, ters: o.ters,
    olcek: o.olcek || [[6, 100], [8, 200], [12, 50]] });
  izKur([[c]]);
  playhead = o.ph === undefined ? 11.5 : o.ph;
  var rr = cagir("KS_easeScan", {});
  var pp = rr.props[0];
  var bb = cagir("KS_easeBake", { target: hedef(pp), items: [plan(pp)] });
  var kk = bb.records[0]; kk.id = "kr" + o.nodeId;
  return { c: c, prop: pp, b: bb, kayit: kk, toplam: c.olcek.keys.length };
}
var SL = capaKlibi({ nodeId: "nSL", ad: "Slip.mp4" });
ok("tarama ve kayıt klibin kaynak çapasını taşır (giriş / çıkış / bitiş / yön)", SL.prop.clipIn === 5 && SL.prop.clipOut === 15 && SL.prop.clipEnd === 20 && SL.prop.ters === false &&
  SL.kayit.clipIn === 5 && SL.kayit.clipOut === 15 && SL.kayit.clipEnd === 20 && SL.kayit.ters === false && SL.b.basarili === 1 && SL.kayit.times.length === 49,
  js([SL.prop.clipIn, SL.prop.clipOut, SL.prop.ters, SL.kayit.clipIn, SL.kayit.clipOut, SL.kayit.ters]));
var slKayit = KRh.kayit(SL.kayit);
ok("anahtar kayıt deposu kaynak çapasını saklar (eski kayıtta yok)", slKayit.clipIn === 5 && slKayit.clipOut === 15 && slKayit.clipEnd === 20 && slKayit.ters === false &&
  KRh.kayit({ tur: "egri", times: [1], clipStart: 0 }).clipIn === undefined, js(slKayit).slice(0, 200));
SL.c.inPoint.seconds = 5.5; SL.c.outPoint.seconds = 15.5;   // slip: 0,5 sn
var slTar = cagir("KS_easeScan", {});
var slProp = slTar.props[0];
var slCanli = Mh.canliKayitlar([slKayit], slProp);
ok("slip sonrası panel: kayıt çapayla kaydırılıp canlı (uçlar 10,5 → 12,5), satır kayıtlı çift, Geri al bulunur", slCanli.length === 1 && slCanli[0].id === slKayit.id &&
  js(slCanli[0].uclar) === js([10.5, 12.5]) && Mh.satirDurumu(slProp, 11.5, Mh.uclarDan(slCanli)).durum === "kayitli" &&
  Mh.satirKaydi([slKayit], slProp, Mh.satirDurumu(slProp, 11.5, Mh.uclarDan(slCanli)).cift).id === slKayit.id, js([slCanli.map(function (r) { return r.uclar; }), slProp.keys.slice(0, 3)]));
var slU = cagir("KS_easeUndo", { records: [slKayit] });
ok("geri al, slip sonrası: 49 Suflo anahtarı silinir, kullanıcının 3 anahtarı kalır", slU.ok && slU.atlanan.length === 0 && slU.sonuclar.length === 1 && slU.sonuclar[0].silinen === 49 &&
  SL.c.olcek.keys.length === 3 && SL.c.olcek.bul(6).v === 100 && SL.c.olcek.bul(8).v === 200 && SL.c.olcek.bul(12).v === 50, js([slU, SL.c.olcek.keys.length]));
// panelin kaydırılmış kopyası (çapası bugünkü klip) da aynı anahtarları siler
var SL2 = capaKlibi({ nodeId: "nSL2", ad: "Slip2.mp4" });
SL2.c.inPoint.seconds = 4; SL2.c.outPoint.seconds = 14;   // slip: -1 sn
var sl2Prop = cagir("KS_easeScan", {}).props[0];
var sl2Kopya = Mh.canliKayitlar([KRh.kayit(SL2.kayit)], sl2Prop)[0];
var sl2U = sl2Kopya ? cagir("KS_easeUndo", { records: [sl2Kopya] }) : null;
ok("geri al, slip sonrası panelin kaydırılmış kopyasıyla: 49 anahtar silinir", sl2Kopya && js(sl2Kopya.uclar) === js([12, 14]) && sl2Kopya.clipIn === 4 &&
  sl2U.sonuclar.length === 1 && sl2U.sonuclar[0].silinen === 49 && SL2.c.olcek.keys.length === 3, js([sl2Kopya && sl2Kopya.uclar, sl2U]));
// Q tarzı baştan ripple kırpma: giriş +0,5, bitiş -0,5, başlangıç yerinde
var RT = capaKlibi({ nodeId: "nRT", ad: "Ripple.mp4" });
RT.c.inPoint.seconds = 5.5; RT.c.end.seconds = 19.5;
var rtU = cagir("KS_easeUndo", { records: [KRh.kayit(RT.kayit)] });
ok("geri al, baştan ripple kırpma sonrası: 49 Suflo anahtarı silinir", rtU.atlanan.length === 0 && rtU.sonuclar[0].silinen === 49 && RT.c.olcek.keys.length === 3, js([rtU, RT.c.olcek.keys.length]));
// düz baştan kırpma (başlangıç ve giriş birlikte) + taşıma: anahtarlar timeline'da taşıma kadar kayar
var NT = capaKlibi({ nodeId: "nNT", ad: "Kirp.mp4" });
NT.c.inPoint.seconds = 5.2; NT.c.start.seconds = 10.2;   // baştan 0,2 sn kırpıldı
NT.c.start.seconds += 3; NT.c.end.seconds += 3;           // sonra 3 sn sağa taşındı
var ntU = cagir("KS_easeUndo", { records: [KRh.kayit(NT.kayit)] });
ok("geri al, baştan kırpma + taşıma sonrası: 49 Suflo anahtarı silinir", ntU.atlanan.length === 0 && ntU.sonuclar[0].silinen === 49 && NT.c.olcek.keys.length === 3, js([ntU, NT.c.olcek.keys.length]));
// ters klipte baştan ripple kırpma: görünen baş kaynağın çıkışıdır (çıkış -0,5, bitiş -0,5)
var TR = capaKlibi({ nodeId: "nTR", ad: "Ters.mp4", ters: true, olcek: [[14, 100], [12, 200], [8, 50]] });
TR.c.outPoint.seconds = 14.5; TR.c.end.seconds = 19.5;
var trU = cagir("KS_easeUndo", { records: [KRh.kayit(TR.kayit)] });
ok("geri al, ters klipte baştan ripple kırpma sonrası: 49 Suflo anahtarı silinir", TR.kayit.ters === true && trU.atlanan.length === 0 && trU.sonuclar[0].silinen === 49 &&
  TR.c.olcek.keys.length === 3, js([trU, TR.c.olcek.keys.length]));
// %50 hızlı klipte slip: kaynak 0,5 sn → timeline 1 sn
var YS = capaKlibi({ nodeId: "nYS", ad: "Yavas.mp4", inP: 5, outP: 10, olcek: [[6, 100], [7, 200], [9, 50]], ph: 13 });
YS.c.inPoint.seconds = 5.5; YS.c.outPoint.seconds = 10.5;
var ysU = cagir("KS_easeUndo", { records: [KRh.kayit(YS.kayit)] });
ok("geri al, %50 hızlı klipte slip sonrası: Suflo anahtarlarının hepsi silinir", ysU.atlanan.length === 0 && ysU.sonuclar[0].silinen === YS.kayit.times.length &&
  YS.c.olcek.keys.length === 3, js([ysU, YS.kayit.times.length, YS.c.olcek.keys.length]));
// yeniden uygulama, slip sonrası: panel kopyasının uçları ipucu olur, degistir + eski yalnız Suflo'nun eski anahtarlarını siler
var RA = capaKlibi({ nodeId: "nRA", ad: "Yeniden.mp4" });
RA.c.inPoint.seconds = 5.5; RA.c.outPoint.seconds = 15.5;
var raKayit = KRh.kayit(RA.kayit);
var raProp0 = cagir("KS_easeScan", {}).props[0];
var raIpucu = Mh.ipuclari([raKayit], [raProp0]);
playhead = 11.5;
var raProp = cagir("KS_easeScan", { ipuclari: raIpucu }).props[0];
var raKopya = Mh.canliKayitlar([raKayit], raProp)[0];
var raSatir = Mh.satirDurumu(raProp, playhead, Mh.uclarDan([raKopya]));
var raPlan = Mh.bakeGruplari([{ prop: raProp, cift: raSatir.cift, kayit: raKopya }], E.builtin("dogrusal").curve, 1, "seq-1");
var raB = cagir("KS_easeBake", raPlan.gruplar[0]);
ok("yeniden uygulama, slip sonrası: kayıtlı çift 10,5 → 12,5, eski 49 anahtar silinir, yeni eğri yazılır, kullanıcının anahtarları kalır",
  js(raIpucu) === js([{ nodeId: "nRA", compIdx: 0, propIdx: 1, t0: 10.5, t1: 12.5 }]) && raProp.pair.kayitli === true && raSatir.durum === "kayitli" &&
  raB.basarili === 1 && raB.sonuclar[0].silinen === 49 && RA.c.olcek.keys.length === 3 + raB.records[0].times.length && RA.c.olcek.bul(12).v === 50 &&
  js(Mh.cakisanlar([raKayit], KRh.kayit(raB.records[0])).map(function (r) { return r.id; })) === js([raKayit.id]), js([raIpucu, raSatir.durum, raB.sonuclar]));

// Suflo'nun anahtarları Ctrl+Z ile gitti, kullanıcı aralığa (kayıtlı bir kare zamanına) kendi anahtarını koydu
var CZ = klip({ nodeId: "nCZ", ad: "CtrlZ.mp4", start: 0, end: 10, inP: 0, outP: 10, olcek: [[1, 100], [2, 200]] });
izKur([[CZ]]);
playhead = 1.5;
var rcz = cagir("KS_easeScan", {});
var kayitCZ = cagir("KS_easeBake", { target: hedef(rcz.props[0]), items: [plan(rcz.props[0])] }).records[0]; kayitCZ.id = "krcz";
CZ.olcek.keys = [{ s: 1, v: 100 }, { s: 2, v: 200 }, { s: 1.52, v: 777 }];   // 1,52 sn kayıtta geçen bir kare
var ucz = cagir("KS_easeUndo", { records: [kayitCZ] });
ok("geri al, canlı olmayan kayıt (Suflo anahtarları gitmiş): kullanıcının anahtarı silinmez, kayıt 'yok' ile biter", ucz.sonuclar.length === 1 && ucz.sonuclar[0].silinen === 0 &&
  ucz.sonuclar[0].kod === "yok" && CZ.olcek.bul(1.52) && CZ.olcek.bul(1.52).v === 777 && CZ.olcek.keys.length === 3, js([ucz, CZ.olcek.keys.length]));

// kayıt aralığı sonda yarı açık: playhead B'de (ya da Sonraki çift'in B + 0,25 karesinde) çift B → C; B son anahtarsa kayıt çifti
var YA = klip({ nodeId: "nYA", start: 0, end: 10, inP: 0, outP: 10, olcek: [[1, 100], [3, 200], [5, 50]] });
izKur([[YA]]);
playhead = 2;
var rya = cagir("KS_easeScan", {});
cagir("KS_easeBake", { target: hedef(rya.props[0]), items: [plan(rya.props[0])] });
var ipYA = [{ nodeId: "nYA", compIdx: 0, propIdx: 1, t0: 1, t1: 3 }];
function ciftYA(ph) { playhead = ph; return cagir("KS_easeScan", { ipuclari: ipYA }).props[0].pair; }
var yaB = ciftYA(3), yaB2 = ciftYA(3.01), yaIc = ciftYA(2.98);
ok("ipucu yarı açık: playhead B'de ve B + 0,25 karede çift B → C (kayıtlı değil); içeride kayıt çifti", yaB.t0 === 3 && yaB.t1 === 5 && !yaB.kayitli && yaB2.t0 === 3 && yaB2.t1 === 5 &&
  yaIc.t0 === 1 && yaIc.t1 === 3 && yaIc.kayitli === true, js([yaB, yaB2, yaIc]));
YA.olcek.keys = YA.olcek.keys.filter(function (k) { return k.s !== 5; });
var yaSon = ciftYA(3);
ok("ipucu: B son anahtarsa playhead B'deyken kayıt çifti kalır (son anahtarda bir önceki çift)", yaSon.t0 === 1 && yaSon.t1 === 3 && yaSon.kayitli === true, js(yaSon));

// kapsam: playhead altında klip yoksa saran boşluk; playhead modunda üst katman klipleriyle kırpılır
var BASE = klip({ nodeId: "nBase", ad: "Base.mp4", start: 0, end: 20, inP: 0, outP: 20, olcek: [[2, 100], [18, 150]] });
var OVR = klip({ nodeId: "nOvr", ad: "Overlay.png", start: 5, end: 8, inP: 0, outP: 3, opak: [[0.5, 0], [2.5, 100]] });
var SON = klip({ nodeId: "nSon", ad: "Son.mp4", start: 30, end: 40, inP: 0, outP: 10 });
izKur([[BASE, SON], [OVR]]);
secim = [];
playhead = 2;
var kp1 = cagir("KS_easeScan", {});
playhead = 10;
var kp2 = cagir("KS_easeScan", {});
playhead = 25;
var kp3 = cagir("KS_easeScan", {});
playhead = 45;
var kp4 = cagir("KS_easeScan", {});
ok("kapsam, playhead modu: alt katmandaki klip üst katman klibinin başında / sonunda kırpılır", kp1.kaynak === "playhead" && kp1.klipler[0].nodeId === "nBase" && js(kp1.kapsam) === js([0, 5]) &&
  kp2.klipler[0].nodeId === "nBase" && js(kp2.kapsam) === js([8, 20]), js([kp1.kapsam, kp2.kapsam]));
ok("kapsam, klip yok: playhead'i saran boşluk (bir klibe girince yeniden taranır); sekans sonunda açık uç", kp3.kaynak === "yok" && js(kp3.kapsam) === js([20, 30]) &&
  kp4.kaynak === "yok" && kp4.kapsam[0] === 40 && kp4.kapsam[1] > 1e8, js([kp3.kapsam, kp4.kapsam]));

// 400'den uzun canlı kayıt: ipucuyla çift ve kaydın tüm anahtarları gider (pencere kaydı kapsar)
var UZ = klip({ nodeId: "nUZ", ad: "Uzun2.mp4", start: 0, end: 40, inP: 0, outP: 40, olcek: [[2, 100], [26, 300]] });
izKur([[UZ]]);
playhead = 14;
var ruz = cagir("KS_easeScan", {});
var buz = cagir("KS_easeBake", { target: hedef(ruz.props[0]), items: [plan(ruz.props[0])] });
var ruz2 = cagir("KS_easeScan", { ipuclari: [{ nodeId: "nUZ", compIdx: 0, propIdx: 1, t0: 2, t1: 26 }] });
var puz = ruz2.props[0];
ok("400'den uzun kayıt (599 iç anahtar): ipucuyla çift kaydın uçları, anahtarlar iki ucu ve tüm iç anahtarları içerir", buz.records[0].times.length === 599 && puz.kesik === true &&
  puz.pair && puz.pair.t0 === 2 && puz.pair.t1 === 26 && puz.pair.kayitli === true && puz.keys.indexOf(2) !== -1 && puz.keys.indexOf(26) !== -1 &&
  puz.v0 === 100 && puz.v1 === 300 && ruz2.kapsam[0] <= 2 && ruz2.kapsam[1] >= 26, js([puz.keys.length, puz.pair, ruz2.kapsam]));
var KRm = require(path.join(ROOT, "js", "key-records.js"));
ok("400'den uzun kayıt: dönen anahtarlarla kayıt canlı (panel 'Suflo eğrisi' ve satır Geri al'ı gösterir)", KRm.canli(buz.records[0], puz.keys, 25), puz.keys.length);
UZ.olcek.keys.push({ s: 30, v: 50 });   // B artık son anahtar değil
playhead = 26;
var ruz3 = cagir("KS_easeScan", { ipuclari: [{ nodeId: "nUZ", compIdx: 0, propIdx: 1, t0: 2, t1: 26 }] });
ok("400'den uzun kayıt, playhead B'de: çift B → sonraki; kapsam B'de başlar (geri, kaydın içine girince tam kayıtla yeniden taranır)",
  ruz3.props[0].pair && ruz3.props[0].pair.t0 === 26 && ruz3.props[0].pair.t1 === 30 && ruz3.kapsam[0] === 26, js([ruz3.props[0].pair, ruz3.kapsam]));

// degistir + eski: kullanıcının kayıtlı aralığa eklediği anahtar sessizce silinmez
var DG = klip({ nodeId: "nDG", start: 0, end: 10, inP: 0, outP: 10, olcek: [[1, 100], [3, 200]] });
izKur([[DG]]);
playhead = 2;
var rdg = cagir("KS_easeScan", {});
var kayitDG = cagir("KS_easeBake", { target: hedef(rdg.props[0]), items: [plan(rdg.props[0], E.builtin("yumusak").curve, 4)] }).records[0];
DG.olcek.keys.push({ s: 2.02, v: 42 });
var rdg2 = cagir("KS_easeScan", { ipuclari: [{ nodeId: "nDG", compIdx: 0, propIdx: 1, t0: 1, t1: 3 }] });
var yeniDG = plan(rdg2.props[0], E.builtin("dogrusal").curve, 1); yeniDG.degistir = true; yeniDG.eski = kayitDG.times;
var dgOnce = DG.olcek.keys.length;
var bdg = cagir("KS_easeBake", { target: hedef(rdg2.props[0]), items: [yeniDG] });
ok("yeniden uygulama (degistir + eski): kullanıcının araya eklediği anahtar varsa reddedilir, hiçbir şey silinmez", bdg.sonuclar[0].kod === "icAnahtar" && bdg.sonuclar[0].ic === 1 &&
  DG.olcek.keys.length === dgOnce && DG.olcek.bul(2.02).v === 42, js(bdg.sonuclar));
DG.olcek.keys = DG.olcek.keys.filter(function (k) { return k.s !== 2.02; });
var bdg2 = cagir("KS_easeBake", { target: hedef(rdg2.props[0]), items: [yeniDG] });
ok("yeniden uygulama (degistir + eski): yalnız Suflo'nun eski anahtarları silinir, yeni eğri yazılır", bdg2.sonuclar[0].ok && bdg2.sonuclar[0].silinen === kayitDG.times.length &&
  DG.olcek.keys.length === 2 + yeniDG.keys.length, js(bdg2.sonuclar));

// setValueAtKey reddederse eklenen anahtar kaldırılır (kayıtsız Suflo anahtarı kalmaz)
var RJ = klip({ nodeId: "nRJ", start: 0, end: 10, inP: 0, outP: 10, olcek: [[1, 0], [2, 100]] });
var asilYaz = RJ.olcek.setValueAtKey;
RJ.olcek.setValueAtKey = function (t, v, ui) { if (typeof v === "number" && v < 0) throw new Error("negatif"); return asilYaz.call(this, t, v, ui); };
izKur([[RJ]]);
playhead = 1.5;
var rrj = cagir("KS_easeScan", {});
var prj = plan(rrj.props[0], E.builtin("geri-cekil").curve, 1);
var negatif = prj.keys.filter(function (k) { return k.v < 0; }).length;
var brj = cagir("KS_easeBake", { target: hedef(rrj.props[0]), items: [prj] });
ok("setValueAtKey reddedince eklenen anahtar silinir: özellikte yalnız uçlar + kayıttakiler, kod 'eksik'", negatif > 0 && brj.sonuclar[0].ok && brj.sonuclar[0].kod === "eksik" &&
  brj.records[0].times.length === prj.keys.length - negatif && RJ.olcek.keys.length === 2 + brj.records[0].times.length && RJ.olcek.keys.every(function (k) { return k.v >= 0; }),
  js([negatif, prj.keys.length, brj.records[0].times.length, RJ.olcek.keys.length]));

// Opaklık Premiere'in dilinden bağımsız tanınır (bileşen matchName + bileşenle aynı adlı parametre); host da 0..100 kırpar
var DE = klip({ nodeId: "nDE", start: 0, end: 10, inP: 0, outP: 10, opak: [[1, 0], [3, 100]], bulanik: [[1, 0], [3, 50]] });
DE.opak.displayName = "Deckkraft";
DE.components[1].displayName = "Deckkraft";
izKur([[DE]]);
playhead = 2;
var rde = cagir("KS_easeScan", {});
var ode = rde.props.filter(function (p) { return p.compIdx === 1; })[0], bde = rde.props.filter(function (p) { return p.compIdx === 2; })[0];
ok("Almanca Premiere: 'Deckkraft' Opaklık sayılır (opak), başka efektin parametresi sayılmaz", ode && ode.opak === true && bde && bde.opak === false, js([ode && ode.label, ode && ode.opak, bde && bde.opak]));
var tasan = plan(ode, E.builtin("tasma").curve); tasan.keys = tasan.keys.map(function (k) { return { t: k.t, v: k.v * 1.2 }; });   // panel kırpmasa da
cagir("KS_easeBake", { target: hedef(ode), items: [tasan] });
ok("host Opaklık değerlerini 0..100'e kırpar", DE.opak.keys.length === 2 + tasan.keys.length && DE.opak.keys.every(function (k) { return k.v >= 0 && k.v <= 100; }), js(DE.opak.keys.map(function (k) { return k.v; })).slice(0, 120));
DE.opak.displayName = "Maskenausweitung";
ok("Opaklık bileşeninde başka adlı parametre (maske) opak sayılmaz", cagir("KS_easeScan", {}).props.filter(function (p) { return p.compIdx === 1; })[0].opak === false);
secim = [];

/* ---------- 8) yoklama: kfInterp ---------- */
izKur([[A]]);
var pr = cagir("KS_apiProbe");
ok("probe: kfInterp var (setInterpolationTypeAtKey), çağrılmadı", pr.ok && pr.kfInterp === true && A.konum.interp.length === 49, js({ kf: pr.kfInterp, n: A.konum.interp.length }));

/* ---------- 9) temiz oda ---------- */
var host = fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8");
var bolum = host.slice(host.indexOf("Egri (3.4 adim 10)"));
ok("temiz oda: lisanssız kaynağın adı / tablosu yok", bolum.length > 1000 && !new RegExp("open" + "curve", "i").test(host) && !new RegExp("PARAM" + "_NAMES").test(host));
// BOM'suz host.jsx sistem kod sayfasıyla okunabilir: Eğri bölümünde ASCII dışı bayt yok (\u kaçışı; KS_presetProps gibi)
var asciiDisi = bolum.match(/[^\x00-\x7F]/g) || [];
ok("Eğri bölümü yalnız ASCII (etiketler \\u kaçışıyla), tablo yine Türkçe etiket döner", asciiDisi.length === 0 && ctx.KS_EASE_ADLAR["scale"] === "Ölçek" &&
  ctx.KS_EASE_ADLAR["bağlantı noktası"] === "Bağlantı noktası" && ctx.KS_easeEtiket({ matchName: "AE.ADBE Opacity", displayName: "Opacity" }, { displayName: "Opaklık" }).label === "Opaklık", js(asciiDisi.slice(0, 5)));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
