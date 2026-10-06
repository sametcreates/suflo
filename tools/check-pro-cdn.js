/* Yayin oncesi private Pro Icerik API saglik kapisi. */
"use strict";
var https = require("https");
var endpoint = process.argv[2] || "https://assets.suflo.app/pro/v1/index.php";
var parsed = new URL(endpoint);
if (parsed.protocol !== "https:") { console.error("HATA: Pro API HTTPS olmali."); process.exit(1); }

function post(obj, cb) {
  var body = Buffer.from(JSON.stringify(obj));
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
      cb(null, res.statusCode, data);
    });
  });
  req.setTimeout(15000, function () { req.destroy(new Error("zaman asimi")); });
  req.on("error", function (e) { cb(e); });
  req.write(body);
  req.end();
}

// Davet et, kazan: sahte lisansla 'referral' 403 (acik) ya da 503 (uyuyan) JSON donmeli. 400
// "Bilinmeyen islem" sunucunun eski index.php ile kaldigini gosterir; 3.1 paneli yine calisir
// ama davet karti paylasim baglantisina duser: uyari verir, SUFLO_DAVET_ZORUNLU=1 ile durdurur.
function referralKapisi(sonra) {
  post({ action: "referral", license_key: "suflo-preflight-invalid", instance_id: "suflo-preflight-invalid", client_version: "0.0.0" }, function (err, status, data) {
    if (err) { console.error("HATA: Pro API ulasilamiyor: " + err.message); process.exit(1); }
    if ((status === 403 || status === 503) && data && data.ok === false) {
      console.log("Davet ucu hazir (HTTP " + status + (status === 503 ? ", uyuyan ozellik" : "") + ").");
      sonra();
      return;
    }
    if (status === 429) { console.log("Davet ucu hiz sinirinda (HTTP 429); bir dakika sonra yeniden dene."); process.exit(1); }
    // 400 = sunucuda hala eski (3.0) index.php: lisans ve Pro icerik calisir, panelin davet karti
    // sessizce paylasim baglantisina duser. Yayini durdurmaz; SUFLO_DAVET_ZORUNLU=1 ile zorunlu olur.
    if (status === 400 && process.env.SUFLO_DAVET_ZORUNLU !== "1") {
      console.log("UYARI: Davet ucu yok (HTTP 400, sunucuda eski index.php). Davet karti paylasim baglantisina duser; server/pro-v1/index.php'yi Hostinger'a yukle.");
      sonra();
      return;
    }
    console.error("HATA: Davet ucu beklenen JSON'u vermedi (HTTP " + status + "). Sunucudaki index.php'yi guncelle.");
    process.exit(1);
  });
}

post({ action: "manifest", license_key: "suflo-preflight-invalid", instance_id: "suflo-preflight-invalid" }, function (err, status, data) {
  if (err) { console.error("HATA: Pro API ulasilamiyor: " + err.message); process.exit(1); }
  if (status === 403 && data && data.ok === false && /lisans/i.test(String(data.error || ""))) {
    console.log("Pro API hazir: lisans kapisi ve JSON yaniti dogrulandi.");
    referralKapisi(function () { process.exit(0); });
    return;
  }
  console.error("HATA: Pro API yayin icin hazir degil (HTTP " + status + "). Once dist/pro-cdn/upload agacini Hostinger'a yukle.");
  process.exit(1);
});
