// Suflo testi: Tek Tık Shorts Paketi panel akışı (js/shorts-paket.js, sahte K / Premiere / render):
// Devam et işin kendi transkriptini kullanır ve kaynak sekansa yeni aramayı bağlamaz, zaman aşımından
// sonra aynı Short ikinci kez oluşmaz, hazırlıkta İptal geçerli, yarım iş sorulmadan silinmez, miras
// altyazı 9:16'da kapatılıp yenisi konur, atlanacak katmanlar baştan söylenir, boş CTA reddedilir,
// çiplerde durum renksiz de okunur
var fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var KOK = path.join(__dirname, "..");
function mod(ad) { return require(path.join(KOK, "js", ad)); }
var HL = mod("highlights.js");
var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-paket-devam-"));

/* ---------------- sahte DOM ---------------- */
var DOM = {}, dinleyici = {};
function Elem(tag, id) {
  this.tagName = tag; this.id = id || ""; this.childNodes = []; this.hidden = false; this.disabled = false; this.attrs = {};
  this.value = ""; this.checked = false; this.textContent = ""; this.className = ""; this.title = ""; this.open = true;
}
Elem.prototype.appendChild = function (c) { this.childNodes.push(c); return c; };
Elem.prototype.setAttribute = function (a, v) { this.attrs[a] = String(v); };
Elem.prototype.addEventListener = function (ad, fn) { dinleyici[this.id + ":" + ad] = fn; };
Object.defineProperty(Elem.prototype, "innerHTML", { set: function () { this.childNodes = []; }, get: function () { return ""; } });
function elem(id, ozellik) { var e = new Elem("div", id); for (var k in ozellik || {}) e[k] = ozellik[k]; DOM[id] = e; return e; }
function domKur() {
  DOM = {};
  ["cap-paket", "cap-paket-olustur", "cap-paket-iptal", "cap-paket-devam", "cap-paket-klasor", "cap-paket-durum", "cap-paket-liste",
    "cap-paket-mogrt-not", "cap-paket-logo-not"].forEach(function (id) { elem(id); });
  elem("cap-paket-stil", { value: "" });
  [["cap-paket-altyazi", true], ["cap-paket-kanca", true], ["cap-paket-ilerleme", true], ["cap-paket-cta", true], ["cap-paket-logo", false],
    ["cap-paket-metin", true], ["cap-paket-kredi", false]].forEach(function (x) { elem(x[0], { checked: x[1] }); });
  elem("cap-paket-ilerleme-konum", { value: "ust" }); elem("cap-paket-ilerleme-stil", { value: "ince" }); elem("cap-paket-ilerleme-renk", { value: "#8b7cf6" });
  elem("cap-paket-cta-metin", { value: "takip" }); elem("cap-paket-cta-ozel", { value: "" });
  elem("kanca-stil", { value: "kutu" }); elem("kanca-sure", { value: "3" });
}
domKur();

