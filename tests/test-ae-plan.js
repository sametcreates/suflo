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
// İnceleme bulgusu: düz kip uzun satırı sarmıyordu; punto 12'ye iniyor, yazı yine kadrajdan taşıyordu (Premiere'in caption izi sarar)
var orta = "Bu altyazı satırı içe aktarılan bir SRT dosyasından geliyor ve tek satıra sığmıyor.";
var ds = P.plan([{ start: 0, end: 2, text: orta }], { mod: "duz", w: 1920, h: 1080, fps: 25 }).katmanlar[0];
var dsSatir = ds.metin.split("\r");
ok("düz: iki satıra sığan uzun satır dengeli sarılır, punto temelde kalır (küçülmez)", dsSatir.length === 2 && ds.yazi.boyut === 60 &&
  dsSatir.every(function (s) { return s.length * 60 * 0.55 <= 1920 * 0.8 + 1; }) && dsSatir.join(" ") === orta &&
  Math.abs(dsSatir[0].length - dsSatir[1].length) <= 12 && ds.kelimeSayisi === orta.split(" ").length, js(ds.metin) + " " + ds.yazi.boyut);
var cokUzun = new Array(31).join("kelime kel ").replace(/ $/, "");   // 329 karakter
var dc = P.plan([{ start: 0, end: 2, text: cokUzun }], { mod: "duz", w: 1080, h: 1920, fps: 30 }).katmanlar[0];
var dcSatir = dc.metin.split("\r");
ok("düz: iki satıra sığmayan metin de kadraj içinde kalır (her satır güvenli genişlikte, yükseklik alt güvenli bölgenin üstünde)",
  dcSatir.length > 2 && dc.yazi.boyut >= 12 && dcSatir.every(function (s) { return s.length * dc.yazi.boyut * 0.55 <= 1080 * 0.8 + 1; }) &&
  dcSatir.length * dc.yazi.boyut * 1.2 <= dc.konum[1] && dcSatir.join(" ") === cokUzun, dcSatir.length + " satır, punto " + dc.yazi.boyut);
