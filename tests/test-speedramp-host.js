// Suflo testi: Hız Rampası host işlevleri (sahte Premiere + sahte QE) — KS_speedRampTargets,
// KS_applySpeedRamp, KS_removeSpeedRamp, kalibrasyon merdiveni, geri yükleme, sabit ayak izi.
// Sahte setSpeed araştırmadaki davranışı taklit eder: 26.x oran birimi ve 5 argüman ister, eski
// sürüm yüzde birimi; hızlanmada süre tam kareye yukarı yuvarlanır ve hız span/süre olur;
// yavaşlamada süre korunur, kaynak kırpılır; seçili klipte 'invalid trackitem'.
var fs = require("fs"), path = require("path"), vm = require("vm");
var S = require(path.join(__dirname, "..", "js", "speedramp.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 320) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

var TPS = 254016000000;
var ortam = null, TOPLAM_REVERSE = 0, TOPLAM_SETREVERSE = 0;
function sifirla(o) {
  o = o || {};
  if (ortam) { TOPLAM_REVERSE += ortam.reverseOkundu; TOPLAM_SETREVERSE += ortam.setReverse; }
  ortam = { fr: o.fr || 1 / 25, surum: o.surum || "26", yutucu: !!o.yutucu, undo: 0, setSpeed: 0, razor: [], endYazma: 0, disYazma: 0,
    reverseOkundu: 0, setReverse: 0, interp: [], unlink: 0, link: 0, hataBas: o.hataBas || 0, kotuKlip: null, onceKanca: o.onceKanca || null,
    setSpeedYok: !!o.setSpeedYok, videoRazorBozuk: !!o.videoRazorBozuk, unlinkYok: !!o.unlinkYok, linkedApi: !!o.linkedApi, disabledSalt: !!o.disabledSalt, cagriArg: [] };
}

function zaman(sn) { return { seconds: sn, ticks: String(Math.round(sn * TPS)) }; }
function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", {
  get: function () { return String(Math.round(this.seconds * TPS)); },
  set: function (v) { this.seconds = Number(v) / TPS; }
});
// En kötü durum: getFormatted KIRPAR (29.97'de n·kare float olarak n−ε olursa bir kare erken düşer)
FakeTime.prototype.getFormatted = function (kare) { return String(Math.floor(this.seconds / kare.seconds)) + "f"; };

var nodeSayac = 0;
function Klip(o) {
  var c = this;
  c._s = o.s; c._e = o.e; c._in = o.inp || 0; c._v = o.v || 1; c._yol = o.yol === undefined ? "C:\\cekim\\K.mov" : o.yol;
  c._dur = o.dur === undefined ? 1e6 : o.dur; c._tur = o.tur || "v"; c._sel = false; c._d = !!o.d; c._rev = !!o.rev; c._bag = [];
  c._interp = null; c._remap = o.remap || 0; c.nodeId = "n" + (++nodeSayac); c.name = o.ad || "Klip";
  if (o.grafik) c.projectItem = null;
  else c.projectItem = { getMediaPath: function () { return c._yol; } };
  if (o.mgt) c.isMGT = function () { return true; };
  if (o.multicam) c.projectItem.isMulticamClip = function () { return true; };
  var comps = o.comps || [{ matchName: "AE.ADBE Opacity", displayName: "Opacity" }, { matchName: "AE.ADBE Motion", displayName: "Motion" }];
  c.components = { numItems: comps.length };
  comps.forEach(function (x, i) { c.components[i] = x; });
  if (ortam.linkedApi) c.getLinkedItems = function () { var col = { numItems: c._bag.length }; c._bag.forEach(function (b, i) { col[i] = b; }); return col; };
}
Object.defineProperty(Klip.prototype, "start", { get: function () { return zaman(this._s * ortam.fr); } });
Object.defineProperty(Klip.prototype, "inPoint", { get: function () { return zaman(this._in); } });
Object.defineProperty(Klip.prototype, "outPoint", { get: function () { return zaman(this._in + (this._e - this._s) * ortam.fr * this._v + this._remap); } });
Object.defineProperty(Klip.prototype, "end", {
  get: function () { return zaman(this._e * ortam.fr); },
  set: function (t) {
    var c = this;
    ortam.endYazma++;
    if (ortam.yutucu && !c._yutuldu) { c._yutuldu = true; return; }   // ilk end yazımını yutan sürüm
    var eski = c._e;
    var yeni = Math.max(c._s + 1, Math.round(Number(t.seconds) / ortam.fr));
    if (yeni > c._e) {
      var izk = c._iz._k, sonraki = izk[izk.indexOf(c) + 1];
      if (sonraki) yeni = Math.min(yeni, sonraki._s);
      var medyaSonu = c._s + Math.floor((c._dur - c._in) / (ortam.fr * c._v) + 1e-6);
      yeni = Math.max(c._e, Math.min(yeni, medyaSonu));
    }
    c._e = yeni;
    // bağlı (koparılmamış) karşı tür öğe aynı uçtaysa birlikte kırpılır/uzar
    c._bag.forEach(function (a) { if (a._tur !== c._tur && a._e === eski) a._e = Math.max(a._s + 1, yeni); });
  }
});
Object.defineProperty(Klip.prototype, "disabled", {
  get: function () { return this._d; },
  set: function (v) { ortam.disYazma++; if (!ortam.disabledSalt) this._d = !!v; }
});
Klip.prototype.getSpeed = function () { return this._v; };
Klip.prototype.isSpeedReversed = function () { return this._rev ? 1 : 0; };
Klip.prototype.setSelected = function (b) { this._sel = !!b; };
Klip.prototype.isSelected = function () { return this._sel; };
Klip.prototype.remove = function (ripple) {
  var izk = this._iz._k, i = izk.indexOf(this);
  if (i < 0) return;
  var boy = this._e - this._s;
  izk.splice(i, 1);
  if (ripple) for (var j = i; j < izk.length; j++) { izk[j]._s -= boy; izk[j]._e -= boy; }
  ortam.undo++;
};

