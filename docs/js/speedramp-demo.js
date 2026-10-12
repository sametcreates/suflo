/* Illustrative curves only; this is not the Premiere ramp algorithm. */
(function () {
  'use strict';
  var curves = [
    'M 40 62 C 110 62 122 158 218 158 S 314 62 432 62',
    'M 40 105 L 140 105 C 160 105 180 172 216 172 S 252 58 292 58 L 432 105',
    'M 40 50 C 100 50 125 105 210 105 L 432 105',
    'M 40 105 L 232 105 C 320 105 345 50 432 50',
    'M 40 65 C 108 65 122 154 192 154 L 294 154 C 354 154 372 105 432 105',
    'M 40 105 L 160 105 C 184 105 192 38 214 38 S 245 105 272 105 L 432 105',
    'M 40 52 C 90 52 98 152 158 152 L 306 152 C 380 152 384 52 432 52',
    'M 40 105 C 66 38 92 172 118 105 S 170 38 196 105 S 248 172 274 105 S 326 38 352 105 S 406 172 432 105',
    'M 40 145 L 140 145 L 140 105 L 238 105 L 238 60 L 336 60 L 336 105 L 432 105',
    'M 40 105 C 120 76 150 132 230 105 S 350 76 432 105',
    'M 40 105 L 95 105 L 112 158 L 130 105 L 215 105 L 232 50 L 250 105 L 335 105 L 352 158 L 370 105 L 432 105'
  ];
  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  document.querySelectorAll('[data-speedramp]').forEach(function (demo) {
    var path = demo.querySelector('.sr-curve');
    var label = demo.querySelector('[data-curve-label]');
    var buttons = demo.querySelectorAll('[data-curve]');
    var pause = demo.querySelector('.sr-pause');
    function setPaused(paused) {
      demo.classList.toggle('sr-paused', paused);
      pause.setAttribute('aria-pressed', String(paused));
      pause.textContent = paused ? pause.dataset.play : pause.dataset.pause;
    }
    buttons.forEach(function (button) {
      button.disabled = false;
      button.addEventListener('click', function () {
        var index = Number(button.dataset.curve);
        if (!curves[index]) return;
        path.setAttribute('d', curves[index]);
        label.textContent = button.textContent;
        buttons.forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
      });
    });
    pause.disabled = false;
    pause.addEventListener('click', function () { setPaused(pause.getAttribute('aria-pressed') !== 'true'); });
    setPaused(Boolean(motion && motion.matches));
    if (motion && motion.addEventListener) motion.addEventListener('change', function (event) { setPaused(event.matches); });
  });
}());
