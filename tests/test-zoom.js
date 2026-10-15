/* Otomatik Zoom — plan uretici testleri (saf mantik, Premiere gerekmez) */
var Z = require("../js/zoom.js");

var gecti = 0, kaldi = 0;
function chk(ad, kosul, detay) {
  if (kosul) { gecti++; console.log("  ok  " + ad); }
  else { kaldi++; console.error("  FAIL " + ad + (detay !== undefined ? "  ->  " + JSON.stringify(detay) : "")); }
}

/* ---- segment cikarimi ---- */
var segs = Z.segmentler([{ start: 5, end: 7 }, { start: 12, end: 14 }], 20);
chk("sessizliklerin tersi konusma segmentleri", segs.length === 3 &&
  segs[0].start === 0 && segs[0].end === 5 && segs[2].start === 14 && segs[2].end === 20, segs);

chk("sessizlik yoksa tek tam segment", (function () {
  var s = Z.segmentler([], 30);
  return s.length === 1 && s[0].start === 0 && s[0].end === 30;
})());

chk("orten/sirasiz sessizlikler birlesir", (function () {
  var s = Z.segmentler([{ start: 10, end: 12 }, { start: 3, end: 6 }, { start: 5, end: 8 }], 20);
  return s.length === 3 && Math.abs(s[1].start - 8) < 0.001 && Math.abs(s[1].end - 10) < 0.001;
})());

/* ---- AutoCut tarzi akilli karar noktasi ---- */
var akilli = Z.akilliNoktalar({
  dur: 24,
  offset: 100,
  interval: 5,
  cues: [
    { start: 100.2, end: 101.2, text: "Bugün edit hızını konuşuyoruz." },
    { start: 103.1, end: 104.0, text: "Ama asıl fark burada!" },
    { start: 108.6, end: 109.4, text: "İkinci adım çok önemli." },
    { start: 115.2, end: 116.0, text: "ŞİMDİ SONUCA BAK!" }
  ]
});
chk("akilli mod klip baslangicini sifira esler", akilli.length && akilli[0].time === 0, akilli);
chk("akilli mod cumle donusu ve vurguyu yakalar", akilli.some(function (p) {
  return p.time > 2.5 && p.time < 3.5 && (p.reason === "turn" || p.reason === "emphasis");
}) && akilli.some(function (p) { return p.time > 14.5 && p.time < 15.8; }), akilli);
chk("akilli noktalar timeline suresini asmaz", akilli.every(function (p) { return p.time >= 0 && p.time < 23.88; }), akilli);

var akilliPlan = Z.plan({ dur: 24, points: akilli, mode: "smart", intensity: .12, speed: .45 });
chk("yeterli cumle verisinde smart mod korunur", akilliPlan.mode === "smart" && akilliPlan.toggles >= 3, akilliPlan);

var ritimDoldur = Z.akilliNoktalar({ dur: 32, interval: 5, cues: [] });
chk("altyazi yoksa uzun plani kontrollu ritimle doldurur",
  ritimDoldur.length >= 4 && ritimDoldur.every(function (p, i) { return i === 0 || p.time - ritimDoldur[i - 1].time >= 4.9; }), ritimDoldur);

/* ---- konusma modu plani ---- */
var p = Z.plan({
  dur: 60,
  segments: [{ start: 0, end: 8 }, { start: 10, end: 22 }, { start: 25, end: 40 }, { start: 43, end: 60 }],
  intensity: 0.12, speed: 0.45, mode: "speech"
});
chk("konusma modunda kalir", p.mode === "speech", p.mode);
chk("4 segment -> 4 toggle", p.toggles === 4, p.toggles);
chk("ilk anahtar t=0", p.keys[0].time === 0, p.keys[0]);
chk("degerler carpan araliginda (1 .. 1+I*1.02)", p.keys.every(function (k) {
  return k.value >= 0.99 && k.value <= 1.12 * 1.02 + 0.001;
}), p.keys.map(function (k) { return k.value; }));
chk("zaman siralamasi artan", p.keys.every(function (k, i) {
  return i === 0 || k.time > p.keys[i - 1].time;
}));
chk("hicbir anahtar sureyi asmaz", p.keys.every(function (k) { return k.time <= 60; }));
var son = p.keys[p.keys.length - 1].value;
chk("4 toggle sonrasi durum baz (cift sayi)", Math.abs(son - 1) < 0.001, son);

