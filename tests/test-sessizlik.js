// Suflo testi: canlı eşikli sessizlik kesimi (3.4) — js/sessizlik.js saf modülü
//  - tepe zarfı: parça sınırında yarım örnek/kare taşınır, pencere tüm kanalların tepesi, -120 tabanı
//  - bul(): tampon, minKesim, Min. konuşma birleştirmesi (TAMPONDAN SONRA ölçülür), kenar kırpması
//  - esikOner (düşük SNR dahil), kucult, kararEsle (%50 örtüşme kuralı), önbellek, kanal sayısı okuma
var S = require("../js/sessizlik.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function yakin(a, b, t) { return Math.abs(a - b) <= (t || 1e-6); }
function js(x) { return JSON.stringify(x); }

// s16le iç içe Buffer: kanallar[k] = örnek dizisi (aynı uzunlukta)
function pcm(kanallar) {
  var n = kanallar[0].length, k = kanallar.length, b = Buffer.alloc(n * k * 2);
  for (var i = 0; i < n; i++) for (var c = 0; c < k; c++) b.writeInt16LE(kanallar[c][i], 2 * (i * k + c));
  return b;
}
function sabit(n, v) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }
function sinus(n, genlik, f, sr) { var a = []; for (var i = 0; i < n; i++) a.push(Math.round(genlik * Math.sin(2 * Math.PI * f * i / sr))); return a; }

/* ---------------- dbfs ---------------- */
ok("dbfs: tam ölçek 0 dB, yarım ölçek ≈ -6.02 dB, 0 → -120", yakin(S.dbfs(32768), 0) && yakin(S.dbfs(16384), -6.0206, 1e-3) && S.dbfs(0) === -120);
ok("dbfs: çok küçük tepe de -120'nin altına inmez", S.dbfs(1e-9) === -120);

/* ---------------- tepe zarfı ---------------- */
var tek = pcm([sabit(160, 0).concat(sabit(160, 16384)).concat(sabit(160, -32768))]);
var st = S.tepeZarfi();
S.zarfBesle(st, tek, { kanal: 1, sr: 16000, win: 0.01 });
var z = S.zarfBitir(st);
ok("mono: 3 pencere (160 örnek = 10 ms), sessiz / -6 dB / 0 dB (-32768 tam ölçek)", z.length === 3 && z[0] === -120 && yakin(z[1], -6.0206, 1e-3) && yakin(z[2], 0), js(z));

// Parça sınırları: bayt bayt ve tek sayılı parçalarla aynı sonuç
var ses = sinus(16000, 12000, 440, 16000).concat(sabit(8000, 30)).concat(sinus(4000, 20000, 220, 16000));
var butun = pcm([ses]);
var stA = S.tepeZarfi(); S.zarfBesle(stA, butun, { kanal: 1 }); var zA = S.zarfBitir(stA);
var stB = S.tepeZarfi();
for (var i = 0; i < butun.length; ) { var boy = 1 + (i % 7) * 13; S.zarfBesle(stB, butun.slice(i, i + boy), { kanal: 1 }); i += boy; }
var zB = S.zarfBitir(stB);
ok("parça sınırı: tek baytlık / 7-13'lük parçalar bütünle aynı zarfı verir (yarım örnek taşınır)", zA.length === zB.length && zA.every(function (v, k) { return v === zB[k]; }), zA.length + " / " + zB.length);
ok("zarf saniyede 100 değer (1.75 sn → 175 pencere)", zA.length === 175, zA.length);
ok("sinüs penceresi ≈ tepe (12000 → -8.73 dB), sessiz bölüm 30 → ≈ -60.8 dB", yakin(zA[50], 20 * Math.log10(12000 / 32768), 0.05) && yakin(zA[120], 20 * Math.log10(30 / 32768), 0.01), zA[50] + " " + zA[120]);
ok("bayt sayacı tutar", stB.bayt === butun.length);

// Stereo: bir kanal sessiz → tepe diğer kanaldan (aşağı karışım gibi 6 dB düşmez)
var sol = sinus(1600, 16384, 300, 16000), sag = sabit(1600, 0);
var stS = S.tepeZarfi();
var stereo = pcm([sol, sag]);
for (var j = 0; j < stereo.length; j += 333) S.zarfBesle(stS, stereo.slice(j, j + 333), { kanal: 2 });
var zS = S.zarfBitir(stS);
var stM = S.tepeZarfi(); S.zarfBesle(stM, pcm([sol]), { kanal: 1 }); var zM = S.zarfBitir(stM);
ok("stereo, bir kanal sessiz: zarf dolu kanalın mono zarfıyla aynı (kare sınırı parça ortasında)", zS.length === 10 && zS.every(function (v, k) { return yakin(v, zM[k]); }), js(zS.slice(0, 3)) + " vs " + js(zM.slice(0, 3)));
var ters = S.tepeZarfi(); S.zarfBesle(ters, pcm([sag, sol]), { kanal: 2 });
ok("stereo, kanallar yer değişse de aynı tepe", S.zarfBitir(ters).every(function (v, k) { return yakin(v, zM[k]); }));
var hata = null;
try { S.zarfBesle(ters, Buffer.alloc(8), { kanal: 1 }); } catch (e) { hata = e; }
ok("akış ortasında kanal sayısı değişirse hata", !!hata);
var yarim = S.tepeZarfi(); S.zarfBesle(yarim, pcm([sabit(80, 1000)]), { kanal: 1 });
ok("yarım pencere zarfBitir'de eklenir", yarim.zarf.length === 0 && S.zarfBitir(yarim).length === 1);

