/*
 * Suflo — Geçiş, Zoom ve Hareket önayarlarında özel eğri (3.4, plan adım 12) — saf modül
 * window.SufloEgriSecim · module.exports  (DOM'a, Premiere'e, depoya dokunmaz)
 *
 * Bu araçların anahtar kareleri bugün Premiere'in kendi Bezier yumuşatmasıyla (setInterpolationTypeAtKey 5) akar.
 * Kullanıcı bir eğri seçerse panel her anahtar parçasını SufloEase.bakePlan ile sık anahtar karelere çevirir
 * (pişirir): her kare, 1 sn'den uzun parçada 2 karede bir. Host bu "yoğun" yazımda 5'i yazmaz; Premiere izin
 * veriyorsa (kfInterp) anahtarları doğrusal (0) yapar. Premiere'in betikleri Bezier tutamaçlarını yazamaz.
 *
 * ease alanı (metin):
 *   'auto'                      Suflo'nun bugünkü eğrisi; çıktı bayt bayt aynı (varsayılan; boş da 'auto')
 *   hazır eğri kimliği          'yumusak', 'sert-cikis', 'ziplama'… (SufloEase.BUILTINS)
 *   'cubic-bezier(a, b, c, d)'  CSS metni (SufloEase.fromCss; sıkı ayrıştırıcı)
 *   'SFC1.…'                    Suflo eğri kodu (SufloEase.sfcCoz): çok noktalı eğri, yay, kullanıcı önayarı
 *
 * Yoğunlaştırma kuralı (yogunlastir):
 *   - Aynı yönde giden ardışık anahtarlar (ör. Zoom İçeri'nin 1 → 1,18 → 1,55'i) tek parça sayılır: aradaki
 *     anahtar Suflo'nun ivme biçimiydi, onun yerini seçilen eğri alır (her anahtarda durup kalkan "kekeme" hareket
 *     olmasın). Yön değiştiren anahtarlar (taşma, zıplama, sarsıntı tepeleri) ve duruş / kalkış anları KORUNUR:
 *     oralarda hız zaten sıfırdır. Bileşenlerden biri ([x, y]) yön değiştirirse anahtar korunur.
 *   - Değeri değişmeyen parça yoğunlaştırılmaz (her eğri onu sabit bırakır).
 *   - Uçlar ve korunan anahtarlar a: 1 (çapa) ile işaretlenir: host zamanı sıkıştırınca (kısa klip) yalnız
 *     aradaki anahtarları seyreltir, çapalar hep yazılır.
 *   - Toplam ara anahtar 2000'i aşarsa adım ikiye katlanır (capped): kayıt başına 4096 zaman sınırının ve
 *     Premiere'in yazma süresinin altında kalınır.
 * Suflo'nun kendi kodu (temiz oda). Eğri matematiği js/ease-curve.js'te (Rebound MIT uyarlaması, atıflı).
 */
