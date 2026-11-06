/*
 * Suflo — Senkron doğrulama arayüzü (senkron doğrulama, adım 3)
 *
 * js/ses-zarf.js'in ses analizini ve js/senkron.js'in hizalamasını altyazı akışına bağlar. Saf işlevler (Node testleri
 * doğrudan çalıştırır) ve Caption Editor'daki ses dalgası şeridinin ince DOM bağlayıcısı:
 *
 *   kaynak(analiz, t0, belge)          -> { analiz, t0, bas, son, belge }  (analiz ekseni 0 = sekansta t0)
 *   kaynakBul(kaynaklar, belge, t)     -> kaynak | null  (o belgenin, t'yi kapsayan sesi)
 *   hepsiniYasla(segs, kaynaklar, o)   -> { segments, rapor, islenen }  (her kaynağın aralığındaki kartlar o sesle
 *                                         hizalanır; girdi DEĞİŞMEZ; sorunlu kartlar s.senkronUyari ile işaretlenir)
 *   raporMetni(rapor)                  -> { metin, ayrinti, ton }  Türkçe tek satır: "N kelime sese oturtuldu ·
 *                                         ortalama sapma X ms → Y ms · Z kelime emin değil"
 *   sinirlar(seg)                      -> [{ id, tur, t, k }]  kartın sürüklenebilir sınırları (kart giriş / çıkışı,
 *                                         kelime başı / sonu; bitişik iki kelimenin ortak sınırı tek tutamak)
 *   sinirTasi(segs, ci, id, t, o)      -> { seg, t } | null  sınırı taşınmış kart KOPYASI (komşular, sıra, en kısa süre)
 *   tusAdimi(e, fps)                   -> sn  (←/→ 10 ms, Shift ile 1 kare; başka tuş 0)
 *   tusIlgisi(mac)                     -> CEP registerKeyEventsInterest listesi (tutamak odaktayken oklar Premiere'e gitmesin)
 *   gorunum(seg, kaynak)               -> { bas, son }  şeridin gösterdiği aralık (kart + kenar payı)
 *   zarfSutunlari(analiz, t0, bas, son, n) -> { yukseklik: Float32Array (0..1, −1 = ses yok), konusma: Uint8Array }
 *   serit(o)                           -> { ciz(), gizle() }  şerit bağlayıcısı (captions.js init kurar)
 *
 * Geri alma captions.js'in tek yığınındadır: bağlayıcı her sürükleme / tuş dizisinin İLK adımında o.degistir(..., ilk)
 * der, captions.js o an bir anlık görüntü alır (tek Ctrl+Z bütün sürüklemeyi geri alır).
 *
 * Ücretsiz (altyazının temel doğruluğu). Ağ yok. ES5, UMD (Node 12 / CEF 74). DOM yalnız verilen belgeden.
 */
