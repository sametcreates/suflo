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

/* ---------- 8) yoklama: kfInterp ---------- */
izKur([[A]]);
var pr = cagir("KS_apiProbe");
ok("probe: kfInterp var (setInterpolationTypeAtKey), çağrılmadı", pr.ok && pr.kfInterp === true && A.konum.interp.length === 49, js({ kf: pr.kfInterp, n: A.konum.interp.length }));

/* ---------- 9) temiz oda ---------- */
var host = fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8");
var bolum = host.slice(host.indexOf("Egri (3.4 adim 10)"));
ok("temiz oda: lisanssız kaynağın adı / tablosu yok", bolum.length > 1000 && !new RegExp("open" + "curve", "i").test(host) && !new RegExp("PARAM" + "_NAMES").test(host));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
