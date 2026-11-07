/*
 * Suflo — Altyazı Efektleri hazır görünüm galerisi (stil kütüphanesi, parti 3)
 *
 * captions.js gorunumleriCiz çipleri (.efekt-cip, data-gorunum, aria-pressed; tıklama gorunumUygula) çizer; bu modül
 * çiplerin görünüşünü ve galeri davranışını taşır:
 *   - ornekVerisi(g, kit) / ornek(doc, g, o): çipin küçük tipografik örneği (yazı tipi, yazı / kontur / vurgu rengi,
 *     arka plan kutusu, minik animasyon glifi). Marka görünümlerinde (g.marka) Marka Kiti açıksa kitin yazı tipi ve
 *     renkleri (SufloMarkaKiti.mergeBrandKit: uygulamayla aynı birleştirme)
 *   - kur(o): kategori sekmeleri (#cap-efekt-kategoriler: Tümü + KATEGORILER; seçim izleyicinin tarayıcısında,
 *     localStorage try/catch içinde), kategori süzgeci (gizlenen çip hidden), ok tuşlarıyla çipler arasında gezinme
 *     (Enter / Boşluk düğmenin kendi tıklaması: uygular), 300 ms üzerinde durunca ya da odaklanınca ad + açıklama ipucu
 *   - suz(kap, kategori): süzgeç (★ Şablonum çipi kategorisiz: her sekmede görünür); döner: görünen çip sayısı
 *   - tusIlgisi(mac): galeri odaktayken CEP'in panelde tutacağı tuşlar (oklar, Home / End, Enter / Boşluk): yoksa
 *     Premiere'e de gider (oynatma kafası kayar). captions.js SufloAracAra.tusIlgisiAyarla ile birleştirir.
 *
 * Fiyat / Pro sınırı burada yok: çip yalnız gorunumUygula'yı tetikler (önizleme ücretsiz; uygulamak her zamanki
 * Pro.gate("overlay", { deneme: true })). Ağ, telemetri yok. ES5, UMD (Node 12 / CEF 74). DOM yalnız verilen
 * belgeden (doc) ve öğelerden; window'a yalnız SufloStilGaleri olarak yazar.
 */
