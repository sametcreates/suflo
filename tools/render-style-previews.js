/* Stil kartlari icin, gercek Suflo Stil Motoru ile WebM onizlemeleri uretir. */
var fs = require("fs");
var path = require("path");
var cp = require("child_process");
var root = path.join(__dirname, "..");
var output = path.join(root, "assets", "style-previews");
var engine = require(path.join(root, "js", "style-engine.js"));
fs.mkdirSync(output, { recursive: true });

var samples = {
  viral: ["BUNU", "SAKIN", "KAÇIRMA"],
  pop: ["POP!", "ŞAK!", "VAY!"],
  premium: ["DAHA", "AZ", "DAHA", "İYİ"]
};

var sahneler = {
  viral: {
    kaynak: "gradients=s=1280x720:r=24:d=2.9:c0=#07182f:c1=#087f9b:c2=#0c2448:n=3:type=radial:x0=340:y0=180:x1=1120:y1=650:speed=.025",
    dekor: "drawgrid=w=128:h=128:t=2:c=white@0.035,drawbox=x=0:y=510:w=1280:h=210:c=#020713@0.32:t=fill,vignette=PI/5",
    crop: "crop=760:428:260:270"
  },
  pop: {
    kaynak: "gradients=s=1280x720:r=24:d=2.9:c0=#30104d:c1=#d23c86:c2=#ff8a4c:c3=#4f36d7:n=4:type=spiral:speed=.018",
    dekor: "drawbox=x=80:y=70:w=220:h=220:c=#ffe45e@0.12:t=fill,drawbox=x=980:y=430:w=250:h=180:c=#45e6ff@0.12:t=fill,vignette=PI/5",
    crop: "crop=760:428:260:150"
  },
  doc: {
    kaynak: "gradients=s=1280x720:r=24:d=2.9:c0=#263a3b:c1=#101b24:c2=#5b6659:n=3:type=linear:x0=0:y0=0:x1=1280:y1=720:speed=.004",
    dekor: "drawbox=x=0:y=410:w=1280:h=310:c=#060b0f@0.28:t=fill,drawbox=x=820:y=0:w=460:h=720:c=#05090d@0.18:t=fill,vignette=PI/4",
    crop: "crop=760:428:0:292"
  },
  premium: {
    kaynak: "gradients=s=1280x720:r=24:d=2.9:c0=#070809:c1=#3e3428:c2=#121418:n=3:type=radial:x0=640:y0=260:x1=1120:y1=650:speed=.006",
    dekor: "drawbox=x=0:y=0:w=1280:h=100:c=#000000@0.22:t=fill,drawbox=x=0:y=620:w=1280:h=100:c=#000000@0.26:t=fill,vignette=PI/4",
    crop: "crop=860:484:210:210"
  }
};

function wordCues(words) {
  var cues = words.map(function (word, i) {
    return { start: 0.18 + i * 0.72, end: 0.78 + i * 0.72, text: word };
  });
  if (cues.length) cues[cues.length - 1].end = 2.72;
  return cues;
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

  // Her kart, gerçek altyazı katmanını ayırt edilebilir bir demo sahnesi üstünde oynatır.
  // Tam 16:9 kare kullanılır; kart ile zaman çizelgesine düşen kompozisyon aynıdır.
  var sahne = sahneler[id];
  var vf = sahne.dekor + ",ass=assets/style-previews/" + assName + ":fontsdir=fonts," + sahne.crop + "," +
    "scale=480:270:flags=lanczos";
  var result = cp.spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i",
    sahne.kaynak, "-vf", vf, "-c:v", "libvpx-vp9",
    "-crf", "34", "-b:v", "0", "-pix_fmt", "yuv420p", "-an", webmPath],
    { cwd: root, encoding: "utf8" });
  try { fs.unlinkSync(assPath); } catch (e) {}
  if (result.status !== 0 || !fs.existsSync(webmPath)) {
    throw new Error(id + " onizlemesi uretilemedi: " + String(result.stderr || "").slice(-400));
  }
  console.log(id + " -> " + path.relative(root, webmPath) + " (" + fs.statSync(webmPath).size + " B)");
});
