// Suflo testi: Podcast Modu saf modülü (js/multicam.js) ve stil motorunun konuşmacı renkleri
var path = require("path");
var M = require(path.join(__dirname, "..", "js", "multicam.js"));
var SE = require(path.join(__dirname, "..", "js", "style-engine.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }
function yakin(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }
function js(x) { return JSON.stringify(x); }

/* ---------- energyFromPcm ---------- */
function sinus(genlik, frek, sr, sn) {
  var n = Math.round(sr * sn), a = new Int16Array(n);
  for (var i = 0; i < n; i++) a[i] = Math.round(genlik * 32767 * Math.sin(2 * Math.PI * frek * i / sr));
  return a;
}
var e1 = M.energyFromPcm(sinus(0.5, 440, 8000, 1), 8000, 0.1);
ok("energyFromPcm: 0.5 genlikli sinüs ≈ −9.03 dBFS, pencere başına (10 pencere)", e1.length === 10 && e1.every(function (v) { return yakin(v, -9.03, 0.1); }), js(e1));
var e2 = M.energyFromPcm(sinus(1, 200, 8000, 0.5), 8000, 0.1);
ok("energyFromPcm: tam ölçek sinüs ≈ −3.01 dBFS", e2.every(function (v) { return yakin(v, -3.01, 0.1); }), js(e2));
var e3 = M.energyFromPcm(new Int16Array(800), 8000, 0.1);
ok("energyFromPcm: sessizlik tabana (FLOOR) kırpılır", e3.length === 1 && e3[0] === M.FLOOR, js(e3));
var e4 = M.energyFromPcm([1, -1, 1, -1], 8000, 0.1);
ok("energyFromPcm: çok kısık sinyal de tabanın altına inmez", e4[0] >= M.FLOOR && e4[0] < -80, js(e4));
ok("energyFromPcm: yarım son pencere de sayılır, boş girdi boş dizi", M.energyFromPcm(new Int16Array(1200), 8000, 0.1).length === 2 && M.energyFromPcm(null, 8000, 0.1).length === 0);

/* ---------- sentetik podcast ---------- */
// konusma: [[konusmaci (-1 sessiz, "x" capraz), sn], ...] → mikrofon başına dBFS serisi (100 ms)
var tohum = 7;
function rnd() { tohum = (tohum * 16807) % 2147483647; return (tohum / 2147483647) - 0.5; }
function seriler(konusma, kisi, o) {
  o = o || {};
  var kazanc = o.kazanc || [], sizinti = o.sizinti || [];
  var s = []; for (var k = 0; k < kisi; k++) s.push([]);
  konusma.forEach(function (p) {
    for (var w = 0; w < Math.round(p[1] * 10); w++) {
      for (var m = 0; m < kisi; m++) {
        var taban = -70 + rnd() * 2, v = taban;
        var konusanlar = p[0] === "x" ? [0, 1] : (p[0] >= 0 ? [p[0]] : []);
        konusanlar.forEach(function (sp) {
          var ses = -18 + rnd() * 3 + (kazanc[sp] || 0);
          if (sp !== m) ses += (sizinti[m] !== undefined ? sizinti[m] : -12) - (kazanc[sp] || 0) + (kazanc[m] || 0);
          v = Math.max(v, ses);
        });
        s[m].push(Math.round(v * 100) / 100);
      }
    }
  });
  return s;
}
function plani(konusma, kisi, o, popts) {
  var n = M.normalizeSeries(seriler(konusma, kisi, o));
  var act = M.activity(n.levels, { switchMarginDb: 6, gateDb: -25 });
  return { n: n, act: act, plan: M.buildPlan(act, popts || {}) };
}
function ozet(plan) { return plan.map(function (s) { return [s.start, s.end, s.cam]; }); }
function bosluksuz(plan, sure) {
  if (!plan.length || plan[0].start !== 0 || !yakin(plan[plan.length - 1].end, sure)) return false;
  for (var i = 1; i < plan.length; i++) if (!yakin(plan[i].start, plan[i - 1].end) || plan[i].cam === plan[i - 1].cam) return false;
  return true;
}

/* 2 konuşmacı, −12 / −15 dB sızıntı */
var iki = [[0, 6], [1, 5], [0, 4], [1, 7]];
var p1 = plani(iki, 2, { sizinti: [-12, -15] });
ok("2 konuşmacı + sızıntı: plan birebir doğru", js(ozet(p1.plan)) === js([[0, 6, 0], [6, 11, 1], [11, 15, 0], [15, 22, 1]]), js(ozet(p1.plan)));
ok("2 konuşmacı: sızıntı hiçbir pencerede başka konuşmacı sayılmaz", p1.act.every(function (a, w) {
  var t = w / 10, beklenen = t < 6 ? 0 : t < 11 ? 1 : t < 15 ? 0 : 1;
  return a === beklenen;
}));
var p2 = plani(iki, 2, { sizinti: [-12, -15], kazanc: [0, -12] });
ok("12 dB kısık konuşmacı normalize sonrası yine bulunur", js(ozet(p2.plan)) === js(ozet(p1.plan)), js(ozet(p2.plan)) + " p95=" + js(p2.n.p95));
var sessizMik = M.normalizeSeries([seriler(iki, 2)[0], iki.map(function () { return -80; })]);
ok("p95'i −55 dBFS altında kalan mikrofon 'sessiz' listesinde", sessizMik.silent.length === 1 && sessizMik.silent[0] === 1, js(sessizMik.silent));

/* 3 konuşmacı sırayla */
var uc = [[0, 4], [1, 4], [2, 4], [0, 3], [1, 3], [2, 5]];
var p3 = plani(uc, 3, {});
ok("3 konuşmacı sırayla: her konuşmacıya kendi anında geçer", js(ozet(p3.plan)) === js([[0, 4, 0], [4, 8, 1], [8, 12, 2], [12, 15, 0], [15, 18, 1], [18, 23, 2]]), js(ozet(p3.plan)));
ok("plan [0, süre]'yi boşluksuz kaplar", bosluksuz(p3.plan, 23));

/* çapraz konuşma */
var capraz = [[0, 5], ["x", 4], [1, 5]];
var p4 = plani(capraz, 2, {}, { wideCam: true, wideOnCrosstalk: true });
ok("çapraz konuşma: geniş plan varsa ona geçer", js(ozet(p4.plan)) === js([[0, 5, 0], [5, 9, M.WIDE], [9, 14, 1]]), js(ozet(p4.plan)));
ok("çapraz konuşma activity'de −2", p4.act.slice(52, 88).every(function (a) { return a === M.CROSSTALK; }));
var p5 = plani(capraz, 2, {}, { wideCam: false });
ok("çapraz konuşma: geniş plan yoksa mevcut kamera tutulur", js(ozet(p5.plan)) === js([[0, 9, 0], [9, 14, 1]]), js(ozet(p5.plan)));
var p5b = plani(capraz, 2, {}, { wideCam: true, wideOnCrosstalk: false });
ok("'Çapraz konuşmada geniş plan' kapalıyken de tutar", js(ozet(p5b.plan)) === js([[0, 9, 0], [9, 14, 1]]), js(ozet(p5b.plan)));

/* sessizlik */
var p6 = plani([[0, 4], [-1, 6], [0, 2], [1, 4]], 2, {});
ok("sessizlik kamerayı tutar", js(ozet(p6.plan)) === js([[0, 12, 0], [12, 16, 1]]), js(ozet(p6.plan)));
var p6b = plani([[0, 4], [-1, 3], [1, 4]], 2, {});
ok("sessizlikten sonra yeni konuşan, konuşmaya başladığı anda alınır", js(ozet(p6b.plan)) === js([[0, 7, 0], [7, 11, 1]]), js(ozet(p6b.plan)));

/* minShot / hold */
var p7 = plani([[0, 5], [1, 0.8], [0, 5]], 2, {});
ok("hold 400 ms aşılınca 0.8 sn'lik araya girişe geçer; tepki planı minShot (2 sn) kadar sürer", js(ozet(p7.plan)) === js([[0, 5, 0], [5, 7, 1], [7, 10.8, 0]]), js(ozet(p7.plan)));
var p7b = plani([[0, 5], [1, 1.2], [0, 5]], 2, {}, { minShot: 2 });
ok("minShot: 1.2 sn'lik kısa plan birleşir (2 sn altı parça kalmaz)", p7b.plan.every(function (s) { return s.end - s.start >= 2 - 1e-6; }) && bosluksuz(p7b.plan, 11.2), js(ozet(p7b.plan)));
var p7c = plani([[0, 0.5], [1, 3]], 2, {});
ok("minShot: plan başındaki 0.5 sn'lik parça sonrakine katılır", js(ozet(p7c.plan)) === js([[0, 3.5, 1]]), js(ozet(p7c.plan)));
var flap = [[0, 3]];
for (var f = 0; f < 20; f++) flap.push([f % 2 ? 0 : 1, 0.2]);
flap.push([0, 3]);
var p8 = plani(flap, 2, {});
ok("hold: 200 ms'lik gidip gelme kamera değiştirmez", p8.plan.length === 1 && p8.plan[0].cam === 0, js(ozet(p8.plan)));
var p8b = M.buildPlan(M.activity(M.normalizeSeries(seriler([[0, 3], [1, 0.3], [-1, 4], [0, 3]], 2)).levels), {});
ok("kısa bir 'evet' ve ardından gelen uzun sessizlik geçiş yapmaz", p8b.length === 1 && p8b[0].cam === 0, js(ozet(p8b)));
var p8c = M.buildPlan(M.activity(M.normalizeSeries(seriler([[0, 3], [1, 1], [0, 3]], 2)).levels), { holdMs: 1500 });
ok("hold 1500 ms: 1 sn'lik konuşma geçiş yapmaz", p8c.length === 1, js(ozet(p8c)));

/* maxShot ve widePeriodic */
var p9 = plani([[0, 30], [1, 4]], 2, {}, { wideCam: true, maxShot: 12, wideDur: 2.5 });
ok("maxShot: 12 sn'yi aşan tek kişilik konuşmaya geniş plan girer ve geri döner",
  p9.plan.length >= 3 && p9.plan[0].cam === 0 && yakin(p9.plan[0].end, 12) && p9.plan[1].cam === M.WIDE && yakin(p9.plan[1].end - p9.plan[1].start, 2.5) && p9.plan[2].cam === 0, js(ozet(p9.plan)));
ok("maxShot: hiçbir konuşmacı planı maxShot'ı aşmaz", p9.plan.every(function (s) { return s.cam === M.WIDE || s.end - s.start <= 12 + 1e-6; }) && bosluksuz(p9.plan, 34));
var p9b = plani([[0, 30], [1, 4]], 2, {}, { wideCam: false, maxShot: 12 });
ok("maxShot: geniş plan yoksa tutar", js(ozet(p9b.plan)) === js([[0, 30, 0], [30, 34, 1]]), js(ozet(p9b.plan)));
var az = M.normalizeSeries(seriler([[0, 20], [1, 0.6]], 2));
ok("sahibi %5'ten az konuşan mikrofon: referans sızıntıya değil konuşmaya oturur", az.ref[1] > az.p95[1] + 6 && M.activity(az.levels).slice(0, 200).every(function (a) { return a === 0; }), js(az.ref) + " " + js(az.p95));
var p10 = plani([[0, 8], [1, 8], [0, 8], [1, 8], [0, 8]], 2, {}, { wideCam: true, maxShot: 60, widePeriodic: 20, wideDur: 2 });
var genisler = p10.plan.filter(function (s) { return s.cam === M.WIDE; });
ok("widePeriodic 20 sn: 40 sn'lik konuşmada geniş plan aralıklı girer", genisler.length >= 1 && genisler[0].start >= 20 - 1e-6 && genisler[0].start < 26 && bosluksuz(p10.plan, 40), js(ozet(p10.plan)));
ok("widePeriodic: geniş planlar arası ≥ 20 sn", genisler.every(function (g, i) { return i === 0 || g.start - genisler[i - 1].end >= 20 - 1e-6; }));

/* boşluksuz kaplama: rastgele etkinlik */
var rast = [];
for (var r = 0; r < 3000; r++) { var x = rnd(); rast.push(x < -0.3 ? -1 : x < -0.25 ? -2 : x < 0.1 ? 0 : x < 0.35 ? 1 : 2); }
var pr = M.buildPlan(rast, { wideCam: true, widePeriodic: 20 });
ok("rastgele etkinlik: plan boşluksuz, her parça ≥ minShot", bosluksuz(pr, 300) && pr.every(function (s) { return s.end - s.start >= 2 - 1e-6; }), pr.length);
ok("boş etkinlik: boş plan; süre verilirse tek parça", M.buildPlan([], {}).length === 0 && js(ozet(M.buildPlan([], { duration: 5 }))) === js([[0, 5, 0]]));

/* yardımcılar */
var plan = [{ start: 0, end: 4, cam: 0 }, { start: 4, end: 8, cam: 1 }, { start: 8, end: 10, cam: M.WIDE }, { start: 10, end: 14, cam: 0 }, { start: 14, end: 20, cam: 1 }];
ok("switchTimesForCam: yalnız o kameranın açılış / kapanışları", js(M.switchTimesForCam(plan, 0)) === js([4, 10, 14]) && js(M.switchTimesForCam(plan, 1)) === js([4, 8, 14]) && js(M.switchTimesForCam(plan, M.WIDE)) === js([8, 10]));
ok("camAt: ikili arama, sınırlar ve uçlar", M.camAt(plan, 0) === 0 && M.camAt(plan, 3.99) === 0 && M.camAt(plan, 4) === 1 && M.camAt(plan, 9) === M.WIDE && M.camAt(plan, 19.9) === 1 && M.camAt(plan, 99) === 1 && M.camAt(plan, -1) === 0 && M.camAt([], 1) === null);
var st = M.planStats(plan);
ok("planStats: geçiş sayısı ve paylar", st.switches === 4 && yakin(st.share[0], 0.4) && yakin(st.share[1], 0.5) && yakin(st.share[M.WIDE], 0.1) && st.warn === false, js(st));
var cok = []; for (var c = 0; c < 402; c++) cok.push({ start: c, end: c + 1, cam: c % 2 });
ok("planStats: 400 geçişin üstünde uyarı", M.planStats(cok).warn === true && M.planStats(cok.slice(0, 401)).warn === false);
var src = { act: [0, 0, 0, 1, 1, -1, -1, 1, 1, 1], win: 0.1 };
ok("speakerFor: aralıktaki çoğunluk", M.speakerFor(src, 0, 0.3) === 0 && M.speakerFor(src, 0.3, 1.0) === 1 && M.speakerFor(src, 0.5, 0.7) === -1 && M.speakerFor(src, 5, 6) === -1);
ok("speakerFor: eşitlikte ortadaki konuşmacı", M.speakerFor({ act: [0, 0, 1, 1], win: 0.1 }, 0, 0.4) === 1 && M.speakerFor({ act: [1, 1, 0, 0, 0], win: 0.1 }, 0, 0.5) === 0);
ok("chunk: 40'lık parçalar", js(M.chunk([1, 2, 3, 4, 5], 2)) === js([[1, 2], [3, 4], [5]]) && M.chunk([], 40).length === 0);
var hp = M.hostPlan(plan, [1, 2], 3);
ok("hostPlan: kamera katmanına çevrilir, kesimler yalnız kendi geçişlerinde", js(hp.plan.map(function (s) { return s.t; })) === js([1, 2, 3, 1, 2]) &&
  js(hp.cuts.filter(function (c) { return c.track === 1; }).map(function (c) { return c.t; })) === js([4, 10, 14]) &&
  js(hp.cuts.filter(function (c) { return c.track === 3; }).map(function (c) { return c.t; })) === js([8, 10]) && js(hp.tracks) === js([1, 2, 3]), js(hp));
var hp2 = M.hostPlan(plan, [1, 1], -1);
ok("hostPlan: aynı kamerayı paylaşan konuşmacılar birleşir", hp2.plan.length >= 1 && hp2.cuts.every(function (c) { return c.track === 1 || c.track === -1; }), js(hp2));

/* ---------- stil motoru: konuşmacı renkleri ---------- */
var cues = [
  { start: 0, end: 1.2, text: "merhaba bugün podcast", speaker: 0 },
  { start: 1.2, end: 2.4, text: "evet hoş geldin", speaker: 1 },
  { start: 2.4, end: 3.6, text: "konumuz *yapay zekâ*", speaker: 0 }
];
var dusuk = cues.map(function (c) { return { start: c.start, end: c.end, text: c.text }; });
var hepsiAyni = true, renkliHepsi = true, grupKarisik = [];
SE.list().forEach(function (pr2) {
  ["lines", "words"].forEach(function (kind) {
    var a = SE.compile({ styleId: pr2.id, cues: dusuk, cueKind: kind, width: 1920, height: 1080 }).ass;
    var b = SE.compile({ styleId: pr2.id, cues: cues, cueKind: kind, width: 1920, height: 1080 }).ass;
    var c = SE.compile({ styleId: pr2.id, cues: cues, cueKind: kind, width: 1920, height: 1080, speakerColors: [] }).ass;
    var d = SE.compile({ styleId: pr2.id, cues: cues, cueKind: kind, width: 1920, height: 1080, speakerColors: ["yanlis", null] }).ass;
    if (a !== b || a !== c || a !== d) hepsiAyni = false;
    var r = SE.compile({ styleId: pr2.id, cues: cues, cueKind: kind, width: 1920, height: 1080, speakerColors: ["#ff0000", "#00ff00"] }).ass;
    var satirlar = r.split("\n").filter(function (l) { return /^Dialogue:/.test(l); });
    satirlar.forEach(function (l) {
      var bas = Number(l.split(",")[1].split(":").reduce(function (x, y) { return x * 60 + Number(y); }, 0));
      var beklenen = bas < 1.2 - 0.01 ? "&H000000FF" : bas < 2.4 - 0.01 ? "&H0000FF00" : "&H000000FF";
      var metin = l.split(",,0,0,0,,")[1] || "";
      if (metin.indexOf("{\\1c" + beklenen + "}") !== 0) renkliHepsi = false;
      // bir kart iki konuşmacının sözünü taşımaz
      if (/merhaba|bugün|podcast/.test(metin) && /evet|hoş|geldin/.test(metin)) grupKarisik.push(pr2.id + ":" + kind);
      if (/geldin/.test(metin) && /konumuz/.test(metin)) grupKarisik.push(pr2.id + ":" + kind);
    });
  });
});
ok("stil motoru: speakerColors yokken (ya da boş/geçersizken) çıktı bayt bayt aynı, tüm stillerde", hepsiAyni);
ok("stil motoru: her konuşmacı koşusu kendi \\1c rengiyle başlar", renkliHepsi);
ok("stil motoru: kelime grupları konuşmacı sınırını aşmaz", grupKarisik.length === 0, grupKarisik.join(","));
var kismi = SE.compile({ styleId: "viral", cues: cues, cueKind: "lines", speakerColors: [null, "#00ff00"] }).ass;
ok("stil motoru: rengi verilmeyen konuşmacı stilin kendi renginde (önek yok)", kismi.split("\n").filter(function (l) { return /^Dialogue/.test(l) && /merhaba/.test(l); }).every(function (l) { return l.indexOf(",,{\\1c&H0000FF00&}") < 0 && l.indexOf(",,{\\1c&H0000FF00}") < 0; }) &&
  /\{\\1c&H0000FF00\}/.test(kismi));
ok("splitToWords / lastWords konuşmacıyı taşır", SE.splitToWords([{ start: 0, end: 1, text: "a b", speaker: 2 }]).every(function (c) { return c.speaker === 2; }) &&
  SE.lastWords([{ start: 0, end: 1, text: "a b", speaker: 1 }])[0].speaker === 1 && SE.splitToWords([{ start: 0, end: 1, text: "a" }])[0].speaker === undefined);

/* ---------- eşleme önerisi, denetim, PCM yardımcıları ---------- */
var lay = { audio: [{ index: 0, name: "Audio 1", clipCount: 1 }, { index: 1, name: "Ayşe mik", clipCount: 1 }, { index: 2, name: "Müzik", clipCount: 0 }],
  video: [{ index: 0, clipCount: 1, first: 0, last: 600 }, { index: 1, clipCount: 1, first: 0, last: 600, hasMulticam: true }, { index: 2, clipCount: 1, first: 0, last: 600 },
    { index: 3, clipCount: 1, first: 0, last: 598 }, { index: 4, clipCount: 1, first: 0, last: 5 }] };
var sm = M.suggestMapping(lay);
ok("suggestMapping: katman sırasıyla, multicam katmanı atlanır, varsayılan ad harf", js(sm.speakers) === js([{ name: "A", mic: 0, cam: 0 }, { name: "Ayşe mik", mic: 1, cam: 2 }]) && sm.wide === 3, js(sm));
lay.video[3].last = 20;
ok("suggestMapping: kameralar kadar uzun olmayan katman (logo / yazı) geniş plan önerilmez", M.suggestMapping(lay).wide === -1);
ok("suggestMapping: 3 konuşmacı istenirse eksik mikrofon -1", M.suggestMapping(lay, 3).speakers[2].mic === -1);
ok("checkMapping: kendi mikrofonu, kamera, geniş plan çakışması", M.checkMapping({ speakers: [{ mic: 0, cam: 0 }, { mic: 0, cam: 1 }], wide: -1 }).kod === "mik_ayni" &&
  M.checkMapping({ speakers: [{ mic: 0, cam: 0 }, { mic: 1, cam: -1 }], wide: -1 }).kod === "kam_yok" &&
  M.checkMapping({ speakers: [{ mic: 0, cam: 0 }, { mic: -1, cam: 1 }], wide: -1 }).kod === "mik_yok" &&
  M.checkMapping({ speakers: [{ mic: 0, cam: 0 }, { mic: 1, cam: 1 }], wide: 1 }).kod === "genis_ayni" &&
  M.checkMapping({ speakers: [{ mic: 0, cam: 0 }], wide: -1 }).kod === "sayi" &&
  M.checkMapping({ speakers: [{ mic: 0, cam: 0 }, { mic: 1, cam: 0 }], wide: 2 }) === null);
ok("padSeries: eksik uç tabanla dolar", js(M.padSeries([[1, 2], [3]], 3)) === js([[1, 2, M.FLOOR], [3, M.FLOOR, M.FLOOR]]));
ok("bufferToInt16: küçük uçlu işaretli 16 bit", js(Array.from(M.bufferToInt16(Buffer.from([0xff, 0x7f, 0x00, 0x80, 0x01, 0x00, 0x07])))) === js([32767, -32768, 1]));
var pa = M.pcmArgs("C:\\Çekim ş\\a.wav", "o.pcm", { ss: 1.5, t: 10 });
ok("pcmArgs: 8 kHz mono s16le; ss / t girdiden önce", pa.join(" ").indexOf("-ss 1.5 -t 10 -i C:\\Çekim ş\\a.wav -vn -ac 1 -ar 8000 -f s16le") > 0 && pa[pa.length - 1] === "o.pcm", pa.join(" "));

/* ---------- panel: altyazı seçenekleri (konuşmacı renkleri kapalıyken aynen döner) ---------- */
var vm = require("vm"), fs = require("fs");
var kutular = { "pc-renk": { checked: false } };
var pctx = { window: { SufloMulticam: M, KApp: { ctx: function () { return { sequenceId: "s1" }; } } }, document: { getElementById: function (id) { return kutular[id] || null; } }, Object: Object, Number: Number };
vm.createContext(pctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "multicam-ui.js"), "utf8"), pctx);
var KM = pctx.window.KMulticam;
KM._kur({ seqId: "s1", seqIds: { s1: 1 }, duration: 1, act: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1], win: 0.1 }, { speakers: [{ name: "A", color: "#ff0000" }, { name: "B", color: "#00ff00" }], wide: -1 });
var giris = { cues: [{ start: 0, end: 0.4, text: "a" }, { start: 0.5, end: 1, text: "b" }], offset: 0 };
ok("panel: renk anahtarı kapalıyken seçenekler aynen döner", KM.captionOptions(giris) === giris && giris.speakerColors === undefined && giris.cues[0].speaker === undefined);
kutular["pc-renk"].checked = true;
var cikis = KM.captionOptions({ cues: giris.cues.concat([{ start: 9, end: 9.5, text: "c" }, { start: 0, end: 0.4, text: "d", speaker: -1 }]) });
ok("panel: açıkken cue'lara konuşmacı ve renkler eklenir; kapsam dışı / önceden atanmış cue'ya dokunulmaz", js(cikis.cues.map(function (c) { return c.speaker; })) === js([0, 1, undefined, -1]) &&
  js(cikis.speakerColors) === js(["#ff0000", "#00ff00"]) && giris.cues[0].speaker === undefined, js(cikis));
