(function () {
  "use strict";
  var requested = Number(new URLSearchParams(location.search).get("slide") || 1);
  var slideNumber = Math.max(1, Math.min(10, requested));
  document.documentElement.setAttribute("data-slide", String(slideNumber));
  var active = document.querySelector('section[data-slide="' + slideNumber + '"]');
  if (active) active.classList.add("active");
}());
