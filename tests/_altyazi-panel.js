// Suflo test yardımcısı (doğrudan koşulmaz: "_" ile başlar): Altyazı sekmesinin stil işlevleri (captions.js'in GERÇEK
// işlevleri kesilip) sahte DOM ile, VERİLEN kök klasörden kurulur. Düzen tests/test-altyazi-efekt-ui.js ve
// tests/test-yazi-animasyon-ui.js ile aynı; fark: işlev listesi uyarlanır (kaynakta olmayan işlev atlanır), böylece aynı
// sahte panel hem bugünkü kodla hem de eski sürümün (git show 5d153e7) koduyla kurulabilir. Uyumluluk testi
// (tests/test-altyazi-uyumluluk.js) ve eski fikstür üreticisi (tests/fixtures/altyazi-eski/uret.js) bunu kullanır.
var fs = require("fs"), path = require("path");

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
  d.querySelector = function (sec) {
    // <select id="cap-preset">: option[value="user"] (ensureUserPresetOption)
    var m = /^option\[value="([^"]*)"\]$/.exec(sec);
    if (m) return d.childNodes.filter(function (c) { return c.tagName === "OPTION" && c.value === m[1]; })[0] || null;
    return d.querySelectorAll(sec)[0] || null;
  };
  Object.defineProperty(d, "innerHTML", { set: function () { d.childNodes = []; }, get: function () { return ""; } });
  for (var k in ek || {}) d[k] = ek[k];
  return d;
}
function secim(ids, deger) {
  var d = dugum("select", { value: deger });
  d.options = ids.map(function (v) { return { value: v }; });
  return d;
}
// "Animasyon" seçicisi: <option value="">Klasik…</option> + doldurulan optgroup'lar; value yalnız var olan seçeneğe geçer
function animSecici() {
  var d = dugum("select");
  d.appendChild(dugum("option", { value: "", textContent: "Klasik (giriş + vurgu ayrı)" }));
  var deger = "";
  function secenekler() { var out = []; (function gez(n) { n.childNodes.forEach(function (c) { if (c.tagName === "OPTION") out.push(c); if (c.childNodes) gez(c); }); })(d); return out; }
  Object.defineProperty(d, "value", { get: function () { return deger; }, set: function (v) { var s = String(v); deger = secenekler().some(function (x) { return x.value === s; }) ? s : ""; } });
  d.querySelector = function (sec) {
    if (sec === "optgroup[data-anim]") return d.childNodes.filter(function (c) { return c.tagName === "OPTGROUP" && c.getAttribute("data-anim"); })[0] || null;
    return null;
  };
  return d;
}

// Görünür ayarlar: kullanıcının panelde gördüğü kontrollerin değerleri (eski ve bugünkü panelde ortak olanlar)
var GORUNUR = ["cap-preset", "cap-style-family", "cap-maxlen", "cap-case", "cap-punct", "cap-yogunluk", "cap-font", "cap-boyut", "cap-renk",
  "cap-renk-kontur", "cap-renk-vurgu", "cap-kontur", "cap-konum", "cap-kutu", "cap-animasyon", "cap-guvenli-yerlesim", "cap-efekt-giris",
  "cap-efekt-aktif", "cap-efekt-vurgu", "cap-efekt-kalin", "cap-efekt-italik", "cap-efekt-satir", "cap-efekt-kelime", "cap-efekt-golge",
  "cap-efekt-golge-renk", "cap-efekt-golge-opak", "cap-efekt-golge-mesafe", "cap-efekt-golge-yumusak", "cap-kutu-renk", "cap-kutu-opak",
  "cap-konum-x", "cap-konum-y", "cap-stil-yazar"];

/*
 * kur(kok): o kök klasörün js/ modülleriyle bir ortam üreticisi döndürür. ortam(o): { api, dom, ayar, toastlar, gorunur() }
 *   o.ayar: K.settings() nesnesi (capPrefs, userPreset, markaKiti…)
 */
