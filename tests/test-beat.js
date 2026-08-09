/*
 * Ritim motoru gerçekten vuruş buluyor mu?
 *
 * beat.js'in GERÇEK onset/BPM kodu (sahte window ile yüklenir) sentetik,
 * zamanı bilinen PCM'e karşı sınanır: 120 BPM'lik kick dizisi ±60 ms içinde
 * bulunmalı, hi-hat tiz banda düşmeli, sürekli çalan ton onset SAYILMAMALI.
 * Bunlar geçmezse panel rastgele yerlere marker atıyor demektir.
 */
var fs = require("fs");
var pathm = require("path");

var KOK = pathm.join(__dirname, "..");
var SR = 16000;

/* beat.js'i Node'da yükle: modül üst düzeyde DOM'a dokunmuyor */
var src = fs.readFileSync(pathm.join(KOK, "js", "beat.js"), "utf8");
var sandbox = new Function(
  "window", "document", "K", "KApp",
  src + "\nreturn window.KBeat;"
);
var KBeat = sandbox({}, { getElementById: function () { return null; } },
  { log: function () {} }, {});

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 90) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

ok("_onsetBul disari verilmis", typeof KBeat._onsetBul === "function");
ok("_bpmTahmin disari verilmis", typeof KBeat._bpmTahmin === "function");

/* ---------------- Sentetik sinyal üreticileri ---------------- */

function sessizlik(sn) { return new Float32Array(Math.round(sn * SR)); }

/*
 * 5 ms'lik atak rampası şart: tek örneklemde 0->0.9 sıçrayan sinyal klik'tir
 * ve TÜM spektruma yayılır — 60 Hz "kick" tiz bantta da onset üretirdi.
 * Gerçek davul vuruşlarının atağı bant-sınırlıdır; testin taklidi de öyle olmalı.
 */
var ATAK = Math.round(0.005 * SR);
function rampa(i) { return i < ATAK ? 0.5 * (1 - Math.cos(Math.PI * i / ATAK)) : 1; }

// kick taklidi: 60 Hz, 100 ms, üstel sönüm — enerji bas bantta (bin ~4)
function kickEkle(pcm, tSn) {
  var bas = Math.round(tSn * SR);
  var uz = Math.round(0.1 * SR);
  for (var i = 0; i < uz && bas + i < pcm.length; i++) {
    pcm[bas + i] += 0.9 * rampa(i) * Math.exp(-i / (0.02 * SR)) * Math.sin(2 * Math.PI * 60 * i / SR);
  }
}

// hi-hat taklidi: 6 kHz, 30 ms — bin 384, tiz bandın (256+) içinde
function hihatEkle(pcm, tSn) {
  var bas = Math.round(tSn * SR);
  var uz = Math.round(0.03 * SR);
  for (var i = 0; i < uz && bas + i < pcm.length; i++) {
    pcm[bas + i] += 0.6 * rampa(i) * Math.exp(-i / (0.008 * SR)) * Math.sin(2 * Math.PI * 6000 * i / SR);
  }
}

function enYakinFark(liste, t) {
  var enAz = Infinity;
  liste.forEach(function (o) { var d = Math.abs(o.t - t); if (d < enAz) enAz = d; });
  return enAz;
}

/* ================= 1) Kick dizisi: 120 BPM, ±60 ms ================= */

var pcm = sessizlik(8);
var kickler = [];
for (var t = 0.5; t < 7.5; t += 0.5) { kickEkle(pcm, t); kickler.push(t); }

var sonuc = KBeat._onsetBul(pcm);
ok("kick sayisi makul (14 vurus, bulunan " + sonuc.bass.length + ")",
  sonuc.bass.length >= 12 && sonuc.bass.length <= 16, sonuc.bass.length);

var kacik = kickler.filter(function (t) { return enYakinFark(sonuc.bass, t) > 0.06; });
ok("her kick +-60 ms icinde bulundu", kacik.length === 0,
  kacik.length ? "kacirilan: " + kacik.join(", ") : "hepsi yerinde");

var enBuyukSapma = Math.max.apply(null, kickler.map(function (t) {
  return enYakinFark(sonuc.bass, t);
}));
ok("en buyuk sapma < 60 ms", enBuyukSapma < 0.06, Math.round(enBuyukSapma * 1000) + " ms");

ok("guc 0..1 araliginda", sonuc.bass.every(function (o) { return o.guc >= 0 && o.guc <= 1; }));

/* ================= 2) Hi-hat tiz banda düşüyor ================= */

var pcm2 = sessizlik(6);
var hihatlar = [];
for (var t2 = 0.4; t2 < 5.6; t2 += 0.4) { hihatEkle(pcm2, t2); hihatlar.push(t2); }

var sonuc2 = KBeat._onsetBul(pcm2);
var kacik2 = hihatlar.filter(function (t) { return enYakinFark(sonuc2.tiz, t) > 0.06; });
ok("hi-hat'ler tiz bantta +-60 ms icinde", kacik2.length === 0,
  kacik2.length ? "kacirilan: " + kacik2.join(", ") : sonuc2.tiz.length + " onset");

