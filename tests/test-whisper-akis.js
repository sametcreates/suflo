// Suflo testi: js/whisper-akis.js canlı transkripsiyon akışı (3.2 adım 3)
//  - whisper-cli stdout satırları: parça sınırında bölünen satır, bir parçada birden çok satır, CRLF,
//    ofset ve hız eşlemesi, 1 saat ve üstü zaman damgası, Türkçe UTF-8 metin, atlanan ses etiketleri
//  - ilerleme yumuşatma: monoton, sonraki beklenen bildirimi geçmez, ilk bildirimden önce %5'e yaklaşır
//  - kalan süre ve gerçek zaman çarpanı, durum satırı metni
var path = require("path");
var A = require(path.join(__dirname, "..", "js", "whisper-akis.js"));

var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function yakin(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }
function js(x) { return JSON.stringify(x); }

/* ---------- satır ayrıştırıcı ---------- */

var p = A.satirAyristirici({ offset: 0 });
var r1 = p.besle("[00:00:00.000 --> 00:00:02.500]   Merhaba dün");
ok("yarım satır tamponda bekler (satır sonu yok)", r1.length === 0, js(r1));
var r2 = p.besle("ya\n[00:00:02.500 --> 00:00:04.");
ok("parça sınırında bölünen satır birleşir", r2.length === 1 && r2[0].text === "Merhaba dünya" && r2[0].start === 0 && r2[0].end === 2.5, js(r2));
var r3 = p.besle("000]   İkinci satır\n");
ok("zaman damgası ortasından bölünen satır da birleşir", r3.length === 1 && r3[0].start === 2.5 && r3[0].end === 4 && r3[0].text === "İkinci satır", js(r3));

var p2 = A.satirAyristirici();
var cok = p2.besle("[00:00:05.000 --> 00:00:06.000]  bir\n[00:00:06.000 --> 00:00:07.250]  iki\n[00:00:07.250 --> 00:00:09.000]  üç\n");
ok("bir parçada birden çok satır", cok.length === 3 && cok[0].text === "bir" && cok[1].text === "iki" && cok[2].text === "üç" && cok[2].end === 9, js(cok));

var p3 = A.satirAyristirici();
var crlf = p3.besle("[00:00:01.000 --> 00:00:02.000]  Windows satırı\r\n[00:00:02.000 --> 00:00:03.000]  ikinci\r");
var crlf2 = p3.besle("\n[00:00:03.000 --> 00:00:04.000]  üçüncü\r\n");
ok("CRLF: metinde \\r kalmaz, bölünmüş \\r\\n boş satır gibi geçer",
  crlf.length === 2 && crlf[0].text === "Windows satırı" && crlf[1].text === "ikinci" &&
  crlf2.length === 1 && crlf2[0].text === "üçüncü" && !/\r/.test(js(crlf.concat(crlf2))), js(crlf.concat(crlf2)));

var p4 = A.satirAyristirici({ offset: 12.5 });
var of = p4.besle("[00:00:01.000 --> 00:00:02.000]  ofsetli\n");
ok("ofset eklenir (sekans/kapsam başı)", of.length === 1 && of[0].start === 13.5 && of[0].end === 14.5, js(of));

// seçili klip: nihai JSON'la aynı eşleme (WW.zamanEsle: offset + t * carpan)
var WW = require(path.join(__dirname, "..", "js", "whisper-words.js"));
var p5 = A.satirAyristirici({ offset: 30, carpan: 1 / 1.5 });
var hz = p5.besle("[00:00:03.000 --> 00:00:06.000]  hızlı klip\n");
var nihai = WW.zamanEsle([{ start: 3, end: 6, text: "hızlı klip" }], 30, 1 / 1.5);
ok("klip kapsamı: ofset + hız eşlemesi nihai JSON eşlemesiyle aynı", hz.length === 1 && yakin(hz[0].start, nihai[0].start, 0.001) && yakin(hz[0].end, nihai[0].end, 0.001), js(hz) + " ~ " + js(nihai));

var p6 = A.satirAyristirici();
var saat = p6.besle("[01:02:03.456 --> 01:02:05.000]  bir saatten sonra\n[123:00:00.000 --> 123:00:01.000]  çok uzun\n");
ok("1 saat ve üstü damgalar (saat alanı 2 haneyi aşabilir)", saat.length === 2 && yakin(saat[0].start, 3723.456) && saat[0].end === 3725 &&
  saat[1].start === 123 * 3600, js(saat));

