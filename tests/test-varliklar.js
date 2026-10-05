// Suflo testi: panel kodunun basvurdugu yerel gorseller gercekten var mi?
// (2.9.8'de onizlemeler 001-* olarak yeniden adlandirildi; Pro satis penceresi
// eski 01-* adlarina bakip bos gorsel gosteriyordu)
// + Ilk acilis rehberinin ornek klibi (assets/onboarding): ornek.json varsa listeledigi
//   dosyalar var, her biri 2 MB'tan kucuk ve WAV ffmpeg'siz okunabilir (16 kHz mono PCM).
var fs = require("fs"), path = require("path");
var SO = require(path.join(__dirname, "..", "js", "onboarding-steps.js"));
var ROOT = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : "")); }

var dosyalar = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /\.js$/.test(f); })
  .map(function (f) { return path.join("js", f); }).concat(["index.html", "css/style.css"]);
var eksik = [], sayi = 0;
dosyalar.forEach(function (rel) {
  var src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  var re = /(?:^|["'(\s])((?:assets|emoji|fonts|brand)\/[A-Za-z0-9_./-]+\.(?:webp|webm|png|jpg|jpeg|svg|gif|ttf|json|mp4|wav|mp3))/g, m;
  while ((m = re.exec(src))) {
    sayi++;
    if (!fs.existsSync(path.join(ROOT, m[1]))) eksik.push(rel + " -> " + m[1]);
  }
});
ok("panelin basvurdugu yerel varliklar tarandi", sayi > 0, sayi + " basvuru");
ok("eksik yerel varlik yok", eksik.length === 0, eksik.join(" | "));

/* ---------- Ornek klip (kurucu kaydeder; yoksa rehber "kendi klibinle" moduna duser) ---------- */
var ornekDizin = path.join(ROOT, "assets", "onboarding");
var manifestYolu = path.join(ornekDizin, "ornek.json");
var medya = fs.existsSync(ornekDizin) ? fs.readdirSync(ornekDizin).filter(function (f) { return /\.(mp4|wav|mp3)$/i.test(f); }) : [];
if (!fs.existsSync(manifestYolu)) {
  ok("ornek.json yokken assets/onboarding'de sahipsiz medya yok", medya.length === 0, medya.join(", ") || "ornek klip henuz kaydedilmedi (rehber kendi klibinle calisir)");
} else {
  var ham = null, hata = "";
  try { ham = JSON.parse(fs.readFileSync(manifestYolu, "utf8")); } catch (e) { hata = e.message; }
  var m2 = SO.ornekManifestDogrula(ham);
  ok("ornek.json gecerli", m2.ok, hata || m2.hata || JSON.stringify(m2.dosyalar));
  if (m2.ok) {
    Object.keys(m2.dosyalar).forEach(function (k) {
      var p = path.join(ornekDizin, m2.dosyalar[k]);
      var var_ = fs.existsSync(p);
      ok("ornek dosyasi var: " + m2.dosyalar[k], var_);
      if (var_) {
        var boyut = fs.statSync(p).size;
        ok("ornek dosyasi 2 MB'tan kucuk: " + m2.dosyalar[k], boyut > 0 && boyut < 2 * 1048576, (boyut / 1048576).toFixed(2) + " MB");
      }
    });
    var wavYolu = path.join(ornekDizin, m2.dosyalar.wav);
    if (fs.existsSync(wavYolu)) {
      var b = SO.wavBaslik(fs.readFileSync(wavYolu));
      ok("ornek WAV 16 kHz mono 16-bit PCM (whisper ffmpeg'siz okur)", b.ok && b.uygun, JSON.stringify(b));
    }
    var kelimeYolu = path.join(ornekDizin, m2.dosyalar.words);
    if (fs.existsSync(kelimeYolu)) {
      var veri = SO.ornekKelimeleri(JSON.parse(fs.readFileSync(kelimeYolu, "utf8")));
      ok("hazir transkriptte kelime ve satir var", veri.words.length >= 8 && veri.segments.length >= 1, veri.words.length + " kelime, " + veri.segments.length + " satir");
    }
    var listede = Object.keys(m2.dosyalar).map(function (k) { return m2.dosyalar[k]; });
    var fazla = medya.filter(function (f) { return listede.indexOf(f) === -1; });
    ok("assets/onboarding'de manifestte olmayan medya yok", fazla.length === 0, fazla.join(", "));
  }
}
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
