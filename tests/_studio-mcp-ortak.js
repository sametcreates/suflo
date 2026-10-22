/*
 * Suflo Studio MCP testleri icin ortak yardimcilar (test-studio-mcp.js, test-studio-mcp-apache.js).
 * "_" ile basladigi icin tools/test.js bunu ayri test olarak calistirmaz. Yalniz anonim ornek veri.
 */
"use strict";
var fs = require("fs"), path = require("path"), cp = require("child_process"), http = require("http"), net = require("net"), crypto = require("crypto");
var ROOT = path.join(__dirname, "..");
var MCP_KAYNAK = path.join(ROOT, "server", "studio-v1", "mcp");
var SAHTE_ARKA = path.join(__dirname, "fixtures", "studio-mcp", "arka-sahte.php");
var SIFRE = "ornek-deneme-sifresi-1";

/*
 * Dagitim eslemesi (README "Dagitim" tablosuyla ayni): repo (server/studio-v1/mcp/ altinda) -> public_html altinda.
 * <u> = uygulama klasoru (canli: studio, test: studio-test). Sonu "/" olan satir klasorun tamami (.htaccess dahil).
 */
var DAGITIM = [
  ["mcp-giris.php", "<u>/mcp-giris.php"],
  ["oauth-giris.php", "<u>/oauth-giris.php"],
  ["kesif-giris.php", "<u>/kesif-giris.php"],
  ["mcp-onay.js", "<u>/mcp-onay.js"],
  ["mcp-onay.css", "<u>/mcp-onay.css"],
  ["mcp-kitaplik/", "<u>/mcp-kitaplik/"],
  ["studio.htaccess", "<u>/.htaccess"],
  ["well-known.htaccess", ".well-known/.htaccess"],
  ["../studio-ortak.php", "<u>/v1/studio-ortak.php"]     // panelle ortak veri kitapligi (gercek arka uc bunu yukler)
];

