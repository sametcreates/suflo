/* Hostinger emoji katalogu: paket uretimi, hak kapisi ve panel katalog okuma. */
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");
var vm = require("vm");
var crypto = require("crypto");
var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-emoji-cdn-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(path.join(TMP, "source"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "brand", "suflo-logo-1024.png"), path.join(TMP, "source", "Happy Emoji.png"));
fs.copyFileSync(path.join(ROOT, "brand", "suflo-logo-seffaf-1024.png"), path.join(TMP, "source", "Party Emoji.png"));

var passed = 0, failed = 0;
function ok(name, condition, proof) {
  if (condition) { passed++; console.log("PASS " + name + (proof !== undefined ? "   [" + proof + "]" : "")); }
  else { failed++; console.log("FAIL " + name + "   [" + String(proof || "?").slice(0, 200) + "]"); }
}
function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }

var builder = path.join(ROOT, "tools", "build-emoji-cdn.js");
var denied = cp.spawnSync(process.execPath, [builder, "--source", path.join(TMP, "source"), "--out", path.join(TMP, "denied")], { encoding: "utf8" });
ok("dagitim hakki onayi olmadan paket uretilmez", denied.status !== 0 && /rights-confirmed/.test(denied.stderr), denied.status);

var out = path.join(TMP, "hostinger");
var built = cp.spawnSync(process.execPath, [builder,
  "--source", path.join(TMP, "source"), "--out", out,
  "--rights-confirmed", "--license-name", "Test licensed assets"
], { encoding: "utf8" });
ok("Hostinger paketi uretiliyor", built.status === 0, built.stderr);
var catalog = JSON.parse(fs.readFileSync(path.join(out, "catalog.json"), "utf8"));
ok("katalog semasi ve adet dogru", catalog.schema === "suflo-emoji-catalog/v1" && catalog.count === 2, catalog.count);
ok("asil dosyalar CDN donusumunu engelleyen guvenli akistan geliyor",
  catalog.items.every(function (x) { return /^download\.php\?file=/.test(x.file); }), catalog.items[0].file);