ok("düz: kısa satır ve kendi \\r kırılımı aynen kalır", d.katmanlar[1].metin === "İkinci satır\ralt satır" && d.katmanlar[1].yazi.boyut === 60);

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
ok("Kutulu: arka plan kutusu planı (uyarı yok); kontursuz; Belirme girişi opaklık 0 → 100; vurgu animatörü ölçeksiz", kutulu.uyarilar.length === 0 &&
  kutulu.katmanlar.every(function (k) { return k.kutu && k.kutu.opak === 65 && js(k.kutu.renk) === "[0,0,0]"; }) &&
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
// İnceleme bulgusu: işaret ayraçsız aranıyordu; "Suflo altyazi" ile BAŞLAYAN kullanıcı notu da Suflo'nun sayılıyordu
ok("kayıt işareti: yalnız ayraçlı önek Suflo'nun; 'Suflo altyazisi …' ve çıplak 'Suflo altyazi' değil",
  !P.suflonunMu("Suflo altyazisi icin referans") && !P.suflonunMu("Suflo altyazi") && !P.suflonunMu("Suflo altyazi|x") && P.suflonunMu(P.yorum("", "satir")));
ok("katman adı sıra numaralı, uzun metin kısaltılır", s.katmanlar[0].ad.indexOf("Suflo 001 · ") === 0 &&
  P.plan([{ start: 0, end: 1, text: new Array(60).join("b") }], { mod: "duz" }).katmanlar[0].ad.length <= 12 + 32);
// İnceleme bulgusu: 31 kod biriminde kesim emoji vekil çiftini bölüp tek başına yüksek vekil bırakıyordu
function yalnizVekil(t) { return /[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/.test(t); }
var emojiAd = P.plan([{ start: 0, end: 1, text: new Array(31).join("a") + "😀 bbbbbbbb" }], { mod: "duz" }).katmanlar[0].ad;
var emojiAd2 = P.plan([{ start: 0, end: 1, text: new Array(30).join("a") + "😀 bbbbbbbb" }], { mod: "duz" }).katmanlar[0].ad;
ok("katman adı: kesim emoji vekil çiftini bölmez (31. kod birimi yüksek vekilse bir önceden kesilir)", !yalnizVekil(emojiAd) && !yalnizVekil(emojiAd2) &&
  /a…$/.test(emojiAd) && /😀…$/.test(emojiAd2), js([emojiAd, emojiAd2]));
ok("deterministik: aynı girdi aynı plan (JSON eşit), sürüm 2 (animatörlü plan)", js(P.plan(sCues, o)) === js(s) && s.surum === 2 && s.isId === "is1");
ok("plan girdiyi değiştirmez", sCues[0].text === "Merhaba *dünya* bu bir deneme cümlesi" && sCues[0].start === 1);
ok("aeMetni: kontrol karakterleri boşluk, boş satır düşer, CRLF tek kırılım", P.aeMetni("a\u0007b\r\n\n  c  ") === "a b\rc" && P.aeMetni(null) === "");
/* ---------------- kalite motoru (parti 1): kart / satır kırılım dili ---------------- */
(function () {
  var dc = [{ start: 0, end: 2, text: "Sen bunu yapabilir misin acaba" }];
  var da = AE.normalize({ kelime: 4, satir: 1, giris: "yok" });
  function metinler(dil, mod) {
    var o = { mod: mod, ayar: da, cueKind: "lines", w: 1920, h: 1080, fps: 25, sure: 5, isId: "d" };
    if (dil !== undefined) o.dil = dil;
    return P.plan(dc, o).katmanlar.filter(function (k) { return k.tur !== "filigran"; }).map(function (k) { return k.metin; }).join("|");
  }
  ok("stilli plan o.dil: kartlar önizleme / yerel çıktıyla aynı dilde (tr: soru eki kart başında değil; de: yalnız denge; yok: tr + en)",
    metinler("tr", "stilli") === "Sen bunu|yapabilir misin acaba" && metinler("de", "stilli") === "Sen bunu yapabilir|misin acaba" &&
    metinler(undefined, "stilli") === metinler("tr", "stilli") &&
    js(CMJ.satirlar(dc, da, { kadraj: { w: 1920, h: 1080 }, cueKind: "lines", dil: "de" }).map(function (x) { return x.text; })) === js(["Sen bunu yapabilir", "misin acaba"]),
    js([metinler("tr", "stilli"), metinler("de", "stilli")]));
  var panelKaynak = require("fs").readFileSync(path.join(ROOT, "js", "ae-panel.js"), "utf8");
  var capKaynak = require("fs").readFileSync(path.join(ROOT, "js", "captions.js"), "utf8");
  ok("AE paneli planı altyazının diliyle kurar (KCaptions.aeVerisi → plan o.dil)", /isId: isKimligi\(\), dil: v\.dil \}\);/.test(panelKaynak) &&
    (capKaynak.slice(capKaynak.indexOf("aeVerisi: function (stilli)")).match(/dil: kirilimDili\(\)/g) || []).length >= 2);
  var uzunDuz = [{ start: 0, end: 3, text: "Bu işi gerçekten yapabilir misin, yoksa bırakalım mı? Peki ya sonra ne olacak" }];
  var duzTr = P.plan(uzunDuz, { mod: "duz", w: 1080, h: 1920, fps: 25, sure: 5, isId: "d", dil: "tr" }).katmanlar[0].metin;
  ok("düz plan o.dil: uzun satır Türkçe-duyarlı sarılır (soru eki satır başında değil), kelime düşmez",
    !/\rmisin/.test(duzTr) && duzTr.replace(/\r/g, " ") === uzunDuz[0].text, js(duzTr));
})();


/* ---------------- Parti 7: yazı animasyonlarının After Effects planı ---------------- */
var YA = require(path.join(ROOT, "js", "yazi-animasyonlari.js"));
var aCues = [{ start: 1, end: 3.4, text: "Merhaba *dünya* bu bir deneme cümlesi", words: [
  { start: 1, end: 1.4, text: "Merhaba" }, { start: 1.45, end: 1.8, text: "dünya" }, { start: 1.8, end: 1.95, text: "bu" },
  { start: 2, end: 2.2, text: "bir" }, { start: 2.2, end: 2.6, text: "deneme" }, { start: 2.6, end: 3.4, text: "cümlesi" }] },
  { start: 3.6, end: 6, text: "ikinci kart burada sakin" }, { start: 6, end: 6.3, text: "çok kısa kart" }];
