// Suflo testi: js/retakes.js — tekrar çekimler, yarım başlangıçlar, take politikası, senaryo, AI cevabı
var path = require("path");
var TC = require(path.join(__dirname, "..", "js", "textcut.js"));
var R = require(path.join(__dirname, "..", "js", "retakes.js"));

var gecen = 0, toplam = 0;
function chk(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : ""));
}

/*
 * Cümle listesinden kelime dizisi üret. Her kelime 0.3 sn, kelime arası 0.1 sn;
 * cümleler arası opts.ara sn (varsayılan 1.0 — duraksama bölmesinin üstünde).
 * Bir cümle { t: "metin", ara: 45, conf: 0.5 } da olabilir.
 */
function kur(cumleler, opts) {
  opts = opts || {};
  var words = [], t = opts.bas || 0;
  cumleler.forEach(function (c, ci) {
    if (typeof c === "string") c = { t: c };
    if (ci > 0) t += (c.ara != null ? c.ara : (opts.ara != null ? opts.ara : 1.0));
    c.t.split(/\s+/).filter(Boolean).forEach(function (s, i) {
      if (i > 0) t += 0.1;
      words.push({ start: t, end: t + 0.3, text: s, confidence: c.conf != null ? c.conf : 0.9 });
      t += 0.3;
    });
  });
  return words;
}
function grupMetinleri(res) {
  return res.groups.map(function (g) { return g.takes.map(function (id) { return res.sents[id].text; }); });
}

/* ---- tekrar çekim ×3 ve politikalar ---- */
var uc = kur([
  "Bugün size Premiere'de altyazı eklemeyi ııı göstereceğim",
  "Bugün size Premiere'de altyazı eklemeyi göstereceğim,",
  "Bugün size Premiere'de altyazı eklemeyi göstereceğim çok kolay.",
  "Hadi başlayalım."
]);
// ilk iki çekimin sonunda nokta yok ama noktalama kipindeyiz (sonda virgül/nokta var): duraksama böler
var r1 = R.detect(uc, { lang: "tr", policy: "son" });
chk("tekrar ×3 tek grup", r1.groups.length === 1 && r1.groups[0].takes.length === 3, JSON.stringify(grupMetinleri(r1)));
chk("'son' 3. çekimi tutar", r1.groups[0] && r1.groups[0].keep === r1.groups[0].takes[2]);
chk("dice ≥0.9: yüksek güven, önceden işaretli", r1.groups[0] && r1.groups[0].conf === "yuksek" && r1.groups[0].on === true);
var r1u = R.detect(uc, { lang: "tr", policy: "uzun" });
chk("'uzun' en çok sözcüklü çekimi tutar", r1u.groups[0].keep === r1u.groups[0].takes[2]);
var uc2 = kur([
  "Bugün size Premiere'de altyazı eklemeyi ııı göstereceğim",
  "Bugün size Premiere'de altyazı eklemeyi göstereceğim.",
  "Bugün size eee Premiere'de altyazı eklemeyi göstereceğim"
]);
var r1a = R.detect(uc2, { lang: "tr", policy: "akici" });
chk("'akici' noktalı ve dolgusuz çekimi tutar", r1a.groups.length === 1 && r1a.groups[0].keep === r1a.groups[0].takes[1], JSON.stringify(r1a.groups[0] && r1a.groups[0].keep));
var r1s = R.detect(uc2, { lang: "tr", policy: "son" });
chk("'son' (eşit uzunluk) sonuncuyu tutar", r1s.groups[0].keep === r1s.groups[0].takes[2]);

