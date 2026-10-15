// Suflo testi: js/speedramp.js — Hız Rampası saf plan modülü (eğri, parçalama, kaynak politikası)
var fs = require("fs"), path = require("path");
var S = require(path.join(__dirname, "..", "js", "speedramp.js"));
var EN = require(path.join(__dirname, "..", "i18n", "en.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function yakin(a, b, tol) { return Math.abs(a - b) <= tol; }
function nanYok(x) {
  if (typeof x === "number") return isFinite(x);
  if (Array.isArray(x)) return x.every(nanYok);
  if (x && typeof x === "object") return Object.keys(x).every(function (k) { return nanYok(x[k]); });
  return true;
}
function dvToplam(p) { return p.segments.reduce(function (s, g) { return s + g.d * g.v; }, 0); }
// çıkış karesi x'e kadar tüketilen kaynak (kare)
function kaynakAn(p, x) {
  var t = 0, s = 0;
  for (var i = 0; i < p.segments.length; i++) {
    var g = p.segments[i];
    if (t + g.d >= x) return s + (x - t) * g.v;
    t += g.d; s += g.d * g.v;
  }
  return s;
}

/* ---------------- LIST ---------------- */
var LT = S.list();
var idler = LT.map(function (p) { return p.id; });
ok("LIST: 12 önayar (11 hazır + Özel eğri), benzersiz ASCII kimlikler", LT.length === 12 && idler.every(function (id, i) { return /^[a-z]+$/.test(id) && idler.indexOf(id) === i; }), idler.join(","));
ok("LIST dışa kopya: değiştirmek modülü bozmaz", (function () { var x = S.list(); x[0].keys[0][1] = 999; x.pop(); return S.list().length === 12 && S.list()[0].keys[0][1] === 100; })());
ok("LIST: Özel eğri girdisi { id 'ozel', grup 'ozel', vuruş anı yok, anahtar yok } ve sonda", (function () {
  var z = LT[LT.length - 1];
  return z.id === "ozel" && z.name === "Özel eğri" && z.group === "ozel" && z.hit === null && z.keys.length === 0 && z.beats === false && S.has("ozel");
})(), js(LT[LT.length - 1]));
var enEksik = [];
LT.forEach(function (p) { [p.name, p.desc].forEach(function (s) { if (!EN.strings[s]) enEksik.push(s); }); });
// Hazır önayarlar: özel eğrinin anahtarları kullanıcıdan gelir, aşağıda (Özel eğri bölümü) ayrı sınanır
var L = LT.filter(function (p) { return p.group !== "ozel"; });
ok("her önayar adı ve açıklaması i18n/en.js'te", enEksik.length === 0, enEksik.join(" | "));
ok("has/get", S.has("dalis") && !S.has("yok") && S.get("vites").keys.length === 6 && S.get("yok") === null);
ok("ritim önayarı vuruşlu, vuruş anı yok", S.get("ritim").beats === true && S.get("ritim").hit === null);
ok("adlarda rakip marka adı yok", !L.some(function (p) { return /capcut|vn |filmora|umutcan/i.test(p.name + " " + p.desc); }));

/* ---------------- opts ---------------- */
var d0 = S.opts({ k: NaN, ease: "x", density: "?", mode: "exact", onBeat: 3 });
ok("opts: NaN ve geçersizler varsayılana", d0.k === 1 && d0.ease === "smooth" && d0.density === "normal" && d0.mode === "auto" && d0.onBeat === "slow" &&
  d0.minV === 0.1 && d0.maxV === 10 && d0.slowV === 0.4 && d0.fastV === 2.5, js(d0));
ok("opts: k=3 → 1.5, k=0.1 → 0.5", S.opts({ k: 3 }).k === 1.5 && S.opts({ k: 0.1 }).k === 0.5 && S.opts({ k: "1.4" }).k === 1.4);
ok("opts: geçerli seçimler korunur", (function () { var o = S.opts({ ease: "step", density: "many", mode: "balanced", onBeat: "fast" }); return o.ease === "step" && o.density === "many" && o.mode === "balanced" && o.onBeat === "fast"; })());

/* ---------------- speedAt ---------------- */
var dk = S.get("dalis").keys;
var eg = (S.speedAt(dk, 0.18 + 1e-4, "smooth") - S.speedAt(dk, 0.18 - 1e-4, "smooth")) / 2e-4;
var egLin = (S.speedAt(dk, 0.18 - 1e-4, "linear") - S.speedAt(dk, 0.18 - 3e-4, "linear")) / 2e-4;
ok("smooth: anahtarda türev ~0 (düz teğet)", Math.abs(eg) < 0.01 && Math.abs(egLin) > 1, eg + " / " + egLin);
ok("linear: log2 uzayında doğrusal", yakin(Math.log(S.speedAt([[0, 100], [1, 400]], 0.5, "linear")) / Math.LN2, 1, 1e-9) &&
  yakin(Math.log(S.speedAt([[0, 100], [1, 400]], 0.25, "linear")) / Math.LN2, 0.5, 1e-9));
ok("smooth: uçlarda anahtar değeri, ortada log2 orta", yakin(S.speedAt(dk, 0, "smooth"), 1, 1e-12) && yakin(S.speedAt(dk, 0.18, "smooth"), 2, 1e-12) &&
  yakin(S.speedAt([[0, 100], [1, 400]], 0.5, "smooth"), 2, 1e-9));
var vk = S.get("vites").keys;
ok("tekrarlanan t sert basamak (her geçişte)", ["smooth", "linear", "step"].every(function (e) {
  return yakin(S.speedAt(vk, 0.3999, e), 0.55, 1e-9) && yakin(S.speedAt(vk, 0.4, e), 2.6, 1e-9) && yakin(S.speedAt(vk, 0.6999, e), 2.6, 1e-9) && yakin(S.speedAt(vk, 0.7, e), 0.55, 1e-9);
}));
// step = en yakın anahtar: komşu iki anahtarın ortasında sert geçiş (Dalış: 0.09, 0.29, 0.71, 0.91)
ok("step: en yakın anahtar, orta noktada sert geçiş", yakin(S.speedAt(dk, 0.05, "step"), 1, 1e-12) && yakin(S.speedAt(dk, 0.0899, "step"), 1, 1e-12) &&
  yakin(S.speedAt(dk, 0.0901, "step"), 2, 1e-12) && yakin(S.speedAt(dk, 0.28, "step"), 2, 1e-12) && yakin(S.speedAt(dk, 0.3, "step"), 0.3, 1e-12) &&
  yakin(S.speedAt(dk, 0.9, "step"), 2, 1e-12) && yakin(S.speedAt(dk, 0.92, "step"), 1, 1e-12) && yakin(S.speedAt(dk, 1, "step"), 1, 1e-12));
var ck = S.get("cikis").keys, gk = S.get("giris").keys;
ok("step: Hızlı Çıkış sondaki %600'e ulaşır (u = 0.8'den sonra), Hızlı Giriş baştaki %500'ü tutar (u = 0.175'e kadar)",
  yakin(S.speedAt(ck, 0.79, "step"), 1, 1e-12) && yakin(S.speedAt(ck, 0.81, "step"), 6, 1e-12) && yakin(S.speedAt(ck, 1, "step"), 6, 1e-12) &&
  yakin(S.speedAt(gk, 0, "step"), 5, 1e-12) && yakin(S.speedAt(gk, 0.17, "step"), 5, 1e-12) && yakin(S.speedAt(gk, 0.18, "step"), 1, 1e-12));
var ucSorun = [];
L.forEach(function (p) {
  if (p.beats) return;
  var ilk = p.keys[0][1] / 100, son = p.keys[p.keys.length - 1][1] / 100;
  if (!yakin(S.speedAt(p.keys, 0, "step"), ilk, 1e-12) || !yakin(S.speedAt(p.keys, 1 - 1e-9, "step"), son, 1e-12) || !yakin(S.speedAt(p.keys, 1, "step"), son, 1e-12)) ucSorun.push(p.id + " uç");
  // her anahtarın hızı eğride görünür (tekrarlanan t'de sol değer hemen öncesinde)
  p.keys.forEach(function (k) {
    var v = k[1] / 100;
    if (!yakin(S.speedAt(p.keys, k[0], "step"), v, 1e-12) && !yakin(S.speedAt(p.keys, Math.max(0, k[0] - 1e-9), "step"), v, 1e-12)) ucSorun.push(p.id + " @" + k[0]);
  });
});
ok("step: her önayarda ilk ve son anahtar uçlarda, her anahtar hızı eğride", ucSorun.length === 0, ucSorun.join(" | "));
ok("step: tekrarlanan anahtarlar bozulmaz, basamaklama idempotent (çizim/plan anahtarları yeniden okununca aynı)", (function () {
  var sh = S.shape("dalis", { ease: "step" });
  return sh.length === 6 + 2 * 4 && [0.05, 0.1, 0.3, 0.5, 0.75, 0.95, 1].every(function (u) { return S.speedAt(sh, u, "step") === S.speedAt(dk, u, "step"); }) &&
    js(S.shape("vites", { ease: "step" })) === js(S.shape("vites", {}));
})());
ok("speedAt {t, v} biçimini de kabul eder", yakin(S.speedAt([{ t: 0, v: 1 }, { t: 1, v: 4 }], 0.5, "linear"), 2, 1e-9));

/* ---------------- B (kaynak / timeline) ---------------- */
var TABLO = { dalis: 1.006, darbe: 1.404, giris: 1.565, cikis: 1.786, doruk: 0.892, atilim: 1.554, bukum: 1.476, nabiz: 1.186, vites: 1.165, suzulme: 1.127 };
var bSorun = [];
Object.keys(TABLO).forEach(function (id) { var b = S.B(S.get(id).keys, "smooth"); if (!yakin(b, TABLO[id], 0.02)) bSorun.push(id + " " + b.toFixed(4)); });
ok("B() her önayarda tasarım tablosunda (±0.02)", bSorun.length === 0, bSorun.join(" | "));
ok("integrate step: Hızlı Çıkış 0.8·1 + 0.2·6 = 2, Hızlı Giriş 0.175·5 + 0.825·1", yakin(S.B(ck, "step"), 2, 1e-9) && yakin(S.B(gk, "step"), 0.175 * 5 + 0.825, 1e-9) &&
  yakin(S.integrate(ck, "step", 0.7, 0.9), 0.1 + 0.6, 1e-9));
ok("integrate: sabit eğri ve basamak tam", yakin(S.integrate([[0, 200], [1, 200]], "smooth", 0.2, 0.7), 1, 1e-9) &&
  yakin(S.integrate(vk, "smooth", 0, 1), 0.4 * 0.55 + 0.3 * 2.6 + 0.3 * 0.55, 1e-9) && yakin(S.integrate(vk, "smooth", 0.35, 0.45), 0.05 * 0.55 + 0.05 * 2.6, 1e-9));

/* ---------------- yoğunluk ---------------- */
var sorunK = [];
L.forEach(function (p) {
  if (p.beats) return;
  var k1 = S.shape(p.id, { k: 1 }), k06 = S.shape(p.id, { k: 0.6 });
  p.keys.forEach(function (k, i) {
    if (!yakin(k1[i].v, k[1] / 100, 1e-12) || k1[i].t !== k[0]) sorunK.push(p.id + " k=1");
    var l0 = Math.abs(Math.log(k[1] / 100)), l6 = Math.abs(Math.log(k06[i].v));
    if (l0 > 1e-9 && !(l6 < l0)) sorunK.push(p.id + " k=0.6 @" + i);
  });
});
ok("yoğunluk: k=1 özdeşlik, k=0.6 hızları %100'e yaklaştırır", sorunK.length === 0, sorunK.slice(0, 5).join(" | "));
ok("shape bilinmeyen kimlikte atar", (function () { try { S.shape("yok"); return false; } catch (e) { return /Bilinmeyen rampa: yok/.test(e.message); } })());

/* ---------------- segment ---------------- */
var segSorun = [];
[23.976, 25, 29.97, 59.94].forEach(function (fps) {
  [Math.round(fps * 0.6), Math.round(fps * 2), Math.round(fps * 4.3), Math.round(fps * 30)].forEach(function (F) {
    if (F < 12) return;
    ["few", "normal", "many"].forEach(function (den) {
      // kısa aralıkta en kısa parça F/3'e iner (yüksek kare hızında tek parçaya düşmesin)
      var P = S.DENSITY[den], m = Math.max(1, Math.min(Math.max(P.mmin, Math.round(P.mf * fps)), Math.floor(F / 3)));
      ["smooth", "linear", "step"].forEach(function (ease) {
        L.forEach(function (p) {
          var keys = p.beats ? S.beatKeys([0.1, 0.33, 0.52, 0.8], {}, F) : p.keys;
          var seg = S.segment(keys, ease, F, fps, den);
          var ad = p.id + " " + fps + "fps F" + F + " " + den + " " + ease;
          var top = seg.reduce(function (s, g) { return s + g.b - g.a; }, 0);
          if (top !== F || seg[0].a !== 0 || seg[seg.length - 1].b !== F) segSorun.push(ad + ": toplam " + top);
          for (var i = 1; i < seg.length; i++) if (seg[i].a !== seg[i - 1].b) segSorun.push(ad + ": bitişik değil");
          if (seg.length > 1 && seg.some(function (g) { return g.b - g.a < m; })) segSorun.push(ad + ": d < m (" + m + ")");
          if (seg.length > P.max) segSorun.push(ad + ": " + seg.length + " > " + P.max);
          if (ease === "step") {
            // kesim yalnız hızın değiştiği yerde (tekrarlanan t ya da iki farklı anahtarın ortası);
            // m'den kısa basamak komşudan pay alıp genişlediği için sınır en çok m − 1 kare kayar
            var izinli = [], nk = p.beats ? keys : p.keys.map(function (k) { return { t: k[0], v: k[1] / 100 }; });
            for (var q = 0; q + 1 < nk.length; q++) if (nk[q + 1].v !== nk[q].v) izinli.push(Math.round((nk[q].t + nk[q + 1].t) / 2 * F));
            seg.forEach(function (g) {
              if (g.a && !izinli.some(function (c) { return Math.abs(c - g.a) < m; })) segSorun.push(ad + ": basamak dışı kesim " + g.a);
            });
            if (izinli.some(function (c) { return c > 0 && c < F; }) && F >= 2 * m && seg.length < 2) segSorun.push(ad + ": basamaklar tek parçaya düştü");
          }
          if (!nanYok(seg)) segSorun.push(ad + ": NaN");
        });
      });
    });
  });
});
ok("segment: Σd = F, bitişik, d ≥ m, sayı sınırda, step yalnız basamaklarda (≤ m − 1 kare kayar) ve tek parçaya düşmez (4 fps × 4 süre × 3 yoğunluk × 3 geçiş × 11)", segSorun.length === 0, segSorun.slice(0, 6).join(" | "));
var vSeg = S.segment(vk, "smooth", 125, 25, "normal");
ok("vites: sınırlar u = 0.40 ve 0.70'te", js(vSeg.map(function (g) { return g.a; })) === js([0, 50, 88]), js(vSeg));
ok("segment: v parça ortalaması (Σ d·v = F·B)", yakin(vSeg.reduce(function (s, g) { return s + (g.b - g.a) * g.v; }, 0), 125 * 1.165, 1e-6));
ok("segment: 12 kare, 60 fps, Az: en kısa parça F/3'e iner, tek parçaya düşmez", S.segment(dk, "smooth", 12, 60, "few").length >= 3, S.segment(dk, "smooth", 12, 60, "few").length);
ok("segment: F < 2m (çok kısa F) yine tek parça", S.segment(dk, "smooth", 2, 60, "few").length === 1);
// 59.94p'de 13 karelik klip: eskiden tek parça {d:13, v:1} (Dengeli = rampasız, ses yine kapanırdı)
var p5994 = S.plan("dalis", {}, { frames: 13, fps: 60000 / 1001 });
ok("plan: 59.94p 13 kare Dalış en az 3 parça, %100'den farklı hızlar", p5994.segments.length >= 3 && p5994.maxV / p5994.minV > 1.5, JSON.stringify(p5994.segments));
var kisaDuz = [];
[23.976, 25, 29.97, 50, 59.94].forEach(function (fps) { [13, 20, 23].forEach(function (F) { ["dalis", "darbe", "doruk", "bukum"].forEach(function (id) {
  try { var pp = S.plan(id, { density: "few" }, { frames: F, fps: fps }); if (pp.segments.length < 2) kisaDuz.push(id + " " + fps + " " + F); } catch (e) { kisaDuz.push(id + " " + fps + " " + F + " " + e.message); }
}); }); });
ok("plan: kısa klipler (13–23 kare, 23.976–59.94 fps, Az) hep çok parçalı rampa", kisaDuz.length === 0, kisaDuz.join(" | "));
var duzHata = null;
try { S.plan("nabiz", {}, { frames: 12, fps: 25 }); } catch (e) { duzHata = e; }
ok("plan: tek hız çıkan plan (Nabız 12 kare: parçalar ortalamada %100) 'duz' koduyla atar", !!duzHata && duzHata.kod === "duz" && /aynı hızda/.test(duzHata.message), duzHata && duzHata.message);
// Basamaklı Hızlı Çıkış eskiden "duz" ile atardı (step sol değeri tutuyordu, t = 1'deki %600 hiç görünmüyordu)
var cikisEx = S.plan("cikis", { ease: "step" }, { frames: 100, fps: 25, handleSec: 10 });
ok("plan: Basamaklı Hızlı Çıkış exact: 80 kare %100, 20 kare %600, kaynak 200 kare", cikisEx.mode === "exact" && cikisEx.segments.length === 2 &&
  cikisEx.segments[0].d === 80 && yakin(cikisEx.segments[0].v, 1, 1e-5) && cikisEx.segments[1].d === 20 && yakin(cikisEx.segments[1].v, 6, 1e-5) &&
  yakin(cikisEx.srcFrames, 200, 1e-3) && cikisEx.srcFrames <= 200, js(cikisEx.segments));
var cikisBal = S.plan("cikis", { ease: "step" }, { frames: 100, fps: 25 });
ok("plan: Basamaklı Hızlı Çıkış Dengeli (tutamak bilinmiyor): yine 1:6 basamak, Σ d·v = F", cikisBal.mode === "balanced" && cikisBal.segments.length === 2 &&
  yakin(cikisBal.maxV / cikisBal.minV, 6, 0.01) && cikisBal.segments[1].v > cikisBal.segments[0].v && Math.abs(dvToplam(cikisBal) - 100) <= 0.01, js(cikisBal.segments));
var stepSorun = [];
L.forEach(function (p) {
  if (p.beats) return;
  var vs = p.keys.map(function (k) { return k[1] / 100; }), en = Math.max.apply(null, vs), az = Math.min.apply(null, vs);
  [{ handleSec: 1000 }, { handleSec: null }].forEach(function (c) {
    var pl;
    try { pl = S.plan(p.id, { ease: "step" }, { frames: 200, fps: 25, handleSec: c.handleSec }); } catch (e) { stepSorun.push(p.id + " " + (e.kod || e.message)); return; }
    // 200 karede orta noktalar kareye oturur: exact'te uç hızlar aynen, Dengeli'de oran aynen
    if (pl.mode === "exact" && !(yakin(pl.maxV, en, 1e-3) && yakin(pl.minV, az, 1e-3))) stepSorun.push(p.id + " exact " + pl.minV + "–" + pl.maxV);
    if (!yakin(pl.maxV / pl.minV, en / az, 0.01 * en / az)) stepSorun.push(p.id + " " + pl.mode + " oran " + (pl.maxV / pl.minV));
    var ilk = pl.segments[0].v, son = pl.segments[pl.segments.length - 1].v;
    if (!yakin(ilk / pl.c, vs[0], 1e-3) || !yakin(son / pl.c, vs[vs.length - 1], 1e-3)) stepSorun.push(p.id + " " + pl.mode + " uç parça " + ilk + " / " + son);
  });
});
ok("plan: her önayar Basamaklı'da rampa (duz yok), uç parçalar ilk/son anahtarın hızında, uç hız oranı korunur", stepSorun.length === 0, stepSorun.slice(0, 5).join(" | "));
// Uç basamak yarıya indiği için kısa klipte m'den kısa kalabilir: komşusuna katılmaz, m'ye genişler
// (eskiden tek parçaya düşüp duz atardı; inceleme bulgusu)
var kisaStep = [];
[["giris", { frames: 60, fps: 29.97, handleSec: 1000, hitFrac: 0.3 }, {}], ["doruk", { frames: 30, fps: 59.94, handleSec: 1000, hitFrac: 0.5 }, {}],
 ["ritim", { frames: 50, fps: 59.94, handleSec: 1000, beatsU: [0.5] }, { density: "few" }], ["giris", { frames: 19, fps: 29.97, handleSec: 60 }, {}],
 ["giris", { frames: 60, fps: 29.97, hitFrac: 0.4 }, { density: "few", k: 1.4 }]].forEach(function (c) {
  var o = { ease: "step" }; for (var a in c[2]) o[a] = c[2][a];
  try { var pl = S.plan(c[0], o, c[1]); if (pl.segments.length < 2 || !(pl.maxV / pl.minV > 1.5)) kisaStep.push(c[0] + " F" + c[1].frames + " " + js(pl.segments)); } catch (e) { kisaStep.push(c[0] + " F" + c[1].frames + " " + (e.kod || e.message)); }
});
var stepDuz = [];
L.forEach(function (p) {
  [23.976, 29.97, 59.94].forEach(function (fps) { ["few", "normal"].forEach(function (den) { [null, 0.25, 0.5].forEach(function (hf) {
    for (var F = 12; F <= 90; F += 3) {
      try { S.plan(p.id, { ease: "step", density: den }, { frames: F, fps: fps, handleSec: 1000, hitFrac: hf, beatsU: [0.3, 0.7] }); } catch (e) { if (e.kod === "duz") stepDuz.push(p.id + " " + fps + " " + den + " F" + F); else throw e; }
    }
  }); }); });
});
ok("plan: Basamaklı kısa klipte de rampa (uç basamak m'ye genişler, duz yok; 11 önayar × 12–90 kare × 3 fps × 2 yoğunluk × 3 hizalama)", kisaStep.length === 0 && stepDuz.length === 0, kisaStep.concat(stepDuz).slice(0, 5).join(" | "));
// Nabız + hizalama, 1 sn altı: dönüşümlü kısa basamaklar birleşip tek hıza eriyordu (inceleme); son çare en
// karşıt tek kesim
var nabizKisa = [];
[[29.97, 22, "few", 0.5, "balanced"], [59.94, 26, "normal", 0.5, "balanced"], [59.94, 46, "few", 0.5, "balanced"], [59.94, 28, "few", 0.55, "auto"], [29.97, 22, "few", 0.65, "auto"]].forEach(function (c) {
  try {
    var pl = S.plan("nabiz", { ease: "step", density: c[2], k: 1.25, mode: c[4] }, { frames: c[1], fps: c[0], hitFrac: c[3], handleSec: 1000 });
    if (!(pl.segments.length >= 2 && pl.maxV / pl.minV > 1.5)) nabizKisa.push(js(c) + " " + js(pl.segments));
  } catch (e) { nabizKisa.push(js(c) + " " + (e.kod || e.message)); }
});
var nabizHit = [];
[[25, 15, "few", 0.4], [29.97, 22, "few", 0.5], [59.94, 26, "normal", 0.5], [25, 20, "few", 0.3], [59.94, 46, "few", 0.5]].forEach(function (c) {
  var pl;
  try { pl = S.plan("nabiz", { ease: "step", density: c[2], mode: "balanced" }, { frames: c[1], fps: c[0], hitFrac: c[3] }); } catch (e) { return; }
  var x = pl.hit.u * c[1], t = 0, hv = null, digerleri = [];
  pl.segments.forEach(function (g) { if (hv === null && t + g.d > x) hv = g.v; else digerleri.push(g.v); t += g.d; });
  // Nabız vuruşu yavaş platoda: vuruşu içeren parça en az bir diğerinden yavaş olmalı (ters rampa yazılmaz)
  if (!(digerleri.some(function (v) { return hv < v; }))) nabizHit.push(js(c) + " " + js(pl.segments) + " vuruş " + x.toFixed(1));
});
ok("son çare kesim vuruş anına uyar: Nabız'ın yavaş vuruşu yavaş parçada (ya da duz)", nabizHit.length === 0, nabizHit.join(" | "));
var duzB = [], t0 = Date.now();
for (var bi = 0; bi < 24; bi++) duzB.push((bi + 0.5) / 24);
try { S.plan("ritim", { ease: "step", slowV: 0.996, fastV: 1.004 }, { frames: 18000, fps: 30, beatsU: duzB }); } catch (e) { /* duz beklenir */ }
var sure = Date.now() - t0;
ok("son çare tarama neredeyse düz eğride çalışmaz (18000 kare < 600 ms)", sure < 600, sure + " ms");
ok("plan: Basamaklı Nabız çok kısa klipte hizalamayla da rampa (tek hıza erimez)", nabizKisa.length === 0, nabizKisa.join(" | "));
// Ritme Rampa çok sık vuruşta: genişletme turu sınırı birleşmelerle küçülmez, her parça ≥ m
var sikSorun = [];
[[50, 50, 12, "few"], [59.94, 120, 21, "few"], [25, 60, 15, "normal"]].forEach(function (c) {
  var b = []; for (var i = 0; i < c[2]; i++) b.push((i + 0.5) / c[2]);
  var P = S.DENSITY[c[3]], m = Math.max(1, Math.min(Math.max(P.mmin, Math.round(P.mf * c[0])), Math.floor(c[1] / 3)));
  var seg = S.segment(S.beatKeys(b, {}, c[1]), "step", c[1], c[0], c[3]);
  if (seg.length > 1 && seg.some(function (g) { return g.b - g.a < m; })) sikSorun.push(js(c) + " m" + m + " " + js(seg.map(function (g) { return g.b - g.a; })));
});
ok("segment: Basamaklı sık vuruşta da her parça ≥ m (12 vuruş / 1 sn, 21 vuruş / 2 sn)", sikSorun.length === 0, sikSorun.join(" | "));
var ritStep = S.plan("ritim", { ease: "step", mode: "balanced" }, { frames: 250, fps: 25, beatsU: [0.2, 0.4, 0.6, 0.8] });
ok("plan: Basamaklı Ritme Rampa vuruşlarda yavaş, aralarda hızlı", [0.2, 0.4, 0.6, 0.8].every(function (u) { return kaynakAn(ritStep, u * 250 + 0.5) - kaynakAn(ritStep, u * 250 - 0.5) < 1; }) &&
  [0.02, 0.3, 0.5, 0.7, 0.98].every(function (u) { return kaynakAn(ritStep, u * 250 + 0.5) - kaynakAn(ritStep, u * 250 - 0.5) > 1; }), js(ritStep.segments));
var ritimDuz = S.plan("ritim", {}, { frames: 100, fps: 25, beatsU: [] });
ok("plan: vuruşsuz Ritme Rampa atmaz, vurusYok uyarısıyla döner", ritimDuz.warnings.indexOf("vurusYok") !== -1);
var cokSeg = S.segment(dk, "smooth", 25 * 60, 25, "many"), azSeg = S.segment(dk, "smooth", 25 * 60, 25, "few");
ok("yoğunluk: 'many' 'few'den fazla parça", cokSeg.length > azSeg.length && azSeg.length <= 8 && cokSeg.length <= 28, azSeg.length + " / " + cokSeg.length);

/* ---------------- plan: balanced ---------------- */
var balSorun = [];
L.forEach(function (p) {
  [12, 40, 101, 250, 1800].forEach(function (F) {
    [0.6, 1, 1.4].forEach(function (k) {
      var pl;
      // 12 karede Nabız'ın parçaları ortalamada %100: tek hız, duz ile atar (aşağıda ayrı denenir)
      try { pl = S.plan(p.id, { k: k, mode: "balanced" }, { frames: F, fps: 25, beatsU: [0.2, 0.45, 0.7] }); } catch (eD) {
        if (!(eD.kod === "duz" && p.id === "nabiz" && F === 12)) balSorun.push(p.id + " F" + F + " k" + k + ": " + eD.message);
        return;
      }
      var dv = dvToplam(pl);
      if (pl.mode !== "balanced") balSorun.push(p.id + " mod " + pl.mode);
      if (Math.abs(dv - F) > 0.01) balSorun.push(p.id + " F" + F + " k" + k + ": Σdv " + dv);
      if (pl.segments.some(function (g) { return !(g.v >= 0.1 && g.v <= 10) || Math.round(g.d) !== g.d || g.d < 1 || Math.round(g.v * 1e6) / 1e6 !== g.v; })) balSorun.push(p.id + " v/d sınır dışı");
      if (pl.segments.filter(function (g) { return Math.round(g.v * 1e4) / 1e4 !== g.v; }).length > 1) balSorun.push(p.id + " birden çok 6 ondalıklı parça");
      if (pl.segments.reduce(function (s, g) { return s + g.d; }, 0) !== F) balSorun.push(p.id + " Σd");
      if (!nanYok(pl)) balSorun.push(p.id + " NaN");
    });
  });
});
ok("plan balanced: |Σ d·v − F| ≤ 0.01, v ∈ [0.1, 10], 4 ondalık (artık taşıyan tek parça 6), Σd = F (11 × 5 süre × 3 yoğunluk)", balSorun.length === 0, balSorun.slice(0, 5).join(" | "));
var bal = S.plan("darbe", { mode: "balanced" }, { frames: 100, fps: 25 });
ok("balanced: c = 1/B, srcFrames = F, B ~1", yakin(bal.c, 1 / 1.404, 0.03) && yakin(bal.srcFrames, 100, 0.01) && yakin(bal.B, 1, 0.0002), bal.c + " " + bal.srcFrames);
var asiri = S.plan("atilim", { mode: "balanced", k: 1.5 }, { frames: 300, fps: 25 });
ok("balanced: sınıra dayanınca sinirlandi ve yine Σdv = F", (asiri.warnings.indexOf("sinirlandi") !== -1 || asiri.maxV < 10) && Math.abs(dvToplam(asiri) - 300) <= 0.01, js(asiri.warnings) + " " + asiri.maxV);

/* ---------------- plan: exact / auto ---------------- */
var ex = S.plan("cikis", {}, { frames: 100, fps: 25, handleSec: 10 });
ok("exact: yeterli tutamakta önayar hızları, kaynak ≈ F·B", ex.mode === "exact" && ex.c === 1 && ex.k === 1 && yakin(dvToplam(ex), 100 * S.B(S.get("cikis").keys), 0.1) &&
  ex.warnings.length === 0, ex.mode + " " + dvToplam(ex));
var exB = S.plan("doruk", {}, { frames: 100, fps: 25, handleSec: null });
ok("exact: B < 1 tutamaksız da sığar (doruk)", exB.mode === "exact" && exB.warnings.length === 0 && yakin(exB.B, 0.892, 0.02), exB.mode + " " + js(exB.warnings));
var dus = S.plan("cikis", {}, { frames: 100, fps: 25, handleSec: 2 });
var gerekli = ((dus.B - 1) * 100 + 2) / 25;
ok("auto: tutamak yetmezse yoğunluk düşer (yogunlukDustu, ≥ 0.6·k, tutamağa sığar)", dus.mode === "exact" && dus.warnings.indexOf("yogunlukDustu") !== -1 &&
  dus.k < 1 && dus.k >= 0.6 && gerekli <= 2 + 0.01, dus.k + " " + gerekli);
var den = S.plan("darbe", {}, { frames: 100, fps: 25, handleSec: 0 });
ok("auto: düşürmek de yetmezse balanced (dengeliyeGecti)", den.mode === "balanced" && den.warnings.indexOf("dengeliyeGecti") !== -1 && Math.abs(dvToplam(den) - 100) <= 0.01, js(den.warnings));
var ffYok = S.plan("giris", {}, { frames: 100, fps: 25, handleSec: null });
ok("auto: ffmpeg yokken (tutamak null) B > 1 ise exact seçilmez, yoğunluk düşürülmez; uyarı 'görüntü yok' değil sureYok", ffYok.mode === "balanced" && ffYok.k === 1 &&
  ffYok.warnings.indexOf("sureYok") !== -1 && ffYok.warnings.indexOf("dengeliyeGecti") === -1, ffYok.mode + " " + ffYok.k + " " + js(ffYok.warnings));
var kis = S.plan("cikis", {}, { frames: 100, fps: 25, handleSec: 100, partial: true });
ok("kısmi (In/Out) aralık her zaman balanced", kis.mode === "balanced" && kis.warnings.indexOf("dengeliyeGecti") === -1 && Math.abs(dvToplam(kis) - 100) <= 0.01);
ok("mode balanced seçilince tutamak olsa da balanced", S.plan("cikis", { mode: "balanced" }, { frames: 100, fps: 25, handleSec: 100 }).mode === "balanced");
ok("hostPlan biçimi", (function () { var h = S.hostPlan(ex); return h.mode === "exact" && h.segments.length === ex.segments.length && h.segments[0][0] === ex.segments[0].d && h.segments[0][1] === ex.segments[0].v && h.srcFrames === ex.srcFrames; })());

/* ---------------- vuruş anı hizalama ---------------- */
var hizSorun = [];
[0.25, 0.4, 0.5, 0.62].forEach(function (f) {
  ["darbe", "dalis", "bukum"].forEach(function (id) {
    var pl = S.plan(id, { mode: "balanced" }, { frames: 200, fps: 25, hitFrac: f });
    var x = pl.hit.u * pl.F, src = kaynakAn(pl, x);
    if (Math.abs(src - f * pl.F) > 1) hizSorun.push(id + " f" + f + ": " + src.toFixed(2) + " ≠ " + (f * pl.F));
    if (pl.warnings.indexOf("hitKaydi") !== -1) hizSorun.push(id + " f" + f + " gereksiz hitKaydi");
  });
});
var hx = S.plan("doruk", {}, { frames: 200, fps: 25, hitFrac: 0.5 });
if (hx.mode !== "exact" || Math.abs(kaynakAn(hx, hx.hit.u * hx.F) - 0.5 * 200) > 1) hizSorun.push("doruk exact " + hx.mode + " " + kaynakAn(hx, hx.hit.u * hx.F));
ok("alignHit: vuruş anındaki kaynak playhead karesine 1 kare içinde (balanced + exact)", hizSorun.length === 0, hizSorun.join(" | "));
var hizStep = [];
[0.25, 0.4, 0.5, 0.62].forEach(function (f) {
  ["darbe", "cikis", "giris", "atilim"].forEach(function (id) {
    var pl = S.plan(id, { mode: "balanced", ease: "step" }, { frames: 200, fps: 25, hitFrac: f });
    // vuruş anı sert basamaktaysa (Giriş/Çıkış) kesim kareye yuvarlanır: kaynakta birkaç kare, timeline'da
    // bir kareden az; görünür kayma (ikisi de > 1 kare) varsa hitKaydi şart
    var es = Math.abs(kaynakAn(pl, pl.hit.u * pl.F) - f * pl.F), et = Math.abs(zamanAn(pl, f * pl.F) - pl.hit.u * pl.F);
    if (Math.min(es, et) > 1.05 && pl.warnings.indexOf("hitKaydi") === -1) hizStep.push(id + " f" + f + ": es " + es.toFixed(2) + " et " + et.toFixed(2));
  });
});
ok("alignHit step: basamaklar bükülen eğriyle kayar, vuruş anı görünür biçimde (kaynak ya da timeline) 1 kare içinde ya da hitKaydi", hizStep.length === 0, hizStep.join(" | "));
// Basamaklı Giriş/Çıkış: vuruş anı görünen basamağa (hızın değiştiği yere) oturur, düz tutmanın ortasına değil
// (3. tur inceleme: Hızlı Çıkış'ta sıçrama vuruştan 5 sn sonra geliyordu)
var basamakVurus = [];
[["cikis", 90, 29.97, 0.4], ["cikis", 300, 23.976, 0.3], ["giris", 150, 25, 0.6], ["giris", 300, 23.976, 0.7]].forEach(function (c) {
  var pl = S.plan(c[0], { ease: "step" }, { frames: c[1], fps: c[2], hitFrac: c[3], handleSec: 1000 });
  if (pl.warnings.indexOf("hitKaydi") !== -1) return;
  var t = 0, enYakin = Infinity;
  for (var i = 1; i < pl.segments.length; i++) {
    t += pl.segments[i - 1].d;
    var r = pl.segments[i].v / pl.segments[i - 1].v;
    if (r >= 1.5 || r <= 1 / 1.5) enYakin = Math.min(enYakin, Math.abs(t - pl.hit.u * c[1]));
  }
  if (!(enYakin <= 1)) basamakVurus.push(c[0] + " F" + c[1] + " hf" + c[3] + " basamak vuruştan " + enYakin + " kare uzakta " + JSON.stringify(pl.segments));
});
var thC = S.thumb("cikis", 100, 50, { ease: "step" }), thG = S.thumb("giris", 100, 50, { ease: "step" }), thD = S.thumb("darbe", 100, 50, { ease: "step" });
ok("Basamaklı Giriş/Çıkış: vuruş anı görünen basamakta (plan 1 kare içinde, kart noktası 0.8 / 0.175'te; Darbe yerinde)",
  basamakVurus.length === 0 && thC.hit.x === 80 && thG.hit.x === 17.5 && thD.hit.x === 50, basamakVurus.join(" | ") + " " + js([thC.hit, thG.hit]));
// Tam hız kaynağın sonunu kullanmıyorsa ve vuruş anı o sonda kalıyorsa exact seçilmez (uydurma "kaydı" yazmasın)
var kirpik = S.plan("vites", {}, { frames: 60, fps: 23.976, hitFrac: 0.8, handleSec: 1000 });
ok("auto: exact vuruş anını kırpacaksa Dengeli; vuruş anı gösterilir", kirpik.srcFrames >= 0.8 * 60 - 1e-6 && (kirpik.mode === "balanced" || kirpik.B >= 0.8), kirpik.mode + " " + kirpik.srcFrames + " " + js(kirpik.warnings));
// Vuruş anı yazılacak parçalarda ölçülür: hem gösterilen kaynak karesi (es) hem hedef karenin timeline
// yeri (et) 1 kareden fazla kayarsa hitKaydi; err timeline kayması (sn). Ağır çekimde et, hızlıda es
// küçüktür: yalnız biri 1 kareyi aşıyorsa göze görünmez, uyarı yok
function zamanAn(p, y) {
  var t = 0, s = 0;
  for (var i = 0; i < p.segments.length; i++) { var g = p.segments[i]; if (s + g.d * g.v >= y) return t + (y - s) / g.v; t += g.d; s += g.d * g.v; }
  return t + (y - s);
}
var hitSessiz = [], hitSayac = { uyari: 0, sessiz: 0 };
L.forEach(function (p) {
  if (p.hit === null) return;
  ["smooth", "step"].forEach(function (e) { [59.94, 25].forEach(function (fps) { [0.25, 0.5, 0.75].forEach(function (f) { [30, 120, 150].forEach(function (F) {
    var pl;
    // kısa klipte Yumuşak Nabız gibi tek hız çıkanlar duz ile atar (ayrı denenir)
    try { pl = S.plan(p.id, { ease: e, density: "few", mode: F === 150 ? "auto" : "balanced" }, { frames: F, fps: fps, hitFrac: f, handleSec: F === 150 ? 1000 : null }); } catch (eD) {
      if (eD.kod !== "duz" || e === "step") hitSessiz.push(p.id + " " + e + " " + fps + " f" + f + " F" + F + " atar: " + (eD.kod || eD.message));
      return;
    }
    var es = Math.abs(kaynakAn(pl, pl.hit.u * F) - f * F), et = Math.abs(zamanAn(pl, f * F) - pl.hit.u * F), enAz = Math.min(es, et);
    var uyari = pl.warnings.indexOf("hitKaydi") !== -1;
    if (Math.abs(enAz - 1) < 0.05) return; // hit.u 4 ondalığa yuvarlı: eşikte ölçüm belirsiz
    if (uyari !== enAz > 1) hitSessiz.push(p.id + " " + e + " " + fps + " f" + f + " F" + F + " es " + es.toFixed(2) + " et " + et.toFixed(2) + " " + js(pl.warnings));
    else if (uyari && Math.abs(pl.hit.err * fps - et) > 0.1) hitSessiz.push(p.id + " " + e + " err " + pl.hit.err + " ≠ et " + (et / fps).toFixed(4));
    hitSayac[uyari ? "uyari" : "sessiz"]++;
  }); }); }); });
});
var doruk2 = S.plan("doruk", { ease: "step" }, { frames: 120, fps: 59.94, hitFrac: 0.25 });
var d2es = Math.abs(kaynakAn(doruk2, doruk2.hit.u * 120) - 30), d2et = Math.abs(zamanAn(doruk2, 30) - doruk2.hit.u * 120);
ok("plan: vuruş anı parçalarda ölçülür: kaynak karesi ve timeline yeri ikisi de 1 kareden çok kayarsa hitKaydi, err timeline kayması (Doruk Basamaklı 59.94p 2 sn dahil)",
  hitSessiz.length === 0 && hitSayac.uyari > 0 && hitSayac.sessiz > 0 && (Math.min(d2es, d2et) <= 1 || doruk2.warnings.indexOf("hitKaydi") !== -1),
  hitSessiz.slice(0, 4).join(" | ") + " " + js(hitSayac));
// Atılım'ın %700 flaşında 1 kaynak karesi timeline'da kare altı: uyarı yok (eskiden "Darbe anı 0.03 sn kaydı")
var atl = S.plan("atilim", { density: "normal", mode: "balanced" }, { frames: 23, fps: 29.97, hitFrac: 0.4 });
ok("plan: hızlı bölümde kare altı timeline kayması hitKaydi vermez (Atılım 29.97p 23 kare)", atl.warnings.indexOf("hitKaydi") === -1 &&
  Math.abs(zamanAn(atl, 0.4 * 23) - atl.hit.u * 23) < 1, js(atl.warnings) + " " + js(atl.segments));
// sınırlanan (0.1–0.9) vuruş anı parçalarda tam isabet ediyorsa uyarı yok
var sinirIsabet = S.plan("giris", { ease: "step", density: "few" }, { frames: 20, fps: 23.976, hitFrac: 0.15 });
ok("plan: sınırlanan vuruş anı yazılan parçalarda isabetliyse hitKaydi yok", sinirIsabet.hit.u === 0.1 && sinirIsabet.warnings.indexOf("hitKaydi") === -1, js(sinirIsabet.warnings) + " " + js(sinirIsabet.hit));
var disari = S.plan("darbe", { mode: "balanced" }, { frames: 200, fps: 25, hitFrac: 0.02 });
ok("alignHit: aralık dışı hedef [0.1, 0.9]'a sınırlanır (hitKaydi)", disari.hit.u === 0.1 && disari.warnings.indexOf("hitKaydi") !== -1 && disari.hit.err > 0, js(disari.hit));
var disariT = [];
L.forEach(function (p) {
  if (p.hit === null) return;
  ["smooth", "step"].forEach(function (e) { [0, 0.15, 0.3, 0.5, 0.77, 1].forEach(function (f) { ["balanced", "exact"].forEach(function (md) {
    S.alignHit(S.shape(p.id, { ease: e, k: 0.5 }), p.hit, f, md, e, 1).keys.forEach(function (k) { if (!(k.t >= 0 && k.t <= 1)) disariT.push(p.id + " " + e + " f" + f + " " + md + " t=" + k.t); });
  }); }); });
});
ok("alignHit: bükülen anahtarlar [0, 1] içinde (1.0000000000000002 olmaz)", disariT.length === 0, disariT.slice(0, 3).join(" | "));
var al = S.alignHit(S.get("dalis").keys, 0.5, 0.5, "balanced");
ok("alignHit: simetrik eğride f=0.5 yerinde kalır", yakin(al.hitU2, 0.5, 1e-6) && al.err < 1e-6 && !al.clamped, js(al));
var al2 = S.alignHit(S.get("nabiz").keys, 0.25, 0.4, "exact", "smooth", 4);
ok("alignHit exact: h' = f/a, uçlar sabit", al2.keys[0].t === 0 && al2.keys[al2.keys.length - 1].t === 1 && al2.keys.some(function (k) { return yakin(k.t, al2.hitU2, 1e-12); }), js(al2.keys.map(function (k) { return k.t; })));
ok("ritim: vuruş anı hizalanmaz (müziğe bağlı)", S.plan("ritim", {}, { frames: 200, fps: 25, hitFrac: 0.3, beatsU: [0.2, 0.6] }).hit === null);

/* ---------------- vuruşlar ---------------- */
var bk = S.beatKeys([0.2, 0.5, 0.8], {}, 300);
var yavaslar = bk.filter(function (k) { return k.v === 0.4; }), hizlilar = bk.filter(function (k) { return k.v === 2.5; });
var merkezler = [];
for (var yi = 0; yi + 1 < yavaslar.length; yi += 2) merkezler.push((yavaslar[yi].t + yavaslar[yi + 1].t) / 2);
ok("beatKeys: yavaş platolar vuruşlarda ortalanır", yavaslar.length === 6 && merkezler.every(function (m, i) { return yakin(m, [0.2, 0.5, 0.8][i], 1e-9); }) &&
  yakin(yavaslar[1].t - yavaslar[0].t, 0.25 * 0.3, 1e-9), js(bk));
ok("beatKeys: en hızlı anahtarlar orta noktalarda ve iki uçta", js(hizlilar.map(function (k) { return Math.round(k.t * 1000) / 1000; })) === js([0, 0.35, 0.65, 1]), js(hizlilar));
var bkF = S.beatKeys([0.2, 0.5, 0.8], { onBeat: "fast" }, 300);
ok("beatKeys: 'fast' yavaş ve hızlıyı takas eder", yakin(S.speedAt(bkF, 0.5, "smooth"), 2.5, 1e-9) && yakin(S.speedAt(bkF, 0.35, "smooth"), 0.4, 1e-9) && yakin(S.speedAt(bk, 0.5, "smooth"), 0.4, 1e-9));
var yakinV = S.beatKeys([0.5, 0.5 + 2 / 300, 0.3, { u: 0.3 + 3 / 300, guc: 5 }], {}, 300);
var yv2 = yakinV.filter(function (k) { return k.v === 0.4; });
ok("beatKeys: 4 kareden yakın vuruşlar birleşir (güçlünün yeri kalır)", yv2.length === 4 && yakin((yv2[0].t + yv2[1].t) / 2, 0.31, 1e-9), js(yv2));
var cok = [];
for (var b = 0; b < 40; b++) cok.push({ u: 0.01 + b * 0.0245, guc: b === 7 ? 9 : (b % 3 ? 0.2 : 0.8) });
var bk24 = S.beatKeys(cok, {}, 2000);
var plato = bk24.filter(function (k) { return k.v === 0.4; }).length / 2;
ok("beatKeys: en çok 24 vuruş, zayıflar atılır", plato === 24 && bk24.some(function (k) { return k.v === 0.4 && Math.abs(k.t - (0.01 + 7 * 0.0245)) < 0.01; }), plato);
ok("beatKeys: aralık dışı ve geçersiz vuruşlar atılır, boşsa []", S.beatKeys([-0.1, 1.2, NaN, "x"], {}, 100).length === 0 && S.beatKeys(null).length === 0);
var vyok = S.plan("ritim", {}, { frames: 100, fps: 25, beatsU: [] });
ok("ritim: vuruş yoksa vurusYok uyarısı, düz eğri", vyok.warnings.indexOf("vurusYok") !== -1 && vyok.segments.every(function (g) { return g.v === 1; }), js(vyok.warnings));
var rit = S.plan("ritim", { mode: "balanced" }, { frames: 250, fps: 25, beatsU: [0.2, 0.4, 0.6, 0.8] });
ok("ritim: vuruşta yavaş parça", (function () {
  return [0.2, 0.4, 0.6, 0.8].every(function (u) { var x = u * 250, t = 0; for (var i = 0; i < rit.segments.length; i++) { if (t + rit.segments[i].d > x) return rit.segments[i].v < 1; t += rit.segments[i].d; } return false; });
})(), js(rit.segments));

/* ---------------- kalite ---------------- */
var qp = { segments: [{ d: 10, v: 0.5 }, { d: 10, v: 2 }] };
var q30 = S.quality(qp, 30, 30), q120 = S.quality(qp, 30, 120);
ok("quality: 30p kaynakta cleanMin 1 ve uyarı; 120p'de 0.25, uyarı yok", q30.cleanMin === 1 && q30.warn && q30.slowParts === 1 && q120.cleanMin === 0.25 && !q120.warn, js([q30, q120]));
ok("plan: düşük fps kaynakta takilabilir uyarısı", S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 30, srcFps: 30 }).warnings.indexOf("takilabilir") !== -1 &&
  S.plan("dalis", { mode: "balanced" }, { frames: 100, fps: 30, srcFps: 240 }).warnings.indexOf("takilabilir") === -1);

