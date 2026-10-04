// Suflo testi: js/pricing.js — fiyat + ödeme bağlantısı tek kaynak (gösterilen = açılan ödeme)
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var P = require(path.join(KOK, "js", "pricing.js"));
var I = require(path.join(KOK, "js", "i18n.js"));
var EN = require(path.join(KOK, "i18n", "en.js"));
var ayikla = require("./_ayikla.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

// v3.0'daki app.js proCheckoutUrl ve pro.js fiyat kutusu (bayt bayt referans)
var TRY = "https://suflo.lemonsqueezy.com/checkout/buy/e33dda31-8e47-46c3-be1d-e047ab1b2dd1";
function v30Checkout(feature, surum) {
  return TRY + "?checkout%5Bcustom%5D%5Bsource%5D=suflo_panel" +
    "&checkout%5Bcustom%5D%5Bfeature%5D=" + encodeURIComponent(String(feature || "pro")) +
    "&checkout%5Bcustom%5D%5Bapp_version%5D=" + encodeURIComponent(String(surum));
}
var V30_UPSELL = '<div class="pro-upsell-fiyat"><span>TEK SEFERLİK · <s>1.249 TL</s></span><b>749 TL</b><small>+ KDV · abonelik yok · dakika limiti yok</small></div>';

/* ---------------- Türkçe: v3.0 ile aynı ---------------- */
ok("TR etiketi 749 TL", P.label("tr") === "749 TL" && P.label() === "749 TL" && P.wasLabel("tr") === "1.249 TL" && P.taxLabel("tr") === "+ KDV");
ok("TR fiyat kutusu v3.0 ile bayt bayt aynı", P.upsellPriceHtml("tr") === V30_UPSELL, P.upsellPriceHtml("tr"));
ok("TR ödeme bağlantısı v3.0 ile bayt bayt aynı", P.checkoutUrl("tr", "cut", "3.1.0") === v30Checkout("cut", "3.1.0") &&
  P.checkoutUrl("tr", "", "") === v30Checkout("pro", "unknown") && P.checkoutUrl("tr", "a b&c", "3.1.0") === v30Checkout("a b&c", "3.1.0"),
  P.checkoutUrl("tr", "cut", "3.1.0"));
ok("TR Ayarlar fiyat satırı v3.0 ile aynı", P.settingsRow("tr") === "Pro — 749 TL, tek sefer");
ok("davet kodu indirim olarak eklenir (SufloReferral.withDiscount)",
  P.checkoutUrl("tr", "cut", "3.1.0", "SFLABCDEF") === v30Checkout("cut", "3.1.0") + "&checkout%5Bdiscount_code%5D=SFLABCDEF" &&
  P.checkoutUrl("tr", "cut", "3.1.0", "kotu kod") === v30Checkout("cut", "3.1.0"));

/* ---------------- İngilizce, USD varyantı yokken ---------------- */
ok("USD varyantı yok: en.url boş", P.PRICING.en.url === "" && !P.usdReady());
ok("EN etiketi TRY gösterir (≈ $19)", P.label("en") === "749 TRY (≈ $19)" && P.currency("en") === "TRY");
ok("EN ödeme bağlantısı TRY ödemesini açar", P.checkoutUrl("en", "cut", "3.1.0") === v30Checkout("cut", "3.1.0"));
ok("EN fiyat kutusu TRY", P.upsellPriceHtml("en").indexOf("749 TRY (≈ $19)") !== -1 && P.upsellPriceHtml("en").indexOf("$39") === -1);
I.setDictionary(EN);
ok("en.js kalıbı = SufloPricing.label('en')", I.translate("749 TL") === P.label("en") &&
  I.translate("Geçişleri aç — 749 TL") === "Unlock transitions — " + P.label("en") &&
  I.translate("1.249 TL") === P.wasLabel("en") && I.translate("Pro — 749 TL, tek sefer") === P.settingsRow("en"),
  I.translate("Geçişleri aç — 749 TL"));
ok("schema.org Offer canlı ödemeyle aynı para birimi (TRY)", P.schemaOffer("en").priceCurrency === "TRY" && P.schemaOffer("tr").price === "749");

/* ---------------- İngilizce, USD varyantı açılınca ---------------- */
var USD = "https://suflo.lemonsqueezy.com/checkout/buy/0f0f0f0f-1111-2222-3333-444455556666";
P.PRICING.en.url = USD;
I.setDictionary(EN); // çeviri önbelleğini sıfırla
ok("USD varyantı: EN $39 gösterir", P.usdReady() && P.label("en") === "$39" && P.wasLabel("en") === "$59" && P.currency("en") === "USD");
ok("USD varyantı: EN ödeme bağlantısı varyant adresi", P.checkoutUrl("en", "cut", "3.1.0").indexOf(USD + "?checkout%5Bcustom%5D%5Bsource%5D=suflo_panel") === 0 &&
  P.checkoutUrl("en", "cut", "3.1.0", "SFLABCDEF").indexOf("checkout%5Bdiscount_code%5D=SFLABCDEF") !== -1);
ok("USD varyantı: TR değişmez", P.label("tr") === "749 TL" && P.checkoutUrl("tr", "cut", "3.1.0") === v30Checkout("cut", "3.1.0") && P.upsellPriceHtml("tr") === V30_UPSELL);
ok("USD varyantı: en.js kalıbı $39", I.translate("749 TL") === "$39" && I.translate("Motion BG'yi aç — 749 TL") === "Unlock Motion BG — $39" &&
  I.translate("$39") === "$39", I.translate("Motion BG'yi aç — 749 TL"));
ok("USD varyantı: schema.org Offer USD", P.schemaOffer("en").priceCurrency === "USD" && P.schemaOffer("en").price === "39");
P.PRICING.en.url = "javascript:alert(1)";
ok("geçersiz varyant adresi yok sayılır (TRY'ye düşer)", !P.usdReady() && P.label("en") === "749 TRY (≈ $19)" && P.checkoutUrl("en", "x", "1").indexOf(TRY) === 0);
P.PRICING.en.url = "";
I.setDictionary(EN);
ok("idempotent: EN fiyat metni tekrar çevrilmez", I.translate("749 TRY (≈ $19)") === "749 TRY (≈ $19)" && I.translate("Unlock Auto Cut — 749 TRY (≈ $19)") === "Unlock Auto Cut — 749 TRY (≈ $19)");

/* ---------------- tek kaynak: koddaki fiyatlar tabloyla aynı ---------------- */
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
var kaynaklar = [["index.html", html]];
fs.readdirSync(path.join(KOK, "js")).forEach(function (f) {
  if (/\.js$/.test(f) && f !== "pricing.js") kaynaklar.push(["js/" + f, fs.readFileSync(path.join(KOK, "js", f), "utf8")]);
});
var yabanci = [];
kaynaklar.forEach(function (k) {
  var re = /(\d[\d.]*) TL\b/g, m;
  // yorumlar düşer, metin sabitleri kalır (fiyatlar metin sabitlerinde)
  var metin = k[1].replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  while ((m = re.exec(metin))) {
    if (m[0] === P.PRICING.tr.now || m[0] === P.PRICING.tr.was) continue;
    yabanci.push(k[0] + ": " + m[0]);
  }
});
ok("panelde PRICING.tr dışında TL fiyatı yok", yabanci.length === 0, yabanci.slice(0, 4).join(" | "));
ok("pro.js fiyat kutusunu SufloPricing'ten alır", /SufloPricing/.test(fs.readFileSync(path.join(KOK, "js", "pro.js"), "utf8")) &&
  /fiyatKutusu\(\)/.test(fs.readFileSync(path.join(KOK, "js", "pro.js"), "utf8")));
var app = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
ok("app.js ödeme bağlantısını SufloPricing.checkoutUrl ile kurar, gömülü adres yok",
  /SufloPricing\.checkoutUrl\(/.test(app) && app.indexOf("checkout/buy/") === -1);
var src = ayikla(fs.readFileSync(path.join(KOK, "js", "pricing.js"), "utf8"));
var YASAK = [/\?\.[A-Za-z_$(\[]/, /\?\?/, /\.replaceAll\s*\(/, /=>/, /\bconst\b|\blet\b|`/];
ok("pricing.js: ES5 / Chromium 74 uyumlu", !src.split("\n").some(function (s) { return YASAK.some(function (r) { return r.test(s); }); }));
var sira = ["js/CSInterface.js", "js/pricing.js", "i18n/en.js", "js/i18n.js", "js/bridge.js"].map(function (f) { return html.indexOf('<script src="' + f + '"></script>'); });
ok("index.html: pricing.js CSInterface'ten sonra, en.js'ten önce", sira.every(function (x, i) { return x !== -1 && (i === 0 || x > sira[i - 1]); }), sira.join(","));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