/* ---------------- sahte Premiere ---------------- */
var S = {};   // senaryo durumu
function sifirla(o) {
  S = { aktif: "ana", cagrilar: [], sekanslar: { ana: { w: 1920, h: 1080, end: 120, ad: "Ana" } }, makeNo: 0,
    zamanAsimi: {}, aramaAsimi: false, miras: false, probeGecikme: 0, toastlar: [], kaydedilen: [], baglanan: [], ekle: [] };
  for (var k in o || {}) S[k] = o[k];
  ayarlar = {};
}
var ayarlar = {};
function cagri(fn, arg) {
  S.cagrilar.push({ fn: fn, arg: arg ? JSON.parse(JSON.stringify(arg)) : arg });
  if (fn === "KS_apiProbe") return { ok: true, autoReframe: true, subsequence: true };
  if (fn === "KS_makeShorts") {
    S.makeNo++;
    var r = arg.ranges[0], uzun = r.end - r.start, n = S.makeNo;
    S.sekanslar["alt" + n] = { w: 1920, h: 1080, end: uzun, ad: r.name };
    S.sekanslar["dik" + n] = { w: 1080, h: 1920, end: uzun, ad: r.name + " 9x16" };
    // Auto Reframe 600 sn'yi aştı: sekanslar yine oluşur, panel zaman aşımı görür
    if (S.zamanAsimi[r.name]) { delete S.zamanAsimi[r.name]; if (S.aramaAsimi) S.kuyruk = 1; return { ok: false, error: "Premiere yanıt vermedi (zaman aşımı)." }; }
    return { ok: true, made: 1, vertical: 1, items: [{ name: r.name, id: "alt" + n, dikeyId: "dik" + n, dikey: true }], errors: [] };
  }
  if (fn === "KS_findSequenceByName") {
    // kuyrukta Auto Reframe'in arkasında bekleyen arama da zaman aşımına uğrar
    if (S.kuyruk > 0) { S.kuyruk--; return { ok: false, error: "Premiere yanıt vermedi (zaman aşımı)." }; }
    var ids = Object.keys(S.sekanslar).filter(function (id) { return S.sekanslar[id].ad === arg.name && (arg.haric || []).indexOf(id) === -1; });
    return { ok: true, id: ids.length ? ids[ids.length - 1] : "", name: arg.name, count: ids.length, ids: ids };
  }
  if (fn === "KS_openSequenceById") {
    var s = S.sekanslar[arg.id];
    if (!s) return { ok: false, error: "Sekans projede bulunamadi (silinmis olabilir)." };
    S.aktif = arg.id;
    return { ok: true, id: arg.id, name: s.ad, width: s.w, height: s.h, end: s.end, fps: 30, paket: [] };
  }
  if (fn === "KS_sequenceSufloLayers") return { ok: true, altyazi: S.miras ? 1 : 0, kanca: 0, paket: 0, toplam: S.miras ? 1 : 0 };
  if (fn === "KS_disableSufloCaptions") return { ok: true, altyazi: 1, kapatilan: S.mirasKapanmaz ? 0 : 1 };
  if (fn === "KS_placeOverlay") return arg.expectSeqId === S.aktif ? { ok: true, trackName: "V3" } : { ok: false, error: "Etkin sekans degisti" };
  if (fn === "KS_projectDir") return { ok: true, dir: kok };
  return { ok: false, error: "bilinmeyen " + fn };
}