/* ---------------- parseMedia ---------------- */
var ff1 = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'C:\\cekim\\a.mp4':\n  Metadata:\n    major_brand     : isom\n  Duration: 00:01:23.45, start: 0.000000, bitrate: 12000 kb/s\n" +
  "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 11800 kb/s, 29.97 fps, 29.97 tbr, 30k tbn (default)\n" +
  "  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 192 kb/s (default)\nAt least one output file must be specified\n";
var ff2 = "  Duration: 00:00:05.00, start: 0.000000, bitrate: 900 kb/s\r\n    Stream #0:0: Video: prores (HQ), yuv422p10le, 3840x2160, 119.88 tbr, 120k tbn\r\n";
var ff3 = "  Duration: N/A, bitrate: N/A\n    Stream #0:0: Audio: pcm_s16le, 48000 Hz\n";
var m1 = S.parseMedia(ff1), m2 = S.parseMedia(ff2), m3 = S.parseMedia(ff3);
ok("parseMedia: süre ve fps", yakin(m1.duration, 83.45, 1e-9) && m1.fps === 29.97 && yakin(m2.duration, 5, 1e-9) && m2.fps === 119.88, js([m1, m2]));
ok("parseMedia: süre yok / video yok → null", m3.duration === null && m3.fps === null && S.parseMedia("").duration === null && S.parseMedia(null).fps === null, js(m3));

