/*
 * Suflo Studio hesap cekirdegi (server/studio-v1/arayuz/studio-core.js). Yalniz anonim ornek veri.
 *  - hazir stok: yalniz "hazir" + video; atanmis + atanmamis = toplam, cift sayim yok; post videoya sayilmaz
 *  - yayinlanan stoktan duser ama silinmez; durum geri alininca sayilar duzelir
 *  - gunluk, 3 gunde 1 ve haftalik ihtiyac; eksik duzen "kurulmali", bilinmeyen stok 0 sayilmaz
 *  - takvim cakismasi (saatli, tum gun, cok gunlu, iptal), Istanbul saati, CSV, ucret ozeti
 *  - tarayicisiz statik denetim: studio.js sozdizimi, index.html baglantilari, elle yuklenen .htaccess yasaklari
 */
"use strict";
var C = require("../server/studio-v1/arayuz/studio-core.js");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 400) + "]" : "")); }
function j(x) { return JSON.stringify(x); }

var BUGUN = "2030-03-04"; // Pazartesi
var sayac = 0;
function icerik(o) {
  sayac++;
  return Object.assign({ id: "ic" + sayac + "aaaaaaaa", musteriId: "mA0000000", baslik: "Örnek " + sayac, tur: "reels", durum: "fikir", oncelik: "normal",
    cekimId: null, teslimTarihi: null, planTarihi: null, yayinTarihi: null, gecmis: [], arsiv: false, olusturma: sayac }, o);
}
function musteri(o) {
  return Object.assign({ id: "mA0000000", ad: "Örnek Müşteri A", kurum: "", ucret: 1000, siklik: { tur: "gunluk", gunler: [], baslangic: null, haftalikAdet: null },
    slotTuru: "video", stokUyari: null, stokGirisi: true, arsiv: false }, o);
}

/* ---------------- Tarih ---------------- */
ok("haftaGunu: 2030-03-04 Pazartesi=1, 2030-03-10 Pazar=7", C.haftaGunu("2030-03-04") === 1 && C.haftaGunu("2030-03-10") === 7);
ok("gunEkle ay / yil gecisi ve artik yil", C.gunEkle("2028-02-28", 1) === "2028-02-29" && C.gunEkle("2030-12-31", 1) === "2031-01-01" && C.gunEkle("2030-03-01", -1) === "2030-02-28");
ok("gecerliTarih 2030-02-29 yok, 2028-02-29 var", !C.gecerliTarih("2030-02-29") && C.gecerliTarih("2028-02-29") && !C.gecerliTarih("2030-3-4"));
ok("ayIzgarasi Pazartesi baslar, 7'li satirlar, ayi kapsar", (function () {
  var g = C.ayIzgarasi("2030-03-15");
  return g.every(function (h) { return h.length === 7 && C.haftaGunu(h[0]) === 1; }) && g[0].indexOf("2030-03-01") !== -1 && g[g.length - 1].indexOf("2030-03-31") !== -1;
})());
ok("ayEkle Aralik -> Ocak, Ocak -> Aralik", C.ayEkle("2030-12-15", 1) === "2031-01-01" && C.ayEkle("2030-01-15", -1) === "2029-12-01");
// Istanbul: UTC 21:30 => ertesi gun 00:30 (UTC+3, yaz saati yok)
var ist = C.istanbulSimdi(new Date(Date.UTC(2026, 9, 19, 21, 30)));
ok("Istanbul saati: 2026-10-19 21:30 UTC -> 2026-10-20 00:30", ist.tarih === "2026-10-20" && ist.saat === "00:30", j(ist));
var istYaz = C.istanbulSimdi(new Date(Date.UTC(2026, 6, 1, 9, 5)));
ok("Istanbul saati yazin da UTC+3 (yaz saati uygulamasi yok)", istYaz.tarih === "2026-07-01" && istYaz.saat === "12:05", j(istYaz));
// Bicimleyici bir kez kurulur; sonuc her cagrida ayni anin Istanbul tarihi ve saatidir
ok("Istanbul saati: gece yarisi ve yil donumu cevresinde her cagrida kurulan bicimleyiciyle ayni", (function () {
  var ref = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  var anlar = [];
  [[2026, 0, 1], [2026, 11, 31], [2027, 1, 28], [2028, 1, 29], [2030, 2, 4]].forEach(function (g) {
    [[0, 0], [20, 59], [21, 0], [21, 1], [23, 59]].forEach(function (s) { anlar.push(new Date(Date.UTC(g[0], g[1], g[2], s[0], s[1]))); });
  });
  var hatali = anlar.filter(function (an) {
    var p = {};
    ref.formatToParts(an).forEach(function (x) { p[x.type] = x.value; });
    var s = C.istanbulSimdi(an);
    return s.tarih !== p.year + "-" + p.month + "-" + p.day || s.saat !== (p.hour === "24" ? "00" : p.hour) + ":" + p.minute;
  });
  return anlar.length === 25 && hatali.length === 0 && C.istanbulSimdi(new Date(Date.UTC(2026, 11, 31, 21, 0))).tarih === "2027-01-01";
})());
function cekirdekYeniden(dtf, f) {
  // studio-core.js'i verilen Intl.DateTimeFormat ile bastan yukler (bicimleyici ilk cagrida kurulur)
  var yol = require.resolve("../server/studio-v1/arayuz/studio-core.js"), orj = Intl.DateTimeFormat;
  delete require.cache[yol];
  Intl.DateTimeFormat = dtf;
  try { return f(require(yol)); } finally { Intl.DateTimeFormat = orj; delete require.cache[yol]; }
}
var kurulum = 0, ORJ_DTF = Intl.DateTimeFormat;
ok("Istanbul bicimleyicisi 300 cagrida bir kez kurulur (her satirda yeniden kurulmaz)", cekirdekYeniden(function (a, b) { kurulum++; return new ORJ_DTF(a, b); }, function (C2) {
  for (var i = 0; i < 300; i++) C2.istanbulSimdi(new Date(Date.UTC(2026, 9, 19, 21, i % 60)));
  return C2.istanbulSimdi(new Date(Date.UTC(2026, 9, 19, 21, 30))).tarih === "2026-10-20";
}) && kurulum === 1, kurulum);
ok("Istanbul saati: Intl bicimleyicisi kurulamazsa sabit UTC+3 yedegi (hata firlatmaz)", cekirdekYeniden(function () { throw new RangeError("saat dilimi yok"); }, function (C2) {
  var s = C2.istanbulSimdi(new Date(Date.UTC(2026, 9, 19, 21, 30))), s2 = C2.istanbulSimdi(new Date(Date.UTC(2026, 6, 1, 9, 5)));
  return s.tarih === "2026-10-20" && s.saat === "00:30" && s2.tarih === "2026-07-01" && s2.saat === "12:05" && C2.damga(new Date(Date.UTC(2026, 9, 19, 21, 30))) === "2026-10-20 00:30";
}));
ok("tarihUzun Turkce", C.tarihUzun("2026-10-20") === "20 Ekim 2026, Salı", C.tarihUzun("2026-10-20"));
ok("katla: Türkçe harf katlama", C.katla("ÖZGÜR ÇAĞRI İnci Işık") === "ozgur cagri inci isik", C.katla("ÖZGÜR ÇAĞRI İnci Işık"));
ok("para: binlik nokta, bos -> Belirlenmedi (0 degil)", C.para(123456) === "123.456 TL" && C.para(null) === "Belirlenmedi" && C.para(0) === "0 TL");

