/*
 * Suflo — Eğri sekmesi (3.4, plan adım 10): kullanıcının KENDİ anahtar karelerine özel yumuşatma
 *
 * Effect Controls'te iki anahtar kare koy, playhead'i aralarına getir, eğriyi seç, Uygula. Premiere'in
 * betikleri Bezier tutamaçlarını yazamaz: Suflo eğriyi her kareye (ya da 2 / 4 karede bir) sık anahtar
 * kare olarak yazar (js/ease-curve.js bakePlan); uçlardaki iki anahtar kullanıcınındır, değişmez.
 * Düzenleyici, önayarlar, canlı önizleme sahnesi ve geri alma ücretsiz; anahtar karelere UYGULAMAK Pro
 * (Pro.gate('curves'), 3 deneme hakkı; hak yalnız en az bir özellik gerçekten yazılınca düşer). Geri al
 * (satır, Tümünü geri al, U) kapısız: Suflo'nun yazdığını kaldırmak hiçbir zaman ücretli değil.
 *
 * Premiere'e çağrılar yalnız sekme açıkken ve kullanıcı eyleminde: init ve render K.call yapmaz.
 * Yoklama: sekme görünür + panel odakta + host boştayken 1,2 sn'de bir KS_easePeek (ucuz); KS_easeScan
 * yalnız sekans / seçim imzası değişince ya da playhead taranan kapsamdan çıkınca; playhead oynayınca
 * çiftler önbellekteki anahtarlardan yeniden hesaplanır (js/egri-model.js). Uygula her zaman önce taze
 * tarama yapar (uç değerleri o anki hâlinden), host yazmadan önce her şeyi yeniden doğrular.
 * Kayıtlar: SufloKeyRecords (proje başına yerel depo); depo yazılamazsa bu oturumun belleğinde kalır.
 *
 * SufloEgriEditor: SVG eğri düzenleyicisi (Değer / Hız görünümü, tutamaç sürükleme, Shift 0,05'e yapışma,
 * çift tık nokta, Alt tutamaç ayırma, Delete nokta silme, önceki eğrinin hayaleti). Hız Rampası'nın özel
 * eğrisi (adım 13) aynı düzenleyiciyi kullanır.
 * Klip adları ve Premiere'in kendi özellik adları data-i18n-skip içinde (İngilizce arayüz çevirmez).
 * SufloEgriIzgara (eğri kartı ızgarası) ve SufloEgriSecici (Geçiş / Zoom / Hareket önayarlarının "Eğri" açılır seçicisi,
 * 3.4 adım 12) da burada: Eğri sekmesi önayarları ile araçların seçicisi aynı kartları kullanır.
 * Paylaşım (3.4 adım 15, ücretsiz): Kodu kopyala (SFC1 + suflo.app/egri bağlantısı), Kod yapıştır (kod, bağlantı,
 * cubic-bezier / CSS; birden çok kod ya da dosya metni önayarlara eklenir), İçe aktar / Dışa aktar (.suflo-egri dosyası,
 * window.cep.fs pencereleri; bir eğri aracının JSON dışa aktarması da okunur), kendi önayarlarını yeniden adlandırma ve
 * sürükleyerek (ya da ◀ ▶ ile) sıralama. SufloEgriPaylas Hız Rampası ile ortak yapıştırıcıdır. Uygulamak yine 'curves'
 * kapısından geçer; içe aktarmak, kopyalamak ve dosya yazmak hiçbir zaman.
 * Suflo'nun kendi kodu (temiz oda); canlı önizleme sahnesi fikri Rebound'dan (MIT), küçük ve yeniden yazıldı.
 */

/* ======================================================================
 * SufloEgriEditor.olustur(kap, { egri, gorunum: 'deger'|'hiz', degisti(egri, { bitti }), uyari(metin) })
 * SufloEgriEditor.olustur(kap, { mod: 'hiz', anahtarlar, hit, ease, degisti, secim, uyari }) — Hız Rampası özel eğrisi
 *   (3.4 adım 13; aşağıda hizOlustur). 'gorunum: hiz' (Eğri sekmesinin hız grafiği görünümü) ile karıştırma.
 * ====================================================================== */
window.SufloEgriEditor = (function () {
  "use strict";

  var SVG_NS = "http://www.w3.org/2000/svg";
  function svgEl(ad, oz, ust) {
    var e = document.createElementNS(SVG_NS, ad);
    for (var k in oz) if (Object.prototype.hasOwnProperty.call(oz, k)) e.setAttribute(k, String(oz[k]));
    if (ust) ust.appendChild(e);
    return e;
  }
  function bosalt(e) { while (e && e.firstChild) e.removeChild(e.firstChild); }

  function olustur(kap, opts) {
    opts = opts || {};
    if (opts.mod === "hiz") return hizOlustur(kap, opts);
    var E = window.SufloEase, M = window.SufloEgriModel, ED = M.ED;
    var d = {
      egri: E.normalize(opts.egri) || E.builtin("yumusak").curve, hayalet: null,
      gorunum: opts.gorunum === "hiz" ? "hiz" : "deger", secili: -1, surukleme: null
    };
    bosalt(kap);
    var kok = svgEl("svg", { viewBox: "0 0 " + ED.W + " " + ED.H, "class": "egri-svg deger", "aria-hidden": "true", focusable: "false" }, kap);
    var izgara = svgEl("g", { "class": "egri-izgara" }, kok);
    [[0, 0, 1, 0], [0, 1, 1, 1], [0, ED.YMIN, 0, ED.YMAX], [1, ED.YMIN, 1, ED.YMAX]].forEach(function (l, i) {
      svgEl("line", { x1: M.ekranX(l[0]), y1: M.ekranY(l[1]), x2: M.ekranX(l[2]), y2: M.ekranY(l[3]), "class": i < 2 ? "egri-cizgi ana" : "egri-cizgi" }, izgara);
    });
    svgEl("line", { x1: M.ekranX(0), y1: M.ekranY(0.5), x2: M.ekranX(1), y2: M.ekranY(0.5), "class": "egri-cizgi yarim" }, izgara);
    var hayaletYol = svgEl("path", { "class": "egri-hayalet", d: "" }, kok);
    var yol = svgEl("path", { "class": "egri-yol", d: "" }, kok);
    var katman = svgEl("g", { "class": "egri-tutamaclar" }, kok);

    function uyar(m) { if (typeof opts.uyari === "function") { try { opts.uyari(m); } catch (e) {} } }
    function bildir(bitti) { if (typeof opts.degisti === "function") { try { opts.degisti(E.kopya(d.egri), { bitti: !!bitti }); } catch (e) {} } }
    function yolu(c) { return d.gorunum === "deger" ? M.degerYolu(c) : M.hizYolu(c); }

    function ciz() {
      var deger = d.gorunum === "deger";
      yol.setAttribute("d", yolu(d.egri));
      hayaletYol.setAttribute("d", d.hayalet ? yolu(d.hayalet) : "");
      bosalt(katman);
      if (deger) {
        M.tutamaclar(d.egri).forEach(function (t) {
          if (t.tur === "tutamac") {
            svgEl("line", { x1: t.cx, y1: t.cy, x2: t.x, y2: t.y, "class": "egri-kol" }, katman);
            svgEl("circle", { cx: t.x, cy: t.y, r: 5, "class": "egri-tutamac" }, katman);
          } else {
            svgEl("rect", { x: t.x - 4.5, y: t.y - 4.5, width: 9, height: 9, rx: 1.5,
              "class": "egri-nokta" + (t.hedef.i === d.secili ? " secili" : "") + (t.smooth ? "" : " kirik") }, katman);
          }
        });
      }
      kok.setAttribute("class", "egri-svg " + (deger ? "deger" : "hiz") + (M.duzenlenebilir(d.egri) ? "" : " salt"));
    }

    function noktaOku(e) {
      var r = kok.getBoundingClientRect ? kok.getBoundingClientRect() : null;
      if (!r || !(r.width > 0 && r.height > 0)) return null;
      return { px: (e.clientX - r.left) / r.width * ED.W, py: (e.clientY - r.top) / r.height * ED.H };
    }
    kok.addEventListener("pointerdown", function (e) {
      if (d.gorunum !== "deger") return;
      var n = noktaOku(e);
      if (!n) return;
      var t = M.enYakin(d.egri, n.px, n.py, 10);
      if (!t) { if (d.secili !== -1) { d.secili = -1; ciz(); } return; }
      if (e.preventDefault) e.preventDefault();
      d.secili = t.tur === "nokta" ? t.hedef.i : -1;
      d.surukleme = { hedef: t.hedef, id: e.pointerId, oynadi: false };
      d.hayalet = E.kopya(d.egri);
      try { if (kok.setPointerCapture) kok.setPointerCapture(e.pointerId); } catch (eC) {}
      try { if (kap.focus) kap.focus(); } catch (eF) {}
      ciz();
    });
    kok.addEventListener("pointermove", function (e) {
      var s = d.surukleme;
      if (!s) return;
      var n = noktaOku(e);
      if (!n) return;
      var yeni = M.surukle(d.egri, s.hedef, M.egriX(n.px), M.egriY(n.py), { shift: !!e.shiftKey, alt: !!e.altKey });
      if (!yeni) return;
      s.oynadi = true;
      d.egri = yeni;
      ciz();
      bildir(false);
    });
    function birak() {
      var s = d.surukleme;
      if (!s) return;
      d.surukleme = null;
      try { if (kok.releasePointerCapture) kok.releasePointerCapture(s.id); } catch (eR) {}
      if (s.oynadi) bildir(true);
    }
    kok.addEventListener("pointerup", birak);
    kok.addEventListener("pointercancel", birak);
    kok.addEventListener("dblclick", function (e) {
      if (d.gorunum !== "deger") return;
      var n = noktaOku(e);
      if (!n) return;
      if (!M.duzenlenebilir(d.egri)) { uyar("Bu hazır eğrinin tutamacı yok; nokta eklemek için Yumuşak gibi bir bezier eğriyle başla."); return; }
      var yeni = M.noktaEkle(d.egri, M.egriX(n.px));
      if (!yeni) { uyar("Buraya nokta eklenemedi (en çok 8 nokta; komşu noktaya çok yakın)."); return; }
      d.hayalet = E.kopya(d.egri);
      d.egri = yeni;
      d.secili = -1;
      yeni.pts.forEach(function (p, i) { if (i > 0 && i < yeni.pts.length - 1 && Math.abs(p.x - M.egriX(n.px)) < 0.002) d.secili = i; });
      ciz();
      bildir(true);
    });

    function degistir(c, hayalet) {
      var n = E.normalize(c);
      if (!n) return false;
      d.hayalet = hayalet === false ? null : E.kopya(d.egri);
      d.egri = n;
      d.secili = -1;
      ciz();
      return true;
    }

    ciz();
    return {
      egri: function () { return E.kopya(d.egri); },
      // Dışarıdan atama (önayar, metin alanı): önceki eğri hayalet olur; hayalet:false ile hayaletsiz
      egriAta: function (c, o) { return degistir(c, o && o.hayalet); },
      gorunum: function (g) { if (g === "deger" || g === "hiz") { d.gorunum = g; d.surukleme = null; ciz(); } return d.gorunum; },
      gorunumDegistir: function () { d.gorunum = d.gorunum === "deger" ? "hiz" : "deger"; d.surukleme = null; ciz(); return d.gorunum; },
      cevir: function () { var y = E.flip(d.egri); if (!y || !degistir(y)) return false; bildir(true); return true; },
      tersCevir: function () { var y = E.invert(d.egri); if (!y || !degistir(y)) return false; bildir(true); return true; },
      seciliVar: function () { return d.secili > 0; },
      seciliSil: function () {
        if (!(d.secili > 0)) return false;
        var y = M.noktaSil(d.egri, d.secili);
        if (!y || !degistir(y)) return false;
        bildir(true);
        return true;
      },
      ciz: ciz,
      yokEt: function () { d.surukleme = null; bosalt(kap); },
      _d: d
    };
  }

  /*
   * mod 'hiz' (3.4 adım 13): Hız Rampası'nın özel eğrisi.
   * olustur(kap, { mod: 'hiz', anahtarlar ([[t, %]]), hit (ağır çekim anı | null), ease ('smooth'|'linear'|'step'),
   *   degisti(anahtarlar [[t, %]], { bitti, hit }), secim(i, { ic, basamak }), uyari(metin) })
   * y: log2 hız (%10–%1000; 25 / 50 / 100 / 200 / 400 / 800 % çizgileri), x: çıkış zamanı. Tıkla nokta ekler (aynı basışta
   * sürüklenir), sürükle taşır, çift tık siler, Shift ızgaraya yapışır (hız çizgilere, zaman %5'e), Alt+tık sert basamak
   * açar / kapar. 'Ağır çekim anı' çizgisi çizim alanının üstündeki tutamacından yatayda sürüklenir (çizim alanında önce
   * noktalar tutulur: tutamacın altına çekilen nokta da seçilir). Yalnız ana düğme (sol tık; kalem ve dokunma da) nokta
   * ekler / tutar. Delete / Backspace'i panel bağlar (js/hiz-rampasi.js: CEP tuş ilgisi, sil()). Noktalar arası geçiş
   * Yumuşatma seçicisindeki gibi çizilir. Geometri ve işlemler saf ve testli: SufloSpeedRamp.ozel (js/speedramp.js). Premiere'e gitmez.
   * degisti her zaman geçerli anahtarlar verir (SufloSpeedRamp.ozelDogrula); sürüklerken bitti:false, bırakınca true.
   */
  function hizOlustur(kap, opts) {
    var SR = window.SufloSpeedRamp, Z = SR.ozel, ED = Z.ED, iz = Z.izgara();
    var d = { keys: SR.ozelDogrula(opts.anahtarlar), hit: SR.ozelHit(opts.hit), ease: opts.ease || "smooth", secili: -1, surukleme: null, hayalet: null };
    function kopya(ks) { return ks.map(function (k) { return { t: k.t, v: k.v }; }); }
    bosalt(kap);
    var kok = svgEl("svg", { viewBox: "0 0 " + ED.W + " " + ED.H, "class": "egri-svg hiz-ozel-svg", "aria-hidden": "true", focusable: "false" }, kap);
    var izgara = svgEl("g", { "class": "egri-izgara" }, kok);
    iz.dikey.forEach(function (c) {
      svgEl("line", { x1: c.x, y1: iz.ust, x2: c.x, y2: iz.alt, "class": c.t === 0 || c.t === 1 ? "egri-cizgi" : "egri-cizgi yarim" }, izgara);
    });
    iz.yatay.forEach(function (c) {
      svgEl("line", { x1: iz.sol, y1: c.y, x2: iz.sag, y2: c.y, "class": c.ana ? "egri-cizgi ana" : "egri-cizgi" }, izgara);
      svgEl("text", { x: iz.sol - 4, y: c.y + 3, "class": "hiz-eksen hiz-ozel-eksen", "text-anchor": "end" }, izgara).textContent = c.etiket;
    });
    var hitKatman = svgEl("g", { "class": "hiz-ozel-hit" }, kok);
    var hayaletYol = svgEl("path", { "class": "egri-hayalet", d: "" }, kok);
    var yol = svgEl("path", { "class": "egri-yol", d: "" }, kok);
    var katman = svgEl("g", { "class": "egri-tutamaclar" }, kok);
    var okuma = svgEl("text", { "class": "hiz-ozel-okuma", x: 0, y: 0 }, kok);
    // Ağır çekim anı tutamacı çizim alanının üstündeki şeritte (y < iz.ust): en hızlı nokta (%1000) bile iz.ust'te, örtmez
    var TUT_Y = iz.ust - 5, TUT_R = 5;

    function uyar(m) { if (typeof opts.uyari === "function") { try { opts.uyari(m); } catch (e) {} } }
    function bildir(bitti) {
      if (typeof opts.degisti === "function") { try { opts.degisti(SR.ozelYuzde(d.keys), { bitti: !!bitti, hit: d.hit }); } catch (e) {} }
    }
    function esVar(i) { var k = d.keys; return (i > 0 && k[i - 1].t === k[i].t) || (i < k.length - 1 && k[i + 1].t === k[i].t); }
    function secimBildir() {
      if (typeof opts.secim !== "function") return;
      var i = d.secili, ic = i > 0 && i < d.keys.length - 1;
      try { opts.secim(i, { ic: ic, basamak: ic && esVar(i) }); } catch (e) {}
    }
    function seciliAta(i) { if (i !== d.secili) { d.secili = i; secimBildir(); } }

    function ciz() {
      yol.setAttribute("d", Z.yol(d.keys, d.ease));
      hayaletYol.setAttribute("d", d.hayalet ? Z.yol(d.hayalet, d.ease) : "");
      bosalt(katman);
      var n = d.keys.length;
      d.keys.forEach(function (k, i) {
        var x = Z.ekranX(k.t), y = Z.ekranY(k.v);
        svgEl("rect", { x: x - 4.5, y: y - 4.5, width: 9, height: 9, rx: 1.5,
          "class": "egri-nokta" + (i === d.secili ? " secili" : "") + (esVar(i) ? " kirik" : "") + (i === 0 || i === n - 1 ? " uc" : "") }, katman);
      });
      bosalt(hitKatman);
      if (d.hit !== null) {
        var hx = Z.ekranX(d.hit);
        svgEl("line", { x1: hx, y1: TUT_Y, x2: hx, y2: iz.alt, "class": "hiz-vurus-cizgi" }, hitKatman);
        svgEl("circle", { cx: hx, cy: TUT_Y, r: TUT_R, "class": "hiz-vurus hiz-ozel-hit-tutamac" }, hitKatman);
      }
      // seçili noktanın hızı (yalnız sayı ve %: SVG çevrilmez)
      var s = d.keys[d.secili];
      if (s) {
        var sx = Z.ekranX(s.t), sy = Z.ekranY(s.v), sag = sx > ED.W - 60;
        okuma.setAttribute("x", sag ? sx - 8 : sx + 8);
        okuma.setAttribute("y", sy < iz.ust + 14 ? sy + 16 : sy - 8);
        okuma.setAttribute("text-anchor", sag ? "end" : "start");
        okuma.textContent = Math.round(s.v * 100) + "%";
      } else okuma.textContent = "";
    }

    function noktaOku(e) {
      var r = kok.getBoundingClientRect ? kok.getBoundingClientRect() : null;
      if (!r || !(r.width > 0 && r.height > 0)) return null;
      return { px: (e.clientX - r.left) / r.width * ED.W, py: (e.clientY - r.top) / r.height * ED.H };
    }
    function yakala(e) {
      if (e.preventDefault) e.preventDefault();
      try { if (kok.setPointerCapture) kok.setPointerCapture(e.pointerId); } catch (eC) {}
      try { if (kap.focus) kap.focus(); } catch (eF) {}
    }
    function hataMetni(kod) {
      return kod === "dolu" ? "En çok 8 nokta. Yeni nokta için birini çift tıklayıp sil."
        : kod === "yakin" ? "Başka bir noktaya çok yakın; biraz yana tıkla."
        : kod === "uc" ? "Uç noktada sert basamak olmaz; aradaki bir noktayı seç." : "";
    }
    kok.addEventListener("pointerdown", function (e) {
      // Yalnız ana düğme (fare sol tık; kalem ve dokunma da 0): sağ / orta tık (bağlam menüsü, Mac'te iki parmakla
      // dokunma) nokta eklemez, taşımaz, kaydetmez
      if (typeof e.button === "number" && e.button !== 0) return;
      var n = noktaOku(e);
      if (!n) return;
      var i = Z.enYakin(d.keys, n.px, n.py, 9), eklendi = false;
      // Ağır çekim anı: tutamacın şeridi (çizim alanının üstü) her zaman onun; çizim alanında önce noktalar, yakında
      // nokta yoksa çizginin üst ucu da tutar (eskiden üstteki 22 px'te tutamaç öndeydi: oraya çekilen %740 üstü nokta
      // bir daha tutulamaz, seçilemezdi; her basış ağır çekim anını kaydırırdı)
      if (d.hit !== null && Math.abs(n.px - Z.ekranX(d.hit)) <= 7 && (n.py < iz.ust || (i < 0 && n.py <= iz.ust + 10))) {
        d.surukleme = { tur: "hit", id: e.pointerId, oynadi: false };
        yakala(e);
        return;
      }
      if (e.altKey) {
        if (i < 0) return;
        yakala(e);
        var b = Z.basamak(d.keys, i);
        if (b.hata) { uyar(hataMetni(b.hata)); return; }
        d.hayalet = kopya(d.keys);
        d.keys = b.keys;
        d.secili = -1;
        seciliAta(b.i);
        ciz();
        bildir(true);
        return;
      }
      if (i < 0) {
        var r = Z.ekle(d.keys, Z.egriT(n.px), Z.egriV(n.py), { shift: !!e.shiftKey });
        if (r.hata) { if (r.hata !== "gecersiz") uyar(hataMetni(r.hata)); return; }
        d.hayalet = kopya(d.keys);
        d.keys = r.keys;
        i = r.i;
        eklendi = true;
      } else d.hayalet = kopya(d.keys);
      yakala(e);
      d.surukleme = { tur: "nokta", i: i, id: e.pointerId, oynadi: eklendi };
      seciliAta(i);
      ciz();
      if (eklendi) bildir(false);
    });
    kok.addEventListener("pointermove", function (e) {
      var s = d.surukleme;
      if (!s) return;
      var n = noktaOku(e);
      if (!n) return;
      if (s.tur === "hit") {
        var h = SR.ozelHit(Z.yapisT(Z.egriT(n.px), !!e.shiftKey));
        if (h === d.hit) return;
        d.hit = h;
        s.oynadi = true;
        ciz();
        bildir(false);
        return;
      }
      var r = Z.tasi(d.keys, s.i, Z.egriT(n.px), Z.egriV(n.py), { shift: !!e.shiftKey });
      if (!r) return;
      s.oynadi = true;
      d.keys = r.keys;
      ciz();
      bildir(false);
    });
    function birak() {
      var s = d.surukleme;
      if (!s) return;
      d.surukleme = null;
      try { if (kok.releasePointerCapture) kok.releasePointerCapture(s.id); } catch (eR) {}
      if (s.tur === "nokta") {
        // bırakınca doğrula: aynı hıza çekilen basamak tek noktaya iner (dizinler değişebilir: seçim kalkar)
        var once = d.keys.length;
        d.keys = SR.ozelDogrula(d.keys);
        if (d.keys.length !== once) seciliAta(-1);
        ciz();
      }
      if (s.oynadi) bildir(true);
    }
    kok.addEventListener("pointerup", birak);
    kok.addEventListener("pointercancel", birak);
    kok.addEventListener("dblclick", function (e) {
      var n = noktaOku(e);
      if (!n) return;
      var i = Z.enYakin(d.keys, n.px, n.py, 9);
      if (i < 0) return;
      var r = Z.sil(d.keys, i);
      if (!r) { uyar("Uç noktalar silinmez; hızını yukarı / aşağı sürükleyerek değiştir."); return; }
      d.hayalet = kopya(d.keys);
      d.keys = r.keys;
      d.secili = -1;
      secimBildir();
      ciz();
      bildir(true);
    });

    ciz();
    return {
      mod: "hiz",
      // [[t, %]] (geçerli; SufloSpeedRamp.ozelDogrula)
      anahtarlar: function () { return SR.ozelYuzde(d.keys); },
      // Dışarıdan atama (önayardan Düzenle, kayıtlı rampa, Sıfırla): önceki eğri hayalet olur; o.hayalet:false ile hayaletsiz.
      // hit verilmezse (undefined) ağır çekim anı değişmez
      ata: function (keys, hit, o) {
        d.hayalet = o && o.hayalet === false ? null : kopya(d.keys);
        d.keys = SR.ozelDogrula(keys);
        if (hit !== undefined) d.hit = SR.ozelHit(hit);
        d.surukleme = null;
        d.secili = -1;
        secimBildir();
        ciz();
      },
      hit: function (h) { if (arguments.length) { d.hit = SR.ozelHit(h); ciz(); } return d.hit; },
      ease: function (e) { if (e) { d.ease = String(e); ciz(); } return d.ease; },
      secili: function () { return d.secili; },
      // Düğmelerden (Alt / çift tık yerine): seçili iç noktada sert basamak aç / kapat, seçili noktayı sil
      basamak: function () {
        if (d.secili < 0) { uyar("Önce eğride bir nokta seç."); return false; }
        if (!(d.secili > 0 && d.secili < d.keys.length - 1)) { uyar(hataMetni("uc")); return false; }
        var b = Z.basamak(d.keys, d.secili);
        if (b.hata) { uyar(hataMetni(b.hata)); return false; }
        d.hayalet = kopya(d.keys);
        d.keys = b.keys;
        d.secili = -1;
        seciliAta(b.i);
        ciz();
        bildir(true);
        return true;
      },
      sil: function () {
        if (d.secili < 0) { uyar("Önce eğride bir nokta seç."); return false; }
        var r = Z.sil(d.keys, d.secili);
        if (!r) { uyar("Uç noktalar silinmez; hızını yukarı / aşağı sürükleyerek değiştir."); return false; }
        d.hayalet = kopya(d.keys);
        d.keys = r.keys;
        d.secili = -1;
        secimBildir();
        ciz();
        bildir(true);
        return true;
      },
      ciz: ciz,
      yokEt: function () { d.surukleme = null; bosalt(kap); },
      _d: d
    };
  }
  return { olustur: olustur, svgEl: svgEl, bosalt: bosalt };
})();