function Iz(ad, klipler, o) {
  var t = this;
  t.name = ad; t._k = []; t._kilit = !!(o && o.kilit);
  (klipler || []).forEach(function (k) { t.ekle(k); });
}
Iz.prototype.ekle = function (k) { k._iz = this; this._k.push(k); this._k.sort(function (a, b) { return a._s - b._s; }); return k; };
Object.defineProperty(Iz.prototype, "clips", { get: function () { var col = { numItems: this._k.length }; this._k.forEach(function (k, i) { col[i] = k; }); return col; } });
Iz.prototype.isLocked = function () { return this._kilit; };
Iz.prototype.isMuted = function () { return false; };
function izler(liste) { var o = { numTracks: liste.length }; liste.forEach(function (t, i) { o[i] = t; }); return o; }

// QE razor: o katmandaki öğeyi kare sınırında böler; bağlar iki parçada da kalır
function bol(iz, f) {
  for (var i = 0; i < iz._k.length; i++) {
    var k = iz._k[i];
    if (f > k._s && f < k._e) {
      var y = new Klip({ s: f, e: k._e, inp: k._in + (f - k._s) * ortam.fr * k._v, v: k._v, yol: k._yol, dur: k._dur, tur: k._tur, ad: k.name, d: k._d, rev: k._rev });
      y._interp = k._interp; y.components = k.components; y.projectItem = k.projectItem;
      y._bag = k._bag.slice();
      k._bag.forEach(function (a) { if (a._bag.indexOf(y) < 0) a._bag.push(y); });
      k._e = f;
      y._iz = iz;
      iz._k.splice(i + 1, 0, y);
      ortam.undo++;
      return true;
    }
  }
  return false;
}

function hizYaz(k, args) {
  ortam.setSpeed++;
  ortam.cagriArg.push(args.length);
  if (ortam.onceKanca) { var kanca = ortam.onceKanca; ortam.onceKanca = null; kanca(k); }
  if (k._sel) throw new Error("invalid trackitem");
  if (ortam.hataBas && ortam.setSpeed === ortam.hataBas) ortam.kotuKlip = k;
  if (ortam.kotuKlip === k) throw new Error("General error (enjekte)");
  if (ortam.surum === "26" && args.length < 5) throw new Error("Not Enough Parameters");
  ortam.undo++;
  var oran = Number(args[0]);
  var yeni = ortam.surum === "26" ? oran : oran / 100;
  yeni = Math.max(0.0001, Math.min(100, yeni));
  var span = (k._e - k._s) * ortam.fr * k._v;
  if (yeni > k._v + 1e-12) {
    var sure = Math.max(1, Math.ceil(span / (yeni * ortam.fr) - 1e-9));
    k._e = k._s + sure;
    k._v = span / (sure * ortam.fr);
  } else k._v = yeni;
}

function qeOge(k) {
  var o = { type: "Clip", name: k.name, start: { secs: k._s * ortam.fr, ticks: String(Math.round(k._s * ortam.fr * TPS)) },
    end: { secs: k._e * ortam.fr, ticks: String(Math.round(k._e * ortam.fr * TPS)) } };
  Object.defineProperty(o, "reverse", { get: function () { ortam.reverseOkundu++; throw new Error("QE .reverse okundu (26.3.2'de betiği öldürür)"); } });
  o.setReverse = function () { ortam.setReverse++; throw new Error("setReverse çağrıldı"); };
  if (!ortam.setSpeedYok) o.setSpeed = function () { return hizYaz(k, arguments); };
  o.setTimeInterpolationType = function (n) { k._interp = n; ortam.interp.push(n); };
  o.setFrameBlend = function (b) { k._blend = !!b; };
  return o;
}
// QE katmanı: boşluklar "Empty" öğe olarak araya girer (DOM dizini ≠ QE dizini)
function qeIz(iz) {
  var ogeler = [], t = 0;
  iz._k.forEach(function (k) {
    if (k._s > t) ogeler.push({ type: "Empty", start: { secs: t * ortam.fr }, end: { secs: k._s * ortam.fr } });
    ogeler.push(qeOge(k));
    t = k._e;
  });
  return { numItems: ogeler.length, getItemAt: function (j) { return ogeler[j]; },
    razor: function (tc) { ortam.razor.push(String(tc)); if (ortam.videoRazorBozuk && iz.name.charAt(0) === "V") return; bol(iz, Number(String(tc).replace(/f$/, ""))); } };
}

