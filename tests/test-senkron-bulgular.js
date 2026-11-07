// Suflo testi: senkron doğrulama — doğrulama turunda bulunan hataların gerileme testleri
//  1) müzik yatağı altında sürtünmeli ünsüzle (s / f / h / th) başlayan doğru kelimeler ünlüye (50–130 ms geç) çekilmez
//     (js/ses-zarf.js yüksek bant kenar genişletmesi, analiz biçimi v2)
//  2) giderek büyüyen kayma (transkript saati %0,1 hızlı, 300+ sn): düzeltilir ya da "kayma" diye atlanır; asla "N kelime
//     sese oturtuldu" denip 200 ms'den büyük hata bırakılmaz; düzensiz sıçramada dokunulmaz
//  3) rapor satırı önce → sonra "iyileşme" çifti göstermez (yaslamanın kendi hedefi), ortanca değişim gösterir
//  4) zamanKodu drop-frame gün sınırı (2 589 408 / 5 178 816 kare), NDF de 24 saatte başa döner
//  5) kısmi atlama: bazı klipler doğrulanamadıysa rapor söyler, ton uyarı; toplu işte kayma ipucu klip başına
//  6) İngilizce tekil sayı ("1 word", "1 card")
//  7) ses dalgası şeridi: birleşen sınırda sürükleme takılmaz (belgede bırakma, düğmesiz hareket), klavye odağı
//     birleşen tutamağa geçer, üst üste binen tutamaklarda yön seçer, Sekme sırası zaman sırası, ipucu okunur
//  8) captions.js: go() sırası, AE uyarısı, kapsamayan klip uyarısı, yinele raporu, önbellek / analiz ekseni, kelimesiz
//     kartın önbellek zamanı, zamanda örtüşen toplu klipler, README
var fs = require("fs");
var path = require("path");
var KOK = path.join(__dirname, "..");
var Z = require(path.join(KOK, "js", "ses-zarf.js"));
var S = require(path.join(KOK, "js", "senkron.js"));
var U = require(path.join(KOK, "js", "senkron-ui.js"));
var G = require("./_senkron-sentetik.js");
var I18N = require(path.join(KOK, "js", "i18n.js"));
I18N.setDictionary(require(path.join(KOK, "i18n", "en.js")));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
function ort(d) { return d.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, d.length); }
function duz(kartlar) { var o = []; kartlar.forEach(function (c) { (c.words || []).forEach(function (w) { o.push(w); }); }); return o; }
function yalin(kel) { return kel.map(function (w) { return { start: w.start, end: w.end, text: w.text }; }); }

/* ---------------- 1) müzik yatağı altında sürtünmeli ünsüz ---------------- */
(function () {
  var sonuc = { yatak: { top: 0, n: 0, gec: 0, en: 0 }, sade: { top: 0, n: 0, gec: 0, en: 0 } }, kontrast = [];
  for (var t = 1; t <= 6; t++) {
    [["sade", undefined], ["yatak", -20]].forEach(function (p) {
      var g = G.uretSurtunmeli({ tohum: t, kelime: 40, yatakDb: p[1], fricDb: -26 });
      var a = Z.analizEt(g.pcm);
      if (p[1] !== undefined) kontrast.push(a.kontrast);
      var r = S.hizala(G.kartla(yalin(g.kelimeler), 4), a, {});
      var s = sonuc[p[0]];
      if (r.rapor.atlandi) s.atlandi = r.rapor.atlandi;
      duz(r.kartlar).forEach(function (w, i) {
        var d = (w.start - g.kelimeler[i].start) * 1000;
        s.top += Math.abs(d); s.n++; if (d > 40) s.gec++; s.en = Math.max(s.en, d);
      });
    });
  }
  var y = sonuc.yatak, sd = sonuc.sade;
  ok("müzik yatağı (konuşmadan ≈ 20 dB alçak, kontrast 18–25 dB): sese bakılır, atlanmaz", !y.atlandi && kontrast.every(function (k) { return k > 15 && k < 30; }), J(kontrast.map(Math.round)));
  ok("müzik yatağı altında sürtünmeli ünsüzle başlayan doğru kelimeler: hiçbiri 40 ms'den fazla geç kaymaz", y.gec === 0, y.gec + "/" + y.n + ", en çok +" + Math.round(y.en) + " ms");
  ok("müzik yatağı altında ortalama baş hatası müziksiz duruma yakın (≤ +6 ms fark)", y.top / y.n <= sd.top / sd.n + 6, (sd.top / sd.n).toFixed(1) + " → " + (y.top / y.n).toFixed(1) + " ms");
  // analiz: konuşma bölümü sürtünmenin başında açılır (ünlüde değil)
  var g1 = G.uretSurtunmeli({ tohum: 3, kelime: 20, yatakDb: -20 }), a1 = Z.analizEt(g1.pcm);
  var basH = g1.kelimeler.map(function (w) { var yb = Z.enYakin(a1.bolumler.map(function (b) { return { t: b.bas }; }), w.start); return yb ? Math.round(yb.d * 1000) : 999; });
  ok("ses-zarf: yatak altındaki sürtünmeli kelimenin konuşma bölümü sürtünmede başlar (≤ 15 ms)", basH.every(function (d) { return d <= 15; }), J(basH));
  ok("ses-zarf: analiz biçimi v2 (önbellek yeniden kurulur), yüksek bant dizisi analizde", Z.SURUM >= 2 && a1.surum === Z.SURUM && a1.yb && a1.yb.length === a1.n &&
    Z.anahtar("/a.mp4", 0, 1, null).length > 0);
})();

