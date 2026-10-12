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
    "cap-guvenli-yerlesim-sar": dugum("label"), "cap-marka-kiti-cip": dugum("span"), "cap-stil-yazar": dugum("input", { value: "" })
  };
  var K = { settings: function () { return ayar; }, saveSettings: function () { kayit++; }, log: function () {} };
  var window = { SufloStyleEngine: SE, SufloStyleShare: SS, SufloMarkaKiti: MK, SufloAltyaziEfekt: AE, KApp: { ctx: function () { return o.ctx || {}; } } };
  var kod = [
    govde("function motorPreset("), govde("function motorStiliMi("), govde("function uzunlukSecimi("), govde("function applyPreset("),
    govde("function stilKartiIsaretle("), govde("function efektStili("), govde("function efektAyari("), govde("function efekteGec("),
    govde("function efektSonrasi("), govde("function gorunumUygula("), govde("function gorunumleriCiz("), govde("function efektKelimeSayisi("),
    govde("function stil()"), govde("function motorAyarlari("), govde("function savePrefs("), govde("function loadPrefs("), govde("function stiliYaz("),
    govde("function markaKiti("), govde("function dikeySekans("), govde("function inceAyarDurumu("), govde("function stilKredisi("),
    govde("function stilKodu("), govde("function stilKoduUygula("), govde("function varsayilanaDon(")
  ].join("\n");
  var api = new Function("K", "window", "document", "el", "KApp", "Pro",
    "var SS = window.SufloStyleShare, AE = window.SufloAltyaziEfekt, EFEKT = 'efekt';\n" +
    "var secilenMogrt = null, secilenMotorStili = '', secilenGorunum = '', sonGorunum = '', bekleyenMogrtYolu = '', stilKrediAd = '';\n" +
    "var FONTLAR = SS.fontFiles();\n" +
    "var PRESETS = {}; window.SufloStyleEngine.list().forEach(function (p) { PRESETS[p.id] = motorPreset(p.id); });\n" +
    "var onizleme = { durdur: 0, ciz: 0, tazele: [], oynat: 0 };\n" +
    "function onizlemeDurdur() { onizleme.durdur++; } function onizlemeCiz() { onizleme.ciz++; } function onizlemeOynat() { onizleme.oynat++; }\n" +
    "function efektOnizlemeTazele(h) { onizleme.tazele.push(!!h); }\n" +
    "function vurguKutusuDurumu() {} function kelimeSiniriDurumu() {} function motorSecenekDurumu() {} function uygulamaIpucunuGuncelle() {}\n" +
    "function arayuzDili() { return 'tr'; } function kelimeSiniri() { return 0; }\n" + kod +
    "\nreturn { gorunumleriCiz: gorunumleriCiz, gorunumUygula: gorunumUygula, stil: stil, motorAyarlari: motorAyarlari, loadPrefs: loadPrefs, savePrefs: savePrefs," +
    " stilKodu: stilKodu, stilKoduUygula: stilKoduUygula, applyPreset: applyPreset, efekteGec: efekteGec, varsayilanaDon: varsayilanaDon, onizleme: onizleme," +
    " durum: function () { return { motor: secilenMotorStili, gorunum: secilenGorunum, son: sonGorunum, mogrt: secilenMogrt, kredi: stilKrediAd }; }," +
    " mogrtSec: function (m) { secilenMogrt = m; secilenMotorStili = ''; } };")(
    K, window, { createElement: function (t) { return dugum(t); }, querySelectorAll: function () { return []; } },
    function (id) { return dom[id] || null; }, { toast: function (m, tur) { toastlar.push(m); } }, {});
  return { api: api, dom: dom, ayar: ayar, toastlar: toastlar, kayit: function () { return kayit; } };
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
  /^Dialogue: 0,/m.test(r2.ass) && !/\\N/.test(r2.ass));
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
ok("önizleme: efekt gerçek motor çıktısıyla (libass), ffmpeg yoksa DOM yedeği", /premium\|efekt\)\$\/\.test\(st\.aile\)/.test(oo) &&
  /motorOnizlemeOynat\(\)\.then/.test(govde("function efektOnizlemeTazele(")) && /onizlemeOynatDom\(\)/.test(govde("function efektOnizlemeTazele(")));
ok("önizleme tazeleme yalnız etkileşimde (açılışta çağrılmaz)", govde("function init(").indexOf("efektOnizlemeTazele(true)") === -1 &&
  govde("function loadPrefs(").indexOf("efektOnizlemeTazele") === -1);

console.log("\n" + gecen + "/" + toplam + " geçti");
process.exit(gecen === toplam ? 0 : 1);
