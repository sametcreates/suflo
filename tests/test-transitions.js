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

/* ---- 3.4 adım 12: özel eğri (yoğun plan) ---- */
var E = require(path.join(__dirname, "..", "js", "ease-curve.js"));
var ALTIN = require(path.join(__dirname, "fixtures", "egri-otomatik-3.4.json"));
var farkli = Object.keys(ALTIN.gecis).filter(function (k) {
  var a = k.split("|"), o = { duration: Number(a[1]), strength: Number(a[2]) };
  var beklenen = JSON.stringify(ALTIN.gecis[k]);
  return JSON.stringify(T.hostPlan(a[0], o)) !== beklenen ||
    JSON.stringify(T.hostPlan(a[0], { duration: o.duration, strength: o.strength, ease: "auto", fps: 25 })) !== beklenen ||
    JSON.stringify(T.hostPlan(a[0], { duration: o.duration, strength: o.strength, ease: "", fps: 60 })) !== beklenen;
});
chk("eğri 'auto' (ve verilmemişse): 13 geçişin host planı 3.4 adım 12 öncesiyle bayt bayt aynı (39 durum)", farkli.length === 0 && Object.keys(ALTIN.gecis).length === 39, farkli.join(","));

function anahtarlar(side) {
  var out = [];
  ["scale", "opacity", "pos"].forEach(function (ad) { if (side[ad]) out.push({ ad: ad, ks: side[ad] }); });
  return out;
}
function deger(k) { return "x" in k ? [k.x, k.y] : k.v; }
function esit(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
var egriler = ["yumusak", "sert-cikis", "ziplama", "yay-canli", "cubic-bezier(0.7, 0, 0.3, 1)", E.sfcKodla({ ad: "Çift", curve: E.builtin("cift-yumusak").curve })];
var yogunSorun = [];
T.list().forEach(function (t) {
  egriler.forEach(function (eg) {
    var seyrek = T.hostPlan(t.id, { duration: 0.6 });
    var yogun = T.hostPlan(t.id, { duration: 0.6, ease: eg, fps: 25 });
    if (yogun.dense !== true || yogun.fps !== 25 || !yogun.ease) yogunSorun.push(t.id + " bayrak");
    ["out", "in"].forEach(function (yan) {
      var sp = anahtarlar(seyrek[yan]), yp = anahtarlar(yogun[yan]);
      if (sp.length !== yp.length) { yogunSorun.push(t.id + " " + yan + " özellik sayısı"); return; }
      sp.forEach(function (s, i) {
        var y = yp[i].ks, sk = s.ks;
        // uçlar seyrek plandakiyle aynı (zaman ve değer) ve çapa
        if (!(y[0].t === sk[0].t && esit(deger(y[0]), deger(sk[0])) && y[0].a === 1)) yogunSorun.push(t.id + " " + yan + " " + s.ad + " baş");
        var ys = y[y.length - 1], ss = sk[sk.length - 1];
        if (!(ys.t === ss.t && esit(deger(ys), deger(ss)) && ys.a === 1)) yogunSorun.push(t.id + " " + yan + " " + s.ad + " son");
        // zamanlar kesin artan; çapalar seyrek anahtarların alt kümesi; iç anahtarlar kare zamanında
        for (var j = 1; j < y.length; j++) if (!(y[j].t > y[j - 1].t)) { yogunSorun.push(t.id + " " + yan + " " + s.ad + " artan değil"); break; }
        y.forEach(function (k) {
          if (k.a && !sk.some(function (q) { return q.t === k.t && esit(deger(q), deger(k)); })) yogunSorun.push(t.id + " " + yan + " çapa seyrekte yok");
          if (!k.a && Math.abs(k.t * 25 - Math.round(k.t * 25)) > 1e-6) yogunSorun.push(t.id + " " + yan + " kare dışı " + k.t);
          if (s.ad === "opacity" && !(deger(k) >= 0 && deger(k) <= 1)) yogunSorun.push(t.id + " opaklık sınır dışı " + deger(k));
        });
        // yoğun plan zamanı seyrek planın kapsamında
        if (y[0].t < sk[0].t || ys.t > ss.t) yogunSorun.push(t.id + " kapsam");
      });
    });
  });
});
chk("özel eğri: 13 geçiş × 6 eğri — uçlar seyrek plandakiyle aynı, çapalar seyrek anahtarlar, zamanlar artan, iç anahtarlar kare zamanında, Opaklık 0..1",
  yogunSorun.length === 0, yogunSorun.slice(0, 5).join(" | "));
var zin = T.hostPlan("zoom-in", { duration: 0.5, ease: "yumusak", fps: 25 });
chk("zoom-in: yoğun planda anahtar sayısı (her taraf 0,25 sn · 25 kare: 2 çapa + 5 iç)", zin.out.scale.length === 7 && zin["in"].scale.length === 7, zin.out.scale.length + "/" + zin["in"].scale.length);
chk("zoom-in: aynı yönlü ara anahtar (1,18) birleşti, eğri ivmeyi veriyor", !zin.out.scale.some(function (k) { return k.a && k.v !== 1 && k.v !== 1.55; }), JSON.stringify(zin.out.scale));
var whip = T.hostPlan("whip-left", { duration: 0.5, ease: "sert-cikis", fps: 30 });
var wOut = whip.out.pos.map(function (k) { return k.x; }), wIn = whip["in"].pos.map(function (k) { return k.x; });
// Ayna: A'nın t = -τ anındaki kayması, B'nin τ anındakinin tersi (whip-left: A sola çıkar, B sağdan girer)
chk("ayna: giden klip (A) eğrinin aynasıyla kesime hızlanır, gelen (B) eğriyle yavaşlar (iki yarı simetrik)",
  wOut.length === wIn.length && wOut.length > 4 && wOut.every(function (x, i) { return Math.abs(x + wIn[wIn.length - 1 - i]) < 1e-5; }), JSON.stringify([wOut, wIn]));
chk("ayna: A yavaş başlayıp kesimde hızlı, B kesimde hızlı başlayıp yavaş biter", Math.abs(wOut[1] - wOut[0]) < Math.abs(wOut[wOut.length - 1] - wOut[wOut.length - 2]) &&
  Math.abs(wIn[1] - wIn[0]) > Math.abs(wIn[wIn.length - 1] - wIn[wIn.length - 2]));
var ziplama = T.hostPlan("bounce", { duration: 0.8, ease: "ziplama", fps: 30 });
chk("bounce: yön değiştiren anahtarlar (esneyip oturma) çapa olarak kaldı", ziplama["in"].scale.filter(function (k) { return k.a; }).length === 4, JSON.stringify(ziplama["in"].scale.filter(function (k) { return k.a; })));
chk("fps yoksa 30; geçersiz eğri hata verir; ease kanonik", T.hostPlan("dip", { duration: 0.5, ease: "yumusak" }).fps === 30 &&
  T.hostPlan("dip", { ease: "cubic-bezier(0.1,0.2,0.3,1)" }).ease === "cubic-bezier(0.1, 0.2, 0.3, 1)" &&
  (function () { try { T.hostPlan("dip", { ease: "dalga" }); return false; } catch (e) { return /Geçersiz eğri/.test(e.message); } })());

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