/* ---------------- 2) giderek büyüyen kayma ---------------- */
(function () {
  var g = G.uret({ tohum: 41, kelime: 700 });
  var a = Z.analizEt(g.pcm);
  ok("hazırlık: 300 sn'den uzun ses", g.sure >= 300, g.sure.toFixed(0));
  function dene(oran, sicra) {
    var boz = G.boz(g.kelimeler, 0, 0.012, 3).map(function (w, i) {
      var d = sicra && i > 350 ? 0.3 : 0;
      return { start: Math.round((w.start * oran + d) * 1000) / 1000, end: Math.round((w.end * oran + d) * 1000) / 1000, text: w.text };
    });
    var r = S.hizala(G.kartla(boz, 4), a, {});
    var ws = duz(r.kartlar), hata = ort(ws.map(function (w, i) { return Math.abs(w.start - g.kelimeler[i].start) * 1000; }));
    var once = ort(boz.map(function (w, i) { return Math.abs(w.start - g.kelimeler[i].start) * 1000; }));
    var kotu = ws.filter(function (w, i) { return Math.abs(w.start - g.kelimeler[i].start) > 0.2; }).length;
    return { r: r, hata: hata, once: once, kotu: kotu, metin: U.raporMetni(U.hepsiniYasla(G.kartla(boz, 4), [U.kaynak(a, 0, 1)], { belge: 1 }).rapor) };
  }
  [1.001, 0.999].forEach(function (oran) {
    var d = dene(oran);
    var basarili = d.hata < 30 || d.r.rapor.atlandi === "kayma";
    ok("transkript saati ×" + oran + " (300 sn'de ±300 ms): düzeltilir (ortalama < 30 ms) ya da 'kayma' diye atlanır", basarili && d.once > 100,
      d.once.toFixed(0) + " → " + d.hata.toFixed(1) + " ms, " + J(d.r.rapor.kayma) + " " + d.r.rapor.atlandi);
    ok("×" + oran + ": 200 ms'den büyük hata kalırken 'sese oturtuldu' denmez", !(d.kotu > 0 && /sese oturtuldu/.test(d.metin.metin)) && (d.kotu === 0 || d.metin.ton === "uyari"),
      d.kotu + " kelime > 200 ms · " + d.metin.metin);
    ok("×" + oran + ": rapor eğimi (ppm) ve kaymayı ayrıntıda söyler", d.r.rapor.kayma.uygulandi && Math.abs(d.r.rapor.kayma.egim - (1 / oran - 1) * 1e6) < 150 &&
      /giderek kayıyordu/.test(d.metin.ayrinti) && I18N.translate(d.metin.ayrinti).indexOf("drifting") !== -1, J(d.r.rapor.kayma) + " " + d.metin.ayrinti);
  });
  var dz = dene(1.0);
  ok("sabit hızlı doğru transkript: kayma uygulanmaz, hata artmaz", !dz.r.rapor.kayma.uygulandi && dz.hata <= dz.once + 1 && dz.r.rapor.atlandi === null, dz.once.toFixed(1) + " → " + dz.hata.toFixed(1));
  var ds = dene(1.0, true);
  ok("ortada 300 ms sıçrayan transkript (doğruya oturmaz): dokunulmaz, 'kayma' nedeniyle uyarı", ds.r.rapor.atlandi === "kayma" && ds.metin.ton === "uyari" &&
    ds.metin.metin === U.ATLANDI.kayma && J(ds.r.kartlar.map(function (c) { return c.start; })) !== "" && ds.r.rapor.eminDegil.every(function (e) { return e.neden === "kayma"; }) &&
    I18N.translate(U.ATLANDI.kayma) !== U.ATLANDI.kayma, ds.r.rapor.atlandi + " " + ds.metin.metin);
})();

