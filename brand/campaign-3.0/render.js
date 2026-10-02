"use strict";
// Suflo 3.0 lansman karuseli: carousel.html -> 1080x1350 PNG + kontak sayfasi.
// Kullanim: node brand/campaign-3.0/render.js [taban-url]
// Varsayilan taban: bu klasordeki carousel.html (file://). sharp gerekmez.
var fs = require("fs");
var path = require("path");
var url = require("url");
var playwright = require("playwright");

var dir = __dirname;
var base = process.argv[2] || url.pathToFileURL(path.join(dir, "carousel.html")).href;
var names = [
  "01-cover.png",
  "02-viral-shorts.png",
  "03-hook-title.png",
  "04-text-cut.png",
  "05-audio-enhance.png",
  "06-keyword-emphasis.png",
  "07-more-features.png",
  "08-free-vs-pro.png",
  "09-offer-749.png"
];
var DECOR = /(^|\s)(noise|hero-orb|hero-big|offer-big|grid-bg|hook-orb|tool-glow|audio-orb|style-orb|library-orb|compare-glow|offer-orb|offer-lines)(\s|$)/;

function pngSize(file) {
  var b = fs.readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

(async function () {
  var candidates = [
    process.env.SUFLO_CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    playwright.chromium.executablePath(),
    "/opt/pw-browsers/chromium"
  ].filter(Boolean);
  var executablePath = candidates.find(function (file) { return fs.existsSync(file) && fs.statSync(file).isFile(); });
  var browser = await playwright.chromium.launch(executablePath ? { headless: true, executablePath: executablePath } : { headless: true });
  var page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  var qa = [];

  for (var i = 0; i < names.length; i++) {
    await page.goto(base + "?slide=" + (i + 1), { waitUntil: "networkidle" });
    await page.evaluate(function () { return document.fonts.ready; });
    var state = await page.evaluate(function (decorSrc) {
      var decor = new RegExp(decorSrc);
      var active = document.querySelector("section.slide.active");
      var warnings = [];
      if (active) {
        var foot = active.querySelector(".foot").getBoundingClientRect();
        var all = active.querySelectorAll("*");
        for (var k = 0; k < all.length; k++) {
          var el = all[k];
          if (decor.test(el.className) || el.closest(".foot") || el.closest(".nav") || el.closest("[data-qa-skip]")) continue;
          var r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          var label = el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "") + " \"" + (el.innerText || "").trim().slice(0, 30) + "\"";
          if (r.right > 1080 - 18 || r.left < 18) {
            if (!el.closest(".whatsnew")) warnings.push("kenar disi: " + label);
          }
          if (r.bottom > foot.top - 4) warnings.push("footer cakismasi: " + label + " bottom=" + Math.round(r.bottom) + " foot=" + Math.round(foot.top));
          var cs = getComputedStyle(el);
          if (el.children.length === 0 && (el.innerText || "").trim() && (el.scrollWidth > el.clientWidth + 1) && cs.display !== "inline") warnings.push("yatay tasma: " + label);
        }
      }
      return {
        activeCount: document.querySelectorAll("section.slide.active").length,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
        textLength: active ? active.innerText.trim().length : 0,
        warnings: warnings
      };
    }, DECOR.source);
    if (state.activeCount !== 1 || state.textLength < 60) throw new Error("Slayt gorunmuyor: " + (i + 1) + " " + JSON.stringify(state));
    if (state.bodyWidth !== 1080 || state.bodyHeight !== 1350) throw new Error("Canvas tasmasi: " + JSON.stringify(state));

    var output = path.join(dir, names[i]);
    await page.screenshot({ path: output, type: "png", clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    var meta = pngSize(output);
    if (meta.width !== 1080 || meta.height !== 1350) throw new Error("Olcu hatasi: " + names[i]);
    state.warnings.forEach(function (w) { console.warn("[" + names[i] + "] " + w); });
    qa.push({ file: names[i], width: meta.width, height: meta.height, bytes: fs.statSync(output).size, textLength: state.textLength, warnings: state.warnings });
  }

  // Kontak sayfasi: 5 + 4 kucuk resim, tarayicida dizilir ve ekran goruntusu alinir.
  var thumbW = 270, thumbH = 338, gap = 16, cols = 5;
  var rows = Math.ceil(names.length / cols);
  var sheetW = gap + cols * (thumbW + gap);
  var sheetH = gap + rows * (thumbH + gap);
  await page.setViewportSize({ width: sheetW, height: sheetH });
  await page.goto(base + "?slide=1", { waitUntil: "networkidle" });
  await page.evaluate(function (o) {
    document.documentElement.style.cssText = "width:" + o.w + "px;height:" + o.h + "px;overflow:hidden;background:#07090f";
    document.body.style.cssText = "width:" + o.w + "px;height:" + o.h + "px;margin:0;overflow:hidden;background:#07090f;position:relative";
    document.body.innerHTML = o.names.map(function (n, j) {
      return '<img src="' + n + "?v=" + Date.now() + '" style="position:absolute;left:' + (o.gap + (j % o.cols) * (o.tw + o.gap)) + "px;top:" +
        (o.gap + Math.floor(j / o.cols) * (o.th + o.gap)) + "px;width:" + o.tw + "px;height:" + o.th + 'px;border-radius:6px">';
    }).join("");
    return Promise.all(Array.prototype.map.call(document.images, function (img) {
      return img.complete ? null : new Promise(function (r) { img.onload = img.onerror = r; });
    }));
  }, { names: names, w: sheetW, h: sheetH, tw: thumbW, th: thumbH, gap: gap, cols: cols });
  await page.screenshot({ path: path.join(dir, "carousel-preview.png"), type: "png", clip: { x: 0, y: 0, width: sheetW, height: sheetH } });
  await browser.close();

  fs.writeFileSync(path.join(dir, "render-qa.json"), JSON.stringify({ renderedAt: new Date().toISOString(), slides: qa }, null, 2) + "\n");
  console.log("Suflo 3.0 campaign rendered: " + qa.length + " slides, 1080x1350");
}()).catch(function (error) {
  console.error(error.stack || error);
  process.exit(1);
});