var p7 = A.satirAyristirici();
var tr = Buffer.from("[00:00:00.000 --> 00:00:01.000]  Şişli'de ığdır, çöğüş — ÇAĞRI\n", "utf8").toString("utf8");
var trs = p7.besle(tr);
ok("Türkçe UTF-8 metin bozulmadan", trs.length === 1 && trs[0].text === "Şişli'de ığdır, çöğüş — ÇAĞRI", js(trs));

var p8 = A.satirAyristirici();
var et = p8.besle("[00:00:00.000 --> 00:00:03.000]  [Müzik]\n[00:00:03.000 --> 00:00:04.000]   [BLANK_AUDIO]\n" +
  "[00:00:04.000 --> 00:00:05.000]  ♪ ♪\n[00:00:05.000 --> 00:00:06.000]  (alkış)\n[00:00:06.000 --> 00:00:08.000]  Merhaba [müzik] arkadaşlar\n" +
  "[00:00:08.000 --> 00:00:09.000]  *kelime* vurgusu\n[00:00:09.000 --> 00:00:09.500]   \n");
ok("yalnız ses etiketi satırları atlanır (CT.gurultuMu); konuşmalı satır ve *vurgu* kalır, boş metin atlanır",
  et.length === 2 && et[0].text === "Merhaba [müzik] arkadaşlar" && et[1].text === "*kelime* vurgusu", js(et));

var p9 = A.satirAyristirici({ atla: function () { return false; } });
ok("atla seçeneği: etiket denetimi devre dışı bırakılabilir", p9.besle("[00:00:00.000 --> 00:00:01.000]  [Müzik]\n").length === 1);

var p10 = A.satirAyristirici();
var gurultu = p10.besle("whisper_init_from_file: loading model\nmain: processing 'a.wav' (160000 samples)\n\n" +
  "\x1b[38;5;196m[00:00:00.000 --> 00:00:01.000]  renkli\x1b[0m\n[00:00:01.000 -> 00:00:02.000] bozuk ok\n");
ok("damga dışı satırlar yok sayılır, ANSI renk kodu temizlenir", gurultu.length === 1 && gurultu[0].text === "renkli", js(gurultu));

var p11 = A.satirAyristirici();
p11.besle("[00:00:00.000 --> 00:00:01.000]  son satır satır sonu olmadan");
var bit = p11.bitir();
ok("bitir(): tampondaki son satır da gelir, ikinci bitir boş", bit.length === 1 && bit[0].text === "son satır satır sonu olmadan" && p11.bitir().length === 0, js(bit));

var p12 = A.satirAyristirici();
var tek = [], kaynak = "[00:00:10.120 --> 00:00:12.000]  harf harf gelen satır\n[00:00:12.000 --> 00:00:13.000]  ikinci\n";
for (var ci = 0; ci < kaynak.length; ci++) tek = tek.concat(p12.besle(kaynak[ci]));
ok("karakter karakter beslemede aynı sonuç", tek.length === 2 && tek[0].start === 10.12 && tek[1].text === "ikinci", js(tek));

ok("virgüllü milisaniye ve kısa kesir (\".5\" = 500 ms)", A.satirCoz("[00:00:01,5 --> 00:00:02,25] x").start === 1.5 && A.satirCoz("[00:00:01,5 --> 00:00:02,25] x").end === 2.25);
ok("null/undefined besleme hata vermez", A.satirAyristirici().besle(null).length === 0 && A.satirAyristirici().besle(undefined).length === 0);

/* ---------- ilerleme yumuşatma ---------- */

// 10 dakikalık ses (600 sn): pencere = 30/600 = %5; sonraki bildirim en erken +%5
var y = A.ilerlemeYumusat({ toplamSn: 600, basMs: 0 });
var once = [0, 1000, 5000, 15000, 40000, 120000].map(function (t) { return y.tahmin(t); });
ok("ilk bildirimden önce: %5'e doğru yaklaşır, ulaşmaz; kalan süre ve hız yok",
  once.every(function (x, i) { return x.pct < 5 && x.kalanSn === null && x.hiz === null && (i === 0 || x.pct >= once[i - 1].pct); }) && once[once.length - 1].pct === 4,
  js(once.map(function (x) { return x.pct; })));

