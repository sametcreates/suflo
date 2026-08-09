/*
 * Emoji hattı tutarlı mı?
 *
 * Üç ayrı parça birbirini tutmak zorunda: emoji/esleme.json (karakter->dosya),
 * diskteki SVG'ler ve captions.js'teki EMOJI_ARAMA (Türkçe arama sözcükleri).
 * Biri eksikse seçicide boş kare ya da aranamayan emoji çıkar — kullanıcı
 * bunu "bozuk" diye görür. Ayrıca stilli katmanın emoji bekçisi de burada
 * sınanır: libass emoji ÇİZEMİYOR (kanıtlandı), bekçi düşerse emoji sessizce
 * kaybolur.
 */
var fs = require("fs");
var pathm = require("path");

var KOK = pathm.join(__dirname, "..");
var EMOJI = pathm.join(KOK, "emoji");

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 90) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

/* ================= 1) Eşleme <-> disk <-> arama haritası ================= */

var esleme = JSON.parse(fs.readFileSync(pathm.join(EMOJI, "esleme.json"), "utf8"));
var anahtarlar = Object.keys(esleme);
ok("eslemede en az 45 emoji var", anahtarlar.length >= 45, anahtarlar.length);

var kayipDosya = anahtarlar.filter(function (ch) {
  var f = pathm.join(EMOJI, esleme[ch]);
  return !fs.existsSync(f) || fs.statSync(f).size < 100;
});
ok("her eslemenin SVG'si diskte ve dolu", kayipDosya.length === 0,
  kayipDosya.map(function (ch) { return esleme[ch]; }).join(", ") || anahtarlar.length + " dosya");

var src = fs.readFileSync(pathm.join(KOK, "js", "captions.js"), "utf8");
var i0 = src.indexOf("var EMOJI_ARAMA = {");
var i1 = src.indexOf("};", i0);
ok("EMOJI_ARAMA captions.js'te var", i0 !== -1 && i1 !== -1);
var arama = new Function("return (" + src.slice(i0 + "var EMOJI_ARAMA = ".length, i1 + 1) + ");")();

var aramasiz = anahtarlar.filter(function (ch) { return !arama[ch]; });
ok("her emojinin Turkce arama sozcugu var", aramasiz.length === 0,
  aramasiz.join(" ") || Object.keys(arama).length + " kayit");

var karsiliksiz = Object.keys(arama).filter(function (ch) { return !esleme[ch]; });
ok("aramada olup gorseli olmayan emoji yok", karsiliksiz.length === 0, karsiliksiz.join(" ") || "tutarli");

ok("SVG'ler gercekten SVG", anahtarlar.slice(0, 8).every(function (ch) {
  return fs.readFileSync(pathm.join(EMOJI, esleme[ch]), "utf8").indexOf("<svg") !== -1;
}));

ok("LISANS.txt CC-BY atfi tasiyor", (function () {
  var l = fs.readFileSync(pathm.join(EMOJI, "LISANS.txt"), "utf8");
  return l.indexOf("CC-BY") !== -1 && l.indexOf("twemoji") !== -1;
})());

/* ================= 2) Stilli katman bekçisi ================= */

var g0 = src.indexOf("function emojiIceriyorMu(");
var g1 = src.indexOf("\n  }", g0);
ok("emojiIceriyorMu captions.js'te var", g0 !== -1 && g1 !== -1);
var bekci = new Function("segments",
  src.slice(g0, g1 + 4) + "\nreturn emojiIceriyorMu();");

ok("duz metin emoji sayilmiyor", bekci([{ text: "merhaba dunya" }]) === false);
ok("Turkce karakterler emoji sayilmiyor", bekci([{ text: "ığüşöçİĞÜŞÖÇ" }]) === false);
ok("astral emoji yakalaniyor (🔥)", bekci([{ text: "bugun 🔥 gunu" }]) === true);
ok("gulme yakalaniyor (😂)", bekci([{ text: "cok komik 😂" }]) === true);
ok("BMP sembol yakalaniyor (⚡)", bekci([{ text: "hizli ⚡" }]) === true);
ok("tik yakalaniyor (✅)", bekci([{ text: "tamam ✅" }]) === true);
ok("bos liste guvenli", bekci([]) === false);
ok("null metin guvenli", bekci([{ text: null }]) === false);

// bekçi overlayUygula'nın BAŞINDA mı? (render başladıktan sonra durdurmak geç)
var ovIdx = src.indexOf("async function overlayUygula(");
var bekciCagri = src.indexOf("emojiIceriyorMu()", ovIdx);
var renderBasladi = src.indexOf("KS_overlaySpec", ovIdx);
ok("bekci overlayUygula'da render'dan ONCE cagriliyor",
  ovIdx !== -1 && bekciCagri !== -1 && bekciCagri < renderBasladi,
  "guard@" + bekciCagri + " render@" + renderBasladi);

/*
 * Eski-CEF tuzağı: /u bayrakli veya \p{...} iceren regex panelin CEF'inde
 * SÖZDİZİMİ hatasıyla çökmüştü (yaşandı). Emoji kodunda ikisi de yasak.
 */
var emojiBolgesi = src.slice(src.indexOf("EMOJI_ARAMA"), src.indexOf("function initEmoji"));
ok("emoji kodunda \\p{...} yok", emojiBolgesi.indexOf("\\p{") === -1);
ok("emoji kodunda /u bayragi yok", !/\/[^\/\n]*\/[a-z]*u[a-z]*[\s,;.)]/.test(emojiBolgesi));

/* ================= 3) Paket listeleri emoji klasorunu tasiyor ================= */

["tools/package.ps1", "tools/kurucu-yap.ps1", "tools/install.ps1", "tools/install.sh"]
  .forEach(function (f) {
    var icerik = fs.readFileSync(pathm.join(KOK, f), "utf8");
    ok(f + " 'emoji' klasorunu paketliyor", /["' ]emoji["' ]/.test(icerik));
  });

console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
process.exit(kaldi ? 1 : 0);
