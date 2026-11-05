/*
 * After Effects (deneysel) — js/ae-plan.js saf planı: ana uygulama tespiti, K.call eşlemesi (Premiere'de değişmez,
 * AE'de karşılığı olmayan KS_* gönderilmez), katman zamanı (inPoint / startTime / esnetme, kompozisyon sınırı, ret
 * nedenleri), bağlam / klip biçimi, düz plan (kareye oturan, çakışmasız zaman; güvenli bölge; punto sığdırma), stilli
 * plan (önizlemeyle aynı kartlar, kelime dizini anahtarları, *vurgu*, giriş, gölge, kontur, uyarılar), filigran,
 * kayıt işareti ve deterministiklik.
 * Çalıştır: node tests/test-ae-plan.js
 */
var path = require("path");
var ROOT = path.join(__dirname, "..");
var P = require(path.join(ROOT, "js", "ae-plan.js"));
var AE = require(path.join(ROOT, "js", "altyazi-efekt.js"));
var CMJ = require(path.join(ROOT, "js", "caption-mogrt-json.js"));
var SE = require(path.join(ROOT, "js", "style-engine.js"));

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (evidence === undefined ? "" : "   [" + String(evidence).slice(0, 300) + "]")); }
}
function js(x) { return JSON.stringify(x); }
function yakin(a, b, e) { return Math.abs(a - b) <= (e || 1e-6); }

/* ---------------- ana uygulama ---------------- */
ok("uygulamaKodu: AEFT / PPRO (nesne ve JSON metni)", P.uygulamaKodu({ appName: "AEFT", appVersion: "24.0" }) === "AEFT" &&
  P.uygulamaKodu('{"appName":"PPRO"}') === "PPRO" && P.uygulamaKodu({ appId: "aeft" }) === "AEFT");
ok("uygulamaKodu: bilinmeyen / bozuk / boş → \"\" (Premiere davranışı)", P.uygulamaKodu({ appName: "PHXS" }) === "" &&
  P.uygulamaKodu("{bozuk") === "" && P.uygulamaKodu(null) === "" && P.uygulamaKodu(undefined) === "");

/* ---------------- K.call eşlemesi ---------------- */
var pp = P.hostCagrisi("KS_getContext", "PPRO");
ok("Premiere: her çağrı olduğu gibi gider, dönüştürme yok", pp.ad === "KS_getContext" && pp.donustur === null && !pp.engel &&
  P.hostCagrisi("KS_applyCuts", "PPRO").ad === "KS_applyCuts" && P.hostCagrisi("KS_applyCuts", "").ad === "KS_applyCuts");
var a1 = P.hostCagrisi("KS_getContext", "AEFT"), a2 = P.hostCagrisi("KS_getSelectedClips", "AEFT");
ok("AE: bağlam ve seçili klip AE karşılığına, cevap Premiere biçimine", a1.ad === "KSAE_baglam" && a1.donustur === P.baglamSekli &&
  a2.ad === "KSAE_seciliKatmanlar" && a2.donustur === P.klipSekli);
ok("AE: oynatma kafası ve proje klasörü eşlenir", P.hostCagrisi("KS_setPlayerPosition", "AEFT").ad === "KSAE_oynatmaKafasi" &&
  P.hostCagrisi("KS_projectDir", "AEFT").ad === "KSAE_projeKlasoru");
var eng = P.hostCagrisi("KS_importSrtAsCaptions", "AEFT");
ok("AE: karşılığı olmayan KS_* gönderilmez (Türkçe engel)", eng.engel && eng.engel.ok === false && eng.engel.kod === "after-effects" &&
  eng.engel.error === P.HATA.yok && !eng.ad, js(eng));
ok("AE: KSAE_* doğrudan geçer", P.hostCagrisi("KSAE_altyaziOlustur", "AEFT").ad === "KSAE_altyaziOlustur" && !P.hostCagrisi("KSAE_altyaziOlustur", "AEFT").engel);

