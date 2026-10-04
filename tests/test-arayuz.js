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
                "js/library.js", "js/presets.js", "js/sfx.js", "js/emoji-assets.js", "js/library-health.js", "js/pro-sync.js",
                "js/onboarding.js", "js/viral.js", "js/davet.js", "js/bolumler.js", "js/konusma-kes.js",
                "js/marka-kiti-ui.js", "js/kanca.js"];

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

ok("Stil bolumu 17 gercek Premiere altyazi sablonu icin acik",
  /class="card stil-katmani-card"/.test(html) &&
  /17 gerçek altyazı şablonundan birini seç/.test(html) &&
  !/class="card stil-katmani-card" hidden/.test(html));

/* ---------- 4) Vazgeçilmez öğeler: silinirse ürün işlevini kaybeder ---------- */

var ZORUNLU = {
  "cap-go": "Altyazı oluştur düğmesi",
  "cap-apply": "Normal altyazı izi ekle",
  "cap-apply-style": "Seçili stille ekle",
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
  "set-library-health-run": "Suflo Doctor taraması",
  "set-doctor-fix-all": "Suflo Doctor güvenli onarım",
  "set-library-health-result": "Suflo Doctor raporu",
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
  "cap-emoji-ara": "Emoji arama",
  // v3.1: ilk acilis rehberi ("Ilk altyazin 2 dakikada")
  "ilk-adim": "Ilk altyazi rehberi karti",
  "onb-chip": "Rehber ilerleme cipi",
  "onb-anahtar": "AI anahtari sihirbazi",
  "set-onb-ac": "Ayarlar > Destek > Kurulum rehberini ac",
  "cap-setup": "Motor kurulum notu (rehber karti icine tasinir)",
  "cap-local-install": "Yerel motoru kur",
  "cap-key-save": "Anahtari kaydet",
  // v3.1: Viral Skor 2.0 (tur, adet, odak, siralama, >=60 filtresi, tahmin notu)
  "cap-vr-box": "Viral anlar kutusu",
  "cap-vr-bul": "Viral anlari bul",
  "cap-vr-tur": "Viral tur secimi",
  "cap-vr-adet": "Viral an sayisi",
  "cap-vr-odak": "Viral odak metni",
  "cap-vr-sure": "Viral klip suresi",
  "cap-vr-sira": "Viral siralama",
  "cap-vr-min": "Yalniz >=60 filtresi",
  "cap-vr-not": "Puan tahmin notu",
  "cap-vr-liste": "Viral an kartlari"
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
ok("rehber modulleri yukleniyor (onboarding-steps + onboarding)",
  /onboarding-steps\.js/.test(betikler) && /js\/onboarding\.js/.test(betikler), betikler);
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
ok("Pro penceresindeki 'Ucretsiz dene' dugmesi odak tuzaginda",
  /var ids = \[[^\]]*'pro-upsell-deneme'[^\]]*\]/.test(proSrc) && /id="pro-upsell-deneme"/.test(proSrc));
var appSrc = fs.readFileSync(KOKYOL + "js/app.js", "utf8");
ok("Stil karti etiketi dekoratif onizleme metnini degil ad ve aciklamayi okur",
  /\.ss-bilgi b/.test(appSrc) && /timeline çıktısı kilitli/.test(appSrc));
ok("Premiere acilisinda host yoklamasi calismaz; panelle etkilesimde baslar",
  /function contextPollingBaslat\(\)/.test(appSrc) &&
  /document\.addEventListener\("pointerdown", contextEtkilesim, true\)/.test(appSrc) &&
  /document\.addEventListener\("click", contextEtkilesim, true\)/.test(appSrc) &&
  /document\.addEventListener\("keydown", contextEtkilesim, true\)/.test(appSrc) &&
  !/window\.addEventListener\("focus", contextPollingBaslat\)/.test(appSrc) &&
  !/guvenli\("ffmpeg", checkFfmpeg\);\s*guvenli\("bağlam", pollContext\)/.test(appSrc));
var doctorSrc = fs.readFileSync(KOKYOL + "js/library-health.js", "utf8");
ok("Doctor taramasi ana ekran Premiere baglamini da yeniler",
  /KApp\.refreshContext\(\)/.test(doctorSrc) && /refreshContext: contextPollingBaslat/.test(appSrc));
