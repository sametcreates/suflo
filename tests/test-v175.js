var KOKYOL = require("path").join(__dirname, "..").split("\\").join("/") + "/";
/* v1.7.5 duzeltmelerinin GERCEK kaynak uzerinden dogrulanmasi */
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var vm = require("vm");

var KOK = KOKYOL + "";
var sonuc = [];
function chk(a, k, e) { sonuc.push((k ? "PASS " : "FAIL ") + a + (e !== undefined ? "   [" + e + "]" : "")); }

/* ---------- 1) CSInterface.getSystemPath platforma gore kirpma ---------- */
function csPath(platform, uri) {
  var sandbox = {
    window: { __adobe_cep__: { getSystemPath: function () { return uri; } } },
    navigator: platform === "mac"
      ? { platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" }
      : { platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0)" },
    decodeURI: decodeURI, RegExp: RegExp, String: String
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(KOK + "js/CSInterface.js", "utf8"), sandbox, { filename: "CSInterface.js" });
  return new sandbox.window.CSInterface().getSystemPath("userData");
}
chk("mac: mutlak yol korunuyor (bastaki / kaybolmuyor)",
  csPath("mac", "file:///Users/samet/Library/Application Support") === "/Users/samet/Library/Application Support",
  csPath("mac", "file:///Users/samet/Library/Application Support"));
chk("windows: surucu harfi dogru",
  csPath("win", "file:///C:/Users/samet/AppData/Roaming") === "C:/Users/samet/AppData/Roaming",
  csPath("win", "file:///C:/Users/samet/AppData/Roaming"));

/* ---------- 2) bundledEpr ayraci ---------- */
function eprYollari(mac, kok) {
  var src = fs.readFileSync(KOK + "js/captions.js", "utf8");
  var i = src.indexOf("function bundledEpr(");
  var body = src.slice(i, src.indexOf("\n  }", i) + 4);
  var f = new Function("K", "CSInterface", body + "; return bundledEpr();");
  return f(
    { MAC: mac, cs: { getSystemPath: function () { return kok; } }, log: function () {} },
    { SystemPath: { EXTENSION: "e" } }
  );
}
var macEpr = eprYollari(true, "/Users/samet/Library/Application Support/Adobe/CEP/extensions/com.sametcreates.kesit");
chk("mac epr: egik cizgi, ters bolu YOK",
  macEpr.length === 2 && macEpr[0].indexOf("\\") === -1 && macEpr[0].charAt(0) === "/", macEpr[0]);
chk("mac epr: dogru dosya adi", /\/jsx\/presets\/wav16k\.epr$/.test(macEpr[0]), macEpr[0]);
var winEpr = eprYollari(false, "C:/Users/samet/AppData/Roaming/Adobe/CEP/extensions/com.sametcreates.kesit");
chk("windows epr: bastan sona ters bolu (Error code 10 korumasi)",
  winEpr[0].indexOf("/") === -1 && /\\jsx\\presets\\wav16k\.epr$/.test(winEpr[0]), winEpr[0]);

/* ---------- 3) wavDuration yalniz basligi okuyor ---------- */
var TMP = pathm.join(os.tmpdir(), "suflo-wav-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });
var wav = pathm.join(TMP, "t.wav");
var byteRate = 32000;                       // 16 kHz mono 16-bit
var veri = 32000 * 10;                      // 10 saniye
var buf = Buffer.alloc(44 + veri);
buf.write("RIFF", 0); buf.write("WAVE", 8);
buf.writeUInt32LE(byteRate, 28);
fs.writeFileSync(wav, buf);

var okunanBayt = 0;
var srcC = fs.readFileSync(KOK + "js/captions.js", "utf8");
var wi = srcC.indexOf("function wavDuration(");
var wbody = srcC.slice(wi, srcC.indexOf("\n  }", wi) + 4);
var sahteFs = {
  statSync: fs.statSync,
  openSync: fs.openSync,
  closeSync: fs.closeSync,
  readSync: function (fd, b, off, len, pos) { okunanBayt += len; return fs.readSync(fd, b, off, len, pos); },
  readFileSync: function (p) { okunanBayt += fs.statSync(p).size; return fs.readFileSync(p); }
};
var wf = new Function("K", "require", wbody + "; return wavDuration;");
var wavDuration = wf({ fs: sahteFs, log: function () {} }, require);
var sure = wavDuration(wav);
chk("wav suresi dogru (10 sn)", Math.abs(sure - 10) < 0.01, sure);
chk("SADECE 44 bayt okundu (tum dosya degil)", okunanBayt === 44,
  okunanBayt + " bayt okundu / dosya " + (44 + veri) + " bayt");
chk("olmayan dosyada cokmuyor", wavDuration(pathm.join(TMP, "yok.wav")) === 0);

/* ---------- 4) tryCap katiligi (host.jsx mantigi) ---------- */
var hsrc = fs.readFileSync(KOK + "jsx/host.jsx", "utf8");
var ti = hsrc.indexOf("function tryCap(");
var tbody = hsrc.slice(ti, hsrc.indexOf("\n    }", ti) + 6);
function tryCapIle(donus) {
  var f = new Function("seq", "item", tbody + "; return tryCap(undefined);");
  return f({ createCaptionTrack: function () { return donus; } }, {});
}
chk("tryCap: false -> basarisiz", tryCapIle(false) === false);
chk("tryCap: undefined -> basarisiz (ESKIDEN basarili sayiliyordu)", tryCapIle(undefined) === false);
chk("tryCap: null -> basarisiz", tryCapIle(null) === false);
chk("tryCap: true -> basarili", tryCapIle(true) === true);
chk("tryCap: nesne -> basarili", tryCapIle({ id: 1 }) === true);

/* ---------- 5) Kurulum betikleri Premiere 2026 (CSXS 13/14) ---------- */
var ps1 = fs.readFileSync(KOK + "tools/install.ps1", "utf8");
chk("install.ps1 CSXS 13/14 kapsiyor", /9\.\.14/.test(ps1), (ps1.match(/9\.\.\d+/) || [])[0]);
if (fs.existsSync(KOK + "tools/install.sh")) {
  var sh = fs.readFileSync(KOK + "tools/install.sh", "utf8");
  chk("install.sh CSXS 13/14 kapsiyor", /13 14/.test(sh), (sh.match(/for v in [\d ]+/) || [])[0]);
}

/* ---------- 6) Gizlilik ---------- */
var bsrc = fs.readFileSync(KOK + "js/bridge.js", "utf8");
chk("proxy ham adresi loglanmiyor", bsrc.indexOf('dogrudan baglaniliyor: " + raw') === -1);
chk("ceviri uyarisi arayuzde var",
  /altyazı metni[\s\S]{0,80}sağlayıcıya/.test(fs.readFileSync(KOK + "index.html", "utf8")));
chk("README ceviri istisnasini soyluyor",
  /çeviri özelliği/i.test(fs.readFileSync(KOK + "README.md", "utf8")));

/* ---------- 7) host.jsx mac epr taramasi ---------- */
chk("KS_findWavEpr mac koklerini tariyor", /\/Applications/.test(hsrc), "");
chk("KS_findWavEpr .app paketine iniyor", /\.app\$\/i|\\.app\$/.test(hsrc) && /Contents/.test(hsrc));

console.log(sonuc.join("\n"));
var f2 = sonuc.filter(function (x) { return x.indexOf("FAIL") === 0; }).length;
console.log("\n" + (sonuc.length - f2) + "/" + sonuc.length + " gecti");
process.exit(f2 ? 1 : 0);