(function (root, factory) {
  var MK = (root && root.SufloMarkaKiti) || null;
  if (!MK && typeof require === "function") { try { MK = require("./marka-kiti.js"); } catch (e) { MK = null; } }
  var api = factory(function () { return (root && root.SufloMarkaKiti) || MK; });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloStilGaleri = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (markaKitiModulu) {
  "use strict";

  var DEPO_ANAHTARI = "suflo.efektKategori";
  var TUMU = "tumu";
  var IPUCU_GECIKME = 300;
  var RENK = /^#[0-9a-f]{6}$/i;

  // Minik animasyon glifleri (çeviriden muaf, aria-hidden): yazı animasyonu ya da klasik giriş + vurgu
  var ANIM_GLIF = {
    "kelime-pop": "•", "yukari-suzul": "↑", "dalga": "~", "zipla-gel": "↓", "daktilo": "|", "harf-belir": "…",
    "netles": "°", "yandan-kay": "»", "aralik-acil": "↔", "olcek-darbe": "+", "renk-gecis": "*", "sallanma": "≈",
    // Parti 5
    "karaoke-dolgu": "▸", "karaoke-birikimli": "≫", "vurgu-kutusu": "■", "vurgu-cizgi": "_", "parlama": "✧", "iki-ton": "◐",
    "kromatik-yumusak": "≋", "buyuyen-vurgu": "⊕", "dusus": "⇣", "kapak-cevir": "⌒", "donerek": "↻", "perde": "▴", "nefes": "○",
    // AutoCaptions koleksiyonu
    "yumusak-kay": "⇡", "bulanik-kay": "⋰", "titrek-kay": "⇞", "isilti-kay": "✦", "kirpis": "◇", "bulanik-kirpis": "◈",
    "hiz-bulanik": "⇉", "puruzlu": "#", "esnet": "⟷", "yakinlas": "⊙", "sagdan-kay": "«", "kelime-belir": "⁞"
  };
  var GIRIS_GLIF = { yok: "", pop: "•", fade: "°", yukari: "↑", asagi: "↓", zipla: "^" };
  var AKTIF_GLIF = { yok: "", zipla: "^", titre: "≈", glitch: "×" };

  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function renk(v, yedek) { return typeof v === "string" && RENK.test(v) ? v.toLowerCase() : yedek; }

  function glif(a) {
    a = a || {};
    if (typeof a.anim === "string" && own(ANIM_GLIF, a.anim)) return ANIM_GLIF[a.anim];
    var g = own(GIRIS_GLIF, a.giris) ? GIRIS_GLIF[a.giris] : "";
    var k = own(AKTIF_GLIF, a.aktif) ? AKTIF_GLIF[a.aktif] : "";
    return g === k ? g : g + k;
  }

  /*
   * Çip örneğinin verisi (saf). g: AE.GORUNUMLER kaydı; kit: Marka Kiti (normalize edilmiş, açık) ya da null.
   * Kit yalnız Marka görünümlerinde örneğe işler (uygulamada her görünüm kitle gelir; galeri kitin yerini
   * Marka görünümlerinde gösterir). Döner: { font, kalin, italik, renk, konturRenk, vurguRenk, kontur, kutu, kutuRenk, glif, kit }
   */
  function ornekVerisi(g, kit) {
    var a = (g && g.ayar) || {};
    var s = a, kitli = false;
    var MK = markaKitiModulu();
    if (g && g.marka === true && kit && kit.on === true && MK && MK.mergeBrandKit) {
      s = MK.mergeBrandKit(a, kit);
      kitli = true;
    }
    var renkY = renk(s.renk, "#ffffff");
    return {
      font: typeof s.font === "string" && s.font ? s.font : "Montserrat",
      kalin: s.kalin !== false, italik: s.italik === true,
      renk: renkY, konturRenk: renk(s.konturRenk, "#000000"),
      vurguRenk: s.vurgu === false ? renkY : renk(s.vurguRenk, renkY),
      kontur: Number(s.kontur) > 0, kutu: s.kutu === true, kutuRenk: renk(s.kutuRenk, "#000000"),
      glif: glif(a), kit: kitli
    };
  }

  // Çipin örnek öğesi: <span.efekt-cip-ornek><span>A</span><span>a</span><i.efekt-cip-anim>glif</i></span>
  function ornek(doc, g, o) {
    var v = ornekVerisi(g, o && o.kit);
    var s = doc.createElement("span");
    s.className = "efekt-cip-ornek" + (v.kit ? " efekt-cip-ornek-kit" : "") + (v.kutu ? " efekt-cip-ornek-kutu" : "") + (v.kontur ? "" : " efekt-cip-ornek-yalin");
    s.setAttribute("data-i18n-skip", "");
    s.setAttribute("aria-hidden", "true");
    s.style.fontFamily = '"' + v.font + '", sans-serif';
    s.style.fontWeight = v.kalin ? "800" : "400";
    s.style.fontStyle = v.italik ? "italic" : "normal";
    s.style.color = v.renk;
    s.style.setProperty("--efekt-kontur", v.kontur ? v.konturRenk : "transparent");
    if (v.kutu) s.style.setProperty("--efekt-kutu", v.kutuRenk);
    var harf = doc.createElement("span");
    harf.textContent = "A";
    var vurgu = doc.createElement("span");
    vurgu.textContent = "a";
    vurgu.style.color = v.vurguRenk;
    s.appendChild(harf);
    s.appendChild(vurgu);
    if (v.glif) {
      var i = doc.createElement("i");
      i.className = "efekt-cip-anim";
      i.textContent = v.glif;
      s.appendChild(i);
    }
    return s;
  }

  /* ---------------- kategori seçimi (izleyicinin tarayıcısında) ---------------- */

  function kayitliKategori(depo, gecerli) {
    var v = "";
    try { v = depo && typeof depo.getItem === "function" ? String(depo.getItem(DEPO_ANAHTARI) || "") : ""; } catch (e) { v = ""; }
    return v === TUMU || (gecerli || []).indexOf(v) !== -1 ? v : TUMU;
  }
  function kategoriKaydet(depo, id) {
    try { if (depo && typeof depo.setItem === "function") depo.setItem(DEPO_ANAHTARI, id); } catch (e) {}
  }

  function cipler(kap) { return kap && kap.querySelectorAll ? Array.prototype.slice.call(kap.querySelectorAll(".efekt-cip")) : []; }
  function gorunenler(kap) { return cipler(kap).filter(function (c) { return !c.hidden; }); }

  // Tab ile galeriye tek durak: seçili (yoksa ilk) görünen çip tabindex 0, diğerleri -1; gizli çip -1
  function sekmeSirasi(kap, odak) {
    var g = gorunenler(kap);
    var hedef = odak && g.indexOf(odak) !== -1 ? odak : (g.filter(function (c) { return c.classList && c.classList.contains("secili"); })[0] || g[0] || null);
    cipler(kap).forEach(function (c) { c.setAttribute("tabindex", c === hedef ? "0" : "-1"); });
    return hedef;
  }

  // Süzgeç: kategorisiz çip (★ Şablonum) her sekmede görünür. Döner: görünen çip sayısı
  function suz(kap, kategori) {
    var n = 0;
    cipler(kap).forEach(function (c) {
      var k = c.getAttribute("data-kategori");
      var gor = !k || kategori === TUMU || !kategori || k === kategori;
      c.hidden = !gor;
      if (gor) { c.removeAttribute("hidden"); n++; } else c.setAttribute("hidden", "");
    });
    sekmeSirasi(kap);
    return n;
  }

  /* ---------------- klavye ---------------- */

  // Galeri odaktayken panelde tutulan tuşlar (CEP sanal tuş kodları: Windows VK, macOS kVK)
  var TUSLAR = { win: [37, 38, 39, 40, 36, 35, 13, 32], mac: [123, 124, 125, 126, 115, 119, 36, 76, 49] };
  function tusIlgisi(mac) { return JSON.stringify(TUSLAR[mac ? "mac" : "win"].map(function (k) { return { keyCode: k }; })); }

  // Tuş → yeni odak dizini (ok tuşları sarar; Home / End uçlara); başka tuşta -1
  function sonrakiDizin(tus, i, n) {
    if (!(n > 0)) return -1;
    if (tus === "ArrowRight" || tus === "ArrowDown" || tus === "Right" || tus === "Down") return (i + 1) % n;
    if (tus === "ArrowLeft" || tus === "ArrowUp" || tus === "Left" || tus === "Up") return (i - 1 + n) % n;
    if (tus === "Home") return 0;
    if (tus === "End") return n - 1;
    return -1;
  }

  function cipBul(kap, t) {
    while (t && t !== kap) {
      if (t.classList && t.classList.contains("efekt-cip")) return t;
      t = t.parentNode;
    }
    return null;
  }

  /*
   * Galeriyi kur (gorunumleriCiz her çizimde çağırır; dinleyiciler kap ve sekme kabına bir kez bağlanır).
   * o: { doc, kap, sekmeler, ipucu, kategoriler: [{ id, ad }], gorunumler: AE.GORUNUMLER, depo (localStorage gibi),
   *      zaman: { kur(fn, ms), sil(id) } (yoksa setTimeout), ilgi(tut: bool) (CEP tuş ilgisi) }
   * Döner: { kategori, gorunen }
   */
  function kur(o) {
    o = o || {};
    var doc = o.doc, kap = o.kap, sekmeler = o.sekmeler, ipucu = o.ipucu;
    if (!doc || !kap) return { kategori: TUMU, gorunen: 0 };
    var katIdleri = (o.kategoriler || []).map(function (k) { return k.id; });
    var zaman = o.zaman || { kur: function (f, ms) { return setTimeout(f, ms); }, sil: function (id) { clearTimeout(id); } };
    var aciklamalar = {};
    (o.gorunumler || []).forEach(function (g) { aciklamalar[g.id] = { ad: g.ad, aciklama: g.aciklama || "" }; });
    var durum = kap.__stilGaleri || (kap.__stilGaleri = { saat: null });
    durum.aciklamalar = aciklamalar;
    durum.zaman = zaman;
    durum.ipucu = ipucu || null;
    durum.ilgi = typeof o.ilgi === "function" ? o.ilgi : null;
    var kategori = kayitliKategori(o.depo, katIdleri);

    function sekmeleriIsaretle(k) {
      if (!sekmeler || !sekmeler.querySelectorAll) return;
      Array.prototype.forEach.call(sekmeler.querySelectorAll(".efekt-kategori"), function (b) {
        var secili = b.getAttribute("data-kategori") === k;
        b.classList.toggle("secili", secili);
        b.setAttribute("aria-selected", secili ? "true" : "false");
      });
    }
    function sec(k) {
      kategori = k;
      kategoriKaydet(o.depo, k);
      ipucuGizle(durum);
      sekmeleriIsaretle(k);
      return suz(kap, k);
    }

    if (sekmeler) {
      sekmeler.innerHTML = "";
      [{ id: TUMU, ad: "Tümü" }].concat(o.kategoriler || []).forEach(function (k) {
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "efekt-kategori";
        b.setAttribute("role", "tab");
        b.setAttribute("data-kategori", k.id);
        b.textContent = k.ad;
        b.addEventListener("click", function () { sec(k.id); });
        sekmeler.appendChild(b);
      });
      sekmeleriIsaretle(kategori);
    }

    if (!durum.bagli) {
      durum.bagli = true;
      kap.addEventListener("keydown", function (e) {
        var c = cipBul(kap, e && e.target);
        if (!c) return;
        var g = gorunenler(kap), j = sonrakiDizin(e.key, g.indexOf(c), g.length);
        if (j < 0) return;
        if (e.preventDefault) e.preventDefault();
        sekmeSirasi(kap, g[j]);
        if (typeof g[j].focus === "function") g[j].focus();
        ipucuPlanla(durum, kap, g[j]);
      });
      ["mouseover", "focusin"].forEach(function (ad) {
        kap.addEventListener(ad, function (e) {
          var c = cipBul(kap, e && e.target);
          if (c) ipucuPlanla(durum, kap, c);
          if (ad === "focusin" && durum.ilgi) durum.ilgi(true);
        });
      });
      ["mouseout", "focusout"].forEach(function (ad) {
        kap.addEventListener(ad, function (e) {
          var hedef = e && e.relatedTarget;
          if (hedef && cipBul(kap, hedef)) return;   // çipten çipe: yeni çipin ipucu kendi planıyla
          ipucuGizle(durum);
          if (ad === "focusout" && durum.ilgi) durum.ilgi(false);
        });
      });
      // Tıklanan çip galerinin Tab durağı olur (seçili görünüm)
      kap.addEventListener("click", function (e) {
        ipucuGizle(durum);
        var c = cipBul(kap, e && e.target);
        if (c) sekmeSirasi(kap, c);
      });
    }
    var n = suz(kap, kategori);
    return { kategori: kategori, gorunen: n };
  }

  /* ---------------- ipucu (ad + açıklama, 300 ms) ---------------- */

  function ipucuPlanla(durum, kap, c) {
    if (durum.saat !== null) { durum.zaman.sil(durum.saat); durum.saat = null; }
    if (!durum.ipucu) return;
    durum.saat = durum.zaman.kur(function () { durum.saat = null; ipucuGoster(durum, kap, c); }, IPUCU_GECIKME);
  }
  function ipucuGoster(durum, kap, c) {
    var ip = durum.ipucu, id = c.getAttribute("data-gorunum");
    if (!ip || c.hidden) return;
    var bilgi = id && own(durum.aciklamalar, id) ? durum.aciklamalar[id] : null;
    var adEl = c.querySelector ? c.querySelector("b") : null;
    var ad = adEl && adEl.textContent ? adEl.textContent : (bilgi ? bilgi.ad : "");
    var aciklama = bilgi ? bilgi.aciklama : (c.getAttribute("data-sablonum") ? "Paylaş ve kaydet › Şablonum yap ile kaydettiğin ayar" : "");
    if (!ad && !aciklama) return;
    ip.innerHTML = "";
    var doc = ip.ownerDocument || null;
    if (doc) {
      var b = doc.createElement("b");
      b.textContent = ad;
      var s = doc.createElement("span");
      s.textContent = aciklama;
      ip.appendChild(b);
      ip.appendChild(s);
    } else ip.textContent = ad + (aciklama ? " — " + aciklama : "");
    // Çipin hemen altında, galeri genişliğinde (dar panelde taşmaz: sol / sağ CSS'te 0)
    if (ip.style && typeof c.offsetTop === "number") ip.style.top = (c.offsetTop + (c.offsetHeight || 0) + 4) + "px";
    ip.hidden = false;
    if (ip.removeAttribute) ip.removeAttribute("hidden");
    c.setAttribute("aria-describedby", ip.id || "");
    durum.gosterilen = c;
  }
  function ipucuGizle(durum) {
    if (durum.saat !== null && durum.zaman) { durum.zaman.sil(durum.saat); durum.saat = null; }
    if (durum.ipucu) durum.ipucu.hidden = true;
    if (durum.gosterilen && durum.gosterilen.removeAttribute) durum.gosterilen.removeAttribute("aria-describedby");
    durum.gosterilen = null;
  }

  return {
    DEPO_ANAHTARI: DEPO_ANAHTARI,
    TUMU: TUMU,
    IPUCU_GECIKME: IPUCU_GECIKME,
    glif: glif,
    ornekVerisi: ornekVerisi,
    ornek: ornek,
    kayitliKategori: kayitliKategori,
    kategoriKaydet: kategoriKaydet,
    suz: suz,
    sekmeSirasi: sekmeSirasi,
    sonrakiDizin: sonrakiDizin,
    tusIlgisi: tusIlgisi,
    kur: kur
  };
});
