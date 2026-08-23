/* Visual smoke test for the Pro preset browser. Run while tools/devserver.js is open. */
"use strict";
var fs = require("fs");
var path = require("path");
var os = require("os");
var playwright = require("playwright");

(async function () {
  var source = path.join(process.env.APPDATA || "", "Kesit", "pro-content", "releases", "2026.08.23.1", "presets", "Suflo Smooth Editing Pack.prfpset");
  if (!fs.existsSync(source)) throw new Error("Yerel test preset paketi bulunamadi: " + source);
  var xml = fs.readFileSync(source, "utf8");
  var chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  var browser = await playwright.chromium.launch({ headless: true, executablePath: fs.existsSync(chrome) ? chrome : undefined });
  var page = await browser.newPage({ viewport: { width: 980, height: 900 } });
  await page.goto("http://127.0.0.1:5177/index.html", { waitUntil: "networkidle" });
  await page.locator('.ky-oge[data-tab="presets"]').click();
  await page.evaluate(function (payload) {
    window.Pro.isPro = function () { return true; };
    window.Pro.gate = function () { return true; };
    var settings = { proPackKlasor: "MOCK" };
    window.K.settings = function () { return settings; };
    window.K.nodeOK = true;
    window.K.path = {
      join: function () { return Array.prototype.join.call(arguments, "/"); },
      dirname: function (value) { return String(value).replace(/[\\/][^\\/]+$/, ""); },
      resolve: function (value) { return value; }
    };
    window.K.fs = {
      existsSync: function () { return true; },
      statSync: function (value) {
        return {
          size: payload.xml.length,
          mtimeMs: 1,
          isDirectory: function () { return /presets$/.test(value); },
          isFile: function () { return !/presets$/.test(value); }
        };
      },
      readdirSync: function () { return ["Suflo Smooth Editing Pack.prfpset"]; },
      readFileSync: function () { return payload.xml; }
    };
    window.KPresets.loadPackCatalog(true);
  }, { xml: xml });
  await page.waitForFunction(function () { return document.getElementById("preset-count").textContent.indexOf("290") !== -1; });
  await page.waitForTimeout(500);
  var output = path.join(os.tmpdir(), "suflo-presets-native-ui.png");
  await page.screenshot({ path: output });
  var cards = await page.locator("#preset-grid .preset-card").count();
  var count = await page.locator("#preset-count").textContent();
  await page.locator('#preset-filter button[data-f="pack"]').click();
  await page.waitForTimeout(150);
  var packOutput = path.join(os.tmpdir(), "suflo-presets-native-pack-ui.png");
  await page.screenshot({ path: packOutput });
  var fallback = await page.locator("#preset-grid .preset-pack-entry.fallback").count();
  await browser.close();
  if (cards !== 291) throw new Error("Preset kart sayisi hatali: " + cards + " (beklenen 291: 1 ozet + 290 preset)");
  if (fallback !== 8) throw new Error("Uyumluluk kart sayisi hatali: " + fallback + " (beklenen 8)");
  console.log("Preset UI: " + count + " · cards=" + cards + " · fallback=" + fallback + " · " + output + " · " + packOutput);
}()).catch(function (error) {
  console.error(error.stack || error);
  process.exit(1);
});
