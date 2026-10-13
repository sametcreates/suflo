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
    setSpeedYok: !!o.setSpeedYok, videoRazorBozuk: !!o.videoRazorBozuk, unlinkYok: !!o.unlinkYok, linkedApi: !!o.linkedApi, disabledSalt: !!o.disabledSalt, cagriArg: [], cagriDeger: [] };
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
  ortam.cagriDeger.push(Number(args[0]));
  if (ortam.onceKanca) { var kanca = ortam.onceKanca; ortam.onceKanca = null; kanca(k); }
  if (k._sel) throw new Error("invalid trackitem");
  if (ortam.hataBas && ortam.setSpeed === ortam.hataBas) ortam.kotuKlip = k;
  if (ortam.kotuKlip === k) throw new Error("General error (enjekte)");
  if (ortam.surum === "26" && args.length < 5) throw new Error("Not Enough Parameters");
  var oran = Number(args[0]);
  var yeni = ortam.surum === "26" ? oran : oran / 100;
  yeni = Math.max(0.0001, Math.min(100, yeni));
  // İsteğe bağlı: Premiere mevcut hıza çok yakın bir isteği yok sayıyormuş gibi (gerçek davranış bilinmiyor)
  if (ortam.yoksayEps && Math.abs(yeni - k._v) / k._v < ortam.yoksayEps) return;
  ortam.undo++;
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
  // Premiere Unlink: seçili her öğe TÜM bağ grubundan çıkar (yalnız seçili çiftler arasındaki bağ değil)
  if (!ortam.unlinkYok) s.unlinkSelection = function () {
    ortam.unlink++;
    var sec = s.getSelection();
    sec.forEach(function (k) { k._bag.forEach(function (b) { b._bag = b._bag.filter(function (x) { return x !== k; }); }); k._bag = []; });
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
// geri yüklemenin sözleşmesi: TAM %100 (5e-5) ve hiç %100'ün üstünde değil (üstündeyse t1'e uzatma L'den fazla kaynak ister)
function tam100(k) { return Math.abs(k._v - 1) <= 5e-5 && k._v <= 1 + 1e-9; }
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
// %100 civarı ve bulanıklık kapalıyken hızlı parçalar klibin özgün ayarında kalır (sahte klipte null)
ok("1) yavaş parçalara kare harmanlama; %100 civarı ve bulanıksız hızlı parçalara dokunulmaz", ps1.every(function (k, i) { var v = p1.segments[i].v; return k._interp === (v < 0.98 ? 1 : null); }) &&
  ps1.some(function (k) { return k._interp === null; }), js(ps1.map(function (k) { return k._interp; })));
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
var yanlis4 = ortam.cagriDeger.filter(function (x) { return x < 5; }).length;   // oran birimiyle (≤ %1000 → ≤ 10) giden çağrı
z = sahne({ n: 100, surum: "eski" });
var r4b = uygula(z, S.hostPlan(S.plan("suzulme", { mode: "balanced" }, { frames: 100, fps: 25 })), { cal: r4.cal });
// hızlanma yukarıdan yaklaşır (iki çağrı), yavaşlama tek çağrı; önbellekle hiçbir çağrı oran biriminde gitmez
ok("4) önbellekteki kalibrasyon ilk denemede tutar (yanlış birim çağrısı yok)", r4b.ok && r4b.cal.units === "percent" && yanlis4 > 0 &&
  ortam.cagriDeger.every(function (x) { return x >= 5; }) && ortam.setSpeed <= 2 * r4b.pieces + 2, ortam.setSpeed + " / " + r4b.pieces + " " + js(ortam.cagriDeger));

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
z = sahne({ n: 100, unlinkYok: true, linkedApi: true });
var f7 = foto(), r7 = uygula(z, S.hostPlan(p1));
ok("7) gerçekten bağlı seste unlinkSelection yoksa linkedConflict, değişiklik yok", !r7.ok && r7.kod === "linkedConflict" && foto() === f7, js(r7));
z = sahne({ n: 100, unlinkYok: true });
var f7c = foto(), r7c = uygula(z, S.hostPlan(p1));
ok("7) getLinkedItems da yoksa (bağ bilinmiyor) linkedBilinmiyor: 'Ctrl+L ile kopar' vaadi yok, değişiklik yok", !r7c.ok && r7c.kod === "linkedBilinmiyor" && foto() === f7c, js(r7c));
// Ctrl+L ile bağı koparılmış (getLinkedItems boş) aynı medya sesi: eskiden yine linkedConflict (çıkmaz sokak)
z = sahne({ n: 100, unlinkYok: true, linkedApi: true, bagsiz: true });
var r7d = uygula(z, S.hostPlan(p1));
var ses7d = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("7) Ctrl+L sonrası (bağsız, unlinkSelection yok): uygulanır, bağ koparılmaz, aralıktaki ses kapanır, kayıtta unlinked yok", r7d.ok && ortam.unlink === 0 &&
  r7d.record.unlinked === false && ses7d.some(function (k) { return k._d && k._s === 50 && k._e === 150; }), js(r7d));
var k7d = call("KS_removeSpeedRamp", { record: r7d.record });
ses7d = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("7) ...ve kaldırınca ses açılır, bağlanmaz (önceden de bağlı değildi)", k7d.ok && ses7d.every(function (k) { return !k._d; }) && ortam.link === 0, js(k7d));
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
// Kayıtsız ses tahmin edilmez (kullanıcı kapatmış olabilir): kapalı ses kapalı kalır, panel uyarır
ok("11) seçim geometrisinden kaldır: kayıtsız da tek %100 klip; kapalı sese dokunulmaz, sesKayitsiz uyarısı", r11b.ok && k11b.ok && ps11b.length === 1 && ps11b[0]._v === 1 && ps11b[0]._e === 150 && ps11b[0]._in === 10 &&
  aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; }).some(function (k) { return k._d; }) && k11b.audio === 0 && k11b.warnings.indexOf("sesKayitsiz") !== -1 &&
  k11b.kayit === null && ortam.link === 0, js(k11b));
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