var K = {
  nodeOK: true, MAC: false, fs: fs, path: path, log: function () {},
  settings: function () { return ayarlar; }, saveSettings: function () {},
  srtDir: function () { return kok; }, extensionPath: function () { return KOK; },
  findFfmpeg: function () { return Promise.resolve("ffmpeg"); }, libassUyarisi: function () { return S.libassYok ? "libass yok" : ""; },
  hataYardimi: function (e) { return e && e.message ? e.message : String(e); },
  run: function () { return Promise.resolve({ code: 0 }); },
  call: function (fn, arg) {
    var gecikme = fn === "KS_apiProbe" ? S.probeGecikme : 1;
    return new Promise(function (r) { setTimeout(function () { r(cagri(fn, arg)); }, gecikme); });
  }
};
var KAYNAK_A = [{ start: 4, end: 7, text: "A videosu birinci satır" }, { start: 30, end: 33, text: "A videosu ikinci an" }];
var KAYNAK_B = [{ start: 4, end: 7, text: "B videosu başka konuşma" }, { start: 30, end: 33, text: "B videosu başka an" }];
var onay = [];
var ctx = {
  confirm: function (m) { onay.push(m); return !!S.onayla; },
  document: { getElementById: function (id) { return DOM[id] || null; }, createElement: function (t) { return new Elem(t); } },
  K: K, Pro: { gate: function () { return true; } },
  KApp: { toast: function (m, c) { S.toastlar.push({ m: m, c: c, cagri: S.cagrilar.length }); }, ctx: function () { return { sequence: "Ana" }; }, davetAni: function () {} },
  decodeURI: decodeURI, Date: Date, Math: Math, String: String, Number: Number, Object: Object, Promise: Promise, Error: Error, isFinite: isFinite,
  JSON: JSON, setTimeout: setTimeout, Array: Array, RegExp: RegExp, console: console
};
ctx.window = ctx;
var w = ctx;
w.SufloStyleShare = mod("style-share.js"); w.SufloMarkaKiti = mod("marka-kiti.js"); w.SufloStyleEngine = mod("style-engine.js");
w.SufloCaptionText = mod("caption-text.js"); w.SufloYouTubeMeta = mod("youtube-meta.js"); w.SufloHookTitle = mod("hook-title.js");
w.SufloShortsEkler = mod("shorts-ekler.js"); w.SufloShortsPlan = mod("shorts-paket-plan.js");
w.SufloOverlayRender = { render: function () { return Promise.resolve({}); } };
w.KKanca = { ekle: function (o) { S.ekle.push(o); return Promise.resolve({ ok: true }); } };
w.KCaptions = {
  language: function () { return "tr"; }, chatConfig: function () { return null; }, rawSegments: function () { return S.yuklu || []; },
  stilAyarlari: function () { return { aile: "viral" }; }, mogrtSecili: function () { return false; }
};
w.KViral = {
  paketAnlari: function () {
    return [
      { id: 1, start: 3, end: 15, title: "Birinci", reason: "r", score: 80, hooks: ["Kanca bir"], kancaNo: 0, paketSec: true },
      { id: 2, start: 29, end: 41, title: "İkinci", reason: "r", score: 70, hooks: ["Kanca iki"], kancaNo: 0, paketSec: true }
    ];
  },
  sekansDenetle: function () { return Promise.resolve({ sekans: "ana", uyari: "" }); },
  kaynakSegs: function () { return S.arama ? JSON.parse(JSON.stringify(S.arama)) : null; },
  // viral.js shortsKaydet ile aynı: verilen transkript (yoksa arama, yoksa yüklü) dilimlenir
  shortsKaydet: function (items, an, segs) {
    var kaynak = segs || S.arama || S.yuklu || [];
    S.kaydedilen.push({ an: an.title, metin: kaynak.map(function (x) { return x.text; }).join(" | ") });
    var kes = HL.sliceSegments(kaynak, an.start, an.end);
    if (!kes.length) return;
    ayarlar.shortsAltyazi = ayarlar.shortsAltyazi || {};
    items.forEach(function (it) { var kayit = { ad: an.title, mod: "plain", segs: kes, ts: Date.now() }; if (it.id) ayarlar.shortsAltyazi[it.id] = kayit; if (it.dikeyId) ayarlar.shortsAltyazi[it.dikeyId] = kayit; });
  },
  sekansiBagla: function (sekans, nesil) { S.baglanan.push({ sekans: sekans, nesil: nesil, simdiki: S.nesil }); },
  nesil: function () { return S.nesil; },
  tur: function () { return ""; }, mesgul: function () { return false; }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(KOK, "js", "shorts-paket.js"), "utf8"), ctx);
w.KShortsPaket.init();

