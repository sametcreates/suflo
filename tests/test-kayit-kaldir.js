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
(function () {
  function kz(o) { var r = rec(o); r.kenarDegerleri = o.kenar; r.createdAt = o.c || 1; return r; }
  var ilk = kz({ id: "z1", tur: "zoom", times: [0, 5.45], kenar: [{ t: 0, v: 100 }, { t: 5.45, v: 100 }], c: 1 });
  var ikinci = kz({ id: "z2", tur: "zoom", times: [0, 9.1], kenar: [{ t: 0, v: 112 }, { t: 9.1, v: 112 }], c: 2 });
  // kenarMiras yalnız yerineGecis'in doğruladığı adaylarla çağrılır (temizlikten hemen önce canlıydı, anahtarları silindi,
  // özellik boşaldı): Suflo'dan önceki sabit değer iki uca da geçer (sağ uç 112'de kalsaydı, kullanıcının sol taraftaki
  // anahtarı dururken kaldırma sağ kenara 112'lik anahtar eklerdi)
  ok("kenarMiras: yeniden uygulanan zoom ilk uygulamanın önceki değerini (100) iki ucuna da devralır, zamanlar kendisinin",
    SK.kenarMiras(ikinci, [ilk]) === true && ikinci.kenarDegerleri[0].v === 100 && ikinci.kenarDegerleri[0].t === 0 &&
    ikinci.kenarDegerleri[1].v === 100 && ikinci.kenarDegerleri[1].t === 9.1, ikinci.kenarDegerleri);
  var ucuncu = kz({ id: "z3", tur: "zoom", times: [0, 9.1], kenar: [{ t: 0, v: 125 }, { t: 9.1, v: 125 }], c: 5 });
  var arada = kz({ id: "p1", tur: "hareket", times: [4, 5], kenar: [{ t: 4, v: 106 }, { t: 5, v: 106 }], c: 3 });
  SK.kenarMiras(ucuncu, [arada, ilk]);
  ok("kenarMiras: birden çok aday varsa en eskisinin (Suflo'dan önceki hâlin) değeri alınır", ucuncu.kenarDegerleri[0].v === 100 && ucuncu.kenarDegerleri[1].v === 100, ucuncu.kenarDegerleri);
  var xy = kz({ id: "p2", tur: "zoom", times: [0, 3], kenar: [{ t: 0, v: [0.4, 0.6] }], c: 4 });
  SK.kenarMiras(xy, [ilk]);
  ok("kenarMiras: değer türü uyuşmazsa ([x,y] ↔ sayı) devralınmaz", Array.isArray(xy.kenarDegerleri[0].v));
  ok("kenarMiras: aday yoksa ya da kenar değeri yoksa dokunulmaz", SK.kenarMiras(xy, []) === false && SK.kenarMiras(xy, [rec({ times: [0, 1] })]) === false);

  /* yerineGecis: host'un bildirdiği temizlik (silinen anahtar zamanları + pencereler) eski kayıtları belirler */
  function tz(o) {   // host KS_kayitTemizle girdisi
    return { seqId: "s1", nodeId: o.nodeId || "n1", clipName: "", clipStart: o.cs || 0, clipEnd: o.ce || 10, clipIn: o.ci || 0, clipOut: o.co || 10,
      matchName: o.matchName || "AE.ADBE Motion/Scale", pencereler: o.p, times: o.times || [], bosaldi: !!o.bosaldi };
  }
  function capali(o) { var r = kz(o); r.clipStart = o.cs || 0; r.clipEnd = o.ce || 10; r.clipIn = o.ci || 0; r.clipOut = o.co || 10; r.ters = false; return r; }
  var tol = 0.25 / 25;
  // (a) Zoom'dan sonra ortada Punch: Punch penceresi zoom anahtarlarına değmez → zoom kaydı yerinde
  var zoomK = capali({ id: "zk", tur: "zoom", times: [0, 2, 4, 6, 8, 10], kenar: [{ t: 0, v: 100 }, { t: 10, v: 100 }], c: 1 });
  var punch = capali({ id: "pk", tur: "hareket", times: [4.775, 5, 5.225], kenar: [{ t: 4.775, v: 100 }, { t: 5.225, v: 100 }], c: 2 });
  var g1 = SK.yerineGecis([zoomK], [punch], SK.temizlenenler({ temizlenen: [tz({ p: [[4.25, 5.75]] })] }), tol);
  ok("yerineGecis: başka aracın küçük penceresi zoom anahtarlarına değmezse zoom kaydı kalır (aralık kesişse de)",
    !g1.at.zk && g1.kirpilan.length === 0 && g1.miras === 0, g1);
  // (b) Kesimdeki geçiş zoom'un ilk anahtarını temizledi: zoom kaydı kırpılır (yeni geçişin anahtarını kendininmiş gibi silmesin)
  var g2 = SK.yerineGecis([zoomK], [], SK.temizlenenler({ temizlenen: [tz({ p: [[0, 0.8]], times: [0] })] }), tol);
  ok("yerineGecis: kısmen temizlenen kayıt kırpılır (pencerenin içindeki zaman düşer), atılmaz",
    !g2.at.zk && g2.kirpilan.length === 1 && g2.kirpilan[0].id === "zk" && JSON.stringify(g2.kirpilan[0].times) === "[2,4,6,8,10]" &&
    JSON.stringify(zoomK.times) === "[0,2,4,6,8,10]", g2);
  // (c) Yeniden uygulama: eski kayıt canlıydı, anahtarları silindi, özellik boşaldı → atılır, önceki değeri devralınır
  var yeniZ = capali({ id: "zy", tur: "zoom", times: [0, 2, 4, 6, 8, 10], kenar: [{ t: 0, v: 112 }, { t: 10, v: 112 }], c: 3 });
  var g3 = SK.yerineGecis([zoomK], [yeniZ], SK.temizlenenler({ temizlenen: [tz({ p: [[0, 10]], times: [0, 2, 4, 6, 8, 10], bosaldi: true })] }), tol);
  ok("yerineGecis: canlı kaydın anahtarları silindi ve özellik boşaldı → kayıt atılır, yeni kayıt önceki değeri (100) devralır",
    g3.at.zk === 1 && g3.miras === 1 && yeniZ.kenarDegerleri[0].v === 100 && yeniZ.kenarDegerleri[1].v === 100, g3);
  // (d) Premiere'de geri alınmış (anahtarları yok) eski kayıt: pencerenin içinde → atılır, ama devralınmaz (bayat değer)
  var bayat = capali({ id: "fb", tur: "hareket", matchName: "AE.ADBE Opacity/Opacity", times: [0, 0.45], kenar: [{ t: 0, v: 100 }, { t: 0.45, v: 100 }], c: 1 });
  var yeniF = capali({ id: "fy", tur: "hareket", matchName: "AE.ADBE Opacity/Opacity", times: [0, 0.45], kenar: [{ t: 0, v: 60 }, { t: 0.45, v: 60 }], c: 2 });
  var g4 = SK.yerineGecis([bayat], [yeniF], SK.temizlenenler({ temizlenen: [tz({ matchName: "AE.ADBE Opacity/Opacity", p: [[0, 1.5]], times: [] })] }), tol);
  ok("yerineGecis: dışarıdan geri alınmış kayıt atılır, değeri devralınmaz (kullanıcının sonradan verdiği 60 kalır)",
    g4.at.fb === 1 && g4.miras === 0 && yeniF.kenarDegerleri[0].v === 60 && yeniF.kenarDegerleri[1].v === 60, g4);
  // (e) Taşınmış klipte yeniden uygulama: eski kaydın zamanları kaynak çapasıyla kaydırılıp eşlenir
  var tasinan = capali({ id: "zt", tur: "zoom", times: [0, 2, 4, 6, 8, 10], kenar: [{ t: 0, v: 100 }, { t: 10, v: 100 }], c: 1 });
  var yeniT = capali({ id: "zn", tur: "zoom", cs: 3, ce: 13, times: [3, 5, 7, 9, 11, 13], kenar: [{ t: 3, v: 112 }, { t: 13, v: 112 }], c: 2 });
  var g5 = SK.yerineGecis([tasinan], [yeniT], SK.temizlenenler({ temizlenen: [tz({ cs: 3, ce: 13, p: [[3, 13]], times: [3, 5, 7, 9, 11, 13], bosaldi: true })] }), tol);
  ok("yerineGecis: taşınan klipte de (kaynak çapası) eski kayıt yerine geçilir, önceki değer (100) devralınır",
    g5.at.zt === 1 && yeniT.kenarDegerleri[0].v === 100 && yeniT.kenarDegerleri[1].v === 100, g5);
  // (f) Özellik boşalmadıysa (pencere dışında anahtar kaldı) host'un okuduğu değer doğrudur: devralınmaz
  var onayar = capali({ id: "h1", tur: "hareket", times: [0, 0.45], kenar: [{ t: 0, v: 112 }, { t: 0.45, v: 112 }], c: 3 });
  var ilkC = capali({ id: "z1c", tur: "zoom", times: [0, 5.45], kenar: [{ t: 0, v: 100 }, { t: 5.45, v: 100 }], c: 1 });
  var g6 = SK.yerineGecis([ilkC], [onayar], SK.temizlenenler({ temizlenen: [tz({ p: [[0, 1.5]], times: [0] })] }), tol);
  ok("yerineGecis: başka aracın kaydından devralınmaz (zoom'un yalnız ilk anahtarı silindi, özellik boşalmadı; o pencerede önceki değer gerçekten oydu)",
    onayar.kenarDegerleri[0].v === 112 && !g6.at.z1c && g6.kirpilan.length === 1 && JSON.stringify(g6.kirpilan[0].times) === "[5.45]", g6);
  // (g) Başka klip / özellik / sekans ve Eğri kayıtları hiç etkilenmez
  var g7 = SK.yerineGecis([rec({ id: "o1", nodeId: "n2", times: [0, 1] }), rec({ id: "o2", matchName: "AE.ADBE Opacity/Opacity", times: [0, 1] }),
    rec({ id: "o3", seqId: "s2", times: [0, 1] }), rec({ id: "o4", tur: "egri", times: [0, 1] })], [],
    SK.temizlenenler({ temizlenen: [tz({ p: [[0, 10]], times: [0, 1], bosaldi: true })] }), tol);
  ok("yerineGecis: başka klip, özellik, sekans ve Eğri kayıtlarına dokunulmaz", Object.keys(g7.at).length === 0 && g7.kirpilan.length === 0, g7);
  ok("temizlenenler: bozuk girdi atılır", SK.temizlenenler({ temizlenen: [null, { matchName: 5 }, { matchName: "m", clipStart: "x" }] }).length === 0 &&
    SK.temizlenenler(null).length === 0);
})();

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
    Object.keys(SK.HATALAR).map(function (k) { return SK.HATALAR[k]; }), [SK.kenarMetni("2"), SK.kayitsizMetni("2"), SK.egriMetni("2"),
      SK.kesimYeri({ cut: 9.04, track: 2 })]);
  var eksik = hepsi.filter(function (s) { var t = I.translate(s); return t === s || /[çğıöşüÇĞİÖŞÜ]/.test(t); });
  return (eksik.length === 0 && I.translate(SK.kesimYeri({ cut: 9.04, track: 2 })) === "Cut: V2, 00:09.04") || console.log(eksik);
})());

