/*
 * Suflo Studio ortak veri kitapligi (server/studio-v1/studio-ortak.php): panel (index.php) ve sohbet baglantisi (MCP) ayni
 * veri mantigini kullanir. Bu test kitapligi panel OLMADAN, bir islevin icinden yuklenmis halde dener:
 *  - ayar yukleme ve kurulum hatalari istisnadir (surec cikmaz); panelin yanitlayicisi kayitliyken once o cagrilir
 *  - kayit_kaydet: istemci kimligiyle tekrarlanabilir olusturma, surum denetimi, ayni ad, gecersiz veri, gunluk kopya
 *  - islem: yazma kilidi bastan (BEGIN IMMEDIATE), hata olursa geri alma; anlik kopya + cozum; kayit okuma
 *  - sahibin sifresi panelin kilidinden gecer (sahip_sifre_dene / sahip_sifre_izi), kilitte 429 istisnasi
 *  - dogrudan HTTP: STUDIO_ORTAK sabiti olmadan bos govdeli 403 (php -S .htaccess okumaz; .htaccess kaniti Apache testinde)
 *  - panel: kitaplik dosyasi eksikse 503 "kurulum" JSON'u (ham PHP hatasi degil)
 * Yalniz anonim ornek veri.
 */
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");
var http = require("http");
var net = require("net");

