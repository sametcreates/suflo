/*
 * Suflo — fiyat ve ödeme bağlantısı (tek kaynak)
 *
 * Panelde görünen fiyat ile düğmenin açtığı ödeme sayfası HER ZAMAN aynı para
 * biriminde olur. USD varyantı Lemon Squeezy'de (ürün 1302656) açılıp adresi
 * PRICING.en.url'ye yazılana kadar İngilizce arayüz de TRY fiyatını gösterir
 * ("749 TRY (≈ $19)") ve TRY ödemesini açar.
 *
 * Türkçe çıktılar v3.0 ile bayt bayt aynıdır (tests/test-pricing.js).
 * Lisans tarafı her varyantı kabul eder (pro.js ve sunucuda VARIANT_ID 0).
 * Saf modül: tarayıcıda window.SufloPricing, Node'da module.exports.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloPricing = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";

  var TRY_CHECKOUT = "https://suflo.lemonsqueezy.com/checkout/buy/e33dda31-8e47-46c3-be1d-e047ab1b2dd1";

  var PRICING = {
    tr: { now: "749 TL", was: "1.249 TL", tax: "+ KDV", currency: "TRY", amount: 749, url: TRY_CHECKOUT },
    // url boşken İngilizce arayüz TRY ödemesine düşer (bkz. offer). Kurucu: USD varyantını aç,
    // "checkout/buy/<uuid>" adresini buraya yaz (marketing/v4-kurucu-yapilacaklar.md).
    en: { now: "$39", was: "$59", tax: "+ tax", currency: "USD", amount: 39, url: "" }
  };
  // USD varyantı yokken İngilizce arayüzde gösterilen TRY fiyatı
  var EN_TRY = { now: "749 TRY (≈ $19)", was: "1,249 TRY", tax: "+ tax" };

  function dil(lang) { return lang === "en" ? "en" : "tr"; }
  function usdHazir() { return /^https:\/\/[a-z0-9.-]+\.lemonsqueezy\.com\/checkout\/buy\/[A-Za-z0-9-]+$/.test(PRICING.en.url); }

  // Gösterilen fiyat + açılacak ödeme: aynı para birimi
  function offer(lang) {
    if (dil(lang) === "tr") {
      var t = PRICING.tr;
      return { lang: "tr", now: t.now, was: t.was, tax: t.tax, currency: t.currency, amount: t.amount, url: t.url };
    }
    if (usdHazir()) {
      var e = PRICING.en;
      return { lang: "en", now: e.now, was: e.was, tax: e.tax, currency: e.currency, amount: e.amount, url: e.url };
    }
    return { lang: "en", now: EN_TRY.now, was: EN_TRY.was, tax: EN_TRY.tax, currency: PRICING.tr.currency,
      amount: PRICING.tr.amount, url: PRICING.tr.url };
  }

  function label(lang) { return offer(lang).now; }
  function wasLabel(lang) { return offer(lang).was; }
  function taxLabel(lang) { return offer(lang).tax; }
  function currency(lang) { return offer(lang).currency; }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
  }

  // Pro tanıtım penceresinin fiyat kutusu. Türkçe metin çevirmen tarafından İngilizceye
  // çevrilir (i18n/en.js fiyat kalıpları), bu yüzden panel her zaman "tr" ile çağırır.
  function upsellPriceHtml(lang) {
    if (dil(lang) === "tr") {
      return '<div class="pro-upsell-fiyat"><span>TEK SEFERLİK · <s>' + esc(PRICING.tr.was) + '</s></span><b>' + esc(PRICING.tr.now) +
        '</b><small>' + esc(PRICING.tr.tax) + ' · abonelik yok · dakika limiti yok</small></div>';
    }
    var o = offer("en");
    return '<div class="pro-upsell-fiyat"><span>ONE-TIME · <s>' + esc(o.was) + '</s></span><b>' + esc(o.now) +
      '</b><small>' + esc(o.tax) + ' · no subscription · no minute limits</small></div>';
  }

  // Ayarlar > Pro karşılaştırmasındaki fiyat satırı
  function settingsRow(lang) {
    return dil(lang) === "tr" ? "Pro — " + PRICING.tr.now + ", tek sefer" : "Pro — " + label("en") + ", one-time";
  }

  function referral() {
    if (root && root.SufloReferral) return root.SufloReferral;
    if (typeof require === "function") {
      try { return require("./referral-core.js"); } catch (e) { return null; }
    }
    return null;
  }

  /*
   * Panelin ödeme bağlantısı (app.js'teki eski proCheckoutUrl). Kaynak, özellik ve sürüm
   * checkout[custom] alanlarına; geçerli bir davet kodu varsa indirim olarak eklenir.
   */
  function checkoutUrl(lang, feature, version, discountCode) {
    var url = offer(lang).url +
      "?checkout%5Bcustom%5D%5Bsource%5D=suflo_panel" +
      "&checkout%5Bcustom%5D%5Bfeature%5D=" + encodeURIComponent(String(feature || "pro")) +
      "&checkout%5Bcustom%5D%5Bapp_version%5D=" + encodeURIComponent(String(version || "unknown"));
    var R = referral();
    return R && R.withDiscount ? R.withDiscount(url, discountCode || "") : url;
  }

  // schema.org Offer (site sayfaları için): para birimi canlı ödemeyle aynı
  function schemaOffer(lang) {
    var o = offer(lang);
    return { "@type": "Offer", price: String(o.amount), priceCurrency: o.currency, url: o.url };
  }

  // Upsell "örnek gör" bağlantısı: arayüz diliyle aynı dildeki Pro sayfası
  function proPageUrl(lang) {
    return dil(lang) === "en" ? "https://suflo.app/en/pro.html" : "https://suflo.app/pro";
  }

  return {
    PRICING: PRICING, EN_TRY: EN_TRY, TRY_CHECKOUT: TRY_CHECKOUT,
    offer: offer, label: label, wasLabel: wasLabel, taxLabel: taxLabel, currency: currency, usdReady: usdHazir,
    upsellPriceHtml: upsellPriceHtml, settingsRow: settingsRow, checkoutUrl: checkoutUrl, schemaOffer: schemaOffer,
    proPageUrl: proPageUrl
  };
});
