// Suflo testi: altyazı hattının bulanık (fuzz) sağlamlaştırması. Bağımlılıksız, tohumlu PRNG (mulberry32): aynı tohum
// aynı girdileri üretir; başarısız örnek tohum + sıra numarasıyla yeniden üretilebilir (SUFLO_FUZZ_TOHUM=<sayı>).
// Girdi: 0-200 kelimelik rastgele transkript (sıfır uzunluklu, çakışan, sırasız kelimeler; dev boşluklar; emoji; Arapça;
// büyük / küçük Türkçe İ / ı; kapanmamış dahil *vurgu*; 80 karakterlik kelime; yalnız noktalama; konuşmacı), her hazır
// görünüm × (örneklenmiş) her yazı animasyonu × {1920x1080, 1080x1920 güvenli açık / kapalı, 1080x1080, 1440x1080} ×
// şiddet {soft, balanced, hard}. Denetimler:
//  - compile asla fırlatmaz; ASS'te NaN / undefined / Infinity yok; her Dialogue 10 alan, başlangıç < bitiş, zamanlar ≥ 0
//  - \pos ve \move kadrajın ±%10'u içinde; punto (\fs) parti 1'in okunabilirlik tabanının altında değil
//  - caption-mogrt-json satirlar geçerli; ae-plan plan() geçerli ve belirlenimci
//  - caption-layout kelimedenSatirlar her kelimeyi tam bir kez ve sırayla verir; SufloStilKodu encode / decode gidip gelir
// Süre bütçesi: rastgele evre BUTCE_MS ile sınırlı (bütün test 60 sn'nin altında).
var path = require("path");
var KOK = path.join(__dirname, "..");
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
var YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
var SK = require(path.join(KOK, "js", "stil-kodu.js"));
var SS = require(path.join(KOK, "js", "style-share.js"));
var CL = require(path.join(KOK, "js", "caption-layout.js"));
var CMJ = require(path.join(KOK, "js", "caption-mogrt-json.js"));
var AP = require(path.join(KOK, "js", "ae-plan.js"));

var TOHUM = Number(process.env.SUFLO_FUZZ_TOHUM) || 20261106;
var BUTCE_MS = 30000, EN_COK = 4000;
var gecen = 0, toplam = 0, hatalar = [];
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 600) + "]" : "")); }
function J(x) { return JSON.stringify(x); }

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var R = mulberry32(TOHUM);
function sec(liste) { return liste[Math.floor(R() * liste.length)]; }
function olas(p) { return R() < p; }

var SOZLUK = ["bugün", "gerçekten", "şaşırdı", "çok", "güzel", "bir", "gün", "değil", "mi", "İSTANBUL", "ılık", "IŞIK", "işık", "İyi", "ığdır",
  "kapı", "ağaç", "öğrenci", "üzüm", "Çarşı", "ŞİMDİ", "hello", "world", "the", "and", "ve", "ama", "çünkü", "müdür", "acaba"];
var TUHAF = ["🔥", "😂👍", "مرحبا", "شكرا جزيلا", "...", "—", "!?", ",", "*", "**", "*vurgu*", "*yarım", "kapanmadı*", "*iki kelime*",
  new Array(81).join("x"), "a" + new Array(80).join("ğ"), "İİİııı", "\u200b", "%100", "2.000", "#etiket", "@kişi", "\"tırnak\"", "{\\b1}etiket"];

