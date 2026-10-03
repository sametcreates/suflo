// Suflo testi: "panel menüde görünmüyor" (en sık destek mesajı) panel dışında çözülür:
// site rehberi, Doctor bağlantısı, kurucu son metinleri, README; + yayın denetimi örnek klibe izin verir.
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 220) + "]" : "")); }
function oku(rel) { return fs.readFileSync(path.join(KOK, rel), "utf8"); }

var SLUG = "premiere-suflo-paneli-gorunmuyor";
var URL = "https://suflo.app/blog/" + SLUG;

/* ---- site ---- */
var sayfa = oku("docs/blog/" + SLUG + ".html");
var baslik = (sayfa.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
var aciklama = (sayfa.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "";
ok("rehber sayfası: başlık ≤ 60, açıklama 120-160", baslik.length > 20 && baslik.length <= 60 && aciklama.length >= 120 && aciklama.length <= 160, baslik.length + " / " + aciklama.length);
ok("rehber sayfası: canonical ve og:url doğru", sayfa.indexOf('<link rel="canonical" href="' + URL + '">') !== -1 && sayfa.indexOf('og:url" content="' + URL + '"') !== -1);
ok("rehber sayfası: 25.6+/2026 ve eski sürüm yolu", /Window &gt; Extensions \(Legacy\) &gt; Suflo/.test(sayfa) && /Window &gt; Extensions &gt; Suflo/.test(sayfa));
var ld = sayfa.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
var ldOk = false, sss = 0;
try { var g = JSON.parse(ld[1])["@graph"]; ldOk = true; sss = g.filter(function (x) { return x["@type"] === "FAQPage"; })[0].mainEntity.length; } catch (e) {}
ok("rehber sayfası: geçerli JSON-LD + en az 4 SSS", ldOk && sss >= 4, sss);
ok("blog dizini ve site haritası yeni sayfayı gösteriyor", oku("docs/blog/index.html").indexOf('href="/blog/' + SLUG + '"') !== -1 && oku("docs/sitemap.xml").indexOf("<loc>" + URL + "</loc>") !== -1);

/* ---- panel: Suflo Doctor ---- */
var lh = oku("js/library-health.js");
ok("Suflo Doctor rehbere bağlanır (kart düğmesi + rapor satırı)", lh.indexOf('var PANEL_REHBERI = "' + URL + '"') !== -1 && /"Panel menüde görünmüyorsa: " \+ PANEL_REHBERI/.test(lh) &&
  /id="set-doctor-panel-rehberi"/.test(oku("index.html")));

/* ---- kurucu son metinleri + README ---- */
["tools/install.ps1", "tools/install.sh", "tools/kurucu-yap.ps1", "tools/kurucu/Suflo-Kur.bat", "tools/kurucu/Suflo-Kur.command", "README.md"].forEach(function (f) {
  var src = oku(f);
  ok(f + ": Extensions (Legacy) yolu + rehber bağlantısı", /Extensions \(Legacy\) (\^?>|›) Suflo/.test(src) && /Window (\^?>) Extensions (\^?>) Suflo/.test(src) && src.indexOf(URL) !== -1);
});
ok("install.sh assets klasörünü de kopyalar (örnek klip, vitrinler)", /for item in [^;]*\bassets\b[^;]*; do/.test(oku("tools/install.sh")));

/* ---- yayın denetimi: örnek klip ücretli içerik sayılmaz, ornek.json şart ---- */
var vr = oku("tools/verify-release.ps1");
var desen = (vr.match(/\$onboardingMedia = '([^']+)'/) || [])[1];
ok("verify-release: örnek klip deseni tanımlı", !!desen, desen);
if (desen) {
  var re = new RegExp(desen, "i");  // PowerShell -match büyük/küçük harf duyarsız
  ok("desen: assets/onboarding medyasına izin verir", re.test("assets/onboarding/ornek-tr.mp4") && re.test("panel/assets/onboarding/ornek-tr.WAV") && re.test("panel/assets/onboarding/ornek-tr.mp3"));
  ok("desen: başka klasördeki medya ve alt klasör yine yasak", !re.test("assets/pro-sfx-showcase/x.wav") && !re.test("panel/content/sfx/a.mp3") &&
    !re.test("assets/onboarding/alt/x.mp4") && !re.test("assets/onboarding/ornek.json"));
}
ok("verify-release: ücretli medya denetimi örnek klibi dışarıda tutar", /-and \$_ -notmatch \$onboardingMedia/.test(vr));
ok("verify-release: depoda ya da pakette örnek varsa ornek.json zorunlu", /if \(\$ornekVar -or \$sample\.Count\) \{ \$required \+= '\(\^\|\/\)assets\/onboarding\/ornek\\\.json\$' \}/.test(vr) &&
  /Test-Path -LiteralPath \(Join-Path \$root "assets\\onboarding\\ornek\.json"\) -PathType Leaf/.test(vr));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