function adlar(liste) { return liste.map(function (c) { return c.fn; }); }
function tikla(id) { return dinleyici[id + ":click"](); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  /* 1) zaman aşımı + aramanın da zaman aşımı → Devam et: aynı Short ikinci kez yapılmaz, altyazı işin transkriptinden */
  sifirla({ arama: KAYNAK_A, nesil: 1, zamanAsimi: { "Shorts 2 · İkinci": true }, aramaAsimi: true });
  await tikla("cap-paket-olustur");
  var j = ayarlar.shortsPaketIs;
  ok("zaman aşımı + arama zaman aşımı: Short 2'nin sekansı hata, Devam et görünür", j.kisalar[1].adimlar.sekans === "hata" && DOM["cap-paket-devam"].hidden === false,
    JSON.stringify(j.kisalar[1].adimlar));
  ok("ilk denemeden önce aynı adlı sekanslar not edildi (iş kaydında)", j.kisalar[1].sekansOnce && j.kisalar[1].sekansOnce.yat.length === 0 && j.kisalar[0].sekansOnce);
  ok("olustur: kaynak sekans paketin başladığı aramanın nesliyle bağlanır", S.baglanan.length >= 1 && S.baglanan.every(function (b) { return b.sekans === "ana" && b.nesil === 1; }),
    JSON.stringify(S.baglanan));
  ok("iş her Short'un kaynak transkriptini taşır", j.kisalar[0].kaynakSegs.length === 1 && /A videosu/.test(j.kisalar[0].kaynakSegs[0].text));

  // kullanıcı B videosunda yeni arama yaptı (yeni nesil) ve B'nin transkripti yüklü
  S.arama = KAYNAK_B; S.yuklu = KAYNAK_B; S.nesil = 2; S.aramaAsimi = false;
  S.baglanan = []; S.kaydedilen = [];
  var once = S.cagrilar.length, makeOnce = S.makeNo;
  await tikla("cap-paket-devam");
  var yeni = S.cagrilar.slice(once);
  ok("Devam et: KS_makeShorts yeniden çağrılmaz, oluşmuş sekans adıyla geri alınır", S.makeNo === makeOnce && adlar(yeni).indexOf("KS_makeShorts") === -1 &&
    ayarlar.shortsPaketIs.kisalar[1].seqId === "alt2" && ayarlar.shortsPaketIs.kisalar[1].dikeyId === "dik2", adlar(yeni).join(" | "));
  ok("Devam et: altyazı kaydı A'nın transkriptinden (B değil)", S.kaydedilen.length === 1 && /A videosu ikinci an/.test(S.kaydedilen[0].metin) && !/B videosu/.test(S.kaydedilen[0].metin),
    JSON.stringify(S.kaydedilen));
  ok("Devam et: yeni aramaya kaynak sekans bağlanmaz", S.baglanan.length === 0, JSON.stringify(S.baglanan));
  ok("Devam et sonrası paket bitti, Short 2 altyazısı kondu", ayarlar.shortsPaketIs.durum === "bitti" && ayarlar.shortsPaketIs.kisalar[1].adimlar.altyazi === "tamam",
    JSON.stringify(ayarlar.shortsPaketIs.kisalar[1].adimlar));

  /* 2) eski pakette kaynak transkripti yoksa (kayıtsız iş) yüklü transkripte düşülmez */
  sifirla({ arama: KAYNAK_A, nesil: 5 });
  await tikla("cap-paket-olustur");
  ayarlar.shortsPaketIs.kisalar.forEach(function (k) { delete k.kaynakSegs; k.adimlar = { sekans: "hata", altyazi: "bekliyor", kanca: "bekliyor", cerceve: "bekliyor", metin: "tamam" }; k.hatalar.sekans = "x"; delete k.sekansOnce; k.seqId = ""; k.dikeyId = ""; });
  ayarlar.shortsAltyazi = {};
  S.arama = null; S.yuklu = KAYNAK_B; S.kaydedilen = [];
  w.KShortsPaket.guncelle();
  await tikla("cap-paket-devam");
  ok("kaynak transkripti olmayan eski işte yüklü (başka) transkript kullanılmaz", S.kaydedilen.every(function (x) { return x.metin === ""; }) &&
    ayarlar.shortsPaketIs.kisalar[0].adimlar.altyazi === "hata", JSON.stringify(S.kaydedilen));

  /* 3) hazırlıkta İptal geçerli */
  sifirla({ arama: KAYNAK_A, nesil: 1, probeGecikme: 30 });
  var p3 = tikla("cap-paket-olustur");
  await bekle(5);
  ok("hazırlanırken İptal görünür", DOM["cap-paket-iptal"].hidden === false);
  tikla("cap-paket-iptal");
  await p3;
  ok("hazırlıkta İptal: hiçbir sekans oluşmaz, durum durdurulduğunu söyler", adlar(S.cagrilar).indexOf("KS_makeShorts") === -1 && adlar(S.cagrilar).indexOf("KS_findSequenceByName") === -1 &&
    /durduruldu/.test(DOM["cap-paket-durum"].textContent) && !ayarlar.shortsPaketIs && DOM["cap-paket-olustur"].disabled === false, DOM["cap-paket-durum"].textContent);
  await tikla("cap-paket-olustur");
  ok("İptal'den sonraki paket normal çalışır", ayarlar.shortsPaketIs && ayarlar.shortsPaketIs.durum === "bitti" && S.makeNo === 2);

  /* 4) yarım iş sorulmadan silinmez */
  var yarim = ayarlar.shortsPaketIs;
  yarim.kisalar[0].adimlar.kanca = "hata"; yarim.kisalar[0].hatalar.kanca = "x"; yarim.ts = 111;
  onay = []; S.onayla = false;
  var once4 = S.cagrilar.length;
  await tikla("cap-paket-olustur");
  ok("yarım iş varken yeni paket sorar; hayır denirse iş korunur, Premiere'e dokunulmaz", onay.length === 1 && /Yarım kalan/.test(onay[0]) &&
    ayarlar.shortsPaketIs.ts === 111 && S.cagrilar.length === once4 && /Devam et/.test(DOM["cap-paket-durum"].textContent), DOM["cap-paket-durum"].textContent);
  S.onayla = true;
  await tikla("cap-paket-olustur");
  ok("evet denirse yeni paket başlar", onay.length === 2 && ayarlar.shortsPaketIs.ts !== 111 && ayarlar.shortsPaketIs.durum === "bitti");
  S.onayla = false;

  /* 5) miras altyazı 9:16'da kapatılır, paketin altyazısı konur */
  sifirla({ arama: KAYNAK_A, nesil: 1, miras: true });
  await tikla("cap-paket-olustur");
  var k5 = ayarlar.shortsPaketIs.kisalar[0];
  var yerler = S.cagrilar.filter(function (c) { return c.fn === "KS_placeOverlay"; }).map(function (c) { return c.arg.name; });
  ok("miras altyazı: kapatılır, Short'a 9:16 altyazı konur, not düşülür", k5.adimlar.altyazi === "tamam" && k5.notlar.altyaziMiras === "miras-kapatildi" &&
    adlar(S.cagrilar).indexOf("KS_disableSufloCaptions") !== -1 && yerler.filter(function (n) { return /Altyazı/.test(n); }).length === 2, yerler.join(","));
  sifirla({ arama: KAYNAK_A, nesil: 1, miras: true, mirasKapanmaz: true });
  await tikla("cap-paket-olustur");
  ok("miras altyazı kapatılamazsa çift altyazı olmasın diye atlanır (gerekçe görünür)", ayarlar.shortsPaketIs.kisalar[0].adimlar.altyazi === "atlandi" &&
    ayarlar.shortsPaketIs.kisalar[0].notlar.altyazi === "miras" && DOM["cap-paket-liste"].childNodes[0].childNodes.some(function (n) { return /kaynakta altyazı/.test(n.textContent || ""); }));

  /* 6) libass yok: başta söylenir, sonunda "hazır" denmez; çipler renksiz de okunur */
  sifirla({ arama: KAYNAK_A, nesil: 1, libassYok: true });
  await tikla("cap-paket-olustur");
  var ilk = S.toastlar[0], son = S.toastlar[S.toastlar.length - 1];
  var ilkMake = adlar(S.cagrilar).indexOf("KS_makeShorts");
  ok("atlanacak katmanlar ve uyarılar sekanslardan önce bildirilir", ilk && ilk.c === "warn" && ilk.cagri <= ilkMake && /altyazı, kanca, çerçeve atlanacak: ffmpeg'de altyazı filtresi/.test(ilk.m) &&
    /AI anahtarı yok/.test(ilk.m), ilk && ilk.m);
  ok("sonuç uyarı rengiyle, katmansız Shorts 'tamam' sayılmaz", son.c === "warn" && /0\/2 Short tamam/.test(son.m) && /2 katmansız Short/.test(son.m) &&
    /warn/.test(DOM["cap-paket-durum"].className), son.m);
  var satir = DOM["cap-paket-liste"].childNodes[0];
  var cipler = satir.childNodes[1].childNodes;
  ok("çipler: durum imi metinde, aria-label tam açıklama", cipler[0].textContent === "✓ sekans" && cipler[1].textContent === "– altyazı" &&
    /^altyazı: atlandı: ffmpeg'de altyazı filtresi/.test(cipler[1].attrs["aria-label"]), cipler.map(function (c) { return c.textContent; }).join(","));
  ok("liste: yetenek yüzünden atlanan adımın gerekçesi satırda görünür", satir.childNodes.slice(2).some(function (n) { return /libass/.test(n.textContent) && /hata/.test(n.className); }));

  /* 7) boş kendi CTA metni reddedilir */
  sifirla({ arama: KAYNAK_A, nesil: 1 });
  DOM["cap-paket-cta-metin"].value = "ozel"; DOM["cap-paket-cta-ozel"].value = "   ";
  await tikla("cap-paket-olustur");
  ok("kendi CTA metni boşken paket başlamaz, nedeni söylenir", S.cagrilar.length === 0 && /CTA metnini yaz/.test(DOM["cap-paket-durum"].textContent), DOM["cap-paket-durum"].textContent);
  DOM["cap-paket-cta-metin"].value = "takip";

  try { fs.rmdirSync(kok, { recursive: true }); } catch (e) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack || e)); process.exit(1); });
