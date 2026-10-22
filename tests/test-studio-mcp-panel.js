/*
 * Suflo Studio Ayarlar -> "Sohbet baglantilari" (panel API + arayuz). Gercek php -S + .htaccess taklidi (yonlendirici) +
 * GERCEK MCP arka ucu + gecici SQLite. Yalniz anonim ornek veri; jeton / sir ekrana ve yanitlara girmez.
 *   API: mcp_durum / mcp_baglanti_kes / mcp_tumunu_kes / mcp_kayit_sayaci_sifirla panelin oturum + Origin + X-Studio + JSON
 *   denetimlerinden aynen gecer (oturumsuz 401, yabanci Origin 403, basliksiz 403, yanlis tur 415; hicbirinde bir sey
 *   kesilmez); MCP kurulu degilken ve mcp_acik=false iken bos durum (MCP deposu acilmaz); baglanti listesi (istemci, donus
 *   host'u, kapsam, olusturma, son kullanim), son 20 islem (arac, zaman, sonuc, kayit kimlikleri), kesilen baglantinin
 *   jetonu sonra 401 / yenileme invalid_grant, digerleri calisir; tumunu kes; kayit sayaci; panelde sifre degisince liste bos.
 *   Arayuz (Playwright, masaustu + telefon): adres + kopyala, Claude / ChatGPT rehberi, liste, islem gunlugundeki kayit
 *   baglantisi, "Bağlantıyı kes" ve "Tümünü kes" (sonra jeton 401), kayit sayacini sifirla, telefonda yatay tasma yok.
 * php yoksa ATLA; Playwright yoksa yalniz API bolumu calisir (STUDIO_E2E_ZORUNLU=1 iken atlamak kalmak sayilir).
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
var O = require("./_studio-mcp-ortak");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 600) + "]" : "")); }

var phpVar = cp.spawnSync("php", ["-r", "echo in_array('sqlite', PDO::getAvailableDrivers()) ? 'var' : 'yok';"], { encoding: "utf8" });
if (phpVar.error || phpVar.stdout !== "var") { console.log("ATLA Studio sohbet baglantilari paneli: php / pdo_sqlite yok"); process.exit(0); }
["server/studio-v1/index.php", "server/studio-v1/mcp/mcp-kitaplik/depo.php", "server/studio-v1/mcp/mcp-kitaplik/ortak.php", "server/studio-v1/mcp/mcp-kitaplik/oauth.php"].forEach(function (f) {
  var r = cp.spawnSync("php", ["-l", path.join(O.ROOT, f)], { encoding: "utf8" });
  ok("php -l " + f, r.status === 0, r.stdout + r.stderr);
});
function playwrightBul() {
  try { return require("playwright"); } catch (e) { /* global kurulum */ }
  try { return require(path.join(cp.execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "playwright")); } catch (e2) { return null; }
}