var librarySrc = fs.readFileSync(KOKYOL + "js/library.js", "utf8");
var sfxSrc = fs.readFileSync(KOKYOL + "js/sfx.js", "utf8");
var motionBgSrc = fs.readFileSync(KOKYOL + "js/motionbg.js", "utf8");
var emojiAssetsSrc = fs.readFileSync(KOKYOL + "js/emoji-assets.js", "utf8");
var proSyncSrc = fs.readFileSync(KOKYOL + "js/pro-sync.js", "utf8");
ok("Buyuk yerel kutuphaneler Premiere acilisinda taranmaz",
  !/setTimeout\(function \(\) \{ if \(!paketler\.length\) tara\(\); \}, 900\)/.test(librarySrc) &&
  /KApp\.onTab\("sfx", function \(\) \{ if \(!index\.length\) buildIndex\(\); \}\)/.test(sfxSrc) &&
  !/if \(typeof Pro !== "undefined"\) Pro\.on\(renderList\);\s*buildIndex\(\)/.test(sfxSrc) &&
  !/if \(typeof Pro !== "undefined"\) Pro\.on\(renderGrid\);\s*buildIndex\(\)/.test(motionBgSrc) &&
  !/KApp\.onTab\("emoji-assets"[^;]+;\s*buildIndex\(\)/.test(emojiAssetsSrc));
ok("Pro Cloud sessiz guncellemesi Premiere acilisindan bir dakika sonra baslar",
  /setTimeout\(function \(\) \{ sync\(\{ silent: true \}\); \}, 60000\)/.test(proSyncSrc));
ok("Kutuphane Pro CTA'lari neyin acilacagini ve fiyati gizlemez",
  /Yazı animasyonlarını aç — 749 TL/.test(html) && /290 preseti aç — 749 TL/.test(html) &&
  /1\.076 SFX'i aç — 749 TL/.test(html) && /Motion BG'yi aç — 749 TL/.test(html));


/* ---------- İngilizce (beta) arayüz kablolaması ---------- */
var sira = ["js/CSInterface.js", "i18n/en.js", "js/i18n.js", "js/bridge.js"].map(function (f) { return html.indexOf('<script src="' + f + '"></script>'); });
ok("i18n betikleri CSInterface.js'ten sonra, bridge.js'ten önce yüklenir", sira.every(function (x, i) { return x !== -1 && (i === 0 || x > sira[i - 1]); }), sira.join(","));
var dilSec = /<select id="set-ui-lang"[^>]*>([\s\S]*?)<\/select>/.exec(html);
ok("Ayarlar > Destek: #set-ui-lang tr ve en (beta) seçenekli",
  !!dilSec && /<option value="tr">Türkçe<\/option>/.test(dilSec[1]) && /<option value="en">English \(beta\)<\/option>/.test(dilSec[1]) &&
  html.indexOf('id="set-ui-lang"') > html.indexOf('<div class="set-title">Destek</div>'));
ok("dil seçicileri çevrilmez (data-i18n-skip): dil adları kendi dilinde kalır",
  /<select id="set-ui-lang" data-i18n-skip>/.test(html) && /<div id="ia-dil" class="ia-dil" hidden data-i18n-skip>/.test(html));
ok("ilk açılış rehberinde iki dilli 0. adım (Türkçe / English (beta))",
  /id="ia-dil-tr"[^>]*>Türkçe</.test(html) && /id="ia-dil-en"[^>]*>English \(beta\)</.test(html) &&
  html.indexOf('id="ia-dil"') < html.indexOf('id="ia-motor"'));
var appSrc = fs.readFileSync(KOKYOL + "js/app.js", "utf8");
var initGovde = appSrc.slice(appSrc.indexOf("  function init() {"));
ok("KApp.init dili bağlam yoklamasından ve pencerelerden ÖNCE başlatır",
  initGovde.indexOf('guvenli("Dil", arayuzDiliniBaslat)') !== -1 &&
  initGovde.indexOf('guvenli("Dil", arayuzDiliniBaslat)') < initGovde.indexOf("checkFfmpeg") &&
  initGovde.indexOf('guvenli("Dil", arayuzDiliniBaslat)') < initGovde.indexOf("contextEtkilesim") &&
  initGovde.indexOf('guvenli("Dil", arayuzDiliniBaslat)') < initGovde.indexOf("yenilikleriGoster") &&
  /SufloI18n\.configure\(\{\s*load: K\.settings,/.test(appSrc) && /settingsExisted: K\.ayarDosyasiVardi/.test(appSrc) &&
  /if \(SufloI18n\.getLang\(\) === "en"\) SufloI18n\.start\(\);/.test(appSrc));
ok("dil değişimi iş sürerken kapalı, yeniden yüklemesiz (switchLang)",
  /SufloI18n\.switchLang\(sec\.value, \{ busy: isSuruyor \}\)/.test(appSrc) && /sec\.disabled = mesgul/.test(appSrc) &&
  /surecSayisi: surecSayisi/.test(fs.readFileSync(KOKYOL + "js/bridge.js", "utf8")));
var capSrc = fs.readFileSync(KOKYOL + "js/captions.js", "utf8");
ok("altyazı dili bilinmezken 'tr' yerine arayüz dili", !/\|\| "tr"; \}?,?\s*$/m.test(capSrc.split("\n").filter(function (l) { return /cap-lang/.test(l); }).join("\n")) &&
  (capSrc.match(/\|\| arayuzDili\(\)/g) || []).length >= 4);
ok("İngilizcede kayıtlı tercih yoksa altyazı dili Otomatik",
  /if \(!p\) \{ if \(arayuzDili\(\) === "en" && el\("cap-lang"\)\) el\("cap-lang"\)\.value = ""; return; \}/.test(capSrc));
var diyalogEksik = [];
fs.readdirSync(KOKYOL + "js").filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
  fs.readFileSync(KOKYOL + "js/" + f, "utf8").split("\n").forEach(function (satir, i) {
    if (/window\.confirm\(|showOpenDialogEx\(/.test(satir) && /["']/.test(satir) && satir.indexOf("uiMetni(") === -1) diyalogEksik.push(f + ":" + (i + 1));
  });
});
ok("confirm() ve klasör seçme pencereleri arayüz dilinde (uiMetni)", diyalogEksik.length === 0, diyalogEksik.join(" | "));
ok("Premiere bin/marker adları anahtar olarak aynı kalır", /Suflo Altyazi/.test(fs.readFileSync(KOKYOL + "jsx/host.jsx", "utf8")));

/* ---------- Marka Kiti + stil ince ayarı + paylaşılabilir stil kodları ---------- */
var inceAyar = (html.match(/<details class="ince-ayar"[^>]*>/) || [""])[0];
ok("ince ayar artık gizli değil (görünürlüğü JS yönetir)", inceAyar && !/\shidden|aria-hidden/.test(inceAyar) && /id="cap-ince-ayar"/.test(inceAyar), inceAyar);
var yeniIdler = ["cap-ince-ayar", "cap-guvenli-yerlesim", "cap-guvenli-yerlesim-sar", "cap-ia-varsayilan", "cap-stil-paylas", "cap-stil-kod",
  "cap-stil-kod-uygula", "cap-stil-disa", "cap-stil-ice", "cap-stil-kredi", "cap-stil-kredi-ad", "cap-stil-yazar", "cap-marka-kiti-cip", "cap-font-sistem",
  "grp-marka-kiti", "mk-acik", "mk-font", "mk-konum", "mk-renk-acik", "mk-renk", "mk-renk-kontur", "mk-renk-vurgu", "mk-logo-sec", "mk-logo-kaldir",
  "mk-logo-ad", "mk-logo-kose", "mk-logo-oran", "mk-logo-oran-deger", "mk-doldur", "mk-durum", "kanca-kit-not"];
var yokId = yeniIdler.filter(function (id) { return !idler[id]; });
ok("yeni id'ler index.html'de", yokId.length === 0, yokId.join(","));
var ia = html.slice(html.indexOf('id="cap-ince-ayar"'), html.indexOf("</details>", html.indexOf('id="cap-ince-ayar"')));
ok("animasyon ve arka plan kutusu .ia-eski içinde (Suflo Stilinde gizlenir)", /class="field ia-eski"[\s\S]{0,120}id="cap-animasyon"/.test(ia) && /class="ia-eski"[\s\S]{0,200}id="cap-kutu"/.test(ia));
ok("kredi adı çeviriden muaf (kullanıcı adı)", /id="cap-stil-kredi-ad" data-i18n-skip/.test(html));
function betikSira(ad) { return html.indexOf('<script src="js/' + ad + '"'); }
ok("betik sırası: style-share → marka-kiti → style-engine → overlay-render → captions → hook-title → kanca → marka-kiti-ui → app",
  betikSira("style-share.js") > 0 && betikSira("style-share.js") < betikSira("marka-kiti.js") && betikSira("marka-kiti.js") < betikSira("style-engine.js") &&
  betikSira("style-engine.js") < betikSira("overlay-render.js") && betikSira("overlay-render.js") < betikSira("captions.js") && betikSira("hook-title.js") < betikSira("kanca.js") &&
  betikSira("kanca.js") < betikSira("marka-kiti-ui.js") && betikSira("marka-kiti-ui.js") < betikSira("app.js"));
ok("Marka Kiti kartı app.js'ten başlatılır", /KMarkaKiti\.init\(\)/.test(fs.readFileSync(KOKYOL + "js/app.js", "utf8")));
function fnGovde(src, imza) { var i = src.indexOf(imza); return i < 0 ? "" : src.slice(i, src.indexOf("\n  }\n", i) + 4); }
var ap = fnGovde(capSrc, "function applyPreset(");
ok("applyPreset: kit açıkken stiliYaz(mergeBrandKit(preset, kit))", /stiliYaz\(kit \? window\.SufloMarkaKiti\.mergeBrandKit\(p\.stil, kit\) : p\.stil\)/.test(ap));
var ku = fnGovde(capSrc, "function stilKoduUygula(");
ok("kod uygula: önce applyPreset(styleId), sonra stiliYaz(tarif), sonra önizleme", ku.indexOf("applyPreset(r.styleId)") > 0 &&
  ku.indexOf("applyPreset(r.styleId)") < ku.indexOf("stiliYaz(ov)") && ku.indexOf("stiliYaz(ov)") < ku.indexOf("onizlemeOynat()"));
ok("kod uygula: izinli stiller yalnız Suflo Stilleri", /SS\.decode\(String\(kod \|\| ""\), function \(id\) \{ return motorStiliMi\(id\); \}\)/.test(ku));
var kr = fnGovde(capSrc, "function stilKredisi(");
ok("kredi çipi yalnız textContent ve doğrulanmış adla", /b\.textContent = /.test(kr) && !/innerHTML/.test(kr) && /SS\.validAuthor\(ad\)/.test(kr));
ok("vurgu rengi Suflo Stillerinde etkin", /var motorda = !secilenMogrt && motorStiliMi\(stil\(\)\.aile\);[\s\S]{0,200}!\(motorda \|\|/.test(fnGovde(capSrc, "function vurguKutusuDurumu(")));
var iad = fnGovde(capSrc, "function inceAyarDurumu(");
ok("ince ayar yalnız Suflo Stilinde, sistem fontları kapalı, güvenli yerleşim yalnız 9:16", /d\.hidden = !motorda/.test(iad) && /sistem\.disabled = motorda/.test(iad) &&
  /sar\.hidden = !\(motorda && dikeySekans\(\)\)/.test(iad));
ok("önizleme, katman, ASS ve paylaşım kodu aynı ince ayarı kullanır (motorAyarlari)", (capSrc.match(/overrides: motorAyarlari\(/g) || []).length === 4, (capSrc.match(/overrides: motorAyarlari\(/g) || []).length);
var ou2 = fnGovde(capSrc, "async function overlayUygula(");
ok("katman: kit logosu + tam sekans süresi, logo atlanırsa uyarı", /CT\.katmanSuresi\(.*, !!logo\);/.test(ou2) && /logo: logo,/.test(ou2) && /logoAtlandi/.test(ou2));
ok("önizleme ortak builder ile (previewArgs + logoHazirla)", /SufloOverlayRender\.previewArgs\(/.test(fnGovde(capSrc, "async function motorOnizlemeOynat(")) &&
  /SufloOverlayRender\.logoHazirla\(/.test(fnGovde(capSrc, "async function motorOnizlemeOynat(")));

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
process.exit(kaldi ? 1 : 0);
