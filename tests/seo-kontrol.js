var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
var fs = require("fs");
var D = KOKYOL + "docs/";
var h = fs.readFileSync(D + "index.html", "utf8");
var s = [];
function chk(a, k, e) { s.push((k ? "PASS " : "FAIL ") + a + (e !== undefined ? "   [" + e + "]" : "")); }

function meta(re) { var m = h.match(re); return m ? m[1] : null; }

var baslik = (h.match(/<title>([^<]*)<\/title>/) || [])[1];
chk("title aranan ifadeyle basliyor", /^Premiere Türkçe Altyazı/.test(baslik), baslik);
chk("title 60 karakteri asmiyor", baslik.length <= 60, baslik.length + " karakter");

var acik = meta(/<meta name="description" content="([^"]*)"/);
chk("description 120-160 arasi", acik.length >= 120 && acik.length <= 160, acik.length + " karakter");
chk("description 'Türkçe altyazı' iceriyor", /Türkçe altyazı/.test(acik));
chk("description 'ücretsiz' iceriyor", /ücretsiz/i.test(acik));

chk("canonical var", /rel="canonical" href="https:\/\/suflo\.app\/"/.test(h));
chk("robots meta var", /name="robots"/.test(h));
chk("og:image mutlak URL", meta(/property="og:image" content="([^"]*)"/) === "https://suflo.app/og.png",
  meta(/property="og:image" content="([^"]*)"/));