/* ---------- 16) kaldır: ilk parça %100'ün altındaysa da tam %100 (yukarıdan yaklaşma) ---------- */
z = sahne({ n: 100 });
var p16 = S.plan("suzulme", {}, { frames: 100, fps: 25 });
var r16 = uygula(z, S.hostPlan(p16));
var k16 = call("KS_removeSpeedRamp", { record: r16.record });
var ps16 = parcalar(z, 50, 150), ses16 = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("16) Süzülme (ilk parça %" + Math.round(p16.segments[0].v * 100) + "): kaldır tam %100, özgün giriş, ses açık ve bağlı", p16.segments[0].v < 1 && r16.ok && k16.ok && ps16.length === 1 &&
  ps16[0]._v === 1 && ps16[0]._e === 150 && ps16[0]._in === 10 && ses16.every(function (k) { return !k._d; }) && ps16[0]._bag.some(function (b) { return b._tur === "a"; }),
  js(k16) + " " + js(ps16.map(function (k) { return [k._s, k._e, k._v]; })));
var kaldirHata = [];
S.list().forEach(function (pr) {
  if (pr.beats) return;
  [{ mode: "balanced" }, {}, { mode: "balanced", ease: "step" }, { mode: "balanced", k: 0.5, density: "few" }, { mode: "balanced", ease: "step", k: 0.5, density: "few" }].forEach(function (o) {
    (o.mode ? [30, 0] : [0]).forEach(function (tut) {
      var zz = sahne({ n: 100, tutamak: tut });
      var pl = S.plan(pr.id, o, { frames: 100, fps: 25, handleSec: o.mode ? null : 0 });
      var r = uygula(zz, S.hostPlan(pl));
      if (!r.ok) { kaldirHata.push(pr.id + " " + js(o) + " tutamak " + tut + " uygula " + r.kod); return; }
      var k = call("KS_removeSpeedRamp", { record: r.record });
      var ps = parcalar(zz, 50, 150);
      if (!k.ok || ps.length !== 1 || !tam100(ps[0]) || ps[0]._e !== 150 || ps[0]._in !== 10 || !bitisikMi(aktif._v[0]._k, 0, 190))
        kaldirHata.push(pr.id + " " + js(o) + " tutamak " + tut + " " + js(k) + " " + js(aktif._v[0]._k.map(function (x) { return [x._s, x._e, +x._v.toFixed(6)]; })));
    });
  });
});
ok("16) her önayar (Dengeli, Basamaklı, k 0.5 Az; tutamak 30 ve 0; tutamaksız otomatik): uygula + kaldır tam %100, iz boşluksuz", kaldirHata.length === 0, kaldirHata.length + ": " + kaldirHata.slice(0, 4).join(" | "));
// Uzun, yavaş ilk parça: yukarıdan yaklaşma onu %100'ün 5e-5 dışında ama %0,1 içinde bırakır (1.00026);
// KS_rampSetSpeed 'zaten orada' deyip çağrı yapmazsa geriAlinamadi + 2..n silinmeden boşluk kalırdı.
// Atılım 250: yaklaşma 1.000046'da (TAM içinde, %100'ün üstünde) kalırsa tutamak 0'da uç bir kare kısa kalırdı
var uzun16 = [];
[["cikis", { mode: "balanced", k: 0.5, density: "few" }, 125, 0.8284], ["cikis", { mode: "balanced", ease: "step", k: 0.5, density: "few" }, 100, 0.7752],
  ["atilim", { mode: "balanced", k: 0.5, density: "few" }, 250, 0.8716]].forEach(function (c) {
  [0, 30].forEach(function (tut) {
    var zz = sahne({ n: c[2], tutamak: tut });
    var pl = S.plan(c[0], c[1], { frames: c[2], fps: 25 });
    var r = uygula(zz, S.hostPlan(pl));
    var k = call("KS_removeSpeedRamp", { record: r.record });
    var ps = parcalar(zz, 50, 50 + c[2]);
    if (pl.segments[0].v !== c[3] || !r.ok || !k.ok || ps.length !== 1 || !tam100(ps[0]) || ps[0]._e !== 50 + c[2] || ps[0]._in !== 10 || !bitisikMi(aktif._v[0]._k, 0, 90 + c[2]))
      uzun16.push(c[0] + " " + js(c[1]) + " " + c[2] + " tutamak " + tut + " ilk v " + pl.segments[0].v + " " + js(k) + " " + js(aktif._v[0]._k.map(function (x) { return [x._s, x._e, +x._v.toFixed(6)]; })));
  });
});
ok("16) uzun yavaş ilk parça (Hızlı Çıkış k 0.5 Az, Basamaklı; Atılım 250 kare): kaldır tam %100, boşluk yok, tutamak 0 ve 30", uzun16.length === 0, uzun16.join(" | "));

