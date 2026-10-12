// Suflo testi: js/whisper-words.js — whisper-cli -ojf çıktısından ölçülmüş kelime zamanları
//
// Fikstürler (tests/fixtures/whisper-*.json) whisper.cpp v1.9.1 examples/cli/cli.cpp
// output_json(full=true) biçimiyle birebir (sekme girinti, anahtar sırası, özel belirteçler,
// zamanı olmayan belirteçte timestamps/offsets yazılmaması) kısaltılmış Türkçe örneklerdir.
// Segment-belirteç düzeni src/whisper.cpp v1.9.1'e göre: pencerenin ilk segmenti dışında
// başlangıç zaman belirteci segmente yazılmaz, kapanış belirteci segmentin sonundadır
// (t0 = t1 = segment sonu), ilk metin belirtecinin t0'ı segment başıyla tutmayabilir.
// Gerçek bir koşudan alınmış ham çıktı tests/fixtures/whisper-ojf-tr-gercek.json olarak
// eklenirse (marketing/v4-kurucu-yapilacaklar.md, ## 3.2) aşağıdaki değişmezler onda da sınanır.
var fs = require("fs"), path = require("path");
var WW = require(path.join(__dirname, "..", "js", "whisper-words.js"));

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : ""));
}
var FIX = path.join(__dirname, "fixtures");
function oku(ad) { return fs.readFileSync(path.join(FIX, ad)); }
function yakin(a, b) { return Math.abs(a - b) < 1e-6; }
function metinler(ws) { return ws.map(function (w) { return w.text; }).join(" "); }

/* ---------------- 1) v1.9.1 -ojf: alt-kelime birleşimi, çok baytlı harfler ---------------- */
var bilgi = {};
var VADSIZ = { vadAcik: false };   // bu fikstür VAD'siz koşu: belirteçler segmentle aynı tabanda
var segs = WW.segmentleriCoz(oku("whisper-ojf-tr.json"), bilgi, VADSIZ);
ok("üç satır, dil ve belirteç bilgisi", segs.length === 3 && bilgi.dil === "tr" && bilgi.belirtecli === true && bilgi.hiza === "yok", JSON.stringify(bilgi));
ok("satır metni ve sınırları (ms -> sn)", segs[0].text === "Bu ışık hiç de kötü değil, değil mi?" && segs[0].start === 0 && segs[0].end === 3.48 && segs[2].start === 7.3 && segs[2].end === 9.8);
ok("çok baytlı harfli alt-kelimeler tek kelime: ' ı'+'ş'+'ık' = ışık, ' de'+'ğ'+'il' = değil",
  metinler(segs[0].words) === "Bu ışık hiç de kötü değil, değil mi?", metinler(segs[0].words));
