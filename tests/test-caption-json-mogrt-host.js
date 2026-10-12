/*
 * 3.3 adım 21 — jsx/host.jsx KS_placeCaptionJsonMogrt / KS_captionJsonMogrtProbe (Premiere sahte nesneleriyle):
 * JSON_Input'u görünen adla bulma, setValue + geri okuma doğrulaması, Caption_Position (piksel / oran), Motion ›
 * Scale, süre kırpma, grup adı ve kaldırma, dolu aralığı ezmeme, her hatada klibi silme, QE / iç içe sekans yok.
 * Çalıştır: node tests/test-caption-json-mogrt-host.js
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");
var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (evidence === undefined ? "" : "   [" + String(evidence).slice(0, 260) + "]")); }
}

var TPS = 254016000000;
function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", { get: function () { return String(Math.round(this.seconds * TPS)); } });
function FakeFile(p) { this.fsName = String(p || ""); this.name = path.basename(this.fsName); this.exists = /\.mogrt$/i.test(this.fsName); }

var durum;   // her senaryoda sıfırlanır
function senaryo(o) {
  o = o || {};
  durum = { importCount: 0, qe: 0, yeniSekans: 0, highlightYazildi: 0, removed: 0, sonKlip: null, konumYazilan: null, olcekYazilan: null };
  var jsonHam = JSON.stringify({ textEditValue: "", fontTextRunLength: [0], fontTextRunStart: [0] });
  var jsonProp = {
    displayName: "JSON_Input",
    getValue: function () { return jsonHam; },
    setValue: function (v) {
      if (o.kirp) { var obj = JSON.parse(v); obj.textEditValue = obj.textEditValue.slice(0, 100); v = JSON.stringify(obj); }
      jsonHam = v;
    }
  };
  var konumDeger = o.oranli ? [0.5, 0.9009] : [960, 973];
  var konumProp = {
    displayName: "Caption_Position",
    getValue: function () { return konumDeger; },
    setValue: function (v) { konumDeger = v; durum.konumYazilan = v; }
  };
  var hlProp = { displayName: "Highlight_Color", getValue: function () { return [1, 0, 0, 1]; }, setValue: function () { durum.highlightYazildi++; } };
  var liste = o.jsonYok ? [hlProp, konumProp] : [hlProp, jsonProp, konumProp];
  var props = { numItems: liste.length };
  liste.forEach(function (p, i) { props[i] = p; });
  if (!o.adlaBulmaYok) props.getParamForDisplayName = function (ad) { for (var i = 0; i < liste.length; i++) if (liste[i].displayName === ad) return liste[i]; return null; };
  var mgt = { properties: props };

  var olcekDeger = 100;
  var olcekProp = { matchName: "ADBE Scale", displayName: "Scale", getValue: function () { return olcekDeger; }, setValue: function (v) { olcekDeger = v; durum.olcekYazilan = v; } };
  var motion = { matchName: "AE.ADBE Motion", displayName: "Motion", properties: { numItems: 1, 0: olcekProp } };

  var tracks = [];
  function track(onceki) {
    var items = (onceki || []).slice();
    var clips = { numItems: 0 };
    function reindex() {
      Object.keys(clips).forEach(function (k) { if (/^\d+$/.test(k)) delete clips[k]; });
      clips.numItems = items.length;
      items.forEach(function (c, i) { clips[i] = c; });
    }
    reindex();
    return { clips: clips, items: items, reindex: reindex, isLocked: function () { return false; } };
  }
  tracks.push(track([{ name: "Video", start: { seconds: 0 }, end: { seconds: 100 }, remove: function () {} }]));
  tracks.push(track(o.dolu ? [{ name: "Kullanıcı başlığı", start: { seconds: 11 }, end: { seconds: 13 }, remove: function () {} }] : []));

  var videoTracks = { numTracks: tracks.length };
  tracks.forEach(function (t, i) { videoTracks[i] = t; });
  var seq = {
    name: "Ana", videoTracks: videoTracks,
    getSettings: function () { return { videoFrameWidth: o.w || 1920, videoFrameHeight: o.h || 1080 }; },
    timebase: String(TPS / 25),
    importMGT: function (p, ticks, ti) {
      durum.importCount++;
      if (o.importNull) return null;
      var t = tracks[ti];
      var bas = Number(ticks) / TPS;
      var endS = { seconds: bas + 3600 };
      var clip = {
        name: "dinamik_altyazi_motoru_yeni",
        start: { seconds: bas },
        components: { numItems: 1, 0: motion },
        getMGTComponent: function () { return o.mgtYok ? null : mgt; },
        remove: function () { durum.removed++; t.items.splice(t.items.indexOf(clip), 1); t.reindex(); }
      };
      Object.defineProperty(clip, "end", {
        get: function () { return endS; },
        set: function (v) { if (!o.sureSabit) endS = { seconds: v.seconds }; }
      });
      t.items.push(clip); t.reindex();
      durum.sonKlip = clip;
      return clip;
    }
  };
  var ctx = {
    app: {
      version: o.app || "25.2.0",
      project: { activeSequence: o.sekansYok ? null : seq, createNewSequence: function () { durum.yeniSekans++; }, createNewSequenceFromClips: function () { durum.yeniSekans++; } },
      enableQE: function () { durum.qe++; }
    },
    Time: FakeTime, File: FakeFile, Folder: function () {},
    Math: Math, Number: Number, String: String, Error: Error, isFinite: isFinite,
    decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, JSON: JSON,
    $: { sleep: function () {} }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), ctx, { filename: "jsx/host.jsx" });
  return {
    call: function (name, value) { return JSON.parse(ctx[name](encodeURIComponent(JSON.stringify(value || {})))); },
    track: tracks[1], jsonOku: function () { return JSON.parse(jsonHam).textEditValue; }
  };
}

var SABLON = "C:\\Suflo\\assets\\mogrt\\altyazi-efekt-v1.mogrt";
var JSON_GIRDI = JSON.stringify([[255, 210, 63], [255, 255, 255], "Montserrat-Bold", 76, [1, 0, 0, 0, 5], [0], [0], 2, 1,
  [[0, 1200, "Merhaba \"dünya\"\nnasılsın", [0, 400, 400, 800, 800, 1200]]]]);
function girdi(ek) {
  var p = { path: SABLON, track: 1, batch: "efk-test", start: 10, end: 14.2, json: JSON_GIRDI, konum: [960, 907.2], konumOran: [0.5, 0.84], olcek: 100 };
  for (var k in ek) p[k] = ek[k];
  return p;
}

/* ---- Yoklama ---- */
var s = senaryo({ w: 1080, h: 1920 });
var pr = s.call("KS_captionJsonMogrtProbe");
ok("Yoklama: sürüm, importMGT, sekans boyutu ve fps", pr.ok && pr.app === "25.2.0" && pr.importMGT === true && pr.width === 1080 && pr.height === 1920 && pr.fps === 25, JSON.stringify(pr));
ok("Yoklama hiçbir şey içe aktarmaz, QE açmaz", durum.importCount === 0 && durum.qe === 0);
s = senaryo({ sekansYok: true });
pr = s.call("KS_captionJsonMogrtProbe");
ok("Yoklama: sekans yoksa seq false", pr.ok && pr.seq === false, JSON.stringify(pr));
var ap = senaryo({}).call("KS_apiProbe");
ok("KS_apiProbe (Doctor): importMGT alanı", ap.ok && ap.importMGT === true, JSON.stringify(ap).slice(0, 200));

