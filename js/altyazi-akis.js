/*
 * Suflo — Altyazı sekmesinin üç adımlı akışı (parti 4): 1 Oluştur · 2 Stil seç · 3 Uygula
 *
 * index.html #cap-main üç bölüme ayrıldı (#cap-adim-olustur, #cap-adim-stil, #cap-adim-uygula); üstte küçük bir adım
 * çubuğu (#cap-adimlar) her adımın durumunu (bekliyor / hazır ✓ / şu an) gösterir, tıklayınca o bölüme kaydırır.
 *
 *   - adimDurumu(d): saf durum makinesi. d = { altyaziVar, uretiliyor, stilSecili, mogrtSecili, uygulandi, ae }
 *     → { olustur, stil, uygula } her biri "bekliyor" | "aktif" | "tamam". "aktif" (şu an) en çok bir adımdadır:
 *     sıradaki bitmemiş adım. After Effects'te (ae) Premiere şablonu (MOGRT) yoktur, stil yalnız Altyazı Efektleri.
 *   - uygulaTuru(d): tek "Timeline'a uygula" düğmesinin hangi yolu çağıracağı: "stil" | "duz".
 *     d = { kayitli, stilSecili, mogrtSecili, ae }. Kullanıcının kayıtlı seçimi ("duz" her zaman, "stil" yalnız bir
 *     stil seçiliyken); kayıt yoksa bir Altyazı Efektleri görünümü ya da MOGRT seçiliyse "stil", değilse "duz".
 *   - baglayici(o) / bagla(o): ince DOM bağlayıcısı. captions.js var olan durum noktalarında guncelle() çağırır
 *     (stil değişince: uygulamaIpucunuGuncelle; iş başlayıp bitince: setBusy; başarılı uygulamadan sonra: yildizIste)
 *     ve başarılı transkriptte sonucGeldi(). Tek düğme yeni bir uygulama yolu AÇMAZ: seçilen türe göre özgün düğmeye
 *     tıklar (Premiere: #cap-apply-style / #cap-apply; After Effects: #ae-ekle-stil / #ae-ekle). Böylece Pro kapıları
 *     (stilli: Pro.gate("overlay", { deneme: true }) / MOGRT; AE stilli: denemesiz), iki tıklamalı onaylar ("Yine de
 *     yeni iz ekle", kritik sorun onayı) ve MCP yolları aynen kalır. Özgün düğmelerin metni / disabled / .warn hâli
 *     tek düğmeye yansıtılır (MutationObserver; yoksa her tıklamadan ve guncelle'den sonra elle).
 *   - Katlanır bölümlerin (Özelleştir, Diğer araçlar, Premiere şablonları) açık / kapalı hâli izleyicinin
 *     tarayıcısında hatırlanır (localStorage, try/catch). "Gelişmiş ayarlar" (#cap-gelismis) hiçbir zaman kodla
 *     açılmaz ve hatırlanmaz: her açılışta kapalı başlar.
 *   - İlk transkript geldiğinde, kullanıcı üretim sırasında kaydırmadıysa, 2. adıma bir kez yumuşakça kaydırılır
 *     (hareket azaltma tercihinde anında).
 *
 * Fiyat / Pro sınırı burada yok. Ağ, telemetri yok. ES5, UMD (Node 12 / CEF 74). DOM yalnız verilen belgeden.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAltyaziAkis = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var ADIMLAR = ["olustur", "stil", "uygula"];
  var DURUM_METNI = { bekliyor: "bekliyor", aktif: "şu an", tamam: "hazır ✓" };
  // Açık / kapalı hâli hatırlanan katlanır bölümler. #cap-gelismis bilerek yok (hep kapalı başlar).
  var HATIRLANAN = ["cap-ozellestir", "cap-diger-araclar", "cap-mogrt-sar"];
  var GELISMIS = "cap-gelismis";
  var DEPO = { acik: "suflo.akis.acik", tur: "suflo.akis.tur", kaydirma: "suflo.akis.ilkKaydirma" };
  // After Effects'te caption izi / timeline yok: düz yol etkin kompozisyona metin katmanı ekler (ae-panel ekle(false))
  function tekEtiket(d) { return d && d.ae ? "Kompozisyona ekle" : "Timeline'a uygula"; }
  var BOS_METIN = "Önce altyazı oluştur. Timeline'a uygulama ve dosya olarak indirme altyazı hazır olunca açılır.";
  var BOS_METIN_AE = "Önce altyazı oluştur. Kompozisyona ekleme ve dosya olarak indirme altyazı hazır olunca açılır.";
  var STIL_YOK_IPUCU = "Önce 2. adımda bir stil seç";
  var KAYDIRMA_TUSLARI = { PageUp: 1, PageDown: 1, ArrowUp: 1, ArrowDown: 1, Home: 1, End: 1, " ": 1, Spacebar: 1 };

  function stilVarMi(d) { return !!(d.stilSecili || (d.mogrtSecili && !d.ae)); }

  function adimDurumu(d) {
    d = d || {};
    var altyazi = !!d.altyaziVar && !d.uretiliyor;
    var stil = stilVarMi(d);
    if (!altyazi) {
      return { olustur: "aktif", stil: stil ? "tamam" : "bekliyor", uygula: "bekliyor" };
    }
    if (d.uygulandi) return { olustur: "tamam", stil: stil ? "tamam" : "bekliyor", uygula: "tamam" };
    if (!stil) return { olustur: "tamam", stil: "aktif", uygula: "bekliyor" };
    return { olustur: "tamam", stil: "tamam", uygula: "aktif" };
  }

  function uygulaTuru(d) {
    d = d || {};
    var stil = stilVarMi(d);
    if (d.kayitli === "duz") return "duz";
    if (d.kayitli === "stil") return stil ? "stil" : "duz";
    return stil ? "stil" : "duz";
  }

  // localStorage sarmalayıcısı: erişim (gizli pencere, kapalı site verisi) fırlatabilir; her okuma / yazma try/catch
  function depoSar(depo) {
    function d() { try { return typeof depo === "function" ? depo() : depo; } catch (e) { return null; } }
    return {
      al: function (k) { try { var s = d(); return s ? s.getItem(k) : null; } catch (e) { return null; } },
      yaz: function (k, v) { try { var s = d(); if (s) s.setItem(k, v); } catch (e) {} }
    };
  }

  /*
   * o = {
   *   belge: document,
   *   durum: () => { altyaziVar, uretiliyor, stilSecili, mogrtSecili },
   *   depo: localStorage | () => localStorage (isteğe bağlı),
   *   ae: () => bool (isteğe bağlı; yoksa body.host-ae),
   *   hareketAzalt: () => bool (isteğe bağlı; yoksa prefers-reduced-motion),
   *   turDegisti: (tur) => void (isteğe bağlı; kullanıcı / rehber türü seçince, guncelle'den sonra)
   * }
   */
  function baglayici(o) {
    o = o || {};
    var belge = o.belge;
    var depo = depoSar(o.depo);
    var uygulandi = false, oncekiUretiliyor = false, kullaniciKaydirdi = false, mogrtAcildi = false;
    var geciciTur = "";   // rehberin önerdiği tür (kaydedilmez)
    var uretimSuruyor = false;   // setBusy(true) … setBusy(false) arası
    var bellekTur = "";   // kullanıcının bu oturumdaki seçimi (depo yazılamasa da geçerli)
    var sonDurum = { altyaziVar: false, uretiliyor: false, stilSecili: false, mogrtSecili: false };
    var gozcu = null;

    function el(id) { return belge && belge.getElementById ? belge.getElementById(id) : null; }
    function aeMi() {
      if (typeof o.ae === "function") return !!o.ae();
      var b = belge && belge.body;
      return !!(b && b.classList && b.classList.contains("host-ae"));
    }
    function hareketAzalt() {
      if (typeof o.hareketAzalt === "function") return !!o.hareketAzalt();
      try {
        var w = belge && belge.defaultView;
        return !!(w && w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches);
      } catch (e) { return false; }
    }
    function kaydir(hedef, blok) {
      if (!hedef || !hedef.scrollIntoView) return;
      try { hedef.scrollIntoView({ behavior: hareketAzalt() ? "auto" : "smooth", block: blok || "start" }); }
      catch (e) { try { hedef.scrollIntoView(true); } catch (e2) {} }
    }
    function kayitliTur() {
      if (bellekTur) return bellekTur;
      var t = depo.al(DEPO.tur);
      return t === "stil" || t === "duz" ? t : "";
    }
    function durumOku(ek) {
      var d = {};
      try { d = (typeof o.durum === "function" ? o.durum() : null) || {}; } catch (e) { d = {}; }
      var out = {
        altyaziVar: !!d.altyaziVar, uretiliyor: !!d.uretiliyor,
        stilSecili: !!d.stilSecili, mogrtSecili: !!d.mogrtSecili, ae: aeMi()
      };
      // Üretim (Altyazı oluştur işi) captions.js setBusy'den gelir ve hatırlanır: başka araçların arka plan
      // transkripsiyonu (motor meşgul) akışı "üretiliyor"a çevirmez
      if (ek && typeof ek.uretiliyor === "boolean") uretimSuruyor = ek.uretiliyor;
      out.uretiliyor = out.uretiliyor || uretimSuruyor;
      return out;
    }
    function tur(d) {
      return uygulaTuru({ kayitli: geciciTur || kayitliTur(), stilSecili: d.stilSecili, mogrtSecili: d.mogrtSecili, ae: d.ae });
    }
    function hedefDugme(d) {
      var t = tur(d);
      return d.ae ? el(t === "stil" ? "ae-ekle-stil" : "ae-ekle") : el(t === "stil" ? "cap-apply-style" : "cap-apply");
    }
    function metinYaz(n, m) { if (n && n.textContent !== m) n.textContent = m; }

    // Özgün düğmenin metni, disabled ve .warn hâli tek düğmeye (iki tıklamalı onaylar burada görünür)
    function aynala() {
      var d = sonDurum;
      var tek = el("cap-uygula-tek");
      if (!tek) return;
      var h = hedefDugme(d);
      var uyari = !!(h && h.classList && h.classList.contains("warn"));
      var hedefMetin = h ? String(h.textContent || "").replace(/\s+/g, " ").trim() : "";
      metinYaz(el("cap-uygula-tek-metin"), uyari && hedefMetin ? hedefMetin : tekEtiket(d));
      metinYaz(el("cap-uygula-tek-alt"), d.altyaziVar && !uyari ? hedefMetin : "");
      var kapali = !d.altyaziVar || d.uretiliyor || !h || !!h.disabled;
      tek.disabled = kapali;
      if (tek.classList) tek.classList.toggle("warn", uyari);
    }

    function adimCubugu(s) {
      ADIMLAR.forEach(function (ad) {
        var dugme = el("cap-adimlar-" + ad);
        var bolum = el("cap-adim-" + ad);
        var etiket = el("cap-adimlar-" + ad + "-durum");
        if (dugme) {
          dugme.setAttribute("data-durum", s[ad]);
          if (s[ad] === "aktif") dugme.setAttribute("aria-current", "step");
          else if (dugme.removeAttribute) dugme.removeAttribute("aria-current");
        }
        if (bolum) bolum.setAttribute("data-durum", s[ad]);
        metinYaz(etiket, DURUM_METNI[s[ad]]);
      });
    }

    function turCiz(d) {
      var t = tur(d);
      var stilVar = stilVarMi(d);
      ["stil", "duz"].forEach(function (ad) {
        var b = el("cap-uygula-tur-" + ad);
        if (!b) return;
        var secili = ad === t;
        if (b.classList) b.classList.toggle("on", secili);
        b.setAttribute("aria-checked", secili ? "true" : "false");
        b.setAttribute("tabindex", secili ? "0" : "-1");
        // düz düğmenin alt öğesi yok (textContent güvenli); stilli düğmenin .pro-inline'ı korunur (AE'de de doğru)
        if (ad === "duz") metinYaz(b, d.ae ? "Düz metin katmanı · ücretsiz" : "Düz altyazı izi · ücretsiz");
        if (ad === "stil") {
          b.disabled = !stilVar;
          if (!stilVar) b.setAttribute("title", STIL_YOK_IPUCU);
          else if (b.removeAttribute) b.removeAttribute("title");
        }
      });
    }

    function guncelle(ek) {
      var d = durumOku(ek);
      if (d.uretiliyor && !oncekiUretiliyor) { uygulandi = false; kullaniciKaydirdi = false; }
      oncekiUretiliyor = d.uretiliyor;
      if (ek && ek.uygulandi && d.altyaziVar) uygulandi = true;
      if (!d.altyaziVar) uygulandi = false;
      sonDurum = d;
      var s = adimDurumu({ altyaziVar: d.altyaziVar, uretiliyor: d.uretiliyor, stilSecili: d.stilSecili,
        mogrtSecili: d.mogrtSecili, uygulandi: uygulandi, ae: d.ae });
      adimCubugu(s);
      // Transkript yokken 3. adım: yalnız ipucu ve kapalı tek düğme; tür seçimi ve ek satırlar (indir, AE) gizli
      var bos = el("cap-uygula-bos");
      if (bos) { bos.hidden = d.altyaziVar; metinYaz(bos, d.ae ? BOS_METIN_AE : BOS_METIN); }
      ["cap-uygula-govde", "cap-uygula-ek"].forEach(function (id) { var n = el(id); if (n) n.hidden = !d.altyaziVar; });
      turCiz(d);
      // Kayıtlı bir Premiere şablonu seçiliyse şablon bölümü (oturumda bir kez) kendiliğinden açılır
      if (d.mogrtSecili && !d.ae && !mogrtAcildi) {
        mogrtAcildi = true;
        var m = el("cap-mogrt-sar");
        if (m && !m.open) m.open = true;
      }
      aynala();
      return s;
    }

    function turSec(t, secenek) {
      if (t !== "stil" && t !== "duz") return;
      if (secenek && secenek.gecici) geciciTur = t;
      else { geciciTur = ""; bellekTur = t; depo.yaz(DEPO.tur, t); }
      guncelle();
      // captions.js: 3. adımın ipucu seçilen türü anlatsın (o.turDegisti → uygulamaIpucunuGuncelle; o turSec çağırmaz)
      if (typeof o.turDegisti === "function") { try { o.turDegisti(tur(sonDurum)); } catch (eT) {} }
    }

    function tekTiklandi() {
      var h = hedefDugme(sonDurum);
      if (!h || h.disabled || !sonDurum.altyaziVar) return;
      h.click();
      aynala();   // apply()'ın onay etiketi ilk await'ten önce yazılır: gözcü yoksa da hemen görünür
    }

    function adimaGit(ad) {
      var bolum = el("cap-adim-" + ad);
      if (!bolum) return false;
      kaydir(bolum, "start");
      var bas = el("cap-adim-" + ad + "-baslik");
      if (bas && bas.focus) { try { bas.focus({ preventScroll: true }); } catch (e) { try { bas.focus(); } catch (e2) {} } }
      return true;
    }

    // İlk transkript: kullanıcı üretim sırasında kaydırmadıysa 2. adıma bir kez kaydır
    function sonucGeldi(bilgi) {
      if (bilgi && bilgi.kaynak && bilgi.kaynak !== "go") return false;
      if (kullaniciKaydirdi || depo.al(DEPO.kaydirma) === "1") return false;
      depo.yaz(DEPO.kaydirma, "1");
      return adimaGit("stil");
    }

    function acikOku() {
      var v = depo.al(DEPO.acik);
      try { v = v ? JSON.parse(v) : {}; } catch (e) { v = {}; }
      return v && typeof v === "object" ? v : {};
    }
    function acikYaz(id, acik) {
      var v = acikOku();
      v[id] = !!acik;
      depo.yaz(DEPO.acik, JSON.stringify(v));
    }

    function bagla() {
      var kayit = acikOku();
      HATIRLANAN.forEach(function (id) {
        var det = el(id);
        if (!det) return;
        if (kayit[id] === true) det.open = true;
        if (det.addEventListener) det.addEventListener("toggle", function () { acikYaz(id, det.open); });
      });
      ADIMLAR.forEach(function (ad) {
        var b = el("cap-adimlar-" + ad);
        if (b && b.addEventListener) b.addEventListener("click", function () { adimaGit(ad); });
      });
      ["stil", "duz"].forEach(function (ad) {
        var b = el("cap-uygula-tur-" + ad);
        if (b && b.addEventListener) b.addEventListener("click", function () { turSec(ad); });
      });
      // Tür seçimi bir radyo grubu: oklar seçimi değiştirir (tek sekme durağı)
      var grup = el("cap-uygula-tur");
      if (grup && grup.addEventListener) {
        grup.addEventListener("keydown", function (e) {
          var k = e && e.key;
          if (k !== "ArrowLeft" && k !== "ArrowRight" && k !== "ArrowUp" && k !== "ArrowDown") return;
          var simdi = tur(sonDurum), sonraki = simdi === "stil" ? "duz" : "stil";
          var b = el("cap-uygula-tur-" + sonraki);
          if (!b || b.disabled) return;
          if (e.preventDefault) e.preventDefault();
          turSec(sonraki);
          if (b.focus) { try { b.focus(); } catch (eF) {} }
        });
      }
      var tek = el("cap-uygula-tek");
      if (tek && tek.addEventListener) tek.addEventListener("click", tekTiklandi);
      // Kullanıcı üretim sürerken kendisi kaydırdı mı (programın kaydırması sayılmaz)
      if (belge && belge.addEventListener) {
        var izle = function (e) {
          if (!oncekiUretiliyor) return;
          if (e && e.type === "keydown" && !KAYDIRMA_TUSLARI[e.key]) return;
          kullaniciKaydirdi = true;
        };
        ["wheel", "touchmove", "keydown"].forEach(function (t) {
          try { belge.addEventListener(t, izle, { capture: true, passive: true }); } catch (e) { belge.addEventListener(t, izle, true); }
        });
      }
      // Özgün düğmelerin metni / disabled / sınıfı değişince tek düğme ve #cap-result görünürlüğü
      var MO = belge && belge.defaultView && belge.defaultView.MutationObserver;
      if (!MO && typeof MutationObserver !== "undefined") MO = MutationObserver;
      if (MO) {
        try {
          gozcu = new MO(function () { aynala(); });
          ["cap-apply", "cap-apply-style", "ae-ekle", "ae-ekle-stil"].forEach(function (id) {
            var n = el(id);
            if (n) gozcu.observe(n, { attributes: true, attributeFilter: ["disabled", "class"], childList: true, characterData: true, subtree: true });
          });
          var sonuc = el("cap-result");
          if (sonuc) new MO(function () { guncelle(); }).observe(sonuc, { attributes: true, attributeFilter: ["hidden"] });
        } catch (eMO) { gozcu = null; }
      }
      guncelle();
    }

    bagla();
    return {
      guncelle: guncelle,
      aynala: aynala,
      turSec: turSec,
      adimaGit: adimaGit,
      sonucGeldi: sonucGeldi,
      tur: function () { return tur(sonDurum); },
      durum: function () { return sonDurum; }
    };
  }

  var varsayilan = null;
  return {
    ADIMLAR: ADIMLAR.slice(),
    DURUM_METNI: DURUM_METNI,
    HATIRLANAN: HATIRLANAN.slice(),
    GELISMIS: GELISMIS,
    DEPO: DEPO,
    adimDurumu: adimDurumu,
    uygulaTuru: uygulaTuru,
    baglayici: baglayici,
    // captions.js init: tek bağlayıcı; durum noktaları aşağıdaki kısa yolları çağırır (bağlı değilse sessiz)
    bagla: function (o) { varsayilan = baglayici(o); return varsayilan; },
    guncelle: function (ek) { return varsayilan ? varsayilan.guncelle(ek) : null; },
    sonucGeldi: function (b) { return varsayilan ? varsayilan.sonucGeldi(b) : false; },
    turSec: function (t, s) { if (varsayilan) varsayilan.turSec(t, s); },
    tur: function () { return varsayilan ? varsayilan.tur() : ""; },
    adimaGit: function (ad) { return varsayilan ? varsayilan.adimaGit(ad) : false; }
  };
});
