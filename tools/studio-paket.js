#!/usr/bin/env node
/*
 * Suflo Studio sunucu paketleri (Hostinger). Repodan iki ZIP uretir; ZIP'ler REPO DISINA yazilir (repoya girmez):
 *
 *   node tools/studio-paket.js paket --cikis <klasor>
 *       suflo-studio-test-paket.zip   public_html'e acilir: studio-test/...  + .well-known/.htaccess
 *       suflo-studio-canli-paket.zip  public_html'e acilir: studio/...       + .well-known/.htaccess
 *       well-known.htaccess           (.well-known klasorunde zaten bir .htaccess varsa satirlari elle eklemek icin)
 *       SHA256SUMS.txt                ZIP'lerin ozetleri ve icerik listesi
 *
 *   node tools/studio-paket.js ayar --cikis <klasor> [--kok-url https://assets.suflo.app]
 *       TEST ortami icin ornek ayar: <klasor>/config.php (yalniz bcrypt maliyet 12 ozeti) ve
 *       <klasor>/test-sifre.txt (yeni rastgele duz sifre). Sifre ekrana YAZILMAZ. Var olan dosyanin uzerine yazmaz.
 *
 *   node tools/studio-paket.js denetle <zip> [<zip> ...]
 *       Var olan bir paketi yeniden denetler.
 *
 * Paket duzeni (<u> = uygulama klasoru: studio-test ya da studio). Ayar ve veri yolu klasor adindan cikar:
 * public_html/<u>/ -> private/<u>-v1/config.php (canli: private/studio-v1, test: private/studio-test-v1).
 *
 * Paket denetimi (biri bile tutarsa paket YAZILMAZ / komut hata verir):
 *  - Icerik listesi beklenen listeyle birebir ayni olmali (fazla ya da eksik dosya yok).
 *  - Yasak adlar: config.php (ve config.*.php), sifre-ozeti.php, *.sqlite*, *.db, *.json, *.csv, *.zip, *.log, *.bak,
 *    .env, *.pem, *.key, *.p12, arka-sahte*, private/, ".." ya da mutlak yol.
 *  - Yasak icerik: sifre ozeti (bcrypt / argon2), ozel anahtar, SQLite dosyasi, dolu password_hash / db_pass satiri.
 *  - Yalniz git'te izlenen dosyalar paketlenir (yerelde duran izlenmeyen dosya pakete giremez).
 * Bagimlilik yok (yalniz Node; ZIP yazici asagida).
 */
"use strict";
var fs = require("fs"), path = require("path"), zlib = require("zlib"), crypto = require("crypto"), cp = require("child_process");

var ROOT = path.resolve(__dirname, "..");
var STUDIO = "server/studio-v1";
var TEST_UYG = "studio-test", CANLI_UYG = "studio";
var ZIP_AD = { "studio-test": "suflo-studio-test-paket.zip", "studio": "suflo-studio-canli-paket.zip" };
var MCP_KITAPLIK = ["ortak.php", "depo.php", "arka.php", "araclar.php", "oauth.php", "tasima.php", "kesif.php", "yukle.php", "arka-studio.php", ".htaccess"];

/** Paket esleme listesi: [repo yolu (kok'e gore), zip yolu]. <u> uygulama klasoruyle degisir. */
function eslemeler(u) {
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(u)) throw new Error("uygulama klasoru adi gecersiz: " + u);
  var L = [];
  ["index.html", "studio.css", "studio-core.js", "studio.js", "favicon.svg"].forEach(function (f) { L.push([STUDIO + "/arayuz/" + f, u + "/" + f]); });
  L.push([STUDIO + "/mcp/studio.htaccess", u + "/.htaccess"]);   // arayuz.htaccess'in butun kurallari + MCP kurallari
  L.push([STUDIO + "/index.php", u + "/v1/index.php"]);
  L.push([STUDIO + "/studio-ortak.php", u + "/v1/studio-ortak.php"]);
  L.push([STUDIO + "/.htaccess", u + "/v1/.htaccess"]);
  ["mcp-giris.php", "oauth-giris.php", "kesif-giris.php", "mcp-onay.js", "mcp-onay.css"].forEach(function (f) { L.push([STUDIO + "/mcp/" + f, u + "/" + f]); });
  MCP_KITAPLIK.forEach(function (f) { L.push([STUDIO + "/mcp/mcp-kitaplik/" + f, u + "/mcp-kitaplik/" + f]); });
  L.push([STUDIO + "/mcp/well-known.htaccess", ".well-known/.htaccess"]);   // yalniz tam kesif adlari (studio, studio-test); acme'ye dokunmaz
  return L;
}