// Özgün hız 48 kHz: pencere 480 örnek, saniyede yine 100 değer
var st48 = S.tepeZarfi(); S.zarfBesle(st48, pcm([sabit(48000, 100)]), { kanal: 1, sr: 48000 });
ok("48 kHz: 1 sn → 100 pencere (480 örnek)", S.zarfBitir(st48).length === 100 && st48.n === 0);

// 22.05 kHz: 10 ms = 220,5 örnek. Pencere sınırları birikimli → zarf ekseni kaymaz (sabit 221 örnek 9 sn'de 1,6 pencere kayardı)
var n22 = 22050 * 10, s22 = sabit(n22, 0);
s22[Math.floor(22050 * 9.005)] = 20000;   // 9.005 sn'de tek tepe → 900. pencere (9.00–9.01 sn)
var b22 = pcm([s22]);
var st22 = S.tepeZarfi(); S.zarfBesle(st22, b22, { kanal: 1, sr: 22050 }); var z22 = S.zarfBitir(st22);
var st22b = S.tepeZarfi();
for (var q = 0; q < b22.length; q += 4097) S.zarfBesle(st22b, b22.slice(q, q + 4097), { kanal: 1, sr: 22050 });
var z22b = S.zarfBitir(st22b);
var tepe22 = z22.reduce(function (a, v, k) { return v > z22[a] ? k : a; }, 0);
ok("22.05 kHz (220,5 örnek / pencere): 10 sn → tam 1000 pencere, 9.005 sn'deki tepe 900. pencerede (eksen kaymaz)",
  z22.length === 1000 && tepe22 === 900 && z22[899] === -120 && z22[901] === -120, z22.length + " pencere, tepe " + tepe22);
ok("22.05 kHz: tek sayılı parçalarla aynı zarf", z22b.length === z22.length && z22b.every(function (v, k) { return v === z22[k]; }), z22b.length);

/* ---------------- ffmpeg argümanları, kanal sayısı ve örnekleme hızı ---------------- */
var ar = S.cozumlemeArgs("C:/a b/klip.mp4", 1.5, 30);
// -ar YOK: silencedetect (Uygula'daki doğrulama) dosyanın kendi hızında ölçer; 16 kHz'e indirmek 8 kHz üstünü
// süzüp tıslama tabanını ~6 dB alçak gösteriyordu (önizleme kesimlerini doğrulama atıyordu)
ok("çözümleme: -ss/-t/-i, -map 0:a:0?, -vn, PTS süzgeci, s16le pipe:1, -ac YOK, -ar YOK (özgün hız)", js(ar.slice(ar.indexOf("-ss"))) === js(["-ss", "1.5", "-t", "30", "-i", "C:/a b/klip.mp4", "-map", "0:a:0?", "-vn", "-af", S.ZAMAN_SUZGECI, "-acodec", "pcm_s16le", "-f", "s16le", "pipe:1"]) && ar.indexOf("-ac") === -1 && ar.indexOf("-ar") === -1 && !/sample_rate|aformat|resample=\d|osr=/.test(ar.join(" ")), js(ar));
// ham PCM zaman damgası taşımaz: ses akışının başlangıç kayması ve PTS boşlukları sessizlikle doldurulmalı
// (silencedetect kare PTS'ini raporlar; gerçek ffmpeg karşılaştırması test-kesim.js'te)
ok("çözümleme: zaman süzgeci aresample, async (boşluk doldurur), first_pts=0 (baş kayması), 10 ms eşik",
  /^aresample=/.test(S.ZAMAN_SUZGECI) && /(^|[=:])async=1(:|$)/.test(S.ZAMAN_SUZGECI) && /(^|:)first_pts=0(:|$)/.test(S.ZAMAN_SUZGECI) &&
  /(^|:)min_hard_comp=0\.01(:|$)/.test(S.ZAMAN_SUZGECI), S.ZAMAN_SUZGECI);
var stderrOrnek = "Input #0, wav, from 'x.wav':\n  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 48000 Hz, 5.1, s16, 4608 kb/s\nOutput #0, s16le, to 'pipe:1':\n  Stream #0:0: Audio: pcm_s16le, 16000 Hz, stereo, s16, 512 kb/s\n";
ok("kanal sayısı: Output #0 satırından (girdi 5.1, çıkış stereo → 2)", S.kanalSayisi(stderrOrnek) === 2);
ok("kanal sayısı: mono 1, 5.1(side) 6, '3 channels' 3",
  S.kanalSayisi("Output #0, s16le, to 'pipe:1':\n Stream #0:0: Audio: pcm_s16le, 16000 Hz, mono, s16, 256 kb/s") === 1 &&
  S.kanalSayisi("Output #0\n Stream #0:0: Audio: pcm_s16le, 16000 Hz, 5.1(side), s16, 1536 kb/s") === 6 &&
  S.kanalSayisi("Output #0\n Stream #0:0: Audio: pcm_s16le, 16000 Hz, 3 channels, s16, 768 kb/s") === 3);
