// Suflo testi: kurucu betikleri ve paketleme listeleri (kaynak denetimi; kurulum zip'i gerekmez).
// tests/test-kurucu.js dist/ altındaki zip'i ister; bu dosya her ortamda çalışır.
var fs = require("fs");
var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 80) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}
var batKaynak = fs.readFileSync(KOKYOL + "tools/kurucu/Suflo-Kur.bat", "utf8");
var cmdKaynak = fs.readFileSync(KOKYOL + "tools/kurucu/Suflo-Kur.command", "utf8");

/* ---------- 7) İki dilli kurucu: E/e (Evet) ve Y/y (Yes) onay sayılır ---------- */
ok("bat: onayda E/e ve Y/y kabul edilir (Y artık iptal etmez)", /if \/I "!ILK!"=="E" set "ONAY=1"/.test(batKaynak) &&
  /if \/I "!ILK!"=="Y" set "ONAY=1"/.test(batKaynak) && /set "ILK=!DEVAM:~0,1!"/.test(batKaynak) && !/if \/I not "!DEVAM!"=="E"/.test(batKaynak));
ok("command: onayda E/e ve Y/y kabul edilir", /\[EeYy\]\*\) ;;/.test(cmdKaynak));
ok("bat ve command iki dilli (İngilizce satırlar)", [batKaynak, cmdKaynak].every(function (k) {
  return /Setup cancelled/.test(k) && /SETUP COMPLETE/.test(k) && /Configuring Premiere/.test(k) && /Copying the panel/.test(k) &&
    /Verifying/.test(k) && /English \(beta\)/.test(k) && /Continue anyway\?/.test(k);
}));
ok("bat: ASCII (cmd kod sayfasından bağımsız)", !/[^\x00-\x7F]/.test(batKaynak));
var batBlok = batKaynak.split("\n").filter(function (l) { return /^\s{2,}echo .*[()]/.test(l) && !/\^\(|\^\)/.test(l); });
ok("bat: blok içindeki echo satırlarında kaçışsız parantez yok", batBlok.length === 0, batBlok.join(" | "));

/* ---------- 8) Paketleme listeleri İngilizce arayüzü taşır ---------- */
function oku(f) { return fs.readFileSync(KOKYOL + f, "utf8"); }
ok("package.ps1 i18n klasörünü paketler", /\$stageItems = @\([^)]*"i18n"/.test(oku("tools/package.ps1")));
ok("kurucu-yap.ps1 i18n klasörünü paketler", /\$panelItems = @\([^)]*"i18n"/.test(oku("tools/kurucu-yap.ps1")));
ok("install.ps1 i18n klasörünü kopyalar", /foreach \(\$item in @\([^)]*"i18n"/.test(oku("tools/install.ps1")));
ok("install.sh i18n klasörünü kopyalar", /for item in [^;]*\bi18n\b/.test(oku("tools/install.sh")));
var vr = oku("tools/verify-release.ps1");
ok("verify-release.ps1: i18n/en.js, js/i18n.js ve js/pricing.js zorunlu", vr.indexOf("'(^|/)i18n/en\\.js$'") !== -1 &&
  vr.indexOf("'(^|/)js/i18n\\.js$'") !== -1 && vr.indexOf("'(^|/)js/pricing\\.js$'") !== -1);

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
process.exit(kaldi ? 1 : 0);
