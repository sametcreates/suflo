// Ortak: JS kaynagindan yorum, metin (', ", `) ve regex sabitlerini bosluga cevir
// (satir numaralari korunur). "_" ile baslayan dosyalari test kosucusu calistirmaz.
// Regex: "/" oncesinde deger yoksa (ya da return/typeof/case... gibi anahtar kelimeden sonra).
var REGEX_ONCESI_KELIME = /^(return|typeof|case|in|of|do|else|void|throw|new|delete|instanceof|yield|await)$/;

function ayikla(src) {
  var out = "", i = 0, n = src.length, onceki = "", sonKelime = "";
  function bosalt(s) { return s.replace(/[^\n]/g, " "); }
  while (i < n) {
    var c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { var j = src.indexOf("\n", i); if (j < 0) j = n; out += bosalt(src.slice(i, j)); i = j; continue; }
    if (c === "/" && d === "*") { var k = src.indexOf("*/", i + 2); k = k < 0 ? n : k + 2; out += bosalt(src.slice(i, k)); i = k; continue; }
    if (c === "\"" || c === "'" || c === "`") {
      var m = i + 1;
      while (m < n && src[m] !== c) { if (src[m] === "\\") m++; m++; }
      // sablon metninin icindeki ${...} kodu da gizlenir (denetleyici icin yeterli yaklasim)
      out += c + bosalt(src.slice(i + 1, m)) + c; i = m + 1; onceki = "x"; sonKelime = ""; continue;
    }
    var regexMi = c === "/" && (!/[\w$)\]]/.test(onceki) || REGEX_ONCESI_KELIME.test(sonKelime));
    if (regexMi) {
      var r = i + 1, sinif = false;
      while (r < n && src[r] !== "\n") {
        if (src[r] === "\\") { r += 2; continue; }
        if (src[r] === "[") sinif = true; else if (src[r] === "]") sinif = false;
        else if (src[r] === "/" && !sinif) break;
        r++;
      }
      out += "/" + bosalt(src.slice(i + 1, r)) + "/"; i = r + 1; onceki = "x"; sonKelime = ""; continue;
    }
    if (/[\w$]/.test(c)) {
      // kelimeyi bir seferde al: regex-oncesi anahtar kelime takibi
      var w = i;
      while (w < n && /[\w$]/.test(src[w])) w++;
      var kelime = src.slice(i, w);
      out += kelime; onceki = kelime[kelime.length - 1]; sonKelime = kelime; i = w; continue;
    }
    out += c;
    if (!/\s/.test(c)) { onceki = c; sonKelime = ""; }
    i++;
  }
  return out;
}

module.exports = ayikla;