/* ---------- 17) Dengeli, klibin Out'u medyanın sonu (tutamak 0): ara adım kaynağı aşmaz ---------- */
var den17 = [], hiz17 = [], kal17 = [];
S.list().forEach(function (pr) {
  if (pr.beats) return;
  [{ mode: "balanced" }, { mode: "balanced", density: "many" }, { mode: "balanced", k: 1.5 }, { mode: "balanced", ease: "linear", density: "few" },
    { mode: "balanced", ease: "step" }, { mode: "balanced", k: 0.5, density: "few" }, { mode: "balanced", ease: "step", k: 0.5, density: "few" }].forEach(function (o) {
    [25, 60, 100, 125].forEach(function (n) {
      var zz = sahne({ n: n, tutamak: 0 });
      var pl = S.plan(pr.id, o, { frames: n, fps: 25 });
      var r = uygula(zz, S.hostPlan(pl));
      if (!r.ok) { den17.push(pr.id + " " + js(o) + " " + n + " " + r.kod + (r.restored ? "" : " GERİ YÜKLENMEDİ")); return; }
      var ps = parcalar(zz, 50, 50 + n);
      if (Math.abs(kaynakSonu(ps[ps.length - 1]) - (10 + n * 0.04)) > 0.04 + 1e-9) den17.push(pr.id + " " + n + " kaynak sonu " + kaynakSonu(ps[ps.length - 1]));
      ps.forEach(function (k, i) { if (Math.abs(k._v - pl.segments[i].v) / pl.segments[i].v > (i === ps.length - 1 ? 0.15 : 0.04)) hiz17.push(pr.id + " " + n + " parça " + i); });
      var kd = call("KS_removeSpeedRamp", { record: r.record });
      var pk = parcalar(zz, 50, 50 + n);
      if (!kd.ok || pk.length !== 1 || !tam100(pk[0]) || pk[0]._e !== 50 + n || pk[0]._in !== 10 || !bitisikMi(aktif._v[0]._k, 0, 90 + n))
        kal17.push(pr.id + " " + js(o) + " " + n + " " + (kd.kod || "") + " " + js(aktif._v[0]._k.map(function (x) { return [x._s, x._e, +x._v.toFixed(6)]; })));
    });
  });
});
ok("17) Dengeli + tutamak 0: 10 önayar × 7 seçenek × 4 uzunluk hepsi başarılı, kaynak Out'ta biter", den17.length === 0, den17.length + ": " + den17.slice(0, 6).join(" | "));
ok("17) Dengeli + tutamak 0: her rampa kaldırılınca tek tam %100 klip, iz boşluksuz (Basamaklı, k 0.5 dahil)", kal17.length === 0, kal17.length + ": " + kal17.slice(0, 4).join(" | "));
ok("17) Dengeli + tutamak 0: parça hızları plana yakın (tam kare yuvarlaması yok)", hiz17.length === 0, hiz17.slice(0, 6).join(" | "));
// Premiere %100'e yavaşlatma isteğini (hız 1.00005, istek 1) yok sayarsa tam modda aynı setSpeed 8 turun
// hepsinde yeniden gönderilip geri alma adımı biriktirmesin: hız değişmediyse hemen hizYazilamadi
var z17y = sahne({ n: 24, tutamak: 0, fr: 1001 / 60000 });
var r17y = uygula(z17y, S.hostPlan(S.plan("atilim", { ease: "linear", density: "many", mode: "balanced" }, { frames: 24, fps: 60000 / 1001 })));
ortam.yoksayEps = 2e-4;
var once17y = ortam.setSpeed, k17y = call("KS_removeSpeedRamp", { record: r17y.record }), cagri17y = ortam.setSpeed - once17y;
ok("17) tam: yok sayılan %100 isteği turlarda tekrarlanmaz (en çok 2 setSpeed)", r17y.ok && cagri17y <= 2, cagri17y + " çağrı · " + js(k17y));
z = sahne({ n: 25, tutamak: 0.04 });
var r17 = uygula(z, S.hostPlan(S.plan("vites", { mode: "balanced" }, { frames: 25, fps: 25 })));
ok("17) Vites Dengeli 25 kare, 1 kare tutamak: başarılı", r17.ok, js(r17));
var oto17 = [];
S.list().forEach(function (pr) {
  if (pr.beats) return;
  [25, 100, 125].forEach(function (n) { [0, null].forEach(function (hs) {
    var zz = sahne({ n: n, tutamak: 0 });
    var r = uygula(zz, S.hostPlan(S.plan(pr.id, {}, { frames: n, fps: 25, handleSec: hs })));
    if (!r.ok) oto17.push(pr.id + " " + n + " " + hs + " " + r.kod);
  }); });
});
ok("17) varsayılan otomatik, tutamak 0 ya da bilinmiyor (ffmpeg yok): hepsi başarılı", oto17.length === 0, oto17.join(" | "));
// Hızlanmada yukarıdan yaklaşma hızı %0,1'in altında aşarsa (3.166457 / 3.1662) KS_rampSetSpeed 'zaten
// orada' deyip yavaşlatmayı atlıyordu: uç fazla hızla uzatılıp medya sonunda T1'den bir kare kısa kalıyordu (tutamak)
var yak17 = [];
[["cikis", 110, 25], ["bukum", 150, 25], ["bukum", 150, 24000 / 1001], ["cikis", 216, 30000 / 1001], ["nabiz", 361, 60000 / 1001]].forEach(function (d) {
  var zz = sahne({ n: d[1], tutamak: 0, fr: 1 / d[2] });
  [0, null].forEach(function (hs) {
    if (hs === null) zz = sahne({ n: d[1], tutamak: 0, fr: 1 / d[2] });
    var r = uygula(zz, S.hostPlan(S.plan(d[0], {}, { frames: d[1], fps: d[2], handleSec: hs })));
    if (!r.ok) { yak17.push(d.join("/") + " " + hs + " " + r.kod); return; }
    var ps = parcalar(zz, 50, 50 + d[1]);
    if (ps[ps.length - 1]._e !== 50 + d[1]) yak17.push(d.join("/") + " uç " + ps[ps.length - 1]._e);
  });
});
ok("17) varsayılan, tutamak 0: yukarıdan yaklaşmada %0,1 altı aşım da v'ye yavaşlatılır (Hızlı Çıkış 110, Zaman Bükümü 150, Nabız 361)", yak17.length === 0, yak17.join(" | "));

