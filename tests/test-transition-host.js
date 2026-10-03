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
    isSpeedReversed: function () { return false; },
    projectItem: {}, nodeId: "n" + start + "-" + end
  };
  c.components = list([
    { matchName: "ADBE Motion", displayName: "Motion", properties: list([c.pos, c.scale]) },
    { matchName: "ADBE Opacity", displayName: "Opacity", properties: list([c.opacity]) }
  ]);
  return c;
}

var A = makeClip(0, 5, 10), B = makeClip(5, 9, 20), C = makeClip(9.5, 12, 30);
var playhead = 5.2;
var secim = [];
var tracks = list([{ clips: list([A, B, C]), isLocked: function () { return false; } }]);
tracks.numTracks = 1;
var sequence = {
  frameSizeHorizontal: 1920, frameSizeVertical: 1080, videoTracks: tracks,
  timebase: String(254016000000 / 25),
  getSelection: function () { return secim; },
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
ok("tur degisince (zoom -> whip) once yazilan konum anahtarlari da temizlendi", B.pos.keys.length === 0 || B.pos.keys.every(function (k) { return k.time > 20.8; }), JSON.stringify(B.pos.keys));

// Uzun gecis sonra kisa gecis: eski egrinin ici okunmaz, olcek ust uste binmez
uygula("zoom-in", { duration: 1.2 });
uygula("zoom-in", { duration: 0.4 });
var bSon = B.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("uzun->kisa tekrar: B yalniz yeni 3 anahtar, son deger 100", bSon.length === 3 && bSon[2].value === 100 && bSon[0].value < 150, JSON.stringify(bSon));
var aSon = A.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("uzun->kisa tekrar: A taban degeri 100'den baslar", aSon.length === 3 && aSon[0].value === 100, JSON.stringify(aSon));

var sh = uygula("shake");
var bShake = B.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("sarsinti sonunda klip kendi olcegine (100) doner", sh.ok && bShake[bShake.length - 1].value === 100, JSON.stringify(bShake));
uygula("shake");
var bShake2 = B.scale.keys.slice().sort(function (x, y) { return x.time - y.time; });
ok("sarsinti tekrarinda olcek ust uste binmez", bShake2[0].value === bShake[0].value, bShake[0].value + " -> " + bShake2[0].value);

// MOGRT altyazi sinirlari atlanir, secim tercih edilir
var M1 = makeClip(4.5, 5.2, 70), M2 = makeClip(5.2, 6, 80);
M1.isMGT = function () { return true; }; M2.isMGT = function () { return true; };
var t2 = list([{ clips: list([A, B, C]), isLocked: function () { return false; } }, { clips: list([M1, M2]), isLocked: function () { return false; } }]);
t2.numTracks = 2;
sequence.videoTracks = t2;
playhead = 5.2;
var mg = uygula("punch");
ok("ust katmandaki MOGRT siniri (5.2) degil footage kesimi (5) secilir", mg.ok && mg.cut === 5 && mg.track === 1, JSON.stringify(mg));
var D0 = makeClip(5.0, 5.2, 90), E0 = makeClip(5.2, 7, 95);
var t3 = list([{ clips: list([A, B, C]), isLocked: function () { return false; } }, { clips: list([D0, E0]), isLocked: function () { return false; } }]);
t3.numTracks = 2;
sequence.videoTracks = t3;
secim = [A];
var sec = uygula("punch");
ok("secim varsa secili klibin kesimi tercih edilir (daha uzak olsa da)", sec.ok && sec.cut === 5 && sec.track === 1, JSON.stringify(sec));
secim = [];
// Bir karelik bosluk kesim sayilmaz (25 fps: 0.04 sn)
var G1 = makeClip(30, 32, 0), G2 = makeClip(32.04, 35, 0);
var t4 = list([{ clips: list([G1, G2]), isLocked: function () { return false; } }]); t4.numTracks = 1;
sequence.videoTracks = t4; playhead = 32;
ok("bir karelik bosluk kesim sayilmaz", uygula("dip").ok === false);
sequence.videoTracks = tracks;

playhead = 5.2;
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
