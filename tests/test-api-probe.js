// Suflo testi: KS_apiProbe (Premiere API yoklamasi, projeye dokunmaz) + Doctor satirlari
var fs = require("fs"), path = require("path"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 220) + "]" : "")); }

function host(seq, qeVar, proje) {
  var degisti = [];
  var prj = proje || {};
  prj.activeSequence = seq;
  var ctx = { app: { version: "25.1.0", project: prj, enableQE: function () {} },
    Time: function () {}, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, isFinite: isFinite,
    Math: Math, String: String, Number: Number, Error: Error, File: function () {}, Folder: function () {} };
  if (qeVar) ctx.qe = { project: {
    getActiveSequence: function () {
      return { addTracks: function () { degisti.push("addTracks"); },
        getVideoTrackAt: function (i) { return i === 0 ? qeIz : null; } };
    },
    undoStackIndex: function () { degisti.push("undoStackIndex"); throw new Error("cagrilmamali"); }
  } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
  return { r: JSON.parse(ctx.KS_apiProbe()), degisti: degisti };
}
var klip = { disabled: false };
// Hız Rampası yoklaması: QE öğesinin yazıcıları ve .reverse dokunulursa patlar (26.3.2'de betiği öldürür)
var cagrilan = [];
function patla(ad) { return function () { cagrilan.push(ad); throw new Error(ad + " cagrilmamali"); }; }
var qeOge = { type: "Clip", setSpeed: patla("setSpeed"), setTimeInterpolationType: patla("setTimeInterpolationType"), setFrameBlend: patla("setFrameBlend"),
  setReverse: patla("setReverse") };
Object.defineProperty(qeOge, "reverse", { get: function () { cagrilan.push(".reverse"); throw new Error(".reverse okunmamali"); } });
var qeIz = { numItems: 2, getItemAt: function (j) { return j === 0 ? { type: "Empty" } : qeOge; } };
var vKlip = { getSpeed: patla("getSpeed"), components: { numItems: 2, 0: { matchName: "AE.ADBE Opacity", displayName: "Opacity" }, 1: { matchName: "AE.ADBE Motion", displayName: "Motion" } } };
var tamSeq = { createSubsequence: function () { throw new Error("cagrilmamali"); }, autoReframeSequence: function () { throw new Error("cagrilmamali"); },
  markers: { createMarker: function () { throw new Error("cagrilmamali"); } },
  unlinkSelection: patla("unlinkSelection"), linkSelection: patla("linkSelection"),
  videoTracks: { numTracks: 1, 0: { clips: { numItems: 1, 0: vKlip } } },
  audioTracks: { numTracks: 1, 0: { isMuted: function () { return false; }, clips: { numItems: 1, 0: klip } } } };
// Rehberin ornek klibi: createNewSequenceFromClips yalniz typeof ile yoklanir, ASLA cagrilmaz
var sekansYapildi = 0;
function modernProje() { return { createNewSequenceFromClips: function () { sekansYapildi++; throw new Error("cagrilmamali"); } }; }
var t = host(tamSeq, true, modernProje());
ok("tam Premiere: hepsi var", t.r.ok && t.r.subsequence && t.r.autoReframe && t.r.markers && t.r.qe && t.r.qeAddTracks && t.r.trackItemDisabled && t.r.trackMuted && t.r.seqFromClips === true && t.r.app === "25.1.0", JSON.stringify(t.r));
ok("yoklama hicbir seyi cagirmaz/degistirmez", t.degisti.length === 0 && klip.disabled === false && sekansYapildi === 0);
ok("hiz rampasi: setSpeed, kare harmanlama, undo endeksi, unlink/link, hiz okuma var", t.r.qeSetSpeed === true && t.r.qeTimeInterp === true && t.r.qeFrameBlend === true &&
  t.r.interp === true && t.r.qeUndoIndex === true && t.r.unlinkSelection === true && t.r.linkSelection === true && t.r.speedRead === true && t.r.timeRemapApi === false, JSON.stringify(t.r));
ok("hiz rampasi yoklamasi: hicbir yazici cagrilmadi, .reverse okunmadi, Empty boslugu atlandi", cagrilan.length === 0, cagrilan.join(","));
var eski = host({ markers: { createMarker: function () {} }, audioTracks: { numTracks: 0 } }, false);
ok("eski Premiere: alt sekans/Auto Reframe/QE yok", eski.r.subsequence === false && eski.r.autoReframe === false && eski.r.qe === false && eski.r.markers === true, JSON.stringify(eski.r));
ok("eski Premiere: klipten sekans yok (seqFromClips false)", eski.r.seqFromClips === false, JSON.stringify(eski.r));
ok("eski Premiere: QE yok → qeSetSpeed false, unlinkSelection false", eski.r.qeSetSpeed === false && eski.r.unlinkSelection === false && eski.r.interp === false, JSON.stringify(eski.r));
var yok = host(null, true, modernProje());
ok("sekans yok: sekans API'leri bilinmiyor (null)", yok.r.seq === false && yok.r.subsequence === null && yok.r.qeAddTracks === null && yok.r.qe === true, JSON.stringify(yok.r));
ok("sekans yok: seqFromClips proje duzeyinde yine raporlanir, cagrilmaz", yok.r.seqFromClips === true && sekansYapildi === 0, JSON.stringify(yok.r));
ok("sekans yok: hiz rampasi alanlari bilinmiyor (null)", yok.r.qeSetSpeed === null && yok.r.unlinkSelection === null && yok.r.speedRead === null && yok.r.timeRemapApi === null, JSON.stringify(yok.r));
var remapKlip = { getSpeed: patla("getSpeed"), components: { numItems: 1, 0: { matchName: "AE.ADBE Time Remap", displayName: "Time Remapping" } } };
var remapSeq = { markers: { createMarker: function () {} }, audioTracks: { numTracks: 0 }, videoTracks: { numTracks: 1, 0: { clips: { numItems: 1, 0: remapKlip } } } };
var remap = host(remapSeq, true, modernProje());
ok("Zaman Yeniden Esleme bileseni gorunurse timeRemapApi true (bilgi)", remap.r.timeRemapApi === true && cagrilan.length === 0, JSON.stringify(remap.r));

// Doctor satirlari (library-health.js'teki gercek apiKontrolleri)
var src = fs.readFileSync(path.join(__dirname, "..", "js", "library-health.js"), "utf8").replace(/\r\n/g, "\n");
var i = src.indexOf("  function apiKontrolleri(a) {"), j = src.indexOf("\n  }\n", i) + 4;
var AK = new Function(src.slice(i, j) + "\nreturn apiKontrolleri;")();
var iyi = AK(t.r);
ok("doctor: hepsi varsa tek yesil satir", iyi.length === 1 && iyi[0].status === "good", JSON.stringify(iyi));
var kotu = AK(eski.r);
ok("doctor: eksikler etkisiyle sari satir", kotu.some(function (c) { return c.status === "warn" && /Auto Reframe/.test(c.title) && /9:16/.test(c.detail); }) &&
  kotu.some(function (c) { return /QE DOM/.test(c.title); }), JSON.stringify(kotu.map(function (c) { return c.title; })));
ok("doctor: eski surumde 'QE hiz yazma (setSpeed)' sari satiri", kotu.some(function (c) { return c.status === "warn" && c.title === "Premiere'de yok: QE hız yazma (setSpeed)" && /Hız Rampası/.test(c.detail); }),
  JSON.stringify(kotu.map(function (c) { return c.title; })));
var bilgi = AK(remap.r);
ok("doctor: timeRemapApi true ise bilgi amacli yesil satir eklenir", bilgi.some(function (c) { return c.status === "good" && c.title === "Zaman Yeniden Eşleme API'si açık"; }), JSON.stringify(bilgi));
ok("doctor: hiz rampasi satirlari gerek listesinde", /k: "qeSetSpeed", ad: "QE hız yazma \(setSpeed\)"/.test(src) && /k: "unlinkSelection"/.test(src) && /k: "interp", ad: "Kare harmanlama \(setTimeInterpolationType\)"/.test(src) && /k: "speedRead"/.test(src));
ok("doctor: klipten sekans yoksa 'Yeni Oge simgesine surukle' satiri", kotu.some(function (c) {
  return c.status === "warn" && /createNewSequenceFromClips/.test(c.title) && /Yeni Öğe simgesine/.test(c.detail);
}), JSON.stringify(kotu.map(function (c) { return c.title; })));
var bilinmez = AK(yok.r);
ok("doctor: sekans yoksa 'sekans acip tekrar tara' notu", bilinmez.length === 1 && bilinmez[0].status === "good" && /sekans açıp tekrar tara/.test(bilinmez[0].detail), JSON.stringify(bilinmez));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