function aAyar(id, ek) { var a = AE.gorunum("temiz").ayar; a.anim = id; for (var k in ek || {}) a[k] = ek[k]; return a; }
function aPlan(id, ek, kad) {
  kad = kad || {};
  return P.plan(aCues, { mod: "stilli", ayar: aAyar(id, ek), cueKind: "lines", w: kad.w || 1920, h: kad.h || 1080, fps: kad.fps || 25, sure: 60, isId: "a" });
}
// Planın bütün anahtar listeleri: { ad, liste, bas, son }
function anahtarListeleri(k) {
  var out = [];
  k.animatorler.forEach(function (a) {
    ["baslangicAnahtarlari", "sonAnahtarlari", "ofsetAnahtarlari", "miktarAnahtarlari"].forEach(function (f) { if (a.secici[f]) out.push({ ad: a.ad + "." + f, liste: a.secici[f], a: a }); });
    Object.keys(a.anahtarlar || {}).forEach(function (f) { out.push({ ad: a.ad + "." + f, liste: a.anahtarlar[f], a: a }); });
  });
  k.katmanAnahtarlari.forEach(function (e) { out.push({ ad: "katman." + e.ozellik, liste: e.anahtarlar }); });
  return out;
}
function harfSay(t) { return (t.match(/[\ud800-\udbff][\udc00-\udfff]|[^\s]/g) || []).length; }
var hatalar = [], destek = {};
YA.ANIMASYONLAR.forEach(function (kayit) {
  var id = kayit.id, pl = aPlan(id), d = P.aeDestegi(id), e = [];
  destek[id] = d;
  if (js(aPlan(id)) !== js(pl)) e.push("deterministik değil");
  if (kayit.ae !== d) e.push("katalog ae " + kayit.ae + " ≠ plan " + d);
  var adim = "«" + kayit.ad + "»";
  if (d === "yok") {
    // Klasik çift: katmanlar, katalogdaki klasik giriş / vurgu çiftiyle kurulan planla aynı; uyarı adıyla
    var kl = P.plan(aCues, { mod: "stilli", ayar: aAyar("", { giris: kayit.klasik.giris, aktif: kayit.klasik.aktif }), cueKind: "lines", w: 1920, h: 1080, fps: 25, sure: 60, isId: "a" });
    if (js(pl.katmanlar) !== js(kl.katmanlar)) e.push("klasik yedekle aynı değil");
    if (pl.uyarilar[0] !== P.UYARI.animYok.replace("{}", kayit.ad)) e.push("yok uyarısı");
  } else {
    if (pl.uyarilar.filter(function (u) { return u.indexOf(adim) === 0; }).length !== (d === "yakin" ? 1 : 0)) e.push("uyarı sayısı");
    if (d === "yakin" && pl.uyarilar.indexOf(P.UYARI.animYakin.replace("{}", kayit.ad).replace("{}", P.NOTLAR[id])) === -1) e.push("yakın uyarısı / not");
    if (d === "yakin" && !P.NOTLAR[id]) e.push("not yok");
  }
  pl.katmanlar.forEach(function (k) {
    if (k.animasyon !== (d === "yok" ? "" : id)) e.push("animasyon alanı");
    if (d !== "yok") {
      if (!k.animatorler.length && !k.katmanAnahtarlari.length && !k.maske && k.son - k.bas > 1) e.push("yerel çıktı boş " + k.metin);
      if (k.giris.length) e.push("klasik giriş de var");
    }
    var kelimeN = k.kelimeSayisi, harfN = harfSay(k.metin);
    anahtarListeleri(k).forEach(function (L) {
      var l = L.liste;
      if (!l.length) { e.push(L.ad + " boş"); return; }
      for (var i = 0; i < l.length; i++) {
        if (l[i][0] < k.bas - 1e-9 || l[i][0] > k.son + 1e-9) e.push(L.ad + " katman dışı " + l[i][0]);
        if (i && !(l[i][0] > l[i - 1][0])) e.push(L.ad + " zaman artmıyor");
        if (L.a && L.a.secici.birim === "indeks" && /Anahtarlari$/.test(L.ad) && !/miktar/.test(L.ad)) {
          var ust = L.a.tabani === "kelime" ? kelimeN : harfN;
          if (l[i][1] < 0 || l[i][1] > ust) e.push(L.ad + " dizin sınır dışı " + l[i][1] + "/" + ust);
          if (i && /baslangic|sonA/.test(L.ad) && L.a.secici.tut !== true && !(L.a.secici.tut instanceof Array) && l[i][1] < l[i - 1][1]) e.push(L.ad + " süpürme geri gidiyor");
        }
        if (/miktar/.test(L.ad) && (l[i][1] < -100 || l[i][1] > 100)) e.push("miktar aralık dışı");
      }
    });
    k.animatorler.forEach(function (a) {
      var s = a.secici;
      if (["karakter", "kelime"].indexOf(a.tabani) === -1) e.push(a.ad + " taban");
      if (s.birim !== "indeks" && s.birim !== "yuzde") e.push(a.ad + " birim");
      if (s.birim === "yuzde" && !(s.baslangic === 0 && s.son === 100)) e.push(a.ad + " yüzde aralığı");
      // Gizliden açığa süpürme: Son birim sayısı (kelime ya da boşluksuz harf)
      if (s.birim === "indeks" && typeof s.son === "number" && s.baslangicAnahtarlari && !s.sonAnahtarlari && s.son !== (a.tabani === "kelime" ? kelimeN : harfN)) e.push(a.ad + " son ≠ birim sayısı");
      if (/^Suflo/.test(a.ad) === false) e.push("ad");
    });
  });
  if (e.length) hatalar.push(id + ": " + e.slice(0, 3).join(" | "));
});
ok("her katalog animasyonu: plan deterministik; anahtarlar zamanca artan ve katmanın in / out'u içinde; dizinler birim sayısında; birimler doğru; ae alanı plana uyar ('yok' → klasik yedek + uyarı, 'yakin' → adlı not)",
  hatalar.length === 0, hatalar.join(" || "));