/* ---------------- çizim ---------------- */
function sayilar(d) { return (String(d).match(/-?\d+(\.\d+)?/g) || []).map(Number); }
var cizSorun = [];
L.forEach(function (p) {
  var t1 = S.thumb(p.id, 120, 56), t2 = S.thumb(p.id, 120, 56);
  if (js(t1) !== js(t2)) cizSorun.push(p.id + " belirlenimci değil");
  var n = sayilar(t1.path);
  for (var i = 0; i + 1 < n.length; i += 2) if (n[i] < 0 || n[i] > 120 || n[i + 1] < 0 || n[i + 1] > 56) { cizSorun.push(p.id + " dışarıda " + n[i] + "," + n[i + 1]); break; }
  if (!(t1.base > 0 && t1.base < 56)) cizSorun.push(p.id + " taban");
  if (p.hit !== null && !(t1.hit && t1.hit.x >= 0 && t1.hit.x <= 120 && t1.hit.y >= 0 && t1.hit.y <= 56)) cizSorun.push(p.id + " vuruş noktası");
  var pl = S.plan(p.id, { mode: "balanced" }, { frames: 90, fps: 30, beatsU: [0.3, 0.7] });
  var st = S.steps(pl, 320, 120);
  if (st.length !== pl.segments.length) cizSorun.push(p.id + " steps sayısı");
  st.forEach(function (r) { if (r.x < 0 || r.x + r.w > 320.05 || r.y < 0 || r.y + r.h > 120.05 || !(r.w > 0) || !(r.h >= 1)) cizSorun.push(p.id + " çubuk " + js(r)); });
  if (js(st) !== js(S.steps(pl, 320, 120))) cizSorun.push(p.id + " steps belirlenimci değil");
});
ok("thumb() ve steps() belirlenimci, viewBox içinde", cizSorun.length === 0, cizSorun.slice(0, 4).join(" | "));
var tc = S.thumb("cikis", 120, 56, { ease: "step" });
ok("thumb/path step: köşeler tam (Hızlı Çıkış: %100'de 96 px'e kadar düz, 96'da dikey sıçrama, %600'de 120'ye)",
  tc.path === "M0 " + tc.base + " L72 " + tc.base + " L96 " + tc.base + " L96 " + S.yAt(6, 56) + " L120 " + S.yAt(6, 56) &&
  S.path(S.get("vites").keys, "step", 100, 50).split(" L").length === 6, tc.path);