/* inceleme 2: kenar notu kalan anahtarlara "senin" demez (başka bir Suflo aracının olabilir); Eğri ve kesim yeri */
ok("kenarMetni: kalan anahtarlar 'kendi anahtar karelerin' diye anılmaz", !/Kendi anahtar/.test(SK.kenarMetni("2")) && /diğer anahtar kareler korundu/.test(SK.kenarMetni("2")));
ok("kesimYeri: V katmanı + dakika:saniye.salise; saat varsa başa; geçersizse boş",
  SK.kesimYeri({ cut: 9.04, track: 1 }) === "Kesim: V1, 00:09.04" && SK.kesimYeri({ cut: 3725.499, track: 3 }) === "Kesim: V3, 1:02:05.50" &&
  SK.kesimYeri({ cut: 59.999, track: 1 }) === "Kesim: V1, 01:00.00" && SK.kesimYeri(null) === "" && SK.kesimYeri({ cut: "x" }) === "",
  [SK.kesimYeri({ cut: 9.04, track: 1 }), SK.kesimYeri({ cut: 3725.499, track: 3 }), SK.kesimYeri({ cut: 59.999, track: 1 })]);
(function () {
  function eg(o) { var r = rec(o); r.uclar = o.uclar || [r.times[0] - 0.5, r.times[r.times.length - 1] + 0.5]; r.createdAt = o.c || 1; return r; }
  var arac = [rec({ id: "z", tur: "zoom", nodeId: "n1", times: [0, 2, 5] })];
  var egriler = [eg({ id: "e1", tur: "egri", nodeId: "n1", times: [0.5, 1], c: 2 }), eg({ id: "e2", tur: "egri", nodeId: "n2", times: [0.5, 1] }),
    eg({ id: "e3", tur: "egri", nodeId: "n1", matchName: "AE.ADBE Opacity/Opacity", times: [0.5, 1] }), eg({ id: "e4", tur: "egri", nodeId: "n1", seqId: "s2", times: [0.5, 1] }),
    eg({ id: "e5", tur: "egri", nodeId: "n1", times: [3, 4], c: 5 }), rec({ id: "e6", tur: "egri", nodeId: "n1", times: [1, 2] })];
  var a = SK.egriAdaylari(egriler, arac).map(function (r) { return r.id; });
  ok("egriAdaylari: yalnız araç kaydıyla aynı sekans + klip + özellikteki uçlu Eğri kayıtları, en yeni önce", JSON.stringify(a) === '["e5","e1"]', a);
  ok("egriAdaylari: araç kaydı yoksa boş", SK.egriAdaylari(egriler, []).length === 0 && SK.egriAdaylari(null, arac).length === 0);
  var yay = rec({ id: "y1", tur: "yaylan", nodeId: "n1", times: [2.08, 2.24] }); yay.uclar = null; yay.kenarDegerleri = [{ t: 2, v: 100 }]; yay.createdAt = 9;
  var yayIni = rec({ id: "y2", tur: "yaylan", nodeId: "n1", times: [2.08] }); yayIni.uclar = null; yayIni.kenarDegerleri = [];
  var ay = SK.egriAdaylari(egriler.concat([yay, yayIni]), arac).map(function (r) { return r.id; });
  ok("egriAdaylari: varışta yaylanma (3.4 adım 14) inişiyle aday olur (uçsuz); inişi olmayan yaylanma aday değil", JSON.stringify(ay) === '["y1","e5","e1"]', ay);
  var oe = SK.ozet({ eslesen: 1, sonuclar: [{ id: "z", silinen: 7, egri: ["e1"] }], atlanan: [], egriBiten: ["e1", "e1", 5, ""] });
  ok("ozet: egriBiten (tekrarsız, yalnız metin id) ve sayısı", JSON.stringify(oe.egriBiten) === '["e1"]' && oe.egri === 1, oe);
  var me = SK.mesajParcalari("zoom", oe);
  ok("mesaj: kaldırılan Eğri ayrıca söylenir, temiz başarı 'good'", me.tur === "good" && me.parcalar[0] === "Zoom kaldırıldı: 7 anahtar kare silindi." &&
    me.parcalar[1] === "Uçları bu anahtar karelerde olan 1 Suflo eğrisi de kaldırıldı.", me);
})();

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
  // Host cevabı gibi: araç yazmadan önce pencereyi temizledi ve eski kaydın anahtarlarını (1, 2) sildi
  var s2 = o.sakla("C:\\p\\a.prproj", [{ tur: "gecis", seqId: "s1", nodeId: "n1", matchName: "AE.ADBE Motion/Scale", compIdx: 0, propIdx: 1, times: [1.5, 2.5] }],
    { tol: 0.01, temizlenen: [{ seqId: "s1", nodeId: "n1", clipName: "", clipStart: 0, clipEnd: 5, matchName: "AE.ADBE Motion/Scale", pencereler: [[1, 2.5]], times: [1, 2], bosaldi: true }] });
  var kl = o.kayitlar("C:\\p\\a.prproj");
  ok("sakla: aynı pencerenin eski kaydı (araç temizledi) atılır, yenisi kalır", kl.length === 1 && kl[0].id === s2.idler[0], kl);
  var s3 = o.sakla("C:\\p\\a.prproj", [{ tur: "hareket", seqId: "s1", nodeId: "n1", matchName: "AE.ADBE Motion/Scale", compIdx: 0, propIdx: 1, times: [3, 3.5] }],
    { tol: 0.01, temizlenen: [{ seqId: "s1", nodeId: "n1", clipName: "", clipStart: 0, clipEnd: 5, matchName: "AE.ADBE Motion/Scale", pencereler: [[2.8, 3.7]], times: [], bosaldi: false }] });
  ok("sakla: temizlik eski kayda değmediyse (başka pencere) iki kayıt da kalır", o.kayitlar("C:\\p\\a.prproj").length === 2 && s3.idler.length === 1);
  o.sil("C:\\p\\a.prproj", s3.idler);
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
  await araclarArasi();
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

  // inceleme 2: Geçişi kaldır'da seçili klip playhead'in önüne geçmez; onay hangi kesim olduğunu söyler, eski yöntem
  // tam o kesimi temizler (seçili C'nin kesimindeki kullanıcı anahtarları silinmez)
  var X = PM.klip({ ad: "X.mp4", nodeId: "X", start: 30, end: 39 }), Y = PM.klip({ ad: "Y.mp4", nodeId: "Y", start: 39, end: 40 });
  var Zc = PM.klip({ ad: "Z.mp4", nodeId: "Zc", start: 40, end: 50 });
  PM.izKur([[A, B], [X, Y, Zc]]);
  PM.durum.secim = []; PM.durum.playhead = 39;
  PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.4 }), tolerance: 1 });   // kaydı olmayan (eski) Karartma, V2 39 sn
  Zc.opak.elle(Zc, 40, 0); Zc.opak.elle(Zc, 40.3, 100);   // kullanıcının Z başındaki kendi solması (40 sn kesimi)
  PM.durum.playhead = 39.1; PM.durum.secim = [Zc];
  cevap.onay = true;
  var soruSay = sorular.length;
  await dinleyici["gecis-kaldir:click"]();
  var soruK = sorular[sorular.length - 1] || "", tostK = toastlar[toastlar.length - 1];
  ok("Geçişi kaldır + seçili Z: onay playhead'in altındaki kesimi gösterir (V2, 39 sn), seçili Z'nin kesimini (40) değil",
    sorular.length === soruSay + 1 && soruK.indexOf("Kesim: V2, 00:39.00\n\n") === 0 && /geçiş kaydı yok/.test(soruK), soruK);
  ok("onaylanınca eski yöntem tam o kesimi temizler: X / Y'nin Karartması gider, Z'deki kullanıcı anahtarları kalır; bildirim kesimi söyler",
    X.opak.keys.length === 0 && Y.opak.keys.length === 0 && JSON.stringify(Zc.opak.tl(Zc)) === "[40,40.3]" &&
    /^Kesim: V2, 00:39\.00 · Geçiş penceresi eski yöntemle temizlendi/.test(tostK.m), [tostK.m, Zc.opak.keys]);
}

