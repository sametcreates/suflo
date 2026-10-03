// Suflo testi: js/i18n.js + i18n/en.js — İngilizce arayüz çevirmeni (kablolama v3.1'de)
var fs = require("fs"), path = require("path");
var I = require(path.join(__dirname, "..", "js", "i18n.js"));
var EN = require(path.join(__dirname, "..", "i18n", "en.js"));
var ayikla = require("./_ayikla.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

I.setDictionary(EN);
var T = I.translate;

/* ---------------- translate ---------------- */
ok("tam eşleşme", T("Kaydet") === "Save" && T("Altyazı oluştur") === "Generate captions", T("Kaydet"));
ok("baştaki/sondaki boşluk korunur", T("\n      Kaydet  ") === "\n      Save  ", JSON.stringify(T("\n      Kaydet  ")));
ok("içteki satır sonu/çoklu boşluk eşleşmeyi bozmaz", T("Satır\n   uzunluğu") === "Line length", T("Satır\n   uzunluğu"));
ok("kalıp: sayı + klip atlandı", T("3 klip atlandı") === "3 clips skipped" && T("12 klip atlandı: a.mp4, b.mov") === "12 clips skipped: a.mp4, b.mov", T("3 klip atlandı"));
ok("kalıp: kanca başlığı katmanı", T("Kanca başlığı V3 katmanına eklendi") === "Hook title added to track V3" &&
  T("Kanca başlığı V4 katmanına eklendi (yeni katman)") === "Hook title added to track V4 (new track)", T("Kanca başlığı V4 katmanına eklendi (yeni katman)"));
ok("kalıp: sayı + yüzde + MB", T("Motor iniyor… %45 (120 MB)") === "Downloading engine… 45% (120 MB)", T("Motor iniyor… %45 (120 MB)"));
ok("kalıp: Türkçe binlik ayırıcı", T("1.076 SFX") === "1,076 SFX", T("1.076 SFX"));
ok("kalıp: iç içe çeviri (yakalanan metin de çevrilir)", T("12 kelime vurgulandı · Suflo Stillerinde vurgu renginde görünür · Ctrl+Z ile geri al") ===
  "12 words emphasized · shown in the highlight color in Suflo Styles · Ctrl+Z to undo", T("12 kelime vurgulandı · Suflo Stillerinde vurgu renginde görünür · Ctrl+Z ile geri al"));
ok("{n} yalnız sayı yakalar: 'Satır boş' kalıba düşmez", T("12 GB boş") === "12 GB free" && T("Satır boş") === "Satır boş", T("Satır boş"));
ok("· ile birleşik durum satırı parça parça", T("Hazır: Turbo · GPU hızlandırmalı · sessizlik atlama açık") === "Ready: Turbo · GPU accelerated · silence skipping on", T("Hazır: Turbo · GPU hızlandırmalı · sessizlik atlama açık"));
ok("ön ek simge korunur", T("✨ AI ile öner") === "✨ Suggest with AI", T("✨ AI ile öner"));
ok("bilinmeyen metin aynen döner", T("Bilinmeyen bir şey") === "Bilinmeyen bir şey" && T("röportaj_final.mp4") === "röportaj_final.mp4");
ok("metin olmayan / boş / yalnız sayı aynen döner", T(null) === null && T("") === "" && T(42) === 42 && T("  12:30  ") === "  12:30  ");
ok("fiyatlar TRY", T("Otomatik kesimi aç — 749 TL") === "Unlock Auto Cut — 749 TRY");

// Sabit nokta: hiçbir İngilizce değer başka bir şeye çevrilmez (gözlemci döngüsü buna dayanır)
var bozuk = [];
Object.keys(EN.strings).forEach(function (k) {
  var v = EN.strings[k];
  if (/\{n?\}/.test(k)) return;
  if (T(v) !== v) bozuk.push(k + " → " + v + " → " + T(v));
});
ok("idempotent: translate(İngilizce) === İngilizce (tüm sözlük)", bozuk.length === 0, bozuk.slice(0, 3).join(" | "));
var turkceDeger = Object.keys(EN.strings).filter(function (k) { return /[ıİşŞğĞ]/.test(EN.strings[k]); });
ok("İngilizce değerlerde Türkçe harf yok (ı ş ğ)", turkceDeger.length === 0, turkceDeger.slice(0, 3).join(" | "));
var bosDeger = Object.keys(EN.strings).filter(function (k) { return typeof EN.strings[k] !== "string"; });
ok("tüm değerler metin", bosDeger.length === 0, bosDeger.join(","));
var kalip = EN.patterns.every(function (p) { return p[0] instanceof RegExp && (typeof p[1] === "string" || typeof p[1] === "function"); });
ok("kalıplar [RegExp, hedef] biçiminde", kalip);
var tutarli = ["Text-based cut", "Enhance audio", "Keyword emphasis", "Hook title", "Viral moments"].every(function (ad) {
  return Object.keys(EN.strings).some(function (k) { return EN.strings[k] === ad; });
});
ok("marka/özellik adları sözlükte tutarlı", tutarli);

/* ---------------- sahte DOM ---------------- */
function Text(v) { this.nodeType = 3; this.nodeValue = v; this.parentNode = null; }
function El(tag, attrs, kids) {
  this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = {}; this.childNodes = []; this.parentNode = null;
  var self = this;
  Object.keys(attrs || {}).forEach(function (a) { self.attrs[a] = attrs[a]; });
  this.id = this.attrs.id || "";
  (kids || []).forEach(function (c) { self.appendChild(typeof c === "string" ? new Text(c) : c); });
}
El.prototype.getAttribute = function (a) { return Object.prototype.hasOwnProperty.call(this.attrs, a) ? this.attrs[a] : null; };
El.prototype.setAttribute = function (a, v) { this.attrs[a] = String(v); this.yazim = (this.yazim || 0) + 1; };
El.prototype.appendChild = function (c) { c.parentNode = this; this.childNodes.push(c); return c; };
function metinler(n, out) {
  out = out || [];
  if (n.nodeType === 3) out.push(n.nodeValue);
  (n.childNodes || []).forEach(function (c) { metinler(c, out); });
  return out;
}

var textarea = new El("textarea", { id: "cap-yt-aciklama", placeholder: "Açıklama" }, ["Kaydet"]);
textarea.value = "Kaydet";
var segBtn = new El("button", { title: "Satırı sil" }, ["×"]);
var segSpan = new El("span", { title: "Kaydet" }, ["Kaydet"]);           // kullanıcının sözü sözlükle çakışsa da
var segInput = new El("input", { placeholder: "Altyazıda ara…", value: "Kapat" });
var segments = new El("div", { id: "cap-segments" }, [new El("div", { "class": "seg" }, [segSpan, segBtn, segInput])]);
var tcWords = new El("div", { id: "tc-words", title: "Kelimeye tıkla: kes / geri al" }, [new El("span", {}, ["Tamam"])]);
var editable = new El("div", { contenteditable: "true" }, ["Kaydet"]);
var skipped = new El("div", { "data-i18n-skip": "" }, ["Kaydet"]);
var script = new El("script", {}, ["var x = 'Kaydet';"]);
var option = new El("option", { value: "Kaydet" }, ["Kaydet"]);
var select = new El("select", { title: "Dosya biçimi" }, [option]);
var btn = new El("button", { title: "Geri al (Ctrl+Z)", "aria-label": "Altyazı kalite puanı" }, ["\n   Altyazı oluştur\n  "]);
var input = new El("input", { placeholder: "Altyazıda ara…", value: "Kaydet" });
var img = new El("img", { alt: "Karaoke altyazı stili" });
var body = new El("body", {}, [btn, input, img, select, textarea, segments, tcWords, editable, skipped, script,
  new El("p", {}, ["Not: ses dönüştürme için ", new El("b", {}, ["ffmpeg"]), " de gerekiyor (her iki motorda da)."])]);

I.apply(body);
ok("DOM: metin düğümü çevrilir, boşluk korunur", btn.childNodes[0].nodeValue === "\n   Generate captions\n  ", JSON.stringify(btn.childNodes[0].nodeValue));
ok("DOM: title / aria-label / placeholder / alt çevrilir", btn.attrs.title === "Undo (Ctrl+Z)" && btn.attrs["aria-label"] === "Caption quality score" &&
  input.attrs.placeholder === "Search captions…" && img.attrs.alt === "Karaoke caption style", JSON.stringify([btn.attrs, input.attrs.placeholder, img.attrs.alt]));
ok("DOM: input value / option value dokunulmaz, option metni çevrilir", input.attrs.value === "Kaydet" && option.attrs.value === "Kaydet" &&
  option.childNodes[0].nodeValue === "Save" && select.attrs.title === "File format");
ok("DOM: textarea içeriği çevrilmez, yalnız ipucu", textarea.childNodes[0].nodeValue === "Kaydet" && textarea.value === "Kaydet" && textarea.attrs.placeholder === "Description");
ok("DOM: altyazı düzenleyicisinde kullanıcı metni çevrilmez", segSpan.childNodes[0].nodeValue === "Kaydet" && segSpan.attrs.title === "Kaydet", segSpan.childNodes[0].nodeValue);
ok("DOM: düzenleyicideki düğme ipucu ve arama ipucu çevrilir", segBtn.attrs.title === "Delete line" && segInput.attrs.placeholder === "Search captions…" && segInput.attrs.value === "Kapat");
ok("DOM: kullanıcı kabının kendi ipucu çevrilir, içi çevrilmez", tcWords.attrs.title === "Click a word: cut / restore" && tcWords.childNodes[0].childNodes[0].nodeValue === "Tamam");
ok("DOM: contenteditable, data-i18n-skip ve script atlanır", editable.childNodes[0].nodeValue === "Kaydet" && skipped.childNodes[0].nodeValue === "Kaydet" &&
  script.childNodes[0].nodeValue === "var x = 'Kaydet';");
ok("DOM: satır içi öğelerle bölünmüş cümle", metinler(body.childNodes[body.childNodes.length - 1]).join("") ===
  "Note: audio conversion also needs ffmpeg (for both engines).", metinler(body.childNodes[body.childNodes.length - 1]).join(""));

var once = JSON.stringify(metinler(body)), yazimOnce = btn.yazim;
I.apply(body);
ok("DOM: iki kez uygulamak hiçbir şeyi değiştirmez (idempotent)", JSON.stringify(metinler(body)) === once && btn.yazim === yazimOnce);

// Gözlemci: sonradan eklenen bildirim + öznitelik değişimi + düzenleyiciye eklenen satır
var toast = new El("div", { "class": "toast" }, ["3 klip atlandı"]);
body.appendChild(toast);
var yeniSatir = new El("div", { "class": "seg" }, [new El("span", {}, ["İptal"])]);
segments.appendChild(yeniSatir);
var guncelle = new El("button", {}, ["x"]);
body.appendChild(guncelle);
I.apply(guncelle);
guncelle.attrs.title = "Güncellemeleri denetle";
I._handle([
  { type: "childList", addedNodes: [toast] },
  { type: "childList", addedNodes: [yeniSatir] },
  { type: "attributes", target: guncelle, attributeName: "title" }
]);
ok("gözlemci: eklenen bildirim çevrilir", toast.childNodes[0].nodeValue === "3 clips skipped", toast.childNodes[0].nodeValue);
ok("gözlemci: düzenleyiciye eklenen satır çevrilmez", yeniSatir.childNodes[0].childNodes[0].nodeValue === "İptal");
ok("gözlemci: değişen title çevrilir", guncelle.attrs.title === "Check for updates");
var yazim = guncelle.yazim;
I._handle([{ type: "attributes", target: guncelle, attributeName: "title" }]);
ok("gözlemci: kendi yazdığı değer yeni yazım tetiklemez (döngü yok)", guncelle.yazim === yazim);

/* ---------------- dil seçimi ---------------- */
function depo(ilk) {
  var d = {}; if (ilk) d[I.LS_KEY] = ilk;
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); }, d: d };
}
I._setEnv({ storage: depo(), navigator: { language: "tr-TR" } });
ok("dil: ayar yok + tr-TR → tr", I.getLang() === "tr");
I._setEnv({ storage: depo(), navigator: { language: "az-AZ" } });
ok("dil: ayar yok + az → tr", I.getLang() === "tr");
I._setEnv({ storage: depo(), navigator: { language: "en-US" } });
ok("dil: ayar yok + en-US → en", I.getLang() === "en");
I._setEnv({ storage: depo(), navigator: { language: "de-DE" } });
ok("dil: ayar yok + de-DE → en", I.getLang() === "en");
I._setEnv({ storage: depo("tr"), navigator: { language: "en-US" } });
ok("dil: kayıtlı 'tr' tarayıcı dilini ezer", I.getLang() === "tr");
var dp = depo();
I._setEnv({ storage: dp, navigator: { language: "tr-TR" } });
I.setLang("en");
ok("dil: setLang kaydeder (suflo.uiLang)", dp.d["suflo.uiLang"] === "en" && I.getLang() === "en" && I.LS_KEY === "suflo.uiLang");
ok("tr(): yalnız dil en iken çevirir", I.tr("Kaydet") === "Save");
I.setLang("tr");
ok("tr(): dil tr iken aynen döner", I.tr("Kaydet") === "Kaydet");
I._setEnv({ storage: { getItem: function () { throw new Error("yasak"); }, setItem: function () { throw new Error("yasak"); } }, navigator: { language: "fr" } });
ok("dil: depolama hata verirse tarayıcı diline düşer", I.getLang() === "en");

