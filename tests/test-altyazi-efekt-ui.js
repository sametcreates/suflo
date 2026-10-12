// Suflo testi: Altyazı Efektleri oluşturucusunun panel bağlantısı (3.3, plan adım 16) — captions.js'in
// GERÇEK işlevleri kesilip sahte DOM ile çalıştırılır.
//  - eski "Suflo Stilleri" 12 kartlık galerisi yok; yerinde hazır görünüm çipleri (rozetsiz)
//  - çip kontrolleri doldurur, efekti seçer, tercihe yazar, gerçek önizlemeyi ister
//  - oluşturucu stil motoruna beklenen ince ayarı verir (giriş / vurgu animasyonu, satır, kelime…)
//  - Marka Kiti açıkken görünüm kitin yazı tipi / renkleriyle gelir
//  - eski kayıtlı stil kimliği ve eski (3.2) SFL1 kodu en yakın görünüme taşınır ve çizilir
//  - stil kodu efekt alanlarıyla gidip gelir; Premiere Şablonları (MOGRT) bölümü olduğu gibi
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
function govde(imza) {
  var i = cap.indexOf(imza);
  if (i < 0) throw new Error("yok: " + imza);
  return cap.slice(i, cap.indexOf("\n  }\n", i) + 4);
}
var SS = require(path.join(KOK, "js", "style-share.js"));
var SE = require(path.join(KOK, "js", "style-engine.js"));
var MK = require(path.join(KOK, "js", "marka-kiti.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));

/* ---------------- küçük sahte DOM ---------------- */
function dugum(etiket, ek) {
  var d = { tagName: String(etiket || "div").toUpperCase(), hidden: false, checked: false, disabled: false, value: "", textContent: "", type: "",
    attrs: {}, childNodes: [], className: "", style: {}, dinle: {}, options: null };
  d.style.setProperty = function (k, v) { d.style[k] = v; };
  d.setAttribute = function (k, v) { d.attrs[k] = String(v); };
  d.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(d.attrs, k) ? d.attrs[k] : null; };
  d.removeAttribute = function (k) { delete d.attrs[k]; };
  d.appendChild = function (c) { d.childNodes.push(c); c.parentNode = d; return c; };
  d.addEventListener = function (ad, f) { (d.dinle[ad] = d.dinle[ad] || []).push(f); };
  d.click = function () { (d.dinle.click || []).forEach(function (f) { f({ target: d }); }); };
  d.classList = {
    contains: function (c) { return (" " + d.className + " ").indexOf(" " + c + " ") !== -1; },
    add: function (c) { if (!d.classList.contains(c)) d.className = (d.className + " " + c).trim(); },
    remove: function (c) { d.className = (" " + d.className + " ").replace(" " + c + " ", " ").trim(); },
    toggle: function (c, v) { if (v === undefined) v = !d.classList.contains(c); if (v) d.classList.add(c); else d.classList.remove(c); return v; }
  };
  d.querySelectorAll = function (sec) {
    var siniflar = sec.split(",").map(function (x) { return x.trim().replace(/^\./, ""); });
    var out = [];
    (function gez(n) { n.childNodes.forEach(function (c) { if (siniflar.some(function (s) { return c.classList && c.classList.contains(s); })) out.push(c); if (c.childNodes) gez(c); }); })(d);
    return out;
  };
  d.querySelector = function (sec) { return d.querySelectorAll(sec)[0] || null; };
  Object.defineProperty(d, "innerHTML", { set: function () { d.childNodes = []; }, get: function () { return ""; } });
  for (var k in ek || {}) d[k] = ek[k];
  return d;
}
function secim(ids, deger) {
  var d = dugum("select", { value: deger });
  d.options = ids.map(function (v) { return { value: v }; });
  return d;
}
function metinleri(n) { var out = []; (function gez(x) { if (x.textContent) out.push(x.textContent); (x.childNodes || []).forEach(gez); })(n); return out; }

function ortam(o) {
  o = o || {};
  var ayar = o.ayar || {};
  var toastlar = [], onizlemeIstekleri = 0, kayit = 0;
  var dom = {
    "cap-preset": secim(["", "efekt", "user"].concat(SE.list().map(function (p) { return p.id; })), ""),
    "cap-style-family": dugum("input", { value: "custom" }),
    "cap-maxlen": secim(["w2", "w3", "l32", "l42", "c42x2", "c60", "k1", "kc"], "l42"),
    "cap-case": dugum("select", { value: "normal" }), "cap-punct": dugum("input", { type: "checkbox", checked: true }),
    "cap-lang": dugum("select", { value: "tr" }), "cap-kelime-siniri": dugum("input", { value: "0" }), "cap-cevir-en": dugum("input"),
    "cap-yogunluk": dugum("select", { value: "balanced" }), "cap-font": dugum("select", { value: "Montserrat" }),
    "cap-boyut": dugum("input", { value: "76" }), "cap-renk": dugum("input", { type: "color", value: "#ffffff" }),
    "cap-renk-kontur": dugum("input", { type: "color", value: "#000000" }), "cap-renk-vurgu": dugum("input", { type: "color", value: "#ffd23f" }),
    "cap-kontur": dugum("input", { value: "5" }), "cap-konum": dugum("select", { value: "2" }), "cap-kutu": dugum("input", { type: "checkbox" }),
    "cap-animasyon": dugum("select", { value: "yok" }), "cap-guvenli-yerlesim": dugum("input", { type: "checkbox" }),
    "cap-efekt-giris": dugum("select", { value: "fade" }), "cap-efekt-aktif": dugum("select", { value: "yok" }),
    "cap-efekt-vurgu": dugum("input", { type: "checkbox", checked: true }), "cap-efekt-kalin": dugum("input", { type: "checkbox", checked: true }),
    "cap-efekt-italik": dugum("input", { type: "checkbox" }), "cap-efekt-satir": dugum("select", { value: "2" }),
    "cap-efekt-kelime": dugum("input", { value: "5" }), "cap-efekt-gorunumler": dugum("div"), "cap-efekt": dugum("section", { className: "efekt" }),
    "cap-stil-grid": dugum("div"), "cap-ince-ayar": dugum("details"), "cap-font-sistem": dugum("optgroup"),
    "cap-guvenli-yerlesim-sar": dugum("label"), "cap-marka-kiti-cip": dugum("span"), "cap-stil-yazar": dugum("input", { value: "" }),
    // 3.3 adım 17: gölge, kutu, serbest konum, önizleme sahnesi ve artı işareti
    "cap-efekt-golge": dugum("input", { type: "checkbox" }), "cap-efekt-golge-renk": dugum("input", { type: "color", value: "#000000" }),
    "cap-efekt-golge-opak": dugum("input", { value: "75" }), "cap-efekt-golge-mesafe": dugum("input", { value: "5" }), "cap-efekt-golge-yumusak": dugum("input", { value: "5" }),
    "cap-efekt-golge-ayar": dugum("div"), "cap-kutu-renk": dugum("input", { type: "color", value: "#000000" }), "cap-kutu-opak": dugum("input", { value: "50" }),
    "cap-efekt-kutu-ayar": dugum("div"), "cap-konum-x": dugum("input", { type: "hidden", value: "" }), "cap-konum-y": dugum("input", { type: "hidden", value: "" }),
    "cap-konum-serbest": dugum("div"), "cap-konum-serbest-deger": dugum("b"), "cap-konum-sifirla": dugum("button"),
    "cap-sahne": dugum("div"), "cap-efekt-arti": dugum("div", { hidden: true }), "cap-efekt-arti-etiket": dugum("span"),
    "cap-render-onizleme": dugum("video", { hidden: true })
  };
  dom["cap-efekt-arti"].appendChild(dugum("i", { className: "efekt-arti-dikey" }));
  dom["cap-efekt-arti"].appendChild(dugum("i", { className: "efekt-arti-yatay" }));
  // 400 × 225 px sahne (16:9) sayfanın (100, 50) noktasında
  dom["cap-sahne"].getBoundingClientRect = function () { return { left: 100, top: 50, width: 400, height: 225 }; };
  var yakalanan = [];
  dom["cap-sahne"].setPointerCapture = function (id) { yakalanan.push("al:" + id); };
  dom["cap-sahne"].releasePointerCapture = function (id) { yakalanan.push("bırak:" + id); };
  dom["cap-sahne"].focus = function () {};
  var K = { settings: function () { return ayar; }, saveSettings: function () { kayit++; }, log: function () {} };
  var window = { SufloStyleEngine: SE, SufloStyleShare: SS, SufloMarkaKiti: MK, SufloAltyaziEfekt: AE, KApp: { ctx: function () { return o.ctx || {}; } } };
  var kod = [
    govde("function motorPreset("), govde("function motorStiliMi("), govde("function uzunlukSecimi("), govde("function applyPreset("),
    govde("function stilKartiIsaretle("), govde("function efektStili("), govde("function efektAyari("), govde("function efekteGec("),
    govde("function efektSonrasi("), govde("function gorunumUygula("), govde("function gorunumleriCiz("), govde("function efektKelimeSayisi("),
    govde("function stil()"), govde("function motorAyarlari("), govde("function savePrefs("), govde("function loadPrefs("), govde("function stiliYaz("),
    govde("function markaKiti("), govde("function dikeySekans("), govde("function inceAyarDurumu("), govde("function stilKredisi("),
    govde("function stilKodu("), govde("function stilKoduUygula("), govde("function varsayilanaDon("),
    govde("function efektVarsayilan("), govde("function sablonumUygula("),
    govde("function efektSayi("), govde("function efektSayiAlani("), govde("function serbestKonumDegeri("), govde("function efektBagimliDurum("),
    govde("function konumAktif("), govde("function sahneNoktasi("), govde("function artiGoster("), govde("function konumYaz("),
    govde("function konumDegisti("), govde("function konumSuruklemeAdim("), govde("function konumSuruklemeBitir("), govde("function konumSifirla("),
    govde("function konumSurukleBagla(")
  ].join("\n");
  var api = new Function("K", "window", "document", "el", "KApp", "Pro",
    "var SS = window.SufloStyleShare, AE = window.SufloAltyaziEfekt, EFEKT = 'efekt';\n" +
    cap.slice(cap.indexOf("  var EFEKT_SAYILARI = "), cap.indexOf("\n", cap.indexOf("\"cap-kutu-opak\": [50, 0, 100] };")) + 1) +
    "var secilenMogrt = null, secilenMotorStili = '', secilenGorunum = '', sonGorunum = '', bekleyenMogrtYolu = '', stilKrediAd = '';\n" +
    "var FONTLAR = SS.fontFiles();\n" +
    "var PRESETS = {}; window.SufloStyleEngine.list().forEach(function (p) { PRESETS[p.id] = motorPreset(p.id); });\n" +
    "var onizleme = { durdur: 0, ciz: 0, tazele: [], oynat: 0 };\n" +
    "var surukleme = null, artiSaat = null;\n" +
    "function onizlemeDurdur() { onizleme.durdur++; } function onizlemeCiz() { onizleme.ciz++; } function onizlemeOynat() { onizleme.oynat++; }\n" +
    "function efektOnizlemeTazele(h) { onizleme.tazele.push(!!h); }\n" +
    "function vurguKutusuDurumu() {} function kelimeSiniriDurumu() {} function motorSecenekDurumu() {} function uygulamaIpucunuGuncelle() {}\n" +
    "function arayuzDili() { return 'tr'; } function kelimeSiniri() { return 0; }\n" + kod +
    "\nreturn { gorunumleriCiz: gorunumleriCiz, gorunumUygula: gorunumUygula, stil: stil, motorAyarlari: motorAyarlari, loadPrefs: loadPrefs, savePrefs: savePrefs," +
    " stilKodu: stilKodu, stilKoduUygula: stilKoduUygula, applyPreset: applyPreset, efekteGec: efekteGec, varsayilanaDon: varsayilanaDon, onizleme: onizleme," +
    " durum: function () { return { motor: secilenMotorStili, gorunum: secilenGorunum, son: sonGorunum, mogrt: secilenMogrt, kredi: stilKrediAd }; }," +
    " efektAyari: efektAyari, konumSurukleBagla: konumSurukleBagla, surukluyor: function () { return !!surukleme; }," +
    " mogrtSec: function (m) { secilenMogrt = m; secilenMotorStili = ''; } };")(
    K, window, { createElement: function (t) { return dugum(t); }, querySelectorAll: function () { return []; } },
    function (id) { return dom[id] || null; }, { toast: function (m, tur) { toastlar.push(m); } }, {});
  return { api: api, dom: dom, ayar: ayar, toastlar: toastlar, kayit: function () { return kayit; }, yakalanan: yakalanan };
}
var kelimeCue = ["Bunu", "*gören*", "herkes", "şaşırdı", "bugün"].map(function (w, i) { return { start: i * 0.5, end: i * 0.5 + 0.44, text: w }; });
function ciz(ov, w, h) { return SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: w || 1920, height: h || 1080, overrides: ov }); }

