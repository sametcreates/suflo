/* Suflo Doctor gercek kaynak testi: sistem, motor, Pro ve preset tanilari. */
var fs = require("fs");
var os = require("os");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-doctor-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

var EXT = path.join(TMP, "extension");
var DATA = path.join(TMP, "data");
var RELEASES = path.join(DATA, "pro-content", "releases");
var ACTIVE = path.join(RELEASES, "2026.08.24.1");
var MODEL = path.join(DATA, "whisper", "models", "ggml.bin");
var ENGINE = path.join(DATA, "whisper", "whisper-cli.exe");
var FFMPEG = path.join(DATA, "ffmpeg", "ffmpeg.exe");
[path.join(EXT, "CSXS"), path.join(EXT, "content", "mogrt"), path.join(ACTIVE, "mogrt"),
  path.join(ACTIVE, "sfx"), path.join(ACTIVE, "presets"), path.dirname(MODEL), path.dirname(FFMPEG)]
  .forEach(function (dir) { fs.mkdirSync(dir, { recursive: true }); });

fs.writeFileSync(path.join(EXT, "CSXS", "manifest.xml"), '<ExtensionManifest ExtensionBundleVersion="2.8.6"></ExtensionManifest>');
fs.writeFileSync(ENGINE, "engine");
fs.writeFileSync(MODEL, "model");
fs.writeFileSync(FFMPEG, "ffmpeg");
fs.writeFileSync(path.join(ACTIVE, "mogrt", "A.mogrt"), Buffer.from("PK\x03\x04doctor"));
fs.writeFileSync(path.join(ACTIVE, "sfx", "A.wav"), "wav");

var presetXml = '<?xml version="1.0"?><PremiereData>' +
  '<Tree ObjectID="1"><RootBin ObjectRef="2"/></Tree>' +
  '<BinTreeItem ObjectID="2"><Items><Item Index="0" ObjectRef="3"/></Items><TreeItemBase><Name>Root</Name></TreeItemBase></BinTreeItem>' +
  '<TreeItem ObjectID="3"><TreeItemBase><Name>Doctor Zoom</Name><Data ObjectRef="4"/></TreeItemBase></TreeItem>' +
  '<FilterPresetItem ObjectID="4"><FilterPresets><FilterPreset Index="0" ObjectRef="5"/></FilterPresets></FilterPresetItem>' +
  '<FilterPreset ObjectID="5"><FilterMatchName>AE.ADBE Motion</FilterMatchName><Component ObjectRef="6"/><AnchorInPoint>0</AnchorInPoint><AnchorOutPoint>1</AnchorOutPoint><Type>1</Type></FilterPreset>' +
  '<VideoFilterComponent ObjectID="6"><Component><DisplayName>Motion</DisplayName><Params><Param Index="0" ObjectRef="7"/></Params><Intrinsic>true</Intrinsic></Component><MatchName>AE.ADBE Motion</MatchName></VideoFilterComponent>' +
  '<VideoComponentParam ObjectID="7"><Name>Scale</Name><Keyframes>0,100.;1,110.;</Keyframes><ParameterID>1</ParameterID><ParameterControlType>8</ParameterControlType><IsTimeVarying>true</IsTimeVarying><StartKeyframe>0,100.</StartKeyframe><CurrentValue>100.</CurrentValue></VideoComponentParam>' +
  '</PremiereData>';
var presetPath = path.join(ACTIVE, "presets", "Doctor.prfpset");
fs.writeFileSync(presetPath, presetXml);

var files = [
  { path: "mogrt/A.mogrt", bytes: fs.statSync(path.join(ACTIVE, "mogrt", "A.mogrt")).size },
  { path: "sfx/A.wav", bytes: fs.statSync(path.join(ACTIVE, "sfx", "A.wav")).size },
  { path: "presets/Doctor.prfpset", bytes: fs.statSync(presetPath).size }
];
fs.writeFileSync(path.join(ACTIVE, ".suflo-manifest.json"), JSON.stringify({ version: "2026.08.24.1", files: files }));

