// Suflo testi: js/ease-curve.js — Yumuşatma motoru (3.4 adım 9)
// Portions adapted from Rebound (https://github.com/meszmate/rebound), MIT License, Copyright (c) 2026 Rebound contributors. See THIRD_PARTY_NOTICES.md.
// Rebound'un (MIT, commit 0f9fd6c) bezier/penner/spring/sampler/speedgraph/overshoot vitest
// durumları Suflo'nun ok() biçimine uyarlandı (THIRD_PARTY_NOTICES.md › Rebound); geri kalanı Suflo'nun.
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var E = require(path.join(KOK, "js", "ease-curve.js"));
var EN = require(path.join(KOK, "i18n", "en.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function yakin(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol); }
function js(x) { return JSON.stringify(x); }
function enBuyukFark(c1, c2, n) {
  var f = E.toFunction(c1), g = E.toFunction(c2), m = 0;
  n = n || 1000;
  for (var i = 0; i <= n; i++) m = Math.max(m, Math.abs(f(i / n) - g(i / n)));
  return m;
}

/* ================= Rebound: bezier.test.mjs (cubicBezier) ================= */
var cb = E.cubicBezier;
(function () {
  var ease = cb(0.42, 0, 0.58, 1);
  ok("Rebound bezier: uçlar 0 ve 1'e sabit", ease(0) === 0 && ease(1) === 1);
  var lin = cb(0, 0, 1, 1);
  ok("Rebound bezier: doğrusal eğri özdeşlik", [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].every(function (x) { return yakin(lin(x), x, 1e-6); }));
  ok("Rebound bezier: simetrik ease-in-out orta noktası 0,5", yakin(ease(0.5), 0.5, 1e-6));
  var std = cb(0.25, 0.1, 0.25, 1), prev = -Infinity, mono = true;
  for (var i = 0; i <= 100; i++) { var y = std(i / 100); if (y < prev - 1e-9) mono = false; prev = y; }
  ok("Rebound bezier: standart ease tekdüze", mono);
  var asim = cb(0.2, 1.6, 0.2, 1), max = 0;
  for (var j = 0; j <= 200; j++) max = Math.max(max, asim(j / 200));
  ok("Rebound bezier: tutamaç birim kareyi aşınca 1'in üstüne taşar", max > 1, max);
  var capraz = cb(0.9, 0.2, 0.1, 0.8), sonluMu = true;
  for (var k = 0; k <= 100; k++) if (!isFinite(capraz(k / 100))) sonluMu = false;
  ok("Rebound bezier: çapraz tutamaçta (x1 > x2) zaman tekdüze, NaN yok", sonluMu);
})();

/* ================= Suflo: W3C ve uçlar ================= */
var W3C_EASE = E.toFunction({ type: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 });
ok("W3C 'ease' x=0,5'te ≈ 0,8024", yakin(W3C_EASE(0.5), 0.8024, 1e-4), W3C_EASE(0.5));
var tumHazir = E.builtins();
ok("hazır eğrilerin hepsinde uçlar TAM 0 ve 1 (Penner artığı yok)", tumHazir.every(function (b) {
  var f = E.toFunction(b.curve); return f(0) === 0 && f(1) === 1 && f(-0.5) === 0 && f(1.5) === 1;
}), tumHazir.map(function (b) { var f = E.toFunction(b.curve); return b.id + ":" + f(0) + "/" + f(1); }).join(" "));
var xTekduze = true;
[E.builtin("guclu-s").curve, { type: "bezier", x1: 0.9, y1: 0.2, x2: 0.1, y2: 0.8 }, E.builtin("cift-yumusak").curve].forEach(function (c) {
  var pts = E.samplePoints(c, 200);
  for (var i = 1; i < pts.length; i++) if (!(pts[i].x > pts[i - 1].x) || !isFinite(pts[i].y)) xTekduze = false;
});
ok("x örneklemesi tekdüze artan, y sonlu (çapraz tutamaç ve çok noktalı)", xTekduze);

/* ================= Rebound: penner.test.mjs ================= */
var P = E.penner;
ok("Rebound penner: klasik küme tam (10 aile × In/Out/InOut)", ["quad", "cubic", "quart", "quint", "sine", "expo", "circ", "back", "elastic", "bounce"].every(function (a) {
  return ["In", "Out", "InOut"].every(function (d) { return typeof P.get(a + d) === "function" && P.names.indexOf(a + d) !== -1; });
}), P.names.length);
ok("Rebound penner: her fonksiyonda uçlar 0 ve 1", P.names.every(function (n) { var f = P.get(n); return yakin(f(0), 0) && yakin(f(1), 1); }));
ok("Rebound penner: bilinmeyen ad doğrusal", yakin(P.get("nope")(0.42), 0.42, 1e-9) && yakin(P.get("constructor")(0.42), 0.42, 1e-9));
ok("Rebound penner: taşan/salınanlar tekdüze değil", P.isMonotonic("sineInOut") && P.isMonotonic("cubicOut") &&
  !P.isMonotonic("backOut") && !P.isMonotonic("elasticOut") && !P.isMonotonic("bounceOut"));
var tekduzeKalir = P.names.filter(function (n) { return P.isMonotonic(n); }).every(function (n) {
  var f = P.get(n), prev = -Infinity;
  for (var i = 0; i <= 100; i++) { var y = f(i / 100); if (y < prev - 1e-6) return false; prev = y; }
  return true;
});
ok("Rebound penner: tekdüze şekiller tekdüze kalır", tekduzeKalir);
(function () {
  var f = P.get("backOut"), max = 0;
  for (var i = 0; i <= 200; i++) max = Math.max(max, f(i / 200));
  ok("Rebound penner: backOut 1'in üstüne taşar (Taşma)", max > 1, max);
  var fe = P.elasticOutWith(1.6, 2, 8), maxE = 0;
  for (var j = 0; j <= 400; j++) maxE = Math.max(maxE, fe(j / 400));
  ok("Rebound elasticOutWith: uçlar sabit, taşar, 1'e temiz oturur", yakin(fe(0), 0) && yakin(fe(1), 1) && maxE > 1 && Math.abs(fe(0.97) - 1) < 0.05, maxE + " " + fe(0.97));
  function gecis(fn) {
    var n = 0, onceki = fn(0.001) - 1;
    for (var i = 2; i <= 400; i++) { var s = fn(i / 400) - 1; if (onceki !== 0 && s !== 0 && (onceki < 0) !== (s < 0)) n++; onceki = s; }
    return n;
  }
  ok("Rebound elasticOutWith: daha çok salınım = hedefi daha çok geçiş", gecis(P.elasticOutWith(1.6, 5, 6)) > gecis(P.elasticOutWith(1.6, 1.5, 6)));
  var bozuk = P.elasticOutWith(0.2, 0, 0), nanYok = true;
  for (var k = 0; k <= 50; k++) if (isNaN(bozuk(k / 50))) nanYok = false;
  ok("Rebound elasticOutWith: alt sınırın altındaki girdi NaN üretmez", nanYok);
})();
ok("Zıplama ve Esnek 1'de biter", E.toFunction(E.builtin("ziplama").curve)(1) === 1 && E.toFunction(E.builtin("esnek").curve)(1) === 1 &&
  yakin(P.get("bounceOut")(1), 1) && yakin(P.get("elasticOut")(1), 1) && yakin(P.get("bounceOut")(0.999), 1, 1e-3));

/* ================= Rebound: spring.test.mjs ================= */
var S = E.spring;
(function () {
  var s = S.spring({ mass: 1, stiffness: 120, damping: 14 });
  ok("Rebound yay: 0'dan başlar, 1'e oturur", yakin(s.fn(0), 0) && Math.abs(s.fn(s.settleTime * 4) - 1) < 0.005);
  ok("Rebound yay: sönüm rejimleri", S.spring({ mass: 1, stiffness: 100, damping: 5 }).regime === "underdamped" &&
    S.spring({ mass: 1, stiffness: 100, damping: 20 }).regime === "critical" && S.spring({ mass: 1, stiffness: 100, damping: 60 }).regime === "overdamped");
  var az = S.spring({ mass: 1, stiffness: 200, damping: 6 }), max = 0, dt = az.settleTime / 400, t;
  for (t = 0; t <= az.settleTime; t += dt) max = Math.max(max, az.fn(t));
  ok("Rebound yay: az sönümlü hedefi aşar", max > 1, max);
  var cok = S.spring({ mass: 1, stiffness: 100, damping: 80 }), asmaz = true;
  dt = cok.settleTime / 400;
  for (t = 0; t <= cok.settleTime; t += dt) if (cok.fn(t) > 1 + 1e-6) asmaz = false;
  ok("Rebound yay: aşırı sönümlü hiç aşmaz", asmaz);
  var h = 1e-5;
  ok("Rebound yay: hız 0 iken durağan bırakılır (x'(0) ≈ 0)", [{ mass: 1, stiffness: 120, damping: 12 }, { mass: 1, stiffness: 100, damping: 20 },
    { mass: 1, stiffness: 100, damping: 80 }].every(function (cfg) {
    var y = S.spring({ mass: cfg.mass, stiffness: cfg.stiffness, damping: cfg.damping, velocity: 0 });
    return Math.abs((y.fn(h) - y.fn(0)) / h) < 0.05;
  }));
  var pk = S.spring({ mass: 1, stiffness: 120, damping: 12, velocity: 0 });
  var beklenen = 1 + Math.exp(-Math.PI * pk.zeta / Math.sqrt(1 - pk.zeta * pk.zeta)), tepe = 0;
  dt = pk.settleTime / 2000;
  for (t = 0; t <= pk.settleTime; t += dt) tepe = Math.max(tepe, pk.fn(t));
  ok("Rebound yay: gerçek tepe aşımı sönüm oranı formülüne uyar", yakin(tepe, beklenen, 0.005), tepe + " ~ " + beklenen);
  ok("Rebound yay: ilk hıza uyar", S.spring({ mass: 1, stiffness: 100, damping: 8, velocity: 5 }).fn(0.02) > S.spring({ mass: 1, stiffness: 100, damping: 8, velocity: 0 }).fn(0.02));
  ok("Rebound yay: Apple response/bounce eşlemesi", S.spring({ response: 0.5, bounce: 0.4 }).regime === "underdamped" &&
    S.spring({ response: 0.5, bounce: 0 }).regime === "critical" && S.spring({ response: 0.5, bounce: -0.4 }).regime === "overdamped");
  ok("Rebound yay: response/dampingFraction sönüm oranı", yakin(S.spring({ response: 0.5, dampingFraction: 0.7 }).zeta, 0.7, 1e-6));
  ok("Rebound yay: sönüm arttıkça oturma süresi kısalır", S.spring({ mass: 1, stiffness: 100, damping: 18 }).settleTime < S.spring({ mass: 1, stiffness: 100, damping: 6 }).settleTime);
  var n = S.springNormalized({ response: 0.4, bounce: 0.3 });
  ok("Rebound yay: springNormalized eğriyi [0,1] zamanına yayar", n(0) === 0 && n(1) === 1 && n.spec.regime === "underdamped");
  // Suflo: settleTime içinde oturur — oturma süresinden sonra hedefin %0,5'i içinde kalır
  // (zarf %0,5'e iner; kosinüs + sinüs genliği √(1+B²) < 2 olduğundan bant %1)
  var lively = S.spring({ response: 0.5, bounce: 0.4 }), icinde = true, once = false;
  for (t = lively.settleTime; t <= lively.settleTime * 3; t += lively.settleTime / 200) if (Math.abs(lively.fn(t) - 1) > 0.01) icinde = false;
  for (t = 0; t < lively.settleTime * 0.5; t += lively.settleTime / 200) if (Math.abs(lively.fn(t) - 1) > 0.01) once = true;
  ok("yay settleTime içinde oturur (sonrasında hep %1 bandında, öncesinde değil)", icinde && once && isFinite(lively.settleTime), lively.settleTime);
  ok("resolveParams fiziksel varsayılanlar", js(E.resolveParams({})) === js({ mass: 1, stiffness: 100, damping: 10, velocity: 0 }));

  // Suflo: settleTime her rejimde gerçekten oturur (kritik ve aşırı sönümlüde yavaş kök, az
  // sönümlüde başlangıç genliği). Eskiden bounce ≤ 0 yay hedefin çok gerisinde kalıyor ve
  // pişirilen eğri son karede 1'e sıçrıyordu.
  var rejimler = [{ response: 0.5, bounce: 0.4 }, { response: 0.5, bounce: 0.05 }, { response: 0.5, bounce: 0.01 }, { response: 0.5, bounce: 0 },
    { response: 0.5, bounce: -0.3 }, { response: 0.5, bounce: -0.5 }, { response: 2, bounce: -0.95 }, { response: 0.5, dampingFraction: 2 },
    { response: 0.5, dampingFraction: 5 }, { stiffness: 100, damping: 20 }, { stiffness: 100, damping: 40 }, { mass: 1, stiffness: 100, damping: 80 },
    { mass: 0.01, stiffness: 0.1, damping: 10000 }, { stiffness: 100, damping: 20, velocity: -1000 }, { stiffness: 100, damping: 60, velocity: 1000 }];
  var oturmayan = rejimler.filter(function (o) {
    var y = S.spring(o), son = 0;
    for (t = y.settleTime; t <= y.settleTime * 4; t += y.settleTime / 400) son = Math.max(son, Math.abs(y.fn(t) - 1));
    return !(isFinite(y.settleTime) && son <= 0.005 + 1e-9);
  });
  ok("yay: settleTime'dan sonra her rejimde hedefin %0,5'i içinde (kritik, aşırı sönümlü, kritiğe yakın, ilk hızlı)", oturmayan.length === 0, js(oturmayan));
  var sicrayan = rejimler.filter(function (o) {
    var c = { type: "spring" };
    Object.keys(o).forEach(function (k) { c[k] = o[k]; });
    return Math.abs(E.toFunction(c)(0.999) - 1) >= 0.01 || Math.abs(E.toFunction(c)(0.99) - 1) >= 0.01;
  });
  ok("yay: normalize eğri 1'e varmadan hedefin %1'i içinde (son karede sıçrama yok)", sicrayan.length === 0, js(sicrayan));
  var sonAnahtar = [0, -0.3, -0.95].map(function (b) {
    var pl = E.bakePlan({ t0: 0, t1: 1, v0: 0, v1: 1000, fps: 30, curve: { type: "spring", response: 0.5, bounce: b } });
    return pl.keys[pl.keys.length - 1].v;
  });
  ok("bakePlan: bounce 0 / −0,3 / −0,95 yayında son iç anahtar hedefin %1'i içinde", sonAnahtar.every(function (v) { return Math.abs(v - 1000) < 10; }), js(sonAnahtar));
})();

/* ================= Rebound: sampler.test.mjs (samplePoints, range, bakeFactors) ================= */
(function () {
  var pts = E.samplePoints({ type: "penner", name: "cubicInOut" }, 50);
  ok("Rebound sampler: samplePoints segments+1 nokta, x [0,1]", pts.length === 51 && pts[0].x === 0 && pts[50].x === 1);
  ok("Rebound sampler: range yayda 1'i aşar", E.range({ type: "spring", mass: 1, stiffness: 200, damping: 6 }).max > 1);
  var r = E.range({ type: "penner", name: "sineInOut" });
  ok("Rebound sampler: range sade ease'te [0,1] içinde", r.min >= -1e-6 && r.max <= 1 + 1e-6);
  var f = E.bakeFactors({ type: "penner", name: "quadOut" }, 10);
  ok("Rebound sampler: bakeFactors iki ucu ve istenen sayıyı içerir", f.length === 10 && yakin(f[0], 0) && yakin(f[9], 1));
  var tp = E.turningPoints({ type: "penner", name: "backOut" }, 600);
  var fb = E.toFunction({ type: "penner", name: "backOut" });
  ok("turningPoints: Taşma'nın tek tepesi + iki uç", tp.length === 3 && tp[0].t === 0 && tp[2].t === 1 && tp[1].y > 1 && Math.abs(fb(tp[1].t) - tp[1].y) < 1e-9, js(tp));
  ok("turningPoints: tekdüze eğride yalnız uçlar", E.turningPoints(E.builtin("yumusak").curve).length === 2);
})();

/* ================= Rebound: speedgraph.test.mjs ================= */
(function () {
  var SG = E.speedgraph;
  var s = SG.endpointSpeeds({ x1: 0, y1: 0, x2: 1, y2: 1 });
  ok("Rebound hız: doğrusal eğride uç hızları (x1 = 0 kuralı) 0", s.start === 0 && s.end === 0);
  s = SG.endpointSpeeds({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
  ok("Rebound hız: simetrik ease-in-out uçlarda 0", yakin(s.start, 0, 1e-9) && yakin(s.end, 0, 1e-9));
  s = SG.endpointSpeeds({ x1: 0.25, y1: 0.5, x2: 0.75, y2: 0.5 });
  ok("Rebound hız: uç hızları değer eğrisinin eğimi", yakin(s.start, 2, 1e-9) && yakin(s.end, 2, 1e-9));
  var c = SG.withStartSpeed({ x1: 0.4, y1: 0, x2: 0.6, y2: 1 }, 2.5);
  ok("Rebound hız: withStartSpeed geri okunur, etki (x1) korunur", yakin(SG.endpointSpeeds(c).start, 2.5, 1e-9) && c.x1 === 0.4, js(c));
  c = SG.withEndSpeed({ x1: 0.4, y1: 0, x2: 0.6, y2: 1 }, 1.8);
  ok("Rebound hız: withEndSpeed geri okunur, x2 korunur", yakin(SG.endpointSpeeds(c).end, 1.8, 1e-9) && c.x2 === 0.6, js(c));
  var cc = { x1: 0.3, y1: 0.1, x2: 0.7, y2: 0.9 }, pts = SG.sampleSpeed(cc, 48), uc = SG.endpointSpeeds(cc);
  ok("Rebound hız: sampleSpeed uçları endpointSpeeds, zaman [0,1]", yakin(pts[0].x, 0, 1e-9) && yakin(pts[48].x, 1, 1e-9) &&
    yakin(pts[0].s, uc.start, 1e-9) && yakin(pts[48].s, uc.end, 1e-9));
  pts = SG.sampleSpeed({ x1: 1 / 3, y1: 1 / 3, x2: 2 / 3, y2: 2 / 3 }, 40);
  ok("Rebound hız: doğrusal eğrinin içi sabit 1", pts.slice(1, -1).every(function (p) { return yakin(p.s, 1, 1e-6); }));
  function alan(p) { var a = 0; for (var i = 1; i < p.length; i++) a += 0.5 * (p[i].s + p[i - 1].s) * (p[i].x - p[i - 1].x); return a; }
  ok("Rebound hız: hız profilinin integrali ≈ 1", yakin(alan(SG.sampleSpeed({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 }, 2000)), 1, 0.01));
  var bh = SG.withEndSpeed(SG.withStartSpeed({ type: "bezier", x1: 0.4, y1: 0, x2: 0.6, y2: 1 }, 1.5), 0.5);
  var ub = SG.endpointSpeeds(bh);
  ok("Rebound hız: başlangıç/bitiş hızıyla düzenlenen eğri ikisini de korur, etkiler %40", yakin(ub.start, 1.5, 1e-9) && yakin(ub.end, 0.5, 1e-9) &&
    yakin(bh.x1 * 100, 40, 1e-6) && yakin((1 - bh.x2) * 100, 40, 1e-6));
  var rr = SG.speedRange({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
  ok("Rebound hız: speedRange ease-in-out ortasında 1'i aşar", rr.min <= 0 && rr.max > 1);
  // Suflo: bezier dışı eğride sayısal hız
  var ps = E.sampleSpeed({ type: "penner", name: "quadIn" }, 50);
  ok("hız (Suflo): penner quadIn sayısal hız ≈ 2x, ortalama ≈ 1", ps.length === 51 && yakin(ps[25].s, 1, 0.01) && yakin(ps[50].s, 2, 0.01) && yakin(alan(ps), 1, 0.01));
  var mu = E.endpointSpeeds(E.builtin("cift-yumusak").curve);
  ok("hız (Suflo): Çift yumuşak uçlarda ~0 hız", Math.abs(mu.start) < 0.05 && Math.abs(mu.end) < 0.05, js(mu));
  ok("hız (Suflo): withStartSpeed bezier dışında null", SG.withStartSpeed({ type: "penner", name: "quadIn" }, 2) === null);
})();

/* ================= Rebound: overshoot.test.mjs (dampedSine, extremaTimes, autoDuration, followThroughAnchors) ================= */
(function () {
  var O = E.overshoot;
  function ref(freq, decay) { return function (t) { return Math.sin(2 * Math.PI * freq * t) * Math.exp(-decay * t); }; }
  var f = O.dampedSine(2, 6), r = ref(2, 6);
  ok("Rebound yaylanma: dampedSine = sin(2πft)·e^(−dt)", [0.01, 0.1, 0.25, 0.5, 0.8].every(function (t) { return yakin(f(t), r(t), 1e-12); }));
  ok("Rebound yaylanma: 0'da başlar, 0'a söner", f(0) === 0 && Math.abs(f(2)) < 0.01);
  var s = O.dampedSine(2, 6), ts = O.extremaTimes(2, 6, 1.5), h = 1e-6;
  ok("Rebound yaylanma: extremaTimes türevin sıfır olduğu anlar", ts.length > 1 && ts.every(function (t) { return Math.abs((s(t + h) - s(t - h)) / (2 * h)) < 1e-3; }), ts.length);
  var ilk = ts[0];
  ok("Rebound yaylanma: ilk uç değer aşım tepesi (> 0, komşularından yüksek)", s(ilk) > 0 && s(ilk) > s(ilk - 0.02) && s(ilk) > s(ilk + 0.02));
  var t3 = O.extremaTimes(3, 4, 2), yarim = 1 / 6, aralik = true;
  for (var i = 1; i < t3.length; i++) if (!yakin(t3[i] - t3[i - 1], yarim, 1e-9)) aralik = false;
  ok("Rebound yaylanma: uç değerler yarım periyot arayla", aralik);
  ok("Rebound yaylanma: süre içinde kalır", O.extremaTimes(2, 6, 0.5).every(function (t) { return t < 0.5; }));
  ok("Rebound yaylanma: autoDuration sönümle kısalır, sınırlı", O.autoDuration(6) > 0.5 && O.autoDuration(6) < 1 && O.autoDuration(50) === 0.25 && O.autoDuration(0.1) === 2.0);
  var a = O.followThroughAnchors(2, 6, 0);
  ok("Rebound yaylanma: followThroughAnchors (0,0)'da başlar, neredeyse oturmuş biter", a[0].t === 0 && a[0].s === 0 && a.length >= 3 && Math.abs(a[a.length - 1].s) < 0.05);
  var s5 = O.dampedSine(2, 5), a5 = O.followThroughAnchors(2, 5, 1.2);
  ok("Rebound yaylanma: her iç çapa gerçek bir uç değer", a5.slice(1, -1).every(function (p) {
    return Math.abs((s5(p.t + h) - s5(p.t - h)) / (2 * h)) < 1e-3 && yakin(p.s, s5(p.t), 1e-12);
  }));
  var ic = a5.slice(1, -1), sirayla = true;
  for (var j = 1; j < ic.length; j++) if (Math.sign(ic[j].s) !== -Math.sign(ic[j - 1].s)) sirayla = false;
  ok("Rebound yaylanma: hedefin bir üstünde bir altında", sirayla && ic.length >= 2);
})();

/* ================= Suflo: normalize ================= */
(function () {
  ok("normalize: bilinmeyen tür, NaN, Infinity, eksik alan reddedilir", E.normalize(null) === null && E.normalize({ type: "x" }) === null &&
    E.normalize({ type: "bezier", x1: NaN, y1: 0, x2: 1, y2: 1 }) === null && E.normalize({ type: "bezier", x1: 0, y1: Infinity, x2: 1, y2: 1 }) === null &&
    E.normalize({ type: "bezier", x1: "0.2", y1: 0, x2: 1, y2: 1 }) === null && E.normalize({ type: "penner", name: "toString" }) === null);
  var b = E.normalize({ type: "bezier", x1: -2, y1: 9, x2: 3, y2: -9 });
  ok("normalize: bezier x [0,1], y [-1,2]", js(b) === js({ type: "bezier", x1: 0, y1: 2, x2: 1, y2: -1 }), js(b));
  var yay = E.normalize({ type: "spring", bounce: 5, response: 0, mass: -1, kotu: 1, flip: "evet" });
  ok("normalize: yay alanları sınırlı, bilinmeyen alan ve bayrak atılır", yay.bounce === 0.95 && yay.response === 0.05 && yay.mass === 0.01 && !("kotu" in yay) && !("flip" in yay), js(yay));
  var cok = [];
  for (var i = 0; i <= 20; i++) cok.push({ x: i / 20, y: Math.sin(i), ox: 5, oy: 9, ix: -3, iy: -9 });
  cok.push({ x: 0.5005, y: 0.3 }, { x: NaN, y: 1 }, { x: 0.3, y: Infinity }, null);
  var m = E.normalize({ type: "multi", pts: cok });
  var p = m.pts, sirali = true, tutamac = true;
  for (var j = 0; j < p.length; j++) {
    if (j > 0 && !(p[j].x >= p[j - 1].x + 0.01 - 1e-9)) sirali = false;
    if (j > 0 && (p[j].ix < p[j - 1].x || p[j].ix > p[j].x)) tutamac = false;
    if (j < p.length - 1 && (p[j].ox < p[j].x || p[j].ox > p[j + 1].x)) tutamac = false;
    if (p[j].y < -1 || p[j].y > 2 || p[j].iy < -1 || p[j].iy > 2 || p[j].oy < -1 || p[j].oy > 2) tutamac = false;
  }
  ok("normalize multi: en çok 8 nokta, x artan, aralık ≥ 0,01, uçlar (0,0)–(1,1)", p.length === 8 && sirali && p[0].x === 0 && p[0].y === 0 &&
    p[7].x === 1 && p[7].y === 1, js(p.map(function (q) { return q.x; })));
  ok("normalize multi: tutamaç x kendi parçasında, y [-1,2] (eğri zamanın fonksiyonu kalır)", tutamac);
  var fm = E.toFunction(m), xs = E.samplePoints(m, 500), x2 = true;
  for (var k = 1; k < xs.length; k++) if (!(xs[k].x > xs[k - 1].x) || !isFinite(xs[k].y)) x2 = false;
  ok("normalize multi: örnekleme sonlu, uçlar tam", x2 && fm(0) === 0 && fm(1) === 1);
  var bos = E.normalize({ type: "multi", pts: [{ x: 0.4, y: 0.7 }] });
  ok("normalize multi: tek nokta reddedilir; iki iç nokta uçlar eklenerek tamamlanır", bos === null &&
    js(E.normalize({ type: "multi", pts: [{ x: 0.3, y: 0.6 }, { x: 0.6, y: 0.2 }] }).pts.map(function (q) { return [q.x, q.y]; })) === js([[0, 0], [0.3, 0.6], [0.6, 0.2], [1, 1]]));
  var tutamacsiz = E.normalize({ type: "multi", pts: [{ x: 0, y: 0 }, { x: 0.5, y: 0.8 }, { x: 1, y: 1 }] });
  ok("normalize multi: tutamaçsız noktalar doğru parçalar çizer", yakin(E.toFunction(tutamacsiz)(0.25), 0.4, 1e-5) && yakin(E.toFunction(tutamacsiz)(0.75), 0.9, 1e-5));
  var kotuGirdi = { type: "multi", pts: [] };
  for (var z = 0; z < 100000; z++) kotuGirdi.pts.push({ x: Math.random(), y: Math.random() });
  var bas = Date.now(), kn = E.normalize(kotuGirdi);
  ok("normalize multi: dev nokta listesi hızlı ve sınırlı (ilk 64 incelenir)", kn.pts.length <= 8 && Date.now() - bas < 200);
  // tam 0,01 aralık yasal: kayan nokta artığı (0,05 + 0,01 = 0,060000000000000005) noktayı atmamalı
  var dusen = [];
  for (var g = 1; g <= 98; g++) {
    var a1 = g / 100, a2 = (g + 1) / 100;
    var n1 = E.normalize({ type: "multi", pts: [{ x: 0, y: 0 }, { x: a1, y: 0.3 }, { x: a2, y: 0.6 }, { x: 1, y: 1 }] });
    if (n1.pts.length !== 4 || js(E.normalize(n1)) !== js(n1)) dusen.push(a1 + "/" + a2);
  }
  ok("normalize multi: tam 0,01 aralıklı noktalar korunur, normalize∘normalize = normalize", dusen.length === 0 &&
    E.normalize({ type: "multi", pts: [{ x: 0, y: 0 }, { x: 0.14, y: 0.1 }, { x: 0.15, y: 0.8 }, { x: 1, y: 1 }] }).pts.length === 4 &&
    E.normalize({ type: "multi", pts: [{ x: 0, y: 0 }, { x: 0.05, y: 0.3 }, { x: 0.06, y: 0.6 }, { x: 1, y: 1 }] }).pts.length === 4 &&
    E.normalize({ type: "multi", pts: [{ x: 0, y: 0 }, { x: 0.01, y: 0.3 }, { x: 0.99, y: 0.6 }, { x: 1, y: 1 }] }).pts.length === 4, dusen.join(" "));
})();

/* ================= Suflo: split (de Casteljau) ================= */
(function () {
  var e = E.builtin("yumusak").curve, s = E.split(e, 0.3);
  ok("split: bezier 3 noktalı multi olur, şekil değişmez", s.type === "multi" && s.pts.length === 3 && s.pts[1].x === 0.3 && s.pts[1].smooth === true &&
    enBuyukFark(e, s) < 1e-5, enBuyukFark(e, s));
  var g = E.builtin("guclu-s").curve, s2 = E.split(E.split(g, 0.2), 0.7);
  ok("split: çapraz tutamaçlı Güçlü S iki kez bölünür, şekil aynı", s2.pts.length === 4 && enBuyukFark(g, s2) < 1e-5, enBuyukFark(g, s2));
  var c = E.builtin("cift-yumusak").curve, s3 = E.split(c, 0.8);
  ok("split: çok noktalı eğride doğru parçaya nokta eklenir", s3.pts.length === 4 && s3.pts[3].x === 1 && yakin(s3.pts[2].x, 0.8, 1e-6) && enBuyukFark(c, s3) < 1e-5);
  ok("split: noktaya çok yakın, sınır dışı, penner ve dolu eğri reddedilir", E.split(c, 0.505) === null && E.split(c, 0.995) === null && E.split(c, NaN) === null &&
    E.split({ type: "penner", name: "quadIn" }, 0.5) === null);
  // tam çapraz tutamaçlı parçada alt eğrinin tutamacı kendi parçasından taşar: kırpmak şekli bozardı → null
  var capraz = { type: "bezier", x1: 1, y1: 0, x2: 0, y2: 1 }, ortadan = E.split(capraz, 0.5);
  ok("split: şekli koruyamayacağı yerde reddeder (tam çapraz tutamaç), ortadan böler", E.split(capraz, 0.2) === null && E.split(capraz, 0.7) === null &&
    ortadan && enBuyukFark(capraz, ortadan) < 1e-4, ortadan ? enBuyukFark(capraz, ortadan) : "null");
  var dolu = E.builtin("yumusak").curve;
  [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].forEach(function (x) { dolu = E.split(dolu, x) || dolu; });
  ok("split: 8 noktada durur", dolu.pts.length === 8 && E.split(dolu, 0.8) === null && enBuyukFark(E.builtin("yumusak").curve, dolu) < 1e-5);
  // sınırda bölme (komşu + 0,01 ve 1 − 0,01): nokta eklenir ve şekil aynı kalır; asla şekli değişmiş eğri dönmez
  var sinirda = [[E.builtin("yumusak-giris-cikis").curve, 0.01], [E.builtin("yumusak-giris-cikis").curve, 0.99], [E.builtin("guclu-s").curve, 0.01],
    [E.builtin("guclu-s").curve, 0.99], [E.builtin("yumusak").curve, 0.01], [E.builtin("yumusak").curve, 0.99], [E.builtin("cift-yumusak").curve, 0.51],
    [E.builtin("cift-yumusak").curve, 0.49], [E.split(E.builtin("yumusak").curve, 0.3), 0.31], [E.split(E.builtin("yumusak").curve, 0.3), 0.29]];
  var bozulan = sinirda.filter(function (s) {
    var sp = E.split(s[0], s[1]);
    return !sp || sp.pts.length !== E.toMulti(s[0]).pts.length + 1 || enBuyukFark(s[0], sp) > 1e-5;
  }).map(function (s) { return s[1]; });
  ok("split: komşudan tam 0,01 uzakta ve 0,99'da nokta eklenir, şekil değişmez", bozulan.length === 0, js(bozulan));
  var sekilBozuk = [];
  [E.builtin("yumusak").curve, E.builtin("guclu-s").curve, E.builtin("cift-yumusak").curve, { type: "bezier", x1: 1, y1: 0, x2: 0, y2: 1 },
    { type: "bezier", x1: 0.9, y1: -0.5, x2: 0.1, y2: 1.6 }].forEach(function (c0, ci) {
    for (var q = 0; q <= 100; q++) {
      var sp = E.split(c0, q / 100);
      if (sp && (sp.pts.length !== E.toMulti(c0).pts.length + 1 || enBuyukFark(c0, sp, 400) > 1e-4)) sekilBozuk.push(ci + "@" + q / 100);
    }
  });
  ok("split: 0,01 ızgarasının her yerinde ya null ya da aynı şekil (+1 nokta)", sekilBozuk.length === 0, sekilBozuk.join(" "));
})();

/* ================= Suflo: flip / invert ================= */
(function () {
  var giris = E.builtin("yumusak-giris").curve, cikis = E.builtin("yumusak-cikis").curve;
  ok("flip: Yumuşak giriş ↔ Yumuşak çıkış", js(E.flip(giris)) === js(cikis) && js(E.flip(cikis)) === js(giris), js(E.flip(giris)));
  var f = E.toFunction(E.flip(E.builtin("yumusak").curve)), g = E.toFunction(E.builtin("yumusak").curve);
  ok("flip: 180° döndürme g(x) = 1 − f(1 − x)", [0.1, 0.33, 0.5, 0.8].every(function (x) { return yakin(f(x), 1 - g(1 - x), 1e-5); }));
  var ozdes = E.builtins().every(function (b) {
    var ff = E.flip(E.flip(b.curve));
    return js(ff) === js(b.curve) && enBuyukFark(ff, b.curve, 300) < 1e-9;
  });
  ok("flip∘flip: tüm hazır eğrilerde özdeşlik", ozdes);
  ok("flip: penner In↔Out, InOut aynı; yay bayrak", E.flip({ type: "penner", name: "expoIn" }).name === "expoOut" && E.flip({ type: "penner", name: "bounceInOut" }).name === "bounceInOut" &&
    E.flip(E.builtin("yay-canli").curve).flip === true && E.flip(E.flip(E.builtin("yay-canli").curve)).flip === undefined);
  var yf = E.toFunction(E.flip(E.builtin("yay-canli").curve)), yg = E.toFunction(E.builtin("yay-canli").curve);
  ok("flip: döndürülmüş yay 1 − f(1 − x)", yakin(yf(0.3), 1 - yg(0.7), 1e-12) && yf(0) === 0 && yf(1) === 1);
  var mf = E.flip(E.builtin("cift-yumusak").curve);
  ok("flip: çok noktalı (simetrik Çift yumuşak) kendine döner", enBuyukFark(mf, E.builtin("cift-yumusak").curve) < 1e-6);
  var asim = E.normalize({ type: "multi", pts: [{ x: 0, y: 0, ox: 0.1, oy: 0.4 }, { x: 0.3, y: 0.7, ix: 0.2, iy: 0.7, ox: 0.5, oy: 0.7 }, { x: 1, y: 1, ix: 0.9, iy: 1 }] });
  var af = E.toFunction(E.flip(asim)), ag = E.toFunction(asim);
  ok("flip: asimetrik çok noktalı eğri döner, flip∘flip özdeş", [0.15, 0.4, 0.69, 0.9].every(function (x) { return yakin(af(x), 1 - ag(1 - x), 1e-5); }) &&
    js(E.flip(E.flip(asim))) === js(asim));
  // noktaları tam 0,01 aralıklı eğrilerde flip nokta kaybetmez, flip∘flip özdeş
  var flipKayip = [];
  for (var fx = 1; fx <= 97; fx++) {
    var b1 = fx / 100, b2 = (fx + 1) / 100;
    var c01 = E.normalize({ type: "multi", pts: [{ x: 0, y: 0 }, { x: b1, y: 0.3, ox: b1 + 0.005, oy: 0.5 }, { x: b2, y: 0.6, ix: b2 - 0.004, iy: 0.4 }, { x: 1, y: 1 }] });
    var fl = E.flip(c01), ff = E.flip(fl);
    if (c01.pts.length !== 4 || fl.pts.length !== 4 || js(ff) !== js(c01) ||
      [0.2, 0.5, 0.8].some(function (x) { return !yakin(E.toFunction(fl)(x), 1 - E.toFunction(c01)(1 - x), 1e-5); })) flipKayip.push(b1 + "/" + b2);
  }
  ok("flip∘flip: noktaları tam 0,01 aralıklı eğrilerde özdeşlik, flip nokta kaybetmez", flipKayip.length === 0, flipKayip.join(" "));
  var yAdim = E.normalize({ type: "multi", pts: [{ x: 0, y: 0 }, { x: 0.3, y: 0.05 }, { x: 0.6, y: 0.06 }, { x: 0.8, y: 0.07 }, { x: 1, y: 1 }] });
  var yAdimTers = E.invert(yAdim);
  ok("invert∘invert: y değerleri tam 0,01 aralıklı tekdüze eğride özdeşlik", yAdimTers && yAdimTers.pts.length === 5 && js(E.invert(yAdimTers)) === js(yAdim),
    yAdimTers ? yAdimTers.pts.length : "null");

  var tekduze = ["dogrusal", "yumusak", "yumusak-giris", "yumusak-cikis", "yumusak-giris-cikis", "sert-giris", "sert-cikis", "guclu-s", "cift-yumusak"];
  var invOzdes = tekduze.every(function (id) {
    var c = E.builtin(id).curve, i1 = E.invert(c);
    return i1 && js(E.invert(i1)) === js(c);
  });
  ok("invert∘invert: tekdüze hazır eğrilerde özdeşlik", invOzdes);
  var red = ["geri-cekil", "tasma", "esnek", "ziplama", "yay-yumusak", "yay-canli"].filter(function (id) { return E.invert(E.builtin(id).curve) !== null; });
  ok("invert: taşan / salınan eğriler reddedilir (null)", red.length === 0, red.join(","));
  ok("invert: tutamacı birim kare dışındaki bezier reddedilir", E.invert({ type: "bezier", x1: 0.2, y1: 1.6, x2: 0.2, y2: 1 }) === null);
  var ie = E.toFunction(E.invert(E.builtin("yumusak").curve)), fe = E.toFunction(E.builtin("yumusak").curve);
  ok("invert: ters fonksiyon f⁻¹(f(x)) = x (bezier)", [0.1, 0.3, 0.6, 0.9].every(function (x) { return yakin(ie(fe(x)), x, 1e-4); }));
  var ip = E.toFunction(E.invert(E.builtin("sert-cikis").curve)), fp = E.toFunction(E.builtin("sert-cikis").curve);
  ok("invert: ters fonksiyon f⁻¹(f(x)) = x (penner, bayrakla)", [0.1, 0.3, 0.6, 0.9].every(function (x) { return yakin(ip(fp(x)), x, 1e-6); }));
  var im = E.toFunction(E.invert(E.builtin("cift-yumusak").curve)), fm = E.toFunction(E.builtin("cift-yumusak").curve);
  ok("invert: çok noktalı eğride eksen değişimi tersi verir", [0.15, 0.3, 0.7, 0.85].every(function (x) { return yakin(im(fm(x)), x, 1e-4); }));
  var tepeli = E.normalize({ type: "multi", pts: [{ x: 0, y: 0 }, { x: 0.5, y: 1.2 }, { x: 1, y: 1 }] });
  ok("invert: tekdüze olmayan çok noktalı eğri reddedilir", E.invert(tepeli) === null);
  var ki = E.invert(E.flip(E.builtin("sert-giris").curve)), ik = E.flip(E.invert(E.builtin("sert-giris").curve));
  ok("invert ve flip yer değiştirebilir", enBuyukFark(ki, ik, 400) < 1e-9);
  ok("isMonotonic: Yumuşak evet, Taşma hayır", E.isMonotonic(E.builtin("yumusak").curve) && !E.isMonotonic(E.builtin("tasma").curve));
  // inceleme r2: normalize, invert() ile aynı kuralı uygular — tekdüze olmayan eğrideki 'inv' (elle yazılmış / paylaşılmış JSON)
  // düşer; yoksa ikiye bölme sona dek sıfıra yakın kalıp son karede 1'e sıçrayan bir eğri verirdi
  var invBack = E.normalize({ type: "penner", name: "backOut", inv: true });
  var invElastik = E.normalize({ type: "penner", name: "elasticOut", inv: true });
  var invYay = E.normalize({ type: "spring", response: 0.5, bounce: 0.4, inv: true, flip: true });
  var invExpo = E.normalize({ type: "penner", name: "expoOut", inv: true });
  var invYumYay = E.invert({ type: "spring", response: 0.5, bounce: 0 });
  ok("normalize: tekdüze olmayan eğride 'inv' düşer (backOut, elasticOut, taşan yay); tekdüzede kalır", invBack && !invBack.inv &&
    invElastik && !invElastik.inv && invYay && !invYay.inv && invYay.flip === true && invExpo.inv === true &&
    invYumYay && invYumYay.inv === true && E.normalize(invYumYay).inv === true, js([invBack, invYay, invExpo, invYumYay]));
  var fInvYay = E.toFunction({ type: "spring", response: 0.5, bounce: 0.4, inv: true });
  ok("normalize: düşen 'inv' ile eğri sıçramaz (x = 0,95'te değer yayın kendi değeri)", yakin(fInvYay(0.95), E.toFunction({ type: "spring", response: 0.5, bounce: 0.4 })(0.95), 1e-12) &&
    js(E.normalize(invBack)) === js(invBack));
})();

/* ================= Suflo: toCss / fromCss ================= */
(function () {
  ok("toCss: Güçlü S", E.toCss(E.builtin("guclu-s").curve) === "cubic-bezier(0.87, 0, 0.13, 1)");
  ok("toCss: bezier dışı eğri null (çok noktalının metin sözdizimi yok)", E.toCss(E.builtin("cift-yumusak").curve) === null && E.toCss(E.builtin("tasma").curve) === null);
  ok("fromCss: kısa yazım (.17,.67,.83,.67) ve boşluklar", js(E.fromCss(" cubic-bezier( .17 , .67,.83, .67 ) ")) === js({ type: "bezier", x1: 0.17, y1: 0.67, x2: 0.83, y2: 0.67 }));
  ok("fromCss → toCss gidiş-dönüş", E.builtins().filter(function (b) { return b.curve.type === "bezier"; }).every(function (b) {
    return js(E.fromCss(E.toCss(b.curve))) === js(b.curve);
  }));
  ok("fromCss: y aşımı (geri tepme) kabul", E.fromCss("cubic-bezier(0.34, 1.56, 0.64, 1)").y1 === 1.56);
  var kotu = ["cubic-bezier(NaN, 0, 1, 1)", "cubic-bezier(0.1, 0.2, 0.3, 0.4, 0.5)", "cubic-bezier(0.1, 0.2, 0.3)", "cubic-bezier(1.2, 0, 0.5, 1)",
    "cubic-bezier(0.2, 3, 0.5, 1)", "cubic-bezier(Infinity, 0, 1, 1)", "cubic-bezier(1e999, 0, 1, 1)", "ease", "steps(4)", "cubic-bezier(0.1,,0.2,0.3)",
    "cubic-bezier(0x1, 0, 1, 1)", "cubic-bezier((0.1), 0, 1, 1)", "bezier(0,0,1,1)", "curve(0,0,1,1)","cubic-bezier(0.1 0.2 0.3 0.4)", "", null, 42, {},
    "cubic-bezier(0.1, 0.2, 0.3, 0.4); x", "cubic-bezier(0.1, 0.2, 0.3, 0.4)cubic-bezier(0, 0, 1, 1)"];
  var gecenKotu = kotu.filter(function (t) { return E.fromCss(t) !== null; });
  ok("fromCss: NaN, 5 sayı, 3 sayı, x aralık dışı, anahtar sözcük, bozuk sözdizimi reddedilir", gecenKotu.length === 0, js(gecenKotu));
  var dev = "cubic-bezier(" + new Array(200).join(" ") + "0, 0, 1, 1)";
  ok("fromCss: 200 karakterden uzun girdi reddedilir (içerik geçerli olsa da)", dev.length > 200 && E.fromCss(dev) === null &&
    E.fromCss("cubic-bezier(0.25, 0.1, 0.25, 1)" + new Array(300).join(" ")) === null);
  var buyuk = new Array(100001).join("9"), bas = Date.now();
  ok("fromCss: dev metin hızla reddedilir", E.fromCss("cubic-bezier(" + buyuk + ")") === null && Date.now() - bas < 50);
})();

/* ================= Suflo: hazır eğriler ================= */
(function () {
  var B = E.builtins(), idler = B.map(function (b) { return b.id; });
  ok("BUILTINS: 15 eğri, benzersiz ASCII kimlik, TR ve EN adı", B.length === 15 && idler.every(function (id, i) { return /^[a-z-]+$/.test(id) && idler.indexOf(id) === i; }) &&
    B.every(function (b) { return b.name && b.nameEn && b.curve; }), idler.join(","));
  ok("BUILTINS: planın adları (Güçlü S = 0.87,0,0.13,1; yaylar bounce 0,15 / 0,4; Çift yumuşak multi)",
    js(E.builtin("guclu-s").curve) === js({ type: "bezier", x1: 0.87, y1: 0, x2: 0.13, y2: 1 }) && E.builtin("yay-yumusak").curve.bounce === 0.15 &&
    E.builtin("yay-canli").curve.bounce === 0.4 && E.builtin("cift-yumusak").curve.type === "multi" && E.builtin("yumusak").nameEn === "Ease");
  ok("BUILTINS: 'Süzülme' kullanılmaz (Hız Rampası önayarı)", B.every(function (b) { return b.name !== "Süzülme" && b.id !== "suzulme"; }));
  // "Yumuşak" (Smooth) ve "Zıplama" (Bounce) sözlükte başka araçlarla ortak; seçici adı builtinName'den alır
  var ortak = { "Yumuşak": "Smooth", "Zıplama": "Bounce" };
  ok("BUILTINS: her TR ad i18n/en.js'de; ortak iki sözcük dışında EN karşılığı nameEn", B.every(function (b) {
    return ortak[b.name] ? EN.strings[b.name] === ortak[b.name] : EN.strings[b.name] === b.nameEn;
  }), B.filter(function (b) { return !EN.strings[b.name]; }).map(function (b) { return b.name; }).join(","));
  ok("builtinName: arayüz diline göre ad", E.builtinName("yumusak", "en") === "Ease" && E.builtinName("yumusak", "tr") === "Yumuşak" &&
    E.builtinName(E.builtin("ziplama"), "en") === "Bounce out" && E.builtinName("yok", "en") === "");
  var a = E.builtin("yumusak");
  a.curve.x1 = 0.9;
  ok("builtin kopya döndürür (çağıran değiştiremez)", E.builtin("yumusak").curve.x1 === 0.25 && E.builtin("yok") === null && E.BUILTINS.length === 15);
})();

/* ================= Suflo: bakePlan ================= */
(function () {
  var e = E.builtin("yumusak").curve;
  var p = E.bakePlan({ t0: 1, t1: 2, v0: 0, v1: 100, fps: 30, curve: e });
  ok("bakePlan: 1 sn @30 → 29 iç anahtar, uçlar yok, kare zamanlarında", p.keys.length === 29 && p.step === 1 && !p.capped &&
    yakin(p.keys[0].t, 31 / 30, 1e-12) && yakin(p.keys[28].t, 59 / 30, 1e-12) && p.keys.every(function (k) { return yakin(k.t * 30, Math.round(k.t * 30), 1e-9); }));
  var fe = E.toFunction(e);
  ok("bakePlan: değer = v0 + (v1 − v0) · ease(u)", p.keys.every(function (k) { return yakin(k.v, 100 * fe(k.t - 1), 1e-5); }));
  var p2 = E.bakePlan({ t0: 1, t1: 2, v0: 0, v1: 100, fps: 30, step: 2, curve: e }), p4 = E.bakePlan({ t0: 1, t1: 2, v0: 0, v1: 100, fps: 30, step: 4, curve: e });
  ok("bakePlan: yoğunluk 2 ve 4 kare", p2.keys.length === 14 && p2.step === 2 && yakin(p2.keys[0].t, 32 / 30, 1e-12) && p4.keys.length === 7 && p4.step === 4, p2.keys.length + "/" + p4.keys.length);
  var pd = E.bakePlan({ t0: 0, t1: 1, v0: 0, v1: 1, fps: 30000 / 1001, curve: e });
  ok("bakePlan: 29,97 kare zamanları", pd.keys.length === 29 && yakin(pd.keys[0].t, 1001 / 30000, 1e-12));
  var kisa = E.bakePlan({ t0: 0, t1: 3 / 30, v0: 0, v1: 1, fps: 30, step: 4, curve: e });
  ok("bakePlan: adım en az bir iç anahtar kalacak şekilde kırpılır (3 kare, adım 4 → 1)", kisa.keys.length >= 1 && kisa.step < 4, js(kisa));
  var bes = E.bakePlan({ t0: 0, t1: 5 / 30, v0: 0, v1: 1, fps: 30, step: 8, curve: e });
  ok("bakePlan: 5 kare, adım 8 → 2 (2. ve 4. kare)", bes.step === 2 && bes.keys.length === 2 && yakin(bes.keys[0].t, 2 / 30, 1e-12));
  ok("bakePlan: 1 karelik çiftte iç anahtar yok", E.bakePlan({ t0: 0, t1: 1 / 30, v0: 0, v1: 1, fps: 30, curve: e }).keys.length === 0);
  var uzun = E.bakePlan({ t0: 0, t1: 100, v0: 0, v1: 1, fps: 60, curve: e });
  ok("bakePlan: maxKeys 2000 sınırı (100 sn @60 → adım büyür, capped)", uzun.keys.length <= 2000 && uzun.keys.length > 1000 && uzun.capped && uzun.step === 3, uzun.keys.length + " adım " + uzun.step);
  var ozel = E.bakePlan({ t0: 0, t1: 10, v0: 0, v1: 1, fps: 30, curve: e, maxKeys: 10 });
  ok("bakePlan: özel maxKeys", ozel.keys.length <= 10 && ozel.keys.length >= 5 && ozel.capped);
  var cokUzun = Date.now(), dev = E.bakePlan({ t0: 0, t1: 36000, v0: 0, v1: 1, fps: 60, curve: e });
  ok("bakePlan: 10 saatlik aralık hızlı ve sınırlı", dev.keys.length <= 2000 && Date.now() - cokUzun < 500);
  var xy = E.bakePlan({ t0: 0, t1: 0.5, v0: [960, 540], v1: [100, 200], fps: 24, curve: e });
  ok("bakePlan: [x, y] değer (Konum)", xy.keys.length === 11 && xy.keys.every(function (k) {
    var u = fe(k.t / 0.5); return Array.isArray(k.v) && k.v.length === 2 && yakin(k.v[0], 960 - 860 * u, 1e-4) && yakin(k.v[1], 540 - 340 * u, 1e-4);
  }));
  var op = E.bakePlan({ t0: 0, t1: 1, v0: 0, v1: 100, fps: 30, curve: E.builtin("tasma").curve, clampMin: 0, clampMax: 100 });
  var serbest = E.bakePlan({ t0: 0, t1: 1, v0: 0, v1: 100, fps: 30, curve: E.builtin("tasma").curve });
  ok("bakePlan: Opaklık 0..100 sınırı (Taşma 100'ü aşmaz); sınırsızda aşar", op.keys.every(function (k) { return k.v >= 0 && k.v <= 100; }) &&
    op.keys.some(function (k) { return k.v === 100; }) && serbest.keys.some(function (k) { return k.v > 100; }));
  var geri = E.bakePlan({ t0: 0, t1: 1, v0: 0, v1: 100, fps: 30, curve: E.builtin("geri-cekil").curve, clampMin: 0, clampMax: 100 });
  ok("bakePlan: Geri çekil Opaklıkta 0'ın altına inmez", geri.keys.every(function (k) { return k.v >= 0; }) && geri.keys.some(function (k) { return k.v === 0; }));
  var hizasiz = E.bakePlan({ t0: 1.21, t1: 2, v0: 0, v1: 1, fps: 24, curve: e });
  ok("bakePlan: kareye oturmayan uçta anahtarlar yine kare zamanında ve uçlardan yarım kare içeride",
    hizasiz.keys.every(function (k) { return yakin(k.t * 24, Math.round(k.t * 24), 1e-9) && k.t > 1.21 + 0.5 / 24 && k.t < 2 - 0.5 / 24; }) && hizasiz.keys.length === 18, hizasiz.keys.length);
  ok("bakePlan: geçersiz girdi → boş + hata kodu", E.bakePlan({ t0: 2, t1: 1, v0: 0, v1: 1, fps: 30 }).hata === "aralik" &&
    E.bakePlan({ t0: 0, t1: 1, v0: 0, v1: 1, fps: 0 }).hata === "fps" && E.bakePlan({ t0: 0, t1: 1, v0: [0, 0], v1: 5, fps: 30 }).hata === "deger" &&
    E.bakePlan({ t0: 0, t1: 1, v0: [0, 0], v1: [1, 2, 3], fps: 30 }).hata === "deger" && E.bakePlan({ t0: 0, t1: 1, v0: "a", v1: 1, fps: 30 }).keys.length === 0 &&
    E.bakePlan().hata === "aralik");
  var gecersizEgri = E.bakePlan({ t0: 0, t1: 1, v0: 0, v1: 10, fps: 10, curve: { type: "kotu" } });
  ok("bakePlan: geçersiz eğri doğrusal sayılır", gecersizEgri.keys.length === 9 && yakin(gecersizEgri.keys[4].v, 5, 1e-9));
  var cokNokta = E.bakePlan({ t0: 0, t1: 1, v0: 10, v1: 20, fps: 30, curve: E.builtin("cift-yumusak").curve });
  ok("bakePlan: çok noktalı eğri; ortada duraklama (Çift yumuşak)", cokNokta.keys.length === 29 && yakin(cokNokta.keys[14].v, 15, 0.2), cokNokta.keys[14].v);
  ok("bakePlan: sonuç JSON güvenli (NaN yok)", JSON.stringify(xy).indexOf("null") === -1 && JSON.stringify(p).indexOf("NaN") === -1);
})();

/* ================= Suflo: yaylanPlan (varışta yaylanma, 3.4 adım 14) ================= */
(function () {
  var Y = E.YAYLAN;
  ok("yaylanPlan: varsayılanlar ve sınırlar (genlik 0,02–0,5 sn, frekans 1–6 Hz, sönüm 2–10)", Y.GENLIK.min === 0.02 && Y.GENLIK.max === 0.5 &&
    Y.FREKANS.min === 1 && Y.FREKANS.max === 6 && Y.SONUM.min === 2 && Y.SONUM.max === 10 && Y.YOGUN_ADIM === 2 && Y.EN_AZ_KARE === 2);
  var fps = 25, s = E.dampedSine(3, 6);
  var p = E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, genlik: 0.1, frekans: 3, sonum: 6, sinir: 5, fps: fps });
  ok("yaylanPlan: anahtarlar yalnız inişten SONRA ve kare ızgarasında", p.keys.length >= 4 && p.keys.every(function (k) {
    return k.t > 2 + 0.5 / fps && yakin(k.t * fps, Math.round(k.t * fps), 1e-6);
  }), js(p.keys.map(function (k) { return k.t; })));
  ok("yaylanPlan: süre autoDuration(sönüm) (yer varken; kareye oturur)", yakin(p.sure, Math.round(E.autoDuration(6) * fps) / fps, 1e-9) &&
    yakin(p.keys[p.keys.length - 1].t, 2 + p.sure, 1e-9), p.sure);
  var ext = E.extremaTimes(3, 6, p.sure);
  var ic = p.keys.slice(0, -1);
  ok("yaylanPlan: her iç anahtar bir tepe / çukurun en yakın karesinde", ic.length === ext.length && ic.every(function (k, i) {
    return Math.abs((k.t - 2) - ext[i]) <= 0.5 / fps + 1e-9;
  }), js([ic.length, ext.length]));
  // 3.4 adım 14 inceleme: son anahtar (pencere sonu) tam tabanda — sönümlü sinüsün kalıntısı (s(süre) ≠ 0) yazılmaz
  ok("yaylanPlan: değer = iniş + hız · genlik · s(t − iniş); son anahtar tam inişte (s = 0)", p.keys.slice(0, -1).every(function (k) {
    return yakin(k.v, 500 + 1000 * 0.1 * s(k.t - 2), 1e-5);
  }) && p.keys[p.keys.length - 1].v === 500 && p.oran === 1);
  var donus = E.yaylanPlan({ tL: 2, vL: 360, hiz: 720, genlik: 0.5, frekans: 3, sonum: 6, sinir: 10, fps: fps });
  ok("yaylanPlan: iniş son anahtarsa (sonraki yok) özellik kullanıcının değerinde oturur (Döndürme 0 → 360, genlik 0,5: kalıntı yok)",
    donus.keys[donus.keys.length - 1].v === 360 && Math.abs(360 + 720 * 0.5 * s(donus.sure) - 360) > 1, js(donus.keys[donus.keys.length - 1]));
  var sap = ic.map(function (k) { return k.v - 500; }), azalir = true, isaret = true;
  for (var i = 1; i < sap.length; i++) {
    if (!(Math.abs(sap[i]) < Math.abs(sap[i - 1]))) azalir = false;
    if (Math.sign(sap[i]) !== -Math.sign(sap[i - 1])) isaret = false;
  }
  ok("yaylanPlan: genlikler söner, hedefin bir üstünde bir altında; ilk aşım varış yönünde", azalir && isaret && sap[0] > 0, js(sap));
  ok("yaylanPlan: pencere sonunda neredeyse oturmuş (%1'in altında)", Math.abs(p.keys[p.keys.length - 1].v - 500) < 0.01 * 1000 * 0.1 + 0.5);
  var ters = E.yaylanPlan({ tL: 2, vL: 500, hiz: -1000, genlik: 0.1, frekans: 3, sonum: 6, sinir: 5, fps: fps });
  ok("yaylanPlan: aşağı gelen harekette ilk aşım aşağı", ters.keys[0].v < 500 && yakin(ters.keys[0].v - 500, -(p.keys[0].v - 500), 1e-6));
  // sonraki anahtar yakın: süre kırpılır, sonraki anahtarın karesine ve ötesine yazılmaz
  var yakinP = E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, genlik: 0.1, frekans: 3, sonum: 6, sinir: 2.32, fps: fps });
  ok("yaylanPlan: sonraki anahtarı geçmez (son anahtar bir kare önce, süre kırpılır)", yakinP.keys.every(function (k) { return k.t <= 2.32 - 1 / fps + 1e-9; }) &&
    yakin(yakinP.keys[yakinP.keys.length - 1].t, 2.32 - 1 / fps, 1e-9) && yakinP.sure < p.sure && yakinP.oda === 7, js([yakinP.keys, yakinP.oda]));
  var hicCapa = E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, genlik: 0.1, frekans: 1, sonum: 2, sinir: 5, fps: fps });
  ok("yaylanPlan: hiçbir çapa sınırın ötesinde değil (uzun salınım, kare dışı sınır)", E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, frekans: 1, sonum: 2, sinir: 2.51, fps: fps })
    .keys.every(function (k) { return k.t < 2.51 - 0.5 / fps; }) && hicCapa.keys.every(function (k) { return k.t < 5; }));
  var iki = E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, sinir: 2 + 2 / fps, fps: fps });
  var uc = E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, sinir: 2 + 3 / fps, fps: fps });
  ok("yaylanPlan: 2 kareden az yer → 'yer' reddi; 2 kare yer → yazılır", iki.hata === "yer" && iki.keys.length === 0 && iki.oda === 1 &&
    !uc.hata && uc.oda === 2 && uc.keys.length >= 1 && uc.keys.every(function (k) { return k.t <= 2 + 2 / fps + 1e-9; }), js([iki, uc.keys]));
  // inceleme r2: pencere ilk tepeden kısa (ya da tek tepe pencere sonuna yuvarlanıyor) — seyrek plan yalnız tabandaki tek
  // anahtar olmamalı (aşım görünmez, yine de kayıt ve deneme hakkı harcanırdı): pencerenin en yüksek karesi tepe olur
  var kisaPencereler = [[30, 3, 3, 6], [60, 5, 3, 6], [30, 7, 1, 2], [25, 3, 3, 6], [24, 4, 2, 4], [50, 3, 6, 10]];
  var kisaSonuc = kisaPencereler.map(function (q) {
    var o = { tL: 2, vL: 150, hiz: 50, frekans: q[2], sonum: q[3], sinir: 2 + q[1] / q[0], fps: q[0] };
    var sy = E.yaylanPlan(o), yg = E.yaylanPlan(Object.assign({}, o, { yogun: true }));
    var enYuksek = Math.max.apply(null, yg.keys.map(function (k) { return Math.abs(k.v - 150); }));
    return { ok: !sy.hata && sy.keys.length >= 2 && sy.keys[sy.keys.length - 1].v === 150 &&
      sy.keys.slice(0, -1).some(function (k) { return Math.abs(k.v - 150) > 1e-6; }) &&
      Math.max.apply(null, sy.keys.map(function (k) { return Math.abs(k.v - 150); })) >= enYuksek - 1e-9, sy: sy.keys, yg: yg.keys };
  });
  ok("yaylanPlan seyrek: kısa pencerede de en az bir taban dışı (aşım) anahtar; tepe sık plandaki en yüksek kare",
    kisaSonuc.every(function (r) { return r.ok; }), js(kisaSonuc.filter(function (r) { return !r.ok; })[0] || ""));
  var cokPencere = [], cokOk = true;
  for (var cf = 2; cf <= 40; cf++) [24, 25, 30, 50, 60].forEach(function (f2) {
    [[1, 2], [3, 6], [6, 10], [1, 10]].forEach(function (fs2) {
      var pl = E.yaylanPlan({ tL: 2, vL: 0, hiz: 100, frekans: fs2[0], sonum: fs2[1], sinir: 2 + cf / f2, fps: f2 });
      if (pl.hata === "yer" && cf < 3) return;   // inişten sonra 2 kareden az yer: ret (yukarıda sınanır)
      if (pl.hata || !pl.keys.slice(0, -1).some(function (k) { return Math.abs(k.v) > 1e-6; })) { cokOk = false; cokPencere.push([cf, f2, fs2, pl.hata]); }
    });
  });
  ok("yaylanPlan seyrek: 2–40 karelik her pencerede (24–60 fps, frekans / sönüm uçları) yazılırsa aşım var", cokOk, js(cokPencere.slice(0, 3)));
  ok("yaylanPlan: varış hızı yoksa 'hiz' reddi", E.yaylanPlan({ tL: 2, vL: 500, hiz: 0, sinir: 5, fps: fps }).hata === "hiz" &&
    E.yaylanPlan({ tL: 2, vL: [1, 2], hiz: [0, 0], sinir: 5, fps: fps }).hata === "hiz");
  ok("yaylanPlan: geçersiz girdi (aralık, fps, değer türü)", E.yaylanPlan({ tL: 2, vL: 1, hiz: 1, sinir: 2, fps: 25 }).hata === "aralik" &&
    E.yaylanPlan({ tL: 2, vL: 1, hiz: 1, sinir: 3, fps: 0 }).hata === "fps" && E.yaylanPlan({ tL: 2, vL: [1, 2], hiz: 1, sinir: 3, fps: 25 }).hata === "deger" &&
    E.yaylanPlan({ tL: 2, vL: 1, hiz: 1, sinir: 3, fps: 25, vN: [1, 2] }).hata === "deger" && E.yaylanPlan().hata === "aralik");
  var xy = E.yaylanPlan({ tL: 1, vL: [960, 540], hiz: [800, 0], genlik: 0.05, sinir: 3, fps: 30 });
  ok("yaylanPlan: [x,y] boyut başına (y'de hız yok → y sabit)", xy.keys.length > 2 && xy.keys.every(function (k) { return Array.isArray(k.v) && k.v[1] === 540; }) &&
    xy.keys[0].v[0] > 960, js(xy.keys[0]));
  var op = E.yaylanPlan({ tL: 1, vL: 100, hiz: 400, genlik: 0.2, sinir: 3, fps: 30, clampMin: 0, clampMax: 100 });
  ok("yaylanPlan: Opaklık 0..100 kırpılır (100'e gelen opaklık aşmaz)", op.keys.every(function (k) { return k.v >= 0 && k.v <= 100; }) &&
    op.keys.some(function (k) { return k.v === 100; }) && op.keys.some(function (k) { return k.v < 100; }));
  // sonraki anahtar başka değerdeyse taban oraya doğru doğrusal gider (kullanıcının sonraki hareketi kaymaz)
  var dog = E.yaylanPlan({ tL: 2, vL: 0, hiz: 100, genlik: 0.1, frekans: 3, sonum: 6, sinir: 4, tN: 4, vN: 200, fps: 25 });
  // son anahtar tam tabanda (doğrusal yolun üstünde: s = 0)
  ok("yaylanPlan: sonraki anahtar farklıysa taban doğrusal (iniş → sonraki)", dog.keys.every(function (k, i) {
    return yakin(k.v, 0 + 200 * (k.t - 2) / 2 + (i === dog.keys.length - 1 ? 0 : 100 * 0.1 * s(k.t - 2)), 1e-5);
  }));
  var tnOte = E.yaylanPlan({ tL: 2, vL: 0, hiz: 100, sinir: 3, tN: 6, vN: 400, fps: 25 });
  var tnSon = tnOte.keys[tnOte.keys.length - 1], tnOnce = tnOte.keys[tnOte.keys.length - 2];
  ok("yaylanPlan: sonraki anahtar klibin ötesindeyse taban yine o anahtara göre (sınır klip sonu)", tnOte.keys.every(function (k) { return k.t < 3; }) &&
    yakin(tnOnce.v - 400 * (tnOnce.t - 2) / 4, 100 * 0.1 * E.dampedSine(3, 6)(tnOnce.t - 2), 1e-5) && yakin(tnSon.v, 400 * (tnSon.t - 2) / 4, 1e-6));
  var yog = E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, genlik: 0.1, frekans: 3, sonum: 6, sinir: 5, fps: fps, yogun: true });
  var kareler = yog.keys.map(function (k) { return Math.round(k.t * fps) - 50; });
  ok("yaylanPlan yoğun: 2 karede bir, son anahtar pencere sonu ve tam inişte (Bezier yazılamazsa yedek)", yog.yogun === true && kareler[0] === 1 &&
    kareler.slice(1, -1).every(function (k, i) { return k - kareler[i] === 2; }) && yakin(yog.keys[yog.keys.length - 1].t, 2 + p.sure, 1e-9) &&
    yog.keys.slice(0, -1).every(function (k) { return yakin(k.v, 500 + 100 * s(k.t - 2), 1e-5); }) && yog.keys[yog.keys.length - 1].v === 500, js(kareler));
  // 3.4 adım 14 inceleme: sinirSigdir — aşım Opaklık / Ölçek sınırına sığdırılır, kırpılmaz (kırpılan ilk tepe silinip
  // içeri dönen salınım kalırdı: sönen klip yeniden görünür, 0'a küçülen Ölçek eksiye gider)
  var sonen = E.yaylanPlan({ tL: 2, vL: 0, hiz: -200, sinir: 10, fps: 25, clampMin: 0, clampMax: 100, sinirSigdir: true });
  var dolan = E.yaylanPlan({ tL: 2, vL: 100, hiz: 200, sinir: 10, fps: 25, clampMin: 0, clampMax: 100, sinirSigdir: true });
  var kucul = E.yaylanPlan({ tL: 2, vL: 0, hiz: -333, sinir: 10, fps: 25, clampMin: 0, sinirSigdir: true });
  var eski0 = E.yaylanPlan({ tL: 2, vL: 0, hiz: -200, sinir: 10, fps: 25, clampMin: 0, clampMax: 100 });
  ok("yaylanPlan sinirSigdir: iniş sınırda ve aşım o yöndeyse 'sinir' (sönen Opaklık, 100'e dolan Opaklık, 0'a küçülen Ölçek); eski kırpmada hayalet vardı",
    sonen.hata === "sinir" && sonen.keys.length === 0 && dolan.hata === "sinir" && kucul.hata === "sinir" &&
    eski0.keys.some(function (k) { return k.v > 1; }), js([sonen.hata, dolan.hata, kucul.hata, eski0.keys.map(function (k) { return k.v; })]));
  var yakin0 = E.yaylanPlan({ tL: 2, vL: 5, hiz: -200, sinir: 10, fps: 25, clampMin: 0, clampMax: 100, sinirSigdir: true });
  var yakin0Y = E.yaylanPlan({ tL: 2, vL: 5, hiz: -200, sinir: 10, fps: 25, clampMin: 0, clampMax: 100, sinirSigdir: true, yogun: true });
  var en0 = Math.min.apply(null, yakin0Y.keys.map(function (k) { return k.v; }));
  ok("yaylanPlan sinirSigdir: sınıra yakın iniş — aşım küçültülür (oran < 1, seyrek ve sık aynı), hiçbir anahtar sınırı geçmez, tepe sınıra değer",
    !yakin0.hata && yakin0.oran > 0.1 && yakin0.oran < 1 && yakin0Y.oran === yakin0.oran && yakin0.keys.concat(yakin0Y.keys).every(function (k) { return k.v >= 0 && k.v <= 100; }) &&
    en0 >= 0 && yakin(yakin0.keys[0].v, 0, 1e-6) && yakin0.keys[yakin0.keys.length - 1].v === 5 &&
    yakin0.keys.slice(0, -1).every(function (k) { return yakin(k.v, 5 - 200 * 0.1 * yakin0.oran * s(k.t - 2), 1e-5); }), js([yakin0.oran, en0, yakin0.keys]));
  ok("yaylanPlan sinirSigdir: sınıra uzak (ya da sınırsız) değerde aşım değişmez (oran 1)",
    E.yaylanPlan({ tL: 2, vL: 50, hiz: 100, sinir: 10, fps: 25, clampMin: 0, clampMax: 100, sinirSigdir: true }).oran === 1 &&
    E.yaylanPlan({ tL: 2, vL: 0, hiz: -200, sinir: 10, fps: 25, sinirSigdir: true }).oran === 1);
  var kirp = E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, genlik: 9, frekans: 99, sonum: -3, sinir: 5, fps: fps });
  ok("yaylanPlan: ayarlar sınırlara kırpılır, sayı olmayan varsayılan olur", kirp.genlik === 0.5 && kirp.frekans === 6 && kirp.sonum === 2 &&
    E.yaylanPlan({ tL: 2, vL: 500, hiz: 1000, genlik: "x", sinir: 5, fps: fps }).genlik === 0.1);
  ok("yaylanPlan: kare dışı iniş (yarım kare) — anahtarlar inişten en az yarım kare sonra", E.yaylanPlan({ tL: 2.013, vL: 1, hiz: 10, sinir: 4, fps: 25 })
    .keys.every(function (k) { return k.t >= 2.013 + 0.5 / 25 - 1e-9; }));
  ok("yaylanPlan: sonuç JSON güvenli", JSON.stringify(p).indexOf("null") === -1 && JSON.stringify(xy).indexOf("NaN") === -1);
})();