ok("thumb: %100 çizgisi log ekseninde (%800 üstte, %25 altta: %100 yukarıdan 3/5)", yakin(S.base(120), 7.2 + 0.6 * 105.6, 0.01), S.base(120));
ok("yAt: %800 üstte, %25 altta", S.yAt(8, 100) < S.yAt(1, 100) && S.yAt(0.25, 100) > S.yAt(1, 100) && S.yAt(100, 100) === S.yAt(8, 100));

/* ---------------- özet, remap, clipFor ---------------- */
var oz = S.summary(bal, 1 / 25);
ok("summary: parça, en yavaş/en hızlı %, süreler", oz.pieces === bal.segments.length && oz.minPct === Math.round(bal.minV * 100) && oz.maxPct === Math.round(bal.maxV * 100) &&
  oz.timelineSec === 4 && yakin(oz.srcSec, 4, 0.01), js(oz));
var rk = S.remapKeys(ex, 10, 1 / 25);
ok("remapKeys: parça sınırlarında artan kaynak zamanı", rk.length === ex.segments.length + 1 && rk[0].time === 0 && rk[0].value === 10 && yakin(rk[rk.length - 1].time, 4, 1e-6) &&
  yakin(rk[rk.length - 1].value, 10 + ex.srcFrames / 25, 1e-4) && rk.every(function (k, i) { return !i || (k.time > rk[i - 1].time && k.value > rk[i - 1].value); }));