ok("AE desteği: tam / yakın / yok dağılımı (yok yalnız süs katmanlı vurgu ailesi)", js(Object.keys(destek).filter(function (k) { return destek[k] === "yok"; }).sort()) ===
  js(["kromatik-yumusak", "parlama", "vurgu-cizgi", "vurgu-kutusu"]) && Object.keys(destek).filter(function (k) { return destek[k] === "tam"; }).length >= 10, js(destek));

// Animasyon seçilince klasik giriş / vurgu yerine metin animatörleri; *anahtar* kelime rengi kalır
var kp = aPlan("kelime-pop").katmanlar[0];
ok("kelime pop: Scale 0 kelime animatörü, Start her kelimenin penceresinde i → i + 1, kelime gruplaması, klasik Pop girişi yok, *vurgu* sabit",
  kp.animatorler.length === 1 && js(kp.animatorler[0].ozellikler) === '{"olcek":[0,0,100]}' && kp.animatorler[0].tabani === "kelime" &&
  kp.animatorler[0].secici.son === kp.kelimeSayisi && kp.kelimeSayisi === 2 && kp.animatorler[0].secici.baslangicAnahtarlari[0][0] === kp.bas && kp.gruplama === "kelime" && kp.giris.length === 0 &&
  kp.sabitVurgu.length === 1 && kp.aktif && kp.aktif.olcek === null, js(kp.animatorler[0].secici));
var rg = aPlan("renk-gecis", { vurgu: false }).katmanlar[0];
ok("renk geçişi: vurgu rengine kayan [Başlangıç, Son) aralığı (doğrusal), etkin kelime animasyonun kendisi (klasik etkin kelime yok)",
  rg.aktif === null && js(rg.animatorler[0].ozellikler.dolguRengi) === js([1, 0.8235, 0.2471]) && rg.animatorler[0].secici.sonAnahtarlari[1][1] === 1 &&
  rg.animatorler[0].secici.baslangicAnahtarlari.every(function (a, i, l) { return !i || a[1] >= l[i - 1][1]; }) && !rg.animatorler[0].secici.tut);
