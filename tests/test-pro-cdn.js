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
var php = fs.readFileSync(path.join(ROOT, "server", "pro-v1", "index.php"), "utf8");
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
console.log("\n" + passed + "/" + (passed + failed) + " gecti");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
try { fs.rmSync(OUT_ROOT, { recursive: true, force: true }); } catch (e2) {}
process.exit(failed ? 1 : 0);