/* ---- statik: panel islemleri oturum denetiminden SONRA, ayri giris yolu yok ---- */
var kaynak = fs.readFileSync(path.join(O.ROOT, "server", "studio-v1", "index.php"), "utf8");
var oturumSatiri = kaynak.indexOf("if (!$oturumlu) hata(401, 'oturum', 'Giriş gerekli.');");
var mcpCase = kaynak.indexOf("case 'mcp_durum':");
ok("panel: MCP islemleri switch icinde, oturum denetiminden sonra", oturumSatiri > 0 && mcpCase > oturumSatiri);
ok("panel: MCP kitapligi yalniz islem icinden yuklenir (dosya basinda require yok)", !/^require[^\n]*mcp-kitaplik/m.test(kaynak) && /function mcp_panel_hazirla\(\)/.test(kaynak));
ok("panel: Origin / X-Studio / Content-Type / oturum denetimleri degismedi",
  /if \(!\$izinli\) hata\(403, 'kaynak'/.test(kaynak) && /\(\$_SERVER\['HTTP_X_STUDIO'\] \?\? ''\) !== '1'\) hata\(403, 'baslik'/.test(kaynak) &&
  /if \(\$ctype !== 'application\/json'\) hata\(415/.test(kaynak) && oturumSatiri > 0);

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-mcp-panel-"));
var PUB = O.kur(TMP, ["studio"]);
var PRIV = path.join(TMP, "private", "studio-v1");
var STUDIO_DB = path.join(PRIV, "studio.sqlite"), MCP_DB = path.join(PRIV, "mcp.sqlite");
fs.copyFileSync(path.join(O.ROOT, "server", "studio-v1", "index.php"), path.join(PUB, "studio", "v1", "index.php"));
["index.html", "studio.css", "studio-core.js", "studio.js", "favicon.svg"].forEach(function (f) {
  fs.copyFileSync(path.join(O.ROOT, "server", "studio-v1", "arayuz", f), path.join(PUB, "studio", f));
});
var EKRAN = process.env.STUDIO_EKRAN || null; // ekran goruntusu klasoru (istege bagli, repo disinda)
var CLAUDE = "https://claude.ai/api/mcp/auth_callback", GPT = "https://chatgpt.com/connector_platform_oauth_redirect";
var PORT, KOK, phpSurec = null, phpGunluk = "", SIFRE = O.SIFRE, YENI_SIFRE = "yeni-ornek-panel-sifresi-9";
// ozet bir kez hesaplanir: ayar yeniden yazilinca sifre izi degismesin (degisirse panel oturumlari ve MCP baglantilari duser)
var OZET = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", SIFRE], { encoding: "utf8" }).stdout;
function ayar(ek) {
  fs.writeFileSync(path.join(PRIV, "config.php"), "<?php\nreturn " + O.phpDizi(Object.assign({
    password_hash: OZET,
    dsn: "sqlite:" + STUDIO_DB, allowed_origins: [KOK], cookie_secure: false, kok_url: KOK, login_max_fail: 20, login_window: 900
  }, ek || {})) + ";\n");
}
function baslat() {
  return new Promise(function (res, rej) {
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

var I;
function panel(govde, cerez, baslik) {
  var b = Object.assign({ "Content-Type": "application/json", "X-Studio": "1", Origin: KOK }, baslik || {});
  Object.keys(b).forEach(function (k) { if (b[k] === null) delete b[k]; });
  if (cerez) b.Cookie = cerez;
  return O.istek({ port: PORT, yontem: "POST", yol: "/studio/v1/index.php", baslik: b, govde: govde });
}
async function panelGiris(sifre) {
  var y = await panel({ islem: "giris", sifre: sifre || SIFRE });
  var c = [].concat(y.headers["set-cookie"] || []).filter(function (x) { return /^suflo_studio=/.test(x); })[0];
  return c ? c.split(";")[0] : "";
}
async function baglan(ad, ru, yaz) {
  var k = await I.kayit("studio", { client_name: ad, redirect_uris: [ru] });
  var cid = k.json && k.json.client_id;
  var a = await I.yetkiAl("studio", { client_id: cid, redirect_uri: ru, yaz: yaz, sifre: SIFRE });
  var t = a.kod ? (await I.kodTakas("studio", cid, a, ru)).json || {} : {};
  return { client_id: cid, erisim: t.access_token, yenileme: t.refresh_token, ru: ru };
}
function izinOf(jeton) { var r = O.db(MCP_DB, "SELECT izin FROM mcp_jeton WHERE ozet = ?", [O.sha256(jeton)])[0]; return r && r.izin; }
async function mcpDurum(jeton) { return (await I.rpc("studio", jeton, "tools/list")).status; }
function sirYok(metin, baglantilar) {
  return baglantilar.every(function (b) { return !b.erisim || (metin.indexOf(b.erisim) === -1 && metin.indexOf(b.yenileme) === -1 && metin.indexOf(O.sha256(b.erisim)) === -1); }) &&
    !/sifre_izi|sir_ozet|password|access_token|refresh_token|"ozet"\s*:\s*"[0-9a-f]{64}"/.test(metin);
}

async function api() {
  var r, c, d;
  /* ---- MCP kurulu degil: kitaplik klasoru yok -> bos durum ---- */
  var kit = path.join(PUB, "studio", "mcp-kitaplik"), kitYedek = path.join(TMP, "mcp-kitaplik-yedek");
  fs.renameSync(kit, kitYedek);
  c = await panelGiris();
  ok("[api] panel girisi", !!c);
  r = await panel({ islem: "mcp_durum" }, c);
  d = r.json && r.json.mcp;
  ok("[api] MCP kurulu degil: mcp_durum 200, kurulu=false, bos listeler", r.status === 200 && d && d.kurulu === false && d.acik === false && d.adres === null &&
    d.baglantilar.length === 0 && d.gunluk.length === 0 && d.kayit === null, r.metin);
  r = await panel({ islem: "mcp_tumunu_kes" }, c);
  ok("[api] MCP kurulu degil: tumunu kes 0 doner, hata yok", r.status === 200 && r.json.kesilen === 0 && r.json.mcp.kurulu === false, r.metin);
  r = await panel({ islem: "mcp_baglanti_kes", id: "abcdefgh" }, c);
  ok("[api] MCP kurulu degil: baglanti kes false doner", r.status === 200 && r.json.kesildi === false, r.metin);
  r = await panel({ islem: "mcp_kayit_sayaci_sifirla" }, c);
  ok("[api] MCP kurulu degil: sayac sifirla false doner", r.status === 200 && r.json.sifirlandi === false, r.metin);
  fs.renameSync(kitYedek, kit);

  /* ---- mcp_acik=false: MCP deposu hic acilmaz ---- */
  ayar({ mcp_acik: false });
  r = await panel({ islem: "mcp_durum" }, c);
  d = r.json && r.json.mcp;
  ok("[api] mcp_acik=false: kurulu=true, acik=false, adres var, listeler bos", r.status === 200 && d.kurulu === true && d.acik === false && d.adres === KOK + "/studio/mcp" &&
    d.baglantilar.length === 0 && d.gunluk.length === 0, r.metin);
  r = await panel({ islem: "mcp_tumunu_kes" }, c);
  ok("[api] mcp_acik=false: tumunu kes 0, mcp.sqlite olusmadi", r.status === 200 && r.json.kesilen === 0 && !fs.existsSync(MCP_DB), r.metin);
  ayar();

  /* ---- acik, henuz baglanti yok ---- */
  r = await panel({ islem: "mcp_durum" }, c);
  d = r.json && r.json.mcp;
  ok("[api] acik, bos: adres kok_url + /studio/mcp, kayit sayaci 0/50", r.status === 200 && d.acik === true && d.adres === KOK + "/studio/mcp" && d.baglantilar.length === 0 &&
    d.kayit && d.kayit.sayi === 0 && d.kayit.sinir === 50, r.metin);

  /* ---- iki baglanti: Claude (okuma + yazma), ChatGPT (yalniz okuma) ---- */
  var A = await baglan("Claude", CLAUDE, true), B = await baglan("ChatGPT", GPT, false);
  ok("[api] iki sohbet baglandi, jetonlar calisiyor", A.erisim && B.erisim && (await mcpDurum(A.erisim)) === 200 && (await mcpDurum(B.erisim)) === 200);
  var MID = null;
  r = await I.arac("studio", A.erisim, "studio_musteri_olustur", { ad: "Panel Örnek Müşteri", istek_anahtari: "panel-test-musteri-0001" });
  var sc = r.json && r.json.result && r.json.result.structuredContent;
  MID = sc && sc.musteri && sc.musteri.id;
  ok("[api] sohbetten musteri eklendi", !!MID, r.metin);
  for (var i = 0; i < 24; i++) await I.arac("studio", B.erisim, "studio_bugun", {});
  r = await panel({ islem: "mcp_durum" }, c);
  d = r.json && r.json.mcp;
  var bA = d && d.baglantilar.filter(function (x) { return x.istemci === "Claude"; })[0], bB = d && d.baglantilar.filter(function (x) { return x.istemci === "ChatGPT"; })[0];
  ok("[api] liste: istemci, donus host'u, kapsam, olusturma, son kullanim", d && d.baglantilar.length === 2 && bA && bB &&
    bA.hostlar.join() === "claude.ai" && bB.hostlar.join() === "chatgpt.com" && bA.kapsam.indexOf("studio.yaz") !== -1 && bB.kapsam.join() === "studio.oku" &&
    bA.olusturma > 0 && bB.sonKullanim > 0 && bA.id === izinOf(A.erisim), r.metin);
  ok("[api] liste alanlari yalniz izinli olanlar (jeton / ozet / sir yok)", bA && Object.keys(bA).sort().join() === "hostlar,id,istemci,kapsam,olusturma,sonKullanim", bA && Object.keys(bA).join());
  ok("[api] gunluk: en cok 20 satir, en yenisi ustte, arac / zaman / sonuc", d.gunluk.length === 20 && d.gunluk[0].olay === "studio_bugun" && d.gunluk[0].sonuc === "tamam" &&
    d.gunluk[0].zaman >= d.gunluk[19].zaman && Object.keys(d.gunluk[0]).sort().join() === "istemci,kayitlar,olay,ozet,sonuc,zaman", JSON.stringify(d.gunluk[0]));
  ok("[api] yanitta jeton, ozet ya da sir yok", sirYok(r.metin, [A, B]));
  for (i = 0; i < 3; i++) await I.arac("studio", A.erisim, "studio_musteri_ara", { sorgu: "Panel" });
  ok("[api] kayit sayaci: bugun 2 kayit", d.kayit.sayi === 2, JSON.stringify(d.kayit));

  /* ---- panel denetimleri: oturumsuz / yabanci Origin / basliksiz / yanlis tur -> hicbir sey kesilmez ---- */
  var izA = izinOf(A.erisim);
  r = await panel({ islem: "mcp_tumunu_kes" });
  ok("[api] oturumsuz tumunu kes: 401", r.status === 401 && r.json.hata === "oturum", r.metin);
  r = await panel({ islem: "mcp_baglanti_kes", id: izA }, c, { Origin: "https://kotu.example" });
  ok("[api] yabanci Origin (oturum cereziyle): 403", r.status === 403 && r.json.hata === "kaynak", r.metin);
  r = await panel({ islem: "mcp_baglanti_kes", id: izA }, c, { Origin: null });
  ok("[api] Origin yok: 403", r.status === 403, r.metin);
  r = await panel({ islem: "mcp_tumunu_kes" }, c, { "X-Studio": null });
  ok("[api] X-Studio basligi yok: 403", r.status === 403 && r.json.hata === "baslik", r.metin);
  r = await O.istek({ port: PORT, yontem: "POST", yol: "/studio/v1/index.php", baslik: { "Content-Type": "text/plain", "X-Studio": "1", Origin: KOK, Cookie: c }, govde: JSON.stringify({ islem: "mcp_tumunu_kes" }) });
  ok("[api] text/plain govde: 415", r.status === 415, r.metin);
  r = await panel({ islem: "mcp_durum" }, "suflo_studio=uydurma-oturum");
  ok("[api] sahte oturum cereziyle durum: 401 (liste donmez)", r.status === 401 && !/baglantilar/.test(r.metin), r.metin);
  ok("[api] reddedilen isteklerden sonra iki baglanti da calisiyor", (await mcpDurum(A.erisim)) === 200 && (await mcpDurum(B.erisim)) === 200);
  r = await panel({ islem: "mcp_baglanti_kes", id: "../../x" }, c);
  ok("[api] gecersiz kimlik: 422", r.status === 422, r.metin);
  r = await panel({ islem: "mcp_baglanti_kes", id: ["dizi"] }, c);
  ok("[api] kimlik metin degil: 422", r.status === 422, r.metin);

  /* ---- tek baglantiyi kes ---- */
  r = await panel({ islem: "mcp_baglanti_kes", id: izA }, c);
  ok("[api] baglanti kesildi, yanit guncel listeyi tasir", r.status === 200 && r.json.kesildi === true && r.json.mcp.baglantilar.length === 1 &&
    r.json.mcp.baglantilar[0].istemci === "ChatGPT" && r.json.mcp.gunluk[0].olay === "baglanti_kes", r.metin);
  var y = await I.rpc("studio", A.erisim, "tools/list");
  ok("[api] kesilen baglantinin jetonu: 401 invalid_token", y.status === 401 && O.wwwCoz(y.headers["www-authenticate"]).error === "invalid_token", y.status + " " + y.headers["www-authenticate"]);
  y = await I.yenile("studio", A.client_id, A.yenileme);
  ok("[api] kesilen baglantinin yenileme jetonu: invalid_grant", y.status === 400 && y.json && y.json.error === "invalid_grant", y.metin);
  ok("[api] diger baglanti calismaya devam ediyor", (await mcpDurum(B.erisim)) === 200);
  r = await panel({ islem: "mcp_baglanti_kes", id: izA }, c);
  ok("[api] ayni baglantiyi ikinci kez kes: kesildi=false", r.status === 200 && r.json.kesildi === false, r.metin);

  /* ---- kayit sayaci ---- */
  r = await panel({ islem: "mcp_kayit_sayaci_sifirla" }, c);
  ok("[api] kayit sayaci sifirlandi (0/50), gunlukte", r.status === 200 && r.json.sifirlandi === true && r.json.mcp.kayit.sayi === 0 && r.json.mcp.gunluk[0].olay === "kayit_sayaci_sifirla", r.metin);

  /* ---- tumunu kes ---- */
  var C2 = await baglan("Claude", CLAUDE, true);
  r = await panel({ islem: "mcp_tumunu_kes" }, c);
  ok("[api] tumunu kes: 2 baglanti, liste bos", r.status === 200 && r.json.kesilen === 2 && r.json.mcp.baglantilar.length === 0, r.metin);
  ok("[api] tumunu kes sonrasi butun jetonlar 401", (await mcpDurum(B.erisim)) === 401 && (await mcpDurum(C2.erisim)) === 401);

  /* ---- panelde sifre degisince MCP baglantilari listede hemen kesik ---- */
  var D = await baglan("Claude", CLAUDE, true);
  r = await panel({ islem: "mcp_durum" }, c);
  ok("[api] yeni baglanti listede", r.json.mcp.baglantilar.length === 1, r.metin);
  r = await panel({ islem: "sifre_degistir", eski: SIFRE, yeni: YENI_SIFRE }, c);
  var c2 = [].concat(r.headers["set-cookie"] || []).filter(function (x) { return /^suflo_studio=/.test(x); })[0];
  c2 = c2 ? c2.split(";")[0] : "";
  ok("[api] panelde sifre degisti", r.status === 200 && !!c2, r.metin);
  r = await panel({ islem: "mcp_durum" }, c2);
  ok("[api] sifre degisince liste bos (MCP istegi beklenmeden)", r.status === 200 && r.json.mcp.baglantilar.length === 0, r.metin);
  ok("[api] sifre degisince eski jeton 401", (await mcpDurum(D.erisim)) === 401);
  r = await panel({ islem: "sifre_degistir", eski: YENI_SIFRE, yeni: SIFRE }, c2);
  ok("[api] sifre geri alindi", r.status === 200, r.metin);
  return MID;
}

async function arayuz(pw) {
  var tarayici = await pw.chromium.launch();
  var hatalar = [];
  async function sayfaAc(boyut) {
    var ctx = await tarayici.newContext({ viewport: boyut, locale: "tr-TR", timezoneId: "Europe/Istanbul", hasTouch: boyut.width < 600, isMobile: boyut.width < 600 });
    try { await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: KOK }); } catch (e) { /* izin verilemezse kopyalama secimle denenir */ }
    var p = await ctx.newPage();
    p.on("pageerror", function (e) { hatalar.push(String(e)); });
    p.on("console", function (m) { if (m.type() === "error" && !/favicon|401|Failed to load resource/.test(m.text())) hatalar.push(m.text()); });
    await p.goto(KOK + "/studio/");
    await p.waitForSelector("#studio-sifre");
    await p.fill("#studio-sifre", SIFRE);
    await p.click("button[type=submit]");
    await p.waitForSelector(".yan-menu", { state: "attached" });
    await p.goto(KOK + "/studio/#/ayarlar");
    await p.waitForSelector(".sayfa h1:has-text('Ayarlar')");
    return { ctx: ctx, p: p };
  }
  async function listeBekle(p, n) {
    await p.waitForFunction(function (n) { var k = document.querySelector(".mcp-kutu"); return k && k.querySelectorAll(".mcp-baglanti").length === n && !k.querySelector(".soluk.kucuk:only-child"); }, n);
  }

  // Tohum: iki baglanti + sohbetten bir musteri
  var A = await baglan("Claude", CLAUDE, true), B = await baglan("ChatGPT", GPT, false);
  var y = await I.arac("studio", A.erisim, "studio_musteri_olustur", { ad: "Arayüz Örnek Müşteri", istek_anahtari: "panel-test-musteri-0002" });
  var MID = y.json.result.structuredContent.musteri.id;

  /* ---- masaustu ---- */
  var m = await sayfaAc({ width: 1280, height: 860 }), p = m.p;
  await p.waitForSelector(".mcp-kutu .mcp-adres");
  ok("[ui] bolum basligi 'Sohbet bağlantıları'", await p.locator("section.bolum h2:has-text('Sohbet bağlantıları')").count() === 1);
  ok("[ui] baglayici adresi kok_url + /studio/mcp, salt okunur", (await p.inputValue(".mcp-adres")) === KOK + "/studio/mcp" && (await p.getAttribute(".mcp-adres", "readonly")) !== null);
  await p.click(".mcp-adres-satir button:has-text('Kopyala')");
  await p.waitForSelector(".toast:has-text('kopyala')");
  var pano = await p.evaluate(function () { return navigator.clipboard.readText().catch(function () { return null; }); });
  ok("[ui] Kopyala: adres panoya", pano === KOK + "/studio/mcp", pano);
  await p.click(".mcp-rehberler summary");
  var rehber = await p.locator(".mcp-rehberler").innerText();
  ok("[ui] Claude rehberi 3 adim (Ayarlar → Bağlayıcılar → Özel bağlayıcı ekle)", await p.locator(".mcp-rehber").nth(0).locator("li").count() === 3 &&
    /Ayarlar → Bağlayıcılar → “Özel bağlayıcı ekle”/.test(rehber), rehber);
  ok("[ui] ChatGPT rehberi 3 adim + plan notu (Business / Enterprise / Edu)", await p.locator(".mcp-rehber").nth(1).locator("li").count() === 3 && /Business, Enterprise ya da Edu/.test(rehber), rehber);
  await listeBekle(p, 2);
  if (EKRAN) await p.locator("section.bolum:has(h2:has-text('Sohbet bağlantıları'))").screenshot({ path: path.join(EKRAN, "mcp-masaustu.png") });
  var satirlar = await p.locator(".mcp-baglanti").allInnerTexts();
  ok("[ui] liste: istemci, host, izin, baglanma ve son kullanim", satirlar.length === 2 && satirlar.some(function (s) { return /Claude/.test(s) && /claude\.ai/.test(s) && /Okuma \+ yazma/.test(s) && /Bağlandı:/.test(s); }) &&
    satirlar.some(function (s) { return /ChatGPT/.test(s) && /chatgpt\.com/.test(s) && /Yalnız okuma/.test(s); }), satirlar.join(" | "));
  var islemler = await p.locator(".mcp-islem").count();
  ok("[ui] son islemler en cok 20 satir", islemler > 0 && islemler <= 20, islemler);
  var sayfaMetni = await p.locator(".mcp-kutu").innerText();
  ok("[ui] ekranda jeton / sir yok", sirYok(sayfaMetni, [A, B]) && sayfaMetni.indexOf(A.client_id) === -1);
  var kayitLink = p.locator(".mcp-islem:has-text('Müşteri ekleme') .mcp-kayitlar a").first();
  ok("[ui] islem gunlugunde musteri eklemesi ve kayit baglantisi", (await kayitLink.count()) === 1 && (await kayitLink.innerText()) === "Arayüz Örnek Müşteri" &&
    (await kayitLink.getAttribute("href")) === "#/musteri/" + MID);
  ok("[ui] islem sonucu rozeti", await p.locator(".mcp-islem:has-text('Müşteri ekleme') .rozet.mcp-tamam:has-text('Tamam')").count() >= 1);
  await kayitLink.click();
  await p.waitForSelector(".sayfa h1:has-text('Arayüz Örnek Müşteri')");
  ok("[ui] kayit baglantisi musteri sayfasini acar", true);
  await p.goBack();
  await p.waitForSelector(".sayfa h1:has-text('Ayarlar')");
  await listeBekle(p, 2);

  // Tek baglantiyi kes (Claude)
  await p.click(".mcp-baglanti:has-text('Claude') button:has-text('Bağlantıyı kes')");
  var dlg = p.locator("dialog[open]");
  await dlg.waitFor();
  ok("[ui] kesme onayi: istemci ve host yazili", /Claude/.test(await dlg.innerText()) && /claude\.ai/.test(await dlg.innerText()));
  await dlg.locator("button[type=submit]").click();
  await p.waitForSelector(".toast:has-text('Bağlantı kesildi.')");
  await listeBekle(p, 1);
  ok("[ui] kesildikten sonra listede yalniz ChatGPT", /ChatGPT/.test(await p.locator(".mcp-baglanti").innerText()));
  var st = await mcpDurum(A.erisim);
  ok("[ui] kesilen baglantinin jetonu sonra 401", st === 401, st);
  ok("[ui] digeri calisiyor", (await mcpDurum(B.erisim)) === 200);
  ok("[ui] gunlukte 'Bağlantı kesildi'", await p.locator(".mcp-islem").first().locator(".mcp-olay:has-text('Bağlantı kesildi')").count() === 1);

  // Kayit sayaci
  ok("[ui] kayit sayaci metni", /Bugün \d+ \/ 50/.test(await p.locator(".mcp-kutu").innerText()));
  await p.click("button:has-text('Kayıt sayacını sıfırla')");
  await p.waitForSelector(".toast:has-text('Kayıt sayacı sıfırlandı.')");
  ok("[ui] kayit sayaci sifirlandi: Bugün 0 / 50", /Bugün 0 \/ 50/.test(await p.locator(".mcp-kutu").innerText()));

  // Tumunu kes
  var E = await baglan("Claude", CLAUDE, true);
  await p.reload();
  await p.waitForSelector(".sayfa h1:has-text('Ayarlar')");
  await listeBekle(p, 2);
  await p.click(".mcp-bolum button:has-text('Tümünü kes')");
  dlg = p.locator("dialog[open]");
  await dlg.waitFor();
  await dlg.locator("button[type=submit]").click();
  await p.waitForSelector(".toast:has-text('2 bağlantı kesildi.')");
  await p.waitForSelector(".mcp-baglantilar:has-text('Şu an bağlı sohbet yok.')");
  ok("[ui] tumunu kes: liste bos, 'Tümünü kes' dugmesi gizli", await p.locator(".mcp-baglanti").count() === 0 && await p.locator("button:has-text('Tümünü kes')").count() === 0);
  ok("[ui] tumunu kes sonrasi jetonlar 401", (await mcpDurum(B.erisim)) === 401 && (await mcpDurum(E.erisim)) === 401);
  await m.ctx.close();

  /* ---- telefon: tasma yok, dokunma hedefleri ---- */
  var F = await baglan("ChatGPT çok uzun bir istemci adı ile örnek bağlantı denemesi", GPT, true);
  await I.arac("studio", F.erisim, "studio_musteri_olustur", { ad: "Telefon Örnek Müşteri Uzun Adlı Kayıt", istek_anahtari: "panel-test-musteri-0003" });
  var boyutlar = [{ width: 360, height: 740 }, { width: 390, height: 844 }];
  for (var bi = 0; bi < boyutlar.length; bi++) {
    var t = await sayfaAc(boyutlar[bi]), tp = t.p, W = boyutlar[bi].width;
    await tp.waitForSelector(".mcp-kutu .mcp-adres");
    await listeBekle(tp, 1);
    await tp.click(".mcp-rehberler summary");
    var tasma = await tp.evaluate(function () {
      var W = window.innerWidth, out = [];
      if (document.documentElement.scrollWidth > W) out.push("sayfa " + document.documentElement.scrollWidth);
      document.querySelectorAll(".mcp-kutu, .mcp-kutu *").forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.width && (r.right > W + 0.5 || r.left < -0.5)) out.push((e.className || e.tagName) + " " + Math.round(r.left) + "-" + Math.round(r.right));
      });
      return out;
    });
    if (EKRAN) await tp.locator("section.bolum:has(h2:has-text('Sohbet bağlantıları'))").screenshot({ path: path.join(EKRAN, "mcp-telefon-" + W + ".png") });
    ok("[ui] telefon " + W + " px: Sohbet bağlantıları bolumunde yatay tasma yok", tasma.length === 0, tasma.join(", "));
    var kucuk = await tp.evaluate(function () {
      return Array.prototype.filter.call(document.querySelectorAll(".mcp-kutu button"), function (b) { var r = b.getBoundingClientRect(); return r.height && r.height < 40; }).map(function (b) { return b.textContent; });
    });
    ok("[ui] telefon " + W + " px: dugmeler parmak boyu (>= 40 px)", kucuk.length === 0, kucuk.join(", "));
    var girdiFont = await tp.evaluate(function () { return parseFloat(getComputedStyle(document.querySelector(".mcp-adres")).fontSize); });
    ok("[ui] telefon " + W + " px: adres kutusu 16 px (iOS buyutmez)", girdiFont >= 16, girdiFont);
    if (bi === 1) {
      await tp.click(".mcp-baglanti button:has-text('Bağlantıyı kes')");
      var td = tp.locator("dialog[open]");
      await td.waitFor();
      await td.locator("button[type=submit]").click();
      await tp.waitForSelector(".toast:has-text('Bağlantı kesildi.')");
      ok("[ui] telefon: baglanti kesildi, jeton 401", (await mcpDurum(F.erisim)) === 401);
    }
    await t.ctx.close();
  }
  ok("[ui] tarayici hatasi yok", hatalar.length === 0, hatalar.join(" | "));
  await tarayici.close();
}

async function ana() {
  PORT = await O.bosPort();
  KOK = "http://127.0.0.1:" + PORT;
  ayar();
  await baslat();
  I = new O.Istemci(PORT, KOK);
  try {
    await api();
    var pw = playwrightBul();
    if (!pw) {
      console.log("ATLA arayuz bolumu: Playwright yok");
      if (process.env.STUDIO_E2E_ZORUNLU) kalan++;
    } else {
      await arayuz(pw);
    }
  } finally {
    await durdur();
  }
  var uyari = phpGunluk.split(/\r?\n/).filter(function (s) { return /PHP (Warning|Notice|Deprecated|Fatal|Parse)/.test(s); });
  ok("PHP uyarisi / hatasi yok", uyari.length === 0, uyari.slice(0, 5).join(" | "));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + gecen + " gecti, " + kalan + " kaldi");
  process.exit(kalan ? 1 : 0);
}
ana().catch(function (e) { console.error(e); durdur().then(function () { process.exit(1); }); });
