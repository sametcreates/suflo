// Uyumluluk fikstürlerinin ortak örnekleri (uret.js ile tests/test-altyazi-uyumluluk.js aynı girdiyi kullanır)
function kelimeler(liste, adim, sure) {
  return liste.map(function (w, i) { return { start: 0.2 + i * adim, end: 0.2 + i * adim + sure, text: w }; });
}
var crypto = require("crypto");
function sha(t) { return crypto.createHash("sha256").update(String(t)).digest("hex").slice(0, 20); }
/*
 * ASS özeti (fikstürde tam ASS yerine; bayt eşitliği sha ile denetlenir):
 *   sha: tüm metin; bas: [Script Info] + [V4+ Styles] bölümü; diyalog: Dialogue satırı sayısı;
 *   kartlar: her Dialogue'un etiketsiz metni (\N boşluk, ardışık aynı metin bir kez), zaman: ilk başlangıç / son bitiş
 */
function ozet(ass) {
  var satirlar = String(ass).split("\n");
  var i = satirlar.findIndex(function (l) { return /^\[Events\]/.test(l); });
  var dia = satirlar.filter(function (l) { return /^Dialogue:/.test(l); });
  var kartlar = [], bas = Infinity, son = -Infinity;
  dia.forEach(function (l) {
    var f = l.slice(10).split(",");
    var t = f.slice(9).join(",").replace(/\{[^}]*\}/g, "").replace(/\\N/g, " ").replace(/\s+/g, " ").trim();
    function sn(x) { var p = x.split(":"); return Number(p[0]) * 3600 + Number(p[1]) * 60 + Number(p[2]); }
    bas = Math.min(bas, sn(f[1])); son = Math.max(son, sn(f[2]));
    if (t && kartlar[kartlar.length - 1] !== t) kartlar.push(t);
  });
  return { sha: sha(ass), bas: sha(satirlar.slice(0, i < 0 ? satirlar.length : i).join("\n")), diyalog: dia.length, kartlar: kartlar,
    zaman: dia.length ? [Math.round(bas * 100) / 100, Math.round(son * 100) / 100] : [] };
}
module.exports = {
  ozet: ozet,
  KADRAJLAR: [{ ad: "16x9", w: 1920, h: 1080 }, { ad: "9x16", w: 1080, h: 1920 }, { ad: "1x1", w: 1080, h: 1080 }],
  METINLER: {
    vurgu: kelimeler(["Bunu", "*gören*", "herkes", "şaşırdı", "bugün"], 0.5, 0.44),
    uzun: kelimeler(("Bugün size bu küçük kasabanın en eski fırınında sabah dörtte neler olduğunu " +
      "anlatacağım ve sonunda gerçekten şaşıracaksınız").split(" "), 0.38, 0.34)
  }
};
