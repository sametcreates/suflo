/*
 * suflo.app/stil#SFL1.… — paylaşılan stil kodunun sayfası
 *
 * Kod yalnız adresin # kısmında durur (sunucuya gitmez). Çözümleme panelle aynı modülle
 * (js/style-share.js, panelin bayt bayt kopyası): bilinmeyen stil, bozuk kod, geçersiz yazar
 * reddedilir. Sayfaya yazılan her şey textContent / doğrulanmış renk; HTML yok.
 * CSP: script-src 'self' (satır içi betik yok).
 */
(function () {
  "use strict";

  var SS = window.SufloStyleShare;
  // Stil motorundaki temel stiller (js/style-engine.js adları; test eşleşmeyi denetler). 3.3'ten beri panel
  // yalnız Altyazı Efektleri'ni (efekt) üretir; eski kodlar açılmaya devam etsin diye öbürleri de burada
  var STILLER = {
    mrbeast: "Creator Punch", capcut: "Clean Pill", saas: "SaaS Glass", viral: "Viral Vurgu", pop: "Pop",
    doc: "Belgesel", premium: "Premium", hormozi: "Bold Box", neon: "Neon", daktilo: "Daktilo",
    ziplama: "Zıplayan", dolgu: "Karaoke Dolgu", efekt: "Altyazı Efektleri"
  };
  // Sayfanın dili <html lang>: "en" → İngilizce sayfa (suflo.app/en/stil); stil kimliği ve kod aynı
  var EN = !!(document.documentElement && document.documentElement.lang === "en");
  var STILLER_EN = {
    mrbeast: "Creator Punch", capcut: "Clean Pill", saas: "SaaS Glass", viral: "Viral Highlight", pop: "Pop",
    doc: "Documentary", premium: "Premium", hormozi: "Bold Box", neon: "Neon", daktilo: "Typewriter",
    ziplama: "Bouncy", dolgu: "Karaoke Fill", efekt: "Caption Effects"
  };
  var KONUM = EN ? { 1: "Bottom left", 2: "Bottom", 5: "Center", 8: "Top" } : { 1: "Alt sol", 2: "Alt", 5: "Orta", 8: "Üst" };
  /*
   * Altyazı Efektleri (efekt) kodu: giriş ve vurgu animasyonu (stil motoru GIRISLER / AKTIFLER; boşsa
   * efektin kendi değeri Belirme / Yok, test eşleşmeyi denetler). Video çiftin gerçek motor çıktısı
   * (tools/render-style-previews.js --site --efekt): docs/gorseller/suflo-stiller/efekt-<giris>-<aktif>.webm.
   */
  var EFEKT_VARSAYILAN = { giris: "fade", aktif: "yok" };
  var GIRIS = EN ? { yok: "None", pop: "Pop", fade: "Fade in", yukari: "Slide up", asagi: "Slide down", zipla: "Bounce" }
    : { yok: "Yok", pop: "Pop", fade: "Belirme", yukari: "Yukarı kay", asagi: "Aşağı kay", zipla: "Zıpla" };
  var AKTIF = EN ? { yok: "None", zipla: "Bounce", titre: "Shake", glitch: "Glitch" } : { yok: "Yok", zipla: "Zıpla", titre: "Titre", glitch: "Glitch" };
  var M = EN ? {
    yuklenemedi: "The page did not load completely; refresh it.",
    hata: "This style code could not be read; it may have been copied incompletely.",
    surum: "This code was made with a newer Suflo version; update Suflo.",
    stilYok: "This style is not available in this Suflo version.",
    yazar: "The author name in this style code is invalid.",
    baslik: " · Shared Caption Effect",
    kendiFontu: "The style's own font",
    kendiKonumu: "The style's own position",
    renk: { "renk-yazi": "Text", "renk-kontur": "Outline", "renk-vurgu": "Highlight" },
    not: "The video shows the base style; the code’s font, colors and position are applied in the panel.",
    efektNot: "The video shows the code’s entrance and highlight animation; its font, colors and position are applied in the panel.",
    kopyalandi: "Copied ✓", kopyala: "Copy code",
    video: "../gorseller/suflo-stiller/"
  } : {
    yuklenemedi: "Sayfa tam yüklenemedi; yenile.",
    baslik: " · Paylaşılan Altyazı Efekti",
    kendiFontu: "Stilin kendi yazı tipi",
    kendiKonumu: "Stilin kendi konumu",
    renk: { "renk-yazi": "Yazı", "renk-kontur": "Kontur", "renk-vurgu": "Vurgu" },
    not: "Video temel stili gösterir; kodun yazı tipi, renk ve konum ayarı panelde uygulanır.",
    efektNot: "Video kodun giriş ve vurgu animasyonunu gösterir; yazı tipi, renkler ve konum panelde uygulanır.",
    kopyalandi: "Kopyalandı ✓", kopyala: "Kodu kopyala",
    video: "gorseller/suflo-stiller/"
  };

  function el(id) { return document.getElementById(id); }
  function yaz(id, metin) { var e = el(id); if (e) e.textContent = metin; }

  function hata(mesaj) {
    el("stil-hata").hidden = false;
    yaz("stil-hata-metin", mesaj);
  }

  // Çözücünün (panelle ortak, Türkçe) hata metni → İngilizce sayfada karşılığı
  function hataMetni(tr) {
    if (!EN) return tr;
    if (/daha yeni bir Suflo/.test(tr)) return M.surum;
    if (/stil bu Suflo sürümünde yok/.test(tr)) return M.stilYok;
    if (/yazar/.test(tr)) return M.yazar;
    return M.hata;
  }

  // Her gösterimde baştan kurulur: hashchange ile gelen yeni kodda önceki kodun gizlediği
  // kutu yeniden görünür, başlık birikmez
  function renk(id, deger) {
    var e = el(id);
    if (!e) return;
    e.hidden = false;
    e.style.backgroundColor = "";
    e.title = M.renk[id] || "";
    if (SS.isColor(deger)) { e.style.backgroundColor = deger; e.title = e.title + " " + deger.toLowerCase(); }
    else e.hidden = true;
  }

  function goster() {
    var kod = "";
    try { kod = decodeURIComponent(String(location.hash || "").replace(/^#/, "")); } catch (e) { kod = String(location.hash || "").replace(/^#/, ""); }
    el("stil-hata").hidden = true;
    el("stil-icerik").hidden = true;
    if (!kod) return;   // kodsuz ziyaret: yalnız "nasıl kullanılır" kartı
    if (!SS) { hata(M.yuklenemedi); return; }
    var d = SS.decode(kod, STILLER);
    if (!d.ok) { hata(hataMetni(d.error)); return; }
    var r = d.recipe, ov = r.overrides;
    var ad = (EN ? STILLER_EN : STILLER)[r.styleId] || STILLER[r.styleId];
    yaz("stil-ad", ad + (r.author ? " · @" + r.author : ""));
    document.title = ad + M.baslik;
    el("stil-yazar-sar").hidden = !r.author;
    yaz("stil-yazar", r.author ? "@" + r.author : "");
    yaz("stil-temel", ad);
    var font = ov.font || "";
    yaz("stil-font", font || M.kendiFontu);
    el("stil-font").style.fontFamily = font && SS.hasFont(font) ? "\"" + font + "\", sans-serif" : "";
    renk("renk-yazi", ov.renk);
    renk("renk-kontur", ov.konturRenk);
    renk("renk-vurgu", ov.vurguRenk);
    // 3.3 adım 17: serbest konum (önizlemede sürüklenmiş, %5-95) hazır konumun önüne geçer
    var serbest = typeof ov.konumX === "number" && typeof ov.konumY === "number";
    yaz("stil-konum", serbest ? (EN ? "Free · X " + ov.konumX + "% · Y " + ov.konumY + "%" : "Serbest · X %" + ov.konumX + " · Y %" + ov.konumY)
      : ov.konum ? KONUM[ov.konum] : M.kendiKonumu);
    yaz("stil-kod", kod.replace(/\s+/g, ""));
    // Altyazı Efektleri: kodun animasyon çifti yazılır ve oynar; 3.2 ve öncesi bu kodu açmaz
    var efekt = r.styleId === "efekt";
    var giris = efekt ? (GIRIS[ov.giris] ? ov.giris : EFEKT_VARSAYILAN.giris) : "";
    var aktif = efekt ? (AKTIF[ov.aktif] ? ov.aktif : EFEKT_VARSAYILAN.aktif) : "";
    el("stil-giris-sar").hidden = !efekt;
    el("stil-aktif-sar").hidden = !efekt;
    yaz("stil-giris", efekt ? GIRIS[giris] : "");
    yaz("stil-aktif", efekt ? AKTIF[aktif] : "");
    yaz("stil-not", efekt ? M.efektNot : M.not);
    el("stil-surum").hidden = !efekt;
    var v = el("stil-video");
    v.src = M.video + (efekt ? "efekt-" + giris + "-" + aktif : r.styleId) + ".webm";
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e2) {}
    el("stil-icerik").hidden = false;
  }

  function kopyala() {
    var kod = el("stil-kod").textContent;
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
