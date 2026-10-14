// Suflo testi: kesimden sonra altyazı (3.4 adım 8) — captions.js'in GERÇEK belge işlevleri (kesimKaydet, kurguDurumu,
// kurguyaUyarla, esleKesim, yukleKelimeler, durumAl / durumYukle / undo ve Uygula'nın sekans denetimi) sahte DOM ile;
// js/kesim-altyazi.js eylem satırı bu gerçek işlevlerle uçtan uca:
//  - kopya sekansta kesim: belge kaynağın → "Altyazıyı yeni kurguya uyarla" görünür, tek geri alma adımıyla uyarlanır
//  - satır yalnız kesilen sekans açıkken görünür; geri alınca yeniden önerilir; aynı kesim iki kez uygulanmaz
//  - belge kesimden SONRA oluştuysa önerilmez; Sadece kes + seç kaydedilmez; rippleFallback → boşluk modu
//  - art arda iki kesim (kopya + kopyada Bu sekansta) tek tıkla sırayla uygulanır
//  - Altyazıya aktar: kelimeler satır kurucuyla belge olur, hedef sekansa bağlanır; Uygula başka sekansta açılmaz
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 400) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
function govde(imza) {
  var i = cap.indexOf(imza);
  if (i < 0) throw new Error("yok: " + imza);
  return cap.slice(i, cap.indexOf("\n  }\n", i) + 4);
}
var blokBas = cap.indexOf("  /* ---------------- 3.4 adım 8: kesimden sonra altyazıyı yeni kurguya uyarla");
var blokSon = cap.indexOf("  /*\n   * Başarılı transkript dinleyicileri");
if (blokBas < 0 || blokSon < blokBas) throw new Error("3.4 adım 8 bloğu captions.js'te bulunamadı");
var BLOK = cap.slice(blokBas, blokSon);
var E = require(path.join(KOK, "js", "kesim-esle.js"));
var CT = require(path.join(KOK, "js", "caption-text.js"));
var CL = require(path.join(KOK, "js", "caption-layout.js"));

/* ---------- küçük olay yolu (document) ---------- */
function belgeYap() {
  var dinle = {};
  return {
    olaylar: 0,
    addEventListener: function (ad, f) { (dinle[ad] = dinle[ad] || []).push(f); },
    dispatchEvent: function (ev) { this.olaylar++; (dinle[ev.type] || []).forEach(function (f) { f(ev); }); return true; },
    getElementById: function () { return null; }
  };
}
function OlayYap(tur) { this.type = tur; }

/* ---------- KCaptions: gerçek işlevler, sahte çevre ---------- */
function altyaziKur(o) {
  o = o || {};
  var dom = { "cap-maxlen": { value: o.uzunluk || "l42" }, "cap-result": { hidden: true }, "cap-result-info": { textContent: "" } };
  var kayit = { toast: [], taslak: 0 };
  var ctx = { sequenceId: "S1", sequence: "Vlog" };
  var KApp = { ctx: function () { return ctx; }, toast: function (m, c) { kayit.toast.push([m, c]); } };
  var doc = o.document || belgeYap();
  var src = [
    "var segments = [], segmentsMode = 'plain', ceviriDili = '', algilananDil = '', shortsYuklenen = '', ornekBelge = false, ornekSekansId = '', busy = false;",
    "var belgeSekansId = '', belgeSira = 0, belgeKesimAdi = null, kesimKayitlari = [], kesimSayac = 0, KESIM_KAYIT_SINIRI = 40;",
    "var undoStack = [], redoStack = [], UNDO_MAX = 50, kaliteOnayBekleyen = null, onayBekleyen = null, uygulananSekans = {};",
    "function render() {} function refreshUndoUI() {} function renderHistory() {} function uygulaEtiketiniSifirla() {} function shortsDugmesi() {}",
    "function clearRevert() {} function hideRestore() {} function applyGlossary() {} function cancelDraft() {}",
    "function saveDraftNow() { kayit.taslak++; } function saveDraftSoon() { kayit.taslak++; }",
    "function qualityReport() { throw new Error('UYGULAMA_DEVAM'); }",
    "function kurSecenekleri(s) { return { minSure: 0.8, maxSure: 6, sonSinir: Number(s) > 0 ? Number(s) : undefined }; }",
    govde("function dilKodu("), govde("function durumAl("), govde("function durumYukle("), govde("function snapshot("), govde("function undo("),
    govde("async function apply("),
    BLOK,
    "return { kesimKaydet: kesimKaydet, kurguDurumu: kurguDurumu, kurguyaUyarla: kurguyaUyarla, esleKesim: esleKesim, yukleKelimeler: yukleKelimeler,",
    "  belgeBagla: belgeBagla, undo: undo, apply: apply,",
    "  belgeBilgisi: function () { return { sekansId: belgeSekansId, sira: belgeSira, kesimAdi: belgeKesimAdi, satir: segments.length }; },",
    "  yukle: function (segs, sekansId) { segments = JSON.parse(JSON.stringify(segs)); belgeBagla(sekansId, kesimSayac, null); },",
    "  segs: function () { return segments; }, mod: function () { return segmentsMode; }, dil: function () { return algilananDil; },",
    "  mesgul: function (b) { busy = b; }, shorts: function (v) { if (v !== undefined) shortsYuklenen = v; return shortsYuklenen; },",
    "  geriAl: function () { return undoStack.length; } };"
  ].join("\n");
  var api = new Function("window", "document", "CustomEvent", "el", "CT", "CL", "KApp", "kayit", src)(
    { SufloKesimEsle: E }, doc, OlayYap, function (id) { return dom[id] || null; }, CT, CL, KApp, kayit);
  api.dom = dom; api.kayit = kayit; api.ctx = ctx; api.document = doc;
  return api;
}