/* ---------------- Stok ---------------- */
var m = musteri();
var veri = { musteriler: [m], etkinlikler: [], icerikler: [
  icerik({ durum: "hazir", planTarihi: "2030-03-05" }),
  icerik({ durum: "hazir", planTarihi: "2030-03-06", tur: "video" }),
  icerik({ durum: "hazir" }),
  icerik({ durum: "hazir" }),
  icerik({ durum: "hazir", tur: "post" }),          // post videoya sayilmaz
  icerik({ durum: "hazir", tur: "story", planTarihi: "2030-03-05" }),
  icerik({ durum: "onayda" }),                      // onay bekleyen stok degil
  icerik({ durum: "kurguda" }),
  icerik({ durum: "yayinlandi", yayinTarihi: "2030-03-01" }),
  icerik({ durum: "hazir", arsiv: true }),          // arsiv sayilmaz
  icerik({ durum: "hazir", musteriId: "mB0000000" }) // baska musteri
] };
var st = C.stok(veri, m, BUGUN);
ok("hazir video stoku: 4 (post, story, onayda, yayinlanan, arsiv, baska musteri haric)", st.toplam === 4, j(st));
ok("atanmis 2 + atanmamis 2 = toplam (cift sayim yok)", st.atanmis === 2 && st.atanmamis === 2 && st.gecmisTarihli === 0 && st.atanmis + st.gecmisTarihli + st.atanmamis === st.toplam, j(st));
ok("post ve story ayri: post 1, story 1", st.digerHazir.post === 1 && st.digerHazir.story === 1, j(st.digerHazir));
ok("hazirlikta video: onayda + kurguda = 2", st.hazirlikta === 2, st.hazirlikta);
ok("atanmis ve atanmamis id kumeleri ayrik", st.idler.atanmis.every(function (id) { return st.idler.atanmamis.indexOf(id) === -1; }));

// Yayinla: stoktan duser, kayit durur; geri al: geri gelir
var hedef = veri.icerikler[0];
var yay = C.durumDegistir(hedef, "yayinlandi", "2030-03-04 10:00", BUGUN);
ok("yayinlandi: yayin tarihi bugun, gecmise not", yay.durum === "yayinlandi" && yay.yayinTarihi === BUGUN && /Yayına hazır → Yayınlandı/.test(yay.gecmis[0].m), j(yay));
ok("durumDegistir orijinali degistirmez", hedef.durum === "hazir" && hedef.gecmis.length === 0);
veri.icerikler[0] = yay;
var st2 = C.stok(veri, m, BUGUN);
ok("yayinlanan stoktan duser (4 -> 3), kayit silinmez", st2.toplam === 3 && st2.atanmis === 1 && veri.icerikler.length === 11, j(st2));
var geri = C.geriAl(yay, hedef, "2030-03-04 10:01");
veri.icerikler[0] = geri;
var st3 = C.stok(veri, m, BUGUN);
ok("geri alininca stok yine 4, yayin tarihi temizlenir, gecmis korunur", st3.toplam === 4 && geri.durum === "hazir" && !geri.yayinTarihi && geri.gecmis.length === 2 && /Geri alındı/.test(geri.gecmis[1].m), j(geri));
var yay2 = C.durumDegistir(C.durumDegistir(hedef, "yayinlandi", "z", BUGUN), "hazir", "z", BUGUN);
ok("yayinlandidan elle geri cekince yayin tarihi temizlenir", yay2.durum === "hazir" && yay2.yayinTarihi === null);
ok("ayni duruma degisim null", C.durumDegistir(hedef, "hazir", "z", BUGUN) === null);
ok("revizyon onaya da kurguya da donebilir; cekimsiz dogrudan kurgu", !!C.durumDegistir(icerik({ durum: "revizyonda" }), "onayda", "z", BUGUN) &&
  !!C.durumDegistir(icerik({ durum: "revizyonda" }), "kurguda", "z", BUGUN) && !!C.durumDegistir(icerik({ durum: "fikir" }), "kurguda", "z", BUGUN));
var cokGecmis = icerik({ gecmis: Array.from({ length: 70 }, function (_, i) { return { z: "z", m: "m" + i }; }) });
ok("gecmis en cok 60 kayit", C.durumDegistir(cokGecmis, "kurguda", "z", BUGUN).gecmis.length === 60);
// Gec isaretlenen yayin: planlanan gun (dun) acikca verilirse o gun yazilir; verilmezse eskisi gibi bugun
var dunPlanli = icerik({ durum: "hazir", planTarihi: "2030-03-03" });
var dunYay = C.durumDegistir(dunPlanli, "yayinlandi", "2030-03-04 10:00", BUGUN, dunPlanli.planTarihi);
ok("yayinlandi: verilen planlanan gun (gecmis) yayin tarihi olur", dunYay.yayinTarihi === "2030-03-03" && dunYay.durum === "yayinlandi" && /Yayına hazır → Yayınlandı/.test(dunYay.gecmis[0].m), JSON.stringify(dunYay));
ok("yayinlandi: verilen tarih bugunden ileri ya da gecersizse bugun yazilir; 4 bagimsiz degiskenle bugun", C.durumDegistir(dunPlanli, "yayinlandi", "z", BUGUN, "2030-03-05").yayinTarihi === BUGUN &&
  C.durumDegistir(dunPlanli, "yayinlandi", "z", BUGUN, "2030-02-30").yayinTarihi === BUGUN && C.durumDegistir(dunPlanli, "yayinlandi", "z", BUGUN, null).yayinTarihi === BUGUN &&
  C.durumDegistir(dunPlanli, "yayinlandi", "z", BUGUN).yayinTarihi === BUGUN && C.durumDegistir(dunPlanli, "yayinlandi", "z", BUGUN, BUGUN).yayinTarihi === BUGUN);
ok("yayinlandi: kayitta yayin tarihi zaten varsa degismez", C.durumDegistir(icerik({ durum: "hazir", yayinTarihi: "2030-03-01" }), "yayinlandi", "z", BUGUN, "2030-03-02").yayinTarihi === "2030-03-01");
ok("dun yayinlanan (planlanan gunle isaretlenen) bugunku slotu karsilamaz; bugunle isaretlenen karsilar", (function () {
  var v = function (i) { return { musteriler: [m], etkinlikler: [], icerikler: [i] }; };
  var kGercek = C.kapsama(v(dunYay), m, BUGUN, 7), kBugun = C.kapsama(v(C.durumDegistir(dunPlanli, "yayinlandi", "z", BUGUN)), m, BUGUN, 7);
  return kGercek.slotlar[0].durum === "acik" && kGercek.yayinlandi === 0 && kGercek.acik === 7 && kBugun.slotlar[0].durum === "yayinlandi";
})());
// Is akisinda tek tikla sonraki adimlar
ok("sonrakiDurumlar: 8 durumun dogal sonraki adimlari (onayda 2, yayinlandi 0)", (function () {
  var beklenen = { fikir: "cekim_planlandi:Çekim planlandı", cekim_planlandi: "cekildi:Çekildi", cekildi: "kurguda:Kurguya al", kurguda: "onayda:Onaya gönder",
    onayda: "hazir:Onaylandı|revizyonda:Revizyon", revizyonda: "onayda:Onaya gönder", hazir: "yayinlandi:Yayınlandı", yayinlandi: "" };
  return C.DURUMLAR.every(function (d) {
    return C.sonrakiDurumlar(d.k).map(function (x) { return x.k + ":" + x.ad; }).join("|") === beklenen[d.k];
  }) && C.sonrakiDurumlar("onayda").length === 2 && C.sonrakiDurumlar("yayinlandi").length === 0;
})(), C.DURUMLAR.map(function (d) { return d.k + "=" + JSON.stringify(C.sonrakiDurumlar(d.k)); }).join(" "));
ok("sonrakiDurumlar: bilinmeyen durumda bos; her adim gecerli bir durum ve durumDegistir'den gecer", C.sonrakiDurumlar("yok").length === 0 && C.sonrakiDurumlar("constructor").length === 0 &&
  C.sonrakiDurumlar(undefined).length === 0 && C.DURUMLAR.every(function (d) {
    return C.sonrakiDurumlar(d.k).every(function (x) { return !!C.DURUM_AD[x.k] && C.durumDegistir(icerik({ durum: d.k }), x.k, "z", BUGUN).durum === x.k; });
  }));
