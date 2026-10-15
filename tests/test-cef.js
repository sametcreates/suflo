// Suflo testi: panel JS'i Premiere 14.4'teki (CSXS 10 = CEF 74 / Chromium 74, Node 12.3) motorda calisir.
// Chromium 80+ / Node 14+ ile gelen sozdizimi ve API'ler eski Premiere'de paneli tamamen bozar.
var fs = require("fs"), path = require("path");
var ayikla = require("./_ayikla.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var manifest = fs.readFileSync(path.join(__dirname, "..", "CSXS", "manifest.xml"), "utf8");
ok("manifest: en dusuk CSXS 10 / Premiere 14.4 (bu testin varsayimi)", /RequiredRuntime Name="CSXS" Version="10\.0"/.test(manifest) && /Host Name="PPRO" Version="\[14\.4,/.test(manifest));

var YASAK = [
  { re: /\?\.[A-Za-z_$(\[]/, ad: "optional chaining ?. (Chrome 80)" },
  { re: /\?\?/, ad: "?? (Chrome 80)" },
  { re: /(\|\||&&)=/, ad: "mantiksal atama (Chrome 85)" },
  { re: /\.replaceAll\s*\(/, ad: "replaceAll (Chrome 85)" },
  { re: /\.at\s*\(\s*-?\d/, ad: ".at() (Chrome 92)" },
  { re: /\b(structuredClone|Promise\.allSettled|Promise\.any|Object\.hasOwn)\b/, ad: "yeni API (Chrome 76+)" },
  { re: /\.(findLast|findLastIndex)\s*\(/, ad: "findLast (Chrome 97)" },
  { re: /\d_\d/, ad: "sayi ayirici (Chrome 75)" },
  { re: /\bAbortController\b/, ad: "AbortController (Node 15)" }
];
var dizin = path.join(__dirname, "..", "js");
fs.readdirSync(dizin).filter(function (f) { return /\.js$/.test(f) && f !== "CSInterface.js"; }).forEach(function (f) {
  var src = fs.readFileSync(path.join(dizin, f), "utf8");
  var satirlar = ayikla(src).split("\n"), bulgular = [];
  satirlar.forEach(function (s, i) {
    YASAK.forEach(function (y) { if (y.re.test(s)) bulgular.push((i + 1) + ": " + y.ad + " → " + src.split("\n")[i].trim().slice(0, 70)); });
  });
  ok("js/" + f + ": Chromium 74 / Node 12 uyumlu", bulgular.length === 0, bulgular.slice(0, 4).join(" | "));
});
// 3.4 Yapay zekâ köprüsü: panel sunucusu ve kaydı (js/otomasyon*.js) yukarıdaki taramada; stdio shim'i
// (mcp/suflo-mcp.js) Premiere'de değil, kullanıcının Node 18+'inde çalışır: CEF taramasından bilerek hariç
ok("MCP panel kodu taranan js/ içinde, shim js/ dışında", ["otomasyon.js", "otomasyon-sunucu.js", "otomasyon-panel.js"].every(function (f) { return fs.existsSync(path.join(dizin, f)); }) &&
  !fs.existsSync(path.join(dizin, "suflo-mcp.js")) && fs.existsSync(path.join(__dirname, "..", "mcp", "suflo-mcp.js")));
var sunucuSrc = ayikla(fs.readFileSync(path.join(dizin, "otomasyon-sunucu.js"), "utf8"));
ok("MCP sunucusu Node 12.3'te olan API'lerle: timingSafeEqual, randomBytes, Buffer.from; async/await yok", /timingSafeEqual/.test(sunucuSrc) && /randomBytes\(32\)/.test(sunucuSrc) &&
  !/\basync\b|\bawait\b|\bclass\b|=>/.test(sunucuSrc) && !/\b(let|const)\s/.test(sunucuSrc));
// Node 14+ fs API'leri yalniz yedekli kullanilir (ornegin fs.rmSync -> rmrf yedegi)
var yedeksiz = [];
fs.readdirSync(dizin).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
  ayikla(fs.readFileSync(path.join(dizin, f), "utf8")).split("\n").forEach(function (s, i) {
    if (/\.(rmSync|cpSync)\s*\(/.test(s) && !/\.(rmSync|cpSync)\s*\?|typeof [\w.]*\.(rmSync|cpSync)|if \([\w.]*\.(rmSync|cpSync)\)/.test(s)) yedeksiz.push(f + ":" + (i + 1));
  });
});
ok("fs.rmSync/cpSync yalniz yedekle (Node 12'de yok)", yedeksiz.length === 0, yedeksiz.join(", "));
var ornek = ayikla("var x = a ? .5 : 1; var s = 'a?.b'; // a ?? b\nvar y = o?.p;");
ok("denetleyici: uclu ?.5 ve metin/yorum yanlis alarm vermez, gercek ?. bulunur", !YASAK[0].re.test(ornek.split("\n")[0]) && !YASAK[1].re.test(ornek.split("\n")[0]) && YASAK[0].re.test(ornek.split("\n")[1]));

// rmrf: Node 12.3'teki gibi fs.rmSync ve rmdirSync({recursive}) yokken de klasoru siler
var os = require("os");
var bsrc = fs.readFileSync(path.join(__dirname, "..", "js", "bridge.js"), "utf8").replace(/\r\n/g, "\n");   // Windows CRLF
var bi = bsrc.indexOf("  function rmrf(p) {"), bj = bsrc.indexOf("\n  }\n", bi) + 4;
var eskiFs = { lstatSync: fs.lstatSync, unlinkSync: fs.unlinkSync, readdirSync: fs.readdirSync,
  rmdirSync: function (p, o) { if (o && o.recursive) throw new Error("Node 12.3: recursive yok"); return fs.rmdirSync(p); } };
var rmrf = new Function("fs", "path", bsrc.slice(bi, bj) + "\nreturn rmrf;")(eskiFs, path);
var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-rmrf-"));
fs.mkdirSync(path.join(kok, "a", "b"), { recursive: true });
fs.writeFileSync(path.join(kok, "a", "b", "x.txt"), "1");
fs.writeFileSync(path.join(kok, "y.txt"), "2");
rmrf(kok);
ok("rmrf: Node 12.3 API'leriyle ic ice klasoru siler", !fs.existsSync(kok));
rmrf(path.join(kok, "yok"));
ok("rmrf: olmayan yol hata vermez", true);
var kullanim = ["app.js", "engine.js"].every(function (f) { return /K\.rmrf\(/.test(fs.readFileSync(path.join(dizin, f), "utf8")); });
ok("guncelleme ve motor kurulumu K.rmrf kullanir", kullanim);


// CSS: inset (Chrome 87) her kullanimda uzun bicim yedegiyle (top/right/bottom/left)
var css = fs.readFileSync(path.join(__dirname, "..", "css", "style.css"), "utf8").replace(/\r\n/g, "\n");
var insetSatirlari = css.split("\n").filter(function (l) { return /(^|[;{\s])inset:/.test(l); });
var yedeksizInset = insetSatirlari.filter(function (l) { return !/top:[^;]+;\s*right:[^;]+;\s*bottom:[^;]+;\s*left:[^;]+;\s*inset:/.test(l); });
ok("CSS inset: eski motor icin uzun bicim yedegi var", insetSatirlari.length > 0 && yedeksizInset.length === 0, yedeksizInset.slice(0, 3).join(" | "));


// Tum CSS kaynaklari (style.css, index.html <style>, JS icinde uretilen CSS): CEF 74'te olmayan
// inset (87) ve min()/max()/clamp() (79) her kuralda eski motor icin sade bir yedekle gelmeli
var kaynaklar = [["css/style.css", fs.readFileSync(path.join(__dirname, "..", "css", "style.css"), "utf8")],
  ["index.html", fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")]];
fs.readdirSync(dizin).filter(function (f) { return /\.js$/.test(f) && f !== "CSInterface.js"; }).forEach(function (f) {
  // JS'te yalniz metin sabitleri (uretilen CSS orada); nesne sabitleri CSS sanilmasin
  var js = fs.readFileSync(path.join(dizin, f), "utf8");
  var metinler = js.match(/'(?:[^'\\\n]|\\.)*'/g) || [];
  kaynaklar.push(["js/" + f, metinler.map(function (x) { return x.slice(1, -1); }).join("")]);
});
var cssSorun = [];
kaynaklar.forEach(function (k) {
  var re = /\{([^{}]*)\}/g, m;
  while ((m = re.exec(k[1]))) {
    var bildirimler = m[1].replace(/\/\*[\s\S]*?\*\//g, "").split(";").map(function (d) { return d.trim(); }).filter(Boolean);
    var gorulen = {};
    bildirimler.forEach(function (d) {
      var c = d.indexOf(":"); if (c < 0) return;
      var ozellik = d.slice(0, c).trim().toLowerCase(), deger = d.slice(c + 1).trim();
      if (!/^[a-z-]+$/.test(ozellik)) return;
      var modern = /(^|[^a-z])(min|max|clamp)\(/.test(deger.replace(/minmax\(/g, ""));
      if (ozellik === "inset" && !gorulen.left) cssSorun.push(k[0] + ": inset yedeksiz → " + d.slice(0, 50));
      else if (modern && !gorulen[ozellik]) cssSorun.push(k[0] + ": " + ozellik + " yedeksiz → " + d.slice(0, 50));
      if (!modern) gorulen[ozellik] = true;
    });
  }
});
ok("CSS (dosya + HTML + JS): inset ve min()/max()/clamp() yedekli", cssSorun.length === 0, cssSorun.slice(0, 4).join(" | "));
// Pro'yu dene satırları (Ayarlar › Suflo Pro): flex gap (Chrome 84) ve overflow-wrap:anywhere (80)
// CEF 74'te yok — düğmeler bitişik kalıyor, uzun sekans adı panelden taşıyordu (inceleme bulgusu)
var denemeKurallari = [], kre = /([^{}]*(?:pro-deneme|pro-temiz)[^{}]*)\{([^{}]*)\}/g, km;
while ((km = kre.exec(css))) denemeKurallari.push({ secici: km[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), govde: km[2] });
var denemeCssSorun = denemeKurallari.filter(function (k) {
  return (/display:\s*(inline-)?flex/.test(k.govde) && /(^|[;\s])(row-|column-)?gap:/.test(k.govde)) || /overflow-wrap:\s*anywhere/.test(k.govde);
}).map(function (k) { return k.secici; });
ok("Pro'yu dene CSS: flex gap ve overflow-wrap:anywhere yok (CEF 74)", denemeKurallari.length >= 6 && denemeCssSorun.length === 0, denemeKurallari.length + " kural · " + denemeCssSorun.join(" | "));
// Canlı transkripsiyon ve İptal düğmeleri (3.2 adım 3): aynı kural — CEF 74'te zaman damgası metne,
// nabız noktası "CANLI" yazısına yapışıyordu (inceleme bulgusu)
var canliKurallari = [], cre = /([^{}]*(?:canli-|iptal-btn|kurulum-iptal)[^{}]*)\{([^{}]*)\}/g, cm;
while ((cm = cre.exec(css))) canliKurallari.push({ secici: cm[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), govde: cm[2] });
var canliCssSorun = canliKurallari.filter(function (k) {
  return /(^|[;\s])(row-|column-)?gap:/.test(k.govde) || /overflow-wrap:\s*anywhere/.test(k.govde);
}).map(function (k) { return k.secici; });
ok("Canlı satırlar / İptal CSS: flex gap ve overflow-wrap:anywhere yok (CEF 74)", canliKurallari.length >= 10 && canliCssSorun.length === 0, canliKurallari.length + " kural · " + canliCssSorun.join(" | "));

// Altyazı Efektleri oluşturucusu (3.3): flex gap / overflow-wrap:anywhere yok; gizli onay kutularının odağı
// CEF 74'te de görünür. :focus-visible Chromium 86'da geldi: CEF 74 kuralı tümden atar, gizli input'un
// odağı hiç görünmüyordu (adım 16 inceleme bulgusu). Her "input:focus-visible" kuralının AYRI bir ":focus"
// yedeği olmalı ve :focus-visible başka seçicilerle aynı listede olmamalı (liste tümden düşerdi).
var efektKurallari = [], ere = /([^{}]*(?:efekt)[^{}]*)\{([^{}]*)\}/g, em;
while ((em = ere.exec(css))) efektKurallari.push({ secici: em[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), govde: em[2] });
var efektCssSorun = efektKurallari.filter(function (k) {
  return /(^|[;\s])(row-|column-)?gap:/.test(k.govde) || /overflow-wrap:\s*anywhere/.test(k.govde);
}).map(function (k) { return k.secici; });
ok("Altyazı Efektleri CSS: flex gap ve overflow-wrap:anywhere yok (CEF 74)", efektKurallari.length >= 20 && efektCssSorun.length === 0, efektKurallari.length + " kural · " + efektCssSorun.join(" | "));
var tumSeciciler = [], tre = /([^{}]+)\{[^{}]*\}/g, tm;
while ((tm = tre.exec(css))) tumSeciciler.push(tm[1].replace(/\/\*[\s\S]*?\*\//g, "").trim());
var odakSorun = [];
efektKurallari.forEach(function (k) {
  if (k.secici.indexOf(":focus-visible") === -1 || k.secici.indexOf("input") === -1 || k.secici.indexOf(":not(:focus-visible)") !== -1) return;
  if (k.secici.indexOf(",") !== -1) { odakSorun.push("listede: " + k.secici); return; }
  var yedek = k.secici.replace(":focus-visible", ":focus");
  if (tumSeciciler.indexOf(yedek) === -1) odakSorun.push("yedeksiz: " + k.secici);
});
ok("Altyazı Efektleri: gizli onay kutularının :focus-visible kuralı ayrı bir :focus yedeğiyle (CEF 74)", odakSorun.length === 0 &&
  tumSeciciler.indexOf(".efekt-bi input:focus + span") !== -1 && tumSeciciler.indexOf(".efekt-ayarlar .switch input:focus + i") !== -1, odakSorun.join(" | "));

ok("Tüm .switch anahtarları CEF 74'te klavye odağı gösterir (:focus yedeği + :not(:focus-visible))",
  tumSeciciler.indexOf(".switch input:focus + i") !== -1 && tumSeciciler.indexOf(".switch input:focus:not(:focus-visible) + i") !== -1);

var ornekRegex = ayikla("function f(x){ return /a'b/.test(x); }\nvar y = o?.p;");
ok("denetleyici: return'den sonraki regex metin sanilmaz, arkasindaki kod gorunur", /o\?\.p/.test(ornekRegex.split("\n")[1]));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