var hed = { rangeStart: 10, rangeEnd: 14, outPoint: 20, partial: false };
var cf = S.clipFor(hed, 1 / 25, { media: { duration: 26, fps: 50 }, playhead: 11, hizala: true, beats: [{ t: 9 }, { t: 12, guc: 0.5 }, 13] });
ok("clipFor: kare, tutamak, vuruş anı, vuruş oranları", cf.frames === 100 && cf.fps === 25 && cf.handleSec === 6 && cf.hitFrac === 0.25 && cf.srcFps === 50 &&
  js(cf.beatsU) === js([{ u: 0.5, guc: 0.5 }, { u: 0.75, guc: 1 }]) && cf.partial === false, js(cf));
var cf2 = S.clipFor(hed, 1 / 25, { playhead: 30, hizala: true });
var cfBas = S.clipFor(hed, 1 / 25, { playhead: 10, hizala: true }), cfSon = S.clipFor(hed, 1 / 25, { playhead: 14, hizala: true }), cfIc = S.clipFor(hed, 1 / 25, { playhead: 10.04, hizala: true });
ok("clipFor: kurgu noktasındaki playhead (aralık sonu, başın 1 kare içi) vuruş sayılmaz", cfBas.hitFrac === null && cfSon.hitFrac === null && Math.abs(cfIc.hitFrac - 0.01) < 1e-9, js([cfBas.hitFrac, cfSon.hitFrac, cfIc.hitFrac]));
ok("clipFor: ffmpeg yok → tutamak null; playhead dışarıda → hizalama yok", cf2.handleSec === null && cf2.hitFrac === null && cf2.beatsU === null && cf2.srcFps === null);

/* ---------------- hatalar ve NaN ---------------- */
ok("bilinmeyen kimlik atar", (function () { try { S.plan("yok", {}, { frames: 100, fps: 25 }); return false; } catch (e) { return e.message === "Bilinmeyen rampa: yok"; } })());
ok("F < 12 atar", (function () { try { S.plan("dalis", {}, { frames: 11, fps: 25 }); return false; } catch (e) { return e.message === "Rampa için klip çok kısa"; } })() &&
  (function () { try { S.plan("dalis", {}, {}); return false; } catch (e) { return /çok kısa/.test(e.message); } })());