// Rastgele transkript: kelime cue'ları { start, end, text, speaker? }
function transkript() {
  var n = olas(0.05) ? 0 : Math.floor(R() * 201);
  var t = R() * 2, out = [];
  for (var i = 0; i < n; i++) {
    var w = olas(0.25) ? sec(TUHAF) : sec(SOZLUK);
    if (olas(0.08)) w = "*" + w + "*";
    if (olas(0.05)) w += sec([".", "?", "!", ","]);
    var sure = olas(0.06) ? 0 : 0.05 + R() * 0.8;
    var bas = t;
    if (olas(0.05)) bas = Math.max(0, t - R() * 1.5);           // önceki kelimeyle çakışır
    if (olas(0.02)) t += 200 + R() * 400;                         // dev boşluk
    var c = { start: Math.round(bas * 1000) / 1000, end: Math.round((bas + sure) * 1000) / 1000, text: w };
    if (olas(0.3)) c.speaker = Math.floor(R() * 3);
    out.push(c);
    t = bas + sure + R() * 0.3;
  }
  // sırasız: birkaç komşu yer değiştirir
  for (var s = 0; s < Math.floor(n / 20); s++) { var a = Math.floor(R() * n), b = Math.min(n - 1, a + 1); var x = out[a]; out[a] = out[b]; out[b] = x; }
  return out;
}
// Kelimelerden satır cue'ları (cueKind "lines")
function satirlaraTopla(ws) {
  var out = [];
  for (var i = 0; i < ws.length; i += 1 + Math.floor(R() * 7)) {
    var parca = ws.slice(i, i + 1 + Math.floor(R() * 7));
    out.push({ start: parca[0].start, end: Math.max.apply(null, parca.map(function (w) { return w.end; })), text: parca.map(function (w) { return w.text; }).join(" "),
      speaker: parca[0].speaker });
  }
  return out;
}

var KADRAJLAR = [{ w: 1920, h: 1080, g: false }, { w: 1080, h: 1920, g: true }, { w: 1080, h: 1920, g: false }, { w: 1080, h: 1080, g: false },
  { w: 1440, h: 1080, g: false }];
var SIDDET = ["soft", "balanced", "hard"];
var ESKI_STILLER = SE.list().map(function (p) { return p.id; }).filter(function (id) { return id !== "efekt"; });
var ANIMLER = [""].concat(YA.kimlikler());

function zaman(s) { var p = s.split(":"); return Number(p[0]) * 3600 + Number(p[1]) * 60 + Number(p[2]); }
// ASS denetimi; sorun listesi döner
function assDenetle(ass, w, h, styleId, ov) {
  var sorun = [];
  if (/NaN|undefined|Infinity/.test(ass)) sorun.push("NaN/undefined/Infinity: " + (/.{0,60}(NaN|undefined|Infinity).{0,20}/.exec(ass) || [""])[0]);
  var enAz = Math.max(1, Math.round(30 * Math.min(w, h) / 1080));
  ass.split("\n").forEach(function (l) {
    if (!/^Dialogue:/.test(l)) return;
    var f = l.slice(10).split(",");
    if (f.length < 10) { sorun.push("alan < 10: " + l.slice(0, 80)); return; }
    var alanlar = f.slice(0, 9).concat([f.slice(9).join(",")]);
    if (alanlar.length !== 10) sorun.push("alan sayısı");
    if (!/^\d+:\d\d:\d\d\.\d\d$/.test(alanlar[1]) || !/^\d+:\d\d:\d\d\.\d\d$/.test(alanlar[2])) { sorun.push("zaman biçimi: " + alanlar[1] + " " + alanlar[2]); return; }
    var b = zaman(alanlar[1]), e = zaman(alanlar[2]);
    if (!(b >= 0) || !(e >= 0)) sorun.push("negatif zaman: " + l.slice(0, 60));
    if (!(b < e)) sorun.push("başlangıç ≥ bitiş: " + l.slice(0, 60));
    var metin = alanlar[9], m;
    /*
     * Vurgu kutusu / çizgisi ("SufloKutu" stili) bütün satırı görünmez yazıp yalnız etkin kelimenin kutusunu gösterir:
     * çapa görünmez satırın başıdır, önceki kelimeden kayan çizgide kadrajın solunda olabilir (görünen kutu kadrajda).
     * Onun için sınır bir kadraj boyu; diğer bütün olaylarda ±%10.
     */
    var pay = alanlar[3] === "SufloKutu" ? 1 : 0.1;
    var rx = /\\pos\(([-\d.]+),([-\d.]+)\)/g;
    while ((m = rx.exec(metin))) if (!icinde(+m[1], +m[2], w, h, pay)) sorun.push("\\pos dışarıda: " + m[0]);
    var mx = /\\move\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/g;
    while ((m = mx.exec(metin))) if (!icinde(+m[1], +m[2], w, h, pay) || !icinde(+m[3], +m[4], w, h, pay)) sorun.push("\\move dışarıda: " + m[0]);
    var fx = /\\fs(\d+(?:\.\d+)?)/g;
    // Altyazı Efektleri: parti 1'in tabanı (tek kelimelik uzun kart en az ölçekli 30 px ya da puntonun %55'i); eski stiller kendi kuralıyla (en az 8)
    var taban = styleId === "efekt" ? enAz : 8;
    while ((m = fx.exec(metin))) if (+m[1] < taban) sorun.push("\\fs " + m[1] + " < " + taban);
  });
  return sorun;
}
function icinde(x, y, w, h, pay) { return x >= -pay * w && x <= (1 + pay) * w && y >= -pay * h && y <= (1 + pay) * h; }

