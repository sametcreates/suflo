/*
 * Pro icerik esitleme: ilk kurulum, degisen dosyayi tek basina indirme,
 * atomik surum gecisi, bozuk hash/traversal korumasi ve cevrimdisi kullanim.
 */
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm"), crypto = require("crypto");
var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-pro-sync-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function file(rel, buf) { return { path: rel, bytes: buf.length, sha256: sha(buf) }; }
var a1 = Buffer.from("PK\x03\x04-mogrt-a-v1");
var w1 = Buffer.from("RIFF-whoosh-v1");
var w2 = Buffer.from("RIFF-whoosh-v2-longer");
var b2 = Buffer.from("PK\x03\x04-mogrt-b-v2");
var c3 = Buffer.from("PK\x03\x04-mogrt-c-v3");
var w3 = Buffer.from("RIFF-whoosh-v3-even-longer");
var payloads = {};
function setPayloads(map) { payloads = map; }

var manifestMode = "v1";
var manifestFailOnce = true, manifestCalls = 0;
var downloadCalls = [];
var failOncePath = "";
var settings = { proPackKlasor: "" };
var ctx = {
  console: console, Promise: Promise, Buffer: Buffer, require: require,
  setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
  document: { getElementById: function () { return null; } },
  Pro: {
    isPro: function () { return true; },
    contentCredentials: function () { return { licenseKey: "TEST-LICENSE", instanceId: "instance-1" }; },
    on: function () {}
  },
  K: {
    VERSION: "9.9.9", nodeOK: true, fs: fs, path: path, os: os, MAC: false,
    settingsPath: function () { return path.join(TMP, "settings.json"); },
    settings: function () { return settings; },
    saveSettings: function () { fs.writeFileSync(path.join(TMP, "settings.json"), JSON.stringify(settings)); return true; },
    httpJson: function () { throw new Error("test transport should be injected"); },
    log: function () {}, run: function () { return Promise.resolve(); }
  }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "pro-sync.js"), "utf8"), ctx, { filename: "js/pro-sync.js" });

function manifestFetcher() {
  manifestCalls++;
  if (manifestFailOnce) { manifestFailOnce = false; return Promise.reject(new Error("temporary manifest network error")); }
  if (manifestMode === "offline") return Promise.reject(new Error("offline"));
  if (manifestMode === "bad-path") return Promise.resolve({ ok: true, token: "t", content_version: "3", files: [file("mogrt/../../escape.mogrt", a1)] });
  if (manifestMode === "bad-hash") return Promise.resolve({ ok: true, token: "t", content_version: "3", files: [{ path: "mogrt/A.mogrt", bytes: a1.length, sha256: "0".repeat(64) }] });
  if (manifestMode === "v3") return Promise.resolve({ ok: true, token: "t3", content_version: "3.0.0", files: [file("mogrt/A.mogrt", a1), file("mogrt/C.mogrt", c3), file("sfx/Whoosh/w.wav", w3)] });
  if (manifestMode === "v2") return Promise.resolve({ ok: true, token: "t2", content_version: "2.0.0", files: [file("mogrt/A.mogrt", a1), file("mogrt/B.mogrt", b2), file("sfx/Whoosh/w.wav", w2)] });
  return Promise.resolve({ ok: true, token: "t1", content_version: "1.0.0", files: [file("mogrt/A.mogrt", a1), file("sfx/Whoosh/w.wav", w1)] });
}
function fileFetcher(endpoint, token, item, dest, progress) {
  downloadCalls.push(item.path);
  if (failOncePath === item.path) { failOncePath = ""; return Promise.reject(new Error("temporary network error")); }
  var buf = payloads[item.path];
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  if (progress) progress(1, buf.length);
  return Promise.resolve({ ok: true, bytes: buf.length });
}
ctx.ProSync.configure({ root: path.join(TMP, "managed"), manifestFetcher: manifestFetcher, fileFetcher: fileFetcher });

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name + (evidence === undefined ? "" : "   [" + evidence + "]")); }
  else { failed++; console.log("FAIL " + name + "   [" + String(evidence) + "]"); }
}

