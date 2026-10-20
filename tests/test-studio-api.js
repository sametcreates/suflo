/*
 * Suflo Studio sunucusu (server/studio-v1/index.php): gercek php -S + gecici SQLite. Yalniz anonim ornek veri.
 *  - Origin izin listesi, X-Studio basligi, JSON icerik turu (CSRF); GET 405; ayar yoksa 503
 *  - giris disindaki her islem oturumsuz / sahte cerezle 401; cerez HttpOnly + SameSite=Strict + yol; DB'de yalniz ozet
 *  - kaydet / toplu: beyaz liste, dogrulama, surum cakismasi 409, ayni ad 409, toplu hata tumunu geri alir, arsiv (silme yok)
 *  - sunucu yeniden baslayinca veri ve oturum kalir; cikis ve "tum oturumlari kapat" cerezi gecersiz kilar; bosta kalma suresi
 *  - ice aktarma: onizleme degistirmez, uygulama oncesi anlik kopya, ikinci kez aktarmada mukerrer yok, hatali dosya hic yazmaz
 *  - disa aktarma -> tum veriyi degistir (onayli) -> ayni veri; anlik kopyaya donus; sifre degistirme; hatali giris kilidi
 * php yoksa ATLA (CI'da php isi ayrica php -l calistirir).
 */
"use strict";
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), http = require("http"), net = require("net");
var ROOT = path.join(__dirname, "..");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 500) + "]" : "")); }
function j(x) { return JSON.stringify(x); }