var settings = {
  provider: "local", model: "turbo", engineBuild: "cpu",
  proPackManaged: true, proPackKlasor: ACTIVE, proContentVersion: "2026.08.24.1",
  mogrtEkKlasor: "", sfxEkKlasor: "", emojiAssetsKlasor: ""
};
var ffmpegReady = true;
var ctx = {
  console: console, Promise: Promise, Buffer: Buffer,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: {
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function () { return { setAttribute: function () {}, style: {}, select: function () {} }; },
    body: { appendChild: function () {}, removeChild: function () {} },
    execCommand: function () { return true; }
  },
  navigator: {},
  K: {
    VERSION: "2.8.6", REPO: "sametcreates/suflo", nodeOK: true,
    fs: fs, path: path, os: os, MAC: false,
    extensionPath: function () { return EXT; },
    settingsPath: function () { return path.join(DATA, "settings.json"); },
    settings: function () { return settings; }, saveSettings: function () { return true; },
    whisperLocal: function (opts) { return { exe: ENGINE, model: opts && opts.skipModel ? null : MODEL, dir: path.dirname(ENGINE) }; },
    findFfmpeg: async function () { return ffmpegReady ? FFMPEG : null; },
    run: async function () { return { code: 0, stdout: "ok", stderr: "" }; },
    call: async function () { return { ok: true, app: "26.3.0", hasSeq: true, sequence: "Doctor Test" }; },
    httpGet: async function () { return { status: 200, body: JSON.stringify({ tag_name: "v2.8.6" }) }; },
    hataYardimi: function (e) { return String(e && e.message ? e.message : e); },
    log: function () {}
  },
  KEngine: {
    activeModel: function () { return { label: "Turbo — test" }; },
    installedBuild: function () { return "cpu"; },
    detectGpu: async function () { return { kind: "cpu", name: "" }; }
  },
  Pro: {
    status: function () { return { ready: true, pro: true, needsRecheck: false }; },
    isPro: function () { return true; }
  },
  ProSync: { status: function () { return { phase: "ready", version: "2026.08.24.1" }; } },
  KPresets: { packs: function () { return [{ count: 1 }]; } }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "preset-pack.js"), "utf8"), ctx, { filename: "js/preset-pack.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "library-health.js"), "utf8"), ctx, { filename: "js/library-health.js" });

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + "   [" + String(evidence || "").slice(0, 180) + "]"); }
}
function check(report, title) { return report.checks.filter(function (c) { return c.title === title; })[0]; }

async function main() {
  ok("KDoctor geriye uyumlu saglik API'siyle yayinlanir", ctx.KDoctor === ctx.KLibraryHealth);
  var report = ctx.KDoctor.makeReport();
  await ctx.KDoctor.runAsyncChecks(report);
  ok("Premiere koprusu gercek cagridan dogrulanir", check(report, "Premiere bağlantısı").status === "good");
  ok("FFmpeg yolu Doctor raporunda hazirdir", check(report, "FFmpeg").status === "good");
  ok("Yerel motor calistirilarak dogrulanir", check(report, "Yerel altyazı motoru").status === "good");
  ok("Pro manifestindeki tum dosyalar sayilir", check(report, "Pro içerik bütünlüğü").detail.indexOf("3 dosya") !== -1);
  ok("Gercek prfpset Doctor tarafindan parse edilir", check(report, "Premiere preset paketi").detail.indexOf("1 efekt") !== -1);
  ok("Doctor raporu destek icin kopyalanabilir", /Suflo Doctor raporu/.test(ctx.KDoctor.reportText(report)));

  fs.mkdirSync(path.join(RELEASES, "2026.08.25.1.staging"), { recursive: true });
  var staged = ctx.KDoctor.makeReport();
  await ctx.KDoctor.runAsyncChecks(staged);
  var stagedCheck = check(staged, "Yarım kalan Pro güncellemesi var");
  ok("Yarim kalan Pro guncellemesi aktif paketi bozuk saymadan uyarir", stagedCheck && stagedCheck.status === "warn" && stagedCheck.action === "sync-pro");

  ffmpegReady = false;
  var missing = ctx.KDoctor.makeReport();
  await ctx.KDoctor.runAsyncChecks(missing);
  var ff = check(missing, "FFmpeg bulunamadı");
  ok("Eksik FFmpeg tek tik onarim eylemi uretir", ff && ff.status === "bad" && ff.action === "repair-ffmpeg");

  console.log("\n" + passed + "/" + (passed + failed) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.log("FAIL Doctor test kosumu   [" + (e && e.stack ? e.stack : e) + "]");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