/* ---- Başarılı yerleştirme ---- */
s = senaryo({});
var r = s.call("KS_placeCaptionJsonMogrt", girdi({}));
ok("Yerleştirme başarılı: iz, başlangıç, kırpılmış bitiş", r.ok && r.trackName === "V2" && r.start === 10 && Math.abs(r.end - 14.2) < 1e-9, JSON.stringify(r));
ok("Klip istenen tickte ve izde (importMGT bir kez)", durum.importCount === 1 && s.track.items.length === 1 && s.track.items[0].start.seconds === 10);
ok("JSON_Input görünen adla bulunur, metin olduğu gibi yazılır ve geri okunur", s.jsonOku() === JSON_GIRDI, s.jsonOku());
ok("Klip adı grup adıyla: 'Suflo Caption · efk-test'", s.track.items[0].name === "Suflo Caption · efk-test", s.track.items[0].name);
ok("Caption_Position piksel olarak yazılır (varsayılan 960,973 px)", r.konum === true && durum.konumYazilan && durum.konumYazilan[0] === 960 && durum.konumYazilan[1] === 907.2, JSON.stringify(durum.konumYazilan));
ok("Ölçek %100 iken Motion › Scale'e dokunulmaz", durum.olcekYazilan === null && r.olcek === true);
ok("Highlight_Color'a hiç yazılmaz (şablon onu yok sayar; renk JSON'dan)", durum.highlightYazildi === 0);
ok("QE yok, iç içe / yeni sekans yok", durum.qe === 0 && durum.yeniSekans === 0, JSON.stringify(durum));
var rm = s.call("KS_removeCaptionMogrtBatch", { batch: "efk-test" });
ok("Grup kaldırma yalnız bu grubun klibini siler", rm.ok && rm.removed === 1 && s.track.items.length === 0, JSON.stringify(rm));

