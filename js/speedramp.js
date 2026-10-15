/*
 * Suflo Hız Rampası — saf plan modülü (DOM'a, Premiere'e, dosyaya dokunmaz)
 *
 * Premiere, Zaman Yeniden Eşleme'yi (Time Remapping) eklentilere açmıyor: bileşen
 * TrackItem.components'ta görünmüyor, UXP'de de yok, QE addVideoEffect("Time Remapping")
 * "başarılı" deyip hiçbir şey eklemiyor. Bu yüzden Suflo BASAMAKLI DOĞAL RAMPA kurar:
 * aralık kareye oturan 3–28 parçaya bölünür, her parçaya QE setSpeed ile kendi sabit hızı
 * yazılır. Sonuç Premiere'de Hız/Süre ile düzenlenebilen sıradan kliplerdir.
 *
 * SABİT AYAK İZİ: rampa aralığın yerini ve süresini değiştirmez, ripple yapmaz (altyazı,
 * müzik, marker, sonraki klipler kaymaz). Hızlanma daha çok kaynak, yavaşlama daha az kaynak
 * kullanır; kaynağın nereden geleceğine bu modül karar verir, host uyar:
 *   exact    ("Tam hız")  önayar hızları aynen, %100 = gerçek zaman. Kaynak = L × B.
 *                         Yalnız aralık klibin sonunda bitiyorsa; B > 1 ise klibin Out
 *                         noktasından sonra (B−1) × L + 2 kare medya gerekir (ffmpeg -i).
 *   balanced ("Dengeli")  tüm hızlar c = 1/B ile çarpılır (sınırlamadan sonra yeniden
 *                         normalize): kaynak = L, iki kenarda kaynak aynı, ses T1'de yine senkron.
 *   auto                  exact sığarsa exact; sığmazsa yoğunluk ikiye bölmeyle düşürülür
 *                         (isteğin 0.6'sından aşağı değil, yogunlukDustu); o da olmazsa
 *                         balanced (dengeliyeGecti). Medya süresi bilinmiyorsa (ffmpeg yok)
 *                         B > 1 iken doğrudan balanced (sureYok). Kısmi (In/Out)
 *                         aralık hep balanced.
 *
 * Zaman ekseni: u ∈ [0,1] ÇIKIŞ (timeline) zamanı; hız = kaynak sn / timeline sn (1 = %100).
 *
 * Özel eğri (3.4 adım 13): "ozel" önayarının anahtarları kullanıcıdan gelir (o.ozelKeys: [[t, %]] ya da
 * [{t, v}], o.ozelHit: ağır çekim anı ya da null). ozelDogrula onları 2–8 noktaya, [0, 1] zamanına ve
 * %10–%1000 hıza oturtur; sonra her şey (yoğunluk, yumuşatma, vuruş anı hizalama, parçalama, Tam hız /
 * Dengeli / Otomatik, uyarı kodları, srcFrames ≤ F) önayarlardaki gibidir. hostPlan ve host değişmedi.
 * Düzenleyici geometrisi (log2 hız ekseni, tıkla ekle, sürükle, çift tıkla sil, Shift ızgara, Alt sert
 * basamak) ozel.* altında saf ve testli; SVG düzenleyici js/egri.js'te (SufloEgriEditor, mod 'hiz').
 * Suflo'nun kendi kodu (temiz oda).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloSpeedRamp = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // keys: [çıkış zamanı 0..1, hız %] — tekrarlanan t her zaman sert basamaktır
  var LIST = [
    { id: "dalis", name: "Ağır Çekim Dalışı", desc: "Hızlan, derin ağır çekim, yeniden hızlan", group: "agir", hit: 0.5,
      keys: [[0, 100], [0.18, 200], [0.40, 30], [0.60, 30], [0.82, 200], [1, 100]] },
    { id: "darbe", name: "Darbe", desc: "Hızla gelir, darbe anında neredeyse durur, hızla çıkar", group: "agir", hit: 0.5,
      keys: [[0, 120], [0.24, 300], [0.40, 25], [0.60, 25], [0.76, 300], [1, 120]] },
    { id: "giris", name: "Hızlı Giriş", desc: "Hızlı başlar, normale oturur (rampa girişi)", group: "rampa", hit: 0.35,
      keys: [[0, 500], [0.35, 100], [1, 100]] },
    { id: "cikis", name: "Hızlı Çıkış", desc: "Normal akar, sonda fırlar (rampa çıkışı)", group: "rampa", hit: 0.6,
      keys: [[0, 100], [0.60, 100], [1, 600]] },
    { id: "doruk", name: "Doruk Anı", desc: "Hızlı yaklaşım, uzun ağır çekim, normale dönüş (yumuşak kahraman anı)", group: "agir", hit: 0.58,
      keys: [[0, 240], [0.20, 240], [0.36, 28], [0.80, 28], [1, 100]] },
    { id: "atilim", name: "Atılım", desc: "Ortada kısa bir flaş hızlanma", group: "hizli", hit: 0.5,
      keys: [[0, 100], [0.38, 100], [0.50, 700], [0.62, 100], [1, 100]] },
    { id: "bukum", name: "Zaman Bükümü", desc: "Hızlı, uzun ağır çekim, hızlı (mermi zamanı hissi)", group: "agir", hit: 0.5,
      keys: [[0, 300], [0.16, 300], [0.30, 35], [0.70, 35], [0.84, 300], [1, 300]] },
    { id: "nabiz", name: "Nabız", desc: "Hızlı ve yavaş dönüşümlü montaj ritmi", group: "ritim", hit: 0.25,
      keys: [[0, 240], [0.25, 40], [0.50, 240], [0.75, 40], [1, 240]] },
    { id: "vites", name: "Vites", desc: "Yumuşatmasız sert basamaklar", group: "ritim", hit: 0.4,
      keys: [[0, 55], [0.40, 55], [0.40, 260], [0.70, 260], [0.70, 55], [1, 55]] },
    { id: "suzulme", name: "Süzülme", desc: "B-roll için hafif dalga", group: "yumusak", hit: 0.5,
      keys: [[0, 100], [0.25, 160], [0.50, 50], [0.75, 160], [1, 100]] },
    // Vuruşlar Ritim sekmesinin analizinden gelir (KBeat.vuruslar); vuruş anları müziğe bağlı
    // olduğu için vuruş anı hizalaması bu eğride yapılmaz
    { id: "ritim", name: "Ritme Rampa", desc: "Ritim analizindeki vuruşlarda yavaşla (ya da hızlan)", group: "vurus", hit: null, beats: true,
      keys: [] },
    // 3.4 adım 13: kullanıcının kendi çizdiği eğri. Anahtarlar seçeneklerden gelir (o.ozelKeys, o.ozelHit;
    // ozelDogrula), plan / biçim / parçalama / kaynak politikası önayarlarla aynı yoldan geçer
    { id: "ozel", name: "Özel eğri", desc: "Kendi hız eğrini çiz: nokta ekle, sürükle, sert basamak yap", group: "ozel", hit: null,
      keys: [] }
  ];

  var EASES = ["smooth", "linear", "step"];
  var DENSITIES = ["few", "normal", "many"];
  var MODES = ["auto", "balanced"];
  var MIN_V = 0.1, MAX_V = 10;
  var MAX_BEATS = 24;
  // Parça yoğunluğu: tau = bir parçadaki log2(hız) aralığı, m = en kısa parça (kare)
  var DENSITY = {
    few: { tau: 0.6, mf: 0.2, mmin: 3, max: 8 },
    normal: { tau: 0.35, mf: 0.12, mmin: 3, max: 16 },
    many: { tau: 0.2, mf: 0.08, mmin: 2, max: 28 }
  };

  function has(id) { return LIST.some(function (p) { return p.id === id; }); }
  function get(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }
  function list() {
    return LIST.map(function (p) {
      return { id: p.id, name: p.name, desc: p.desc, group: p.group, hit: p.hit, beats: !!p.beats,
        keys: p.keys.map(function (k) { return [k[0], k[1]]; }) };
    });
  }

  function clampNum(v, lo, hi, def) {
    v = Number(v);
    if (v === null || !isFinite(v)) return def;
    return Math.max(lo, Math.min(hi, v));
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lg(v) { return Math.log(v) / Math.LN2; }
  function yuvarla(v, n) { var p = Math.pow(10, n); return Math.round(v * p) / p; }

  function opts(o) {
    o = o || {};
    return {
      k: clampNum(o.k, 0.5, 1.5, 1),
      ease: EASES.indexOf(o.ease) !== -1 ? o.ease : "smooth",
      density: DENSITIES.indexOf(o.density) !== -1 ? o.density : "normal",
      mode: MODES.indexOf(o.mode) !== -1 ? o.mode : "auto",
      minV: MIN_V,
      maxV: MAX_V,
      onBeat: o.onBeat === "fast" ? "fast" : "slow",
      slowV: clampNum(o.slowV, 0.1, 1, 0.4),
      fastV: clampNum(o.fastV, 1, 10, 2.5)
    };
  }

  // [[t, %], …] ya da [{t, v}] → yeni [{t, v (oran)}] dizisi
  function normKeys(keys) {
    var out = [];
    (keys || []).forEach(function (k) {
      if (Array.isArray(k)) out.push({ t: Number(k[0]), v: Number(k[1]) / 100 });
      else if (k) out.push({ t: Number(k.t), v: Number(k.v) });
    });
    return out.filter(function (k) { return isFinite(k.t) && k.v > 0; });
  }

  // Basamaklı (step): her anahtar, komşusuyla arasındaki yolun ORTASINA kadar kendi hızını tutar
  // (en yakın anahtar). Değeri değişen her aralığın ortasına tekrarlanan t eklenerek açık sert
  // basamağa çevrilir; böylece ilk ve son anahtar da süre kazanır (eskiden step sol değeri
  // tutuyordu: Hızlı Çıkış'ın t = 1'deki %600'ü hiç görünmez, plan "duz" ile atardı). Çıktıda her
  // pozitif aralık sabit olduğundan at() "sol değeri tut" ile tam okur. İdempotent: hizalama,
  // parçalama ve çizim aynı basamakları görür.
  function basamakla(ks) {
    var out = [];
    for (var i = 0; i < ks.length; i++) {
      var a = ks[i], b = ks[i + 1];
      out.push({ t: a.t, v: a.v });
      if (b && b.t > a.t && b.v !== a.v) {
        var orta = (a.t + b.t) / 2;
        out.push({ t: orta, v: a.v }, { t: orta, v: b.v });
      }
    }
    return out;
  }
  // Basamaklı'da vuruş anı görünen basamağa oturur: vuruş anahtarı bir yanda aynı hızı tutup öbür
  // yanda değişiyorsa (Hızlı Giriş 0.35, Hızlı Çıkış 0.6) en yakın anahtar kuralıyla hız o anahtarda
  // değil, komşusuyla ortasında değişir (0.175 / 0.8). Platonun ortasındaki (Darbe, Atılım, Nabız)
  // ve zaten sert basamaktaki (Vites, tekrarlanan t) vuruşlar yerinde kalır. ks: basamaklanmamış
  function basamakVurus(ks, hit) {
    var j = -1, n = 0;
    for (var i = 0; i < ks.length; i++) if (Math.abs(ks[i].t - hit) < 1e-9) { j = i; n++; }
    if (n !== 1) return hit;
    var sol = ks[j - 1], sag = ks[j + 1];
    var sd = !!sol && sol.v !== ks[j].v, gd = !!sag && sag.v !== ks[j].v;
    if (sd === gd) return hit;
    return ((sd ? sol.t : sag.t) + ks[j].t) / 2;
  }
  function easeOf(ease) { return EASES.indexOf(ease) !== -1 ? ease : "smooth"; }
  // normKeys + Basamaklı'da açık basamaklar
  function hazir(keys, ease) { var ks = normKeys(keys); return ease === "step" ? basamakla(ks) : ks; }

  /* ---------------- eğri ---------------- */

  // Normalize anahtarlarda u anındaki hız. Aradeğerleme log2(hız) uzayında:
  //   smooth s = (1 − cos πx)/2 (her anahtarda düz teğet, Easy Ease görünümü), linear s = x,
  //   step sol değeri tutar (anahtarlar önce basamakla() ile açık basamağa çevrilmiş olmalı:
  //   hazir()). Tekrarlanan t sert basamaktır: t anında SAĞ değer geçerli.
  function at(ks, u, ease) {
    var n = ks.length;
    if (!n) return 1;
    if (u < ks[0].t) return ks[0].v;
    var lo = 0, hi = n - 1;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (ks[mid].t <= u) lo = mid; else hi = mid - 1;
    }
    if (lo >= n - 1) return ks[n - 1].v;
    var a = ks[lo], b = ks[lo + 1];
    var span = b.t - a.t;
    if (!(span > 0) || ease === "step") return a.v;
    var x = (u - a.t) / span;
    var s = ease === "linear" ? x : (1 - Math.cos(Math.PI * x)) / 2;
    return Math.pow(2, lg(a.v) + s * (lg(b.v) - lg(a.v)));
  }

  function speedAt(keys, u, ease) {
    ease = easeOf(ease);
    return at(hazir(keys, ease), Number(u), ease);
  }

  // Bileşik Simpson; anahtar zamanlarında (basamaklar dahil) parçalara bölünür, parçanın
  // sağ ucu soldan limitle okunur (basamakta yanlış tarafın değeri karışmasın)
  var SIMPSON_N = 24;
  function integ(ks, ease, u0, u1) {
    if (!(u1 > u0)) return 0;
    var pts = [u0];
    ks.forEach(function (k) { if (k.t > u0 && k.t < u1 && k.t !== pts[pts.length - 1]) pts.push(k.t); });
    pts.push(u1);
    var sum = 0;
    for (var p = 0; p + 1 < pts.length; p++) {
      var a = pts[p], b = pts[p + 1];
      if (!(b > a)) continue;
      var h = (b - a) / SIMPSON_N, s = 0;
      for (var i = 0; i <= SIMPSON_N; i++) {
        var u = i === SIMPSON_N ? b - Math.max(1e-12, Math.abs(b) * 1e-12) : a + i * h;
        var w = (i === 0 || i === SIMPSON_N) ? 1 : (i % 2 ? 4 : 2);
        s += w * at(ks, u, ease);
      }
      sum += s * h / 3;
    }
    return sum;
  }

  function integrate(keys, ease, u0, u1) {
    var a = u0 === undefined ? 0 : Number(u0), b = u1 === undefined ? 1 : Number(u1);
    ease = easeOf(ease);
    return integ(hazir(keys, ease), ease, a, b);
  }
  // Kaynak / timeline oranı: eğrinin [0,1] ortalaması
  function B(keys, ease) { return integrate(keys, ease, 0, 1); }

  /* ---------------- vuruşlar ---------------- */

  /*
   * Vuruş eğrisi. beatsU: aralık oranları (u = (vuruş − T0)/L) — sayı ya da { u, guc }.
   * 4 kareden yakın vuruşlar birleşir (güçlü olanın yeri kalır), en çok 24 vuruş (zayıflar
   * atılır). Her vuruşa yerel aralığın 0.25'i genişliğinde yavaş plato, iki vuruşun ortasına
   * hızlı anahtar, iki uç hızlı. onBeat "fast" yavaş/hızlıyı takas eder. F: aralığın kare sayısı.
   */
  function beatKeys(beatsU, o, F) {
    o = opts(o);
    F = Number(F) > 0 ? Number(F) : 100;
    var minGap = 4 / F;
    var ham = [];
    (beatsU || []).forEach(function (b) {
      var u = typeof b === "number" ? b : Number(b && (b.u !== undefined ? b.u : b.t));
      var g = b && typeof b === "object" && isFinite(Number(b.guc)) ? Number(b.guc) : 1;
      if (isFinite(u) && u >= 0 && u <= 1) ham.push({ u: u, g: g });
    });
    ham.sort(function (a, b) { return a.u - b.u; });
    var bir = [];
    ham.forEach(function (b) {
      var son = bir[bir.length - 1];
      if (son && b.u - son.u < minGap) {
        if (b.g > son.g) son.u = b.u;
        son.g = Math.max(son.g, b.g);
        return;
      }
      bir.push({ u: b.u, g: b.g });
    });
    if (bir.length > MAX_BEATS) {
      bir = bir.map(function (b, i) { return { u: b.u, g: b.g, i: i }; })
        .sort(function (a, b) { return b.g - a.g || a.i - b.i; }).slice(0, MAX_BEATS)
        .sort(function (a, b) { return a.u - b.u; });
    }
    if (!bir.length) return [];
    var yavas = o.onBeat === "fast" ? o.fastV : o.slowV;
    var hizli = o.onBeat === "fast" ? o.slowV : o.fastV;
    var ks = [{ t: 0, v: hizli }];
    for (var i = 0; i < bir.length; i++) {
      var u = bir[i].u;
      var sol = i > 0 ? u - bir[i - 1].u : null, sag = i < bir.length - 1 ? bir[i + 1].u - u : null;
      var aralik = sol === null && sag === null ? 0.5 : Math.min(sol === null ? Infinity : sol, sag === null ? Infinity : sag);
      var yari = 0.125 * aralik;
      if (i > 0) ks.push({ t: (bir[i - 1].u + u) / 2, v: hizli });
      ks.push({ t: clamp(u - yari, 0, 1), v: yavas });
      ks.push({ t: clamp(u + yari, 0, 1), v: yavas });
    }
    ks.push({ t: 1, v: hizli });
    // sıralı ve tekrarsız: aynı ana düşen anahtarlar (uçtaki vuruş) sert basamak olarak kalır
    var out = [];
    ks.forEach(function (k) {
      var son = out[out.length - 1];
      if (son && k.t < son.t) k = { t: son.t, v: k.v };
      if (son && k.t === son.t && k.v === son.v) return;
      out.push(k);
    });
    return out;
  }

  /* ---------------- vuruş anı hizalama ---------------- */

  /*
   * Çıkış zamanını parça parça doğrusal büker: [0, hitU] → [0, h'], [hitU, 1] → [h', 1].
   * a = vuruşun solundaki ortalama hız, b = sağındaki; f = (playhead − T0)/L (izleyicinin
   * görmek istediği kaynak karesinin aralıktaki yeri).
   *   balanced: h' = f·b / (a(1−f) + f·b)    exact: h' = f/a
   * h' [0.1, 0.9]'a sınırlanır; err = ulaşılan ile istenen kaynak arasındaki fark × Lsec (sn).
   */
  function alignHit(keys, hitU, f, mode, ease, Lsec) {
    ease = easeOf(ease);
    // Basamaklı'da bükmeden ÖNCE açık basamak: orta noktalar bükülen eğriyle birlikte kayar
    var ks = hazir(keys, ease);
    hitU = clamp(Number(hitU), 0.01, 0.99);
    f = clamp(Number(f), 0, 1);
    if (!ks.some(function (k) { return Math.abs(k.t - hitU) < 1e-9; })) {
      var v = at(ks, hitU, ease), j = 0;
      while (j < ks.length && ks[j].t < hitU) j++;
      ks.splice(j, 0, { t: hitU, v: v });
    }
    var a = integ(ks, ease, 0, hitU) / hitU;
    var b = integ(ks, ease, hitU, 1) / (1 - hitU);
    var h = mode === "exact" ? f / a : (f * b) / (a * (1 - f) + f * b);
    if (!isFinite(h)) h = hitU;
    var hc = clamp(h, 0.1, 0.9);
    var out = ks.map(function (k) {
      var t = k.t <= hitU ? k.t * hc / hitU : hc + (k.t - hitU) * (1 - hc) / (1 - hitU);
      return { t: clamp(t, 0, 1), v: k.v };
    });
    var got = mode === "exact" ? a * hc : a * hc / (a * hc + b * (1 - hc));
    return { keys: out, hitU2: hc, err: Math.abs(got - f) * (Number(Lsec) > 0 ? Number(Lsec) : 1), clamped: Math.abs(hc - h) > 1e-9 };
  }

  /* ---------------- özel eğri (3.4 adım 13) ---------------- */

  var OZEL = {
    EN_AZ: 2, EN_COK: 8,             // nokta sayısı (uçlar dahil)
    ARA: 0.01,                       // düzenleyicide iki ayrı zaman arasındaki en kısa aralık
    X_YAPIS: 0.05,                   // Shift: zaman %5'e
    IZGARA: [0.25, 0.5, 1, 2, 4, 8], // Shift: hız bu çizgilere (log2 uzayında en yakın)
    HIT: [0.02, 0.98],               // ağır çekim anı sınırı
    KAYIT: 12,                       // adlı özel rampa sayısı (yerel depo)
    AD: 40
  };
  // Düzenleyici boşken (ilk açılış) başlangıç eğrisi: tek derin ağır çekim
  var OZEL_VARSAYILAN = { keys: [[0, 100], [0.5, 30], [1, 100]], hit: 0.5 };

  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function r3(v) { return Math.round(v * 1e3) / 1e3; }
  // Sayı ya da sayı metni; null / boş / mantıksal değer geçersiz (Number(null) = 0 sessizce t = 0 olmasın)
  function sayi(x) {
    if (typeof x === "number") return x;
    if (typeof x === "string" && /\S/.test(x)) return Number(x);
    return NaN;
  }

  /*
   * ozelDogrula(keys) → [{t, v}] (her zaman 2–8 nokta). keys: [[t, %]] (önayar biçimi) ya da [{t, v (oran)}].
   *   - sayı olmayan nokta atılır; t [0, 1]'e, v [MIN_V, MAX_V]'ye (%10–%1000) çekilir; t ve v 4 ondalık
   *   - t'ye göre sıralanır (aynı t'de giriş sırası korunur)
   *   - aynı t'de en çok iki nokta: ilki ve sonuncusu (sert basamak); hızları aynıysa tek nokta. t = 0'daki
   *     basamakta yalnız sağdaki, t = 1'dekinde yalnız soldaki hız görünür: o tek nokta kalır
   *   - ilk nokta t = 0'da, son nokta t = 1'de değilse aynı hızla eklenir (eğri değişmez)
   *   - 8'den çok nokta: en az iz bırakan iç nokta (komşularının log2 doğrusundan en az sapan) atılır
   *   - geçerli nokta yoksa düz %100 (plan bunu "duz" ile reddeder)
   */
  function ozelDogrula(keys) {
    var ham = [];
    (Array.isArray(keys) ? keys : []).forEach(function (k, i) {
      var t, v;
      if (Array.isArray(k)) { t = sayi(k[0]); v = sayi(k[1]) / 100; }
      else if (k && typeof k === "object") { t = sayi(k.t); v = sayi(k.v); }
      else return;
      if (!isFinite(t) || !isFinite(v)) return;
      ham.push({ t: r4(clamp(t, 0, 1)), v: r4(clamp(v, MIN_V, MAX_V)), i: i });
    });
    ham.sort(function (a, b) { return a.t - b.t || a.i - b.i; });
    var out = [];
    for (var j = 0; j < ham.length;) {
      var e = j;
      while (e + 1 < ham.length && ham[e + 1].t === ham[j].t) e++;
      var a = ham[j], b = ham[e];
      if (a.t === 0) out.push({ t: 0, v: b.v });
      else if (a.t === 1) out.push({ t: 1, v: a.v });
      else {
        out.push({ t: a.t, v: a.v });
        if (e > j && b.v !== a.v) out.push({ t: a.t, v: b.v });
      }
      j = e + 1;
    }
    if (!out.length) return [{ t: 0, v: 1 }, { t: 1, v: 1 }];
    if (out[0].t > 0) out.unshift({ t: 0, v: out[0].v });
    if (out[out.length - 1].t < 1) out.push({ t: 1, v: out[out.length - 1].v });
    while (out.length > OZEL.EN_COK) {
      var en = -1, enHata = Infinity;
      for (var q = 1; q < out.length - 1; q++) {
        var s = out[q - 1], n = out[q + 1], h;
        if (s.t === out[q].t) h = Math.abs(lg(out[q].v) - lg(s.v));
        else if (n.t === out[q].t) h = Math.abs(lg(out[q].v) - lg(n.v));
        else {
          var x = n.t > s.t ? (out[q].t - s.t) / (n.t - s.t) : 0;
          h = Math.abs(lg(out[q].v) - (lg(s.v) + x * (lg(n.v) - lg(s.v))));
        }
        if (h < enHata) { enHata = h; en = q; }
      }
      out.splice(en, 1);
    }
    return out;
  }

  // Ağır çekim anı: [0.02, 0.98] ya da null (yok)
  function ozelHit(h) {
    var x = sayi(h);
    return isFinite(x) ? r4(clamp(x, OZEL.HIT[0], OZEL.HIT[1])) : null;
  }
  // Depo / paylaşım biçimi: [[t, %]] (önayarlardaki gibi; % iki ondalık, oran dört ondalıkla gidiş dönüş aynı)
  function ozelYuzde(keys) {
    return ozelDogrula(keys).map(function (k) { return [k.t, Math.round(k.v * 1e4) / 100]; });
  }
  // "ozel" önayarı: anahtarlar ve ağır çekim anı seçeneklerden. ozelKeys yoksa (boş) başlangıç eğrisi
  function ozelOnayar(o) {
    o = o || {};
    var bos = !Array.isArray(o.ozelKeys) || !o.ozelKeys.length;
    var keys = ozelDogrula(bos ? OZEL_VARSAYILAN.keys : o.ozelKeys);
    var hit = bos && o.ozelHit === undefined ? OZEL_VARSAYILAN.hit : ozelHit(o.ozelHit);
    return { id: "ozel", name: get("ozel").name, desc: get("ozel").desc, group: "ozel", hit: hit, keys: keys };
  }
  function onayar(id, o) { return id === "ozel" ? ozelOnayar(o) : get(id); }

  /* ---- düzenleyici geometrisi (SufloEgriEditor mod 'hiz'; viewBox 0 0 W H) ---- */
  // y: log2 hız, %10 (alt) – %1000 (üst), %100 ortada; x: çıkış zamanı. SOL: eksen yazıları için sol boşluk
  var OED = { W: 320, H: 176, PAD: 12, SOL: 34 };
  var LG_ALT = lg(MIN_V), LG_UST = lg(MAX_V);
  function oX(t) { return yuvarla(OED.SOL + clamp(Number(t), 0, 1) * (OED.W - OED.SOL - OED.PAD), 2); }
  function oY(v) {
    var l = clamp(lg(Math.max(1e-6, Number(v))), LG_ALT, LG_UST);
    return yuvarla(OED.PAD + (LG_UST - l) / (LG_UST - LG_ALT) * (OED.H - 2 * OED.PAD), 2);
  }
  function oT(px) { return clamp((Number(px) - OED.SOL) / (OED.W - OED.SOL - OED.PAD), 0, 1); }
  function oV(py) {
    var l = LG_UST - (Number(py) - OED.PAD) / (OED.H - 2 * OED.PAD) * (LG_UST - LG_ALT);
    return clamp(Math.pow(2, l), MIN_V, MAX_V);
  }
  // Shift: zaman %5'e; değilse 0,001'e
  function yapisT(t, shift) { return shift ? r3(Math.round(t / OZEL.X_YAPIS) * OZEL.X_YAPIS) : r3(t); }
  // Shift: hız en yakın ızgara çizgisine (log2); değilse %1'e
  function yapisV(v, shift) {
    v = clamp(Number(v), MIN_V, MAX_V);
    if (!shift) return clamp(Math.round(v * 100) / 100, MIN_V, MAX_V);
    var en = OZEL.IZGARA[0];
    OZEL.IZGARA.forEach(function (g) { if (Math.abs(lg(g) - lg(v)) < Math.abs(lg(en) - lg(v))) en = g; });
    return en;
  }
  function kopyaKeys(keys) { return (keys || []).map(function (k) { return { t: k.t, v: k.v }; }); }
  // i'nin sert basamak eşi (aynı t'deki komşu) ya da -1
  function basamakEsi(ks, i) {
    if (i > 0 && ks[i - 1].t === ks[i].t) return i - 1;
    if (i < ks.length - 1 && ks[i + 1].t === ks[i].t) return i + 1;
    return -1;
  }

  /*
   * Tıkla: (t, v)'ye nokta (o.shift: ızgaraya yapışır). Döner: { keys, i } | { hata: 'dolu' (8 nokta) | 'yakin'
   * (başka bir noktaya %1'den yakın) | 'gecersiz' }
   */
  function ozelEkle(keys, t, v, o) {
    o = o || {};
    var ks = ozelDogrula(keys);
    t = sayi(t); v = sayi(v);
    if (!isFinite(t) || !isFinite(v)) return { hata: "gecersiz" };
    if (ks.length >= OZEL.EN_COK) return { hata: "dolu" };
    t = clamp(yapisT(clamp(t, 0, 1), !!o.shift), 0, 1);
    v = yapisV(v, !!o.shift);
    for (var q = 0; q < ks.length; q++) if (Math.abs(ks[q].t - t) < OZEL.ARA - 1e-9) return { hata: "yakin" };
    var j = 0;
    while (j < ks.length && ks[j].t < t) j++;
    ks.splice(j, 0, { t: t, v: v });
    return { keys: ks, i: j };
  }

  /*
   * Sürükle: i. nokta (t, v)'ye. Uçların zamanı sabit (yalnız hızı oynar). İç nokta komşularının %1 içine
   * giremez (sıra değişmez, dizin aynı kalır); sert basamağın iki noktası birlikte kayar, yalnız tutulanın hızı
   * değişir. Sürükleme boyunca dizin kararlı olsun diye ozelDogrula çağrılmaz (bırakınca düzenleyici çağırır).
   * keys: ozelDogrula çıktısı. Döner: { keys, i } | null.
   */
  function ozelTasi(keys, i, t, v, o) {
    o = o || {};
    var ks = kopyaKeys(keys);
    if (!(i >= 0 && i < ks.length)) return null;
    v = sayi(v); t = sayi(t);
    if (isFinite(v)) ks[i].v = yapisV(v, !!o.shift);
    if (i > 0 && i < ks.length - 1 && isFinite(t)) {
      var e = basamakEsi(ks, i), g0 = e === -1 ? i : Math.min(i, e), g1 = e === -1 ? i : Math.max(i, e);
      if (g0 > 0 && g1 < ks.length - 1) {
        var lo = ks[g0 - 1].t + OZEL.ARA, hi = ks[g1 + 1].t - OZEL.ARA;
        if (hi >= lo) {
          var nt = r4(clamp(yapisT(clamp(t, 0, 1), !!o.shift), lo, hi));
          for (var q = g0; q <= g1; q++) ks[q].t = nt;
        }
      }
    }
    return { keys: ks, i: i };
  }

  // Çift tık: iç noktayı sil (uçlar silinmez). Döner: { keys } | null
  function ozelSil(keys, i) {
    var ks = ozelDogrula(keys);
    if (!(i > 0 && i < ks.length - 1)) return null;
    ks.splice(i, 1);
    return { keys: ozelDogrula(ks) };
  }

  /*
   * Alt+tık: sert basamak aç / kapat. Noktanın basamak eşi varsa eş silinir (yumuşak geçiş geri gelir);
   * yoksa aynı zamana ikinci nokta eklenir: hız o anda bir sonraki noktanın hızına atlar (o da aynıysa
   * öncekinin hızına, o da aynıysa iki katına ya da yarısına). Döner: { keys, i (tutulacak nokta) } |
   * { hata: 'uc' (uçta basamak olmaz) | 'dolu' }
   */
  function ozelBasamak(keys, i) {
    var ks = ozelDogrula(keys);
    if (!(i > 0 && i < ks.length - 1)) return { hata: "uc" };
    var e = basamakEsi(ks, i);
    if (e !== -1) {
      ks.splice(e, 1);
      return { keys: ozelDogrula(ks), i: e < i ? i - 1 : i };
    }
    if (ks.length >= OZEL.EN_COK) return { hata: "dolu" };
    var v = ks[i].v, v2;
    if (Math.abs(lg(ks[i + 1].v) - lg(v)) > 0.05) v2 = ks[i + 1].v;
    else if (Math.abs(lg(ks[i - 1].v) - lg(v)) > 0.05) v2 = ks[i - 1].v;
    else v2 = v * 2 <= MAX_V ? v * 2 : v / 2;
    ks.splice(i + 1, 0, { t: ks[i].t, v: r4(v2) });
    return { keys: ozelDogrula(ks), i: i + 1 };
  }

  // En yakın nokta (ekran koordinatı, yarıçap px) ya da -1. Sert basamağın iki noktası aynı x'te, ayrı y'de
  function ozelEnYakin(keys, px, py, yaricap) {
    var ks = ozelDogrula(keys), en = -1, d0 = Number(yaricap) > 0 ? Number(yaricap) : 9;
    ks.forEach(function (k, i) {
      var dx = oX(k.t) - px, dy = oY(k.v) - py, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= d0) { d0 = d; en = i; }
    });
    return en;
  }

  // Düzenleyicideki eğri yolu (SVG d): yumuşatma seçicisine göre; sert basamaklar dikey
  function ozelYol(keys, ease) {
    ease = easeOf(ease);
    var ks = hazir(ozelDogrula(keys), ease);
    if (ease === "step") {
      var son = at(ks, 0, ease), nok = [[0, son]];
      ks.forEach(function (k) { if (k.t > 0 && k.t < 1) { nok.push([k.t, k.v]); son = k.v; } });
      nok.push([1, son]);
      return nok.map(function (q, j) { return (j ? "L" : "M") + oX(q[0]) + " " + oY(q[1]); }).join(" ");
    }
    var n = 160, us = [];
    for (var i = 0; i <= n; i++) us.push(i / n);
    // anahtar zamanları (ve basamağın hemen solu) da örneklenir: basamak dikey, tepe noktası tam
    ks.forEach(function (k) { if (k.t > 0 && k.t < 1) us.push(k.t, Math.max(0, k.t - 1e-6)); });
    us.sort(function (a, b) { return a - b; });
    var out = [], onceki = -1;
    us.forEach(function (u) {
      if (u === onceki) return;
      onceki = u;
      out.push((out.length ? "L" : "M") + oX(u) + " " + oY(at(ks, u, ease)));
    });
    return out.join(" ");
  }

  // Izgara: yatay çizgiler (IZGARA hızları, %100 ana) ve dikey çeyrekler
  function ozelIzgara() {
    return {
      yatay: OZEL.IZGARA.map(function (g) { return { v: g, y: oY(g), etiket: Math.round(g * 100) + "%", ana: g === 1 }; }),
      dikey: [0, 0.25, 0.5, 0.75, 1].map(function (t) { return { t: t, x: oX(t) }; }),
      ust: OED.PAD, alt: OED.H - OED.PAD, sol: OED.SOL, sag: OED.W - OED.PAD
    };
  }

  /* ---- adlı özel rampalar (yerel depo: en çok 12) ---- */
  function adTemiz(ad) {
    if (typeof ad !== "string") return "";
    return ad.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").slice(0, OZEL.AD);
  }
  // Depodan okunan listeyi doğrular: [{ id, ad, keys: [[t, %]], hit }] (en çok 12; bozuk / yinelenen atılır)
  function ozelKayitlar(ham) {
    var out = [], idler = {};
    (Array.isArray(ham) ? ham : []).forEach(function (o) {
      if (out.length >= OZEL.KAYIT || !o || typeof o !== "object") return;
      var id = typeof o.id === "string" && /^r[0-9a-z]{1,16}$/.test(o.id) ? o.id : "";
      var ad = adTemiz(o.ad);
      if (!id || !ad || idler[id] || !Array.isArray(o.keys) || !o.keys.length) return;
      idler[id] = 1;
      out.push({ id: id, ad: ad, keys: ozelYuzde(o.keys), hit: ozelHit(o.hit) });
    });
    return out;
  }
  // Kaydet: aynı ad (büyük / küçük harf ayrımsız) varsa üzerine yazılır. Döner: { ok, liste, id, guncellendi, kod: 'ad' | 'dolu' }
  function ozelKayitEkle(liste, ad, keys, hit, simdi) {
    var temiz = ozelKayitlar(liste), a = adTemiz(ad);
    if (!a) return { ok: false, liste: temiz, kod: "ad" };
    var kayit = { id: "", ad: a, keys: ozelYuzde(keys), hit: ozelHit(hit) };
    for (var i = 0; i < temiz.length; i++) {
      if (temiz[i].ad.toLowerCase() === a.toLowerCase()) {
        kayit.id = temiz[i].id;
        temiz[i] = kayit;
        return { ok: true, liste: temiz, id: kayit.id, guncellendi: true };
      }
    }
    if (temiz.length >= OZEL.KAYIT) return { ok: false, liste: temiz, kod: "dolu" };
    var taban = "r" + Math.floor(isFinite(Number(simdi)) ? Math.abs(Number(simdi)) : 0).toString(36).slice(-10), n = 0;
    function varMi(id) { return temiz.some(function (x) { return x.id === id; }); }
    while (varMi(taban + n.toString(36))) n++;
    kayit.id = taban + n.toString(36);
    temiz.push(kayit);
    return { ok: true, liste: temiz, id: kayit.id, guncellendi: false };
  }
  function ozelKayitSil(liste, id) { return ozelKayitlar(liste).filter(function (x) { return x.id !== id; }); }
  // Varsayılan ad: "Özel rampa N" (ilk boş numara). cevir (isteğe bağlı): arayüz dilindeki hâli (panel adı o dilde
  // saklar: "Custom ramp 2" varken önerilen ad onun üstüne yazmasın); dönen ad yine Türkçe kaynak metindir
  function ozelKayitAdi(liste, cevir) {
    var l = ozelKayitlar(liste), n = l.length + 1;
    function varMi(ad) {
      var c = typeof cevir === "function" ? String(cevir(ad)) : ad;
      return l.some(function (x) { var a = x.ad.toLowerCase(); return a === ad.toLowerCase() || a === c.toLowerCase(); });
    }
    while (varMi("Özel rampa " + n)) n++;
    return "Özel rampa " + n;
  }

  /*
   * Özel eğrinin bütün noktaları %1 içinde aynı hızda mı. Tam düz eğriyi plan her aralık, Parça, Yumuşatma ve Yoğunlukta
   * "duz" ile reddeder (v^k de sabit kalır); %1'in içindeki fark da ancak Güçlü yoğunlukta rampa olur. Plan "duz" atınca
   * panel bu eğride hazır önayarların "daha uzun aralık / Parça: Çok" önerisi yerine "bir noktayı sürükle" der. Eğri
   * gerçekten değişiyorsa "duz" kısa aralıktan gelir, hazır önayarlardaki metin doğrudur.
   */
  function ozelDuz(keys) {
    var mn = Infinity, mx = 0;
    ozelDogrula(keys).forEach(function (k) { mn = Math.min(mn, k.v); mx = Math.max(mx, k.v); });
    return mx / mn < 1.01;
  }
  // İki özel eğri aynı mı ({ keys, hit }; doğrulanmış [t, %] ve ağır çekim anıyla)
  function ozelAyni(a, b) {
    var ka = ozelYuzde(a && a.keys), kb = ozelYuzde(b && b.keys);
    if (ka.length !== kb.length || ozelHit(a && a.hit) !== ozelHit(b && b.hit)) return false;
    for (var i = 0; i < ka.length; i++) if (ka[i][0] !== kb[i][0] || ka[i][1] !== kb[i][1]) return false;
    return true;
  }
  /*
   * Eğri yeniden elde edilebilir mi: başlangıç eğrisi, bir hazır kartın kopyası (Düzenle; vuruşlu Ritme Rampa ve Özel
   * eğri hariç) ya da adlı bir kayıt (kayitlar: depodaki liste). Panel, bunların dışındaki (elle çizilmiş, adıyla
   * kaydedilmemiş) eğrinin üstüne Düzenle / kayıtlı rampa / Sıfırla yazınca bir kez "Geri al" sunar.
   */
  function ozelBilinen(egri, kayitlar) {
    if (ozelAyni(egri, OZEL_VARSAYILAN)) return true;
    var hazir = LIST.some(function (p) { return !p.beats && p.id !== "ozel" && ozelAyni(egri, p); });
    return hazir || ozelKayitlar(kayitlar).some(function (k) { return ozelAyni(egri, k); });
  }
  /*
   * CEP tuş ilgisi (window.__adobe_cep__.registerKeyEventsInterest): odak metin kutusunda değilken basılan tuşlar
   * Premiere'e de gider (Delete seçili klibi siler, Enter efektleri render eder, Space oynatır). tur 'editor': özel
   * eğri düzenleyicisi odakta, Delete / Backspace (Windows VK 46 / 8, macOS 117 / 51) seçili noktayı siler; tur
   * 'duzenle': bir kartın Düzenle'si odakta, Enter / Space (Windows 13 / 32, macOS Return 36 / Space 49). Yalnız
   * değiştiricisiz tuşlar. Başka tür: "" (ilgiyi bırakır).
   */
  var OZEL_TUSLAR = { editor: { win: [46, 8], mac: [117, 51] }, duzenle: { win: [13, 32], mac: [36, 49] } };
  function ozelTusIlgisi(tur, mac) {
    if (!Object.prototype.hasOwnProperty.call(OZEL_TUSLAR, tur)) return "";
    return JSON.stringify(OZEL_TUSLAR[tur][mac ? "mac" : "win"].map(function (k) { return { keyCode: k }; }));
  }

  /* ---------------- biçim ---------------- */

  // Önayar → yoğunluk (v' = v^k), vuruş üretimi, Basamaklı'da açık basamaklar, vuruş anı hizalama.
  // k önceden sınırlanmış olmalı.
  function shapeRaw(p, o, ctx, k) {
    var ks, uyari = [];
    if (p.beats) {
      ks = beatKeys(ctx.beatsU || [], o, ctx.F);
      if (!ks.length) { uyari.push("vurusYok"); ks = [{ t: 0, v: 1 }, { t: 1, v: 1 }]; }
    } else ks = normKeys(p.keys);
    ks = ks.map(function (x) { return { t: x.t, v: Math.pow(x.v, k) }; });
    var hitU = p.hit;
    if (o.ease === "step") {
      if (hitU !== null && hitU !== undefined) hitU = basamakVurus(ks, hitU);
      ks = basamakla(ks);
    }
    var hit = null;
    var f = ctx.hitFrac;
    if (hitU !== null && hitU !== undefined && f !== null && f !== undefined && isFinite(Number(f)) && Number(f) >= 0 && Number(f) <= 1) {
      var al = alignHit(ks, hitU, Number(f), ctx.mode === "exact" ? "exact" : "balanced", o.ease, ctx.Lsec);
      ks = al.keys;
      hit = { u: al.hitU2, f: Number(f), err: al.err, clamped: al.clamped };
    }
    return { keys: ks, hit: hit, warnings: uyari };
  }

  // shape(id, o, ctx) → [{t, v}] — ctx: { beatsU, F, hitFrac, mode, Lsec }
  function shape(id, o, ctx) {
    var p = onayar(id, o);
    if (!p) throw new Error("Bilinmeyen rampa: " + id);
    o = opts(o);
    return shapeRaw(p, o, ctx || {}, o.k).keys;
  }

  /* ---------------- parçalama ---------------- */

  /*
   * Eğriyi kareye oturan parçalara böler: [{a, b (kare), v}]. Her kare merkezinde 4 alt
   * örnekle okunur; log2(hız) aralığı tau'yu aşmadıkça parça büyür. Sert basamaklar
   * (tekrarlanan t) kareye yuvarlanıp zorunlu kesim olur; step'te YALNIZ basamaklarda (hızın
   * değiştiği orta noktalarda) kesilir. Kısa parça komşusuna katılır (step'te önce komşudan pay alıp
   * m'ye genişler); parça sayısı sınırı aşılırsa tau × 1.35.
   * v = parçanın ortalaması (integral): Σ d·v tam olarak F·B olur.
   */
  // vurus (isteğe bağlı): { hx: vuruş anı (kare), yavas: vuruşta eğri ortalamadan yavaş mı }
  function segment(keys, ease, F, fps, density, vurus) {
    ease = easeOf(ease);
    var ks = hazir(keys, ease);
    F = Math.max(1, Math.round(Number(F) || 0));
    fps = Number(fps) > 0 ? Number(fps) : 30;
    var P = DENSITY[density] || DENSITY.normal;
    // Kısa aralıkta en kısa parça F/3'e iner: yüksek kare hızında kısa klip tek parçaya (Dengeli'de
    // %100, yani rampasız) düşmesin
    var m = Math.max(1, Math.min(Math.max(P.mmin, Math.round(P.mf * fps)), Math.floor(F / 3)));
    function ort(a, b) { return integ(ks, ease, a / F, b / F) * F / (b - a); }
    function sonuc(runs) { return runs.map(function (r) { return { a: r[0], b: r[1], v: ort(r[0], r[1]) }; }); }
    if (F < 2 * m) return sonuc([[0, F]]);

    var zorunlu = {}, i;
    for (i = 0; i + 1 < ks.length; i++) {
      if (ks[i + 1].t === ks[i].t && (ease !== "step" || ks[i + 1].v !== ks[i].v)) {
        var c = Math.round(ks[i + 1].t * F);
        if (c > 0 && c < F) zorunlu[c] = 1;
      }
    }

    // parçaların hepsi %1 içinde aynı hızda mı (plan bunu "duz" ile reddeder)
    function tekHiz(runs) {
      var mn = Infinity, mx = 0;
      runs.forEach(function (r) { var o = ort(r[0], r[1]); mn = Math.min(mn, o); mx = Math.max(mx, o); });
      return mx / mn < 1.01;
    }

    function kisaBirlestir(runs) {
      var degisti = true;
      while (degisti && runs.length > 1) {
        degisti = false;
        for (var r = 0; r < runs.length; r++) {
          if (runs[r][1] - runs[r][0] >= m) continue;
          var hedef;
          if (r === 0) hedef = 1;
          else if (r === runs.length - 1) hedef = r - 1;
          else {
            var me = lg(ort(runs[r][0], runs[r][1]));
            var ds = Math.abs(lg(ort(runs[r - 1][0], runs[r - 1][1])) - me);
            var dn = Math.abs(lg(ort(runs[r + 1][0], runs[r + 1][1])) - me);
            hedef = ds <= dn ? r - 1 : r + 1;
          }
          var x = Math.min(r, hedef);
          runs.splice(x, 2, [runs[x][0], runs[x + 1][1]]);
          degisti = true;
          break;
        }
      }
      return runs;
    }

    // Basamaklı: her parça gerçek bir basamak. m'den kısa parça komşusuna KATILMAZ (yarıya inen uç
    // basamağı, ör. Hızlı Giriş'in %500'ü, kısa klipte tek parçaya yani "duz"a düşerdi); sınırları
    // m'nin üstünde kalan komşulardan pay alınarak (önce iki yandan eşit) m'ye genişletilir. v yine
    // parça ortalaması, her sınırdaki kaynak tam. Komşular yetmezse en yakın hızlı komşuya katılır.
    function kisaGenislet(runs) {
      function uz(q) { return runs[q][1] - runs[q][0]; }
      // her tur m'den kısa parça sayısını en az bir azaltır: sınır bir kez, baştaki sayıdan
      for (var tur = 0, enCok = 4 * runs.length + 4; tur < enCok && runs.length > 1; tur++) {
        var r = -1;
        for (var q = 0; q < runs.length; q++) if (uz(q) < m && (r < 0 || uz(q) < uz(r))) r = q;
        if (r < 0) break;
        var eksik = m - uz(r);
        var solPay = r > 0 ? Math.max(0, uz(r - 1) - m) : 0;
        var sagPay = r < runs.length - 1 ? Math.max(0, uz(r + 1) - m) : 0;
        if (solPay + sagPay < eksik) {
          var hedef = r === 0 ? 1 : r === runs.length - 1 ? r - 1 : null;
          if (hedef === null) {
            var me = lg(ort(runs[r][0], runs[r][1]));
            hedef = Math.abs(lg(ort(runs[r - 1][0], runs[r - 1][1])) - me) <= Math.abs(lg(ort(runs[r + 1][0], runs[r + 1][1])) - me) ? r - 1 : r + 1;
          }
          var x = Math.min(r, hedef);
          runs.splice(x, 2, [runs[x][0], runs[x + 1][1]]);
          continue;
        }
        var solAl = Math.min(solPay, Math.ceil(eksik / 2)), sagAl = Math.min(sagPay, eksik - solAl);
        solAl = eksik - sagAl;
        if (solAl) { runs[r - 1][1] -= solAl; runs[r][0] -= solAl; }
        if (sagAl) { runs[r + 1][0] += sagAl; runs[r][1] += sagAl; }
      }
      return runs;
    }

    var runs;
    if (ease === "step") {
      var kesim = Object.keys(zorunlu).map(Number).sort(function (a, b) { return a - b; });
      runs = [];
      var s0 = 0;
      kesim.forEach(function (c) { runs.push([s0, c]); s0 = c; });
      runs.push([s0, F]);
      runs = kisaGenislet(runs);
      // Son çare: dönüşümlü kısa basamaklar birleşip tek hıza eridiyse (ör. Nabız + hizalama, 1 sn
      // altı klip) en büyük karşıtlığı veren tek kesim: iki parça, ikisi de ≥ m. Vuruş anı varsa onu
      // içeren parça önayarın vuruştaki karakterini korur (yavaş vuruş yavaş parçada); öyle bir kesim
      // yoksa eğri tek hızda kalır (plan "duz"), ters rampa yazılmaz. Eğrinin kendisi %1'den az
      // değişiyorsa hiç taranmaz; ortalamalar kare başı birikimli integralden (O(F))
      var vmn = Infinity, vmx = 0;
      ks.forEach(function (x) { vmn = Math.min(vmn, x.v); vmx = Math.max(vmx, x.v); });
      if (kesim.length && F >= 2 * m && vmx / vmn >= 1.01 && tekHiz(runs)) {
        var I = [0], q;
        for (q = 0; q < F; q++) I.push(I[q] + integ(ks, ease, q / F, (q + 1) / F));
        var enIyi = -1, enFark = 0;
        for (var c2 = m; c2 <= F - m; c2++) {
          var o1 = I[c2] * F / c2, o2 = (I[F] - I[c2]) * F / (F - c2);
          if (vurus) {
            var hp = vurus.hx < c2 ? o1 : o2, ob = vurus.hx < c2 ? o2 : o1;
            if (vurus.yavas ? !(hp < ob) : !(hp > ob)) continue;
          }
          var fk = Math.abs(lg(o1) - lg(o2));
          if (fk > enFark + 1e-12) { enFark = fk; enIyi = c2; }
        }
        if (enIyi > 0 && enFark > lg(1.01)) runs = [[0, enIyi], [enIyi, F]];
      }
    } else {
      var fl = new Array(F);
      for (i = 0; i < F; i++) {
        var top = 0;
        for (var j = 0; j < 4; j++) top += at(ks, (i + (j + 0.5) / 4) / F, ease);
        fl[i] = lg(top / 4);
      }
      var tau = P.tau;
      for (var deneme = 0; deneme < 24; deneme++) {
        runs = [];
        var s = 0;
        while (s < F) {
          var lo = fl[s], hi = fl[s], e = s + 1;
          while (e < F && !zorunlu[e]) {
            var nlo = Math.min(lo, fl[e]), nhi = Math.max(hi, fl[e]);
            if (nhi - nlo > tau && e - s >= m) break;
            lo = nlo; hi = nhi; e++;
          }
          runs.push([s, e]);
          s = e;
        }
        runs = kisaBirlestir(runs);
        if (runs.length <= P.max) break;
        tau *= 1.35;
      }
    }
    // son güvence: sınırın üstündeyse ortalaması en yakın komşu çiftleri birleştir
    while (runs.length > P.max) {
      var en = -1, enFark = Infinity;
      for (i = 0; i + 1 < runs.length; i++) {
        var fark = Math.abs(lg(ort(runs[i][0], runs[i][1])) - lg(ort(runs[i + 1][0], runs[i + 1][1])));
        if (fark < enFark) { enFark = fark; en = i; }
      }
      runs.splice(en, 2, [runs[en][0], runs[en + 1][1]]);
    }
    return sonuc(runs);
  }

  /* ---------------- plan ---------------- */

  // Parçalar boyunca: çıkış karesi x'te tüketilen kaynak (kare) ve kaynak karesi y'nin gösterildiği
  // çıkış karesi (kaynak bitmişse %100 ile uzatılır)
  function kaynakAnda(d, v, x) {
    var t = 0, s = 0;
    for (var j = 0; j < v.length; j++) {
      if (t + d[j] >= x) return s + (x - t) * v[j];
      t += d[j]; s += d[j] * v[j];
    }
    return s;
  }
  function zamanAnda(d, v, y) {
    var t = 0, s = 0;
    for (var j = 0; j < v.length; j++) {
      if (s + d[j] * v[j] >= y) return t + (y - s) / v[j];
      t += d[j]; s += d[j] * v[j];
    }
    return t + (y - s);
  }

  // v[j]'ye artık/d[j] ekler, 6 ondalıkta AŞAĞI yuvarlar: Σ d·v hedefi aşmaz (1e-6: kayan nokta
  // gürültüsü tam değeri bir basamak düşürmesin)
  function asagi(v, d, j, artik) {
    v[j] = clamp(Math.floor((v[j] + artik / d[j]) * 1e6 + 1e-6) / 1e6, MIN_V, MAX_V);
  }

  /*
   * plan(id, o, clip) — clip: { frames (F ≥ 12, tam sayı), fps, partial, handleSec (sn ya da
   * null), hitFrac (ya da null), beatsU (ya da null), srcFps (ya da null) }
   * Doner: { id, mode, k, c, ease, segments: [{d, v (4 ondalık; artığı taşıyan tek parça 6)}], F, fps, srcFrames, B, minV, maxV, hit,
   *          warnings, keys (çizim için, c ile ölçekli) }
   * Uyarı kodları: yogunlukDustu, dengeliyeGecti, sureYok, sinirlandi, takilabilir, vurusYok, hitKaydi.
   * Atar: F < 12 ("çok kısa"); tek hız çıkan plan (e.kod "duz": tek parça ya da hızlar %1 içinde).
   * id "ozel": anahtarlar o.ozelKeys'ten, ağır çekim anı o.ozelHit'ten (ozelOnayar); gerisi aynı yol.
   */
  function plan(id, o, clip) {
    var p = onayar(id, o);
    if (!p) throw new Error("Bilinmeyen rampa: " + id);
    o = opts(o);
    clip = clip || {};
    var F = Math.round(Number(clip.frames));
    if (!(F >= 12)) throw new Error("Rampa için klip çok kısa");
    var fps = Number(clip.fps) > 0 ? Number(clip.fps) : 30;
    var Lsec = F / fps;
    var hf = clip.hitFrac === null || clip.hitFrac === undefined ? null : Number(clip.hitFrac);
    if (hf !== null && !(hf >= 0 && hf <= 1)) hf = null;
    var tutamak = clip.handleSec === null || clip.handleSec === undefined || !isFinite(Number(clip.handleSec)) ? null : Number(clip.handleSec);
    var uyarilar = [];
    function bicim(k, mode) { return shapeRaw(p, o, { beatsU: clip.beatsU, F: F, hitFrac: hf, mode: mode, Lsec: Lsec }, k); }
    function sigar(sh) {
      var b = integ(sh.keys, o.ease, 0, 1);
      if (b <= 1 + 1e-9) return true;
      if (tutamak === null) return false;
      return tutamak + 1e-9 >= ((b - 1) * F + 2) / fps;
    }

    var mode = "balanced", k = o.k, sh = null;
    if (o.mode === "auto" && !clip.partial) {
      sh = bicim(k, "exact");
      // Tam hız kaynağın sonunu kullanmıyorsa (B < 1) ve vuruş anı o kullanılmayan sonda kalıyorsa
      // exact vuruşu hiç göstermez (ve uydurma bir "kaydı" süresi yazardı): Dengeli tüm kaynağı
      // kullanır ve hizalar
      if (hf !== null && sh.hit && integ(sh.keys, o.ease, 0, 1) < hf - 1e-9) { /* Dengeli */ }
      else if (sigar(sh)) mode = "exact";
      // medya süresi bilinmiyor (ffmpeg yok, okunamadı ya da ffmpeg -i hâlâ sürüyor): yoğunluk düşürülmez;
      // "klibin sonrasında görüntü yok" denmez, çünkü bilinmiyor
      else if (tutamak === null) uyarilar.push("sureYok");
      else {
        var kAlt = 0.6 * o.k, shAlt = bicim(kAlt, "exact");
        if (sigar(shAlt)) {
          var lo = kAlt, hi = o.k;
          for (var it = 0; it < 18; it++) {
            var mid = (lo + hi) / 2;
            if (sigar(bicim(mid, "exact"))) lo = mid; else hi = mid;
          }
          k = lo;
          sh = bicim(k, "exact");
          mode = "exact";
          uyarilar.push("yogunlukDustu");
        } else uyarilar.push("dengeliyeGecti");
      }
    }
    if (mode === "balanced") { k = o.k; sh = bicim(k, "balanced"); }
    uyarilar = uyarilar.concat(sh.warnings);

    var vurusBilgi = null;
    if (sh.hit) {
      var hks = hazir(sh.keys, o.ease);
      vurusBilgi = { hx: sh.hit.u * F, yavas: at(hks, sh.hit.u, o.ease) < integ(hks, o.ease, 0, 1) };
    }
    var parca = segment(sh.keys, o.ease, F, fps, o.density, vurusBilgi);
    var d = parca.map(function (s) { return s.b - s.a; });
    var v = parca.map(function (s) { return s.v; });
    var sinirli = v.map(function () { return false; });
    var c = 1, sinirlandi = false, i;

    if (mode === "balanced") {
      var top0 = 0;
      for (i = 0; i < v.length; i++) top0 += d[i] * v[i];
      c = F / top0;
      v = v.map(function (x) { return x * c; });
      for (var gecis = 0; gecis < 6; gecis++) {
        var yeni = false;
        for (i = 0; i < v.length; i++) {
          if (sinirli[i]) continue;
          if (v[i] < MIN_V) { v[i] = MIN_V; sinirli[i] = true; yeni = true; }
          else if (v[i] > MAX_V) { v[i] = MAX_V; sinirli[i] = true; yeni = true; }
        }
        if (yeni) sinirlandi = true;
        var sabit = 0, serbest = 0;
        for (i = 0; i < v.length; i++) { if (sinirli[i]) sabit += d[i] * v[i]; else serbest += d[i] * v[i]; }
        if (!(serbest > 0)) break;
        var g = (F - sabit) / serbest;
        for (i = 0; i < v.length; i++) if (!sinirli[i]) v[i] *= g;
        if (!yeni && Math.abs(g - 1) < 1e-12) break;
      }
      v = v.map(function (x) { return yuvarla(clamp(x, MIN_V, MAX_V), 4); });
      // yuvarlama artığı: en uzun sınırlanmamış parçalardan başlayarak dağıt
      var sira = v.map(function (x, j) { return j; }).filter(function (j) { return !sinirli[j]; })
        .sort(function (a, b) { return d[b] - d[a] || a - b; });
      for (var r = 0; r < sira.length; r++) {
        var toplam = 0;
        for (i = 0; i < v.length; i++) toplam += d[i] * v[i];
        var artik = F - toplam;
        if (Math.abs(artik) <= 1e-6) break;
        var j2 = sira[r];
        var yeniV = yuvarla(clamp(v[j2] + artik / d[j2], MIN_V, MAX_V), 4);
        v[j2] = yeniV;
      }
      // çok uzun parçalarda (ör. Vites'in sabit basamakları) 4 ondalık 0.01 kareyi tutturamaz;
      // yuvarlama F'yi aşarsa kaynak klibin Out'unu geçer (Out medyanın sonuysa host'ta tutamak):
      // son artık en uzun serbest parçaya 6 ondalıkla AŞAĞI yazılır, Σ d·v ≤ F
      var kalan = F;
      for (i = 0; i < v.length; i++) kalan -= d[i] * v[i];
      if ((kalan < -1e-9 || kalan > 0.005) && sira.length) asagi(v, d, sira[0], kalan);
    } else {
      var ham = 0, yuv = 0;
      v = v.map(function (x, j) {
        var y = clamp(x, MIN_V, MAX_V);
        if (y !== x) { sinirli[j] = true; sinirlandi = true; }
        ham += d[j] * y;
        return yuvarla(y, 4);
      });
      // 4 ondalık yuvarlama eğrinin kaynağından fazlasını istemesin (B ≈ 1 iken tutamaksız seçilen
      // exact, Out'u kare kesri kadar aşıp medya sonunda takılırdı)
      for (i = 0; i < v.length; i++) yuv += d[i] * v[i];
      var serbest2 = v.map(function (x, j) { return j; }).filter(function (j) { return !sinirli[j]; })
        .sort(function (a, b) { return d[b] - d[a] || a - b; });
      if (yuv - ham > 1e-9 && serbest2.length) asagi(v, d, serbest2[0], ham - yuv);
    }
    if (sinirlandi) uyarilar.push("sinirlandi");

    var src = 0, mn = Infinity, mx = 0;
    for (i = 0; i < v.length; i++) { src += d[i] * v[i]; mn = Math.min(mn, v[i]); mx = Math.max(mx, v[i]); }
    // Vuruş anı yazılacak parçalarda ölçülür (sınırlama, kısa parçanın komşusuna katılması ve
    // yuvarlama dahil). es: vuruş anında gösterilen kaynak karesinin hedeften (f·F) farkı; et: hedef
    // kaynak karesinin timeline'da vuruş anından uzaklığı (kare). Ağır çekimde et büyür ama içerik
    // bir kareden az kayar, hızlıda tersi: ikisi de 1 kareyi aşarsa göze görünür (hitKaydi).
    // hit.err timeline kayması (sn): panel "Darbe anı X sn kaydı" der
    var es = 0, et = 0;
    if (sh.hit) {
      es = Math.abs(kaynakAnda(d, v, sh.hit.u * F) - sh.hit.f * F);
      et = Math.abs(zamanAnda(d, v, sh.hit.f * F) - sh.hit.u * F);
    }
    // Tek hız (tek parça ya da hepsi %1 içinde): rampa değil. Dengeli'de bu %100 demek; host yine de
    // sesi kapatıp "başarılı" derdi. Vuruşsuz Ritme Rampa kendi uyarısıyla (vurusYok) döner.
    if ((v.length < 2 || mx / mn < 1.01) && sh.warnings.indexOf("vurusYok") === -1) {
      var duz = new Error("Bu ayarlarla rampa oluşmuyor: parçaların hepsi aynı hızda");
      duz.kod = "duz";
      throw duz;
    }
    var sonuc = {
      id: id, mode: mode, k: yuvarla(k, 3), c: yuvarla(c, 4), ease: o.ease,
      segments: d.map(function (x, j) { return { d: x, v: v[j] }; }),
      F: F, fps: fps, srcFrames: yuvarla(src, 4), B: yuvarla(src / F, 4), minV: mn, maxV: mx,
      hit: sh.hit ? { u: yuvarla(sh.hit.u, 4), f: sh.hit.f, err: yuvarla(et / fps, 4) } : null,
      warnings: [],
      keys: sh.keys.map(function (x) { return { t: x.t, v: clamp(x.v * c, MIN_V, MAX_V) }; })
    };
    if (sh.hit && Math.min(es, et) > 1 + 1e-6) uyarilar.push("hitKaydi");
    if (Number(clip.srcFps) > 0 && quality(sonuc, fps, Number(clip.srcFps)).warn) uyarilar.push("takilabilir");
    uyarilar.forEach(function (w) { if (sonuc.warnings.indexOf(w) === -1) sonuc.warnings.push(w); });
    return sonuc;
  }

  // Host'a gidecek biçim: { mode, segments: [[d, v]], srcFrames }
  function hostPlan(p) {
    return { mode: p.mode, segments: p.segments.map(function (s) { return [s.d, s.v]; }), srcFrames: p.srcFrames };
  }

  // Kaynak kare hızı sekanstan düşükse cleanMin altındaki ağır çekim takılabilir
  function quality(p, seqFps, srcFps) {
    var cleanMin = Number(seqFps) > 0 && Number(srcFps) > 0 ? Number(seqFps) / Number(srcFps) : 1;
    var yavas = (p && p.segments ? p.segments : []).filter(function (s) { return s.v < cleanMin - 0.005; }).length;
    return { cleanMin: yuvarla(cleanMin, 4), slowParts: yavas, warn: yavas > 0 };
  }

  // ffmpeg -i stderr'inden medya süresi ve video kare hızı
  function parseMedia(stderr) {
    var s = String(stderr || "");
    var dm = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
    var duration = dm ? Number(dm[1]) * 3600 + Number(dm[2]) * 60 + Number(dm[3]) : null;
    var fps = null;
    var satirlar = s.split(/\r?\n/);
    for (var i = 0; i < satirlar.length; i++) {
      if (!/Stream #[^:]*:\d+.*Video:/.test(satirlar[i])) continue;
      var fm = /([\d.]+)(k?)\s*fps/.exec(satirlar[i]) || /([\d.]+)(k?)\s*tbr/.exec(satirlar[i]);
      if (fm) { fps = Number(fm[1]) * (fm[2] ? 1000 : 1); break; }
    }
    return { duration: duration !== null && isFinite(duration) ? duration : null, fps: fps !== null && fps > 0 ? fps : null };
  }

  /* ---------------- çizim (SVG) ---------------- */

  // Log hız ekseni %25 – %800 (5 oktav), x = çıkış zamanı
  function yEkseni(v, h, pad) {
    var l = clamp(lg(Math.max(1e-6, v)), -2, 3);
    return yuvarla(pad + (3 - l) / 5 * (h - 2 * pad), 2);
  }

  // Eğri yolu (SVG d) — keys [{t, v}] ya da [[t, %]]
  function path(keys, ease, w, h) {
    ease = easeOf(ease);
    var ks = hazir(keys, ease);
    w = Number(w) > 0 ? Number(w) : 120; h = Number(h) > 0 ? Number(h) : 56;
    var pad = Math.max(2, h * 0.06), n = Math.max(24, Math.round(w / 2)), parcalar = [];
    if (ease === "step") {
      // Basamaklı: köşeler tam (örnekleme dikey kenarı bir örnek aralığı kadar eğerdi)
      var son = at(ks, 0, ease), nok = [[0, son]];
      ks.forEach(function (k) { if (k.t > 0 && k.t < 1) { nok.push([k.t, k.v]); son = k.v; } });
      nok.push([1, son]);
      return nok.map(function (q, j) { return (j ? "L" : "M") + yuvarla(q[0] * w, 2) + " " + yEkseni(q[1], h, pad); }).join(" ");
    }
    for (var i = 0; i <= n; i++) {
      var u = i / n;
      var v = at(ks, i === n ? 1 : u, ease);
      parcalar.push((i ? "L" : "M") + yuvarla(u * w, 2) + " " + yEkseni(v, h, pad));
    }
    return parcalar.join(" ");
  }

  var ORNEK_VURUS = [0.125, 0.375, 0.625, 0.875];

  // Kart küçük resmi: { path, base (y %100), hit {x, y} | null, w, h } — "ozel": o.ozelKeys / o.ozelHit
  function thumb(id, w, h, o) {
    var p = onayar(id, o);
    if (!p) throw new Error("Bilinmeyen rampa: " + id);
    o = opts(o);
    w = Number(w) > 0 ? Number(w) : 120; h = Number(h) > 0 ? Number(h) : 56;
    var ks = p.beats ? beatKeys(ORNEK_VURUS, o, 400) : normKeys(p.keys);
    ks = ks.map(function (x) { return { t: x.t, v: Math.pow(x.v, o.k) }; });
    var hu = p.hit;
    if (o.ease === "step") {
      if (hu !== null && hu !== undefined) hu = basamakVurus(ks, hu);
      ks = basamakla(ks);
    }
    var pad = Math.max(2, h * 0.06);
    var hit = null;
    if (hu !== null && hu !== undefined) hit = { x: yuvarla(hu * w, 2), y: yEkseni(at(ks, hu, o.ease), h, pad) };
    return { path: path(ks, o.ease, w, h), base: yEkseni(1, h, pad), hit: hit, w: w, h: h };
  }

  // Yazılacak parçaların çubukları (%100 çizgisinden hıza): [{x, y, w, h, v}]
  function steps(p, w, h) {
    w = Number(w) > 0 ? Number(w) : 320; h = Number(h) > 0 ? Number(h) : 120;
    var pad = Math.max(2, h * 0.06), y100 = yEkseni(1, h, pad), F = p.F || 1, x = 0, out = [];
    (p.segments || []).forEach(function (s) {
      var yv = yEkseni(s.v, h, pad);
      var en = s.d / F * w;
      out.push({ x: yuvarla(x, 2), y: Math.min(y100, yv), w: yuvarla(en, 2), h: yuvarla(Math.max(1, Math.abs(yv - y100)), 2), v: s.v });
      x += en;
    });
    return out;
  }

  function base(h) { h = Number(h) > 0 ? Number(h) : 120; return yEkseni(1, h, Math.max(2, h * 0.06)); }
  function yAt(v, h) { h = Number(h) > 0 ? Number(h) : 120; return yEkseni(v, h, Math.max(2, h * 0.06)); }

  // Okuma satırı için: { pieces, minPct, maxPct, timelineSec, srcSec }
  function summary(p, frame) {
    frame = Number(frame) > 0 ? Number(frame) : 1 / (p.fps || 30);
    var mn = Infinity, mx = 0;
    p.segments.forEach(function (s) { mn = Math.min(mn, s.v); mx = Math.max(mx, s.v); });
    return { pieces: p.segments.length, minPct: Math.round(mn * 100), maxPct: Math.round(mx * 100),
      timelineSec: yuvarla(p.F * frame, 2), srcSec: yuvarla(p.srcFrames * frame, 2) };
  }

  // Katman 3 kancası (Premiere bir gün Time Remapping API'si açarsa): parça sınırlarında
  // { time: aralık başından timeline sn, value: kaynak sn } — Bezier ile anahtar kare yazılır
  function remapKeys(p, srcIn, frame) {
    frame = Number(frame) > 0 ? Number(frame) : 1 / (p.fps || 30);
    var t = 0, s = Number(srcIn) || 0, out = [{ time: 0, value: yuvarla(s, 6) }];
    p.segments.forEach(function (g) {
      t += g.d * frame; s += g.d * g.v * frame;
      out.push({ time: yuvarla(t, 6), value: yuvarla(s, 6) });
    });
    return out;
  }

  /*
   * Panel yardımcısı: host hedefinden plan girdisi.
   *   t: KS_speedRampTargets hedefi; frame: kare süresi (sn)
   *   ek: { media: {duration, fps} | null, playhead, hizala, beats: [{t, guc}] (timeline sn) }
   */
  function clipFor(t, frame, ek) {
    ek = ek || {};
    frame = Number(frame) > 0 ? Number(frame) : 1 / 30;
    var a = Number(t.rangeStart), b = Number(t.rangeEnd), L = b - a;
    var F = Math.round(L / frame);
    var media = ek.media || null;
    var tutamak = media && Number(media.duration) > 0 && isFinite(Number(t.outPoint)) ? Math.max(0, Number(media.duration) - Number(t.outPoint)) : null;
    var hf = null, ph = Number(ek.playhead);
    // Kurgu noktasındaki playhead (ok tuşlarıyla gelinen yer) iki klibin vuruşu sayılmaz: aralık sonu
    // hariç, başından bir kareden yakın playhead hizalamaz
    if (ek.hizala && isFinite(ph) && ph - a >= frame - 1e-9 && ph < b - 1e-9 && L > 0) hf = (ph - a) / L;
    var beats = null;
    if (ek.beats && ek.beats.length && L > 0) {
      beats = [];
      ek.beats.forEach(function (x) {
        var bt = typeof x === "number" ? x : Number(x && x.t);
        if (isFinite(bt) && bt >= a && bt <= b) beats.push({ u: (bt - a) / L, guc: x && typeof x === "object" && isFinite(Number(x.guc)) ? Number(x.guc) : 1 });
      });
    }
    return { frames: F, fps: 1 / frame, partial: !!t.partial, handleSec: tutamak, hitFrac: hf, beatsU: beats,
      srcFps: media && Number(media.fps) > 0 ? Number(media.fps) : null };
  }

  return {
    LIST: list(),
    list: list, has: has, get: function (id) { var p = get(id); return p ? list().filter(function (x) { return x.id === id; })[0] : null; },
    opts: opts, speedAt: speedAt, shape: shape, beatKeys: beatKeys, alignHit: alignHit,
    integrate: integrate, B: B, segment: segment, plan: plan, hostPlan: hostPlan, quality: quality,
    parseMedia: parseMedia, thumb: thumb, steps: steps, path: path, base: base, yAt: yAt,
    summary: summary, remapKeys: remapKeys, clipFor: clipFor,
    // özel eğri (3.4 adım 13)
    ozelDogrula: ozelDogrula, ozelHit: ozelHit, ozelYuzde: ozelYuzde,
    ozelKayitlar: ozelKayitlar, ozelKayitEkle: ozelKayitEkle, ozelKayitSil: ozelKayitSil, ozelKayitAdi: ozelKayitAdi,
    ozelDuz: ozelDuz, ozelAyni: ozelAyni, ozelBilinen: ozelBilinen,
    OZEL_VARSAYILAN: { keys: OZEL_VARSAYILAN.keys.map(function (k) { return [k[0], k[1]]; }), hit: OZEL_VARSAYILAN.hit },
    // SufloEgriEditor mod 'hiz' (js/egri.js) geometrisi ve düzenleme işlemleri
    ozel: {
      ED: { W: OED.W, H: OED.H, PAD: OED.PAD, SOL: OED.SOL }, EN_AZ: OZEL.EN_AZ, EN_COK: OZEL.EN_COK, ARA: OZEL.ARA, X_YAPIS: OZEL.X_YAPIS,
      IZGARA: OZEL.IZGARA.slice(), HIT: OZEL.HIT.slice(), KAYIT: OZEL.KAYIT,
      ekranX: oX, ekranY: oY, egriT: oT, egriV: oV, yapisT: yapisT, yapisV: yapisV,
      ekle: ozelEkle, tasi: ozelTasi, sil: ozelSil, basamak: ozelBasamak, enYakin: ozelEnYakin, yol: ozelYol, izgara: ozelIzgara,
      tusIlgisi: ozelTusIlgisi
    },
    MIN_V: MIN_V, MAX_V: MAX_V, MAX_BEATS: MAX_BEATS, DENSITY: DENSITY
  };
});