var sekanslar = [], aktif = null;
function tumKlipler(s) {
  var out = [];
  s._v.concat(s._a).forEach(function (t) { t._k.forEach(function (k) { out.push(k); }); });
  return out;
}
function sekansYap(id, v, a, o) {
  o = o || {};
  var s = { sequenceID: id, name: "Kurgu " + id, timebase: String(Math.round(ortam.fr * TPS)), end: String(Math.round(600 * TPS)), _v: v, _a: a,
    _in: o.inF === undefined ? 0 : o.inF, _out: o.outF === undefined ? 15000 : o.outF, _ph: o.phF || 0 };
  s.videoTracks = izler(v); s.audioTracks = izler(a);
  s.getSettings = function () { return { videoDisplayFormat: 100 }; };
  s.getSelection = function () { return tumKlipler(s).filter(function (k) { return k._sel; }); };
  s.getPlayerPosition = function () { return zaman(s._ph * ortam.fr); };
  s.getInPointAsTime = function () { return zaman(s._in * ortam.fr); };
  s.getOutPointAsTime = function () { return zaman(s._out * ortam.fr); };
  if (!ortam.unlinkYok) s.unlinkSelection = function () {
    ortam.unlink++;
    var sec = s.getSelection();
    sec.forEach(function (k) { k._bag = k._bag.filter(function (b) { return sec.indexOf(b) < 0; }); });
  };
  s.linkSelection = function () {
    ortam.link++;
    var sec = s.getSelection();
    sec.forEach(function (k) { sec.forEach(function (b) { if (b !== k && b._tur !== k._tur && k._bag.indexOf(b) < 0) k._bag.push(b); }); });
  };
  s.clone = function () {
    var esle = new Map();
    function kopyaIz(t) {
      return new Iz(t.name, t._k.map(function (k) {
        var y = new Klip({ s: k._s, e: k._e, inp: k._in, v: k._v, yol: k._yol, dur: k._dur, tur: k._tur, ad: k.name, d: k._d, rev: k._rev, remap: k._remap });
        y.components = k.components; y.projectItem = k.projectItem;
        esle.set(k, y);
        return y;
      }), { kilit: t._kilit });
    }
    var nv = s._v.map(kopyaIz), na = s._a.map(kopyaIz);
    esle.forEach(function (y, k) { y._bag = k._bag.map(function (b) { return esle.get(b); }); });
    var kid = id + "-kopya";
    var kop = sekansYap(kid, nv, na, { inF: s._in, outF: s._out, phF: s._ph });
    sekanslar.push(kop);
    proje.sequences = koleksiyon();
  };
  return s;
}
function koleksiyon() { var o = { numSequences: sekanslar.length }; sekanslar.forEach(function (s, i) { o[i] = s; }); return o; }
var proje = { openSequence: function (id) { sekanslar.forEach(function (s) { if (s.sequenceID === id) aktif = s; }); } };
Object.defineProperty(proje, "activeSequence", { get: function () { return aktif; }, set: function (v) { aktif = v; } });

var qe = { project: {
  getActiveSequence: function () {
    var s = aktif;
    return { numVideoTracks: s._v.length, numAudioTracks: s._a.length,
      getVideoTrackAt: function (i) { return qeIz(s._v[i]); }, getAudioTrackAt: function (i) { return qeIz(s._a[i]); } };
  },
  undoStackIndex: function () { return ortam.undo; }
} };