var phpVar = cp.spawnSync("php", ["-v"], { encoding: "utf8" });
if (phpVar.error || phpVar.status !== 0) {
  console.log("ATLA php bulunamadi: Studio sunucu testi calismadi (CI php isi php -l ile sozdizimini denetler)");
  process.exit(0);
}
var sqliteVar = cp.spawnSync("php", ["-r", "echo in_array('sqlite', PDO::getAvailableDrivers()) ? 'var' : 'yok';"], { encoding: "utf8" });
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
    password_hash: ozet, dsn: "sqlite:" + path.join(PRIV, "studio.sqlite").split("\\").join("/"), db_user: "", db_pass: "",
    allowed_origins: [ORIGIN], login_max_fail: 5, login_window: 900, cookie_secure: false
  }, ek || {})) + ";\n");
}
ayarYaz();
// Calisan sunucuda ayar degisikligi: PHP opcache config.php'yi en cok 2 sn onbellekte tutar (revalidate_freq)
async function ayarDegistir(ek) { ayarYaz(ek); await bekle(3200); }

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
var cerez = "";
function ist(govde, ek) {
  ek = ek || {};
  var bas = { "Content-Type": "application/json", "Origin": ORIGIN, "X-Studio": "1" };
  if (ek.cerez !== undefined ? ek.cerez : cerez) bas.Cookie = "suflo_studio=" + (ek.cerez !== undefined ? ek.cerez : cerez);
  Object.assign(bas, ek.baslik || {});
  (ek.sil || []).forEach(function (k) { delete bas[k]; });
  return ham({ govde: govde, baslik: bas }).then(function (r) {
    var sc = [].concat(r.headers["set-cookie"] || []).filter(function (c) { return /^suflo_studio=/.test(c); })[0];
    r.setCookie = sc || null;
    if (sc && !ek.cereziSakla) cerez = sc.split(";")[0].split("=")[1] === "deleted" ? "" : sc.split(";")[0].slice("suflo_studio=".length);
    return r;
  });
}
function baslat() {
  return new Promise(function (res, rej) {
    phpSurec = cp.spawn("php", ["-S", "127.0.0.1:" + PORT, "-t", PUB], { stdio: ["ignore", "ignore", "pipe"] });
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

  /* ---- Giris ---- */
  r = await ist({ islem: "giris", sifre: "yanlis-sifre-0000" });
  ok("yanlis sifre: 401, cerez yok", r.status === 401 && r.json.hata === "sifre" && !r.setCookie);
  r = await ist({ islem: "giris", sifre: SIFRE });
  ok("dogru sifre: 200 + cerez", r.status === 200 && r.json.girisli === true && !!cerez, j(r.json));
  ok("cerez: HttpOnly, SameSite=Strict, Path=/studio/v1/, Max-Age", /HttpOnly/i.test(r.setCookie) && /SameSite=Strict/i.test(r.setCookie) &&
    /path=\/studio\/v1\//i.test(r.setCookie) && /Max-Age=\d+/i.test(r.setCookie), r.setCookie);
  var oturumCerezi = cerez;
  var dbHam = fs.readFileSync(path.join(PRIV, "studio.sqlite")).toString("latin1") + (fs.existsSync(path.join(PRIV, "studio.sqlite-wal")) ? fs.readFileSync(path.join(PRIV, "studio.sqlite-wal")).toString("latin1") : "");
  ok("veritabaninda oturum anahtarinin kendisi yok (yalniz ozeti)", dbHam.indexOf(oturumCerezi) === -1);
  r = await ist({ islem: "oturum" });
  ok("oturum: girisli", r.json.girisli === true);
  r = await ist({ islem: "veri" });
  ok("veri: bos baslar (ornek veri eklenmez)", r.status === 200 && r.json.veri.musteriler.length === 0 && r.json.veri.icerikler.length === 0 && r.json.veri.etkinlikler.length === 0, j(r.json));

  /* ---- Kaydet ---- */
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "  Örnek  Müşteri A ", kurum: "Örnek Kurum", ucret: 12000, siklik: { tur: "haftalik", haftalikAdet: 2, gunler: [4, 1, 4] },
    slotTuru: "video", stokGirisi: false, gizli: "<script>", id: "elle-id" } });
  var mA = r.json && r.json.kayit;
  ok("musteri eklendi: kirpilmis ad, gunler sirali tekil, beyaz liste disi alan yok", r.status === 200 && mA.ad === "Örnek  Müşteri A" && j(mA.siklik.gunler) === "[1,4]" &&
    mA.gizli === undefined && mA.surum === 1 && /^[a-f0-9]{24}$/.test(mA.id), j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "örnek  müşteri a", kurum: "ÖRNEK KURUM" } });
  ok("ayni ad + kurum (buyuk/kucuk harf farkli) ikinci kez eklenmez: 409", r.status === 409 && r.json.hata === "ayni_ad", j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek Müşteri B", ucret: null, siklik: { tur: "belirsiz" } } });
  var mB = r.json.kayit;
  ok("ucreti belirsiz musteri: ucret null (0 degil)", r.status === 200 && mB.ucret === null && mB.siklik.tur === "belirsiz", j(mB));
  var gecersizler = [
    [{ ad: "" }, "bos ad"], [{ ad: "X", ucret: -5 }, "negatif ucret"], [{ ad: "X", siklik: { tur: "ayda" } }, "siklik"],
    [{ ad: "X", siklik: { tur: "uc_gun", baslangic: "2030-02-30" } }, "tarih"], [{ ad: "X", siklik: { tur: "haftalik", gunler: [8] } }, "gun 8"], [{ ad: ["X"] }, "dizi ad"]
  ];
  var gs = [];
  for (i = 0; i < gecersizler.length; i++) gs.push((await ist({ islem: "kaydet", tur: "musteri", veri: gecersizler[i][0] })).status);
  ok("gecersiz musteri verileri 422", gs.every(function (s) { return s === 422; }), j(gs));
  r = await ist({ islem: "kaydet", tur: "kullanici", veri: { ad: "X" } });
  ok("bilinmeyen tur 422", r.status === 422);

  r = await ist({ islem: "kaydet", tur: "musteri", id: mA.id, surum: 1, veri: Object.assign({}, mA, { ucret: 13000 }) });
  ok("guncelleme: surum 2", r.status === 200 && r.json.kayit.surum === 2 && r.json.kayit.ucret === 13000, j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", id: mA.id, surum: 1, veri: Object.assign({}, mA, { ucret: 1 }) });
  ok("eski surumle yazma: 409 + guncel kayit (ikinci cihaz ustune yazamaz)", r.status === 409 && r.json.hata === "cakisma" && r.json.guncel.ucret === 13000 && r.json.guncel.surum === 2, j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", id: mA.id, veri: Object.assign({}, mA, { ucret: 1 }) });
  ok("surumsuz guncelleme de 409", r.status === 409);
  r = await ist({ islem: "kaydet", tur: "etkinlik", id: mA.id, surum: 2, veri: { baslik: "x", basTarih: "2030-03-04", tumGun: true } });
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
  ok("bulunamayan musteri adi onizlemede hata", r.status === 200 && r.json.onizleme.hataSayisi === 1 && /musteri bulunamadi/.test(r.json.onizleme.hatalar[0]), j(r.json));
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

  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek gün türlü", siklik: { tur: "haftalik", gunler: [2, 5], gunTurleri: { "5": "post", "3": "story", "2": "" } } } });
  ok("gune ozel tur: yalniz secili gunler saklanir, bos tur atlanir; nesne olarak doner", r.status === 200 && j(r.json.kayit.siklik.gunTurleri) === '{"5":"post"}', j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek gün türlü 2", siklik: { tur: "haftalik", gunler: [2] } } });
  ok("gune ozel tur yoksa bos nesne", r.status === 200 && j(r.json.kayit.siklik.gunTurleri) === "{}", j(r.json));
  r = await ist({ islem: "kaydet", tur: "musteri", veri: { ad: "Örnek gün türlü 3", siklik: { tur: "haftalik", gunler: [2], gunTurleri: { "2": "tiktok" } } } });
  ok("gecersiz gun turu 422", r.status === 422, j(r.json));

  /* ---- Oturum suresi ---- */
  await ayarDegistir({ session_idle: 1 });
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
  r = await ist({ islem: "oturumlari_kapat" });
  ok("tum oturumlari kapat: bu cerez de gecersiz", r.status === 200 && (await ist({ islem: "veri" })).status === 401);

  /* ---- Hatali giris kilidi ---- */
  var durumlar = [];
  for (i = 0; i < 5; i++) durumlar.push((await ist({ islem: "giris", sifre: "deneme-" + i })).status);
  r = await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" });
  // bu pencerede onceden 2 hatali giris var (ilk yanlis sifre + eski sifre denemesi): 3 denemede kilit
  ok("toplam 5 hatali denemede kilit; sonra dogru sifre de 429", j(durumlar) === "[401,401,401,429,429]" && r.status === 429 && r.json.hata === "kilit", j(durumlar) + " " + r.status);

  /* ---- Kurulum eksik ---- */
  fs.renameSync(path.join(PRIV, "config.php"), path.join(PRIV, "config.php.yok"));
  r = await ist({ islem: "oturum" });
  ok("ayar dosyasi yoksa 503 kurulum (hicbir veri donmez)", r.status === 503 && r.json.hata === "kurulum" && !r.json.veri);
  // Sifre unutuldu: config.php'ye yeni ozet yazilinca o gecerli olur, panelden konan eski sifre gecmez
  var yeniOzet = cp.spawnSync("php", ["-r", "echo password_hash($argv[1], PASSWORD_DEFAULT);", "sifirlanan-ornek-sifre-3"], { encoding: "utf8" }).stdout;
  fs.unlinkSync(path.join(PRIV, "config.php.yok"));
  await ayarDegistir({ password_hash: yeniOzet, login_max_fail: 50 });
  ok("sifre sifirlama: config'teki yeni ozet gecerli, panel sifresi gecmez",
    (await ist({ islem: "giris", sifre: "sifirlanan-ornek-sifre-3" }, { cerez: "", cereziSakla: true })).status === 200 &&
    (await ist({ islem: "giris", sifre: "yeni-ornek-sifre-22" }, { cerez: "", cereziSakla: true })).status === 401);
  await ayarDegistir({ password_hash: "" });
  r = await ist({ islem: "oturum" });
  ok("sifre ozeti bos: kurulu degil, giris 503", r.status === 200 && r.json.kurulu === false && (await ist({ islem: "giris", sifre: "x" })).status === 503, j(r.json));
}

calis().catch(function (e) { ok("kosum hatasiz", false, e && e.stack ? e.stack : e); }).then(async function () {
  await durdur();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e3) {}
  console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
  process.exit(kalan ? 1 : 0);
});