pctx.window.KApp.ctx = function () { return { sequenceId: "baska" }; };
ok("panel: başka bir sekans açıkken renkler uygulanmaz", KM.colorsEnabled() === false);

/* ---------- inceleme düzeltmeleri ---------- */
// az konuşan ama çalışan mikrofon (sürenin ~%3'ü konuşma, kalanı −70 dBFS taban): p95 tabanda, p99 konuşmada
var azKonusan = [];
for (var az = 0; az < 1000; az++) azKonusan.push(az % 33 === 0 ? -20 : -70);
ok("speechLevel: az konuşan mikrofonda konuşma seviyesi p99'dan (sessiz sayılmaz)", M.percentile(azKonusan, 95) < M.SESSIZ_P95 && M.speechLevel(azKonusan) > M.SESSIZ_P95 &&
  M.normalizeSeries([azKonusan]).silent.length === 0, M.speechLevel(azKonusan));
var gercekSessiz = []; for (az = 0; az < 1000; az++) gercekSessiz.push(-72 + (az % 3));
ok("speechLevel: gerçekten sessiz mikrofon hâlâ sessiz", M.speechLevel(gercekSessiz) < M.SESSIZ_P95 && M.normalizeSeries([gercekSessiz]).silent.length === 1);
ok("speakerFor near: net konuşmacısız aralık en yakın konuşmacıyı alır (önce geriye)", M.speakerFor({ act: src.act, win: 0.1, near: 3 }, 0.5, 0.7) === 1 &&
  M.speakerFor({ act: [0, 0, -2, -2, 1, 1], win: 0.1, near: 3 }, 0.2, 0.4) === 0 && M.speakerFor({ act: [-1, -1, -2, 1], win: 0.1, near: 3 }, 0, 0.2) === 1 &&
  M.speakerFor({ act: [-1, -1, -1], win: 0.1, near: 3 }, 0, 0.3) === -1 && M.speakerFor({ act: [0, -1, -1, -1, -1, -1], win: 0.1, near: 0.2 }, 0.4, 0.6) === -1);

