var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * CSS sinif cakismasi tarayicisi.
 * Bir bilesenin degistirici (modifier) sinifi, ayni adi tasiyan GENEL bir kuralla
 * cakisiyorsa ve genel kural dosyada SONRA geliyorsa, bilesenin kendi ozellikleri eziliyor.
 * A3 cipinin sismesinin sebebi tam olarak buydu (.track-chip.empty vs genel .empty).
 */
var fs = require("fs");
var css = fs.readFileSync(KOKYOL + "css/style.css", "utf8");

// Yorumlari at
var temiz = css.replace(/\/\*[\s\S]*?\*\//g, "");

// Kural bloklarini sirali cikar: { secici, satirNo, ozellikler }
var kurallar = [];
var re = /([^{}]+)\{([^{}]*)\}/g, m;
while ((m = re.exec(temiz)) !== null) {
  var sec = m[1].trim();
  if (!sec || sec.charAt(0) === "@") continue;
  var satir = temiz.slice(0, m.index).split("\n").length;
  var ozellikler = {};
  m[2].split(";").forEach(function (d) {
    var i = d.indexOf(":");
    if (i > 0) ozellikler[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  });
  sec.split(",").forEach(function (s) {
    kurallar.push({ sec: s.trim(), satir: satir, oz: ozellikler, sira: kurallar.length });
  });
}

// TEK sinifli genel kurallar (ornegin ".empty")
var genel = {};
kurallar.forEach(function (k) {
  var mm = /^\.([a-zA-Z][\w-]*)$/.exec(k.sec);
  if (mm) (genel[mm[1]] = genel[mm[1]] || []).push(k);
});

// Bilesik kurallar (".track-chip.empty") -> ikinci sinif genel bir kuralla cakisiyor mu
var bulgular = [];
kurallar.forEach(function (k) {
  var mm = /^\.([a-zA-Z][\w-]*)\.([a-zA-Z][\w-]*)$/.exec(k.sec);
  if (!mm) return;
  var taban = mm[1], mod = mm[2];
  if (!genel[mod]) return;
  // taban bileseninin kendi kurali
  var tabanKural = null;
  kurallar.forEach(function (x) { if (x.sec === "." + taban) tabanKural = x; });
  if (!tabanKural) return;
  genel[mod].forEach(function (g) {
    if (g.sira <= tabanKural.sira) return;         // sonra gelmiyorsa ezmiyor
    var ezilen = Object.keys(g.oz).filter(function (p) {
      return tabanKural.oz.hasOwnProperty(p) && tabanKural.oz[p] !== g.oz[p];
    });
    if (ezilen.length) {
      bulgular.push({
        bilesen: "." + taban + "." + mod + "  (satir " + k.satir + ")",
        genel: "." + mod + "  (satir " + g.satir + ")",
        ezilen: ezilen.map(function (p) {
          return p + ": " + tabanKural.oz[p] + "  ->  " + g.oz[p];
        })
      });
    }
  });
});

if (!bulgular.length) {
  console.log("Cakisma YOK — bilesen degistiricileri genel siniflarla catismiyor.");
} else {
  console.log("!! " + bulgular.length + " CAKISMA:\n");
  bulgular.forEach(function (b) {
    console.log("  " + b.bilesen + "  <-- eziliyor -->  " + b.genel);
    b.ezilen.forEach(function (e) { console.log("      " + e); });
    console.log("");
  });
}

// JS'te uretilen sinif adlarini da tara: genel bir sinif adi modifier olarak kullanilmis mi
var riskli = Object.keys(genel);
var jsDosyalar = ["app.js", "captions.js", "sfx.js", "magiccut.js", "motion.js"];
console.log("Genel tek-sinif kurallari: " + riskli.join(", ") + "\n");
jsDosyalar.forEach(function (f) {
  var src;
  try { src = fs.readFileSync(KOKYOL + "js/" + f, "utf8"); }
  catch (e) { return; }
  var re2 = /className\s*=\s*([^;]+);/g, mm2;
  while ((mm2 = re2.exec(src)) !== null) {
    var ifade = mm2[1];
    riskli.forEach(function (r) {
      // bilesen sinifiyla BIRLIKTE kullanilan genel sinif adi
      var kalip = new RegExp('"[^"]*\\b' + r + '\\b[^"]*"');
      if (kalip.test(ifade) && /-/.test(ifade)) {
        var satir = src.slice(0, mm2.index).split("\n").length;
        console.log("  RISK " + f + ":" + satir + "  genel '." + r + "' bir bilesenle birlikte: " +
          ifade.replace(/\s+/g, " ").slice(0, 90));
      }
    });
  }
});
