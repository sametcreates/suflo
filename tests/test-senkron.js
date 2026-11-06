// Suflo testi: altyazı senkron doğrulama motoru — js/senkron.js (+ js/ses-zarf.js analizi)
//  - +250 ms / −180 ms kaydırılmış transkript düzelir, ortalama kelime hatası < 20 ms, çakışma yok, sıra korunur
//  - doğru transkript bozulmaz; gürültü / müzik / sessizlikte zamanlara dokunulmaz, işaretlenir
//  - kart giriş / çıkışı (ön pay, kuyruk, asılı kalmama, çakışmazlık), kare yuvarlama (8 hız, drop-frame gösterim)
//  - girdi değişmez, bilinmeyen alanlar korunur, sekans ekseni (t0), 1 saatlik başarım
var fs = require("fs");
var path = require("path");
var Z = require("../js/ses-zarf.js");
var S = require("../js/senkron.js");
var G = require("./_senkron-sentetik.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
function ort(d) { return d.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, d.length); }
function duz(kartlar) { var o = []; kartlar.forEach(function (c) { (c.words || []).forEach(function (w) { o.push(w); }); }); return o; }
function hatalar(kel, gercek) {
  return {
    bas: ort(kel.map(function (w, i) { return Math.abs(w.start - gercek[i].start) * 1000; })),
    son: ort(kel.map(function (w, i) { return Math.abs(w.end - gercek[i].end) * 1000; }))
  };
}
function cakismaYok(kel, minS) {
  for (var i = 0; i < kel.length; i++) {
    if (!(kel[i].end > kel[i].start)) return "süre " + i;
    if (minS && kel[i].end - kel[i].start < minS - 1e-6) return "kısa " + i;
    if (i && kel[i].start < kel[i - 1].end - 1e-9) return "çakışma " + i;
  }
  return "";
}

/* ---------------- 1) +250 ms kaymış transkript ---------------- */
var g = G.uret({ tohum: 7, kelime: 60 });
var a = Z.analizEt(g.pcm);
var bozuk = G.boz(g.kelimeler, 0.25, 0.04, 5);
var kartlar = G.kartla(bozuk, 4);
var girdiKopya = J(kartlar);
var onceH = hatalar(bozuk, g.kelimeler);
var r = S.hizala(kartlar, a, {});
var yeni = duz(r.kartlar);
var sonraH = hatalar(yeni, g.kelimeler);
ok("+250 ms: toplam kayma bulundu ve uygulandı (≈ −250 ms; bozma sapması ±40 ms)", r.rapor.kayma.uygulandi && Math.abs(r.rapor.kayma.ms + 250) <= 25 && r.rapor.kayma.guven >= 0.5, J(r.rapor.kayma));
ok("+250 ms: ortalama kelime başı hatası < 20 ms (önce ≈ 250)", sonraH.bas < 20 && onceH.bas > 200, onceH.bas.toFixed(1) + " → " + sonraH.bas.toFixed(1));
ok("+250 ms: ortalama kelime sonu hatası < 20 ms", sonraH.son < 20, onceH.son.toFixed(1) + " → " + sonraH.son.toFixed(1));
ok("+250 ms: kelimeler çakışmaz, sıra korunur, en kısa süre 60 ms", cakismaYok(yeni, 0.06) === "" && yeni.length === bozuk.length && yeni.every(function (w, i) { return w.text === bozuk[i].text; }), cakismaYok(yeni, 0.06));
ok("rapor: duzeltilen / ortalamaOnceMs → ortalamaSonraMs / eminDegil / kayma alanları", r.rapor.duzeltilen > 50 && r.rapor.ortalamaOnceMs > 100 && r.rapor.ortalamaSonraMs < 15 &&
  Array.isArray(r.rapor.eminDegil) && r.rapor.atlandi === null && r.rapor.kelime === 60 && r.rapor.kart === 15 && r.rapor.kelimeGuven.length === 60 && r.rapor.kartGuven.length === 15,
  J({ d: r.rapor.duzeltilen, o: r.rapor.ortalamaOnceMs, s: r.rapor.ortalamaSonraMs, e: r.rapor.eminDegil.length }));
