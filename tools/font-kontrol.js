/*
 * TTF cmap denetimi: font Türkçe glifleri GERÇEKTEN içeriyor mu?
 *
 * Neden gerekli: altyazı fontu ğ/ş/İ/ı içermiyorsa libass o glifler için başka
 * fonta düşer ve yazı "karışık fontlu" çıkar — kullanıcı sebebini asla anlayamaz.
 * Görsel testle yakalamak zordur; cmap tablosunu okumak kesin cevap verir.
 *
 * Ayrıca fontun İÇ ADINI (name tablosu, family) çıkarır: ASS'in Fontname alanı
 * dosya adıyla değil bu adla eşleşmek zorunda.
 *
 * Kullanım: node tools/font-kontrol.js fonts/*.ttf
 */
var fs = require("fs");

var TURKCE = {
  "ğ": 0x011F, "Ğ": 0x011E, "ş": 0x015F, "Ş": 0x015E,
  "ı": 0x0131, "İ": 0x0130, "ç": 0x00E7, "ö": 0x00F6, "ü": 0x00FC,
  "Ç": 0x00C7, "Ö": 0x00D6, "Ü": 0x00DC
};

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

/* cmap format 4 (BMP) — Türkçe glifler hep BMP'de, bu yeterli */
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

/* name tablosundan aile adı (nameID 1, Windows en tercih) */
function aileAdi(buf) {
  var t = tabloBul(buf, "name");
  if (!t) return "?";
  var base = t.ofset;
  var n = u16(buf, base + 2);
  var strOfset = base + u16(buf, base + 4);
  var aday = null;
  for (var i = 0; i < n; i++) {
    var k = base + 6 + i * 12;
    var pid = u16(buf, k), nameId = u16(buf, k + 6);
    var uz = u16(buf, k + 8), off = u16(buf, k + 10);
    if (nameId !== 1) continue;
    if (pid === 3) {  // Windows: UTF-16BE
      var s = "";
      for (var j = 0; j < uz; j += 2) s += String.fromCharCode(u16(buf, strOfset + off + j));
      return s;
    }
    if (aday === null) aday = buf.toString("ascii", strOfset + off, strOfset + off + uz);
  }
  return aday || "?";
}

var dosyalar = process.argv.slice(2);
if (!dosyalar.length) { console.error("kullanim: node font-kontrol.js <ttf...>"); process.exit(1); }

var sorunlu = 0;
dosyalar.forEach(function (yol) {
  var buf;
  try { buf = fs.readFileSync(yol); } catch (e) { console.log(yol + ": OKUNAMADI"); sorunlu++; return; }
  if (buf.length < 1024) { console.log(yol.padEnd(46) + " BOZUK (" + buf.length + " bayt)"); sorunlu++; return; }
  var v = kapsam(buf);
  if (!v) { console.log(yol.padEnd(46) + " cmap okunamadi"); sorunlu++; return; }
  var eksik = [];
  Object.keys(TURKCE).forEach(function (h) { if (!v(TURKCE[h])) eksik.push(h); });
  var ad = aileAdi(buf);
  if (eksik.length) {
    console.log(yol.padEnd(46) + " aile=\"" + ad + "\"  EKSIK: " + eksik.join(" "));
    sorunlu++;
  } else {
    console.log(yol.padEnd(46) + " aile=\"" + ad + "\"  Turkce TAM");
  }
});
process.exit(sorunlu ? 1 : 0);
