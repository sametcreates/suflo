// Suflo testi: senkron doğrulama arayüzü — js/senkron-ui.js (saf işlevler + ses dalgası şeridi, sahte DOM) ve captions.js
// bağlantısı (gerçek işlevler imzayla kesilip sahte ortamda çalışır):
//  - hepsiniYasla: sekans ekseninde (+t0) kaymış transkript düzelir (< 20 ms), kareye oturur, girdi değişmez, sessizliğe düşen
//    kelimenin kartı işaretlenir; gürültüde zamanlara ve işaretlere dokunulmaz; toplu klip (iki kaynak), başka belgenin sesi yok sayılır
//  - raporMetni: tek satır Türkçe rapor ve İngilizce karşılığı (i18n/en.js)
//  - sinirlar / sinirTasi: ortak sınır, komşu kart ve kelime sınırları, en kısa süre, kart kelimeyi izler, uyarı silinir
//  - tusAdimi (←/→ 10 ms, Shift 1 kare), zarfSutunlari, gorunum
//  - şerit: tutamaklar (role=slider, aria), klavye ve sürüklemede TEK anlık görüntü, tutamak öğeleri yeniden çizimde korunur,
//    ses yokken "analiz et", After Effects'te Dinle kapalı
//  - captions.js: Oluştur sonrası doğrulama + rapordaki Geri al (tek geri al yığını), belge değişince rapor / ses düşer,
//    iptal ve hata transkripti bozmaz, ayar (varsayılan açık), go() sırası (geçici ses silinmeden), HTML / CSS / AE
var fs = require("fs");
var path = require("path");
var KOK = path.join(__dirname, "..");
var Z = require(path.join(KOK, "js", "ses-zarf.js"));
var SN = require(path.join(KOK, "js", "senkron.js"));
var U = require(path.join(KOK, "js", "senkron-ui.js"));
var G = require("./_senkron-sentetik.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
function ort(d) { return d.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, d.length); }
function duz(kartlar) { var o = []; kartlar.forEach(function (c) { (c.words || []).forEach(function (w) { o.push(w); }); }); return o; }
function kaydir(kartlar, d) {
  return kartlar.map(function (c) {
    return { start: c.start + d, end: c.end + d, text: c.text, words: c.words.map(function (w) { return { start: w.start + d, end: w.end + d, text: w.text }; }) };
  });
}

/* ---------------- 1) hepsiniYasla: sekans ekseni, kare, girdi, işaret ---------------- */
var g = G.uret({ tohum: 7, kelime: 60 });
var a = Z.analizEt(g.pcm);
var T0 = 12.5;
var gercek = g.kelimeler.map(function (w) { return { start: w.start + T0, end: w.end + T0 }; });
var kartlar = kaydir(G.kartla(G.boz(g.kelimeler, 0.25, 0.04, 5), 4), T0);
var girdi = J(kartlar);
var kay = U.kaynak(a, T0, 3);
ok("kaynak: sekans ekseninde aralık (t0 .. t0 + süre), belge numarası", kay.bas === T0 && Math.abs(kay.son - (T0 + a.sure)) < 1e-9 && kay.belge === 3, J([kay.bas, kay.son]));
var r = U.hepsiniYasla(kartlar, [kay], { belge: 3, fps: 25 });
var yeni = duz(r.segments);
var hata = ort(yeni.map(function (w, i) { return Math.abs(w.start - gercek[i].start) * 1000; }));
ok("+250 ms kaymış transkript (sekansta 12,5 sn'den): ortalama kelime başı hatası < 20 ms", hata < 20 && r.islenen === 15, hata.toFixed(1));
ok("kart giriş / çıkışı 25 fps kareye oturur", r.segments.every(function (c) { return Math.abs(c.start * 25 - Math.round(c.start * 25)) < 1e-6 && Math.abs(c.end * 25 - Math.round(c.end * 25)) < 1e-6; }));
ok("girdi değişmedi", J(kartlar) === girdi);
ok("rapor: düzeltilen, önce → sonra, kelimeli, kayma uygulandı", r.rapor.duzeltilen > 50 && r.rapor.ortalamaOnceMs > 100 && r.rapor.ortalamaSonraMs < 15 && r.rapor.kelimeli &&
  r.rapor.kayma.uygulandi && Math.abs(r.rapor.kayma.ms + 250) <= 25 && r.rapor.atlandi === null && r.rapor.kaynak === 1, J(r.rapor).slice(0, 200));
ok("temiz seste kartların çoğu işaretsiz (en çok 2)", r.rapor.uyariKart <= 2, r.rapor.uyariKart);

// satır modu: en kısa ekran süresi (minKartMs) yaslamada korunur, sonraki kartın girişini geçmez
var tekli = kaydir(G.kartla(g.kelimeler, 1), T0);
var rk = U.hepsiniYasla(tekli, [U.kaynak(a, T0, 3)], { belge: 3, ayar: { minKartMs: 800 } });
ok("minKartMs: tek kelimelik kart en az 0,8 sn ya da sonraki kartın girişine kadar; çakışma yok", rk.segments.every(function (c, i) {
  var sonraki = i + 1 < rk.segments.length ? rk.segments[i + 1].start : Infinity;
  return c.end - c.start >= 0.8 - 1e-6 || Math.abs(c.end - sonraki) < 1e-6;
}) && rk.segments.every(function (c, i) { return !i || c.start >= rk.segments[i - 1].end - 1e-9; }));
// sessizliğe düşen kelime: doğru transkriptte en uzun boşluğun ortasına uydurma kelime
var dogru = kaydir(G.kartla(g.kelimeler, 4), T0);
var enUzun = -1, enUzunI = -1;
duz(dogru).forEach(function (w, i, l) { if (i && w.start - l[i - 1].end > enUzun) { enUzun = w.start - l[i - 1].end; enUzunI = i; } });
var hedefKart = -1;
dogru.forEach(function (c, ci) {
  c.words.forEach(function (w, wi) {
    if (hedefKart === -1 && w === duz(dogru)[enUzunI]) {
      var onceki = wi ? c.words[wi - 1] : (ci ? dogru[ci - 1].words[dogru[ci - 1].words.length - 1] : null);
      if (wi && onceki) {
        var orta = (onceki.end + w.start) / 2;
        c.words.splice(wi, 0, { start: Math.round((orta - 0.07) * 1000) / 1000, end: Math.round((orta + 0.07) * 1000) / 1000, text: "hayalet" });
        hedefKart = ci;
      }
    }
  });
});
if (hedefKart === -1) {
  // boşluk kart sınırına denk geldi: uydurma kelime önceki kartın sonuna
  var ci0 = 0;
  dogru.forEach(function (c, ci) { if (c.words.indexOf(duz(dogru)[enUzunI]) === 0) ci0 = ci - 1; });
  var sonW = dogru[ci0].words[dogru[ci0].words.length - 1];
  dogru[ci0].words.push({ start: Math.round((sonW.end + enUzun / 2 - 0.07) * 1000) / 1000, end: Math.round((sonW.end + enUzun / 2 + 0.07) * 1000) / 1000, text: "hayalet" });
  dogru[ci0].end = dogru[ci0].words[dogru[ci0].words.length - 1].end;
  hedefKart = ci0;
}
dogru[hedefKart].senkronUyari = "eski";
dogru[(hedefKart + 3) % dogru.length].senkronUyari = "eski";
var rs = U.hepsiniYasla(dogru, [U.kaynak(a, T0, 3)], { belge: 3 });
ok("sessizliğe düşen uydurma kelimenin kartı işaretlenir (" + (enUzun * 1000).toFixed(0) + " ms boşluk)", !!rs.segments[hedefKart].senkronUyari && rs.segments[hedefKart].senkronUyari !== "eski",
  J(rs.segments[hedefKart].senkronUyari) + " " + J(rs.rapor.eminDegil.map(function (e) { return e.metin + ":" + e.neden; })));