var y2 = A.ilerlemeYumusat({ toplamSn: 600, basMs: 0 });
y2.tahmin(500);
y2.kontrol(5, 10000);                    // 10 sn'de %5
y2.kontrol(10, 20000);                   // 20 sn'de %10 → %0,5 / sn
var a = y2.tahmin(24000);                // 4 sn sonra: 10 + 2 = 12
ok("bildirimler arası gözlenen hızla ileri tahmin", a.pct === 12, js(a));
var b = y2.tahmin(60000);                // çok sonra: sonraki beklenen bildirim (10 + 5 = 15) geçilmez
ok("sonraki beklenen bildirimi geçmez (bildirim gecikse de)", b.pct === 15, js(b));
var c = y2.tahmin(30000);                // saat geri gitse bile yüzde düşmez
ok("monoton: yüzde geri gitmez", c.pct === 15, js(c));
y2.kontrol(15, 30000);
y2.kontrol(12, 31000);                   // geri giden bildirim yok sayılır
var d = y2.tahmin(32000);
ok("geri giden bildirim yok sayılır", d.pct >= 15 && d.pct <= 20, js(d));

// kalan süre ve gerçek zaman çarpanı: %0,5 / sn → kalan (100 - 15) / 0,5 = 170 sn; 600 sn ses %0,5/sn → 3 sn ses / sn
var y3 = A.ilerlemeYumusat({ toplamSn: 600, basMs: 0 });
y3.kontrol(5, 10000);
y3.kontrol(15, 30000);
var e = y3.tahmin(30000);
ok("kalan süre (ETA) gözlenen hızdan", e.pct === 15 && yakin(e.kalanSn, 170, 0.01), js(e));
ok("gerçek zaman çarpanı = sesin saniyesi / duvar saati saniyesi", yakin(e.hiz, 3, 1e-9), js(e));

// tek bildirim: hız başlangıçtan ölçülür
var y4 = A.ilerlemeYumusat({ toplamSn: 120, basMs: 1000 });
y4.kontrol(25, 11000);                   // 10 sn'de %25 (2 dakikalık ses: pencere %25)
var f = y4.tahmin(13000);
ok("tek bildirimde hız başlangıçtan; pencere büyükse sonraki bildirim pencere kadar ileride", f.pct === 30 && yakin(f.hiz, 3, 1e-9) && f.kalanSn > 0, js(f));
var g = y4.tahmin(60000);
ok("kısa seste tavan bir pencere (%25 + %25 = %50)", g.pct === 50, js(g));

// %100 bildiriminden sonra 100, kalan 0
var y5 = A.ilerlemeYumusat({ toplamSn: 60, basMs: 0 });
y5.kontrol(50, 5000);
y5.kontrol(100, 10000);
var h = y5.tahmin(11000);
ok("%100 bildirimi: yüzde 100, kalan 0", h.pct === 100 && h.kalanSn === 0, js(h));

// tavan en çok %99 (bildirim %100 gelmeden tamamlandı denmez)
var y6 = A.ilerlemeYumusat({ toplamSn: 20, basMs: 0 });
y6.kontrol(95, 5000);
ok("bildirim gelmeden %100 gösterilmez", y6.tahmin(999999).pct === 99);

// basMs verilmezse ilk çağrının anı başlangıçtır
var y7 = A.ilerlemeYumusat({ toplamSn: 300 });
var i0 = y7.tahmin(50000);
ok("basMs yokken ilk çağrı başlangıç sayılır", i0.pct === 0, js(i0));

// toplam süre bilinmiyorsa: yine monoton, %5 adımla tavan; gerçek zaman çarpanı yok
var y8 = A.ilerlemeYumusat({ basMs: 0 });
y8.kontrol(5, 10000);
var k = y8.tahmin(100000);
ok("toplam süre yoksa çarpan yok, tavan %5 adım", k.pct === 10 && k.hiz === null && k.kalanSn !== null, js(k));

