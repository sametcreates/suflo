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
    call: async function (fn) {
      if (fn === "KS_apiProbe") return { ok: true, app: "26.3.0", seq: true, subsequence: true, autoReframe: true, qe: true, qeAddTracks: true, markers: true, trackItemDisabled: true, trackMuted: true };
      return { ok: true, app: "26.3.0", hasSeq: true, sequence: "Doctor Test" };
    },
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
// 3.2 adım 5: Doctor çözme modu ve DTW satırları (js/whisper-args.js doctorSatirlari)
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "whisper-args.js"), "utf8"), ctx, { filename: "js/whisper-args.js" });
// 3.4 adım 19: "Model kaynaklarını sına" satırları (js/ag-dayanim.js kaynakSatirlari)
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "ag-dayanim.js"), "utf8"), ctx, { filename: "js/ag-dayanim.js" });
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
  // 3.2 adım 5: etkin çözme modu ve DTW desteği motor grubunda
  var cz = check(report, "Çözme modu"), dtw = check(report, "Hassas kelime zamanlaması (DTW)");
  ok("Doctor: çözme modu satırı (varsayılan En doğru, -bs 5)", cz && cz.status === "good" && cz.group === "engine" && /En doğru · beam search \(-bs 5\)/.test(cz.detail), cz && cz.detail);
  ok("Doctor: DTW satırı motor grubunda; kapalıyken desteklenmemesi uyarı değil", dtw && dtw.group === "engine" && dtw.status === "good", dtw && (dtw.status + " " + dtw.detail));
  var eskiRun = ctx.K.run, eskiModel = ctx.KEngine.activeModel;
  var yardim = fs.readFileSync(path.join(__dirname, "fixtures", "whisper-cli-v1.9.1-yardim.txt"), "utf8");
  ctx.K.run = async function () { return { code: 0, stdout: "", stderr: yardim }; };
  ctx.KEngine.activeModel = function () { return { id: "turbo", label: "Turbo — test" }; };
  settings.cozme = "hizli"; settings.dtw = true;
  var r2 = ctx.KDoctor.makeReport();
  await ctx.KDoctor.runAsyncChecks(r2);
  ok("Doctor: Hızlı modu ve v1.9.1 + Turbo'da 'Açık · desteklenir (large.v3.turbo)'", /Hızlı · açgözlü çözme/.test(check(r2, "Çözme modu").detail) &&
    check(r2, "Hassas kelime zamanlaması (DTW)").status === "good" && /Açık · desteklenir \(large\.v3\.turbo\)/.test(check(r2, "Hassas kelime zamanlaması (DTW)").detail),
    check(r2, "Hassas kelime zamanlaması (DTW)").detail);
  settings.dtwKapali = { "turbo@cpu": { neden: "t_dtw" } };
  var r3 = ctx.KDoctor.makeReport();
  await ctx.KDoctor.runAsyncChecks(r3);
  ok("Doctor: bu model + derlemede otomatik kapatılan DTW uyarı olarak görünür", check(r3, "Hassas kelime zamanlaması (DTW)").status === "warn" &&
    /otomatik kapatıldı/.test(check(r3, "Hassas kelime zamanlaması (DTW)").detail));
  ctx.K.run = async function () { return { code: 0, stdout: "", stderr: yardim.split("\n").filter(function (l) { return !/-dtw|flash-attn/.test(l); }).join("\n") }; };
  delete settings.dtwKapali;
  var r4 = ctx.KDoctor.makeReport();
  await ctx.KDoctor.runAsyncChecks(r4);
  ok("Doctor: -dtw / -nfa tanımayan derleme (DTW açık) uyarı", check(r4, "Hassas kelime zamanlaması (DTW)").status === "warn" &&
    /-dtw \/ -nfa tanımıyor/.test(check(r4, "Hassas kelime zamanlaması (DTW)").detail));
  ctx.K.run = eskiRun; ctx.KEngine.activeModel = eskiModel; delete settings.cozme; delete settings.dtw;
  ok("Pro manifestindeki tum dosyalar sayilir", check(report, "Pro içerik bütünlüğü").detail.indexOf("3 dosya") !== -1);
  ok("Gercek prfpset Doctor tarafindan parse edilir", check(report, "Premiere preset paketi").detail.indexOf("1 efekt") !== -1);
  ok("Doctor raporu destek icin kopyalanabilir", /Suflo Doctor raporu/.test(ctx.KDoctor.reportText(report)));

  // Karttaki çipler gerçek sonucu gösterir: bölümdeki en kötü durum, denetim yoksa nötr ("")
  var cip = ctx.KDoctor.cipDurumlari(report);
  ok("Doctor çipleri tarama sonucundan (Premiere, motor, Pro, Presetler hazır)", cip.premiere === "good" && cip.engine === "good" && cip.pro === "good" && cip.preset === "good", JSON.stringify(cip));
  var cip2 = ctx.KDoctor.cipDurumlari({ checks: [
    { status: "good", group: "premiere", title: "Premiere bağlantısı" }, { status: "warn", group: "premiere", title: "Premiere'de yok: X" },
    { status: "bad", group: "engine", title: "FFmpeg bulunamadı" }, { status: "good", group: "engine", title: "GPU" },
    { status: "good", group: "pro", title: "Suflo Pro lisansı" }, { status: "bad", group: "pro", title: "Preset paketi okunamıyor" }] });
  ok("Doctor çipi bölümün en kötü durumunu alır; Presetler Pro'dan ayrı", cip2.premiere === "warn" && cip2.engine === "bad" && cip2.pro === "good" && cip2.preset === "bad", JSON.stringify(cip2));
  var cip3 = ctx.KDoctor.cipDurumlari({ checks: [{ status: "good", group: "pro", title: "Lisans durumu" }] });
  ok("Denetimi olmayan çip nötr kalır (Free: preset denetimi yok)", cip3.preset === "" && cip3.premiere === "" && cip3.pro === "good", JSON.stringify(cip3));
  var css = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8"), html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok("Doctor çipleri: Premiere sabit yeşil değil; durum sınıfları var; HTML'de dört çip data-doctor-cip ile",
    !/doctor-scope span:first-child::before/.test(css) && /\.doctor-scope span\.good::before/.test(css) && /\.doctor-scope span\.bad::before/.test(css) &&
    ["premiere", "engine", "pro", "preset"].every(function (k) { return html.indexOf('data-doctor-cip="' + k + '"') !== -1; }));

  // 3.4 adım 19 — Model kaynaklarını sına: 5 sn HEAD, yalnız düğmeyle; DNS filtresi ve HTTPS denetimi anlatılır
  var headCagri = [], dnsSorgu = [];
  var eskiGet = ctx.K.httpGet;
  ctx.K.httpGet = async function (u, h, s) {
    if (s && s.method === "HEAD") {
      headCagri.push({ u: u, s: s });
      if (/huggingface\.co/.test(u)) return { status: 200, body: "", caDenendi: true };
      if (/hf-mirror\.com/.test(u)) return { status: 0, body: "Error: unable to verify the first certificate", kod: "UNABLE_TO_VERIFY_LEAF_SIGNATURE", caDenendi: true };
      return { status: 0, body: "Error: getaddrinfo ENOTFOUND github.com", kod: "ENOTFOUND" };
    }
    return eskiGet(u, h, s);
  };
  ctx.K.dnsEngeli = async function (host) { dnsSorgu.push(host); return host === "github.com" ? "146.112.61.106" : ""; };
  ctx.KEngine.motorKaynakAdresi = function () { return "https://github.com/ggerganov/whisper.cpp/releases/download/v1.9.1/whisper-blas-bin-x64.zip"; };
  var normal = ctx.KDoctor.makeReport();
  await ctx.KDoctor.runAsyncChecks(normal);
  ok("adım 19: normal Doctor taraması model kaynaklarına istek atmaz (yalnız düğme)", headCagri.length === 0, headCagri.length);
  var kaynaklar = await ctx.KDoctor.kaynakSina();
  ok("adım 19: üç kaynağa 5 sn zaman aşımlı HEAD (huggingface.co, hf-mirror.com, motor sürüm sunucusu)",
    headCagri.length === 3 && headCagri.every(function (c) { return c.s.timeout === 5000 && c.s.method === "HEAD"; }) &&
    ["https://huggingface.co/", "https://hf-mirror.com/", "https://github.com/"].every(function (u) { return headCagri.some(function (c) { return c.u === u; }); }),
    JSON.stringify(headCagri.map(function (c) { return c.u; })));
  function kSatir(host) { return kaynaklar.filter(function (c) { return c.title === "Model kaynağı: " + host; })[0]; }
  var kHf = kSatir("huggingface.co"), kAyna = kSatir("hf-mirror.com"), kMotor = kSatir("github.com");
  ok("adım 19: ulaşılan kaynak iyi (kurumsal sertifikayla ulaşıldığı yazılır)", kHf && kHf.status === "good" && kHf.group === "engine" && /HTTP 200/.test(kHf.detail) && /kurumsal sertifikayla/.test(kHf.detail), kHf && kHf.detail);
  ok("adım 19: sertifika hatası 'HTTPS denetimi' olarak anlatılır, içe aktarma önerilir", kAyna && kAyna.status === "bad" && /HTTPS bağlantılarını denetliyor/.test(kAyna.detail) && /bir kez daha denedi/.test(kAyna.detail) && /Model dosyası içe aktar/.test(kAyna.detail), kAyna && kAyna.detail);
  ok("adım 19: Umbrella aralığına çözülen ad kurumsal filtre olarak anlatılır", kMotor && kMotor.status === "bad" && /Kurumsal ağ filtresi github\.com adresini engelliyor \(Cisco Umbrella, 146\.112\.61\.106\)/.test(kMotor.detail), kMotor && kMotor.detail);
  ok("adım 19: DNS yalnız ulaşılamayan kaynaklar için sorulur", dnsSorgu.length === 2 && dnsSorgu.indexOf("huggingface.co") === -1, dnsSorgu.join(","));
  var ekli = ctx.KDoctor.kaynakSatirlariniEkle(normal, kaynaklar);
  ekli = ctx.KDoctor.kaynakSatirlariniEkle(ekli, kaynaklar);
  ok("adım 19: tekrar sınama satırları çoğaltmaz, rapor durumu yeniden hesaplanır",
    ekli.checks.filter(function (c) { return c.kaynak; }).length === 3 && ekli.status === "bad", ekli.status);
  var temiz = ctx.KDoctor.kaynakSatirlariniEkle(ekli, ctx.SufloAgDayanim.kaynakSatirlari([{ ad: "x", host: "huggingface.co", status: 403 }]));
  ok("adım 19: HTTP 403 uyarı (filtre olabilir), eski satırlar gider", temiz.checks.filter(function (c) { return c.kaynak; }).length === 1 &&
    temiz.checks.filter(function (c) { return c.kaynak; })[0].status === "warn" && /HTTP 403/.test(temiz.checks.filter(function (c) { return c.kaynak; })[0].detail));
  var htmlD = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  ok("adım 19: Doctor kartında 'Model kaynaklarını sına' düğmesi", /id="set-doctor-kaynak"[^>]*>Model kaynaklarını sına</.test(htmlD));
  ctx.K.httpGet = eskiGet;

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