/* ---------------- 1) galeri yok, çipler var ---------------- */
var e = ortam();
e.api.gorunumleriCiz();
var cipler = e.dom["cap-efekt-gorunumler"].childNodes;
ok("Suflo Stilleri galerisi kaldırıldı: motorStilleriniCiz / stil-motor kartları yok", cap.indexOf("function motorStilleriniCiz") === -1 && cap.indexOf("stil-motor") === -1 &&
  cap.indexOf('textContent = "Suflo Stilleri"') === -1 && e.dom["cap-stil-grid"].childNodes.length === 0);
ok("hazır görünüm çipleri: her görünüm için bir düğme, rozet (SUFLO / PRO) yok, kart sınıfı (.stil-sec) yok",
  cipler.length === AE.GORUNUMLER.length && cipler.every(function (c) { return c.classList.contains("efekt-cip") && !c.classList.contains("stil-sec"); }) &&
  metinleri(e.dom["cap-efekt-gorunumler"]).every(function (t) { return !/^(SUFLO|PRO|MOGRT)$/.test(t); }), metinleri(e.dom["cap-efekt-gorunumler"]).join(","));
ok("çip adı görünüm adı, örnek harfler çeviriden muaf", cipler.map(function (c) { return c.childNodes[1].textContent; }).join(",") === AE.GORUNUMLER.map(function (g) { return g.ad; }).join(",") &&
  cipler.every(function (c) { return c.childNodes[0].getAttribute("data-i18n-skip") === ""; }));