ok("eski işaret yeni doğrulamayla değişir (sorunsuz kart işaretsiz kalır)", !rs.segments[(hedefKart + 3) % dogru.length].senkronUyari || rs.rapor.eminDegil.some(function (e) { return e.kart === (hedefKart + 3) % dogru.length; }));
ok("rapor: emin değil listesinde kart indeksleri belgenin indeksleri", rs.rapor.eminDegil.some(function (e) { return e.kart === hedefKart && e.metin === "hayalet"; }), J(rs.rapor.eminDegil.slice(0, 3)));

// gürültü: zamanlara ve işaretlere dokunulmaz
var gg = G.uret({ tohum: 11, kelime: 30, gurultuDb: -14 });
var ag = Z.analizEt(gg.pcm);
var kg = kaydir(G.kartla(G.boz(gg.kelimeler, 0.2, 0.03, 4), 3), 0);
var rg = U.hepsiniYasla(kg, [U.kaynak(ag, 0, 1)], { belge: 1, fps: 25 });
ok("gürültülü ses: zamanlar aynen, hiçbir kart işaretlenmez, rapor atlandı", rg.rapor.atlandi === "dusukKontrast" && J(rg.segments) === J(kg) && rg.rapor.uyariKart === 0, rg.rapor.atlandi);

// toplu klip: iki kaynak, her kart kendi sesiyle; başka belgenin sesi ve aralık dışı kart
var g2 = G.uret({ tohum: 21, kelime: 24 });
var a2 = Z.analizEt(g2.pcm);
var T1 = 100;
var k1 = kaydir(G.kartla(G.boz(g.kelimeler.slice(0, 24), 0.18, 0.03, 6), 4), T0);
var k2 = kaydir(G.kartla(G.boz(g2.kelimeler, -0.15, 0.03, 8), 4), T1);
var disari = { start: 500, end: 501, text: "aralık dışı" };
var hepsi = k1.concat(k2, [disari]);
var rt = U.hepsiniYasla(hepsi, [U.kaynak(a2, T1, 1), U.kaynak(a, T0, 1), U.kaynak(a2, T0, 2)], { belge: 1 });
var h1 = ort(duz(rt.segments.slice(0, k1.length)).map(function (w, i) { return Math.abs(w.start - (g.kelimeler[i].start + T0)) * 1000; }));
var h2 = ort(duz(rt.segments.slice(k1.length, k1.length + k2.length)).map(function (w, i) { return Math.abs(w.start - (g2.kelimeler[i].start + T1)) * 1000; }));
ok("toplu klip: iki klibin kartları kendi sesine oturur (< 20 ms), başka belgenin sesi kullanılmaz", h1 < 20 && h2 < 20 && rt.rapor.kaynak === 2, h1.toFixed(1) + " / " + h2.toFixed(1));
ok("hiçbir sesin aralığına düşmeyen kart aynen kalır", J(rt.segments[rt.segments.length - 1]) === J(disari));
var rb = U.hepsiniYasla(hepsi, [U.kaynak(a, T0, 9)], { belge: 1 });
ok("belgenin sesi yoksa: hiçbir şey değişmez, atlandı = analizYok", rb.rapor.atlandi === "analizYok" && J(rb.segments) === J(hepsi));
ok("kaynakBul: belgenin t'yi kapsayan sesi (0,5 sn tolerans), başka belge yok", U.kaynakBul([U.kaynak(a, T0, 1), U.kaynak(a2, T1, 1)], 1, T1 + 3).t0 === T1 &&
  U.kaynakBul([U.kaynak(a, T0, 1)], 1, T0 - 0.3).t0 === T0 && U.kaynakBul([U.kaynak(a, T0, 1)], 1, T0 - 2) === null && U.kaynakBul([U.kaynak(a, T0, 2)], 1, T0 + 1) === null);

/* ---------------- 2) rapor metni ---------------- */
var RM = U.raporMetni;
ok("rapor satırı: N kelime sese oturtuldu · ortalama sapma X ms → Y ms · Z kelime emin değil",
  RM({ duzeltilen: 42, ortalamaOnceMs: 183.4, ortalamaSonraMs: 11.6, eminDegil: [{ tur: "kelime" }, { tur: "kelime" }, { tur: "kart" }], kelimeli: true, kayma: { uygulandi: false } }).metin ===
  "42 kelime sese oturtuldu · ortalama sapma 183 ms → 12 ms · 2 kelime emin değil");
ok("kelimesiz belge: kart birimi; düzeltme yoksa 'Zamanlar sesle uyumlu ✓'", RM({ duzeltilen: 5, ortalamaOnceMs: 90, ortalamaSonraMs: 20, eminDegil: [], kelimeli: false }).metin === "5 kart sese oturtuldu · ortalama sapma 90 ms → 20 ms" &&
  RM({ duzeltilen: 0, ortalamaOnceMs: 6, ortalamaSonraMs: 6, eminDegil: [], kelimeli: true }).metin === "Zamanlar sesle uyumlu ✓ · ortalama sapma 6 ms" &&
  RM({ duzeltilen: 0, ortalamaSonraMs: 6, eminDegil: [], kelimeli: true }).ton === "iyi");
