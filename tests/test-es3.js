// Suflo testi: jsx/ ExtendScript (ES3) — yalniz Premiere'de patlayan ES5+/ES6 kullanimlarini yakala
// Yorumlar ve metinler ayiklanir, kalan kodda yasak kaliplar aranir. Bagimlilik yok (CI'da da calisir).
var fs = require("fs"), path = require("path");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

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

var YASAK = [
  { re: /\b(let|const|class)\s/, ad: "let/const/class (ES6)" },
  { re: /=>/, ad: "ok fonksiyonu (ES6)" },
  { re: /`/, ad: "sablon metni (ES6)" },
  { re: /\.(forEach|map|filter|reduce|reduceRight|some|every|trim|trimLeft|trimRight|bind)\s*\(/, ad: "ES5 dizi/metin metodu" },
  { re: /\b(Array\.isArray|Object\.(keys|create|defineProperty|freeze|assign|entries|values)|Date\.now)\s*\(/, ad: "ES5 statik metod" },
  { re: /\bJSON\.(parse|stringify)\s*\(/, ad: "JSON (ES3'te yok; KJSON kullan)" },
  { re: /,\s*[}\]]/, ad: "sondaki virgul (ES3'te nesne/dizi hatasi)" },
  { re: /\.\.\.\w/, ad: "yayma sozdizimi (ES6)" }
];

var dizin = path.join(__dirname, "..", "jsx");
function dosyalar(d) {
  var out = [];
  fs.readdirSync(d).forEach(function (f) {
    var p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) out = out.concat(dosyalar(p));
    else if (/\.jsx?$/.test(f)) out.push(p);
  });
  return out;
}
dosyalar(dizin).forEach(function (p) {
  var src = fs.readFileSync(p, "utf8");
  var temiz = ayikla(src);
  var satirlar = temiz.split("\n"), bulgular = [];
  satirlar.forEach(function (s, i) {
    YASAK.forEach(function (y) { if (y.re.test(s)) bulgular.push((i + 1) + ": " + y.ad + " → " + src.split("\n")[i].trim().slice(0, 80)); });
  });
  var ad = path.relative(path.join(__dirname, ".."), p);
  ok(ad + ": ES5+/ES6 kullanimi yok", bulgular.length === 0, bulgular.slice(0, 5).join(" | "));
  var sozdizimi = true;
  try { new Function(src); } catch (e) { sozdizimi = e.message; }
  ok(ad + ": sozdizimi gecerli", sozdizimi === true, sozdizimi);
});

// denetleyicinin kendisi: bilinen ihlalleri yakaliyor, metin/yorum icindekileri yakalamiyor
var ornek = ayikla("var a = 'x.forEach(1)'; // let b = 1\n/* => */ var r = /a,]/; arr.forEach(f);\nvar o = {a:1,};");
ok("denetleyici: metin/yorum/regex icini yok sayar, gercek ihlali bulur",
  !/let|=>/.test(ornek.split("\n")[0]) && /\.forEach\s*\(/.test(ornek.split("\n")[1]) && /,\s*}/.test(ornek.split("\n")[2]));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
