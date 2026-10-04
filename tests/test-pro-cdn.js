/* Pro CDN builder ve sunucu guvenlik sozlesmesi. */
var fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process"), crypto = require("crypto");
var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-pro-cdn-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(path.join(TMP, "mogrt"), { recursive: true });
fs.mkdirSync(path.join(TMP, "sfx", "Whoosh"), { recursive: true });
var mogrt = Buffer.from("PK\x03\x04-test-mogrt"), wav = Buffer.from("RIFF-test-wav");
fs.writeFileSync(path.join(TMP, "mogrt", "Demo.mogrt"), mogrt);
fs.writeFileSync(path.join(TMP, "sfx", "Whoosh", "hit.wav"), wav);
fs.writeFileSync(path.join(TMP, "sfx", "ignore.txt"), "no");
fs.mkdirSync(path.join(TMP, "davet", "t1", "sfx"), { recursive: true });
fs.mkdirSync(path.join(TMP, "davet", "t3", "mogrt"), { recursive: true });
fs.mkdirSync(path.join(TMP, "davet", "t2", "sfx"), { recursive: true });
var davetWav = Buffer.from("RIFF-davet-t1"), davetMogrt = Buffer.from("PK\x03\x04-davet-t3");
fs.writeFileSync(path.join(TMP, "davet", "t1", "sfx", "pop.wav"), davetWav);
fs.writeFileSync(path.join(TMP, "davet", "t3", "mogrt", "Kurucu.mogrt"), davetMogrt);
fs.writeFileSync(path.join(TMP, "davet", "t2", "sfx", "yok.wav"), "x");
fs.writeFileSync(path.join(TMP, "davet", "t1", "sfx", "notlar.txt"), "x");
var OUT_ROOT = path.join(ROOT, "dist", "pro-cdn-test");
var run = cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "build-pro-cdn.js"), TMP, "test.1", OUT_ROOT], { cwd: ROOT, encoding: "utf8" });
var OUT = path.join(OUT_ROOT, "upload");
var passed = 0, failed = 0;
function ok(name, condition, evidence) { if (condition) { passed++; console.log("PASS " + name); } else { failed++; console.log("FAIL " + name + "   [" + String(evidence) + "]"); } }
ok("CDN builder basarili", run.status === 0, run.stderr || run.stdout);
var manifest = JSON.parse(fs.readFileSync(path.join(OUT, "private", "pro-v1", "manifest.json"), "utf8"));
ok("Manifest yalniz MOGRT ve SFX tasir", manifest.files.length === 2 && manifest.counts.mogrt === 1 && manifest.counts.sfx === 1, JSON.stringify(manifest.counts));
ok("Manifest SHA-256 ve boyutlari dogru", manifest.files.every(function (f) {
  var original = /^mogrt\//.test(f.path) ? mogrt : wav;
  return f.bytes === original.length && f.sha256 === crypto.createHash("sha256").update(original).digest("hex");
}));
ok("Ucretli dosyalar public_html disinda", !fs.existsSync(path.join(OUT, "public_html", "pro", "v1", "content")) && fs.existsSync(path.join(OUT, "private", "pro-v1", "content", "mogrt", "Demo.mogrt")));
var config = fs.readFileSync(path.join(OUT, "private", "pro-v1", "config.php"), "utf8");
ok("Uretim config guclu rastgele token anahtari iceriyor", /token_secret' => '[a-f0-9]{96}'/.test(config));
ok("Davet odulleri ana manifeste girmez", manifest.files.every(function (f) { return !/^davet\//.test(f.path); }) && manifest.counts.total === 2);
var davetManifest = null;
try { davetManifest = JSON.parse(fs.readFileSync(path.join(OUT, "private", "pro-v1", "davet", "manifest.json"), "utf8")); } catch (e) {}
ok("Davet odulleri ayri manifestte, yalniz t1/t3 mogrt ve sfx", davetManifest && davetManifest.version === "test.1" &&
  JSON.stringify(davetManifest.files.map(function (f) { return f.path; })) === JSON.stringify(["davet/t1/sfx/pop.wav", "davet/t3/mogrt/Kurucu.mogrt"]) &&
  davetManifest.files[0].sha256 === crypto.createHash("sha256").update(davetWav).digest("hex"), JSON.stringify(davetManifest));
ok("Davet dosyalari private altinda", fs.existsSync(path.join(OUT, "private", "pro-v1", "davet", "t1", "sfx", "pop.wav")) &&
  !fs.existsSync(path.join(OUT, "private", "pro-v1", "davet", "t2")) && !fs.existsSync(path.join(OUT, "public_html", "pro", "v1", "davet")));
ok("Uretim config davet ozelligini uyur halde ve anahtarsiz kurar", /'ls_api_key' => ''/.test(config) && /'referral_enabled' => false/.test(config) &&
  /'referral_variant_ids' => \[\]/.test(config) && /'davet_dir' => __DIR__ \. '\/davet'/.test(config));
var php = fs.readFileSync(path.join(ROOT, "server", "pro-v1", "index.php"), "utf8");
var ornekConfig = fs.readFileSync(path.join(ROOT, "server", "pro-v1", "config.example.php"), "utf8");
ok("Lemon Squeezy API anahtari yalniz cfg'den okunur, ornek config bos gelir",
  /\$cfg\['ls_api_key'\]/.test(php) && !/getenv\(|\$_(?:GET|POST|REQUEST|SERVER|ENV)\[['"]ls_api_key/.test(php) &&
  !/(?:error_log|syslog)\([^;]*\$key/.test(php) && /'ls_api_key' => ''/.test(ornekConfig) && /'referral_enabled' => false/.test(ornekConfig));
ok("Davet ucu Lemon Squeezy JSON:API'sini Bearer ile cagirir", /Authorization: Bearer ' \. \$key/.test(php) && /application\/vnd\.api\+json/.test(php) &&
  /CURLOPT_CONNECTTIMEOUT => 8/.test(php) && /CURLOPT_TIMEOUT => 15/.test(php));
var check = fs.readFileSync(path.join(ROOT, "tools", "check-pro-cdn.js"), "utf8");
ok("Saglik kapisi davet ucunun 400 degil 403/503 JSON dondugunu dogrular", /action: "referral"/.test(check) && /status === 403 \|\| status === 503/.test(check));
var verify = fs.readFileSync(path.join(ROOT, "tools", "verify-release.ps1"), "utf8");
ok("Yayin denetimi pakette gomulu Bearer tokeni ve ls_api_key degeri arar", /Test-Secrets/.test(verify) && /Bearer/.test(verify) && /ls_api_key/.test(verify) && /SUFLO_LS_API_KEY/.test(verify));
var phpVar = cp.spawnSync("php", ["-v"], { encoding: "utf8" });
if (!phpVar.error && phpVar.status === 0) {
  ["index.php", "config.example.php"].forEach(function (f) {
    var l = cp.spawnSync("php", ["-l", path.join(ROOT, "server", "pro-v1", f)], { encoding: "utf8" });
    ok("php -l " + f, l.status === 0, l.stdout + l.stderr);
  });
  var lc = cp.spawnSync("php", ["-l", path.join(OUT, "private", "pro-v1", "config.php")], { encoding: "utf8" });
  ok("php -l uretim config.php", lc.status === 0, lc.stdout + lc.stderr);
}
ok("Sunucu Lemon lisansini store ve product ile dogrular", /licenses\/validate/.test(php) && /store_id/.test(php) && /product_id/.test(php));
ok("Sunucu path traversal ve token suresini denetler", /part === '\.\.'/.test(php) && /hash_equals/.test(php) && /\['exp'\]/.test(php));
ok("Lisans ve token URL query stringine konmaz", !/\$_GET\[['\"](?:license|token)/.test(php));
ok("Buyuk dosyalar tamponlanmadan ve zaman asimina takilmadan akar", /set_time_limit\(0\)/.test(php) && /X-Accel-Buffering: no/.test(php) && /ob_end_clean/.test(php));
ok("Lisans API kotasi IP saklamayan hiz siniriyla korunur", /allow_manifest_request/.test(php) && /REMOTE_ADDR/.test(php) && /hash\('sha256'/.test(php) && /fail_json\(429/.test(php));
var publish = fs.readFileSync(path.join(ROOT, "tools", "publish.ps1"), "utf8");
ok("GitHub yayini canli Pro API saglik kapisi olmadan baslamaz", /check-pro-cdn\.js/.test(publish) && /Yayin durduruldu/.test(publish));
ok("GitHub yayini paketi yeniden uretip imza, sizinti ve tum testleri zorunlu tutar",
  /package\.ps1/.test(publish) && /kurucu-yap\.ps1/.test(publish) && /verify-release\.ps1/.test(publish) && /test\.ps1/.test(publish));
ok("GitHub commit kapisi gizli/odeme dosyalarini ve commit hatasini durdurur",
  /Yasakli\/gizli dosya stage edildi/.test(publish) && /Git commit basarisiz/.test(publish));
// PS 5.1 Get-Content BOM'suz UTF-8'i ANSI okur: v3.0.0 release notu "YayÄ±nda" diye bozuk cikti
ok("publish: surum notu UTF-8 okunur",
  (publish.match(/Get-Content \$notlar[^\r\n]*/g) || []).length >= 2 &&
  (publish.match(/Get-Content \$notlar[^\r\n]*/g) || []).every(function (l) { return /-Encoding UTF8/.test(l); }),
  publish.match(/Get-Content \$notlar[^\r\n]*/g));
console.log("\n" + passed + "/" + (passed + failed) + " gecti");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
try { fs.rmSync(OUT_ROOT, { recursive: true, force: true }); } catch (e2) {}
process.exit(failed ? 1 : 0);
