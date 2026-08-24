var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (evidence === undefined ? "" : "   [" + String(evidence).slice(0, 240) + "]")); }
}

function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", {
  get: function () { return String(Math.round(this.seconds * 254016000000)); }
});
function FakeFile(filePath) {
  this.fsName = String(filePath || "");
  this.name = path.basename(this.fsName);
  this.exists = /\.mogrt$/i.test(this.fsName);
}

var rawText = JSON.stringify({
  textEditValue: "PLACEHOLDER",
  fontTextRunLength: [11],
  fontTextRunStart: [0]
});
var textProp = {
  displayName: "Text",
  getValue: function () { return rawText; },
  setValue: function (value, updateUI) { rawText = value; this.updateUI = updateUI; }
};
var props = {
  numItems: 1,
  0: textProp,
  getParamForDisplayName: function (name) { return name === "Text" ? textProp : null; }
};
var component = { properties: props };
var clips = { numItems: 0 };
function reindex(items) {
  Object.keys(clips).forEach(function (key) { if (/^\d+$/.test(key)) delete clips[key]; });
  clips.numItems = items.length;
  items.forEach(function (item, index) { clips[index] = item; });
}
var clipItems = [];
var track = { clips: clips, isLocked: function () { return false; } };
var importedAt = "";
var sequence = {
  name: "MOGRT Test",
  videoTracks: { numTracks: 1, 0: track },
  importMGT: function (filePath, ticks, videoTrack) {
    importedAt = String(ticks);
    var clip = {
      name: "Template",
      start: { seconds: Number(ticks) / 254016000000 },
      end: { seconds: Number(ticks) / 254016000000 + 5 },
      getMGTComponent: function () { return component; },
      remove: function () {
        clipItems = clipItems.filter(function (item) { return item !== clip; });
        reindex(clipItems);
      }
    };
    clipItems.push(clip);
    reindex(clipItems);
    return clip;
  }
};
var context = {
  app: {
    version: "26.0",
    project: { name: "test.prproj", activeSequence: sequence },
    enableQE: function () {}
  },
  Time: FakeTime,
  File: FakeFile,
  Folder: function () {},
  Math: Math,
  Number: Number,
  String: String,
  Error: Error,
  isFinite: isFinite,
  decodeURIComponent: decodeURIComponent,
  encodeURIComponent: encodeURIComponent,
  JSON: JSON,
  $: { sleep: function () {} }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), context, { filename: "jsx/host.jsx" });

function call(name, value) {
  return JSON.parse(context[name](encodeURIComponent(JSON.stringify(value || {}))));
}

var prep = call("KS_prepareCaptionMogrt", { path: "C:\\Templates\\9.16 Mr Beast Subtitles.mogrt", start: 1.25, end: 3.5 });
ok("MOGRT altyazisi icin bos video katmani hazirlanir", prep.ok && prep.track === 0 && prep.trackName === "V1", JSON.stringify(prep));

var placed = call("KS_placeCaptionMogrt", {
  path: "C:\\Templates\\9.16 Mr Beast Subtitles.mogrt",
  track: 0,
  batch: "cap-test",
  start: 1.25,
  end: 3.5,
  text: "Bunu mutlaka gör"
});
var parsedText = JSON.parse(rawText);
ok("MOGRT altyazi sablonu cue baslangicina yerlestirilir", placed.ok && importedAt === String(Math.round(1.25 * 254016000000)), JSON.stringify(placed));
ok("Cue metni MOGRT Text kontrolune yazilir", parsedText.textEditValue === "Bunu mutlaka gör" && parsedText.fontTextRunLength[0] === 16, rawText);
ok("MOGRT klibi cue bitis zamanina kirpilir", placed.end === 3.5 && clipItems[0].end.seconds === 3.5, JSON.stringify(placed));
ok("MOGRT altyazi klibi geri alma grubu icin adlandirilir", clipItems[0].name === "Suflo Caption · cap-test", clipItems[0].name);

var removed = call("KS_removeCaptionMogrtBatch", { batch: "cap-test" });
ok("Yarim kalan MOGRT altyazi grubu guvenle temizlenir", removed.ok && removed.removed === 1 && clips.numItems === 0, JSON.stringify(removed));

var captions = fs.readFileSync(path.join(ROOT, "js", "captions.js"), "utf8");
ok("MOGRT seciliyken libass emoji bekcisi bu yolu engellemez", /if \(!secilenMogrt && emojiIceriyorMu\(\)\)/.test(captions));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
