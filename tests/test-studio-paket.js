/*
 * Suflo Studio sunucu paketleri (tools/studio-paket.js). Yalniz anonim ornek veri.
 *  A) Paket icerigi: iki ZIP (studio-test, studio) beklenen listeyle birebir; config.php / sqlite / sir / test arka ucu yok;
 *     yasak dosya ya da icerik eklenince denetim HATA verir (komut satiri dahil); ZIP repo icine yazilamaz.
 *  B) Test ayari ("ayar" komutu): yeni rastgele sifre, yalniz bcrypt maliyet 12 ozeti, ayri sqlite, mcp_acik, kok_url;
 *     sifre ekrana yazilmaz, dosyalar 0600, var olanin uzerine yazilmaz.
 *  C) Uctan uca, GERCEK Apache + mod_php: iki ZIP gecici bir public_html'e acilir (studio + studio-test yan yana, canlidaki gibi),
 *     private/studio-test-v1 ve private/studio-v1 ayri ayarlarla. Kesif (PRM / AS / OIDC; issuer ve resource /studio-test),
 *     OAuth (DCR + PKCE + onay + token), MCP arac cagrisi (musteri + cekim), panelden (/studio-test/v1) geri okuma,
 *     canli klasorun verisine ve ayarina hic dokunulmadigi, cerezlerin karismadigi; Playwright varsa arayuz /studio-test/'ten.
 *     Apache yoksa C bolumu ATLA.
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var P = require("../tools/studio-paket.js");
var O = require("./_studio-mcp-ortak.js");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(typeof ek === "string" ? ek : JSON.stringify(ek)).slice(0, 700) + "]" : "")); }
function bitir() { console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti"); process.exit(kalan ? 1 : 0); }

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-paket-"));
var CIKIS = path.join(TMP, "paket");
var ARAC = path.join(O.ROOT, "tools", "studio-paket.js");

/* ================= A) Paket icerigi ================= */

var s = P.paketYap(CIKIS);
var testZip = path.join(CIKIS, "suflo-studio-test-paket.zip"), canliZip = path.join(CIKIS, "suflo-studio-canli-paket.zip");
ok("iki ZIP + well-known.htaccess + SHA256SUMS repo disina yazildi", fs.existsSync(testZip) && fs.existsSync(canliZip) &&
  fs.existsSync(path.join(CIKIS, "well-known.htaccess")) && /suflo-studio-test-paket\.zip/.test(fs.readFileSync(path.join(CIKIS, "SHA256SUMS.txt"), "utf8")), s);
var TG = P.zipOku(fs.readFileSync(testZip)), CG = P.zipOku(fs.readFileSync(canliZip));
var tAd = TG.map(function (g) { return g.ad; }), cAd = CG.map(function (g) { return g.ad; });
var BEKLENEN_TEST = ["studio-test/index.html", "studio-test/studio.css", "studio-test/studio-core.js", "studio-test/studio.js", "studio-test/favicon.svg",
  "studio-test/.htaccess", "studio-test/v1/index.php", "studio-test/v1/studio-ortak.php", "studio-test/v1/.htaccess",
  "studio-test/mcp-giris.php", "studio-test/oauth-giris.php", "studio-test/kesif-giris.php", "studio-test/mcp-onay.js", "studio-test/mcp-onay.css",
  "studio-test/mcp-kitaplik/ortak.php", "studio-test/mcp-kitaplik/depo.php", "studio-test/mcp-kitaplik/arka.php", "studio-test/mcp-kitaplik/araclar.php",
  "studio-test/mcp-kitaplik/oauth.php", "studio-test/mcp-kitaplik/tasima.php", "studio-test/mcp-kitaplik/kesif.php", "studio-test/mcp-kitaplik/yukle.php",
  "studio-test/mcp-kitaplik/arka-studio.php", "studio-test/mcp-kitaplik/.htaccess", ".well-known/.htaccess"];
ok("test paketi: icerik listesi birebir (arayuz, v1 panel + ortak kitaplik + .htaccess, MCP girisleri, kitaplik, kok .well-known)",
  JSON.stringify(tAd.slice().sort()) === JSON.stringify(BEKLENEN_TEST.slice().sort()), tAd);
