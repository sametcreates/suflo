var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * JS'in dokunduğu her öğe index.html'de gerçekten var mı?
 *
 * Bu test gerçek bir olaydan doğdu: modül temizliğinde Ayarlar'daki "Destek"
 * bölümü yanlışlıkla silindi. Panel açıldı, hiçbir konsol hatası vermedi,
 * yalnızca en altta "ayarlar bölümü yüklenemedi" yazdı — çünkü init'i saran
 * güvenli() sarmalayıcısı hatayı yutuyor. Yani "Sorun bildir" düğmesi
 * tamamen kayboldu ve testlerin hiçbiri bunu yakalamadı.
 *
 * addEventListener bir null üzerinde çağrılırsa o init bloğunun GERİ KALANI
 * da çalışmaz; tek eksik id bütün bir ayar bölümünü sessizce düşürür.
 */
var fs = require("fs");

var html = fs.readFileSync(KOKYOL + "index.html", "utf8");
var idler = {};
(html.match(/id="[^"]+"/g) || []).forEach(function (m) {
  idler[m.slice(4, -1)] = true;
});

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit ? "   [" + String(kanit).slice(0, 80) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

var DOSYALAR = ["js/app.js", "js/captions.js", "js/engine.js", "js/bridge.js",
                "js/library.js", "js/presets.js", "js/sfx.js", "js/emoji-assets.js", "js/library-health.js", "js/pro-sync.js"];

/* ---------- 1) el("...") ile aranan her id markup'ta var mı ---------- */

var eksikler = [];
DOSYALAR.forEach(function (d) {
  var src = fs.readFileSync(KOKYOL + d, "utf8");
  var re = /\bel\("([a-zA-Z0-9_-]+)"\)/g, m;
  var gorulen = {};
  while ((m = re.exec(src)) !== null) {
    var id = m[1];
    if (gorulen[id]) continue;
    gorulen[id] = true;
    if (!idler[id]) eksikler.push(d + " -> #" + id);
  }
});
ok("el() ile aranan tum id'ler index.html'de var",
  eksikler.length === 0, eksikler.length ? eksikler.join(" | ") : "hepsi yerinde");

/* ---------- 2) getElementById ile aranan id'ler ---------- */

var eksik2 = [];
DOSYALAR.forEach(function (d) {
  var src = fs.readFileSync(KOKYOL + d, "utf8");
  var re = /getElementById\("([a-zA-Z0-9_-]+)"\)/g, m;
  while ((m = re.exec(src)) !== null) {
    if (!idler[m[1]]) eksik2.push(d + " -> #" + m[1]);
  }
});
ok("getElementById ile aranan id'ler var", eksik2.length === 0,
  eksik2.length ? eksik2.join(" | ") : "hepsi yerinde");

/*
 * 3) KORUMASIZ addEventListener: el("x").addEventListener(...) biçiminde,
 * yani öğe yoksa TypeError atıp o init bloğunu düşürecek çağrılar.
 * Bunlar en kritik olanlar — id silinirse özellik sessizce kaybolur.
 */
var korumasiz = [];
DOSYALAR.forEach(function (d) {
  var src = fs.readFileSync(KOKYOL + d, "utf8");
  var re = /\bel\("([a-zA-Z0-9_-]+)"\)\.addEventListener/g, m;
  while ((m = re.exec(src)) !== null) {
    if (!idler[m[1]]) korumasiz.push(d + " -> #" + m[1]);
  }
});
ok("korumasiz addEventListener hedefleri markup'ta var",
  korumasiz.length === 0, korumasiz.length ? korumasiz.join(" | ") : "tamam");

/* ---------- 4) Vazgeçilmez öğeler: silinirse ürün işlevini kaybeder ---------- */

