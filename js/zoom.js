/*
 * Suflo Pro — Otomatik Zoom
 *
 * Konusan-kafa videoya AutoCut tarzi, konusmaya gore zamanlanmis punch-in
 * ritmi ekler: sessizlikler ffmpeg ile bulunur, her konusma basinda zoom
 * durumu degisir (ic <-> dis), anahtar kareler klibin Motion > Scale
 * ozelligine kaynak-zaman eslemesiyle yazilir (host.jsx / KS_autoZoom).
 * Deger olarak CARPAN gonderilir (1.0 = klibin kendi olcegi); host, klibin
 * gercek Scale degeriyle carpar — %50'ye kucultulmus klipte de dogru calisir.
 *
 * Plan uretimi saf fonksiyondur ve node ile test edilir (tests/test-zoom.js).
 */

/* ---------------- Saf plan uretici ---------------- */

function KZoomSegmentler(silences, dur) {
  // silences: [{start,end}] 0-tabanli, siralanmamis olabilir -> konusma araliklari
  var sil = (silences || []).slice().sort(function (a, b) { return a.start - b.start; });
  var out = [];
  var imlec = 0;
  for (var i = 0; i < sil.length; i++) {
    var s = Math.max(0, Number(sil[i].start) || 0);
    var e = Math.min(dur, Number(sil[i].end) || 0);
    if (e <= imlec) continue;
    if (s > imlec + 0.05) out.push({ start: imlec, end: Math.min(s, dur) });
    imlec = Math.max(imlec, e);
  }
  if (imlec < dur - 0.05) out.push({ start: imlec, end: dur });
  return out;
}

function KZoomAkilliNoktalar(opts) {
  /*
   * AutoCut benzeri karar katmani. Hazir altyazi varsa cumle donuslerini,
   * vurgu/numara kelimelerini ve gercek bosluklari kullanir; yoksa ses
   * analizinden gelen konusma segmentlerine doner. Uzun tek planlarda da
   * ritim bos kalmasin diye kontrollu ara vurus ekler.
   */
  opts = opts || {};
  var dur = Math.max(.2, Number(opts.dur) || 0);
  var offset = Number(opts.offset) || 0;
  var interval = Math.max(2.5, Math.min(12, Number(opts.interval) || 5));
  var candidates = [{ time: 0, score: 20, reason: "start" }];
  var cues = (opts.cues || []).slice().sort(function (a, b) { return Number(a.start) - Number(b.start); });
  var prev = null;
  var turns = /^(ama|fakat|ancak|şimdi|simdi|sonra|peki|çünkü|cunku|burada|işte|iste|but|however|now|then|because|next)\b/i;
  cues.forEach(function (cue) {
    var absStart = Number(cue && cue.start), absEnd = Number(cue && cue.end);
    var text = String(cue && cue.text || "").trim();
    if (!isFinite(absStart) || !isFinite(absEnd) || !text || absEnd <= offset || absStart >= offset + dur) return;
    var time = Math.max(0, Math.min(dur, absStart - offset));
    var score = 0, reason = "speech";
    var gap = prev ? absStart - Number(prev.end || prev.start || absStart) : 99;
    if (gap > .38) { score += 6; reason = "pause"; }
    if (turns.test(text)) { score += 7; reason = "turn"; }
    if (/[!?]\s*$/.test(text)) { score += 6; reason = "emphasis"; }
    if (/\b(?:\d+|birinci|ikinci|üçüncü|ucuncu|first|second|third)\b/i.test(text)) { score += 4; reason = "number"; }
    if (text === text.toUpperCase() && /[A-ZÇĞİÖŞÜ]/.test(text) && text.length > 2) { score += 3; reason = "emphasis"; }
    if (score) candidates.push({ time: time, score: score, reason: reason });
    prev = cue;
  });
  (opts.segments || []).forEach(function (segment) {
    var start = Math.max(0, Math.min(dur, Number(segment && segment.start) || 0));
    if (start < dur - .15) candidates.push({ time: start, score: 5, reason: "speech" });
  });
  candidates.sort(function (a, b) { return a.time - b.time || b.score - a.score; });

  var merged = [];
  candidates.forEach(function (point) {
    var last = merged.length ? merged[merged.length - 1] : null;
    if (last && point.time - last.time < .55) {
      if (point.score > last.score) merged[merged.length - 1] = point;
      return;
    }
    merged.push(point);
  });

  var filled = [];
  for (var i = 0; i < merged.length; i++) {
    if (filled.length) {
      var lastTime = filled[filled.length - 1].time;
      while (merged[i].time - lastTime > interval * 1.65) {
        lastTime += interval;
        filled.push({ time: lastTime, score: 1, reason: "rhythm" });
      }
    }
    filled.push(merged[i]);
  }
  var tail = filled.length ? filled[filled.length - 1].time : 0;
  while (dur - tail > interval * 1.65) {
    tail += interval;
    filled.push({ time: tail, score: 1, reason: "rhythm" });
  }
  return filled.filter(function (point) { return point.time >= 0 && point.time < dur - .12; });
}