var sd1 = C.sonrakiDurumlar("onayda");
sd1[0].k = "bozuk";
ok("sonrakiDurumlar her cagrida yeni liste doner (degistirilen sonuc sonrakini bozmaz)", C.sonrakiDurumlar("onayda")[0].k === "hazir");

/* ---------------- Yayin ihtiyaci: gunluk ---------------- */
var k7 = C.kapsama(veri, m, BUGUN, 7);
ok("gunluk: 7 gunde 7 ihtiyac", k7.ihtiyac === 7 && k7.slotlar[0].tarih === BUGUN, j(k7));
ok("gunluk: 2 planli (05, 06) + 2 oneri (atanmamis) + 3 acik", k7.planli === 2 && k7.oneri === 2 && k7.acik === 3, j(k7));
ok("gunluk: oneri yalniz plansiz gunlere, planli gunler atanmis icerikle", k7.slotlar[1].durum === "planli" && k7.slotlar[2].durum === "planli" &&
  k7.slotlar[0].durum === "oneri" && k7.slotlar[3].durum === "oneri", j(k7.slotlar));
ok("gunluk: ilk acik tarih 2030-03-08, ilk plansiz 2030-03-04", k7.ilkAcik === "2030-03-08" && k7.ilkPlansiz === "2030-03-04", k7.ilkAcik + " " + k7.ilkPlansiz);
var kullanilan = k7.slotlar.filter(function (s) { return s.icerikId; }).map(function (s) { return s.icerikId; });
ok("bir icerik iki slotu karsilamaz", kullanilan.length === new Set(kullanilan).size, j(kullanilan));
ok("oneri kaydedilmez: kapsama veriyi degistirmez (atanmamis hala plansiz)", veri.icerikler[2].planTarihi === null && veri.icerikler[3].planTarihi === null);
var k14 = C.kapsama(veri, m, BUGUN, 14);
ok("gunluk 14 gun: ihtiyac 14, acik 10", k14.ihtiyac === 14 && k14.acik === 10, j({ i: k14.ihtiyac, a: k14.acik }));
ok("story slot turunde video sayilmaz: story slotu 05'te story ile planli", (function () {
  var k = C.kapsama(veri, musteri({ slotTuru: "story" }), BUGUN, 7);
  return k.planli === 1 && k.slotlar[1].durum === "planli" && k.oneri === 0 && k.acik === 6;
})());
ok("post slot turu: atanmamis post oneri olur, reels olmaz", (function () {
  var k = C.kapsama(veri, musteri({ slotTuru: "post" }), BUGUN, 7);
  return k.oneri === 1 && k.planli === 0 && k.acik === 6;
})());
// bugun yayinlanmis icerik bugunku slotu karsilar
var vYay = { musteriler: [m], etkinlikler: [], icerikler: [icerik({ durum: "yayinlandi", yayinTarihi: BUGUN })] };
var kYay = C.kapsama(vYay, m, BUGUN, 7);
ok("bugun yayinlanan bugunku slotu karsilar", kYay.slotlar[0].durum === "yayinlandi" && kYay.yayinlandi === 1 && kYay.acik === 6, j(kYay.slotlar[0]));
// slot disi gune planli icerik
var vDis = { musteriler: [], etkinlikler: [], icerikler: [icerik({ durum: "hazir", planTarihi: "2030-03-05" })] };
var mHafta = musteri({ siklik: { tur: "haftalik", gunler: [1, 4], haftalikAdet: 2, baslangic: null } });
var kDis = C.kapsama(vDis, mHafta, BUGUN, 7);
ok("slot disi gune planli hazir icerik ayri sayilir, slotu karsilamaz", kDis.slotDisiPlanli === 1 && kDis.planli === 0 && kDis.acik === 2, j(kDis));
// Slotu karsilamayan tarihli hazir icerik sessizce kaybolmaz: neden karsilamadigi sayilir (tahmin degismez)
var vAyni = { musteriler: [m], etkinlikler: [], icerikler: [icerik({ durum: "hazir", planTarihi: "2030-03-05" }), icerik({ durum: "hazir", tur: "video", planTarihi: "2030-03-05" })] };
var kAyni = C.kapsama(vAyni, m, BUGUN, 7);
ok("ayni paylasim gunune ikinci hazir video: ayniGunFazla 1; o gun bir kez karsilanir (planli 1, acik 6)", kAyni.ayniGunFazla === 1 && kAyni.planli === 1 && kAyni.acik === 6 &&
  kAyni.turUyumsuz === 0 && kAyni.slotDisiPlanli === 0 && kAyni.ihtiyac === 7, j(kAyni));
var vPostVideoGunu = { musteriler: [m], etkinlikler: [], icerikler: [icerik({ durum: "hazir", tur: "post", planTarihi: "2030-03-05" })] };
var kPost = C.kapsama(vPostVideoGunu, m, BUGUN, 7);
ok("video gunune planli hazir post: turUyumsuz 1 (tarih, tur, beklenen), slot disi sayilmaz, gun acik kalir", kPost.turUyumsuz === 1 && kPost.slotDisiPlanli === 0 && kPost.acik === 7 &&
  kPost.planli === 0 && kPost.turUyumsuzGunler.length === 1 && kPost.turUyumsuzGunler[0].tarih === "2030-03-05" && kPost.turUyumsuzGunler[0].grup === "post" &&
  kPost.turUyumsuzGunler[0].beklenen === "video" && kPost.turUyumsuzGunler[0].icerikId === vPostVideoGunu.icerikler[0].id, j(kPost));
ok("gun istisnasiyla post gunune planli hazir reels: turUyumsuz (eskiden yanlislikla 'paylasim gunu disi')", (function () {
  var mI = musteri({ slotIstisna: { "2030-03-05": "post" } });
  var k = C.kapsama({ musteriler: [mI], etkinlikler: [], icerikler: [icerik({ durum: "hazir", planTarihi: "2030-03-05" })] }, mI, BUGUN, 7);
  return k.turUyumsuz === 1 && k.slotDisiPlanli === 0 && k.turUyumsuzGunler[0].beklenen === "post" && k.slotlar[1].durum === "acik";
})());
ok("aralik disindaki (8. gun) ve tarihi gecmis planli hazir aciklama sayilarina girmez", (function () {
  var v = { musteriler: [m], etkinlikler: [], icerikler: [icerik({ durum: "hazir", tur: "post", planTarihi: "2030-03-11" }), icerik({ durum: "hazir", tur: "post", planTarihi: "2030-03-03" })] };
  var k = C.kapsama(v, m, BUGUN, 7);
  return k.turUyumsuz === 0 && k.ayniGunFazla === 0 && k.slotDisiPlanli === 0 && C.kapsama(v, m, BUGUN, 8).turUyumsuz === 1;
})());