ok("toplam kayma ayrıntıda; atlanan seste neden ve uyarı tonu", RM(r.rapor).ayrinti === "Tüm altyazıda −" + Math.abs(Math.round(r.rapor.kayma.ms)) + " ms toplam kayma düzeltildi." &&
  RM({ atlandi: "dusukKontrast" }).metin === "Ses gürültülü ya da müzikli: zamanlara dokunulmadı" && RM({ atlandi: "dusukKontrast" }).ton === "uyari" &&
  RM({ atlandi: "iyilesmedi" }).ton === "iyi" && RM({ atlandi: "bilinmeyen" }).metin === U.ATLANDI.analizYok, RM(r.rapor).ayrinti);
var I18N = require(path.join(KOK, "js", "i18n.js"));
I18N.setDictionary(require(path.join(KOK, "i18n", "en.js")));
var ceviriler = ["42 kelime sese oturtuldu · ortalama sapma 183 ms → 12 ms · 2 kelime emin değil", "Zamanlar sesle uyumlu ✓ · ortalama sapma 6 ms", RM(r.rapor).ayrinti,
  "Ses dalgası · #7", "“selam” başı", "“selam” / “dünya” sınırı", "Kart girişi", "Geri alındı: sese yaslama"].concat(Object.keys(U.ATLANDI).map(function (k) { return U.ATLANDI[k]; }))
  .map(function (t) { return I18N.translate(t); });
ok("İngilizce arayüz: rapor, şerit etiketleri, nedenler ve geri al etiketi çevrilir", ceviriler[0] === "42 words snapped to the audio · average offset 183 ms → 12 ms · 2 words uncertain" &&
  ceviriler[3] === "Waveform · #7" && ceviriler[4] === "Start of “selam”" && ceviriler[7] === "Undone: snap to audio" &&
  ceviriler.every(function (t) { return !/[ıİşŞğĞçÇöÖüÜ]/.test(t.replace(/“[^”]*”/g, "")); }), J(ceviriler));

/* ---------------- 3) sınırlar ve elle ince ayar ---------------- */
var segs = [
  { start: 1.0, end: 2.0, text: "a b", words: [{ start: 1.02, end: 1.4, text: "a" }, { start: 1.5, end: 1.9, text: "b" }] },
  { start: 2.1, end: 3.2, text: "c d e", senkronUyari: "onsetYok", words: [{ start: 2.12, end: 2.5, text: "c" }, { start: 2.5, end: 2.8, text: "d" }, { start: 2.9, end: 3.0, text: "e" }] },
  { start: 3.3, end: 4.0, text: "kelimesiz" }
];
var sn = U.sinirlar(segs[1]);
ok("sinirlar: kart girişi, kelime başı / sonu, bitişik kelimelerin ortak sınırı tek tutamak, kart çıkışı",
  J(sn.map(function (s) { return s.id; })) === J(["kb", "b0", "o0", "s1", "b2", "s2", "ks"]) && sn[2].tur === "ortak" && sn[2].t === 2.5, J(sn.map(function (s) { return s.id + "@" + s.t; })));
ok("sinirlar: kelimesiz kart yalnız giriş / çıkış", J(U.sinirlar(segs[2]).map(function (s) { return s.id; })) === J(["kb", "ks"]));
var once = J(segs);
var t1 = U.sinirTasi(segs, 1, "kb", 1.5);
ok("kart girişi önceki kartın çıkışını geçmez (2,0)", t1.t === 2.0 && t1.seg.start === 2.0, t1.t);
ok("kart girişi ilk kelimenin başını geçmez", U.sinirTasi(segs, 1, "kb", 2.4).t === 2.12);
ok("kart çıkışı sonraki kartın girişini geçmez, son kelimenin sonundan önceye inmez", U.sinirTasi(segs, 1, "ks", 9).t === 3.3 && U.sinirTasi(segs, 1, "ks", 2.0).t === 3.0);
var t2 = U.sinirTasi(segs, 1, "o0", 2.61);
ok("ortak sınır iki kelimeyi birlikte taşır", t2.seg.words[0].end === 2.61 && t2.seg.words[1].start === 2.61 && t2.seg.start === 2.1);
ok("ortak sınır en kısa kelime süresini korur (20 ms)", U.sinirTasi(segs, 1, "o0", 2.9).t === 2.78 && U.sinirTasi(segs, 1, "o0", 2.0).t === 2.14);
var t3 = U.sinirTasi(segs, 1, "b0", 2.03);
ok("ilk kelime kart girişinden önceye çekilince kart onu izler, önceki kartın çıkışında durur", t3.t === 2.03 && t3.seg.start === 2.03 && U.sinirTasi(segs, 1, "b0", 1.0).t === 2.0);
var t4 = U.sinirTasi(segs, 1, "s2", 3.25);
ok("son kelime kart çıkışını aşınca kart uzar, sonraki kartın girişinde durur", t4.seg.end === 3.25 && t4.seg.words[2].end === 3.25 && U.sinirTasi(segs, 1, "s2", 3.9).t === 3.3);
ok("kelime başı önceki kelimenin sonunu geçmez", U.sinirTasi(segs, 1, "b2", 2.7).t === 2.8);
ok("taşınan kart kopyadır, girdi değişmez; elle doğrulanan kartın uyarısı silinir", J(segs) === once && t2.seg.senkronUyari === undefined && segs[1].senkronUyari === "onsetYok");
ok("geçersiz sınır / kart: null", U.sinirTasi(segs, 1, "o2", 2) === null && U.sinirTasi(segs, 7, "kb", 1) === null && U.sinirTasi(segs, 1, "x", 1) === null && U.sinirTasi(segs, 1, "kb", NaN) === null);
ok("milisaniyeye yuvarlanır", U.sinirTasi(segs, 1, "ks", 3.12345).t === 3.123);
ok("tusAdimi: ←/→ 10 ms, Shift ile 1 kare (25 / 23,976 fps), başka tuş 0", U.tusAdimi({ key: "ArrowRight" }, 25) === 0.01 && U.tusAdimi({ key: "ArrowLeft" }, 25) === -0.01 &&
  Math.abs(U.tusAdimi({ key: "ArrowRight", shiftKey: true }, 25) - 0.04) < 1e-12 && Math.abs(U.tusAdimi({ key: "ArrowLeft", shiftKey: true }, 23.976) + 1001 / 24000) < 1e-12 &&
  U.tusAdimi({ key: "ArrowUp" }, 25) === 0 && U.tusAdimi({ key: "Right", shiftKey: true }, 0) === 0.04);