function KZoomPlan(opts) {
  /*
   * opts: { dur, segments:[{start,end}] (0-tabanli), intensity (.06-.25),
   *         speed (sn), mode: "smart"|"speech"|"rhythm", points:[{time}], interval (sn),
   *         style: "smooth"|"jumpcut"|"snapin" }  (AutoCut'taki uc stil)
   * donus: { keys:[{time,value}], mode, style } — time 0-tabanli sn, value carpan.
   */
  var dur = Math.max(0.2, Number(opts.dur) || 0);
  var I = Number(opts.intensity); if (!isFinite(I)) I = 0.12; I = Math.max(0.04, Math.min(0.3, I));
  var d = Number(opts.speed); if (!isFinite(d)) d = 0.45; d = Math.max(0.2, Math.min(0.9, d));
  var interval = Number(opts.interval); if (!isFinite(interval)) interval = 5; interval = Math.max(2, Math.min(15, interval));
  var style = opts.style === "jumpcut" || opts.style === "snapin" ? opts.style : "smooth";
  var minGap = Math.max(d * 2, 1.2);

  var mode = opts.mode === "rhythm" ? "rhythm" : (opts.mode === "smart" ? "smart" : "speech");
  var noktalar = []; // toggle zamanlari
  if (mode === "smart") {
    noktalar = (opts.points || []).map(function (point) { return Number(point && point.time !== undefined ? point.time : point); })
      .filter(function (time) { return isFinite(time) && time >= 0 && time < dur; });
    if (noktalar.length < 2) mode = "rhythm";
  } else if (mode === "speech") {
    var segs = (opts.segments || []).filter(function (s) { return s && s.end - s.start > 0.15; });
    if (segs.length < 2) mode = "rhythm";
    else for (var i = 0; i < segs.length; i++) noktalar.push(Math.max(0, segs[i].start));
  }
  if (mode === "rhythm") {
    noktalar = [];
    for (var t = 0; t < dur - d; t += interval) noktalar.push(t);
  }

  // cok sik togglelari ele (titreme olmasin); anahtar sayisini sinirla
  var temiz = [];
  for (var j = 0; j < noktalar.length; j++) {
    if (!temiz.length || noktalar[j] - temiz[temiz.length - 1] >= minGap) temiz.push(noktalar[j]);
  }
  while (temiz.length > 120) { // asiri uzun icerikte seyrelt
    var yari = [];
    for (var k = 0; k < temiz.length; k += 2) yari.push(temiz[k]);
    temiz = yari;
  }

  var BAZ = 1, IC = 1 + I;
  var keys = [];
  var cur = BAZ;
  var son = -1; // son yazilan anahtar zamani
  function anahtar(t, v) {
    t = Math.max(0, Math.min(dur, t));
    if (t <= son + 0.01) t = son + 0.01;
    if (t > dur) return;
    keys.push({ time: t, value: v });
    son = t;
  }

  for (var n = 0; n < temiz.length; n++) {
    var t0 = temiz[n];
    var hedef = cur === BAZ ? IC : BAZ;
    var gecis = Math.min(d, Math.max(0.15, dur - t0 - 0.02));
    if (t0 <= 0.05) {
      // klip basinda gecis yapacak yer yok: dogrudan hedef degerle basla
      anahtar(0, hedef);
    } else if (style === "jumpcut") {
      // sert kesme: bir kare oncesine mevcut deger, kesim aninda hedef
      anahtar(t0 - 0.04, cur);
      anahtar(t0, hedef);
    } else if (style === "snapin") {
      // hizli kademeli: buyuk adim + iki kucuk oturma adimi
      anahtar(t0 - 0.04, cur);
      anahtar(t0, cur + (hedef - cur) * 0.55);
      anahtar(t0 + 0.09, cur + (hedef - cur) * 0.85);
      anahtar(t0 + 0.18, hedef);
    } else {
      var ov = hedef > cur ? hedef * 1.012 : hedef * 0.996; // hafif overshoot -> dogal his
      anahtar(t0, cur);
      anahtar(t0 + gecis * 0.78, ov);
      anahtar(t0 + gecis, hedef);
    }
    cur = hedef;
  }
  if (!keys.length || keys[0].time > 0.011) keys.unshift({ time: 0, value: BAZ });
  return { keys: keys, mode: mode, style: style, toggles: temiz.length };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { plan: KZoomPlan, segmentler: KZoomSegmentler, akilliNoktalar: KZoomAkilliNoktalar };
}

