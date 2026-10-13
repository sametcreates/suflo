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
  durum = { importCount: 0, qe: 0, yeniSekans: 0, highlightYazildi: 0, removed: 0, sonKlip: null, konumYazilan: null, olcekYazilan: null, ezilen: [] };
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
  function kullaniciKlibi(ad, a, b) { return { name: ad, start: { seconds: a }, end: { seconds: b }, remove: function () {} }; }

  /*
   * Sekans: Premiere'in importMGT'si gibi OVERWRITE eder: şablon tam süresiyle (3600 sn) düşer, [bas, bas + 3600]
   * aralığındaki kullanıcı klipleri silinir / kırpılır (durum.ezilen); uç kırpılınca geri gelmezler.
   */
  function sekans(ad, kimlik, izler) {
    var tracks = izler.map(function (liste) { return track(liste); });
    var videoTracks = { numTracks: tracks.length };
    function izleriDiz() { videoTracks.numTracks = tracks.length; tracks.forEach(function (t, i) { videoTracks[i] = t; }); }
    izleriDiz();
    var seq = {
      name: ad, sequenceID: kimlik, videoTracks: videoTracks, tracks: tracks,
      izEkle: function () { tracks.push(track([])); izleriDiz(); },
      getSettings: function () { return { videoFrameWidth: o.w || 1920, videoFrameHeight: o.h || 1080 }; },
      timebase: String(TPS / 25),
      importMGT: function (p, ticks, ti) {
        durum.importCount++;
        if (o.importNull) return null;
        var t = tracks[ti];
        var bas = Number(ticks) / TPS, son = bas + 3600;
        for (var k = t.items.length - 1; k >= 0; k--) {
          var c = t.items[k];
          if (c.end.seconds > bas + 1e-6 && c.start.seconds < son - 1e-6) {
            durum.ezilen.push(c.name);
            if (c.start.seconds < bas) c.end = { seconds: bas }; else t.items.splice(k, 1);
          }
        }
        var endS = { seconds: son };
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
    return seq;
  }
  var v2 = [];
  if (o.dolu) v2.push(kullaniciKlibi("Kullanıcı başlığı", 11, 13));
  // Altyazı aralığından SONRA kullanıcı klibi (alt üçlü / bitiş kartı): import ayak izinde
  if (o.sonraki) v2.push(kullaniciKlibi("Kullanıcı alt üçlüsü", 60, 65));
  var seq = sekans("Ana", "seq-A", [[kullaniciKlibi("Video", 0, 100)], v2]);
  var seqB = sekans("İkinci", "seq-B", [[kullaniciKlibi("B videosu", 0, 50)], []]);
  var tracks = seq.tracks;
  var project = {
    activeSequence: o.sekansYok ? null : seq,
    sequences: { numSequences: 2, 0: seq, 1: seqB },
    createNewSequence: function () { durum.yeniSekans++; }, createNewSequenceFromClips: function () { durum.yeniSekans++; }
  };
  var ctx = {
    app: {
      version: o.app || "25.2.0",
      project: project,
      enableQE: function () { durum.qe++; }
    },
    // QE yalnız KS_prepareCaptionMogrt'un üst iz açması için (KS_addTopVideoTrack)
    qe: { project: { getActiveSequence: function () { return { addTracks: function () { project.activeSequence.izEkle(); } }; } } },
    Time: FakeTime, File: FakeFile, Folder: function () {},
    Math: Math, Number: Number, String: String, Error: Error, isFinite: isFinite,
    decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, JSON: JSON,
    $: { sleep: function () {} }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), ctx, { filename: "jsx/host.jsx" });
  return {
    call: function (name, value) { return JSON.parse(ctx[name](encodeURIComponent(JSON.stringify(value || {})))); },
    track: tracks[1], seq: seq, seqB: seqB, jsonOku: function () { return JSON.parse(jsonHam).textEditValue; },
    etkin: function (s) { project.activeSequence = s; }
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

/* ---- 3.3 adım 21 incelemesi: importMGT'nin 1 saatlik ayak izi (overwrite) ---- */
s = senaryo({ sonraki: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({}));
ok("Altyazı aralığından SONRA kullanıcı klibi (60-65 sn) varsa 'dolu': importMGT çağrılmaz, klip ezilmez",
  !r.ok && r.kod === "dolu" && durum.importCount === 0 && durum.ezilen.length === 0 &&
  s.track.items.length === 1 && s.track.items[0].name === "Kullanıcı alt üçlüsü" && s.track.items[0].end.seconds === 65, JSON.stringify(r) + " " + JSON.stringify(durum.ezilen));
s = senaryo({ sonraki: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({ start: 70, end: 74 }));
ok("Kullanıcı klibinin SONRASINA yerleştirme serbest (ayak izi yalnız başlangıçtan ileri)", r.ok && durum.ezilen.length === 0 && s.track.items.length === 2, JSON.stringify(r));
s = senaryo({});
var r1 = s.call("KS_placeCaptionJsonMogrt", girdi({ start: 10, end: 14.2 }));
var r2 = s.call("KS_placeCaptionJsonMogrt", girdi({ start: 14.2, end: 20 }));
ok("Aynı gruptaki ardışık parça: önceki parça kırpıldığı için iz boş, ikisi de yerleşir, hiçbir şey ezilmez",
  r1.ok && r2.ok && durum.ezilen.length === 0 && s.track.items.length === 2 && s.track.items[0].end.seconds === 14.2, JSON.stringify([r1, r2, durum.ezilen]));
s = senaryo({ sonraki: true });
r = s.call("KS_placeCaptionJsonMogrt", girdi({ iz: 0 }));
ok("Geçersiz 'iz' ayak izini daraltmaz (varsayılan 3600 sn): yine 'dolu'", !r.ok && r.kod === "dolu" && durum.importCount === 0, JSON.stringify(r));

// Hazırlık: iz ilk parçadan son parça + 1 saate kadar boş olmalı; değilse yeni üst iz açılır
s = senaryo({ sonraki: true });
var pr2 = s.call("KS_prepareCaptionMogrt", { path: SABLON, start: 10, end: 40 + 3600 });
ok("Hazırlık: V2 altyazı aralığında boş ama sonrasında kullanıcı klibi var → V2 seçilmez, yeni üst iz (V3) açılır",
  pr2.ok && pr2.track === 2 && pr2.trackName === "V3" && pr2.newTrack === true, JSON.stringify(pr2));
s = senaryo({});
pr2 = s.call("KS_prepareCaptionMogrt", { path: SABLON, start: 10, end: 40 + 3600 });
ok("Hazırlık: V2 tamamen boşsa V2 (yeni iz açılmaz)", pr2.ok && pr2.track === 1 && !pr2.newTrack, JSON.stringify(pr2));

/* ---- Sekans sabitleme: parçalar yoklanan sekansa; kaldırma o sekanstan ---- */
s = senaryo({});
pr = s.call("KS_captionJsonMogrtProbe");
ok("Yoklama sekans kimliğini ve adını verir", pr.ok && pr.seqId === "seq-A" && pr.seqName === "Ana", JSON.stringify(pr));
r = s.call("KS_placeCaptionJsonMogrt", girdi({ expectSeqId: "seq-A" }));
ok("Beklenen sekans etkinse yerleşir", r.ok, JSON.stringify(r));
s.etkin(s.seqB);
var rB2 = s.call("KS_placeCaptionJsonMogrt", girdi({ start: 20, end: 24, expectSeqId: "seq-A" }));
ok("Kullanıcı arada başka sekansa geçtiyse 'sekans': B'ye hiçbir şey konmaz", !rB2.ok && rB2.kod === "sekans" && durum.importCount === 1 &&
  s.seqB.tracks[1].items.length === 0, JSON.stringify(rB2));
var hazirB = s.call("KS_prepareCaptionMogrt", { path: SABLON, start: 0, end: 3600, expectSeqId: "seq-A" });
ok("Hazırlık da beklenen sekansı denetler", !hazirB.ok && hazirB.kod === "sekans", JSON.stringify(hazirB));
var rmB = s.call("KS_removeCaptionMogrtBatch", { batch: "efk-test", seqId: "seq-A" });
ok("Kaldırma kimlikle o sekanstan (etkin sekans B olsa da): A'daki grup silinir", rmB.ok && rmB.removed === 1 && s.track.items.length === 0, JSON.stringify(rmB));
var rmYok = s.call("KS_removeCaptionMogrtBatch", { batch: "efk-test", seqId: "seq-silinmis" });
ok("Kayıttaki sekans projede yoksa 'sekans' hatası (etkin sekansa dokunulmaz)", !rmYok.ok && rmYok.kod === "sekans", JSON.stringify(rmYok));

/* ---- Kaynak denetimi ---- */
var host = fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8");
var govde = host.slice(host.indexOf("function KS_captionJsonParam("), host.indexOf(" * Motion BG / overlay video"));
ok("Uyarlanan kod başlığı: kaynak, lisans ve THIRD_PARTY_NOTICES", /Portions adapted from TranscriptAI \/ Animated Captions/.test(host) &&
  /MIT License, Copyright \(c\) 2026 Aktug Antika/.test(host) && /See THIRD_PARTY_NOTICES\.md/.test(host));
ok("Yerleştirmede QE, razor, iz kilidi, ses izi silme, iç içe sekans yok",
  govde.length > 500 && !/enableQE|razor|setLocked|removeAudioTrack|createNewSequence|openSequence|overwriteClip/.test(govde));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