var ctx = { app: { version: "26.0.0", project: proje, enableQE: function () {} }, qe: qe, $: { sleep: function () {} },
  Time: FakeTime, File: function () {}, Folder: function () {},
  decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, Date: Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
function call(fn, arg) { return JSON.parse(arg === undefined ? ctx[fn]() : ctx[fn](encodeURIComponent(JSON.stringify(arg)))); }

/*
 * Sahne: V1 [A 0–50] [K 50–50+n] [B 50+n–50+n+40]; A1 K'nin bağlı sesi (aynı medya, aynı hiza),
 * A1'de A ve B'nin sesleri; A2 boyunca müzik. K'nin kaynağı inp = 10 sn'den başlar.
 */
var sahneSayac = 0;
function sahne(o) {
  o = o || {};
  sifirla(o);
  var n = o.n || 100, fr = ortam.fr, inp = o.inp === undefined ? 10 : o.inp;
  var tutamakSn = o.tutamak === undefined ? 30 : o.tutamak;   // klibin Out'undan sonra medya
  var kDur = inp + n * fr + tutamakSn;
  var A = new Klip({ s: 0, e: 50, inp: 0, yol: "C:\\cekim\\A.mov", ad: "A" });
  var kYol = o.yol === undefined ? "C:\\cekim\\K.mov" : o.yol;
  var K = new Klip({ s: 50, e: 50 + n, inp: inp, yol: kYol, dur: kDur, ad: "Kahraman.mov", v: o.hiz || 1, rev: o.rev, mgt: o.mgt,
    grafik: o.grafik, multicam: o.multicam, remap: o.remap, comps: o.comps });
  var B = new Klip({ s: 50 + n, e: 90 + n, inp: 5, yol: "C:\\cekim\\B.mov", ad: "B" });
  var KS = new Klip({ s: 50, e: 50 + n, inp: inp, yol: kYol, dur: kDur, tur: "a", ad: "Kahraman.mov" });
  var AS = new Klip({ s: 0, e: 50, inp: 0, yol: "C:\\cekim\\A.mov", tur: "a" }), BS = new Klip({ s: 50 + n, e: 90 + n, inp: 5, yol: "C:\\cekim\\B.mov", tur: "a" });
  if (!o.bagsiz) { K._bag = [KS]; KS._bag = [K]; }
  A._bag = [AS]; AS._bag = [A]; B._bag = [BS]; BS._bag = [B];
  var muzik = new Klip({ s: 0, e: 600, inp: 0, yol: "C:\\muzik\\sarki.wav", tur: "a" });
  var v1 = new Iz("V1", [A, K, B], { kilit: o.kilit }), v2 = new Iz("V2", o.v2 || []);
  var a1 = new Iz("A1", o.sessiz ? [AS, BS] : [AS, KS, BS]), a2 = new Iz("A2", [muzik]);
  var s = sekansYap("s" + (++sahneSayac), [v1, v2], [a1, a2], { inF: o.inF, outF: o.outF, phF: o.phF });
  sekanslar.push(s); proje.sequences = koleksiyon();
  aktif = s;
  return { s: s, K: K, A: A, B: B, KS: KS, n: n, fr: fr, inp: inp };
}
function hedef(z) { return { track: 0, start: z.K._s * z.fr, end: z.K._e * z.fr, mediaPath: z.K._yol }; }
function planla(id, o, c) { return S.hostPlan(S.plan(id, o, c)); }
function uygula(z, pl, ek) {
  var a = { target: hedef(z), range: { start: z.K._s * z.fr, end: z.K._e * z.fr }, plan: pl, audio: "mute", interp: { slow: 1, fast: 0 } };
  for (var k in ek || {}) a[k] = ek[k];
  return call("KS_applySpeedRamp", a);
}
// Derin anlık görüntü: her klibin konumu, kaynağı, hızı, durumu, bağları + sayaçlar
function foto() {
  return js({ seq: aktif.sequenceID, seqSay: sekanslar.length, iz: aktif._v.concat(aktif._a).map(function (t) {
    return t._k.map(function (k) { return [k.nodeId, k._s, k._e, +k._in.toFixed(6), +k._v.toFixed(6), k._d, k._sel, k._interp, k._bag.map(function (b) { return b.nodeId; }).sort().join("|")]; });
  }), sayac: [ortam.setSpeed, ortam.razor.length, ortam.endYazma, ortam.disYazma, ortam.unlink, ortam.link, ortam.undo] });
}
function parcalar(z, a, b) { return aktif._v[0]._k.filter(function (k) { return k._s >= a && k._s < b; }); }
function kaynakSonu(k) { return k._in + (k._e - k._s) * ortam.fr * k._v; }
function bitisikMi(ps, a, b) { if (!ps.length || ps[0]._s !== a || ps[ps.length - 1]._e !== b) return false; for (var i = 1; i < ps.length; i++) if (ps[i]._s !== ps[i - 1]._e) return false; return true; }

/* ---------- 1) tüm klip, balanced, 25p ---------- */
var z = sahne({ n: 100 });
var A0 = [z.A._s, z.A._e, z.A._in], B0 = [z.B._s, z.B._e, z.B._in];
var p1 = S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25 });
var r1 = uygula(z, S.hostPlan(p1));
var ps1 = parcalar(z, 50, 150);
ok("1) balanced: başarılı, plandaki N parça T0'dan T1'e bitişik", r1.ok && r1.pieces === p1.segments.length && ps1.length === p1.segments.length && bitisikMi(ps1, 50, 150), js(r1));
ok("1) parça süreleri plandaki d'ler (tam kare)", js(ps1.map(function (k) { return k._e - k._s; })) === js(p1.segments.map(function (g) { return g.d; })));
ok("1) hızlar planın %5'i içinde", ps1.every(function (k, i) { return Math.abs(k._v - p1.segments[i].v) / p1.segments[i].v <= 0.05; }), js(ps1.map(function (k) { return +k._v.toFixed(4); })));
ok("1) kaynak sonu srcIn + L'ye 1 kare içinde (ses T1'de senkron)", Math.abs(kaynakSonu(ps1[ps1.length - 1]) - (10 + 4)) <= z.fr && r1.srcErr <= 1, kaynakSonu(ps1[ps1.length - 1]) + " srcErr " + r1.srcErr);
ok("1) komşular (A, B) yerinde, sonraki klip kaymadı", js([z.A._s, z.A._e, z.A._in]) === js(A0) && js([z.B._s, z.B._e, z.B._in]) === js(B0) && aktif._v[0]._k[aktif._v[0]._k.length - 1] === z.B);
var a1Parca = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("1) bağlı ses kapatıldı (silinmedi), bağı koptu", a1Parca.length === 1 && a1Parca[0]._d === true && a1Parca[0]._s === 50 && a1Parca[0]._e === 150 &&
  !a1Parca[0]._bag.some(function (b) { return b._tur === "v"; }) && ortam.unlink === 1 && r1.record.audio.length === 1 && r1.record.unlinked === true, js(r1.record));
ok("1) müzik ve diğer sesler dokunulmadı", aktif._a[1]._k.length === 1 && aktif._a[1]._k[0]._e === 600 && !aktif._a[1]._k[0]._d && aktif._a[0]._k.filter(function (k) { return k._d; }).length === 1);
ok("1) yavaş parçalara kare harmanlama, %100 civarına 0", ps1.every(function (k, i) { var v = p1.segments[i].v; return k._interp === (v < 0.98 ? 1 : v > 1.02 ? 0 : 0); }), js(ps1.map(function (k) { return k._interp; })));
ok("1) kayıt: t0/t1/srcIn/mod, kalibrasyon ve parçalar seçili", r1.record.t0 === 2 && r1.record.t1 === 6 && r1.record.srcIn === 10 && r1.record.mode === "balanced" &&
  r1.cal.units === "ratio" && r1.cal.sig === "5" && ps1.every(function (k) { return k._sel; }) && r1.undoSteps > 0, js(r1.cal) + " " + r1.undoSteps);
