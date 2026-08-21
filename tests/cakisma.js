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

function degerOzeti(v) {
  v = String(v || "").trim();
  return { deger: v.replace(/\s*!important\s*$/i, "").trim(), onemli: /!important\s*$/i.test(v) };
}
function gercektenEzer(tabanDeger, genelDeger) {
  var taban = degerOzeti(tabanDeger), genelDegerOzeti = degerOzeti(genelDeger);
  if (taban.deger === genelDegerOzeti.deger) return false;
  if (taban.onemli && !genelDegerOzeti.onemli) return false;
  return true;
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
      return tabanKural.oz.hasOwnProperty(p) && gercektenEzer(tabanKural.oz[p], g.oz[p]);
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
    // String parcaciklarindaki gercek sinif tokenlarini ayikla. Kelime siniri
    // kullanmak "seg" sinifini "seg-time" icinde bulup yanlis alarm veriyordu.
    var tokenlar = [], lm, literal = /["']([^"']*)["']/g;
    while ((lm = literal.exec(ifade)) !== null) {
      lm[1].split(/\s+/).forEach(function (t) {
        if (/^[a-zA-Z][\w-]*$/.test(t)) tokenlar.push(t);
      });
    }
    if (tokenlar.length < 2 || !genel[tokenlar[0]]) continue;

    var taban = tokenlar[0];
    var tabanKural = genel[taban][genel[taban].length - 1];
    tokenlar.slice(1).filter(function (t, i, a) { return a.indexOf(t) === i; }).forEach(function (mod) {
      if (!genel[mod]) return;
      var gercekRisk = genel[mod].some(function (g) {
        if (g.sira <= tabanKural.sira) return false;
        return Object.keys(g.oz).some(function (p) {
          return tabanKural.oz.hasOwnProperty(p) && gercektenEzer(tabanKural.oz[p], g.oz[p]);
        });
      });
      if (gercekRisk) {
        var satir = src.slice(0, mm2.index).split("\n").length;
        console.log("  RISK " + f + ":" + satir + "  genel '." + mod + "' '." + taban + "' bilesenini eziyor: " +
          ifade.replace(/\s+/g, " ").slice(0, 90));
      }
    });
  }
});