/* ---------------- 3) rapor ölçüsü ---------------- */
(function () {
  var g = G.uret({ tohum: 7, kelime: 60 }), a = Z.analizEt(g.pcm);
  var kartlar = G.kartla(G.boz(g.kelimeler, 0.25, 0.04, 5), 4);
  var r = S.hizala(kartlar, a, {});
  var es = duz(kartlar), ys = duz(r.kartlar), d = [];
  es.forEach(function (w, i) { if (Math.abs(ys[i].start - w.start) > 0.005 || Math.abs(ys[i].end - w.end) > 0.005) d.push(Math.abs(ys[i].start - w.start) * 1000); });
  d.sort(function (x, y) { return x - y; });
  var med = d.length % 2 ? d[d.length >> 1] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2;
  ok("rapor.degisimOrtancaMs: değişen kelimelerin başı ne kadar oynadı (ortanca, ms)", Math.abs(r.rapor.degisimOrtancaMs - med) <= 1 && r.rapor.degisimOrtancaMs > 150, r.rapor.degisimOrtancaMs + " ~ " + med.toFixed(1));
  var m = U.raporMetni(U.hepsiniYasla(kartlar, [U.kaynak(a, 0, 1)], { belge: 1 }).rapor);
  ok("rapor satırı önce → sonra çifti göstermez, 'ortanca değişim' gösterir", m.metin.indexOf("→") === -1 && /ortanca değişim \d+ ms/.test(m.metin) && !/ortalama sapma/.test(m.metin), m.metin);
  ok("düzeltme yoksa yalnız 'Zamanlar sesle uyumlu ✓' (sapma sayısı yok)", U.raporMetni({ duzeltilen: 0, ortalamaSonraMs: 6, eminDegil: [], kelimeli: true }).metin === "Zamanlar sesle uyumlu ✓");
  // zararlı düzeltme senaryosu: ölçü yine de "iyileşme" olarak sunulmaz
  var kotu = U.raporMetni({ duzeltilen: 30, degisimOrtancaMs: 95, ortalamaOnceMs: 90, ortalamaSonraMs: 3, eminDegil: [], kelimeli: true });
  ok("ölçü yaslamanın hedefine uzaklık olsa da (90 → 3) satırda gösterilmez", kotu.metin === "30 kelime sese oturtuldu · ortanca değişim 95 ms", kotu.metin);
  ok("İngilizce: ortanca değişim", I18N.translate(kotu.metin) === "30 words snapped to the audio · median change 95 ms", I18N.translate(kotu.metin));
})();

/* ---------------- 4) zamanKodu gün sınırı ---------------- */
(function () {
  var tc = function (n, f) { return S.zamanKodu(S.kareZamani(n, f), f, { dropFrame: true }); };
  ok("29,97 DF: 2 589 407 → 23:59:59;29, 2 589 408 → 00:00:00;00, 2 589 410 → 00:00:00;02", tc(2589407, 29.97) === "23:59:59;29" && tc(2589408, 29.97) === "00:00:00;00" &&
    tc(2589410, 29.97) === "00:00:00;02", [tc(2589407, 29.97), tc(2589408, 29.97), tc(2589410, 29.97)].join(" "));
  ok("29,97 DF: gün sınırından sonra kare sayımı kaymaz (2 589 408 + 1800 → 00:01:00;02)", tc(2589408 + 1800, 29.97) === "00:01:00;02", tc(2589408 + 1800, 29.97));
  ok("59,94 DF: 5 178 815 → 23:59:59;59, 5 178 816 → 00:00:00;00", tc(5178815, 59.94) === "23:59:59;59" && tc(5178816, 59.94) === "00:00:00;00", tc(5178815, 59.94) + " " + tc(5178816, 59.94));
  ok("NDF de 24 saatte başa döner: 86 401 sn (25 fps) → 00:00:01:00, 23:59:59 aynen", S.zamanKodu(86401, 25) === "00:00:01:00" && S.zamanKodu(86399, 25) === "23:59:59:00",
    S.zamanKodu(86401, 25) + " " + S.zamanKodu(86399, 25));
})();