ok("kanal sayısı: bilinmeyen düzen adı → bit hızından (1024 kb/s @16 kHz = 4)", S.kanalSayisi("Output #0\n Stream #0:0: Audio: pcm_s16le, 16000 Hz, garip, s16, 1024 kb/s") === 4);
ok("kanal sayısı: çıkış bölümü yoksa 0", S.kanalSayisi("Stream #0:0: Audio: pcm_s16le, 16000 Hz, stereo") === 0 && S.kanalSayisi("") === 0);
// zarf bu hızla beslenir: girdi bölümündeki hız değil, Output #0'daki (çözümlenen akış) hız
ok("çıkış bilgisi: kanal + hız Output #0 satırından (girdi 48 kHz 5.1 değil, çıkış 16 kHz stereo)", js(S.cikisBilgisi(stderrOrnek)) === js({ kanal: 2, sr: 16000 }), js(S.cikisBilgisi(stderrOrnek)));
ok("çıkış bilgisi: 48000 mono, 44100 stereo, 22050 '3 channels'",
  js(S.cikisBilgisi("Output #0, s16le, to 'pipe:1':\n  Stream #0:0: Audio: pcm_s16le, 48000 Hz, mono, s16, 768 kb/s")) === js({ kanal: 1, sr: 48000 }) &&
  js(S.cikisBilgisi("Output #0\n Stream #0:0: Audio: pcm_s16le, 44100 Hz, stereo, s16, 1411 kb/s")) === js({ kanal: 2, sr: 44100 }) &&
  js(S.cikisBilgisi("Output #0\n Stream #0:0: Audio: pcm_s16le, 22050 Hz, 3 channels, s16, 1058 kb/s")) === js({ kanal: 3, sr: 22050 }));
ok("çıkış bilgisi: okunamazsa { 0, 0 } (kanal varken hız yok olmaz)",
  js(S.cikisBilgisi("")) === js({ kanal: 0, sr: 0 }) && js(S.cikisBilgisi("Output #0\n Stream #0:0: Audio: pcm_s16le, 48000 Hz, garip")) === js({ kanal: 0, sr: 0 }) &&
  js(S.cikisBilgisi("Stream #0:0: Audio: pcm_s16le, 48000 Hz, mono")) === js({ kanal: 0, sr: 0 }));

/* ---------------- bul(): sentetik zarflar ---------------- */
// zarf kurucu: [[sn, dB], …] parçaları 10 ms pencerelere
function zarfYap(parcalar) { var z = []; parcalar.forEach(function (p) { for (var k = 0; k < Math.round(p[0] * 100); k++) z.push(p[1]); }); return z; }
var Z1 = zarfYap([[2, -10], [1.5, -55], [2, -12], [0.3, -50], [2, -12]]);   // 7.8 sn
var ayar = { esik: -38, minSessizlik: 0.8, pay: 0.15, minKonusma: 0, sure: 7.8 };
var r1 = S.bul(Z1, ayar);
ok("tek uzun sessizlik: [2+0.15, 3.5-0.15]; 0.3 sn'lik sessizlik min. sessizliğin altında", r1.kesimler.length === 1 && yakin(r1.kesimler[0].start, 2.15, 1e-6) && yakin(r1.kesimler[0].end, 3.35, 1e-6), js(r1));
ok("ham aralıklar: eşiğin altı koşular, sn cinsinden", js(S.sessizAraliklar(Z1, { esik: -38, minSessizlik: 0.2 }).map(function (a) { return [+a.start.toFixed(2), +a.end.toFixed(2)]; })) === js([[2, 3.5], [5.5, 5.8]]));
ok("eşik tam değer: zarf == eşik sessiz SAYILMAZ (silencedetect gibi < )", S.sessizAraliklar(zarfYap([[1, -38]]), { esik: -38, minSessizlik: 0.1 }).length === 0);

// minKesim: tampondan sonra 0.25 sn'den kısa kalan kesim düşer
var Z2 = zarfYap([[1, -10], [0.5, -60], [1, -10]]);
ok("minKesim: 0.5 sn sessizlik − 2×0.15 = 0.2 < 0.25 → kesim yok", S.bul(Z2, { esik: -38, minSessizlik: 0.3, pay: 0.15, sure: 2.5 }).kesimler.length === 0);
ok("minKesim: pay 0.1 ile 0.3 ≥ 0.25 → kesim var", S.bul(Z2, { esik: -38, minSessizlik: 0.3, pay: 0.1, sure: 2.5 }).kesimler.length === 1);
ok("minKesim ayarlanabilir (0.1)", S.bul(Z2, { esik: -38, minSessizlik: 0.3, pay: 0.15, minKesim: 0.1, sure: 2.5 }).kesimler.length === 1);

// Min. konuşma: ada TAMPONDAN SONRA ölçülür
// sessizlik [1, 2], konuşma [2, 2.3] (0.3 sn), sessizlik [2.3, 3.3]; pay 0.15 → kesimler [1.15,1.85] [2.45,3.15]; ada 1.85→2.45 = 0.6
var Z3 = zarfYap([[1, -10], [1, -60], [0.3, -10], [1, -60], [1, -10]]);
var o3 = { esik: -38, minSessizlik: 0.5, pay: 0.15, sure: 4.3 };
var b0 = S.bul(Z3, o3);
ok("Min. konuşma 0: bugünkü davranış, iki ayrı kesim, ada yok", b0.kesimler.length === 2 && b0.adalar.length === 0 && !b0.kesimler[0].birlesik, js(b0));
o3.minKonusma = 0.5;
var b5 = S.bul(Z3, o3);
ok("Min. konuşma 0.5: tampon öncesi konuşma 0.3 < 0.5 ama tampondan sonraki ada 0.6 ≥ 0.5 → birleşmez", b5.kesimler.length === 2, js(b5));
o3.minKonusma = 0.6 + 1e-6;
var b6 = S.bul(Z3, o3);
ok("Min. konuşma > 0.6: birleşir, birlesik + ada kaydı", b6.kesimler.length === 1 && b6.kesimler[0].birlesik === true && b6.kesimler[0].adaSayisi === 1 &&
  yakin(b6.kesimler[0].start, 1.15) && yakin(b6.kesimler[0].end, 3.15) && b6.adalar.length === 1 && yakin(b6.adalar[0].start, 1.85) && yakin(b6.adalar[0].end, 2.45), js(b6));
