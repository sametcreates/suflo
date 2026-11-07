// Suflo testi: Altyazı sekmesinin üç adımlı işaretlemesi (parti 4) — index.html ağacı (tests/_html-agac.js)
//  - #cap-main: adım çubuğu, sonra sırayla #cap-adim-olustur, #cap-adim-stil, #cap-adim-uygula
//  - parti 4 öncesi sekmedeki her kimlik (tests/fixtures/altyazi-sekmesi-idler.json, git show HEAD:index.html'den)
//    sekmede tam bir kez; data-yalniz-premiere / data-yalniz-ae işaretleri aynı öğelerde
//  - gelişmiş kontroller doğru katlanır bölümde (Gelişmiş ayarlar, Diğer araçlar, Özelleştir, Premiere şablonları)
//  - ilk açılışta görünen kontrol sayısı (Premiere, transkript yok, katlı bölümler kapalı) ≤ 14
var fs = require("fs"), path = require("path");
var H = require("./_html-agac.js");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 400) + "]" : "")); }

var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
var FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "altyazi-sekmesi-idler.json"), "utf8"));
var bas = html.indexOf('<section id="tab-captions"'), son = html.indexOf("<!-- ================= KESIM", bas);
var sekme = H.agac(html.slice(bas, son));
var tum = H.agac(html);
function id(x) { return H.bul(sekme, x); }
function icinde(cocuk, ataId) { var c = id(cocuk); return !!(c && H.ata(c, function (p) { return p.attrs && p.attrs.id === ataId; })); }
function detailsIcinde(cocuk) { var c = id(cocuk); return !!(c && H.ata(c, function (p) { return p.tag === "details"; })); }
function ilkDetails(cocuk) { var c = id(cocuk); var d = c && H.ata(c, function (p) { return p.tag === "details"; }); return d ? d.attrs.id || "(adsız)" : ""; }

/* ---------------- 1) üç adım, sırayla ---------------- */
var main = id("cap-main");
var dogrudan = main.children.filter(function (c) { return c.tag[0] !== "#"; });
ok("#cap-main: adım çubuğu ve üç adım bölümü, bu sırayla (başka doğrudan çocuk yok)",
  dogrudan.map(function (c) { return c.attrs.id; }).join(",") === "cap-adimlar,cap-adim-olustur,cap-adim-stil,cap-adim-uygula",
  dogrudan.map(function (c) { return c.attrs.id; }).join(","));
ok("adım bölümleri <section class=\"cap-adim\"> ve başlıkları 1 Oluştur / 2 Stil seç / 3 Uygula",
  ["olustur", "stil", "uygula"].every(function (a) { var s = id("cap-adim-" + a); return s.tag === "section" && H.sinifVar(s, "cap-adim"); }) &&
  H.metni(id("cap-adim-olustur-baslik")) === "1Oluştur" && H.metni(id("cap-adim-stil-baslik")) === "2Stil seç" && H.metni(id("cap-adim-uygula-baslik")) === "3Uygula",
  [H.metni(id("cap-adim-olustur-baslik")), H.metni(id("cap-adim-stil-baslik")), H.metni(id("cap-adim-uygula-baslik"))].join("|"));
var cubuk = H.hepsi(id("cap-adimlar"), function (d) { return d.tag === "button"; });
ok("adım çubuğu: üç düğme, her biri kendi bölümünü denetler ve bir durum etiketi taşır",
  cubuk.length === 3 && cubuk.every(function (b, i) {
    var ad = ["olustur", "stil", "uygula"][i];
    return b.attrs.id === "cap-adimlar-" + ad && b.attrs["aria-controls"] === "cap-adim-" + ad && b.attrs.type === "button" &&
      !!H.bul(b, "cap-adimlar-" + ad + "-durum");
  }), cubuk.map(function (b) { return b.attrs.id; }).join(","));
ok("adım başlıkları odaklanabilir (tabindex=-1, sekme sırasına girmez)",
  ["olustur", "stil", "uygula"].every(function (a) { return id("cap-adim-" + a + "-baslik").attrs.tabindex === "-1"; }));

