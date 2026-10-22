/*
 * Suflo Studio MCP: GERCEK Apache + mod_php ile .htaccess kurallarinin kaniti (php -S .htaccess okumaz).
 * Kurulum dagitim tablosuyla ayni (public_html/studio, public_html/studio-test, public_html/.well-known/.htaccess).
 *  - /studio/mcp ic yeniden yazma ile mcp-giris.php'ye gider: 301 / sonda / yok; GET 405
 *  - Sunucu kisitli: MultiViews ACIK ve .htaccess'te yalniz "Options=Indexes" degistirilebilir (paylasimli barindirma gibi).
 *    Giris dosyalarinin adlari istek yollarindan farkli oldugu icin yollar yine dogru dosyaya gider; "Options -MultiViews" yok (500 olurdu)
 *  - https: studio/.htaccess'teki acik yonlendirme (X-Forwarded-Proto: http -> 301 https, /studio/ ve panel /studio/v1/);
 *    diger butun istekler vekil arkasindaki https gibi X-Forwarded-Proto: https ile gider
 *  - Authorization basligi PHP'ye ulasir (kurallin E= degiskeni REDIRECT_HTTP_AUTHORIZATION olarak da gorunur); Bearer ile tam akis
 *  - kesif adlari kok .well-known'dan ve /studio/.well-known'dan; acme-challenge dosyalari aynen sunulur; eslenmeyen adlar 404
 *  - mcp-kitaplik klasoru 403; arayuz guvenlik basliklari (X-Frame-Options, CSP) statik dosyalarda duruyor
 *  - Playwright varsa: onay sayfasi gercek Chromium'da, Apache'nin gonderdigi iki CSP ile calisiyor (yoksa yalniz bu adim ATLA)
 * Apache (/usr/sbin/apache2) ya da mod_php yoksa ATLA. Kendi ServerRoot / PidFile / portu ile calisir, PID ile durdurulur.
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var O = require("./_studio-mcp-ortak.js");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(typeof ek === "string" ? ek : JSON.stringify(ek)).slice(0, 600) + "]" : "")); }
function atla(neden) { console.log("ATLA " + neden); process.exit(0); }
function playwrightBul() {
  try { return require("playwright"); } catch (e) { /* global kurulum */ }
  try {
    var g = cp.execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return require(path.join(g, "playwright"));
  } catch (e2) { return null; }
}

var APACHE = "/usr/sbin/apache2";
var MODUL = "/usr/lib/apache2/modules";
if (process.platform === "win32" || !fs.existsSync(APACHE)) atla("Apache (/usr/sbin/apache2) yok: .htaccess testi calismadi");
var libphp = fs.existsSync(MODUL) ? fs.readdirSync(MODUL).filter(function (f) { return /^libphp[0-9.]*\.so$/.test(f); })[0] : null;
var gerekli = ["mod_mpm_prefork.so", "mod_authz_core.so", "mod_authz_host.so", "mod_dir.so", "mod_mime.so", "mod_rewrite.so", "mod_headers.so", "mod_negotiation.so"];
if (!libphp || gerekli.some(function (m) { return !fs.existsSync(path.join(MODUL, m)); })) atla("Apache mod_php / mod_rewrite / mod_headers yok: .htaccess testi calismadi");
var phpVar = cp.spawnSync("php", ["-r", "echo in_array('sqlite', PDO::getAvailableDrivers()) ? 'var' : 'yok';"], { encoding: "utf8" });
if (phpVar.error || phpVar.stdout !== "var") atla("php / pdo_sqlite yok");

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-mcp-apache-"));
var B = path.join(TMP, "apache");
var PUB = O.kur(TMP, ["studio", "studio-test", "yoklama"]);
var kok = typeof process.getuid === "function" && process.getuid() === 0;
var kullanici = null;
if (kok) {
  var idr = cp.spawnSync("id", ["-u", "www-data"], { encoding: "utf8" });
  kullanici = idr.status === 0 ? { ad: "www-data", uid: Number(idr.stdout), gid: Number(cp.spawnSync("id", ["-g", "www-data"], { encoding: "utf8" }).stdout) } : null;
  if (!kullanici) atla("root olarak calisiyor ama www-data kullanicisi yok");
}
var PORT = 0, KOK = "", pid = 0;
var HTTPS = { "X-Forwarded-Proto": "https" };   // vekil (LiteSpeed / Cloudflare) arkasinda https istegi

