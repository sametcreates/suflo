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
  // Panelin Suflo Stilleri (js/style-engine.js adları; test eşleşmeyi denetler)
  var STILLER = {
    mrbeast: "Creator Punch", capcut: "Clean Pill", saas: "SaaS Glass", viral: "Viral Vurgu", pop: "Pop",
    doc: "Belgesel", premium: "Premium", hormozi: "Bold Box", neon: "Neon", daktilo: "Daktilo",
    ziplama: "Zıplayan", dolgu: "Karaoke Dolgu"
  };
  var KONUM = { 1: "Alt sol", 2: "Alt", 5: "Orta", 8: "Üst" };

  function el(id) { return document.getElementById(id); }
  function yaz(id, metin) { var e = el(id); if (e) e.textContent = metin; }

  function hata(mesaj) {
    el("stil-hata").hidden = false;
    yaz("stil-hata-metin", mesaj);
  }

  function renk(id, deger) {
    var e = el(id);
    if (!e) return;
    if (SS.isColor(deger)) { e.style.backgroundColor = deger; e.title = e.title + " " + deger.toLowerCase(); }
    else e.hidden = true;
  }

  function goster() {
    var kod = "";
    try { kod = decodeURIComponent(String(location.hash || "").replace(/^#/, "")); } catch (e) { kod = String(location.hash || "").replace(/^#/, ""); }
    el("stil-hata").hidden = true;
    el("stil-icerik").hidden = true;
    if (!kod) return;   // kodsuz ziyaret: yalnız "nasıl kullanılır" kartı
    if (!SS) { hata("Sayfa tam yüklenemedi; yenile."); return; }
    var d = SS.decode(kod, STILLER);
    if (!d.ok) { hata(d.error); return; }
    var r = d.recipe, ov = r.overrides;
    var ad = STILLER[r.styleId];
    yaz("stil-ad", ad + (r.author ? " · @" + r.author : ""));
    document.title = ad + " · Paylaşılan Suflo Stili";
    el("stil-yazar-sar").hidden = !r.author;
    yaz("stil-yazar", r.author ? "@" + r.author : "");
    yaz("stil-temel", ad);
    var font = ov.font || "";
    yaz("stil-font", font || "Stilin kendi yazı tipi");
    if (font && SS.hasFont(font)) el("stil-font").style.fontFamily = "\"" + font + "\", sans-serif";
    renk("renk-yazi", ov.renk);
    renk("renk-kontur", ov.konturRenk);
    renk("renk-vurgu", ov.vurguRenk);
    yaz("stil-konum", ov.konum ? KONUM[ov.konum] : "Stilin kendi konumu");
    yaz("stil-kod", kod.replace(/\s+/g, ""));
    var v = el("stil-video");
    v.src = "gorseller/suflo-stiller/" + r.styleId + ".webm";
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e2) {}
    el("stil-icerik").hidden = false;
  }

  function kopyala() {
    var kod = el("stil-kod").textContent;
    var b = el("kodu-kopyala");
    function bitti() { b.textContent = "Kopyalandı ✓"; setTimeout(function () { b.textContent = "Kodu kopyala"; }, 2200); }
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
