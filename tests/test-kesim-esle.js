// Suflo testi: kesimden sonra altyazıyı yeni kurguya uyarla (3.4 adım 8) — saf modül js/kesim-esle.js
//  - ripple / gap / select (select hiçbir şey yapmaz), rippleFallback → gap
//  - ortası kesimde kalan kelime DÜŞER (kesime kırpılıp sıfır süreli cue olmaz); kesime taşan kelimenin ucu çekilir
//  - kesimi kapsayan cue kalan kelimelerinden (metin + zaman) yeniden kurulur; *vurgu* ve 2 satır korunur
//  - kelimesiz cue: uçları eşlenir; tamamen kesimde / 0,2 sn'nin altına inen düşer
//  - kare oturtma (razor gibi aşağı), sırasız ve üst üste kesimler, idempotentlik (imza, gap, kareyeOturt)
//  - host'un ölçtüğü kayma (sekansta klipsiz boşluk kesimi), kesim kayıtları arasında yol (kopya dalı, art arda kesim)
var path = require("path"), fs = require("fs");
var E = require(path.join(__dirname, "..", "js", "kesim-esle.js"));
var CT = require(path.join(__dirname, "..", "js", "caption-text.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 400) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function yakin(a, b) { return Math.abs(a - b) < 1e-6; }

/* ---------- kesimler ---------- */
var K = [{ start: 10, end: 12 }, { start: 30, end: 31.5 }];
ok("kesimleriDuzenle: sıralı, geçersiz atılır",
  js(E.kesimleriDuzenle([{ start: 30, end: 31.5 }, null, { start: 5, end: 5 }, { start: "x", end: 3 }, { start: 10, end: 12 }, { start: 8, end: 7 }])) === js(K));
var ust = E.kesimleriDuzenle([{ start: 11, end: 13 }, { start: 10, end: 12 }, { start: 13, end: 14 }, { start: 30, end: 31 }]);
ok("kesimleriDuzenle: üst üste ve bitişik kesimler birleşir", js(ust) === js([{ start: 10, end: 14 }, { start: 30, end: 31 }]), js(ust));
ok("kesimleriDuzenle: idempotent", js(E.kesimleriDuzenle(ust)) === js(ust));
var ky = E.kesimleriDuzenle([{ start: 20, end: 22, kayma: 0.5 }, { start: 21, end: 23 }]);
ok("kesimleriDuzenle: host kayması birleşince toplanır, birleşik uzunluğu aşmaz", js(ky) === js([{ start: 20, end: 23, kayma: 1.5 }]), js(ky));
ok("kesimleriDuzenle: kayma aralıktan uzunsa aralığa kırpılır, negatif 0", js(E.kesimleriDuzenle([{ start: 1, end: 2, kayma: 5 }, { start: 3, end: 4, kayma: -1 }])) ===
  js([{ start: 1, end: 2, kayma: 1 }, { start: 3, end: 4, kayma: 0 }]));

/* ---------- kare ---------- */
var kare = E.kareyeOturt([{ start: 10.017, end: 12.39 }, { start: 20.04, end: 20.07 }, { start: 30.04, end: 31.5 }], 0.04);
ok("kareyeOturt: kenarlar kareye aşağı (razor gibi), ızgaradaki kenar yerinde, kareden kısa kesim düşer",
  kare.length === 2 && yakin(kare[0].start, 10) && yakin(kare[0].end, 12.36) && yakin(kare[1].start, 30.04) && yakin(kare[1].end, 31.48), js(kare));
ok("kareyeOturt: idempotent", js(E.kareyeOturt(kare, 0.04)) === js(kare));
var ntsc = 1001 / 30000;
var kn = E.kareyeOturt([{ start: 100 * ntsc, end: 160 * ntsc }], ntsc);
ok("kareyeOturt: 29,97'de tam kare kenarı kaymaz (kayan nokta)", yakin(kn[0].start, 100 * ntsc) && yakin(kn[0].end, 160 * ntsc), js(kn));
ok("kareyeOturt: kare yoksa yalnız düzenler", js(E.kareyeOturt([{ start: 3, end: 4 }, { start: 1, end: 2 }])) === js([{ start: 1, end: 2 }, { start: 3, end: 4 }]));

/* ---------- zamanEsle ---------- */
ok("zamanEsle ripple: önceki kesimlerin toplamı düşülür, kesimin içi kesimin başına",
  E.zamanEsle(5, K, "ripple") === 5 && E.zamanEsle(10, K, "ripple") === 10 && E.zamanEsle(11, K, "ripple") === 10 && E.zamanEsle(12, K, "ripple") === 10 &&
  E.zamanEsle(20, K, "ripple") === 18 && E.zamanEsle(31, K, "ripple") === 28 && E.zamanEsle(40, K, "ripple") === 36.5);
ok("zamanEsle gap ve select: zaman değişmez", E.zamanEsle(20, K, "gap") === 20 && E.zamanEsle(11, K, "gap") === 11 && E.zamanEsle(40, K, "select") === 40);
ok("zamanEsle gap, kesimin içi taraf ile: başlangıç kesimin sonuna, bitiş başına",
  E.zamanEsle(11, K, "gap", "bas") === 12 && E.zamanEsle(11, K, "gap", "son") === 10);
ok("zamanEsle: sırasız ve üst üste kesimler düzenlenmişle aynı",
  E.zamanEsle(40, [{ start: 30, end: 31.5 }, { start: 10, end: 11.5 }, { start: 11, end: 12 }], "ripple") === 36.5);
// sekans kapsamında hiçbir katmanda klip olmayan boşluk (20,15–21,85) kesildi: host kaymayı 0 ölçtü, sonrası kaymaz
var KB = [{ start: 10, end: 12, kayma: 2 }, { start: 20.15, end: 21.85, kayma: 0 }, { start: 30, end: 31.5, kayma: 1.5 }];
ok("zamanEsle: host'un ölçtüğü kayma (klipsiz boşluk kesimi 0 kaydırır)", E.zamanEsle(25, KB, "ripple") === 23 && E.zamanEsle(40, KB, "ripple") === 36.5,
  E.zamanEsle(25, KB, "ripple"));

/* ---------- kelimeEsle ---------- */
function w(text, start, end, ek) { var o = { text: text, start: start, end: end }; if (ek) for (var k in ek) o[k] = ek[k]; return o; }
var kel = [w("Merhaba", 9, 9.5), w("ııı", 10.2, 11.6, { p: 0.4 }), w("arkadaşlar", 11.9, 12.6, { p: 0.9 }), w("bugün", 20, 20.4), w("şey", 30.1, 30.6), w("başlıyoruz.", 31.6, 32.4)];
var kopyaKel = js(kel);
var ke = E.kelimeEsle(kel, K, { mod: "ripple" });
ok("kelimeEsle ripple: ortası kesimde kalan kelime düşer, kalanlar kayar",
  js(ke.map(function (x) { return x.text; })) === js(["Merhaba", "arkadaşlar", "bugün", "başlıyoruz."]) &&
  ke[0].start === 9 && ke[2].start === 18 && yakin(ke[3].start, 28.1) && yakin(ke[3].end, 28.9), js(ke));
ok("kelimeEsle: kesime taşan kelimenin ucu kesimin (eşlenmiş) kenarına çekilir, sıfır süreli olmaz, p korunur",
  ke[1].start === 10 && yakin(ke[1].end, 10.6) && ke[1].end > ke[1].start && ke[1].p === 0.9, js(ke[1]));
ok("kelimeEsle: girdi değişmez", js(kel) === kopyaKel);
var kg = E.kelimeEsle(kel, K, { mod: "gap" });
ok("kelimeEsle gap: kelime düşer, zaman kaymaz; taşan başlangıç kesimin sonuna",
  js(kg.map(function (x) { return x.text; })) === js(["Merhaba", "arkadaşlar", "bugün", "başlıyoruz."]) && kg[1].start === 12 && kg[1].end === 12.6 && kg[2].start === 20, js(kg));
ok("kelimeEsle select: hiçbir şey silinmez (aynı kelimeler, kopya)", js(E.kelimeEsle(kel, K, { mod: "select" })) === kopyaKel && E.kelimeEsle(kel, K, { mod: "select" })[0] !== kel[0]);
ok("kelimeEsle: mod verilmezse ripple", js(E.kelimeEsle(kel, K)) === js(ke));
ok("kelimeEsle: zamanı olmayan / bozuk kelime atlanır", E.kelimeEsle([null, { text: "a" }, w("b", 1, 0.5)], K).length === 1);

/* ---------- satirEsle ---------- */
var cues = [
  { start: 9, end: 12.6, text: "Merhaba ııı arkadaşlar,", words: [w("Merhaba", 9, 9.5), w("ııı", 10.2, 11.6), w("arkadaşlar,", 11.9, 12.6)], confidence: 0.7 },
  { start: 20, end: 21, text: "*Bugün* güzel.", words: [w("Bugün", 20, 20.4), w("güzel.", 20.5, 21)] },
  { start: 30.1, end: 32.4, text: "Şey\nbaşlıyoruz.", words: [w("Şey", 30.1, 30.6), w("başlıyoruz.", 31.6, 32.4)] },
  { start: 30.2, end: 31.3, text: "[müzik]" },          // kelimesiz, tamamen kesimde
  { start: 40, end: 42, text: "Kapanış." }              // kelimesiz, dokunulmamış
];
var kopyaCue = js(cues);
var s = E.satirEsle(cues, K, { mod: "ripple" });
ok("satirEsle ripple: kesimi kapsayan cue kalan kelimelerinden kuruldu (metin ve zaman)",
  s.cues[0].text === "Merhaba arkadaşlar," && s.cues[0].start === 9 && yakin(s.cues[0].end, 10.6) &&
  js(s.cues[0].words.map(function (x) { return x.text; })) === js(["Merhaba", "arkadaşlar,"]), js(s.cues[0]));
ok("satirEsle ripple: dokunulmayan kelimeli cue yalnız kayar, metin aynı (*vurgu* dahil)",
  s.cues[1].text === "*Bugün* güzel." && s.cues[1].start === 18 && s.cues[1].end === 19 && s.cues[1].words[0].start === 18, js(s.cues[1]));
ok("satirEsle ripple: 2 satırlık cue kelime düşünce de satır kırılımını korur, tek kelime kalınca tek satır",
  s.cues[2].text === "başlıyoruz." && yakin(s.cues[2].start, 28.1) && yakin(s.cues[2].end, 28.9), js(s.cues[2]));
ok("satirEsle ripple: tamamen kesimde kalan kelimesiz cue düştü, dokunulmayan kelimesiz cue kaydı",
  s.cues.length === 4 && s.cues[3].text === "Kapanış." && s.cues[3].start === 36.5 && s.cues[3].end === 38.5, js(s.cues.map(function (c) { return c.text; })));
ok("satirEsle: dusen 1, kirpilan 2, imza", s.dusen === 1 && s.kirpilan === 2 && /^ripple:10\.000-12\.000,30\.000-31\.500$/.test(s.imza), js([s.dusen, s.kirpilan, s.imza]));
ok("satirEsle: girdi değişmez", js(cues) === kopyaCue);
ok("satirEsle: çakışan / sıfır süreli cue yok", s.cues.every(function (c, i) { return c.end > c.start && (!i || c.start >= s.cues[i - 1].end - 1e-9); }), js(s.cues.map(function (c) { return [c.start, c.end]; })));

var sg = E.satirEsle(cues, K, { mod: "gap" });
ok("satirEsle gap: zaman kaymaz, kesilen kelime düşer, kesimin iki yanı ayrı cue",
  sg.cues[0].text === "Merhaba" && sg.cues[0].start === 9 && sg.cues[0].end === 9.5 && sg.cues[1].text === "arkadaşlar," && sg.cues[1].start === 12 && sg.cues[1].end === 12.6 &&
  sg.cues[2].start === 20 && sg.cues[2].text === "*Bugün* güzel.", js(sg.cues.slice(0, 3)));
ok("satirEsle gap idempotent: ikinci kez aynı sonuç", js(E.satirEsle(sg.cues, K, { mod: "gap" }).cues) === js(sg.cues));
var ss = E.satirEsle(cues, K, { mod: "select" });
ok("satirEsle select: hiçbir şey yapmaz (aynı satırlar, sayaç 0)", js(ss.cues) === kopyaCue && ss.dusen === 0 && ss.kirpilan === 0 && ss.cues[0] !== cues[0]);
ok("satirEsle: kesim yoksa aynı satırlar", js(E.satirEsle(cues, [], { mod: "ripple" }).cues) === kopyaCue);

// idempotentlik: aynı kesim kümesi (imza) bir belgeye ikinci kez uygulanmaz
var s2 = E.satirEsle(s.cues, K, { mod: "ripple", uygulanan: [s.imza] });
ok("satirEsle idempotent: uygulanan imza ikinci kez kaydırmaz (tekrar)", s2.tekrar === true && js(s2.cues) === js(s.cues) && s2.dusen === 0);
var sirasiz = E.satirEsle(cues, [{ start: 30, end: 31 }, { start: 11, end: 12 }, { start: 10, end: 11.2 }, { start: 30.9, end: 31.5 }], { mod: "ripple" });
ok("satirEsle: sırasız ve üst üste kesimler düzenlenmiş kümeyle aynı sonuç ve imza", js(sirasiz.cues) === js(s.cues) && sirasiz.imza === s.imza);

// kare: razor 10,017 → 10,00 ve 12,39 → 12,36 keser; sonrası 2,36 sn kayar
var sk = E.satirEsle([{ start: 20, end: 21, text: "Bugün güzel.", words: [w("Bugün", 20, 20.4), w("güzel.", 20.5, 21)] }], [{ start: 10.017, end: 12.39 }], { mod: "ripple", kare: 0.04 });
ok("satirEsle kare: kesim kareye oturtulur (razor gibi), sonrası 2,36 sn kayar", yakin(sk.cues[0].start, 17.64) && yakin(sk.cues[0].words[1].end, 18.64) && /10\.000-12\.360/.test(sk.imza), js(sk));

// vurgu: kopan *aralık* yeniden kapanır; kullanıcının noktalaması korunur
var v = E.satirEsle([{ start: 0, end: 4, text: "Bu *çok ııı güzel* bir gün!", words: [w("Bu", 0, 0.3), w("çok", 0.4, 0.7), w("ııı", 0.8, 1.6), w("güzel", 1.7, 2.1), w("bir", 2.2, 2.4), w("gün!", 2.5, 3)] }],
  [{ start: 0.75, end: 1.65 }], { mod: "ripple" });
ok("satirEsle: *vurgu* aralığı kelime düşünce yeniden kapanır, noktalama korunur", v.cues[0].text === "Bu *çok güzel* bir gün!" && CT.emphasisMask(v.cues[0].text).filter(Boolean).length === 2, v.cues[0].text);
var v2 = E.satirEsle([{ start: 0, end: 2, text: "*Harika bir* gün.", words: [w("Harika", 0, 0.4), w("bir", 0.5, 0.8), w("gün.", 0.9, 1.4)] }], [{ start: 0.45, end: 0.85 }], { mod: "ripple" });
ok("satirEsle: vurgu aralığının sonu kesilince kalan kelime tek başına vurgulu", v2.cues[0].text === "*Harika* gün.", v2.cues[0].text);
var hizasiz = E.satirEsle([{ start: 0, end: 2, text: "elle değişen metin burada", words: [w("bir", 0, 0.4), w("iki", 0.5, 0.8), w("üç", 0.9, 1.4)] }], [{ start: 0.45, end: 0.85 }], { mod: "ripple" });
ok("satirEsle: metin kelimelerle hizalı değilse kalan kelimelerin metni", hizasiz.cues[0].text === "bir üç", hizasiz.cues[0].text);

// 2 satır × 42: kelime düşünce dengeli yeniden sarılır
var uzun = "Bugün size kameramı nasıl ayarladığımı ve ışığı anlatacağım arkadaşlar.";
var uzunK = uzun.split(" ").map(function (t, i) { return w(t, i * 0.5, i * 0.5 + 0.4); });
var CLm = require(path.join(__dirname, "..", "js", "caption-layout.js"));
var ikiSatir = CLm.dengeliSar(uzun, 42, 2);
var iki = E.satirEsle([{ start: 0, end: 6, text: ikiSatir, words: uzunK }], [{ start: 1.95, end: 2.45 }], { mod: "ripple", maxChars: 42 });
var satirlar = iki.cues[0].text.split("\n");
ok("satirEsle: 2 satırlık cue kelime düşünce dengeli yeniden sarılır (her satır ≤ 42)",
  ikiSatir.split("\n").length === 2 && satirlar.length === 2 && satirlar.every(function (x) { return x.length <= 42; }) && iki.cues[0].text.indexOf("ayarladığımı") === -1 &&
  iki.cues[0].text === CLm.dengeliSar("Bugün size kameramı nasıl ve ışığı anlatacağım arkadaşlar.", 42, 2), js(satirlar));

// kelimesiz cue: kesimle kısalan
var kz = E.satirEsle([
  { start: 9, end: 13, text: "Uzun satır" },        // 1 sn kaldı (9–10 ve 12–13)
  { start: 11.5, end: 12.1, text: "kıs" },          // 0,1 sn kaldı, yarısından azı: düşer
  { start: 29.9, end: 30.05, text: "ve" },          // 0,15 sn, kenarı 0,05 sn kesime değiyor: 0,1 sn kalır, düşer (plan: istisna yok)
  { start: 29.5, end: 30.5, text: "yarım" }         // 0,5 sn kaldı: kalır
], K, { mod: "ripple" });
ok("satirEsle kelimesiz: uçlar eşlenir; kesimle 0,2 sn'nin altına inen düşer (kesimden önce de kısa olan cue dahil)",
  js(kz.cues.map(function (c) { return [c.text, c.start, c.end]; })) === js([["Uzun satır", 9, 11], ["yarım", 27.5, 28]]) && kz.dusen === 2 && kz.kirpilan === 2,
  js(kz.cues.map(function (c) { return [c.text, c.start, c.end]; })) + " " + kz.dusen + "/" + kz.kirpilan);
var kzg = E.satirEsle([{ start: 11, end: 14, text: "baş kesimde" }, { start: 9, end: 11, text: "son kesimde" }], K, { mod: "gap" });
ok("satirEsle kelimesiz gap: kesimde başlayan cue kesimin sonundan, kesimde biten kesimin başında",
  kzg.cues[0].start === 12 && kzg.cues[0].end === 14 && kzg.cues[1].start === 9 && kzg.cues[1].end === 10, js(kzg.cues));

// çeviri: satır kelimesiz (çevrilmiş), özgün kelimeler origWords'te — "Orijinale dön" eski zamanı geri getirmesin
var cev = E.satirEsle([{ start: 9, end: 12.6, text: "Hello friends,", orig: "Merhaba ııı arkadaşlar,", origWords: [w("Merhaba", 9, 9.5), w("ııı", 10.2, 11.6), w("arkadaşlar,", 11.9, 12.6)] },
  { start: 10.2, end: 11.6, text: "uhm", orig: "ııı", origWords: [w("ııı", 10.2, 11.6)] }], K, { mod: "ripple" });
ok("satirEsle çeviri: origWords eşlenir, kelime düşünce özgün metin kurulur; özgün kelimesi tamamen kesilen satır düşer",
  cev.cues.length === 1 && cev.cues[0].text === "Hello friends," && cev.cues[0].orig === "Merhaba arkadaşlar," && cev.cues[0].origWords.length === 2 &&
  cev.cues[0].origWords[1].start === 10 && cev.cues[0].start === 9 && yakin(cev.cues[0].end, 10.6) && cev.dusen === 1, js(cev));

// sekans boşluğu: host kayması 0 olan kesim sonrası kaydırmaz
var bos = E.satirEsle([{ start: 25, end: 26, text: "Devam.", words: [w("Devam.", 25, 26)] }], KB, { mod: "ripple" });
ok("satirEsle: klipsiz boşluk kesimi (kayma 0) sonrası yalnız gerçek kayma kadar kayar", bos.cues[0].start === 23 && bos.cues[0].end === 24, js(bos.cues));

/* ---------- kelimelerdenSegment + satır kurucu ---------- */
var seg = E.kelimelerdenSegment([w("Merhaba", 0, 0.4), w("arkadaşlar.", 0.5, 1), w("Bugün", 1.2, 1.5), w("burada", 3, 3.4), w("", 4, 4.1), w("değiliz", 3.5, 3.9)]);
ok("kelimelerdenSegment: cümle sonu ve 1 sn'den uzun duraklamada yeni segment, boş kelime atılır, sıralanır",
  js(seg.map(function (x) { return x.text; })) === js(["Merhaba arkadaşlar.", "Bugün", "burada değiliz"]) && seg[2].words.length === 2 && seg[0].start === 0 && seg[0].end === 1, js(seg));
// inceleme r2 (lisans): gruplama Raunen'den uyarlanan, kaynağı belirtilmiş kelimeGrupla'nın kendisi; kesim-esle.js kopya taşımaz
var WWk = require(path.join(__dirname, "..", "js", "whisper-words.js"));
var uzunListe = [];
for (var ui = 0; ui < 65; ui++) uzunListe.push(w("k" + ui + (ui === 40 ? "." : ""), ui * 0.3, ui * 0.3 + 0.2));
uzunListe.push(w("son", 30, 30.4));
var esSrc = fs.readFileSync(path.join(__dirname, "..", "js", "kesim-esle.js"), "utf8");
var ksGovde = esSrc.slice(esSrc.indexOf("function kelimelerdenSegment("), esSrc.indexOf("\n  }\n", esSrc.indexOf("function kelimelerdenSegment(")));
ok("kelimelerdenSegment: gruplama SufloWhisperWords.kelimeGrupla (Raunen: splitByWords) ile birebir; kesim-esle.js'te kopya yok",
  js(E.kelimelerdenSegment(uzunListe)) === js(WWk.kelimeGrupla(uzunListe, 30, 1.0)) && E.kelimelerdenSegment(uzunListe).length === 4 &&
  /WW\.kelimeGrupla\(/.test(ksGovde) && !/function bosalt|CUMLE_SONU/.test(esSrc) && !/Raunen:/.test(esSrc),
  js(E.kelimelerdenSegment(uzunListe).map(function (s) { return s.words.length; })));
var kur = CT.segmentleriKur(seg, "l42", { minSure: 0.8, maxSure: 6 });
ok("kelimelerdenSegment → segmentleriKur (l42): satırlar ölçülmüş kelimelerden kurulur", kur.segments.length >= 2 && kur.segments.every(function (c) { return c.words && c.words.length; }), js(kur.segments.map(function (c) { return c.text; })));

/* ---------- uyarlamaPlani ---------- */
ok("uyarlamaPlani: başarısız ya da select (kes + seç) → null",
  E.uyarlamaPlani({ ok: false }, { removeMode: "ripple", kaynak: "S" }) === null && E.uyarlamaPlani({ ok: true }, { removeMode: "select", kaynak: "S", ranges: K }) === null);
var pr = E.uyarlamaPlani({ ok: true, newSeq: "Vlog — Suflo Temiz", rippleFallback: false,
  esleme: { kaynak: "S", seqId: "S-kopya", kare: 0.04, kesimler: [{ start: 10, end: 12, kayma: 2 }, { start: 20.15, end: 21.85, kayma: 0 }] } }, { removeMode: "ripple", kaynak: "X", ranges: K });
ok("uyarlamaPlani: host raporu (kaynak, kopya kimliği, kare, kayma) kullanılır",
  pr.kaynak === "S" && pr.hedef === "S-kopya" && pr.hedefAd === "Vlog — Suflo Temiz" && pr.mod === "ripple" && pr.kare === 0.04 && pr.cuts[1].kayma === 0 && pr.imza === E.imza(pr.cuts, "ripple", 0.04), js(pr));
var pg = E.uyarlamaPlani({ ok: true, newSeq: "", rippleFallback: true, esleme: { kaynak: "S", seqId: "S", kesimler: [{ start: 10, end: 12, kayma: 2 }] } }, { removeMode: "ripple" });
ok("uyarlamaPlani: rippleFallback → gap (kayma yok sayılır), Bu sekansta hedef = kaynak", pg.mod === "gap" && pg.hedef === "S" && pg.cuts[0].kayma === undefined, js(pg));
var pe = E.uyarlamaPlani({ ok: true, newSeq: "Kopya" }, { removeMode: "ripple", kaynak: "S", ranges: K, kare: 0.04 });
ok("uyarlamaPlani: host raporu yoksa gönderilen kesimler; kopyanın kimliği bilinmiyor (hedef boş), Bu sekansta kaynak",
  pe.hedef === "" && pe.hedefAd === "Kopya" && pe.cuts.length === 2 && pe.kare === 0.04 && E.uyarlamaPlani({ ok: true }, { removeMode: "gap", kaynak: "S", ranges: K }).hedef === "S", js(pe));
ok("uyarlamaPlani: kaynak bilinmiyorsa ya da kesim yoksa null",
  E.uyarlamaPlani({ ok: true }, { removeMode: "ripple", ranges: K }) === null && E.uyarlamaPlani({ ok: true }, { removeMode: "ripple", kaynak: "S", ranges: [] }) === null);

/* ---------- yolBul + zincirEsle ---------- */
var k1 = { sira: 1, kaynak: "S", hedef: "C1", mod: "ripple", cuts: [{ start: 10, end: 12 }] };      // S → kopya C1
var k2 = { sira: 2, kaynak: "C1", hedef: "C1", mod: "ripple", cuts: [{ start: 20, end: 21 }] };     // C1'de Bu sekansta
var k3 = { sira: 3, kaynak: "S", hedef: "S", mod: "gap", cuts: [{ start: 40, end: 41 }] };          // S'de Bu sekansta
var k4 = { sira: 4, kaynak: "C1", hedef: "C2", mod: "ripple", cuts: [{ start: 5, end: 6 }] };       // C1 → kopya C2
var kayitlar = [k4, k2, k1, k3];
function siralar(y) { return y ? y.map(function (k) { return k.sira; }) : null; }
ok("yolBul: S'nin belgesi kopya C1'e: kopya + C1'deki kesim", js(siralar(E.yolBul(kayitlar, { sekansId: "S", sira: 0 }, "C1"))) === "[1,2]");
ok("yolBul: S'nin belgesi C2'ye: kopya, C1'de kesim, kopya", js(siralar(E.yolBul(kayitlar, { sekansId: "S", sira: 0 }, "C2"))) === "[1,2,4]");
ok("yolBul: S'nin belgesi S'ye: yalnız S'nin kendi kesimi (kopyalar S'yi değiştirmez)", js(siralar(E.yolBul(kayitlar, { sekansId: "S", sira: 0 }, "S"))) === "[3]");
ok("yolBul: belge kesimden SONRA oluştuysa o kesim uygulanmaz (güncel: [])", js(siralar(E.yolBul(kayitlar, { sekansId: "S", sira: 3 }, "S"))) === "[]" &&
  js(siralar(E.yolBul(kayitlar, { sekansId: "C1", sira: 2 }, "C1"))) === "[]");
ok("yolBul: başka sekansın belgesi / yol yok → null", E.yolBul(kayitlar, { sekansId: "B", sira: 0 }, "C1") === null && E.yolBul(kayitlar, { sekansId: "C2", sira: 0 }, "C1") === null &&
  E.yolBul(kayitlar, { sekansId: "", sira: 0 }, "C1") === null);
var bel = [{ start: 4, end: 30, text: "a b c d", words: [w("a", 5.1, 5.6), w("b", 11, 11.5), w("c", 20.2, 20.6), w("d", 25, 26)] }];
var zin = E.zincirEsle(bel, E.yolBul(kayitlar, { sekansId: "S", sira: 0 }, "C2"));
var elle = E.satirEsle(E.satirEsle(E.satirEsle(bel, k1.cuts, { mod: "ripple" }).cues, k2.cuts, { mod: "ripple" }).cues, k4.cuts, { mod: "ripple" }).cues;
ok("zincirEsle: kesimler sırayla, her biri bir öncekinin kurgusunda (C1'in kesimi C1 zamanında)", js(zin.cues) === js(elle) && zin.cues[0].text === "c d" &&
  yakin(zin.cues[0].start, 17.2) && zin.cues[0].end === 26 && zin.cues[0].words[1].start === 21 && zin.dusen === 0 && zin.kirpilan === 2,
  js(zin));

/* ---------- inceleme: host kayması aralıktan kısa (sekansta klipsiz boşluk aralığa girdi) ---------- */
// V1/A1: klip1 11'de biter, klip2 13'te başlar; sessizlik [10, 14]; host yalnız [10, 11] ve [13, 14]'ü siler: kayma 2.
// Yeni kurguda [10, 12] boş, içerik 12'de (eski 14) yeniden başlar.
var KK = [{ start: 10, end: 14, kayma: 2 }];
ok("kayma < aralık: içerik eski 14'ten 12'de başlar; kesimde başlayan zaman (bas) oraya, biten (son) kesimin başına",
  E.zamanEsle(14, KK, "ripple") === 12 && E.zamanEsle(13.8, KK, "ripple", "bas") === 12 && E.zamanEsle(13.8, KK, "ripple") === 12 &&
  E.zamanEsle(10.3, KK, "ripple", "son") === 10 && E.zamanEsle(20, KK, "ripple") === 18,
  [E.zamanEsle(13.8, KK, "ripple", "bas"), E.zamanEsle(10.3, KK, "ripple", "son")].join(" "));
var kk1 = E.kelimeEsle([w("Merhaba", 13.8, 14.5), w("ve", 9.6, 10.3)], KK, { mod: "ripple" });
ok("kayma < aralık, kelime: ortası dışarıda kalan 'Merhaba' [13,8–14,5] → [12–12,5] (boşluğun üstüne gerilmez); kesimde biten kelime kesimin başında",
  kk1.length === 2 && kk1[0].start === 12 && kk1[0].end === 12.5 && kk1[1].start === 9.6 && kk1[1].end === 10, js(kk1));
var kk2 = E.satirEsle([
  { start: 13.6, end: 15, text: "Merhaba dünya", words: [w("Merhaba", 13.8, 14.5), w("dünya", 14.6, 15)] },
  { start: 13.6, end: 15, text: "Merhaba dünya" },
  { start: 10.5, end: 13.5, text: "boşlukta" }
], KK, { mod: "ripple" });
ok("kayma < aralık, satır: kelimeli ve kelimesiz cue 12'de başlar (2 sn erken değil); tamamen aralıkta kalan düşer",
  kk2.cues.length === 2 && kk2.cues[0].start === 12 && kk2.cues[0].end === 13 && kk2.cues[1].start === 12 && kk2.cues[1].end === 13 && kk2.dusen === 1,
  js(kk2.cues.map(function (c) { return [c.text, c.start, c.end]; })));
// kayma 0: aralık tamamen kliplerin arasındaki boşlukta, hiçbir şey silinmedi — içerik yerinde
var K0 = [{ start: 10, end: 14, kayma: 0 }];
var k0 = E.satirEsle([{ start: 12, end: 15, text: "x y" }, { start: 14, end: 16, text: "sonra", words: [w("sonra", 14.2, 15.6)] }, { start: 8, end: 9, text: "önce" }], K0, { mod: "ripple" });
ok("kayma 0: içerik kaymaz; aralıkta başlayan cue içeriğin başladığı yerden (14), aralıktan önce / sonra olan aynen",
  js(k0.cues.map(function (c) { return [c.start, c.end]; })) === js([[14, 15], [14, 16], [8, 9]]) && E.zamanEsle(14, K0, "ripple") === 14 && E.zamanEsle(11, K0, "ripple", "son") === 10,
  js(k0.cues.map(function (c) { return [c.start, c.end]; })));
ok("tam kayma (kayma = aralık): 'bas' ile 'son' aynı yere (eski davranış)", E.zamanEsle(11, [{ start: 10, end: 12, kayma: 2 }], "ripple", "bas") === 10 &&
  E.zamanEsle(11, [{ start: 10, end: 12, kayma: 2 }], "ripple", "son") === 10);

/* ---------- inceleme: kelime kelime (k1) ve birikimli (kc) belgeler ---------- */
var kcKel = [w("Merhaba", 0, 0.5), w("ııı", 0.6, 1.2), w("ben", 1.3, 1.6), w("Samet", 1.7, 2.1)];
var kcDoc = CT.karaokeCumulative(kcKel, 4);
var kcSonuc = E.satirEsle(kcDoc, [{ start: 0.55, end: 1.25 }], { mod: "ripple", kelimeModu: "kc" });
ok("kc: kesilen dolgunun cue'su düşer VE sonraki birikimli cue'lardan çıkar, zamanlar kayar",
  js(kcSonuc.cues.map(function (c) { return [c.text, c.start, c.end]; })) === js([["Merhaba", 0, 0.5], ["Merhaba ben", 0.6, 0.9], ["Merhaba ben Samet", 1, 1.4]]) &&
  kcSonuc.dusen === 1 && kcSonuc.kirpilan === 2, js(kcSonuc));
var kcGap = E.satirEsle(kcDoc, [{ start: 0.55, end: 1.25 }], { mod: "gap", kelimeModu: "kc" });
ok("kc gap: zaman kaymaz, kesilen kelime sonraki satırlardan da çıkar",
  js(kcGap.cues.map(function (c) { return [c.text, c.start]; })) === js([["Merhaba", 0], ["Merhaba ben", 1.3], ["Merhaba ben Samet", 1.7]]), js(kcGap.cues));
// birikimli satır sıfırlanınca (4 kelime) yeni satır baştan; elle değişen cue kendi satırını başlatır
var kcUzun = CT.karaokeCumulative([w("a", 0, 0.3), w("b", 0.4, 0.7), w("c", 0.8, 1.1), w("d", 1.2, 1.5), w("e", 1.6, 1.9), w("f", 2.0, 2.3)], 4);
var kcU = E.satirEsle(kcUzun, [{ start: 1.15, end: 1.55 }], { mod: "gap", kelimeModu: "kc" });
ok("kc: 4 kelimede sıfırlanan satırda düşen kelime yalnız kendi satırından çıkar", js(kcU.cues.map(function (c) { return c.text; })) === js(["a", "a b", "a b c", "e", "e f"]), js(kcU.cues));
var kcElle = E.satirEsle([{ start: 0, end: 0.5, text: "Merhaba" }, { start: 0.6, end: 1.2, text: "Merhaba ııı" }, { start: 1.3, end: 1.6, text: "Merhabalar ııı ben" }],
  [{ start: 0.55, end: 1.25 }], { mod: "gap", kelimeModu: "kc" });
ok("kc: metni elle değişen cue öncekini sürdürmüyorsa kendi satırı (birden çok kelime: kelimesiz kural, kesime değmiyor: aynen)",
  js(kcElle.cues.map(function (c) { return c.text; })) === js(["Merhaba", "Merhabalar ııı ben"]), js(kcElle.cues));
var vurgulu = E.satirEsle([{ start: 0, end: 0.5, text: "*Merhaba*" }, { start: 0.6, end: 1.2, text: "*Merhaba* ııı" }, { start: 1.3, end: 1.6, text: "*Merhaba* ııı ben" }],
  [{ start: 0.55, end: 1.25 }], { mod: "ripple", kelimeModu: "kc" });
ok("kc: *vurgu* korunur, düşen kelime vurgulu satırdan da çıkar", js(vurgulu.cues.map(function (c) { return c.text; })) === js(["*Merhaba*", "*Merhaba* ben"]), js(vurgulu.cues));
var k1s = E.satirEsle([{ start: 0.5, end: 0.9, text: "Merhaba" }, { start: 1.0, end: 1.6, text: "ııı" }, { start: 1.7, end: 2.0, text: "ben" }, { start: 2.1, end: 2.5, text: "uzun satır burada" }],
  [{ start: 1.25, end: 2.0 }], { mod: "ripple", kelimeModu: "k1" });
ok("k1: ORTASI kesimde kalan kelime cue'su düşer (0,25 sn'si kalsa da); kenarı kesime değen kalır, sonrası kayar",
  js(k1s.cues.map(function (c) { return [c.text, c.start, c.end]; })) === js([["Merhaba", 0.5, 0.9], ["uzun satır burada", 1.35, 1.75]]) && k1s.dusen === 2,
  js(k1s.cues.map(function (c) { return [c.text, c.start, c.end]; })));
var k1b = E.satirEsle([{ start: 0.9, end: 1.4, text: "evet" }], [{ start: 1.25, end: 2.0 }], { mod: "ripple", kelimeModu: "k1" });
ok("k1: ortası kesimden önce olan kelime kalır, ucu kesimin başına çekilir", k1b.cues.length === 1 && k1b.cues[0].start === 0.9 && k1b.cues[0].end === 1.25 && k1b.kirpilan === 1, js(k1b));
ok("kelimeModu yoksa kelimesiz cue eski kural (geriye uyum)", E.satirEsle([{ start: 1.0, end: 1.6, text: "ııı" }], [{ start: 1.25, end: 2.0 }], { mod: "ripple" }).cues.length === 1);
ok("zincirEsle kelimeModu'nu her kesime geçirir",
  js(E.zincirEsle(kcDoc, [{ mod: "ripple", cuts: [{ start: 0.55, end: 1.25 }] }], { kelimeModu: "kc" }).cues.map(function (c) { return c.text; })) === js(["Merhaba", "Merhaba ben", "Merhaba ben Samet"]));

/* ---------- inceleme: kelimesiz cue 0,2 sn kuralı (plan: "0,2 sn'den kısa ya da tamamen kesimde" düşer) ---------- */
var evet = E.satirEsle([{ start: 10, end: 10.36, text: "Evet" }], [{ start: 10.18, end: 11 }], { mod: "ripple" });
ok("0,36 sn'lik cue kesimle 0,18 sn'ye inince düşer (yarısı kalsa da)", evet.cues.length === 0 && evet.dusen === 1, js(evet));
ok("aynısı gap modunda da düşer", E.satirEsle([{ start: 10, end: 10.36, text: "Evet" }], [{ start: 10.18, end: 11 }], { mod: "gap" }).cues.length === 0);
var kisaKalan = E.satirEsle([{ start: 29.9, end: 30.05, text: "ve" }, { start: 29.95, end: 30.1, text: "şu" }], K, { mod: "ripple" });
// inceleme r2: plan istisnasız ("0,2 sn'den kısa ya da tamamen kesimde" düşer) — kesimden önce de kısa olan cue da
ok("zaten 0,2 sn'den kısa cue: kesime değip 0,2 sn'den az kalınca düşer (yarısından fazlası kalsa da)", kisaKalan.cues.length === 0 && kisaKalan.dusen === 2, js(kisaKalan));
var kisaEvet = E.satirEsle([{ start: 10, end: 10.18, text: "Evet" }], [{ start: 10.1, end: 10.15 }], { mod: "ripple" });
ok("0,18 sn'lik cue'nun ortasından 0,05 sn kesilince (0,13 sn kalır) düşer, kırpılan sayılmaz", kisaEvet.cues.length === 0 && kisaEvet.dusen === 1 && kisaEvet.kirpilan === 0, js(kisaEvet));
var kisaDegmez = E.satirEsle([{ start: 5, end: 5.15, text: "Ah" }], [{ start: 10.1, end: 10.15 }], { mod: "ripple" });
ok("kesime değmeyen kısa cue (0,15 sn) olduğu gibi kalır", kisaDegmez.cues.length === 1 && kisaDegmez.cues[0].start === 5 && kisaDegmez.cues[0].end === 5.15 && kisaDegmez.dusen === 0, js(kisaDegmez));
var tamEsik = E.satirEsle([{ start: 20, end: 20.5, text: "Tamam" }], [{ start: 20.2, end: 21 }], { mod: "ripple" });
ok("kesimden sonra tam 0,2 sn kalan cue kalır (sınır dahil)", tamEsik.cues.length === 1 && tamEsik.kirpilan === 1, js(tamEsik));

/* ---------- inceleme: kısmen uygulanan kesim (uyarlamaPlani) ---------- */
var pEks = E.uyarlamaPlani({ ok: true, removed: 2, selected: 2, rippleFallback: false, esleme: { kaynak: "S", seqId: "S", eksik: true,
  kesimler: [{ start: 2, end: 4, kesildi: false }] } }, { removeMode: "ripple" });
ok("uyarlamaPlani: silinemeyip seçilen parça (esleme.eksik / selected > 0) → plan eksik: true", pEks && pEks.eksik === true, js(pEks));
ok("uyarlamaPlani: selected > 0 yalnız da eksik; removed 0 ve seçilen yok → null (kurgu değişmedi)",
  E.uyarlamaPlani({ ok: true, removed: 3, selected: 1, esleme: { kaynak: "S", seqId: "S", kesimler: [{ start: 2, end: 4, kayma: 2 }] } }, { removeMode: "ripple" }).eksik === true &&
  E.uyarlamaPlani({ ok: true, removed: 0, selected: 0, esleme: { kaynak: "S", seqId: "S", kesimler: [{ start: 2, end: 4, kayma: 2 }] } }, { removeMode: "ripple" }) === null &&
  E.uyarlamaPlani({ ok: true, removed: 4, selected: 0, esleme: { kaynak: "S", seqId: "S", kesimler: [{ start: 2, end: 4, kayma: 2 }] } }, { removeMode: "ripple" }).eksik === undefined);
var pIz = E.uyarlamaPlani({ ok: true, removed: 4, selected: 0, esleme: { kaynak: "S", seqId: "S", izOnce: "6:a.b", izSonra: "8:c.d", kesimler: [{ start: 2, end: 4, kayma: 2 }] } }, { removeMode: "ripple" });
ok("uyarlamaPlani: host'un kurgu izleri plana geçer", pIz.izOnce === "6:a.b" && pIz.izSonra === "8:c.d", js(pIz));

/* ---------- inceleme: Premiere'de geri alma (yolUzlastir + izliYol) ---------- */
function kay(sira, kaynak, hedef, imz, once, sonra, ek) {
  var k = { sira: sira, kaynak: kaynak, hedef: hedef, mod: "ripple", cuts: [{ start: 2, end: 4 }], imza: imz };
  if (once) k.izOnce = once; if (sonra) k.izSonra = sonra;
  for (var x in ek || {}) k[x] = ek[x];
  return k;
}
function sl(y) { return y.map(function (k) { return k.sira; }); }
// 1) kesim (X→Y), Premiere'de geri alındı (X), aynı kesim yeniden (X→Y): iki kayıt, kesim bir kez
var u1 = E.yolUzlastir(E.yolBul([kay(1, "A", "A", "i", "X", "Y"), kay(2, "A", "A", "i", "X", "Y")], { sekansId: "A", sira: 0 }, "A"));
ok("geri alınıp yeniden uygulanan kesim bir kez (ikinci kayıt aynı durumdan başlıyor: ilki geri alınmış)",
  js(sl(u1.yol)) === "[2]" && !u1.kopuk && u1.basIz === "X" && u1.sonIz === "Y" && E.izliYol(u1, "A", "Y").durum === "tam", js(u1));
// 2) geri alındı, başka kesim uygulandı (X→W)
var u2 = E.yolUzlastir([kay(1, "A", "A", "i", "X", "Y"), kay(2, "A", "A", "j", "X", "W")]);
ok("geri alınıp başka kesim: yalnız ikincisi", js(sl(u2.yol)) === "[2]" && u2.sonIz === "W" && E.izliYol(u2, "A", "W").durum === "tam");
// 3) iki kesim, ikincisi geri alındı, üçüncü kesim ikinciden önceki durumdan
var u3 = E.yolUzlastir([kay(1, "A", "A", "i", "X", "Y"), kay(2, "A", "A", "j", "Y", "Z"), kay(3, "A", "A", "k", "Y", "W")]);
ok("ortadaki kesim geri alınmış: 1 ve 3", js(sl(u3.yol)) === "[1,3]" && !u3.kopuk);
// 4) yalnız geri alma: bugünkü kurgu kesimden önceki
var u4 = E.yolUzlastir([kay(1, "A", "A", "i", "X", "Y"), kay(2, "A", "A", "j", "Y", "Z")]);
ok("izliYol: hepsi geri alındı → guncel (boş yol); sondaki geri alındı → önek; elle değişti → degisti",
  E.izliYol(u4, "A", "X").durum === "guncel" && E.izliYol(u4, "A", "X").yol.length === 0 &&
  E.izliYol(u4, "A", "Y").durum === "onek" && js(sl(E.izliYol(u4, "A", "Y").yol)) === "[1]" &&
  E.izliYol(u4, "A", "Q").durum === "degisti" && E.izliYol(u4, "A", "Z").durum === "tam" && E.izliYol(u4, "A", "").durum === "bilinmiyor");
// 5) kesimler arasında başka düzenleme: zincir kopuk (uyarı)
var u5 = E.yolUzlastir([kay(1, "A", "A", "i", "X", "Y"), kay(2, "A", "A", "j", "Y2", "Z")]);
ok("kesimler arasında elle düzenleme: kopuk, ikisi de yolda, izliYol degisti", u5.kopuk && js(sl(u5.yol)) === "[1,2]" && E.izliYol(u5, "A", "Z").durum === "degisti");
// 6) kopya dalı: kaynak durumları ve kopya durumları ayrı
var u6 = E.yolUzlastir(E.yolBul([kay(1, "A", "B", "i", "X", "B1"), kay(2, "B", "B", "j", "B1", "B2")], { sekansId: "A", sira: 0 }, "B"));
ok("kopya dalı: zincir sağlam, kopyada sondaki geri alınınca önek", js(sl(u6.yol)) === "[1,2]" && !u6.kopuk && E.izliYol(u6, "B", "B1").durum === "onek" &&
  js(sl(E.izliYol(u6, "B", "B1").yol)) === "[1]" && E.izliYol(u6, "B", "X").durum === "degisti");
// 7) iz yoksa (doğrudan API): aynı imzalı tekrar bir kez, imza farklıysa ikisi
ok("iz yok: aynı sekansta aynı kesim (imza) tekrarı bir kez", js(sl(E.yolUzlastir([kay(1, "A", "A", "i"), kay(2, "A", "A", "i"), kay(3, "A", "A", "j")]).yol)) === "[1,3]");
// 8) atılmış / kısmen uygulanmış kayıt yolda: eksik; geri alınmışsa yoldan çıktığı için değil
ok("yer tutucu (atildi) ya da kısmen uygulanmış (eksik) kayıt yoldaysa eksik",
  E.yolUzlastir([kay(1, "A", "A", "i", "X", "Y", { atildi: true }), kay(2, "A", "A", "j", "Y", "Z")]).eksik === true &&
  E.yolUzlastir([kay(1, "A", "A", "i", "X", "Y", { eksik: true })]).eksik === true &&
  E.yolUzlastir([kay(1, "A", "A", "i", "X", "Y", { eksik: true }), kay(2, "A", "A", "j", "X", "W")]).eksik === false);
ok("yolUzlastir: boş / null yol", E.yolUzlastir(null).yol.length === 0 && E.yolUzlastir([]).sonIz === "");

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
