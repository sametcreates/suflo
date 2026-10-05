/*
 * Davet et, kazan sunucusu (server/pro-v1/index.php): php -S + Node'da sahte Lemon Squeezy.
 *  - kapali (uyuyan) ozellik 503, gecersiz lisans 403, ilk cagri JSON:API indirim olusturur,
 *    ikinci cagri ayni kodu yeni POST olmadan dondurur, anahtar degisse de kod degismez
 *  - sayac: iade/odenmemis/kendi e-postasi/tekrar e-posta/14 gunden genc siparisler sayilmaz,
 *    600 sn onbellek ikinci GET'i engeller, links.next yalniz ayni uc noktada izlenir
 *  - 422 yumusak hata, yanitlarda e-posta ve anahtar yok, hiz siniri
 *  - extras: yalniz kademe >= 1 ve istemci >= 3.1.0; files[] ve content_version aynen kalir;
 *    file eylemi ref kademesi olmayan tokenle davet/ yolunu reddeder
 *  - attribution: enum yanit, JSONL'e lisans ozeti
 * php yoksa ATLA (CI'da php isi ayrica php -l calistirir).
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), http = require("http"), crypto = require("crypto"), net = require("net");
var ROOT = path.join(__dirname, "..");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var phpVar = cp.spawnSync("php", ["-v"], { encoding: "utf8" });
if (phpVar.error || phpVar.status !== 0) {
  console.log("ATLA php bulunamadi: sunucu testi calismadi (CI php isi php -l ile sozdizimini denetler)");
  process.exit(0);
}

["server/pro-v1/index.php", "server/pro-v1/config.example.php"].forEach(function (f) {
  var r = cp.spawnSync("php", ["-l", path.join(ROOT, f)], { encoding: "utf8" });
  ok("php -l " + f, r.status === 0, r.stdout + r.stderr);
});
var ornek = fs.readFileSync(path.join(ROOT, "server", "pro-v1", "config.example.php"), "utf8");
ok("ornek config: ls_api_key bos, davet kapali, %15, 50, varyant listesi bos", /'ls_api_key' => ''/.test(ornek) && /'referral_enabled' => false/.test(ornek) &&
  /'referral_percent' => 15/.test(ornek) && /'referral_max' => 50/.test(ornek) && /'referral_variant_ids' => \[\]/.test(ornek) &&
  /'referrals_path'/.test(ornek) && /'davet_dir'/.test(ornek));
var php = fs.readFileSync(path.join(ROOT, "server", "pro-v1", "index.php"), "utf8");
ok("ls_api_key yalniz cfg'den okunur, gunluge yazilmaz", (php.match(/ls_api_key/g) || []).every(function () { return true; }) &&
  /\$cfg\['ls_api_key'\]/.test(php) && !/error_log|syslog|file_put_contents\([^)]*ls_api_key/.test(php) && !/getenv\(/.test(php));

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-ref-srv-"));
var PUB = path.join(TMP, "public_html", "pro", "v1"), PRIV = path.join(TMP, "private", "pro-v1");
fs.mkdirSync(PUB, { recursive: true });
fs.mkdirSync(path.join(PRIV, "content", "mogrt"), { recursive: true });
fs.mkdirSync(path.join(PRIV, "content", "sfx"), { recursive: true });
fs.mkdirSync(path.join(PRIV, "davet", "t1", "sfx"), { recursive: true });
fs.mkdirSync(path.join(PRIV, "davet", "t3", "mogrt"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "server", "pro-v1", "index.php"), path.join(PUB, "index.php"));
function sha(b) { return crypto.createHash("sha256").update(b).digest("hex"); }
var A = Buffer.from("PK\x03\x04-mogrt-A"), W = Buffer.from("RIFF-sfx-w"), X = Buffer.from("RIFF-davet-t1-x"), Y = Buffer.from("PK\x03\x04-davet-t3-y");
fs.writeFileSync(path.join(PRIV, "content", "mogrt", "A.mogrt"), A);
fs.writeFileSync(path.join(PRIV, "content", "sfx", "w.wav"), W);
fs.writeFileSync(path.join(PRIV, "davet", "t1", "sfx", "x.wav"), X);
fs.writeFileSync(path.join(PRIV, "davet", "t3", "mogrt", "y.mogrt"), Y);
var MANIFEST = { schema: 1, content_version: "t.1", counts: { mogrt: 1, sfx: 1, motionbg: 0, presets: 0, total: 2 }, total_bytes: A.length + W.length,
  files: [{ path: "mogrt/A.mogrt", bytes: A.length, sha256: sha(A) }, { path: "sfx/w.wav", bytes: W.length, sha256: sha(W) }] };
fs.writeFileSync(path.join(PRIV, "manifest.json"), JSON.stringify(MANIFEST));
fs.writeFileSync(path.join(PRIV, "davet", "manifest.json"), JSON.stringify({ version: "d.1", files: [
  { path: "davet/t1/sfx/x.wav", bytes: X.length, sha256: sha(X) }, { path: "davet/t3/mogrt/y.mogrt", bytes: Y.length, sha256: sha(Y) }] }));

/* ---------------- sahte Lemon Squeezy ---------------- */
var LS_KEY = "test-ls-key-0123456789";
var LISANSLAR = {
  "LIC-GOOD": { id: 1001, email: "Owner@Example.com" },
  "LIC-TWO": { id: 1002, email: "two@example.com" },
  "LIC-THREE": { id: 1003, email: "three@example.com" }
};
var kayit = { validate: 0, discounts: [], get: [], yetkisiz: 0, baska: [] };
var her422 = {};   // lisans kimligi -> her POST 422
var lsPort = 0, discountId = 7000, ilkIndirim = "";
var GUN = 86400 * 1000;
function gunOnce(n) { return new Date(Date.now() - n * GUN).toISOString(); }
function siparis(id, durum, email, gun, iade) {
  return { type: "orders", id: String(id), attributes: { status: durum, user_email: email, created_at: gunOnce(gun), refunded: !!iade } };
}
function kullanim(id, discount, order) { return { type: "discount-redemptions", id: String(id), attributes: { discount_id: Number(discount), order_id: Number(order) } }; }

