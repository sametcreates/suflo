// Suflo testi: animasyon motoru v2 — "Animasyon" seçicisinin panel bağlantısı. captions.js'in GERÇEK işlevleri kesilip
// sahte DOM ile çalıştırılır (düzen tests/test-altyazi-efekt-ui.js ile aynı).
//  - seçici katalogdan dolar (ilk seçenek Klasik, kategori başına optgroup), ikinci çağrı yeniden doldurmaz
//  - seçim stil() / motorAyarlari'na gider (katman, önizleme, Shorts paketi aynı ayarı alır); giriş / vurgu kapanır, ipucu görünür
//  - seçim hazır görünüm çipini kaldırır, gerçek önizlemeyi tazeler, tercihe yazılır
//  - tercih (savePrefs / loadPrefs) ve ★ Şablonum gidip gelir; anim'siz eski kayıt klasik açılır
//  - stil kodu (SufloStilKodu) gidip gelir; hazır görünüm animasyonu bırakır; Marka Kiti animasyon taşımaz
//  - parti 5: vurgu kutusu / ikinci vurgu renk seçicileri yalnız onları kullanan animasyonda görünür, türetilmiş rengi
//    gösterir; tercih, Şablonum, stil kodu, rehber yedeği renkleri taşır; eski kayıt / kod türetilmiş renkle açılır
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
var YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
var SK = require(path.join(KOK, "js", "stil-kodu.js"));

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
// Seçici: <option value="">Klasik…</option> (index.html) + doldurulan optgroup'lar; value yalnız var olan seçeneğe geçer (tarayıcı gibi)
function animSecici() {
  var d = dugum("select");
  var ilk = dugum("option", { value: "", textContent: "Klasik (giriş + vurgu ayrı)" });
  d.appendChild(ilk);
  var deger = "";
  function secenekler() { var out = []; (function gez(n) { n.childNodes.forEach(function (c) { if (c.tagName === "OPTION") out.push(c); if (c.childNodes) gez(c); }); })(d); return out; }
  Object.defineProperty(d, "value", { get: function () { return deger; }, set: function (v) { var s = String(v); deger = secenekler().some(function (x) { return x.value === s; }) ? s : ""; } });
  d.secenekler = secenekler;
  d.querySelector = function (sec) {
    if (sec === "optgroup[data-anim]") { var g = d.childNodes.filter(function (c) { return c.tagName === "OPTGROUP" && c.getAttribute("data-anim"); }); return g[0] || null; }
    return null;
  };
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
    "cap-render-onizleme": dugum("video", { hidden: true }),
    "cap-apply-style": dugum("button"), "cap-apply-hint": dugum("p"),
    // Animasyon motoru v2: "Animasyon" seçicisi (ilk seçenek index.html'de: Klasik) ve ipucu
    "cap-efekt-anim": animSecici(), "cap-efekt-anim-ipucu": dugum("p", { hidden: true }),
    // Parti 5: animasyonun ek renk seçicileri (data-oto: türetilir) ve sarmalayıcıları
    "cap-efekt-vurgu-kutusu": dugum("input", { type: "color", value: "#ffd23f" }), "cap-efekt-vurgu2": dugum("input", { type: "color", value: "#3f6cff" }),
    "cap-efekt-vurgu-kutusu-sar": dugum("label", { hidden: true }), "cap-efekt-vurgu2-sar": dugum("label", { hidden: true }),
    "cap-efekt-anim-renkler": dugum("div", { hidden: true })
  };
  dom["cap-efekt-vurgu-kutusu"].setAttribute("data-oto", "1");
  dom["cap-efekt-vurgu2"].setAttribute("data-oto", "1");
  if (o.renksiz) ["cap-efekt-vurgu-kutusu", "cap-efekt-vurgu2", "cap-efekt-vurgu-kutusu-sar", "cap-efekt-vurgu2-sar", "cap-efekt-anim-renkler"].forEach(function (x) { delete dom[x]; });
  dom["cap-efekt-arti"].appendChild(dugum("i", { className: "efekt-arti-dikey" }));
  dom["cap-efekt-arti"].appendChild(dugum("i", { className: "efekt-arti-yatay" }));
  // 400 × 225 px sahne (16:9) sayfanın (100, 50) noktasında
  dom["cap-sahne"].getBoundingClientRect = function () { return { left: 100, top: 50, width: 400, height: 225 }; };
  var yakalanan = [];
  dom["cap-sahne"].setPointerCapture = function (id) { yakalanan.push("al:" + id); };
  dom["cap-sahne"].releasePointerCapture = function (id) { yakalanan.push("bırak:" + id); };
  dom["cap-sahne"].focus = function () {};
  var K = { settings: function () { return ayar; }, saveSettings: function () { kayit++; }, log: function () {}, MAC: !!o.mac };
  var window = { SufloStyleEngine: SE, SufloStyleShare: SS, SufloMarkaKiti: MK, SufloAltyaziEfekt: AE, KApp: { ctx: function () { return o.ctx || {}; } } };
  if (!o.katalogsuz) { window.SufloYaziAnimasyon = YA; window.SufloStilKodu = SK; }
  // CEP köprüsü (yalnız verilirse): registerKeyEventsInterest çağrıları kaydedilir
  if (o.cep) window.__adobe_cep__ = o.cep;
  var kod = [
    govde("function motorPreset("), govde("function motorStiliMi("), govde("function uzunlukSecimi("), govde("function applyPreset("),
    govde("function stilKartiIsaretle("), govde("function efektStili("), govde("function efektAyari("), govde("function efekteGec("),
    govde("function efektSonrasi("), govde("function gorunumUygula("), govde("function gorunumleriCiz("), govde("function efektKelimeSayisi("),
    govde("function stil()"), govde("function motorAyarlari("), govde("function savePrefs("), govde("function loadPrefs("), govde("function stiliYaz("),
    govde("function markaKiti("), govde("function dikeySekans("), govde("function inceAyarDurumu("), govde("function stilKredisi("),
    govde("function stilKodu("), govde("function stilKoduUygula("), govde("function varsayilanaDon("),
    govde("function efektVarsayilan("), govde("function sablonumUygula("),
    govde("function efektAnimSeciminiDoldur("), govde("function ensureUserPresetOption("), govde("function saveUserPreset("),
    govde("function efektSayi("), govde("function efektSayiAlani("), govde("function serbestKonumDegeri("), govde("function efektBagimliDurum("),
    govde("function konumAktif("), govde("function konumOlcusu("), govde("function kirilimDili("), govde("function konumOrnegi("), govde("function konumTuslariniTut("),
    govde("function motorOnizlemeCueleri("), govde("function sahneNoktasi("), govde("function artiGoster("), govde("function konumYaz("),
    govde("function konumDegisti("), govde("function konumSuruklemeAdim("), govde("function konumSuruklemeBitir("), govde("function konumSifirla("),
    govde("function konumSurukleBagla("), govde("function sahneErisimi("), govde("function stilYedegi("), govde("function stilYedeginiYukle("),
    // oluşturucu kontrolleri ve rehber yedeğinin alan listeleri (EFEKT_KONTROLLERI + efektKontrolleriniBagla, EFEKT_ISARETLERI, STIL_ALANLARI)
    cap.slice(cap.indexOf("  var EFEKT_KONTROLLERI = "), cap.indexOf("  function stilYedegi(")),
    // DOM yedek önizlemesi (efektDomCiz, ölçeği ve kartın sahneye sığdırılması)
    cap.slice(cap.indexOf("  var EFEKT_GIRIS_SINIFI = "), cap.indexOf("  function onizlemeMetni("))
  ].concat(o.mogrt ? [
    // Premiere Şablonları listesi (yalnız istenince): kayıtlı şablon seçiminin geri yüklenmesi ve uygulama düğmesi
    govde("function mogrtOrani("), govde("function sekansOrani("), govde("function oranEtiketi("), govde("function temizMogrtAdi("),
    govde("function mogrtStilAnahtari("), govde("function mogrtStilleriniBirlestir("), govde("function mogrtStilleriniCiz("),
    govde("function refreshMogrtStyles("), govde("function uygulamaIpucunuGuncelle(")
  ] : []).join("\n");
  var api = new Function("K", "window", "document", "el", "KApp", "Pro",
    "var SS = window.SufloStyleShare, AE = window.SufloAltyaziEfekt, EFEKT = 'efekt';\n" +
    cap.slice(cap.indexOf("  var EFEKT_SAYILARI = "), cap.indexOf("\n", cap.indexOf("\"cap-kutu-opak\": [50, 0, 100] };")) + 1) +
    "var secilenMogrt = null, secilenMotorStili = '', secilenGorunum = '', sonGorunum = '', bekleyenMogrtYolu = '', stilKrediAd = '';\n" +
    "var FONTLAR = SS.fontFiles();\n" +
    "var PRESETS = {}; window.SufloStyleEngine.list().forEach(function (p) { PRESETS[p.id] = motorPreset(p.id); });\n" +
    "var onizleme = { durdur: 0, ciz: 0, tazele: [], oynat: 0 };\n" +
    "var surukleme = null, artiSaat = null, konumTusTutuluyor = false;\n" +
    // transkript yok: gerçek önizlemenin kartları motorOnizlemeCueleri'nin örnek cümlesi (o.segments ile transkript)
    "var segments = " + J(o.segments || []) + ";\n" +
    "var segmentsMode = 'l42'; function styleText(t) { return t; }\n" +
    "function cueler() { return segments.map(function (s) { return { start: s.start, end: s.end, text: s.text }; }); }\n" +
    "function onizlemeDurdur() { onizleme.durdur++; } function onizlemeCiz() { onizleme.ciz++; } function onizlemeOynat() { onizleme.oynat++; }\n" +
    "function efektOnizlemeTazele(h) { onizleme.tazele.push(!!h); }\n" +
    "function vurguKutusuDurumu() {} function kelimeSiniriDurumu() {} function motorSecenekDurumu() {}\n" +
    (o.mogrt ? "var mogrtStilleri = [], gercekMogrtStilleri = [], mogrtVitrini = [], mogrtVitriniIsi = null, kaliteOnayBekleyen = '', aktifMogrtOnizlemeDurdur = null, mogrtBaglam = { width: 1080, height: 1920 };\n" +
      "function yerelCiktiEtkin() { return false; } function yerelCiktiSecili() { return false; } function mogrtVitrininiYukle() { return Promise.resolve([]); } function mogrtStiliniSec() {}\n"
      : "function uygulamaIpucunuGuncelle() {}\n") +
    "function arayuzDili() { return 'tr'; } function kelimeSiniri() { return 0; }\n" + kod +
    "\nreturn { gorunumleriCiz: gorunumleriCiz, gorunumUygula: gorunumUygula, stil: stil, motorAyarlari: motorAyarlari, loadPrefs: loadPrefs, savePrefs: savePrefs," +
    " stilKodu: stilKodu, stilKoduUygula: stilKoduUygula, applyPreset: applyPreset, efekteGec: efekteGec, varsayilanaDon: varsayilanaDon, onizleme: onizleme," +
    " durum: function () { return { motor: secilenMotorStili, gorunum: secilenGorunum, son: sonGorunum, mogrt: secilenMogrt, kredi: stilKrediAd }; }," +
    " efektAyari: efektAyari, konumSurukleBagla: konumSurukleBagla, surukluyor: function () { return !!surukleme; }," +
    " stilYedegi: stilYedegi, stilYedeginiYukle: stilYedeginiYukle, sablonumUygula: sablonumUygula," +
    " efektKontrolleriniBagla: efektKontrolleriniBagla, efektAnimSeciminiDoldur: efektAnimSeciminiDoldur, saveUserPreset: saveUserPreset, efektBagimliDurum: efektBagimliDurum, stilKartiIsaretle: stilKartiIsaretle, efektDomCiz: efektDomCiz, efektKartiSigdir: efektKartiSigdir," +
    " konumOrnegi: konumOrnegi, konumAktif: konumAktif, bekleyenMogrt: function () { return bekleyenMogrtYolu; }," +
    (o.mogrt ? " refreshMogrtStyles: refreshMogrtStyles," : "") +
    " mogrtSec: function (m) { secilenMogrt = m; secilenMotorStili = ''; } };")(
    K, window, { createElement: function (t) { return dugum(t); }, querySelectorAll: function () { return []; } },
    function (id) { return dom[id] || null; }, { toast: function (m, tur) { toastlar.push(m); } }, o.mogrt ? { isPro: function () { return true; }, gate: function () { return true; } } : {});
  return { api: api, dom: dom, ayar: ayar, toastlar: toastlar, kayit: function () { return kayit; }, yakalanan: yakalanan };
}