var Z4 = zarfYap([[1, -10], [1, -60], [0.2, -10], [1, -60], [0.2, -10], [1, -60], [1, -10]]);
var b7 = S.bul(Z4, { esik: -38, minSessizlik: 0.5, pay: 0.1, minKonusma: 0.45, sure: 5.4 });
ok("zincir birleştirme: üç kesim tek kesim, iki ada", b7.kesimler.length === 1 && b7.adalar.length === 2 && b7.kesimler[0].adaSayisi === 2, js(b7));

// Kenar kırpması
var Z5 = zarfYap([[1, -60], [1, -10], [1, -60]]);
var b8 = S.bul(Z5, { esik: -38, minSessizlik: 0.5, pay: 0, sure: 3 });
ok("kenar: baştaki ve sondaki sessizlik [0.05, sure-0.05] içine kırpılır", b8.kesimler.length === 2 && yakin(b8.kesimler[0].start, 0.05) && yakin(b8.kesimler[1].end, 2.95), js(b8));
ok("kenar ayarlanabilir", yakin(S.bul(Z5, { esik: -38, minSessizlik: 0.5, pay: 0, sure: 3, kenar: 0.2 }).kesimler[0].start, 0.2));
ok("sure verilmezse zarf uzunluğundan", yakin(S.bul(Z5, { esik: -38, minSessizlik: 0.5, pay: 0 }).kesimler[1].end, 2.95));

// kesimlereCevir: silencedetect ham aralıklarıyla eski magiccut akışı (minKonusma 0)
function eskiAkis(sil, pad, dur) {
  var out = [];
  for (var i = 0; i < sil.length; i++) {
    var s = sil[i].start + pad, e = sil[i].end - pad;
    if (e - s < 0.25) continue;
    if (s < 0.05) s = 0.05;
    if (e > dur - 0.05) e = dur - 0.05;
    if (e <= s) continue;
    out.push({ start: s, end: e });
  }
  return out;
}
var hamlar = [{ start: 0, end: 0.9 }, { start: 3.1, end: 3.5 }, { start: 5, end: 6.2 }, { start: 9.4, end: 10 }];
var yeni = S.kesimlereCevir(hamlar, { pay: 0.15, sure: 10 }).kesimler;
ok("kesimlereCevir (minKonusma 0) = 3.3'teki magiccut akışı birebir", js(yeni) === js(eskiAkis(hamlar, 0.15, 10)), js(yeni));
ok("kesimlereCevir: sırasız / bozuk girdi sıralanır, NaN atılır", S.kesimlereCevir([{ start: 5, end: 6.2 }, { start: NaN, end: 1 }, { start: 0, end: 0.9 }], { pay: 0.15, sure: 10 }).kesimler.length === 2);

/* ---------------- esikOner ---------------- */
var gurultuluDegil = zarfYap([[3, -55], [7, -14]]);   // p10 = -55, p95 = -14
var e1 = S.esikOner(gurultuluDegil);
ok("esikOner: p10 + 8 = -47, taban -55, konuşma -14, SNR iyi", e1.esik === -47 && e1.taban === -55 && e1.konusma === -14 && e1.dusukSnr === false, js(e1));
var gurultulu = zarfYap([[3, -30], [7, -22]]);
var e2 = S.esikOner(gurultulu);
ok("esikOner: düşük SNR (p95 − p10 = 8 < 12) uyarısı; eşik -22", e2.dusukSnr === true && e2.esik === -22, js(e2));
ok("esikOner: -60…-20'ye kırpılır", S.esikOner(zarfYap([[5, -120], [5, -10]])).esik === -60 && S.esikOner(zarfYap([[10, -5]])).esik === -20);
ok("esikOner: boş zarf null", S.esikOner([]) === null && S.esikOner(null) === null);
ok("esikOner: girdi zarfı sıralanıp bozulmaz", gurultuluDegil[0] === -55 && gurultuluDegil[gurultuluDegil.length - 1] === -14);

/* ---------------- kucult ---------------- */
var k1 = S.kucult([-10, -20, -30, -40, -50, -60, -70, -80], 4);
ok("kucult: 8 → 4 sütun min/max", js(k1) === js([[-20, -10], [-40, -30], [-60, -50], [-80, -70]]), js(k1));
ok("kucult: px zarftan büyükse zarf uzunluğu kadar sütun", S.kucult([-1, -2, -3], 100).length === 3);
ok("kucult: boş zarf boş dizi, px 0 → 1 sütun", S.kucult([], 10).length === 0 && S.kucult([-5, -9], 0).length === 1);
var kb = S.kucult(zarfYap([[7.77, -30]]), 300);
ok("kucult: düzensiz bölüm, hiçbir sütun boş değil", kb.length === 300 && kb.every(function (p) { return isFinite(p[0]) && isFinite(p[1]); }));

