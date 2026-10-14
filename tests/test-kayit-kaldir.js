// Suflo testi: js/kayit-kaldir.js (3.4 adım 11) — saf kısım (cakisanlar, ozet, yedekGerekli, mesajParcalari),
// depo + oturum belleği, kaldirma akışı; Geçişler ve Hareket önayarları panelinin uçtan uca kaldırması
// (js/gecisler.js, js/presets.js + host.jsx sahte Premiere: tests/_kayit-premiere.js).
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..");
var KR = require(path.join(ROOT, "js", "key-records.js"));
var SK = require(path.join(ROOT, "js", "kayit-kaldir.js"));
var T = require(path.join(ROOT, "js", "transitions.js"));

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(JSON.stringify(ek)).slice(0, 240) + "]" : ""));
}

/* ---------------- saf kısım ---------------- */
function rec(o) {
  var r = { id: o.id || "r" + Math.random().toString(36).slice(2, 8), tur: o.tur || "gecis", seqId: o.seqId || "s1", nodeId: o.nodeId || "n1",
    matchName: o.matchName || "AE.ADBE Motion/Scale", compIdx: 0, propIdx: 1, times: o.times || [1, 2], kenarDegerleri: [] };
  return KR.kayit(r);
}
var eski = [rec({ id: "a", times: [1, 1.5] }), rec({ id: "b", times: [4, 5] }), rec({ id: "c", times: [1, 2], nodeId: "n2" }),
  rec({ id: "d", times: [1, 2], matchName: "AE.ADBE Opacity/Opacity" }), rec({ id: "e", tur: "egri", times: [1, 2] }), rec({ id: "f", tur: "zoom", times: [0, 10] })];
var yeni = rec({ id: "y", tur: "hareket", times: [1.2, 1.8] });
ok("cakisanlar: aynı klip + özellik, kesişen aralık (araçlar arası da); Eğri kaydı, başka klip / özellik, kesişmeyen aralık kalır",
  SK.cakisanlar(eski, yeni).map(function (r) { return r.id; }).sort().join(",") === "a,f", SK.cakisanlar(eski, yeni).map(function (r) { return r.id; }));
ok("cakisanlar: geçersiz girdi boş", SK.cakisanlar(null, yeni).length === 0 && SK.cakisanlar(eski, null).length === 0);

var o1 = SK.ozet({ eslesen: 3, sonuclar: [{ id: "a", silinen: 3, eklenen: 1 }, { id: "b", silinen: 0, kod: "yok" }], atlanan: [{ id: "c", kod: "degisti" }, { id: "d", kod: "bilinmez" }] });
ok("ozet: biten (silinen + zaten yok), sayılar, kalan kodları (bilinmeyen kod klipYok sayılır)", JSON.stringify(o1.biten) === '["a","b"]' && o1.silinen === 3 &&
  o1.eklenen === 1 && o1.yok === 1 && o1.kalan.degisti === 1 && o1.kalan.klipYok === 1 && o1.kalanSayi === 2 && o1.degistiSayi === 1, o1);
ok("ozet: bozuk cevap boş özet", SK.ozet(null).eslesen === 0 && SK.ozet({ sonuclar: [null, { id: 5 }] }).biten.length === 0);

ok("yedekGerekli: kapsamda kayıt yok → 'yok'", SK.yedekGerekli({ eslesen: 0 }) === "yok" && SK.yedekGerekli({ kayitYok: true, eslesen: 2 }) === "yok" && SK.yedekGerekli(null) === "yok");
ok("yedekGerekli: hepsi 'degisti' ve hiçbir şey silinmedi → 'degisti'", SK.yedekGerekli({ eslesen: 2, silinen: 0, yok: 0, kalanSayi: 2, degistiSayi: 2 }) === "degisti");
ok("yedekGerekli: bir şey silindiyse ya da başka sebeple kaldıysa eski yönteme düşülmez",
  SK.yedekGerekli({ eslesen: 2, silinen: 3, kalanSayi: 1, degistiSayi: 1 }) === false &&
  SK.yedekGerekli({ eslesen: 2, silinen: 0, kalanSayi: 2, degistiSayi: 1 }) === false &&
  SK.yedekGerekli({ eslesen: 1, silinen: 0, yok: 1, kalanSayi: 0, degistiSayi: 0 }) === false);

var m1 = SK.mesajParcalari("zoom", o1);
ok("mesaj: araç başlığı + korunan anahtar notu + kalan nedenleri; uyarı sınıfı", m1.tur === "warn" && m1.parcalar[0] === "Zoom kaldırıldı: 3 anahtar kare silindi." &&
  /kenarlara 1 anahtar kare/.test(m1.parcalar[1]) && m1.parcalar.some(function (p) { return /^1 kaydın anahtar kareleri sonradan değiştirilmiş/.test(p); }), m1);
