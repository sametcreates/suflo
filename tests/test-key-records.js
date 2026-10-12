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

  // kota: diğer projeler en eskiden boşaltılır, yine sığmazsa kendi listesi yarıya iner
  var ls6 = sahteDepo(20000), saat6 = 0;   // ~1 KB/kayıt: 10 eski sığar, 30 yeni tek başına sığmaz, 15'i sığar
  var D6 = K.depo(ls6, { simdi: function () { return ++saat6; } });
  function buyukKayitlar(on, n) {
    var l = [], t = [];
    for (var x = 0; x < 120; x++) t.push(x / 24);
    for (var y = 0; y < n; y++) l.push(egriKaydi({ id: on + y, createdAt: y + 1, times: t }));
    return l;
  }
  D6.ekle("eski", buyukKayitlar("e", 10));
  var once = D6.oku("eski").length;
  var r6 = D6.ekle("yeni", buyukKayitlar("n", 30));
  ok("kota dolunca: önce en eski proje boşaltılır, gerekirse yeni liste kısalır; hata yok", once === 10 && r6.ok && D6.oku("eski").length === 0 &&
    D6.oku("yeni").length > 0 && D6.oku("yeni").length < 30, once + " → " + D6.oku("eski").length + " / " + D6.oku("yeni").length);
})();

/* ---------------- kaynak denetimi ---------------- */
var src = fs.readFileSync(path.join(KOK, "js", "key-records.js"), "utf8");
ok("saf modül: DOM, Premiere ya da ağ çağrısı yok", !/document\.|evalScript|CSInterface|XMLHttpRequest|fetch\(|require\(/.test(src));
ok("temiz oda: OpenCurve kodu/adı yok", !/opencurve/i.test(src));
ok("eşikler planla aynı: 0,25 kare, %60, 300 / 2000", K.TOLERANS_KARE === 0.25 && K.CANLI_ORAN === 0.6 && K.PROJE_SINIR === 300 && K.TOPLAM_SINIR === 2000);

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
