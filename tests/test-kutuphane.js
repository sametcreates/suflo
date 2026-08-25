var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * MOGRT ve SFX kutuphaneleri gercek kaynak koddan calistirilir.
 * Derin klasor taramasi ile Pro timeline koprusunun kaybolmasini yakalar.
 */
var fs = require("fs");
var os = require("os");
var path = require("path");
var vm = require("vm");

var TMP = path.join(os.tmpdir(), "suflo-kutuphane-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(path.join(TMP, "deep", "one", "two", "three"), { recursive: true });
fs.mkdirSync(path.join(TMP, ".hidden"), { recursive: true });
fs.mkdirSync(path.join(TMP, "Text Effects"), { recursive: true });
fs.mkdirSync(path.join(TMP, "Logo"), { recursive: true });
fs.mkdirSync(path.join(TMP, "Adobe", "Common", "Motion Graphics Templates", "Captioneer", "Landscape"), { recursive: true });
var EXT = path.join(TMP, "extension");
var BUILTIN = path.join(EXT, "content", "mogrt");
fs.mkdirSync(BUILTIN, { recursive: true });
fs.writeFileSync(path.join(BUILTIN, "SUFLO TEXT - 01 Built In Test.mogrt"), Buffer.from("PK\x03\x04builtin-mogrt"));
fs.writeFileSync(path.join(BUILTIN, "catalog.json"), JSON.stringify({ items: [
  { file: "SUFLO TEXT - 01 Built In Test.mogrt", source: "root.mogrt", name: "Built In Test", category: "Test" }
] }));
fs.writeFileSync(path.join(TMP, "root.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "deep", "one", "two", "three", "nested.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "Text Effects", "Kid Style.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "Text Effects", "Lower Third Social.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "Logo", "Logo Intro.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "Adobe", "Common", "Motion Graphics Templates", "Captioneer", "Landscape", "16-9 Mr Beast Subtitles.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "Adobe", "Common", "Motion Graphics Templates", "Captioneer", "Landscape", "16-9 Clean Pop Subtitles.mogrt"), "mogrt");
for (var eskiNo = 1; eskiNo <= 5; eskiNo++) {
  fs.writeFileSync(path.join(TMP, "Adobe", "Common", "Motion Graphics Templates", "Subtitle 0" + eskiNo + ".mogrt"), "broken-mogrt");
}
fs.writeFileSync(path.join(TMP, ".hidden", "skip.mogrt"), "mogrt");
fs.writeFileSync(path.join(TMP, "deep", "one", "hit.wav"), "wav");
fs.writeFileSync(path.join(TMP, "deep", "one", "two", "whoosh.mp3"), "mp3");
fs.writeFileSync(path.join(TMP, "deep", "ignore.txt"), "txt");

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + kanit + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

function walkAudio(dir, limit, depth) {
  var out = [];
  if (depth < 0) return out;
  var entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.forEach(function (entry) {
    if (out.length >= limit || entry.name.charAt(0) === ".") return;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walkAudio(full, limit - out.length, depth - 1));
    else if (/\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i.test(entry.name)) out.push(full);
  });
  return out;
}

var settings = { mogrtEkKlasor: TMP, sfxEkKlasor: TMP, sfxFavs: [], sfxRecent: [] };
var captionStyles = [];
var ctx = {
  console: console,
  Promise: Promise,
  Buffer: Buffer,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  document: {
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; }
  },
  Audio: function () {
    this.pause = function () {};
    this.play = function () { return Promise.resolve(); };
  },
  KCaptions: {
    refreshMogrtStyles: function (items) { captionStyles = items || []; }
  },
  K: {
    nodeOK: true,
    fs: fs, path: path, os: os,
    settingsPath: function () { return path.join(TMP, "Kesit", "settings.json"); },
    extensionPath: function () { return EXT; },
    settings: function () { return settings; },
    saveSettings: function () { return true; },
    walkAudio: walkAudio,
    unzip: function () { return Promise.reject(new Error("test mogrt zip degil")); },
    log: function () {}
  }
};
ctx.window = ctx;
vm.createContext(ctx);

