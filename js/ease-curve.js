/*
 * Suflo Yumuşatma motoru — saf modül (DOM'a, Premiere'e, dosyaya dokunmaz)
 * window.SufloEase · module.exports  (3.4, plan adım 9; Eğri, Geçiş/Zoom/Hareket eğrisi,
 * Hız Rampası özel eğrisi, varışta yaylanma ve SFC1 kodları bu motoru kullanır)
 *
 * Portions adapted from Rebound (https://github.com/meszmate/rebound), MIT License, Copyright (c) 2026 Rebound contributors. See THIRD_PARTY_NOTICES.md.
 *
 * Rebound'dan (commit 0f9fd6c, client/js/easing/) uyarlananlar — her biri "// Rebound: <ad>" ile işaretli:
 *   bezier.js     cubicBezier (Newton 8 adım + ikiye bölme yedeği)
 *   penner.js     Penner kümesi (quad … bounce, In/Out/InOut), get, isMonotonic, elasticOutWith
 *   spring.js     resolveParams, spring, springNormalized, settleTime
 *   sampler.js    toFunction, samplePoints, range, bakeFactors, turningPoints, slopeAt
 *   speedgraph.js endpointSpeeds, withStartSpeed, withEndSpeed, sampleSpeed, speedRange
 *   overshoot.js  dampedSine, extremaTimes, autoDuration, followThroughAnchors
 * Ad alanı Rebound.easing yerine SufloEase; ES5 (CEF 74 / Node 12.3).
 *
 * Suflo'nun kendi (temiz oda) eklemeleri: çok noktalı eğri ({type:'multi'}; her parça kendi
 * genel kübik Newton + ikiye bölme çözücüsüyle), normalize, split (de Casteljau, şekil değişmez),
 * flip (180° döndürme), invert (eksen değişimi; yalnız tekdüze eğri), toCss/fromCss (yalnız tek
 * 'cubic-bezier(a,b,c,d)'), hazır eğriler (BUILTINS) ve bakePlan (sık anahtar kare planı).
 * Premiere'in ExtendScript'i Bezier tutamaçlarını yazamaz: Suflo eğriyi sık anahtar karelere
 * "pişirir" (bakePlan). Çok noktalı eğrilerin metin sözdizimi YOK; yalnız SFC1 kodu içinde JSON.
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
  function spring(opts) {
    var p = resolveParams(opts);
    var m = p.mass, k = p.stiffness, c = p.damping, v0 = p.velocity;
    var w0 = Math.sqrt(k / m);
    var zeta = c / (2 * Math.sqrt(k * m));
    var fn, regime;
    if (zeta < 1) {
      regime = "underdamped";
      var wd = w0 * Math.sqrt(1 - zeta * zeta);
      var A = -1;
      var B = (v0 + zeta * w0 * A) / wd;
      fn = function (t) {
        var env = Math.exp(-zeta * w0 * t);
        return 1 + env * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
      };
    } else if (zeta === 1 || Math.abs(zeta - 1) < 1e-6) {
      regime = "critical";
      var A2 = -1;
      var B2 = v0 + w0 * A2;
      fn = function (t) { return 1 + Math.exp(-w0 * t) * (A2 + B2 * t); };
    } else {
      regime = "overdamped";
      var s = w0 * Math.sqrt(zeta * zeta - 1);
      var r1 = -zeta * w0 + s;
      var r2 = -zeta * w0 - s;
      var C1 = (v0 + r2) / (r1 - r2);
      var C2 = -1 - C1;
      fn = function (t) { return 1 + C1 * Math.exp(r1 * t) + C2 * Math.exp(r2 * t); };
    }
    return { fn: fn, omega0: w0, zeta: zeta, regime: regime, settleTime: settleTime(w0, zeta), params: p };
  }

  // Rebound: settleTime — zarf e^(-zeta*w0*t) epsilon altına inene dek (varsayılan %0,5)
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

  function normMulti(c) {
    if (!c || !Array.isArray(c.pts) || c.pts.length < 2) return null;
    var ham = [];
    for (var i = 0; i < c.pts.length && i < 64; i++) {
      var p = c.pts[i];
      if (p && sonlu(p.x) && sonlu(p.y)) ham.push({ p: p, x: sinirla(p.x, 0, 1), y: sinirla(p.y, Y_MIN, Y_MAX), s: i });
    }
    if (ham.length < 2) return null;
    ham.sort(function (a, b) { return a.x - b.x || a.s - b.s; });
    // uçlar: x ≈ 0 olan ilk nokta başlangıç olur, yoksa (0,0) eklenir; sonda da aynısı
    var bas = ham[0].x <= MIN_GAP / 2 ? ham.shift() : null;
    var son = ham.length && ham[ham.length - 1].x >= 1 - MIN_GAP / 2 ? ham.pop() : null;
    var ic = [], onceki = 0;
    ham.forEach(function (h) {
      if (h.x >= onceki + MIN_GAP && h.x <= 1 - MIN_GAP) { ic.push(h); onceki = h.x; }
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
        if (i > 0 && p[i].y < p[i - 1].y + MIN_GAP) return null;
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
    var yeni = p.map(function (q) { return { x: q.x, y: q.y, ix: q.ix, iy: q.iy, ox: q.ox, oy: q.oy, smooth: q.smooth }; });
    yeni[i].ox = P01[0]; yeni[i].oy = P01[1];
    yeni[i + 1].ix = P23[0]; yeni[i + 1].iy = P23[1];
    yeni.splice(i + 1, 0, { x: P[0], y: P[1], ix: P012[0], iy: P012[1], ox: P123[0], oy: P123[1], smooth: true });
    return normalize({ type: "multi", pts: yeni });
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
    toCss: toCss, fromCss: fromCss, bakePlan: bakePlan, builtins: builtins, builtin: builtin, builtinName: builtinName, kopya: kopya,
    BUILTINS: builtins(),
    LIMITS: { Y_MIN: Y_MIN, Y_MAX: Y_MAX, MAX_PTS: MAX_PTS, MIN_GAP: MIN_GAP, CSS_MAX: CSS_MAX, MAX_KEYS: MAX_KEYS }
  };
});
