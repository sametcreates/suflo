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
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "preset-pack.js"), "utf8"), presetCtx, { filename: "js/preset-pack.js" });
vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "presets.js"), "utf8"), presetCtx, { filename: "js/presets.js" });
var catalog = presetCtx.window.KPresets.list();
var packs = presetCtx.window.KPresets.packs();
var ids = catalog.map(function (p) { return p.id; });
ok("12 yerlesik Motion preseti var", catalog.length === 12, catalog.length);
ok("Suflo Smooth paketi 278 efekti ve dogru dosya adini tasir",
  packs.length === 1 && packs[0].count === 278 && packs[0].file === "Suflo Smooth Editing Pack.prfpset", JSON.stringify(packs));
ok("preset kimlikleri benzersiz", new Set(ids).size === ids.length, ids.join(","));
ok("Slide, Zoom, Fade ve Vurgu aileleri var", ["slide", "zoom", "fade", "impact"].every(function (g) {
  return catalog.some(function (p) { return p.group === g; });
}));
ok("beklenen amiral presetler katalogda", ["simple-zoom-in", "slide-in-left", "pop-in", "micro-shake"].every(function (id) {
  return ids.indexOf(id) !== -1;
}));

var fixture = '<?xml version="1.0"?><PremiereData>' +
  '<Tree ObjectRef="1"/><Tree ObjectID="1"><RootBin ObjectRef="2"/></Tree>' +
  '<BinTreeItem ObjectID="2"><Items><Item Index="0" ObjectRef="3"/></Items><TreeItemBase><Name>Root</Name></TreeItemBase></BinTreeItem>' +
  '<BinTreeItem ObjectID="3"><Items><Item Index="0" ObjectRef="4"/><Item Index="1" ObjectRef="10"/></Items><TreeItemBase><Name>SUFLO SMOOTH EDITING PACK</Name></TreeItemBase></BinTreeItem>' +
  '<TreeItem ObjectID="4"><TreeItemBase><Name>SUFLO Direct Blur</Name><Data ObjectRef="5"/></TreeItemBase></TreeItem>' +
  '<FilterPresetItem ObjectID="5"><FilterPresets><FilterPreset Index="0" ObjectRef="6"/></FilterPresets></FilterPresetItem>' +
  '<FilterPreset ObjectID="6"><FilterMatchName>AE.ADBE Gaussian Blur 2</FilterMatchName><Component ObjectRef="7"/><AnchorInPoint>0</AnchorInPoint><AnchorOutPoint>127008000000</AnchorOutPoint><Speed>1.</Speed><Type>1</Type></FilterPreset>' +
  '<VideoFilterComponent ObjectID="7"><Component><DisplayName>Gaussian Blur</DisplayName><Params><Param Index="0" ObjectRef="8"/></Params><Intrinsic>false</Intrinsic></Component><MatchName>AE.ADBE Gaussian Blur 2</MatchName></VideoFilterComponent>' +
  '<VideoComponentParam ObjectID="8"><Name>Blurriness</Name><Keyframes>0,25.;127008000000,0.;</Keyframes><ParameterID>1</ParameterID><ParameterControlType>8</ParameterControlType><IsTimeVarying>true</IsTimeVarying><StartKeyframe>-91445760000000000,80.,0,0,0,0,0,0</StartKeyframe><CurrentValue>25.</CurrentValue></VideoComponentParam>' +
  '<TreeItem ObjectID="10"><TreeItemBase><Name>SUFLO Blob Look</Name><Data ObjectRef="11"/></TreeItemBase></TreeItem>' +
  '<FilterPresetItem ObjectID="11"><FilterPresets><FilterPreset Index="0" ObjectRef="12"/></FilterPresets></FilterPresetItem>' +
  '<FilterPreset ObjectID="12"><FilterMatchName>AE.ADBE Lumetri</FilterMatchName><Component ObjectRef="13"/><AnchorInPoint>0</AnchorInPoint><AnchorOutPoint>1</AnchorOutPoint><Type>1</Type></FilterPreset>' +
  '<VideoFilterComponent ObjectID="13"><Component><DisplayName>Lumetri Color</DisplayName><Params><Param Index="0" ObjectRef="14"/></Params><Intrinsic>false</Intrinsic></Component><MatchName>AE.ADBE Lumetri</MatchName></VideoFilterComponent>' +
  '<ArbVideoComponentParam ObjectID="14"><Name>Blob</Name><Keyframes></Keyframes><ParameterID>1</ParameterID><IsTimeVarying>false</IsTimeVarying><CurrentValue>opaque</CurrentValue></ArbVideoComponentParam>' +
  '</PremiereData>';