/* ---- Oranlı konum, ölçek, görünen ad listesi ---- */
s = senaryo({ oranli: true, adlaBulmaYok: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({ olcek: 177.78, konum: [960, 799.2], konumOran: [0.5, 0.74] }));
ok("getParamForDisplayName yoksa özellik listesinden ada göre bulunur", r.ok && s.jsonOku() === JSON_GIRDI, JSON.stringify(r));
ok("Değer oranla tutuluyorsa Caption_Position 0-1 yazılır", r.konum === true && durum.konumYazilan[0] === 0.5 && durum.konumYazilan[1] === 0.74, JSON.stringify(durum.konumYazilan));
ok("9:16: Motion › Scale %177,78 yazılır ve geri okunur", r.olcek === true && durum.olcekYazilan === 177.78, durum.olcekYazilan);

/* ---- Hatalar: klip her zaman silinir ---- */
s = senaryo({ dolu: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({}));
ok("Dolu aralık ezilmez: 'dolu' ve importMGT hiç çağrılmaz", !r.ok && r.kod === "dolu" && durum.importCount === 0 && s.track.items.length === 1, JSON.stringify(r));
s = senaryo({ kirp: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({ json: JSON.stringify([[1, 2, 3], [4, 5, 6], "Arial", 60, [0], [0], [0], 0, 0, [[0, 1000, new Array(60).join("uzun "), []]]]) }));
ok("Geri okunan JSON farklıysa 'dogrulama' ve klip silinir", !r.ok && r.kod === "dogrulama" && durum.removed === 1 && s.track.items.length === 0, JSON.stringify(r));
s = senaryo({ jsonYok: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({}));
ok("JSON_Input yoksa 'sozlesme' ve klip silinir", !r.ok && r.kod === "sozlesme" && durum.removed === 1, JSON.stringify(r));
s = senaryo({ mgtYok: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({}));
ok("EG bileşeni açılmazsa 'bilesen' ve klip silinir", !r.ok && r.kod === "bilesen" && durum.removed === 1, JSON.stringify(r));
s = senaryo({ importNull: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({}));
ok("importMGT boş dönerse 'ice-aktarma'", !r.ok && r.kod === "ice-aktarma", JSON.stringify(r));
s = senaryo({ sureSabit: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({}));
ok("Klip altyazı süresine kırpılamazsa 'sure' ve klip silinir (1 saatlik klip kalmaz)", !r.ok && r.kod === "sure" && durum.removed === 1 && s.track.items.length === 0, JSON.stringify(r));
s = senaryo({});
r = s.call("KS_placeCaptionJsonMogrt", girdi({ path: "C:\\x\\yok.txt" }));
ok("Şablon yolu .mogrt değilse içe aktarma denenmez", !r.ok && r.kod === "ice-aktarma" && durum.importCount === 0, JSON.stringify(r));
r = s.call("KS_placeCaptionJsonMogrt", girdi({ json: "" }));
ok("Boş veri reddedilir", !r.ok && r.kod === "girdi" && durum.importCount === 0, JSON.stringify(r));
r = s.call("KS_placeCaptionJsonMogrt", girdi({ track: 9 }));
ok("Olmayan iz reddedilir", !r.ok && r.kod === "girdi", JSON.stringify(r));

/* ---- Kaynak denetimi ---- */
var host = fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8");
var govde = host.slice(host.indexOf("function KS_captionJsonParam("), host.indexOf(" * Motion BG / overlay video"));
ok("Uyarlanan kod başlığı: kaynak, lisans ve THIRD_PARTY_NOTICES", /Portions adapted from TranscriptAI \/ Animated Captions/.test(host) &&
  /MIT License, Copyright \(c\) 2026 Aktug Antika/.test(host) && /See THIRD_PARTY_NOTICES\.md/.test(host));
ok("Yerleştirmede QE, razor, iz kilidi, ses izi silme, iç içe sekans yok",
  govde.length > 500 && !/enableQE|razor|setLocked|removeAudioTrack|createNewSequence|openSequence|overwriteClip/.test(govde));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