function phpDizi(o) {
  if (Array.isArray(o)) return "[" + o.map(phpDizi).join(", ") + "]";
  if (o && typeof o === "object") return "[" + Object.keys(o).map(function (k) { return phpDizi(k) + " => " + phpDizi(o[k]); }).join(", ") + "]";
  if (typeof o === "string") return "'" + o.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  if (typeof o === "boolean") return o ? "true" : "false";
  if (o === null || o === undefined) return "null";
  return String(o);
}
function kopyalaKlasor(a, b) {
  fs.mkdirSync(b, { recursive: true });
  fs.readdirSync(a).forEach(function (f) {
    var s = path.join(a, f), d = path.join(b, f);
    if (fs.statSync(s).isDirectory()) kopyalaKlasor(s, d); else fs.copyFileSync(s, d);
  });
}
/** public_html + private yapisini kurar. uygulamalar: ["studio", "studio-test"]. */
function kur(kok, uygulamalar) {
  var pub = path.join(kok, "public_html");
  fs.mkdirSync(pub, { recursive: true });
  uygulamalar.forEach(function (u) {
    DAGITIM.forEach(function (s) {
      var kaynak = path.join(MCP_KAYNAK, s[0]), hedef = path.join(pub, s[1].replace("<u>", u));
      if (s[0].slice(-1) === "/") kopyalaKlasor(kaynak, hedef);
      else { fs.mkdirSync(path.dirname(hedef), { recursive: true }); fs.copyFileSync(kaynak, hedef); }
    });
    fs.mkdirSync(path.join(kok, "private", u + "-v1"), { recursive: true });
  });
  return pub;
}
var ozetOnbellek = null;
function sifreOzeti() {
  if (!ozetOnbellek) ozetOnbellek = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", SIFRE], { encoding: "utf8" }).stdout;
  return ozetOnbellek;
}
/** private/<u>-v1/config.php yazar (test ayarlari + ek). */
function ayarYaz(kok, u, kokUrl, ek) {
  var C = Object.assign({
    password_hash: sifreOzeti(), cookie_secure: false, kok_url: kokUrl, mcp_arka: SAHTE_ARKA,
    login_max_fail: 3, login_window: 900
  }, ek || {});
  fs.writeFileSync(path.join(kok, "private", u + "-v1", "config.php"), "<?php\nreturn " + phpDizi(C) + ";\n");
}
/** SQLite sorgusu (php -r ile; test icin). Doner: satirlar. */
function db(dosya, sql, par) {
  var r = cp.spawnSync("php", ["-r", "$p = new PDO('sqlite:' . $argv[1], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); $p->exec('PRAGMA busy_timeout=5000');" +
    "$s = $p->prepare($argv[2]); $s->execute(json_decode($argv[3], true)); echo json_encode($s->columnCount() ? $s->fetchAll(PDO::FETCH_ASSOC) : []);",
    dosya, sql, JSON.stringify(par || [])], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("db: " + r.stdout + r.stderr);
  return JSON.parse(r.stdout || "[]");
}
function bosPort() {
  return new Promise(function (res) { var s = net.createServer(); s.listen(0, "127.0.0.1", function () { var p = s.address().port; s.close(function () { res(p); }); }); });
}
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function b64url(b) { return Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function pkce() {
  var v = b64url(crypto.randomBytes(32));
  return { verifier: v, challenge: b64url(crypto.createHash("sha256").update(v).digest()) };
}
function form(o) {
  return Object.keys(o).filter(function (k) { return o[k] !== undefined && o[k] !== null; })
    .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&");
}

/** HTTP istemcisi: istek({port, yontem, yol, baslik, govde}) -> {status, headers, metin, json} */
function istek(o) {
  return new Promise(function (res) {
    var govde = o.govde === undefined ? "" : (typeof o.govde === "string" || Buffer.isBuffer(o.govde) ? o.govde : JSON.stringify(o.govde));
    var bas = Object.assign({}, o.baslik || {});
    if (govde.length || o.yontem === "POST") bas["Content-Length"] = Buffer.byteLength(govde);
    var r = http.request({ host: "127.0.0.1", port: o.port, path: o.yol, method: o.yontem || "GET", headers: bas }, function (y) {
      var p = [];
      y.on("data", function (c) { p.push(c); });
      y.on("end", function () {
        var t = Buffer.concat(p).toString("utf8"), js = null;
        try { js = JSON.parse(t); } catch (e) {}
        res({ status: y.statusCode, headers: y.headers, metin: t, json: js });
      });
    });
    r.on("error", function (e) { res({ status: 0, hata: String(e), headers: {}, metin: "", json: null }); });
    r.end(govde);
  });
}

/** Sunucuya karsi OAuth / MCP yardimcilari. */
function Istemci(port, kokUrl, ekBaslik) {
  this.port = port;
  this.kok = kokUrl;
  this.ekBaslik = ekBaslik || {};   // her istege eklenen basliklar (Apache testi: X-Forwarded-Proto: https)
}
Istemci.prototype.istek = function (o) {
  return istek(Object.assign({ port: this.port }, o, { baslik: Object.assign({}, this.ekBaslik, o.baslik || {}) }));
};
Istemci.prototype.kayit = function (u, govde) {
  return this.istek({ yontem: "POST", yol: "/" + u + "/oauth/register", baslik: { "Content-Type": "application/json" }, govde: govde });
};
Istemci.prototype.yetkiSayfasi = function (u, p) {
  return this.istek({ yol: "/" + u + "/oauth/authorize?" + form(p) });
};
/** Onay sayfasindan istek kimligi, CSRF ve cerezi cikarir. */
Istemci.prototype.sayfaCoz = function (r) {
  var m1 = /data-istek="([^"]+)"/.exec(r.metin || ""), m2 = /data-csrf="([^"]+)"/.exec(r.metin || "");
  var cz = [].concat(r.headers["set-cookie"] || []).filter(function (c) { return /^suflo_mcp_onay_/.test(c); })[0];
  return { istek: m1 && m1[1], csrf: m2 && m2[1], cerez: cz ? cz.split(";")[0] : "", cerezHam: cz || "" };
};
Istemci.prototype.onayGonder = function (u, s, alanlar, ek) {
  ek = ek || {};
  var bas = { "Content-Type": "application/x-www-form-urlencoded", "X-Suflo-Onay": "1", "Origin": this.kok };
  if (s.cerez && !ek.cerezsiz) bas.Cookie = s.cerez;
  Object.assign(bas, ek.baslik || {});
  (ek.sil || []).forEach(function (k) { delete bas[k]; });
  return this.istek({ yontem: "POST", yol: "/" + u + "/oauth/authorize", baslik: bas,
    govde: form(Object.assign({ onay_istegi: s.istek, csrf: s.csrf }, alanlar)) });
};
/** Tam yetki akisi: authorize GET -> onay POST -> kod. Doner {kod, pk, yonlendir, url, sayfa} ya da hata alanlari. */
Istemci.prototype.yetkiAl = async function (u, o) {
  var pk = o.pkce || pkce();
  var p = Object.assign({ response_type: "code", client_id: o.client_id, redirect_uri: o.redirect_uri, code_challenge: pk.challenge,
    code_challenge_method: "S256", state: o.state || "durum-" + crypto.randomBytes(4).toString("hex"),
    scope: o.scope === undefined ? "studio.oku studio.yaz" : o.scope, resource: o.resource === undefined ? this.kok + "/" + u + "/mcp" : o.resource }, o.ek || {});
  var r = await this.yetkiSayfasi(u, p);
  if (r.status !== 200) return { hata: "sayfa", r: r };
  var s = this.sayfaCoz(r);
  var y = await this.onayGonder(u, s, { karar: "izin", sifre: o.sifre === undefined ? SIFRE : o.sifre, yaz: o.yaz === false ? "0" : "1" });
  if (y.status !== 200 || !y.json || !y.json.yonlendir) return { hata: "onay", r: y, sayfa: s };
  var url = new URL(y.json.yonlendir);
  return { kod: url.searchParams.get("code"), state: url.searchParams.get("state"), iss: url.searchParams.get("iss"), url: url, pk: pk, sayfa: s, istenenState: p.state };
};
Istemci.prototype.token = function (u, alanlar, baslik) {
  return this.istek({ yontem: "POST", yol: "/" + u + "/oauth/token",
    baslik: Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, baslik || {}), govde: form(alanlar) });
};
Istemci.prototype.kodTakas = function (u, client_id, a, redirect_uri, ek) {
  return this.token(u, Object.assign({ grant_type: "authorization_code", code: a.kod, redirect_uri: redirect_uri, code_verifier: a.pk.verifier,
    client_id: client_id, resource: this.kok + "/" + u + "/mcp" }, ek || {}));
};
Istemci.prototype.yenile = function (u, client_id, rt, ek) {
  return this.token(u, Object.assign({ grant_type: "refresh_token", refresh_token: rt, client_id: client_id }, ek || {}));
};
Istemci.prototype.iptal = function (u, client_id, jeton, ek) {
  return this.istek({ yontem: "POST", yol: "/" + u + "/oauth/revoke", baslik: { "Content-Type": "application/x-www-form-urlencoded" },
    govde: form(Object.assign({ token: jeton, client_id: client_id }, ek || {})) });
};
/** MCP JSON-RPC. o: {jeton, govde, baslik, ham} */
var sira = 0;
Istemci.prototype.mcp = function (u, jeton, govde, baslik) {
  var bas = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
  if (jeton) bas.Authorization = "Bearer " + jeton;
  Object.assign(bas, baslik || {});
  return this.istek({ yontem: "POST", yol: "/" + u + "/mcp", baslik: bas, govde: govde });
};
Istemci.prototype.rpc = function (u, jeton, yontem, params, baslik) {
  return this.mcp(u, jeton, { jsonrpc: "2.0", id: ++sira, method: yontem, params: params || {} }, baslik);
};
Istemci.prototype.arac = function (u, jeton, ad, args, baslik) {
  return this.rpc(u, jeton, "tools/call", { name: ad, arguments: args || {} }, baslik);
};
/** 2026-07-28 istegi: _meta zarfi + MCP-Protocol-Version / Mcp-Method / (tools/call) Mcp-Name. */
Istemci.prototype.yeni = function (u, jeton, yontem, params, ek) {
  ek = ek || {};
  var p = Object.assign({}, params || {});
  p._meta = Object.assign({
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {},
    "io.modelcontextprotocol/clientInfo": { name: "suflo-test", version: "1.0.0" }
  }, ek.meta || {});
  var bas = { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": yontem };
  if (yontem === "tools/call") bas["Mcp-Name"] = p.name;
  Object.assign(bas, ek.baslik || {});
  (ek.sil || []).forEach(function (k) { delete bas[k]; });
  return this.mcp(u, jeton, { jsonrpc: "2.0", id: ++sira, method: yontem, params: p }, bas);
};

/** WWW-Authenticate degerini ayristirir: {sema, error, resource_metadata, scope, ...} */
function wwwCoz(h) {
  var s = String(h || ""), o = { sema: s.split(" ")[0] };
  var re = /([a-z_]+)="([^"]*)"/g, m;
  while ((m = re.exec(s))) o[m[1]] = m[2];
  return o;
}

module.exports = {
  ROOT: ROOT, MCP_KAYNAK: MCP_KAYNAK, SAHTE_ARKA: SAHTE_ARKA, SIFRE: SIFRE, DAGITIM: DAGITIM,
  phpDizi: phpDizi, kur: kur, ayarYaz: ayarYaz, db: db, bosPort: bosPort, bekle: bekle, b64url: b64url, sha256: sha256,
  pkce: pkce, form: form, istek: istek, Istemci: Istemci, wwwCoz: wwwCoz
};
