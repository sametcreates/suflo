/*
 * Lemon Squeezy siparis webhook'u -> Meta Conversions API (server/pro-v1/ls-webhook.php).
 * php -S + Node'da sahte Meta Graph API; gercek Meta'ya ya da Lemon Squeezy'ye hic gidilmez.
 *  - uyuyan ozellik: ayar eksikken POST 503, GET yalniz "hazir mi" der
 *  - imza: X-Signature (ham govdenin HMAC-SHA256 hex ozeti) yoksa / yanlissa 401, Meta'ya gidilmez
 *  - izin isareti (checkout[custom][event_id]) olmayan siparis Meta'ya GONDERILMEZ
 *  - Purchase: tutar (vergi haric), para birimi, event_id, fbc, fbp, tarayici bilgisi, e-postanin
 *    SHA-256 ozeti; duz e-posta ve isim hicbir yere gitmez; belirtec adres satirinda degil govdede
 *  - ayni siparis ikinci kez gonderilmez; Meta reddederse 502 ve yeniden deneme islenir
 *  - test modu siparisi yalniz test kodu tanimliyken gider
 *  - gunlukte ve yanitlarda belirtec, sir, e-posta yok
 * Kaynak denetimleri php olmadan da calisir; php yoksa sunucu bolumu ATLAnir.
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), http = require("http"), crypto = require("crypto"), net = require("net");
var ROOT = path.join(__dirname, "..");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 500) + "]" : "")); }
function bitir() { console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti"); process.exit(kalan ? 1 : 0); }

/* ---------------- kaynak denetimleri (php gerekmez) ---------------- */
var PHP = fs.readFileSync(path.join(ROOT, "server", "pro-v1", "ls-webhook.php"), "utf8");
var ORNEK = fs.readFileSync(path.join(ROOT, "server", "pro-v1", "config.example.php"), "utf8");
ok("ornek config: ozellik kapali, belirtec / sir / test kodu bos", /'meta_capi_enabled' => false/.test(ORNEK) && /'meta_capi_token' => ''/.test(ORNEK) &&
  /'ls_webhook_secret' => ''/.test(ORNEK) && /'meta_test_event_code' => ''/.test(ORNEK) && /'meta_pixel_id' => '1084974704080878'/.test(ORNEK) &&
  /'meta_log_path'/.test(ORNEK) && /'meta_sent_dir'/.test(ORNEK));
