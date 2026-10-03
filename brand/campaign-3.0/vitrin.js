"use strict";
// Site vitrini: karuselin arayuz cizimlerini (baslik/footer olmadan) 2x WebP olarak kirpar.
// Kullanim: node brand/campaign-3.0/vitrin.js   ->  docs/gorseller/v3/*.webp
// Playwright gerekmez: yerel Chrome/Edge'i DevTools protokoluyle surer (Node 22+).
var fs = require("fs");
var path = require("path");
var url = require("url");
var cp = require("child_process");
var os = require("os");

var dir = __dirname;
var out = path.join(dir, "..", "..", "docs", "gorseller", "v3");
var base = url.pathToFileURL(path.join(dir, "carousel.html")).href;

// slayt -> kirpilacak ogeler (birlesik dikdortgen)
var PARCALAR = [
  { ad: "viral-shorts", slayt: 2, sec: [".longvid", ".tap-row", ".phones"] },
  { ad: "kanca-basligi", slayt: 3, sec: [".hook-grid"] },
  { ad: "konusmadan-kes", slayt: 4, sec: [".transcript", ".langs", ".seqdiff"] },
  { ad: "sesi-iyilestir", slayt: 5, sec: [".ab", ".lufs"] },
  { ad: "kelime-vurgusu", slayt: 6, sec: [".emph-demo", ".styles12"] }
];

var chrome = [
  process.env.SUFLO_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/opt/pw-browsers/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
].filter(Boolean).find(function (f) { return fs.existsSync(f); });
if (!chrome) throw new Error("Chrome/Edge bulunamadi (SUFLO_CHROME ile yol ver)");

function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  fs.mkdirSync(out, { recursive: true });
  var port = 9400 + Math.floor(Math.random() * 400);
  var profil = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-vitrin-"));
  var p = cp.spawn(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profil, "about:blank"], { stdio: "ignore" });
  var ws;
  for (var t = 0; t < 60 && !ws; t++) {
    try {
      var liste = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
      var sayfa = liste.find(function (x) { return x.type === "page"; });
      if (sayfa) ws = new WebSocket(sayfa.webSocketDebuggerUrl);
    } catch (e) {}
    if (!ws) await bekle(250);
  }
  await new Promise(function (r) { ws.onopen = r; });
  var id = 0, bekleyen = {};
  ws.onmessage = function (e) { var m = JSON.parse(e.data); if (bekleyen[m.id]) bekleyen[m.id](m.result || m); };
  function gonder(method, params) {
    return new Promise(function (r) { bekleyen[++id] = r; ws.send(JSON.stringify({ id: id, method: method, params: params || {} })); });
  }
  await gonder("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1350, deviceScaleFactor: 2, mobile: false });
  try {
    for (var i = 0; i < PARCALAR.length; i++) {
      var parca = PARCALAR[i];
      await gonder("Page.navigate", { url: base + "?slide=" + parca.slayt });
      await bekle(1200);
      var r = (await gonder("Runtime.evaluate", {
        awaitPromise: true, returnByValue: true,
        expression: "document.fonts.ready.then(function(){var s=document.querySelector('section.slide.active');var x1=1e9,y1=1e9,x2=0,y2=0;" +
          JSON.stringify(parca.sec) + ".forEach(function(q){var e=s.querySelector(q);if(!e)throw new Error('yok: '+q);var b=e.getBoundingClientRect();" +
          "x1=Math.min(x1,b.left);y1=Math.min(y1,b.top);x2=Math.max(x2,b.right);y2=Math.max(y2,b.bottom)});return {x1:x1,y1:y1,x2:x2,y2:y2}})"
      })).result;
      if (!r || !r.value) throw new Error("Olcum basarisiz: " + parca.ad + " " + JSON.stringify(r));
      var b = r.value, pad = 28, padAlt = 12;
      var clip = { x: Math.max(0, b.x1 - pad), y: Math.max(0, b.y1 - pad), scale: 1 };
      clip.width = Math.min(1080, b.x2 + pad) - clip.x;
      clip.height = Math.min(1350, b.y2 + padAlt) - clip.y;
      var shot = await gonder("Page.captureScreenshot", { format: "webp", quality: 86, clip: clip });
      var dosya = path.join(out, parca.ad + ".webp");
      fs.writeFileSync(dosya, Buffer.from(shot.data, "base64"));
      console.log(parca.ad + ".webp", Math.round(clip.width * 2) + "x" + Math.round(clip.height * 2), Math.round(fs.statSync(dosya).size / 1024) + " KB");
    }
  } finally {
    ws.close();
    p.kill();
  }
}()).catch(function (e) { console.error(e); process.exit(1); });