/* ---------------- 4) görünüm ve zarf ---------------- */
var gv = U.gorunum({ start: 13, end: 14 }, kay);
ok("gorunum: kart + kenar payı (en az 250 ms)", Math.abs(gv.bas - 12.75) < 1e-9 && Math.abs(gv.son - 14.25) < 1e-9, J(gv));
var gv2 = U.gorunum({ start: T0 + 0.05, end: T0 + 0.5 }, kay);
ok("gorunum: sesin başında aralık sesin içine kayar (süre korunur)", gv2.bas === T0 && Math.abs(gv2.son - (T0 + 0.5 + 0.25 + 0.2)) < 1e-9, J(gv2));
var w0 = g.kelimeler[0], z = U.zarfSutunlari(a, T0, T0 + w0.start - 0.3, T0 + w0.start + 0.1, 40);
ok("zarfSutunlari: kelime öncesi sessiz (alçak, konuşma yok), kelime içinde yüksek ve konuşma", z.yukseklik[2] < 0.25 && z.konusma[2] === 0 && z.yukseklik[37] > 0.5 && z.konusma[37] === 1,
  Array.prototype.slice.call(z.yukseklik, 0, 40).map(function (v) { return v.toFixed(2); }).join(","));
var zd = U.zarfSutunlari(a, T0, T0 - 2, T0 - 1, 10);
ok("zarfSutunlari: analizin dışı −1 (çizilmez)", Array.prototype.every.call(zd.yukseklik, function (v) { return v === -1; }));

/* ---------------- 5) şerit (sahte DOM) ---------------- */
function dugum(etiket, id) {
  var d = { tagName: String(etiket).toUpperCase(), id: id || "", hidden: false, disabled: false, textContent: "", title: "", className: "", attrs: {}, dinle: {},
    style: {}, childNodes: [], parentNode: null, odak: 0, clientWidth: 0, clientHeight: 0 };
  d.setAttribute = function (k, v) { d.attrs[k] = String(v); };
  d.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(d.attrs, k) ? d.attrs[k] : null; };
  d.addEventListener = function (t, f) { (d.dinle[t] = d.dinle[t] || []).push(f); };
  d.yay = function (t, e) { e = e || {}; e.type = t; e.target = d; e.preventDefault = e.preventDefault || function () { e.engellendi = true; }; (d.dinle[t] || []).forEach(function (f) { f(e); }); return e; };
  d.appendChild = function (c) { d.childNodes.push(c); c.parentNode = d; return c; };
  d.removeChild = function (c) { d.childNodes.splice(d.childNodes.indexOf(c), 1); c.parentNode = null; return c; };
  d.focus = function () { d.odak++; belgeSahte.activeElement = d; };
  d.click = function () { if (!d.disabled) d.yay("click"); };
  d.getBoundingClientRect = function () { return { left: 20, top: 0, width: d.clientWidth }; };
  d.classList = {
    contains: function (c) { return (" " + d.className + " ").indexOf(" " + c + " ") !== -1; },
    add: function (c) { if (!d.classList.contains(c)) d.className = (d.className + " " + c).trim(); },
    remove: function (c) { d.className = (" " + d.className + " ").replace(" " + c + " ", " ").trim(); }
  };
  return d;
}
var cizimler = [];
var belgeSahte = { activeElement: null, defaultView: { devicePixelRatio: 2, getComputedStyle: function () { return { getPropertyValue: function () { return ""; } }; } } };
var SDOM = {};
["cap-dalga", "cap-dalga-tutamaklar", "cap-dalga-alan", "cap-dalga-baslik", "cap-dalga-bos", "cap-dalga-analiz", "cap-dalga-dinle", "cap-dalga-yasla", "cap-dalga-geri"].forEach(function (id) {
  SDOM[id] = dugum(/dinle|yasla|geri|analiz/.test(id) ? "button" : "div", id);
});
SDOM["cap-dalga-tuval"] = dugum("canvas", "cap-dalga-tuval");
SDOM["cap-dalga-tuval"].getContext = function () {
  var c = { kayit: cizimler };
  ["setTransform", "clearRect", "fillRect", "fillText"].forEach(function (f) { c[f] = function () { cizimler.push([f].concat(Array.prototype.slice.call(arguments))); }; });
  c.measureText = function (t) { return { width: String(t).length * 6 }; };
  return c;
};
SDOM["cap-dalga-alan"].clientWidth = 300; SDOM["cap-dalga-alan"].clientHeight = 64;
belgeSahte.getElementById = function (id) { return SDOM[id] || null; };
belgeSahte.createElement = function (t) { return dugum(t); };
var belgeSegs = JSON.parse(J(segs));
var tusIlgileri = [];
var secili = 1, kaynakVar = true, aeMi = false, degisimler = [], dinlenen = [], yaslandi = 0, geriAlindi = 0, analiz = 0;
var seritKay = { analiz: a, t0: 0, bas: 0, son: a.sure, belge: 1 };
var S = U.serit({
  belge: belgeSahte,
  segments: function () { return belgeSegs; },
  secili: function () { return secili; },
  kaynak: function () { return kaynakVar ? seritKay : null; },
  fps: function () { return 25; },
  ae: function () { return aeMi; },
  degistir: function (ci, seg, b) { degisimler.push({ ci: ci, b: b, seg: seg }); belgeSegs[ci] = seg; },
  dinle: function (ci) { dinlenen.push(ci); },
  hepsiniYasla: function () { yaslandi++; },
  geriAl: function () { geriAlindi++; },
  geriAlVar: function () { return degisimler.length > 0; },
  analizEt: function () { analiz++; },
  analizSuruyor: function () { return false; },
  tusTut: function (t) { tusIlgileri.push(t); }
});
S.ciz();
var tutKok = SDOM["cap-dalga-tutamaklar"];
var tutListe = tutKok.childNodes;
ok("şerit: kart seçiliyken açık, başlık kart numarası, her sınır bir tutamak", !SDOM["cap-dalga"].hidden && SDOM["cap-dalga-baslik"].textContent === "Ses dalgası · #2" && tutListe.length === 7,
  tutListe.length);