/* ---------------- Denetim ---------------- */

var YASAK_AD = [
  [/(^|\/)config(\.[^/]*)?\.php$/i, "config.php (ayar dosyasi pakete girmez)"],
  [/(^|\/)sifre-ozeti\.php$/i, "sifre-ozeti.php (yalniz komut satiri araci)"],
  [/\.(sqlite|sqlite3|db|sqlite-wal|sqlite-shm|db-wal|db-shm)$/i, "veritabani dosyasi"],
  [/\.(json|csv)$/i, "veri / yedek dosyasi"],
  [/\.(zip|log|bak|old|orig|swp|tmp)$/i, "arsiv / gunluk / yedek dosyasi"],
  [/(^|\/)\.env(\.|$)/i, ".env dosyasi"],
  [/\.(pem|key|p12|pfx|crt)$/i, "anahtar / sertifika"],
  [/(^|\/)arka-sahte[^/]*$/i, "test arka ucu"],
  [/(^|\/)private(\/|$)/i, "private klasoru"],
  [/(^|\/)\.git(\/|$)/i, ".git"],
  [/(^|\/)(node_modules|tests?)(\/|$)/i, "gelistirme klasoru"],
  [/\.md$/i, "belge (public_html'e konmaz)"]
];
var YASAK_ICERIK = [
  [/\$2[abxy]\$\d\d\$[.\/A-Za-z0-9]{53}/, "bcrypt sifre ozeti"],
  [/\$argon2(id|i|d)\$/, "argon2 sifre ozeti"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "ozel anahtar"],
  [/^SQLite format 3\0/, "SQLite veritabani"],
  [/['"](password_hash|db_pass)['"]\s*=>\s*['"][^'"]+['"]/, "dolu password_hash / db_pass ayari"],
  [/\bsk-(ant|proj|live)-[A-Za-z0-9_-]{16,}/, "API anahtari"]
];
/** Bir dosya adi + icerigi icin sorun listesi (bos: temiz). */
function dosyaSorunlari(ad, veri) {
  var s = [];
  if (!ad || /^\//.test(ad) || /^[A-Za-z]:/.test(ad) || /\\/.test(ad) || ad.split("/").indexOf("..") !== -1 || ad.split("/").indexOf(".") !== -1) s.push(ad + ": gecersiz yol");
  YASAK_AD.forEach(function (y) { if (y[0].test(ad)) s.push(ad + ": yasak dosya (" + y[1] + ")"); });
  var metin = Buffer.isBuffer(veri) ? veri.toString("latin1") : String(veri || "");
  YASAK_ICERIK.forEach(function (y) { if (y[0].test(metin)) s.push(ad + ": yasak icerik (" + y[1] + ")"); });
  return s;
}
/** girdiler: [{ad, veri}], u: uygulama klasoru. Doner: sorun listesi (bos: temiz). */
function denetle(girdiler, u) {
  var s = [];
  var beklenen = eslemeler(u).map(function (e) { return e[1]; }).sort();
  var adlar = girdiler.map(function (g) { return g.ad; });
  var tekrar = adlar.filter(function (a, i) { return adlar.indexOf(a) !== i; });
  if (tekrar.length) s.push("tekrarlanan dosya: " + tekrar.join(", "));
  var var_ = adlar.slice().sort();
  var_.forEach(function (a) { if (beklenen.indexOf(a) === -1) s.push(a + ": beklenmeyen dosya"); });
  beklenen.forEach(function (a) { if (var_.indexOf(a) === -1) s.push(a + ": eksik dosya"); });
  girdiler.forEach(function (g) { s = s.concat(dosyaSorunlari(g.ad, g.veri)); });
  // Ozel kural: kitaplik klasoru disariya kapali kalmali; v1/.htaccess config / sqlite / kitapligi reddetmeli
  var bul = function (a) { var g = girdiler.filter(function (x) { return x.ad === a; })[0]; return g ? String(g.veri) : ""; };
  if (!/Require all denied/.test(bul(u + "/mcp-kitaplik/.htaccess"))) s.push(u + "/mcp-kitaplik/.htaccess: 'Require all denied' yok");
  if (!/studio-ortak/.test(bul(u + "/v1/.htaccess")) || !/sqlite/.test(bul(u + "/v1/.htaccess"))) s.push(u + "/v1/.htaccess: kitaplik / sqlite reddi yok");
  if (/acme-challenge/.test(bul(".well-known/.htaccess").replace(/^#.*$/mg, ""))) s.push(".well-known/.htaccess: acme-challenge'a dokunan kural var");
  return s;
}

/* ---------------- ZIP (yazma / okuma; yalniz deflate ve stored) ---------------- */

function dosDate(d) {
  return { saat: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    tarih: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
/** girdiler: [{ad, veri(Buffer)}] -> ZIP Buffer. Sabit tarih (tekrar uretilebilir paket). */
function zipYaz(girdiler, tarih) {
  var t = dosDate(tarih || new Date(2026, 0, 1, 12, 0, 0));
  var yerel = [], merkez = [], konum = 0;
  girdiler.forEach(function (g) {
    var ad = Buffer.from(g.ad, "utf8"), veri = Buffer.isBuffer(g.veri) ? g.veri : Buffer.from(g.veri);
    var sik = zlib.deflateRawSync(veri, { level: 9 });
    var yontem = sik.length < veri.length ? 8 : 0, govde = yontem ? sik : veri, crc = zlib.crc32(veri) >>> 0;
    var h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(yontem, 8);
    h.writeUInt16LE(t.saat, 10); h.writeUInt16LE(t.tarih, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(govde.length, 18); h.writeUInt32LE(veri.length, 22); h.writeUInt16LE(ad.length, 26); h.writeUInt16LE(0, 28);
    var c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE((3 << 8) | 20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(yontem, 10); c.writeUInt16LE(t.saat, 12); c.writeUInt16LE(t.tarih, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(govde.length, 20); c.writeUInt32LE(veri.length, 24); c.writeUInt16LE(ad.length, 28);
    c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36);
    c.writeUInt32LE(((0o100644) << 16) >>> 0, 38); c.writeUInt32LE(konum, 42);
    yerel.push(h, ad, govde);
    merkez.push(c, ad);
    konum += h.length + ad.length + govde.length;
  });
  var mBuf = Buffer.concat(merkez), son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(0, 4); son.writeUInt16LE(0, 6);
  son.writeUInt16LE(girdiler.length, 8); son.writeUInt16LE(girdiler.length, 10);
  son.writeUInt32LE(mBuf.length, 12); son.writeUInt32LE(konum, 16); son.writeUInt16LE(0, 20);
  return Buffer.concat(yerel.concat([mBuf, son]));
}
/** ZIP Buffer -> [{ad, veri}] (merkez dizinden; CRC denetlenir). */
function zipOku(buf) {
  var e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("ZIP sonu bulunamadi");
  var n = buf.readUInt16LE(e + 10), p = buf.readUInt32LE(e + 16), L = [];
  for (var i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("ZIP merkez dizini bozuk");
    var yontem = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), sb = buf.readUInt32LE(p + 20);
    var al = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), kl = buf.readUInt16LE(p + 32), yk = buf.readUInt32LE(p + 42);
    var ad = buf.toString("utf8", p + 46, p + 46 + al);
    var yal = buf.readUInt16LE(yk + 26), yel = buf.readUInt16LE(yk + 28), bas = yk + 30 + yal + yel;
    var govde = buf.subarray(bas, bas + sb);
    var veri = yontem === 8 ? zlib.inflateRawSync(govde) : yontem === 0 ? Buffer.from(govde) : null;
    if (!veri) throw new Error(ad + ": desteklenmeyen sikistirma");
    if ((zlib.crc32(veri) >>> 0) !== crc) throw new Error(ad + ": CRC uyusmuyor");
    L.push({ ad: ad, veri: veri });
    p += 46 + al + el + kl;
  }
  return L;
}

/* ---------------- Paket ---------------- */

function git(args) {
  var r = cp.spawnSync("git", ["-C", ROOT].concat(args), { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error("git calismadi: " + (r.stderr || r.error));
  return r.stdout;
}
function repoIcindeMi(d) {
  var a = path.resolve(d), k = ROOT;
  try { a = fs.realpathSync(a); } catch (e) { /* henuz yok: ust klasorle denetlenir */
    try { a = path.join(fs.realpathSync(path.dirname(a)), path.basename(a)); } catch (e2) {}
  }
  try { k = fs.realpathSync(ROOT); } catch (e) {}
  return a === k || a.indexOf(k + path.sep) === 0;
}
/** Bir uygulama klasoru icin paket girdileri (repodan; yalniz git'te izlenen dosyalar). */
function girdiler(u, izlenen) {
  izlenen = izlenen || git(["ls-files", "--", STUDIO]).split("\n").filter(Boolean);
  return eslemeler(u).map(function (e) {
    if (izlenen.indexOf(e[0]) === -1) throw new Error(e[0] + ": git'te izlenmiyor (paketlenmez)");
    return { ad: e[1], veri: fs.readFileSync(path.join(ROOT, e[0])) };
  });
}
function paketYap(cikis) {
  if (!cikis) throw new Error("--cikis <klasor> gerekli");
  if (repoIcindeMi(cikis)) throw new Error("cikis klasoru repo DISINDA olmali (ZIP'ler repoya girmez): " + cikis);
  fs.mkdirSync(cikis, { recursive: true });
  var kirli = git(["status", "--porcelain", "--", STUDIO]).replace(/\s+$/, "");
  if (kirli) console.log("UYARI: " + STUDIO + " altinda kaydedilmemis degisiklik var; paket calisma kopyasindan uretildi:\n" + kirli);
  var izlenen = git(["ls-files", "--", STUDIO]).split("\n").filter(Boolean);
  var surum = git(["rev-parse", "--short", "HEAD"]).trim();
  var ozet = ["Suflo Studio sunucu paketleri (commit " + surum + (kirli ? ", kaydedilmemis degisiklikle" : "") + ")", ""];
  var sonuc = {};
  [TEST_UYG, CANLI_UYG].forEach(function (u) {
    var G = girdiler(u, izlenen), sorun = denetle(G, u);
    if (sorun.length) throw new Error(u + " paketi denetimden gecmedi:\n  " + sorun.join("\n  "));
    var zip = zipYaz(G), dosya = path.join(cikis, ZIP_AD[u]);
    // Yazilan ZIP geri okunup yeniden denetlenir (yazicidaki bir hata da yakalanir)
    var geri = zipOku(zip), sorun2 = denetle(geri, u);
    if (sorun2.length) throw new Error(u + " ZIP'i geri okumada denetimden gecmedi:\n  " + sorun2.join("\n  "));
    fs.writeFileSync(dosya, zip);
    var h = crypto.createHash("sha256").update(zip).digest("hex");
    ozet.push(h + "  " + ZIP_AD[u]);
    G.forEach(function (g) { ozet.push("    " + g.ad + "  (" + g.veri.length + " bayt)"); });
    ozet.push("");
    sonuc[u] = { dosya: dosya, sha256: h, adet: G.length };
  });
  fs.writeFileSync(path.join(cikis, "well-known.htaccess"), fs.readFileSync(path.join(ROOT, STUDIO, "mcp", "well-known.htaccess")));
  fs.writeFileSync(path.join(cikis, "SHA256SUMS.txt"), ozet.join("\n"));
  return sonuc;
}
function zipDenetle(dosya) {
  var ad = path.basename(dosya), u = ad === ZIP_AD[TEST_UYG] ? TEST_UYG : ad === ZIP_AD[CANLI_UYG] ? CANLI_UYG : null;
  var G = zipOku(fs.readFileSync(dosya));
  if (!u) {   // ad bilinmiyorsa klasorden cikar
    var k = G.map(function (g) { return g.ad.split("/")[0]; }).filter(function (x) { return x !== ".well-known"; })[0];
    u = k || "";
  }
  return denetle(G, u);
}

/* ---------------- Test ayari ---------------- */

function phpDize(s) { return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; }
/** Yeni rastgele sifre (yalniz harf ve rakam, 24 karakter; karisan 0/O/1/l/I yok). */
function rastgeleSifre() {
  var abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", s = "";
  while (s.length < 24) { var b = crypto.randomBytes(1)[0]; if (b < 256 - (256 % abc.length)) s += abc[b % abc.length]; }
  return s;
}
function bcrypt12(sifre) {
  // Sifre komut satirina degil stdin'e verilir (surec listesinde gorunmez)
  var r = cp.spawnSync("php", ["-r", "$s = stream_get_contents(STDIN); $h = password_hash($s, PASSWORD_BCRYPT, ['cost' => 12]);" +
    "echo (password_verify($s, $h) && password_get_info($h)['options']['cost'] === 12) ? $h : '';"], { input: sifre, encoding: "utf8" });
  var h = (r.stdout || "").trim();
  if (r.error || r.status !== 0 || !/^\$2y\$12\$[.\/A-Za-z0-9]{53}$/.test(h)) throw new Error("php ile bcrypt ozeti uretilemedi");
  return h;
}
function ayarMetni(ozet, kokUrl) {
  return [
    "<?php",
    "/*",
    " * Suflo Studio TEST ortami ayari. Yer: <public_html'in ust klasoru>/private/studio-test-v1/config.php",
    " * public_html icine, GitHub'a, sohbete ya da e-postaya KOYMA. Duz sifre burada yok; yalniz ozeti (bcrypt, maliyet 12).",
    " * Veritabani bu klasordeki ayri SQLite dosyasidir (canli Studio verisinden tamamen ayri).",
    " * MCP'yi aninda kapatmak icin: 'mcp_acik' => false",
    " */",
    "return [",
    "    'password_hash' => " + phpDize(ozet) + ",",
    "    'dsn' => 'sqlite:' . __DIR__ . '/studio.sqlite',",
    "    'db_user' => '',",
    "    'db_pass' => '',",
    "    'allowed_origins' => ['https://assets.suflo.app'],",
    "    'session_idle' => 14 * 24 * 3600,",
    "    'session_max' => 60 * 24 * 3600,",
    "    'login_max_fail' => 8,",
    "    'login_window' => 900,",
    "    'mcp_acik' => true,",
    "    'kok_url' => " + phpDize(kokUrl) + ",",
    "];",
    ""
  ].join("\n");
}
function ayarYap(cikis, kokUrl) {
  if (!cikis) throw new Error("--cikis <klasor> gerekli");
  kokUrl = kokUrl || "https://assets.suflo.app";
  if (!/^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(kokUrl)) throw new Error("kok-url https://alan.adi biciminde olmali");
  if (repoIcindeMi(cikis)) throw new Error("ayar klasoru repo DISINDA olmali: " + cikis);
  var cfg = path.join(cikis, "config.php"), txt = path.join(cikis, "test-sifre.txt");
  if (fs.existsSync(cfg) || fs.existsSync(txt)) throw new Error("ayar ya da sifre dosyasi zaten var; uzerine yazilmadi: " + cikis);
  fs.mkdirSync(cikis, { recursive: true, mode: 0o700 });
  var sifre = rastgeleSifre(), ozet = bcrypt12(sifre);
  var metin = ayarMetni(ozet, kokUrl);
  fs.writeFileSync(cfg, metin, { mode: 0o600, flag: "wx" });
  fs.writeFileSync(txt, sifre + "\n", { mode: 0o600, flag: "wx" });
  var k = cp.spawnSync("php", ["-r", "$c = require $argv[1]; $s = trim(stream_get_contents(STDIN));" +
    "echo (is_array($c) && password_verify($s, $c['password_hash']) && $c['mcp_acik'] === true && $c['kok_url'] === $argv[2]" +
    " && $c['allowed_origins'] === ['https://assets.suflo.app'] && strpos($c['dsn'], 'sqlite:' . dirname($argv[1]) . '/') === 0) ? 'tamam' : 'hata';",
    cfg, kokUrl], { input: sifre, encoding: "utf8" });
  // Uretilen dosya PHP olarak gecerli ve sifre ozetle dogrulaniyor mu
  if (k.stdout !== "tamam") {
    try { fs.unlinkSync(cfg); fs.unlinkSync(txt); } catch (e) {}
    throw new Error("uretilen ayar dosyasi dogrulanamadi (dosyalar silindi)");
  }
  return { config: cfg, sifre: txt };
}

/* ---------------- Komut satiri ---------------- */

function arg(ad) { var i = process.argv.indexOf(ad); return i === -1 ? null : process.argv[i + 1]; }
if (require.main === module) {
  var komut = process.argv[2];
  try {
    if (komut === "paket") {
      var s = paketYap(arg("--cikis"));
      Object.keys(s).forEach(function (u) { console.log("TAMAM " + s[u].dosya + "  (" + s[u].adet + " dosya, sha256 " + s[u].sha256.slice(0, 16) + "…)"); });
      console.log("Denetim: config.php / sqlite / sir yok, icerik listesi beklenenle ayni.");
    } else if (komut === "ayar") {
      var a = ayarYap(arg("--cikis"), arg("--kok-url"));
      console.log("TAMAM ayar: " + a.config + "\n      sifre: " + a.sifre + " (ekrana yazilmadi)");
    } else if (komut === "denetle") {
      var dosyalar = process.argv.slice(3), hata = 0;
      if (!dosyalar.length) throw new Error("denetlenecek ZIP verilmedi");
      dosyalar.forEach(function (f) {
        var s2 = zipDenetle(f);
        if (s2.length) { hata++; console.log("HATA " + f + "\n  " + s2.join("\n  ")); } else console.log("TEMIZ " + f);
      });
      process.exit(hata ? 1 : 0);
    } else {
      console.log("Kullanim:\n  node tools/studio-paket.js paket --cikis <klasor>\n  node tools/studio-paket.js ayar --cikis <klasor> [--kok-url https://assets.suflo.app]\n  node tools/studio-paket.js denetle <zip>...");
      process.exit(2);
    }
  } catch (e) {
    console.error("HATA: " + (e && e.message || e));
    process.exit(1);
  }
}

module.exports = { eslemeler: eslemeler, denetle: denetle, dosyaSorunlari: dosyaSorunlari, zipYaz: zipYaz, zipOku: zipOku,
  girdiler: girdiler, paketYap: paketYap, zipDenetle: zipDenetle, ayarYap: ayarYap, ayarMetni: ayarMetni, ZIP_AD: ZIP_AD, ROOT: ROOT };