var it2 = aPlan("iki-ton", { vurguRenk2: "#00ff00" }).katmanlar[0];
ok("iki ton: iki renk animatörü (vurgu / ikinci vurgu), çift ve tek kelimeler; *anahtar* kelime de sırasının rengini alır",
  it2.animatorler.length === 2 && js(it2.animatorler[1].ozellikler.dolguRengi) === "[0,1,0]" && it2.sabitVurgu[0].i0 === 1 && js(it2.sabitVurgu[0].renk) === "[0,1,0]" &&
  it2.animatorler[0].secici.sonAnahtarlari.some(function (a) { return a[1] === 0; }));
var nt = aPlan("netles").katmanlar[0], al = aPlan("aralik-acil").katmanlar[0];
ok("netleş: Blur animatörü (kartın tamamı, yüzde) 10 → 0 ve katman opaklığı; sinematik aralık: Tracking (1/1000 em) genişten 0'a",
  nt.animatorler[0].secici.birim === "yuzde" && js(nt.animatorler[0].anahtarlar.bulaniklik[0][1]) === "[10,10]" && js(nt.animatorler[0].anahtarlar.bulaniklik[1][1]) === "[0,0]" &&
  nt.katmanAnahtarlari[0].ozellik === "opaklik" && al.animatorler[0].anahtarlar.izleme[0][1] === Math.round(18 / al.yazi.boyut * 1000) &&
  al.animatorler[0].anahtarlar.izleme[2][1] === 0);
var nf = aPlan("nefes").katmanlar;
ok("nefes: katman ölçeği 100 ↔ 103, kart sonundan önce 100'de; çok kısa kartta anahtar yok", nf[1].katmanAnahtarlari[0].ozellik === "olcek" &&
  nf[1].katmanAnahtarlari[0].anahtarlar.every(function (a) { return a[1][0] === 100 || a[1][0] === 103; }) &&
  nf[1].katmanAnahtarlari[0].anahtarlar[nf[1].katmanAnahtarlari[0].anahtarlar.length - 1][1][0] === 100 &&
  nf[1].katmanAnahtarlari[0].anahtarlar[nf[1].katmanAnahtarlari[0].anahtarlar.length - 1][0] <= nf[1].son - 0.15 + 1e-6 &&
  nf[nf.length - 1].son - nf[nf.length - 1].bas < 0.5 && nf[nf.length - 1].katmanAnahtarlari.length === 0, js(nf.map(function (k) { return [k.metin, k.katmanAnahtarlari.length]; })));