// Tek hız çıkan birleşimler (12 karede Nabız…) 'duz' ile atar: döngülerde atlanır
var duzSayi = 0;
function planDene(id, o, c) { try { return S.plan(id, o, c); } catch (e) { if (e.kod === "duz") { duzSayi++; return null; } throw e; } }
var nanSorun = [];
L.forEach(function (p) {
  [{}, { mode: "balanced", ease: "linear", density: "many" }, { ease: "step", density: "few", k: 1.5 }].forEach(function (o) {
    [{ frames: 12, fps: 23.976 }, { frames: 777, fps: 59.94, handleSec: 3, hitFrac: 0.7, srcFps: 24, beatsU: [0.1, 0.9] }, { frames: 60, fps: 25, partial: true, hitFrac: 1 }].forEach(function (c) {
      var pl = planDene(p.id, o, c);
      if (!pl) return;
      if (!nanYok(pl) || !nanYok(S.summary(pl)) || !nanYok(S.steps(pl)) || !nanYok(S.remapKeys(pl, 0))) nanSorun.push(p.id + " " + js(o) + " " + js(c));
    });
  });
});
ok("hiçbir çıktıda NaN yok", nanSorun.length === 0, nanSorun.slice(0, 3).join(" | "));

/* ---------------- yuvarlama kaynağı artırmaz (Out medyanın sonuysa host'ta tutamak olurdu) ---------------- */
var asim = [];
L.forEach(function (p) {
  if (p.beats) return;
  [{ mode: "balanced" }, { mode: "balanced", density: "many" }, { mode: "balanced", k: 1.5 }, { k: 0.5, ease: "linear" }, { ease: "step" }, {}].forEach(function (o) {
    [12, 25, 37, 60, 100, 125, 181, 333].forEach(function (F) {
      [25, 30000 / 1001].forEach(function (fps) {
        var pl = planDene(p.id, o, { frames: F, fps: fps, handleSec: 0 }), top = 0;
        if (!pl) return;
        pl.segments.forEach(function (g) { top += g.d * g.v; });
        if (pl.srcFrames > F && (pl.mode === "balanced" || pl.B <= 1)) asim.push(p.id + " " + js(o) + " " + F + " " + pl.mode + " " + pl.srcFrames);
        else if (pl.mode === "balanced" && Math.abs(top - F) > 0.006) asim.push(p.id + " " + F + " artık " + (top - F));
      });
    });
  });
});
ok("Dengeli ve tutamaksız exact: srcFrames ≤ F (4 ondalık artığı Out'u aşmaz), Dengeli Σ d·v ≈ F", asim.length === 0, asim.slice(0, 4).join(" | "));

/* ================= Özel eğri (3.4 adım 13) ================= */
var D = S.ozelDogrula;
function gecerliOzel(ks) {
  if (!Array.isArray(ks) || ks.length < 2 || ks.length > 8) return "sayı " + (ks && ks.length);
  if (ks[0].t !== 0 || ks[ks.length - 1].t !== 1) return "uçlar";
  for (var i = 0; i < ks.length; i++) {
    var k = ks[i];
    if (!(typeof k.t === "number" && typeof k.v === "number" && isFinite(k.t) && isFinite(k.v))) return "sayı değil";
    if (k.v < 0.1 || k.v > 10 || k.t < 0 || k.t > 1) return "sınır";
    if (i && ks[i - 1].t > k.t) return "sıra";
    if (i > 1 && ks[i - 2].t === k.t) return "üçlü t";
    if (i && ks[i - 1].t === k.t && ks[i - 1].v === k.v) return "aynı nokta";
  }
  return "";
}
ok("ozelDogrula: [t, %] → {t, v oran}; uçlar t = 0 ve t = 1'de aynı hızla eklenir", js(D([[0.3, 200], [0.7, 50]])) === js([{ t: 0, v: 2 }, { t: 0.3, v: 2 }, { t: 0.7, v: 0.5 }, { t: 1, v: 0.5 }]), js(D([[0.3, 200], [0.7, 50]])));
ok("ozelDogrula: {t, v} nesneleri ve sayı metinleri de okunur; sıralanır", js(D([{ t: 1, v: 1 }, { t: "0.5", v: "0.4" }, { t: 0, v: 2 }])) === js([{ t: 0, v: 2 }, { t: 0.5, v: 0.4 }, { t: 1, v: 1 }]));
ok("ozelDogrula: hız %10–%1000'e, zaman [0, 1]'e çekilir", js(D([[-0.3, 5], [0.5, 2000], [1.5, 100]])) === js([{ t: 0, v: 0.1 }, { t: 0.5, v: 10 }, { t: 1, v: 1 }]), js(D([[-0.3, 5], [0.5, 2000], [1.5, 100]])));
ok("ozelDogrula: aynı t'de en çok iki nokta (ilk ve son = sert basamak)", js(D([[0, 100], [0.4, 50], [0.4, 200], [0.4, 300], [1, 100]])) ===
  js([{ t: 0, v: 1 }, { t: 0.4, v: 0.5 }, { t: 0.4, v: 3 }, { t: 1, v: 1 }]));
ok("ozelDogrula: aynı t ve aynı hız tek nokta; uçtaki basamak görünen tek hıza iner", js(D([[0, 100], [0.5, 50], [0.5, 50], [1, 100]])) === js([{ t: 0, v: 1 }, { t: 0.5, v: 0.5 }, { t: 1, v: 1 }]) &&
  js(D([[0, 50], [0, 200], [1, 100]])) === js([{ t: 0, v: 2 }, { t: 1, v: 1 }]) && js(D([[0, 100], [1, 50], [1, 300]])) === js([{ t: 0, v: 1 }, { t: 1, v: 0.5 }]));
ok("ozelDogrula: geçersiz girdi (boş, null, sayısız) düz %100; geçersiz noktalar atılır", [[], null, "x", 5, [[null, 100]], [["a", 1]], [[0.5]], [{}]].every(function (x) {
  return js(D(x)) === js([{ t: 0, v: 1 }, { t: 1, v: 1 }]);
}) && js(D([[0.5, 50], [NaN, 3], [0.2, Infinity], null, [true, 100]])) === js([{ t: 0, v: 0.5 }, { t: 0.5, v: 0.5 }, { t: 1, v: 0.5 }]));
var dokuz = [[0, 100], [0.1, 100], [0.2, 100], [0.3, 100], [0.4, 400], [0.5, 100], [0.6, 100], [0.7, 100], [0.8, 100], [0.9, 100], [1, 100]];
var kesik = D(dokuz);
ok("ozelDogrula: 8'den çok nokta 8'e iner; en az iz bırakanlar atılır (sivri tepe kalır)", kesik.length === 8 && kesik.some(function (k) { return k.t === 0.4 && k.v === 4; }) && gecerliOzel(kesik) === "", js(kesik));
var tohum = 7;
function rast() { tohum = (tohum * 1103515245 + 12345) % 2147483648; return tohum / 2147483648; }
var fuzzSorun = [];
for (var fz = 0; fz < 400; fz++) {
  var n = Math.floor(rast() * 14), ham = [];
  for (var q = 0; q < n; q++) {
    var t = rast() < 0.2 ? (ham.length ? ham[ham.length - 1][0] : 0) : rast() * 1.4 - 0.2;
    ham.push(rast() < 0.5 ? [t, rast() * 1500] : { t: t, v: rast() * 12 });
  }
  var g = D(ham), neden = gecerliOzel(g);
  if (neden) fuzzSorun.push(neden + " " + js(ham));
  else if (js(D(g)) !== js(g)) fuzzSorun.push("idempotent değil " + js(ham));
  else if (js(D(S.ozelYuzde(g))) !== js(g)) fuzzSorun.push("[t, %] gidiş dönüş " + js(ham));
}
ok("ozelDogrula: 400 rastgele girdi → 2–8 nokta, uçlar 0 / 1, sıralı, t başına en çok iki, sınırda; idempotent; [t, %] gidiş dönüş aynı", fuzzSorun.length === 0, fuzzSorun.slice(0, 2).join(" | "));
ok("ozelHit: [0.02, 0.98] ya da null", S.ozelHit(0.5) === 0.5 && S.ozelHit(0) === 0.02 && S.ozelHit(1.4) === 0.98 && S.ozelHit(null) === null &&
  S.ozelHit(undefined) === null && S.ozelHit("") === null && S.ozelHit(true) === null && S.ozelHit(NaN) === null && S.ozelHit("0.3") === 0.3);

/* ---- plan: hazır önayarla aynı anahtarlar aynı planı verir ---- */
var aynaSorun = [], aynaSayi = 0;
L.forEach(function (p) {
  if (p.beats) return;
  [{}, { mode: "balanced" }, { ease: "step", density: "few" }, { ease: "linear", k: 1.4, density: "many" }, { k: 0.6 }].forEach(function (o) {
    [{ frames: 12, fps: 25 }, { frames: 100, fps: 25, handleSec: 1000 }, { frames: 250, fps: 59.94, handleSec: 0.5, hitFrac: 0.3, srcFps: 24 },
      { frames: 90, fps: 29.97, partial: true, hitFrac: 0.8 }, { frames: 300, fps: 30, handleSec: null, hitFrac: 0.5 }].forEach(function (c) {
      var oz = {};
      for (var a in o) oz[a] = o[a];
      oz.ozelKeys = p.keys; oz.ozelHit = p.hit;
      var a1, a2, h1 = "", h2 = "";
      try { a1 = S.plan(p.id, o, c); } catch (e) { h1 = e.kod || e.message; }
      try { a2 = S.plan("ozel", oz, c); } catch (e2) { h2 = e2.kod || e2.message; }
      aynaSayi++;
      if (h1 || h2) { if (h1 !== h2) aynaSorun.push(p.id + " hata " + h1 + " / " + h2); return; }
      if (a2.id !== "ozel") aynaSorun.push(p.id + " id " + a2.id);
      delete a1.id; delete a2.id;
      if (js(a1) !== js(a2)) aynaSorun.push(p.id + " " + js(o) + " " + js(c));
      if (js(S.hostPlan(a1)) !== js(S.hostPlan(a2))) aynaSorun.push(p.id + " hostPlan");
    });
  });
  var t1 = S.thumb(p.id, 120, 56), t2 = S.thumb("ozel", 120, 56, { ozelKeys: p.keys, ozelHit: p.hit });
  if (js(t1) !== js(t2)) aynaSorun.push(p.id + " küçük resim");
  if (js(S.shape(p.id, { k: 1.4 })) !== js(S.shape("ozel", { k: 1.4, ozelKeys: p.keys, ozelHit: p.hit }))) aynaSorun.push(p.id + " shape");
});
ok("özel eğri = hazır önayarın anahtarları → plan, hostPlan, hatalar, küçük resim ve biçim bire bir aynı (10 önayar × 5 seçenek × 5 klip)", aynaSorun.length === 0 && aynaSayi === 250,
  aynaSayi + " " + aynaSorun.slice(0, 3).join(" | "));