/* ---------------- kararEsle ---------------- */
var eski = [{ start: 10, end: 11, keep: false }, { start: 20, end: 21, keep: true }];
var e3 = S.kararEsle(eski, [{ start: 10.2, end: 11.3 }, { start: 20, end: 21 }, { start: 30, end: 31 }]);
ok("kararEsle: kapalı aralıkla ≥%50 örtüşen yeni aralık kapalı, diğerleri açık", e3[0].keep === false && e3[1].keep === true && e3[2].keep === true, js(e3));
var e4 = S.kararEsle(eski, [{ start: 10.6, end: 12 }]);
ok("kararEsle: örtüşme kısa olanın %40'ı → açık", e4[0].keep === true, js(e4));
var e5 = S.kararEsle(eski, [{ start: 10.5, end: 12 }]);
ok("kararEsle: tam %50 sınırı kapalı", e5[0].keep === false, js(e5));
var e6 = S.kararEsle(eski, [{ start: 9, end: 15, birlesik: true }]);
ok("kararEsle: kapatılan aralığı yutan birleşik kesim kapalı kalır (kısa olana göre)", e6[0].keep === false && e6[0].birlesik === true);
ok("kararEsle: yeni nesneler kopyalanır (girdi değişmez), boş girdiler", !("keep" in { start: 1, end: 2 }) && S.kararEsle(null, null).length === 0 && S.kararEsle([], [{ start: 1, end: 2 }])[0].keep === true);

/* ---------------- kararYaz: kararlar türetilmiş kümeden ayrı ---------------- */
function durum(l) { return l.map(function (r) { return r.keep ? "a" : "k"; }).join(""); }
(function () {
  // Kullanıcı ikinci kesimi kapatır; ara bir kaydırıcı konumunda onunla örtüşen kesim yok; geri dönülür.
  var A = { start: 11.35, end: 12.45 }, B = { start: 13.35, end: 13.95 };
  var kararlar = S.kararYaz([], B, false, [A, B]);
  ok("kararYaz: kapatma kaydı eklenir", kararlar.length === 1 && kararlar[0].keep === false && kararlar[0].start === 13.35, js(kararlar));
  var ara = S.kararEsle(kararlar, [A]);
  var geri = S.kararEsle(kararlar, [A, { start: 13.36, end: 13.94 }]);
  ok("karar listesi: aradaki konumda örtüşen kesim kalmasa da geri dönünce kapalı kalır", durum(ara) === "a" && durum(geri) === "ak", durum(ara) + " " + durum(geri));
  // Eski zincir (her küme bir öncekiyle eşlenir) kararı kaybediyordu: bulgunun kendisi
  var zincir = S.kararEsle(S.kararEsle([{ start: A.start, end: A.end, keep: true }, { start: B.start, end: B.end, keep: false }], [A]), [A, B]);
  ok("(karşılaştırma) zincirleme eşleme ara konumda kararı kaybeder", durum(zincir) === "aa");
  var bos = S.kararEsle(kararlar, []);
  ok("karar listesi: hiç kesim kalmayan konumdan dönüşte de kapalı", bos.length === 0 && durum(S.kararEsle(kararlar, [A, B])) === "ak");
})();
(function () {
  // Kapatılan kesim eşik yükselince komşusuyla birleşir, düşünce ayrılır: "kapalı" komşuya yayılmaz
  var K1 = { start: 8.15, end: 9.35 }, K2 = { start: 9.95, end: 10.85 };
  var kararlar = S.kararYaz([], K1, false, [K1, K2]);
  var birlesik = S.kararEsle(kararlar, [{ start: 8.15, end: 10.85, birlesik: true }]);
  ok("birleşme: kapatılanı yutan birleşik kesim kapalı", durum(birlesik) === "k");
  var ayrik = S.kararEsle(kararlar, [K1, K2]);
  ok("ayrılma: yalnız kullanıcının kapattığı parça kapalı, komşu açık (yayılmaz)", durum(ayrik) === "ka", durum(ayrik));
  var zincir = S.kararEsle(birlesik, [K1, K2]);
  ok("(karşılaştırma) zincirleme eşleme kapalıyı komşuya yayıyordu", durum(zincir) === "kk");
})();
(function () {
  // Açma: aynı kesim, kenarları tampon değişince kaymış → kayıt tümden silinir (artık şerit kalmaz)
  var kararlar = S.kararYaz([], { start: 2.8, end: 3.8 }, false);
  var gorunen = { start: 3.0, end: 3.6 };
  ok("açma öncesi: kaymış kesim kapalı görünür", durum(S.kararEsle(kararlar, [gorunen])) === "k");
  kararlar = S.kararYaz(kararlar, gorunen, true, [gorunen]);
  ok("açma: aynı kesimin kaydı silinir", kararlar.length === 0, js(kararlar));
  ok("açma: tampon geri dönünce kesim açık kalır (kenar artığı kapatmaz)", durum(S.kararEsle(kararlar, [{ start: 2.8, end: 3.8 }])) === "a");
  ok("aç / kapat / aç: liste boşalır", S.kararYaz(S.kararYaz([], gorunen, false), gorunen, true).length === 0);
})();
(function () {
  // Açma: birleşik kesim kapatılmış, ayrılınca parçalardan biri açılır → yalnız o parça açılır
  var M = { start: 1, end: 5 };
  var p1 = { start: 1, end: 2 }, p2 = { start: 2.6, end: 3.4 }, p3 = { start: 4, end: 5 };
  var kararlar = S.kararYaz([], M, false, [M]);
  ok("birleşik kapalı → ayrılınca tüm parçalar kapalı", durum(S.kararEsle(kararlar, [p1, p2, p3])) === "kkk");
  kararlar = S.kararYaz(kararlar, p1, true, [p1, p2, p3]);
  ok("parça açılınca: yalnız o parça açık, kalan bölge kapalı", durum(S.kararEsle(kararlar, [p1, p2, p3])) === "akk" && kararlar.length === 1 &&
    kararlar[0].start === 2 && kararlar[0].end === 5, js(kararlar));
  ok("yeniden birleşince kapalı kalır (kullanıcının kesme dediği bölgeyi içerir)", durum(S.kararEsle(kararlar, [M])) === "k");
  // ekranda başka parça yokken bile büyük bölge korunur (ilerideki konumlarda parçalar geri gelir)
  var k2 = S.kararYaz(S.kararYaz([], M, false), p1, true, [p1]);
  ok("diğer parçalar o an görünmese de geniş bölge korunur", durum(S.kararEsle(k2, [p2, p3])) === "kk", js(k2));
  // kaydın çoğu açılan parçadaysa ama başka bir görünen parçayı da kapalı tutuyorsa silinmez, kırpılır
  var x = { start: 1, end: 3 }, r = { start: 1, end: 2.2 }, r2 = { start: 2.5, end: 3.0 };
  var k3 = S.kararYaz(S.kararYaz([], x, false), r, true, [r, r2]);
  ok("açılan parça kaydın çoğu olsa da komşu parça kapalı kalır", durum(S.kararEsle(k3, [r, r2])) === "ak", js(k3));
  ok("kararYaz: girdi listesi değişmez, geçersiz aralık listeyi aynen döndürür", kararlar !== null && S.kararYaz(kararlar, { start: 3, end: 3 }, false).length === kararlar.length);
})();

