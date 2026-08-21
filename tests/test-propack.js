/*
 * Suflo Pro Paketi (Model A) — icerik eklentiyle GELMEZ; satin alan Lemon
 * Squeezy'den indirdigi paketi gosterir, plugin onu ek kaynak olarak tarar.
 * Bu test: proPackKlasor ayarlaninca hem MOGRT hem SFX gelir, "SUFLO PRO"
 * olarak isaretlenir, mogrt/ ve sfx/ alt klasorleri algilanir; ayar kalkinca
 * kutuphaneler bosalir (icerik gercekten pakete baglidir).
 */
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..").split("\\").join("/") + "/";
var TMP = path.join(os.tmpdir(), "suflo-propack-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
var PACK = path.join(TMP, "Suflo Pro Pack");
fs.mkdirSync(path.join(PACK, "mogrt"), { recursive: true });
fs.mkdirSync(path.join(PACK, "sfx"), { recursive: true });
var EXT = path.join(TMP, "extension");
fs.mkdirSync(path.join(EXT, "content", "mogrt"), { recursive: true }); // bos builtin: icerik gomulu degil
fs.writeFileSync(path.join(PACK, "mogrt", "SUFLO TEXT - Karaoke Pro.mogrt"), "mogrt");
fs.writeFileSync(path.join(PACK, "mogrt", "SUFLO TEXT - Pop Pro.mogrt"), "mogrt");
fs.writeFileSync(path.join(PACK, "sfx", "whoosh-pro.wav"), "wav");
fs.writeFileSync(path.join(PACK, "sfx", "impact-pro.mp3"), "mp3");

var g = 0, k = 0;
function ok(a, c, kanit) {
  if (c) { g++; console.log("PASS " + a + (kanit !== undefined ? "   [" + kanit + "]" : "")); }
  else { k++; console.log("FAIL " + a + "   [" + String(kanit).slice(0, 200) + "]"); }
}
function walkAudio(dir, limit, depth) {
  var out = []; if (depth < 0) return out; var e = [];
  try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch (x) { return out; }
  e.forEach(function (en) {
    if (out.length >= limit || en.name.charAt(0) === ".") return;
    var full = path.join(dir, en.name);
    if (en.isDirectory()) out = out.concat(walkAudio(full, limit - out.length, depth - 1));
    else if (/\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i.test(en.name)) out.push(full);
  });
  return out;
}
var settings = { proPackKlasor: PACK, sfxFavs: [], sfxRecent: [] };
var ctx = {
  console: console, Promise: Promise, Buffer: Buffer, setTimeout: setTimeout, clearTimeout: clearTimeout,
  document: { getElementById: function () { return null; }, querySelectorAll: function () { return []; } },
  Audio: function () { this.pause = function () {}; this.play = function () { return Promise.resolve(); }; },
  K: {
    nodeOK: true, fs: fs, path: path, os: os,
    settingsPath: function () { return path.join(TMP, "settings.json"); },
    extensionPath: function () { return EXT; },
    settings: function () { return settings; }, saveSettings: function () { return true; },
    walkAudio: walkAudio, unzip: function () { return Promise.reject(new Error("no")); }, log: function () {}
  }
};
ctx.window = ctx; vm.createContext(ctx);

async function run() {
  var libSrc = fs.readFileSync(KOK + "js/library.js", "utf8");
  vm.runInContext(libSrc, ctx, { filename: "js/library.js" });
  await ctx.KLib.tara();
  ok("Pro pack MOGRT'lari mogrt/ alt klasorunden bulunuyor", ctx.KLib.sayisi() === 2, "sayi=" + ctx.KLib.sayisi());
  ok("Pro pack animasyonlari Yazi Animasyonlari'na (text) gidiyor", ctx.KLib.yaziSayisi() === 2, "yazi=" + ctx.KLib.yaziSayisi());
  ok("Pro pack builtin sayilmiyor (yerlesik=0)", ctx.KLib.yerlesikSayisi() === 0, ctx.KLib.yerlesikSayisi());

  var sfxSrc = fs.readFileSync(KOK + "js/sfx.js", "utf8");
  vm.runInContext(sfxSrc, ctx, { filename: "js/sfx.js" });
  ctx.KSfx.tara();
  ok("Pro pack SFX'leri sfx/ alt klasorunden bulunuyor", ctx.KSfx.sayisi() === 2, "sayi=" + ctx.KSfx.sayisi());

  var healthSrc = fs.readFileSync(KOK + "js/library-health.js", "utf8");
  vm.runInContext(healthSrc, ctx, { filename: "js/library-health.js" });
  var rapor = ctx.KLibraryHealth.makeReport();
  ok("Saglik kontrolu Pro paketi kaynagini iceriyor",
    rapor.mogrt.count === 2 && rapor.sfx.count === 2,
    "mogrt=" + rapor.mogrt.count + " sfx=" + rapor.sfx.count);

  // Icerik pakete baglidir: ayar kalkinca kutuphaneler bosalir (gomulu degil).
  settings.proPackKlasor = "";
  await ctx.KLib.tara(); ctx.KSfx.tara();
  ok("Paket kaldirilinca MOGRT bosaliyor (icerik gomulu degil)", ctx.KLib.sayisi() === 0, ctx.KLib.sayisi());
  ok("Paket kaldirilinca SFX bosaliyor", ctx.KSfx.sayisi() === 0, ctx.KSfx.sayisi());

  // Kaynak dosyalar Model A akisini iceriyor
  ok("library.js proPackKlasor okuyor", /proPackKlasor/.test(libSrc));
  ok("sfx.js proPackKlasor okuyor", /proPackKlasor/.test(sfxSrc));
  var appSrc = fs.readFileSync(KOK + "js/app.js", "utf8");
  ok("app.js Pro paketi yukleyicisi (native secici + Pro kapisi) iceriyor",
    /proPakYukle/.test(appSrc) && /showOpenDialogEx/.test(appSrc) && /Pro\.gate\("propack"\)/.test(appSrc));
  ok("app.js paketteki emoji/ klasorunu Emoji Assets'e otomatik bagliyor",
    /emojiAssetsPackAuto/.test(appSrc) && /K\.path\.join\(yol, "emoji"\)/.test(appSrc));
  ok("Paket kaldirilinca otomatik emoji baglantisi da temizleniyor",
    /s\.emojiAssetsPackAuto\) \{[\s\S]{0,200}emojiAssetsKlasor = ""/.test(appSrc));
  var html = fs.readFileSync(KOK + "index.html", "utf8");
  ok("Ayarlarda otomatik Pro icerik esitleme ve elle paket yedegi var",
    /id="set-prosync-run"/.test(html) && /Pro İçerik Bulutu/.test(html) && /id="set-propack-yukle"/.test(html));
  ["tools/package.ps1", "tools/kurucu-yap.ps1"].forEach(function (file) {
    var paketSrc = fs.readFileSync(KOK + file, "utf8");
    ok(file + " ucretli content/ klasorunu public pakete ekleyemez",
      /SUFLO_BUNDLE_CONTENT desteklenmiyor/.test(paketSrc) && !/stageItems \+= "content"|panelItems \+= "content"/.test(paketSrc));
  });

  console.log("\n" + g + "/" + (g + k) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(k ? 1 : 0);
}
run().catch(function (e) {
  console.log("FAIL test kosumu   [" + (e && e.stack ? e.stack : e) + "]");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