var butceSorun = [], ozelUyari = {};
tohum = 99;
for (var bz = 0; bz < 120; bz++) {
  var nn = 2 + Math.floor(rast() * 7), kk = [];
  for (var j2 = 0; j2 < nn; j2++) kk.push([j2 === 0 ? 0 : j2 === nn - 1 ? 1 : rast(), Math.round(10 + rast() * 990)]);
  if (rast() < 0.3 && nn > 2) kk.push([kk[1][0], Math.round(10 + rast() * 990)]);
  var oo = { ozelKeys: kk, ozelHit: rast() < 0.5 ? rast() : null, ease: ["smooth", "linear", "step"][bz % 3], k: [0.6, 1, 1.4][bz % 3], density: ["few", "normal", "many"][(bz >> 1) % 3], mode: bz % 4 ? "auto" : "balanced" };
  [{ frames: 12 + Math.floor(rast() * 400), fps: 25, handleSec: 0 }, { frames: 60 + Math.floor(rast() * 900), fps: 29.97, handleSec: rast() * 2, hitFrac: rast(), srcFps: 24 },
    { frames: 50 + Math.floor(rast() * 200), fps: 59.94, handleSec: null }, { frames: 40 + Math.floor(rast() * 200), fps: 23.976, partial: true }].forEach(function (c) {
    var pl = planDene("ozel", oo, c);
    if (!pl) return;
    pl.warnings.forEach(function (w) { ozelUyari[w] = 1; });
    var top = dvToplam(pl), sumD = pl.segments.reduce(function (s, g) { return s + g.d; }, 0);
    if (sumD !== pl.F) butceSorun.push("Σd " + js(oo) + js(c));
    if (pl.segments.some(function (g) { return g.v < 0.1 || g.v > 10; })) butceSorun.push("v sınır " + js(oo));
    if (!nanYok(pl)) butceSorun.push("NaN " + js(oo));
    if (pl.mode === "balanced" && Math.abs(top - pl.F) > 0.01) butceSorun.push("Dengeli Σ d·v " + (top - pl.F));
    if ((pl.mode === "balanced" || pl.B <= 1) && pl.srcFrames > pl.F) butceSorun.push("srcFrames " + pl.srcFrames + " > " + pl.F);
    if (pl.mode === "exact" && c.handleSec !== null && c.handleSec !== undefined && pl.B > 1 && (pl.B - 1) * pl.F + 2 > c.handleSec * c.fps + 1e-6) butceSorun.push("tutamak aşıldı " + js(c));
    if (c.partial && pl.mode !== "balanced") butceSorun.push("kısmi aralık Dengeli değil");
  });
}
ok("özel eğri: kaynak bütçesi önayarlarla aynı (Σd = F, v ∈ [0.1, 10], Dengeli Σ d·v ≈ F, srcFrames ≤ F, exact tutamağa sığar, kısmi aralık Dengeli; 120 rastgele eğri × 4 klip)",
  butceSorun.length === 0, butceSorun.slice(0, 3).join(" | "));
var hizli = { ozelKeys: [[0, 100], [0.5, 800], [1, 800]] };
var u1 = S.plan("ozel", hizli, { frames: 100, fps: 25, handleSec: 0.5 }).warnings, u2 = S.plan("ozel", hizli, { frames: 100, fps: 25, handleSec: null }).warnings;
var u3 = S.plan("ozel", { ozelKeys: [[0, 1000], [0.3, 10], [0.7, 10], [1, 1000]], mode: "balanced", k: 1.5 }, { frames: 100, fps: 25 }).warnings;
var u4 = S.plan("ozel", { ozelKeys: [[0, 100], [0.5, 20], [1, 100]] }, { frames: 100, fps: 25, partial: true, srcFps: 24 }).warnings;
var u5 = S.plan("ozel", { ozelKeys: [[0, 100], [0.7, 100], [1, 300]] }, { frames: 200, fps: 25, handleSec: 1.5 }).warnings;
ok("özel eğri: uyarı kodları önayarlardaki gibi (dengeliyeGecti, sureYok, sinirlandi, takilabilir, yogunlukDustu)", u1.indexOf("dengeliyeGecti") !== -1 && u2.indexOf("sureYok") !== -1 &&
  u3.indexOf("sinirlandi") !== -1 && u4.indexOf("takilabilir") !== -1 && u5.indexOf("yogunlukDustu") !== -1, js([u1, u2, u3, u4, u5]));
ok("özel eğri: düz eğri 'duz' ile atar (rampa değil)", (function () { try { S.plan("ozel", { ozelKeys: [[0, 150], [1, 150]] }, { frames: 100, fps: 25 }); return false; } catch (e) { return e.kod === "duz"; } })());
var vars = S.plan("ozel", {}, { frames: 100, fps: 25, hitFrac: 0.6 }), varsHit = S.plan("ozel", { ozelKeys: S.OZEL_VARSAYILAN.keys, ozelHit: S.OZEL_VARSAYILAN.hit }, { frames: 100, fps: 25, hitFrac: 0.6 });
ok("özel eğri: anahtar yoksa başlangıç eğrisi (tek derin ağır çekim, ağır çekim anı 0,5)", js(vars) === js(varsHit) && vars.hit && vars.hit.f === 0.6 && vars.minV < 1 && vars.maxV > 1 &&
  js(S.OZEL_VARSAYILAN) === js({ keys: [[0, 100], [0.5, 30], [1, 100]], hit: 0.5 }), js(vars.hit));
var hitsiz = S.plan("ozel", { ozelKeys: [[0, 100], [0.5, 30], [1, 100]], ozelHit: null }, { frames: 100, fps: 25, hitFrac: 0.6 });
var hitli = S.plan("ozel", { ozelKeys: [[0, 100], [0.5, 30], [1, 100]], ozelHit: 0.5 }, { frames: 100, fps: 25, hitFrac: 0.6 });
ok("özel eğri: ağır çekim anı yoksa playhead'e hizalanmaz; varsa hizalanır", hitsiz.hit === null && hitli.hit && hitli.hit.f === 0.6 && js(hitsiz.segments) !== js(hitli.segments));
var basamakli = S.plan("ozel", { ozelKeys: [[0, 50], [0.5, 50], [0.5, 300], [1, 300]], ease: "smooth" }, { frames: 100, fps: 25, mode: "balanced" });
ok("özel eğri: sert basamak zorunlu kesim olur (ortada basamak, iki yanda tek hız)", basamakli.segments.length === 2 && basamakli.segments[0].d === 50 && basamakli.segments[1].v > basamakli.segments[0].v * 5.9,
  js(basamakli.segments));

/* ---- düzenleyici geometrisi (SufloEgriEditor mod 'hiz') ---- */
var Z = S.ozel;
ok("ekran: %100 ortada, %10 altta, %1000 üstte; log2 eksen gidiş dönüş", Z.ekranY(1) === Z.ED.H / 2 && Z.ekranY(0.1) === Z.ED.H - Z.ED.PAD && Z.ekranY(10) === Z.ED.PAD &&
  Z.ekranX(0) === Z.ED.SOL && Z.ekranX(1) === Z.ED.W - Z.ED.PAD && [0.1, 0.25, 0.37, 1, 2.5, 8, 10].every(function (v) { return yakin(Z.egriV(Z.ekranY(v)), v, v * 0.003); }) &&
  [0, 0.123, 0.5, 1].every(function (t) { return yakin(Z.egriT(Z.ekranX(t)), t, 0.002); }) && Z.egriV(-50) === 10 && Z.egriV(1e4) === 0.1 && Z.egriT(-5) === 0 && Z.egriT(1e4) === 1);
var iz = Z.izgara();
ok("ızgara: 25 / 50 / 100 / 200 / 400 / 800 % yatay çizgiler (100 ana), dört çeyrek dikey", iz.yatay.map(function (x) { return x.etiket; }).join(",") === "25%,50%,100%,200%,400%,800%" &&
  iz.yatay.filter(function (x) { return x.ana; }).length === 1 && iz.yatay[2].ana && iz.dikey.length === 5 && iz.yatay.every(function (x, i) { return !i || x.y < iz.yatay[i - 1].y; }));
var e0 = [[0, 100], [0.5, 30], [1, 100]];
var ek1 = Z.ekle(e0, 0.25, 2.03);
ok("tıkla: noktayı sıraya ekler, hız %1'e yuvarlanır", ek1.i === 1 && js(ek1.keys) === js([{ t: 0, v: 1 }, { t: 0.25, v: 2.03 }, { t: 0.5, v: 0.3 }, { t: 1, v: 1 }]), js(ek1));
var ek2 = Z.ekle(e0, 0.263, 1.8, { shift: true });
ok("Shift+tıkla: zaman %5'e, hız ızgara çizgisine yapışır", ek2.keys[ek2.i].t === 0.25 && ek2.keys[ek2.i].v === 2 && Z.ekle(e0, 0.71, 0.3, { shift: true }).keys[2].v === 0.25 &&
  Z.ekle(e0, 0.7, 0.34, { shift: true }).keys[2].v === 0.25 && Z.ekle(e0, 0.7, 0.36, { shift: true }).keys[2].v === 0.5 && Z.ekle(e0, 0.7, 0.36, {}).keys[2].v === 0.36, js(ek2));
ok("tıkla: başka noktaya %1'den yakın 'yakin', 8 noktada 'dolu', sayı değilse 'gecersiz'", Z.ekle(e0, 0.505, 1).hata === "yakin" && Z.ekle(e0, 0.002, 1).hata === "yakin" &&
  Z.ekle([[0, 1], [0.1, 1], [0.2, 2], [0.3, 1], [0.4, 2], [0.5, 1], [0.6, 2], [1, 1]], 0.8, 1).hata === "dolu" && Z.ekle(e0, NaN, 1).hata === "gecersiz");
var ks0 = D([[0, 100], [0.3, 200], [0.5, 50], [0.5, 300], [0.8, 100], [1, 100]]);
var ts1 = Z.tasi(ks0, 1, 0.9, 0.333);
ok("sürükle: iç nokta komşusunun %1 yakınında durur (sıra ve dizin değişmez), hız %1'e", ts1.i === 1 && ts1.keys[1].t === 0.49 && ts1.keys[1].v === 0.33 && js(ks0) !== js(ts1.keys), js(ts1.keys));
var ts2 = Z.tasi(ks0, 3, 0.6, 4.4);
ok("sürükle: sert basamağın iki noktası birlikte kayar, yalnız tutulanın hızı değişir", ts2.keys[2].t === 0.6 && ts2.keys[3].t === 0.6 && ts2.keys[2].v === 0.5 && ts2.keys[3].v === 4.4 &&
  Z.tasi(ks0, 2, 0.1, 0.5).keys[2].t === 0.31 && Z.tasi(ks0, 2, 0.1, 0.5).keys[3].t === 0.31, js(ts2.keys));
var ts3 = Z.tasi(ks0, 0, 0.4, 7), ts4 = Z.tasi(ks0, 5, 0.2, 0.05);
ok("sürükle: uçların zamanı sabit, yalnız hızı oynar (%10–%1000)", ts3.keys[0].t === 0 && ts3.keys[0].v === 7 && ts4.keys[5].t === 1 && ts4.keys[5].v === 0.1);
var ts5 = Z.tasi(ks0, 1, 0.417, 1.7, { shift: true });
ok("Shift+sürükle: zaman %5'e, hız ızgaraya", ts5.keys[1].t === 0.4 && ts5.keys[1].v === 2, js(ts5.keys[1]));
ok("sürükle: geçersiz dizin null; girdi değişmez", Z.tasi(ks0, 9, 0.5, 1) === null && Z.tasi(ks0, -1, 0.5, 1) === null && ks0[1].t === 0.3 && ks0[1].v === 2);
ok("çift tık: iç nokta silinir, uçlar silinmez", js(Z.sil(e0, 1).keys) === js([{ t: 0, v: 1 }, { t: 1, v: 1 }]) && Z.sil(e0, 0) === null && Z.sil(e0, 2) === null);
var b1 = Z.basamak(e0, 1);
ok("Alt+tık: sert basamak açılır (aynı anda sonraki noktanın hızına atlar), yeni nokta seçili", b1.i === 2 && js(b1.keys) === js([{ t: 0, v: 1 }, { t: 0.5, v: 0.3 }, { t: 0.5, v: 1 }, { t: 1, v: 1 }]), js(b1));
var b2 = Z.basamak(b1.keys, 1), b3 = Z.basamak(b1.keys, 2);
ok("Alt+tık basamakta: basamak kapanır, tıklanan nokta kalır (soldakine: eski eğri)", js(b2.keys) === js(D(e0)) && b2.i === 1 &&
  js(b3.keys) === js([{ t: 0, v: 1 }, { t: 0.5, v: 1 }, { t: 1, v: 1 }]) && b3.i === 1, js([b2, b3]));
