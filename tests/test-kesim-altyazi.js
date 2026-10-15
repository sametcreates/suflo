// Suflo testi: kesimden sonra altyazı (3.4 adım 8) — captions.js'in GERÇEK belge işlevleri (kesimKaydet, kurguDurumu,
// kurguyaUyarla, esleKesim, yukleKelimeler, durumAl / durumYukle / undo ve Uygula'nın sekans denetimi) sahte DOM ile;
// js/kesim-altyazi.js eylem satırı bu gerçek işlevlerle uçtan uca:
//  - kopya sekansta kesim: belge kaynağın → "Altyazıyı yeni kurguya uyarla" görünür, tek geri alma adımıyla uyarlanır
//  - satır yalnız kesilen sekans açıkken görünür; geri alınca yeniden önerilir; aynı kesim iki kez uygulanmaz
//  - belge kesimden SONRA oluştuysa önerilmez; Sadece kes + seç kaydedilmez; rippleFallback → boşluk modu
//  - art arda iki kesim (kopya + kopyada Bu sekansta) tek tıkla sırayla uygulanır
//  - Altyazıya aktar: kelimeler satır kurucuyla belge olur, hedef sekansa bağlanır; Uygula başka sekansta açılmaz
//  - inceleme: Premiere'de geri alma / yeniden uygulama (taze kurgu izi, KS_kurguIzi), kısmen uygulanan kesim, 40'tan
//    eski kesim kaydı (yer tutucu: eksik zincir uygulanmaz), birikimli belge, işin kesim sırası, İngilizce sekans adı
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
// belge / kesim kaydı durum değişkenleri captions.js'teki bildirimlerin kendisi (sınırlar, yer tutucu sayacı dahil)
var degBas = cap.indexOf('  var belgeSekansId = "";');
var degSon = cap.indexOf("\n", cap.indexOf("  var unutulanSira = 0;"));
if (degBas < 0 || degSon < degBas) throw new Error("kesim kaydı değişkenleri captions.js'te bulunamadı");
var DEGISKENLER = cap.slice(degBas, degSon);
var E = require(path.join(KOK, "js", "kesim-esle.js"));
var CT = require(path.join(KOK, "js", "caption-text.js"));
var CL = require(path.join(KOK, "js", "caption-layout.js"));
var WWM = require(path.join(KOK, "js", "whisper-words.js"));

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
    DEGISKENLER,
    "var undoStack = [], redoStack = [], UNDO_MAX = 50, kaliteOnayBekleyen = null, onayBekleyen = null, uygulananSekans = {};",
    "function render() {} function refreshUndoUI() {} function renderHistory() {} function uygulaEtiketiniSifirla() {} function shortsDugmesi() {}",
    "function clearRevert() {} function hideRestore() {} function applyGlossary() {} function cancelDraft() {}",
    // o.K verilirse taslak yazımı gerçek: writeDraft / shortsKaydiGuncelle (Shorts belgesi ana taslağı ezmesin)
    o.K ? "var scope = 'entire', WW = window.SufloWhisperWords;\n" + govde("function writeDraft(") + "\n" + govde("function shortsKaydiGuncelle(") +
      "\nfunction saveDraftNow() { kayit.taslak++; writeDraft(); } function saveDraftSoon() { kayit.taslak++; writeDraft(); }"
      : "function saveDraftNow() { kayit.taslak++; } function saveDraftSoon() { kayit.taslak++; }",
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
    "  modAyarla: function (m) { segmentsMode = m; }, kayitlar: function () { return kesimKayitlari; },",
    "  mesgul: function (b) { busy = b; }, shorts: function (v) { if (v !== undefined) shortsYuklenen = v; return shortsYuklenen; },",
    "  ornek: function (id) { ornekBelge = true; ornekSekansId = id; }, ornekSekans: function () { return ornekSekansId; },",
    "  geriAl: function () { return undoStack.length; } };"
  ].join("\n");
  var api = new Function("window", "document", "CustomEvent", "el", "CT", "CL", "KApp", "kayit", "K", src)(
    { SufloKesimEsle: E, SufloWhisperWords: WWM }, doc, OlayYap, function (id) { return dom[id] || null; }, CT, CL, KApp, kayit, o.K);
  api.dom = dom; api.kayit = kayit; api.ctx = ctx; api.document = doc;
  return api;
}