var kb = tutListe.filter(function (d) { return d.getAttribute("data-sinir") === "kb"; })[0];
var o0 = tutListe.filter(function (d) { return d.getAttribute("data-sinir") === "o0"; })[0];
ok("tutamak: role=slider, odaklanabilir, aria-label / değer / metin (ms)", kb.getAttribute("role") === "slider" && kb.getAttribute("tabindex") === "0" &&
  kb.getAttribute("aria-label") === "Kart girişi" && o0.getAttribute("aria-label") === "“c” / “d” sınırı" && o0.getAttribute("aria-valuenow") === "2500" &&
  o0.getAttribute("aria-valuetext") === "00:02.500" && /kelime/.test(o0.className) && /kart/.test(kb.className), J(o0.attrs));
var gvS = U.gorunum(belgeSegs[1], seritKay);
var beklenenX = (2.5 - gvS.bas) / (gvS.son - gvS.bas) * 300;
ok("tutamak konumu zaman ekseninde (px)", Math.abs(parseFloat(o0.style.left) - beklenenX) < 0.11, o0.style.left + " ~ " + beklenenX.toFixed(1));
ok("tuval: kabın genişliği × aygıt piksel oranı, dalga ve kelime adları çizilir", SDOM["cap-dalga-tuval"].width === 600 && SDOM["cap-dalga-tuval"].height === 128 && SDOM["cap-dalga-tuval"].style.width === undefined &&
  cizimler.filter(function (c) { return c[0] === "fillRect"; }).length > 100 && cizimler.some(function (c) { return c[0] === "fillText" && c[1] === "c"; }));
o0.yay("focus"); o0.yay("blur");
ok("tutamak odak alınca tuş ilgisi tutulur, bırakınca salınır", J(tusIlgileri) === J([true, false]));
var ti = JSON.parse(U.tusIlgisi(false)), tm = JSON.parse(U.tusIlgisi(true));
ok("tusIlgisi: ←/→, Home, End Shift'li ve Shift'siz (Windows VK / macOS kodları)", ti.length === 8 && tm.length === 8 &&
  J(ti.filter(function (x) { return !x.shiftKey; }).map(function (x) { return x.keyCode; })) === J([37, 39, 36, 35]) &&
  J(tm.filter(function (x) { return x.shiftKey; }).map(function (x) { return x.keyCode; })) === J([123, 124, 115, 119]));
var e1 = o0.yay("keydown", { key: "ArrowRight" });
var e2 = o0.yay("keydown", { key: "ArrowRight", shiftKey: true });
ok("klavye: → 10 ms, Shift+→ 1 kare (25 fps); varsayılan davranış engellenir", e1.engellendi && e2.engellendi && degisimler.length === 2 &&
  Math.abs(degisimler[0].seg.words[0].end - 2.51) < 1e-9 && Math.abs(degisimler[1].seg.words[0].end - 2.55) < 1e-9 && degisimler[1].seg.words[1].start === degisimler[1].seg.words[0].end,
  J(degisimler.map(function (x) { return x.seg.words[0].end; })));
ok("klavye: tuş dizisinin yalnız ilk adımı anlık görüntü ister (tek geri al)", degisimler[0].b.ilk === true && degisimler[1].b.ilk === false && degisimler[1].b.bitti === true);
var ilkKb = kb;
S.ciz();
ok("yeniden çizimde tutamak öğeleri korunur (klavye odağı kaybolmaz)", tutKok.childNodes.indexOf(ilkKb) !== -1 && tutKok.childNodes.length === 7 &&
  o0.getAttribute("aria-valuenow") === "2550");
kb.yay("keydown", { key: "ArrowLeft" });
ok("başka sınıra geçince yeni anlık görüntü", degisimler[2].b.ilk === true && Math.abs(degisimler[2].seg.start - 2.09) < 1e-9, J(degisimler[2]));
var nSinir = degisimler.length;
var ks = tutListe.filter(function (d) { return d.getAttribute("data-sinir") === "ks"; })[0];
belgeSegs[1].end = belgeSegs[2].start;   // kart çıkışı sonraki kartın girişinde: → kımıldatamaz
ks.yay("keydown", { key: "ArrowRight" });
ok("sınırda kımıldamayan tutamak değişiklik / anlık görüntü üretmez", degisimler.length === nSinir);
var eHome = ks.yay("keydown", { key: "Home" });
ok("Home: kartın ilk sınırına odak", eHome.engellendi && belgeSahte.activeElement === kb);
var eTab = kb.yay("keydown", { key: "Tab" });
ok("Tab gibi başka tuşlar engellenmez, değişiklik yapmaz", !eTab.engellendi && degisimler.length === 3);
// sürükleme: pointerdown → iki hareket → bırak
var nKb = degisimler.length;
var b2 = tutListe.filter(function (d) { return d.getAttribute("data-sinir") === "b2"; })[0];
b2.yay("pointerdown", { button: 0, pointerId: 7, clientX: 0 });
var xHedef = (2.86 - S._durum.bas) / (S._durum.son - S._durum.bas) * 300 + 20;
b2.yay("pointermove", { pointerId: 7, clientX: xHedef });
b2.yay("pointermove", { pointerId: 7, clientX: xHedef + 1 });
b2.yay("pointermove", { pointerId: 9, clientX: 5 });
b2.yay("pointerup", { pointerId: 7 });
var sur = degisimler.slice(nKb);
ok("sürükleme: ilk hareket anlık görüntü ister, sonrakiler istemez, bırakınca 'bitti' (liste yenilenir)", sur.length === 3 && sur[0].b.ilk === true && sur[1].b.ilk === false &&
  sur[2].b.bitti === true && sur[0].b.bitti === false && Math.abs(sur[0].seg.words[2].start - 2.86) < 0.002, J(sur.map(function (x) { return [x.b, x.seg.words[2].start]; })));