/* ---------- 18) yüzde birimli sürüm, kayıtsız (seçimden) kaldır ---------- */
z = sahne({ n: 100, surum: "eski" });
var r18 = uygula(z, S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25 })), { cal: { units: "percent", sig: "5" } });
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(z, 50, 150)[1]._sel = true;
var k18 = call("KS_removeSpeedRamp", { fromSelection: true });
var ps18 = parcalar(z, 50, 150);
ok("18) yüzde birimi, kalibrasyonsuz seçimden kaldır: birim silinecek son parçada yoklanır, tek %100 klip", r18.ok && k18.ok && ps18.length === 1 && ps18[0]._v === 1 &&
  ps18[0]._e === 150 && ps18[0]._in === 10, js(k18) + " " + js(ps18.map(function (k) { return [k._s, k._e, k._v]; })));
z = sahne({ n: 100, surum: "eski" });
r18 = uygula(z, S.hostPlan(S.plan("giris", { mode: "balanced" }, { frames: 100, fps: 25 })), { cal: { units: "percent", sig: "5" } });
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(z, 50, 150)[2]._sel = true;
var once18 = ortam.cagriDeger.length;
var k18b = call("KS_removeSpeedRamp", { fromSelection: true, cal: { units: "percent", sig: "5" } });
var ps18b = parcalar(z, 50, 150);
ok("18) panelin kalibrasyonu seçimden kaldırmada kullanılır: hiç oran birimi çağrısı yok", r18.ok && k18b.ok && ps18b.length === 1 && ps18b[0]._v === 1 && ps18b[0]._e === 150 &&
  ortam.cagriDeger.slice(once18).every(function (x) { return x >= 5; }), js(k18b) + " " + js(ortam.cagriDeger.slice(once18)));

/* ---------- 19) kaldırırken QE setSpeed yoksa hiçbir parça silinmez ---------- */
z = sahne({ n: 100 });
var r19 = uygula(z, S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25 })));
ortam.setSpeedYok = true;
var f19 = foto();
var k19 = call("KS_removeSpeedRamp", { record: r19.record });
ok("19) setSpeed yok: geriAlinamadi, rampa birebir yerinde (parça silinmedi, boşluk yok)", r19.ok && !k19.ok && k19.kod === "geriAlinamadi" && foto() === f19 &&
  bitisikMi(parcalar(z, 50, 150), 50, 150), js(k19));

/* ---------- 20) kısmi aralık: dış video parçaları kendi seslerine yeniden bağlanır ---------- */
function bagliMi(v, a) { return v._bag.indexOf(a) !== -1 && a._bag.indexOf(v) !== -1; }
z = sahne({ n: 200, inF: 100, outF: 180, linkedApi: true });
var hd20 = call("KS_speedRampTargets", { range: "inout" }), t20 = hd20.targets[0];
var r20 = call("KS_applySpeedRamp", { target: { track: 0, start: t20.start, end: t20.end, mediaPath: t20.mediaPath }, range: { start: t20.rangeStart, end: t20.rangeEnd },
  plan: S.hostPlan(S.plan("darbe", {}, S.clipFor(t20, hd20.frame, {}))), audio: "mute", interp: { slow: 1, fast: 0 } });
var v20 = aktif._v[0]._k.filter(function (k) { return k._yol === z.K._yol; }), a20 = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
var vSol = v20[0], vSag = v20[v20.length - 1], aSol = a20[0], aIc = a20[1], aSag = a20[2];
ok("20) kısmi rampa: [cs,T0] ve [T1,ce] video parçaları kendi sesleriyle bağlı, iç sese bağlı değil", r20.ok && vSol._e === 100 && vSag._s === 180 && bagliMi(vSol, aSol) && bagliMi(vSag, aSag) &&
  !bagliMi(vSol, aIc) && !bagliMi(vSag, aIc) && !aIc._bag.length && js(r20.record.dis) === js([[2, 4], [7.2, 10]]), js([vSol._bag.map(function (b) { return b._s; }), vSag._bag.map(function (b) { return b._s; }), r20.record.dis]));