/* ---------------- 5) kısmi atlama ---------------- */
(function () {
  var g = G.uret({ tohum: 7, kelime: 40 }), a = Z.analizEt(g.pcm);
  var gG = G.uret({ tohum: 5, kelime: 40, gurultuDb: -14 }), aG = Z.analizEt(gG.pcm);
  function kaydir(k, d) { return k.map(function (c) { return { start: c.start + d, end: c.end + d, text: c.text, words: c.words.map(function (w) { return { start: w.start + d, end: w.end + d, text: w.text }; }) }; }); }
  var k1 = kaydir(G.kartla(G.boz(g.kelimeler, -0.117, 0.02, 5), 4), 10);
  var k2 = kaydir(G.kartla(G.boz(gG.kelimeler, 0.2, 0.02, 6), 4), 100);
  var r = U.hepsiniYasla(k1.concat(k2), [U.kaynak(a, 10, 1), U.kaynak(aG, 100, 1)], { belge: 1 });
  var m = U.raporMetni(r.rapor);
  ok("bir klip gürültülü: rapor kısmi atlamayı taşır, satır söyler, ton uyarı", J(r.rapor.kismiAtlandi) === J(["dusukKontrast"]) && r.rapor.atlandi === null &&
    /· 1 klip doğrulanamadı: ses gürültülü ya da müzikli$/.test(m.metin) && m.ton === "uyari", m.metin + " / " + m.ton);
  ok("iki kaynakta kayma ipucu klip başına ('1 klipte en çok …'), 'Tüm altyazıda' denmez", r.rapor.kaymaKaynak === 1 && /^1 klipte en çok [+−]\d+ ms toplam kayma düzeltildi\.$/.test(m.ayrinti), m.ayrinti);
  var tek = U.raporMetni(U.hepsiniYasla(k1, [U.kaynak(a, 10, 1)], { belge: 1 }).rapor);
  ok("tek kaynakta eski ipucu ('Tüm altyazıda …') ve iyi ton", /^Tüm altyazıda /.test(tek.ayrinti) && tek.ton === "iyi", tek.ayrinti + " " + tek.ton);
  var ek = U.raporMetni({ duzeltilen: 12, degisimOrtancaMs: 40, eminDegil: [], kelimeli: true, kaynak: 1, ekAtlama: ["hiz"] });
  ok("sese bakılmadan atlanan toplu klip (hız değişmiş) de satırda ve uyarı tonunda", ek.metin === "12 kelime sese oturtuldu · ortanca değişim 40 ms · 1 klip doğrulanamadı: klibin hızı değiştirilmiş" && ek.ton === "uyari", ek.metin);
  var iki = U.raporMetni({ duzeltilen: 3, degisimOrtancaMs: 40, eminDegil: [], kelimeli: false, kismiAtlandi: ["uyumsuz"], ekAtlama: ["ters"] });
  ok("farklı nedenlerle 2 klip: 'farklı nedenler'; İngilizce çoğul / tekil", /2 klip doğrulanamadı: farklı nedenler$/.test(iki.metin) &&
    I18N.translate(iki.metin) === "3 cards snapped to the audio · median change 40 ms · 2 clips couldn't be checked: various reasons" &&
    I18N.translate(ek.metin) === "12 words snapped to the audio · median change 40 ms · 1 clip couldn't be checked: clip speed changed" &&
    I18N.translate(m.ayrinti).indexOf("in 1 clip") !== -1, I18N.translate(iki.metin) + " | " + I18N.translate(m.ayrinti));
  var hepsi = U.hepsiniYasla(k2, [U.kaynak(aG, 100, 1)], { belge: 1 });
  ok("bütün kaynaklar atlandıysa eskisi gibi tek neden (kısmi değil)", hepsi.rapor.atlandi === "dusukKontrast" && (hepsi.rapor.kismiAtlandi || []).length === 0);
})();

