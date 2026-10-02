// Suflo testi: js/transitions.js — kesim gecisleri plani
var path = require("path");
var T = require(path.join(__dirname, "..", "js", "transitions.js"));

var gecen = 0, toplam = 0;
function chk(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : ""));
}
function son(k) { return k[k.length - 1]; }

var liste = T.list();
chk("13 gecis", liste.length === 13, liste.length);
chk("kimlikler tekil", new Set(liste.map(function (t) { return t.id; })).size === liste.length);

// Her plan: A keyframe'leri kesimden once biter, B kesimde baslar ve klibin kendi degerine doner
liste.forEach(function (t) {
  var p = T.plan(t.id, { duration: 0.6 });
  var ok = true, neden = "";
  Object.keys(p.out).forEach(function (prop) {
    p.out[prop].forEach(function (k) { if (k.t > 1e-9 || k.t < -p.half - 1e-9) { ok = false; neden = "A " + prop + " t=" + k.t; } });
  });
  Object.keys(p["in"]).forEach(function (prop) {
    var ks = p["in"][prop];
    ks.forEach(function (k) { if (k.t < -1e-9 || k.t > p.half + 1e-9) { ok = false; neden = "B " + prop + " t=" + k.t; } });
    var notr = prop === "scale" || prop === "opacity" ? 1 : 0;
    if (Math.abs(son(ks).v - notr) > 1e-9) { ok = false; neden = "B " + prop + " notre donmuyor: " + son(ks).v; }
  });
  chk(t.id + ": zamanlar kesimin dogru yaninda, B notre doner", ok, neden);
  chk(t.id + ": en az bir ozellik", Object.keys(p.out).length + Object.keys(p["in"]).length > 0);
});

var w = T.plan("whip-left", { duration: 0.5 });
chk("whip-left: A sola cikar, B sagdan girer", son(w.out.x).v < -0.9 && w["in"].x[0].v > 0.9, son(w.out.x).v + " / " + w["in"].x[0].v);
chk("sure sinirlanir", T.plan("dip", { duration: 99 }).half === 0.8 && T.plan("dip", { duration: 0 }).half === 0.1);
chk("guc etkiler", son(T.plan("zoom-in", { strength: 1.8 }).out.scale).v > son(T.plan("zoom-in", { strength: 0.5 }).out.scale).v);
chk("zoom-out olcegi negatife inmez", son(T.plan("zoom-out", { strength: 9 }).out.scale).v >= 0.45);
var hata = false; try { T.plan("yok"); } catch (e) { hata = true; }
chk("bilinmeyen gecis hata verir", hata);

/* ---- host plani ---- */
var hp = T.hostPlan("shake", { duration: 0.6 });
chk("hostPlan: x ve y tek konum dizisinde", hp["in"].pos && !hp["in"].x && hp["in"].pos.every(function (k) { return "x" in k && "y" in k; }), JSON.stringify(hp["in"].pos).slice(0, 80));
chk("hostPlan: birlesik zamanlar sirali ve tekil", hp["in"].pos.every(function (k, i, a) { return i === 0 || k.t > a[i - 1].t; }));
var m = T.mergeXY([{ t: 0, v: 0 }, { t: 1, v: 1 }], [{ t: 0.5, v: 2 }]);
chk("mergeXY: ara deger dogrusal", m.length === 3 && Math.abs(m[1].x - 0.5) < 1e-9 && m[0].y === 2, JSON.stringify(m));
var hw = T.hostPlan("whip-up", {});
chk("hostPlan: dikey whip'te x sabit 0", hw.out.pos.every(function (k) { return k.x === 0; }) && hw.out.pos[hw.out.pos.length - 1].y < -0.9);

/* ---- kesim bulma ---- */
var klipler = [
  { track: 0, start: 0, end: 5 }, { track: 0, start: 5, end: 9 },     // V1 kesim 5
  { track: 1, start: 4.0, end: 5.0 }, { track: 1, start: 5.0, end: 8 }, // V2 kesim 5 (ust katman)
  { track: 0, start: 9, end: 12 }                                       // V1 kesim 9
];
var c1 = T.findCut(klipler, 5.3);
chk("findCut: en yakin kesim, esitlikte ust katman", c1 && c1.cut === 5 && c1.track === 1, JSON.stringify(c1));
var c2 = T.findCut(klipler, 8.6);
chk("findCut: 9'daki kesim", c2 && c2.cut === 9 && c2.a === 1 && c2.b === 4, JSON.stringify(c2));
chk("findCut: uzaktaysa null", T.findCut(klipler, 20) === null);
chk("findCut: bosluklu klipler kesim sayilmaz", T.findCut([{ track: 0, start: 0, end: 4 }, { track: 0, start: 4.5, end: 6 }], 4.2) === null);
chk("fitHalf: kisa klip yari sureyi kisaltir", Math.abs(T.fitHalf(0.4, 0.5, 3) - 0.25) < 1e-9);
chk("fitHalf: cok kisa klip 0", T.fitHalf(0.4, 0.1, 3) === 0);

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