/* ---- titreme korumasi ---- */
var sik = Z.plan({
  dur: 20,
  segments: [{ start: 0, end: 0.7 }, { start: 0.8, end: 1.5 }, { start: 1.6, end: 2.5 }, { start: 9, end: 20 }],
  intensity: 0.12, speed: 0.45, mode: "speech"
});
chk("minGap: cok yakin toggle elenir (0.8 duser, 1.6 kalir)", sik.toggles === 3, sik.toggles);

/* ---- ritmik moda dusus ---- */
var tek = Z.plan({ dur: 30, segments: [{ start: 0, end: 30 }], intensity: 0.12, speed: 0.45, mode: "speech", interval: 5 });
chk("tek segment -> ritmik moda duser", tek.mode === "rhythm", tek.mode);
chk("ritmik: ~30/5 toggle", tek.toggles >= 5 && tek.toggles <= 6, tek.toggles);

/* ---- asiri icerik guvenligi ---- */
var cok = [];
for (var i = 0; i < 500; i++) cok.push({ start: i * 4, end: i * 4 + 3 });
var buyuk = Z.plan({ dur: 2000, segments: cok, intensity: 0.12, speed: 0.45, mode: "speech" });
chk("500 segmentte toggle <= 120", buyuk.toggles <= 120, buyuk.toggles);
chk("anahtar sayisi makul (<= 400)", buyuk.keys.length <= 400, buyuk.keys.length);

/* ---- girdi dogrulama ---- */
var uc = Z.plan({ dur: 10, segments: [], intensity: 99, speed: -5, mode: "speech", interval: 0.1 });
chk("asiri parametreler kelepcelenir (I tavan .30 + overshoot payi)", uc.keys.every(function (k) { return k.value <= 1.30 * 1.012 + 0.001 && k.value >= 0.99; }));

/* ---- stiller (AutoCut: Yumusak / Jump Cut / Snap-In) ---- */
var segTest = [{ start: 0, end: 6 }, { start: 8, end: 16 }, { start: 18, end: 30 }];
var yum = Z.plan({ dur: 30, segments: segTest, style: "smooth", mode: "speech" });
chk("yumusak stil: 3-anahtarli gecis (overshoot)", yum.style === "smooth" && yum.keys.length > yum.toggles * 2, yum.keys.length);

var jc = Z.plan({ dur: 30, segments: segTest, style: "jumpcut", mode: "speech" });
chk("jumpcut: stil dogru", jc.style === "jumpcut");
chk("jumpcut: yumusaktan az anahtar (sert kesme)", jc.keys.length < yum.keys.length, { jc: jc.keys.length, yum: yum.keys.length });
chk("jumpcut: art arda anahtarlar cok yakin (~kesme)", (function () {
  for (var i = 1; i < jc.keys.length; i++) {
    if (jc.keys[i].value !== jc.keys[i - 1].value && (jc.keys[i].time - jc.keys[i - 1].time) < 0.08) return true;
  }
  return false;
})());

var sn = Z.plan({ dur: 30, segments: segTest, style: "snapin", mode: "speech" });
chk("snapin: stil dogru", sn.style === "snapin");
chk("snapin: kademeli (yumusaktan cok anahtar)", sn.keys.length >= yum.keys.length, { sn: sn.keys.length, yum: yum.keys.length });

