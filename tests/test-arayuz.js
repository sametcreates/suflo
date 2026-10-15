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
                "js/marka-kiti-ui.js", "js/kanca.js", "js/hiz-rampasi.js", "js/egri.js"];

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
// 3.3: kayıtlı tercih yoksa Altyazı Efektleri › Temiz de seçili gelir (efektVarsayilan; tercih yazılmaz)
ok("İngilizcede kayıtlı tercih yoksa altyazı dili Otomatik",
  /if \(!p\) \{ if \(arayuzDili\(\) === "en" && el\("cap-lang"\)\) el\("cap-lang"\)\.value = ""; efektVarsayilan\(true\); return; \}/.test(capSrc));
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
var iaEski = html.slice(html.indexOf('<div class="ia-eski" hidden aria-hidden="true">'), html.indexOf("</div>", html.indexOf('<div class="ia-eski" hidden aria-hidden="true">')));
// 3.3 adım 17: arka plan kutusu (cap-kutu) artık Altyazı Efektleri oluşturucusunun görünen anahtarı
ok("eski 'Özel' kayıtların animasyon / hareket şiddeti taşıyıcıları hep gizli .ia-eski içinde; kutu oluşturucuda", /id="cap-animasyon"/.test(iaEski) &&
  !/id="cap-kutu"/.test(iaEski) && /id="cap-yogunluk"/.test(iaEski) && /id="cap-efekt-ayarlar"[\s\S]*<input id="cap-kutu" type="checkbox">/.test(html));
ok("kredi adı çeviriden muaf (kullanıcı adı)", /id="cap-stil-kredi-ad" data-i18n-skip/.test(html));
function betikSira(ad) { return html.indexOf('<script src="js/' + ad + '"'); }
ok("betik sırası: style-share → marka-kiti → style-engine → overlay-render → captions → hook-title → kanca → marka-kiti-ui → app",
  betikSira("style-share.js") > 0 && betikSira("style-share.js") < betikSira("marka-kiti.js") && betikSira("marka-kiti.js") < betikSira("style-engine.js") &&
  betikSira("style-engine.js") < betikSira("overlay-render.js") && betikSira("overlay-render.js") < betikSira("captions.js") && betikSira("hook-title.js") < betikSira("kanca.js") &&
  betikSira("kanca.js") < betikSira("marka-kiti-ui.js") && betikSira("marka-kiti-ui.js") < betikSira("app.js"));