var k20 = call("KS_removeSpeedRamp", { record: r20.record });
v20 = aktif._v[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("20) kısmi rampayı kaldır: iç parça %100 ve iç sesle, dış parçalar kendi sesleriyle bağlı", k20.ok && v20.length === 3 && v20[1]._v === 1 && bagliMi(v20[1], aIc) && !aIc._d &&
  bagliMi(v20[0], aSol) && bagliMi(v20[2], aSag), js(k20));
z = sahne({ n: 200, inF: 100, outF: 180, linkedApi: true, hataBas: 6 });
var r20b = call("KS_applySpeedRamp", { target: hedef(z), range: { start: 4, end: 7.2 }, plan: S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 80, fps: 25, partial: true })), audio: "mute", interp: {} });
v20 = aktif._v[0]._k.filter(function (k) { return k._yol === z.K._yol; });
a20 = aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; });
ok("20) kısmi rampa yarıda bozulursa da: geri yüklenir, üç video parçası kendi sesleriyle bağlı", !r20b.ok && r20b.restored === true && v20.length === 3 && a20.length === 3 &&
  v20.every(function (v, i) { return bagliMi(v, a20[i]) && v._v === 1; }) && a20.every(function (a) { return !a._d; }), js(r20b));

/* ---------- 21) kaldırınca geri gelen klip seçili; açık hedeflerle (items) yeniden uygulanır ---------- */
z = sahne({ n: 100 });
var r21 = uygula(z, S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25 })));
var k21 = call("KS_removeSpeedRamp", { record: r21.record });
var sec21 = aktif.getSelection();
var h21 = call("KS_speedRampTargets", { range: "clips" });
ok("21) kaldırma geri gelen klibi seçer: 'kaldırıp yeniden uygula' secimYok'a düşmez", k21.ok && sec21.length === 1 && sec21[0]._s === 50 && sec21[0]._e === 150 &&
  h21.ok && h21.targets.length === 1 && h21.targets[0].start === 2 && h21.targets[0].end === 6, js(h21).slice(0, 200));
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
var h21b = call("KS_speedRampTargets", { range: "clips", items: [{ track: 0, start: 2 }] });
ok("21) items: seçim boşken açık hedef (katman + başlangıç) klibe çözülür", h21b.ok && h21b.targets.length === 1 && h21b.targets[0].start === 2 && h21b.targets[0].partial === false, js(h21b).slice(0, 200));
var h21c = call("KS_speedRampTargets", { range: "clips", items: [{ track: 0, start: 3.3 }] });
ok("21) items: o anda başlayan klip yoksa secimYok", !h21c.ok && h21c.kod === "secimYok", js(h21c));

/* ---------- 22) seçimden kaldırma %100 komşuyu ve başka efektli klibi yutmaz ---------- */
function bolKomsu(z, f, comps) {
  // K'yi f karesinde böl: sağ parça aynı çekimin devamı (kaynak sürüyor), istenirse başka bileşenlerle
  var K = z.K, sag = new Klip({ s: f, e: K._e, inp: K._in + (f - K._s) * ortam.fr, yol: K._yol, dur: K._dur, ad: "Devam", comps: comps });
  K._e = f; aktif._v[0].ekle(sag);
  return sag;
}
var LUMETRI = [{ matchName: "AE.ADBE Opacity" }, { matchName: "AE.ADBE Motion" }, { matchName: "AE.ADBE Lumetri" }];
z = sahne({ n: 100 });
var sag22 = bolKomsu(z, 100, LUMETRI);
var r22 = call("KS_applySpeedRamp", { target: { track: 0, start: 2, end: 4, mediaPath: z.K._yol }, range: { start: 2, end: 4 },
  plan: S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 50, fps: 25 })), audio: "mute", interp: {} });
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(z, 50, 100)[2]._sel = true;
var k22 = call("KS_removeSpeedRamp", { fromSelection: true });
ok("22) sağdaki %100 devam klibi (Lumetri'li) rampaya katılmaz: yerinde, rampa [50–100] tek %100 klip", r22.ok && k22.ok && k22.t0 === 2 && k22.t1 === 4 &&
  aktif._v[0]._k.indexOf(sag22) !== -1 && sag22._s === 100 && sag22._e === 150 && parcalar(z, 50, 100).length === 1 && parcalar(z, 50, 100)[0]._v === 1, js(k22));
z = sahne({ n: 100 });
var sol22 = z.K;
var K22 = bolKomsu(z, 100);   // sol [50–100] %100 kalır, rampa sağ yarıya
z.K = K22;
var r22b = call("KS_applySpeedRamp", { target: { track: 0, start: 4, end: 6, mediaPath: K22._yol }, range: { start: 4, end: 6 },
  plan: S.hostPlan(S.plan("darbe", { mode: "balanced" }, { frames: 50, fps: 25 })), audio: "mute", interp: {} });
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(z, 100, 150)[1]._sel = true;
var k22b = call("KS_removeSpeedRamp", { fromSelection: true });
ok("22) soldaki %100 kesik (aynı çekim) rampaya katılmaz: ilk parça sayılmaz, yerinde kalır", r22b.ok && k22b.ok && k22b.t0 === 4 && k22b.t1 === 6 &&
  aktif._v[0]._k.indexOf(sol22) !== -1 && sol22._s === 50 && sol22._e === 100, js(k22b));