chk("bilinmeyen stil -> smooth", Z.plan({ dur: 20, segments: segTest, style: "zzz", mode: "speech" }).style === "smooth");
chk("tum stillerde deger araligi korunur", [yum, jc, sn].every(function (pl) {
  return pl.keys.every(function (k) { return k.value >= 0.99 && k.value <= 1.31; });
}));

/* ---- 3.4 adım 12: özel eğri (ease) ---- */
var ALTIN = require("./fixtures/egri-otomatik-3.4.json");
var segAltin = [{ start: 0, end: 6 }, { start: 8, end: 16 }, { start: 18, end: 30 }, { start: 31, end: 40 }];
var altinFark = [];
["smooth", "jumpcut", "snapin"].forEach(function (st) {
  ["speech", "rhythm"].forEach(function (m) {
    var o = { dur: 40, segments: segAltin, intensity: 0.12, speed: 0.45, mode: m, interval: 5, style: st };
    var b = JSON.stringify(ALTIN.zoom[st + "|" + m]);
    if (JSON.stringify(Z.plan(o)) !== b) altinFark.push(st + "|" + m);
    o.ease = "auto"; o.fps = 30;
    if (JSON.stringify(Z.plan(o)) !== b) altinFark.push(st + "|" + m + "|auto");
  });
  var sm = { dur: 24, points: [{ time: 0 }, { time: 3.1 }, { time: 8.6 }, { time: 15.2 }], mode: "smart", intensity: 0.18, speed: 0.6, style: st };
  if (JSON.stringify(Z.plan(sm)) !== JSON.stringify(ALTIN.zoom[st + "|smart"])) altinFark.push(st + "|smart");
});
chk("eğri 'auto' (ya da yok): zoom planı 3.4 adım 12 öncesiyle bayt bayt aynı (3 stil × 3 mod)", altinFark.length === 0, altinFark);
var eSmooth = Z.plan({ dur: 40, segments: segAltin, intensity: 0.12, speed: 0.45, mode: "speech", style: "smooth", ease: "yumusak-giris-cikis", fps: 25 });
chk("ease gidiş dönüş: plan kanonik eğriyi ve yoğun bayrağını taşır", eSmooth.ease === "yumusak-giris-cikis" && eSmooth.dense === true && eSmooth.mode === "speech" &&
  Z.plan({ dur: 20, segments: segAltin, mode: "speech", ease: "CUBIC-BEZIER(0.3, 0, 0.2, 1)", fps: 25 }).ease === "cubic-bezier(0.3, 0, 0.2, 1)", { ease: eSmooth.ease, dense: eSmooth.dense });
var capalar = eSmooth.keys.filter(function (k) { return k.a; });
chk("özel eğri: Yumuşak stilin küçük taşması yazılmaz (çapalar yalnız 1 ve 1,12); ivmeyi eğri verir", capalar.every(function (k) { return k.value === 1 || Math.abs(k.value - 1.12) < 1e-9; }) &&
  eSmooth.seyrek === 7 && capalar.length === 7, capalar);
chk("özel eğri: zamanlar kesin artan, iç anahtarlar kare zamanında, değerler 1..1,12 arasında", eSmooth.keys.every(function (k, i) {
  return (i === 0 || k.time > eSmooth.keys[i - 1].time) && (k.a || Math.abs(k.time * 25 - Math.round(k.time * 25)) < 1e-6) && k.value >= 1 - 1e-9 && k.value <= 1.12 + 1e-9;
}) && eSmooth.keys.length === 7 + 3 * 10, eSmooth.keys.length);   // 3 geçiş × (0,45 sn · 25 kare: 10 iç anahtar)
var eJump = Z.plan({ dur: 40, segments: segAltin, intensity: 0.12, speed: 0.45, mode: "speech", style: "jumpcut", ease: "ziplama", fps: 25 });
chk("Jump Cut: sert kesme eğrisizdir (plan 'auto' ile aynı, yoğun değil)", JSON.stringify(eJump) === JSON.stringify(ALTIN.zoom["jumpcut|speech"]), eJump.dense);
var eSnap = Z.plan({ dur: 40, segments: segAltin, intensity: 0.12, speed: 0.45, mode: "speech", style: "snapin", ease: "yumusak", fps: 25 });
chk("Snap-In: aynı yönlü kademeler tek parça olur (çapa: başlangıç ve hedef)", eSnap.dense && eSnap.keys.filter(function (k) { return k.a; }).length === 7, eSnap.keys.filter(function (k) { return k.a; }));
var hata12 = false; try { Z.plan({ dur: 10, ease: "dalga" }); } catch (eH) { hata12 = /Geçersiz eğri/.test(eH.message); }
chk("geçersiz eğri hata verir (panel sessizce otomatiğe düşmez)", hata12);

