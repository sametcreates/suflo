/*
 * Suflo Eğri — saf model (DOM'a, Premiere'e, depoya dokunmaz)
 * window.SufloEgriModel · module.exports  (3.4, plan adım 10)
 *
 * Eğri sekmesinin (js/egri.js) ve onun SVG düzenleyicisinin (SufloEgriEditor; Hız Rampası'nın özel
 * eğrisi, adım 13, aynı düzenleyiciyi kullanır) test edilebilir mantığı:
 *   - yoklama kararı: ucuz KS_easePeek'ten sonra yeniden tarama mı, yalnız çiftleri yeniden hesaplama mı
 *   - playhead'i saran anahtar kare çifti (host'taki KS_easeCift ile aynı kural) ve satır durumu
 *   - "1,20 sn → 2,00 sn · 24 kare" aralık çipi, sonraki çift, Premiere'de kaba önizleme adımları
 *   - bake öğeleri (SufloEase.bakePlan; Opaklık 0..100), klip başına gruplama, eski kaydın yerine geçme
 *   - düzenleyici geometrisi: değer ve hız görünümü, tutamaç sürükleme, Shift ile 0,05'e yapışma,
 *     çift tıkla şekli bozmadan nokta ekleme (SufloEase.split), nokta silme, önizleme sahnesi
 *   - kısayollar (metin alanında değilken) ve CEP tuş ilgisi, kullanıcı önayarlarının doğrulanması
 *   - varışta yaylanma (adım 14): varışları bulma (önceki anahtardan varış hızı, sonraki anahtar / klip sonu sınırı),
 *     KS_easeBake yaylanma öğeleri (SufloEase.yaylanPlan; seyrek + 2 karede bir yedek), aynı inişte yerine geçme, önizleme
 * Suflo'nun kendi kodu (temiz oda). Yumuşatma matematiği js/ease-curve.js'te (Rebound MIT uyarlaması).
 */