/* ---------------- 3 gunde 1 ---------------- */
var mUc = musteri({ siklik: { tur: "uc_gun", baslangic: "2030-03-05", gunler: [], haftalikAdet: null } });
var bos = { musteriler: [mUc], etkinlikler: [], icerikler: [] };
var kUc = C.kapsama(bos, mUc, BUGUN, 14);
ok("3 gunde 1: baslangic 05 -> 05, 08, 11, 14, 17", j(kUc.slotlar.map(function (s) { return s.tarih; })) === j(["2030-03-05", "2030-03-08", "2030-03-11", "2030-03-14", "2030-03-17"]), j(kUc.slotlar));
ok("3 gunde 1: 7 gunde 2, 14 gunde 5 ihtiyac (3 ile carpma yok, gercek takvim)", C.kapsama(bos, mUc, BUGUN, 7).ihtiyac === 2 && kUc.ihtiyac === 5);
var mUcGecmis = musteri({ siklik: { tur: "uc_gun", baslangic: "2030-02-01", gunler: [], haftalikAdet: null } });
var sUc = C.slotlar(mUcGecmis, BUGUN, 7);
ok("3 gunde 1: gecmis baslangic dongusu surer (02-01 +3k -> 03-06, 03-09)", j(sUc) === j(["2030-03-06", "2030-03-09"]), j(sUc));
var mUcYok = musteri({ siklik: { tur: "uc_gun", baslangic: null, gunler: [], haftalikAdet: null } });
var kUcYok = C.kapsama(bos, mUcYok, BUGUN, 7);
ok("3 gunde 1 baslangicsiz: duzen kurulmali, tahmin yok, tarih uydurulmaz", !kUcYok.duzenTamam && kUcYok.ihtiyac === null && kUcYok.slotlar.length === 0 && /başlangıç/.test(kUcYok.eksik), j(kUcYok));
// Metin: bugun verilirse gecmisteki baslangic yerine gercek siradaki paylasim gunu
ok("siklikMetni 3 gunde 1: gecmis baslangicta gercek siradaki gun (02-01 -> 6 Mart Car)", C.siklikMetni(mUcGecmis, BUGUN) === "3 günde 1 (sıradaki: 6 Mart Çar)", C.siklikMetni(mUcGecmis, BUGUN));
ok("siklikMetni 3 gunde 1: ileri baslangic kendisi, bugun baslayan ya da donguye denk gelen bugun", C.siklikMetni(mUc, BUGUN) === "3 günde 1 (sıradaki: 5 Mart Sal)" &&
  C.siklikMetni(musteri({ siklik: { tur: "uc_gun", baslangic: BUGUN } }), BUGUN) === "3 günde 1 (sıradaki: 4 Mart Pzt)" &&
  C.siklikMetni(musteri({ siklik: { tur: "uc_gun", baslangic: "2030-02-26" } }), BUGUN) === "3 günde 1 (sıradaki: 4 Mart Pzt)", C.siklikMetni(mUc, BUGUN));
ok("siklikMetni 3 gunde 1: siradaki gun her gecmis baslangicta tahminin ilk gunuyle ayni", ["2029-12-30", "2030-01-01", "2030-02-27", "2030-02-28", "2030-03-01", "2030-03-02", "2030-03-03"].every(function (bas) {
  var mu = musteri({ siklik: { tur: "uc_gun", baslangic: bas } });
  return C.siklikMetni(mu, BUGUN) === "3 günde 1 (sıradaki: " + C.tarihGunlu(C.slotlar(mu, BUGUN, 3)[0]) + ")";
}));
ok("siklikMetni 3 gunde 1: baska yildaki siradaki gun yilla yazilir; bugunsuz (CSV) kayitli baslangic", C.siklikMetni(musteri({ siklik: { tur: "uc_gun", baslangic: "2031-01-02" } }), BUGUN) === "3 günde 1 (sıradaki: 2 Ocak 2031 Per)" &&
  C.siklikMetni(mUcGecmis) === "3 günde 1 (sıradaki/başlangıç: 1 Şubat 2030)" && C.siklikMetni(mUcYok, BUGUN) === "3 günde 1 (başlangıç tarihi yok)" &&
  /1 Şubat 2030/.test(C.musterilerCsv({ musteriler: [mUcGecmis] })), C.siklikMetni(musteri({ siklik: { tur: "uc_gun", baslangic: "2031-01-02" } }), BUGUN));

/* ---------------- Haftalik ---------------- */
var kHf = C.kapsama(bos, mHafta, BUGUN, 14);
ok("haftalik Pzt+Per: 14 gunde 4 (04, 07, 11, 14)", j(kHf.slotlar.map(function (s) { return s.tarih; })) === j(["2030-03-04", "2030-03-07", "2030-03-11", "2030-03-14"]), j(kHf.slotlar));
// Gune ozel slot turu: Sal video, Cum post
var mKarma = musteri({ id: "mK0000000", siklik: { tur: "haftalik", gunler: [2, 5], haftalikAdet: 2, gunTurleri: { 5: "post" }, baslangic: null } });
var vKarma = { musteriler: [mKarma], etkinlikler: [], icerikler: [
  icerik({ musteriId: "mK0000000", durum: "hazir", tur: "reels" }), icerik({ musteriId: "mK0000000", durum: "hazir", tur: "post" }),
  icerik({ musteriId: "mK0000000", durum: "hazir", tur: "reels" })] };
var kKarma = C.kapsama(vKarma, mKarma, BUGUN, 7); // Sal 05, Cum 08
ok("gune ozel tur: Sal video, Cum post; her slot kendi turundeki hazirdan karsilanir", kKarma.karisik && kKarma.slotlar.length === 2 &&
  kKarma.slotlar[0].grup === "video" && kKarma.slotlar[1].grup === "post" && kKarma.oneri === 2 &&
  C.TUR_AD[vKarma.icerikler.filter(function (i) { return i.id === kKarma.slotlar[1].icerikId; })[0].tur] === "Post", j(kKarma.slotlar));
var vKarma2 = { musteriler: [mKarma], etkinlikler: [], icerikler: [icerik({ musteriId: "mK0000000", durum: "hazir", tur: "reels" }), icerik({ musteriId: "mK0000000", durum: "hazir", tur: "video" })] };
var kKarma2 = C.kapsama(vKarma2, mKarma, BUGUN, 7);
ok("gune ozel tur: video fazlasi post gununu karsilamaz (Cum acik)", kKarma2.slotlar[1].durum === "acik" && kKarma2.acik === 1 && kKarma2.oneri === 1, j(kKarma2.slotlar));
ok("siklikMetni gune ozel turu gosterir", C.siklikMetni(mKarma) === "Haftada 2: Sal, Cum (post)", C.siklikMetni(mKarma));
var mHfGunsuz = musteri({ siklik: { tur: "haftalik", gunler: [], haftalikAdet: 2, baslangic: null } });
var kHfYok = C.kapsama(bos, mHfGunsuz, BUGUN, 7);
ok("haftada 2 ama gun secilmedi: gun uydurulmaz, duzen kurulmali", !kHfYok.duzenTamam && kHfYok.ihtiyac === null && /gün/.test(kHfYok.eksik), j(kHfYok));
var mBelirsiz = musteri({ ucret: null, siklik: { tur: "belirsiz", gunler: [], haftalikAdet: null, baslangic: null } });
ok("siklik belirsiz: tahmin yok", !C.kapsama(bos, mBelirsiz, BUGUN, 14).duzenTamam && C.slotlar(mBelirsiz, BUGUN, 14) === null);
ok("siklikMetni", C.siklikMetni(mHafta) === "Haftada 2: Pzt, Per" && C.siklikMetni(mHfGunsuz) === "Haftada 2 (günler seçilmedi)" &&
  C.siklikMetni(mBelirsiz) === "Belirlenmedi" && /3 günde 1/.test(C.siklikMetni(mUc)), C.siklikMetni(mHafta));