var ZORUNLU = {
  "cap-go": "Altyazı oluştur düğmesi",
  "cap-apply": "Sekansa uygula",
  "cap-overlay": "Stilli katman olarak ekle",
  "cap-save": "Dışa aktar",
  "cap-segments": "Altyazı listesi",
  "cap-lang": "Dil seçimi",
  "cap-maxlen": "Satır uzunluğu / karaoke",
  "cap-preset": "Şablon",
  "set-report": "Sorun bildir (geri bildirim kanalı)",
  "set-copy-log": "Günlüğü kopyala",
  "set-provider": "Motor seçimi",
  "set-ffmpeg-install": "ffmpeg kur",
  "tab-captions": "Altyazı görünümü",
  "tab-settings": "Ayarlar görünümü",
  "update-bar": "Güncelleme şeridi",
  // v2.2: kesim geri geldi + ritim + emoji
  "tab-cut": "Kesim görünümü",
  "cut-analyze": "Sessizlik analizi",
  "cut-apply": "Kesimleri uygula",
  "cut-noise": "Gürültü eşiği",
  "tab-beat": "Ritim görünümü",
  "beat-analyze": "Ritmi bul",
  "beat-apply": "Marker at",
  "beat-bant": "Bant seçimi",
  "beat-siklik": "Marker sıklığı",
  "tab-sfx": "SFX görünümü",
  "sfx-smart-btn": "Akıllı SFX önerileri",
  "sfx-smart-list": "Akıllı SFX listesi",
  "tab-emoji-assets": "Emoji Assets görünümü",
  "emoji-assets-grid": "Emoji Assets kartları",
  "emoji-assets-search": "Emoji Assets arama",
  "set-emoji-assets-klasor": "Emoji Assets klasör ayarı",
  "set-library-health-run": "Kütüphane sağlık kontrolü",
  "set-library-health-result": "Kütüphane sağlık raporu",
  "set-prosync-run": "Pro içeriklerini otomatik eşitle",
  "set-prosync-status": "Pro içerik eşitleme durumu",
  "custom-sayac": "Diğer Animasyonlar sayacı",
  "tab-presets": "Motion Presetleri görünümü",
  "preset-grid": "Motion Preset kartları",
  "preset-search": "Motion Preset araması",
  "preset-speed": "Motion Preset hızı",
  "preset-strength": "Motion Preset gücü",
  "cap-emoji-ac": "Emoji aç düğmesi",
  "cap-emoji-panel": "Emoji paneli",
  "cap-emoji-grid": "Emoji ızgarası",
  "cap-emoji-ara": "Emoji arama"
};
var kayip = [];
Object.keys(ZORUNLU).forEach(function (id) {
  if (!idler[id]) kayip.push(id + " (" + ZORUNLU[id] + ")");
});
ok("vazgecilmez ogelerin hepsi yerinde", kayip.length === 0,
  kayip.length ? kayip.join(" | ") : Object.keys(ZORUNLU).length + " oge dogrulandi");

/* ---------- 5) Aktif ve kaldırılmış modüller doğru mu ---------- */

// v2.5: SFX geri geldi; eski Motion modülü hâlâ kaldırılmış durumda.
var kalinti = [];
["tab-motion", "set-modules", "set-folders", "set-add-folder"].forEach(function (id) {
  if (idler[id]) kalinti.push(id);
});
ok("kaldirilan modul ogeleri markup'ta YOK", kalinti.length === 0, kalinti.join(" | ") || "temiz");

var betikler = (html.match(/<script src="js\/[^"]+"/g) || []).join(" ");
ok("kaldirilan Motion betigi yuklenmiyor", !/motion\.js/.test(betikler), betikler);
ok("aktif moduller yukleniyor (magiccut + beat + preset + sfx + emoji + saglik + Pro sync)",
  /magiccut\.js/.test(betikler) && /beat\.js/.test(betikler) && /presets\.js/.test(betikler) && /sfx\.js/.test(betikler) && /emoji-assets\.js/.test(betikler) && /library-health\.js/.test(betikler) && /pro-sync\.js/.test(betikler), betikler);

/* ---------- 6) Yüklenen her betik diskte var mı ---------- */

var eksikBetik = [];
(html.match(/<script src="([^"]+)"/g) || []).forEach(function (m) {
  var yol = m.replace(/<script src="/, "").replace(/"$/, "");
  if (!fs.existsSync(KOKYOL + yol)) eksikBetik.push(yol);
});
ok("index.html'in yukledigi betikler diskte var", eksikBetik.length === 0,
  eksikBetik.join(" | ") || "hepsi mevcut");

/* ---------- 7) Kilitli Pro vitrini klavye ve ekran okuyucuya kapali kalmasin ---------- */

var librarySrc = fs.readFileSync(KOKYOL + "js/library.js", "utf8");
var sfxSrc = fs.readFileSync(KOKYOL + "js/sfx.js", "utf8");
var proSrc = fs.readFileSync(KOKYOL + "js/pro.js", "utf8");
ok("Pro MOGRT kartlarinda anlamli grup, eylem ve favori erisilebilirligi var",
  /setAttribute\("role", "group"\)/.test(librarySrc) && /aria-pressed/.test(librarySrc) && /Suflo Pro ile kilidi aç/.test(librarySrc));
ok("Pro SFX koleksiyonlari anlamli buton etiketi tasir", /card\.setAttribute\("aria-label"/.test(sfxSrc));
ok("Pro satin alma penceresi modal, odak tuzagi ve odak geri donusu tasir",
  /aria-modal="true"/.test(proSrc) && /focusable/.test(proSrc) && /previousFocus\.focus/.test(proSrc));
var appSrc = fs.readFileSync(KOKYOL + "js/app.js", "utf8");
ok("Stil karti etiketi dekoratif onizleme metnini degil ad ve aciklamayi okur",
  /\.ss-bilgi b/.test(appSrc) && /timeline çıktısı kilitli/.test(appSrc));
ok("Kutuphane Pro CTA'lari neyin acilacagini ve fiyati gizlemez",
  /262 içeriği aç — 749 TL/.test(html) && /290 preseti aç — 749 TL/.test(html) && /1\.076 SFX'i aç — 749 TL/.test(html));

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
process.exit(kaldi ? 1 : 0);
