/*
 * ASCII-guvenli yol katmani (issue #7 regresyonu).
 *
 * Windows kullanici adinda Turkce karakter varsa ("BASIN TEKNİK") whisper-cli
 * argv'yi ANSI okudugu icin model/ses yolu bozuluyor ve motor kod=3221226505
 * ile cokuyordu. bridge.js'teki guvenliYol() bu yollari 8.3 kisa yola (ayni
 * dosyanin ASCII takma adi) cevirir; 8.3 uretimi kapali diskte girdiyi
 * ProgramData altindaki ASCII onbellege kopyalar.
 *
 * Test gercek diskte Turkce adli klasor kurup gercek cmd/fs ile dogrular.
 */
var fs = require("fs");
var path = require("path");
var os = require("os");
var KOK = path.join(__dirname, "..") + path.sep;

var sonuc = [];
function ok(ad, kosul, ek) {
  sonuc.push((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + ek + "]" : ""));
  if (!kosul) process.exitCode = 1;
}
function asciiMi(s) { return /^[\x00-\x7F]*$/.test(String(s)); }

/* ---- bridge.js'ten yardimcilari cikar (CEP'e bagimli kalmadan) ---- */
var kaynak = fs.readFileSync(KOK + "js" + path.sep + "bridge.js", "utf8");
var a = kaynak.indexOf("function asciiMi");
var b = kaynak.indexOf("// macOS'ta motor Homebrew");
ok("bridge.js icinde guvenliYol blogu var", a > -1 && b > a);

var blok = kaynak.slice(a, b);
var yap = new Function(
  "MAC", "nodeOK", "fs", "path", "cp", "process",
  blok + "\nreturn { asciiMi: asciiMi, kisaYol: kisaYol, asciiKopya: asciiKopya, guvenliYol: guvenliYol, onbellekDir: asciiOnbellekDir };"
);
var Y = yap(false, true, fs, path, require("child_process"), process);

/* ---- gercek Turkce adli klasorde girdi dosyasi ---- */
var turkDir = path.join(os.tmpdir(), "suflo-türkçe-TEKNİK-" + process.pid);
fs.mkdirSync(turkDir, { recursive: true });
var model = path.join(turkDir, "ggml-örnek-model.bin");
var icerik = "suflo-ascii-yol-testi-" + Date.now();
fs.writeFileSync(model, icerik);

var g = Y.guvenliYol(model, "girdi");
ok("girdi yolu ASCII'ye cevrildi", asciiMi(g), g);
ok("cevrilen yol gercek dosyaya gidiyor", fs.existsSync(g));
ok("icerik birebir ayni (ayni dosya ya da birebir kopya)",
  fs.existsSync(g) && fs.readFileSync(g, "utf8") === icerik);

/* ---- cikti tabani: klasor kisalir, dosya ayni fiziksel yere duser ---- */
var outBase = path.join(turkDir, "ses_w");
var c = Y.guvenliYol(outBase, "cikti");
ok("cikti tabani ASCII'ye cevrildi", asciiMi(c), c);
if (asciiMi(c)) {
  fs.writeFileSync(c + ".json", "{\"deneme\":1}");
  ok("kisa yola yazilan cikti UZUN yoldan okunabiliyor (ayni klasor)",
    fs.existsSync(outBase + ".json"));
} else {
  ok("cikti tabani cevrilemedi ama orijinal geri dondu (guvenli geri cekilme)", c === outBase, c);
}

/* ---- ASCII yol oldugu gibi kalir, bos/null patlamaz ---- */
var duz = "C:\\temp\\ses.wav";
ok("ASCII yol degismeden gecer", Y.guvenliYol(duz, "girdi") === duz);
ok("bos deger patlamaz", Y.guvenliYol("", "girdi") === "" && Y.guvenliYol(null, "girdi") === null);

/* ---- engine.js butun yol argumanlarini korumadan geciriyor ---- */
var motor = fs.readFileSync(KOK + "js" + path.sep + "engine.js", "utf8");
ok("engine: model korumali", motor.indexOf('G(o.model, "girdi")') > -1);
ok("engine: ses korumali", motor.indexOf('G(o.audio, "girdi")') > -1);
ok("engine: cikti tabani korumali", motor.indexOf('G(o.outBase, "cikti")') > -1);
ok("engine: VAD modeli korumali", motor.indexOf('G(vp, "girdi")') > -1);
ok("bridge disa aktariyor", kaynak.indexOf("guvenliYol: guvenliYol") > -1);

/* ---- temizlik ---- */
try { fs.rmSync(turkDir, { recursive: true, force: true }); } catch (e) {}
try {
  // test kopya yoluna dustuyse ProgramData onbellegindeki test dosyasini sil
  var ob = Y.onbellekDir();
  fs.readdirSync(ob).forEach(function (f) {
    if (f.indexOf("ggml-_rnek-model") > -1 || f.indexOf(String(icerik.length)) === 0) {
      try { fs.unlinkSync(path.join(ob, f)); } catch (e2) {}
    }
  });
} catch (e3) {}

console.log(sonuc.join("\n"));
console.log(sonuc.filter(function (s) { return s.indexOf("PASS") === 0; }).length + "/" + sonuc.length + " gecti");