ok("1) 26.x: tüm setSpeed çağrıları 5 argümanlı", ortam.cagriArg.length > 0 && ortam.cagriArg.every(function (n) { return n === 5; }), js(ortam.cagriArg));

/* ---------- 2) In/Out kısmi aralık ---------- */
z = sahne({ n: 200, inF: 100, outF: 180, linkedApi: true });
var hd = call("KS_speedRampTargets", { range: "inout" });
var t2 = hd.targets && hd.targets[0];
ok("2) hedef: In/Out'u kapsayan klip, kısmi, srcIn aralığın kaynağı", hd.ok && hd.targets.length === 1 && t2.partial === true && Math.abs(t2.rangeStart - 4) < 1e-9 &&
  Math.abs(t2.rangeEnd - 7.2) < 1e-9 && Math.abs(t2.srcIn - (10 + 2)) < 1e-9 && t2.hasLinked && t2.audio.length === 1 && hd.caps.setSpeed === true && hd.caps.unlink === true, js(hd));
var p2 = S.plan("darbe", {}, S.clipFor(t2, hd.frame, {}));
var r2 = call("KS_applySpeedRamp", { target: { track: t2.track, start: t2.start, end: t2.end, mediaPath: t2.mediaPath }, range: { start: t2.rangeStart, end: t2.rangeEnd },
  plan: S.hostPlan(p2), audio: "mute", interp: { slow: 1, fast: 0 }, expectSeqId: hd.seqId });
var sol = aktif._v[0]._k.filter(function (k) { return k._s === 50; })[0], sag = aktif._v[0]._k.filter(function (k) { return k._s === 180; })[0];
ok("2) kısmi aralık balanced'a zorlanır ve uygulanır", p2.mode === "balanced" && r2.ok, js(r2));
ok("2) T0/T1'de kesildi; dış parçalar %100 ve kaynakları aynı", sol && sol._e === 100 && sol._v === 1 && sol._in === 10 && sag && sag._e === 250 && sag._v === 1 &&
  Math.abs(sag._in - (10 + 130 * 0.04)) < 1e-9 && bitisikMi(parcalar(z, 100, 180), 100, 180), js([sol && [sol._s, sol._e, sol._v], sag && [sag._s, sag._e, sag._in]]));
var ses2 = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("2) ses yalnız aralıkta kapalı; dışarısı açık ve bağlı", ses2.length === 3 && !ses2[0]._d && ses2[1]._d && !ses2[2]._d && ses2[1]._s === 100 && ses2[1]._e === 180 &&
  ses2[0]._bag.some(function (b) { return b._tur === "v"; }), js(ses2.map(function (k) { return [k._s, k._e, k._d]; })));

/* ---------- 3) exact: tutamak varken L·B tüketir; yokken tutamak + geri yükleme ---------- */
z = sahne({ n: 100, tutamak: 30 });
var p3 = S.plan("cikis", {}, { frames: 100, fps: 25, handleSec: 30 });
var r3 = uygula(z, S.hostPlan(p3));
var ps3 = parcalar(z, 50, 150);
ok("3) exact + tutamak: kaynak L·B kadar ilerler", p3.mode === "exact" && r3.ok && Math.abs(kaynakSonu(ps3[ps3.length - 1]) - (10 + p3.srcFrames * 0.04)) <= 0.04 &&
  p3.srcFrames > 170 && bitisikMi(ps3, 50, 150) && z.B._s === 150, js(r3) + " " + kaynakSonu(ps3[ps3.length - 1]));
z = sahne({ n: 100, tutamak: 0 });
var once3 = [z.K._s, z.K._e, z.K._in, z.K._v];
var r3b = uygula(z, S.hostPlan(p3));
var ps3b = parcalar(z, 50, 150);
var ses3 = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("3) exact tutamaksız: kod tutamak, tek %100 klip özgün giriş/çıkışla geri geldi", !r3b.ok && r3b.kod === "tutamak" && r3b.restored === true && ps3b.length === 1 &&
  ps3b[0]._s === 50 && ps3b[0]._e === 150 && ps3b[0]._v === 1 && ps3b[0]._in === 10 && Math.abs(ps3b[0].outPoint.seconds - 14) < 1e-9 && z.B._s === 150, js(r3b) + " " + js(ps3b.map(function (k) { return [k._s, k._e, k._v, k._in]; })));
ok("3) geri yüklemede ses yeniden açıldı ve bağlandı", ses3.every(function (k) { return !k._d; }) && ortam.link === 1 && ps3b[0]._bag.some(function (b) { return b._tur === "a"; }), js(ses3.map(function (k) { return [k._s, k._e, k._d]; })));
ok("3) geri yükleme qe.project.undo'yu çağırmaz (sahte QE'de undo yok) ve once/sonra komşular aynı", typeof qe.project.undo === "undefined" && z.A._e === 50 && js(once3.slice(0, 1)) === js([50]));

/* ---------- 4) yüzde birimli Premiere ---------- */
z = sahne({ n: 100, surum: "eski" });
var r4 = uygula(z, S.hostPlan(S.plan("suzulme", { mode: "balanced" }, { frames: 100, fps: 25 })));
ok("4) yüzde birimli sürümde kalibrasyon: cal.units 'percent'", r4.ok && r4.cal.units === "percent" && bitisikMi(parcalar(z, 50, 150), 50, 150), js(r4));
z = sahne({ n: 100, surum: "eski" });
var r4b = uygula(z, S.hostPlan(S.plan("suzulme", { mode: "balanced" }, { frames: 100, fps: 25 })), { cal: r4.cal });
ok("4) önbellekteki kalibrasyon ilk denemede tutar (yanlış birim çağrısı yok)", r4b.ok && r4b.cal.units === "percent" && ortam.setSpeed <= r4b.pieces + 2 && ortam.setSpeed < r4.pieces * 2,
  ortam.setSpeed + " / " + r4b.pieces);

