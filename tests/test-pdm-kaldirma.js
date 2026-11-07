// Suflo testi: PlayerDebugMode kurulum / kaldırma (Pro denetimi bulgusu). Kurucular PlayerDebugMode'u
// açmadan ÖNCE eski değeri SufloOncekiPlayerDebugMode işaretine yazar (zaten "1" ise yazmaz; işaret
// varsa ellemez); kaldırma yalnız işaretli sürümlerde eski hâli geri yükler, gerisine dokunmaz.
// .sh betikleri sahte "defaults" ile GERÇEKTEN çalıştırılır; .ps1 ve .bat (Windows) metinden denetlenir.
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8").replace(/\r\n/g, "\n"); }

var ISARET = "SufloOncekiPlayerDebugMode";
var instPs = oku("tools/install.ps1"), unPs = oku("tools/uninstall.ps1"), bat = oku("tools/kurucu/Suflo-Kur.bat");
var instSh = oku("tools/install.sh"), cmd = oku("tools/kurucu/Suflo-Kur.command"), unSh = oku("tools/uninstall.sh");
// İnceleme bulgusu: yayın ZIP'i (asıl dağıtım) yalnız kurucuları taşıyordu; işareti okuyan kaldırıcı yoktu
function varsaOku(f) { return fs.existsSync(path.join(KOK, f)) ? oku(f) : ""; }
var kaldirBat = varsaOku("tools/kurucu/Suflo-Kaldir.bat"), kaldirCmd = varsaOku("tools/kurucu/Suflo-Kaldir.command");