ok("temiz seste düzeltilmiş kelimeler güvenli (en çok 3 'emin değil', ortalama güven > 0.7)", r.rapor.eminDegil.length <= 3 && ort(r.rapor.kelimeGuven) > 0.7, r.rapor.eminDegil.length + " / " + ort(r.rapor.kelimeGuven).toFixed(2));
ok("girdi değişmedi (kopya döner)", J(kartlar) === girdiKopya);
var kartCak = r.kartlar.every(function (c, i) { return c.end > c.start && (!i || c.start >= r.kartlar[i - 1].end - 1e-9); });
var icinde = r.kartlar.every(function (c) { return c.words.every(function (w) { return w.start >= c.start - 1e-9 && w.end <= c.end + 1e-9; }); });
ok("kartlar çakışmaz, kelimeler kartın içinde", kartCak && icinde);
ok("kart girişi = ilk kelime − 20 ms ön pay (önceki kartın son kelimesine binmiyorsa)", r.kartlar.every(function (c, i) {
  var ilk = c.words[0].start, onceSon = i ? r.kartlar[i - 1].words[r.kartlar[i - 1].words.length - 1].end : -1;
  var beklenen = Math.max(ilk - 0.02, onceSon, 0);
  return Math.abs(c.start - Math.min(beklenen, ilk)) < 0.0015;
}), J(r.kartlar.slice(0, 3).map(function (c) { return [c.start, c.words[0].start]; })));
ok("kart çıkışı = son kelime + 150 ms kuyruk, sonraki kartın girişini geçmez", r.kartlar.every(function (c, i) {
  var son = c.words[c.words.length - 1].end, sonraki = i + 1 < r.kartlar.length ? r.kartlar[i + 1].start : Infinity;
  return Math.abs(c.end - Math.min(son + 0.15, sonraki)) < 0.0015 || (c.end >= son - 1e-9 && c.end <= sonraki + 1e-9 && c.end <= son + 0.15 + 1e-9);
}));

/* ---------------- 2) birkaç tohum ve ters yön ---------------- */
[8, 9, 10].forEach(function (t) {
  var gg = G.uret({ tohum: t, kelime: 50 }), aa = Z.analizEt(gg.pcm);
  var rr = S.hizala(G.kartla(G.boz(gg.kelimeler, 0.25, 0.04, t + 1), 3), aa, {});
  var h = hatalar(duz(rr.kartlar), gg.kelimeler);
  ok("tohum " + t + ": +250 ms düzelir, ortalama hata < 20 ms (baş / son), çakışma yok", h.bas < 20 && h.son < 20 && cakismaYok(duz(rr.kartlar)) === "", h.bas.toFixed(1) + " / " + h.son.toFixed(1));
});
var gN = G.uret({ tohum: 21, kelime: 45 }), aN = Z.analizEt(gN.pcm);
var rN = S.hizala(G.kartla(G.boz(gN.kelimeler, -0.18, 0.03, 4), 5), aN, {});
var hN = hatalar(duz(rN.kartlar), gN.kelimeler);
ok("−180 ms (altyazı erken) düzelir: kayma ≈ +180, ortalama hata < 20 ms", rN.rapor.kayma.uygulandi && Math.abs(rN.rapor.kayma.ms - 180) <= 25 && hN.bas < 20 && hN.son < 20, J(rN.rapor.kayma) + " " + hN.bas.toFixed(1));

/* ---------------- 3) doğru transkript bozulmaz ---------------- */
var dogru = G.boz(g.kelimeler, 0, 0.012, 2);
var hD0 = hatalar(dogru, g.kelimeler);
var rD = S.hizala(G.kartla(dogru, 4), a, {});
var hD = hatalar(duz(rD.kartlar), g.kelimeler);
ok("zaten doğru transkript (±12 ms): toplam kayma uygulanmaz, hata artmaz", !rD.rapor.kayma.uygulandi && hD.bas <= hD0.bas + 1 && hD.son <= hD0.son + 3 && hD.bas < 10, J(rD.rapor.kayma) + " " + hD0.bas.toFixed(1) + "→" + hD.bas.toFixed(1) + " / " + hD0.son.toFixed(1) + "→" + hD.son.toFixed(1));
var tam = S.hizala(G.kartla(g.kelimeler.map(function (w) { return { start: w.start, end: w.end, text: w.text }; }), 4), a, {});
var hT = hatalar(duz(tam.kartlar), g.kelimeler);
ok("birebir doğru transkript: kelimeler 10 ms'den fazla oynamaz", hT.bas < 5 && hT.son < 10, hT.bas.toFixed(2) + " / " + hT.son.toFixed(2));

