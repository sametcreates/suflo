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

/* ================= 3) Tam katalog (v2.3): 3770 emoji + kategoriler ================= */

var katalog = JSON.parse(fs.readFileSync(pathm.join(EMOJI, "katalog.json"), "utf8"));
ok("katalogda 3500+ emoji var", katalog.emojiler.length >= 3500, katalog.emojiler.length);
ok("9 kategori tanimli", katalog.kategoriler.length === 9, katalog.kategoriler.join(", "));
ok("sheet URL jsdelivr'de ve apple seti", /cdn\.jsdelivr\.net.*emoji-datasource-apple.*64\.png/.test(katalog.sheet.url), katalog.sheet.url);

var bozukGiris = katalog.emojiler.filter(function (e) {
  return !e.c || typeof e.n !== "string" || typeof e.g !== "number" ||
    e.g < 0 || e.g > 8 || typeof e.x !== "number" || typeof e.y !== "number" ||
    e.x < 0 || e.x > 80 || e.y < 0 || e.y > 80;
});
ok("her girisin karakter/ad/kategori/koordinati gecerli", bozukGiris.length === 0,
  bozukGiris.length ? JSON.stringify(bozukGiris[0]) : katalog.emojiler.length + " giris");

var atesler = katalog.emojiler.filter(function (e) { return e.n.indexOf("fire") !== -1; });
ok("katalogda 'fire' (ates) bulunuyor", atesler.length >= 1, atesler.length);
ok("kalp aramasi karsiligi var", katalog.emojiler.some(function (e) { return e.n.indexOf("heart") !== -1; }));
ok("bayrak kategorisi dolu", katalog.emojiler.some(function (e) { return e.g === 8; }));

// TR arama koprusu captions.js'te tanimli ve temel sozcukler esliyor
var t0 = src.indexOf("var EMOJI_TR = {");
var t1 = src.indexOf("};", t0);
ok("EMOJI_TR koprusu captions.js'te var", t0 !== -1 && t1 !== -1);
var kopru = new Function("return (" + src.slice(t0 + "var EMOJI_TR = ".length, t1 + 1) + ");")();
["ates", "kalp", "para", "gulme", "kopek", "bayrak"].forEach(function (k) {
  ok("TR koprusu '" + k + "' -> '" + (kopru[k] || "YOK") + "'", !!kopru[k]);
});

// eski-CEF tuzagi: yeni emoji kodunda da \p{...} ve /u yasak (bolge buyudu)
var yeniBolge = src.slice(src.indexOf("var EMOJI_TR"), src.indexOf("function initEmoji"));
ok("yeni emoji kodunda \\p{...} yok", yeniBolge.indexOf("\\p{") === -1);

/* ================= 4) Paket listeleri emoji klasorunu tasiyor ================= */

["tools/package.ps1", "tools/kurucu-yap.ps1", "tools/install.ps1", "tools/install.sh"]
  .forEach(function (f) {
    var icerik = fs.readFileSync(pathm.join(KOK, f), "utf8");
    ok(f + " 'emoji' klasorunu paketliyor", /["' ]emoji["' ]/.test(icerik));
  });

console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
process.exit(kaldi ? 1 : 0);