function kur(kok) {
  kok = path.resolve(kok);
  var cap = fs.readFileSync(path.join(kok, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
  function govde(imza) {
    var i = cap.indexOf(imza);
    if (i < 0) return "";
    return cap.slice(i, cap.indexOf("\n  }\n", i) + 4);
  }
  function modul(ad) { var p = path.join(kok, "js", ad); return fs.existsSync(p) ? require(p) : null; }
  var SS = modul("style-share.js"), SE = modul("style-engine.js"), MK = modul("marka-kiti.js"), AE = modul("altyazi-efekt.js");
  var GAL = modul("stil-galeri.js"), YA = modul("yazi-animasyonlari.js"), SK = modul("stil-kodu.js");
  var ISLEVLER = ["motorPreset", "motorStiliMi", "uzunlukSecimi", "applyPreset", "stilKartiIsaretle", "efektStili", "efektAyari", "efekteGec",
    "efektSonrasi", "gorunumUygula", "gorunumleriCiz", "yeniOnce", "yeniEfektBandiniKur", "yeniMogrtMi", "efektKelimeSayisi", "stil()", "motorAyarlari", "savePrefs", "loadPrefs", "stiliYaz",
    "markaKiti", "dikeySekans", "inceAyarDurumu", "stilKredisi", "stilKodu", "stilKoduUygula", "varsayilanaDon", "tarayiciDeposu",
    "galeriTuslariniTut", "efektVarsayilan", "sablonumUygula", "efektAnimSeciminiDoldur", "ensureUserPresetOption", "saveUserPreset",
    "efektSayi", "efektSayiAlani", "serbestKonumDegeri", "efektBagimliDurum", "konumAktif", "konumOlcusu", "kirilimDili", "konumOrnegi",
    "konumTuslariniTut", "motorOnizlemeCueleri", "sahneNoktasi", "artiGoster", "konumYaz", "konumDegisti", "konumSuruklemeAdim",
    "konumSuruklemeBitir", "konumSifirla", "konumSurukleBagla", "sahneErisimi", "stilYedegi", "stilYedeginiYukle"];
  var kod = ISLEVLER.map(function (ad) { return govde("function " + (/\(\)$/.test(ad) ? ad : ad + "(")); }).concat([
    cap.slice(cap.indexOf("  var EFEKT_KONTROLLERI = "), cap.indexOf("  function stilYedegi(")),
    cap.slice(cap.indexOf("  var EFEKT_GIRIS_SINIFI = "), cap.indexOf("  function onizlemeMetni("))
  ]).join("\n");
  var sayilar = cap.slice(cap.indexOf("  var EFEKT_SAYILARI = "), cap.indexOf("\n", cap.indexOf("\"cap-kutu-opak\": [50, 0, 100] };")) + 1);

  function ortam(o) {
    o = o || {};
    var ayar = o.ayar || {};
    var toastlar = [];
    var dom = {
      "cap-preset": secim(["", "efekt", "user"].concat(SE.list().map(function (p) { return p.id; })), ""),
      "cap-style-family": dugum("input", { value: "custom" }),
      "cap-maxlen": secim(["auto", "w2", "w3", "l32", "l42", "c42x2", "c60", "k1", "kc"], "l42"),
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
      "cap-efekt-kategoriler": dugum("div"), "cap-efekt-ipucu": dugum("div", { hidden: true, id: "cap-efekt-ipucu" }),
      "cap-stil-grid": dugum("div"), "cap-ince-ayar": dugum("details"), "cap-font-sistem": dugum("optgroup"),
      "cap-guvenli-yerlesim-sar": dugum("label"), "cap-marka-kiti-cip": dugum("span"), "cap-stil-yazar": dugum("input", { value: "" }),
      "cap-efekt-golge": dugum("input", { type: "checkbox" }), "cap-efekt-golge-renk": dugum("input", { type: "color", value: "#000000" }),
      "cap-efekt-golge-opak": dugum("input", { value: "75" }), "cap-efekt-golge-mesafe": dugum("input", { value: "5" }), "cap-efekt-golge-yumusak": dugum("input", { value: "5" }),
      "cap-efekt-golge-ayar": dugum("div"), "cap-kutu-renk": dugum("input", { type: "color", value: "#000000" }), "cap-kutu-opak": dugum("input", { value: "50" }),
      "cap-efekt-kutu-ayar": dugum("div"), "cap-konum-x": dugum("input", { type: "hidden", value: "" }), "cap-konum-y": dugum("input", { type: "hidden", value: "" }),
      "cap-konum-serbest": dugum("div"), "cap-konum-serbest-deger": dugum("b"), "cap-konum-sifirla": dugum("button"),
      "cap-sahne": dugum("div"), "cap-efekt-arti": dugum("div", { hidden: true }), "cap-efekt-arti-etiket": dugum("span"),
      "cap-render-onizleme": dugum("video", { hidden: true }), "cap-apply-style": dugum("button"), "cap-apply-hint": dugum("p"),
      "cap-efekt-anim": animSecici(), "cap-efekt-anim-ipucu": dugum("p", { hidden: true }),
      "cap-efekt-vurgu-kutusu": dugum("input", { type: "color", value: "#ffd23f" }), "cap-efekt-vurgu2": dugum("input", { type: "color", value: "#3f6cff" }),
      "cap-efekt-vurgu-kutusu-sar": dugum("label", { hidden: true }), "cap-efekt-vurgu2-sar": dugum("label", { hidden: true }),
      "cap-efekt-anim-renkler": dugum("div", { hidden: true })
    };
    dom["cap-efekt-vurgu-kutusu"].setAttribute("data-oto", "1");
    dom["cap-efekt-vurgu2"].setAttribute("data-oto", "1");
    dom["cap-efekt-arti"].appendChild(dugum("i", { className: "efekt-arti-dikey" }));
    dom["cap-efekt-arti"].appendChild(dugum("i", { className: "efekt-arti-yatay" }));
    dom["cap-sahne"].getBoundingClientRect = function () { return { left: 100, top: 50, width: 400, height: 225 }; };
    dom["cap-sahne"].setPointerCapture = function () {};
    dom["cap-sahne"].releasePointerCapture = function () {};
    dom["cap-sahne"].focus = function () {};
    var K = { settings: function () { return ayar; }, saveSettings: function () {}, log: function () {}, MAC: false };
    var window = { SufloStyleEngine: SE, SufloStyleShare: SS, SufloMarkaKiti: MK, SufloAltyaziEfekt: AE, KApp: { ctx: function () { return o.ctx || {}; } } };
    if (GAL) window.SufloStilGaleri = GAL;
    if (YA) window.SufloYaziAnimasyon = YA;
    if (SK) window.SufloStilKodu = SK;
    var api = new Function("K", "window", "document", "el", "KApp", "Pro",
      "var SS = window.SufloStyleShare, AE = window.SufloAltyaziEfekt, EFEKT = 'efekt';\n" + sayilar +
      "var secilenMogrt = null, secilenMotorStili = '', secilenGorunum = '', sonGorunum = '', bekleyenMogrtYolu = '', stilKrediAd = '';\n" +
      "var katmanIptal = null, katmanHazirlaniyor = false;\n" +
      "var FONTLAR = SS.fontFiles();\n" +
      "var PRESETS = {}; window.SufloStyleEngine.list().forEach(function (p) { PRESETS[p.id] = motorPreset(p.id); });\n" +
      "var onizleme = { durdur: 0, ciz: 0, tazele: [], oynat: 0 };\n" +
      "var surukleme = null, artiSaat = null, konumTusTutuluyor = false, onizlemeSaat = null;\n" +
      "var segments = [];\n" +
      "var segmentsMode = 'l42'; function styleText(t) { return t; }\n" +
      "function cueler() { return []; }\n" +
      "function onizlemeDurdur() { onizleme.durdur++; } function onizlemeCiz() { onizleme.ciz++; } function onizlemeOynat() { onizleme.oynat++; }\n" +
      "function efektOnizlemeTazele(h) { onizleme.tazele.push(!!h); }\n" +
      "function vurguKutusuDurumu() {} function kelimeSiniriDurumu() {} function motorSecenekDurumu() {} function uygulamaIpucunuGuncelle() {}\n" +
      "function arayuzDili() { return 'tr'; } function kelimeSiniri() { return 0; }\n" + kod +
      "\nreturn { gorunumleriCiz: gorunumleriCiz, gorunumUygula: gorunumUygula, stil: stil, motorAyarlari: motorAyarlari, loadPrefs: loadPrefs," +
      " savePrefs: savePrefs, stilKodu: stilKodu, stilKoduUygula: stilKoduUygula, applyPreset: applyPreset, sablonumUygula: sablonumUygula," +
      " saveUserPreset: saveUserPreset, efektKontrolleriniBagla: efektKontrolleriniBagla," +
      " efektAnimSeciminiDoldur: typeof efektAnimSeciminiDoldur === 'function' ? efektAnimSeciminiDoldur : function () {}," +
      " durum: function () { return { motor: secilenMotorStili, gorunum: secilenGorunum, son: sonGorunum, kredi: stilKrediAd }; } };")(
      K, window, { createElement: function (t) { return dugum(t); }, querySelectorAll: function () { return []; } },
      function (id) { return dom[id] || null; }, { toast: function (m) { toastlar.push(m); } }, {});
    api.efektAnimSeciminiDoldur();
    function gorunur() {
      var out = {};
      GORUNUR.forEach(function (id) { var d = dom[id]; out[id] = d.type === "checkbox" ? !!d.checked : String(d.value); });
      return out;
    }
    return { api: api, dom: dom, ayar: ayar, toastlar: toastlar, gorunur: gorunur };
  }
  return { ortam: ortam, SS: SS, SE: SE, MK: MK, AE: AE, YA: YA, SK: SK, cap: cap };
}

module.exports = { kur: kur, GORUNUR: GORUNUR, dugum: dugum };