var parsedPack = presetCtx.window.SufloPresetPack.parse(fixture);
ok("prfpset XML katalogu kartlara ayrilir", parsedPack.total === 2 && parsedPack.presets[0].name === "SUFLO Direct Blur", JSON.stringify(parsedPack));
ok("standart parametre dogrudan, opak Adobe blobu uyumluluk modudur",
  parsedPack.direct === 1 && parsedPack.fallback === 1 && parsedPack.presets[0].components[0].params[0].keys.length === 2,
  JSON.stringify({ direct: parsedPack.direct, fallback: parsedPack.fallback }));
ok("sabit preset degeri CurrentValue yerine StartKeyframe'den okunur",
  parsedPack.presets[0].components[0].params[0].current === 80,
  parsedPack.presets[0].components[0].params[0].current);
ok("64-bit Premiere renk degeri kayipsiz ARGB kanallarina ayrilir",
  JSON.stringify(presetCtx.window.SufloPresetPack.parseColor("-91445760000000000,18374686483698220800,0,0,0,0,0,0")) === JSON.stringify([255, 0, 240, 255]),
  presetCtx.window.SufloPresetPack.parseColor("-91445760000000000,18374686483698220800,0,0,0,0,0,0"));

function FakeTime() { this.seconds = 0; }
function FakeProp(value) {
  this.value = value;
  this.keys = [];
  this.keyUi = [];
}
FakeProp.prototype.getValue = function () { return this.value; };
FakeProp.prototype.setValue = function (value, updateUI) { this.value = value; this.valueUi = updateUI; };
FakeProp.prototype.setTimeVarying = function (value) { this.timeVarying = value; };
FakeProp.prototype.removeKeyRange = function (start, end) {
  this.keys = this.keys.filter(function (key) { return key.time < start.seconds || key.time > end.seconds; });
};
FakeProp.prototype.removeKey = function (time) {
  this.keys = this.keys.filter(function (key) { return Math.abs(key.time - time.seconds) > .0001; });
};
FakeProp.prototype.addKey = function () {};
FakeProp.prototype.setValueAtKey = function (time, value, updateUI) { this.keys.push({ time: time.seconds, value: value }); this.keyUi.push(updateUI); };
FakeProp.prototype.setInterpolationTypeAtKey = function (time, type, updateUI) { this.interpolationUi = updateUI; };
FakeProp.prototype.areKeyframesSupported = function () { return true; };
FakeProp.prototype.getKeys = function () { return this.keys.map(function (key) { return { seconds: key.time }; }); };

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
var clip = {
  start: { seconds: 12 },
  end: { seconds: 17 },
  inPoint: { seconds: 37 },
  outPoint: { seconds: 42 },
  components: list([motion, opacityComponent]),
  isSpeedReversed: function () { return false; }
};
var selected = [clip];
var sequence = {
  frameSizeHorizontal: 1920,
  frameSizeVertical: 1080,
  getSelection: function () { return selected; },
  getPlayerPosition: function () { return { seconds: 14 }; }
};
sequence.videoTracks = list([{ clips: list([clip]) }]);
sequence.videoTracks.numTracks = 1;
var hostCtx = {
  app: { project: { activeSequence: sequence }, enableQE: function () {} },
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
ok("anahtar zamanlari timeline yerine klibin kaynak inPoint zamanina yazilir", scale.keys[0].time === 37 && scale.keys[2].time > 37 && scale.keys[2].time < 38, JSON.stringify(scale.keys));

var zoomFast = apply("simple-zoom-in", .28, 1);
ok("ayni giris preseti farkli hizla yeniden uygulaninca eski anahtar birakmaz", zoomFast.ok && zoomFast.removedKeys === 3 && scale.keys.length === 3 && scale.keys[2].time < 37.3, JSON.stringify({ result: zoomFast, keys: scale.keys }));

position.keys = []; opacity.keys = [];
var slide = apply("slide-in-left", .45, 1);
ok("Slide In Left Motion ve Opacity anahtari uretir", slide.ok && position.keys.length === 3 && opacity.keys.length === 2);
ok("Slide In Left soldan baslayip asil konuma gelir", position.keys[0].value[0] < .5 && position.keys[2].value[0] === .5, JSON.stringify(position.keys));

opacity.keys = [];
var fade = apply("fade-out", .45, 1);
ok("Fade Out klibin kaynak outPoint zamaninda sifir opakliga iner", fade.ok && opacity.keys.length === 2 && opacity.keys[1].time === 42 && opacity.keys[1].value === 0, JSON.stringify(opacity.keys));

scale.keys = [];
scale.getKeys = function () { return []; };
var silentFailure = apply("simple-zoom-in", .45, 1);
ok("Premiere anahtari yazmadiysa basarili mesaji verilmez", silentFailure.ok === false, JSON.stringify(silentFailure));

var bad = apply("not-a-real-preset", .45, 1);
ok("bilinmeyen preset reddedilir", bad.ok === false && /Bilinmeyen/.test(bad.error), JSON.stringify(bad));
selected = [];
var empty = apply("simple-zoom-in", .45, 1);
ok("secim yoksa anlasilir hata doner", empty.ok === false && /en az bir video klibi/.test(empty.error), JSON.stringify(empty));

var blur = prop("ADBE Gaussian Blur 2-0001", "Blurriness", 0);
// Premiere bazi surumlerde component.matchName'deki "AE." on ekini dusurur.
var blurComponent = { matchName: "ADBE Gaussian Blur 2", displayName: "Gaussian Blur", properties: list([blur]) };
var qeClip = { start: { seconds: 12 }, end: { seconds: 17 }, addVideoEffect: function () {
  // Premiere Essential Graphics kliplerinde yeni standart efekti listenin
  // sonuna degil, mevcut ozel bileşenlerin onune yerlestirebilir.
  for (var at = clip.components.numItems; at > 1; at--) clip.components[at] = clip.components[at - 1];
  clip.components[1] = blurComponent;
  clip.components.numItems++;
} };
var wrongQeClip = { start: { seconds: 2 }, end: { seconds: 4 }, addVideoEffect: function () { throw new Error("yanlis klip"); } };
var qeTrack = {
  numItems: 2,
  getItemAt: function (index) { return index === 0 ? wrongQeClip : qeClip; }
};
hostCtx.qe = { project: {
  getActiveSequence: function () { return { getVideoTrackAt: function () { return qeTrack; } }; },
  getVideoEffectByName: function (name) { return name === "Gaussian Blur" || name === "AE.ADBE Gaussian Blur 2" ? { name: name } : null; }
} };
selected = [clip];
var packed = JSON.parse(hostCtx.KS_applyPackedPreset(encodeURIComponent(JSON.stringify({
  data: { schema: 1, name: "SUFLO Direct Blur", components: parsedPack.presets[0].components },
  speed: 1
}))));
ok("prfpset karti QE ile efekti ekleyip secili klibe uygular", packed.ok && packed.applied === 1 && packed.appliedParams === 1, JSON.stringify(packed));
ok("Premiere efekti listenin arasina koysa da yeni bileşen bulunur",
  clip.components[1] === blurComponent && blur.keys.length === 2,
  JSON.stringify({ count: clip.components.numItems, keys: blur.keys }));
ok("QE klip dizini normal timeline'dan kaysa bile baslangic bitis ile dogru klip bulunur",
  blur.keys.length === 2 && wrongQeClip !== qeClip, JSON.stringify(blur.keys));
ok("AE. on eki farkli olsa da efekt component'i eslesir",
  hostCtx.KS_packNormMatchName("AE.ADBE Gaussian Blur 2") === hostCtx.KS_packNormMatchName(blurComponent.matchName),
  blurComponent.matchName);
ok("paket anahtarlari klibin kaynak araligina yerlestirilir",
  blur.keys.length === 2 && blur.keys[0].time === 37 && blur.keys[1].time === 37.5 && blur.keys[0].value === 25,
  JSON.stringify(blur.keys));
ok("buyuk presetlerde Effect Controls yalniz son anahtarda yenilenir",
  blur.keyUi.length === 2 && blur.keyUi[0] === false && blur.keyUi[1] === true && blur.interpolationUi === false,
  JSON.stringify({ keyUi: blur.keyUi, interpolationUi: blur.interpolationUi }));
var colorProp = new FakeProp(0);
colorProp.setColorValue = function (a, r, g, b, updateUI) { this.color = [a, r, g, b]; this.colorUi = updateUI; };
colorProp.getColorValue = function () { return this.color; };
var colorApplied = hostCtx.KS_packSetParam(colorProp,
  { direct: true, current: 0, color: [255, 0, 240, 255], keys: [] },
  { type: 0, anchorIn: 0, anchorOut: 1 }, clip, 1);
ok("renk parametresi setValue yerine Premiere setColorValue API'siyle uygulanir",
  colorApplied && JSON.stringify(colorProp.color) === JSON.stringify([255, 0, 240, 255]) && colorProp.colorUi === false,
  JSON.stringify({ color: colorProp.color, updateUI: colorProp.colorUi }));
var staticProp = new FakeProp(40);
var staticApplied = hostCtx.KS_packSetParam(staticProp,
  { direct: true, current: 80, keys: [] }, { type: 0, anchorIn: 0, anchorOut: 1 }, clip, 1);
ok("sabit preset degeri tek seferde ve arayuz yenilemeden yazilir",
  staticApplied && staticProp.value === 80 && staticProp.valueUi === false,
  JSON.stringify({ value: staticProp.value, updateUI: staticProp.valueUi }));
ok("zaten ayni olan sabit deger tekrar yazilmaz",
  hostCtx.KS_packSetParam(staticProp, { direct: true, current: 80, keys: [] },
    { type: 0, anchorIn: 0, anchorOut: 1 }, clip, 1) === false);

var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var src = fs.readFileSync(path.join(ROOT, "js", "presets.js"), "utf8");
ok("Free kullanici preset kartlarini kilitli gorur", /preset-card.*locked/.test(src) && /Pro\.gate\("presets"\)/.test(src));
ok("Preset sekmesi arama hiz guc ve filtre kontrollerini tasir",
  /id="tab-presets"/.test(html) && /id="preset-search"/.test(html) && /id="preset-speed"/.test(html) && /id="preset-strength"/.test(html) && /id="preset-filter"/.test(html));
ok("Preset betigi panel tarafindan yuklenir", /<script src="js\/presets\.js"><\/script>/.test(html));
ok("prfpset okuyucu preset betiginden once yuklenir",
  html.indexOf('js/preset-pack.js') !== -1 && html.indexOf('js/preset-pack.js') < html.indexOf('js/presets.js'));
ok("Preset paketi standart kartlarda dogrudan motoru, ozel veride gercek import rehberini acar",
  /KS_applyPackedPreset/.test(src) && /Import Presets/.test(src) && /Dosyayı göster/.test(src) && /ProSync\.sync/.test(src) && !/preset paketi uygulandı/i.test(src));
ok("Uzun Premiere islemi boyunca kart UYGULANIYOR durumunu ve aria-busy bilgisini gosterir",
  /UYGULANIYOR…/.test(src) && /aria-busy/.test(src) && /button\.disabled = !!active/.test(src));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
