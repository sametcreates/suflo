"use strict";
var fs = require("fs");
var path = require("path");
var playwright = require("playwright");

var outDir = path.join(__dirname, "panel-captures");
fs.mkdirSync(outDir, { recursive: true });

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
  var page = await browser.newPage({ viewport: { width: 720, height: 1120 }, deviceScaleFactor: 1 });
  await page.goto("http://127.0.0.1:48733/index.html", { waitUntil: "networkidle" });
  await page.evaluate(function () { return document.fonts.ready; });
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: "#toasts{display:none!important} #cap-setup{display:none!important}" });

  var captures = [
    { selector: '.ky-oge[data-tab="captions"]', file: "01-captions.png" },
    { selector: '.ky-oge[data-tab="text"][data-kat="mogrt"]', file: "02-text-effects.png" },
    { selector: '.ky-oge[data-tab="presets"]', file: "03-motion-presets.png" },
    { selector: '.ky-oge[data-tab="sfx"]', file: "04-sfx.png" },
    { selector: '.ky-oge[data-tab="cut"]', file: "05-magic-cut.png" },
    { selector: '.ky-oge[data-tab="zoom"]', file: "06-auto-zoom.png" },
    { selector: '.ky-oge[data-tab="emoji-assets"]', file: "07-emoji-assets.png" },
    { selector: '.ky-oge[data-tab="beat"]', file: "08-beat-marker.png" },
    { selector: '.ky-oge[data-tab="motionbg"]', file: "09-motion-bg.png" },
    { selector: '.ky-oge[data-tab="text"][data-kat="custom"]', file: "10-other-animations.png" },
    { selector: '.ky-oge[data-tab="text"][data-kat="buton"]', file: "11-buttons.png" },
    { selector: '.ky-oge[data-tab="settings"]', file: "12-settings.png" }
  ];

  for (var i = 0; i < captures.length; i++) {
    var item = captures[i];
    await page.locator(item.selector).click();
    await page.waitForTimeout(500);
    await page.evaluate(function () {
      ["cut-tanitim", "zoom-tanitim", "beat-tanitim", "yazi-tanitim", "preset-tanitim", "sfx-tanitim", "motionbg-tanitim"].forEach(function (id) {
        var promo = document.getElementById(id);
        if (promo) promo.style.display = "none";
      });
      document.querySelectorAll(".pro-locked,.locked").forEach(function (node) {
        node.classList.remove("pro-locked", "locked");
      });
      document.querySelectorAll(".mogrt-lock,.preset-lock,.ky-kilit").forEach(function (node) { node.remove(); });
      document.querySelectorAll(".mogrt-ekle-btn").forEach(function (button) {
        button.classList.remove("is-locked");
        button.innerHTML = '<span style="font-size:16px">→</span><span>EKLE</span>';
      });
      document.querySelectorAll(".preset-apply").forEach(function (button) {
        button.classList.remove("is-locked");
        button.innerHTML = '<span style="font-size:16px">→</span><span>' + (button.classList.contains("preset-pack-install") ? "KURULUMU AÇ" : "UYGULA") + "</span>";
      });
    });
    await page.evaluate(function () { window.scrollTo(0, 0); });
    await page.screenshot({ path: path.join(outDir, item.file), type: "png" });
  }

  await browser.close();
  console.log("Panel captures: " + captures.length);
}()).catch(function (error) {
  console.error(error.stack || error);
  process.exit(1);
});
