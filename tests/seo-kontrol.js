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

console.log(s.join("\n"));
var f = s.filter(function (x) { return x.indexOf("FAIL") === 0; }).length;
console.log("\n" + (s.length - f) + "/" + s.length + " gecti");