/* ---------------- Bilinmeyen stok sifir sayilmaz ---------------- */
var mYeni = musteri({ stokGirisi: false });
var vYeni = { musteriler: [mYeni], etkinlikler: [], icerikler: [] };
var kYeni = C.kapsama(vYeni, mYeni, BUGUN, 7);
ok("stok girisi yok: acik null (0 degil), slotlar 'bilinmiyor', ilk acik yok", kYeni.acik === null && kYeni.ilkAcik === null &&
  kYeni.slotlar.every(function (s) { return s.durum === "bilinmiyor"; }) && kYeni.ihtiyac === 7, j(kYeni));
ok("stok girisi yok: stok.bilinen false", C.stok(vYeni, mYeni, BUGUN).bilinen === false);
var uy = C.stokUyarisi(vYeni, mYeni, BUGUN, 5);
ok("stok girisi yok: uyari 'bilinmiyor' (dusuk degil)", uy.seviye === "bilinmiyor" && /Stok girişi yapılmadı/.test(uy.nedenler[0]), j(uy));
var mGirildi = musteri({ stokGirisi: true, stokUyari: 3 });
var uy2 = C.stokUyarisi({ musteriler: [mGirildi], etkinlikler: [], icerikler: [] }, mGirildi, BUGUN, null);
ok("stok girildi ve 0: dusuk uyari (esik 3 + acik slotlar)", uy2.seviye === "dusuk" && uy2.nedenler.length === 2, j(uy2));
var mEsiksiz = musteri({ siklik: { tur: "belirsiz", gunler: [] }, stokUyari: null });
ok("esik yok, duzen yok: uyari uydurulmaz", C.stokUyarisi({ musteriler: [], icerikler: [] }, mEsiksiz, BUGUN, null).seviye === "tamam");
ok("varsayilan esik kullanilir", C.stokUyarisi({ musteriler: [], icerikler: [] }, mEsiksiz, BUGUN, 2).seviye === "dusuk");
// Esik musterinin beklenen paylasim turundeki hazirla karsilastirilir (post musterisinde videolar sayilmaz)
function turStoku(slotTuru, adet, tur) {
  var mu = musteri({ id: "mP0000000", ad: "Örnek Kafe", slotTuru: slotTuru, siklik: { tur: "haftalik", gunler: [1, 3, 5], haftalikAdet: 3, baslangic: null } });
  var l = [];
  for (var k = 0; k < adet; k++) l.push(icerik({ musteriId: "mP0000000", durum: "hazir", tur: tur }));
  return { m: mu, v: { musteriler: [mu], etkinlikler: [], icerikler: l } };
}
var tsPost = turStoku("post", 10, "post"), uyPost = C.stokUyarisi(tsPost.v, tsPost.m, BUGUN, 3);
ok("post musterisi, 10 hazir post, varsayilan esik 3: uyari yok; genel bakista stok uyarisi yok", uyPost.seviye === "tamam" &&
  C.genelBakis(tsPost.v, BUGUN, { varsayilanStokUyari: 3 }).stokUyarilari.length === 0, j(uyPost));
var tsPost2 = turStoku("post", 2, "post"), uyPost2 = C.stokUyarisi(tsPost2.v, tsPost2.m, BUGUN, 3);
ok("post musterisi, 2 hazir post: 'Hazır post stoku 2 (eşik 3)'", uyPost2.seviye === "dusuk" && uyPost2.nedenler[0] === "Hazır post stoku 2 (eşik 3)", j(uyPost2));
var tsVideo = turStoku("video", 10, "post"), uyVideo = C.stokUyarisi(tsVideo.v, tsVideo.m, BUGUN, 3);
ok("video musterisi, 10 hazir post 0 video: yine 'Hazır video stoku 0 (eşik 3)'", uyVideo.seviye === "dusuk" && uyVideo.nedenler[0] === "Hazır video stoku 0 (eşik 3)", j(uyVideo));
var tsStory = turStoku("story", 4, "reels"), tsDiger = turStoku("diger", 1, "diger");
ok("story ve diger musterisinde esik kendi turunden: 'Hazır story stoku 0', 'Hazır diğer stoku 1'", C.stokUyarisi(tsStory.v, tsStory.m, BUGUN, 2).nedenler[0] === "Hazır story stoku 0 (eşik 2)" &&
  C.stokUyarisi(tsDiger.v, tsDiger.m, BUGUN, 2).nedenler[0] === "Hazır diğer stoku 1 (eşik 2)", j(C.stokUyarisi(tsDiger.v, tsDiger.m, BUGUN, 2)));

/* ---------------- Ucret ozeti ---------------- */
var uo = C.ucretOzeti([musteri({ ucret: 10000 }), musteri({ ucret: 15000 }), musteri({ ucret: null }), musteri({ ucret: 5000, arsiv: true })]);
ok("ucret ozeti: bilinmeyen 0 sayilmaz, arsiv haric", uo.aktif === 3 && uo.bilinen === 2 && uo.bilinmeyen === 1 && uo.toplam === 25000, j(uo));

/* ---------------- Takvim ---------------- */
function etk(o) { return Object.assign({ id: "e" + (++sayac) + "aaaaaaa", musteriId: null, baslik: "Etkinlik", tur: "cekim", tumGun: false, basTarih: "2030-03-04", basSaat: "10:00", bitTarih: "2030-03-04", bitSaat: "12:00", durum: "planlandi", arsiv: false }, o); }
var e1 = etk({}), e2 = etk({ basSaat: "11:30", bitSaat: "13:00" }), e3 = etk({ basSaat: "12:00", bitSaat: "13:00" });
ok("saatli cakisma: 10-12 ile 11:30-13 cakisir", C.ustUste(e1, e2));
ok("uc uca degme cakisma degil: 10-12 ile 12-13", !C.ustUste(e1, e3));
var tg = etk({ tumGun: true, basSaat: null, bitSaat: null, basTarih: "2030-03-09", bitTarih: "2030-03-10" });
var tgIc = etk({ basTarih: "2030-03-10", bitTarih: "2030-03-10", basSaat: "15:00", bitSaat: "16:00" });
var tgDis = etk({ basTarih: "2030-03-11", bitTarih: "2030-03-11", basSaat: "00:00", bitSaat: "01:00" });
ok("iki gunluk tum gun etkinlik ikinci gundeki saatli cekimle cakisir", C.ustUste(tg, tgIc));
ok("tum gun etkinlik ertesi gun 00:00'da biter", !C.ustUste(tg, tgDis));
ok("tum gun etkinlik iki gunde de gorunur, ucuncude gorunmez", C.gundeMi(tg, "2030-03-09") && C.gundeMi(tg, "2030-03-10") && !C.gundeMi(tg, "2030-03-11"));
var gece = etk({ basTarih: "2030-03-04", basSaat: "22:00", bitTarih: "2030-03-05", bitSaat: "01:00" });
ok("gece yarisini asan cekim iki gunde gorunur ve ertesi sabahla cakisir", C.gundeMi(gece, "2030-03-05") &&
  C.ustUste(gece, etk({ basTarih: "2030-03-05", bitTarih: "2030-03-05", basSaat: "00:30", bitSaat: "02:00" })));
var iptal = etk({ durum: "iptal", basSaat: "10:30", bitSaat: "11:00" });
var arsivli = etk({ arsiv: true, basSaat: "10:30", bitSaat: "11:00" });
var tamam = etk({ durum: "tamamlandi", basSaat: "10:30", bitSaat: "11:00" });
var ch = C.cakismaHaritasi([e1, e2, e3, iptal, arsivli, tamam]);
ok("cakisma haritasi: iptal ve arsiv sayilmaz, tamamlanan sayilir", !ch[iptal.id] && !ch[arsivli.id] && ch[e1.id].indexOf(e2.id) !== -1 &&
  ch[e1.id].indexOf(tamam.id) !== -1 && ch[e2.id].indexOf(e3.id) !== -1 && (ch[e1.id] || []).indexOf(e3.id) === -1, j(ch));