/* ---------------- 6) İngilizce tekil ---------------- */
ok("İngilizce: 1 word / 1 card (11, 21 çoğul kalır)", I18N.translate("1 kelime sese oturtuldu · ortanca değişim 85 ms · 1 kelime emin değil") === "1 word snapped to the audio · median change 85 ms · 1 word uncertain" &&
  I18N.translate("1 kart sese oturtuldu · ortanca değişim 5 ms · 1 kart emin değil") === "1 card snapped to the audio · median change 5 ms · 1 card uncertain" &&
  I18N.translate("11 kelime sese oturtuldu · ortanca değişim 5 ms · 21 kart emin değil") === "11 words snapped to the audio · median change 5 ms · 21 cards uncertain");

/* ---------------- 7) ses dalgası şeridi (sahte DOM) ---------------- */
var belgeSahte = { activeElement: null, dinle: {}, defaultView: { devicePixelRatio: 1, getComputedStyle: function () { return { getPropertyValue: function () { return ""; } }; } } };
belgeSahte.addEventListener = function (t, f) { (belgeSahte.dinle[t] = belgeSahte.dinle[t] || []).push(f); };
belgeSahte.yay = function (t, e) { e = e || {}; e.type = t; (belgeSahte.dinle[t] || []).forEach(function (f) { f(e); }); return e; };
function dugum(etiket, id) {
  var d = { tagName: String(etiket).toUpperCase(), id: id || "", hidden: false, disabled: false, textContent: "", title: "", className: "", attrs: {}, dinle: {},
    style: {}, childNodes: [], parentNode: null, odak: 0, clientWidth: 0, clientHeight: 0, yakalama: null };
  d.children = d.childNodes;
  d.setAttribute = function (k, v) { d.attrs[k] = String(v); };
  d.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(d.attrs, k) ? d.attrs[k] : null; };
  d.addEventListener = function (t, f) { (d.dinle[t] = d.dinle[t] || []).push(f); };
  d.yay = function (t, e) {
    e = e || {}; e.type = t; e.target = d; e.preventDefault = e.preventDefault || function () { e.engellendi = true; };
    (d.dinle[t] || []).forEach(function (f) { f(e); });
    return e;
  };
  d.appendChild = function (c) { if (c.parentNode) c.parentNode.removeChild(c); d.childNodes.push(c); c.parentNode = d; return c; };
  d.insertBefore = function (c, ref) { if (c.parentNode) c.parentNode.removeChild(c); var i = d.childNodes.indexOf(ref); d.childNodes.splice(i < 0 ? d.childNodes.length : i, 0, c); c.parentNode = d; return c; };
  d.removeChild = function (c) { d.childNodes.splice(d.childNodes.indexOf(c), 1); c.parentNode = null; return c; };
  d.focus = function () { d.odak++; belgeSahte.activeElement = d; };
  d.click = function () { if (!d.disabled) d.yay("click"); };
  d.setPointerCapture = function (p) { d.yakalama = p; };
  d.releasePointerCapture = function () { d.yakalama = null; };
  d.getBoundingClientRect = function () { return { left: 20, top: 0, width: d.clientWidth }; };
  d.classList = {
    contains: function (c) { return (" " + d.className + " ").indexOf(" " + c + " ") !== -1; },
    add: function (c) { if (!d.classList.contains(c)) d.className = (d.className + " " + c).trim(); },
    remove: function (c) { d.className = (" " + d.className + " ").replace(" " + c + " ", " ").trim(); }
  };
  return d;
}
var SDOM = {};
["cap-dalga", "cap-dalga-tutamaklar", "cap-dalga-alan", "cap-dalga-baslik", "cap-dalga-bos", "cap-dalga-analiz", "cap-dalga-dinle", "cap-dalga-yasla", "cap-dalga-geri", "cap-dalga-ipucu"].forEach(function (id) {
  SDOM[id] = dugum(/dinle|yasla|geri|analiz/.test(id) ? "button" : "div", id);
});
SDOM["cap-dalga-tuval"] = dugum("canvas", "cap-dalga-tuval");
SDOM["cap-dalga-tuval"].getContext = function () {
  var c = {};
  ["setTransform", "clearRect", "fillRect", "fillText"].forEach(function (f) { c[f] = function () {}; });
  c.measureText = function (t) { return { width: String(t).length * 6 }; };
  return c;
};
belgeSahte.getElementById = function (id) { return SDOM[id] || null; };
belgeSahte.createElement = function (t) { return dugum(t); };
var gS = G.uret({ tohum: 7, kelime: 20 }), aS = Z.analizEt(gS.pcm);
var segsS, degisim = [];
var seritKay = { analiz: aS, t0: 0, bas: 0, son: aS.sure, belge: 1 };
var serit = U.serit({
  belge: belgeSahte, segments: function () { return segsS; }, secili: function () { return 1; }, kaynak: function () { return seritKay; },
  fps: function () { return 25; }, ae: function () { return false; },
  degistir: function (ci, seg, b) { degisim.push({ ci: ci, b: b, seg: seg }); segsS[ci] = seg; },
  dinle: function () {}, hepsiniYasla: function () {}, geriAl: function () {}, geriAlVar: function () { return false; }, analizEt: function () {},
  analizSuruyor: function () { return false; }, tusTut: function () {}
});
function kur(seg, gen) {
  segsS = [{ start: 0.2, end: 0.5, text: "a" }, JSON.parse(J(seg)), { start: 3.5, end: 3.9, text: "z" }];
  SDOM["cap-dalga-alan"].clientWidth = gen || 300; SDOM["cap-dalga-alan"].clientHeight = 64;
  degisim.length = 0;
  serit.ciz();
}
var tutK = SDOM["cap-dalga-tutamaklar"];
function tm(id) { return serit._tutamaklar[id]; }
function xOf(t) { var d = serit._durum; return (t - d.bas) / (d.son - d.bas) * d.gen + 20; }
function idler() { return tutK.childNodes.map(function (d) { return d.getAttribute("data-sinir"); }); }
function siraIdler() { return serit._durum.sinir.map(function (s) { return s.id; }); }

