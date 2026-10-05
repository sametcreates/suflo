// Suflo testi: davet odullerinin surum esigi ile paket surumu birbirinden habersiz kaymasin.
// Sunucu manifest.extras.davet ve ref kademeli tokeni yalniz esik surumden itibaren gonderir;
// tools/verify-release.ps1 manifest surumu esigin altindaysa yayini durdurur. Bu test o kapinin
// sunucudaki satiri gercekten yakaladigini ve panelin bildirdigi surumun manifestle ayni oldugunu denetler.
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }
function oku(p) { return fs.readFileSync(path.join(KOK, p), "utf8"); }
function surumKarsilastir(a, b) {
  var x = String(a).split("."), y = String(b).split(".");
  for (var i = 0; i < Math.max(x.length, y.length); i++) {
    var d = (Number(x[i]) || 0) - (Number(y[i]) || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

var verify = oku("tools/verify-release.ps1");
var php = oku("server/pro-v1/index.php");
var mf = oku("CSXS/manifest.xml");
var br = oku("js/bridge.js");

// PowerShell tek tirnakli dizgesi: '' -> '
var m = verify.match(/\$esik = \[regex\]::Match\(\(Get-Content -Raw -LiteralPath \$serverPhp\), '((?:[^']|'')+)'\)/);
ok("verify-release.ps1 sunucu esigini okuyan kapiyi icerir", !!m && /\[version\]\$version -lt \[version\]\$esik\.Groups\[1\]\.Value/.test(verify) && /exit 1/.test(verify));
var esik = null;
if (m) {
  var re = new RegExp(m[1].replace(/''/g, "'"));
  var e = php.match(re);
  esik = e && e[1];
}
ok("kapinin deseni sunucudaki extras esigini yakalar", !!esik && /^\d+\.\d+\.\d+$/.test(esik), esik);
var ext = php.slice(php.indexOf("extras"), php.indexOf("extras") + 4000);
ok("esik satiri extras/davet blogunda", !!esik && php.indexOf("version_compare($clientVersion, '" + esik + "', '>=')") !== -1 && /davet/.test(ext));

var surum = (mf.match(/ExtensionBundleVersion="([^"]+)"/) || [])[1];
var kv = (br.match(/var VERSION = "([^"]+)"/) || [])[1];
ok("bridge.js VERSION manifest surumuyle ayni (sunucuya giden client_version)", !!surum && surum === kv, surum + " / " + kv);
// Paket surumu esigin altindaysa karttaki davet odulu vaadi hic gerceklesmez ve verify-release.ps1
// yayini durdurur; bunu yayin gununu beklemeden burada yakala.
ok("paket surumu davet odul esiginde ya da ustunde", !!esik && !!surum && surumKarsilastir(surum, esik) >= 0, surum + " / " + esik);
var ps = oku("js/pro-sync.js");
ok("pro-sync.js manifest isteginde client_version olarak K.VERSION gonderir", /client_version:\s*K\.VERSION/.test(ps));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