/* ================= 2b) Bant seçiciliği: ikisi BİRLİKTE çalarken ================= */

/*
 * Kullanıcının umursadığı özellik bu: kick ve hi-hat aynı parçada.
 * "Bas" seçince kick zamanları, "tiz" seçince hi-hat zamanları gelmeli —
 * çapraz sızıntı, eşikteki mutlak taban (enB*0.02) sayesinde elenmeli.
 * (Tek başına çalan enstrümanın -50 dB'lik kalıntısını işaretlemek hata
 * değildir — o bantta duyulabilen ritim gerçekten odur; bu yüzden yalnız
 * karışık sinyalde seçicilik test edilir.)
 */
var pcm3 = sessizlik(8);
var k3 = [], h3 = [];
for (var t3 = 0.5; t3 < 7.5; t3 += 0.5) { kickEkle(pcm3, t3); k3.push(t3); }
for (var t4 = 0.75; t4 < 7.5; t4 += 0.5) { hihatEkle(pcm3, t4); h3.push(t4); }

var sonuc3 = KBeat._onsetBul(pcm3);
var basYanlis = sonuc3.bass.filter(function (o) { return Math.min.apply(null, k3.map(function (t) { return Math.abs(o.t - t); })) > 0.06; });
var tizYanlis = sonuc3.tiz.filter(function (o) { return Math.min.apply(null, h3.map(function (t) { return Math.abs(o.t - t); })) > 0.06; });
ok("karisik sinyalde bas banti yalniz KICK'leri veriyor", basYanlis.length === 0,
  basYanlis.length ? "yanlis: " + basYanlis.map(function (o) { return o.t.toFixed(2); }).join(",") : sonuc3.bass.length + " onset");
ok("karisik sinyalde tiz banti yalniz HI-HAT'leri veriyor", tizYanlis.length === 0,
  tizYanlis.length ? "yanlis: " + tizYanlis.map(function (o) { return o.t.toFixed(2); }).join(",") : sonuc3.tiz.length + " onset");
var k3kacik = k3.filter(function (t) { return enYakinFark(sonuc3.bass, t) > 0.06; });
var h3kacik = h3.filter(function (t) { return enYakinFark(sonuc3.tiz, t) > 0.06; });
ok("karisik sinyalde kick'ler kacirilmadi", k3kacik.length === 0,
  k3kacik.length ? "kacirilan: " + k3kacik.join(",") : "hepsi yerinde");
ok("karisik sinyalde hi-hat'ler kacirilmadi", h3kacik.length === 0,
  h3kacik.length ? "kacirilan: " + h3kacik.join(",") : "hepsi yerinde");

/* ================= 3) Yanlış alarm yok ================= */

ok("sessizlikte onset yok", (function () {
  var s = KBeat._onsetBul(sessizlik(4));
  return s.bass.length === 0 && s.tiz.length === 0;
})());

// sürekli 60 Hz ton: spektral akı yalnız DEĞİŞİMİ ölçer — atak sonrası sıfır
ok("surekli tonda en fazla atak onset'i var", (function () {
  var p = sessizlik(5);
  for (var i = Math.round(0.5 * SR); i < p.length; i++) {
    p[i] = 0.7 * Math.sin(2 * Math.PI * 60 * (i - 0.5 * SR) / SR);
  }
  return KBeat._onsetBul(p).bass.length <= 2;
})());

ok("cok kisa girdi bos doner", (function () {
  var s = KBeat._onsetBul(new Float32Array(1000));
  return s.bass.length === 0 && s.tiz.length === 0;
})());

/* ================= 4) BPM tahmini ================= */

function vurusListesi(aralik, adet) {
  var out = [];
  for (var i = 0; i < adet; i++) out.push({ t: i * aralik, guc: 1 });
  return out;
}

ok("0.5 sn aralik -> 120 BPM", KBeat._bpmTahmin(vurusListesi(0.5, 16)) === 120,
  KBeat._bpmTahmin(vurusListesi(0.5, 16)));
ok("0.667 sn aralik -> ~90 BPM", (function () {
  var b = KBeat._bpmTahmin(vurusListesi(2 / 3, 16));
  return b >= 88 && b <= 92;
})(), KBeat._bpmTahmin(vurusListesi(2 / 3, 16)));
// oktav katlama: 0.25 sn (240 BPM gibi görünür) 0.5'e katlanmalı -> 120
ok("cift tempo 120'ye katlaniyor", KBeat._bpmTahmin(vurusListesi(0.25, 24)) === 120,
  KBeat._bpmTahmin(vurusListesi(0.25, 24)));
ok("6'dan az vurus -> 0 (tahmin yok)", KBeat._bpmTahmin(vurusListesi(0.5, 4)) === 0);

// gerçek onset çıktısından uçtan uca BPM
ok("sentetik kick dizisinden BPM 120", (function () {
  var b = KBeat._bpmTahmin(sonuc.bass);
  return b >= 118 && b <= 122;
})(), KBeat._bpmTahmin(sonuc.bass));

/* ================= sonuç ================= */

console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
process.exit(kaldi ? 1 : 0);
