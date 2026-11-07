#!/usr/bin/env node
/*
 * Suflo — altyazı uyumluluk fikstürlerinin üreticisi (test koşusunda ÇALIŞMAZ; tests/fixtures/ altında).
 *
 * Altyazı yenilemesinden (parti 1-9) ÖNCEKİ kodla (git 5d153e7) üretilen gerçek eser örnekleri:
 *   - SFL1 stil kodları: ilk altı hazır görünüm, gölge / kutu / serbest konum / metin biçimi / yazar özelleştirmeleri,
 *     eski stil kimlikli (3.2) "neon" ve "mrbeast" kodları
 *   - .suflo-stil dosyası (stilDisaAktar'ın yazdığı içerik: kod + paylaşım bağlantısı)
 *   - Marka Kiti JSON'u (ayarlar.markaKiti), ★ Şablonum (ayarlar.userPreset), altyazı tercihleri (ayarlar.capPrefs,
 *     savePrefs biçimi), yarım kalmış Shorts paketi işi (ayarlar.shortsPaketIs + shortsPaketSecim)
 * ve her eserin ESKİ panelde yüklendikten sonraki görünür ayarları, stil motoruna giden ince ayarı ve eski stil motorunun
 * ASS çıktısı (artefaktlar.json). Eski çözücü style-share-5d153e7.js olarak kopyalanır (bugünkü panelin kodu onunla
 * çözülür). Eski panel tests/_altyazi-panel.js ile, eski captions.js'in GERÇEK işlevlerinden kurulur.
 *
 * Yeniden üretmek (yalnız fikstür bilinçli değişecekse; çıktı belirlenimcidir):
 *   node tests/fixtures/altyazi-eski/uret.js
 */
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
var KOK = path.join(__dirname, "..", "..", "..");
var CIKTI = __dirname;
var SURUM = "5d153e7";
var ESKI = path.join(os.tmpdir(), "suflo-eski-" + SURUM);

if (!fs.existsSync(path.join(ESKI, "js", "captions.js"))) {
  fs.mkdirSync(ESKI, { recursive: true });
  var arsiv = cp.spawnSync("git", ["archive", SURUM, "js"], { cwd: KOK, maxBuffer: 256 * 1024 * 1024 });
  if (arsiv.status !== 0) throw new Error("git archive " + SURUM + ": " + String(arsiv.stderr));
  var ac = cp.spawnSync("tar", ["-x", "-C", ESKI], { input: arsiv.stdout });
  if (ac.status !== 0) throw new Error("tar: " + String(ac.stderr));
}

var P = require(path.join(KOK, "tests", "_altyazi-panel.js"));
var E = P.kur(ESKI);
var SS = E.SS, SE = E.SE, MK = E.MK, AE = E.AE;
var PL = require(path.join(ESKI, "js", "shorts-paket-plan.js"));
var ORTAK = require(path.join(__dirname, "ortak.js"));

var ass = {};
function derle(anahtar, styleId, ov, intensity) {
  ORTAK.KADRAJLAR.forEach(function (k) {
    Object.keys(ORTAK.METINLER).forEach(function (m) {
      var o = JSON.parse(JSON.stringify(ov));
      ass[anahtar + "@" + k.ad + ":" + m] = SE.compile({ styleId: styleId, intensity: intensity, cueKind: "words", cues: ORTAK.METINLER[m],
        width: k.w, height: k.h, overrides: o }).ass;
      ass[anahtar + "@" + k.ad + ":" + m] = ORTAK.ozet(ass[anahtar + "@" + k.ad + ":" + m]);
    });
  });
}
// Eski panelin o anki durumu: görünür ayarlar, seçim, stil motoruna giden ince ayar; ASS'i de üretir
function durumu(e, anahtar) {
  var st = e.api.stil();
  var ov = e.api.motorAyarlari(st);
  var d = e.api.durum();
  if (d.motor) derle(anahtar, d.motor, ov, st.yogunluk);
  return { gorunur: e.gorunur(), durum: d, stilId: d.motor, yogunluk: st.yogunluk, ov: ov, toastlar: e.toastlar.slice() };
}
function ozellestir(e, alanlar) {
  Object.keys(alanlar).forEach(function (id) {
    var d = e.dom[id];
    if (d.type === "checkbox") d.checked = !!alanlar[id]; else d.value = String(alanlar[id]);
  });
}