/* ================= Atıf ve paket ================= */
// satır sonları LF'ye indirilir: yayın Windows sunucusunda core.autocrlf=true ile çıkar, uzunluk ölçüleri CRLF'de şişmesin
var src = fs.readFileSync(path.join(KOK, "js", "ease-curve.js"), "utf8").replace(/\r\n/g, "\n");
var REBOUND_BASLIK = "Portions adapted from Rebound (https://github.com/meszmate/rebound), MIT License, Copyright (c) 2026 Rebound contributors. See THIRD_PARTY_NOTICES.md.";
ok("başlık: Rebound MIT atfı (plandaki metin)", src.indexOf(REBOUND_BASLIK) !== -1);
// Rebound'un vitest durumlarından uyarlanan bu test dosyası da aynı başlığı taşır (ilk yorum bloğunda)
var testBasi = fs.readFileSync(__filename, "utf8").split("\n").slice(0, 5).join("\n");
ok("başlık: tests/test-ease-curve.js de Rebound MIT atfını (telif satırıyla) taşır", testBasi.indexOf("// " + REBOUND_BASLIK) !== -1);
var isaretler = ["cubicBezier", "bounceOut", "fns", "elasticOutWith", "get", "isMonotonic", "resolveParams", "spring", "settleTime", "springNormalized",
  "toFunction", "samplePoints", "range", "bakeFactors", "turningPoints", "slopeAt", "endpointSpeeds", "withStartSpeed", "withEndSpeed", "sampleSpeed", "speedRange",
  "dampedSine", "extremaTimes", "autoDuration", "followThroughAnchors"];