ok("kartlar icin hafif thumbnail uretiliyor", catalog.items.every(function (x) { return /^thumbs\//.test(x.preview); }), catalog.items[0].preview);
ok("SHA-256 katalogdaki dosyayla eslesiyor", catalog.items.every(function (x) {
  var name = decodeURIComponent(String(x.file).replace(/^download\.php\?file=/, ""));
  return x.sha256 === sha(path.join(out, "assets", name));
}));
var streamPhp = path.join(out, "download.php");
ok("Hostinger icin byte-koruyan PHP indirme gecidi var",
  fs.existsSync(streamPhp) && /application\/octet-stream/.test(fs.readFileSync(streamPhp, "utf8")) &&
  /no-transform/.test(fs.readFileSync(streamPhp, "utf8")) && /realpath/.test(fs.readFileSync(streamPhp, "utf8")));
ok("Hostinger cache/CORS dosyasi var", fs.existsSync(path.join(out, ".htaccess")) && /Access-Control-Allow-Origin/.test(fs.readFileSync(path.join(out, ".htaccess"), "utf8")));
ok("kurulum notu pakette", fs.existsSync(path.join(out, "HOSTINGER-KURULUM.txt")));
var bridgeSource = fs.readFileSync(path.join(ROOT, "js", "bridge.js"), "utf8");
ok("yeni kurulum Suflo Cloud kataloguna otomatik baglanir",
  /DEFAULT_EMOJI_CATALOG_URL\s*=\s*"https:\/\/assets\.suflo\.app\/emoji\/v1\/catalog\.json"/.test(bridgeSource) &&
  /emojiAssetsCatalogUrl:\s*DEFAULT_EMOJI_CATALOG_URL/.test(bridgeSource));
ok("eski bos CDN ayari yerel klasor yoksa otomatik onariliyor",
  /emojiAssetsCatalogDisabled\s*!==\s*true[\s\S]{0,180}emojiAssetsCatalogUrl\s*=\s*DEFAULT_EMOJI_CATALOG_URL/.test(bridgeSource) &&
  /emojiAssetsCatalogMigrated\s*=\s*"2\.6\.3"/.test(bridgeSource));
ok("bilerek kapatilan CDN ile eski bos ayar birbirinden ayriliyor",
  /emojiAssetsCatalogDisabled\s*=\s*!value/.test(fs.readFileSync(path.join(ROOT, "js", "emoji-assets.js"), "utf8")));

(async function () {
  var settings = {
    emojiAssetsCatalogUrl: "https://assets.example.test/emoji/v1/catalog.json",
    emojiAssetFavs: [], emojiAssetRecent: []
  };
  var remoteCatalog = {
    schema: "suflo-emoji-catalog/v1",
    items: [{
      id: "happy-1234567890", name: "Happy Emoji", file: "assets/happy.png",
      preview: "assets/happy.png", format: "PNG", bytes: 8,
      sha256: "a".repeat(64), category: "emoji", keywords: ["happy"]
    }]
  };
  var ctx = {
    console: console, Promise: Promise, Math: Math, URL: URL,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    document: { getElementById: function () { return null; } },
    K: {
      nodeOK: true, fs: fs, path: path,
      settingsPath: function () { return path.join(TMP, "settings.json"); },
      settings: function () { return settings; }, saveSettings: function () {},
      httpGet: async function () { return { status: 200, body: JSON.stringify(remoteCatalog) }; },
      log: function () {}
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "emoji-assets.js"), "utf8"), ctx);
  await ctx.KEmojiAssets.loadRemoteCatalog();
  ok("panel uzak katalogu okuyor", ctx.KEmojiAssets.sayisi() === 1, ctx.KEmojiAssets.sayisi());
  ok("uzak katalog adi aramaya hazir", ctx.KEmojiAssets.adlar()[0] === "Happy Emoji", ctx.KEmojiAssets.adlar()[0]);

  var pending = {};
  ctx.KApp = { toast: function () {} };
  ctx.K.httpGet = function (url) {
    return new Promise(function (resolve) { pending[url] = resolve; });
  };
  settings.emojiAssetsCatalogUrl = "https://old.example.test/emoji/v1/catalog.json";
  var oldLoad = ctx.KEmojiAssets.loadRemoteCatalog();
  ctx.KEmojiAssets.saveRemoteUrl("https://new.example.test/emoji/v1/catalog.json");
  function namedCatalog(name, id) {
    return JSON.stringify({ schema: "suflo-emoji-catalog/v1", items: [{
      id: id, name: name, file: "assets/item.png", preview: "thumbs/item.webp",
      format: "PNG", bytes: 8, sha256: "b".repeat(64), category: "emoji", keywords: [name]
    }] });
  }
  pending["https://new.example.test/emoji/v1/catalog.json"]({ status: 200, body: namedCatalog("New Emoji", "new-123") });
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  pending["https://old.example.test/emoji/v1/catalog.json"]({ status: 200, body: namedCatalog("Old Emoji", "old-123") });
  await oldLoad;
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  ok("gec kalan eski katalog yeni ayari ezemiyor", ctx.KEmojiAssets.adlar()[0] === "New Emoji", ctx.KEmojiAssets.adlar()[0]);

  var src = fs.readFileSync(path.join(ROOT, "js", "emoji-assets.js"), "utf8");
  ok("secimde onbellege indirme var", /async function remotePath/.test(src) && /K\.download\(item\.url/.test(src));
  ok("indirilen dosya SHA-256 ile dogrulaniyor", /sha256File\(out\) !== item\.sha256/.test(src));
  ok("uzak dosya mevcut timeline koprusune gidiyor", /KS_placeGraphic/.test(src));

  console.log("\n" + passed + "/" + (passed + failed) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(failed ? 1 : 0);
})().catch(function (e) {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
