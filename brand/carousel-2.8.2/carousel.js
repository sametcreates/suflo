(function () {
  "use strict";
  var n = Math.max(1, Math.min(8, Number(new URLSearchParams(location.search).get("slide") || 1)));
  document.documentElement.setAttribute("data-slide", String(n));
  var slide = document.querySelector('section[data-slide="' + n + '"]');
  if (slide) slide.classList.add("active");
}());