ok("sürükleme: başka işaretçinin hareketi yok sayılır; odak tutamağa geçer", b2.odak === 1 && !/surukleniyor/.test(b2.className));
SDOM["cap-dalga-dinle"].click(); SDOM["cap-dalga-yasla"].click(); SDOM["cap-dalga-geri"].click();
ok("Dinle / Hepsini sese yasla / Geri al düğmeleri bağlı; Geri al yığın boşken kapalı", dinlenen[0] === 1 && yaslandi === 1 && geriAlindi === 1 && SDOM["cap-dalga-geri"].disabled === false);
aeMi = true; S.ciz();
ok("After Effects: Dinle kapalı (ayrıca data-yalniz-premiere ile gizli)", SDOM["cap-dalga-dinle"].disabled === true);
aeMi = false;
kaynakVar = false; S.ciz();
ok("belgenin sesi yoksa: dalga alanı gizli, 'Seçili klibin sesini analiz et' görünür, tutamak yok", SDOM["cap-dalga-alan"].hidden && !SDOM["cap-dalga-bos"].hidden && tutKok.childNodes.length === 0);
SDOM["cap-dalga-analiz"].click();
ok("analiz et düğmesi bağlı", analiz === 1);
kaynakVar = true;
secili = 2; S.ciz();
ok("kelimesiz kart: yalnız giriş / çıkış tutamağı", tutKok.childNodes.length === 2);
belgeSegs = []; S.ciz();
ok("altyazı yokken şerit gizli", SDOM["cap-dalga"].hidden && tutKok.childNodes.length === 0);