/* ---------------- 4) aşırı düzeltme yok: gürültü / müzik / sessizlik ---------------- */
function aynen(sonuc, girdi) { return J(sonuc.kartlar) === J(girdi); }
var gG = G.uret({ tohum: 5, kelime: 40, gurultuDb: -14 });
var aG = Z.analizEt(gG.pcm);
var kG = G.kartla(G.boz(gG.kelimeler, 0.25, 0.04, 6), 4);
var rG = S.hizala(kG, aG, {});
ok("gürültülü ses (konuşma ≈ gürültü düzeyinde): kontrast düşük, zamanlara dokunulmaz", aG.kontrast < 10 && rG.rapor.atlandi === "dusukKontrast" && aynen(rG, kG) && rG.rapor.duzeltilen === 0, aG.kontrast.toFixed(1) + " " + rG.rapor.atlandi);
ok("gürültülü ses: kartlar 'emin değil' (gürültü) işaretli, kayma uygulanmadı", rG.rapor.eminDegil.length === kG.length && rG.rapor.eminDegil.every(function (e) { return e.neden === "gurultu" && e.tur === "kart"; }) && !rG.rapor.kayma.uygulandi);
var gM = G.uret({ tohum: 6, kelime: 40, muzikDb: -12 });
var aM = Z.analizEt(gM.pcm);
var kM = G.kartla(G.boz(gM.kelimeler, 0.25, 0.04, 7), 4);
var rM = S.hizala(kM, aM, {});
ok("müzik yatağı altında konuşma (müzik ≈ konuşma): zamanlar aynen kalır, işaretlenir", rM.rapor.atlandi !== null && aynen(rM, kM) && rM.rapor.eminDegil.length === kM.length, aM.kontrast.toFixed(1) + " oran " + aM.konusmaOrani.toFixed(2) + " " + rM.rapor.atlandi);
var gM2 = G.uret({ tohum: 6, kelime: 40, muzikDb: -24 });
var rM2 = S.hizala(G.kartla(G.boz(gM2.kelimeler, 0.25, 0.04, 7), 4), Z.analizEt(gM2.pcm), {});
var hM2 = hatalar(duz(rM2.kartlar), gM2.kelimeler);
ok("hafif müzik altında (−24 dB) konuşma yine düzelir (ortalama hata < 20 ms)", rM2.rapor.atlandi === null && hM2.bas < 20 && hM2.son < 20, hM2.bas.toFixed(1) + " / " + hM2.son.toFixed(1));
// başka sesin transkripti (yanlış klip): hiçbir gecikmede oturmaz -> dokunulmaz
[99, 98, 50].forEach(function (t) {
  var gY = G.uret({ tohum: t, kelime: 60 });
  var kY = G.kartla(G.boz(gY.kelimeler, 0, 0.02, 3), 3);
  var rY = S.hizala(kY, a, {});
  var kYk = kY.map(function (c) { return { start: c.start, end: c.end, text: c.text }; });
  var rYk = S.hizala(kYk, a, {});
  ok("başka sesin transkripti (tohum " + t + "): kelimeli ve kelimesiz kartlar aynen kalır ('uyumsuz')", rY.rapor.atlandi === "uyumsuz" && aynen(rY, kY) && rYk.rapor.atlandi === "uyumsuz" && aynen(rYk, kYk) &&
    rY.rapor.eminDegil.length === kY.length, rY.rapor.uyum + " / " + rYk.rapor.uyum);
});
var sessiz = new Float32Array(16000 * 8);
for (var i0 = 0; i0 < sessiz.length; i0++) sessiz[i0] = 1e-4 * Math.sin(i0 * 0.37);
var aS = Z.analizEt(sessiz);
var rS = S.hizala(kG, aS, {});
ok("sessiz ses: zamanlar aynen kalır, neden 'sessizlik'", rS.rapor.atlandi !== null && aynen(rS, kG) && rS.rapor.eminDegil.every(function (e) { return e.neden === "sessizlik" || e.neden === "gurultu"; }), rS.rapor.atlandi);
var rYok = S.hizala(kG, null, {});
ok("analiz yok: zamanlar aynen, atlandi 'analizYok'", rYok.rapor.atlandi === "analizYok" && aynen(rYok, kG));
ok("boş kart listesi: hata yok", S.hizala([], a, {}).kartlar.length === 0);