(function (root, factory) {
  var SN = (root && root.SufloSenkron) || null;
  if (!SN && typeof require === "function") { try { SN = require("./senkron.js"); } catch (e) { SN = null; } }
  var api = factory(SN);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloSenkronUI = api;
})(typeof window !== "undefined" ? window : this, function (SN) {
  "use strict";

  var ORTAK_TOL = 0.001;     // iki kelimenin sınırı bu kadar yakınsa bitişik: tek tutamak
  var MIN_KELIME = 0.02;     // elle ince ayarda en kısa kelime (motorun 60 ms'i değil: kullanıcı bilerek kısaltabilir)
  var MIN_KART = 0.04;
  var GUVEN_ESIK = 0.5;

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function ms3(t) { return Math.round(t * 1000) / 1000; }
  function kirp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function gecerli(w) { return !!w && isFinite(Number(w.start)) && isFinite(Number(w.end)) && Number(w.end) >= Number(w.start); }
  function kopyaSeg(s) {
    var y = {};
    for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) y[k] = s[k];
    if (s && s.words) y.words = s.words.map(function (w) { var z = {}; for (var j in w) if (Object.prototype.hasOwnProperty.call(w, j)) z[j] = w[j]; return z; });
    return y;
  }

  /* ---------------- Kaynaklar (belgenin sesi) ---------------- */

  function kaynak(analiz, t0, belge) {
    if (!analiz || !(analiz.n > 0)) return null;
    var b = num(t0, 0);
    return { analiz: analiz, t0: b, bas: b, son: b + num(analiz.sure, analiz.n * (analiz.hop || 0.01)), belge: belge };
  }
  function kaynakBul(kaynaklar, belge, t) {
    var en = null, enD = Infinity;
    (kaynaklar || []).forEach(function (k) {
      if (!k || k.belge !== belge) return;
      var d = t < k.bas ? k.bas - t : (t > k.son ? t - k.son : 0);
      if (d < enD) { enD = d; en = k; }
    });
    return en && enD <= 0.5 ? en : null;
  }

  /* ---------------- Hizalama (kaynak kaynak) ---------------- */

  function bosRapor() {
    return { duzeltilen: 0, ortalamaOnceMs: 0, ortalamaSonraMs: 0, eminDegil: [], kayma: { ms: 0, guven: 0, uygulandi: false },
      atlandi: null, kelime: 0, kart: 0, kelimeli: false, uyariKart: 0, kaynak: 0 };
  }

  /*
   * o: { fps, belge, ayar (senkron.js seçenekleri) }. Kaynakların aralıkları ayrık varsayılır (toplu klip, tek klip ya da
   * sekans sesi); kartın başı hangi kaynağın aralığındaysa (±50 ms) o sesle hizalanır. Hiçbir kaynağa düşmeyen kart aynen kalır.
   */
  function hepsiniYasla(segs, kaynaklar, o) {
    o = o || {};
    var out = (segs || []).map(kopyaSeg);
    var rapor = bosRapor();
    if (!SN || !SN.hizala) { rapor.atlandi = "analizYok"; return { segments: out, rapor: rapor, islenen: 0 }; }
    var liste = (kaynaklar || []).filter(function (k) { return k && k.analiz && (o.belge === undefined || k.belge === o.belge); })
      .sort(function (a, b) { return a.bas - b.bas; });
    var atandi = out.map(function () { return false; });
    var onceTop = 0, sonraTop = 0, olcuSay = 0, nedenler = [], enBuyukKayma = null, islenen = 0;
    liste.forEach(function (k) {
      var idx = [];
      out.forEach(function (s, i) {
        if (atandi[i] || !gecerli(s)) return;
        if (Number(s.start) >= k.bas - 0.05 && Number(s.start) < k.son) { idx.push(i); atandi[i] = true; }
      });
      if (!idx.length) return;
      rapor.kaynak++;
      var ayar = {};
      var ka = o.ayar || {};
      for (var a in ka) if (Object.prototype.hasOwnProperty.call(ka, a)) ayar[a] = ka[a];
      ayar.t0 = k.t0;
      if (num(o.fps, 0) > 0) ayar.fps = num(o.fps, 0);
      var r = SN.hizala(idx.map(function (i) { return out[i]; }), k.analiz, ayar);
      var rr = r.rapor;
      islenen += idx.length;
      rapor.kelime += rr.kelime || 0;
      rapor.kart += idx.length;
      if (rr.kelime) rapor.kelimeli = true;
      if (rr.atlandi) nedenler.push(rr.atlandi);
      else {
        nedenler.push(null);
        r.kartlar.forEach(function (c, j) { out[idx[j]] = c; });
        rapor.duzeltilen += rr.duzeltilen || 0;
        var w = Math.max(1, rr.kelime || idx.length);
        onceTop += (rr.ortalamaOnceMs || 0) * w; sonraTop += (rr.ortalamaSonraMs || 0) * w; olcuSay += w;
        if (rr.kayma && rr.kayma.uygulandi && (!enBuyukKayma || Math.abs(rr.kayma.ms) > Math.abs(enBuyukKayma.ms))) enBuyukKayma = rr.kayma;
      }
      // kartın eski uyarısı bu doğrulamanın sonucuyla değişir
      idx.forEach(function (i) { delete out[i].senkronUyari; });
      // atlanan seste (gürültü, uyumsuz transkript) her kart işaretlenmez: rapor satırı söyler, liste kalabalıklaşmaz
      if (!rr.atlandi) (rr.eminDegil || []).forEach(function (e) {
        var ci = idx[e.kart];
        if (ci === undefined) return;
        rapor.eminDegil.push({ tur: e.tur, kart: ci, kelime: e.kelime, metin: e.metin, bas: e.bas, son: e.son, guven: e.guven, neden: e.neden });
        if (!out[ci].senkronUyari) out[ci].senkronUyari = String(e.neden || "onsetYok");
      });
      // kelimeli belgede kartın ortalama güveni de eşiğin altındaysa (tek tek kelimeler sınırda kalsa bile) işaretle
      if (!rr.atlandi && rr.kartGuven) rr.kartGuven.forEach(function (g, j) {
        var ci = idx[j];
        if (ci !== undefined && isFinite(g) && g < GUVEN_ESIK && !out[ci].senkronUyari && (out[ci].words || []).length) out[ci].senkronUyari = "onsetYok";
      });
    });
    if (!rapor.kaynak) rapor.atlandi = liste.length ? "kartYok" : "analizYok";
    else if (nedenler.every(function (n) { return n; })) rapor.atlandi = nedenler[0];
    if (olcuSay) { rapor.ortalamaOnceMs = Math.round(onceTop / olcuSay); rapor.ortalamaSonraMs = Math.round(sonraTop / olcuSay); }
    if (enBuyukKayma) rapor.kayma = { ms: enBuyukKayma.ms, guven: enBuyukKayma.guven, uygulandi: true };
    out.forEach(function (s) { if (s.senkronUyari) rapor.uyariKart++; });
    return { segments: out, rapor: rapor, islenen: islenen };
  }

  /* ---------------- Rapor metni ---------------- */

  var ATLANDI = {
    analizYok: "Senkron doğrulanamadı: ses okunamadı",
    kartYok: "Senkron doğrulanamadı: altyazı bu sesin aralığında değil",
    dusukKontrast: "Ses gürültülü ya da müzikli: zamanlara dokunulmadı",
    konusmaYok: "Seste konuşma bulunamadı: zamanlara dokunulmadı",
    uyumsuz: "Altyazı bu sesle eşleşmedi: zamanlara dokunulmadı",
    iyilesmedi: "Zamanlar zaten sesle uyumlu: düzeltme gerekmedi"
  };
  function isaretli(n) { return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(Math.round(n)); }

  // ton: "iyi" | "uyari" | "bilgi"
  function raporMetni(r) {
    r = r || bosRapor();
    var emin = 0;
    (r.eminDegil || []).forEach(function (e) { if (r.kelimeli ? e.tur === "kelime" : true) emin++; });
    var ayrinti = "";
    if (r.kayma && r.kayma.uygulandi) ayrinti = "Tüm altyazıda " + isaretli(r.kayma.ms) + " ms toplam kayma düzeltildi.";
    if (r.atlandi) {
      var m = ATLANDI[r.atlandi] || ATLANDI.analizYok;
      return { metin: m, ayrinti: ayrinti, ton: r.atlandi === "iyilesmedi" ? "iyi" : "uyari" };
    }
    var parca = [];
    if (r.duzeltilen > 0) {
      parca.push(r.kelimeli ? r.duzeltilen + " kelime sese oturtuldu" : r.duzeltilen + " kart sese oturtuldu");
      parca.push("ortalama sapma " + Math.round(r.ortalamaOnceMs) + " ms → " + Math.round(r.ortalamaSonraMs) + " ms");
    } else {
      parca.push("Zamanlar sesle uyumlu ✓");
      parca.push("ortalama sapma " + Math.round(r.ortalamaSonraMs) + " ms");
    }
    if (emin > 0) parca.push(r.kelimeli ? emin + " kelime emin değil" : emin + " kart emin değil");
    return { metin: parca.join(" · "), ayrinti: ayrinti, ton: emin > 0 ? "uyari" : "iyi" };
  }

  /* ---------------- Sınırlar ve elle ince ayar ---------------- */

  function sinirlar(seg) {
    if (!gecerli(seg)) return [];
    var out = [{ id: "kb", tur: "kartBas", t: Number(seg.start), k: -1 }];
    var ws = seg.words || [];
    for (var k = 0; k < ws.length; k++) {
      var w = ws[k];
      if (!gecerli(w)) continue;
      var onceki = k > 0 && gecerli(ws[k - 1]) ? ws[k - 1] : null;
      var sonraki = k + 1 < ws.length && gecerli(ws[k + 1]) ? ws[k + 1] : null;
      if (!onceki || Math.abs(Number(onceki.end) - Number(w.start)) > ORTAK_TOL) out.push({ id: "b" + k, tur: "bas", t: Number(w.start), k: k });
      if (sonraki && Math.abs(Number(w.end) - Number(sonraki.start)) <= ORTAK_TOL) out.push({ id: "o" + k, tur: "ortak", t: Number(w.end), k: k });
      else out.push({ id: "s" + k, tur: "son", t: Number(w.end), k: k });
    }
    out.push({ id: "ks", tur: "kartSon", t: Number(seg.end), k: -1 });
    return out;
  }

  // Kartın geçerli kelimeleri arasında k'den önceki / sonraki
  function komsu(ws, k, yon) {
    for (var j = k + yon; j >= 0 && j < ws.length; j += yon) if (gecerli(ws[j])) return ws[j];
    return null;
  }
  function ilkSonKelime(ws) {
    var ilk = null, son = null;
    for (var j = 0; j < ws.length; j++) if (gecerli(ws[j])) { if (!ilk) ilk = ws[j]; son = ws[j]; }
    return { ilk: ilk, son: son };
  }

  /*
   * segs[ci]'nin id sınırını t'ye taşır (sn, sekans). Sınırlar: önceki kartın çıkışı ve sonraki kartın girişi aşılmaz,
   * kelimeler sırasını korur, en kısa kelime / kart süresi. Kelime kartın dışına itilirse kart onu izler.
   * o: { minKelime, minKart }. Döner: { seg (kopya; senkronUyari silinir: kullanıcı elle doğruladı), t (uygulanan) } | null
   */
  function sinirTasi(segs, ci, id, t, o) {
    o = o || {};
    var s0 = segs && segs[ci];
    if (!gecerli(s0) || !isFinite(Number(t))) return null;
    var mk = num(o.minKelime, MIN_KELIME), mc = num(o.minKart, MIN_KART);
    var seg = kopyaSeg(s0);
    var ws = seg.words || [];
    var onceSon = ci > 0 && gecerli(segs[ci - 1]) ? Number(segs[ci - 1].end) : 0;
    var sonraBas = ci + 1 < segs.length && gecerli(segs[ci + 1]) ? Number(segs[ci + 1].start) : Infinity;
    var is = ilkSonKelime(ws);
    var lo, hi, w, m = /^([bso])(\d+)$/.exec(String(id));
    t = Number(t);
    if (id === "kb") {
      lo = Math.max(0, onceSon);
      hi = is.ilk ? Number(is.ilk.start) : Number(seg.end) - mc;
      if (!is.ilk) hi = Math.min(hi, Number(seg.end) - mc);
      t = ms3(kirp(t, lo, Math.max(lo, hi)));
      seg.start = t;
    } else if (id === "ks") {
      lo = is.son ? Number(is.son.end) : Number(seg.start) + mc;
      if (!is.son) lo = Math.max(lo, Number(seg.start) + mc);
      hi = sonraBas;
      t = ms3(kirp(t, lo, Math.max(lo, hi)));
      seg.end = t;
    } else if (m && ws[+m[2]] && gecerli(ws[+m[2]])) {
      var k = +m[2];
      w = ws[k];
      var onceki = komsu(ws, k, -1), sonraki = komsu(ws, k, 1);
      if (m[1] === "b") {
        lo = onceki ? Number(onceki.end) : Math.max(0, onceSon);
        hi = Number(w.end) - mk;
        t = ms3(kirp(t, lo, Math.max(lo, hi)));
        w.start = t;
        if (!onceki && t < Number(seg.start)) seg.start = t;
      } else if (m[1] === "s") {
        lo = Number(w.start) + mk;
        hi = sonraki ? Number(sonraki.start) : sonraBas;
        t = ms3(kirp(t, lo, Math.max(lo, hi)));
        w.end = t;
        if (!sonraki && t > Number(seg.end)) seg.end = t;
      } else {
        if (!sonraki) return null;
        lo = Number(w.start) + mk;
        hi = Number(sonraki.end) - mk;
        if (hi < lo) return null;
        t = ms3(kirp(t, lo, hi));
        w.end = t; sonraki.start = t;
      }
    } else return null;
    delete seg.senkronUyari;
    return { seg: seg, t: t };
  }

  /*
   * CEP'te panel odaktayken bile oklar Premiere'e de gider (playhead kayar): tutamak odaktayken ←/→ (Shift'li ve
   * Shift'siz), Home ve End panelde tutulur (js/arac-ara.js tusIlgisiAyarla ile, Ctrl+K ilgisi silinmesin). Sanal tuş
   * kodları: Windows 37 / 39 / 36 / 35, macOS 123 / 124 / 115 / 119.
   */
  var SERIT_TUSLARI = { win: [37, 39, 36, 35], mac: [123, 124, 115, 119] };
  function tusIlgisi(mac) {
    var out = [];
    SERIT_TUSLARI[mac ? "mac" : "win"].forEach(function (k) { out.push({ keyCode: k }); out.push({ keyCode: k, shiftKey: true }); });
    return JSON.stringify(out);
  }

  function tusAdimi(e, fps) {
    if (!e) return 0;
    var y = e.key === "ArrowLeft" || e.key === "Left" ? -1 : (e.key === "ArrowRight" || e.key === "Right" ? 1 : 0);
    if (!y) return 0;
    var f = num(fps, 0);
    var kare = f > 0 ? (SN && SN.kareHizi ? 1 / SN.kareHizi(f).deger : 1 / f) : 0.04;
    return y * (e.shiftKey ? kare : 0.01);
  }

  /* ---------------- Görünüm ve zarf ---------------- */

  function gorunum(seg, kay) {
    var s = num(seg && seg.start, 0), e = num(seg && seg.end, s + 1);
    if (e < s) e = s;
    var pay = Math.max(0.25, 0.15 * (e - s));
    var bas = s - pay, son = e + pay;
    if (kay) {
      if (bas < kay.bas) { son += kay.bas - bas; bas = kay.bas; }
      if (son > kay.son) { bas = Math.max(kay.bas, bas - (son - kay.son)); son = kay.son; }
    }
    if (bas < 0) { son -= bas; bas = 0; }
    if (son - bas < 0.2) son = bas + 0.2;
    return { bas: bas, son: son };
  }

  // n sütun: her sütunun en yüksek RMS'i, tabandan konuşma düzeyine 0..1 (−1: analizin dışında); konuşma etkinliği
  function zarfSutunlari(a, t0, bas, son, n) {
    n = Math.max(1, Math.floor(num(n, 1)));
    var y = new Float32Array(n), kn = new Uint8Array(n);
    var h = (a && a.hop) || 0.01;
    var alt = a ? num(a.tabanDb, -70) : -70, ust = a ? num(a.konusmaDb, -10) : -10;
    if (ust - alt < 12) ust = alt + 12;
    var dt = (son - bas) / n;
    for (var x = 0; x < n; x++) {
      if (!a || !a.n || !a.db) { y[x] = -1; continue; }
      var f0 = Math.floor((bas + x * dt - t0) / h), f1 = Math.ceil((bas + (x + 1) * dt - t0) / h);
      if (f1 <= f0) f1 = f0 + 1;
      if (f1 <= 0 || f0 >= a.n) { y[x] = -1; continue; }
      f0 = Math.max(0, f0); f1 = Math.min(a.n, f1);
      var mx = -200, ak = 0;
      for (var i = f0; i < f1; i++) { if (a.db[i] > mx) mx = a.db[i]; if (a.aktif && a.aktif[i]) ak = 1; }
      y[x] = kirp((mx - alt + 3) / (ust - alt + 6), 0, 1);
      kn[x] = ak;
    }
    return { yukseklik: y, konusma: kn };
  }

  function zamanMetni(t) {
    var top = Math.round(Math.max(0, num(t, 0)) * 1000);
    var dk = Math.floor(top / 60000), sn = Math.floor((top % 60000) / 1000), m = top % 1000;
    return (dk < 10 ? "0" : "") + dk + ":" + (sn < 10 ? "0" : "") + sn + "." + ("00" + m).slice(-3);
  }
  function kelimeAdi(seg, k) {
    var w = seg && seg.words && seg.words[k];
    var t = String(w && w.text != null ? w.text : "").replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
    return t.length > 24 ? t.slice(0, 23) + "…" : t;
  }
  function sinirEtiketi(seg, s) {
    if (s.tur === "kartBas") return "Kart girişi";
    if (s.tur === "kartSon") return "Kart çıkışı";
    if (s.tur === "bas") return "“" + kelimeAdi(seg, s.k) + "” başı";
    if (s.tur === "son") return "“" + kelimeAdi(seg, s.k) + "” sonu";
    var sonraki = komsuIndeks(seg, s.k);
    return "“" + kelimeAdi(seg, s.k) + "” / “" + kelimeAdi(seg, sonraki) + "” sınırı";
  }
  function komsuIndeks(seg, k) {
    var ws = seg.words || [];
    for (var j = k + 1; j < ws.length; j++) if (gecerli(ws[j])) return j;
    return k;
  }

  /* ---------------- DOM bağlayıcısı: ses dalgası şeridi ---------------- */

  /*
   * o: {
   *   belge, kimlikler?: { kok, tuval, tutamaklar, alan, baslik, bos, analiz, dinle, yasla, geri },
   *   segments() -> dizi, secili() -> index, kaynak(seg) -> kaynak | null, fps() -> sayı, ae() -> bool,
   *   degistir(ci, yeniSeg, { ilk, bitti, etiket }), dinle(ci), hepsiniYasla(), geriAl(), geriAlVar() -> bool,
   *   analizEt() (kaynak yokken: seçili klibin sesini analiz eder), analizSuruyor() -> bool,
   *   tusTut(bool) (tutamak odak alınca / bırakınca: tuş ilgisi)
   * }
   */
  function serit(o) {
    var B = o.belge;
    var ID = o.kimlikler || {};
    function el(ad, vars) { return B.getElementById(ID[ad] || vars); }
    var kok = el("kok", "cap-dalga"), tuval = el("tuval", "cap-dalga-tuval"), tut = el("tutamaklar", "cap-dalga-tutamaklar");
    var alan = el("alan", "cap-dalga-alan"), baslik = el("baslik", "cap-dalga-baslik"), bos = el("bos", "cap-dalga-bos");
    var bDinle = el("dinle", "cap-dalga-dinle"), bYasla = el("yasla", "cap-dalga-yasla"), bGeri = el("geri", "cap-dalga-geri");
    var bAnaliz = el("analiz", "cap-dalga-analiz");
    if (!kok || !tuval || !tut) return { ciz: function () {}, gizle: function () {} };
    var tutamaklar = {};     // id -> öğe (yeniden çizimde korunur: klavye odağı kaybolmasın)
    var durum = { ci: -1, bas: 0, son: 1, gen: 0, sinir: [] };
    var surukle = null;      // { id, ci, pid }
    var tusOturum = null;    // { anahtar, zaman }

    function xZaman(x) { return durum.bas + (x / Math.max(1, durum.gen)) * (durum.son - durum.bas); }
    function zamanX(t) { return (t - durum.bas) / Math.max(1e-6, durum.son - durum.bas) * durum.gen; }
    function renk(ad, yedek) {
      try {
        var v = B.defaultView && B.defaultView.getComputedStyle ? B.defaultView.getComputedStyle(kok).getPropertyValue(ad) : "";
        v = String(v || "").trim();
        return v || yedek;
      } catch (e) { return yedek; }
    }

    function tasi(id, t, bayrak) {
      var segs = o.segments(), ci = durum.ci;
      var r = sinirTasi(segs, ci, id, t);
      if (!r) return null;
      // sınırda (komşu kart / kelime) kımıldamayan tutamak geri al yığınına boş adım yazmasın
      var simdiki = null;
      sinirlar(segs[ci]).forEach(function (x) { if (x.id === id) simdiki = x.t; });
      if (simdiki !== null && Math.abs(simdiki - r.t) < 1e-9) return null;
      o.degistir(ci, r.seg, bayrak || {});
      ciz();   // tutamaklar yeni zamanlarda (öğeler korunur: odak ve sürükleme sürer)
      return r;
    }

    function tutamakKur(s) {
      var d = tutamaklar[s.id];
      if (!d) {
        d = B.createElement("div");
        d.setAttribute("role", "slider");
        d.setAttribute("tabindex", "0");
        d.setAttribute("data-sinir", s.id);
        d.addEventListener("keydown", function (e) {
          var adim = tusAdimi(e, o.fps());
          var id = d.getAttribute("data-sinir");
          if (e.key === "Home" || e.key === "End") {
            // Home / End: kartın ilk / son sınırına odak (Sekme ile dolaşmaya ek kısayol)
            var ids = durum.sinir.map(function (x) { return x.id; }), i = ids.indexOf(id);
            var hedef = tutamaklar[ids[e.key === "Home" ? 0 : ids.length - 1]];
            if (i !== -1 && hedef && hedef.focus) { e.preventDefault(); hedef.focus(); }
            return;
          }
          if (!adim) return;
          e.preventDefault();
          if (e.stopPropagation) e.stopPropagation();
          var s2 = null;
          sinirlar(o.segments()[durum.ci]).forEach(function (x) { if (x.id === id) s2 = x; });
          if (!s2) return;
          var simdi = Date.now(), anahtar = durum.ci + "|" + id;
          var ilk = !tusOturum || tusOturum.anahtar !== anahtar || simdi - tusOturum.zaman > 1500;
          tusOturum = { anahtar: anahtar, zaman: simdi };
          tasi(id, s2.t + adim, { ilk: ilk, bitti: true, etiket: "dalga ince ayarı" });
        });
        d.addEventListener("focus", function () { if (o.tusTut) o.tusTut(true); });
        d.addEventListener("blur", function () { if (o.tusTut) o.tusTut(false); });
        d.addEventListener("pointerdown", function (e) {
          if (e.button !== undefined && e.button !== 0) return;
          e.preventDefault();
          surukle = { id: d.getAttribute("data-sinir"), ci: durum.ci, pid: e.pointerId, ilk: true, oynadi: false };
          try { if (d.setPointerCapture) d.setPointerCapture(e.pointerId); } catch (e0) {}
          if (d.focus) d.focus();
          d.classList.add("surukleniyor");
        });
        d.addEventListener("pointermove", function (e) {
          if (!surukle || surukle.pid !== e.pointerId || surukle.ci !== durum.ci) return;
          var r = alan && alan.getBoundingClientRect ? alan.getBoundingClientRect() : { left: 0 };
          var t = xZaman(Number(e.clientX) - Number(r.left || 0));
          if (tasi(surukle.id, t, { ilk: surukle.ilk, bitti: false, etiket: "dalga sürükleme" })) { surukle.ilk = false; surukle.oynadi = true; }
        });
        function birak(e) {
          if (!surukle || (e && surukle.pid !== e.pointerId)) return;
          var oynadi = surukle.oynadi, ci = surukle.ci;
          surukle = null;
          d.classList.remove("surukleniyor");
          try { if (e && d.releasePointerCapture) d.releasePointerCapture(e.pointerId); } catch (e1) {}
          if (oynadi) { var segs = o.segments(); if (segs[ci]) o.degistir(ci, segs[ci], { ilk: false, bitti: true, etiket: "dalga sürükleme" }); }
        }
        d.addEventListener("pointerup", birak);
        d.addEventListener("pointercancel", birak);
        tutamaklar[s.id] = d;
        tut.appendChild(d);
      }
      var seg = o.segments()[durum.ci];
      d.className = "dalga-tutamak " + (s.tur === "kartBas" || s.tur === "kartSon" ? "kart" : "kelime") + (surukle && surukle.id === s.id ? " surukleniyor" : "");
      d.setAttribute("aria-label", sinirEtiketi(seg, s));
      d.setAttribute("aria-valuemin", String(Math.round(durum.bas * 1000)));
      d.setAttribute("aria-valuemax", String(Math.round(durum.son * 1000)));
      d.setAttribute("aria-valuenow", String(Math.round(s.t * 1000)));
      d.setAttribute("aria-valuetext", zamanMetni(s.t));
      d.title = sinirEtiketi(seg, s) + " · " + zamanMetni(s.t);
      d.style.left = (Math.round(kirp(zamanX(s.t), 0, durum.gen) * 10) / 10) + "px";
      return d;
    }

    function tutamaklariTemizle(kalan) {
      Object.keys(tutamaklar).forEach(function (id) {
        if (kalan && kalan[id]) return;
        var d = tutamaklar[id];
        if (d.parentNode && d.parentNode.removeChild) d.parentNode.removeChild(d);
        delete tutamaklar[id];
      });
    }

    function tuvalCiz(seg, kay) {
      var dpr = (B.defaultView && B.defaultView.devicePixelRatio) || 1;
      var g = durum.gen, yuk = Math.max(40, Number(alan && alan.clientHeight) || 64);
      tuval.width = Math.max(1, Math.round(g * dpr));
      tuval.height = Math.max(1, Math.round(yuk * dpr));
      // CSS boyutu stil sayfasında (genişlik %100): kap daralırsa tuval taşmaz, sonraki çizim yeni genişliği okur
      var c = tuval.getContext ? tuval.getContext("2d") : null;
      if (!c) return;
      if (c.setTransform) c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, g, yuk);
      var segs = o.segments();
      // komşu kartlar soluk, seçili kart vurgulu
      for (var i = Math.max(0, durum.ci - 3); i < Math.min(segs.length, durum.ci + 4); i++) {
        var s = segs[i];
        if (!gecerli(s)) continue;
        var x0 = zamanX(Number(s.start)), x1 = zamanX(Number(s.end));
        if (x1 < 0 || x0 > g) continue;
        c.fillStyle = i === durum.ci ? renk("--dalga-kart", "rgba(114,124,255,.18)") : renk("--dalga-komsu", "rgba(255,255,255,.05)");
        c.fillRect(x0, 0, Math.max(1, x1 - x0), yuk);
      }
      var z = zarfSutunlari(kay.analiz, kay.t0, durum.bas, durum.son, Math.max(1, Math.round(g)));
      var orta = yuk / 2, dalga = renk("--dalga-renk", "#3aa7ff"), sessiz = renk("--dalga-sessiz", "#4a5568");
      for (var x = 0; x < z.yukseklik.length; x++) {
        var h = z.yukseklik[x];
        if (h < 0) continue;
        var y = Math.max(0.5, h * (orta - 3));
        c.fillStyle = z.konusma[x] ? dalga : sessiz;
        c.fillRect(x, orta - y, 1, y * 2);
      }
      // kelime sınırları ve adları
      c.font = "10px sans-serif";
      c.textBaseline = "top";
      (seg.words || []).forEach(function (w) {
        if (!gecerli(w)) return;
        var a = zamanX(Number(w.start)), b = zamanX(Number(w.end));
        c.fillStyle = renk("--dalga-sinir", "rgba(242,245,250,.55)");
        c.fillRect(Math.round(a), 0, 1, yuk);
        c.fillRect(Math.round(b), 0, 1, yuk);
        var ad = String(w.text == null ? "" : w.text).replace(/[*_]/g, "").trim();
        if (ad && b - a > 14 && c.fillText) {
          c.fillStyle = renk("--dalga-yazi", "#f2f5fa");
          var sigan = ad;
          if (c.measureText) { while (sigan.length > 1 && c.measureText(sigan).width > b - a - 4) sigan = sigan.slice(0, -1); }
          c.fillText(sigan, a + 2, 2);
        }
      });
    }

    function gizle() {
      kok.hidden = true;
      tutamaklariTemizle(null);
      durum.ci = -1;
    }

    function ciz() {
      var segs = o.segments();
      if (!segs || !segs.length) { gizle(); return; }
      kok.hidden = false;
      var ci = o.secili();
      if (!(ci >= 0 && ci < segs.length)) ci = 0;
      var seg = segs[ci];
      if (ci !== durum.ci) tusOturum = null;
      durum.ci = ci;
      if (bDinle) bDinle.disabled = !gecerli(seg) || !!(o.ae && o.ae());
      if (bGeri) bGeri.disabled = !(o.geriAlVar && o.geriAlVar());
      var kay = gecerli(seg) ? o.kaynak(seg) : null;
      if (bYasla) bYasla.disabled = !!(o.analizSuruyor && o.analizSuruyor());
      if (baslik) baslik.textContent = "Ses dalgası · #" + (ci + 1);
      if (!kay) {
        if (bos) bos.hidden = false;
        if (bAnaliz) bAnaliz.disabled = !!(o.analizSuruyor && o.analizSuruyor());
        if (alan) alan.hidden = true;
        tutamaklariTemizle(null);
        return;
      }
      if (bos) bos.hidden = true;
      if (alan) alan.hidden = false;
      var v = gorunum(seg, kay);
      durum.bas = v.bas; durum.son = v.son;
      durum.gen = Math.max(40, Number(alan && alan.clientWidth) || 300);
      durum.sinir = sinirlar(seg);
      var kalan = {};
      durum.sinir.forEach(function (s) { kalan[s.id] = true; });
      tutamaklariTemizle(kalan);
      durum.sinir.forEach(tutamakKur);
      tuvalCiz(seg, kay);
    }

    if (bDinle) bDinle.addEventListener("click", function () { if (durum.ci >= 0) o.dinle(durum.ci); });
    if (bYasla) bYasla.addEventListener("click", function () { o.hepsiniYasla(); });
    if (bGeri) bGeri.addEventListener("click", function () { o.geriAl(); });
    if (bAnaliz) bAnaliz.addEventListener("click", function () { o.analizEt(); });
    return { ciz: ciz, gizle: gizle, _durum: durum, _tutamaklar: tutamaklar };
  }

  return {
    kaynak: kaynak,
    kaynakBul: kaynakBul,
    hepsiniYasla: hepsiniYasla,
    raporMetni: raporMetni,
    sinirlar: sinirlar,
    sinirTasi: sinirTasi,
    tusAdimi: tusAdimi,
    tusIlgisi: tusIlgisi,
    gorunum: gorunum,
    zarfSutunlari: zarfSutunlari,
    zamanMetni: zamanMetni,
    sinirEtiketi: sinirEtiketi,
    serit: serit,
    ATLANDI: ATLANDI
  };
});
