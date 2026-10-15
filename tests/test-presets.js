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

/* ---------- 3.4 adım 11: Hareket önayarı kayıtları ve güvenli kaldırma ---------- */
var KR = require(path.join(ROOT, "js", "key-records.js"));
var PM = require("./_kayit-premiere.js").olustur();
function js(x) { return JSON.stringify(x); }
function onayar(id) { return PM.cagir("KS_applyMotionPreset", { id: id, duration: .45, strength: 1 }); }
function sakla(r) { return (r.records || []).map(function (x) { return KR.kayit(x); }); }
var P1 = PM.klip({ ad: "Sahne.mp4", nodeId: "P1", start: 0, end: 5, inP: 0, opak: 80 });
var P2 = PM.klip({ ad: "Diger.mp4", nodeId: "P2", start: 5, end: 10, inP: 0 });
PM.izKur([[P1, P2]]);
PM.durum.secim = [P1];

var f = onayar("fade-in");
var sf = sakla(f);
ok("kayıt: Clean Fade In Opaklık için 'hareket' kaydı döner (kenar = önceki değer 80)", f.ok && sf.length === 1 && sf[0].tur === "hareket" &&
  sf[0].matchName === "AE.ADBE Opacity/Opacity" && sf[0].times.length === 2 && sf[0].kenarDegerleri.length === 2 &&
  sf[0].kenarDegerleri[0].v === 80 && sf[0].kenarDegerleri[1].v === 80 && /kayit\.prproj$/.test(f.proje), js(f));
var kf = PM.cagir("KS_removeSufloKeys", { records: sf, secili: true });
ok("önayar kaldırma kenar değerini geri koyar: Opaklık anahtarsız ve 80 (Premiere ilk anahtarın 0'ında bırakırdı)", kf.ok && kf.eslesen === 1 &&
  kf.sonuclar[0].silinen === 2 && P1.opak.keys.length === 0 && P1.opak.value === 80 && P1.opak.tv === false, js([kf, P1.opak]));
ok("önayar kaldırma ekranı updateUI ile tazeler", PM.ui.some(function (u) { return u.ad === "Opacity" && u.tur === "deger" && u.ui; }), js(PM.ui.slice(-3)));

var pop = onayar("pop-in");
var sp = sakla(pop);
ok("Pop In: Ölçek ve Opaklık için iki kayıt", pop.ok && sp.length === 2 && sp.map(function (r) { return r.matchName; }).sort().join(",") === "AE.ADBE Motion/Scale,AE.ADBE Opacity/Opacity", js(pop));
PM.durum.secim = [P2];
var kp0 = PM.cagir("KS_removeSufloKeys", { records: sp, secili: true });
ok("seçili kapsam: başka klip seçiliyken hiçbir kayıt eşleşmez, anahtarlara dokunulmaz", kp0.ok && kp0.eslesen === 0 && P1.olcek.keys.length === 3 && P1.opak.keys.length === 2, js(kp0));
PM.durum.secim = [P1];
var kp = PM.cagir("KS_removeSufloKeys", { records: sp, secili: true });
ok("seçili kapsam: Pop In'in iki kaydı kaldırıldı, Ölçek 100 ve Opaklık 80'e döndü", kp.ok && kp.eslesen === 2 && P1.olcek.keys.length === 0 &&
  P1.olcek.value === 100 && P1.opak.keys.length === 0 && P1.opak.value === 80, js([kp, P1.olcek, P1.opak]));

// Kullanıcının pencere dışındaki animasyonu: önayar onu bozmaz, kaldırma da (kenar eklemeden) olduğu gibi bırakır
P1.olcek.elle(P1, 3, 100);
P1.olcek.elle(P1, 4, 150);
var z = onayar("simple-zoom-in");
var sz = sakla(z);
var kz = PM.cagir("KS_removeSufloKeys", { records: sz, secili: true });
ok("kullanıcının Ölçek animasyonu (3 sn → 4 sn) kaldırmadan sonra aynen duruyor, kenar anahtarı eklenmedi", kz.ok && kz.sonuclar[0].silinen === 3 && kz.sonuclar[0].eklenen === 0 &&
  js(P1.olcek.tl(P1)) === js([3, 4]) && js(P1.olcek.keys.map(function (k) { return k.v; })) === js([100, 150]), js([kz, P1.olcek.keys]));

