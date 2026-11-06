// Suflo testi: altyazı yenilemesinin son incelemesi (parti 9) — erişilebilirlik, hareketi azalt, başarım, önizleme sınırı.
//  1) Altyazı sekmesinde (#cap-main) odaklanabilir her denetimin erişilebilir adı var (metin, aria-label, title, <label>);
//     eski değer taşıyıcıları (.ia-eski, gizli #cap-preset: aria-hidden) ve metni JS'in koyduğu gizli düğmeler hariç.
//     Bul / değiştir, emoji arama ve CTA metni alanlarında yalnız placeholder vardı (düzeltmeden önce KALIYORDU).
//  2) Adım çubuğu: <nav aria-label>, etkin adımda aria-current="step" (js/altyazi-akis.js).
//  3) Hareketi azalt: panel CSS'inde adım çubuğunun geçişi kapanır; "Stilleri gör" kaydırması (captions.js stilDene)
//     prefers-reduced-motion'da anında (düzeltmeden önce hep "smooth": KALIYORDU), adım çubuğu kaydırması da öyle.
//  4) Başarım: 2.000 kelimelik transkript her hazır görünümde (ve her animasyonla) 1 sn'nin altında derlenir; 300 kelimede
//     önizlemenin JS kısmı (cueler + 4 kartlık seçim + derleme) 150 ms'nin altında. Önizleme hep en çok 4 kart çizer
//     (transkript uzadıkça büyümez), aynı çağrı yinelenince bellek kalıcı olarak büyümez.
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var H = require(path.join(__dirname, "_html-agac.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 500) + "]" : "")); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8").replace(/\r\n/g, "\n"); }
var cap = oku("js/captions.js");
function govde(imza) {
  var i = cap.indexOf(imza);
  if (i < 0) throw new Error("yok: " + imza);
  return cap.slice(i, cap.indexOf("\n  }\n", i) + 4);
}

/* ---------------- 1) erişilebilir adlar ---------------- */
var html = oku("index.html");
var kok = H.agac(html);
var main = H.bul(kok, "cap-main");
var etiketli = {};
H.hepsi(kok, function (d) { return d.tag === "label" && d.attrs["for"]; }).forEach(function (l) { etiketli[l.attrs["for"]] = true; });
// Metni yalnız gösterilirken JS'in yazdığı, açılışta gizli düğmeler (Kurtar, Son düzeltmeyi öğren)
var JS_METINLI = ["cap-restore", "cap-learn-last"];
function gizliTasiyici(d) { return !!H.ata(d, function (p) { return p.attrs && p.attrs["aria-hidden"] === "true"; }) || d.attrs["aria-hidden"] === "true"; }
var adsiz = H.hepsi(main, function (d) {
  var t = d.tag;
  var odak = t === "button" || t === "select" || t === "textarea" || (t === "input" && d.attrs.type !== "hidden") || d.attrs.tabindex === "0";
  if (!odak || gizliTasiyici(d) || JS_METINLI.indexOf(d.attrs.id) !== -1) return false;
  if (d.attrs["aria-label"] || d.attrs["aria-labelledby"] || d.attrs.title) return false;
  if (d.attrs.id && etiketli[d.attrs.id]) return false;
  if (H.ata(d, function (p) { return p.tag === "label"; })) return false;
  if (t === "button" && H.metni(d)) return false;
  return true;
});
ok("Altyazı sekmesinde odaklanabilir her denetimin erişilebilir adı var (placeholder ad sayılmaz)", adsiz.length === 0 && main,
  adsiz.map(function (d) { return d.tag + "#" + (d.attrs.id || "?"); }).join(", "));
var en = oku("i18n/en.js");
ok("yeni aria-label'ların İngilizcesi i18n/en.js'te", ["Emoji ara", "Kendi CTA metnin", "Bul", "Yerine koy"].every(function (k) { return en.indexOf('"' + k + '":') !== -1; }));
ok("eski değer taşıyıcıları yerinde ve ekran okuyucudan gizli (.ia-eski, #cap-preset)", /<div class="ia-eski" hidden aria-hidden="true">/.test(html) &&
  /<select id="cap-preset" hidden aria-hidden="true">/.test(html));