// sessizliğe düşen kelime: pencere dışında konuşma yok -> taşınmaz, işaretlenir
var gS = G.uret({ tohum: 12, kelime: 12 });
var aS2 = Z.analizEt(gS.pcm);
var kS = gS.kelimeler.map(function (w) { return { start: w.start, end: w.end, text: w.text }; });
var sonW = kS[kS.length - 1];
kS.push({ start: sonW.end + 0.35, end: sonW.end + 0.55, text: "hayalet" });   // ses bitti, kelime sessizlikte
var rS2 = S.hizala([{ start: kS[0].start, end: kS[kS.length - 1].end, text: "x", words: kS }], aS2, { kaymaUygula: false });
var hay = rS2.kartlar[0].words[kS.length - 1];
var isaret = rS2.rapor.eminDegil.filter(function (e) { return e.metin === "hayalet"; })[0];
ok("sessizliğe düşen kelime 'emin değil' (sessizlik) işaretlenir, pencereden fazla taşınmaz", !!isaret && isaret.neden === "sessizlik" && Math.abs(hay.start - (sonW.end + 0.35)) <= 0.121, J(isaret) + " " + J(hay));
ok("kelimeli kartın çıkışı son (işaretli) kelimeyi kesmez", rS2.kartlar[0].end >= hay.end - 1e-9);

/* ---------------- 5) kelimesiz kartlar ---------------- */
var gK = G.uret({ tohum: 13, kelime: 30, bitisikOran: 0 });
var aK = Z.analizEt(gK.pcm);
var kartK = G.kartla(gK.kelimeler, 3).map(function (c) { return { start: Math.round((c.start + 0.07) * 1000) / 1000, end: Math.round((c.end + 0.6) * 1000) / 1000, text: c.text, konusmaci: "A" }; });
for (var kk = 0; kk + 1 < kartK.length; kk++) if (kartK[kk].end > kartK[kk + 1].start) kartK[kk].end = kartK[kk + 1].start;
var gercekK = G.kartla(gK.kelimeler, 3);
var rK = S.hizala(kartK, aK, { kaymaUygula: false });
var girisH = ort(rK.kartlar.map(function (c, i) { return Math.abs(c.start + 0.02 - gercekK[i].start) * 1000; }));
ok("kelimesiz kart: giriş konuşma başına yaslanır (−20 ms ön pay; ortalama < 20 ms, önce 70 ms)", girisH < 20, girisH.toFixed(1));
ok("kelimesiz kart: çıkış sessizlikte asılı kalmaz (son konuşma + kuyruğu geçmez, önce +600 ms)", rK.kartlar.every(function (c, i) {
  return c.end <= gercekK[i].end + 0.15 + 0.03 || (i + 1 < rK.kartlar.length && c.end <= rK.kartlar[i + 1].start + 1e-9 && c.end <= gercekK[i].end + 0.15 + 0.03);
}), J(rK.kartlar.slice(0, 3).map(function (c, i) { return [c.end, gercekK[i].end]; })));
ok("kelimesiz kart: bilinmeyen alanlar (konusmaci) korunur, çakışma yok", rK.kartlar.every(function (c, i) { return c.konusmaci === "A" && (!i || c.start >= rK.kartlar[i - 1].end - 1e-9); }));

