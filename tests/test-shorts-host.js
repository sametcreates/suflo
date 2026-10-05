// Suflo testi: Shorts paketinin host işlevleri (sahte Premiere modeliyle): KS_openSequenceById,
// KS_findSequenceByName, KS_sequenceSufloLayers, KS_makeShorts sourceId, KS_placeOverlay expectSeqId
var fs = require("fs"), path = require("path"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 220) + "]" : "")); }

var TPS = 254016000000;
function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", { get: function () { return String(Math.round(this.seconds * TPS)); } });

function klip(ad, yol, agac) {
  return { name: ad, start: { seconds: 0, ticks: 0 }, end: { seconds: 5 },
    projectItem: { getMediaPath: function () { return yol || ""; }, treePath: agac || "\\Proje.prproj\\" + (ad || "x") } };
}
function iz(klipler) { var c = { numItems: klipler.length }; klipler.forEach(function (k, i) { c[i] = k; }); return { clips: c }; }
function izler(liste) { var o = { numTracks: liste.length }; liste.forEach(function (t, i) { o[i] = t; }); return o; }

function sekans(id, ad, izListesi, w, h) {
  var s = {
    sequenceID: id, name: ad, end: String(30 * TPS), timebase: String(TPS / 30),
    videoTracks: izler(izListesi || []), audioTracks: izler([]),
    getSettings: function () { return { videoFrameWidth: w || 1080, videoFrameHeight: h || 1920 }; },
    getInPointAsTime: function () { return { seconds: 0 }; }, getOutPointAsTime: function () { return { seconds: 30 }; },
    setInPoint: function () {}, setOutPoint: function () {}, getPlayerPosition: function () { return { seconds: 0 }; }
  };
  return s;
}

