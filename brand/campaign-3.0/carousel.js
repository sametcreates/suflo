(function () {
  "use strict";
  var total = document.querySelectorAll("section.slide").length || 9;
  var requested = Number(new URLSearchParams(location.search).get("slide") || 1);
  var slideNumber = Math.max(1, Math.min(total, requested));
  document.documentElement.setAttribute("data-slide", String(slideNumber));
  var active = document.querySelector('section[data-slide="' + slideNumber + '"]');
  if (active) active.classList.add("active");

  // Deterministic illustrative waveforms (no randomness: every render is identical).
  function wave(el) {
    var n = Number(el.getAttribute("data-bars") || 60);
    var mode = el.getAttribute("data-wave") || "clean";
    var html = "";
    for (var i = 0; i < n; i++) {
      var speech = Math.abs(Math.sin(i * 0.37) * 0.6 + Math.sin(i * 1.13) * 0.3 + Math.sin(i * 0.07) * 0.25);
      var h;
      if (mode === "noisy") h = 22 + speech * 52 + Math.abs(Math.sin(i * 2.7)) * 18;
      else if (mode === "flat") h = 10 + Math.abs(Math.sin(i * 0.9)) * 26;
      else h = 8 + speech * 78;
      h = Math.max(6, Math.min(100, h));
      html += '<i style="height:' + h.toFixed(1) + '%"></i>';
    }
    el.innerHTML = html;
  }
  var waves = document.querySelectorAll("[data-wave]");
  for (var w = 0; w < waves.length; w++) wave(waves[w]);
}());