ok("Alt+tık: uçta 'uc', 8 noktada 'dolu'; komşular aynı hızdaysa iki katına atlar", Z.basamak(e0, 0).hata === "uc" && Z.basamak(e0, 2).hata === "uc" &&
  Z.basamak([[0, 1], [0.1, 1], [0.2, 2], [0.3, 1], [0.4, 2], [0.5, 1], [0.6, 2], [1, 1]], 3).hata === "dolu" &&
  Z.basamak([[0, 50], [0.5, 50], [1, 50]], 1).keys[2].v === 1 && Z.basamak([[0, 1000], [0.5, 1000], [1, 1000]], 1).keys[2].v === 5);
var yk = D([[0, 100], [0.5, 30], [0.5, 300], [1, 100]]);
ok("en yakın nokta: yarıçap içinde, basamağın iki noktası y ile ayrılır", Z.enYakin(yk, Z.ekranX(0.5), Z.ekranY(0.3) + 3, 9) === 1 && Z.enYakin(yk, Z.ekranX(0.5), Z.ekranY(3) - 2, 9) === 2 &&
  Z.enYakin(yk, Z.ekranX(0.25), Z.ekranY(1) - 40, 9) === -1 && Z.enYakin(yk, Z.ekranX(0) + 2, Z.ekranY(1), 9) === 0);
var yol1 = Z.yol(yk, "smooth"), yol2 = Z.yol(yk, "step"), yolN = sayilar(yol1);
ok("düzenleyici yolu: M ile başlar, sayılar sonlu ve kutuda; basamak dikey (aynı x iki y)", /^M/.test(yol1) && /^M/.test(yol2) && yolN.every(function (x) { return isFinite(x) && x >= 0 && x <= Z.ED.W; }) &&
  (function () { var x5 = String(Z.ekranX(0.5)); return yol1.indexOf("L" + x5 + " " + Z.ekranY(0.3)) !== -1 && yol1.indexOf("L" + x5 + " " + Z.ekranY(3)) !== -1; })(), yol1.slice(0, 120));

/* ---- adlı özel rampalar ---- */
var kl = S.ozelKayitlar([{ id: "r1", ad: "  Benim\u0007 rampam ", keys: [[0.2, 50]], hit: 0.4 }, { id: "r1", ad: "kopya", keys: [[0, 1]] }, { id: "X!", ad: "a", keys: [[0, 1]] },
  { id: "r2", ad: "", keys: [[0, 1]] }, { id: "r3", ad: "boş", keys: [] }, null, "x", { id: "r4", ad: "Uzun".repeat(20), keys: [[0, 100], [1, 300]], hit: "yok" }]);
ok("kayıtlar: bozuk / yinelenen / adsız / anahtarsız atılır; ad temizlenir (en çok 40); anahtarlar [t, %]", kl.length === 2 && kl[0].ad === "Benim rampam" &&
  js(kl[0].keys) === js([[0, 50], [0.2, 50], [1, 50]]) && kl[0].hit === 0.4 && kl[1].ad.length === 40 && kl[1].hit === null, js(kl));
var dolu = [];
for (var di = 0; di < 12; di++) dolu.push({ id: "r" + di, ad: "R" + di, keys: [[0, 100], [1, 200]] });
var ek12 = S.ozelKayitEkle(dolu, "Yeni", [[0, 100], [1, 50]], null, 1700000000000), ekAyni = S.ozelKayitEkle(dolu, "r5", [[0, 100], [0.5, 30], [1, 100]], 0.5, 1);
ok("kayıt: en çok 12 ('dolu'); aynı ad (büyük / küçük harf) üzerine yazılır, kimlik aynı kalır", S.ozelKayitlar(dolu.concat([{ id: "r99", ad: "fazla", keys: [[0, 1]] }])).length === 12 &&
  !ek12.ok && ek12.kod === "dolu" && ekAyni.ok && ekAyni.guncellendi && ekAyni.id === "r5" && ekAyni.liste.length === 12 && ekAyni.liste[5].hit === 0.5 && ekAyni.liste[5].keys.length === 3);
var ek1k = S.ozelKayitEkle([], "Rampa", [[0, 100], [0.5, 25], [1, 100]], 0.5, 1700000000000), ek2k = S.ozelKayitEkle(ek1k.liste, "İkinci", [[0, 300], [1, 100]], null, 1700000000000);
ok("kayıt: yeni kimlik benzersiz ve geçerli; adsız 'ad'; sil", ek1k.ok && /^r[0-9a-z]{1,16}$/.test(ek1k.id) && ek2k.ok && ek2k.id !== ek1k.id && /^r[0-9a-z]{1,16}$/.test(ek2k.id) &&
  S.ozelKayitlar(ek2k.liste).length === 2 && S.ozelKayitEkle([], "  \u0001 ", [[0, 1]], null, 1).kod === "ad" && S.ozelKayitSil(ek2k.liste, ek1k.id).length === 1, js(ek2k));
ok("kayıt adı: 'Özel rampa N' (ilk boş numara)", S.ozelKayitAdi([]) === "Özel rampa 1" && S.ozelKayitAdi([{ id: "r1", ad: "Özel rampa 2", keys: [[0, 1]] }]) === "Özel rampa 3" &&
  S.ozelKayitAdi([{ id: "r1", ad: "özel rampa 2", keys: [[0, 1]] }, { id: "r2", ad: "x", keys: [[0, 1]] }]) === "Özel rampa 3");
ok("kayıt adı İngilizce arayüzde: çevrilmiş ad ('Custom ramp 2') da dolu sayılır, üstüne yazılmaz", S.ozelKayitAdi([{ id: "r1", ad: "Custom ramp 2", keys: [[0, 1]] }],
  function (s) { return s.replace("Özel rampa", "Custom ramp"); }) === "Özel rampa 3" && S.ozelKayitAdi([{ id: "r1", ad: "Custom ramp 2", keys: [[0, 1]] }]) === "Özel rampa 2");
var enOzel = ["Özel rampa {n}"].filter(function (k) { return !EN.strings[k]; });
ok("varsayılan kayıt adı kalıbı i18n/en.js'te", enOzel.length === 0, enOzel.join(" | "));

/* ---- 3.4 adım 13 inceleme: düz özel eğri, eğri eşitliği / kurtarılabilirlik, CEP tuş ilgisi ---- */
var duzler = [[[0, 100], [1, 100]], [[0, 100], [0.5, 100], [1, 100]], [[0, 50], [0.3, 50.4], [1, 50]], [[0, 300], [0.5, 300], [0.5, 300], [1, 300]], []];
ok("ozelDuz: noktaları %1 içinde aynı hızdaki eğri (boş girdi düz %100)", duzler.every(function (k) { return S.ozelDuz(k); }) &&
  !S.ozelDuz(S.OZEL_VARSAYILAN.keys) && !S.ozelDuz([[0, 100], [1, 102]]) && !S.ozelDuz(S.get("vites").keys));
var duzHep = [];
// tam düz eğriler (%1'in içindeki fark Güçlü yoğunlukta %1'i aşabilir: o zaman plan rampa verir, metin gerekmez)
[duzler[0], duzler[1], duzler[3]].forEach(function (k) {
  [0.5, 1, 1.5].forEach(function (yo) { ["smooth", "linear", "step"].forEach(function (ea) { ["few", "normal", "many"].forEach(function (pa) { [12, 50, 400].forEach(function (F) {
    var kod = "";
    try { S.plan("ozel", { ozelKeys: k, ozelHit: 0.5, k: yo, ease: ea, density: pa }, { frames: F, fps: 25 }); } catch (e) { kod = e.kod || e.message; }
    if (kod !== "duz") duzHep.push(js(k) + " k" + yo + " " + ea + " " + pa + " F" + F + ": " + kod);
  }); }); }); });
});
ok("ozelDuz eğrisi her yoğunluk / yumuşatma / parça / uzunlukta 'duz' atar (panelin 'bir noktayı sürükle' demesi doğru)", duzHep.length === 0, duzHep.slice(0, 3).join(" | "));
ok("ozelAyni: doğrulanmış anahtarlar ve ağır çekim anı karşılaştırılır", S.ozelAyni({ keys: [[0, 100], [0.5, 30], [1, 100]], hit: 0.5 }, { keys: [{ t: 0.5, v: 0.3 }, { t: 0, v: 1 }, { t: 1, v: 1 }], hit: "0.5" }) &&
  !S.ozelAyni({ keys: S.OZEL_VARSAYILAN.keys, hit: 0.5 }, { keys: S.OZEL_VARSAYILAN.keys, hit: null }) && !S.ozelAyni({ keys: [[0, 100], [1, 200]] }, { keys: [[0, 100], [1, 201]] }) &&
  !S.ozelAyni({ keys: [[0, 100], [1, 200]] }, { keys: [[0, 100], [0.5, 150], [1, 200]] }) && S.ozelAyni(null, { keys: [] }));
var kayit13 = [{ id: "r1", ad: "Benim", keys: [[0, 100], [0.3, 420], [1, 100]], hit: 0.3 }];
ok("ozelBilinen: başlangıç eğrisi, her hazır kartın kopyası (Ritme Rampa hariç) ve adlı kayıt yeniden elde edilir; elle çizilen değil",
  S.ozelBilinen(S.OZEL_VARSAYILAN, []) && S.list().filter(function (p) { return !p.beats && p.id !== "ozel"; }).every(function (p) { return S.ozelBilinen({ keys: p.keys, hit: p.hit }, null); }) &&
  S.ozelBilinen({ keys: [[0, 100], [0.3, 420], [1, 100]], hit: 0.3 }, kayit13) && !S.ozelBilinen({ keys: [[0, 100], [0.3, 420], [1, 100]], hit: 0.4 }, kayit13) &&
  !S.ozelBilinen({ keys: S.get("darbe").keys, hit: 0.7 }, []) && !S.ozelBilinen({ keys: [[0, 100], [0.25, 400], [0.5, 30], [1, 100]], hit: 0.5 }, "bozuk"));
ok("CEP tuş ilgisi: düzenleyici Delete / Backspace, Düzenle Enter / Space (Windows VK, macOS sanal kodlar); başka tür boş",
  Z.tusIlgisi("editor", false) === js([{ keyCode: 46 }, { keyCode: 8 }]) && Z.tusIlgisi("editor", true) === js([{ keyCode: 117 }, { keyCode: 51 }]) &&
  Z.tusIlgisi("duzenle", false) === js([{ keyCode: 13 }, { keyCode: 32 }]) && Z.tusIlgisi("duzenle", true) === js([{ keyCode: 36 }, { keyCode: 49 }]) &&
  Z.tusIlgisi("", false) === "" && Z.tusIlgisi("constructor", false) === "" && Z.tusIlgisi(undefined, true) === "");

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
