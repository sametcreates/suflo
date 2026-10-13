/*
 * 3.3 adım 21 — Altyazı Efektleri › Premiere yerel: saf model (js/caption-mogrt-json.js), paketteki şablon,
 * sürüm denetimi istisnası, lisans bildirimi ve panel bağlantısı (kaynak denetimi).
 * Çalıştır: node tests/test-caption-mogrt-json.js
 */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var ROOT = path.join(__dirname, "..");
var CMJ = require("../js/caption-mogrt-json.js");
var AE = require("../js/altyazi-efekt.js");
var SE = require("../js/style-engine.js");

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (evidence === undefined ? "" : "   [" + String(evidence).slice(0, 300) + "]")); }
}
function oku(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function kelimeSay(t) { return String(t).split(/\s+/).filter(Boolean).length; }
function satirlarOf(parca) { return JSON.parse(parca.json)[9]; }

/* ---------------- Sözleşme ve göreli zaman ---------------- */
var cues = [
  { start: 10, end: 12.4, text: "Bu bir *önemli* deneme cümlesi" },
  { start: 12.6, end: 14.2, text: "ikinci \"satır\" burada\\ok" }
];
var ayar = AE.normalize({ giris: "pop", aktif: "titre", satir: 2, kelime: 5 });
var r = CMJ.build(cues, ayar, { cueKind: "lines", fps: 25 });
var p0 = r.parcalar[0], dizi = JSON.parse(p0.json);
var stil = AE.sablonStili(ayar, { olcek: 1 });
ok("JSON_Input 10 alanlı dizi: ilk 9 alan altyazi-efekt.js sablonStili ile 1:1",
  dizi.length === 10 && JSON.stringify(dizi.slice(0, 9)) === JSON.stringify(stil), JSON.stringify(dizi.slice(0, 9)));
ok("textAnim / hlAnim giriş ve vurgu kimliklerinin dizini (pop = 1, titre = 2)", dizi[7] === 1 && dizi[8] === 2, dizi.slice(7, 9));
ok("Satır zamanları parçanın başına göre ms (ilk satır 0'dan başlar)", p0.start === 10 && dizi[9][0][0] === 0 && dizi[9][0][1] === 2400, JSON.stringify(dizi[9][0]));
ok("İkinci kart parçanın başına göre (12,6 sn → 2600 ms)", dizi[9][1][0] === 2600 && dizi[9][1][1] === 4200, JSON.stringify(dizi[9][1]));
var hizali = dizi[9].every(function (s) { return s[3].length === 2 * kelimeSay(s[2]); });
ok("Her kartta kelime sayısı = zaman çifti sayısı (satır kırılımı dahil)", hizali, JSON.stringify(dizi[9]));
var tekdüze = dizi[9].every(function (s) {
  for (var i = 0; i < s[3].length; i++) { if (s[3][i] < s[0] || s[3][i] > s[1]) return false; if (i && s[3][i] < s[3][i - 1]) return false; }
  return true;
});
ok("Kelime zamanları kart içinde ve artan", tekdüze, JSON.stringify(dizi[9].map(function (s) { return s[3]; })));
ok("*Vurgu* işaretleri ayıklanır, sayısı vurguKaybi'nde", dizi[9][0][2].indexOf("*") === -1 && /önemli/.test(dizi[9][0][2]) && r.vurguKaybi === 1, dizi[9][0][2] + " / " + r.vurguKaybi);
ok("Tırnak ve ters bölü JSON içinde kaçırılır, geri okununca aynı", dizi[9][1][2].replace(/\n/g, " ") === "ikinci \"satır\" burada\\ok" && /\\\\ok/.test(p0.json) && /\\"satır\\"/.test(p0.json), p0.json);
ok("Kart içi satır kırılımı \\n (önizlemeyle aynı 2 satır)", /\n/.test(dizi[9][0][2]) && p0.json.indexOf("\n") === -1, JSON.stringify(dizi[9][0][2]));

// Kartlar önizlemenin kartlarıyla aynı (stil motorunun efektSatirlari)
var kartlar = SE.efektSatirlari({ cues: cues, cueKind: "lines" }, AE.overrides(ayar));
ok("Kart sayısı ve kelimeleri stil motorunun efekt kartlarıyla aynı", kartlar.length === dizi[9].length &&
  kartlar.every(function (k, i) { return k.kelimeler.map(function (w) { return w.text; }).join(" ") === dizi[9][i][2].replace(/\n/g, " "); }),
  JSON.stringify(kartlar.map(function (k) { return k.kelimeler.map(function (w) { return w.text; }); })));
var r3 = CMJ.build([{ start: 0, end: 4, text: "bir iki üç dört beş altı yedi" }], AE.normalize({ kelime: 3, satir: 1 }), { cueKind: "lines" });
ok("En çok kelime 3: her kartta ≤ 3 kelime, satır kırılımı yok (1 satır)", satirlarOf(r3.parcalar[0]).every(function (s) { return kelimeSay(s[2]) <= 3 && s[2].indexOf("\n") === -1; }),
  JSON.stringify(satirlarOf(r3.parcalar[0])));

// Kontrol karakterleri ve U+2028 (ExtendScript'in eval tabanlı KJSON.parse'ını böler)
var rK = CMJ.build([{ start: 0, end: 2, text: "satır\u2028ayırıcı ve\u0007zil" }], ayar, { cueKind: "lines" });
ok("U+2028 / kontrol karakteri JSON'da ham kalmaz, kelime sayısı korunur",
  !/[\u2028\u2029\u0007]/.test(rK.parcalar[0].json) && satirlarOf(rK.parcalar[0]).every(function (s) { return s[3].length === 2 * kelimeSay(s[2]); }),
  JSON.stringify(satirlarOf(rK.parcalar[0])));

// Üst üste binen kartlar: kart sonu sonraki kartın başını geçmez
var rO = CMJ.build([{ start: 0, end: 3, text: "birinci kart." }, { start: 2, end: 4, text: "ikinci kart." }], ayar, { cueKind: "lines" });
var so = satirlarOf(rO.parcalar[0]);
ok("Çakışan kartlar kırpılır (kart sonu ≤ sonraki kart başı)", so.length === 2 && so[0][1] <= so[1][0], JSON.stringify(so));

/* ---------------- Parçalama: 45 sn ve 8 KB ---------------- */
var uzun = [];
for (var i = 0; i < 120; i++) uzun.push({ start: i * 1.5 + 0.013, end: i * 1.5 + 1.3, text: "kelime " + i + " daha var." });
var rU = CMJ.build(uzun, ayar, { cueKind: "lines", fps: 25 });
ok("Uzun transkript birden çok parçaya bölünür", rU.parcalar.length >= 4, rU.parcalar.length);
ok("Her parça en çok 45 sn (+1 kare)", rU.parcalar.every(function (p) { return p.end - p.start <= 45 + 1 / 25 + 1e-9; }),
  JSON.stringify(rU.parcalar.map(function (p) { return [p.start, p.end]; })));
ok("Parçalar üst üste binmez (aynı izde yan yana)", rU.parcalar.every(function (p, k) { return k === 0 || p.start >= rU.parcalar[k - 1].end - 1e-9; }));
ok("Parça sınırları kareye oturur (25 fps)", rU.parcalar.every(function (p) {
  return Math.abs(p.start * 25 - Math.round(p.start * 25)) < 1e-6 && Math.abs(p.end * 25 - Math.round(p.end * 25)) < 1e-6;
}), JSON.stringify(rU.parcalar.map(function (p) { return [p.start, p.end]; })));
var toplam = rU.parcalar.reduce(function (n, p) { return n + p.satir; }, 0);
ok("Hiçbir kart kaybolmaz (parçaların kart toplamı = kart sayısı)", toplam === rU.satirSayisi && rU.satirSayisi === 120, toplam + " / " + rU.satirSayisi);
ok("İlk satır zamanı kareye oturmuş parça başına göre (negatif değil)", rU.parcalar.every(function (p) { return satirlarOf(p)[0][0] >= 0; }));

var yogun = [];
for (var j = 0; j < 60; j++) yogun.push({ start: j * 0.5, end: j * 0.5 + 0.45, text: "Çok uzun bir altyazı satırı şöyle güzel çalışıyor mu " + j });
var rB = CMJ.build(yogun, AE.normalize({ kelime: 10, satir: 3 }), { cueKind: "lines", bayt: 2000 });
ok("JSON_Input en çok 2 KB sınırında kalır (bayt: UTF-8)", rB.parcalar.length > 1 && rB.parcalar.every(function (p) { return p.bayt <= 2000 && p.bayt === Buffer.byteLength(p.json, "utf8"); }),
  JSON.stringify(rB.parcalar.map(function (p) { return p.bayt; })));
var rB8 = CMJ.build(yogun, AE.normalize({ kelime: 10, satir: 3 }), { cueKind: "lines" });
ok("Varsayılan 8 KB sınırı: daha az parça, her biri ≤ 8000 bayt", rB8.parcalar.length < rB.parcalar.length && rB8.parcalar.every(function (p) { return p.bayt <= CMJ.SINIR.bayt; }),
  rB8.parcalar.length + " / " + rB.parcalar.length);
ok("Sınırlar ve kademeler: 45 sn, 8 KB → 4 KB → 2 KB", CMJ.SINIR.sure === 45 && CMJ.SINIR.bayt === 8000 && CMJ.BAYT_KADEMELERI.join(",") === "8000,4000,2000");

// Kelime modu (k1): her kelime ayrı cue
var rW = CMJ.build([{ start: 0, end: 0.4, text: "merhaba" }, { start: 0.4, end: 0.9, text: "dünya" }], ayar, { cueKind: "words" });
ok("Kelime cue'ları tek kartta birleşir (önizlemedeki gibi)", satirlarOf(rW.parcalar[0]).length === 1 && satirlarOf(rW.parcalar[0])[0][3].length === 4,
  JSON.stringify(satirlarOf(rW.parcalar[0])));
ok("Boş transkript: parça yok", CMJ.build([], ayar, {}).parcalar.length === 0);

/* ---------------- Yerleşim: 1920×1080 kompozisyon → sekans ---------------- */
var y1 = CMJ.yerlesim(1920, 1080, { x: 0.5, y: 0.84 });
ok("1920×1080: ölçek %100, punto çarpanı 1, konum kadraj pikseli", y1.olcek === 100 && y1.punto === 1 && y1.konum[0] === 960 && y1.konum[1] === 907.2, JSON.stringify(y1));
var y2 = CMJ.yerlesim(1080, 1920, { x: 0.5, y: 0.74 });
ok("9:16: konum kompozisyon içinde, ölçek %100-%177,78 arası", y2.olcek >= 100 && y2.olcek <= 177.78 && y2.konum[1] > 0 && y2.konum[1] < 1080 && y2.konum[0] === 960, JSON.stringify(y2));
ok("9:16: punto ölçekten arındırılır (görünen punto = boyut × kısa kenar / 1080)", Math.abs(y2.punto * y2.olcek / 100 - 1) < 0.01, JSON.stringify(y2));
var y3 = CMJ.yerlesim(3840, 2160, { x: 0.25, y: 0.5 });
ok("4K: ölçek %200 (kompozisyon kadrajı yatayda kaplamalı), punto 1, x %25 → kompozisyonda 480, büyütme işaretli",
  y3.olcek === 200 && y3.punto === 1 && y3.konum[0] === 480 && y3.konum[1] === 540 && y3.buyutme === true, JSON.stringify(y3));
/*
 * 3.3 adım 21 incelemesi: AE şablonu kompozisyon çözünürlüğünde çizilir, Motion › Scale %100 üstü onu büyütür (yazı
 * yumuşar). Kompozisyon kadrajdan genişse (9:16, 4:5) ölçek yalnız kartın bandını kaplayacak kadardır.
 */
var temizAyar = AE.normalize(AE.gorunum("temiz").ayar);
var oranAlt916 = AE.sablonKonumu(temizAyar, { w: 1080, h: 1920 });
var yAlt = CMJ.yerlesim(1080, 1920, oranAlt916, { ayar: temizAyar });
ok("9:16 Alt (Temiz): ölçek %100 (büyütme yok, keskin), punto = kısa kenar / 1080 = 1", yAlt.olcek === 100 && yAlt.punto === 1 && yAlt.buyutme === false, JSON.stringify([oranAlt916, yAlt]));
function kartIcinde(W, H, oran, y, pay) {
  var s = y.olcek / 100, cy = y.konum[1], yarim = pay / s;
  return cy - yarim >= -1e-6 && cy + yarim <= 1080 + 1e-6;
}
var payT = CMJ.kartPayi(temizAyar, 1080, 1920);
ok("kartPayi: punto × satır payı + kontur, kısa kenara göre (Temiz 76 pt, 2 satır, kontur 5)", payT === Math.round(76 * (0.65 * 2 + 0.6) + 5), payT);
var vurucu = AE.normalize(AE.gorunum("vurucu").ayar);
var durumlar = [[1080, 1920, { x: 0.5, y: 0.259 }, temizAyar], [1080, 1920, { x: 0.5, y: 0.701 }, vurucu], [1080, 1350, { x: 0.5, y: 0.684 }, temizAyar],
  [720, 1280, { x: 0.5, y: 0.7 }, vurucu]];
ok("Dikey / 4:5 / 720p 9:16: kart (kadraj payıyla) kompozisyonun dikey bandında kalır; ölçek en çok kaplama oranı",
  durumlar.every(function (d) {
    var y = CMJ.yerlesim(d[0], d[1], d[2], { ayar: d[3] }), kapla = Math.max(d[0] / 1920, d[1] / 1080);
    return kartIcinde(d[0], d[1], d[2], y, CMJ.kartPayi(d[3], d[0], d[1])) && y.olcek >= 100 && y.olcek <= Math.round(kapla * 10000) / 100 + 1e-9 &&
      Math.abs(y.punto * y.olcek / 100 - Math.min(d[0], d[1]) / 1080) < 0.01;
  }), JSON.stringify(durumlar.map(function (d) { return CMJ.yerlesim(d[0], d[1], d[2], { ayar: d[3] }); })));
ok("Kart kadraj kenarına taşıyorsa ölçek kaplama oranında durur (%177,78; kompozisyon kadrajın tamamı)",
  CMJ.yerlesim(1080, 1920, { x: 0.5, y: 0.95 }, { ayar: vurucu }).olcek === 177.78);
var yUst = CMJ.yerlesim(1080, 1920, { x: 0.5, y: 0.259 }, { ayar: temizAyar });
ok("9:16 Üst: büyütme yalnız gerektiği kadar (%100 < ölçek < %177,78)", yUst.olcek > 100 && yUst.olcek < 177.78 && yUst.buyutme, JSON.stringify(yUst));
var y720 = CMJ.yerlesim(1280, 720, { x: 0.5, y: 0.84 });
ok("1280×720: küçültme (kaplama %66,67), büyütme yok", y720.olcek === 66.67 && !y720.buyutme && y720.punto === 1, JSON.stringify(y720));
ok("yerlesim: pay verilirse kullanılır (pay 0 → 9:16 Alt'ta %100)", CMJ.yerlesim(1080, 1920, { x: 0.5, y: 0.74 }, { pay: 0 }).olcek === 100);
ok("Oran kontrolü için 0-1 konum da verilir", y1.konumOran[0] === 0.5 && y1.konumOran[1] === 0.84, JSON.stringify(y1.konumOran));
var rP = CMJ.build(cues, AE.normalize({ boyut: 100 }), { cueKind: "lines", punto: y2.punto });
ok("Punto çarpanı JSON'daki puntoya uygulanır", JSON.parse(rP.parcalar[0].json)[3] === Math.round(100 * y2.punto), JSON.parse(rP.parcalar[0].json)[3]);
// 3.3 adım 21 incelemesi: kontur kalınlığı ve gölge mesafesi / yumuşaklığı da kompozisyon pikseli: Motion › Scale onları
// da büyütür. Önizleme gibi ekranda kısa kenara göre olmalı (9:16'da kontur 5 → 5 px, 8,9 değil)
var ayarKG = AE.normalize({ boyut: 76, kontur: 5, golge: { renk: "#000000", opak: 60, mesafe: 6, yumusak: 10 } });
var yKapla = CMJ.yerlesim(1080, 1920, { x: 0.5, y: 0.5 }, { pay: 5000 });
var stKG = JSON.parse(CMJ.build(cues, ayarKG, { cueKind: "lines", punto: yKapla.punto }).parcalar[0].json), sKG = yKapla.olcek / 100;
ok("Ölçek %177,78'de ekrandaki kontur 5 px, gölge mesafesi 6, yumuşaklık 10 (= ayar × kısa kenar / 1080)",
  yKapla.olcek === 177.78 && Math.abs(stKG[4][4] * sKG - 5) < 0.1 && Math.abs(stKG[5][5] * sKG - 6) < 0.1 && Math.abs(stKG[5][6] * sKG - 10) < 0.1 &&
  Math.abs(stKG[3] * sKG - 76) < 1, JSON.stringify(stKG.slice(3, 6)));
var y720p = CMJ.yerlesim(720, 1280, { x: 0.5, y: 0.7 }, { ayar: ayarKG });
var st720 = JSON.parse(CMJ.build(cues, ayarKG, { cueKind: "lines", punto: y720p.punto }).parcalar[0].json);
ok("720×1280 (%100): kontur ekranda 5 × 720 / 1080 ≈ 3,3 px (önizlemenin kısa kenar ölçüsü)",
  Math.abs(st720[4][4] * y720p.olcek / 100 - 5 * 720 / 1080) < 0.1, JSON.stringify([y720p, st720[4]]));
var st1 = JSON.parse(CMJ.build(cues, ayarKG, { cueKind: "lines" }).parcalar[0].json);
ok("Punto çarpanı 1 iken kontur / gölge aynen; kontur 0 ve gölge kapalı [0] kalır",
  st1[4][4] === 5 && st1[5][5] === 6 && st1[5][6] === 10 &&
  JSON.stringify(JSON.parse(CMJ.build(cues, AE.normalize({ kontur: 0 }), { punto: 0.5 }).parcalar[0].json).slice(4, 6)) === "[[0],[0]]");

/*
 * ---------------- Satır sığdırma (3.3 adım 21 incelemesi) ----------------
 * Şablon setFontSize(d[3]) dışında puntoya dokunmaz; önizleme / video katmanı her kartı efektSigdir'le en uzun satırı
 * kadrajın %88'ine (9:16 + "Platform arayüzünden kaçın": %74'lük alanın %88'ine) sığana dek küçültür. 9:16'da ölçek %100
 * iken 1920'lik kompozisyon 1080'lik kadrajdan görünür: sığdırılmayan satır kadraj kenarında kesilir.
 */
var SSg = require("../js/style-share.js");
function previewFs(ayarX, metin, w, h, guvenli) {
  var ov = AE.overrides(ayarX);
  if (guvenli) ov.guvenli = true;
  var m = SE.compile({ styleId: "efekt", overrides: ov, cues: [{ start: 0, end: 2, text: metin }], cueKind: "lines", width: w, height: h }).ass.match(/\\fs(\d+)/);
  return m ? Number(m[1]) : 0;
}
function yerelPlan(ayarX, cuesX, w, h, o) {
  o = o || {};
  var oranX = AE.sablonKonumu(ayarX, { w: w, h: h, guvenli: !!o.guvenli, ornek: { cues: cuesX, cueKind: "lines" } });
  var yerX = CMJ.yerlesim(w, h, oranX, { ayar: ayarX });
  var plan = CMJ.build(cuesX, ayarX, { cueKind: "lines", fps: 30, font: o.font || AE.sablonFontu(ayarX), punto: yerX.punto,
    kadraj: { w: w, h: h, guvenli: !!o.guvenli } });
  return { plan: plan, s: yerX.olcek / 100, yer: yerX };
}
var glitch = AE.normalize(AE.gorunum("glitch").ayar);
var kartG = "Abonelerimizden gelen sorulara";
var pvG = previewFs(glitch, kartG, 1080, 1920);
var ypG = yerelPlan(glitch, [{ start: 0, end: 2, text: kartG }], 1080, 1920);
var dG = JSON.parse(ypG.plan.parcalar[0].json);
ok("9:16 Glitch (Bebas Neue 118, 1 satır): '" + kartG + "' önizlemede \\fs" + pvG + "; yerel çıktıda da ekranda " + pvG + " (118 değil)",
  pvG === 68 && ypG.s === 1 && Math.abs(dG[3] * ypG.s - pvG) < 0.11 && ypG.plan.parcalar[0].punto === dG[3], JSON.stringify([pvG, ypG.s, dG[3]]));
ok("Bebas Neue ölçüsüyle satır 1080'lik kadrajın %88'ine sığar (30 karakter × punto × 0,43 × 1,08)",
  kartG.length * dG[3] * ypG.s * 0.43 * 1.08 <= 0.88 * 1080 + 1e-6, kartG.length * dG[3] * 0.43 * 1.08);
var ypA = yerelPlan(glitch, [{ start: 0, end: 2, text: kartG }], 1080, 1920, { font: "Arial-BoldMT" });
var dA = JSON.parse(ypA.plan.parcalar[0].json);
ok("Font Arial'a düşerse (kurulu değil) Arial'ın genişliğiyle sığdırılır (" + CMJ.ARIAL_GENISLIK + "; Bebas'tan küçük punto)",
  dA[2] === "Arial-BoldMT" && dA[3] < dG[3] && kartG.length * dA[3] * ypA.s * CMJ.ARIAL_GENISLIK * 1.08 <= 0.88 * 1080 + 1e-6, JSON.stringify([dA[3], dG[3]]));
var ypGv = yerelPlan(glitch, [{ start: 0, end: 2, text: kartG }], 1080, 1920, { guvenli: true });
var dGv = JSON.parse(ypGv.plan.parcalar[0].json);
ok("'Platform arayüzünden kaçın' (9:16): kadrajın %74'üne sığdırılır, önizlemenin puntosuyla aynı",
  Math.abs(dGv[3] * ypGv.s - previewFs(glitch, kartG, 1080, 1920, true)) < 0.11 && dGv[3] < dG[3], JSON.stringify([dGv[3], previewFs(glitch, kartG, 1080, 1920, true)]));
ok("Kadraj verilmezse punto eskisi gibi ayarınki (boyut × punto çarpanı)", JSON.parse(CMJ.build([{ start: 0, end: 2, text: kartG }], glitch, { cueKind: "lines" }).parcalar[0].json)[3] === 118);

// Stil motorunun kart puntosu önizlemenin \fs'i ile aynı (tek kaynak: efektSigdir)
var ornekMetinler = ["Abonelerimizden gelen sorulara cevap veriyorum", "ve bu", "Mükemmelleştirebileceklerimizden biri", "Premiere Pro'da altyazı nasıl eklenir?"];
var tekKaynak = AE.GORUNUMLER.every(function (g) {
  var a = AE.normalize(g.ayar);
  return [[1080, 1920], [1920, 1080], [1080, 1350]].every(function (wh) {
    return ornekMetinler.every(function (m) {
      var k = SE.efektSatirlari({ cues: [{ start: 0, end: 2, text: m }], cueKind: "lines" }, AE.overrides(a), { width: wh[0], height: wh[1] });
      return k.length >= 1 && (k.length > 1 || k[0].fs === previewFs(a, m, wh[0], wh[1]));
    });
  });
});
ok("efektSatirlari(kadraj).fs = önizlemenin \\fs'i (her görünüm, 9:16 / 16:9 / 4:5)", tekKaynak);

// Her görünüm × kadraj × güvenli alan × font yedeği: her kartın en uzun satırı × ekrandaki punto × genişlik ≤ %88 alan
var uzunMetin = "Merhaba arkadaşlar bugün sizlere abonelerimizden gelen sorulara cevap vereceğim. Öncelikle şunu söylemek istiyorum " +
  "bu video gerçekten çok uzun zamandır planladığım bir içerik. Premiere Pro'da altyazı nasıl eklenir? Mükemmelleştirebileceklerimizden " +
  "biri de renkler. Ve işte bu kadar! Teşekkürler izlediğiniz için.";
var uzunKelime = uzunMetin.split(/\s+/), uzunCues = [];
for (var u = 0; u * 6 < uzunKelime.length; u++) uzunCues.push({ start: u * 2.5, end: u * 2.5 + 2.4, text: uzunKelime.slice(u * 6, u * 6 + 6).join(" ") });
var genislikler = SSg.widths(), tasan = [], kucuk = [];
AE.GORUNUMLER.forEach(function (g) {
  var a = AE.normalize(g.ayar);
  [[1080, 1920], [1080, 1350], [1080, 1080], [1920, 1080], [720, 1280], [3840, 2160]].forEach(function (wh) {
    [false, true].forEach(function (guv) {
      [false, true].forEach(function (arial) {
        var yp = yerelPlan(a, uzunCues, wh[0], wh[1], { guvenli: guv, font: arial ? "Arial-BoldMT" : "" });
        var kartFs = SE.efektSatirlari({ cues: uzunCues, cueKind: "lines" }, guv ? Object.assign(AE.overrides(a), { guvenli: true }) : AE.overrides(a),
          { width: wh[0], height: wh[1], genislik: arial ? CMJ.ARIAL_GENISLIK : 0 }).map(function (k) { return k.fs; });
        var alan = guv && wh[1] > wh[0] * 1.2 ? Math.round(wh[0] * 0.74) : wh[0];
        var k = arial ? CMJ.ARIAL_GENISLIK : genislikler[a.font], kartNo = 0;
        yp.plan.parcalar.forEach(function (p) {
          var d = JSON.parse(p.json), ekran = d[3] * yp.s;
          d[9].forEach(function (s) {
            var enUzun = Math.max.apply(null, s[2].split("\n").map(function (l) { return l.length; }));
            if (enUzun * ekran * k * 1.08 > 0.88 * alan + 1e-6) tasan.push([g.id, wh.join("x"), guv, arial, s[2], d[3], yp.s]);
            // Hiçbir kart önizlemedeki puntosunun %90'ından küçük, hiçbiri büyük değil (0,1 px yuvarlama payı)
            var onizleme = kartFs[kartNo++];
            if (ekran < onizleme * CMJ.PUNTO_ORANI - 0.1 * yp.s - 1e-6 || ekran > onizleme + 0.5 * yp.s + 1e-6) kucuk.push([g.id, wh.join("x"), guv, arial, s[2], ekran, onizleme]);
          });
        });
      });
    });
  });
});
ok("Her görünüm, 9:16 / 4:5 / 1:1 / 16:9 / 720p / 4K, güvenli alan açık / kapalı, Arial yedeği: en uzun satır × ekrandaki punto × genişlik ≤ %88 × kadraj",
  tasan.length === 0, JSON.stringify(tasan.slice(0, 3)));
ok("Her kart önizlemedeki (sığdırılmış) puntosunun %90'ı ile %100'ü arasında çizilir", kucuk.length === 0, JSON.stringify(kucuk.slice(0, 3)));

// Parçalama: puntosu %10'dan çok farklı kart yeni parça başlatır; aynı puntolu kartlar tek klipte
var karisik = [{ start: 0, end: 1, text: "ve bu" }, { start: 1, end: 2, text: "da öyle" }, { start: 2, end: 3, text: kartG },
  { start: 3, end: 4, text: "tamam mı" }, { start: 4, end: 5, text: "evet" }];
var ypK = yerelPlan(glitch, karisik, 1080, 1920);
var puntolar = ypK.plan.parcalar.map(function (p) { return JSON.parse(p.json)[3]; });
ok("9:16 Glitch: kısa kartlar 118, uzun kart 68 ayrı klipte (3 parça: 118 · 68 · 118), kart kaybolmaz",
  JSON.stringify(puntolar) === "[118,68,118]" && JSON.stringify(ypK.plan.parcalar.map(function (p) { return p.satir; })) === "[2,1,2]" &&
  ypK.plan.parcalar.every(function (p, i) { return i === 0 || p.start >= ypK.plan.parcalar[i - 1].end - 1e-9; }), JSON.stringify(puntolar));
var temiz169 = yerelPlan(temizAyar, uzunCues, 1920, 1080);
ok("16:9 Temiz: sıradan satırlar sığar; tek parça, punto ayarınki (76)", temiz169.plan.parcalar.length === 1 && JSON.parse(temiz169.plan.parcalar[0].json)[3] === 76,
  JSON.stringify(temiz169.plan.parcalar.map(function (p) { return [p.satir, JSON.parse(p.json)[3]]; })));
var y4k = yerelPlan(glitch, [{ start: 0, end: 2, text: "Abonelerimizden gelen sorulara cevap veriyorum hemen şimdi" }], 3840, 2160);
ok("4K (ölçek %200): punto kompozisyon pikseline çevrilir (ekranda = önizlemenin \\fs'i)",
  y4k.s === 2 && Math.abs(JSON.parse(y4k.plan.parcalar[0].json)[3] * 2 - SE.efektSatirlari({ cues: [{ start: 0, end: 2, text: "Abonelerimizden gelen sorulara cevap veriyorum hemen şimdi" }], cueKind: "lines" },
    AE.overrides(glitch), { width: 3840, height: 2160 })[0].fs) <= 0.2, JSON.parse(y4k.plan.parcalar[0].json)[3]);
var ypKs = yerelPlan(glitch, karisik, 1080, 1920);
ok("parca.punto JSON'daki puntoyla aynı", ypKs.plan.parcalar.every(function (p) { return p.punto === JSON.parse(p.json)[3]; }));

/* ---------------- Ayak izi ve bildirim ekleri ---------------- */
var iz = CMJ.izAraligi([{ start: 10, end: 40 }, { start: 40, end: 75.5 }]);
ok("izAraligi: ilk parçanın başından son parçanın başı + şablon süresine (importMGT 1 saatlik overwrite)", iz.start === 10 && iz.end === 40 + CMJ.SABLON.sure && CMJ.SABLON.sure === 3600, JSON.stringify(iz));
ok("izAraligi: boş plan", JSON.stringify(CMJ.izAraligi([])) === '{"start":0,"end":0}');
var ekTam = CMJ.bildirimEkleri({ font: { yedek: true, neden: "kurulu-degil" }, vurguKaybi: 2, logo: true, konusmaci: true, konumYok: 1 });
ok("bildirimEkleri: Arial, vurgu, Marka Kiti logosu, konuşmacı renkleri (+ Video katmanı yolu), konum",
  ekTam.join(" · ") === "yazı tipi Arial · anahtar kelime vurgusu yerel çıktıda yok · Marka Kiti logosu yerel çıktıda yok · konuşmacı renkleri yerel çıktıda yok · bunlar için Çıktı: Video katmanı · konum / ölçek Premiere'de elle ayarlanmalı", ekTam.join(" · "));
ok("bildirimEkleri: yeniden başlat ve italik", CMJ.bildirimEkleri({ font: { yedek: true, neden: "yeniden-baslat" } })[0] === "yazı tipi Arial (Premiere'i yeniden başlat)" &&
  CMJ.bildirimEkleri({ font: { yedek: false, italikYok: true } }).join() === "italik yerel çıktıda yok" && CMJ.bildirimEkleri({}).length === 0);

/* ---------------- Fontlar ---------------- */
ok("fontKuruluMu: Montserrat-Bold.ttf Montserrat'ı karşılar (büyük / küçük harf fark etmez)", CMJ.fontKuruluMu("Montserrat", ["C:\\Windows\\Fonts\\MONTSERRAT-BOLD.TTF"]));
ok("fontKuruluMu: Archivo Black ↔ ArchivoBlack.ttf", CMJ.fontKuruluMu("Archivo Black", ["ArchivoBlack.ttf"]));
ok("fontKuruluMu: başka font ya da lisans metni karşılamaz", !CMJ.fontKuruluMu("Anton", ["arial.ttf", "Anton.txt"]));
// Adım 18 incelemesi: aile adıyla BAŞLAYAN başka aileler (kardeş aile, optik boy kesimi) kurulu sayılmaz
ok("fontKuruluMu: InterTight / Inter_18pt (optik boy) / NunitoSans / MontserratAlternates / BungeeShade başka aile",
  !CMJ.fontKuruluMu("Inter", ["InterTight-Bold.ttf", "Inter_18pt-Bold.ttf", "Inter_24pt-Regular.ttf"]) &&
  !CMJ.fontKuruluMu("Nunito", ["NunitoSans-Regular.ttf", "NunitoSans-Bold.ttf"]) &&
  !CMJ.fontKuruluMu("Montserrat", ["MontserratAlternates-Bold.ttf"]) && !CMJ.fontKuruluMu("Bungee", ["BungeeShade-Regular.ttf", "BungeeHairline-Regular.ttf"]));
ok("fontKuruluMu: yüz adları, boşluklu adlar, değişken font ve Windows'un _0 / (1) kopyaları aynı aile",
  CMJ.fontKuruluMu("Inter", ["Inter-SemiBoldItalic.ttf"]) && CMJ.fontKuruluMu("Bebas Neue", ["Bebas Neue Regular.otf"]) &&
  CMJ.fontKuruluMu("Nunito", ["Nunito-VariableFont_wght.ttf"]) && CMJ.fontKuruluMu("Inter", ["Inter[opsz,wght].ttf"]) &&
  CMJ.fontKuruluMu("Exo 2", ["Exo2-Bold_0.ttf"]) && CMJ.fontKuruluMu("Poppins", ["Poppins-Bold (1).ttf"]) && CMJ.fontKuruluMu("Anton", ["Anton.ttf"]));
ok("fontKuruluMu(yuz): istenen yüz kurulu olmalı (yalnız Black / Italic yetmez); değişken ve tek dosya her yüzü karşılar",
  CMJ.fontKuruluMu("Montserrat", ["Montserrat-Bold.ttf"], "Bold") && !CMJ.fontKuruluMu("Montserrat", ["Montserrat-Black.ttf"], "Bold") &&
  !CMJ.fontKuruluMu("Montserrat", ["Montserrat-BoldItalic.ttf"], "Bold") && !CMJ.fontKuruluMu("Montserrat", ["Montserrat-Bold.ttf"], "Regular") &&
  CMJ.fontKuruluMu("Montserrat", ["Montserrat-Regular.ttf"], "Regular") && CMJ.fontKuruluMu("Lora", ["Lora-VariableFont_wght.ttf"], "Bold") &&
  !CMJ.fontKuruluMu("Lora", ["Lora-Italic-VariableFont_wght.ttf"], "Bold") && CMJ.fontKuruluMu("Anton", ["Anton.ttf"], "Regular") &&
  CMJ.fontKuruluMu("Bangers", ["Bangers-Regular.ttf"], "Regular"));
var fKardes = CMJ.fontSecimi(AE.normalize({ font: "Nunito", kalin: true }), ["NunitoSans-Regular.ttf"]);
var fOptik = CMJ.fontSecimi(AE.normalize({ font: "Inter", kalin: true }), ["Inter_18pt-Bold.ttf", "InterTight-Bold.ttf"]);
ok("fontSecimi: yalnız NunitoSans / Inter_18pt / InterTight kuruluysa Nunito-Bold / Inter-Bold GÖNDERİLMEZ (Arial + 'kurulu-degil')",
  fKardes.yedek && fKardes.neden === "kurulu-degil" && fKardes.ps === "Arial-BoldMT" && fOptik.yedek && fOptik.neden === "kurulu-degil", JSON.stringify([fKardes, fOptik]));
var fYuz = CMJ.fontSecimi(AE.normalize({ font: "Montserrat", kalin: false }), ["Montserrat-Bold.ttf"]);
ok("fontSecimi: Kalın kapalıyken Montserrat-Regular gerekir; yalnız Bold kuruluysa uyarı", fYuz.yedek && fYuz.neden === "kurulu-degil", JSON.stringify(fYuz));
var SS = require("../js/style-share.js");
var fPaket = CMJ.paketFontlari(fs.readdirSync(path.join(ROOT, "fonts")));
ok("fontSecimi: 'Suflo fontlarını kur'un kurduğu dosyalar her paket fontunu her iki yüzde karşılar",
  SS.fontNames().every(function (n) {
    return [true, false].every(function (kalin) { var r = CMJ.fontSecimi(AE.normalize({ font: n, kalin: kalin }), fPaket); return !r.yedek && r.ps !== n; });
  }), JSON.stringify(fPaket));
var fKurulu = CMJ.fontSecimi(AE.normalize({ font: "Montserrat", kalin: true }), ["Montserrat-Bold.ttf"]);
ok("Kurulu bilinen aile: PostScript adı (Montserrat-Bold)", fKurulu.ps === "Montserrat-Bold" && !fKurulu.yedek, JSON.stringify(fKurulu));
var fYok = CMJ.fontSecimi(AE.normalize({ font: "Anton", kalin: true }), ["arial.ttf"]);
ok("Kurulu olmayan aile: Arial (kalın korunur) + 'kurulu-degil' uyarısı", fYok.ps === "Arial-BoldMT" && fYok.yedek && fYok.neden === "kurulu-degil", JSON.stringify(fYok));
var fDenetimsiz = CMJ.fontSecimi(AE.normalize({ font: "Lora", kalin: false }), null);
ok("Dosya listesi yoksa (Node yok) eşlemedeki ad gider", fDenetimsiz.ps === "Lora-Regular" && !fDenetimsiz.yedek, JSON.stringify(fDenetimsiz));
// Adım 18'in yeni bir ailesi (PostScript eşlemesinde yok): Arial'a düşer, uyarı "bilinmiyor"
var eskiN = AE.normalize, eskiS = AE.sablonFontu;
AE.normalize = function () { return { font: "Inter", kalin: false, italik: true }; };
AE.sablonFontu = function (n) { return n.font; };
var fBilinmez;
try { fBilinmez = CMJ.fontSecimi({ font: "Inter" }, ["Inter-Regular.ttf"]); } finally { AE.normalize = eskiN; AE.sablonFontu = eskiS; }
ok("Eşlemede olmayan aile (adım 18 fontu): Arial İtalik + 'bilinmiyor'", fBilinmez.ps === "Arial-ItalicMT" && fBilinmez.neden === "bilinmiyor", JSON.stringify(fBilinmez));
// 3.3 adım 21 incelemesi: "Suflo fontlarını kur"dan sonra Premiere yeniden başlayana kadar yeni font görünmez
var fBek = CMJ.fontSecimi(AE.normalize({ font: "Montserrat", kalin: true }), ["arial.ttf"], { bekleyen: ["Montserrat-Bold.ttf", "Montserrat-Regular.ttf"] });
ok("fontSecimi: font yalnız bu oturumda kurulduysa Arial + 'yeniden-baslat' (PostScript adı gönderilmez)",
  fBek.yedek && fBek.neden === "yeniden-baslat" && fBek.ps === "Arial-BoldMT", JSON.stringify(fBek));
ok("fontSecimi: bekleyen listesi başka aileyi kapsıyorsa yine 'kurulu-degil'; önceden kuruluysa bekleyen etkisiz",
  CMJ.fontSecimi(AE.normalize({ font: "Anton" }), ["arial.ttf"], { bekleyen: ["Montserrat-Bold.ttf"] }).neden === "kurulu-degil" &&
  !CMJ.fontSecimi(AE.normalize({ font: "Montserrat", kalin: true }), ["Montserrat-Bold.ttf"], { bekleyen: ["Montserrat-Bold.ttf"] }).yedek);
var fIt = CMJ.fontSecimi(AE.normalize({ font: "Montserrat", kalin: true, italik: true }), ["Montserrat-Bold.ttf"]);
ok("fontSecimi: İtalik açık, ailenin italik yüzü yok → düz yüz gider ama italikYok (uyarı)", fIt.ps === "Montserrat-Bold" && !fIt.yedek && fIt.italikYok === true, JSON.stringify(fIt));
ok("fontSecimi: Arial'a düşülünce italik Arial'da korunur (italikYok değil); italik kapalıyken italikYok değil",
  CMJ.fontSecimi(AE.normalize({ font: "Anton", kalin: false, italik: true }), ["arial.ttf"]).ps === "Arial-ItalicMT" &&
  !CMJ.fontSecimi(AE.normalize({ font: "Anton", kalin: false, italik: true }), ["arial.ttf"]).italikYok && !fKurulu.italikYok);

// Adobe Fonts: sayısal adlı dosyaların name tablosundan PostScript adı (paketteki gerçek fontlarla ve uydurma dosyalarla)
function okuyucu(buf) { return function (konum, uz) { return buf.slice(konum, konum + uz); }; }
var gercek = ["Montserrat-Bold.ttf", "Anton.ttf", "Lora.ttf", "Inter-Regular.ttf"].map(function (f) {
  return CMJ.fontPostScriptAdlari(okuyucu(fs.readFileSync(path.join(ROOT, "fonts", f))))[0];
});
ok("fontPostScriptAdlari: paketteki fontların nameID 6'sı (Montserrat-Bold, Anton-Regular, Lora-Regular, Inter-Regular)",
  gercek.join(",") === "Montserrat-Bold,Anton-Regular,Lora-Regular,Inter-Regular", gercek.join(","));
function sfnt(ps, mac) {
  // Tek tablolu (name) en küçük sfnt: başlık 12 + dizin 16 + name (6 + 12 + metin)
  var metin = mac ? Buffer.from(ps, "latin1") : Buffer.from(ps.split("").map(function (c) { return "\u0000" + c; }).join(""), "latin1");
  var name = Buffer.alloc(18 + metin.length);
  name.writeUInt16BE(0, 0); name.writeUInt16BE(1, 2); name.writeUInt16BE(18, 4);
  name.writeUInt16BE(mac ? 1 : 3, 6); name.writeUInt16BE(mac ? 0 : 1, 8); name.writeUInt16BE(mac ? 0 : 0x409, 10);
  name.writeUInt16BE(6, 12); name.writeUInt16BE(metin.length, 14); name.writeUInt16BE(0, 16);
  metin.copy(name, 18);
  var bas = Buffer.alloc(28);
  bas.write("OTTO", 0, "latin1"); bas.writeUInt16BE(1, 4);
  bas.write("name", 12, "latin1"); bas.writeUInt32BE(28, 20); bas.writeUInt32BE(name.length, 24);
  return Buffer.concat([bas, name]);
}
ok("fontPostScriptAdlari: OpenType (CFF) Windows UTF-16 ve Mac Roman kaydı", CMJ.fontPostScriptAdlari(okuyucu(sfnt("Montserrat-Bold")))[0] === "Montserrat-Bold" &&
  CMJ.fontPostScriptAdlari(okuyucu(sfnt("BebasNeue-Regular", true)))[0] === "BebasNeue-Regular");
var tek = sfnt("Poppins-Bold"), ttcBas = Buffer.alloc(16);
ttcBas.write("ttcf", 0, "latin1"); ttcBas.writeUInt32BE(0x00010000, 4); ttcBas.writeUInt32BE(1, 8); ttcBas.writeUInt32BE(16, 12);
var ttcIc = Buffer.from(tek); ttcIc.writeUInt32BE(28 + 16, 20);   // koleksiyonda tablo konumu dosya başına göre
ok("fontPostScriptAdlari: koleksiyon (ttcf)", CMJ.fontPostScriptAdlari(okuyucu(Buffer.concat([ttcBas, ttcIc])))[0] === "Poppins-Bold");
ok("fontPostScriptAdlari: font olmayan / bozuk dosyada boş", CMJ.fontPostScriptAdlari(okuyucu(Buffer.from("PK\u0003\u0004 not a font"))).length === 0 &&
  CMJ.fontPostScriptAdlari(okuyucu(Buffer.alloc(0))).length === 0 && CMJ.fontPostScriptAdlari(okuyucu(sfnt("x").slice(0, 30))).length === 0);
ok("Adobe Fonts'tan gelen ad ('Montserrat-Bold.otf') fontSecimi'nde kurulu sayılır",
  !CMJ.fontSecimi(AE.normalize({ font: "Montserrat", kalin: true }), ["arial.ttf", "Montserrat-Bold.otf"]).yedek);
ok("adobeFontKlasorleri: Windows %APPDATA%, macOS Application Support (livetype .r / r); başka platformda yok",
  CMJ.adobeFontKlasorleri("win32", { APPDATA: "C:\\U\\R" }).join("|") === "C:\\U\\R\\Adobe\\CoreSync\\plugins\\livetype\\.r|C:\\U\\R\\Adobe\\CoreSync\\plugins\\livetype\\r" &&
  CMJ.adobeFontKlasorleri("darwin", { HOME: "/Users/a" })[0] === "/Users/a/Library/Application Support/Adobe/CoreSync/plugins/livetype/.r" &&
  CMJ.adobeFontKlasorleri("linux", { HOME: "/h" }).length === 0 && CMJ.adobeFontKlasorleri("win32", {}).length === 0);
var rF = CMJ.build(cues, ayar, { cueKind: "lines", font: "ArialMT" });
ok("Seçilen font JSON'un 3. alanına yazılır", JSON.parse(rF.parcalar[0].json)[2] === "ArialMT");

var plW = CMJ.fontKurulumPlani("win32", { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" }, [
  { dosya: "Anton.ttf", kaynak: "C:\\ext\\fonts\\Anton.ttf" }, { dosya: "Anton.ttf", kaynak: "x" }, { dosya: "OFL-Anton.txt", kaynak: "y" }]);
ok("Windows planı: kullanıcı font klasörü, tekrarsız, yalnız ttf/otf", plW.length === 1 && plW[0].hedef === "C:\\Users\\a\\AppData\\Local\\Microsoft\\Windows\\Fonts\\Anton.ttf", JSON.stringify(plW));
ok("Windows planı: HKCU Fonts değeri reg args DİZİSİ (kabuk dizgesi değil)", Array.isArray(plW[0].reg) &&
  plW[0].reg.join("|") === "add|HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts|/v|Anton (TrueType)|/t|REG_SZ|/d|C:\\Users\\a\\AppData\\Local\\Microsoft\\Windows\\Fonts\\Anton.ttf|/f",
  JSON.stringify(plW[0].reg));
var plM = CMJ.fontKurulumPlani("darwin", { HOME: "/Users/a" }, [{ dosya: "Lora.ttf", kaynak: "/ext/fonts/Lora.ttf" }]);
ok("macOS planı: ~/Library/Fonts, reg yok", plM.length === 1 && plM[0].hedef === "/Users/a/Library/Fonts/Lora.ttf" && plM[0].reg === null, JSON.stringify(plM));
ok("Linux / klasör bilinmiyor: boş plan", CMJ.fontKurulumPlani("linux", { HOME: "/home/a" }, [{ dosya: "Lora.ttf", kaynak: "x" }]).length === 0 &&
  CMJ.fontKurulumPlani("win32", {}, [{ dosya: "Lora.ttf", kaynak: "x" }]).length === 0);
var paket = CMJ.paketFontlari(["Anton.ttf", "Montserrat.ttf", "Montserrat-Bold.ttf", "Montserrat-Regular.ttf", "OFL-Anton.txt", "Lora.ttf"]);
ok("Paket fontları: statik yüzler varsa değişken ana dosya kurulmaz, lisanslar hariç", paket.join(",") === "Anton.ttf,Montserrat-Bold.ttf,Montserrat-Regular.ttf,Lora.ttf", paket.join(","));
ok("Font klasörleri: Windows sistem + kullanıcı, macOS kullanıcı önce",
  CMJ.fontKlasorleri("win32", { WINDIR: "C:\\Windows", LOCALAPPDATA: "C:\\L" }).join("|") === "C:\\Windows\\Fonts|C:\\L\\Microsoft\\Windows\\Fonts" &&
  CMJ.fontKlasorleri("darwin", { HOME: "/Users/a" })[0] === "/Users/a/Library/Fonts");

/* ---------------- Destek denetimi ---------------- */
ok("Premiere 21 desteklenmez (surum)", CMJ.yerelDestek("21.2.0", { seq: true, importMGT: true }).neden === "surum");
ok("Premiere 22+ ve importMGT: destekli", CMJ.yerelDestek("22.0.0", { seq: true, importMGT: true }).ok && CMJ.yerelDestek("26.0", null).ok);
ok("importMGT yoksa 'api', sekans yoksa 'sekans'", CMJ.yerelDestek("25.1", { seq: true, importMGT: false }).neden === "api" && CMJ.yerelDestek("25.1", { seq: false }).neden === "sekans");
ok("Sürüm bilinmiyorsa destekli sayılmaz", !CMJ.yerelDestek("", null).ok);

/* ---------------- Paketteki şablon ---------------- */
var sablonYol = path.join(ROOT, CMJ.SABLON.yol);
var sablonVar = fs.existsSync(sablonYol);
var sha = sablonVar ? crypto.createHash("sha256").update(fs.readFileSync(sablonYol)).digest("hex") : "";
ok("Şablon Suflo yolunda ve sha256'sı TranscriptAI'ın dist/source/dinamik_altyazi_motoru.mogrt'u ile aynı",
  sablonVar && sha === CMJ.SABLON.sha256 && sha === "32c2394de3f639fede180bc274e30166daa0375298af5c5f7ae3dfbf73989969", sha);
var ham = sablonVar ? fs.readFileSync(sablonYol) : Buffer.alloc(0);
ok("Şablon bir MOGRT (zip: definition.json + project.aegraphic)", ham.slice(0, 2).toString() === "PK" && ham.indexOf("definition.json") !== -1 && ham.indexOf("project.aegraphic") !== -1);
ok("Şablon küçük (≈15 KB, font / video gömülü değil)", ham.length > 8000 && ham.length < 32000, ham.length);

var vr = oku("tools/verify-release.ps1");
ok("verify-release: .mogrt istisnası dar (yol + sha256) ve dosya zorunlu",
  vr.indexOf("$sufloSablon = '(^|/)assets/mogrt/altyazi-efekt-v1\\.mogrt$'") !== -1 &&
  vr.indexOf("$sufloSablonSha = '" + CMJ.SABLON.sha256 + "'") !== -1 &&
  /-notmatch \$sufloSablon \}\) \+ \$sablonBozuk/.test(vr) && /Test-SufloSablon \$_/.test(vr) &&
  /'\(\^\|\/\)assets\/mogrt\/altyazi-efekt-v1\\\.mogrt\$'/.test(vr) && /'\(\^\|\/\)js\/caption-mogrt-json\\\.js\$'/.test(vr));
