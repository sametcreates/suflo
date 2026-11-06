// Suflo testi: senkron doğrulama (parti s3) — sese yaslanmış zamanlar BÜTÜN çıktı yollarına ulaşır.
// Sentetik ses (tests/_senkron-sentetik.js, bilinen kelime zamanları) + +250 ms kaymış transkript js/senkron-ui.js
// hepsiniYasla ile sese yaslanır (29,97 fps); sonra her çıktı yolu GERÇEK koduyla (captions.js işlevleri kesilip sahte
// DOM / Premiere ile, saf modüller doğrudan) çalıştırılır ve çıktının zamanlarının motorun değil yaslanmış zamanlar
// olduğu denetlenir:
//   1) Premiere caption izi (apply → KS_importSrtAsCaptions'a giden SRT), SRT / VTT / TXT dışa aktarma (saveAs)
//   2) çok dilli SRT paketi (paketZamanlari + paketSrt)
//   3) Premiere altyazı şablonu (MOGRT, mogrtStiliniUygula → KS_placeCaptionMogrt), Premiere yerel MOGRT (Beta,
//      caption-mogrt-json build: kelime zamanları JSON'da)
//   4) şeffaf stilli katman (overlayUygula → stil motoru; zamanlar katmanın karesine tam oturur, libass'in gerçek
//      çizimi tests/test-senkron-katman.js'te)
//   5) After Effects metin katmanları (aeVerisi → ae-plan plan)
//   6) Shorts paketi (Shorts kaydı → captionCues → katman karesi)
//   7) kesimden sonra uyarlama (kesim-esle satirEsle / zincirEsle): yaslanmış zaman kesimle birlikte kayar
//   8) transkript önbelleği v3: motorun zamanı + yaslanmış zaman, eski gövdeler (v1 / v2) yüklenir, eski okuyucu bozulmaz,
//      go() sonunda captions.js senkronOnbellegeYaz
//   9) kenar durumlar: hız / ters / zaman yeniden eşleme (senkronHizEngeli), iç içe sekans, ffmpeg yok, çok kısa kelime,
//      konuşmacı çakışması, uzun seste ilerleme ve iptal (Caption Editor'daki analiz)
var fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
var KOK = path.join(__dirname, "..");
function mod(ad) { return require(path.join(KOK, "js", ad)); }
var Z = mod("ses-zarf.js"), SN = mod("senkron.js"), U = mod("senkron-ui.js"), CT = mod("caption-text.js"), CL = mod("caption-layout.js");
var WW = mod("whisper-words.js"), SE = mod("style-engine.js"), OR = mod("overlay-render.js"), CMJ = mod("caption-mogrt-json.js");
var AP = mod("ae-plan.js"), KE = mod("kesim-esle.js"), TC = mod("transcript-cache.js"), P = mod("shorts-paket-plan.js"), HL = mod("highlights.js");
var G = require("./_senkron-sentetik.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
function ort(d) { return d.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, d.length); }
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
function govde(imza) { var i = cap.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return cap.slice(i, cap.indexOf("\n  }\n", i) + 4); }
function satir(imza) { var i = cap.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return cap.slice(i, cap.indexOf("\n", i) + 1); }
var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-senkron-cikti-"));

/* ---------------- 0) yaslanmış belge ---------------- */
var FPS = 30000 / 1001;
var g = G.uret({ tohum: 21, kelime: 48 });
var a = Z.analizEt(g.pcm);
var T0 = 12;   // klibin timeline başı
function kaydir(kartlar, d) {
  return kartlar.map(function (c) {
    return { start: c.start + d, end: c.end + d, text: c.text, words: c.words.map(function (w) { return { start: w.start + d, end: w.end + d, text: w.text }; }) };
  });
}
// motorun +250 ms kaymış (± 40 ms titrek) transkripti; 4 kelimelik kartlar, metin kelimelerden
var ham = kaydir(G.kartla(G.boz(g.kelimeler, 0.25, 0.04, 5), 4), T0);
ham.forEach(function (c, i) { c.words.forEach(function (w, j) { w.text = "kelime" + i + "x" + j; }); c.text = c.words.map(function (w) { return w.text; }).join(" "); });
var r0 = U.hepsiniYasla(ham, [U.kaynak(a, T0, 1, T0 + a.sure)], { belge: 1, fps: FPS, ayar: { minKartMs: 800 } });
var yas = r0.segments;
function duz(k) { var o = []; k.forEach(function (c) { (c.words || []).forEach(function (w) { o.push(w); }); }); return o; }
var gercek = g.kelimeler.map(function (w) { return w.start + T0; });
var hOnce = ort(duz(ham).map(function (w, i) { return Math.abs(w.start - gercek[i]) * 1000; }));
var hSonra = ort(duz(yas).map(function (w, i) { return Math.abs(w.start - gercek[i]) * 1000; }));
ok("hazırlık: +250 ms kaymış transkript sese yaslanır (kelime başı hatası " + Math.round(hOnce) + " → " + hSonra.toFixed(1) + " ms), kartlar 29,97 karesinde",
  hOnce > 200 && hSonra < 20 && yas.length === ham.length && yas.every(function (c) { return Math.abs(c.start * FPS - Math.round(c.start * FPS)) < 1e-6; }), hSonra);
var YAS_BAS = yas.map(function (c) { return c.start; }), HAM_BAS = ham.map(function (c) { return c.start; });
/*
 * zamanlar[i] i. kartın çıktıdaki başı: yaslanmış başa tol içinde ve motorunkinden belirgin uzak (ortalama > 150 ms).
 * esle: çıktıdaki kart → belgedeki kart dizini (varsayılan aynı sıra).
 */
function yaslanmis(zamanlar, tol, esle) {
  var uyan = 0, hamFark = [];
  zamanlar.forEach(function (t, i) {
    var k = esle ? esle[i] : i;
    if (Math.abs(t - YAS_BAS[k]) <= tol + 1e-9) uyan++;
    hamFark.push(Math.abs(t - HAM_BAS[k]));
  });
  return zamanlar.length > 0 && uyan === zamanlar.length && ort(hamFark) > 0.15;
}
function srtZamanlari(srt) {
  var out = [], re = /(\d\d):(\d\d):(\d\d)[,.](\d\d\d) --> (\d\d):(\d\d):(\d\d)[,.](\d\d\d)/g, m;
  while ((m = re.exec(srt))) out.push({ s: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, e: +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000 });
  return out;
}