/* ---------- eylem satırı (js/kesim-altyazi.js) ---------- */
// o.iz: işlev(seqId) → KS_kurguIzi yanıtı (verilirse window.K.call sahte köprüsü kurulur; çağrılar o.cagri'ya)
function satirKur(C, ids, o) {
  o = o || {};
  var doc = C.document;
  var dugum = doc.dugum = doc.dugum || {};   // aynı belgedeki iki kartın düğümleri tek haritada
  function d(id) { if (!dugum[id]) dugum[id] = { id: id, hidden: true, textContent: "", dinle: {}, addEventListener: function (t, f) { (this.dinle[t] = this.dinle[t] || []).push(f); },
    click: function () { var son; (this.dinle.click || []).forEach(function (f) { var x = f({}); if (x) son = x; }); return son; } }; return dugum[id]; }
  [ids.kutu, ids.metin, ids.uyarla, ids.aktar].forEach(function (id) { if (id) d(id); });
  doc.getElementById = function (id) { return dugum[id] || null; };
  var baglam = [], sekmeler = [], toast = [];
  var sb = { window: {}, document: doc, console: console, JSON: JSON, Math: Math, Number: Number, String: String };
  sb.window.SufloKesimEsle = E;
  sb.window.KCaptions = C;
  sb.window.KApp = sb.KApp = { onContext: function (f) { baglam.push(f); }, toast: function (m, c, sure, eylem) { toast.push([m, c, eylem]); }, goster: function (s) { sekmeler.push(s); },
    ctx: function () { return C.ctx; } };
  if (o.iz) {
    o.cagri = o.cagri || [];
    sb.window.K = { call: function (fn, arg) { o.cagri.push([fn, arg]); return Promise.resolve(fn === "KS_kurguIzi" ? o.iz(arg && arg.seqId) : { ok: false }); } };
  }
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
  var kesimRed = await C.apply(false);
  ok("Uygula: kopyaya uyarlanan belge başka sekansta uygulanmaz (uyarı adıyla)",
    C.kayit.toast.some(function (t) { return t[0] === "Bu altyazı \"Vlog — Suflo Temiz\" sekansının kurgusuna göre uyarlandı. Önce o sekansı aç, sonra uygula." && t[1] === "warn"; }), js(C.kayit.toast));
  // 3.4 inceleme: köprü (suflo_altyazi_kanala) nedeni öğrenir: genel "Not applied." değil, kod + kesim sekansının adı
  ok("Uygula: kesim sekansı reddi sonuç nesnesi döner (kod kesim_sekansi, mesajda sekans adı)",
    kesimRed && kesimRed.ok === false && kesimRed.kod === "kesim_sekansi" && kesimRed.mesaj.indexOf("\"Vlog — Suflo Temiz\"") !== -1, js(kesimRed));
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

  // inceleme r2: rehber örneğinin belgesi kopyaya uyarlanıp Ctrl+Z ile geri alınınca örneğin sekansı da geri döner
  // (ornekSekansId geri alma durumunda yoksa özgün Suflo Deneme reddedilir, kesilmiş kopyaya kesimden önceki zamanlar giderdi)
  var CO = altyaziKur();
  CO.yukle(BELGE, "DENEME");
  CO.ornek("DENEME");
  CO.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("DENEME", "DENEME-kopya", KESIM), { removeMode: "ripple" }));
  CO.kurguyaUyarla("DENEME-kopya");
  var ornekUyarlaninca = CO.ornekSekans();
  CO.ctx.sequenceId = "DENEME-kopya";
  var devamUK = "";
  try { await CO.apply(false); } catch (eUK) { devamUK = eUK.message; }
  CO.undo();
  CO.ctx.sequenceId = "DENEME";
  var devamOz = "";
  try { await CO.apply(false); } catch (eOz) { devamOz = eOz.message; }
  CO.ctx.sequenceId = "DENEME-kopya";
  CO.kayit.toast.length = 0;
  var devamKo = "";
  try { await CO.apply(false); } catch (eKo) { devamKo = eKo.message; }
  ok("örnek belge: kopyaya uyarlanınca kopyada uygulanır; geri alınınca örnek sekansı DENEME'ye döner, Uygula özgünde geçer, kesilmiş kopyada reddedilir",
    ornekUyarlaninca === "DENEME-kopya" && devamUK === "UYGULAMA_DEVAM" && CO.ornekSekans() === "DENEME" && CO.belgeBilgisi().sekansId === "DENEME" &&
    devamOz === "UYGULAMA_DEVAM" && devamKo === "" &&
    CO.kayit.toast.some(function (t) { return /^Bu örnek altyazı Suflo Deneme sekansı için/.test(t[0]) && t[1] === "warn"; }),
    js({ uyarla: ornekUyarlaninca, simdi: CO.ornekSekans(), oz: devamOz, ko: devamKo, toast: CO.kayit.toast }));

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


  /* ---- 7) inceleme: Premiere'de geri alma (taze kurgu izi) ---- */
  function izliSonuc(kaynak, hedef, kesimler, once, sonra, ek) {
    var r = kopyaSonucu(kaynak, hedef, kesimler, ek);
    r.esleme.izOnce = once; r.esleme.izSonra = sonra;
    return r;
  }
  var guncelIz = "X";
  var cagri = [];
  var CU = altyaziKur();
  CU.yukle(BELGE, "S1");
  var U = satirKur(CU, CUT_IDS, { iz: function (id) { return { ok: true, seqId: id, iz: guncelIz }; }, cagri: cagri });
  var rU = izliSonuc("S1", "S1", KESIM, "X", "Y", { newSeq: "" });
  U.eylem.kesimSonrasi(rU, { removeMode: "ripple", kaynak: "S1", ranges: KESIM });
  ok("izli kayıt: kurguDurumu izli, satır görünür", CU.kurguDurumu("S1").izli === true && U.el("cut-altyazi").hidden === false && CU.kayitlar()[0].izSonra === "Y",
    js(CU.kurguDurumu("S1")));
  // kullanıcı kesimi Premiere'de Ctrl+Z ile geri aldı: bugünkü iz kesimden önceki
  await U.el("cut-altyazi-uyarla").click();
  ok("geri alınan kesim: taze iz sorulur (salt okur, hedef sekans), belge değişmez, 'geri alınmış' uyarısı, satır kapanır",
    js(cagri[0]) === js(["KS_kurguIzi", { seqId: "S1" }]) && js(CU.segs()) === js(BELGE) && CU.geriAl() === 0 &&
    U.toast.some(function (t) { return t[0] === "Kesim Premiere'de geri alınmış; altyazı zaten bu kurguya göre." && t[1] === "warn"; }) &&
    U.el("cut-altyazi").hidden === true, js(U.toast));
  // aynı kesim yeniden bulunup uygulandı (X → Y): iki kayıt, kesim belgeye bir kez
  U.eylem.kesimSonrasi(izliSonuc("S1", "S1", KESIM, "X", "Y", { newSeq: "" }), { removeMode: "ripple", kaynak: "S1", ranges: KESIM });
  guncelIz = "Y";
  ok("yeniden uygulanan aynı kesim: iki kayıt ama yol tek adım", CU.kayitlar().length === 2 && CU.kurguDurumu("S1").adim === 1, js(CU.kurguDurumu("S1")));
  await U.el("cut-altyazi-uyarla").click();
  var tekKez = E.zincirEsle(BELGE, [{ mod: "ripple", kare: 0.04, cuts: rU.esleme.kesimler }]).cues;
  ok("yeniden uygulanan kesim belgeye bir kez uygulanır (iki kez kaydırmaz)", js(CU.segs()) === js(tekKez) && Math.abs(CU.segs()[2].start - 9.24) < 1e-6 &&
    CU.belgeBilgisi().sira === 2, js(CU.segs().map(function (x) { return [x.text, x.start]; })));
  // kurgu kesimden sonra başka türlü değişti: uyarı + "Yine de uyarla"
  var CD = altyaziKur();
  CD.yukle(BELGE, "S1");
  var izD = "Q", cagriD = [];
  var D = satirKur(CD, CUT_IDS, { iz: function (id) { return izD === null ? { ok: false, error: "yok" } : { ok: true, seqId: id, iz: izD }; }, cagri: cagriD });
  D.eylem.kesimSonrasi(izliSonuc("S1", "S1", KESIM, "X", "Y", { newSeq: "" }), { removeMode: "ripple", kaynak: "S1", ranges: KESIM });
  await D.el("cut-altyazi-uyarla").click();
  var uyari = D.toast.filter(function (t) { return /^Kurgu kesimden sonra Premiere'de değişti/.test(t[0]); })[0];
  ok("kurgu kesimden sonra değişti: belge değişmez, uyarı 'Yine de uyarla' düğmesiyle, satır açık kalır",
    uyari && uyari[1] === "warn" && uyari[2] && uyari[2].metin === "Yine de uyarla" && js(CD.segs()) === js(BELGE) && D.el("cut-altyazi").hidden === false, js(D.toast));
  uyari[2].fn();
  ok("Yine de uyarla: denetimsiz uygulanır", CD.segs()[0].text === "Merhaba arkadaşlar," && Math.abs(CD.segs()[2].start - 9.24) < 1e-6, js(CD.segs()));
  CD.undo();
  izD = null;
  await D.el("cut-altyazi-uyarla").click();
  ok("taze iz okunamadı: uyarı + Yine de uyarla, belge değişmez", D.toast.some(function (t) { return t[0] === "Kurgu Premiere'den okunamadı; altyazı bu kurguya uymayabilir." && t[2]; }) &&
    js(CD.segs()) === js(BELGE), js(D.toast.slice(-1)));
  izD = "Y";
  await D.el("cut-altyazi-uyarla").click();
  ok("bugünkü iz kesimden sonraki: uygulanır", CD.segs()[0].text === "Merhaba arkadaşlar," && cagriD.length === 3, js(cagriD));
  // Altyazıya aktar da kurgu değiştiyse uyarır
  var CA = altyaziKur();
  CA.yukle([{ start: 50, end: 51, text: "Başka" }], "B");
  var izA = "Z";
  var A = satirKur(CA, TC_IDS, { iz: function (id) { return { ok: true, seqId: id, iz: izA }; } });
  A.eylem.kesimSonrasi(izliSonuc("S1", "S1-kopya", [{ start: 11.1, end: 12.1 }], "X", "Y"), { removeMode: "ripple", kaynak: "S1", ranges: [{ start: 11.1, end: 12.1 }],
    kelimeler: [w("Merhaba", 10, 10.4), w("arkadaşlar.", 10.5, 11), w("Bugün", 12.2, 12.5)], dil: "tr", sonSinir: 20 });
  await A.el("tc-altyazi-aktar").click();
  var uyariA = A.toast.filter(function (t) { return /^Kurgu kesimden sonra Premiere'de değişti/.test(t[0]); })[0];
  // inceleme r2: düğme belgeyi uyarlamaz, yerine yeni belge kurar: "Yine de aktar" (uyarla yolunda "Yine de uyarla" kalır)
  ok("Altyazıya aktar: kurgu kesimden sonra değiştiyse uyarı + 'Yine de aktar' düğmesi, belge değişmez",
    uyariA && uyariA[1] === "warn" && uyariA[2] && uyariA[2].metin === "Yine de aktar" && CA.segs()[0].text === "Başka", js(A.toast));
  uyariA[2].fn();
  ok("Yine de aktar: kelimeler denetimsiz aktarılır (belgenin yerine)", CA.segs()[0].text === "Merhaba arkadaşlar." && CA.belgeBilgisi().sekansId === "S1-kopya", js(CA.segs()));
  CA.undo();
  izA = "Y";
  A.eylem.kesimSonrasi(izliSonuc("S1", "S1-kopya", [{ start: 11.1, end: 12.1 }], "X", "Y"), { removeMode: "ripple", kaynak: "S1", ranges: [{ start: 11.1, end: 12.1 }],
    kelimeler: [w("Merhaba", 10, 10.4), w("arkadaşlar.", 10.5, 11), w("Bugün", 12.2, 12.5)], dil: "tr", sonSinir: 20 });
  await A.el("tc-altyazi-aktar").click();
  ok("Altyazıya aktar: bugünkü iz kesimden sonraki → aktarılır", CA.segs()[0].text === "Merhaba arkadaşlar." && CA.belgeBilgisi().sekansId === "S1-kopya", js(CA.segs()));

  // inceleme r2: satır kurucu kelimeleri reddederse (Kelime kelime'de 8+ kelime aynı ana yığılmış) "kelime kalmadı" denmez:
  // kurucunun kendi metni ve çaresi (satır modu) gösterilir, kelimeler durur (satır moduna geçip yeniden aktarılabilir)
  var CY = altyaziKur({ uzunluk: "k1" });
  CY.yukle([{ start: 50, end: 51, text: "Başka" }], "B");
  var TY = satirKur(CY, TC_IDS);
  var yigin = [];
  for (var yi = 0; yi < 10; yi++) yigin.push(w("k" + yi, 10 + yi * 0.05, 10 + yi * 0.05 + 0.04));
  TY.eylem.kesimSonrasi(kopyaSonucu("S1", "S1-kopya", [{ start: 20, end: 21 }]), { removeMode: "ripple", kaynak: "S1", ranges: [{ start: 20, end: 21 }],
    kelimeler: yigin, dil: "tr" });
  ok("yığılmış kelimeler: satır 'Kesilmeyen 10 kelime … hazır' der", /Kesilmeyen 10 kelime/.test(TY.el("tc-altyazi-metin").textContent), TY.el("tc-altyazi-metin").textContent);
  TY.el("tc-altyazi-aktar").click();
  var tY = TY.toast[TY.toast.length - 1];
  ok("satır kurucu reddetti (neden kur): kendi uyarısı ('Motor kelime zamanlarını veremedi … satır modunu kullan'), 'kelime kalmadı' değil; belge değişmez, Altyazıya aktar açık kalır",
    tY && /^Motor kelime zamanlarını veremedi/.test(tY[0]) && /satır modunu kullan/.test(tY[0]) && tY[1] === "warn" &&
    !TY.toast.some(function (t) { return t[0] === "Altyazıya aktarılacak kelime kalmadı."; }) && CY.segs()[0].text === "Başka" && TY.el("tc-altyazi-aktar").hidden === false,
    js(TY.toast));

  /* ---- 8) inceleme: kısmen uygulanan kesim (silinemeyip seçilen parça) ---- */
  var CE = altyaziKur();
  CE.yukle(BELGE, "S1");
  var EK = satirKur(CE, TC_IDS);
  var rE = kopyaSonucu("S1", "S1", KESIM, { newSeq: "", selected: 2 });
  rE.esleme.eksik = true; rE.esleme.kesimler[1] = { start: 8, end: 10, kesildi: false };
  var bE = EK.eylem.kesimSonrasi(rE, { removeMode: "ripple", kaynak: "S1", ranges: KESIM, kelimeler: [w("Merhaba", 1, 1.5)], dil: "tr" });
  ok("kısmen uygulanan kesim: kaydedilir (eksik) ama satır, uyarla ve aktar yok", bE && bE.plan.eksik === true && CE.kayitlar()[0].eksik === true &&
    EK.el("tc-altyazi").hidden === true && bE.kelimeler === null && CE.kurguDurumu("S1").neden === "eksik" && CE.kurguyaUyarla("S1").neden === "eksik" &&
    js(CE.segs()) === js(BELGE), js(CE.kurguDurumu("S1")));
  EK.eylem.kesimSonrasi(kopyaSonucu("S1", "S1", [{ start: 20, end: 21 }], { newSeq: "" }), { removeMode: "ripple", kaynak: "S1", ranges: [{ start: 20, end: 21 }] });
  ok("sonraki tam kesimde de önceki eksik kesimden geçen yol uygulanmaz", CE.kurguDurumu("S1").neden === "eksik" && EK.el("tc-altyazi").hidden === true);
  ok("removed 0 (hiçbir şey silinmedi): kayıt yok", EK.eylem.kesimSonrasi(kopyaSonucu("S1", "S1", KESIM, { newSeq: "", removed: 0 }), { removeMode: "ripple", kaynak: "S1", ranges: KESIM }) === null &&
    CE.kayitlar().length === 2);

  /* ---- 9) inceleme: 40'tan eski kesim kaydı (yer tutucu) ---- */
  var CK = altyaziKur();
  CK.yukle([{ start: 40, end: 41, text: "Sonda" }], "A");
  CK.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("A", "A", [{ start: 5, end: 15 }], { newSeq: "" }), { removeMode: "ripple" }));
  for (var kn = 0; kn < 40; kn++) CK.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("B" + kn, "B" + kn, [{ start: 1, end: 2 }], { newSeq: "" }), { removeMode: "ripple" }));
  CK.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("A", "A", [{ start: 30, end: 31 }], { newSeq: "" }), { removeMode: "ripple" }));
  var tamKayit = CK.kayitlar().filter(function (k) { return !k.atildi; }).length;
  ok("40'tan eski kayıt silinmez, kesimleri atılmış yer tutucuya iner (tam kayıt 40)", tamKayit === 40 && CK.kayitlar().length === 42 && CK.kayitlar()[0].atildi === true &&
    CK.kayitlar()[0].cuts.length === 0 && CK.kayitlar()[0].kaynak === "A", tamKayit + " / " + CK.kayitlar().length);
  ok("yolu yer tutucudan geçen belge: eksik zincir uygulanmaz (40 → 39 değil), belge değişmez",
    CK.kurguDurumu("A").neden === "eksik" && CK.kurguyaUyarla("A").neden === "eksik" && CK.segs()[0].start === 40, js(CK.kurguDurumu("A")));
  CK.belgeBagla("A", 1, null);   // belge ilk kesimden SONRA oluşmuş olsaydı: yalnız son kesim
  ok("yer tutucudan sonra oluşan belge etkilenmez", CK.kurguDurumu("A").ok === true && CK.kurguyaUyarla("A").ok && CK.segs()[0].start === 39, js(CK.segs()));
  var CK2 = altyaziKur();
  CK2.yukle([{ start: 40, end: 41, text: "Sonda" }], "A");
  CK2.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("A", "A", [{ start: 5, end: 15 }], { newSeq: "" }), { removeMode: "ripple" }));
  for (var kn2 = 0; kn2 < 1000; kn2++) CK2.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("B", "B", [{ start: 1, end: 2 }], { newSeq: "" }), { removeMode: "ripple" }));
  CK2.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("A", "A", [{ start: 30, end: 31 }], { newSeq: "" }), { removeMode: "ripple" }));
  ok("yer tutucular da 1000'i aşınca en eskisi unutulur: daha eski belgeye uyarlama yine önerilmez", CK2.kayitlar().length === 1000 && CK2.kurguDurumu("A").neden === "eksik",
    CK2.kayitlar().length + " " + js(CK2.kurguDurumu("A")));

  /* ---- 10) inceleme: birikimli (kc) belge ---- */
  var CC = altyaziKur();
  var kcBelge = CT.karaokeCumulative([w("Merhaba", 0, 0.5), w("ııı", 0.6, 1.2), w("ben", 1.3, 1.6), w("Samet", 1.7, 2.1)], 4);
  CC.yukle(kcBelge, "S1");
  CC.modAyarla("kc");
  CC.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("S1", "S1", [{ start: 0.55, end: 1.25 }], { newSeq: "" }), { removeMode: "ripple" }));
  var rC = CC.kurguyaUyarla("S1");
  ok("birikimli belge: kesilen dolgu sonraki birikimli satırlardan da çıkar ('kesilen konuşmanın satırları çıkar')",
    rC.ok && js(CC.segs().map(function (x) { return x.text; })) === js(["Merhaba", "Merhaba ben", "Merhaba ben Samet"]) && rC.dusen === 1, js(CC.segs()));
  var C1 = altyaziKur();
  C1.yukle([{ start: 0.5, end: 0.9, text: "Merhaba" }, { start: 1.0, end: 1.6, text: "ııı" }, { start: 2.1, end: 2.5, text: "ben" }], "S1");
  C1.modAyarla("k1");
  C1.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("S1", "S1", [{ start: 1.25, end: 2.0 }], { newSeq: "" }), { removeMode: "ripple" }));
  C1.kurguyaUyarla("S1");
  ok("kelime kelime belge: ORTASI kesimde kalan kelime cue'su düşer", js(C1.segs().map(function (x) { return x.text; })) === js(["Merhaba", "ben"]), js(C1.segs()));

  /* ---- 11) inceleme: yeni belgenin kesim sırası sesin alındığı anda ---- */
  var goGovde = govde("async function go(");
  var exIdx = goGovde.indexOf('await K.call("KS_exportAudio"'), scIdx = goGovde.indexOf('await K.call("KS_getSelectedClips")');
  var bagIdx = goGovde.indexOf("belgeBagla(isSekansId, isSira, null)");
  var sonraEx = goGovde.indexOf("isSira = kesimSayac", exIdx), sonraSc = goGovde.indexOf("isSira = kesimSayac", scIdx);
  ok("go(): kesim sırası KS_exportAudio ve KS_getSelectedClips döndükten SONRA okunur (sırada bekleyen KS_applyCuts'ın kaydı dahil), belge ona bağlanır",
    exIdx > 0 && scIdx > 0 && sonraEx > exIdx && sonraEx < bagIdx && sonraSc > scIdx && sonraSc < exIdx &&
    goGovde.slice(exIdx + 5, sonraEx).indexOf("await ") === -1 &&
    goGovde.slice(scIdx + 5, sonraSc).indexOf("await ") === -1, [exIdx, sonraEx, scIdx, sonraSc, bagIdx].join(" "));

  /* ---- 12) inceleme: Shorts belgesi kopyaya uyarlanınca ana videonun taslağı ezilmez ---- */
  // gerçek writeDraft / shortsKaydiGuncelle; sahte K: ayarlar (shortsAltyazi) ve ana taslak (saveDraft / clearDraft)
  function shortsOrtami(kayitlar) {
    var ayar = { shortsAltyazi: kayitlar };
    var z = { ayar: ayar, taslak: [], temizle: 0, ayarKaydi: 0 };
    z.K = { settings: function () { return ayar; }, saveSettings: function () { z.ayarKaydi++; },
      saveDraft: function (d) { z.taslak.push(d); }, clearDraft: function () { z.temizle++; } };
    return z;
  }
  function bas(x) { return (x || []).map(function (s) { return [s.text, s.start]; }); }
  var anaKayit = { ad: "An 1", start: 30, end: 60, mod: "plain", ceviriDili: "", dil: "tr", segs: WWM.kelimesizKopya(BELGE), ts: 1 };
  var ZS = shortsOrtami({ SHORTS1: JSON.parse(JSON.stringify(anaKayit)) });
  var CS = altyaziKur({ K: ZS.K });
  CS.yukle(BELGE, "SHORTS1");
  CS.shorts("SHORTS1");   // "Bu Shorts'un altyazısını ana videodan al"
  CS.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("SHORTS1", "SHORTS1-kopya", KESIM), { removeMode: "ripple" }));
  var rS = CS.kurguyaUyarla("SHORTS1-kopya");
  var kopyaKaydi = ZS.ayar.shortsAltyazi["SHORTS1-kopya"];
  ok("Shorts belgesi kopyaya uyarlanınca ana videonun taslağı yazılmaz / silinmez (K.saveDraft yok)",
    rS.ok && CS.kayit.taslak === 1 && ZS.taslak.length === 0 && ZS.temizle === 0, js({ r: rS, taslak: ZS.taslak.length, temizle: ZS.temizle }));
  ok("kopyanın kendi Shorts kaydı açılır, uyarlanan satırlar oraya yazılır (kelimesiz), belge ona bağlı kalır",
    CS.shorts() === "SHORTS1-kopya" && kopyaKaydi && kopyaKaydi.ad === "An 1" && js(bas(kopyaKaydi.segs)) === js(bas(CS.segs())) &&
    kopyaKaydi.segs[0].text === "Merhaba arkadaşlar," && kopyaKaydi.segs[0].words === undefined && ZS.ayarKaydi > 0,
    js({ shorts: CS.shorts(), kayit: kopyaKaydi }));
  ok("özgün Shorts'un kaydı (kesilmemiş kurgusu) değişmez",
    js(ZS.ayar.shortsAltyazi.SHORTS1.segs) === js(WWM.kelimesizKopya(BELGE)), js(bas(ZS.ayar.shortsAltyazi.SHORTS1.segs)));
  CS.undo();
  ok("geri al: belge yine özgün Shorts'un, taslak onun kaydına yazılır; ana taslak yine yazılmaz",
    CS.shorts() === "SHORTS1" && js(CS.segs()) === js(BELGE) && ZS.taslak.length === 0 && ZS.temizle === 0 &&
    js(ZS.ayar.shortsAltyazi.SHORTS1.segs) === js(WWM.kelimesizKopya(BELGE)), js({ shorts: CS.shorts(), taslak: ZS.taslak.length }));
  // aynı Shorts sekansında (Bu sekansta) kesim: kayıt kendisi güncellenir
  var ZY = shortsOrtami({ SHORTS1: JSON.parse(JSON.stringify(anaKayit)) });
  var CY = altyaziKur({ K: ZY.K });
  CY.yukle(BELGE, "SHORTS1");
  CY.shorts("SHORTS1");
  CY.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("SHORTS1", "SHORTS1", KESIM, { newSeq: "" }), { removeMode: "ripple" }));
  CY.kurguyaUyarla("SHORTS1");
  ok("Bu sekansta kesilen Shorts: kendi kaydı uyarlanır, yeni kayıt açılmaz, ana taslak yazılmaz",
    CY.shorts() === "SHORTS1" && Object.keys(ZY.ayar.shortsAltyazi).length === 1 && ZY.ayar.shortsAltyazi.SHORTS1.segs[0].text === "Merhaba arkadaşlar," &&
    ZY.taslak.length === 0, js(Object.keys(ZY.ayar.shortsAltyazi)));
  // özgün Shorts kaydı artık yoksa (30 kayıt sınırı) kopya için yine kayıt açılır; en çok 30 kayıt tutulur
  var dolu = {};
  for (var sk = 0; sk < 30; sk++) dolu["ESKI" + sk] = { ad: "", mod: "plain", segs: [], ts: 10 + sk };
  var ZE = shortsOrtami(dolu);
  var CE2 = altyaziKur({ K: ZE.K });
  CE2.yukle(BELGE, "SHORTS9");
  CE2.shorts("SHORTS9");
  CE2.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("SHORTS9", "SHORTS9-kopya", KESIM), { removeMode: "ripple" }));
  CE2.kurguyaUyarla("SHORTS9-kopya");
  ok("özgün kayıt yoksa da kopyanın kaydı açılır (en çok 30 kayıt, en eskisi düşer), ana taslak yazılmaz",
    CE2.shorts() === "SHORTS9-kopya" && ZE.ayar.shortsAltyazi["SHORTS9-kopya"] && ZE.ayar.shortsAltyazi["SHORTS9-kopya"].segs.length === 3 &&
    Object.keys(ZE.ayar.shortsAltyazi).length === 30 && !ZE.ayar.shortsAltyazi.ESKI0 && ZE.taslak.length === 0,
    Object.keys(ZE.ayar.shortsAltyazi).length + " " + js(ZE.taslak));
  // ana videonun belgesi kopyaya uyarlanınca taslak eskisi gibi ana taslağa yazılır
  var ZN = shortsOrtami({});
  var CN = altyaziKur({ K: ZN.K });
  CN.yukle(BELGE, "S1");
  CN.kesimKaydet(E.uyarlamaPlani(kopyaSonucu("S1", "S1-kopya", KESIM), { removeMode: "ripple" }));
  CN.kurguyaUyarla("S1-kopya");
  ok("ana videonun belgesi: uyarlanan satırlar ana taslağa (kopyanın sekansıyla), Shorts kaydı açılmaz",
    ZN.taslak.length === 1 && ZN.taslak[0].sekansId === "S1-kopya" && ZN.taslak[0].segments[0].text === "Merhaba arkadaşlar," &&
    Object.keys(ZN.ayar.shortsAltyazi).length === 0, js(ZN.taslak.map(function (d) { return d.sekansId; })));

  /* ---- 6) kaynakta ---- */
  ok("index.html: kesim-esle.js captions.js'ten, kesim-altyazi.js magiccut.js ve konusma-kes.js'ten önce; satırlar varsayılan gizli",
    html.indexOf('src="js/caption-layout.js"') < html.indexOf('src="js/kesim-esle.js"') && html.indexOf('src="js/caption-text.js"') < html.indexOf('src="js/kesim-esle.js"') &&
    html.indexOf('src="js/kesim-esle.js"') < html.indexOf('src="js/captions.js"') && html.indexOf('src="js/kesim-altyazi.js"') < html.indexOf('src="js/magiccut.js"') &&
    html.indexOf('src="js/kesim-altyazi.js"') < html.indexOf('src="js/konusma-kes.js"') &&
    /<div id="cut-altyazi" class="kesim-altyazi" hidden>/.test(html) && /<div id="tc-altyazi" class="kesim-altyazi" hidden>/.test(html));
  var mc = fs.readFileSync(path.join(KOK, "js", "magiccut.js"), "utf8"), kk = fs.readFileSync(path.join(KOK, "js", "konusma-kes.js"), "utf8");
  ok("magiccut / konusma-kes: KS_applyCuts esleme raporunu ister, eylem kapısız (ücretsiz)",
    /cloneFirst: hedef === "clone", esleme: true \}/.test(mc) && /cloneFirst: hedef === "clone", esleme: true \}/.test(kk) &&
    !/Pro\.gate/.test(fs.readFileSync(path.join(KOK, "js", "kesim-altyazi.js"), "utf8")) && !/Pro\.gate/.test(BLOK));
  var I = require(path.join(KOK, "js", "i18n.js"));
  I.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  ok("English (beta): satır, bildirim ve Uygula uyarısı çevrilir",
    I.translate("Altyazı yeni kurguya uyarlandı: 4 satır · kesilen 1 satır çıkarıldı · 2 satır kısaldı") === "Captions adapted to the new edit: 4 lines · 1 cut lines removed · 2 lines shortened" &&
    I.translate("Altyazı sekmesindeki 3 satır kesimden önceki kurguya göre.") === "The 3 lines in the Captions tab still follow the edit from before the cut." &&
    I.translate("Altyazıyı yeni kurguya uyarla") === "Adapt captions to the new edit" && I.translate("Altyazıya aktar") === "Send to captions" &&
    I.translate("12 satır · yeni kurguya uyarlandı") === "12 lines · adapted to the new edit" &&
    I.translate("Bu altyazı \"Vlog — Suflo Temiz\" sekansının kurgusuna göre uyarlandı. Önce o sekansı aç, sonra uygula.") ===
      "These captions were adapted to the edit of the \"Vlog — Suflo Temiz\" sequence. Open that sequence first, then apply." &&
    I.translate("Bu altyazı \"Röportaj — Suflo Temiz\" sekansının kurgusuna göre uyarlandı. Önce o sekansı aç, sonra uygula.") ===
      "These captions were adapted to the edit of the \"Röportaj — Suflo Temiz\" sequence. Open that sequence first, then apply." &&
    I.translate("Yine de uyarla") === "Adapt anyway" &&
    I.translate("Kesim Premiere'de geri alınmış; altyazı zaten bu kurguya göre.") === "The cut was undone in Premiere; the captions already follow this edit.",
    I.translate("Altyazı yeni kurguya uyarlandı: 4 satır · kesilen 1 satır çıkarıldı · 2 satır kısaldı"));
  ok("English (beta): 'Yine de aktar' (Altyazıya aktar uyarısı) ve satır kurucunun reddi çevrilir",
    I.translate("Yine de aktar") === "Send anyway" && I.translate("Altyazı satırları kurulamadı.") === "Couldn't build the caption lines." &&
    /^The engine couldn't provide word timings/.test(I.translate("Motor kelime zamanlarını veremedi (tüm kelimeler aynı anda). Ayarlar > Destek'ten günlüğü kopyalayıp bildir; şimdilik satır modunu kullan.")),
    I.translate("Yine de aktar"));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack || e)); process.exit(1); });
