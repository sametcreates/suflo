/*
 * suflo.app/egri#SFC1.… — paylaşılan eğri / Hız Rampası kodunun sayfası (3.4 adım 15)
 *
 * Kod yalnız adresin # kısmında durur (sunucuya gitmez). Çözümleme panelle aynı modülle (js/ease-curve.js, panelin bayt
 * bayt kopyası; SufloEase.paylasimCoz): bozuk kod, yeni sürüm, 8'den çok nokta, sonlu olmayan sayı reddedilir. Sayfaya
 * yazılan her şey textContent ya da sayıdan kurulmuş SVG öznitelikleri; HTML yok. CSP: script-src 'self'.
 * Eğri: değer eğrisi ve onu izleyen kare (canlı önizleme); Hız Rampası kodu: log ölçekli hız grafiği ve ağır çekim anı.
 */
(function () {
  "use strict";

  var E = window.SufloEase;
  var EN = !!(document.documentElement && document.documentElement.lang === "en");
  var SVG_NS = "http://www.w3.org/2000/svg";
  var W = 320, H = 200, PAD = 18;
  var M = EN ? {
    yuklenemedi: "The page did not load completely; refresh it.",
    hata: {
      bos: "There is no code in this link.", uzun: "This code is too long.", onek: "This is not a Suflo curve code.",
      bozuk: "This code could not be read; it may have been copied incompletely.", surum: "This code was made with a newer Suflo version; update Suflo.",
      tur: "This code is not a curve or a speed ramp.", egri: "The curve in this code is invalid.", hiz: "The speed curve in this code is invalid.",
      nokta: "This curve has more than 8 points; Suflo reads at most 8."
    },
    egri: "Easing curve", hiz: "Speed Ramp custom curve", adsiz: "Shared curve", adsizHiz: "Shared speed ramp", baslik: " · Shared Suflo curve",
    tur: { bezier: "cubic-bezier", multi: "Multi-point curve", penner: "Preset curve", spring: "Spring" },
    nokta: function (n) { return n + " points"; }, hit: function (h) { return "Slow-motion moment at " + Math.round(h * 100) + "%"; }, hitYok: "No slow-motion moment",
    kopyalandi: "Copied ✓", kopyala: "Copy code",
    nasilEgri: "In Suflo: Easing tab › Share and import › paste the code and press Load. In Transitions, Zoom or Motion presets: Curve › paste the code.",
    nasilHiz: "In Suflo: Speed Ramp › Custom curve › paste the code into the Speed Ramp code box and press Load."
  } : {
    yuklenemedi: "Sayfa tam yüklenemedi; yenile.",
    hata: {
      bos: "Bu bağlantıda kod yok.", uzun: "Bu kod çok uzun.", onek: "Bu bir Suflo eğri kodu değil.",
      bozuk: "Bu kod okunamadı; eksik kopyalanmış olabilir.", surum: "Bu kod Suflo'nun daha yeni bir sürümüyle yapılmış; Suflo'yu güncelle.",
      tur: "Bu kod bir eğri ya da hız rampası değil.", egri: "Bu koddaki eğri geçersiz.", hiz: "Bu koddaki hız eğrisi geçersiz.",
      nokta: "Bu eğride 8'den çok nokta var; Suflo en çok 8 nokta okur."
    },
    egri: "Yumuşatma eğrisi", hiz: "Hız Rampası özel eğrisi", adsiz: "Paylaşılan eğri", adsizHiz: "Paylaşılan hız rampası", baslik: " · Paylaşılan Suflo eğrisi",
    tur: { bezier: "cubic-bezier", multi: "Çok noktalı eğri", penner: "Hazır eğri", spring: "Yay" },
    nokta: function (n) { return n + " nokta"; }, hit: function (h) { return "Ağır çekim anı %" + Math.round(h * 100); }, hitYok: "Ağır çekim anı yok",
    kopyalandi: "Kopyalandı ✓", kopyala: "Kodu kopyala",
    nasilEgri: "Suflo'da: Eğri sekmesi › Paylaş ve içe aktar › kodu yapıştır, Yükle'ye bas. Geçiş, Zoom ya da Hareket önayarlarında: Eğri › kodu yapıştır.",
    nasilHiz: "Suflo'da: Hız Rampası › Özel eğri › kodu Hız Rampası kodu kutusuna yapıştır, Yükle'ye bas."
  };

  var animasyon = null, egriFn = null, basla = 0;

  function el(id) { return document.getElementById(id); }
  function yaz(id, metin) { var e = el(id); if (e) e.textContent = metin; }
  function n2(v) { return Math.round(v * 100) / 100; }
  function bosalt(e) { while (e && e.firstChild) e.removeChild(e.firstChild); }
  function svg(ad, oz, ust) {
    var e = document.createElementNS(SVG_NS, ad);
    for (var k in oz) if (Object.prototype.hasOwnProperty.call(oz, k)) e.setAttribute(k, String(oz[k]));
    if (ust) ust.appendChild(e);
    return e;
  }

  function hata(mesaj) {
    el("egri-hata").hidden = false;
    yaz("egri-hata-metin", mesaj);
  }

  // Değer eğrisi: y ekseni eğrinin kendi aralığı (en az 0..1, taşma görünsün)
  function egriCiz(curve) {
    var g = el("egri-grafik");
    bosalt(g);
    var pts = E.samplePoints(curve, 160), rg = E.range(curve, 200);
    var lo = Math.min(0, rg.min) - 0.05, hi = Math.max(1, rg.max) + 0.05;
    function x(v) { return PAD + v * (W - 2 * PAD); }
    function y(v) { return PAD + (hi - v) / (hi - lo) * (H - 2 * PAD); }
    svg("line", { x1: x(0), y1: y(0), x2: x(1), y2: y(0), "class": "cizgi" }, g);
    svg("line", { x1: x(0), y1: y(1), x2: x(1), y2: y(1), "class": "cizgi" }, g);
    svg("line", { x1: x(0), y1: y(lo), x2: x(0), y2: y(hi), "class": "cizgi ince" }, g);
    svg("line", { x1: x(1), y1: y(lo), x2: x(1), y2: y(hi), "class": "cizgi ince" }, g);
    svg("path", { d: pts.map(function (p, i) { return (i ? "L" : "M") + n2(x(p.x)) + " " + n2(y(p.y)); }).join(" "), "class": "yol" }, g);
  }

  // Hız grafiği: y log2(hız) %10–%1000, %100 çizgisi vurgulu; sert basamak dikey; ağır çekim anı kesikli dikey çizgi
  function hizCiz(keys, hit) {
    var g = el("egri-grafik");
    bosalt(g);
    var LO = Math.log(10) / Math.LN2, HI = Math.log(1000) / Math.LN2, SOL = 34;
    function x(t) { return SOL + t * (W - SOL - PAD); }
    function y(v) { return PAD + (HI - Math.log(Math.max(10, Math.min(1000, v))) / Math.LN2) / (HI - LO) * (H - 2 * PAD); }
    [25, 50, 100, 200, 400].forEach(function (v) {
      svg("line", { x1: x(0), y1: y(v), x2: x(1), y2: y(v), "class": v === 100 ? "cizgi" : "cizgi ince" }, g);
      var t = svg("text", { x: SOL - 4, y: n2(y(v) + 3), "class": "eksen", "text-anchor": "end" }, g);
      t.textContent = v + "%";
    });
    if (hit !== null && typeof hit === "number") svg("line", { x1: x(hit), y1: PAD, x2: x(hit), y2: H - PAD, "class": "hit" }, g);
    svg("path", { d: keys.map(function (k, i) { return (i ? "L" : "M") + n2(x(k[0])) + " " + n2(y(k[1])); }).join(" "), "class": "yol" }, g);
    keys.forEach(function (k) { svg("circle", { cx: n2(x(k[0])), cy: n2(y(k[1])), r: 3, "class": "nokta" }, g); });
  }

  // Canlı önizleme: kare 0'dan 1'e eğriyle gider, durur, başa döner (yalnız eğri kodunda)
  function kareAdim(ts) {
    var kare = el("egri-kare");
    if (!kare || !egriFn) { animasyon = null; return; }
    if (!basla) basla = ts;
    var sure = 1400, bekle = 600, t = ((ts - basla) % (sure + bekle)) / sure;
    var v = egriFn(Math.min(1, t));
    kare.style.left = (Math.max(-0.2, Math.min(1.2, v)) * 86) + "%";
    animasyon = window.requestAnimationFrame(kareAdim);
  }

  function goster() {
    var kod = "";
    try { kod = decodeURIComponent(String(location.hash || "").replace(/^#/, "")); } catch (e) { kod = String(location.hash || "").replace(/^#/, ""); }
    el("egri-hata").hidden = true;
    el("egri-icerik").hidden = true;
    egriFn = null;
    if (!kod) return;   // kodsuz ziyaret: yalnız "nasıl kullanılır" kartı
    if (!E || !E.paylasimCoz) { hata(M.yuklenemedi); return; }
    var r = E.paylasimCoz(kod);
    if (!r.ok) { hata(M.hata[r.hata] || M.hata.bozuk); return; }
    var hizMi = r.tur === "hiz";
    var ad = r.ad || (hizMi ? M.adsizHiz : M.adsiz);
    yaz("egri-ad", ad);
    document.title = ad + M.baslik;
    yaz("egri-tur", hizMi ? M.hiz : M.egri);
    var css = !hizMi && r.curve.type === "bezier" ? E.toCss(r.curve) : "";
    el("egri-css-sar").hidden = !css;
    yaz("egri-css", css);
    yaz("egri-bicim", hizMi ? M.nokta(r.keys.length) : (r.curve.type === "multi" ? M.tur.multi + " · " + M.nokta(r.curve.pts.length) : M.tur[r.curve.type] || ""));
    el("egri-hit-sar").hidden = !hizMi;
    yaz("egri-hit", hizMi ? (r.hit === null ? M.hitYok : M.hit(r.hit)) : "");
    el("egri-sahne").hidden = hizMi;
    if (hizMi) hizCiz(r.keys, r.hit);
    else {
      egriCiz(r.curve);
      egriFn = E.toFunction(r.curve);
      basla = 0;
      if (!animasyon && typeof window.requestAnimationFrame === "function") animasyon = window.requestAnimationFrame(kareAdim);
    }
    yaz("egri-nasil", hizMi ? M.nasilHiz : M.nasilEgri);
    yaz("egri-kod", kod.replace(/\s+/g, "").replace(/^.*#/, ""));
    el("egri-icerik").hidden = false;
  }

  function kopyala() {
    var kod = el("egri-kod").textContent;
    var b = el("kodu-kopyala");
    function bitti() { b.textContent = M.kopyalandi; setTimeout(function () { b.textContent = M.kopyala; }, 2200); }
    function yedek() {
      var ta = document.createElement("textarea");
      ta.value = kod; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      bitti();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(kod).then(bitti, yedek);
    else yedek();
  }

  el("kodu-kopyala").addEventListener("click", kopyala);
  window.addEventListener("hashchange", goster);
  goster();
})();