// Konum [x,y]: Slide In Left kaldırılınca Konum eski [x,y] değerine döner
P1.konum.value = [0.4, 0.6];
var sl = onayar("slide-in-left");
var ssl = sakla(sl);
var kk = PM.cagir("KS_removeSufloKeys", { records: ssl, secili: true });
ok("Slide In Left kaldırılınca Konum [0.4, 0.6] ve Opaklık 80", kk.ok && kk.eslesen === 2 && P1.konum.keys.length === 0 && js(P1.konum.value) === js([0.4, 0.6]) &&
  P1.opak.value === 80, js([kk, P1.konum]));

// Klip Hareket bileşeni olmadan da (bileşen yoksa kayıt yok) önayar eskisi gibi hata verir
var bos = PM.klip({ nodeId: "P3", start: 20, end: 25 });
bos.components = { numItems: 0 };
PM.izKur([[P1, P2, bos]]);
PM.durum.secim = [bos];
var hb = onayar("fade-in");
ok("Motion/Opaklık yoksa önayar hata verir ve kayıt dönmez", !hb.ok && !hb.records, js(hb));

/* ---- inceleme: pencere temizliği özelliği boşaltınca önceki değer artıktan (silinen ilk anahtar) okunmaz ---- */
var PMb = require("./_kayit-premiere.js").olustur();
var E1 = PMb.klip({ ad: "Eski.mp4", nodeId: "E1", start: 0, end: 5, inP: 0, opak: 90 });
PMb.izKur([[E1]]);
PMb.durum.secim = [E1];
PMb.cagir("KS_applyMotionPreset", { id: "fade-in", duration: .45, strength: 1 });   // 3.3'te uygulanmış gibi (kayıt yok)
var f2 = PMb.cagir("KS_applyMotionPreset", { id: "fade-in", duration: .45, strength: 1 });
ok("eski Fade In yeniden uygulanınca önceki değer 90 (eski fade'in 0'ı değil: pencere dışındaki değer, silmeden önce okunur)",
  f2.ok && f2.records[0].kenarDegerleri.length === 2 && f2.records[0].kenarDegerleri[0].v === 90 && f2.records[0].kenarDegerleri[1].v === 90, js(f2.records));
var tzF = (f2.temizlenen || [])[0];
ok("temizlenen: eski fade'in iki anahtarı silindi ve Opaklık boşaldı (panel buna göre eski kaydın yerine geçer)",
  tzF && tzF.nodeId === "E1" && tzF.matchName === "AE.ADBE Opacity/Opacity" && js(tzF.times) === js([0, 0.45]) && tzF.bosaldi === true, js(f2.temizlenen));
var kf2 = PMb.cagir("KS_removeSufloKeys", { records: sakla(f2), secili: true });
ok("eski Fade In yeniden uygulanıp kaldırılınca Opaklık 90'a döner (0'da, görünmez kalmaz)", kf2.ok && E1.opak.keys.length === 0 && E1.opak.value === 90, js([kf2, E1.opak]));
var E2 = PMb.klip({ ad: "Ozel.mp4", nodeId: "E2", start: 10, end: 15, inP: 0 });
PMb.izKur([[E1, E2]]);
PMb.durum.secim = [E2];
E2.opak.elle(E2, 14, 40);
var f3 = PMb.cagir("KS_applyMotionPreset", { id: "fade-in", duration: .45, strength: 1 });
ok("pencere dışında anahtar kalırsa (özellik boşalmadı) önceki değer kalan eğriden okunur (kullanıcının 40'ı)",
  f3.ok && f3.records[0].kenarDegerleri[0].v === 40 && f3.temizlenen[0].bosaldi === false && f3.temizlenen[0].times.length === 0, js([f3.records[0].kenarDegerleri, f3.temizlenen]));
