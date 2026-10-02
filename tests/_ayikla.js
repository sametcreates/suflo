// Ortak: JS kaynagindan yorum, metin ve regex sabitlerini ayikla (satirlar korunur).
// "_" ile baslayan dosyalari test kosucusu calistirmaz.
// yorum, metin ve regex sabitlerini bosluga cevir (satir numaralari korunur)
function ayikla(src) {
  var out = "", i = 0, n = src.length, onceki = "";
  function bosalt(s) { return s.replace(/[^\n]/g, " "); }
  while (i < n) {
    var c = src[i], d = src[i + 1];
    if (c === "/" && d === "/") { var j = src.indexOf("\n", i); if (j < 0) j = n; out += bosalt(src.slice(i, j)); i = j; continue; }
    if (c === "/" && d === "*") { var k = src.indexOf("*/", i + 2); k = k < 0 ? n : k + 2; out += bosalt(src.slice(i, k)); i = k; continue; }
    if (c === "\"" || c === "'") {
      var m = i + 1;
      while (m < n && src[m] !== c) { if (src[m] === "\\") m++; m++; }
      out += c + bosalt(src.slice(i + 1, m)) + c; i = m + 1; onceki = "x"; continue;
    }
    // regex sabiti: oncesinde deger olmayan "/"
    if (c === "/" && !/[\w$)\]]/.test(onceki)) {
      var r = i + 1, sinif = false;
      while (r < n && src[r] !== "\n") {
        if (src[r] === "\\") { r += 2; continue; }
        if (src[r] === "[") sinif = true; else if (src[r] === "]") sinif = false;
        else if (src[r] === "/" && !sinif) break;
        r++;
      }
      out += "/" + bosalt(src.slice(i + 1, r)) + "/"; i = r + 1; onceki = "x"; continue;
    }
    out += c;
    if (!/\s/.test(c)) onceki = c;
    i++;
  }
  return out;
}

module.exports = ayikla;