/* ---------------- SFL1 stil kodları ---------------- */
var ILK_ALTI = AE.GORUNUMLER.map(function (g) { return g.id; });
var OZEL = {
  "temiz+golge": ["temiz", { "cap-efekt-golge": true, "cap-efekt-golge-renk": "#102030", "cap-efekt-golge-opak": "70", "cap-efekt-golge-mesafe": "6", "cap-efekt-golge-yumusak": "4" }],
  "vurucu+kutu": ["vurucu", { "cap-kutu": true, "cap-kutu-renk": "#202020", "cap-kutu-opak": "60" }],
  "zarif+serbest": ["zarif", { "cap-konum-x": "30", "cap-konum-y": "40" }],
  "canli+metin+yazar": ["canli", { "cap-maxlen": "k1", "cap-case": "upper", "cap-punct": false, "cap-stil-yazar": "ayse", "cap-font": "Lora", "cap-renk": "#ff3366" }],
  "glitch+italik": ["glitch", { "cap-efekt-italik": true, "cap-efekt-kelime": "3", "cap-efekt-satir": "1", "cap-efekt-vurgu": false }]
};
var kodlar = [];
ILK_ALTI.forEach(function (g) {
  var e = E.ortam();
  e.api.gorunumUygula(g);
  kodlar.push({ ad: g, kod: e.api.stilKodu().kod });
});
Object.keys(OZEL).forEach(function (ad) {
  var e = E.ortam();
  e.api.gorunumUygula(OZEL[ad][0]);
  ozellestir(e, OZEL[ad][1]);
  kodlar.push({ ad: ad, kod: e.api.stilKodu().kod });
});
// 3.2 panelinin kodları (eski stil kimlikleri; 3.3'ten beri en yakın görünüme taşınır)
kodlar.push({ ad: "neon (3.2)", kod: SS.encode({ styleId: "neon", overrides: { font: "Lora", renk: "#ff0000", konturRenk: "#000000", vurguRenk: "#00ff00",
  boyut: 150, kontur: 3, konum: 8, guvenli: true }, text: { maxlen: "k1", kase: "upper", punct: false }, author: "ayse" }) });
kodlar.push({ ad: "mrbeast (3.2)", kod: SS.encode({ styleId: "mrbeast", intensity: "hard", overrides: { boyut: 130 }, text: { maxlen: "c32", kase: "upper", punct: true } }) });
kodlar.forEach(function (k) {
  var e = E.ortam();
  k.ok = e.api.stilKoduUygula(k.kod);
  k.beklenen = durumu(e, "kod:" + k.ad);
  // eski panelin bu koddan sonra yeniden paylaştığı kod (alıcının yazar alanı boş: kredi koda geçmez)
  k.yenidenKod = e.api.stilKodu().kod;
});

/* ---------------- .suflo-stil dosyası ---------------- */
var es = E.ortam();
es.api.gorunumUygula("vurucu");
ozellestir(es, { "cap-renk-vurgu": "#00e5ff", "cap-boyut": "120", "cap-efekt-golge": true });
var sKod = es.api.stilKodu().kod;
var dosyaIcerigi = sKod + "\n" + SS.shareUrl(sKod, "tr") + "\n";   // stilDisaAktar ile aynı biçim
fs.writeFileSync(path.join(CIKTI, "suflo-stil-vurucu.suflo-stil"), dosyaIcerigi);
var esY = E.ortam();
esY.api.stilKoduUygula(dosyaIcerigi);
var sufloStil = { dosya: "suflo-stil-vurucu.suflo-stil", beklenen: durumu(esY, "suflo-stil") };

/* ---------------- Marka Kiti ---------------- */
var kit = MK.normalize({ on: true, stil: { id: "", overrides: { font: "Lora", fontFile: "Lora.ttf", renk: "#fafafa", konturRenk: "#101010", vurguRenk: "#ff6600",
  golge: { renk: "#000000", opak: 60, mesafe: 4, yumusak: 3 }, kutu: true, kutuRenk: "#1a1a2e", kutuOpak: 55, konumX: 40, konumY: 70 } },
  kanca: { stil: "", renk: "#ff6600", sure: 3 }, ilerleme: { konum: "alt", renk: "#ff6600", kalinlik: 8 }, cta: { acik: true, metin: "Takip et", sure: 2 },
  logo: { path: "", kose: "ss", oran: 0.12 } }).kit;
fs.writeFileSync(path.join(CIKTI, "marka-kiti.json"), JSON.stringify(kit, null, 2) + "\n");
var markaKiti = { dosya: "marka-kiti.json", gorunumler: {} };
ILK_ALTI.forEach(function (g) {
  var e = E.ortam({ ayar: { markaKiti: JSON.parse(JSON.stringify(kit)) } });
  e.api.gorunumUygula(g);
  markaKiti.gorunumler[g] = durumu(e, "kit:" + g);
});

/* ---------------- ★ Şablonum ---------------- */
var esab = E.ortam();
esab.api.gorunumUygula("glitch");
ozellestir(esab, { "cap-renk": "#abcdef", "cap-efekt-italik": true, "cap-case": "upper", "cap-maxlen": "c42x2", "cap-konum": "8" });
esab.api.saveUserPreset();
fs.writeFileSync(path.join(CIKTI, "sablonum.json"), JSON.stringify(esab.ayar.userPreset, null, 2) + "\n");
var esabY = E.ortam({ ayar: { userPreset: JSON.parse(JSON.stringify(esab.ayar.userPreset)) } });
esabY.api.gorunumleriCiz();
esabY.api.sablonumUygula();
var sablonum = { dosya: "sablonum.json", beklenen: durumu(esabY, "sablonum") };