/* ---------------- 2) eski kimlikler: tam bir kez, data-yalniz-* aynı öğede ---------------- */
var sayac = {};
H.gez(sekme, function (d) { if (d.attrs && d.attrs.id) sayac[d.attrs.id] = (sayac[d.attrs.id] || 0) + 1; });
var eksik = FIX.idler.filter(function (x) { return !sayac[x]; });
var cift = Object.keys(sayac).filter(function (x) { return sayac[x] !== 1; });
ok("parti 4 öncesi " + FIX.idler.length + " kimliğin hepsi Altyazı sekmesinde", FIX.idler.length === 298 && eksik.length === 0, eksik.join(","));
ok("sekmede hiçbir kimlik iki kez yok", cift.length === 0, cift.join(","));
var tumSayac = {};
H.gez(tum, function (d) { if (d.attrs && d.attrs.id) tumSayac[d.attrs.id] = (tumSayac[d.attrs.id] || 0) + 1; });
ok("eski kimlikler sayfanın tamamında da tam bir kez", FIX.idler.every(function (x) { return tumSayac[x] === 1; }),
  FIX.idler.filter(function (x) { return tumSayac[x] !== 1; }).join(","));
ok("data-yalniz-premiere işaretli eski öğeler işaretini korur",
  FIX.yalnizPremiere.every(function (x) { return "data-yalniz-premiere" in id(x).attrs; }), FIX.yalnizPremiere.join(","));
ok("data-yalniz-ae işaretli eski öğeler işaretini korur", FIX.yalnizAe.every(function (x) { return "data-yalniz-ae" in id(x).attrs; }));
ok("kimliksiz Premiere'e özgü öğeler de işaretli (In → Out, Sekans, iki ekleme satırı, Otomatik Kesim ipucu)",
  H.hepsi(id("cap-scope"), function (d) { return d.tag === "button" && "data-yalniz-premiere" in d.attrs; }).length === 2 &&
  "data-yalniz-premiere" in H.ata(id("cap-apply"), function (p) { return H.sinifVar(p, "caption-apply-actions"); }).attrs &&
  H.hepsi(id("cap-adim-uygula"), function (d) { return H.sinifVar(d, "cross-tip") && !d.attrs.id && "data-yalniz-premiere" in d.attrs; }).length === 1);

/* ---------------- 3) bölümler ve katlanır alanlar ---------------- */
ok("1. adım görünür: kapsam, Dil, Satır uzunluğu, Altyazı oluştur, İptal, ilerleme, canlı kutu, sessiz ses uyarısı, SRT içe aktar",
  ["cap-scope", "cap-lang", "cap-maxlen", "cap-go", "cap-cancel", "cap-progress", "cap-status", "cap-canli", "cap-sessiz", "cap-import-srt"].every(function (x) {
    return icinde(x, "cap-adim-olustur") && !detailsIcinde(x);
  }));
var gelismis = id("cap-gelismis");
ok("Gelişmiş ayarlar <details>, katlı (open yok), 1. adımda",
  gelismis.tag === "details" && !("open" in gelismis.attrs) && icinde("cap-gelismis", "cap-adim-olustur") && /^Gelişmiş ayarlar/.test(H.metni(gelismis.children.filter(function (c) { return c.tag === "summary"; })[0])));
ok("Gelişmiş ayarlar: Kelime sınırı, DTW, Yazım biçimi + Noktalama, Çevrimdışı İngilizce, Ses katmanları",
  ["cap-kelime-siniri", "cap-kelime-siniri-alan", "cap-dtw", "cap-dtw-sar", "cap-dtw-not", "cap-case", "cap-punct", "cap-cevir-en", "cap-cevir-en-sar", "cap-cevir-en-not", "cap-tracks-card", "cap-tracks"].every(function (x) {
    return ilkDetails(x) === "cap-gelismis";
  }), ["cap-kelime-siniri", "cap-dtw", "cap-case", "cap-punct", "cap-cevir-en", "cap-tracks-card"].map(ilkDetails).join(","));