/* ---- yarım çekim ---- */
var yarim = kur([
  "Bugün size Premiere'de altyazı…",
  "Bugün size Premiere'de altyazı eklemeyi göstereceğim."
]);
var r2 = R.detect(yarim, { lang: "tr", policy: "uzun" });
var s2 = r2.sents;
chk("yarım çekim + tam cümle grupta", r2.groups.length === 1 && r2.groups[0].takes.length === 2, JSON.stringify(grupMetinleri(r2)));
chk("pref ≥0.8", R.sim(s2[0].tok, s2[1].tok).pref >= 0.8, R.sim(s2[0].tok, s2[1].tok).pref);
chk("yarım çekim yüksek güven", r2.groups[0] && r2.groups[0].conf === "yuksek");
var yarimSonda = kur(["Bugün size Premiere'de altyazı eklemeyi göstereceğim.", "Bugün size Premiere'de altyazı eklemeyi…"]);
var r2b = R.detect(yarimSonda, { lang: "tr", policy: "son" });
chk("yarım çekim her politikada atılır (sonda olsa da)", r2b.groups.length === 1 && r2b.groups[0].keep === r2b.groups[0].takes[0], JSON.stringify(grupMetinleri(r2b)));
["uzun", "akici"].forEach(function (p) {
  var rr = R.detect(yarimSonda, { lang: "tr", policy: p });
  chk("yarım çekim atılır: " + p, rr.groups[0] && rr.groups[0].keep === rr.groups[0].takes[0]);
});

/* ---- bulut tarzı (noktalamasız) yarım başlangıç ---- */
var bulut = kur([{ t: "Şimdi size" }, { t: "Şimdi size Premiere'de altyazı nasıl eklenir onu göstereceğim", ara: 0.9 }, { t: "ilk adım klibi seçmek", ara: 1.2 }]);
var r3 = R.detect(bulut, { lang: "tr" });
chk("noktalamasız: cümleler yine duraksamayla bölünür", r3.sents.length === 3 && r3.sents.punct === false, r3.sents.map(function (s) { return s.text; }).join(" | "));
chk("noktalamasız yarım başlangıç bulunur, orta güven, işaretsiz", r3.groups.length === 1 && r3.groups[0].kind === "falsestart" && r3.groups[0].conf === "orta" && r3.groups[0].on === false, JSON.stringify(r3.groups));
var lb3 = R.labelWords(bulut, r3);
chk("işaretsiz grup kelime etiketi almaz", lb3.every(function (x) { return x === null; }));
r3.groups[0].on = true;
var lb3b = R.labelWords(bulut, r3);
chk("açılınca yarım başlangıç 'falsestart', tutulan 'kept'", lb3b[0] === "falsestart" && lb3b[1] === "falsestart" && lb3b[2] === "kept", JSON.stringify(lb3b.slice(0, 4)));

/* ---- cümle içi yeniden başlama ---- */
var ici = kur(["bu video bu videoda size her şeyi anlatacağım."], {});
var k4 = TC.classify(ici, { lang: "tr", phraseRepeats: true });
chk("'bu video bu videoda' ilk kopya falsestart", k4[0] === "falsestart" && k4[1] === "falsestart" && k4[2] === null && k4[3] === null, JSON.stringify(k4));
var ik = kur(["yavaş yavaş yürüdük eve."]);
var k5 = TC.classify(ik, { lang: "tr", phraseRepeats: true });
chk("ikileme 'yavaş yavaş' işaretlenmez", k5.every(function (x) { return x === null; }), JSON.stringify(k5));
var bb = kur(["ben ben geldim eve."]);
var k6 = TC.classify(bb, { lang: "tr", phraseRepeats: true });
chk("'ben ben' textcut tekrarı, falsestart değil", k6[0] === "repeat" && k6.indexOf("falsestart") === -1, JSON.stringify(k6));
var r4 = R.detect(ik.concat(kur(["yavaş yavaş yürüdük eve ama yorulduk."], { bas: 40 })), { lang: "tr" });
chk("ikileme cümleleri 30 sn'den uzak: gruplanmaz", r4.groups.length === 0);

/* ---- NEGATİF: anafora, tarif adımları, uzak tekrarlar, araya giren cümleler ---- */
var anafora = kur(["Bu video için çok çalıştım.", "Bu video için uykusuz kaldım.", "Bu video için para harcadım."]);
chk("anafora gruplanmaz", R.detect(anafora, { lang: "tr" }).groups.length === 0, JSON.stringify(grupMetinleri(R.detect(anafora, { lang: "tr" }))));
var tarif = kur(["Bir yemek kaşığı tuz ekliyoruz.", "Bir yemek kaşığı şeker ekliyoruz."]);
chk("tarif adımları gruplanmaz", R.detect(tarif, { lang: "tr" }).groups.length === 0, JSON.stringify(grupMetinleri(R.detect(tarif, { lang: "tr" }))));
var uzak = kur([{ t: "Abone olmayı unutmayın arkadaşlar." }, { t: "Abone olmayı unutmayın arkadaşlar.", ara: 45 }]);
chk("aynı cümle 45 sn arayla gruplanmaz", R.detect(uzak, { lang: "tr" }).groups.length === 0);
var acilis = kur(["Şimdi size bir sırrımı anlatacağım.", "Kamerayı geçen yıl aldım.", "Işık için iki lamba kullanıyorum.",
  "Mikrofon olarak yaka mikrofonu tercih ettim.", "Şimdi size bir sırrımı anlatacağım."]);
