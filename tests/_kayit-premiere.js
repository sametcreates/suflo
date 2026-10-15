// Ortak sahte Premiere (3.4 adım 11 kayıt / kaldırma testleri). "_" ile başladığı için test koşucusu çalıştırmaz.
// Premiere'e yakın davranış: anahtarlar KAYNAK zamanında durur; addKey anahtarı o anki eğri değeriyle ekler,
// setValueAtKey yalnız var olan anahtarı değiştirir, getValueAtTime anahtarlar arasında doğrusal ara değer verir,
// setTimeVarying(false) anahtarları siler. Son anahtar silinince özellik o anahtarın değerinde kalır (Premiere
// gibi: kaldırma sabit değeri geri koymazsa klip yanlış değerde kalır). updateUI çağrıları kaydedilir.
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..");

function kopya(v) { return v && typeof v === "object" ? v.slice() : v; }
function yakin(a, b) { return Math.abs(a - b) < 1e-9; }

function olustur(ayar) {
  ayar = ayar || {};
  var ui = [];          // { ad, tur: 'anahtar'|'deger', s }
  function FakeTime() { this.seconds = 0; }

  function FakeProp(ad, deger, matchName) {
    this.displayName = ad;
    if (matchName) this.matchName = matchName;
    this.value = deger;
    this.keys = [];
    this.tv = false;
  }
  FakeProp.prototype.sirala = function () { this.keys.sort(function (a, b) { return a.s - b.s; }); };
  FakeProp.prototype.bul = function (s) { for (var i = 0; i < this.keys.length; i++) if (yakin(this.keys[i].s, s)) return this.keys[i]; return null; };
  FakeProp.prototype.areKeyframesSupported = function () { return true; };
  FakeProp.prototype.isTimeVarying = function () { return this.tv; };
  FakeProp.prototype.setTimeVarying = function (b) { this.tv = !!b; if (!b) this.keys = []; };
  FakeProp.prototype.getValue = function () { return kopya(this.value); };
  FakeProp.prototype.setValue = function (v, u) {
    this.value = kopya(v);
    ui.push({ ad: this.displayName, tur: "deger", ui: u === true });
  };
  FakeProp.prototype.degerAt = function (s) {
    this.sirala();
    var k = this.keys;
    if (!k.length) return kopya(this.value);
    if (s <= k[0].s) return kopya(k[0].v);
    if (s >= k[k.length - 1].s) return kopya(k[k.length - 1].v);
    for (var i = 0; i < k.length - 1; i++) {
      if (s >= k[i].s && s <= k[i + 1].s) {
        var o = (s - k[i].s) / (k[i + 1].s - k[i].s), a = k[i].v, b = k[i + 1].v;
        if (typeof a === "number") return a + (b - a) * o;
        return [a[0] + (b[0] - a[0]) * o, a[1] + (b[1] - a[1]) * o];
      }
    }
    return kopya(this.value);
  };
  FakeProp.prototype.getValueAtTime = function (t) { return this.degerAt(t.seconds); };
  FakeProp.prototype.getValueAtKey = function (t) { var k = this.bul(t.seconds); if (!k) throw new Error("anahtar yok"); return kopya(k.v); };
  FakeProp.prototype.getKeys = function () { this.sirala(); return this.keys.map(function (k) { return { seconds: k.s }; }); };
  FakeProp.prototype.addKey = function (t) {
    if (!this.bul(t.seconds)) this.keys.push({ s: t.seconds, v: this.degerAt(t.seconds) });
    this.tv = true;
  };
  FakeProp.prototype.setValueAtKey = function (t, v, u) {
    var k = this.bul(t.seconds);
    if (!k) throw new Error("addKey olmadan setValueAtKey");
    k.v = kopya(v);
    ui.push({ ad: this.displayName, tur: "anahtar", s: t.seconds, ui: u === true });
  };
  FakeProp.prototype.removeKey = function (t) {
    var s = t.seconds, once = this.keys.length, son = null;
    this.keys = this.keys.filter(function (k) { if (yakin(k.s, s)) { son = k; return false; } return true; });
    if (once && !this.keys.length && son) this.value = kopya(son.v);
  };
  FakeProp.prototype.removeKeyRange = function (a, b) {
    var self = this;
    this.keys.slice().forEach(function (k) { if (k.s >= a.seconds && k.s <= b.seconds) self.removeKey({ seconds: k.s }); });
  };
  FakeProp.prototype.setInterpolationTypeAtKey = function () {};
  // Kullanıcının elle eklediği anahtar (timeline saniyesinde)
  FakeProp.prototype.elle = function (klip, tl, v) {
    var s = klip.inPoint.seconds + (tl - klip.start.seconds) / (klip.end.seconds - klip.start.seconds) * (klip.outPoint.seconds - klip.inPoint.seconds);
    if (klip.ters) s = klip.outPoint.seconds - (s - klip.inPoint.seconds);
    var k = this.bul(s);
    if (k) k.v = kopya(v); else this.keys.push({ s: s, v: kopya(v) });
    this.tv = true;
    return s;
  };
  // Anahtarların timeline saniyeleri (artan)
  FakeProp.prototype.tl = function (klip) {
    this.sirala();
    var d = klip.end.seconds - klip.start.seconds, kd = klip.outPoint.seconds - klip.inPoint.seconds;
    return this.keys.map(function (k) {
      var o = (k.s - klip.inPoint.seconds) / kd;
      if (klip.ters) o = 1 - o;
      return Math.round((klip.start.seconds + o * d) * 1e6) / 1e6;
    });
  };

  function list(items) { var o = { numItems: items.length }; items.forEach(function (x, i) { o[i] = x; }); return o; }

  // o: { ad, nodeId, start, end, inP, outP?, ters?, olcek?, opak?, konum? }
  function klip(o) {
    var dur = o.end - o.start;
    var c = {
      name: o.ad || "Klip.mp4", nodeId: o.nodeId || ("n" + o.start), mediaType: "Video",
      start: { seconds: o.start }, end: { seconds: o.end },
      inPoint: { seconds: o.inP || 0 }, outPoint: { seconds: o.outP !== undefined ? o.outP : (o.inP || 0) + dur },
      ters: !!o.ters, projectItem: {}
    };
    c.isSpeedReversed = function () { return c.ters; };
    c.konum = new FakeProp("Position", o.konum || [0.5, 0.5]);
    c.olcek = new FakeProp("Scale", o.olcek !== undefined ? o.olcek : 100);
    c.opak = new FakeProp("Opacity", o.opak !== undefined ? o.opak : 100);
    c.components = list([
      { matchName: "AE.ADBE Motion", displayName: "Motion", properties: list([c.konum, c.olcek]) },
      { matchName: "AE.ADBE Opacity", displayName: "Opacity", properties: list([c.opak]) }
    ]);
    // klibi timeline'da taşı (anahtarlar kaynak zamanında kalır)
    c.tasi = function (d) { c.start = { seconds: c.start.seconds + d }; c.end = { seconds: c.end.seconds + d }; };
    return c;
  }

  var durum = { playhead: 0, secim: [] };
  var sequence = {
    sequenceID: ayar.seqId || "seq-1", timebase: String(254016000000 / (ayar.fps || 25)),
    frameSizeHorizontal: 1920, frameSizeVertical: 1080,
    getSelection: function () { return durum.secim; },
    getPlayerPosition: function () { return { seconds: durum.playhead }; }
  };
  function izKur(izler) {
    var v = { numTracks: izler.length };
    izler.forEach(function (k, i) { v[i] = { clips: list(k), isLocked: function () { return false; } }; });
    sequence.videoTracks = v;
  }
  izKur([[]]);
  var ctx = {
    app: { version: "25.1.0", project: { activeSequence: sequence, path: ayar.proje || "C:\\proje\\kayit.prproj" }, enableQE: function () {} },
    Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
    isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, File: function () {}, Folder: function () {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), ctx, { filename: "jsx/host.jsx" });
  function cagir(fn, arg) { return JSON.parse(ctx[fn](arg === undefined ? undefined : encodeURIComponent(JSON.stringify(arg)))); }
  // Panelin K.call'u gibi: ad + nesne → sonuç nesnesi (Promise)
  function kcall(fn, arg) { return Promise.resolve(cagir(fn, arg)); }

  return { ctx: ctx, sequence: sequence, durum: durum, klip: klip, izKur: izKur, cagir: cagir, kcall: kcall, ui: ui, FakeProp: FakeProp };
}

module.exports = { olustur: olustur };