var eksikIsaret = isaretler.filter(function (n) { return !new RegExp("// Rebound: " + n + "\\b").test(src); });
ok("her uyarlanan işlev '// Rebound: <ad>' ile işaretli", eksikIsaret.length === 0, eksikIsaret.join(","));
// (inceleme bu adı depoda arar; desen birleştirilerek kurulur ki test dosyası da temiz kalsın)
// 3.4 adım 15: planın izin verdiği tek yer dış biçim okuyucusu (yalnız dışa aktarma JSON'unun biçimi okunur); ad o bölümün
// dışında geçmez, o aracın metin sözdizimi ('<ad>(' çağrısı) hiçbir yerde yok
var okBas = src.indexOf("DIŞ BİÇİM OKUYUCUSU (başı)"), okSon = src.indexOf("DIŞ BİÇİM OKUYUCUSU (sonu)");
var okuyucuDisi = okBas > 0 && okSon > okBas ? src.slice(0, okBas) + src.slice(okSon) : src;
var okuyucu = okBas > 0 && okSon > okBas ? src.slice(okBas, okSon) : "";
ok("temiz oda: lisanssız kaynağın adı yalnız dış biçim okuyucusunda; sözdizimi / tablosu hiçbir yerde yok",
  okuyucu.length > 500 && okuyucu.length < 6000 && !new RegExp("open" + "curve", "i").test(okuyucuDisi) && !new RegExp("open" + "curve\\s*\\(", "i").test(src) &&
  !new RegExp("PARAM" + "_NAMES").test(src) && (okuyucu.match(new RegExp("\"open" + "curve\"", "g")) || []).length === 1);