/* ---------------- 6) alan koruma, geçersiz zaman, sekans ekseni ---------------- */
var ozel = G.kartla(G.boz(g.kelimeler.slice(0, 12), 0.25, 0.02, 8), 4);
ozel[0].words[1].confidence = 0.77; ozel[0].renk = "#ff0"; ozel[1].words[0].p = 0.5;
ozel[2].words[2] = { start: NaN, end: NaN, text: "bozuk" };
var rO = S.hizala(ozel, a, {});
ok("kelime / kart alanları (confidence, p, renk) korunur", rO.kartlar[0].words[1].confidence === 0.77 && rO.kartlar[0].renk === "#ff0" && rO.kartlar[1].words[0].p === 0.5);
ok("geçersiz zamanlı kelime dokunulmadan kalır", isNaN(rO.kartlar[2].words[2].start) && rO.kartlar[2].words[2].text === "bozuk");
var T0 = 37.5;
var kaydirKart = G.kartla(G.boz(g.kelimeler, 0.25 + T0, 0.04, 5), 4);
var rT = S.hizala(kaydirKart, a, { t0: T0 });
var hTT = hatalar(duz(rT.kartlar).map(function (w) { return { start: w.start - T0, end: w.end - T0 }; }), g.kelimeler);
ok("sekans ekseni: analiz klibin başından (t0 = 37.5 sn), kelimeler sekans zamanında düzelir", hTT.bas < 20 && hTT.son < 20 && rT.rapor.kayma.uygulandi, hTT.bas.toFixed(1));
var aT = Z.analizEt(g.pcm, { t0: T0 });
var rT2 = S.hizala(kaydirKart, aT, {});
ok("analiz.t0 de okunur (opts.t0 verilmezse)", J(rT2.kartlar) === J(rT.kartlar));
var rKap = S.hizala(kartlar, a, { kaymaUygula: false });
ok("kaymaUygula: false → toplam kayma önerilir ama uygulanmaz", !rKap.rapor.kayma.uygulandi && Math.abs(rKap.rapor.kayma.ms + 250) <= 25);

/* ---------------- 7) kare yuvarlama ---------------- */
var hizlar = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
var kh = S.kareHizi(23.976), kh2 = S.kareHizi(29.97), kh3 = S.kareHizi(59.94), kh4 = S.kareHizi(25);
ok("kareHizi: 23.976 → 24000/1001, 29.97 → 30000/1001 (drop-frame olabilir), 59.94 → 60000/1001, 25 tam", kh.pay === 24000 && kh.payda === 1001 && !kh.dropFrameOlur &&
  kh2.pay === 30000 && kh2.payda === 1001 && kh2.dropFrameOlur && kh3.pay === 60000 && kh3.dropFrameOlur && kh4.pay === 25 && kh4.payda === 1 && !kh4.ntsc);
var yuvSorun = [];
hizlar.forEach(function (f) {
  var k = S.kareHizi(f), kare = k.payda / k.pay;
  [0, 0.0004, 1.2345, 12.5, 61.019, 3599.987].forEach(function (t) {
    var y = S.kareyeYuvarla(t, f), n = y / kare;
    if (Math.abs(n - Math.round(n)) > 1e-6 || Math.abs(y - t) > kare / 2 + 1e-9) yuvSorun.push(f + "@" + t + "→" + y);
    var asg = S.kareyeYuvarla(t, f, "asagi"), yuk = S.kareyeYuvarla(t, f, "yukari");
    if (!(asg <= t + 1e-6 && yuk >= t - 1e-6 && yuk - asg <= kare + 1e-9)) yuvSorun.push("yön " + f + "@" + t);
  });
});
ok("kareyeYuvarla: 8 hızda en yakın kare (≤ yarım kare), aşağı / yukarı yönleri", yuvSorun.length === 0, yuvSorun.join(" | "));
ok("23.976'da 1001/24000 sn kare: 1 sn → 24. kare (1.001 sn)", S.kareNo(1, 23.976) === 24 && Math.abs(S.kareyeYuvarla(1, 23.976) - 1.001) < 1e-9);
ok("zamanKodu 29.97 DF: 1800. kare 00:00:59;28 sonrası 00:01:00;02 (iki numara atlanır)", S.zamanKodu(S.kareZamani(1799, 29.97), 29.97, { dropFrame: true }) === "00:00:59;29" &&
  S.zamanKodu(S.kareZamani(1800, 29.97), 29.97, { dropFrame: true }) === "00:01:00;02", S.zamanKodu(S.kareZamani(1800, 29.97), 29.97, { dropFrame: true }));
ok("zamanKodu 29.97 DF: 10. dakika atlamaz (17982 → 00:10:00;00); NDF 1800 → 00:01:00:00", S.zamanKodu(S.kareZamani(17982, 29.97), 29.97, { dropFrame: true }) === "00:10:00;00" &&
  S.zamanKodu(S.kareZamani(1800, 29.97), 29.97) === "00:01:00:00");
