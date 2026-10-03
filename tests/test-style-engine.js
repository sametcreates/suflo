/* Yeni stil motoru: eski captions.js motorundan bagimsiz, dogrudan test edilir. */
var fs = require("fs");
var os = require("os");
var path = require("path");
var cp = require("child_process");
var root = path.join(__dirname, "..");
var engine = require(path.join(root, "js", "style-engine.js"));

var passed = 0, failed = 0;
function ok(name, condition, proof) {
  if (condition) { passed++; console.log("PASS " + name + (proof ? "   [" + proof + "]" : "")); }
  else { failed++; console.log("FAIL " + name + "   [" + String(proof || "?").slice(0, 200) + "]"); }
}

var styles = engine.list();
ok("motor v3 etkin", engine.version === 3, engine.version);
ok("12 bagimsiz stil var (7 klasik + 5 v3.0)", styles.map(function (s) { return s.id; }).join(",") ===
  "mrbeast,capcut,saas,viral,pop,doc,premium,hormozi,neon,daktilo,ziplama,dolgu",
  styles.map(function (s) { return s.id; }).join(","));
ok("has(): bilinen/bilinmeyen stil", engine.has("neon") && !engine.has("yok"));

var expectedFonts = {
  mrbeast: ["ArchivoBlack.ttf", "OFL-ArchivoBlack.txt"],
  capcut: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  saas: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  viral: ["ArchivoBlack.ttf", "OFL-ArchivoBlack.txt"],
  pop: ["Bungee.ttf", "OFL-Bungee.txt"],
  doc: ["Lora.ttf", "OFL-Lora.txt"],
  premium: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  hormozi: ["Anton.ttf", "OFL-Anton.txt"],
  neon: ["BebasNeue.ttf", "OFL-BebasNeue.txt"],
  daktilo: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"],
  ziplama: ["ArchivoBlack.ttf", "OFL-ArchivoBlack.txt"],
  dolgu: ["Montserrat-Bold.ttf", "OFL-Montserrat.txt"]
};
Object.keys(expectedFonts).forEach(function (id) {
  expectedFonts[id].forEach(function (file) {
    ok(id + " dosyasi: " + file, fs.existsSync(path.join(root, "fonts", file)), file);
  });
});

var words = ["BUNU", "GOREN", "HERKES", "SASIRDI"];
var wordCues = words.map(function (word, i) {
  return { start: i * 0.55, end: i * 0.55 + 0.48, text: word };
});
var docCues = [{ start: 0, end: 2.5, text: "Hikâyenin başladığı yer, İstanbul'du." }];
var compiled = {};
styles.map(function (s) { return s.id; }).forEach(function (id) {
  compiled[id] = engine.compile({ styleId: id, cues: id === "doc" ? docCues : wordCues, width: 1280, height: 720 });
  ok(id + " ASS olay uretti", compiled[id].eventCount > 0, compiled[id].eventCount + " olay");
  ok(id + " Turkce metni koruyor", /BUNU|Hikâyenin/.test(compiled[id].ass));
});

ok("viral iki satir + katmanli creator kompozisyonu",
  compiled.viral.eventCount >= 14 && /\\N/.test(compiled.viral.ass) && /\\p1/.test(compiled.viral.ass), compiled.viral.eventCount);
ok("pop sticker + confetti katmanlari",
  compiled.pop.eventCount >= 28 && /\\frz-/.test(compiled.pop.ass) && /\\p1/.test(compiled.pop.ass), compiled.pop.eventCount);
