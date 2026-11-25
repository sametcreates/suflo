/*
 * Suflo testi (3.6): yeni efektlerin Pro penceresi ve ödeme sayfasının açılışı.
 *  - Pro.gate("yeniEfekt") (Altyazı Efektleri › Yeni, denemesiz): kendi başlığı, yeni efekt görselleri, sayılar, düğmesi;
 *    deneme düğmesi yok; fiyat kutusu aynı (749 TL, + KDV) — gerçek panel, gerçek tarayıcı (Playwright)
 *  - Pro.gate("overlay"): Premiere şablonu görseli göstermez (Altyazı Efektleri libass ile çizilir: gördüğün = eklenen)
 *  - app.js odemeSayfasiniAc: tarayıcı açılınca yol bildirimi; openURL hata atarsa adres panoya, bildirim uyarır;
 *    pano da yoksa suflo.app/pro söylenir. Satın al düğmeleri bu yoldan açar
 *  - yeniEfekt deneme listesinde değil (ücretsiz / Pro sınırı değişmedi), FEATURE_LABELS'ta var
 * Playwright / Chromium yoksa tarayıcı bölümü atlanır.
 */
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecti = 0, kaldi = 0;
function ok(ad, k, ek) { if (k) gecti++; else kaldi++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function oku(p) { return fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n/g, "\n"); }

