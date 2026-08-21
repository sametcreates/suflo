/*
 * Suflo Pro — yerlesik Motion presetleri
 *
 * Ucuncu taraf .prfpset dosyasi tasimaz. Kartlar panelde canli onizlenir;
 * Pro kullanici tikladiginda guvenli bir kimlik host.jsx'e gider ve secili
 * klibin kendi Motion/Opacity degerleri uzerine anahtar kareler eklenir.
 */
window.KPresets = (function () {
  "use strict";

  var PRESETS = [
    { id: "simple-zoom-in", name: "Simple Zoom In", group: "zoom", desc: "Yumusak yaklasma", preview: "zoom-in" },
    { id: "simple-zoom-out", name: "Simple Zoom Out", group: "zoom", desc: "Temiz acilma", preview: "zoom-out" },
    { id: "pop-in", name: "Pop In", group: "zoom", desc: "Esnek giris", preview: "pop" },
    { id: "slide-in-left", name: "Slide In Left", group: "slide", desc: "Soldan giris", preview: "slide-left" },
    { id: "slide-in-right", name: "Slide In Right", group: "slide", desc: "Sagdan giris", preview: "slide-right" },
    { id: "slide-in-up", name: "Slide In Up", group: "slide", desc: "Alttan yukari", preview: "slide-up" },
    { id: "slide-in-down", name: "Slide In Down", group: "slide", desc: "Yukaridan asagi", preview: "slide-down" },
    { id: "fade-in", name: "Clean Fade In", group: "fade", desc: "Temiz gorunme", preview: "fade-in" },
    { id: "fade-out", name: "Clean Fade Out", group: "fade", desc: "Temiz kaybolma", preview: "fade-out" },
    { id: "punch", name: "Focus Punch", group: "impact", desc: "Vurgu zoomu", preview: "punch" },
    { id: "micro-shake", name: "Micro Shake", group: "impact", desc: "Kisa kamera vurgusu", preview: "shake" },
    { id: "slide-out-right", name: "Slide Out Right", group: "slide", desc: "Saga cikis", preview: "slide-out" }
  ];
  var filter = "all";
  var query = "";
  var busy = "";

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function favorites() {
    var s = K.settings();
    if (!Array.isArray(s.motionPresetFavs)) s.motionPresetFavs = [];
    return s.motionPresetFavs;
  }
  function isFavorite(id) { return favorites().indexOf(id) !== -1; }
  function toggleFavorite(id) {
    var favs = favorites();
    var at = favs.indexOf(id);
    if (at === -1) favs.push(id); else favs.splice(at, 1);
    K.saveSettings();
    render();
  }
  function speedValue() {
    var input = el("preset-speed");
    var n = Number(input && input.value);
    return isFinite(n) && n >= .18 && n <= 1.5 ? n : .45;
  }
  function strengthValue() {
    var input = el("preset-strength");
    var n = Number(input && input.value);
    return isFinite(n) && n >= .5 && n <= 1.8 ? n : 1;
  }
  function filtered() {
    return PRESETS.filter(function (p) {
      if (filter === "fav" && !isFavorite(p.id)) return false;
      if (filter !== "all" && filter !== "fav" && p.group !== filter) return false;
      return !query || (p.name + " " + p.desc + " " + p.group).toLowerCase().indexOf(query) !== -1;
    });
  }

  async function apply(preset, card) {
    if (busy) return;
    if (typeof Pro !== "undefined" && !Pro.gate("presets")) return;
    busy = preset.id;
    if (card) card.classList.add("busy");
    try {
      var result = await K.call("KS_applyMotionPreset", {
        id: preset.id,
        duration: speedValue(),
        strength: strengthValue()
      }, 30000);
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "Preset uygulanamadi.");
      if (card) card.classList.add("ok");
      KApp.toast(result.applied + " klibe uygulandi · " + preset.name, "good");
      setTimeout(function () { if (card) card.classList.remove("ok"); }, 900);
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      busy = "";
      if (card) card.classList.remove("busy");
    }
  }

  function render() {
    var grid = el("preset-grid");
    var empty = el("preset-empty");
    if (!grid) return;
    var list = filtered();
    var locked = typeof Pro !== "undefined" && !Pro.isPro();
    grid.innerHTML = "";
    if (empty) empty.hidden = !!list.length;
    if (el("preset-count")) el("preset-count").textContent = list.length + " / " + PRESETS.length + " preset";
    if (el("preset-sayac")) el("preset-sayac").textContent = String(PRESETS.length);

    list.forEach(function (p) {
      var card = document.createElement("article");
      card.className = "preset-card" + (locked ? " locked" : "");
      card.setAttribute("role", "group");
      card.setAttribute("aria-label", p.name + (locked ? " · Suflo Pro preseti, kilitli" : " · secili klibe uygula"));
      var action = locked
        ? '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg><span>LOCKED</span>'
        : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4"/></svg><span>UYGULA</span>';
      card.innerHTML =
        '<div class="preset-preview preset-preview-' + esc(p.preview) + '" aria-hidden="true">' +
          '<span class="preset-frame"><i></i><b>SUFLO</b></span>' +
          '<em>' + esc(p.group.toUpperCase()) + '</em>' +
          (locked ? '<span class="preset-lock"><svg viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg></span>' : "") +
        '</div>' +
        '<div class="preset-body"><span><b>' + esc(p.name) + '</b><i>' + esc(p.desc) + '</i></span>' +
          '<button type="button" class="preset-fav' + (isFavorite(p.id) ? " on" : "") + '" title="Favori" aria-pressed="' + (isFavorite(p.id) ? "true" : "false") + '">♥</button>' +
        '</div>' +
        '<button type="button" class="preset-apply' + (locked ? " is-locked" : "") + '">' + action + '</button>';
      card.querySelector(".preset-fav").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFavorite(p.id);
      });
      card.querySelector(".preset-apply").addEventListener("click", function () { apply(p, card); });
      card.querySelector(".preset-preview").addEventListener("click", function () { apply(p, card); });
      grid.appendChild(card);
    });
  }

  function init() {
    if (!el("tab-presets")) return;
    var search = el("preset-search");
    if (search) search.addEventListener("input", function () { query = this.value.trim().toLowerCase(); render(); });
    var filters = el("preset-filter");
    if (filters) Array.prototype.forEach.call(filters.querySelectorAll("button"), function (button) {
      button.addEventListener("click", function () {
        filter = button.getAttribute("data-f") || "all";
        Array.prototype.forEach.call(filters.querySelectorAll("button"), function (b) { b.classList.toggle("on", b === button); });
        render();
      });
    });
    var cta = el("preset-proya-gec");
    if (cta) cta.addEventListener("click", function () { if (typeof Pro !== "undefined") Pro.gate("presets"); });
    if (typeof Pro !== "undefined") Pro.on(render);
    KApp.onTab("presets", render);
    render();
  }

  return { init: init, render: render, list: function () { return PRESETS.slice(); }, count: function () { return PRESETS.length; } };
})();
