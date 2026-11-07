// tests/test-senkron-bulgular.js'in captions.js bölümü: gerçek işlevler imzayla kesilip sahte ortamda çalışır.
"use strict";
var fs = require("fs");
var path = require("path");
var KOK = path.join(__dirname, "..");
var Z = require(path.join(KOK, "js", "ses-zarf.js"));
var U = require(path.join(KOK, "js", "senkron-ui.js"));
var G = require("./_senkron-sentetik.js");
var I18N = require(path.join(KOK, "js", "i18n.js"));

module.exports = async function (T) {
  var ok = T.ok, J = T.J;
  var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
  function govde(imza) { var i = cap.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return cap.slice(i, cap.indexOf("\n  }\n", i) + 4); }
  function satir(imza) { var i = cap.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return cap.slice(i, cap.indexOf("\n", i) + 1); }
  function dugum(id) {
    var d = { id: id || "", hidden: false, disabled: false, textContent: "", title: "", attrs: {}, dinle: {}, childNodes: [], style: {} };
    d.setAttribute = function (k, v) { d.attrs[k] = String(v); };
    d.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(d.attrs, k) ? d.attrs[k] : null; };
    d.addEventListener = function (t, f) { (d.dinle[t] = d.dinle[t] || []).push(f); };
    d.querySelector = function () { return null; };
    return d;
  }
  var g = G.uret({ tohum: 7, kelime: 40 }), a = Z.analizEt(g.pcm), T0 = 12.5;
  function kaydir(k, dd) { return k.map(function (c) { return { start: c.start + dd, end: c.end + dd, text: c.text, words: c.words.map(function (w) { return { start: w.start + dd, end: w.end + dd, text: w.text }; }) }; }); }
  var ham = kaydir(G.kartla(G.boz(g.kelimeler, 0.25, 0.04, 5), 4), T0);

  /* ---------- 8a) go(): belge atanmadan önce analiz, arada bekleme yok ---------- */
  try {
  var goG = govde("async function go(");
  var iAta = goG.indexOf("segments = kurulan.segments;"), iRender = goG.indexOf("render();", iAta);
  var arasi = goG.slice(iAta, iRender);
  ok("go(): yeni belge atandıktan sonra render'a dek hiçbir await yok (eski satırlar düzenlenip yeni belgeye yazılamaz, Ctrl+Z yanlış belgeyi yaslamaz)",
    iAta > 0 && iRender > iAta && !/\bawait\b/.test(arasi) && /senkronIsSonu\(senkronSesler/.test(arasi), (arasi.match(/await [^\n]*/g) || []).join(" | "));
  var iAnaliz = goG.indexOf("await senkronSesiAnaliz(audioSrc");
  ok("go(): tek klip / sekans sesi satırlar kurulduktan sonra, belge atanmadan önce; boş transkriptte analiz yok", iAnaliz > goG.indexOf("CT.segmentleriKur(") && iAnaliz < iAta &&
    /if \(senkronIste && !batchClips && audioSrc && kurulan\.segments\.length\)/.test(goG));
  } catch (eB) { ok("go(): belge atanmadan önce analiz, arada bekleme yok: istisna", false, eB && eB.message); }

  /* ---------- 8b) After Effects: gerçek neden ve katman / kompozisyon dili ---------- */
  try {
  async function secAnaliz(sc, host) {
    var toast = [];
    var K = { call: function () { return Promise.resolve(sc); }, log: function () {}, iptalJetonu: function () { return { iptalEdildi: false, iptal: function () {} }; },
      hostKodu: function () { return host; }, fs: { statSync: function () { return { size: 1, mtimeMs: 1 }; } } };
    var kod = ["var senkronAnalizde = false, busy = false, senkronBelgeNo = 1, senkronKaynaklar = [], senkronSerit = null, senkronAnalizIptal = null;",
      satir("  var SENKRON_HIZ = "), satir("  var SENKRON_TERS = "), satir("  var SENKRON_IC_SEKANS = "),
      govde("function senkronHizEngeli("), govde("function senkronKaynakEkle("), govde("async function senkronSecilenKlibiAnaliz("),
      "return senkronSecilenKlibiAnaliz;"].join("\n");
    var f = new Function("K", "KApp", "SZ", "SUI", "status", kod)(K, { toast: function (m) { toast.push(m); } }, { sesZarfiCikar: function () { return Promise.resolve({ analiz: a }); } }, U, function () {});
    var r = await f();
    return { r: r, toast: toast };
  }
  var aeHata = "Time Remap açık katmanın sesi doğrudan okunamıyor.";
  var s1 = await secAnaliz({ ok: false, error: aeHata }, "AEFT");
  var s2 = await secAnaliz({ ok: true, clips: [] }, "AEFT");
  var s3 = await secAnaliz({ ok: true, clips: [] }, "PPRO");
  ok("After Effects: KS_getSelectedClips'in nedeni (Time Remap, ön kompozisyon…) olduğu gibi gösterilir", s1.r === null && s1.toast[0] === aeHata, J(s1.toast));
  ok("After Effects: seçim yoksa katman / kompozisyon dili; Premiere'de klip / timeline", s2.toast[0] === "Önce kompozisyonda altyazının ait olduğu katmanı seç." &&
    s3.toast[0] === "Önce timeline'da altyazının ait olduğu klibi seç." && I18N.translate(s2.toast[0]) === "First select the layer these captions belong to in the composition.", J([s2.toast, s3.toast]));
  } catch (eB) { ok("After Effects: gerçek neden ve katman / kompozisyon dili: istisna", false, eB && eB.message); }

  /* ---------- 8c) seçili klip kartı kapsamıyor ---------- */
  try {
  async function seritAnaliz(kay, secili, segs) {
    var toast = [];
    var kod = ["var segments = SEGS, selectedSegment = SEC; async function senkronSecilenKlibiAnaliz() { return KAY; }",
      govde("async function senkronSeritAnalizEt("), "return senkronSeritAnalizEt;"].join("\n");
    var f = new Function("KApp", "SUI", "SEGS", "SEC", "KAY", kod)({ toast: function (m, t, s) { toast.push([m, t]); } }, U, segs, secili, kay);
    await f();
    return toast;
  }
  var kayK = U.kaynak(a, 100, 1, 100 + a.sure);
  var tK = await seritAnaliz(kayK, 0, [{ start: 4, end: 5, text: "x" }]);
  var tK2 = await seritAnaliz(kayK, 1, [{ start: 4, end: 5, text: "x" }, { start: 101, end: 102, text: "y" }]);
  var tK3 = await seritAnaliz(null, 0, [{ start: 4, end: 5, text: "x" }]);
  ok("şeridin analizi: seçili klip kartı kapsamıyorsa uyarı (sessiz başarısızlık yok); kapsıyorsa ve analiz olmadıysa yok",
    tK.length === 1 && tK[0][0] === "Seçili klip #1 altyazısını içermiyor: o kartın klibini seçip yeniden dene." && tK[0][1] === "warn" && tK2.length === 0 && tK3.length === 0 &&
    I18N.translate(tK[0][0]) === "The selected clip doesn't contain caption #1: select that caption's clip and try again.", J([tK, tK2, tK3]));
  ok("şerit analiz düğmesi bu sarmalayıcıyı kullanır (Hepsini sese yasla doğrudan analiz eder)", /analizEt: senkronSeritAnalizEt,/.test(govde("function senkronSeritKur(")) &&
    /senkronSecilenKlibiAnaliz\(\)/.test(govde("async function senkronHepsiniYasla(")));
  } catch (eB) { ok("seçili klip kartı kapsamıyor: istisna", false, eB && eB.message); }

  /* ---------- 8d) ortam: rapor, geri al, yinele ---------- */
  try {
  var ortamKur = function (o) {
    o = o || {};
    var dom = {}, toastlar = [], kayit = { render: 0, taslak: 0, zarf: [], koy: 0 };
    ["cap-senkron-rapor", "cap-senkron-rapor-metin", "cap-senkron-geri", "cap-dalga-geri", "cap-undo", "cap-redo", "cap-segments"].forEach(function (id) { dom[id] = dugum(id); });
    dom["cap-senkron-rapor"].hidden = true; dom["cap-senkron-geri"].hidden = true;
    var K = { settings: function () { return {}; }, saveSettings: function () {}, log: function () {}, fs: { statSync: function () { return { size: 1, mtimeMs: 1 }; } } };
    var KApp = { ctx: function () { return { frame: 0.04 }; }, toast: function (m, t) { toastlar.push([m, t]); } };
    var SZs = { sesZarfiCikar: function (x) { kayit.zarf.push(x); return Promise.resolve({ analiz: a }); }, anahtar: Z.anahtar, onbellek: { koy: function () { kayit.koy++; } } };
    var kod = [
      "var segments = [], segmentsMode = " + J(o.mod || "plain") + ", ceviriDili = '', algilananDil = '', shortsYuklenen = '', ornekBelge = false, ornekSekansId = '', busy = false;",
      "var belgeSekansId = '', belgeSira = 0, belgeKesimAdi = null, undoStack = [], redoStack = [], UNDO_MAX = 50, aktifIptal = null, selectedSegment = -1;",
      cap.slice(cap.indexOf("  var senkronBelgeSayac = 0;"), cap.indexOf("  var senkronDinleSaat = null;\n") + 32),
      "function render() { kayit.render++; } function renderHistory() {} function uygulaEtiketiniSifirla() {} function shortsDugmesi() {} function belgeDegisti() {}",
      "function saveDraftSoon() { kayit.taslak++; } function saveDraftNow() { kayit.taslak++; } function tc(s) { return String(s); } function transcriptCache() { return TCS; }",
      satir("  var SENKRON_HIZ = "), satir("  var SENKRON_TERS = "),
      govde("function durumAl("), govde("function durumYukle("), govde("function snapshot("), govde("function undo("), govde("function redo("), govde("function refreshUndoUI("),
      govde("function belgeBagla("), govde("function senkronDogrulaAcik("), govde("function senkronAyari("), govde("function senkronFps("), govde("function senkronKaynakEkle("),
      govde("function senkronBelgeKaynaklari("), govde("async function senkronSesiAnaliz("), govde("function senkronIsSonu("), govde("function senkronUygula("),
      govde("function senkronRaporGoster("), govde("function senkronRaporGizle("), govde("function senkronGeriDurumu("), govde("function senkronGeriAl("),
      govde("function senkronOnbellegeYaz("), cap.indexOf("function senkronOrtusmeVar(") !== -1 ? govde("function senkronOrtusmeVar(") : "",
      "return { durum: function () { return { segments: segments, undo: undoStack, redo: redoStack, belge: senkronBelgeNo, kaynak: senkronKaynaklar }; },",
      "  yukle: function (s) { segments = JSON.parse(JSON.stringify(s)); belgeBagla('S', 0, null); },",
      "  senkronSesiAnaliz: senkronSesiAnaliz, senkronIsSonu: senkronIsSonu, senkronGeriAl: senkronGeriAl, senkronOnbellegeYaz: senkronOnbellegeYaz,",
      "  senkronOrtusmeVar: typeof senkronOrtusmeVar === 'function' ? senkronOrtusmeVar : null, undo: undo, redo: redo };"
    ].join("\n");
    var api = new Function("el", "K", "KApp", "SZ", "SUI", "kayit", "TCS", kod)(function (id) { return dom[id] || null; }, K, KApp, SZs, U, kayit, o.tcs || null);
    return { api: api, dom: dom, toastlar: toastlar, kayit: kayit };
  };
  var o = ortamKur();
  o.api.yukle(ham);
  o.api.senkronIsSonu([U.kaynak(a, T0, 0)], "");
  var metin1 = o.dom["cap-senkron-rapor-metin"].textContent, ton1 = o.dom["cap-senkron-rapor"].getAttribute("data-ton"), yasli = J(o.api.durum().segments);
  o.api.senkronGeriAl();
  var geriMetin = o.dom["cap-senkron-rapor-metin"].textContent;
  o.api.redo();
  ok("Yinele senkron düzeltmesini geri getirince rapor da geri gelir (metin, ton), rapordaki Geri al yeniden görünür",
    geriMetin === "Senkron düzeltmesi geri alındı" && J(o.api.durum().segments) === yasli && o.dom["cap-senkron-rapor-metin"].textContent === metin1 &&
    o.dom["cap-senkron-rapor"].getAttribute("data-ton") === ton1 && o.dom["cap-senkron-geri"].hidden === false && !o.dom["cap-senkron-rapor"].hidden, o.dom["cap-senkron-rapor-metin"].textContent);
  o.api.senkronGeriAl();
  ok("yinelemeden sonra rapordaki Geri al yine çalışır, adı 'sese yaslama'", J(o.api.durum().segments) === J(ham) && /Geri alındı: sese yaslama/.test(J(o.toastlar.slice(-1))), J(o.toastlar.slice(-1)));
  // başka bir geri al girdisinin yinelemesi raporu değiştirmez
  var o2 = ortamKur();
  o2.api.yukle(ham);
  o2.api.senkronIsSonu([U.kaynak(a, T0, 0)], "");
  o2.api.senkronGeriAl();
  o2.api.redo(); o2.api.undo();
  var m2 = o2.dom["cap-senkron-rapor-metin"].textContent;
  ok("rapor yalnız kendi girdisi yinelenince geri gelir (Ctrl+Z ile geri alınınca 'Geri al' gizli)", o2.dom["cap-senkron-geri"].hidden === true && typeof m2 === "string");
  } catch (eB) { ok("ortam: rapor, geri al, yinele: istisna", false, eB && eB.message); }

  /* ---------- 8e) toplu işte sese bakılmadan atlanan klip rapora ulaşır ---------- */
  try {
  var o3 = ortamKur();
  o3.api.yukle(ham);
  o3.api.senkronIsSonu([U.kaynak(a, T0, 0)], "Hızı değiştirilmiş klipte senkron doğrulama yapılmadı", ["hiz"]);
  ok("toplu iş: hızı değişmiş klip sesli kliplerle birlikteyken rapor 'klip doğrulanamadı' der, ton uyarı",
    /· 1 klip doğrulanamadı: klibin hızı değiştirilmiş$/.test(o3.dom["cap-senkron-rapor-metin"].textContent) && o3.dom["cap-senkron-rapor"].getAttribute("data-ton") === "uyari",
    o3.dom["cap-senkron-rapor-metin"].textContent);
  ok("go(): toplu klipte hız / ters / ffmpeg atlamaları anahtar olarak toplanır ve senkronIsSonu'na gider", /senkronAtlananKlip\.push\(bEngel === SENKRON_TERS \? "ters" : "hiz"\)/.test(goG) &&
    /senkronAtlananKlip\.push\(senkronSonNeden === "ffmpeg" \? "ffmpeg" : "analizYok"\)/.test(goG) && /senkronIsSonu\(senkronSesler, senkronAtlama, senkronAtlananKlip\)/.test(goG));
  } catch (eB) { ok("toplu işte sese bakılmadan atlanan klip rapora ulaşır: istisna", false, eB && eB.message); }

  /* ---------- 8f) analiz klibin kendi medyası ve ekseninde; geçici ses önbelleğe yazılmaz ---------- */
  try {
  var o4 = ortamKur();
  var k4 = await o4.api.senkronSesiAnaliz("/gecici/cap_1.wav", T0, 30, { media: "/medya/klip.mp4", inPoint: 7.25, dur: 30 });
  var z4 = o4.kayit.zarf[0] || {};
  ok("klip kapsamı: analiz klibin medyasında (inPoint, süre, zaman süzgeci ses-zarf'ta), normal önbellekle; geçici WAV okunmaz",
    k4 && k4.t0 === T0 && z4.media === "/medya/klip.mp4" && z4.inPoint === 7.25 && z4.dur === 30 && z4.onbellek !== false, J(z4).slice(0, 160));
  ok("geçici sesin analizi klibin medya anahtarıyla önbelleğe elle yazılmaz (sıraya bağlı sonuç yok)", o4.kayit.koy === 0 && !/onbellek\.koy\(/.test(govde("async function senkronSesiAnaliz(")));
  var o5 = ortamKur();
  await o5.api.senkronSesiAnaliz("/gecici/cap_2.wav", 3, 10, null);
  var z5 = o5.kayit.zarf[0] || {};
  ok("sekans / In-Out (özgün klip yok): dışa aktarılan karışım okunur, önbelleğe girmez", z5.media === "/gecici/cap_2.wav" && z5.inPoint === 0 && z5.onbellek === false && o5.kayit.koy === 0);
  ok("ses analizi doğrudan medyanın zaman ekseninde (ZAMAN_SUZGECI) çıkarılır", Z.cikarmaArgs("/medya/klip.mp4", 7.25, 30).indexOf(Z.ZAMAN_SUZGECI) !== -1);
  } catch (eB) { ok("analiz klibin kendi medyası ve ekseninde; geçici ses önbelleğe yazılmaz: istisna", false, eB && eB.message); }

  /* ---------- 8g) kelime kelime (k1) belgede önbelleğe kelimenin kendi zamanı ---------- */
  try {
  var yazilan = null;
  var o6 = ortamKur({ mod: "k1", tcs: { senkronYaz: function (m, e) { yazilan = e; return e.length; } } });
  var k1Motor = G.boz(g.kelimeler, 0.12, 0.03, 4);   // motorun kelime zamanı (kaymış): kart = kelime
  var k1Kart = k1Motor.map(function (w) { return { start: w.start + T0, end: w.end + T0, text: w.text }; });
  o6.api.yukle(k1Kart);
  var once6 = o6.api.durum().segments;
  o6.api.senkronIsSonu([U.kaynak(a, T0, 0)], "");
  var n6 = o6.api.senkronOnbellegeYaz({ mediaPath: "/m.mp4" }, once6, T0);
  var kartSon = o6.api.durum().segments;
  var reH = yazilan ? yazilan.map(function (e, i) { return Math.abs(e.re - g.kelimeler[i].end) * 1000; }) : [];
  var rsH = yazilan ? yazilan.map(function (e, i) { return Math.abs(e.rs - g.kelimeler[i].start) * 1000; }) : [];
  var kuyruklu = kartSon.filter(function (c, i) { return c.end - (g.kelimeler[i].end + T0) > 0.1; }).length;
  ok("hazırlık: k1 belgede kart gösterim zamanı kelimeden uzun (kuyruk / en kısa ekran süresi)", kuyruklu > 10, kuyruklu);
  ok("k1: önbelleğe kelimenin yaslanmış sınırı yazılır, kartın kuyruklu / ön paylı gösterim zamanı değil (≤ 15 ms)", n6 === g.kelimeler.length && yazilan &&
    Math.max.apply(null, reH) <= 15 && Math.max.apply(null, rsH) <= 15, "re en çok " + Math.round(Math.max.apply(null, reH.concat([0]))) + " ms, rs en çok " + Math.round(Math.max.apply(null, rsH.concat([0]))) + " ms");
  ok("k1: motorun zamanı (start / end) eşleşmede aynen", yazilan && yazilan.every(function (e, i) { return Math.abs(e.start - k1Motor[i].start) < 1e-6 && Math.abs(e.end - k1Motor[i].end) < 1e-6; }));
  } catch (eB) { ok("kelime kelime (k1) belgede önbelleğe kelimenin kendi zamanı: istisna", false, eB && eB.message); }

  /* ---------- 8h) zamanda örtüşen toplu klipler ---------- */
  try {
  var OV = o.api.senkronOrtusmeVar;
  ok("senkronOrtusmeVar: iki izdeki aynı aralık örtüşür; bitişik (birkaç ms) ve ayrık klipler örtüşmez",
    OV([{ clipStart: 0, clipEnd: 10 }, { clipStart: 2, clipEnd: 8 }]) === true && OV([{ clipStart: 10, clipEnd: 20 }, { clipStart: 0, clipEnd: 10.03 }]) === false &&
    OV([{ clipStart: 0, clipEnd: 5 }, { clipStart: 6, clipEnd: 9 }, { clipStart: 1, clipEnd: 30 }]) === true && OV([]) === false);
  ok("go(): örtüşen toplu kliplerde analizler senkronIsSonu'na verilmez, neden 'Klipler zamanda üst üste biniyor'",
    /if \(senkronIste && senkronOrtusmeVar\(senkronKlipler\)\) \{\s*senkronSesler = \[\]; senkronAtlananKlip = \[\];\s*senkronAtlama = SUI\.ATLANDI\.ortusenKlip;/.test(goG) &&
    goG.indexOf("senkronOrtusmeVar(senkronKlipler)") < goG.indexOf("senkronIsSonu(senkronSesler") && U.ATLANDI.ortusenKlip === "Klipler zamanda üst üste biniyor: senkron doğrulama yapılmadı" &&
    I18N.translate(U.ATLANDI.ortusenKlip) === "The clips overlap in time: sync check skipped");
  // hata kanıtı: örtüşen iki kaynakta ilk klibin kartları ikincinin sesine atanırdı
  var gB = G.uret({ tohum: 9, kelime: 40 }), aB = Z.analizEt(gB.pcm);
  var kaynakEkleO = ortamKur();
  kaynakEkleO.api.yukle(ham);
  kaynakEkleO.api.senkronIsSonu([U.kaynak(a, T0, 0), U.kaynak(aB, T0 + 0.5, 0)], "");
  ok("(neden) örtüşen iki klibin sesi belgede birbirini siler: biri kalır", kaynakEkleO.api.durum().kaynak.filter(function (k) { return k.belge === kaynakEkleO.api.durum().belge; }).length === 1);
  } catch (eB) { ok("zamanda örtüşen toplu klipler: istisna", false, eB && eB.message); }

  /* ---------- 8i) README / yorum: Konuşmadan kes yaslanmış zamanı okumaz ---------- */
  try {
  var readme = fs.readFileSync(path.join(KOK, "README.md"), "utf8");
  var TX = require(path.join(KOK, "js", "textcut.js"));
  ok("README yanlış iddiayı taşımaz ('Konuşmadan kes önbellekten yaslanmış zamanı okur'), doğrusunu söyler", readme.indexOf("Konuşmadan kes önbellekten yaslanmış zamanı okur") === -1 &&
    /Konuşmadan kes kendi dolgu girdisini kullanır, yaslanmış zamanı okumaz/.test(readme) && /Konuşmadan kes bu girdiyi OKUMAZ/.test(cap.slice(cap.indexOf("function senkronOnbellegeYaz(") - 900, cap.indexOf("function senkronOnbellegeYaz("))) &&
    !/ortalama sapma 183 ms → 12 ms/.test(readme));
  ok("(neden) Konuşmadan kes'in dolgu istemi hiç boş değil: önbellekten 'altyazi' girdisini değil 'dolgu' girdisini ister", TX.fillerPrompt("tr") !== "" && TX.fillerPrompt("xx") !== "" &&
    /prompt: TC\.fillerPrompt\(/.test(fs.readFileSync(path.join(KOK, "js", "konusma-kes.js"), "utf8")));
  } catch (eB) { ok("README / yorum: Konuşmadan kes yaslanmış zamanı okumaz: istisna", false, eB && eB.message); }
};