var notice = fs.readFileSync(path.join(KOK, "THIRD_PARTY_NOTICES.md"), "utf8");
ok("THIRD_PARTY_NOTICES: Rebound girdisi (commit, MIT, telif, dosyalar, tam lisans)", /### Rebound/.test(notice) && /https:\/\/github\.com\/meszmate\/rebound/.test(notice) &&
  /0f9fd6c526514d20b688b13c393061606f166ad5/.test(notice) && /Copyright \(c\) 2026 Rebound contributors/.test(notice) &&
  /`js\/ease-curve\.js`/.test(notice) && /`tests\/test-ease-curve\.js`/.test(notice) &&
  (notice.match(/Permission is hereby granted, free of charge/g) || []).length >= 2);
// inceleme r2: host'taki Hareket önayarı yoğunlaştırması Rebound'un host/commands/spring.jsx lookup / bakeSegment'ine benzer:
// dosyada başlık + işaret, NOTICE'te jsx/host.jsx girdisi
var hostSrc = fs.readFileSync(path.join(KOK, "jsx", "host.jsx"), "utf8");
var reboundBlok = notice.slice(notice.indexOf("### Rebound"), notice.indexOf("## Bundled assets"));
ok("Rebound uyarlaması host.jsx'te atıflı (başlık, // Rebound: lookup işareti, NOTICE'te jsx/host.jsx)",
  /Portions adapted from Rebound \(https:\/\/github\.com\/meszmate\/rebound\), MIT/.test(hostSrc) &&
  /\/\/ Rebound: lookup \(host\/commands\/spring\.jsx\)\s*\nfunction KS_egriTabloDeger/.test(hostSrc) &&
  /Rebound: bakeSegment/.test(hostSrc) && /`jsx\/host\.jsx`/.test(reboundBlok) && /KS_egriTabloDeger/.test(reboundBlok));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