// konuşmacı rengi stilin vurgu rengine yakınsa etkin kelime / *anahtar kelime* kaybolmasın
function vurguKaybolur(styleId, renk) {
  var o = SE.compile({ styleId: styleId, cueKind: "lines", cues: [{ start: 0, end: 1.5, text: "merhaba *dünya* nasılsın", speaker: 0 }], speakerColors: [renk, "#4fd1ff"] });
  var vurgu = SE.preset(styleId).style.vurguRenk;
  var c = function (h) { return SE.assColor(h).slice(4); };   // alfa dışı BGR
  // stilin vurgusu konuşmacı renginden farklıysa hiç görünmemeli; vurgu beyaza geçer
  return { stilVurgusu: vurgu.toLowerCase() !== renk.toLowerCase() && o.ass.indexOf(c(vurgu)) >= 0, beyaz: o.ass.indexOf("\\1c" + SE.assColor("#ffffff")) >= 0 };
}
var v1 = vurguKaybolur("viral", "#ffd23f"), v2 = vurguKaybolur("daktilo", "#7cf0a0");
ok("konuşmacı rengi ≈ vurgu rengi: vurgu stilin beyazına geçer (viral sarı, daktilo yeşil)", !v1.stilVurgusu && v1.beyaz && !v2.stilVurgusu && v2.beyaz, js([v1, v2]));
var v3 = vurguKaybolur("viral", "#4fd1ff");
ok("konuşmacı rengi vurgudan uzaksa stilin vurgusu korunur", v3.stilVurgusu, js(v3));
// her stilde konuşmacı rengi satır başı önekinden bağımsız görünür (Pop'ta kart dolgusu)
var renkCue = [{ start: 0, end: 0.5, text: "merhaba", speaker: 0 }, { start: 0.5, end: 1, text: "dünya", speaker: 0 }, { start: 1.2, end: 1.6, text: "nasılsın", speaker: 1 }, { start: 1.6, end: 2, text: "iyiyim", speaker: 1 }];
var gorunmez = SE.list().map(function (x) { return x.id || x; }).filter(function (id) {
  var a = SE.compile({ styleId: id, cueKind: "words", cues: renkCue, speakerColors: ["#ff0000", "#00ff00"] }).ass;
  a = a.split("{\\1c" + SE.assColor("#ff0000") + "}").join("").split("{\\1c" + SE.assColor("#00ff00") + "}").join("");
  return a.indexOf(SE.assColor("#ff0000").slice(4)) < 0 || a.indexOf(SE.assColor("#00ff00").slice(4)) < 0;
});
ok("konuşmacı rengi her stilde görünür (Pop dahil)", gorunmez.length === 0, gorunmez.join(","));