var kelimeCue = ["Bunu", "*gören*", "herkes", "şaşırdı", "bugün"].map(function (w, i) { return { start: i * 0.5, end: i * 0.5 + 0.44, text: w }; });
function ciz(ov) { return SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1080, height: 1920, overrides: ov }); }
function degistir(e, id, v) { e.dom[id].value = v; (e.dom[id].dinle.change || []).forEach(function (f) { f({ target: e.dom[id] }); }); }

/* ---------------- 1) seçici dolar ---------------- */
var e = ortam();
e.api.efektAnimSeciminiDoldur();
e.api.efektAnimSeciminiDoldur();
var sec = e.dom["cap-efekt-anim"];
var gruplar = sec.childNodes.filter(function (c) { return c.tagName === "OPTGROUP"; });
ok("seçici: ilk seçenek Klasik (değer \"\"), kategori başına bir optgroup (AutoCaptions grubu \"· Pro\"), her animasyon bir kez", sec.childNodes[0].tagName === "OPTION" && sec.childNodes[0].value === "" &&
  gruplar.length === YA.gruplar().length && J(gruplar.map(function (g) { return g.label; })) === J(YA.gruplar().map(function (g) { return g.id === "autocaptions" ? g.ad + " · Pro" : g.ad; })) &&
  J(sec.secenekler().slice(1).map(function (o) { return o.value; }).sort()) === J(YA.kimlikler().sort()), J(gruplar.map(function (g) { return g.label; })));
