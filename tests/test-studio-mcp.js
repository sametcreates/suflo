/*
 * Suflo Studio uzak MCP sunucusu (server/studio-v1/mcp): gercek php -S + .htaccess kurallarini taklit eden yonlendirici
 * + sahte arka uc (tests/fixtures/studio-mcp/arka-sahte.php). Yalniz anonim ornek veri.
 *  - kesif: 401 basligindan PRM'ye, oradan AS metadata'ya (4 adres, issuer bayt bayt ayni); studio / studio-test ayri ayar
 *  - DCR (redirect izin listesi, hiz siniri, istemci asla ezilmez) -> onay sayfasi (sifre + CSRF + cerez) -> kod -> PKCE ile jeton
 *  - MCP: eski donem (initialize 2025-03-26/06-18/11-25) ve yeni donem (2026-07-28: _meta, server/discover, Mcp-* basliklari)
 *  - araclar: sema dogrulama, capraz kurallar, cakisma, mukerrer, toplu onizle / uygula (tek kullanimlik kod, tekrar = ilk sonuc)
 *  - yenileme jetonu donusumu, eski jetonla tekrar -> grant iptal; RFC 7009 iptal; kod tekrari -> jetonlar iptal
 *  - eszamanli yenileme toleransi (60 sn, halef kullanilmamis, ayni istemci, sifre izi ayni) ve pencere disinda / halef kullanilmis -> tam iptal
 *  - DCR genel kotasi yalniz basarili kayitlari sayar (429 + Retry-After), sayac sifirlama islevi, 6 saatlik budama; depo 1 -> 2 yukseltmesi
 *  - isError sonucunda structuredContent outputSchema'ya uyar ya da hic gonderilmez
 *  - olumsuzlar: jetonsuz 401 (error yok), gecersiz / suresi dolmus / yanlis audience 401 invalid_token, okuma jetonuyla yazma
 *    403 insufficient_scope, PKCE yok / plain, izinsiz redirect_uri, CSRF yok, yanlis sifre panel kilidinde sayilir, kapatma
 *    anahtari, sifre izi degisince grant'ler gecersiz, buyuk / toplu / bozuk JSON, bilinmeyen yontem / arac, GET 405, kotu Origin 403
 * Ikinci bolum GERCEK arka uc (mcp-kitaplik/arka-studio.php) + gecici gercek Studio veritabani + panel API (v1/index.php):
 *  - tam OAuth (onay sifresi panelin kilidinden: ayni girisler sayaci), uctan uca "Yarin 14.00 Özge cekim, 2 saat. Cuma Yusuf'a
 *    3 reels teslim." cagrilari ve sonucun PANELDEN (giris + veri) okunmasi
 *  - yetkisiz erisim (jeton yok / gecersiz / iptal / sifre degisti / okuma jetonuyla yazma), yanlis veri, belirsiz / olmayan musteri,
 *    mukerrer (ayni anahtar, paralel, farkli girdi), cakisma (cekim + edit blogu), beklenen_surum, toplu + anlik kopya + panelden
 *    geri yukleme, islem gunlugu, hicbir ciktida ucret yok
 * php ya da pdo_sqlite yoksa ATLA.
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var O = require("./_studio-mcp-ortak.js");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(typeof ek === "string" ? ek : JSON.stringify(ek)).slice(0, 600) + "]" : "")); }

var phpVar = cp.spawnSync("php", ["-v"], { encoding: "utf8" });
if (phpVar.error || phpVar.status !== 0) {
  console.log("ATLA php bulunamadi: Studio MCP testi calismadi");
  process.exit(0);
}

/* ---------------- Statik denetimler ---------------- */
var K = O.MCP_KAYNAK;
var phpler = ["mcp-giris.php", "oauth-giris.php", "kesif-giris.php"].map(function (f) { return path.join(K, f); })
  .concat(fs.readdirSync(path.join(K, "mcp-kitaplik")).filter(function (f) { return /\.php$/.test(f); }).map(function (f) { return path.join(K, "mcp-kitaplik", f); }))
  .concat([O.SAHTE_ARKA, path.join(__dirname, "fixtures", "studio-mcp", "yonlendirici.php")]);
phpler.forEach(function (f) {
  var r = cp.spawnSync("php", ["-l", f], { encoding: "utf8" });
  ok("php -l " + path.relative(O.ROOT, f), r.status === 0, r.stdout + r.stderr);
});
fs.readdirSync(path.join(K, "mcp-kitaplik")).filter(function (f) { return /\.php$/.test(f); }).forEach(function (f) {
  var t = fs.readFileSync(path.join(K, "mcp-kitaplik", f), "utf8");
  ok("kitaplik/" + f + ": dogrudan cagrilinca hicbir sey yapmaz (SUFLO_MCP korumasi)", /if \(!defined\('SUFLO_MCP'\)\) \{ http_response_code\(404\); exit; \}/.test(t));
});
var tumKod = phpler.slice(0, -2).map(function (f) { return fs.readFileSync(f, "utf8"); }).join("\n");
ok("ayar yolu panelle ayni kural: dirname(DOCUMENT_ROOT)/private/<uygulama>-v1, ortam degiskeni yok", /DOCUMENT_ROOT/.test(tumKod) && /'\/private\/' \. \$uyg \. '-v1'/.test(tumKod) && !/getenv\(/.test(tumKod));
ok("Pro lisans servisine dokunmaz (pro-v1 yok)", !/pro-v1/.test(tumKod));
ok("kok adres Host basligindan alinmaz", !/HTTP_HOST|SERVER_NAME/.test(tumKod));
var arayuzHt = fs.readFileSync(path.join(O.ROOT, "server", "studio-v1", "arayuz.htaccess"), "utf8");
var studioHt = fs.readFileSync(path.join(K, "studio.htaccess"), "utf8");
var kurallar = arayuzHt.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return /^Header /.test(s); });
ok("studio.htaccess arayuz.htaccess'in butun guvenlik basliklarini aynen icerir (" + kurallar.length + " satir)", kurallar.length === 5 &&
  kurallar.every(function (s) { return studioHt.split(/\r?\n/).map(function (x) { return x.trim(); }).indexOf(s) !== -1; }) && /Options -Indexes/.test(studioHt));
ok("studio.htaccess: mcp / oauth / kesif yeniden yazma + Authorization gecisi + kitaplik kapali", /RewriteRule \^mcp\$ mcp-giris\.php \[L,QSA,E=HTTP_AUTHORIZATION:%\{HTTP:Authorization\}\]/.test(studioHt) &&
  /RewriteRule \^oauth\/\(authorize\|token\|register\|revoke\)\$ oauth-giris\.php/.test(studioHt) && /RewriteRule \^mcp-kitaplik\(\/\|\$\) - \[F,L\]/.test(studioHt) &&
  /openid-configuration/.test(studioHt) && /X-LiteSpeed-Cache-Control/.test(studioHt) && /<FilesMatch "\^\(mcp\|oauth\|kesif\)-giris\\\.php\$">/.test(studioHt));