// 7a) sürükleme birleşen sınırda: tutamak sökülür, bırakma tutamağın dışında
kur({ start: 0.98, end: 2.15, text: "x y z", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.4, end: 1.7, text: "y" }, { start: 1.7, end: 2.0, text: "z" }] });
var s0 = tm("s0");
s0.yay("pointerdown", { button: 0, pointerId: 1, clientX: xOf(1.3), buttons: 1 });
s0.yay("pointermove", { pointerId: 1, clientX: xOf(1.36), buttons: 1 });
s0.yay("pointermove", { pointerId: 1, clientX: xOf(1.46), buttons: 1 });   // sonraki kelimenin başına (1,40) değer: s0 + b1 → o0
var birlesti = !tm("s0") && !!tm("o0");
// tutamakta değil boş alanda bırakıldı: yalnız belge dinleyicisi görür
belgeSahte.yay("pointerup", { pointerId: 1, buttons: 0 });
var nBitti = degisim.filter(function (x) { return x.b.bitti; }).length;
var nOnce = degisim.length, segOnce = J(segsS[1]);
tm("o1").yay("pointermove", { pointerId: 1, clientX: xOf(1.2), buttons: 0 });
tm("b0").yay("pointermove", { pointerId: 1, clientX: xOf(1.1), buttons: 0 });
ok("şerit: birleşen sınırda (s0 → o0) bırakma tutamak dışında da sürüklemeyi bitirir; son adım 'bitti'", birlesti && nBitti === 1, J(idler()) + " bitti " + nBitti);
ok("şerit: bıraktıktan sonra düğmesiz gezinme sınır oynatmaz, geri al adımı yazmaz", degisim.length === nOnce && J(segsS[1]) === segOnce, degisim.length - nOnce);
ok("şerit: takılı 'surukleniyor' sınıfı kalmaz", tutK.childNodes.filter(function (d) { return /surukleniyor/.test(d.className); }).length === 0);
// bırakma olayı tamamen kaçtı (pencere dışında bırakıldı): düğmesiz ilk hareket sürüklemeyi bitirir
kur({ start: 0.98, end: 2.15, text: "x y z", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.4, end: 1.7, text: "y" }, { start: 1.7, end: 2.0, text: "z" }] });
tm("s0").yay("pointerdown", { button: 0, pointerId: 1, clientX: xOf(1.3), buttons: 1 });
tm("s0").yay("pointermove", { pointerId: 1, clientX: xOf(1.33), buttons: 1 });
var n1 = degisim.length, sg1 = J(segsS[1]);
tm("s0").yay("pointermove", { pointerId: 1, clientX: xOf(1.2), buttons: 0 });
tm("s0").yay("pointermove", { pointerId: 1, clientX: xOf(1.1), buttons: 0 });
ok("şerit: bırakma kaçtıysa düğmesiz hareket sürüklemeyi bitirir (sınır yerinde, 'bitti' bildirilir)", degisim.length === n1 + 1 && degisim[n1].b.bitti === true && J(segsS[1]) === sg1,
  J(degisim.slice(n1).map(function (x) { return x.b; })));
