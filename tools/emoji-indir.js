/*
 * Seçilmiş emoji setini Twemoji'den indirir (SVG, ~2-4 KB/adet).
 *
 * NEDEN TWEMOJI: Apple'ın emoji çizimleri Apple'ın telifli eseridir ve
 * paketlenemez. Twemoji grafikleri CC-BY 4.0 — atıfla serbest. Görsel set
 * kullanmanın asıl sebebi tutarlılık: metindeki emoji karakteri her
 * platformda farklı görünür, panelde gördüğün görseller ise sabittir.
 *
 * Kullanım: node tools/emoji-indir.js
 */
var https = require("https");
var fs = require("fs");
var path = require("path");

var HEDEF = path.join(__dirname, "..", "emoji");
var KAYNAK = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/";

/* Altyazı/kurgu bağlamında gerçekten kullanılan, seçilmiş set */
var EMOJILER = [
  // tepki
  "😂", "🤣", "😅", "😍", "🥹", "😮", "😱", "🤯", "🙄", "😭", "🥶", "😴", "🤔", "😎",
  // işaret / dikkat
  "✅", "❌", "⚠️", "❗", "❓", "💯", "👇", "👆", "👉", "🔝",
  // el
  "👍", "👎", "👏", "🙏", "🤝", "💪", "🤞",
  // ateş / para / başarı
  "🔥", "💰", "🤑", "💸", "📈", "🚀", "⭐", "🏆", "🎯", "⚡",
  // nesne / kurgu
  "🎬", "🎥", "🎧", "🎵", "📱", "💡", "⏰", "📌", "🎁", "❤️"
];

function kodAdi(emoji) {
  // Twemoji dosya adı: kod noktaları tire ile, VS16 (fe0f) çoğunda atılır
  var kodlar = Array.from(emoji).map(function (c) {
    return c.codePointAt(0).toString(16);
  }).filter(function (k) { return k !== "fe0f"; });
  return kodlar.join("-");
}

function indir(url, hedef) {
  return new Promise(function (resolve) {
    var f = fs.createWriteStream(hedef);
    https.get(url, function (res) {
      if (res.statusCode !== 200) { f.close(); fs.unlinkSync(hedef); resolve(false); return; }
      res.pipe(f);
      f.on("finish", function () { f.close(); resolve(true); });
    }).on("error", function () { try { fs.unlinkSync(hedef); } catch (e) {} resolve(false); });
  });
}

(async function () {
  fs.mkdirSync(HEDEF, { recursive: true });
  var esleme = {};   // emoji karakteri -> dosya adı
  var basari = 0, hata = [];

  for (var i = 0; i < EMOJILER.length; i++) {
    var e = EMOJILER[i];
    var ad = kodAdi(e);
    var dosya = path.join(HEDEF, ad + ".svg");
    var ok = fs.existsSync(dosya) || await indir(KAYNAK + ad + ".svg", dosya);
    if (ok && fs.statSync(dosya).size > 100) { esleme[e] = ad + ".svg"; basari++; }
    else hata.push(e + " (" + ad + ")");
  }

  fs.writeFileSync(path.join(HEDEF, "esleme.json"), JSON.stringify(esleme, null, 1));
  fs.writeFileSync(path.join(HEDEF, "LISANS.txt"),
    "Bu klasordeki emoji gorselleri Twemoji projesindendir.\n" +
    "Telif: Twitter, Inc ve katkida bulunanlar; devami jdecked/twemoji.\n" +
    "Lisans: CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/)\n" +
    "Kaynak: https://github.com/jdecked/twemoji\n");

  console.log("indirilen: " + basari + "/" + EMOJILER.length);
  if (hata.length) console.log("HATA: " + hata.join(", "));
  process.exit(hata.length ? 1 : 0);
})();