/* ======================================================================
 * SufloEgriIzgara.ciz(kap, kartlar, { secili, sec(id), sil(id), silBaslik, numarali, tasi(id, hedefId) }) — eğri kartı
 * ızgarası (3.4 adım 12): Eğri sekmesinin önayarları ile Geçiş / Zoom / Hareket eğri seçicisi aynı kartları kullanır.
 * kartlar: [{ id, ad, curve (null: Otomatik, Suflo'nun kendi yumuşatması), kullanici, adCevrilir }]
 * adCevrilir: ad Suflo'nun kendi metni (arayüz sözlüğüyle çevrilir); değilse kart çeviriden muaf (hazır eğri adları
 * zaten arayüz dilinde gelir, kullanıcının adları hiç çevrilmez).
 * tasi (3.4 adım 15): verilirse kullanıcı kartları sürüklenip başka bir kullanıcı kartının üstüne bırakılarak sıralanır
 * (HTML5 sürükle-bırak; klavyeyle Eğri sekmesindeki ◀ ▶ düğmeleri).
 * ====================================================================== */
window.SufloEgriIzgara = (function () {
  "use strict";
  var svgEl = window.SufloEgriEditor.svgEl, bosalt = window.SufloEgriEditor.bosalt;
  var suruklenen = null;   // sürüklenen kullanıcı kartının id'si

  function sinif(e, ad, on) { try { if (e.classList) e.classList.toggle(ad, !!on); } catch (eS) {} }
  // Kullanıcı kartını sürüklenebilir yap: bırakılınca o.tasi(suruklenen, bu kartın id'si)
  function surukleBagla(b, k, o) {
    b.setAttribute("draggable", "true");
    b.draggable = true;
    b.addEventListener("dragstart", function (e) {
      suruklenen = k.id;
      try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k.id); } } catch (eD) {}
      sinif(b, "surukleniyor", true);
    });
    b.addEventListener("dragover", function (e) {
      if (!suruklenen || suruklenen === k.id) return;
      if (e && e.preventDefault) e.preventDefault();
      try { if (e && e.dataTransfer) e.dataTransfer.dropEffect = "move"; } catch (eD) {}
      sinif(b, "birak", true);
    });
    b.addEventListener("dragleave", function () { sinif(b, "birak", false); });
    b.addEventListener("drop", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      sinif(b, "birak", false);
      var id = suruklenen;
      suruklenen = null;
      if (id && id !== k.id) o.tasi(id, k.id);
    });
    b.addEventListener("dragend", function () { suruklenen = null; sinif(b, "surukleniyor", false); });
  }

  // Küçük resim; Otomatik (curve yok): kesikli yumuşak S (Suflo'nun kendi Bezier yumuşatması)
  function kucuk(ust, curve) {
    var E = window.SufloEase, M = window.SufloEgriModel;
    var s = svgEl("svg", { viewBox: "0 0 48 30", "class": "egri-kucuk" + (curve ? "" : " oto"), "aria-hidden": "true", focusable: "false" }, ust);
    svgEl("path", { d: M.kucukYol(curve || E.builtin("yumusak-giris-cikis").curve, 48, 30) }, s);
    return s;
  }

  function ciz(kap, kartlar, o) {
    o = o || {};
    if (!kap) return;
    bosalt(kap);
    (kartlar || []).forEach(function (k, i) {
      var secili = k.id === o.secili;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "egri-onayar" + (secili ? " on" : "") + (k.kullanici ? " kullanici" : "") + (k.curve ? "" : " oto");
      if (!k.adCevrilir) b.setAttribute("data-i18n-skip", "");
      b.setAttribute("data-id", k.id);
      b.setAttribute("aria-pressed", secili ? "true" : "false");
      b.setAttribute("title", (o.numarali && i < 9 ? (i + 1) + " · " : "") + k.ad);
      kucuk(b, k.curve);
      var ad = document.createElement("span");
      ad.textContent = k.ad;
      b.appendChild(ad);
      if (k.kullanici && typeof o.sil === "function") {
        var x = document.createElement("i");
        x.className = "egri-onayar-sil";
        x.setAttribute("role", "button");
        x.setAttribute("title", o.silBaslik || "Önayarı sil");
        x.textContent = "×";
        x.addEventListener("click", function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); o.sil(k.id); });
        b.appendChild(x);
      }
      if (k.kullanici && typeof o.tasi === "function") surukleBagla(b, k, o);
      b.addEventListener("click", function () { if (typeof o.sec === "function") o.sec(k.id); });
      kap.appendChild(b);
    });
  }
  return { ciz: ciz, kucuk: kucuk };
})();