ok("cakisanlar: aday kendisiyle cakismaz; iptal aday icin uyari yok", C.cakisanlar([e1, e2], e1).length === 1 && C.cakisanlar([e1, e2], Object.assign({}, e1, { durum: "iptal" })).length === 0);
ok("saatMetni", C.saatMetni(e1) === "10:00–12:00" && C.saatMetni(tg) === "Tüm gün, 9 Mart – 10 Mart", C.saatMetni(tg));

/* ---------------- Genel bakis ---------------- */
var mA = musteri({ id: "mA0000000" }), mB = musteri({ id: "mB0000000", ad: "Örnek B", stokGirisi: false, siklik: { tur: "belirsiz", gunler: [] } });
var gv = { musteriler: [mA, mB], etkinlikler: [e1, etk({ basTarih: "2030-03-02", bitTarih: "2030-03-02" }), etk({ basTarih: "2030-03-06", bitTarih: "2030-03-06" })], icerikler: [
  icerik({ durum: "kurguda", teslimTarihi: "2030-03-03" }),
  icerik({ durum: "kurguda", teslimTarihi: "2030-03-06" }),
  icerik({ durum: "onayda", teslimTarihi: "2030-03-01" }), // teslim edilmis (onayda) gecikmis sayilmaz
  icerik({ durum: "revizyonda" }),
  icerik({ durum: "cekildi" }),
  icerik({ durum: "hazir", planTarihi: "2030-03-01" }) // tarihi gecmis ama yayinlandi isaretlenmemis
] };
var gb = C.genelBakis(gv, BUGUN, { varsayilanStokUyari: null });
ok("genel bakis: bugunku etkinlik 1, yaklasan 1", gb.bugunEtkinlik.length === 1 && gb.yaklasanEtkinlik.length === 1);
ok("genel bakis: gecmis planli cekim otomatik tamamlanmaz, listelenir", gb.gecmisPlanliEtkinlik.length === 1 && gb.gecmisPlanliEtkinlik[0].durum === "planlandi");
ok("genel bakis: geciken teslim 1 (onaydaki sayilmaz), yaklasan 1", gb.gecikenTeslim.length === 1 && gb.yaklasanTeslim.length === 1);
ok("genel bakis: onayda 1, revizyonda 1", gb.onayda.length === 1 && gb.revizyonda.length === 1);
ok("genel bakis: tarihi gecen plan yayinlandi yapilmaz, listelenir", gb.gecmisPlanYayinlanmamis.length === 1 && gb.gecmisPlanYayinlanmamis[0].durum === "hazir");
ok("genel bakis: stok girisi olmayan musteri ayri, duzeni eksik musteri ayri", gb.stokBilinmeyen.length === 1 && gb.duzenEksik.length === 1 && gb.duzenEksik[0].musteri.id === "mB0000000");
var sA = gb.sayilar.filter(function (s) { return s.musteri.id === "mA0000000"; })[0];
ok("genel bakis: musteri sayilari (cekildi 1, kurguda 2, onayda 1, revizyonda 1, hazir 1)", sA.cekildi === 1 && sA.kurguda === 2 && sA.onayda === 1 && sA.revizyonda === 1 && sA.hazir === 1, j(sA));
ok("genel bakis: acik tarihler tarih sirasinda", gb.acikTarihler.every(function (x, i, a) { return i === 0 || a[i - 1].tarih <= x.tarih; }));
ok("genel bakis: bugun paylasilacaklar, yalniz bugune planli aktif hazirlar (oncelikli once)", (function () {
  var mArs = musteri({ id: "mR0000000", ad: "Örnek Arşiv", arsiv: true });
  var bugunNormal = icerik({ durum: "hazir", planTarihi: BUGUN, oncelik: "normal" }), bugunYuksek = icerik({ durum: "hazir", planTarihi: BUGUN, oncelik: "yuksek" });
  var v = { musteriler: [mA, mArs], etkinlikler: [], icerikler: [
    icerik({ durum: "hazir", planTarihi: "2030-03-03" }), bugunNormal, icerik({ durum: "hazir", planTarihi: "2030-03-05" }), bugunYuksek,
    icerik({ durum: "hazir", planTarihi: BUGUN, arsiv: true }),                      // arsivdeki icerik
    icerik({ durum: "hazir", planTarihi: BUGUN, musteriId: "mR0000000" }),           // arsivdeki musteri
    icerik({ durum: "kurguda", planTarihi: BUGUN }),                                 // hazir degil (ayri bolumde)
    icerik({ durum: "yayinlandi", planTarihi: BUGUN, yayinTarihi: BUGUN })            // yayinlanmis
  ] };
  var l = C.genelBakis(v, BUGUN, null).bugunPaylasilacaklar;
  return l.length === 2 && l[0].id === bugunYuksek.id && l[1].id === bugunNormal.id && C.genelBakis(gv, BUGUN, null).bugunPaylasilacaklar.length === 0;
})());

ok("onayaGidis: son onaya gonderim gunu; geri alma ve diger satirlar sayilmaz, bilinmeyende null", (function () {
  var n = C.durumDegistir(icerik({ durum: "kurguda" }), "onayda", "2030-02-28 10:00", BUGUN);
  var ikinci = Object.assign({}, n, { gecmis: n.gecmis.concat([{ z: "2030-03-01 09:00", m: "Müşteri onayında → Revizyonda" }, { z: "2030-03-02 18:00", m: "Revizyonda → Müşteri onayında" },
    { z: "2030-03-03 08:00", m: "Geri alındı: Yayına hazır → Müşteri onayında" }, { z: "2030-03-03 09:00", m: "Revizyon notu güncellendi" }]) });
  return C.onayaGidis(n) === "2030-02-28" && C.onayaGidis(ikinci) === "2030-03-02" &&
    C.onayaGidis(icerik({ durum: "onayda", gecmis: [{ z: "2030-03-01 12:00", m: "Toplu eklendi (Müşteri onayında)" }] })) === "2030-03-01" &&
    C.onayaGidis(icerik({ durum: "onayda", gecmis: [{ z: "2030-02-27 12:00", m: "Eklendi (Müşteri onayında)" }] })) === "2030-02-27" &&
    C.onayaGidis(icerik({ durum: "onayda", gecmis: [{ z: "2030-03-01 12:00", m: "Eklendi (Kurguda)" }] })) === null &&
    C.onayaGidis(icerik({ durum: "onayda", gecmis: [{ z: "bozuk", m: "Kurguda → Müşteri onayında" }] })) === null &&
    C.onayaGidis(icerik({ durum: "onayda" })) === null && C.onayaGidis(icerik({ durum: "onayda", gecmis: undefined })) === null &&
    C.gunFarki(C.onayaGidis(n), BUGUN) === 4;
})());
ok("genel bakis: onaydakiler en uzun bekleyen once, gonderim gunu bilinmeyenler sonda", (function () {
  var yeni = icerik({ durum: "onayda", gecmis: [{ z: "2030-03-03 10:00", m: "Kurguda → Müşteri onayında" }] });
  var bilinmeyen = icerik({ durum: "onayda" });
  var eski = icerik({ durum: "onayda", gecmis: [{ z: "2030-02-20 10:00", m: "Toplu eklendi (Müşteri onayında)" }] });
  var l = C.genelBakis({ musteriler: [mA], etkinlikler: [], icerikler: [yeni, bilinmeyen, eski] }, BUGUN, null).onayda;
  return l.map(function (i) { return i.id; }).join() === [eski.id, yeni.id, bilinmeyen.id].join();
})());