/* ---------- 5) setSpeed yok → qeYok, hiç değişiklik yok ---------- */
z = sahne({ n: 100, setSpeedYok: true });
var f5 = foto();
var r5 = uygula(z, S.hostPlan(p1));
ok("5) setSpeed yok: qeYok, sekans birebir aynı", !r5.ok && r5.kod === "qeYok" && foto() === f5, js(r5));

/* ---------- 6) retler: hiç değişiklik yok ---------- */
var RET = [
  ["hizli", { hiz: 0.5 }, function (r) { return r.pct === 50; }],
  ["ters", { rev: true }],
  ["grafik", { mgt: true }],
  ["grafik", { yol: "" }],
  ["grafik", { yol: "C:\\gorsel\\logo.PNG" }],
  ["kilitli", { kilit: true }],
  ["remap", { remap: 1 }],
  ["warp", { comps: [{ matchName: "AE.ADBE SubspaceStabilizer", displayName: "Warp Stabilizer" }] }],
  ["warp", { comps: [{ matchName: "x", displayName: "Sarsıntı Önleyici" }] }],
  ["multicam", { multicam: true }]
];
RET.forEach(function (x) {
  var zz = sahne(Object.assign({ n: 100 }, x[1]));
  var f = foto();
  var r = uygula(zz, S.hostPlan(p1));
  ok("6) ret " + x[0] + " " + js(x[1]).slice(0, 60) + ": değişiklik yok", !r.ok && r.kod === x[0] && foto() === f && (!x[2] || x[2](r)), js(r));
});
z = sahne({ n: 10 });
var f6 = foto(), r6 = uygula(z, { mode: "balanced", segments: [[10, 1]], srcFrames: 10 });
ok("6) ret kisa (10 kare): değişiklik yok", !r6.ok && r6.kod === "kisa" && foto() === f6, js(r6));
z = sahne({ n: 100 });
f6 = foto();
var kotuPlan = [{ mode: "balanced", segments: [[50, 1], [49, 1]], srcFrames: 99 }, { mode: "balanced", segments: [[50, 1], [50, 11]], srcFrames: 600 },
  { mode: "balanced", segments: [[50.5, 1], [49.5, 1]], srcFrames: 100 }, { mode: "balanced", segments: [], srcFrames: 0 }, { segments: "x" }];
ok("6) ret plan (yanlış toplam, sınır dışı hız, kesirli kare, boş): değişiklik yok", kotuPlan.every(function (pl) { var r = uygula(z, pl); return !r.ok && r.kod === "plan"; }) && foto() === f6);
var r6s = uygula(z, S.hostPlan(p1), { expectSeqId: "baska-sekans" });
ok("6) ret sekans (expectSeqId tutmuyor): değişiklik yok", !r6s.ok && r6s.kod === "sekans" && foto() === f6, js(r6s));
var r6d = call("KS_applySpeedRamp", { target: { track: 0, start: 2.04, end: 6, mediaPath: z.K._yol }, range: { start: 2.04, end: 6 }, plan: S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 99, fps: 25 })), audio: "mute" });
ok("6) ret degisti (klip başka yerde): değişiklik yok", !r6d.ok && r6d.kod === "degisti" && foto() === f6, js(r6d));

/* ---------- 7) unlinkSelection yok + bağlı ses → linkedConflict ---------- */
z = sahne({ n: 100, unlinkYok: true });
var f7 = foto(), r7 = uygula(z, S.hostPlan(p1));
ok("7) bağlı seste unlinkSelection yoksa linkedConflict, değişiklik yok", !r7.ok && r7.kod === "linkedConflict" && foto() === f7, js(r7));
z = sahne({ n: 100, unlinkYok: true, sessiz: true, bagsiz: true });
var r7b = uygula(z, S.hostPlan(p1));
ok("7) sesi olmayan klipte unlinkSelection gerekmez", r7b.ok && ortam.unlink === 0, js(r7b));

/* ---------- 8) 'invalid trackitem' kurtarılır ---------- */
z = sahne({ n: 100, onceKanca: function (k) { k._sel = true; } });
var r8 = uygula(z, S.hostPlan(p1));
ok("8) seçili klipte 'invalid trackitem': seçim kaldırılıp yeniden denenir", r8.ok && bitisikMi(parcalar(z, 50, 150), 50, 150) && ortam.onceKanca === null, js(r8));