var ana = sekans("ana", "Ana sekans", [iz([klip("Suflo Stil · viral", "C:\\tmp\\suflo-altyazi-1.mov")])], 1920, 1080);
var kisa1 = sekans("s1", "Shorts 1 · Sır 9x16", [
  iz([klip("video.mp4", "C:\\v\\video.mp4")]),
  iz([klip("Suflo Stil · viral", "C:\\tmp\\suflo-altyazi-1.mov", "\\Proje.prproj\\Suflo Altyazi\\suflo-altyazi-1.mov")]),
  iz([klip("Suflo Paket · Altyazı", "C:\\tmp\\suflo-paket-altyazi-2.mov", "\\Proje.prproj\\Suflo Altyazi\\x"),
    klip("Suflo Kanca · Bunu bil", "C:\\tmp\\suflo-kanca-3.mov")]),
  iz([klip("yeniden adlandirilmis", "/Users/a/Suflo/suflo-temiz-altyazi-9.mov"), klip("kutuda", "C:\\x\\y.mov", "\\Proje.prproj\\Suflo Altyazi\\y.mov")])
]);
var kisa2 = sekans("s2", "Shorts 2", []);
var ayniAd = sekans("s3", "Shorts 1 · Sır 9x16", []);
var tumu = [ana, kisa1, kisa2, ayniAd];
var acilan = [], aktifAtamaCalisir = true;
var proje = {
  sequences: (function () { var o = { numSequences: tumu.length }; tumu.forEach(function (s, i) { o[i] = s; }); return o; })(),
  openSequence: function (id) { acilan.push(id); tumu.forEach(function (s) { if (s.sequenceID === id) aktif = s; }); return true; },
  rootItem: { children: { numItems: 0 }, createBin: function () { return { name: "Suflo Shorts", type: 2 }; } }
};
var aktif = ana;
Object.defineProperty(proje, "activeSequence", {
  get: function () { return aktif; },
  set: function (v) { if (aktifAtamaCalisir) aktif = v; }
});
var ctx = { app: { version: "25.1.0", project: proje }, Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
  isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, File: function () { this.exists = true; }, Folder: function () {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
function call(fn, arg) { return JSON.parse(ctx[fn](encodeURIComponent(JSON.stringify(arg)))); }

/* KS_openSequenceById */
var o1 = call("KS_openSequenceById", { id: "s1" });
ok("openSequenceById: kimlikle bulur, etkin yapar, boyut / süre / fps döner", o1.ok && aktif === kisa1 && o1.id === "s1" && o1.width === 1080 && o1.height === 1920 &&
  Math.abs(o1.end - 30) < 1e-9 && Math.abs(o1.fps - 30) < 1e-6 && acilan.length === 0, JSON.stringify(o1));
ok("openSequenceById: 'Suflo Paket ·' katman adlarını listeler (devam için)", o1.paket.length === 1 && o1.paket[0] === "Suflo Paket · Altyazı", JSON.stringify(o1.paket));
aktifAtamaCalisir = false;
var o2 = call("KS_openSequenceById", { id: "s2" });
ok("openSequenceById: activeSequence ataması tutmazsa openSequence yedeği", o2.ok && aktif === kisa2 && acilan.join() === "s2", JSON.stringify(o2));
var eskiAc = proje.openSequence;
proje.openSequence = function (id) { acilan.push(id); };   // açmıyor
var o3 = call("KS_openSequenceById", { id: "ana" });
ok("openSequenceById: açılamazsa hata (etkin sekans doğrulanır)", !o3.ok && /acilamadi/.test(o3.error) && aktif === kisa2, JSON.stringify(o3));
proje.openSequence = eskiAc;
aktifAtamaCalisir = true;
ok("openSequenceById: olmayan / boş kimlik", !call("KS_openSequenceById", { id: "yok" }).ok && /bulunamadi/.test(call("KS_openSequenceById", { id: "yok" }).error) &&
  !call("KS_openSequenceById", {}).ok);

/* KS_findSequenceByName */
var f1 = call("KS_findSequenceByName", { name: "Shorts 1 · Sır 9x16" });
ok("findSequenceByName: aynı adlıların en sonuncusu, sayısıyla", f1.ok && f1.id === "s3" && f1.count === 2, JSON.stringify(f1));
ok("findSequenceByName: bilinen kimlikler hariç tutulur", call("KS_findSequenceByName", { name: "Shorts 1 · Sır 9x16", haric: ["s3"] }).id === "s1");
ok("findSequenceByName: tüm eşleşen kimlikler (ids), hariçler dışında", (function () {
  var r = call("KS_findSequenceByName", { name: "Shorts 1 · Sır 9x16" }), r2 = call("KS_findSequenceByName", { name: "Shorts 1 · Sır 9x16", haric: ["s1"] });
  return r.ids.join() === "s1,s3" && r2.ids.join() === "s3" && call("KS_findSequenceByName", { name: "yok" }).ids.length === 0;
})());
ok("findSequenceByName: bulunamazsa boş kimlik, ad yoksa hata", call("KS_findSequenceByName", { name: "yok" }).id === "" && !call("KS_findSequenceByName", {}).ok);

/* KS_sequenceSufloLayers */
var l1 = call("KS_sequenceSufloLayers", { id: "s1" });
ok("sequenceSufloLayers: ada, dosya adına ve 'Suflo Altyazi' kutusuna göre sayar; paket ayrı", l1.ok && l1.altyazi === 3 && l1.kanca === 1 && l1.paket === 1 && l1.toplam === 4, JSON.stringify(l1));
ok("sequenceSufloLayers: temiz Short'ta sıfır", (function () { var r = call("KS_sequenceSufloLayers", { id: "s2" }); return r.ok && r.toplam === 0 && r.altyazi === 0; })());
ok("sequenceSufloLayers: kimlik verilmezse etkin sekans", (function () { aktif = ana; var r = call("KS_sequenceSufloLayers", {}); return r.ok && r.altyazi === 1; })());

/* KS_disableSufloCaptions: 9:16 Short'ta miras altyazı katmanları kapatılır (paketinki ve kanca dokunulmaz) */
var d1 = call("KS_disableSufloCaptions", { id: "s1" });
var kapali = [];
for (var ti = 0; ti < kisa1.videoTracks.numTracks; ti++) for (var ci = 0; ci < kisa1.videoTracks[ti].clips.numItems; ci++) {
  var kl = kisa1.videoTracks[ti].clips[ci]; if (kl.disabled === true) kapali.push(kl.name);
}
ok("disableSufloCaptions: yalnız miras altyazılar kapanır", d1.ok && d1.altyazi === 3 && d1.kapatilan === 3 && kapali.length === 3 &&
  kapali.indexOf("Suflo Paket · Altyazı") === -1 && kapali.indexOf("Suflo Kanca · Bunu bil") === -1 && kapali.indexOf("video.mp4") === -1, JSON.stringify(d1) + " " + kapali.join(","));
ok("disableSufloCaptions: kimliksiz / bilinmeyen sekansta hata, etkin sekansa dokunmaz", !call("KS_disableSufloCaptions", {}).ok && !call("KS_disableSufloCaptions", { id: "yok" }).ok);
ok("disableSufloCaptions: ikinci çağrı aynı sonucu verir (zaten kapalı)", (function () { var r = call("KS_disableSufloCaptions", { id: "s1" }); return r.ok && r.kapatilan === 3; })());
ok("disableSufloCaptions: salt-okunur disabled sayılmaz", (function () {
  var ro = sekans("s9", "ro", [iz([klip("Suflo Stil · x", "C:\\a\\suflo-altyazi-1.mov")])]);
  Object.defineProperty(ro.videoTracks[0].clips[0], "disabled", { get: function () { return false; }, set: function () {} });
  tumu.push(ro); proje.sequences[proje.sequences.numSequences] = ro; proje.sequences.numSequences++;
  var r = call("KS_disableSufloCaptions", { id: "s9" });
  return r.ok && r.altyazi === 1 && r.kapatilan === 0;
})());

/* KS_makeShorts sourceId: bir Short açıkken asla Short'un alt sekansı oluşmaz */
var altKaynak = [];
tumu.forEach(function (s) {
  s.createSubsequence = function () {
    altKaynak.push(s.sequenceID);
    var alt = { sequenceID: "alt-" + s.sequenceID, projectItem: { moveBin: function () {} } };
    return alt;
  };
});
aktif = kisa1;
var m1 = call("KS_makeShorts", { ranges: [{ start: 1, end: 5, name: "x" }], sourceId: "ana" });
ok("makeShorts sourceId: Short açıkken önce kaynak açılır, alt sekans kaynaktan", m1.ok && altKaynak.join() === "ana" && aktif === ana, JSON.stringify(m1));
aktif = kisa1;
aktifAtamaCalisir = false;
proje.openSequence = function (id) { acilan.push(id); };
var m2 = call("KS_makeShorts", { ranges: [{ start: 1, end: 5, name: "x" }], sourceId: "ana" });
ok("makeShorts sourceId: kaynak açılamazsa reddeder, Short'tan alt sekans yapılmaz", !m2.ok && /Kaynak sekans acilamadi/.test(m2.error) && altKaynak.join() === "ana", JSON.stringify(m2));
aktifAtamaCalisir = true;
proje.openSequence = eskiAc;
aktif = kisa1;
var m3 = call("KS_makeShorts", { ranges: [{ start: 1, end: 5, name: "x" }] });
ok("makeShorts: sourceId yoksa eski davranış (etkin sekans)", m3.ok && altKaynak[altKaynak.length - 1] === "s1");

/* KS_placeOverlay expectSeqId */
aktif = kisa2;
var p1 = call("KS_placeOverlay", { path: "C:/x.mov", at: 0, name: "Suflo Paket · Çerçeve", expectSeqId: "s1" });
ok("placeOverlay expectSeqId: etkin sekans farklıysa reddeder (içe aktarmadan önce)", !p1.ok && /Etkin sekans degisti/.test(p1.error), JSON.stringify(p1));
var ice = 0;
proje.importFiles = function () { ice++; };
proje.rootItem.findItemsMatchingMediaPath = function () { return []; };
proje.rootItem.children = { numItems: 0 };
var p2 = call("KS_placeOverlay", { path: "C:/x.mov", at: 0, name: "x", expectSeqId: "s2" });
ok("placeOverlay expectSeqId: aynı sekansta yerleştirmeye geçer", ice === 1 && !/Etkin sekans/.test(p2.error || ""), JSON.stringify(p2));

var src = fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8");
ok("host: paket öneki ExtendScript'te kaçışlı (\\u00B7)", /var KS_PAKET_ONEKI = "Suflo Paket \\u00B7";/.test(src));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