(function (root, factory) {
  var E = root && root.SufloEase;
  var KR = root && root.SufloKeyRecords;
  if (!E && typeof require === "function") { try { E = require("./ease-curve.js"); } catch (e) { E = null; } }
  if (!KR && typeof require === "function") { try { KR = require("./key-records.js"); } catch (e2) { KR = null; } }
  var api = factory(E, KR);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloEgriModel = api;
})(typeof window !== "undefined" ? window : this, function (E, KR) {
  "use strict";

  var YOKLAMA_MS = 1200;          // KS_easePeek aralığı (yalnız sekme görünür + panel odakta)
  var ONIZLEME_HZ = 12;           // Premiere'de önizle: saniyede en çok adım
  var YOGUNLUKLAR = [1, 2, 4];    // kare
  var TOL_KARE = 0.25;            // anahtar eşleşmesi (SufloKeyRecords ile aynı)
  var EN_COK_ONAYAR = 24;
  var AD_SINIR = 40;
  var ED = { W: 320, H: 220, PAD: 16, YMIN: -0.5, YMAX: 1.5, YAPIS: 0.05 };

  function sonlu(v) { return typeof v === "number" && isFinite(v); }
  function sinirla(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function fpsOku(fps) { var f = Number(fps); return f > 0 && f <= 1000 ? f : 30; }
  function r4(v) { return Math.round(v * 10000) / 10000; }

  /* ================= yoklama ================= */
  // Yoklama yalnız sekme görünürken, panel odaktayken ve Premiere başka bir işle meşgul değilken
  function yoklamaUygun(d) {
    d = d || {};
    return !!d.gorunur && d.odak !== false && !d.mesgul;
  }
  /*
   * onbellek: son tarama { seqId, selSig, kapsam: [a, b], ph } (yoksa null); pk: KS_easePeek sonucu;
   * o.tazele: panel odağı yeni geri aldı ya da sekme yeniden açıldı (kullanıcı Effect Controls'te anahtar
   * eklemiş / değiştirmiş olabilir; seçim imzası bunu göstermez).
   * Döner: 'tara' (sekans ya da seçim değişti, playhead taranan kapsamın dışında, tazele), 'ciftler' (yalnız
   * playhead oynadı: çiftler önbellekteki anahtarlardan yeniden hesaplanır) ya da 'bekle'.
   */
  function yoklamaKarari(onbellek, pk, o) {
    if (!pk || !pk.ok) return "bekle";
    if (!onbellek || (o && o.tazele)) return "tara";
    if (String(pk.seqId || "") !== String(onbellek.seqId || "")) return "tara";
    if (String(pk.selSig || "") !== String(onbellek.selSig || "")) return "tara";
    var ph = Number(pk.ph), k = onbellek.kapsam;
    if (k && k.length === 2 && sonlu(ph) && (ph < Number(k[0]) || ph >= Number(k[1]))) return "tara";
    if (sonlu(ph) && Math.abs(ph - Number(onbellek.ph)) > 1e-6) return "ciftler";
    return "bekle";
  }

  /* ================= çift ================= */
  function tolerans(fps) { return TOL_KARE / fpsOku(fps); }
  function indis(keys, t, tol) {
    for (var i = 0; i < keys.length; i++) if (Math.abs(keys[i] - t) <= tol) return i;
    return -1;
  }
  /*
   * keys: artan timeline saniyeleri; uclar: o özelliğin canlı Suflo kayıtlarının [t0, t1] aralıkları.
   * Playhead canlı bir kaydın içindeyse çift o kaydın uçlarıdır (Suflo'nun iç anahtarları çifti bölmez);
   * değilse playhead'i saran iki komşu anahtar (anahtarın üstündeyse o ve sonraki, sonuncudaysa bir önceki).
   * Kayıt aralığı sonda yarı açık (host KS_easeIpucu ile aynı): playhead B'nin üstündeyse düz kural (B ve
   * sonraki çift); B son anahtarsa kaydın çifti kalır.
   * Döner: { i0, i1, t0, t1, ic, kayitli } | null (playhead anahtarların dışında ya da < 2 anahtar).
   */
  function ciftBul(keys, ph, fps, uclar) {
    keys = Array.isArray(keys) ? keys : [];
    var n = keys.length, tol = tolerans(fps);
    ph = Number(ph);
    if (n < 2 || !sonlu(ph)) return null;
    for (var u = 0; Array.isArray(uclar) && u < uclar.length; u++) {
      var a = Number(uclar[u] && uclar[u][0]), b = Number(uclar[u] && uclar[u][1]);
      if (!(sonlu(a) && sonlu(b) && b > a) || ph < a - tol || ph > b + tol) continue;
      var j0 = indis(keys, a, tol), j1 = indis(keys, b, tol);
      if (!(j0 >= 0 && j1 > j0)) continue;
      if (ph >= b - tol && j1 < n - 1) continue;
      return { i0: j0, i1: j1, t0: keys[j0], t1: keys[j1], ic: j1 - j0 - 1, kayitli: true };
    }
    if (ph < keys[0] - tol || ph > keys[n - 1] + tol) return null;
    var i = 0;
    while (i < n - 2 && ph >= keys[i + 1] - tol) i++;
    return { i0: i, i1: i + 1, t0: keys[i], t1: keys[i + 1], ic: 0, kayitli: false };
  }

  function kareSayisi(t0, t1, fps) { return Math.max(0, Math.round((Number(t1) - Number(t0)) * fpsOku(fps))); }

  // Türkçe ondalık virgül: 1.2 → "1,20"
  function sayi(v, basamak) {
    var b = basamak === undefined ? 2 : basamak;
    var s = (Math.round(Number(v) * Math.pow(10, b)) / Math.pow(10, b)).toFixed(b);
    return s.replace(".", ",").replace(/^-(0,0*)$/, "$1");
  }
  // Aralık çipi: "1,20 sn → 2,00 sn · 24 kare"
  function aralikMetni(t0, t1, fps) {
    return sayi(t0) + " sn → " + sayi(t1) + " sn · " + kareSayisi(t0, t1, fps) + " kare";
  }

  /*
   * Satırın durumu (önbellekteki anahtarlar + playhead + canlı kayıt uçları):
   *   { cift, durum: 'tamam' | 'kayitli' | 'tekKare' | 'disinda', degerVar (tarama bu çiftin uç değerlerini okudu mu) }
   */
  function satirDurumu(prop, ph, uclar) {
    var fps = fpsOku(prop && prop.fps);
    var c = ciftBul(prop && prop.keys, ph, fps, uclar);
    if (!c) return { cift: null, durum: "disinda", degerVar: false };
    var p = prop.pair, tol = tolerans(fps);
    var degerVar = !!(p && Math.abs(p.t0 - c.t0) <= tol && Math.abs(p.t1 - c.t1) <= tol && prop.v0 !== null && prop.v0 !== undefined && prop.v1 !== null && prop.v1 !== undefined);
    if (kareSayisi(c.t0, c.t1, fps) < 2) return { cift: c, durum: "tekKare", degerVar: degerVar };
    return { cift: c, durum: c.kayitli ? "kayitli" : "tamam", degerVar: degerVar };
  }

  function satirAnahtari(p) { return String(p.nodeId) + "|" + p.compIdx + "|" + p.propIdx; }

  /* ================= kayıtlar ================= */
  // Bu satırın (klip + bileşen + özellik + kimlik) kayıtları; tur verilmezse Eğri ('egri'), 'yaylan' varışta yaylanma
  function satirKayitlari(kayitlar, prop, tur) {
    var t = tur || "egri";
    return (Array.isArray(kayitlar) ? kayitlar : []).filter(function (r) {
      return r && r.tur === t && String(r.nodeId) === String(prop.nodeId) && r.compIdx === prop.compIdx && r.propIdx === prop.propIdx &&
        String(r.matchName || "") === String(prop.matchName || "");
    });
  }
  // Klibin kaynak çapası (tarama satırından ya da kayıttan): { clipStart, clipEnd, clipIn, clipOut, ters } | null
  function capa(o) {
    if (!o || !sonlu(o.clipStart) || !sonlu(o.clipEnd) || !sonlu(o.clipIn) || !sonlu(o.clipOut)) return null;
    return { clipStart: o.clipStart, clipEnd: o.clipEnd, clipIn: o.clipIn, clipOut: o.clipOut, ters: o.ters === true };
  }
  /*
   * Kaydın kaynak çapasından bugünkü klibe (k: tarama satırı ya da yeni kayıt) sabit kayma; host
   * KS_easeCapaKaymasi ile aynı hesap. Kayıt zamanı → o günkü eşlemeyle kaynak saniyesi → bugünkü klibin
   * timeline saniyesi. Hız ve yön aynıyken (taşıma, slip, baştan / sondan düz ya da ripple kırpma) tüm
   * anahtarlar aynı kadar kayar; iki uçtaki kayma tol / 2'den çok ayrışırsa ya da çapa yoksa NaN.
   */
  function capaKaymasi(r, k, tol) {
    var a = capa(r), b = capa(k);
    if (!a || !b || a.ters !== b.ters) return NaN;
    var rDur = a.clipEnd - a.clipStart, rKay = a.clipOut - a.clipIn, dur = b.clipEnd - b.clipStart, kKay = b.clipOut - b.clipIn;
    if (!(rDur > 1e-6) || !(Math.abs(rKay) > 1e-6) || !(dur > 1e-6) || !(Math.abs(kKay) > 1e-6)) return NaN;
    var u = Array.isArray(r.uclar) && r.uclar.length === 2 ? r.uclar : (Array.isArray(r.times) && r.times.length ? [r.times[0], r.times[r.times.length - 1]] : null);
    if (!u || !sonlu(u[0]) || !sonlu(u[1])) return NaN;
    function yeni(t) {
      var oran = (t - a.clipStart) / rDur;
      var s = a.ters ? a.clipOut - rKay * oran : a.clipIn + rKay * oran;
      var o2 = b.ters ? (b.clipOut - s) / kKay : (s - b.clipIn) / kKay;
      return b.clipStart + o2 * dur;
    }
    var d0 = yeni(u[0]) - u[0], d1 = yeni(u[1]) - u[1];
    if (!sonlu(d0) || !sonlu(d1) || Math.abs(d1 - d0) > tol / 2) return NaN;
    return (d0 + d1) / 2;
  }
  /*
   * Kaydın d saniye kaydırılmış kopyası (id aynı). Anahtarlar klibin KAYNAK zamanında durur: klip timeline'da
   * taşınınca / slip ya da ripple kırpılınca hepsi kayar, kayıt (timeline saniyesi) kaymaz. Kopya kendi içinde
   * tutarlıdır: yeniCapa verildiyse (çapa kayması) bugünkü klibin çapasını alır, yoksa clipStart / clipEnd de d
   * kadar kayar. Host'a giden kopya böylece kaymasız eşleşir.
   */
  function kaydir(r, d, yeniCapa) {
    var k = {};
    for (var a in r) if (Object.prototype.hasOwnProperty.call(r, a)) k[a] = r[a];
    k.times = (r.times || []).map(function (t) { return r4(t + d); });
    if (r.uclar) k.uclar = [r4(r.uclar[0] + d), r4(r.uclar[1] + d)];
    if (Array.isArray(r.kenarDegerleri)) k.kenarDegerleri = r.kenarDegerleri.map(function (x) { return { t: r4(x.t + d), v: x.v }; });
    var c = capa(yeniCapa);
    if (c) {
      k.clipStart = r4(c.clipStart); k.clipEnd = r4(c.clipEnd); k.clipIn = r4(c.clipIn); k.clipOut = r4(c.clipOut); k.ters = c.ters;
    } else {
      if (sonlu(r.clipStart)) k.clipStart = r4(r.clipStart + d);
      if (sonlu(r.clipEnd)) k.clipEnd = r4(r.clipEnd + d);
    }
    return k;
  }
  /*
   * Kaydın bugünkü klibe göre aday kaymaları (host KS_easeKayitEsle ile aynı sıra): çapa kayması (taşıma, slip,
   * ripple kırpma; hız ve yön aynıyken), kaymasız (düz baştan kırpma anahtarları yerinde bırakır) ve klip
   * başlangıcının kayması (çapasız eski kayıt). Döner: [{ d, capa }] (capa: kopyanın alacağı bugünkü çapa).
   */
  function adayKaymalar(r, prop) {
    var tol = tolerans(prop.fps), out = [];
    var dc = capaKaymasi(r, prop, tol);
    if (sonlu(dc) && Math.abs(dc) > 1e-6) out.push({ d: dc, capa: prop });
    out.push({ d: 0, capa: null });
    var dm = Number(prop.clipStart) - Number(r.clipStart);
    if (sonlu(r.clipStart) && sonlu(dm) && Math.abs(dm) > tol && (!sonlu(dc) || Math.abs(dm - dc) > 1e-6)) out.push({ d: dm, capa: null });
    return out;
  }
  /*
   * Kaydın bugünkü anahtarlarla canlı hâli (SufloKeyRecords.canli: iki uç + zamanların en az %60'ı) ya da null.
   * Aday kaymalar sırayla denenir (adayKaymalar); kaymasız aday kaydın kendisini döndürür.
   */
  function canliHali(r, prop) {
    if (!KR) return null;
    var ad = adayKaymalar(r, prop);
    for (var i = 0; i < ad.length; i++) {
      var k = ad[i].d === 0 ? r : kaydir(r, ad[i].d, ad[i].capa);
      if (KR.canli(k, prop.keys, prop.fps)) return k;
    }
    return null;
  }
  // Canlı kayıtlar (taşınan klipte kaydırılmış kopyalarıyla); tur: satirKayitlari gibi
  function canliKayitlar(kayitlar, prop, tur) {
    var out = [];
    satirKayitlari(kayitlar, prop, tur).forEach(function (r) { var c = canliHali(r, prop); if (c) out.push(c); });
    return out;
  }
  function uclarDan(kayitlar) {
    return kayitlar.filter(function (r) { return r.uclar; }).map(function (r) { return [r.uclar[0], r.uclar[1]]; });
  }
  /*
   * 400'den çok anahtarlı özellikte (kesik) tarama yalnız playhead çevresindeki pencereyi verir: uzun bir kaydın
   * uçları ve zamanlarının çoğu pencerenin dışında kalabilir. İpucu için kayıt pencerede görünen kısmıyla
   * ölçülür (görünen zamanların %60'ı ve görünen uçlar yerinde); host ipucunu tüm anahtarlarla doğrular ve
   * kaydın tüm aralığını döndürür, sonraki ölçüm yine tam kuralla yapılır.
   */
  function pencerede(r, prop) {
    var k = prop.keys || [], tol = tolerans(prop.fps);
    if (!KR || !prop.kesik || k.length < 2 || !r.uclar) return null;
    var lo = k[0] - tol, hi = k[k.length - 1] + tol;
    function dene(rec) {
      var gorunen = (rec.times || []).filter(function (t) { return t >= lo && t <= hi; });
      if (!gorunen.length) return false;
      var ucTamam = rec.uclar.every(function (u) { return u < lo || u > hi || indis(k, u, tol) >= 0; });
      return ucTamam && KR.canli({ tur: rec.tur, times: gorunen }, k, prop.fps);
    }
    var ad = adayKaymalar(r, prop);
    for (var i = 0; i < ad.length; i++) {
      var kk = ad[i].d === 0 ? r : kaydir(r, ad[i].d, ad[i].capa);
      if (dene(kk)) return kk;
    }
    return null;
  }
  // KS_easeScan'e giden ipuçları: canlı kayıtların uçları (kesik özellikte pencerede canlı görünenler de)
  function ipuclari(kayitlar, props) {
    var out = [];
    (props || []).forEach(function (p) {
      satirKayitlari(kayitlar, p).forEach(function (r0) {
        var r = canliHali(r0, p) || pencerede(r0, p);
        if (r && r.uclar) out.push({ nodeId: p.nodeId, compIdx: p.compIdx, propIdx: p.propIdx, t0: r.uclar[0], t1: r.uclar[1] });
      });
    });
    return out.slice(0, 400);
  }
  // Satırın şu anki çiftini kapsayan canlı kayıt (Geri al düğmesi bunu kaldırır)
  function satirKaydi(kayitlar, prop, cift) {
    if (!cift) return null;
    var tol = tolerans(prop.fps), canli = canliKayitlar(kayitlar, prop);
    for (var i = canli.length - 1; i >= 0; i--) {
      var u = canli[i].uclar;
      if (u && Math.abs(u[0] - cift.t0) <= tol && Math.abs(u[1] - cift.t1) <= tol) return canli[i];
    }
    return null;
  }
  // Yeni kayıtla çakışan eskiler (aynı satır, uç aralıkları kesişir): yeni eğri onların yerine geçer. İkisinin
  // de kaynak çapası biliniyorsa aralıklar kaynak zamanına göre (klip taşınmış, slip ya da ripple kırpılmış),
  // yalnız klip başlangıcı biliniyorsa klibe göre ölçülür: düzenlemeden sonra yeniden uygulanan eğri eski kaydın
  // yerine geçer; kaymış başka bir eğrinin kaydını yanlışlıkla atmaz
  function cakisanlar(kayitlar, yeni) {
    return (Array.isArray(kayitlar) ? kayitlar : []).filter(function (r) {
      if (!r || !yeni || r.id === yeni.id || r.tur !== "egri") return false;
      if (String(r.nodeId) !== String(yeni.nodeId) || r.compIdx !== yeni.compIdx || r.propIdx !== yeni.propIdx) return false;
      var a = r.uclar, b = yeni.uclar;
      if (!a || !b) return true;
      var d = capaKaymasi(r, yeni, tolerans(yeni.fps));
      if (!sonlu(d)) d = sonlu(r.clipStart) && sonlu(yeni.clipStart) ? yeni.clipStart - r.clipStart : 0;
      return a[0] + d < b[1] && b[0] < a[1] + d;
    });
  }

  /* ================= bake ================= */
  /*
   * Seçili satırlardan KS_easeBake çağrıları (klip başına bir). satirlar: [{ prop, cift, kayit }]
   * (cift prop.pair ile aynı olmalı: uç değerleri taramadan gelir; kayit: çifti kapsayan canlı Suflo kaydı).
   * Kayıtlı çiftte öğe degistir + eski (kaydın zamanları) taşır: host yalnız Suflo'nun eski anahtarlarını siler,
   * kullanıcının araya eklediği anahtar varsa yazmaz. Döner: { gruplar: [{ target, items }], atlanan: [{ prop, kod }] }.
   */
  function bakeGruplari(satirlar, egri, adim, seqId) {
    var gruplar = [], dizin = {}, atlanan = [];
    (satirlar || []).forEach(function (s) {
      var p = s.prop, c = s.cift;
      if (!c) { atlanan.push({ prop: p, kod: "disinda" }); return; }
      if (p.v0 === null || p.v0 === undefined || p.v1 === null || p.v1 === undefined) { atlanan.push({ prop: p, kod: "degerYok" }); return; }
      var plan = E.bakePlan({ t0: c.t0, t1: c.t1, v0: p.v0, v1: p.v1, fps: p.fps, step: adim, curve: egri,
        clampMin: p.opak ? 0 : undefined, clampMax: p.opak ? 100 : undefined });
      if (plan.hata) { atlanan.push({ prop: p, kod: "gecersiz" }); return; }
      if (!plan.keys.length) { atlanan.push({ prop: p, kod: "bos" }); return; }
      var a = String(p.nodeId);
      if (!Object.prototype.hasOwnProperty.call(dizin, a)) {
        dizin[a] = gruplar.length;
        gruplar.push({ target: { nodeId: p.nodeId, clipName: p.clipName, clipStart: p.clipStart, seqId: seqId || "" }, items: [], satirlar: [],
          klip: capa(p) });
      }
      var g = gruplar[dizin[a]];
      var oge = { compIdx: p.compIdx, propIdx: p.propIdx, matchName: p.matchName, t0: c.t0, t1: c.t1, v0: p.v0, v1: p.v1,
        keys: plan.keys, degistir: !!c.kayitli };
      if (c.kayitli) oge.eski = s.kayit && Array.isArray(s.kayit.times) ? s.kayit.times.slice() : [];
      g.items.push(oge);
      g.satirlar.push(s);
    });
    return { gruplar: gruplar, atlanan: atlanan };
  }
  /*
   * KS_easeBake zaman aşımına uğrarsa ExtendScript yazmayı sürdürebilir (iptal edilemez): grubun planlanan
   * zamanları geçici kayıt olur. Geri al yalnız canlı (gerçekten yazılmış) kaydı siler; yazılmadıysa kayıt
   * canlı değildir, dokunulmaz.
   */
  function geciciKayitlar(grup, seqId) {
    var h = (grup && grup.target) || {}, c = capa(grup && grup.klip);
    return ((grup && grup.items) || []).map(function (it) {
      var r = { tur: "egri", seqId: String(seqId || h.seqId || ""), nodeId: h.nodeId, clipName: h.clipName, clipStart: h.clipStart,
        matchName: it.matchName, compIdx: it.compIdx, propIdx: it.propIdx, uclar: [it.t0, it.t1],
        times: (it.keys || []).map(function (k) { return k.t; }), kenarDegerleri: [{ t: it.t0, v: it.v0 }, { t: it.t1, v: it.v1 }] };
      // kaynak çapası (taramadan): zaman aşımındaki geçici kayıt da slip / ripple kırpmadan sonra bulunur
      if (c) { r.clipEnd = c.clipEnd; r.clipIn = c.clipIn; r.clipOut = c.clipOut; r.ters = c.ters; }
      return r;
    }).filter(function (r) { return r.times.length > 0; });
  }
  // KS_easeBake zaman aşımı: toplam anahtar başına 50 ms, en az 120 sn, en çok 10 dk
  function bakeSuresi(grup) {
    var n = 0;
    ((grup && grup.items) || []).forEach(function (it) { n += it.keys ? it.keys.length : 0; });
    return Math.max(120000, Math.min(600000, n * 50));
  }

  /* ================= varışta yaylanma (3.4 adım 14) ================= */
  /*
   * İniş anahtar karesinden sonra hedefi varış hızıyla orantılı aşıp salınarak oturma (follow-through). Matematik
   * SufloEase.yaylanPlan'da (Rebound'un overshoot'u); burada satır verisinden varışları bulma ve KS_easeBake öğeleri.
   * Kayıt: tur 'yaylan', uclar null (kayıt kendi anahtarlarıyla yaşar: kullanıcı sonraki anahtarı taşısa da Geri al
   * bulur), kenarDegerleri[0] = iniş anahtarı { t, v } (aynı inişe yeniden uygulanınca eskisinin yerine geçer).
   */
  function yaylanAyar(ham) {
    var Y = E.YAYLAN;
    ham = ham && typeof ham === "object" ? ham : {};
    function s(v, a) { var n = Number(v); return v !== null && v !== "" && isFinite(n) ? sinirla(n, a.min, a.max) : a.varsayilan; }
    return { genlik: r4(s(ham.genlik, Y.GENLIK)), frekans: r4(s(ham.frekans, Y.FREKANS)), sonum: r4(s(ham.sonum, Y.SONUM)), tum: ham.tum === true };
  }
  // Ayarın oturma süresi (sn; sonraki anahtar kare ya da klip sonu daha yakınsa uygulamada kısalır)
  function yaylanSure(ayar) { return E.autoDuration(yaylanAyar(ayar).sonum); }
  // Kaydın iniş anahtarı zamanı (kenarDegerleri[0]; yoksa NaN)
  function varisZamani(r) {
    var k = r && Array.isArray(r.kenarDegerleri) && r.kenarDegerleri[0];
    return k && sonlu(Number(k.t)) ? Number(k.t) : NaN;
  }
  // Canlı yaylanma kayıtları: { r (kaydırılmış canlı kopya), tL, son (son anahtar zamanı), idx (anahtar indisleri) }
  function canliYaylanlar(kayitlar, prop) {
    var keys = (prop && prop.keys) || [], tol = tolerans(prop && prop.fps);
    return canliKayitlar(kayitlar, prop, "yaylan").map(function (r) {
      var idx = [];
      (r.times || []).forEach(function (t) { var i = indis(keys, t, tol); if (i >= 0) idx.push(i); });
      return { r: r, tL: varisZamani(r), son: r.times && r.times.length ? r.times[r.times.length - 1] : NaN, idx: idx };
    }).filter(function (y) { return sonlu(y.tL); });
  }
  // Playhead bu kaydın penceresinde mi: [iniş, son anahtar]
  function yaylanPencerede(y, ph, tol) { return sonlu(ph) && ph >= y.tL - tol && ph <= y.son + tol; }
  /*
   * Satırın playhead'deki yaylanma kaydı (satır rozeti ve satırın Geri al'ı): playhead kaydın penceresindeyse ya da
   * kaydın inişi playhead'i saran çiftin ikinci ucuysa (Varışta yaylan'ın o satırda hedefleyeceği iniş). Yoksa null.
   */
  function yaylanSatirKaydi(kayitlar, prop, ph) {
    var tol = tolerans(prop && prop.fps), liste = canliYaylanlar(kayitlar, prop);
    for (var i = liste.length - 1; i >= 0; i--) if (yaylanPencerede(liste[i], Number(ph), tol)) return liste[i].r;
    var c = ciftBul(prop && prop.keys, ph, prop && prop.fps, uclarDan(canliKayitlar(kayitlar, prop)));
    if (!c) return null;
    for (var j = liste.length - 1; j >= 0; j--) if (Math.abs(liste[j].tL - c.t1) <= tol) return liste[j].r;
    return null;
  }
  /*
   * Varışta yaylan'ın özelliği (plan adımı 14 (4): Konum [x,y], Ölçek, Döndürme, Opaklık): 'konum' | 'olcek' | 'donme' |
   * 'opak' | ''. Opaklık host'un dilden bağımsız opak işaretiyle; Hareket parametreleri bileşen kimliği (AE.ADBE Motion) +
   * host'un Türkçe etiket tablosuyla (Premiere İngilizce / Türkçe); tablo dışı adlı (başka dildeki) Premiere'de Hareket'in
   * sabit parametre sırasıyla (Konum 0, Ölçek 1, Ölçek genişliği 2, Döndürme 4). Bağlantı noktası, titreme önleme ve efekt
   * parametreleri (Bulanıklık, Kırpma %…: sınırları bilinmez) yaylanmaz.
   */
  var YAYLAN_HAREKET = { "Konum": "konum", "Ölçek": "olcek", "Ölçek genişliği": "olcek", "Döndürme": "donme" };
  var YAYLAN_HAREKET_SIRA = ["konum", "olcek", "olcek", "", "donme"];
  function yaylanTuru(p) {
    if (!p) return "";
    if (p.opak === true) return "opak";
    if (!/^(AE\.ADBE Motion|Motion|Hareket)\//.test(String(p.matchName || ""))) return "";
    var t = Object.prototype.hasOwnProperty.call(YAYLAN_HAREKET, p.label) ? YAYLAN_HAREKET[p.label] :
      p.labelTablo ? "" : (YAYLAN_HAREKET_SIRA[Number(p.propIdx)] || "");
    // tür tutmuyorsa (beklenmedik parametre sırası) yaylanmaz: Konum [x,y], diğerleri sayı
    if (t && p.tur && (t === "konum") !== (p.tur === "xy")) return "";
    return t;
  }
  // Değer sınırları (aşım bunlara sığdırılır, kırpılmaz): Opaklık 0..100, Ölçek ≥ 0; yoksa null
  function yaylanSiniri(p) {
    var t = yaylanTuru(p);
    return t === "opak" ? { lo: 0, hi: 100 } : t === "olcek" ? { lo: 0, hi: undefined } : null;
  }
  // Satır Varışta yaylan'a uygun mu (değer okumadan, yoklamadaki önbellekle): desteklenen özellik (yaylanTuru) ve tüm
  // varışlarda ≥ 2 anahtar; yoksa playhead bir çiftin içinde ya da bir yaylanmanın penceresinde
  function yaylanUygun(prop, ph, kayitlar, tum) {
    var keys = (prop && prop.keys) || [];
    if (keys.length < 2 || !yaylanTuru(prop)) return false;
    if (tum) return true;
    if (ciftBul(keys, ph, prop.fps, uclarDan(canliKayitlar(kayitlar, prop)))) return true;
    var tol = tolerans(prop.fps);
    return canliYaylanlar(kayitlar, prop).some(function (y) { return yaylanPencerede(y, Number(ph), tol); });
  }

  function degerKopya(v) { return Array.isArray(v) ? v.slice() : v; }
  function degerGecerli(v) { return sonlu(v) || (Array.isArray(v) && v.length === 2 && sonlu(v[0]) && sonlu(v[1])); }

  /*
   * Satırın varışları (iniş anahtar kareleri). prop: tarama satırı; prop.degerler (keys ile hizalı değerler,
   * KS_easeScan degerIste) gerekir. o: { tum, ph }.
   *   Tek varış (varsayılan): playhead canlı bir yaylanmanın penceresindeyse onun inişi (yeniden uygulanır); değilse
   *   playhead'i saran çiftin ikinci ucu (canlı Eğri kaydı çifti bölmez). Yalnız o inişin eski yaylanması değişir.
   *   Tüm varışlar: hareketin durduğu ya da döndüğü her anahtar; canlı Eğri'nin iç anahtarları iniş sayılmaz, tüm canlı
   *   yaylanmalar değişir. Hareketin aynı yönde sürdüğü ara anahtarda (çıkış hızı varışın en az dörtte biri, aynı yönde)
   *   o boyut yaylanmaz; hiçbir boyut kalmazsa anahtar sessizce geçilir ('devam'), beklemeler gibi.
   * Her iki kipte canlı yaylanmaların anahtarları önceki / sonraki anahtar sayılmaz: varış hızı ve sınır kullanıcının
   * anahtarlarından ölçülür (bir yaylanmanın son anahtarının kalıntısı sonraki inişe sahte hız vermez).
   * Varış hızı önceki anahtardan (Δv/Δt, boyut başına): önceki anahtar Suflo'nun sık Eğri anahtarıysa bu, hemen önce
   * pişirilmiş eğrinin bitiş eğimidir. Sonraki anahtar (yoksa klibin sonu) sınırdır: yaylanma onu geçmez.
   * Değişecek eski yaylanmanın bir anahtarında ucu duran canlı Eğri varsa (kullanıcı iki yaylanma anahtarı arasına
   * Eğri uyguladıysa) iniş 'egriVar' ile atlanır: eski yaylanmanın silinmesi o Eğri'nin uçlarını götürür, iç anahtarları
   * sahipsiz kalırdı.
   * Döner: { varislar: [{ iL, tL, vL, tP, vP, tN, vN, sinir, hiz, eski (değişecek kayıt | null) }], kod, atlanan: [kod] }
   *   kod (hiç varış yoksa): 'ozellikDisi' (Konum / Ölçek / Döndürme / Opaklık değil) | 'degerYok' | 'disinda' |
   *   'varisYok' (iniş anahtarına hareket gelmiyor) | 'klipDisi' | 'devam' (hareket sürüyor) | 'egriVar' |
   *   'inisYok' (playhead bir yaylanmanın penceresinde ama iniş anahtarı silinmiş). Tüm varışlarda sessiz geçilenlerden
   *   en anlamlısı kod olur (klipDisi > devam > varisYok).
   */
  var DEVAM_ORAN = 0.25;
  function varislar(prop, kayitlar, o) {
    o = o || {};
    var keys = (prop && prop.keys) || [], vals = prop && prop.degerler, fps = fpsOku(prop && prop.fps), tol = tolerans(fps);
    var sonuc = { varislar: [], kod: "", atlanan: [] };
    if (!yaylanTuru(prop)) { sonuc.kod = "ozellikDisi"; return sonuc; }
    if (keys.length < 2) { sonuc.kod = "disinda"; return sonuc; }
    if (!Array.isArray(vals) || vals.length !== keys.length) { sonuc.kod = "degerYok"; return sonuc; }
    var ph = Number(o.ph), tum = o.tum === true;
    var canliY = canliYaylanlar(kayitlar, prop);
    var egriUclari = uclarDan(canliKayitlar(kayitlar, prop));
    var egriIc = {};
    egriUclari.forEach(function (u) { keys.forEach(function (t, i) { if (t > u[0] + tol && t < u[1] - tol) egriIc[i] = 1; }); });
    // tüm canlı yaylanmaların anahtarları: iniş, önceki ve sonraki anahtar sayılmaz (iki kipte de)
    var haric = {};
    canliY.forEach(function (y) { y.idx.forEach(function (i) { haric[i] = 1; }); });
    // bir yaylanma penceresinin içine (iki yaylanma anahtarı arasına) uygulanmış Eğri'nin iç anahtarları da öyle
    egriUclari.forEach(function (u) {
      if (!(haric[indis(keys, u[0], tol)] || haric[indis(keys, u[1], tol)])) return;
      keys.forEach(function (t, i) { if (t > u[0] + tol && t < u[1] - tol) haric[i] = 1; });
    });
    var degisen = [], adaylar = [];
    if (tum) {
      degisen = canliY;
      keys.forEach(function (t, i) { if (!haric[i] && !egriIc[i]) adaylar.push(i); });
    } else {
      var pen = null;
      for (var a = canliY.length - 1; a >= 0 && !pen; a--) if (yaylanPencerede(canliY[a], ph, tol)) pen = canliY[a];
      var iL = -1;
      if (pen) {
        iL = indis(keys, pen.tL, tol);
        // iniş anahtarı silinmiş, yaylanma anahtarları duruyor: kendi anahtarlarının üstüne yaylanma yazılmaz
        if (iL < 0) { sonuc.kod = "inisYok"; return sonuc; }
      } else {
        var c = ciftBul(keys, ph, fps, egriUclari);
        if (c) iL = c.i1;
      }
      if (iL < 0) { sonuc.kod = "disinda"; return sonuc; }
      // iniş bir yaylanmanın kendi anahtarı olamaz (ör. playhead son yaylanma anahtarının üstünde)
      if (haric[iL]) { sonuc.kod = "disinda"; return sonuc; }
      canliY.forEach(function (y) { if (Math.abs(y.tL - keys[iL]) <= tol) degisen.push(y); });
      adaylar = [iL];
    }
    var bas = sonlu(prop.clipStart) ? prop.clipStart : -Infinity, son = sonlu(prop.clipEnd) ? prop.clipEnd : Infinity;
    // Tüm varışlarda varış olmayan anahtar (bekleme, süren hareket), klibin dışındaki anahtar sessizce geçilir; tek varışta
    // nedeni söylenir. Değer okunamadıysa ve Eğri engeli her iki kipte söylenir
    var sessiz = {};
    function atla(kod) { if (!tum || kod === "degerYok" || kod === "egriVar") sonuc.atlanan.push(kod); else sessiz[kod] = 1; }
    function boyutlar(v) { return Array.isArray(v) ? v : [v]; }
    adaylar.forEach(function (iL2) {
      var tL = keys[iL2];
      var eski = null;
      degisen.forEach(function (y) { if (Math.abs(y.tL - tL) <= tol) eski = y; });
      if (eski && egriUclari.some(function (u) {
        return (eski.r.times || []).some(function (t) { return Math.abs(u[0] - t) <= tol || Math.abs(u[1] - t) <= tol; });
      })) { atla("egriVar"); return; }
      var iP = iL2 - 1;
      while (iP >= 0 && haric[iP]) iP--;
      var iN = iL2 + 1;
      while (iN < keys.length && haric[iN]) iN++;
      var disari = tL < bas - tol || tL >= son - tol;
      // tek varışta klibin dışındaki iniş hemen söylenir; tüm varışlarda yalnız gerçek bir varışsa 'klipDisi' sayılır
      if (disari && !tum) { atla("klipDisi"); return; }
      if (iP < 0) { atla(disari ? "klipDisi" : "varisYok"); return; }
      var vL = vals[iL2], vP = vals[iP];
      if (!degerGecerli(vL) || !degerGecerli(vP) || Array.isArray(vL) !== Array.isArray(vP)) { atla(disari ? "klipDisi" : "degerYok"); return; }
      var dt = tL - keys[iP];
      if (!(dt > 1e-9)) { atla("varisYok"); return; }
      var hizlar = boyutlar(vL).map(function (x, d) { return (x - boyutlar(vP)[d]) / dt; });
      // hareket gelmiyor: değer değişimi değerin milyonda birinden küçük
      var olcu = Math.max(1, Math.max.apply(null, boyutlar(vL).map(function (x) { return Math.abs(x); })));
      function hareketli(h, sure) { return Math.abs(h * sure) > 1e-6 * olcu; }
      if (!hizlar.some(function (h) { return hareketli(h, dt); })) { atla("varisYok"); return; }
      var tN = iN < keys.length ? keys[iN] : null, vN = tN === null ? null : vals[iN];
      if (tN !== null && !degerGecerli(vN)) { atla(disari ? "klipDisi" : "degerYok"); return; }
      if (disari) { atla("klipDisi"); return; }
      if (tum && tN !== null && Array.isArray(vN) === Array.isArray(vL)) {
        // süren hareket: çıkış aynı yönde ve varış hızının en az dörtte biri olan boyut yaylanmaz
        var dtN = tN - tL;
        hizlar = hizlar.map(function (h, d) {
          var g = dtN > 1e-9 ? (boyutlar(vN)[d] - boyutlar(vL)[d]) / dtN : 0;
          return h * g > 0 && hareketli(g, dtN) && Math.abs(g) >= DEVAM_ORAN * Math.abs(h) ? 0 : h;
        });
        if (!hizlar.some(function (h) { return hareketli(h, dt); })) { atla("devam"); return; }
      }
      sonuc.varislar.push({ iL: iL2, tL: tL, vL: degerKopya(vL), tP: keys[iP], vP: degerKopya(vP), tN: tN, vN: degerKopya(vN),
        sinir: tN === null ? son : Math.min(tN, son), hiz: Array.isArray(vL) ? hizlar : hizlar[0], eski: eski ? eski.r : null, tum: tum });
    });
    if (!sonuc.varislar.length) {
      sonuc.kod = sonuc.atlanan.length ? sonuc.atlanan[0] : sessiz.klipDisi ? "klipDisi" : sessiz.devam ? "devam" : "varisYok";
    }
    return sonuc;
  }

  /*
   * Seçili satırlardan KS_easeBake çağrıları (klip başına; KS_easeBake bir çağrıda en çok 40 öğe ve 6000 anahtar alır,
   * fazlası aynı klibin sonraki çağrısına geçer). satirlar: [{ prop, varis: varislar() sonucu }]; ayar: yaylanAyar.
   * Her varış bir öğe: { tur: 'yaylan', t0 (iniş), v0, t1 / v1 (sonraki anahtar; yoksa null), sinir, keys (seyrek: tepe /
   * çukurlar, host Bezier (5) yazar), yogunKeys (Bezier yazılamazsa 2 karede bir), degistir + eski (aynı inişteki canlı
   * yaylanmanın zamanları: host önce onları siler) }. Opaklık (0..100) ve Ölçek (≥ 0) aşımı sınıra sığdırılır; iniş
   * sınırdaysa ve aşım o yöndeyse (sönen Opaklık, 0'a küçülen Ölçek) 'sinir'.
   * Tüm varışlarda yer olmayan ('yer') ya da sınırdaki ('sinir') iniş sessizce geçilir; satırın hiçbir varışı yazılamıyorsa
   * nedeni yine söylenir.
   * Döner: { gruplar: [{ target, items, satirlar: [{ prop, varis }], klip }], atlanan: [{ prop, kod }] }.
   */
  var YAYLAN_GRUP_OGE = 40, YAYLAN_GRUP_YAZIM = 6000;   // KS_EASE_MAX_PROPS / KS_EASE_MAX_WRITE
  function yaylanGruplari(satirlar, ayar, seqId) {
    var a = yaylanAyar(ayar), gruplar = [], yazimlar = [], dizin = {}, atlanan = [];
    (satirlar || []).forEach(function (s) {
      var p = s.prop, v = s.varis || {};
      (v.atlanan || []).forEach(function (k) { atlanan.push({ prop: p, kod: k }); });
      if (!v.varislar || !v.varislar.length) { if (!(v.atlanan && v.atlanan.length)) atlanan.push({ prop: p, kod: v.kod || "varisYok" }); return; }
      var sinirlar = yaylanSiniri(p), planlanan = 0, soylenen = 0, sessiz = "";
      v.varislar.forEach(function (va) {
        var temel = { tL: va.tL, vL: va.vL, hiz: va.hiz, genlik: a.genlik, frekans: a.frekans, sonum: a.sonum, sinir: va.sinir, fps: p.fps,
          tN: va.tN === null ? undefined : va.tN, vN: va.tN === null ? null : va.vN,
          clampMin: sinirlar ? sinirlar.lo : undefined, clampMax: sinirlar ? sinirlar.hi : undefined, sinirSigdir: !!sinirlar };
        var seyrek = E.yaylanPlan(temel);
        temel.yogun = true;
        var yogun = E.yaylanPlan(temel);
        if (seyrek.hata || yogun.hata) {
          // tüm varışlarda yeri olmayan (hemen ardından Eğri başlıyor, anahtarlar çok yakın) ya da sınırdaki iniş sessizce geçilir
          var kod = seyrek.hata || yogun.hata;
          if (va.tum && (kod === "yer" || kod === "sinir")) { if (!sessiz) sessiz = kod; }
          else { atlanan.push({ prop: p, kod: kod }); soylenen++; }
          return;
        }
        var oge = { tur: "yaylan", compIdx: p.compIdx, propIdx: p.propIdx, matchName: p.matchName, t0: va.tL, v0: degerKopya(va.vL),
          t1: va.tN, v1: va.tN === null ? null : degerKopya(va.vN), sinir: va.sinir, keys: seyrek.keys, yogunKeys: yogun.keys, degistir: !!va.eski };
        if (va.eski) oge.eski = (va.eski.times || []).slice();
        var yazim = Math.max(seyrek.keys.length, yogun.keys.length);
        var anahtar = String(p.nodeId);
        var gi = Object.prototype.hasOwnProperty.call(dizin, anahtar) ? dizin[anahtar] : -1;
        if (gi < 0 || gruplar[gi].items.length >= YAYLAN_GRUP_OGE || yazimlar[gi] + yazim > YAYLAN_GRUP_YAZIM) {
          gi = dizin[anahtar] = gruplar.length;
          gruplar.push({ target: { nodeId: p.nodeId, clipName: p.clipName, clipStart: p.clipStart, seqId: seqId || "" }, items: [], satirlar: [], klip: capa(p) });
          yazimlar.push(0);
        }
        var g = gruplar[gi];
        g.items.push(oge);
        yazimlar[gi] += yazim;
        g.satirlar.push({ prop: p, varis: va, bezier: p.kfInterp !== false });
        planlanan++;
      });
      // satırın hiçbir varışı yazılmayacak ve nedeni söylenmediyse (hepsi sessizce geçildi) sessiz neden söylenir
      if (!planlanan && !soylenen && sessiz) atlanan.push({ prop: p, kod: sessiz });
    });
    return { gruplar: gruplar, atlanan: atlanan };
  }
  // KS_easeBake zaman aşımında yaylanma öğelerinin geçici kayıtları (taramanın kfInterp'ine göre seyrek ya da sık plan)
  function yaylanGeciciKayitlar(grup, seqId) {
    var h = (grup && grup.target) || {}, c = capa(grup && grup.klip);
    return ((grup && grup.items) || []).map(function (it, i) {
      var sat = grup.satirlar && grup.satirlar[i];
      var liste = sat && sat.bezier === false ? it.yogunKeys : it.keys;
      var r = { tur: "yaylan", seqId: String(seqId || h.seqId || ""), nodeId: h.nodeId, clipName: h.clipName, clipStart: h.clipStart,
        matchName: it.matchName, compIdx: it.compIdx, propIdx: it.propIdx, uclar: null,
        times: (liste || []).map(function (k) { return k.t; }), kenarDegerleri: [{ t: it.t0, v: it.v0 }] };
      if (c) { r.clipEnd = c.clipEnd; r.clipIn = c.clipIn; r.clipOut = c.clipOut; r.ters = c.ters; }
      return r;
    }).filter(function (r) { return r.times.length > 0; });
  }
  // Yeni yaylanma kaydıyla aynı inişteki eskiler (aynı satır; inişler kaynak çapasıyla ya da klip başlangıcıyla
  // karşılaştırılır): yeni yaylanma onların yerine geçer
  function yaylanCakisanlar(kayitlar, yeni) {
    var tY = varisZamani(yeni);
    if (!yeni || !sonlu(tY)) return [];
    var tol = tolerans(yeni.fps);
    return (Array.isArray(kayitlar) ? kayitlar : []).filter(function (r) {
      if (!r || r.id === yeni.id || r.tur !== "yaylan") return false;
      if (String(r.nodeId) !== String(yeni.nodeId) || r.compIdx !== yeni.compIdx || r.propIdx !== yeni.propIdx) return false;
      var tR = varisZamani(r);
      if (!sonlu(tR)) return true;
      var d = capaKaymasi(r, yeni, tol);
      if (!sonlu(d)) d = sonlu(r.clipStart) && sonlu(yeni.clipStart) ? yeni.clipStart - r.clipStart : 0;
      return Math.abs(tR + d - tY) <= tol;
    });
  }
  /*
   * Ayar önizlemesi (Premiere'e gitmez): birim yolu 0,5 sn'de doğrusal gelen bir değerin inişten sonraki yaylanması.
   * w × h SVG yolu; kesikli hedef çizgisi için hedefY. Döner: { yol, hedefY, sure, tepe (ilk aşım, yolun oranı) }.
   */
  function yaylanOnizleme(ayar, w, h) {
    var a = yaylanAyar(ayar), W = Number(w) || 240, H = Number(h) || 80, pad = 6;
    var gelis = 0.5, sure = E.autoDuration(a.sonum), toplam = gelis + sure;
    var s = E.dampedSine(a.frekans, a.sonum), v = 1 / gelis;
    var tepe = 0;
    E.extremaTimes(a.frekans, a.sonum, sure).slice(0, 1).forEach(function (t) { tepe = v * a.genlik * s(t); });
    var ust = 1 + Math.max(0.05, tepe), alt = -0.05;
    function y(deg) { return pad + (ust - deg) / (ust - alt) * (H - 2 * pad); }
    function x(t) { return pad + t / toplam * (W - 2 * pad); }
    var adet = 120, yol = [];
    for (var i = 0; i <= adet; i++) {
      var t = i / adet * toplam;
      var deg = t <= gelis ? t / gelis : 1 + v * a.genlik * s(t - gelis);
      yol.push((i ? "L" : "M") + n2(x(t)) + " " + n2(y(deg)));
    }
    return { yol: yol.join(" "), hedefY: n2(y(1)), varisX: n2(x(gelis)), sure: sure, tepe: tepe };
  }

  /* ================= gezinme ================= */
  /*
   * Sonraki çift: playhead'den sonra başlayan en yakın çiftin başı + 0,25 kare (seçili satırlarda); yoksa ilk çift.
   * props: [{ keys, uclar? }] — uclar o satırın canlı Suflo kayıtlarının [t0, t1] aralıkları: kaydın iç
   * anahtarları çift başı sayılmaz (Suflo'nun sık anahtarları kare kare gezilmez; kayıt tek çifttir).
   */
  function sonrakiCift(props, ph, fps) {
    var tol = tolerans(fps), en = null, ilk = null;
    (props || []).forEach(function (p) {
      var k = p.keys || [], u = Array.isArray(p.uclar) ? p.uclar : [];
      function icte(t) { return u.some(function (x) { return x && t > Number(x[0]) + tol && t < Number(x[1]) - tol; }); }
      for (var i = 0; i < k.length - 1; i++) {
        if (icte(k[i])) continue;
        if (ilk === null || k[i] < ilk) ilk = k[i];
        if (k[i] > ph + tol && (en === null || k[i] < en)) { en = k[i]; break; }
      }
    });
    var hedef = en !== null ? en : ilk;
    return hedef === null ? null : r4(hedef + TOL_KARE / fpsOku(fps));
  }
  // Premiere'de kaba önizleme: t0'dan t1'e saniyede en çok 12 adım (kareye oturur), sonda t1
  function onizlemeAdimlari(t0, t1, fps, hz) {
    fps = fpsOku(fps);
    hz = Math.min(ONIZLEME_HZ, Math.max(1, Number(hz) || ONIZLEME_HZ));
    if (!(sonlu(t0) && sonlu(t1) && t1 > t0)) return [];
    var kareAdim = Math.max(1, Math.ceil(fps / hz));
    var out = [], f0 = Math.round(t0 * fps), f1 = Math.round(t1 * fps);
    for (var f = f0; f < f1 && out.length < 600; f += kareAdim) out.push(r4(f / fps));
    out.push(r4(t1));
    return out;
  }

  /* ================= kısayollar ================= */
  function metinAlani(t) {
    if (!t) return false;
    var tag = String(t.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") {
      var tur = String(t.type || "text").toLowerCase();
      return ["checkbox", "radio", "button", "submit", "range"].indexOf(tur) === -1;
    }
    return t.isContentEditable === true;
  }
  // Odak Varışta yaylan kartında mı (kaydırıcılar, Tüm varışlar kutusu): orada Enter yaylanmayı uygular, Eğri'yi değil
  function yaylanAlaninda(t) {
    try { return !!(t && typeof t.closest === "function" && t.closest("#egri-yaylan")); } catch (e) { return false; }
  }
  /*
   * Odak bir metin alanında değilken: Enter uygula (Varışta yaylan kartında yaylanmayı uygula: { eylem: 'yaylan' }),
   * U son uygulamayı geri al, F çevir, I ters çevir, V görünüm (Değer / Hız), 1–9 önayar, Delete / Backspace seçili
   * noktayı sil. Ctrl / Cmd / Alt'lı tuşlar Premiere'e kalır. Döner: { eylem, n } | null.
   */
  function kisayol(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || metinAlani(e.target)) return null;
    var k = String(e.key || "");
    if (k === "Enter") {
      if (e.target && String(e.target.tagName || "").toUpperCase() === "BUTTON") return null;
      return { eylem: yaylanAlaninda(e.target) ? "yaylan" : "uygula" };
    }
    if (k === "Delete" || k === "Backspace") return { eylem: "sil" };
    var l = k.length === 1 ? k.toLowerCase() : "";
    if (l === "u") return { eylem: "geriAl" };
    if (l === "f") return { eylem: "cevir" };
    if (l === "i") return { eylem: "tersCevir" };
    if (l === "v") return { eylem: "gorunum" };
    if (/^[1-9]$/.test(k)) return { eylem: "onayar", n: Number(k) };
    return null;
  }
  /*
   * CEP: odak metin alanında değilken basılan tuşlar Premiere'e de gider (F eşleşen kare, I giriş noktası,
   * V seçim aracı, Delete seçili klibi siler!). Eğri sekmesi açıkken bu tuşlar panelde tutulur
   * (window.__adobe_cep__.registerKeyEventsInterest). Kodlar işletim sisteminin sanal tuş kodları:
   * Windows VK (Enter 13, U 85, F 70, I 73, V 86, 1–9 49–57, Delete 46, Backspace 8), macOS (Return 36,
   * U 32, F 3, I 34, V 9, 1–9 18 19 20 21 23 22 26 28 25, Delete 117, Backspace 51). Yalnız değiştiricisiz.
   */
  var TUSLAR = { win: [13, 85, 70, 73, 86, 49, 50, 51, 52, 53, 54, 55, 56, 57, 46, 8],
    mac: [36, 32, 3, 34, 9, 18, 19, 20, 21, 23, 22, 26, 28, 25, 117, 51] };
  function tusIlgisi(mac) {
    return JSON.stringify(TUSLAR[mac ? "mac" : "win"].map(function (k) { return { keyCode: k }; }));
  }

  /* ================= kullanıcı önayarları ================= */
  function onayarlar(ham) {
    var out = [], idler = {};
    (Array.isArray(ham) ? ham : []).forEach(function (o) {
      if (out.length >= EN_COK_ONAYAR || !o || typeof o !== "object") return;
      var c = E.normalize(o.curve);
      var id = typeof o.id === "string" && /^k[0-9a-z]{1,16}$/.test(o.id) ? o.id : "";
      var ad = typeof o.ad === "string" ? o.ad.replace(/[\u0000-\u001f]/g, " ").replace(/^\s+|\s+$/g, "").slice(0, AD_SINIR) : "";
      if (!c || !id || !ad || idler[id]) return;
      idler[id] = 1;
      out.push({ id: id, ad: ad, curve: c });
    });
    return out;
  }
  function onayarEkle(liste, ad, egri, simdi) {
    var temiz = onayarlar(liste);
    var c = E.normalize(egri);
    if (!c) return { ok: false, liste: temiz, kod: "egri" };
    if (temiz.length >= EN_COK_ONAYAR) return { ok: false, liste: temiz, kod: "dolu" };
    var t = sonlu(simdi) ? simdi : 0;
    var id = "k" + Math.floor(t).toString(36).slice(-10) + temiz.length.toString(36);
    while (temiz.some(function (o) { return o.id === id; })) id += "x";
    var yeni = onayarlar(temiz.concat([{ id: id.slice(0, 17), ad: String(ad || "").slice(0, AD_SINIR) || "Benim eğrim " + (temiz.length + 1), curve: c }]));
    return { ok: yeni.length === temiz.length + 1, liste: yeni, id: id.slice(0, 17) };
  }
  function onayarSil(liste, id) { return onayarlar(liste).filter(function (o) { return o.id !== id; }); }
  function onayarAdi(liste) { return "Benim eğrim " + (onayarlar(liste).length + 1); }

  /* ================= düzenleyici geometrisi ================= */
  var GEN = ED.W - 2 * ED.PAD, YUK = ED.H - 2 * ED.PAD;
  function ekranX(x) { return ED.PAD + x * GEN; }
  function ekranY(y) { return ED.PAD + (ED.YMAX - y) / (ED.YMAX - ED.YMIN) * YUK; }
  function egriX(px) { return sinirla((px - ED.PAD) / GEN, 0, 1); }
  function egriY(py) { return sinirla(ED.YMAX - (py - ED.PAD) / YUK * (ED.YMAX - ED.YMIN), ED.YMIN, ED.YMAX); }
  function yapis(v, shift) { return shift ? Math.round(v / ED.YAPIS) * ED.YAPIS : v; }
  function n2(v) { return Math.round(v * 100) / 100; }

  // Değer görünümü: eğrinin SVG yolu (ekranda y [-0,5, 1,5]; dışı kırpılır)
  function degerYolu(egri, adet) {
    var pts = E.samplePoints(egri, adet || 120);
    return pts.map(function (p, i) {
      return (i ? "L" : "M") + n2(ekranX(p.x)) + " " + n2(ekranY(sinirla(p.y, ED.YMIN - 0.1, ED.YMAX + 0.1)));
    }).join(" ");
  }
  // Hız görünümü: normalize hız (ortalama 1) eğrisi; ölçek SufloEase.speedRange ile (en az 0..1)
  function hizYolu(egri, adet) {
    var pts = E.sampleSpeed(egri, adet || 120), rg = E.speedRange(egri, adet || 120);
    var lo = Math.min(0, rg.min), hi = Math.max(1, rg.max);
    if (hi - lo < 1e-6) hi = lo + 1;
    return pts.map(function (p, i) {
      var y = (p.s - lo) / (hi - lo);   // 0..1 → ekranda 0..1 bandı
      return (i ? "L" : "M") + n2(ekranX(sinirla(p.x, 0, 1))) + " " + n2(ekranY(sinirla(y, 0, 1)));
    }).join(" ");
  }
  // Küçük resim (önayar kartı): yol + kendi y aralığı
  function kucukYol(egri, w, h) {
    var pts = E.samplePoints(egri, 40), rg = E.range(egri, 80), p = 3;
    var lo = rg.min, hi = rg.max;
    return pts.map(function (q, i) {
      return (i ? "L" : "M") + n2(p + q.x * (w - 2 * p)) + " " + n2(p + (hi - q.y) / (hi - lo) * (h - 2 * p));
    }).join(" ");
  }

  // Düzenlenebilir mi: bezier ve çok noktalı eğrilerin tutamaçları var; Penner / yay hazır eğrileri tutamaçsız
  function duzenlenebilir(egri) { var c = E.normalize(egri); return !!c && (c.type === "bezier" || c.type === "multi"); }

  // Tutamaçlar (ekran koordinatında): [{ hedef, x, y, cx, cy (bağlı olduğu nokta), tur: 'tutamac'|'nokta' }]
  function tutamaclar(egri) {
    var c = E.normalize(egri), out = [];
    if (!c) return out;
    if (c.type === "bezier") {
      out.push({ hedef: { tur: "p1" }, x: ekranX(c.x1), y: ekranY(c.y1), cx: ekranX(0), cy: ekranY(0), tur: "tutamac" });
      out.push({ hedef: { tur: "p2" }, x: ekranX(c.x2), y: ekranY(c.y2), cx: ekranX(1), cy: ekranY(1), tur: "tutamac" });
      return out;
    }
    if (c.type !== "multi") return out;
    c.pts.forEach(function (p, i) {
      if (i > 0) out.push({ hedef: { tur: "giris", i: i }, x: ekranX(p.ix), y: ekranY(p.iy), cx: ekranX(p.x), cy: ekranY(p.y), tur: "tutamac" });
      if (i < c.pts.length - 1) out.push({ hedef: { tur: "cikis", i: i }, x: ekranX(p.ox), y: ekranY(p.oy), cx: ekranX(p.x), cy: ekranY(p.y), tur: "tutamac" });
      if (i > 0 && i < c.pts.length - 1) out.push({ hedef: { tur: "nokta", i: i }, x: ekranX(p.x), y: ekranY(p.y), cx: ekranX(p.x), cy: ekranY(p.y), tur: "nokta", smooth: !!p.smooth });
    });
    return out;
  }

  function uzunluk(dx, dy) { return Math.sqrt(dx * dx + dy * dy); }

  /*
   * Sürükleme: hedef ({ tur: 'p1'|'p2' } bezier; { tur: 'nokta'|'giris'|'cikis', i } çok noktalı) eğri
   * koordinatındaki (x, y)'ye taşınır. Shift: 0,05'e yapışır. Alt: tutamaçlar ayrılır (smooth kalkar);
   * yumuşak noktada tutamaç sürüklenince karşı tutamaç aynı doğrultuda kalır (uzunluğu korunur).
   * y düzenleyicide [-0,5, 1,5]. Döner: yeni (normalize) eğri; düzenlenemezse null.
   */
  function surukle(egri, hedef, x, y, o) {
    o = o || {};
    var c = E.normalize(egri);
    if (!c || !hedef || !sonlu(x) || !sonlu(y)) return null;
    x = sinirla(yapis(x, o.shift), 0, 1);
    y = sinirla(yapis(y, o.shift), ED.YMIN, ED.YMAX);
    if (c.type === "bezier") {
      if (hedef.tur === "p1") { c.x1 = x; c.y1 = y; }
      else if (hedef.tur === "p2") { c.x2 = x; c.y2 = y; }
      else return null;
      return E.normalize(c);
    }
    if (c.type !== "multi") return null;
    var p = c.pts, i = hedef.i;
    if (!(i >= 0 && i < p.length)) return null;
    var q = p[i];
    if (hedef.tur === "nokta") {
      if (i === 0 || i === p.length - 1) return null;
      var lo = p[i - 1].x + E.LIMITS.MIN_GAP, hi = p[i + 1].x - E.LIMITS.MIN_GAP;
      if (hi < lo) return null;
      var nx = sinirla(x, lo, hi), dx = nx - q.x, dy = y - q.y;
      q.x = nx; q.y = y; q.ix += dx; q.iy += dy; q.ox += dx; q.oy += dy;
      return E.normalize(c);
    }
    if (hedef.tur !== "giris" && hedef.tur !== "cikis") return null;
    if (hedef.tur === "giris" && i === 0) return null;
    if (hedef.tur === "cikis" && i === p.length - 1) return null;
    if (o.alt) q.smooth = false;
    if (hedef.tur === "giris") { q.ix = x; q.iy = y; } else { q.ox = x; q.oy = y; }
    if (q.smooth && i > 0 && i < p.length - 1) {
      // karşı tutamaç: aynı doğrultu, ters yön, kendi uzunluğu
      var vx = (hedef.tur === "giris" ? q.ix : q.ox) - q.x, vy = (hedef.tur === "giris" ? q.iy : q.oy) - q.y;
      var L = uzunluk(vx, vy);
      if (L > 1e-9) {
        var kx = hedef.tur === "giris" ? q.ox : q.ix, ky = hedef.tur === "giris" ? q.oy : q.iy;
        var M = uzunluk(kx - q.x, ky - q.y) || L;
        var ax = q.x - vx / L * M, ay = q.y - vy / L * M;
        if (hedef.tur === "giris") { q.ox = ax; q.oy = ay; } else { q.ix = ax; q.iy = ay; }
      }
    }
    return E.normalize(c);
  }

  // Çift tık: x'te nokta (de Casteljau; şekil değişmez). Bezier önce iki noktalı çok noktalı eğriye döner.
  function noktaEkle(egri, x) { return E.split(egri, x); }

  // Ara noktayı sil; iki nokta kalırsa yine bezier (cubic-bezier metni ve sayı alanları geri gelsin)
  function noktaSil(egri, i) {
    var c = E.normalize(egri);
    if (!c || c.type !== "multi" || !(i > 0 && i < c.pts.length - 1)) return null;
    c.pts.splice(i, 1);
    var m = E.normalize(c);
    if (m && m.pts.length === 2) return E.normalize({ type: "bezier", x1: m.pts[0].ox, y1: m.pts[0].oy, x2: m.pts[1].ix, y2: m.pts[1].iy });
    return m;
  }

  // En yakın sürüklenebilir hedef (ekran koordinatı, yarıçap px)
  function enYakin(egri, px, py, yaricap) {
    var en = null, d0 = sonlu(yaricap) ? yaricap : 9;
    tutamaclar(egri).forEach(function (t) {
      var d = uzunluk(t.x - px, t.y - py);
      // nokta tutamaçla üst üste binerse nokta kazanır (önce noktayı taşımak beklenir)
      if (d <= d0 + (t.tur === "nokta" ? 0.5 : 0)) { d0 = d; en = t; }
    });
    return en;
  }

  /*
   * Önizleme sahnesi (Rebound'un canlı sahne fikri, Suflo'nun küçük uygulaması): kare soldan sağa
   * gider ve büyür; gidiş 1100 ms, sonda 450 ms bekler, başa döner. t: ms. Döner: { e, x (0..1), olcek }.
   */
  var SAHNE = { GIDIS: 1100, BEKLE: 450 };
  function sahneKaresi(egri, t) {
    var dongu = SAHNE.GIDIS + SAHNE.BEKLE;
    var m = ((Number(t) || 0) % dongu + dongu) % dongu;
    var p = Math.min(1, m / SAHNE.GIDIS);
    var e = E.toFunction(egri)(p);
    return { e: e, x: e, olcek: 0.6 + 0.5 * e };
  }

  /* ================= host kodları → metin ================= */
  var NEDEN = {
    disinda: "playhead çiftin dışında",
    tekKare: "1 kare: yumuşatılacak ara yok",
    bos: "1 kare: yumuşatılacak ara yok",
    degerYok: "uç değerleri okunamadı",
    ozellik: "efekt sırası değişmiş",
    ucYok: "uçtaki anahtar kare yok",
    degisti: "uç anahtar karenin değeri değişmiş",
    icAnahtar: "arada başka anahtar kare var",
    gecersiz: "geçersiz plan",
    cokFazla: "çok fazla anahtar kare",
    yazilamadi: "Premiere anahtar kareleri yazmadı",
    eksik: "bazı anahtar kareler yazılamadı",
    // KS_easeBake'in klip başına (grup) reddi: satırda nedeniyle
    klipYok: "klip bulunamadı (silinmiş ya da değişmiş olabilir)",
    klipTasindi: "klip taşınmış; liste yenilendi, yeniden dene",
    sekans: "eğri başka bir sekans için hazırlanmıştı; liste yenilendi, yeniden dene",
    sekansYok: "aktif sekans yok",
    zamanAsimi: "Premiere yanıt vermedi; yazılmış olabilecek anahtar kareler kayda alındı, Geri al ile kaldırılabilir",
    // Varışta yaylan (3.4 adım 14)
    varisYok: "iniş anahtar karesine hareket gelmiyor",
    hiz: "iniş anahtar karesine hareket gelmiyor",
    klipDisi: "iniş anahtar karesi klibin görünen kısmının dışında",
    yer: "sonraki anahtar kareye ya da klibin sonuna 2 kareden az yer var",
    aralik: "geçersiz plan",
    deger: "geçersiz plan",
    fps: "geçersiz plan",
    sonrakiYok: "sonraki anahtar kare yerinde değil",
    inisYok: "iniş anahtar karesi silinmiş; önce yaylanmayı Geri al ile kaldır",
    ozellikDisi: "yalnız Konum, Ölçek, Döndürme ve Opaklık yaylanır",
    devam: "hareket bu anahtar karede durmuyor, sürüyor",
    egriVar: "bu yaylanmanın anahtar karelerine Suflo eğrisi uygulanmış; önce o eğriyi Geri al ile kaldır",
    sinir: "iniş değeri sınırda (Opaklık 0 ya da 100, Ölçek 0); aşım sığmıyor"
  };
  var HATA = {
    sekansYok: "Aktif sekans yok. Bir sekans aç.",
    sekans: "Eğri başka bir sekans için hazırlanmıştı. Liste yenilendi; yeniden dene.",
    klipYok: "Klip bulunamadı (silinmiş ya da değişmiş olabilir). Liste yenilendi.",
    klipTasindi: "Klip taşınmış. Liste yenilendi; yeniden dene.",
    gecersiz: "Eğri planı geçersiz.",
    cokFazla: "Çok fazla anahtar kare. Anahtar sıklığını 2 ya da 4 karede bire çıkar."
  };
  function nedenMetni(kod) { return NEDEN[kod] || "uygulanamadı"; }
  function hataMetni(kod) { return HATA[kod] || ""; }

  return {
    YOKLAMA_MS: YOKLAMA_MS, ONIZLEME_HZ: ONIZLEME_HZ, YOGUNLUKLAR: YOGUNLUKLAR.slice(), EN_COK_ONAYAR: EN_COK_ONAYAR, ED: ED, SAHNE: SAHNE,
    yoklamaUygun: yoklamaUygun, yoklamaKarari: yoklamaKarari,
    ciftBul: ciftBul, kareSayisi: kareSayisi, sayi: sayi, aralikMetni: aralikMetni, satirDurumu: satirDurumu, satirAnahtari: satirAnahtari,
    satirKayitlari: satirKayitlari, canliKayitlar: canliKayitlar, canliHali: canliHali, kaydir: kaydir, uclarDan: uclarDan, ipuclari: ipuclari,
    satirKaydi: satirKaydi, cakisanlar: cakisanlar, capaKaymasi: capaKaymasi,
    bakeGruplari: bakeGruplari, geciciKayitlar: geciciKayitlar, bakeSuresi: bakeSuresi, sonrakiCift: sonrakiCift, onizlemeAdimlari: onizlemeAdimlari,
    yaylanAyar: yaylanAyar, yaylanSure: yaylanSure, varisZamani: varisZamani, canliYaylanlar: canliYaylanlar, yaylanSatirKaydi: yaylanSatirKaydi,
    yaylanUygun: yaylanUygun, varislar: varislar, yaylanGruplari: yaylanGruplari, yaylanGeciciKayitlar: yaylanGeciciKayitlar,
    yaylanCakisanlar: yaylanCakisanlar, yaylanOnizleme: yaylanOnizleme, yaylanTuru: yaylanTuru, yaylanSiniri: yaylanSiniri, yaylanAlaninda: yaylanAlaninda,
    kisayol: kisayol, metinAlani: metinAlani, tusIlgisi: tusIlgisi,
    onayarlar: onayarlar, onayarEkle: onayarEkle, onayarSil: onayarSil, onayarAdi: onayarAdi,
    ekranX: ekranX, ekranY: ekranY, egriX: egriX, egriY: egriY, yapis: yapis,
    degerYolu: degerYolu, hizYolu: hizYolu, kucukYol: kucukYol, duzenlenebilir: duzenlenebilir, tutamaclar: tutamaclar,
    surukle: surukle, noktaEkle: noktaEkle, noktaSil: noktaSil, enYakin: enYakin, sahneKaresi: sahneKaresi,
    nedenMetni: nedenMetni, hataMetni: hataMetni, NEDEN: NEDEN, HATA: HATA
  };
});