/* ---------- eylem satırı (js/kesim-altyazi.js) ---------- */
function satirKur(C, ids) {
  var doc = C.document;
  var dugum = doc.dugum = doc.dugum || {};   // aynı belgedeki iki kartın düğümleri tek haritada
  function d(id) { if (!dugum[id]) dugum[id] = { id: id, hidden: true, textContent: "", dinle: {}, addEventListener: function (t, f) { (this.dinle[t] = this.dinle[t] || []).push(f); },
    click: function () { (this.dinle.click || []).forEach(function (f) { f({}); }); } }; return dugum[id]; }
  [ids.kutu, ids.metin, ids.uyarla, ids.aktar].forEach(function (id) { if (id) d(id); });
  doc.getElementById = function (id) { return dugum[id] || null; };
  var baglam = [], sekmeler = [], toast = [];
  var sb = { window: {}, document: doc, console: console, JSON: JSON, Math: Math, Number: Number, String: String };
  sb.window.SufloKesimEsle = E;
  sb.window.KCaptions = C;
  sb.window.KApp = sb.KApp = { onContext: function (f) { baglam.push(f); }, toast: function (m, c) { toast.push([m, c]); }, goster: function (s) { sekmeler.push(s); },
    ctx: function () { return C.ctx; } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "kesim-altyazi.js"), "utf8"), sb);
  var eylem = sb.window.KKesimAltyazi(ids);
  return { eylem: eylem, el: d, toast: toast, sekmeler: sekmeler, baglam: function (c) { baglam.forEach(function (f) { f(c); }); } };
}
var CUT_IDS = { kutu: "cut-altyazi", metin: "cut-altyazi-metin", uyarla: "cut-altyazi-uyarla" };
var TC_IDS = { kutu: "tc-altyazi", metin: "tc-altyazi-metin", uyarla: "tc-altyazi-uyarla", aktar: "tc-altyazi-aktar" };

function w(text, start, end) { return { text: text, start: start, end: end }; }
var BELGE = [
  { start: 1, end: 3.2, text: "Merhaba ııı arkadaşlar,", words: [w("Merhaba", 1, 1.5), w("ııı", 1.8, 2.4), w("arkadaşlar,", 2.6, 3.2)] },
  { start: 6, end: 7.5, text: "bugün *çok* güzel.", words: [w("bugün", 6, 6.4), w("çok", 6.5, 6.8), w("güzel.", 6.9, 7.5)] },
  { start: 12, end: 13, text: "Hadi başlayalım." }
];
// KS_applyCuts sahte sonucu (Kopya sekansta): host raporu kesilen kopyayı, kareyi ve gerçek kaymayı bildirir
function kopyaSonucu(kaynak, hedef, kesimler, ek) {
  var r = { ok: true, removed: 4, selected: 0, newSeq: "Vlog — Suflo Temiz", rippleFallback: false,
    esleme: { kaynak: kaynak, seqId: hedef, kare: 0.04, kesimler: kesimler.map(function (k) { return { start: k.start, end: k.end, kayma: k.end - k.start }; }) } };
  for (var x in ek || {}) r[x] = ek[x];
  return r;
}
var KESIM = [{ start: 1.72, end: 2.48 }, { start: 8, end: 10 }];   // dolgu "ııı" + bir duraksama