/* ---------- 9) yuvarlama kayması: kapalı döngü ---------- */
var kayma = [];
[["cikis", 25, 150, {}], ["darbe", 29.97, 181, { mode: "balanced" }], ["nabiz", 23.976, 240, { mode: "balanced", density: "many" }], ["atilim", 59.94, 300, {}]].forEach(function (x) {
  var fr = x[0] === "darbe" ? 1001 / 30000 : x[0] === "nabiz" ? 1001 / 24000 : x[0] === "atilim" ? 1001 / 60000 : 1 / 25;
  var zz = sahne({ n: x[2], fr: fr, tutamak: 60 });
  var pl = S.plan(x[0], x[3], { frames: x[2], fps: 1 / fr, handleSec: 60 });
  var r = uygula(zz, S.hostPlan(pl));
  var ps = parcalar(zz, 50, 50 + x[2]);
  if (!r.ok) { kayma.push(x[0] + " başarısız " + js(r)); return; }
  var hedefSon = zz.inp + pl.srcFrames * fr;
  if (Math.abs(kaynakSonu(ps[ps.length - 1]) - hedefSon) > fr + 1e-9) kayma.push(x[0] + " kaynak " + ((kaynakSonu(ps[ps.length - 1]) - hedefSon) / fr).toFixed(3) + " kare");
  ps.forEach(function (k, i) {
    var sap = Math.abs(k._v - pl.segments[i].v) / pl.segments[i].v;
    if (sap > (i === ps.length - 1 ? 0.15 : 0.03)) kayma.push(x[0] + " parça " + i + " %" + (sap * 100).toFixed(1));
  });
});
ok("9) kapalı döngü: kaynak hatası ≤ 1 kare, parçalar %3 (son %15) içinde (25 / 29.97 / 23.976 / 59.94)", kayma.length === 0, kayma.join(" | "));

/* ---------- 10) 4. setSpeed'de enjekte hata → hizYazilamadi + geri yükleme ---------- */
z = sahne({ n: 100, hataBas: 4 });
var r10 = uygula(z, S.hostPlan(p1));
var ps10 = parcalar(z, 50, 150), ses10 = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("10) enjekte hata: hizYazilamadi, restored:true, tek %100 klip, ses açık", !r10.ok && r10.kod === "hizYazilamadi" && r10.restored === true && ps10.length === 1 &&
  ps10[0]._v === 1 && ps10[0]._e === 150 && ps10[0]._in === 10 && ses10.every(function (k) { return !k._d; }) && z.B._s === 150, js(r10) + " " + js(ps10.map(function (k) { return [k._s, k._e, k._v]; })));

/* ---------- 11) KS_removeSpeedRamp: kayıttan, seçimden; yabancı klip → degisti ---------- */
z = sahne({ n: 100 });
var r11 = uygula(z, S.hostPlan(p1));
var k11 = call("KS_removeSpeedRamp", { record: r11.record });
var ps11 = parcalar(z, 50, 150), ses11 = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("11) kayıttan kaldır: tek %100 klip, özgün giriş, ses açık ve yeniden bağlı", r11.ok && k11.ok && ps11.length === 1 && ps11[0]._v === 1 && ps11[0]._e === 150 &&
  ps11[0]._in === 10 && ses11.every(function (k) { return !k._d; }) && ps11[0]._bag.some(function (b) { return b._tur === "a"; }) && z.B._s === 150 && k11.removed === r11.pieces - 1, js(k11));
z = sahne({ n: 100 });
var r11b = uygula(z, S.hostPlan(S.plan("bukum", { mode: "balanced" }, { frames: 100, fps: 25 })));
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(z, 50, 150)[2]._sel = true;
var k11b = call("KS_removeSpeedRamp", { fromSelection: true });
var ps11b = parcalar(z, 50, 150);
ok("11) seçim geometrisinden kaldır: kayıtsız da tek %100 klip", r11b.ok && k11b.ok && ps11b.length === 1 && ps11b[0]._v === 1 && ps11b[0]._e === 150 && ps11b[0]._in === 10 &&
  aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; }).every(function (k) { return !k._d; }), js(k11b));
z = sahne({ n: 100 });
var r11c = uygula(z, S.hostPlan(p1));
parcalar(z, 50, 150)[3].projectItem = { getMediaPath: function () { return "C:\\baska\\X.mov"; } };
var f11 = foto();
var k11c = call("KS_removeSpeedRamp", { record: r11c.record });
ok("11) aralıkta yabancı klip: degisti, hiçbir şey değişmez", !k11c.ok && k11c.kod === "degisti" && foto() === f11, js(k11c));
z = sahne({ n: 100 });
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
z.K._sel = true;
var k11d = call("KS_removeSpeedRamp", { fromSelection: true });
ok("11) %100 klipte seçimden kaldır: secimYok", !k11d.ok && k11d.kod === "secimYok", js(k11d));

/* ---------- 12) cloneFirst + expectSeqId ---------- */
z = sahne({ n: 100 });
var ozgun = aktif, ozgunFoto = foto();
var r12 = uygula(z, S.hostPlan(p1), { cloneFirst: true, cloneName: "Kurgu - Suflo Rampa" });
ok("12) cloneFirst: kopya oluşturulup etkinleştirildi, rampa kopyada", r12.ok && aktif !== ozgun && aktif.name === "Kurgu - Suflo Rampa" && r12.newSeq === "Kurgu - Suflo Rampa" &&
  r12.seqId === aktif.sequenceID && r12.record.seqId === aktif.sequenceID && aktif._v[0]._k.length === 2 + r12.pieces, js(r12));
var kop = aktif;
aktif = ozgun;
function izFoto() { return js(JSON.parse(foto()).iz); }
ok("12) özgün sekansa dokunulmadı", izFoto() === js(JSON.parse(ozgunFoto).iz));
aktif = kop;
var r12b = uygula({ K: kop._v[0]._k[kop._v[0]._k.length - 1], fr: 0.04 }, S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 40, fps: 25 })), { expectSeqId: kop.sequenceID });
ok("12) sonraki çağrı expectSeqId ile kopyada çalışır", r12b.ok, js(r12b));
var r12c = uygula({ K: kop._v[0]._k[0], fr: 0.04 }, S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 50, fps: 25 })), { expectSeqId: ozgun.sequenceID });
ok("12) yanlış expectSeqId: sekans", !r12c.ok && r12c.kod === "sekans", js(r12c));

