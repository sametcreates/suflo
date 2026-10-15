/* Suflo 3.2 site: bilingual claims, illustration behavior and protected checkout data. */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
var root = path.join(__dirname, ".."), docs = path.join(root, "docs");
var passed = 0, failed = 0;
function ok(name, condition) { if (condition) passed++; else failed++; console.log((condition ? "PASS " : "FAIL ") + name); }
function read(p) { return fs.readFileSync(path.join(docs, p), "utf8").replace(/\r\n/g, "\n"); }
function decode(s) { return s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); }
function nodes(html) { var out = []; for (var m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { var j = JSON.parse(m[1]); out = out.concat(j["@graph"] || [j]); } return out; }
var names = {"tr":["Ağır Çekim Dalışı","Darbe","Hızlı Giriş","Hızlı Çıkış","Doruk Anı","Atılım","Zaman Bükümü","Nabız","Vites","Süzülme","Ritme Rampa"],"en":["Slow-Mo Dip","Impact","Rush In","Rush Out","Peak Moment","Burst","Time Bend","Pulse","Gear Shift","Drift","Beat Ramp"]};
["index.html", "pro.html", "en/index.html", "en/pro.html"].forEach(function (p) {
  var h = read(p), lang = p.startsWith("en/") ? "en" : "tr";
  var block = (h.match(/<div class="sr-feature"[\s\S]*?Temsilî eğriler[\s\S]*?<\/div>\s*<\/div>|<div class="sr-feature"[\s\S]*?Illustrative curves[\s\S]*?<\/div>\s*<\/div>/) || [h])[0];
  var buttons = Array.from(block.matchAll(/data-curve="\d+" aria-pressed="(?:true|false)" disabled>([^<]+)<\/button>/g)).map(function (m) { return m[1]; });
  ok(p + ": all 11 curves in source order", JSON.stringify(buttons) === JSON.stringify(names[lang]));
  ok(p + ": accessible inline SVG", /<svg class="sr-graph"[^>]+role="img"[^>]+aria-labelledby=/.test(block) && /<title id=/.test(block) && /<desc id=/.test(block));
  ok(p + ": Pro trial label", block.includes(lang === "tr" ? "Pro · 3 ücretsiz deneme" : "Pro · 3 free tries"));
  ok(p + ": non-native editable speed pieces disclosed", block.includes(lang === "tr" ? "sabit hızlı parçalar" : "constant-speed pieces") && block.includes(lang === "tr" ? "eklentilere" : "extensions"));
  ok(p + ": no external media inside ramp", !/<(?:img|video|iframe)\b/.test(block));
  ok(p + ": local demo assets", h.includes("/css/speedramp.css?v=3.2.0") && h.includes("/js/speedramp-demo.js?v=3.2.0"));
});
["index.html", "en/index.html", "en/pro.html"].forEach(function (p) {
  var h = read(p), tr = !p.startsWith("en/");
  var b = (h.match(/<div class="caption32"[\s\S]*?<\/div>/) || [""])[0];
  var terms = tr ? ["Canlı transkripsiyon", "Kalan süre", "İptal", "Ölçülmüş kelime zamanları", "2 satır × 42", "Hızlı / En doğru", "Ses etiketi filtresi", "Sessiz ses uyarısı", "Pro özelliğidir"] : ["Live transcription", "time left", "Cancel", "Measured word timings", "2 lines × 42", "Fast / Most accurate", "Sound-tag filter", "Silent-audio warning", "Pro feature"];
  ok(p + ": free 3.2 features and Pro-only translation", terms.every(function (t) { return b.includes(t); }));
});
var css = read("css/speedramp.css"), js = read("js/speedramp-demo.js");
ok("reduced motion disables animation in CSS", /@media\(prefers-reduced-motion:reduce\)\{\.sr-cursor\{animation:none\}\}/.test(css));
ok("responsive cards use shrinkable columns", css.includes("minmax(0,1fr)") && css.includes("@media(max-width:760px)"));
ok("demo has no network, timer or dynamic code", !/fetch\(|XMLHttpRequest|setInterval|setTimeout|eval\(/.test(js));
function demo(reduced) {
  var curve = { attrs: {}, setAttribute: function (a, v) { this.attrs[a] = v; } }, label = { textContent: "" }, classes = {};
  var buttons = names.en.map(function (name, i) { return { dataset: { curve: String(i) }, textContent: name, attrs: {}, disabled: true, setAttribute: function (a, v) { this.attrs[a] = v; }, addEventListener: function (a, f) { this[a] = f; } }; });
  var pause = { dataset: { play: "Play", pause: "Pause" }, attrs: {}, disabled: true, setAttribute: function (a, v) { this.attrs[a] = v; }, getAttribute: function (a) { return this.attrs[a]; }, addEventListener: function (a, f) { this[a] = f; } };
  var media = { matches: reduced, addEventListener: function (name, callback) { this.changed = callback; } };
  var element = { classList: { toggle: function (name, v) { classes[name] = v; } }, querySelector: function (s) { return s === ".sr-curve" ? curve : s === ".sr-pause" ? pause : label; }, querySelectorAll: function () { return buttons; } };
  vm.runInNewContext(js, { document: { querySelectorAll: function () { return [element]; } }, window: { matchMedia: function () { return media; } } });
  return { curve: curve, label: label, buttons: buttons, pause: pause, classes: classes, media: media };
}
var d = demo(false), paths = [];
d.buttons.forEach(function (button, i) {
  button.click(); paths.push(d.curve.attrs.d);
  ok("curve " + i + ": updates label, path and one pressed button", !button.disabled && d.label.textContent === names.en[i] && d.curve.attrs.d.startsWith("M ") && d.buttons.filter(function (b) { return b.attrs["aria-pressed"] === "true"; }).length === 1 && button.attrs["aria-pressed"] === "true");
});
ok("11 distinct illustrative paths", new Set(paths).size === 11);
d.pause.click(); ok("pause button stops cursor", d.classes["sr-paused"] === true && d.pause.textContent === "Play");
d.pause.click(); ok("play button resumes cursor", d.classes["sr-paused"] === false && d.pause.textContent === "Pause");
var r = demo(true); ok("reduced-motion preference starts paused", r.classes["sr-paused"] && r.pause.attrs["aria-pressed"] === "true");
r.media.changed({ matches: false }); ok("preference changes are respected", r.classes["sr-paused"] === false);
var trI18n = fs.readFileSync(path.join(root, "i18n/en.js"), "utf8");
names.tr.forEach(function (name, i) { ok("English name matches i18n: " + name, trI18n.includes('"' + name + '": "' + names.en[i] + '"')); });
var articles = ["blog/premiere-hiz-rampasi-speed-ramp.html", "en/blog/premiere-speed-ramp.html"];
var compares = ["blog/autocut-firecut-alternatifi.html", "blog/opusclip-alternatifi-premiere.html", "en/blog/autocut-firecut-alternative.html", "en/blog/opusclip-alternative-premiere.html"];
var sitemap = read("sitemap.xml");
articles.concat(compares).forEach(function (p) {
  var h = read(p), n = nodes(h), faq = n.find(function (o) { return o["@type"] === "FAQPage"; });
  var visible = Array.from(h.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)).map(function (m) { return [decode(m[1]), decode(m[2])]; });
  var data = faq.mainEntity.map(function (q) { return [q.name, q.acceptedAnswer.text]; });
  ok(p + ": FAQ questions AND answers exactly match", JSON.stringify(visible) === JSON.stringify(data));
  ok(p + ": dateModified is 2026-10-12", n.find(function (o) { return o["@type"] === "Article"; }).dateModified === "2026-10-12");
  var url = "https://suflo.app/" + p.replace(/\.html$/, "");
  var entry = Array.from(sitemap.matchAll(/<url>[\s\S]*?<\/url>/g)).find(function (m) { return m[0].includes("<loc>" + url + "</loc>"); });
  ok(p + ": sitemap lastmod matches modification date", !!entry && entry[0].includes("<lastmod>2026-10-12</lastmod>"));
});
articles.forEach(function (p) {
  var h = read(p), tr = !p.startsWith("en/");
  ["tr", "en", "x-default"].forEach(function (lang) {
    var target = lang === "tr" ? "https://suflo.app/blog/premiere-hiz-rampasi-speed-ramp" : "https://suflo.app/en/blog/premiere-speed-ramp";
    ok(p + ": reciprocal " + lang + " hreflang", h.includes('hreflang="' + lang + '" href="' + target + '"'));
  });
  var breadcrumb = nodes(h).find(function (o) { return o["@type"] === "BreadcrumbList"; });
  ok(p + ": breadcrumb URL equals canonical", breadcrumb.itemListElement.at(-1).item === h.match(/rel="canonical" href="([^"]+)"/)[1]);
  ok(p + ": indexed in correct language", read(tr ? "blog/index.html" : "en/blog/index.html").includes('href="/' + p.replace(/\.html$/, "") + '"'));
  ok(p + ": official Adobe and product sources", h.includes("helpx.adobe.com/premiere/desktop/edit-projects/change-clip-speed/") && h.includes("marketing/release-notes.md"));
});
var checkoutBaseline = {
  "index.html": [
    "https://suflo.lemonsqueezy.com/checkout/buy/e33dda31-8e47-46c3-be1d-e047ab1b2dd1?checkout%5Bcustom%5D%5Bsource%5D=suflo_website&amp;checkout%5Bcustom%5D%5Bfeature%5D=pricing&amp;checkout%5Bcustom%5D%5Bapp_version%5D=3.4.2",
    "https://suflo.lemonsqueezy.com/checkout/buy/e33dda31-8e47-46c3-be1d-e047ab1b2dd1?checkout%5Bcustom%5D%5Bsource%5D=suflo_website&amp;checkout%5Bcustom%5D%5Bfeature%5D=footer&amp;checkout%5Bcustom%5D%5Bapp_version%5D=3.4.2"
  ],
  "en/index.html": [
    "https://suflo.lemonsqueezy.com/checkout/buy/e33dda31-8e47-46c3-be1d-e047ab1b2dd1?checkout%5Bcustom%5D%5Bsource%5D=suflo_website_en&amp;checkout%5Bcustom%5D%5Bfeature%5D=pricing_en"
  ],
  "en/pro.html": [
    "https://suflo.lemonsqueezy.com/checkout/buy/e33dda31-8e47-46c3-be1d-e047ab1b2dd1?checkout%5Bcustom%5D%5Bsource%5D=suflo_website_en&amp;checkout%5Bcustom%5D%5Bfeature%5D=pro_page_en"
  ]
};
Object.keys(checkoutBaseline).forEach(function (p) {
  var links = Array.from(read(p).matchAll(/href="(https:\/\/suflo\.lemonsqueezy\.com\/checkout\/[^"]+)"/g)).map(function (m) { return m[1]; });
  ok(p + ": checkout URLs and existing app_version unchanged", JSON.stringify(links) === JSON.stringify(checkoutBaseline[p]));
});
var pricing = read("index.html").match(/<section id="fiyat"[\s\S]*?<\/section>/)[0];
// 3.3.0: only app_version and two Pro list rows changed from main 43a6815 (Altyazı Efektleri row, YouTube indirici row)
// 3.4.0: only app_version and one Pro list row (Eğri) changed from 3.3.0
// 3.4.1, 3.4.2: only app_version changed from 3.4.0
ok("TR pricing, VAT, no-refund text and social proof pinned (3.4.2)", crypto.createHash("sha256").update(pricing).digest("hex") === "a36c373806d8cecdd4c07975d2006dd03cafada6c5c2d6afde2d002319572ed9");
ok("TR pricing keeps 749 ₺ / 1.249 ₺, + KDV, no-refund, countdown and social proof",
  pricing.includes('<s>1.249 ₺</s><span class="b">749 ₺</span>') && pricing.includes('<span class="kdv">+ KDV</span>') &&
  pricing.includes("Dijital ürün olduğu için iade yapılmaz") && pricing.includes('id="erken-bitis"') && pricing.includes("<b>75+ içerik üreticisi</b>"));
var manifestVersion = fs.readFileSync(path.join(root, "CSXS", "manifest.xml"), "utf8").match(/ExtensionBundleVersion="([^"]+)"/)[1];
["index.html", "en/index.html"].forEach(function (p) {
  var app = nodes(read(p)).find(function (o) { return o["@type"] === "SoftwareApplication" && o.name === "Suflo"; });
  ok(p + ": JSON-LD softwareVersion equals manifest " + manifestVersion, !!app && app.softwareVersion === manifestVersion);
});
ok("TR checkout app_version equals manifest", checkoutBaseline["index.html"].every(function (u) { return u.endsWith("app_version%5D=" + manifestVersion); }) &&
  read("index.html").includes('<b id="surum">v' + manifestVersion + "</b>"));
var referralTR = read("index.html").match(/<script id="davet-site">([\s\S]*?)<\/script>/)[1];
["en/index.html", "en/pro.html"].forEach(function (p) { ok(p + ": same unchanged referral behavior as TR", read(p).match(/<script id="davet-site">([\s\S]*?)<\/script>/)[1] === referralTR); });
console.log("\n" + passed + "/" + (passed + failed) + " passed");
process.exit(failed ? 1 : 0);
