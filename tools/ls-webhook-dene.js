#!/usr/bin/env node
/*
 * Lemon Squeezy -> Meta webhook'unu (server/pro-v1/ls-webhook.php) satin alma yapmadan dener.
 *
 *   node tools/ls-webhook-dene.js                 yalniz "hazir mi" diye sorar (sir gerekmez)
 *   $env:SUFLO_LS_WEBHOOK_SECRET = "<sir>"        (PowerShell; sir ekrana yazilmaz)
 *   node tools/ls-webhook-dene.js                 imzali, TEST MODUNDA sahte bir siparis yollar
 *   node tools/ls-webhook-dene.js https://...     baska bir adresi dener
 *
 * Sahte siparis 1,00 TRY'dir ve test_mode isaretlidir: sunucu onu yalniz meta.php'de
 * meta_test_event_code doluyken Meta'ya iletir; olay Events Manager > Test events'te gorunur.
 * Kod bosken yanit "test_mode" olur ve Meta'ya hicbir sey gitmez (imza ve kurulum yine dogrulanir).
 */
"use strict";
var http = require("http"), https = require("https"), crypto = require("crypto");

var adres = process.argv[2] || "https://assets.suflo.app/pro/v1/ls-webhook.php";
var sir = process.env.SUFLO_LS_WEBHOOK_SECRET || "";
var u;
try { u = new URL(adres); } catch (e) { console.error("HATA: gecersiz adres."); process.exit(1); }
var yerel = u.hostname === "localhost" || u.hostname === "127.0.0.1";
if (u.protocol !== "https:" && !yerel) { console.error("HATA: adres HTTPS olmali (sir duz baglantidan imza uretmek icin kullanilmaz)."); process.exit(1); }

function istek(method, govde, basliklar) {
  return new Promise(function (resolve) {
    var b = govde === null ? null : Buffer.from(govde);
    var h = Object.assign({ "Accept": "application/json", "User-Agent": "Suflo-Webhook-Deneme/1.0" }, basliklar || {});
    if (b) { h["Content-Type"] = "application/json"; h["Content-Length"] = b.length; }
    var req = (u.protocol === "https:" ? https : http).request({ method: method, hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search, headers: h }, function (res) {
      var metin = "";
      res.setEncoding("utf8");
      res.on("data", function (d) { if (metin.length < 8192) metin += d; });
      res.on("end", function () { var j = null; try { j = JSON.parse(metin); } catch (e) {} resolve({ status: res.statusCode, json: j, metin: metin }); });
    });
    req.setTimeout(30000, function () { req.destroy(new Error("zaman asimi")); });
    req.on("error", function (e) { resolve({ status: 0, json: null, metin: String(e.message || e) }); });
    if (b) req.write(b);
    req.end();
  });
}

function ornekSiparis() {
  var no = "deneme-" + Date.now();
  return {
    meta: { event_name: "order_created", test_mode: true,
      custom_data: { source: "ls_webhook_dene", event_id: no, ua: "Suflo-Webhook-Deneme/1.0" } },
    data: { type: "orders", id: no, attributes: {
      store_id: 454844, identifier: crypto.randomUUID(), user_name: "Suflo Deneme", user_email: "deneme@suflo.app",
      currency: "TRY", subtotal: 100, discount_total: 0, tax: 0, total: 100, status: "paid", refunded: false,
      first_order_item: { product_id: 1302656, product_name: "Suflo Pro", variant_name: "Default", price: 100, test_mode: true },
      created_at: new Date().toISOString(), test_mode: true } }
  };
}

(async function () {
  console.log("Adres: " + u.origin + u.pathname);
  var g = await istek("GET", null);
  if (g.status !== 200 || !g.json || g.json.service !== "suflo-ls-webhook") {
    console.error("HATA: webhook dosyasi bu adreste yok ya da eski (HTTP " + g.status + "). ls-webhook.php'yi public_html/pro/v1/ icine yukle.");
    process.exit(1);
  }
  console.log("Dosya yerinde. Yapilandirma: " + (g.json.ready ? "HAZIR" : "EKSIK (private/pro-v1/meta.php: meta_capi_enabled, meta_capi_token, ls_webhook_secret)"));
  if (!sir) {
    console.log("Imzali deneme icin SUFLO_LS_WEBHOOK_SECRET ortam degiskenine webhook sirrini yaz ve yeniden calistir.");
    process.exit(g.json.ready ? 0 : 1);
  }
  var govde = JSON.stringify(ornekSiparis());
  var imza = crypto.createHmac("sha256", sir).update(govde).digest("hex");
  var r = await istek("POST", govde, { "X-Event-Name": "order_created", "X-Signature": imza });
  var j = r.json || {};
  if (r.status === 200 && j.sent === true) {
    console.log("TAMAM: Meta olayi kabul etti. Events Manager > Test events'te 1,00 TRY'lik Purchase gorunmeli.");
    console.log("Sonra meta.php'de meta_test_event_code degerini bosalt.");
    process.exit(0);
  }
  if (r.status === 200 && j.reason === "test_mode") {
    console.log("Imza ve kurulum DOGRU; Meta'ya bir sey gonderilmedi cunku meta_test_event_code bos.");
    console.log("Ucdan uca gormek icin Events Manager > Test events'teki kodu meta.php'ye yaz ve yeniden calistir.");
    process.exit(0);
  }
  if (r.status === 401) console.error("HATA: imza reddedildi. Ortam degiskenindeki sir, meta.php'deki ls_webhook_secret ile ayni degil.");
  else if (r.status === 503) console.error("HATA: sunucu yapilandirmasi eksik (private/pro-v1/meta.php: meta_capi_enabled, meta_capi_token, ls_webhook_secret).");
  else if (r.status === 502) console.error("HATA: Meta olayi reddetti (HTTP " + j.meta_http + ", kod " + j.meta_code + "): " + (j.meta_error || "ayrinti yok") + "\nBelirteci ve piksel kimligini kontrol et.");
  else console.error("HATA: beklenmeyen yanit (HTTP " + r.status + "): " + r.metin.slice(0, 300));
  process.exit(1);
})();