ok("ornek config eski anahtarlari da tasir (davet, lisans)", /'ls_api_key' => ''/.test(ORNEK) && /'referral_enabled' => false/.test(ORNEK) && /'davet_dir'/.test(ORNEK) && /'token_secret'/.test(ORNEK));
ok("belirtec ve sir yalniz cfg'den okunur (ortam degiskeni, GET/POST alani yok)", /\$cfg\['meta_capi_token'\]/.test(PHP) && /\$cfg\['ls_webhook_secret'\]/.test(PHP) &&
  !/getenv\(/.test(PHP) && !/\$_(GET|POST|REQUEST|COOKIE|ENV)\b/.test(PHP));
ok("kaynakta gomulu belirtec / sir yok", !/EAA[A-Za-z0-9]{20,}/.test(PHP) && !/EAA[A-Za-z0-9]{20,}/.test(ORNEK) && !/Bearer\s+[A-Za-z0-9_\-]{20,}/.test(PHP));
ok("imza govde cozulmeden once, sabit zamanli karsilastirmayla denetlenir", /hash_hmac\('sha256', \$raw,/.test(PHP) && /hash_equals\(\$beklenen, \$verilen\)/.test(PHP) &&
  PHP.indexOf("hash_equals($beklenen, $verilen)") < PHP.indexOf("json_decode($raw, true)") && PHP.indexOf("hash_equals($beklenen, $verilen)") !== -1);
ok("belirtec adres satirina yazilmaz, istek govdesinde gider", !/\?access_token/.test(PHP) && !/access_token=['"]?\s*\.\s*\$/.test(PHP) && /'access_token' => \$belirtec/.test(PHP));
var gunlukler = PHP.match(/gunluk\(\$gunlukYolu, \[[\s\S]*?\]\);/g) || [];
ok("gunluk satirlari e-posta, belirtec, sir, fbc/fbp degeri tasimaz", gunlukler.length === 3 && gunlukler.every(function (g) {
  return !/email|belirtec|token|secret|\$fbc\b(?! !==)|\$fbp\b(?! !==)|\$ua\b|\$raw/.test(g);
}), gunlukler.join(" || "));
ok("e-posta Meta'ya yalniz SHA-256 ozetiyle gider (baska hicbir yerde kullanilmaz)", /\$user\['em'\] = \[hash\('sha256', \$o\['email'\]\)\]/.test(PHP) &&
  PHP.replace(/\$o\['email'\] !== ''/g, "").replace(/filter_var\(\$o\['email'\], FILTER_VALIDATE_EMAIL\)/g, "").replace(/hash\('sha256', \$o\['email'\]\)/g, "").indexOf("$o['email']") === -1);
var build = fs.readFileSync(path.join(ROOT, "tools", "build-pro-cdn.js"), "utf8");
ok("yukleme agaci ls-webhook.php'yi public_html'e koyar", /copyFileSync\(path\.join\(root, "server", "pro-v1", "ls-webhook\.php"\), path\.join\(publicDir, "ls-webhook\.php"\)\)/.test(build) &&
  /'meta_capi_enabled' => false/.test(build) && /'meta_capi_token' => ''/.test(build) && /'ls_webhook_secret' => ''/.test(build));
var hta = fs.readFileSync(path.join(ROOT, "server", "pro-v1", ".htaccess"), "utf8");
ok(".htaccess webhook dosyasini engellemez, config'i engeller", /\^\(config\|manifest\)\\\.php\$/.test(hta) && !/webhook/.test(hta));
var olcum = fs.readFileSync(path.join(ROOT, "docs", "js", "olcum.js"), "utf8");
ok("site ile sunucu ayni alan adlarini kullanir (event_id, fbc + fbc2, fbp, ua + ua2)", ["event_id", "fbc", "fbc2", "fbp", "ua", "ua2"].every(function (k) {
  return olcum.indexOf(k + "%5D") !== -1 && PHP.indexOf("$o['custom']['" + k + "']") !== -1;
}));
ok("site ile sunucu ayni piksel kimligini kullanir", olcum.indexOf('"1084974704080878"') !== -1 && ORNEK.indexOf("'1084974704080878'") !== -1);

var phpVar = cp.spawnSync("php", ["-v"], { encoding: "utf8" });
if (phpVar.error || phpVar.status !== 0) {
  // GitHub'in Linux kosucusunda php hazir gelir (php isi de ona guvenir): orada sunucu bolumu
  // sessizce atlanamaz, php yoksa test kalir. Baska yerde zorlamak icin LS_WEBHOOK_PHP_ZORUNLU=1.
  var zorunlu = process.env.LS_WEBHOOK_PHP_ZORUNLU === "1" || (process.env.GITHUB_ACTIONS === "true" && process.platform === "linux");
  if (zorunlu) ok("php bulundu (sunucu bolumu zorunlu)", false, phpVar.error || phpVar.stderr);
  else console.log("ATLA php bulunamadi: sunucu bolumu calismadi (CI'da Linux kosucusunda calisir)");
  bitir();
}

["server/pro-v1/ls-webhook.php", "server/pro-v1/config.example.php"].forEach(function (f) {
  var r = cp.spawnSync("php", ["-l", path.join(ROOT, f)], { encoding: "utf8" });
  ok("php -l " + f, r.status === 0, r.stdout + r.stderr);
});

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ls-webhook-"));
var PUB = path.join(TMP, "public_html", "pro", "v1"), PRIV = path.join(TMP, "private", "pro-v1");
fs.mkdirSync(PUB, { recursive: true });
fs.mkdirSync(PRIV, { recursive: true });
fs.copyFileSync(path.join(ROOT, "server", "pro-v1", "ls-webhook.php"), path.join(PUB, "ls-webhook.php"));

var TOKEN = "EAATESTtoken0123456789abcdefghijklmnopqrstuvwxyzABCDEF";
var SIR = "test-webhook-sirri-0123456789abcdef";
var PIKSEL = "1084974704080878";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
var FBC = "fb.1.1795000000000.IwY2xjawN1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-AbC";
var FBP = "fb.1.1794999999000.1234567890";
var EPOSTA = "Ada.Yildiz@Example.COM", EPOSTA_OZET = crypto.createHash("sha256").update("ada.yildiz@example.com").digest("hex");

/* ---------------- sahte Meta Graph API ---------------- */
var meta = { istekler: [], mod: "ok" };
var metaPort = 0;
var metaSunucu = http.createServer(function (req, res) {
  var govde = "";
  req.on("data", function (d) { govde += d; });
  req.on("end", function () {
    var u = new URL(req.url, "http://127.0.0.1");
    var kayit = { method: req.method, yol: u.pathname, sorgu: u.search, basliklar: req.headers, ham: govde, alanlar: {}, data: null };
    new URLSearchParams(govde).forEach(function (v, k) { kayit.alanlar[k] = v; });
    try { kayit.data = JSON.parse(kayit.alanlar.data); } catch (e) { kayit.data = null; }
    meta.istekler.push(kayit);
    res.setHeader("Content-Type", "application/json; charset=UTF-8");
    if (meta.mod === "hata") {
      res.writeHead(400);
      res.end(JSON.stringify({ error: { message: "Invalid OAuth access token - Cannot parse " + TOKEN, type: "OAuthException", code: 190, fbtrace_id: "TRACEHATA" } }));
      return;
    }
    if (meta.mod === "bos") { res.writeHead(200); res.end(JSON.stringify({ events_received: 0, messages: [], fbtrace_id: "TRACEBOS" })); return; }
    if (meta.mod === "500") { res.writeHead(500); res.end("upstream"); return; }
    res.writeHead(200);
    res.end(JSON.stringify({ events_received: 1, messages: [], fbtrace_id: "TRACE" + meta.istekler.length }));
  });
});

/* ---------------- php -S ---------------- */
function bosPort() {
  return new Promise(function (resolve) {
    var s = net.createServer();
    s.listen(0, "127.0.0.1", function () { var p = s.address().port; s.close(function () { resolve(p); }); });
  });
}
var phpPort = 0, phpSurec = null;
function config(ek) {
  var c = {
    token_secret: "a".repeat(64), store_id: 454844, product_id: 1302656,
    meta_capi_enabled: true, meta_pixel_id: PIKSEL, meta_capi_token: TOKEN, ls_webhook_secret: SIR, meta_test_event_code: "",
    meta_api_version: "v27.0", meta_api_base: "http://127.0.0.1:" + metaPort, meta_event_source_url: "https://suflo.app/",
    meta_log_path: path.join(PRIV, "meta-webhook.log"), meta_sent_dir: path.join(PRIV, "meta-sent")
  };
  Object.keys(ek || {}).forEach(function (k) { if (ek[k] === undefined) delete c[k]; else c[k] = ek[k]; });
  function phpDeger(v) {
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    return "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  }
  fs.writeFileSync(path.join(PRIV, "config.php"), "<?php\nreturn [\n" + Object.keys(c).map(function (k) { return "    '" + k + "' => " + phpDeger(c[k]); }).join(",\n") + "\n];\n");
}
function imza(govde, sir) { return crypto.createHmac("sha256", sir === undefined ? SIR : sir).update(govde).digest("hex"); }
var yanitlar = [];
function istek(method, govde, basliklar) {
  return new Promise(function (resolve) {
    var b = govde === null || govde === undefined ? null : Buffer.from(govde);
    var h = Object.assign({}, basliklar || {});
    if (b) { h["Content-Type"] = "application/json"; h["Content-Length"] = b.length; }
    var req = http.request({ method: method, hostname: "127.0.0.1", port: phpPort, path: "/pro/v1/ls-webhook.php", headers: h }, function (res) {
      var parca = [];
      res.on("data", function (d) { parca.push(d); });
      res.on("end", function () {
        var metin = Buffer.concat(parca).toString("utf8"), j = null;
        try { j = JSON.parse(metin); } catch (e) {}
        yanitlar.push(metin);
        resolve({ status: res.statusCode, json: j, metin: metin });
      });
    });
    req.on("error", function (e) { resolve({ status: 0, json: null, metin: String(e) }); });
    if (b) req.write(b);
    req.end();
  });
}
// Lemon Squeezy'nin yolladigi gibi: imzali ham govde
function gonder(payload, sec) {
  var govde = typeof payload === "string" ? payload : JSON.stringify(payload);
  var h = { "X-Event-Name": "order_created" };
  if (!sec || sec.imza !== null) h["X-Signature"] = sec && sec.imza !== undefined ? sec.imza : imza(govde);
  return istek("POST", govde, h);
}
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function phpHazir() {
  for (var i = 0; i < 80; i++) {
    var r = await istek("GET", null);
    if (r.status) return true;
    await bekle(100);
  }
  return false;
}
var siparisNo = 4012000;
function siparis(degistir) {
  siparisNo++;
  var o = {
    meta: { event_name: "order_created", test_mode: false, webhook_id: "b1a7b2c3-0000-4000-8000-000000000001",
      custom_data: { source: "suflo_website", feature: "pricing", app_version: "3.5.1", event_id: "0b9a7c1e-5d2f-4e8a-9c3b-" + ("000000000000" + siparisNo).slice(-12), fbc: FBC, fbp: FBP, ua: UA } },
    data: { type: "orders", id: String(siparisNo), attributes: {
      store_id: 454844, customer_id: 990001, identifier: "104e18a2-d755-4d4b-80c4-a6c1dcbe1c10", order_number: 77,
      user_name: "Ada Yildiz", user_email: "  " + EPOSTA + " ", currency: "TRY", currency_rate: "0.02420000",
      subtotal: 74900, discount_total: 0, tax: 14980, total: 89880, subtotal_usd: 1812, discount_total_usd: 0, tax_usd: 362, total_usd: 2174,
      tax_name: "KDV", tax_rate: "20.00", tax_inclusive: false, status: "paid", status_formatted: "Paid", refunded: false, refunded_at: null,
      first_order_item: { id: 5550001, order_id: siparisNo, product_id: 1302656, variant_id: 2045678, product_name: "Suflo Pro", variant_name: "Default", price: 74900, test_mode: false },
      urls: { receipt: "https://app.lemonsqueezy.com/my-orders/x" },
      created_at: new Date(Date.now() - 20000).toISOString().replace(/\.\d{3}Z$/, ".000000Z"), updated_at: new Date().toISOString(), test_mode: false } }
  };
  if (degistir) degistir(o);
  return o;
}
function gunlukOku() { try { return fs.readFileSync(path.join(PRIV, "meta-webhook.log"), "utf8"); } catch (e) { return ""; } }
function gunlukSatirlari() { return gunlukOku().trim().split("\n").filter(Boolean).map(function (x) { return JSON.parse(x); }); }

async function calis() {
  await new Promise(function (r) { metaSunucu.listen(0, "127.0.0.1", function () { metaPort = metaSunucu.address().port; r(); }); });
  phpPort = await bosPort();
  phpSurec = cp.spawn("php", ["-S", "127.0.0.1:" + phpPort, "-t", path.join(TMP, "public_html")], { stdio: "ignore" });
  ok("php -S ayaga kalkti", await phpHazir());

  /* ---------- uyuyan ozellik ---------- */
  var s0 = siparis();
  var g0 = await istek("GET", null);
  ok("config yokken GET: 200, ready false", g0.status === 200 && g0.json && g0.json.ok === true && g0.json.ready === false && g0.json.service === "suflo-ls-webhook", g0.metin);
  var p0 = await gonder(s0);
  ok("config yokken POST 503", p0.status === 503 && p0.json && p0.json.ok === false, p0.metin);
  config({ meta_capi_enabled: false });
  ok("ozellik kapaliyken POST 503, GET ready false", (await gonder(s0)).status === 503 && (await istek("GET", null)).json.ready === false);
  config({ meta_capi_token: "" });
  ok("belirtec bosken 503", (await gonder(s0)).status === 503);
  config({ ls_webhook_secret: "kisa" });
  ok("sir 16 karakterden kisayken 503 (imza kisa sirla bile gecerli olsa)", (await gonder(JSON.stringify(s0), { imza: imza(JSON.stringify(s0), "kisa") })).status === 503);
  config({ meta_pixel_id: "abc" });
  ok("piksel kimligi rakam degilse 503", (await gonder(s0)).status === 503);
  ok("uyurken Meta'ya hic gidilmez", meta.istekler.length === 0);

  /* ---------- acik: yontem ve imza ---------- */
  config({});
  var g1 = await istek("GET", null);
  ok("ayar tamken GET ready true, gizli bilgi yok", g1.status === 200 && g1.json.ready === true && g1.metin.indexOf(TOKEN) === -1 && g1.metin.indexOf(SIR) === -1 && Object.keys(g1.json).sort().join(",") === "ok,ready,service", g1.metin);
  ok("PUT 405", (await istek("PUT", "{}")).status === 405);
  var ham = JSON.stringify(siparis());
  ok("imzasiz istek 401", (await gonder(ham, { imza: null })).status === 401);
  ok("yanlis sirla imza 401", (await gonder(ham, { imza: imza(ham, "baska-bir-sir-0123456789abcdef") })).status === 401);
  ok("baska govdenin imzasi 401", (await gonder(ham, { imza: imza(ham + " ") })).status === 401);
  ok("bos / bicimsiz imza 401", (await gonder(ham, { imza: "" })).status === 401 && (await gonder(ham, { imza: "sha256=" + imza(ham) })).status === 401);
  ok("imza gecersizken Meta'ya gidilmez, gunluk yazilmaz", meta.istekler.length === 0 && gunlukOku() === "");
  ok("gecerli imza, JSON degil: 400", (await gonder("merhaba")).status === 400);
  var buyuk = JSON.stringify({ meta: { event_name: "order_created" }, dolgu: "x".repeat(300000) });
  ok("cok buyuk govde 413", (await gonder(buyuk)).status === 413);
  var bosGovde = await istek("POST", "", { "X-Signature": imza("") });
  ok("bos govde 400", bosGovde.status === 400, bosGovde.metin);

  /* ---------- islenmeyen olaylar ---------- */
  var abonelik = await gonder({ meta: { event_name: "subscription_created", custom_data: { event_id: "abcdefgh-1234" } }, data: { type: "subscriptions", id: "1", attributes: {} } });
  ok("baska olay: 200, islenmez", abonelik.status === 200 && abonelik.json.sent === false && abonelik.json.reason === "event_ignored", abonelik.metin);
  var iade = await gonder({ meta: { event_name: "order_refunded", custom_data: { event_id: "abcdefgh-1234" } }, data: { type: "orders", id: "9", attributes: { status: "refunded" } } });
  ok("order_refunded islenmez", iade.status === 200 && iade.json.reason === "event_ignored");
  var bicimsiz = await gonder({ meta: { event_name: "order_created" }, data: { type: "subscriptions", id: "1" } });
  ok("siparis olmayan order_created: 200 not_an_order", bicimsiz.status === 200 && bicimsiz.json.reason === "not_an_order", bicimsiz.metin);
  var diziAlan = await gonder({ meta: { event_name: ["order_created"] }, data: [] });
  ok("dizi tipli alanlar hata vermez", diziAlan.status === 200 && diziAlan.json && diziAlan.json.sent === false, diziAlan.metin);

  /* ---------- izin isareti ---------- */
  var izinsiz = await gonder(siparis(function (o) { delete o.meta.custom_data.event_id; }));
  ok("event_id yok (izin verilmedi / panelden alindi): 200, Meta'ya GONDERILMEZ", izinsiz.status === 200 && izinsiz.json.sent === false && izinsiz.json.reason === "no_consent" && meta.istekler.length === 0, izinsiz.metin);
  var ozelsiz = await gonder(siparis(function (o) { delete o.meta.custom_data; }));
  ok("custom_data hic yoksa da gonderilmez", ozelsiz.json.reason === "no_consent" && meta.istekler.length === 0);
  var kotuKimlik = await gonder(siparis(function (o) { o.meta.custom_data.event_id = "<script>alert(1)</script>"; }));
  var kisaKimlik = await gonder(siparis(function (o) { o.meta.custom_data.event_id = "abc"; }));
  var diziKimlik = await gonder(siparis(function (o) { o.meta.custom_data.event_id = ["0b9a7c1e-5d2f-4e8a"]; }));
  ok("bicimsiz event_id izin sayilmaz", kotuKimlik.json.reason === "no_consent" && kisaKimlik.json.reason === "no_consent" && diziKimlik.json.reason === "no_consent" && meta.istekler.length === 0);

  /* ---------- Purchase ---------- */
  var s1 = siparis();
  var olusma = Math.floor(Date.parse(s1.data.attributes.created_at) / 1000);
  var r1 = await gonder(s1);
  ok("izinli, odenmis siparis: 200 sent", r1.status === 200 && r1.json.ok === true && r1.json.sent === true && r1.json.test === false, r1.metin);
  var m1 = meta.istekler[0];
  ok("Meta'ya tek POST: /v27.0/<piksel>/events", meta.istekler.length === 1 && m1.method === "POST" && m1.yol === "/v27.0/" + PIKSEL + "/events", m1 && m1.method + " " + m1.yol);
  ok("belirtec adres satirinda degil, govdede; form olarak gider", m1.sorgu === "" && m1.alanlar.access_token === TOKEN && /application\/x-www-form-urlencoded/.test(m1.basliklar["content-type"]) &&
    Object.keys(m1.alanlar).sort().join(",") === "access_token,data", m1.sorgu + " " + Object.keys(m1.alanlar).join(","));
  var e1 = m1.data && m1.data[0];
  ok("olay: Purchase, website, event_id siteden gelen kimlik", Array.isArray(m1.data) && m1.data.length === 1 && e1.event_name === "Purchase" && e1.action_source === "website" &&
    e1.event_id === s1.meta.custom_data.event_id && e1.event_source_url === "https://suflo.app/", JSON.stringify(e1));
  ok("event_time siparisin olusma ani (saniye)", Math.abs(e1.event_time - olusma) <= 1, e1.event_time + " / " + olusma);
  ok("deger vergi haric 749 TRY, siparis numarasi ve urun", e1.custom_data.value === 749 && e1.custom_data.currency === "TRY" && e1.custom_data.order_id === s1.data.id &&
    JSON.stringify(e1.custom_data.content_ids) === '["suflo-pro"]' && e1.custom_data.content_type === "product" && e1.custom_data.content_name === "Suflo Pro" && e1.custom_data.num_items === 1, JSON.stringify(e1.custom_data));
  ok("user_data: e-posta SHA-256 (kirpilmis, kucuk harf), fbc, fbp, tarayici", JSON.stringify(e1.user_data.em) === JSON.stringify([EPOSTA_OZET]) && e1.user_data.fbc === FBC &&
    e1.user_data.fbp === FBP && e1.user_data.client_user_agent === UA && Object.keys(e1.user_data).sort().join(",") === "client_user_agent,em,fbc,fbp", JSON.stringify(e1.user_data));
  ok("duz e-posta, isim ve siparis kimligi (UUID) Meta'ya gitmez", m1.ham.toLowerCase().indexOf("ada.yildiz") === -1 && m1.ham.toLowerCase().indexOf("example.com") === -1 &&
    decodeURIComponent(m1.ham).indexOf("Ada Yildiz") === -1 && decodeURIComponent(m1.ham).indexOf("104e18a2") === -1);
  ok("fbc buyuk/kucuk harfi degismeden gider", e1.user_data.fbc.indexOf("IwY2xjawN1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-AbC") !== -1);

  /* ---------- tekrar ---------- */
  var r1b = await gonder(s1);
  ok("ayni siparis yeniden gelirse (yeniden deneme / elle gonderim): 200 duplicate, Meta'ya ikinci kez gitmez", r1b.status === 200 && r1b.json.sent === false && r1b.json.reason === "duplicate" && meta.istekler.length === 1, r1b.metin);
  var isaretler = fs.readdirSync(path.join(PRIV, "meta-sent"));
  ok("gonderildi isareti: siparis numarasinin SHA-256'si, icinde siparis verisi yok", isaretler.length === 1 &&
    isaretler[0] === crypto.createHash("sha256").update(s1.data.id).digest("hex") + ".json" && Object.keys(JSON.parse(fs.readFileSync(path.join(PRIV, "meta-sent", isaretler[0]), "utf8"))).join(",") === "t");

  /* ---------- tutar ---------- */
  var once = meta.istekler.length;
  await gonder(siparis(function (o) { var a = o.data.attributes; a.discount_total = 11235; a.tax = 12733; a.total = 76398; o.meta.custom_data.discount = "x"; }));
  ok("indirimli siparis: deger = toplam - vergi = 636.65", meta.istekler.length === once + 1 && meta.istekler[once].data[0].custom_data.value === 636.65, JSON.stringify(meta.istekler[once] && meta.istekler[once].data));
  once = meta.istekler.length;
  await gonder(siparis(function (o) { var a = o.data.attributes; a.tax_inclusive = true; a.currency = "usd"; a.subtotal = 1900; a.tax = 317; a.total = 1900; a.first_order_item.product_name = ""; }));
  ok("vergi dahil fiyat + USD: deger 15.83, para birimi buyuk harf, urun adi yoksa Suflo Pro", meta.istekler[once].data[0].custom_data.value === 15.83 && meta.istekler[once].data[0].custom_data.currency === "USD" &&
    meta.istekler[once].data[0].custom_data.content_name === "Suflo Pro", JSON.stringify(meta.istekler[once].data[0].custom_data));
  once = meta.istekler.length;
  var bedava = await gonder(siparis(function (o) { var a = o.data.attributes; a.discount_total = 74900; a.tax = 0; a.total = 0; }));
  var paraYok = await gonder(siparis(function (o) { o.data.attributes.currency = "TL1"; }));
  ok("bedelsiz ya da para birimi bozuk siparis gonderilmez", bedava.json.reason === "no_value" && paraYok.json.reason === "no_value" && meta.istekler.length === once);
  var bekleyen = await gonder(siparis(function (o) { o.data.attributes.status = "pending"; }));
  var iadeli = await gonder(siparis(function (o) { o.data.attributes.refunded = true; }));
  ok("odenmemis ya da iade edilmis siparis gonderilmez", bekleyen.json.reason === "not_paid" && iadeli.json.reason === "refunded" && meta.istekler.length === once);

  /* ---------- siteden gelen alanlarin temizligi ---------- */
  once = meta.istekler.length;
  await gonder(siparis(function (o) { var c = o.meta.custom_data; c.fbc = "fb.1.1795000000000.<script>"; c.fbp = "fb.1.abc.def"; c.ua = "Mozilla/5.0\r\nX-Evil: 1\u0000 (test) ç"; o.data.attributes.user_email = "eposta-degil"; }));
  var ek = meta.istekler[once].data[0];
  ok("bicimsiz fbc / fbp atilir, satir sonu ve denetim karakteri tarayici bilgisinden ayiklanir, gecersiz e-posta ozetlenmez", !("fbc" in ek.user_data) && !("fbp" in ek.user_data) &&
    !("em" in ek.user_data) && ek.user_data.client_user_agent === "Mozilla/5.0X-Evil: 1 (test)", JSON.stringify(ek.user_data));
  once = meta.istekler.length;
  var bilgisiz = await gonder(siparis(function (o) { var c = o.meta.custom_data; delete c.fbc; delete c.ua; c.fbp = ["x"]; o.data.attributes.user_email = ""; }));
  ok("eslestirilecek hicbir bilgi yoksa (e-posta, fbc, fbp, tarayici) gonderilmez", bilgisiz.status === 200 && bilgisiz.json.reason === "no_user_data" && meta.istekler.length === once, bilgisiz.metin);
  await gonder(siparis(function (o) { var c = o.meta.custom_data; delete c.fbc; delete c.fbp; delete c.ua; }));
  ok("yalniz e-posta varsa olay e-posta ozetiyle gider", meta.istekler.length === once + 1 && Object.keys(meta.istekler[once].data[0].user_data).join(",") === "em", JSON.stringify(meta.istekler[once] && meta.istekler[once].data[0].user_data));
  // Lemon Squeezy 255 karakterden uzun ozel alani reddeder: site uzun degeri iki parcaya boler
  once = meta.istekler.length;
  var uzunFbc = "fb.1.1795000000000." + "Kq_-".repeat(75), uzunUa = UA + " " + "M".repeat(250);
  await gonder(siparis(function (o) { var c = o.meta.custom_data; c.fbc = uzunFbc.slice(0, 250); c.fbc2 = uzunFbc.slice(250); c.ua = uzunUa.slice(0, 250); c.ua2 = uzunUa.slice(250); }));
  ok("iki parcaya bolunmus fbc ve tarayici bilgisi birlestirilerek gider", meta.istekler.length === once + 1 && uzunFbc.length > 255 && meta.istekler[once].data[0].user_data.fbc === uzunFbc &&
    meta.istekler[once].data[0].user_data.client_user_agent === uzunUa, JSON.stringify(meta.istekler[once] && meta.istekler[once].data[0].user_data));
  once = meta.istekler.length;
  await gonder(siparis(function (o) { var c = o.meta.custom_data; c.fbc2 = "<x>"; }));
  await gonder(siparis(function (o) { var c = o.meta.custom_data; c.fbc = "fb.1.1795000000000." + "K".repeat(231); c.fbc2 = "L".repeat(250); }));
  ok("ikinci parca bicimi bozarsa ya da toplam cok uzunsa fbc atilir", meta.istekler.length === once + 2 && !("fbc" in meta.istekler[once].data[0].user_data) && !("fbc" in meta.istekler[once + 1].data[0].user_data),
    JSON.stringify([meta.istekler[once].data[0].user_data.fbc, meta.istekler[once + 1].data[0].user_data.fbc]));
  once = meta.istekler.length;
  await gonder(siparis(function (o) { o.meta.custom_data.ua = "A".repeat(2000); }));
  ok("tarayici bilgisi 512 karakterle sinirli", meta.istekler[once].data[0].user_data.client_user_agent.length === 512);

  /* ---------- zaman ---------- */
  once = meta.istekler.length;
  await gonder(siparis(function (o) { o.data.attributes.created_at = new Date(Date.now() - 10 * 86400000).toISOString(); }));
  await gonder(siparis(function (o) { o.data.attributes.created_at = new Date(Date.now() + 3600000).toISOString(); }));
  await gonder(siparis(function (o) { o.data.attributes.created_at = "tarih degil"; }));
  var simdi = Math.floor(Date.now() / 1000);
  ok("7 gunden eski, gelecekteki ya da okunamayan zaman simdiye cekilir (Meta eski olayi reddeder)", meta.istekler.length === once + 3 &&
    meta.istekler.slice(once).every(function (m) { return Math.abs(m.data[0].event_time - simdi) <= 30; }), meta.istekler.slice(once).map(function (m) { return m.data[0].event_time - simdi; }).join(","));

  /* ---------- test modu ---------- */
  once = meta.istekler.length;
  var t1 = await gonder(siparis(function (o) { o.data.attributes.test_mode = true; }));
  var t2 = await gonder(siparis(function (o) { o.meta.test_mode = true; }));
  ok("test modu siparisi, test kodu yokken gonderilmez", t1.json.reason === "test_mode" && t2.json.reason === "test_mode" && meta.istekler.length === once);
  config({ meta_test_event_code: "TEST12345" });
  var t3 = await gonder(siparis(function (o) { o.data.attributes.test_mode = true; }));
  ok("test kodu tanimliyken test siparisi test_event_code ile gider", t3.status === 200 && t3.json.sent === true && t3.json.test === true && meta.istekler.length === once + 1 &&
    meta.istekler[once].alanlar.test_event_code === "TEST12345" && meta.istekler[once].sorgu === "", JSON.stringify(meta.istekler[once] && meta.istekler[once].alanlar));
  await gonder(siparis());
  ok("test kodu tanimliyken gercek siparis de test koduyla gider (Test events'te gorunsun)", meta.istekler[once + 1].alanlar.test_event_code === "TEST12345");
  config({ meta_test_event_code: "bozuk kod <x>" });
  once = meta.istekler.length;
  await gonder(siparis());
  ok("bicimsiz test kodu yok sayilir", meta.istekler.length === once + 1 && !("test_event_code" in meta.istekler[once].alanlar));

  /* ---------- surum ve kaynak adresi ---------- */
  config({ meta_api_version: "v25.0", meta_event_source_url: "https://suflo.app/en/" });
  once = meta.istekler.length;
  await gonder(siparis());
  ok("ayardaki API surumu ve kaynak adresi kullanilir", meta.istekler[once].yol === "/v25.0/" + PIKSEL + "/events" && meta.istekler[once].data[0].event_source_url === "https://suflo.app/en/");
  config({ meta_api_version: "../../x", meta_event_source_url: undefined });
  once = meta.istekler.length;
  await gonder(siparis());
  ok("bicimsiz surum v27.0'a, bos kaynak adresi suflo.app'e duser", meta.istekler[once].yol === "/v27.0/" + PIKSEL + "/events" && meta.istekler[once].data[0].event_source_url === "https://suflo.app/");
  config({ meta_log_path: undefined, meta_sent_dir: undefined });
  once = meta.istekler.length;
  var varsayilan = siparis();
  await gonder(varsayilan);
  ok("gunluk ve isaret yolu verilmezse config'in yanina yazilir (private/pro-v1)", meta.istekler.length === once + 1 && fs.existsSync(path.join(PRIV, "meta-webhook.log")) &&
    fs.existsSync(path.join(PRIV, "meta-sent", crypto.createHash("sha256").update(varsayilan.data.id).digest("hex") + ".json")));
  config({});

  /* ---------- Meta reddederse ---------- */
  var s2 = siparis();
  meta.mod = "hata";
  once = meta.istekler.length;
  var h1 = await gonder(s2);
  ok("Meta 400 (gecersiz belirtec): 502, Lemon Squeezy yeniden denesin", h1.status === 502 && h1.json.ok === false && h1.json.sent === false && h1.json.meta_http === 400 && h1.json.meta_code === 190 && meta.istekler.length === once + 1, h1.metin);
  ok("hata iletisinde belirtec yildizlanir", h1.metin.indexOf(TOKEN) === -1 && /Invalid OAuth access token - Cannot parse \*\*\*/.test(h1.json.meta_error), h1.metin);
  meta.mod = "bos";
  var h2 = await gonder(s2);
  ok("Meta 200 ama events_received 0: 502", h2.status === 502 && h2.json.meta_http === 200 && meta.istekler.length === once + 2, h2.metin);
  meta.mod = "500";
  var h3 = await gonder(s2);
  ok("Meta 500: 502", h3.status === 502 && h3.json.meta_http === 500, h3.metin);
  meta.mod = "ok";
  var h4 = await gonder(s2);
  ok("basarisiz gonderim isaret birakmaz: yeniden deneme islenir ve gonderilir", h4.status === 200 && h4.json.sent === true && meta.istekler.length === once + 4, h4.metin);
  ok("basarili yeniden denemeden sonra tekrar gelirse duplicate", (await gonder(s2)).json.reason === "duplicate" && meta.istekler.length === once + 4);
  config({ meta_api_base: "http://127.0.0.1:1" });
  var h5 = await gonder(siparis());
  ok("Meta'ya ulasilamazsa 502", h5.status === 502 && h5.json.meta_http === 0, h5.metin);
  config({});

  /* ---------- gunluk ve sizinti ---------- */
  var satirlar = gunlukSatirlari(), hamGunluk = gunlukOku();
  ok("gunluk: gonderildi / atlandi / basarisiz satirlari, zaman damgali", satirlar.some(function (s) { return s.result === "sent" && s.received === 1 && /^TRACE/.test(s.trace) && s.click_id === true && s.browser_id === true; }) &&
    satirlar.some(function (s) { return s.result === "skipped" && s.reason === "no_consent"; }) && satirlar.some(function (s) { return s.result === "skipped" && s.reason === "duplicate"; }) &&
    satirlar.some(function (s) { return s.result === "failed" && s.http === 400 && s.code === 190; }) && satirlar.every(function (s) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s.t) && typeof s.order === "string"; }),
    hamGunluk.slice(0, 400));
  ok("gunlukte belirtec, sir, e-posta, e-posta ozeti, fbc/fbp, tarayici bilgisi yok", hamGunluk.indexOf(TOKEN) === -1 && hamGunluk.indexOf(SIR) === -1 && hamGunluk.toLowerCase().indexOf("ada.yildiz") === -1 &&
    hamGunluk.indexOf(EPOSTA_OZET) === -1 && hamGunluk.indexOf("IwY2xjawN1") === -1 && hamGunluk.indexOf(FBP) === -1 && hamGunluk.indexOf("Mozilla") === -1 && hamGunluk.indexOf("@") === -1);
  ok("hicbir yanit belirtec, sir, e-posta ya da e-posta ozeti icermez", yanitlar.length > 40 && yanitlar.every(function (m) {
    return m.indexOf(TOKEN) === -1 && m.indexOf(SIR) === -1 && m.toLowerCase().indexOf("ada.yildiz") === -1 && m.indexOf(EPOSTA_OZET) === -1 && m.indexOf(FBC) === -1;
  }));
  ok("Meta'ya giden her istek belirteci govdede tasir, adres satirinda tasimaz", meta.istekler.length > 10 && meta.istekler.every(function (m) { return m.sorgu === "" && m.alanlar.access_token === TOKEN && m.method === "POST"; }));
  ok("Meta'ya giden hicbir istekte duz e-posta yok", meta.istekler.every(function (m) { return decodeURIComponent(m.ham).toLowerCase().indexOf("ada.yildiz") === -1; }));
}

calis().catch(function (e) { ok("kosum hatasiz", false, e && e.stack ? e.stack : e); }).then(function () {
  try { if (phpSurec) phpSurec.kill(); } catch (e) {}
  try { metaSunucu.close(); } catch (e2) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e3) {}
  bitir();
});