/* ---------------- captions.js çıktı ortamı (gerçek işlevler) ---------------- */
function ortam(o) {
  o = o || {};
  var c = { call: [], yazilan: {}, toast: [], durum: [] };
  var dom = {
    "cap-export-fmt": { value: "srt" }, "cap-case": { value: "normal" }, "cap-punct": { checked: true },
    "cap-status": { textContent: "", className: "" }, "cap-apply": { textContent: "", classList: { add: function () {}, remove: function () {} } },
    "cap-uygula-iptal": { hidden: true, addEventListener: function () {} }, "cap-apply-style": { disabled: false }, "cap-emoji-atla": { hidden: true },
    "cap-uygula-durum": { textContent: "", className: "" }
  };
  var masaustu = fs.mkdtempSync(path.join(kok, "ev-"));
  fs.mkdirSync(path.join(masaustu, "Desktop"));
  var K = {
    nodeOK: true, MAC: false, WIN: false, fs: {
      existsSync: function (p) { return /\.mogrt$/.test(p) || fs.existsSync(p); }, writeFileSync: function (p, t) { c.yazilan[p] = String(t); if (/Desktop/.test(p)) fs.writeFileSync(p, t); },
      accessSync: function () {}, constants: { W_OK: 2 }, statSync: function () { return { size: 1 }; }, unlinkSync: function () {}
    },
    path: path, os: { homedir: function () { return masaustu; } }, srtDir: function () { return path.join(kok, "srt"); }, tmpDir: function () { return kok; },
    settings: function () { return o.ayar || {}; }, saveSettings: function () {}, log: function () {}, clearDraft: function () {},
    hataYardimi: function (e) { return e && e.message ? e.message : String(e); },
    call: function (fn, arg) {
      c.call.push([fn, arg]);
      if (fn === "KS_overlaySpec") return Promise.resolve({ ok: true, width: 1920, height: 1080, fps: FPS, end: 60, inPoint: 0, outPoint: 0 });
      if (fn === "KS_placeOverlay") return Promise.resolve({ ok: true, trackName: "V3", start: 0 });
      if (fn === "KS_prepareCaptionMogrt") return Promise.resolve({ ok: true, track: 2, trackName: "V3" });
      if (fn === "KS_projectDir") return Promise.resolve({ ok: true, dir: path.join(kok, "proje") });
      return Promise.resolve({ ok: true, captionTrack: true });
    }
  };
  var derleme = [];
  var win = {
    SufloStyleEngine: { compile: function (x) { derleme.push(x); return SE.compile(x); }, has: SE.has, list: SE.list },
    SufloOverlayRender: { render: function (K2, x) { c.render = x; return Promise.resolve({}); }, kareZamanlari: OR.kareZamanlari },
    SufloKufurMaske: null, SufloAltyaziAkis: null
  };
  var Pro = { gate: function () { return true; }, isPro: function () { return true; }, filigranGerekli: function () { return false; }, denemeHarca: function () {} };
  var kod = [
    "var segments = SEG, segmentsMode = 'plain', ornekBelge = false, ornekSekansId = '', secilenMogrt = null, secilenMotorStili = '', scope = 'clip';",
    "var belgeKesimAdi = null, belgeSekansId = '', uygulananSekans = {}, onayBekleyen = null, kaliteOnayBekleyen = '', shortsYuklenen = '', busy = false;",
    "var emojiAtlaBirKez = false, emojisizCikti = false, katmanKareHizi = 0, FONTLAR = {}, EFEKT = 'efekt', ceviriDili = '', algilananDil = 'tr';",
    "function el(id) { return DOM[id] || null; } function styleText(t) { return t; } function status(m) { C.durum.push(m); }",
    "function qualityReport() { return { bad: 0 }; } function ciftDilAcik() { return false; } function uygulaEtiketiniSifirla() {}",
    "function cancelDraft() {} function hideRestore() {} function yildizIste() {} function go() { return Promise.resolve(true); }",
    "function dosyaDilEki() { return ''; } function temizMogrtAdi() { return 'Şablon'; } function uygulamaIpucunuGuncelle() {}",
    "function emojiAtlaDugmesi() {} function emojiIceriyorMu() { return false; } function yerelCiktiSecili() { return false; } function yerelAltyaziUygula() { return false; }",
    "function stil() { return { aile: 'efekt', yogunluk: 'balanced', font: 'Montserrat', animasyon: 'yok' }; } function motorStiliMi() { return true; }",
    "function markaKiti() { return null; } function konusmaciRenkleri(x) { return x; } function motorCueTuru() { return 'lines'; } function motorAyarlari() { return {}; }",
    "function kirilimDili() { return 'tr'; } function uzantiDizini() { return KOK; } function efektAyari() { return {}; } function buildAssKaydirilmis() { return ''; }",
    govde("function tc(sec, comma)"), govde("function satirlariTopla("), govde("function cueler("), govde("function katmanCueleri("),
    govde("function kufurMaskesiAcik("), govde("function kufurMaskele("), govde("function buildSrt("), govde("function buildVtt("),
    govde("function paketZamanlari("), govde("function paketStil("), govde("function paketSrt("), govde("function mogrtCueleri("),
    govde("async function mogrtStiliniUygula("), govde("async function apply(stilIle, secenek)"), govde("function saveToDesktop("), govde("function saveAs()"),
    cap.slice(cap.indexOf("  var katmanIptal = null;"), cap.indexOf("  function uygulaEtiketiniSifirla(")),
    govde("async function overlayUygula("),
    "return { apply: apply, saveAs: saveAs, cueler: cueler, paketZamanlari: paketZamanlari, paketSrt: paketSrt, mogrt: function (yol) { secilenMogrt = { path: yol }; return mogrtStiliniUygula(); },",
    "  overlayUygula: overlayUygula, segments: function () { return segments; } };"
  ].join("\n");
  var api = new Function("SEG", "DOM", "C", "K", "KApp", "Pro", "window", "CT", "CL", "WW", "KOK", kod)(
    JSON.parse(J(o.segs || yas)), dom, c, K, { ctx: function () { return { sequenceId: "s1", sequence: "Kurgu" }; }, toast: function (m, t) { c.toast.push([m, t]); } },
    Pro, win, CT, CL, WW, KOK);
  return { api: api, c: c, dom: dom, derleme: derleme, masaustu: masaustu };
}