/* ---- 3.4 adım 12: KS_autoZoom yoğun yazım (sahte Premiere) ---- */
var PMz = require("./_kayit-premiere.js").olustur({ fps: 25 });
var interpZ = [];
PMz.FakeProp.prototype.setInterpolationTypeAtKey = function (t, tur) { interpZ.push(tur); };
var Zy = PMz.klip({ ad: "Konusma.mp4", nodeId: "ZY", start: 0, end: 40, inP: 0 });
PMz.izKur([[Zy]]);
PMz.durum.secim = [Zy];
var zr = PMz.cagir("KS_autoZoom", { keys: eSmooth.keys, anchor: [0.5, 0.2], clearStart: 0, clearEnd: 40, dense: true });
chk("KS_autoZoom yoğun: tüm anahtarlar yazıldı (Ölçek ve sabit nokta Konum'u), Bezier (5) yok, hepsi doğrusal (0)", zr.ok && zr.yogun === true &&
  Zy.olcek.keys.length === eSmooth.keys.length && Zy.konum.keys.length === eSmooth.keys.length && interpZ.length === 2 * eSmooth.keys.length &&
  interpZ.every(function (t) { return t === 0; }), { n: Zy.olcek.keys.length, interp: interpZ.slice(0, 4) });
var zrec = zr.records || [];
chk("KS_autoZoom yoğun: kayıtlar (Ölçek + Konum) tüm zamanları taşır", zrec.length === 2 && zrec.every(function (r) { return r.tur === "zoom" && r.times.length === eSmooth.keys.length; }) &&
  zr.yazilan === 2 * eSmooth.keys.length, zrec.map(function (r) { return r.times.length; }));
interpZ.length = 0;
var zo = PMz.cagir("KS_autoZoom", { keys: Z.plan({ dur: 40, segments: segAltin, mode: "speech" }).keys, anchor: [0.5, 0.5], clearStart: 0, clearEnd: 40 });
chk("KS_autoZoom 'auto': eskisi gibi Bezier (5); cevapta yogun yok", zo.ok && zo.yogun === undefined && interpZ.length > 0 && interpZ.every(function (t) { return t === 5; }), interpZ.slice(0, 4));

/* ---- 3.4 adım 11: Zoom'u kaldır kayıt tabanlı (uçtan uca: js/zoom.js + js/kayit-kaldir.js + host.jsx sahte Premiere) ---- */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..");
var PM = require("./_kayit-premiere.js").olustur();
var Zk = PM.klip({ ad: "Konusma.mp4", nodeId: "Z1", start: 0, end: 10, inP: 0 });
var Yk = PM.klip({ ad: "Eski.mp4", nodeId: "Y1", start: 10, end: 20, inP: 0 });
PM.izKur([[Zk, Yk]]);

