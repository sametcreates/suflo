// Suflo testi: panel kodunun basvurdugu yerel gorseller gercekten var mi?
// (2.9.8'de onizlemeler 001-* olarak yeniden adlandirildi; Pro satis penceresi
// eski 01-* adlarina bakip bos gorsel gosteriyordu)
var fs = require("fs"), path = require("path");
var ROOT = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

var dosyalar = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /\.js$/.test(f); })
  .map(function (f) { return path.join("js", f); }).concat(["index.html", "css/style.css"]);
var eksik = [], sayi = 0;
dosyalar.forEach(function (rel) {
  var src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  var re = /(?:^|["'(\s])((?:assets|emoji|fonts|brand)\/[A-Za-z0-9_./-]+\.(?:webp|webm|png|jpg|jpeg|svg|gif|ttf|json))/g, m;
  while ((m = re.exec(src))) {
    sayi++;
    if (!fs.existsSync(path.join(ROOT, m[1]))) eksik.push(rel + " -> " + m[1]);
  }
});
ok("panelin basvurdugu yerel varliklar tarandi", sayi > 0, sayi + " basvuru");
ok("eksik yerel varlik yok", eksik.length === 0, eksik.join(" | "));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