/* ---------------- kesimlerAyni: önizleme ↔ doğrulama ---------------- */
var on1 = [{ start: 1, end: 2 }, { start: 3, end: 4 }];
ok("kesimlerAyni: kenarlar 50 ms içinde → aynı", S.kesimlerAyni(on1, [{ start: 1.04, end: 1.96 }, { start: 3.05, end: 4 }]));
ok("kesimlerAyni: sayı farklı → farklı", !S.kesimlerAyni(on1, [{ start: 1, end: 2 }]) && !S.kesimlerAyni(on1, on1.concat([{ start: 5, end: 6 }])));
ok("kesimlerAyni: bir kenar 60 ms kaymış → farklı", !S.kesimlerAyni(on1, [{ start: 1, end: 2.06 }, { start: 3, end: 4 }]));
ok("kesimlerAyni: boş ↔ boş aynı, tol parametresi", S.kesimlerAyni([], []) && S.kesimlerAyni(null, []) && S.kesimlerAyni(on1, [{ start: 1.2, end: 2 }, { start: 3, end: 4 }], 0.25));

/* ---------------- önbellek ---------------- */
ok("anahtar: mediaPath|in|dur (ms hassasiyet)", S.anahtar("a.mp4", 1.23456, 10) === "a.mp4|1.235|10.000");
var ob = S.onbellekYap(2);
ob.koy("a", [1]); ob.koy("b", [2]); ob.koy("c", [3]);
ok("önbellek: en çok 2 kayıt, en eski düşer", ob.al("a") === null && ob.al("b")[0] === 2 && ob.al("c")[0] === 3 && ob.boyut() === 2);
ob.temizle();
ok("önbellek: temizle hepsini siler", ob.al("b") === null && ob.boyut() === 0);

/* ---------------- 3.4 adım 7: kapsam aralığı ---------------- */
ok("kapsamAraligi: seçili klip → klibin sekans aralığı; klip yoksa 'klip'",
  js(S.kapsamAraligi("clip", { sel: { clipStart: 4, clipEnd: 9 } })) === js({ start: 4, end: 9 }) && S.kapsamAraligi("clip", {}).hata === "klip");
ok("kapsamAraligi: In → Out; Out ≤ In ya da bir kareden kısa → 'inout'; sekans yok → 'sekans'",
  js(S.kapsamAraligi("inout", { hasSeq: true, seqIn: 10, seqOut: 40, seqDur: 60 })) === js({ start: 10, end: 40 }) &&
  S.kapsamAraligi("inout", { hasSeq: true, seqIn: 10, seqOut: 10, seqDur: 60 }).hata === "inout" &&
  S.kapsamAraligi("inout", { hasSeq: true, seqIn: 10, seqOut: 10.01, seqDur: 60, frame: 0.04 }).hata === "inout" &&
  S.kapsamAraligi("inout", { hasSeq: false }).hata === "sekans");
ok("kapsamAraligi: Out sekans sonunu aşmaz; Sekans 0 → seqDur, süresiz sekans 'sekans'",
  S.kapsamAraligi("inout", { hasSeq: true, seqIn: 5, seqOut: 900, seqDur: 60 }).end === 60 &&
  js(S.kapsamAraligi("entire", { hasSeq: true, seqDur: 75.5 })) === js({ start: 0, end: 75.5 }) && S.kapsamAraligi("entire", { hasSeq: true, seqDur: 0 }).hata === "sekans");

/* ---------------- 3.4 adım 7: korunan katman önerisi (korumaOner) ---------------- */
ok("muzikAdi: müzik / music / bgm / şarkı / song / ambiyans / ambience; Türkçe büyük harf ve şapkasız yazım",
  ["Müzik", "MÜZİK", "muzik", "Music Bed", "BGM", "Şarkı", "SARKI", "song", "Ambiyans", "Room ambience"].every(S.muzikAdi) &&
  !["Audio 1", "Ses", "Mikrofon", "Kamera", "Diyalog", ""].some(S.muzikAdi));