// panel: analiz çift tıkta tek kez başlar (meşgul ilk await'ten önce)
var ffSay = 0, ffBitir = null, durumMetni = "";
function sahteEl(id) {
  return { id: id, disabled: false, hidden: false, innerHTML: "", className: "", textContent: "", value: "", checked: false, style: {},
    querySelectorAll: function () { return []; }, querySelector: function () { return null; }, appendChild: function () {} };
}
var elems = {};
["pc-analiz", "pc-izler", "pc-esleme", "pc-genis", "pc-tara", "pc-ekle", "pc-cikar", "pc-sonuc", "pc-onizleme", "pc-ozet", "pc-uyari", "pc-progress"].forEach(function (id) { elems[id] = sahteEl(id); });
var dctx = { window: { SufloMulticam: M }, Object: Object, Number: Number, Array: Array, Error: Error, Promise: Promise, Math: Math, String: String,
  K: { findFfmpeg: function () { ffSay++; return new Promise(function (r) { ffBitir = r; }); }, log: function () {} },
  document: { getElementById: function (id) { if (id === "pc-durum") return { set className(v) {}, set textContent(v) { durumMetni = v; } }; return elems[id] || null; } } };
vm.createContext(dctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "multicam-ui.js"), "utf8"), dctx);
var KD = dctx.window.KMulticam;
KD._kur(null, { speakers: [{ name: "A", mic: 0, cam: 0, color: "#ff0000" }, { name: "B", mic: 1, cam: 1, color: "#00ff00" }], wide: -1 }, { seqId: "s1", audio: [], video: [] }, []);
var a1 = KD._analiz(), a2 = KD._analiz();
ok("panel: findFfmpeg sürerken ikinci tık yeni analiz başlatmaz, eşleme kilitli", ffSay === 1 && KD._mesgul() === true && elems["pc-analiz"].disabled && elems["pc-genis"].disabled && elems["pc-ekle"].disabled, ffSay);
ffBitir(null);
Promise.all([a1, a2]).then(function () {
  ok("panel: ffmpeg yoksa meşgul ve kilit kalkar", KD._mesgul() === false && !elems["pc-analiz"].disabled && !elems["pc-genis"].disabled && /ffmpeg gerekli/.test(durumMetni), durumMetni);
  // eski plan + geçersiz analiz: önizleme sonuçları göstermez, hata atmaz
  KD._kur(null, { speakers: [{ name: "A", color: "#f00" }], wide: -1 }, undefined, [{ start: 0, end: 5, cam: 0 }]);
  elems["pc-sonuc"].hidden = true;
  var hata = null;
  try { KD._onizle(); } catch (e) { hata = e; }
  ok("panel: analiz geçersizken önizleme sonuçları açmaz ve hata atmaz", !hata && elems["pc-sonuc"].hidden === true, hata && hata.message);
  bitir();
});

function bitir() {
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
}
