var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * suflo.app/blog rehberleri: yapisal veri, canonical, site haritasi ve dizin tutarliligi.
 *  - Her rehberin ld+json blogu gecerli JSON; SSS yapisal verisi sayfadaki SSS ile birebir ayni.
 *  - canonical = og:url = https://suflo.app/blog/<dosya-adi>; site haritasinda ve blog dizininde var.
 *  - Blog ici /blog/... baglantilari var olan sayfalara gider.
 *  - Sorun giderme rehberi kurucularla ayni CSXS anahtarlarini ve manifest'teki alt surumu soyler.
 *  - Karsilastirma rehberleri tarihli ("<Ay> <Yil> itibarıyla"), kaynakli ve marka notlu; marka
 *    adlarini yalniz tanimlayici olarak kullanir (CapCut/Hormozi/MrBeast gecmez).
 */
var fs = require("fs");

var D = KOKYOL + "docs/";
var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit !== undefined ? "   [" + String(kanit).slice(0, 80) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}
function oku(p) { return fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"); }
function coz(s) {
  return String(s).replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function ilk(re, s) { var m = re.exec(s); return m ? m[1] : null; }

var sitemap = oku(D + "sitemap.xml");
var dizin = oku(D + "blog/index.html");
var sayfalar = fs.readdirSync(D + "blog").filter(function (f) { return /\.html$/.test(f) && f !== "index.html"; }).sort();
var varOlan = {};
sayfalar.forEach(function (f) { varOlan[f.replace(/\.html$/, "")] = true; });

ok("blogda rehber var", sayfalar.length >= 4, sayfalar.length + " sayfa");

sayfalar.forEach(function (f) {
  var slug = f.replace(/\.html$/, "");
  var h = oku(D + "blog/" + f);
  var url = "https://suflo.app/blog/" + slug;

  var baslik = coz(ilk(/<title>([^<]*)<\/title>/, h) || "");
  ok(slug + ": title 30-70 karakter", baslik.length >= 30 && baslik.length <= 70, baslik.length + " · " + baslik);
  var acik = coz(ilk(/<meta name="description" content="([^"]*)"/, h) || "");
  ok(slug + ": description 110-165 karakter", acik.length >= 110 && acik.length <= 165, acik.length);
  ok(slug + ": canonical dosya adiyla ayni", ilk(/<link rel="canonical" href="([^"]*)"/, h) === url,
    ilk(/<link rel="canonical" href="([^"]*)"/, h));
  ok(slug + ": og:url canonical ile ayni", ilk(/property="og:url" content="([^"]*)"/, h) === url);
  ok(slug + ": og:locale tr_TR ve og:image mutlak",
    /og:locale" content="tr_TR"/.test(h) && /og:image" content="https:\/\/suflo\.app\//.test(h));

  var ldler = [], re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, m;
  while ((m = re.exec(h))) ldler.push(m[1]);
  ok(slug + ": ld+json blogu var", ldler.length >= 1, ldler.length);
  var graf = [];
  ldler.forEach(function (b, i) {
    try { var o = JSON.parse(b); graf = graf.concat(o["@graph"] || [o]); ok(slug + ": ld+json #" + (i + 1) + " gecerli JSON", true); }
    catch (e) { ok(slug + ": ld+json #" + (i + 1) + " gecerli JSON", false, e.message); }
  });
  var faq = graf.filter(function (x) { return x["@type"] === "FAQPage"; })[0];
  var iz = graf.filter(function (x) { return x["@type"] === "BreadcrumbList"; })[0];
  ok(slug + ": BreadcrumbList son oge bu sayfa",
    !!iz && iz.itemListElement[iz.itemListElement.length - 1].item === url);
  if (faq) {
    var gorunen = [], rd = /<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g, d;
    while ((d = rd.exec(h))) gorunen.push([coz(d[1]), coz(d[2])]);
    var yapisal = faq.mainEntity.map(function (q) { return [q.name, q.acceptedAnswer.text]; });
    ok(slug + ": SSS yapisal veri sayfadakiyle ayni", JSON.stringify(gorunen) === JSON.stringify(yapisal),
      gorunen.length + " gorunen / " + yapisal.length + " yapisal");
  }

  ok(slug + ": site haritasinda", sitemap.indexOf("<loc>" + url + "</loc>") !== -1);
  ok(slug + ": blog dizininde kart var", dizin.indexOf('href="/blog/' + slug + '"') !== -1);

  var kirik = [], rl = /href="\/blog\/([a-z0-9-]+)"/g, l;
  while ((l = rl.exec(h))) if (!varOlan[l[1]]) kirik.push(l[1]);
  ok(slug + ": blog ici baglantilar var olan sayfalara gidiyor", kirik.length === 0, kirik.join(", ") || "hepsi var");
});

/* ---------- Sorun giderme rehberi kurucularla tutarli mi ---------- */
var YARDIM = "premiere-suflo-paneli-gorunmuyor";
if (varOlan[YARDIM]) {
  var y = coz(oku(D + "blog/" + YARDIM + ".html"));
  var bat = oku(KOKYOL + "tools/kurucu/Suflo-Kur.bat");
  var cmd = oku(KOKYOL + "tools/kurucu/Suflo-Kur.command");
  var manifest = oku(KOKYOL + "CSXS/manifest.xml");
  var batSurum = ilk(/for %%V in \(([\d ]+)\) do/, bat);
  var cmdSurum = ilk(/for V in ([\d ]+); do/, cmd);
  var winSurum = ilk(/for %V in \(([\d ]+)\) do reg add/, y);
  var macSurum = ilk(/for v in ([\d ]+); do defaults write/, y);
  ok("rehberdeki Windows komutu kurucuyla ayni CSXS anahtarlarini yaziyor", !!batSurum && winSurum === batSurum,
    winSurum + " / kurucu " + batSurum);
  ok("rehberdeki Mac komutu kurucuyla ayni CSXS anahtarlarini yaziyor", !!cmdSurum && macSurum === cmdSurum,
    macSurum + " / kurucu " + cmdSurum);
  var altSurum = ilk(/<Host Name="PPRO" Version="\[([\d.]+),/, manifest);
  ok("rehber manifest'teki en dusuk Premiere surumunu soyluyor", !!altSurum && y.indexOf("(" + altSurum + ")") !== -1, altSurum);
  var kimlik = ilk(/ExtensionBundleId="([^"]+)"/, manifest);
  ok("rehberdeki klasor adi eklenti kimligiyle ayni", y.indexOf(kimlik) !== -1, kimlik);
  ok("rehber yeni ve eski menu yolunu veriyor",
    y.indexOf("Window > Extensions (Legacy) > Suflo") !== -1 && y.indexOf("Window > Extensions > Suflo") !== -1);
  ok("rehber Suflo Doctor'u anlatiyor", /Suflo Doctor/.test(y) && /Taramayı başlat/.test(y));
}

/* ---------- Karsilastirma rehberleri: tarihli, kaynakli, marka notlu ---------- */
["autocut-firecut-alternatifi", "opusclip-alternatifi-premiere"].forEach(function (slug) {
  if (!varOlan[slug]) { ok(slug + " var", false, "dosya yok"); return; }
  var k = oku(D + "blog/" + slug + ".html");
  // Fiyatlar her guncellemede yeni ay/yil ile yazilir: "Ekim 2026 itibarıyla", "Ocak 2027 itibarıyla"...
  ok(slug + ": fiyatlar tarihli (<Ay> <Yil> itibarıyla)",
    /(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık) 20\d\d itibarıyla/.test(k));
  ok(slug + ": kaynaklar bolumu var", /<h2>Kaynaklar<\/h2>/.test(k) && /class="kaynaklar"/.test(k));
  ok(slug + ": marka notu var", /ticari markalarıdır/.test(k) && /bağlantılı değildir/.test(k));
  ok(slug + ": Suflo'nun eksikleri de yaziyor", /olmayanlar<\/h2>/.test(k));
  ok(slug + ": rakip baglantilari nofollow", !/<a href="https:\/\/(?:www\.)?(?:autocut\.com|firecut\.ai|opus\.pro|help\.opus\.pro)[^"]*">/.test(k));
});
["premiere-suflo-paneli-gorunmuyor", "premiere-turkce-altyazi-otomatik", "autocut-firecut-alternatifi",
  "opusclip-alternatifi-premiere"].forEach(function (slug) {
  if (!varOlan[slug]) return;
  var k = oku(D + "blog/" + slug + ".html");
  ok(slug + ": ucuncu taraf yaratici/uygulama adi yok", !/capcut|hormozi|mrbeast/i.test(k));
});

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
process.exit(kaldi ? 1 : 0);
