/* Canli Pro manifestini yerel uretim manifestiyle karsilastirir ve ornek
 * dosyalari lisansli API uzerinden son baytina kadar yoklar. Anahtar/token yazdirmaz. */
"use strict";
var fs = require("fs"), path = require("path"), https = require("https");
var root = path.join(__dirname, "..");
var endpoint = process.argv[2] || "https://assets.suflo.app/pro/v1/index.php";
var localManifestPath = path.join(root, "dist", "pro-cdn", "upload", "private", "pro-v1", "manifest.json");
var licensePath = path.join(process.env.APPDATA || "", "Suflo", "pro-license.json");

function fail(msg) { console.error("HATA: " + msg); process.exit(1); }
function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { fail(label + " okunamadi: " + e.message); }
}
function post(body, range) {
  return new Promise(function (resolve, reject) {
    var url = new URL(endpoint), payload = Buffer.from(JSON.stringify(body));
    var headers = { "Accept": "application/json", "Content-Type": "application/json", "Content-Length": payload.length, "User-Agent": "Suflo-Content-Verify/1.0" };
    if (range) headers.Range = range;
    var req = https.request({ method: "POST", hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search, headers: headers }, function (res) {
      var chunks = [], bytes = 0;
      res.on("data", function (chunk) { bytes += chunk.length; if (bytes <= 8 * 1024 * 1024) chunks.push(chunk); });
      res.on("end", function () { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), bytes: bytes }); });
    });
    req.setTimeout(30000, function () { req.destroy(new Error("zaman asimi")); });
    req.on("error", reject); req.write(payload); req.end();
  });
}
function stableManifest(m) {
  return JSON.stringify({
    schema: m.schema, content_version: m.content_version, generated_at: m.generated_at,
    counts: m.counts, total_bytes: m.total_bytes, files: m.files
  });
}

(async function () {
  if (!/^https:\/\//i.test(endpoint)) fail("Endpoint HTTPS olmali.");
  if (!fs.existsSync(localManifestPath)) fail("Yerel Pro manifesti yok.");
  if (!fs.existsSync(licensePath)) fail("Bu bilgisayarda etkin Suflo Pro lisansi yok.");
  var local = readJson(localManifestPath, "Yerel manifest");
  var license = readJson(licensePath, "Yerel lisans");
  if (!license.key || !license.instanceId) fail("Yerel lisans kaydi eksik.");

  var manifestRes = await post({ action: "manifest", license_key: license.key, instance_id: license.instanceId, client_version: "2.8.5" });
  var live;
  try { live = JSON.parse(manifestRes.body.toString("utf8")); } catch (e) { fail("Canli API JSON dondurmedi (HTTP " + manifestRes.status + ")."); }
  if (manifestRes.status !== 200 || !live.ok || !live.token) fail("Canli lisansli manifest alinamadi (HTTP " + manifestRes.status + ").");
  if (stableManifest(live) !== stableManifest(local)) fail("Canli manifest yerel uretim manifestiyle birebir ayni degil.");

  var samples = [];
  function add(item) { if (item && !samples.some(function (x) { return x.path === item.path; })) samples.push(item); }
  add(live.files[0]);
  add(live.files.find(function (f) { return /^sfx\/sametcreates Essentials\//.test(f.path); }));
  add(live.files.find(function (f) { return /^mogrt\/.*SUFLO TEXT - 40/i.test(f.path); }));
  add(live.files[live.files.length - 1]);

  for (var i = 0; i < samples.length; i++) {
    var item = samples[i], start = Math.max(0, Number(item.bytes) - 1);
    var fileRes = await post({ action: "file", token: live.token, path: item.path }, "bytes=" + start + "-");
    if (fileRes.status !== 206 || fileRes.bytes !== 1) fail("Ornek dosya okunamadi: " + item.path + " (HTTP " + fileRes.status + ", " + fileRes.bytes + " bayt)");
  }

  console.log("Canli Pro icerigi dogrulandi: version=" + live.content_version +
    " total=" + live.counts.total + " mogrt=" + live.counts.mogrt + " sfx=" + live.counts.sfx +
    " motionbg=" + live.counts.motionbg + " presets=" + live.counts.presets + " samples=" + samples.length);
})().catch(function (e) { fail(e.message || String(e)); });
