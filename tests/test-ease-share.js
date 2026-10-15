// Suflo testi: eğri paylaşım kodları ve içe / dışa aktarma (3.4 adım 15) — saf katman.
// js/ease-curve.js: SFC1 kodu ('egri' + 'hiz' türleri), .suflo-egri dosyası, cubic-bezier / CSS yapıştırma, dış biçim okuyucusu
// (üçüncü taraf bir eğri aracının dışa aktarma JSON'u; yalnız dosya biçimi okunur), iceAktar. js/egri-model.js: önayarı
// yeniden adlandırma / taşıma / yinelemesiz içe alma, metinler. js/speedramp.js: adlı özel rampaların aynısı.
// js/egri-secim.js: Geçiş / Zoom / Hareket ease alanına yapıştırılan her biçim. Suflo'nun kendi kodu (temiz oda).
// Dış biçimin anahtar adı bu dosyada birleştirilerek kurulur (depoda o ad yalnız okuyucu bölümünde geçer).
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var E = require(path.join(KOK, "js", "ease-curve.js"));
var M = require(path.join(KOK, "js", "egri-model.js"));
var SR = require(path.join(KOK, "js", "speedramp.js"));
var S = require(path.join(KOK, "js", "egri-secim.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function b64(o) { return Buffer.from(typeof o === "string" ? o : JSON.stringify(o), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
var DIS = "open" + "curve";
function disDosya(presets, surum) { var o = {}; o[DIS] = surum === undefined ? 1 : surum; o.presets = presets; return JSON.stringify(o); }

var cokNokta = E.builtin("cift-yumusak").curve;
var hizEgri = { keys: [[0, 100], [0.3, 40], [0.3, 250], [1, 100]], hit: 0.3 };

/* ================= SFC1 kodu: iki tür ================= */
var kE = E.paylasimKodla({ ad: "Benim eğrim ğüşİöç", curve: cokNokta });
var cE = E.paylasimCoz(kE);
ok("SFC1 'egri': gidiş dönüş (çok noktalı, Türkçe ad), tür varsayılanı egri", /^SFC1\.[A-Za-z0-9_-]+$/.test(kE) && cE.ok && cE.tur === "egri" &&
  cE.ad === "Benim eğrim ğüşİöç" && js(cE.curve) === js(E.normalize(cokNokta)), js(cE));
ok("SFC1 'egri': adım 12'nin sfcKodla / sfcCoz'u aynı kodu üretir ve çözer", E.sfcKodla({ ad: "Benim eğrim ğüşİöç", curve: cokNokta }) === kE && E.sfcCoz(kE).ok);
var kH = E.paylasimKodla({ tur: "hiz", ad: "Dalış", keys: hizEgri.keys, hit: hizEgri.hit });
var cH = E.paylasimCoz(kH);
ok("SFC1 'hiz': gidiş dönüş (sert basamak ve ağır çekim anı korunur)", cH.ok && cH.tur === "hiz" && cH.ad === "Dalış" && js(cH.keys) === js(hizEgri.keys) && cH.hit === 0.3, js(cH));
ok("SFC1 'hiz': ağır çekim anı yoksa koda yazılmaz, çözünce null", (function () {
  var k = E.paylasimKodla({ tur: "hiz", keys: [[0, 100], [1, 300]] }), c = E.paylasimCoz(k);
  return c.ok && c.hit === null && c.ad === "" && JSON.parse(Buffer.from(k.slice(5), "base64").toString("utf8")).hit === undefined;
})());
ok("SFC1 'hiz': eğri seçicisinin sfcCoz'u Hız Rampası kodunu 'tur' ile reddeder", E.sfcCoz(kH).ok === false && E.sfcCoz(kH).hata === "tur");
ok("SFC1 'hiz': hız %10–%1000'e, t 0–1'e, ağır çekim anı 0,02–0,98'e kırpılır; t'ye göre sıralanır", (function () {
  var c = E.paylasimCoz("SFC1." + b64({ v: 1, tur: "hiz", keys: [[1.5, 5000], [-1, 1], [0.5, 50]], hit: 7 }));
  return c.ok && js(c.keys) === js([[0, 10], [0.5, 50], [1, 1000]]) && c.hit === 0.98;
})());
ok("Hız sınırları SufloSpeedRamp ile aynı (%10–%1000, ağır çekim 0,02–0,98, en çok 8 nokta)", E.LIMITS.HIZ_MIN === 10 && E.LIMITS.HIZ_MAX === 1000 &&
  js(E.LIMITS.HIZ_HIT) === js(SR.ozel.HIT) && E.LIMITS.MAX_PTS === SR.ozel.EN_COK && js(SR.ozelYuzde([[0, 1], [1, 99999]])) === js([[0, 10], [1, 1000]]));
ok("SFC1: paylaşım bağlantısı (TR / EN) # ile; bağlantı da çözülür", E.egriAdresi(kE) === "https://suflo.app/egri#" + kE && E.egriAdresi(kE, "en") === "https://suflo.app/en/egri#" + kE &&
  E.paylasimCoz(E.egriAdresi(kH, "en")).tur === "hiz" && E.paylasimCoz(kE.slice(0, 9) + "\n  " + kE.slice(9)).ok);

/* ================= reddedilenler ================= */
var dokuz = { type: "multi", pts: [] };
for (var d = 0; d < 9; d++) dokuz.pts.push({ x: d / 8, y: d / 8 });
var hata = function (o) { return E.paylasimCoz(typeof o === "string" ? o : "SFC1." + b64(o)).hata; };
ok("ret: önek, bozuk base64, JSON değil, sürüm, bilinmeyen tür, boş, çok uzun", hata("SFL1.abc") === "onek" && hata("SFC1.@@@") === "bozuk" && hata("SFC1.A") === "bozuk" &&
  hata("SFC1." + b64("x{")) === "bozuk" && hata({ v: 2, tur: "egri", curve: cokNokta }) === "surum" && hata({ v: 1, tur: "renk" }) === "tur" &&
  hata({ v: 1, curve: cokNokta }) === "tur" && hata("SFC1." + b64("[1,2]")) === "bozuk" && hata(" ") === "bos" && E.paylasimCoz(7).hata === "bos" &&
  hata("SFC1." + new Array(5000).join("A")) === "uzun");
ok("ret: 8'den çok nokta ('nokta'; sfcCoz'da 'egri'), hızda 9 nokta ve tek nokta", hata({ v: 1, tur: "egri", curve: dokuz }) === "nokta" &&
  E.sfcCoz("SFC1." + b64({ v: 1, tur: "egri", curve: dokuz })).hata === "egri" &&
  hata({ v: 1, tur: "hiz", keys: [[0, 1], [0.1, 1], [0.2, 1], [0.3, 1], [0.4, 1], [0.5, 1], [0.6, 1], [0.7, 1], [1, 1]] }) === "nokta" &&
  hata({ v: 1, tur: "hiz", keys: [[0, 100]] }) === "hiz");
// JSON NaN taşıyamaz; 1e999 ise JSON.parse'ta Infinity olur: sonlu olmayan sayı kırpılmaz, reddedilir
function hamKod(json) { return "SFC1." + b64(json); }
ok("ret: sonlu olmayan sayılar (1e999 = Infinity, metin \"NaN\", null tutamaç değil eksik sayılır)",
  E.paylasimCoz(hamKod('{"v":1,"tur":"egri","curve":{"type":"bezier","x1":1e999,"y1":0,"x2":1,"y2":1}}')).hata === "egri" &&
  E.paylasimCoz(hamKod('{"v":1,"tur":"egri","curve":{"type":"bezier","x1":"NaN","y1":0,"x2":1,"y2":1}}')).hata === "egri" &&
  E.paylasimCoz(hamKod('{"v":1,"tur":"egri","curve":{"type":"multi","pts":[{"x":0,"y":0},{"x":0.5,"y":-1e999},{"x":1,"y":1}]}}')).hata === "egri" &&
  E.paylasimCoz(hamKod('{"v":1,"tur":"egri","curve":{"type":"multi","pts":[{"x":0,"y":0,"ox":1e999,"oy":0},{"x":1,"y":1}]}}')).hata === "egri" &&
  E.paylasimCoz(hamKod('{"v":1,"tur":"egri","curve":{"type":"spring","response":1e999}}')).hata === "egri" &&
  E.paylasimCoz(hamKod('{"v":1,"tur":"hiz","keys":[[0,100],[1,1e999]]}')).hata === "hiz" &&
  E.paylasimCoz(hamKod('{"v":1,"tur":"hiz","keys":[[0,100],[1,200]],"hit":1e999}')).hata === "hiz" &&
  E.paylasimCoz(hamKod('{"v":1,"tur":"egri","curve":{"type":"multi","pts":[{"x":0,"y":0,"ox":null,"oy":null},{"x":1,"y":1}]}}')).ok);
ok("ret: tanınmayan eğri / Penner adı / proto adı", hata({ v: 1, tur: "egri", curve: { type: "yok" } }) === "egri" &&
  hata({ v: 1, tur: "egri", curve: { type: "penner", name: "__proto__" } }) === "egri" && hata({ v: 1, tur: "egri", curve: [0, 0, 1, 1] }) === "egri");
ok("aralık dışı (sonlu) değerler kırpılır: bezier y -1–2, x 0–1", (function () {
  var c = E.paylasimCoz("SFC1." + b64({ v: 1, tur: "egri", curve: { type: "bezier", x1: 3, y1: -9, x2: -1, y2: 9 } }));
  return c.ok && js(c.curve) === js({ type: "bezier", x1: 1, y1: -1, x2: 0, y2: 2 });
})());

/* ================= adlar ================= */
var kirli = E.paylasimCoz("SFC1." + b64({ v: 1, tur: "egri", ad: "a\u0000b\u001f\u007fc‮⁦d​‎e﻿ " + new Array(60).join("x"), curve: cokNokta }));
ok("ad: denetim karakterleri, yön geçersiz kılma / yalıtım, sıfır genişlikli boşluk, LRM ve BOM atılır; en çok 40 karakter",
  kirli.ok && kirli.ad.slice(0, 6) === "abcde " && kirli.ad.length === 40 && !/[\u0000-\u001f\u007f​‎‮⁦﻿]/.test(kirli.ad), js(kirli.ad));
ok("ad: boşluklar teke iner, kırpılır; 40. karakterde yarım kalan vekil çifti atılır; ZWJ (emoji) kalır",
  E.adTemiz("  a \t\n  b  ") === "a b" && E.adTemiz("  a    b  ") === "a b" && E.adTemiz(new Array(40).join("x") + "😀") === new Array(40).join("x") &&
  E.adTemiz("👩‍💻") === "👩‍💻" && E.adTemiz(5) === "");

/* ================= cubic-bezier / CSS yapıştırma ================= */
var css = function (s) { var r = E.cssCoz(s); return r ? E.toCss(r.curve) + (r.kirpildi ? " !" : "") : null; };
ok("CSS: düz cubic-bezier, bildirim içinde, transition kısaltması, yalın dört sayı", css("cubic-bezier(0.25,0.1,0.25,1)") === "cubic-bezier(0.25, 0.1, 0.25, 1)" &&
  css("transition-timing-function: cubic-bezier(.17, .67, .83, .67);") === "cubic-bezier(0.17, 0.67, 0.83, 0.67)" &&
  css("transition: transform .3s CUBIC-BEZIER(0.7,0,0.3,1) 0s") === "cubic-bezier(0.7, 0, 0.3, 1)" && css(" 0.42, 0, 0.58, 1; ") === "cubic-bezier(0.42, 0, 0.58, 1)");
ok("CSS: anahtar sözcükler (W3C CSS Easing Level 1 tanımları), özellik adıyla da", css("ease") === "cubic-bezier(0.25, 0.1, 0.25, 1)" && css("linear") === "cubic-bezier(0, 0, 1, 1)" &&
  css("animation-timing-function: ease-in-out;") === "cubic-bezier(0.42, 0, 0.58, 1)" && css("Ease-Out") === "cubic-bezier(0, 0, 0.58, 1)" && css("ease-inn") === null);
ok("CSS: y -1–2'ye kırpılır (kirpildi), x 0–1 dışı / eksik / fazla sayı / iki cubic-bezier / NaN / 200+ karakter reddedilir",
  css("cubic-bezier(0.5, -1.6, 0.5, 2.6)") === "cubic-bezier(0.5, -1, 0.5, 2) !" && css("cubic-bezier(1.2, 0, 0.5, 1)") === null && css("cubic-bezier(0.1, 0, 0.5)") === null &&
  css("cubic-bezier(0.1,0,0.5,1,2)") === null && css("cubic-bezier(0,0,1,1) cubic-bezier(0,0,1,1)") === null && css("cubic-bezier(NaN,0,1,1)") === null &&
  css("cubic-bezier(0,0,1,1)" + new Array(200).join(" ")) === null && E.cssOku("steps(4)") === null && E.cssOku(null) === null);
ok("fromCss (adım 10) eskisi gibi sıkı: aralık dışı y reddedilir", E.fromCss("cubic-bezier(0.5, -1.6, 0.5, 2.6)") === null && E.fromCss("ease") === null);
var y1 = E.yapistir("  cubic-bezier(0.3, 0, 0.2, 1)  "), y2 = E.yapistir("https://suflo.app/egri#" + kH), y3 = E.yapistir("cubic-bezier(9,0,1,1)"), y4 = E.yapistir("merhaba");
ok("yapistir: CSS → kaynak 'css'; bağlantı / kod → 'kod' (iki tür); bozuk cubic-bezier 'css', tanınmayan 'bicim'", y1.ok && y1.kaynak === "css" && y1.ad === "" &&
  y2.ok && y2.kaynak === "kod" && y2.tur === "hiz" && y3.hata === "css" && y4.hata === "bicim" && E.yapistir("").hata === "bos");

/* ================= .suflo-egri dosyası ================= */
var dosya = E.dosyaYaz([{ ad: "Çift", curve: cokNokta }, { tur: "hiz", ad: "Dalış", keys: hizEgri.keys, hit: 0.3 }, { ad: "Yay", curve: { type: "spring", response: 0.4, bounce: 0.3 } },
  { ad: "bozuk", curve: { type: "yok" } }, null]);
var okunan = E.dosyaOku(dosya.metin);
ok("dosyaYaz: { suflo: 'egri', v: 1, presets }, her önayar kendi satırında; geçersiz atlanır", dosya.ok && dosya.adet === 3 && dosya.atlanan === 2 &&
  JSON.parse(dosya.metin).suflo === "egri" && JSON.parse(dosya.metin).v === 1 && dosya.metin.split("\n").length === 10, dosya.metin);
ok("dosyaOku: gidiş dönüş (iki tür, sıra ve adlar korunur)", okunan.ok && okunan.bicim === "suflo" && okunan.presets.length === 3 && okunan.uyarilar.length === 0 &&
  js(okunan.presets.map(function (p) { return p.tur + ":" + p.ad; })) === js(["egri:Çift", "hiz:Dalış", "egri:Yay"]) && js(okunan.presets[1].keys) === js(hizEgri.keys));
ok("dosyaOku: baştaki BOM atılır; boş / yalnız BOM 'bos'", E.dosyaOku("﻿" + dosya.metin).presets.length === 3 && E.dosyaOku("﻿  ").hata === "bos" && E.dosyaOku("").hata === "bos");
var tamSinirBas = '{"suflo":"egri","v":1,"presets":[],"x":"';
var tamSinir = tamSinirBas + new Array(65536 - tamSinirBas.length - 2 + 1).join("a") + '"}';   // tam 65536 bayt
var buyuk = '{"suflo":"egri","v":1,"presets":[],"x":"' + new Array(65530).join("a") + '"}';
var cokBaytli = '{"suflo":"egri","v":1,"presets":[],"x":"' + new Array(33000).join("ğ") + '"}';   // ~33 bin karakter, ~66 KB UTF-8
ok("dosyaOku: 64 KB'tan büyük dosya reddedilir (UTF-8 bayt sayılır; tam sınır kabul)", E.dosyaOku(buyuk).hata === "buyuk" && cokBaytli.length < 65536 &&
  E.dosyaOku(cokBaytli).hata === "buyuk" && E.utf8Bayt("ağ😀") === 1 + 2 + 4 &&
  E.dosyaOku(tamSinir).ok && E.utf8Bayt(tamSinir) === 65536 && E.dosyaOku(tamSinir + " ").hata === "buyuk", E.utf8Bayt(tamSinir));
ok("dosyaOku: JSON değil 'json', tanınmayan 'bicim', yeni sürüm 'surum', presets dizi değil 'bicim'", E.dosyaOku("{bozuk").hata === "json" && E.dosyaOku('{"a":1}').hata === "bicim" &&
  E.dosyaOku("[1]").hata === "bicim" && E.dosyaOku('{"suflo":"egri","v":2,"presets":[]}').hata === "surum" && E.dosyaOku('{"suflo":"egri","v":1,"presets":{}}').hata === "bicim" &&
  E.dosyaOku(42).hata === "bos");
var otuzBes = [];
for (var i = 0; i < 35; i++) otuzBes.push({ ad: "E" + i, tur: "egri", curve: { type: "bezier", x1: i / 40, y1: 0, x2: 1 - i / 40, y2: 1 } });
var fazla = E.dosyaOku(JSON.stringify({ suflo: "egri", v: 1, presets: otuzBes }));
ok("dosyaOku: en çok 32 önayar okunur, fazlası 'fazla' uyarısı (n: 3)", fazla.ok && fazla.presets.length === 32 && fazla.fazla === 3 &&
  fazla.uyarilar.some(function (u) { return u.kod === "fazla" && u.n === 3; }) && E.dosyaYaz(otuzBes).adet === 32 && E.dosyaYaz(otuzBes).atlanan === 3);
var karisik = E.dosyaOku(JSON.stringify({ suflo: "egri", v: 1, presets: [
  { ad: "A", tur: "egri", curve: cokNokta }, { ad: "a", tur: "egri", curve: cokNokta }, { ad: "A", tur: "egri", curve: E.builtin("yumusak").curve },
  { ad: "Dokuz", tur: "egri", curve: dokuz }, { ad: "NaN", tur: "hiz", keys: [[0, 100], [1, "x"]] }, { ad: "Renk", tur: "renk" }, 5, [1],
  { ad: "Türsüz eğri", curve: E.builtin("tasma").curve }, { ad: "Türsüz hız", keys: [[0, 100], [1, 50]] },
  { ad: "\u0000Kirli‮ ad", tur: "egri", curve: { type: "bezier", x1: 0.1, y1: 0.2, x2: 0.3, y2: 1 } }] }));
ok("dosyaOku: yineleme (ad büyük / küçük harf ayrımsız + aynı eğri) atlanır; aynı ad başka eğride kalır", karisik.yinelenen === 1 &&
  karisik.presets.filter(function (p) { return p.ad.toLowerCase() === "a"; }).length === 2, js(karisik.presets.map(function (p) { return p.ad; })));
ok("dosyaOku: geçersizler uyarıyla atlanır (nokta, hiz, tur, bozuk ×2), adıyla ve sırasıyla", js(karisik.uyarilar.map(function (u) { return u.kod + ":" + u.i + ":" + u.ad; })) ===
  js(["nokta:3:Dokuz", "hiz:4:NaN", "tur:5:Renk", "bozuk:6:", "bozuk:7:"]), js(karisik.uyarilar));
ok("dosyaOku: türü yazılmamış girdi curve → egri, keys → hiz; adlar temizlenir", js(karisik.presets.slice(-3).map(function (p) { return p.tur + ":" + p.ad; })) ===
  js(["egri:Türsüz eğri", "hiz:Türsüz hız", "egri:Kirli ad"]));
var enUzun = [];
for (var u = 0; u < 32; u++) enUzun.push({ tur: "egri", ad: new Array(39).join("ğ") + ("0" + u).slice(-2), curve: { type: "multi", pts: [0, 0.14, 0.28, 0.42, 0.57, 0.71, 0.85, 1].map(function (x, k) {
  return { x: x, y: -0.987654321 + k * 0.123456789, ix: x - 0.0333333, iy: 1.98765432, ox: x + 0.0333333, oy: -0.98765432, smooth: true }; }) } });
var enUzunDosya = E.dosyaYaz(enUzun);
ok("dosyaYaz: 32 önayar en uzun ad ve 8 noktayla da 64 KB'ın altında (dosyaOku geri okur)", enUzunDosya.adet === 32 && E.utf8Bayt(enUzunDosya.metin) < 65536 &&
  E.dosyaOku(enUzunDosya.metin).presets.length === 32, E.utf8Bayt(enUzunDosya.metin));

/* ================= dış biçim (üçüncü taraf eğri aracının dışa aktarma JSON'u) ================= */
var dis = E.dosyaOku(disDosya([
  { name: "Dizi kübik", curve: [0.1, 0.2, 0.3, 1] },
  { name: "Nesne kübik", curve: { x1: 0.7, y1: -0.4, x2: 0.3, y2: 1.4 } },
  { name: "Metin kübik", curve: "cubic-bezier(0.2, 0, 0, 1)" },
  { name: "Çok noktalı", curve: { points: [{ x: 0, y: 0, out: { x: 0.2, y: 0 } }, { x: 0.5, y: 0.8, in: [0.4, 0.8], out: [0.6, 0.8] }, { x: 1, y: 1 }] } },
  { name: "Nokta dizisi", curve: [[0, 0], [0.3, 0.6], [0.7, 0.4], [1, 1]] },
  { name: "İki nokta", curve: { pts: [{ x: 0, y: 0, ox: 0.3, oy: 0 }, { x: 1, y: 1, ix: 0.7, iy: 1 }] } },
  { name: "Yay", curve: { type: "spring", stiffness: 100 } },
  { name: "İfade", curve: "steps(4)" },
  { name: "Dokuz", curve: { points: dokuz.pts } },
  { name: "Bozuk nokta", curve: { points: [{ x: 0, y: 0 }, { x: "a", y: 1 }] } },
  { name: "Sonsuz", curve: [0.1, 0.2, 0.3, "SONSUZ"] },
  { name: "Dizi kübik", curve: [0.1, 0.2, 0.3, 1] },
  { curve: [0, 0, 0.58, 1] }
]).replace('"SONSUZ"', "1e999"));
ok("dış biçim: tanınır (bicim 'dis'), tek kübik üç şekli eşlenir", dis.ok && dis.bicim === "dis" &&
  E.toCss(dis.presets[0].curve) === "cubic-bezier(0.1, 0.2, 0.3, 1)" && E.toCss(dis.presets[1].curve) === "cubic-bezier(0.7, -0.4, 0.3, 1.4)" &&
  E.toCss(dis.presets[2].curve) === "cubic-bezier(0.2, 0, 0, 1)" && dis.presets[0].ad === "Dizi kübik", js(dis.presets.map(function (p) { return p.ad; })));
var cn = dis.presets[3].curve, nd = dis.presets[4].curve;
ok("dış biçim: çok noktalı (in / out tutamaçları, nokta dizisi) Suflo eğrisine eşlenir; iki nokta cubic-bezier olur", cn.type === "multi" && cn.pts.length === 3 &&
  cn.pts[1].x === 0.5 && cn.pts[1].y === 0.8 && cn.pts[1].ix === 0.4 && cn.pts[1].ox === 0.6 && cn.pts[0].ox === 0.2 && nd.type === "multi" && nd.pts.length === 4 &&
  E.toCss(dis.presets[5].curve) === "cubic-bezier(0.3, 0, 0.7, 1)" && E.toFunction(cn)(0.5) > 0.79 && E.toFunction(cn)(0.5) < 0.81);
ok("dış biçim: tanınmayan şekiller 'bilinmeyen', 8'den çok nokta 'nokta', bozuk / sonsuz sayı 'egri' uyarısıyla atlanır; yineleme atlanır; adsız kabul",
  js(dis.uyarilar.map(function (u) { return u.kod + ":" + u.ad; })) === js(["bilinmeyen:Yay", "bilinmeyen:İfade", "nokta:Dokuz", "egri:Bozuk nokta", "egri:Sonsuz"]) &&
  dis.yinelenen === 1 && dis.presets.length === 7 && dis.presets[6].ad === "", js(dis.uyarilar));
ok("dış biçim: sürüm 1 değilse 'dosyaSurumu' uyarısıyla yine okunur; presets dizi değilse tanınmaz", (function () {
  var r = E.dosyaOku(disDosya([{ name: "x", curve: [0, 0, 1, 1] }], 2));
  var o = {}; o[DIS] = 1; o.presets = "x";
  return r.ok && r.presets.length === 1 && r.uyarilar[0].kod === "dosyaSurumu" && E.dosyaOku(JSON.stringify(o)).hata === "bicim";
})());
ok("dış biçim: disEgri doğrudan (dizi / nesne / metin / bilinmeyen)", E.disEgri([0, 0, 1, 1]).curve.type === "bezier" && E.disEgri({ x1: 0, y1: 0, x2: 1, y2: 1 }).curve.type === "bezier" &&
  E.disEgri("ease").curve.type === "bezier" && E.disEgri("wiggle").hata === "bilinmeyen" && E.disEgri("cubic-bezier(5,0,0,1)").hata === "egri" && E.disEgri(null).hata === "bilinmeyen" &&
  E.disEgri([{ x: 0, y: 0 }]).hata === "egri");

/* ================= iceAktar (Kod yapıştır kutusu ve İçe aktar) ================= */
var i1 = E.iceAktar(kE), i2 = E.iceAktar("ease-out"), i3 = E.iceAktar("﻿" + dosya.metin), i4 = E.iceAktar(disDosya([{ name: "x", curve: [0, 0, 1, 1] }]));
ok("iceAktar: tek kod, CSS, .suflo-egri (BOM'lu), dış biçim aynı biçimde döner", i1.ok && i1.bicim === "kod" && i1.presets.length === 1 && i1.presets[0].ad === "Benim eğrim ğüşİöç" &&
  i2.ok && i2.bicim === "css" && i3.ok && i3.bicim === "suflo" && i3.presets.length === 3 && i4.ok && i4.bicim === "dis");
var satirlar = [kE, "", "https://suflo.app/egri#" + kH, kE, "SFC1.@@", "not: bu bir yorum"].join("\r\n");
var i5 = E.iceAktar(satirlar);
ok("iceAktar: satır satır birkaç kod (bağlantı da), yineleme ve bozuk satır sayılır", i5.ok && i5.bicim === "kod" && i5.presets.length === 2 && i5.yinelenen === 1 &&
  i5.uyarilar.length === 1 && i5.uyarilar[0].kod === "bozuk", js(i5));
ok("iceAktar: tek kodun ikiye bölünmüşü de çözülür; hata kodları geçer", E.iceAktar(kE.slice(0, 20) + "\n" + kE.slice(20)).ok && E.iceAktar("").hata === "bos" &&
  E.iceAktar("merhaba").hata === "bicim" && E.iceAktar("{x").hata === "json" && E.iceAktar("SFC1.@@\nSFC1.##").hata === "bozuk" &&
  E.iceAktar(new Array(70000).join("a")).hata === "buyuk" && E.iceAktar("cubic-bezier(0,-3,1,1)").kirpildi === true);
ok("hiçbir işlev fırlatmaz (çöp girdiler)", [undefined, null, 1, {}, [], "SFC1.", "{}", "{\"suflo\":\"egri\",\"v\":1,\"presets\":[null,{\"tur\":\"egri\",\"curve\":{\"type\":\"multi\",\"pts\":[null,null]}}]}"].every(function (x) {
  try { E.paylasimCoz(x); E.sfcCoz(x); E.iceAktar(x); E.dosyaOku(x); E.yapistir(x); E.cssCoz(x); E.disEgri(x); E.dosyaYaz(x); E.paylasimKodla(x); return true; } catch (e) { return false; }
}));

/* ================= Eğri sekmesi önayar listesi (SufloEgriModel) ================= */
var liste = [{ id: "k1", ad: "Bir", curve: E.builtin("yumusak").curve }, { id: "k2", ad: "İki", curve: E.builtin("tasma").curve }, { id: "k3", ad: "Üç", curve: cokNokta }];
var ad1 = M.onayarAdlandir(liste, "k2", "  Yeni‮ ad\u0000 ");
ok("önayar: yeniden adlandır (ad temizlenir); boş ad 'ad', olmayan id 'yok'", ad1.ok && ad1.liste[1].ad === "Yeni ad" && ad1.liste[1].id === "k2" &&
  M.onayarAdlandir(liste, "k2", " \u0000 ").kod === "ad" && M.onayarAdlandir(liste, "kx", "A").kod === "yok" && liste[1].ad === "İki");
ok("önayar: sürükleyerek taşı (hedef kırpılır; olmayan id sırayı bozmaz)", js(M.onayarTasi(liste, "k3", 0).map(function (o) { return o.id; })) === js(["k3", "k1", "k2"]) &&
  js(M.onayarTasi(liste, "k1", 99).map(function (o) { return o.id; })) === js(["k2", "k3", "k1"]) && js(M.onayarTasi(liste, "yok", 0).map(function (o) { return o.id; })) === js(["k1", "k2", "k3"]) &&
  js(M.onayarTasi(liste, "k2", "x").map(function (o) { return o.id; })) === js(["k1", "k2", "k3"]));
ok("önayar: benzersiz ad 'Ad (2)', 40 karakteri aşmaz", M.benzersizAd("Bir", ["bir"]) === "Bir (2)" && M.benzersizAd("Bir", ["bir", "Bir (2)"]) === "Bir (3)" &&
  M.benzersizAd(new Array(41).join("x"), [new Array(41).join("x")]).length === 40 && M.benzersizAd("Yeni", ["bir"]) === "Yeni");
var gelen = E.iceAktar(E.dosyaYaz([{ ad: "bir", curve: E.builtin("yumusak").curve }, { ad: "Bir", curve: cokNokta }, { ad: "", curve: E.builtin("tasma").curve },
  { ad: "", curve: E.builtin("esnek").curve }, { tur: "hiz", ad: "Hız", keys: [[0, 100], [1, 50]] }, { ad: "Dört", curve: { type: "bezier", x1: 0.1, y1: 0, x2: 0.2, y2: 1 } }]).metin).presets;
var ia = M.onayarlariIceAl(liste, gelen, 1700000000000, function (n) { return "My curve " + n; });
ok("önayar içe al: aynı ad + eğri yineleme; adsız ve eğrisi varsa yineleme; ad çakışınca 'Ad (2)'; adsıza arayüz dilinde ad; hız alınmaz",
  ia.yinelenen === 2 && ia.eklenen.length === 3 && ia.adDegisti === 1 && ia.dolu === 0 &&
  js(ia.liste.slice(3).map(function (o) { return o.ad; })) === js(["Bir (2)", "My curve 5", "Dört"]) && ia.liste.every(function (o) { return /^k[0-9a-z]{1,16}$/.test(o.id); }) &&
  M.onayarlar(ia.liste).length === 6, js(ia));
var dolu = [];
for (var k = 0; k < 23; k++) dolu.push({ id: "k" + k.toString(36), ad: "E" + k, curve: { type: "bezier", x1: k / 30, y1: 0, x2: 1, y2: 1 } });
var ib = M.onayarlariIceAl(dolu, gelen, 5);
ok("önayar içe al: liste en çok 24 (sığmayan 'dolu'); varsayılan ad Türkçe", ib.eklenen.length === 1 && ib.dolu === 4 && ib.liste.length === 24 && ib.liste[23].ad === "bir");
var ic = M.onayarlariIceAl([], [{ tur: "egri", ad: "", curve: cokNokta }, { tur: "egri", ad: "", curve: cokNokta }], 1);
ok("önayar içe al: adsız ikinci kopya yineleme sayılır; id'ler benzersiz", ic.eklenen.length === 1 && ic.yinelenen === 1 && ic.liste[0].ad === "Benim eğrim 1");
ok("önayar dışa: dosyaYaz girdileri ve gidiş dönüş", (function () {
  var d2 = E.dosyaYaz(M.onayarlariDisa(ia.liste)), geri = M.onayarlariIceAl([], E.dosyaOku(d2.metin).presets, 9);
  return d2.adet === 6 && js(geri.liste.map(function (o) { return o.ad + js(o.curve); })) === js(ia.liste.map(function (o) { return o.ad + js(o.curve); }));
})());
ok("metinler: her paylaşım hatasının metni var (bilinmeyen kod 'bozuk' metni); özet parçaları", ["bos", "uzun", "onek", "bicim", "gecersiz", "bozuk", "surum", "tur", "egri", "hiz", "nokta",
  "css", "hizKodu", "egriKodu", "buyuk", "json", "dosyaBicim", "diyalog", "okunamadi", "yazilamadi"].every(function (h) { return M.paylasimHatasi(h).length > 10; }) &&
  M.paylasimHatasi("??") === M.paylasimHatasi("bozuk"));
var oz = M.iceAktarOzeti({ egri: 3, hiz: 1, yinelenen: 2, uyarilar: [{ kod: "bilinmeyen" }, { kod: "egri" }, { kod: "fazla", n: 4 }, { kod: "dosyaSurumu" }] });
ok("içe aktarma özeti: eklenenler, yineleme, geçersiz / tanınmayan / fazla / sürüm uyarıları; araya ' · '", oz.uyari && oz.eklenen === 4 && js(oz.parcalar) === js(["Eğri önayarlarına eklendi: 3", " · ",
  "Hız Rampası özel rampalarına eklendi: 1", " · ", "2 yineleme atlandı", " · ", "1 geçersiz önayar atlandı", " · ",
  "1 tanınmayan eğri atlandı (yalnız tek kübik ve çok noktalı eğriler okunur)", " · ", "dosyadaki ilk 32 önayar okundu, 4 atlandı", " · ",
  "dosya sürümü tanınmadı; okunabilenler alındı"]), js(oz.parcalar));
ok("içe aktarma özeti: yalnız yineleme → 'Yeni önayar eklenmedi' uyarı; temiz ekleme uyarısız", M.iceAktarOzeti({ yinelenen: 1 }).uyari && M.iceAktarOzeti({ yinelenen: 1 }).parcalar[0] === "Yeni önayar eklenmedi" &&
  !M.iceAktarOzeti({ egri: 1, yinelenen: 1 }).uyari && M.iceAktarOzeti({ egri: 1, dolu: 2 }).parcalar[2] === "2 eğri sığmadı (en çok 24 önayar)");

/* ================= Hız Rampası adlı özel rampaları (SufloSpeedRamp) ================= */
var hl = SR.ozelKayitEkle([], "Dalış", [[0, 100], [0.5, 30], [1, 100]], 0.5, 1700000000000).liste;
hl = SR.ozelKayitEkle(hl, "Fırlat", [[0, 100], [1, 400]], null, 1700000000001).liste;
hl = SR.ozelKayitEkle(hl, "Üçüncü", [[0, 50], [1, 50.5]], null, 1700000000002).liste;
var hid = hl.map(function (x) { return x.id; });
ok("özel rampa: yeniden adlandır; aynı ad başka kayıtta 'ayni', boş 'ad', olmayan 'yok'", SR.ozelKayitAdlandir(hl, hid[1], " Roket ").liste[1].ad === "Roket" &&
  SR.ozelKayitAdlandir(hl, hid[1], "dalış").kod === "ayni" && SR.ozelKayitAdlandir(hl, hid[1], "FIRLAT").ok && SR.ozelKayitAdlandir(hl, hid[1], "\u0000").kod === "ad" &&
  SR.ozelKayitAdlandir(hl, "rx", "A").kod === "yok");
ok("özel rampa: sürükleyerek taşı", js(SR.ozelKayitTasi(hl, hid[2], 0).map(function (x) { return x.ad; })) === js(["Üçüncü", "Dalış", "Fırlat"]) &&
  js(SR.ozelKayitTasi(hl, hid[0], 5).map(function (x) { return x.ad; })) === js(["Fırlat", "Üçüncü", "Dalış"]) && SR.ozelKayitTasi(hl, "yok", 1)[0].ad === "Dalış");
var hgelen = E.iceAktar(E.dosyaYaz(SR.ozelKayitlarDisa(hl).concat([
  { tur: "hiz", ad: "dalış", keys: [[0, 100], [0.5, 30], [1, 100]], hit: 0.5 },     // yineleme (ad + eğri)
  { tur: "hiz", ad: "Dalış", keys: [[0, 100], [0.5, 20], [1, 100]], hit: 0.5 },     // aynı ad başka eğri → "Dalış (2)"
  { tur: "hiz", ad: "", keys: [[0, 100], [1, 400]] },                                // adsız ama eğri var → yineleme
  { tur: "hiz", ad: "", keys: [[0, 200], [1, 100]] },                                // adsız yeni → "Özel rampa N"
  { tur: "egri", ad: "Eğri", curve: cokNokta }])).metin).presets;                          // eğri: burada alınmaz
var hi = SR.ozelKayitlarIceAl(hl, hgelen, 1700000009999);
ok("özel rampa içe al: yineleme (kendi dışa aktarması dahil), ad çakışması '(2)', adsıza 'Özel rampa N', eğri türü alınmaz", hi.yinelenen === 4 && hi.eklenen.length === 2 &&
  hi.adDegisti === 1 && js(hi.liste.slice(3).map(function (x) { return x.ad; })) === js(["Dalış (2)", "Özel rampa 5"]) && SR.ozelKayitlar(hi.liste).length === 5 &&
  hi.liste.every(function (x) { return /^r[0-9a-z]{1,16}$/.test(x.id); }), js(hi));
var hEn = SR.ozelKayitlarIceAl([], [{ tur: "hiz", ad: "", keys: [[0, 100], [1, 300]] }], 1, function (s) { return s.replace("Özel rampa", "Custom ramp"); });
ok("özel rampa içe al: adsıza arayüz dilinde ad; en çok 12 ('dolu')", hEn.liste[0].ad === "Custom ramp 1" && (function () {
  var on2 = [];
  for (var q = 0; q < 12; q++) on2 = SR.ozelKayitEkle(on2, "R" + q, [[0, 100], [1, 110 + q * 10]], null, q).liste;
  var r = SR.ozelKayitlarIceAl(on2, [{ tur: "hiz", ad: "Yeni", keys: [[0, 100], [1, 999]] }], 1);
  return r.dolu === 1 && r.liste.length === 12;
})());
ok("özel rampa dışa: kod ve dosya gidiş dönüşü (ağır çekim anı ve adlar)", (function () {
  var d3 = E.dosyaOku(E.dosyaYaz(SR.ozelKayitlarDisa(hl)).metin);
  var geri = SR.ozelKayitlarIceAl([], d3.presets, 3);
  return d3.presets.length === 3 && geri.liste.length === 3 && SR.ozelAyni(geri.liste[0], hl[0]) && geri.liste[0].hit === 0.5 && geri.liste[1].hit === null &&
    SR.ozelAyni(E.paylasimCoz(E.paylasimKodla(SR.ozelKayitlarDisa(hl)[0])), hl[0]);
})());

/* ================= Geçiş / Zoom / Hareket ease alanı (SufloEgriSecim.coz) ================= */
var bil = S.coz("transition-timing-function: cubic-bezier(.2,0,0,1);"), bag = S.coz("https://suflo.app/egri#" + kE), hzk = S.coz(kH);
ok("ease alanı: CSS bildirimi kanonik cubic-bezier, bağlantı kanonik SFC1 kodu (adıyla), Hız Rampası kodu 'hizKodu'", bil.ok && bil.tur === "css" && bil.ease === "cubic-bezier(0.2, 0, 0, 1)" &&
  bag.ok && bag.tur === "kod" && bag.ease === kE && bag.ad === "Benim eğrim ğüşİöç" && !hzk.ok && hzk.hata === "hizKodu" && S.kanonik(kH) === "auto");
ok("ease alanı: anahtar sözcük ve yalın sayılar; y kırpılırsa kirpildi; x aralık dışı 'css'", S.coz("ease-in").ease === "cubic-bezier(0.42, 0, 1, 1)" &&
  S.coz("0.1, 0.2, 0.3, 1").ease === "cubic-bezier(0.1, 0.2, 0.3, 1)" && S.coz("cubic-bezier(0.5,-4,0.5,1)").kirpildi === true && S.coz("cubic-bezier(2,0,1,1)").hata === "css" &&
  S.coz("yumusak").tur === "hazir" && S.coz("dalga").hata === "gecersiz");

/* ================= suflo.app/egri sayfası (docs/js/egri-sayfa.js; sahte DOM) ================= */
function sayfa(hash, lang) {
  var vm = require("vm"), dom = {}, dinle = {};
  function eleman(id) {
    var x = { id: id, hidden: false, _text: "", children: [], style: {}, _a: {}, _o: {} };
    Object.defineProperty(x, "textContent", { get: function () { return x._text; }, set: function (v) { x._text = String(v); } });
    Object.defineProperty(x, "firstChild", { get: function () { return x.children[0] || null; } });
    x.appendChild = function (c) { x.children.push(c); return c; };
    x.removeChild = function (c) { x.children = x.children.filter(function (k) { return k !== c; }); return c; };
    x.setAttribute = function (k, v) { x._a[k] = String(v); };
    x.addEventListener = function (t, f) { x._o[t] = f; };
    return x;
  }
  ["egri-ad", "egri-tur", "egri-hata", "egri-hata-metin", "egri-icerik", "egri-grafik", "egri-sahne", "egri-kare", "egri-bicim", "egri-css-sar", "egri-css", "egri-hit-sar",
    "egri-hit", "egri-nasil", "egri-kod", "kodu-kopyala"].forEach(function (id) { dom[id] = eleman(id); });
  var raf = [];
  var ctx = { console: console, setTimeout: setTimeout, navigator: {}, location: { hash: hash },
    document: { documentElement: { lang: lang || "tr" }, title: "", getElementById: function (id) { return dom[id] || null; },
      createElementNS: function (ns, t) { var e = eleman(""); e.tag = t; return e; }, createElement: function () { return eleman(""); } },
    requestAnimationFrame: function (f) { raf.push(f); return raf.length; }, addEventListener: function (t, f) { dinle[t] = f; } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(KOK, "docs", "js", "ease-curve.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(KOK, "docs", "js", "egri-sayfa.js"), "utf8"), ctx);
  if (raf.length) raf[0](16);
  return { dom: dom, ctx: ctx, raf: raf, dinle: dinle };
}
var s1 = sayfa("#" + kE);
ok("sayfa (eğri kodu): ad, başlık, grafik yolu, canlı önizleme karesi, kod; CSS satırı yalnız cubic-bezier'de", s1.dom["egri-icerik"].hidden === false && s1.dom["egri-hata"].hidden === true &&
  s1.dom["egri-ad"].textContent === "Benim eğrim ğüşİöç" && /Paylaşılan Suflo eğrisi$/.test(s1.ctx.document.title) && s1.dom["egri-css-sar"].hidden === true &&
  s1.dom["egri-grafik"].children.some(function (c) { return c.tag === "path" && /^M[\d.]+ [\d.-]+( L[\d.]+ [\d.-]+)+$/.test(c._a.d); }) && s1.dom["egri-kod"].textContent === kE &&
  s1.dom["egri-bicim"].textContent === "Çok noktalı eğri · 3 nokta" && /%$/.test(s1.dom["egri-kare"].style.left || "") && s1.dom["egri-sahne"].hidden === false, s1.dom["egri-bicim"].textContent);
var s2 = sayfa("#" + E.paylasimKodla({ curve: { type: "bezier", x1: 0.7, y1: 0, x2: 0.3, y2: 1 } }), "en");
ok("sayfa (İngilizce, adsız cubic-bezier): varsayılan ad, CSS satırı", s2.dom["egri-ad"].textContent === "Shared curve" && s2.dom["egri-css-sar"].hidden === false &&
  s2.dom["egri-css"].textContent === "cubic-bezier(0.7, 0, 0.3, 1)" && /^In Suflo: Easing tab/.test(s2.dom["egri-nasil"].textContent));
var s3 = sayfa("#" + kH);
ok("sayfa (Hız Rampası kodu): hız grafiği (%25–%400 çizgileri, noktalar, ağır çekim çizgisi), önizleme karesi gizli", s3.dom["egri-tur"].textContent === "Hız Rampası özel eğrisi" &&
  s3.dom["egri-sahne"].hidden === true && s3.dom["egri-hit"].textContent === "Ağır çekim anı %30" &&
  s3.dom["egri-grafik"].children.filter(function (c) { return c.tag === "circle"; }).length === 4 &&
  s3.dom["egri-grafik"].children.filter(function (c) { return c.tag === "text"; }).map(function (c) { return c.textContent; }).join(",") === "25%,50%,100%,200%,400%" &&
  s3.dom["egri-grafik"].children.some(function (c) { return c._a["class"] === "hit"; }) && /Hız Rampası › Özel eğri/.test(s3.dom["egri-nasil"].textContent));
var s4 = sayfa("#SFC1.bozuk!"), s5 = sayfa(""), s6 = sayfa("#SFC1." + b64({ v: 9, tur: "egri", curve: cokNokta }), "en");
ok("sayfa: bozuk / yeni sürüm kodu hata kartı (dilinde); kodsuz ziyarette yalnız nasıl kullanılır", s4.dom["egri-hata"].hidden === false && s4.dom["egri-icerik"].hidden === true &&
  s4.dom["egri-hata-metin"].textContent === "Bu kod okunamadı; eksik kopyalanmış olabilir." && s5.dom["egri-hata"].hidden === true && s5.dom["egri-icerik"].hidden === true &&
  s6.dom["egri-hata-metin"].textContent === "This code was made with a newer Suflo version; update Suflo.");

/* ================= site kopyası ve temiz oda ================= */
ok("docs/js/ease-curve.js panelinkinin bayt bayt kopyası (suflo.app/egri aynı çözücüyle açar)", fs.existsSync(path.join(KOK, "docs", "js", "ease-curve.js")) &&
  fs.readFileSync(path.join(KOK, "docs", "js", "ease-curve.js"), "utf8") === fs.readFileSync(path.join(KOK, "js", "ease-curve.js"), "utf8"));
var kaynaklar = ["js/egri-model.js", "js/speedramp.js", "js/egri-secim.js", "js/hiz-rampasi.js", "js/egri.js", "index.html", "docs/egri.html", "docs/en/egri.html", "docs/js/egri-sayfa.js"];
ok("temiz oda: dış aracın adı yalnız SufloEase'in okuyucu bölümünde; panel, sayfa ve modeller onu anmaz",
  kaynaklar.every(function (f) { return !new RegExp(DIS, "i").test(fs.readFileSync(path.join(KOK, f), "utf8")); }) &&
  !new RegExp(DIS, "i").test(fs.readFileSync(__filename, "utf8").replace(/"open" \+ "curve"/g, "")));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