// rastgele dizide monotonluk ve tavan değişmezi
var y9 = A.ilerlemeYumusat({ toplamSn: 1800, basMs: 0 });
var sonPct = 0, sonNokta = 0, ihlal = [];
for (var t = 0; t <= 600000; t += 700) {
  if (t > 0 && t % 21000 === 0) { sonNokta = Math.min(100, sonNokta + 5); y9.kontrol(sonNokta, t); }
  var z = y9.tahmin(t);
  var tavan = Math.min(99, sonNokta + 5);
  if (z.pct < sonPct) ihlal.push("geri " + t);
  if (z.pct > Math.max(tavan, sonNokta)) ihlal.push("tavan " + t + ":" + z.pct + ">" + tavan);
  sonPct = z.pct;
}
ok("uzun koşu: hiçbir anda geri gitmez, beklenen bildirimi geçmez", ihlal.length === 0, ihlal.slice(0, 5).join(" | "));

/* ---------- durum satırı ---------- */

ok("süre metni", A.sureMetni(45) === "45 sn" && A.sureMetni(7) === "7 sn" && A.sureMetni(80) === "1 dk 20 sn" && A.sureMetni(120) === "2 dk" &&
  A.sureMetni(119) === "2 dk" && A.sureMetni(727) === "12 dk" && A.sureMetni(0.2) === "1 sn" && A.sureMetni(-1) === "",
  [A.sureMetni(45), A.sureMetni(80), A.sureMetni(119), A.sureMetni(727)].join(" | "));
ok("çarpan metni Türkçe ondalık", A.carpanMetni(3.14) === "3,1" && A.carpanMetni(0.84) === "0,8" && A.carpanMetni(12.6) === "13" && A.carpanMetni(null) === "");
var ds = A.durumMetni({ satir: 12, pct: 34, kalanSn: 80, hiz: 3.1 });
ok("durum satırı: '12 satır · %34 · ~1 dk 20 sn kaldı · 3,1× gerçek zaman'", ds === "12 satır · %34 · ~1 dk 20 sn kaldı · 3,1× gerçek zaman", ds);
var ds2 = A.durumMetni({ satir: 0, pct: 3, kalanSn: null, hiz: null });
ok("satır ve hız yokken: 'Transkribe ediliyor… · %3'", ds2 === "Transkribe ediliyor… · %3", ds2);
var ds3 = A.durumMetni({ satir: 4, pct: 60, kalanSn: 20, hiz: 1.5, etiket: "kalan kısım" });
ok("etiketli tur (kalan kısım) sona eklenir", ds3 === "4 satır · %60 · ~20 sn kaldı · 1,5× gerçek zaman · kalan kısım", ds3);

/* ---------- İngilizce arayüz: durum satırının her parçası çevrilir ---------- */

var EN = require(path.join(__dirname, "..", "i18n", "en.js"));
var I = require(path.join(__dirname, "..", "js", "i18n.js"));
I.setDictionary(EN);
var en = I.translate(ds);
ok("EN: '12 lines · 34% · ~1 min 20 s left · 3.1× real time'", en === "12 lines · 34% · ~1 min 20 s left · 3.1× real time", en);
var en4 = I.translate(A.durumMetni({ satir: 12, pct: 34 }));
ok("EN: kalan süre yokken '12 lines · 34%'", en4 === "12 lines · 34%", en4);
var en5 = I.translate("Klip 2/3 (x): " + A.durumMetni({ satir: 8, pct: 40, kalanSn: 95, hiz: 2.4 }));
ok("EN: toplu klip öneki ile 'Clip 2/3 (x): 8 lines · 40% · ~1 min 40 s left · 2.4× real time'", en5 === "Clip 2/3 (x): 8 lines · 40% · ~1 min 40 s left · 2.4× real time", en5);
var en2 = I.translate(ds2);
ok("EN: 'Transcribing… · 3%'", en2 === "Transcribing… · 3%", en2);
var en3 = I.translate(ds3);
ok("EN: kalan kısım → remaining part, 1 satır → 1 line", en3 === "4 lines · 60% · ~20 s left · 1.5× real time · remaining part" &&
  I.translate(A.durumMetni({ satir: 1, pct: 99, kalanSn: 600, hiz: 12 })) === "1 line · 99% · ~10 min left · 12× real time", en3 + " | " + I.translate(A.durumMetni({ satir: 1, pct: 99, kalanSn: 600, hiz: 12 })));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