function hazirla() {
  fs.mkdirSync(path.join(B, "logs"), { recursive: true });
  fs.mkdirSync(path.join(B, "run"), { recursive: true });
  // Statik arayuz dosyasi (guvenlik basliklari burada da durmali) ve acme-challenge ornek dosyasi
  fs.copyFileSync(path.join(O.ROOT, "server", "studio-v1", "arayuz", "index.html"), path.join(PUB, "studio", "index.html"));
  fs.mkdirSync(path.join(PUB, ".well-known", "acme-challenge"), { recursive: true });
  fs.writeFileSync(path.join(PUB, ".well-known", "acme-challenge", "ornek-dogrulama-dosyasi"), "acme-ornek-icerik");
  // Panel (/studio/v1/): repodaki v1 .htaccess'i ve yerine gecen kucuk bir index.php (https yonlendirmesi buraya da islemeli)
  fs.mkdirSync(path.join(PUB, "studio", "v1"), { recursive: true });
  fs.copyFileSync(path.join(O.ROOT, "server", "studio-v1", ".htaccess"), path.join(PUB, "studio", "v1", ".htaccess"));
  fs.copyFileSync(path.join(O.ROOT, "server", "studio-v1", ".htaccess"), path.join(PUB, "studio-test", "v1", ".htaccess"));
  fs.writeFileSync(path.join(PUB, "studio", "v1", "index.php"), "<?php echo 'panel-yoklama';\n");
  // Ortak veri kitapligi index.php'nin yaninda durur; v1/.htaccess onu dogrudan HTTP erisimine kapatmali
  fs.copyFileSync(path.join(O.ROOT, "server", "studio-v1", "studio-ortak.php"), path.join(PUB, "studio", "v1", "studio-ortak.php"));
  // Yoklama uygulamasi: ayni .htaccess, mcp-giris.php yerine basligin PHP'ye nasil ulastigini soyleyen yoklama
  fs.writeFileSync(path.join(PUB, "yoklama", "surucu.php"), "<?php echo in_array('sqlite', PDO::getAvailableDrivers()) ? 'var' : 'yok';\n");
  fs.writeFileSync(path.join(PUB, "yoklama", "mv-deneme.txt"), "multiviews-acik");
  fs.writeFileSync(path.join(PUB, "yoklama", "mcp-giris.php"), "<?php header('Content-Type: application/json'); echo json_encode([" +
    "'HTTP_AUTHORIZATION' => $_SERVER['HTTP_AUTHORIZATION'] ?? null, 'REDIRECT_HTTP_AUTHORIZATION' => $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null," +
    "'getallheaders' => function_exists('getallheaders') ? (getallheaders()['Authorization'] ?? null) : null, 'script' => $_SERVER['SCRIPT_NAME'], 'uri' => $_SERVER['REQUEST_URI']]);\n");
  // studio: sahte arka uc (tasima / OAuth denetimleri); studio-test: GERCEK arka uc (mcp-kitaplik/arka-studio.php -> ../v1/studio-ortak.php)
  // + gercek Studio veritabani: dagitimdaki klasor duzeninde mod_php altinda yuklenebildigi denenir
  var arka = path.join(TMP, "private", "studio-v1", "arka-sahte.php");
  fs.copyFileSync(O.SAHTE_ARKA, arka);   // apache kullanicisi repo klasorunu okuyamayabilir
  O.ayarYaz(TMP, "studio", KOK, { mcp_arka: arka });
  O.ayarYaz(TMP, "studio-test", KOK, { mcp_arka: null, dsn: "sqlite:" + path.join(TMP, "private", "studio-test-v1", "studio.sqlite") });
  // Izinler: Apache (www-data) dosyalari okur, private/<uygulama>-v1 klasorlerine yazar (SQLite)
  (function izin(d) {
    fs.chmodSync(d, 0o755);
    fs.readdirSync(d).forEach(function (f) { var p = path.join(d, f); if (fs.statSync(p).isDirectory()) izin(p); else fs.chmodSync(p, 0o644); });
  })(TMP);
  if (kullanici) ["studio", "studio-test"].forEach(function (u) {
    var d = path.join(TMP, "private", u + "-v1");
    fs.chownSync(d, kullanici.uid, kullanici.gid);
    fs.readdirSync(d).forEach(function (f) { fs.chownSync(path.join(d, f), kullanici.uid, kullanici.gid); });
  });
  var m = function (ad, dosya) { return "LoadModule " + ad + " " + path.join(MODUL, dosya); };
  var conf = [
    'ServerRoot "' + B + '"', "ServerName 127.0.0.1", "Listen 127.0.0.1:" + PORT, "PidFile " + path.join(B, "httpd.pid"),
    "ErrorLog " + path.join(B, "logs", "error.log"), "LogLevel warn", "DefaultRuntimeDir " + path.join(B, "run"), "Mutex file:" + path.join(B, "run") + " default",
    m("mpm_prefork_module", "mod_mpm_prefork.so"), m("authz_core_module", "mod_authz_core.so"), m("authz_host_module", "mod_authz_host.so"),
    m("dir_module", "mod_dir.so"), m("mime_module", "mod_mime.so"), m("rewrite_module", "mod_rewrite.so"), m("headers_module", "mod_headers.so"),
    m("negotiation_module", "mod_negotiation.so"),
    m("php_module", libphp),
    kullanici ? "User " + kullanici.ad : "", kullanici ? "Group " + kullanici.ad : "",
    "StartServers 2", "MinSpareServers 2", "MaxSpareServers 4",
    "TypesConfig /etc/mime.types", "DirectoryIndex index.html",
    'DocumentRoot "' + PUB + '"',
    '<Directory "/">', "  AllowOverride None", "  Require all denied", "</Directory>",
    // Paylasimli barindirma gibi: MultiViews acik, .htaccess'te Options yalniz Indexes icin degistirilebilir ("-MultiViews" 500 verir)
    '<Directory "' + PUB + '">', "  Options FollowSymLinks MultiViews", "  AllowOverride AuthConfig FileInfo Indexes Limit Options=Indexes", "  Require all granted", "</Directory>",
    '<FilesMatch "\\.php$">', "  SetHandler application/x-httpd-php", "</FilesMatch>",
    "php_admin_value opcache.enable 0", "php_admin_value display_errors 0"
  ].join("\n") + "\n";
  fs.writeFileSync(path.join(B, "httpd.conf"), conf);
}
function baslat() {
  var r = cp.spawnSync(APACHE, ["-f", path.join(B, "httpd.conf"), "-k", "start"], { encoding: "utf8" });
  // Baslamama ortam sorunudur (ana yapilandirma / izinler), .htaccess degil: test atlanir, neden yazilir
  if (r.status !== 0) {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    atla("Apache bu ortamda baslatilamadi: " + (r.stdout + r.stderr).trim().slice(0, 300));
  }
  return (async function () {
    for (var i = 0; i < 80; i++) {
      if (fs.existsSync(path.join(B, "httpd.pid"))) pid = Number(fs.readFileSync(path.join(B, "httpd.pid"), "utf8").trim());
      var y = await O.istek({ port: PORT, yol: "/yok" });
      if (y.status && pid) return;
      await O.bekle(100);
    }
    throw new Error("apache yanit vermedi");
  })();
}
async function durdur() {
  if (!pid) return;
  try { process.kill(pid, "SIGTERM"); } catch (e) { return; }
  for (var i = 0; i < 50; i++) {
    try { process.kill(pid, 0); } catch (e) { pid = 0; return; }
    await O.bekle(100);
  }
  try { process.kill(pid, "SIGKILL"); } catch (e) {}
  pid = 0;
}