/* ---------------- katman zamanı ---------------- */
function katman(o) {
  var k = { index: 1, name: "Röportaj.mp4", tur: "dosya", mediaPath: "C:/v/Röportaj.mp4", hasAudio: true, inPoint: 2, outPoint: 12, startTime: -3, stretch: 100, timeRemap: false, compSure: 60 };
  for (var a in o || {}) k[a] = o[a];
  return k;
}
var z = P.katmanKaynagi(katman());
ok("startTime ofseti: kaynak ss = inPoint − startTime, süre = görünen süre", z.ok && yakin(z.ss, 5) && yakin(z.t, 10) && z.clipStart === 2 && z.clipEnd === 12, js(z));
var z2 = P.katmanKaynagi(katman({ stretch: 200, startTime: 1, inPoint: 3, outPoint: 9 }));
ok("esnetme %200: kaynak yarı hızda (ss 1, t 3), zaman çizelgesi 6 sn", z2.ok && yakin(z2.ss, 1) && yakin(z2.t, 3) && z2.clipEnd - z2.clipStart === 6, js(z2));
var z3 = P.katmanKaynagi(katman({ inPoint: -4, outPoint: 70, startTime: -10 }));
ok("kompozisyon dışına taşan kısım okunmaz (0 – süre)", z3.ok && z3.clipStart === 0 && z3.clipEnd === 60 && yakin(z3.ss, 10) && yakin(z3.t, 60), js(z3));
ok("ret: Time Remap / ters esnetme / dosyasız kaynak / sessiz / kompozisyon dışı",
  P.katmanKaynagi(katman({ timeRemap: true })).error === P.HATA.remap &&
  P.katmanKaynagi(katman({ stretch: -100 })).error === P.HATA.ters &&
  P.katmanKaynagi(katman({ tur: "comp", mediaPath: "" })).error === P.HATA.kaynak &&
  P.katmanKaynagi(katman({ hasAudio: false })).error === P.HATA.ses &&
  P.katmanKaynagi(katman({ inPoint: 61, outPoint: 70 })).error === P.HATA.disarida);

var r = { ok: true, comp: { name: "Ana", id: 7, width: 1080, height: 1920, fps: 29.97, duration: 60, time: 4 },
  katmanlar: [katman({ index: 3, inPoint: 20, outPoint: 30, startTime: 20 }), katman({ index: 1, tur: "diger", mediaPath: "" }), katman({ index: 2 })] };
var ks = P.klipSekli(r);
ok("klipSekli: okunabilen katmanlar kompozisyon sırasıyla, Premiere alanlarıyla", ks.ok && ks.clips.length === 2 &&
  ks.clips[0].clipStart === 2 && ks.clips[1].clipStart === 20 && ks.clips[0].mediaPath === "C:/v/Röportaj.mp4" &&
  yakin(ks.clips[0].inPoint, 5) && yakin(ks.clips[0].dur, 10) && ks.clips[0].aeKatman === 2, js(ks));
var tekrar = P.klipSekli({ ok: true, comp: r.comp, katmanlar: [katman(), katman({ index: 5 })] });
ok("klipSekli: aynı dosya aynı anda iki kez seçiliyse tek klip", tekrar.ok && tekrar.clips.length === 1);
ok("klipSekli: kompozisyon yok / okunabilen katman yok → Türkçe neden", P.klipSekli({ ok: true, comp: null, katmanlar: [] }).error === P.HATA.comp &&
  P.klipSekli({ ok: true, comp: r.comp, katmanlar: [katman({ tur: "comp" })] }).error === P.HATA.kaynak &&
  P.klipSekli({ ok: true, comp: r.comp, katmanlar: [] }).error === P.HATA.secim);
ok("klipSekli: host hatası olduğu gibi geçer", P.klipSekli({ ok: false, error: "x" }).error === "x");

var bg = P.baglamSekli(r);
ok("baglamSekli: kompozisyon sekans yerine, 'ae:' kimliği, ses izi seçimi yok", bg.ok && bg.hasSeq && bg.sequence === "Ana" && bg.sequenceId === "ae:7" &&
  bg.width === 1080 && bg.height === 1920 && bg.fps === 29.97 && bg.seqDur === 60 && bg.playhead === 4 && bg.audioTracks.length === 0 && bg.host === "AEFT", js(bg));
ok("baglamSekli: seçili ilk okunabilen katman sel, sayısı selCount", bg.sel && bg.sel.clipStart === 2 && bg.selCount === 2 && bg.sel.dur > 0);
var bg2 = P.baglamSekli({ ok: true, comp: r.comp, katmanlar: [katman({ tur: "comp" })] });
ok("baglamSekli: okunamayan seçimde sel yok, nedeni selUyari", bg2.sel === null && bg2.selCount === 0 && bg2.selUyari === P.HATA.kaynak);
var bg3 = P.baglamSekli({ ok: true, comp: null, katmanlar: [] });
ok("baglamSekli: kompozisyon yoksa hasSeq false", bg3.ok && bg3.hasSeq === false && bg3.sel === null);