var ROOT = path.resolve(__dirname, "..");
var KITAPLIK = path.join(ROOT, "server", "studio-v1", "studio-ortak.php");
var gecen = 0, kalan = 0;
function ok(ad, kosul, ek) {
  if (kosul) { gecen++; console.log("PASS " + ad); }
  else { kalan++; console.log("FAIL " + ad + (ek !== undefined ? "   [" + String(typeof ek === "string" ? ek : JSON.stringify(ek)).slice(0, 900) + "]" : "")); }
}
function bitir() { console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti"); process.exit(kalan ? 1 : 0); }

/* ---- kaynak denetimleri (php gerekmez) ---- */
ok("studio-ortak.php var", fs.existsSync(KITAPLIK));
if (!fs.existsSync(KITAPLIK)) bitir();
var kaynak = fs.readFileSync(KITAPLIK, "utf8");
var kodu = kaynak.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
var ilkKod = kodu.split("\n").map(function (s) { return s.trim(); }).filter(function (s) { return s && s !== "<?php" && !/^declare\(/.test(s); });
ok("koruma ilk calisan satir: STUDIO_ORTAK tanimsizsa 403 ile cikar", /^if \(!defined\('STUDIO_ORTAK'\)\) \{$/.test(ilkKod[0] || "") &&
  /^http_response_code\(403\);$/.test(ilkKod[1] || "") && /^exit;$/.test(ilkKod[2] || ""), ilkKod.slice(0, 3));
ok("kitaplik HTTP yaniti yazmaz (hata / cevap / header / echo / setcookie yok)", !/\b(hata|cevap|basari|kurulum_hatasi)\(|\bheader\(|\becho\b|\bsetcookie\(|\bprint\b/.test(kodu));
ok("Pro lisans servisinden ayri; ortam degiskeni okunmaz", !/pro-v1|license|lisans|getenv\(/i.test(kodu));
ok("silme yalniz bakim satirlari (kayitlar tablosundan silme yok)", !/DELETE FROM kayitlar/.test(kodu));
var panel = fs.readFileSync(path.join(ROOT, "server", "studio-v1", "index.php"), "utf8");
ok("panel kitapligi STUDIO_ORTAK ile kendi klasorunden yukler ve hatalari kendi yanitina baglar",
  /define\('STUDIO_ORTAK', 1\);\s*require_once __DIR__ \. '\/studio-ortak\.php';\s*\n(\s*\/\/.*\n)*\s*studio_dur_ayarla\('hata'\);/.test(panel));
var ht = fs.readFileSync(path.join(ROOT, "server", "studio-v1", ".htaccess"), "utf8");
ok("v1/.htaccess studio-ortak.php'yi reddeder (FilesMatch)", /<FilesMatch "\(\^\([^)]*\bstudio-ortak\b[^)]*\)\\\.php\$/.test(ht), ht);

var phpVar = cp.spawnSync("php", ["-v"], { encoding: "utf8" });
if (phpVar.error || phpVar.status !== 0) { console.log("ATLA php bulunamadi: kitaplik testinin kalani calismadi"); bitir(); }
var l = cp.spawnSync("php", ["-l", KITAPLIK], { encoding: "utf8" });
ok("php -l studio-ortak.php", l.status === 0, l.stdout + l.stderr);
var sqliteVar = cp.spawnSync("php", ["-r", "echo in_array('sqlite', PDO::getAvailableDrivers()) ? 'var' : 'yok';"], { encoding: "utf8" });
if (sqliteVar.stdout !== "var") { console.log("ATLA php pdo_sqlite yok: kitaplik testinin kalani calismadi"); bitir(); }

var SIFRE = "ornek-ortak-sifre-1";
var ozet = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", SIFRE], { encoding: "utf8" }).stdout;
var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-studio-ortak-"));

/* ---- kitaplik olarak (CLI kosumu) ---- */
var k = cp.spawnSync("php", [path.join(__dirname, "fixtures", "studio-ortak", "kosum.php"), KITAPLIK, TMP, ozet], { encoding: "utf8", timeout: 60000 });
var S = null;
try { S = JSON.parse(k.stdout); } catch (e) { /* asagida */ }
ok("kosum PHP uyarisiz tamamlandi (JSON)", k.status === 0 && S !== null, (k.stdout || "") + (k.stderr || ""));
if (!S) { fs.rmSync(TMP, { recursive: true, force: true }); bitir(); }
function j(x) { return JSON.stringify(x); }

ok("ayar dosyasi yok / bozuk: StudioHatasi 503 kurulum (yol sizmaz)", !S.ayar_yok.tamam && S.ayar_yok.sinif === "StudioHatasi" && S.ayar_yok.http === 503 &&
  S.ayar_yok.kod === "kurulum" && S.ayar_yok.mesaj === "Sunucu ayar dosyası bulunamadı." && !S.ayar_bozuk.tamam && S.ayar_bozuk.mesaj === "Sunucu ayar dosyası okunamadı.", j([S.ayar_yok, S.ayar_bozuk]));
ok("ayar varsayilanlari panelle ayni ve kitaplik geneline islenir", S.ayar_varsayilan.login_max_fail === 8 && S.ayar_varsayilan.cookie_secure === true && S.ayar_varsayilan.global === 900, j(S.ayar_varsayilan));
ok("yanitlayici yokken bos dsn: istisna (surec cikmaz)", !S.dsn_bos.tamam && S.dsn_bos.http === 503 && S.dsn_bos.kod === "kurulum" && S.dsn_bos.yazma === "sunucu", j(S.dsn_bos));
ok("yanitlayici kayitliyken once o cagrilir; donerse yine istisna", j(S.isleyici_cagrisi) === j([[503, "kurulum"]]) && !S.dsn_bos_isleyici.tamam && S.dsn_bos_isleyici.sinif === "StudioHatasi", j([S.isleyici_cagrisi, S.dsn_bos_isleyici]));
ok("sema kitapliktan kurulur (surum 3)", S.sema === "3", S.sema);
ok("istemci kimligiyle tekrarlanan olusturma ikinci kayit acmaz (ayni surum doner); bos veritabaninda gunluk kopya yok, kayit varken alinir",
  S.idempotent.ilk === S.idempotent.tekrar && S.idempotent.id === "aaaaaaaabbbbbbbbcccccccc" && S.idempotent.sayi === 1 && S.idempotent.anlik_ilk === 0 && S.idempotent.anlik === 1, j(S.idempotent));
ok("ayni kimlik farkli icerik (surumsuz) sessizce ezilmez: cakisma + guncel kayit", !S.ayni_kimlik_farkli.tamam && S.ayni_kimlik_farkli.yazma === "cakisma" &&
  S.ayni_kimlik_farkli.guncel && S.ayni_kimlik_farkli.guncel.ad === "Ornek Musteri", j(S.ayni_kimlik_farkli));
ok("ayni ad + kurum (Turkce kucuk harf) baska kimlikle: ayni_ad", !S.ayni_ad.tamam && S.ayni_ad.yazma === "ayni_ad", j(S.ayni_ad));
ok("gunluk kopya: gunun ilk yazmasindan once bir kez (ikinci yazmada yok), gun isaretlenir", S.gunluk.gunluk_sayisi === S.gunluk.once + 1 && S.gunluk.isaret === true, j(S.gunluk));
ok("guncel surumle guncelleme yazar, surum artar", S.guncelle.yeni > S.guncelle.eski && S.guncelle.durum === "kurguda", j(S.guncelle));
ok("eski surumle guncelleme yazmaz: cakisma + guncel kayit (yeni surum, eski durum korunur)", !S.eski_surum.tamam && S.eski_surum.yazma === "cakisma" &&
  S.eski_surum.guncel.surum === S.guncelle.yeni && S.eski_surum.guncel.durum === "kurguda", j(S.eski_surum));
ok("surumle gelen olmayan kayit yeniden yaratilmaz: yok", !S.olmayan_surumlu.tamam && S.olmayan_surumlu.yazma === "yok", j(S.olmayan_surumlu));
ok("gecersiz veri: gecersiz (musteri yok, 30 Subat, bilinmeyen tur)", S.gecersiz.yazma === "gecersiz" && /Müşteri bulunamadı/.test(S.gecersiz.mesaj) &&
  S.gecersiz_tarih.yazma === "gecersiz" && /geçerli bir tarih/.test(S.gecersiz_tarih.mesaj) && S.bilinmeyen_tur.yazma === "gecersiz", j([S.gecersiz, S.gecersiz_tarih, S.bilinmeyen_tur]));
ok("kayit_oku: tur ve kimlik bicimi denetlenir; kayitlari_oku bilinmeyen turu reddeder", S.oku.icerik === "kurguda" && S.oku.tur_farkli === null && S.oku.bicimsiz === null &&
  S.oku.liste === 2 && !S.oku_bilinmeyen.tamam && S.oku_bilinmeyen.yazma === "gecersiz", j([S.oku, S.oku_bilinmeyen]));
ok("islem yazma kilidini bastan alir (ikinci baglanti BEGIN IMMEDIATE alamaz)", S.kilit === "kilitli", S.kilit);
ok("islem icinde hata: hicbir sey yazilmaz, surum sayaci da geri alinir", !S.geri_al.tamam && S.geri_al_sonra.kayit === null && S.geri_al_sonra.durum_ayni === true, j([S.geri_al, S.geri_al_sonra]));
ok("anlik kopya (mcp_toplu_oncesi) butun veriyi tasir ve cozulur", S.anlik.neden === "mcp_toplu_oncesi" && S.anlik.musteri === 1 && S.anlik.icerik === 2 && S.anlik.bloklar_var &&
  /^1 müşteri, 2 içerik/.test(S.anlik.ozet), j(S.anlik));
ok("sahip_sifre_izi = sifre_izi(gecerli ozet)", S.iz.iz && S.iz.iz === S.iz.beklenen && /^[0-9a-f]{64}$/.test(S.iz.iz), j(S.iz));
ok("sahip_sifre_dene dogru: durum + iz (ozetin kendisi donmez)", S.sifre_dogru.durum === "dogru" && S.sifre_dogru.iz === S.iz.beklenen && !/\$2y\$|argon/.test(j(S.sifre_dogru)), j(S.sifre_dogru));
ok("panelin kilidi: sinir asilinca kilitli (surec cikmaz), kilitteyken dogru sifre de denenmez", j(S.sifre_yanlis) === j(["yanlis", "yanlis", "kilitli"]) &&
  S.sifre_kilitte_dogru.durum === "kilitli" && S.sifre_kilitte_dogru.iz === null, j([S.sifre_yanlis, S.sifre_kilitte_dogru]));
ok("panelin sifre_dene kilitte StudioHatasi 429 kilit (panelde 429 yaniti)", !S.sifre_dene_panel_kilit.tamam && S.sifre_dene_panel_kilit.http === 429 && S.sifre_dene_panel_kilit.kod === "kilit", j(S.sifre_dene_panel_kilit));
ok("yalniz yanlis sifre denemeleri sayilir (kilide takilanlar sayilmaz)", S.giris_kaydi === 2, S.giris_kaydi);
ok("sifre ayarlanmamis: kurulmadi, iz null, deneme sayilmaz", S.kurulmadi.ilk.durum === "kurulmadi" && S.kurulmadi.dene.durum === "kurulmadi" && S.kurulmadi.dene.iz === null &&
  S.kurulmadi.iz === null && S.kurulmadi.giris_kaydi === 1, j(S.kurulmadi));
ok("sahip_sifre_dene panel gibi once sifre_izi_denetle: etkin ozet degisince eski hatali denemeler silinir", S.giris_kaydi === 2 && S.kurulmadi.temizlendi === 0, j(S.kurulmadi));

/* ---- dogrudan HTTP (php -S; .htaccess yok: yalniz kitapligin kendi korumasi) ---- */
function bosPort() { return new Promise(function (res) { var s = net.createServer(); s.listen(0, "127.0.0.1", function () { var p = s.address().port; s.close(function () { res(p); }); }); }); }
function istek(port, yol, govde) {
  return new Promise(function (res) {
    var bas = govde ? { "Content-Type": "application/json", "X-Studio": "1", Origin: "http://studio.ornek.test", "Content-Length": Buffer.byteLength(govde) } : {};
    var r = http.request({ host: "127.0.0.1", port: port, path: yol, method: govde ? "POST" : "GET", headers: bas }, function (y) {
      var p = []; y.on("data", function (c) { p.push(c); }); y.on("end", function () { res({ status: y.statusCode, metin: Buffer.concat(p).toString("utf8") }); });
    });
    r.on("error", function () { res({ status: 0, metin: "" }); });
    if (govde) r.write(govde);
    r.end();
  });
}
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  var PUB = path.join(TMP, "public_html"), PRIV = path.join(TMP, "private", "studio-v1");
  fs.mkdirSync(path.join(PUB, "studio", "v1"), { recursive: true });
  fs.mkdirSync(path.join(PUB, "studio", "eksik"), { recursive: true });
  fs.mkdirSync(PRIV, { recursive: true });
  fs.copyFileSync(KITAPLIK, path.join(PUB, "studio", "v1", "studio-ortak.php"));
  fs.copyFileSync(path.join(ROOT, "server", "studio-v1", "index.php"), path.join(PUB, "studio", "v1", "index.php"));
  fs.copyFileSync(path.join(ROOT, "server", "studio-v1", "index.php"), path.join(PUB, "studio", "eksik", "index.php"));   // kitapliksiz
  var dsn = "sqlite:" + path.join(PRIV, "web.sqlite").split("\\").join("/");
  fs.writeFileSync(path.join(PRIV, "config.php"), "<?php\nreturn ['password_hash' => " + JSON.stringify(ozet).replace(/\$/g, "\\$") + ", 'dsn' => " + JSON.stringify(dsn) +
    ", 'allowed_origins' => ['http://studio.ornek.test'], 'cookie_secure' => false];\n");
  var port = await bosPort();
  var php = cp.spawn("php", ["-S", "127.0.0.1:" + port, "-t", PUB], { stdio: ["ignore", "ignore", "pipe"] });
  php.stderr.on("data", function () {});
  var r;
  for (var i = 0; i < 80; i++) { r = await istek(port, "/yok"); if (r.status) break; await bekle(100); }
  try {
    r = await istek(port, "/studio/v1/studio-ortak.php");
    ok("dogrudan GET studio-ortak.php: 403, bos govde (koruma sabiti)", r.status === 403 && r.metin === "", [r.status, r.metin.slice(0, 200)]);
    r = await istek(port, "/studio/v1/studio-ortak.php", JSON.stringify({ islem: "veri" }));
    ok("dogrudan POST studio-ortak.php: 403, bos govde", r.status === 403 && r.metin === "", [r.status, r.metin.slice(0, 200)]);
    ok("dogrudan erisim veritabani acmaz", !fs.existsSync(path.join(PRIV, "web.sqlite")));
    r = await istek(port, "/studio/v1/index.php", JSON.stringify({ islem: "oturum" }));
    var jr = null; try { jr = JSON.parse(r.metin); } catch (e) { /* asagida */ }
    ok("panel kitaplikla calisir (oturum: 200, kurulu, girissiz)", r.status === 200 && jr && jr.ok === true && jr.kurulu === true && jr.girisli === false, [r.status, r.metin.slice(0, 300)]);
    r = await istek(port, "/studio/eksik/index.php", JSON.stringify({ islem: "oturum" }));
    jr = null; try { jr = JSON.parse(r.metin); } catch (e) { /* asagida */ }
    ok("kitaplik dosyasi eksikse panel 503 kurulum JSON'u verir (ham PHP hatasi / yol yok)", r.status === 503 && jr && jr.hata === "kurulum" && /studio-ortak\.php/.test(jr.mesaj) &&
      !/\/tmp|Fatal|Warning/.test(r.metin), [r.status, r.metin.slice(0, 300)]);
  } finally {
    php.kill();
    await bekle(100);
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  bitir();
})();
