/* Ucretsiz kullanici gercek sesler olmadan Pro SFX koleksiyonlarini kilitli gorur. */
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-sfx-showcase-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
var EXT = path.join(TMP, "extension");
fs.mkdirSync(path.join(EXT, "assets", "pro-sfx-showcase"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "assets", "pro-sfx-showcase", "catalog.json"), path.join(EXT, "assets", "pro-sfx-showcase", "catalog.json"));
var pro = false;
var settings = { sfxFavs: [], sfxRecent: [] };
var ctx = {
  console: console, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: { getElementById: function () { return null; } },
  Audio: function () { this.pause = function () {}; this.play = function () { return Promise.resolve(); }; },
  Pro: { isPro: function () { return pro; }, gate: function () { return false; } },
  K: {
    nodeOK: true, fs: fs, path: path, os: os,
    settingsPath: function () { return path.join(TMP, "settings.json"); }, extensionPath: function () { return EXT; },
    settings: function () { return settings; }, saveSettings: function () {}, walkAudio: function () { return []; }, log: function () {}
  }
};
ctx.window = ctx; vm.createContext(ctx);
var source = fs.readFileSync(path.join(ROOT, "js", "sfx.js"), "utf8");
vm.runInContext(source, ctx, { filename: "js/sfx.js" });
var passed = 0, failed = 0;
function ok(name, condition, evidence) { if (condition) { passed++; console.log("PASS " + name); } else { failed++; console.log("FAIL " + name + "   [" + evidence + "]"); } }
ctx.KSfx.tara();
ok("Ucretsiz kurulumda gercek SFX dosyasi yok", ctx.KSfx.sayisi() === 0, ctx.KSfx.sayisi());
ok("265 Pro SFX kilitli vitrinde gorunur", ctx.KSfx.vitrinSayisi() === 265, ctx.KSfx.vitrinSayisi());
ok("11 SFX koleksiyonu klasor karti olur", ctx.KSfx.vitrinKlasorSayisi() === 11, ctx.KSfx.vitrinKlasorSayisi());
ok("Kilitli SFX karti Pro satis kapisini acar", /card\.onclick\s*=\s*function \(\) \{ Pro\.gate\("sfx"\)/.test(source));
pro = true; ctx.KSfx.tara();
ok("Pro aktifken sanal SFX vitrini gercek icerigin yerini tutmaz", ctx.KSfx.vitrinSayisi() === 0, ctx.KSfx.vitrinSayisi());
var catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "pro-sfx-showcase", "catalog.json"), "utf8"));
ok("Public SFX katalogunda ses dosyasi yolu yok", catalog.folders.length === 11 && catalog.total === 265 && !/\.(wav|mp3|aif|m4a)/i.test(JSON.stringify(catalog)));
console.log("\n" + passed + "/" + (passed + failed) + " gecti");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
process.exit(failed ? 1 : 0);