/* ---------------- Filtre, arama, CSV, yedek ---------------- */
var fv = { musteriler: [musteri({ ad: "Işıl Çağrı Öz" })], etkinlikler: [], icerikler: [icerik({ baslik: "Şubat kampanyası", durum: "onayda", planTarihi: "2030-03-10" }), icerik({ baslik: "Diğer", durum: "kurguda", arsiv: true })] };
ok("liste sirasi: yayinlananlar en sonda, digerleri tarihe gore", (function () {
  var l = [icerik({ durum: "yayinlandi", yayinTarihi: "2030-03-01", planTarihi: "2030-03-01" }), icerik({ durum: "kurguda", planTarihi: "2030-03-09" }),
    icerik({ durum: "hazir", planTarihi: "2030-03-05" }), icerik({ durum: "yayinlandi", yayinTarihi: "2030-03-03" })].sort(C.icerikSirala);
  return l[0].planTarihi === "2030-03-05" && l[1].planTarihi === "2030-03-09" && l[2].yayinTarihi === "2030-03-03" && l[3].yayinTarihi === "2030-03-01";
})());
ok("yuksek oncelik siralamada one gecer (0 || 1 hatasi yok)", (function () {
  var l = [icerik({ planTarihi: "2030-03-05", oncelik: "normal" }), icerik({ planTarihi: "2030-03-05", oncelik: "yuksek" })].sort(C.icerikSirala);
  var m2 = musteri({ id: "mY0000000" });
  var v2 = { musteriler: [m2], icerikler: [icerik({ musteriId: "mY0000000", durum: "hazir", oncelik: "normal", olusturma: 1 }), icerik({ musteriId: "mY0000000", durum: "hazir", oncelik: "yuksek", olusturma: 2 })] };
  var k = C.kapsama(v2, m2, BUGUN, 1);
  return l[0].oncelik === "yuksek" && v2.icerikler.filter(function (i) { return i.id === k.slotlar[0].icerikId; })[0].oncelik === "yuksek";
})());
ok("ucretCoz: Turkce binlik, bos, kusurat", C.ucretCoz("10.000") === 10000 && C.ucretCoz("10000") === 10000 && C.ucretCoz(" 12.345 TL") === 12345 &&
  C.ucretCoz("10.000,00") === 10000 && C.ucretCoz("") === null && isNaN(C.ucretCoz("15000.00")) && isNaN(C.ucretCoz("7,5")) && isNaN(C.ucretCoz("abc")) && isNaN(C.ucretCoz("1.00")));
ok("norm: NFD ve sifir genislikli karakter ayni anahtari verir", C.norm("Gu\u0308l\u200Bs\u0327ah") === C.norm("Gülşah") && C.katla("Gu\u0308l") === "gul");
ok("tarihi gecmis hazir icerik ileri gunler icin oneri havuzunda (kaybolmaz)", (function () {
  var m3 = musteri({ id: "mZ0000000" });
  var v3 = { musteriler: [m3], icerikler: [icerik({ musteriId: "mZ0000000", durum: "hazir", planTarihi: "2030-03-01" })] };
  var k = C.kapsama(v3, m3, BUGUN, 2), st = C.stok(v3, m3, BUGUN);
  return k.oneri === 1 && k.acik === 1 && st.atanmis === 0 && st.gecmisTarihli === 1 && st.atanmamis === 0 && st.toplam === 1;
})());
ok("haftada 2 ama 1 gun secili: duzen eksik (tahmin eksik sayilmaz)", (function () {
  var d = C.duzenDurumu(musteri({ siklik: { tur: "haftalik", gunler: [2], haftalikAdet: 2 } }));
  return !d.tamam && /2 gün seçilmeli \(1 seçili\)/.test(d.eksik);
})());
ok("gun istisnasi: o gunun beklenen turu degisir (gunluk musteri, 05 post)", (function () {
  var m4 = musteri({ id: "mW0000000", slotIstisna: { "2030-03-05": "post" } });
  var v4 = { musteriler: [m4], icerikler: [icerik({ musteriId: "mW0000000", durum: "hazir", tur: "post" }), icerik({ musteriId: "mW0000000", durum: "hazir" })] };
  var k = C.kapsama(v4, m4, BUGUN, 2);
  return k.karisik && k.slotlar[0].grup === "video" && k.slotlar[1].grup === "post" && k.oneri === 2;
})());
ok("genel bakis: duzeni olmayan musterinin 7 gun icindeki hazir olmayan planli icerigi gorunur", (function () {
  var m5 = musteri({ id: "mV0000000", siklik: { tur: "belirsiz", gunler: [] }, stokGirisi: false });
  var v5 = { musteriler: [m5], etkinlikler: [], icerikler: [icerik({ musteriId: "mV0000000", durum: "kurguda", planTarihi: "2030-03-05" }), icerik({ musteriId: "mV0000000", durum: "hazir", planTarihi: "2030-03-05" })] };
  var gb = C.genelBakis(v5, BUGUN, null);
  return gb.planliHazirDegil.length === 1 && gb.planliHazirDegil[0].durum === "kurguda" && gb.sayilar[0].stokBilinen === false;
})());
ok("takvim: gece yarisini asan cekim ikinci gunde bitis saatiyle gorunur", C.gundekiSaat(gece, "2030-03-04") === "22:00" && C.gundekiSaat(gece, "2030-03-05") === "–01:00" &&
  C.gundekiSaat(etk({ basTarih: "2030-03-04", bitTarih: "2030-03-06", basSaat: "10:00", bitSaat: "12:00" }), "2030-03-05") === "devam");
ok("yedekCoz: yedekte ayar null ise iletilir (tumunu degistir ayari da kaldirsin); tanimsizsa iletilmez", (function () {
  var a = C.yedekCoz({ format: "suflo-studio-yedek", veriler: { musteriler: [], ayar: null } }).veriler, b = C.yedekCoz({ musteriler: [] }).veriler;
  return a.ayar === null && Object.prototype.hasOwnProperty.call(a, "ayar") && !Object.prototype.hasOwnProperty.call(b, "ayar");
})());
ok("yedekCoz: taninmayan ust duzey alanlar listelenir", (function () {
  var c = C.yedekCoz({ format: "suflo-studio-yedek", surum: 1, veriler: { musteriler: [], cekimler: [{}] }, ekstra: 1 });
  return c.bilinmeyen.indexOf("cekimler") !== -1 && c.bilinmeyen.indexOf("ekstra") !== -1 && C.yedekCoz({ musteriler: [] }).bilinmeyen.length === 0;
})());
ok("yedekCoz ayar kaydini da tasir", C.yedekCoz({ format: "suflo-studio-yedek", veriler: { musteriler: [], ayar: { varsayilanStokUyari: 3 } } }).veriler.ayar.varsayilanStokUyari === 3);
ok("filtre: durum listesi", C.icerikFiltrele(fv, { durum: "onayda,kurguda" }).length === 1);
ok("filtre: arsiv ayri", C.icerikFiltrele(fv, { arsiv: true }).length === 1 && C.icerikFiltrele(fv, {}).length === 1);
ok("filtre: tarih araligi", C.icerikFiltrele(fv, { tarihAlan: "plan", bas: "2030-03-09", bit: "2030-03-11" }).length === 1 && C.icerikFiltrele(fv, { bas: "2030-03-11" }).length === 0);
ok("arama: harf katlama ve musteri adi", C.ara(fv, "subat").icerikler.length === 1 && C.ara(fv, "ISIL cagri").musteriler.length === 1 && C.ara(fv, "isil").icerikler.length === 2);
var csv = C.iceriklerCsv({ musteriler: [musteri({ ad: "=HYPERLINK(1)" })], etkinlikler: [], icerikler: [icerik({ baslik: 'A;"B"', not: "+1" })] });
ok("CSV: BOM, ; ayirici, tirnak kacisi, formul engeli", csv.charCodeAt(0) === 0xFEFF && csv.indexOf('"A;""B"""') !== -1 && csv.indexOf("'=HYPERLINK(1)") !== -1 && csv.indexOf("'+1") !== -1, csv);
ok("yedekCoz: suflo-studio-yedek ve duz liste", C.yedekCoz({ format: "suflo-studio-yedek", veriler: { musteriler: [{}] } }).veriler.musteriler.length === 1 &&
  C.yedekCoz({ etkinlikler: [] }).veriler && !!C.yedekCoz({ x: 1 }).hata && !!C.yedekCoz(null).hata);