var m2 = SK.mesajParcalari("gecis", SK.ozet({ eslesen: 2, sonuclar: [{ id: "a", silinen: 0, kod: "yok" }] }));
ok("mesaj: Suflo'nun anahtarları zaten kaldırılmış", m2.parcalar.length === 1 && /zaten kaldırılmış/.test(m2.parcalar[0]), m2);
var m3 = SK.mesajParcalari("hareket", SK.ozet({ eslesen: 1, sonuclar: [{ id: "a", silinen: 2 }] }));
ok("mesaj: temiz başarı 'good'", m3.tur === "good" && m3.parcalar.join("|") === "Önayar kaldırıldı: 2 anahtar kare silindi.", m3);
ok("hataMetni: kodlu hatalar Türkçe (kesimYok, sekansYok), bilinmeyen boş", /kesim yok/.test(SK.hataMetni("kesimYok")) && SK.hataMetni("sekansYok") === "Aktif sekans yok." && SK.hataMetni("x") === "");
ok("i18n: her metin (sayılı kalıplar dahil) i18n/en.js ile İngilizceye çevrilir", (function () {
  var I = require(path.join(ROOT, "js", "i18n.js"));
  I.setDictionary(require(path.join(ROOT, "i18n", "en.js")));
  var hepsi = [].concat(Object.keys(SK.BASARI).map(function (k) { return SK.BASARI[k]("7"); }), Object.keys(SK.KALAN).map(function (k) { return SK.KALAN[k]("2"); }),
    Object.keys(SK.HATALAR).map(function (k) { return SK.HATALAR[k]; }), [SK.kenarMetni("2")]);
  var eksik = hepsi.filter(function (s) { var t = I.translate(s); return t === s || /[çğıöşüÇĞİÖŞÜ]/.test(t); });
  return eksik.length === 0 || console.log(eksik);
})());

