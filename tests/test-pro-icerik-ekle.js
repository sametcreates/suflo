// Suflo testi: tools/pro-icerik-ekle.js (canlı Pro kataloğunu silmeden ek paket). Geçici klasörlerle gerçek çalıştırma:
//  - var olan kayıtlar aynen kalır, yalnız yeni izinli dosyalar eklenir (after-effects/, manifest.json gibiler alınmaz)
//  - aynı yol + aynı özet atlanır; aynı yol + farklı içerik ya da yalnız harf farkı reddedilir; aynı sürüm reddedilir
//  - çıktı manifest'i js/pro-sync.js validateManifest kurallarından geçer; ZIP oluşur
var fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), crypto = require("crypto");
var KOK = path.join(__dirname, "..");
var ARAC = path.join(KOK, "tools", "pro-icerik-ekle.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 400) + "]" : "")); }
function sha(b) { return crypto.createHash("sha256").update(b).digest("hex"); }
function yaz(p, icerik) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, icerik); }

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-pro-ek-"));
var SURUM = "test-ek-" + process.pid;
var OUT = path.join(KOK, "dist", "pro-ek-test-" + process.pid);
var ZIP = path.join(KOK, "dist", "Suflo-Pro-Ek-" + SURUM + ".zip");
function calistir(manifest, ek, surum) {
  return cp.spawnSync(process.execPath, [ARAC, manifest, ek, surum, OUT], { encoding: "utf8" });
}
try {
  var eskiMogrt = Buffer.from("eski mogrt"), eskiSfx = Buffer.from("eski ses");
  var manifest = path.join(tmp, "manifest.json");
  fs.writeFileSync(manifest, JSON.stringify({ schema: 1, content_version: "2026.11.01.1", files: [
    { path: "mogrt/Text Animations/A.mogrt", bytes: eskiMogrt.length, sha256: sha(eskiMogrt) },
    { path: "sfx/Whoosh/a.wav", bytes: eskiSfx.length, sha256: sha(eskiSfx) }] }));
  var ek = path.join(tmp, "ek");
  yaz(path.join(ek, "mogrt", "AutoCaptions Captions", "SUFLO MOGRT - AutoCaptions Azul.mogrt"), "azul");
  yaz(path.join(ek, "presets", "AutoCaptions", "AC.prfpset"), "preset");
  yaz(path.join(ek, "mogrt", "Text Animations", "A.mogrt"), eskiMogrt);          // katalogda aynısı var: atlanır
  yaz(path.join(ek, "after-effects", "ffx", "x.ffx"), "ffx");                     // izinsiz tür: alınmaz
  yaz(path.join(ek, "manifest.json"), "{}");

  var r = calistir(manifest, ek, SURUM);
  ok("ek paket: araç başarıyla biter, ZIP oluşur", r.status === 0 && fs.existsSync(ZIP), r.stderr || r.stdout);
  var m = r.status === 0 ? JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8")) : { files: [] };
  var yollar = m.files.map(function (f) { return f.path; });
  ok("ek paket: eski kayıtlar aynen kalır, yalnız 2 yeni izinli dosya eklenir (AE / manifest alınmaz)",
    m.content_version === SURUM && m.files.length === 4 &&
    yollar.indexOf("sfx/Whoosh/a.wav") !== -1 && yollar.indexOf("mogrt/Text Animations/A.mogrt") !== -1 &&
    yollar.indexOf("mogrt/AutoCaptions Captions/SUFLO MOGRT - AutoCaptions Azul.mogrt") !== -1 &&
    yollar.indexOf("presets/AutoCaptions/AC.prfpset") !== -1 && !yollar.some(function (p) { return /ffx|after-effects|manifest/.test(p); }),
    JSON.stringify(yollar));
  ok("ek paket: content/ yalnız yeni dosyaları taşır, sayılar ve toplam bayt doğru",
    fs.existsSync(path.join(OUT, "content", "presets", "AutoCaptions", "AC.prfpset")) &&
    !fs.existsSync(path.join(OUT, "content", "mogrt", "Text Animations", "A.mogrt")) &&
    m.counts && m.counts.mogrt === 2 && m.counts.sfx === 1 && m.counts.presets === 1 && m.counts.total === 4 &&
    m.total_bytes === m.files.reduce(function (s, f) { return s + f.bytes; }, 0), JSON.stringify(m.counts));
  // js/pro-sync.js istemci doğrulaması (sunucu yanıtı biçiminde)
  var PS = fs.readFileSync(path.join(KOK, "js", "pro-sync.js"), "utf8");
  var gecerli = /function safeItem\(item\)/.test(PS) && m.files.every(function (f) {
    return /^(mogrt\/.+\.mogrt|sfx\/.+\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)|motionbg\/.+\.(mp4|mov|m4v|webm)|presets\/.+\.prfpset)$/i.test(f.path) &&
      /^[a-f0-9]{64}$/.test(f.sha256) && f.bytes > 0;
  });
  ok("ek paket: her kayıt istemcinin izinli tür / özet / boyut kuralına uyar", gecerli);

  var rt = cp.spawnSync(process.execPath, [ARAC, manifest, ek, SURUM, OUT, "--tur=mogrt"], { encoding: "utf8" });
  var mt = rt.status === 0 ? JSON.parse(fs.readFileSync(path.join(OUT, "manifest.json"), "utf8")) : { files: [] };
  ok("ek paket: --tur=mogrt yalnız MOGRT ekler (.prfpset girmez)", rt.status === 0 && mt.files.length === 3 &&
    !mt.files.some(function (f) { return /^presets\//.test(f.path); }), rt.stderr || JSON.stringify(mt.files.map(function (f) { return f.path; })));
  // Sağlık denetimi Suflo Smooth paketini adıyla seçer: AutoCaptions gibi alfabede önce gelen bir .prfpset onu gölgelemez
  var LH = fs.readFileSync(path.join(KOK, "js", "library-health.js"), "utf8");
  ok("sağlık denetimi: preset paketi KPresets.packs()[0].file adıyla seçilir (presetItems[0] değil)",
    /KPresets\.packs\(\)\[0\]\.file/.test(LH) && /paketKaydi\.path/.test(LH) && !/presetItems\[0\]\.path/.test(LH));
  var r2 = calistir(manifest, ek, "2026.11.01.1");
  ok("ek paket: yeni sürüm eskisiyle aynıysa reddedilir", r2.status !== 0 && /ayni/i.test(r2.stderr), r2.stderr);
  yaz(path.join(ek, "mogrt", "Text Animations", "A.mogrt"), "baska icerik");
  var r3 = calistir(manifest, ek, SURUM);
  ok("ek paket: katalogdaki yolu farklı içerikle ezmez", r3.status !== 0 && /farkli icerik/i.test(r3.stderr), r3.stderr);
  fs.rmSync(path.join(ek, "mogrt", "Text Animations"), { recursive: true });
  yaz(path.join(ek, "sfx", "WHOOSH", "a.wav"), "harf");
  var r4 = calistir(manifest, ek, SURUM);
  // Windows'ta klasör adı harf duyarsız olabilir; yine de katalogla çakışma reddedilir
  ok("ek paket: yalnız büyük / küçük harfle ayrılan yol reddedilir (Linux sunucuda 404)", r4.status !== 0 && /harf|farkli icerik/i.test(r4.stderr), r4.stderr);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.rmSync(ZIP, { force: true });
}
console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
