var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-sfx-curation-test");
var CURRENT = path.join(TMP, "current"), VAULT = path.join(TMP, "vault"), OUT = path.join(ROOT, "dist", "test-sfx-curation");
var passed = 0, failed = 0;
function ok(name, condition, evidence) { if (condition) { passed++; console.log("PASS " + name); } else { failed++; console.log("FAIL " + name + " [" + evidence + "]"); } }
function put(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
function audioFiles(dir) { return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter(function (e) { return e.isFile() && /\.(wav|mp3)$/i.test(e.name); }); }

fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(OUT, { recursive: true, force: true });
put(path.join(CURRENT, "loose whoosh.wav"), "same-whoosh");
put(path.join(CURRENT, "camera shutter.wav"), "camera");
put(path.join(VAULT, "Whoosh", "SUFLO SFX - polished whoosh.wav"), "same-whoosh");
put(path.join(VAULT, "seni seçtim", "SUFLO SFX - correct.mp3"), "essential");
put(path.join(VAULT, "SFX", "SUFLO MUSIC - Podcast Background Music.mp3"), "music");

var run = cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "curate-pro-sfx.js"), CURRENT, VAULT, OUT], { encoding: "utf8" });
ok("SFX duzenleyici basariyla calisir", run.status === 0, run.stderr || run.stdout);
var report = JSON.parse(fs.readFileSync(path.join(OUT, "curation-report.json"), "utf8"));
ok("ayni ses SHA-256 ile tek kopyaya iner", report.files === 3 && report.duplicates_removed === 1, JSON.stringify(report));
ok("seni sectim klasoru sametcreates Essentials olur", fs.existsSync(path.join(OUT, "sametcreates Essentials", "correct.mp3")), JSON.stringify(report.categories));
ok("kokte daginik ses birakilmaz", fs.readdirSync(OUT, { withFileTypes: true }).filter(function (e) { return e.isFile() && /\.(wav|mp3)$/i.test(e.name); }).length === 0, fs.readdirSync(OUT).join(","));
ok("muzik SFX bulutuna alinmaz", report.music_skipped === 1 && !/Podcast Background/i.test(JSON.stringify(report)), report.music_skipped);
ok("dosyalar anlamli kategorilere ayrilir", report.categories["Whooshes & Swishes"] === 1 && report.categories["Camera & Shutters"] === 1, JSON.stringify(report.categories));

fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(OUT, { recursive: true, force: true });
console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