ok("zamanKodu 59.94 DF: 3600 → 00:01:00;04; 25 fps'te dropFrame yok sayılır (90.5 sn → 00:01:30:13)", S.zamanKodu(S.kareZamani(3600, 59.94), 59.94, { dropFrame: true }) === "00:01:00;04" &&
  S.zamanKodu(90.5, 25, { dropFrame: true }) === "00:01:30:13", S.zamanKodu(S.kareZamani(3600, 59.94), 59.94, { dropFrame: true }));
ok("drop-frame yalnız gösterimdir: iç zaman gerçek saniye; 10 dk'da DF duvar saatini tutar, NDF geride kalır", S.kareNo(600, 29.97) === 17982 &&
  S.zamanKodu(600, 29.97, { dropFrame: true }) === "00:10:00;00" && S.zamanKodu(600, 29.97) === "00:09:59:12" && S.kareyeYuvarla(600, 29.97) === S.kareyeYuvarla(600, 29.97, "yakin"),
  S.zamanKodu(600, 29.97, { dropFrame: true }) + " " + S.zamanKodu(600, 29.97));
var fpsSorun = [];
hizlar.forEach(function (f) {
  var rf = S.hizala(kartlar, a, { fps: f });
  var k = S.kareHizi(f), kare = k.payda / k.pay;
  rf.kartlar.forEach(function (c, i) {
    [c.start, c.end].forEach(function (t) { var n = t / kare; if (Math.abs(n - Math.round(n)) > 1e-6) fpsSorun.push(f + " ızgara dışı " + t); });
    if (c.end - c.start < kare - 1e-6) fpsSorun.push(f + " kısa " + i);
    if (i && c.start < rf.kartlar[i - 1].end - 1e-9) fpsSorun.push(f + " çakışma " + i);
    c.words.forEach(function (w) { if (w.start < c.start - 1e-9 || w.end > c.end + 1e-9) fpsSorun.push(f + " kelime dışarıda " + i); });
  });
});
ok("hizala({ fps }): 8 hızda kart sınırları kare ızgarasında, ≥ 1 kare, çakışmasız, kelimeler içinde", fpsSorun.length === 0, fpsSorun.slice(0, 4).join(" | "));

/* ---------------- 8) ayarlar ---------------- */
var rP = S.hizala(kartlar, a, { onPayMs: 0, kuyrukMs: 0 });
ok("onPayMs 0 / kuyrukMs 0: kart = ilk kelime başı .. son kelime sonu", rP.kartlar.every(function (c) { return Math.abs(c.start - c.words[0].start) < 0.0015 && Math.abs(c.end - c.words[c.words.length - 1].end) < 0.0015; }));
ok("onPayMs 40'ın üstü 40'a kırpılır", S.hizala(kartlar, a, { onPayMs: 500 }).kartlar.every(function (c, i) { return c.words[0].start - c.start <= 0.0405; }));
var rW = S.kelimeleriYasla([{ start: 1, end: 1.01 }, { start: 1.005, end: 1.3 }], a, { minKelimeMs: 60 });
ok("kelimeleriYasla: en kısa süre ve çakışmazlık doğrudan çağrıda da", cakismaYok(rW.kelimeler, 0.06) === "", J(rW.kelimeler));