/* ======================================================================
 * SufloEgriSecici.olustur(kap, { arac: 'gecis' | 'zoom' | 'hareket', degisti(ease) }) — Geçiş, Zoom ve Hareket
 * önayarlarının "Eğri" açılır seçicisi (3.4 adım 12). Düğme seçili eğrinin küçük resmini ve adını gösterir; tıklayınca
 * kart ızgarası açılır: Otomatik (Suflo'nun bugünkü yumuşatması, varsayılan), Eğri sekmesindeki eğri, 15 hazır eğri ve
 * Eğri sekmesinde kaydedilen önayarlar. Seçim araç başına bu görüntüleyicinin yerel deposunda kalır (kolaylık; her
 * erişim korumalı, okunamazsa Otomatik). Seçmek ve önizlemek ücretsiz; uygulamak aracın kendi kapısından geçer.
 * Premiere'e gitmez (K.call yok). Kabın içindeki .egri-secici-not açıklaması açılan panele taşınır.
 * 3.4 adım 15: panelde "SFC1 kodu ya da cubic-bezier(…) yapıştır" kutusu (Enter / Kullan; SufloEgriSecim.coz: kod,
 * suflo.app/egri bağlantısı, cubic-bezier, CSS bildirimi, anahtar sözcük); geçersizse nedeni panelde yazar.
 * ====================================================================== */
window.SufloEgriSecici = (function () {
  "use strict";
  var DEPO = "suflo.egri.secim";
  var ONAYAR = "suflo.egri.onayarlar", AYAR = "suflo.egri.ayar";   // Eğri sekmesinin depoları (yalnız okunur)
  var acikSecici = null, disDinleniyor = false;

  function ls() { try { return window.localStorage || null; } catch (e) { return null; } }
  function oku(anahtar) {
    try { var l = ls(), h = l ? l.getItem(anahtar) : null; return h ? JSON.parse(h) : null; } catch (e) { return null; }
  }
  function secimler() { var v = oku(DEPO); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function secimYaz(arac, ease) {
    try {
      var l = ls();
      if (!l) return false;
      var v = secimler();
      v[arac] = ease;
      l.setItem(DEPO, JSON.stringify(v));
      return true;
    } catch (e) { return false; }
  }
  function dil() { return window.SufloI18n && SufloI18n.getLang ? SufloI18n.getLang() : "tr"; }
  function liste() {
    var M = window.SufloEgriModel, E = window.SufloEase;
    var ayar = oku(AYAR);
    return window.SufloEgriSecim.secenekler({ dil: dil(), kullanici: M.onayarlar(oku(ONAYAR) || []),
      duzenleyici: ayar && typeof ayar === "object" ? E.normalize(ayar.egri) : null });
  }
  // Açık seçicinin dışına tıklanınca kapanır (tek dinleyici)
  function disTiklama(e) {
    if (!acikSecici) return;
    var n = e && e.target;
    while (n) { if (n === acikSecici.kap) return; n = n.parentNode; }
    acikSecici.kapat();
  }

  function olustur(kap, opts) {
    opts = opts || {};
    var S = window.SufloEgriSecim;
    if (!kap || !S) return null;
    var arac = String(opts.arac || "");
    var deger = S.kanonik(secimler()[arac]);
    var bosalt = window.SufloEgriEditor.bosalt;
    var api = null;

    // açıklama (index.html'de kabın içinde; panele taşınır)
    var not = null;
    for (var c = 0; c < (kap.children || []).length; c++) {
      if (String(kap.children[c].className || "").indexOf("egri-secici-not") !== -1) { not = kap.children[c]; break; }
    }
    if (not) kap.removeChild(not);
    bosalt(kap);
    var dugme = document.createElement("button");
    dugme.type = "button";
    dugme.className = "egri-secici-dugme";
    dugme.setAttribute("aria-haspopup", "true");
    dugme.setAttribute("aria-expanded", "false");
    dugme.setAttribute("title", "Hareketin nasıl hızlanıp yavaşlayacağı");
    var resim = document.createElement("span");
    resim.className = "egri-secici-resim";
    dugme.appendChild(resim);
    var etiket = document.createElement("span");
    etiket.className = "egri-secici-etiket";
    etiket.textContent = "Eğri";
    dugme.appendChild(etiket);
    var ad = document.createElement("b");
    ad.className = "egri-secici-ad";
    dugme.appendChild(ad);
    var ok = document.createElement("i");
    ok.className = "egri-secici-ok";
    ok.setAttribute("aria-hidden", "true");
    ok.textContent = "▾";
    dugme.appendChild(ok);
    kap.appendChild(dugme);

    var panel = document.createElement("div");
    panel.className = "egri-secici-panel";
    panel.hidden = true;
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Eğri seç");
    var izgara = document.createElement("div");
    izgara.className = "egri-onayarlar egri-secici-izgara";
    panel.appendChild(izgara);
    // 3.4 adım 15: kod / bağlantı / cubic-bezier yapıştır (SufloEgriSecim.coz; ücretsiz, Premiere'e gitmez)
    var yapistir = document.createElement("div");
    yapistir.className = "egri-secici-yapistir";
    var kodGir = document.createElement("input");
    kodGir.type = "text";
    kodGir.className = "egri-secici-kod";
    kodGir.setAttribute("maxlength", "4096");
    kodGir.setAttribute("spellcheck", "false");
    kodGir.setAttribute("autocomplete", "off");
    kodGir.setAttribute("placeholder", "SFC1 kodu ya da cubic-bezier(…) yapıştır");
    kodGir.setAttribute("aria-label", "Eğri kodu yapıştır");
    yapistir.appendChild(kodGir);
    var kodKullan = document.createElement("button");
    kodKullan.type = "button";
    kodKullan.className = "btn tiny egri-secici-kullan";
    kodKullan.textContent = "Kullan";
    yapistir.appendChild(kodKullan);
    panel.appendChild(yapistir);
    var kodHata = document.createElement("p");
    kodHata.className = "egri-secici-hata";
    kodHata.setAttribute("role", "status");
    kodHata.hidden = true;
    panel.appendChild(kodHata);
    if (not) panel.appendChild(not);
    var git = document.createElement("button");
    git.type = "button";
    git.className = "btn tiny egri-secici-git";
    git.textContent = "Kendi eğrini Eğri sekmesinde çiz";
    git.addEventListener("click", function () { kapat(); if (window.KApp && KApp.goster) KApp.goster("egri"); });
    panel.appendChild(git);
    kap.appendChild(panel);

    function kart() { return S.bul(deger, liste()) || S.bul(S.OTOMATIK, []); }
    function dugmeCiz() {
      var k = kart();
      bosalt(resim);
      window.SufloEgriIzgara.kucuk(resim, k.curve);
      ad.textContent = k.ad;
      // Suflo'nun kendi adları (Otomatik, Özel eğri) çevrilir; hazır eğri adı zaten dilde, kullanıcının adı çevrilmez
      if (k.adCevrilir) { if (ad.removeAttribute) ad.removeAttribute("data-i18n-skip"); }
      else ad.setAttribute("data-i18n-skip", "");
      if (dugme.classList) dugme.classList.toggle("ozel", deger !== S.OTOMATIK);
    }
    function izgaraCiz() {
      // seçili kart: saklı ease'in kartı (yeniden adlandırılmış kullanıcı önayarı eğrisiyle bulunur; S.bul)
      window.SufloEgriIzgara.ciz(izgara, liste().map(function (o) {
        return { id: o.ease, ad: o.ad, curve: o.curve, kullanici: false, adCevrilir: o.adCevrilir };
      }), { secili: kart().ease, sec: sec });
    }
    function ac() {
      if (acikSecici && acikSecici !== api) acikSecici.kapat();
      izgaraCiz();
      panel.hidden = false;
      dugme.setAttribute("aria-expanded", "true");
      acikSecici = api;
    }
    function kapat() {
      panel.hidden = true;
      dugme.setAttribute("aria-expanded", "false");
      if (acikSecici === api) acikSecici = null;
    }
    // Geçersiz ease Otomatik olur (ör. bozuk depo, silinmiş önayarın kodu yine geçerlidir: eğriyi taşır)
    function ata(ease) {
      var cz = S.coz(ease);
      deger = cz.ok ? cz.ease : S.OTOMATIK;
      secimYaz(arac, deger);
      dugmeCiz();
      return deger;
    }
    function sec(ease) {
      ata(ease);
      kapat();
      try { if (dugme.focus) dugme.focus(); } catch (eF) {}
      if (typeof opts.degisti === "function") { try { opts.degisti(deger); } catch (eD) {} }
    }
    // Yapıştırılan kod / bağlantı / cubic-bezier: geçerliyse seçilir (panel kapanır), değilse panelde nedeni yazar
    function kodHataGoster(kod) {
      var M = window.SufloEgriModel;
      kodHata.textContent = M && M.paylasimHatasi ? M.paylasimHatasi(kod) : "Geçersiz kod.";
      kodHata.hidden = false;
    }
    function yapistirKullan() {
      var metin = String(kodGir.value || "");
      if (!/\S/.test(metin)) { kodHataGoster("bos"); return false; }
      var cz = S.coz(metin);
      if (!cz.ok) { kodHataGoster(cz.hata); return false; }
      kodGir.value = "";
      kodHata.hidden = true;
      sec(cz.ease);
      if (cz.kirpildi && window.KApp && KApp.toast) KApp.toast("cubic-bezier'in y değerleri -1–2 aralığına kırpıldı.", "warn", 7000);
      return true;
    }
    kodKullan.addEventListener("click", function () { yapistirKullan(); });
    kodGir.addEventListener("keydown", function (e) {
      if (e && (e.key === "Enter" || e.keyCode === 13)) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        yapistirKullan();
      }
    });
    dugme.addEventListener("click", function () { if (panel.hidden) ac(); else kapat(); });
    kap.addEventListener("keydown", function (e) {
      if (e && (e.key === "Escape" || e.keyCode === 27) && !panel.hidden) {
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        kapat();
        try { if (dugme.focus) dugme.focus(); } catch (eF) {}
      }
    });
    if (!disDinleniyor && document.addEventListener) { document.addEventListener("click", disTiklama, true); disDinleniyor = true; }
    if (window.SufloI18n && SufloI18n.onChange) { try { SufloI18n.onChange(function () { dugmeCiz(); if (!panel.hidden) izgaraCiz(); }); } catch (eI) {} }

    api = {
      kap: kap,
      // Seçili eğri: kanonik ease metni ('auto' = Suflo'nun kendi yumuşatması)
      deger: function () { return deger; },
      ata: ata,
      yenile: dugmeCiz,
      ac: ac,
      kapat: kapat,
      acik: function () { return !panel.hidden; },
      // 3.4 adım 15: yapıştırma kutusu (test ve Ctrl+K komut paleti için)
      yapistir: function (metin) { kodGir.value = String(metin === undefined || metin === null ? "" : metin); return yapistirKullan(); },
      _izgara: izgara, _kod: kodGir, _kodHata: kodHata
    };
    dugmeCiz();
    return api;
  }
  return { olustur: olustur, DEPO: DEPO };
})();

/* ======================================================================
 * SufloEgriPaylas (3.4 adım 15): Eğri sekmesi ve Hız Rampası'nın ortak paylaşım yapıştırıcısı — panoya kopyalama,
 * .suflo-egri dosya pencereleri (window.cep.fs) ve içe aktarılanları yerlerine dağıtma. Ücretsiz (kapı yok), Premiere'e
 * gitmez. Kod / dosya biçimi ve doğrulama SufloEase'te (js/ease-curve.js), önayar listeleri SufloEgriModel ve
 * SufloSpeedRamp'te (saf, testli).
 * ====================================================================== */