ok("düzenleyici (#cap-result) 1. adımda 'Metni kontrol et'; puan, arama, Kontrol gerekenler, Nizami düzelt, emoji / vurgu, geri al / yinele, satırlar katlanmadan",
  icinde("cap-result", "cap-adim-olustur") && /Metni kontrol et/.test(H.metni(id("cap-result"))) &&
  ["cap-quality-score", "cap-editor-search", "cap-filter-issues", "cap-auto-fix", "cap-auto-emoji", "cap-auto-vurgu", "cap-undo", "cap-redo", "cap-segments"].every(function (x) {
    return icinde(x, "cap-result") && !detailsIcinde(x);
  }));
var diger = id("cap-diger-araclar");
ok("Diğer araçlar <details>, katlı, düzenleyicinin içinde",
  diger.tag === "details" && !("open" in diger.attrs) && icinde("cap-diger-araclar", "cap-result"));
ok("Diğer araçlar: çeviri, çok dilli paket, Bölümler, Viral anlar (+ Shorts paketi), B-roll, Bul & değiştir, tümünü kaydır",
  ["cap-translate", "cap-translate-go", "cap-paket-box", "cap-ch-box", "cap-vr-box", "cap-br-box", "cap-find", "cap-replace", "cap-fr-go", "cap-shift-back", "cap-shift-fwd"].every(function (x) {
    return icinde(x, "cap-diger-araclar");
  }) && icinde("cap-paket", "cap-vr-box") && ilkDetails("cap-paket-go") === "cap-paket-box" && ilkDetails("cap-ch-suggest") === "cap-ch-box" &&
  ilkDetails("cap-vr-bul") === "cap-vr-box" && ilkDetails("cap-paket-olustur") === "cap-paket" && ilkDetails("cap-br-bul") === "cap-br-box" && ilkDetails("cap-fr-go") !== "cap-diger-araclar");
ok("iç <details>'ler korunur (paket, bölümler, viral anlar, Shorts paketi, B-roll, bul & değiştir)",
  ["cap-paket-box", "cap-ch-box", "cap-vr-box", "cap-paket", "cap-br-box"].every(function (x) { return id(x).tag === "details"; }) &&
  H.hepsi(diger, function (d) { return d !== diger && d.tag === "details"; }).length === 6);

ok("2. adım görünür: kategori sekmeleri, çipler, canlı önizleme, Animasyon seçici",
  ["cap-efekt-kategoriler", "cap-efekt-gorunumler", "cap-onizleme", "cap-sahne", "cap-efekt-anim"].every(function (x) {
    return icinde(x, "cap-adim-stil") && !detailsIcinde(x);
  }));
var oz = id("cap-ozellestir");
ok("Özelleştir <details>, katlı, oluşturucunun içinde (Animasyon seçicisinden sonra)",
  oz.tag === "details" && !("open" in oz.attrs) && icinde("cap-ozellestir", "cap-efekt-ayarlar") &&
  html.indexOf('id="cap-efekt-anim"') < html.indexOf('id="cap-ozellestir"'));
var OZEL = ["cap-efekt-giris", "cap-efekt-aktif", "cap-efekt-vurgu", "cap-renk-vurgu", "cap-renk", "cap-renk-kontur", "cap-font", "cap-efekt-kalin", "cap-efekt-italik",
  "cap-boyut", "cap-kontur", "cap-efekt-golge", "cap-efekt-golge-renk", "cap-efekt-golge-opak", "cap-efekt-golge-mesafe", "cap-efekt-golge-yumusak",
  "cap-kutu", "cap-kutu-renk", "cap-kutu-opak", "cap-efekt-satir", "cap-efekt-kelime", "cap-konum", "cap-konum-sifirla", "cap-guvenli-alan", "cap-guvenli-yerlesim",
  "cap-efekt-cikti", "cap-yerel-font-kur", "cap-yerel-kaldir", "cap-stil-kod", "cap-stil-kod-uygula", "cap-stil-ice"];