/* ---------------- düz plan ---------------- */
var cues = [
  { start: 0.31, end: 2.02, text: "Merhaba *dünya*" },
  { start: 1.9, end: 3.5, text: "İkinci satır\nalt satır" },
  { start: 3.5, end: 3.51, text: "çok kısa" },
  { start: 70, end: 72, text: "kompozisyon dışında" },
  { start: 5, end: 6, text: "   " }
];
var d = P.plan(cues, { mod: "duz", w: 1920, h: 1080, fps: 25, sure: 60, isId: "abc" });
var kare = 1 / 25;
ok("düz: boş ve kompozisyon dışındaki satırlar düşer, gerisi sırayla", d.katmanlar.length === 3 && d.mod === "duz" && d.filigran === null, js(d.katmanlar.map(function (k) { return [k.bas, k.son, k.metin]; })));
ok("düz: zamanlar kareye oturur", d.katmanlar.every(function (k) { return yakin(k.bas * 25, Math.round(k.bas * 25), 1e-4) && yakin(k.son * 25, Math.round(k.son * 25), 1e-4); }));
ok("düz: çakışma yok, her katman en az bir kare", d.katmanlar.every(function (k, i) {
  var s = d.katmanlar[i + 1];
  return k.son - k.bas >= kare - 1e-6 && (!s || s.bas >= k.son - 1e-9);
}), js(d.katmanlar.map(function (k) { return [k.bas, k.son]; })));
ok("düz: *vurgu* işareti yazılmaz, satır kırılımı AE'nin \\r'si", d.katmanlar[0].metin === "Merhaba dünya" && d.katmanlar[1].metin === "İkinci satır\ralt satır");
ok("düz: 16:9'da alt başlık güvenli alanı (%90), ortada, alttan çapa", d.katmanlar[0].konum[0] === 960 && d.katmanlar[0].konum[1] === 972 &&
  js(d.katmanlar[0].capa) === "[0.5,1]");
ok("düz: Arial Bold beyaz, siyah kontur (AE'de 2 × kontur), animasyon / vurgu yok", d.katmanlar[0].yazi.font === "Arial-BoldMT" &&
  js(d.katmanlar[0].yazi.renk) === "[1,1,1]" && d.katmanlar[0].yazi.kontur === 8 && d.katmanlar[0].giris.length === 0 &&
  d.katmanlar[0].aktif === null && d.katmanlar[0].sabitVurgu.length === 0 && d.katmanlar[0].golge === null);
var dk = P.plan([{ start: 0, end: 1, text: "kısa" }], { mod: "duz", w: 1080, h: 1920, fps: 30 });
ok("düz: 9:16'da platform arayüzünün üstü (stil motoru GUVENLI_ALAN %78)", dk.katmanlar[0].konum[1] === Math.round(1920 * SE.GUVENLI_ALAN[2].y * 10) / 10 &&
  dk.katmanlar[0].konum[0] === 540, js(dk.katmanlar[0].konum));
var uzun = P.plan([{ start: 0, end: 1, text: new Array(80).join("a") }], { mod: "duz", w: 1920, h: 1080, fps: 25 });
ok("düz: sığmayan uzun satırda punto küçülür (başlık güvenli genişliği)", uzun.katmanlar[0].yazi.boyut < 60 &&
  79 * uzun.katmanlar[0].yazi.boyut * 0.55 <= 1920 * 0.8 + 1, uzun.katmanlar[0].yazi.boyut);
ok("düz: kompozisyon süresi bilinmiyorsa süre sınırı yok", P.plan([{ start: 100, end: 101, text: "a" }], { mod: "duz", w: 1920, h: 1080, fps: 25 }).katmanlar.length === 1);

/* ---------------- stilli plan ---------------- */
var ayar = AE.gorunum("vurucu").ayar;
var sCues = [{ start: 1, end: 3, text: "Merhaba *dünya* bu bir deneme cümlesi", words: [
  { start: 1, end: 1.4, text: "Merhaba" }, { start: 1.45, end: 1.8, text: "dünya" }, { start: 1.8, end: 1.95, text: "bu" },
  { start: 2, end: 2.2, text: "bir" }, { start: 2.2, end: 2.6, text: "deneme" }, { start: 2.6, end: 3, text: "cümlesi" }] },
  { start: 3.2, end: 5, text: "ikinci satır burada" }];
var o = { mod: "stilli", ayar: ayar, cueKind: "lines", w: 1080, h: 1920, fps: 30, sure: 10, isId: "is1" };
var s = P.plan(sCues, o);
var kartlar = CMJ.satirlar(sCues, ayar, { kadraj: { w: 1080, h: 1920 }, cueKind: "lines" });
ok("stilli: kartlar önizlemeyle aynı (caption-mogrt-json satirlar → stil motoru)", s.katmanlar.length === kartlar.length &&
  s.katmanlar.every(function (k, i) { return k.metin === kartlar[i].text.replace(/\n/g, "\r") && k.kelimeSayisi === kartlar[i].kelimeler.length; }),
  js([s.katmanlar.map(function (k) { return k.metin; }), kartlar.map(function (k) { return k.text; })]));