chk("araya 3+ cümle giren açılışlar gruplanmaz", R.detect(acilis, { lang: "tr" }).groups.length === 0);

/* ---- kökler ve işaret sözleri ---- */
chk("İstanbul'da = istanbulda", R.tokOf("İstanbul'da", "tr") === R.tokOf("istanbulda", "tr") && R.tokEq(R.tokOf("İstanbul'da", "tr"), "istanbulda"), R.tokOf("İstanbul'da", "tr"));
chk("tokEq: kamera/kamerayı, video/videoda; bu/bunu değil", R.tokEq("kamera", "kamerayı") && R.tokEq("video", "videoda") && !R.tokEq("bu", "bunu"));
var cue = kur(["Bugün size en sevdiğim üç uygulamayı göstereceğim.", "pardon.", "Bugün size en sevdiğim üç uygulamayı göstereceğim."]);
var r5 = R.detect(cue, { lang: "tr" });
chk("işaret sözü ('pardon') atılanlara katılır", r5.groups.length === 1 && r5.groups[0].cues.length === 1 && r5.groups[0].dropped.indexOf(1) !== -1, JSON.stringify(r5.groups));
var cue2 = kur(["Bugün size en sevdiğim üç uygulamayı göstereceğim.", "dur dur baştan alıyorum.", "Bugün size sevdiğim üç uygulamayı anlatacağım ve göstereceğim."]);
var r5b = R.detect(cue2, { lang: "tr" });
chk("işaret sözü güveni yükseltir", r5b.groups.length === 1 && r5b.groups[0].conf === "yuksek", JSON.stringify(r5b.groups.map(function (g) { return [g.conf, g.cues]; })));
var normal = kur(["Bir daha asla bu hatayı yapmayacağım dedim kendime."]);
chk("cümle içindeki 'bir daha' işaret değil", R.detect(normal, { lang: "tr" }).groups.length === 0);

/* ---- senaryo hizalaması ---- */
var senaryo = "Merhaba arkadaşlar, bugün kahve demlemeyi öğreneceğiz.\nÖnce suyu doksan dereceye ısıtıyoruz.\nSonra kahveyi orta kalınlıkta öğütüyoruz.";
var cekimler = kur([
  "Merhaba arkadaşlar bugün kahve demlemeyi öğreneceğiz.",
  "Önce suyu doksan ııı derece.",
  "Önce suyu seksen dereceye ısıtıyoruz.",
  "Önce suyu doksan dereceye ısıtıyoruz.",
  "Bu arada kanalıma abone olun.",
  "Sonra kahveyi orta kalınlıkta öğütüyoruz."
]);
var sents6 = R.sentences(cekimler, { lang: "tr" });
var al = R.alignScript(senaryo, sents6, { lang: "tr" });
chk("senaryo: 3 çekimli satırda en iyisi tutulur", al.lines.length === 1 && al.lines[0].takes.length === 3 && al.lines[0].keep === 3, JSON.stringify(al.lines));
chk("senaryo: 1:1 satırlara dokunulmaz", al.lines.every(function (l) { return l.line === 1; }));
chk("senaryo: senaryo dışı cümle işaretlenir", al.offscript.length === 1 && al.offscript[0] === 4, JSON.stringify(al.offscript));
chk("senaryo: monoton", al.lineOf.filter(function (x) { return x >= 0; }).every(function (x, i, a) { return i === 0 || x >= a[i - 1]; }), JSON.stringify(al.lineOf));
var r6 = R.detect(cekimler, { lang: "tr", script: senaryo, policy: "son" });
var g6 = r6.groups.filter(function (g) { return g.takes.indexOf(3) !== -1; })[0];
chk("detect + senaryo: senaryoya en yakın çekim tutulur", g6 && g6.keep === 3, JSON.stringify(r6.groups));
chk("detect + senaryo: senaryo dışı listelenir ama işaretlenmez", r6.offscript.indexOf(4) !== -1 && R.labelWords(cekimler, r6).slice(r6.sents[4].a, r6.sents[4].b + 1).every(function (x) { return x === null; }));
// performans: 300 satır × 600 cümle < 1 sn
var kelimeHavuzu = ["kamera", "ışık", "mikrofon", "kurgu", "renk", "ses", "müzik", "geçiş", "yazı", "efekt", "video", "klip", "sahne", "çekim", "plan", "açı", "lens", "odak", "pozlama", "beyaz"];
var satirlar = [], ses = [];
for (var li = 0; li < 300; li++) {
  var sat = [];
  for (var wi = 0; wi < 8; wi++) sat.push(kelimeHavuzu[(li * 7 + wi * 3) % kelimeHavuzu.length] + (li % 5));
  satirlar.push(sat.join(" ") + ".");
  ses.push(sat.join(" ") + ".");
  ses.push(sat.join(" ") + ".");
}
var buyuk = R.sentences(kur(ses), { lang: "tr" });
var t0 = Date.now();
var alB = R.alignScript(satirlar.join("\n"), buyuk, { lang: "tr" });
var ms = Date.now() - t0;
chk("senaryo 300×600 < 1 sn", buyuk.length === 600 && ms < 1000 && alB.lineOf.length === 600, ms + " ms, " + buyuk.length + " cümle");