var lsSunucu = http.createServer(function (req, res) {
  var govde = "";
  req.on("data", function (d) { govde += d; });
  req.on("end", function () {
    var u = new URL(req.url, "http://127.0.0.1");
    function yaz(kod, obj) { res.writeHead(kod, { "Content-Type": "application/vnd.api+json" }); res.end(JSON.stringify(obj)); }
    if (req.method === "POST" && u.pathname === "/v1/licenses/validate") {
      kayit.validate++;
      var f = new URLSearchParams(govde);
      var l = LISANSLAR[f.get("license_key")];
      if (!l || !f.get("instance_id")) { yaz(404, { valid: false, error: "license_key not found" }); return; }
      yaz(200, { valid: true, error: null, license_key: { id: l.id, status: "active", key: f.get("license_key") },
        instance: { id: f.get("instance_id") }, meta: { store_id: 454844, product_id: 1302656, variant_id: 1, customer_email: l.email } });
      return;
    }
    if (req.headers.authorization !== "Bearer " + LS_KEY) { kayit.yetkisiz++; yaz(401, { errors: [{ detail: "Unauthenticated." }] }); return; }
    if (req.method === "POST" && u.pathname === "/v1/discounts") {
      var j = null;
      try { j = JSON.parse(govde); } catch (e) {}
      kayit.discounts.push({ body: j, headers: req.headers });
      var code = j && j.data && j.data.attributes && j.data.attributes.code;
      var adiyla = j && j.data && j.data.attributes && j.data.attributes.name;
      if (her422.aktif) { yaz(422, { errors: [{ detail: "The code has already been taken.", source: { pointer: "/data/attributes/code" } }] }); return; }
      var id = String(++discountId);
      if (!ilkIndirim) ilkIndirim = id;
      yaz(201, { data: { type: "discounts", id: id, attributes: { code: code, name: adiyla } } });
      return;
    }
    if (req.method === "GET" && u.pathname === "/v1/discount-redemptions") {
      kayit.get.push(req.url);
      var did = u.searchParams.get("filter[discount_id]");
      var sayfa = u.searchParams.get("page[number]") || "1";
      var base = "http://127.0.0.1:" + lsPort;
      if (did !== ilkIndirim) { yaz(200, { data: [], included: [], links: {} }); return; }
      if (sayfa === "1") {
        yaz(200, {
          data: [kullanim(1, did, 11), kullanim(2, did, 12), kullanim(3, did, 13), kullanim(4, did, 14), kullanim(5, did, 15), kullanim(6, did, 16), kullanim(7, did, 17),
            kullanim(8, "9999", 18)],
          included: [siparis(11, "paid", "a@x.com", 20), siparis(12, "paid", "A@X.COM", 30), siparis(13, "refunded", "r@x.com", 40),
            siparis(14, "paid", "iade@x.com", 40, true), siparis(15, "pending", "p@x.com", 40), siparis(16, "paid", "owner@example.com", 40),
            siparis(17, "paid", "genc@x.com", 3), siparis(18, "paid", "baska@x.com", 40)],
          links: { next: base + "/v1/discount-redemptions?filter%5Bdiscount_id%5D=" + did + "&include=order&page%5Bsize%5D=100&page%5Bnumber%5D=2" }
        });
        return;
      }
      // 2. sayfanin "next"i baska bir uc noktaya gider: izlenmemeli
      yaz(200, { data: [kullanim(9, did, 19)], included: [siparis(19, "paid", "b@y.com", 15)], links: { next: base + "/v1/orders?steal=1" } });
      return;
    }
    kayit.baska.push(req.method + " " + req.url);
    yaz(404, { errors: [{ detail: "not found" }] });
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
    token_secret: "a".repeat(64), token_ttl: 7200, require_instance: false, file_rate_per_min: 600,
    store_id: 454844, product_id: 1302656, variant_id: 0,
    content_root: path.join(PRIV, "content"), manifest_path: path.join(PRIV, "manifest.json"),
    ls_api_base: "http://127.0.0.1:" + lsPort, ls_api_key: LS_KEY, referral_enabled: true, referral_percent: 15, referral_max: 50,
    referral_variant_ids: [111, 222], referrals_path: path.join(PRIV, "referrals.json"), attribution_path: path.join(PRIV, "attribution.jsonl"),
    davet_dir: path.join(PRIV, "davet")
  };
  Object.keys(ek || {}).forEach(function (k) { c[k] = ek[k]; });
  function phpDeger(v) {
    if (Array.isArray(v)) return "[" + v.map(phpDeger).join(", ") + "]";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "number") return String(v);
    return "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  }
  fs.writeFileSync(path.join(PRIV, "config.php"), "<?php\nreturn [\n" + Object.keys(c).map(function (k) { return "    '" + k + "' => " + phpDeger(c[k]); }).join(",\n") + "\n];\n");
}
function hizSifirla() { try { fs.rmSync(path.join(PRIV, "rate-limit"), { recursive: true, force: true }); } catch (e) {} }

function istek(govde, ham) {
  return new Promise(function (resolve) {
    var b = Buffer.from(JSON.stringify(govde));
    var req = http.request({ method: "POST", hostname: "127.0.0.1", port: phpPort, path: "/pro/v1/index.php",
      headers: { "Content-Type": "application/json", "Content-Length": b.length } }, function (res) {
      var parca = [];
      res.on("data", function (d) { parca.push(d); });
      res.on("end", function () {
        var buf = Buffer.concat(parca), j = null;
        if (!ham) { try { j = JSON.parse(buf.toString("utf8")); } catch (e) {} }
        resolve({ status: res.statusCode, json: j, body: buf, metin: buf.toString("utf8") });
      });
    });
    req.on("error", function (e) { resolve({ status: 0, json: null, body: Buffer.alloc(0), metin: String(e) }); });
    req.write(b); req.end();
  });
}
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function phpHazir() {
  for (var i = 0; i < 60; i++) {
    var r = await istek({ action: "yok" });
    if (r.status) return true;
    await bekle(100);
  }
  return false;
}
var yanitlar = [];
async function ist(govde, ham) { var r = await istek(govde, ham); if (!ham) yanitlar.push(r.metin); return r; }
function refOku() { try { return JSON.parse(fs.readFileSync(path.join(PRIV, "referrals.json"), "utf8")); } catch (e) { return null; } }
function refYaz(d) { fs.writeFileSync(path.join(PRIV, "referrals.json"), JSON.stringify(d)); }

async function calis() {
  await new Promise(function (r) { lsSunucu.listen(0, "127.0.0.1", function () { lsPort = lsSunucu.address().port; r(); }); });
  phpPort = await bosPort();
  config({ referral_enabled: false });
  phpSurec = cp.spawn("php", ["-S", "127.0.0.1:" + phpPort, "-t", path.join(TMP, "public_html")], { stdio: "ignore" });
  ok("php -S ayaga kalkti", await phpHazir());

  var L = { license_key: "LIC-GOOD", instance_id: "inst-1", client_version: "3.1.0" };
  function ref(lic, ek) { var o = { action: "referral", license_key: lic, instance_id: "inst-1", client_version: "3.1.0" }; Object.keys(ek || {}).forEach(function (k) { o[k] = ek[k]; }); return o; }

  /* ---------- uyuyan ozellik ---------- */
  var k1 = await ist(ref("LIC-GOOD"));
  ok("kapali: 503 JSON, reason referral_disabled", k1.status === 503 && k1.json && k1.json.ok === false && k1.json.reason === "referral_disabled", k1.metin);
  ok("kapaliyken Lemon Squeezy'ye hic gidilmez", kayit.validate === 0 && kayit.discounts.length === 0);
  config({ ls_api_key: "" });
  var k2 = await ist(ref("LIC-GOOD"));
  ok("anahtar bossa 503", k2.status === 503 && k2.json.reason === "referral_disabled");
  config({ referral_variant_ids: [] });
  var k3 = await ist(ref("LIC-GOOD"));
  ok("varyant listesi bossa 503", k3.status === 503 && k3.json.reason === "referral_disabled");
  var eski = await ist({ action: "referral_xyz", license_key: "LIC-GOOD" });
  ok("bilinmeyen islem hala 400", eski.status === 400);

  /* ---------- acik ---------- */
  config({});
  hizSifirla();
  var g = await ist(ref("LIC-YOK"));
  ok("gecersiz lisans 403 JSON", g.status === 403 && g.json && g.json.ok === false, g.metin);
  var r1 = await ist(ref("LIC-GOOD"));
  ok("ilk cagri: kod, sayi, kademe, paylasim adresi", r1.status === 200 && r1.json.ok === true && /^SFL[A-Z2-7]{6}$/.test(r1.json.code) &&
    r1.json.share_url === "https://suflo.app/?d=" + r1.json.code && r1.json.percent === 15, r1.metin);
  var p1 = kayit.discounts[0];
  var at = p1 && p1.body && p1.body.data && p1.body.data.attributes, rel = p1 && p1.body && p1.body.data && p1.body.data.relationships;
  ok("ilk cagri JSON:API indirim POST'u: Bearer, vnd.api+json", kayit.discounts.length === 1 && p1.headers.authorization === "Bearer " + LS_KEY &&
    /application\/vnd\.api\+json/.test(p1.headers["content-type"]) && /application\/vnd\.api\+json/.test(p1.headers.accept) && p1.body.data.type === "discounts");
  ok("indirim ozellikleri: buyuk harf kod, %15, urune ve kullanima sinirli, 50, once", at && at.code === r1.json.code && at.code === at.code.toUpperCase() &&
    at.amount === 15 && at.amount_type === "percent" && at.is_limited_to_products === true && at.is_limited_redemptions === true &&
    at.max_redemptions === 50 && at.duration === "once" && at.name === "Davet " + at.code, JSON.stringify(at));
  ok("indirim iliskileri: magaza ve varyantlar", rel && rel.store.data.type === "stores" && rel.store.data.id === "454844" &&
    JSON.stringify(rel.variants.data) === JSON.stringify([{ type: "variants", id: "111" }, { type: "variants", id: "222" }]), JSON.stringify(rel));
  ok("sayac: iade, odenmemis, kendi e-postasi, tekrar e-posta, 14 gunden genc ve baska indirim sayilmaz", r1.json.count === 2 && r1.json.tier === 1, r1.metin);
  ok("links.next ayni uc noktada izlenir, baska uc noktaya gidilmez", kayit.get.length === 2 && kayit.baska.length === 0, JSON.stringify(kayit.baska));
  ok("kayit GET'leri Bearer ile", kayit.yetkisiz === 0);

  var postOnce = kayit.discounts.length, getOnce = kayit.get.length;
  var r2 = await ist(ref("LIC-GOOD"));
  ok("ikinci cagri ayni kodu yeni POST olmadan dondurur", r2.status === 200 && r2.json.code === r1.json.code && kayit.discounts.length === postOnce, r2.metin);
  ok("600 sn onbellek ikinci GET'i engeller", kayit.get.length === getOnce);
  var st = await ist({ action: "referral_stats", license_key: "LIC-GOOD", instance_id: "inst-1" });
  ok("referral_stats ayni sonucu verir, LS'ye gitmez", st.status === 200 && st.json.code === r1.json.code && st.json.count === 2 && kayit.get.length === getOnce && kayit.discounts.length === postOnce);
  var st3 = await ist({ action: "referral_stats", license_key: "LIC-THREE", instance_id: "inst-1" });
  ok("kodu olmayan lisansta referral_stats kod olusturmaz", st3.status === 200 && st3.json.code === null && st3.json.count === 0 && kayit.discounts.length === postOnce, st3.metin);

  var dosya = fs.readFileSync(path.join(PRIV, "referrals.json"), "utf8");
  ok("kayitta duz e-posta ve lisans anahtari yok", dosya.indexOf("@") === -1 && dosya.indexOf("LIC-GOOD") === -1 && dosya.indexOf(LS_KEY) === -1 && dosya.indexOf(r1.json.code) !== -1);

  // onbellek eskiyince yeniden sayilir
  var d = refOku();
  Object.keys(d.users).forEach(function (k) { d.users[k].counted_at = Math.floor(Date.now() / 1000) - 700; });
  refYaz(d);
  await ist(ref("LIC-GOOD"));
  ok("600 sn gecince sayac yeniden okunur", kayit.get.length === getOnce + 2);

  // anahtar (token_secret) degisse de mevcut kod degismez
  config({ token_secret: "b".repeat(64) });
  hizSifirla();
  var r3 = await ist(ref("LIC-GOOD"));
  ok("token_secret degisince kod ayni, yeni indirim yok", r3.status === 200 && r3.json.code === r1.json.code && kayit.discounts.length === postOnce);
  config({});

  /* ---------- 422 ---------- */
  hizSifirla();
  her422.aktif = true;
  var once422 = kayit.discounts.length;
  var r4 = await ist(ref("LIC-TWO"));
  her422.aktif = false;
  var denenen = kayit.discounts.slice(once422).map(function (x) { return x.body.data.attributes.code; });
  ok("422: yeni kodla en cok 3 kez daha dener, sonra yumusak hata", r4.status === 503 && r4.json.reason === "referral_busy" && denenen.length === 4 &&
    denenen.every(function (c) { return /^SFL[A-Z2-7]{6}$/.test(c); }) && Object.keys(denenen.reduce(function (o, c) { o[c] = 1; return o; }, {})).length === 4, JSON.stringify(denenen));
  ok("basarisiz lisans icin kayit yazilmaz", Object.keys(refOku().users).length === 1);
  var r5 = await ist(ref("LIC-TWO"));
  ok("422 gecince ayni lisans kod alir, ilk kodla cakismaz", r5.status === 200 && /^SFL[A-Z2-7]{6}$/.test(r5.json.code) && r5.json.code !== r1.json.code && r5.json.count === 0 && r5.json.tier === 0, r5.metin);

  /* ---------- hiz siniri ---------- */
  hizSifirla();
  var sinir = [];
  for (var i = 0; i < 7; i++) sinir.push((await ist({ action: "referral_stats", license_key: "LIC-GOOD", instance_id: "inst-1" })).status);
  ok("davet istekleri IP basina dakikada 6", JSON.stringify(sinir) === "[200,200,200,200,200,200,429]", JSON.stringify(sinir));
  hizSifirla();

  /* ---------- yanitlarda sizinti yok ---------- */
  ok("hicbir yanit e-posta, lisans anahtari, LS anahtari ya da indirim kimligi icermez", yanitlar.every(function (m) {
    return m.indexOf("@") === -1 && m.indexOf("LIC-") === -1 && m.indexOf(LS_KEY) === -1 && m.indexOf("discount_id") === -1 && m.indexOf("7001") === -1;
  }), yanitlar.filter(function (m) { return /@|LIC-|discount_id/.test(m); }).slice(0, 2).join(" | "));

  /* ---------- manifest extras ---------- */
  var m30 = await ist({ action: "manifest", license_key: "LIC-GOOD", instance_id: "inst-1", client_version: "3.0.0" });
  var m31 = await ist({ action: "manifest", license_key: "LIC-GOOD", instance_id: "inst-1", client_version: "3.1.0" });
  ok("3.0.0 istemciye extras gitmez", m30.status === 200 && !m30.json.extras, m30.metin.slice(0, 120));
  ok("3.1.0 + kademe 1: extras.davet yalniz t1 dosyalari", m31.status === 200 && m31.json.extras && m31.json.extras.davet.version === "d.1" &&
    JSON.stringify(m31.json.extras.davet.files.map(function (f) { return f.path; })) === JSON.stringify(["davet/t1/sfx/x.wav"]), JSON.stringify(m31.json.extras));
  ok("extras eklenince files[], content_version ve counts bayt bayt ayni", JSON.stringify(m31.json.files) === JSON.stringify(m30.json.files) &&
    m31.json.content_version === m30.json.content_version && JSON.stringify(m31.json.counts) === JSON.stringify(m30.json.counts) &&
    JSON.stringify(m31.json.files) === JSON.stringify(MANIFEST.files));
  var m3 = await ist({ action: "manifest", license_key: "LIC-THREE", instance_id: "inst-1", client_version: "3.1.0" });
  ok("kademesi 0 olan lisansa extras gitmez", m3.status === 200 && !m3.json.extras);
  var mBos = await ist({ action: "manifest", license_key: "LIC-GOOD", instance_id: "inst-1" });
  ok("surum bildirmeyen eski istemci: extras yok", mBos.status === 200 && !mBos.json.extras);

  function dosyaIste(token, p) { return ist({ action: "file", token: token, path: p, instance_id: "inst-1" }, true); }
  var f1 = await dosyaIste(m31.json.token, "davet/t1/sfx/x.wav");
  ok("ref 1 tokenle t1 odulu iner", f1.status === 200 && f1.body.equals(X), f1.status);
  var f2 = await dosyaIste(m31.json.token, "davet/t3/mogrt/y.mogrt");
  ok("ref 1 tokenle t3 odulu inmez", f2.status === 404, f2.status);
  var f3 = await dosyaIste(m30.json.token, "davet/t1/sfx/x.wav");
  ok("ref iddiasi olmayan (3.0) tokenle davet/ yolu reddedilir", f3.status === 404, f3.status);
  var f4 = await dosyaIste(m30.json.token, "sfx/w.wav");
  ok("ana icerik eskisi gibi iner", f4.status === 200 && f4.body.equals(W));
  var f5 = await dosyaIste(m31.json.token, "davet/t1/sfx/../../t3/mogrt/y.mogrt");
  ok("davet/ yolunda gezinme reddedilir", f5.status === 404);
  var f6 = await dosyaIste(m31.json.token, "davet/t1/presets/x.prfpset");
  ok("davet/ altinda yalniz mogrt ve sfx", f6.status === 404);

  var d3 = refOku();
  Object.keys(d3.users).forEach(function (k) { if (d3.users[k].code === r1.json.code) d3.users[k].tier = 3; });
  refYaz(d3);
  var m33 = await ist({ action: "manifest", license_key: "LIC-GOOD", instance_id: "inst-1", client_version: "3.1.0" });
  ok("kademe 3: t1 ve t3 odulleri", m33.json.extras && m33.json.extras.davet.files.length === 2);
  var f7 = await dosyaIste(m33.json.token, "davet/t3/mogrt/y.mogrt");
  ok("ref 3 tokenle t3 odulu iner", f7.status === 200 && f7.body.equals(Y));

  /* ---------- attribution ---------- */
  hizSifirla();
  var a1 = await ist({ action: "attribution", answer: "youtube", license_key: "LIC-GOOD" });
  var a2 = await ist({ action: "attribution", answer: "arkadas" });
  var a3 = await ist({ action: "attribution", answer: "<script>" });
  var satirlar = fs.readFileSync(path.join(PRIV, "attribution.jsonl"), "utf8").trim().split("\n").map(function (x) { return JSON.parse(x); });
  ok("attribution: gecerli yanit kaydedilir, gecersiz 400", a1.status === 200 && a1.json.ok === true && a2.status === 200 && a3.status === 400);
  ok("attribution satiri: gun, yanit, lisansin sha256'si ya da null", satirlar.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(satirlar[0].day) &&
    satirlar[0].answer === "youtube" && satirlar[0].license === sha(Buffer.from("LIC-GOOD")) && satirlar[1].license === null && satirlar[1].answer === "arkadas",
    JSON.stringify(satirlar));
  ok("attribution dosyasinda anahtarin kendisi yok", fs.readFileSync(path.join(PRIV, "attribution.jsonl"), "utf8").indexOf("LIC-GOOD") === -1);
  var limit = [];
  for (var q = 0; q < 11; q++) limit.push((await ist({ action: "attribution", answer: "diger" })).status);
  ok("attribution hiz sinirli", limit[limit.length - 1] === 429, JSON.stringify(limit));
}

calis().catch(function (e) { ok("kosum hatasiz", false, e && e.stack ? e.stack : e); }).then(function () {
  try { if (phpSurec) phpSurec.kill(); } catch (e) {}
  try { lsSunucu.close(); } catch (e2) {}
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e3) {}
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
});
