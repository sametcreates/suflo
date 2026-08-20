/* Stil kartlari icin, gercek Suflo Stil Motoru ile WebM onizlemeleri uretir. */
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var root = path.join(__dirname, "..");
var output = path.join(root, "assets", "style-previews");
var engine = require(path.join(root, "js", "style-engine.js"));
fs.mkdirSync(output, { recursive: true });

var samples = {
  viral: ["BUNU", "SAKIN", "KACIRMA"],
  pop: ["POP!", "SAK!", "VAY!"],
  premium: ["DAHA", "AZ", "DAHA", "IYI"]
};

function wordCues(words) {
  return words.map(function (word, i) {
    return { start: 0.18 + i * 0.72, end: 0.78 + i * 0.72, text: word };
  });
}

["viral", "pop", "doc", "premium"].forEach(function (id) {
  var cues = id === "doc"
    ? [{ start: 0.2, end: 2.65, text: "Hikâyenin başladığı yer." }]
    : wordCues(samples[id]);
  var built = engine.compile({ styleId: id, cues: cues, width: 1280, height: 720 });
  var assName = "_" + id + ".ass";
  var assPath = path.join(output, assName);
  var webmPath = path.join(output, id + ".webm");
  fs.writeFileSync(assPath, built.ass, "utf8");

  // Kart tam video karesini değil, altyazının yaşadığı güvenli bandı gösterir.
  // Böylece dar Premiere panelinde yazı küçücük bir nokta haline gelmez.
  var crop = id === "doc"
    ? "crop=720:405:0:315,scale=480:270:flags=lanczos"
    : "crop=960:300:160:270,scale=480:150:flags=lanczos";
  var vf = "ass=assets/style-previews/" + assName + ":fontsdir=fonts," + crop;
  var result = cp.spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i",
    "color=c=#101522:s=1280x720:r=24:d=2.9", "-vf", vf, "-c:v", "libvpx-vp9",
    "-crf", "34", "-b:v", "0", "-pix_fmt", "yuv420p", "-an", webmPath],
    { cwd: root, encoding: "utf8" });
  try { fs.unlinkSync(assPath); } catch (e) {}
  if (result.status !== 0 || !fs.existsSync(webmPath)) {
    throw new Error(id + " onizlemesi uretilemedi: " + String(result.stderr || "").slice(-400));
  }
  console.log(id + " -> " + path.relative(root, webmPath) + " (" + fs.statSync(webmPath).size + " B)");
});
