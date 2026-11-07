// Suflo testi yardımcısı: bilinen kelime sınırlarıyla sentetik "konuşma" (ton patlamaları) üretir.
// Kelime = rastgele temel frekanslı harmonik ton, 5 ms yükselen / düşen kenar; aralar sessizlik (−70 dB gürültü),
// bazı kelimeler bitişik (ara yok: yalnız perde / seviye değişir). Tohumlu rastgele: her koşu aynı ses.
"use strict";
function rastgele(tohum) {
  var s = tohum >>> 0 || 1;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
var SR = 16000;

/*
 * o: { tohum, kelime (sayı), bitisikOran, basSn, gurultuDb (taban), muzikDb, sureSn (yalnız bitir) }
 * Döner: { pcm: Float32Array, kelimeler: [{ start, end, text }] (gerçek), sure }
 */
function uret(o) {
  o = o || {};
  var r = rastgele(o.tohum || 7);
  var n = o.kelime || 40, t = o.basSn !== undefined ? o.basSn : 0.5, kel = [];
  for (var i = 0; i < n; i++) {
    var sure = 0.12 + r() * 0.33;
    kel.push({ start: Math.round(t * 1000) / 1000, end: Math.round((t + sure) * 1000) / 1000, text: "k" + i });
    t += sure;
    var u = r();
    if (u < (o.bitisikOran !== undefined ? o.bitisikOran : 0.15)) t += 0;
    else if (u < 0.6) t += 0.04 + r() * 0.06;
    else t += 0.15 + r() * 0.5;
    t = Math.round(t * 1000) / 1000;
  }
  var toplam = Math.max(o.sureSn || 0, t + 0.6);
  var pcm = new Float32Array(Math.round(toplam * SR));
  var gr = Math.pow(10, (o.gurultuDb !== undefined ? o.gurultuDb : -70) / 20);
  for (var j = 0; j < pcm.length; j++) pcm[j] = gr * (r() * 2 - 1) * 1.732;
  kel.forEach(function (w) {
    var f0 = 100 + r() * 160, gen = 0.08 + r() * 0.3, a = Math.round(w.start * SR), b = Math.round(w.end * SR);
    var ramp = Math.round(0.005 * SR);
    for (var k = a; k < b && k < pcm.length; k++) {
      var e = 1;
      if (k - a < ramp) e = 0.5 - 0.5 * Math.cos(Math.PI * (k - a) / ramp);
      if (b - k < ramp) e = 0.5 - 0.5 * Math.cos(Math.PI * (b - k) / ramp);
      var tt = k / SR, v = 0;
      for (var h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f0 * h * tt) / h;
      pcm[k] += gen * e * v * 0.5;
    }
  });
  if (o.muzikDb !== undefined) {
    var mg = Math.pow(10, o.muzikDb / 20);
    for (var m = 0; m < pcm.length; m++) {
      var tm = m / SR;
      pcm[m] += mg * (Math.sin(2 * Math.PI * 220 * tm) + 0.7 * Math.sin(2 * Math.PI * 277 * tm) + 0.5 * Math.sin(2 * Math.PI * 330 * tm) + 0.3 * (r() * 2 - 1)) / 2.5;
    }
  }
  return { pcm: pcm, kelimeler: kel, sure: toplam };
}

// gerçek kelimeleri d sn kaydırır, her sınıra ±jit sn tohumlu sapma ekler (whisper benzeri hata)
function boz(kel, d, jit, tohum) {
  var r = rastgele(tohum || 3);
  var out = kel.map(function (w) {
    return { start: Math.round((w.start + d + (r() * 2 - 1) * jit) * 1000) / 1000, end: Math.round((w.end + d + (r() * 2 - 1) * jit) * 1000) / 1000, text: w.text };
  });
  for (var i = 0; i < out.length; i++) {
    if (out[i].end < out[i].start + 0.03) out[i].end = out[i].start + 0.03;
    if (i > 0 && out[i].start < out[i - 1].end) out[i].start = out[i - 1].end;
    if (out[i].end < out[i].start) out[i].end = out[i].start + 0.03;
  }
  return out;
}

// kelimeleri n'li kartlara böler
function kartla(kel, n) {
  var k = [];
  for (var i = 0; i < kel.length; i += n) {
    var ws = kel.slice(i, i + n);
    k.push({ start: ws[0].start, end: ws[ws.length - 1].end, text: ws.map(function (w) { return w.text; }).join(" "), words: ws });
  }
  return k;
}

function int16(pcm) {
  var y = new Int16Array(pcm.length);
  for (var i = 0; i < pcm.length; i++) { var v = Math.round(pcm[i] * 32767); y[i] = v > 32767 ? 32767 : (v < -32768 ? -32768 : v); }
  return y;
}

/*
 * Hece yapılı "konuşma": her kelime 1–3 heceden (ayrı perde / seviye) oluşur; heceler arasında 0..araMs sessiz
 * kapanma (patlamalı ünsüz gibi) olabilir. Kelime İÇİNDE de başlangıç / bitiş doğar: doğru zamanlı kelimeler
 * bu iç başlangıçlara çekilmemeli. o: { tohum, kelime, araMs (40), bitisikOran (0.25) }
 */
function uretHece(o) {
  o = o || {};
  var r = rastgele(o.tohum || 1), n = o.kelime || 60, ara = (o.araMs !== undefined ? o.araMs : 40) / 1000;
  var bo = o.bitisikOran !== undefined ? o.bitisikOran : 0.25;
  var t = 0.5, kel = [], heceler = [];
  for (var i = 0; i < n; i++) {
    var ns = 1 + Math.floor(r() * 3), bas = t;
    for (var s = 0; s < ns; s++) {
      var d = 0.08 + r() * 0.15;
      heceler.push({ s: t, e: t + d, f0: 100 + r() * 160, gen: 0.05 + r() * 0.35 });
      t += d;
      if (s + 1 < ns) t += r() * ara;
    }
    kel.push({ start: Math.round(bas * 1000) / 1000, end: Math.round(t * 1000) / 1000, text: "k" + i });
    var u = r();
    if (u < bo) t += 0; else if (u < 0.6) t += 0.04 + r() * 0.06; else t += 0.15 + r() * 0.5;
  }
  var pcm = new Float32Array(Math.round((t + 0.6) * SR));
  for (var j = 0; j < pcm.length; j++) pcm[j] = 3e-4 * (r() * 2 - 1) * 1.732;
  heceler.forEach(function (h) {
    var a = Math.round(h.s * SR), b = Math.round(h.e * SR), ramp = 80;
    for (var k = a; k < b; k++) {
      var e = 1;
      if (k - a < ramp) e = 0.5 - 0.5 * Math.cos(Math.PI * (k - a) / ramp);
      if (b - k < ramp) e = 0.5 - 0.5 * Math.cos(Math.PI * (b - k) / ramp);
      var tt = k / SR, v = 0;
      for (var q = 1; q <= 6; q++) v += Math.sin(2 * Math.PI * h.f0 * q * tt) / q;
      pcm[k] += h.gen * e * v * 0.5;
    }
  });
  return { pcm: pcm, kelimeler: kel };
}

/*
 * Sürtünmeli ünsüzle başlayan "kelimeler" (s / f / h / th gibi): her kelime yüksek frekanslı gürültü patlamasıyla
 * (60–120 ms, ünlüden fricDb dB alçak; farkı alınmış beyaz gürültü: enerjisi 2,5 kHz üstünde) başlar, ardından ötümlü
 * harmonik ton (150–400 ms) gelir. Gerçek kelime başı = sürtünmenin başı. o: { tohum, kelime, fricDb (−26),
 * yatakDb (verilirse düşük frekanslı müzik yatağı: 55–220 Hz tonlar + alçak geçiren gürültü; −20 ≈ konuşmadan 20 dB alçak) }
 */
function uretSurtunmeli(o) {
  o = o || {};
  var r = rastgele(o.tohum || 1), n = o.kelime || 40, t = 0.6, kel = [], par = [];
  for (var i = 0; i < n; i++) {
    var fr = 0.06 + r() * 0.06, v = 0.15 + r() * 0.25;
    kel.push({ start: Math.round(t * 1000) / 1000, end: Math.round((t + fr + v) * 1000) / 1000, text: "s" + i });
    par.push({ s: t, f: fr, v: v, f0: 100 + r() * 150 });
    t += fr + v + 0.12 + r() * 0.4;
  }
  var pcm = new Float32Array(Math.round((t + 0.6) * SR));
  for (var j = 0; j < pcm.length; j++) pcm[j] = 3e-4 * (r() * 2 - 1);
  var VG = 0.25, FG = VG * Math.pow(10, (o.fricDb === undefined ? -26 : o.fricDb) / 20), onceki = 0;
  par.forEach(function (p) {
    var a = Math.round(p.s * SR), b = Math.round((p.s + p.f) * SR), c = Math.round((p.s + p.f + p.v) * SR), k;
    for (k = a; k < b; k++) { var x = r() * 2 - 1, e = Math.min(1, (k - a) / 40, (b - k) / 40 + 0.3); pcm[k] += FG * 1.732 * (x - onceki) * 0.7 * e; onceki = x; }
    for (k = b; k < c; k++) {
      var e2 = Math.min(1, (k - b) / 80, (c - k) / 80), tt = k / SR, v = 0;
      for (var h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * p.f0 * h * tt) / h;
      pcm[k] += VG * e2 * v * 0.5;
    }
  });
  if (o.yatakDb !== undefined) {
    var mg = VG * Math.pow(10, o.yatakDb / 20), lp = 0;
    for (var m = 0; m < pcm.length; m++) {
      var tm = m / SR;
      lp = 0.97 * lp + 0.03 * (r() * 2 - 1);
      pcm[m] += mg * (Math.sin(2 * Math.PI * 55 * tm) + 0.7 * Math.sin(2 * Math.PI * 110 * tm) + 0.5 * Math.sin(2 * Math.PI * 165.5 * tm) + 0.4 * Math.sin(2 * Math.PI * 220 * tm) + 3 * lp) / 2;
    }
  }
  return { pcm: pcm, kelimeler: kel };
}

module.exports = { uret: uret, uretHece: uretHece, uretSurtunmeli: uretSurtunmeli, boz: boz, kartla: kartla, int16: int16, rastgele: rastgele, SR: SR };