/* ---------------- 6) captions.js bağlantısı (gerçek işlevler) ---------------- */
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
function govde(imza) {
  var i = cap.indexOf(imza);
  if (i < 0) throw new Error("yok: " + imza);
  return cap.slice(i, cap.indexOf("\n  }\n", i) + 4);
}
function ortamKur(o) {
  o = o || {};
  var dom = {}, toastlar = [], kayit = { render: 0, taslak: 0 };
  ["cap-senkron-rapor", "cap-senkron-rapor-metin", "cap-senkron-geri", "cap-dalga-geri", "cap-undo", "cap-redo", "cap-segments"].forEach(function (id) { dom[id] = dugum("div", id); });
  dom["cap-senkron-rapor"].hidden = true; dom["cap-senkron-geri"].hidden = true;
  dom["cap-segments"].querySelector = function () { return null; };
  var ayar = o.ayar || {};
  var K = { settings: function () { return ayar; }, saveSettings: function () {}, log: function () {}, fs: { statSync: function () { return { size: 1, mtimeMs: 1 }; } } };
  var KApp = { ctx: function () { return o.ctx || { frame: 0.04 }; }, toast: function (m, t) { toastlar.push([m, t]); } };
  var SZsahte = o.SZ || { sesZarfiCikar: function () { return Promise.resolve({ analiz: a }); }, anahtar: Z.anahtar, onbellek: { koy: function () {} } };
  var kod = [
    "var segments = [], segmentsMode = " + J(o.mod || "plain") + ", ceviriDili = '', algilananDil = '', shortsYuklenen = '', ornekBelge = false, ornekSekansId = '', busy = false;",
    "var belgeSekansId = '', belgeSira = 0, belgeKesimAdi = null, undoStack = [], redoStack = [], UNDO_MAX = 50, aktifIptal = null, selectedSegment = -1;",
    cap.slice(cap.indexOf("  var senkronBelgeSayac = 0;"), cap.indexOf("  var senkronDinleSaat = null;\n") + 32),
    "function render() { kayit.render++; } function renderHistory() {} function uygulaEtiketiniSifirla() {} function shortsDugmesi() {} function belgeDegisti() {}",
    "function saveDraftSoon() { kayit.taslak++; } function saveDraftNow() { kayit.taslak++; } function tc(s) { return String(s); }",
    cap.slice(cap.indexOf("  var SENKRON_HIZ = "), cap.indexOf("\n", cap.indexOf("  var SENKRON_HIZ = ")) + 1),
    govde("function durumAl("), govde("function durumYukle("), govde("function snapshot("), govde("function undo("), govde("function redo("), govde("function refreshUndoUI("),
    govde("function belgeBagla("), govde("function senkronDogrulaAcik("), govde("function senkronAyari("), govde("function senkronFps("), govde("function senkronKaynakEkle("),
    govde("function senkronBelgeKaynaklari("), govde("async function senkronSesiAnaliz("), govde("function senkronIsSonu("), govde("function senkronUygula("),
    govde("function senkronRaporGoster("), govde("function senkronRaporGizle("), govde("function senkronGeriDurumu("), govde("function senkronGeriAl("),
    govde("async function senkronHepsiniYasla("), govde("function senkronSinirDegisti("),
    "return { durum: function () { return { segments: segments, undo: undoStack, redo: redoStack, belge: senkronBelgeNo, kaynak: senkronKaynaklar }; },",
    "  yukle: function (s, sekans) { segments = JSON.parse(JSON.stringify(s)); belgeBagla(sekans || 'S', 0, null); },",
    "  iptal: function (j) { aktifIptal = j; }, metinDuzenle: function () { undoStack.push({ segs: JSON.stringify(segments), etiket: 'metin düzenleme' }); refreshUndoUI(); },",
    "  senkronSesiAnaliz: senkronSesiAnaliz, senkronIsSonu: senkronIsSonu, senkronGeriAl: senkronGeriAl, senkronHepsiniYasla: senkronHepsiniYasla,",
    "  senkronSinirDegisti: senkronSinirDegisti, senkronDogrulaAcik: senkronDogrulaAcik, senkronAyari: senkronAyari, senkronFps: senkronFps, undo: undo, redo: redo, belgeBagla: belgeBagla };"
  ].join("\n");
  var api = new Function("el", "K", "KApp", "SZ", "SUI", "document", "kayit", kod)(function (id) { return dom[id] || null; }, K, KApp, SZsahte, U, belgeSahte, kayit);
  return { api: api, dom: dom, toastlar: toastlar, kayit: kayit, ayar: ayar };
}
(async function () {
  var ham = kaydir(G.kartla(G.boz(g.kelimeler, 0.25, 0.04, 5), 4), T0);
  var o = ortamKur();
  var C = o.api;
  ok("satır modunda kart en az kullanıcının en kısa ekran süresi (varsayılan 0,8 sn); kelime kelime / birikimli modda motorun değeri",
    J(C.senkronAyari()) === J({ minKartMs: 800 }) && J(ortamKur({ ayar: { altyaziMinSure: 1.2 } }).api.senkronAyari()) === J({ minKartMs: 1200 }) &&
    J(ortamKur({ mod: "k1" }).api.senkronAyari()) === J({}) && J(ortamKur({ mod: "kc" }).api.senkronAyari()) === J({}));
  ok("ayar: senkron doğrulama varsayılan açık, kapatılabilir; kare hızı bağlamdan (1 / kare)", C.senkronDogrulaAcik() === true && ortamKur({ ayar: { senkronDogrula: false } }).api.senkronDogrulaAcik() === false &&
    C.senkronFps() === 25 && ortamKur({ ctx: {} }).api.senkronFps() === 0);
  C.yukle(ham, "S1");
  var belge1 = C.durum().belge;
  var kaynakSes = await C.senkronSesiAnaliz("/gecici/cap_1.wav", T0, a.sure, { media: "/medya/klip.mp4", inPoint: 0, dur: a.sure });
  ok("senkronSesiAnaliz: geçici sesten sekans eksenli kaynak", kaynakSes && kaynakSes.t0 === T0 && kaynakSes.analiz === a);
  C.senkronIsSonu([kaynakSes], "");
  var d1 = C.durum();
  var h = ort(duz(d1.segments).map(function (w, i) { return Math.abs(w.start - gercek[i].start) * 1000; }));
  ok("Oluştur sonrası: belge sese oturur, tek geri al adımı 'sese yaslama', kaynak bu belgeye bağlı", h < 20 && d1.undo.length === 1 && d1.undo[0].etiket === "sese yaslama" &&
    d1.kaynak.length === 1 && d1.kaynak[0].belge === belge1, h.toFixed(1));
  ok("rapor satırı görünür, metni raporMetni, ayrıntıda kayma, rapordaki Geri al görünür", !o.dom["cap-senkron-rapor"].hidden && /^\d+ kelime sese oturtuldu · ortalama sapma \d+ ms → \d+ ms/.test(o.dom["cap-senkron-rapor-metin"].textContent) &&
    /toplam kayma/.test(o.dom["cap-senkron-rapor"].title) && o.dom["cap-senkron-geri"].hidden === false && o.dom["cap-senkron-rapor"].getAttribute("data-ton") !== null, o.dom["cap-senkron-rapor-metin"].textContent);
  C.senkronGeriAl();
  var d2 = C.durum();
  ok("rapordaki Geri al: motorun zamanlarına döner (aynı geri al yığını), Geri al gizlenir, rapor söyler", J(d2.segments) === J(ham) && d2.undo.length === 0 && d2.redo.length === 1 &&
    o.dom["cap-senkron-geri"].hidden === true && o.dom["cap-senkron-rapor-metin"].textContent === "Senkron düzeltmesi geri alındı" && /Geri alındı: sese yaslama/.test(J(o.toastlar)));
  C.redo();
  ok("Yinele düzeltmeyi geri getirir", J(C.durum().segments) === J(d1.segments));
  C.undo(); C.redo();
  // tepedeki girdi artık doğrulamanınki değil: başka düzenleme gelince Geri al gizlenir
  await C.senkronHepsiniYasla();
  var d3 = C.durum();
  ok("Hepsini sese yasla: zaten yaslıysa anlık görüntü almaz; rapor ve uyarı tonuyla toast", d3.undo.length === 1 && o.kayit.render > 0 && o.toastlar.length >= 2, J(o.toastlar.slice(-1)));
  C.yukle(ham, "S1");
  ok("yeni belge (belgeBagla): rapor gizlenir, önceki belgenin sesi bu belgeye uygulanmaz", o.dom["cap-senkron-rapor"].hidden === true && C.durum().belge !== belge1);
  o.toastlar.length = 0;
  var oncekiAnaliz = 0;
  var o2 = ortamKur({ SZ: { sesZarfiCikar: function () { oncekiAnaliz++; return Promise.resolve({ analiz: a }); } } });
  o2.api.yukle(ham, "S9");
  o2.api.senkronIsSonu([U.kaynak(a, T0, 0)], "");
  o2.api.metinDuzenle();
  ok("başka bir düzenleme yığının tepesine gelince rapordaki Geri al gizlenir (yanlış adımı geri almaz)", o2.dom["cap-senkron-geri"].hidden === true);
  var uz = o2.api.durum().undo.length;
  o2.api.senkronGeriAl();
  ok("tepede değilken rapordaki Geri al hiçbir şey yapmaz", o2.api.durum().undo.length === uz);
  var belgeA = o2.api.durum().belge;
  o2.api.undo(); o2.api.undo();
  ok("geri al belge numarasını geri getirir (geri dönülen belgenin sesi yeniden geçerli)", o2.api.durum().belge === belgeA);
  // iptal
  var o3 = ortamKur();
  o3.api.yukle(ham, "S1");
  o3.api.iptal({ iptalEdildi: true });
  o3.api.senkronIsSonu([U.kaynak(a, T0, 0)], "");
  ok("İptal: transkript olduğu gibi, geri al girdisi yok, rapor iptali söyler", J(o3.api.durum().segments) === J(ham) && o3.api.durum().undo.length === 0 &&
    o3.dom["cap-senkron-rapor-metin"].textContent === "Senkron doğrulama iptal edildi: zamanlar motorun verdiği gibi" && !o3.dom["cap-senkron-rapor"].hidden);
  // ses yok / hız değişmiş
  var o4 = ortamKur();
  o4.api.yukle(ham, "S1");
  o4.api.senkronIsSonu([], "Hızı değiştirilmiş klipte senkron doğrulama yapılmadı");
  ok("ses analizi yoksa: zamanlar aynen, rapor nedeni söyler", J(o4.api.durum().segments) === J(ham) && o4.dom["cap-senkron-rapor-metin"].textContent === "Hızı değiştirilmiş klipte senkron doğrulama yapılmadı");
  var o5 = ortamKur({ SZ: { sesZarfiCikar: function () { throw new Error("ffmpeg patladı"); } } });
  var k5 = await o5.api.senkronSesiAnaliz("/x.wav", 0, 3, null);
  var o6 = ortamKur({ SZ: { sesZarfiCikar: function () { return Promise.resolve({ iptal: true }); } } });
  var k6 = await o6.api.senkronSesiAnaliz("/x.wav", 0, 3, null);
  ok("senkronSesiAnaliz hiç fırlatmaz: hata ve iptal null", k5 === null && k6 === null);
  // şeritten sınır taşıma: tek anlık görüntü, liste ertelenmiş yenilenir
  var o7 = ortamKur();
  o7.api.yukle(segs, "S1");
  var s1 = U.sinirTasi(segs, 1, "o0", 2.6).seg, s2 = U.sinirTasi([segs[0], s1, segs[2]], 1, "o0", 2.7).seg;
  o7.api.senkronSinirDegisti(1, s1, { ilk: true, bitti: false, etiket: "dalga sürükleme" });
  o7.api.senkronSinirDegisti(1, s2, { ilk: false, bitti: true, etiket: "dalga sürükleme" });
  ok("sınır taşıma: sürüklemenin ilk adımında tek anlık görüntü, son değer belgede", o7.api.durum().undo.length === 1 && o7.api.durum().undo[0].etiket === "dalga sürükleme" &&
    o7.api.durum().segments[1].words[0].end === 2.7);
  o7.api.undo();
  ok("tek Ctrl+Z bütün sürüklemeyi geri alır", J(o7.api.durum().segments) === J(segs));
  await new Promise(function (r2) { setTimeout(r2, 300); });
  ok("bitince liste ertelenmiş yenilenir ve taslak yazılır", o7.kayit.render >= 1 && o7.kayit.taslak >= 1);

  /* ---------- go() sırası, HTML, CSS, host eşlemesi ---------- */
  var goG = govde("async function go(");
  var iTek = goG.indexOf("senkronSesiAnaliz(audioSrc"), iSon = goG.indexOf("senkronIsSonu(senkronSesler"), iEtiket = goG.indexOf("uygulaEtiketiniSifirla();  // yeni transkript");
  var iSonuc = goG.indexOf('el("cap-result").hidden = false;', iEtiket), iFinally = goG.indexOf("} finally {\n      tempFiles.forEach");
  ok("go(): doğrulama yeni belge kurulduktan (bayraklar, geri al) sonra, editör açılmadan ve geçici ses silinmeden önce", iEtiket > 0 && iTek > iEtiket && iSon > iTek && iSonuc > iSon && iFinally > iSonuc);
  ok("go(): rehberin örneği hariç, ayara bağlı; hızı değişmiş klipte atlanır", /var senkronIste = !ornek && senkronDogrulaAcik\(\);/.test(goG) && (goG.match(/Math\.abs\((speedFactor|bf) - 1\) < 0\.002/g) || []).length === 2);
  var iTopluAnaliz = goG.indexOf("senkronSesiAnaliz(ba,"), iTopluSil = goG.indexOf("if (ba) { try { K.fs.unlinkSync(ba)");
  ok("go(): toplu klipte her klibin sesi silinmeden analiz edilir", iTopluAnaliz > 0 && iTopluSil > iTopluAnaliz);
  ok("render(): uyarı işareti düğme (çevrilir, odaklanır), şerit her yenilemede çizilir; satır seçimi şeridi günceller",
    /su\.className = "seg-senkron-uyari"/.test(govde("function render(")) && /createElement\("button"\);\n        su\.type = "button";/.test(govde("function render(")) &&
    /if \(senkronSerit\) senkronSerit\.ciz\(\);\n  \}$/.test(govde("function render(")));
  var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
  var gel = html.slice(html.indexOf('id="cap-gelismis"'), html.indexOf("</details>", html.indexOf('id="cap-gelismis"')));
  ok("HTML: ayar Gelişmiş ayarlar içinde, varsayılan işaretli", /<input id="cap-senkron" type="checkbox" checked>/.test(gel));
  var adim1 = html.slice(html.indexOf('id="cap-adim-olustur"'), html.indexOf('id="cap-result"'));
  ok("HTML: rapor satırı 1. adımda, role=status, Geri al düğmesi", /id="cap-senkron-rapor" class="senkron-rapor" role="status" hidden/.test(adim1) && /id="cap-senkron-geri"[^>]*>Geri al</.test(adim1));
  var sonuc = html.slice(html.indexOf('id="cap-result"'), html.indexOf('id="cap-segments"'));
  ok("HTML: şerit Caption Editor'da, satır listesinden önce ve dışında (çeviri kullanıcı içeriğini atlamaz)", /id="cap-dalga" class="dalga" hidden/.test(sonuc) &&
    /id="cap-dalga-tuval"[^>]*aria-hidden="true"/.test(sonuc) && /id="cap-dalga-tutamaklar"[^>]*role="group"[^>]*aria-label=/.test(sonuc));
  ok("HTML: Dinle yalnız Premiere'de (data-yalniz-premiere), Hepsini sese yasla ve Geri al ortak", /id="cap-dalga-dinle"[^>]*data-yalniz-premiere/.test(sonuc) &&
    !/id="cap-dalga-yasla"[^>]*data-yalniz-premiere/.test(sonuc) && !/id="cap-dalga-geri"[^>]*data-yalniz-premiere/.test(sonuc));
  var iS = html.indexOf('src="js/senkron.js"'), iU = html.indexOf('src="js/senkron-ui.js"'), iC = html.indexOf('src="js/captions.js"');
  ok("HTML: senkron-ui.js senkron.js'ten sonra, captions.js'ten önce yüklenir", iS > 0 && iU > iS && iC > iU);
  var css = fs.readFileSync(path.join(KOK, "css", "style.css"), "utf8");
  var csD = css.slice(css.indexOf("/* Senkron doğrulama (js/senkron-ui.js)")).replace(/\/\*[\s\S]*?\*\//g, "");
  ok("CSS: dar panel (320 px) — sabit genişlik yok, düğmeler sarar, tuval %100; odak görünür (:focus, CEF 74), flex gap yok",
    !/(?:^|[;{\s])(?:min-)?width:\s*(\d{3,})px/.test(csD) && /\.dalga-btns \{[^}]*flex-wrap: wrap/.test(csD) && /\.dalga-tuval \{[^}]*width: 100%/.test(csD) &&
    /\.dalga-tutamak:focus::after/.test(csD) && /\.seg-senkron-uyari:hover, \.seg-senkron-uyari:focus/.test(csD) && !/[{;]\s*gap:/.test(csD) && !/focus-visible/.test(csD));
  var AP = require(path.join(KOK, "js", "ae-plan.js"));
  ok("After Effects: KS_oynat / KS_oynatDurdur gönderilmez (engel), Premiere'de olduğu gibi", !!AP.hostCagrisi("KS_oynat", "AEFT").engel && !!AP.hostCagrisi("KS_oynatDurdur", "AEFT").engel &&
    AP.hostCagrisi("KS_oynat", "PPRO").ad === "KS_oynat");
  var vr = fs.readFileSync(path.join(KOK, "tools", "verify-release.ps1"), "utf8");
  ok("paket denetimi senkron-ui.js'i bekler", /js\/senkron-ui\\\.js\$/.test(vr));

  console.log("\n" + gecen + "/" + toplam + " gecti");
  if (gecen !== toplam) process.exit(1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack || e)); process.exit(1); });
