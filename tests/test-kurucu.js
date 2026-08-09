var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * Kurulum ZIP'i macOS'ta GERÇEKTEN kullanılabilir mi?
 *
 * Bu test gerçek bir kullanıcı şikâyetinden doğdu: Mac'te kurmaya çalışanlar
 * "erişim ayrıcalıklarına sahip olmadığınız için açılamadı" hatası aldı.
 * İki ayrı sebep vardı, ikisi de Windows'ta üretilen ZIP'ten kaynaklanıyordu:
 *
 *   1) PowerShell'in Compress-Archive'ı Unix mod bitlerini hiç yazmıyor
 *      (external file attributes = 0), dolayısıyla .command çalıştırılamaz
 *      halde açılıyor ve çift tıklama izin hatası veriyor.
 *   2) Yol ayracı olarak ters bölü yazıyor ("panel\index.html"); ZIP belirtimi
 *      düz bölü şart koşar ve macOS'un unzip'i ters bölüyü dosya adının parçası
 *      sayar — klasör yapısı hiç oluşmaz, kurucu "panel dosyaları bulunamadı" der.
 *
 * Windows'ta ikisi de görünmez: tar.exe her iki durumu da tolere ediyor.
 */
var fs = require("fs");
var pathm = require("path");

var dist = KOKYOL + "dist";
var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 80) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

if (!fs.existsSync(dist)) {
  console.log("(dist/ yok — kurucu uretilmemis, test atlandi)");
  process.exit(0);
}
var zipler = fs.readdirSync(dist).filter(function (f) { return /-Kurulum\.zip$/i.test(f); });
if (!zipler.length) {
  console.log("(kurulum zip'i yok — tools/kurucu-yap.ps1 calistirilmamis, test atlandi)");
  process.exit(0);
}

// en yeni kurulum paketini sına
zipler.sort();
var zipYolu = pathm.join(dist, zipler[zipler.length - 1]);
var buf = fs.readFileSync(zipYolu);

/* ---------- ZIP central directory'sini oku ---------- */
var kayitlar = [];
for (var i = 0; i < buf.length - 46; i++) {
  if (buf.readUInt32LE(i) !== 0x02014b50) continue;
  var adUz = buf.readUInt16LE(i + 28);
  var ad = buf.toString("utf8", i + 46, i + 46 + adUz);
  var yapanSistem = buf.readUInt8(i + 5);
  var disAttr = buf.readUInt32LE(i + 38);
  kayitlar.push({ ad: ad, mod: (disAttr >>> 16) & 0xFFF, sistem: yapanSistem });
}

ok("kurulum paketi okunabiliyor", kayitlar.length > 0, zipler[zipler.length - 1] + " · " + kayitlar.length + " kayit");

/* ---------- 1) Yol ayracı ---------- */
var tersBolulu = kayitlar.filter(function (k) { return k.ad.indexOf("\\") !== -1; });
ok("yol ayraci DUZ BOLU (macOS klasor yapisini kurabilsin)",
  tersBolulu.length === 0,
  tersBolulu.length ? tersBolulu.map(function (k) { return k.ad; }).slice(0, 3).join(" | ") : "0 ters bolu");

/* ---------- 2) mac kurucusu çalıştırılabilir mi ---------- */
var komut = kayitlar.filter(function (k) { return /\.command$/i.test(k.ad); })[0];
ok("mac kurucusu (.command) pakette var", !!komut, komut ? komut.ad : "YOK");
if (komut) {
  ok("mac kurucusu CALISTIRILABILIR (0755)",
    (komut.mod & 0o111) !== 0,
    "mod=0" + komut.mod.toString(8) + (komut.mod === 0 ? "  <- Compress-Archive izin yazmamis" : ""));
  ok("arsiv Unix sistemi olarak isaretli (izinler yorumlansin)",
    komut.sistem === 3, "version-made-by ust bayt = " + komut.sistem);
}

/* ---------- 3) Windows kurucusu ---------- */
var bat = kayitlar.filter(function (k) { return /\.bat$/i.test(k.ad); })[0];
ok("Windows kurucusu (.bat) pakette var", !!bat, bat ? bat.ad : "YOK");

/* ---------- 4) Panelin çalışması için gereken dosyalar ---------- */
var gerekli = ["panel/index.html", "panel/CSXS/manifest.xml", "panel/js/captions.js",
               "panel/js/bridge.js", "panel/js/app.js", "panel/js/engine.js", "panel/jsx/host.jsx"];
var eksik = gerekli.filter(function (g) {
  return !kayitlar.some(function (k) { return k.ad === g; });
});
ok("panel dosyalarinin tamami pakette", eksik.length === 0, eksik.join(" | ") || gerekli.length + " dosya");

/* ---------- 5) Kaldırılan modüller sızmamış, v2.2 modülleri pakette ---------- */
// v2.2: magiccut (Kesim) bilinçli geri geldi; sfx/motion hâlâ yok
var sizinti = kayitlar.filter(function (k) { return /(sfx|motion)\.js$/i.test(k.ad); });
ok("kaldirilan modul dosyalari pakette YOK", sizinti.length === 0,
  sizinti.map(function (k) { return k.ad; }).join(" | ") || "temiz");
["panel/js/magiccut.js", "panel/js/beat.js"].forEach(function (g) {
  ok("v2.2 modulu pakette: " + g,
    kayitlar.some(function (k) { return k.ad === g; }));
});
ok("emoji seti pakette", kayitlar.some(function (k) { return /panel\/emoji\/esleme\.json$/.test(k.ad); }));
ok("emoji lisans atfi pakette", kayitlar.some(function (k) { return /panel\/emoji\/LISANS\.txt$/.test(k.ad); }));

/* ---------- 6) Kurucu betikleri gerçekten iş yapıyor mu ---------- */
var batKaynak = fs.readFileSync(KOKYOL + "tools/kurucu/Suflo-Kur.bat", "utf8");
var cmdKaynak = fs.readFileSync(KOKYOL + "tools/kurucu/Suflo-Kur.command", "utf8");

ok("bat: CEP eklenti klasorune kuruyor", /Adobe\\CEP\\extensions/i.test(batKaynak));
ok("bat: PlayerDebugMode ayarliyor", /PlayerDebugMode/.test(batKaynak));
ok("bat: kurulumu DOGRULUYOR", /if not exist .*index\.html/i.test(batKaynak));
ok("command: CEP eklenti klasorune kuruyor", /Adobe\/CEP\/extensions/.test(cmdKaynak));
ok("command: PlayerDebugMode ayarliyor", /PlayerDebugMode/.test(cmdKaynak));
ok("command: macOS karantinasini temizliyor", /xattr -dr com\.apple\.quarantine/.test(cmdKaynak));
ok("command: kurulumu DOGRULUYOR", /index\.html.*\]|\[ ! -f/.test(cmdKaynak));

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
process.exit(kaldi ? 1 : 0);
