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
ok("motor v2 etkin", engine.version === 2, engine.version);
ok("dort bagimsiz stil var", styles.map(function (s) { return s.id; }).join(",") === "viral,pop,doc,premium",
  styles.map(function (s) { return s.id; }).join(","));

var expectedFonts = {
  viral: ["ArchivoBlack.ttf", "OFL-ArchivoBlack.txt"],
  pop: ["Bungee.ttf", "OFL-Bungee.txt"],
  doc: ["Lora.ttf", "OFL-Lora.txt"],
  premium: ["Montserrat.ttf", "OFL-Montserrat.txt"]
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
["viral", "pop", "doc", "premium"].forEach(function (id) {
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
ok("dort stilin ASS ciktisi birbirinden farkli", new Set(Object.keys(compiled).map(function (k) { return compiled[k].ass; })).size === 4);

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
    ok(id + " kendi fontunu kullaniyor", String(r.stderr).toLowerCase().indexOf(engine.preset(id).style.font.toLowerCase()) !== -1,
      engine.preset(id).style.font);
  });
  if (process.env.SUFLO_KEEP_STYLE_TEST) console.log("PREVIEW_DIR=" + tmp);
  else try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e2) {}
}

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