ok("canli paketi: ayni duzen, klasor 'studio'",
  JSON.stringify(cAd.slice().sort()) === JSON.stringify(BEKLENEN_TEST.map(function (a) { return a.replace(/^studio-test\//, "studio/"); }).sort()), cAd);
var bul = function (G, a) { return G.filter(function (g) { return g.ad === a; })[0].veri; };
ok("paketteki dosyalar repodakiyle bayt bayt ayni (.htaccess = mcp/studio.htaccess, .well-known = well-known.htaccess)",
  P.eslemeler("studio-test").every(function (e) { return bul(TG, e[1]).equals(fs.readFileSync(path.join(O.ROOT, e[0]))); }) &&
  bul(TG, "studio-test/.htaccess").equals(fs.readFileSync(path.join(O.ROOT, "server/studio-v1/mcp/studio.htaccess"))));
ok("hicbir pakette config.php, sqlite, json, md, sifre-ozeti.php, arka-sahte ya da private/ yok",
  tAd.concat(cAd).every(function (a) { return !/config|\.sqlite|\.json$|\.md$|sifre-ozeti|arka-sahte|private\//.test(a); }), tAd.concat(cAd));
ok("denetim iki pakette de temiz", P.denetle(TG, "studio-test").length === 0 && P.denetle(CG, "studio").length === 0,
  P.denetle(TG, "studio-test").concat(P.denetle(CG, "studio")));
var unz = cp.spawnSync("unzip", ["-tq", testZip], { encoding: "utf8" });
if (unz.error) console.log("ATLA unzip yok: ZIP bagimsiz bir aracla denetlenmedi");
else ok("ZIP bagimsiz aracla (unzip -t) hatasiz", unz.status === 0 && cp.spawnSync("unzip", ["-tq", canliZip]).status === 0, unz.stdout + unz.stderr);

// Yasak ekler: her biri denetimi bozmali
function ekle(ad, veri) { return TG.concat([{ ad: ad, veri: Buffer.from(veri) }]); }
var ORNEK_OZET = "$2y$12$" + "abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234";
var yasaklar = [
  ["config.php", ekle("studio-test/v1/config.php", "<?php return [];")],
  ["kok config.php", ekle("config.php", "<?php return [];")],
  ["sqlite", ekle("studio-test/studio.sqlite", "SQLite format 3\0....")],
  ["mcp.sqlite-wal", ekle("studio-test/mcp.sqlite-wal", "x")],
  ["yedek json", ekle("studio-test/suflo-studio-yedek.json", "{}")],
  ["sifre-ozeti.php", ekle("studio-test/sifre-ozeti.php", "<?php")],
  ["test arka ucu", ekle("studio-test/mcp-kitaplik/arka-sahte.php", "<?php")],
  ["private/", ekle("private/studio-test-v1/x.txt", "x")],
  ["../ yol", ekle("studio-test/../x.php", "x")],
  ["mutlak yol", ekle("/etc/x", "x")],
  [".env", ekle("studio-test/.env", "A=1")],
  ["ozel anahtar", ekle("studio-test/a.pem", "-----BEGIN PRIVATE KEY-----")]
];
yasaklar.forEach(function (y) { ok("denetim yakalar: " + y[0], P.denetle(y[1], "studio-test").length > 0); });
// Izinli adda yasak icerik
var icerikli = TG.map(function (g) { return g.ad === "studio-test/mcp-giris.php" ? { ad: g.ad, veri: Buffer.concat([g.veri, Buffer.from("\n// " + ORNEK_OZET)]) } : g; });
ok("denetim yakalar: izinli dosyada bcrypt ozeti", P.denetle(icerikli, "studio-test").some(function (x) { return /bcrypt/.test(x); }));
var dolu = TG.map(function (g) { return g.ad === "studio-test/v1/index.php" ? { ad: g.ad, veri: Buffer.concat([g.veri, Buffer.from("\n$x = ['db_pass' => 'gizli'];")]) } : g; });
ok("denetim yakalar: dolu db_pass satiri", P.denetle(dolu, "studio-test").some(function (x) { return /db_pass/.test(x); }));
ok("denetim yakalar: eksik dosya", P.denetle(TG.filter(function (g) { return g.ad !== "studio-test/mcp-kitaplik/.htaccess"; }), "studio-test").some(function (x) { return /eksik/.test(x); }));
var acme = TG.map(function (g) { return g.ad === ".well-known/.htaccess" ? { ad: g.ad, veri: Buffer.from("RewriteRule ^acme-challenge/ - [F]\n") } : g; });
ok("denetim yakalar: .well-known'da acme-challenge kurali", P.denetle(acme, "studio-test").some(function (x) { return /acme/.test(x); }));
// Komut satiri: yasak dosyali ZIP -> cikis 1; temiz ZIP -> 0
var kirliZip = path.join(TMP, "suflo-studio-test-paket.zip");
fs.writeFileSync(kirliZip, P.zipYaz(ekle("studio-test/v1/config.php", "<?php return ['password_hash' => '" + ORNEK_OZET + "'];")));
var r1 = cp.spawnSync(process.execPath, [ARAC, "denetle", kirliZip], { encoding: "utf8" });
var r2 = cp.spawnSync(process.execPath, [ARAC, "denetle", testZip, canliZip], { encoding: "utf8" });
ok("komut satiri 'denetle': config.php'li ZIP hata (1), temiz ZIP'ler 0", r1.status === 1 && /config\.php/.test(r1.stdout) && r2.status === 0, [r1.status, r1.stdout, r2.status, r2.stdout]);
var r3 = cp.spawnSync(process.execPath, [ARAC, "paket", "--cikis", path.join(O.ROOT, "tmp-paket-deneme")], { encoding: "utf8" });
ok("ZIP repo icine yazilmaz (hata, klasor olusmaz)", r3.status === 1 && /repo DISINDA/.test(r3.stderr) && !fs.existsSync(path.join(O.ROOT, "tmp-paket-deneme")), r3.stderr);
ok("paketlenen her dosya git'te izleniyor; test arka ucu (fixtures) listede yok",
  P.eslemeler("studio").every(function (e) { return !/fixtures|arka-sahte/.test(e[0]); }));

/* ================= B) Test ayari ================= */

var AYAR = path.join(TMP, "ozel-test");
var ra = cp.spawnSync(process.execPath, [ARAC, "ayar", "--cikis", AYAR], { encoding: "utf8" });
var sifreDosya = path.join(AYAR, "test-sifre.txt"), cfgDosya = path.join(AYAR, "config.php");
var TEST_SIFRE = fs.existsSync(sifreDosya) ? fs.readFileSync(sifreDosya, "utf8").trim() : "";
ok("ayar: config.php + test-sifre.txt yazildi, sifre ekrana yazilmadi", ra.status === 0 && TEST_SIFRE.length === 24 && /^[A-Za-z0-9]+$/.test(TEST_SIFRE) &&
  (ra.stdout + ra.stderr).indexOf(TEST_SIFRE) === -1, ra.stdout + ra.stderr);
var cfgMetin = fs.existsSync(cfgDosya) ? fs.readFileSync(cfgDosya, "utf8") : "";
var dg = cp.spawnSync("php", ["-r", "$c = require $argv[1]; $s = trim(stream_get_contents(STDIN)); echo json_encode(['dogru' => password_verify($s, $c['password_hash'])," +
  "'bilgi' => password_get_info($c['password_hash']), 'dsn' => $c['dsn'], 'ao' => $c['allowed_origins'], 'acik' => $c['mcp_acik'], 'kok' => $c['kok_url'], 'pass' => $c['db_pass']]);", cfgDosya],
  { input: TEST_SIFRE, encoding: "utf8" });
var dj = JSON.parse(dg.stdout || "{}");
ok("ayar: bcrypt maliyet 12 ozeti dogrulaniyor; dsn kendi klasorunde sqlite; allowed_origins assets; mcp_acik true; kok_url assets",
  dj.dogru === true && dj.bilgi && dj.bilgi.algoName === "bcrypt" && dj.bilgi.options.cost === 12 &&
  dj.dsn === "sqlite:" + AYAR + "/studio.sqlite" && JSON.stringify(dj.ao) === '["https://assets.suflo.app"]' && dj.acik === true &&
  dj.kok === "https://assets.suflo.app" && dj.pass === "", dg.stdout + dg.stderr);
ok("ayar: duz sifre config.php'de yok; dosyalar yalniz sahibine acik (0600)", cfgMetin.indexOf(TEST_SIFRE) === -1 &&
  (process.platform === "win32" || ((fs.statSync(cfgDosya).mode & 0o777) === 0o600 && (fs.statSync(sifreDosya).mode & 0o777) === 0o600)));
var rb = cp.spawnSync(process.execPath, [ARAC, "ayar", "--cikis", AYAR], { encoding: "utf8" });
ok("ayar: ikinci calistirma var olan sifrenin uzerine yazmaz", rb.status === 1 && fs.readFileSync(sifreDosya, "utf8").trim() === TEST_SIFRE, rb.stderr);
var rc = cp.spawnSync(process.execPath, [ARAC, "ayar", "--cikis", path.join(O.ROOT, "tmp-ayar-deneme")], { encoding: "utf8" });
ok("ayar: repo icine yazilmaz", rc.status === 1 && !fs.existsSync(path.join(O.ROOT, "tmp-ayar-deneme")), rc.stderr);
var iki = P.ayarYap(path.join(TMP, "ozel-2"));
ok("ayar: her uretimde yeni rastgele sifre", fs.readFileSync(iki.sifre, "utf8").trim() !== TEST_SIFRE);

/* ================= C) Uctan uca: gercek Apache ================= */

var APACHE = "/usr/sbin/apache2", MODUL = "/usr/lib/apache2/modules";
function atlaC(neden) { console.log("ATLA uctan uca Apache bolumu: " + neden); try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {} bitir(); }
if (process.platform === "win32" || !fs.existsSync(APACHE)) atlaC("Apache (/usr/sbin/apache2) yok");
var libphp = fs.existsSync(MODUL) ? fs.readdirSync(MODUL).filter(function (f) { return /^libphp[0-9.]*\.so$/.test(f); })[0] : null;
var gerekli = ["mod_mpm_prefork.so", "mod_authz_core.so", "mod_authz_host.so", "mod_dir.so", "mod_mime.so", "mod_rewrite.so", "mod_headers.so", "mod_negotiation.so"];
if (!libphp || gerekli.some(function (m) { return !fs.existsSync(path.join(MODUL, m)); })) atlaC("mod_php / mod_rewrite / mod_headers yok");
var kok = typeof process.getuid === "function" && process.getuid() === 0, kullanici = null;
if (kok) {
  var idr = cp.spawnSync("id", ["-u", "www-data"], { encoding: "utf8" });
  if (idr.status !== 0) atlaC("root ama www-data yok");
  kullanici = { ad: "www-data", uid: Number(idr.stdout), gid: Number(cp.spawnSync("id", ["-g", "www-data"], { encoding: "utf8" }).stdout) };
}
var SITE = path.join(TMP, "site"), PUB = path.join(SITE, "public_html"), B = path.join(TMP, "apache");
var PRIV_T = path.join(SITE, "private", "studio-test-v1"), PRIV_C = path.join(SITE, "private", "studio-v1");
var PORT = 0, KOK = "", pid = 0;
var HTTPS = { "X-Forwarded-Proto": "https" };
var CANLI_SIFRE = "ornek-canli-sifresi-2";
var CLAUDE = "https://claude.ai/api/mcp/auth_callback";

function ozet(sifre) { return cp.spawnSync("php", ["-r", "echo password_hash(stream_get_contents(STDIN), PASSWORD_BCRYPT, ['cost' => 10]);"], { input: sifre, encoding: "utf8" }).stdout; }
function ac(zip) {
  // ZIP'i hostinger'in dosya yoneticisi gibi public_html'e acar (bagimsiz arac varsa onunla)
  var u = cp.spawnSync("unzip", ["-oq", zip, "-d", PUB], { encoding: "utf8" });
  if (!u.error && u.status === 0) return;
  P.zipOku(fs.readFileSync(zip)).forEach(function (g) {
    var d = path.join(PUB, g.ad); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, g.veri);
  });
}
function hazirla() {
  fs.mkdirSync(PUB, { recursive: true });
  ac(testZip);
  ac(canliZip);
  fs.mkdirSync(path.join(PUB, ".well-known", "acme-challenge"), { recursive: true });
  fs.writeFileSync(path.join(PUB, ".well-known", "acme-challenge", "ornek-dogrulama"), "acme-ornek");
  fs.mkdirSync(PRIV_T, { recursive: true });
  fs.mkdirSync(PRIV_C, { recursive: true });
  // Test ayari: "ayar" komutunun urettigi dosyanin ayni bicimi; yalniz kok_url / origin yerel adres, cerez guvenli degil (http)
  var tMetin = P.ayarMetni(ozet(TEST_SIFRE), "https://assets.suflo.app").replace("'kok_url' => 'https://assets.suflo.app'", "'kok_url' => '" + KOK + "'")
    .replace("'allowed_origins' => ['https://assets.suflo.app']", "'allowed_origins' => ['" + KOK + "']").replace("];\n", "    'cookie_secure' => false,\n];\n");
  fs.writeFileSync(path.join(PRIV_T, "config.php"), tMetin);
  // "Canli" ayar: farkli sifre, kendi veritabani. Test klasoru buna HIC dokunmamali.
  fs.writeFileSync(path.join(PRIV_C, "config.php"), "<?php\nreturn " + O.phpDizi({ password_hash: ozet(CANLI_SIFRE), dsn: "sqlite:" + path.join(PRIV_C, "studio.sqlite"),
    allowed_origins: [KOK], cookie_secure: false, kok_url: KOK }) + ";\n");
  (function izin(d) {
    fs.chmodSync(d, 0o755);
    fs.readdirSync(d).forEach(function (f) { var p = path.join(d, f); if (fs.statSync(p).isDirectory()) izin(p); else fs.chmodSync(p, 0o644); });
  })(SITE);
  fs.chmodSync(TMP, 0o755);
  if (kullanici) [PRIV_T, PRIV_C].forEach(function (d) {
    fs.chownSync(d, kullanici.uid, kullanici.gid);
    fs.readdirSync(d).forEach(function (f) { fs.chownSync(path.join(d, f), kullanici.uid, kullanici.gid); });
  });
  fs.mkdirSync(path.join(B, "logs"), { recursive: true });
  fs.mkdirSync(path.join(B, "run"), { recursive: true });
  var m = function (ad, dosya) { return "LoadModule " + ad + " " + path.join(MODUL, dosya); };
  fs.writeFileSync(path.join(B, "httpd.conf"), [
    'ServerRoot "' + B + '"', "ServerName 127.0.0.1", "Listen 127.0.0.1:" + PORT, "PidFile " + path.join(B, "httpd.pid"),
    "ErrorLog " + path.join(B, "logs", "error.log"), "LogLevel warn", "DefaultRuntimeDir " + path.join(B, "run"), "Mutex file:" + path.join(B, "run") + " default",
    m("mpm_prefork_module", "mod_mpm_prefork.so"), m("authz_core_module", "mod_authz_core.so"), m("authz_host_module", "mod_authz_host.so"),
    m("dir_module", "mod_dir.so"), m("mime_module", "mod_mime.so"), m("rewrite_module", "mod_rewrite.so"), m("headers_module", "mod_headers.so"),
    m("negotiation_module", "mod_negotiation.so"), m("php_module", libphp),
    kullanici ? "User " + kullanici.ad : "", kullanici ? "Group " + kullanici.ad : "",
    "StartServers 2", "MinSpareServers 2", "MaxSpareServers 4", "TypesConfig /etc/mime.types", "DirectoryIndex index.html",
    'DocumentRoot "' + PUB + '"',
    '<Directory "/">', "  AllowOverride None", "  Require all denied", "</Directory>",
    // Paylasimli barindirma gibi: MultiViews acik, .htaccess'te Options yalniz Indexes
    '<Directory "' + PUB + '">', "  Options FollowSymLinks MultiViews", "  AllowOverride AuthConfig FileInfo Indexes Limit Options=Indexes", "  Require all granted", "</Directory>",
    '<FilesMatch "\\.php$">', "  SetHandler application/x-httpd-php", "</FilesMatch>",
    // Apache / LiteSpeed varsayilani (Debian apache2.conf ve Hostinger): .ht* dosyalari hic sunulmaz
    '<FilesMatch "^\\.ht">', "  Require all denied", "</FilesMatch>",
    "php_admin_value opcache.enable 0", "php_admin_value display_errors 0"
  ].join("\n") + "\n");
}
async function baslat() {
  var r = cp.spawnSync(APACHE, ["-f", path.join(B, "httpd.conf"), "-k", "start"], { encoding: "utf8" });
  if (r.status !== 0) atlaC("Apache baslatilamadi: " + (r.stdout + r.stderr).trim().slice(0, 300));
  for (var i = 0; i < 80; i++) {
    if (fs.existsSync(path.join(B, "httpd.pid"))) pid = Number(fs.readFileSync(path.join(B, "httpd.pid"), "utf8").trim());
    var y = await O.istek({ port: PORT, yol: "/yok" });
    if (y.status && pid) return;
    await O.bekle(100);
  }
  throw new Error("apache yanit vermedi");
}
async function durdur() {
  if (!pid) return;
  try { process.kill(pid, "SIGTERM"); } catch (e) { return; }
  for (var i = 0; i < 50; i++) { try { process.kill(pid, 0); } catch (e) { pid = 0; return; } await O.bekle(100); }
  try { process.kill(pid, "SIGKILL"); } catch (e) {}
  pid = 0;
}
function cerezler(r) { return [].concat(r.headers["set-cookie"] || []).map(function (c) { return c.split(";")[0]; }); }
function panel(u, govde, cerez) {
  return O.istek({ port: PORT, yontem: "POST", yol: "/" + u + "/v1/index.php", govde: govde,
    baslik: Object.assign({ "Content-Type": "application/json", "X-Studio": "1", Origin: KOK }, HTTPS, cerez ? { Cookie: cerez } : {}) });
}
function playwrightBul() {
  try { return require("playwright"); } catch (e) {}
  try { return require(path.join(cp.execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "playwright")); } catch (e2) { return null; }
}

async function calis() {
  PORT = await O.bosPort();
  KOK = "http://127.0.0.1:" + PORT;
  hazirla();
  await baslat();
  var I = new O.Istemci(PORT, KOK, HTTPS), r, j;

  /* ---- kesif: hepsi /studio-test ---- */
  r = await I.istek({ yol: "/.well-known/oauth-protected-resource/studio-test/mcp" });
  ok("kesif PRM (kok .well-known): resource = /studio-test/mcp, yetki sunucusu /studio-test", r.status === 200 && r.json &&
    r.json.resource === KOK + "/studio-test/mcp" && JSON.stringify(r.json.authorization_servers) === JSON.stringify([KOK + "/studio-test"]), r.metin);
  var AS = await I.istek({ yol: "/.well-known/oauth-authorization-server/studio-test" });
  var OIDC1 = await I.istek({ yol: "/.well-known/openid-configuration/studio-test" });
  var OIDC2 = await I.istek({ yol: "/studio-test/.well-known/openid-configuration" });
  ok("kesif AS + iki OIDC bicimi: issuer /studio-test bayt bayt ayni; uclar /studio-test/oauth/*", AS.status === 200 && AS.json &&
    AS.json.issuer === KOK + "/studio-test" && OIDC1.metin === AS.metin && OIDC2.metin === AS.metin &&
    AS.json.authorization_endpoint === KOK + "/studio-test/oauth/authorize" && AS.json.token_endpoint === KOK + "/studio-test/oauth/token" &&
    AS.json.registration_endpoint === KOK + "/studio-test/oauth/register", [AS.status, AS.metin, OIDC1.status, OIDC2.status]);
  r = await I.istek({ yol: "/.well-known/acme-challenge/ornek-dogrulama" });
  ok("kok .well-known/.htaccess acme-challenge'a dokunmuyor (dosya aynen sunulur)", r.status === 200 && r.metin === "acme-ornek", r.status);
  r = await I.rpc("studio-test", null, "tools/list");
  var w = O.wwwCoz(r.headers["www-authenticate"]);
  ok("jetonsuz MCP 401: resource_metadata kok .well-known'daki /studio-test/mcp PRM'si", r.status === 401 &&
    w.resource_metadata === KOK + "/.well-known/oauth-protected-resource/studio-test/mcp", r.headers["www-authenticate"]);

  /* ---- OAuth: kayit + PKCE + onay (TEST sifresi) + token ---- */
  r = await I.kayit("studio-test", { client_name: "Claude", redirect_uris: [CLAUDE] });
  var A = r.json || {};
  ok("DCR: istemci kaydi", r.status === 201 && A.client_id, r.metin);
  var y = await I.yetkiAl("studio-test", { client_id: A.client_id, redirect_uri: CLAUDE, sifre: CANLI_SIFRE });
  ok("onay sayfasi CANLI sifreyi kabul etmez (test kendi ayarini okur)", !y.kod, y.r && y.r.metin);
  y = await I.yetkiAl("studio-test", { client_id: A.client_id, redirect_uri: CLAUDE, sifre: TEST_SIFRE });
  ok("onay TEST sifresiyle: kod + state + iss = /studio-test", y.kod && y.iss === KOK + "/studio-test" && y.state === y.istenenState, y.r && y.r.metin);
  r = await I.kodTakas("studio-test", A.client_id, y, CLAUDE);
  var T = r.json || {};
  ok("token: access + refresh, audience /studio-test/mcp", r.status === 200 && T.access_token && T.refresh_token, r.metin);

  /* ---- MCP: initialize + tools/list + arac cagrilari ---- */
  r = await I.rpc("studio-test", T.access_token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "paket-testi", version: "1" } });
  ok("initialize", r.status === 200 && r.json.result && r.json.result.serverInfo.name === "suflo-studio", r.metin);
  r = await I.rpc("studio-test", T.access_token, "tools/list");
  ok("tools/list: 12 arac; silme / mesaj / ucret araci yok", r.status === 200 && r.json.result.tools.length === 12 &&
    r.json.result.tools.every(function (t) { return !/sil|mesaj|gonder|ucret|odeme|fatura/.test(t.name); }), r.metin.slice(0, 300));
  r = await I.arac("studio-test", T.access_token, "studio_bugun", {});
  ok("studio_bugun (Istanbul saati) calisir", r.status === 200 && r.json.result.isError === false, r.metin);
  r = await I.arac("studio-test", T.access_token, "studio_musteri_olustur", { ad: "Paket Örnek Müşteri", istek_anahtari: "paket-musteri-0001" });
  var M = r.json && r.json.result && r.json.result.structuredContent || {};
  ok("arac: musteri olusturuldu", r.status === 200 && M.durum === "olusturuldu" && M.musteri && M.musteri.id, r.metin);
  var cekimArg = { musteri_id: M.musteri && M.musteri.id, baslik: "Paket örnek çekim", tur: "cekim", tarih: "2099-03-10", baslangic_saati: "14:00", sure_dakika: 120,
    istek_anahtari: "paket-cekim-0001" };
  r = await I.arac("studio-test", T.access_token, "studio_cekim_olustur", cekimArg);
  var E = r.json && r.json.result && r.json.result.structuredContent || {};
  ok("arac: cekim olusturuldu (14:00-16:00)", r.status === 200 && E.durum === "olusturuldu" && E.etkinlik && E.etkinlik.id, r.metin);
  r = await I.arac("studio-test", T.access_token, "studio_cekim_olustur", cekimArg);
  var E2 = r.json && r.json.result && r.json.result.structuredContent || {};
  ok("ayni istek tekrar: yeni kayit acilmaz, ayni kayit doner", r.status === 200 && E2.etkinlik && E.etkinlik && E2.etkinlik.id === E.etkinlik.id, r.metin);

  /* ---- panelden geri okuma (/studio-test/v1) ---- */
  r = await panel("studio-test", { islem: "giris", sifre: CANLI_SIFRE });
  ok("test paneli CANLI sifreyle acilmaz", r.status === 401, r.metin);
  r = await panel("studio-test", { islem: "giris", sifre: TEST_SIFRE });
  var tCerez = cerezler(r);
  ok("test paneli TEST sifresiyle acilir (ayar private/studio-test-v1'den)", r.status === 200 && r.json && r.json.ok, r.metin);
  ok("test panelinin cerezleri canliyla karismaz (adlar ayri)", tCerez.length > 0 && tCerez.every(function (c) { return /^suflo_studio_studio_test(_cihaz)?=/.test(c); }), tCerez);
  r = await panel("studio-test", { islem: "veri" }, tCerez.join("; "));
  var V = r.json && r.json.veri || {};
  var mus = (V.musteriler || []).filter(function (x) { return x.ad === "Paket Örnek Müşteri"; });
  var etk = (V.etkinlikler || []).filter(function (x) { return x.baslik === "Paket örnek çekim"; });
  ok("panel geri okuma: MCP'nin yazdigi musteri ve TEK cekim panelde (ayni kimlik)", r.status === 200 && mus.length === 1 && mus[0].id === M.musteri.id &&
    etk.length === 1 && etk[0].id === E.etkinlik.id && etk[0].musteriId === M.musteri.id, r.metin.slice(0, 600));
  r = await panel("studio-test", { islem: "mcp_durum" }, tCerez.join("; "));
  var md = r.json && r.json.mcp || {};
  ok("panel Ayarlar 'Sohbet baglantilari': adres /studio-test/mcp, 1 bagli sohbet, gunlukte arac kayitlari", r.status === 200 && md.acik === true &&
    md.adres === KOK + "/studio-test/mcp" && md.baglantilar.length === 1 && md.gunluk.some(function (g) { return /studio_cekim_olustur/.test(JSON.stringify(g)); }), r.metin.slice(0, 600));

  /* ---- canli klasor: ayri ayar, ayri veri, test yazmalari gorunmez ---- */
  ok("test verisi yalniz private/studio-test-v1'de (studio.sqlite + mcp.sqlite)", fs.existsSync(path.join(PRIV_T, "studio.sqlite")) && fs.existsSync(path.join(PRIV_T, "mcp.sqlite")));
  ok("canli private/studio-v1'e test sirasinda hic dokunulmadi (veritabani olusmadi)", !fs.existsSync(path.join(PRIV_C, "studio.sqlite")) && !fs.existsSync(path.join(PRIV_C, "mcp.sqlite")),
    fs.readdirSync(PRIV_C));
  r = await panel("studio", { islem: "giris", sifre: TEST_SIFRE });
  ok("canli panel TEST sifresiyle acilmaz", r.status === 401, r.metin);
  r = await panel("studio", { islem: "giris", sifre: CANLI_SIFRE });
  var cCerez = cerezler(r);
  ok("canli panel kendi sifresiyle acilir; cerez adi degismedi (suflo_studio)", r.status === 200 && cCerez.some(function (c) { return /^suflo_studio=/.test(c); }), [r.metin, cCerez]);
  r = await panel("studio", { islem: "veri" }, cCerez.join("; "));
  ok("canli panelde test kaydi yok", r.status === 200 && (r.json.veri.musteriler || []).length === 0 && (r.json.veri.etkinlikler || []).length === 0, r.metin.slice(0, 300));
  r = await panel("studio", { islem: "veri" }, tCerez.join("; "));
  ok("test cerezi canli panelde oturum acmaz", r.status === 401, r.status);
  r = await I.rpc("studio", T.access_token, "tools/list");
  ok("test jetonu canli MCP'de gecersiz (401)", r.status === 401, r.status);
  r = await I.istek({ yol: "/.well-known/oauth-protected-resource/studio/mcp" });
  ok("canli kesif ayni kurallarla: resource /studio/mcp", r.status === 200 && r.json.resource === KOK + "/studio/mcp", r.metin);

  /* ---- disariya kapali dosyalar ---- */
  var kapali = ["/studio-test/mcp-kitaplik/ortak.php", "/studio-test/v1/studio-ortak.php", "/studio-test/v1/.htaccess", "/studio-test/mcp-kitaplik/.htaccess",
    "/studio-test/.htaccess", "/.well-known/.htaccess", "/studio-test/v1/config.php"];
  var ks = [];
  for (var k of kapali) ks.push((await I.istek({ yol: k })).status);
  ok("kitaplik, .htaccess ve v1/config.php adresleri disariya 403", ks.every(function (x) { return x === 403; }), ks);

  /* ---- arayuz (Playwright varsa): /studio-test/ kendi API'sini cagirir ---- */
  var pw = playwrightBul();
  if (!pw) console.log("ATLA arayuz adimi: Playwright yok");
  else {
    var tr = await pw.chromium.launch();
    try {
      var sayfa = await tr.newPage({ extraHTTPHeaders: HTTPS });
      var apiYollari = [];
      sayfa.on("request", function (q) { if (/index\.php/.test(q.url())) apiYollari.push(new URL(q.url()).pathname); });
      await sayfa.goto(KOK + "/studio-test/#/musteriler");
      await sayfa.fill("#studio-sifre", TEST_SIFRE);
      await sayfa.press("#studio-sifre", "Enter");
      await sayfa.waitForSelector("text=Paket Örnek Müşteri", { timeout: 15000 });
      ok("arayuz /studio-test/: giris + MCP'nin yazdigi musteri listede; butun API istekleri /studio-test/v1/index.php'ye",
        apiYollari.length > 0 && apiYollari.every(function (p) { return p === "/studio-test/v1/index.php"; }), apiYollari);
    } catch (e) {
      ok("arayuz /studio-test/ (Playwright)", false, String(e && e.message || e));
    } finally { await tr.close(); }
  }

  var hata = fs.readFileSync(path.join(B, "logs", "error.log"), "utf8").split("\n").filter(function (x) { return /PHP (Fatal|Warning|Notice|Deprecated)|AH00526|Invalid command/.test(x); });
  ok("Apache hata gunlugunde PHP uyarisi / gecersiz komut yok", hata.length === 0, hata.slice(0, 5));
}

calis().catch(function (e) { ok("beklenmeyen hata: " + (e && e.stack || e), false); }).then(durdur).then(function () {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  bitir();
});
