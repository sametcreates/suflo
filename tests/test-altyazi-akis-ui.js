// Suflo testi: üç adımlı akışın DOM bağlayıcısı (js/altyazi-akis.js) — captions.js ve ae-panel.js'in GERÇEK
// işlevleriyle (imzayla kesilip sahte DOM'da çalışır):
//  - tek "Timeline'a uygula" düğmesi Premiere'de #cap-apply-style / #cap-apply'nin kendi tıklamasına gider: Pro kapısı
//    aynı çağrı (Pro.gate("overlay", { deneme: true, yeniden }) / Pro.gate("mogrt")), düz yol kapısız
//  - iki tıklamalı onaylar ("Yine de yeni iz ekle", kritik sorun onayı) tek düğme üzerinden çalışır, etiket yansır
//  - After Effects'te aynı denetim #ae-ekle-stil / #ae-ekle'ye gider (stilli: Pro.gate("overlay", { yeniden }), denemesiz)
//  - rehberin "Stilleri gör"ü 2. adıma kaydırır; rehberin uygula vurgusu tek düğmeye
//  - adım çubuğu, boş durum, tür varsayılanı ve hatırlanması, katlanır bölümlerin hafızası, MOGRT bölümünün açılması,
//    ilk transkriptten sonra bir kez 2. adıma kaydırma (kullanıcı kaydırdıysa yok), hareket azaltma
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var A = require(path.join(KOK, "js", "altyazi-akis.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
function bekle() { return new Promise(function (r) { setImmediate(r); }); }
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
var onb = fs.readFileSync(path.join(KOK, "js", "onboarding.js"), "utf8").replace(/\r\n/g, "\n");
function govde(kaynak, imza) {
  var i = kaynak.indexOf(imza);
  if (i < 0) throw new Error("yok: " + imza);
  return kaynak.slice(i, kaynak.indexOf("\n  }\n", i) + 4);
}

/* ---------------- sahte DOM ---------------- */
function dugum(id, ek) {
  var d = { id: id, hidden: false, disabled: false, open: false, textContent: "", className: "", attrs: {}, dinle: {}, kaydirma: [], odak: 0 };
  d.setAttribute = function (k, v) { d.attrs[k] = String(v); };
  d.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(d.attrs, k) ? d.attrs[k] : null; };
  d.removeAttribute = function (k) { delete d.attrs[k]; };
  d.addEventListener = function (t, f) { (d.dinle[t] = d.dinle[t] || []).push(f); };
  d.yay = function (t, e) { (d.dinle[t] || []).slice().forEach(function (f) { f(e || { type: t, target: d }); }); };
  // tarayıcıdaki gibi: kapalı (disabled) düğmenin click()'i hiçbir şey yapmaz
  d.click = function () { if (!d.disabled) d.yay("click"); };
  d.scrollIntoView = function (o) { d.kaydirma.push(o); };
  d.focus = function () { d.odak++; };
  d.classList = {
    contains: function (c) { return (" " + d.className + " ").indexOf(" " + c + " ") !== -1; },
    add: function (c) { if (!d.classList.contains(c)) d.className = (d.className + " " + c).trim(); },
    remove: function (c) { d.className = (" " + d.className + " ").replace(" " + c + " ", " ").trim(); },
    toggle: function (c, v) { if (v === undefined) v = !d.classList.contains(c); if (v) d.classList.add(c); else d.classList.remove(c); return v; }
  };
  for (var k in ek || {}) d[k] = ek[k];
  return d;
}
var IDLER = ["cap-adimlar-olustur", "cap-adimlar-stil", "cap-adimlar-uygula", "cap-adimlar-olustur-durum", "cap-adimlar-stil-durum", "cap-adimlar-uygula-durum",
  "cap-adim-olustur", "cap-adim-stil", "cap-adim-uygula", "cap-adim-olustur-baslik", "cap-adim-stil-baslik", "cap-adim-uygula-baslik",
  "cap-uygula-bos", "cap-uygula-govde", "cap-uygula-ek", "cap-uygula-tur", "cap-uygula-tur-stil", "cap-uygula-tur-duz",
  "cap-uygula-tek", "cap-uygula-tek-metin", "cap-uygula-tek-alt", "cap-gelismis", "cap-ozellestir", "cap-diger-araclar", "cap-mogrt-sar",
  "cap-result", "cap-apply", "cap-apply-style", "cap-apply-hint", "ae-ekle", "ae-ekle-stil", "ae-kaldir"];
function belgeKur(o) {
  o = o || {};
  var dom = {};
  IDLER.forEach(function (id) { dom[id] = dugum(id); });
  dom["cap-uygula-govde"].hidden = true; dom["cap-uygula-ek"].hidden = true; dom["cap-uygula-tek"].disabled = true; dom["cap-result"].hidden = true;
  dom["cap-apply"].textContent = "Normal altyazı izi ekle";
  dom["cap-apply-style"].textContent = "Görünüm seçerek ekle"; dom["cap-apply-style"].disabled = true;
  dom["ae-ekle"].textContent = "Metin katmanı olarak ekle"; dom["ae-ekle-stil"].textContent = "Altyazı Efektleriyle ekle";
  var gozcular = [];
  var belge = dugum("#belge", {
    getElementById: function (id) { return dom[id] || null; },
    body: dugum("body", { className: o.ae ? "host-ae" : "" }),
    defaultView: o.mo === false ? {} : {
      MutationObserver: function (f) { var g = { f: f, hedef: [] }; g.observe = function (n) { g.hedef.push(n.id); }; gozcular.push(g); return g; },
      matchMedia: function (q) { return { matches: !!o.hareketAzalt && /reduce/.test(q) }; }
    }
  });
  return { dom: dom, belge: belge, gozcular: gozcular, mutasyon: function () { gozcular.forEach(function (g) { g.f([]); }); } };
}
function sahteDepo(ilk) {
  var v = {}; for (var k in ilk || {}) v[k] = ilk[k];
  return { v: v, getItem: function (k) { return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : null; }, setItem: function (k, x) { v[k] = String(x); } };
}

/*
 * captions.js'in gerçek uygulama yolu: apply, overlayUygula (yalnız Pro kapısına kadar çalışır), uygulaEtiketiniSifirla,
 * uygulamaIpucunuGuncelle (artık akışın guncelle'sini de çağırır) ve init'teki iki tıklama bağlantısı aynen.
 */
function capOrtam(b, o) {
  o = o || {};
  var kayit = { gate: [], toast: [], buildSrt: 0, mogrtUygula: 0 };
  var hal = { segments: o.segments === undefined ? [{ start: 0, end: 1, text: "Merhaba" }] : o.segments, motor: o.motor === undefined ? "efekt" : o.motor, mogrt: o.mogrt || null, kritik: o.kritik || 0 };
  var bagla = cap.match(/    el\("cap-apply"\)\.addEventListener\("click", function \(\) \{ apply\(false\); \}\);\n    el\("cap-apply-style"\)\.addEventListener\("click", function \(\) \{ apply\(true\); \}\);\n/)[0];
  var Pro = { gate: function (ad, sec) { kayit.gate.push([ad, sec]); return !!o.proAcik; }, isPro: function () { return !!o.proAcik; } };
  var api = new Function("el", "KApp", "Pro", "window", "hal", "kayit", "K",
    "var segments = hal.segments, ornekBelge = false, ornekSekansId = '', belgeKesimAdi = null, belgeSekansId = '';\n" +
    "var secilenMogrt = hal.mogrt, secilenMotorStili = hal.motor;\n" +
    "function qualityReport() { return { bad: hal.kritik }; }\n" +
    "function status() {} function buildSrt() { kayit.buildSrt++; return ''; } function ciftDilAcik() { return false; }\n" +
    "function yerelCiktiEtkin() { return false; } function yerelCiktiSecili() { return false; }\n" +
    "function mogrtStiliniUygula() { kayit.mogrtUygula++; return Promise.resolve(); }\n" +
    "function emojiIceriyorMu() { return false; }\n" +
    cap.slice(cap.indexOf("  var uygulananSekans = {};"), cap.indexOf("  function uygulaEtiketiniSifirla(")) +
    govde(cap, "function uygulaEtiketiniSifirla(") + govde(cap, "function uygulamaIpucunuGuncelle(") + govde(cap, "function temizMogrtAdi(") +
    govde(cap, "async function overlayUygula(") + govde(cap, "async function apply(") + bagla +
    "return { apply: apply, uygulaEtiketiniSifirla: uygulaEtiketiniSifirla, uygulamaIpucunuGuncelle: uygulamaIpucunuGuncelle," +
    " sekansaUygulandi: function (s) { uygulananSekans[s] = Date.now(); }, onay: function () { return [onayBekleyen, kaliteOnayBekleyen]; } };")(
    function (id) { return b.dom[id] || null; },
    { ctx: function () { return { sequenceId: "s1", sequence: "Sekans 1" }; }, toast: function (m) { kayit.toast.push(m); } },
    Pro, { SufloStyleEngine: { preset: function () { return { name: "Vurucu" }; } } }, hal, kayit, {});
  return { api: api, kayit: kayit, hal: hal };
}
function akisBagla(b, hal, depo, ek) {
  var o = { belge: b.belge, depo: depo || sahteDepo(), durum: function () {
    return { altyaziVar: hal.segments.length > 0, uretiliyor: !!hal.busy, stilSecili: !!hal.motor && !hal.mogrt, mogrtSecili: !!hal.mogrt };
  } };
  for (var k in ek || {}) o[k] = ek[k];
  return A.bagla(o);
}

(async function () {
  /* ---------------- 1) Premiere: stilli yol, Pro kapısı aynı ---------------- */
  // a) özgün düğmeye doğrudan tıklama (bugünkü davranış)
  var b0 = belgeKur(), c0 = capOrtam(b0);
  c0.api.uygulamaIpucunuGuncelle();
  b0.dom["cap-apply-style"].click();
  await bekle();
  // b) tek düğme üzerinden
  var b1 = belgeKur(), c1 = capOrtam(b1);
  var ak1 = akisBagla(b1, c1.hal);
  c1.api.uygulamaIpucunuGuncelle();
  ok("transkript + efekt seçili: tür varsayılanı stilli, tek düğme açık, etiket özgün düğmeden",
    ak1.tur() === "stil" && b1.dom["cap-uygula-tek"].disabled === false && b1.dom["cap-uygula-tek-metin"].textContent === "Timeline'a uygula" &&
    b1.dom["cap-uygula-tek-alt"].textContent === "Vurucu ile ekle" && b1.dom["cap-uygula-tur-stil"].attrs["aria-checked"] === "true" &&
    b1.dom["cap-uygula-govde"].hidden === false && b1.dom["cap-uygula-ek"].hidden === false && b1.dom["cap-uygula-bos"].hidden === true,
    [ak1.tur(), b1.dom["cap-uygula-tek-alt"].textContent].join("|"));
  b1.dom["cap-uygula-tek"].click();
  await bekle();
  var g0 = c0.kayit.gate, g1 = c1.kayit.gate;
  ok("stilli: tek düğme özgün düğmeyle AYNI Pro kapısını çağırır: Pro.gate(\"overlay\", { deneme: true, yeniden })",
    g1.length === 1 && g0.length === 1 && g1[0][0] === "overlay" && g0[0][0] === "overlay" && g1[0][1].deneme === true && typeof g1[0][1].yeniden === "function" &&
    J(Object.keys(g1[0][1]).sort()) === J(["deneme", "yeniden"]) && J(Object.keys(g0[0][1]).sort()) === J(Object.keys(g1[0][1]).sort()),
    J(g1.map(function (g) { return [g[0], Object.keys(g[1] || {})]; })));
  ok("captions.js'teki kapı satırı değişmedi",
    cap.indexOf('if (typeof Pro !== "undefined" && !Pro.gate("overlay", { deneme: true, yeniden: function () { overlayUygula().then(uygulaEtiketiniSifirla); } })) return;') !== -1 &&
    cap.indexOf('if (typeof Pro !== "undefined" && !Pro.gate("mogrt")) return { stil: true };') !== -1);

  // MOGRT seçili: Pro.gate("mogrt") — deneme yok
  var bm = belgeKur(), cm = capOrtam(bm, { motor: "", mogrt: { display: "Pop Subtitles", path: "/x.mogrt" } });
  akisBagla(bm, cm.hal);
  cm.api.uygulamaIpucunuGuncelle();
  bm.dom["cap-uygula-tek"].click();
  await bekle();
  ok("MOGRT seçili: tek düğme stilli yoldan Pro.gate(\"mogrt\") (deneme yok) çağırır, şablon bölümü kendiliğinden açıldı",
    J(cm.kayit.gate.map(function (g) { return [g[0], g[1]]; })) === J([["mogrt", undefined]]) && cm.kayit.mogrtUygula === 0 && bm.dom["cap-mogrt-sar"].open === true,
    J(cm.kayit.gate));

  /* ---------------- 2) düz yol ve iki tıklamalı onay ---------------- */
  var b2 = belgeKur(), c2 = capOrtam(b2), dep2 = sahteDepo();
  var ak2 = akisBagla(b2, c2.hal, dep2);
  c2.api.uygulamaIpucunuGuncelle();
  b2.dom["cap-uygula-tur-duz"].click();
  ok("tür 'Düz' seçilir ve hatırlanır (tarayıcı deposu)", ak2.tur() === "duz" && dep2.v["suflo.akis.tur"] === "duz" &&
    b2.dom["cap-uygula-tur-duz"].classList.contains("on") && b2.dom["cap-uygula-tek-alt"].textContent === "Normal altyazı izi ekle");
  c2.api.sekansaUygulandi("s1");   // bu sekansa daha önce uygulandı
  b2.dom["cap-uygula-tek"].click();
  ok("1. tıklama: özgün düğme 'Yine de yeni iz ekle' onayına geçer, tek düğme aynı metni ve uyarıyı gösterir (gözcü yokken de)",
    b2.dom["cap-apply"].textContent === "Yine de yeni iz ekle" && b2.dom["cap-apply"].classList.contains("warn") &&
    b2.dom["cap-uygula-tek-metin"].textContent === "Yine de yeni iz ekle" && b2.dom["cap-uygula-tek"].classList.contains("warn") &&
    b2.dom["cap-uygula-tek-alt"].textContent === "" && c2.kayit.buildSrt === 0 && c2.kayit.gate.length === 0,
    b2.dom["cap-uygula-tek-metin"].textContent);
  b2.dom["cap-uygula-tek"].click();
  await bekle();
  ok("2. tıklama onayı geçer (SRT yazımına varır), düz yol Pro kapısına hiç uğramaz",
    c2.kayit.buildSrt === 1 && c2.kayit.gate.length === 0, J(c2.kayit));
  c2.api.uygulaEtiketiniSifirla();
  ok("etiket sıfırlanınca tek düğme de normale döner", b2.dom["cap-uygula-tek-metin"].textContent === "Timeline'a uygula" &&
    !b2.dom["cap-uygula-tek"].classList.contains("warn") && b2.dom["cap-uygula-tek-alt"].textContent === "Normal altyazı izi ekle");

  // kritik sorun onayı, stilli yoldan
  var b3 = belgeKur(), c3 = capOrtam(b3, { kritik: 2 });
  akisBagla(b3, c3.hal);
  c3.api.uygulamaIpucunuGuncelle();
  b3.dom["cap-uygula-tek"].click();
  ok("kritik sorun: 1. tıklama uyarır (kapı yok), tek düğme '2 kritik sorunla yine de uygula'",
    c3.kayit.gate.length === 0 && b3.dom["cap-uygula-tek-metin"].textContent === "2 kritik sorunla yine de uygula" && b3.dom["cap-uygula-tek"].classList.contains("warn"),
    b3.dom["cap-uygula-tek-metin"].textContent);
  b3.dom["cap-uygula-tek"].click();
  await bekle();
  ok("kritik sorun: 2. tıklama onaylar ve aynı Pro kapısına varır", c3.kayit.gate.length === 1 && c3.kayit.gate[0][0] === "overlay" && c3.kayit.gate[0][1].deneme === true);

  // MutationObserver yolu: özgün düğmenin metni dışarıdan (ör. çeviri katmanı) değişince yansır
  var b4 = belgeKur(), c4 = capOrtam(b4);
  akisBagla(b4, c4.hal);
  c4.api.uygulamaIpucunuGuncelle();
  ok("gözcü özgün dört düğmeyi ve #cap-result'ı izler",
    J(b4.gozcular[0].hedef) === J(["cap-apply", "cap-apply-style", "ae-ekle", "ae-ekle-stil"]) && J(b4.gozcular[1].hedef) === J(["cap-result"]));
  b4.dom["cap-apply-style"].textContent = "Add with Vurucu"; b4.dom["cap-apply-style"].disabled = true;
  b4.mutasyon();
  ok("gözcü: özgün düğmenin metni ve disabled hâli tek düğmeye yansır",
    b4.dom["cap-uygula-tek-alt"].textContent === "Add with Vurucu" && b4.dom["cap-uygula-tek"].disabled === true);

  /* ---------------- 3) boş durum, adım çubuğu, üretim ---------------- */
  var b5 = belgeKur(), c5 = capOrtam(b5, { segments: [] }), dep5 = sahteDepo();
  var ak5 = akisBagla(b5, c5.hal, dep5);
  ok("transkript yok: 3. adım kapalı, ipucu görünür, tür ve ek satırlar gizli; çubuk 1 şu an / 2 hazır ✓ / 3 bekliyor",
    b5.dom["cap-uygula-tek"].disabled === true && b5.dom["cap-uygula-bos"].hidden === false && b5.dom["cap-uygula-govde"].hidden === true &&
    b5.dom["cap-uygula-ek"].hidden === true && b5.dom["cap-adimlar-olustur-durum"].textContent === "şu an" &&
    b5.dom["cap-adimlar-stil-durum"].textContent === "hazır ✓" && b5.dom["cap-adimlar-uygula-durum"].textContent === "bekliyor" &&
    b5.dom["cap-adimlar-olustur"].attrs["aria-current"] === "step" && b5.dom["cap-adim-uygula"].attrs["data-durum"] === "bekliyor");
  b5.dom["cap-apply"].disabled = false;
  b5.dom["cap-uygula-tek"].disabled = false;   // biri zorla açsa bile transkriptsiz tıklama özgün düğmeye gitmez
  var tik5 = 0; b5.dom["cap-apply"].addEventListener("click", function () { tik5++; });
  b5.dom["cap-uygula-tek"].click();
  ok("transkriptsiz tek düğme hiçbir yolu çağırmaz", tik5 === 0);
  // üretim başlar: kullanıcı kaydırmaz; biter; ilk sonuç → 2. adıma bir kez kaydır
  c5.hal.busy = true; A.guncelle({ uretiliyor: true });
  ok("üretim sürerken 1 şu an, tek düğme kapalı", b5.dom["cap-adimlar-olustur-durum"].textContent === "şu an" && b5.dom["cap-uygula-tek"].disabled === true);
  c5.hal.segments.push({ start: 0, end: 1, text: "Selam" });
  c5.hal.busy = false; A.guncelle({ uretiliyor: false });
  A.sonucGeldi({ kaynak: "go" });
  ok("ilk transkript: 2. adıma yumuşak kaydırma (bir kez), başlık odak alır, hatırlanır",
    b5.dom["cap-adim-stil"].kaydirma.length === 1 && b5.dom["cap-adim-stil"].kaydirma[0].behavior === "smooth" && b5.dom["cap-adim-stil-baslik"].odak === 1 &&
    dep5.v["suflo.akis.ilkKaydirma"] === "1", J(b5.dom["cap-adim-stil"].kaydirma));
  A.sonucGeldi({ kaynak: "go" });
  ok("ikinci transkriptte kaydırma yok", b5.dom["cap-adim-stil"].kaydirma.length === 1);
  ok("transkript geldi: 1 hazır ✓, 3 şu an", b5.dom["cap-adimlar-olustur-durum"].textContent === "hazır ✓" && b5.dom["cap-adimlar-uygula-durum"].textContent === "şu an");
  A.guncelle({ uygulandi: true });
  ok("başarılı uygulamadan sonra 3 hazır ✓ (çubukta 'şu an' kalmaz)", b5.dom["cap-adimlar-uygula-durum"].textContent === "hazır ✓" &&
    !b5.dom["cap-adimlar-uygula"].attrs["aria-current"]);
  A.guncelle({ uretiliyor: true });
  ok("yeni üretim başlayınca 3 yeniden bekliyor", b5.dom["cap-adimlar-uygula-durum"].textContent === "bekliyor");

  // kullanıcı üretim sırasında kaydırdı → kaydırma yok; örnek / ornekYukle kaynağı → kaydırma yok
  var b6 = belgeKur(), c6 = capOrtam(b6, { segments: [] });
  akisBagla(b6, c6.hal, sahteDepo());
  A.guncelle({ uretiliyor: true });
  b6.belge.yay("wheel", { type: "wheel" });
  A.guncelle({ uretiliyor: false });
  ok("kullanıcı üretimde kaydırdıysa 2. adıma atlanmaz", A.sonucGeldi({ kaynak: "go" }) === false && b6.dom["cap-adim-stil"].kaydirma.length === 0);
  var b7 = belgeKur(), c7 = capOrtam(b7, { segments: [] });
  akisBagla(b7, c7.hal, sahteDepo());
  A.guncelle({ uretiliyor: true }); b7.belge.yay("keydown", { type: "keydown", key: "a" }); A.guncelle({ uretiliyor: false });
  ok("yazı tuşu kaydırma sayılmaz; rehber örneği (ornek / ornekYukle) kaydırmaz, gerçek iş kaydırır",
    A.sonucGeldi({ kaynak: "ornek" }) === false && A.sonucGeldi({ kaynak: "ornekYukle" }) === false && A.sonucGeldi({ kaynak: "go" }) === true);
  var b8 = belgeKur({ hareketAzalt: true }), c8 = capOrtam(b8, { segments: [] });
  akisBagla(b8, c8.hal, sahteDepo());
  A.adimaGit("uygula");
  ok("hareket azaltma: kaydırma anında (behavior auto)", b8.dom["cap-adim-uygula"].kaydirma[0].behavior === "auto");
  b8.dom["cap-adimlar-stil"].click();
  ok("adım çubuğu tıklaması bölüme kaydırır ve başlığa odaklanır", b8.dom["cap-adim-stil"].kaydirma.length === 1 && b8.dom["cap-adim-stil-baslik"].odak === 1);

  // üretim durumu yalnız setBusy'nin bildiriminden: durum() vermese de ara güncellemelerde korunur
  var b8b = belgeKur(), c8b = capOrtam(b8b);
  A.bagla({ belge: b8b.belge, depo: sahteDepo(), durum: function () { return { altyaziVar: true, stilSecili: true }; } });
  c8b.api.uygulamaIpucunuGuncelle();   // özgün stilli düğme açılır
  A.guncelle({ uretiliyor: true });
  A.guncelle();   // ör. iş sürerken stil değişti (uygulamaIpucunuGuncelle)
  var uretimde = b8b.dom["cap-uygula-tek"].disabled === true && b8b.dom["cap-adimlar-olustur-durum"].textContent === "şu an";
  A.guncelle({ uretiliyor: false });
  ok("üretim setBusy'den gelir: ara güncellemede sürer, bitince tek düğme açılır", uretimde && b8b.dom["cap-uygula-tek"].disabled === false &&
    b8b.dom["cap-adimlar-olustur-durum"].textContent === "hazır ✓");

  /* ---------------- 4) katlanır bölümlerin hafızası ---------------- */
  var dep9 = sahteDepo({ "suflo.akis.acik": J({ "cap-ozellestir": true, "cap-diger-araclar": false, "cap-gelismis": true }) });
  var b9 = belgeKur(), c9 = capOrtam(b9, { segments: [] });
  akisBagla(b9, c9.hal, dep9);
  ok("hatırlanan açık bölüm açılır; Gelişmiş ayarlar kayıtta açık görünse bile açılmaz",
    b9.dom["cap-ozellestir"].open === true && b9.dom["cap-diger-araclar"].open === false && b9.dom["cap-gelismis"].open === false);
  b9.dom["cap-diger-araclar"].open = true; b9.dom["cap-diger-araclar"].yay("toggle");
  b9.dom["cap-ozellestir"].open = false; b9.dom["cap-ozellestir"].yay("toggle");
  var kay9 = JSON.parse(dep9.v["suflo.akis.acik"]);
  ok("aç / kapa kaydedilir", kay9["cap-diger-araclar"] === true && kay9["cap-ozellestir"] === false);
  ok("Gelişmiş ayarlara dinleyici bağlanmaz (hiç hatırlanmaz)", !b9.dom["cap-gelismis"].dinle.toggle);
  var bozuk = { getItem: function () { throw new Error("SecurityError"); }, setItem: function () { throw new Error("QuotaExceeded"); } };
  var b10 = belgeKur(), c10 = capOrtam(b10);
  var ak10 = akisBagla(b10, c10.hal, bozuk);
  b10.dom["cap-uygula-tur-duz"].click();
  b10.dom["cap-ozellestir"].open = true; b10.dom["cap-ozellestir"].yay("toggle");
  ok("depo fırlatsa da akış çalışır ve seçim oturumda geçerli kalır (gizli pencere)", ak10.tur() === "duz" && b10.dom["cap-uygula-tek"].disabled === false);
  var b11 = belgeKur(), c11 = capOrtam(b11);
  var ak11 = akisBagla(b11, c11.hal, function () { throw new Error("erişim yok"); });
  ok("depo erişimcisi fırlatsa da akış çalışır", ak11.tur() === "stil");
  var b12 = belgeKur(), c12 = capOrtam(b12, { motor: "" });
  var ak12 = akisBagla(b12, c12.hal, sahteDepo({ "suflo.akis.tur": "stil" }));
  c12.api.uygulamaIpucunuGuncelle();
  ok("stil yokken stilli seçenek kapalı ve ipuçlu, tür düz", ak12.tur() === "duz" && b12.dom["cap-uygula-tur-stil"].disabled === true &&
    b12.dom["cap-uygula-tur-stil"].attrs.title === "Önce 2. adımda bir stil seç" && b12.dom["cap-uygula-tek-alt"].textContent === "Normal altyazı izi ekle");

  // MOGRT bölümü: oturumda bir kez açılır, kullanıcı kapatırsa yeniden açılmaz
  var b13 = belgeKur(), c13 = capOrtam(b13, { motor: "", mogrt: { display: "X" } });
  akisBagla(b13, c13.hal);
  b13.dom["cap-mogrt-sar"].open = false;
  A.guncelle();
  ok("MOGRT seçiliyken açılan şablon bölümünü kullanıcı kapatırsa kapalı kalır", b13.dom["cap-mogrt-sar"].open === false);

  /* ---------------- 5) After Effects ---------------- */
  var aeKayit = { gate: [], toast: [] };
  var kapsam = {
    K: { hostKodu: function () { return "AEFT"; }, log: function () {} },
    Pro: { gate: function (ad, sec) { aeKayit.gate.push([ad, sec]); return false; } },
    KCaptions: { hasSegments: function () { return true; } },
    KApp: { toast: function (m) { aeKayit.toast.push(m); } },
    console: console, Promise: Promise
  };
  kapsam.window = kapsam;
  var bae = belgeKur({ ae: true });
  kapsam.document = { getElementById: bae.belge.getElementById, body: bae.belge.body, querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
  vm.runInNewContext(fs.readFileSync(path.join(KOK, "js", "ae-panel.js"), "utf8"), kapsam);
  // init'in bağladığı iki düğme (AE'de host yüklemesi denenir; burada CEP yok)
  kapsam.K.extensionPath = function () { return ""; };
  kapsam.SufloAePanel.init();
  var cae = capOrtam(bae);
  var akae = akisBagla(bae, cae.hal);
  ok("AE: tür stilli, tek düğmenin alt etiketi AE düğmesinden", akae.tur() === "stil" && bae.dom["cap-uygula-tek-alt"].textContent === "Altyazı Efektleriyle ekle");
  bae.dom["cap-uygula-tek"].click();
  await bekle();
  ok("AE stilli: tek düğme #ae-ekle-stil'e gider: Pro.gate(\"overlay\", { yeniden }) — deneme hakkı YOK, Premiere yolu çağrılmaz",
    aeKayit.gate.length === 1 && aeKayit.gate[0][0] === "overlay" && J(Object.keys(aeKayit.gate[0][1])) === J(["yeniden"]) && cae.kayit.gate.length === 0,
    J(aeKayit.gate.map(function (g) { return [g[0], Object.keys(g[1])]; })));
  var aeDuz = 0; bae.dom["ae-ekle"].addEventListener("click", function () { aeDuz++; });
  var capDuz = 0; bae.dom["cap-apply"].addEventListener("click", function () { capDuz++; });
  bae.dom["cap-uygula-tur-duz"].click();
  bae.dom["cap-uygula-tek"].click();
  await bekle();
  ok("AE düz: tek düğme #ae-ekle'ye gider (kapısız), Premiere'in #cap-apply'si çağrılmaz",
    aeDuz === 1 && capDuz === 0 && aeKayit.gate.length === 1 && bae.dom["cap-uygula-tek-alt"].textContent === "Metin katmanı olarak ekle");
  var bae2 = belgeKur({ ae: true }), cae2 = capOrtam(bae2, { motor: "", mogrt: { display: "X" } });
  var akae2 = akisBagla(bae2, cae2.hal);
  ok("AE: MOGRT stil sayılmaz (tür düz, şablon bölümü açılmaz)", akae2.tur() === "duz" && bae2.dom["cap-mogrt-sar"].open === false);
  ok("ae-panel.js'teki kapı satırı değişmedi (denemesiz)",
    fs.readFileSync(path.join(KOK, "js", "ae-panel.js"), "utf8").indexOf('if (stilli && P && !P.gate("overlay", { yeniden: function () { ekle(true); } })) return;') !== -1);

  /* ---------------- 6) rehber ---------------- */
  // "Stilleri gör" → KCaptions.stilDene (gerçek işlev) → 2. adım
  var dom14 = { "cap-adim-stil": dugum("cap-adim-stil"), "cap-efekt": dugum("cap-efekt"), "cap-stil-grid": dugum("cap-stil-grid") };
  var dene = new Function("el", "AE", "K", "gorunumUygula",
    "var PRESETS = {}; function applyPreset() {} function motorStiliMi() { return false; } function stil() { return {}; } var onizlemeSaat = null;\n" +
    govde(cap, "function stilDene(") + "\nreturn stilDene;")(
    function (id) { return dom14[id] || null; }, { gorunum: function () { return true; }, eskiGorunum: function () { return null; } },
    { findFfmpeg: function () { return Promise.resolve(null); } }, function () {});
  ok("rehber 'Stilleri gör': stilDene 2. adımı (#cap-adim-stil) görünüme kaydırır",
    dene("vurucu") === true && dom14["cap-adim-stil"].kaydirma.length === 1 && dom14["cap-adim-stil"].kaydirma[0].block === "start" &&
    dom14["cap-efekt"].kaydirma.length === 0);
  ok("rehber düğmesi hâlâ stilGoster'a bağlı, stilGoster Altyazı sekmesini açıp stilDene'yi çağırır",
    /tikla\("ia-stil-goster", stilGoster\);/.test(onb) && /KApp\.goster\("captions"\);[\s\S]{0,80}KCaptions\.stilDene\(STIL_ORNEGI\)/.test(govde(onb, "function stilGoster(")));
  // örnek altyazı hazır → tek düğme vurgulanır, tür bu oturumluk "Düz" (kaydedilmez)
  var dep15 = sahteDepo(), b15 = belgeKur(), c15 = capOrtam(b15);
  var ak15 = akisBagla(b15, c15.hal, dep15);
  var vurgu = new Function("el", "kaydir", "window", "SufloAltyaziAkis", "setTimeout",
    govde(onb, "function sekansaUygulaVurgula(") + "\nreturn sekansaUygulaVurgula;")(
    function (id) { return b15.dom[id] || null; }, function (n) { n.scrollIntoView({}); }, { SufloAltyaziAkis: A }, A, function () {});
  vurgu();
  ok("rehberin uygula vurgusu: tek düğme (ve özgün #cap-apply) vurgulanır, kaydırılır; tür geçici 'Düz', kayda yazılmaz",
    b15.dom["cap-uygula-tek"].classList.contains("onb-vurgu") && b15.dom["cap-apply"].classList.contains("onb-vurgu") && b15.dom["cap-uygula-tek"].kaydirma.length === 1 &&
    ak15.tur() === "duz" && dep15.v["suflo.akis.tur"] === undefined && b15.dom["cap-uygula-tek-alt"].textContent === "Normal altyazı izi ekle");
  b15.dom["cap-uygula-tur-stil"].click();
  ok("kullanıcı türü seçince geçici öneri biter ve seçimi kaydedilir", ak15.tur() === "stil" && dep15.v["suflo.akis.tur"] === "stil");

  /* ---------------- 7) captions.js bağlantı noktaları ---------------- */
  ok("captions.js akışı init'te bağlar ve başarılı transkripti bildirir",
    /function akisBagla\(\) \{[\s\S]*?A\.bagla\(\{[\s\S]*?onSonuc\(function \(bilgi\) \{ A\.sonucGeldi\(bilgi\); \}\);/.test(cap) &&
    /uygulamaIpucunuGuncelle\(\);\n    akisBagla\(\);/.test(cap));
  ok("durum noktaları: stil değişimi, iş başlangıcı / bitişi, başarılı uygulama (bağlayıcı yoksa sessiz)",
    /SufloAltyaziAkis\.guncelle\(\);\n  \}/.test(govde(cap, "function uygulamaIpucunuGuncelle(")) &&
    /SufloAltyaziAkis\.guncelle\(\{ uretiliyor: !!b \}\)/.test(govde(cap, "function setBusy(")) &&
    /SufloAltyaziAkis\.guncelle\(\{ uygulandi: true \}\)/.test(govde(cap, "function yildizIste(")) &&
    (cap.match(/typeof SufloAltyaziAkis !== "undefined"/g) || []).length === 3);

  console.log("\n" + gecen + "/" + toplam + " gecti");
  if (gecen !== toplam) process.exit(1);
})().catch(function (e) { console.error(e); process.exit(1); });