/* ---------------- dosyalar ---------------- */
var YASAK = [/\?\.[A-Za-z_$(\[]/, /\?\?/, /(\|\||&&)=/, /\.replaceAll\s*\(/, /\.at\s*\(\s*-?\d/, /\.(findLast|findLastIndex)\s*\(/, /=>/, /\bconst\b|\blet\b|`/];
["js/i18n.js", "i18n/en.js"].forEach(function (f) {
  var src = ayikla(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
  var sorun = src.split("\n").filter(function (s) { return YASAK.some(function (r) { return r.test(s); }); });
  ok(f + ": ES5 / Chromium 74 uyumlu", sorun.length === 0, sorun.slice(0, 2).join(" | "));
});
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
var yok = I.USER_CONTENT_IDS.filter(function (id) { return html.indexOf('id="' + id + '"') === -1; });
ok("kullanıcı içeriği kapları index.html'de var", yok.length === 0, yok.join(","));

var kapsama = require(path.join(__dirname, "..", "tools", "i18n-coverage.js")).rapor();
ok("kapsama: index.html >= %98", kapsama.html.yuzde >= 98, kapsama.html.yuzde.toFixed(1) + "% · " + kapsama.html.eksik.map(function (x) { return x.text; }).slice(0, 3).join(" | "));
ok("kapsama: js metinleri >= %95", kapsama.js.yuzde >= 95, kapsama.js.yuzde.toFixed(1) + "%");

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