var pr = aPlan("perde").katmanlar[0];
ok("perde: sourceRectAtTime'a bağlı maske yolu ifadesi (createPath) ve hafif yükselme", pr.maske && /sourceRectAtTime\(T, false\)/.test(pr.maske.ifade) &&
  /createPath\(/.test(pr.maske.ifade) && /linear\(time, 1, /.test(pr.maske.ifade) && pr.katmanAnahtarlari[0].ozellik === "konum");

// Kutu: metne bağlı şekil katmanının planı; ölçü sourceRectAtTime, yatay pay piksel en-boyuna göre, kutu ölçeklenmez / dönmez
var ku = aPlan("donerek", { kutu: true, kutuRenk: "#112233", kutuOpak: 80 }).katmanlar[0].kutu;
ok("kutu: renk / opaklık ayardan, pay 20 (1080 tabanı) ve puntonun %10'u, ifadeler sourceRectAtTime + pixelAspect + üst katmanın ölçek / dönmesini geri alır",
  ku && js(ku.renk) === js([0.0667, 0.1333, 0.2]) && ku.opak === 80 && ku.payX === 20 && ku.izle === false &&
  /parent\.sourceRectAtTime\(T, false\)/.test(ku.ifade.boyut) && /thisComp\.pixelAspect/.test(ku.ifade.boyut) && /10000 \/ v/.test(ku.ifade.olcek) &&
  ku.ifade.donme === "-parent.transform.rotation" && /parent\.fromComp\(parent\.toComp\(/.test(ku.ifade.konum) && /, T\)\)$/.test(ku.ifade.konum), js(ku));
ok("kutu kapalıyken plan yok; klasik Yukarı kay girişinde kutu kartla kayar (izle)", aPlan("netles").katmanlar[0].kutu === null &&
  P.plan(aCues, { mod: "stilli", ayar: Object.assign(AE.gorunum("zarif").ayar, { kutu: true }), w: 1920, h: 1080, fps: 25 }).katmanlar[0].kutu.izle === true &&
  aPlan("yandan-kay", { kutu: true }).katmanlar[0].kutu.izle === true);
ok("kutu ifadeleri ASCII ve ES3 (var / for; let / => yok: eski ifade motoru da çalıştırır)", [ku.ifade.konum, ku.ifade.olcek, ku.ifade.boyut, pr.maske.ifade].every(function (x) {
  return /^[\x09\x0a\x20-\x7e]+$/.test(x) && !/\blet\b|\bconst\b|=>|`/.test(x);
}));

// Ölçek: 4K ve dikey kadraj, kare olmayan piksel
var k4 = aPlan("yukari-suzul", { kutu: true }, { w: 3840, h: 2160 }).katmanlar[0], k1 = aPlan("yukari-suzul", { kutu: true }).katmanlar[0];
ok("4K: kayma, kutu payı ve punto kısa kenarla ölçeklenir (×2)", k4.animatorler[0].ozellikler.konum[1] === 2 * k1.animatorler[0].ozellikler.konum[1] &&
  k4.kutu.payX === 2 * k1.kutu.payX && Math.abs(k4.yazi.boyut - 2 * k1.yazi.boyut) <= 1, js([k4.animatorler[0].ozellikler, k1.animatorler[0].ozellikler]));
var kd = aPlan("yandan-kay", {}, { w: 1080, h: 1920 }).katmanlar[0];
ok("9:16: yandan kayış genişliğin %8'i (kompozisyon pikseli), kayma 1080 tabanında", kd.katmanAnahtarlari[0].anahtarlar[0][1][0] === yuvarla2(kd.konum[0] - Math.round(1080 * 0.08)));
function yuvarla2(v) { return Math.round(v * 10) / 10; }
var kare29 = aPlan("daktilo", {}, { fps: 29.97 });
ok("29,97 fps: kart sınırları kareye oturur, anahtarlar kart içinde", kare29.katmanlar.every(function (k) {
  return anahtarListeleri(k).every(function (L) { return L.liste.every(function (a) { return a[0] >= k.bas - 1e-9 && a[0] <= k.son + 1e-9; }); });
}));

// Uzun transkript: plan kart başına doğrusal (yüzlerce kart)
var uzun = [];
for (var u = 0; u < 600; u++) uzun.push({ start: u * 2, end: u * 2 + 1.8, text: "bir iki üç dört beş altı" });
var t0 = Date.now(), pu = P.plan(uzun, { mod: "stilli", ayar: aAyar("karaoke-dolgu", { kutu: true }), w: 1920, h: 1080, fps: 25, isId: "u" }), sure = Date.now() - t0;
ok("uzun transkript: 600 kart planı hızlı ve her kartın anahtarı kendi kelime / harf sayısıyla sınırlı", pu.katmanlar.length >= 600 && sure < 5000 &&
  pu.katmanlar.every(function (k) { return anahtarListeleri(k).every(function (L) { return L.liste.length <= 2 * harfSay(k.metin) + 4; }); }), sure + " ms");
ok("klasik görünümde yazı animasyonu alanları boş (eski çıktı aynı)", s.katmanlar.every(function (k) { return k.animasyon === "" && !k.animatorler.length && !k.katmanAnahtarlari.length &&
  k.maske === null && k.ucBoyut === false && k.kutu === null && k.gruplama === "kelime"; }));

ok("MIN_SURUM manifestteki AEFT alt sınırıyla aynı", new RegExp('<Host Name="AEFT" Version="\\[' + P.MIN_SURUM + '\\.0,').test(require("fs").readFileSync(path.join(ROOT, "CSXS", "manifest.xml"), "utf8")));

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