async function calis() {
  PORT = await O.bosPort();
  KOK = "http://127.0.0.1:" + PORT;
  hazirla();
  await baslat();
  var I = new O.Istemci(PORT, KOK, HTTPS), r, w;
  r = await I.istek({ yol: "/yoklama/surucu.php" });
  // 200 disi yanit (ornegin .htaccess'te izin verilmeyen bir komut -> 500) ortam eksigi DEGIL, hatadir: atlanmaz
  if (r.status !== 200) { ok("Apache: .htaccess'li klasorde PHP calisir (yoklama 200)", false, [r.status, r.metin.slice(0, 200)]); return; }
  if (r.metin !== "var") { console.log("ATLA Apache'nin PHP'sinde (mod_php) pdo_sqlite yok: .htaccess testinin kalani calismadi"); return; }

  /* ---- MultiViews acik (kisitli sunucu) ---- */
  r = await I.istek({ yol: "/yoklama/mv-deneme" });
  ok("Apache: MultiViews gercekten acik (uzantisiz /yoklama/mv-deneme -> mv-deneme.txt)", r.status === 200 && r.metin === "multiviews-acik", [r.status, r.metin]);

  /* ---- https yonlendirmesi (studio/.htaccess'te acik; kok .htaccess'teki kural /studio/ altinda islemez) ---- */
  var httpYol = ["/studio/", "/studio/v1/index.php", "/studio/v1/index.php?a=1"];
  var httpSonuc = [];
  for (var hy = 0; hy < httpYol.length; hy++) {
    r = await O.istek({ port: PORT, yol: httpYol[hy], baslik: { "X-Forwarded-Proto": "http" } });
    httpSonuc.push([r.status, r.headers.location]);
  }
  ok("Apache: X-Forwarded-Proto: http -> 301 https (arayuz /studio/ ve panel /studio/v1/index.php; sorgu korunur)", httpSonuc.every(function (x, k) {
    return x[0] === 301 && x[1] === "https://127.0.0.1:" + PORT + httpYol[k];
  }), httpSonuc);
  r = await O.istek({ port: PORT, yol: "/studio/v1/index.php" });
  ok("Apache: vekil basligi olmayan duz http istegi de 301 https", r.status === 301 && r.headers.location === "https://127.0.0.1:" + PORT + "/studio/v1/index.php", [r.status, r.headers.location]);
  // Kok .well-known'dan ic yeniden yazilan kesif adresleri: http istegi KENDI https adresine gider (ic dosya yoluna -> 404 degil)
  var kesifHttp = ["/.well-known/oauth-protected-resource/studio/mcp", "/.well-known/oauth-authorization-server/studio", "/.well-known/openid-configuration/studio",
    "/.well-known/oauth-protected-resource/studio-test/mcp", "/studio/.well-known/openid-configuration", "/studio/mcp?a=1&b=%2F"];
  var kesifSonuc = [];
  for (hy = 0; hy < kesifHttp.length; hy++) {
    r = await O.istek({ port: PORT, yol: kesifHttp[hy], baslik: { "X-Forwarded-Proto": "http" } });
    kesifSonuc.push([r.status, r.headers.location]);
  }
  ok("Apache: http kesif adresleri (kok .well-known, studio ve studio-test) ve sorgulu /studio/mcp kendi https adresine 301", kesifSonuc.every(function (x, k) {
    return x[0] === 301 && x[1] === "https://127.0.0.1:" + PORT + kesifHttp[k];
  }), kesifSonuc);
  r = await I.istek({ yol: kesifHttp[0] });
  ok("Apache: yonlendirilen https kesif adresi 200 (PRM)", r.status === 200 && r.json && r.json.resource === KOK + "/studio/mcp", [r.status, r.metin]);
  r = await I.istek({ yol: "/studio/" });
  r2 = await I.istek({ yol: "/studio/v1/index.php" });
  ok("Apache: https istekleri (X-Forwarded-Proto: https) yonlendirilmez: /studio/ 200 arayuz, /studio/v1/index.php 200 panel", r.status === 200 && !r.headers.location &&
    /<html/i.test(r.metin) && r2.status === 200 && r2.metin === "panel-yoklama", [r.status, r2.status, r2.metin]);

  /* ---- yeniden yazma, 301 yok ---- */
  r = await I.rpc("studio", null, "tools/list");
  w = O.wwwCoz(r.headers["www-authenticate"]);
  ok("Apache (MultiViews acik): POST /studio/mcp -> mcp-giris.php (401 + resource_metadata), yonlendirme yok", r.status === 401 && !r.headers.location &&
    w.resource_metadata === KOK + "/.well-known/oauth-protected-resource/studio/mcp" && w.error === undefined, [r.status, r.headers.location, r.headers["www-authenticate"]]);
  r = await I.istek({ yol: "/studio/mcp" });
  ok("Apache: GET /studio/mcp -> 405 Allow: POST (301 degil)", r.status === 405 && r.headers.allow === "POST" && !r.headers.location, [r.status, r.headers.location]);
  ok("Apache: MCP yanitinda Cache-Control no-store + X-LiteSpeed-Cache-Control no-cache", /no-store/.test(r.headers["cache-control"] || "") && /no-cache/.test(r.headers["x-litespeed-cache-control"] || ""), r.headers);

  /* ---- Authorization basligi PHP'ye ulasiyor ---- */
  r = await I.istek({ yontem: "POST", yol: "/yoklama/mcp", baslik: { Authorization: "Bearer yoklama-degeri-123" } });
  ok("Apache: .htaccess E= kurali Authorization'i PHP'ye gecirir (REDIRECT_HTTP_AUTHORIZATION)", r.status === 200 && r.json &&
    r.json.REDIRECT_HTTP_AUTHORIZATION === "Bearer yoklama-degeri-123" && r.json.script === "/yoklama/mcp-giris.php" && r.json.uri === "/yoklama/mcp", r.metin);
  r = await I.rpc("studio", "a".repeat(43), "tools/list");
  ok("Apache: gecersiz Bearer -> 401 error=invalid_token (baslik PHP'ye ulasti)", r.status === 401 && O.wwwCoz(r.headers["www-authenticate"]).error === "invalid_token", r.headers["www-authenticate"]);

  /* ---- kesif ---- */
  var yollar = ["/.well-known/oauth-authorization-server/studio", "/.well-known/openid-configuration/studio", "/studio/.well-known/openid-configuration", "/studio/.well-known/oauth-authorization-server"];
  var metinler = [];
  for (var i = 0; i < yollar.length; i++) { r = await I.istek({ yol: yollar[i] }); metinler.push(r.status + " " + r.metin); }
  ok("Apache: AS metadata 4 adreste 200 ve ayni belge, issuer " + KOK + "/studio", metinler.every(function (t) { return t === metinler[0]; }) &&
    metinler[0].indexOf("200 ") === 0 && metinler[0].indexOf('"issuer":"' + KOK + '/studio"') !== -1, metinler);
  r = await I.istek({ yol: "/.well-known/oauth-protected-resource/studio/mcp" });
  var r2 = await I.istek({ yol: "/.well-known/oauth-protected-resource/studio-test/mcp" });
  ok("Apache: PRM kok .well-known'dan (studio ve studio-test, ayri ayar)", r.status === 200 && r.json.resource === KOK + "/studio/mcp" && r2.status === 200 &&
    r2.json.resource === KOK + "/studio-test/mcp", [r.metin, r2.metin]);
  ok("Apache: kesif belgesi application/json", /application\/json/.test(r.headers["content-type"] || ""), r.headers["content-type"]);
  r = await I.istek({ yol: "/.well-known/acme-challenge/ornek-dogrulama-dosyasi" });
  ok("Apache: acme-challenge dosyasi aynen sunulur (200, icerik ayni)", r.status === 200 && r.metin === "acme-ornek-icerik", [r.status, r.metin]);
  r = await I.istek({ yol: "/.well-known/acme-challenge/olmayan" });
  r2 = await I.istek({ yol: "/.well-known/oauth-protected-resource" });
  var r3 = await I.istek({ yol: "/.well-known/oauth-protected-resource/pro/mcp" });
  ok("Apache: eslenmeyen .well-known adlari dokunulmadan 404 (acme, kok PRM, baska uygulama)", r.status === 404 && r2.status === 404 && r3.status === 404, [r.status, r2.status, r3.status]);

  /* ---- kapali klasor, dogrudan dosyalar, arayuz basliklari ---- */
  var kapali = ["/studio/mcp-kitaplik/ortak.php", "/studio/mcp-kitaplik/", "/studio/mcp-kitaplik/.htaccess", "/studio/mcp-kitaplik/depo.php"];
  var kd = [];
  for (i = 0; i < kapali.length; i++) kd.push((await I.istek({ yol: kapali[i] })).status);
  ok("Apache: mcp-kitaplik klasoru 403 (php dosyalari ve dizin)", kd.every(function (s) { return s === 403; }), kd);
  // studio-ortak.php: 403'u Apache verir (FilesMatch; govdede Apache'nin "Forbidden" sayfasi). PHP'ye hic ulasmaz:
  // kitapligin kendi korumasi (STUDIO_ORTAK sabiti) bos govdeli 403 verirdi; o ikinci savunma test-studio-ortak.js'te.
  var ortakYollar = ["/studio/v1/studio-ortak.php", "/studio/v1/studio-ortak.php/ek", "/studio/v1/STUDIO-ORTAK.php"];
  var od = [];
  for (i = 0; i < ortakYollar.length; i++) { var oy = await I.istek({ yol: ortakYollar[i] }); od.push([oy.status, /Forbidden/.test(oy.metin)]); }
  ok("Apache: v1/studio-ortak.php dogrudan -> 403 (v1/.htaccess FilesMatch; PHP calismaz)", od[0][0] === 403 && od[0][1] && od[1][0] === 403 && od[1][1] &&
    (od[2][0] === 403 || od[2][0] === 404), od);
  r = await I.istek({ yol: "/studio/oauth-giris.php" });
  r2 = await I.istek({ yol: "/studio/kesif-giris.php" });
  var r9 = await I.istek({ yol: "/studio/mcp-giris" });
  ok("Apache: oauth-giris.php / kesif-giris.php dogrudan -> 404; MultiViews ile /studio/mcp-giris de 404", r.status === 404 && r2.status === 404 && r9.status === 404,
    [r.status, r2.status, r9.status]);
  r = await I.istek({ yol: "/studio/index.html" });
  ok("Apache: arayuz guvenlik basliklari statik dosyada aynen (X-Frame-Options DENY, CSP form-action 'none', nosniff, no-referrer)", r.status === 200 &&
    r.headers["x-frame-options"] === "DENY" && /form-action 'none'/.test(r.headers["content-security-policy"] || "") && r.headers["x-content-type-options"] === "nosniff" &&
    r.headers["referrer-policy"] === "no-referrer", r.headers);
  r = await I.istek({ yol: "/studio/mcp-onay.js" });
  r2 = await I.istek({ yol: "/studio/mcp-onay.css" });
  ok("Apache: onay sayfasi betigi ve stili sunulur (dogru tur)", r.status === 200 && /javascript/.test(r.headers["content-type"] || "") && r2.status === 200 && /text\/css/.test(r2.headers["content-type"] || ""), [r.status, r2.status]);

  /* ---- Apache uzerinden tam OAuth + MCP ---- */
  var CLAUDE = "https://claude.ai/api/mcp/auth_callback";
  r = await I.kayit("studio", { client_name: "Claude", redirect_uris: [CLAUDE], token_endpoint_auth_method: "none" });
  var A = r.json || {};
  ok("Apache: DCR 201", r.status === 201 && A.client_id, r.metin);
  r = await I.yetkiSayfasi("studio", { response_type: "code", client_id: A.client_id, redirect_uri: CLAUDE, code_challenge: O.pkce().challenge, code_challenge_method: "S256", state: "x" });
  var csp = [].concat(r.headers["content-security-policy"] || []).join(" | ");
  ok("Apache: onay sayfasi 200; arayuz CSP'si ve sayfanin CSP'si birlikte: ikisi de script/style/connect 'self' (fetch ile onay calisir)", r.status === 200 &&
    /frame-ancestors 'none'/.test(csp) && /connect-src 'self'/.test(csp), csp);
  var a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  r = await I.kodTakas("studio", A.client_id, a, CLAUDE);
  var T = r.json || {};
  ok("Apache: onay + PKCE ile jeton", a.kod && a.iss === KOK + "/studio" && r.status === 200 && T.access_token, a.hata ? a.r.metin : r.metin);
  r = await I.rpc("studio", T.access_token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  r2 = await I.yeni("studio", T.access_token, "tools/call", { name: "studio_bugun", arguments: {} });
  ok("Apache: Bearer jetonla MCP (eski initialize + yeni donem tools/call) 200", r.status === 200 && r.json.result.protocolVersion === "2025-06-18" &&
    r2.status === 200 && r2.json.result.isError === false, [r.metin, r2.metin]);
  r = await I.kayit("studio", { client_name: "Gizli", redirect_uris: [CLAUDE], token_endpoint_auth_method: "client_secret_basic" });
  var D = r.json || {};
  a = await I.yetkiAl("studio", { client_id: D.client_id, redirect_uri: CLAUDE });
  r = await I.token("studio", { grant_type: "authorization_code", code: a.kod, redirect_uri: CLAUDE, code_verifier: a.pk.verifier },
    { Authorization: "Basic " + Buffer.from(encodeURIComponent(D.client_id) + ":" + encodeURIComponent(D.client_secret)).toString("base64") });
  ok("Apache: token ucunda Basic istemci dogrulamasi (Authorization /oauth/token'a da ulasir)", r.status === 200 && r.json.access_token, r.metin);
  r = await I.iptal("studio", A.client_id, T.refresh_token);
  r2 = await I.rpc("studio", T.access_token, "tools/list");
  ok("Apache: revoke -> jeton gecersiz", r.status === 200 && r2.status === 401, [r.status, r2.status]);
  /* ---- gercek arka uc (studio-test): kitaplik ../v1/studio-ortak.php'den, Studio veritabani private/studio-test-v1 ---- */
  r = await I.kayit("studio-test", { client_name: "Claude", redirect_uris: [CLAUDE] });
  var AT = r.json || {};
  a = await I.yetkiAl("studio-test", { client_id: AT.client_id, redirect_uri: CLAUDE });
  r = await I.kodTakas("studio-test", AT.client_id, a, CLAUDE);
  var TT = r.json || {};
  ok("Apache + gercek arka uc: onay sifresi panelin kilidinden (Studio veritabani) gecer, jeton verilir", a.kod && r.status === 200 && TT.access_token, a.hata ? a.r.metin : r.metin);
  r = await I.arac("studio-test", TT.access_token, "studio_musteri_olustur", { ad: "Apache Test", istek_anahtari: "apache-gercek-0001" });
  r2 = await I.arac("studio-test", TT.access_token, "studio_musteri_ara", { sorgu: "apache" });
  ok("Apache + gercek arka uc: yazma ve okuma araclari Studio veritabaninda calisir", r.status === 200 && r.json.result.isError === false &&
    r.json.result.structuredContent.durum === "olusturuldu" && r2.json.result.structuredContent.toplam === 1, [r.metin, r2.metin]);
  r = await I.istek({ yol: "/studio-test/v1/studio-ortak.php" });
  ok("Apache + gercek arka uc: kitaplik (v1/studio-ortak.php) disaridan yine kapali", r.status === 403, r.status);
  /* ---- gercek tarayici (istege bagli): onay sayfasi Apache'nin cift CSP'siyle calisiyor mu ---- */
  var pw = playwrightBul();
  if (!pw) {
    console.log("ATLA tarayici adimi: Playwright yok (onay sayfasi gercek tarayicida denenmedi)");
  } else {
    var tarayici = await pw.chromium.launch();
    try {
      var sayfa = await tarayici.newPage({ extraHTTPHeaders: HTTPS });
      var cspIhlali = [];
      sayfa.on("console", function (m) { if (/Content Security Policy|Refused to/i.test(m.text())) cspIhlali.push(m.text()); });
      // Donus adresi (claude.ai) aga cikmadan yakalanir
      await sayfa.route("https://claude.ai/**", function (route) { route.fulfill({ status: 200, contentType: "text/plain", body: "donus" }); });
      var tpk = O.pkce();
      await sayfa.goto(KOK + "/studio/oauth/authorize?" + O.form({ response_type: "code", client_id: A.client_id, redirect_uri: CLAUDE, code_challenge: tpk.challenge,
        code_challenge_method: "S256", state: "tarayici-1", scope: "studio.oku studio.yaz", resource: KOK + "/studio/mcp" }));
      await sayfa.fill("#sifre", "yanlis-tarayici-sifresi");
      await sayfa.click("#izin");
      await sayfa.waitForSelector("#hata:not([hidden])");
      var hataMetni = await sayfa.textContent("#hata");
      await sayfa.fill("#sifre", O.SIFRE);
      await Promise.all([sayfa.waitForURL(/^https:\/\/claude\.ai\//), sayfa.click("#izin")]);
      var donus = new URL(sayfa.url());
      ok("Tarayici (Chromium) + Apache: onay sayfasi CSP ihlalsiz calisir; yanlis sifre mesaji, dogru sifreyle claude.ai'ye code + state + iss ile doner",
        cspIhlali.length === 0 && hataMetni === "Şifre yanlış." && /^[A-Za-z0-9_-]{43}$/.test(donus.searchParams.get("code") || "") &&
        donus.searchParams.get("state") === "tarayici-1" && donus.searchParams.get("iss") === KOK + "/studio", { cspIhlali: cspIhlali, hataMetni: hataMetni, url: sayfa.url() });
      r = await I.token("studio", { grant_type: "authorization_code", code: donus.searchParams.get("code"), redirect_uri: CLAUDE, code_verifier: tpk.verifier, client_id: A.client_id });
      ok("Tarayicidan gelen kod jetona cevrilir", r.status === 200 && r.json.access_token, r.metin);
    } finally {
      await tarayici.close();
    }
  }

  var hata = fs.readFileSync(path.join(B, "logs", "error.log"), "utf8").split("\n").filter(function (s) { return /PHP (Fatal|Warning|Notice|Deprecated)|AH00526|Invalid command/.test(s); });
  ok("Apache hata gunlugunde PHP uyarisi / gecersiz .htaccess komutu yok", hata.length === 0, hata.slice(0, 5));
}

calis().catch(function (e) { ok("beklenmeyen hata: " + (e && e.stack || e), false); }).then(durdur).then(function () {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
});
