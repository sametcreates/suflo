/*
 * Suflo Studio sunucusu (server/studio-v1/index.php): gercek php -S + gecici SQLite. Yalniz anonim ornek veri.
 *  - Origin izin listesi, X-Studio basligi, JSON icerik turu (CSRF); GET 405; ayar yoksa 503
 *  - giris disindaki her islem oturumsuz / sahte cerezle 401; cerez HttpOnly + SameSite=Strict + yol; DB'de yalniz ozet
 *  - kaydet / toplu: beyaz liste, dogrulama, surum cakismasi 409, ayni ad 409, toplu hata tumunu geri alir, arsiv (silme yok)
 *  - sunucu yeniden baslayinca veri ve oturum kalir; cikis ve "tum oturumlari kapat" cerezi gecersiz kilar; bosta kalma suresi
 *  - ice aktarma: onizleme degistirmez, uygulama oncesi anlik kopya, ikinci kez aktarmada mukerrer yok, hatali dosya hic yazmaz
 *  - disa aktarma -> tum veriyi degistir (onayli) -> ayni veri; anlik kopyaya donus; sifre degistirme; hatali giris kilidi
 *  - tekrarlanan istek (istemci kimligi) ikinci kayit olusturmaz; gunluk otomatik kopya (14, ayri sayilir); ayar.sonYedek;
 *    Turkce onay ('GERİ YÜKLE') ve Turkce sunucu mesajlari
 * php yoksa ATLA (CI'da php isi ayrica php -l calistirir). STUDIO_TEST_MYSQL verilirse ayni test MySQL / MariaDB'de kosar.
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), http = require("http"), net = require("net");
var ROOT = path.join(__dirname, "..");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 500) + "]" : "")); }
function j(x) { return JSON.stringify(x); }
// Istanbul takvim gunu (UTC+3, yaz saati yok), bugunden ek gun sonra. Sunucu gecmis gun istisnalarini kendi gercek
// saatine gore budar: sabit bir tarih yazilirsa test o tarih gecince kendiliginden kalir.
function istanbulGunu(ek) { return new Date(Date.now() + 3 * 3600 * 1000 + ek * 86400 * 1000).toISOString().slice(0, 10); }

var phpVar = cp.spawnSync("php", ["-v"], { encoding: "utf8" });
if (phpVar.error || phpVar.status !== 0) {
  console.log("ATLA php bulunamadi: Studio sunucu testi calismadi (CI php isi php -l ile sozdizimini denetler)");
  process.exit(0);
}
// Varsayilan: gecici SQLite. STUDIO_TEST_MYSQL="host=127.0.0.1;port=3306" verilirse ayni test MySQL / MariaDB'de kosar
// (STUDIO_TEST_DB_USER / STUDIO_TEST_DB_PASS; kullanici studio_test_* adli veritabanlarini acip silebilmeli, test sonunda siler).
var MY = process.env.STUDIO_TEST_MYSQL || "";
var DB_USER = MY ? (process.env.STUDIO_TEST_DB_USER || "root") : "", DB_PASS = MY ? (process.env.STUDIO_TEST_DB_PASS || "") : "";
var sqliteVar = cp.spawnSync("php", ["-r", "echo in_array($argv[1], PDO::getAvailableDrivers()) ? 'var' : 'yok';", MY ? "mysql" : "sqlite"], { encoding: "utf8" });
["server/studio-v1/index.php", "server/studio-v1/config.example.php", "server/studio-v1/sifre-ozeti.php"].forEach(function (f) {
  var r = cp.spawnSync("php", ["-l", path.join(ROOT, f)], { encoding: "utf8" });
  ok("php -l " + f, r.status === 0, r.stdout + r.stderr);
});
var kaynak = fs.readFileSync(path.join(ROOT, "server", "studio-v1", "index.php"), "utf8");
var ornek = fs.readFileSync(path.join(ROOT, "server", "studio-v1", "config.example.php"), "utf8");
ok("ornek config: sifre ozeti bos, gizli bilgi yok", /'password_hash' => ''/.test(ornek) && /'db_pass' => ''/.test(ornek) && !/\$2y\$|\$argon2/.test(ornek));
ok("Pro lisans servisinden ayri: pro-v1 ayari / lisans okunmaz", !/pro-v1|license|lisans/i.test(kaynak.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
ok("ayar yolu yalniz public_html disindaki private/studio-v1 (ortam degiskeni yok)", /private\/studio-v1\/config\.php/.test(kaynak) && !/getenv\(/.test(kaynak));
ok("sifre-ozeti yalniz komut satirinda", /PHP_SAPI !== 'cli'/.test(fs.readFileSync(path.join(ROOT, "server", "studio-v1", "sifre-ozeti.php"), "utf8")));
if (sqliteVar.stdout !== "var") {
  if (MY) { ok("STUDIO_TEST_MYSQL verildi ama php pdo_mysql yok", false); process.exit(1); }
  console.log("ATLA php pdo_sqlite yok: Studio sunucu testinin kalani calismadi");
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
}

var SIFRE = "ornek-deneme-sifresi-1";
var ORIGIN = "http://studio.ornek.test";
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-srv-"));
var PUB = path.join(TMP, "public_html"), API_DIR = path.join(PUB, "studio", "v1"), PRIV = path.join(TMP, "private", "studio-v1");
fs.mkdirSync(API_DIR, { recursive: true });
fs.mkdirSync(PRIV, { recursive: true });
fs.copyFileSync(path.join(ROOT, "server", "studio-v1", "index.php"), path.join(API_DIR, "index.php"));
var ozet = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", SIFRE], { encoding: "utf8" }).stdout;
// Test veritabani yardimcilari (SQLite: PRIV altinda dosya; MySQL: studio_test_<pid>_<ad> veritabani)
var DB_ONEK = "studio_test_" + process.pid + "_", acilanDblar = [];
function dbPdo(dsn, sqller, sorgu) {
  var r = cp.spawnSync("php", ["-r", "$p = new PDO($argv[1], $argv[2], $argv[3], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]); " +
    "foreach (json_decode($argv[4]) as $s) $p->exec($s); if ($argv[5] !== '') echo json_encode($p->query($argv[5])->fetchAll(PDO::FETCH_NUM));",
    dsn, DB_USER, DB_PASS, JSON.stringify(sqller || []), sorgu || ""], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("test veritabani: " + r.stdout + r.stderr);
  return r.stdout;
}
function dbAc(ad, sqller) {
  var dsn = "sqlite:" + path.join(PRIV, ad + ".sqlite").split("\\").join("/");
  if (MY) {
    dbPdo("mysql:" + MY + ";charset=utf8mb4", ["CREATE DATABASE `" + DB_ONEK + ad + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"]);
    acilanDblar.push(DB_ONEK + ad);
    dsn = "mysql:" + MY + ";dbname=" + DB_ONEK + ad + ";charset=utf8mb4";
  }
  if (sqller && sqller.length) dbPdo(dsn, sqller);
  return dsn;
}
var ANA_DSN = dbAc("studio");
// JSON -> PHP dizi sozdizimi (yalniz duz anahtar/deger ve dizi listeleri)
function phpDizi(o) {
  if (Array.isArray(o)) return "[" + o.map(phpDizi).join(", ") + "]";
  if (o && typeof o === "object") return "[" + Object.keys(o).map(function (k) { return phpDizi(k) + " => " + phpDizi(o[k]); }).join(", ") + "]";
  if (typeof o === "string") return "'" + o.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
  if (typeof o === "boolean") return o ? "true" : "false";
  return String(o);
}
function ayarYaz(ek) {
  fs.writeFileSync(path.join(PRIV, "config.php"), "<?php\nreturn " + phpDizi(Object.assign({
    password_hash: ozet, dsn: ANA_DSN, db_user: DB_USER, db_pass: DB_PASS,
    allowed_origins: [ORIGIN], login_max_fail: 5, login_window: 900, cookie_secure: false
  }, ek || {})) + ";\n");
}
ayarYaz();
// Calisan sunucuda ayar degisikligi: php -S opcache kapali baslatilir (baslat), config.php her istekte yeniden okunur;
// beklemek gerekmez (opcache acik olsaydi config.php en cok 2 sn onbellekte kalirdi: revalidate_freq)
async function ayarDegistir(ek) { ayarYaz(ek); }

var PORT = 0, phpSurec = null;
function bosPort() {
  return new Promise(function (res) { var s = net.createServer(); s.listen(0, "127.0.0.1", function () { var p = s.address().port; s.close(function () { res(p); }); }); });
}
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function ham(o) {
  return new Promise(function (res) {
    var govde = o.govde === undefined ? "" : (typeof o.govde === "string" ? o.govde : JSON.stringify(o.govde));
    var bas = Object.assign({}, o.baslik || {});
    if (govde) bas["Content-Length"] = Buffer.byteLength(govde);
    var r = http.request({ host: "127.0.0.1", port: PORT, path: "/studio/v1/index.php", method: o.yontem || "POST", headers: bas }, function (y) {
      var p = [];
      y.on("data", function (c) { p.push(c); });
      y.on("end", function () {
        var t = Buffer.concat(p).toString("utf8"), js = null;
        try { js = JSON.parse(t); } catch (e) {}
        res({ status: y.statusCode, headers: y.headers, json: js, metin: t });
      });
    });
    r.on("error", function (e) { res({ status: 0, hata: String(e), headers: {}, json: null }); });
    r.end(govde);
  });
}
var cerez = "", cihazCerezi = "";
// Taninan cihaz cerezi yalniz ek.cihaz verilince gonderilir (varsayilan: yeni cihaz / saldirgan gibi)
function ist(govde, ek) {
  ek = ek || {};
  var bas = { "Content-Type": "application/json", "Origin": ORIGIN, "X-Studio": "1" };
  var oturumC = ek.cerez !== undefined ? ek.cerez : cerez, cerezler = [];
  if (oturumC) cerezler.push("suflo_studio=" + oturumC);
  if (ek.cihaz && cihazCerezi) cerezler.push("suflo_studio_cihaz=" + cihazCerezi);
  if (cerezler.length) bas.Cookie = cerezler.join("; ");
  Object.assign(bas, ek.baslik || {});
  (ek.sil || []).forEach(function (k) { delete bas[k]; });
  return ham({ govde: govde, baslik: bas }).then(function (r) {
    var sc = [].concat(r.headers["set-cookie"] || []).filter(function (c) { return /^suflo_studio=/.test(c); })[0];
    r.setCookie = sc || null;
    var cz = [].concat(r.headers["set-cookie"] || []).filter(function (c) { return /^suflo_studio_cihaz=/.test(c); })[0];
    r.cihazCookie = cz || null;
    if (cz) cihazCerezi = cz.split(";")[0].slice("suflo_studio_cihaz=".length);
    if (sc && !ek.cereziSakla) cerez = sc.split(";")[0].split("=")[1] === "deleted" ? "" : sc.split(";")[0].slice("suflo_studio=".length);
    return r;
  });
}
function baslat() {
  return new Promise(function (res, rej) {
    // birden cok isci: eszamanli istekler gercekten ayni anda islenir (SQLite kilitleri denensin)
    // display_errors acik: en kotu barindirma ayari; bir PHP uyarisi yanita karisirsa JSON bozulur ve test kalir
    // opcache kapali: ayarDegistir'in yazdigi config.php bir sonraki istekte okunur (opcache.enable_cli php -S'e etki etmez)
    phpSurec = cp.spawn("php", ["-d", "display_errors=1", "-d", "error_reporting=-1", "-d", "opcache.enable=0", "-S", "127.0.0.1:" + PORT, "-t", PUB], { stdio: ["ignore", "ignore", "pipe"], env: Object.assign({}, process.env, { PHP_CLI_SERVER_WORKERS: "4" }) });
    phpSurec.stderr.on("data", function () {});
    var n = 0;
    (function dene() {
      ham({ yontem: "GET" }).then(function (r) {
        if (r.status) return res();
        if (++n > 60) return rej(new Error("php -S baslamadi"));
        setTimeout(dene, 100);
      });
    })();
  });
}
function durdur() {
  return new Promise(function (res) {
    if (!phpSurec) return res();
    phpSurec.once("exit", function () { phpSurec = null; res(); });
    phpSurec.kill();
  });
}

async function calis() {
  PORT = await bosPort();
  await baslat();

  /* ---- CSRF ve istek bicimi ---- */
  var r = await ham({ yontem: "GET" });
  ok("GET 405", r.status === 405, r.status);
  r = await ham({ yontem: "OPTIONS", baslik: { Origin: ORIGIN, "Access-Control-Request-Method": "POST" } });
  ok("OPTIONS izinli kaynak: 204 + tam origin + credentials", r.status === 204 && r.headers["access-control-allow-origin"] === ORIGIN &&
    r.headers["access-control-allow-credentials"] === "true" && /X-Studio/.test(r.headers["access-control-allow-headers"] || ""), j(r.headers));
  r = await ham({ yontem: "OPTIONS", baslik: { Origin: "https://kotu.ornek" } });
  ok("OPTIONS baska kaynak 403, CORS basligi yok", r.status === 403 && !r.headers["access-control-allow-origin"]);
  r = await ist({ islem: "oturum" }, { sil: ["Origin"] });
  ok("Origin yok: 403", r.status === 403 && r.json.hata === "kaynak", j(r.json));
  r = await ist({ islem: "oturum" }, { baslik: { Origin: "https://kotu.ornek" } });
  ok("yanlis Origin: 403", r.status === 403);
  r = await ist({ islem: "oturum" }, { sil: ["X-Studio"] });
  ok("X-Studio basligi yok: 403", r.status === 403 && r.json.hata === "baslik");
  r = await ist({ islem: "oturum" }, { baslik: { "Content-Type": "text/plain" } });
  ok("text/plain (basit form istegi): 415", r.status === 415);
  r = await ham({ govde: "{bozuk", baslik: { "Content-Type": "application/json", Origin: ORIGIN, "X-Studio": "1" } });
  ok("bozuk JSON: 400", r.status === 400);
  r = await ist({ islem: "oturum" });
  ok("oturum: girisli degil, kurulu", r.status === 200 && r.json.girisli === false && r.json.kurulu === true, j(r.json));
  ok("guvenlik basliklari: no-store, nosniff, CSP, DENY", /no-store/.test(r.headers["cache-control"]) && r.headers["x-content-type-options"] === "nosniff" &&
    /default-src 'none'/.test(r.headers["content-security-policy"] || "") && r.headers["x-frame-options"] === "DENY");


  /* ---- Oturumsuz buyuk govde okunmaz ---- */
  var buyuk = JSON.stringify({ islem: "oturum", dolgu: "x".repeat(20000) });
  r = await ist(buyuk, { cerez: "", cereziSakla: true });
  ok("oturumsuz 20 KB govde: cozulmeden reddedilir (401 giris gerekli)", r.status === 401 && r.json.hata === "oturum", r.status);
  r = await ist({ islem: "oturum", dolgu: "x".repeat(2000) }, { cerez: "", cereziSakla: true });
  ok("oturumsuz kucuk govde: 200", r.status === 200);

  /* ---- Oturumsuz erisim ---- */
  var korunan = ["veri", "kaydet", "toplu", "ice_aktar", "disa_aktar", "anliklar", "anlik_geri", "sifre_degistir", "oturumlari_kapat", "cikis", "bilinmeyen"];
  var sonuc = [];
  for (var i = 0; i < korunan.length; i++) {
    var y = await ist({ islem: korunan[i], tur: "musteri", veri: { ad: "X" }, kayitlar: [{ tur: "musteri", veri: { ad: "Y" } }], veriler: { musteriler: [{ ad: "Z" }] }, onay: "GERI YUKLE" });
    sonuc.push(korunan[i] + ":" + y.status + ":" + (y.json && y.json.hata));
  }
  ok("girissiz her islem 401 oturum (" + korunan.length + " islem)", sonuc.every(function (s) { return /:401:oturum$/.test(s); }), sonuc.join(" "));
  r = await ist({ islem: "veri" }, { cerez: "a".repeat(43) });
  ok("sahte cerez: 401", r.status === 401);
  r = await ist({ islem: "veri", lisans: "SUFLO-PRO-ORNEK-ANAHTAR" });
  ok("Pro lisans anahtari Studio'ya erisim vermez", r.status === 401);

  /* ---- Bicimsiz girdi: PHP uyarisi (sunucu yolu) yanita sizmaz ---- */
  r = await ist({ islem: ["x"] }, { cerez: "", cereziSakla: true });
  ok("dizi 'islem' (oturumsuz): yanit saf JSON, yol / uyari yok", !!r.json && r.status === 401 && !/Warning|index\.php|<br/.test(r.metin), r.metin.slice(0, 200));
  r = await ist({ islem: "oturum" }, { cerez: "", cereziSakla: true, baslik: { Cookie: "suflo_studio[a]=b; suflo_studio_cihaz[]=c" } });
  ok("dizi cerez: yanit saf JSON, oturum yok sayilir", !!r.json && r.json.ok === true && r.json.girisli === false && !/Warning|<br/.test(r.metin), r.metin.slice(0, 200));

  /* ---- Giris ---- */
  r = await ist({ islem: "giris", sifre: "yanlis-sifre-0000" });
  ok("yanlis sifre: 401, cerez yok", r.status === 401 && r.json.hata === "sifre" && !r.setCookie);
  ok("sunucu mesaji Turkce harfli (kod ayni)", r.json.mesaj === "Şifre yanlış.", r.json.mesaj);
  r = await ist({ islem: "giris", sifre: SIFRE });
  ok("dogru sifre: 200 + cerez", r.status === 200 && r.json.girisli === true && !!cerez, j(r.json));
  ok("cerez: HttpOnly, SameSite=Strict, Path=/, Max-Age (alan adi yok)", /HttpOnly/i.test(r.setCookie) && /SameSite=Strict/i.test(r.setCookie) &&
    /path=\/(;|$)/i.test(r.setCookie) && /Max-Age=\d+/i.test(r.setCookie) && !/domain=/i.test(r.setCookie), r.setCookie);
  ok("taninan cihaz cerezi verildi (yalniz kilidi asmak icin, 400 gun)", !!cihazCerezi && /Max-Age=345600\d\d/.test(r.cihazCookie || ""), r.cihazCookie);
  var oturumCerezi = cerez;
  var dbHam = MY ? ["ayar", "oturumlar", "cihazlar", "girisler"].map(function (t) { return dbPdo(ANA_DSN, [], "SELECT * FROM " + t); }).join("") :
    fs.readFileSync(path.join(PRIV, "studio.sqlite")).toString("latin1") + (fs.existsSync(path.join(PRIV, "studio.sqlite-wal")) ? fs.readFileSync(path.join(PRIV, "studio.sqlite-wal")).toString("latin1") : "");
  ok("veritabaninda oturum anahtarinin kendisi yok (yalniz ozeti)", dbHam.indexOf(oturumCerezi) === -1);
  r = await ist({ islem: "oturum" });
  ok("oturum: girisli", r.json.girisli === true);
  r = await ist({ islem: "veri" });
  ok("veri: bos baslar (ornek veri eklenmez)", r.status === 200 && r.json.veri.musteriler.length === 0 && r.json.veri.icerikler.length === 0 && r.json.veri.etkinlikler.length === 0, j(r.json));

  r = await ist({ islem: "kaydet", tur: [], veri: { ad: "X" } });
  var r2 = await ist({ islem: "toplu", kayitlar: [{ tur: "musteri", id: ["x"], veri: { ad: "X" } }] });
  var r3 = await ist({ islem: "anlik_geri", onay: "GERI YUKLE", id: [] });
  ok("oturumlu bicimsiz tur / id: 422 / 404 saf JSON, uyari yok", r.status === 422 && r2.status === 422 && r3.status === 404 && [r, r2, r3].every(function (x) { return !!x.json && !/Warning|<br/.test(x.metin); }),
    [r, r2, r3].map(function (x) { return x.status + " " + x.metin.slice(0, 120); }).join(" | "));

  /* ---- Kaydet ---- */
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "  Örnek  Müşteri A ", kurum: "Örnek Kurum", ucret: 12000, siklik: { tur: "haftalik", haftalikAdet: 2, gunler: [4, 1, 4] },
    slotTuru: "video", stokGirisi: false, gizli: "<script>", id: "elle-id" } });
  var mA = r.json && r.json.kayit;
  ok("musteri eklendi: kirpilmis ad, gunler sirali tekil, beyaz liste disi alan yok", r.status === 200 && mA.ad === "Örnek  Müşteri A" && j(mA.siklik.gunler) === "[1,4]" &&
    mA.gizli === undefined && mA.surum > 0 && /^[a-f0-9]{24}$/.test(mA.id), j(r.json));
  r = await ist({ islem: "anliklar" });
  ok("gunluk kopya: bos veride ilk yazmadan once alinmaz", r.status === 200 && r.json.anliklar.length === 0, j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "örnek  müşteri a", kurum: "ÖRNEK KURUM" } });
  ok("ayni ad + kurum (buyuk/kucuk harf farkli) ikinci kez eklenmez: 409", r.status === 409 && r.json.hata === "ayni_ad", j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek Müşteri B", ucret: null, siklik: { tur: "belirsiz" } } });
  var mB = r.json.kayit;
  ok("ucreti belirsiz musteri: ucret null (0 degil)", r.status === 200 && mB.ucret === null && mB.siklik.tur === "belirsiz", j(mB));
  r = await ist({ islem: "anliklar" });
  ok("gunluk kopya: gunun ilk basarili yazmasindan once bir kez (409 alan yazma kopya birakmaz)", r.json.anliklar.length === 1 && r.json.anliklar[0].neden === "gunluk" &&
    r.json.anliklar[0].ozet === "1 müşteri, 0 içerik, 0 çekim / etkinlik", j(r.json.anliklar));
  var gecersizler = [
    [{ ad: "" }, "bos ad"], [{ ad: "X", ucret: -5 }, "negatif ucret"], [{ ad: "X", siklik: { tur: "ayda" } }, "siklik"],
    [{ ad: "X", siklik: { tur: "uc_gun", baslangic: "2030-02-30" } }, "tarih"], [{ ad: "X", siklik: { tur: "haftalik", gunler: [8] } }, "gun 8"], [{ ad: ["X"] }, "dizi ad"]
  ];
  var gs = [];
  for (i = 0; i < gecersizler.length; i++) gs.push((await ist({ islem: "kaydet", tur: "musteri", veri: gecersizler[i][0] })).status);
  ok("gecersiz musteri verileri 422", gs.every(function (s) { return s === 422; }), j(gs));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "X", ucret: -5 } });
  ok("dogrulama mesaji arayuzdeki alan adiyla, Turkce", r.status === 422 && r.json.hata === "gecersiz" && r.json.mesaj === "Aylık ücret 0 ile 100.000.000 arasında tam sayı olmalı", r.json.mesaj);
  r = await ist({ islem: "kaydet", tur: "kullanici", veri: { ad: "X" } });
  ok("bilinmeyen tur 422", r.status === 422);

  r = await ist({ islem: "kaydet", tur: "musteri", id: mA.id, surum: mA.surum, veri: Object.assign({}, mA, { ucret: 13000 }) });
  ok("guncelleme: surum artti", r.status === 200 && r.json.kayit.surum > mA.surum && r.json.kayit.ucret === 13000, j(r.json));
  var mA2 = r.json.kayit;
  r = await ist({ islem: "kaydet", tur: "musteri", id: mA.id, surum: mA.surum, veri: Object.assign({}, mA, { ucret: 1 }) });
  ok("eski surumle yazma: 409 + guncel kayit (ikinci cihaz ustune yazamaz)", r.status === 409 && r.json.hata === "cakisma" && r.json.guncel.ucret === 13000 &&
    r.json.guncel.surum === mA2.surum && j(r.json.guncel.siklik.gunTurleri) === "{}", j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", id: mA.id, veri: Object.assign({}, mA, { ucret: 1 }) });
  ok("surumsuz guncelleme de 409", r.status === 409);
  r = await ist({ islem: "kaydet", tur: "etkinlik", id: mA.id, surum: mA2.surum, veri: { baslik: "x", basTarih: "2030-03-04", tumGun: true } });
  ok("kaydin turu degistirilemez", r.status === 422);
  r = await ist({ islem: "kaydet", tur: "musteri", id: "ffffffffffffffffffffffff", surum: 3, veri: { ad: "Yok" } });
  ok("olmayan kaydi surumle guncelleme 404", r.status === 404);

  // Etkinlikler
  r = await ist({ islem: "kaydet", tur: "etkinlik", veri: { musteriId: mA.id, baslik: "Örnek çekim", tur: "cekim", basTarih: "2030-03-04", basSaat: "10:00", bitTarih: "2030-03-04", bitSaat: "12:00", durum: "planlandi" } });
  var e1 = r.json.kayit;
  ok("saatli cekim eklendi", r.status === 200 && e1.basSaat === "10:00" && e1.tumGun === false, j(r.json));
  r = await ist({ islem: "kaydet", tur: "etkinlik", veri: { baslik: "Örnek etkinlik (musterisiz)", tumGun: true, basTarih: "2030-03-09", bitTarih: "2030-03-10", basSaat: "09:00" } });
  ok("musterisiz iki gunluk tum gun etkinlik: saatler bos", r.status === 200 && r.json.kayit.musteriId === null && r.json.kayit.basSaat === null && r.json.kayit.bitTarih === "2030-03-10", j(r.json));
  var es = [];
  es.push((await ist({ islem: "kaydet", tur: "etkinlik", veri: { baslik: "x", basTarih: "2030-03-04", basSaat: "12:00", bitSaat: "11:00" } })).status);
  es.push((await ist({ islem: "kaydet", tur: "etkinlik", veri: { baslik: "x", basTarih: "2030-03-04" } })).status);
  es.push((await ist({ islem: "kaydet", tur: "etkinlik", veri: { baslik: "x", tumGun: true, basTarih: "2030-03-05", bitTarih: "2030-03-04" } })).status);
  es.push((await ist({ islem: "kaydet", tur: "etkinlik", veri: { baslik: "x", basTarih: "2030-03-04", basSaat: "25:00", bitSaat: "26:00" } })).status);
  es.push((await ist({ islem: "kaydet", tur: "etkinlik", veri: { musteriId: "ffffffffffffffffffffffff", baslik: "x", tumGun: true, basTarih: "2030-03-04" } })).status);
  ok("gecersiz etkinlikler 422 (bitis once, saatsiz, ters tarih, 25:00, olmayan musteri)", es.every(function (s) { return s === 422; }), j(es));

  // Icerikler + toplu
  r = await ist({ islem: "toplu", kayitlar: [
    { tur: "icerik", veri: { musteriId: mA.id, baslik: "Örnek içerik 1", tur: "reels", durum: "hazir", cekimId: e1.id, dosyalar: { ham: "https://depo.ornek/ham", proje: "C:\\Kurgu\\a.prproj" } } },
    { tur: "icerik", veri: { musteriId: mA.id, baslik: "Örnek içerik 2", tur: "reels", durum: "kurguda", cekimId: e1.id } },
    { tur: "icerik", veri: { musteriId: mA.id, baslik: "Örnek post", tur: "post", durum: "hazir" } }
  ] });
  ok("toplu: 3 icerik tek seferde, ayni cekime bagli", r.status === 200 && r.json.kayitlar.length === 3 && r.json.kayitlar[1].cekimId === e1.id, j(r.json));
  var ic1 = r.json.kayitlar[0];
  ok("dosya baglantilari ayri alanlarda, yerel yol olduğu gibi saklanir (yukleme yok)", ic1.dosyalar.ham === "https://depo.ornek/ham" && ic1.dosyalar.proje === "C:\\Kurgu\\a.prproj" && ic1.dosyalar.final === "");
  r = await ist({ islem: "toplu", kayitlar: [
    { tur: "icerik", veri: { musteriId: mA.id, baslik: "Geri alinacak 1" } },
    { tur: "icerik", veri: { musteriId: mA.id, baslik: "Geri alinacak 2", durum: "bilinmeyen" } }
  ] });
  var v = (await ist({ islem: "veri" })).json.veri;
  ok("toplu: bir kayit hataliysa hicbiri yazilmaz (sira bildirilir)", r.status === 422 && r.json.sira === 1 && v.icerikler.length === 3 && !v.icerikler.some(function (x) { return /Geri alinacak/.test(x.baslik); }), j(r.json));
  r = await ist({ islem: "kaydet", tur: "icerik", veri: { musteriId: "ffffffffffffffffffffffff", baslik: "x" } });
  ok("olmayan musteriye icerik 422", r.status === 422);
  r = await ist({ islem: "kaydet", tur: "icerik", veri: { musteriId: mA.id, baslik: "x", cekimId: mB.id } });
  ok("cekim alanina musteri id'si verilemez", r.status === 422);
  r = await ist({ islem: "kaydet", tur: "icerik", id: ic1.id, surum: ic1.surum, veri: Object.assign({}, ic1, { durum: "yayinlandi", yayinTarihi: "2030-03-04", gecmis: [{ z: "2030-03-04 10:00", m: "Yayına hazır → Yayınlandı" }] }) });
  ok("durum guncelleme + gecmis", r.status === 200 && r.json.kayit.durum === "yayinlandi" && r.json.kayit.gecmis.length === 1);
  ic1 = r.json.kayit;
  r = await ist({ islem: "kaydet", tur: "icerik", id: ic1.id, surum: ic1.surum, veri: Object.assign({}, ic1, { arsiv: true }) });
  ok("arsivleme: kayit durur, arsiv isaretli", r.status === 200 && r.json.kayit.arsiv === true);
  r = await ist({ islem: "sil", id: ic1.id });
  v = (await ist({ islem: "veri" })).json.veri;
  ok("silme islemi yok (400), arsivlenen kayit hala veride", r.status === 400 && v.icerikler.length === 3 && v.icerikler.some(function (x) { return x.id === ic1.id && x.arsiv; }));
  r = await ist({ islem: "kaydet", tur: "ayar", veri: { varsayilanStokUyari: 4 } });
  ok("ayar kaydi (tek)", r.status === 200 && r.json.kayit.id === "ayar" && r.json.kayit.varsayilanStokUyari === 4, j(r.json));

  /* ---- Kalicilik: sunucu yeniden baslar, ayni oturum ve yeni giris ---- */
  var once = j((await ist({ islem: "veri" })).json.veri);
  await durdur();
  await baslat();
  r = await ist({ islem: "veri" });
  ok("sunucu yeniden basladiktan sonra ayni oturum gecerli ve veri ayni", r.status === 200 && j(r.json.veri) === once);
  var ikinciCihaz = (await ist({ islem: "giris", sifre: SIFRE }, { cerez: "", cereziSakla: true })).setCookie.split(";")[0].slice("suflo_studio=".length);
  r = await ist({ islem: "veri" }, { cerez: ikinciCihaz });
  ok("ikinci cihaz (yeni giris) ayni kayitlari gorur", r.status === 200 && j(r.json.veri) === once);
  r = await ist({ islem: "cikis" }, { cerez: ikinciCihaz, cereziSakla: true });
  ok("cikis: cerez silinir", r.status === 200 && /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(r.setCookie || ""), r.setCookie);
  r = await ist({ islem: "veri" }, { cerez: ikinciCihaz });
  ok("cikistan sonra eski cerez 401", r.status === 401);
  r = await ist({ islem: "veri" });
  ok("diger cihazin oturumu etkilenmez", r.status === 200);

  /* ---- Ice aktarma ---- */
  var dosya = { musteriler: [
    { ad: "ÖRNEK MÜŞTERİ A", kurum: "örnek kurum", ucret: 1 },                 // mevcut (harf farki) -> atla
    { ad: "Örnek Müşteri C", ucret: 9000, siklik: { tur: "uc_gun" } },
    { ad: "Örnek Müşteri D", ucret: null, siklik: { tur: "belirsiz" } }
  ], etkinlikler: [
    { musteriAdi: "Örnek Müşteri C", baslik: "C çekimi", tur: "cekim", basTarih: "2030-03-05", basSaat: "11:30", bitSaat: "16:30", durum: "tamamlandi" },
    { baslik: "Örnek organizasyon", tur: "cekim", tumGun: true, basTarih: "2030-03-07", bitTarih: "2030-03-08" }
  ], icerikler: [
    { musteriAdi: "Örnek Müşteri D", baslik: "D fikir", durum: "fikir" }
  ] };
  r = await ist({ islem: "ice_aktar", veriler: dosya, onizleme: true });
  var oz = r.json && r.json.onizleme;
  ok("onizleme: 2 musteri, 2 etkinlik, 1 icerik eklenecek, 1 mukerrer atlanacak", r.status === 200 && oz.sayilar.musteri === 2 && oz.sayilar.etkinlik === 2 &&
    oz.sayilar.icerik === 1 && oz.sayilar.atlanan === 1 && oz.hataSayisi === 0, j(r.json));
  ok("onizleme veriyi degistirmez", j((await ist({ islem: "veri" })).json.veri) === once);
  r = await ist({ islem: "ice_aktar", veriler: dosya });
  ok("ice aktarma uygulandi + anlik kopya", r.status === 200 && !!r.json.anlik, j(r.json));
  v = (await ist({ islem: "veri" })).json.veri;
  var mC = v.musteriler.filter(function (x) { return x.ad === "Örnek Müşteri C"; })[0];
  var eC = v.etkinlikler.filter(function (x) { return x.baslik === "C çekimi"; })[0];
  var org = v.etkinlikler.filter(function (x) { return x.baslik === "Örnek organizasyon"; })[0];
  ok("ice aktarma: musteri adi ile baglanti, musterisiz etkinlik, mevcut musteri degismedi", v.musteriler.length === 4 && eC.musteriId === mC.id && eC.durum === "tamamlandi" &&
    org.musteriId === null && v.musteriler.filter(function (x) { return x.id === mA.id; })[0].ucret === 13000, j(v.musteriler.map(function (x) { return x.ad; })));
  var sayiOnce = [v.musteriler.length, v.etkinlikler.length, v.icerikler.length].join();
  r = await ist({ islem: "ice_aktar", veriler: dosya });
  v = (await ist({ islem: "veri" })).json.veri;
  ok("ayni dosya ikinci kez: mukerrer kayit olusmaz", r.status === 200 && [v.musteriler.length, v.etkinlikler.length, v.icerikler.length].join() === sayiOnce && r.json.sonuc.sayilar.atlanan === 6, j(r.json.sonuc));
  r = await ist({ islem: "ice_aktar", veriler: { musteriler: [{ ad: "Örnek Müşteri E" }, { ad: "", ucret: "abc" }] } });
  v = (await ist({ islem: "veri" })).json.veri;
  ok("hatali kayit iceren dosya hic yazilmaz (422 + onizleme hatalari)", r.status === 422 && r.json.onizleme.hataSayisi === 1 && !v.musteriler.some(function (x) { return x.ad === "Örnek Müşteri E"; }), j(r.json));
  r = await ist({ islem: "ice_aktar", veriler: { icerikler: [{ musteriAdi: "Olmayan Kişi", baslik: "x" }] }, onizleme: true });
  ok("bulunamayan musteri adi onizlemede hata (satir: sira, tur ve baslik)", r.status === 200 && r.json.onizleme.hataSayisi === 1 &&
    r.json.onizleme.hatalar[0] === "1. içerik (x): “Olmayan Kişi” adlı müşteri bulunamadı", j(r.json));
  r = await ist({ islem: "ice_aktar", veriler: { etkinlikler: [{ musteriAdi: "Olmayan Kişi", baslik: "x", tumGun: true, basTarih: "2030-03-04" }] }, onizleme: true });
  ok("etkinlikte de bulunamayan musteri adi hata (sessizce musterisiz olmaz)", r.status === 200 && r.json.onizleme.hataSayisi === 1 && r.json.onizleme.sayilar.etkinlik === 0, j(r.json));

  /* ---- Disa aktar -> degistir -> geri yukle ---- */
  r = await ist({ islem: "disa_aktar" });
  var yedek = r.json.yedek;
  ok("disa aktarma bicimi", r.status === 200 && yedek.format === "suflo-studio-yedek" && yedek.veriler.musteriler.length === 4, j(yedek && yedek.format));
  var yedekOncesi = j((await ist({ islem: "veri" })).json.veri);
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Yedekten sonra eklenen" } });
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedek.veriler });
  ok("tumunu degistir onaysiz 422", r.status === 422 && r.json.hata === "onay");
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedek.veriler, onay: "GERI YUKLE" });
  v = (await ist({ islem: "veri" })).json.veri;
  var idler = function (l) { return l.map(function (x) { return x.id; }).sort().join(); };
  var yv = JSON.parse(yedekOncesi);
  ok("yedekten geri yukleme: ayni kayitlar ve id'ler, sonradan eklenen gitti", r.status === 200 && idler(v.musteriler) === idler(yv.musteriler) &&
    idler(v.icerikler) === idler(yv.icerikler) && idler(v.etkinlikler) === idler(yv.etkinlikler) && !v.musteriler.some(function (x) { return x.ad === "Yedekten sonra eklenen"; }), j(r.json));
  var bagli = v.icerikler.filter(function (x) { return x.cekimId; });
  ok("geri yuklemede icerik-cekim ve icerik-musteri baglantilari korunur", bagli.length === 2 && bagli.every(function (x) { return v.etkinlikler.some(function (e) { return e.id === x.cekimId; }) && v.musteriler.some(function (m) { return m.id === x.musteriId; }); }));
  ok("geri yukleme ayar kaydini silmez", v.ayar && v.ayar.varsayilanStokUyari === 4);
  r = await ist({ islem: "anliklar" });
  var anl = r.json.anliklar;
  ok("anlik kopyalar: ice aktarma ve geri yukleme oncesi", r.status === 200 && anl.some(function (a) { return a.neden === "geri_yukleme_oncesi"; }) && anl.some(function (a) { return a.neden === "ice_aktarma_oncesi"; }), j(anl));
  var sonAnlik = anl.filter(function (a) { return a.neden === "geri_yukleme_oncesi"; })[0];
  r = await ist({ islem: "anlik_geri", id: sonAnlik.id });
  ok("anliga donus onaysiz 422", r.status === 422);
  r = await ist({ islem: "anlik_geri", id: sonAnlik.id, onay: "GERI YUKLE" });
  v = (await ist({ islem: "veri" })).json.veri;
  ok("anliga donus: geri yukleme oncesi hal (sonradan eklenen musteri geri geldi)", r.status === 200 && v.musteriler.some(function (x) { return x.ad === "Yedekten sonra eklenen"; }), j(r.json));
  var mSon = v.musteriler.filter(function (x) { return x.id === mA.id; })[0];
  r = await ist({ islem: "kaydet", tur: "musteri", id: mSon.id, surum: mSon.surum, veri: Object.assign({}, mSon, { not: "anlik sonrasi" }) });
  ok("anliga donusten sonra kayitlar duzenlenebilir (surum tutarli)", r.status === 200, j(r.json));

  /* ---- Tumunu degistir: zaman damgalari yedekteki gibi; yedekte ayar bossa mevcut ayar da kalkar ---- */
  var zYedek = (await ist({ islem: "disa_aktar" })).json.yedek.veriler;
  var zm = zYedek.musteriler[0];
  zm.guncelleme = 1700000000; zm.olusturma = 1600000000;
  zYedek.ayar = null;
  var zOz = (await ist({ islem: "ice_aktar", kip: "degistir", veriler: zYedek, onizleme: true })).json.onizleme;
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: zYedek, onay: "GERI YUKLE", beklenen: Object.assign({}, zOz.sayilar, { durum: zOz.durum }) });
  v = (await ist({ islem: "veri" })).json.veri;
  var zSonra = v.musteriler.filter(function (x) { return x.id === zm.id; })[0];
  ok("tumunu degistir: olusturma ve guncelleme yedekteki gibi kalir (liste sirasi degismez)", r.status === 200 && zSonra && zSonra.guncelleme === 1700000000 && zSonra.olusturma === 1600000000, j(zSonra));
  ok("yedekte ayar bos (null): onizleme bildirir, mevcut ayar da kaldirilir", zOz.ayarSil === true && !v.ayar, j(v.ayar));
  r = await ist({ islem: "kaydet", tur: "ayar", veri: { varsayilanStokUyari: 4 } });
  ok("ayar yeniden kaydedilebilir", r.status === 200, j(r.json));
  // Ice aktarma: musteriKurum metin degilse sessizce kurumsuz musteriye baglanmaz; gecmis satirindaki bilinmeyen anahtar uyarilir
  r = await ist({ islem: "ice_aktar", onizleme: true, veriler: { icerikler: [
    { musteriAdi: "Örnek Müşteri C", musteriKurum: 2024, baslik: "Kurum sayi" },
    { musteriAdi: "Örnek Müşteri C", baslik: "Geçmişli", gecmis: [{ z: "2030-01-01 10:00", m: "Eklendi", kim: "biri" }] }] } });
  ok("musteriKurum sayi: hata; gecmis[].kim: uyari", r.status === 200 && r.json.onizleme.hatalar.some(function (x) { return /musteriKurum\) metin olmalı/.test(x); }) &&
    r.json.onizleme.uyarilar.some(function (x) { return /gecmis\[\]\.kim/.test(x); }), j(r.json.onizleme));

  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek gün türlü", siklik: { tur: "haftalik", gunler: [2, 5], gunTurleri: { "5": "post", "3": "story", "2": "" } } } });
  ok("gune ozel tur: yalniz secili gunler saklanir, bos tur atlanir; nesne olarak doner", r.status === 200 && j(r.json.kayit.siklik.gunTurleri) === '{"5":"post"}', j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek gün türlü 2", siklik: { tur: "haftalik", gunler: [2] } } });
  ok("gune ozel tur yoksa bos nesne", r.status === 200 && j(r.json.kayit.siklik.gunTurleri) === "{}", j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek gün türlü 3", siklik: { tur: "haftalik", gunler: [2], gunTurleri: { "2": "tiktok" } } } });
  ok("gecersiz gun turu 422", r.status === 422, j(r.json));


  /* ---- Benzer ama ayri kayitlar yedekten geri yuklemede kaybolmaz ---- */
  var mP = (await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Benzer A" } })).json.kayit;
  var mQ = (await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Benzer B" } })).json.kayit;
  var bz = (await ist({ islem: "toplu", kayitlar: [
    { tur: "etkinlik", veri: { musteriId: mP.id, baslik: "Cekim", tumGun: true, basTarih: "2030-11-02" } },
    { tur: "etkinlik", veri: { musteriId: mQ.id, baslik: "Cekim", tumGun: true, basTarih: "2030-11-02" } }] })).json.kayitlar;
  await ist({ islem: "toplu", kayitlar: [
    { tur: "icerik", veri: { musteriId: mP.id, baslik: "Hazır içerik 1", durum: "hazir" } },
    { tur: "icerik", veri: { musteriId: mP.id, baslik: "Hazır içerik 1", durum: "hazir" } },
    { tur: "icerik", veri: { musteriId: mQ.id, baslik: "Kurgu", durum: "kurguda", cekimId: bz[1].id } }] });
  var once2 = (await ist({ islem: "veri" })).json.veri;
  var yedek2 = (await ist({ islem: "disa_aktar" })).json.yedek;
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedek2.veriler, onizleme: true });
  var oz2 = r.json.onizleme;
  ok("tumunu degistir onizlemesi: yedekteki her kayit eklenecek, kaldirilacak sayisi gosterilir", oz2.sayilar.icerik === once2.icerikler.length &&
    oz2.sayilar.etkinlik === once2.etkinlikler.length && oz2.sayilar.musteri === once2.musteriler.length && oz2.sayilar.atlanan === 0 &&
    oz2.kaldirilacak.icerik === once2.icerikler.length && oz2.hataSayisi === 0, j(oz2.sayilar) + j(oz2.kaldirilacak));
  await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedek2.veriler, onay: "GERI YUKLE" });
  var sonra2 = (await ist({ islem: "veri" })).json.veri;
  ok("yedekten geri yukleme: benzer kayitlar dahil hicbiri kaybolmaz, kimlikler ayni", idler(sonra2.icerikler) === idler(once2.icerikler) &&
    idler(sonra2.etkinlikler) === idler(once2.etkinlikler) && idler(sonra2.musteriler) === idler(once2.musteriler));
  var kurgu = sonra2.icerikler.filter(function (x) { return x.baslik === "Kurgu"; })[0];
  ok("geri yuklemede icerik dogru musterinin cekimine bagli kalir", kurgu && kurgu.cekimId === bz[1].id, j(kurgu));
  r = await ist({ islem: "ice_aktar", veriler: yedek2.veriler, onizleme: true });
  ok("ayni yedek birlestir kipinde: hepsi atlanir, eklenecek yok", r.json.onizleme.sayilar.atlanan === once2.musteriler.length + once2.icerikler.length + once2.etkinlikler.length &&
    r.json.onizleme.sayilar.icerik === 0 && r.json.onizleme.sayilar.etkinlik === 0, j(r.json.onizleme.sayilar));

  /* ---- Geri yuklemede surum numarasi tekrar kullanilmaz ---- */
  var mX = (await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Sürüm örneği", ucret: 1000 } })).json.kayit;
  await ist({ islem: "ice_aktar", veriler: { musteriler: [{ ad: "Sürüm tetik" }] } });
  var anl2 = (await ist({ islem: "anliklar" })).json.anliklar[0];
  var mX2 = (await ist({ islem: "kaydet", tur: "musteri", id: mX.id, surum: mX.surum, veri: Object.assign({}, mX, { ucret: 5000 }) })).json.kayit;
  await ist({ islem: "anlik_geri", id: anl2.id, onay: "GERI YUKLE" });
  r = await ist({ islem: "kaydet", tur: "musteri", id: mX.id, surum: mX2.surum, veri: Object.assign({}, mX2, { ucret: 5000 }) });
  ok("geri yuklemeden sonra eski cihazin surumuyle yazma 409 (geri yuklenen veri ezilmez)", r.status === 409 && r.json.guncel.ucret === 1000, j(r.json));

  /* ---- Ice aktarmada musteri adi eslesmesi ---- */
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Aynı Ad", kurum: "Kurum 1" } });
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Aynı Ad", kurum: "Kurum 2" } });
  r = await ist({ islem: "ice_aktar", veriler: { etkinlikler: [{ musteriAdi: "Aynı Ad", baslik: "x", tumGun: true, basTarih: "2030-03-04" }] }, onizleme: true });
  ok("ayni adda iki musteri: kurum yazilmadan baglanmaz (hata)", r.json.onizleme.hataSayisi === 1 && /birden çok/.test(r.json.onizleme.hatalar[0]), j(r.json.onizleme));
  r = await ist({ islem: "ice_aktar", veriler: { etkinlikler: [{ musteriAdi: "Aynı Ad", musteriKurum: "Kurum 3", baslik: "x", tumGun: true, basTarih: "2030-03-04" }] }, onizleme: true });
  ok("kurum eslesmezse baska musteriye baglanmaz (hata)", r.json.onizleme.hataSayisi === 1, j(r.json.onizleme));
  r = await ist({ islem: "ice_aktar", veriler: { etkinlikler: [{ musteriAdi: "aynı ad", musteriKurum: "KURUM 2", baslik: "x", tumGun: true, basTarih: "2030-03-04" }] }, onizleme: true });
  ok("ad + kurum eslesirse baglanir; onizleme baglanan musteriyi gosterir", r.json.onizleme.hataSayisi === 0 && r.json.onizleme.ekle[0].bag === "Aynı Ad · Kurum 2", j(r.json.onizleme));
  r = await ist({ islem: "ice_aktar", veriler: { musteriler: [{ ad: "Çift" }, { ad: "ÇİFT" }] }, onizleme: true });
  ok("ayni musteri dosyada iki kez: hata (sessizce birlesmez)", r.json.onizleme.hataSayisi === 1, j(r.json.onizleme));


  /* ---- Ice aktarma ayrintilari ---- */
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Kurumsuz İkiz" } });
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Kurumsuz İkiz", kurum: "Kurum Y" } });
  r = await ist({ islem: "ice_aktar", veriler: { etkinlikler: [{ musteriAdi: "Kurumsuz İkiz", baslik: "x", tumGun: true, basTarih: "2030-03-04" }] }, onizleme: true });
  ok("kurumsuz + kurumlu ayni ad, kurum yazilmadan: hata (sessizce kurumsuza baglanmaz)", r.json.onizleme.hataSayisi === 1 && /birden çok/.test(r.json.onizleme.hatalar[0]), j(r.json.onizleme));
  r = await ist({ islem: "ice_aktar", veriler: { etkinlikler: [{ musteriAdi: "Kurumsuz İkiz", musteriKurum: "", baslik: "x", tumGun: true, basTarih: "2030-03-04" }] }, onizleme: true });
  ok("musteriKurum bos yazilinca kurumsuz musteriye baglanir", r.json.onizleme.hataSayisi === 0 && r.json.onizleme.ekle[0].bag === "Kurumsuz İkiz", j(r.json.onizleme));
  r = await ist({ islem: "ice_aktar", veriler: { etkinlikler: [
    { musteriAdi: "Kurumsuz İkiz", musteriKurum: "Kurum Y", baslik: "Tekrarlanan", tumGun: true, basTarih: "2030-03-05" },
    { musteriAdi: "Kurumsuz İkiz", musteriKurum: "Kurum Y", baslik: "Tekrarlanan", tumGun: true, basTarih: "2030-03-05" }] }, onizleme: true });
  ok("kimliksiz ayni satir dosyada iki kez: bir kez eklenir, ikincisi atlanir", r.json.onizleme.sayilar.etkinlik === 1 && r.json.onizleme.sayilar.atlanan === 1 &&
    /dosyada aynı satır/.test(r.json.onizleme.atla[0].neden), j(r.json.onizleme));
  r = await ist({ islem: "ice_aktar", veriler: { musteriler: [{ ad: "Alan hatasi", aylikUcret: 12000 }, { ad: "Alan hatasi 2", ucret: 3000, siklik: { tur: "gunluk" } }] }, onizleme: true });
  ok("bilinmeyen alan uyarisi ve ucret ozeti (bilinen 1, belirsiz 1, toplam 3000)", r.json.onizleme.uyarilar.length === 1 && /aylikUcret/.test(r.json.onizleme.uyarilar[0]) &&
    r.json.onizleme.ucret.bilinen === 1 && r.json.onizleme.ucret.belirsiz === 1 && r.json.onizleme.ucret.toplam === 3000 &&
    r.json.onizleme.ekle[1].ucret === 3000 && r.json.onizleme.ekle[1].siklik === "gunluk", j(r.json.onizleme));
  r = await ist({ islem: "ice_aktar", veriler: { musteriler: [{ ad: "Yanlis siklik", siklik: "gunluk" }] }, onizleme: true });
  ok("siklik metin olarak yazilmissa hata (sessizce 'belirsiz' olmaz)", r.json.onizleme.hataSayisi === 1 && /Yayın sıklığı biçimi hatalı/.test(r.json.onizleme.hatalar[0]), j(r.json.onizleme));
  var beklenenOz = (await ist({ islem: "ice_aktar", veriler: { musteriler: [{ ad: "Beklenen örnek" }] }, onizleme: true })).json.onizleme;
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Beklenen örnek" } }); // baska cihaz arada ekledi
  r = await ist({ islem: "ice_aktar", veriler: { musteriler: [{ ad: "Beklenen örnek" }] }, beklenen: beklenenOz.sayilar });
  ok("onizlemeden sonra veri degistiyse uygulama 409 (onizleme_eski), yazilmaz", r.status === 409 && r.json.hata === "onizleme_eski", j(r.json));

  /* ---- Bagli cekim ayni musteriye ait olmali; silinmis ayar surumle yeniden yaratilmaz ---- */
  var mK1 = (await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Çekim sahibi 1" } })).json.kayit;
  var mK2 = (await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Çekim sahibi 2" } })).json.kayit;
  var eK1 = (await ist({ islem: "kaydet", tur: "etkinlik", veri: { musteriId: mK1.id, baslik: "K1 çekim", tumGun: true, basTarih: "2030-04-01" } })).json.kayit;
  r = await ist({ islem: "kaydet", tur: "icerik", veri: { musteriId: mK2.id, baslik: "Yanlış bağ", cekimId: eK1.id } });
  ok("icerik baska musterinin cekimine baglanamaz (422)", r.status === 422 && /başka bir müşteriye/.test(r.json.mesaj), j(r.json));
  var ayarK = (await ist({ islem: "veri" })).json.veri.ayar;
  r = await ist({ islem: "kaydet", tur: "ayar", id: "ayar", surum: ayarK.surum + 999999, veri: { varsayilanStokUyari: 9 } });
  ok("ayar eski surumle yazilamaz (409)", r.status === 409, j(r.json));
  var istisnaGunu = istanbulGunu(7), istisna = {};
  istisna[istisnaGunu] = "post"; istisna[istanbulGunu(8)] = "";
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Gün istisnası", siklik: { tur: "gunluk" }, slotIstisna: istisna } });
  ok("gun bazinda paylasim turu istisnasi saklanir (bos atlanir)", r.status === 200 && j(r.json.kayit.slotIstisna) === '{"' + istisnaGunu + '":"post"}', j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Gün istisnası 2", slotIstisna: { "2030-02-30": "post" } } });
  ok("gecersiz istisna tarihi 422", r.status === 422);

  /* ---- Yedekten tumunu degistir ayar kaydini da geri getirir ---- */
  var yedekA = (await ist({ islem: "disa_aktar" })).json.yedek;
  var ayarOnce = yedekA.veriler.ayar.varsayilanStokUyari;
  var ayarSimdi = (await ist({ islem: "veri" })).json.veri.ayar;
  await ist({ islem: "kaydet", tur: "ayar", id: "ayar", surum: ayarSimdi.surum, veri: { varsayilanStokUyari: 77 } });
  var degOz = (await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedekA.veriler, onizleme: true })).json.onizleme;
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedekA.veriler, onay: "GERI YUKLE", beklenen: degOz.sayilar });
  ok("tumunu degistir: yedekteki ayar da geri gelir", r.status === 200 && degOz.ayar === true && (await ist({ islem: "veri" })).json.veri.ayar.varsayilanStokUyari === ayarOnce, j(r.json));


  /* ---- Ucuncu tur: cekim musterisi degisirken bagli icerik, eski yedek birlestirme, ic ice bilinmeyen alan ---- */
  var mB1 = (await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Bağ müşteri 1" } })).json.kayit;
  var mB2 = (await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Bağ müşteri 2" } })).json.kayit;
  var eB = (await ist({ islem: "kaydet", tur: "etkinlik", veri: { musteriId: mB1.id, baslik: "Bağ çekimi", tumGun: true, basTarih: "2030-05-01" } })).json.kayit;
  var iB = (await ist({ islem: "kaydet", tur: "icerik", veri: { musteriId: mB1.id, baslik: "Bağlı içerik", cekimId: eB.id } })).json.kayit;
  var yedekB = (await ist({ islem: "disa_aktar" })).json.yedek;
  r = await ist({ islem: "kaydet", tur: "etkinlik", id: eB.id, surum: eB.surum, veri: Object.assign({}, eB, { musteriId: mB2.id }) });
  ok("cekimin musterisi, baska musterinin icerigi bagliyken degistirilemez (422, acik mesaj)", r.status === 422 && /bağlı/.test(r.json.mesaj), j(r.json));
  // icerik once ayrilirsa cekim tasinabilir
  var iB2 = (await ist({ islem: "kaydet", tur: "icerik", id: iB.id, surum: iB.surum, veri: Object.assign({}, iB, { cekimId: null }) })).json.kayit;
  r = await ist({ islem: "kaydet", tur: "etkinlik", id: eB.id, surum: eB.surum, veri: Object.assign({}, eB, { musteriId: mB2.id }) });
  ok("bag kaldirilinca cekim baska musteriye tasinabilir", r.status === 200, j(r.json));
  // eski yedek (cekim B1'de, icerik bagli) birlestirilince var olan kayitlar dogrulanmadan atlanir
  r = await ist({ islem: "ice_aktar", veriler: yedekB.veriler, onizleme: true });
  ok("eski yedek birlestirme: var olan kayitlar bugunku kurallara takilmadan atlanir (hata yok)", r.json.onizleme.hataSayisi === 0, j(r.json.onizleme.hatalar));
  // tumunu degistir: capraz musteri bagi dosyayi reddettirmez, uyariyla kaldirilir
  var yedekC = JSON.parse(JSON.stringify(yedekB.veriler));
  yedekC.etkinlikler.filter(function (e) { return e.id === eB.id; })[0].musteriId = mB2.id;
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedekC, onizleme: true });
  ok("geri yuklemede capraz musteri bagi: hata degil, uyari + bag kaldirilir", r.json.onizleme.hataSayisi === 0 && r.json.onizleme.uyarilar.some(function (u) { return /bağ kaldırılacak/.test(u); }), j(r.json.onizleme));
  r = await ist({ islem: "ice_aktar", veriler: { musteriler: [{ ad: "İç alan", siklik: { tur: "gunluk", siklikTuru: "x" } }], icerikler: [] }, onizleme: true });
  ok("ic ice bilinmeyen alan (siklik.siklikTuru) uyarisi", r.json.onizleme.uyarilar.some(function (u) { return /siklik\.siklikTuru/.test(u); }), j(r.json.onizleme.uyarilar));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Liste siklik", siklik: ["gunluk"] } });
  ok("liste bicimli siklik hata (sessizce bos sayilmaz)", r.status === 422 && /Yayın sıklığı biçimi hatalı/.test(r.json.mesaj), j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Geçmiş istisna", slotIstisna: { "2001-01-01": "post", "2099-01-01": "story" } } });
  ok("gecmis gun istisnalari budanir, gelecekteki kalir", r.status === 200 && j(r.json.kayit.slotIstisna) === '{"2099-01-01":"story"}', j(r.json));
  // tumunu degistir: onizlemeden sonra baska degisiklik olursa uygulanmaz
  var dOz = (await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedekB.veriler, onizleme: true })).json.onizleme;
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Önizleme sonrası" } });
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: yedekB.veriler, onay: "GERI YUKLE", beklenen: Object.assign({}, dOz.sayilar, { durum: dOz.durum }) });
  ok("tumunu degistir: onizlemeden sonra eklenen kayit varsa 409 onizleme_eski (silinmez)", r.status === 409 && r.json.hata === "onizleme_eski" &&
    (await ist({ islem: "veri" })).json.veri.musteriler.some(function (m) { return m.ad === "Önizleme sonrası"; }), j(r.json));

  /* ---- Tekrarlanan istek: yaniti kaybolan kaydetme yeniden gonderilince ikinci kayit olusmaz ---- */
  var tId = "a1b2c3d4e5f6a7b8c9d0e1f2", tVeri = { ad: "Tekrar örnek", ucret: 5000 };
  var t1 = await ist({ islem: "kaydet", tur: "musteri", id: tId, veri: tVeri });
  var t2 = await ist({ islem: "kaydet", tur: "musteri", id: tId, veri: tVeri });
  v = (await ist({ islem: "veri" })).json.veri;
  ok("yeni kayit istemci kimligiyle iki kez: ikisi de 200, ayni kayit ve surum, tek kayit (ayni_ad yok)", t1.status === 200 && t2.status === 200 &&
    t1.json.kayit.id === tId && t2.json.kayit.id === tId && t2.json.kayit.surum === t1.json.kayit.surum &&
    v.musteriler.filter(function (x) { return x.ad === "Tekrar örnek"; }).length === 1, j([t1.json, t2.json]));
  r = await ist({ islem: "kaydet", tur: "musteri", id: tId, veri: { ad: "Tekrar örnek", ucret: 6000 } });
  ok("ayni kimlik, farkli icerik: 409 + guncel kayit (sessizce ezilmez)", r.status === 409 && r.json.hata === "cakisma" && r.json.guncel.id === tId && r.json.guncel.ucret === 5000, j(r.json));
  var tGovde = { islem: "kaydet", tur: "musteri", id: tId, surum: t1.json.kayit.surum, veri: Object.assign({}, tVeri, { not: "tekrar notu" }) };
  var tg = (await ist(tGovde)).json.kayit;
  r = await ist(tGovde);
  ok("guncelleme tekrari (eski surum, ayni icerik): 200, guncel kayit doner, yeni surum yazilmaz", r.status === 200 && r.json.kayit.surum === tg.surum && r.json.kayit.not === "tekrar notu", j(r.json));
  var tIdler = ["b1b2c3d4e5f6a7b8c9d0e1f2", "b1b2c3d4e5f6a7b8c9d0e1f3", "b1b2c3d4e5f6a7b8c9d0e1f4"];
  var tToplu = { islem: "toplu", kayitlar: tIdler.map(function (id, i) {
    return { tur: "icerik", id: id, veri: { musteriId: tId, baslik: "Tekrar toplu " + i, durum: "hazir", gecmis: [{ z: "2030-01-01 10:00", m: "Stok girişiyle eklendi" }] } };
  }).concat([{ tur: "musteri", id: tId, surum: tg.surum, veri: Object.assign({}, tVeri, { not: "tekrar notu", stokGirisi: true }) }]) };
  var tt1 = await ist(tToplu), tt2 = await ist(tToplu);
  v = (await ist({ islem: "veri" })).json.veri;
  ok("toplu tekrari (3 yeni icerik + musteri guncellemesi): ikisi de 200, 6 degil 3 icerik", tt1.status === 200 && tt2.status === 200 &&
    j(tt2.json.kayitlar.map(function (x) { return x.id; })) === j(tIdler.concat([tId])) && tt2.json.kayitlar[3].surum === tt1.json.kayitlar[3].surum &&
    v.icerikler.filter(function (x) { return /^Tekrar toplu /.test(x.baslik); }).length === 3, j([tt1.json, tt2.json && tt2.json.hata]));
  tToplu.kayitlar[0].veri.gecmis[0].z = "2030-01-01 10:01";
  r = await ist(tToplu);
  v = (await ist({ islem: "veri" })).json.veri;
  ok("toplu tekrari farkli icerikle: 409 (sira + guncel), hicbir sey yazilmaz", r.status === 409 && r.json.sira === 0 && r.json.guncel.id === tIdler[0] &&
    v.icerikler.filter(function (x) { return /^Tekrar toplu /.test(x.baslik); }).length === 3 && v.icerikler.filter(function (x) { return x.id === tIdler[0]; })[0].gecmis[0].z === "2030-01-01 10:00", j(r.json));

  /* ---- Ayar: son JSON yedeginin indirildigi gun (istege bagli) ---- */
  var ayS = (await ist({ islem: "veri" })).json.veri.ayar;
  r = await ist({ islem: "kaydet", tur: "ayar", id: "ayar", surum: ayS.surum, veri: { varsayilanStokUyari: ayS.varsayilanStokUyari, sonYedek: "2030-01-15" } });
  ok("ayar: son yedek tarihi saklanir", r.status === 200 && r.json.kayit.sonYedek === "2030-01-15", j(r.json));
  r = await ist({ islem: "kaydet", tur: "ayar", id: "ayar", surum: r.json.kayit.surum, veri: { varsayilanStokUyari: 6 } });
  ok("ayar: son yedek gonderilmeden (eski arayuz) esik kaydedilince tarih korunur", r.status === 200 && r.json.kayit.varsayilanStokUyari === 6 && r.json.kayit.sonYedek === "2030-01-15", j(r.json));
  var ayS2 = r.json.kayit;
  r = await ist({ islem: "kaydet", tur: "ayar", id: "ayar", surum: ayS2.surum, veri: { varsayilanStokUyari: 6, sonYedek: "2030-02-30" } });
  ok("ayar: gecersiz son yedek tarihi 422 (Turkce mesaj)", r.status === 422 && /^Son yedek tarihi geçerli bir tarih olmalı/.test(r.json.mesaj), j(r.json));
  var ayYedek = (await ist({ islem: "disa_aktar" })).json.yedek;
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: ayYedek.veriler, onizleme: true });
  ok("yedekteki ayar.sonYedek taninir (bilinmeyen alan uyarisi yok)", ayYedek.veriler.ayar.sonYedek === "2030-01-15" && r.json.onizleme.ayar === true &&
    !r.json.onizleme.uyarilar.some(function (u) { return /sonYedek/.test(u); }), j(r.json.onizleme.uyarilar));
  r = await ist({ islem: "kaydet", tur: "ayar", id: "ayar", surum: ayS2.surum, veri: { varsayilanStokUyari: 6, sonYedek: null } });
  ok("ayar: son yedek acikca bosaltilabilir", r.status === 200 && r.json.kayit.sonYedek === null, j(r.json));

  /* ---- Geri yukleme onayi: Turkce harfli ve buyuk / kucuk harf farkli yazim ---- */
  var onayOz = (await ist({ islem: "ice_aktar", kip: "degistir", veriler: ayYedek.veriler, onizleme: true })).json.onizleme;
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: ayYedek.veriler, onay: "GERI", beklenen: Object.assign({}, onayOz.sayilar, { durum: onayOz.durum }) });
  var onayRed = r.status === 422 && r.json.hata === "onay";
  r = await ist({ islem: "ice_aktar", kip: "degistir", veriler: ayYedek.veriler, onay: "GERİ YÜKLE", beklenen: Object.assign({}, onayOz.sayilar, { durum: onayOz.durum }) });
  ok("tumunu degistir: 'GERİ YÜKLE' kabul, eksik onay ('GERI') ret", onayRed && r.status === 200, j(r.json));

  /* ---- Gunluk otomatik kopya: gunun ilk yazmasindan once; 14 gunluk, digerlerinden ayri sayilir ---- */
  function gunIsareti(deger) {
    if (deger !== undefined) dbPdo(ANA_DSN, ["UPDATE ayar SET deger = '" + deger + "' WHERE anahtar = 'gunluk_anlik'"]);
    return (JSON.parse(dbPdo(ANA_DSN, [], "SELECT deger FROM ayar WHERE anahtar = 'gunluk_anlik'"))[0] || [])[0];
  }
  async function kopyalar() { return (await ist({ islem: "anliklar" })).json.anliklar; }
  function gunlukler(l) { return l.filter(function (a) { return a.neden === "gunluk"; }); }
  var kOnce = await kopyalar();
  ok("gunluk kopya bugune isaretli; ayni gunun sonraki yazmalari yeni kopya almaz", [istanbulGunu(0), istanbulGunu(-1)].indexOf(gunIsareti()) !== -1 && gunlukler(kOnce).length === 1, j(kOnce.length));
  gunIsareti("2020-01-01");
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "" } });
  var kHata = await kopyalar();
  ok("gunun ilk yazmasi gecersizse (422) kopya ve gun isareti geri alinir", r.status === 422 && kHata.length === kOnce.length && gunIsareti() === "2020-01-01", j(r.json));
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Günlük örnek 0" } });
  var kIlk = await kopyalar();
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Günlük örnek 1" } });
  var kIkinci = await kopyalar();
  ok("yeni gunun ilk yazmasi kopya alir (ozet Turkce), ikinci yazma almaz", gunlukler(kIlk).length === 2 && kIlk[0].neden === "gunluk" &&
    /^\d+ müşteri, \d+ içerik, \d+ çekim \/ etkinlik$/.test(kIlk[0].ozet) && kIkinci.length === kIlk.length, j(kIlk.slice(0, 2)));
  gunIsareti("2020-01-02");
  await ist({ islem: "toplu", kayitlar: [{ tur: "musteri", veri: { ad: "Günlük örnek 2" } }] });
  ok("toplu yazma da gunun ilk kopyasini alir", gunlukler(await kopyalar()).length === 3);
  var digerSayi = kIlk.length - gunlukler(kIlk).length;
  for (i = 0; i < 14; i++) {
    gunIsareti("2020-02-" + String(i + 1).padStart(2, "0"));
    await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Günlük örnek " + (i + 3) } });
  }
  var kSon = await kopyalar();
  ok("gunluk kopyalardan en yeni 14'u kalir; ice aktarma / geri yukleme kopyalari itilmez", gunlukler(kSon).length === 14 &&
    kSon.length - gunlukler(kSon).length === digerSayi && digerSayi > 0 && !kSon.some(function (a) { return a.id === kIlk[0].id; }), j([kSon.length, digerSayi]));
  gunIsareti("2020-03-01");
  await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Günlük kopyadan sonra" } });
  var gunlukKopya = (await kopyalar())[0];
  r = await ist({ islem: "anlik_geri", id: gunlukKopya.id, onay: "GERI" });
  var anlikRed = r.status === 422;
  r = await ist({ islem: "anlik_geri", id: gunlukKopya.id, onay: "geri yükle" });
  v = (await ist({ islem: "veri" })).json.veri;
  ok("gunluk kopyaya donus ('geri yükle' kabul, 'GERI' ret): kopyadan sonraki kayit gider", anlikRed && r.status === 200 && gunlukKopya.neden === "gunluk" &&
    !v.musteriler.some(function (m) { return m.ad === "Günlük kopyadan sonra"; }) && v.musteriler.some(function (m) { return m.ad === "Günlük örnek 16"; }), j(r.json));
  var gm = v.musteriler.filter(function (m) { return m.ad === "Günlük örnek 16"; })[0];
  r = await ist({ islem: "kaydet", tur: "musteri", id: gm.id, surum: gm.surum, veri: Object.assign({}, gm, { not: "dönüş sonrası" }) });
  ok("gunluk kopyaya donusten sonra kayitlar duzenlenebilir (surum tutarli)", r.status === 200, j(r.json));

  /* ---- Eszamanli yazma ---- */
  var hedefM = (await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Eşzamanlı örnek" } })).json.kayit;
  var paralel = await Promise.all([0, 1, 2, 3, 4, 5].map(function (k) {
    return ist({ islem: "kaydet", tur: "musteri", id: hedefM.id, surum: hedefM.surum, veri: Object.assign({}, hedefM, { not: "p" + k }) });
  }));
  var pst = paralel.map(function (x) { return x.status; });
  ok("ayni kayda ayni surumla 6 paralel yazma: 1 basarili, 5 cakisma (sessiz ezme ve 500 yok)", pst.filter(function (x) { return x === 200; }).length === 1 &&
    pst.filter(function (x) { return x === 409; }).length === 5, j(pst));
  var yeniler = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(function (k) { return ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Paralel örnek " + k } }); }));
  ok("farkli kayitlara 8 paralel yazma: hepsi 200", yeniler.every(function (x) { return x.status === 200; }), j(yeniler.map(function (x) { return x.status + ":" + (x.json && x.json.hata); })));
  var surumler = yeniler.filter(function (x) { return x.status === 200; }).map(function (x) { return x.json.kayit.surum; });
  ok("paralel yazmalarda surum numaralari tekil", new Set(surumler).size === surumler.length, j(surumler));

  /* ---- Oturum suresi ---- */
  await ayarDegistir({ session_idle: 1 });
  await bekle(2200); // bosta kalma suresi saniye cozunurluguyle asilsin
  r = await ist({ islem: "veri" });
  ok("bosta kalma suresi asilinca oturum 401", r.status === 401);
  await ayarDegistir();
  await ist({ islem: "giris", sifre: SIFRE });

  /* ---- Sifre degistirme ---- */
  r = await ist({ islem: "sifre_degistir", eski: "yanlis-eski-sifre", yeni: "yeni-ornek-sifre-22" });
  ok("sifre degistir: eski yanlis 401", r.status === 401);
  r = await ist({ islem: "sifre_degistir", eski: SIFRE, yeni: "kisa" });
  ok("sifre degistir: kisa yeni 422", r.status === 422);
  var eskiCerez = cerez;
  var digerCerez = (await ist({ islem: "giris", sifre: SIFRE }, { cerez: "", cereziSakla: true })).setCookie.split(";")[0].slice("suflo_studio=".length);
  r = await ist({ islem: "sifre_degistir", eski: SIFRE, yeni: "yeni-ornek-sifre-22" });
  ok("sifre degisti: yeni cerez verildi", r.status === 200 && cerez && cerez !== eskiCerez);
  ok("sifre degisince diger oturumlar kapanir", (await ist({ islem: "veri" }, { cerez: digerCerez })).status === 401 && (await ist({ islem: "veri" }, { cerez: eskiCerez })).status === 401);
  ok("yeni cerez calisir", (await ist({ islem: "veri" })).status === 200);
  ok("eski sifreyle giris olmaz, yenisiyle olur", (await ist({ islem: "giris", sifre: SIFRE }, { cerez: "", cereziSakla: true })).status === 401 &&
    (await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" }, { cerez: "", cereziSakla: true })).status === 200);

  /* ---- Tum oturumlari kapat ---- */
  var eskiCihaz = cihazCerezi;
  r = await ist({ islem: "oturumlari_kapat" });
  ok("tum oturumlari kapat: bu cerez de gecersiz; bu cihaz yeni anahtarla taninmaya devam eder, eskisi unutulur", r.status === 200 && (await ist({ islem: "veri" })).status === 401 &&
    /^suflo_studio_cihaz=(?!deleted)/.test(r.cihazCookie || "") && cihazCerezi !== eskiCihaz, r.cihazCookie);
  cihazCerezi = eskiCihaz; // calinmis eski cihaz cerezi gibi
  // yeni cihaz cerezi icin bir kez dogru giris (basarili giris sayilmaz)
  r = await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" }, { cerez: "", cereziSakla: true });
  ok("yeni giriste yeni cihaz cerezi verilir (eskisi gecersiz)", r.status === 200 && !!cihazCerezi && cihazCerezi !== eskiCihaz);

  /* ---- Hatali giris kilidi ---- */
  var durumlar = [];
  for (i = 0; i < 5; i++) durumlar.push((await ist({ islem: "giris", sifre: "deneme-" + i })).status);
  r = await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" });
  // bu pencerede onceden 2 hatali giris var (ilk yanlis sifre + eski sifre denemesi): 3 denemede kilit
  // bu pencerede onceden 3 hatali deneme var (ilk yanlis sifre, yanlis eski sifre, eski sifreyle giris); basarili girisler sayilmaz
  ok("toplam 5 hatali denemede kilit; 6. deneme dogru sifreyle de 429", j(durumlar) === "[401,401,429,429,429]" && r.status === 429 && r.json.hata === "kilit", j(durumlar) + " " + r.status);


  r = await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" }, { cihaz: true, cerez: "", cereziSakla: true });
  ok("taninan cihaz IP kilidinden etkilenmez (sahibi kilitlenemez)", r.status === 200, j(r.json));
  var simdikiCihaz = cihazCerezi;
  cihazCerezi = eskiCihaz;
  r = await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" }, { cihaz: true, cerez: "", cereziSakla: true });
  ok("unutulan (eski) cihaz cerezi kilidi asamaz", r.status === 429, j(r.json));
  cihazCerezi = simdikiCihaz;
  var cd = [];
  for (i = 0; i < 6; i++) cd.push((await ist({ islem: "giris", sifre: "cihaz-deneme-" + i }, { cihaz: true, cerez: "", cereziSakla: true })).status);
  ok("taninan cihazin da kendi siniri var (5 yanlis, sonra 429)", j(cd) === "[401,401,401,401,401,429]", j(cd));
  var pl = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (k) { return ist({ islem: "giris", sifre: "paralel-yanlis-" + k }, { cerez: "", cereziSakla: true }); }));
  ok("10 paralel hatali giris: hepsi 401 / 429, 500 yok", pl.every(function (x) { return x.status === 401 || x.status === 429; }), j(pl.map(function (x) { return x.status; })));


  /* ---- Ayar dosyasi yokken bilinen Studio adresine CORS'lu kurulum hatasi ---- */
  fs.renameSync(path.join(PRIV, "config.php"), path.join(PRIV, "config.php.yok2"));
  r = await ist({ islem: "oturum" }, { baslik: { Origin: "https://suflo.app" } });
  var opt = await ham({ yontem: "OPTIONS", baslik: { Origin: "https://suflo.app", "Access-Control-Request-Method": "POST" } });
  ok("ayar yokken: arayuz 'kurulmadi'yi gorebilir (CORS'lu 503, OPTIONS 204)", r.status === 503 && r.headers["access-control-allow-origin"] === "https://suflo.app" && opt.status === 204, r.status + " " + opt.status);
  fs.renameSync(path.join(PRIV, "config.php.yok2"), path.join(PRIV, "config.php"));

  /* ---- Eski gelistirme semasi uzerine sessizce kurulmaz ---- */
  await ayarDegistir({ dsn: dbAc("eski", ["CREATE TABLE kayitlar (id TEXT)", "INSERT INTO kayitlar VALUES ('x')"]) });
  r = await ist({ islem: "oturum" });
  ok("eski sema (sema yok, kayit var): acik 503 kurulum mesaji", r.status === 503 && r.json.hata === "kurulum" && /uyumsuz/.test(r.json.mesaj), j(r.json));
  await ayarDegistir({ dsn: dbAc("eski2", ["CREATE TABLE ayar (anahtar VARCHAR(64) PRIMARY KEY, deger TEXT)", "INSERT INTO ayar VALUES ('sema', '2')"]) });
  r = await ist({ islem: "oturum" });
  ok("baska sema surumu (2): acik 503, uzerine kurulmaz", r.status === 503 && /uyumsuz/.test(r.json.mesaj), j(r.json));
  // Eski gelistirme surumu: kayitlar bos ama tablolar eski kolonlarla (girisler kim'siz). Benimsenmez.
  await ayarDegistir({ dsn: dbAc("eski3", ["CREATE TABLE kayitlar (id TEXT)", "CREATE TABLE girisler (ip TEXT, zaman INTEGER, basarili INTEGER)"]) });
  r = await ist({ islem: "oturum" });
  ok("eski gelistirme semasi (bos kayitlar, eski kolonlar): benimsenmez, 503 uyumsuz", r.status === 503 && /uyumsuz/.test(r.json.mesaj), j(r.json));
  // Ayni veritabaninda baska bir uygulamanin "ayar" tablosu (dolu, sema yok): uzerine kurulmaz
  await ayarDegistir({ dsn: dbAc("yabanci", ["CREATE TABLE ayar (anahtar VARCHAR(64) PRIMARY KEY, deger TEXT)", "INSERT INTO ayar VALUES ('tema', 'koyu')"]) });
  r = await ist({ islem: "oturum" });
  ok("dolu ama semasiz ayar tablosu: uzerine kurulmaz, 503 uyumsuz", r.status === 503 && /uyumsuz/.test(r.json.mesaj), j(r.json));
  // Bu surumun yarim kalmis kurulumu ("kuruluyor-3" isareti, bazi tablolar eksik): kaldigi yerden tamamlanir
  var yarimDsn = dbAc("yarim", ["CREATE TABLE ayar (anahtar VARCHAR(64) NOT NULL PRIMARY KEY, deger TEXT NOT NULL)", "INSERT INTO ayar VALUES ('sema', 'kuruluyor-3')",
    "CREATE TABLE oturumlar (ozet CHAR(64) NOT NULL PRIMARY KEY, olusturma BIGINT NOT NULL, son BIGINT NOT NULL)"]);
  await ayarDegistir({ dsn: yarimDsn, login_max_fail: 50 });
  r = await ist({ islem: "giris", sifre: SIFRE }, { cerez: "", cereziSakla: true });
  var yarimSema = dbPdo(yarimDsn, [], "SELECT deger FROM ayar WHERE anahtar = 'sema'");
  ok("isaretli yarim kurulum tamamlanir: giris calisir, sema 3 olur", r.status === 200 && yarimSema === '[["3"]]', r.status + " " + j(r.json) + " sema=" + yarimSema);
  // Yalniz bos ayar tablosu (MySQL'de isaret yazilmadan kesilen kurulum gibi): yeni kurulum yapilir
  await ayarDegistir({ dsn: dbAc("bosayar", ["CREATE TABLE ayar (anahtar VARCHAR(64) NOT NULL PRIMARY KEY, deger TEXT NOT NULL)"]) });
  r = await ist({ islem: "oturum" });
  ok("yalniz bos ayar tablosu: kurulum tamamlanir", r.status === 200 && r.json.ok === true, j(r.json));

  /* ---- Kurulum eksik ---- */
  // asil veritabanina don; kilit sinirini gevset ki sifirlama oncesi acik bir oturum alinabilsin
  await ayarDegistir({ login_max_fail: 50 });
  r = await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" }, { cerez: "", cereziSakla: true });
  ok("sifirlama oncesi acik oturum alindi", r.status === 200 && !!r.setCookie, r.status + " " + j(r.json));
  var sifirlamaOncesi = (r.setCookie || "").split(";")[0].slice("suflo_studio=".length);
  fs.renameSync(path.join(PRIV, "config.php"), path.join(PRIV, "config.php.yok"));
  r = await ist({ islem: "oturum" });
  ok("ayar dosyasi yoksa 503 kurulum (hicbir veri donmez)", r.status === 503 && r.json.hata === "kurulum" && !r.json.veri);
  // Sifre unutuldu: config.php'ye yeni ozet yazilinca o gecerli olur, panelden konan eski sifre gecmez
  var yeniOzet = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", "sifirlanan-ornek-sifre-3"], { encoding: "utf8" }).stdout;
  fs.unlinkSync(path.join(PRIV, "config.php.yok"));
  await ayarDegistir({ password_hash: yeniOzet, login_max_fail: 50 });
  r = await ist({ islem: "veri" }, { cerez: sifirlamaOncesi, cereziSakla: true });
  ok("config'te sifre degisince acik oturumlar kapanir (calinan oturum gecersiz)", r.status === 401, r.status);
  ok("sifre sifirlama: config'teki yeni ozet gecerli, panel sifresi gecmez",
    (await ist({ islem: "giris", sifre: "sifirlanan-ornek-sifre-3" }, { cerez: "", cereziSakla: true })).status === 200 &&
    (await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" }, { cerez: "", cereziSakla: true })).status === 401);
  await ayarDegistir({ password_hash: yeniOzet, login_max_fail: 50, cookie_secure: true });
  r = await ist({ islem: "giris", sifre: "sifirlanan-ornek-sifre-3" }, { cerez: "", cereziSakla: true });
  var hc = [].concat(r.headers["set-cookie"] || []);
  ok("guvenli kipte cerezler __Host- onekli, Secure, Path=/", r.status === 200 && hc.length === 2 && hc.every(function (c) { return /^__Host-suflo_studio(_cihaz)?=/.test(c) && /;\s*secure/i.test(c) && /path=\/(;|$)/i.test(c) && !/domain=/i.test(c); }), j(hc));

  /* ---- Kilit sirasinda yapilan denemeler kilidi uzatmaz ---- */
  await ayarDegistir({ password_hash: yeniOzet, login_max_fail: 2, login_window: 4 });
  await bekle(5100); // onceki testlerin hatali girisleri 4 sn'lik pencereden ciksin (saniye cozunurlugu: 5 sn)
  // Sure ilk hatali denemeden olculur: kilit ondan en az 4 sn surer (sunucu saniye cozunurlugu: 4-5 sn).
  // Yavas makinede iki hatali giris (her biri 0,4 sn bekleme + bcrypt) uzar; olcum ondan sonra baslarsa yagmurun sonu pencere disina tasar.
  var k1 = [], k1Bas = Date.now();
  for (i = 0; i < 2; i++) k1.push((await ist({ islem: "giris", sifre: "kisa-pencere-" + i }, { cerez: "", cereziSakla: true })).status);
  // kilit suresince deneme yagdir (ilk denemeden 3 sn sonrasina kadar); hepsi 429 olmali ve kaydedilmemeli
  var kiliTak = [];
  while (Date.now() - k1Bas < 3000) { kiliTak.push((await ist({ islem: "giris", sifre: "kilitte-" + kiliTak.length }, { cerez: "", cereziSakla: true })).status); await bekle(250); }
  // kilit en gec ilk denemeden 5 sn sonra biter; reddedilen denemeler sayilsaydi son denemeden en az 4 sn (> 6 sn) surerdi
  await bekle(Math.max(0, 6000 - (Date.now() - k1Bas)));
  r = await ist({ islem: "giris", sifre: "sifirlanan-ornek-sifre-3" }, { cerez: "", cereziSakla: true });
  ok("kilitteyken reddedilen denemeler kilidi uzatmaz: pencere bitince dogru sifre girer", j(k1) === "[401,401]" && kiliTak.length >= 3 && kiliTak.every(function (x) { return x === 429; }) && r.status === 200,
    j(k1) + " " + j(kiliTak) + " " + r.status);

  /* ---- config.php sifirlamasi biriken hatali denemeleri de siler (sahibi kendi denemeleriyle kilitlenmez) ---- */
  await ayarDegistir({ password_hash: yeniOzet, login_max_fail: 2, login_window: 900 });
  var sahipDenemeleri = [];
  for (i = 0; i < 3; i++) sahipDenemeleri.push((await ist({ islem: "giris", sifre: "hatirlanamayan-" + i }, { cerez: "", cereziSakla: true })).status);
  var ikinciOzet = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", "ikinci-sifirlama-sifre-4"], { encoding: "utf8" }).stdout;
  await ayarDegistir({ password_hash: ikinciOzet, login_max_fail: 2, login_window: 900 });
  r = await ist({ islem: "giris", sifre: "ikinci-sifirlama-sifre-4" }, { cerez: "", cereziSakla: true });
  // (onceki kilit testlerinin denemeleri de bu 900 sn'lik pencerede: ilk denemeler de 429 olabilir; onemli olan sifirlama aninda kilitli olmak)
  ok("sifirlama oncesi kilitlenen sahip, sifirlamadan hemen sonra girebilir", sahipDenemeleri[2] === 429 && r.status === 200, j(sahipDenemeleri) + " " + r.status);

  /* ---- Yaris: eski config'i okumus bir giris, bu arada yapilan sifirlama temizliginden sonra oturum acamaz ---- */
  var yavasOzet = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_BCRYPT, ['cost' => 15]);", "yavas-ornek-sifre-5"], { encoding: "utf8" }).stdout;
  await ayarDegistir({ password_hash: yavasOzet, login_max_fail: 50, login_window: 900 });
  var yarisGiris = ist({ islem: "giris", sifre: "yavas-ornek-sifre-5" }, { cerez: "", cereziSakla: true });
  await bekle(600);
  // yeni ozetle gelen bir istegin yapacagi temizlik: oturumlar silinir, parmak izi yeni ozete gecer
  dbPdo(ANA_DSN, ["DELETE FROM oturumlar", "UPDATE ayar SET deger = '" + require("crypto").createHash("sha256").update("iz|baska-ozet").digest("hex") + "' WHERE anahtar = 'sifre_izi'"]);
  r = await yarisGiris;
  ok("temizlik sirasinda dogrulanan eski sifreyle oturum acilmaz", r.status === 401 && !r.setCookie, r.status + " " + j(r.json));

  await ayarDegistir({ password_hash: "" });
  r = await ist({ islem: "oturum" });
  ok("sifre ozeti bos: kurulu degil, giris 503", r.status === 200 && r.json.kurulu === false && (await ist({ islem: "giris", sifre: "x" })).status === 503, j(r.json));
}

calis().catch(function (e) { ok("kosum hatasiz", false, e && e.stack ? e.stack : e); }).then(async function () {
  await durdur();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e3) {}
  acilanDblar.forEach(function (ad) { try { dbPdo("mysql:" + MY + ";charset=utf8mb4", ["DROP DATABASE IF EXISTS `" + ad + "`"]); } catch (e4) {} });
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
});
