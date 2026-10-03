/*
 * Suflo — Geçişler (v3.0)
 * Playhead'e en yakın kesime iki tarafa eşleşik keyframe yazar.
 * Plan: js/transitions.js (saf, testli) · Uygulama: host KS_applyCutTransition.
 */
window.KGecis = (function () {
  "use strict";

  var TR = window.SufloTransitions;
  var busy = false;

  function el(id) { return document.getElementById(id); }

  function status(msg, cls) {
    var e = el("gecis-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function secenek() {
    return {
      duration: Number(el("gecis-sure").value) || 0.5,
      strength: Number(el("gecis-guc").value) || 1
    };
  }

  async function uygula(t, btn) {
    if (typeof Pro !== "undefined" && !Pro.gate("transitions")) return;
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    status(t.name + " uygulanıyor…");
    try {
      var r = await K.call("KS_applyCutTransition", { plan: TR.hostPlan(t.id, secenek()), tolerance: 1.0 }, 60000);
      if (!r.ok) throw new Error(r.error);
      status("");
      KApp.toast("↔ " + t.name + " · V" + r.track + " kesimine eklendi" +
        (r.half < secenek().duration / 2 - 0.01 ? " (kısa klip: süre kısaltıldı)" : ""), "good");
    } catch (e) {
      status("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  function render() {
    var grid = el("gecis-grid");
    grid.innerHTML = "";
    var kilitli = typeof Pro !== "undefined" && !Pro.isPro();
    TR.list().forEach(function (t) {
      var card = document.createElement("div");
      card.className = "preset-card gecis-card" + (kilitli ? " locked" : "");
      var sahne = document.createElement("div");
      sahne.className = "gecis-sahne gecis-" + t.id;
      sahne.innerHTML = '<span class="gs-a">A</span><span class="gs-b">B</span>';
      var bilgi = document.createElement("div");
      bilgi.className = "gecis-bilgi";
      var b = document.createElement("b"); b.textContent = t.name;
      var i = document.createElement("i"); i.textContent = t.desc;
      bilgi.appendChild(b); bilgi.appendChild(i);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn preset-apply" + (kilitli ? " is-locked" : "");
      btn.textContent = kilitli ? "🔒 Pro" : "Uygula";
      btn.addEventListener("click", function () { uygula(t, btn); });
      card.appendChild(sahne); card.appendChild(bilgi); card.appendChild(btn);
      grid.appendChild(card);
    });
    if (el("gecis-sayac")) el("gecis-sayac").textContent = String(TR.list().length);
  }

  function init() {
    if (!TR || !el("gecis-grid")) return;
    render();
    if (typeof Pro !== "undefined" && Pro.on) { try { Pro.on(render); } catch (e) {} }
  }

  return { init: init };
})();
