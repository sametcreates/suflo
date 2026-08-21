/* Yayin oncesi private Pro Icerik API saglik kapisi. */
"use strict";
var https = require("https");
var endpoint = process.argv[2] || "https://assets.suflo.app/pro/v1/index.php";
var parsed = new URL(endpoint);
if (parsed.protocol !== "https:") { console.error("HATA: Pro API HTTPS olmali."); process.exit(1); }
var body = Buffer.from(JSON.stringify({ action: "manifest", license_key: "suflo-preflight-invalid", instance_id: "suflo-preflight-invalid" }));
var req = https.request({
  method: "POST", hostname: parsed.hostname, port: parsed.port || 443, path: parsed.pathname + parsed.search,
  headers: { "Accept": "application/json", "Content-Type": "application/json", "Content-Length": body.length, "User-Agent": "Suflo-Release-Preflight/1.0" }
}, function (res) {
  var text = "";
  res.setEncoding("utf8");
  res.on("data", function (chunk) { if (text.length < 4096) text += chunk; });
  res.on("end", function () {
    var data = null;
    try { data = JSON.parse(text); } catch (e) {}
    if (res.statusCode === 403 && data && data.ok === false && /lisans/i.test(String(data.error || ""))) {
      console.log("Pro API hazir: lisans kapisi ve JSON yaniti dogrulandi.");
      process.exit(0);
    }
    console.error("HATA: Pro API yayin icin hazir degil (HTTP " + res.statusCode + "). Once dist/pro-cdn/upload agacini Hostinger'a yukle.");
    process.exit(1);
  });
});
req.setTimeout(15000, function () { req.destroy(new Error("zaman asimi")); });
req.on("error", function (e) { console.error("HATA: Pro API ulasilamiyor: " + e.message); process.exit(1); });
req.write(body);
req.end();