// birleşmede sürükleme donmaz: yakalama aynı kenardaki tutamağa geçer, sola çekince ayrılır
kur({ start: 0.98, end: 2.15, text: "x y z", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.4, end: 1.7, text: "y" }, { start: 1.7, end: 2.0, text: "z" }] });
tm("s0").yay("pointerdown", { button: 0, pointerId: 3, clientX: xOf(1.3), buttons: 1 });
tm("s0").yay("pointermove", { pointerId: 3, clientX: xOf(1.5), buttons: 1 });
var yakalayan = tm("o0");
ok("şerit: birleşince işaretçi yakalaması ortak tutamağa (o0) geçer", !!yakalayan && yakalayan.yakalama === 3, yakalayan && yakalayan.yakalama);
yakalayan.yay("pointermove", { pointerId: 3, clientX: xOf(1.25), buttons: 1 });
ok("şerit: aynı sürüklemede sola çekince kelime sonu yeniden ayrılır (sonraki kelimenin başı yerinde)", Math.abs(segsS[1].words[0].end - 1.25) < 0.01 && segsS[1].words[1].start === 1.4,
  J(segsS[1].words.slice(0, 2)));
belgeSahte.yay("pointerup", { pointerId: 3 });

// 7b) klavye: birleşince odak ortak tutamağa
kur({ start: 0.98, end: 2.15, text: "x y", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.32, end: 1.7, text: "y" }] });
tm("s0").focus();
tm("s0").yay("keydown", { key: "ArrowRight" });
tm("s0").yay("keydown", { key: "ArrowRight" });   // 1,32: sonraki kelimenin başı → o0
ok("klavye: kelime sonu sonraki kelimenin başına değince odak ortak tutamağa (o0) geçer", !tm("s0") && belgeSahte.activeElement === tm("o0"), J(idler()));
belgeSahte.activeElement.yay("keydown", { key: "ArrowLeft" });
ok("klavye: sonraki ← ortak sınırı taşır (odak kaybolmadı)", Math.abs(segsS[1].words[0].end - 1.31) < 1e-9 && segsS[1].words[1].start === segsS[1].words[0].end, J(segsS[1].words));

// 7c) Sekme sırası zaman sırası
kur({ start: 0.98, end: 2.15, text: "x y", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.32, end: 1.7, text: "y" }] });
tm("s0").focus();
tm("s0").yay("keydown", { key: "ArrowRight" });
tm("s0").yay("keydown", { key: "ArrowRight" });
ok("Sekme sırası: yeni ortak tutamak (o0) kart çıkışından sonra değil zaman sırasında", J(idler()) === J(siraIdler()), J(idler()) + " ~ " + J(siraIdler()));
belgeSahte.activeElement.yay("keydown", { key: "ArrowLeft" });   // yeniden ayrılır: s0 ve b1 geri gelir
ok("Sekme sırası: ayrılınca da zaman sırası", J(idler()) === J(siraIdler()), J(idler()));