ok("izEtiketi: varsayılan adlar kısa (A2 / V1), özel ad eklenir",
  S.izEtiketi("audio", 1, "Audio 2") === "A2" && S.izEtiketi("video", 0, "Video 1") === "V1" && S.izEtiketi("audio", 0, "Ses 1") === "A1" &&
  S.izEtiketi("audio", 2, "Müzik") === "A3 · Müzik" && S.izEtiketi("video", 1, "") === "V2");

function izYap(ad, klipler, o) {
  o = o || {};
  var bas = klipler.length ? Math.min.apply(null, klipler.map(function (k) { return k.s; })) : 0;
  var son = klipler.length ? Math.max.apply(null, klipler.map(function (k) { return k.e; })) : 0;
  return { name: ad, locked: !!o.locked, muted: !!o.muted, clipCount: klipler.length, first: bas, last: son, klipler: klipler };
}
function k(s, e, o) { o = o || {}; var x = { s: s, e: e, ad: o.ad || "", yol: o.yol || "", hiza: o.hiza || 0 }; if (o.bag !== undefined) x.bag = o.bag; return x; }
// V1 kamera (bağlı A1), A2 müzik (adıyla), A3 tek uzun ses (adsız), A4 boş
var duzen = {
  video: [izYap("Video 1", [k(0, 30, { yol: "cam.mp4", ad: "Kamera" }), k(30, 60, { yol: "cam2.mp4", ad: "Kamera 2", hiza: -20 })]), izYap("Video 2", [k(5, 50, { ad: "Başlık" })])],
  audio: [
    izYap("Audio 1", [k(0, 30, { yol: "cam.mp4", bag: [{ s: 0, e: 30, tur: "Video" }] }), k(30, 60, { yol: "cam2.mp4", hiza: -20, bag: [{ s: 30, e: 60, tur: "Video" }] })]),
    izYap("Müzik", [k(0, 60, { yol: "sarki.mp3", bag: [] })]),
    izYap("Audio 3", [k(2, 58, { yol: "yaka.wav", bag: [] })]),
    izYap("Audio 4", [])
  ]
};
var o1 = S.korumaOner(duzen, { start: 0, end: 60, mod: "ripple" });
ok("korumaOner ad kuralı: 'Müzik' adlı ses katmanı önceden korunur; video hiç işaretlenmez",
  js(o1.koru) === js({ video: [], audio: [1] }) && js(o1.adla.audio) === js([1]), js(o1.koru));
ok("korumaOner dinle: videoya bağlı kamera sesi (A1) varsa yalnız o; müzik dinlenmez", js(o1.dinle) === js([0]), js(o1.dinle));
ok("korumaOner kaplama kuralı: tek klibi aralığın %80+'ini kaplayan A3 önerilir ama İŞARETLENMEZ (boş A4 önerilmez)",
  js(o1.oner.audio) === js([2]) && o1.koru.audio.indexOf(2) === -1, js(o1.oner));
var o1b = S.korumaOner(duzen, { start: 0, end: 60, mod: "ripple", dinle: [0, 2] });
ok("korumaOner: dinlenen katman önerilmez (kullanıcı A3'ü dinlemeye kattı)", js(o1b.dinle) === js([0, 2]) && js(o1b.oner.audio) === "[]", js(o1b.oner));
var o1c = S.korumaOner(duzen, { start: 0, end: 100, mod: "ripple" });
ok("korumaOner kaplama: 56 sn'lik klip 100 sn'lik aralığın %80'ini kaplamaz → önerilmez", js(o1c.oner.audio) === "[]", js(o1c.oner));
ok("korumaOner: kullanıcı seçimi aynen (geçersiz / yinelenen dizin atılır, sıralı)",
  js(S.korumaOner(duzen, { start: 0, end: 60, koru: { video: [1, 1, 9], audio: [3, -1, 0] }, dinle: [2, "x", 2] }).koru) === js({ video: [1], audio: [0, 3] }) &&
  js(S.korumaOner(duzen, { start: 0, end: 60, dinle: [2, "x", 2] }).dinle) === js([2]));

// bağlı olmayan düzen: dinle = adı müzik olmayan, aralıkta klibi olan, susturulmamış katmanlar
var duz2 = { video: [izYap("Video 1", [k(0, 60, { yol: "ekran.mp4" })])],
  audio: [izYap("Mik", [k(0, 60, { yol: "mik.wav", bag: [] })]), izYap("Sistem", [k(0, 60, { yol: "sis.wav", bag: [] })], { muted: true }),
    izYap("BGM", [k(0, 60, { yol: "bgm.mp3", bag: [] })]), izYap("Audio 4", [k(70, 80, { bag: [] })])] };
var o2 = S.korumaOner(duz2, { start: 0, end: 60, mod: "gap" });
ok("korumaOner dinle (bağsız): susturulmuş ve müzik adlı katman hariç, aralık dışı klip sayılmaz", js(o2.dinle) === js([0]) && js(o2.koru.audio) === js([2]), js(o2));
var duz3 = { video: [], audio: [izYap("Müzik", [k(0, 60)]), izYap("Audio 2", [k(0, 60)], { muted: true })] };
var o3 = S.korumaOner(duz3, { start: 0, end: 60, dinleGerekli: true });
ok("korumaOner: hepsi susturulmuşsa susturulmuşlar dinlenir; aday hiç yoksa 'dinle-yok' uyarısı",
  js(o3.dinle) === js([1]) && js(S.korumaOner({ video: [], audio: [izYap("Müzik", [k(0, 60)])] }, { start: 0, end: 60, dinleGerekli: true }).uyarilar) === js([{ kod: "dinle-yok" }]));

