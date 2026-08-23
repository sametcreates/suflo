"use strict";
var fs = require("fs");
var path = require("path");
var playwright = require("playwright");
var sharp = require("sharp");

var dir = __dirname;
var base = process.argv[2] || "http://127.0.0.1:48733/brand/campaign-2.8.2/carousel.html";
var names = [
  "01-free-hero.png",
  "02-why-suflo.png",
  "03-three-steps.png",
  "04-free-features.png",
  "05-free-vs-pro-bridge.png",
  "06-pro-tools.png",
  "07-caption-styles.png",
  "08-pro-library.png",
  "09-free-vs-pro.png",
  "10-offer-749.png"
];

(async function () {
  var candidates = [
    process.env.SUFLO_CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    playwright.chromium.executablePath()
  ].filter(Boolean);
  var executablePath = candidates.find(function (file) { return fs.existsSync(file); });
  if (!executablePath) throw new Error("Chrome/Chromium bulunamadi.");

  var browser = await playwright.chromium.launch({ headless: true, executablePath: executablePath });
  var page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  var qa = [];

  for (var i = 0; i < names.length; i++) {
    await page.goto(base + "?slide=" + (i + 1), { waitUntil: "networkidle" });
    await page.evaluate(function () { return document.fonts.ready; });
    var state = await page.evaluate(function () {
      var active = document.querySelector("section.slide.active");
      return {
        activeCount: document.querySelectorAll("section.slide.active").length,
        slideCount: document.querySelectorAll("section.slide").length,
        scriptCount: document.scripts.length,
        title: document.title,
        readyState: document.readyState,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
        textLength: active ? active.innerText.trim().length : 0
      };
    });
    if (state.activeCount !== 1 || state.textLength < 60) throw new Error("Slayt gorunmuyor: " + (i + 1) + " " + JSON.stringify(state));
    if (state.bodyWidth !== 1080 || state.bodyHeight !== 1350) throw new Error("Canvas tasmasi: " + JSON.stringify(state));

    var output = path.join(dir, names[i]);
    await page.screenshot({ path: output, type: "png", clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    var meta = await sharp(output).metadata();
    if (meta.width !== 1080 || meta.height !== 1350) throw new Error("Olcu hatasi: " + names[i]);
    qa.push({ file: names[i], width: meta.width, height: meta.height, bytes: fs.statSync(output).size, textLength: state.textLength });
  }
  await browser.close();

  var thumbW = 270;
  var thumbH = 338;
  var gap = 16;
  var sheetW = gap + 5 * (thumbW + gap);
  var sheetH = gap + 2 * (thumbH + gap);
  var layers = [];
  for (var j = 0; j < names.length; j++) {
    layers.push({
      input: await sharp(path.join(dir, names[j])).resize(thumbW, thumbH).png().toBuffer(),
      left: gap + (j % 5) * (thumbW + gap),
      top: gap + Math.floor(j / 5) * (thumbH + gap)
    });
  }
  var previewFinal = path.join(dir, "carousel-preview-final.png");
  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: "#07090f" } })
    .composite(layers).png().toFile(previewFinal);
  await sharp(previewFinal).png().toFile(path.join(dir, "carousel-preview.png"));
  fs.writeFileSync(path.join(dir, "render-qa.json"), JSON.stringify({ renderedAt: new Date().toISOString(), slides: qa }, null, 2) + "\n");
  console.log("Suflo campaign rendered: " + qa.length + " slides, 1080x1350");
}()).catch(function (error) {
  console.error(error.stack || error);
  process.exit(1);
});