/* ---------------- altyazı tercihleri (savePrefs) ---------------- */
var prefs = {};
var ep = E.ortam();
ep.api.gorunumUygula("canli");
ozellestir(ep, { "cap-lang": "tr", "cap-maxlen": "l32", "cap-font": "Nunito", "cap-efekt-golge": true, "cap-konum-x": "55", "cap-konum-y": "35" });
ep.api.savePrefs();
prefs.canli = ep.ayar.capPrefs;
var ep2 = E.ortam();
ep2.api.gorunumUygula("kutulu");
ep2.api.savePrefs();
prefs.kutulu = ep2.ayar.capPrefs;
// 3.2'den kalan kayıt (eski stil kimliği; 3.3 panelinin loadPrefs'i en yakın görünüme taşır)
prefs["hormozi (3.2)"] = { maxlen: "k1", kase: "upper", punct: false, preset: "hormozi", motorStili: "hormozi",
  stil: { aile: "hormozi", yogunluk: "hard", font: "Lora", boyut: 124, renk: "#ff3366", konturRenk: "#101010", vurguRenk: "#22ccff", kontur: 8, konum: 8, kutu: false, animasyon: "hormozi" } };
fs.writeFileSync(path.join(CIKTI, "cap-prefs.json"), JSON.stringify(prefs, null, 2) + "\n");
var capPrefs = { dosya: "cap-prefs.json", beklenen: {} };
Object.keys(prefs).forEach(function (ad) {
  var e = E.ortam({ ayar: { capPrefs: JSON.parse(JSON.stringify(prefs[ad])) } });
  e.api.loadPrefs();
  capPrefs.beklenen[ad] = durumu(e, "prefs:" + ad);
});

/* ---------------- yarım kalmış Shorts paketi ---------------- */
var secimHam = { stilId: "efekt", gorunum: "vurucu", efekt: Object.assign(AE.overrides(AE.gorunum("vurucu").ayar), { kase: "upper", punct: false }),
  altyazi: true, kanca: true, ilerleme: true, cta: true, metin: false };
var plan = PL.planla({ anlar: [{ id: "a1", start: 10, end: 40, title: "İlk an", reason: "r", score: 80, hooks: ["Bunu bilmiyordun"] },
  { id: "a2", start: 60, end: 95, title: "İkinci *an*", reason: "r", score: 70, hooks: ["Dur ve izle"] }],
  kit: null, secim: secimHam, yetenek: { autoReframe: true, ffmpeg: true, libass: true, groq: false } });
var job = PL.newJob({ plan: plan, ts: 1700000000000, kaynakId: "seq-1", kaynakAd: "Röportaj", lang: "tr" });
PL.markDone(job, 0, "sekans", { id: "s1", dikeyId: "d1" });
PL.markDone(job, 0, "altyazi", { ok: true });
PL.markFail(job, 0, "kanca", "Premiere yanıt vermedi");
job.durum = "durdu";
var kayitAltyazi = { mod: "k1", segs: ORTAK.METINLER.vurgu.map(function (c) { return { start: c.start, end: c.end, text: c.text }; }) };
var shorts = { is: job, secim: secimHam, altyazi: kayitAltyazi };
fs.writeFileSync(path.join(CIKTI, "shorts-is.json"), JSON.stringify(shorts, null, 2) + "\n");
var sa = PL.stilAyarlari(job.secim.stilId, null, true, job.secim.efekt, false);
var cc = PL.captionCues(kayitAltyazi, { styleId: job.secim.stilId, lang: job.lang, kase: job.secim.efekt.kase, punct: job.secim.efekt.punct });
var devamOncesi = PL.devamEdilebilir(job);
var dj = PL.resumeJob(JSON.parse(JSON.stringify(job)));
var shortsBeklenen = { dosya: "shorts-is.json", devamEdilebilir: devamOncesi, sonraki: PL.nextStep(dj), stil: sa, cues: cc,
  secimNormalize: PL.secimNormalize(secimHam, null),
  ass: SE.compile({ styleId: job.secim.stilId, cueKind: cc.cueKind, cues: cc.cues, offset: 0, width: 1080, height: 1920, overrides: sa.overrides }).ass };
shortsBeklenen.ass = ORTAK.ozet(shortsBeklenen.ass);

/* ---------------- yaz ---------------- */
fs.copyFileSync(path.join(ESKI, "js", "style-share.js"), path.join(CIKTI, "style-share-" + SURUM + ".js"));
fs.writeFileSync(path.join(CIKTI, "artefaktlar.json"), JSON.stringify({ kaynak: SURUM, eskiStiller: SE.list().map(function (p) { return p.id; }), kodlar: kodlar, sufloStil: sufloStil,
  markaKiti: markaKiti, sablonum: sablonum, capPrefs: capPrefs, shorts: shortsBeklenen }, null, 1) + "\n");
fs.writeFileSync(path.join(CIKTI, "ass-eski.json"), JSON.stringify(ass, null, 1) + "\n");
console.log("yazıldı: " + kodlar.length + " kod, " + Object.keys(ass).length + " ASS (" + Math.round(JSON.stringify(ass).length / 1024) + " KB)");