ok("verify-release: başka her .mogrt hâlâ ücretli içerik sayılır", /'\\\.\(mogrt\|prfpset/.test(vr));
ok("Paketleme: assets/ ve js/ klasörleri ZXP'ye ve kurucuya girer",
  /\$stageItems = @\([^)]*"assets"[^)]*"js"|\$stageItems = @\([^)]*"js"[^)]*"assets"/.test(oku("tools/package.ps1")) &&
  /\$panelItems = @\([^)]*"js"[^)]*"assets"/.test(oku("tools/kurucu-yap.ps1")));
ok(".gitattributes: .mogrt ikili (Windows autocrlf sha256'yı bozmasın)", /^\*\.mogrt binary$/m.test(oku(".gitattributes")));

var notices = oku("THIRD_PARTY_NOTICES.md");
ok("THIRD_PARTY_NOTICES: TranscriptAI (MIT, Aktuğ Antika, f1881ea), izinle kullanılan şablon ve uyarlanan dosyalar",
  /TranscriptAI/.test(notices) && /Copyright \(c\) 2026 Aktuğ Antika/.test(notices) && /f1881ea/.test(notices) &&
  /altyazi-efekt-v1\.mogrt/.test(notices) && /author's permission/.test(notices) && /jsx\/host\.jsx/.test(notices));

/* ---------------- Panel bağlantısı (kaynak denetimi) ---------------- */
var html = oku("index.html");
var iAE = html.indexOf('<script src="js/altyazi-efekt.js">'), iCMJ = html.indexOf('<script src="js/caption-mogrt-json.js">'), iCap = html.indexOf('<script src="js/captions.js">');
ok("index.html: caption-mogrt-json.js altyazi-efekt.js'ten sonra, captions.js'ten önce", iAE !== -1 && iCMJ > iAE && iCap > iCMJ, [iAE, iCMJ, iCap].join(","));
ok("index.html: çıktı seçimi (Premiere yerel / Video katmanı), font notu ve kaldır düğmesi",
  /id="cap-efekt-cikti"/.test(html) && /<option value="yerel" selected>Premiere yerel \(render yok\)<\/option>/.test(html) &&
  /<option value="katman">Video katmanı<\/option>/.test(html) && /id="cap-yerel-font-kur"[^>]*>Suflo fontlarını kur</.test(html) && /id="cap-yerel-kaldir"/.test(html));
var cap = oku("js/captions.js");
var ov = cap.slice(cap.indexOf("async function overlayUygula()"), cap.indexOf("function buildAssKaydirilmis("));
ok("Yerel çıktı Pro.gate('overlay') kapısından SONRA ve yalnız Pro'da (deneme filigranlı katmana gider)",
  ov.indexOf('Pro.gate("overlay"') !== -1 && ov.indexOf("yerelAltyaziUygula()") > ov.indexOf('Pro.gate("overlay"') &&
  /if \(yerelCiktiSecili\(\) && \(typeof Pro === "undefined" \|\| Pro\.isPro\(\)\)\) \{\s*if \(await yerelAltyaziUygula\(\)\) return;/.test(ov));
/*
 * Adım 18 incelemesi: Pro'suz (deneme) ekleme her zaman paketteki fontla çizilen filigranlı video katmanıdır. Yeni bir
 * font kurulu değilken "Premiere Arial çizer" notu, "Suflo fontlarını kur" ve "Premiere'in kendi klibi" ipucu yalnız Pro'da.
 */
function govde(ad) {
  var bas = cap.indexOf("  function " + ad + "(");
  return bas === -1 ? "" : cap.slice(bas, cap.indexOf("\n  }\n", bas) + 5);
}
function yerelUi(pro, o) {
  o = o || {};
  var dom = {};
  ["cap-efekt-cikti", "cap-efekt-cikti-sar", "cap-yerel-font-not", "cap-yerel-font-metin", "cap-yerel-font-kur", "cap-apply-hint", "cap-apply-style"].forEach(function (id) {
    dom[id] = { id: id, hidden: false, value: "", textContent: "", disabled: true };
  });
  dom["cap-efekt-cikti"].value = "yerel";
  dom["cap-yerel-font-not"].hidden = true;
  var f = new Function("el", "CMJ", "AE", "Pro", "window", "AYAR", "KURULU", "BEKLEYEN",
    "var secilenMogrt = null, secilenMotorStili = 'efekt', EFEKT = 'efekt', kaliteOnayBekleyen = '';\n" +
    "var yerelBekleyenFontlar = BEKLEYEN;\n" +
    "function efektAyari() { return AE.normalize(AYAR); }\n" +
    "function sistemFontDosyalari() { return KURULU; }\n" +
    "function yerelPlatform() { return 'win32'; } function yerelEnv() { return { LOCALAPPDATA: 'C:\\\\U' }; }\n" +
    "function temizMogrtAdi(m) { return String(m); }\n" +
    govde("yerelCiktiSecili") + govde("yerelCiktiEtkin") + govde("yerelFontNotu") + govde("uygulamaIpucunuGuncelle") +
    "\nreturn { not: yerelFontNotu, ipucu: uygulamaIpucunuGuncelle };");
  var api = f(function (id) { return dom[id] || null; }, CMJ, AE, { isPro: function () { return pro; } },
    { SufloStyleEngine: { preset: function () { return { name: "Altyazı Efektleri" }; } } },
    o.ayar || { font: "Bangers", kalin: true }, o.kurulu || ["arial.ttf"], o.bekleyen || []);
  api.not();
  api.ipucu();
  return dom;
}
var uiPro = yerelUi(true), uiDeneme = yerelUi(false);
ok("Pro + Premiere yerel + kurulu olmayan yeni font: 'kurulu değil' notu ve 'Suflo fontlarını kur' görünür, ipucu yerel klip",
  !uiPro["cap-yerel-font-not"].hidden && /Bangers bu bilgisayarda kurulu değil/.test(uiPro["cap-yerel-font-metin"].textContent) &&
  !uiPro["cap-yerel-font-kur"].hidden && /Premiere'in kendi klibi/.test(uiPro["cap-apply-hint"].textContent), JSON.stringify(uiPro["cap-apply-hint"]));
ok("Pro'suz (deneme) + Premiere yerel: font notu ve kur düğmesi GİZLİ, ipucu filigranlı video katmanını söyler",
  uiDeneme["cap-yerel-font-not"].hidden && !/kendi klibi/.test(uiDeneme["cap-apply-hint"].textContent) &&
  /Premiere yerel çıktı \(render yok\) Pro'da; deneme hakkı altyazıyı filigranlı şeffaf bir video katmanı/.test(uiDeneme["cap-apply-hint"].textContent),
  uiDeneme["cap-apply-hint"].textContent);
// 3.3 adım 21 incelemesi: kurulumdan sonra (Premiere yeniden başlamadan) ve italik için dürüst not
var uiBek = yerelUi(true, { ayar: { font: "Montserrat", kalin: true }, kurulu: ["arial.ttf"], bekleyen: ["Montserrat-Bold.ttf", "Montserrat-Regular.ttf"] });
ok("'Suflo fontlarını kur'dan sonra Premiere yeniden başlamadan: not 'yeniden başlatılana kadar görmez … Arial', kur düğmesi gizli",
  !uiBek["cap-yerel-font-not"].hidden && /^Montserrat kuruldu; Premiere yeniden başlatılana kadar görmez: o zamana kadar Arial çizilir\.$/.test(uiBek["cap-yerel-font-metin"].textContent) &&
  uiBek["cap-yerel-font-kur"].hidden, uiBek["cap-yerel-font-metin"].textContent);
var uiIt = yerelUi(true, { ayar: { font: "Montserrat", kalin: true, italik: true }, kurulu: ["Montserrat-Bold.ttf"] });
ok("İtalik açık, aile kurulu: 'İtalik Premiere yerel çıktıda yok' notu, kur düğmesi gizli",
  !uiIt["cap-yerel-font-not"].hidden && /^İtalik Premiere yerel çıktıda yok: Montserrat düz çizilir/.test(uiIt["cap-yerel-font-metin"].textContent) && uiIt["cap-yerel-font-kur"].hidden,
  uiIt["cap-yerel-font-metin"].textContent);
ok("Aile kurulu, italik kapalı: not gizli", yerelUi(true, { ayar: { font: "Montserrat", kalin: true }, kurulu: ["Montserrat-Bold.ttf"] })["cap-yerel-font-not"].hidden);

// Adobe Fonts taraması (panel yapıştırıcısı, gerçek dosya sistemiyle): sayısal adlı, uzantısız dosyadan PostScript adı
var os = require("os");
var geciciEv = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-adobefont-"));
try {
  var lt = path.join(geciciEv, "Library", "Application Support", "Adobe", "CoreSync", "plugins", "livetype", ".r");
  fs.mkdirSync(lt, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "fonts", "Montserrat-Bold.ttf"), path.join(lt, ".40123"));
  fs.writeFileSync(path.join(lt, ".40124"), "font degil");
  var tara = new Function("K", "CMJ", "require",
    "function yerelPlatform() { return 'darwin'; } function yerelEnv() { return { HOME: " + JSON.stringify(geciciEv) + " }; }\n" +
    govde("adobeFontAdlari") + "\nreturn adobeFontAdlari();")({ fs: fs, path: path }, CMJ, require);
  ok("Adobe Fonts taraması: livetype/.r içindeki sayısal adlı font 'Montserrat-Bold.otf' olarak listelenir, font olmayan atlanır",
    tara.join(",") === "Montserrat-Bold.otf", JSON.stringify(tara));
} finally {
  try { fs.rmSync(geciciEv, { recursive: true, force: true }); } catch (eRm) {}
}

// Premiere sürümü bağlam yoklamasıyla gelince (açılışta Premiere'e gidilmez) 2022 öncesinde seçenek gizlenir
function baglaUi(surum) {
  var dom = {}, dinleyiciler = [], ctx = { app: "" };
  ["cap-efekt-cikti", "cap-efekt-cikti-sar", "cap-yerel-font-kur", "cap-yerel-kaldir"].forEach(function (id) {
    dom[id] = { id: id, hidden: false, value: "yerel", addEventListener: function () {} };
  });
  var kapp = { ctx: function () { return ctx; }, onContext: function (fn) { dinleyiciler.push(fn); } };
  var win = { KApp: kapp, ipucu: 0 };
  var f = new Function("el", "CMJ", "AE", "KApp", "window", "Pro",
    "var yerelDesteklenmiyor = '', YEREL_ANAHTAR = 'suflo.efektCikti';\n" +
    "function yerelFontNotu() {} function yerelKayitNotu() {} function yerelFontlariKur() {} function yerelKaldir() {}\n" +
    "function uygulamaIpucunuGuncelle() { window.ipucu++; }\n" +
    govde("yerelSecenekDurumu") + govde("yerelCiktiBagla") + "\nreturn yerelCiktiBagla;");
  f(function (id) { return dom[id] || null; }, CMJ, AE, kapp, win, undefined)();
  var acilis = dom["cap-efekt-cikti-sar"].hidden;
  ctx = { app: surum, connected: true };
  dinleyiciler.forEach(function (fn) { fn(ctx); });
  return { acilis: acilis, gizli: dom["cap-efekt-cikti-sar"].hidden, ipucu: win.ipucu, dinleyici: dinleyiciler.length };
}
var b21 = baglaUi("15.4.0"), b25 = baglaUi("25.2.0");
ok("Premiere 2021 (15.x): açılışta görünür, bağlam gelince Çıktı seçeneği gizlenir ve ipucu tazelenir (ilk eklemeyi beklemez)",
  b21.dinleyici === 1 && b21.acilis === false && b21.gizli === true && b21.ipucu === 1, JSON.stringify(b21));
ok("Premiere 2025: seçenek görünür kalır, ipucu gereksiz tazelenmez", b25.gizli === false && b25.ipucu === 0, JSON.stringify(b25));
ok("Pro durumu değişince font notu ve ipucu tazelenir (Pro.on, Premiere çağrısı yok)",
  /Pro\.on\(function \(\) \{ yerelFontNotu\(\); uygulamaIpucunuGuncelle\(\); \}\)/.test(cap.slice(cap.indexOf("function yerelCiktiBagla()"), cap.indexOf("function efektKontrolleriniBagla()"))));
var bagla = cap.slice(cap.indexOf("function yerelCiktiBagla()"), cap.indexOf("function efektKontrolleriniBagla()"));
ok("Panel açılışında Premiere çağrısı yok (çıktı seçimi yalnız yerel depo)", bagla.length > 50 && bagla.indexOf("K.call") === -1 && bagla.indexOf("evalScript") === -1);
var kur = cap.slice(cap.indexOf("async function yerelFontlariKur()"), cap.indexOf("function yerelKayitOku()"));
ok("Font kurulumu: reg yalnız args dizisiyle (K.run), kabuk dizgesi yok", /K\.run\("reg", adim\.reg\)/.test(kur) && !/exec\(|execSync|shell:/.test(kur));
var uyg = cap.slice(cap.indexOf("async function yerelAltyaziUygula()"), cap.indexOf("/*\n   * Premiere'in caption izi"));
ok("Yerleştirme hatasında grup kaldırılır; şablon açılamazsa video katmanına düşülür",
  /KS_removeCaptionMogrtBatch/.test(uyg) && /\["ice-aktarma", "bilesen", "sozlesme", "dogrulama"\]/.test(uyg) && /return false;/.test(uyg));
ok("Doğrulama tutmazsa parça boyu küçültülüp yeniden denenir", /hata\.kod === "dogrulama" && ki \+ 1 < kademeler\.length\) continue/.test(uyg));
// 3.3 adım 21 incelemesi (kaynak denetimi): ayak izi, sekans sabitleme, Marka Kiti / konuşmacı renkleri bildirimi
ok("Hazırlık izi grubun ayak izinde arar (izAraligi: son parça + 1 saat), her parça şablon süresini 'iz' olarak verir",
  /var ayak = CMJ\.izAraligi\(plan\.parcalar\);/.test(uyg) && /KS_prepareCaptionMogrt", \{ path: sablon, start: ayak\.start, end: ayak\.end,/.test(uyg) &&
  /iz: CMJ\.SABLON\.sure, expectSeqId: seqId/.test(uyg));
ok("Parçalar ve hazırlık yoklanan sekansa sabit (expectSeqId), yarım grup o sekanstan kaldırılır, kayıt sekans kimliğini taşır",
  /var seqId = String\(probe\.seqId/.test(uyg) && /expectSeqId: seqId \}, 30000\)/.test(uyg) &&
  /KS_removeCaptionMogrtBatch", seqId \? \{ batch: batch, seqId: seqId \}/.test(uyg) && /sekansId: seqId/.test(uyg) &&
  /if \(hata\.kod === "sekans"\) throw new Error/.test(uyg));
ok("Yarım grup kaldırılamazsa 'Kaldır' için kayıt yazılır; Kaldır kayıttaki sekansı hedefler",
  /if \(yerlesen && \(!rm \|\| !rm\.ok \|\| !\(rm\.removed >= yerlesen\)\)\)/.test(uyg) &&
  /k\.sekansId \? \{ batch: k\.batch, seqId: k\.sekansId \}/.test(cap.slice(cap.indexOf("async function yerelKaldir()"), cap.indexOf("function yerelDus("))));
ok("Bildirim: Marka Kiti logosu ve konuşmacı renkleri yerel çıktıda yoksa söylenir (bildirimEkleri)",
  /var logoVar = !!\(kit && kit\.logo && kit\.logo\.path\);/.test(uyg) && /konusmaciRenkleri\(\{ cues: cs \}\)/.test(uyg) &&
  /CMJ\.bildirimEkleri\(\{ font: fontSec, vurguKaybi: plan\.vurguKaybi, logo: logoVar, konusmaci: konusmaciVar/.test(uyg));
ok("Yerleşim kartın payıyla (ayar) hesaplanır; font seçimi bu oturumda kurulanları bekleyen sayar",
  /CMJ\.yerlesim\(w, h, oran, \{ ayar: ayar \}\)/.test(uyg) && /CMJ\.fontSecimi\(ayar, sistemFontDosyalari\(\), \{ bekleyen: yerelBekleyenFontlar \}\)/.test(uyg));
ok("Satır sığdırma: build sekansın kadrajını ve 'Platform arayüzünden kaçın'ı (konumla aynı seçim) alır, font yedeği o.font'tan",
  /var guvenliYer = !!\(el\("cap-guvenli-yerlesim"\) && el\("cap-guvenli-yerlesim"\)\.checked\);/.test(uyg) &&
  /AE\.sablonKonumu\(ayar, \{ w: w, h: h, guvenli: guvenliYer,/.test(uyg) &&
  /CMJ\.build\(cs, ayar, \{ cueKind: tur, fps: probe\.fps, font: fontSec\.ps, punto: yer\.punto, bayt: kademeler\[ki\],\s*kadraj: \{ w: w, h: h, guvenli: guvenliYer \} \}\)/.test(uyg));
ok("Font kurulumu önbelleği tazelemez (Premiere yeni fontu yeniden başlayınca görür); yeni kopyalananlar bekleyen listesine",
  !/yerelFontOnbellek = null/.test(kur) && /if \(yeni\) yerelBekleyenFontlar\.push\(K\.path\.basename\(adim\.hedef\)\)/.test(kur));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