chk("og:image boyutlari bildirildi", /og:image:width" content="1200"/.test(h) && /og:image:height" content="630"/.test(h));
chk("og:url var", /property="og:url"/.test(h));
chk("og:locale tr_TR", /og:locale" content="tr_TR"/.test(h));
chk("twitter:card large image", /twitter:card" content="summary_large_image"/.test(h));

// Yapisal veri gecerli JSON mu
var ld = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
chk("ld+json blogu var", !!ld);
if (ld) {
  var ok = true, obj = null;
  try { obj = JSON.parse(ld[1]); } catch (e) { ok = false; chk("ld+json GECERLI JSON", false, e.message); }
  if (ok) {
    chk("ld+json gecerli JSON", true);
    var g = obj["@graph"] || [];
    var app = g.filter(function (x) { return x["@type"] === "SoftwareApplication"; })[0];
    var faq = g.filter(function (x) { return x["@type"] === "FAQPage"; })[0];
    chk("SoftwareApplication var", !!app);
    chk("fiyat 0 olarak bildirildi", app && app.offers && app.offers.price === "0", app && app.offers && app.offers.price);
    chk("isletim sistemi Windows+macOS", app && /Windows/.test(app.operatingSystem) && /macOS/.test(app.operatingSystem));
    chk("indirme baglantisi var", app && /github\.com/.test(app.downloadUrl || ""));
    chk("FAQPage var", !!faq);
    chk("FAQ en az 4 soru", faq && faq.mainEntity.length >= 4, faq && faq.mainEntity.length);
    var hepsiCevapli = faq && faq.mainEntity.every(function (q) {
      return q.acceptedAnswer && q.acceptedAnswer.text && q.acceptedAnswer.text.length > 30;
    });
    chk("her sorunun dolu cevabi var", hepsiCevapli);
  }
}

// Dosyalar
chk("robots.txt var", fs.existsSync(D + "robots.txt"));
chk("sitemap.xml var", fs.existsSync(D + "sitemap.xml"));
chk("og.png var", fs.existsSync(D + "og.png"));
if (fs.existsSync(D + "og.png")) {
  var kb = fs.statSync(D + "og.png").size / 1024;
  chk("og.png makul boyutta (<600 KB)", kb < 600, Math.round(kb) + " KB");
}
var rb = fs.readFileSync(D + "robots.txt", "utf8");
chk("robots sitemap'i gosteriyor", /Sitemap: https:\/\/suflo\.app\/sitemap\.xml/.test(rb));

// Sayfada aranan ifadeler geciyor mu (icerik SEO'su)
["Türkçe altyazı", "Premiere", "ücretsiz", "eklenti"].forEach(function (k) {
  var n = (h.match(new RegExp(k, "gi")) || []).length;
  chk("sayfada '" + k + "' geciyor", n >= 2, n + " kez");
});

/* ---------------- İngilizce site (docs/en): hreflang, canonical, og:locale, fiyat = canlı ödeme ---------------- */
var Fiyat = require(KOKYOL + "js/pricing.js");
function dosyaYolu(url) {
  var p = url.replace(/^https:\/\/suflo\.app\//, "");
  if (p === "" || /\/$/.test(p)) return D + p + "index.html";
  return fs.existsSync(D + p + ".html") ? D + p + ".html" : D + p;
}
function alternatif(src) {
  var o = {}, re = /<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)">/g, m;
  while ((m = re.exec(src))) o[m[1]] = m[2];
  return o;
}
var sitemapSrc = fs.readFileSync(D + "sitemap.xml", "utf8");
var trDavet = (h.match(/<script id="davet-site">[\s\S]*?<\/script>/) || [""])[0];
var TR_KARSILIGI_YOK = ["en/pro.html"];
// noindex yönlendirme sayfaları hreflang taşımaz (Google noindex alternatifleri yok sayar)
var proYonlendirme = fs.readFileSync(D + "pro.html", "utf8");
chk("pro.html (noindex yönlendirme) hreflang taşımaz", !/hreflang=/.test(proYonlendirme) && /noindex/.test(proYonlendirme));
var enSayfalar = ["en/index.html", "en/pro.html", "en/blog/index.html", "en/blog/free-local-auto-captions-premiere-whisper.html",
  "en/blog/opusclip-alternative-premiere.html", "en/blog/autocut-firecut-alternative.html"];
enSayfalar.forEach(function (f) {
  var yol = D + f;
  chk("EN sayfa var: " + f, fs.existsSync(yol));
  if (!fs.existsSync(yol)) return;
  var e = fs.readFileSync(yol, "utf8");
  var can = (e.match(/<link rel="canonical" href="([^"]+)">/) || [])[1] || "";
  var alt = alternatif(e);
  chk(f + ": lang=en, canonical, og:locale en_US", /<html lang="en">/.test(e) && /^https:\/\/suflo\.app\/en\//.test(can) && /og:locale" content="en_US"/.test(e), can);
  // Türkçe karşılığı olmayan sayfa (/en/pro: Türkçe Pro içeriği ana sayfada, /pro noindex
  // yönlendirme) yalnız en + x-default taşır; tr gösterilirse karşılık dizinlenebilir olmalı
  var yalnizEN = TR_KARSILIGI_YOK.indexOf(f) !== -1;
  chk(f + ": hreflang " + (yalnizEN ? "en/x-default (tr yok)" : "tr/en/x-default"), alt.en === can && alt["x-default"] === can &&
    (yalnizEN ? !alt.tr : /^https:\/\/suflo\.app\//.test(alt.tr || "")), JSON.stringify(alt));
  if (!yalnizEN) {
    var trYol = alt.tr ? dosyaYolu(alt.tr) : "";
    var trSrc = trYol && fs.existsSync(trYol) ? fs.readFileSync(trYol, "utf8") : "";
    var trAlt = alternatif(trSrc);
    chk(f + ": karşılıklı hreflang (TR sayfası geri gösterir)", trAlt.en === can && trAlt.tr === alt.tr && trAlt["x-default"] === can, trYol + " " + JSON.stringify(trAlt));
    var trCan = (trSrc.match(/<link rel="canonical" href="([^"]+)">/) || [])[1] || "";
    chk(f + ": TR karşılığı dizinlenebilir ve kendi canonical'ı", trCan === alt.tr && !/name="robots" content="[^"]*noindex/.test(trSrc), trCan);
  }
  var t = (e.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  var dsc = (e.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  chk(f + ": başlık <= 60, açıklama 100-160", t.length <= 60 && dsc.length >= 100 && dsc.length <= 160, t.length + " / " + dsc.length);
  var ldler = e.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  var gecerli = ldler.length > 0 && ldler.every(function (b) { try { JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/g, "")); return true; } catch (x) { return false; } });
  chk(f + ": ld+json geçerli", gecerli);
  var ldMetin = ldler.join("");
  var paralar = (ldMetin.match(/"priceCurrency":"([A-Z]{3})"/g) || []).map(function (x) { return x.slice(-4, -1); });
  chk(f + ": JSON-LD Offer para birimi canlı ödemeyle aynı (" + Fiyat.currency("en") + ")", paralar.every(function (c) { return c === Fiyat.currency("en"); }), paralar.join(","));
  var gosterilen = (e.match(/data-price="([^"]+)"/g) || []).map(function (x) { return x.slice(12, -1).replace(/&amp;/g, "&"); });
  chk(f + ": gösterilen fiyat = SufloPricing.label('en')", gosterilen.every(function (x) { return x === Fiyat.label("en"); }), gosterilen.join(","));
  var odeme = (e.match(/href="(https:\/\/[a-z0-9.-]+\.lemonsqueezy\.com\/checkout\/buy\/[^"?]+)/g) || []).map(function (x) { return x.slice(6); });
  chk(f + ": ödeme bağlantısı SufloPricing.offer('en').url", odeme.every(function (u) { return u === Fiyat.offer("en").url; }), odeme.join(","));
  if (odeme.length) chk(f + ": davet betiği TR ile aynı ve lemon.js'ten önce", e.indexOf(trDavet) !== -1 && trDavet.length > 100 &&
    e.indexOf('<script id="davet-site">') < e.indexOf("app.lemonsqueezy.com/js/lemon.js") && /id="davet-bilgi" hidden/.test(e));
  var yol2 = can.replace(/\/$/, "/");
  chk(f + ": site haritasında", sitemapSrc.indexOf("<loc>" + yol2 + "</loc>") !== -1, yol2);
  chk(f + ": marka güvenli stil adları", !/CapCut|Hormozi|MrBeast/i.test(e));
  var sss = e.match(/<details><summary>([\s\S]*?)<\/summary>/g) || [];
  if (sss.length) {
    var faq = null;
    ldler.forEach(function (b) { var o = JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/g, "")); (o["@graph"] || [o]).forEach(function (x) { if (x["@type"] === "FAQPage") faq = x; }); });
    var cozul = function (x) { return x.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); };
    chk(f + ": SSS yapısal verisi sayfadakiyle aynı", !!faq && faq.mainEntity.length === sss.length &&
      faq.mainEntity.every(function (q, i) { return cozul(sss[i].replace(/<\/?(details|summary)>/g, "")) === q.name; }));
  }
});
/* ---------------- suflo.app/stil: paylaşılan stil kodu sayfası ---------------- */
var stilYol = D + "stil.html";
chk("stil.html var", fs.existsSync(stilYol));
if (fs.existsSync(stilYol)) {
  var st = fs.readFileSync(stilYol, "utf8");
  var stBaslik = (st.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  var stAcik = (st.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
  chk("stil.html: title ≤ 60 ve Suflo Stili geçiyor", stBaslik.length > 10 && stBaslik.length <= 60 && /Suflo Stili/.test(stBaslik), stBaslik);
  chk("stil.html: description 120-160", stAcik.length >= 120 && stAcik.length <= 160, stAcik.length + " karakter");
  chk("stil.html: canonical, og:title/description/url/image, twitter:card, og:locale",
    /rel="canonical" href="https:\/\/suflo\.app\/stil"/.test(st) && /property="og:title"/.test(st) && /property="og:description"/.test(st) &&
    /property="og:url" content="https:\/\/suflo\.app\/stil"/.test(st) && /property="og:image" content="https:\/\/suflo\.app\/og\.png"/.test(st) &&
    /twitter:card/.test(st) && /og:locale" content="tr_TR"/.test(st));
  chk("stil.html: site haritasında", sitemapSrc.indexOf("<loc>https://suflo.app/stil</loc>") !== -1);
  var csp = (st.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || "";
  chk("stil.html: CSP script-src 'self' (satır içi betik yok)", /script-src 'self'(;|$)/.test(csp) && !/unsafe-inline[^;]*;?\s*$/.test(csp.split("script-src")[1].split(";")[0]) &&
    !/<script(?![^>]*\ssrc=)[^>]*>/.test(st), csp);
  chk("stil.html: yalnız yerel betikler (style-share + stil-sayfa)", (st.match(/<script src="([^"]+)"/g) || []).join(" ") === '<script src="js/style-share.js" <script src="js/stil-sayfa.js"');
  chk("stil.html: indirme bağlantısı releases/latest", /href="https:\/\/github\.com\/sametcreates\/suflo\/releases\/latest">Suflo'yu indir</.test(st));
  chk("stil.html: Kodu kopyala düğmesi", /id="kodu-kopyala"[^>]*>Kodu kopyala</.test(st));
  var sayfaJs = fs.readFileSync(D + "js/stil-sayfa.js", "utf8");
  chk("stil-sayfa.js: innerHTML / document.write yok, metin textContent ile", !/innerHTML|outerHTML|document\.write|insertAdjacentHTML/.test(sayfaJs) && /textContent/.test(sayfaJs));
  chk("stil-sayfa.js: renk yalnız doğrulanmış hex ile", /SS\.isColor\(deger\)/.test(sayfaJs));
}

chk("TR ana sayfa altbilgisinde English bağlantısı", /<a href="\/en\/" hreflang="en" lang="en">English<\/a>/.test(h));

console.log(s.join("\n"));
var f = s.filter(function (x) { return x.indexOf("FAIL") === 0; }).length;
console.log("\n" + (s.length - f) + "/" + s.length + " gecti");
process.exit(f ? 1 : 0);
