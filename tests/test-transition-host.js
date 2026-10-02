// Suflo testi: host.jsx KS_applyCutTransition — sahte Premiere nesne modeliyle gercek calistirma
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..");
var T = require(path.join(ROOT, "js", "transitions.js"));

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 220) + "]" : ""));
}

function FakeTime() { this.seconds = 0; }
function FakeProp(value) { this.value = value; this.keys = []; }
FakeProp.prototype.getValue = function () { return this.value; };
FakeProp.prototype.getValueAtTime = function () { return this.value; };
FakeProp.prototype.setValue = function (v) { this.value = v; };
FakeProp.prototype.setTimeVarying = function (v) { this.timeVarying = v; };
FakeProp.prototype.removeKeyRange = function (a, b) { this.keys = this.keys.filter(function (k) { return k.time < a.seconds || k.time > b.seconds; }); };
FakeProp.prototype.removeKey = function (t) { this.keys = this.keys.filter(function (k) { return Math.abs(k.time - t.seconds) > .0001; }); };
FakeProp.prototype.addKey = function () {};
FakeProp.prototype.setValueAtKey = function (t, v) { this.keys.push({ time: t.seconds, value: v }); };
FakeProp.prototype.setInterpolationTypeAtKey = function () {};
FakeProp.prototype.areKeyframesSupported = function () { return true; };
FakeProp.prototype.getKeys = function () { return this.keys.map(function (k) { return { seconds: k.time }; }); };

function list(items) { var o = { numItems: items.length }; items.forEach(function (x, i) { o[i] = x; }); return o; }
function prop(m, d, v) { var p = new FakeProp(v); p.matchName = m; p.displayName = d; return p; }
function makeClip(start, end, inPoint) {
  var c = {
    pos: prop("ADBE Position", "Position", [0.5, 0.5]),
    scale: prop("ADBE Scale", "Scale", 100),
    opacity: prop("ADBE Opacity", "Opacity", 100),
    start: { seconds: start }, end: { seconds: end },
    inPoint: { seconds: inPoint }, outPoint: { seconds: inPoint + (end - start) },
    isSpeedReversed: function () { return false; }
  };
  c.components = list([
    { matchName: "ADBE Motion", displayName: "Motion", properties: list([c.pos, c.scale]) },
    { matchName: "ADBE Opacity", displayName: "Opacity", properties: list([c.opacity]) }
  ]);
  return c;
}

var A = makeClip(0, 5, 10), B = makeClip(5, 9, 20), C = makeClip(9.5, 12, 30);
var playhead = 5.2;
var tracks = list([{ clips: list([A, B, C]), isLocked: function () { return false; } }]);
tracks.numTracks = 1;
var sequence = {
  frameSizeHorizontal: 1920, frameSizeVertical: 1080, videoTracks: tracks,
  getSelection: function () { return []; },
  getPlayerPosition: function () { return { seconds: playhead }; }
};
var ctx = {
  app: { project: { activeSequence: sequence }, enableQE: function () {} },
  Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
  isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, File: function () {}, Folder: function () {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), ctx, { filename: "jsx/host.jsx" });
function uygula(id, opts) {
  return JSON.parse(ctx.KS_applyCutTransition(encodeURIComponent(JSON.stringify({ plan: T.hostPlan(id, opts || { duration: 0.6 }), tolerance: 1 }))));
}

var r = uygula("zoom-in");
ok("zoom-in: kesim bulundu ve iki tarafa yazildi", r.ok && r.cut === 5 && r.out && r["in"], JSON.stringify(r));
var aKeys = A.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
var bKeys = B.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("A anahtarlari A'nin KAYNAK sonunda (14.7..15)", aKeys.length === 3 && Math.abs(aKeys[0].time - 14.7) < 1e-6 && Math.abs(aKeys[2].time - 15) < 1e-6, JSON.stringify(aKeys));
ok("A kesimde buyumus", aKeys[2].value > 140, aKeys[2].value);
ok("B anahtarlari B'nin KAYNAK basinda (20..20.3), 100'e doner", bKeys.length === 3 && Math.abs(bKeys[0].time - 20) < 1e-6 &&
  Math.abs(bKeys[2].time - 20.3) < 1e-6 && bKeys[2].value === 100 && bKeys[0].value > 130, JSON.stringify(bKeys));
ok("C'ye (bosluktan sonra) dokunulmadi", C.scale.keys.length === 0);

var w = uygula("whip-left");
var bp = B.pos.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("whip-left: B sagdan (normalize konum > 1.3) gelir ve 0.5'e oturur", w.ok && bp[0].value[0] > 1.3 && bp[bp.length - 1].value[0] === 0.5 && bp[0].value[1] === 0.5, JSON.stringify(bp));

var tekrar = uygula("zoom-in");
ok("ayni gecis tekrar uygulaninca eski anahtarlar temizlenir (birikmez)", tekrar.ok && A.scale.keys.length === 3 && B.scale.keys.length === 3, A.scale.keys.length + "/" + B.scale.keys.length);

// Kisa klip: gecis yarisi klibin yarisina sikistirilir
var D = makeClip(20, 20.4, 50), E = makeClip(20.4, 25, 60);
tracks[0].clips = list([D, E]);
playhead = 20.4;
var kisa = uygula("dip", { duration: 1.2 });
ok("kisa klipte gecis sikistirilir (half=0.2)", kisa.ok && Math.abs(kisa.half - 0.2) < 1e-6, JSON.stringify(kisa));

playhead = 40;
var yok = uygula("dip");
ok("yakinda kesim yoksa anlasilir hata", !yok.ok && /kesim yok/.test(yok.error), JSON.stringify(yok));
var bozuk = JSON.parse(ctx.KS_applyCutTransition(encodeURIComponent(JSON.stringify({ plan: { half: 0 } }))));
ok("gecersiz plan reddedilir", !bozuk.ok, JSON.stringify(bozuk));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
