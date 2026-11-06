// Suflo test yardımcısı (doğrudan koşulmaz: "_" ile başlar): Yazı animasyonları testlerinin ortak örnekleri.
// tests/yazi-animasyon-klasik-snapshot.json bu düzenle, animasyon motoru v2'den ÖNCEKİ stil motoruyla üretildi:
// anim alanı yokken (ya da "") Altyazı Efektleri çıktısı bayt bayt aynı kalmalı.
var path = require("path"), crypto = require("crypto");
var KOK = path.join(__dirname, "..");

// Kadrajlar: 16:9, 9:16 + "Platform arayüzünden kaçın", 1:1
var KADRAJLAR = [
  { ad: "16x9", w: 1920, h: 1080, guvenli: false },
  { ad: "9x16g", w: 1080, h: 1920, guvenli: true },
  { ad: "1x1", w: 1080, h: 1080, guvenli: false }
];

function kelimeler(liste, adim, sure) {
  return liste.map(function (w, i) { return { start: 0.2 + i * adim, end: 0.2 + i * adim + sure, text: w }; });
}
// Metinler: tek kelime, beş kelime, uzun kelime, *vurgu*lu
var METINLER = {
  tek: kelimeler(["Merhaba"], 0.6, 0.9),
  bes: kelimeler(["Bunu", "gören", "herkes", "çok", "şaşırdı"], 0.45, 0.4),
  uzun: kelimeler(["Mükemmelleştirebileceklerimizden", "biri"], 0.9, 0.85),
  vurgu: kelimeler(["Bu", "*gerçekten*", "önemli", "bir", "konu"], 0.4, 0.36)
};

function ozet(ass) { return crypto.createHash("sha256").update(ass).digest("hex").slice(0, 16); }

/*
 * Klasik (anim yok) örnekler: her hazır görünüm × kadraj × metin × şiddet, artı vurgusuz ve gölge + kutulu glitch.
 * ek: overrides'a eklenecek alanlar (ör. { anim: "" }). Döner: { anahtar: ozet }
 */
function klasikOzetleri(SE, AE, ek) {
  var out = {};
  var ayarlar = AE.GORUNUMLER.map(function (g) { return { ad: g.id, ov: AE.overrides(g.ayar) }; });
  var gl = AE.overrides(AE.gorunum("glitch").ayar);
  gl.golge = { renk: "#102030", opak: 70, mesafe: 6, yumusak: 4 }; gl.kutu = true; gl.kutuOpak = 60;
  ayarlar.push({ ad: "glitch+golge+kutu", ov: gl });
  var vz = AE.overrides(AE.gorunum("temiz").ayar); vz.vurgu = false;
  ayarlar.push({ ad: "temiz-vurgusuz", ov: vz });
  var serbest = AE.overrides(AE.gorunum("zarif").ayar); serbest.konumX = 30; serbest.konumY = 40;
  ayarlar.push({ ad: "zarif-serbest", ov: serbest });
  ayarlar.forEach(function (a) {
    KADRAJLAR.forEach(function (k) {
      Object.keys(METINLER).forEach(function (m) {
        [undefined, "soft", "hard"].forEach(function (s) {
          var ov = JSON.parse(JSON.stringify(a.ov));
          ov.guvenli = k.guvenli;
          Object.keys(ek || {}).forEach(function (x) { ov[x] = ek[x]; });
          var r = SE.compile({ styleId: "efekt", cues: METINLER[m], cueKind: "words", width: k.w, height: k.h, intensity: s, overrides: ov });
          out[a.ad + "@" + k.ad + ":" + m + ":" + (s || "dengeli")] = ozet(r.ass);
        });
      });
    });
  });
  return out;
}

module.exports = { KOK: KOK, KADRAJLAR: KADRAJLAR, METINLER: METINLER, kelimeler: kelimeler, ozet: ozet, klasikOzetleri: klasikOzetleri };

// node tests/_yazi-animasyon-ortak.js --yaz : anlık görüntüyü (yalnız değişiklik ÖNCESİ motorla) yaz
if (require.main === module && process.argv.indexOf("--yaz") !== -1) {
  var SE = require(path.join(KOK, "js", "style-engine.js")), AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
  var o = klasikOzetleri(SE, AE);
  require("fs").writeFileSync(path.join(__dirname, "yazi-animasyon-klasik-snapshot.json"), JSON.stringify(o, null, 1) + "\n");
  console.log(Object.keys(o).length + " özet yazıldı");
}
