// Suflo testi: js/key-records.js — anahtar kare kayıtları ve canlılık (3.4 adım 9; Suflo'nun kendi kodu)
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var K = require(path.join(KOK, "js", "key-records.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

// localStorage benzeri: isteğe bağlı kota (karakter) ve bozuk davranış
function sahteDepo(kota) {
  var veri = {}, anahtarlar = [];
  return {
    veri: veri,
    get length() { return anahtarlar.length; },
    key: function (i) { return anahtarlar[i] === undefined ? null : anahtarlar[i]; },
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(veri, k) ? veri[k] : null; },
    setItem: function (k, v) {
      v = String(v);
      if (kota) {
        var boyut = 0;
        Object.keys(veri).forEach(function (x) { if (x !== k) boyut += veri[x].length; });
        if (boyut + v.length > kota) { var e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; }
      }
      if (!Object.prototype.hasOwnProperty.call(veri, k)) anahtarlar.push(k);
      veri[k] = v;
    },
    removeItem: function (k) { if (Object.prototype.hasOwnProperty.call(veri, k)) { delete veri[k]; anahtarlar.splice(anahtarlar.indexOf(k), 1); } }
  };
}

var FPS = 24, KARE = 1 / FPS;
// Eğri: kullanıcının 1,00 sn ve 2,00 sn anahtarları arasına her kareye iç anahtar (23 adet)
function egriKaydi(ek) {
  var times = [];
  for (var k = 25; k < 48; k++) times.push(k / FPS);
  var r = { tur: "egri", seqId: "seq-1", nodeId: "node-7", clipName: "A001.mov", clipStart: 0.5, matchName: "ADBE Opacity",
    compIdx: 0, propIdx: 0, uclar: [1, 2], times: times, kenarDegerleri: [{ t: 1, v: 0 }, { t: 2, v: 100 }], createdAt: 1000 };
  Object.keys(ek || {}).forEach(function (x) { r[x] = ek[x]; });
  return r;
}
function canliZamanlar(rec) { return [rec.uclar[0]].concat(rec.times, [rec.uclar[1]]); }

/* ---------------- kayıt ---------------- */
(function () {
  var r = K.kayit(egriKaydi());
  ok("kayit: alanlar ve türler", r && r.tur === "egri" && r.seqId === "seq-1" && r.nodeId === "node-7" && r.clipName === "A001.mov" && r.clipStart === 0.5 &&
    r.matchName === "ADBE Opacity" && r.compIdx === 0 && r.propIdx === 0 && js(r.uclar) === "[1,2]" && r.times.length === 23 &&
    js(r.kenarDegerleri) === js([{ t: 1, v: 0 }, { t: 2, v: 100 }]) && r.createdAt === 1000 && /^[A-Za-z0-9_-]{1,64}$/.test(r.id), js(r).slice(0, 200));
  ok("kayit: beş tür kabul, bilinmeyen reddedilir", K.TURLER.join(",") === "egri,gecis,zoom,hareket,yaylan" &&
    K.TURLER.every(function (t) { return K.kayit(egriKaydi({ tur: t })) !== null; }) && K.kayit(egriKaydi({ tur: "sil" })) === null);
  ok("kayit: zamansız / geçersiz girdi reddedilir", K.kayit(null) === null && K.kayit("x") === null && K.kayit(egriKaydi({ times: [] })) === null &&
    K.kayit(egriKaydi({ times: [NaN, "1", null] })) === null);
  var k2 = K.kayit(egriKaydi({ times: [2, 1, 1.00001, NaN, 1.5, 1], uclar: [2, 1], compIdx: -3, propIdx: 1.5, clipStart: "x",
    kenarDegerleri: [{ t: 1, v: [960, 540] }, { t: "a", v: 1 }, { t: 2, v: "kırmızı" }, { t: 3, v: [1, 2, 3, 4, 5] }], id: "kotu id!" }));
  ok("kayit: zamanlar sıralı, 0,1 ms'ye yuvarlı ve tekrarsız; ters uçlar null; kötü alanlar temizlenir",
    js(k2.times) === "[1,1.5,2]" && k2.uclar === null && k2.compIdx === -1 && k2.propIdx === -1 && k2.clipStart === null &&
    js(k2.kenarDegerleri) === js([{ t: 1, v: [960, 540] }]) && k2.id !== "kotu id!", js(k2));
  var uzun = K.kayit(egriKaydi({ seqId: new Array(500).join("s"), clipName: new Array(1000).join("ç") }));
  ok("kayit: metin alanları sınırlı", uzun.seqId.length === 128 && uzun.clipName.length === 256);
  var cokZaman = [];
  for (var i = 0; i < 10000; i++) cokZaman.push(i / 60);
  ok("kayit: kayıt başına en çok 4096 zaman", K.kayit(egriKaydi({ times: cokZaman })).times.length === 4096);
})();

/* ---------------- canlılık ---------------- */
(function () {
  var rec = egriKaydi(), canli = canliZamanlar(rec);
  ok("canli: yazıldığı gibi duruyor", K.canli(rec, canli, FPS));
  var ekli = canli.concat([1.5 + 0.3 * KARE, 1.2 + 0.5 * KARE]);
  ok("canli: kullanıcı aralığa kendi anahtarını ekledikten sonra hâlâ canlı", K.canli(rec, ekli, FPS));
  var ay = K.canliAyrinti(rec, ekli, FPS);
  ok("canliAyrinti: silinecekler yalnız Suflo'nun zamanları (kullanıcınınki dışarıda)", ay.zamanlar.length === 23 &&
    ay.zamanlar.indexOf(1.5 + 0.3 * KARE) === -1 && ay.zamanlar.indexOf(1.2 + 0.5 * KARE) === -1 && ay.uclar && ay.oran === 1);
  var ucsuz = canli.filter(function (t) { return t !== 2; });
  ok("canli: dış geri al bir ucu kaldırınca ölü", !K.canli(rec, ucsuz, FPS) && K.canliAyrinti(rec, ucsuz, FPS).uclar === false);
  var icsiz = [1, 2];
  ok("canli: Premiere'de Ctrl+Z pişirmeyi geri alınca (iç anahtarlar yok) ölü", !K.canli(rec, icsiz, FPS) && K.canliAyrinti(rec, icsiz, FPS).eslesen === 0);
  // %60 eşiği: 23 zamanın 14'ü (≥ 13,8) canlı, 13'ü ölü
  var on4 = [1, 2].concat(rec.times.slice(0, 14)), on3 = [1, 2].concat(rec.times.slice(0, 13));
  ok("canli: %60 eşiği (23'te 14 yerinde → canlı, 13 → ölü)", K.canli(rec, on4, FPS) && !K.canli(rec, on3, FPS),
    K.canliAyrinti(rec, on4, FPS).oran + " / " + K.canliAyrinti(rec, on3, FPS).oran);
  var bes = egriKaydi({ times: [1.2, 1.4, 1.6, 1.8, 1.9] });
  ok("canli: tam %60 sınırı canlı sayılır (5'te 3)", K.canli(bes, [1, 1.2, 1.4, 1.6, 2], FPS) && !K.canli(bes, [1, 1.2, 1.4, 2], FPS));
  var kayik = canli.map(function (t) { return t + 0.2 * KARE; });
  var cokKayik = canli.map(function (t) { return t + 0.3 * KARE; });
  ok("canli: tolerans 0,25 kare (0,2 kare kayma eşleşir, 0,3 kare eşleşmez)", K.canli(rec, kayik, FPS) && !K.canli(rec, cokKayik, FPS));
  ok("tolerans: 0,25 / fps; geçersiz fps → 30", Math.abs(K.tolerans(24) - 0.25 / 24) < 1e-15 && Math.abs(K.tolerans(0) - 0.25 / 30) < 1e-15 &&
    Math.abs(K.tolerans("x") - 0.25 / 30) < 1e-15);
  var karisik = canli.slice().reverse().concat([NaN, "a", null]);
  ok("canli: sırasız ve bozuk canlı zaman listesi", K.canli(rec, karisik, FPS) && !K.canli(rec, null, FPS) && !K.canli(null, canli, FPS));
  var ucsuzKayit = egriKaydi({ uclar: null, tur: "zoom", times: [3, 3.5, 4] });
  ok("canli: uçsuz kayıtta uçlar times'ın ilk ve sonu", K.canli(ucsuzKayit, [3, 3.5, 4], FPS) && !K.canli(ucsuzKayit, [3.5, 4], FPS) &&
    !K.canli(ucsuzKayit, [3, 3.5], FPS));
  // birleştirme yürüyüşü: her canlı zaman yalnız bir kayıtla eşleşir
  var e = K.eslestir([1, 1.001, 1.002], [1.001], 0.01);
  ok("eslestir: bire bir eşleşme", e.sayi === 1 && js(e.zamanlar) === "[1.001]");
})();

/* ---------------- yardımcılar ---------------- */
(function () {
  var liste = [K.kayit(egriKaydi({ id: "a" })), K.kayit(egriKaydi({ id: "b", tur: "zoom" })), K.kayit(egriKaydi({ id: "c", seqId: "seq-2" }))];
  ok("filtrele: tür / sekans / klip", js(K.filtrele(liste, { tur: "egri" }).map(function (r) { return r.id; })) === js(["a", "c"]) &&
    js(K.filtrele(liste, { seqId: "seq-2" }).map(function (r) { return r.id; })) === js(["c"]) && K.filtrele(liste, { nodeId: "yok" }).length === 0 &&
    K.filtrele(null).length === 0);
  var zamanli = [{ id: "x", createdAt: 5 }, { id: "y", createdAt: 1 }, { id: "z", createdAt: 9 }];
  ok("enYeniler: en yeni N, sıra korunur", js(K.enYeniler(zamanli, 2).map(function (r) { return r.id; })) === js(["x", "z"]));
  ok("depoAnahtari: proje başına, yol biçimine duyarsız, yolu açık tutmaz", K.depoAnahtari("C:\\Projeler\\Video.prproj") === K.depoAnahtari("c:/projeler/video.prproj") &&
    K.depoAnahtari("a.prproj") !== K.depoAnahtari("b.prproj") && K.depoAnahtari("C:\\Gizli\\Müşteri.prproj").indexOf("Gizli") === -1 &&
    K.depoAnahtari("").indexOf(K.ONEK) === 0 && K.depoAnahtari(null) === K.depoAnahtari(""));
})();

/* ---------------- depo ---------------- */
(function () {
  var ls = sahteDepo(), saat = 100;
  var D = K.depo(ls, { simdi: function () { return saat++; } });
  var P1 = "C:\\Projeler\\Bir.prproj", P2 = "/Users/a/İki.prproj";
  ok("depo: boş projede boş liste", js(D.oku(P1)) === "[]" && D.toplam() === 0);
  var s = D.ekle(P1, egriKaydi({ id: "r1" }));
  ok("depo: ekle ve oku (proje başına anahtar)", s.ok && s.eklenen === 1 && D.oku(P1).length === 1 && D.oku(P1)[0].id === "r1" && D.oku(P2).length === 0 &&
    ls.getItem(K.depoAnahtari(P1)) !== null);
  D.ekle(P1, [egriKaydi({ id: "r2" }), egriKaydi({ id: "r1", clipName: "yeni" })]);
  var l = D.oku(P1);
  ok("depo: aynı id yenisiyle değişir", l.length === 2 && l.filter(function (r) { return r.id === "r1"; })[0].clipName === "yeni");
  var k = D.kaldir(P1, "r2");
  ok("depo: kaldir", k.ok && k.silinen === 1 && D.oku(P1).length === 1 && D.kaldir(P1, "yok").silinen === 0);
  ok("depo: geçersiz kayıt eklenmez", !D.ekle(P1, { tur: "x" }).ok && D.oku(P1).length === 1);
  D.degistir(P1, []);
  ok("depo: boş liste kovayı siler", ls.getItem(K.depoAnahtari(P1)) === null && D.toplam() === 0);

  // proje sınırı 300
  var cok = [];
  for (var i = 0; i < 350; i++) cok.push(egriKaydi({ id: "p" + i, createdAt: 1000 + i, times: [1.5] }));
  D.ekle(P1, cok);
  var pl = D.oku(P1);
  ok("depo: projede en çok 300 kayıt, en eskiler atılır", pl.length === 300 && pl[0].id === "p50" && pl[299].id === "p349" && D.toplam() === 300, pl.length);

  // toplam sınır 2000: 7 proje × 300 = 2100 → en eski projeden 100 atılır
  var ls2 = sahteDepo(), saat2 = 0;
  var D2 = K.depo(ls2, { simdi: function () { return ++saat2; } });
  for (var p = 0; p < 7; p++) {
    var l2 = [];
    for (var j = 0; j < 300; j++) l2.push(egriKaydi({ id: "q" + p + "_" + j, createdAt: p * 1000 + j, times: [1.5] }));
    D2.ekle("proje" + p, l2);
  }
  ok("depo: toplamda en çok 2000 kayıt; fazlası en eski projenin en eskilerinden", D2.toplam() === 2000 && D2.oku("proje0").length === 200 &&
    D2.oku("proje0")[0].id === "q0_100" && D2.oku("proje6").length === 300, D2.toplam() + " / " + D2.oku("proje0").length);
  D2.ekle("proje7", [egriKaydi({ id: "yeni", createdAt: 99999 })]);
  ok("depo: yeni proje yazınca yine 2000 (en eski proje kısalır)", D2.toplam() === 2000 && D2.oku("proje7").length === 1 && D2.oku("proje0").length === 199);

  // bozuk veri
  var ls3 = sahteDepo();
  var D3 = K.depo(ls3, { simdi: function () { return 5; } });
  ls3.setItem(K.depoAnahtari(P1), "{bozuk json");
  ok("bozuk localStorage: JSON hatası boş liste sayılır, hata fırlatmaz", js(D3.oku(P1)) === "[]");
  ls3.setItem(K.depoAnahtari(P1), JSON.stringify({ v: 1, k: [null, 5, "x", { tur: "egri" }, egriKaydi({ id: "saglam" }), { tur: "egri", times: ["a"] }] }));
  ok("bozuk localStorage: geçersiz girdiler atlanır, sağlamlar okunur", D3.oku(P1).length === 1 && D3.oku(P1)[0].id === "saglam");
  ls3.setItem(K.depoAnahtari(P1), JSON.stringify([1, 2, 3]));
  ok("bozuk localStorage: beklenmeyen biçim boş sayılır", D3.oku(P1).length === 0);
  ls3.setItem(K.DIZIN, "çöp");
  ls3.setItem(K.depoAnahtari(P2), JSON.stringify({ v: 1, k: [egriKaydi({ id: "iki" })] }));
  ok("bozuk dizin: depodaki kovalar taranarak yeniden kurulur", D3.toplam() === 1);
  var e3 = D3.ekle(P1, egriKaydi({ id: "yeniden" }));
  ok("bozuk veri üstüne yazılabilir", e3.ok && D3.oku(P1).length === 1 && D3.oku(P1)[0].id === "yeniden" && D3.toplam() === 2);

  // erişim hatası (gizli pencere, kapalı site verisi)
  var atan = { getItem: function () { throw new Error("SecurityError"); }, setItem: function () { throw new Error("SecurityError"); },
    removeItem: function () { throw new Error("SecurityError"); }, key: function () { throw new Error("x"); }, get length() { throw new Error("x"); } };
  var D4 = K.depo(atan);
  var hataYok = true;
  try {
    var r4 = D4.ekle(P1, egriKaydi());
    hataYok = r4.ok === false && js(D4.oku(P1)) === "[]" && D4.toplam() === 0 && D4.kaldir(P1, "x").ok === true && D4.temizle(P1) === false;
  } catch (e) { hataYok = false; }
  ok("erişim hatası: her çağrı try/catch içinde, hata fırlatmaz", hataYok);
  var D5 = K.depo(null);
  ok("depo yok (null): işlemler sessizce başarısız", D5.ekle(P1, egriKaydi()).ok === false && D5.oku(P1).length === 0);

  // kota: yalnız gereken kadar en eski kayıt atılır (önce diğer proje); hiçbir liste yarıya inmez
  var ls6 = sahteDepo(20000), saat6 = 0;   // 10 eski + 30 yeni birlikte sığmaz; birkaç eski atılınca sığar
  var D6 = K.depo(ls6, { simdi: function () { return ++saat6; } });
  function buyukKayitlar(on, n, t0) {
    var l = [], t = [];
    for (var x = 0; x < 120; x++) t.push(x / 24);
    for (var y = 0; y < n; y++) l.push(egriKaydi({ id: on + y, createdAt: (t0 || 0) + y + 1, times: t }));
    return l;
  }
  D6.ekle("eski", buyukKayitlar("e", 10));
  var once = D6.oku("eski").length;
  var r6 = D6.ekle("yeni", buyukKayitlar("n", 30, 100));
  var eskiKalan = D6.oku("eski");
  ok("kota dolunca: diğer projenin yalnız en eski birkaç kaydı atılır, yeni liste tam saklanır, sayılar doğru", once === 10 && r6.ok && r6.eklenen === 30 &&
    D6.oku("yeni").length === 30 && eskiKalan.length > 0 && eskiKalan.length < 10 && r6.atilan === 10 - eskiKalan.length &&
    eskiKalan.every(function (r) { return +r.id.slice(1) >= 10 - eskiKalan.length; }), once + " → " + eskiKalan.length + " / " + D6.oku("yeni").length + " atilan " + r6.atilan);
  // yeni kayıtlar tek başına sığmıyorsa: diğer proje boşalır, yenilerin en yenileri saklanır; ok/eklenen bunu söyler
  var ls7 = sahteDepo(6000), saat7 = 0;
  var D7 = K.depo(ls7, { simdi: function () { return ++saat7; } });
  D7.ekle("eski", buyukKayitlar("e", 2));
  var r7 = D7.ekle("yeni", buyukKayitlar("n", 30, 100)), yeniKalan = D7.oku("yeni");
  ok("kota: sığmayan toplu eklemede ok false, eklenen = gerçekten saklanan (en yeniler), hata yok", r7.ok === false && r7.eklenen === yeniKalan.length &&
    r7.eklenen > 0 && r7.eklenen < 30 && D7.oku("eski").length === 0 && yeniKalan.every(function (r) { return +r.id.slice(1) >= 30 - yeniKalan.length; }),
    r7.eklenen + " / " + yeniKalan.length);
  // kota dışı hata (erişim reddi) yalnız bu projede: başka projeye dokunulmaz, eviction yok
  var ls8 = sahteDepo(), D8 = K.depo(ls8, { simdi: function () { return 7; } });
  D8.ekle("x", egriKaydi({ id: "x1" }));
  D8.ekle("y", [egriKaydi({ id: "y1" }), egriKaydi({ id: "y2" })]);
  var asil8 = ls8.setItem;
  ls8.setItem = function (k, v) { if (k === K.depoAnahtari("x")) { throw new Error("SecurityError"); } return asil8.call(ls8, k, v); };
  var yOnce = ls8.getItem(K.depoAnahtari("y")), r8 = D8.ekle("x", egriKaydi({ id: "x2" }));
  ok("kota dışı yazma hatası: hiçbir kayıt atılmaz (başka projeler aynen), ok false, eklenen 0", r8.ok === false && r8.eklenen === 0 && r8.atilan === 0 &&
    ls8.getItem(K.depoAnahtari("y")) === yOnce && D8.oku("x").length === 1 && D8.oku("y").length === 2);
  // her yazımı kota hatasıyla reddeden depo: küçülen kova bile yazılamıyor → ilerleme yok, hemen
  // durulur; döngü yok, hata fırlatmaz, hiçbir kayıt silinmez
  var y40 = [];
  for (var y9 = 0; y9 < 40; y9++) y40.push(egriKaydi({ id: "y" + y9, createdAt: 100 + y9 }));
  var ls9 = sahteDepo(), D9 = K.depo(ls9, { simdi: function () { return 8; } });
  D9.ekle("y", y40);
  var yazim9 = 0, yOnce9 = ls9.getItem(K.depoAnahtari("y"));
  ls9.setItem = function () { yazim9++; var e = new Error("dolu"); e.name = "QuotaExceededError"; e.code = 22; throw e; };
  var r9, hata9 = false;
  try { r9 = D9.ekle("x", egriKaydi({ id: "x1", createdAt: 999 })); } catch (e) { hata9 = true; }
  ok("hep kota hatası veren depo: birkaç denemede durur, ok false, hiçbir kayıt silinmez", !hata9 && r9.ok === false && r9.eklenen === 0 && r9.atilan === 0 &&
    yazim9 <= 4 && ls9.getItem(K.depoAnahtari("y")) === yOnce9, yazim9 + " yazım");
  // gerçek dolu depo (panelin başka verisi kotayı doldurmuş): yalnız yeni kaydın gerektirdiği kadar,
  // diğer projenin en eski bir iki kaydı atılır
  var ls10 = sahteDepo(), D10 = K.depo(ls10, { simdi: function () { return 9; } });
  D10.ekle("y", y40);
  var dolu = 0;
  Object.keys(ls10.veri).forEach(function (k) { dolu += ls10.veri[k].length; });
  ls10.setItem("panel.baska", new Array(2001).join("x"));
  var ls10b = sahteDepo(dolu + 2000 + 150);
  Object.keys(ls10.veri).forEach(function (k) { ls10b.setItem(k, ls10.veri[k]); });
  var D10b = K.depo(ls10b, { simdi: function () { return 10; } });
  var r10 = D10b.ekle("x", egriKaydi({ id: "x1", createdAt: 999 })), yKalan = D10b.oku("y");
  ok("dolu depo: yeni kayıt saklanır, diğer projeden yalnız gereken kadar (1–3) en eski kayıt atılır", r10.ok && r10.eklenen === 1 &&
    yKalan.length >= 37 && yKalan.length < 40 && r10.atilan === 40 - yKalan.length && yKalan[0].id === "y" + (40 - yKalan.length) &&
    ls10b.getItem("panel.baska").length === 2000, yKalan.length + " / atilan " + r10.atilan);
})();

/* ---------------- sıkıştırılmış zamanlar ve boyut payı ---------------- */
(function () {
  function zamanlar(n, fps, bas) { var t = []; for (var k = 1; k <= n; k++) t.push(((bas || 0) * fps + k) / fps); return t; }
  var donen = [24, 25, 30, 30000 / 1001, 60000 / 1001, 50].every(function (fps) {
    var r = K.kayit({ tur: "egri", times: zamanlar(1797, fps, 3725.3) });
    return js(K.zamanCoz(K.zamanKodla(r.times))) === js(r.times);
  });
  var tuhaf = K.kayit({ tur: "egri", times: [-5.25, -1, 0, 0.0001, 3, 3.5, 4, 4.5, 5, 99999.9999] }).times;
  ok("zamanKodla ↔ zamanCoz: 24/25/29,97/30/50/59,94 kare zamanları, negatif ve tek zaman birebir", donen &&
    js(K.zamanCoz(K.zamanKodla(tuhaf))) === js(tuhaf) && js(K.zamanCoz(K.zamanKodla([1.5]))) === "[1.5]");
  var r5994 = K.kayit({ tur: "zoom", times: zamanlar(1797, 60000 / 1001) });
  ok("sıkıştırma: 30 sn @59,94 (1797 anahtar) anahtar başına 4 karakterden az", K.zamanKodla(r5994.times).length < 1797 * 4, K.zamanKodla(r5994.times).length);
  var bozuk = ["", "a,,b", "1*2", "1,-2", "1,0", "1,zzzzzzzzzz", "1,2*0", "1,2*", "1;2", " 1,2", "1,2,", null, 5];
  ok("zamanCoz: bozuk kod boş dizi", bozuk.every(function (s) { return K.zamanCoz(s).length === 0; }), js(bozuk.filter(function (s) { return K.zamanCoz(s).length; })));
  ok("zamanCoz: en çok 4096 zaman (dev yineleme sayısı sınırlı)", K.zamanCoz("0,1*zzz,1*zzz,1*zzz,1*zzz").length === 4096);
  ok("kayit: anlamsız büyük zaman (|t| > 1e8 sn) atılır", js(K.kayit({ tur: "egri", times: [1, 1e9, -1e12, 2] }).times) === "[1,2]");

  var ls = sahteDepo(), D = K.depo(ls, { simdi: function () { return 1; } });
  D.ekle("p", { tur: "egri", id: "z1", times: zamanlar(300, 30) });
  var ham = JSON.parse(ls.getItem(K.depoAnahtari("p"))).k[0];
  ok("disk biçimi: zamanlar 'z' kodunda, 'times' dizisi yazılmaz; okuyunca aynı zamanlar", typeof ham.z === "string" && !("times" in ham) &&
    js(D.oku("p")[0].times) === js(K.kayit({ tur: "egri", times: zamanlar(300, 30) }).times));
  ls.setItem(K.depoAnahtari("q"), JSON.stringify({ v: 1, k: [egriKaydi({ id: "eskiBicim" }), { tur: "egri", id: "kotuZ", z: "1,0" }] }));
  ok("disk biçimi: eski 'times' dizili kayıt okunur, bozuk 'z' kodlu kayıt atlanır", D.oku("q").length === 1 && D.oku("q")[0].id === "eskiBicim" && D.oku("q")[0].times.length === 23);

  // bulgu senaryosu: tarayıcı kotası (5 242 880 karakter); 6 proje × 50 küçük kayıt; geçerli
  // projeye tek tek 1049 anahtarlı (70 sn @30) Eğri kaydı. Eskiden kota dolunca tek ekle()
  // diğer projeleri siler, geçerli projeyi yarıya indirirdi.
  var lsB = sahteDepo(5242880), saatB = 0;
  var DB = K.depo(lsB, { simdi: function () { return ++saatB; } });
  for (var p = 0; p < 6; p++) {
    var kucuk = [];
    for (var j = 0; j < 50; j++) kucuk.push({ tur: "egri", id: "o" + p + "_" + j, times: [1, 1.5, 2], createdAt: p * 100 + j + 1 });
    DB.ekle("proje" + p, kucuk);
  }
  var agir = zamanlar(1049, 30), hepOk = true, dustu = false, onceN = 0, atilanToplam = 0, enBuyukKova = 0;
  for (var i = 0; i < 130; i++) {
    var r = DB.ekle("akim", { tur: "egri", id: "a" + i, times: agir, createdAt: 10000 + i });
    if (!r.ok || r.eklenen !== 1) hepOk = false;
    if (r.liste.length < onceN) dustu = true;
    onceN = r.liste.length; atilanToplam += r.atilan;
    enBuyukKova = Math.max(enBuyukKova, lsB.getItem(K.depoAnahtari("akim")).length);
  }
  var digerSayi = [0, 1, 2, 3, 4, 5].map(function (q) { return DB.oku("proje" + q).length; });
  ok("boyut payı: ağır kayıtlar tek tek eklenir, proje kovası ≤ 400 000 karakter, liste hiç kısalmaz (en eski tek tek atılır), diğer projeler yerinde",
    hepOk && !dustu && enBuyukKova <= K.PROJE_KARAKTER && onceN > 100 && atilanToplam === 130 - onceN && digerSayi.join(",") === "50,50,50,50,50,50" &&
    DB.oku("akim")[0].id === "a" + (130 - onceN), onceN + " kayıt, en büyük kova " + enBuyukKova + ", diğer " + digerSayi.join(","));
  var kalanYer = true;
  try { lsB.setItem("suflo.deneme", new Array(100001).join("x")); } catch (e) { kalanYer = false; }
  ok("boyut payı: panelin diğer anahtarlarına (deneme aynası vb.) yer kalır", kalanYer && K.TOPLAM_KARAKTER <= 1000000 && K.PROJE_KARAKTER < K.TOPLAM_KARAKTER);

  // toplam pay (1 000 000): üç ağır proje; sınır aşılınca tüm projelerdeki en eski kayıtlar tek tek atılır
  var dev = [], u = 0;
  for (var z = 0; z < 4096; z++) { u += 400 + ((z * 7919) % 97); dev.push(u / 10000); }
  var lsT = sahteDepo(5242880), saatT = 0, DT = K.depo(lsT, { simdi: function () { return ++saatT; } });
  DT.ekle("kucuk", [{ tur: "egri", id: "k0", times: [1], createdAt: 1 }, { tur: "egri", id: "k1", times: [1], createdAt: 2 }]);
  var toplamTasti = false, sonDustu = false, sonN = 0, hepOkT = true;
  ["A", "B", "C"].forEach(function (pr, pi) {
    for (var q = 0; q < 34; q++) {
      var rr = DT.ekle(pr, { tur: "egri", id: pr + q, times: dev, createdAt: 100 + pi * 100 + q });
      if (!rr.ok || rr.eklenen !== 1) hepOkT = false;
      if (pr === "C") { if (rr.liste.length < sonN) sonDustu = true; sonN = rr.liste.length; }
      var kovalar = 0;
      Object.keys(lsT.veri).forEach(function (k) { if (k.indexOf(K.ONEK) === 0 && k !== K.DIZIN) kovalar += lsT.veri[k].length; });
      if (kovalar > K.TOPLAM_KARAKTER) toplamTasti = true;
    }
  });
  var a = DT.oku("A"), b = DT.oku("B"), c = DT.oku("C");
  ok("toplam pay: tüm kovalar ≤ 1 000 000 karakter; en eski kayıtlar (önce en eski proje) tek tek atılır, yeni proje kısalmaz",
    hepOkT && !toplamTasti && !sonDustu && DT.oku("kucuk").length === 0 && a.length < b.length && c.length === sonN && c.length > 0 &&
    a.every(function (r) { return +r.id.slice(1) >= 34 - a.length; }), [DT.oku("kucuk").length, a.length, b.length, c.length].join("/"));
})();

/* ---------------- kaynak denetimi ---------------- */
var src = fs.readFileSync(path.join(KOK, "js", "key-records.js"), "utf8");
ok("saf modül: DOM, Premiere ya da ağ çağrısı yok", !/document\.|evalScript|CSInterface|XMLHttpRequest|fetch\(|require\(/.test(src));
ok("temiz oda: lisanssız kaynağın kodu / adı yok", !new RegExp("open" + "curve", "i").test(src));
ok("eşikler planla aynı: 0,25 kare, %60, 300 / 2000", K.TOLERANS_KARE === 0.25 && K.CANLI_ORAN === 0.6 && K.PROJE_SINIR === 300 && K.TOPLAM_SINIR === 2000);

/* ---------- 3.4 adım 11: Geçiş / Zoom / Hareket önayarı kayıtları (uç yok: ilk ve son zaman uçtur) ---------- */
var arac = K.kayit({ tur: "hareket", seqId: "s1", nodeId: "n7", clipName: "Klip.mp4", clipStart: 12, clipEnd: 17, clipIn: 37, clipOut: 42, ters: false,
  matchName: "AE.ADBE Motion/Position", compIdx: 0, propIdx: 0, uclar: null, times: [12.351, 12, 12.45],
  kenarDegerleri: [{ t: 12, v: [0.5, 0.5] }, { t: 12.45, v: [0.5, 0.5] }, { t: 13, v: "metin" }] }, 1000);
ok("araç kaydı: tur 'hareket' geçerli, zamanlar sıralı, uç yok, çapa ve [x,y] kenar değerleri korunur (geçersiz kenar atılır)", arac && arac.tur === "hareket" &&
  js(arac.times) === js([12, 12.351, 12.45]) && arac.uclar === null && arac.clipIn === 37 && arac.clipOut === 42 && arac.ters === false &&
  js(arac.kenarDegerleri) === js([{ t: 12, v: [0.5, 0.5] }, { t: 12.45, v: [0.5, 0.5] }]), js(arac));
ok("araç kaydı: 'gecis' ve 'zoom' türleri de geçerli", K.kayit({ tur: "gecis", times: [1, 2] }) !== null && K.kayit({ tur: "zoom", times: [0, 10] }) !== null);
var fps25 = 25;
ok("araç kaydı canlı: kullanıcı aralığa kendi anahtarını ekleyince de (uçlar ilk ve son zaman)", K.canli(arac, [12, 12.2, 12.351, 12.45], fps25));
ok("araç kaydı ölü: Premiere'de geri alınınca (Suflo'nun anahtarlarından hiçbiri yok)", (function () {
  var a = K.canliAyrinti(arac, [3, 20], fps25);
  return !a.canli && a.eslesen === 0 && !a.uclar;
})());
ok("araç kaydı ölü: son anahtar (uç) silinince, %66 yerinde olsa da", !K.canli(arac, [12, 12.351], fps25));
var depoA = K.depo(sahteDepo());
depoA.ekle("C:/p.prproj", [arac, K.kayit({ tur: "egri", seqId: "s1", nodeId: "n7", times: [1, 2], uclar: [1, 2] })]);
ok("depo: araç ve Eğri kayıtları aynı proje kovasında, türe göre süzülür", K.filtrele(depoA.oku("C:/p.prproj"), { tur: "hareket" }).length === 1 &&
  K.filtrele(depoA.oku("C:/p.prproj"), { tur: "egri" }).length === 1, depoA.oku("C:/p.prproj").length);
var geri = depoA.oku("C:/p.prproj").filter(function (r) { return r.tur === "hareket"; })[0];
ok("depo: araç kaydı diskten aynen döner (sıkıştırılmış zamanlar, çapa, [x,y] kenar)", geri && js(geri.times) === js(arac.times) && geri.clipIn === 37 &&
  js(geri.kenarDegerleri) === js(arac.kenarDegerleri), js(geri));

/* ---------- inceleme: araç kayıtları Eğri'nin Geri al kayıtlarını atmaz (sınıf başına sınır) ---------- */
(function () {
  var dp = K.depo(sahteDepo());
  var egriK = K.kayit({ tur: "egri", seqId: "s1", nodeId: "e1", matchName: "AE.ADBE Motion/Scale", compIdx: 0, propIdx: 1, times: [1, 1.04, 2], uclar: [1, 2] }, 500);
  dp.ekle("C:/p.prproj", [egriK]);
  var cok = [];
  for (var i = 0; i < 320; i++) cok.push(K.kayit({ tur: "hareket", seqId: "s1", nodeId: "n" + i, matchName: "AE.ADBE Opacity/Opacity", compIdx: 1, propIdx: 0, times: [i, i + 0.45] }, 1000 + i));
  var s = dp.ekle("C:/p.prproj", cok);
  var hepsi = dp.oku("C:/p.prproj");
  ok("tek seferde 320 araç kaydı: Eğri kaydı kalır, araçların en yeni 300'ü saklanır (sınır sınıf başına)",
    hepsi.filter(function (r) { return r.tur === "egri"; }).length === 1 && hepsi.filter(function (r) { return r.tur === "hareket"; }).length === 300 &&
    s.eklenen === 300 && !s.ok && hepsi.filter(function (r) { return r.tur === "hareket" && r.createdAt < 1020; }).length === 0, js([s.eklenen, s.ok, hepsi.length]));
  var egriler = [];
  for (var j = 0; j < 300; j++) egriler.push(K.kayit({ tur: "egri", seqId: "s1", nodeId: "g" + j, matchName: "AE.ADBE Motion/Scale", compIdx: 0, propIdx: 1, times: [j, j + 1], uclar: [j, j + 1] }, 5000 + j));
  dp.ekle("C:/p.prproj", egriler);
  var son = dp.oku("C:/p.prproj");
  ok("Eğri kovası dolunca da araç kayıtları atılmaz (Eğri yalnız kendi eskisini atar)", son.filter(function (r) { return r.tur === "hareket"; }).length === 300 &&
    son.filter(function (r) { return r.tur === "egri"; }).length === 300 && !son.some(function (r) { return r.id === egriK.id; }), son.length);
  ok("sinifEnYeniler: sınıf başına en yeniler, sıra korunur", js(K.sinifEnYeniler([{ tur: "egri", createdAt: 1 }, { tur: "zoom", createdAt: 2 }, { tur: "gecis", createdAt: 3 }], 1)
    .map(function (r) { return r.tur; })) === js(["egri", "gecis"]));
})();

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