function sayilarSonlu(o, yol, sorun) {
  if (typeof o === "number") { if (!isFinite(o)) sorun.push(yol + "=" + o); return; }
  if (o === undefined) { sorun.push(yol + " undefined"); return; }
  if (o && typeof o === "object") Object.keys(o).forEach(function (k) { sayilarSonlu(o[k], yol + "." + k, sorun); });
}
// satirlar: kelime zaman çifti sayısı metindeki kelime sayısına eşit, zamanlar kart içinde ve artan, kartlar üst üste binmez
function satirlarDenetle(sat) {
  var sorun = [], onceki = -Infinity;
  sat.forEach(function (s, i) {
    if (!(isFinite(s.start) && isFinite(s.end) && s.start < s.end)) sorun.push(i + ": zaman " + s.start + "-" + s.end);
    if (s.start < onceki - 1e-6) sorun.push(i + ": önceki kartla çakışır");
    onceki = s.end;
    var kel = String(s.text).split(/\s+/).filter(Boolean);
    if (kel.length !== s.kelimeler.length) sorun.push(i + ": kelime " + kel.length + " ≠ zaman " + s.kelimeler.length);
    if (s.vurgu && s.vurgu.length !== s.kelimeler.length) sorun.push(i + ": vurgu uzunluğu");
    var t = s.start;
    s.kelimeler.forEach(function (z) {
      if (!(z[0] >= t - 1e-6 && z[1] >= z[0] && z[1] <= s.end + 1e-6)) sorun.push(i + ": kelime zamanı " + J(z));
      t = z[0];
    });
  });
  return sorun;
}

function ornekAyar(gorunumId, anim) {
  var ayar = JSON.parse(JSON.stringify(AE.gorunum(gorunumId).ayar));
  if (anim !== null) ayar.anim = anim;
  return ayar;
}