ok("belgesel panel + altin cetvel + metin",
  compiled.doc.eventCount === 5 && /\\move\(/.test(compiled.doc.ass) && /\\p1/.test(compiled.doc.ass), compiled.doc.eventCount);
ok("premium sinematik panel + reveal + cizgiler",
  compiled.premium.eventCount === 5 && /\\clip\(/.test(compiled.premium.ass) && /\\p1/.test(compiled.premium.ass), compiled.premium.eventCount);
ok("creator punch mavi derinlik + sari vurgu + punch hareketi",
  compiled.mrbeast.eventCount >= 12 && /2F8CFF|FF8C2F/i.test(compiled.mrbeast.ass) && /\\t\(/.test(compiled.mrbeast.ass), compiled.mrbeast.eventCount);
ok("capcut kompakt pill + aktif kelime",
  compiled.capcut.eventCount >= 6 && /\\p1/.test(compiled.capcut.ass) && /B8FF5A|5AFFB8/i.test(compiled.capcut.ass), compiled.capcut.eventCount);
ok("saas cam panel + nokta + yumusak hareket",
  compiled.saas.eventCount >= 8 && /\\blur/.test(compiled.saas.ass) && /\\move\(/.test(compiled.saas.ass), compiled.saas.eventCount);
ok("tum stillerin ASS ciktisi birbirinden farkli", new Set(Object.keys(compiled).map(function (k) { return compiled[k].ass; })).size === styles.length);

/* ---- v3.0: satir altyazisi kelime stillerinde dogru bolunur ---- */
var satirlar = [{ start: 0, end: 1.6, text: "Bunu gören herkes şaşırdı" }, { start: 1.7, end: 3.2, text: "İstanbul çok güzel" }];
var bolunmus = engine.splitToWords(satirlar);
ok("splitToWords: 7 kelime, sure korunur", bolunmus.length === 7 && bolunmus[0].start === 0 && Math.abs(bolunmus[3].end - 1.6) < 1e-9 && bolunmus[4].start === 1.7,
  JSON.stringify(bolunmus.map(function (w) { return [w.text, +w.start.toFixed(2), +w.end.toFixed(2)]; })));
ok("splitToWords: satir sonu isaretli", bolunmus[3].lineEnd === true && !bolunmus[2].lineEnd);
var hz = engine.compile({ styleId: "hormozi", cues: satirlar, cueKind: "lines", width: 1280, height: 720 }).ass;
ok("kelime stili gruplari satir sinirini asmaz", !/şaşırdı[^\n]*İstanbul/.test(hz) && /İstanbul/.test(hz));
ok("birikimli cue'dan son kelime", engine.lastWords([{ start: 0, end: 1, text: "bir" }, { start: 1, end: 2, text: "bir iki" }])[1].text === "iki");
ok("dolgu \\kf karaoke etiketleri", /\\kf\d+/.test(compiled.dolgu.ass));
ok("neon bulanik parilti katmani", /\\blur\d/.test(compiled.neon.ass) && /\\1a&HFF&/.test(compiled.neon.ass));
ok("ziplama esneme hareketi", /\\fscx70\\fscy140/.test(compiled.ziplama.ass));

/* ---- v3.0 inceleme duzeltmeleri ---- */
var dikey = [{ start: 0, end: 2, text: "BUNU ASLA KAÇIRMAMALISIN" }];
["hormozi", "neon", "ziplama", "daktilo", "dolgu"].forEach(function (id) {
  // daktilo/dolgu 4+ kelimede boler (satir stili); digerleri 3+
  var girdi = /^(daktilo|dolgu)$/.test(id) ? [{ start: 0, end: 2, text: "Bunu asla kaçırmamalısın arkadaşlar" }] : dikey;
  var d = engine.compile({ styleId: id, cues: girdi, cueKind: "lines", width: 1080, height: 1920 }).ass;
  var fsMax = Math.max.apply(null, (d.match(/\\fs(\d+)/g) || ["\\fs0"]).map(function (x) { return Number(x.slice(3)); }));
  ok(id + " 9:16'da font kisa kenara gore (yukseklige gore buyuyup tasmaz)", fsMax > 0 && fsMax <= engine.preset(id).style.boyut, fsMax);
  ok(id + " cok kelimeli grup iki satira bolunur", /\\N/.test(d));
});
var nAss = compiled.neon.ass;
ok("neon soluk kelime \\1a ile (libass \\1c alfasini yok sayar)", /\\1a&H78&/.test(nAss));
ok("neon parilti katmani \\alpha ile dolguyu acmaz", !/\\alpha&H00&/.test(nAss.split("\n").filter(function (l) { return /^Dialogue: 0,/.test(l); }).join("\n")));
var kac = engine.compile({ styleId: "viral", cues: [{ start: 0, end: 1, text: "a\\Nb {x}" }] }).ass;
ok("kullanici metnindeki ters bolu ASS komutu olmaz", kac.indexOf("a\\Nb") === -1 && kac.indexOf("a\u29F5Nb") !== -1);

var ffmpeg = cp.spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0;
if (!ffmpeg) {
  console.log("(ffmpeg yok - gercek stil renderlari atlandi)");
} else {
  var tmp = path.join(os.tmpdir(), "suflo-style-engine-test");
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmp, { recursive: true });

  Object.keys(compiled).forEach(function (id) {
    var font = engine.preset(id).style.fontFile;
    fs.copyFileSync(path.join(root, "fonts", font), path.join(tmp, font));
    fs.writeFileSync(path.join(tmp, id + ".ass"), compiled[id].ass, "utf8");
    var png = path.join(tmp, id + ".png");
    var r = cp.spawnSync("ffmpeg", ["-y", "-loglevel", "verbose", "-f", "lavfi", "-i",
      "color=c=#111722:s=1280x720:r=25:d=2", "-vf", "ass=" + id + ".ass:fontsdir=.",
      "-ss", "0.7", "-frames:v", "1", png], { cwd: tmp, encoding: "utf8" });
    ok(id + " gercek libass render", r.status === 0 && fs.existsSync(png) && fs.statSync(png).size > 2000,
      r.status + " / " + (fs.existsSync(png) ? fs.statSync(png).size : 0) + " B");
    // libass'in GERCEKTE sectigi font: "fontselect: (Aile, 700, 0) -> secilen". Yalniz dosyanin
    // yuklendigini gormek yetmez — degisken Montserrat yuklenip DejaVu'ya dusuyordu.
    var secimler = String(r.stderr).split(/\r?\n/).filter(function (l) { return /fontselect:/.test(l); });
    var aile = engine.preset(id).style.font.toLowerCase().replace(/\s+/g, "");
    var dogru = secimler.length > 0 && secimler.every(function (l) {
      var hedef = l.split("->")[1] || "";
      return hedef.toLowerCase().replace(/\s+/g, "").indexOf(aile) !== -1;
    });
    ok(id + " kendi fontunu kullaniyor (yedege dusmuyor)", dogru, secimler.join(" | ").slice(0, 180));
  });
  if (process.env.SUFLO_KEEP_STYLE_TEST) console.log("PREVIEW_DIR=" + tmp);
  else try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e2) {}
}

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