// MultiViews: "Options -MultiViews" Options degisikligine izin vermeyen sunucuda 500 verir. Onun yerine hicbir giris dosyasi
// bir istek yolu parcasi + uzanti olmamali (MultiViews "mcp" / "oauth/token" istegini mcp.* / oauth.* dosyasina eslerdi).
var arayuzSatir = arayuzHt.split(/\r?\n/), studioSatir = studioHt.split(/\r?\n/);
ok("studio.htaccess 4. satiri arayuz.htaccess'in Options satiriyla ayni; MultiViews yok (" + studioSatir[3] + ")",
  studioSatir[3] === arayuzSatir[1] && /^Options /.test(studioSatir[3]) && !/MultiViews/i.test(studioHt.replace(/^\s*#.*$/gm, "")), [studioSatir[3], arayuzSatir[1]]);
var yolParcalari = ["mcp", "oauth", ".well-known"];
var cakisan = fs.readdirSync(K).filter(function (f) { return yolParcalari.indexOf(f.replace(/\.[^.]+$/, "")) !== -1 && f.indexOf(".") > 0; });
ok("giris dosyalarinin adi istek yolu parcasiyla ayni degil (MultiViews guvenli): mcp-giris.php, oauth-giris.php, kesif-giris.php", cakisan.length === 0 &&
  ["mcp-giris.php", "oauth-giris.php", "kesif-giris.php"].every(function (f) { return fs.existsSync(path.join(K, f)); }), cakisan);
var rwSatir = studioSatir.map(function (x) { return x.trim(); });
var rwBas = rwSatir.indexOf("RewriteEngine On");
ok("studio.htaccess: RewriteEngine On'dan hemen sonra acik https yonlendirmesi (kok .htaccess'teki /studio/ altinda artik islemez)",
  rwBas !== -1 && rwSatir.slice(rwBas + 1).filter(function (x) { return x && x[0] !== "#"; }).slice(0, 3).join("\n") ===
  "RewriteCond %{HTTPS} !=on\nRewriteCond %{HTTP:X-Forwarded-Proto} !=https\nRewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]", rwSatir.slice(rwBas, rwBas + 6));
var mcpBeni = fs.readFileSync(path.join(K, "README.md"), "utf8");
ok("mcp/README dagitim tablosu giris dosyalarinin yeni adlarini ve .htaccess eslemesini tasir (DAGITIM ile ayni)", O.DAGITIM.filter(function (d) { return /\.(php|htaccess)$/.test(d[0]); })
  .every(function (d) { return mcpBeni.indexOf("| `" + d[0] + "` | `" + d[1].replace("<u>", "studio") + "` |") !== -1; }) && !/`(mcp|oauth|kesif)\.php`/.test(mcpBeni));
var studioBeni = fs.readFileSync(path.join(O.ROOT, "server", "studio-v1", "README.md"), "utf8").split(/\r?\n/);
var arayuzKoy = studioBeni.filter(function (x) { return /arayuz\.htaccess/.test(x) && /(\.htaccess` adıyla|<-)/.test(x); });
ok("studio-v1/README: arayuz.htaccess'i .htaccess olarak koyduran her satir MCP kuruluysa mcp/studio.htaccess'i soyler (yoksa MCP yollari duser)",
  arayuzKoy.length >= 3 && arayuzKoy.every(function (x) { return /mcp\/studio\.htaccess/.test(x); }), arayuzKoy);
var wkHt = fs.readFileSync(path.join(K, "well-known.htaccess"), "utf8");
var wkKurallar = wkHt.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return /^RewriteRule/.test(s); });
ok(".well-known/.htaccess yalniz tam kesif adlarini esler; acme-challenge'a dokunan / yasaklayan / her seyi yakalayan kural yok",
  wkKurallar.length === 3 && wkKurallar.every(function (s) { return /^RewriteRule \^(oauth-protected-resource|oauth-authorization-server|openid-configuration)\/\(studio\|studio-test\)(\/mcp)?\$ \/\$1\/kesif-giris\.php \[L\]$/.test(s); }) &&
  !/acme|Require|Deny|Redirect|RewriteCond|\(\.\*\)|\^\.\*/i.test(wkHt.replace(/^#.*$/gm, "")), wkKurallar);
ok("mcp-kitaplik/.htaccess: Require all denied", /Require all denied/.test(fs.readFileSync(path.join(K, "mcp-kitaplik", ".htaccess"), "utf8")));
var onayJs = fs.readFileSync(path.join(K, "mcp-onay.js"), "utf8");
ok("onay sayfasi betigi: ayni kaynaga fetch, X-Suflo-Onay, satir ici kod yok", /X-Suflo-Onay/.test(onayJs) && /credentials: "same-origin"/.test(onayJs) && cp.spawnSync(process.execPath, ["--check", path.join(K, "mcp-onay.js")]).status === 0);

var sqliteVar = cp.spawnSync("php", ["-r", "echo in_array('sqlite', PDO::getAvailableDrivers()) ? 'var' : 'yok';"], { encoding: "utf8" });
if (sqliteVar.stdout !== "var") {
  console.log("ATLA php pdo_sqlite yok: Studio MCP testinin kalani calismadi");
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
}

/* ---------------- Kurulum ---------------- */
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-mcp-"));
var PUB = O.kur(TMP, ["studio", "studio-test"]);
var DB = path.join(TMP, "private", "studio-v1", "mcp.sqlite");
var SAHTE_DB = path.join(TMP, "private", "studio-v1", "sahte-studio.sqlite");
var DB_TEST = path.join(TMP, "private", "studio-test-v1", "mcp.sqlite");
var PORT = 0, KOK = "", phpSurec = null, I = null, phpGunluk = "";
var CLAUDE = "https://claude.ai/api/mcp/auth_callback";
var GPT = "https://chatgpt.com/connector/oauth/abc_DEF-123";
function ayar(ek) { O.ayarYaz(TMP, "studio", KOK, ek); }
function sayaclariSifirla(dosya) { O.db(dosya || DB, "DELETE FROM mcp_sayac"); }
/** Panelin yapacagi gibi kitapligi dogrudan yukler (php -r) ve kodu calistirir. Doner: stdout (hata varsa ekli). */
function phpKitaplik(u, kod) {
  var r = cp.spawnSync("php", ["-r", "define('SUFLO_MCP', 1); require $argv[1] . '/mcp-kitaplik/yukle.php'; mcp_baslat($argv[1]); " + kod, path.join(PUB, u)], { encoding: "utf8" });
  return (r.stdout || "") + (r.status !== 0 || r.stderr ? " [cikis " + r.status + "] " + r.stderr : "");
}
function simdi() { return Math.floor(Date.now() / 1000); }
// Sema surumu 1 (ilk yayimlanan) depo: yerinde 1 -> 2 yukseltmesinin kaniti icin studio-test'e onceden yazilir
var SEMA1 = [
  "CREATE TABLE mcp_ayar (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL)",
  "CREATE TABLE mcp_istemci (id TEXT PRIMARY KEY, ad TEXT NOT NULL, yonlendirmeler TEXT NOT NULL, yontem TEXT NOT NULL, sir_ozet TEXT NULL, uygulama_turu TEXT NOT NULL, kapsam TEXT NOT NULL, olusturma INTEGER NOT NULL, ip_ozet TEXT NOT NULL, son_kullanim INTEGER NULL)",
  "CREATE TABLE mcp_onay (id TEXT PRIMARY KEY, csrf_ozet TEXT NOT NULL, cerez_ozet TEXT NOT NULL, istemci TEXT NOT NULL, yonlendirme TEXT NOT NULL, yonlendirme_acik INTEGER NOT NULL, durum_param TEXT NULL, meydan TEXT NOT NULL, kaynak TEXT NOT NULL, kapsam TEXT NOT NULL, olusturma INTEGER NOT NULL, son INTEGER NOT NULL, kullanildi INTEGER NOT NULL DEFAULT 0, deneme INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE mcp_izin (id TEXT PRIMARY KEY, istemci TEXT NOT NULL, kapsam TEXT NOT NULL, kaynak TEXT NOT NULL, sifre_izi TEXT NOT NULL, olusturma INTEGER NOT NULL, bitis INTEGER NOT NULL, son_kullanim INTEGER NULL, durum TEXT NOT NULL, iptal_nedeni TEXT NULL, iptal_zamani INTEGER NULL)",
  "CREATE INDEX mcp_izin_istemci ON mcp_izin (istemci)",
  "CREATE TABLE mcp_kod (ozet TEXT PRIMARY KEY, izin TEXT NOT NULL, istemci TEXT NOT NULL, yonlendirme TEXT NOT NULL, yonlendirme_acik INTEGER NOT NULL, meydan TEXT NOT NULL, kaynak TEXT NOT NULL, kapsam TEXT NOT NULL, olusturma INTEGER NOT NULL, son INTEGER NOT NULL, kullanildi INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE mcp_jeton (ozet TEXT PRIMARY KEY, tur TEXT NOT NULL, izin TEXT NOT NULL, istemci TEXT NOT NULL, kapsam TEXT NOT NULL, kaynak TEXT NOT NULL, olusturma INTEGER NOT NULL, son INTEGER NOT NULL, durum TEXT NOT NULL)",
  "CREATE INDEX mcp_jeton_izin ON mcp_jeton (izin)",
  "CREATE TABLE mcp_toplu (kod_ozet TEXT PRIMARY KEY, izin TEXT NOT NULL, islemler TEXT NOT NULL, islem_ozeti TEXT NOT NULL, olusturma INTEGER NOT NULL, son INTEGER NOT NULL, durum TEXT NOT NULL, sonuc TEXT NULL, alinma INTEGER NULL)",
  "CREATE TABLE mcp_gunluk (sira INTEGER PRIMARY KEY AUTOINCREMENT, zaman INTEGER NOT NULL, istemci TEXT NOT NULL, olay TEXT NOT NULL, sonuc TEXT NOT NULL, etkilenen TEXT NOT NULL, ozet TEXT NOT NULL)",
  "CREATE TABLE mcp_sayac (anahtar TEXT PRIMARY KEY, pencere INTEGER NOT NULL, sayi INTEGER NOT NULL)",
  "INSERT INTO mcp_ayar (anahtar, deger) VALUES ('sema', '1')",
  "INSERT INTO mcp_jeton (ozet, tur, izin, istemci, kapsam, kaynak, olusturma, son, durum) VALUES ('eski-surum-jetonu', 'yenileme', 'eski-izin', 'eski-istemci', 'studio.oku', 'x', 1, 4102444800, 'kullanildi')"
];

function baslat() {
  return new Promise(function (res, rej) {
    // log_errors: PHP uyarilari stderr'e (mcp_baslat display_errors'u kapatir; uyarilar yanitta gorunmez, burada yakalanir)
    phpSurec = cp.spawn("php", ["-d", "display_errors=1", "-d", "error_reporting=-1", "-d", "log_errors=1", "-d", "opcache.enable=0", "-S", "127.0.0.1:" + PORT, "-t", PUB,
      path.join(__dirname, "fixtures", "studio-mcp", "yonlendirici.php")],
    { stdio: ["ignore", "ignore", "pipe"], detached: process.platform !== "win32", env: Object.assign({}, process.env, { PHP_CLI_SERVER_WORKERS: "4" }) });
    phpSurec.stderr.on("data", function (d) { phpGunluk += d.toString(); });
    var n = 0;
    (function dene() {
      O.istek({ port: PORT, yol: "/yok" }).then(function (r) {
        if (r.status) return res();
        if (++n > 80) return rej(new Error("php -S baslamadi"));
        setTimeout(dene, 100);
      });
    })();
  });
}
function durdur() {
  return new Promise(function (res) {
    if (!phpSurec) return res();
    var p = phpSurec;
    var t = setTimeout(function () { try { if (process.platform !== "win32") process.kill(-p.pid, "SIGKILL"); else p.kill("SIGKILL"); } catch (e) {} }, 3000);
    p.once("exit", function () { clearTimeout(t); phpSurec = null; res(); });
    try { if (process.platform !== "win32") process.kill(-p.pid, "SIGTERM"); else p.kill(); } catch (e) { clearTimeout(t); res(); }
  });
}

async function calis() {
  PORT = await O.bosPort();
  KOK = "http://127.0.0.1:" + PORT;
  ayar();
  O.ayarYaz(TMP, "studio-test", KOK);
  SEMA1.forEach(function (q) { O.db(DB_TEST, q); });
  await baslat();
  I = new O.Istemci(PORT, KOK);
  var r, w, j;

  /* ================= Kesif ================= */
  r = await I.rpc("studio", null, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  w = O.wwwCoz(r.headers["www-authenticate"]);
  ok("jetonsuz MCP istegi: 401 + WWW-Authenticate Bearer resource_metadata + scope, error ozniteligi YOK",
    r.status === 401 && w.sema === "Bearer" && w.resource_metadata === KOK + "/.well-known/oauth-protected-resource/studio/mcp" &&
    w.scope === "studio.oku studio.yaz" && w.error === undefined, [r.status, r.headers["www-authenticate"]]);
  ok("401 yanitinda Cache-Control no-store ve LiteSpeed onbellek kapali", /no-store/.test(r.headers["cache-control"] || "") && r.headers["x-litespeed-cache-control"] === "no-cache");
  var prmYol = new URL(w.resource_metadata).pathname;
  r = await I.istek({ yol: prmYol });
  var prm = r.json || {};
  ok("PRM (401 basligindaki adres): 200 JSON, resource = MCP adresi tam, authorization_servers = issuer, scopes, header",
    r.status === 200 && /application\/json/.test(r.headers["content-type"]) && prm.resource === KOK + "/studio/mcp" &&
    JSON.stringify(prm.authorization_servers) === JSON.stringify([KOK + "/studio"]) && JSON.stringify(prm.scopes_supported) === '["studio.oku","studio.yaz"]' &&
    JSON.stringify(prm.bearer_methods_supported) === '["header"]', r.metin);
  var asYollar = ["/.well-known/oauth-authorization-server/studio", "/.well-known/openid-configuration/studio", "/studio/.well-known/openid-configuration", "/studio/.well-known/oauth-authorization-server"];
  var asMetinler = [];
  for (var ai = 0; ai < asYollar.length; ai++) { r = await I.istek({ yol: asYollar[ai] }); asMetinler.push(r.status === 200 ? r.metin : "HTTP " + r.status); }
  var asm = JSON.parse(asMetinler[0].indexOf("HTTP") === 0 ? "{}" : asMetinler[0]);
  ok("AS metadata 4 adreste ayni belge; issuer bayt bayt ayni (" + asm.issuer + ")", asMetinler.every(function (t) { return t === asMetinler[0]; }) &&
    asMetinler.every(function (t) { return t.indexOf('"issuer":"' + KOK + '/studio"') !== -1; }), asMetinler);
  ok("AS metadata: S256, iss parametresi, code + authorization_code/refresh_token, kayit / iptal uclari, none dahil",
    JSON.stringify(asm.code_challenge_methods_supported) === '["S256"]' && asm.authorization_response_iss_parameter_supported === true &&
    JSON.stringify(asm.response_types_supported) === '["code"]' && JSON.stringify(asm.grant_types_supported) === '["authorization_code","refresh_token"]' &&
    asm.authorization_endpoint === KOK + "/studio/oauth/authorize" && asm.token_endpoint === KOK + "/studio/oauth/token" &&
    asm.registration_endpoint === KOK + "/studio/oauth/register" && asm.revocation_endpoint === KOK + "/studio/oauth/revoke" &&
    asm.token_endpoint_auth_methods_supported.indexOf("none") !== -1 && asm.client_id_metadata_document_supported === undefined, asm);
  ok("PRM ve 401 kapsaminda offline_access yok; AS kapsaminda var", prm.scopes_supported.indexOf("offline_access") === -1 && asm.scopes_supported.indexOf("offline_access") !== -1);
  r = await I.istek({ yol: "/.well-known/oauth-protected-resource/studio-test/mcp" });
  var r2 = await I.istek({ yol: "/.well-known/oauth-authorization-server/studio-test" });
  ok("studio-test: ayri uygulama klasoru -> ayri ayar (private/studio-test-v1), resource ve issuer kendi adresi",
    r.json && r.json.resource === KOK + "/studio-test/mcp" && r2.json && r2.json.issuer === KOK + "/studio-test", [r.metin, r2.metin]);
  r = await I.istek({ yol: "/.well-known/oauth-protected-resource" });
  r2 = await I.istek({ yol: "/studio/kesif-giris.php" });
  ok("eslenmeyen kok PRM adresi 404; kesif-giris.php dogrudan cagrilinca 404", r.status === 404 && r2.status === 404, [r.status, r2.status]);
  r = await I.istek({ yol: "/studio/oauth-giris.php" });
  ok("oauth-giris.php dogrudan cagrilinca 404", r.status === 404, r.status);
  r = await I.istek({ yol: "/studio/mcp-kitaplik/ortak.php" });
  ok("kitaplik klasoru disaridan kapali (403)", r.status === 403, r.status);
  r = await I.istek({ yontem: "POST", yol: "/.well-known/oauth-authorization-server/studio" });
  ok("kesif belgesine POST 405", r.status === 405, r.status);

  /* ================= DCR ================= */
  r = await I.kayit("studio", { client_name: "Claude", redirect_uris: [CLAUDE], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" });
  var A = r.json || {};
  ok("DCR: 201, client_id, public istemci (none), sir yok, no-store", r.status === 201 && typeof A.client_id === "string" && A.client_id.length >= 20 &&
    A.token_endpoint_auth_method === "none" && A.client_secret === undefined && JSON.stringify(A.redirect_uris) === JSON.stringify([CLAUDE]) &&
    /no-store/.test(r.headers["cache-control"] || ""), r.metin);
  r = await I.kayit("studio", { client_name: "ChatGPT", redirect_uris: [GPT] });
  var C = r.json || {};
  ok("DCR: ChatGPT callback onekli adres (connector/oauth/<id>) kabul", r.status === 201 && C.client_id, r.metin);
  r = await I.kayit("studio", { client_name: "Gizli", redirect_uris: [CLAUDE], token_endpoint_auth_method: "client_secret_basic" });
  var D = r.json || {};
  ok("DCR: sirli istemci (client_secret_basic) -> client_secret + client_secret_expires_at 0", r.status === 201 && typeof D.client_secret === "string" && D.client_secret_expires_at === 0, r.metin);
  r = await I.kayit("studio", { client_name: "<b>Kötü</b> \"ad\"", redirect_uris: [CLAUDE] });
  var B = r.json || {};
  ok("DCR: ayni bilgilerle ikinci kayit yeni istemci acar (var olan ezilmez)", r.status === 201 && B.client_id && B.client_id !== A.client_id);
  // Olumsuz kayitlar studio-test'te (hiz siniri sayaci ayri)
  var kotuKayit = [
    [{ redirect_uris: ["https://kotu.ornek/cb"] }, "invalid_redirect_uri", "izin listesinde olmayan https adres"],
    [{ redirect_uris: ["https://chatgpt.com/connector/oauth/../x"] }, "invalid_redirect_uri", "onekte nokta bolumu"],
    [{ redirect_uris: ["https://chatgpt.com/connector/oauth/a/b"] }, "invalid_redirect_uri", "onekten sonra birden cok yol parcasi"],
    [{ redirect_uris: ["http://claude.ai/api/mcp/auth_callback"] }, "invalid_redirect_uri", "http (yerel olmayan)"],
    [{ redirect_uris: [CLAUDE + "#x"] }, "invalid_redirect_uri", "parca (#) iceren"],
    [{ redirect_uris: [CLAUDE], token_endpoint_auth_method: "private_key_jwt" }, "invalid_client_metadata", "private_key_jwt"],
    [{ redirect_uris: [CLAUDE], grant_types: ["client_credentials"] }, "invalid_client_metadata", "client_credentials"],
    [{ redirect_uris: [] }, "invalid_redirect_uri", "bos redirect_uris"],
    [{ redirect_uris: [CLAUDE], grant_types: [["authorization_code"]] }, "invalid_client_metadata", "ic ice liste (grant_types)"]
  ];
  for (var ki = 0; ki < kotuKayit.length; ki++) {
    r = await I.kayit("studio-test", kotuKayit[ki][0]);
    ok("DCR reddi: " + kotuKayit[ki][2] + " -> 400 " + kotuKayit[ki][1], r.status === 400 && r.json && r.json.error === kotuKayit[ki][1], r.metin);
  }
  r = await I.istek({ yontem: "POST", yol: "/studio-test/oauth/register", baslik: { "Content-Type": "text/plain" }, govde: "{}" });
  ok("DCR: JSON olmayan govde 400", r.status === 400, r.status);
  var sayac = function (anahtar) { var x = O.db(DB_TEST, "SELECT sayi FROM mcp_sayac WHERE anahtar = ?", [anahtar])[0]; return x ? x.sayi : 0; };
  var ipSayac = O.db(DB_TEST, "SELECT sayi FROM mcp_sayac WHERE anahtar LIKE 'kayit|ip|%'")[0];
  ok("DCR: reddedilen (bozuk) kayitlar genel gunluk kotayi tuketmez; IP basina sinir onlari da sayar", sayac("kayit|toplam") === 0 && ipSayac && ipSayac.sayi === kotuKayit.length,
    [sayac("kayit|toplam"), ipSayac]);
  var jetonSutun = O.db(DB_TEST, "PRAGMA table_info(mcp_jeton)").map(function (c) { return c.name; });
  var gunlukSutun = O.db(DB_TEST, "PRAGMA table_info(mcp_gunluk)").map(function (c) { return c.name; });
  ok("depo semasi 1 -> 2 -> 3 yerinde yukseltildi (mcp_jeton: donusum, halef, ebeveyn; mcp_gunluk.izin; mcp_istek); eski satirlar korundu", O.db(DB_TEST, "SELECT deger FROM mcp_ayar WHERE anahtar = 'sema'")[0].deger === "3" &&
    ["donusum", "halef", "ebeveyn"].every(function (c) { return jetonSutun.indexOf(c) !== -1; }) && gunlukSutun.indexOf("izin") !== -1 &&
    O.db(DB_TEST, "SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name = 'mcp_istek'")[0].c === 1 &&
    O.db(DB_TEST, "SELECT durum, donusum FROM mcp_jeton WHERE ozet = 'eski-surum-jetonu'")[0].durum === "kullanildi", jetonSutun);
  sayaclariSifirla(DB_TEST);
  var kayitlar = [];
  for (var hi = 0; hi < 11; hi++) kayitlar.push((await I.kayit("studio-test", { client_name: "Seri " + hi, redirect_uris: [CLAUDE] })).status);
  ok("DCR hiz siniri: ayni IP'den saatte 10 kayit, 11. -> 429", kayitlar.slice(0, 10).every(function (s) { return s === 201; }) && kayitlar[10] === 429, kayitlar);
  ok("DCR: genel sayac yalniz basarili kayitlari saydi (10)", sayac("kayit|toplam") === 10, sayac("kayit|toplam"));
  sayaclariSifirla(DB_TEST);
  O.db(DB_TEST, "INSERT INTO mcp_sayac (anahtar, pencere, sayi) VALUES ('kayit|toplam', ?, 50)", [Math.floor(simdi() / 86400) * 86400]);
  var istemciSay = function () { return O.db(DB_TEST, "SELECT COUNT(*) AS c FROM mcp_istemci")[0].c; };
  var is0 = istemciSay();
  r = await I.kayit("studio-test", { client_name: "Kota", redirect_uris: [CLAUDE] });
  var ra = Number(r.headers["retry-after"]);
  ok("DCR genel sinir (gunde 50) dolu: gecerli kayit -> 429, RFC 7591 hata govdesi (error + error_description), Retry-After, istemci acilmadi",
    r.status === 429 && r.json && r.json.error === "temporarily_unavailable" && typeof r.json.error_description === "string" && ra > 0 && ra <= 86400 &&
    /no-store/.test(r.headers["cache-control"] || "") && istemciSay() === is0, [r.status, r.metin, r.headers["retry-after"]]);
  r = await I.kayit("studio-test", { redirect_uris: ["https://kotu.ornek/cb"] });
  ok("DCR: genel sinir doluyken bozuk kayit yine 400 invalid_redirect_uri (dogrulama sayactan once)", r.status === 400 && r.json && r.json.error === "invalid_redirect_uri" &&
    sayac("kayit|toplam") === 50, r.metin);
  var sifirla = phpKitaplik("studio-test", "echo json_encode(mcp_kayit_sayaci_sifirla());");
  r = await I.kayit("studio-test", { client_name: "Sifirdan sonra", redirect_uris: [CLAUDE] });
  ok("depo: mcp_kayit_sayaci_sifirla() (Ayarlar icin) genel sayaci sifirlar; sonra kayit 201", sifirla === "true" && r.status === 201 && sayac("kayit|toplam") === 1 &&
    O.db(DB_TEST, "SELECT COUNT(*) AS c FROM mcp_gunluk WHERE olay = 'kayit_sayaci_sifirla'")[0].c === 1, [sifirla, r.status, sayac("kayit|toplam")]);
  // Budama: hic baglanmamis istemci 6 saat sonra silinir; baglanmis istemci ve 6 saatten yeni olan kalir
  var seri = O.db(DB_TEST, "SELECT id FROM mcp_istemci WHERE ad LIKE 'Seri %' ORDER BY ad LIMIT 3").map(function (x) { return x.id; });
  O.db(DB_TEST, "UPDATE mcp_istemci SET olusturma = ? WHERE id IN (?, ?)", [simdi() - 7 * 3600, seri[0], seri[1]]);
  O.db(DB_TEST, "UPDATE mcp_istemci SET son_kullanim = ? WHERE id = ?", [simdi() - 7 * 3600, seri[1]]);
  O.db(DB_TEST, "UPDATE mcp_istemci SET olusturma = ? WHERE id = ?", [simdi() - 5 * 3600, seri[2]]);
  var buda = phpKitaplik("studio-test", "mcp_buda(true);");
  var kalanlar = O.db(DB_TEST, "SELECT id FROM mcp_istemci WHERE id IN (?, ?, ?)", seri).map(function (x) { return x.id; });
  ok("budama: hic baglanmamis istemci 6 saatten sonra silinir; baglanmis ve 6 saatten yeni istemci kalir", buda === "" && seri.length === 3 &&
    kalanlar.indexOf(seri[0]) === -1 && kalanlar.indexOf(seri[1]) !== -1 && kalanlar.indexOf(seri[2]) !== -1, [buda, kalanlar]);

  /* ================= authorize GET ================= */
  var pk = O.pkce();
  function yp(ek) {
    return Object.assign({ response_type: "code", client_id: A.client_id, redirect_uri: CLAUDE, code_challenge: pk.challenge, code_challenge_method: "S256",
      state: "s-123", scope: "studio.oku studio.yaz", resource: KOK + "/studio/mcp" }, ek || {});
  }
  function hataYon(r, hata) {
    if (r.status !== 302) return false;
    var u = new URL(r.headers.location);
    return u.origin + u.pathname === CLAUDE && u.searchParams.get("error") === hata && u.searchParams.get("state") === "s-123" && u.searchParams.get("iss") === KOK + "/studio";
  }
  r = await I.yetkiSayfasi("studio", yp({ client_id: "bilinmeyen-istemci-1234567890" }));
  ok("authorize: bilinmeyen istemci -> 400 sayfa, yonlendirme YOK", r.status === 400 && !r.headers.location && /tanınmıyor/.test(r.metin), r.status);
  r = await I.yetkiSayfasi("studio", yp({ client_id: C.client_id }));
  ok("authorize: istemcinin kayitli olmayan redirect_uri -> 400 sayfa, acik yonlendirme yok", r.status === 400 && !r.headers.location, r.status);
  r = await I.yetkiSayfasi("studio", yp({ redirect_uri: "https://kotu.ornek/cb" }));
  ok("authorize: izin listesinde olmayan redirect_uri -> 400, yonlendirme yok", r.status === 400 && !r.headers.location, r.status);
  r = await I.yetkiSayfasi("studio", yp({ code_challenge: undefined, code_challenge_method: undefined }));
  ok("authorize: PKCE yok -> redirect error=invalid_request + state + iss (RFC 9207)", hataYon(r, "invalid_request"), r.headers.location);
  r = await I.yetkiSayfasi("studio", yp({ code_challenge_method: "plain", code_challenge: pk.verifier }));
  ok("authorize: PKCE plain reddedilir (invalid_request)", hataYon(r, "invalid_request"), r.headers.location);
  r = await I.yetkiSayfasi("studio", yp({ code_challenge_method: undefined }));
  ok("authorize: code_challenge_method yok (varsayilan plain) reddedilir", hataYon(r, "invalid_request"), r.headers.location);
  r = await I.yetkiSayfasi("studio", yp({ resource: KOK + "/studio-test/mcp" }));
  ok("authorize: baska kaynak (resource) -> invalid_target", hataYon(r, "invalid_target"), r.headers.location);
  r = await I.yetkiSayfasi("studio", yp({ scope: "openid profile" }));
  ok("authorize: taninmayan kapsam -> invalid_scope", hataYon(r, "invalid_scope"), r.headers.location);
  r = await I.yetkiSayfasi("studio", yp({ response_type: "token" }));
  ok("authorize: response_type=token -> unsupported_response_type", hataYon(r, "unsupported_response_type"), r.headers.location);
  r = await I.istek({ yol: "/studio/oauth/authorize?" + O.form(yp()) + "&scope=studio.oku" });
  ok("authorize: yinelenen parametre -> invalid_request", hataYon(r, "invalid_request"), r.headers.location);
  r = await I.yetkiSayfasi("studio", yp({ client_id: B.client_id, resource: KOK + "/studio/mcp/" }));
  var sayfa = I.sayfaCoz(r);
  ok("authorize: gecerli istek -> 200 onay sayfasi (resource sonunda / kanonik kabul)", r.status === 200 && /text\/html/.test(r.headers["content-type"]) && sayfa.istek && sayfa.csrf, r.status);
  ok("onay sayfasi: CSP frame-ancestors 'none' + X-Frame-Options DENY + noindex + no-store + no-referrer",
    /frame-ancestors 'none'/.test(r.headers["content-security-policy"] || "") && r.headers["x-frame-options"] === "DENY" && /noindex/.test(r.headers["x-robots-tag"] || "") &&
    /<meta name="robots" content="noindex, nofollow">/.test(r.metin) && /no-store/.test(r.headers["cache-control"] || "") && r.headers["referrer-policy"] === "no-referrer");
  ok("onay sayfasi: istemci adi kacisli, donus host'u, okuma zorunlu, yazma secilebilir, Turkce", r.metin.indexOf("&lt;b&gt;Kötü&lt;/b&gt; &quot;ad&quot;") !== -1 && r.metin.indexOf("<b>Kötü") === -1 &&
    /claude\.ai/.test(r.metin) && /checked disabled/.test(r.metin) && /id="yaz" checked/.test(r.metin) && /Studio şifresi/.test(r.metin) && /lang="tr"/.test(r.metin));
  ok("onay cerezi: HttpOnly + SameSite=Strict + Path=/", /HttpOnly/i.test(sayfa.cerezHam) && /SameSite=Strict/i.test(sayfa.cerezHam) && /path=\//i.test(sayfa.cerezHam), sayfa.cerezHam);
  r = await I.yetkiSayfasi("studio", yp({ scope: "studio.oku" }));
  ok("onay sayfasi: yalniz studio.oku istenince yazma kutusu yok", r.status === 200 && r.metin.indexOf('id="yaz"') === -1);

  /* ================= authorize POST (onay) ================= */
  r = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: O.SIFRE, yaz: "1" }, { sil: ["X-Suflo-Onay"] });
  ok("onay: X-Suflo-Onay basligi yok -> 403", r.status === 403, r.status);
  r = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: O.SIFRE, yaz: "1" }, { baslik: { Origin: "https://kotu.ornek" } });
  ok("onay: baska Origin -> 403", r.status === 403, r.status);
  r = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: O.SIFRE, yaz: "1" }, { sil: ["Origin"] });
  ok("onay: Origin yok -> 403", r.status === 403, r.status);
  r = await I.onayGonder("studio", { istek: sayfa.istek, csrf: "", cerez: sayfa.cerez }, { karar: "izin", sifre: O.SIFRE });
  ok("onay: CSRF jetonu yok -> 403", r.status === 403 && /Güvenlik/.test((r.json || {}).hata || ""), r.metin);
  r = await I.onayGonder("studio", { istek: sayfa.istek, csrf: sayfa.csrf.slice(0, -2) + "xx", cerez: sayfa.cerez }, { karar: "izin", sifre: O.SIFRE });
  ok("onay: yanlis CSRF -> 403", r.status === 403, r.status);
  r = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: O.SIFRE }, { cerezsiz: true });
  ok("onay: tarayici cerezi yok -> 403 (CSRF jetonu baska tarayicida kullanilamaz)", r.status === 403, r.status);
  // sahte arka ucun veritabani ilk sifre denemesinde olusur
  var girisSay = function () { return fs.existsSync(SAHTE_DB) ? O.db(SAHTE_DB, "SELECT COUNT(*) AS c FROM girisler")[0].c : 0; };
  var once = girisSay();
  r = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: "yanlis-sifre-1", yaz: "1" });
  var r3 = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: "yanlis-sifre-2", yaz: "1" });
  var r4 = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: "yanlis-sifre-3", yaz: "1" });
  ok("onay: yanlis sifre -> 401 'Şifre yanlış'; her deneme panel kilidinde (arka uc) sayildi", r.status === 401 && r3.status === 401 && r4.status === 401 &&
    (r.json || {}).hata === "Şifre yanlış." && girisSay() === once + 3, [r.status, girisSay() - once]);
  r = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: O.SIFRE, yaz: "1" });
  ok("onay: kilit (3 hatali deneme) -> dogru sifre de 429; kilitliyken deneme sayilmaz", r.status === 429 && girisSay() === once + 3, [r.status, r.metin]);
  O.db(SAHTE_DB, "DELETE FROM girisler");   // kilit penceresi gecmis gibi
  var g = O.db(DB, "SELECT COUNT(*) AS c FROM mcp_izin")[0].c;
  r = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: O.SIFRE, yaz: "1" });
  var yon = r.json && r.json.yonlendir ? new URL(r.json.yonlendir) : null;
  ok("onay: dogru sifre -> {yonlendir}: code + state aynen + iss = issuer", r.status === 200 && yon && yon.origin + yon.pathname === CLAUDE &&
    /^[A-Za-z0-9_-]{43}$/.test(yon.searchParams.get("code") || "") && yon.searchParams.get("state") === "s-123" && yon.searchParams.get("iss") === KOK + "/studio", r.metin);
  ok("onay: grant olustu; panel sifre izi grant'te saklandi", O.db(DB, "SELECT COUNT(*) AS c FROM mcp_izin")[0].c === g + 1 &&
    O.db(DB, "SELECT sifre_izi FROM mcp_izin ORDER BY olusturma DESC LIMIT 1")[0].sifre_izi === O.sha256("iz|" + fs.readFileSync(path.join(TMP, "private", "studio-v1", "config.php"), "utf8").match(/'password_hash' => '([^']+)'/)[1]));
  r = await I.onayGonder("studio", sayfa, { karar: "izin", sifre: O.SIFRE, yaz: "1" });
  ok("onay: ayni onay istegi ikinci kez -> 400 (tek kullanimlik)", r.status === 400, r.status);
  var kodB = yon && yon.searchParams.get("code");
  r = await I.yetkiSayfasi("studio", yp({ state: "s-123" }));
  var sRet = I.sayfaCoz(r);
  r = await I.onayGonder("studio", sRet, { karar: "ret" });
  yon = r.json && r.json.yonlendir ? new URL(r.json.yonlendir) : null;
  ok("onay: Reddet -> error=access_denied + state + iss", r.status === 200 && yon && yon.searchParams.get("error") === "access_denied" &&
    yon.searchParams.get("state") === "s-123" && yon.searchParams.get("iss") === KOK + "/studio", r.metin);
  sayaclariSifirla();

  /* ================= token ================= */
  r = await I.token("studio", { grant_type: "authorization_code", code: kodB, redirect_uri: CLAUDE, client_id: B.client_id });
  ok("token: code_verifier yok -> 400 invalid_grant", r.status === 400 && r.json && r.json.error === "invalid_grant", r.metin);
  r = await I.token("studio", { grant_type: "authorization_code", code: kodB, redirect_uri: CLAUDE, client_id: B.client_id, code_verifier: pk.verifier });
  ok("token: basarisiz denemeden sonra ayni kod yanmis (tek kullanimlik) -> invalid_grant", r.status === 400 && r.json && r.json.error === "invalid_grant", r.metin);

  var a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  ok("tam akis: kod alindi (state + iss dogru)", a.kod && a.state === a.istenenState && a.iss === KOK + "/studio", a.hata ? a.r.metin : "");
  r = await I.token("studio", { grant_type: "authorization_code", code: a.kod, redirect_uri: "https://claude.com/api/mcp/auth_callback", client_id: A.client_id, code_verifier: a.pk.verifier });
  ok("token: farkli redirect_uri -> invalid_grant (kod yanar)", r.status === 400 && r.json.error === "invalid_grant", r.metin);
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  r = await I.kodTakas("studio", B.client_id, a, CLAUDE);
  ok("token: kod baska istemciye verilmis -> invalid_grant", r.status === 400 && r.json.error === "invalid_grant", r.metin);
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  r = await I.kodTakas("studio", A.client_id, a, CLAUDE, { resource: KOK + "/studio-test/mcp" });
  ok("token: baska resource -> invalid_target", r.status === 400 && r.json.error === "invalid_target", r.metin);
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  r = await I.kodTakas("studio", A.client_id, a, CLAUDE, { code_verifier: O.pkce().verifier });
  ok("token: yanlis code_verifier -> invalid_grant", r.status === 400 && r.json.error === "invalid_grant", r.metin);
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  O.db(DB, "UPDATE mcp_kod SET son = 1 WHERE ozet = ?", [O.sha256(a.kod)]);
  r = await I.kodTakas("studio", A.client_id, a, CLAUDE);
  ok("token: suresi dolmus kod -> invalid_grant", r.status === 400 && r.json.error === "invalid_grant", r.metin);
  r = await I.token("studio", { grant_type: "password", client_id: A.client_id });
  var r5 = await I.token("studio", { client_id: A.client_id });
  ok("token: desteklenmeyen grant_type -> unsupported_grant_type; grant_type yok -> invalid_request",
    r.status === 400 && r.json.error === "unsupported_grant_type" && r5.status === 400 && r5.json.error === "invalid_request", [r.metin, r5.metin]);
  r = await I.istek({ yontem: "POST", yol: "/studio/oauth/token", baslik: { "Content-Type": "application/json" }, govde: { grant_type: "authorization_code" } });
  ok("token: JSON govde -> 400 invalid_request", r.status === 400 && r.json.error === "invalid_request", r.metin);
  r = await I.token("studio", { grant_type: "refresh_token", refresh_token: "x", client_id: "bilinmeyen-istemci-000000" });
  ok("token: bilinmeyen istemci -> 401 invalid_client", r.status === 401 && r.json.error === "invalid_client", r.metin);

  // Asil jetonlar (okuma + yazma)
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  r = await I.kodTakas("studio", A.client_id, a, CLAUDE);
  var T1 = r.json || {};
  ok("token: PKCE S256 ile kod -> access + refresh, Bearer, expires_in 3600, scope oku+yaz, no-store",
    r.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(T1.access_token || "") && /^[A-Za-z0-9_-]{43}$/.test(T1.refresh_token || "") && T1.token_type === "Bearer" &&
    T1.expires_in > 3500 && T1.expires_in <= 3600 && T1.scope === "studio.oku studio.yaz" && /no-store/.test(r.headers["cache-control"] || ""), r.metin);
  ok("depo: jetonlarin yalniz SHA-256 ozeti saklanir", O.db(DB, "SELECT COUNT(*) AS c FROM mcp_jeton WHERE ozet IN (?, ?)", [O.sha256(T1.access_token), O.sha256(T1.refresh_token)])[0].c === 2 &&
    O.db(DB, "SELECT COUNT(*) AS c FROM mcp_jeton WHERE ozet IN (?, ?)", [T1.access_token, T1.refresh_token])[0].c === 0);
  r = await I.kodTakas("studio", A.client_id, a, CLAUDE);
  ok("token: ayni kod ikinci kez (kod tekrari) -> invalid_grant", r.status === 400 && r.json.error === "invalid_grant", r.metin);
  r = await I.rpc("studio", T1.access_token, "tools/list");
  ok("kod tekrari: o koddan cikan access token iptal (401 invalid_token)", r.status === 401 && O.wwwCoz(r.headers["www-authenticate"]).error === "invalid_token", r.status);
  r = await I.yenile("studio", A.client_id, T1.refresh_token);
  ok("kod tekrari: o koddan cikan refresh token da iptal (invalid_grant)", r.status === 400 && r.json.error === "invalid_grant", r.metin);
  ok("kod tekrari gunluge yazildi", O.db(DB, "SELECT COUNT(*) AS c FROM mcp_gunluk WHERE olay = 'kod_tekrar'")[0].c >= 1);

  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  T1 = (await I.kodTakas("studio", A.client_id, a, CLAUDE)).json || {};
  var J = T1.access_token;
  // sirli istemci: Basic ve post
  a = await I.yetkiAl("studio", { client_id: D.client_id, redirect_uri: CLAUDE });
  r = await I.kodTakas("studio", D.client_id, a, CLAUDE);
  ok("sirli istemci: sir olmadan -> 401 invalid_client", r.status === 401 && r.json.error === "invalid_client", r.metin);
  a = await I.yetkiAl("studio", { client_id: D.client_id, redirect_uri: CLAUDE });
  r = await I.token("studio", { grant_type: "authorization_code", code: a.kod, redirect_uri: CLAUDE, code_verifier: a.pk.verifier },
    { Authorization: "Basic " + Buffer.from(encodeURIComponent(D.client_id) + ":" + encodeURIComponent(D.client_secret)).toString("base64") });
  var TD = r.json || {};
  ok("sirli istemci: client_secret_basic ile jeton", r.status === 200 && TD.access_token, r.metin);
  r = await I.yenile("studio", D.client_id, TD.refresh_token, { client_secret: D.client_secret });
  ok("sirli istemci: client_secret_post ile yenileme", r.status === 200 && r.json.access_token, r.metin);
  r = await I.yenile("studio", D.client_id, (r.json || {}).refresh_token, { client_secret: "yanlis" });
  ok("sirli istemci: yanlis sir -> 401 invalid_client", r.status === 401 && r.json.error === "invalid_client", r.metin);

  /* ================= MCP: eski donem ================= */
  r = await I.rpc("studio", J, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  j = r.json || {};
  ok("initialize 2025-06-18 -> ayni surum, tools yetenegi, serverInfo, Turkce talimat; oturum kimligi yok",
    r.status === 200 && j.result && j.result.protocolVersion === "2025-06-18" && j.result.capabilities.tools && j.result.capabilities.tools.listChanged === false &&
    j.result.serverInfo.name === "suflo-studio" && /studio_bugun/.test(j.result.instructions) && !r.headers["mcp-session-id"] &&
    /application\/json/.test(r.headers["content-type"]) && /no-store/.test(r.headers["cache-control"]), r.metin);
  var surumler = [];
  for (var sv of ["2025-11-25", "2025-03-26", "2024-11-05"]) surumler.push(((await I.rpc("studio", J, "initialize", { protocolVersion: sv, capabilities: {}, clientInfo: { name: "t", version: "1" } })).json.result || {}).protocolVersion);
  ok("initialize anlasmasi: 2025-11-25 -> ayni, 2025-03-26 -> 2025-06-18, bilinmeyen -> 2025-11-25", JSON.stringify(surumler) === '["2025-11-25","2025-06-18","2025-11-25"]', surumler);
  r = await I.mcp("studio", J, { jsonrpc: "2.0", method: "notifications/initialized" }, { "MCP-Protocol-Version": "2025-06-18" });
  ok("notifications/initialized -> 202, govde yok", r.status === 202 && r.metin === "", [r.status, r.metin]);
  r = await I.rpc("studio", J, "ping", {}, { "MCP-Protocol-Version": "2025-06-18" });
  ok("ping -> {} (nesne)", r.status === 200 && r.metin.indexOf('"result":{}') !== -1, r.metin);
  r = await I.rpc("studio", J, "tools/list", {}, { "MCP-Protocol-Version": "2025-11-25" });
  var araclar = (r.json && r.json.result && r.json.result.tools) || [];
  var beklenenAdlar = ["studio_bugun", "studio_musteri_ara", "studio_takvim", "studio_icerik_listele", "studio_musteri_olustur", "studio_cekim_olustur",
    "studio_icerik_olustur", "studio_edit_zamani_ayir", "studio_icerik_durum_guncelle", "studio_cekim_durum_guncelle", "studio_toplu_onizle", "studio_toplu_uygula"];
  ok("tools/list: 12 arac, sabit sira", JSON.stringify(araclar.map(function (t) { return t.name; })) === JSON.stringify(beklenenAdlar), araclar.map(function (t) { return t.name; }));
  ok("her arac: title + Turkce aciklama + inputSchema (object, additionalProperties:false) + outputSchema + 4 ipucu acik boolean",
    araclar.every(function (t) {
      var an = t.annotations || {};
      return t.title && t.description && t.description.length > 40 && t.inputSchema.type === "object" && t.inputSchema.additionalProperties === false &&
        t.outputSchema && t.outputSchema.type === "object" && ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"].every(function (k) { return typeof an[k] === "boolean"; }) &&
        an.openWorldHint === false && t.name.length <= 64 && /^[a-z_]+$/.test(t.name);
    }));
  var ipucu = {};
  araclar.forEach(function (t) { ipucu[t.name] = t.annotations; });
  ok("ipuclari: okuma araclari readOnly; olustur destructive=false idempotent; durum guncelle + toplu uygula destructive",
    ["studio_bugun", "studio_musteri_ara", "studio_takvim", "studio_icerik_listele", "studio_toplu_onizle"].every(function (n) { return ipucu[n].readOnlyHint === true && ipucu[n].destructiveHint === false; }) &&
    ["studio_musteri_olustur", "studio_cekim_olustur", "studio_icerik_olustur", "studio_edit_zamani_ayir"].every(function (n) { return ipucu[n].readOnlyHint === false && ipucu[n].destructiveHint === false && ipucu[n].idempotentHint === true; }) &&
    ["studio_icerik_durum_guncelle", "studio_cekim_durum_guncelle", "studio_toplu_uygula"].every(function (n) { return ipucu[n].readOnlyHint === false && ipucu[n].destructiveHint === true; }));
  ok("studio_bugun inputSchema.properties JSON'da {} (nesne)", r.metin.indexOf('"name":"studio_bugun"') !== -1 && /"inputSchema":\{"type":"object","properties":\{\},"additionalProperties":false\}/.test(r.metin));
  ok("yazma araclarinda istek_anahtari zorunlu; tarih / saat bicimleri semada", araclar.filter(function (t) { return /olustur$|_ayir$/.test(t.name); }).every(function (t) { return t.inputSchema.required.indexOf("istek_anahtari") !== -1; }) &&
    ipucu && araclar[5].inputSchema.properties.tarih.format === "date" && araclar[5].inputSchema.properties.baslangic_saati.pattern === "^([01][0-9]|2[0-3]):[0-5][0-9]$");

  r = await I.arac("studio", J, "studio_bugun");
  j = (r.json && r.json.result) || {};
  var bugunIst = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  ok("studio_bugun: Istanbul tarihi, gun adi, 14 gunluk tablo (yarin goreli)", j.isError === false && j.structuredContent && j.structuredContent.saat_dilimi === "Europe/Istanbul" &&
    (j.structuredContent.tarih === bugunIst || Math.abs(Date.parse(j.structuredContent.tarih) - Date.parse(bugunIst)) <= 86400000) && j.structuredContent.gunler.length === 14 &&
    j.structuredContent.gunler[1].goreli === "yarın" && /^(Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar)$/.test(j.structuredContent.gun_adi) &&
    j.content[0].type === "text" && /İstanbul/.test(j.content[0].text), r.metin);
  r = await I.arac("studio", J, "studio_musteri_ara", { sorgu: "ÖRNEK" });
  j = (r.json && r.json.result) || {};
  ok("studio_musteri_ara: Turkce harf duyarsiz; iki 'Örnek Kafe' (belirsiz -> model sormali); ucret yok", j.structuredContent && j.structuredContent.toplam === 2 &&
    r.metin.indexOf("ucret") === -1, r.metin);
  r = await I.arac("studio", J, "studio_takvim", { baslangic_tarihi: "2099-01-01", bitis_tarihi: "2099-03-15" });
  j = (r.json && r.json.result) || {};
  ok("studio_takvim: 62 gunden uzun aralik -> isError (Turkce), arka uca gitmez", r.status === 200 && j.isError === true && /62 gün/.test(j.content[0].text), r.metin);
  r = await I.arac("studio", J, "studio_takvim", { baslangic_tarihi: "2099-02-30", bitis_tarihi: "2099-03-01" });
  ok("studio_takvim: gecersiz tarih (30 Subat) -> isError", r.json.result.isError === true && /YYYY-AA-GG/.test(r.json.result.content[0].text), r.metin);
  r = await I.arac("studio", J, "studio_takvim", { baslangic_tarihi: "2099-01-01", bitis_tarihi: "2099-01-31" });
  j = (r.json && r.json.result) || {};
  var e1 = j.structuredContent && j.structuredContent.etkinlikler[0];
  ok("studio_takvim: aralikta etkinlik (id, surum, baslangic-bitis)", j.isError === false && e1 && e1.id === "bbbbbbbb0001" && e1.surum === 4, r.metin);
  r = await I.arac("studio", J, "studio_cekim_olustur", { musteri_id: "aaaaaaaa0002", baslik: "Yeni çekim", tur: "cekim", tarih: "2099-01-05", istek_anahtari: "anahtar-cekim-1" });
  ok("cekim_olustur: saat yok (muglak) -> isError, yazilmadi", r.json.result.isError === true && /baslangic_saati gerekli/.test(r.json.result.content[0].text), r.metin);
  r = await I.arac("studio", J, "studio_cekim_olustur", { musteri_id: "aaaaaaaa0002", baslik: "Yeni çekim", tur: "cekim", tarih: "2099-01-05", baslangic_saati: "11:00", bitis_saati: "12:00", sure_dakika: 60, istek_anahtari: "anahtar-cekim-1" });
  ok("cekim_olustur: bitis_saati ve sure_dakika birlikte -> isError", r.json.result.isError === true && /tam olarak biri/.test(r.json.result.content[0].text), r.metin);
  r = await I.arac("studio", J, "studio_cekim_olustur", { musteri_id: "aaaaaaaa0002", baslik: "Yeni çekim", tur: "cekim", tarih: "2099-01-05", baslangic_saati: "25:00", sure_dakika: 60, istek_anahtari: "anahtar-cekim-1", fazla: 1 });
  ok("cekim_olustur: gecersiz saat + bilinmeyen alan -> isError, ikisi de listelenir", r.json.result.isError === true && /baslangic_saati: SS:DD/.test(r.json.result.content[0].text) &&
    /fazla: bilinmeyen alan/.test(r.json.result.content[0].text), r.metin);
  r = await I.arac("studio", J, "studio_cekim_olustur", { musteri_id: "aaaaaaaa0002", baslik: "Yeni çekim", tur: "cekim", tarih: "2099-01-05", baslangic_saati: "11:00", sure_dakika: 120, istek_anahtari: "anahtar-cekim-1" });
  j = (r.json && r.json.result) || {};
  ok("cekim_olustur: cakisma -> durum cakisma, cakisanlar listesi, YAZILMADI", j.isError === false && j.structuredContent.durum === "cakisma" &&
    j.structuredContent.etkinlik === null && j.structuredContent.cakisanlar[0].id === "bbbbbbbb0001" && O.db(SAHTE_DB, "SELECT COUNT(*) AS c FROM etkinlik")[0].c === 1, r.metin);
  r = await I.arac("studio", J, "studio_cekim_olustur", { musteri_id: "aaaaaaaa0002", baslik: "Yeni çekim", tur: "cekim", tarih: "2099-01-05", baslangic_saati: "11:00", sure_dakika: 120, cakismayi_onayla: true, istek_anahtari: "anahtar-cekim-1" });
  j = (r.json && r.json.result) || {};
  var yeniCekim = j.structuredContent && j.structuredContent.etkinlik;
  ok("cekim_olustur: cakismayi_onayla -> olusturuldu; kimlik = sha256('mcp|'+grant+'|'+anahtar) ilk 24 hex", j.structuredContent && j.structuredContent.durum === "olusturuldu" &&
    yeniCekim && /^[0-9a-f]{24}$/.test(yeniCekim.id) && yeniCekim.bitis === "2099-01-05T13:00", r.metin);
  r = await I.arac("studio", J, "studio_cekim_olustur", { musteri_id: "aaaaaaaa0002", baslik: "Yeni çekim", tur: "cekim", tarih: "2099-01-05", baslangic_saati: "11:00", sure_dakika: 120, cakismayi_onayla: true, istek_anahtari: "anahtar-cekim-1" });
  ok("cekim_olustur: ayni istek_anahtari ile tekrar -> zaten_vardi, mukerrer yok", r.json.result.structuredContent.durum === "zaten_vardi" &&
    O.db(SAHTE_DB, "SELECT COUNT(*) AS c FROM etkinlik")[0].c === 2, r.metin);
  r = await I.arac("studio", J, "studio_musteri_olustur", { ad: "Yeni Müşteri", kurum: "Örnek A.Ş.", istek_anahtari: "anahtar-musteri-1" });
  var r6 = await I.arac("studio", J, "studio_musteri_olustur", { ad: "yeni müşteri", kurum: "örnek a.ş.", istek_anahtari: "anahtar-musteri-2" });
  ok("musteri_olustur: olusturuldu; ayni ad + kurum baska anahtarla -> zaten_vardi + uyari", r.json.result.structuredContent.durum === "olusturuldu" &&
    r6.json.result.structuredContent.durum === "zaten_vardi" && /zaten var/.test(r6.json.result.structuredContent.uyari || ""), [r.metin, r6.metin]);
  r = await I.arac("studio", J, "studio_icerik_olustur", { musteri_id: "aaaaaaaa9999", baslik: "X", tur: "reels", istek_anahtari: "anahtar-icerik-0" });
  ok("icerik_olustur: olmayan musteri -> isError (arka uc is hatasi)", r.json.result.isError === true && /Müşteri bulunamadı/.test(r.json.result.content[0].text), r.metin);
  var icerikSay = function () { return O.db(SAHTE_DB, "SELECT COUNT(*) AS c FROM icerik")[0].c; };
  var ic0 = icerikSay();
  r = await I.arac("studio", J, "studio_icerik_olustur", { musteri_id: "aaaaaaaa0001", baslik: "Haftalık reels", tur: "reels", adet: 3, teslim_tarihi: "2099-01-20", istek_anahtari: "anahtar-icerik-1" });
  j = (r.json && r.json.result) || {};
  var onayKodu = j.structuredContent && j.structuredContent.onay_kodu;
  ok("icerik_olustur adet=3: YAZMAZ, onizleme (3 satir) + onay_kodu + son_gecerlilik", j.isError === false && j.structuredContent.durum === "onay_gerekli" &&
    /^[A-Za-z0-9_-]{32}$/.test(onayKodu || "") && j.structuredContent.onizleme.satirlar.length === 3 && /\+03:00$/.test(j.structuredContent.son_gecerlilik) && icerikSay() === ic0, r.metin);
  // ayni kod iki paralel istekte: yalniz bir kez uygulanir
  var paralel = await Promise.all([I.arac("studio", J, "studio_toplu_uygula", { onay_kodu: onayKodu }), I.arac("studio", J, "studio_toplu_uygula", { onay_kodu: onayKodu })]);
  var durumlar = paralel.map(function (x) { var s = x.json && x.json.result; return s && s.structuredContent ? s.structuredContent.durum : (s && s.isError ? "isError" : "?"); });
  ok("toplu_uygula: ayni kod paralel iki kez -> tek uygulama (uygulandi + daha_once_uygulandi ya da suruyor)", durumlar.indexOf("uygulandi") !== -1 && icerikSay() === ic0 + 3, durumlar);
  var ilk = paralel.map(function (x) { return x.json.result; }).filter(function (s) { return s.structuredContent && s.structuredContent.durum === "uygulandi"; })[0];
  ok("toplu_uygula: etkilenen 3 kimlik + anlik kopya (mcp_toplu_oncesi)", ilk && ilk.structuredContent.etkilenen.length === 3 && typeof ilk.structuredContent.anlik_id === "string" &&
    O.db(SAHTE_DB, "SELECT COUNT(*) AS c FROM anlik WHERE neden = 'mcp_toplu_oncesi'")[0].c === 1);
  r = await I.arac("studio", J, "studio_toplu_uygula", { onay_kodu: onayKodu });
  j = (r.json && r.json.result) || {};
  ok("toplu_uygula: ayni kod yeniden -> daha_once_uygulandi, ayni etkilenen, mukerrer yok", j.structuredContent && j.structuredContent.durum === "daha_once_uygulandi" &&
    JSON.stringify(j.structuredContent.etkilenen) === JSON.stringify(ilk && ilk.structuredContent.etkilenen) && icerikSay() === ic0 + 3, r.metin);
  r = await I.arac("studio", J, "studio_toplu_uygula", { onay_kodu: "uydurma-onay-kodu-1234567890abcd" });
  ok("toplu_uygula: bilinmeyen kod -> isError", r.json.result.isError === true && /geçersiz/.test(r.json.result.content[0].text), r.metin);
  r = await I.arac("studio", J, "studio_toplu_onizle", { islemler: [{ islem: "icerik_olustur", musteri_id: "aaaaaaaa0001", baslik: "A", tur: "reels" }, { islem: "sil", id: "x" }] });
  j = (r.json && r.json.result) || {};
  ok("toplu_onizle: semaya uymayan islem (sil) -> isError, onay kodu yok", j.isError === true && /islem alanı/.test(j.content[0].text) && !/onay_kodu/.test(r.metin), r.metin);
  r = await I.arac("studio", J, "studio_toplu_onizle", { islemler: [{ islem: "icerik_olustur", musteri_id: "aaaaaaaa0001", baslik: "A", tur: "reels" },
    { islem: "icerik_olustur", musteri_id: "aaaaaaaa9999", baslik: "B", tur: "post" }] });
  j = (r.json && r.json.result) || {};
  ok("toplu_onizle: arka uc bir islemi reddeder (olmayan musteri) -> gecerli false, satir hata, onay_kodu null, hicbir sey yazilmaz",
    j.isError === false && j.structuredContent.gecerli === false && j.structuredContent.onay_kodu === null && j.structuredContent.satirlar[1].durum === "hata" &&
    icerikSay() === ic0 + 3, r.metin);
  r = await I.arac("studio", J, "studio_toplu_onizle", { islemler: [{ islem: "cekim_olustur", musteri_id: null, baslik: "Toplantı", tur: "toplanti", tarih: "2099-02-01", tum_gun: true },
    { islem: "icerik_durum", icerik_id: "cccccccc0001", yeni_durum: "onayda", beklenen_surum: 5 }] });
  j = (r.json && r.json.result) || {};
  var kod2 = j.structuredContent && j.structuredContent.onay_kodu;
  ok("toplu_onizle: gecerli karisik islemler (musterisiz tum gun + durum) -> onay_kodu", j.structuredContent && j.structuredContent.gecerli === true && kod2, r.metin);
  O.db(DB, "UPDATE mcp_toplu SET son = 1 WHERE kod_ozet = ?", [O.sha256(kod2)]);
  r = await I.arac("studio", J, "studio_toplu_uygula", { onay_kodu: kod2 });
  ok("toplu_uygula: 15 dakikasi dolmus kod -> isError (yeniden onizle)", r.json.result.isError === true && /süresi doldu/.test(r.json.result.content[0].text), r.metin);
  // Onizlemeden sonra musteri silinir: uygulama basarisiz (isError) ama structuredContent outputSchema'ya uymali ('sonuc' nesne, [] degil)
  O.db(SAHTE_DB, "INSERT INTO musteri VALUES ('aaaaaaaa0077', 'Gecici Müşteri', '', 0, 1)");
  r = await I.arac("studio", J, "studio_toplu_onizle", { islemler: [{ islem: "icerik_olustur", musteri_id: "aaaaaaaa0077", baslik: "Geçici", tur: "post" }] });
  var kod3 = r.json.result.structuredContent && r.json.result.structuredContent.onay_kodu;
  O.db(SAHTE_DB, "DELETE FROM musteri WHERE id = 'aaaaaaaa0077'");
  var araclarSema = {};
  araclar.forEach(function (t) { araclarSema[t.name] = t.outputSchema; });
  // outputSchema'nin ust duzey alanlari icin kucuk denetim: zorunlular var, tur (object / array / string / null) uyuyor
  function semayaUyar(v, sema) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return false;
    return (sema.required || []).every(function (k) { return k in v; }) && Object.keys(v).every(function (k) {
      var p = sema.properties[k]; if (!p) return sema.additionalProperties !== false;
      var turler = [].concat(p.type || (p.anyOf || []).map(function (x) { return x.type; }));
      var t = v[k] === null ? "null" : Array.isArray(v[k]) ? "array" : typeof v[k] === "number" ? (Number.isInteger(v[k]) ? "integer" : "number") : typeof v[k];
      return turler.length === 0 || turler.indexOf(t) !== -1 || (t === "integer" && turler.indexOf("number") !== -1);
    });
  }
  var hataSonuclari = [];
  for (var hk = 0; hk < 2; hk++) hataSonuclari.push(await I.arac("studio", J, "studio_toplu_uygula", { onay_kodu: kod3 }));
  ok("toplu_uygula basarisiz (isError) ve tekrari: structuredContent outputSchema'ya uyar ('sonuc' {} nesne, [] degil)", kod3 && hataSonuclari.every(function (x) {
    var s = x.json && x.json.result;
    return s && s.isError === true && s.structuredContent && s.structuredContent.durum === "basarisiz" && semayaUyar(s.structuredContent, araclarSema.studio_toplu_uygula) &&
      x.metin.indexOf('"sonuc":[]') === -1 && /Müşteri bulunamadı/.test(s.content[0].text);
  }), hataSonuclari.map(function (x) { return x.metin; }));
  r = await I.arac("studio", J, "studio_icerik_durum_guncelle", { icerik_id: "cccccccc0001", yeni_durum: "onayda", beklenen_surum: 4 });
  ok("icerik_durum_guncelle: eski surum -> isError (409) + structuredContent surum_uyusmadi + guncel kayit, yazilmadi", r.json.result.isError === true &&
    /409/.test(r.json.result.content[0].text) && r.json.result.structuredContent.durum === "surum_uyusmadi" && r.json.result.structuredContent.icerik.surum === 5, r.metin);
  r = await I.arac("studio", J, "studio_icerik_durum_guncelle", { icerik_id: "cccccccc0001", yeni_durum: "onayda", beklenen_surum: 5 });
  ok("icerik_durum_guncelle: dogru surum -> guncellendi, surum artti", r.json.result.structuredContent.durum === "guncellendi" && r.json.result.structuredContent.icerik.surum > 5, r.metin);
  r = await I.arac("studio", J, "studio_sil", {});
  ok("bilinmeyen arac -> JSON-RPC -32602", r.status === 200 && r.json.error && r.json.error.code === -32602, r.metin);
  r = await I.rpc("studio", J, "resources/list");
  ok("bilinmeyen yontem (eski donem) -> -32601", r.status === 200 && r.json.error && r.json.error.code === -32601, r.metin);
  r = await I.rpc("studio", J, "tools/list", {}, { "MCP-Protocol-Version": "2024-01-01" });
  ok("eski donem: desteklenmeyen MCP-Protocol-Version basligi -> 400", r.status === 400, r.status);
  ayar({ sahte_mesgul: true });
  r = await I.arac("studio", J, "studio_musteri_ara", { sorgu: "örnek" });
  ok("arka uc mesgul -> isError 'meşgul' (yeniden dene)", r.json.result.isError === true && /meşgul/.test(r.json.result.content[0].text), r.metin);
  ayar({ sahte_bozuk_cikti: true });
  r = await I.arac("studio", J, "studio_musteri_ara", { sorgu: "örnek" });
  ok("arka uc semaya uymayan cikti -> isError (outputSchema korunur)", r.json.result.isError === true && /beklenen biçimde değil/.test(r.json.result.content[0].text), r.metin);
  ayar({ sahte_hata_verisi: true });
  r = await I.arac("studio", J, "studio_musteri_ara", { sorgu: "örnek" });
  ok("is hatasi + semaya uymayan veri -> isError, structuredContent GONDERILMEZ, bilgi metin icerikte", r.json.result.isError === true && !("structuredContent" in r.json.result) &&
    /Arama yapılamadı/.test(r.json.result.content[0].text) && r.json.result.content.length >= 1, r.metin);
  ayar();
  var gunluk = O.db(DB, "SELECT * FROM mcp_gunluk WHERE olay = 'studio_cekim_olustur' AND sonuc = 'tamam' AND etkilenen <> '[]'");
  ok("islem gunlugu: zaman, istemci adi, arac, sonuc, etkilenen kimlikler, ozet", gunluk.length >= 1 && gunluk[0].istemci === "Claude" &&
    JSON.parse(gunluk[0].etkilenen)[0] === (yeniCekim && yeniCekim.id) && /Cekim/.test(gunluk[0].ozet));
  var hamDb = Buffer.concat([fs.readFileSync(DB)].concat(fs.existsSync(DB + "-wal") ? [fs.readFileSync(DB + "-wal")] : [])).toString("latin1");
  ok("depo dosyalarinda acik jeton / sir / sifre yok", hamDb.indexOf(J) === -1 && hamDb.indexOf(T1.refresh_token) === -1 && hamDb.indexOf(D.client_secret) === -1 && hamDb.indexOf(O.SIFRE) === -1);

  /* ================= MCP: yeni donem (2026-07-28) ================= */
  r = await I.yeni("studio", J, "server/discover");
  j = (r.json && r.json.result) || {};
  ok("server/discover: resultType complete, surumler (2026-07-28 + eski), tools, talimat, ttlMs, cacheScope private, serverInfo _meta",
    r.status === 200 && j.resultType === "complete" && j.supportedVersions.indexOf("2026-07-28") === 0 && j.supportedVersions.indexOf("2025-11-25") !== -1 &&
    j.capabilities.tools && typeof j.instructions === "string" && j.ttlMs > 0 && j.cacheScope === "private" && j._meta["io.modelcontextprotocol/serverInfo"].name === "suflo-studio" &&
    !r.headers["mcp-session-id"], r.metin);
  r = await I.yeni("studio", J, "tools/list");
  ok("yeni donem tools/list: resultType + ttlMs + cacheScope + 12 arac", r.status === 200 && r.json.result.resultType === "complete" && r.json.result.tools.length === 12 &&
    r.json.result.cacheScope === "private", r.metin);
  r = await I.yeni("studio", J, "tools/call", { name: "studio_bugun", arguments: {} });
  ok("yeni donem tools/call (Mcp-Name eslesiyor) -> resultType complete", r.status === 200 && r.json.result.resultType === "complete" && r.json.result.isError === false, r.metin);
  r = await I.yeni("studio", J, "tools/call", { name: "studio_bugun", arguments: {} }, { baslik: { "Mcp-Name": "=?base64?" + Buffer.from("studio_bugun").toString("base64") + "?=" } });
  ok("yeni donem: Mcp-Name =?base64?...?= bicimi cozulur", r.status === 200 && r.json.result.isError === false, r.metin);
  r = await I.yeni("studio", J, "tools/call", { name: "studio_bugun", arguments: {} }, { baslik: { "Mcp-Name": "studio_takvim" } });
  ok("yeni donem: Mcp-Name govdeyle ayni degil -> 400 / -32020", r.status === 400 && r.json.error.code === -32020, r.metin);
  r = await I.yeni("studio", J, "tools/call", { name: "studio_bugun", arguments: {} }, { sil: ["Mcp-Name"] });
  ok("yeni donem: tools/call'da Mcp-Name yok -> 400 / -32020", r.status === 400 && r.json.error.code === -32020, r.metin);
  r = await I.yeni("studio", J, "tools/list", {}, { baslik: { "Mcp-Method": "tools/call" } });
  ok("yeni donem: Mcp-Method uyusmuyor -> 400 / -32020", r.status === 400 && r.json.error.code === -32020, r.metin);
  r = await I.yeni("studio", J, "tools/list", {}, { sil: ["Mcp-Method"] });
  ok("yeni donem: Mcp-Method yok -> 400 / -32020", r.status === 400 && r.json.error.code === -32020, r.metin);
  r = await I.yeni("studio", J, "tools/list", {}, { baslik: { "MCP-Protocol-Version": "2025-11-25" } });
  ok("yeni donem: MCP-Protocol-Version _meta'dakiyle ayni degil -> 400 / -32020", r.status === 400 && r.json.error.code === -32020, r.metin);
  r = await I.yeni("studio", J, "tools/list", {}, { sil: ["MCP-Protocol-Version"] });
  ok("yeni donem: MCP-Protocol-Version yok -> 400 / -32020", r.status === 400 && r.json.error.code === -32020, r.metin);
  r = await I.yeni("studio", J, "tools/list", {}, { meta: { "io.modelcontextprotocol/protocolVersion": "2027-01-01" }, baslik: { "MCP-Protocol-Version": "2027-01-01" } });
  ok("yeni donem: desteklenmeyen surum -> 400 / -32022 + data.supported / requested", r.status === 400 && r.json.error.code === -32022 &&
    r.json.error.data.supported.indexOf("2026-07-28") !== -1 && r.json.error.data.requested === "2027-01-01", r.metin);
  r = await I.mcp("studio", J, { jsonrpc: "2.0", id: 77, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } }, { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/list" });
  ok("yeni donem: clientCapabilities eksik -> 400 / -32602", r.status === 400 && r.json.error.code === -32602 && r.json.id === 77, r.metin);
  r = await I.rpc("studio", J, "tools/list", {}, { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/list" });
  ok("yeni surum basligi ama _meta zarfi yok -> 400 / -32602", r.status === 400 && r.json.error.code === -32602, r.metin);
  r = await I.yeni("studio", J, "resources/list");
  var r7 = await I.yeni("studio", J, "ping");
  ok("yeni donem: bilinmeyen yontem ve ping -> 404 / -32601", r.status === 404 && r.json.error.code === -32601 && r7.status === 404, [r.metin, r7.status]);
  r = await I.rpc("studio", J, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } }, { "MCP-Protocol-Version": "2026-07-28" });
  ok("initialize + yeni surum basligi -> 400 / -32020", r.status === 400 && r.json.error.code === -32020, r.metin);
  r = await I.mcp("studio", J, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } });
  ok("yeni donem bildirimi -> 202", r.status === 202, r.status);

  /* ================= Tasima olumsuzlari ================= */
  r = await I.istek({ yol: "/studio/mcp", baslik: { Authorization: "Bearer " + J } });
  r2 = await I.istek({ yontem: "DELETE", yol: "/studio/mcp", baslik: { Authorization: "Bearer " + J } });
  ok("GET / DELETE /studio/mcp -> 405 Allow: POST (SSE yok)", r.status === 405 && r.headers.allow === "POST" && r2.status === 405, [r.status, r2.status]);
  r = await I.rpc("studio", J, "tools/list", {}, { Origin: "https://kotu.ornek" });
  r2 = await I.rpc("studio", J, "tools/list", {}, { Origin: "https://claude.ai" });
  ok("Origin: izin listesinde degilse 403; claude.ai kabul; Origin yoksa kabul", r.status === 403 && r2.status === 200, [r.status, r2.status]);
  r = await I.rpc("studio", null, "tools/list", {}, { Origin: "https://kotu.ornek" });
  ok("kotu Origin jetondan once reddedilir (403)", r.status === 403, r.status);
  r = await I.mcp("studio", J, "x".repeat(1048577));
  ok("1 MiB'den buyuk govde -> 413", r.status === 413, r.status);
  r = await I.mcp("studio", J, [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 2, method: "ping" }]);
  ok("JSON-RPC toplu dizi -> 400 / -32600", r.status === 400 && r.json.error.code === -32600, r.metin);
  r = await I.mcp("studio", J, "{bozuk json");
  ok("bozuk JSON -> 400 / -32700, id null", r.status === 400 && r.json.error.code === -32700 && r.json.id === null, r.metin);
  r = await I.mcp("studio", J, { jsonrpc: "2.0", id: null, method: "tools/list" });
  r2 = await I.mcp("studio", J, { jsonrpc: "2.0", id: 1.5, method: "tools/list" });
  ok("id null ya da kesirli -> 400 / -32600", r.status === 400 && r.json.error.code === -32600 && r2.status === 400, [r.metin, r2.metin]);
  r = await I.mcp("studio", J, { jsonrpc: "1.0", id: 1, method: "tools/list" });
  ok("jsonrpc 2.0 degil -> 400 / -32600", r.status === 400 && r.json.error.code === -32600, r.metin);
  r = await I.mcp("studio", J, { jsonrpc: "2.0", id: "abc", method: "tools/list" }, { "Content-Type": "text/plain" });
  ok("Content-Type application/json degil -> 415", r.status === 415, r.status);
  r = await I.mcp("studio", J, { jsonrpc: "2.0", id: "abc", method: "ping" });
  ok("metin id aynen geri doner", r.status === 200 && r.json.id === "abc", r.metin);
  r = await I.rpc("studio", "a".repeat(43), "tools/list");
  w = O.wwwCoz(r.headers["www-authenticate"]);
  ok("gecersiz jeton -> 401 error=\"invalid_token\" + resource_metadata", r.status === 401 && w.error === "invalid_token" && w.resource_metadata === KOK + "/.well-known/oauth-protected-resource/studio/mcp", r.headers["www-authenticate"]);
  r = await I.istek({ yontem: "POST", yol: "/studio/mcp?access_token=" + J, baslik: { "Content-Type": "application/json" }, govde: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  ok("sorgu dizesindeki access_token kabul edilmez (401, error yok)", r.status === 401 && O.wwwCoz(r.headers["www-authenticate"]).error === undefined, r.status);
  r = await I.rpc("studio", null, "tools/list", {}, { Authorization: "Basic " + Buffer.from("a:b").toString("base64") });
  ok("Basic kimlik bilgisi -> 401 (Bearer yok, error yok)", r.status === 401 && O.wwwCoz(r.headers["www-authenticate"]).error === undefined, r.status);
  r = await I.rpc("studio-test", J, "tools/list");
  ok("bir uygulamanin jetonu digerinde gecersiz (studio -> studio-test 401)", r.status === 401 && O.wwwCoz(r.headers["www-authenticate"]).error === "invalid_token", r.status);

  /* ================= Kapsam ================= */
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE, yaz: false });
  r = await I.kodTakas("studio", A.client_id, a, CLAUDE);
  var TO = r.json || {};
  ok("onayda yazma isaretlenmedi -> jeton kapsami yalniz studio.oku", r.status === 200 && TO.scope === "studio.oku", r.metin);
  r = await I.arac("studio", TO.access_token, "studio_musteri_olustur", { ad: "Okuyucu", istek_anahtari: "anahtar-okuma-1" });
  w = O.wwwCoz(r.headers["www-authenticate"]);
  ok("okuma jetonuyla yazma araci -> 403 insufficient_scope, scope=\"studio.oku studio.yaz\", resource_metadata", r.status === 403 && w.error === "insufficient_scope" &&
    w.scope === "studio.oku studio.yaz" && w.resource_metadata === KOK + "/.well-known/oauth-protected-resource/studio/mcp", [r.status, r.headers["www-authenticate"]]);
  r = await I.yeni("studio", TO.access_token, "tools/call", { name: "studio_toplu_uygula", arguments: { onay_kodu: onayKodu } });
  ok("okuma jetonuyla toplu_uygula (yeni donem) -> 403 insufficient_scope", r.status === 403 && O.wwwCoz(r.headers["www-authenticate"]).error === "insufficient_scope", r.status);
  r = await I.arac("studio", TO.access_token, "studio_musteri_ara", { sorgu: "deneme" });
  ok("okuma jetonuyla okuma araci calisir", r.status === 200 && r.json.result.structuredContent.toplam === 1, r.metin);
  r = await I.yetkiSayfasi("studio", yp({ scope: "studio.yaz offline_access" }));
  ok("kapsam: studio.yaz + offline_access istenince sayfa acilir (offline_access yok sayilir)", r.status === 200 && /id="yaz"/.test(r.metin), r.status);

  /* ================= Yenileme ================= */
  r = await I.yenile("studio", A.client_id, T1.refresh_token);
  var T2 = r.json || {};
  ok("yenileme: yeni access + YENI refresh (donusum), no-store", r.status === 200 && T2.access_token && T2.refresh_token && T2.refresh_token !== T1.refresh_token &&
    /no-store/.test(r.headers["cache-control"] || ""), r.metin);
  r = await I.rpc("studio", T2.access_token, "tools/list");
  ok("yenilenmis access token calisir", r.status === 200, r.status);
  r = await I.yenile("studio", B.client_id, T2.refresh_token);
  ok("yenileme: baska istemci -> invalid_grant", r.status === 400 && r.json.error === "invalid_grant", r.metin);
  r = await I.yenile("studio", A.client_id, T2.refresh_token, { scope: "studio.oku" });
  var T3 = r.json || {};
  ok("yenileme: daha dar kapsam (studio.oku) -> jeton yalniz okuma", r.status === 200 && T3.scope === "studio.oku", r.metin);
  r = await I.arac("studio", T3.access_token, "studio_musteri_olustur", { ad: "Dar", istek_anahtari: "anahtar-dar-0001" });
  ok("daraltilmis jetonla yazma -> 403", r.status === 403, r.status);
  r = await I.yenile("studio", A.client_id, T3.refresh_token, { scope: "studio.oku studio.yaz" });
  var T4 = r.json || {};
  ok("yenileme: grant'in kapsamina geri genisletme (verilen kapsam icinde) -> izinli", r.status === 200 && T4.scope === "studio.oku studio.yaz", r.metin);
  r = await I.yenile("studio", A.client_id, T4.refresh_token, { resource: KOK + "/studio-test/mcp" });
  ok("yenileme: baska resource -> invalid_target", r.status === 400 && r.json.error === "invalid_target", r.metin);
  r = await I.yenile("studio", A.client_id, T1.refresh_token);
  ok("yenileme: eski (donusturulmus) refresh token yeniden -> invalid_grant", r.status === 400 && r.json.error === "invalid_grant", r.metin);
  r = await I.rpc("studio", T4.access_token, "tools/list");
  r2 = await I.yenile("studio", A.client_id, T4.refresh_token);
  ok("yenileme tekrari: butun grant iptal (en yeni access 401, en yeni refresh invalid_grant)", r.status === 401 && r2.status === 400 && r2.json.error === "invalid_grant", [r.status, r2.metin]);
  ok("yenileme tekrari gunluge ve grant'e islendi", O.db(DB, "SELECT COUNT(*) AS c FROM mcp_izin WHERE iptal_nedeni = 'yenileme_tekrar'")[0].c === 1 &&
    O.db(DB, "SELECT COUNT(*) AS c FROM mcp_gunluk WHERE olay = 'yenileme_tekrar'")[0].c === 1);

  /* ================= Eszamanli yenileme: tolerans penceresi ================= */
  var izinDurum = function (rt) { return O.db(DB, "SELECT i.durum, i.iptal_nedeni FROM mcp_izin i JOIN mcp_jeton j ON j.izin = i.id WHERE j.ozet = ?", [O.sha256(rt)])[0] || {}; };
  var jetonDurum = function (rt) { return rt && (O.db(DB, "SELECT durum FROM mcp_jeton WHERE ozet = ?", [O.sha256(rt)])[0] || {}).durum; };
  var yeniGrant = async function () { var g = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE }); return (await I.kodTakas("studio", A.client_id, g, CLAUDE)).json || {}; };
  var G = await yeniGrant();
  var par = await Promise.all([I.yenile("studio", A.client_id, G.refresh_token), I.yenile("studio", A.client_id, G.refresh_token)]);
  var X1 = par[0].json || {}, X2 = par[1].json || {};
  ok("eszamanli iki yenileme (ayni refresh token, paralel): ikisi de 200, farkli yeni refresh token'lar, grant iptal EDILMEDI",
    par[0].status === 200 && par[1].status === 200 && X1.refresh_token && X2.refresh_token && X1.refresh_token !== X2.refresh_token && izinDurum(G.refresh_token).durum === "aktif",
    [par[0].metin, par[1].metin, izinDurum(G.refresh_token)]);
  r = await I.rpc("studio", X1.access_token, "tools/list");
  r2 = await I.rpc("studio", X2.access_token, "tools/list");
  ok("tolerans: iki yanittaki access token'lar da calisir; iki refresh token da etkin (istemci hangisini saklarsa)", r.status === 200 && r2.status === 200 &&
    jetonDurum(X1.refresh_token) === "aktif" && jetonDurum(X2.refresh_token) === "aktif", [r.status, r2.status, jetonDurum(X1.refresh_token), jetonDurum(X2.refresh_token)]);
  ok("tolerans gunluge yazildi (yenileme_tolerans), tekrar algilamasi tetiklenmedi", O.db(DB, "SELECT COUNT(*) AS c FROM mcp_gunluk WHERE olay = 'yenileme_tolerans'")[0].c >= 1 &&
    O.db(DB, "SELECT COUNT(*) AS c FROM mcp_izin WHERE iptal_nedeni = 'yenileme_tekrar'")[0].c === 1);
  r = await I.yenile("studio", A.client_id, X2.refresh_token);
  var Y = r.json || {};
  ok("kardeslerden biri (sonra gelen yanittaki) normal donusturulur; digeri artik 'kullanildi'", r.status === 200 && Y.refresh_token && jetonDurum(X1.refresh_token) === "kullanildi", r.metin);
  O.db(DB, "UPDATE mcp_jeton SET donusum = donusum - 120 WHERE ozet = ?", [O.sha256(X1.refresh_token)]);
  r = await I.yenile("studio", A.client_id, X1.refresh_token);
  r2 = await I.rpc("studio", Y.access_token, "tools/list");
  ok("pencere disinda (60 sn) donusturulmus kardes yeniden gelir -> tam iptal (en yeni access 401)", r.status === 400 && r.json.error === "invalid_grant" && r2.status === 401 &&
    izinDurum(Y.refresh_token).iptal_nedeni === "yenileme_tekrar", [r.metin, r2.status]);
  G = await yeniGrant();
  r = await I.yenile("studio", A.client_id, G.refresh_token);
  var Z = r.json || {};
  r = await I.yenile("studio", A.client_id, Z.refresh_token);
  var Z2 = r.json || {};
  r = await I.yenile("studio", A.client_id, G.refresh_token);
  r2 = await I.rpc("studio", Z2.access_token, "tools/list");
  ok("pencere icinde ama halef zaten kullanilmis -> tam iptal (tekrar algilama korunur)", Z2.access_token && r.status === 400 && r.json.error === "invalid_grant" && r2.status === 401 &&
    izinDurum(G.refresh_token).iptal_nedeni === "yenileme_tekrar", [r.metin, r2.status]);
  G = await yeniGrant();
  r = await I.yenile("studio", A.client_id, G.refresh_token);
  Z = r.json || {};
  O.db(DB, "UPDATE mcp_jeton SET donusum = donusum - 61 WHERE ozet = ?", [O.sha256(G.refresh_token)]);
  r = await I.yenile("studio", A.client_id, G.refresh_token);
  r2 = await I.rpc("studio", Z.access_token, "tools/list");
  ok("halef kullanilmamis ama 60 sn gecmis -> tam iptal", r.status === 400 && r2.status === 401 && izinDurum(G.refresh_token).iptal_nedeni === "yenileme_tekrar", [r.metin, r2.status]);
  G = await yeniGrant();
  r = await I.yenile("studio", A.client_id, G.refresh_token);
  Z = r.json || {};
  r = await I.yenile("studio", B.client_id, G.refresh_token);
  r2 = await I.rpc("studio", Z.access_token, "tools/list");
  ok("pencere icinde ama baska istemci -> tam iptal", r.status === 400 && r2.status === 401 && izinDurum(G.refresh_token).durum === "iptal", [r.metin, r2.status]);
  G = await yeniGrant();
  var tekrarlar = [];
  for (var ti = 0; ti < 4; ti++) tekrarlar.push(await I.yenile("studio", A.client_id, G.refresh_token));
  r2 = await I.rpc("studio", tekrarlar[0].json.access_token, "tools/list");
  ok("ayni jetonla pencere icinde 4 yenileme: ilk 3'u 200 (en cok 3 etkin kardes), 4. invalid_grant ama grant IPTAL EDILMEZ",
    tekrarlar.slice(0, 3).every(function (x) { return x.status === 200; }) && tekrarlar[3].status === 400 && tekrarlar[3].json.error === "invalid_grant" &&
    r2.status === 200 && izinDurum(G.refresh_token).durum === "aktif", tekrarlar.map(function (x) { return x.status; }).concat([r2.status]));
  ayar({ password_hash: cp.spawnSync("php", ["-r", "echo password_hash('tolerans-sifre-3', PASSWORD_DEFAULT);"], { encoding: "utf8" }).stdout });
  r = await I.yenile("studio", A.client_id, G.refresh_token);
  ayar();
  ok("pencere icinde ama panel sifresi degismis -> tolerans yok (invalid_grant), grant iptal", r.status === 400 && r.json.error === "invalid_grant" && izinDurum(G.refresh_token).durum === "iptal", r.metin);

  /* ================= Iptal (RFC 7009) ================= */
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  var T5 = (await I.kodTakas("studio", A.client_id, a, CLAUDE)).json || {};
  r = await I.iptal("studio", A.client_id, T5.access_token);
  r2 = await I.rpc("studio", T5.access_token, "tools/list");
  ok("revoke access token -> 200 bos; o jeton 401", r.status === 200 && r.metin === "" && r2.status === 401, [r.status, r2.status]);
  r = await I.yenile("studio", A.client_id, T5.refresh_token);
  var T6 = r.json || {};
  ok("access iptali refresh'i bozmaz", r.status === 200 && T6.access_token, r.metin);
  r = await I.iptal("studio", B.client_id, T6.refresh_token);
  r2 = await I.rpc("studio", T6.access_token, "tools/list");
  ok("baska istemci adina revoke: 200 ama etkisiz", r.status === 200 && r2.status === 200, [r.status, r2.status]);
  r = await I.iptal("studio", A.client_id, T6.refresh_token);
  r2 = await I.rpc("studio", T6.access_token, "tools/list");
  var r8 = await I.yenile("studio", A.client_id, T6.refresh_token);
  ok("revoke refresh token -> butun grant iptal (access 401, refresh invalid_grant)", r.status === 200 && r2.status === 401 && r8.status === 400 && r8.json.error === "invalid_grant", [r.status, r2.status, r8.metin]);
  r = await I.iptal("studio", A.client_id, "bilinmeyen-jeton");
  ok("bilinmeyen jeton revoke -> 200", r.status === 200, r.status);
  r = await I.istek({ yontem: "POST", yol: "/studio/oauth/revoke", baslik: { "Content-Type": "application/x-www-form-urlencoded" }, govde: O.form({ token: "x" }) });
  ok("istemcisiz revoke -> 401 invalid_client", r.status === 401 && r.json.error === "invalid_client", r.metin);

  /* ================= Sure / audience / sifre / kapatma ================= */
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  var T7 = (await I.kodTakas("studio", A.client_id, a, CLAUDE)).json || {};
  O.db(DB, "UPDATE mcp_jeton SET son = 1 WHERE ozet = ?", [O.sha256(T7.access_token)]);
  r = await I.rpc("studio", T7.access_token, "tools/list");
  w = O.wwwCoz(r.headers["www-authenticate"]);
  ok("suresi dolmus access token -> 401 invalid_token", r.status === 401 && w.error === "invalid_token" && /suresi/.test(w.error_description || ""), r.headers["www-authenticate"]);
  r = await I.yenile("studio", A.client_id, T7.refresh_token);
  var T8 = r.json || {};
  ok("suresi dolan access token refresh ile yenilenir", r.status === 200 && T8.access_token, r.metin);
  ayar({ kok_url: "http://localhost:" + PORT });
  r = await I.rpc("studio", T8.access_token, "tools/list");
  w = O.wwwCoz(r.headers["www-authenticate"]);
  ok("yanlis audience (jeton baska MCP adresi icin verilmis) -> 401 invalid_token", r.status === 401 && w.error === "invalid_token" && /bu sunucu icin/.test(w.error_description || "") &&
    w.resource_metadata === "http://localhost:" + PORT + "/.well-known/oauth-protected-resource/studio/mcp", r.headers["www-authenticate"]);
  ayar();
  r = await I.rpc("studio", T8.access_token, "tools/list");
  ok("audience geri gelince ayni jeton calisir", r.status === 200, r.status);
  ayar({ mcp_acik: false });
  r = await I.rpc("studio", T8.access_token, "tools/list");
  r2 = await I.istek({ yol: "/.well-known/oauth-protected-resource/studio/mcp" });
  r3 = await I.yenile("studio", A.client_id, T8.refresh_token);
  r4 = await I.yetkiSayfasi("studio", yp());
  r5 = await I.kayit("studio", { client_name: "Kapali", redirect_uris: [CLAUDE] });
  ok("kapatma anahtari (mcp_acik false): MCP, kesif, token, kayit 503; onay sayfasi 503 'kapalı'", r.status === 503 && r2.status === 503 && r3.status === 503 &&
    r3.json.error === "temporarily_unavailable" && r4.status === 503 && /kapalı/.test(r4.metin) && r5.status === 503, [r.status, r2.status, r3.status, r4.status, r5.status]);
  ayar();
  r = await I.rpc("studio", T8.access_token, "tools/list");
  ok("anahtar acilinca mevcut baglanti devam eder (duraklatma)", r.status === 200, r.status);
  var eskiOzet = O.db(DB, "SELECT COUNT(*) AS c FROM mcp_izin WHERE durum = 'aktif'")[0].c;
  ayar({ password_hash: cp.spawnSync("php", ["-r", "echo password_hash('baska-ornek-sifre-2', PASSWORD_DEFAULT);"], { encoding: "utf8" }).stdout });
  r = await I.rpc("studio", T8.access_token, "tools/list");
  w = O.wwwCoz(r.headers["www-authenticate"]);
  r2 = await I.yenile("studio", A.client_id, (await Promise.resolve(T8)).refresh_token);
  ok("panel sifresi degisince (sifre izi) butun grant'ler gecersiz: access 401, refresh invalid_grant", r.status === 401 && w.error === "invalid_token" &&
    /sifresi degisti/.test(w.error_description || "") && r2.status === 400 && r2.json.error === "invalid_grant", [r.status, r2.metin]);
  ok("sifre degisimi: aktif grant kalmadi, iptal nedeni sifre_degisti", eskiOzet > 0 && O.db(DB, "SELECT COUNT(*) AS c FROM mcp_izin WHERE durum = 'aktif'")[0].c === 0 &&
    O.db(DB, "SELECT COUNT(*) AS c FROM mcp_izin WHERE iptal_nedeni = 'sifre_degisti'")[0].c === eskiOzet);
  ayar();
  r = await I.rpc("studio", T8.access_token, "tools/list");
  ok("eski sifreye donulse bile iptal edilen grant geri gelmez", r.status === 401, r.status);
  a = await I.yetkiAl("studio", { client_id: A.client_id, redirect_uri: CLAUDE });
  r = await I.kodTakas("studio", A.client_id, a, CLAUDE);
  ok("yeniden baglanma (yeni onay) calisir", r.status === 200 && r.json.access_token, r.metin);

  /* ================= ChatGPT callback onekli istemci ================= */
  a = await I.yetkiAl("studio", { client_id: C.client_id, redirect_uri: GPT, scope: "studio.oku studio.yaz offline_access" });
  r = await I.kodTakas("studio", C.client_id, a, GPT);
  ok("ChatGPT onekli donus adresiyle tam akis (offline_access istendi) -> jeton", a.kod && a.url.origin + a.url.pathname === GPT && r.status === 200 && r.json.scope === "studio.oku studio.yaz", r.metin);
  ok("panel icin baglanti listesi islevi grant'leri dondurur (depo)", O.db(DB, "SELECT COUNT(*) AS c FROM mcp_izin i JOIN mcp_istemci s ON s.id = i.istemci WHERE i.durum = 'aktif'")[0].c >= 2);

  // Beklenen tek gunluk satiri: bozuk cikti testindeki "cikti semasi" kaydi (error_log). Baska PHP uyarisi / hatasi olmamali.
  var uyarilar = phpGunluk.split(/\r?\n/).filter(function (s) { return /PHP (Warning|Notice|Deprecated|Fatal|Parse)|Uncaught|suflo-mcp (?!cikti semasi)/.test(s); });
  ok("tum kosu boyunca PHP uyarisi / hatasi yok (yalniz beklenen cikti semasi kaydi)", uyarilar.length === 0 && /suflo-mcp cikti semasi \(studio_musteri_ara\)/.test(phpGunluk), uyarilar.slice(0, 5));
}

/* ======================================================================================================================
 * GERCEK ARKA UC: mcp-kitaplik/arka-studio.php + gecici gercek Studio veritabani (SQLite) + panel API (v1/index.php).
 * Sahte arka uc YOK. Kurulum dagitim tablosuyla ayni (DAGITIM): <u>/v1/studio-ortak.php + <u>/v1/index.php (panel).
 * Veri panelin kendi API'siyle (giris + toplu) eklenir ve sonuclar yine panelden (giris + veri) okunur.
 * ==================================================================================================================== */
var TMP2 = null;
async function gercekArka() {
  var KOK2, PRIV2, STUDIO_DB, DB2, I2, r, j, sc;
  var SIFRE2 = O.SIFRE, YENI_SIFRE = "yeni-ornek-sifre-22";
  var UCRET = 987654;
  var ciktilar = [];          // butun MCP yanit govdeleri (ucret denetimi icin)
  TMP2 = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-mcp-gercek-"));
  PUB = O.kur(TMP2, ["studio"]);
  fs.copyFileSync(path.join(O.ROOT, "server", "studio-v1", "index.php"), path.join(PUB, "studio", "v1", "index.php"));
  PRIV2 = path.join(TMP2, "private", "studio-v1");
  STUDIO_DB = path.join(PRIV2, "studio.sqlite");
  DB2 = path.join(PRIV2, "mcp.sqlite");
  PORT = await O.bosPort();
  KOK2 = "http://127.0.0.1:" + PORT;
  // mcp_arka YOK: varsayilan mcp-kitaplik/arka-studio.php (gercek arka uc). Panel ve MCP ayni config.php'yi okur.
  fs.writeFileSync(path.join(PRIV2, "config.php"), "<?php\nreturn " + O.phpDizi({
    password_hash: cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", SIFRE2], { encoding: "utf8" }).stdout,
    dsn: "sqlite:" + STUDIO_DB, allowed_origins: [KOK2], cookie_secure: false, kok_url: KOK2, login_max_fail: 3, login_window: 900
  }) + ";\n");
  var gunlukBas = phpGunluk.length;
  await baslat();
  I2 = new O.Istemci(PORT, KOK2);

  // ---- yardimcilar ----
  function panel(govde, cerez) {
    var b = { "Content-Type": "application/json", "X-Studio": "1", Origin: KOK2 };
    if (cerez) b.Cookie = cerez;
    return O.istek({ port: PORT, yontem: "POST", yol: "/studio/v1/index.php", baslik: b, govde: govde });
  }
  async function panelGiris(sifre) {
    var y = await panel({ islem: "giris", sifre: sifre || SIFRE2 });
    var c = [].concat(y.headers["set-cookie"] || []).filter(function (x) { return /^suflo_studio=/.test(x); })[0];
    return { r: y, cerez: c ? c.split(";")[0] : "" };
  }
  async function panelVeri() {
    var g = await panelGiris(SIFRE_SIMDI);
    var y = await panel({ islem: "veri" }, g.cerez);
    return (y.json && y.json.veri) || null;
  }
  var SIFRE_SIMDI = SIFRE2;
  async function arac(jeton, ad, args) {
    var y = await I2.arac("studio", jeton, ad, args);
    ciktilar.push(y.metin);
    return y;
  }
  function sonuc(y) { return (y.json && y.json.result) || {}; }
  function yapi(y) { return sonuc(y).structuredContent || {}; }
  function metin(y) { var s = sonuc(y); return s.content && s.content[0] ? s.content[0].text : y.metin; }
  function say(tur) { return O.db(STUDIO_DB, "SELECT COUNT(*) AS c FROM kayitlar WHERE tur = ?", [tur])[0].c; }
  function sayilar() { return ["musteri", "icerik", "etkinlik", "blok"].map(say).join(","); }
  function kayit(id) { var x = O.db(STUDIO_DB, "SELECT veri, surum, tur FROM kayitlar WHERE id = ?", [id])[0]; return x ? Object.assign(JSON.parse(x.veri), { surum: x.surum, tur: x.tur }) : null; }
  function istanbulGunu(ek) { return new Date(Date.now() + 3 * 3600 * 1000 + ek * 86400 * 1000).toISOString().slice(0, 10); }
  function yazmaSayaciSifirla() { O.db(DB2, "DELETE FROM mcp_sayac WHERE anahtar LIKE 'yazma|%' OR anahtar LIKE 'mcp|%'"); }
  function izinOf(jeton) { return O.db(DB2, "SELECT izin FROM mcp_jeton WHERE ozet = ?", [O.sha256(jeton)])[0].izin; }
  async function baglan(ad, ek) {
    ek = ek || {};
    var k = await I2.kayit("studio", { client_name: ad, redirect_uris: [CLAUDE] });
    var cid = k.json && k.json.client_id;
    var a = await I2.yetkiAl("studio", { client_id: cid, redirect_uri: CLAUDE, yaz: ek.yaz, sifre: ek.sifre || SIFRE_SIMDI });
    var t = a.kod ? (await I2.kodTakas("studio", cid, a, CLAUDE)).json || {} : {};
    return { client_id: cid, a: a, t: t };
  }

  /* ---- statik: gercek arka uc ---- */
  var arkaKod = fs.readFileSync(path.join(K, "mcp-kitaplik", "arka-studio.php"), "utf8");
  var arkaYalin = arkaKod.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok("gercek arka uc: kitapligi ../v1/studio-ortak.php'den STUDIO_ORTAK ile yukler, hatalari istisnaya baglar, panel ayarini kullanir",
    /__DIR__ \. '\/\.\.\/v1\/studio-ortak\.php'/.test(arkaYalin) && /define\('STUDIO_ORTAK', 1\)/.test(arkaYalin) && /studio_dur_ayarla\(null\)/.test(arkaYalin) && /studio_ayar_kullan\(\$C\)/.test(arkaYalin));
  ok("gercek arka uc: ucret alani hic okunmaz / yazilmaz; silme, arsivleme ve mesaj yolu yok", !/ucret/i.test(arkaYalin) && !/DELETE\s+FROM/i.test(arkaYalin) &&
    !/'arsiv'\s*=>\s*true/.test(arkaYalin) && !/mail\(|curl_|file_get_contents\(\s*'http/i.test(arkaYalin));
  ok("gercek arka uc: yazmalar panelin yolundan (islem + kayit_yaz + gunluk_anlik), toplu oncesi anlik_al('mcp_toplu_oncesi')",
    /islem\(function/.test(arkaYalin) && /kayit_yaz\(/.test(arkaYalin) && /gunluk_anlik\(\)/.test(arkaYalin) && /anlik_al\('mcp_toplu_oncesi'\)/.test(arkaYalin));
  var studioJs = fs.readFileSync(path.join(O.ROOT, "server", "studio-v1", "arayuz", "studio.js"), "utf8");
  ok("panel Ayarlar: otomatik kopya nedeni mcp_toplu_oncesi Turkce etiketli", /mcp_toplu_oncesi: "Sohbet toplu işlemi öncesi"/.test(studioJs));

  /* ---- tohum veri: panelin kendi API'siyle (anonim) ---- */
  var D = "mdeniz0001", OZ = "mozge00001", YU = "myusuf0001";
  var g0 = await panelGiris();
  ok("[gercek] panel girisi (kurulum: gercek Studio veritabani)", g0.r.status === 200 && g0.cerez, g0.r.metin);
  var tohum = [
    { tur: "musteri", id: OZ, veri: { ad: "Özge Test", kurum: "", ucret: UCRET, siklik: { tur: "haftalik", haftalikAdet: 2, gunler: [1, 3] }, not: "Gizli not ucret pazarligi" } },
    { tur: "musteri", id: YU, veri: { ad: "Yusuf Test", kurum: "", ucret: UCRET } },
    { tur: "musteri", id: "mali000001", veri: { ad: "Ali Test", kurum: "Birinci Şube" } },
    { tur: "musteri", id: "mali000002", veri: { ad: "Ali Test", kurum: "İkinci Şube" } },
    { tur: "musteri", id: "meski00001", veri: { ad: "Eski Test", kurum: "", arsiv: true } },
    { tur: "musteri", id: D, veri: { ad: "Deniz Test", kurum: "Örnek Ajans", siklik: { tur: "gunluk" } } },
    { tur: "etkinlik", id: "edeniz0001", veri: { musteriId: D, baslik: "Mevcut çekim", tur: "cekim", basTarih: "2099-03-10", basSaat: "10:00", bitTarih: "2099-03-10", bitSaat: "12:00" } },
    { tur: "icerik", id: "ideniz0001", veri: { musteriId: D, baslik: "Deniz reels 1", tur: "reels", durum: "cekildi" } },
    { tur: "icerik", id: "ideniz0002", veri: { musteriId: D, baslik: "Deniz reels 2", tur: "reels", durum: "cekildi", teslimTarihi: "2099-03-11" } },
    { tur: "icerik", id: "ideniz0003", veri: { musteriId: D, baslik: "Deniz video", tur: "video", durum: "kurguda", planTarihi: "2099-03-12" } },
    { tur: "icerik", id: "iyusuf0001", veri: { musteriId: YU, baslik: "Yusuf post", tur: "post", durum: "fikir" } },
    { tur: "ozelgun", id: "oozel00001", veri: { baslik: "Test özel gün", tarih: "2099-03-11", tur: "ozel" } },
    { tur: "ozelgun", id: "odogum0001", veri: { baslik: "Test doğum günü", tarih: "2000-03-12", tur: "dogum", herYil: true } }
  ];
  r = await panel({ islem: "toplu", kayitlar: tohum }, g0.cerez);
  ok("[gercek] tohum veri panelin toplu kaydiyla eklendi (ucretli musteri dahil)", r.status === 200 && r.json && r.json.ok !== false && say("musteri") === 6 && kayit(OZ).ucret === UCRET, r.metin);

  /* ---- yetkisiz erisim ---- */
  r = await I2.rpc("studio", null, "tools/list");
  ok("[gercek] jetonsuz -> 401 (error yok)", r.status === 401 && O.wwwCoz(r.headers["www-authenticate"]).error === undefined, r.status);
  r = await I2.arac("studio", "b".repeat(43), "studio_musteri_ara", { sorgu: "test" });
  ok("[gercek] gecersiz jeton -> 401 invalid_token, arac calismaz", r.status === 401 && O.wwwCoz(r.headers["www-authenticate"]).error === "invalid_token", r.status);
  // Onay sayfasindaki sifre PANELIN kilidinden gecer: ayni girisler tablosu, ayni sinir (login_max_fail 3)
  var kayitC = await I2.kayit("studio", { client_name: "Claude", redirect_uris: [CLAUDE] });
  var CID = kayitC.json && kayitC.json.client_id;
  var pkK = O.pkce();
  r = await I2.yetkiSayfasi("studio", { response_type: "code", client_id: CID, redirect_uri: CLAUDE, code_challenge: pkK.challenge, code_challenge_method: "S256",
    state: "kilit-1", scope: "studio.oku studio.yaz", resource: KOK2 + "/studio/mcp" });
  var sK = I2.sayfaCoz(r);
  var girisSay = function () { return O.db(STUDIO_DB, "SELECT COUNT(*) AS c FROM girisler")[0].c; };
  var gOnce = girisSay();
  var yanlis = [];
  for (var wi = 0; wi < 3; wi++) yanlis.push((await I2.onayGonder("studio", sK, { karar: "izin", sifre: "yanlis-sifre-" + wi, yaz: "1" })).status);
  ok("[gercek] onay sayfasinda yanlis sifre -> 401; her deneme Studio'nun girisler tablosunda (panel kilidi) sayildi", yanlis.join() === "401,401,401" && girisSay() === gOnce + 3, [yanlis, girisSay() - gOnce]);
  r = await I2.onayGonder("studio", sK, { karar: "izin", sifre: SIFRE2, yaz: "1" });
  var pk429 = await panelGiris();
  ok("[gercek] kilit paylasilir: onay sayfasi dogru sifreyle de 429, panel girisi de 429 (ayni sayac)", r.status === 429 && pk429.r.status === 429, [r.status, pk429.r.status, pk429.r.metin]);
  O.db(STUDIO_DB, "DELETE FROM girisler");   // kilit penceresi gecmis gibi
  // Tam OAuth: DCR -> authorize (panel kilidinden gecen sifre) -> PKCE ile jeton
  var A = await I2.yetkiAl("studio", { client_id: CID, redirect_uri: CLAUDE });
  r = await I2.kodTakas("studio", CID, A, CLAUDE);
  var T = r.json || {};
  var J = T.access_token;
  ok("[gercek] tam OAuth (DCR -> onay -> kod -> PKCE jeton), kapsam oku + yaz; grant panel sifre izine bagli", r.status === 200 && J && T.scope === "studio.oku studio.yaz" &&
    O.db(DB2, "SELECT sifre_izi FROM mcp_izin WHERE id = ?", [izinOf(J)])[0].sifre_izi === O.db(STUDIO_DB, "SELECT deger FROM ayar WHERE anahtar = 'sifre_izi'")[0].deger, r.metin);
  var GRANT = izinOf(J);
  var OKU = await baglan("Okuyucu", { yaz: false });
  var JO = OKU.t.access_token;
  ok("[gercek] yalniz okuma baglantisi (studio.oku)", JO && OKU.t.scope === "studio.oku", OKU.t);

  /* ================= Uctan uca: "Yarın 14.00 Özge çekim, 2 saat. Cuma Yusuf'a 3 reels teslim." ================= */
  r = await I2.rpc("studio", J, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "claude-ai", version: "1" } });
  ok("[uctan uca] initialize: talimat goreli tarih / belirsizlik kurallarini tasir", r.status === 200 && /studio_bugun/.test(r.json.result.instructions) && /YAZMA/.test(r.json.result.instructions), r.metin);
  r = await I2.rpc("studio", J, "tools/list");
  var liste = (r.json && r.json.result && r.json.result.tools) || [];
  var acik = {};
  liste.forEach(function (t) { acik[t.name] = t.description; });
  ok("[uctan uca] arac aciklamalari: goreli tarihleri studio_bugun ile coz, belirsizse SOR; ISO bicimleri", ["studio_cekim_olustur", "studio_icerik_olustur", "studio_edit_zamani_ayir", "studio_takvim"].every(function (n) {
    return /studio_bugun/.test(acik[n]) && /sor/.test(acik[n]) && /tahmin etme/.test(acik[n]);
  }) && /YYYY-AA-GG/.test(JSON.stringify(liste)) && /SS:DD/.test(JSON.stringify(liste)) && liste.length === 12 &&
    !liste.some(function (t) { return /sil|arsiv|mesaj|ucret|odeme|fatura/.test(t.name); }), Object.keys(acik));
  r = await arac(J, "studio_bugun");
  var bg = yapi(r);
  var YARIN = bg.gunler && bg.gunler[1].tarih;
  var CUMA = (bg.gunler || []).filter(function (x) { return x.gun_adi === "Cuma" && x.goreli !== "bugün"; })[0];
  CUMA = CUMA && CUMA.tarih;
  ok("[uctan uca] studio_bugun: yarin = Istanbul (UTC+3) yarini; ilk Cuma tablodan", YARIN === istanbulGunu(1) && /^\d{4}-\d{2}-\d{2}$/.test(CUMA || "") && CUMA > bg.tarih, [bg.tarih, YARIN, CUMA]);
  r = await arac(J, "studio_musteri_ara", { sorgu: "Özge" });
  sc = yapi(r);
  var ozge = sc.musteriler && sc.musteriler[0];
  ok("[uctan uca] musteri_ara 'Özge' -> tek eslesme (Özge Test), yayin duzeni metni, ucret YOK", sc.toplam === 1 && ozge.id === OZ && ozge.ad === "Özge Test" &&
    ozge.yayin_duzeni === "Haftada 2: Pzt, Çar" && !("ucret" in ozge) && r.metin.indexOf(String(UCRET)) === -1 && r.metin.indexOf("pazarligi") === -1, r.metin);
  r = await arac(J, "studio_musteri_ara", { sorgu: "yusuf" });
  sc = yapi(r);
  var yusuf = sc.musteriler && sc.musteriler[0];
  ok("[uctan uca] musteri_ara 'yusuf' -> tek eslesme (Yusuf Test)", sc.toplam === 1 && yusuf.id === YU, r.metin);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: ozge.id, baslik: "Özge çekim", tur: "cekim", tarih: YARIN, baslangic_saati: "14:00", sure_dakika: 120, istek_anahtari: "sohbet-ozge-cekim-0001" });
  sc = yapi(r);
  var OZGE_CEKIM = sc.etkinlik && sc.etkinlik.id;
  ok("[uctan uca] cekim_olustur yarin 14:00 + 120 dk -> olusturuldu, 14:00-16:00 Istanbul, gun adi, kimlik = sha256('mcp|'+grant+'|'+anahtar) ilk 24",
    sonuc(r).isError === false && sc.durum === "olusturuldu" && sc.etkinlik.tarih === YARIN && sc.etkinlik.baslangic_saati === "14:00" && sc.etkinlik.bitis_saati === "16:00" &&
    sc.etkinlik.bitis_tarihi === YARIN && sc.etkinlik.gun_adi === bg.gunler[1].gun_adi && OZGE_CEKIM === O.sha256("mcp|" + GRANT + "|sohbet-ozge-cekim-0001").slice(0, 24), r.metin);
  var once = sayilar();
  r = await arac(J, "studio_icerik_olustur", { musteri_id: yusuf.id, baslik: "Reels", tur: "reels", adet: 3, teslim_tarihi: CUMA, istek_anahtari: "sohbet-yusuf-reels-0001" });
  sc = yapi(r);
  var KOD = sc.onay_kodu;
  ok("[uctan uca] icerik_olustur adet=3 -> YAZMAZ: onizleme (3 satir, teslim Cuma) + onay_kodu", sonuc(r).isError === false && sc.durum === "onay_gerekli" && KOD &&
    sc.onizleme.satirlar.length === 3 && sc.onizleme.satirlar.every(function (s) { return s.durum === "gecerli" && s.ozet.indexOf(CUMA + " Cuma") !== -1; }) && sayilar() === once &&
    /KAYDEDİLMEDİ/.test(metin(r)), r.metin);
  r = await arac(J, "studio_toplu_uygula", { onay_kodu: KOD });
  sc = yapi(r);
  ok("[uctan uca] toplu_uygula -> uygulandi, 3 kayit, anlik kopya kimligi", sonuc(r).isError === false && sc.durum === "uygulandi" && sc.etkilenen.length === 3 && sc.anlik_id, r.metin);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: ozge.id, baslik: "Özge çekim", tur: "cekim", tarih: YARIN, baslangic_saati: "14:00", sure_dakika: 120, istek_anahtari: "sohbet-ozge-cekim-0001" });
  ok("[uctan uca] sohbet ayni cagriyi yeniden gonderir (ayni istek_anahtari) -> zaten_vardi, ayni kayit", yapi(r).durum === "zaten_vardi" && yapi(r).etkinlik.id === OZGE_CEKIM, r.metin);
  r = await arac(J, "studio_toplu_uygula", { onay_kodu: KOD });
  ok("[uctan uca] onay kodu yeniden -> daha_once_uygulandi (mukerrer yok)", yapi(r).durum === "daha_once_uygulandi", r.metin);
  var V = await panelVeri();
  var pc = V.etkinlikler.filter(function (e) { return e.baslik === "Özge çekim"; });
  ok("[uctan uca] PANEL (giris + veri): 'Özge çekim' tam bir kez, Özge Test'e bagli, Istanbul " + YARIN + " 14:00-16:00, planlandi",
    pc.length === 1 && pc[0].id === OZGE_CEKIM && pc[0].musteriId === OZ && pc[0].basTarih === YARIN && pc[0].basSaat === "14:00" && pc[0].bitTarih === YARIN &&
    pc[0].bitSaat === "16:00" && pc[0].tumGun === false && pc[0].durum === "planlandi", pc);
  var pr = V.icerikler.filter(function (i) { return i.musteriId === YU && /^Reels \(\d\/3\)$/.test(i.baslik); });
  ok("[uctan uca] PANEL: Yusuf Test'e 3 reels tam bir kez (1/3, 2/3, 3/3), teslim " + CUMA + " (Cuma), fikir, gecmis 'Sohbetten eklendi (Claude)'",
    pr.length === 3 && pr.map(function (i) { return i.baslik; }).sort().join("|") === "Reels (1/3)|Reels (2/3)|Reels (3/3)" &&
    pr.every(function (i) { return i.teslimTarihi === CUMA && i.tur === "reels" && i.durum === "fikir" && i.gecmis.length === 1 && i.gecmis[0].m === "Sohbetten eklendi (Claude)" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(i.gecmis[0].z); }), pr);
  r = await arac(J, "studio_takvim", { baslangic_tarihi: bg.tarih, bitis_tarihi: CUMA });
  sc = yapi(r);
  ok("[uctan uca] studio_takvim (bugun..Cuma): Özge çekimi ve 3 teslim gorunur", sc.etkinlikler.some(function (e) { return e.id === OZGE_CEKIM; }) &&
    sc.teslimler.filter(function (t) { return t.musteri_id === YU && t.tarih === CUMA; }).length === 3, r.metin);

  /* ================= Kapsam: okuma jetonuyla yazma ================= */
  once = sayilar();
  r = await I2.arac("studio", JO, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Okuyucu çekimi", tur: "cekim", tarih: "2099-05-01", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "okuma-yazma-0001" });
  var r2 = await I2.arac("studio", JO, "studio_edit_zamani_ayir", { musteri_id: D, icerik_idler: ["ideniz0001"], tarih: "2099-05-01", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "okuma-yazma-0002" });
  ok("[gercek] okuma jetonuyla yazma araclari -> 403 insufficient_scope, hicbir sey yazilmadi", r.status === 403 && r2.status === 403 &&
    O.wwwCoz(r.headers["www-authenticate"]).error === "insufficient_scope" && sayilar() === once, [r.status, r2.status]);
  r = await arac(JO, "studio_takvim", { baslangic_tarihi: "2099-03-01", bitis_tarihi: "2099-03-31" });
  ok("[gercek] okuma jetonuyla takvim calisir", r.status === 200 && sonuc(r).isError === false, r.metin);

  /* ================= Yanlis veri: hicbiri yazilmaz ================= */
  yazmaSayaciSifirla();
  once = sayilar();
  var tm = function (ek) { return Object.assign({ musteri_id: D, baslik: "Yanlış veri", tur: "cekim", tarih: "2099-05-05", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "yanlis-veri-0001" }, ek); };
  var sil = function (o, k) { delete o[k]; return o; };
  var yanlisVeri = [
    ["studio_cekim_olustur", tm({ tarih: "2099-02-30" }), /YYYY-AA-GG/, "30 Subat"],
    ["studio_cekim_olustur", tm({ tarih: "05.05.2099" }), /YYYY-AA-GG/, "noktali tarih"],
    ["studio_cekim_olustur", tm({ tarih: "1999-12-31" }), /2000-01-01 ile 2099-12-31/, "makul aralik disi yil"],
    ["studio_cekim_olustur", tm({ baslangic_saati: "24:00" }), /SS:DD/, "saat 24:00"],
    ["studio_cekim_olustur", tm({ baslangic_saati: "9:00" }), /SS:DD/, "saat 9:00 (iki hane degil)"],
    ["studio_cekim_olustur", tm({ baslangic_saati: "12:60" }), /SS:DD/, "dakika 60"],
    ["studio_cekim_olustur", sil(tm({ bitis_saati: "09:00" }), "sure_dakika"), /Bitiş, başlangıçtan sonra/, "bitis baslangictan once"],
    ["studio_cekim_olustur", sil(tm({}), "baslangic_saati"), /baslangic_saati gerekli/, "saat yok (muglak)"],
    ["studio_cekim_olustur", tm({ musteri_id: "yokmusteri01" }), /müşteri bulunamadı/, "olmayan musteri id"],
    ["studio_cekim_olustur", sil(tm({ musteri_adi: "Bilinmeyen Kişi" }), "musteri_id"), /adında müşteri yok/, "olmayan musteri adi"],
    ["studio_cekim_olustur", sil(tm({ musteri_adi: "Özge" }), "musteri_id"), /Benzer adlar: “Özge Test”.*tahmin etme/, "eksik ad (Özge): tahmin yok, aday"],
    ["studio_cekim_olustur", sil(tm({ musteri_adi: "ali TEST" }), "musteri_id"), /2 müşteri var: “Ali Test · Birinci Şube”.*“Ali Test · İkinci Şube”/, "belirsiz musteri (iki Ali Test)"],
    ["studio_cekim_olustur", sil(tm({ musteri_adi: "Eski Test" }), "musteri_id"), /arşivde/, "arsivdeki musteri"],
    ["studio_cekim_olustur", tm({ musteri_id: "meski00001" }), /arşivde/, "arsivdeki musteri id"],
    ["studio_cekim_olustur", tm({ musteri_adi: "Deniz Test" }), /birlikte verilmez/, "musteri_id + musteri_adi birlikte"],
    ["studio_cekim_olustur", sil(tm({}), "musteri_id"), /musteri_id ya da musteri_adi gerekli/, "musteri hic yok"],
    ["studio_cekim_olustur", tm({ baslik: "x".repeat(201) }), /en çok 200 karakter/, "cok uzun baslik"],
    ["studio_cekim_olustur", tm({ konum: "k".repeat(301) }), /en çok 300 karakter/, "cok uzun konum"],
    ["studio_cekim_olustur", tm({ ucret: 5 }), /ucret: bilinmeyen alan/, "fazladan alan (ucret)"],
    ["studio_musteri_olustur", { ad: "a".repeat(121), istek_anahtari: "yanlis-veri-0002" }, /en çok 120 karakter/, "cok uzun musteri adi"],
    ["studio_musteri_olustur", { ad: "Ücretli", ucret: 100, istek_anahtari: "yanlis-veri-0003" }, /ucret: bilinmeyen alan/, "musteriye ucret girilemez"],
    ["studio_icerik_olustur", { musteri_id: D, baslik: "X", tur: "reels", teslim_tarihi: "2099-13-01", istek_anahtari: "yanlis-veri-0004" }, /YYYY-AA-GG/, "13. ay"],
    ["studio_icerik_olustur", { musteri_id: YU, baslik: "X", tur: "reels", cekim_id: "edeniz0001", istek_anahtari: "yanlis-veri-0005" }, /başka bir müşteriye ait/, "baska musterinin cekimi"],
    ["studio_icerik_olustur", { musteri_id: D, baslik: "X", tur: "tiktok", istek_anahtari: "yanlis-veri-0006" }, /tur: şunlardan biri/, "bilinmeyen tur"],
    ["studio_edit_zamani_ayir", { musteri_id: D, icerik_idler: ["iyusuf0001"], tarih: "2099-05-06", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "yanlis-veri-0007" }, /başka bir müşterinin içeriği \(Yusuf Test\)/, "blokta baska musterinin icerigi"],
    ["studio_edit_zamani_ayir", { musteri_id: D, icerik_idler: ["ideniz0001", "iyusuf0001"], tarih: "2099-05-06", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "yanlis-veri-0008" }, /başka bir müşterinin/, "blokta karisik musteri"],
    ["studio_edit_zamani_ayir", { musteri_id: D, icerik_idler: ["yokicerik01"], tarih: "2099-05-06", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "yanlis-veri-0009" }, /içerik bulunamadı/, "blokta olmayan icerik"],
    ["studio_edit_zamani_ayir", { musteri_adi: "Ali Test", icerik_idler: ["ideniz0001"], tarih: "2099-05-06", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "yanlis-veri-0010" }, /2 müşteri var/, "blokta belirsiz musteri"],
    ["studio_edit_zamani_ayir", { musteri_id: D, icerik_idler: [], tarih: "2099-05-06", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "yanlis-veri-0011" }, /en az 1 öğe/, "bos icerik listesi"],
    ["studio_icerik_durum_guncelle", { icerik_id: "ideniz0001", yeni_durum: "silindi", beklenen_surum: 1 }, /yeni_durum: şunlardan biri/, "bilinmeyen durum"],
    ["studio_icerik_durum_guncelle", { icerik_id: "ideniz0001", yeni_durum: "kurguda" }, /beklenen_surum: zorunlu alan eksik/, "beklenen_surum yok"],
    ["studio_cekim_olustur", tm({ istek_anahtari: "kisa" }), /istek_anahtari: en az 8/, "kisa istek_anahtari"]
  ];
  var yvHatalar = [];
  for (var yi = 0; yi < yanlisVeri.length; yi++) {
    r = await arac(J, yanlisVeri[yi][0], yanlisVeri[yi][1]);
    if (!(sonuc(r).isError === true && yanlisVeri[yi][2].test(metin(r)))) yvHatalar.push(yanlisVeri[yi][3] + ": " + metin(r));
  }
  ok("[gercek] yanlis veri (" + yanlisVeri.length + " durum: tarih, saat, olmayan / belirsiz / arsivdeki musteri, baska musterinin icerigi, uzun metin, fazla alan) -> isError, acik Turkce neden",
    yvHatalar.length === 0, yvHatalar);
  ok("[gercek] yanlis verilerin hicbiri Studio'ya yazilmadi", sayilar() === once, [once, sayilar()]);
  r = await arac(J, "studio_cekim_olustur", { musteri_adi: "ALİ test · ikinci şube", baslik: "Şube çekimi", tur: "cekim", tarih: "2099-06-01", baslangic_saati: "10:00", sure_dakika: 30, istek_anahtari: "tam-ad-cekim-0001" });
  ok("[gercek] musteri_adi tam 'ad · kurum' (Turkce buyuk / kucuk harf duyarsiz) -> dogru musteri (Ali Test · İkinci Şube)", yapi(r).durum === "olusturuldu" && yapi(r).etkinlik.musteri_id === "mali000002", r.metin);
  r = await arac(J, "studio_cekim_olustur", { musteri_adi: "deniz test", baslik: "Deniz adla", tur: "toplanti", tarih: "2099-06-02", baslangic_saati: "10:00", bitis_saati: "10:30", istek_anahtari: "tam-ad-cekim-0002" });
  ok("[gercek] musteri_adi tam ad (tek eslesme) -> kaydedilir", yapi(r).durum === "olusturuldu" && yapi(r).etkinlik.musteri_id === D, r.metin);

  /* ================= Mukerrer ================= */
  yazmaSayaciSifirla();
  var mSay = say("musteri");
  r = await arac(J, "studio_musteri_olustur", { ad: "Yeni Test", kurum: "Deneme", istek_anahtari: "tekrar-musteri-0001" });
  var YENI = yapi(r).musteri && yapi(r).musteri.id;
  r2 = await arac(J, "studio_musteri_olustur", { ad: "Yeni Test", kurum: "Deneme", istek_anahtari: "tekrar-musteri-0001" });
  ok("[gercek] ayni istek_anahtari iki kez -> ikincisi zaten_vardi, ayni kimlik (sha256 grant+anahtar), tek kayit", yapi(r).durum === "olusturuldu" &&
    YENI === O.sha256("mcp|" + GRANT + "|tekrar-musteri-0001").slice(0, 24) && yapi(r2).durum === "zaten_vardi" && yapi(r2).musteri.id === YENI && say("musteri") === mSay + 1, [r.metin, r2.metin]);
  r = await arac(J, "studio_musteri_olustur", { ad: "Başka Test", kurum: "Deneme", istek_anahtari: "tekrar-musteri-0001" });
  ok("[gercek] ayni istek_anahtari FARKLI girdiyle -> isError, hicbir sey yazilmadi", sonuc(r).isError === true && /farklı bir istekte/.test(metin(r)) && say("musteri") === mSay + 1, r.metin);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: D, baslik: "Anahtar baska arac", tur: "cekim", tarih: "2099-06-03", baslangic_saati: "10:00", sure_dakika: 30, istek_anahtari: "tekrar-musteri-0001" });
  ok("[gercek] ayni istek_anahtari baska aracta -> isError", sonuc(r).isError === true && /farklı bir istekte/.test(metin(r)), r.metin);
  r = await arac(J, "studio_musteri_olustur", { ad: "yeni TEST", kurum: "deneme", istek_anahtari: "tekrar-musteri-0002" });
  ok("[gercek] baska anahtar ama ayni ad + kurum -> zaten_vardi + uyari (anlamsal mukerrer)", yapi(r).durum === "zaten_vardi" && yapi(r).musteri.id === YENI && /zaten var/.test(yapi(r).uyari) && say("musteri") === mSay + 1, r.metin);
  var eSay = say("etkinlik");
  var paralel = await Promise.all([0, 1, 2, 3, 4, 5].map(function () {
    return arac(J, "studio_cekim_olustur", { musteri_id: D, baslik: "Paralel çekim", tur: "cekim", tarih: "2099-07-01", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "paralel-cekim-0001" });
  }));
  var pd = paralel.map(function (x) { return sonuc(x).isError ? "isError:" + metin(x) : yapi(x).durum; });
  ok("[gercek] ayni istek_anahtari 6 paralel cagri -> tam bir 'olusturuldu', digerleri zaten_vardi; Studio'da tek kayit",
    pd.filter(function (x) { return x === "olusturuldu"; }).length === 1 && pd.filter(function (x) { return x === "zaten_vardi"; }).length === 5 && say("etkinlik") === eSay + 1, pd);
  paralel = await Promise.all([0, 1, 2, 3].map(function (k) {
    return arac(J, "studio_cekim_olustur", { musteri_id: D, baslik: "Paralel ikinci", tur: "cekim", tarih: "2099-07-02", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "paralel-farkli-000" + k });
  }));
  pd = paralel.map(function (x) { return sonuc(x).isError ? "isError" : yapi(x).durum; });
  ok("[gercek] farkli anahtarlarla ayni cekim 4 paralel -> tek kayit (digerleri zaten_vardi: ayni musteri + baslangic + baslik)",
    pd.filter(function (x) { return x === "olusturuldu"; }).length === 1 && pd.filter(function (x) { return x === "zaten_vardi"; }).length === 3 && say("etkinlik") === eSay + 2, pd);
  var iSay = say("icerik");
  r = await arac(J, "studio_icerik_olustur", { musteri_adi: "Deniz Test", baslik: "Tekil reels", tur: "reels", teslim_tarihi: "2099-03-12", istek_anahtari: "tekil-icerik-0001" });
  r2 = await arac(J, "studio_icerik_olustur", { musteri_adi: "Deniz Test", baslik: "Tekil reels", tur: "reels", teslim_tarihi: "2099-03-12", istek_anahtari: "tekil-icerik-0001" });
  var TEKIL = yapi(r).icerik && yapi(r).icerik.id;
  ok("[gercek] icerik_olustur tekrar -> zaten_vardi; gecmis 'Sohbetten eklendi (Claude)'", yapi(r).durum === "olusturuldu" && yapi(r2).durum === "zaten_vardi" &&
    say("icerik") === iSay + 1 && kayit(TEKIL).gecmis[0].m === "Sohbetten eklendi (Claude)", [r.metin, r2.metin]);

  /* ================= Cakisma (etkinlik + edit blogu, arayuzle ayni kural) ================= */
  yazmaSayaciSifirla();
  eSay = say("etkinlik");
  r = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Çakışan çekim", tur: "cekim", tarih: "2099-03-10", baslangic_saati: "11:00", sure_dakika: 60, istek_anahtari: "cakisma-cekim-0001" });
  sc = yapi(r);
  ok("[gercek] cekim vs cekim: cakisma -> YAZILMADI, cakisan (id, tur etkinlik, baslik, saat) doner", sonuc(r).isError === false && sc.durum === "cakisma" && sc.etkinlik === null &&
    sc.cakisanlar.length === 1 && sc.cakisanlar[0].id === "edeniz0001" && sc.cakisanlar[0].tur === "etkinlik" && sc.cakisanlar[0].baslangic === "2099-03-10T10:00" &&
    /KAYDEDİLMEDİ/.test(metin(r)) && say("etkinlik") === eSay, r.metin);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Uç uca sonra", tur: "cekim", tarih: "2099-03-10", baslangic_saati: "12:00", bitis_saati: "13:00", istek_anahtari: "uc-uca-cekim-0001" });
  r2 = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Uç uca önce", tur: "cekim", tarih: "2099-03-10", baslangic_saati: "09:00", bitis_saati: "10:00", istek_anahtari: "uc-uca-cekim-0002" });
  ok("[gercek] uc uca degen cekimler (12:00 bitis = 12:00 baslangic) cakisma degil", yapi(r).durum === "olusturuldu" && yapi(r2).durum === "olusturuldu", [r.metin, r2.metin]);
  var bSay = say("blok");
  r = await arac(J, "studio_edit_zamani_ayir", { musteri_id: D, icerik_idler: ["ideniz0001", "ideniz0002"], tarih: "2099-03-11", baslangic_saati: "14:00", sure_dakika: 120, istek_anahtari: "edit-blok-0001" });
  sc = yapi(r);
  var BLOK = sc.blok && sc.blok.id;
  ok("[gercek] studio_edit_zamani_ayir: Deniz'in 2 icerigi icin 14:00-16:00 blok (calisma blogu), iceriklerin durumu degismez",
    sonuc(r).isError === false && sc.durum === "olusturuldu" && sc.blok.icerik_idler.join() === "ideniz0001,ideniz0002" && sc.blok.bitis_saati === "16:00" &&
    say("blok") === bSay + 1 && kayit(BLOK).tur === "blok" && kayit(BLOK).musteriId === D && kayit("ideniz0001").durum === "cekildi", r.metin);
  r = await arac(J, "studio_edit_zamani_ayir", { musteri_id: D, icerik_idler: ["ideniz0001", "ideniz0002"], tarih: "2099-03-11", baslangic_saati: "14:00", sure_dakika: 120, istek_anahtari: "edit-blok-0001" });
  ok("[gercek] edit_zamani_ayir tekrar (ayni anahtar) -> zaten_vardi", yapi(r).durum === "zaten_vardi" && yapi(r).blok.id === BLOK && say("blok") === bSay + 1, r.metin);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Bloğa denk", tur: "cekim", tarih: "2099-03-11", baslangic_saati: "15:00", sure_dakika: 30, istek_anahtari: "cakisma-blok-0001" });
  sc = yapi(r);
  ok("[gercek] cekim vs edit blogu: cakisma (tur blok) -> yazilmadi", sc.durum === "cakisma" && sc.cakisanlar.length === 1 && sc.cakisanlar[0].id === BLOK && sc.cakisanlar[0].tur === "blok" &&
    say("etkinlik") === eSay + 2, r.metin);
  r = await arac(J, "studio_edit_zamani_ayir", { musteri_id: D, icerik_idler: ["ideniz0003"], tarih: "2099-03-10", baslangic_saati: "10:30", bitis_saati: "11:30", istek_anahtari: "blok-cakisma-0001" });
  ok("[gercek] edit blogu vs cekim: cakisma -> yazilmadi", yapi(r).durum === "cakisma" && yapi(r).cakisanlar[0].id === "edeniz0001" && say("blok") === bSay + 1, r.metin);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Bloğa denk", tur: "cekim", tarih: "2099-03-11", baslangic_saati: "15:00", sure_dakika: 30, cakismayi_onayla: true, istek_anahtari: "cakisma-blok-0001" });
  sc = yapi(r);
  var ONAYLI = sc.etkinlik && sc.etkinlik.id;
  ok("[gercek] cakismayi_onayla: true (ayni anahtar) -> olusturuldu, cakisanlar listede", sc.durum === "olusturuldu" && sc.cakisanlar[0].id === BLOK && sc.etkinlik.cakisan_idler[0] === BLOK &&
    say("etkinlik") === eSay + 3, r.metin);
  r = await arac(J, "studio_takvim", { baslangic_tarihi: "2099-03-10", bitis_tarihi: "2099-03-12" });
  sc = yapi(r);
  var tkE = {}, tkB = {};
  (sc.etkinlikler || []).forEach(function (e) { tkE[e.id] = e; });
  (sc.bloklar || []).forEach(function (b) { tkB[b.id] = b; });
  ok("[gercek] studio_takvim: etkinlikler + edit bloklari + cakisma haritasi (iki yonlu) + teslim + planli paylasim + ozel gun (her yil tekrar eden dogum gunu)",
    tkE.edeniz0001 && tkE[ONAYLI] && tkE[ONAYLI].cakisan_idler.indexOf(BLOK) !== -1 && tkB[BLOK] && tkB[BLOK].cakisan_idler.indexOf(ONAYLI) !== -1 &&
    tkB[BLOK].icerikler.length === 2 && tkB[BLOK].baslik === "Edit: Deniz Test · Örnek Ajans" &&
    sc.teslimler.some(function (t) { return t.icerik_id === "ideniz0002" && t.tarih === "2099-03-11"; }) &&
    sc.paylasimlar.some(function (p) { return p.icerik_id === "ideniz0003" && p.tarih === "2099-03-12"; }) &&
    sc.ozel_gunler.some(function (o) { return o.ad === "Test özel gün" && o.tarih === "2099-03-11" && o.tur === "ozel"; }) &&
    sc.ozel_gunler.some(function (o) { return o.ad === "Test doğum günü" && o.tarih === "2099-03-12" && o.tur === "dogum"; }) && !tkE["toplu-0"], r.metin);
  r = await arac(J, "studio_takvim", { baslangic_tarihi: "2099-10-25", bitis_tarihi: "2099-10-31" });
  sc = yapi(r);
  ok("[gercek] studio_takvim: resmi tatiller (28 Ekim yarim gun, 29 Ekim) + dini bayram bilinmeyen yil notu (tahmin yok)",
    sc.ozel_gunler.some(function (o) { return o.tarih === "2099-10-28" && o.tur === "tatil" && o.yarim_gun === true; }) &&
    sc.ozel_gunler.some(function (o) { return o.tarih === "2099-10-29" && o.ad === "Cumhuriyet Bayramı"; }) && sc.notlar.some(function (n) { return /^2099: .*Diyanet/.test(n); }), r.metin);
  r = await arac(J, "studio_takvim", { baslangic_tarihi: "2099-01-01", bitis_tarihi: "2099-03-15" });
  ok("[gercek] studio_takvim: 62 gunden uzun aralik -> isError", sonuc(r).isError === true && /62 gün/.test(metin(r)), r.metin);
  // iptal ve tamamlanmis kayitlar takvimi doldurmaz; tum gun etkinlik butun gunu kapatir (arayuzle ayni)
  r = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "İptal edilecek", tur: "cekim", tarih: "2099-08-01", baslangic_saati: "10:00", sure_dakika: 60, istek_anahtari: "iptal-cekim-0001" });
  var IPT = yapi(r).etkinlik;
  r = await arac(J, "studio_cekim_durum_guncelle", { cekim_id: IPT.id, yeni_durum: "iptal", beklenen_surum: IPT.surum });
  r2 = await arac(J, "studio_cekim_olustur", { musteri_id: D, baslik: "İptalin yerine", tur: "cekim", tarih: "2099-08-01", baslangic_saati: "10:30", sure_dakika: 30, istek_anahtari: "iptal-yerine-0001" });
  ok("[gercek] iptal edilen cekim cakisma sayilmaz", yapi(r).durum === "guncellendi" && yapi(r2).durum === "olusturuldu", [r.metin, r2.metin]);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: null, baslik: "Fuar", tur: "diger", tarih: "2099-09-01", tum_gun: true, istek_anahtari: "tum-gun-fuar-0001" });
  r2 = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Fuar günü çekim", tur: "cekim", tarih: "2099-09-01", baslangic_saati: "15:00", sure_dakika: 60, istek_anahtari: "tum-gun-cak-0001" });
  ok("[gercek] musterisiz tum gun etkinlik kaydedilir; ayni gun saatli cekim onunla cakisir", yapi(r).durum === "olusturuldu" && yapi(r).etkinlik.musteri_id === null &&
    yapi(r).etkinlik.tum_gun === true && yapi(r2).durum === "cakisma" && yapi(r2).cakisanlar[0].id === yapi(r).etkinlik.id, [r.metin, r2.metin]);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Gece çekimi", tur: "cekim", tarih: "2099-09-05", baslangic_saati: "23:00", sure_dakika: 120, istek_anahtari: "gece-cekim-0001" });
  ok("[gercek] sure_dakika gece yarisini asar: 23:00 + 120 dk -> ertesi gun 01:00", yapi(r).durum === "olusturuldu" && yapi(r).etkinlik.bitis_tarihi === "2099-09-06" &&
    yapi(r).etkinlik.bitis_saati === "01:00" && kayit(yapi(r).etkinlik.id).bitTarih === "2099-09-06", r.metin);

  /* ================= Eszamanlilik: beklenen_surum ================= */
  yazmaSayaciSifirla();
  var G0 = await panelGiris();
  V = await panelVeri();
  var ic = V.icerikler.filter(function (i) { return i.id === "ideniz0003"; })[0];
  var s0 = ic.surum;
  r = await arac(J, "studio_icerik_listele", { musteri_id: D, durum: "kurguda" });
  ok("[gercek] icerik_listele: surum panelle ayni, ucret yok", yapi(r).icerikler.some(function (i) { return i.id === "ideniz0003" && i.surum === s0; }), r.metin);
  var pv = Object.assign({}, ic, { durum: "onayda" });
  ["id", "surum", "olusturma", "guncelleme"].forEach(function (k) { delete pv[k]; });
  var pk = await panel({ islem: "kaydet", tur: "icerik", id: "ideniz0003", veri: pv, surum: s0 }, G0.cerez);
  var s1 = pk.json && pk.json.kayit && pk.json.kayit.surum;
  r = await arac(J, "studio_icerik_durum_guncelle", { icerik_id: "ideniz0003", yeni_durum: "hazir", beklenen_surum: s0 });
  sc = yapi(r);
  ok("[gercek] panel kaydi degistirdi; sohbet eski surumle -> isError 409, guncel kayit (surum, durum) doner, YAZILMADI", s1 > s0 && sonuc(r).isError === true && /409/.test(metin(r)) &&
    sc.durum === "surum_uyusmadi" && sc.icerik.surum === s1 && sc.icerik.durum === "onayda" && kayit("ideniz0003").durum === "onayda" && kayit("ideniz0003").surum === s1, r.metin);
  r = await arac(J, "studio_icerik_durum_guncelle", { icerik_id: "ideniz0003", yeni_durum: "hazir", beklenen_surum: s1, not: "Müşteri onayladı" });
  var gk = kayit("ideniz0003");
  ok("[gercek] guncel surumle -> guncellendi; gecmis: 'Sohbetten değiştirildi (Claude): not' + arayuz bicimli durum satiri", yapi(r).durum === "guncellendi" && gk.durum === "hazir" &&
    gk.gecmis[gk.gecmis.length - 1].m === "Müşteri onayında → Yayına hazır" && gk.gecmis[gk.gecmis.length - 2].m === "Sohbetten değiştirildi (Claude): Müşteri onayladı", r.metin);
  var s2 = gk.surum;
  paralel = await Promise.all([arac(J, "studio_icerik_durum_guncelle", { icerik_id: "ideniz0003", yeni_durum: "yayinlandi", beklenen_surum: s2 }),
    arac(J, "studio_icerik_durum_guncelle", { icerik_id: "ideniz0003", yeni_durum: "revizyonda", beklenen_surum: s2 })]);
  pd = paralel.map(function (x) { return sonuc(x).isError ? "409" : yapi(x).durum; });
  ok("[gercek] ayni surumle iki paralel guncelleme -> biri guncellendi, digeri 409 (ustune yazilmaz)", pd.sort().join() === "409,guncellendi", pd);
  ok("[gercek] yayinlandi'ya gecen icerige yayin tarihi (bugun, Istanbul) yazilir; geri donuste temizlenir (arayuzle ayni)",
    kayit("ideniz0003").durum === "yayinlandi" ? kayit("ideniz0003").yayinTarihi === istanbulGunu(0) : kayit("ideniz0003").yayinTarihi === null, kayit("ideniz0003"));
  var ek = kayit("edeniz0001");
  r = await arac(J, "studio_cekim_durum_guncelle", { cekim_id: "edeniz0001", yeni_durum: "tamamlandi", beklenen_surum: ek.surum - 1 });
  r2 = await arac(J, "studio_cekim_durum_guncelle", { cekim_id: "edeniz0001", yeni_durum: "tamamlandi", beklenen_surum: ek.surum });
  ok("[gercek] cekim_durum_guncelle: eski surum 409; dogru surum -> tamamlandi + tamamlanma ani (Istanbul)", sonuc(r).isError === true && /409/.test(metin(r)) &&
    yapi(r2).durum === "guncellendi" && kayit("edeniz0001").durum === "tamamlandi" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(kayit("edeniz0001").tamamZaman || ""), [r.metin, r2.metin]);
  r = await arac(J, "studio_cekim_olustur", { musteri_id: OZ, baslik: "Tamamlananın yerine", tur: "cekim", tarih: "2099-03-10", baslangic_saati: "10:30", sure_dakika: 30, istek_anahtari: "tamam-yerine-0001" });
  ok("[gercek] tamamlanmis cekim takvimi doldurmaz (arayuz takvimdeSayilir)", yapi(r).durum === "olusturuldu", r.metin);

  /* ================= Toplu: onizle -> kod -> uygula (anlik kopya) -> panelden geri yukleme ================= */
  yazmaSayaciSifirla();
  var s02 = kayit("ideniz0002").surum;
  var islemler = [
    { islem: "icerik_olustur", musteri_id: D, baslik: "Toplu A", tur: "post", teslim_tarihi: "2099-04-03" },
    { islem: "cekim_olustur", musteri_id: D, baslik: "Toplu çekim", tur: "cekim", tarih: "2099-04-01", baslangic_saati: "10:00", bitis_saati: "11:00" },
    { islem: "icerik_durum", icerik_id: "ideniz0002", yeni_durum: "kurguda", beklenen_surum: s02 }
  ];
  once = sayilar();
  var anlikSay = function () { return O.db(STUDIO_DB, "SELECT COUNT(*) AS c FROM anliklar WHERE neden = 'mcp_toplu_oncesi'")[0].c; };
  var aOnce = anlikSay();
  r = await arac(J, "studio_toplu_onizle", { islemler: islemler });
  sc = yapi(r);
  var K1 = sc.onay_kodu;
  ok("[gercek] toplu_onizle: 3 islem gecerli, ozetler Turkce (gun adi), onay_kodu; HICBIR SEY yazilmadi, kopya alinmadi",
    sc.gecerli === true && K1 && sc.satirlar.length === 3 && sc.satirlar.every(function (s) { return s.durum === "gecerli"; }) && /2099-04-01 Çarşamba 10:00–11:00/.test(sc.satirlar[1].ozet) &&
    sayilar() === once && anlikSay() === aOnce, r.metin);
  r = await arac(J, "studio_toplu_onizle", { islemler: [{ islem: "cekim_olustur", musteri_id: OZ, baslik: "Bloğa denk toplu", tur: "cekim", tarih: "2099-03-11", baslangic_saati: "14:30", sure_dakika: 30 }] });
  ok("[gercek] toplu_onizle: cakisan cekim -> satir hata (Çakışma), onay kodu yok", yapi(r).gecerli === false && yapi(r).onay_kodu === null && /Çakışma/.test(yapi(r).satirlar[0].mesaj), r.metin);
  r = await arac(J, "studio_toplu_onizle", { islemler: [
    { islem: "cekim_olustur", musteri_id: OZ, baslik: "Liste içi 1", tur: "cekim", tarih: "2099-04-10", baslangic_saati: "10:00", bitis_saati: "11:00" },
    { islem: "cekim_olustur", musteri_id: D, baslik: "Liste içi 2", tur: "cekim", tarih: "2099-04-10", baslangic_saati: "10:30", bitis_saati: "11:30" }] });
  ok("[gercek] toplu_onizle: liste icindeki iki cekim birbiriyle cakisir -> ikinci satir hata", yapi(r).gecerli === false && yapi(r).satirlar[0].durum === "gecerli" &&
    yapi(r).satirlar[1].durum === "hata" && /Liste içi 1/.test(yapi(r).satirlar[1].mesaj), r.metin);
  r = await arac(J, "studio_toplu_onizle", { islemler: [{ islem: "icerik_durum", icerik_id: "ideniz0002", yeni_durum: "hazir", beklenen_surum: s02 - 1 },
    { islem: "icerik_olustur", musteri_id: "meski00001", baslik: "Arşive", tur: "post" }] });
  ok("[gercek] toplu_onizle: eski surum ve arsivdeki musteri -> hata satirlari", yapi(r).gecerli === false && /Sürüm uyuşmuyor/.test(yapi(r).satirlar[0].mesaj) &&
    /arşivde/.test(yapi(r).satirlar[1].mesaj), r.metin);
  r = await arac(J, "studio_toplu_uygula", { onay_kodu: "yanlis-onay-kodu-00000000000000" });
  ok("[gercek] toplu_uygula: yanlis kod -> isError", sonuc(r).isError === true && /geçersiz/.test(metin(r)) && sayilar() === once, r.metin);
  var IKINCI = await baglan("ChatGPT");
  r = await arac(IKINCI.t.access_token, "studio_toplu_uygula", { onay_kodu: K1 });
  ok("[gercek] toplu_uygula: baska baglantinin (grant) kodu -> isError, uygulanmadi (kod grant'e bagli)", sonuc(r).isError === true && /bu bağlantıya ait değil/.test(metin(r)) && sayilar() === once, r.metin);
  // Baska bir sohbet (baska grant, baska kimlik turetimi) ayni cekimi toplu islemle yeniden gonderir: anlamsal mukerrer, yeni kayit yok
  r = await arac(IKINCI.t.access_token, "studio_toplu_onizle", { islemler: [{ islem: "cekim_olustur", musteri_id: OZ, baslik: "özge ÇEKİM", tur: "cekim", tarih: YARIN, baslangic_saati: "14:00", bitis_saati: "16:00" }] });
  var KX = yapi(r).onay_kodu;
  ok("[gercek] baska grant ayni cekimi toplu onizler -> satir uyari 'zaten var' (cakisma degil)", yapi(r).gecerli === true && KX && yapi(r).satirlar[0].durum === "uyari" &&
    /zaten var/.test(yapi(r).satirlar[0].mesaj), r.metin);
  r = await arac(IKINCI.t.access_token, "studio_toplu_uygula", { onay_kodu: KX });
  ok("[gercek] ... uygulanir ama yeni kayit acilmaz (zaten_vardi), 'Özge çekim' yine tek", yapi(r).durum === "uygulandi" && yapi(r).sonuc.zaten_vardi === 1 && yapi(r).sonuc.olusturulan === 0 &&
    O.db(STUDIO_DB, "SELECT COUNT(*) AS c FROM kayitlar WHERE tur = 'etkinlik' AND veri LIKE ?", ['%"baslik":"Özge çekim"%'])[0].c === 1 && sayilar() === once, r.metin);
  aOnce = anlikSay();
  r = await arac(J, "studio_toplu_onizle", { islemler: [{ islem: "icerik_olustur", musteri_id: D, baslik: "Süresi dolacak", tur: "post" }] });
  O.db(DB2, "UPDATE mcp_toplu SET son = 1 WHERE kod_ozet = ?", [O.sha256(yapi(r).onay_kodu)]);
  r = await arac(J, "studio_toplu_uygula", { onay_kodu: yapi(r).onay_kodu });
  ok("[gercek] toplu_uygula: suresi dolmus kod -> isError, uygulanmadi", sonuc(r).isError === true && /süresi doldu/.test(metin(r)) && sayilar() === once, r.metin);
  r = await arac(J, "studio_toplu_uygula", { onay_kodu: K1 });
  sc = yapi(r);
  var ANLIK = sc.anlik_id;
  var anl = O.db(STUDIO_DB, "SELECT neden, ozet FROM anliklar WHERE id = ?", [ANLIK || ""])[0];
  ok("[gercek] toplu_uygula: uygulandi, 3 etkilenen; ONCE Studio anlik kopyasi ('mcp_toplu_oncesi', uygulama oncesi sayilar)", sonuc(r).isError === false && sc.durum === "uygulandi" &&
    sc.etkilenen.length === 3 && anl && anl.neden === "mcp_toplu_oncesi" && anlikSay() === aOnce + 1 && sc.sonuc.olusturulan === 2 && sc.sonuc.guncellenen === 1 &&
    say("icerik") === Number(once.split(",")[1]) + 1 && kayit("ideniz0002").durum === "kurguda", r.metin);
  r = await arac(J, "studio_toplu_uygula", { onay_kodu: K1 });
  ok("[gercek] ayni kod yeniden -> daha_once_uygulandi, ayni etkilenen, yeni kayit / kopya yok", yapi(r).durum === "daha_once_uygulandi" && yapi(r).etkilenen.join() === sc.etkilenen.join() &&
    anlikSay() === aOnce + 1 && say("icerik") === Number(once.split(",")[1]) + 1, r.metin);
  var ayniListe = [{ islem: "icerik_olustur", musteri_id: D, baslik: "Toplu B", tur: "story" }];
  var KA = yapi(await arac(J, "studio_toplu_onizle", { islemler: ayniListe })).onay_kodu;
  var KB = yapi(await arac(J, "studio_toplu_onizle", { islemler: ayniListe })).onay_kodu;
  r = await arac(J, "studio_toplu_uygula", { onay_kodu: KA });
  r2 = await arac(J, "studio_toplu_uygula", { onay_kodu: KB });
  V = await panelVeri();
  ok("[gercek] ayni islem listesi iki ayri onay koduyla onaylansa da tek kayit (ikinci: zaten_vardi)", KA !== KB && yapi(r).sonuc.olusturulan === 1 && yapi(r2).sonuc.zaten_vardi === 1 &&
    V.icerikler.filter(function (i) { return i.baslik === "Toplu B"; }).length === 1, [r.metin, r2.metin]);
  var s01 = kayit("ideniz0001").surum;
  var KE = yapi(await arac(J, "studio_toplu_onizle", { islemler: [{ islem: "icerik_durum", icerik_id: "ideniz0001", yeni_durum: "kurguda", beklenen_surum: s01 },
    { islem: "icerik_olustur", musteri_id: D, baslik: "Eskiyen liste", tur: "post" }] })).onay_kodu;
  var ic1 = kayit("ideniz0001");
  var pv1 = Object.assign({}, ic1, { baslik: "Deniz reels 1 (panelde)" });
  ["id", "surum", "tur"].forEach(function (k) { delete pv1[k]; });
  await panel({ islem: "kaydet", tur: "icerik", id: "ideniz0001", veri: pv1, surum: s01 }, (await panelGiris()).cerez);
  var aOnce2 = anlikSay(), once2 = sayilar();
  r = await arac(J, "studio_toplu_uygula", { onay_kodu: KE });
  ok("[gercek] onizlemeden sonra panel kaydi degistirdi -> uygulama basarisiz (isError), HICBIRI yazilmadi, kopya da geri alindi",
    sonuc(r).isError === true && yapi(r).durum === "basarisiz" && /Uygulanmadı/.test(metin(r)) && sayilar() === once2 && anlikSay() === aOnce2 &&
    kayit("ideniz0001").durum === "cekildi", r.metin);
  // Panelden geri yukleme: Ayarlar -> Otomatik kopyalar -> "Sohbet toplu işlemi öncesi"
  var GP = await panelGiris();
  r = await panel({ islem: "anliklar" }, GP.cerez);
  var listede = r.json && r.json.anliklar && r.json.anliklar.filter(function (a) { return a.id === ANLIK; })[0];
  r2 = await panel({ islem: "anlik_geri", id: ANLIK, onay: "GERI YUKLE" }, GP.cerez);
  V = await panelVeri();
  ok("[gercek] PANELDEN geri yukleme: kopya listede (neden mcp_toplu_oncesi); geri yukleyince toplu islem oncesi hal (Toplu A / çekim yok, durum eski)",
    listede && listede.neden === "mcp_toplu_oncesi" && r2.status === 200 && r2.json && r2.json.ok !== false &&
    !V.icerikler.some(function (i) { return i.baslik === "Toplu A"; }) && !V.etkinlikler.some(function (e) { return e.baslik === "Toplu çekim"; }) &&
    V.icerikler.filter(function (i) { return i.id === "ideniz0002"; })[0].durum === "cekildi" && V.etkinlikler.some(function (e) { return e.id === OZGE_CEKIM; }), [listede, r2.metin]);

  /* ================= Islem gunlugu ================= */
  var gl = O.db(DB2, "SELECT * FROM mcp_gunluk WHERE olay = 'studio_cekim_olustur' AND sonuc = 'tamam' AND etkilenen = ?", [JSON.stringify([OZGE_CEKIM])]);
  var glHata = O.db(DB2, "SELECT COUNT(*) AS c FROM mcp_gunluk WHERE olay = 'studio_cekim_olustur' AND sonuc = 'hata' AND izin = ?", [GRANT])[0].c;
  var glToplu = O.db(DB2, "SELECT * FROM mcp_gunluk WHERE olay = 'studio_toplu_uygula' AND sonuc = 'tamam' AND izin = ? ORDER BY sira", [GRANT]);
  var glIzinsiz = O.db(DB2, "SELECT COUNT(*) AS c FROM mcp_gunluk WHERE olay LIKE 'studio_%' AND izin IS NULL")[0].c;
  ok("[gercek] islem gunlugu (mcp_gunluk): her arac cagrisi grant, arac, etkilenen kimlikler, sonuc (tamam / hata) ile; sir yok",
    gl.length === 1 && gl[0].izin === GRANT && gl[0].istemci === "Claude" && glHata >= 10 && glToplu.length >= 1 && JSON.parse(glToplu[0].etkilenen).length === 3 && glIzinsiz === 0 &&
    O.db(DB2, "SELECT COUNT(*) AS c FROM mcp_gunluk WHERE ozet LIKE ? OR etkilenen LIKE ?", ["%" + J + "%", "%" + J + "%"])[0].c === 0, [gl, glHata, glToplu.length, glIzinsiz]);
  var ist = O.db(DB2, "SELECT COUNT(*) AS c FROM mcp_istek WHERE izin = ? AND durum = 'tamam'", [GRANT])[0].c;
  ok("[gercek] istek_anahtari kayitlari (mcp_istek) yalniz yazan cagrilar icin kalici; anahtarin kendisi saklanmaz", ist >= 10 &&
    O.db(DB2, "SELECT COUNT(*) AS c FROM mcp_istek WHERE anahtar_ozet LIKE '%tekrar-musteri%'")[0].c === 0, ist);

  /* ================= Ucret hicbir yerde yok ================= */
  r = await arac(J, "studio_musteri_ara", { sorgu: "test" });
  ok("[gercek] musteri_ara: butun musteriler (arsiv dahil, arsiv: true), ucret / not alani yok", yapi(r).toplam >= 7 && yapi(r).musteriler.every(function (m) {
    return Object.keys(m).sort().join() === "ad,arsiv,id,kurum,yayin_duzeni";
  }) && yapi(r).musteriler.some(function (m) { return m.id === "meski00001" && m.arsiv === true; }), r.metin);
  var ucretli = ciktilar.filter(function (t) { return t.indexOf(String(UCRET)) !== -1 || /"ucret"\s*:/.test(t) || /Aylık ücret|pazarligi/.test(t); });
  ok("[gercek] " + ciktilar.length + " MCP yanitinin HICBIRINDE ucret (deger, alan adi) ya da musteri notu yok", ciktilar.length > 80 && ucretli.length === 0, ucretli.slice(0, 2));

  /* ================= Iptal ve sifre degisimi ================= */
  r = await I2.iptal("studio", OKU.client_id, OKU.t.refresh_token);
  r2 = await I2.arac("studio", JO, "studio_takvim", { baslangic_tarihi: "2099-03-01", bitis_tarihi: "2099-03-02" });
  ok("[gercek] baglanti iptal edildi (RFC 7009 revoke) -> jeton 401", r.status === 200 && r2.status === 401, [r.status, r2.status]);
  GP = await panelGiris();
  r = await panel({ islem: "sifre_degistir", eski: SIFRE2, yeni: YENI_SIFRE }, GP.cerez);
  SIFRE_SIMDI = YENI_SIFRE;
  r2 = await I2.arac("studio", J, "studio_takvim", { baslangic_tarihi: "2099-03-01", bitis_tarihi: "2099-03-02" });
  var w2 = O.wwwCoz(r2.headers["www-authenticate"]);
  ok("[gercek] panelde sifre degisti -> butun sohbet baglantilari gecersiz (401 invalid_token 'sifresi degisti')", r.status === 200 && r2.status === 401 &&
    w2.error === "invalid_token" && /sifresi degisti/.test(w2.error_description || "") &&
    O.db(DB2, "SELECT COUNT(*) AS c FROM mcp_izin WHERE durum = 'aktif'")[0].c === 0, [r.metin, r2.status, r2.headers["www-authenticate"]]);
  var eski = await baglan("Eski şifreyle", { sifre: SIFRE2 });
  var yeni = await baglan("Yeni şifreyle");
  r = yeni.t.access_token ? await arac(yeni.t.access_token, "studio_musteri_ara", { sorgu: "özge" }) : { json: null, metin: "" };
  ok("[gercek] eski sifreyle yeniden baglanilamaz; yeni sifreyle baglanti calisir", !eski.t.access_token && eski.a.hata === "onay" && eski.a.r.status === 401 &&
    yapi(r).toplam === 1, [eski.a.hata, yeni.t]);

  var uy = phpGunluk.slice(gunlukBas).split(/\r?\n/).filter(function (s) { return /PHP (Warning|Notice|Deprecated|Fatal|Parse)|Uncaught|suflo-mcp/.test(s); });
  ok("[gercek] gercek arka uc kosusunda PHP uyarisi / hatasi / beklenmeyen sunucu kaydi yok", uy.length === 0, uy.slice(0, 5));
}

calis().catch(function (e) { ok("beklenmeyen hata: " + (e && e.stack || e), false); }).then(durdur)
  .then(gercekArka).catch(function (e) { ok("beklenmeyen hata (gercek arka uc): " + (e && e.stack || e), false); }).then(durdur).then(function () {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  try { if (TMP2) fs.rmSync(TMP2, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
});