var dokulen = {};
var sayac = { compile: 0, satirlar: 0, plan: 0, layout: 0, kod: 0 };
function vaka(no, o) {
  var etiket = "#" + no + " " + J({ g: o.gorunum, eski: o.eski, anim: o.anim, k: o.k.w + "x" + o.k.h + (o.k.g ? "g" : ""), s: o.s, kind: o.kind, n: o.ws.length });
  function hata(msg) {
    if (hatalar.length < 30) hatalar.push(etiket + " → " + msg);
    // SUFLO_FUZZ_DOKUM=<klasör>: ilk başarısız vakanın girdisi yeniden üretmek için JSON olarak yazılır
    if (process.env.SUFLO_FUZZ_DOKUM && !dokulen[msg.slice(0, 12)]) {
      dokulen[msg.slice(0, 12)] = true;
      require("fs").writeFileSync(path.join(process.env.SUFLO_FUZZ_DOKUM, "fuzz-" + no + ".json"), J({ hata: msg, girdi: o }));
    }
  }
  var styleId = o.eski || "efekt";
  var ov = o.eski ? { guvenli: o.k.g } : AE.overrides(ornekAyar(o.gorunum, o.anim));
  if (!o.eski) ov.guvenli = o.k.g;
  var cues = o.kind === "lines" ? satirlaraTopla(o.ws) : o.ws;
  var sonuc;
  try {
    sonuc = SE.compile({ styleId: styleId, cues: JSON.parse(JSON.stringify(cues)), cueKind: o.kind, width: o.k.w, height: o.k.h, intensity: o.s,
      overrides: JSON.parse(JSON.stringify(ov)), dil: o.dil, speakerColors: o.konusmaci ? ["#ff0000", "#00ff00", "#0000ff"] : undefined });
  } catch (e) { hata("compile fırlattı: " + (e && e.stack || e)); return; }
  sayac.compile++;
  assDenetle(String(sonuc.ass), o.k.w, o.k.h, styleId, ov).slice(0, 3).forEach(hata);
  if (o.eski) return;
  // caption-mogrt-json satirlar (Premiere yerel çıktı)
  if (o.ek) {
    try {
      var sat = CMJ.satirlar(JSON.parse(JSON.stringify(cues)), ornekAyar(o.gorunum, o.anim), { cueKind: o.kind, dil: o.dil, kadraj: { w: o.k.w, h: o.k.h, guvenli: o.k.g } });
      sayac.satirlar++;
      satirlarDenetle(sat).slice(0, 3).forEach(function (s) { hata("satirlar: " + s); });
    } catch (e2) { hata("satirlar fırlattı: " + (e2 && e2.stack || e2)); }
    // After Effects planı: stilli + düz, iki kez aynı girdi aynı plan
    try {
      var girdi = satirlaraTopla(o.ws);
      var po = { mod: olas(0.7) ? "stilli" : "duz", ayar: ornekAyar(o.gorunum, o.anim), cueKind: "lines", guvenli: o.k.g, w: o.k.w, h: o.k.h, fps: sec([24, 25, 29.97, 30, 60]),
        sure: 0, isId: "fuzz", dil: o.dil };
      var p1 = AP.plan(JSON.parse(JSON.stringify(girdi)), JSON.parse(JSON.stringify(po)));
      var p2 = AP.plan(JSON.parse(JSON.stringify(girdi)), JSON.parse(JSON.stringify(po)));
      sayac.plan++;
      if (J(p1) !== J(p2)) hata("ae-plan belirlenimci değil");
      var ps = [];
      sayilarSonlu(p1, "plan", ps);
      p1.katmanlar.forEach(function (k, i) { if (!(k.bas >= 0 && k.bas < k.son)) ps.push("katman " + i + " zaman " + k.bas + "-" + k.son); });
      ps.slice(0, 3).forEach(function (s) { hata("ae-plan: " + s); });
    } catch (e3) { hata("ae-plan fırlattı: " + (e3 && e3.stack || e3)); }
  }
}

// caption-layout: her (boş olmayan, zamanı sayı) kelime tam bir kez ve sırayla
function layoutVaka(ws) {
  var o = { maxChars: sec([16, 24, 32, 42, 60]), maxLines: sec([1, 2]), maxWords: sec([0, 0, 2, 3, 5]), dil: sec([undefined, "tr", "en", false]) };
  var girdi = JSON.parse(JSON.stringify(ws));
  var out = CL.kelimedenSatirlar(girdi, o);
  sayac.layout++;
  var beklenen = ws.filter(function (w) { return w && String(w.text).trim() && isFinite(w.start); }).map(function (w) { return String(w.text).trim(); });
  var cikan = [];
  out.forEach(function (c) { (c.words || []).forEach(function (w) { cikan.push(String(w.text).trim()); }); });
  if (J(cikan) !== J(beklenen)) hatalar.push("kelimedenSatirlar " + J(o) + ": " + J(beklenen).slice(0, 200) + " ≠ " + J(cikan).slice(0, 200));
  out.forEach(function (c) { if (!(c.start <= c.end) || !isFinite(c.start)) hatalar.push("kelimedenSatirlar zaman " + c.start + "-" + c.end); });
}