z = sahne({ n: 100 });
var r22c = uygula(z, S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25 })));
var p22c = parcalar(z, 50, 150);
p22c[p22c.length - 1].components = { numItems: 3, 0: LUMETRI[0], 1: LUMETRI[1], 2: LUMETRI[2] };   // rampanın parçasına sonradan efekt
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
p22c[3]._sel = true;
var f22c = foto();
var k22c = call("KS_removeSpeedRamp", { fromSelection: true });
ok("22) zincirde bileşenleri farklı parça varsa (kayıtsız): degisti, hiçbir şey silinmez", r22c.ok && !k22c.ok && k22c.kod === "degisti" && foto() === f22c, js(k22c));
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
p22c[0]._sel = true;
var k22d = call("KS_removeSpeedRamp", { fromSelection: true, records: [{ v: 1, seqId: "baska", track: 0, t0: 2, t1: 6 }, r22c.record] });
ok("22) panel kaydı eşleşirse kayıt kullanılır (efektli parça da rampanın parçası olarak kaldırılır), kayit döner", k22d.ok && k22d.kayit && k22d.kayit.t0 === 2 &&
  parcalar(z, 50, 150).length === 1 && parcalar(z, 50, 150)[0]._v === 1, js(k22d));
// Otomatik (exact) rampa %100 platoyla biter (Hızlı Giriş 106: [71, 1.0001]; Basamaklı tam 1.0): kayıtsız kaldırma
// platoyu dış parça sayıp dışarıda bırakırsa ilk parça kısa t1'e uzar, plato eski (ileri) kaynağıyla kalır: atlama + Out'u aşan klip
function kayitsizKaldir(z, n, sec) {
  aktif._v[0]._k.forEach(function (k) { k._sel = false; });
  parcalar(z, 50, 50 + n)[sec]._sel = true;
  return call("KS_removeSpeedRamp", { fromSelection: true, records: [] });
}
function surekli100(z, n) {
  var ps = parcalar(z, 50, 50 + n), hata = "";
  if (!bitisikMi(ps, 50, 50 + n)) return "bitişik değil";
  ps.forEach(function (k) {
    if (!tam100(k)) hata += " hız " + k._v;
    if (Math.abs(k._in - (10 + (k._s - 50) * ortam.fr)) > ortam.fr / 2) hata += " kaynak atlaması @" + k._s + " " + k._in;
  });
  if (Math.abs(kaynakSonu(ps[ps.length - 1]) - (10 + n * ortam.fr)) > ortam.fr / 2) hata += " son kaynak " + kaynakSonu(ps[ps.length - 1]);
  return hata;
}
z = sahne({ n: 106, tutamak: 30 });
var pl22e = S.plan("giris", {}, { frames: 106, fps: 25, handleSec: 30 });
var r22e = uygula(z, S.hostPlan(pl22e));
var k22e = kayitsizKaldir(z, 106, 1);
ok("22) kayıtsız kaldırma: exact Hızlı Giriş 106 (son parça %100,01 plato) tek sürekli %100 klip, özgün Out'ta biter", pl22e.mode === "exact" && r22e.ok && k22e.ok &&
  k22e.t0 === 2 && Math.abs(k22e.t1 - 6.24) < 1e-6 && parcalar(z, 50, 156).length === 1 && surekli100(z, 106) === "",
  js(k22e) + " " + js(parcalar(z, 50, 156).map(function (k) { return [k._s, k._e, k._v, +k._in.toFixed(3)]; })));
var sec22 = [];
S.list().forEach(function (pr) {
  if (pr.beats) return;
  [{}, { mode: "balanced" }, { ease: "linear" }, { ease: "step" }].forEach(function (o) {
    [60, 106, 125, 200].forEach(function (n) {
      var zz = sahne({ n: n, tutamak: 30 });
      var r = uygula(zz, S.hostPlan(S.plan(pr.id, o, { frames: n, fps: 25, handleSec: 30 })));
      if (!r.ok) return;
      var ps = parcalar(zz, 50, 50 + n), sec = Math.min(1, ps.length - 1);
      if (ps.length < 2) return;
      var kd = kayitsizKaldir(zz, n, sec);
      var h = kd.ok ? surekli100(zz, n) : "kod " + kd.kod;
      if (h) sec22.push(pr.id + " " + js(o) + " " + n + ":" + h);
    });
  });
});
ok("22) kayıtsız kaldırma her önayar/seçenek/uzunlukta: kaynak atlaması yok, her parça tam %100, Out özgün yerde", sec22.length === 0, sec22.length + ": " + sec22.slice(0, 5).join(" | "));

/* ---------- 23) kaldır: canlı seçim + panel kayıtları (eski önbellekli seçim değil) ---------- */
z = sahne({ n: 400 });
var r23a = call("KS_applySpeedRamp", { target: hedef(z), range: { start: 2, end: 6 }, plan: S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25, partial: true })), audio: "mute", interp: {} });
var Kb = aktif._v[0]._k.filter(function (k) { return k._s === 450; })[0] || null;
var r23b = call("KS_applySpeedRamp", { target: { track: 0, start: 6, end: 18, mediaPath: z.K._yol }, range: { start: 14, end: 18 },
  plan: S.hostPlan(S.plan("darbe", { mode: "balanced" }, { frames: 100, fps: 25, partial: true })), audio: "mute", interp: {} });
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(z, 350, 450)[2]._sel = true;   // B rampasının parçası
var k23 = call("KS_removeSpeedRamp", { fromSelection: true, records: [r23a.record, r23b.record] });
ok("23) iki rampa aynı medyada: canlı seçim B'deyse B kaldırılır, A yerinde", r23a.ok && r23b.ok && k23.ok && k23.t0 === 14 && k23.kayit && k23.kayit.t0 === 14 &&
  parcalar(z, 50, 150).length === r23a.pieces && parcalar(z, 350, 450).length === 1, js(k23) + " " + Kb);