var nokta = AE.konumNoktasi(ayar, { w: 1080, h: 1920, ornek: { cues: sCues, cueKind: "lines" } });
ok("stilli: konum Altyazı Efektleri noktası (kartın ortası, ortadan çapa)", s.katmanlar.every(function (k) {
  return yakin(k.konum[0], nokta.x / 100 * 1080, 0.06) && yakin(k.konum[1], nokta.y / 100 * 1920, 0.06) && js(k.capa) === "[0.5,0.5]";
}), js([s.katmanlar[0].konum, nokta]));
ok("stilli: yazı tipi PostScript adı, punto kartın sığdırılmış puntosu, kontur 2 × (AE ortadan çizer)", s.katmanlar[0].yazi.font === AE.sablonFontu(ayar) &&
  s.katmanlar[0].yazi.boyut === kartlar[0].fs && s.katmanlar[0].yazi.kontur === 2 * ayar.kontur, js(s.katmanlar[0].yazi));
ok("stilli: renkler 0-1 (AE fillColor), gölge 135° ölçekli", js(s.katmanlar[0].yazi.renk) === "[1,1,1]" && s.katmanlar[0].golge &&
  s.katmanlar[0].golge.aci === 135 && s.katmanlar[0].golge.opak === ayar.golge.opak && s.katmanlar[0].golge.mesafe === ayar.golge.mesafe);
// Etkin kelime anahtarları: her kartta 0..n-1, artan zaman, ilk anahtar kart başında, hepsi kartın içinde
var hepsiDogru = s.katmanlar.every(function (k) {
  var a = k.aktif.anahtarlar;
  if (!a.length || a[0][0] !== k.bas || a[0][1] !== 0) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i][0] < k.bas - 1e-9 || a[i][0] > k.son + 1e-9) return false;
    if (i && !(a[i][0] > a[i - 1][0] && a[i][1] > a[i - 1][1])) return false;
    if (a[i][1] < 0 || a[i][1] >= k.kelimeSayisi) return false;
  }
  return a[a.length - 1][1] === k.kelimeSayisi - 1;
});
ok("stilli: etkin kelime dizini 0 → son kelime, artan zamanla, kartın içinde", hepsiDogru, js(s.katmanlar.map(function (k) { return k.aktif.anahtarlar; })));
ok("stilli: etkin kelime vurgu rengi + Zıpla büyütmesi (%112)", js(s.katmanlar[0].aktif.renk) === js([1, 0.902, 0]) && s.katmanlar[0].aktif.olcek === 112);
var vurguluKart = s.katmanlar.filter(function (k) { return k.sabitVurgu.length; })[0];
ok("stilli: *vurgu*lu kelime kendi dizininde sabit renk (yıldızsız metin)", vurguluKart && vurguluKart.sabitVurgu[0].i1 === vurguluKart.sabitVurgu[0].i0 + 1 &&
  vurguluKart.metin.split(/[ \r]/)[vurguluKart.sabitVurgu[0].i0] === "dünya" && vurguluKart.metin.indexOf("*") === -1, js(vurguluKart));
ok("stilli: Pop girişi ölçek 0 → 100, 0,3 sn (stil motorunun T'si)", s.katmanlar.every(function (k) {
  var g = k.giris[0];
  return g.ozellik === "olcek" && g.anahtarlar[0][0] === k.bas && js(g.anahtarlar[0][1]) === "[0,0]" && yakin(g.anahtarlar[1][0] - k.bas, Math.min(0.3, k.son - k.bas), 1e-6);
}));
ok("stilli: Zıpla uyarısı (AE'de büyütme)", s.uyarilar.length === 1 && s.uyarilar[0] === P.UYARI.zipla, js(s.uyarilar));

function gorunumPlani(id, ek) {
  var a = AE.gorunum(id).ayar;
  for (var k in ek || {}) a[k] = ek[k];
  return P.plan(sCues, { mod: "stilli", ayar: a, w: 1920, h: 1080, fps: 25, isId: "g" });
}
var kutulu = gorunumPlani("kutulu");
ok("Kutulu: arka plan kutusu uyarısı; kontursuz; Belirme girişi opaklık 0 → 100; vurgu animatörü ölçeksiz", kutulu.uyarilar.indexOf(P.UYARI.kutu) !== -1 &&
  kutulu.katmanlar[0].yazi.kontur === 0 && kutulu.katmanlar[0].giris[0].ozellik === "opaklik" && kutulu.katmanlar[0].giris[0].anahtarlar[0][1] === 0 &&
  kutulu.katmanlar[0].aktif.olcek === null && kutulu.katmanlar[0].golge === null);