window.SufloEgriPaylas = (function () {
  "use strict";
  var UZANTI = "suflo-egri";

  function uiMetni(s) { var I = window.SufloI18n; return I && I.tr ? I.tr(s) : s; }
  function cepFs() { try { return window.cep && window.cep.fs ? window.cep.fs : null; } catch (e) { return null; } }
  function kopru() { return typeof K !== "undefined" && K ? K : (window.K || null); }
  function nodeFs() { var k = kopru(); return k && k.fs ? k.fs : null; }
  function bayt() { var E = window.SufloEase; return E && E.LIMITS ? E.LIMITS.DOSYA_BAYT : 65536; }

  /*
   * Panoya kopyala: navigator.clipboard, olmazsa gizli metin alanı + execCommand('copy'). bitti(ok): ok false ise çağıran
   * kodu görünür bir kutuya koyar (kullanıcı Ctrl+C ile kopyalar).
   */
  function kopyala(metin, bitti) {
    var cagrildi = false;
    function son(ok) { if (cagrildi) return; cagrildi = true; if (typeof bitti === "function") { try { bitti(!!ok); } catch (e) {} } }
    function yedek() {
      var ok = false;
      try {
        var ta = document.createElement("textarea");
        ta.value = metin;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        if (ta.select) ta.select();
        ok = !!document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (e) { ok = false; }
      son(ok);
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(metin).then(function () { son(true); }, yedek);
        return;
      }
    } catch (e2) {}
    yedek();
  }

  /*
   * Dosya aç (window.cep.fs.showOpenDialogEx; .suflo-egri ve .json). Okumadan önce boyut denetlenir (en çok 64 KB).
   * Döner: { ok: true, metin, yol } | { ok: false, hata: 'iptal' | 'diyalog' | 'buyuk' | 'okunamadi' }
   */
  function dosyaAc(baslik) {
    var cf = cepFs();
    if (!cf || typeof cf.showOpenDialogEx !== "function") return { ok: false, hata: "diyalog" };
    var r;
    try { r = cf.showOpenDialogEx(false, false, uiMetni(baslik || "Eğri dosyası seç"), "", [UZANTI, "json"]); } catch (e) { return { ok: false, hata: "diyalog" }; }
    if (r && r.err) return { ok: false, hata: "diyalog" };
    var yol = r && r.data && r.data.length ? String(r.data[0]) : "";
    if (!yol) return { ok: false, hata: "iptal" };
    try {
      var fs = nodeFs();
      if (fs) {
        if (fs.statSync(yol).size > bayt()) return { ok: false, hata: "buyuk" };
        return { ok: true, metin: String(fs.readFileSync(yol, "utf8")), yol: yol };
      }
      if (typeof cf.readFile !== "function") return { ok: false, hata: "okunamadi" };
      var o = cf.readFile(yol);
      if (!o || o.err || typeof o.data !== "string") return { ok: false, hata: "okunamadi" };
      return { ok: true, metin: o.data, yol: yol };
    } catch (e2) { return { ok: false, hata: "okunamadi" }; }
  }

  // Kayıt yolunda uzantı yoksa ".suflo-egri" eklenir (Windows'un kaydetme penceresi uzantıyı eklemeyebilir)
  function uzantili(yol) { return new RegExp("\\." + UZANTI.replace("-", "\\-") + "$", "i").test(yol) ? yol : yol + "." + UZANTI; }
  // Pencere yoksa Masaüstü'ne (yoksa ev klasörüne) yeni adla; var olan dosyanın üzerine yazılmaz
  function masaustuYolu(ad) {
    var k = kopru();
    var dir = k.path.join(k.os.homedir(), "Desktop");
    if (!k.fs.existsSync(dir)) dir = k.os.homedir();
    var nokta = ad.indexOf("."), kok = nokta > 0 ? ad.slice(0, nokta) : ad, uz = nokta > 0 ? ad.slice(nokta) : "";
    var aday = k.path.join(dir, ad);
    for (var i = 2; k.fs.existsSync(aday) && i < 100; i++) aday = k.path.join(dir, kok + "-" + i + uz);
    return k.fs.existsSync(aday) ? k.path.join(dir, kok + "-" + Date.now() + uz) : aday;
  }
  // Yol var mı (Node fs, yoksa window.cep.fs.stat); anlaşılamazsa false
  function dosyaVar(yol) {
    try {
      var fs = nodeFs(), cf = cepFs();
      if (fs && typeof fs.existsSync === "function") return !!fs.existsSync(yol);
      if (cf && typeof cf.stat === "function") { var s = cf.stat(yol); return !!s && s.err === 0; }
    } catch (e) {}
    return false;
  }
  // Var olan dosyanın üzerine yazılsın mı (arayüz dilinde sorulur; soru sorulamazsa hayır)
  function uzerineYazOnay(yol) {
    var k = kopru(), ad = k && k.path && typeof k.path.basename === "function" ? k.path.basename(yol) : yol;
    try { return typeof window.confirm === "function" ? !!window.confirm(uiMetni("Bu adla bir dosya zaten var: " + ad + ". Üzerine yazılsın mı?")) : false; } catch (e) { return false; }
  }
  /*
   * Dosyaya kaydet (window.cep.fs.showSaveDialogEx). Pencere yoksa Masaüstü'ne yazar.
   * Döner: { ok: true, yol } | { ok: false, hata: 'iptal' | 'diyalog' | 'yazilamadi' }
   */
  function dosyaKaydet(metin, varsayilanAd, baslik) {
    var cf = cepFs(), fs = nodeFs(), yol = "";
    try {
      if (cf && typeof cf.showSaveDialogEx === "function") {
        var r = cf.showSaveDialogEx(uiMetni(baslik || "Eğri önayarlarını kaydet"), "", [UZANTI], varsayilanAd || ("suflo-egriler." + UZANTI));
        if (r && r.err) return { ok: false, hata: "diyalog" };
        yol = r && typeof r.data === "string" ? r.data : "";
        if (!yol) return { ok: false, hata: "iptal" };
        // Uzantı sonradan eklendiyse pencerenin "üzerine yazılsın mı" sorusu bu adı görmedi: dosya varsa burada sorulur
        // (3.4 adım 15 incelemesi; yoksa eski bir dışa aktarma sessizce silinirdi)
        var tam = uzantili(yol);
        if (tam !== yol && dosyaVar(tam) && !uzerineYazOnay(tam)) return { ok: false, hata: "iptal" };
        yol = tam;
      } else if (fs && kopru().path && kopru().os) yol = masaustuYolu(varsayilanAd || ("suflo-egriler." + UZANTI));
      else return { ok: false, hata: "diyalog" };
    } catch (e) { return { ok: false, hata: "diyalog" }; }
    try {
      if (fs) fs.writeFileSync(yol, metin, "utf8");
      else {
        var w = cf.writeFile(yol, metin);
        if (w && w.err) return { ok: false, hata: "yazilamadi" };
      }
      return { ok: true, yol: yol };
    } catch (e2) { return { ok: false, hata: "yazilamadi" }; }
  }

  /*
   * İçe aktarılanları yerlerine dağıt: 'egri' → Eğri sekmesinin önayarları (KEgri.onayarlariIceAl), 'hiz' → Hız Rampası'nın
   * adlı özel rampaları (KHizRampasi.ozelKayitlariIceAl). r: SufloEase.iceAktar sonucu (ok).
   * Döner: { ozet: SufloEgriModel.iceAktarOzeti, egri: [eklenen id], hiz: [eklenen id] }
   */
  function iceAl(r) {
    var egriler = [], hizlar = [];
    ((r && r.presets) || []).forEach(function (p) { if (p && p.tur === "hiz") hizlar.push(p); else if (p) egriler.push(p); });
    var o = { egri: 0, hiz: 0, yinelenen: Number(r && r.yinelenen) || 0, dolu: 0, hizDolu: 0, alinamadi: 0, uyarilar: (r && r.uyarilar) || [] };
    var sonuc = { egri: [], hiz: [] };
    function dagit(liste, fn, tur) {
      if (!liste.length) return;
      var s = null;
      try { s = typeof fn === "function" ? fn(liste) : null; } catch (e) { s = null; }
      if (!s || !s.ok) { o.alinamadi += liste.length; return; }
      o[tur] = s.eklenen.length;
      o.yinelenen += s.yinelenen || 0;
      if (tur === "egri") o.dolu = s.dolu || 0; else o.hizDolu = s.dolu || 0;
      sonuc[tur] = s.eklenen.slice();
    }
    dagit(egriler, window.KEgri && window.KEgri.onayarlariIceAl, "egri");
    dagit(hizlar, window.KHizRampasi && window.KHizRampasi.ozelKayitlariIceAl, "hiz");
    var M = window.SufloEgriModel;
    sonuc.ozet = M && M.iceAktarOzeti ? M.iceAktarOzeti(o) : { parcalar: [], uyari: true, eklenen: o.egri + o.hiz };
    // saklanamayan (liste dolu ya da depo yazılamadı) önayar sayısı: kod kutusu o zaman boşaltılmaz
    sonuc.kalan = o.dolu + o.hizDolu + o.alinamadi;
    return sonuc;
  }
  // Hata kodu → metin (SufloEgriModel.paylasimHatasi; o yoksa kısa yedek)
  function hataMetni(kod) {
    var M = window.SufloEgriModel;
    return M && M.paylasimHatasi ? M.paylasimHatasi(kod) : "Geçersiz kod.";
  }

  return { kopyala: kopyala, dosyaAc: dosyaAc, dosyaKaydet: dosyaKaydet, iceAl: iceAl, hataMetni: hataMetni, uzantili: uzantili, UZANTI: UZANTI };
})();

/* ======================================================================
 * KEgri: sekme denetleyicisi
 * ====================================================================== */