/* ---------------- araçlar arası ve yeniden uygulama (3.4 adım 11 inceleme bulguları; panel modülü + host sahte Premiere) ---------------- */
async function araclarArasi() {
  function ortam() {
    var PM = require("./_kayit-premiere.js").olustur();
    var t = 1000, depo = KR.depo(bellekDepo());
    var o = SK.olustur({ call: PM.kcall, depo: depo, simdi: function () { return t++; } });
    return { PM: PM, o: o, depo: depo, sakla: function (r) { return o.sakla(r.proje, r.records, r); },
      // Eğri panelinin yaptığı gibi: KS_easeBake kayıtları aynı depoya (tur 'egri')
      egriSakla: function (r) { (r.records || []).forEach(function (x) { x.id = KR.yeniId(t++); x.createdAt = t++; }); return depo.ekle(PROJE, r.records).ok; } };
  }
  // s..e sn: 2 sn arayla zoom; ilk anahtar yakınlaşmış (1,12), sonra 1 / 1,12 dönüşümlü (ritmik mod gibi)
  function zoomPlani(s, e) { var k = []; for (var t = s, i = 0; t <= e + 1e-9; t += 2, i++) k.push({ time: t, value: i % 2 ? 1 : 1.12 }); return k; }
  function yedekli(o, tur, kapsam, sorular) {
    return o.akis({ tur: tur, kapsam: kapsam, onay: function (q) { sorular.push(q); return false; }, yedekMetni: { yok: "YOK?", degisti: "DEGISTI?" },
      yedek: function () { return Promise.resolve({ parcalar: ["eski"], tur: "good" }); } });
  }
  var PROJE = "C:\\proje\\kayit.prproj";

  // 1a) Zoom'dan sonra ortada Punch: zoom kaydı atılmaz; Zoom'u kaldır zoom anahtarlarını siler, Punch'ınkiler kalır
  var e = ortam(), PM = e.PM;
  var Z = PM.klip({ ad: "Z.mp4", nodeId: "Z", start: 0, end: 10 });
  PM.izKur([[Z]]); PM.durum.secim = [Z];
  e.sakla(PM.cagir("KS_autoZoom", { keys: zoomPlani(0, 10), clearStart: 0, clearEnd: 10, anchor: [0.3, 0.3] }));
  PM.durum.playhead = 5;
  e.sakla(PM.cagir("KS_applyMotionPreset", { id: "punch", duration: 0.45, strength: 1 }));
  ok("Zoom + Punch: zoom'un Ölçek ve Konum kayıtları depoda kalır", e.o.kayitlar(PROJE, { tur: "zoom" }).length === 2, e.o.kayitlar(PROJE).map(function (r) { return r.tur + ":" + r.matchName; }));
  var s = await e.o.akis({ tur: "zoom", kapsam: { secili: true } });
  ok("Zoom + Punch → Zoom'u kaldır: 6 Ölçek + 6 Konum zoom anahtarı silinir, yalnız Punch'ın 3 anahtarı kalır",
    /Zoom kaldırıldı: 12 anahtar kare silindi\./.test(s.parcalar[0]) && JSON.stringify(Z.olcek.tl(Z)) === "[4.775,5,5.225]" && Z.konum.keys.length === 0, [s, Z.olcek.tl(Z)]);

  // 1b) B'de zoom, sonra A | B kesimine Zoom İçeri: zoom kaydı kalır (kesimdeki ilk anahtarı silindiyse kırpılır), onay sorulmaz
  e = ortam(); PM = e.PM;
  var A = PM.klip({ ad: "A.mp4", nodeId: "A", start: 0, end: 10 }), B = PM.klip({ ad: "B.mp4", nodeId: "B", start: 10, end: 20 });
  PM.izKur([[A, B]]); PM.durum.secim = [B];
  e.sakla(PM.cagir("KS_autoZoom", { keys: zoomPlani(10, 20), clearStart: 10, clearEnd: 20 }));
  PM.durum.secim = []; PM.durum.playhead = 10;
  e.sakla(PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("zoom-in", { duration: 0.5 }), tolerance: 1 }));
  var gecisB = B.olcek.tl(B).filter(function (t) { return t < 11; });
  PM.durum.secim = [B];
  var sorular = [];
  s = await yedekli(e.o, "zoom", { secili: true }, sorular);
  ok("Zoom + geçiş → Zoom'u kaldır: onay sorulmaz, zoom'un kalan Ölçek anahtarları (12–20 sn) silinir, geçişin B anahtarları yerinde",
    sorular.length === 0 && !s.yedek && JSON.stringify(B.olcek.tl(B).filter(function (t) { return t < 11; })) === JSON.stringify(gecisB) &&
    !B.olcek.tl(B).some(function (t) { return t > 11 && t < 19.9; }) && gecisB.length === 3, [s, B.olcek.tl(B), gecisB]);
  PM.durum.secim = [];
  s = await e.o.akis({ tur: "gecis", kapsam: { kesim: { tolerance: 1 } } });
  ok("ardından Geçişi kaldır: geçiş de kayıtla kalkar (zoom kaydı geçişin kesimdeki anahtarını kendininmiş gibi silmemişti)",
    /^Geçiş kaldırıldı: \d+ anahtar kare silindi\./.test(s.parcalar[0]) && !B.olcek.tl(B).some(function (t) { return t < 11; }), [s, B.olcek.tl(B)]);

  // 2) Uygula → Premiere'de Ctrl+Z → kullanıcı değeri değiştirir → yeniden uygula → kaldır: kullanıcının değeri kalır
  e = ortam(); PM = e.PM;
  var C = PM.klip({ ad: "C.mp4", nodeId: "C", start: 0, end: 5, opak: 100 });
  PM.izKur([[C]]); PM.durum.secim = [C];
  e.sakla(PM.cagir("KS_applyMotionPreset", { id: "fade-in", duration: 0.45, strength: 1 }));
  C.opak.keys = []; C.opak.tv = false; C.opak.value = 60;   // Ctrl+Z, sonra kullanıcı Opaklık 60
  e.sakla(PM.cagir("KS_applyMotionPreset", { id: "fade-in", duration: 0.45, strength: 1 }));
  s = await e.o.akis({ tur: "hareket", kapsam: { secili: true } });
  ok("dışarıdan geri alınan önayar yeniden uygulanıp kaldırılınca Opaklık kullanıcının 60'ında kalır (bayat 100 devralınmaz)",
    C.opak.keys.length === 0 && C.opak.value === 60 && s.tur === "good" && e.o.kayitlar(PROJE).length === 0, [s, C.opak]);
  e = ortam(); PM = e.PM;
  var Z2 = PM.klip({ ad: "Z.mp4", nodeId: "Z2", start: 0, end: 10 });
  PM.izKur([[Z2]]); PM.durum.secim = [Z2];
  e.sakla(PM.cagir("KS_autoZoom", { keys: zoomPlani(0, 10), clearStart: 0, clearEnd: 10 }));
  Z2.olcek.keys = []; Z2.olcek.tv = false; Z2.olcek.value = 120; Z2.konum.keys = []; Z2.konum.tv = false;   // Ctrl+Z, sonra kadraj 120
  e.sakla(PM.cagir("KS_autoZoom", { keys: zoomPlani(0, 10), clearStart: 0, clearEnd: 10 }));
  await e.o.akis({ tur: "zoom", kapsam: { secili: true } });
  ok("dışarıdan geri alınan zoom yeniden uygulanıp kaldırılınca Ölçek kullanıcının 120'sinde kalır", Z2.olcek.keys.length === 0 && Z2.olcek.value === 120, Z2.olcek);

  // 3a) Karartma (B Opaklık 0 → 100), sonra B'ye Clean Fade In, Önayarı kaldır: B görünür (100), 0'da kalmaz
  e = ortam(); PM = e.PM;
  A = PM.klip({ ad: "A.mp4", nodeId: "A", start: 0, end: 5 }); B = PM.klip({ ad: "B.mp4", nodeId: "B", start: 5, end: 10 });
  PM.izKur([[A, B]]); PM.durum.playhead = 5;
  e.sakla(PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6 }), tolerance: 1 }));
  PM.durum.secim = [B];
  var fr = PM.cagir("KS_applyMotionPreset", { id: "fade-in", duration: 0.45, strength: 1 });
  ok("Karartma + Fade In: önayar kaydının önceki değeri Karartma'nın artığı (0) değil, pencere dışındaki 100",
    fr.records.length === 1 && fr.records[0].kenarDegerleri[0].v === 100 && fr.records[0].kenarDegerleri[1].v === 100, fr.records[0] && fr.records[0].kenarDegerleri);
  e.sakla(fr);
  ok("Karartma + Fade In: Karartma'nın B kaydı (anahtarları silindi) yerine geçildi, A'nınki kaldı",
    e.o.kayitlar(PROJE, { tur: "gecis" }).length === 1 && e.o.kayitlar(PROJE, { tur: "gecis" })[0].nodeId === "A", e.o.kayitlar(PROJE).map(function (r) { return r.tur + ":" + r.nodeId; }));
  await e.o.akis({ tur: "hareket", kapsam: { secili: true } });
  ok("Karartma + Fade In → Önayarı kaldır: B Opaklık anahtarsız ve 100", B.opak.keys.length === 0 && B.opak.value === 100, B.opak);
  // 3b) Kaydı olmayan (eski) Fade In yeniden uygulanıp kaldırılınca Opaklık 100; eski Karartma yeniden uygulanınca da
  e = ortam(); PM = e.PM;
  C = PM.klip({ ad: "C.mp4", nodeId: "C", start: 0, end: 5, opak: 100 });
  PM.izKur([[C]]); PM.durum.secim = [C];
  PM.cagir("KS_applyMotionPreset", { id: "fade-in", duration: 0.45, strength: 1 });
  e.sakla(PM.cagir("KS_applyMotionPreset", { id: "fade-in", duration: 0.45, strength: 1 }));
  await e.o.akis({ tur: "hareket", kapsam: { secili: true } });
  ok("eski Fade In yeniden uygulanıp kaldırılınca Opaklık 100 (0'da kalmaz)", C.opak.keys.length === 0 && C.opak.value === 100, C.opak);
  e = ortam(); PM = e.PM;
  A = PM.klip({ ad: "A.mp4", nodeId: "A", start: 0, end: 5 }); B = PM.klip({ ad: "B.mp4", nodeId: "B", start: 5, end: 10 });
  PM.izKur([[A, B]]); PM.durum.playhead = 5;
  PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6 }), tolerance: 1 });
  e.sakla(PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6 }), tolerance: 1 }));
  await e.o.akis({ tur: "gecis", kapsam: { kesim: { tolerance: 1 } } });
  ok("eski Karartma yeniden uygulanıp Geçişi kaldır: A ve B Opaklığı anahtarsız ve 100", A.opak.keys.length === 0 && A.opak.value === 100 &&
    B.opak.keys.length === 0 && B.opak.value === 100, [A.opak, B.opak]);
  // 3c) Ritmik zoom, klip taşındı, yeniden uygulandı, kaldırıldı: Ölçek 100 (112'de kalmaz)
  e = ortam(); PM = e.PM;
  var Z3 = PM.klip({ ad: "Z.mp4", nodeId: "Z3", start: 0, end: 10 });
  PM.izKur([[Z3]]); PM.durum.secim = [Z3];
  e.sakla(PM.cagir("KS_autoZoom", { keys: zoomPlani(0, 10), clearStart: 0, clearEnd: 10 }));
  Z3.tasi(3);
  e.sakla(PM.cagir("KS_autoZoom", { keys: zoomPlani(3, 13), clearStart: 3, clearEnd: 13 }));
  ok("taşınan klipte yeniden uygulama: yalnız son uygulamanın iki kaydı kalır", e.o.kayitlar(PROJE).length === 2, e.o.kayitlar(PROJE).length);
  await e.o.akis({ tur: "zoom", kapsam: { secili: true } });
  ok("taşınan klipte yeniden uygulanan zoom kaldırılınca Ölçek 100", Z3.olcek.keys.length === 0 && Math.abs(Z3.olcek.value - 100) < 1e-9, Z3.olcek);

  // 4) Premiere anahtarları silmezse kayıt 'zaten kaldırılmış' sayılıp atılmaz
  e = ortam(); PM = e.PM;
  var Z4 = PM.klip({ ad: "Z.mp4", nodeId: "Z4", start: 0, end: 10 });
  PM.izKur([[Z4]]); PM.durum.secim = [Z4];
  e.sakla(PM.cagir("KS_autoZoom", { keys: [{ time: 0, value: 1.1 }, { time: 3, value: 1 }, { time: 6, value: 1.1 }], clearStart: 0, clearEnd: 10 }));
  function reddet() { throw new Error("Premiere reddetti"); }
  Z4.olcek.removeKey = reddet; Z4.konum.removeKey = reddet;
  s = await e.o.akis({ tur: "zoom", kapsam: { secili: true } });
  ok("removeKey hata verince: uyarı (silinemedi), 'zaten kaldırılmış' denmez, kayıtlar saklı, anahtarlar yerinde",
    s.tur === "warn" && /Premiere silmedi; kayıt saklandı/.test(s.parcalar.join(" ")) && !/zaten kaldırılmış/.test(s.parcalar.join(" ")) &&
    e.o.kayitlar(PROJE).length === 2 && Z4.olcek.keys.length === 3, s);
  delete Z4.olcek.removeKey; delete Z4.konum.removeKey;   // prototipteki (çalışan) removeKey'e dön
  s = await e.o.akis({ tur: "zoom", kapsam: { secili: true } });
  ok("Premiere yeniden silebildiğinde ikinci deneme kayıtla kaldırır", s.tur === "good" && Z4.olcek.keys.length === 0 && e.o.kayitlar(PROJE).length === 0, s);

  // 5) Çok klip seçili: biri kayıtlı, biri eski (kayıtsız) zoom → kayıtlı kaldırılır, kayıtsız söylenir
  e = ortam(); PM = e.PM;
  var Zy = PM.klip({ ad: "Yeni.mp4", nodeId: "Z1", start: 0, end: 10 }), Ye = PM.klip({ ad: "Eski.mp4", nodeId: "Y1", start: 10, end: 20 });
  PM.izKur([[Zy, Ye]]); PM.durum.secim = [Ye];
  PM.cagir("KS_autoZoom", { keys: [{ time: 10, value: 1.1 }, { time: 12, value: 1 }, { time: 15, value: 1.1 }], clearStart: 10, clearEnd: 20 });
  PM.durum.secim = [Zy];
  e.sakla(PM.cagir("KS_autoZoom", { keys: [{ time: 0, value: 1.1 }, { time: 3, value: 1 }, { time: 6, value: 1.1 }], clearStart: 0, clearEnd: 10 }));
  PM.durum.secim = [Zy, Ye];
  sorular = [];
  s = await yedekli(e.o, "zoom", { secili: true }, sorular);
  ok("karışık seçim: kayıtlı klip temizlenir, kaydı olmayan klip için uyarı (sessiz atlanmaz), sınıf warn",
    Zy.olcek.keys.length === 0 && Ye.olcek.keys.length === 3 && s.tur === "warn" && sorular.length === 0 &&
    s.parcalar.some(function (p) { return /^1 seçili klipte Suflo'nun kaydı yok; onlara dokunulmadı/.test(p); }), s);
  PM.durum.secim = [Ye];
  s = await yedekli(e.o, "zoom", { secili: true }, sorular);
  ok("ardından yalnız kayıtsız klip seçilince eski yöntemin onayı sorulur", sorular.length === 1 && sorular[0] === "YOK?" && s.iptal, s);

  // 6) Karartma, sonra aynı kesime Zoom İçeri: B görünmez kalmaz; Geçişi kaldır sonrası iki klip de 100
  e = ortam(); PM = e.PM;
  A = PM.klip({ ad: "A.mp4", nodeId: "A", start: 0, end: 5 }); B = PM.klip({ ad: "B.mp4", nodeId: "B", start: 5, end: 10 });
  PM.izKur([[A, B]]); PM.durum.playhead = 5;
  e.sakla(PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6 }), tolerance: 1 }));
  e.sakla(PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("zoom-in", { duration: 0.6 }), tolerance: 1 }));
  ok("Karartma → Zoom İçeri: B Opaklığı anahtarsız ve 100 (Karartma'nın 0'ında kalmaz); Karartma kayıtları yerine geçildi",
    B.opak.keys.length === 0 && B.opak.value === 100 && A.opak.value === 100 && e.o.kayitlar(PROJE).every(function (r) { return r.matchName !== "AE.ADBE Opacity/Opacity"; }),
    [B.opak, e.o.kayitlar(PROJE).map(function (r) { return r.matchName; })]);
  s = await e.o.akis({ tur: "gecis", kapsam: { kesim: { tolerance: 1 } } });
  ok("Karartma → Zoom İçeri → Geçişi kaldır: B Opaklık 100, iki klibin Ölçeği anahtarsız ve 100", s.tur === "good" && B.opak.value === 100 &&
    B.olcek.keys.length === 0 && B.olcek.value === 100 && A.olcek.keys.length === 0 && A.olcek.value === 100, [s, B.olcek, A.olcek]);
  e = ortam(); PM = e.PM;
  A = PM.klip({ ad: "A.mp4", nodeId: "A", start: 0, end: 5 }); B = PM.klip({ ad: "B.mp4", nodeId: "B", start: 5, end: 10 });
  PM.izKur([[A, B]]); PM.durum.playhead = 5;
  e.sakla(PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("zoom-in", { duration: 0.6 }), tolerance: 1 }));
  e.sakla(PM.cagir("KS_applyCutTransition", { plan: T.hostPlan("dip", { duration: 0.6 }), tolerance: 1 }));
  await e.o.akis({ tur: "gecis", kapsam: { kesim: { tolerance: 1 } } });
  ok("Zoom İçeri → Karartma → Geçişi kaldır: B Ölçeği 145'te kalmaz (100), Opaklık 100", B.olcek.keys.length === 0 && B.olcek.value === 100 &&
    A.olcek.value === 100 && B.opak.value === 100 && A.opak.value === 100, [A.olcek, B.olcek]);

  // 7) inceleme 2: Zoom'un iki anahtarı arasına Eğri yazıldı; Zoom'u kaldır Eğri'nin iç anahtarlarını da kaldırır (rampa
  //    kalmaz), Eğri kaydı depodan düşer. Kullanıcının iki anahtarı arasındaki Eğri ve anahtarları yerinde kalır.
  e = ortam(); PM = e.PM;
  var Ze = PM.klip({ ad: "Z.mp4", nodeId: "Ze", start: 0, end: 10 });
  PM.izKur([[Ze]]); PM.durum.secim = [Ze];
  e.sakla(PM.cagir("KS_autoZoom", { keys: [{ time: 0, value: 1 }, { time: 2, value: 1.12 }, { time: 5, value: 1.12 }, { time: 7, value: 1 }, { time: 10, value: 1 }],
    clearStart: 0, clearEnd: 10 }));
  var icE = [];
  for (var q = 1; q < 10; q++) { var tq = q * 0.2, uq = tq / 2; icE.push({ t: tq, v: 100 + 12 * uq * uq * (3 - 2 * uq) }); }
  var hedefE = { nodeId: "Ze", clipName: "Z.mp4", clipStart: 0, seqId: "seq-1" };
  var be1 = PM.cagir("KS_easeBake", { target: hedefE, items: [{ compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", t0: 0, t1: 2, v0: 100, v1: 112, keys: icE }] });
  Ze.olcek.elle(Ze, 8, 105); Ze.olcek.elle(Ze, 9, 108);
  var be2 = PM.cagir("KS_easeBake", { target: hedefE, items: [{ compIdx: 0, propIdx: 1, matchName: "AE.ADBE Motion/Scale", t0: 8, t1: 9, v0: 105, v1: 108,
    keys: [{ t: 8.5, v: 106.5 }] }] });
  ok("Zoom + Eğri hazırlığı: iki Eğri yazıldı ve aynı depoda", be1.ok && be1.yazilan === 9 && be2.ok && be2.yazilan === 1 && e.egriSakla(be1) && e.egriSakla(be2), [be1, be2]);
  var egri2 = e.depo.oku(PROJE).filter(function (r) { return r.tur === "egri" && r.uclar[0] === 8; })[0];
  s = await yedekli(e.o, "zoom", { secili: true }, sorular = []);
  var zeTl = Ze.olcek.tl(Ze), zeV = Ze.olcek.keys.map(function (k) { return Math.round(k.v * 100) / 100; });
  ok("Zoom + Eğri → Zoom'u kaldır: Eğri'nin iç anahtarları da gider (0–2 sn rampası kalmaz), onay sorulmaz, sonuç 'good'",
    s.tur === "good" && sorular.length === 0 && !zeTl.some(function (t) { return t > 0 && t < 2.1; }) &&
    s.parcalar.indexOf("Uçları bu anahtar karelerde olan 1 Suflo eğrisi de kaldırıldı.") !== -1, [s, zeTl, zeV]);
  ok("Zoom + Eğri → Zoom'u kaldır: kullanıcının anahtarları ve aralarındaki Eğri yerinde, kenarlar Suflo'dan önceki 100",
    JSON.stringify(zeTl) === "[0,8,8.5,9,10]" && JSON.stringify(zeV) === "[100,105,106.5,108,100]" &&
    /^Klipteki diğer anahtar kareler korundu; kenarlara 2 anahtar kare/.test(s.parcalar[s.parcalar.length - 1]), [zeTl, zeV, s.parcalar]);
  ok("Zoom + Eğri → Zoom'u kaldır: ucu silinen Eğri'nin kaydı depodan düştü, öbür Eğri kaydı ve Eğri'nin Geri al'ı duruyor",
    JSON.stringify(e.depo.oku(PROJE).map(function (r) { return r.tur; })) === '["egri"]' && egri2 &&
    PM.cagir("KS_easeUndo", { records: [egri2] }).sonuclar[0].silinen === 1, e.depo.oku(PROJE));
}