ok("kelime metinleri satır metniyle birebir (boşluklar hariç)", segs.every(function (s) { return metinler(s.words) === s.text; }));
var isik = segs[0].words[1], degil = segs[0].words[5];
ok("kelime zamanı ilk/son belirteçten: ışık 0.22–0.64", isik.text === "ışık" && isik.start === 0.22 && isik.end === 0.64, JSON.stringify(isik));
ok("sondaki noktalama kelimede kalır, zamanını uzatmaz: 'değil,' 1.44–1.90", degil.text === "değil," && degil.start === 1.44 && degil.end === 1.9, JSON.stringify(degil));
ok("'?' belirteci segment sonuna kadar uzansa da 'mi?' 2.86'da biter", segs[0].words[7].text === "mi?" && segs[0].words[7].end === 2.86, JSON.stringify(segs[0].words[7]));
ok("kelime p = belirteçlerinin en düşüğü (ışık: 0.873291 -> 0.873)", isik.p === 0.873 && segs[0].words[0].p === 0.912, JSON.stringify(isik));
ok("noktalama belirtecinin düşük p'si kelimeyi işaretlemez ('değil,' p 0.981)", degil.p === 0.981);
ok("özel belirteçler ([_BEG_], [_TT_174], [_TT_490]) kelime olmaz", segs.every(function (s) { return s.words.every(function (w) { return !/\[_|<\|/.test(w.text); }); }));
ok("başlangıç belirteci olmayan segment: ilk kelime ölçülmüş konuşma başında (Güzel. 7.36, segment 7.30)",
  segs[2].words[0].text === "Güzel." && segs[2].words[0].start === 7.36 && segs[2].words[0].end === 7.7, JSON.stringify(segs[2].words[0]));
// satır güveni = özel olmayan TÜM belirteçlerin p ortalaması
var ojf = JSON.parse(oku("whisper-ojf-tr.json").toString("utf8"));
var ps = ojf.transcription[0].tokens.filter(function (t) { return !/^\s*(\[_|<\|)/.test(t.text); }).map(function (t) { return t.p; });
var ort = ps.reduce(function (a, b) { return a + b; }, 0) / ps.length;
ok("satır confidence = özel olmayan belirteç p ortalaması", yakin(segs[0].confidence, Math.round(ort * 1000) / 1000) && segs[0].confidence > 0.9, segs[0].confidence + " ~ " + ort);
ok("kelime başlangıçları azalmaz ve satır içinde kalır", segs.every(function (s) {
  return s.words.every(function (w, i) { return w.start >= s.start && w.end <= s.end && w.end >= w.start && (i === 0 || w.start >= s.words[i - 1].start); });
}));
ok("JSON metni ve ayrıştırılmış nesne de kabul edilir", JSON.stringify(WW.segmentleriCoz(oku("whisper-ojf-tr.json").toString("utf8"), null, VADSIZ)) === JSON.stringify(segs) &&
  JSON.stringify(WW.segmentleriCoz(ojf, null, VADSIZ)) === JSON.stringify(segs));

/* ---------------- 2) zamansız belirteçler, <|endoftext|> ---------------- */
var z = WW.segmentleriCoz(oku("whisper-ojf-zamansiz.json"));
ok("<|endoftext|> atlanır", metinler(z[0].words) === "Bu ışık hiç de kötü değil.", metinler(z[0].words));
// ' ı','ş','ık' zamansız: 'Bu' (0.22) ile 'hiç' (0.64) arasına karakter ağırlığıyla (1,1,2) yayılır
ok("zamansız alt-kelimeler komşular arasına yayılır: ışık 0.22–0.64", z[0].words[1].text === "ışık" && z[0].words[1].start === 0.22 && z[0].words[1].end === 0.64, JSON.stringify(z[0].words[1]));
ok("zamansız 'kö'+'tü' 1.06–1.44 (önceki bitiş - sonraki başlangıç)", z[0].words[4].text === "kötü" && z[0].words[4].start === 1.06 && z[0].words[4].end === 1.44, JSON.stringify(z[0].words[4]));
// tümü zamansız satır: segmente yayılır ('Tam'3 + 'am'2 + '.'1 = 6 → 2.0 + 1.0*5/6)
ok("tümü zamansız satır segmente sıkıştırılır", z[1].words.length === 1 && z[1].words[0].text === "Tamam." && z[1].words[0].start === 2 && yakin(z[1].words[0].end, 2.833), JSON.stringify(z[1].words));

/* ---------------- 3) --vad: belirteçler işlenmiş zamanda, segment özgün zamanda ---------------- */
var v = WW.segmentleriCoz(oku("whisper-ojf-vad.json"));
ok("VAD: belirteç zamanları segment aralığına taşınır (2.0–4.4 -> 12.0–14.4)",
  v[0].start === 12 && v[0].words[0].text === "Kamera" && v[0].words[0].start === 12 && v[0].words[2].text === "başlıyoruz." &&
  yakin(v[0].words[2].start, 13.1) && yakin(v[0].words[2].end, 14.1), JSON.stringify(v[0].words));
ok("VAD: tüm kelimeler satırın içinde", v[0].words.every(function (w) { return w.start >= 12 && w.end <= 14.4; }));

// satırın ortasında VAD'in attığı sessizlik: doğrusal hizalama yanılır, whisper'ın kendi tablosu (stderr) doğru
var vb = oku("whisper-ojf-vad-bosluklu.json");
var vbStderr = oku("whisper-ojf-vad-bosluklu.stderr.txt").toString("utf8");
var vbBilgi = {};
var vbTablo = WW.segmentleriCoz(vb, vbBilgi, { stderr: vbStderr });
var simdi = vbTablo[0].words[2];
ok("VAD tablosu (stderr): sessizlikten sonraki 'şimdi' özgün 14.10–14.60'ta", vbBilgi.vad === true && simdi.text === "şimdi" && yakin(simdi.start, 14.1) && yakin(simdi.end, 14.6),
  JSON.stringify(vbTablo[0].words));
ok("VAD tablosu: sessizlikten önceki kelimeler değişmez (Kamera 10.0–10.6, hazır, 10.6–11.4)", yakin(vbTablo[0].words[0].start, 10) && yakin(vbTablo[0].words[1].end, 11.4));
var vbDogrusal = WW.segmentleriCoz(vb);
ok("stderr yoksa doğrusal hizalamaya düşer (sessizliği bilemez, yine satır içinde)", !yakin(vbDogrusal[0].words[2].start, 14.1) && vbDogrusal[0].words.every(function (w) { return w.start >= 10 && w.end <= 16.4; }));
var esleme = WW.vadEslemesi(vbStderr);
ok("vadEslemesi: whisper tablosu — uçlarda sabit, sessizlik aralığı tek noktaya", esleme(0) === 10 && yakin(esleme(2.0), 12) && yakin(esleme(2.1), 12) && yakin(esleme(2.15), 13) &&
  yakin(esleme(2.2), 14) && esleme(9) === 16.4 && WW.vadEslemesi("main: processing") === null);
ok("VAD tablosu birden fazla satır parçasını sırayla eşler", yakin(WW.vadEslemesi("vad_segment_info: orig_start: 5.00, orig_end: 6.00, vad_start: 0.00, vad_end: 1.00\n" +
  "vad_segment_info: orig_start: 9.00, orig_end: 10.00, vad_start: 1.20, vad_end: 2.20\nvad_segment_info: orig_start: 20.00, orig_end: 21.00, vad_start: 2.40, vad_end: 3.40")(2.9), 20.5));

/* ---- 3b) VAD kapalı (Silero modeli yok): belirteç zamanları OLDUĞU GİBİ, doğrusal hizalama yok ---- */
// v1.9.1 gerçek düzeni: 2. ve 3. segmentte başlangıç zaman belirteci yok; ilk metin belirteci
// 2.'de enerjiyle konuşma başına kaymış (5.30, segment 4.88), 3.'de önceki segmentin sonunda (7.00, segment 7.40)
var vsBilgi = {};
var vs = WW.segmentleriCoz(oku("whisper-ojf-vadsiz.json"), vsBilgi, { stderr: "main: processing 'ornek.wav' (160000 samples, 10.0 sec)", vadAcik: false });
ok("VAD kapalı: kelime zamanları belirteçlerden aynen (Şimdi 5.30–6.00, başlayalım. 6.00–6.90)",
  vs[1].start === 4.88 && vs[1].words[0].text === "Şimdi" && vs[1].words[0].start === 5.3 && vs[1].words[0].end === 6 &&
  vs[1].words[1].text === "başlayalım." && vs[1].words[1].start === 6 && vs[1].words[1].end === 6.9 && vsBilgi.hiza === "yok" && vsBilgi.vad === false,
  JSON.stringify(vs[1].words) + " " + JSON.stringify(vsBilgi));
ok("VAD kapalı: segment başından önceki belirteç zamanı segmente sıkıştırılır (Hazır 7.40–7.90), gerisi aynen",
  vs[2].words[0].text === "Hazır" && vs[2].words[0].start === 7.4 && vs[2].words[0].end === 7.9 && vs[2].words[1].text === "mısınız?" && vs[2].words[1].start === 7.9 && vs[2].words[1].end === 8.8,
  JSON.stringify(vs[2].words));
ok("VAD kapalı: ilk segment (BEG belirteçli) aynen", vs[0].words.map(function (w) { return w.text + "@" + w.start + "-" + w.end; }).join(" ") === "Merhaba@0-0.7 arkadaşlar.@0.82-2", JSON.stringify(vs[0].words));
var vsEski = WW.segmentleriCoz(oku("whisper-ojf-vadsiz.json"), {}, { vadAcik: true });
ok("VAD açık sanılırsa (tablo yok) doğrusal hizalama kelimeleri erkene çekerdi: bu yüzden captions.js --vad'i bildirir",
  vsEski[1].words[0].start === 4.88 && Math.abs(vsEski[1].words[0].end - 5.753) < 1e-9, JSON.stringify(vsEski[1].words[0]));
ok("vadAcik false iken stderr'deki VAD satırları da yok sayılır (yanlış tablo uygulanmaz)",
  WW.segmentleriCoz(oku("whisper-ojf-vadsiz.json"), null, { stderr: vbStderr, vadAcik: false })[1].words[0].start === 5.3);

/* ---------------- 4) belirteçsiz (eski derleme / -oj) ---------------- */
var e = WW.segmentleriCoz(oku("whisper-oj-belirtecsiz.json"), bilgi);
ok("belirteçsiz: satırlar gelir, words [] ve confidence undefined", e.length === 2 && e[0].text === "Bu ışık hiç de kötü değil." && e[0].words.length === 0 &&
  e[0].confidence === undefined && e[1].start === 2.48 && bilgi.belirtecli === false, JSON.stringify(e[0]));
ok("kelimeVar: belirteçsizde false, -ojf'de true", WW.kelimeVar(e) === false && WW.kelimeVar(segs) === true);
ok("offsets yoksa timestamps dizgesinden", WW.segmentleriCoz({ transcription: [{ timestamps: { from: "00:00:01,500", to: "00:00:02,250" }, text: " a" }] })[0].start === 1.5);
ok("boş / bozuk girdi: boş liste", WW.segmentleriCoz({}).length === 0 && WW.segmentleriCoz({ transcription: [null] })[0].words.length === 0);

/* ---------------- 5) v1.9.1 öncesi: çok baytlı harf belirteçlere bölünmüş (geçersiz UTF-8) ---------------- */
function b(s) { return Buffer.from(s, "utf8"); }
var g = b("ğ"), bol = Buffer.concat([
  b('{"result":{"language":"tr"},"transcription":[{"offsets":{"from":0,"to":1000},"text":" değil","tokens":['),
  b('{"text":" de","offsets":{"from":0,"to":300},"p":0.9},{"text":"'), g.slice(0, 1), b('","offsets":{"from":300,"to":400},"p":0.8},{"text":"'),
  g.slice(1), b('il","offsets":{"from":400,"to":900},"p":0.95}]}]}')
]);
var bs = WW.segmentleriCoz(bol);
ok("bölünmüş UTF-8 bayt düzeyinde birleşir: 'değil'", bs[0].words.length === 1 && bs[0].words[0].text === "değil" && bs[0].text === "değil" && bs[0].words[0].p === 0.8, JSON.stringify(bs[0]));

/* ---------------- 5b) noktalama: sondaki yapışır, boşluklu tire kendi kelimesi ---------------- */
function tseg(metin, parcalar) {
  var t = 0;
  return { offsets: { from: 0, to: parcalar.length * 300 }, text: metin, tokens: parcalar.map(function (x) { var o = { text: x, offsets: { from: t, to: t + 300 }, p: 0.9 }; t += 300; return o; }) };
}
var tr1 = WW.kelimelereAyir(tseg(" Evet - hayır", [" Evet", " -", " hayır"]), { vadAcik: false });
ok("boşluklu tire kendi kelimesi: Evet | - | hayır ('Evet-' değil), metin satırla aynı", metinler(tr1) === "Evet - hayır" && tr1.length === 3 && tr1[1].text === "-" && tr1[1].start === 0.3, JSON.stringify(tr1));
ok("uzun tire ve satır başı tiresi de: '— Evet, peki —'", metinler(WW.kelimelereAyir(tseg(" — Evet, peki —", [" —", " Evet", ",", " peki", " —"]), { vadAcik: false })) === "— Evet, peki —");
ok("boşluksuz tire kelimenin parçası: 'e-posta'", metinler(WW.kelimelereAyir(tseg(" e-posta", [" e", "-", "posta"]), { vadAcik: false })) === "e-posta");
ok("boşluklu sondaki noktalama yine yapışır (' ?', ' ,'), açılış işareti sonrakine", metinler(WW.kelimelereAyir(tseg(" Ne ? ( bak", [" Ne", " ?", " (", " bak"]), { vadAcik: false })) === "Ne? (bak");

/* ---------------- 5c) ayarlara yazılacak kopya ---------------- */
var ks = [{ start: 1, end: 2, text: "a b", confidence: 0.9, words: [{ text: "a", start: 1, end: 1.5 }], origWords: [{ text: "x", start: 1, end: 2 }], orig: "x" }];
var kk = WW.kelimesizKopya(ks);
ok("kelimesizKopya: words/origWords düşer, gerisi kalır, girdi değişmez", kk.length === 1 && !("words" in kk[0]) && !("origWords" in kk[0]) && kk[0].orig === "x" && kk[0].confidence === 0.9 &&
  ks[0].words.length === 1 && WW.kelimesizKopya(null).length === 0);

/* ---------------- 6) kelimeGrupla: segment sınırını aşar, duraklama ve cümle sonu ---------------- */
var duz = WW.duzlestir(segs);
ok("duzlestir: 18 kelime, sıralı, güven = p", duz.length === 18 && duz[0].text === "Bu" && duz[0].confidence === 0.912 && duz.every(function (w, i) { return i === 0 || w.start >= duz[i - 1].start; }));
var g3 = WW.kelimeGrupla(duz, 3);
ok("kelimeGrupla(3): cümle sonu ve 3 kelimede boşaltır",
  JSON.stringify(g3.map(function (x) { return x.text; })) === JSON.stringify(["Bu ışık hiç", "de kötü değil,", "değil mi?", "Şimdi kamerayı biraz", "sola çevirelim.", "Güzel.", "Peki, sonra tekrar", "deneyelim!"]),
  g3.map(function (x) { return x.text; }).join(" | "));
var g8 = WW.kelimeGrupla(duz, 8);
ok("kelimeGrupla(8): '?' ile satır sonu, segment sınırını aşan grup yok ama cümle içinde aşar",
  g8[0].text === "Bu ışık hiç de kötü değil, değil mi?" && g8[1].text === "Şimdi kamerayı biraz sola çevirelim.", g8.map(function (x) { return x.text; }).join(" | "));
var araSiz = WW.duzlestir([{ words: [{ text: "bir", start: 0, end: 0.3 }, { text: "iki", start: 0.4, end: 0.7 }, { text: "üç", start: 2.0, end: 2.3 }, { text: "dört", start: 2.4, end: 2.6 }] }]);
var gA = WW.kelimeGrupla(araSiz, 5);
ok("0.8 sn'den uzun duraklama grubu kırar (cümle sonu olmasa da)", gA.length === 2 && gA[0].text === "bir iki" && gA[1].text === "üç dört", JSON.stringify(gA.map(function (x) { return x.text; })));
ok("araKir ayarlanabilir", WW.kelimeGrupla(araSiz, 5, 2).length === 1);
var segSinir = WW.duzlestir([{ words: [{ text: "a", start: 0, end: 0.2 }, { text: "b", start: 0.25, end: 0.4 }] }, { words: [{ text: "c", start: 0.45, end: 0.6 }, { text: "d", start: 0.65, end: 0.8 }] }]);
ok("segment sınırında sıfırlanmaz (ritimsiz 1-2 kelimelik satır kalmaz)", WW.kelimeGrupla(segSinir, 3).map(function (x) { return x.text; }).join("|") === "a b c|d");
ok("grup: kelimeleri, güveni (p ortalaması) ve zamanı taşır", g3[0].words.length === 3 && g3[0].start === 0 && g3[0].end === 0.92 && yakin(g3[0].confidence, (0.912 + 0.873 + 0.962) / 3), JSON.stringify(g3[0]));
ok("grup kelimelerinin başlangıçları azalmaz ve grup içinde kalır", g3.every(function (x) {
  return x.words.every(function (w, i) { return w.start >= x.start && w.end <= x.end + 1e-9 && (i === 0 || w.start >= x.words[i - 1].start); });
}));
ok("duzlestir: kelimesiz satır tek öğe (eski -ml 1 / bulut kelimesi)", JSON.stringify(WW.duzlestir([{ start: 1, end: 2, text: " merhaba ", confidence: 0.7 }])) === JSON.stringify([{ text: "merhaba", start: 1, end: 2, p: 0.7, confidence: 0.7 }]));

/* ---------------- 7) zaman eşleme ve editör yardımcıları ---------------- */
var es = WW.zamanEsle(segs.slice(0, 1), 10, 0.5);
ok("zamanEsle: satır ve kelimeler aynı eşlemeyle (ofset + t * hız), girdi değişmez", es[0].start === 10 && es[0].end === 11.74 && es[0].words[1].start === 10.11 && segs[0].words[1].start === 0.22);
ok("belirtecSayisi: *vurgu* ve yalnız yıldız sayılmaz", WW.belirtecSayisi("*Bu* ışık * hiç") === 3 && WW.belirtecSayisi("") === 0);
ok("yalnizVurgu: işaret değişimi metin değişimi sayılmaz", WW.yalnizVurgu("Bu ışık", "*Bu* ışık") && !WW.yalnizVurgu("Bu ışık", "Bu ışıklar"));
var satir = { start: 0, end: 3.48, text: "Bu ışık hiç de kötü değil, değil mi?", words: segs[0].words };
var bl = WW.bolmeNoktasi(satir, "Bu ışık hiç de", "kötü değil, değil mi?", 1.5);
ok("bölme: kelime sayısı tutunca kesme ÖLÇÜLMÜŞ (kötü 1.06), kelimeler ikiye", bl.olculmus && bl.kesme === 1.06 && bl.a.length === 4 && bl.b.length === 4 && bl.b[0].text === "kötü", JSON.stringify(bl.kesme));
var bl2 = WW.bolmeNoktasi(satir, "Bu ışık hiç de kötü", "değil ama", 1.5);
ok("bölme: sayı tutmazsa tahmin, kelimeler zamanla dağılır", !bl2.olculmus && bl2.kesme === 1.5 && bl2.a.length === 5 && bl2.b.length === 3, JSON.stringify([bl2.a.length, bl2.b && bl2.b.length]));
ok("bölme: kelimesiz satırda yalnız tahmin", WW.bolmeNoktasi({ start: 0, end: 2, text: "a b" }, "a", "b", 1).kesme === 1 && WW.bolmeNoktasi({ start: 0, end: 2, text: "a b" }, "a", "b", 1).a === null);
var bir = WW.birlestirKelimeler({ text: "a", words: [{ text: "a", start: 0, end: 1 }] }, { text: "b", words: [{ text: "b", start: 1, end: 2 }] });
ok("birleştirme: iki tarafın kelimeleri zamanla", bir && bir.length === 2 && bir[1].text === "b");
ok("birleştirme: bir taraf kelimesizse kelime düşer; boş metinli taraf engel değil",
  WW.birlestirKelimeler({ text: "a", words: [{ text: "a", start: 0, end: 1 }] }, { text: "b" }) === null &&
  WW.birlestirKelimeler({ text: "a", words: [{ text: "a", start: 0, end: 1 }] }, { text: "" }).length === 1);
ok("kelimeleriKaydir: yeni dizi, girdi değişmez", WW.kelimeleriKaydir(segs[0].words, 2)[0].start === 2 && segs[0].words[0].start === 0);

/* ---------------- 8) gerçek koşu fikstürü (varsa) ---------------- */
var gercekYol = path.join(FIX, "whisper-ojf-tr-gercek.json");
if (fs.existsSync(gercekYol)) {
  var grStderr = path.join(FIX, "whisper-ojf-tr-gercek.stderr.txt");
  var gr = WW.segmentleriCoz(fs.readFileSync(gercekYol), {}, fs.existsSync(grStderr) ? { stderr: fs.readFileSync(grStderr, "utf8") } : null);
  ok("gerçek -ojf: her satırın kelimeleri ve güveni var", gr.length > 0 && gr.every(function (s) { return !s.text || (s.words.length > 0 && isFinite(s.confidence)); }));
  ok("gerçek -ojf: kelime metni satır metniyle tutar, özel belirteç yok", gr.every(function (s) { return metinler(s.words).replace(/\s+/g, "") === s.text.replace(/\s+/g, "") && !/\[_|<\|/.test(metinler(s.words)); }));
  ok("gerçek -ojf: kelimeler satır içinde ve sıralı", gr.every(function (s) { return s.words.every(function (w, i) { return w.start >= s.start && w.end <= s.end && (i === 0 || w.start >= s.words[i - 1].start); }); }));
} else {
  console.log("ATLA gerçek -ojf fikstürü yok (tests/fixtures/whisper-ojf-tr-gercek.json) — kurucu yapılacaklar ## 3.2");
}
// aynı ses --vad OLMADAN (Silero modeli inmemiş kullanıcı): belirteç zamanları olduğu gibi kullanılır
var gercekVadsiz = path.join(FIX, "whisper-ojf-tr-gercek-vadsiz.json");
if (fs.existsSync(gercekVadsiz)) {
  var gv = WW.segmentleriCoz(fs.readFileSync(gercekVadsiz), {}, { vadAcik: false });
  ok("gerçek -ojf (VAD'siz): kelime metni satırla tutar, kelimeler satır içinde ve sıralı", gv.length > 0 && gv.every(function (s) {
    return metinler(s.words).replace(/\s+/g, "") === s.text.replace(/\s+/g, "") &&
      s.words.every(function (w, i) { return w.start >= s.start && w.end <= s.end && (i === 0 || w.start >= s.words[i - 1].start); });
  }));
} else {
  console.log("ATLA gerçek VAD'siz -ojf fikstürü yok (tests/fixtures/whisper-ojf-tr-gercek-vadsiz.json) — kurucu yapılacaklar ## 3.2");
}
// 3.2 adım 5: Suflo'nun gerçek modeliyle "-dtw <ön ayar> -nfa" koşusu (VAD açık, stderr yanında)
var gercekDtw = path.join(FIX, "whisper-ojf-dtw-gercek.json");
if (fs.existsSync(gercekDtw)) {
  var gdStderr = path.join(FIX, "whisper-ojf-dtw-gercek.stderr.txt");
  var gdBilgi = {};
  var gd = WW.segmentleriCoz(fs.readFileSync(gercekDtw), gdBilgi, fs.existsSync(gdStderr) ? { stderr: fs.readFileSync(gdStderr, "utf8") } : null);
  ok("gerçek DTW koşusu: belirteçlerin çoğu t_dtw ≥ 0 (nicemlenmiş modelde DTW çalışıyor)", gdBilgi.dtw && gdBilgi.dtw.toplam > 0 && gdBilgi.dtw.olculen >= gdBilgi.dtw.toplam * 0.5, JSON.stringify(gdBilgi.dtw));
  ok("gerçek DTW koşusu: kelimeler satır içinde, sıralı, metin satırla tutar", gd.length > 0 && gd.every(function (s) {
    return metinler(s.words).replace(/\s+/g, "") === s.text.replace(/\s+/g, "") &&
      s.words.every(function (w, i) { return w.start >= s.start && w.end <= s.end && w.end >= w.start && (i === 0 || w.start >= s.words[i - 1].start); });
  }));
} else {
  console.log("ATLA gerçek DTW -ojf fikstürü yok (tests/fixtures/whisper-ojf-dtw-gercek.json) — kurucu yapılacaklar ## 3.2 › Adım 5");
}

/* ---------------- 8b) DTW (3.2 adım 5): t_dtw ≥ 0 kelime başı, sonraki kelimeye kadar ---------------- */
// Fikstür whisper-ojf-tr.json'un aynısı, metin belirteçlerine -dtw ile yazılan t_dtw (santisaniye)
// eklenmiş: 1. satırın hepsi ölçülü, 2. satırda ' biraz' -1 (yedek), 3. satırın hepsi -1.
// Biçim gerçek v1.9.1 koşusuyla doğrulandı (nicemlenmiş q5_1 dosyası, -dtw tiny -nfa: t_dtw ≥ 0;
// -nfa olmadan flash attention DTW'yi kapatır ve hepsi -1 — marketing/v3.2-deneme-listesi.md ## 5).
var dBilgi = {};
var d = WW.segmentleriCoz(oku("whisper-ojf-dtw.json"), dBilgi, VADSIZ);
function zk(w) { return [w.text, w.start, w.end]; }
ok("DTW: metin ve satır sınırları değişmez", d.length === 3 && d.every(function (s, i) { return s.text === segs[i].text && s.start === segs[i].start && s.end === segs[i].end && metinler(s.words) === s.text; }));
ok("DTW: kelime başı t_dtw / 100 (ışık 0.26, offsets'te 0.22)", d[0].words[1].text === "ışık" && d[0].words[1].start === 0.26 && d[0].words[0].start === 0.04, JSON.stringify(d[0].words.map(zk)));
ok("DTW: küçük boşluk sonraki kelimenin başına kapanır (Bu 0.04–0.26, ışık 0.26–0.68, kötü 1.10–1.50)",
  d[0].words[0].end === 0.26 && d[0].words[1].end === 0.68 && d[0].words[4].text === "kötü" && d[0].words[4].start === 1.1 && d[0].words[4].end === 1.5, JSON.stringify(d[0].words.map(zk)));
ok("DTW: alt-kelimeli kelimede ilk belirtecin t_dtw'si ('de'+'ğ'+'il' -> 1.50)", d[0].words[5].text === "değil," && d[0].words[5].start === 1.5 && d[0].words[5].end === 2.14);
ok("DTW: son kelime kendi belirteç sonunda biter, DTW kaydırmasıyla (offsets 2.56–2.86 -> 2.62–2.92; segment sonu 3.48'e uzamaz)", d[0].words[7].text === "mi?" && d[0].words[7].start === 2.62 && d[0].words[7].end === 2.92, JSON.stringify(zk(d[0].words[7])));
ok("DTW: t_dtw -1 olan kelime offsets'e düşer (biraz 4.30–4.70)", d[1].words[2].text === "biraz" && d[1].words[2].start === 4.3 && d[1].words[2].end === 4.7, JSON.stringify(d[1].words.map(zk)));
ok("DTW: yedek kelimeden önceki DTW kelimesi onun offsets başında biter (kamerayı 3.86–4.30)", d[1].words[1].text === "kamerayı" && d[1].words[1].start === 3.86 && d[1].words[1].end === 4.3);
ok("DTW: hepsi -1 olan satır offsets'le birebir (Güzel. 7.36–7.70)", JSON.stringify(d[2].words) === JSON.stringify(segs[2].words));
ok("DTW: başlangıçlar azalmaz, kelimeler satır içinde, bitiş ≥ başlangıç", d.every(function (s) {
  return s.words.every(function (w, i) { return w.start >= s.start && w.end <= s.end && w.end >= w.start && (i === 0 || w.start >= s.words[i - 1].start); });
}));
ok("DTW: p ve satır güveni değişmez", d.every(function (s, i) { return s.confidence === segs[i].confidence && s.words.every(function (w, k) { return w.p === segs[i].words[k].p; }); }));
ok("DTW bilgisi: 37 metin belirtecinde t_dtw alanı, 25'i ölçülü", dBilgi.dtw && dBilgi.dtw.toplam === 37 && dBilgi.dtw.olculen === 25, JSON.stringify(dBilgi.dtw));
var dKapali = WW.segmentleriCoz(oku("whisper-ojf-dtw.json"), {}, { vadAcik: false, dtw: false });
ok("secenek.dtw false: t_dtw yok sayılır, offsets'le birebir", JSON.stringify(dKapali) === JSON.stringify(segs));
var tumuEksi = {};
WW.segmentleriCoz(oku("whisper-ojf-tr.json"), tumuEksi, VADSIZ);
ok("DTW istenmemiş / motor kapatmış: alan var, hepsi -1 (otomatik kapatma girdisi)", tumuEksi.dtw.toplam === 37 && tumuEksi.dtw.olculen === 0 && tumuEksi.ceviri === false, JSON.stringify(tumuEksi));
var eskiBilgi = {};
WW.segmentleriCoz(oku("whisper-oj-belirtecsiz.json"), eskiBilgi);
ok("t_dtw alanı hiç yok (eski derleme / -oj): toplam 0", eskiBilgi.dtw.toplam === 0 && eskiBilgi.dtw.olculen === 0);
// sınır: segment dışına düşen t_dtw segmente sıkıştırılır; sıra korunur
var tasan = WW.kelimelereAyir({ offsets: { from: 1000, to: 2000 }, text: " a b c", tokens: [
  { text: " a", offsets: { from: 1000, to: 1300 }, t_dtw: 80 }, { text: " b", offsets: { from: 1300, to: 1600 }, t_dtw: 150 },
  { text: " c", offsets: { from: 1600, to: 2000 }, t_dtw: 250 }] }, { vadAcik: false });
ok("DTW: segment dışı t_dtw segmente sıkıştırılır (a 1.0, c ≤ 2.0)", tasan[0].start === 1 && tasan[0].end === 1.5 && tasan[2].start === 2 && tasan[2].end === 2, JSON.stringify(tasan));
var geri = WW.kelimelereAyir({ offsets: { from: 0, to: 1000 }, text: " a b", tokens: [
  { text: " a", offsets: { from: 0, to: 400 }, t_dtw: 60 }, { text: " b", offsets: { from: 400, to: 1000 }, t_dtw: 30 }] }, { vadAcik: false });
ok("DTW: geriye giden t_dtw sırayı bozmaz (b, a'dan önce başlamaz)", geri[1].start >= geri[0].start && geri[0].end >= geri[0].start, JSON.stringify(geri));
ok("dtwZamani: santisaniye -> sn, -1 / boş / NaN -> null", WW.dtwZamani({ t_dtw: 254 }) === 2.54 && WW.dtwZamani({ t_dtw: -1 }) === null &&
  WW.dtwZamani({}) === null && WW.dtwZamani({ t_dtw: "x" }) === null && WW.dtwZamani({ t_dtw: 0 }) === 0 && WW.dtwZamani(null) === null);
// --vad: t_dtw de işlenmiş seste (gerçek koşuda belirteç offsets'iyle aynı taban) -> whisper'ın VAD tablosuyla taşınır
var vbJson = JSON.parse(vb.toString("utf8"));
vbJson.transcription[0].tokens.forEach(function (t) { if (t.offsets && !/^\[_/.test(t.text)) t.t_dtw = Math.round(t.offsets.from / 10) + 5; });
var vbDtw = WW.segmentleriCoz(vbJson, {}, { stderr: vbStderr });
ok("DTW + VAD tablosu: 'şimdi' t_dtw 2.35 -> özgün 14.15, sonu sonraki kelimenin başı", vbDtw[0].words[2].text === "şimdi" && yakin(vbDtw[0].words[2].start, 14.15) &&
  yakin(vbDtw[0].words[2].end, vbDtw[0].words[3].start) && yakin(vbDtw[0].words[0].start, 10.05), JSON.stringify(vbDtw[0].words.map(zk)));
ok("DTW + VAD: son kelime kendi belirteç sonunda (15.9 + 0.05 kayma; satır sonu 16.4'e uzamaz), hepsi satır içinde", yakin(vbDtw[0].words[vbDtw[0].words.length - 1].end, 15.95) &&
  vbDtw[0].words.every(function (w) { return w.start >= 10 && w.end <= 16.4; }), JSON.stringify(vbDtw[0].words.map(zk)));
// inceleme bulgusu: DTW açıkken VAD'in attığı sessizlik kelimeyi ekranda tutmamalı (t_dtw = offsets başı:
// DTW başları bugünkü başlarla aynı; bitişler de aynı kalmalı)
var vbAyni = JSON.parse(vb.toString("utf8"));
vbAyni.transcription[0].tokens.forEach(function (t) { if (t.offsets && !/^\[_/.test(t.text)) t.t_dtw = Math.round(t.offsets.from / 10); });
var vbOff = WW.segmentleriCoz(vb, {}, { stderr: vbStderr }), vbDtw2 = WW.segmentleriCoz(vbAyni, {}, { stderr: vbStderr });
ok("DTW + VAD: 2,7 sn sessizlikte 'hazır,' 11.4'te biter (14.1'e uzamaz), son kelime 15.9 — offsets'le birebir",
  JSON.stringify(vbDtw2[0].words.map(zk)) === JSON.stringify(vbOff[0].words.map(zk)) && vbDtw2[0].words[1].text === "hazır," && yakin(vbDtw2[0].words[1].end, 11.4),
  JSON.stringify(vbDtw2[0].words.map(zk)));
// satır içi duraklama (VAD'siz): DTW açıkken de boşluk kalır, kelime kelime / N kelime / iki satır orada kırılır
function duraklamaSegmenti(dtw) {
  function tok(t, a, b, d) { var x = { text: t, offsets: { from: a, to: b }, p: 0.9 }; if (dtw) x.t_dtw = d; return x; }
  return { transcription: [{ offsets: { from: 1000, to: 6500 }, text: " Bir dakika sonra geliyorum", tokens: [
    tok(" Bir", 1000, 1400, 100), tok(" dakika", 1400, 2000, 140), tok(" sonra", 4500, 5000, 450), tok(" geliyorum", 5000, 6500, 500)] }] };
}
var drOff = WW.segmentleriCoz(duraklamaSegmenti(false), {}, VADSIZ), drDtw = WW.segmentleriCoz(duraklamaSegmenti(true), {}, VADSIZ);
ok("DTW: 2,5 sn satır içi duraklama korunur (dakika 1.4–2.0, sonra 4.5'te), son kelime 6.5",
  JSON.stringify(drDtw[0].words.map(zk)) === JSON.stringify([["Bir", 1, 1.4], ["dakika", 1.4, 2], ["sonra", 4.5, 5], ["geliyorum", 5, 6.5]]) &&
  JSON.stringify(drDtw[0].words.map(zk)) === JSON.stringify(drOff[0].words.map(zk)), JSON.stringify(drDtw[0].words.map(zk)));
var CTX = require(path.join(__dirname, "..", "js", "caption-text.js"));
function duzen(segs, mod) { return CTX.segmentleriKur(segs, mod).segments.map(function (c) { return c.text + " " + c.start + "-" + c.end; }).join(" | "); }
var k1Dtw = CTX.segmentleriKur(drDtw, "k1").segments;
ok("DTW + kelime kelime: 'dakika' duraklamada ekranda kalmaz (2.0'da biter)", k1Dtw[1].text === "dakika" && k1Dtw[1].end <= 2.0 + 1e-9, duzen(drDtw, "k1"));
ok("DTW + 3 kelime: duraklamada kırılır ('Bir dakika' | 'sonra geliyorum'), DTW kapalıyla aynı",
  duzen(drDtw, "w3") === duzen(drOff, "w3") && CTX.segmentleriKur(drDtw, "w3").segments.length === 2 && CTX.segmentleriKur(drDtw, "w3").segments[0].text === "Bir dakika", duzen(drDtw, "w3"));
ok("DTW + iki satır (c42x2): duraklamada iki cue, DTW kapalıyla aynı",
  duzen(drDtw, "c42x2") === duzen(drOff, "c42x2") && CTX.segmentleriKur(drDtw, "c42x2").segments.length === 2, duzen(drDtw, "c42x2"));
// -tr: params.translate true -> bilgi.ceviri (çıktı dili "en", result.language kaynakta kalır)
var cv = JSON.parse(oku("whisper-ojf-tr.json").toString("utf8"));
cv.params.translate = true;
var cvBilgi = {};
WW.segmentleriCoz(cv, cvBilgi, VADSIZ);
ok("-tr koşusu: bilgi.ceviri true, bilgi.dil kaynak dil (tr)", cvBilgi.ceviri === true && cvBilgi.dil === "tr");

/* ---------------- 9) panel bağlantısı (captions.js, engine.js, index.html) ---------------- */
var cap = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
var yc = cap.slice(cap.indexOf("async function yerelCalistir"), cap.indexOf("function tcParse("));
ok("yerelCalistir: -ojf JSON'u Buffer, stderr (VAD tablosu) ve koşunun --vad bilgisiyle segmentleriCoz'a verir, eski satır içi eşleme yok",
  /WW\.segmentleriCoz\(K\.fs\.readFileSync\(jsonPath\), bilgi, \{ stderr: r\.stderr, vadAcik: vadAcik \}\)/.test(yc) &&
  /var vadAcik = args\.indexOf\("--vad"\) !== -1;/.test(yc) && !/avg_logprob|t\.tokens/.test(yc));
ok("Shorts kaydı düzenlemesi ölçülmüş kelimeleri settings.json'a yazmaz", /harita\[shortsYuklenen\]\.segs = WW\.kelimesizKopya\(segments\);/.test(cap));
var tl = cap.slice(cap.indexOf("async function transcribeLocal"), cap.indexOf("async function yerelCalistir"));
ok("transcribeLocal: -ml 1 -sow yalnız belirteçsiz derlemede kelime gerekince", /if \(wordLevel && segs\.length && !WW\.kelimeVar\(segs\)\)/.test(tl) && /kelimeYedegi: true/.test(tl));
ok("takılma kurtarma: 'kalan' satırları ve kelimeleri aynı ofsetle kayar", /kalan = WW\.zamanEsle\(kalan, kesBas, 1\)/.test(tl) && !/sg\.start \+= kesBas/.test(tl));
ok("go(): tek klip ve toplu klip eşlemesi kelimeleri taşır", /WW\.zamanEsle\(raw, seqOffset, speedFactor\)/.test(cap) && /WW\.zamanEsle\(bRaw, bc\.clipStart, bf\)/.test(cap));
ok("stil motoru çağrıları ölçülmüş kelimeleri alır (önizleme dahil, kaydırılarak)", (cap.match(/cueler\(\{ vurgu: true, kelimeler: true \}\)/g) || []).length === 3 &&
  /o\.words = WW\.kelimeleriKaydir\(c\.words, 0\.15 - ilk\)/.test(cap));
ok("editör: bölme / birleştirme / toplu kaydırma / zaman düzenleme kelimeleri taşır",
  /WW\.bolmeNoktasi\(s, a, b, kesme\)/.test(cap) && /WW\.birlestirKelimeler\(segments\[i\], nx\)/.test(cap) &&
  /s\.words = WW\.kelimeleriKaydir\(s\.words, uyg\)/.test(cap) && /WW\.kelimeleriKaydir\(segments\[i\]\.words, fark\)/.test(cap));
// 3.2 adım 4: metin düzenlemesi kelimeleri artık düşürmez, yeni metne LCS ile hizalar (tests/test-caption-layout.js)
ok("editör: metin düzenlemesi kelimeleri yeni metne hizalar (odaktaki kelimelerden), geri al geri getirir",
  /var hiza = CL\.kelimeleriHizala\(odakKelimeleri, inp\.value, segments\[i\]\.start, segments\[i\]\.end, styleLocale\(\) \|\| algilananDil\);\s*if \(hiza\.length\) segments\[i\]\.words = hiza; else delete segments\[i\]\.words;\s*\} else delete segments\[i\]\.words;/.test(cap) &&
  /if \(odakKelimeleri\) eski\[i\]\.words = JSON\.parse\(JSON\.stringify\(odakKelimeleri\)\)/.test(cap));
ok("çeviri kelimeleri saklar, 'orijinale dön' geri getirir; AI kontrolü ve sözlük kuralları",
  /if \(s\.words\) s\.origWords = s\.words;/.test(cap) && /s\.words = s\.origWords; delete s\.origWords;/.test(cap) &&
  /kelimeleriMetinleDogrula\(s, eskiMetin\)/.test(cap) && /kelimeSayisiniKoru\(s, before\)/.test(cap));
ok("geri al / yinele / taslak tüm satır nesnesini (kelimeler dahil) saklar", /segs: JSON\.stringify\(segments\)/.test(cap) && /K\.saveDraft\(\{\s*segments: segments,/.test(cap));
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
ok("index.html: whisper-words.js caption-text.js ve captions.js'ten önce", html.indexOf('src="js/whisper-words.js"') !== -1 &&
  html.indexOf('src="js/whisper-words.js"') < html.indexOf('src="js/caption-text.js"') && html.indexOf('src="js/caption-text.js"') < html.indexOf('src="js/captions.js"'));

/* ---- splitAt / shiftAll gerçek kaynaktan, sahte ortamla ---- */
function kes(imza) { var i = cap.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return cap.slice(i, cap.indexOf("\n  }\n", i) + 4); }
var ED = new Function("WW", [
  "var segments = [], toastlar = [];",
  "var BOSLUKSUZ = /[\\u3040-\\u30FF]/;",
  "var KApp = { toast: function (m) { toastlar.push(m); } };",
  "function snapshot() {} function render() {} function saveDraftSoon() {}",
  kes("function splitAt(i, pos)"), kes("function shiftAll(sec)"),
  "return { set: function (x) { segments = x; }, get: function () { return segments; }, splitAt: splitAt, shiftAll: shiftAll };"].join("\n"))(WW);
var sa = WW.zamanEsle(segs.slice(0, 1), 10, 1)[0];
ED.set([{ start: sa.start, end: sa.end, text: sa.text, confidence: sa.confidence, words: sa.words }]);
ED.splitAt(0, "Bu ışık hiç de".length);
var ed = ED.get();
ok("splitAt: kesme ölçülmüş zamanda (kötü 11.06), kelimeler ikiye bölünür", ed.length === 2 && Math.abs(ed[0].end - 11.06) < 1e-9 && ed[1].start === ed[0].end &&
  ed[0].words.length === 4 && ed[1].words.length === 4 && ed[1].words[0].text === "kötü", JSON.stringify(ed.map(function (x) { return [x.text, x.start, x.end]; })));
ED.shiftAll(0.5);
ok("shiftAll: satırlar ve kelimeler aynı miktarda kayar", Math.abs(ED.get()[1].start - 11.56) < 1e-9 && Math.abs(ED.get()[1].words[0].start - 11.56) < 1e-9 && Math.abs(ED.get()[0].words[0].start - 10.5) < 1e-9);

/* ---------------- 10) kaynak: ES5, Raunen atfı ---------------- */
// Windows checkout (core.autocrlf) CRLF verir: satır sonu işaretleri \n ile aranır
var kaynak = fs.readFileSync(path.join(__dirname, "..", "js", "whisper-words.js"), "utf8").replace(/\r\n/g, "\n");
ok("Raunen dosya başlığı ve işaretleri", kaynak.indexOf("Portions adapted from Raunen (https://github.com/Zeyphers/raunen), MIT, Copyright (c) 2026 Jacob Szczepaniak. See THIRD_PARTY_NOTICES.md.") !== -1 &&
  /\/\/ Raunen: tokensToWords\n  function kelimelereAyir/.test(kaynak) && /\/\/ Raunen: splitByWords\n  function kelimeGrupla/.test(kaynak));
ok("ES5: let/const/ok işlevi/for-of/padStart/Object.values yok", !/\b(let|const)\s|=>|\bfor\s*\([^)]*\bof\b|padStart|Object\.values|rmSync/.test(kaynak));
// Raunen'in DTW yolu taşınmadı (-nfa vermiyor, t_dtw okumuyor). Suflo'nun kendi DTW'si (3.2 adım 5)
// t_dtw'yi yalnız dtwZamani()'nda okur ve "Raunen:" işareti taşımaz
var kodYorumsuz = kaynak.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
var dtwBlok = kaynak.slice(kaynak.indexOf("function dtwZamani"), kaynak.indexOf("\n  }\n", kaynak.indexOf("function dtwZamani")));
ok("DTW Suflo'nun kendi kodu: t_dtw dtwZamani'nda okunur, dtwUygula / dtwZamani Raunen işareti taşımaz",
  /t_dtw/.test(kodYorumsuz) && /sayi\(tok\.t_dtw\)/.test(dtwBlok) && !/\/\/ Raunen: [^\n]*\n\s*function dtw/.test(kaynak) && !/Raunen: [^\n]*dtw/i.test(kaynak));
var notice = fs.readFileSync(path.join(__dirname, "..", "THIRD_PARTY_NOTICES.md"), "utf8");
ok("THIRD_PARTY_NOTICES: Raunen girdisi (commit, telif, dosya)", /Raunen/.test(notice) && /063df7b/.test(notice) && /Copyright \(c\) 2026 Jacob Szczepaniak/.test(notice) && /js\/whisper-words\.js/.test(notice));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