/* ---------------- 2) adım çubuğu ---------------- */
var nav = H.bul(kok, "cap-adimlar");
var akis = oku("js/altyazi-akis.js");
ok("adım çubuğu: nav aria-label, üç adım düğmesi aria-controls'lu; etkin adım aria-current=\"step\", diğerlerinden kaldırılır",
  nav && nav.tag === "nav" && !!nav.attrs["aria-label"] && H.hepsi(nav, function (d) { return d.tag === "button" && d.attrs["aria-controls"]; }).length === 3 &&
  /setAttribute\("aria-current", "step"\)/.test(akis) && /removeAttribute\("aria-current"\)/.test(akis));

/* ---------------- 3) hareketi azalt ---------------- */
var css = oku("css/style.css");
ok("panel CSS'i: adım etiketi sözcük ortasından bölünmez; durum yazısı 479 px'e kadar alt satıra iner (yerleşik panel 360–440 px)",
  /\.cap-adimlar-oge b \{[^}]*overflow-wrap: break-word;/.test(css) && !/\.cap-adimlar-oge b \{[^}]*anywhere/.test(css) &&
  /@media \(max-width: 479px\) \{\s*\.cap-adimlar-oge \{ flex-wrap: wrap;[^}]*\}\s*\.cap-adimlar-oge \.cap-adim-durum \{ flex-basis: 100%;/.test(css));
ok("panel CSS'i: hareketi azaltta adım çubuğu geçişsiz", /@media \(prefers-reduced-motion: reduce\) \{\s*\.cap-adimlar-oge, \.cap-adim-no \{ transition: none; \}/.test(css));
ok("adım çubuğunun kaydırması hareketi azaltta anında (js/altyazi-akis.js)", /behavior: hareketAzalt\(\) \? "auto" : "smooth"/.test(akis) &&
  /prefers-reduced-motion: reduce/.test(akis));
function stilDeneKaydirmasi(azalt) {
  var kayit = [];
  var hedef = { id: "cap-adim-stil", scrollIntoView: function (o) { kayit.push(o); } };
  var w = { matchMedia: function (q) { return { matches: azalt && /prefers-reduced-motion: reduce/.test(q) }; } };
  var f = new Function("el", "AE", "K", "gorunumUygula", "window",
    "var PRESETS = {}; function applyPreset() {} function motorStiliMi() { return false; } function stil() { return {}; } var onizlemeSaat = null;\n" +
    govde("function stilDene(") + "\nreturn stilDene;")(
    function (id) { return id === "cap-adim-stil" ? hedef : null; }, { gorunum: function () { return true; }, eskiGorunum: function () { return null; } },
    { findFfmpeg: function () { return Promise.resolve(null); } }, function () {}, w);
  f("vurucu");
  return kayit[0] || {};
}
ok("'Stilleri gör' kaydırması: hareketi azaltta anında, değilse yumuşak", stilDeneKaydirmasi(true).behavior === "auto" && stilDeneKaydirmasi(false).behavior === "smooth",
  JSON.stringify([stilDeneKaydirmasi(true), stilDeneKaydirmasi(false)]));

/* ---------------- 4) başarım ve önizleme sınırı ---------------- */
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
var YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
var CT = require(path.join(KOK, "js", "caption-text.js"));
var CL = require(path.join(KOK, "js", "caption-layout.js"));
var CUMLE = ("bugün size bu küçük kasabanın en eski fırınında sabah dörtte neler olduğunu *anlatacağım* ve sonunda gerçekten " +
  "şaşıracaksınız, tam 3 ayda 100 bin TL!").split(" ");
function kelimeler(n) { var o = []; for (var i = 0; i < n; i++) o.push({ start: i * 0.35, end: i * 0.35 + 0.3, text: CUMLE[i % CUMLE.length] }); return o; }
var w2000 = kelimeler(2000);
var enYavas = { ad: "", ms: 0 };
function olc(ad, f) { var t = Date.now(); f(); var ms = Date.now() - t; if (ms > enYavas.ms) enYavas = { ad: ad, ms: ms }; return ms; }
// ısınma (JIT)
SE.compile({ styleId: "efekt", cues: kelimeler(200), cueKind: "words", width: 1080, height: 1920, overrides: AE.overrides(AE.gorunum("vurucu").ayar) });
AE.GORUNUMLER.forEach(function (g) {
  olc(g.id, function () { SE.compile({ styleId: "efekt", cues: w2000, cueKind: "words", width: 1080, height: 1920, overrides: AE.overrides(g.ayar), dil: "tr" }); });
});
YA.kimlikler().forEach(function (a) {
  var ay = JSON.parse(JSON.stringify(AE.gorunum("temiz").ayar)); ay.anim = a;
  olc("temiz+" + a, function () { SE.compile({ styleId: "efekt", cues: w2000, cueKind: "words", width: 1920, height: 1080, overrides: AE.overrides(ay), dil: "tr" }); });
});
SE.list().forEach(function (p) { olc(p.id, function () { SE.compile({ styleId: p.id, cues: w2000, cueKind: "words", width: 1920, height: 1080 }); }); });
ok("2.000 kelime: her hazır görünüm, her animasyon ve her eski stil 1 sn'nin altında derlenir (en yavaş: " + enYavas.ad + " " + enYavas.ms + " ms)", enYavas.ms < 1000, enYavas.ad);

// Önizlemenin JS kısmı: captions.js'in GERÇEK cueler + motorOnizlemeCueleri işlevleri, 300 kelimelik transkript
function onizlemeOrtami(n) {
  var segs = CL.kelimedenSatirlar(kelimeler(n), { maxChars: 42, maxLines: 1 }).map(function (c) { return { start: c.start, end: c.end, text: c.text, words: c.words }; });
  return new Function("CT", "CL", "WW", "window", "K",
    "var segments = " + JSON.stringify(segs) + ", emojisizCikti = false, EFEKT = 'efekt';\n" +
    "function styleText(t) { return t; } function arayuzDili() { return 'tr'; }\n" +
    govde("function kufurMaskesiAcik(") + "\n" + govde("function kufurMaskele(") + "\n" + govde("function satirlariTopla(") + "\n" +
    govde("function cueler(") + "\n" + govde("function motorOnizlemeCueleri(") + "\nreturn { cueler: cueler, onizleme: motorOnizlemeCueleri, n: segments.length };")(
    CT, CL, { kelimeleriKaydir: function (ws, d) { return ws.map(function (w) { return { start: w.start + d, end: w.end + d, text: w.text }; }); } },
    {}, { settings: function () { return {}; } });
}
var o300 = onizlemeOrtami(300), o3000 = onizlemeOrtami(3000);
var ov = AE.overrides(AE.gorunum("vurucu").ayar);
function onizlemeTuru(o) {
  var c = o.onizleme({ aile: "efekt" });
  var r = SE.compile({ styleId: "efekt", cues: c, cueKind: "lines", width: 1080, height: 1920, overrides: JSON.parse(JSON.stringify(ov)), dil: "tr" });
  return { kart: c.length, ass: r.ass.length };
}
onizlemeTuru(o300);
var t0 = Date.now(), tur;
for (var i = 0; i < 10; i++) tur = onizlemeTuru(o300);
var ort = (Date.now() - t0) / 10;
ok("300 kelime: önizlemenin JS kısmı (cueler + seçim + derleme) " + ort.toFixed(1) + " ms (< 150 ms)", ort < 150 && o300.n > 20, ort);
var t3000 = onizlemeTuru(o3000);
ok("önizleme en çok 4 kart çizer; 3.000 kelimede de ASS 300 kelimedekiyle aynı boyda (transkriptle büyümez)", tur.kart === 4 && t3000.kart === 4 &&
  Math.abs(t3000.ass - tur.ass) < tur.ass * 0.2, JSON.stringify([tur, t3000]));
if (global.gc) global.gc();
var bellek0 = process.memoryUsage().heapUsed;
for (var j = 0; j < 300; j++) onizlemeTuru(o300);
if (global.gc) global.gc();
var artis = (process.memoryUsage().heapUsed - bellek0) / 1048576;
ok("300 önizleme turu: yığın kalıcı olarak büyümez (artış " + artis.toFixed(1) + " MB < 40 MB)", artis < 40, artis);

console.log("\n" + gecen + "/" + toplam + " geçti");
if (gecen !== toplam) process.exit(1);