function panelKur() {
  var dinleyici = {}, toastlar = [], sorular = [], cevap = { onay: false };
  function oge(id, deger) {
    return { id: id, value: deger, hidden: false, disabled: false, className: "", textContent: "",
      classList: { toggle: function () {}, add: function () {}, remove: function () {} },
      addEventListener: function (tur, fn) { dinleyici[id + ":" + tur] = fn; } };
  }
  var ogeler = { "tab-zoom": oge("tab-zoom"), "zoom-run": oge("zoom-run"), "zoom-remove": oge("zoom-remove"), "zoom-status": oge("zoom-status"),
    "zoom-progress": oge("zoom-progress"), "zoom-aralik": oge("zoom-aralik", "5"), "zoom-yogunluk": oge("zoom-yogunluk", "12"), "zoom-hiz": oge("zoom-hiz", "0.45") };
  function metinDugumu(s) { return { textContent: String(s) }; }
  var depoVeri = {};
  var ls = { getItem: function (k) { return Object.prototype.hasOwnProperty.call(depoVeri, k) ? depoVeri[k] : null; },
    setItem: function (k, v) { depoVeri[k] = String(v); }, removeItem: function (k) { delete depoVeri[k]; },
    key: function (i) { return Object.keys(depoVeri)[i]; } };
  Object.defineProperty(ls, "length", { get: function () { return Object.keys(depoVeri).length; } });
  var secili = { clip: null };
  var ctx = {
    document: {
      getElementById: function (id) { return ogeler[id] || null; },
      querySelector: function (s) {
        if (s === "#zoom-mode .on") return { dataset: { m: "rhythm" } };
        if (s === "#zoom-stil .on") return { dataset: { s: "smooth" } };
        if (s === "#zoom-nokta .on") return { dataset: { a: "0.5,0.5" } };
        return null;
      },
      querySelectorAll: function () { return []; },
      createElement: function () {
        return { cocuk: [], appendChild: function (c) { this.cocuk.push(c); return c; },
          get textContent() { return this.cocuk.map(function (c) { return c.textContent; }).join(""); } };
      },
      createTextNode: metinDugumu
    },
    localStorage: ls,
    confirm: function (s) { sorular.push(s); return cevap.onay; },
    K: { call: function (fn, arg) { return PM.kcall(fn, arg); }, log: function () {} },
    KApp: { ctx: function () { return { sel: secili.clip }; }, toast: function (m, tur, sure, eylem) { toastlar.push({ m: m && m.textContent !== undefined ? m.textContent : m, tur: tur, eylem: eylem }); } },
    console: console, Promise: Promise, setTimeout: setTimeout, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, isFinite: isFinite, isNaN: isNaN, Error: Error, RegExp: RegExp
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ["key-records.js", "kayit-kaldir.js", "zoom.js"].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), ctx, { filename: "js/" + f });
  });
  ctx.KZoom.init();
  return { ctx: ctx, dinleyici: dinleyici, toastlar: toastlar, sorular: sorular, cevap: cevap, secili: secili, depoVeri: depoVeri };
}
function selOf(c) { return { name: c.name, clipStart: c.start.seconds, clipEnd: c.end.seconds, inPoint: c.inPoint.seconds, outPoint: c.outPoint.seconds, mediaPath: "x" }; }

