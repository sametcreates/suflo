var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (evidence === undefined ? "" : "   [" + String(evidence).slice(0, 180) + "]")); }
}

var presetCtx = {
  window: {},
  document: { getElementById: function () { return null; } },
  K: { settings: function () { return {}; }, saveSettings: function () {} },
  KApp: { onTab: function () {}, toast: function () {} },
  Pro: { isPro: function () { return false; }, gate: function () { return false; }, on: function () {} },
  console: console,
  Array: Array,
  String: String,
  Number: Number,
  isFinite: isFinite,
  setTimeout: function () {}
};
vm.createContext(presetCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "presets.js"), "utf8"), presetCtx, { filename: "js/presets.js" });
var catalog = presetCtx.window.KPresets.list();
var ids = catalog.map(function (p) { return p.id; });
ok("12 yerlesik Motion preseti var", catalog.length === 12, catalog.length);
ok("preset kimlikleri benzersiz", new Set(ids).size === ids.length, ids.join(","));
ok("Slide, Zoom, Fade ve Vurgu aileleri var", ["slide", "zoom", "fade", "impact"].every(function (g) {
  return catalog.some(function (p) { return p.group === g; });
}));
ok("beklenen amiral presetler katalogda", ["simple-zoom-in", "slide-in-left", "pop-in", "micro-shake"].every(function (id) {
  return ids.indexOf(id) !== -1;
}));

function FakeTime() { this.seconds = 0; }
function FakeProp(value) {
  this.value = value;
  this.keys = [];
}
FakeProp.prototype.getValue = function () { return this.value; };
FakeProp.prototype.setTimeVarying = function (value) { this.timeVarying = value; };
FakeProp.prototype.removeKeyRange = function () { this.keys = []; };
FakeProp.prototype.addKey = function () {};
FakeProp.prototype.setValueAtKey = function (time, value) { this.keys.push({ time: time.seconds, value: value }); };
FakeProp.prototype.setInterpolationTypeAtKey = function () {};

function list(items) {
  var out = { numItems: items.length };
  items.forEach(function (item, i) { out[i] = item; });
  return out;
}
function prop(matchName, displayName, value) {
  var p = new FakeProp(value); p.matchName = matchName; p.displayName = displayName; return p;
}
var position = prop("ADBE Position", "Position", [0.5, 0.5]);
var scale = prop("ADBE Scale", "Scale", 100);
var opacity = prop("ADBE Opacity", "Opacity", 100);
var motion = { matchName: "ADBE Motion", displayName: "Motion", properties: list([position, scale]) };
var opacityComponent = { matchName: "ADBE Opacity", displayName: "Opacity", properties: list([opacity]) };
var clip = { start: { seconds: 2 }, end: { seconds: 7 }, components: list([motion, opacityComponent]) };
var selected = [clip];
var sequence = {
  frameSizeHorizontal: 1920,
  frameSizeVertical: 1080,
  getSelection: function () { return selected; },
  getPlayerPosition: function () { return { seconds: 4 }; }
};
var hostCtx = {
  app: { project: { activeSequence: sequence } },
  Time: FakeTime,
  decodeURIComponent: decodeURIComponent,
  encodeURIComponent: encodeURIComponent,
  isFinite: isFinite,
  Math: Math,
  String: String,
  Number: Number,
  Error: Error,
  File: function () {},
  Folder: function () {}
};
vm.createContext(hostCtx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), hostCtx, { filename: "jsx/host.jsx" });
function apply(id, duration, strength) {
  return JSON.parse(hostCtx.KS_applyMotionPreset(encodeURIComponent(JSON.stringify({ id: id, duration: duration, strength: strength }))));
}

var zoom = apply("simple-zoom-in", .45, 1);
ok("Simple Zoom In secili klibe uygulanir", zoom.ok && zoom.applied === 1, JSON.stringify(zoom));
ok("Zoom In uc anahtar ve temiz final scale uretir", scale.keys.length === 3 && scale.keys[0].value > 100 && scale.keys[2].value === 100, JSON.stringify(scale.keys));

position.keys = []; opacity.keys = [];
var slide = apply("slide-in-left", .45, 1);
ok("Slide In Left Motion ve Opacity anahtari uretir", slide.ok && position.keys.length === 3 && opacity.keys.length === 2);
ok("Slide In Left soldan baslayip asil konuma gelir", position.keys[0].value[0] < .5 && position.keys[2].value[0] === .5, JSON.stringify(position.keys));

opacity.keys = [];
var fade = apply("fade-out", .45, 1);
ok("Fade Out klip sonunda sifir opakliga iner", fade.ok && opacity.keys.length === 2 && opacity.keys[1].time === 7 && opacity.keys[1].value === 0, JSON.stringify(opacity.keys));

var bad = apply("not-a-real-preset", .45, 1);
ok("bilinmeyen preset reddedilir", bad.ok === false && /Bilinmeyen/.test(bad.error), JSON.stringify(bad));
selected = [];
var empty = apply("simple-zoom-in", .45, 1);
ok("secim yoksa anlasilir hata doner", empty.ok === false && /en az bir video klibi/.test(empty.error), JSON.stringify(empty));

var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var src = fs.readFileSync(path.join(ROOT, "js", "presets.js"), "utf8");
ok("Free kullanici preset kartlarini kilitli gorur", /preset-card.*locked/.test(src) && /Pro\.gate\("presets"\)/.test(src));
ok("Preset sekmesi arama hiz guc ve filtre kontrollerini tasir",
  /id="tab-presets"/.test(html) && /id="preset-search"/.test(html) && /id="preset-speed"/.test(html) && /id="preset-strength"/.test(html) && /id="preset-filter"/.test(html));
ok("Preset betigi panel tarafindan yuklenir", /<script src="js\/presets\.js"><\/script>/.test(html));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