/* ---------------- 2) çip → kontroller, seçim, tercih, önizleme ---------------- */
cipler[1].click();   // Vurucu
var d = e.dom;
ok("çip kontrolleri doldurur (Vurucu: Pop + Zıpla, Anton, BÜYÜK HARF, 2 satır, 3 kelime, orta)", d["cap-efekt-giris"].value === "pop" && d["cap-efekt-aktif"].value === "zipla" &&
  d["cap-font"].value === "Anton" && d["cap-case"].value === "upper" && d["cap-efekt-satir"].value === "2" && d["cap-efekt-kelime"].value === "3" && d["cap-konum"].value === "5" &&
  d["cap-boyut"].value === "112", J([d["cap-efekt-giris"].value, d["cap-font"].value, d["cap-case"].value]));
ok("çip efekti seçer, çip seçili, bölüm etkin, paylaş / kaydet görünür", e.api.durum().motor === "efekt" && e.api.durum().gorunum === "vurucu" &&
  cipler[1].classList.contains("secili") && cipler[1].getAttribute("aria-pressed") === "true" && !cipler[0].classList.contains("secili") &&
  d["cap-efekt"].classList.contains("etkin") && d["cap-ince-ayar"].hidden === false && d["cap-style-family"].value === "efekt");
ok("çip tercihe yazılır (motorStili efekt, görünüm) ve gerçek önizlemeyi hemen ister", e.ayar.capPrefs && e.ayar.capPrefs.motorStili === "efekt" &&
  e.ayar.capPrefs.gorunum === "vurucu" && e.ayar.capPrefs.gorunumTaban === "vurucu" && J(e.api.onizleme.tazele) === "[true]", J(e.ayar.capPrefs && e.ayar.capPrefs.stil));
var ov = e.api.motorAyarlari(e.api.stil());
ok("oluşturucu stil motoruna beklenen ince ayarı verir", ov.giris === "pop" && ov.aktif === "zipla" && ov.vurgu === true && ov.kalin === true && ov.italik === false &&
  ov.satir === 2 && ov.kelime === 3 && ov.font === "Anton" && ov.fontFile === "Anton.ttf" && ov.boyut === 112, J(ov));
