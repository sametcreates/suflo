// Suflo testi: js/egri-model.js — Eğri sekmesinin saf modeli (3.4 adım 10): yoklama kararı, playhead'i saran çift
// (host KS_easeCift ile aynı kural), canlı kayıt aralığı, aralık çipi, bake grupları (Opaklık 0..100, kayıtlı öğede
// degistir), sonraki çift, Premiere'de önizleme adımları (≤ 12/sn), kısayollar ve CEP tuş ilgisi, kullanıcı
// önayarları, düzenleyici geometrisi (sürükleme, Shift 0,05, yumuşak / kırık tutamaç, nokta ekle / sil), önizleme sahnesi.
var path = require("path");
var KOK = path.join(__dirname, "..");
var E = require(path.join(KOK, "js", "ease-curve.js"));
var KR = require(path.join(KOK, "js", "key-records.js"));
var M = require(path.join(KOK, "js", "egri-model.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function yakin(a, b, e) { return Math.abs(a - b) <= (e || 1e-6); }

/* ---------------- yoklama ---------------- */
ok("yoklamaUygun: görünür + odak + boş", M.yoklamaUygun({ gorunur: true, odak: true, mesgul: false }) === true);
ok("yoklamaUygun: gizli / odaksız / meşgulken hayır", !M.yoklamaUygun({ gorunur: false, odak: true }) && !M.yoklamaUygun({ gorunur: true, odak: false }) &&
  !M.yoklamaUygun({ gorunur: true, odak: true, mesgul: true }) && !M.yoklamaUygun());
var ob = { seqId: "s1", selSig: "a|1|2", kapsam: [0, 10], ph: 5 };
ok("karar: önbellek yoksa tara", M.yoklamaKarari(null, { ok: true, seqId: "s1", selSig: "", ph: 0 }) === "tara");
ok("karar: sekans ya da seçim imzası değişince tara", M.yoklamaKarari(ob, { ok: true, seqId: "s2", selSig: "a|1|2", ph: 5 }) === "tara" &&
  M.yoklamaKarari(ob, { ok: true, seqId: "s1", selSig: "b|1|2", ph: 5 }) === "tara");
ok("karar: playhead kapsam dışında tara, içinde 'ciftler', aynıysa 'bekle'", M.yoklamaKarari(ob, { ok: true, seqId: "s1", selSig: "a|1|2", ph: 10 }) === "tara" &&
  M.yoklamaKarari(ob, { ok: true, seqId: "s1", selSig: "a|1|2", ph: 6 }) === "ciftler" && M.yoklamaKarari(ob, { ok: true, seqId: "s1", selSig: "a|1|2", ph: 5 }) === "bekle");
ok("karar: başarısız peek → bekle", M.yoklamaKarari(ob, { ok: false }) === "bekle" && M.yoklamaKarari(ob, null) === "bekle");

/* ---------------- çift ---------------- */
var keys = [1, 2, 3];
ok("çift: playhead iki anahtar arasında", js(M.ciftBul(keys, 1.5, 25)) === js({ i0: 0, i1: 1, t0: 1, t1: 2, ic: 0, kayitli: false }));
ok("çift: anahtarın üstünde → o ve sonraki; sonuncuda bir önceki; 0,25 kare tolerans", M.ciftBul(keys, 2, 25).t0 === 2 && M.ciftBul(keys, 3, 25).t0 === 2 &&
  M.ciftBul(keys, 1.995, 25).t0 === 2 && M.ciftBul(keys, 3.009, 25).t1 === 3);
ok("çift: dışında ya da < 2 anahtar → null", M.ciftBul(keys, 0.9, 25) === null && M.ciftBul(keys, 3.1, 25) === null && M.ciftBul([1], 1, 25) === null && M.ciftBul([], 0, 25) === null);
var ic = [1, 1.04, 1.08, 1.12, 2];
ok("çift: canlı kayıt aralığı Suflo'nun iç anahtarlarıyla bölünmez", js(M.ciftBul(ic, 1.06, 25, [[1, 2]])) === js({ i0: 0, i1: 4, t0: 1, t1: 2, ic: 3, kayitli: true }) &&
  M.ciftBul(ic, 1.06, 25).t1 === 1.08);
ok("çift: aralığın ucu yoksa kayıt yok sayılır", M.ciftBul([1, 1.04, 1.08], 1.02, 25, [[1, 2]]).kayitli === false);
ok("kare sayısı ve aralık çipi (Türkçe ondalık)", M.kareSayisi(1.2, 2, 24) === 19 && M.aralikMetni(1.2, 2, 30) === "1,20 sn → 2,00 sn · 24 kare" && M.sayi(-0.001) === "0,00");
var p0 = { keys: [11, 13], fps: 25, pair: { t0: 11, t1: 13 }, v0: 0, v1: 1 };
ok("satır durumu: tamam + uç değerleri bu çiftin", js(M.satirDurumu(p0, 12)) === js({ cift: { i0: 0, i1: 1, t0: 11, t1: 13, ic: 0, kayitli: false }, durum: "tamam", degerVar: true }));
ok("satır durumu: dışında / 1 kare / değer yok", M.satirDurumu(p0, 14).durum === "disinda" && M.satirDurumu({ keys: [1, 1.04], fps: 25, pair: null }, 1.02).durum === "tekKare" &&
  M.satirDurumu({ keys: [11, 13, 15], fps: 25, pair: { t0: 11, t1: 13 }, v0: 0, v1: 1 }, 14).degerVar === false);

/* ---------------- kayıtlar ---------------- */
var pr = { nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", keys: [1, 1.04, 1.08, 1.12, 2], fps: 25 };
var rec = KR.kayit({ id: "kr1", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", uclar: [1, 2], times: [1.04, 1.08, 1.12] });
var baska = KR.kayit({ id: "kr2", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 0, matchName: "AE.ADBE Motion/Position", uclar: [1, 2], times: [1.5] });
var olu = KR.kayit({ id: "kr3", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", uclar: [3, 4], times: [3.5] });
ok("satır kayıtları: yalnız aynı klip + bileşen + özellik + kimlik", js(M.satirKayitlari([rec, baska, olu], pr).map(function (r) { return r.id; })) === js(["kr1", "kr3"]));
ok("canlı kayıtlar: uçları ve zamanlarının %60'ı anahtarlarda olan", js(M.canliKayitlar([rec, baska, olu], pr).map(function (r) { return r.id; })) === js(["kr1"]));
ok("ipuçları: canlı kayıtların uçları (host'a)", js(M.ipuclari([rec, olu], [pr])) === js([{ nodeId: "n1", compIdx: 0, propIdx: 1, t0: 1, t1: 2 }]));
ok("satır kaydı: çiftle aynı uçlu canlı kayıt", M.satirKaydi([rec], pr, { t0: 1, t1: 2 }).id === "kr1" && M.satirKaydi([rec], pr, { t0: 1, t1: 1.04 }) === null);
var yeni = { id: "kr9", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, uclar: [1.5, 2.5] };
ok("çakışanlar: aynı satır ve kesişen uçlar (yeni eğri eskinin yerine)", js(M.cakisanlar([rec, baska, olu], yeni).map(function (r) { return r.id; })) === js(["kr1"]));

/* ---------------- bake grupları ---------------- */
var pA = { nodeId: "nA", clipName: "A.mp4", clipStart: 0, compIdx: 1, propIdx: 0, matchName: "AE.ADBE Opacity/Opacity", opak: true, fps: 25, v0: 0, v1: 100 };
var pB = { nodeId: "nA", clipName: "A.mp4", clipStart: 0, compIdx: 0, propIdx: 0, matchName: "AE.ADBE Motion/Position", opak: false, fps: 25, v0: [0, 0], v1: [10, 20] };
var pC = { nodeId: "nB", clipName: "B.mp4", clipStart: 5, compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", opak: false, fps: 25, v0: 100, v1: 150 };
var g = M.bakeGruplari([
  { prop: pA, cift: { t0: 1, t1: 2, kayitli: false } },
  { prop: pB, cift: { t0: 1, t1: 2, kayitli: true } },
  { prop: pC, cift: { t0: 6, t1: 6.04, kayitli: false } },
  { prop: pC, cift: null },
  { prop: { nodeId: "nD", fps: 25, v0: null, v1: 1 }, cift: { t0: 1, t1: 2 } }
], E.builtin("tasma").curve, 2, "s1");
ok("bake grupları: klip başına bir grup, hedef kimliği + sekans", g.gruplar.length === 1 && g.gruplar[0].target.nodeId === "nA" && g.gruplar[0].target.seqId === "s1" && g.gruplar[0].items.length === 2);
ok("bake grupları: Opaklık 0..100 (Taşma eğrisi aşsa da), [x,y] değerler, adım 2", g.gruplar[0].items[0].keys.every(function (k) { return k.v >= 0 && k.v <= 100; }) &&
  g.gruplar[0].items[0].keys.some(function (k) { return k.v === 100; }) && Array.isArray(g.gruplar[0].items[1].keys[0].v) && g.gruplar[0].items[0].keys.length === 12);
ok("bake grupları: degistir yalnız kayıtlı (Suflo'nun) öğede", g.gruplar[0].items[0].degistir === false && g.gruplar[0].items[1].degistir === true);
ok("bake grupları: 1 kare, çift yok ve değer yok atlanır (nedenleriyle)", js(g.atlanan.map(function (a) { return a.kod; })) === js(["bos", "disinda", "degerYok"]));

/* ---------------- gezinme ---------------- */
ok("sonraki çift: playhead'den sonraki ilk çiftin başı + 0,25 kare", M.sonrakiCift([{ keys: [1, 2, 3] }, { keys: [1.5, 4] }], 1.2, 25) === 1.51 &&
  M.sonrakiCift([{ keys: [1, 2, 3] }], 2.5, 25) === 1.01, M.sonrakiCift([{ keys: [1, 2, 3] }, { keys: [1.5, 4] }], 1.2, 25));
ok("sonraki çift: son anahtar çift başı değildir; hiç yoksa null", M.sonrakiCift([{ keys: [1, 2] }], 1.5, 25) === 1.01 && M.sonrakiCift([], 0, 25) === null);
var ad = M.onizlemeAdimlari(1, 2, 25);
ok("Premiere'de önizle: saniyede en çok 12 adım, kareye oturur, sonda t1", ad.length === 10 && ad[0] === 1 && ad[ad.length - 1] === 2 && ad.every(function (t, i) { return !i || t > ad[i - 1]; }) &&
  yakin(ad[1] - ad[0], 0.12) && M.onizlemeAdimlari(0, 10, 60, 99).length <= 121, js(ad));
ok("Premiere'de önizle: geçersiz aralık boş", M.onizlemeAdimlari(2, 1, 25).length === 0);

/* ---------------- kısayollar ---------------- */
function tus(key, hedef, ek) { var e = { key: key, target: hedef || { tagName: "DIV" } }; for (var k in ek || {}) e[k] = ek[k]; return M.kisayol(e); }
ok("kısayollar: Enter U F I V 1–9 Delete", tus("Enter").eylem === "uygula" && tus("u").eylem === "geriAl" && tus("U").eylem === "geriAl" && tus("f").eylem === "cevir" &&
  tus("i").eylem === "tersCevir" && tus("v").eylem === "gorunum" && js(tus("7")) === js({ eylem: "onayar", n: 7 }) && tus("Delete").eylem === "sil" && tus("Backspace").eylem === "sil");
ok("kısayollar: yazı alanında, select'te, contenteditable'da yok", tus("f", { tagName: "INPUT", type: "text" }) === null && tus("f", { tagName: "INPUT" }) === null &&
  tus("1", { tagName: "INPUT", type: "number" }) === null && tus("u", { tagName: "TEXTAREA" }) === null && tus("v", { tagName: "SELECT" }) === null &&
  tus("i", { tagName: "DIV", isContentEditable: true }) === null);
ok("kısayollar: onay kutusunda çalışır; Enter düğmede düğmeye kalır; Ctrl / Cmd / Alt Premiere'e", tus("f", { tagName: "INPUT", type: "checkbox" }).eylem === "cevir" &&
  tus("Enter", { tagName: "BUTTON" }) === null && tus("f", null, { ctrlKey: true }) === null && tus("f", null, { metaKey: true }) === null && tus("f", null, { altKey: true }) === null &&
  tus("0") === null && tus("x") === null);
var ilgiW = JSON.parse(M.tusIlgisi(false)), ilgiM = JSON.parse(M.tusIlgisi(true));
ok("CEP tuş ilgisi: 16 tuş (Windows VK / macOS), değiştiricisiz; Delete ve F dahil", ilgiW.length === 16 && ilgiM.length === 16 &&
  ilgiW.some(function (k) { return k.keyCode === 46; }) && ilgiW.some(function (k) { return k.keyCode === 70; }) && ilgiM.some(function (k) { return k.keyCode === 117; }) &&
  ilgiM.some(function (k) { return k.keyCode === 3; }) && ilgiW.every(function (k) { return Object.keys(k).length === 1; }));

/* ---------------- kullanıcı önayarları ---------------- */
var r1 = M.onayarEkle([], "", E.builtin("guclu-s").curve, 1700000000000);
ok("önayar ekle: ad yoksa 'Benim eğrim 1', id biçimi", r1.ok && r1.liste.length === 1 && r1.liste[0].ad === "Benim eğrim 1" && /^k[0-9a-z]+$/.test(r1.id), js(r1));
var bozuk = M.onayarlar([{ id: "k1", ad: "A", curve: { type: "bezier", x1: 0.1, y1: 0, x2: 0.9, y2: 1 } }, { id: "k1", ad: "kopya", curve: { type: "bezier", x1: 0, y1: 0, x2: 1, y2: 1 } },
  { id: "../x", ad: "B", curve: E.builtin("yumusak").curve }, { id: "k2", ad: "C", curve: { type: "yok" } }, null, "metin", { id: "k3", ad: "  \u0007Adı  ", curve: E.builtin("esnek").curve }]);
ok("önayarlar: bozuk / tekrar / geçersiz eğri atılır, ad temizlenir", js(bozuk.map(function (o) { return o.id + ":" + o.ad; })) === js(["k1:A", "k3:Adı"]), js(bozuk));
var dolu = []; for (var i = 0; i < 24; i++) dolu.push({ id: "k" + i.toString(36), ad: "E" + i, curve: E.builtin("yumusak").curve });
ok("önayarlar: en çok 24; dolunca eklenmez", M.onayarlar(dolu.concat([{ id: "kzz", ad: "fazla", curve: E.builtin("yumusak").curve }])).length === 24 &&
  M.onayarEkle(dolu, "x", E.builtin("yumusak").curve, 1).kod === "dolu");
ok("önayar sil", M.onayarSil(r1.liste, r1.id).length === 0 && M.onayarAdi(r1.liste) === "Benim eğrim 2");

/* ---------------- düzenleyici geometrisi ---------------- */
ok("ekran ↔ eğri koordinatı (y -0,5..1,5)", M.ekranX(0) === 16 && M.ekranX(1) === 304 && M.ekranY(1.5) === 16 && M.ekranY(-0.5) === 204 && yakin(M.egriX(M.ekranX(0.3)), 0.3) &&
  yakin(M.egriY(M.ekranY(1.2)), 1.2) && M.egriY(0) === 1.5 && M.egriY(999) === -0.5);
var bz = E.builtin("yumusak").curve;
ok("sürükle bezier: Shift 0,05'e yapışır, y düzenleyicide 1,5'te durur", js(M.surukle(bz, { tur: "p1" }, 0.33, 1.62, { shift: true })) === js({ type: "bezier", x1: 0.35, y1: 1.5, x2: 0.25, y2: 1 }) &&
  M.surukle(bz, { tur: "p2" }, 1.4, -0.9).x2 === 1 && M.surukle(bz, { tur: "p2" }, 1.4, -0.9).y2 === -0.5);
ok("sürükle: düzenlenemeyen (Penner / yay) ve geçersiz hedef null", M.surukle(E.builtin("ziplama").curve, { tur: "p1" }, 0.5, 0.5) === null && M.surukle(bz, { tur: "x" }, 0.5, 0.5) === null &&
  M.duzenlenebilir(bz) && !M.duzenlenebilir(E.builtin("yay-canli").curve));
var cm = M.noktaEkle(bz, 0.5);
ok("çift tık: nokta eklenir, şekil değişmez", cm && cm.type === "multi" && cm.pts.length === 3 &&
  [0.1, 0.3, 0.5, 0.7, 0.9].every(function (x) { return Math.abs(E.toFunction(cm)(x) - E.toFunction(bz)(x)) < 1e-4; }));
var tasindi = M.surukle(cm, { tur: "nokta", i: 1 }, 0.6, 0.9);
ok("nokta sürükle: tutamaçlarıyla birlikte taşınır, x komşular arasında kalır", tasindi.pts[1].x === 0.6 && tasindi.pts[1].y === 0.9 &&
  yakin(tasindi.pts[1].ox - tasindi.pts[1].x, cm.pts[1].ox - cm.pts[1].x, 1e-5) && M.surukle(cm, { tur: "nokta", i: 1 }, 1.5, 0.5).pts[1].x <= 0.99 &&
  M.surukle(cm, { tur: "nokta", i: 0 }, 0.5, 0.5) === null);
var yum = M.surukle(cm, { tur: "cikis", i: 1 }, cm.pts[1].x + 0.1, cm.pts[1].y + 0.1);
var vO = [yum.pts[1].ox - yum.pts[1].x, yum.pts[1].oy - yum.pts[1].y], vI = [yum.pts[1].ix - yum.pts[1].x, yum.pts[1].iy - yum.pts[1].y];
ok("yumuşak nokta: tutamaç sürüklenince karşı tutamaç aynı doğrultuda (ters yön)", Math.abs(vO[0] * vI[1] - vO[1] * vI[0]) < 1e-5 && vO[0] * vI[0] < 0, js([vO, vI]));
var kirik = M.surukle(cm, { tur: "cikis", i: 1 }, cm.pts[1].x + 0.1, cm.pts[1].y + 0.2, { alt: true });
ok("Alt: tutamaçlar ayrılır (smooth kalkar, karşı tutamaç yerinde)", kirik.pts[1].smooth === false && yakin(kirik.pts[1].ix, cm.pts[1].ix) && yakin(kirik.pts[1].iy, cm.pts[1].iy));
ok("nokta sil: iki nokta kalınca yine bezier; uç noktalar silinmez", M.noktaSil(cm, 1).type === "bezier" && M.noktaSil(cm, 0) === null && M.noktaSil(bz, 1) === null);
var tt = M.tutamaclar(cm);
ok("tutamaçlar: çok noktalıda 4 tutamaç + 1 ara nokta; bezier'de 2", tt.filter(function (t) { return t.tur === "tutamac"; }).length === 4 && tt.filter(function (t) { return t.tur === "nokta"; }).length === 1 &&
  M.tutamaclar(bz).length === 2 && M.tutamaclar(E.builtin("esnek").curve).length === 0);
ok("en yakın hedef: yarıçap içinde, nokta tutamaçtan önce", M.enYakin(bz, M.ekranX(0.25) + 3, M.ekranY(0.1) - 2, 9).hedef.tur === "p1" && M.enYakin(bz, 160, 30, 9) === null);
ok("yollar: değer ve hız SVG yolları sayısal, NaN yok", /^M[\d. L-]+$/.test(M.degerYolu(bz, 20)) && /^M[\d. L-]+$/.test(M.hizYolu(E.builtin("yay-canli").curve, 20)) &&
  /^M[\d. L-]+$/.test(M.kucukYol(E.builtin("esnek").curve, 48, 30)) && !/NaN/.test(M.degerYolu(E.builtin("ziplama").curve) + M.hizYolu(cm)));
var s0 = M.sahneKaresi(bz, 0), s1 = M.sahneKaresi(bz, 1100), s2 = M.sahneKaresi(bz, 1400), s3 = M.sahneKaresi(bz, 1550);
ok("önizleme sahnesi: 0 → 1 gider, sonda bekler, döngü başa döner; büyür", s0.x === 0 && s1.x === 1 && s2.x === 1 && s3.x === 0 && s1.olcek > s0.olcek && M.sahneKaresi(E.builtin("tasma").curve, 700).x > 1);

/* ---------------- inceleme: yarı açık kayıt aralığı, sonraki çift, taşınan klip, uzun kayıt, zaman aşımı ---------------- */
var yogun = []; for (var yi = 1; yi < 50; yi++) yogun.push(Math.round((1 + yi * 0.04) * 10000) / 10000);
var abc = [1].concat(yogun).concat([3, 5]);   // A=1, B=3, C=5; [A,B] canlı Suflo kaydı (her kare)
ok("çift: playhead B'de ve B + 0,25 karede B → C (düz kural); içeride kayıt çifti", M.ciftBul(abc, 3, 25, [[1, 3]]).t0 === 3 && M.ciftBul(abc, 3, 25, [[1, 3]]).t1 === 5 &&
  M.ciftBul(abc, 3.01, 25, [[1, 3]]).t0 === 3 && M.ciftBul(abc, 3.01, 25, [[1, 3]]).kayitli === false && M.ciftBul(abc, 2.98, 25, [[1, 3]]).kayitli === true,
  js([M.ciftBul(abc, 3, 25, [[1, 3]]), M.ciftBul(abc, 3.01, 25, [[1, 3]])]));
ok("çift: B son anahtarsa playhead B'deyken kayıt çifti kalır", js(M.ciftBul([1].concat(yogun).concat([3]), 3, 25, [[1, 3]])) === js({ i0: 0, i1: 50, t0: 1, t1: 3, ic: 49, kayitli: true }));
ok("sonraki çift: canlı kaydın iç anahtarları atlanır (A içinden ve A'dan B'ye), C son anahtar → başa döner", M.sonrakiCift([{ keys: abc, uclar: [[1, 3]] }], 2, 25) === 3.01 &&
  M.sonrakiCift([{ keys: abc, uclar: [[1, 3]] }], 1.01, 25) === 3.01 && M.sonrakiCift([{ keys: abc, uclar: [[1, 3]] }], 3.01, 25) === 1.01 &&
  M.sonrakiCift([{ keys: abc }], 2, 25) === 2.05, js([M.sonrakiCift([{ keys: abc, uclar: [[1, 3]] }], 2, 25), M.sonrakiCift([{ keys: abc }], 2, 25)]));
// taşınan klip: anahtarlar kaynak zamanında klip ile kayar, kayıt kaymaz → canlılık kaymayla ölçülür
var kayitT = KR.kayit({ id: "krt", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", clipStart: 10, uclar: [11, 13],
  times: yogun.map(function (t) { return Math.round((t + 10) * 10000) / 10000; }) });
var tasinan = { nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", fps: 25, clipStart: 12,
  keys: [13].concat(yogun.map(function (t) { return Math.round((t + 12) * 10000) / 10000; })).concat([15]) };
var ct = M.canliKayitlar([kayitT], tasinan);
ok("taşınan klip: kayıt kayma kadar kaydırılıp canlı sayılır (aynı id, uçlar ve clipStart kaymış)", ct.length === 1 && ct[0].id === "krt" && js(ct[0].uclar) === js([13, 15]) &&
  ct[0].clipStart === 12 && yakin(ct[0].times[0], 13.04) && kayitT.uclar[0] === 11, js(ct.map(function (r) { return [r.id, r.uclar, r.clipStart]; })));
var sdT = M.satirDurumu(tasinan, 14, M.uclarDan(ct));
ok("taşınan klip: satır kayıtlı çift 13 → 15, satır kaydı (Geri al) bulunur", sdT.durum === "kayitli" && sdT.cift.t0 === 13 && sdT.cift.t1 === 15 &&
  M.satirKaydi([kayitT], tasinan, sdT.cift).id === "krt", js(sdT));
var baskaYer = KR.kayit({ id: "krb", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", clipStart: 10, uclar: [13, 15], times: [14] });
ok("çakışanlar klibe göre: taşındıktan sonra yeniden uygulanan eğri eski kaydın yerine geçer, taşınmış başka eğrininkini atmaz",
  js(M.cakisanlar([kayitT, baskaYer], { id: "kryeni", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, clipStart: 12, uclar: [13, 15] }).map(function (r) { return r.id; })) === js(["krt"]));
// slip / baştan ripple kırpma: klibin başı yerinde, giriş noktası kayar → anahtarlar timeline'da kayar; kayıt kaynak çapasıyla bulunur
var capaR = KR.kayit({ id: "krc", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", clipStart: 10, clipEnd: 20, clipIn: 5, clipOut: 15,
  ters: false, uclar: [11, 13], times: yogun.map(function (t) { return Math.round((t + 10) * 10000) / 10000; }) });
function satir(o, kayma) {
  var p = { nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", fps: 25, clipStart: 10, clipEnd: 20, clipIn: 5, clipOut: 15, ters: false };
  Object.keys(o).forEach(function (k) { p[k] = o[k]; });
  p.keys = [11 + kayma].concat(yogun.map(function (t) { return Math.round((t + 10 + kayma) * 10000) / 10000; })).concat([13 + kayma, 17 + kayma]);
  return p;
}
var slip = satir({ clipIn: 6.5, clipOut: 16.5 }, -1.5), ripple = satir({ clipIn: 5.5, clipEnd: 19.5 }, -0.5);
var kirpTasi = satir({ clipStart: 13.2, clipEnd: 23, clipIn: 5.2 }, 3);
ok("çapa kayması: slip -1,5, baştan ripple kırpma -0,5, düz kırpma + taşıma +3 (klip başlangıcı kayması 3,2 değil)", yakin(M.capaKaymasi(capaR, slip, 0.01), -1.5) &&
  yakin(M.capaKaymasi(capaR, ripple, 0.01), -0.5) && yakin(M.capaKaymasi(capaR, kirpTasi, 0.01), 3), js([M.capaKaymasi(capaR, slip, 0.01), M.capaKaymasi(capaR, kirpTasi, 0.01)]));
ok("çapa kayması: hız ya da yön değişti, ya da çapasız eski kayıt → NaN (eski adaylar)", isNaN(M.capaKaymasi(capaR, satir({ clipOut: 25 }, 0), 0.01)) &&
  isNaN(M.capaKaymasi(capaR, satir({ ters: true }, 0), 0.01)) && isNaN(M.capaKaymasi(kayitT, slip, 0.01)) && M.capaKaymasi(capaR, satir({}, 0), 0.01) === 0);
var csl = M.canliKayitlar([capaR], slip), crp = M.canliKayitlar([capaR], ripple), ckt = M.canliKayitlar([capaR], kirpTasi);
ok("slip / ripple kırpma / kırpma + taşıma sonrası kayıt canlı; kopya bugünkü klibin çapasını alır, özgün kayıt değişmez", csl.length === 1 && js(csl[0].uclar) === js([9.5, 11.5]) &&
  csl[0].clipIn === 6.5 && csl[0].clipOut === 16.5 && csl[0].clipStart === 10 && crp.length === 1 && js(crp[0].uclar) === js([10.5, 12.5]) && crp[0].clipEnd === 19.5 &&
  ckt.length === 1 && js(ckt[0].uclar) === js([14, 16]) && capaR.clipIn === 5 && js(capaR.uclar) === js([11, 13]) && yakin(M.capaKaymasi(csl[0], slip, 0.01), 0),
  js([csl.map(function (r) { return r.uclar; }), crp.map(function (r) { return r.uclar; }), ckt.map(function (r) { return r.uclar; })]));
var sdS = M.satirDurumu(slip, 10.5, M.uclarDan(csl));
ok("slip sonrası satır kayıtlı çift 9,5 → 11,5 (1 karelik Suflo çifti değil); Geri al kaydı bulunur; ipucu kaymış uçlarla", sdS.durum === "kayitli" && sdS.cift.t0 === 9.5 &&
  sdS.cift.t1 === 11.5 && M.satirKaydi([capaR], slip, sdS.cift).id === "krc" && js(M.ipuclari([capaR], [slip])) === js([{ nodeId: "n1", compIdx: 0, propIdx: 1, t0: 9.5, t1: 11.5 }]), js(sdS));
ok("hızı değişen klipte kayıt canlı sayılmaz (Geri al dokunmaz)", M.canliKayitlar([capaR], satir({ clipOut: 25 }, -1.5)).length === 0);
// kesik pencere (400'den çok anahtar) de çapa kaymasıyla ölçülür
var uzunC = KR.kayit({ id: "kruc", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", clipStart: 0, clipEnd: 40, clipIn: 0, clipOut: 40,
  uclar: [2, 26], times: uzunTimesC() });
function uzunTimesC() { var z = []; for (var q = 1; q < 600; q++) z.push(Math.round((2 + q * 0.04) * 10000) / 10000); return z; }
var pencereC = { nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", fps: 25, kesik: true, clipStart: 0, clipEnd: 40, clipIn: 1, clipOut: 41,
  keys: uzunTimesC().slice(200, 600).map(function (t) { return Math.round((t - 1) * 10000) / 10000; }) };
ok("kesik pencere, slip sonrası: ipucu çapa kaymasıyla (uçlar 1 → 25)", js(M.ipuclari([uzunC], [pencereC])) === js([{ nodeId: "n1", compIdx: 0, propIdx: 1, t0: 1, t1: 25 }]),
  js(M.ipuclari([uzunC], [pencereC])));
// büyük slip sonrası yeniden uygulanan eğri eski kaydın yerine geçer (klip başı aynı olsa da)
var yeniSlip = { id: "krys", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, clipStart: 10, clipEnd: 20, clipIn: 8, clipOut: 18, ters: false, uclar: [8, 10] };
var baskaSlip = KR.kayit({ id: "krbs", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", clipStart: 10, clipEnd: 20, clipIn: 5, clipOut: 15,
  uclar: [8, 10], times: [9] });
ok("çakışanlar çapaya göre: slip'ten sonra yeniden uygulanan eğri eskinin yerine geçer, eskiden aynı timeline aralığındaki başka eğriyi atmaz",
  js(M.cakisanlar([capaR, baskaSlip], yeniSlip).map(function (r) { return r.id; })) === js(["krc"]), js(M.cakisanlar([capaR, baskaSlip], yeniSlip).map(function (r) { return r.id; })));
var gcap = M.bakeGruplari([{ prop: { nodeId: "nA", clipName: "A.mp4", clipStart: 0, clipEnd: 10, clipIn: 2, clipOut: 12, ters: true, compIdx: 1, propIdx: 0,
  matchName: "AE.ADBE Opacity/Opacity", opak: true, fps: 25, v0: 0, v1: 100 }, cift: { t0: 1, t1: 2, kayitli: false } }], E.builtin("yumusak").curve, 1, "s1");
var gecC = KR.kayit(M.geciciKayitlar(gcap.gruplar[0], "s1")[0]);
ok("zaman aşımı geçici kaydı da kaynak çapasını taşır (hedef host'a eskisi gibi gider)", gecC.clipIn === 2 && gecC.clipOut === 12 && gecC.clipEnd === 10 && gecC.ters === true &&
  js(Object.keys(gcap.gruplar[0].target).sort()) === js(["clipName", "clipStart", "nodeId", "seqId"]), js(gecC).slice(0, 200));
// kayıtlı çiftte bake öğesi eski zamanları taşır (host yalnız onları siler)
var gk = M.bakeGruplari([{ prop: pB, cift: { t0: 1, t1: 2, kayitli: true }, kayit: { id: "kx", times: [1.5, 1.6] } }, { prop: pA, cift: { t0: 1, t1: 2, kayitli: false } }], E.builtin("yumusak").curve, 1, "s1");
ok("bake öğesi: kayıtlı çiftte degistir + eski (kaydın zamanları), kayıtsızda eski yok", js(gk.gruplar[0].items[0].eski) === js([1.5, 1.6]) && gk.gruplar[0].items[0].degistir === true &&
  gk.gruplar[0].items[1].eski === undefined, js(gk.gruplar[0].items.map(function (i) { return [i.degistir, i.eski]; })));
// uzun kayıt (kesik pencere): ipucu pencerede görünen kısmıyla
var uzunTimes = []; for (var ui = 1; ui < 600; ui++) uzunTimes.push(Math.round((2 + ui * 0.04) * 10000) / 10000);
var kayitU = KR.kayit({ id: "kru", tur: "egri", nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", uclar: [2, 26], times: uzunTimes });
var pencere = { nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", fps: 25, kesik: true, keys: uzunTimes.slice(200, 600) };
ok("uzun kayıt, kesik pencere (uçlar dışarıda): ipucu yine gider; kesik değilse tam kural", js(M.ipuclari([kayitU], [pencere])) === js([{ nodeId: "n1", compIdx: 0, propIdx: 1, t0: 2, t1: 26 }]) &&
  M.ipuclari([kayitU], [{ nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", fps: 25, keys: pencere.keys }]).length === 0, js(M.ipuclari([kayitU], [pencere])));
var pencereBos = { nodeId: "n1", compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", fps: 25, kesik: true, keys: uzunTimes.slice(200, 600).filter(function (t, i) { return i % 2; }) };
ok("uzun kayıt, kesik pencere: görünen zamanların çoğu yoksa ipucu yok", M.ipuclari([kayitU], [pencereBos]).length === 0);
// zaman aşımı: geçici kayıtlar planlanan zamanlarla; süre anahtar sayısıyla büyür
var gz = { target: { nodeId: "nA", clipName: "A.mp4", clipStart: 0, seqId: "s1" }, items: [{ compIdx: 1, propIdx: 0, matchName: "AE.ADBE Opacity/Opacity", t0: 1, t1: 2, v0: 0, v1: 100, keys: [{ t: 1.5, v: 50 }] }] };
var gec = M.geciciKayitlar(gz, "s1");
ok("zaman aşımı: geçici kayıt planlanan zamanlarla (uçlar, kimlik, kenar değerleri)", gec.length === 1 && js(gec[0].times) === js([1.5]) && js(gec[0].uclar) === js([1, 2]) &&
  gec[0].nodeId === "nA" && gec[0].seqId === "s1" && gec[0].tur === "egri" && KR.kayit(gec[0]) !== null, js(gec));
var buyuk = { items: [{ keys: new Array(2000) }, { keys: new Array(2000) }, { keys: new Array(2000) }] };
ok("bake zaman aşımı: en az 120 sn, 6000 anahtarda 300 sn, en çok 10 dk", M.bakeSuresi(gz) === 120000 && M.bakeSuresi(buyuk) === 300000 &&
  M.bakeSuresi({ items: [{ keys: new Array(20000) }] }) === 600000);
ok("yoklama: odak geri gelince / sekme yeniden açılınca (tazele) aynı imzada da tara", M.yoklamaKarari(ob, { ok: true, seqId: "s1", selSig: "a|1|2", ph: 5 }, { tazele: true }) === "tara" &&
  M.yoklamaKarari(ob, { ok: false }, { tazele: true }) === "bekle");
ok("klip başına ret kodları satırda nedeniyle (genel 'uygulanamadı' değil)", ["klipYok", "klipTasindi", "sekans", "sekansYok", "zamanAsimi"].every(function (k) {
  return M.nedenMetni(k) !== "uygulanamadı"; }) && /taşınmış/.test(M.nedenMetni("klipTasindi")));

/* ---------------- varışta yaylanma (3.4 adım 14) ---------------- */
(function () {
  var A = M.yaylanAyar({ genlik: 9, frekans: "x", sonum: 1, tum: true });
  ok("yaylan ayarı: sınırlara kırpılır, geçersiz varsayılan, tum bayrağı", A.genlik === 0.5 && A.frekans === 3 && A.sonum === 2 && A.tum === true &&
    js(M.yaylanAyar(null)) === js({ genlik: 0.1, frekans: 3, sonum: 6, tum: false }) && M.yaylanAyar({ genlik: "" }).genlik === 0.1, js(A));
  ok("yaylan süresi: autoDuration(sönüm)", yakin(M.yaylanSure({ sonum: 6 }), E.autoDuration(6), 1e-12) && M.yaylanSure({ sonum: 2 }) === 2);
  function satir(keys, degerler, ek) {
    var p = { nodeId: "nA", clipName: "A.mp4", clipStart: 10, clipEnd: 20, clipIn: 5, clipOut: 15, ters: false, compIdx: 0, propIdx: 0,
      matchName: "AE.ADBE Motion/Position", label: "Konum", opak: false, tur: "xy", keys: keys, degerler: degerler, fps: 25, kfInterp: true };
    for (var k in ek || {}) p[k] = ek[k];
    return p;
  }
  var p = satir([11, 12, 15], [[0, 0], [500, 0], [500, 0]]);
  var v = M.varislar(p, [], { ph: 11.5 });
  ok("varış (tek): playhead'i saran çiftin ikinci ucu; hız Δv/Δt; sonraki anahtar sınır", v.kod === "" && v.varislar.length === 1 && v.varislar[0].tL === 12 &&
    js(v.varislar[0].hiz) === js([500, 0]) && v.varislar[0].tN === 15 && v.varislar[0].sinir === 15 && v.varislar[0].eski === null, js(v));
  ok("varış: değerler yoksa 'degerYok', playhead dışarıdaysa 'disinda'", M.varislar(satir([11, 12], null), [], { ph: 11.5 }).kod === "degerYok" &&
    M.varislar(p, [], { ph: 9 }).kod === "disinda" && M.varislar(satir([11], [[0, 0]]), [], { ph: 11 }).kod === "disinda");
  var son = M.varislar(satir([11, 12], [[0, 0], [100, 0]]), [], { ph: 11.5 });
  ok("varış: sonraki anahtar yoksa sınır klibin sonu", son.varislar[0].tN === null && son.varislar[0].sinir === 20 && son.varislar[0].vN === null);
  var bekleme = M.varislar(satir([11, 12, 15], [[5, 5], [5, 5], [9, 9]]), [], { ph: 11.5 });
  ok("varış (tek): iniş anahtarına hareket gelmiyorsa nedeniyle", bekleme.varislar.length === 0 && bekleme.kod === "varisYok");
  ok("varış (tek): iniş klibin dışında (tutamakta) → klipDisi", M.varislar(satir([19, 21], [[0, 0], [1, 1]]), [], { ph: 19.5 }).kod === "klipDisi");
  // Önce pişirilmiş Eğri: önceki anahtar Suflo'nun son sık anahtarı → hız eğrinin bitiş eğimi
  // Opaklık 11 → 12 'Yumuşak çıkış' ile her kare pişirilmiş (24 iç anahtar), 14'te bekleme
  var ek = [11], ed = [0];
  for (var i = 1; i < 25; i++) { ek.push(Math.round((11 + i * 0.04) * 1e6) / 1e6); ed.push(100 * E.toFunction(E.builtin("yumusak-cikis").curve)(i / 25)); }
  ek.push(12); ed.push(100); ek.push(14); ed.push(100);
  var egriKayit = KR.kayit({ tur: "egri", seqId: "s1", nodeId: "nA", clipName: "A.mp4", clipStart: 10, compIdx: 1, propIdx: 0, matchName: "AE.ADBE Opacity/Opacity",
    uclar: [11, 12], times: ek.slice(1, 25), kenarDegerleri: [] });
  var op = satir(ek, ed, { compIdx: 1, matchName: "AE.ADBE Opacity/Opacity", opak: true, tur: "sayi" });
  var ve = M.varislar(op, [egriKayit], { ph: 11.5 });
  var egim = (100 - ed[24]) / (12 - ek[24]);
  ok("varış: canlı Eğri çifti bölünmez; önceki anahtar eğrinin son sık anahtarı (bitiş eğimi)", ve.varislar.length === 1 && ve.varislar[0].tL === 12 &&
    yakin(ve.varislar[0].hiz, egim, 1e-6) && ve.varislar[0].tP === ek[24] && ve.varislar[0].tN === 14, js([ve.varislar[0] && ve.varislar[0].hiz, egim]));
  var vt = M.varislar(op, [egriKayit], { ph: 0, tum: true });
  ok("tüm varışlar: Eğri'nin iç anahtarları iniş sayılmaz; bekleyen anahtar sessizce geçilir", vt.varislar.length === 1 && vt.varislar[0].tL === 12 &&
    vt.atlanan.length === 0 && vt.kod === "", js(vt.varislar.map(function (x) { return x.tL; })));
  var zincir = satir([11, 12, 13, 14], [[0, 0], [100, 0], [100, 50], [100, 50]]);
  var vz = M.varislar(zincir, [], { tum: true });
  ok("tüm varışlar: her hareketin inişi (12 ve 13); bekleme (14) geçilir; her biri kendi sonraki anahtarına kadar", vz.varislar.length === 2 &&
    vz.varislar[0].tL === 12 && vz.varislar[0].tN === 13 && js(vz.varislar[1].hiz) === js([0, 50]) && vz.varislar[1].tN === 14, js(vz.varislar.map(function (x) { return [x.tL, x.tN]; })));
  // canlı yaylanma kaydı: aynı inişe yeniden uygulama onun yerine geçer; anahtarları önceki / sonraki sayılmaz
  var yk = [11, 12, 12.08, 12.24, 12.4, 12.56, 12.8, 15], yd = [[0, 0], [500, 0], [530, 0], [488, 0], [504, 0], [498, 0], [500, 0], [500, 0]];
  var yKayit = KR.kayit({ tur: "yaylan", seqId: "s1", nodeId: "nA", clipName: "A.mp4", clipStart: 10, compIdx: 0, propIdx: 0, matchName: "AE.ADBE Motion/Position",
    uclar: null, times: [12.08, 12.24, 12.4, 12.56, 12.8], kenarDegerleri: [{ t: 12, v: [500, 0] }] });
  var py = satir(yk, yd);
  ok("canlı yaylanmalar: iniş zamanı kenarDegerleri[0]'dan; anahtar indisleri", M.varisZamani(yKayit) === 12 && M.canliYaylanlar([yKayit], py).length === 1 &&
    js(M.canliYaylanlar([yKayit], py)[0].idx) === js([2, 3, 4, 5, 6]) && isNaN(M.varisZamani({})));
  var ic1 = M.varislar(py, [yKayit], { ph: 12.3 });
  ok("varış (tek): playhead yaylanmanın penceresinde → o iniş yeniden uygulanır (eski = kayıt, sonraki = 15)", ic1.varislar.length === 1 && ic1.varislar[0].tL === 12 &&
    ic1.varislar[0].eski && ic1.varislar[0].eski.id === yKayit.id && ic1.varislar[0].tN === 15 && js(ic1.varislar[0].hiz) === js([500, 0]), js(ic1));
  var inissiz = satir(yk.filter(function (t) { return t !== 12; }), yd.filter(function (v, i) { return yk[i] !== 12; }));
  var vInissiz = M.varislar(inissiz, [yKayit], { ph: 12.3 });
  ok("varış (tek): iniş anahtarı silinmiş, playhead yaylanmanın penceresinde → 'inisYok' (kendi anahtarlarının üstüne yazılmaz), satır Geri al'ı yine bulur",
    vInissiz.varislar.length === 0 && vInissiz.kod === "inisYok" && /Geri al/.test(M.nedenMetni("inisYok")) && M.yaylanSatirKaydi([yKayit], inissiz, 12.3).id === yKayit.id, js(vInissiz));
  var once = M.varislar(py, [yKayit], { ph: 11.5 });
  ok("varış (tek): çift iniş anahtarında bitiyor → aynı iniş, eski yaylanma değişir", once.varislar[0].tL === 12 && once.varislar[0].eski.id === yKayit.id && once.varislar[0].tN === 15);
  var sonra = M.varislar(py, [yKayit], { ph: 13.5 });
  var py2 = satir(yk, yd.slice(0, 7).concat([[700, 0]]));
  var sonra2 = M.varislar(py2, [yKayit], { ph: 13.5 });
  ok("varış (tek): yaylanmadan sonraki çift → sonraki iniş (15), önceki anahtar yaylanmanın son anahtarı (bekleme ise varisYok)",
    sonra.varislar.length === 0 && sonra.kod === "varisYok" && sonra2.varislar.length === 1 && sonra2.varislar[0].tL === 15 && sonra2.varislar[0].tP === 12.8 &&
    yakin(sonra2.varislar[0].hiz[0], 200 / 2.2, 1e-9) && sonra2.varislar[0].eski === null, js([sonra, sonra2]));
  var tumY = M.varislar(py, [yKayit], { tum: true });
  ok("tüm varışlar: canlı yaylanmanın anahtarları iniş / önceki / sonraki sayılmaz, yerine geçilir", tumY.varislar.length === 1 && tumY.varislar[0].tL === 12 &&
    tumY.varislar[0].eski.id === yKayit.id && tumY.varislar[0].tP === 11 && tumY.varislar[0].tN === 15, js(tumY.varislar.map(function (x) { return [x.tL, x.tP, x.tN]; })));
  ok("satır kaydı: playhead pencerede ya da iniş çiftin ikinci ucu → kayıt; başka yerde null", M.yaylanSatirKaydi([yKayit], py, 12.3).id === yKayit.id &&
    M.yaylanSatirKaydi([yKayit], py, 11.5).id === yKayit.id && M.yaylanSatirKaydi([yKayit], py, 13.5) === null);
  ok("satır uygunluğu: çift ya da pencere; tüm varışlarda ≥ 2 anahtar", M.yaylanUygun(py, 12.3, [yKayit], false) && M.yaylanUygun(p, 11.5, [], false) &&
    !M.yaylanUygun(p, 9, [], false) && M.yaylanUygun(p, 9, [], true) && !M.yaylanUygun(satir([11], [[0, 0]]), 11, [], true));

  /* gruplar */
  var g = M.yaylanGruplari([{ prop: p, varis: v }], { genlik: 0.1, frekans: 3, sonum: 6 }, "s1");
  var it = g.gruplar[0].items[0];
  ok("yaylan grupları: klip başına çağrı; öğe tur 'yaylan', iniş / sonraki uçları ve sınır", g.gruplar.length === 1 && g.atlanan.length === 0 &&
    js(g.gruplar[0].target) === js({ nodeId: "nA", clipName: "A.mp4", clipStart: 10, seqId: "s1" }) && it.tur === "yaylan" && it.t0 === 12 &&
    js(it.v0) === js([500, 0]) && it.t1 === 15 && js(it.v1) === js([500, 0]) && it.sinir === 15 && it.degistir === false && it.eski === undefined, js(it).slice(0, 200));
  ok("yaylan grupları: seyrek (tepe / çukur) ve 2 karede bir yedek plan; hepsi inişten sonra, sınırdan önce", it.keys.length >= 4 && it.yogunKeys.length > it.keys.length &&
    it.keys.concat(it.yogunKeys).every(function (k) { return k.t > 12 && k.t < 15 && Array.isArray(k.v); }) && g.gruplar[0].satirlar[0].bezier === true);
  var gy = M.yaylanGruplari([{ prop: py, varis: ic1 }], {}, "s1");
  ok("yaylan grupları: aynı inişteki canlı yaylanma degistir + eski (kaydın zamanları)", gy.gruplar[0].items[0].degistir === true &&
    js(gy.gruplar[0].items[0].eski) === js(yKayit.times));
  var opv = M.varislar(satir([11, 12], [0, 100], { opak: true, tur: "sayi", compIdx: 1 }), [], { ph: 11.5 });
  var go = M.yaylanGruplari([{ prop: satir([11, 12], [0, 100], { opak: true, tur: "sayi", compIdx: 1 }), varis: opv }], { genlik: 0.3 }, "s1");
  ok("yaylan grupları: Opaklık 0..100 kırpılır", go.gruplar[0].items[0].keys.every(function (k) { return k.v >= 0 && k.v <= 100; }) &&
    go.gruplar[0].items[0].yogunKeys.every(function (k) { return k.v >= 0 && k.v <= 100; }));
  var dar = satir([11, 12, 12.08], [[0, 0], [100, 0], [100, 0]]);
  var gd = M.yaylanGruplari([{ prop: dar, varis: M.varislar(dar, [], { ph: 11.5 }) }], {}, "s1");
  ok("yaylan grupları: 2 kareden az yer → atlanan 'yer' (nedeni metinle)", gd.gruplar.length === 0 && gd.atlanan.length === 1 && gd.atlanan[0].kod === "yer" &&
    /2 kareden az yer/.test(M.nedenMetni("yer")));
  var gdt = M.yaylanGruplari([{ prop: dar, varis: M.varislar(dar, [], { tum: true }) }], {}, "s1");
  ok("yaylan grupları: tüm varışlarda yeri olmayan iniş sessizce geçilir", gdt.gruplar.length === 0 && gdt.atlanan.length === 0, js(gdt.atlanan));
  ok("yaylan grupları: varış yoksa satır nedeniyle atlanır", M.yaylanGruplari([{ prop: p, varis: M.varislar(p, [], { ph: 9 }) }], {}, "s1").atlanan[0].kod === "disinda");
  var gec = M.yaylanGeciciKayitlar(g.gruplar[0], "s1");
  g.gruplar[0].satirlar[0].bezier = false;
  var gecY = M.yaylanGeciciKayitlar(g.gruplar[0], "s1");
  ok("yaylan zaman aşımı: geçici kayıt (Bezier varsa seyrek, yoksa sık plan), iniş kenarDegerleri'nde, depo kabul eder",
    gec.length === 1 && gec[0].tur === "yaylan" && gec[0].uclar === null && gec[0].times.length === it.keys.length && gecY[0].times.length === it.yogunKeys.length &&
    js(gec[0].kenarDegerleri) === js([{ t: 12, v: [500, 0] }]) && KR.kayit(gec[0]) !== null && gec[0].clipIn === 5);
  /* yerine geçme */
  var yeni = KR.kayit({ tur: "yaylan", seqId: "s1", nodeId: "nA", clipName: "A.mp4", clipStart: 10, clipEnd: 20, clipIn: 5, clipOut: 15, compIdx: 0, propIdx: 0,
    matchName: "AE.ADBE Motion/Position", uclar: null, times: [12.08, 12.4], kenarDegerleri: [{ t: 12, v: [500, 0] }] });
  var baska = KR.kayit({ tur: "yaylan", seqId: "s1", nodeId: "nA", clipStart: 10, compIdx: 0, propIdx: 0, matchName: "AE.ADBE Motion/Position", times: [15.1], kenarDegerleri: [{ t: 15, v: [0, 0] }] });
  ok("yaylan çakışanlar: aynı satırda aynı iniş yerine geçer; başka iniş ve Eğri kaydı kalır", js(M.yaylanCakisanlar([yKayit, baska, egriKayit, yeni], yeni).map(function (r) { return r.id; })) === js([yKayit.id]));
  var tasinan = KR.kayit({ tur: "yaylan", seqId: "s1", nodeId: "nA", clipStart: 30, clipEnd: 40, clipIn: 5, clipOut: 15, compIdx: 0, propIdx: 0, matchName: "AE.ADBE Motion/Position",
    times: [32.08, 32.4], kenarDegerleri: [{ t: 32, v: [500, 0] }] });
  ok("yaylan çakışanlar: klip taşındıysa iniş kaynak çapasıyla karşılaştırılır", M.yaylanCakisanlar([tasinan], yeni).length === 1);
  /* önizleme */
  var on = M.yaylanOnizleme({ genlik: 0.1 }, 240, 80), on2 = M.yaylanOnizleme({ genlik: 0.4 }, 240, 80);
  ok("yaylan önizlemesi: SVG yolu, hedef çizgisi, tepe genlikle büyür (Premiere'e gitmez)", /^M[\d.]+ [\d.]+( L[\d.-]+ [\d.-]+){120}$/.test(on.yol) && on.tepe > 0 &&
    on2.tepe > on.tepe * 3.9 && on.hedefY > 0 && on.hedefY < 80 && yakin(on.sure, E.autoDuration(6), 1e-12), on.yol.slice(0, 60));
})();

/* ---------------- metinler ---------------- */
ok("neden ve hata metinleri", M.nedenMetni("degisti") === "uç anahtar karenin değeri değişmiş" && M.nedenMetni("??") === "uygulanamadı" && /Liste yenilendi/.test(M.hataMetni("klipTasindi")) && M.hataMetni("yok") === "");
var src = require("fs").readFileSync(path.join(KOK, "js", "egri-model.js"), "utf8");
ok("temiz oda: lisanssız kaynağın adı yok; DOM / Premiere / depo erişimi yok", !new RegExp("open" + "curve", "i").test(src) && !/document\.|K\.call|localStorage/.test(src));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