async function run() {
  var libSrc = fs.readFileSync(KOKYOL + "js/library.js", "utf8");
  vm.runInContext(libSrc, ctx, { filename: "js/library.js" });
  await ctx.KLib.tara();
  ok("MOGRT taramasi derin klasore ve Premiere Graphic Templates'e iniyor", ctx.KLib.hariciSayisi() === 6, ctx.KLib.hariciSayisi());
  ok("Paketle gelen Suflo Originals otomatik taraniyor", ctx.KLib.yerlesikSayisi() === 1, ctx.KLib.yerlesikSayisi());
  ok("Vault'taki Suflo Original kopyasi ikinci kart olmuyor", ctx.KLib.sayisi() === 7, ctx.KLib.sayisi());
  ok("Saf text efektleri Yazi Animasyonlari'na gider",
    ctx.KLib.yaziSayisi() === 2, "yazi=" + ctx.KLib.yaziSayisi());
  ok("Logo, lower third ve genel MOGRT'lar Diger Animasyonlar'a gider",
    ctx.KLib.digerSayisi() === 3, "diger=" + ctx.KLib.digerSayisi());
  ok("Captioneer Graphic Templates ayri Altyazi Sablonlari grubuna gider",
    ctx.KLib.altyaziSayisi() === 2, "altyazi=" + ctx.KLib.altyaziSayisi());
  ok("Eski Subtitle 01-05 kartlari Suflo listesinden guvenle gizlenir",
    ctx.KLib.altyaziStilleri().every(function (item) { return !/^Subtitle\s+0[1-5]$/i.test(item.ad); }),
    ctx.KLib.altyaziStilleri().map(function (item) { return item.ad; }).join(", "));
  ok("Altyazi sablonlari Stil bolumundeki gercek MOGRT motoruna aktarilir",
    captionStyles.length === 2, captionStyles.length);

  var sfxSrc = fs.readFileSync(KOKYOL + "js/sfx.js", "utf8");
  vm.runInContext(sfxSrc, ctx, { filename: "js/sfx.js" });
  ctx.KSfx.tara();
  ok("SFX taramasi WAV ve MP3 dosyalarini derinden buluyor", ctx.KSfx.sayisi() === 2, ctx.KSfx.sayisi());
  ok("SFX dosyalari klasor kategorilerine ayriliyor", ctx.KSfx.klasorSayisi() === 1, ctx.KSfx.klasorSayisi());
  var oneriler = ctx.KSfx.oneriler([{ start: 4.2, end: 5.6, text: "Ama şimdi asıl noktaya gelelim!" }]);
  ok("Akilli SFX altyazi vurgusundan eslesen ses oneriyor",
    oneriler.length === 1 && oneriler[0].item && /whoosh/i.test(oneriler[0].item.name),
    oneriler.length ? (oneriler[0].rule.id + " -> " + (oneriler[0].item && oneriler[0].item.name)) : "onerisiz");
  ok("Smart SFX 2.0 guven puani ve alternatif listesini dondurur",
    oneriler.length === 1 && oneriler[0].confidence > 0 && Array.isArray(oneriler[0].alternatives),
    oneriler.length ? "guven=" + oneriler[0].confidence : "onerisiz");
  var cokVurgu = [];
  for (var vi = 0; vi < 35; vi++) cokVurgu.push({ start: vi * 3, end: vi * 3 + 1, text: "Ama şimdi sonraki adıma geçiyoruz" });
  ok("Smart SFX 2.0 Sade yogunlukta timeline'i sese bogmaz",
    ctx.KSfx.oneriler(cokVurgu, { density: "soft" }).length === 8,
    ctx.KSfx.oneriler(cokVurgu, { density: "soft" }).length);

  var healthSrc = fs.readFileSync(KOKYOL + "js/library-health.js", "utf8");
  vm.runInContext(healthSrc, ctx, { filename: "js/library-health.js" });
  var saglik = ctx.KLibraryHealth.makeReport();
  ok("Kutuphane saglik kontrolu MOGRT ve SFX sayilarini raporluyor",
    saglik.mogrt.count === 13 && saglik.sfx.count === 2,
    "mogrt=" + saglik.mogrt.count + " sfx=" + saglik.sfx.count + " durum=" + saglik.status);
  ok("Kutuphane saglik raporu kopyalanabilir metin uretiyor",
    /MOGRT: 13 dosya/.test(ctx.KLibraryHealth.reportText(saglik)));
  ok("Suflo Doctor geriye uyumlu kutuphane API'sini koruyor",
    ctx.KDoctor === ctx.KLibraryHealth && /Suflo Doctor raporu/.test(ctx.KDoctor.reportText(saglik)));

  // Icerik paketi OPSIYONELDIR: mekanizma test edilir, payload dayatilmaz.
  // (Resmi pakete yalniz dagitim hakki dogrulanmis dosyalar girer.)
  var katalogYolu = KOKYOL + "content/mogrt/catalog.json";
  if (fs.existsSync(katalogYolu)) {
    var catalog = JSON.parse(fs.readFileSync(katalogYolu, "utf8"));
    var shipped = fs.readdirSync(KOKYOL + "content/mogrt").filter(function (f) { return /\.mogrt$/i.test(f); });
    ok("Icerik katalogu gecerli JSON + items dizisi", Array.isArray(catalog.items));
    ok("Yazi Animasyonlari tam 40 secilmis Suflo Original iceriyor",
      catalog.items.length === 40 && shipped.length === 40,
      "katalog=" + catalog.items.length + " dosya=" + shipped.length);
    ok("Katalogdaki her dosya pakette gercekten var",
      catalog.items.every(function (item) { return shipped.indexOf(item.file) !== -1; }),
      "katalog=" + catalog.items.length + " dosya=" + shipped.length);
  } else {
    ok("Icerik paketi yok — katalog mekanizmasi bos durumda sorunsuz", true, "opsiyonel");
  }

  var host = fs.readFileSync(KOKYOL + "jsx/host.jsx", "utf8");
  ok("SFX playhead koprusu var", /function KS_insertSfx\(/.test(host));
  ok("SFX bos audio katmanini tum sure icin kontrol ediyor",
    /KS_findFreeAudioTrack\(seq, start, start \+ dur\)/.test(host));
  ok("Akilli SFX altyazi zamanini host'a iletebiliyor",
    /var start = Number\(p\.time\)/.test(host));
  ok("SFX yerlestirme guvenli ortak makineyi kullaniyor",
    /KS_tryPlace\(seq\.audioTracks\[idx\], item, start\)/.test(host));

  var html = fs.readFileSync(KOKYOL + "index.html", "utf8");
  ok("SFX Pro sekmesi ve betigi yuklu",
    /id="tab-sfx"/.test(html) && /src="js\/sfx\.js"/.test(html));
  ok("Smart SFX 2.0 yogunluk, toplu ekleme ve kalici dalga oynaticisi tasir",
    /Smart SFX 2\.0/.test(html) && /id="sfx-smart-density"/.test(html) &&
    /id="sfx-smart-add-all"/.test(html) && /id="sfx-waveform"/.test(html));
  ok("SFX klasor tarayicisi giris ve geri donus arayuzuyle hazir",
    /id="sfx-folder-browser"/.test(html) && /id="sfx-folder-back"/.test(html));
  ok("SFX motoru kurulumla gelen paketi otomatik tarar", /content["'],\s*["']sfx/.test(sfxSrc));
  ok("Suflo Doctor arayuzde, guvenli onarimla ve geriye uyumlu betikle yuklu",
    /Suflo Doctor/.test(html) && /id="set-doctor-fix-all"/.test(html) && /id="set-library-health-run"/.test(html) && /src="js\/library-health\.js"/.test(html));
  ok("Suflo Doctor gercek marka amblemi ve kompakt tarama arayuzu kullaniyor",
    /id="doctor-mark-gradient"/.test(html) && /class="btn primary doctor-scan"/.test(html) &&
    /class="doctor-scope"/.test(html) && !/class="doctor-badge"/.test(html));
  ok("Harici MOGRT'lar Yazi Animasyonlari'ndan ayri bolumde",
    /data-kat="custom"/.test(html) && /Diğer Animasyonlar/.test(html) && /id="custom-sayac"/.test(html));
  ok("Premiere altyazi MOGRT'lari ayri bolumde gorunur",
    /data-kat="captions"/.test(html) && /Altyazı Şablonları/.test(html) && /id="caption-sayac"/.test(html));
  ok("Altyazi Sablonlari menude acikca Pro olarak isaretli",
    /data-kat="captions"[\s\S]*?Altyazı Şablonları[\s\S]*?class="ky-kilit" data-kilit>PRO<[\s\S]*?id="caption-sayac"/.test(html));
  ok("Stil bolumu gercek Premiere altyazi sablonlariyla acik",
    /class="card stil-katmani-card"/.test(html) &&
    /17 gerçek altyazı şablonundan birini seç/.test(html) &&
    !/class="card stil-katmani-card" hidden/.test(html));
  var css = fs.readFileSync(KOKYOL + "css/style.css", "utf8");
  ok("MOGRT kartlari buyuk, kirpilmayan profesyonel onizleme kullaniyor",
    /#tab-text \.mogrt-grid\s*\{[^}]*minmax\(300px,\s*1fr\)/s.test(css) && /object-fit:\s*contain/.test(css));
  ok("Emoji kartlari MOGRT kartlarindan daha kompakt",
    /\.emoji-assets-grid\s*\{[^}]*minmax\(124px,\s*1fr\)/s.test(css));
  ok("SFX ana ekrani uzun liste yerine klasor kartlari kullaniyor",
    /\.sfx-folder-browser\s*\{[^}]*display:\s*grid/s.test(css) && /renderFolderBrowser/.test(sfxSrc));
  ok("MOGRT kartlarinda DRAG ve LOCKED durumlari acik",
    /<span>DRAG<\/span>/.test(libSrc) && /<span>LOCKED<\/span>/.test(libSrc) && /mogrt-lock/.test(libSrc));
  ok("Aktif MOGRT karti suruklenince playhead'e yerlestiriliyor",
    /setAttribute\("draggable",\s*"true"\)/.test(libSrc) && /addEventListener\("dragend"/.test(libSrc));
  ok("MOGRT adlari thumbnail islemini beklemeden ekrana ciziliyor",
    /sayaclar\(\);\s*ciz\(\);\s*altyaziStilleriniGonder\(\);\s*\n\s*for \(var qi/.test(libSrc));
  ok("Stil bolumu Captioneer MOGRT listesini kutuphaneden canli aliyor",
    /refreshMogrtStyles:\s*refreshMogrtStyles/.test(fs.readFileSync(KOKYOL + "js/captions.js", "utf8")) &&
    /window\.KCaptions\.refreshMogrtStyles/.test(libSrc));
  ok("Altyazi sablonlari Pro kapisindan gecmeden timeline'a gitmiyor",
    /if \(typeof Pro !== "undefined" && !Pro\.gate\("mogrt"\)\) return;/.test(libSrc));

  var pro = fs.readFileSync(KOKYOL + "js/pro.js", "utf8");
  ok("SFX lisans kapisinda Pro ozelligi", /sfx:\s*'SFX kutuphanesi/.test(pro));

  console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(kaldi ? 1 : 0);
}

run().catch(function (e) {
  console.log("FAIL test kosumu   [" + (e && e.stack ? e.stack : e) + "]");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