(function (root, factory) {
  var E = root && root.SufloEase;
  if (!E && typeof require === "function") { try { E = require("./ease-curve.js"); } catch (e) { E = null; } }
  var api = factory(E);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloEgriSecim = api;
})(typeof window !== "undefined" ? window : this, function (E) {
  "use strict";

  var OTOMATIK = "auto";
  var UZUN_PARCA = 1;        // sn: bundan uzun parça 2 karede bir
  var EN_COK = 2000;         // özellik başına en çok ara anahtar
  var TABLO_N = 241;         // Hareket önayarı: host'a giden eğri tablosu (SufloEase.bakeFactors) nokta sayısı
  var EPS = 1e-9;

  function sonlu(v) { return typeof v === "number" && isFinite(v); }
  function fpsOku(fps) { var f = Number(fps); return f > 0 && f <= 1000 ? f : 30; }

  /* ================= ease alanı ================= */
  function otomatik() { return { ok: true, tur: "otomatik", ease: OTOMATIK, curve: null }; }
  function basarisiz(hata) { return { ok: false, tur: "otomatik", ease: OTOMATIK, curve: null, hata: hata }; }

  /*
   * ease → { ok, tur: 'otomatik' | 'hazir' | 'css' | 'kod', ease (kanonik metin), curve (otomatikte null), ad?, hata? }
   * Tanımsız / boş / 'auto' → otomatik. Geçersiz metin → ok: false (çağıran 'auto'ya düşer ya da kullanıcıya söyler).
   * Kanonik metin: hazır eğride kimlik, CSS'te SufloEase.toCss, kodda yeniden kodlanmış (normalize) SFC1.
   */
  function coz(ease) {
    if (ease === undefined || ease === null) return otomatik();
    if (typeof ease !== "string" || !E) return basarisiz("gecersiz");
    var s = ease.replace(/^\s+|\s+$/g, "");
    if (!s || s === OTOMATIK) return otomatik();
    if (s.length > E.LIMITS.SFC_MAX) return basarisiz("uzun");
    var b = E.builtin(s);
    if (b) return { ok: true, tur: "hazir", ease: b.id, curve: b.curve };
    if (/^cubic-bezier\s*\(/i.test(s)) {
      var c = E.fromCss(s);
      return c ? { ok: true, tur: "css", ease: E.toCss(c), curve: c } : basarisiz("css");
    }
    var k = E.sfcCoz(s);
    if (!k.ok) return basarisiz(k.hata === "onek" ? "gecersiz" : k.hata);
    return { ok: true, tur: "kod", ease: E.sfcKodla({ ad: k.ad, curve: k.curve }), curve: k.curve, ad: k.ad };
  }
  function kanonik(ease) { var c = coz(ease); return c.ok ? c.ease : OTOMATIK; }
  function otomatikMi(ease) { return kanonik(ease) === OTOMATIK; }
  // Eğri tanımı → ease metni (hazır eğri kimliği; değilse bezier → CSS, diğerleri SFC1 kodu)
  function egridenEase(curve, ad) {
    var c = E && E.normalize(curve);
    if (!c) return null;
    var j = JSON.stringify(c);
    for (var i = 0; i < E.BUILTINS.length; i++) if (JSON.stringify(E.BUILTINS[i].curve) === j) return E.BUILTINS[i].id;
    return c.type === "bezier" ? E.toCss(c) : E.sfcKodla({ ad: ad, curve: c });
  }

  /* ================= seçici listesi ================= */
  /*
   * Eğri seçicisinin kartları: Otomatik, hazır eğriler (arayüz dilinde), Eğri sekmesindeki eğri (kaydedilmemişse) ve
   * kullanıcının Eğri sekmesinde kaydettiği önayarlar. o: { dil, kullanici: [{ id, ad, curve }], duzenleyici: curve }
   * Döner: [{ ease, ad, curve (otomatikte null), tur: 'otomatik' | 'hazir' | 'duzenleyici' | 'kullanici', adCevrilir }]
   * adCevrilir: ad Suflo'nun kendi metni (arayüz sözlüğüyle çevrilir); hazır eğri adları zaten dilde, kullanıcı
   * adları hiç çevrilmez.
   */
  function secenekler(o) {
    o = o || {};
    var out = [{ ease: OTOMATIK, ad: "Otomatik", curve: null, tur: "otomatik", adCevrilir: true }];
    if (!E) return out;
    var gorulen = {};
    gorulen[OTOMATIK] = 1;
    E.builtins().forEach(function (b) {
      out.push({ ease: b.id, ad: E.builtinName(b, o.dil), curve: b.curve, tur: "hazir", adCevrilir: false });
      gorulen[b.id] = 1;
    });
    (Array.isArray(o.kullanici) ? o.kullanici : []).forEach(function (u) {
      var e = u ? egridenEase(u.curve, u.ad) : null;
      if (!e || gorulen[e]) return;
      gorulen[e] = 1;
      out.push({ ease: e, ad: String(u.ad || "").slice(0, 40), curve: E.normalize(u.curve), tur: "kullanici", adCevrilir: false });
    });
    var d = o.duzenleyici ? egridenEase(o.duzenleyici, "") : null;
    if (d && !gorulen[d]) out.splice(1, 0, { ease: d, ad: "Eğri sekmesindeki eğri", curve: E.normalize(o.duzenleyici), tur: "duzenleyici", adCevrilir: true });
    return out;
  }
  /*
   * Seçili ease'in kartı (seçici düğmesi için). Listede yoksa (ör. önayar sonradan silindi) eğri ease'in kendisinden:
   * { ease, ad, curve, tur, adCevrilir } | null (geçersiz ease)
   */
  function bul(ease, liste) {
    var c = coz(ease);
    if (!c.ok) return null;
    for (var i = 0; i < (liste || []).length; i++) if (liste[i].ease === c.ease) return liste[i];
    if (c.tur === "otomatik") return { ease: OTOMATIK, ad: "Otomatik", curve: null, tur: "otomatik", adCevrilir: true };
    return { ease: c.ease, ad: c.ad || (c.tur === "css" ? c.ease : "Özel eğri"), curve: c.curve, tur: c.tur, adCevrilir: !c.ad && c.tur !== "css" };
  }

  /* ================= yoğunlaştırma ================= */
  // v: sayı ya da 1–4 sayılık dizi; değilse null
  function degerOku(v) {
    if (sonlu(v)) return v;
    if (Array.isArray(v) && v.length >= 1 && v.length <= 4 && v.every(sonlu)) return v.slice();
    return null;
  }
  function bilesenler(v) { return Array.isArray(v) ? v : [v]; }
  // Parçanın yön sınıfı (bileşen başına -1 / 0 / 1)
  function yon(a, b) {
    var x = bilesenler(a), y = bilesenler(b), out = [];
    for (var i = 0; i < x.length; i++) {
      var d = y[i] - x[i];
      out.push(Math.abs(d) <= EPS ? 0 : d > 0 ? 1 : -1);
    }
    return out;
  }
  function sabit(a, b) { return yon(a, b).every(function (s) { return s === 0; }); }

  // Geçerli, artan zamanlı, aynı türde değerli anahtarlar (bozuk girdi boş dizi)
  function temizle(keys) {
    if (!Array.isArray(keys)) return [];
    var out = [], dizi = null, uzunluk = 0;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], t = k ? Number(k.t) : NaN, v = k ? degerOku(k.v) : null;
      if (!sonlu(t) || v === null) return [];
      var d = Array.isArray(v);
      if (dizi === null) { dizi = d; uzunluk = d ? v.length : 0; }
      if (d !== dizi || (d && v.length !== uzunluk)) return [];
      if (out.length && t <= out[out.length - 1].t + EPS) return [];
      out.push({ t: t, v: v });
    }
    return out;
  }

  // Çapalar: ilk, son ve yönün değiştiği (ya da durup kalktığı) anahtarlar
  function capalar(liste) {
    if (liste.length <= 2) return liste.slice();
    var out = [liste[0]];
    for (var i = 1; i < liste.length - 1; i++) {
      var y1 = yon(liste[i - 1].v, liste[i].v), y2 = yon(liste[i].v, liste[i + 1].v);
      var degisti = false;
      for (var j = 0; j < y1.length; j++) if (y1[j] !== y2[j]) { degisti = true; break; }
      if (degisti) out.push(liste[i]);
    }
    out.push(liste[liste.length - 1]);
    return out;
  }

  /*
   * keys: [{ t, v }] artan zaman (sn; v sayı ya da [x, y]); o: { curve, fps, clampMin, clampMax, maxKeys (2000),
   * birlestir (varsayılan true: aynı yönlü anahtarlar tek parça) }.
   * Döner: { keys: [{ t, v, a? }] (a: 1 çapa), capped, eklenen (ara anahtar sayısı), carpan (adım çarpanı) }.
   * Geçersiz eğri / girdi: anahtarlar olduğu gibi (çapa olarak), eklenen 0.
   */
  function yogunlastir(keys, o) {
    o = o || {};
    var liste = temizle(keys);
    var curve = E && E.normalize(o.curve);
    if (liste.length < 2 || !curve) {
      return { keys: liste.map(function (k) { return { t: k.t, v: k.v, a: 1 }; }), capped: false, eklenen: 0, carpan: 1 };
    }
    var cap = o.birlestir === false ? liste : capalar(liste);
    var fps = fpsOku(o.fps);
    var enCok = Math.floor(Number(o.maxKeys));
    enCok = isFinite(enCok) && enCok >= 1 ? Math.min(enCok, 100000) : EN_COK;
    var carpan = 1, parcalar, toplam;
    for (;;) {
      parcalar = [];
      toplam = 0;
      for (var i = 0; i < cap.length - 1; i++) {
        var a = cap[i], b = cap[i + 1];
        if (sabit(a.v, b.v)) { parcalar.push([]); continue; }
        var adim = (b.t - a.t > UZUN_PARCA + EPS ? 2 : 1) * carpan;
        var p = E.bakePlan({ t0: a.t, t1: b.t, v0: a.v, v1: b.v, fps: fps, step: adim, curve: curve,
          clampMin: o.clampMin, clampMax: o.clampMax, maxKeys: 100000 });
        parcalar.push(p.keys);
        toplam += p.keys.length;
      }
      if (toplam <= enCok || carpan >= 512) break;
      carpan *= 2;
    }
    var out = [];
    for (var n = 0; n < cap.length; n++) {
      out.push({ t: cap[n].t, v: cap[n].v, a: 1 });
      if (n < parcalar.length) parcalar[n].forEach(function (k) { out.push({ t: k.t, v: k.v }); });
    }
    return { keys: out, capped: carpan > 1, eklenen: toplam, carpan: carpan };
  }

  // Geçiş planının Konum dizisi: [{ t, x, y }] → yoğun [{ t, x, y, a? }]
  function yogunXY(pos, o) {
    var r = yogunlastir((pos || []).map(function (k) { return { t: k.t, v: [k.x, k.y] }; }), o);
    r.keys = r.keys.map(function (k) {
      var q = { t: k.t, x: k.v[0], y: k.v[1] };
      if (k.a) q.a = 1;
      return q;
    });
    return r;
  }
  // Zoom planı: [{ time, value }] → yoğun [{ time, value, a? }]
  function yogunZaman(keys, o) {
    var r = yogunlastir((keys || []).map(function (k) { return { t: k.time, v: k.value }; }), o);
    r.keys = r.keys.map(function (k) {
      var q = { time: k.t, value: k.v };
      if (k.a) q.a = 1;
      return q;
    });
    return r;
  }
  // Seyrek [{ t, v }] dizisini yerinde yoğunlaştırır (Geçiş: Ölçek / Opaklık çarpanı)
  function yogunTV(keys, o) {
    var r = yogunlastir(keys, o);
    r.keys = r.keys.map(function (k) {
      var q = { t: k.t, v: k.v };
      if (k.a) q.a = 1;
      return q;
    });
    return r;
  }

  /*
   * Hareket önayarı: anahtarlarını host her seçili klibin o anki değerlerinden kurar, bu yüzden panel eğriyi
   * tablo olarak gönderir (SufloEase.bakeFactors: 0..1 aralığında eşit aralıklı 241 ilerleme değeri) ve host
   * her parçayı kare zamanlarında bu tabloyla yoğunlaştırır (KS_egriYogun; aynı kural).
   * Döner: { ease, tablo } | null (otomatik ya da geçersiz)
   */
  function hareketEgrisi(ease) {
    var c = coz(ease);
    if (!c.ok || !c.curve) return null;
    return { ease: c.ease, tablo: E.bakeFactors(c.curve, TABLO_N).map(function (v) { return Math.round(v * 1e6) / 1e6; }) };
  }

  // Panel bağlamından (KApp.ctx(): frame = bir karenin saniyesi) sekansın kare hızı; bilinmiyorsa undefined (plan 30 alır)
  function kareHizi(ctx) {
    var f = ctx ? Number(ctx.frame) : NaN;
    return f > 0 && f <= 1 ? 1 / f : undefined;
  }
  // Yoğun Geçiş planının toplam anahtar sayısı (çağrı süresi için)
  function planAnahtari(plan) {
    var n = 0;
    ["out", "in"].forEach(function (y) {
      var s = plan && plan[y];
      if (!s) return;
      ["scale", "opacity", "pos"].forEach(function (ad) { if (Array.isArray(s[ad])) n += s[ad].length; });
    });
    return n;
  }

  // Yoğun yazımın Premiere çağrı süresi (ms): taban + anahtar başına pay; en çok 10 dk
  function cagriSuresi(taban, anahtar) {
    var n = Math.max(0, Number(anahtar) || 0);
    return Math.min(600000, Math.max(Number(taban) || 0, 0) + Math.ceil(n * 25));
  }

  return {
    OTOMATIK: OTOMATIK, UZUN_PARCA: UZUN_PARCA, EN_COK: EN_COK, TABLO_N: TABLO_N,
    coz: coz, kanonik: kanonik, otomatikMi: otomatikMi, egridenEase: egridenEase,
    secenekler: secenekler, bul: bul,
    capalar: function (keys) { return capalar(temizle(keys)); },
    yogunlastir: yogunlastir, yogunXY: yogunXY, yogunZaman: yogunZaman, yogunTV: yogunTV,
    hareketEgrisi: hareketEgrisi, cagriSuresi: cagriSuresi, kareHizi: kareHizi, planAnahtari: planAnahtari,
    // 180° döndürme (SufloEase.flip): Geçiş'te giden klibin (A) eğrisi
    ayna: function (curve) { return E ? E.flip(curve) : null; }
  };
});