/* ---------- 13) 29.97: çeyrek kare epsilon ile kesimler tam karede ---------- */
var hatali = [];
[101, 157, 233, 360].forEach(function (n) {
  var zz = sahne({ n: n, fr: 1001 / 30000, tutamak: 60 });
  var pl = S.plan("nabiz", { mode: "balanced", density: "many" }, { frames: n, fps: 30000 / 1001 });
  var r = uygula(zz, S.hostPlan(pl));
  var ps = parcalar(zz, 50, 50 + n);
  if (!r.ok) { hatali.push(n + ": " + js(r)); return; }
  var beklenen = [50];
  pl.segments.forEach(function (g) { beklenen.push(beklenen[beklenen.length - 1] + g.d); });
  if (js(ps.map(function (k) { return k._s; }).concat([ps[ps.length - 1]._e])) !== js(beklenen)) hatali.push(n + ": " + js(ps.map(function (k) { return k._s; })) + " ≠ " + js(beklenen));
});
ok("13) 29.97 timebase: kırpan getFormatted'a rağmen her kesim planlanan karede", hatali.length === 0, hatali.join(" | "));
// epsilon olmasaydı: n·kare float olarak kırpıldığında bir kare erken düşen an gerçekten var mı (testin anlamı)
var fr2997 = 1001 / 30000, erken = 0;
for (var f = 1; f < 2000; f++) { var tt = new FakeTime(); tt.seconds = f * fr2997; if (Number(tt.getFormatted({ seconds: fr2997 }).replace("f", "")) !== f) erken++; }
ok("13) sahte getFormatted gerçekten kırpıyor (epsilon'suz kesimler kayardı)", erken > 0, erken + " kare");

/* ---------- 15) video kesilemeden durulursa: video özgün, ses geri yüklenir ---------- */
z = sahne({ n: 200, inF: 100, outF: 180, videoRazorBozuk: true });
var p15 = S.plan("dalis", { mode: "balanced" }, { frames: 80, fps: 25, partial: true });
var r15 = call("KS_applySpeedRamp", { target: hedef(z), range: { start: 4, end: 7.2 }, plan: S.hostPlan(p15), audio: "mute", interp: { slow: 1, fast: 0 } });
var ses15 = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("15) video kesilemedi: yerlesim, restored:true, video özgün, ses açık ve yeniden bağlı", !r15.ok && r15.kod === "yerlesim" && r15.restored === true &&
  aktif._v[0]._k.length === 3 && z.K._s === 50 && z.K._e === 250 && z.K._v === 1 && ses15.every(function (k) { return !k._d; }) &&
  ses15.some(function (k) { return k._bag.indexOf(z.K) !== -1; }), js(r15) + " " + js(ses15.map(function (k) { return [k._s, k._e, k._d]; })));

/* ---------- 14) hedefler + tanılama: setReverse / .reverse asla ---------- */
z = sahne({ n: 100 });
aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; })[0]._sel = true;
var h14 = call("KS_speedRampTargets", { range: "clips" });
ok("14) yalnız bağlı sesi seçmek video klibe çözülür", h14.ok && h14.targets.length === 1 && h14.targets[0].start === 2 && h14.targets[0].partial === false && h14.targets[0].rangeEnd === 6, js(h14));
z = sahne({ n: 100, v2: [] });
aktif._v[1].ekle(new Klip({ s: 10, e: 40, yol: "C:\\gorsel\\logo.png", ad: "logo.png" }))._sel = true;
z.K._sel = true;
var h14b = call("KS_speedRampTargets", { range: "clips" });
ok("14) birden çok seçim: video hedef, fotoğraf atlandı (grafik)", h14b.ok && h14b.targets.length === 1 && h14b.skipped.length === 1 && h14b.skipped[0].kod === "grafik" && h14b.skipped[0].name === "logo.png", js(h14b));
z = sahne({ n: 100 });
var h14c = call("KS_speedRampTargets", { range: "clips" });
ok("14) seçim yok: secimYok", !h14c.ok && h14c.kod === "secimYok", js(h14c));
z = sahne({ n: 100, inF: 60, outF: 64 });
var h14d = call("KS_speedRampTargets", { range: "inout" });
ok("14) 12 kareden kısa In/Out: kisa olarak atlanır", h14d.ok && h14d.targets.length === 0 && h14d.skipped[0].kod === "kisa", js(h14d));
var probe = call("KS_apiProbe");
ok("14) KS_apiProbe sahte 26.x'te: setSpeed/interp/undo/unlink var, hiçbir şey çağrılmadı", probe.qeSetSpeed === true && probe.interp === true && probe.qeUndoIndex === true &&
  probe.unlinkSelection === true && probe.speedRead === true && probe.timeRemapApi === false, js(probe));
var hepsi = fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8");
ok("14) hiçbir senaryoda setReverse çağrılmadı ve QE .reverse okunmadı", TOPLAM_REVERSE + ortam.reverseOkundu === 0 && TOPLAM_SETREVERSE + ortam.setReverse === 0 && !/setReverse\s*\(|\.reverse\b(?!\w)/.test(hepsi.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "")));
ok("14) host qe.project.undo çağırmaz", !/qe\.project\.undo\s*\(/.test(hepsi));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