// Arka arkaya iki rampa (ikincinin In'i birincinin Out'unda): kaynak sınırda kapanır, zincir ikisini birleştirir.
// Kopyalanan sekansta kayıtlar başka seqId taşır: sınırları ipucu olur, yalnız seçili rampa kaldırılır
function bitisikIkiRampa() {
  var zz = sahne({ n: 250 });
  var a = call("KS_applySpeedRamp", { target: hedef(zz), range: { start: 4, end: 6 }, plan: S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 50, fps: 25, partial: true })), audio: "mute", interp: {} });
  var b = call("KS_applySpeedRamp", { target: { track: 0, start: 6, end: 12, mediaPath: zz.K._yol }, range: { start: 6, end: 8 },
    plan: S.hostPlan(S.plan("darbe", { mode: "balanced" }, { frames: 50, fps: 25, partial: true })), audio: "mute", interp: {} });
  return { z: zz, a: a, b: b };
}
function kopyaKaydi(r) { var k = JSON.parse(JSON.stringify(r.record)); k.seqId = "kopyalanan-sekansin-eslesi"; return k; }
var y23 = bitisikIkiRampa();
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(y23.z, 100, 150)[2]._sel = true;
var k23y = call("KS_removeSpeedRamp", { fromSelection: true, records: [kopyaKaydi(y23.a), kopyaKaydi(y23.b)] });
ok("23) bitişik iki rampa, kopyalanan sekans (kayıtlar başka seqId): yalnız seçili rampa kaldırılır, ikincisi yerinde", y23.a.ok && y23.b.ok && k23y.ok &&
  k23y.t0 === 4 && k23y.t1 === 6 && parcalar(y23.z, 100, 150).length === 1 && parcalar(y23.z, 150, 200).length === y23.b.pieces, js(k23y));
y23 = bitisikIkiRampa();
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(y23.z, 150, 200)[1]._sel = true;
var k23z = call("KS_removeSpeedRamp", { fromSelection: true, records: [y23.a.record] });
ok("23) bitişik iki rampa, yalnız birincinin kaydı var, ikincisi seçili: ikincisi kaldırılır, birincisi (kaydıyla) yerinde", k23z.ok && k23z.t0 === 6 && k23z.t1 === 8 &&
  parcalar(y23.z, 100, 150).length === y23.a.pieces && parcalar(y23.z, 150, 200).length === 1, js(k23z));

/* ---------- 24) geri yükleme tam %100 (yuvarlama payı yok) ---------- */
var tam24 = [];
[["suzulme", { mode: "balanced", ease: "linear", density: "many", k: 0.8 }], ["darbe", { mode: "balanced", ease: "linear", density: "normal", k: 1.3 }]].forEach(function (x) {
  var zz = sahne({ n: 100 });
  var pl = S.plan(x[0], x[1], { frames: 100, fps: 25 });
  var r = uygula(zz, S.hostPlan(pl));
  var kk = call("KS_removeSpeedRamp", { record: r.record });
  var ps = parcalar(zz, 50, 150);
  if (!(Math.abs(pl.segments[0].v - 1) < 0.002 && pl.segments[0].v !== 1)) tam24.push(x[0] + " ilk parça " + pl.segments[0].v + " (senaryo değişti)");
  if (!r.ok || !kk.ok || ps.length !== 1 || ps[0]._v !== 1 || ps[0]._e !== 150 || Math.abs(kaynakSonu(ps[0]) - 14) > 1e-9) tam24.push(x[0] + " " + js(kk) + " " + js(ps.map(function (k) { return [k._s, k._e, k._v, kaynakSonu(k)]; })));
});
ok("24) ilk parçası %99.8 olan rampa (Süzülme, Darbe doğrusal): kaldırınca hız tam 1, kaynak sonu tam 14 sn", tam24.length === 0, tam24.join(" | "));

/* ---------- 25) Clip > Link ile bağlı ayrı kayıt WAV'ı: kapatılır, kaydedilir, yeniden bağlanır ---------- */
z = sahne({ n: 100, linkedApi: true });
var wav = new Klip({ s: 50, e: 150, inp: 3, yol: "C:\\ses\\zoom.wav", tur: "a", ad: "zoom.wav" });
aktif._a.push(new Iz("A3", [wav])); aktif.audioTracks = izler(aktif._a);
z.K._bag.push(wav); wav._bag = [z.K]; z.KS._bag.push(wav); wav._bag.push(z.KS);
var r25 = uygula(z, S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25 })));
var wavlar = aktif._a[2]._k.filter(function (k) { return k._yol === "C:\\ses\\zoom.wav"; });
ok("25) bağlı WAV aralıkta kapatıldı, kayıtta (audio + ekSes), bağı koptu", r25.ok && wavlar.length === 1 && wavlar[0]._d === true && r25.record.audio.length === 2 &&
  r25.record.ekSes.length === 1 && r25.record.ekSes[0].yol === "c:\\ses\\zoom.wav" && !wavlar[0]._bag.some(function (b) { return b._tur === "v"; }), js(r25.record));