ok("kaydı olmayan önayar metni macOS'un Cmd+Z'sini de söyler", /Ctrl\+Z \(macOS'ta Cmd\+Z\)/.test(src), "presets.js");

/* ---------- 3.4 adım 12: Hareket önayarında özel eğri (panel tabloyu gönderir, host kare zamanlarında yoğunlaştırır) ---------- */
var S12 = require(path.join(ROOT, "js", "egri-secim.js"));
var E12 = require(path.join(ROOT, "js", "ease-curve.js"));
function izli(fps) {
  var P = require("./_kayit-premiere.js").olustur({ fps: fps || 25 });
  var interp = [];
  P.FakeProp.prototype.setInterpolationTypeAtKey = function (t, tur, u) { interp.push({ ad: this.displayName, s: t.seconds, tur: tur, ui: u === true }); };
  return { P: P, interp: interp };
}
var Q = izli(25);
var Q1 = Q.P.klip({ ad: "Sahne.mp4", nodeId: "Q1", start: 0, end: 5, inP: 0, opak: 80 });
Q.P.izKur([[Q1]]);
Q.P.durum.secim = [Q1];
var otoQ = Q.P.cagir("KS_applyMotionPreset", { id: "simple-zoom-in", duration: .45, strength: 1 });
ok("varsayılan (eğri yok): Simple Zoom In eskisi gibi 3 anahtar, her birine Bezier (5)", otoQ.ok && Q1.olcek.keys.length === 3 && Q.interp.length === 3 &&
  Q.interp.every(function (c) { return c.tur === 5; }) && otoQ.yogun === undefined, js([Q1.olcek.keys, Q.interp]));
Q.interp.length = 0;
var hm = S12.hareketEgrisi("yumusak-cikis");
var uiOnceQ = Q.P.ui.length;
var yq = Q.P.cagir("KS_applyMotionPreset", { id: "simple-zoom-in", duration: .45, strength: 1, ease: hm.ease, egri: { tablo: hm.tablo } });
var qtl = Q1.olcek.tl(Q1);
// t0 = 0, t1 = 0,351, t2 = 0,45 (25 kare/sn) → [0, 0,351]: 8 iç kare (0,04 … 0,32); [0,351, 0,45]: 1 iç kare (0,40)
function yak(a, b) { return Math.abs(a - b) < 1e-6; }
var qBek = [0, 0.04, 0.08, 0.12, 0.16, 0.2, 0.24, 0.28, 0.32, 0.351, 0.4, 0.45];
ok("eğriyle: üç seyrek anahtar yerinde (değerleri eskisiyle aynı), aralar her karede (12 anahtar)", yq.ok && yq.yogun === true && qtl.length === qBek.length &&
  qtl.every(function (t, i) { return yak(t, qBek[i]); }) && yak(Q1.olcek.keys[0].v, 112) && yak(Q1.olcek.keys[9].v, 98.5) && Q1.olcek.keys[11].v === 100, js(qtl));
ok("eğriyle: hiçbir anahtara Bezier (5) yazılmadı, hepsi doğrusal (0)", Q.interp.length === qtl.length && Q.interp.every(function (c) { return c.tur === 0; }), js(Q.interp.slice(0, 3)));
var qUi = Q.P.ui.slice(uiOnceQ).filter(function (u) { return u.tur === "anahtar" && u.ad === "Scale"; });
ok("eğriyle: updateUI yalnız son anahtarda", qUi.length === qtl.length && qUi.filter(function (u) { return u.ui; }).length === 1 && qUi[qUi.length - 1].ui === true, js(qUi.map(function (u) { return u.ui; })));
var fQ = E12.toFunction(E12.builtin("yumusak-cikis").curve);
var v0Q = Q1.olcek.keys[0].v, v1Q = Q1.olcek.keys.filter(function (k, i) { return yak(qtl[i], 0.351); })[0].v;
ok("eğriyle: ara değerler tablodaki eğriyi izler (ilk parça)", Q1.olcek.keys.every(function (k, i) {
  var t = qtl[i]; if (!(t > 0 && t < 0.351 - 1e-6)) return true;
  return Math.abs(k.v - (v0Q + (v1Q - v0Q) * fQ(t / 0.351))) < 0.05;
}), js(Q1.olcek.keys.slice(0, 4)));
var rq = (yq.records || []).map(function (x) { return KR.kayit(x); });
ok("eğriyle: kayıt döner, tüm yoğun zamanları taşır; kaldırınca Ölçek 100'e döner", rq.length === 1 && rq[0].times.length === qtl.length && yq.yazilan === qtl.length &&
  (function () { var kq = Q.P.cagir("KS_removeSufloKeys", { records: rq, secili: true }); return kq.ok && Q1.olcek.keys.length === 0 && Q1.olcek.value === 100; })(), js(rq[0] && rq[0].times.length));
// Opaklık: Taşma eğrisi 0..100 dışına çıkmaz; Konum [x,y] iki bileşenli
Q.durum = Q.P.durum;
var tq = S12.hareketEgrisi("tasma");
var sq = Q.P.cagir("KS_applyMotionPreset", { id: "slide-in-left", duration: .72, strength: 1, ease: tq.ease, egri: { tablo: tq.tablo } });
ok("Slide In Left + Taşma: Konum [x,y] yoğun, Opaklık 0..100 (klibin 80'i aşılmaz değil, 100'ü aşmaz)", sq.ok && Q1.konum.keys.length > 3 &&
  Q1.konum.keys.every(function (k) { return Array.isArray(k.v) && k.v.length === 2; }) && Q1.opak.keys.length > 2 &&
  Q1.opak.keys.every(function (k) { return k.v >= 0 && k.v <= 100; }), js(Q1.opak.keys.map(function (k) { return k.v; })));
var bozukT = Q.P.cagir("KS_applyMotionPreset", { id: "fade-in", duration: .45, strength: 1, ease: "x", egri: { tablo: [0, 0.5, 1] } });
var bozukU = Q.P.cagir("KS_applyMotionPreset", { id: "fade-in", duration: .45, strength: 1, egri: { tablo: hm.tablo.map(function (v, i) { return i === 5 ? "NaN" : v; }) } });
ok("geçersiz eğri tablosu (kısa, NaN) reddedilir, hiçbir şey yazılmaz", !bozukT.ok && /Egri tablosu gecersiz/.test(bozukT.error) && !bozukU.ok, js([bozukT, bozukU]));

// ease seçeneği gidiş dönüş: panelin gönderdiği ease kanonik, aynı ease aynı tabloyu verir; 'auto' / geçersiz → eğri yok (yük eskisi)
var kodRT = E12.sfcKodla({ ad: "Benim", curve: E12.builtin("cift-yumusak").curve });
ok("ease gidiş dönüş: hazır eğri, cubic-bezier (kanonik), SFC1 kodu; 'auto' ve geçersizde tablo yok", S12.hareketEgrisi("tasma").ease === "tasma" &&
  S12.hareketEgrisi("cubic-bezier(0.3,0,0.2,1)").ease === "cubic-bezier(0.3, 0, 0.2, 1)" && S12.hareketEgrisi(S12.hareketEgrisi(kodRT).ease).ease === S12.hareketEgrisi(kodRT).ease &&
  js(S12.hareketEgrisi(S12.hareketEgrisi(kodRT).ease).tablo) === js(S12.hareketEgrisi(kodRT).tablo) && S12.hareketEgrisi("auto") === null && S12.hareketEgrisi("") === null &&
  S12.hareketEgrisi(undefined) === null && S12.hareketEgrisi("dalga") === null);

/* ---------- 3.4 adım 12 inceleme: yoğun Hareket yazımının süresi ve toplam sınırı ----------
 * Panel çağrı süresini SufloEgriSecim.hareketAnahtari (seçili klip × 2 özellik × (ceil(süre × fps) + 5)) ile kurar:
 * bu sayı host'un gerçekten yazdığı yoğun anahtarın ÜST SINIRI olmalı (yoksa zaman aşımında kayıtlar kaybolurdu). */
function hareketKur(fps, n, uzunluk) {
  var P = require("./_kayit-premiere.js").olustur({ fps: fps });
  var kl = [];
  for (var i = 0; i < n; i++) kl.push(P.klip({ ad: "K" + i + ".mp4", nodeId: "H" + i, start: i * 6, end: i * 6 + (uzunluk || 5), inP: 0, opak: 100 }));
  P.izKur([kl]);
  P.durum.secim = kl;
  return { P: P, kl: kl, anahtar: function () { var t = 0; kl.forEach(function (k) { ["olcek", "konum", "opak"].forEach(function (a) { t += k[a].keys.length; }); }); return t; } };
}
var PRESET12 = ["simple-zoom-in", "simple-zoom-out", "pop-in", "slide-in-left", "slide-in-right", "slide-in-up", "slide-in-down",
  "fade-in", "fade-out", "punch", "micro-shake", "slide-out-right"];
var asanlar = [], enYakin = 0, denenen = 0;
[23.976, 25, 29.97, 50, 59.94].forEach(function (fps) {
  [5, 0.9].forEach(function (uzunluk) {
    var H = hareketKur(fps, 2, uzunluk);
    PRESET12.forEach(function (id) {
      [0.18, 0.45, 1, 1.5].forEach(function (sure) {
        ["yumusak", "tasma"].forEach(function (e) {
          var h = S12.hareketEgrisi(e);
          var r = H.P.cagir("KS_applyMotionPreset", { id: id, duration: sure, strength: 1.8, ease: h.ease, egri: { tablo: h.tablo } });
          var ust = S12.hareketAnahtari({ klip: 2, sure: sure, fps: fps });
          denenen++;
          if (!r.ok || !(r.yazilan > 0) || r.yazilan > ust) asanlar.push([fps, uzunluk, id, sure, e, r.ok && r.yazilan, ust].join(" "));
          else enYakin = Math.max(enYakin, r.yazilan / ust);
        });
      });
    });
  });
});
ok("hareketAnahtari host'un yazdığı yoğun anahtarın üst sınırı (12 önayar × 5 kare hızı × 4 süre × 2 eğri × uzun / kısa klip)", asanlar.length === 0 && denenen === 960 && enYakin > 0.5,
  asanlar.slice(0, 3).join(" | ") + " oran " + enYakin.toFixed(2));
// İncelemedeki örnek: 30 klip, Slide In Left, 1,5 sn, 59,94 kare/sn, Yumuşak → host 3393 anahtar yazar (Otomatik 150);
// eskiden süre 60 sn sabitti (anahtar başına 50 ms ile ~170 sn iş). Artık süre işi kapsar ve kayıtlar döner.
var H30 = hareketKur(59.94, 30);
var h30 = S12.hareketEgrisi("yumusak");
var r30 = H30.P.cagir("KS_applyMotionPreset", { id: "slide-in-left", duration: 1.5, strength: 1, ease: h30.ease, egri: { tablo: h30.tablo } });
var sure30 = S12.cagriSuresi(30000, S12.hareketAnahtari({ klip: 30, sure: 1.5, fps: 59.94 }));
ok("30 klip yoğun Slide In Left: yazılır, kayıtlar döner; panelin süresi 60 sn'nin ve işin (30 sn + anahtar × 50 ms) üstünde", r30.ok && r30.applied === 30 &&
  r30.yazilan === H30.anahtar() && r30.yazilan > 3000 && (r30.records || []).length === 60 && sure30 > 60000 && sure30 >= 30000 + r30.yazilan * 50,
  js({ ok: r30.ok, yazilan: r30.yazilan, sure: sure30 }));
// Toplam sınır: 60 klip × ~113 ≈ 6790 > 6000 → temiz red, HİÇBİR anahtar yazılmaz (sayım geçişi yalnız okur)
var H60 = hareketKur(59.94, 60);
var r60 = H60.P.cagir("KS_applyMotionPreset", { id: "slide-in-left", duration: 1.5, strength: 1, ease: h30.ease, egri: { tablo: h30.tablo } });
ok("60 klip yoğun: toplam 6000'i aşınca kod 'cokFazla' (gereken, enÇok), hiçbir klibe anahtar yazılmaz, kayıt yok", !r60.ok && r60.kod === "cokFazla" &&
  r60.gereken > 6000 && r60.gereken <= S12.hareketAnahtari({ klip: 60, sure: 1.5, fps: 59.94 }) && r60.enCok === 6000 && H60.anahtar() === 0 && r60.records === undefined && /cok fazla anahtar/.test(r60.error), js(r60));
var r60o = H60.P.cagir("KS_applyMotionPreset", { id: "slide-in-left", duration: 1.5, strength: 1 });
ok("aynı 60 klip Otomatik: sınır yok, eskisi gibi klip başına 5 anahtar (Bezier)", r60o.ok && r60o.applied === 60 && H60.anahtar() === 300 && r60o.yogun === undefined, js({ ok: r60o.ok, n: H60.anahtar() }));
var H53 = hareketKur(59.94, 53);
var r53 = H53.P.cagir("KS_applyMotionPreset", { id: "slide-in-left", duration: 1.5, strength: 1, ease: h30.ease, egri: { tablo: h30.tablo } });
ok("sınırın hemen altında (53 klip × ~113) yazılır, kayıtlar döner", r53.ok && r53.yazilan > 5900 && r53.yazilan <= 6000 && H53.anahtar() === r53.yazilan &&
  (r53.records || []).length === 106, js({ ok: r53.ok, y: r53.yazilan, kod: r53.kod }));
var hostSrc12 = fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8");
ok("host ve panel sınırı aynı (KS_EGRI_TOPLAM_EN_COK = SufloEgriSecim.HAREKET_EN_COK)", new RegExp("var KS_EGRI_TOPLAM_EN_COK = " + S12.HAREKET_EN_COK + ";").test(hostSrc12));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