(async function () {
  /* ---- 1) Kopya sekansta kesim → Altyazıyı yeni kurguya uyarla ---- */
  var C = altyaziKur();
  C.yukle(BELGE, "S1");
  var S = satirKur(C, CUT_IDS);
  ok("başlangıç: eylem satırı gizli", S.el("cut-altyazi").hidden === true);
  var bek = S.eylem.kesimSonrasi(kopyaSonucu("S1", "S1-kopya", KESIM), { removeMode: "ripple", kaynak: "S1", kaynakAd: "Vlog", ranges: KESIM, kare: 0.04 });
  ok("kesimden sonra: kayıt (sıra 1, hedef kopya), satır ve 'Altyazıyı yeni kurguya uyarla' görünür, metin satır sayısını söyler",
    bek && bek.sira === 1 && bek.hedef === "S1-kopya" && S.el("cut-altyazi").hidden === false && S.el("cut-altyazi-uyarla").hidden === false &&
    /3 satır kesimden önceki kurguya göre/.test(S.el("cut-altyazi-metin").textContent), S.el("cut-altyazi-metin").textContent);
  ok("kurguDurumu: belge kaynağın (S1), kopyaya 1 adım", js(C.kurguDurumu("S1-kopya")) === js({ ok: true, adim: 1, satir: 3 }) && C.kurguDurumu("S1").neden === "guncel");
  // satır yalnız kesilen sekans açıkken
  S.baglam({ sequenceId: "S1", sequence: "Vlog" });
  ok("özgün sekans açılınca satır gizlenir (kesilen sekans değil)", S.el("cut-altyazi").hidden === true);
  S.baglam({ sequenceId: "S1-kopya", sequence: "Vlog — Suflo Temiz" });
  ok("kopya yeniden açılınca satır yine görünür", S.el("cut-altyazi").hidden === false);
  var geriOnce = C.geriAl();
  S.el("cut-altyazi-uyarla").click();
  var segs = C.segs();
  ok("uyarla: kesilen dolgu satırdan çıktı, metin ve zaman kalan kelimelerden (kare oturtuldu: 1,72 → 1,72; 2,48 → 2,48)",
    segs[0].text === "Merhaba arkadaşlar," && segs[0].start === 1 && Math.abs(segs[0].end - 2.44) < 1e-6 && segs[0].words.length === 2, js(segs[0]));
  ok("uyarla: sonraki satırlar toplam kesim kadar kaydı (0,76 + 2)", Math.abs(segs[1].start - 5.24) < 1e-6 && Math.abs(segs[2].start - 9.24) < 1e-6 && segs[1].text === "bugün *çok* güzel.",
    js(segs.map(function (s) { return [s.start, s.end]; })));
  ok("uyarla: tek geri alma adımı, taslak yazıldı, belge kopyaya bağlandı (Uygula yalnız orada)",
    C.geriAl() === geriOnce + 1 && C.kayit.taslak > 0 && js(C.belgeBilgisi()) === js({ sekansId: "S1-kopya", sira: 1, kesimAdi: "Vlog — Suflo Temiz", satir: 3 }), js(C.belgeBilgisi()));
  ok("uyarla: bildirim ve satır kapanır (belge güncel)", S.toast.some(function (t) { return /Altyazı yeni kurguya uyarlandı: 3 satır/.test(t[0]) && t[1] === "good"; }) &&
    S.el("cut-altyazi").hidden === true, js(S.toast));
  ok("aynı kesim ikinci kez uygulanmaz", C.kurguyaUyarla("S1-kopya").neden === "guncel" && js(C.segs()) === js(segs));
  C.undo();
  ok("geri al: belge ve bağı geri gelir, satır yeniden önerilir (belge olayıyla)", js(C.segs()) === js(BELGE) && C.belgeBilgisi().sekansId === "S1" &&
    S.el("cut-altyazi").hidden === false, js(C.belgeBilgisi()));

  // Uygula: kopyaya uyarlanan belge özgün sekansta açılmaz
  C.kurguyaUyarla("S1-kopya");
  C.ctx.sequenceId = "S1";
  await C.apply(false);
  ok("Uygula: kopyaya uyarlanan belge başka sekansta uygulanmaz (uyarı adıyla)",
    C.kayit.toast.some(function (t) { return t[0] === "Bu altyazı \"Vlog — Suflo Temiz\" sekansının kurgusuna göre uyarlandı. Önce o sekansı aç, sonra uygula." && t[1] === "warn"; }), js(C.kayit.toast));
  C.ctx.sequenceId = "S1-kopya";
  var devam = "";
  try { await C.apply(false); } catch (eA) { devam = eA.message; }
  ok("Uygula: doğru sekansta denetimden geçer", devam === "UYGULAMA_DEVAM", devam);
  var C0 = altyaziKur();
  C0.yukle(BELGE, "S1");
  C0.ctx.sequenceId = "BASKA";
  var devam0 = "";
  try { await C0.apply(false); } catch (eB) { devam0 = eB.message; }
  ok("Uygula: kesime bağlı olmayan belge eskisi gibi her sekansta (denetim yok)", devam0 === "UYGULAMA_DEVAM", devam0);

  /* ---- 2) önerilmeyen durumlar ---- */
  var C2 = altyaziKur();
  C2.yukle(BELGE, "S1");
  var S2 = satirKur(C2, CUT_IDS);
  ok("Sadece kes + seç: kayıt yok, satır yok", S2.eylem.kesimSonrasi({ ok: true, removed: 0, selected: 3, newSeq: "", esleme: { kaynak: "S1", seqId: "S1", kesimler: KESIM } },
    { removeMode: "select", kaynak: "S1", ranges: KESIM }) === null && S2.el("cut-altyazi").hidden === true);
  var bg = S2.eylem.kesimSonrasi(kopyaSonucu("S1", "S1", KESIM, { newSeq: "", rippleFallback: true }), { removeMode: "ripple", kaynak: "S1", ranges: KESIM });
  ok("rippleFallback: boşluk modu (kayma yok sayılır), Bu sekansta hedef = kaynak", bg.plan.mod === "gap" && bg.hedef === "S1" && bg.plan.cuts[0].kayma === undefined, js(bg.plan));
  S2.el("cut-altyazi-uyarla").click();
  ok("boşluk modu: zamanlar kaymaz, kesilen kelime düşer, kesimin iki yanı ayrı satır", C2.segs()[0].text === "Merhaba" && C2.segs()[1].text === "arkadaşlar," &&
    C2.segs()[1].start === 2.6 && C2.segs()[3].start === 12, js(C2.segs().map(function (s) { return [s.text, s.start]; })));
  var C3 = altyaziKur();
  C3.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("S1", "S1", KESIM, { newSeq: "" }), { removeMode: "ripple" }));
  C3.yukle(BELGE, "S1");   // kesimden SONRA yazıya dökülen belge: kesim zaten içinde
  ok("belge kesimden sonra oluştuysa önerilmez (güncel)", C3.kurguDurumu("S1").neden === "guncel");
  var C4 = altyaziKur();
  C4.yukle(BELGE, "BASKA");
  C4.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("S1", "S1-kopya", KESIM), { removeMode: "ripple" }));
  ok("başka sekansın belgesi: önerilmez (sekans)", C4.kurguDurumu("S1-kopya").neden === "sekans");
  C4.mesgul(true);
  ok("transkripsiyon sürerken önerilmez (meşgul)", C4.kurguDurumu("S1-kopya").neden === "mesgul");

  /* ---- 3) art arda iki kesim: kopya, sonra kopyada Bu sekansta (iki kart) ---- */
  var C5 = altyaziKur();
  C5.yukle(BELGE, "S1");
  var oto = satirKur(C5, CUT_IDS);
  oto.eylem.kesimSonrasi(kopyaSonucu("S1", "C1", [{ start: 8, end: 10 }]), { removeMode: "ripple", kaynak: "S1", ranges: [{ start: 8, end: 10 }] });
  var tc = satirKur(C5, TC_IDS);
  tc.eylem.kesimSonrasi(kopyaSonucu("C1", "C1", [{ start: 1.72, end: 2.48 }], { newSeq: "" }), { removeMode: "ripple", kaynak: "C1", kaynakAd: "Vlog — Suflo Temiz", ranges: [{ start: 1.72, end: 2.48 }] });
  ok("ikinci kesimden sonra: belge iki adım geride, satır görünür", js(C5.kurguDurumu("C1")) === js({ ok: true, adim: 2, satir: 3 }) && tc.el("tc-altyazi").hidden === false &&
    tc.el("tc-altyazi-aktar").hidden === true);
  tc.el("tc-altyazi-uyarla").click();
  var s5 = C5.segs();
  ok("tek tık iki kesimi sırayla uygular (önce duraksama, sonra dolgu)", s5[0].text === "Merhaba arkadaşlar," && Math.abs(s5[2].start - 9.24) < 1e-6 && C5.belgeBilgisi().sekansId === "C1",
    js(s5.map(function (s) { return [s.text, s.start]; })));
  ok("belge olayı öbür kartın satırını da kapatır", oto.el("cut-altyazi").hidden === true && tc.el("tc-altyazi").hidden === true);

  /* ---- 4) Altyazıya aktar (Konuşmadan kes) ---- */
  var C6 = altyaziKur();
  C6.yukle([{ start: 50, end: 51, text: "Başka bir belge" }], "B");
  var T = satirKur(C6, TC_IDS);
  var kel = [w("Merhaba", 10, 10.4), w("arkadaşlar.", 10.5, 11), w("Bugün", 12.2, 12.5), w("kamerayı", 12.6, 13), w("anlatacağım.", 13.1, 13.8)];
  // ııı (11,2–11,9) kesildi; kelimeler zaten kesilmeyenler
  var bekT = T.eylem.kesimSonrasi(kopyaSonucu("S1", "S1-kopya", [{ start: 11.1, end: 12.1 }]), { removeMode: "ripple", kaynak: "S1", ranges: [{ start: 11.1, end: 12.1 }],
    kelimeler: kel, dil: "tr", sonSinir: 20 });
  ok("Konuşmadan kes: Altyazıya aktar görünür (uyarla yok: ekrandaki belge başka sekansın)", T.el("tc-altyazi").hidden === false && T.el("tc-altyazi-aktar").hidden === false &&
    T.el("tc-altyazi-uyarla").hidden === true && /Kesilmeyen 5 kelime/.test(T.el("tc-altyazi-metin").textContent), T.el("tc-altyazi-metin").textContent);
  ok("aktarılacak kelimeler yeni kurgunun zamanlarında (kesimden sonrası 1 sn erken), son sınır da", Math.abs(bekT.kelimeler[2].start - 11.2) < 1e-6 && bekT.sonSinir === 19, js(bekT.kelimeler[2]) + " " + bekT.sonSinir);
  T.el("tc-altyazi-aktar").click();
  var s6 = C6.segs();
  ok("Altyazıya aktar: satır kurucuyla (l42) cümle cümle belge, ölçülmüş kelimelerle", s6.length === 2 && s6[0].text === "Merhaba arkadaşlar." && s6[1].text === "Bugün kamerayı anlatacağım." &&
    Math.abs(s6[1].start - 11.2) < 1e-6 && s6[1].words.length === 3 && C6.mod() === "plain" && C6.dil() === "tr", js(s6));
  ok("Altyazıya aktar: belge kopyaya bağlı (kesim kaydına kadar güncel), önceki belge geri alınabilir, Altyazı sekmesine geçildi",
    js(C6.belgeBilgisi()) === js({ sekansId: "S1-kopya", sira: 1, kesimAdi: "Vlog — Suflo Temiz", satir: 2 }) && C6.geriAl() === 1 && T.sekmeler[0] === "captions" &&
    T.el("tc-altyazi").hidden === true, js(C6.belgeBilgisi()));
  ok("Altyazıya aktar edilen belgeye aynı kesim yeniden uygulanmaz", C6.kurguDurumu("S1-kopya").neden === "guncel");
  var C7 = altyaziKur({ uzunluk: "k1" });
  ok("yukleKelimeler kelime kelime modunda da (k1)", C7.yukleKelimeler(kel, { sekansId: "X" }).satir === 5 && C7.mod() === "k1");
  ok("yukleKelimeler: boş liste reddedilir", C7.yukleKelimeler([], { sekansId: "X" }).neden === "bos" && C7.segs().length === 5);

  /* ---- 5) doğrudan API: esleKesim ---- */
  var C8 = altyaziKur();
  C8.yukle(BELGE, "S1");
  var e1 = C8.esleKesim(KESIM, "ripple", "S1", { hedef: "S1-kopya", kare: 0.04, hedefAd: "Kopya" });
  var e1s = js(C8.segs());
  var e2 = C8.esleKesim(KESIM.slice().reverse(), "ripple", "S1", { hedef: "S1-kopya", kare: 0.04 });
  ok("esleKesim: uyarlar; aynı kesim (sırasız da) ikinci kez no-op (idempotent)", e1.ok && e1.dusen === 0 && e1.kirpilan === 1 && !e2.ok && e2.neden === "guncel" && js(C8.segs()) === e1s, js([e1, e2]));
  ok("esleKesim: select ve başka sekans reddedilir", C8.esleKesim(KESIM, "select", "S1-kopya").neden === "mod" && C8.esleKesim(KESIM, "ripple", "Z").neden === "sekans");

  /* ---- 6) kaynakta ---- */
  ok("index.html: kesim-esle.js captions.js'ten, kesim-altyazi.js magiccut.js ve konusma-kes.js'ten önce; satırlar varsayılan gizli",
    html.indexOf('src="js/caption-layout.js"') < html.indexOf('src="js/kesim-esle.js"') && html.indexOf('src="js/caption-text.js"') < html.indexOf('src="js/kesim-esle.js"') &&
    html.indexOf('src="js/kesim-esle.js"') < html.indexOf('src="js/captions.js"') && html.indexOf('src="js/kesim-altyazi.js"') < html.indexOf('src="js/magiccut.js"') &&
    html.indexOf('src="js/kesim-altyazi.js"') < html.indexOf('src="js/konusma-kes.js"') &&
    /<div id="cut-altyazi" class="kesim-altyazi" hidden>/.test(html) && /<div id="tc-altyazi" class="kesim-altyazi" hidden>/.test(html));
  var mc = fs.readFileSync(path.join(KOK, "js", "magiccut.js"), "utf8"), kk = fs.readFileSync(path.join(KOK, "js", "konusma-kes.js"), "utf8");
  ok("magiccut / konusma-kes: KS_applyCuts esleme raporunu ister, eylem kapısız (ücretsiz)",
    /cloneFirst: target === "clone", esleme: true \}/.test(mc) && /cloneFirst: target === "clone", esleme: true \}/.test(kk) &&
    !/Pro\.gate/.test(fs.readFileSync(path.join(KOK, "js", "kesim-altyazi.js"), "utf8")) && !/Pro\.gate/.test(BLOK));
  var I = require(path.join(KOK, "js", "i18n.js"));
  I.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("English (beta): satır, bildirim ve Uygula uyarısı çevrilir",
    I.translate("Altyazı yeni kurguya uyarlandı: 4 satır · kesilen 1 satır çıkarıldı · 2 satır kısaldı") === "Captions adapted to the new edit: 4 lines · 1 cut lines removed · 2 lines shortened" &&
    I.translate("Altyazı sekmesindeki 3 satır kesimden önceki kurguya göre.") === "The 3 lines in the Captions tab still follow the edit from before the cut." &&
    I.translate("Altyazıyı yeni kurguya uyarla") === "Adapt captions to the new edit" && I.translate("Altyazıya aktar") === "Send to captions" &&
    I.translate("12 satır · yeni kurguya uyarlandı") === "12 lines · adapted to the new edit" &&
    I.translate("Bu altyazı \"Vlog — Suflo Temiz\" sekansının kurgusuna göre uyarlandı. Önce o sekansı aç, sonra uygula.").indexOf("These captions were adapted to the edit of the \"Vlog") === 0,
    I.translate("Altyazı yeni kurguya uyarlandı: 4 satır · kesilen 1 satır çıkarıldı · 2 satır kısaldı"));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack || e)); process.exit(1); });