/* ---- AI cevabının doğrulaması ---- */
var aiSents = R.sentences(kur(["Bir.", "İki iki.", "Üç üç üç.", "Dört dört.", "Beş.", "Altı.", "Yedi.", "Sekiz.", "Dokuz.", "On."]), { lang: "tr" });
var chunk = { from: 0, to: 10 };
chk("parseLLM: geçerli grup", JSON.stringify(R.parseLLM('{"groups":[{"ids":[1,2],"keep":2}]}', chunk, aiSents)) === JSON.stringify([{ ids: [1, 2], keep: 2 }]));
chk("parseLLM: kod çiti soyulur", R.parseLLM('```json\n{"groups":[{"ids":[3,4],"keep":3}]}\n```', chunk, aiSents).length === 1);
chk("parseLLM: bilinmeyen kimlik reddedilir", R.parseLLM('{"groups":[{"ids":[8,12],"keep":8}]}', chunk, aiSents).length === 0);
chk("parseLLM: tek üyeli reddedilir", R.parseLLM('{"groups":[{"ids":[2],"keep":2}]}', chunk, aiSents).length === 0);
chk("parseLLM: çakışan ikinci grup reddedilir", R.parseLLM('{"groups":[{"ids":[1,2],"keep":2},{"ids":[2,3],"keep":3}]}', chunk, aiSents).length === 1);
chk("parseLLM: çok uzak (>6 cümle) reddedilir", R.parseLLM('{"groups":[{"ids":[0,7],"keep":7}]}', chunk, aiSents).length === 0);
chk("parseLLM: keep grupta değilse reddedilir", R.parseLLM('{"groups":[{"ids":[1,2],"keep":5}]}', chunk, aiSents).length === 0);
chk("parseLLM: ondalık / metin kimlik reddedilir", R.parseLLM('{"groups":[{"ids":[1.5,2],"keep":2},{"ids":["x",3],"keep":3}]}', chunk, aiSents).length === 0);
var atmadi = true;
["", "değil json", "null", "[]", "{\"groups\": 5}", "{\"groups\":[null, {\"ids\": null}]}", undefined].forEach(function (x) {
  try { if (R.parseLLM(x, chunk, aiSents).length !== 0) atmadi = false; } catch (e) { atmadi = false; }
});
chk("parseLLM: JSON olmayan girdide fırlatmaz, boş döner", atmadi);
var uzakAi = R.sentences(kur([{ t: "Bir iki üç." }, { t: "Dört beş altı.", ara: 40 }]), { lang: "tr" });
chk("parseLLM: 30 sn'den uzak grup reddedilir", R.parseLLM('{"groups":[{"ids":[0,1],"keep":1}]}', { from: 0, to: 2 }, uzakAi).length === 0);
// çakışmada sezgisel grup kazanır; AI'nın tek başına bulduğu grup "orta"
var r7 = R.detect(uc.concat(kur(["Kamerayı açıyoruz şimdi.", "Kamerayı da açalım hemen."], { bas: 20 })), {
  lang: "tr", llm: [{ ids: [0, 1], keep: 0 }, { ids: [4, 5], keep: 4 }]
});
var sez = r7.groups.filter(function (g) { return g.source === "heuristic"; })[0];
var ai = r7.groups.filter(function (g) { return g.source === "llm"; })[0];
chk("çakışmada sezgisel grup kazanır", sez && sez.takes.length === 3 && sez.keep === 2 && r7.groups.filter(function (g) { return g.takes.indexOf(0) !== -1; }).length === 1, JSON.stringify(r7.groups.map(function (g) { return [g.source, g.takes]; })));
chk("yalnız AI'nın bulduğu grup orta güven, AI'nın keep'i", ai && ai.conf === "orta" && ai.on === false && ai.keep === 4, JSON.stringify(ai));
chk("llmChunks: 60'lık, 5 örtüşmeli", JSON.stringify(R.llmChunks(130, 60, 5)) === JSON.stringify([{ from: 0, to: 60 }, { from: 55, to: 115 }, { from: 110, to: 130 }]));
var istek = R.llmRequest(aiSents, chunk, "m");
chk("llmRequest: sıcaklık 0, json_object", istek.temperature === 0 && istek.response_format.type === "json_object" && /0: Bir\./.test(istek.messages[1].content));

