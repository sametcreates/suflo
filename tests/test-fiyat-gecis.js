// Suflo testi: erken erisim bitince fiyat gecisi (tools/fiyat-gecis.js) siteyi
// tutarli bicimde 1.249'a ceviriyor mu, hicbir 749 kalmiyor mu?
var fs = require("fs");
var fg = require("../tools/fiyat-gecis.js");
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

var dosyalar = fg.htmlDosyalari();
var kalan = [], erken = [], degisen = 0, tekrar = 0, bozuk = [];
dosyalar.forEach(function (f) {
  var r = fg.donustur(fs.readFileSync(f, "utf8"));
  degisen += r.degisim;
  if (/(^|[^\d.])749(\s?(?:TL|₺))|"price"\s*:\s*"749"|data-fiyat>749/.test(r.html)) kalan.push(f);
  if (/data-erken|500 ₺ indirim/.test(r.html.replace(/<script[\s\S]*?<\/script>/g, ""))) erken.push(f);
  if (/1\.1\.249|11249|1\.1\.499/.test(r.html)) bozuk.push(f);
  tekrar += fg.donustur(r.html).degisim;
});
ok("site HTML dosyalari bulundu", dosyalar.length > 5, dosyalar.length);
ok("donusum bir seyler degistiriyor", degisen > 10, degisen);
ok("donusumden sonra 749 fiyati kalmiyor", kalan.length === 0, kalan.join(" | "));
ok("erken erisim ogeleri kalkiyor", erken.length === 0, erken.join(" | "));
ok("1.249 / 1.499 sayilari bozulmuyor", bozuk.length === 0, bozuk.join(" | "));
ok("ikinci uygulama hicbir sey degistirmez", tekrar === 0, tekrar);

// birim: isaretli ana sayfa parcalari
var ornek = '<div class="rozet" data-erken>ERKEN ERİŞİM</div><div class="pfiyat"><s data-erken>1.249 ₺</s><span class="b"><span data-fiyat>749</span> ₺</span></div>' +
  '<p class="psub"><span data-erken><b>500 ₺ indirim</b> · erken erişim fiyatı · </span><span class="kdv">+ KDV</span></p> toplam ≈ <span data-kdvli>899</span> ₺';
var sonuc = fg.donustur(ornek).html;
ok("fiyat karti dogru donusuyor", sonuc === '<div class="pfiyat"><span class="b"><span data-fiyat>1.249</span> ₺</span></div><p class="psub"><span class="kdv">+ KDV</span></p> toplam ≈ <span data-kdvli>1.499</span> ₺', sonuc);
ok("duz metin ve JSON-LD", fg.donustur('tek seferlik 749 TL\'dir · "price":"749" · 1.249 ₺').html === 'tek seferlik 1.249 TL\'dir · "price":"1249" · 1.249 ₺');

// ana sayfanin tarayici tarafi gecisi isaretli yerlerle tutarli mi
var index = fs.readFileSync(require("path").join(__dirname, "..", "docs", "index.html"), "utf8");
ok("ana sayfada bitis ani sabit", /ERKEN_BITIS = Date\.parse\('2026-10-10T07:33:39Z'\)/.test(index));
ok("ana sayfada tum gorunur 749'lar isaretli", !/(^|[^\d.>])749(\s?(?:TL|₺))/.test(index.replace(/<script[\s\S]*?<\/script>/g, "")));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