/* ---------------- 1) Windows betikleri (metin denetimi) ---------------- */
// install.ps1: işaret yoksa önceki değer okunur; "1" değilse (yoksa "yok") işarete yazılır; sonra PlayerDebugMode = 1
var psDongu = instPs.slice(instPs.indexOf("foreach ($v in 9..14)"), instPs.indexOf("# 2) Dosyalari kopyala"));
ok("install.ps1: işaret yokken önceki değer okunur, '1' değilse işarete yazılır, sonra açılır",
  /\$isaret = "SufloOncekiPlayerDebugMode"/.test(instPs) && /if \(\$null -eq \$ozellik\.\$isaret\) \{/.test(psDongu) &&
  /\$onceki = \$ozellik\.PlayerDebugMode/.test(psDongu) && /if \(\$null -eq \$onceki\) \{ \$onceki = "yok" \}/.test(psDongu) &&
  /if \("\$onceki" -ne "1"\) \{ New-ItemProperty -Path \$key -Name \$isaret/.test(psDongu) &&
  psDongu.indexOf("$ozellik.$isaret") < psDongu.indexOf('-Name "PlayerDebugMode" -Value "1"'), psDongu.slice(0, 200));
ok("install.ps1: PlayerDebugMode yine her sürümde 1 (kurulum davranışı aynı)", (psDongu.match(/-Name "PlayerDebugMode" -Value "1" -PropertyType String -Force/g) || []).length === 1);
// uninstall.ps1: PlayerDebugMode'a yalnız işaret varken dokunulur; işaret sonra silinir
var unPsDongu = unPs.slice(unPs.indexOf("foreach ($v in 9..14)"), unPs.indexOf("if ($geriAlinan -gt 0)"));
ok("uninstall.ps1: işaretsiz sürüm atlanır; 'yok' ise değer silinir, değilse eski değer yazılır; işaret kaldırılır",
  /\$isaret = "SufloOncekiPlayerDebugMode"/.test(unPs) && /\$onceki = \$ozellik\.\$isaret\n\s+if \(\$null -eq \$onceki\) \{ continue \}/.test(unPsDongu) &&
  /if \("\$onceki" -eq "yok"\) \{\n\s+Remove-ItemProperty -Path \$key -Name "PlayerDebugMode"/.test(unPsDongu) &&
  /New-ItemProperty -Path \$key -Name "PlayerDebugMode" -Value "\$onceki"/.test(unPsDongu) && /Remove-ItemProperty -Path \$key -Name \$isaret/.test(unPsDongu), unPsDongu.slice(0, 300));
ok("uninstall.ps1: PlayerDebugMode döngü dışında koşulsuz silinmez / değiştirilmez",
  (unPs.match(/-Name "PlayerDebugMode"/g) || []).length === 2 && (unPsDongu.match(/-Name "PlayerDebugMode"/g) || []).length === 2);
// Suflo-Kur.bat: işaret reg query ile aranır; yoksa önceki değer okunur (0x1 = 1), 1 değilse işarete yazılır
var batDongu = bat.slice(bat.indexOf("for %%V in (9 10 11 12 13 14) do ("), bat.indexOf("rem 3) Panel dosyalarini kopyala"));
ok("Suflo-Kur.bat: işaret yoksa önceki değer okunur, '1' değilse işarete yazılır, sonra açılır",
  /reg query "HKCU\\Software\\Adobe\\CSXS\.%%V" \/v SufloOncekiPlayerDebugMode >nul 2>&1\n\s+if errorlevel 1 \(/.test(batDongu) &&
  /set "ONCEKI=yok"/.test(batDongu) && /for \/f "tokens=3" %%A in \('reg query "HKCU\\Software\\Adobe\\CSXS\.%%V" \/v PlayerDebugMode 2\^>nul \^\| find \/I "PlayerDebugMode"'\) do set "ONCEKI=%%A"/.test(batDongu) &&
  /if not "!ONCEKI!"=="1" reg add "HKCU\\Software\\Adobe\\CSXS\.%%V" \/v SufloOncekiPlayerDebugMode \/t REG_SZ \/d "!ONCEKI!"/.test(batDongu) &&
  batDongu.indexOf("SufloOncekiPlayerDebugMode") < batDongu.indexOf("/v PlayerDebugMode /t REG_SZ /d 1 /f"), batDongu.slice(0, 200));
ok("Suflo-Kur.bat: gecikmeli genişletme açık (!ONCEKI! döngüde okunur), CRLF ve ASCII korunur",
  /setlocal enabledelayedexpansion/.test(bat) && /\r\n/.test(fs.readFileSync(path.join(KOK, "tools/kurucu/Suflo-Kur.bat"), "latin1")) &&
  /^[\x00-\x7f]*$/.test(fs.readFileSync(path.join(KOK, "tools/kurucu/Suflo-Kur.bat"), "latin1")));
ok("yedi betik aynı işaret adını kullanır", [instPs, unPs, bat, instSh, cmd, unSh, kaldirBat, kaldirCmd].every(function (s) { return s.indexOf(ISARET) !== -1; }));

/* ---------------- 1b) Yayın ZIP'inin kaldırıcıları ---------------- */
var kbDongu = kaldirBat.slice(kaldirBat.indexOf("for %%V in (9 10 11 12 13 14) do ("), kaldirBat.indexOf("rem 3)"));
ok("Suflo-Kaldir.bat: işaret okunur; yoksa dokunulmaz, 'yok' ise PlayerDebugMode silinir, değilse eski değer yazılır; işaret silinir",
  /set "ONCEKI="/.test(kbDongu) &&
  /for \/f "tokens=3" %%A in \('reg query "HKCU\\Software\\Adobe\\CSXS\.%%V" \/v SufloOncekiPlayerDebugMode 2\^>nul \^\| find \/I "SufloOncekiPlayerDebugMode"'\) do set "ONCEKI=%%A"/.test(kbDongu) &&
  /if defined ONCEKI \(/.test(kbDongu) &&
  /if \/I "!ONCEKI!"=="yok" \(\n\s+reg delete "HKCU\\Software\\Adobe\\CSXS\.%%V" \/v PlayerDebugMode \/f/.test(kbDongu) &&
  /\) else \(\n\s+reg add "HKCU\\Software\\Adobe\\CSXS\.%%V" \/v PlayerDebugMode \/t REG_SZ \/d "!ONCEKI!" \/f/.test(kbDongu) &&
  /reg delete "HKCU\\Software\\Adobe\\CSXS\.%%V" \/v SufloOncekiPlayerDebugMode \/f/.test(kbDongu), kbDongu.slice(0, 300));
ok("Suflo-Kaldir.bat: PlayerDebugMode'a döngü dışında dokunulmaz; uzantı klasörü silinir; onay sorulur",
  (kaldirBat.match(/\/v PlayerDebugMode/g) || []).length === 2 && (kbDongu.match(/\/v PlayerDebugMode/g) || []).length === 2 &&
  /set "HEDEF=%APPDATA%\\Adobe\\CEP\\extensions\\com\.sametcreates\.kesit"/.test(kaldirBat) && /rd \/s \/q "%HEDEF%"/.test(kaldirBat) &&
  /set \/p DEVAM=/.test(kaldirBat) && kaldirBat.indexOf("set /p DEVAM=") < kaldirBat.indexOf("for %%V in"));
ok("Suflo-Kaldir.bat: gecikmeli genişletme açık, CRLF ve ASCII", /setlocal enabledelayedexpansion/.test(kaldirBat) &&
  /\r\n/.test(fs.readFileSync(path.join(KOK, "tools/kurucu/Suflo-Kaldir.bat"), "latin1")) &&
  /^[\x00-\x7f]*$/.test(fs.readFileSync(path.join(KOK, "tools/kurucu/Suflo-Kaldir.bat"), "latin1")));
ok("Suflo-Kaldir.command: #!/bin/bash ile başlar (BOM yok), LF", kaldirCmd.indexOf("#!/bin/bash") === 0 &&
  !/\r/.test(fs.readFileSync(path.join(KOK, "tools/kurucu/Suflo-Kaldir.command"), "latin1")));
var ky = oku("tools/kurucu-yap.ps1");
ok("kurucu-yap.ps1: Suflo-Kaldir.bat kopyalanır, Suflo-Kaldir.command LF ve BOM'suz yazılır",
  /Copy-Item \(Join-Path \$PSScriptRoot "kurucu\\Suflo-Kaldir\.bat"\) -Destination \$stage -Force/.test(ky) &&
  /Suflo-Kaldir\.command"\)\) -replace "`r`n", "`n"/.test(ky) &&
  /WriteAllText\(\(Join-Path \$stage "Suflo-Kaldir\.command"\), \$[A-Za-z]+, \(New-Object System\.Text\.UTF8Encoding\(\$false\)\)\)/.test(ky));
var okubeni = ky.slice(ky.indexOf('$oku = @"'), ky.indexOf('"@', ky.indexOf('$oku = @"')));
ok("OKUBENI: KALDIRMA bölümü iki kaldırıcıyı adıyla söyler", /\nKALDIRMA\b/.test(okubeni) && /Windows : "Suflo-Kaldir\.bat"/.test(okubeni) &&
  /Mac     : "Suflo-Kaldir\.command"/.test(okubeni), okubeni.slice(-500));
var izin = oku("tools/zip-izin.js");
ok("zip-izin.js: her .command'a (Suflo-Kaldir.command dahil) çalıştırma izni", /function calistirilabilirMi\(ad\) \{\n\s+return \/\\\.\(command\|sh\)\$\/i\.test\(ad\);/.test(izin));
ok("README: kaldırma adımları (ZIP'teki kaldırıcılar ve tools/uninstall.*)", /Suflo-Kaldir\.bat/.test(oku("README.md")) && /Suflo-Kaldir\.command/.test(oku("README.md")));

/* ---------------- 2) macOS betikleri: sahte "defaults" ile gerçek çalıştırma ---------------- */
var bashVar = !cp.spawnSync("bash", ["--version"], { stdio: "ignore" }).error;
if (!bashVar) {
  console.log("(bash yok - .sh betikleri yalnız metinden denetlendi)");
} else {
  ["tools/install.sh", "tools/uninstall.sh", "tools/kurucu/Suflo-Kur.command"].forEach(function (f) {
    var r = cp.spawnSync("bash", ["-n", path.join(KOK, f)], { encoding: "utf8" });
    ok(f + ": bash sözdizimi geçerli", r.status === 0, r.stderr);
  });
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-pdm-"));
  var bin = path.join(tmp, "bin"), db = path.join(tmp, "db"), ev = path.join(tmp, "ev");
  fs.mkdirSync(bin); fs.mkdirSync(db); fs.mkdirSync(ev);
  // Sahte defaults: alan adı klasör, anahtar dosya. read yoksa 1 döner (gerçeği gibi), write -string destekler
  fs.writeFileSync(path.join(bin, "defaults"), [
    "#!/bin/sh",
    'D="$DEFAULTS_DB/$2"',
    'case "$1" in',
    '  read) [ -f "$D/$3" ] || { echo "does not exist" >&2; exit 1; }; cat "$D/$3" ;;',
    '  write) mkdir -p "$D"; if [ "$4" = "-string" ]; then printf %s "$5" > "$D/$3"; else printf %s "$4" > "$D/$3"; fi ;;',
    '  delete) [ -f "$D/$3" ] || exit 1; rm -f "$D/$3" ;;',
    "esac", ""].join("\n"), { mode: 493 });
  function yaz(v, k, deger) { var d = path.join(db, "com.adobe.CSXS." + v); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, k), deger); }
  function oku2(v, k) { var p = path.join(db, "com.adobe.CSXS." + v, k); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null; }
  function sifirla() {
    fs.rmSync(db, { recursive: true, force: true }); fs.mkdirSync(db);
    // 9: hiç yok · 10: zaten 1 (başka eklenti) · 11: 0 (kullanıcı kapatmış) · 12-14: hiç yok
    yaz(10, "PlayerDebugMode", "1"); yaz(11, "PlayerDebugMode", "0");
  }
  var ortam = Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH, DEFAULTS_DB: db, HOME: ev });
  // Kurucunun PlayerDebugMode bloğu (dosya kopyalamadan önceki kısım) ayrı çalıştırılır
  function kurulumBlogu(src, harf) {
    var bas = src.indexOf("ISARET=SufloOncekiPlayerDebugMode");
    var son = src.indexOf("\ndone", src.indexOf("for " + harf + " in 9 10 11 12 13 14; do", bas)) + 5;
    return bas > 0 && son > bas ? src.slice(bas, son) : "";
  }
  function calistir(betik, set) {
    return cp.spawnSync("bash", ["-c", (set ? "set -e\n" : "") + betik], { env: ortam, encoding: "utf8" });
  }
  [["tools/install.sh", instSh, "v", true], ["tools/kurucu/Suflo-Kur.command", cmd, "V", false]].forEach(function (k) {
    var blok = kurulumBlogu(k[1], k[2]);
    ok(k[0] + ": PlayerDebugMode bloğu bulundu", blok.length > 50, blok.slice(0, 120));
    sifirla();
    var r1 = calistir(blok, k[3]), r2 = calistir(blok, k[3]);   // iki kez kur: ikinci kurulum işareti ezmez
    ok(k[0] + ": her sürümde PlayerDebugMode 1", r1.status === 0 && r2.status === 0 && [9, 10, 11, 12, 13, 14].every(function (v) { return oku2(v, "PlayerDebugMode") === "1"; }),
      r1.stderr + r2.stderr);
    ok(k[0] + ": işaret: yoktu → 'yok', 0 → '0', zaten 1 → işaret yok; yeniden kurulum ezmez",
      oku2(9, ISARET) === "yok" && oku2(11, ISARET) === "0" && oku2(10, ISARET) === null && oku2(14, ISARET) === "yok",
      JSON.stringify([oku2(9, ISARET), oku2(10, ISARET), oku2(11, ISARET)]));
    var u = cp.spawnSync("bash", [path.join(KOK, "tools/uninstall.sh")], { env: ortam, encoding: "utf8" });
    ok(k[0] + " + uninstall.sh: yalnız Suflo'nun değiştirdiği geri alınır (9 silinir, 10 açık kalır, 11 → 0), işaretler gider",
      u.status === 0 && oku2(9, "PlayerDebugMode") === null && oku2(10, "PlayerDebugMode") === "1" && oku2(11, "PlayerDebugMode") === "0" &&
      oku2(14, "PlayerDebugMode") === null && [9, 10, 11, 12, 13, 14].every(function (v) { return oku2(v, ISARET) === null; }) && /onceki haline dondu \(CSXS surumu: 5\)/.test(u.stdout),
      u.stdout + u.stderr);
  });
  // Yayın ZIP'inin Mac kaldırıcısı: Suflo-Kur.command'dan sonra uzantı klasörünü siler, PlayerDebugMode'u geri yükler
  ok("tools/kurucu/Suflo-Kaldir.command: bash sözdizimi geçerli", cp.spawnSync("bash", ["-n", path.join(KOK, "tools/kurucu/Suflo-Kaldir.command")]).status === 0);
  sifirla();
  calistir(kurulumBlogu(cmd, "V"), false);
  var uzanti = path.join(ev, "Library", "Application Support", "Adobe", "CEP", "extensions", "com.sametcreates.kesit");
  fs.mkdirSync(path.join(uzanti, "CSXS"), { recursive: true }); fs.writeFileSync(path.join(uzanti, "index.html"), "x");
  var vaz = cp.spawnSync("bash", [path.join(KOK, "tools/kurucu/Suflo-Kaldir.command")], { env: ortam, encoding: "utf8", input: "h\n\n" });
  ok("Suflo-Kaldir.command: onay verilmezse hiçbir şeye dokunmaz", vaz.status === 0 && fs.existsSync(uzanti) && oku2(9, ISARET) === "yok" && oku2(9, "PlayerDebugMode") === "1",
    vaz.stdout + vaz.stderr);
  var kc = cp.spawnSync("bash", [path.join(KOK, "tools/kurucu/Suflo-Kaldir.command")], { env: ortam, encoding: "utf8", input: "e\n\n" });
  ok("Suflo-Kaldir.command: uzantı silinir; yalnız Suflo'nun değiştirdiği geri alınır (9 silinir, 10 açık, 11 → 0), işaretler gider",
    kc.status === 0 && !fs.existsSync(uzanti) && oku2(9, "PlayerDebugMode") === null && oku2(10, "PlayerDebugMode") === "1" && oku2(11, "PlayerDebugMode") === "0" &&
    [9, 10, 11, 12, 13, 14].every(function (v) { return oku2(v, ISARET) === null; }) && /CSXS: 5/.test(kc.stdout), kc.stdout + kc.stderr);
  sifirla(); yaz(9, "PlayerDebugMode", "1");
  var kc2 = cp.spawnSync("bash", [path.join(KOK, "tools/kurucu/Suflo-Kaldir.command")], { env: ortam, encoding: "utf8", input: "y\n\n" });
  ok("Suflo-Kaldir.command: işaret yoksa PlayerDebugMode'a dokunulmaz", kc2.status === 0 && oku2(9, "PlayerDebugMode") === "1" && oku2(10, "PlayerDebugMode") === "1",
    kc2.stdout + kc2.stderr);

  // İşaretsiz eski kurulum (bu sürümden önce kurulmuş): kaldırma PlayerDebugMode'a dokunmaz
  sifirla(); yaz(9, "PlayerDebugMode", "1");
  var u2 = cp.spawnSync("bash", [path.join(KOK, "tools/uninstall.sh")], { env: ortam, encoding: "utf8" });
  ok("uninstall.sh: işaret yoksa PlayerDebugMode'a dokunulmaz ve kullanıcıya söylenir",
    u2.status === 0 && oku2(9, "PlayerDebugMode") === "1" && oku2(10, "PlayerDebugMode") === "1" && /dokunulmadan birakildi/.test(u2.stdout), u2.stdout);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
