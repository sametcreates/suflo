/*
 * Suflo Studio uzak MCP sunucusu (server/studio-v1/mcp): gercek php -S + .htaccess kurallarini taklit eden yonlendirici
 * + sahte arka uc (tests/fixtures/studio-mcp/arka-sahte.php). Yalniz anonim ornek veri.
 *  - kesif: 401 basligindan PRM'ye, oradan AS metadata'ya (4 adres, issuer bayt bayt ayni); studio / studio-test ayri ayar
 *  - DCR (redirect izin listesi, hiz siniri, istemci asla ezilmez) -> onay sayfasi (sifre + CSRF + cerez) -> kod -> PKCE ile jeton
 *  - MCP: eski donem (initialize 2025-03-26/06-18/11-25) ve yeni donem (2026-07-28: _meta, server/discover, Mcp-* basliklari)
 *  - araclar: sema dogrulama, capraz kurallar, cakisma, mukerrer, toplu onizle / uygula (tek kullanimlik kod, tekrar = ilk sonuc)
 *  - yenileme jetonu donusumu, eski jetonla tekrar -> grant iptal; RFC 7009 iptal; kod tekrari -> jetonlar iptal
 *  - olumsuzlar: jetonsuz 401 (error yok), gecersiz / suresi dolmus / yanlis audience 401 invalid_token, okuma jetonuyla yazma
 *    403 insufficient_scope, PKCE yok / plain, izinsiz redirect_uri, CSRF yok, yanlis sifre panel kilidinde sayilir, kapatma
 *    anahtari, sifre izi degisince grant'ler gecersiz, buyuk / toplu / bozuk JSON, bilinmeyen yontem / arac, GET 405, kotu Origin 403
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
var phpler = ["mcp.php", "oauth.php", "kesif.php"].map(function (f) { return path.join(K, f); })
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
ok("studio.htaccess: mcp / oauth / kesif yeniden yazma + Authorization gecisi + kitaplik kapali", /RewriteRule \^mcp\$ mcp\.php \[L,QSA,E=HTTP_AUTHORIZATION:%\{HTTP:Authorization\}\]/.test(studioHt) &&
  /RewriteRule \^oauth\/\(authorize\|token\|register\|revoke\)\$ oauth\.php/.test(studioHt) && /RewriteRule \^mcp-kitaplik\(\/\|\$\) - \[F,L\]/.test(studioHt) &&
  /openid-configuration/.test(studioHt) && /X-LiteSpeed-Cache-Control/.test(studioHt));
var wkHt = fs.readFileSync(path.join(K, "well-known.htaccess"), "utf8");
var wkKurallar = wkHt.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(function (s) { return /^RewriteRule/.test(s); });
ok(".well-known/.htaccess yalniz tam kesif adlarini esler; acme-challenge'a dokunan / yasaklayan / her seyi yakalayan kural yok",
  wkKurallar.length === 3 && wkKurallar.every(function (s) { return /^RewriteRule \^(oauth-protected-resource|oauth-authorization-server|openid-configuration)\/\(studio\|studio-test\)(\/mcp)?\$ \/\$1\/kesif\.php \[L\]$/.test(s); }) &&
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
  r2 = await I.istek({ yol: "/studio/kesif.php" });
  ok("eslenmeyen kok PRM adresi 404; kesif.php dogrudan cagrilinca 404", r.status === 404 && r2.status === 404, [r.status, r2.status]);
  r = await I.istek({ yol: "/studio/oauth.php" });
  ok("oauth.php dogrudan cagrilinca 404", r.status === 404, r.status);
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
  sayaclariSifirla(DB_TEST);
  var kayitlar = [];
  for (var hi = 0; hi < 11; hi++) kayitlar.push((await I.kayit("studio-test", { client_name: "Seri " + hi, redirect_uris: [CLAUDE] })).status);
  ok("DCR hiz siniri: ayni IP'den saatte 10 kayit, 11. -> 429", kayitlar.slice(0, 10).every(function (s) { return s === 201; }) && kayitlar[10] === 429, kayitlar);

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
    "studio_icerik_olustur", "studio_icerik_durum_guncelle", "studio_cekim_durum_guncelle", "studio_toplu_onizle", "studio_toplu_uygula"];
  ok("tools/list: 11 arac, sabit sira", JSON.stringify(araclar.map(function (t) { return t.name; })) === JSON.stringify(beklenenAdlar), araclar.map(function (t) { return t.name; }));
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
    ["studio_musteri_olustur", "studio_cekim_olustur", "studio_icerik_olustur"].every(function (n) { return ipucu[n].readOnlyHint === false && ipucu[n].destructiveHint === false && ipucu[n].idempotentHint === true; }) &&
    ["studio_icerik_durum_guncelle", "studio_cekim_durum_guncelle", "studio_toplu_uygula"].every(function (n) { return ipucu[n].readOnlyHint === false && ipucu[n].destructiveHint === true; }));
  ok("studio_bugun inputSchema.properties JSON'da {} (nesne)", r.metin.indexOf('"name":"studio_bugun"') !== -1 && /"inputSchema":\{"type":"object","properties":\{\},"additionalProperties":false\}/.test(r.metin));
  ok("yazma araclarinda istek_anahtari zorunlu; tarih / saat bicimleri semada", araclar.filter(function (t) { return /olustur$/.test(t.name); }).every(function (t) { return t.inputSchema.required.indexOf("istek_anahtari") !== -1; }) &&
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
  r = await I.arac("studio", J, "studio_icerik_durum_guncelle", { icerik_id: "cccccccc0001", yeni_durum: "onayda", beklenen_surum: 4 });
  ok("icerik_durum_guncelle: eski surum -> surum_uyusmadi + guncel kayit, yazilmadi", r.json.result.structuredContent.durum === "surum_uyusmadi" &&
    r.json.result.structuredContent.icerik.surum === 5, r.metin);
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
  ok("yeni donem tools/list: resultType + ttlMs + cacheScope + 11 arac", r.status === 200 && r.json.result.resultType === "complete" && r.json.result.tools.length === 11 &&
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

calis().catch(function (e) { ok("beklenmeyen hata: " + (e && e.stack || e), false); }).then(durdur).then(function () {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
});