var r = ciz(ov);
ok("oluşturucu → gerçek motor çıktısı: Pop girişi ve zıplayan etkin kelime", /\\fscx0\\fscy0\\t\(0,300,\\fscx100\\fscy100\)/.test(r.ass) && /\\move\(/.test(r.ass) && r.fontFiles[0] === "Anton.ttf");
// elle değişiklik: italik + glitch + tek satır
d["cap-efekt-italik"].checked = true; d["cap-efekt-aktif"].value = "glitch"; d["cap-efekt-satir"].value = "1"; d["cap-efekt-kelime"].value = "99";
var ov2 = e.api.motorAyarlari(e.api.stil());
ok("elle ayar: italik, glitch, 1 satır; en çok kelime 1-10'a kırpılır", ov2.italik === true && ov2.aktif === "glitch" && ov2.satir === 1 && ov2.kelime === 10, J(ov2));
var r2 = ciz(ov2);
ok("elle ayar çıktıda: Style italik, glitch alt katmanı, \\N yok", r2.ass.split("\n").filter(function (l) { return /^Style:/.test(l); })[0].split(",")[8] === "-1" &&
  r2.ass.indexOf("&H00552AFF") !== -1 && !/\\N/.test(r2.ass));
var kontrolKodu = govde("function init(");
ok("kontrol değişikliği efekti seçer ve hazır görünüm çipini kaldırır, canlı önizlemeyi tazeler (init)", /EFEKT_KONTROLLERI\.forEach/.test(kontrolKodu) &&
  /efekteGec\(\);\s*secilenGorunum = "";\s*efektSonrasi\(\);\s*savePrefs\(\);\s*efektOnizlemeTazele\(\);/.test(kontrolKodu));
e.api.mogrtSec({ path: "/x.mogrt" });
e.api.efekteGec();
ok("Premiere şablonu seçiliyken efekt kontrolüne dokunmak şablonu bırakır", e.api.durum().mogrt === null && e.api.durum().motor === "efekt");

/* ---------------- 3) Marka Kiti ---------------- */
var ek = ortam({ ayar: { markaKiti: { on: true, stil: { overrides: { font: "Lora", renk: "#ff0000", vurguRenk: "#00ff00" } } } } });
ek.api.gorunumUygula("glitch");
ok("Marka Kiti açıkken görünüm kitin yazı tipi ve renkleriyle gelir, animasyonlar görünümden", ek.dom["cap-font"].value === "Lora" && ek.dom["cap-renk"].value === "#ff0000" &&
  ek.dom["cap-renk-vurgu"].value === "#00ff00" && ek.dom["cap-efekt-aktif"].value === "glitch" && ek.dom["cap-efekt-giris"].value === "asagi");

/* ---------------- 4) eski kayıtlı stil kimliği ---------------- */
var eskiStil = { aile: "hormozi", yogunluk: "hard", font: "Lora", boyut: 124, renk: "#ff3366", konturRenk: "#101010", vurguRenk: "#22ccff", kontur: 8, konum: 8, kutu: false, animasyon: "hormozi" };
var eo = ortam({ ayar: { capPrefs: { maxlen: "k1", kase: "upper", punct: false, preset: "hormozi", motorStili: "hormozi", stil: eskiStil } } });
eo.api.loadPrefs();
var ovE = eo.api.motorAyarlari(eo.api.stil());
ok("eski kayıt (Bold Box) en yakın görünüme (Vurucu) taşınır: efekt seçili, kayıttaki yazı tipi / renkler / konum korunur", eo.api.durum().motor === "efekt" &&
  eo.api.durum().son === "vurucu" && eo.api.durum().gorunum === "" && ovE.font === "Lora" && ovE.renk === "#ff3366" && ovE.vurguRenk === "#22ccff" && ovE.konum === 8 &&
  ovE.giris === "pop" && ovE.aktif === "zipla" && ovE.boyut === 112, J(ovE));
ok("taşınan eski kayıt çizilir", ciz(ovE, 1080, 1920).eventCount > 0 && SE.compile({ styleId: "hormozi", cues: kelimeCue, cueKind: "words" }).eventCount > 0);
eo.api.varsayilanaDon();
ok("'Görünüme dön' en son görünüme (Vurucu) döner", eo.api.durum().gorunum === "vurucu" && eo.dom["cap-font"].value === "Anton");
var eu = ortam({ ayar: { userPreset: { maxlen: "l42", kase: "normal", punct: true, stil: { aile: "neon", font: "Bebas Neue", renk: "#f4fbff", konturRenk: "#0b1020", vurguRenk: "#2af5ff", boyut: 118, kontur: 2, konum: 5 } } } });
eu.api.applyPreset("user");
ok("eski Şablonum (Neon üzerine) Altyazı Efektleri'ne (Glitch) taşınır", eu.api.durum().motor === "efekt" && eu.dom["cap-efekt-aktif"].value === "glitch" &&
  eu.dom["cap-renk-vurgu"].value === "#2af5ff" && eu.dom["cap-maxlen"].value === "l42");
var ed = ortam();
ed.api.applyPreset("mrbeast");
ok("rehber / eski kod: applyPreset(eski kimlik) en yakın görünümü uygular, tercih yazmaz", ed.api.durum().gorunum === "vurucu" && ed.api.durum().motor === "efekt" &&
  !ed.ayar.capPrefs && ed.api.onizleme.tazele.length === 0);

/* ---------------- 5) SFL1 kodları ---------------- */
var eskiKod = SS.encode({ styleId: "neon", overrides: { font: "Lora", renk: "#ff0000", konturRenk: "#000000", vurguRenk: "#00ff00", boyut: 150, kontur: 3, konum: 8, guvenli: true },
  text: { maxlen: "k1", kase: "upper", punct: false }, author: "ayse" });
var ec = ortam();
ok("eski (3.2) kodu uygulanır", ec.api.stilKoduUygula(eskiKod) === true);
var ovC = ec.api.motorAyarlari(ec.api.stil());
ok("eski kod en yakın görünüme (Glitch) taşınır; koddaki yazı tipi / renkler / konum / güvenli yerleşim korunur", ec.api.durum().motor === "efekt" &&
  ovC.font === "Lora" && ovC.renk === "#ff0000" && ovC.vurguRenk === "#00ff00" && ovC.konum === 8 && ovC.guvenli === true && ovC.aktif === "glitch" && ovC.boyut === 118 &&
  ec.dom["cap-case"].value === "upper" && ec.dom["cap-maxlen"].value === "k1" && ec.api.durum().kredi === "ayse", J(ovC));
ok("eski kod: kullanıcıya en yakın görünüme uyarlandığı söylenir", ec.toastlar.some(function (t) { return /Eski stil kodu en yakın görünüme uyarlandı: Neon → Glitch/.test(t); }), ec.toastlar.join(" | "));
ok("eski koddan gelen görünüm çizilir", ciz(ovC, 1080, 1920).eventCount > 0);
var efKod = SS.encode({ styleId: "efekt", overrides: AE.overrides(Object.assign({}, AE.gorunum("canli").ayar, { italik: true, kelime: 4 })), text: { kase: "upper" } });
var ef = ortam();
ef.api.stilKoduUygula(efKod);
var ovF = ef.api.motorAyarlari(ef.api.stil());
ok("efekt kodu birebir uygulanır (giriş / vurgu / italik / kelime)", ovF.giris === "zipla" && ovF.aktif === "zipla" && ovF.italik === true && ovF.kelime === 4 &&
  ef.api.durum().gorunum === "" && !ef.toastlar.some(function (t) { return /Eski stil kodu/.test(t); }), J(ovF));
var gidis = ortam();
gidis.api.gorunumUygula("zarif");
var k = gidis.api.stilKodu();
var cozum = SS.decode(k.kod, function (id) { return SE.has(id); });
ok("stil kodu efekt alanlarıyla gider, aynı görünüm geri gelir", cozum.ok && cozum.warnings.length === 0 && cozum.recipe.styleId === "efekt" &&
  cozum.recipe.overrides.giris === "yukari" && cozum.recipe.overrides.kalin === false && cozum.recipe.overrides.font === "Lora", J(cozum.recipe));
var geri = ortam();
geri.api.stilKoduUygula(k.kod);
ok("paylaşılan kod alıcıda aynı hazır görünüm olarak tanınır", geri.api.durum().gorunum === "zarif", geri.api.durum().gorunum);

/* ---------------- 5b) ilk açılış, eski "Özel" kaydı, ★ Şablonum ---------------- */
var ilk = ortam();
ilk.api.gorunumleriCiz();
ilk.api.loadPrefs();
ok("ilk açılış (tercih yok): Altyazı Efektleri › Temiz seçili gelir; tercih yazılmaz, önizleme çizilmez",
  ilk.api.durum().motor === "efekt" && ilk.api.durum().gorunum === "temiz" && ilk.dom["cap-style-family"].value === "efekt" &&
  ilk.dom["cap-efekt-gorunumler"].childNodes[0].classList.contains("secili") && !ilk.ayar.capPrefs && ilk.api.onizleme.tazele.length === 0, JSON.stringify(ilk.api.durum()));
var ozel = ortam({ ayar: { capPrefs: { maxlen: "l42", kase: "normal", punct: true, preset: "", stil: { aile: "custom", font: "Arial", boyut: 64, renk: "#ff0000",
  konturRenk: "#000000", vurguRenk: "#00ff00", kontur: 4, konum: 2 } } } });
ozel.api.loadPrefs();
ok("eski 'Özel' kaydı: efekt seçili, kayıttaki renk / boyut kalır, sistem yazı tipi paket fontuna (Montserrat) döner, sistem grubu kapalı",
  ozel.api.durum().motor === "efekt" && ozel.api.durum().son === "temiz" && ozel.api.durum().gorunum === "" && ozel.dom["cap-renk"].value === "#ff0000" &&
  ozel.dom["cap-boyut"].value === "64" && ozel.dom["cap-font"].value === "Montserrat" && ozel.dom["cap-font-sistem"].disabled === true &&
  ozel.dom["cap-font-sistem"].hidden === true, JSON.stringify([ozel.api.durum(), ozel.dom["cap-font"].value]));
var mogrtli = ortam({ ayar: { capPrefs: { preset: "", mogrtPath: "/x/Suflo Pop.mogrt", motorStili: "", stil: { aile: "custom", font: "Arial" } } } });
mogrtli.api.loadPrefs();
ok("kayıtlı Premiere şablonu (liste henüz yüklenmedi) ezilmez", mogrtli.api.durum().motor === "" && mogrtli.api.durum().mogrt === null);
var sab = ortam({ ayar: { userPreset: { maxlen: "l42", kase: "upper", punct: false, stil: Object.assign({ aile: "efekt", yogunluk: "balanced", animasyon: "efekt", kutu: false },
  AE.overrides(Object.assign({}, AE.gorunum("glitch").ayar, { renk: "#abcdef" }))) } } });
sab.api.gorunumleriCiz();
var sabCipler = sab.dom["cap-efekt-gorunumler"].childNodes;
var sabCip = sabCipler[sabCipler.length - 1];
ok("Şablonum kayıtlıysa hazır görünümlerin sonunda ★ Şablonum çipi", sabCipler.length === AE.GORUNUMLER.length + 1 && sabCip.getAttribute("data-sablonum") === "1" &&
  metinleri(sabCip).join("") === "★ Şablonum" && sabCip.classList.contains("efekt-cip"));
sabCip.click();
ok("★ Şablonum çipi kayıtlı ayarı uygular, seçili görünür, tercihe yazılır, önizlemeyi ister", sab.dom["cap-renk"].value === "#abcdef" &&
  sab.dom["cap-efekt-aktif"].value === "glitch" && sab.dom["cap-preset"].value === "user" && sab.api.durum().motor === "efekt" && sabCip.classList.contains("secili") &&
  sab.ayar.capPrefs && sab.ayar.capPrefs.preset === "user" && JSON.stringify(sab.api.onizleme.tazele) === "[true]", JSON.stringify([sab.dom["cap-preset"].value, sab.api.durum()]));
sab.api.gorunumUygula("temiz");
ok("başka görünüm seçilince ★ Şablonum çipi seçili kalmaz", !sabCip.classList.contains("secili") && sabCipler[0].classList.contains("secili"));
ok("Şablonum kaydı çipi hemen gösterir, bildirim çipi anlatır (menü yok)", /gorunumleriCiz\(\);/.test(govde("function saveUserPreset(")) &&
  /Hazır görünümlerde ★ Şablonum/.test(govde("function saveUserPreset(")) && govde("function saveUserPreset(").indexOf("menüde") === -1);

/* ---------------- 5c) .suflo-stil dışa aktarma adı: görünüme göre, var olan dosya ezilmez ---------------- */
(function () {
  var masaustu = {}, yazilan = [];
  var Kd = { os: { homedir: function () { return "/ev"; } }, path: path,
    fs: { existsSync: function (p) { return p === "/ev/Desktop" || Object.prototype.hasOwnProperty.call(masaustu, p); },
      writeFileSync: function (p, v) { masaustu[p] = v; yazilan.push(path.basename(p)); } } };
  // stilDisaAktar o anki seçimle (motor, görünüm, cap-preset) kurulup çağrılır
  function disaAktar(motor, gorunum, preset) {
    new Function("K", "el", "KApp", "SS",
      "var EFEKT = 'efekt', secilenMotorStili = " + JSON.stringify(motor) + ", secilenGorunum = " + JSON.stringify(gorunum) + ";\n" +
      "function stilKodu() { return { kod: 'SFL1.x' }; } function arayuzDili() { return 'tr'; }\n" +
      govde("function saveToDesktop(") + "\n" + govde("function stilDisaAktar(") + "\nreturn stilDisaAktar;")(
      Kd, function (id) { return id === "cap-preset" ? { value: preset } : null; }, { toast: function () {} }, SS)();
  }
  disaAktar("efekt", "vurucu", "efekt");
  disaAktar("efekt", "vurucu", "efekt");
  disaAktar("efekt", "", "user");
  disaAktar("efekt", "", "efekt");
  ok(".suflo-stil adı görünümden; ikinci dışa aktarma birincinin üzerine yazmaz", yazilan.join(",") ===
    "suflo-stil-vurucu.suflo-stil,suflo-stil-vurucu-2.suflo-stil,suflo-stil-sablonum.suflo-stil,suflo-stil-ozel.suflo-stil", yazilan.join(","));
})();

/* ---------------- 6) Premiere Şablonları ve katman ---------------- */
var mc = govde("function mogrtStilleriniCiz(");
ok("Premiere Şablonları bölümü olduğu gibi: başlık, oran, vitrin, kilit, hover video", /headTitle\.textContent = "Premiere Şablonları"/.test(mc) && /stil-sec stil-mogrt/.test(mc) &&
  /Pro\.gate\("captionStyles"\)/.test(mc) && /previewVideo/.test(mc) && /mogrtOrani\(item\)/.test(mc));
ok("index.html: Altyazı Efektleri bölümü, büyük önizleme içinde, şablon ızgarası ayrı", /id="cap-efekt"[\s\S]*id="cap-efekt-gorunumler"[\s\S]*id="cap-onizleme"[\s\S]*id="cap-efekt-ayarlar"/.test(html) &&
  html.indexOf('id="cap-stil-grid"') > html.indexOf('id="cap-efekt-ayarlar"') && /<script src="js\/altyazi-efekt\.js"><\/script>/.test(html) &&
  html.indexOf('src="js/altyazi-efekt.js"') > html.indexOf('src="js/style-engine.js"') && html.indexOf('src="js/altyazi-efekt.js"') < html.indexOf('src="js/captions.js"'));
ok("index.html: oluşturucunun kontrolleri (giriş, vurgu animasyonu, kelime vurgusu, kalın, italik, satır, en çok kelime)",
  ["cap-efekt-giris", "cap-efekt-aktif", "cap-efekt-vurgu", "cap-efekt-kalin", "cap-efekt-italik", "cap-efekt-satir", "cap-efekt-kelime", "cap-renk-vurgu", "cap-renk",
    "cap-renk-kontur", "cap-font", "cap-boyut", "cap-kontur", "cap-konum"].every(function (id) { return html.indexOf('id="' + id + '"') !== -1; }) &&
  /<option value="glitch">Glitch<\/option>/.test(html) && /<option value="yukari">Yukarı kay<\/option>/.test(html));
var ou = govde("async function overlayUygula(");
ok("timeline'a ekleme Pro.gate('overlay') (3 deneme), efekt katmanı 'Suflo Altyazı Efekti' adıyla", /Pro\.gate\("overlay", \{ deneme: true/.test(ou) &&
  /"Suflo Altyazı Efekti"/.test(ou) && /Deneme yalnız Altyazı Efektleri için/.test(ou));
var oo = govde("function onizlemeOynat(");
// Çizim sırası (motorCizimiBaslat: tek ffmpeg, eski çizim atılır) ayrıca tests/test-efekt-onizleme.js'te çalıştırılır
ok("önizleme: efekt gerçek motor çıktısıyla (libass), ffmpeg yoksa DOM yedeği", /premium\|efekt\)\$\/\.test\(st\.aile\)/.test(oo) &&
  /motorCizimiBaslat\(/.test(oo) && /motorCizimiBaslat\(/.test(govde("function efektOnizlemeTazele(")) &&
  /motorOnizlemeOynat\(\)\.then/.test(govde("function motorCizimiBaslat(")) && /onizlemeOynatDom\(\)/.test(govde("function motorCizimiBaslat(")) &&
  /onizlemeOynatDom\(\)/.test(govde("function efektOnizlemeTazele(")));
ok("önizleme tazeleme yalnız etkileşimde (açılışta çağrılmaz)", govde("function init(").indexOf("efektOnizlemeTazele(true)") === -1 &&
  govde("function loadPrefs(").indexOf("efektOnizlemeTazele") === -1);

/* ---------------- 7) 3.3 adım 17: gölge, kutu, serbest X / Y (sürükle, yapış, ok tuşu, sıfırla) ---------------- */
var g7 = ortam();
g7.api.gorunumleriCiz();
g7.api.gorunumUygula("temiz");
var d7 = g7.dom;
d7["cap-efekt-golge"].checked = true; d7["cap-efekt-golge-renk"].value = "#ff0000"; d7["cap-efekt-golge-opak"].value = "250";
d7["cap-efekt-golge-mesafe"].value = "8"; d7["cap-efekt-golge-yumusak"].value = "x";
d7["cap-kutu"].checked = true; d7["cap-kutu-renk"].value = "#112233"; d7["cap-kutu-opak"].value = "65";
var ov7 = g7.api.motorAyarlari(g7.api.stil());
ok("oluşturucu → motor: gölge (açıkken nesne; opaklık 100'e kırpılır, bozuk yumuşaklık varsayılan 5), kutu rengi / opaklığı",
  J(ov7.golge) === '{"renk":"#ff0000","opak":100,"mesafe":8,"yumusak":5}' && ov7.kutu === true && ov7.kutuRenk === "#112233" && ov7.kutuOpak === 65 &&
  ov7.konumX === null && ov7.konumY === null, J(ov7));
var r7 = ciz(ov7);
ok("oluşturucunun gölgesi ve kutusu gerçek motor çıktısında", /SufloKutu/.test(r7.ass) && /\\4c&H000000FF\\4a&H00&/.test(r7.ass) && /\\3c&H00332211\\3a&H59&/.test(r7.ass));
d7["cap-efekt-golge"].checked = false;
ok("gölge kapalı → null (değerler kutularda kalır)", g7.api.motorAyarlari(g7.api.stil()).golge === null && d7["cap-efekt-golge-renk"].value === "#ff0000");
var ku = ortam();
ku.api.gorunumleriCiz();
ku.dom["cap-efekt-gorunumler"].childNodes.filter(function (c) { return c.getAttribute("data-gorunum") === "kutulu"; })[0].click();
ok("Kutulu çipi kutu anahtarını ve rengini / opaklığını doldurur, gölgeyi kapatır", ku.dom["cap-kutu"].checked === true && ku.dom["cap-kutu-opak"].value === "65" &&
  ku.dom["cap-efekt-golge"].checked === false && ku.dom["cap-kontur"].value === "0" && ku.api.durum().gorunum === "kutulu");
var vu = ortam();
vu.api.gorunumUygula("vurucu");
ok("Vurucu çipi gölgeyi açar ve doldurur; noktalamayı kapatır (3.2'deki noktalamasız stiller gibi)", vu.dom["cap-efekt-golge"].checked === true &&
  vu.dom["cap-efekt-golge-opak"].value === "85" && vu.dom["cap-efekt-golge-mesafe"].value === "7" && vu.dom["cap-punct"].checked === false &&
  vu.api.efektAyari().punct === false && vu.dom["cap-efekt-golge-ayar"].classList.contains("pasif") === false);
vu.api.gorunumUygula("temiz");
ok("Temiz'e dönünce gölge kapanır, noktalama açılır; alt kontroller soluk / kapalı", vu.dom["cap-efekt-golge"].checked === false && vu.dom["cap-punct"].checked === true &&
  vu.dom["cap-efekt-golge-ayar"].classList.contains("pasif") && vu.dom["cap-efekt-golge-opak"].disabled === true && vu.dom["cap-kutu-renk"].disabled === true);

// sürükleme
var sk = ortam();
sk.api.gorunumleriCiz();
sk.api.gorunumUygula("temiz");
sk.api.konumSurukleBagla();
var sahne = sk.dom["cap-sahne"];
function olay(ad, e) { (sahne.dinle[ad] || []).forEach(function (f) { f(Object.assign({ pointerId: 7, button: 0, target: sahne, preventDefault: function () {} }, e || {})); }); }
var kayit0 = sk.kayit(), tazele0 = sk.api.onizleme.tazele.length;
olay("pointerdown", { clientX: 220, clientY: 140 });   // %30, %40
ok("sürükle: basınca işaretçi yakalanır, artı işareti ve 'X %30 · Y %40' etiketi görünür, noktalar canlı", sk.yakalanan[0] === "al:7" &&
  sahne.classList.contains("surukleniyor") && sk.dom["cap-efekt-arti"].hidden === false && sk.dom["cap-efekt-arti-etiket"].textContent === "X %30 · Y %40" &&
  sk.dom["cap-konum-x"].value === "30" && sk.dom["cap-konum-y"].value === "40" && sk.dom["cap-efekt-arti"].childNodes[0].style.left === "30%" &&
  sk.dom["cap-efekt-arti"].childNodes[1].style.top === "40%", sk.dom["cap-efekt-arti-etiket"].textContent);
olay("pointermove", { clientX: 340, clientY: 95.5 });   // %60, %20.2
ok("sürükle: hareket noktayı izler; sürerken tercih yazılmaz, gerçek önizleme istenmez", sk.dom["cap-konum-x"].value === "60" && sk.dom["cap-konum-y"].value === "20" &&
  sk.kayit() === kayit0 && sk.api.onizleme.tazele.length === tazele0);
olay("pointermove", { pointerId: 9, clientX: 100, clientY: 50 });
ok("sürükle: başka işaretçinin hareketi yok sayılır", sk.dom["cap-konum-x"].value === "60");
olay("pointerup", { clientX: 340, clientY: 95.5 });
var prefs7 = sk.ayar.capPrefs && sk.ayar.capPrefs.stil;
ok("bırakınca: işaretçi bırakılır, konum tercihe yazılır, gerçek önizleme bir kez istenir, görünüm çipi kalkar",
  sk.yakalanan[1] === "bırak:7" && !sahne.classList.contains("surukleniyor") && prefs7 && prefs7.konumX === 60 && prefs7.konumY === 20 &&
  sk.api.onizleme.tazele.length === tazele0 + 1 && sk.api.durum().gorunum === "" && sk.dom["cap-konum-serbest"].hidden === false &&
  sk.dom["cap-konum-serbest-deger"].textContent === "X %60 · Y %20", J(prefs7 && [prefs7.konumX, prefs7.konumY]));
var ov8 = sk.api.motorAyarlari(sk.api.stil());
ok("serbest konum motora gider ve çizilir (1920×1080'de %60 / %20 → 1152, 216)", ov8.konumX === 60 && ov8.konumY === 20 && /\\an5\\pos\(1152,216\)/.test(ciz(Object.assign({}, ov8, { giris: "yok" })).ass));
// yapışma: Alt'ın noktası (50, 84) ±%3
olay("pointerdown", { clientX: 100 + 0.51 * 400, clientY: 50 + 0.826 * 225 });
ok("sürükle: hazır konuma (Alt, X 50 · Y 84) ±%3 yapışır; etiket hazır konumu söyler", sk.dom["cap-konum-x"].value === "" && sk.dom["cap-konum"].value === "2" &&
  sk.dom["cap-efekt-arti-etiket"].textContent === "Alt · hazır konum");
olay("pointerup");
ok("yapışınca Temiz'in kendi konumu: hazır görünüm çipi yeniden seçili, serbest konum satırı gizli", sk.api.durum().gorunum === "temiz" &&
  sk.dom["cap-konum-serbest"].hidden === true && sk.ayar.capPrefs.stil.konumX === null && sk.ayar.capPrefs.stil.konum === 2);
olay("pointerdown", { clientX: 100 + 0.5 * 400, clientY: 50 + 0.62 * 225 });
olay("pointerup");
ok("Orta'ya yapışmak hazır konumu Orta yapar (seçici 5)", sk.dom["cap-konum"].value === "5" && sk.dom["cap-konum-x"].value === "");
// ok tuşları: odakta; Orta'dan (50, 62) sağa %1, Shift+yukarı %5
function tus(k, shift) { var engel = 0; (sahne.dinle.keydown || []).forEach(function (f) { f({ key: k, shiftKey: !!shift, target: sahne, preventDefault: function () { engel++; } }); }); return engel; }
var e1 = tus("ArrowRight"), e2 = tus("ArrowUp", true);
ok("ok tuşları: %1 sağa, Shift ile %5 yukarı (sayfa kaymaz); her biri kaydedilir", e1 === 1 && e2 === 1 && sk.dom["cap-konum-x"].value === "51" &&
  sk.dom["cap-konum-y"].value === "57" && sk.ayar.capPrefs.stil.konumX === 51 && sk.ayar.capPrefs.stil.konumY === 57);
ok("ok tuşları dışındaki tuşlar engellenmez", tus("a") === 0 && tus("Tab") === 0);
(sahne.dinle.dblclick || []).forEach(function (f) { f({ target: sahne }); });
ok("çift tık hazır konuma döner (Orta), serbest konum silinir", sk.dom["cap-konum-x"].value === "" && sk.dom["cap-konum"].value === "5" && sk.ayar.capPrefs.stil.konumX === null);
tus("ArrowLeft"); tus("Home");
ok("Home da sıfırlar", sk.dom["cap-konum-x"].value === "" && sk.ayar.capPrefs.stil.konumX === null);
// Esc: sürükleme geri alınır
tus("ArrowDown");
var once = [sk.dom["cap-konum-x"].value, sk.dom["cap-konum-y"].value];
var kayit1 = sk.kayit();
olay("pointerdown", { clientX: 120, clientY: 60 });
tus("Escape");
ok("Esc sürüklemeyi geri alır (başlangıç noktası), kaydetmez", sk.dom["cap-konum-x"].value === once[0] && sk.dom["cap-konum-y"].value === once[1] &&
  !sk.api.surukluyor() && sk.kayit() === kayit1 && !sahne.classList.contains("surukleniyor"));
olay("pointerdown", { clientX: 120, clientY: 60 });
olay("pointercancel");
ok("pointercancel da geri alır", sk.dom["cap-konum-x"].value === once[0] && !sk.api.surukluyor());
// düğmelerde ve Premiere şablonunda sürükleme yok
var dugme = dugum("button");
olay("pointerdown", { clientX: 220, clientY: 140, target: { closest: function (s) { return s === "button" ? dugme : null; } } });
ok("Oynat / Kare al düğmesine basmak sürükleme başlatmaz", !sk.api.surukluyor() && sk.dom["cap-konum-x"].value === once[0]);
olay("pointerdown", { clientX: 220, clientY: 140, button: 2 });
ok("sağ tık sürükleme başlatmaz", !sk.api.surukluyor());
sk.api.mogrtSec({ path: "/x.mogrt" });
olay("pointerdown", { clientX: 220, clientY: 140 });
ok("Premiere şablonu seçiliyken sürükleme yok (konum ve seçim değişmez)", !sk.api.surukluyor() && sk.api.durum().mogrt !== null && sk.dom["cap-konum-x"].value === once[0]);

// kalıcılık: tercih, paylaşım kodu, Şablonum, Marka Kiti
var ka = ortam();
ka.api.gorunumUygula("zarif");
ka.dom["cap-konum-x"].value = "22"; ka.dom["cap-konum-y"].value = "77";
ka.dom["cap-kutu"].checked = true; ka.dom["cap-kutu-opak"].value = "40";
ka.api.savePrefs();
var yeni = ortam({ ayar: JSON.parse(JSON.stringify(ka.ayar)) });
yeni.api.loadPrefs();
ok("tercih: gölge, kutu ve serbest konum yeniden açılışta geri gelir", yeni.dom["cap-efekt-golge"].checked === true && yeni.dom["cap-efekt-golge-yumusak"].value === "10" &&
  yeni.dom["cap-kutu"].checked === true && yeni.dom["cap-kutu-opak"].value === "40" && yeni.dom["cap-konum-x"].value === "22" && yeni.dom["cap-konum-y"].value === "77" &&
  yeni.api.durum().motor === "efekt", J([yeni.dom["cap-konum-x"].value, yeni.dom["cap-kutu-opak"].value]));
var kod7 = ka.api.stilKodu();
var coz7 = SS.decode(kod7.kod, function (id) { return SE.has(id); });
ok("paylaşım kodu gölge / kutu / serbest konumu taşır, uyarısız", coz7.ok && coz7.warnings.length === 0 && coz7.recipe.overrides.konumX === 22 &&
  coz7.recipe.overrides.kutu === true && coz7.recipe.overrides.kutuOpak === 40 && coz7.recipe.overrides.golge && coz7.recipe.overrides.golge.yumusak === 10, J(coz7.recipe.overrides));
var al = ortam();
al.api.stilKoduUygula(kod7.kod);
ok("kod alıcıda aynı gölge / kutu / konumla uygulanır", al.dom["cap-konum-x"].value === "22" && al.dom["cap-konum-y"].value === "77" && al.dom["cap-kutu"].checked === true &&
  al.dom["cap-efekt-golge"].checked === true && al.dom["cap-efekt-golge-mesafe"].value === "3");
var eskiKod16 = SS.encode({ styleId: "efekt", overrides: AE.overrides(AE.gorunum("canli").ayar) });
var al2 = ortam();
al2.dom["cap-konum-x"].value = "33"; al2.dom["cap-konum-y"].value = "44"; al2.dom["cap-efekt-golge"].checked = true;
al2.api.stilKoduUygula(SS.encode({ styleId: "efekt", overrides: { renk: "#ff0000" } }));
ok("gölge / konum alanı olmayan kod (adım 16 kodu gibi) önceki ayarı taşımaz: temel görünümün değerleri (gölge yok, hazır konum)",
  al2.dom["cap-konum-x"].value === "" && al2.dom["cap-efekt-golge"].checked === false && al2.dom["cap-renk"].value === "#ff0000" && !!eskiKod16);
var mk7 = ortam({ ayar: { markaKiti: { on: true, stil: { overrides: { konum: 2, konumX: 20, konumY: 30, kutu: true, kutuRenk: "#00ff00", kutuOpak: 70 } } } } });
mk7.api.gorunumUygula("canli");
ok("Marka Kiti'nin serbest konumu ve kutusu görünümle gelir", mk7.dom["cap-konum-x"].value === "20" && mk7.dom["cap-konum-y"].value === "30" &&
  mk7.dom["cap-kutu"].checked === true && mk7.dom["cap-kutu-renk"].value === "#00ff00" && mk7.dom["cap-efekt-aktif"].value === "zipla");
var initKod = govde("function init(");
ok("init: gölge / kutu sayı kutuları aralığa (boşsa varsayılana) döner", /if \(EFEKT_SAYILARI\[id\]\) e\.value = String\(efektSayi\(id,/.test(initKod));
ok("init: hazır konum seçilince serbest konum bırakılır; sürükleme bağlanır (açılışta Premiere / ffmpeg yok)",
  /id === "cap-konum"\) \{ if \(el\("cap-konum-x"\)\) el\("cap-konum-x"\)\.value = ""/.test(initKod) && /konumSurukleBagla\(\);/.test(initKod) &&
  ["cap-efekt-golge", "cap-efekt-golge-opak", "cap-kutu", "cap-kutu-renk", "cap-kutu-opak"].every(function (id) { return cap.indexOf('"' + id + '"', cap.indexOf("var EFEKT_KONTROLLERI")) !== -1; }));
ok("index.html: gölge / kutu kontrolleri oluşturucuda, sahne odaklanabilir, artı işareti; eski gizli kutu taşıyıcısı yok",
  /id="cap-efekt-ayarlar"[\s\S]*id="cap-efekt-golge"[\s\S]*id="cap-kutu"[\s\S]*id="cap-konum-x"/.test(html) && /id="cap-sahne" tabindex="0"/.test(html) &&
  /id="cap-efekt-arti"/.test(html) && html.slice(html.indexOf('class="ia-eski"'), html.indexOf("</div>", html.indexOf('class="ia-eski"'))).indexOf("cap-kutu") === -1 &&
  /min="0" max="20"/.test(html) && /min="0" max="30"/.test(html));

console.log("\n" + gecen + "/" + toplam + " geçti");
process.exit(gecen === toplam ? 0 : 1);