// 7d) dar şerit (206 px): üst üste binen tutamaklar
kur({ start: 0.98, end: 2.02, text: "x y z", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.4, end: 1.7, text: "y" }, { start: 1.7, end: 2.0, text: "z" }] }, 206);
var ust = tm("b0");   // DOM'da sonra gelen (üstte) öğe tıklamayı alır
ok("hazırlık: 206 px'te kart girişi ile ilk kelime başı 6,5 px'ten yakın", Math.abs(xOf(0.98) - xOf(1.0)) < 6.5, (xOf(1.0) - xOf(0.98)).toFixed(2));
ust.yay("pointerdown", { button: 0, pointerId: 5, clientX: xOf(0.99), buttons: 1 });
ust.yay("pointermove", { pointerId: 5, clientX: xOf(0.99) - 4, buttons: 1 });
belgeSahte.yay("pointerup", { pointerId: 5 });
ok("üst üste binen giriş / ilk kelime: dışa (sola) sürükleme kart girişini taşır, kelime yerinde", segsS[1].start < 0.97 && segsS[1].words[0].start === 1.0, J([segsS[1].start, segsS[1].words[0].start]));
kur({ start: 0.98, end: 2.02, text: "x y z", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.4, end: 1.7, text: "y" }, { start: 1.7, end: 2.0, text: "z" }] }, 206);
tm("b0").yay("pointerdown", { button: 0, pointerId: 5, clientX: xOf(0.99), buttons: 1 });
tm("b0").yay("pointermove", { pointerId: 5, clientX: xOf(0.99) + 4, buttons: 1 });
belgeSahte.yay("pointerup", { pointerId: 5 });
ok("üst üste binen giriş / ilk kelime: içe (sağa) sürükleme ilk kelimenin başını taşır", segsS[1].words[0].start > 1.01 && segsS[1].start === 0.98, J([segsS[1].start, segsS[1].words[0].start]));
kur({ start: 0.98, end: 2.02, text: "x y z", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.4, end: 1.7, text: "y" }, { start: 1.7, end: 2.0, text: "z" }] }, 206);
tm("ks").yay("pointerdown", { button: 0, pointerId: 6, clientX: xOf(2.01), buttons: 1 });
tm("ks").yay("pointermove", { pointerId: 6, clientX: xOf(2.01) - 4, buttons: 1 });
belgeSahte.yay("pointerup", { pointerId: 6 });
ok("üst üste binen son kelime sonu / kart çıkışı: içe (sola) sürükleme son kelimenin sonunu taşır", segsS[1].words[2].end < 1.99 && segsS[1].end === 2.02, J([segsS[1].words[2].end, segsS[1].end]));
kur({ start: 0.98, end: 2.02, text: "x y z", words: [{ start: 1.0, end: 1.3, text: "x" }, { start: 1.4, end: 1.7, text: "y" }, { start: 1.7, end: 2.0, text: "z" }] }, 206);
tm("ks").yay("pointerdown", { button: 0, pointerId: 6, clientX: xOf(2.01), buttons: 1 });
tm("ks").yay("pointermove", { pointerId: 6, clientX: xOf(2.01) + 4, buttons: 1 });
belgeSahte.yay("pointerup", { pointerId: 6 });
ok("üst üste binen son kelime sonu / kart çıkışı: dışa (sağa) sürükleme kart çıkışını taşır", segsS[1].end > 2.03 && segsS[1].words[2].end === 2.0, J([segsS[1].words[2].end, segsS[1].end]));
ok("tek sürüklemede tek anlık görüntü (ilk adım) ve 'bitti'", degisim.length >= 2 && degisim[0].b.ilk === true && degisim.slice(1).every(function (x) { return x.b.ilk === false; }) &&
  degisim[degisim.length - 1].b.bitti === true);

// 7e) ipucu: okunur kontrast ve ekran okuyucu bağlantısı
var css = fs.readFileSync(path.join(KOK, "css", "style.css"), "utf8"), html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
var ipucuCss = (/\.dalga-ipucu \{([^}]*)\}/.exec(css) || [])[1] || "";
ok("ipucu: var(--dim) (≈ 7,5:1), en az 10,5 px; tutamaklar aria-describedby ile ipucuna bağlı", /color: var\(--dim\)/.test(ipucuCss) && parseFloat((/font-size: ([\d.]+)px/.exec(ipucuCss) || [])[1]) >= 10.5 &&
  /<p id="cap-dalga-ipucu" class="dalga-ipucu">/.test(html) && tutK.childNodes.every(function (d) { return d.getAttribute("aria-describedby") === "cap-dalga-ipucu"; }), ipucuCss);

module.exports = { ok: ok, J: J, son: function () {
  console.log("\n" + gecen + "/" + toplam + " gecti");
  if (gecen !== toplam) process.exit(1);
} };
if (require.main === module) require("./_senkron-bulgular-captions.js")(module.exports).then(function () { module.exports.son(); }, function (e) {
  console.log("FAIL istisna " + (e && e.stack || e)); process.exit(1);
});