(async function () {
  /* ---------------- 1) caption izi, SRT / VTT / TXT ---------------- */
  var E = ortam();
  var sonuc = await E.api.apply(false, {});
  var izSrt = "";
  E.c.call.forEach(function (x) { if (x[0] === "KS_importSrtAsCaptions") izSrt = E.c.yazilan[x[1].srtPath] || ""; });
  var izZ = srtZamanlari(izSrt);
  ok("Premiere caption izi: KS_importSrtAsCaptions'a giden SRT'de her kart sese yaslanmış başında (ms)", sonuc && sonuc.ok === true && izZ.length === yas.length &&
    yaslanmis(izZ.map(function (z) { return z.s; }), 0.0005), J(izZ.slice(0, 3)) + " " + J(YAS_BAS.slice(0, 3)));
  ok("caption izi: kart çıkışı da yaslanmış (sonraki kartla çakışmaz, en az 0,3 sn)", izZ.every(function (z, i) {
    var beklenen = Math.max(yas[i].end, yas[i].start + 0.3);
    if (yas[i + 1] && beklenen > yas[i + 1].start) beklenen = Math.max(yas[i + 1].start, yas[i].start + 0.05);
    return Math.abs(z.e - beklenen) <= 0.0005;
  }));
  function disari(bicim) {
    E.dom["cap-export-fmt"].value = bicim;
    E.api.saveAs();
    var ad = { srt: "suflo-altyazi.srt", vtt: "suflo-altyazi.vtt", txt: "suflo-transkript.txt" }[bicim];
    return fs.readFileSync(path.join(E.masaustu, "Desktop", ad), "utf8");
  }
  var srt = disari("srt"), vtt = disari("vtt"), txt = disari("txt");
  ok("SRT dışa aktarma: yaslanmış zamanlar (caption iziyle aynı dosya içeriği)", yaslanmis(srtZamanlari(srt).map(function (z) { return z.s; }), 0.0005) && srt.replace(/^﻿/, "") === izSrt.replace(/^﻿/, ""));
  ok("VTT dışa aktarma: yaslanmış zamanlar", /^﻿?WEBVTT/.test(vtt) && yaslanmis(srtZamanlari(vtt).map(function (z) { return z.s; }), 0.0005));
  ok("TXT dışa aktarma: zaman taşımaz, metin yaslamada değişmez (kelimeler aynı sırada)", txt.replace(/^﻿/, "").split("\r\n").join(" ") === ham.map(function (c) { return c.text; }).join(" "));

  /* ---------------- 2) çok dilli SRT paketi ---------------- */
  var pz = E.api.paketZamanlari(E.api.segments());
  var paket = E.api.paketSrt(pz, E.api.segments().map(function (s) { return "translated " + s.text; }), "en");
  ok("çok dilli SRT paketi: her dilin SRT'si yaslanmış zamanlarla", yaslanmis(srtZamanlari(paket).map(function (z) { return z.s; }), 0.0005) && /TRANSLATED|translated/.test(paket));

  /* ---------------- 3) MOGRT şablonu ve Premiere yerel MOGRT ---------------- */
  var EM = ortam();
  await EM.api.mogrt(path.join(kok, "sablon.mogrt"));
  var yer = EM.c.call.filter(function (x) { return x[0] === "KS_placeCaptionMogrt"; }).map(function (x) { return x[1]; });
  var hazirla = EM.c.call.filter(function (x) { return x[0] === "KS_prepareCaptionMogrt"; })[0];
  ok("MOGRT şablonu: her KS_placeCaptionMogrt kartın yaslanmış başında, iz hazırlığı ilk kartın yaslanmış başından", yer.length === yas.length &&
    yaslanmis(yer.map(function (x) { return x.start; }), 1e-9) && hazirla && Math.abs(hazirla[1].start - YAS_BAS[0]) < 1e-9);
  var yerelCue = E.api.cueler({ vurgu: true, kelimeler: true });
  var plan = CMJ.build(yerelCue, {}, { cueKind: "lines", fps: FPS });
  var kelimeBas = [];
  plan.parcalar.forEach(function (p) {
    var d = JSON.parse(p.json), satirlar = d[d.length - 1];
    satirlar.forEach(function (s) { var kz = s[3] || []; for (var i = 0; i < kz.length; i += 2) kelimeBas.push(p.start + kz[i] / 1000); });
  });
  var yasK = duz(yas).map(function (w) { return w.start; }), hamK = duz(ham).map(function (w) { return w.start; });
  // Altyazı Efektleri kartında ilk kelimenin vurgusu kartın girişiyle başlar (kart girişi = ilk kelimenin onset'i − ön pay)
  var yasSinir = yasK.concat(YAS_BAS);
  function yasta(t) { return yasSinir.some(function (y) { return Math.abs(y - t) <= 0.0015; }); }
  var yakin = kelimeBas.filter(yasta).length;
  var hamYakin = kelimeBas.filter(function (t) { return hamK.some(function (y) { return Math.abs(y - t) <= 0.0015; }) && !yasta(t); }).length;
  ok("Premiere yerel MOGRT (Beta): şablonun JSON'undaki kelime zamanları yaslanmış kelime başları / kart girişleri (ms)", kelimeBas.length === yasK.length && yakin === kelimeBas.length && hamYakin === 0,
    kelimeBas.length + " / " + yakin + " / " + hamYakin);

  /* ---------------- 4) şeffaf stilli katman ---------------- */
  var EO = ortam();
  await EO.api.overlayUygula();
  var d0 = EO.derleme[0];
  ok("stilli katman: stil motoru kartları yaslanmış karede alır (karenin libass payı kadar önü), girdi belgesi değişmez",
    !!d0 && d0.cues.length === yas.length && d0.cues.every(function (c, i) { return Math.abs(c.start - (YAS_BAS[i] - OR.LIBASS_PAY)) < 1e-6; }) &&
    J(EO.api.segments()) === J(yas), d0 && J(d0.cues.slice(0, 2).map(function (c) { return c.start; })));
  var assZ = [], m, re = /^Dialogue: \d+,(\d+):(\d\d):(\d\d)\.(\d\d),/gm;
  while ((m = re.exec(EO.c.render ? EO.c.render.ass : ""))) assZ.push(+m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100);
  // libass karenin zamanını ms'ye keser: kart, yaslanmış karesinde açılır (ne önceki karede ne sonrakinde)
  var acilan = YAS_BAS.map(function (t) {
    var k = Math.round(t * FPS);
    var olay = assZ.filter(function (x) { return x * 1000 <= Math.floor(k / FPS * 1000) + 1e-6 && x * 1000 > Math.floor((k - 1) / FPS * 1000) + 1e-6; });
    return olay.length > 0;
  });
  ok("stilli katman: render'a giden ASS'te her kartın bir olayı tam yaslanmış karesinde açılır (29,97 fps, libass kuralı)", assZ.length > 0 && acilan.every(Boolean),
    acilan.filter(function (x) { return !x; }).length + " kart açılmıyor");
  var eskiYol = YAS_BAS.filter(function (t) { var k = Math.round(t * FPS); return Math.round(t * 100) * 10 > Math.floor(k / FPS * 1000); }).length;
  ok("önceki davranış (santisaniyeye yuvarlama) kartların bir kısmını bir kare geç açıyordu: düzeltmenin gerekçesi", eskiYol > 0, eskiYol + " / " + YAS_BAS.length);

  /* ---------------- 5) After Effects ---------------- */
  var aeCue = E.api.cueler();
  var aePlan = AP.plan(aeCue, { mod: "duz", w: 1920, h: 1080, fps: FPS, sure: 120 });
  var aeStilli = AP.plan(E.api.cueler({ vurgu: true, kelimeler: true }), { mod: "stilli", ayar: {}, cueKind: "lines", w: 1920, h: 1080, fps: FPS, sure: 120 });
  ok("After Effects düz: her metin katmanı kartın yaslanmış başında (µs)", aePlan.katmanlar.length === yas.length &&
    yaslanmis(aePlan.katmanlar.map(function (k) { return k.bas; }), 0.000001), J(aePlan.katmanlar.slice(0, 2).map(function (k) { return k.bas; })));
  var aeBas = aeStilli.katmanlar.filter(function (k) { return k.tur === "satir"; }).map(function (k) { return k.bas; });
  ok("After Effects stilli (Altyazı Efektleri kartları): katman başları yaslanmış kelime başlarında", aeBas.length > 0 &&
    aeBas.every(yasta) && aeBas.filter(function (t) { return !yasta(t) && hamK.some(function (y) { return Math.abs(y - t) <= 0.0015; }); }).length === 0, J(aeBas.slice(0, 3)));

  /* ---------------- 6) Shorts paketi ---------------- */
  var A0 = YAS_BAS[2] - 0.5, A1 = YAS_BAS[8] + 0.5;
  var kayit = { segs: HL.sliceSegments(yas, A0, A1), mod: "plain" };
  var cc = P.captionCues(kayit, { styleId: SE.list()[0].id, lang: "tr" });
  var shortsBas = cc.cues.map(function (c) { return c.start + A0; });
  var esS = []; yas.forEach(function (c, i) { var o2 = (c.start + c.end) / 2; if (o2 >= A0 && o2 <= A1) esS.push(i); });
  ok("Shorts paketi: Short'un altyazı cue'ları yaslanmış zamanlarda (Short'un 0'ına göre)", cc.cues.length === esS.length && yaslanmis(shortsBas, 0.0005, esS), J(shortsBas.slice(0, 2)));
  var shortsKare = OR.kareZamanlari(cc.cues, FPS, 0);
  ok("Shorts paketi katmanı: zamanlar Short'un karesine oturur (libass payıyla)", shortsKare.every(function (c, i) {
    var k = Math.round(cc.cues[i].start * FPS);
    return Math.abs(c.start - Math.max(0, k / FPS - OR.LIBASS_PAY)) < 1e-6;
  }) && /OR\.kareZamanlari\(cc\.cues, fps, 0\)/.test(fs.readFileSync(path.join(KOK, "js", "shorts-paket.js"), "utf8")));

  /* ---------------- 7) kesimden sonra uyarlama ---------------- */
  var kesim = { start: YAS_BAS[5] - 0.02, end: YAS_BAS[6] - 0.02 };
  var ke = KE.satirEsle(yas, [kesim], { mod: "ripple" });
  var kayma = kesim.end - kesim.start;
  var oncesi = ke.cues.filter(function (c) { return c.start < kesim.start; });
  var sonrasi = ke.cues.filter(function (c) { return c.start >= kesim.start; });
  // kelimeli kart kalan kelimelerinden yeniden kurulur (ms'ye yuvarlı; katman yolu yine kareye oturtur)
  ok("kesim-esle (ripple): kesimden önceki kartlar yaslanmış zamanlarında, kesimdeki kart düşer, sonrakiler yaslanmış zaman − kesim süresi",
    oncesi.length === 5 && oncesi.every(function (c, i) { return Math.abs(c.start - YAS_BAS[i]) < 0.0006; }) &&
    sonrasi.length === yas.length - 6 && sonrasi.every(function (c, i) { return Math.abs(c.start - (YAS_BAS[i + 6] - kayma)) < 0.0015; }),
    J([oncesi.length, sonrasi.length, sonrasi[0] && sonrasi[0].start, YAS_BAS[6] - kayma]));
  var kz = KE.zincirEsle(yas, [{ mod: "gap", cuts: [kesim], kare: 1 / FPS }], {});
  ok("kesim-esle (boşluk bırak): zamanlar yaslanmış haliyle kalır", kz && kz.cues && kz.cues.filter(function (c) { return c.start >= kesim.end; })
    .every(function (c) { return YAS_BAS.some(function (y) { return Math.abs(y - c.start) < 0.0006; }); }), kz && J(kz.cues.slice(6, 8).map(function (c) { return c.start; })));

  /* ---------------- 8) transkript önbelleği v3 ---------------- */
  var tdir = fs.mkdtempSync(path.join(kok, "onb-"));
  var C1 = TC.create({ fs: fs, path: path, crypto: crypto, dir: tdir });
  var IN = 40;   // klibin kaynak in noktası
  var meta = { mediaPath: "/medya/röportaj.mp4", size: 5, mtimeMs: 9, inPoint: IN, dur: 30, lang: "tr", engine: "yerel:large", prompt: "altyazi" };
  // motorun ham çıktısı: kaynak zamanı (in noktasına göre), satır + kelimeler
  var raw = ham.map(function (c) { return { start: c.start - T0, end: c.end - T0, text: c.text, words: c.words.map(function (w) { return { text: w.text, start: w.start - T0, end: w.end - T0, p: 0.9 }; }) }; });
  C1.put(meta, { segments: raw, lang: "tr" });
  var es = U.eslesmeCikar(ham, yas, T0);
  var n = C1.senkronYaz(meta, es);
  var dosya = JSON.parse(fs.readFileSync(path.join(tdir, C1.key(meta) + ".json"), "utf8"));
  ok("önbellek v3: senkronYaz her kelimeye yaslanmış zamanı ekler, gövde v3, motorun zamanı (start / end) aynen",
    n === yasK.length && dosya.v === 3 && dosya.senkron && dosya.senkron.n === n &&
    dosya.segments.every(function (s, i) { return s.words.every(function (w, j) { return Math.abs(w.start - (IN + raw[i].words[j].start)) < 0.0006 && isFinite(w.rs); }); }), n + " " + dosya.v);
  var gYas = C1.get(meta, { prompts: ["altyazi"] }), gHam = C1.get(meta, { prompts: ["altyazi"], ham: true });
  ok("önbellek get(): varsayılan yaslanmış zaman (senkron: true; satır kelimelerini kapsar), ham: true motorun zamanı (satırlar aynen)",
    gYas.senkron === true && gYas.words.length === yasK.length && gYas.words.every(function (w, i) { return Math.abs(w.start + T0 - yasK[i]) <= 0.0006; }) &&
    gHam.senkron === false && gHam.words.every(function (w, i) { return Math.abs(w.start + T0 - hamK[i]) <= 0.0006; }) &&
    gYas.segments.every(function (sg) { return sg.start <= sg.words[0].start + 1e-9 && sg.end >= sg.words[sg.words.length - 1].end - 1e-9; }) &&
    gHam.segments.length === raw.length && gHam.segments.every(function (sg, i) { return Math.abs(sg.start - Math.max(0, raw[i].start)) < 1e-6 && Math.abs(sg.end - raw[i].end) < 1e-6; }));
  var kapsanan = C1.get({ mediaPath: meta.mediaPath, size: 5, mtimeMs: 9, inPoint: IN + 5, dur: 10, lang: "tr", engine: "yerel:large", prompt: "altyazi" });
  ok("önbellek: kapsayan girdiden kesilen alt aralık da yaslanmış zamanla (kesimden sonra kalan alt klip)", kapsanan && kapsanan.covering && kapsanan.senkron &&
    // aralığın başına taşan kelime 0'a kırpılır (kes); diğerleri yaslanmış zamanla
    kapsanan.words.filter(function (w) { return w.start > 0; }).every(function (w) { return yasK.some(function (y) { return Math.abs(w.start + 5 - (y - T0)) <= 0.0006; }); }) &&
    kapsanan.words.length > 5);
  // eski sürüm okuyucusu (v2 kodu: segments + start / end) v3 gövdeyi aynı motor zamanıyla okur
  var eskiOkunan = dosya.segments.map(function (s) { return s.words.map(function (w) { return w.start; }); });
  ok("geriye uyum: eski sürüm v3 gövdesini motorun zamanıyla okur (start / end değişmedi, fazladan alanlar yok sayılır)",
    J(eskiOkunan) === J(raw.map(function (s) { return s.words.map(function (w) { return Math.round((IN + w.start) * 1000) / 1000; }); })));
  // eski gövdeler: v1 (düz kelime listesi) ve v2 (yaslamasız) yüklenir, senkron: false
  var C2 = TC.create({ fs: fs, path: path, crypto: crypto, dir: fs.mkdtempSync(path.join(kok, "onb2-")) });
  C2.put(meta, { words: [{ start: 1, end: 1.4, text: "eski" }], lang: "tr" });
  var k2 = C2.key(meta);
  fs.writeFileSync(path.join(C2.dir, k2 + ".json"), J({ v: 1, lang: "tr", words: [{ start: IN + 1, end: IN + 1.4, text: "eski" }] }));
  var v1 = C2.get(meta);
  ok("geriye uyum: v1 gövdesi yüklenir (senkron yok); senkronYaz kelimesiz satırda gövdeyi değiştirmez", v1 && v1.words.length === 1 && v1.words[0].start === 1 && v1.senkron === false &&
    C2.senkronYaz(meta, [{ start: 1, end: 1.4, rs: 1.1, re: 1.4 }]) === 0 && JSON.parse(fs.readFileSync(path.join(C2.dir, k2 + ".json"), "utf8")).v === 1);
  C1.put(meta, { segments: raw, lang: "tr" });
  var v2 = C1.get(meta);
  ok("geriye uyum: v2 gövdesi (yeniden yazıya dökülen ham) yaslamasız yüklenir; boş eşleşme eski yaslamayı siler",
    v2.senkron === false && C1.senkronYaz(meta, es) === n && C1.senkronYaz(meta, []) === 0 && C1.get(meta).senkron === false &&
    JSON.parse(fs.readFileSync(path.join(tdir, C1.key(meta) + ".json"), "utf8")).v === 2);
  ok("senkronYaz: girdi yoksa -1, bozuk eşleşme fırlatmaz", C1.senkronYaz({ mediaPath: "/yok.mp4", size: 1, mtimeMs: 1, inPoint: 0, dur: 1 }, es) === -1 &&
    C1.senkronYaz(meta, [null, { start: "x" }, { start: 1, rs: 2, re: 1 }]) === 0);
  ok("eslesmeCikar: yapı tutmazsa boş (kart / kelime sayısı farklı), kelimesiz kart kendisi", J(U.eslesmeCikar(ham, yas.slice(1), T0)) === "[]" &&
    J(U.eslesmeCikar([{ start: 13, end: 14, text: "a" }], [{ start: 13.1, end: 14, text: "a" }], 12)) === J([{ start: 1, end: 2, rs: 1.1, re: 2 }]));
  // captions.js go(): önbellek tek klipte, doğrulamadan SONRA yaslanmış zamanla güncellenir
  var goG = govde("async function go(");
  ok("go(): önbelleğe yazıldıysa yaslamadan sonra senkronOnbellegeYaz (yaslama öncesi belge, klibin timeline başı)",
    /onbYazildi = transcriptCache\(\)\.put\(onbMeta/.test(goG) && goG.indexOf("var yaslamaOncesi = segments;") < goG.indexOf("senkronIsSonu(senkronSesler") &&
    goG.indexOf("senkronIsSonu(senkronSesler") < goG.indexOf("if (onbYazildi) senkronOnbellegeYaz(onbMeta, yaslamaOncesi, Number(seqOffset) || 0);"));
  var yazanlar = [];
  var SOY = new Function("SUI", "K", "TCS", "SEG", "var segments = SEG; function transcriptCache() { return TCS; }\n" + govde("function senkronOnbellegeYaz(") + "\nreturn senkronOnbellegeYaz;")(
    U, { log: function () {} }, { senkronYaz: function (m2, e2) { yazanlar.push(e2); return e2.length; } }, yas);
  ok("senkronOnbellegeYaz: belge değiştiyse eşleşmeyi yazar, aynı belgede (yaslama yok) yazmaz", SOY(meta, ham, T0) === yasK.length && SOY(meta, yas, T0) === -1 &&
    yazanlar.length === 1 && Math.abs(yazanlar[0][0].rs - (yasK[0] - T0)) < 0.0006);

  /* ---------------- 9) kenar durumlar ---------------- */
  var HE = new Function(satir("  var SENKRON_HIZ = ") + satir("  var SENKRON_TERS = ") + govde("function senkronHizEngeli(") + "\nreturn senkronHizEngeli;")();
  ok("hız engeli: %100 klip geçer; getSpeed ≠ 1, ters oynatma, süre oranı (zaman yeniden eşleme / hız) atlanır; eski host (alan yok) yalnız oran",
    HE({ speed: 1, reversed: false }, 1) === "" && HE({ speed: 1.5 }, 1) === "Hızı değiştirilmiş klipte senkron doğrulama yapılmadı" &&
    HE({ speed: 1, reversed: true }, 1) === "Ters oynatılan klipte senkron doğrulama yapılmadı" && HE({ speed: 1 }, 0.8) !== "" && HE({}, 1) === "" && HE(null, 1.2) !== "" && HE(null, 1) === "");
  var host = fs.readFileSync(path.join(KOK, "jsx", "host.jsx"), "utf8");
  var hsc = host.slice(host.indexOf("function KS_getSelectedClips("), host.indexOf("/* ---------- Suflo Pro: yerlesik Motion presetleri"));
  // gerçek KS_getSelectedClips sahte Premiere'de: hız, ters, iç içe sekans sayısı
  function zaman(s) { return { seconds: s }; }
  function oge(o) {
    return { name: o.ad, start: zaman(o.s), end: zaman(o.e), inPoint: zaman(o.i), outPoint: zaman(o.o),
      projectItem: { getMediaPath: function () { return o.yol; }, isSequence: function () { return !!o.ic; } },
      getSpeed: o.hiz === undefined ? undefined : function () { return o.hiz; }, isSpeedReversed: function () { return !!o.ters; } };
  }
  var secim = [oge({ ad: "a", s: 0, e: 5, i: 0, o: 5, yol: "/a.mp4", hiz: 1 }), oge({ ad: "b", s: 5, e: 7.5, i: 0, o: 5, yol: "/b.mp4", hiz: -2, ters: true }),
    oge({ ad: "ic", s: 8, e: 9, i: 0, o: 1, yol: "", ic: true }), oge({ ad: "eski", s: 10, e: 11, i: 0, o: 1, yol: "/c.mp4" })];
  var hostSonuc = JSON.parse(new Function("SEQ", "function KS_seq() { return SEQ; } function KS_ok(d) { d.ok = true; return JSON.stringify(d); } function KS_err(m) { return JSON.stringify({ ok: false, error: String(m) }); }\n" +
    govdeJsx(host, "function KS_mcKlipBayrak(") + "\n" + hsc + "\nreturn KS_getSelectedClips();")({ getSelection: function () { return secim; } }));
  ok("host KS_getSelectedClips: hız (getSpeed) ve ters bayrağı, iç içe sekans atlanır ve sayılır; getSpeed yoksa alan yok (ES3, eski davranış)",
    hostSonuc.ok && hostSonuc.clips.length === 3 && hostSonuc.clips[0].speed === 1 && hostSonuc.clips[0].reversed === false &&
    hostSonuc.clips[1].speed === 2 && hostSonuc.clips[1].reversed === true && hostSonuc.nested === 1 && !("speed" in hostSonuc.clips[2]), J(hostSonuc));
  ok("go(): sekans / In-Out kapsamında (iç içe sekanslı karışım) klip hızına bakılmaz, klip ve toplu klipte senkronHizEngeli; ffmpeg yoksa nedeni rapor eder",
    /senkronHizEngeli\(scope === "clip" \? clip : null, speedFactor\)/.test(goG) && /senkronHizEngeli\(bc, bf\)/.test(goG) &&
    (goG.match(/else if \(senkronSonNeden === "ffmpeg"\) senkronAtlama = SUI\.ATLANDI\.ffmpeg;/g) || []).length === 2);
  // senkronSesiAnaliz: ffmpeg yok → null + neden; ilerleme durum satırına
  var durumlar = [];
  var SSA = new Function("SZ", "SUI", "K", "status", "var aktifIptal = null; var senkronSonNeden = '';\n" + govde("async function senkronSesiAnaliz(") +
    "\nreturn { f: senkronSesiAnaliz, neden: function () { return senkronSonNeden; } };")(
    { sesZarfiCikar: function (o2) { if (o2.media === "/ffyok.wav") return Promise.resolve({ neden: "ffmpeg" }); if (o2.onIlerleme) { o2.onIlerleme(0.5); o2.onIlerleme(1); } return Promise.resolve({ analiz: a }); } },
    U, { log: function () {}, fs: { statSync: function () { return {}; } } }, function (m2) { durumlar.push(m2); });
  var kFf = await SSA.f("/ffyok.wav", 0, 3, null, "Ses dalgasıyla senkron doğrulanıyor…");
  var nFf = SSA.neden();
  var kOk = await SSA.f("/gecici.wav", T0, a.sure, null, "Ses dalgasıyla senkron doğrulanıyor…");
  ok("ffmpeg yok: analiz null, nedeni 'ffmpeg' (rapor: 'ffmpeg bulunamadı', altyazı motorun zamanlarıyla); uzun seste ilerleme yüzdesi durum satırında",
    kFf === null && nFf === "ffmpeg" && kOk && SSA.neden() === "" && J(durumlar) === J(["Ses dalgasıyla senkron doğrulanıyor… %50", "Ses dalgasıyla senkron doğrulanıyor… %100"]) &&
    U.ATLANDI.ffmpeg === "Senkron doğrulanamadı: ffmpeg bulunamadı (altyazı motorun zamanlarıyla)");
  var I18N = mod("i18n.js");
  I18N.setDictionary(require(path.join(KOK, "i18n", "en.js")));
  var ceviri = [U.ATLANDI.ffmpeg, "Ters oynatılan klipte senkron doğrulama yapılmadı", "Ses dalgasıyla senkron doğrulanıyor… %42", "Klip 2/5 (a.mp4): ses dalgası analiz ediliyor… %7",
    "Ses dalgası analiz ediliyor… %3", "Ses dalgası analizi iptal edildi.", satir("  var SENKRON_IC_SEKANS = ").replace(/^[^"]*"|";\s*$/g, "")].map(function (t) { return I18N.translate(t); });
  ok("İngilizce: yeni durum / neden metinleri çevrilir (yüzde İngilizce sırasıyla)", ceviri.every(function (t) { return !/[ıİşŞğĞçÇöÖüÜ]/.test(t); }) && ceviri[2] === "Checking sync against the waveform… 42%", J(ceviri));
  // ffmpeg yokken Oluştur sonrası belge motorun zamanıyla kalır (senkronIsSonu atlama metniyle)
  ok("ffmpeg yok: Oluştur'un raporu nedeni söyler, belge (altyazı) yine kurulur (senkronIsSonu atlama yolu)", /if \(!sesler\.length\) \{\s*senkronRaporGoster\(null, atlama/.test(govde("function senkronIsSonu(")));

  // çok kısa kelimeler ve konuşmacı çakışması
  var kisa = G.boz(g.kelimeler, 0.2, 0.03, 3).map(function (w, i) { return i % 5 === 0 ? { start: w.start, end: w.start + 0.005, text: w.text } : (i % 7 === 0 ? { start: w.start, end: w.start, text: w.text } : w); });
  var rk = SN.hizala(G.kartla(kisa, 4), a, { fps: FPS });
  var kw = duz(rk.kartlar);
  ok("çok kısa / sıfır süreli kelimeler: hizalama bozulmaz (süre ≥ 0, sıra ve çakışmasızlık korunur, düzeltme yapılır)", kw.length === kisa.length &&
    kw.every(function (w, i) { return w.end >= w.start && (!i || w.start >= kw[i - 1].end - 1e-9); }) && rk.rapor.ortalamaSonraMs < 25, rk.rapor.ortalamaSonraMs);
  var dogru = G.kartla(g.kelimeler, 3);
  var cak = JSON.parse(J(dogru));
  cak[1].end = cak[2].start + 0.3; cak[1].words[cak[1].words.length - 1].end = cak[2].start + 0.3;   // iki konuşmacı üst üste
  var rc = SN.hizala(cak, a, { fps: FPS });
  var enBuyuk = 0;
  rc.kartlar.forEach(function (c, i) { c.words.forEach(function (w, j) { enBuyuk = Math.max(enBuyuk, Math.abs(w.start - dogru[i].words[j].start)); }); });
  ok("konuşmacı çakışması: üst üste giren kart sonrakinin girişinde kesilir, kelimeler yerinden oynamaz (< 40 ms)",
    rc.kartlar[1].end <= rc.kartlar[2].start + 1e-9 && enBuyuk < 0.04, enBuyuk.toFixed(3));

  // Caption Editor'da analiz: uzun klipte ilerleme + İptal (şerit düğmesi), iç içe sekans uyarısı
  var EA = await editorAnaliz({ sec: { ok: true, clips: [], nested: 1 } });
  ok("Caption Editor analiz: seçimde yalnız iç içe sekans varsa 'Sekans kapsamında oluştur' der", EA.sonuc === null && /İç içe sekans/.test(J(EA.toast)), J(EA.toast));
  var EB = await editorAnaliz({ sec: { ok: true, clips: [{ mediaPath: "/m.mp4", clipStart: 4, clipEnd: 9, inPoint: 0, dur: 5, speed: 1, reversed: true }] } });
  ok("Caption Editor analiz: ters klip reddedilir (ses okunmaz)", EB.sonuc === null && EB.zarf === 0 && /Ters oynatılan/.test(J(EB.toast)));
  var EC = await editorAnaliz({ sec: { ok: true, clips: [{ mediaPath: "/m.mp4", clipStart: 4, clipEnd: 9, inPoint: 0, dur: 5, speed: 1 }] }, iptalEt: true });
  ok("Caption Editor analiz: sürerken şerit düğmesi İptal; İptal süreci durdurur, 'iptal edildi' der, yüzde durumu temizlenir, kaynak eklenmez",
    EC.sonuc === null && EC.dugmeSirasinda === "İptal" && EC.iptalOldu && /iptal edildi/.test(J(EC.toast)) && EC.durum[EC.durum.length - 1] === "" && EC.kaynak === 0 &&
    EC.dugmeSonra === "Seçili klibin sesini analiz et", J([EC.dugmeSirasinda, EC.dugmeSonra, EC.durum]));
  var ED = await editorAnaliz({ sec: { ok: true, clips: [{ mediaPath: "/m.mp4", clipStart: 4, clipEnd: 9, inPoint: 0, dur: 5, speed: 1 }] } });
  ok("Caption Editor analiz: normal klipte kaynak eklenir (yüzde ilerlemesi gösterilir)", ED.sonuc && ED.kaynak === 1 && ED.durum.some(function (x) { return /%\d+$/.test(x); }));

  console.log("\n" + gecen + "/" + toplam + " gecti");
  try { fs.rmSync ? fs.rmSync(kok, { recursive: true, force: true }) : null; } catch (e) {}
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL beklenmeyen hata: " + (e && e.stack ? e.stack : e)); process.exit(1); });

function govdeJsx(src, imza) { var i = src.indexOf(imza); return src.slice(i, src.indexOf("\n}\n", i) + 2); }

/*
 * captions.js senkronSecilenKlibiAnaliz + js/senkron-ui.js serit (gerçek) sahte DOM'da: şerit düğmesi analiz sürerken
 * "İptal" olur, tıklanınca jeton iptal edilir.
 */
async function editorAnaliz(o) {
  var dom = {}, toast = [], durum = [], zarf = 0, kayit = { iptalOldu: false };
  function d(id) {
    var x = { id: id, hidden: false, disabled: false, textContent: "", attrs: {}, childNodes: [], dinle: {}, clientWidth: 300, style: {} };
    x.setAttribute = function (k, v) { x.attrs[k] = v; }; x.getAttribute = function (k) { return x.attrs[k]; };
    x.addEventListener = function (t, f) { (x.dinle[t] = x.dinle[t] || []).push(f); };
    x.appendChild = function (c) { x.childNodes.push(c); return c; }; x.removeChild = function () {};
    x.click = function () { (x.dinle.click || []).forEach(function (f) { f({}); }); };
    return x;
  }
  ["cap-dalga", "cap-dalga-tuval", "cap-dalga-tutamaklar", "cap-dalga-alan", "cap-dalga-baslik", "cap-dalga-bos", "cap-dalga-analiz", "cap-dalga-dinle", "cap-dalga-yasla", "cap-dalga-geri"].forEach(function (id) { dom[id] = d(id); });
  dom["cap-dalga-analiz"].textContent = "Seçili klibin sesini analiz et";
  dom["cap-dalga-tuval"].getContext = function () { return null; };
  var belge = { getElementById: function (id) { return dom[id] || null; }, createElement: function () { return d(""); }, defaultView: {} };
  var jeton = null, bekleyen = null;
  var K = {
    call: function () { return Promise.resolve(o.sec); }, log: function () {},
    iptalJetonu: function () { jeton = { iptalEdildi: false, iptal: function () { jeton.iptalEdildi = true; kayit.iptalOldu = true; if (bekleyen) bekleyen({ iptal: true }); } }; return jeton; }
  };
  var SZ = { sesZarfiCikar: function (x) {
    zarf++;
    if (x.onIlerleme) x.onIlerleme(0.25);
    if (o.iptalEt) return new Promise(function (res) { bekleyen = res; });
    return Promise.resolve({ analiz: a });
  } };
  var kod = [
    "var senkronAnalizde = false, busy = false, senkronBelgeNo = 1, senkronKaynaklar = [], senkronSerit = null, senkronAnalizIptal = null, segments = SEGS, secili = 0;",
    satir("  var SENKRON_HIZ = "), satir("  var SENKRON_TERS = "), satir("  var SENKRON_IC_SEKANS = "),
    govde("function senkronHizEngeli("), govde("function senkronKaynakEkle("), govde("async function senkronSecilenKlibiAnaliz("),
    "function senkronAnaliziIptalEt() { if (senkronAnalizIptal && senkronAnalizIptal.iptal) senkronAnalizIptal.iptal(); }",
    "senkronSerit = SUI.serit({ belge: BELGE, segments: function () { return segments; }, secili: function () { return secili; }, kaynak: function () { return null; },",
    "  fps: function () { return 25; }, ae: function () { return false; }, degistir: function () {}, dinle: function () {}, hepsiniYasla: function () {}, geriAl: function () {},",
    "  geriAlVar: function () { return false; }, analizEt: function () {}, analizSuruyor: function () { return senkronAnalizde || busy; },",
    "  analizIptal: senkronAnaliziIptalEt, analizIptalVar: function () { return !!senkronAnalizIptal; }, tusTut: function () {} });",
    "return { analiz: senkronSecilenKlibiAnaliz, kaynak: function () { return senkronKaynaklar.length; } };"
  ].join("\n");
  var api = new Function("K", "KApp", "SZ", "SUI", "BELGE", "SEGS", "status", kod)(K, { toast: function (m) { toast.push(m); } }, SZ, U, belge,
    [{ start: 4.2, end: 5, text: "selam", words: [{ start: 4.2, end: 5, text: "selam" }] }], function (m) { durum.push(m); });
  var p = api.analiz();
  await new Promise(function (r) { setTimeout(r, 5); });
  var dugmeSirasinda = dom["cap-dalga-analiz"].textContent;
  if (o.iptalEt) dom["cap-dalga-analiz"].click();
  var sonuc = await p;
  return { sonuc: sonuc, toast: toast, durum: durum, zarf: zarf, kaynak: api.kaynak(), dugmeSirasinda: dugmeSirasinda, dugmeSonra: dom["cap-dalga-analiz"].textContent, iptalOldu: kayit.iptalOldu };
}