async function run() {
  setPayloads({ "mogrt/A.mogrt": a1, "sfx/Whoosh/w.wav": w1 });
  var r1 = await ctx.ProSync.sync();
  var goodV1 = settings.proPackKlasor;
  ok("Ilk Pro esitleme gecici manifest hatasini atlatip tum dosyalari indirir", r1.ok && r1.downloaded === 2 && downloadCalls.length === 2 && manifestCalls === 2, JSON.stringify(r1));
  ok("Ilk surum ancak tamamlaninca aktif klasore donusur", /releases[\\\/]1\.0\.0$/.test(settings.proPackKlasor) && settings.proPackManaged === true, settings.proPackKlasor);
  ok("Indirilen dosyalar dogru ve manifest kaydi var",
    fs.readFileSync(path.join(settings.proPackKlasor, "mogrt", "A.mogrt")).equals(a1) &&
    fs.existsSync(path.join(settings.proPackKlasor, ".suflo-manifest.json")) &&
    Object.keys(JSON.parse(fs.readFileSync(path.join(settings.proPackKlasor, ".suflo-manifest.json"), "utf8")).localFiles || {}).length === 2);

  var beforeSame = downloadCalls.length;
  var same = await ctx.ProSync.sync();
  ok("Katalog degismediyse dosya tekrar indirilmez", same.ok && same.current && downloadCalls.length === beforeSame, downloadCalls.length);

  // Ayni boyuttaki yerel bozulma yalniz boyut kontroluyle yakalanamaz; hash
  // dogrulamasi bozuk dosyayi sunucudan yeniden alirken saglam dosyayi korur.
  var corruptPath = path.join(settings.proPackKlasor, "mogrt", "A.mogrt");
  var installedManifestPath = path.join(settings.proPackKlasor, ".suflo-manifest.json");
  var installedManifest = JSON.parse(fs.readFileSync(installedManifestPath, "utf8"));
  var recordedMtime = installedManifest.localFiles["mogrt/a.mogrt"].mtimeMs;
  fs.writeFileSync(corruptPath, Buffer.alloc(a1.length, 88));
  fs.utimesSync(corruptPath, new Date(recordedMtime), new Date(recordedMtime));
  installedManifest.verifiedAt = 0; // haftalik tam kontrol zamani gelmis gibi
  fs.writeFileSync(installedManifestPath, JSON.stringify(installedManifest));
  var beforeRepair = downloadCalls.length;
  var repaired = await ctx.ProSync.sync();
  ok("Ayni boyuttaki bozuk yerel dosya otomatik onarilir",
    repaired.ok && repaired.downloaded === 1 && repaired.copied === 1 && downloadCalls.length - beforeRepair === 1 &&
    fs.readFileSync(path.join(settings.proPackKlasor, "mogrt", "A.mogrt")).equals(a1), JSON.stringify(repaired));

  manifestMode = "v2";
  setPayloads({ "mogrt/A.mogrt": a1, "mogrt/B.mogrt": b2, "sfx/Whoosh/w.wav": w2 });
  var beforeV2 = downloadCalls.length;
  var r2 = await ctx.ProSync.sync();
  ok("Yeni surumde yalniz degisen/yeni dosyalar indirilir", r2.ok && r2.downloaded === 2 && r2.copied === 1 && downloadCalls.length - beforeV2 === 2, JSON.stringify(r2));
  ok("Degismeyen dosya onceki surumden yerel kopyalanir", fs.readFileSync(path.join(settings.proPackKlasor, "mogrt", "A.mogrt")).equals(a1), settings.proPackKlasor);
  var goodV2 = settings.proPackKlasor;

  manifestMode = "v3";
  setPayloads({ "mogrt/A.mogrt": a1, "mogrt/C.mogrt": c3, "sfx/Whoosh/w.wav": w3 });
  failOncePath = "sfx/Whoosh/w.wav";
  var interrupted = await ctx.ProSync.sync();
  var stagingV3 = path.join(TMP, "managed", "releases", "3.0.0.staging");
  ok("Kesilen indirme calisan surumu degistirmez ve staging'i korur", interrupted.ok === false && settings.proPackKlasor === goodV2 && fs.existsSync(path.join(stagingV3, "mogrt", "C.mogrt")), JSON.stringify(interrupted));
  var beforeResume = downloadCalls.length;
  var r3 = await ctx.ProSync.sync();
  ok("Ayni manifest sonraki denemede tamamlanmis dosyalari tekrar indirmez", r3.ok && r3.downloaded === 1 && downloadCalls.length - beforeResume === 1, JSON.stringify(r3));
  var goodV3 = settings.proPackKlasor;
  ok("Diskte aktif surum ile bir onceki geri donus kopyasi kalir", !fs.existsSync(goodV1) && fs.existsSync(goodV2) && settings.proContentPreviousPath === goodV2, settings.proContentPreviousPath);

  manifestMode = "bad-hash";
  setPayloads({ "mogrt/A.mogrt": a1 });
  var badHash = await ctx.ProSync.sync();
  ok("Bozuk hash yeni surumu reddeder", badHash.ok === false && /doğrulama|dogrulama/i.test(badHash.error), badHash.error);
  ok("Bozuk guncelleme calisan Pro paketini bozmaz", settings.proPackKlasor === goodV3 && fs.existsSync(path.join(goodV3, "mogrt", "C.mogrt")), settings.proPackKlasor);

  manifestMode = "bad-path";
  var badPath = await ctx.ProSync.sync();
  ok("Path traversal katalogda engellenir", badPath.ok === false && /güvensiz|guvensiz/i.test(badPath.error), badPath.error);
  ok("Pro kokunun disina dosya yazilmaz", !fs.existsSync(path.join(TMP, "escape.mogrt")));

  manifestMode = "offline";
  var offline = await ctx.ProSync.sync();
  ok("Internet yokken kurulu Pro icerikleri calismaya devam eder", offline.ok && offline.offline && ctx.ProSync.status().phase === "ready", JSON.stringify(offline));

  var src = fs.readFileSync(path.join(ROOT, "js", "pro-sync.js"), "utf8");
  ok("Lisans anahtari URL'ye eklenmez", !/license_key[^\n]{0,120}(query|search|encodeURIComponent)/i.test(src));
  ok("Yeni surum staging tamamlanmadan aktif edilmez", /\.staging/.test(src) && /renameSync\(staging, releaseDir\)/.test(src));
  ok("Degismeyen kurulu dosyalar her acilista yeniden hashlenmez", /localFiles/.test(src) && /marker\.mtimeMs !== mtimeMs/.test(src));
  ok("Tam icerik butunlugu en gec yedi gunde bir yeniden dogrulanir", /7 \* 24 \* 3600 \* 1000/.test(src) && /forceFull/.test(src));

  console.log("\n" + passed + "/" + (passed + failed) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed ? 1 : 0);
}
run().catch(function (e) {
  console.log("FAIL test kosumu   [" + (e && e.stack ? e.stack : e) + "]");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