ok("yerel yol uyarisi", C.yerelYol("C:\\Kurgu\\a.prproj") && C.yerelYol("/Users/x/a.mp4") && C.yerelYol("file:///a") && C.yerelYol("\\\\nas\\x") && !C.yerelYol("https://drive.example.com/x"));
ok("guvenli link yalniz http(s)", C.guvenliLink("https://a.example/x") && !C.guvenliLink("javascript:alert(1)") && !C.guvenliLink("data:text/html,x"));

/* ---------------- Metin, dogrulama ve cekim sonrasi ---------------- */
ok("makulTarih: yili iki haneli yazilan tarih (0026) ve 2000-2099 disi kaydedilmez", C.makulTarih("2026-10-21") && C.makulTarih("2028-02-29") && !C.makulTarih("2027-02-29") &&
  !C.makulTarih("0026-10-21") && !C.makulTarih("1999-12-31") && !C.makulTarih("2100-01-01") && C.makulTarih("2099-12-31") && !C.makulTarih(""));
ok("onay metni: 'GERİ YÜKLE' her yazilisi ayni katlanir, eksik metin katlanmaz", ["GERİ YÜKLE", "GERI YUKLE", "geri yükle", "Geri Yükle", " geri  yukle "].every(function (x) {
  return C.katla(x) === C.katla("GERİ YÜKLE");
}) && C.katla("GERI") !== C.katla("GERİ YÜKLE"));
(function () {
  var tamam = etk({ id: "eTamam0001", durum: "tamamlandi" }), plan = etk({ id: "ePlan00001", durum: "planlandi" }), iptal = etk({ id: "eIptal0001", durum: "iptal" });
  var unutulan = icerik({ durum: "cekim_planlandi", cekimId: tamam.id }), fikir = icerik({ durum: "fikir", cekimId: tamam.id });
  var v = { musteriler: [mA], etkinlikler: [tamam, plan, iptal], icerikler: [unutulan, fikir,
    icerik({ durum: "cekim_planlandi", cekimId: plan.id }), icerik({ durum: "cekim_planlandi", cekimId: iptal.id }),
    icerik({ durum: "kurguda", cekimId: tamam.id }), icerik({ durum: "cekim_planlandi", cekimId: tamam.id, arsiv: true }), icerik({ durum: "cekim_planlandi" })] };
  var l = C.genelBakis(v, BUGUN, null).cekimiBitenPlanli;
  ok("genel bakis: cekimi tamamlanip 'Çekildi' yapilmayan icerikler (planlanan / iptal cekim, kurgudaki ve arsivdeki haric)",
    l.length === 2 && l.indexOf(unutulan) !== -1 && l.indexOf(fikir) !== -1, j(l.map(function (i) { return i.durum + ":" + i.cekimId; })));
})();
var mCsv = C.musterilerCsv({ musteriler: [musteri({ ad: "Kafe Ornek", slotTuru: "diger" }), musteri({ ad: "Kafe Ornek 2", slotTuru: undefined })] });
ok("musteri CSV: 'Beklenen paylaşım türü' basligi ve Turkce deger (diger -> Diğer, bos -> Video)", /;Beklenen paylaşım türü;/.test(mCsv) && !/Slot/.test(mCsv) &&
  /;Diğer;/.test(mCsv) && !/;diger;/.test(mCsv) && /;Video \(Reels \/ video\);/.test(mCsv), mCsv);
ok("icerik CSV: dosya sutunlari formdaki adlarla", /Ham görüntü bağlantısı;Proje dosyası bağlantısı;Final bağlantısı/.test(C.iceriklerCsv({ icerikler: [] })));
ok("yedekCoz: hata metinleri sade Turkce (alan adi yok)", /^Bu dosyada müşteri, içerik ya da çekim listesi bulunamadı/.test(C.yedekCoz({ x: 1 }).hata) &&
  C.yedekCoz(null).hata === "Bu dosya bir Suflo Studio yedeği değil.", C.yedekCoz({ x: 1 }).hata);

/* ---------------- Arayuz dosyalari (CI'da tarayici olmadan da): sozdizimi ve index.html baglantilari ---------------- */
var fs = require("fs"), path = require("path"), vm = require("vm");
var STUDIO = path.join(__dirname, "..", "server", "studio-v1"), ARAYUZ = path.join(STUDIO, "arayuz");
["studio.js", "studio-core.js"].forEach(function (f) {
  var hata = null;
  try { new vm.Script(fs.readFileSync(path.join(ARAYUZ, f), "utf8"), { filename: f }); } catch (e) { hata = e; }
  ok("arayuz " + f + ": sozdizimi gecerli", !hata, hata && hata.stack);
});
var html = fs.readFileSync(path.join(ARAYUZ, "index.html"), "utf8");
var bagli = (html.match(/(?:src|href)="[^"]+"/g) || []).map(function (x) { return x.replace(/^(?:src|href)="|"$/g, ""); });
var eksik = bagli.filter(function (f) { return !/^[a-z]+:/i.test(f) && !fs.existsSync(path.join(ARAYUZ, f)); });
ok("index.html: studio.js ve studio-core.js bagli, bagli yerel dosyalarin hepsi var", bagli.indexOf("studio.js") !== -1 && bagli.indexOf("studio-core.js") !== -1 && eksik.length === 0, j(bagli) + " eksik: " + j(eksik));
// Elle yuklenen guvenlik dosyalari (php -S .htaccess okumaz; icerikleri burada denetlenir)
var ht = fs.readFileSync(path.join(STUDIO, ".htaccess"), "utf8");
var desen = (ht.match(/<FilesMatch "([^"]+)">/) || [])[1], kapali = desen ? new RegExp(desen) : null;
ok("v1/.htaccess: config / sifre-ozeti / sqlite / yedek dosyalari kapali, index.php acik, dizin listesi yok", !!kapali && /Options -Indexes/.test(ht) && /Require all denied/.test(ht) &&
  ["config.php", "config.example.php", "sifre-ozeti.php", "studio.sqlite", "studio.sqlite-wal", "studio.sqlite-shm", "yedek.json", "README.md"].every(function (f) { return kapali.test(f); }) &&
  !kapali.test("index.php"), desen);
var aht = fs.readFileSync(path.join(STUDIO, "arayuz.htaccess"), "utf8");
ok("arayuz.htaccess: cerceveye gomme yok, nosniff, CSP script-src 'self'", /X-Frame-Options "DENY"/.test(aht) && /frame-ancestors 'none'/.test(aht) && /nosniff/.test(aht) && /script-src 'self'[;"]/.test(aht));

console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
process.exit(kalan ? 1 : 0);