window.KEgri = (function () {
  "use strict";

  var svgEl = window.SufloEgriEditor.svgEl, bosalt = window.SufloEgriEditor.bosalt;
  var E = window.SufloEase, M = window.SufloEgriModel, KR = window.SufloKeyRecords;
  var AYAR_ANAHTAR = "suflo.egri.ayar";
  var ONAYAR_ANAHTAR = "suflo.egri.onayarlar";
  var YAYLAN_ANAHTAR = "suflo.egri.yaylan";   // Varışta yaylan ayarları (3.4 adım 14; bu görüntüleyicinin kolaylığı)

  var editor = null;
  var yaylan = { genlik: 0.1, frekans: 3, sonum: 6, tum: false };   // Varışta yaylan ayarı (init yaylanYukle ile M.yaylanAyar)
  var egri = null, seciliOnayar = "yumusak";
  // Yapıştırılan koddan yüklenen eğrinin adı (3.4 adım 15): eğri değişmediyse Önayar olarak kaydet ve Kodu kopyala bu adı kullanır
  var bekleyen = null;          // { ad, j: eğrinin JSON'u }
  var gorunum = "deger";
  var onbellek = null;          // son KS_easeScan (+ selSig)
  var sonPeek = null;
  var ph = 0;
  var kapali = {};              // satirAnahtari → true: kullanıcı işareti kaldırdı
  var mesgul = false, yoklaniyor = false, zamanlayici = null;
  var tazeleGerek = false;      // odak Premiere'e gitti / sekme yeniden açıldı: sonraki yoklama bir kez tarar
  var sonUygulanan = [];        // son uygulamanın kayıt id'leri (U)
  var bellek = [];              // depoya yazılamayan kayıtlar (bu oturum)
  var onizleme = null;          // Premiere'de önizle jetonu
  var tusTutuluyor = false;
  var depoNesnesi = null;
  var sahneRaf = null, sahneBas = 0;

  function el(id) { return document.getElementById(id); }
  function dil() { return window.SufloI18n && SufloI18n.getLang ? SufloI18n.getLang() : "tr"; }
  function tr(s) { return window.SufloI18n && SufloI18n.tr ? SufloI18n.tr(s) : s; }
  function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------------- metin parçaları (kullanıcı adları çevrilmez) ---------------- */
  function dugum(parcalar) {
    var kap = document.createElement("span");
    (parcalar || []).forEach(function (p) {
      if (p && typeof p === "object") {
        var b = document.createElement("b");
        b.setAttribute("data-i18n-skip", "");
        b.textContent = String(p.ad);
        kap.appendChild(b);
      } else if (p !== null && p !== undefined && p !== "") kap.appendChild(document.createTextNode(String(p)));
    });
    return kap;
  }
  function durum(msg, cls) {
    var e = el("egri-status");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    if (Array.isArray(msg)) { e.textContent = ""; e.appendChild(dugum(msg)); }
    else e.textContent = msg || "";
  }
  function toast(msg, tur, sure, eylem) { if (window.KApp && KApp.toast) KApp.toast(msg, tur, sure, eylem); }
  // Evet / hayır sorusu (Geçişler / Zoom'daki gibi window.confirm, arayüz dilinde); soramazsa hayır
  function uiMetni(s) { return tr(s); }
  function onayla(soru) {
    try { return typeof window.confirm === "function" ? !!window.confirm(uiMetni(soru)) : false; } catch (e) { return false; }
  }

  /* ---------------- yerel depo (bu görüntüleyicinin kolaylığı; her erişim korumalı) ---------------- */
  function depoOku(anahtar, varsayilan) {
    try {
      var ls = window.localStorage, ham = ls ? ls.getItem(anahtar) : null;
      if (!ham) return varsayilan;
      var v = JSON.parse(ham);
      return v === null || v === undefined ? varsayilan : v;
    } catch (e) { return varsayilan; }
  }
  function depoYaz(anahtar, deger) {
    try { if (window.localStorage) window.localStorage.setItem(anahtar, JSON.stringify(deger)); return true; } catch (e) { return false; }
  }
  function ayarKaydet() {
    depoYaz(AYAR_ANAHTAR, { egri: egri, secili: seciliOnayar, gorunum: gorunum, yogunluk: yogunluk() });
  }
  function ayarYukle() {
    var a = depoOku(AYAR_ANAHTAR, null);
    egri = E.builtin("yumusak").curve;
    if (!a || typeof a !== "object") return;
    var c = E.normalize(a.egri);
    if (c) egri = c;
    if (typeof a.secili === "string") seciliOnayar = a.secili.slice(0, 24);
    if (a.gorunum === "hiz") gorunum = "hiz";
    var y = Number(a.yogunluk);
    if (M.YOGUNLUKLAR.indexOf(y) !== -1 && el("egri-yogunluk")) el("egri-yogunluk").value = String(y);
  }
  function yogunluk() {
    var y = Number(el("egri-yogunluk") ? el("egri-yogunluk").value : 1);
    return M.YOGUNLUKLAR.indexOf(y) !== -1 ? y : 1;
  }
  function kullaniciOnayarlari() { return M.onayarlar(depoOku(ONAYAR_ANAHTAR, [])); }

  /* ---------------- anahtar kare kayıtları ---------------- */
  function depo() { if (!depoNesnesi && KR) depoNesnesi = KR.depo(); return depoNesnesi; }
  function proje() { return (onbellek && onbellek.proje) || (sonPeek && sonPeek.proje) || ""; }
  function seqId() { return (onbellek && onbellek.seqId) || (sonPeek && sonPeek.seqId) || ""; }
  function kayitlar() {
    var d = depo(), liste = [];
    try { liste = d ? d.oku(proje()) : []; } catch (e) { liste = []; }
    var idler = {};
    liste.forEach(function (r) { idler[r.id] = 1; });
    bellek.forEach(function (r) { if (!idler[r.id]) liste.push(r); });
    // Eğri sekmesinin kayıtları: Eğri ('egri') ve varışta yaylanma ('yaylan', 3.4 adım 14)
    return liste.filter(function (r) { return r && (r.tur === "egri" || r.tur === "yaylan"); });
  }
  // yeni: host'un doğruladığı kayıtlar (çakışan eskilerin yerine geçer: Eğri aynı aralıkta, yaylanma aynı inişte);
  // gecici: zaman aşımında planlanan zamanlar (yazıldığı bilinmez: eskiler atılmaz, Geri al yalnız canlıysa siler).
  // Döner: { ok (hepsi depoda), atilan (yer açmak için atılan eski kayıt: depo sınırı; kullanıcıya söylenir) }
  function kayitlariSakla(yeni, gecici) {
    gecici = gecici || [];
    var d = depo(), pr = proje(), eski = kayitlar(), at = {};
    var hepsi = yeni.concat(gecici);
    hepsi.forEach(function (r) { r.id = KR.yeniId(Date.now()); });
    yeni.forEach(function (r) {
      (r.tur === "yaylan" ? M.yaylanCakisanlar(eski, r) : M.cakisanlar(eski, r)).forEach(function (x) { at[x.id] = 1; });
    });
    var atilacak = Object.keys(at);
    bellek = bellek.filter(function (r) { return !at[r.id]; });
    var ok = false, atilan = 0;
    try {
      if (d && atilacak.length) d.kaldir(pr, atilacak);
      var s = d ? d.ekle(pr, hepsi) : null;
      ok = !!(s && s.ok);
      atilan = s && Number(s.atilan) > 0 ? Number(s.atilan) : 0;
    } catch (e) { ok = false; }
    if (!ok) hepsi.forEach(function (r) { bellek.push(r); });
    sonUygulanan = hepsi.map(function (r) { return r.id; });
    return { ok: ok, atilan: atilan };
  }
  // Saklama sonucunun uyarıları (Eğri ve yaylanma uygulaması): saklanamadı ya da yer açmak için eski kayıtlar atıldı
  function saklamaUyarisi(sak) {
    if (!sak.ok) toast("Geri al kaydı bu bilgisayarda saklanamadı; Geri al yalnız panel açıkken çalışır.", "warn", 9000);
    if (sak.atilan) toast("Yer açmak için en eski " + sak.atilan + " Suflo Geri al kaydı silindi; o anahtar kareler Premiere'de kalır ama Suflo onları artık geri alamaz.", "warn", 12000);
  }
  // Projenin depodaki kayıtları (bellek hariç: yalnız depodakiler yer tutar)
  function depodakiler() {
    try { var d = depo(); return d ? d.oku(proje()) : []; } catch (e) { return []; }
  }
  function kayitlariSil(idler) {
    if (!idler.length) return;
    var set = {};
    idler.forEach(function (id) { set[id] = 1; });
    bellek = bellek.filter(function (r) { return !set[r.id]; });
    sonUygulanan = sonUygulanan.filter(function (id) { return !set[id]; });
    try { var d = depo(); if (d) d.kaldir(proje(), idler); } catch (e) {}
  }

  /* ---------------- önayarlar ---------------- */
  function tumOnayarlar() {
    var out = E.builtins().map(function (b) { return { id: b.id, ad: E.builtinName(b, dil()), curve: b.curve, kullanici: false }; });
    kullaniciOnayarlari().forEach(function (o) { out.push({ id: o.id, ad: o.ad, curve: o.curve, kullanici: true }); });
    return out;
  }
  function onayarKartlari() {
    var kap = el("egri-onayarlar");
    if (!kap) return;
    // Adı ve ipucunu panel kendisi dile göre yazar (yerleşik adlar SufloEase'ten; "Yumuşak" başka araçta "Smooth"):
    // kartlar çeviriden muaf. Aynı ızgara Geçiş / Zoom / Hareket eğri seçicisinde (SufloEgriIzgara, adım 12)
    window.SufloEgriIzgara.ciz(kap, tumOnayarlar().map(function (o) {
      return { id: o.id, ad: o.ad, curve: o.curve, kullanici: o.kullanici, adCevrilir: false };
    }), { secili: seciliOnayar, numarali: true, sec: onayarSec, sil: onayarSil, silBaslik: tr("Önayarı sil"), tasi: onayarSurukle });
    duzenCiz();
  }
  function onayarSec(id) {
    var o = tumOnayarlar().filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    seciliOnayar = id;
    egri = E.normalize(o.curve);
    if (editor) editor.egriAta(egri);
    egriDegisti(false);
    onayarKartlari();
  }
  function onayarKaydet() {
    // Varsayılan ad arayüzün dilinde kaydedilir ("My curve 2"); kart data-i18n-skip, sonradan çevrilmez. Koddan yüklenen
    // eğri değişmediyse kodun adı (3.4 adım 15; aynı ad varsa "Ad (2)")
    var liste = kullaniciOnayarlari(), kodAdi = bekleyenAd();
    var ad = kodAdi ? M.benzersizAd(kodAdi, liste.map(function (o) { return o.ad; })) : tr(M.onayarAdi(liste));
    var r = M.onayarEkle(liste, ad, egri, Date.now());
    if (!r.ok) { durum(r.kod === "dolu" ? "En çok " + M.EN_COK_ONAYAR + " önayar saklanır; birini sil." : "Bu eğri saklanamadı.", "warn"); return; }
    if (!depoYaz(ONAYAR_ANAHTAR, r.liste)) { durum("Önayar bu bilgisayarda saklanamadı.", "warn"); return; }
    seciliOnayar = r.id;
    onayarKartlari();
    durum("Önayar kaydedildi.", "good");
  }
  function onayarSil(id) {
    depoYaz(ONAYAR_ANAHTAR, M.onayarSil(kullaniciOnayarlari(), id));
    if (seciliOnayar === id) seciliOnayar = "";
    onayarKartlari();
  }

  /* ---------------- önayar düzeni ve paylaşım (3.4 adım 15; ücretsiz: kapı yok, Premiere'e gitmez) ---------------- */
  function seciliSira() {
    var l = kullaniciOnayarlari();
    for (var i = 0; i < l.length; i++) if (l[i].id === seciliOnayar) return { liste: l, i: i };
    return { liste: l, i: -1 };
  }
  // Seçili kullanıcı önayarının satırı: ad kutusu, Adı değiştir, ◀ ▶ (sürükle-bırakın klavye karşılığı)
  function duzenCiz() {
    var kutu = el("egri-onayar-duzen");
    if (!kutu) return;
    var s = seciliSira();
    kutu.hidden = s.i < 0;
    if (s.i < 0) return;
    var g = el("egri-onayar-ad");
    if (g && document.activeElement !== g) g.value = s.liste[s.i].ad;
    if (el("egri-onayar-sola")) el("egri-onayar-sola").disabled = s.i === 0;
    if (el("egri-onayar-saga")) el("egri-onayar-saga").disabled = s.i === s.liste.length - 1;
  }
  function onayarAdlandir() {
    var g = el("egri-onayar-ad"), id = seciliOnayar;
    var r = M.onayarAdlandir(kullaniciOnayarlari(), id, g ? String(g.value || "") : "");
    if (!r.ok) { durum(r.kod === "ad" ? "Önayara bir ad yaz." : "Önce kendi önayarlarından birini seç.", "warn"); return; }
    if (!depoYaz(ONAYAR_ANAHTAR, r.liste)) { durum("Önayar bu bilgisayarda saklanamadı.", "warn"); return; }
    var yeni = r.liste.filter(function (o) { return o.id === id; })[0];
    if (g) g.value = yeni ? yeni.ad : "";
    onayarKartlari();
    durum(["Adı değişti: ", { ad: yeni ? yeni.ad : "" }], "good");
  }
  // id'li önayarı kullanıcı önayarları içinde hedef sıraya taşı (◀ ▶ ve sürükle-bırak)
  function onayarTasi(id, hedef) {
    var once = kullaniciOnayarlari();
    var l = M.onayarTasi(once, id, hedef);
    if (JSON.stringify(l) === JSON.stringify(once)) return false;
    if (!depoYaz(ONAYAR_ANAHTAR, l)) { durum("Önayar bu bilgisayarda saklanamadı.", "warn"); return false; }
    onayarKartlari();
    return true;
  }
  function onayarSurukle(id, hedefId) {
    var l = kullaniciOnayarlari(), h = -1;
    l.forEach(function (o, i) { if (o.id === hedefId) h = i; });
    if (h >= 0) onayarTasi(id, h);
  }
  function onayarKaydir(yon) {
    var s = seciliSira();
    if (s.i < 0) return;
    if (onayarTasi(seciliOnayar, s.i + yon)) {
      var b = el(yon < 0 ? "egri-onayar-sola" : "egri-onayar-saga");
      // en uca gelince düğme kapanır; odak öbür yöne geçsin (klavyeyle sürdürülebilsin)
      if (b && b.disabled) b = el(yon < 0 ? "egri-onayar-saga" : "egri-onayar-sola");
      try { if (b && b.focus) b.focus(); } catch (e) {}
    }
  }

  // Koddan yüklenen eğrinin adı, eğri o andan beri değişmediyse
  function bekleyenAd() {
    return bekleyen && egri && JSON.stringify(E.normalize(egri)) === bekleyen.j ? bekleyen.ad : "";
  }
  // Paylaşılacak ad: seçili kendi önayarı (eğri aynıysa) ya da koddan yüklenen eğrinin adı; hazır eğride ad yok
  function paylasilacakAd() {
    var s = seciliSira(), j = JSON.stringify(E.normalize(egri));
    if (s.i >= 0 && JSON.stringify(E.normalize(s.liste[s.i].curve)) === j) return s.liste[s.i].ad;
    return bekleyenAd();
  }
  function kodKopyala() {
    var kod = E.paylasimKodla({ tur: "egri", ad: paylasilacakAd(), curve: egri });
    if (!kod) { durum("Bu eğri paylaşılamadı.", "warn"); return; }
    var metin = kod + "\n" + E.egriAdresi(kod, dil());
    window.SufloEgriPaylas.kopyala(metin, function (ok) {
      if (ok) { toast("Eğri kodu ve suflo.app/egri bağlantısı kopyalandı", "good", 7000); return; }
      // pano yoksa kod kutuya konur: kullanıcı Ctrl+C ile kopyalar
      var g = el("egri-kod");
      if (g) { g.value = kod; try { if (g.focus) g.focus(); if (g.select) g.select(); } catch (e) {} }
      durum("Kopyalanamadı; kod aşağıdaki kutuda, Ctrl+C ile kopyala.", "warn");
    });
  }
  // Tek eğriyi düzenleyiciye yükle (yapıştırılan tek kod / cubic-bezier). Döner: true
  function egriYukle(p, kirpildi, kaynak) {
    egri = E.normalize(p.curve);
    if (editor) editor.egriAta(egri);
    egriDegisti(true);
    bekleyen = p.ad ? { ad: p.ad, j: JSON.stringify(egri) } : null;
    if (p.ad) durum(["Yüklendi: ", { ad: p.ad }, ". Saklamak için Önayar olarak kaydet."], "good");
    else if (kirpildi) durum("cubic-bezier yüklendi; y değerleri -1–2 aralığına kırpıldı.", "warn");
    else durum(kaynak === "css" ? "cubic-bezier yüklendi." : "Eğri yüklendi. Saklamak için Önayar olarak kaydet.", "good");
    return true;
  }
  /*
   * Kod yapıştır kutusu: tek eğri kodu / bağlantı / cubic-bezier düzenleyiciye yüklenir (önayar olarak kaydetmek
   * kullanıcının elinde); birden çok kod, Hız Rampası kodu ya da yapıştırılan dosya metni önayarlara eklenir
   * (eğriler buraya, hız eğrileri Hız Rampası'nın kayıtlı rampalarına).
   */
  function kodYukle() {
    var g = el("egri-kod"), metin = g ? String(g.value || "") : "";
    var r = E.iceAktar(metin);
    if (!r.ok) {
      var json = /^\s*\{/.test(metin);
      durum(window.SufloEgriPaylas.hataMetni(json && r.hata === "bicim" ? "dosyaBicim" : r.hata), "warn");
      return false;
    }
    if ((r.bicim === "kod" || r.bicim === "css") && r.presets.length === 1 && !r.uyarilar.length && !r.yinelenen && r.presets[0].tur === "egri") {
      if (g) g.value = "";
      return egriYukle(r.presets[0], r.kirpildi, r.bicim);
    }
    return iceAlGoster(r, g);
  }
  // kutu (kod kutusu): yalnız saklanamayan kalmadıysa boşalır (liste dolu / depo yazılamadı: kodlar kutuda kalır, yer açınca
  // yeniden yüklenir; hepsi yinelenense boşalır)
  function iceAlGoster(r, kutu) {
    var s = window.SufloEgriPaylas.iceAl(r);
    // tek eğri eklendiyse seçilir ve düzenleyiciye gelir (birden çoksa düzenleyicideki eğri yerinde kalır)
    if (s.egri.length === 1) onayarSec(s.egri[0]);
    durum(s.ozet.parcalar, s.ozet.uyari ? "warn" : "good");
    if (kutu && !(s.kalan > 0)) kutu.value = "";
    return s.ozet.eklenen > 0;
  }
  function dosyaIceAktar() {
    var d = window.SufloEgriPaylas.dosyaAc("Eğri dosyası seç (.suflo-egri ya da JSON)");
    if (!d.ok) { if (d.hata !== "iptal") durum(window.SufloEgriPaylas.hataMetni(d.hata), "warn"); return false; }
    var r = E.iceAktar(d.metin);
    if (!r.ok) { durum(window.SufloEgriPaylas.hataMetni(r.hata === "bicim" ? "dosyaBicim" : r.hata), "warn"); return false; }
    return iceAlGoster(r);
  }
  function dosyaDisaAktar() {
    var liste = M.onayarlariDisa(kullaniciOnayarlari());
    if (!liste.length) { durum("Dışa aktarılacak önayar yok: önce bir eğriyi Önayar olarak kaydet.", "warn"); return false; }
    var y = E.dosyaYaz(liste);
    var s = window.SufloEgriPaylas.dosyaKaydet(y.metin, "suflo-egriler." + window.SufloEgriPaylas.UZANTI, "Eğri önayarlarını kaydet");
    if (!s.ok) { if (s.hata !== "iptal") durum(window.SufloEgriPaylas.hataMetni(s.hata), "warn"); return false; }
    durum(["Dışa aktarıldı: " + y.adet + " önayar → ", { ad: s.yol }], "good");
    return true;
  }
  /*
   * Başka sekmeden gelen eğri önayarlarını ekle (SufloEgriPaylas.iceAl: Hız Rampası'nın İçe aktar'ı / kod kutusu).
   * Döner: { ok (depoya yazıldı), eklenen: [id], yinelenen, dolu }
   */
  function onayarlariIceAl(gelenler) {
    if (!E || !M) return { ok: false, eklenen: [], yinelenen: 0, dolu: 0 };
    var a = M.onayarlariIceAl(kullaniciOnayarlari(), gelenler, Date.now(), function (n) { return tr("Benim eğrim " + n); });
    if (a.eklenen.length && !depoYaz(ONAYAR_ANAHTAR, a.liste)) return { ok: false, eklenen: [], yinelenen: 0, dolu: 0 };
    // düzenleyicideki eğriye dokunulmaz (Hız Rampası'ndan gelen içe aktarma kaydedilmemiş eğriyi silmesin)
    onayarKartlari();
    return { ok: true, eklenen: a.eklenen, yinelenen: a.yinelenen, dolu: a.dolu };
  }

  /* ---------------- eğri alanları ---------------- */
  function alanlariCiz() {
    var c = E.normalize(egri);
    var bez = !!c && c.type === "bezier";
    var css = el("egri-css");
    if (css && document.activeElement !== css) css.value = bez ? E.toCss(c) : "";
    if (css) css.setAttribute("placeholder", bez ? "cubic-bezier(0.25, 0.1, 0.25, 1)" : (c && c.type === "multi" ? "çok noktalı eğri" : "hazır eğri (cubic-bezier değil)"));
    [["egri-p1x", "x1"], ["egri-p1y", "y1"], ["egri-p2x", "x2"], ["egri-p2y", "y2"]].forEach(function (a) {
      var e = el(a[0]);
      if (!e) return;
      e.disabled = !bez;
      if (document.activeElement !== e) e.value = bez ? String(Math.round(c[a[1]] * 1000) / 1000) : "";
    });
  }
  // Düzenleyiciden, alanlardan ya da önayardan gelen her değişiklik
  function egriDegisti(elle) {
    if (elle) { seciliOnayar = ""; onayarKartlari(); }
    alanlariCiz();
    ayarKaydet();
  }
  // cubic-bezier alanı: elle yazılan / yapıştırılan cubic-bezier; 3.4 adım 15'ten beri CSS bildirimi, anahtar sözcük, yalın dört
  // sayı ve SFC1 eğri kodu / bağlantısı da (SufloEase.yapistir; y -1–2'ye kırpılır)
  function cssUygula() {
    var e = el("egri-css");
    if (!e || !String(e.value || "").replace(/\s/g, "")) { alanlariCiz(); return; }
    var y = E.yapistir(String(e.value));
    if (!y.ok) {
      durum(y.hata === "css" || y.hata === "bicim" ? "Geçersiz: cubic-bezier(x1, y1, x2, y2) yaz; x değerleri 0–1, y değerleri -1–2 arası." : window.SufloEgriPaylas.hataMetni(y.hata), "warn");
      return;
    }
    if (y.tur !== "egri") { durum(window.SufloEgriPaylas.hataMetni("hizKodu"), "warn"); return; }
    if (y.kaynak === "kod") { e.value = ""; egriYukle(y, false, "kod"); return; }
    egri = y.curve;
    if (editor) editor.egriAta(y.curve);
    durum(y.kirpildi ? "cubic-bezier yüklendi; y değerleri -1–2 aralığına kırpıldı." : "", y.kirpildi ? "warn" : "");
    egriDegisti(true);
    bekleyen = null;
  }
  function sayilarUygula() {
    var v = ["egri-p1x", "egri-p1y", "egri-p2x", "egri-p2y"].map(function (id) { return Number(el(id) ? el(id).value : NaN); });
    if (!v.every(function (x) { return isFinite(x); })) return;
    var c = E.normalize({ type: "bezier", x1: v[0], y1: v[1], x2: v[2], y2: v[3] });
    if (!c) return;
    egri = c;
    if (editor) editor.egriAta(c);
    egriDegisti(true);
  }
  function cevir() {
    if (!editor || !editor.cevir()) return;
    egri = editor.egri();
    egriDegisti(true);
  }
  function tersCevir() {
    if (!editor) return;
    if (!editor.tersCevir()) { durum("Ters çevirme yalnız taşmayan, geri dönmeyen (tekdüze) eğrilerde olur.", "warn"); return; }
    egri = editor.egri();
    egriDegisti(true);
  }
  function gorunumAta(g, kaydetme) {
    if (editor) gorunum = editor.gorunum(g);
    else gorunum = g === "hiz" ? "hiz" : "deger";
    ["deger", "hiz"].forEach(function (k) {
      var b = el("egri-gorunum-" + k);
      if (!b) return;
      b.classList.toggle("on", gorunum === k);
      b.setAttribute("aria-pressed", gorunum === k ? "true" : "false");
    });
    if (kaydetme !== false) ayarKaydet();
  }

  /* ---------------- canlı önizleme sahnesi (Premiere'e gitmez) ---------------- */
  function sekmeAcik() { var t = el("tab-egri"); return !!(t && t.classList && t.classList.contains("active")); }
  function gizli() { return !!document.hidden; }
  function sahneKare(ts) {
    sahneRaf = null;
    if (!sekmeAcik() || gizli()) return;   // sekme gizliyken / panel arka plandayken durur
    var kare = el("egri-kare");
    if (kare && egri) {
      if (!sahneBas) sahneBas = ts;
      var k = M.sahneKaresi(egri, ts - sahneBas);
      var x = Math.max(-0.25, Math.min(1.25, k.x));
      kare.style.left = (x * 82) + "%";
      kare.style.transform = "scale(" + Math.max(0.2, Math.min(1.6, k.olcek)).toFixed(3) + ")";
    }
    sahneRaf = window.requestAnimationFrame(sahneKare);
  }
  function sahneBaslat() {
    if (sahneRaf || typeof window.requestAnimationFrame !== "function" || !sekmeAcik() || gizli()) return;
    sahneRaf = window.requestAnimationFrame(sahneKare);
  }

  /* ---------------- CEP tuş ilgisi: kısayollar Premiere'e gitmesin ---------------- */
  function tuslariTut(tut) {
    tut = !!tut;
    if (tut === tusTutuluyor) return;
    var cep = window.__adobe_cep__;
    if (!cep || typeof cep.registerKeyEventsInterest !== "function") return;
    try {
      cep.registerKeyEventsInterest(tut ? M.tusIlgisi(!!(window.K && K.MAC)) : "");
      tusTutuluyor = tut;
    } catch (e) {}
  }

  /* ---------------- satır listesi (önbellekten; Premiere'e gitmez) ---------------- */
  function satirlar() {
    if (!onbellek || !onbellek.props) return [];
    var kl = kayitlar();
    return onbellek.props.map(function (p) {
      var canli = M.canliKayitlar(kl, p);
      var dd = M.satirDurumu(p, ph, M.uclarDan(canli));
      return { prop: p, cift: dd.cift, durum: dd.durum, degerVar: dd.degerVar, kayit: M.satirKaydi(kl, p, dd.cift), anahtar: M.satirAnahtari(p),
        yaylanKaydi: M.yaylanSatirKaydi(kl, p, ph), yaylanUygun: M.yaylanUygun(p, ph, kl, yaylan.tum) };
    });
  }
  function uygulanabilir(s) { return s.durum === "tamam" || s.durum === "kayitli"; }
  function isaretli(s) { return uygulanabilir(s) && !kapali[s.anahtar]; }
  // Varışta yaylan (3.4 adım 14): 1 karelik çift ya da tüm varışlarda playhead dışarıdaki satır da uygun olabilir
  function secilebilir(s) { return uygulanabilir(s) || s.yaylanUygun; }
  function yaylanIsaretli(s) { return s.yaylanUygun && !kapali[s.anahtar]; }

  function hedefCiz(liste) {
    var h = el("egri-hedef");
    if (!h) return;
    h.textContent = "";
    if (!onbellek) { h.appendChild(dugum(["Eğri sekmesi açıkken seçimi ve playhead'i izler."])); return; }
    if (onbellek.hata) { h.appendChild(dugum([onbellek.hata])); return; }
    var kl = onbellek.klipler || [];
    if (!kl.length) { h.appendChild(dugum(["Timeline'da bir video klibi seç ya da playhead'i anahtar kareli bir klibin üstüne getir."])); return; }
    if (kl.length === 1) {
      h.appendChild(dugum(["Hedef: ", { ad: kl[0].clipName }, kl[0].track >= 0 ? " · V" + (kl[0].track + 1) : "",
        onbellek.kaynak === "playhead" ? " · playhead'in altındaki klip" : " · seçili klip"]));
    } else h.appendChild(dugum(["Hedef: " + kl.length + " seçili klip"]));
    if (!liste.length) {
      h.appendChild(document.createElement("br"));
      h.appendChild(dugum(["Bu klipte iki ya da daha çok anahtar kareli bir özellik yok. Effect Controls'te bir özelliğe iki anahtar kare koy."]));
    } else if (!liste.some(uygulanabilir)) {
      h.appendChild(document.createElement("br"));
      h.appendChild(dugum([liste.some(function (s) { return s.durum === "tekKare"; }) && !liste.some(function (s) { return s.durum === "disinda"; })
        ? "Çiftin iki anahtar karesi arası 1 kare: yumuşatılacak ara yok."
        : "Playhead hiçbir anahtar kare çiftinin arasında değil. Sonraki çift ile atla."]));
    }
  }

  function listeCiz() {
    var kap = el("egri-ozellikler");
    if (!kap) return;
    var liste = satirlar();
    hedefCiz(liste);
    bosalt(kap);
    var cokKlip = onbellek && onbellek.klipler && onbellek.klipler.length > 1, sonKlip = null;
    liste.forEach(function (s) {
      var p = s.prop;
      if (cokKlip && p.nodeId !== sonKlip) {
        sonKlip = p.nodeId;
        var bas = document.createElement("div");
        bas.className = "egri-klip";
        bas.appendChild(dugum([{ ad: p.clipName }, p.track >= 0 ? " · V" + (p.track + 1) : ""]));
        kap.appendChild(bas);
      }
      var satir = document.createElement("div");
      satir.className = "egri-satir" + (secilebilir(s) ? "" : " pasif");
      satir.setAttribute("role", "listitem");
      var lab = document.createElement("label");
      lab.className = "egri-satir-ad";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = secilebilir(s) && !kapali[s.anahtar];
      cb.disabled = !secilebilir(s) || mesgul;
      cb.addEventListener("change", function () { if (cb.checked) delete kapali[s.anahtar]; else kapali[s.anahtar] = true; dugmeCiz(); });
      lab.appendChild(cb);
      var ad = document.createElement("span");
      // Suflo tablosundaki adlar çevrilir ("Konum" → "Position"); Premiere'in kendi adları kullanıcının dilinde kalır
      if (!p.labelTablo) ad.setAttribute("data-i18n-skip", "");
      ad.textContent = p.label;
      lab.appendChild(ad);
      satir.appendChild(lab);
      var cip = document.createElement("span");
      cip.className = "egri-cip" + (uygulanabilir(s) ? "" : " uyari");
      cip.textContent = s.cift && s.durum !== "tekKare" ? M.aralikMetni(s.cift.t0, s.cift.t1, p.fps) : M.nedenMetni(s.durum);
      satir.appendChild(cip);
      if (s.kayit) {
        var roz = document.createElement("span");
        roz.className = "egri-rozet";
        roz.textContent = "Suflo eğrisi";
        satir.appendChild(roz);
        var g = document.createElement("button");
        g.type = "button";
        g.className = "btn tiny egri-satir-geri";
        g.textContent = "Geri al";
        g.disabled = mesgul;
        g.addEventListener("click", function () { geriAl([s.kayit], "satir"); });
        satir.appendChild(g);
      }
      if (s.yaylanKaydi) {
        var rozY = document.createElement("span");
        rozY.className = "egri-rozet yaylan";
        rozY.textContent = "Suflo yaylanması";
        satir.appendChild(rozY);
        var gy = document.createElement("button");
        gy.type = "button";
        gy.className = "btn tiny egri-satir-geri egri-yaylan-geri";
        gy.textContent = "Geri al";
        gy.title = "Bu varıştaki yaylanmayı kaldır";
        gy.disabled = mesgul;
        gy.addEventListener("click", function () { geriAl([s.yaylanKaydi], "satir"); });
        satir.appendChild(gy);
      }
      kap.appendChild(satir);
    });
    dugmeCiz();
  }

  // Kilitliyken de düğmenin adı "Uygula": tanıtım kartındaki deneme bildirimi bu adı söyler
  function dugmeCiz() {
    var b = el("egri-uygula");
    var kilitli = typeof Pro !== "undefined" && Pro.isPro && !Pro.isPro() && !(Pro.denemeAcik && Pro.denemeAcik("curves"));
    if (b) {
      b.textContent = kilitli ? "🔒 Uygula" : "Uygula";
      if (b.classList) b.classList.toggle("is-locked", !!kilitli);
      b.disabled = mesgul;
    }
    // Varışta yaylan aynı 'curves' kapısından geçer (3 deneme hakkı Eğri ile ortak)
    var y = el("egri-yaylan-uygula");
    if (y) {
      y.textContent = kilitli ? "🔒 Varışta yaylan" : "Varışta yaylan";
      if (y.classList) y.classList.toggle("is-locked", !!kilitli);
      y.disabled = mesgul;
    }
    ["egri-geri-tumu", "egri-sonraki", "egri-yenile"].forEach(function (id) { var e = el(id); if (e) e.disabled = mesgul; });
    var pr = el("egri-pr-onizle");
    if (pr) { pr.disabled = mesgul && !onizleme; pr.textContent = onizleme ? "Önizlemeyi durdur" : "Premiere'de önizle"; }
  }

  function render() {
    onayarKartlari();
    alanlariCiz();
    yaylanCiz();
    listeCiz();
  }

  /* ---------------- yoklama ve tarama ---------------- */
  function onbellekYaz(tar, pk) {
    onbellek = tar;
    onbellek.selSig = pk ? String(pk.selSig || "") : (sonPeek ? String(sonPeek.selSig || "") : "");
    ph = Number(tar.ph) || 0;
    onbellek.ph = ph;
  }
  // degerIste (Varışta yaylan, 3.4 adım 14): bu satırların tüm anahtar değerleri de okunur (yalnız uygulamada; yoklamada yok)
  async function tara(pk, degerIste) {
    tazeleGerek = false;
    function arg(ip) {
      var a = { maxProps: 40, ipuclari: ip };
      if (degerIste && degerIste.length) a.degerIste = degerIste;
      return a;
    }
    var ipucu = M.ipuclari(kayitlar(), onbellek ? onbellek.props : []);
    var tar = await K.call("KS_easeScan", arg(ipucu), 30000);
    // Canlılık önbellekteki anahtarlarla ölçülür: ilk taramada (önbellek boş) ya da anahtarlar değiştiyse
    // ipuçları yeni anahtarlarla yeniden hesaplanır (kaydın aralığı çift olsun, uç değerleri o aralığın). En çok
    // iki kez: uzun kayıtta (kesik pencere) ilk ölçüm pencereyle, ikincisi host'un döndürdüğü tüm aralıkla
    for (var n = 0; n < 2 && tar && tar.ok; n++) {
      var yeniIpucu = M.ipuclari(kayitlar(), tar.props);
      if (JSON.stringify(yeniIpucu) === JSON.stringify(ipucu)) break;
      var tar2 = await K.call("KS_easeScan", arg(yeniIpucu), 30000);
      if (!tar2 || !tar2.ok) break;
      tar = tar2;
      ipucu = yeniIpucu;
    }
    if (!tar || !tar.ok) {
      onbellek = { seqId: pk ? pk.seqId : "", selSig: pk ? pk.selSig : "", kapsam: [-1e9, 1e9], ph: pk ? pk.ph : 0, props: [], klipler: [],
        hata: tar && tar.kod === "sekansYok" ? "Aktif sekans yok. Bir sekans aç." : "Anahtar kareler okunamadı. Yenile ile tekrar dene." };
      listeCiz();
      return null;
    }
    onbellekYaz(tar, pk);
    listeCiz();
    return tar;
  }
  // KS_easePeek sonucu: gerekirse tarar (sekans / seçim / kapsam / tazele), yoksa playhead'i günceller
  function peekIsle(pk) {
    if (!pk || !pk.ok) return Promise.resolve(null);
    sonPeek = pk;
    if (!pk.seqId) {
      if (!onbellek || onbellek.seqId) { onbellek = { seqId: "", selSig: "", kapsam: [-1e9, 1e9], ph: 0, props: [], klipler: [], hata: "Aktif sekans yok. Bir sekans aç." }; listeCiz(); }
      return Promise.resolve(null);
    }
    var karar = M.yoklamaKarari(onbellek, pk, { tazele: tazeleGerek });
    if (karar === "tara") return tara(pk);
    if (karar === "ciftler") { ph = Number(pk.ph) || 0; onbellek.ph = ph; listeCiz(); }
    return Promise.resolve(null);
  }
  // 1,2 sn'de bir (ve sekme açılınca): yalnız sekme görünür, panel odakta, Premiere boştayken. Odak Premiere'deyken
  // kullanıcı Effect Controls'te anahtar ekleyip değiştirebilir (seçim imzası değişmez): odak dönünce bir kez taranır
  function yokla() {
    if (!sekmeAcik()) { tuslariTut(false); return Promise.resolve(); }
    var odak = document.hasFocus ? document.hasFocus() : true;
    if (!odak && onbellek) tazeleGerek = true;
    var hostMesgul = !!(window.K && K.hostMesgul && K.hostMesgul());
    if (!M.yoklamaUygun({ gorunur: !gizli(), odak: odak, mesgul: mesgul || yoklaniyor || hostMesgul })) return Promise.resolve();
    yoklaniyor = true;
    return K.call("KS_easePeek", undefined, 8000).then(peekIsle).catch(function () { return null; }).then(function () { yoklaniyor = false; });
  }
  // Kullanıcı eyleminden önce (Sonraki çift, Premiere'de önizle): panel odakta değilken yoklama durur; playhead
  // ve anahtarlar taze okunur (ilk tıklama panele dönüş tıklaması olabilir)
  async function guncelle() {
    var pk = null;
    try { pk = await K.call("KS_easePeek", undefined, 8000); } catch (e) { pk = null; }
    if (!pk || !pk.ok) return false;
    await peekIsle(pk);
    return true;
  }
  function sekmeAcildi() {
    tuslariTut(true);
    if (onbellek) tazeleGerek = true;   // sekme yeniden açıldı: başka sekmedeyken anahtarlar değişmiş olabilir
    render();
    sahneBas = 0;
    sahneBaslat();
    if (!zamanlayici) zamanlayici = setInterval(yokla, M.YOKLAMA_MS);
    yokla();
  }

  /* ---------------- uygula (Pro, 3 deneme hakkı) ---------------- */
  function kilitle(b) { mesgul = !!b; dugmeCiz(); }
  // Parçalı hata: kullanıcı adları (klip, Premiere özellik adı) durum satırında çevrilmeden kalır
  function hataAt(parcalar) {
    var e = new Error(parcalar.map(function (p) { return p && typeof p === "object" ? String(p.ad) : String(p); }).join(""));
    e.parcalar = parcalar;
    throw e;
  }
  function adParcasi(p) { return p.labelTablo ? p.label : { ad: p.label }; }
  function atlamaParcalari(atlanan) {
    var out = [];
    atlanan.slice(0, 4).forEach(function (a, i) {
      if (i) out.push(" · ");
      out.push(adParcasi(a.prop));
      out.push(": " + M.nedenMetni(a.kod));
    });
    if (atlanan.length > 4) out.push(" · +" + (atlanan.length - 4));
    return out;
  }

  async function uygula() {
    if (typeof Pro !== "undefined" && !Pro.gate("curves", { deneme: true, yeniden: function () { uygula(); } })) return;
    if (mesgul || !E.normalize(egri)) return;
    kilitle(true);
    durum("Anahtar kareler okunuyor…");
    try {
      // Uç değerleri o anki hâlinden: her uygulama taze taramayla başlar
      var tar = await tara(sonPeek);
      if (!tar) throw new Error(onbellek && onbellek.hata ? onbellek.hata : "Anahtar kareler okunamadı.");
      var isaretliler = satirlar().filter(isaretli);
      if (!isaretliler.length) throw new Error("Uygulanacak çift yok: playhead'i iki anahtar karenin arasına getir ve özelliği işaretle.");
      // Uç değerleri yalnız taramanın okuduğu çift için bilinir; okunamayan satır sessizce atlanmaz, nedeniyle bildirilir
      var secilen = isaretliler.filter(function (s) { return s.degerVar; });
      var plan = M.bakeGruplari(secilen, egri, yogunluk(), tar.seqId);
      var atlanan = isaretliler.filter(function (s) { return !s.degerVar; }).map(function (s) { return { prop: s.prop, kod: "degerYok" }; }).concat(plan.atlanan);
      var yeniKayitlar = [], gecici = [], eksik = [], yazilan = 0, basarili = 0, ozellik = 0;
      for (var g = 0; g < plan.gruplar.length; g++) {
        var grup = plan.gruplar[g];
        if (plan.gruplar.length > 1) durum("Yazılıyor… " + (g + 1) + "/" + plan.gruplar.length);
        else durum("Yazılıyor…");
        var r = await K.call("KS_easeBake", { target: grup.target, items: grup.items, dogrusal: true }, M.bakeSuresi(grup));
        if (!r || !r.ok) {
          // Zaman aşımı: ExtendScript yazmayı sürdürebilir; planlanan zamanlar geçici kayıt olur (Geri al yalnız
          // gerçekten yazılmış, canlı olanı siler). Hak düşmez: sonucu bilinmiyor
          var asim = !!(r && !r.kod && /zaman aşımı|yanıt vermedi/i.test(String(r.error || "")));
          if (asim) gecici = gecici.concat(M.geciciKayitlar(grup, tar.seqId));
          grup.satirlar.forEach(function (s) { atlanan.push({ prop: s.prop, kod: asim ? "zamanAsimi" : r && r.kod ? r.kod : "yazilamadi" }); });
          continue;
        }
        (r.sonuclar || []).forEach(function (s) {
          var sat = grup.satirlar[s.i];
          if (!sat) return;
          if (!s.ok) atlanan.push({ prop: sat.prop, kod: s.kod || "yazilamadi" });
          else {
            ozellik++;
            if (s.kod === "eksik") eksik.push({ prop: sat.prop, kod: "eksik" });
          }
        });
        yeniKayitlar = yeniKayitlar.concat(r.records || []);
        yazilan += Number(r.yazilan) || 0;
        basarili += Number(r.basarili) || 0;
      }
      var sak = yeniKayitlar.length || gecici.length ? kayitlariSakla(yeniKayitlar, gecici) : { ok: true, atilan: 0 };
      if (!basarili) hataAt(atlanan.length ? ["Uygulanamadı: "].concat(atlamaParcalari(atlanan)) : ["Uygulanamadı."]);
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("curves", toast);   // deneme: yalnız başarıda, bir kez
      var mesaj = ["Eğri uygulandı: " + ozellik + " özellik · " + yazilan + " anahtar kare"];
      if (atlanan.length) mesaj = mesaj.concat([" · atlanan: "]).concat(atlamaParcalari(atlanan));
      if (eksik.length) mesaj = mesaj.concat([" · kısmen yazıldı: "]).concat(atlamaParcalari(eksik));
      var uyari = atlanan.length || eksik.length;
      durum(mesaj, uyari ? "warn" : "good");
      // Bildirimdeki Geri al YALNIZ bu uygulamanın kayıtlarını kaldırır (9 sn içinde başka bir uygulama yapılsa da)
      var buIdler = sonUygulanan.slice();
      toast(dugum(mesaj), uyari ? "warn" : "good", 9000, { metin: "Geri al", fn: function () {
        geriAl(kayitlar().filter(function (k) { return buIdler.indexOf(k.id) !== -1; }), "son");
      } });
      saklamaUyarisi(sak);
    } catch (e) {
      durum(e && e.parcalar ? ["✕ "].concat(e.parcalar) : "✕ " + (e && e.message ? e.message : String(e)), "bad");
    } finally {
      kilitle(false);
      try { await tara(sonPeek); } catch (eT) { listeCiz(); }
    }
  }

  /* ---------------- varışta yaylan (3.4 adım 14; Pro 'curves', 3 deneme hakkı Eğri ile ortak) ---------------- */
  // Ayarlar ve önizleme Premiere'e gitmez; uygulama taze, değerli taramayla başlar (yalnız işaretli satırların değerleri)
  function yaylanYukle() {
    yaylan = M.yaylanAyar(depoOku(YAYLAN_ANAHTAR, null));
  }
  function yaylanKaydet() { depoYaz(YAYLAN_ANAHTAR, yaylan); }
  // "3,5 Hz" (İngilizce arayüzde sözlük "3.5 Hz" yapar)
  function hzMetni(v) { return (Math.round(v) === v ? String(v) : M.sayi(v, 1)) + " Hz"; }
  function yaylanCiz() {
    var a = yaylan, gir = function (id, v) { var e = el(id); if (e && document.activeElement !== e) e.value = String(v); };
    gir("egri-yaylan-genlik", a.genlik);
    gir("egri-yaylan-frekans", a.frekans);
    gir("egri-yaylan-sonum", a.sonum);
    var t = el("egri-yaylan-tum");
    if (t) t.checked = !!a.tum;
    var yaz = function (id, s) { var e = el(id); if (e) e.textContent = s; };
    yaz("egri-yaylan-genlik-deger", M.sayi(a.genlik) + " sn");
    yaz("egri-yaylan-frekans-deger", hzMetni(a.frekans));
    yaz("egri-yaylan-sonum-deger", String(a.sonum));
    var on = M.yaylanOnizleme(a, 240, 80);
    yaz("egri-yaylan-sure", "Oturma ≈ " + M.sayi(on.sure) + " sn");
    var yol = el("egri-yaylan-yol");
    if (yol) yol.setAttribute("d", on.yol);
    var h = el("egri-yaylan-hedef");
    if (h) { h.setAttribute("y1", String(on.hedefY)); h.setAttribute("y2", String(on.hedefY)); }
    var v = el("egri-yaylan-varis");
    if (v) { v.setAttribute("x1", String(on.varisX)); v.setAttribute("x2", String(on.varisX)); }
  }
  // Kaydırıcılar / onay kutusu: ayar, önizleme, depo (Premiere'e gitmez). Tüm varışlar satır uygunluğunu değiştirir
  function yaylanDegisti() {
    var oku = function (id) { var e = el(id); return e ? e.value : undefined; };
    var t = el("egri-yaylan-tum");
    var onceTum = yaylan.tum;
    yaylan = M.yaylanAyar({ genlik: oku("egri-yaylan-genlik"), frekans: oku("egri-yaylan-frekans"), sonum: oku("egri-yaylan-sonum"), tum: !!(t && t.checked) });
    yaylanKaydet();
    yaylanCiz();
    if (onceTum !== yaylan.tum) listeCiz();
  }
  // Aynı özellik + nedeni bir kez (tüm varışlarda bir satır birkaç kez atlanabilir)
  function tekil(atlanan) {
    var gor = {};
    return atlanan.filter(function (a) {
      var k = M.satirAnahtari(a.prop) + "|" + a.kod;
      if (gor[k]) return false;
      gor[k] = 1;
      return true;
    });
  }

  async function yaylanUygula() {
    if (typeof Pro !== "undefined" && !Pro.gate("curves", { deneme: true, yeniden: function () { yaylanUygula(); } })) return;
    if (mesgul) return;
    kilitle(true);
    durum("Anahtar kareler okunuyor…");
    try {
      var ayar = M.yaylanAyar(yaylan);
      // Değerler yalnız işaretli satırlar için okunur (her anahtarın değeri: varış hızı ve sonraki anahtar)
      var iste = satirlar().filter(yaylanIsaretli).slice(0, 40).map(function (s) {
        return { nodeId: s.prop.nodeId, compIdx: s.prop.compIdx, propIdx: s.prop.propIdx };
      });
      var tar = await tara(sonPeek, iste);
      // Önbellek boştu ya da tarama yeni bir satır getirdi: değeri okunmamış işaretli satırlar için bir kez daha
      var degersiz = satirlar().filter(function (s) { return yaylanIsaretli(s) && !Array.isArray(s.prop.degerler); });
      if (tar && degersiz.length) {
        tar = await tara(sonPeek, satirlar().filter(yaylanIsaretli).slice(0, 40).map(function (s) {
          return { nodeId: s.prop.nodeId, compIdx: s.prop.compIdx, propIdx: s.prop.propIdx };
        }));
      }
      if (!tar) throw new Error(onbellek && onbellek.hata ? onbellek.hata : "Anahtar kareler okunamadı.");
      var secilen = satirlar().filter(yaylanIsaretli);
      if (!secilen.length) throw new Error("Yaylanacak varış yok: playhead'i bir hareketin iki anahtar karesi arasına getir (ya da Tüm varışlar'ı aç) ve Konum, Ölçek, Döndürme ya da Opaklık satırını işaretle.");
      var kl = kayitlar();
      var plan = M.yaylanGruplari(secilen.map(function (s) {
        return { prop: s.prop, varis: M.varislar(s.prop, kl, { ph: ph, tum: ayar.tum }) };
      }), ayar, tar.seqId);
      var atlanan = plan.atlanan.slice();
      // Geri al kayıtları projede Eğri ile ortak en çok 300 (fazlası en eskilerden atılır). Tüm varışlar (sınırsız varış) boş
      // yerden çok kayıt yazacaksa önce sorulur: önceki eğri ve yaylanmaların Geri al'ı sessizce gitmesin (3.4 adım 14 inceleme).
      // Tek varış Eğri gibi bir uygulamada en çok 40 kayıt yazar; atılan olursa bildirim söyler (saklamaUyarisi)
      var yer = M.yaylanYeri(plan, depodakiler(), KR.PROJE_SINIR);
      if (ayar.tum && yer.atilacak > 0 && !onayla("Bu uygulama " + yer.yeni + " yaylanma kaydı yazacak; projede Geri al için " + yer.yer +
        " kayıtlık yer kaldı (Eğri ve yaylanma kayıtları proje başına en çok " + KR.PROJE_SINIR + "). Sürdürürsen en eski " + yer.atilacak +
        " Eğri / yaylanma kaydı silinir: o anahtar kareler Premiere'de kalır ama Suflo onları artık geri alamaz. Sürdürülsün mü?")) {
        durum("Hiçbir şey yazılmadı: Geri al kayıtlarına yer yok. Daha az satır işaretle ya da varışlara tek tek uygula.", "warn");
        return;
      }
      var yeniKayitlar = [], gecici = [], eksik = [], yazilan = 0, varisSayi = 0, yogun = 0;
      for (var g = 0; g < plan.gruplar.length; g++) {
        var grup = plan.gruplar[g];
        durum(plan.gruplar.length > 1 ? "Yazılıyor… " + (g + 1) + "/" + plan.gruplar.length : "Yazılıyor…");
        var r = await K.call("KS_easeBake", { target: grup.target, items: grup.items }, M.bakeSuresi(grup));
        if (!r || !r.ok) {
          var asim = !!(r && !r.kod && /zaman aşımı|yanıt vermedi/i.test(String(r.error || "")));
          if (asim) gecici = gecici.concat(M.yaylanGeciciKayitlar(grup, tar.seqId));
          grup.satirlar.forEach(function (s) { atlanan.push({ prop: s.prop, kod: asim ? "zamanAsimi" : r && r.kod ? r.kod : "yazilamadi" }); });
          continue;
        }
        (r.sonuclar || []).forEach(function (s) {
          var sat = grup.satirlar[s.i];
          if (!sat) return;
          if (!s.ok) { atlanan.push({ prop: sat.prop, kod: s.kod || "yazilamadi" }); return; }
          varisSayi++;
          if (s.interp === "yogun") yogun++;
          if (s.kod === "eksik") eksik.push({ prop: sat.prop, kod: "eksik" });
        });
        yeniKayitlar = yeniKayitlar.concat(r.records || []);
        yazilan += Number(r.yazilan) || 0;
      }
      atlanan = tekil(atlanan);
      eksik = tekil(eksik);
      var sak = yeniKayitlar.length || gecici.length ? kayitlariSakla(yeniKayitlar, gecici) : { ok: true, atilan: 0 };
      if (!varisSayi) hataAt(atlanan.length ? ["Yaylanma uygulanamadı: "].concat(atlamaParcalari(atlanan)) : ["Yaylanma uygulanamadı."]);
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("curves", toast);   // deneme: yalnız başarıda, bir kez
      var mesaj = ["Varışta yaylanma uygulandı: " + varisSayi + " varış · " + yazilan + " anahtar kare"];
      if (yogun) mesaj.push(" · Premiere Bezier yazamadı; 2 karede bir yazıldı");
      if (atlanan.length) mesaj = mesaj.concat([" · atlanan: "]).concat(atlamaParcalari(atlanan));
      if (eksik.length) mesaj = mesaj.concat([" · kısmen yazıldı: "]).concat(atlamaParcalari(eksik));
      var uyari = atlanan.length || eksik.length;
      durum(mesaj, uyari ? "warn" : "good");
      var buIdler = sonUygulanan.slice();
      toast(dugum(mesaj), uyari ? "warn" : "good", 9000, { metin: "Geri al", fn: function () {
        geriAl(kayitlar().filter(function (k) { return buIdler.indexOf(k.id) !== -1; }), "son");
      } });
      saklamaUyarisi(sak);
    } catch (e) {
      durum(e && e.parcalar ? ["✕ "].concat(e.parcalar) : "✕ " + (e && e.message ? e.message : String(e)), "bad");
    } finally {
      kilitle(false);
      try { await tara(sonPeek); } catch (eT) { listeCiz(); }
    }
  }

  /* ---------------- geri al (kapısız) ---------------- */
  async function geriAl(liste, kaynak) {
    liste = (liste || []).filter(function (r) { return r && r.id; });
    if (mesgul) return;
    if (!liste.length) { durum(kaynak === "tumu" ? "Bu sekansta geri alınacak Suflo eğrisi yok." : "Geri alınacak Suflo eğrisi yok.", "warn"); return; }
    kilitle(true);
    durum("Geri alınıyor…");
    try {
      var arg = { records: liste }, gelen = {};
      liste.forEach(function (x) { gelen[x.id] = 1; });
      // Yaylanma geri alınırken ucu yaylanma anahtarında duran Eğri de sahipsiz kalmasın (host karar verir; 3.4 adım 14)
      if (liste.some(function (x) { return x.tur === "yaylan"; })) {
        var egriler = buSekansinKayitlari().filter(function (x) { return x.tur === "egri" && !gelen[x.id]; }).slice(0, 300);
        if (egriler.length) arg.egriler = egriler;
      }
      var r = await K.call("KS_easeUndo", arg, 120000);
      if (!r || !r.ok) throw new Error(r && r.kod ? (M.hataMetni(r.kod) || "Geri alınamadı.") : "Geri alınamadı.");
      // sonuclar: host'un bitirdiği kayıtlar (silindi ya da Suflo'nun anahtarları zaten yoktu: 'yok'); atlanan saklanır
      var silinen = 0, biten = [], yok = 0;
      (r.sonuclar || []).forEach(function (s) {
        silinen += Number(s.silinen) || 0;
        biten.push(s.id);
        if (s.kod === "yok" && !Number(s.silinen)) yok++;
      });
      var egriBiten = (Array.isArray(r.egriBiten) ? r.egriBiten : []).filter(function (id) { return typeof id === "string" && id && !gelen[id]; });
      kayitlariSil(biten.concat(egriBiten));
      // ayrı metin parçası: İngilizce arayüz her cümleyi kendi kalıbıyla çevirir
      var egriNotu = egriBiten.length ? [" · ", "Uçları bu anahtar karelerde olan " + egriBiten.length + " Suflo eğrisi de kaldırıldı."] : [];
      var kalan = (r.atlanan || []).length;
      if (kalan) {
        // atlanan kayıtlar nedenlerine göre gruplanır: her neden kendi sayısıyla kendi cümlesinde (karışık nedenler ilk kaydın
        // nedeniyle anlatılmaz)
        durum(["Geri alındı: " + silinen + " anahtar kare silindi"].concat(geriAlNedenleri(r.atlanan), egriNotu), "warn");
      } else if (!silinen && yok) durum("Suflo'nun anahtar kareleri zaten kaldırılmış; kayıt temizlendi.", "warn");
      else durum(["Geri alındı: " + silinen + " anahtar kare silindi."].concat(egriNotu), "good");
    } catch (e) {
      durum("✕ " + (e && e.message ? e.message : String(e)), "bad");
    } finally {
      kilitle(false);
      try { await tara(sonPeek); } catch (eT) { listeCiz(); }
    }
  }
  // KS_easeUndo'nun atladığı kayıtların nedenleri: [" · ", cümle, …] (neden başına bir cümle, kendi sayısıyla; ayrı metin
  // parçaları: İngilizce arayüz her cümleyi kendi kalıbıyla çevirir)
  var GERI_AL_NEDEN = {
    sekans: function (n) { return n + " kayıt başka bir sekansta; kayıtlar saklandı, o sekansı açıp yeniden dene."; },
    degisti: function (n) { return n + " kaydın anahtar kareleri değişmiş (klibin hızı ya da uç anahtar kareleri); dokunulmadı, kayıtlar saklandı."; },
    kismi: function (n) { return n + " kaydın Suflo anahtar karelerinin bir kısmı silinmiş; kalanlara dokunulmadı, kayıtlar saklandı (kalanları Effect Controls'ten silebilirsin)."; },
    kilitli: function (n) { return n + " kaydın katmanı kilitli; dokunulmadı, kayıtlar saklandı. Kilidi açıp yeniden dene."; },
    bulunamadi: function (n) { return n + " kaydın klibi ya da özelliği bulunamadı; kayıtlar saklandı."; }
  };
  var GERI_AL_NEDEN_SIRA = ["sekans", "degisti", "kismi", "kilitli", "bulunamadi"];
  function geriAlNedenleri(atlanan) {
    var say = {}, out = [];
    (atlanan || []).forEach(function (a) {
      var g = a && GERI_AL_NEDEN.hasOwnProperty(a.kod) && a.kod !== "bulunamadi" ? a.kod : "bulunamadi";
      say[g] = (say[g] || 0) + 1;
    });
    GERI_AL_NEDEN_SIRA.forEach(function (g) { if (say[g]) out.push(" · ", GERI_AL_NEDEN[g](say[g])); });
    return out;
  }
  function buSekansinKayitlari() {
    var s = seqId();
    return kayitlar().filter(function (r) { return !s || r.seqId === s; });
  }
  function geriAlTumu() { return geriAl(buSekansinKayitlari(), "tumu"); }
  // U / bildirimdeki Geri al: son uygulama; yoksa bu sekanstaki en yeni kayıt
  function geriAlSon() {
    var kl = kayitlar();
    var son = kl.filter(function (r) { return sonUygulanan.indexOf(r.id) !== -1; });
    if (!son.length) {
      var bu = buSekansinKayitlari().slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
      son = bu.length ? [bu[0]] : [];
    }
    return geriAl(son, "son");
  }

  /* ---------------- gezinme ---------------- */
  // Önce taze playhead (guncelle); canlı Suflo kaydının iç anahtarları çift başı sayılmaz (kayıt tek çift)
  async function sonrakiCift() {
    if (mesgul) return;
    kilitle(true);
    var t = null, kapsamDisi = false;
    try {
      await guncelle();
      if (!onbellek || !onbellek.props || !onbellek.props.length) durum("Önce anahtar kareli bir klip seç.", "warn");
      else {
        var kl = kayitlar();
        // canlı yaylanmaların ara anahtarları da tek tek gezilmez (iniş → son yaylanma anahtarı tek adım)
        var ogesi = function (p) {
          return { keys: p.keys, uclar: M.uclarDan(M.canliKayitlar(kl, p)).concat(M.canliYaylanlar(kl, p).map(function (y) { return [y.tL, y.son]; })) };
        };
        var secili = satirlar().filter(function (s) { return !kapali[s.anahtar]; }).map(function (s) { return ogesi(s.prop); });
        var fps = onbellek.fps || (onbellek.props[0] && onbellek.props[0].fps) || 30;
        t = M.sonrakiCift(secili.length ? secili : onbellek.props.map(ogesi), ph, fps);
        if (t === null) durum("Anahtar kare çifti yok.", "warn");
        else {
          await K.call("KS_setPlayerPosition", { sec: t }, 8000);
          ph = t;
          onbellek.ph = t;
          var k = onbellek.kapsam;
          kapsamDisi = !!(k && (t < k[0] || t >= k[1]));
        }
      }
    } catch (e) {} finally { kilitle(false); }
    if (kapsamDisi) { try { await tara(sonPeek); } catch (eT) { listeCiz(); } }
    else listeCiz();
  }

  // Premiere'de kaba önizleme: playhead çiftin başından sonuna (saniyede en çok 12 adım), sonra başladığı yere
  // döner. Önce taze playhead: panel odakta değilken yoklama durur, eski ph'ye dönülmesin
  async function premiereOnizle() {
    if (onizleme) { onizleme.iptal = true; return; }
    if (mesgul) return;
    kilitle(true);
    var donus = null;
    try {
      await guncelle();
      var s = satirlar().filter(isaretli)[0] || satirlar().filter(uygulanabilir)[0];
      if (!s) durum("Önce playhead'i bir anahtar kare çiftinin arasına getir.", "warn");
      else {
        var adimlar = M.onizlemeAdimlari(s.cift.t0, s.cift.t1, s.prop.fps, M.ONIZLEME_HZ);
        var jeton = { iptal: false };
        donus = ph;
        onizleme = jeton;
        dugmeCiz();   // "Önizlemeyi durdur" tıklanabilir
        for (var i = 0; i < adimlar.length && !jeton.iptal; i++) {
          await K.call("KS_setPlayerPosition", { sec: adimlar[i] }, 4000);
          await bekle(Math.ceil(1000 / M.ONIZLEME_HZ));
        }
      }
    } catch (e) {} finally {
      if (donus !== null) { try { await K.call("KS_setPlayerPosition", { sec: donus }, 4000); } catch (e2) {} }
      onizleme = null;
      kilitle(false);
      listeCiz();
    }
  }

  /* ---------------- kısayollar ---------------- */
  function tusBasildi(e) {
    if (!sekmeAcik()) return;
    var k = M.kisayol(e);
    if (!k) return;
    if (k.eylem === "sil") {
      if (editor && editor.seciliVar() && editor.seciliSil()) { egri = editor.egri(); egriDegisti(true); if (e.preventDefault) e.preventDefault(); }
      return;
    }
    if (e.preventDefault) e.preventDefault();
    if (k.eylem === "uygula") uygula();
    else if (k.eylem === "yaylan") yaylanUygula();
    else if (k.eylem === "geriAl") geriAlSon();
    else if (k.eylem === "cevir") cevir();
    else if (k.eylem === "tersCevir") tersCevir();
    else if (k.eylem === "gorunum") gorunumAta(gorunum === "deger" ? "hiz" : "deger");
    else if (k.eylem === "onayar") { var o = tumOnayarlar()[k.n - 1]; if (o) onayarSec(o.id); }
  }

  function init() {
    if (!E || !M || !el("tab-egri") || !el("egri-editor")) return;
    ayarYukle();
    yaylanYukle();
    editor = window.SufloEgriEditor.olustur(el("egri-editor"), {
      egri: egri, gorunum: gorunum,
      degisti: function (c, o) { egri = c; if (o.bitti) egriDegisti(true); else alanlariCiz(); },
      uyari: function (m) { durum(m, "warn"); }
    });
    gorunumAta(gorunum, false);   // açılışta yalnız okunur, depoya yazılmaz
    render();
    el("egri-gorunum-deger").addEventListener("click", function () { gorunumAta("deger"); });
    el("egri-gorunum-hiz").addEventListener("click", function () { gorunumAta("hiz"); });
    el("egri-css").addEventListener("change", cssUygula);
    ["egri-p1x", "egri-p1y", "egri-p2x", "egri-p2y"].forEach(function (id) { el(id).addEventListener("change", sayilarUygula); });
    el("egri-cevir").addEventListener("click", cevir);
    el("egri-ters").addEventListener("click", tersCevir);
    el("egri-kaydet").addEventListener("click", onayarKaydet);
    // Paylaşım ve önayar düzeni (3.4 adım 15): ücretsiz, Premiere'e gitmez
    function bagla(id, olay, fn) { var e = el(id); if (e) e.addEventListener(olay, fn); }
    function enterIle(fn) { return function (e) { if (e && (e.key === "Enter" || e.keyCode === 13)) { if (e.preventDefault) e.preventDefault(); fn(); } }; }
    bagla("egri-kod-yukle", "click", function () { kodYukle(); });
    // kod kutusu çok satırlı (textarea): Enter yükler, Shift+Enter alt satıra geçer
    bagla("egri-kod", "keydown", function (e) { if (!(e && e.shiftKey)) enterIle(kodYukle)(e); });
    bagla("egri-kod-kopyala", "click", kodKopyala);
    bagla("egri-ice-aktar", "click", function () { dosyaIceAktar(); });
    bagla("egri-disa-aktar", "click", function () { dosyaDisaAktar(); });
    bagla("egri-onayar-adlandir", "click", onayarAdlandir);
    bagla("egri-onayar-ad", "keydown", enterIle(onayarAdlandir));
    bagla("egri-onayar-sola", "click", function () { onayarKaydir(-1); });
    bagla("egri-onayar-saga", "click", function () { onayarKaydir(1); });
    el("egri-yogunluk").addEventListener("change", ayarKaydet);
    el("egri-uygula").addEventListener("click", function () { uygula(); });
    // Tanıtım kartından kurulan deneme Pro olayı yaymaz; app.js düğmeye odaklanır: kilit hemen kalkar
    el("egri-uygula").addEventListener("focus", dugmeCiz);
    el("egri-uygula").addEventListener("mouseenter", dugmeCiz);
    el("egri-geri-tumu").addEventListener("click", function () { geriAlTumu(); });
    el("egri-sonraki").addEventListener("click", function () { sonrakiCift(); });
    el("egri-yenile").addEventListener("click", function () { if (!mesgul) tara(sonPeek); });
    el("egri-pr-onizle").addEventListener("click", function () { premiereOnizle(); });
    // Varışta yaylan (3.4 adım 14): kaydırıcılar canlı önizler (input), Uygula 'curves' kapısından geçer
    ["egri-yaylan-genlik", "egri-yaylan-frekans", "egri-yaylan-sonum"].forEach(function (id) {
      var e = el(id);
      if (e) { e.addEventListener("input", yaylanDegisti); e.addEventListener("change", yaylanDegisti); }
    });
    if (el("egri-yaylan-tum")) el("egri-yaylan-tum").addEventListener("change", yaylanDegisti);
    if (el("egri-yaylan-uygula")) {
      el("egri-yaylan-uygula").addEventListener("click", function () { yaylanUygula(); });
      el("egri-yaylan-uygula").addEventListener("focus", dugmeCiz);
      el("egri-yaylan-uygula").addEventListener("mouseenter", dugmeCiz);
    }
    document.addEventListener("keydown", tusBasildi);
    // Başka sekmeye geçilince kısayol tuşları Premiere'e geri verilir (tıklamanın sekme geçişinden SONRA bakılır)
    document.addEventListener("click", function () { setTimeout(function () { if (!sekmeAcik()) tuslariTut(false); }, 0); });
    document.addEventListener("visibilitychange", function () { if (!gizli()) sahneBaslat(); });
    // Odak Premiere'e gidince (Effect Controls'te anahtar eklenebilir) sonraki yoklama bir kez yeniden tarar
    if (typeof window.addEventListener === "function") window.addEventListener("blur", function () { if (onbellek) tazeleGerek = true; });
    if (window.KApp && KApp.onTab) KApp.onTab("egri", sekmeAcildi);
    if (typeof Pro !== "undefined" && Pro.on) { try { Pro.on(dugmeCiz); } catch (e) {} }
    if (window.SufloI18n && SufloI18n.onChange) { try { SufloI18n.onChange(function () { onayarKartlari(); }); } catch (e2) {} }
  }

  return {
    init: init,
    uygula: uygula,
    yaylanUygula: yaylanUygula,
    geriAl: geriAl,
    geriAlTumu: geriAlTumu,
    // paylaşım (3.4 adım 15): Hız Rampası'nın İçe aktar'ı eğri önayarlarını buraya ekler
    onayarlariIceAl: onayarlariIceAl,
    kodYukle: kodYukle,
    kodKopyala: kodKopyala,
    dosyaIceAktar: dosyaIceAktar,
    dosyaDisaAktar: dosyaDisaAktar,
    // testler / tanılama
    _yokla: yokla,
    _sekmeAcildi: sekmeAcildi,
    _tus: tusBasildi,
    _render: render,
    _durum: function () { return { onbellek: onbellek, ph: ph, egri: egri, mesgul: mesgul, sonUygulanan: sonUygulanan.slice(), bellek: bellek.slice(), seciliOnayar: seciliOnayar, gorunum: gorunum,
      yaylan: M.yaylanAyar(yaylan) }; },
    _editor: function () { return editor; }
  };
})();