/* ---------------- 8b) bulanık girdi ---------------- */
var rf = G.rastgele(77), fuzzSorun = [];
for (var fz = 0; fz < 60; fz++) {
  var kel = [], tt = rf() * 2;
  var nk = 1 + Math.floor(rf() * 25);
  for (var q = 0; q < nk; q++) {
    var s0 = tt + (rf() - 0.3) * 0.3, e0 = s0 + (rf() < 0.1 ? 0 : rf() * 0.5);
    if (rf() < 0.05) { s0 = NaN; }
    kel.push({ start: s0, end: e0, text: "w" + q });
    tt += rf() * 0.5;
  }
  var kartF = G.kartla(kel.filter(function (w) { return isFinite(w.start); }).length ? kel : [{ start: 1, end: 2, text: "x" }], 1 + Math.floor(rf() * 5));
  kartF.forEach(function (c) { if (!isFinite(c.start)) c.start = 0; if (!isFinite(c.end) || c.end < c.start) c.end = c.start + 1; });
  try {
    var rr2 = S.hizala(kartF, a, { fps: rf() < 0.5 ? 25 : 0 });
    var gecerliK = duz(rr2.kartlar).filter(function (w) { return isFinite(w.start); });
    var hata2 = "";
    for (var q2 = 1; q2 < gecerliK.length; q2++) if (rr2.rapor.atlandi === null && gecerliK[q2].start < gecerliK[q2 - 1].end - 1e-6) hata2 = "çakışma";
    if (rr2.kartlar.length !== kartF.length) hata2 = "kart sayısı";
    if (hata2) fuzzSorun.push(fz + " " + hata2);
  } catch (e) { fuzzSorun.push(fz + " " + e.message); }
}
ok("bulanık girdi (çakışan / sıfır süreli / NaN / sırasız kelimeler, 60 deneme): hata yok, düzeltilende çakışma yok", fuzzSorun.length === 0, fuzzSorun.slice(0, 3).join(" | "));

/* ---------------- 9) 1 saatlik başarım ---------------- */
// 1 saatlik sentetik zarf: 60 sn'lik sentetik sesin dB / akı dizisi 60 kez yan yana (PCM üretmeden) → özet + hizalama
var g60 = G.uret({ tohum: 31, kelime: 150, sureSn: 60 });
var a60 = Z.analizEt(g60.pcm.subarray(0, 60 * 16000));
var db = new Float32Array(a60.n * 60), aki = new Float32Array(a60.n * 60);
for (var m = 0; m < 60; m++) { db.set(a60.db, m * a60.n); aki.set(a60.aki, m * a60.n); }
var t1 = Date.now();
var aSaat = Z._ozetle(db, aki, {});
var tOzet = Date.now() - t1;
var kelSaat = [];
for (m = 0; m < 60; m++) g60.kelimeler.forEach(function (w) { if (w.end < 59.4) kelSaat.push({ start: w.start + m * 60, end: w.end + m * 60, text: w.text }); });
var kSaat = G.kartla(G.boz(kelSaat, 0.25, 0.04, 9), 4);
t1 = Date.now();
var rSaat = S.hizala(kSaat, aSaat, {});
var tHiz = Date.now() - t1;
var hSaat = hatalar(duz(rSaat.kartlar), kelSaat);
ok("1 saat (360 000 pencere, " + kelSaat.length + " kelime): özet + hizalama < 4 sn, kayma bulunur, hata < 20 ms", tOzet + tHiz < 4000 && rSaat.rapor.kayma.uygulandi && hSaat.bas < 20 && hSaat.son < 20,
  "özet " + tOzet + " ms, hizalama " + tHiz + " ms, hata " + hSaat.bas.toFixed(1) + "/" + hSaat.son.toFixed(1));

/* ---------------- 10) paket / yükleme ---------------- */
var KOK = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
var vr = fs.readFileSync(path.join(KOK, "tools", "verify-release.ps1"), "utf8");
ok("index.html ses-zarf.js ve senkron.js'yi yükler (captions.js'den önce)", html.indexOf('src="js/ses-zarf.js"') !== -1 && html.indexOf('src="js/senkron.js"') !== -1 &&
  html.indexOf('src="js/senkron.js"') < html.indexOf('src="js/captions.js"'));
ok("verify-release.ps1 iki modülü zorunlu tutar", /js\/ses-zarf\\\.js\$/.test(vr) && /js\/senkron\\\.js\$/.test(vr));
var kaynak = fs.readFileSync(path.join(KOK, "js", "senkron.js"), "utf8") + fs.readFileSync(path.join(KOK, "js", "ses-zarf.js"), "utf8");
var ayikla = require("./_ayikla.js");
ok("ES5 (CEF 74): let/const/ok işlevi/şablon dizgesi/for-of yok", !/\b(let|const)\s|=>|`|\bfor\s*\([^)]*\bof\b/.test(ayikla(kaynak)));
ok("ücretsiz: Pro'ya sormaz, ağa çıkmaz", !/\bPro\.|\bhttp|fetch\(|XMLHttpRequest/.test(ayikla(kaynak)));

console.log("\n" + gecen + "/" + toplam + " geçti");
if (gecen !== toplam) process.exit(1);