/* ---- labelWords + buildCuts ---- */
var klip = kur(["Merhaba ben Samet.", "Bugün size kamerayı nasıl ayarladığımı ııı anlatacağım.", "Bugün size kamerayı nasıl ayarladığımı anlatacağım.", "Başlayalım."], { bas: 10 });
var r8 = R.detect(klip, { lang: "tr", policy: "son" });
var et = R.labelWords(klip, r8);
var oneri = TC.classify(klip, { lang: "tr" });
var removed = klip.map(function (w, i) { return et[i] === "retake" || et[i] === "falsestart" || !!oneri[i]; });
var clipStart = 9.5, clipEnd = klip[klip.length - 1].end + 0.5;
var cuts = TC.buildCuts(klip, removed, { clipStart: clipStart, clipEnd: clipEnd });
var tutulan = r8.sents[r8.groups[0].keep];
chk("labelWords: atılan çekim 'retake'", r8.groups.length === 1 && et[r8.sents[1].a] === "retake" && et[tutulan.a] === "kept", JSON.stringify(et));
chk("buildCuts: çakışmasız ve klip içinde", cuts.length > 0 && cuts.every(function (c, i) { return c.start >= clipStart && c.end <= clipEnd && c.end > c.start && (i === 0 || c.start > cuts[i - 1].end); }), JSON.stringify(cuts));
chk("buildCuts: tutulan çekime asla girmez", cuts.every(function (c) {
  for (var k = tutulan.a; k <= tutulan.b; k++) { if (c.start < klip[k].end && c.end > klip[k].start) return false; }
  return true;
}));
var wi2 = R.wordIndex(r8);
chk("wordIndex: tutulan/atılan rolleri", wi2[tutulan.a].rol === "keep" && wi2[r8.sents[1].a].rol === "drop");
chk("droppedCount", R.droppedCount(r8) === 1);
R.setKeep(r8, r8.groups[0], r8.groups[0].takes[0]);
var et2 = R.labelWords(klip, r8);
chk("setKeep: tutulan çekim değişir, etiketler yer değiştirir", et2[r8.sents[1].a] === "kept" && et2[r8.sents[2].a] === "retake");
chk("boş girdi güvenli", R.detect([], {}).groups.length === 0 && R.labelWords([], null).length === 0);

// ES5 / CEF 74 güvenliği
var kaynak = require("fs").readFileSync(path.join(__dirname, "..", "js", "retakes.js"), "utf8");
chk("retakes.js CEF 74 uyumlu (?. ?? replaceAll .at( let const => yok)", !/\?\.[a-zA-Z_(\[]|\?\?|replaceAll|\.at\(|^\s*(let|const)\s|=>/m.test(kaynak.replace(/"[^"\n]*"/g, '""')));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