var glitch = gorunumPlani("glitch");
ok("Glitch: kelime hareketi uyarısı; Aşağı kay girişi konum yukarıdan iner", glitch.uyarilar.indexOf(P.UYARI.aktif) !== -1 &&
  glitch.katmanlar[0].giris[0].ozellik === "konum" && glitch.katmanlar[0].giris[0].anahtarlar[0][1][1] < glitch.katmanlar[0].konum[1] &&
  js(glitch.katmanlar[0].giris[0].anahtarlar[1][1]) === js(glitch.katmanlar[0].konum));
var zarif = gorunumPlani("zarif");
ok("Zarif: Yukarı kay girişi aşağıdan gelir; uyarı yok", zarif.uyarilar.length === 0 && zarif.katmanlar[0].giris[0].anahtarlar[0][1][1] > zarif.katmanlar[0].konum[1]);
var vurgusuz = gorunumPlani("temiz", { vurgu: false });
ok("Vurgu kapalı ve kelime hareketi yok: etkin kelime animatörü yok", vurgusuz.katmanlar.every(function (k) { return k.aktif === null; }));
var italik = gorunumPlani("temiz", { italik: true });
ok("İtalik isteği plana geçer (host yazamazsa uyarır)", italik.katmanlar[0].yazi.italik === true);

/* ---------------- filigran, işaret, deterministiklik ---------------- */
var f = P.plan(sCues, { mod: "stilli", ayar: ayar, w: 1920, h: 1080, fps: 25, sure: 30, filigran: true, isId: "x" });
ok("deneme: sağ üstte suflo.app filigran katmanı, kompozisyon boyunca, ~%60 opak", f.filigran && f.filigran.metin === "suflo.app" &&
  f.filigran.bas === 0 && f.filigran.son === 30 && f.filigran.opaklik === 60 && js(f.filigran.capa) === "[1,0]" && f.filigran.konum[0] > 1800 && f.filigran.konum[1] < 60 &&
  f.filigran.tur === "filigran", js(f.filigran));
ok("deneme: kompozisyon süresi bilinmiyorsa filigran son altyazıya kadar", P.plan(sCues, { mod: "stilli", ayar: ayar, w: 1920, h: 1080, fps: 25, filigran: true }).filigran.son === 5);
ok("Pro: filigran yok; altyazı yoksa filigran da yok", P.plan(sCues, { mod: "stilli", ayar: ayar, filigran: false }).filigran === null &&
  P.plan([], { mod: "stilli", ayar: ayar, filigran: true }).filigran === null);
ok("kayıt işareti: plan ve yorum aynı önek, ASCII; etiket rengi", s.isaret === P.ISARET && /^[\x20-\x7e]+$/.test(P.ISARET) && s.etiket === P.ETIKET &&
  P.yorum("is1", "satir") === "Suflo altyazi | is1 | satir" && P.suflonunMu(P.yorum("a", "filigran")) && !P.suflonunMu("Kullanıcı notu") && !P.suflonunMu(""));
ok("katman adı sıra numaralı, uzun metin kısaltılır", s.katmanlar[0].ad.indexOf("Suflo 001 · ") === 0 &&
  P.plan([{ start: 0, end: 1, text: new Array(60).join("b") }], { mod: "duz" }).katmanlar[0].ad.length <= 12 + 32);
ok("deterministik: aynı girdi aynı plan (JSON eşit), sürüm 1", js(P.plan(sCues, o)) === js(s) && s.surum === 1 && s.isId === "is1");
ok("plan girdiyi değiştirmez", sCues[0].text === "Merhaba *dünya* bu bir deneme cümlesi" && sCues[0].start === 1);
ok("aeMetni: kontrol karakterleri boşluk, boş satır düşer, CRLF tek kırılım", P.aeMetni("a\u0007b\r\n\n  c  ") === "a b\rc" && P.aeMetni(null) === "");
ok("MIN_SURUM manifestteki AEFT alt sınırıyla aynı", new RegExp('<Host Name="AEFT" Version="\\[' + P.MIN_SURUM + '\\.0,').test(require("fs").readFileSync(path.join(ROOT, "CSXS", "manifest.xml"), "utf8")));

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