// uyarılar: korunan video + ripple
var oV = S.korumaOner(duzen, { start: 0, end: 60, mod: "ripple", koru: { video: [1], audio: [1] } });
ok("uyarı: korunan V2 ripple'da kaymaz → video-ripple", oV.uyarilar.some(function (u) { return u.kod === "video-ripple" && js(u.izler) === js([1]); }), js(oV.uyarilar));
ok("uyarı: gap / select modunda video-ripple yok",
  !S.korumaOner(duzen, { start: 0, end: 60, mod: "gap", koru: { video: [1], audio: [] } }).uyarilar.length &&
  !S.korumaOner(duzen, { start: 0, end: 60, mod: "select", koru: { video: [1], audio: [] } }).uyarilar.length);
ok("uyarı: korunan video katmanı ilk kesimden önce bitiyorsa kaymaz → uyarı yok",
  !S.korumaOner(duzen, { start: 0, end: 60, mod: "ripple", koru: { video: [1], audio: [] }, kesimler: [{ start: 52, end: 53 }] }).uyarilar.length);
ok("uyarı: kilitli video katmanı korunsa da uyarmaz (zaten kesilmez)",
  !S.korumaOner({ video: [izYap("V", [k(0, 60)], { locked: true })], audio: [] }, { start: 0, end: 60, mod: "ripple", koru: { video: [0], audio: [] } }).uyarilar.length);

// uyarılar: bağlı çift ayrılıyor
var oB = S.korumaOner(duzen, { start: 0, end: 60, mod: "ripple", koru: { video: [], audio: [0] }, kesimler: [{ start: 40, end: 41 }] });
var uB = oB.uyarilar.filter(function (u) { return u.kod === "bagli"; })[0];
ok("uyarı: A1 korunurken bağlı görüntüsü kesiliyor → yalnız kesilen çift listelenir (30–60)",
  uB && uB.toplam === 1 && uB.ciftler[0].audio === 0 && uB.ciftler[0].video === 0 && uB.ciftler[0].start === 30 && uB.ciftler[0].ad === "Kamera 2" && uB.ciftler[0].koruTaraf === "audio", js(oB.uyarilar));
var oB2 = S.korumaOner(duzen, { start: 0, end: 60, mod: "ripple", koru: { video: [], audio: [0] } });
ok("uyarı: kesimler yokken aralıktaki her bağlı çift (2)", oB2.uyarilar.filter(function (u) { return u.kod === "bagli"; })[0].toplam === 2);
var oB3 = S.korumaOner(duzen, { start: 0, end: 60, mod: "gap", koru: { video: [0], audio: [] }, kesimler: [{ start: 10, end: 11 }] });
ok("uyarı: video korunurken bağlı ses kesiliyor (ters yön, koruTaraf video)",
  oB3.uyarilar.some(function (u) { return u.kod === "bagli" && u.ciftler[0].koruTaraf === "video" && u.ciftler[0].start === 0; }), js(oB3.uyarilar));
ok("uyarı: iki taraf da korunuyorsa ayrılma yok", !S.korumaOner(duzen, { start: 0, end: 60, mod: "gap", koru: { video: [0], audio: [0] } }).uyarilar.length);
// bag listesi yok (eski Premiere): aynı medya + hiza sezgisi; farklı hiza eşleşmez
var bagsiz = { video: [izYap("V", [k(0, 30, { yol: "C:\\A.mp4", hiza: 5 })])], audio: [izYap("A", [k(0, 30, { yol: "c:\\a.MP4", hiza: 5 }), k(30, 40, { yol: "c:\\a.mp4", hiza: 9 })])] };
var cf = S.bagliCiftler(bagsiz);
ok("bagliCiftler sezgi: aynı medya (büyük/küçük harf duyarsız) + aynı hiza eşleşir, farklı hiza eşleşmez", cf.length === 1 && cf[0].a.s === 0, js(cf.map(function (c) { return [c.audio, c.video, c.a.s]; })));
ok("bagliCiftler: bag listesi varsa sezgi kullanılmaz (boş bag = bağsız)", S.bagliCiftler({ video: bagsiz.video, audio: [izYap("A", [k(0, 30, { yol: "c:\\a.mp4", hiza: 5, bag: [] })])] }).length === 0);
ok("korumaOner: ciftler parametresi (önbellek) aynı sonucu verir",
  js(S.korumaOner(duzen, { start: 0, end: 60, mod: "ripple", koru: { video: [], audio: [0] }, ciftler: S.bagliCiftler(duzen) })) === js(oB2));

ok("korumaYuku: yalnız korunan katman varsa { video, audio }, yoksa null (protect gönderilmez)",
  S.korumaYuku({ video: [], audio: [] }) === null && S.korumaYuku(null) === null && js(S.korumaYuku({ video: [2], audio: [1, 0] })) === js({ video: [2], audio: [0, 1] }));
ok("korumaOner: düzen yoksa boş öneri, hata yok", js(S.korumaOner(null, {}).dinle) === "[]" && S.korumaOner(null, {}).uyarilar.length === 0);

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
