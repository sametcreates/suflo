"use strict";
// Erken erisim bitince sitedeki statik fiyatlari normal fiyata cevirir:
// 749 -> 1.249 (KDV'li ~899 -> ~1.499), "erken erisim" ogeleri (data-erken) kalkar,
// arama motoru verisindeki (JSON-LD) fiyat da guncellenir.
//
// Ana sayfa bitis aninda bunu tarayicida zaten kendisi yapar; bu arac statik
// HTML'i (arama motorlari, JS'siz okuyucular, blog yazilari) ayni hale getirir.
//
// Kullanim:  node tools/fiyat-gecis.js            -> kuru calisma: ne degisecegini gosterir
//            node tools/fiyat-gecis.js --uygula   -> dosyalara yazar
// Lemon Squeezy'deki fiyati ayrica elle 1.249 TRY yapmayi unutma.
var fs = require("fs");
var path = require("path");

var DOCS = path.join(__dirname, "..", "docs");

// Saf donusum: testler de bunu kullanir. Ayni metne iki kez uygulamak bir sey degistirmez.
function donustur(html) {
  var degisim = 0;
  function say(re, yeni) {
    degisim += (html.match(re) || []).length;
    html = html.replace(re, yeni);
  }
  // erken erisim ogeleri (ic ice ayni etiket yok: rozet div, ustu cizili s, indirim span)
  say(/<(div|s|span|p)\b[^>]*\bdata-erken\b[^>]*>[\s\S]*?<\/\1>/g, "");
  // isaretli yerler
  say(/(<span data-fiyat>)749(<\/span>)/g, "$11.249$2");
  say(/(<span data-kdvli>)899(<\/span>)/g, "$11.499$2");
  // JSON-LD teklif fiyati
  say(/("price"\s*:\s*")749(")/g, "$11249$2");
  // duz metin: "749 TL", "749 ₺", "749 TL'dir" ... (1.249 gibi sayilarin parcasina dokunma)
  say(/(^|[^\d.])749(\s?(?:TL|₺))/g, "$11.249$2");
  say(/(^|[^\d.])899(\s?(?:TL|₺))/g, "$11.499$2");
  return { html: html, degisim: degisim };
}

function htmlDosyalari() {
  var liste = [];
  (function gez(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      var p = path.join(d, e.name);
      if (e.isDirectory()) gez(p);
      else if (/\.html$/.test(e.name)) liste.push(p);
    });
  }(DOCS));
  return liste;
}

if (require.main === module) {
  var uygula = process.argv.indexOf("--uygula") !== -1;
  var toplam = 0;
  htmlDosyalari().forEach(function (f) {
    var eski = fs.readFileSync(f, "utf8");
    var r = donustur(eski);
    if (!r.degisim) return;
    toplam += r.degisim;
    console.log((uygula ? "yazildi  " : "degisecek ") + path.relative(DOCS, f) + "  (" + r.degisim + " yer)");
    if (uygula) fs.writeFileSync(f, r.html);
  });
  console.log(toplam ? (uygula ? "Tamam: " : "Kuru calisma: ") + toplam + " yer" + (uygula ? " guncellendi." : ". Yazmak icin --uygula ekle.") : "Degisecek fiyat yok (zaten guncel).");
  if (uygula && toplam) console.log("Hatirlatma: Lemon Squeezy'de fiyati 1.249 TRY yap; sonra commit + push.");
}

module.exports = { donustur: donustur, htmlDosyalari: htmlDosyalari };
