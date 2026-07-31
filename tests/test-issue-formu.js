var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/*
 * "Sorun bildir" dugmesi, GitHub issue formunu URL parametreleriyle onceden doldurur.
 * Bu iki dosya arasinda yazili olmayan bir sozlesme var:
 *   js/app.js  -> hangi alan adlarini ve degerleri gonderiyor
 *   .github/ISSUE_TEMPLATE/hata-bildirimi.yml -> hangi id'ler ve secenekler tanimli
 * Biri degisip digeri kalirsa GitHub parametreyi SESSIZCE yok sayar: kullanici
 * formu bos gorur, biz de sistem/surum bilgisini kaybederiz. Bu test o sozlesmeyi tutar.
 */
var fs = require("fs");

var app = fs.readFileSync(KOKYOL + "js/app.js", "utf8");
var yml = fs.readFileSync(KOKYOL + ".github/ISSUE_TEMPLATE/hata-bildirimi.yml", "utf8");

var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad + (kanit ? "   [" + String(kanit).slice(0, 80) + "]" : "")); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 200) + "]"); }
}

/* ---------- YAML'dan id ve secenekleri cikar (kucuk, amaca ozel ayristirici) ---------- */

var idler = [];
var satirlar = yml.split("\n");
satirlar.forEach(function (l) {
  var m = /^\s{2,}id:\s*(\S+)\s*$/.exec(l);
  if (m) idler.push(m[1]);
});

// "sistem" dropdown'inin secenekleri
function secenekler(idAdi) {
  var i = yml.indexOf("id: " + idAdi);
  if (i === -1) return [];
  var j = yml.indexOf("options:", i);
  if (j === -1) return [];
  var out = [];
  yml.slice(j).split("\n").slice(1).some(function (l) {
    var m = /^\s+-\s+(.*)$/.exec(l);
    if (!m) return /^\s*\w/.test(l);      // options blogu bitti
    var v = m[1].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    out.push(v);
    return false;
  });
  return out;
}

var sistemSecenekleri = secenekler("sistem");

/* ---------- app.js'in URL'e koydugu alan adlari ---------- */

var raporBlok = app.slice(app.indexOf('el("set-report")'), app.indexOf('el("set-report")') + 1400);
var urlAlanlari = [];
var re = /"&(\w+)=" \+ encodeURIComponent|u \+= "&(\w+)="/g, mm;
while ((mm = re.exec(raporBlok)) !== null) urlAlanlari.push(mm[1] || mm[2]);

/* ---------- Sinamalar ---------- */

ok("yml en az bir id tanimliyor", idler.length > 0, idler.join(", "));
ok("gunluk alani var (bildirimin asil degeri)", idler.indexOf("gunluk") !== -1, idler.join(", "));

ok("app.js url alanlari bos degil", urlAlanlari.length > 0, urlAlanlari.join(", "));

// "title" ve "labels" GitHub'in yerlesik parametreleri, sablonda id olarak tanimlanmaz
var YERLESIK = ["title", "labels", "assignees", "projects", "body"];
urlAlanlari.forEach(function (a) {
  if (YERLESIK.indexOf(a) !== -1) {
    ok("url alani '" + a + "' GitHub yerlesigi", true, "id araması muaf");
    return;
  }
  ok("url alani '" + a + "' yml'de tanimli", idler.indexOf(a) !== -1, "yml id'leri: " + idler.join(", "));
});

// app.js'in gonderdigi sistem degerleri
var sistemDegerleri = [];
["Windows", "macOS (Apple Silicon: M1/M2/M3/M4)", "macOS (Intel)"].forEach(function (d) {
  if (raporBlok.indexOf(d) !== -1 || app.indexOf(d) !== -1) sistemDegerleri.push(d);
});

ok("app.js uc sistem degerini de uretiyor", sistemDegerleri.length === 3, sistemDegerleri.join(" | "));

sistemDegerleri.forEach(function (d) {
  ok("sistem degeri yml seceneklerinde birebir var: " + d.slice(0, 30),
    sistemSecenekleri.indexOf(d) !== -1,
    "yml: " + sistemSecenekleri.join(" | "));
});

/*
 * YAML tuzagi: options: altindaki bir secenek iki nokta iceriyor ve tirnaksizsa,
 * YAML onu string degil MAPPING olarak ayristirir; GitHub formu HIC acilmaz.
 * (Diger "- type: dropdown" gibi satirlar mesru mapping'dir, onlara dokunulmaz.)
 */
var tirnaksiz = [];
var optIndent = null;
satirlar.forEach(function (l, i) {
  if (/^\s*options:\s*$/.test(l)) { optIndent = (/^\s*/.exec(l))[0].length; return; }
  if (optIndent === null) return;
  var m = /^(\s+)-\s+(.+)$/.exec(l);
  if (!m || m[1].length <= optIndent) { optIndent = null; return; }   // blok bitti
  var ham = m[2].trim();
  if (/:\s/.test(ham) && !/^["']/.test(ham)) tirnaksiz.push((i + 1) + ": " + ham);
});
ok("options altinda tirnaksiz iki nokta YOK", tirnaksiz.length === 0,
  tirnaksiz.length ? tirnaksiz.join(" / ") : "tum secenekler guvenli");

// sablon adi app.js'deki URL ile ayni mi
ok("app.js dogru sablon dosyasini cagiriyor",
  raporBlok.indexOf("template=hata-bildirimi.yml") !== -1,
  (/template=[\w.-]+/.exec(raporBlok) || ["(yok)"])[0]);

console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
process.exit(kaldi ? 1 : 0);