/* ---------------- depo + akış (sahte call) ---------------- */
function bellekDepo() {
  var v = {};
  var ls = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : null; }, setItem: function (k, x) { v[k] = String(x); },
    removeItem: function (k) { delete v[k]; }, key: function (i) { return Object.keys(v)[i]; } };
  Object.defineProperty(ls, "length", { get: function () { return Object.keys(v).length; } });
  return ls;
}
(async function () {
  var cagrilar = [];
  var cevaplar = {
    KS_easePeek: { ok: true, seqId: "s1", proje: "C:\\p\\a.prproj" },
    KS_removeSufloKeys: null
  };
  function call(fn, arg) { cagrilar.push({ fn: fn, arg: arg }); return Promise.resolve(typeof cevaplar[fn] === "function" ? cevaplar[fn](arg) : cevaplar[fn]); }
  var depo = KR.depo(bellekDepo());
  var o = SK.olustur({ call: call, depo: depo });
  var s = o.sakla("C:\\p\\a.prproj", [{ tur: "gecis", seqId: "s1", nodeId: "n1", matchName: "AE.ADBE Motion/Scale", compIdx: 0, propIdx: 1, times: [1, 2] },
    { tur: "egri", seqId: "s1", nodeId: "n1", matchName: "x", times: [1, 2] }, { tur: "bozuk" }]);
  ok("sakla: yalnız araç kayıtları (gecis/zoom/hareket) depoya; id'ler döner", s.ok && s.idler.length === 1 && depo.oku("C:\\p\\a.prproj").length === 1, s);
  var s2 = o.sakla("C:\\p\\a.prproj", [{ tur: "gecis", seqId: "s1", nodeId: "n1", matchName: "AE.ADBE Motion/Scale", compIdx: 0, propIdx: 1, times: [1.5, 2.5] }]);
  var kl = o.kayitlar("C:\\p\\a.prproj");
  ok("sakla: aynı pencerenin eski kaydı (araç temizledi) atılır, yenisi kalır", kl.length === 1 && kl[0].id === s2.idler[0], kl);
  cevaplar.KS_removeSufloKeys = function (arg) {
    return { ok: true, eslesen: arg.records.length, sonuclar: arg.records.map(function (r) { return { id: r.id, ok: true, silinen: 2, eklenen: 0, kod: "" }; }), atlanan: [] };
  };
  var oz = await o.kaldir({ tur: "gecis", kesim: { tolerance: 1 } });
  var son = cagrilar[cagrilar.length - 1];
  ok("kaldir: önce taze peek, sonra yalnız bu sekansın gecis kayıtları + kesim kapsamı host'a", cagrilar[cagrilar.length - 2].fn === "KS_easePeek" &&
    son.fn === "KS_removeSufloKeys" && son.arg.records.length === 1 && son.arg.kesim.tolerance === 1 && !son.arg.secili, son.arg);
  ok("kaldir: biten kayıtlar depodan düşer", oz.silinen === 2 && !oz.kayitYok && o.kayitlar("C:\\p\\a.prproj").length === 0, oz);
  var n0 = cagrilar.length;
  var bos = await o.kaldir({ tur: "gecis", kesim: { tolerance: 1 } });
  ok("kaldir: kayıt yoksa kapsamlı çağrı boş listeyle host'a gider (kesim / seçim denetimi), kayitYok", bos.kayitYok === true &&
    cagrilar.length === n0 + 2 && cagrilar[cagrilar.length - 1].arg.records.length === 0, bos);
  var n1 = cagrilar.length;
  var bos2 = await o.kaldir({ tur: "gecis", idler: ["yok"] });
  ok("kaldir: id kapsamında kayıt yoksa host'a kaldırma çağrısı gitmez", bos2.kayitYok === true && cagrilar.length === n1 + 1, bos2);
  cevaplar.KS_removeSufloKeys = { ok: false, kod: "kesimYok", error: "x" };
  o.sakla("C:\\p\\a.prproj", [{ tur: "gecis", seqId: "s1", nodeId: "n1", matchName: "m", compIdx: 0, propIdx: 1, times: [1, 2] }]);
  var hataKod = "";
  try { await o.kaldir({ tur: "gecis", kesim: { tolerance: 1 } }); } catch (e) { hataKod = e.kod + "|" + e.message; }
  ok("kaldir: kodlu host hatası Türkçe metinle fırlar, kayıt saklı kalır", /^kesimYok\|Playhead'in yakınında kesim yok/.test(hataKod) && o.kayitlar("C:\\p\\a.prproj").length === 1, hataKod);
  cevaplar.KS_easePeek = { ok: true, seqId: "", proje: "" };
  try { await o.kaldir({ tur: "gecis" }); hataKod = ""; } catch (e2) { hataKod = e2.kod; }
  ok("kaldir: sekans yoksa 'sekansYok'", hataKod === "sekansYok", hataKod);
  cevaplar.KS_easePeek = { ok: true, seqId: "s1", proje: "C:\\p\\a.prproj" };

  // depo yazılamazsa oturum belleği
  var kirik = { getItem: function () { return null; }, setItem: function () { var e = new Error("x"); e.name = "SecurityError"; throw e; }, removeItem: function () {} };
  var o2 = SK.olustur({ call: call, depo: KR.depo(kirik) });
  var sb = o2.sakla("P", [{ tur: "zoom", seqId: "s1", nodeId: "n9", matchName: "m", compIdx: 0, propIdx: 1, times: [0, 3] }]);
  ok("depo yazılamazsa kayıt bu oturumun belleğinde kalır (ok false, Geri al yine çalışır)", sb.ok === false && sb.idler.length === 1 &&
    o2.kayitlar("P", { tur: "zoom" }).length === 1, sb);
  cevaplar.KS_removeSufloKeys = function (arg) { return { ok: true, eslesen: 1, sonuclar: [{ id: arg.records[0].id, silinen: 1 }], atlanan: [] }; };
  await o2.kaldir({ tur: "zoom", idler: sb.idler, proje: "P" });
  ok("bellekteki kayıt kaldırılınca bellekten de düşer", o2.kayitlar("P").length === 0);

  // akis: eski yöntem yalnız onayla (host: seçili bir klip var, kapsamda kayıt yok)
  cevaplar.KS_removeSufloKeys = function (arg) {
    return { ok: true, eslesen: arg.records.length, sonuclar: arg.records.map(function (r) { return { id: r.id, silinen: 1 }; }), atlanan: [], secim: 1 };
  };
  var o3 = SK.olustur({ call: call, depo: KR.depo(bellekDepo()) });
  var soru = [], yedekCalisti = 0;
  var a1 = await o3.akis({ tur: "zoom", kapsam: { secili: true }, onay: function (q) { soru.push(q); return false; }, yedekMetni: { yok: "Y?", degisti: "D?" },
    yedek: function () { yedekCalisti++; return Promise.resolve({ parcalar: ["eski"], tur: "good" }); } });
  ok("akis: kayıt yok → onay sorulur; hayır → hiçbir şey silinmez, eski yöntem çalışmaz", a1.iptal && soru.join() === "Y?" && !yedekCalisti && /Hiçbir şey silinmedi/.test(a1.parcalar[0]), a1);
  var a2 = await o3.akis({ tur: "zoom", kapsam: { secili: true }, onay: function () { return true; }, yedekMetni: { yok: "Y?" },
    yedek: function () { yedekCalisti++; return Promise.resolve({ parcalar: ["eski"], tur: "good" }); } });
  ok("akis: evet → eski yöntem", a2.yedek && yedekCalisti === 1 && a2.parcalar[0] === "eski", a2);
  var a3 = await o3.akis({ tur: "hareket", kapsam: { secili: true }, kayitYokMetni: "Kayıt yok." });
  ok("akis: eski yöntemi olmayan araçta kayıt yoksa yalnız bilgi", !a3.yedek && a3.parcalar[0] === "Kayıt yok." && a3.tur === "warn", a3);
  o3.sakla("C:\\p\\a.prproj", [{ tur: "zoom", seqId: "s1", nodeId: "n1", matchName: "m", compIdx: 0, propIdx: 1, times: [0, 3] }]);
  cevaplar.KS_removeSufloKeys = { ok: true, eslesen: 0, sonuclar: [], atlanan: [], secim: 0 };
  var a4 = await o3.akis({ tur: "zoom", kapsam: { secili: true }, onay: function () { throw new Error("sorulmamalı"); }, yedekMetni: { yok: "Y?" }, yedek: function () {} });
  ok("akis: seçili kapsamda hiç klip seçili değilse 'Önce klip seç' (onay sorulmaz)", /Önce timeline'da bir klip seç/.test(a4.parcalar[0]), a4);

  await uctanUca();
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });

/* ---------------- uçtan uca: Geçişler ve Hareket önayarları paneli ---------------- */
async function uctanUca() {
  var PM = require("./_kayit-premiere.js").olustur();
  var A = PM.klip({ ad: "A.mp4", nodeId: "A", start: 0, end: 5, inP: 0 });
  var B = PM.klip({ ad: "B.mp4", nodeId: "B", start: 5, end: 10, inP: 0 });
  PM.izKur([[A, B]]);
  var dinleyici = {}, toastlar = [], sorular = [], cevap = { onay: false };
  function oge(id, deger) {
    return { id: id, value: deger, hidden: false, disabled: false, className: "", textContent: "", innerHTML: "", dataset: {},
      classList: { toggle: function () {}, add: function () {}, remove: function () {} }, setAttribute: function () {}, getAttribute: function () { return null; },
      appendChild: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      addEventListener: function (tur, fn) { dinleyici[id + ":" + tur] = fn; } };
  }
  var ogeler = {};
  ["gecis-grid", "gecis-status", "gecis-kaldir", "gecis-sayac", "tab-presets", "preset-kaldir"].forEach(function (id) { ogeler[id] = oge(id); });
  ogeler["gecis-sure"] = oge("gecis-sure", "0.6");
  ogeler["gecis-guc"] = oge("gecis-guc", "1");
  var v = {};
  var ls = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(v, k) ? v[k] : null; }, setItem: function (k, x) { v[k] = String(x); }, removeItem: function (k) { delete v[k]; } };
  var kartlar = [];
  var ctx = {
    document: {
      getElementById: function (id) { return ogeler[id] || null; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      createElement: function () {
        var e = oge("dinamik");
        e.cocuk = [];
        e.appendChild = function (c) { this.cocuk.push(c); return c; };
        Object.defineProperty(e, "textContent", { get: function () { return this.cocuk.map(function (c) { return c.textContent; }).join("") || this._t || ""; },
          set: function (x) { this._t = x; } });
        kartlar.push(e);
        return e;
      },
      createTextNode: function (s) { return { textContent: String(s) }; }
    },
    localStorage: ls,
    confirm: function (s) { sorular.push(s); return cevap.onay; },
    K: { call: function (fn, arg) { return PM.kcall(fn, arg); }, settings: function () { return {}; }, saveSettings: function () {}, log: function () {}, nodeOK: false },
    KApp: { ctx: function () { return {}; }, onTab: function () {}, toast: function (m, tur, sure, eylem) { toastlar.push({ m: m && m.cocuk ? m.textContent : m, tur: tur, eylem: eylem }); } },
    console: console, Promise: Promise, setTimeout: function (f) { return 0; }, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, isNaN: isNaN, Error: Error, RegExp: RegExp
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["key-records.js", "kayit-kaldir.js", "transitions.js", "gecisler.js", "preset-pack.js", "presets.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), ctx, { filename: "js/" + f });
  });
  ctx.KGecis.init();
  ctx.KPresets.init();
  ok("uçtan uca: init'te Premiere çağrısı yok, kaldırma düğmeleri bağlı", PM.ui.length === 0 && typeof dinleyici["gecis-kaldir:click"] === "function" &&
    typeof dinleyici["preset-kaldir:click"] === "function");

  // Geçiş: kartın Uygula düğmesi (Pro tanımsız: kapı yok) → kayıt; Geçişi kaldır → kayıtla
  PM.durum.playhead = 5;
  // Kartların dinleyicisi tek "dinamik" anahtarında üst üste yazılır: son kart (Yumuşak Geçiş / cross) uygulanır
  await dinleyici["dinamik:click"]();
  ok("Geçiş uygulandı (cross): iki klibin Opaklığına anahtar, bildirimde Geri al", A.opak.keys.length === 2 && B.opak.keys.length === 2 &&
    toastlar.some(function (t) { return t.eylem && t.eylem.metin === "Geri al"; }), toastlar.map(function (t) { return t.m; }));
  B.opak.elle(B, 7, 50);   // kullanıcının pencere dışı anahtarı
  await dinleyici["gecis-kaldir:click"]();
  var son = toastlar[toastlar.length - 1];
  ok("Geçişi kaldır: kayıtla kaldırıldı, onay sorulmadı, A anahtarsız 100; B'de kullanıcının anahtarı (+ kenar) kaldı",
    sorular.length === 0 && /Geçiş kaldırıldı: 4 anahtar kare silindi\./.test(son.m) && A.opak.keys.length === 0 && A.opak.value === 100 &&
    B.opak.keys.some(function (k) { return k.v === 50; }), { m: son.m, b: B.opak.keys });
  // Kaydı olmayan geçiş: eski yöntem yalnız onayla
  B.opak.keys = []; B.opak.tv = false; B.opak.value = 100;
  PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6 }), tolerance: 1 });
  cevap.onay = false;
  await dinleyici["gecis-kaldir:click"]();
  ok("kaydı olmayan geçiş: onay sorulur, vazgeçince anahtarlar kalır", sorular.length === 1 && /geçiş kaydı yok/.test(sorular[0]) && A.opak.keys.length === 2 && B.opak.keys.length === 2, sorular);
  cevap.onay = true;
  await dinleyici["gecis-kaldir:click"]();
  ok("onaylanınca eski yöntem: pencere temizlenir, anahtarsız Opaklık 100", sorular.length === 2 && A.opak.keys.length === 0 && B.opak.keys.length === 0 &&
    B.opak.value === 100 && /eski yöntemle temizlendi: 4 anahtar kare/.test(toastlar[toastlar.length - 1].m), toastlar[toastlar.length - 1]);
  PM.durum.playhead = 30;
  await dinleyici["gecis-kaldir:click"]();
  ok("playhead yakınında kesim yoksa onay sorulmadan söylenir", sorular.length === 2 && /kesim yok/i.test(ogeler["gecis-status"].textContent), ogeler["gecis-status"].textContent);

  // Hareket önayarı: kaldırma; kayıt yoksa yalnız bilgi (tahminle silinmez)
  PM.durum.secim = [A];
  var r = await ctx.K.call("KS_applyMotionPreset", { id: "fade-in", duration: 0.45, strength: 1 });
  ctx.SufloKaldir.panel().sakla(r.proje, r.records);
  var soruOnce = sorular.length;
  await dinleyici["preset-kaldir:click"]();
  ok("Önayarı kaldır: seçili klipte Suflo'nun önayarı kaldırıldı, Opaklık 100, onay yok", A.opak.keys.length === 0 && A.opak.value === 100 &&
    sorular.length === soruOnce && /Önayar kaldırıldı: 2 anahtar kare silindi\./.test(toastlar[toastlar.length - 1].m), toastlar[toastlar.length - 1]);
  PM.cagir("KS_applyMotionPreset", { id: "fade-in", duration: 0.45, strength: 1 });   // kaydı saklanmayan (eski) önayar
  await dinleyici["preset-kaldir:click"]();
  ok("kaydı olmayan önayar: onay sorulmaz, hiçbir şey silinmez, nasıl kaldırılacağı söylenir", sorular.length === soruOnce && A.opak.keys.length === 2 &&
    /önayar kaydı yok; hiçbir şey silinmedi/.test(toastlar[toastlar.length - 1].m), toastlar[toastlar.length - 1]);
}