/* ---------------- Panel UI ---------------- */

if (typeof window !== "undefined") window.KZoom = (function () {
  "use strict";

  var busy = false;

  function el(id) { return document.getElementById(id); }
  function status(msg, cls) {
    var e = el("zoom-status");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }
  function setBusy(b) {
    busy = b;
    var r = el("zoom-run");
    if (r) r.classList.toggle("busy", b);
    var p = el("zoom-progress");
    if (p) p.hidden = !b;
  }
  function deger(id, vars) {
    var n = Number(el(id) && el(id).value);
    return isFinite(n) ? n : vars;
  }

  function sabitNokta() {
    // 3x3 grid: data-a="ax,ay" (0..1). Varsayilan merkez.
    var on = document.querySelector("#zoom-nokta .on");
    if (!on || !on.dataset.a) return [0.5, 0.5];
    var p = on.dataset.a.split(",");
    return [Number(p[0]) || 0.5, Number(p[1]) || 0.5];
  }

  function parseSilence(stderr) {
    var out = [];
    var lines = String(stderr || "").split(/\r?\n/);
    var pending = null;
    for (var i = 0; i < lines.length; i++) {
      var mStart = lines[i].match(/silence_start:\s*(-?[\d.]+)/);
      if (mStart) { pending = parseFloat(mStart[1]); continue; }
      var mEnd = lines[i].match(/silence_end:\s*([\d.]+)/);
      if (mEnd && pending !== null) {
        out.push({ start: Math.max(0, pending), end: parseFloat(mEnd[1]) });
        pending = null;
      }
    }
    return out;
  }

  async function calistir() {
    if (busy) return;
    if (typeof Pro !== "undefined" && !Pro.gate("zoom")) return; // Pro: otomatik zoom
    var clip = KApp.ctx().sel;
    if (!clip) { status("Önce timeline'da bir klip seç.", "warn"); return; }
    setBusy(true);
    try {
      var sourceDur = Math.max(.2, clip.outPoint - clip.inPoint);
      var dur = Math.max(.2, clip.clipEnd - clip.clipStart);
      var mod = (document.querySelector('#zoom-mode .on') || {}).dataset;
      var mode = mod && mod.m === "rhythm" ? "rhythm" : "smart";
      var segments = [];
      var interval = deger("zoom-aralik", 5);
      var cues = window.KCaptions && KCaptions.getSegments ? KCaptions.getSegments() : [];
      var smartPoints = mode === "smart" ? KZoomAkilliNoktalar({
        dur: dur, offset: clip.clipStart, interval: interval, cues: cues, segments: []
      }) : [];

      if (mode === "smart" && smartPoints.length < 2) {
        var ff = await K.findFfmpeg();
        if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");
        status("Konuşma ritmi analiz ediliyor… (" + dur.toFixed(0) + " sn)");
        var res = await K.run(ff, [
          "-hide_banner",
          "-ss", String(clip.inPoint),
          "-t", String(sourceDur),
          "-i", clip.mediaPath,
          "-map", "0:a:0?",
          "-af", "silencedetect=noise=-39dB:d=0.42",
          "-f", "null", "-"
        ], { timeout: Math.max(300000, sourceDur * 2000) });
        var scaleToTimeline = dur / sourceDur;
        var silence = parseSilence(res.stderr).map(function (item) {
          return { start: item.start * scaleToTimeline, end: item.end * scaleToTimeline };
        });
        segments = KZoomSegmentler(silence, dur);
        smartPoints = KZoomAkilliNoktalar({
          dur: dur, offset: clip.clipStart, interval: interval, cues: cues, segments: segments
        });
        K.log("[zoom] segment=" + segments.length + " sure=" + dur.toFixed(1));
      }

      var stil = (document.querySelector('#zoom-stil .on') || {}).dataset;
      var plan = KZoomPlan({
        dur: dur,
        segments: segments,
        points: smartPoints,
        intensity: deger("zoom-yogunluk", 12) / 100,
        speed: deger("zoom-hiz", 0.45),
        mode: mode,
        interval: interval,
        style: stil && stil.s ? stil.s : "smooth"
      });
      if (plan.toggles < 1) { status("Zoom noktası bulunamadı — Ritmik modu dene.", "warn"); return; }

      status("Anahtar kareler yazılıyor…");
      var keys = plan.keys.map(function (k) {
        return { time: clip.clipStart + k.time, value: k.value };
      });
      var result = await K.call("KS_autoZoom", {
        keys: keys,
        anchor: sabitNokta(),
        clearStart: clip.clipStart,
        clearEnd: clip.clipStart + dur
      }, 30000);
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "Zoom uygulanamadı.");
      status("");
      KApp.toast(plan.toggles + " zoom hareketi eklendi (" +
        (plan.mode === "smart" ? "akıllı ritim" : (plan.mode === "speech" ? "konuşmaya göre" : "ritmik")) + ")", "good");
    } catch (e) {
      status("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function kaldir() {
    if (busy) return;
    if (typeof Pro !== "undefined" && !Pro.gate("zoom")) return;
    var clip = KApp.ctx().sel;
    if (!clip) { status("Önce timeline'da bir klip seç.", "warn"); return; }
    setBusy(true);
    try {
      var dur = Math.max(.2, clip.clipEnd - clip.clipStart);
      var result = await K.call("KS_autoZoom", {
        keys: [{ time: clip.clipStart, value: 1 }, { time: clip.clipStart + dur, value: 1 }],
        anchor: sabitNokta(), // merkez-disi uygulandiysa pozisyon da baza doner
        clearStart: clip.clipStart,
        clearEnd: clip.clipStart + dur
      }, 30000);
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "Temizlenemedi.");
      status("");
      KApp.toast("Zoom anahtarları temizlendi", "good");
    } catch (e) {
      status("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      setBusy(false);
    }
  }

  function init() {
    if (!el("tab-zoom")) return;
    el("zoom-run").addEventListener("click", calistir);
    el("zoom-remove").addEventListener("click", kaldir);
    // mod secici (seg-ctl kalibi)
    Array.prototype.forEach.call(document.querySelectorAll("#zoom-mode button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(document.querySelectorAll("#zoom-mode button"), function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        var satir = el("zoom-aralik-satir");
        if (satir) satir.hidden = false;
      });
    });
    // stil ve sabit nokta secicileri (tekli secim)
    ["zoom-stil", "zoom-nokta"].forEach(function (grup) {
      Array.prototype.forEach.call(document.querySelectorAll("#" + grup + " button"), function (b) {
        b.addEventListener("click", function () {
          Array.prototype.forEach.call(document.querySelectorAll("#" + grup + " button"), function (x) { x.classList.remove("on"); });
          b.classList.add("on");
        });
      });
    });
    // slider etiketleri
    [["zoom-yogunluk", "zoom-yogunluk-val", function (v) { return "%" + v; }],
     ["zoom-hiz", "zoom-hiz-val", function (v) { return v + " sn"; }],
     ["zoom-aralik", "zoom-aralik-val", function (v) { return v + " sn"; }]].forEach(function (t) {
      var inp = el(t[0]), out = el(t[1]);
      if (inp && out) inp.addEventListener("input", function () { out.textContent = t[2](inp.value); });
    });
  }

  return { init: init };
})();