var k25 = call("KS_removeSpeedRamp", { record: r25.record });
var geri25 = parcalar(z, 50, 150)[0];
wavlar = aktif._a[2]._k.filter(function (k) { return k._yol === "C:\\ses\\zoom.wav"; });
ok("25) kaldırınca WAV açık ve geri gelen klibe yeniden bağlı", k25.ok && wavlar.every(function (k) { return !k._d; }) && bagliMi(geri25, wavlar[0]), js(k25));

/* ---------- 26) In/Out: gizli katman ve devre dışı klip hedef olmaz; tek klip yoksa inoutKlipYok ---------- */
z = sahne({ n: 200, inF: 100, outF: 180, v2: [] });
var alt26 = aktif._v[1].ekle(new Klip({ s: 60, e: 240, inp: 0, yol: "C:\\cekim\\alt_take.mov", ad: "alt_take.mov" }));
aktif._v[1].isMuted = function () { return true; };
var h26 = call("KS_speedRampTargets", { range: "inout" });
ok("26) V2 gizli: In/Out hedefi görünen V1 klibi", h26.ok && h26.targets.length === 1 && h26.targets[0].track === 0, js(h26).slice(0, 160));
aktif._v[1].isMuted = function () { return false; };
alt26._d = true;
var h26b = call("KS_speedRampTargets", { range: "inout" });
ok("26) V2'deki klip devre dışı: hedef V1", h26b.ok && h26b.targets.length === 1 && h26b.targets[0].track === 0, js(h26b).slice(0, 160));
z = sahne({ n: 100, inF: 120, outF: 170 });
var h26c = call("KS_speedRampTargets", { range: "inout" });
ok("26) In/Out kesimi aşıyor: inoutKlipYok (secimYok değil)", !h26c.ok && h26c.kod === "inoutKlipYok", js(h26c));

/* ---------- 27) zaman aradeğerlemesi: özgün ayar (optik akış) korunur ---------- */
z = sahne({ n: 100 });
z.K._interp = 2;
var p27 = S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25 });
var r27 = uygula(z, S.hostPlan(p27));
var ps27 = parcalar(z, 50, 150);
ok("27) %100 civarı / bulanıksız hızlı parçalar özgün optik akışta, yavaşlar kare harmanlamada", r27.ok && ps27.every(function (k, i) { return k._interp === (p27.segments[i].v < 0.98 ? 1 : 2); }) &&
  r27.record.ilkInterp === null, js(ps27.map(function (k) { return k._interp; })));
var k27 = call("KS_removeSpeedRamp", { record: r27.record });
ok("27) kaldırınca ilk parçaya dokunulmaz: özgün optik akış kalır (eskiden 0'a zorlanırdı)", k27.ok && parcalar(z, 50, 150)[0]._interp === 2, js(parcalar(z, 50, 150).map(function (k) { return k._interp; })));
z = sahne({ n: 100 });
z.K._interp = 2;
var r27b = uygula(z, S.hostPlan(S.plan("vites", { mode: "balanced" }, { frames: 100, fps: 25 })), { interp: { slow: 1, fast: 1 } });
var k27b = call("KS_removeSpeedRamp", { record: r27b.record });
ok("27) ilk parçaya Suflo yazdıysa (Vites yavaş başlar): kayıtta ilkInterp, kaldırınca 0", r27b.ok && r27b.record.ilkInterp === 1 && k27b.ok && parcalar(z, 50, 150)[0]._interp === 0, js(r27b.record.ilkInterp));

/* ---------- 28) tek hızlı plan: duz, hiçbir şey değişmez ---------- */
z = sahne({ n: 100 });
var f28 = foto();
var r28 = uygula(z, { mode: "balanced", segments: [[50, 1], [50, 1]], srcFrames: 100 });
var r28b = uygula(z, { mode: "balanced", segments: [[100, 1]], srcFrames: 100 });
ok("28) tüm parçalar aynı hızda / tek parça: duz, ses kapatılmaz, sekans aynı", !r28.ok && r28.kod === "duz" && !r28b.ok && r28b.kod === "duz" && foto() === f28, js([r28, r28b]));

/* ---------- 29) kullanıcının kapattığı ses kayıtsız kaldırmada açılmaz ---------- */
z = sahne({ n: 100 });
z.KS._d = true;
var r29 = uygula(z, S.hostPlan(S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 25 })));
aktif._v[0]._k.forEach(function (k) { k._sel = false; });
parcalar(z, 50, 150)[4]._sel = true;
var k29 = call("KS_removeSpeedRamp", { fromSelection: true });
ok("29) kullanıcının kapattığı kamera sesi: kayıtta yok, kayıtsız kaldırmada da kapalı kalır, bağlanmaz", r29.ok && r29.record.audio.length === 0 && k29.ok && k29.audio === 0 &&
  aktif._a[0]._k.filter(function (k) { return k._yol === z.K._yol; }).every(function (k) { return k._d; }) && ortam.link === 0, js(k29));

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