/* ---- 1) saf kontroller ---- */
var D = require(path.join(KOK, "js", "deneme.js"));
var pro = oku("js/pro.js"), app = oku("js/app.js");
ok("yeniEfekt deneme listesinde değil, overlay hâlâ listede (sınır değişmedi)", D.listede("yeniEfekt") === false && D.listede("overlay") === true);
ok("FEATURE_LABELS.yeniEfekt tanımlı", /yeniEfekt: '19 yeni altyazı efekti/.test(pro));
ok("satın al düğmeleri odemeSayfasiniAc'tan geçer; doğrudan openURL(proCheckoutUrl) kalmadı",
  /odemeSayfasiniAc\(proCheckoutUrl\("settings"\)\)/.test(app) && /odemeSayfasiniAc\(proCheckoutUrl\(feature\)\)/.test(app) &&
  !/openURLInDefaultBrowser\(proCheckoutUrl/.test(app));

function govde(kaynak, imza) { var i = kaynak.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return kaynak.slice(i, kaynak.indexOf("\n  }\n", i) + 4); }
function odemeOrtami(cs, pano) {
  var c = { bildirim: [], acilan: [], kopya: [] };
  c.K = { cs: cs ? { openURLInDefaultBrowser: function (u) { if (cs === "hata") throw new Error("CEP yok"); c.acilan.push(u); } } : null };
  c.toast = function (m, t, s) { c.bildirim.push([m, t, s]); };
  c.navigator = pano ? { clipboard: { writeText: function (u) { c.kopya.push(u); return Promise.resolve(); } } } : {};
  vm.createContext(c);
  vm.runInContext(govde(app, "function odemeSayfasiniAc(") + "\nthis.ac = odemeSayfasiniAc;", c);
  return c;
}
var U = "https://suflo.lemonsqueezy.com/checkout/buy/x?y=1";
var o1 = odemeOrtami(true, true), r1 = o1.ac(U);
ok("ödeme: tarayıcı açılır, kısa yol bildirimi (suflo.app/pro), pano değişmez", r1 === true && o1.acilan[0] === U && o1.kopya.length === 0 &&
  o1.bildirim.length === 1 && /suflo\.app\/pro/.test(o1.bildirim[0][0]) && o1.bildirim[0][1] === "good", JSON.stringify(o1.bildirim));
var o2 = odemeOrtami("hata", true), r2 = o2.ac(U);
ok("ödeme: openURL hata atarsa adres panoya, uyarı bildirimi", r2 === false && o2.kopya[0] === U && /panoya kopyalandı/.test(o2.bildirim[0][0]) && o2.bildirim[0][1] === "warn",
  JSON.stringify(o2.bildirim));
var o3 = odemeOrtami(null, false), r3 = o3.ac(U);
ok("ödeme: ne tarayıcı ne pano: suflo.app/pro söylenir", r3 === false && o3.kopya.length === 0 && /suflo\.app\/pro adresinden/.test(o3.bildirim[0][0]), JSON.stringify(o3.bildirim));

/* ---- 2) gerçek panel: pencereler ---- */
var pw = null;
try { pw = require("playwright"); } catch (e) { pw = null; }
(async function () {
  if (!pw) { console.log("ATLA tarayıcı bölümü: playwright yok"); return; }
  var b;
  try { b = await pw.chromium.launch(); } catch (e) { console.log("ATLA chromium açılamadı"); return; }
  try {
    var s = await b.newPage({ viewport: { width: 420, height: 900 } });
    s.on("pageerror", function () {});
    await s.goto("file://" + KOK.split(path.sep).join("/") + "/index.html");
    await s.waitForTimeout(600);
    function oku2() {
      return s.evaluate(function () {
        var w = document.getElementById("pro-upsell");
        if (!w) return null;
        return {
          baslik: (document.getElementById("pro-upsell-title") || {}).textContent,
          gorseller: Array.prototype.map.call(w.querySelectorAll("img"), function (i) { return i.getAttribute("src"); }),
          kanit: (w.querySelector(".pro-upsell-proof") || {}).textContent || "",
          al: (document.getElementById("pro-upsell-go") || {}).textContent,
          deneme: !!document.getElementById("pro-upsell-deneme"),
          fiyat: (w.querySelector(".pro-upsell-fiyat") || {}).textContent || "",
          metin: w.textContent
        };
      });
    }
    var sonuc = await s.evaluate(function () { return window.Pro.gate("yeniEfekt"); });
    var y = await oku2();
    ok("yeniEfekt: kapı kapalı (ücretsiz), kendi penceresi açılır", sonuc === false && !!y && y.baslik === "Seçtiğin yeni efekt hazır. Altyazına Pro ile ekle.", y && y.baslik);
    ok("yeniEfekt: üç yeni efekt görseli (dosyalar var), sayılar 19 / 12 / 14, deneme düğmesi yok",
      !!y && y.gorseller.length === 3 && y.gorseller.every(function (g) { return /previews\/\d+-autocaptions-/.test(g) && fs.existsSync(path.join(KOK, g)); }) &&
      /19 yeni efekt/.test(y.kanit) && /12 yeni animasyon/.test(y.kanit) && /14 yeni şablon/.test(y.kanit) && !y.deneme, y && JSON.stringify(y.gorseller) + " " + y.kanit);
    ok("yeniEfekt: düğme ve fiyat kutusu (749 TL, + KDV, tek seferlik) aynı", !!y && /Yeni Efektleri ve Tüm Pro'yu Aç/.test(y.al) && /749 TL/.test(y.fiyat) && /\+ KDV/.test(y.fiyat),
      y && (y.al + " | " + y.fiyat));
    ok("yeniEfekt: pencerede AutoCaptions adı görünmez", !!y && !/autocaptions/i.test(y.metin));
    await s.evaluate(function () { document.getElementById("pro-upsell-x").click(); });
    await s.evaluate(function () { return window.Pro.gate("overlay"); });
    var ov = await oku2();
    ok("overlay: kendi başlığı, Premiere şablonu görseli yok (gördüğün = eklenen), 49 görünüm · 37 animasyon",
      !!ov && ov.baslik === "Önizlediğin altyazı efektini timeline'a ekle" && ov.gorseller.length === 0 && /49 görünüm · 37 yazı animasyonu/.test(ov.metin), ov && JSON.stringify(ov.gorseller));
    var AE = require(path.join(KOK, "js", "altyazi-efekt.js")), YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
    ok("pencerelerdeki sayılar kataloglarla tutarlı (49 görünüm, 37 animasyon, 19 + 12 yeni)", AE.GORUNUMLER.length === 49 && YA.kimlikler().length === 37 &&
      AE.GORUNUMLER.filter(function (g) { return g.koleksiyon === "autocaptions"; }).length === 19 &&
      YA.kimlikler().filter(function (id) { return YA.bul(id).koleksiyon === "autocaptions"; }).length === 12);
    await s.evaluate(function () { document.getElementById("pro-upsell-x").click(); });
    await s.evaluate(function () { return window.Pro.gate("captionStyles"); });
    var cs = await oku2();
    ok("captionStyles penceresi değişmedi (31 stil, Premiere şablonu görselleri)", !!cs && cs.baslik === "Altyazın hazır. Şimdi videon gibi görünsün." &&
      cs.gorseller.length === 3 && /31 Stili ve Tüm Pro/.test(cs.al));
  } finally { await b.close(); }
})().then(function () {
  console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
  process.exit(kaldi ? 1 : 0);
}, function (e) { console.log("FAIL " + (e && e.stack || e)); process.exit(1); });
