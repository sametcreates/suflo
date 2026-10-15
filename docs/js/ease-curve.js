/*
 * Suflo Yumuşatma motoru — saf modül (DOM'a, Premiere'e, dosyaya dokunmaz)
 * window.SufloEase · module.exports  (3.4, plan adım 9; Eğri, Geçiş/Zoom/Hareket eğrisi,
 * Hız Rampası özel eğrisi, varışta yaylanma ve SFC1 kodları bu motoru kullanır)
 *
 * Portions adapted from Rebound (https://github.com/meszmate/rebound), MIT License, Copyright (c) 2026 Rebound contributors. See THIRD_PARTY_NOTICES.md.
 *
 * Rebound'un lisansı tam metniyle burada: bu dosyanın her kopyası (suflo.app'te yayımlanan docs/js/ease-curve.js dahil;
 * THIRD_PARTY_NOTICES.md sitede yok) telif ve izin bildirimini kendisi taşısın (tests/test-ease-share.js denetler).
 *
 *   MIT License
 *
 *   Copyright (c) 2026 Rebound contributors
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 *
 * Rebound'dan (commit 0f9fd6c, client/js/easing/) uyarlananlar — her biri "// Rebound: <ad>" ile işaretli:
 *   bezier.js     cubicBezier (Newton 8 adım + ikiye bölme yedeği)
 *   penner.js     Penner kümesi (quad … bounce, In/Out/InOut), get, isMonotonic, elasticOutWith
 *   spring.js     resolveParams, spring, springNormalized, settleTime
 *                 (Suflo değişikliği: spring() oturma süresini rejime göre hesaplar — oturmaSuresi)
 *   sampler.js    toFunction, samplePoints, range, bakeFactors, turningPoints, slopeAt
 *   speedgraph.js endpointSpeeds, withStartSpeed, withEndSpeed, sampleSpeed, speedRange
 *   overshoot.js  dampedSine, extremaTimes, autoDuration, followThroughAnchors
 * Ad alanı Rebound.easing yerine SufloEase; ES5 (CEF 74 / Node 12.3).
 *
 * Suflo'nun kendi (temiz oda) eklemeleri: çok noktalı eğri ({type:'multi'}; her parça kendi
 * genel kübik Newton + ikiye bölme çözücüsüyle), normalize, split (de Casteljau, şekil değişmez),
 * flip (180° döndürme), invert (eksen değişimi; yalnız tekdüze eğri), toCss/fromCss (yalnız tek
 * 'cubic-bezier(a,b,c,d)'), hazır eğriler (BUILTINS), bakePlan (sık anahtar kare planı), yaylanPlan (varışta
 * yaylanma: Rebound'un overshoot matematiğini iniş anahtarından sonra anahtar karelere pişirir; adım 14) ve paylaşım:
 * SFC1 kodu (sfcKodla / sfcCoz adım 12; paylasimKodla / paylasimCoz 'egri' + 'hiz' türleri adım 15), .suflo-egri
 * dosyası (dosyaOku / dosyaYaz), serbest cubic-bezier / CSS yapıştırma (cssCoz / cssOku, yapistir), üçüncü taraf bir eğri
 * aracının dışa aktarma dosyasını yalnız JSON biçiminden okuma (aşağıdaki "dış biçim okuyucusu"; o aracın kodu
 * kullanılmaz) ve hepsini birleştiren iceAktar.
 * Premiere'in ExtendScript'i Bezier tutamaçlarını yazamaz: Suflo eğriyi sık anahtar karelere
 * "pişirir" (bakePlan). Çok noktalı eğrilerin metin sözdizimi YOK; yalnız SFC1 kodu ve .suflo-egri içinde JSON.
 * suflo.app/egri paylaşım sayfası kodu aynı modülle çözer: docs/js/ease-curve.js bu dosyanın bayt bayt kopyasıdır
 * (değiştirince kopyala; tests/test-ease-share.js denetler).
 *
 * Eğri tanımı (JSON):
 *   { type: 'bezier', x1, y1, x2, y2 }                 CSS cubic-bezier ile aynı
 *   { type: 'penner', name, inv? }                     ör. 'expoOut', 'bounceOut'
 *   { type: 'spring', response, bounce, flip?, inv? }  ya da mass/stiffness/damping/velocity
 *   { type: 'multi', pts: [{ x, y, ix, iy, ox, oy, smooth }] }
 *     x ∈ [0,1] zaman, y ∈ [-1,2] değer (1 = hedef); (ix,iy) giriş, (ox,oy) çıkış tutamacı
 *     (mutlak koordinat). İlk nokta (0,0), son nokta (1,1).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloEase = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var Y_MIN = -1, Y_MAX = 2;          // normalize: değer ekseni sınırı
  var MAX_PTS = 8;                    // çok noktalı eğride en çok nokta
  var MIN_GAP = 0.01;                 // iki nokta arasında en az x aralığı
  var CSS_MAX = 200;                  // fromCss: en uzun girdi
  var MAX_KEYS = 2000;                // bakePlan varsayılan anahtar sınırı

  function sonlu(v) { return typeof v === "number" && isFinite(v); }
  function sinirla(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function r6(v) { var r = Math.round(v * 1e6) / 1e6; return r === 0 ? 0 : r; }   // -0 → 0
  function kopya(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function dogrusal(t) { return t; }

  /* ================= bezier.js ================= */
  var NEWTON_ITERATIONS = 8;
  var SUBDIVISION_EPSILON = 1e-7;

  // Rebound: cubicBezier — CSS cubic-bezier(x1,y1,x2,y2); x [0,1]'e kırpılır, y aşabilir.
  // Suflo: ikiye bölme döngüsüne üst sınır (60 adım) eklendi.
  function cubicBezier(x1, y1, x2, y2) {
    var linear = x1 === y1 && x2 === y2;
    var cx = 3 * x1;
    var bx = 3 * (x2 - x1) - cx;
    var ax = 1 - cx - bx;
    var cy = 3 * y1;
    var by = 3 * (y2 - y1) - cy;
    var ay = 1 - cy - by;

    function sampleX(t) { return ((ax * t + bx) * t + cx) * t; }
    function sampleY(t) { return ((ay * t + by) * t + cy) * t; }
    function sampleDerivX(t) { return (3 * ax * t + 2 * bx) * t + cx; }

    function solveT(x) {
      var t = x;
      for (var i = 0; i < NEWTON_ITERATIONS; i++) {
        var xErr = sampleX(t) - x;
        if (Math.abs(xErr) < SUBDIVISION_EPSILON) return t;
        var d = sampleDerivX(t);
        if (Math.abs(d) < 1e-6) break;
        t -= xErr / d;
      }
      var lo = 0, hi = 1;
      t = x;
      for (var k = 0; k < 60 && lo < hi; k++) {
        var xEst = sampleX(t);
        if (Math.abs(xEst - x) < SUBDIVISION_EPSILON) return t;
        if (x > xEst) lo = t;
        else hi = t;
        t = (hi - lo) * 0.5 + lo;
      }
      return t;
    }

    return function ease(x) {
      if (linear) return x <= 0 ? 0 : x >= 1 ? 1 : x;
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return sampleY(solveT(x));
    };
  }

  /* ================= penner.js ================= */
  var PI = Math.PI;
  var c1 = 1.70158;
  var c2 = c1 * 1.525;
  var c3 = c1 + 1;
  var c4 = (2 * PI) / 3;
  var c5 = (2 * PI) / 4.5;
  var n1 = 7.5625;
  var d1 = 2.75;

  // Rebound: bounceOut
  function bounceOut(t) {
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }

  // Rebound: fns — Robert Penner'ın klasik kümesi, t ∈ [0,1]
  var fns = {
    linear: function (t) { return t; },
    quadIn: function (t) { return t * t; },
    quadOut: function (t) { return 1 - (1 - t) * (1 - t); },
    quadInOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    cubicIn: function (t) { return t * t * t; },
    cubicOut: function (t) { return 1 - Math.pow(1 - t, 3); },
    cubicInOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    quartIn: function (t) { return t * t * t * t; },
    quartOut: function (t) { return 1 - Math.pow(1 - t, 4); },
    quartInOut: function (t) { return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2; },
    quintIn: function (t) { return t * t * t * t * t; },
    quintOut: function (t) { return 1 - Math.pow(1 - t, 5); },
    quintInOut: function (t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; },
    sineIn: function (t) { return 1 - Math.cos((t * PI) / 2); },
    sineOut: function (t) { return Math.sin((t * PI) / 2); },
    sineInOut: function (t) { return -(Math.cos(PI * t) - 1) / 2; },
    expoIn: function (t) { return t === 0 ? 0 : Math.pow(2, 10 * t - 10); },
    expoOut: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    expoInOut: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    circIn: function (t) { return 1 - Math.sqrt(1 - Math.pow(t, 2)); },
    circOut: function (t) { return Math.sqrt(1 - Math.pow(t - 1, 2)); },
    circInOut: function (t) {
      return t < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
    },
    backIn: function (t) { return c3 * t * t * t - c1 * t * t; },
    backOut: function (t) { return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    backInOut: function (t) {
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    },
    elasticIn: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    },
    elasticOut: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    elasticInOut: function (t) {
      if (t === 0) return 0;
      if (t === 1) return 1;
      return t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    },
    bounceIn: function (t) { return 1 - bounceOut(1 - t); },
    bounceOut: bounceOut,
    bounceInOut: function (t) { return t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2; }
  };

  // Rebound: elasticOutWith — ayarlanabilir esnek çıkış (genlik ≥ 1, salınım, sönüm ≥ 2)
  function elasticOutWith(amplitude, oscillations, damping) {
    var a = Math.max(1, amplitude || 1);
    var osc = Math.max(0.5, oscillations || 2);
    var d = Math.max(2, damping || 8);
    var period = 1 / osc;
    var phase = (period / (2 * PI)) * Math.asin(1 / a);
    return function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return a * Math.pow(2, -d * t) * Math.sin(((t - phase) * (2 * PI)) / period) + 1;
    };
  }

  // Rebound: get — bilinmeyen ad doğrusal döner
  function pennerGet(name) {
    return Object.prototype.hasOwnProperty.call(fns, name) ? fns[name] : fns.linear;
  }

  // Rebound: isMonotonic (NON_MONOTONIC listesiyle) — taşan/salınan adlar tekdüze değil
  var NON_MONOTONIC = ["backIn", "backOut", "backInOut", "elasticIn", "elasticOut", "elasticInOut",
    "bounceIn", "bounceOut", "bounceInOut"];
  function pennerMonotonic(name) { return NON_MONOTONIC.indexOf(name) === -1; }

  /* ================= spring.js ================= */
  var TWO_PI = Math.PI * 2;
  function num(v, dflt) { return typeof v === "number" && isFinite(v) ? v : dflt; }

  // Rebound: resolveParams — fiziksel ya da algısal (response/bounce, response/dampingFraction)
  function resolveParams(opts) {
    opts = opts || {};
    if (opts.response != null && opts.bounce != null) {
      var mass = num(opts.mass, 1);
      var w0 = TWO_PI / Math.max(opts.response, 1e-4);
      var bounce = opts.bounce;
      var zeta = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
      return { mass: mass, stiffness: w0 * w0 * mass, damping: 2 * zeta * w0 * mass, velocity: num(opts.velocity, 0) };
    }
    if (opts.response != null && opts.dampingFraction != null) {
      var m2 = num(opts.mass, 1);
      var w = TWO_PI / Math.max(opts.response, 1e-4);
      var z = opts.dampingFraction;
      return { mass: m2, stiffness: w * w * m2, damping: 2 * z * w * m2, velocity: num(opts.velocity, 0) };
    }
    return {
      mass: num(opts.mass, 1),
      stiffness: num(opts.stiffness, 100),
      damping: num(opts.damping, 10),
      velocity: num(opts.velocity, 0)
    };
  }

  // Rebound: spring — sönümlü harmonik salınıcı, 0 → 1; { fn(t sn), settleTime, omega0, zeta, regime, params }
  // Suflo değişikliği: settleTime rejime göre ve başlangıç genliğiyle hesaplanır (oturmaSuresi);
  // Rebound'un zarf formülü kritik / aşırı sönümlü yayda ve kritiğe yakın az sönümlüde yayı
  // hedefin çok gerisinde bırakıyor, springNormalized de son karede 1'e sıçrıyordu.
  function spring(opts) {
    var p = resolveParams(opts);
    var m = p.mass, k = p.stiffness, c = p.damping, v0 = p.velocity;
    var w0 = Math.sqrt(k / m);
    var zeta = c / (2 * Math.sqrt(k * m));
    var fn, regime, kalan;
    if (zeta < 1) {
      regime = "underdamped";
      var wd = w0 * Math.sqrt(1 - zeta * zeta);
      var A = -1;
      var B = (v0 + zeta * w0 * A) / wd;
      fn = function (t) {
        var env = Math.exp(-zeta * w0 * t);
        return 1 + env * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
      };
      kalan = { tur: "az", genlik: Math.sqrt(A * A + B * B), hiz: zeta * w0 };
    } else if (zeta === 1 || Math.abs(zeta - 1) < 1e-6) {
      regime = "critical";
      var A2 = -1;
      var B2 = v0 + w0 * A2;
      fn = function (t) { return 1 + Math.exp(-w0 * t) * (A2 + B2 * t); };
      kalan = { tur: "kritik", a: Math.abs(A2), b: Math.abs(B2), hiz: w0 };
    } else {
      regime = "overdamped";
      var s = w0 * Math.sqrt(zeta * zeta - 1);
      var r1 = -zeta * w0 + s;
      var r2 = -zeta * w0 - s;
      var C1 = (v0 + r2) / (r1 - r2);
      var C2 = -1 - C1;
      fn = function (t) { return 1 + C1 * Math.exp(r1 * t) + C2 * Math.exp(r2 * t); };
      // yavaş kök, sayısal olarak kararlı biçimde: r1 · r2 = w0²
      kalan = { tur: "asiri", c1: Math.abs(C1), h1: w0 * w0 / (zeta * w0 + s), c2: Math.abs(C2), h2: zeta * w0 + s };
    }
    return { fn: fn, omega0: w0, zeta: zeta, regime: regime, settleTime: oturmaSuresi(kalan), params: p };
  }

  // Suflo: oturmaSuresi — |fn(t) − 1| ≤ epsilon olduğu, sonrasında da öyle kalan süre (üst sınır).
  //   az sönümlü: |fn − 1| ≤ √(A² + B²) · e^(−ζ·w0·t)
  //   kritik:     |fn − 1| ≤ (|A| + |B|·t) · e^(−w0·t)            (sabit nokta yinelemesi)
  //   aşırı:      |fn − 1| ≤ |C1|·e^(r1·t) + |C2|·e^(r2·t)         (her terim ≤ epsilon/2; YAVAŞ kök r1)
  function oturmaSuresi(kalan, epsilon) {
    epsilon = epsilon || 0.005;
    if (!kalan || !(kalan.hiz > 0 || kalan.tur === "asiri")) return Infinity;
    function terim(c, h, e) { return c > e ? Math.log(c / e) / h : 0; }
    var T;
    if (kalan.tur === "az") T = terim(Math.max(1, kalan.genlik), kalan.hiz, epsilon);
    else if (kalan.tur === "kritik") {
      T = Math.log(Math.max(1, kalan.a) / epsilon) / kalan.hiz;
      for (var i = 0; i < 60; i++) {
        var yeni = Math.log((kalan.a + kalan.b * T) / epsilon) / kalan.hiz;
        if (Math.abs(yeni - T) < 1e-9 * T) { T = yeni; break; }
        T = yeni;
      }
    } else {
      if (!(kalan.h1 > 0) || !(kalan.h2 > 0)) return Infinity;
      T = Math.max(terim(kalan.c1, kalan.h1, epsilon / 2), terim(kalan.c2, kalan.h2, epsilon / 2));
    }
    return isFinite(T) && T > 0 ? T : Infinity;
  }

  // Rebound: settleTime — zarf e^(-zeta*w0*t) epsilon altına inene dek (varsayılan %0,5).
  // (Rebound'un özgün API'si olarak dışa açık; Suflo'nun spring() / springNormalized() işlevleri
  // yerine oturmaSuresi kullanır.)
  function settleTime(w0, zeta, epsilon) {
    epsilon = epsilon || 0.005;
    var decay = zeta * w0;
    if (decay <= 0) return Infinity;
    return -Math.log(epsilon) / decay;
  }

  // Rebound: springNormalized — yayın kendi oturma süresi [0,1]'e ölçeklenir
  function springNormalized(opts) {
    var s = spring(opts);
    var dur = isFinite(s.settleTime) ? s.settleTime : 1;
    var ease = function (tNorm) {
      if (tNorm <= 0) return 0;
      if (tNorm >= 1) return 1;
      return s.fn(tNorm * dur);
    };
    ease.spec = s;
    return ease;
  }

  /* ================= Suflo: çok noktalı eğri (temiz oda) ================= */
  // Genel kübik Bezier katsayıları (p0..p3): değer = ((a t + b) t + c) t + d
  function kubik(p0, p1, p2, p3) {
    return { a: -p0 + 3 * p1 - 3 * p2 + p3, b: 3 * p0 - 6 * p1 + 3 * p2, c: -3 * p0 + 3 * p1, d: p0 };
  }
  function kubikDeger(k, t) { return ((k.a * t + k.b) * t + k.c) * t + k.d; }
  function kubikTurev(k, t) { return (3 * k.a * t + 2 * k.b) * t + k.c; }

  // x(t) = x için t: Newton (8 adım), olmazsa ikiye bölme. Tutamaç x'i kendi parçasında
  // tutulduğu için x(t) tekdüzedir (azalmaz); ikiye bölme her zaman yakınsar.
  function parcaCoz(kx, x0, x3, x) {
    var t = x3 > x0 ? (x - x0) / (x3 - x0) : 0;
    for (var i = 0; i < NEWTON_ITERATIONS; i++) {
      var hata = kubikDeger(kx, t) - x;
      if (Math.abs(hata) < SUBDIVISION_EPSILON) return t;
      var d = kubikTurev(kx, t);
      if (Math.abs(d) < 1e-6) break;
      t -= hata / d;
      if (!(t >= 0 && t <= 1)) break;
    }
    var lo = 0, hi = 1;
    for (var k = 0; k < 60; k++) {
      t = (lo + hi) / 2;
      var xe = kubikDeger(kx, t);
      if (Math.abs(xe - x) < SUBDIVISION_EPSILON) return t;
      if (xe < x) lo = t; else hi = t;
    }
    return (lo + hi) / 2;
  }

  function parcalar(pts) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      out.push({ x0: a.x, x3: b.x, kx: kubik(a.x, a.ox, b.ix, b.x), ky: kubik(a.y, a.oy, b.iy, b.y) });
    }
    return out;
  }

  function cokNoktaFn(pts) {
    var seg = parcalar(pts);
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var s = seg[seg.length - 1];
      for (var i = 0; i < seg.length; i++) { if (x <= seg[i].x3) { s = seg[i]; break; } }
      return kubikDeger(s.ky, parcaCoz(s.kx, s.x0, s.x3, x));
    };
  }

  /* ================= normalize ================= */
  var SPRING_ALAN = {
    response: [0.05, 10], bounce: [-0.95, 0.95], dampingFraction: [0.05, 5], mass: [0.01, 100],
    stiffness: [0.1, 100000], damping: [0.01, 10000], velocity: [-1000, 1000]
  };

  // Aralık karşılaştırmalarında kayan nokta payı: tam 0,01 aralıklı iki nokta (0,05 + 0,01 =
  // 0,060000000000000005 > 0,06) atılmasın; normalize(normalize(c)) ve flip∘flip özdeş kalsın.
  var GAP_EPS = 1e-9;

  function normMulti(c) {
    if (!c || !Array.isArray(c.pts) || c.pts.length < 2) return null;
    var ham = [];
    for (var i = 0; i < c.pts.length && i < 64; i++) {
      var p = c.pts[i];
      // x önce 1e-6'ya yuvarlanır: aralık kararı yazılan (yuvarlı) değerle verilir, ikinci
      // normalize aynı kararı verir
      if (p && sonlu(p.x) && sonlu(p.y)) ham.push({ p: p, x: r6(sinirla(p.x, 0, 1)), y: sinirla(p.y, Y_MIN, Y_MAX), s: i });
    }
    if (ham.length < 2) return null;
    ham.sort(function (a, b) { return a.x - b.x || a.s - b.s; });
    // uçlar: x ≈ 0 olan ilk nokta başlangıç olur, yoksa (0,0) eklenir; sonda da aynısı
    var bas = ham[0].x <= MIN_GAP / 2 ? ham.shift() : null;
    var son = ham.length && ham[ham.length - 1].x >= 1 - MIN_GAP / 2 ? ham.pop() : null;
    var ic = [], onceki = 0;
    ham.forEach(function (h) {
      if (h.x >= onceki + MIN_GAP - GAP_EPS && h.x <= 1 - MIN_GAP + GAP_EPS) { ic.push(h); onceki = h.x; }
    });
    if (ic.length > MAX_PTS - 2) {
      var sec = [], n = ic.length, m = MAX_PTS - 2;
      for (var k = 0; k < m; k++) sec.push(ic[Math.round(k * (n - 1) / (m - 1))]);
      ic = sec;
    }
    function nokta(h, x, y) {
      var q = h ? h.p : {};
      return { x: x, y: y, ix: q.ix, iy: q.iy, ox: q.ox, oy: q.oy, smooth: !!q.smooth };
    }
    var pts = [nokta(bas, 0, 0)];
    ic.forEach(function (h) { pts.push(nokta(h, h.x, h.y)); });
    pts.push(nokta(son, 1, 1));
    // tutamaçlar: eksikse komşuya doğru 1/3 (doğru parça); x kendi parçasında, y [-1,2]
    for (var j = 0; j < pts.length; j++) {
      var q = pts[j], o = pts[j - 1], s2 = pts[j + 1];
      if (o) {
        if (!sonlu(q.ix) || !sonlu(q.iy)) { q.ix = q.x + (o.x - q.x) / 3; q.iy = q.y + (o.y - q.y) / 3; }
        q.ix = r6(sinirla(q.ix, o.x, q.x)); q.iy = r6(sinirla(q.iy, Y_MIN, Y_MAX));
      } else { q.ix = q.x; q.iy = q.y; }
      if (s2) {
        if (!sonlu(q.ox) || !sonlu(q.oy)) { q.ox = q.x + (s2.x - q.x) / 3; q.oy = q.y + (s2.y - q.y) / 3; }
        q.ox = r6(sinirla(q.ox, q.x, s2.x)); q.oy = r6(sinirla(q.oy, Y_MIN, Y_MAX));
      } else { q.ox = q.x; q.oy = q.y; }
      q.x = r6(q.x); q.y = r6(q.y);
    }
    return { type: "multi", pts: pts };
  }

  // Herhangi bir eğri tanımını güvenli, sınırlı bir kopyaya çevirir; geçersizse null.
  function normalize(c) {
    if (!c || typeof c !== "object") return null;
    if (c.type === "bezier") {
      if (!sonlu(c.x1) || !sonlu(c.y1) || !sonlu(c.x2) || !sonlu(c.y2)) return null;
      return { type: "bezier", x1: r6(sinirla(c.x1, 0, 1)), y1: r6(sinirla(c.y1, Y_MIN, Y_MAX)),
        x2: r6(sinirla(c.x2, 0, 1)), y2: r6(sinirla(c.y2, Y_MIN, Y_MAX)) };
    }
    if (c.type === "penner") {
      if (typeof c.name !== "string" || !Object.prototype.hasOwnProperty.call(fns, c.name)) return null;
      var pe = { type: "penner", name: c.name };
      if (c.inv === true) pe.inv = true;
      return pe;
    }
    if (c.type === "spring") {
      var sp = { type: "spring" };
      Object.keys(SPRING_ALAN).forEach(function (k) {
        if (sonlu(c[k])) sp[k] = r6(sinirla(c[k], SPRING_ALAN[k][0], SPRING_ALAN[k][1]));
      });
      if (c.flip === true) sp.flip = true;
      if (c.inv === true) sp.inv = true;
      return sp;
    }
    if (c.type === "multi") return normMulti(c);
    return null;
  }

  /* ================= sampler.js ================= */
  // Suflo: tersFn — tekdüze f'nin tersi (ikiye bölme); invert()'in penner/yay için bayrağı
  function tersFn(f) {
    return function (y) {
      if (y <= 0) return 0;
      if (y >= 1) return 1;
      var lo = 0, hi = 1;
      for (var i = 0; i < 48; i++) {
        var m = (lo + hi) / 2;
        if (f(m) < y) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    };
  }
  // Suflo: cevirFn — 180° döndürme g(x) = 1 − f(1 − x)
  function cevirFn(f) { return function (x) { return 1 - f(1 - x); }; }

  // Rebound: toFunction — eğri tanımı → ease(t) (t ∈ [0,1]); Suflo: 'multi' ve flip/inv bayrakları
  function toFunction(curve) {
    var c = normalize(curve);
    if (!c) return dogrusal;
    var f;
    switch (c.type) {
      case "bezier": f = cubicBezier(c.x1, c.y1, c.x2, c.y2); break;
      case "penner": f = pennerGet(c.name); break;
      case "spring": f = springNormalized(c); break;
      case "multi": f = cokNoktaFn(c.pts); break;
      default: f = dogrusal;
    }
    if (c.inv) f = tersFn(f);
    if (c.flip) f = cevirFn(f);
    // Suflo: uçlar tam 0 ve 1 (Penner'ın kayan nokta artığı, ör. backOut(0) = 2e-16, kalmasın)
    var ic = f;
    return function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : ic(x); };
  }

  // Rebound: samplePoints — önizleme için segments+1 nokta { x, y }
  function samplePoints(curve, segments) {
    segments = segments || 96;
    var fn = toFunction(curve);
    var pts = [];
    for (var i = 0; i <= segments; i++) {
      var x = i / segments;
      pts.push({ x: x, y: fn(x) });
    }
    return pts;
  }

  // Rebound: range — örneklenen y'nin en küçüğü/büyüğü (en az 0..1)
  function range(curve, segments) {
    var pts = samplePoints(curve, segments || 192);
    var min = 0, max = 1;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].y < min) min = pts[i].y;
      if (pts[i].y > max) max = pts[i].y;
    }
    return { min: min, max: max };
  }

  // Rebound: bakeFactors — iki ucu dahil count etken: değer = başlangıç + (son − başlangıç) × etken
  function bakeFactors(curve, count) {
    count = Math.max(2, count | 0);
    var fn = toFunction(curve);
    var out = [];
    for (var i = 0; i < count; i++) out.push(fn(i / (count - 1)));
    return out;
  }

  // Rebound: turningPoints — yerel en küçük/en büyükler + iki uç, { t, y }
  function turningPoints(curve, samples) {
    var fn = toFunction(curve);
    var N = samples || 600;
    var out = [{ t: 0, y: fn(0) }];
    var prev = fn(0), prevT = 0, prevSign = 0;
    for (var i = 1; i <= N; i++) {
      var t = i / N;
      var y = fn(t);
      var dy = y - prev;
      var sign = dy > 1e-9 ? 1 : (dy < -1e-9 ? -1 : prevSign);
      if (prevSign !== 0 && sign !== 0 && sign !== prevSign) out.push({ t: prevT, y: prev });
      prevSign = sign;
      prev = y;
      prevT = t;
    }
    out.push({ t: 1, y: fn(1) });
    return out;
  }

  // Rebound: slopeAt — normalize zamanda dy/dt; uçlarda içeriden örneklenir
  function slopeAt(fn, t) {
    var h = 1e-3, lo = 5e-4, hi = 1 - 5e-4;
    var a = t - h, b = t + h;
    if (a < lo) a = lo;
    if (b > hi) b = hi;
    if (b <= a) { a = lo; b = hi; }
    return (fn(b) - fn(a)) / (b - a);
  }

  /* ================= speedgraph.js ================= */
  // Rebound: coeffs / val / deriv — (0, c1, c2, 1) kontrol noktalı parametrik kübik
  function coeffs(k1, k2) {
    var c = 3 * k1;
    var b = 3 * (k2 - k1) - c;
    var a = 1 - c - b;
    return { a: a, b: b, c: c };
  }
  function val(co, t) { return ((co.a * t + co.b) * t + co.c) * t; }
  function deriv(co, t) { return (3 * co.a * t + 2 * co.b) * t + co.c; }

  function bezierMi(c) { return !!c && (c.type === "bezier" || (c.type === undefined && sonlu(c.x1))); }

  // Rebound: endpointSpeeds — normalize hız (ortalama = 1); Suflo: bezier dışı eğride sayısal eğim
  function endpointSpeeds(curve) {
    if (bezierMi(curve)) {
      var den = 1 - curve.x2;
      return { start: curve.x1 === 0 ? 0 : curve.y1 / curve.x1, end: den === 0 ? 0 : (1 - curve.y2) / den };
    }
    var fn = toFunction(curve);
    return { start: slopeAt(fn, 0), end: slopeAt(fn, 1) };
  }

  // Rebound: withStartSpeed — x1 (etki) aynı, başlangıç hızı s olacak y1 (yalnız bezier)
  function withStartSpeed(curve, s) {
    if (!bezierMi(curve) || !sonlu(s)) return null;
    return normalize({ type: "bezier", x1: curve.x1, y1: s * curve.x1, x2: curve.x2, y2: curve.y2 });
  }
  // Rebound: withEndSpeed — x2 aynı, bitiş hızı s olacak y2 (yalnız bezier)
  function withEndSpeed(curve, s) {
    if (!bezierMi(curve) || !sonlu(s)) return null;
    return normalize({ type: "bezier", x1: curve.x1, y1: curve.y1, x2: curve.x2, y2: 1 - s * (1 - curve.x2) });
  }

  // Rebound: sampleSpeed — { x: zaman 0..1, s: normalize hız }; Suflo: bezier dışında x eşit aralıklı sayısal türev
  function sampleSpeed(curve, segments) {
    segments = segments || 96;
    var pts = [], i;
    if (bezierMi(curve)) {
      var cx = coeffs(curve.x1, curve.x2);
      var cy = coeffs(curve.y1, curve.y2);
      var ends = endpointSpeeds(curve);
      for (i = 0; i <= segments; i++) {
        var t = i / segments, s;
        if (i === 0) s = ends.start;
        else if (i === segments) s = ends.end;
        else {
          var dx = deriv(cx, t);
          s = dx > 1e-4 ? deriv(cy, t) / dx : ends.start;
        }
        pts.push({ x: val(cx, t), s: s });
      }
      return pts;
    }
    var fn = toFunction(curve);
    for (i = 0; i <= segments; i++) { var x = i / segments; pts.push({ x: x, s: slopeAt(fn, x) }); }
    return pts;
  }

  // Rebound: speedRange — hız eksenini ölçeklemek için en küçük/en büyük (en az 0..1)
  function speedRange(curve, segments) {
    var pts = sampleSpeed(curve, segments || 160);
    var min = 0, max = 1;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].s < min) min = pts[i].s;
      if (pts[i].s > max) max = pts[i].s;
    }
    return { min: min, max: max };
  }

  /* ================= overshoot.js ================= */
  // Rebound: dampedSine — s(t) = sin(2π f t) · e^(−decay t), t saniye
  function dampedSine(freq, decay) {
    var omega = 2 * PI * freq;
    return function (t) {
      if (t <= 0) return 0;
      return Math.sin(omega * t) * Math.exp(-decay * t);
    };
  }

  // Rebound: extremaTimes — s'(t) = 0 olan anlar (tepe/çukur), (0, dur) içinde
  function extremaTimes(freq, decay, dur) {
    var omega = 2 * PI * freq;
    var phase = Math.atan2(omega, decay);
    var out = [];
    for (var k = 0; ; k++) {
      var t = (phase + k * PI) / omega;
      if (t >= dur) break;
      out.push(t);
      if (out.length > 256) break;
    }
    return out;
  }

  // Rebound: autoDuration — zarf ~%0,8'e inene dek, 0,25–2 sn arasında
  function autoDuration(decay) {
    var d = Math.log(120) / Math.max(0.4, decay);
    if (d < 0.25) return 0.25;
    if (d > 2.0) return 2.0;
    return d;
  }

  // Rebound: followThroughAnchors — { t, s }: başlangıç (0,0), her tepe/çukur ve pencere sonu
  function followThroughAnchors(freq, decay, dur) {
    if (!(dur > 0)) dur = autoDuration(decay);
    var s = dampedSine(freq, decay);
    var anchors = [{ t: 0, s: 0 }];
    var ext = extremaTimes(freq, decay, dur);
    for (var i = 0; i < ext.length; i++) anchors.push({ t: ext[i], s: s(ext[i]) });
    var last = anchors[anchors.length - 1];
    if (dur - last.t > 1e-4) anchors.push({ t: dur, s: s(dur) });
    return anchors;
  }

  /* ================= Suflo: dönüşümler (temiz oda) ================= */
  // Tekdüze mi: 600 örnekte azalmıyor ve [0,1] içinde
  function isMonotonic(curve) {
    var fn = toFunction(curve), prev = fn(0), N = 600;
    if (prev < -1e-9 || prev > 1 + 1e-9) return false;
    for (var i = 1; i <= N; i++) {
      var y = fn(i / N);
      if (y < prev - 1e-9 || y < -1e-9 || y > 1 + 1e-9) return false;
      prev = y;
    }
    return true;
  }

  function adCevir(name) {
    if (/InOut$/.test(name)) return name;
    if (/In$/.test(name)) return name.replace(/In$/, "Out");
    if (/Out$/.test(name)) return name.replace(/Out$/, "In");
    return name;
  }

  // 180° döndürme: (x, y) → (1 − x, 1 − y). Yumuşak giriş ↔ yumuşak çıkış; flip∘flip = özdeşlik.
  function flip(curve) {
    var c = normalize(curve);
    if (!c) return null;
    if (c.type === "bezier") return normalize({ type: "bezier", x1: 1 - c.x2, y1: 1 - c.y2, x2: 1 - c.x1, y2: 1 - c.y1 });
    if (c.type === "penner") { c.name = adCevir(c.name); return c; }
    if (c.type === "spring") { if (c.flip) delete c.flip; else c.flip = true; return c; }
    var pts = c.pts.slice().reverse().map(function (p) {
      return { x: 1 - p.x, y: 1 - p.y, ix: 1 - p.ox, iy: 1 - p.oy, ox: 1 - p.ix, oy: 1 - p.iy, smooth: p.smooth };
    });
    return normalize({ type: "multi", pts: pts });
  }

  // Eksen değişimi (ters fonksiyon). Yalnız tekdüze eğri; değilse null (reddedilir).
  function invert(curve) {
    var c = normalize(curve);
    if (!c) return null;
    if (c.type === "bezier") {
      if (c.y1 < 0 || c.y1 > 1 || c.y2 < 0 || c.y2 > 1) return null;
      return normalize({ type: "bezier", x1: c.y1, y1: c.x1, x2: c.y2, y2: c.x2 });
    }
    if (c.type === "multi") {
      var p = c.pts, i;
      for (i = 0; i < p.length; i++) {
        if (p[i].y < 0 || p[i].y > 1 || p[i].iy < 0 || p[i].iy > 1 || p[i].oy < 0 || p[i].oy > 1) return null;
        if (i > 0 && p[i].y < p[i - 1].y + MIN_GAP - GAP_EPS) return null;
        if (i > 0 && (p[i].iy < p[i - 1].y || p[i].iy > p[i].y)) return null;
        if (i < p.length - 1 && (p[i].oy < p[i].y || p[i].oy > p[i + 1].y)) return null;
      }
      return normalize({ type: "multi", pts: p.map(function (q) {
        return { x: q.y, y: q.x, ix: q.iy, iy: q.ix, ox: q.oy, oy: q.ox, smooth: q.smooth };
      }) });
    }
    if (c.inv) { delete c.inv; return c; }
    if (!isMonotonic(c)) return null;
    c.inv = true;
    return c;
  }

  // bezier → iki noktalı multi (aynı şekil)
  function toMulti(curve) {
    var c = normalize(curve);
    if (!c) return null;
    if (c.type === "multi") return c;
    if (c.type !== "bezier") return null;
    return normalize({ type: "multi", pts: [{ x: 0, y: 0, ox: c.x1, oy: c.y1 }, { x: 1, y: 1, ix: c.x2, iy: c.y2 }] });
  }

  function ara(a, b, t) { return a + (b - a) * t; }

  // x'te nokta ekler (de Casteljau): şekil değişmez. Olmuyorsa null (çok yakın, 8 nokta dolu,
  // bezier/multi dışı eğri).
  function split(curve, x) {
    var c = toMulti(curve);
    if (!c || !sonlu(x) || c.pts.length >= MAX_PTS) return null;
    var p = c.pts, i = 0;
    while (i < p.length - 2 && x > p[i + 1].x) i++;
    var a = p[i], b = p[i + 1];
    if (x < a.x + MIN_GAP || x > b.x - MIN_GAP) return null;
    var kx = kubik(a.x, a.ox, b.ix, b.x);
    var t = parcaCoz(kx, a.x, b.x, x);
    var P01 = [ara(a.x, a.ox, t), ara(a.y, a.oy, t)];
    var P12 = [ara(a.ox, b.ix, t), ara(a.oy, b.iy, t)];
    var P23 = [ara(b.ix, b.x, t), ara(b.iy, b.y, t)];
    var P012 = [ara(P01[0], P12[0], t), ara(P01[1], P12[1], t)];
    var P123 = [ara(P12[0], P23[0], t), ara(P12[1], P23[1], t)];
    var P = [ara(P012[0], P123[0], t), ara(P012[1], P123[1], t)];
    // Güçlü çapraz tutamaçlı bir parçada alt eğrilerin tutamaç x'i kendi parçasının dışına
    // düşebilir; normalize onu kırpar ve şekil değişir. Bu durumda nokta eklenmez (null).
    var tol = 1e-6;
    function icinde(v, lo, hi) { return v >= lo - tol && v <= hi + tol; }
    if (!icinde(P01[0], a.x, P[0]) || !icinde(P012[0], a.x, P[0]) || !icinde(P123[0], P[0], b.x) || !icinde(P23[0], P[0], b.x)) return null;
    // Eklenecek nokta istenen x değil, çözülen P[0] (en çok 1e-7 sapar): aralığı onunla da denetle
    var px = r6(P[0]);
    if (px < a.x + MIN_GAP - GAP_EPS || px > b.x - MIN_GAP + GAP_EPS) return null;
    var yeni = p.map(function (q) { return { x: q.x, y: q.y, ix: q.ix, iy: q.iy, ox: q.ox, oy: q.oy, smooth: q.smooth }; });
    yeni[i].ox = P01[0]; yeni[i].oy = P01[1];
    yeni[i + 1].ix = P23[0]; yeni[i + 1].iy = P23[1];
    yeni.splice(i + 1, 0, { x: P[0], y: P[1], ix: P012[0], iy: P012[1], ox: P123[0], oy: P123[1], smooth: true });
    var out = normalize({ type: "multi", pts: yeni });
    // normalize yeni noktayı yine de atarsa komşuların alt eğri tutamaçları kalır ve şekil bozulur:
    // şekli değişmiş bir eğri döndürmektense hiç nokta ekleme
    return out && out.pts.length === p.length + 1 ? out : null;
  }

  /* ================= Suflo: CSS cubic-bezier metni ================= */
  function sayiYaz(v) {
    var r = Math.round(v * 10000) / 10000;
    return String(r === 0 ? 0 : r);
  }
  // Yalnız bezier → 'cubic-bezier(a, b, c, d)'; diğerleri null
  function toCss(curve) {
    var c = normalize(curve);
    if (!c || c.type !== "bezier") return null;
    return "cubic-bezier(" + [c.x1, c.y1, c.x2, c.y2].map(sayiYaz).join(", ") + ")";
  }
  var CSS_SAYI = /^[-+]?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;
  // Sıkı ayrıştırıcı: en çok 200 karakter, tam 4 sonlu sayı, x ∈ [0,1], y ∈ [-1,2]; yoksa null
  function fromCss(text) {
    if (typeof text !== "string" || text.length > CSS_MAX) return null;
    var m = /^\s*cubic-bezier\s*\(([^()]*)\)\s*$/i.exec(text);
    if (!m) return null;
    var parca = m[1].split(",");
    if (parca.length !== 4) return null;
    var n = [];
    for (var i = 0; i < 4; i++) {
      var s = parca[i].replace(/^\s+|\s+$/g, "");
      if (!CSS_SAYI.test(s)) return null;
      var v = Number(s);
      if (!isFinite(v)) return null;
      n.push(v);
    }
    if (n[0] < 0 || n[0] > 1 || n[2] < 0 || n[2] > 1) return null;
    if (n[1] < Y_MIN || n[1] > Y_MAX || n[3] < Y_MIN || n[3] > Y_MAX) return null;
    return normalize({ type: "bezier", x1: n[0], y1: n[1], x2: n[2], y2: n[3] });
  }

  /* ================= Suflo: paylaşım — SFC1 kodu, .suflo-egri dosyası, içe aktarma (temiz oda; 3.4 adım 12 + 15) ================= */
  /*
   * Tek satırlık paylaşım kodu: "SFC1." + base64url(UTF-8 JSON). İki tür:
   *   { v: 1, tur: 'egri', ad?, curve }                 eğri (Eğri sekmesi, Geçiş / Zoom / Hareket eğri seçicisi)
   *   { v: 1, tur: 'hiz', ad?, keys: [[t, %]], hit? }   Hız Rampası özel eğrisi (adım 13): t 0..1, hız %10–%1000, ağır çekim anı
   * Adım 12 'egri' kodunu getirdi (Geçiş / Zoom / Hareket seçicisi çok noktalı eğriyi bununla taşır). Adım 15: 'hiz' türü,
   * .suflo-egri dosyası { suflo: 'egri', v: 1, presets: [{ ad, tur, curve | keys, hit? }] }, serbest cubic-bezier / CSS
   * yapıştırma ve üçüncü taraf bir eğri aracının dışa aktarma dosyasını Suflo'nun kendi ayrıştırıcısıyla okuma (aşağıdaki
   * "dış biçim okuyucusu": o araca dair her şey yalnız o bölümde). Yalnız dosya BİÇİMİ okunur: o aracın kodu, tabloları,
   * sabitleri, metin sözdizimi ve arayüzü kullanılmaz; yalnız tek kübik ve çok noktalı şekiller eşlenir, gerisi uyarıyla atlanır.
   * Güvenlik: girdi yabancıdır. Kod en çok 4096 karakter, dosya en çok 64 KB (UTF-8), dosyada en çok 32 önayar; ad en çok
   * 40 karakter, denetim ve görünmez yön karakterleri atılır; eğri başına en çok 8 nokta; her sayı sonlu olmalı (yoksa
   * reddedilir), aralık dışı değer kırpılır; bilinmeyen alanlar okunmaz; hiçbir işlev fırlatmaz.
   */
  var SFC_ONEK = "SFC1.";
  var SFC_SURUM = 1;
  var SFC_MAX = 4096;                 // en uzun kod girdisi (karakter)
  var SFC_AD = 40;                    // ad en çok 40 karakter
  var DOSYA = { BAYT: 65536, ONAYAR: 32, SURUM: 1, UZANTI: "suflo-egri" };
  // Hız Rampası özel eğrisi, % (SufloSpeedRamp MIN_V / MAX_V × 100, ozel.HIT ve ozel.EN_COK ile aynı; test denetler)
  var HIZ = { MIN: 10, MAX: 1000, HIT: [0.02, 0.98], EN_AZ: 2 };
  var PAYLASIM_ADRESI = "https://suflo.app/egri", PAYLASIM_ADRESI_EN = "https://suflo.app/en/egri";
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function b64urlYaz(str) {
    var bin = unescape(encodeURIComponent(String(str)));
    var out = "", i;
    for (i = 0; i + 2 < bin.length; i += 3) {
      var n = (bin.charCodeAt(i) << 16) | (bin.charCodeAt(i + 1) << 8) | bin.charCodeAt(i + 2);
      out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63) + B64.charAt((n >> 6) & 63) + B64.charAt(n & 63);
    }
    var kalan = bin.length - i;
    if (kalan === 1) {
      var a = bin.charCodeAt(i) << 16;
      out += B64.charAt((a >> 18) & 63) + B64.charAt((a >> 12) & 63);
    } else if (kalan === 2) {
      var b = (bin.charCodeAt(i) << 16) | (bin.charCodeAt(i + 1) << 8);
      out += B64.charAt((b >> 18) & 63) + B64.charAt((b >> 12) & 63) + B64.charAt((b >> 6) & 63);
    }
    return out;
  }
  // Geçersizse null (fırlatmaz)
  function b64urlOku(s) {
    if (typeof s !== "string" || !/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
    var bin = "", bits = 0, deger = 0;
    for (var i = 0; i < s.length; i++) {
      deger = (deger << 6) | B64.indexOf(s.charAt(i));
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bin += String.fromCharCode((deger >> bits) & 255);
        deger &= (1 << bits) - 1;
      }
    }
    try { return decodeURIComponent(escape(bin)); } catch (e) { return null; }
  }

  /*
   * Ad: denetim karakterleri (C0, DEL, C1) ve görünmez biçim karakterleri atılır: sıfır genişlikli boşluk, LRM / RLM, satır /
   * paragraf ayırıcı, yön gömme / geçersiz kılma (U+202A–202E: adı tersine çevirip başka bir ad gibi gösterebilir), sözcük
   * birleştirici, yön yalıtımı (U+2066–2069) ve BOM. ZWJ / ZWNJ kalır (emoji ve bazı yazılar). Boşluklar teke iner, kırpılır,
   * en çok 40 karakter (yarım kalan vekil çifti atılır).
   */
  var AD_ATILAN = /[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u2028-\u202e\u2060\u2066-\u2069\ufeff]/g;
  function adTemiz(ad) {
    if (typeof ad !== "string") return "";
    var s = ad.replace(AD_ATILAN, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, SFC_AD);
    if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1);
    return s.replace(/\s+$/, "");
  }
  function sayiMi(v) { return typeof v === "number"; }
  function bosMu(v) { return v === undefined || v === null; }
  function kendi(o, k) { return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }

  // UTF-8 bayt sayısı (dosya sınırı; büyük metni kopyalamadan sayar)
  function utf8Bayt(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  /*
   * Yabancı eğri tanımının sayıları sonlu mu (normalize sonlu olmayan noktayı sessizce atar, tutamacı varsayılana
   * çevirirdi; paylaşılan girdide bu reddedilir). Döner: '' (geçerli) | 'egri' | 'nokta' (8'den çok nokta)
   */
  function sikiEgri(c) {
    if (!c || typeof c !== "object" || Array.isArray(c)) return "egri";
    if (c.type === "bezier") return [c.x1, c.y1, c.x2, c.y2].every(sonlu) ? "" : "egri";
    if (c.type === "penner") return typeof c.name === "string" ? "" : "egri";
    if (c.type === "spring") {
      for (var k in SPRING_ALAN) if (kendi(SPRING_ALAN, k) && !bosMu(c[k]) && !sonlu(c[k])) return "egri";
      return "";
    }
    if (c.type !== "multi" || !Array.isArray(c.pts) || c.pts.length < 2) return "egri";
    if (c.pts.length > MAX_PTS) return "nokta";
    for (var i = 0; i < c.pts.length; i++) {
      var p = c.pts[i];
      if (!p || typeof p !== "object" || !sonlu(p.x) || !sonlu(p.y)) return "egri";
      var h = [p.ix, p.iy, p.ox, p.oy];
      for (var j = 0; j < 4; j++) if (!bosMu(h[j]) && !sonlu(h[j])) return "egri";
    }
    return "";
  }

  /*
   * Hız Rampası özel eğrisinin paylaşılan anahtarları [[t, %]]: 2–8 nokta, her biri iki sonlu sayı; t [0,1]'e (4 ondalık),
   * hız %10–%1000'e (2 ondalık) kırpılır, t'ye göre (eşitte giriş sırasıyla) sıralanır. Sert basamak (aynı t'de iki nokta)
   * korunur; son biçimlendirmeyi Hız Rampası yapar (SufloSpeedRamp.ozelYuzde).
   * Döner: { keys } | { hata: 'hiz' (geçersiz) | 'nokta' (8'den çok) }
   */
  function hizAnahtarlari(keys) {
    if (!Array.isArray(keys) || keys.length < HIZ.EN_AZ) return { hata: "hiz" };
    if (keys.length > MAX_PTS) return { hata: "nokta" };
    var ham = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!Array.isArray(k) || k.length !== 2 || !sonlu(k[0]) || !sonlu(k[1])) return { hata: "hiz" };
      ham.push({ t: r6(Math.round(sinirla(k[0], 0, 1) * 1e4) / 1e4), v: Math.round(sinirla(k[1], HIZ.MIN, HIZ.MAX) * 100) / 100, i: i });
    }
    ham.sort(function (a, b) { return a.t - b.t || a.i - b.i; });
    return { keys: ham.map(function (k2) { return [k2.t, k2.v]; }) };
  }
  // Ağır çekim anı: [0,02, 0,98] (4 ondalık) | null (yok). Sonlu olmayan sayı: undefined (geçersiz)
  function hitOku(h) {
    if (bosMu(h)) return null;
    return sonlu(h) ? Math.round(sinirla(h, HIZ.HIT[0], HIZ.HIT[1]) * 1e4) / 1e4 : undefined;
  }

  /*
   * Paylaşılan tek önayarı doğrula (kod nesnesi ya da .suflo-egri girdisi): { tur: 'egri', ad?, curve } |
   * { tur: 'hiz', ad?, keys, hit? }. Döner: { ok: true, tur: 'egri', ad, curve } | { ok: true, tur: 'hiz', ad, keys, hit } |
   * { ok: false, hata: 'tur' | 'egri' | 'hiz' | 'nokta' | 'bozuk' }
   */
  function onayarDogrula(p) {
    if (!p || typeof p !== "object" || Array.isArray(p)) return { ok: false, hata: "bozuk" };
    if (p.tur === "egri") {
      var s = sikiEgri(p.curve);
      if (s) return { ok: false, hata: s };
      var c = normalize(p.curve);
      return c ? { ok: true, tur: "egri", ad: adTemiz(p.ad), curve: c } : { ok: false, hata: "egri" };
    }
    if (p.tur === "hiz") {
      var h = hizAnahtarlari(p.keys);
      if (!h.keys) return { ok: false, hata: h.hata };
      var hit = hitOku(p.hit);
      if (hit === undefined) return { ok: false, hata: "hiz" };
      return { ok: true, tur: "hiz", ad: adTemiz(p.ad), keys: h.keys, hit: hit };
    }
    return { ok: false, hata: "tur" };
  }
  // Yineleme imzası: tür | ad (küçük harf) | eğri. Aynı ad ve aynı eğri ikinci kez içe alınmaz; geçersizde ''
  function onayarImzasi(p) {
    var r = p && p.ok === true ? p : onayarDogrula(p);
    if (!r.ok) return "";
    var govde = r.tur === "egri" ? JSON.stringify(r.curve) : JSON.stringify([r.keys, r.hit]);
    return r.tur + "|" + r.ad.toLowerCase() + "|" + govde;
  }

  // { tur: 'egri' (varsayılan), ad?, curve } | { tur: 'hiz', ad?, keys, hit? } → "SFC1.…"; geçersizde null
  function paylasimKodla(o) {
    if (!o || typeof o !== "object") return null;
    var r = onayarDogrula({ tur: o.tur === undefined ? "egri" : o.tur, ad: o.ad, curve: o.curve, keys: o.keys, hit: o.hit });
    if (!r.ok) return null;
    var obj = { v: SFC_SURUM, tur: r.tur };
    if (r.ad) obj.ad = r.ad;
    if (r.tur === "egri") obj.curve = r.curve;
    else {
      obj.keys = r.keys;
      if (r.hit !== null) obj.hit = r.hit;
    }
    return SFC_ONEK + b64urlYaz(JSON.stringify(obj));
  }
  // Adım 12'nin eğri kodu (Geçiş / Zoom / Hareket seçicisinin ease alanı): { ad?, curve } → "SFC1.…"; geçersizde null
  function sfcKodla(o) { return o && typeof o === "object" ? paylasimKodla({ tur: "egri", ad: o.ad, curve: o.curve }) : null; }

  // Kod metni → doğrulanmamış JSON nesnesi. Boşluk ve satır sonları (bölünerek yapıştırılan kod) yok sayılır; tam bağlantı
  // da olabilir (…#SFC1.…; son #'ten sonrası). Döner: { ok: true, obj } | { ok: false, hata }
  function kodNesnesi(text) {
    function hata(k) { return { ok: false, hata: k }; }
    if (typeof text !== "string") return hata("bos");
    if (text.length > SFC_MAX) return hata("uzun");
    var s = text.replace(/\s+/g, "");
    var kare = s.lastIndexOf("#");
    if (kare !== -1) s = s.slice(kare + 1);
    if (!s) return hata("bos");
    if (s.indexOf(SFC_ONEK) !== 0) return hata("onek");
    var json = b64urlOku(s.slice(SFC_ONEK.length));
    if (json === null) return hata("bozuk");
    var obj;
    try { obj = JSON.parse(json); } catch (eJ) { return hata("bozuk"); }
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return hata("bozuk");
    if (typeof obj.v === "number" && obj.v > SFC_SURUM) return hata("surum");
    if (obj.v !== SFC_SURUM) return hata("bozuk");
    return { ok: true, obj: obj };
  }
  /*
   * Kodu çöz (iki tür). Döner: { ok: true, tur: 'egri', ad, curve } | { ok: true, tur: 'hiz', ad, keys, hit } | { ok: false, hata }
   *   hata: 'bos' | 'uzun' | 'onek' (SFC1. ile başlamıyor) | 'bozuk' (base64 / JSON değil, eksik kopyalanmış) | 'surum' (daha
   *   yeni Suflo) | 'tur' (bilinmeyen tür) | 'egri' (eğri geçersiz) | 'hiz' (hız anahtarları geçersiz) | 'nokta' (8'den çok nokta)
   */
  function paylasimCoz(text) {
    try {
      var n = kodNesnesi(text);
      if (!n.ok) return n;
      var r = onayarDogrula(n.obj);
      return r.ok ? r : { ok: false, hata: r.hata === "bozuk" ? "tur" : r.hata };
    } catch (e) {
      return { ok: false, hata: "bozuk" };
    }
  }
  /*
   * Yalnız eğri kodu (adım 12; Geçiş / Zoom / Hareket ease alanı): Hız Rampası kodu 'tur' ile reddedilir, 8'den çok nokta
   * 'egri' sayılır. Döner: { ok: true, tur: 'egri', ad, curve } | { ok: false, hata }
   */
  function sfcCoz(text) {
    try {
      var n = kodNesnesi(text);
      if (!n.ok) return n;
      if (n.obj.tur !== "egri") return { ok: false, hata: "tur" };
      var r = onayarDogrula(n.obj);
      return r.ok ? r : { ok: false, hata: r.hata === "nokta" ? "egri" : r.hata };
    } catch (e) {
      return { ok: false, hata: "bozuk" };
    }
  }
  // Paylaşım bağlantısı: kod # ile (sunucuya gitmez, günlüğe düşmez). dil 'en': İngilizce sayfa (/en/egri)
  function egriAdresi(kod, dil) { return (dil === "en" ? PAYLASIM_ADRESI_EN : PAYLASIM_ADRESI) + "#" + kod; }

  /* ---- yapıştırılan CSS (W3C CSS Easing Level 1) ---- */
  // Anahtar sözcüklerin cubic-bezier karşılıkları (spesifikasyondaki tanımlar)
  var CSS_SOZCUK = { linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] };
  // "a, b, c, d" → 4 sonlu sayı (fromCss'in sayı kuralı) | null
  function cssSayilari(icerik) {
    var parca = String(icerik).split(",");
    if (parca.length !== 4) return null;
    var n = [];
    for (var i = 0; i < 4; i++) {
      var s = parca[i].replace(/^\s+|\s+$/g, "");
      if (!CSS_SAYI.test(s)) return null;
      var v = Number(s);
      if (!isFinite(v)) return null;
      n.push(v);
    }
    return n;
  }
  /*
   * Yapıştırılan CSS → { curve, kirpildi } | null. En çok 200 karakter. Kabul edilenler:
   *   - düz 'cubic-bezier(a, b, c, d)' ya da onu içeren bir CSS bildirimi ('transition-timing-function: cubic-bezier(…);',
   *     'transition: transform .3s cubic-bezier(…)'); metinde tam BİR cubic-bezier( … ) olmalı
   *   - yalın dört sayı '0.25, 0.1, 0.25, 1' (cubic-bezier üreteçlerinin kopyaladığı biçim)
   *   - tek anahtar sözcük: linear, ease, ease-in, ease-out, ease-in-out (önünde özellik adı, sonunda ; olabilir)
   * x değerleri CSS'teki gibi 0–1 olmalı (değilse null); y değerleri -1–2'ye kırpılır (kirpildi: true).
   */
  function cssCoz(text) {
    if (typeof text !== "string" || text.length > CSS_MAX) return null;
    var s = text.replace(/^\s+|\s+$/g, ""), n = null;
    var bul = s.match(/cubic-bezier\s*\([^()]*\)/gi);
    if (bul) {
      if (bul.length !== 1) return null;
      n = cssSayilari(bul[0].replace(/^cubic-bezier\s*\(/i, "").replace(/\)$/, ""));
    } else if (/^[-+.\d]/.test(s)) {
      n = cssSayilari(s.replace(/\s*;$/, ""));
    } else {
      var m = /^(?:[a-z-]+\s*:\s*)?([a-z-]+)\s*;?$/i.exec(s);
      var k = m ? m[1].toLowerCase() : "";
      if (kendi(CSS_SOZCUK, k)) n = CSS_SOZCUK[k].slice();
    }
    if (!n || n[0] < 0 || n[0] > 1 || n[2] < 0 || n[2] > 1) return null;
    var kirpildi = n[1] < Y_MIN || n[1] > Y_MAX || n[3] < Y_MIN || n[3] > Y_MAX;
    return { curve: normalize({ type: "bezier", x1: n[0], y1: n[1], x2: n[2], y2: n[3] }), kirpildi: kirpildi };
  }
  function cssOku(text) { var r = cssCoz(text); return r ? r.curve : null; }

  /* ==================== DIŞ BİÇİM OKUYUCUSU (başı) ====================
   * OpenCurve'ün (lisansı olmayan, tüm hakları saklı bir Premiere eğri aracı) dışa aktarma dosyası:
   *   { opencurve: 1, presets: [{ name, curve }] }
   * Birlikte çalışma için yalnız bu JSON BİÇİMİ okunur (dosya biçimi kod değildir). O aracın kodu, tabloları, sabitleri,
   * metin sözdizimi, arayüzü ve CSS'i kullanılmaz; okuyucu o araç açılmadan, yalnız Suflo'nun planındaki biçim tanımından
   * Suflo'nun kendi ayrıştırıcısıyla yazıldı (temiz oda). Yalnız tek kübik ve çok noktalı şekiller eşlenir, gerisi
   * 'bilinmeyen' uyarısıyla atlanır. Bu ad depoda yalnız bu bölümde (ve docs/js'teki bayt bayt kopyasında) geçer.
   * Gerçek dosyada her önayarın curve'ü bir nesnedir: { p1x, p1y, p2x, p2y } (p1 (0,0)'ın çıkış, p2 (1,1)'in giriş
   * tutamacı; mutlak) ve çok noktalı eğride ek olarak pts: yalnız İÇ çapalar { x, y, ix, iy, ox, oy, smooth } (mutlak
   * tutamaçlar; uçlar örtük). Bu biçim tanımı bir inceleme bulgusundaki alan adlarından alındı (yalnız alan adları, kod
   * değil); okuyucu yine o araç açılmadan yazıldı. İlk sürümün tahmin ettiği şekiller (aşağıda) zararsız olduğu için
   * okunmaya devam eder.
   */
  var DIS_ANAHTAR = "opencurve";
  // Dış dosya mı: { <DIS_ANAHTAR>: sürüm, presets: [...] } → { surumUyari (sürüm 1 değil; yine de okunur) } | null
  function disDosya(obj) { return kendi(obj, DIS_ANAHTAR) && Array.isArray(obj.presets) ? { surumUyari: obj[DIS_ANAHTAR] !== 1 } : null; }
  // Nokta: [x, y] ya da { x, y } (isteğe bağlı mutlak tutamaçlar: in / out { x, y } ya da [x, y], veya ix, iy, ox, oy);
  // geçersizse null
  function disNokta(p) {
    if (Array.isArray(p)) return p.length === 2 && sonlu(p[0]) && sonlu(p[1]) ? { x: p[0], y: p[1] } : null;
    if (!p || typeof p !== "object" || !sonlu(p.x) || !sonlu(p.y)) return null;
    function cift(h) {
      if (Array.isArray(h)) return h.length === 2 && sonlu(h[0]) && sonlu(h[1]) ? h : undefined;
      if (h && typeof h === "object") return sonlu(h.x) && sonlu(h.y) ? [h.x, h.y] : undefined;
      return bosMu(h) ? null : undefined;
    }
    var q = { x: p.x, y: p.y };
    var gi = cift(p["in"]), ci = cift(p.out);
    if (gi === undefined || ci === undefined) return null;
    if (gi) { q.ix = gi[0]; q.iy = gi[1]; }
    else if (!bosMu(p.ix) || !bosMu(p.iy)) { if (!sonlu(p.ix) || !sonlu(p.iy)) return null; q.ix = p.ix; q.iy = p.iy; }
    if (ci) { q.ox = ci[0]; q.oy = ci[1]; }
    else if (!bosMu(p.ox) || !bosMu(p.oy)) { if (!sonlu(p.ox) || !sonlu(p.oy)) return null; q.ox = p.ox; q.oy = p.oy; }
    if (p.smooth === true) q.smooth = true;
    return q;
  }
  /*
   * Dış eğri → Suflo eğrisi. Yalnız iki şekil eşlenir:
   *   dosyanın biçimi { p1x, p1y, p2x, p2y } tek kübik (x1 = p1x, y1 = p1y, x2 = p2x, y2 = p2y); pts de doluysa çok
   *               noktalı: (0,0) [çıkış p1] + en çok 6 iç çapa (pts) + (1,1) [giriş p2]; 6'dan çok iç çapa 'nokta'
   *   tahminler   'cubic-bezier(a, b, c, d)' metni (cssCoz), [x1, y1, x2, y2] ya da { x1, y1, x2, y2 }; noktalar dizisi
   *               ya da { points | pts: [...] } (p1x… yoksa): uçlar DAHİL 2–8 nokta (uçlar (0,0) ve (1,1)'e oturur)
   * Döner: { curve } | { hata: 'bilinmeyen' (başka şekil) | 'egri' (sayılar geçersiz) | 'nokta' (8'den çok) }
   */
  // Dosyanın kendi eğri nesnesi mi: dört uç tutamacı sayısı (p1x, p1y, p2x, p2y) var
  function disUcTutamakli(c) { return sayiMi(c.p1x) && sayiMi(c.p1y) && sayiMi(c.p2x) && sayiMi(c.p2y); }
  function disEgri(c) {
    if (typeof c === "string") { var k = cssCoz(c); return k ? { curve: k.curve } : { hata: /cubic-bezier/i.test(c) ? "egri" : "bilinmeyen" }; }
    var dizi = null;
    if (Array.isArray(c)) {
      if (c.length === 4 && c.every(sayiMi)) {
        if (!c.every(sonlu)) return { hata: "egri" };
        return { curve: normalize({ type: "bezier", x1: c[0], y1: c[1], x2: c[2], y2: c[3] }) };
      }
      dizi = c;
    } else if (c && typeof c === "object") {
      if (disUcTutamakli(c)) {
        if (![c.p1x, c.p1y, c.p2x, c.p2y].every(sonlu)) return { hata: "egri" };
        var ic = bosMu(c.pts) ? [] : c.pts;
        if (!Array.isArray(ic)) return { hata: "egri" };
        if (!ic.length) return { curve: normalize({ type: "bezier", x1: c.p1x, y1: c.p1y, x2: c.p2x, y2: c.p2y }) };
        if (ic.length > MAX_PTS - 2) return { hata: "nokta" };
        // iç çapalar uçların arasına; uç tutamaçları p1 / p2 (aşağıdaki döngü her noktayı disNokta ile denetler)
        dizi = [{ x: 0, y: 0, ox: c.p1x, oy: c.p1y }].concat(ic, [{ x: 1, y: 1, ix: c.p2x, iy: c.p2y }]);
      } else if (sayiMi(c.x1) && sayiMi(c.y1) && sayiMi(c.x2) && sayiMi(c.y2)) {
        if (![c.x1, c.y1, c.x2, c.y2].every(sonlu)) return { hata: "egri" };
        return { curve: normalize({ type: "bezier", x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 }) };
      } else dizi = Array.isArray(c.points) ? c.points : Array.isArray(c.pts) ? c.pts : null;
    }
    if (!dizi || !dizi.length || !(Array.isArray(dizi[0]) || (dizi[0] && typeof dizi[0] === "object"))) return { hata: "bilinmeyen" };
    if (dizi.length < 2) return { hata: "egri" };
    if (dizi.length > MAX_PTS) return { hata: "nokta" };
    var pts = [];
    for (var i = 0; i < dizi.length; i++) {
      var q = disNokta(dizi[i]);
      if (!q) return { hata: "egri" };
      pts.push(q);
    }
    var m = normalize({ type: "multi", pts: pts });
    if (!m) return { hata: "egri" };
    // iki nokta: düz cubic-bezier (metin alanı ve P1 / P2 sayıları kullanılabilsin)
    if (m.pts.length === 2) return { curve: normalize({ type: "bezier", x1: m.pts[0].ox, y1: m.pts[0].oy, x2: m.pts[1].ix, y2: m.pts[1].iy }) };
    return { curve: m };
  }
  // Dış önayar { name, curve } → { ok: true, tur: 'egri', ad, curve } | { ok: false, hata }
  function disOnayar(g) {
    var d = disEgri(g.curve);
    return d.curve ? { ok: true, tur: "egri", ad: adTemiz(g.name), curve: d.curve } : { ok: false, hata: d.hata };
  }
  /* ==================== DIŞ BİÇİM OKUYUCUSU (sonu) ==================== */

  /* ---- .suflo-egri dosyası ---- */
  function dosyaHata(k) { return { ok: false, hata: k }; }
  function buyukMu(text) { return text.length > DOSYA.BAYT || utf8Bayt(text) > DOSYA.BAYT; }
  /*
   * .suflo-egri dosyasının (ya da dış biçim okuyucusunun tanıdığı dışa aktarma dosyasının) metni → önayarlar.
   * Sınırlar: en çok 64 KB (UTF-8 bayt), baştaki BOM atılır, dosyanın ilk 32 önayarı okunur (fazlası 'fazla' uyarısıyla
   * atlanır), ad en çok 40 karakter (denetim karakterleri atılır), eğri başına en çok 8 nokta, her sayı sonlu (aralık dışı
   * kırpılır), aynı tür + ad + eğri (onayarImzasi) dosyada ikinci kez gelirse atlanır (yinelenen). Suflo dosyasında
   * türü yazılmamış girdi curve'ü varsa 'egri', keys'i varsa 'hiz' sayılır.
   * Döner: { ok: true, bicim: 'suflo' | 'dis' (dış biçim), presets: [{ ok, tur: 'egri', ad, curve } | { ok, tur: 'hiz', ad, keys, hit }],
   *          uyarilar: [{ kod, i, ad, n? }], yinelenen, fazla }
   *   uyarı kodu: 'tur' | 'egri' | 'hiz' | 'nokta' | 'bilinmeyen' (eşlenmeyen şekil) | 'bozuk' (girdi nesne değil) |
   *   'fazla' (32'den sonrası; n: atlanan sayısı) | 'dosyaSurumu' (dış dosyanın sürümü 1 değil; yine de okundu)
   *   | { ok: false, hata: 'bos' | 'buyuk' (64 KB'tan büyük) | 'json' (JSON değil) | 'bicim' (tanınmayan dosya) | 'surum' (daha yeni Suflo) }
   */
  function dosyaOku(text) {
    try {
      if (typeof text !== "string") return dosyaHata("bos");
      if (buyukMu(text)) return dosyaHata("buyuk");
      var s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      if (!/\S/.test(s)) return dosyaHata("bos");
      var obj;
      try { obj = JSON.parse(s); } catch (eJ) { return dosyaHata("json"); }
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return dosyaHata("bicim");
      var bicim, uyarilar = [];
      if (obj.suflo === "egri") {
        if (typeof obj.v === "number" && obj.v > DOSYA.SURUM) return dosyaHata("surum");
        if (obj.v !== DOSYA.SURUM || !Array.isArray(obj.presets)) return dosyaHata("bicim");
        bicim = "suflo";
      } else if (disDosya(obj)) {
        bicim = "dis";
        if (disDosya(obj).surumUyari) uyarilar.push({ kod: "dosyaSurumu", i: -1, ad: "" });
      } else return dosyaHata("bicim");

      var presets = [], gorulen = {}, yinelenen = 0;
      var n = Math.min(obj.presets.length, DOSYA.ONAYAR);
      for (var i = 0; i < n; i++) {
        var g = obj.presets[i], r, nesne = !!g && typeof g === "object" && !Array.isArray(g);
        if (!nesne) r = { ok: false, hata: "bozuk" };
        else if (bicim === "suflo") {
          var tur = g.tur !== undefined ? g.tur : (g.curve !== undefined ? "egri" : g.keys !== undefined ? "hiz" : undefined);
          r = onayarDogrula({ tur: tur, ad: g.ad, curve: g.curve, keys: g.keys, hit: g.hit });
        } else r = disOnayar(g);
        if (!r.ok) { uyarilar.push({ kod: r.hata, i: i, ad: nesne ? adTemiz(bicim === "suflo" ? g.ad : g.name) : "" }); continue; }
        var imza = onayarImzasi(r);
        if (gorulen[imza]) { yinelenen++; continue; }
        gorulen[imza] = 1;
        presets.push(r);
      }
      var fazla = Math.max(0, obj.presets.length - DOSYA.ONAYAR);
      if (fazla) uyarilar.push({ kod: "fazla", i: DOSYA.ONAYAR, ad: "", n: fazla });
      return { ok: true, bicim: bicim, presets: presets, uyarilar: uyarilar, yinelenen: yinelenen, fazla: fazla };
    } catch (e) {
      return dosyaHata("json");
    }
  }
  /*
   * Önayarlar → .suflo-egri metni { suflo: 'egri', v: 1, presets: [{ ad, tur, curve | keys, hit? }] }. Her önayar
   * dosyaOku'nun kuralıyla doğrulanır (geçersiz atlanır), en çok 32 (fazlası atlanan sayılır); her önayar kendi satırında.
   * 32 önayar en uzun ad ve 8 noktayla da 64 KB'ın çok altında kalır (test denetler).
   * Döner: { ok (en az bir önayar), metin, adet, atlanan }
   */
  function dosyaYaz(presets) {
    var out = [], atlanan = 0;
    (Array.isArray(presets) ? presets : []).forEach(function (p) {
      var r = p && typeof p === "object" ? onayarDogrula({ tur: p.tur === undefined ? "egri" : p.tur, ad: p.ad, curve: p.curve, keys: p.keys, hit: p.hit }) : { ok: false };
      if (!r.ok || out.length >= DOSYA.ONAYAR) { atlanan++; return; }
      var o = { ad: r.ad, tur: r.tur };
      if (r.tur === "egri") o.curve = r.curve;
      else {
        o.keys = r.keys;
        if (r.hit !== null) o.hit = r.hit;
      }
      out.push(o);
    });
    var govde = out.map(function (o) { return JSON.stringify(o); });
    var metin = "{\n  \"suflo\": \"egri\",\n  \"v\": " + DOSYA.SURUM + ",\n  \"presets\": [" +
      (govde.length ? "\n    " + govde.join(",\n    ") + "\n  " : "") + "]\n}\n";
    return { ok: out.length > 0, metin: metin, adet: out.length, atlanan: atlanan };
  }

  /*
   * Yapıştırılan metindeki SFC1 kodları. Metin her "SFC1." başından bölünür (base64url'de '.' yok: önek bir kodun içinde
   * geçemez); böylece alt alta, boşlukla (tek satırlık kutu satır sonlarını boşluğa çevirir) ya da bitişik yapıştırılan
   * kodlar ve bağlantılar ayrılır. Parçanın sonuna düşen bir sonraki bağlantının öneki ("https://suflo.app/egri#" gibi,
   * # dahil) atılır. Her parça önce bütün boşlukları atılarak denenir (satıra bölünmüş tek kod birleşir), çözülmezse yalnız
   * ilk sözcüğüyle (kodun ardından gelen yazı); ikisi de base64url dışındaki ilk karakterde (nokta, parantez) kesilir.
   * Kodu kopyala'nın çifti (kod ve hemen ardından aynı kodun bağlantısı, ya da tersi) tek kod sayılır; aynı kodun başka
   * tekrarı listede kalır (iceAktar onu yineleme sayar).
   * Döner: [{ kod, bag (bağlantıdan), r: paylasimCoz sonucu }] (metindeki sırayla)
   */
  function kodlariAyikla(text) {
    var s = String(text), yer = [], out = [];
    for (var p = s.indexOf(SFC_ONEK); p !== -1; p = s.indexOf(SFC_ONEK, p + SFC_ONEK.length)) yer.push(p);
    function kes(x) { return SFC_ONEK + /^[A-Za-z0-9_-]*/.exec(x)[0]; }
    for (var i = 0; i < yer.length; i++) {
      // bağlantı öneki: "http(s)://…#" koda bitişse de (değer atanınca satır sonu silinir) yalnız kendisi atılır; şemasız
      // önek ("suflo.app/egri#") ayrı bir sözcükse atılır
      var parca = s.slice(yer[i] + SFC_ONEK.length, i + 1 < yer.length ? yer[i + 1] : s.length)
        .replace(/https?:\/\/[^\s#]*#/gi, " ").replace(/(^|\s)[^\s#]*#/g, "$1 ");
      var bag = yer[i] > 0 && s.charAt(yer[i] - 1) === "#";
      var tum = kes(parca.replace(/\s+/g, "")), kod = tum, r = paylasimCoz(tum);
      if (!r.ok) {
        var ilk = kes(parca.replace(/^\s+/, "").split(/\s/)[0]);
        var r2 = ilk !== tum ? paylasimCoz(ilk) : r;
        if (r2.ok) { kod = ilk; r = r2; }
      }
      var once = out.length ? out[out.length - 1] : null;
      if (once && !once.cift && once.kod === kod && once.bag !== bag) { once.cift = true; continue; }
      out.push({ kod: kod, bag: bag, r: r });
    }
    return out;
  }
  /*
   * Tek yapıştırılan şey: SFC1 kodu ya da paylaşım bağlantısı (iki tür; aynı kodun "kod + bağlantı" çifti de tek kod),
   * ya da cubic-bezier / CSS (cssCoz).
   * Döner: { ok: true, kaynak: 'kod', tur: 'egri', ad, curve } | { ok: true, kaynak: 'kod', tur: 'hiz', ad, keys, hit } |
   * { ok: true, kaynak: 'css', tur: 'egri', ad: '', curve, kirpildi } | { ok: false, hata } (paylasimCoz hataları; 'coklu'
   * birden çok farklı kod (birini sessizce seçmek yerine; birkaç kodu iceAktar alır), 'css' bozuk cubic-bezier, 'bicim' tanınmadı)
   */
  function yapistir(text) {
    if (typeof text !== "string") return { ok: false, hata: "bos" };
    var s = text.replace(/^\s+|\s+$/g, "");
    if (!s) return { ok: false, hata: "bos" };
    if (s.length > SFC_MAX) return { ok: false, hata: "uzun" };
    if (s.indexOf(SFC_ONEK) !== -1) {
      var kodlar = kodlariAyikla(s), farkli = {};
      for (var i = 0; i < kodlar.length; i++) {
        farkli[kodlar[i].kod] = 1;
        if (Object.keys(farkli).length > 1) return { ok: false, hata: "coklu" };
      }
      var k = kodlar[0].r;
      if (!k.ok) return k;
      k.kaynak = "kod";
      return k;
    }
    var c = cssCoz(s);
    if (c) return { ok: true, kaynak: "css", tur: "egri", ad: "", curve: c.curve, kirpildi: c.kirpildi };
    return { ok: false, hata: /cubic-bezier/i.test(s) ? "css" : "bicim" };
  }
  /*
   * Panelin "Kod yapıştır" kutusu ve İçe aktar: SFC1 kodu / bağlantı (bir tane ya da birkaç: alt alta, boşlukla ya da
   * bitişik; kodlariAyikla), cubic-bezier / CSS, .suflo-egri ya da dış biçim JSON metni. Tek koda ancak metinde tek bir
   * farklı kod varsa (aynı kodun bağlantısı sayılmaz) inilir; yoksa her kod ayrı önayar olur (en çok 32), hiçbiri sessizce
   * düşmez. Hepsi dosyaOku biçiminde döner:
   * { ok: true, bicim: 'kod' | 'css' | 'suflo' | 'dis', presets, uyarilar, yinelenen, fazla, kirpildi? } | { ok: false, hata }
   */
  function iceAktar(text) {
    try {
      if (typeof text !== "string") return dosyaHata("bos");
      if (buyukMu(text)) return dosyaHata("buyuk");
      var s = text.replace(/^\s+|\s+$/g, "");
      if (!s) return dosyaHata("bos");
      if (s.charAt(0) === "{") return dosyaOku(text);
      if (s.indexOf(SFC_ONEK) === -1) {
        var tek = yapistir(s);
        if (!tek.ok) return tek;
        var r1 = { ok: true, bicim: tek.kaynak, presets: [{ ok: true, tur: "egri", ad: tek.ad, curve: tek.curve }], uyarilar: [], yinelenen: 0, fazla: 0 };
        if (tek.kirpildi) r1.kirpildi = true;
        return r1;
      }
      var kodlar = kodlariAyikla(s);
      if (kodlar.length === 1) {
        var k = kodlar[0].r;
        return k.ok ? { ok: true, bicim: "kod", presets: [k], uyarilar: [], yinelenen: 0, fazla: 0 } : k;
      }
      var presets = [], uyarilar = [], gorulen = {}, yinelenen = 0;
      for (var i = 0; i < kodlar.length && i < DOSYA.ONAYAR; i++) {
        var r = kodlar[i].r;
        if (!r.ok) { uyarilar.push({ kod: r.hata, i: i, ad: "" }); continue; }
        var imza = onayarImzasi(r);
        if (gorulen[imza]) { yinelenen++; continue; }
        gorulen[imza] = 1;
        presets.push(r);
      }
      var fazla = Math.max(0, kodlar.length - DOSYA.ONAYAR);
      if (fazla) uyarilar.push({ kod: "fazla", i: DOSYA.ONAYAR, ad: "", n: fazla });
      if (!presets.length && !yinelenen) return { ok: false, hata: uyarilar.length ? uyarilar[0].kod : "bozuk" };
      return { ok: true, bicim: "kod", presets: presets, uyarilar: uyarilar, yinelenen: yinelenen, fazla: fazla };
    } catch (e) {
      return dosyaHata("bozuk");
    }
  }

  /* ================= Suflo: hazır eğriler ================= */
  // ("Süzülme" Hız Rampası önayarı; burada kullanılmaz)
  var BUILTINS = [
    { id: "dogrusal", name: "Doğrusal", nameEn: "Linear", curve: { type: "bezier", x1: 0, y1: 0, x2: 1, y2: 1 } },
    { id: "yumusak", name: "Yumuşak", nameEn: "Ease", curve: { type: "bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } },
    { id: "yumusak-giris", name: "Yumuşak giriş", nameEn: "Ease in", curve: { type: "bezier", x1: 0.42, y1: 0, x2: 1, y2: 1 } },
    { id: "yumusak-cikis", name: "Yumuşak çıkış", nameEn: "Ease out", curve: { type: "bezier", x1: 0, y1: 0, x2: 0.58, y2: 1 } },
    { id: "yumusak-giris-cikis", name: "Yumuşak giriş-çıkış", nameEn: "Ease in-out", curve: { type: "bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 } },
    { id: "sert-giris", name: "Sert giriş", nameEn: "Expo in", curve: { type: "penner", name: "expoIn" } },
    { id: "sert-cikis", name: "Sert çıkış", nameEn: "Expo out", curve: { type: "penner", name: "expoOut" } },
    { id: "guclu-s", name: "Güçlü S", nameEn: "Strong S", curve: { type: "bezier", x1: 0.87, y1: 0, x2: 0.13, y2: 1 } },
    { id: "geri-cekil", name: "Geri çekil", nameEn: "Back in", curve: { type: "penner", name: "backIn" } },
    { id: "tasma", name: "Taşma", nameEn: "Back out", curve: { type: "penner", name: "backOut" } },
    { id: "esnek", name: "Esnek", nameEn: "Elastic out", curve: { type: "penner", name: "elasticOut" } },
    { id: "ziplama", name: "Zıplama", nameEn: "Bounce out", curve: { type: "penner", name: "bounceOut" } },
    { id: "yay-yumusak", name: "Yay yumuşak", nameEn: "Spring gentle", curve: { type: "spring", response: 0.5, bounce: 0.15 } },
    { id: "yay-canli", name: "Yay canlı", nameEn: "Spring lively", curve: { type: "spring", response: 0.5, bounce: 0.4 } },
    { id: "cift-yumusak", name: "Çift yumuşak", nameEn: "Double ease", curve: { type: "multi", pts: [
      { x: 0, y: 0, ox: 0.2, oy: 0 },
      { x: 0.5, y: 0.5, ix: 0.3, iy: 0.5, ox: 0.7, oy: 0.5, smooth: true },
      { x: 1, y: 1, ix: 0.8, iy: 1 }] } }
  ];
  function builtins() {
    return BUILTINS.map(function (b) { return { id: b.id, name: b.name, nameEn: b.nameEn, curve: normalize(b.curve) }; });
  }
  // Arayüz dilinde ad: 'en' → nameEn, diğerleri → Türkçe ad (sözlükteki ortak "Yumuşak"/"Zıplama"
  // girdileri başka araçlarda Smooth/Bounce olduğundan eğri seçici adı buradan alır)
  function builtinName(b, dil) {
    if (typeof b === "string") b = builtin(b);
    if (!b) return "";
    return dil === "en" ? b.nameEn : b.name;
  }
  function builtin(id) {
    for (var i = 0; i < BUILTINS.length; i++) {
      if (BUILTINS[i].id === id) return { id: id, name: BUILTINS[i].name, nameEn: BUILTINS[i].nameEn, curve: normalize(BUILTINS[i].curve) };
    }
    return null;
  }

  /* ================= Suflo: bakePlan (temiz oda) ================= */
  function degerOku(v) {
    if (sonlu(v)) return v;
    if (Array.isArray(v) && v.length >= 1 && v.length <= 4 && v.every(sonlu)) return v.slice();
    return null;
  }

  /*
   * İki anahtar kare (t0, v0) – (t1, v1) arasına eğriyi sık anahtar karelerle yazma planı.
   * o: { t0, t1 (TIMELINE saniyesi), v0, v1 (sayı ya da [x,y]), fps, step (kare; 1, 2, 4…),
   *      curve, clampMin, clampMax (Opaklık: 0..100), maxKeys (varsayılan 2000) }
   * Döner: { keys: [{ t, v }] (yalnız İÇ anahtarlar, timeline kare zamanlarında; uçlar
   * kullanıcının kendi anahtar kareleri kalır), step, capped }. Host bunları hız ve
   * ters oynatmaya duyarlı KS_presetSourceTime ile klip/kaynak zamanına çevirir.
   * Geçersiz girdide keys boş ve hata: 'aralik' | 'fps' | 'deger'.
   */
  function bakePlan(o) {
    o = o || {};
    var t0 = Number(o.t0), t1 = Number(o.t1), fps = Number(o.fps);
    var adim = Math.floor(Number(o.step));
    adim = isFinite(adim) && adim >= 1 ? Math.min(adim, 600) : 1;
    var bos = function (hata) { return { keys: [], step: adim, capped: false, hata: hata }; };
    if (!(isFinite(t0) && isFinite(t1) && t1 > t0)) return bos("aralik");
    if (!(isFinite(fps) && fps > 0 && fps <= 1000)) return bos("fps");
    var v0 = degerOku(o.v0), v1 = degerOku(o.v1);
    var dizi = Array.isArray(v0);
    if (v0 === null || v1 === null || dizi !== Array.isArray(v1) || (dizi && v0.length !== v1.length)) return bos("deger");
    var enCok = Math.floor(Number(o.maxKeys));
    enCok = isFinite(enCok) && enCok >= 1 ? Math.min(enCok, 100000) : MAX_KEYS;
    var lo = sonlu(o.clampMin) ? o.clampMin : -Infinity, hi = sonlu(o.clampMax) ? o.clampMax : Infinity;
    if (lo > hi) { lo = -Infinity; hi = Infinity; }

    var f0 = t0 * fps, f1 = t1 * fps;
    var taban = Math.abs(f0 - Math.round(f0)) < 1e-3 ? Math.round(f0) : Math.floor(f0);
    // iç kareler: taban + j·adım (j ≥ 1), iki uçtan en az yarım kare içeride; sayım döngüsüz
    function jAralik(s) {
      var jmin = Math.max(1, Math.floor((f0 + 0.5 - taban) / s) + 1);
      var jmax = Math.ceil((f1 - 0.5 - taban) / s) - 1;
      return { jmin: jmin, n: Math.max(0, jmax - jmin + 1) };
    }
    var kapali = false;
    var ja = jAralik(adim);
    if (!ja.n && adim > 1) {
      adim = Math.max(1, Math.min(adim, Math.floor((f1 - f0) / 2)));
      ja = jAralik(adim);
      while (!ja.n && adim > 1) { adim--; ja = jAralik(adim); }
    }
    if (ja.n > enCok) {
      kapali = true;
      adim = Math.max(adim + 1, Math.ceil((f1 - f0) / (enCok + 1)));
      ja = jAralik(adim);
      while (ja.n > enCok) { adim++; ja = jAralik(adim); }
    }
    var ks = [];
    for (var j = 0; j < ja.n; j++) ks.push(taban + (ja.jmin + j) * adim);
    var ease = toFunction(o.curve);
    var keys = ks.map(function (k) {
      var t = k / fps;
      var e = ease((t - t0) / (t1 - t0));
      var v;
      if (dizi) v = v0.map(function (a, i) { return r6(sinirla(a + (v1[i] - a) * e, lo, hi)); });
      else v = r6(sinirla(v0 + (v1 - v0) * e, lo, hi));
      return { t: t, v: v };
    });
    return { keys: keys, step: adim, capped: kapali };
  }

  /* ================= Suflo: varışta yaylanma planı (temiz oda; 3.4 adım 14) ================= */
  // Ayar sınırları: genlik saniye cinsinden "varış hızıyla kaç saniyelik yol" (0,02–0,5), frekans Hz, sönüm
  var YAYLAN = {
    GENLIK: { min: 0.02, max: 0.5, varsayilan: 0.1 },
    FREKANS: { min: 1, max: 6, varsayilan: 3 },
    SONUM: { min: 2, max: 10, varsayilan: 6 },
    YOGUN_ADIM: 2,      // Bezier ara değerlemesi yazılamazsa 2 karede bir sık yazım
    EN_AZ_KARE: 2,      // inişten sonra en az 2 kare yer yoksa reddedilir
    EN_AZ_ORAN: 0.1     // sinirSigdir: aşım sınıra sığmak için ayarın %10'undan küçülecekse (iniş sınırda) reddedilir
  };
  function ayarSayi(v, s) { var n = Number(v); return isFinite(n) ? sinirla(n, s.min, s.max) : s.varsayilan; }

  /*
   * Varışta yaylanma (follow-through): iniş anahtar karesinden (tL, vL) SONRA, varış hızıyla orantılı sönümlü
   * sinüs. Rebound'un overshoot matematiği (dampedSine / followThroughAnchors / autoDuration) anahtar kareye
   * pişirilir: değer_k = taban(t_k) + hız · genlik · s(t_k − tL).
   * o: { tL, vL (sayı ya da [x,y]), hiz (varış hızı, birim/sn; vL ile aynı tür), genlik (sn), frekans (Hz), sonum,
   *      sinir (timeline sn: sonraki anahtar kare ya da klibin sonu; o kareye ve ötesine yazılmaz), fps,
   *      tN, vN (sonraki anahtar karenin zamanı ve değeri: taban oraya doğru doğrusal gider, kullanıcının sonraki
   *      hareketi kaymaz; tN verilmezse sinir; vN yoksa taban vL), clampMin, clampMax (Opaklık 0..100),
   *      sinirSigdir (true: aşım clampMin / clampMax'a sığacak kadar küçültülür, kırpılmaz: kırpılan tepe silinip geri
   *      dönen salınım kalırdı, ör. sönen Opaklık yeniden görünür; iniş sınırdaysa ve aşım o yöndeyse 'sinir'),
   *      yogun (true: 2 karede bir sık yazım) }
   * Süre autoDuration(sönüm); sonraki anahtar karenin bir kare öncesine (ya da klibin son karesine) kırpılır.
   * Anahtarlar timeline kare zamanlarında. Seyrek planda (Bezier ile yazılır) her tepe / çukur en yakın kareye
   * oturur; değer o karedeki gerçek eğri değeri. Son anahtar (pencere sonu) tam tabanda (s = 0): sönümlü sinüsün
   * kalıntısı yazılmaz, iniş son anahtarsa özellik kullanıcının değerinde oturur.
   * Döner: { keys: [{ t, v }], sure (sn), oda (inişten sonra yazılabilen kare), yogun, oran (aşım çarpanı, 1 = ayar) }
   *   ya da hata: 'aralik' (tL / sinir geçersiz) | 'fps' | 'deger' | 'hiz' (varış hızı yok) | 'yer' (2 kareden az yer) |
   *   'sinir' (sinirSigdir: iniş değeri sınırda, aşım sığmıyor)
   */
  function yaylanPlan(o) {
    o = o || {};
    var tL = Number(o.tL), sinir = Number(o.sinir), fps = Number(o.fps);
    var bos = function (hata, ek) { var r = { keys: [], sure: 0, oda: 0, yogun: !!o.yogun, hata: hata }; for (var k in ek || {}) r[k] = ek[k]; return r; };
    if (!(isFinite(tL) && isFinite(sinir) && sinir > tL)) return bos("aralik");
    if (!(isFinite(fps) && fps > 0 && fps <= 1000)) return bos("fps");
    var vL = degerOku(o.vL), hiz = degerOku(o.hiz), vN = o.vN === undefined || o.vN === null ? null : degerOku(o.vN);
    var dizi = Array.isArray(vL);
    if (vL === null || hiz === null || dizi !== Array.isArray(hiz) || (dizi && vL.length !== hiz.length)) return bos("deger");
    if (vN !== null && (dizi !== Array.isArray(vN) || (dizi && vN.length !== vL.length))) return bos("deger");
    var hizlar = dizi ? hiz : [hiz];
    if (!hizlar.some(function (h) { return Math.abs(h) > 1e-9; })) return bos("hiz");
    var genlik = ayarSayi(o.genlik, YAYLAN.GENLIK), frekans = ayarSayi(o.frekans, YAYLAN.FREKANS), sonum = ayarSayi(o.sonum, YAYLAN.SONUM);
    var lo = sonlu(o.clampMin) ? o.clampMin : -Infinity, hi = sonlu(o.clampMax) ? o.clampMax : Infinity;
    if (lo > hi) { lo = -Infinity; hi = Infinity; }

    // kare ızgarası bakePlan'daki gibi: iniş karesinden sonraki kareler, sinirden en az yarım kare önce
    var f0 = tL * fps, f1 = sinir * fps;
    var taban = Math.abs(f0 - Math.round(f0)) < 1e-3 ? Math.round(f0) : Math.floor(f0);
    var jmin = Math.max(1, Math.floor(f0 + 0.5 - taban) + 1);
    var jmax = Math.ceil(f1 - 0.5 - taban) - 1;
    var oda = Math.max(0, jmax - jmin + 1);
    if (oda < YAYLAN.EN_AZ_KARE) return bos("yer", { oda: oda });
    var sure = Math.min(autoDuration(sonum), (taban + jmax) / fps - tL);
    var jSon = Math.min(jmax, Math.max(jmin, Math.round((tL + sure) * fps) - taban));
    sure = (taban + jSon) / fps - tL;

    var js = [];
    if (o.yogun) {
      for (var j = jmin; j < jSon; j += YAYLAN.YOGUN_ADIM) js.push(j);
      js.push(jSon);
    } else {
      followThroughAnchors(frekans, sonum, sure).forEach(function (a) {
        if (!(a.t > 0)) return;
        var jj = Math.min(jSon, Math.max(jmin, Math.round((tL + a.t) * fps) - taban));
        if (!js.length || jj > js[js.length - 1]) js.push(jj);
      });
      if (!js.length || js[js.length - 1] !== jSon) js.push(jSon);
    }
    var s = dampedSine(frekans, sonum);
    var tN = Number(o.tN);
    if (!(isFinite(tN) && tN >= sinir - 1e-9)) tN = sinir;
    var vLd = dizi ? vL : [vL], vNd = vN === null ? null : (dizi ? vN : [vN]);
    function tabanDeger(a, d, u) { return vNd ? a + (vNd[d] - a) * (u / (tN - tL)) : a; }
    // Sınıra sığdırma: pencerenin her karesinde (seyrek ve sık plan aynı çarpanı alır) aşım sınırı geçmesin
    var oran = 1;
    if (o.sinirSigdir && (lo > -Infinity || hi < Infinity)) {
      for (var jk = jmin; jk < jSon; jk++) {
        var uk = (taban + jk) / fps - tL, sk = s(uk);
        for (var d0 = 0; d0 < vLd.length; d0++) {
          var b0 = tabanDeger(vLd[d0], d0, uk), a0 = hizlar[d0] * genlik * sk;
          if (a0 < 0 && b0 + a0 < lo) oran = Math.min(oran, Math.max(0, (b0 - lo) / -a0));
          if (a0 > 0 && b0 + a0 > hi) oran = Math.min(oran, Math.max(0, (hi - b0) / a0));
        }
      }
      if (oran < YAYLAN.EN_AZ_ORAN) return bos("sinir", { oda: oda, oran: oran });
    }
    var keys = js.map(function (jj) {
      var t = (taban + jj) / fps, u = t - tL, sv = jj === jSon ? 0 : s(u);
      var v = vLd.map(function (a, d) {
        return r6(sinirla(tabanDeger(a, d, u) + hizlar[d] * genlik * oran * sv, lo, hi));
      });
      return { t: t, v: dizi ? v : v[0] };
    });
    return { keys: keys, sure: sure, oda: oda, yogun: !!o.yogun, genlik: genlik, frekans: frekans, sonum: sonum, oran: oran };
  }

  var bezier = { cubicBezier: cubicBezier };
  var penner = { fns: fns, get: pennerGet, elasticOutWith: elasticOutWith, names: Object.keys(fns), isMonotonic: pennerMonotonic };
  var springApi = { resolveParams: resolveParams, spring: spring, springNormalized: springNormalized, settleTime: settleTime };
  var sampler = { toFunction: toFunction, samplePoints: samplePoints, range: range, bakeFactors: bakeFactors, turningPoints: turningPoints, slopeAt: slopeAt };
  var speedgraph = { endpointSpeeds: endpointSpeeds, withStartSpeed: withStartSpeed, withEndSpeed: withEndSpeed, sampleSpeed: sampleSpeed, speedRange: speedRange };
  var overshoot = { dampedSine: dampedSine, extremaTimes: extremaTimes, autoDuration: autoDuration, followThroughAnchors: followThroughAnchors };

  return {
    // Rebound ad alanları (Rebound.easing.* → SufloEase.*)
    bezier: bezier, penner: penner, spring: springApi, sampler: sampler, speedgraph: speedgraph, overshoot: overshoot,
    // düz kısayollar
    cubicBezier: cubicBezier, resolveParams: resolveParams, springNormalized: springNormalized, settleTime: settleTime,
    toFunction: toFunction, samplePoints: samplePoints, range: range, bakeFactors: bakeFactors, turningPoints: turningPoints,
    endpointSpeeds: endpointSpeeds, withStartSpeed: withStartSpeed, withEndSpeed: withEndSpeed,
    sampleSpeed: sampleSpeed, speedRange: speedRange,
    dampedSine: dampedSine, extremaTimes: extremaTimes, autoDuration: autoDuration, followThroughAnchors: followThroughAnchors,
    // Suflo eklemeleri
    normalize: normalize, split: split, flip: flip, invert: invert, toMulti: toMulti, isMonotonic: isMonotonic,
    toCss: toCss, fromCss: fromCss, bakePlan: bakePlan, yaylanPlan: yaylanPlan, YAYLAN: YAYLAN,
    builtins: builtins, builtin: builtin, builtinName: builtinName, kopya: kopya,
    sfcKodla: sfcKodla, sfcCoz: sfcCoz,
    // paylaşım (3.4 adım 15): iki türlü SFC1 kodu, .suflo-egri dosyası, yapıştırma ve içe aktarma
    paylasimKodla: paylasimKodla, paylasimCoz: paylasimCoz, egriAdresi: egriAdresi, cssOku: cssOku, cssCoz: cssCoz, yapistir: yapistir,
    iceAktar: iceAktar, dosyaOku: dosyaOku, dosyaYaz: dosyaYaz, disEgri: disEgri, onayarDogrula: onayarDogrula,
    onayarImzasi: onayarImzasi, hizAnahtarlari: hizAnahtarlari, adTemiz: adTemiz, utf8Bayt: utf8Bayt,
    BUILTINS: builtins(),
    LIMITS: { Y_MIN: Y_MIN, Y_MAX: Y_MAX, MAX_PTS: MAX_PTS, MIN_GAP: MIN_GAP, CSS_MAX: CSS_MAX, MAX_KEYS: MAX_KEYS, SFC_MAX: SFC_MAX, SFC_AD: SFC_AD,
      DOSYA_BAYT: DOSYA.BAYT, DOSYA_ONAYAR: DOSYA.ONAYAR, DOSYA_UZANTI: DOSYA.UZANTI, HIZ_MIN: HIZ.MIN, HIZ_MAX: HIZ.MAX, HIZ_HIT: HIZ.HIT.slice() }
  };
});
