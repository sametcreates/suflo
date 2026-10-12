/*
 * TTF cmap denetimi: font Türkçe (ve Azerbaycanca) glifleri GERÇEKTEN içeriyor mu?
 *
 * Neden gerekli: altyazı fontu ğ/ş/İ/ı içermiyorsa libass o glifler için başka
 * fonta düşer ve yazı "karışık fontlu" çıkar — kullanıcı sebebini asla anlayamaz.
 * Görsel testle yakalamak zordur; cmap tablosunu okumak kesin cevap verir.
 *
 * Ayrıca fontun İÇ ADINI (name tablosu, family) çıkarır: ASS'in Fontname alanı
 * dosya adıyla değil bu adla eşleşmek zorunda. PostScript adı (nameID 6, Premiere'in
 * setFont'u ve yerel MOGRT için) ve ağırlık (OS/2 usWeightClass; statik Regular 400 /
 * Bold 700) da raporlanır.
 *
 * 3.3 adım 18: Azerbaycanca ə / Ə (U+0259 / U+018F) da denetlenir. Türkçe glifler her
 * fontta ZORUNLU; ə / Ə yalnız --az ile zorunlu (3.3'te eklenen fontlar; 3.2'den gelen
 * Archivo Black ve Bebas Neue'de yok, onlar uyarıyla geçer).
 *
 * Kullanım: node tools/font-kontrol.js [--az] fonts/*.ttf
 * Modül olarak (testler): require("./tools/font-kontrol.js").denetle(buf) →
 *   { aile, postscript, agirlik, eksik: [Türkçe], azEksik: [ə Ə] } | { hata }
 */
var fs = require("fs");

var TURKCE = {
  "ğ": 0x011F, "Ğ": 0x011E, "ş": 0x015F, "Ş": 0x015E,
  "ı": 0x0131, "İ": 0x0130, "ç": 0x00E7, "ö": 0x00F6, "ü": 0x00FC,
  "Ç": 0x00C7, "Ö": 0x00D6, "Ü": 0x00DC
};
// Azerbaycanca (panelin Azərbaycanca dili): schwa
var AZERBAYCANCA = { "ə": 0x0259, "Ə": 0x018F };

function u16(b, o) { return b.readUInt16BE(o); }
function u32(b, o) { return b.readUInt32BE(o); }

function tabloBul(buf, etiket) {
  var n = u16(buf, 4);
  for (var i = 0; i < n; i++) {
    var kayit = 12 + i * 16;
    if (buf.toString("ascii", kayit, kayit + 4) === etiket) {
      return { ofset: u32(buf, kayit + 8), boy: u32(buf, kayit + 12) };
    }
  }
  return null;
}

/* cmap format 4 (BMP) — Türkçe ve Azerbaycanca glifler hep BMP'de, bu yeterli */
function kapsam(buf) {
  var t = tabloBul(buf, "cmap");
  if (!t) return null;
  var base = t.ofset;
  var nTab = u16(buf, base + 2);
  var alt = null;
  for (var i = 0; i < nTab; i++) {
    var kayit = base + 4 + i * 8;
    var pid = u16(buf, kayit), eid = u16(buf, kayit + 2);
    var off = u32(buf, kayit + 4);
    // Windows Unicode BMP (3,1) tercih; olmazsa (0,3)
    if ((pid === 3 && eid === 1) || (pid === 0 && eid === 3)) { alt = base + off; if (pid === 3) break; }
  }
  if (alt === null) return null;
  if (u16(buf, alt) !== 4) return null;

  var segX2 = u16(buf, alt + 6);
  var seg = segX2 / 2;
  var endler = alt + 14;
  var baslar = endler + segX2 + 2;

  function varMi(kod) {
    for (var s = 0; s < seg; s++) {
      var son = u16(buf, endler + s * 2);
      if (kod <= son) {
        var bas = u16(buf, baslar + s * 2);
        return kod >= bas;
      }
    }
    return false;
  }
  return varMi;
}

/* name tablosundan bir ad (nameID 1 aile, 6 PostScript; Windows UTF-16BE tercih) */
function ad(buf, nameId) {
  var t = tabloBul(buf, "name");
  if (!t) return "?";
  var base = t.ofset;
  var n = u16(buf, base + 2);
  var strOfset = base + u16(buf, base + 4);
  var aday = null;
  for (var i = 0; i < n; i++) {
    var k = base + 6 + i * 12;
    var pid = u16(buf, k), id = u16(buf, k + 6);
    var uz = u16(buf, k + 8), off = u16(buf, k + 10);
    if (id !== nameId) continue;
    if (pid === 3) {  // Windows: UTF-16BE
      var s = "";
      for (var j = 0; j < uz; j += 2) s += String.fromCharCode(u16(buf, strOfset + off + j));
      return s;
    }
    if (aday === null) aday = buf.toString("ascii", strOfset + off, strOfset + off + uz);
  }
  return aday || "?";
}
function aileAdi(buf) { return ad(buf, 1); }

function agirlik(buf) {
  var t = tabloBul(buf, "OS/2");
  return t ? u16(buf, t.ofset + 4) : 0;
}

function denetle(buf) {
  if (!buf || buf.length < 1024) return { hata: "BOZUK (" + (buf ? buf.length : 0) + " bayt)" };
  var v = kapsam(buf);
  if (!v) return { hata: "cmap okunamadi" };
  var eksik = [], azEksik = [];
  Object.keys(TURKCE).forEach(function (h) { if (!v(TURKCE[h])) eksik.push(h); });
  Object.keys(AZERBAYCANCA).forEach(function (h) { if (!v(AZERBAYCANCA[h])) azEksik.push(h); });
  return { aile: aileAdi(buf), postscript: ad(buf, 6), agirlik: agirlik(buf), eksik: eksik, azEksik: azEksik };
}

function calistir(argv) {
  var az = argv.indexOf("--az") !== -1;
  var dosyalar = argv.filter(function (a) { return a !== "--az"; });
  if (!dosyalar.length) { console.error("kullanim: node font-kontrol.js [--az] <ttf...>"); return 1; }
  var sorunlu = 0;
  dosyalar.forEach(function (yol) {
    var buf;
    try { buf = fs.readFileSync(yol); } catch (e) { console.log(yol + ": OKUNAMADI"); sorunlu++; return; }
    var r = denetle(buf);
    if (r.hata) { console.log(yol.padEnd(46) + " " + r.hata); sorunlu++; return; }
    var bas = yol.padEnd(46) + " aile=\"" + r.aile + "\" ps=\"" + r.postscript + "\" w=" + r.agirlik;
    if (r.eksik.length) {
      console.log(bas + "  EKSIK: " + r.eksik.join(" "));
      sorunlu++;
    } else if (r.azEksik.length) {
      console.log(bas + "  Turkce TAM, Azerbaycanca EKSIK: " + r.azEksik.join(" "));
      if (az) sorunlu++;
    } else {
      console.log(bas + "  Turkce + Azerbaycanca TAM");
    }
  });
  return sorunlu ? 1 : 0;
}

if (typeof module !== "undefined" && require.main === module) process.exit(calistir(process.argv.slice(2)));
else module.exports = { TURKCE: TURKCE, AZERBAYCANCA: AZERBAYCANCA, denetle: denetle, aileAdi: aileAdi, ad: ad, agirlik: agirlik, calistir: calistir };
