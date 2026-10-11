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
var L = S.list();
var idler = L.map(function (p) { return p.id; });
ok("LIST: 11 önayar, benzersiz ASCII kimlikler", L.length === 11 && idler.every(function (id, i) { return /^[a-z]+$/.test(id) && idler.indexOf(id) === i; }), idler.join(","));
ok("LIST dışa kopya: değiştirmek modülü bozmaz", (function () { var x = S.list(); x[0].keys[0][1] = 999; x.pop(); return S.list().length === 11 && S.list()[0].keys[0][1] === 100; })());
var enEksik = [];
L.forEach(function (p) { [p.name, p.desc].forEach(function (s) { if (!EN.strings[s]) enEksik.push(s); }); });
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
            // kesim yalnız hızın değiştiği yerde: tekrarlanan t ya da iki farklı anahtarın ortası
            var izinli = {}, nk = p.beats ? keys : p.keys.map(function (k) { return { t: k[0], v: k[1] / 100 }; });
            for (var q = 0; q + 1 < nk.length; q++) if (nk[q + 1].v !== nk[q].v) izinli[Math.round((nk[q].t + nk[q + 1].t) / 2 * F)] = 1;
            seg.forEach(function (g) { if (g.a && !izinli[g.a]) segSorun.push(ad + ": basamak dışı kesim " + g.a); });
          }
          if (!nanYok(seg)) segSorun.push(ad + ": NaN");
        });
      });
    });
  });
});
ok("segment: Σd = F, bitişik, d ≥ m, sayı sınırda, step yalnız basamak karelerinde (4 fps × 4 süre × 3 yoğunluk × 3 geçiş × 11)", segSorun.length === 0, segSorun.slice(0, 6).join(" | "));
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
    var src = kaynakAn(pl, pl.hit.u * pl.F);
    if (Math.abs(src - f * pl.F) > 1) hizStep.push(id + " f" + f + ": " + src.toFixed(2) + " ≠ " + (f * pl.F));
  });
});
ok("alignHit step: basamaklar bükülen eğriyle kayar, vuruş anı yine 1 kare içinde", hizStep.length === 0, hizStep.join(" | "));
var disari = S.plan("darbe", { mode: "balanced" }, { frames: 200, fps: 25, hitFrac: 0.02 });
ok("alignHit: aralık dışı hedef [0.1, 0.9]'a sınırlanır (hitKaydi)", disari.hit.u === 0.1 && disari.warnings.indexOf("hitKaydi") !== -1 && disari.hit.err > 0, js(disari.hit));
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

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
