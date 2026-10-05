/*
 * Suflo — Ayarlar › Marka Kiti kartı (ince DOM yapıştırıcısı)
 *
 * Şema, doğrulama, birleştirme ve logo yerleşimi js/marka-kiti.js'te (saf, testli).
 * Burada yalnız alanlar okunur/yazılır; kit K.settings().markaKiti'de durur. Her değişiklikte
 * "suflo:markaKiti" olayı yayılır: Altyazı sekmesi (çip, seçili stil) ve kanca başlığı tazelenir.
 * Düzenlemek ve önizlemek ücretsiz; timeline'a eklemek stilli katman / kanca kapısından geçer.
 */
window.KMarkaKiti = (function () {
  "use strict";

  var MK = window.SufloMarkaKiti;

  function el(id) { return document.getElementById(id); }
  // Diyalog başlıkları arayüz dilinde (Premiere'in kendi penceresi i18n gözlemcisinin dışında)
  function uiMetni(t) { return window.SufloI18n && window.SufloI18n.tr ? window.SufloI18n.tr(t) : t; }

  function uiDili() {
    try { return window.SufloI18n ? SufloI18n.getLang() : "tr"; } catch (e) { return "tr"; }
  }

  function motorStili(id) { return !!(window.SufloStyleEngine && window.SufloStyleEngine.has(id)); }
  function kancaStili(id) { return !!(window.SufloHookTitle && window.SufloHookTitle.STILLER && Object.prototype.hasOwnProperty.call(window.SufloHookTitle.STILLER, id)); }

  function oku() {
    return MK.normalize(K.settings().markaKiti, { styleIds: motorStili, hookStyles: kancaStili });
  }

  function durum(msg, cls) {
    var e = el("mk-durum");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function dosyaAdi(p) {
    var s = String(p || "");
    return s.split(/[\\/]/).pop() || s;
  }

  function oranYaz(n) {
    var e = el("mk-logo-oran-deger");
    if (e) e.textContent = uiDili() === "en" ? n + "%" : "%" + n;
  }

  // Kayıttaki kit → alanlar
  function doldur(kit) {
    var ov = kit.stil.overrides;
    el("mk-acik").checked = kit.on;
    el("mk-font").value = ov.font || "";
    el("mk-konum").value = ov.konum ? String(ov.konum) : "";
    var renkVar = !!(ov.renk || ov.konturRenk || ov.vurguRenk);
    el("mk-renk-acik").checked = renkVar;
    if (ov.renk) el("mk-renk").value = ov.renk;
    if (ov.konturRenk) el("mk-renk-kontur").value = ov.konturRenk;
    if (ov.vurguRenk) el("mk-renk-vurgu").value = ov.vurguRenk;
    el("mk-logo-kose").value = kit.logo.kose;
    var yuzde = Math.round(kit.logo.oran * 100);
    el("mk-logo-oran").value = String(yuzde);
    oranYaz(yuzde);
    logoGoster(kit.logo.path);
    alanlariKilitle();
  }

  function logoGoster(yol) {
    var ad = el("mk-logo-ad");
    if (ad) {
      ad.textContent = yol ? dosyaAdi(yol) : "";
      ad.title = yol || "";
    }
    if (el("mk-logo-kaldir")) el("mk-logo-kaldir").hidden = !yol;
    if (yol) {
      var bulundu = false;
      try { bulundu = K.fs.existsSync(yol); } catch (e) { bulundu = false; }
      if (!bulundu) durum("Logo dosyası bulunamadı (taşınmış ya da silinmiş olabilir). Yeniden seç.", "warn");
    }
  }

  // Renkler kapalıyken renk kutuları soluk
  function alanlariKilitle() {
    var acik = el("mk-renk-acik").checked;
    ["mk-renk", "mk-renk-kontur", "mk-renk-vurgu"].forEach(function (id) { el(id).disabled = !acik; });
  }

  // Alanlar → kit (eski kitin kanca / ilerleme / cta alanları korunur)
  function topla() {
    var eski = oku().kit;
    var ov = {};
    if (el("mk-font").value) ov.font = el("mk-font").value;
    if (el("mk-konum").value) ov.konum = Number(el("mk-konum").value);
    if (el("mk-renk-acik").checked) {
      ov.renk = el("mk-renk").value;
      ov.konturRenk = el("mk-renk-kontur").value;
      ov.vurguRenk = el("mk-renk-vurgu").value;
    }
    var ham = JSON.parse(JSON.stringify(eski));
    ham.on = el("mk-acik").checked;
    ham.stil.overrides = ov;
    ham.logo.kose = el("mk-logo-kose").value;
    ham.logo.oran = Number(el("mk-logo-oran").value) / 100;
    return ham;
  }

  function kaydet(ham) {
    var n = MK.normalize(ham, { styleIds: motorStili, hookStyles: kancaStili });
    K.settings().markaKiti = n.kit;
    K.saveSettings();
    try { document.dispatchEvent(new CustomEvent("suflo:markaKiti", { detail: { on: n.kit.on } })); } catch (e) {}
    if (window.KKanca && window.KKanca.kitDegisti) window.KKanca.kitDegisti();
    return n.kit;
  }

  function degisti() {
    durum("");
    alanlariKilitle();
    var kit = kaydet(topla());
    if (kit.logo.path) logoGoster(kit.logo.path);
  }

  function logoSec() {
    var yol = null;
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var r = window.cep.fs.showOpenDialogEx(false, false, uiMetni("Logo seç (PNG ya da JPG)"), "", ["png", "jpg", "jpeg"]);
      if (r && r.data && r.data.length) yol = r.data[0];
    }
    if (!yol) return;
    if (!MK.isLogoPath(yol)) { durum("Logo PNG ya da JPG olmalı.", "bad"); return; }
    try {
      var boyut = K.fs.statSync(yol).size;
      if (boyut > 20 * 1048576) { durum("Logo dosyası çok büyük (en çok 20 MB).", "bad"); return; }
    } catch (e) { durum("Logo dosyası okunamadı.", "bad"); return; }
    var ham = topla();
    ham.logo.path = yol;
    durum("");
    var kit = kaydet(ham);
    logoGoster(kit.logo.path);
  }

  function logoKaldir() {
    var ham = topla();
    ham.logo.path = "";
    durum("");
    logoGoster(kaydet(ham).logo.path);
  }

  // Altyazı sekmesindeki yazı tipi / renk / (seçiliyse) konum → kit
  function simdikiden() {
    if (!window.KCaptions || !window.KCaptions.stilAyarlari) return;
    var st = window.KCaptions.stilAyarlari();
    var kit = MK.fromCurrent(st, oku().kit, !!el("mk-konum").value);
    doldur(kit);
    if (!(st && window.SufloStyleShare && window.SufloStyleShare.hasFont(st.font))) durum("Sistem yazı tipi kite alınmadı: yalnız Suflo ile gelen yazı tipleri her bilgisayarda aynı görünür.", "warn");
    else if (!MK.isOn(kit)) durum("Doldu. Kullanmak için \"Marka kitini her stile ve kanca başlığına uygula\"yı aç.", "warn");
    else durum("Şimdiki ayarlar kite alındı.", "good");
    kaydet(kit);
  }

  function init() {
    if (!MK || !el("grp-marka-kiti")) return;
    var n = oku();
    doldur(n.kit);
    ["mk-acik", "mk-font", "mk-konum", "mk-renk-acik", "mk-logo-kose"].forEach(function (id) {
      el(id).addEventListener("change", degisti);
    });
    ["mk-renk", "mk-renk-kontur", "mk-renk-vurgu"].forEach(function (id) {
      el(id).addEventListener("change", degisti);
    });
    el("mk-logo-oran").addEventListener("input", function () { oranYaz(el("mk-logo-oran").value); });
    el("mk-logo-oran").addEventListener("change", degisti);
    el("mk-logo-sec").addEventListener("click", logoSec);
    el("mk-logo-kaldir").addEventListener("click", logoKaldir);
    el("mk-doldur").addEventListener("click", simdikiden);
    if (window.SufloI18n && SufloI18n.onChange) SufloI18n.onChange(function () { oranYaz(el("mk-logo-oran").value); });
  }

  return { init: init };
})();
