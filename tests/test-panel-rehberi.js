// Suflo testi: "panel menüde görünmüyor" (en sık destek mesajı) panel dışında çözülür:
// site rehberi, Doctor bağlantısı, kurucu son metinleri, README; + yayın denetimi ve yayın betiği örnek klibe izin verir.
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

/* ---- yayın betiği: aynı örnek klip istisnası (yoksa örnekli yayın publish.ps1'de durur) ---- */
var pub = oku("tools/publish.ps1");
var pubDesen = (pub.match(/\$onboardingMedia = '([^']+)'/) || [])[1];
ok("publish.ps1: örnek klip deseni verify-release.ps1 ile aynı", !!pubDesen && pubDesen === desen, pubDesen);
var kapi = pub.match(/\$_ -match '\(\^\|\/\)dist\/' -or \(\$_ -match '([^']+)' -and \$_ -notmatch \$onboardingMedia\) -or \$_ -match '([^']+)'/);
ok("publish.ps1: ses yasağı örnek klibi dışarıda tutar", !!kapi, kapi && kapi[0]);
if (kapi && pubDesen) {
  var sesRe = new RegExp(kapi[1], "i"), ornekRe = new RegExp(pubDesen, "i"), digerRe = new RegExp(kapi[2], "i");
  var yasakMi = function (f) { return /(^|\/)dist\//i.test(f) || (sesRe.test(f) && !ornekRe.test(f)) || digerRe.test(f); };
  ok("publish.ps1: assets/onboarding mp4/wav/mp3 stage edilebilir", !yasakMi("assets/onboarding/ornek-tr.wav") && !yasakMi("assets/onboarding/ornek-tr.mp3") &&
    !yasakMi("assets/onboarding/ornek-tr.mp4") && !yasakMi("assets/onboarding/ornek.json"));
  ok("publish.ps1: başka ses, alt klasör, p12, dist, config.php yine yasak", yasakMi("content/sfx/a.wav") && yasakMi("assets/pro-sfx-showcase/x.mp3") &&
    yasakMi("assets/onboarding/alt/x.wav") && yasakMi("imza.p12") && yasakMi("dist/Suflo.zip") && yasakMi("server/pro-v1/config.php"));
}

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
