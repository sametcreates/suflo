/*
 * Kesit — Motion modülü
 * Sürüklenebilir cubic-bezier eğri editörü. Seçili klibin keyframe'li özellikleri
 * otomatik listelenir; eğri her ardışık keyframe çifti arasına uygulanır.
 */
window.KMotion = (function () {
  "use strict";

  var props = [];
  var canvas, ctx2d;
  // normalize bezier kontrol noktaları: P1, P2 (P0=0,0 · P3=1,1 sabit)
  var h = { x1: 0.65, y1: 0, x2: 0.35, y2: 1 };
  var drag = null; // "p1" | "p2"
  var Y_MIN = -0.5, Y_MAX = 1.5;
  var PAD = 16;

  function el(id) { return document.getElementById(id); }

  function status(msg, cls) {
    var e = el("mo-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  /* ---------------- Bezier ---------------- */

  function bez(t, a, b) { // P0=0, P3=1 için tek eksen
    var mt = 1 - t;
    return 3 * mt * mt * t * a + 3 * mt * t * t * b + t * t * t;
  }

  function sampleCurve(n) {
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n;
      pts.push([bez(t, h.x1, h.x2), bez(t, h.y1, h.y2)]);
    }
    pts[0] = [0, 0];
    pts[n] = [1, 1];
    return pts;
  }

  /* ---------------- Çizim ---------------- */

  function toPx(x, y) {
    var w = canvas.width, hh = canvas.height;
    return [
      PAD + (w - PAD * 2) * x,
      hh - PAD - (hh - PAD * 2) * ((y - Y_MIN) / (Y_MAX - Y_MIN))
    ];
  }

  function fromPx(px, py) {
    var w = canvas.width, hh = canvas.height;
    return [
      (px - PAD) / (w - PAD * 2),
      Y_MIN + (1 - (py - PAD) / (hh - PAD * 2)) * (Y_MAX - Y_MIN)
    ];
  }

  function draw() {
    if (!ctx2d) return;
    var w = canvas.width, hh = canvas.height;
    ctx2d.clearRect(0, 0, w, hh);

    var css = getComputedStyle(document.documentElement);
    var accent = css.getPropertyValue("--accent").trim() || "#e8a13c";

    // 0 ve 1 değer çizgileri
    ctx2d.strokeStyle = "rgba(255,255,255,.09)";
    ctx2d.lineWidth = 1;
    [0, 1].forEach(function (v) {
      var p = toPx(0, v);
      ctx2d.beginPath();
      ctx2d.moveTo(PAD, p[1]);
      ctx2d.lineTo(w - PAD, p[1]);
      ctx2d.stroke();
    });

    // doğrusal referans
    var a0 = toPx(0, 0), a1 = toPx(1, 1);
    ctx2d.strokeStyle = "rgba(255,255,255,.14)";
    ctx2d.setLineDash([4, 4]);
    ctx2d.beginPath(); ctx2d.moveTo(a0[0], a0[1]); ctx2d.lineTo(a1[0], a1[1]); ctx2d.stroke();
    ctx2d.setLineDash([]);

    // kol çizgileri
    ctx2d.strokeStyle = "rgba(255,255,255,.25)";
    var p1 = toPx(h.x1, h.y1), p2 = toPx(h.x2, h.y2);
    ctx2d.beginPath(); ctx2d.moveTo(a0[0], a0[1]); ctx2d.lineTo(p1[0], p1[1]); ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.moveTo(a1[0], a1[1]); ctx2d.lineTo(p2[0], p2[1]); ctx2d.stroke();

    // eğri
    ctx2d.strokeStyle = accent;
    ctx2d.lineWidth = 2.2;
    ctx2d.beginPath();
    sampleCurve(80).forEach(function (pt, i) {
      var p = toPx(pt[0], pt[1]);
      if (i === 0) ctx2d.moveTo(p[0], p[1]); else ctx2d.lineTo(p[0], p[1]);
    });
    ctx2d.stroke();

    // uç noktalar
    ctx2d.fillStyle = "#bbb";
    [a0, a1].forEach(function (p) {
      ctx2d.beginPath(); ctx2d.arc(p[0], p[1], 3.5, 0, 7); ctx2d.fill();
    });

    // tutamaçlar
    [p1, p2].forEach(function (p) {
      ctx2d.beginPath(); ctx2d.arc(p[0], p[1], 6.5, 0, 7);
      ctx2d.fillStyle = accent; ctx2d.fill();
      ctx2d.beginPath(); ctx2d.arc(p[0], p[1], 2.6, 0, 7);
      ctx2d.fillStyle = "#13141b"; ctx2d.fill();
    });
  }

  /* ---------------- Sürükleme ---------------- */

  function canvasPos(ev) {
    var r = canvas.getBoundingClientRect();
    return [
      (ev.clientX - r.left) * (canvas.width / r.width),
      (ev.clientY - r.top) * (canvas.height / r.height)
    ];
  }

  function nearHandle(px, py) {
    var p1 = toPx(h.x1, h.y1), p2 = toPx(h.x2, h.y2);
    var d1 = Math.hypot(px - p1[0], py - p1[1]);
    var d2 = Math.hypot(px - p2[0], py - p2[1]);
    if (Math.min(d1, d2) > 26) return null;
    return d1 <= d2 ? "p1" : "p2";
  }

  function clearPresetSel() {
    Array.prototype.forEach.call(el("mo-presets").querySelectorAll("button"), function (b) {
      b.classList.remove("on");
    });
  }

  function initDrag() {
    canvas.addEventListener("pointerdown", function (ev) {
      drag = nearHandle.apply(null, canvasPos(ev));
      if (drag) canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var pos = canvasPos(ev);
      var n = fromPx(pos[0], pos[1]);
      var x = Math.max(0, Math.min(1, n[0]));
      var y = Math.max(Y_MIN, Math.min(Y_MAX, n[1]));
      if (drag === "p1") { h.x1 = x; h.y1 = y; }
      else { h.x2 = x; h.y2 = y; }
      clearPresetSel();
      draw();
    });
    canvas.addEventListener("pointerup", function () { drag = null; });
  }

  /* ---------------- Özellikler ---------------- */

  async function loadProps() {
    var ctx = KApp.ctx();
    var sel = el("mo-prop");
    if (!ctx.sel) {
      sel.innerHTML = '<option value="">— klip seç —</option>';
      el("mo-apply").disabled = true;
      status("");
      return;
    }
    var r = await K.call("KS_getMotionProps");
    sel.innerHTML = "";
    if (!r.ok || !r.props || r.props.length === 0) {
      sel.innerHTML = '<option value="">— keyframe\'li özellik yok —</option>';
      el("mo-apply").disabled = true;
      status(r.ok
        ? "Effect Controls'ta bir özelliğe en az 2 keyframe koy, sonra buraya dön."
        : "✕ " + r.error, r.ok ? "warn" : "bad");
      return;
    }
    props = r.props;
    props.forEach(function (p, i) {
      var o = document.createElement("option");
      o.value = String(i);
      o.textContent = p.compName + " › " + p.propName + " (" + p.keys + ")";
      sel.appendChild(o);
    });
    el("mo-apply").disabled = false;
    status("");
  }

  async function apply() {
    var p = props[Number(el("mo-prop").value)];
    if (!p) { status("Özellik seç.", "warn"); return; }
    el("mo-apply").disabled = true;
    var r = await K.call("KS_applyEase", {
      comp: p.comp,
      prop: p.prop,
      curve: sampleCurve(48),
      density: 15
    });
    el("mo-apply").disabled = false;
    if (r.ok) KApp.toast(r.pairs + " aralığa ease uygulandı (" + r.added + " ara keyframe)", "good");
    else status("✕ " + r.error, "bad");
  }

  /* ---------------- Başlat ---------------- */

  function init() {
    canvas = el("mo-canvas");
    ctx2d = canvas.getContext("2d");

    Array.prototype.forEach.call(el("mo-presets").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        clearPresetSel();
        b.classList.add("on");
        var v = b.dataset.p.split(",").map(Number);
        h = { x1: v[0], y1: v[1], x2: v[2], y2: v[3] };
        draw();
      });
    });

    el("mo-apply").addEventListener("click", apply);
    el("mo-refresh").addEventListener("click", loadProps);

    initDrag();
    draw();

    KApp.onTab("motion", function () { draw(); loadProps(); });
    KApp.onContext(function () {
      if (document.getElementById("tab-motion").classList.contains("active")) loadProps();
    });
  }

  return { init: init };
})();
