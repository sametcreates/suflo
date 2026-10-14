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
   * onbellek: son tarama { seqId, selSig, kapsam: [a, b], ph } (yoksa null); pk: KS_easePeek sonucu.
   * Döner: 'tara' (sekans ya da seçim değişti, playhead taranan kapsamın dışında), 'ciftler' (yalnız
   * playhead oynadı: çiftler önbellekteki anahtarlardan yeniden hesaplanır) ya da 'bekle'.
   */
  function yoklamaKarari(onbellek, pk) {
    if (!pk || !pk.ok) return "bekle";
    if (!onbellek) return "tara";
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
      if (j0 >= 0 && j1 > j0) return { i0: j0, i1: j1, t0: keys[j0], t1: keys[j1], ic: j1 - j0 - 1, kayitli: true };
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
  // Bu satırın (klip + bileşen + özellik + kimlik) kayıtları
  function satirKayitlari(kayitlar, prop) {
    return (Array.isArray(kayitlar) ? kayitlar : []).filter(function (r) {
      return r && r.tur === "egri" && String(r.nodeId) === String(prop.nodeId) && r.compIdx === prop.compIdx && r.propIdx === prop.propIdx &&
        String(r.matchName || "") === String(prop.matchName || "");
    });
  }
  // Canlı kayıtlar (iki uç + zamanların en az %60'ı önbellekteki anahtarlarda); SufloKeyRecords.canli
  function canliKayitlar(kayitlar, prop) {
    if (!KR) return [];
    return satirKayitlari(kayitlar, prop).filter(function (r) { return KR.canli(r, prop.keys, prop.fps); });
  }
  function uclarDan(kayitlar) {
    return kayitlar.filter(function (r) { return r.uclar; }).map(function (r) { return [r.uclar[0], r.uclar[1]]; });
  }
  // KS_easeScan'e giden ipuçları: canlı kayıtların uçları
  function ipuclari(kayitlar, props) {
    var out = [];
    (props || []).forEach(function (p) {
      canliKayitlar(kayitlar, p).forEach(function (r) {
        if (r.uclar) out.push({ nodeId: p.nodeId, compIdx: p.compIdx, propIdx: p.propIdx, t0: r.uclar[0], t1: r.uclar[1] });
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
  // Yeni kayıtla çakışan eskiler (aynı satır, uç aralıkları kesişir): yeni eğri onların yerine geçer
  function cakisanlar(kayitlar, yeni) {
    return (Array.isArray(kayitlar) ? kayitlar : []).filter(function (r) {
      if (!r || !yeni || r.id === yeni.id || r.tur !== "egri") return false;
      if (String(r.nodeId) !== String(yeni.nodeId) || r.compIdx !== yeni.compIdx || r.propIdx !== yeni.propIdx) return false;
      var a = r.uclar, b = yeni.uclar;
      return !a || !b || (a[0] < b[1] && b[0] < a[1]);
    });
  }

  /* ================= bake ================= */
  /*
   * Seçili satırlardan KS_easeBake çağrıları (klip başına bir). satirlar: [{ prop, cift, kayitli }]
   * (cift prop.pair ile aynı olmalı: uç değerleri taramadan gelir). Döner:
   * { gruplar: [{ target, items }], atlanan: [{ prop, kod }] }.
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
        gruplar.push({ target: { nodeId: p.nodeId, clipName: p.clipName, clipStart: p.clipStart, seqId: seqId || "" }, items: [], satirlar: [] });
      }
      var g = gruplar[dizin[a]];
      g.items.push({ compIdx: p.compIdx, propIdx: p.propIdx, matchName: p.matchName, t0: c.t0, t1: c.t1, v0: p.v0, v1: p.v1,
        keys: plan.keys, degistir: !!c.kayitli });
      g.satirlar.push(s);
    });
    return { gruplar: gruplar, atlanan: atlanan };
  }

  /* ================= gezinme ================= */
  // Sonraki çift: playhead'den sonra başlayan en yakın çiftin başı + 0,25 kare (seçili satırlarda); yoksa ilk çift
  function sonrakiCift(props, ph, fps) {
    var tol = tolerans(fps), en = null, ilk = null;
    (props || []).forEach(function (p) {
      var k = p.keys || [];
      for (var i = 0; i < k.length - 1; i++) {
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
  /*
   * Odak bir metin alanında değilken: Enter uygula, U son uygulamayı geri al, F çevir, I ters çevir,
   * V görünüm (Değer / Hız), 1–9 önayar, Delete / Backspace seçili noktayı sil. Ctrl / Cmd / Alt'lı
   * tuşlar Premiere'e kalır. Döner: { eylem, n } | null.
   */
  function kisayol(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || metinAlani(e.target)) return null;
    var k = String(e.key || "");
    if (k === "Enter") return e.target && String(e.target.tagName || "").toUpperCase() === "BUTTON" ? null : { eylem: "uygula" };
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
    eksik: "bazı anahtar kareler yazılamadı"
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
    satirKayitlari: satirKayitlari, canliKayitlar: canliKayitlar, uclarDan: uclarDan, ipuclari: ipuclari, satirKaydi: satirKaydi, cakisanlar: cakisanlar,
    bakeGruplari: bakeGruplari, sonrakiCift: sonrakiCift, onizlemeAdimlari: onizlemeAdimlari,
    kisayol: kisayol, metinAlani: metinAlani, tusIlgisi: tusIlgisi,
    onayarlar: onayarlar, onayarEkle: onayarEkle, onayarSil: onayarSil, onayarAdi: onayarAdi,
    ekranX: ekranX, ekranY: ekranY, egriX: egriX, egriY: egriY, yapis: yapis,
    degerYolu: degerYolu, hizYolu: hizYolu, kucukYol: kucukYol, duzenlenebilir: duzenlenebilir, tutamaclar: tutamaclar,
    surukle: surukle, noktaEkle: noktaEkle, noktaSil: noktaSil, enYakin: enYakin, sahneKaresi: sahneKaresi,
    nedenMetni: nedenMetni, hataMetni: hataMetni, NEDEN: NEDEN, HATA: HATA
  };
});