// SufloStilKodu: her görünüm (+ animasyon, renkler) encode → decode → encode aynı; anim ve ayarlar korunur
function kodVaka(gorunumId, anim) {
  var ayar = ornekAyar(gorunumId, anim);
  var ov = AE.overrides(ayar);
  if (anim) { ov.anim = anim; YA.renkAlanlari(anim).forEach(function (k) { ov[k] = sec(["#12ab34", "#FF00EE", "#000000"]); }); }
  var r = { styleId: "efekt", overrides: ov, text: { maxlen: sec(["c42", "c32", "k1", "w2"]), kase: sec(["normal", "upper", "lower"]), punct: olas(0.5) },
    author: sec(["", "ayse", "Mehmet_1"]) };
  var kod = SK.encode(JSON.parse(JSON.stringify(r)));
  var d = SK.decode(kod, function (id) { return SE.has(id); });
  sayac.kod++;
  if (!d.ok || d.warnings.length) { hatalar.push("stil kodu " + gorunumId + "/" + anim + ": " + J(d.warnings) + " " + d.error); return; }
  // animasyon seçiliyken giriş / vurgu animasyonu kullanılmaz: kod onları bilerek katalogdaki klasik yedek çifte çevirir
  var fark = Object.keys(ov).filter(function (k) {
    if (anim && (k === "giris" || k === "aktif")) return d.recipe.overrides[k] !== YA.klasik(anim)[k];
    var a = ov[k], b = d.recipe.overrides[k];
    if (typeof a === "string" && /^#/.test(a)) return String(b).toLowerCase() !== a.toLowerCase();
    return J(a) !== J(b);
  });
  if (fark.length) hatalar.push("stil kodu alan kaybı " + gorunumId + "/" + anim + ": " + fark.map(function (k) { return k + " " + J(ov[k]) + "→" + J(d.recipe.overrides[k]); }).join(", "));
  if (SK.encode(d.recipe) !== kod) hatalar.push("stil kodu gidiş-dönüş kararsız: " + gorunumId + "/" + anim);
  if (J(d.recipe.text) !== J(r.text)) hatalar.push("stil kodu metin: " + J(d.recipe.text));
  // eski çözücü (SS) her kodu açar
  var e = SS.decode(kod, function (id) { return SE.has(id); });
  if (!e.ok) hatalar.push("eski çözücü açamadı: " + gorunumId + "/" + anim);
}

/*
 * Fuzz'un bulduğu üç hata (her biri için düzeltmeden önce aşağıdaki denetim KALIYORDU; en küçük girdiler):
 *  1) Vurucu (zıplayan etkin kelime) olağan Whisper zamanlarında "başlangıç = bitiş" Dialogue yazıyordu: hareket parçası
 *     sınırları 73,100 ve 73,103 sn santisaniyeye yuvarlanınca aynı (görünmez ama geçersiz olay; eventCount da şişkin)
 *  2) Sırasız kelime zamanında olay kart başından önce başlayınca "yukarı" girişin kayması d'yi aşıyordu (o < 0):
 *     \move(…,1203,…,907) kadrajın altından geliyordu
 *  3) Premiere yerel çıktısı (caption-mogrt-json satirlar): 10 ms'den yakın başlayan iki kart üst üste biniyordu
 */
(function () {
  var AEo = AE.overrides(AE.gorunum("vurucu").ayar);
  var cues = [{ start: 72.797, end: 72.911, text: "*ığdır*" }, { start: 72.996, end: 73.082, text: "gün" }, { start: 73.103, end: 73.491, text: "bugün" }];
  var bozuk = [];
  [["efekt", AEo], ["hormozi"], ["viral"], ["ziplama"], ["dolgu"], ["mrbeast"]].forEach(function (x) {
    var r = SE.compile({ styleId: x[0], cues: JSON.parse(JSON.stringify(cues)), cueKind: "words", width: 1920, height: 1080, dil: "tr", overrides: x[1] ? JSON.parse(JSON.stringify(x[1])) : undefined });
    r.ass.split("\n").forEach(function (l) {
      var f = /^Dialogue: [^,]*,([^,]*),([^,]*),/.exec(l);
      if (f && !(zaman(f[1]) < zaman(f[2]))) bozuk.push(x[0] + ": " + l.slice(0, 50));
    });
    if (r.eventCount !== r.ass.split("\n").filter(function (l) { return /^Dialogue:/.test(l); }).length) bozuk.push(x[0] + ": eventCount");
  });
  ok("1) santisaniyede süresi sıfır kalan olay yazılmaz (Vurucu, olağan kelime zamanları); eventCount yazılan olay sayısı", bozuk.length === 0, bozuk.join(" | "));

  var ov = AE.overrides(AE.gorunum("altin-saat").ayar);   // giriş "yukarı"
  var sirasiz = [{ start: 2.0, end: 2.4, text: "ikinci" }, { start: 1.0, end: 1.3, text: "birinci" }, { start: 2.5, end: 2.9, text: "üçüncü" }];
  var r2 = SE.compile({ styleId: "efekt", cues: sirasiz, cueKind: "words", width: 1440, height: 1080, intensity: "hard", overrides: ov, dil: "tr" });
  var asiri = (r2.ass.match(/\\move\([-\d]+,[-\d]+,[-\d]+,[-\d]+/g) || []).filter(function (m) {
    var n = m.slice(6).split(",").map(Number);
    return Math.abs(n[1] - n[3]) > Math.round(50 * 1080 / 1080) + 1;
  });
  ok("2) sırasız kelimede giriş kayması en çok d (scaled 50 px): kadrajın dışından gelmez", asiri.length === 0, asiri.join(" "));

  var yakin = [{ start: 1.681, end: 1.898, text: "bir" }, { start: 1.689, end: 1.937, text: "iki" }, { start: 3, end: 3.5, text: "üç" }];
  var sat = CMJ.satirlar(yakin, AE.normalize({ kelime: 1, satir: 1, giris: "yok" }), { cueKind: "words", kadraj: { w: 1080, h: 1920 } });
  var cakisma = [];
  for (var i = 0; i + 1 < sat.length; i++) if (sat[i].end > sat[i + 1].start + 1e-9) cakisma.push(J([sat[i].start, sat[i].end, sat[i + 1].start]));
  ok("3) Premiere yerel çıktısı: 10 ms'den yakın başlayan kartlar üst üste binmez, kelime zamanları kart içinde", cakisma.length === 0 && sat.length === 3 &&
    satirlarDenetle(sat).length === 0, cakisma.join(" ") + " " + J(satirlarDenetle(sat)));
})();

var bas = Date.now(), no = 0;
var GORUNUMLER = AE.GORUNUMLER.map(function (g) { return g.id; });
// 1) kapsama evresi: her görünüm × her kadraj × her şiddet (görünümün kendi animasyonu), her animasyon her kadrajda, eski stiller
GORUNUMLER.forEach(function (g) {
  KADRAJLAR.forEach(function (k) {
    SIDDET.forEach(function (s) { vaka(++no, { gorunum: g, anim: null, k: k, s: s, kind: "words", ws: transkript(), dil: "tr", ek: s === "balanced" }); });
  });
  kodVaka(g, null);
});
ANIMLER.forEach(function (a) {
  KADRAJLAR.forEach(function (k) { vaka(++no, { gorunum: sec(GORUNUMLER), anim: a, k: k, s: sec(SIDDET), kind: sec(["words", "lines"]), ws: transkript(), dil: sec(["tr", "en", undefined]), ek: true }); });
  kodVaka(sec(GORUNUMLER), a);
});
ESKI_STILLER.forEach(function (id) {
  KADRAJLAR.forEach(function (k) { vaka(++no, { eski: id, k: k, s: sec(SIDDET), kind: sec(["words", "lines", "cumulative"]), ws: transkript(), konusmaci: olas(0.5) }); });
});
var kapsama = no;
// 2) rastgele evre (süre bütçesiyle)
while (Date.now() - bas < BUTCE_MS && no < EN_COK) {
  var ws = transkript();
  if (olas(0.15)) vaka(++no, { eski: sec(ESKI_STILLER), k: sec(KADRAJLAR), s: sec(SIDDET), kind: sec(["words", "lines", "cumulative"]), ws: ws, konusmaci: olas(0.3) });
  else vaka(++no, { gorunum: sec(GORUNUMLER), anim: olas(0.4) ? null : sec(ANIMLER), k: sec(KADRAJLAR), s: sec(SIDDET), kind: sec(["words", "lines"]), ws: ws,
    dil: sec(["tr", "en", undefined]), konusmaci: olas(0.2), ek: olas(0.35) });
  layoutVaka(ws);
  if (olas(0.2)) kodVaka(sec(GORUNUMLER), sec(ANIMLER));
}
var sure = Date.now() - bas;

ok("kapsama: " + GORUNUMLER.length + " görünüm × " + KADRAJLAR.length + " kadraj × 3 şiddet, " + ANIMLER.length + " animasyon (klasik dahil), " +
  ESKI_STILLER.length + " eski stil", GORUNUMLER.length >= 30 && ANIMLER.length >= 25 && kapsama > 500, kapsama);
ok("compile hiç fırlatmadı; ASS'te NaN / undefined / Infinity yok; Dialogue 10 alan, 0 ≤ başlangıç < bitiş; \\pos / \\move kadrajın ±%10'unda; punto tabanın üstünde",
  hatalar.filter(function (h) { return !/satirlar|ae-plan|kelimedenSatirlar|stil kodu|eski çözücü/.test(h); }).length === 0,
  hatalar.filter(function (h) { return !/satirlar|ae-plan|kelimedenSatirlar|stil kodu|eski çözücü/.test(h); }).join("\n"));
ok("caption-mogrt-json satirlar geçerli (kelime = zaman çifti, zamanlar kart içinde, kartlar çakışmaz)", hatalar.filter(function (h) { return /satirlar/.test(h); }).length === 0 && sayac.satirlar > 50,
  hatalar.filter(function (h) { return /satirlar/.test(h); }).join("\n"));
ok("ae-plan plan() geçerli (sayılar sonlu, katman zamanı) ve belirlenimci", hatalar.filter(function (h) { return /ae-plan/.test(h); }).length === 0 && sayac.plan > 50,
  hatalar.filter(function (h) { return /ae-plan/.test(h); }).join("\n"));
ok("caption-layout kelimedenSatirlar her kelimeyi tam bir kez ve sırayla verir", hatalar.filter(function (h) { return /kelimedenSatirlar/.test(h); }).length === 0 && sayac.layout > 20,
  hatalar.filter(function (h) { return /kelimedenSatirlar/.test(h); }).join("\n"));
ok("SufloStilKodu encode / decode gidip gelir (anim, renkler, metin; eski çözücü de açar)", hatalar.filter(function (h) { return /stil kodu|eski çözücü/.test(h); }).length === 0 && sayac.kod > 50,
  hatalar.filter(function (h) { return /stil kodu|eski çözücü/.test(h); }).join("\n"));
ok("süre bütçesi: rastgele evre " + BUTCE_MS / 1000 + " sn içinde", sure < BUTCE_MS + 15000, sure);
console.log("tohum " + TOHUM + ": " + no + " vaka (" + kapsama + " kapsama), " + J(sayac) + ", " + (sure / 1000).toFixed(1) + " sn");
console.log("\n" + gecen + "/" + toplam + " geçti");
if (gecen !== toplam) process.exit(1);