ok("Marka Kiti kartı app.js'ten başlatılır", /KMarkaKiti\.init\(\)/.test(fs.readFileSync(KOKYOL + "js/app.js", "utf8")));
function fnGovde(src, imza) { src = String(src).replace(/\r\n/g, "\n"); var i = src.indexOf(imza); return i < 0 ? "" : src.slice(i, src.indexOf("\n  }\n", i) + 4); }
var ap = fnGovde(capSrc, "function applyPreset(");
ok("applyPreset: kit açıkken stiliYaz(mergeBrandKit(preset, kit)); eski stil kimliği en yakın görünüme", /stiliYaz\(kit \? window\.SufloMarkaKiti\.mergeBrandKit\(pStil, kit\) : pStil\)/.test(ap) &&
  /AE\.eskiGorunum\(key\)\) \{ gorunumUygula\(AE\.eskiGorunum\(key\)/.test(ap));
var gu = fnGovde(capSrc, "function gorunumUygula(");
ok("hazır görünüm: kit açıkken stiliYaz(mergeBrandKit(görünüm, kit)), yazım biçimi görünümden, önizleme tazelenir", /stiliYaz\(kit \? window\.SufloMarkaKiti\.mergeBrandKit\(st, kit\) : st\)/.test(gu) &&
  /el\("cap-case"\)\.value = g\.ayar\.kase/.test(gu) && /efektOnizlemeTazele\(true\)/.test(gu));
var ku = fnGovde(capSrc, "function stilKoduUygula(");
// Önizleme efektOnizlemeTazele(true) ile: süren otomatik çizimi "Durdur" saymaz, bitince kodun görünümü çizilir
ok("kod uygula: önce temel görünüm (eski kod: en yakın görünüm), sonra stiliYaz(tarif), sonra önizleme", ku.indexOf("gorunumUygula(taban") > 0 &&
  ku.indexOf("gorunumUygula(taban") < ku.indexOf("stiliYaz(ov)") && ku.indexOf("stiliYaz(ov)") < ku.indexOf("efektOnizlemeTazele(true)") &&
  ku.indexOf("onizlemeOynat()") === -1 && /AE\.eskiStilden\(r\.styleId, ov\)/.test(ku));
ok("kod uygula: izinli stiller yalnız stil motorununkiler (Altyazı Efektleri + eski kodlar)", /SS\.decode\(String\(kod \|\| ""\), function \(id\) \{ return motorStiliMi\(id\); \}\)/.test(ku));
var kr = fnGovde(capSrc, "function stilKredisi(");
ok("kredi çipi yalnız textContent ve doğrulanmış adla", /b\.textContent = /.test(kr) && !/innerHTML/.test(kr) && /SS\.validAuthor\(ad\)/.test(kr));
ok("vurgu rengi oluşturucuda hep seçilebilir (pasif değil)", /kutu\.classList\.remove\("pasif"\)/.test(fnGovde(capSrc, "function vurguKutusuDurumu(")));
var iad = fnGovde(capSrc, "function inceAyarDurumu(");
// Sistem fontları hep kapalı ve gizli: oluşturucu yalnız paket fontlarını çizer (seçilen sistem fontu sessizce dönerdi)
ok("paylaş / kaydet yalnız Altyazı Efektlerinde, sistem fontları kapalı, güvenli yerleşim yalnız 9:16", /d\.hidden = !motorda/.test(iad) &&
  /sistem\.disabled = true; sistem\.hidden = true;/.test(iad) && /<optgroup label="Sistem" id="cap-font-sistem" disabled hidden>/.test(html) &&
  /sar\.hidden = !\(motorda && dikeySekans\(\)\)/.test(iad));
ok("önizleme, katman, ASS ve paylaşım kodu aynı ince ayarı kullanır (motorAyarlari)", (capSrc.match(/overrides: motorAyarlari\(/g) || []).length === 4, (capSrc.match(/overrides: motorAyarlari\(/g) || []).length);
var ou2 = fnGovde(capSrc, "async function overlayUygula(");
ok("katman: kit logosu kapsamın sonuna kadar (logoKatmanKalan), logo atlanırsa uyarı",
  /CT\.logoKatmanKalan\(scope, spec, baslangic, sonBitis\)/.test(ou2) && /CT\.katmanSuresi\(sonBitis, logoKalan, fps, true\)/.test(ou2) &&
  /logo: logo,/.test(ou2) && /logoAtlandi/.test(ou2));
var mkd = fnGovde(capSrc, "function markaKitiDegisti(");
ok("kit değişimi: yalnız stil alanı değişince, Şablonum hariç, rebaseBrandKit ile; kredi silinir",
  /MK\.styleFieldsChanged\(eski, yeni\)/.test(mkd) && /!sablonum/.test(mkd) && /MK\.rebaseBrandKit\(stil\(\), temel && temel\.stil, eski, yeni\)/.test(mkd) &&
  /stilKredisi\(""\)/.test(mkd) && !/mergeBrandKit/.test(mkd));
ok("MOGRT stili seçilince paylaşılan kodun kredisi silinir", /stilKredisi\(""\)/.test(fnGovde(capSrc, "function mogrtStiliniSec(")));
ok("paylaşım bağlantısı arayüz dilinde (EN → /en/stil)", (capSrc.match(/SS\.shareUrl\(k\.kod, arayuzDili\(\)\)/g) || []).length === 2);
ok("önizleme ortak builder ile (previewArgs + logoHazirla)", /SufloOverlayRender\.previewArgs\(/.test(fnGovde(capSrc, "async function motorOnizlemeOynat(")) &&
  /SufloOverlayRender\.logoHazirla\(/.test(fnGovde(capSrc, "async function motorOnizlemeOynat(")));

/* ---------- Podcast Modu ---------- */
var appSrc = fs.readFileSync(KOKYOL + "js/app.js", "utf8"), proSrc = fs.readFileSync(KOKYOL + "js/pro.js", "utf8");
var mcUi = fs.readFileSync(KOKYOL + "js/multicam-ui.js", "utf8");
ok("Podcast: kenar çubuğunda Kanca Başlığı'ndan hemen sonra, PRO kilidi ve YENİ rozetiyle",
  html.indexOf('data-tab="podcast"') > html.indexOf('data-tab="kanca"') && html.indexOf('data-tab="podcast"') < html.indexOf('<div class="ky-baslik" style="margin-top:12px">Kütüphane</div>') &&
  /data-tab="podcast">[\s\S]{0,400}<b>Podcast <em class="ky-yeni">YENİ<\/em><\/b>[\s\S]{0,200}data-kilit>PRO/.test(html));
["tab-podcast", "pc-tara", "pc-esleme", "pc-genis", "pc-analiz", "pc-izler", "pc-min", "pc-max", "pc-hassas", "pc-hold", "pc-capraz", "pc-periyot-ac", "pc-periyot",
  "pc-onizleme", "pc-ozet", "pc-uyari", "pc-hedef", "pc-uygula", "pc-renk", "pc-progress", "pc-durum", "podcast-tanitim"].forEach(function (id) {
  ok("Podcast: #" + id + " var", !!idler[id]);
});
ok("Podcast: 'Her konuşmacının kendi mikrofonu olmalı' arayüzde yazar", /Her konuşmacının kendi mikrofonu olmalı/.test(html));
ok("Podcast: SRT altyazı izinin renk taşıyamadığı söylenir", /altyazı katmanı \(SRT\) renk taşıyamaz/.test(html));
ok("Podcast: betik sırası multicam.js → multicam-ui.js → app.js", betikSira("multicam.js") > 0 && betikSira("multicam.js") < betikSira("multicam-ui.js") && betikSira("multicam-ui.js") < betikSira("app.js") &&
  betikSira("style-engine.js") < betikSira("multicam-ui.js"));
ok("Podcast: app.js başlatır, kilitler ve tanıtım kartını Pro'da gizler", /KMulticam\.init\(\)/.test(appSrc) && /Pro\.markLocked\(document\.querySelector\('\.ky-oge\[data-tab="podcast"\]'\), !s\.pro\)/.test(appSrc) && /"podcast-tanitim"/.test(appSrc));
ok("Podcast: Pro anahtarı multicam (etiket + uygula kapısı)", /multicam:\s+'Podcast Modu/.test(proSrc) && /Pro\.gate\("multicam"\)/.test(fnGovde(mcUi, "async function uygula(")));
var uyg = fnGovde(mcUi, "async function uygula(");
ok("Podcast: önce hazırlık, sonra TÜM kesimler, sonra TÜM aç/kapa", uyg.indexOf("KS_multicamPrepare") > 0 && uyg.indexOf("KS_multicamPrepare") < uyg.indexOf("KS_multicamRazor") &&
  uyg.indexOf("KS_multicamRazor") < uyg.indexOf("KS_multicamEnable"));
ok("Podcast: mikrofon dışa aktarımı unmuteWanted ve gömülü epr ile, geçici dosya silinir", /KS_exportAudio", \{ scope: "entire", epr: bundledEpr\(\), tracks: \[sp\.mic\], unmuteWanted: true \}/.test(mcUi) && /silInput: true/.test(mcUi));
ok("Podcast: altyazının üç derleme noktası konuşmacı renklerinden geçer", (capSrc.match(/SufloStyleEngine\.compile\(konusmaciRenkleri\(/g) || []).length === 3 && /bundledEpr: bundledEpr/.test(capSrc));

ok("Podcast: sessiz mikrofon reddi normalizeSeries'in konuşma seviyesiyle (az konuşan mikrofon reddedilmez)", /M\.speechLevel\(seri\) < M\.SESSIZ_P95/.test(fnGovde(mcUi, "async function micEnerji(")));
ok("Podcast: hazırlık açık Suflo kopyalarını bilir (kopyada yeniden uygulama)", /seqIds: Object\.keys\(onbellek\.seqIds\)/.test(uyg));
ok("Podcast: eşleme denetimlerinin erişilebilir adında konuşmacı harfi var", /HARF\[i\][\s\S]{0,120}" · "/.test(mcUi) && /on \+ "Mikrofon ses katmanı"/.test(mcUi));
/* ---------- Hız Rampası (v3.2) ---------- */
var hizUi = fs.readFileSync(KOKYOL + "js/hiz-rampasi.js", "utf8");
ok("Hız Rampası: kenar çubuğunda Geçişler'den sonra, Kanca Başlığı'ndan önce; YENİ ve PRO rozetli",
  html.indexOf('data-tab="hiz"') > html.indexOf('data-tab="gecis"') && html.indexOf('data-tab="hiz"') < html.indexOf('data-tab="kanca"') &&
  /data-tab="hiz">[\s\S]{0,300}<b>Hız Rampası <em class="ky-yeni">YENİ<\/em><\/b><i>ağır çekim · hızlanma<\/i>[\s\S]{0,80}data-kilit>PRO/.test(html));
var yanCss = fs.readFileSync(KOKYOL + "css/style.css", "utf8");
// Ekran görüntüsü (3.1.0, 164 px menü): "Diğer Animasyonla / r" kelime ortasından bölünüyor, uzun ad ve açıklama
// alttaki öğenin üstüne taşıyordu
ok("Yan menü: adlar kelime ortasından bölünmez, en çok 2 satır; açıklama tek satır; öğeler büzülmez; dar menüde sayaç gizli",
  !/\.yan-menu \.ky-metin b \{[^}]*overflow-wrap:\s*anywhere/.test(yanCss) && /\.yan-menu \.ky-metin b \{[^}]*-webkit-line-clamp:\s*2/.test(yanCss) &&
  /\.yan-menu \.ky-metin i \{[^}]*text-overflow:\s*ellipsis/.test(yanCss) && /\.yan-menu \.ky-oge \{\s*flex-shrink:\s*0/.test(yanCss) &&
  /@media \(min-width: 561px\) and \(max-width: 720px\) \{ \.yan-menu \.ky-adet \{ display: none; \} \}/.test(yanCss));
ok("Hız Rampası: sayaç rozeti yok (elle tutulan bir sayı daha olmasın)", !/data-tab="hiz">[\s\S]{0,400}?ky-adet[\s\S]{0,40}<\/button>/.test(html.slice(html.indexOf('data-tab="hiz"'), html.indexOf('data-tab="kanca"'))));
["tab-hiz", "hiz-tanitim", "hiz-hedef", "hiz-aralik", "hiz-grid", "hiz-onizleme", "hiz-ozet", "hiz-yogunluk", "hiz-gecis", "hiz-parca", "hiz-kaynak", "hiz-ses",
  "hiz-akis", "hiz-bulanik", "hiz-vurus", "hiz-kopya", "hiz-uygula", "hiz-kaldir", "hiz-status", "hiz-ritim-yon", "hiz-ritim-yon-kutu"].forEach(function (id) {
  ok("Hız Rampası: #" + id + " var", !!idler[id]);
});
ok("Hız Rampası: sekme Geçişler sekmesinden sonra", html.indexOf('id="tab-hiz"') > html.indexOf('id="tab-gecis"') && html.indexOf('id="tab-hiz"') < html.indexOf('id="tab-kanca"'));
ok("Hız Rampası: betik sırası speedramp.js → hiz-rampasi.js → app.js", betikSira("speedramp.js") > 0 && betikSira("speedramp.js") < betikSira("hiz-rampasi.js") &&
  betikSira("hiz-rampasi.js") < betikSira("app.js"));
ok("Hız Rampası: app.js başlatır, kilitler ve tanıtım kartını Pro'da gizler", /KHizRampasi\.init\(\)/.test(appSrc) &&
  /Pro\.markLocked\(document\.querySelector\('\.ky-oge\[data-tab="hiz"\]'\), !s\.pro\)/.test(appSrc) && /"hiz-tanitim"/.test(appSrc));
ok("Hız Rampası: Pro etiketi ve tanıtım düğmesi speedramp", /speedramp: 'Hız rampası: tek tıkla ağır çekim ve hızlanma'/.test(proSrc) &&
  /data-pro-feature="speedramp">Hız rampasını aç — 749 TL</.test(html));
ok("Hız Rampası: Ayarlar Pro listesinde", /<li>Sesi iyileştir · Otomatik zoom · Ritim · Hız rampası<\/li>/.test(html));
ok("Hız Rampası: Premiere çağrıları yalnız tıklamada (init'te K.call yok)", !/K\.call\(/.test(fnGovde(hizUi, "function init(")) && !/K\.call\(/.test(fnGovde(hizUi, "function render(")) &&
  !/K\.call\(/.test(fnGovde(hizUi, "function refresh(")) && !/K\.call\(/.test(fnGovde(hizUi, "function onizlemeCiz(")));
ok("Hız Rampası: Ctrl+Z uyarısı ve kaldırma düğmesi arayüzde", /Ctrl\+Z rampayı tek adımda geri almaz/.test(html) && /id="hiz-kaldir"[^>]*>Rampayı kaldır</.test(html));
/* ---------- 3.4 adım 13: Hız Rampası için Özel eğri editörü ---------- */
["hiz-ozel", "hiz-ozel-editor", "hiz-ozel-hit", "hiz-ozel-basamak", "hiz-ozel-sil", "hiz-ozel-sifirla", "hiz-ozel-ad", "hiz-ozel-kaydet", "hiz-ozel-kayitlar"].forEach(function (id) {
  ok("Özel eğri: #" + id + " var", !!idler[id]);
});
var hizBolum = html.slice(html.indexOf('id="tab-hiz"'), html.indexOf("</section>", html.indexOf('id="tab-hiz"')));
var egriOzelSrc = fs.readFileSync(KOKYOL + "js/egri.js", "utf8").replace(/\r\n/g, "\n"), cssOzel = fs.readFileSync(KOKYOL + "css/style.css", "utf8");
ok("Özel eğri: kutu Hız Rampası sekmesinde, kart ızgarasından sonra ve önizlemeden önce, gizli başlar", hizBolum.indexOf('id="hiz-ozel"') > hizBolum.indexOf('id="hiz-grid"') &&
  hizBolum.indexOf('id="hiz-ozel"') < hizBolum.indexOf('id="hiz-onizleme"') && /<div id="hiz-ozel" class="hiz-ozel" hidden>/.test(hizBolum));
ok("Özel eğri: düzenleyicinin aria-label'ı SVG'nin dışında (kutuda), odaklanabilir; Sert basamak / Noktayı sil seçimsiz kapalı",
  /<div id="hiz-ozel-editor" class="egri-editor hiz-ozel-editor" tabindex="0" role="img" aria-label="Özel hız eğrisi düzenleyicisi"><\/div>/.test(hizBolum) &&
  /id="hiz-ozel-basamak"[^>]*disabled>Sert basamak</.test(hizBolum) && /id="hiz-ozel-sil"[^>]*disabled>Noktayı sil</.test(hizBolum) &&
  /<input id="hiz-ozel-ad" type="text" maxlength="40"/.test(hizBolum));
ok("Özel eğri: ipucu tıkla / sürükle / çift tık / Shift / Alt'ı anlatır", /Tıkla: nokta ekle · sürükle: taşı · çift tık: sil · Shift: ızgaraya yapış · Alt\+tık: sert basamak\./.test(hizBolum));
ok("Özel eğri: hiz-rampasi.js düzenleyiciyi SufloEgriEditor 'hiz' moduyla kurar; egri.js 'hiz' modunu SufloSpeedRamp.ozel ile çizer",
  /ED\.olustur\(kap, \{ mod: "hiz",/.test(hizUi) && /if \(opts\.mod === "hiz"\) return hizOlustur\(kap, opts\);/.test(egriOzelSrc) && /Z = SR\.ozel/.test(egriOzelSrc));
ok("Özel eğri: kapı ve deneme değişmedi (yalnız 'speedramp')", (hizUi.match(/Pro\.gate\(/g) || []).length === 1 && /Pro\.gate\("speedramp"/.test(hizUi) &&
  (hizUi.match(/Pro\.denemeHarca\(/g) || []).length === 1 && /Pro\.denemeHarca\("speedramp"/.test(hizUi));
ok("Özel eğri: düzenleme, Düzenle ve kayıtlar Premiere'e gitmez", ["function ozelKur(", "function ozelDegisti(", "function ozelAta(", "function duzenle(", "function ozelKayitKaydet(", "function kartlar("].every(function (f) {
  var g = fnGovde(hizUi, f); return g.length > 20 && !/K\.call\(/.test(g);
}));
ok("Özel eğri: CSS (kart Düzenle, kutu, çipler) ve CEF 74'te olmayan flex gap / :focus-visible yok", /\.hiz-duzenle \{/.test(cssOzel) && /\.hiz-ozel \{/.test(cssOzel) && /\.hiz-ozel-kayit \{/.test(cssOzel) &&
  !/\.hiz-(ozel|duzenle)[^{]*\{[^}]*\bgap:/.test(cssOzel) && !/\.hiz-(ozel|duzenle)[^{]*:focus-visible/.test(cssOzel));
/* ---------- Eğri (3.4 adım 10) ---------- */
var egriUi = fs.readFileSync(KOKYOL + "js/egri.js", "utf8").replace(/\r\n/g, "\n");
ok("Eğri: kenar çubuğunda Hız Rampası'ndan sonra, Kanca Başlığı'ndan önce; YENİ ve PRO rozetli, sayaçsız",
  html.indexOf('data-tab="egri"') > html.indexOf('data-tab="hiz"') && html.indexOf('data-tab="egri"') < html.indexOf('data-tab="kanca"') &&
  /data-tab="egri">[\s\S]{0,400}<b>Eğri <em class="ky-yeni">YENİ<\/em><\/b><i>anahtar kare yumuşatma<\/i>[\s\S]{0,80}data-kilit>PRO/.test(html) &&
  !/ky-adet/.test(html.slice(html.indexOf('data-tab="egri"'), html.indexOf('data-tab="kanca"'))));
["tab-egri", "egri-tanitim", "egri-gorunum-deger", "egri-gorunum-hiz", "egri-editor", "egri-sahne", "egri-kare", "egri-css", "egri-p1x", "egri-p1y", "egri-p2x",
  "egri-p2y", "egri-cevir", "egri-ters", "egri-kaydet", "egri-onayarlar", "egri-yenile", "egri-sonraki", "egri-hedef", "egri-ozellikler", "egri-yogunluk",
  "egri-pr-onizle", "egri-geri-tumu", "egri-uygula", "egri-status"].forEach(function (id) {
  ok("Eğri: #" + id + " var", !!idler[id]);
});
ok("Eğri: sekme Hız Rampası'ndan sonra, Kanca'dan önce", html.indexOf('id="tab-egri"') > html.indexOf('id="tab-hiz"') && html.indexOf('id="tab-egri"') < html.indexOf('id="tab-kanca"'));
ok("Eğri: betik sırası ease-curve.js → key-records.js → egri-model.js → egri.js → app.js", betikSira("ease-curve.js") > 0 &&
  betikSira("ease-curve.js") < betikSira("key-records.js") && betikSira("key-records.js") < betikSira("egri-model.js") &&
  betikSira("egri-model.js") < betikSira("egri.js") && betikSira("egri.js") < betikSira("app.js"));
ok("Eğri: yoğunluk 1 / 2 / 4 kare (varsayılan her kare)", /<select id="egri-yogunluk">\s*<option value="1" selected>Her kare<\/option>\s*<option value="2">2 karede bir<\/option>\s*<option value="4">4 karede bir<\/option>/.test(html));
ok("Eğri: app.js başlatır, yan menüyü kilitler, tanıtımı Pro'da gizler; Pro etiketi ve tanıtım düğmesi 'curves'", /KEgri\.init\(\)/.test(appSrc) &&
  /Pro\.markLocked\(document\.querySelector\('\.ky-oge\[data-tab="egri"\]'\), !s\.pro\)/.test(appSrc) && /"egri-tanitim"/.test(appSrc) &&
  /curves:\s+'Eğri: kendi anahtar karelerine özel yumuşatma'/.test(proSrc) && /data-pro-feature="curves">Eğriyi aç — 749 TL</.test(html));
ok("Eğri: Ayarlar Pro listesinde", /<li>Eğri: anahtar karelerine özel yumuşatma \(düzenlemek ücretsiz\)<\/li>/.test(html));
ok("Eğri: init / render / listeCiz Premiere'e gitmez", ["function init(", "function render(", "function listeCiz(", "function onayarKartlari("].every(function (f) {
  var g = fnGovde(egriUi, f); return g.length > 20 && !/K\.call\(/.test(g);
}));
ok("Eğri: Ctrl+Z uyarısı, yalnız video katmanları notu ve 'Bezier tutamacı yazamaz' açıklaması arayüzde", /Ctrl\+Z eğriyi tek adımda geri almaz/.test(html) &&
  /Şimdilik yalnız video katmanları/.test(html) && /Bezier tutamaçlarını yazamadığı için/.test(html));
ok("Eğri: SufloEgriEditor dışa açık (Hız Rampası özel eğrisi yeniden kullanır)", /^window\.SufloEgriEditor = \(function \(\) \{/m.test(egriUi) && /return \{ olustur: olustur/.test(egriUi));
/* ---------- Ses etiketi filtresi + sessiz ses uyarısı (3.2 adım 2) ---------- */
["grp-altyazi", "set-ses-etiket", "cap-sessiz", "cap-sessiz-metin", "cap-sessiz-devam", "cap-sessiz-vazgec",
  "tc-sessiz", "tc-sessiz-metin", "tc-sessiz-devam", "tc-sessiz-vazgec"].forEach(function (id) {
  ok("Ses etiketi / sessiz ses: #" + id + " var", !!idler[id]);
});
var grpAltyazi = html.slice(html.indexOf('id="grp-altyazi"'), html.indexOf('id="grp-marka-kiti"'));
ok("Ayarlar › Altyazı: 'Ses etiketlerini koru' anahtarı varsayılan kapalı, motor kartından sonra",
  /<div class="set-title">Altyazı<\/div>/.test(grpAltyazi) && /<input id="set-ses-etiket" type="checkbox">/.test(grpAltyazi) && !/set-ses-etiket"[^>]*checked/.test(grpAltyazi) &&
  />Ses etiketlerini koru</.test(grpAltyazi) && html.indexOf('id="grp-altyazi"') > html.indexOf('class="set-group caption-engine-settings"'));
ok("Ayarlar › Altyazı: anahtar app.js'te bağlı (sesEtiketKoru yüklenir ve kaydedilir)",
  /el\("set-ses-etiket"\)\.checked = s\.sesEtiketKoru === true;/.test(appSrc) &&
  /el\("set-ses-etiket"\)\.addEventListener\("change", function \(\) \{\s*K\.settings\(\)\.sesEtiketKoru = this\.checked;\s*K\.saveSettings\(\);/.test(appSrc));
// 3.2 adım 4: ses etiketi ayarı kelime sınırı, birleştirme ve sürelerle aynı seçenek nesnesinde (kurSecenekleri)
ok("Ses etiketlerini koru: altyazı satır kurma yolları ayarı geçirir (go + rehber örneği)",
  (capSrc.match(/CT\.segmentleriKur\([a-z]+, lenVal, kurSecenekleri\([a-zA-Z]*\)\)/g) || []).length === 2 &&
  /function kurSecenekleri\(sonSinir\) \{[\s\S]*?etiketKoru: sesEtiketKoru\(\),/.test(capSrc) &&
  /return K\.settings\(\)\.sesEtiketKoru === true;/.test(capSrc));
ok("Sessiz ses: uyarı kutuları durum satırının hemen altında, gizli başlar, düğmeler 'Yine de devam et' / 'Vazgeç'",
  html.indexOf('id="cap-sessiz"') > html.indexOf('id="cap-status"') && html.indexOf('id="tc-sessiz"') > html.indexOf('id="tc-status"') &&
  /id="cap-sessiz" class="sessiz-uyari" role="alert" hidden/.test(html) && /id="tc-sessiz" class="sessiz-uyari" role="alert" hidden/.test(html) &&
  /id="cap-sessiz-devam"[^>]*>Yine de devam et</.test(html) && /id="cap-sessiz-vazgec"[^>]*>Vazgeç</.test(html) &&
  /id="tc-sessiz-devam"[^>]*>Yine de devam et</.test(html) && /id="tc-sessiz-vazgec"[^>]*>Vazgeç</.test(html));
ok("Sessiz ses: betik sırası caption-text.js → sessiz-ses.js → captions.js", betikSira("sessiz-ses.js") > betikSira("caption-text.js") && betikSira("sessiz-ses.js") < betikSira("captions.js"));
// 3.4 adım 9: yumuşatma motoru ve kayıtlar, onları kullanacak araçlardan (Geçiş, Zoom, Hareket, Hız Rampası) önce
ok("Yumuşatma motoru: betik sırası ease-curve.js → key-records.js → transitions/speedramp/zoom/presets → app.js", betikSira("ease-curve.js") > 0 &&
  betikSira("ease-curve.js") < betikSira("key-records.js") && betikSira("key-records.js") < betikSira("transitions.js") &&
  betikSira("key-records.js") < betikSira("speedramp.js") && betikSira("key-records.js") < betikSira("zoom.js") &&
  betikSira("key-records.js") < betikSira("presets.js") && betikSira("key-records.js") < betikSira("app.js"));
(function () {
  // saf modüller: yüklenince yalnız window.SufloEase / SufloKeyRecords tanımlar; Premiere, ağ, DOM, depo erişimi yok
  var vm = require("vm"), erisim = [];
  var pencere = {};
  ["localStorage", "document", "CSInterface", "fetch", "XMLHttpRequest"].forEach(function (ad) {
    Object.defineProperty(pencere, ad, { get: function () { erisim.push(ad); return undefined; } });
  });
  var ctx = vm.createContext({ window: pencere, JSON: JSON, Math: Math, Date: Date, Object: Object, Array: Array, String: String, Number: Number, isFinite: isFinite, isNaN: isNaN, Error: Error, RegExp: RegExp });
  ["ease-curve.js", "key-records.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(KOKYOL + "js/" + f, "utf8"), ctx); });
  ok("Yumuşatma motoru: yüklenirken yalnız global tanımlar (localStorage/DOM/Premiere/ağ erişimi yok)", typeof pencere.SufloEase === "object" &&
    typeof pencere.SufloKeyRecords === "object" && typeof pencere.SufloEase.bakePlan === "function" && erisim.length === 0, erisim.join(","));
})();
/* ---------- 3.4 adım 12: Geçiş, Zoom ve Hareket önayarlarında özel eğri ---------- */
ok("Özel eğri: betik sırası ease-curve.js → egri-secim.js → transitions/zoom/presets → egri.js → app.js", betikSira("egri-secim.js") > betikSira("ease-curve.js") &&
  betikSira("egri-secim.js") < betikSira("transitions.js") && betikSira("egri-secim.js") < betikSira("zoom.js") && betikSira("egri-secim.js") < betikSira("presets.js") &&
  betikSira("egri-secim.js") < betikSira("egri.js") && betikSira("egri.js") < betikSira("app.js"));
[["gecis-egri", "tab-gecis", "gecis-grid"], ["zoom-egri", "tab-zoom", "zoom-run"], ["preset-egri", "tab-presets", "preset-grid"]].forEach(function (x) {
  var i = html.indexOf('id="' + x[0] + '"');
  ok("Özel eğri: #" + x[0] + " " + x[1] + " içinde, uygulama düğmelerinden önce, açıklamasıyla", !!idler[x[0]] && i > html.indexOf('id="' + x[1] + '"') &&
    i < html.indexOf('id="' + x[2] + '"') && new RegExp('<div class="egri-secici" id="' + x[0] + '">\\s*<p class="hint egri-secici-not">[^<]{40,}</p>\\s*</div>').test(html));
});
(function () {
  // saf modül: yüklenince yalnız window.SufloEgriSecim tanımlar (localStorage / DOM / Premiere / ağ yok)
  var vm = require("vm"), erisim = [];
  var pencere = {};
  ["localStorage", "document", "CSInterface", "fetch", "XMLHttpRequest"].forEach(function (ad) {
    Object.defineProperty(pencere, ad, { get: function () { erisim.push(ad); return undefined; } });
  });
  var ctx = vm.createContext({ window: pencere, JSON: JSON, Math: Math, Date: Date, Object: Object, Array: Array, String: String, Number: Number, isFinite: isFinite, isNaN: isNaN, Error: Error, RegExp: RegExp,
    unescape: unescape, escape: escape, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent });
  ["ease-curve.js", "egri-secim.js"].forEach(function (f) { vm.runInContext(fs.readFileSync(KOKYOL + "js/" + f, "utf8"), ctx); });
  ok("Özel eğri: egri-secim.js yüklenirken yalnız global tanımlar (localStorage/DOM/Premiere/ağ erişimi yok)", typeof pencere.SufloEgriSecim === "object" &&
    typeof pencere.SufloEgriSecim.yogunlastir === "function" && pencere.SufloEgriSecim.coz("yumusak").ok && erisim.length === 0, erisim.join(","));
})();
ok("Özel eğri: kart ızgarası ve seçici egri.js'ten dışa açık (SufloEgriIzgara, SufloEgriSecici)", /^window\.SufloEgriIzgara = \(function \(\) \{/m.test(egriUi) &&
  /^window\.SufloEgriSecici = \(function \(\) \{/m.test(egriUi));
/* ---------- 3.4 adım 11: kayıt tabanlı güvenli kaldırma ---------- */
ok("Kaldırma: betik sırası key-records.js → kayit-kaldir.js → gecisler/zoom/presets → app.js", betikSira("kayit-kaldir.js") > betikSira("key-records.js") &&
  betikSira("kayit-kaldir.js") < betikSira("gecisler.js") && betikSira("kayit-kaldir.js") < betikSira("zoom.js") &&
  betikSira("kayit-kaldir.js") < betikSira("presets.js") && betikSira("kayit-kaldir.js") < betikSira("app.js"));
["gecis-kaldir", "preset-kaldir", "zoom-remove"].forEach(function (id) { ok("Kaldırma: #" + id + " var", !!idler[id]); });
ok("Kaldırma: 'Geçişi kaldır' Geçişler sekmesinde, 'Önayarı kaldır' Hareket önayarlarında; ikisi de kilitsiz düğme",
  html.indexOf('id="gecis-kaldir"') > html.indexOf('id="tab-gecis"') && html.indexOf('id="gecis-kaldir"') < html.indexOf('id="gecis-grid"') &&
  html.indexOf('id="preset-kaldir"') > html.indexOf('id="tab-presets"') && html.indexOf('id="preset-kaldir"') < html.indexOf('id="preset-grid"') &&
  /<button id="gecis-kaldir" class="btn outline" type="button">Geçişi kaldır<\/button>/.test(html) &&
  /<button id="preset-kaldir" class="btn outline" type="button">Önayarı kaldır<\/button>/.test(html));
(function () {
  // Kaldırmak hiçbir zaman ücretli değil: kaldir() gövdelerinde Pro kapısı yok
  var gs = fs.readFileSync(KOKYOL + "js/gecisler.js", "utf8"), zs = fs.readFileSync(KOKYOL + "js/zoom.js", "utf8"), ps = fs.readFileSync(KOKYOL + "js/presets.js", "utf8");
  var govdeler = [fnGovde(gs, "async function kaldir("), fnGovde(zs, "async function kaldir("), fnGovde(ps, "async function kaldir(")];
  ok("Kaldırma kapısız: üç aracın kaldir() gövdesinde Pro.gate / deneme hakkı yok, KS_removeSufloKeys modül üzerinden",
    govdeler.every(function (g) { return g.length > 200 && !/Pro\.gate|denemeHarca/.test(g) && /\.akis\(/.test(g); }), govdeler.map(function (g) { return g.length; }).join(","));
  ok("Kaldırma: eski yöntem (zoom ve geçiş) yalnız onayla — confirm arayüz dilinde",
    /window\.confirm\(uiMetni\(soru\)\)/.test(govdeler[0]) && /window\.confirm\(uiMetni\(soru\)\)/.test(govdeler[1]) && !/KS_autoZoom/.test(govdeler[1].split("yedek:")[0]));
  ok("Kaldırma: init / render Premiere'e gitmez (yalnız tıklamada)", !/K\.call\(/.test(fnGovde(gs, "function init(")) && !/K\.call\(/.test(fnGovde(gs, "function render(")) &&
    !/K\.call\(/.test(fnGovde(zs, "function init(")) && !/K\.call\(/.test(fnGovde(ps, "function init(")));
})();
ok("Sessiz ses: panel açılışında ölçüm/Premiere çağrısı yok (yalnız Altyazı oluştur / Konuşmadan kes akışında)",
  !/sessizDenetim\(/.test(fnGovde(capSrc, "function init(")) && /\.sessiz-uyari\[hidden\] \{ display: none !important; \}/.test(fs.readFileSync(KOKYOL + "css/style.css", "utf8")));

/* ---------- Canlı transkripsiyon, İptal ve kalan süre (3.2 adım 3) ---------- */
["cap-cancel", "cap-canli", "cap-canli-liste", "cut-cancel", "set-local-cancel", "cap-local-cancel"].forEach(function (id) {
  ok("Canlı transkripsiyon / İptal: #" + id + " var", !!idler[id]);
});
ok("#cap-cancel: 'Altyazı oluştur'un hemen ardında, gizli başlar, 'İptal' yazar, ipucu ne olacağını söyler",
  html.indexOf('id="cap-cancel"') > html.indexOf('id="cap-go"') && html.indexOf('id="cap-cancel"') < html.indexOf('id="cap-restore"') &&
  /<button id="cap-cancel" class="btn outline big iptal-btn" type="button" hidden title="[^"]*ekrandaki altyazı olduğu gibi kalır\.">İptal<\/button>/.test(html));
ok("#cap-canli: durum satırının altında, gizli başlar, 'canlı' rozetli; liste salt okunur ve çeviriden muaf (kullanıcı içeriği)",
  html.indexOf('id="cap-canli"') > html.indexOf('id="cap-status"') && html.indexOf('id="cap-canli"') < html.indexOf('id="cap-result"') &&
  /id="cap-canli" class="canli-kutu"[^>]* hidden>/.test(html) && /<span class="canli-rozet">canlı<\/span>/.test(html) &&
  /id="cap-canli-liste" class="canli-liste" role="log" aria-readonly="true"/.test(html) &&
  /"cap-canli-liste"/.test(fs.readFileSync(KOKYOL + "js/i18n.js", "utf8")));
ok("betik sırası: caption-text.js → whisper-akis.js → captions.js", betikSira("whisper-akis.js") > betikSira("caption-text.js") && betikSira("whisper-akis.js") < betikSira("captions.js"));
var setBusyG = fnGovde(capSrc, "function setBusy(");
ok("setBusy: iş sürerken #cap-go gizlenir, #cap-cancel görünür (ve tersi)", /el\("cap-go"\)\.hidden = b;/.test(setBusyG) && /iptal\.hidden = !b;/.test(setBusyG) && /iptal\.disabled = false;/.test(setBusyG));
ok("#cap-cancel tıklaması jetonu iptal eder (init'te bağlı, Premiere çağrısı yok)", /el\("cap-cancel"\)\.addEventListener\("click", iptalEt\)/.test(fnGovde(capSrc, "function init(")) &&
  /aktifIptal\.iptal\(\);/.test(fnGovde(capSrc, "function iptalEt(")) && !/K\.call\(/.test(fnGovde(capSrc, "function iptalEt(")));
// Çift tıklama (inceleme bulgusu): "Altyazı oluştur" / "Sessizlikleri bul" / "İndir & kur"un ikinci tıkı aynı
// yerde beliren "İptal"e düşüp yeni başlayan işi iptal etmesin. Gerçek iptalEt + setBusy, sahte DOM ve saatle.
var tikKod = "var IPTAL_ACILIS_MS = 500;\n" + fnGovde(fs.readFileSync(KOKYOL + "js/bridge.js", "utf8"), "function iptalTikiGecerli(") + "\n" +
  fnGovde(fs.readFileSync(KOKYOL + "js/bridge.js", "utf8"), "function baslatTikiGecerli(");
function tikDugme() { return { hidden: false, disabled: false, title: "", textContent: "", classList: { toggle: function () {} } }; }
function ciftTikKabi(kod, kur, donus) {
  var dom5 = {}, saat = { t: 50000 }, jet = { iptalEdildi: false, sayi: 0, iptal: function () { jet.sayi++; jet.iptalEdildi = true; } };
  var api = new Function("el", "Date", "status", "refreshButton", "IPTAL_IPUCU", "jeton",
    tikKod + "\nvar K = { iptalTikiGecerli: iptalTikiGecerli, baslatTikiGecerli: baslatTikiGecerli, log: function () {} };\n" + kur + "\n" + kod + "\nreturn " + donus + ";")(
    function (id) { return dom5[id] || (dom5[id] = tikDugme()); }, { now: function () { return saat.t; } }, function () {}, function () {}, "ipucu", jet);
  return { api: api, saat: saat, jet: jet, dom: dom5 };
}
function ciftTikSenaryo(ad, k, dugmeId) {
  k.api.basla();
  k.saat.t += 150;
  k.api.iptalEt({ detail: 2 });             // çift tıkın ikinci tıkı (Chromium: detail 2)
  k.api.iptalEt({ detail: 1 });             // aynı anda tek tık sayılan olay da
  var erken = k.jet.sayi;
  k.saat.t += 600;
  k.api.iptalEt({ detail: 1 });             // gerçek İptal
  ok(ad + ": düğme göründükten hemen sonraki / çift tıkın ikinci tıkı iptal etmez, sonraki tek tık eder",
    erken === 0 && k.jet.sayi === 1 && k.dom[dugmeId].hidden === false && k.dom[dugmeId].disabled === true, "erken=" + erken + " sayi=" + k.jet.sayi);
}
ciftTikSenaryo("Altyazı oluştur → İptal", ciftTikKabi(fnGovde(capSrc, "function iptalEt(") + "\n" + setBusyG,
  "var busy = false, aktifIptal = jeton, iptalAcilis = 0;", "{ basla: function () { busy = true; setBusy(true); }, iptalEt: iptalEt }"), "cap-cancel");
ciftTikSenaryo("Sessizlikleri bul → İptal", ciftTikKabi(fnGovde(fs.readFileSync(KOKYOL + "js/magiccut.js", "utf8"), "function iptalEt(") + "\n" +
  fnGovde(fs.readFileSync(KOKYOL + "js/magiccut.js", "utf8"), "function setBusy("),
  "var busy = false, iptalJetonu = jeton, iptalAcilis = 0;", "{ basla: function () { busy = true; setBusy(true); }, iptalEt: iptalEt }"), "cut-cancel");
ciftTikSenaryo("İndir & kur → İptal (Ayarlar)", ciftTikKabi(fnGovde(appSrc, "function kurulumuIptalEt(") + "\n" + fnGovde(appSrc, "function kurulumIptalDugmeleri("),
  "var installingLocal = false, kurulumJetonu = jeton, kurulumIptalAcilis = 0;",
  "{ basla: function () { installingLocal = true; kurulumIptalDugmeleri(true); }, iptalEt: kurulumuIptalEt }"), "set-local-cancel");
ciftTikSenaryo("Ayarlar › ffmpeg İptal", ciftTikKabi(fnGovde(appSrc, "function ffmpegKurulumunuIptalEt(") + "\n" + fnGovde(appSrc, "function ffmpegIptalDugmesi("),
  "var ffmpegKuruluyor = false, ffmpegJetonu = jeton, ffmpegIptalAcilis = 0;",
  "{ basla: function () { ffmpegKuruluyor = true; ffmpegIptalDugmesi(true); }, iptalEt: ffmpegKurulumunuIptalEt }"), "set-ffmpeg-cancel");
// Ters yön (inceleme bulgusu): İptal'e çift tık. İlk tık işi iptal eder, iş aynı olay döngüsünde biter ve başlatma
// düğmesi İptal'in yerinde yeniden belirir; ikinci tık (detail 2) ya da hemen ardından gelen tık yeni iş açmamalı
// (yeni altyazı işi ses dışa aktarımında İptal'i kilitler). Gerçek iptalEt + setBusy + başlatıcının ilk satırları.
function tersTikSenaryo(ad, k, baslatId, iptalId, programla) {
  k.api.baslat({ detail: 1 });
  var ilk = k.api.sayi();
  k.saat.t += 30000;
  k.api.iptalEt({ detail: 1 });              // çift tıkın ilk tıkı: geçerli İptal
  k.api.bitir();                            // jeton dinleyicisi işi bitirir → finally → başlatma düğmesi geri gelir
  var yerinde = k.dom[baslatId].hidden === false && (!iptalId || k.dom[iptalId].hidden === true);
  k.saat.t += 150;
  k.api.baslat({ detail: 2 });              // aynı çift tıkın ikinci tıkı, artık başlatma düğmesinde
  k.api.baslat({ detail: 1 });              // aynı anda tek tık sayılan olay da
  var erken = k.api.sayi();
  k.saat.t += 600;
  k.api.baslat({ detail: 1 });              // bilerek yapılan yeni tık
  var sonra = k.api.sayi();
  k.api.bitir();
  k.api.baslat(programla);                  // programla çağrı (rehber örneği / Pro "yeniden"): olay yok, hemen geçer
  ok(ad + ": İptal'e çift tıkın ikinci tıkı / düğme geri gelir gelmez gelen tık yeni iş başlatmaz; sonraki tek tık ve programla çağrı başlatır",
    ilk === 1 && k.jet.sayi === 1 && yerinde && erken === 1 && sonra === 2 && k.api.sayi() === 3,
    "ilk=" + ilk + " iptal=" + k.jet.sayi + " yerinde=" + yerinde + " erken=" + erken + " sonra=" + sonra + " son=" + k.api.sayi());
}
var goBas = fnGovde(capSrc, "async function go(");
goBas = goBas.slice(0, goBas.indexOf("var ornek")).replace("async function go(", "function go(");
ok("go(): başlatma tıkı koruması busy denetiminden hemen sonra, jeton/setBusy'den önce",
  /if \(K\.baslatTikiGecerli && !K\.baslatTikiGecerli\(opts, baslatAcilis\)\) return false;/.test(goBas) && /baslatAcilis = b \? 0 : Date\.now\(\);\s*if \(!b\) refreshButton\(\);/.test(setBusyG));
tersTikSenaryo("İptal → Altyazı oluştur", ciftTikKabi(fnGovde(capSrc, "function iptalEt(") + "\n" + setBusyG + "\n" + goBas +
  "  baslatilan++; busy = true; aktifIptal = jeton; setBusy(true); return true;\n  }",
  "var busy = false, aktifIptal = null, iptalAcilis = 0, baslatAcilis = 0, baslatilan = 0;",
  "{ baslat: go, iptalEt: iptalEt, bitir: function () { aktifIptal = null; busy = false; setBusy(false); }, sayi: function () { return baslatilan; } }"),
  "cap-go", "cap-cancel", { ornek: { wav: "ornek.wav" } });
var cutSrc2 = fs.readFileSync(KOKYOL + "js/magiccut.js", "utf8");
var anBas = fnGovde(cutSrc2, "async function analyze(");
ok("analyze(): başlatma tıkı koruması Pro kapısından önce (başıboş tık deneme penceresi açmaz)",
  anBas.indexOf("K.baslatTikiGecerli(ev, baslatAcilis)") > 0 && anBas.indexOf("K.baslatTikiGecerli(ev, baslatAcilis)") < anBas.indexOf("Pro.gate(") &&
  /el\("cut-analyze"\)\.addEventListener\("click", analyze\)/.test(cutSrc2));
anBas = anBas.slice(0, anBas.indexOf("// Pro:")).replace("async function analyze(", "function analyze(");
tersTikSenaryo("İptal → Sessizlikleri bul", ciftTikKabi(fnGovde(cutSrc2, "function iptalEt(") + "\n" + fnGovde(cutSrc2, "function setBusy(") + "\n" + anBas +
  "  baslatilan++; busy = true; iptalJetonu = jeton; setBusy(true); return true;\n  }",
  "var busy = false, iptalJetonu = null, iptalAcilis = 0, baslatAcilis = 0, baslatilan = 0;",
  "{ baslat: analyze, iptalEt: iptalEt, bitir: function () { iptalJetonu = null; busy = false; setBusy(false); }, sayi: function () { return baslatilan; } }"),
  "cut-analyze", "cut-cancel");
ok("İndir & kur (Ayarlar ve Altyazı kurulum kartı) ve ffmpeg düğmeleri başlatma tıkı korumasından geçer",
  /el\("set-local-install"\)\.addEventListener\("click", function \(ev\) \{ if \(kurulumTikiGecerli\(ev\)\) installLocalWhisper\(\); \}\)/.test(appSrc) &&
  /kurulumTikiGecerli: kurulumTikiGecerli/.test(appSrc) &&
  /el\("cap-local-install"\)\.addEventListener\("click", function \(ev\) \{[\s\S]{0,160}if \(KApp\.kurulumTikiGecerli && !KApp\.kurulumTikiGecerli\(ev\)\) return;/.test(capSrc) &&
  /el\("set-ffmpeg-install"\)\.addEventListener\("click", function \(ev\) \{ if \(ffmpegTikiGecerli\(ev\)\) installFfmpeg\(\); \}\)/.test(appSrc) &&
  /el\("set-ffmpeg-recheck"\)\.addEventListener\("click", function \(ev\) \{ if \(ffmpegTikiGecerli\(ev\)\) checkFfmpeg\(true\); \}\)/.test(appSrc));
tersTikSenaryo("İptal → İndir & kur (Ayarlar)", ciftTikKabi(fnGovde(appSrc, "function kurulumuIptalEt(") + "\n" + fnGovde(appSrc, "function kurulumIptalDugmeleri(") + "\n" +
  fnGovde(appSrc, "function kurulumTikiGecerli(") + "\n" +
  "function baslat(ev) { if (!kurulumTikiGecerli(ev) || installingLocal) return; baslatilan++; installingLocal = true; el('set-local-install').hidden = true; kurulumIptalDugmeleri(true); }",
  "var installingLocal = false, kurulumJetonu = jeton, kurulumIptalAcilis = 0, kurulumBaslatAcilis = 0, baslatilan = 0;",
  "{ baslat: baslat, iptalEt: kurulumuIptalEt, bitir: function () { installingLocal = false; kurulumIptalDugmeleri(false); el('set-local-install').hidden = false; }, sayi: function () { return baslatilan; } }"),
  "set-local-install", "set-local-cancel");
tersTikSenaryo("İptal → ffmpeg indir ve kur (Ayarlar)", ciftTikKabi(fnGovde(appSrc, "function ffmpegKurulumunuIptalEt(") + "\n" + fnGovde(appSrc, "function ffmpegIptalDugmesi(") + "\n" +
  fnGovde(appSrc, "function ffmpegTikiGecerli(") + "\n" +
  "function baslat(ev) { if (!ffmpegTikiGecerli(ev) || ffmpegKuruluyor) return; baslatilan++; ffmpegKuruluyor = true; el('set-ffmpeg-install').disabled = true; ffmpegIptalDugmesi(true); }",
  "var ffmpegKuruluyor = false, ffmpegJetonu = jeton, ffmpegIptalAcilis = 0, ffmpegBaslatAcilis = 0, baslatilan = 0;",
  "{ baslat: baslat, iptalEt: ffmpegKurulumunuIptalEt, bitir: function () { ffmpegKuruluyor = false; ffmpegIptalDugmesi(false); el('set-ffmpeg-install').disabled = false; }, sayi: function () { return baslatilan; } }"),
  "set-ffmpeg-install", "set-ffmpeg-cancel");
// README "ffmpeg indirmesi (Ayarlar …) iptal edilebilir" diyor: Ayarlar › ffmpeg satırının da İptal'i olmalı (inceleme bulgusu)
var ffKur = fnGovde(appSrc, "async function installFfmpeg(");
ok("Ayarlar › ffmpeg: #set-ffmpeg-cancel kur düğmesinin yanında, gizli başlar; jeton KEngine.installFfmpeg'e gider; iptal kırmızı hata değil uyarı",
  !!idler["set-ffmpeg-cancel"] && html.indexOf('id="set-ffmpeg-cancel"') > html.indexOf('id="set-ffmpeg-install"') &&
  html.indexOf('id="set-ffmpeg-cancel"') < html.indexOf('id="set-ffmpeg-recheck"') && /id="set-ffmpeg-cancel"[^>]* hidden/.test(html) &&
  /KEngine\.installFfmpeg\(say, ffmpegJetonu\)/.test(ffKur) && /if \(e && e\.iptal\) \{[\s\S]{0,200}"inline-status warn"/.test(ffKur) &&
  /ffmpegIptalDugmesi\(false\)/.test(ffKur) && /el\("set-ffmpeg-cancel"\)\.addEventListener\("click", ffmpegKurulumunuIptalEt\)/.test(appSrc));
var goG2 = fnGovde(capSrc, "async function go(");
ok("go(): jeton ve geçici satırlar işle başlar, finally'de bırakılır; İptal 'İptal edildi.' uyarısı (hata değil)",
  /aktifIptal = K\.iptalJetonu \? K\.iptalJetonu\(\) : null;\s*canliBaslat\(\);/.test(goG2) &&
  /finally \{[\s\S]*canliBitir\(\);\s*aktifIptal = null;/.test(goG2) && /sonUyari = "İptal edildi\.";\s*status\(sonUyari, "warn"\);/.test(goG2) &&
  // setBusy(false) → refreshButton yalnız kırmızı hatayı korur: "İptal edildi." ondan sonra yeniden yazılır
  /setBusy\(false\);\s*\/\/[^\n]*\n\s*if \(sonUyari\) status\(sonUyari, "warn"\);/.test(goG2));
ok("go(): ses dışa aktarımı (senkron ExtendScript) sırasında İptal kapalı, sonra açılır",
  goG2.indexOf("iptalKilidi(true)") > 0 && goG2.indexOf("iptalKilidi(true)") < goG2.indexOf('K.call("KS_exportAudio"') &&
  goG2.indexOf('K.call("KS_exportAudio"') < goG2.indexOf("iptalKilidi(false)") && /Premiere sesi dışa aktarıyor; bu adım yarıda kesilemez/.test(capSrc));
ok("go(): jeton convertAudio'ya, toplu döngüye ve ffmpeg kurulumuna gider; toplu döngü klipler arasında denetler",
  (goG2.match(/iptal: aktifIptal/g) || []).length >= 3 && /installFfmpeg\(function \(m\) \{ status\(m\); \}, aktifIptal\)/.test(goG2) &&
  /for \(var bi = 0; bi < batchClips\.length; bi\+\+\) \{\s*iptalDenetle\(\);/.test(goG2) && /if \(eB && eB\.iptal\) throw eB;/.test(goG2));
var tlG = fnGovde(capSrc, "async function transcribeLocal(");
ok("yerelCalistir: jeton ve onStdout K.run'a gider; iptalde JSON silinir; -ml 1 yedeğinde akış kapalı; kalan turu kendi ofsetiyle",
  /iptal: iptal,\s*onStdout: ayristir \?/.test(fnGovde(capSrc, "async function yerelCalistir(")) && /if \(r\.iptal\) \{[\s\S]{0,200}unlinkSync\(jsonPath\)/.test(fnGovde(capSrc, "async function yerelCalistir(")) &&
  /" · kelime zamanı", null\)/.test(tlG) && /var kalanAkis = kelimeYedegi \? null : akis\(kesBas,/.test(tlG) && tlG.indexOf("canliKirp(") < tlG.indexOf('outBase + "_kalan", " · kalan kısım"') &&
  /if \(eK && eK\.iptal\) throw eK;/.test(tlG));
ok("transcribeSuflo: İptal bulut yedeğine geçmez", /if \(eLocal && eLocal\.iptal\) throw eLocal;/.test(fnGovde(capSrc, "async function transcribeSuflo(")));
// Geçici satırlar belgeye girmez: işlevler gerçek DOM'suz bir kapta çalıştırılır
var canliKod = ["function canliZaman(", "function canliBaslat(", "function canliSatirDom(", "function canliEkle(", "function canliKirp(", "function canliBitir(", "function durumAl("]
  .map(function (imza) { return fnGovde(capSrc, imza); }).join("\n");
ok("geçici satır işlevleri segments / geri al / taslak / önbelleğe dokunmaz (kaynakta)", ["function canliBaslat(", "function canliEkle(", "function canliKirp(", "function canliBitir("].every(function (imza) {
  var g = fnGovde(capSrc, imza);
  return g && !/\bsegments\b|undoStack|redoStack|saveDraft|snapshot\(|transcriptCache|K\.call\(/.test(g);
}));
function sahteDugum() {
  var d = { childNodes: [], hidden: true, textContent: "", className: "", scrollTop: 0, scrollHeight: 0 };
  d.appendChild = function (c) { d.childNodes.push(c); return c; };
  d.removeChild = function (c) { d.childNodes.splice(d.childNodes.indexOf(c), 1); return c; };
  Object.defineProperty(d, "firstChild", { get: function () { return d.childNodes[0]; } });
  Object.defineProperty(d, "innerHTML", { set: function () { d.childNodes = []; }, get: function () { return ""; } });
  return d;
}
var dom = { "cap-canli": sahteDugum(), "cap-canli-liste": sahteDugum() };
var kap = new Function("el", "tc", "document", "CANLI_GOSTER",
  "var canliIs = null, segments = [{ start: 1, end: 2, text: 'Önceki belge' }], segmentsMode = 'plain', ceviriDili = '', algilananDil = 'tr', shortsYuklenen = '', ornekBelge = false;\n" +
  "var undoStack = [], redoStack = [];\n" + canliKod +
  "\nreturn { canliBaslat: canliBaslat, canliEkle: canliEkle, canliKirp: canliKirp, canliBitir: canliBitir, durumAl: durumAl, " +
  "segments: function () { return segments; }, undo: function () { return undoStack.length + redoStack.length; }, is: function () { return canliIs; } };")(
  function (id) { return dom[id] || null; },
  function (sn) { var t = Math.round(sn * 1000), h = Math.floor(t / 3600000), m = Math.floor(t % 3600000 / 60000), s2 = Math.floor(t % 60000 / 1000);
    function p(n) { return (n < 10 ? "0" : "") + n; } return p(h) + ":" + p(m) + ":" + p(s2) + "." + ("00" + (t % 1000)).slice(-3); },
  { createElement: function () { return sahteDugum(); } }, 3);
kap.canliBaslat();
kap.canliEkle([{ start: 5, end: 6, text: "canlı bir" }, { start: 6, end: 7, text: "canlı iki" }]);
kap.canliEkle([{ start: 7, end: 8, text: "canlı üç" }, { start: 3725, end: 3726, text: "canlı dört" }]);
var liste = dom["cap-canli-liste"];
ok("canlı satırlar listede (en çok CANLI_GOSTER), kutu açılır, saat ≥ 1'de h:mm:ss",
  dom["cap-canli"].hidden === false && liste.childNodes.length === 3 && liste.childNodes[0].childNodes[1].textContent === "canlı iki" &&
  liste.childNodes[2].childNodes[0].textContent === "01:02:05" && liste.childNodes[1].childNodes[0].textContent === "00:07" && kap.is().satirlar.length === 4,
  liste.childNodes.map(function (c) { return c.childNodes[0].textContent + " " + c.childNodes[1].textContent; }).join(" | "));
var belge = JSON.parse(kap.durumAl("x").segs);
ok("geçici satırlar belgeye, geri al girdisine ve geri al yığınına girmez",
  kap.segments().length === 1 && belge.length === 1 && belge[0].text === "Önceki belge" && kap.undo() === 0 && JSON.stringify(kap.durumAl("x")).indexOf("canlı") === -1);
kap.canliKirp(7);
ok("takılma kurtarması: sınırdan sonraki geçici satırlar silinir, öncekiler kalır", kap.is().satirlar.length === 2 && liste.childNodes.length === 2 &&
  liste.childNodes[1].childNodes[1].textContent === "canlı iki");
kap.canliBitir();
ok("iş bitince geçici satırlar gider, kutu kapanır", kap.is() === null && liste.childNodes.length === 0 && dom["cap-canli"].hidden === true && kap.segments().length === 1);
// yerelCalistir gerçek kodu, sahte K.run ile: stdout satırları canlı satır olur (ofset + hız), durum satırı
// '… satır · %… ' biçiminde; iptalde JSON silinir ve iptal hatası atılır, geçici satırlar belgeye girmez
var osm = require("os"), pathm = require("path");
var calismaDiz = fs.mkdtempSync(pathm.join(osm.tmpdir(), "suflo-canli-"));
var fikstur = fs.readFileSync(KOKYOL + "tests/fixtures/whisper-ojf-tr.json");
function yerelKap(senaryo) {
  var durumlar = [], dom2 = { "cap-canli": sahteDugum(), "cap-canli-liste": sahteDugum() };
  var K2 = {
    fs: fs, log: function () {},
    iptalHatasi: function (m) { var e = new Error(m || "İptal edildi"); e.iptal = true; return e; },
    run: function (exe, args, o) { return senaryo(o, args); }
  };
  var kod = ["function iptalHatasiYap(", "function iptalDenetle(", "function canliZaman(", "function canliBaslat(", "function canliSatirDom(",
    "function canliEkle(", "function canliKirp(", "function canliBitir(", "async function yerelCalistir("].map(function (imza) { return fnGovde(capSrc, imza); }).join("\n");
  var api = new Function("K", "WA", "WW", "el", "tc", "document", "status", "CANLI_GOSTER", "jeton",
    "var aktifIptal = jeton, canliIs = null, algilananDil = '';\nfunction dilKodu(x) { return x; }\n" + kod +
    "\nreturn { yerelCalistir: yerelCalistir, canliBaslat: canliBaslat, is: function () { return canliIs; }, ayarla: function (o) { for (var k in o) canliIs[k] = o[k]; } };")(
    K2, require(KOKYOL + "js/whisper-akis.js"), require(KOKYOL + "js/whisper-words.js"), function (id) { return dom2[id] || null; },
    function (sn) { var t = Math.round(sn * 1000), m = Math.floor(t % 3600000 / 60000), s2 = Math.floor(t % 60000 / 1000); return "00:" + (m < 10 ? "0" : "") + m + ":" + (s2 < 10 ? "0" : "") + s2 + ".000"; },
    { createElement: function () { return sahteDugum(); } }, function (m) { durumlar.push(m); }, 200, senaryo.jeton || null);
  return { api: api, dom: dom2, durumlar: durumlar };
}
var outBaseC = pathm.join(calismaDiz, "cap_1_w");
var y1 = yerelKap(function (o, args) {
  o.onStderr("whisper_print_progress_callback: progress =  25%\n");
  o.onStdout("[00:00:01.000 --> 00:00:02.500]  Merhaba ");
  o.onStdout("dünya\n[00:00:02.500 --> 00:00:03.000]  [Müzik]\n[00:00:03.000 --> 00:00:04.000]  ikinci satır");
  fs.writeFileSync(outBaseC + ".json", fikstur);
  return Promise.resolve({ code: 0, stdout: "", stderr: "" });
});
y1.api.canliBaslat();
y1.api.ayarla({ ofset: 10, carpan: 0.5 });
var bekleyenUI = y1.api.yerelCalistir("whisper-cli", ["-f", "a.wav"], outBaseC, "", { ofset: 10, carpan: 0.5, toplamSn: 120, onEk: "" }).then(function (segs) {
  var satirlar = y1.api.is().satirlar;
  ok("yerelCalistir: stdout satırları canlı satır (kapsam ofseti + hız eşlemesi), etiket satırı atlanır, son satır bitir() ile gelir",
    satirlar.length === 2 && satirlar[0].start === 10.5 && satirlar[0].end === 11.25 && satirlar[0].text === "Merhaba dünya" && satirlar[1].text === "ikinci satır" &&
    y1.dom["cap-canli"].hidden === false, JSON.stringify(satirlar));
  ok("yerelCalistir: nihai satırlar JSON'dan (geçici satırlardan değil), JSON silinir", segs.length > 0 && !fs.existsSync(outBaseC + ".json") &&
    segs.every(function (x) { return x.text !== "Merhaba dünya"; }), segs.length);
  ok("yerelCalistir: durum satırı '… satır · %… · ~… kaldı · …× gerçek zaman'", y1.durumlar.some(function (d) { return /^\d+ satır · %\d+/.test(d) || /^Transkribe ediliyor… · %\d+/.test(d); }) &&
    y1.durumlar.some(function (d) { return /%25/.test(d); }), y1.durumlar.join(" | "));
  // İptal: süreç { code: -2, iptal: true } döner, yarım JSON silinir, iptal hatası atılır
  var j = { iptalEdildi: false, dinle: function () { return function () {}; } };
  var y2 = yerelKap(Object.assign(function (o) {
    o.onStdout("[00:00:00.000 --> 00:00:01.000]  yarım\n");
    fs.writeFileSync(outBaseC + "2.json", "{}");
    j.iptalEdildi = true;
    return Promise.resolve({ code: -2, iptal: true, stdout: "", stderr: "" });
  }, { jeton: j }));
  y2.api.canliBaslat();
  return y2.api.yerelCalistir("whisper-cli", [], outBaseC + "2", "", { ofset: 0, carpan: 1, toplamSn: 60, onEk: "" }).then(function () {
    ok("yerelCalistir iptali hata atmalıydı", false);
  }, function (e) {
    ok("yerelCalistir iptali: e.iptal, yarım JSON silinir, jeton K.run'a verilir", e && e.iptal === true && !fs.existsSync(outBaseC + "2.json"), e && e.message);
  });
}).then(function () {
  // -ml 1 yedeği (akis null): akış yok, eski ilerleme metni
  var y3 = yerelKap(function (o) {
    ok("akış kapalıyken onStdout verilmez", o.onStdout === null);
    o.onStderr("progress = 40%\n");
    fs.writeFileSync(outBaseC + "3.json", fikstur);
    return Promise.resolve({ code: 0, stdout: "", stderr: "" });
  });
  y3.api.canliBaslat();
  return y3.api.yerelCalistir("whisper-cli", [], outBaseC + "3", " · kelime zamanı", null).then(function () {
    ok("akış kapalıyken (-ml 1) eski ilerleme metni ve geçici satır yok", y3.durumlar.indexOf("Transkribe ediliyor… %40 (yerel · kelime zamanı)") !== -1 && y3.api.is().satirlar.length === 0,
      y3.durumlar.join(" | "));
  });
}).catch(function (e) { ok("yerelCalistir kabı çöktü: " + (e && e.stack || e), false); }).then(function () {
  try { fs.readdirSync(calismaDiz).forEach(function (f) { fs.unlinkSync(pathm.join(calismaDiz, f)); }); fs.rmdirSync(calismaDiz); } catch (e) {}
});
var mcSrc = fs.readFileSync(KOKYOL + "js/magiccut.js", "utf8");
ok("Otomatik Kesim: ffmpeg analizi jetonla, iptal 'İptal edildi.' uyarısı, #cut-cancel 'Sessizlikleri bul'un yerini alır",
  /iptal: jeton \}\);/.test(mcSrc) && /if \(res\.iptal\) \{ status\("İptal edildi\.", "warn"\); return; \}/.test(mcSrc) &&
  /el\("cut-analyze"\)\.hidden = b;/.test(mcSrc) && /el\("cut-cancel"\)\.addEventListener\("click", iptalEt\)/.test(mcSrc) &&
  html.indexOf('id="cut-cancel"') > html.indexOf('id="cut-analyze"') && /id="cut-cancel"[^>]* hidden/.test(html));
var kur = fnGovde(appSrc, "async function installLocalWhisper(");
ok("Kurulum İptal: jeton KEngine.install'a gider, iptal kırmızı hata değil uyarı; düğmeler yalnız kurulum sürerken görünür",
  /iptal: kurulumJetonu/.test(kur) && /if \(e && e\.iptal\)/.test(kur) && /kurulumIptalDugmeleri\(true\)/.test(kur) && /kurulumIptalDugmeleri\(false\)/.test(kur) &&
  /id="set-local-cancel"[^>]* hidden/.test(html) && /id="cap-local-cancel"[^>]* hidden/.test(html));
var cssSrc = fs.readFileSync(KOKYOL + "css/style.css", "utf8");
ok("CSS: busy düğmesi (inline-flex) gizlenince görünmez; canlı satırlar soluk", /#cap-go\[hidden\], #cut-analyze\[hidden\] \{ display: none !important; \}/.test(cssSrc) &&
  /\.canli-satir \{[^}]*opacity: \.78/.test(cssSrc) && /\.canli-kutu\[hidden\] \{ display: none !important; \}/.test(cssSrc));

bekleyenUI.then(function () {
  console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
  process.exit(kaldi ? 1 : 0);
});
