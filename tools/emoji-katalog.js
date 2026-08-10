/*
 * Tam emoji kataloğunu üretir: emoji/katalog.json
 *
 * Kaynak: emoji-datasource (iamcal/emoji-data, MIT) metadata'sı. Bu betik
 * YALNIZ metadata işler — Apple'ın emoji ÇİZİMLERİ repoya asla girmez
 * (Apple telifli eser; dağıtamayız). Görsel spritesheet'i panel ilk
 * kullanımda jsdelivr'den KULLANICININ makinesine indirir (ffmpeg ve
 * Whisper modeliyle aynı model). Böylece repo temiz kalır, kullanıcı
 * Windows'ta bile Apple görünümünü alır.
 *
 * Kullanım: node tools/emoji-katalog.js
 */
var https = require("https");
var fs = require("fs");
var path = require("path");

var SURUM = "15.1.2";
var META = "https://cdn.jsdelivr.net/npm/emoji-datasource@" + SURUM + "/emoji.json";
var HEDEF = path.join(__dirname, "..", "emoji", "katalog.json");

/* Panelde gösterilen kategori sırası — emoji-data'nın İngilizce adlarıyla eşlenir */
var KATEGORILER = [
  { en: "Smileys & Emotion", tr: "Suratlar" },
  { en: "People & Body", tr: "İnsanlar" },
  { en: "Animals & Nature", tr: "Doğa" },
  { en: "Food & Drink", tr: "Yiyecek" },
  { en: "Travel & Places", tr: "Seyahat" },
  { en: "Activities", tr: "Aktivite" },
  { en: "Objects", tr: "Nesneler" },
  { en: "Symbols", tr: "Semboller" },
  { en: "Flags", tr: "Bayraklar" }
];

function indir(url) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: { "User-Agent": "Suflo-Build" } }, function (res) {
      if (res.statusCode !== 200) { reject(new Error("HTTP " + res.statusCode)); return; }
      var d = "";
      res.on("data", function (c) { d += c; });
      res.on("end", function () { resolve(d); });
    }).on("error", reject);
  });
}

function unifiedKarakter(unified) {
  return unified.split("-").map(function (h) {
    return String.fromCodePoint(parseInt(h, 16));
  }).join("");
}

(async function () {
  console.log("metadata indiriliyor: " + META);
  var ham = JSON.parse(await indir(META));

  var giris = [];
  var atlanan = 0;
  ham.forEach(function (e) {
    if (!e.has_img_apple) { atlanan++; return; }
    var g = KATEGORILER.findIndex(function (k) { return k.en === e.category; });
    if (g === -1) { atlanan++; return; }        // "Component" (ten rengi parçaları) vb.

    var ad = String(e.name || e.short_name || "").toLowerCase();
    var kisa = (e.short_names || []).join(" ");
    giris.push({
      c: unifiedKarakter(e.unified),
      n: (ad + " " + kisa).trim(),
      g: g, x: e.sheet_x, y: e.sheet_y,
      o: e.sort_order || 0
    });

    // ten rengi çeşitleri: ayrı hücre olarak (Blinkl gibi tam sayım)
    if (e.skin_variations) {
      Object.keys(e.skin_variations).forEach(function (sk) {
        var v = e.skin_variations[sk];
        if (!v.has_img_apple) return;
        giris.push({
          c: unifiedKarakter(v.unified),
          n: (ad + " " + kisa + " ton").trim(),
          g: g, x: v.sheet_x, y: v.sheet_y,
          o: (e.sort_order || 0) + 0.1
        });
      });
    }
  });

  giris.sort(function (a, b) { return a.g - b.g || a.o - b.o; });
  giris.forEach(function (e) { delete e.o; });

  var katalog = {
    surum: SURUM,
    kategoriler: KATEGORILER.map(function (k) { return k.tr; }),
    sheet: {
      boyut: 64,
      url: "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@" + SURUM + "/img/apple/sheets/64.png"
    },
    emojiler: giris
  };

  fs.writeFileSync(HEDEF, JSON.stringify(katalog));
  var kb = Math.round(fs.statSync(HEDEF).size / 1024);
  console.log("katalog yazildi: " + giris.length + " emoji, " + kb + " KB (atlanan: " + atlanan + ")");

  var sayim = {};
  giris.forEach(function (e) { sayim[e.g] = (sayim[e.g] || 0) + 1; });
  KATEGORILER.forEach(function (k, i) { console.log("  " + k.tr + ": " + (sayim[i] || 0)); });
})().catch(function (e) { console.log("HATA: " + e.message); process.exit(1); });