ok("Özelleştir: renkler, yazı tipi, boyut, kontur, gölge, kutu, satır, kelime, konum, güvenli alan, klasik giriş / vurgu, çıktı, stil kodu",
  OZEL.every(function (x) { return ilkDetails(x) === "cap-ozellestir"; }), OZEL.filter(function (x) { return ilkDetails(x) !== "cap-ozellestir"; }).join(","));
ok("'Paylaş ve kaydet' (#cap-ince-ayar) Özelleştir'in içinde, kendi <details>'i olarak",
  id("cap-ince-ayar").tag === "details" && icinde("cap-ince-ayar", "cap-ozellestir") && ilkDetails("cap-stil-paylas") === "cap-ince-ayar");
var ms = id("cap-mogrt-sar");
ok("Premiere şablonları <details> 'Premiere şablonları (31)', katlı, yalnız Premiere; #cap-stil-grid içinde",
  ms.tag === "details" && !("open" in ms.attrs) && "data-yalniz-premiere" in ms.attrs && ilkDetails("cap-stil-grid") === "cap-mogrt-sar" &&
  /^Premiere şablonları \(31\)/.test(H.metni(ms.children.filter(function (c) { return c.tag === "summary"; })[0])) && icinde("cap-mogrt-sar", "cap-adim-stil"));
ok("eski değer taşıyıcıları (.ia-eski) gizli kalır, 2. adımda",
  icinde("cap-yogunluk", "cap-adim-stil") && "hidden" in H.ata(id("cap-yogunluk"), function (p) { return H.sinifVar(p, "ia-eski"); }).attrs);

ok("3. adım: tek düğme, tür seçimi (radyo grubu), boş durum ipucu",
  icinde("cap-uygula-tek", "cap-adim-uygula") && id("cap-uygula-tur").attrs.role === "radiogroup" && icinde("cap-uygula-tur", "cap-adim-uygula") &&
  id("cap-uygula-tur-stil").attrs.role === "radio" && id("cap-uygula-tur-duz").attrs.role === "radio" &&
  /Stilli · Altyazı Efektleri/.test(H.metni(id("cap-uygula-tur-stil"))) && /PRO/.test(H.metni(id("cap-uygula-tur-stil"))) &&
  H.metni(id("cap-uygula-tur-duz")) === "Düz altyazı izi · ücretsiz" && H.metni(id("cap-uygula-tek-metin")) === "Timeline'a uygula" &&
  /^Önce altyazı oluştur/.test(H.metni(id("cap-uygula-bos"))) && "disabled" in id("cap-uygula-tek").attrs);
ok("özgün ekleme düğmeleri DOM'da, 3. adımda, gizli satırda (Premiere ve AE)",
  ["cap-apply", "cap-apply-style", "ae-ekle", "ae-ekle-stil"].every(function (x) {
    var asil = H.ata(id(x), function (p) { return H.sinifVar(p, "cap-uygula-asil"); });
    return icinde(x, "cap-adim-uygula") && asil && "hidden" in asil.attrs;
  }));
ok("'Suflo altyazılarını kaldır' (AE) gizli satırın dışında, AE kutusunda bağlantı olarak",
  icinde("ae-kaldir", "ae-altyazi") && !H.ata(id("ae-kaldir"), function (p) { return H.sinifVar(p, "cap-uygula-asil"); }) && H.sinifVar(id("ae-kaldir"), "link-btn"));
ok("'Dosya olarak indir' satırı 3. adımda: biçim seçici + indir (+ çift dilli)",
  icinde("cap-export-fmt", "cap-uygula-indir") && icinde("cap-save", "cap-uygula-indir") && icinde("cap-cift-dil", "cap-uygula-indir") &&
  /Dosya olarak indir/.test(H.metni(id("cap-uygula-indir"))) && icinde("cap-uygula-indir", "cap-adim-uygula"));
ok("transkript yokken 3. adımın tür seçimi ve ek satırları gizli", "hidden" in id("cap-uygula-govde").attrs && "hidden" in id("cap-uygula-ek").attrs);
ok("akış betiği captions.js'ten önce yüklenir",
  html.indexOf('<script src="js/altyazi-akis.js"></script>') > 0 && html.indexOf('<script src="js/altyazi-akis.js"></script>') < html.indexOf('<script src="js/captions.js"></script>'));

