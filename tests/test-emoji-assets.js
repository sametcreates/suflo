var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/* Pro Emoji Assets: tarama, ad temizligi, lisans kapisi ve timeline koprusu. */
var fs = require("fs");
var os = require("os");
var path = require("path");
var vm = require("vm");

var TMP = path.join(os.tmpdir(), "suflo-emoji-assets-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(path.join(TMP, "nested"), { recursive: true });
fs.mkdirSync(path.join(TMP, ".hidden"), { recursive: true });
fs.writeFileSync(path.join(TMP, "Alien Emoji [Free Download IOS Emojis].png"), "png");
fs.writeFileSync(path.join(TMP, "nested", "airplane_2708-fe0f.webp"), "webp");
fs.writeFileSync(path.join(TMP, "nested", "party-loop.gif"), "gif");
fs.writeFileSync(path.join(TMP, "nested", "ignore.txt"), "txt");
fs.writeFileSync(path.join(TMP, ".hidden", "secret.png"), "hidden");

var passed = 0, failed = 0;
function ok(name, condition, proof) {
  if (condition) { passed++; console.log("PASS " + name + (proof !== undefined ? "   [" + proof + "]" : "")); }
  else { failed++; console.log("FAIL " + name + "   [" + String(proof).slice(0, 200) + "]"); }
}

function walkVisual(dir, limit, depth) {
  var out = [];
  if (depth < 0) return out;
  var entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.forEach(function (entry) {
    if (out.length >= limit || entry.name.charAt(0) === ".") return;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walkVisual(full, limit - out.length, depth - 1));
    else if (/\.(png|webp|gif|jpe?g)$/i.test(entry.name)) out.push(full);
  });
  return out;
}

var settings = { emojiAssetsKlasor: TMP, emojiAssetFavs: [], emojiAssetRecent: [] };
var ctx = {
  console: console,
  Promise: Promise,
  Math: Math,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  document: { getElementById: function () { return null; } },
  K: {
    nodeOK: true, fs: fs, path: path, os: os,
    settingsPath: function () { return path.join(TMP, "settings.json"); },
    settings: function () { return settings; },
    saveSettings: function () { return true; },
    walkVisual: walkVisual
  }
};
ctx.window = ctx;
vm.createContext(ctx);

var src = fs.readFileSync(KOKYOL + "js/emoji-assets.js", "utf8");
vm.runInContext(src, ctx, { filename: "js/emoji-assets.js" });
ctx.KEmojiAssets.tara();

ok("PNG, WEBP ve GIF derin klasorden bulunuyor", ctx.KEmojiAssets.sayisi() === 3, ctx.KEmojiAssets.sayisi());
var names = ctx.KEmojiAssets.adlar();
ok("Free Download / IOS site etiketi kart adindan siliniyor", names.indexOf("Alien Emoji") !== -1, names.join(" | "));
ok("Unicode kodu dosya adindan temizleniyor", names.indexOf("Airplane") !== -1, names.join(" | "));
ok("Gizli klasor ve desteklenmeyen dosya atlanir", names.every(function (n) { return !/secret|ignore/i.test(n); }), names.join(" | "));
ok("Emoji Assets UCRETSIZDIR — Pro kapisi yok (Samet karari 20 Agu)", !/Pro\.gate\("emojiAssets"\)/.test(src) && /UCRETSIZDIR/.test(src));
ok("WEBP yalniz yerelde ffmpeg ile PNG olur", /item\.format !== "WEBP"/.test(src) && /"-frames:v", "1"/.test(src));
ok("Kartlarda buyuk onizleme, DRAG ve LOCKED durumlari var", /<span>LOCKED<\/span>/.test(src) && /"DRAG"/.test(src) && /mogrt-thumb/.test(src));
ok("Favori ve son kullanilanlar ayarlarda kalicidir", /emojiAssetFavs/.test(src) && /emojiAssetRecent/.test(src));

var bridge = fs.readFileSync(KOKYOL + "js/bridge.js", "utf8");
ok("Ortak gorsel tarayici PNG WEBP GIF destekliyor", /function walkVisual\(/.test(bridge) && /VISUAL_EXT/.test(bridge));
var host = fs.readFileSync(KOKYOL + "jsx/host.jsx", "utf8");
ok("Emoji playhead'e guvenli bos video katmaniyla ekleniyor", /function KS_placeGraphic\(/.test(host) && /KS_findFreeVideoTrack\(seq, start, start \+ kontrolDur\)/.test(host));
ok("Hareketli GIF kendi suresini koruyabilir", /p\.keepDuration && medyaDur > 0/.test(host));
var graphicFn = host.slice(host.indexOf("function KS_placeGraphic("), host.indexOf("/* ---------- Yazi kutuphanesi"));
var motionBgFn = host.slice(host.indexOf("function KS_placeMotionBG("), host.indexOf("function KS_placeMotionBG(") + 2600);
ok("Emoji/grafik basari donusu tanimsiz Motion BG degiskeni kullanmiyor",
  !/sesSilindi/.test(graphicFn), graphicFn.match(/return KS_ok\([^\n]+/) || "return yok");
ok("Motion BG kaldirdigi bagli ses sayisini panele donduruyor",
  /sesSilindi:\s*sesSilindi/.test(motionBgFn), motionBgFn.match(/return KS_ok\([^\n]+/) || "return yok");

var html = fs.readFileSync(KOKYOL + "index.html", "utf8");
ok("Emoji Assets sekmesi, ayari ve betigi arayuzde", /id="tab-emoji-assets"/.test(html) && /id="set-emoji-assets-klasor"/.test(html) && /src="js\/emoji-assets\.js"/.test(html));
var readme = fs.readFileSync(KOKYOL + "README.md", "utf8");
ok("Ucretsiz Unicode secici ile Pro yerel asset akisi acikca ayriliyor", /Unicode emoji seçici/.test(readme) && /Emoji Assets/.test(readme));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
process.exit(failed ? 1 : 0);