(async function () {
  var P = panelKur();
  chk("panel açılışında Premiere çağrısı yok (yalnız tıklamada)", PM.ui.length === 0 && P.toastlar.length === 0);

  // Zoom uygula (ritmik mod): kayıtlar saklanır, bildirimde kapısız Geri al
  PM.durum.secim = [Zk]; P.secili.clip = selOf(Zk);
  await P.dinleyici["zoom-run:click"]();
  var uyg = P.toastlar[P.toastlar.length - 1];
  var depo = P.ctx.SufloKeyRecords.depo(P.ctx.localStorage);
  var kayitlar = depo.oku("C:\\proje\\kayit.prproj");
  chk("uygula: zoom anahtarları yazıldı, kayıtlar (Ölçek + Konum) proje deposunda", Zk.olcek.keys.length === 4 && kayitlar.length === 2 &&
    kayitlar.every(function (r) { return r.tur === "zoom" && r.nodeId === "Z1"; }), { keys: Zk.olcek.tl(Zk), kayitlar: kayitlar.length });
  chk("uygula: bildirimde Geri al eylemi", uyg && uyg.eylem && uyg.eylem.metin === "Geri al" && typeof uyg.eylem.fn === "function", uyg);

  // Kullanıcı kendi Ölçek anahtarını ekler; Zoom'u kaldır onu korur (eski kaldir() klibin tüm Ölçek anahtarlarını silerdi)
  Zk.olcek.elle(Zk, 8, 130);
  await P.dinleyici["zoom-remove:click"]();
  var son = P.toastlar[P.toastlar.length - 1];
  chk("kaldır: kullanıcının Ölçek anahtarı (8 sn · 130) duruyor; Suflo'nun 4 anahtarı gitti", Zk.olcek.keys.some(function (k) { return k.v === 130; }) &&
    JSON.stringify(Zk.olcek.tl(Zk)) === JSON.stringify([0, 8]) && Zk.olcek.keys[0].v === 100, Zk.olcek.keys);
  chk("kaldır: Konum anahtarsız ve eski değerinde", Zk.konum.keys.length === 0 && JSON.stringify(Zk.konum.value) === "[0.5,0.5]", Zk.konum);
  chk("kaldır: kayıt varken onay sorulmadı; bildirim sonucu söyler; kayıtlar depodan düştü", P.sorular.length === 0 && /Zoom kaldırıldı: 6 anahtar kare silindi\./.test(son.m) &&
    depo.oku("C:\\proje\\kayit.prproj").length === 0, son);

  // Kaydı olmayan (eski sürümde uygulanmış) zoom: eski yöntem yalnız onayla
  PM.durum.secim = [Yk]; P.secili.clip = selOf(Yk);
  PM.cagir("KS_autoZoom", { keys: [{ time: 10, value: 1.1 }, { time: 12, value: 1 }, { time: 15, value: 1.1 }], clearStart: 10, clearEnd: 20 });
  Yk.olcek.elle(Yk, 18, 125);
  var yOnce = Yk.olcek.keys.length;
  P.cevap.onay = false;
  await P.dinleyici["zoom-remove:click"]();
  chk("kayıt yoksa onay sorulur (eski yöntem uyarısıyla); vazgeçince hiçbir şey silinmez", P.sorular.length === 1 && /zoom kaydı yok/.test(P.sorular[0]) &&
    /TÜM Ölçek anahtar kareleri/.test(P.sorular[0]) && Yk.olcek.keys.length === yOnce && /Hiçbir şey silinmedi/.test(P.toastlar[P.toastlar.length - 1].m), P.sorular);
  P.cevap.onay = true;
  await P.dinleyici["zoom-remove:click"]();
  chk("onaylanınca bugünkü davranış: klibin tüm Ölçek anahtarları (kullanıcınınki dahil) temizlenir, iki düz anahtar kalır", P.sorular.length === 2 &&
    Yk.olcek.keys.length === 2 && Yk.olcek.keys[0].v === Yk.olcek.keys[1].v && !Yk.olcek.keys.some(function (k) { return k.v === 125; }) && /Zoom anahtarları temizlendi/.test(P.toastlar[P.toastlar.length - 1].m), Yk.olcek.keys);

  // Başka klibin kaydı varken seçili klibin kaydı yok: yine onay (Z'nin zoom'una dokunulmaz)
  PM.durum.secim = [Zk]; P.secili.clip = selOf(Zk);
  await P.dinleyici["zoom-run:click"]();
  var zAnahtar = Zk.olcek.keys.length;
  PM.durum.secim = [Yk]; P.secili.clip = selOf(Yk);
  P.cevap.onay = false;
  await P.dinleyici["zoom-remove:click"]();
  chk("seçili klibin kaydı yoksa (başka klibin var) onay sorulur, öbür klibin zoom'u yerinde", P.sorular.length === 3 && Zk.olcek.keys.length === zAnahtar, P.sorular.length);

  // Bildirimdeki Geri al: yalnız o uygulamanın anahtarları, seçimden bağımsız
  var uyg2 = P.toastlar.filter(function (t) { return t.eylem; }).pop();
  await uyg2.eylem.fn();
  await new Promise(function (r) { setTimeout(r, 5); });
  chk("bildirimdeki Geri al: seçim başka klipteyken bile yalnız o uygulamayı kaldırır, onay sormaz (yeniden uygulama klibi temizlemişti: anahtarsız, 100)", P.sorular.length === 3 &&
    Zk.olcek.keys.length === 0 && Zk.olcek.value === 100 && Yk.olcek.keys.length === 2, Zk.olcek.keys);

  // Yeniden uygulama: ikinci zoom birincinin (ilk anahtarı yakınlaşmış) anahtarlarını temizleyip üstüne yazar; kaldırınca
  // ölçek zoom'dan önceki değere (100) döner — ikinci kaydın okuduğu "önceki değer" eski zoom'un izini taşısa da
  PM.durum.secim = [Zk]; P.secili.clip = selOf(Zk);
  await P.dinleyici["zoom-run:click"]();
  await P.dinleyici["zoom-run:click"]();
  var sakli = P.ctx.SufloKeyRecords.depo(P.ctx.localStorage).oku("C:\\proje\\kayit.prproj").filter(function (r) { return r.tur === "zoom"; });
  chk("yeniden uygulama: yalnız son uygulamanın kayıtları kalır (Ölçek + Konum)", sakli.length === 2, sakli.length);
  await P.dinleyici["zoom-remove:click"]();
  chk("yeniden uygulamadan sonra kaldır: Ölçek anahtarsız ve 100 (yakınlaşmış 112'de kalmaz)", Zk.olcek.keys.length === 0 && Math.abs(Zk.olcek.value - 100) < 1e-9 &&
    Zk.olcek.tv === false, Zk.olcek);

  // Çok klip seçili: biri kayıtlı (Z), biri kaydı olmayan eski zoom (Y): Z kaldırılır, Y sessizce atlanmaz (uyarı), onay sorulmaz
  PM.durum.secim = [Zk]; P.secili.clip = selOf(Zk);
  await P.dinleyici["zoom-run:click"]();
  PM.durum.secim = [Yk];
  PM.cagir("KS_autoZoom", { keys: [{ time: 10, value: 1.1 }, { time: 12, value: 1 }, { time: 15, value: 1.1 }], clearStart: 10, clearEnd: 20 });
  var yAnahtar = Yk.olcek.keys.length, soruSayisi = P.sorular.length;
  PM.durum.secim = [Zk, Yk]; P.secili.clip = selOf(Zk);
  await P.dinleyici["zoom-remove:click"]();
  var karisik = P.toastlar[P.toastlar.length - 1];
  chk("karışık seçim: kayıtlı klibin zoom'u kalktı, kaydı olmayan klip için uyarı (warn), onay sorulmadı, Y'ye dokunulmadı",
    Zk.olcek.keys.length === 0 && Yk.olcek.keys.length === yAnahtar && P.sorular.length === soruSayisi && karisik.tur === "warn" &&
    /1 seçili klipte Suflo'nun kaydı yok; onlara dokunulmadı/.test(karisik.m), karisik);

  // Seçim yokken
  P.secili.clip = null;
  await P.dinleyici["zoom-remove:click"]();
  chk("seçim yokken uyarı, Premiere'e gidilmez", /Önce timeline'da bir klip seç/.test(P.ctx.document.getElementById("zoom-status").textContent));

  console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
  if (kaldi) process.exit(1);
})().catch(function (e) { console.error(e); process.exit(1); });