/* ---------------- 4) ilk açılışta görünen kontroller ---------------- */
/*
 * Sayım (#cap-main, Premiere, transkript yok, katlı bölümler kapalı): görünür (kendisi ya da atası hidden değil,
 * data-yalniz-ae değil, kapalı bir <details>'in özeti dışındaki içeriği değil) her düğme, seçici, giriş (hidden türü
 * hariç), textarea, özet (summary), bağlantı ve tabindex ≥ 0 öğe. Bir bileşik denetim (adım çubuğu <nav>, .seg-ctl,
 * role=group / radiogroup / tablist, #cap-stil-grid) içindekilerle birlikte bir sayılır: JS'in çizdiği çipler ve
 * şablon kartları kapları üzerinden bir kez sayılır. Kapalı (disabled) denetimler de sayılır.
 */
function gorunurKontroller(kaynak) {
  var kok = H.agac(kaynak), m = H.bul(kok, "cap-main");
  function gorunur(d) {
    for (var x = d; x && x !== m.parent; x = x.parent) {
      if (!x.attrs) continue;
      if ("hidden" in x.attrs || "data-yalniz-ae" in x.attrs) return false;
      if (/display\s*:\s*none/.test(x.attrs.style || "")) return false;
      if (x.parent && x.parent.tag === "details" && !("open" in x.parent.attrs) && x.tag !== "summary") return false;
    }
    return true;
  }
  function etkilesimli(d) {
    if (d.tag === "button" || d.tag === "select" || d.tag === "textarea" || d.tag === "summary") return true;
    if (d.tag === "input") return (d.attrs.type || "text") !== "hidden";
    if (d.tag === "a") return "href" in d.attrs;
    return d.attrs.tabindex !== undefined && Number(d.attrs.tabindex) >= 0;
  }
  function grup(d) { return d.tag === "nav" || H.sinifVar(d, "seg-ctl") || /^(group|radiogroup|tablist)$/.test(d.attrs.role || "") || d.attrs.id === "cap-stil-grid"; }
  var gruplu = [], ham = [];
  (function yuru(d, grupta) {
    d.children.forEach(function (c) {
      if (c.tag[0] === "#") return;
      var g = grupta;
      if (gorunur(c)) {
        if (!grupta && grup(c)) { gruplu.push(c.attrs.id || c.tag); g = true; }
        if (etkilesimli(c)) { ham.push(c.attrs.id || c.tag); if (!grupta && !grup(c)) gruplu.push(c.attrs.id || c.tag); }
      }
      yuru(c, g);
    });
  })(m, false);
  return { gruplu: gruplu, ham: ham };
}
var sonra = gorunurKontroller(html);
console.log("  görünür kontroller: önce " + FIX.onceGorunurKontrol.gruplu + " (tek tek " + FIX.onceGorunurKontrol.ham + "), sonra " +
  sonra.gruplu.length + " (tek tek " + sonra.ham.length + "): " + sonra.gruplu.join(" "));
ok("ilk açılışta görünen kontrol sayısı ≤ 14 (önce " + FIX.onceGorunurKontrol.gruplu + ")", sonra.gruplu.length <= 14 && sonra.gruplu.length < FIX.onceGorunurKontrol.gruplu, sonra.gruplu.length);
ok("görünenler tam olarak akışın kontrolleri",
  sonra.gruplu.join(" ") === "cap-adimlar cap-scope cap-lang cap-maxlen summary cap-go cap-import-srt cap-efekt-kategoriler cap-efekt-gorunumler cap-sahne cap-efekt-anim summary summary cap-uygula-tek",
  sonra.gruplu.join(" "));
ok("tek tek sayıldığında da yarıdan az (çipler ve şablon kartları hariç)", sonra.ham.length * 2 < FIX.onceGorunurKontrol.ham, sonra.ham.length);

console.log("\n" + gecen + "/" + toplam + " gecti");
if (gecen !== toplam) process.exit(1);