ok("seçici: seçenek adı Türkçe ad, açıklama title'da", sec.secenekler().slice(1).every(function (o) { var a = YA.bul(o.value); return o.textContent === a.ad && o.title === a.aciklama; }));
ok("index.html: #cap-efekt-anim #cap-efekt-ayarlar'ın başında, Klasik seçeneği ve ipucu", /id="cap-efekt-ayarlar">\s*<!--[^>]*-->\s*<div class="field efekt-anim">\s*<label for="cap-efekt-anim">Animasyon<\/label>\s*<select id="cap-efekt-anim">\s*<option value="" selected>Klasik \(giriş \+ vurgu ayrı\)<\/option>/.test(html) &&
  /id="cap-efekt-anim-ipucu" hidden/.test(html));
ok("init seçiciyi görünümlerden önce doldurur, kontrol bağlanır (EFEKT_KONTROLLERI, rehber yedeği)", /efektAnimSeciminiDoldur\(\);\s*gorunumleriCiz\(\);/.test(govde("function init(")) &&
  /var EFEKT_KONTROLLERI = \["cap-efekt-anim",/.test(cap) && /var STIL_ALANLARI = [^;]*"cap-efekt-anim"/.test(cap));

/* ---------------- 2) seçim → motor, kontroller, çip, önizleme, tercih ---------------- */
e.api.gorunumleriCiz();
e.api.efektKontrolleriniBagla();
e.api.gorunumUygula("vurucu");
var cipler = e.dom["cap-efekt-gorunumler"].childNodes;
ok("başlangıç: Vurucu seçili, animasyon Klasik, giriş / vurgu açık, ipucu gizli", e.api.durum().gorunum === "vurucu" && sec.value === "" &&
  !e.dom["cap-efekt-giris"].disabled && !e.dom["cap-efekt-aktif"].disabled && e.dom["cap-efekt-anim-ipucu"].hidden === true && !("anim" in e.api.motorAyarlari(e.api.stil())));
var tazeOnce = e.api.onizleme.tazele.length;
degistir(e, "cap-efekt-anim", "kelime-pop");
var ov = e.api.motorAyarlari(e.api.stil());
ok("seçim stil() ve motorAyarlari'na gider (katman, önizleme, ASS dışa aktarma aynı ayar)", e.api.stil().anim === "kelime-pop" && ov.anim === "kelime-pop" && ov.giris === "pop" && ov.font === "Anton", J(ov));
ok("seçim: giriş / vurgu animasyonu kapanır, ipucu görünür", e.dom["cap-efekt-giris"].disabled === true && e.dom["cap-efekt-aktif"].disabled === true && e.dom["cap-efekt-anim-ipucu"].hidden === false);
ok("seçim hazır görünüm çipini kaldırır, gerçek önizlemeyi tazeler, tercihe yazılır", e.api.durum().gorunum === "" && !cipler[1].classList.contains("secili") &&
  e.api.onizleme.tazele.length === tazeOnce + 1 && e.ayar.capPrefs.stil.anim === "kelime-pop" && e.ayar.capPrefs.motorStili === "efekt");
var r = ciz(ov);
ok("motor çıktısı yazı animasyonuyla (kelime pop: \\fscx0 → 115, kelimeye satır içi)", r.style.anim === "kelime-pop" &&
  /\{\\fscx0\\fscy0\\t\(0,\d+,\\fscx[\d.]+\\fscy[\d.]+\)\}Bunu/.test(r.ass) && /\\fscx115\\fscy115/.test(r.ass));
ok("efektAyari animasyonu taşır (Shorts paketi 'Altyazı sekmesindeki efekt', AE, yerel çıktı)", e.api.efektAyari().anim === "kelime-pop" &&
  AE.normalize(e.api.efektAyari()).anim === "kelime-pop");
degistir(e, "cap-efekt-anim", "uzay");
ok("katalogda olmayan değer seçilemez → Klasik", sec.value === "" && e.api.stil().anim === "" && !("anim" in e.api.motorAyarlari(e.api.stil())) && !e.dom["cap-efekt-giris"].disabled);
degistir(e, "cap-efekt-anim", "netles");
e.api.gorunumUygula("zarif");
ok("hazır görünüm seçmek animasyonu bırakır (görünümler klasik)", sec.value === "" && e.api.durum().gorunum === "zarif" && !e.dom["cap-efekt-aktif"].disabled);

/* ---------------- 3) tercih gidip gelir ---------------- */
degistir(e, "cap-efekt-anim", "dalga");
var kayit = JSON.parse(J(e.ayar.capPrefs));
var y = ortam({ ayar: { capPrefs: kayit } });
y.api.efektAnimSeciminiDoldur();
y.api.loadPrefs();
y.api.efektBagimliDurum();
ok("tercih: animasyon kaydedilip geri yüklenir, kontroller kapalı", y.dom["cap-efekt-anim"].value === "dalga" && y.api.motorAyarlari(y.api.stil()).anim === "dalga" &&
  y.dom["cap-efekt-giris"].disabled === true && y.api.durum().motor === "efekt", J(kayit.stil));
var eskiPrefs = JSON.parse(J(kayit));
delete eskiPrefs.stil.anim;
var z = ortam({ ayar: { capPrefs: eskiPrefs } });
z.api.efektAnimSeciminiDoldur();
z.dom["cap-efekt-anim"].value = "netles";   // seçici o anda başka değerdeyken bile
z.api.loadPrefs();
ok("animasyondan önceki kayıt (anim alanı yok) Klasik açılır", z.dom["cap-efekt-anim"].value === "" && !("anim" in z.api.motorAyarlari(z.api.stil())));
var kat = ortam({ ayar: { capPrefs: kayit }, katalogsuz: true });
kat.api.loadPrefs();
ok("katalog yüklenemezse panel klasikte kalır (hata yok)", kat.api.stil().anim === "" && !("anim" in kat.api.motorAyarlari(kat.api.stil())));

/* ---------------- 4) ★ Şablonum ---------------- */
var s = ortam();
s.api.efektAnimSeciminiDoldur();
s.api.gorunumleriCiz();
s.api.gorunumUygula("canli");
degistir(s, "cap-efekt-anim", "sallanma");
s.api.saveUserPreset();
ok("Şablonum animasyonu saklar", s.ayar.userPreset && s.ayar.userPreset.stil.anim === "sallanma" && s.dom["cap-preset"].value === "user");
s.api.gorunumUygula("temiz");
ok("başka görünüm: animasyon Klasik", s.dom["cap-efekt-anim"].value === "");
s.api.sablonumUygula();
ok("★ Şablonum animasyonu geri getirir", s.dom["cap-efekt-anim"].value === "sallanma" && s.api.motorAyarlari(s.api.stil()).anim === "sallanma");
var eskiSab = JSON.parse(J(s.ayar.userPreset));
delete eskiSab.stil.anim;
var s2 = ortam({ ayar: { userPreset: eskiSab } });
s2.api.efektAnimSeciminiDoldur();
s2.dom["cap-efekt-anim"].value = "netles";
s2.api.sablonumUygula();
ok("animasyondan önceki Şablonum Klasik uygulanır", s2.dom["cap-efekt-anim"].value === "" && s2.api.motorAyarlari(s2.api.stil()).aktif === "zipla");

/* ---------------- 5) stil kodu ---------------- */
var k = ortam();
k.api.efektAnimSeciminiDoldur();
k.api.gorunumUygula("glitch");
degistir(k, "cap-efekt-anim", "yandan-kay");
var kod = k.api.stilKodu().kod;
var bugun = SS.decode(kod, function (id) { return SE.has(id); });
ok("Stili paylaş: kod SufloStilKodu ile (ek.anim), bugünkü panel / site klasik çifti görür", SK.decode(kod, function (id) { return SE.has(id); }).recipe.overrides.anim === "yandan-kay" &&
  bugun.ok && bugun.recipe.overrides.giris === "fade" && bugun.recipe.overrides.aktif === "yok" && J(bugun.warnings) === J(["ek"]), J(bugun.recipe.overrides));
var al = ortam();
al.api.efektAnimSeciminiDoldur();
al.dom["cap-efekt-anim"].value = "netles";
ok("kod uygulanır: animasyon gelir, uyarı yok", al.api.stilKoduUygula(kod) === true && al.dom["cap-efekt-anim"].value === "yandan-kay" &&
  al.api.motorAyarlari(al.api.stil()).anim === "yandan-kay" && al.dom["cap-font"].value === "Bebas Neue" &&
  al.toastlar.some(function (t) { return /^Stil kodu uygulandı/.test(t) && !/geçersiz ayar/.test(t); }), al.toastlar.join(" | "));
var al2 = ortam();
al2.api.efektAnimSeciminiDoldur();
al2.dom["cap-efekt-anim"].value = "netles";
al2.api.stilKoduUygula(SS.encode({ styleId: "efekt", overrides: AE.overrides(AE.gorunum("vurucu").ayar) }));
ok("animasyonsuz (eski) kod: animasyon Klasik'e döner", al2.dom["cap-efekt-anim"].value === "" && al2.api.durum().gorunum === "vurucu");
var al3 = ortam({ katalogsuz: true });
ok("SufloStilKodu yoksa (eski yükleme) kod SS ile çözülür", al3.api.stilKoduUygula(kod) === true && al3.api.stil().anim === "", al3.toastlar.join(" | "));

/* ---------------- 6) Marka Kiti ---------------- */
var mk = ortam({ ayar: { markaKiti: { on: true, stil: { overrides: { font: "Lora", renk: "#ff0000", anim: "dalga" } } } } });
mk.api.efektAnimSeciminiDoldur();
mk.api.gorunumUygula("glitch");
ok("Marka Kiti animasyon taşımaz (kit şeması değişmedi)", mk.dom["cap-font"].value === "Lora" && mk.dom["cap-efekt-anim"].value === "" &&
  !("anim" in MK.normalize({ on: true, stil: { overrides: { anim: "dalga" } } }).kit.stil.overrides));

/* ---------------- 7) parti 5: vurgu kutusu rengi ve ikinci vurgu rengi ---------------- */
function renkDegistir(e, id, v) { e.dom[id].value = v; (e.dom[id].dinle.input || []).forEach(function (f) { f({ target: e.dom[id] }); }); }
var rr = ortam();
rr.api.efektAnimSeciminiDoldur();
rr.api.gorunumleriCiz();
rr.api.efektKontrolleriniBagla();
rr.api.gorunumUygula("temiz");
var sar = function (x) { return rr.dom["cap-efekt-" + x + "-sar"].hidden; };
ok("parti 5: seçici yeni animasyonları kategorisinde gösterir (karaoke ailesi 'Konuşulan kelime', nefes 'Sürekli')", (function () {
  var g = rr.dom["cap-efekt-anim"].childNodes.filter(function (c) { return c.tagName === "OPTGROUP"; });
  function grupta(gid, id) { return g.some(function (x) { return x.getAttribute("data-anim") === gid && x.childNodes.some(function (o) { return o.value === id; }); }); }
  return grupta("karaoke", "vurgu-kutusu") && grupta("karaoke", "karaoke-dolgu") && grupta("surekli", "nefes") && grupta("kart", "perde") && grupta("kelime", "dusus");
})());
ok("parti 5: klasik / renk kullanmayan animasyonda iki renk seçicisi de gizli", sar("vurgu-kutusu") && sar("vurgu2") && rr.dom["cap-efekt-anim-renkler"].hidden === true);
degistir(rr, "cap-efekt-anim", "vurgu-kutusu");
ok("parti 5: Vurgu kutusu seçilince yalnız kutu rengi görünür, türetilmiş renk (vurgu rengi) gösterilir", !sar("vurgu-kutusu") && sar("vurgu2") &&
  rr.dom["cap-efekt-anim-renkler"].hidden === false && rr.dom["cap-efekt-vurgu-kutusu"].value === "#ffd23f" && rr.api.stil().vurguKutuRenk === null &&
  !("vurguKutuRenk" in rr.api.motorAyarlari(rr.api.stil())));
degistir(rr, "cap-efekt-anim", "iki-ton");
ok("parti 5: İki ton seçilince yalnız ikinci vurgu rengi görünür (vurgu renginin karşıtı)", sar("vurgu-kutusu") && !sar("vurgu2") &&
  rr.dom["cap-efekt-vurgu2"].value === YA.ikinciVurgu("#ffd23f"));
renkDegistir(rr, "cap-renk-vurgu", "#ff5fa2");
ok("parti 5: elle seçilmemiş ikinci renk vurgu rengini izler", rr.dom["cap-efekt-vurgu2"].value === YA.ikinciVurgu("#ff5fa2") && rr.api.stil().vurguRenk2 === null);
renkDegistir(rr, "cap-efekt-vurgu2", "#00aa55");
var rov = rr.api.motorAyarlari(rr.api.stil());
ok("parti 5: elle seçilen ikinci renk motora, tercihe gider; vurgu rengi değişince kalır", rov.vurguRenk2 === "#00aa55" && rr.ayar.capPrefs.stil.vurguRenk2 === "#00aa55" &&
  (renkDegistir(rr, "cap-renk-vurgu", "#ffd23f"), rr.dom["cap-efekt-vurgu2"].value === "#00aa55") &&
  /\\1c&H0055AA00/.test(ciz(rr.api.motorAyarlari(rr.api.stil())).ass), J(rov));
degistir(rr, "cap-efekt-anim", "vurgu-kutusu");
renkDegistir(rr, "cap-efekt-vurgu-kutusu", "#1b1f2a");
ok("parti 5: kutu rengi seçimi motora gider (kutu \\3c, kutudaki yazı kontrast)", rr.api.motorAyarlari(rr.api.stil()).vurguKutuRenk === "#1b1f2a" &&
  /SufloKutu,[^\n]*\\3c&H002A1F1B/.test(ciz(rr.api.motorAyarlari(rr.api.stil())).ass));
// tercih gidip gelir
var rk = JSON.parse(J(rr.ayar.capPrefs));
var ry = ortam({ ayar: { capPrefs: rk } });
ry.api.efektAnimSeciminiDoldur();
ry.api.loadPrefs();
ry.api.efektBagimliDurum();
ok("parti 5: tercih renkleri geri getirir (elle seçilenler elle, işaret yok)", ry.api.stil().vurguKutuRenk === "#1b1f2a" && ry.api.stil().vurguRenk2 === "#00aa55" &&
  ry.dom["cap-efekt-vurgu-kutusu"].getAttribute("data-oto") === null && ry.dom["cap-efekt-vurgu-kutusu-sar"].hidden === false, J(rk.stil));
var rEski = JSON.parse(J(rk)); delete rEski.stil.vurguKutuRenk; delete rEski.stil.vurguRenk2;
var rz = ortam({ ayar: { capPrefs: rEski } });
rz.api.efektAnimSeciminiDoldur();
rz.dom["cap-efekt-vurgu2"].removeAttribute("data-oto"); rz.dom["cap-efekt-vurgu2"].value = "#123456";
rz.api.loadPrefs();
ok("parti 5: alanlardan önceki kayıt (renk alanı yok) türetilmiş renkle açılır", rz.api.stil().vurguKutuRenk === null && rz.api.stil().vurguRenk2 === null &&
  rz.dom["cap-efekt-vurgu2"].getAttribute("data-oto") === "1");
// Şablonum
rr.api.saveUserPreset();
rr.api.gorunumUygula("temiz");
ok("parti 5: hazır görünüm renkleri türetilmişe döndürür", rr.api.stil().vurguKutuRenk === null && rr.api.stil().vurguRenk2 === null && rr.dom["cap-efekt-anim"].value === "");
rr.api.sablonumUygula();
ok("parti 5: ★ Şablonum renkleri saklar ve geri getirir", rr.ayar.userPreset.stil.vurguKutuRenk === "#1b1f2a" && rr.api.stil().vurguKutuRenk === "#1b1f2a" &&
  rr.api.stil().vurguRenk2 === "#00aa55" && rr.dom["cap-efekt-anim"].value === "vurgu-kutusu");
// stil kodu
var rkod = rr.api.stilKodu().kod;
var rAl = ortam();
rAl.api.efektAnimSeciminiDoldur();
// Kod yalnız animasyonun kullandığı rengi taşır: vurgu kutusu → kutu rengi; kullanmadığı ikinci vurgu türetilmişe döner
ok("parti 5: stil kodu animasyonun kullandığı rengi taşır (ek), uygulanınca uyarısız gelir", rAl.api.stilKoduUygula(rkod) === true && rAl.api.stil().vurguKutuRenk === "#1b1f2a" &&
  rAl.api.stil().vurguRenk2 === null && rAl.dom["cap-efekt-vurgu2"].getAttribute("data-oto") === "1" && rAl.toastlar.some(function (t) { return /^Stil kodu uygulandı/.test(t) && !/geçersiz ayar/.test(t); }), rAl.toastlar.join(" | "));
ok("parti 5: eski çözücü aynı kodu klasik karşılıkla açar (renkler yok)", (function () {
  var b = SS.decode(rkod, function (id) { return SE.has(id); });
  return b.ok && !("vurguKutuRenk" in b.recipe.overrides) && b.recipe.overrides.giris === "yok" && J(b.warnings) === J(["ek"]);
})());
var rAl2 = ortam();
rAl2.api.efektAnimSeciminiDoldur();
rAl2.dom["cap-efekt-vurgu2"].removeAttribute("data-oto");
rAl2.api.stilKoduUygula(SS.encode({ styleId: "efekt", overrides: AE.overrides(AE.gorunum("vurucu").ayar) }));
ok("parti 5: renksiz (eski) kod renkleri türetilmişe döndürür", rAl2.api.stil().vurguRenk2 === null);
// rehber yedeği
var yd = rr.api.stilYedegi();
rr.api.gorunumUygula("temiz");
rr.api.stilYedeginiYukle(yd);
ok("parti 5: rehber yedeği renkleri ve türetilir işaretini geri yükler", rr.api.stil().vurguKutuRenk === "#1b1f2a" && rr.dom["cap-efekt-vurgu-kutusu"].getAttribute("data-oto") === null &&
  J(yd.oto) === J({ "cap-efekt-vurgu-kutusu": false, "cap-efekt-vurgu2": false }));
// Marka Kiti taşımaz
ok("parti 5: Marka Kiti renk alanlarını taşımaz (kit şeması değişmedi)", !("vurguRenk2" in MK.normalize({ on: true, stil: { overrides: { vurguRenk2: "#123456" } } }).kit.stil.overrides));
var rs = ortam({ renksiz: true });
rs.api.efektAnimSeciminiDoldur();
rs.api.gorunumUygula("temiz");
ok("parti 5: seçiciler yoksa (eski index.html) renkler null, hata yok", rs.api.stil().vurguKutuRenk === null && rs.api.stil().vurguRenk2 === null);
ok("index.html: renk seçicileri Özelleştir'in renk alanında, gizli başlar, data-oto", /id="cap-efekt-anim-renkler" hidden>/.test(html) &&
  /id="cap-efekt-vurgu-kutusu-sar"[^>]*hidden>\s*<input type="color" id="cap-efekt-vurgu-kutusu" value="#ffd23f" data-oto="1">/.test(html) &&
  /id="cap-efekt-vurgu2-sar"[^>]*hidden>\s*<input type="color" id="cap-efekt-vurgu2" value="#3f6cff" data-oto="1">/.test(html) &&
  html.indexOf('id="cap-efekt-vurgu-kutusu"') > html.indexOf('id="cap-ozellestir"') && html.indexOf('id="cap-efekt-vurgu-kutusu"') < html.indexOf('id="cap-font"'));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
