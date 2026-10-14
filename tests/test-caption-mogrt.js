/*
 * Altyazı › Stil › Premiere şablonu (kullanıcı MOGRT'u): jsx/host.jsx KS_prepareCaptionMogrt / KS_placeCaptionMogrt
 * (Premiere sahte nesneleriyle) ve js/mogrt-sure.js (şablon süresi, ayak izi).
 * Sahte importMGT Premiere gibi OVERWRITE eder: şablon tam süresiyle düşer, [başlangıç, başlangıç + süre] aralığındaki
 * kullanıcı klipleri silinir / kırpılır ve uç sonra kırpılınca geri gelmez (durum.ezilen).
 * Çalıştır: node tests/test-caption-mogrt.js
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var zlib = require("zlib");

var ROOT = path.join(__dirname, "..");
var MSURE = require(path.join(ROOT, "js", "mogrt-sure.js"));
var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (evidence === undefined ? "" : "   [" + String(evidence).slice(0, 240) + "]")); }
}

var TPS = 254016000000;
function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", {
  get: function () { return String(Math.round(this.seconds * TPS)); }
});
function FakeFile(filePath) {
  this.fsName = String(filePath || "");
  this.name = path.basename(this.fsName);
  this.exists = /\.mogrt$/i.test(this.fsName);
}

var durum;   // her senaryoda sıfırlanır
/*
 * o: { sure (şablonun Premiere'deki süresi, sn; varsayılan 5), izler: [[{ ad, a, b }], …] (V1, V2, … kullanıcı klipleri) }
 */
function senaryo(o) {
  o = o || {};
  var SURE = o.sure > 0 ? o.sure : 5;
  durum = { importCount: 0, importedAt: "", ezilen: [], rawText: "", textProp: null };
  durum.rawText = JSON.stringify({ textEditValue: "PLACEHOLDER", fontTextRunLength: [11], fontTextRunStart: [0] });
  var textProp = {
    displayName: "Text",
    getValue: function () { return durum.rawText; },
    setValue: function (value, updateUI) { durum.rawText = value; this.updateUI = updateUI; }
  };
  durum.textProp = textProp;
  var props = {
    numItems: 1,
    0: textProp,
    getParamForDisplayName: function (name) { return name === "Text" ? textProp : null; }
  };
  var component = { properties: props };

  function track(onceki) {
    var items = (onceki || []).map(function (k) {
      return { name: k.ad, start: { seconds: k.a }, end: { seconds: k.b }, kullanici: true, remove: function () {} };
    });
    var clips = { numItems: 0 };
    function reindex() {
      Object.keys(clips).forEach(function (key) { if (/^\d+$/.test(key)) delete clips[key]; });
      clips.numItems = items.length;
      items.forEach(function (item, index) { clips[index] = item; });
    }
    reindex();
    return { clips: clips, items: items, reindex: reindex, isLocked: function () { return false; } };
  }
  var tracks = (o.izler || [[]]).map(function (liste) { return track(liste); });
  var videoTracks = { numTracks: 0 };
  function izleriDiz() { videoTracks.numTracks = tracks.length; tracks.forEach(function (t, i) { videoTracks[i] = t; }); }
  izleriDiz();
  var sequence = {
    name: "MOGRT Test",
    videoTracks: videoTracks,
    importMGT: function (filePath, ticks, ti) {
      durum.importCount++;
      durum.importedAt = String(ticks);
      var t = tracks[ti];
      var bas = Number(ticks) / TPS, son = bas + SURE;
      // Overwrite: şablonun tam süresi boyunca izdeki her şey ezilir (öncesi kırpılır, sonrası baştan kesilir)
      for (var k = t.items.length - 1; k >= 0; k--) {
        var c = t.items[k];
        if (c.end.seconds > bas + 1e-6 && c.start.seconds < son - 1e-6) {
          durum.ezilen.push(c.name);
          if (c.start.seconds < bas) c.end = { seconds: bas };
          else if (c.end.seconds > son) c.start = { seconds: son };
          else t.items.splice(k, 1);
        }
      }
      var endS = { seconds: son };
      var clip = {
        name: "Template",
        start: { seconds: bas },
        getMGTComponent: function () { return component; },
        remove: function () { t.items.splice(t.items.indexOf(clip), 1); t.reindex(); }
      };
      Object.defineProperty(clip, "end", {
        get: function () { return endS; },
        set: function (v) { endS = { seconds: v.seconds }; }
      });
      t.items.push(clip);
      t.reindex();
      return clip;
    }
  };
  var context = {
    app: {
      version: "26.0",
      project: { name: "test.prproj", activeSequence: sequence },
      enableQE: function () {}
    },
    // QE yalnız KS_prepareCaptionMogrt'un üst iz açması için (KS_addTopVideoTrack)
    qe: { project: { getActiveSequence: function () { return { addTracks: function () { tracks.push(track([])); izleriDiz(); } }; } } },
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
  return {
    ctx: context,
    tracks: tracks,
    call: function (name, value) { return JSON.parse(context[name](encodeURIComponent(JSON.stringify(value || {})))); },
    kullanici: function (ti) { return tracks[ti].items.filter(function (c) { return c.kullanici; }); },
    altyazilar: function (ti) { return tracks[ti].items.filter(function (c) { return !c.kullanici; }); }
  };
}

/* ---------- Bellekte .mogrt (zip) kurucu: definition.json (+ isteğe bağlı büyük medya) ---------- */
var CRC_TABLO = (function () {
  var t = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  var c = 0xffffffff;
  for (var i = 0; i < b.length; i++) c = CRC_TABLO[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
// girdiler: [{ ad, veri (Buffer), yontem (0 | 8), bayrak }]; o: { yorum, zip64 }
function zipYap(girdiler, o) {
  o = o || {};
  var yerel = [], dizin = [], konum = 0;
  girdiler.forEach(function (g) {
    var ad = Buffer.from(g.ad, "utf8");
    var yontem = g.yontem === 0 ? 0 : 8;
    var sikisik = yontem === 8 ? zlib.deflateRawSync(g.veri) : g.veri;
    var crc = crc32(g.veri);
    var lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(g.bayrak || 0, 6); lh.writeUInt16LE(yontem, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(sikisik.length, 18); lh.writeUInt32LE(g.veri.length, 22); lh.writeUInt16LE(ad.length, 26);
    var ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(g.bayrak || 0, 8); ch.writeUInt16LE(yontem, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(sikisik.length, 20); ch.writeUInt32LE(g.veri.length, 24); ch.writeUInt16LE(ad.length, 28);
    ch.writeUInt32LE(konum, 42);
    yerel.push(lh, ad, sikisik);
    dizin.push(ch, ad);
    konum += 30 + ad.length + sikisik.length;
  });
  var dizinBuf = Buffer.concat(dizin);
  var yorum = Buffer.from(o.yorum || "", "utf8");
  var e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(o.zip64 ? 0xffff : girdiler.length, 8); e.writeUInt16LE(o.zip64 ? 0xffff : girdiler.length, 10);
  e.writeUInt32LE(dizinBuf.length, 12); e.writeUInt32LE(o.zip64 ? 0xffffffff : konum, 16); e.writeUInt16LE(yorum.length, 20);
  return Buffer.concat(yerel.concat([dizinBuf, e, yorum]));
}
function tanim(sureler) {
  var loc = {};
  Object.keys(sureler).forEach(function (dil) {
    loc[dil] = { duration: sureler[dil], framerate: { ticksperframe: 8475667200 }, starttime: { scale: 1, value: 0 } };
  });
  return Buffer.from(JSON.stringify({ capsuleName: "9.16 Mr Beast Subtitles", sourceInfoLocalized: loc }), "utf8");
}
// oku sayacı: dosyadan kaç bayt okundu (şablonun medyası okunmamalı)
function okuyucu(buf) {
  var r = { okunan: 0 };
  r.oku = function (konum, uz) { var b = buf.slice(konum, konum + uz); r.okunan += b.length; return b; };
  return r;
}
function sure(buf) { return MSURE.sablonSuresi(okuyucu(buf).oku, buf.length, zlib.inflateRawSync); }

var SABLON_YOLU = "C:\\Templates\\9.16 Mr Beast Subtitles.mogrt";

/* ---- 1) Temel yerleştirme (boş V1) ---- */
var s = senaryo({});
var prep = s.call("KS_prepareCaptionMogrt", { path: SABLON_YOLU, start: 1.25, end: 3.5 });
ok("MOGRT altyazisi icin bos video katmani hazirlanir", prep.ok && prep.track === 0 && prep.trackName === "V1", JSON.stringify(prep));

var placed = s.call("KS_placeCaptionMogrt", { path: SABLON_YOLU, track: 0, batch: "cap-test", start: 1.25, end: 3.5, text: "Bunu mutlaka gör", iz: 5 });
var parsedText = JSON.parse(durum.rawText);
ok("MOGRT altyazi sablonu cue baslangicina yerlestirilir", placed.ok && durum.importedAt === String(Math.round(1.25 * TPS)), JSON.stringify(placed));
ok("Cue metni MOGRT Text kontrolune yazilir", parsedText.textEditValue === "Bunu mutlaka gör" && parsedText.fontTextRunLength[0] === 16, durum.rawText);
ok("MOGRT klibi cue bitis zamanina kirpilir", placed.end === 3.5 && s.altyazilar(0)[0].end.seconds === 3.5, JSON.stringify(placed));
ok("MOGRT altyazi klibi geri alma grubu icin adlandirilir", s.altyazilar(0)[0].name === "Suflo Caption · cap-test", s.altyazilar(0)[0].name);
ok("Sonuc kullanilan ayak izini ve sablonun kirpmadan onceki suresini verir", placed.iz === 5 && Math.abs(placed.dogal - 5) < 1e-9, JSON.stringify(placed));

var removed = s.call("KS_removeCaptionMogrtBatch", { batch: "cap-test" });
ok("Yarim kalan MOGRT altyazi grubu guvenle temizlenir", removed.ok && removed.removed === 1 && s.tracks[0].clips.numItems === 0, JSON.stringify(removed));

/* ---- 2) Sahte importMGT gerçekten overwrite eder (ayak izi eksik verilirse sonraki klip ezilir) ---- */
s = senaryo({ sure: 5, izler: [[{ ad: "Kullanıcı alt üçlüsü", a: 4, b: 6 }]] });
var r = s.call("KS_placeCaptionMogrt", { path: SABLON_YOLU, track: 0, batch: "cap-eksik", start: 1.25, end: 2, text: "a", iz: 0.5 });
ok("Sahte importMGT: sablonun 5 sn'lik ayak izindeki 4-6 sn klibi siler, kirpma geri getirmez (iz eksik verilirse)",
  r.ok && durum.ezilen.indexOf("Kullanıcı alt üçlüsü") !== -1 && s.kullanici(0).length === 0 && s.altyazilar(0)[0].end.seconds === 2,
  JSON.stringify(durum.ezilen));
s = senaryo({ sure: 5, izler: [[{ ad: "Uzun klip", a: 4, b: 9 }]] });
r = s.call("KS_placeCaptionMogrt", { path: SABLON_YOLU, track: 0, batch: "cap-eksik", start: 1.25, end: 2, text: "a", iz: 0.5 });
ok("Sahte importMGT: ayak izinden tasan klibin basi kesilir (4 -> 6.25)",
  r.ok && durum.ezilen.length === 1 && s.kullanici(0)[0].start.seconds === 6.25 && s.kullanici(0)[0].end.seconds === 9, JSON.stringify(durum.ezilen));

/* ---- 3) Altyazı aralığından HEMEN SONRA kullanıcı klibi: ezilmez ---- */
var SONRAKI = [[{ ad: "Kullanıcı alt üçlüsü", a: 4, b: 6 }]];
s = senaryo({ sure: 5, izler: SONRAKI });
r = s.call("KS_placeCaptionMogrt", { path: SABLON_YOLU, track: 0, batch: "cap-dolu", start: 1.25, end: 3.5, text: "a", iz: 5 });
ok("Altyazi araligi (1.25-3.5) bos ama sablonun ayak izinde (-6.25) kullanici klibi var: 'dolu', importMGT cagrilmaz",
  !r.ok && r.kod === "dolu" && durum.importCount === 0 && durum.ezilen.length === 0 &&
  s.kullanici(0).length === 1 && s.kullanici(0)[0].start.seconds === 4 && s.kullanici(0)[0].end.seconds === 6, JSON.stringify(r));
s = senaryo({ sure: 5, izler: SONRAKI });
r = s.call("KS_placeCaptionMogrt", { path: SABLON_YOLU, track: 0, batch: "cap-dolu", start: 1.25, end: 3.5, text: "a" });
ok("'iz' verilmezse temkinli varsayilan (" + MSURE.VARSAYILAN_SURE + " sn): yine 'dolu', klip ezilmez",
  !r.ok && r.kod === "dolu" && durum.importCount === 0 && s.kullanici(0)[0].end.seconds === 6, JSON.stringify(r));
ok("Host varsayilani panel modulunun varsayilaniyla ayni", s.ctx.KS_CAPTION_MOGRT_IZ === MSURE.VARSAYILAN_SURE, s.ctx.KS_CAPTION_MOGRT_IZ);
s = senaryo({ sure: 5, izler: SONRAKI });
r = s.call("KS_placeCaptionMogrt", { path: SABLON_YOLU, track: 0, batch: "cap-dolu", start: 1.25, end: 3.5, text: "a", iz: -3 });
ok("Gecersiz 'iz' ayak izini daraltmaz (varsayilana duser)", !r.ok && r.kod === "dolu" && durum.importCount === 0, JSON.stringify(r));
s = senaryo({ sure: 5, izler: SONRAKI });
r = s.call("KS_placeCaptionMogrt", { path: SABLON_YOLU, track: 0, batch: "cap-sonra", start: 7, end: 9, text: "a", iz: 5 });
ok("Kullanici klibinin SONRASINA yerlestirme serbest (ayak izi yalniz baslangictan ileri)",
  r.ok && durum.ezilen.length === 0 && s.kullanici(0)[0].end.seconds === 6, JSON.stringify(r));

/* ---- 4) Panel akışı: süre .mogrt'tan okunur, hazırlık ayak izinde boş iz arar, her altyazı 'iz' ile konur ---- */
var MOGRT_5SN = zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: 12500, scale: 2500 } }) },
  { ad: "thumb.png", veri: Buffer.alloc(64, 1) }]);
var CUES = [{ start: 1.25, end: 2.4, text: "Bunu" }, { start: 2.4, end: 3.5, text: "mutlaka gör" }];
function panelAkisi(sc, mogrtBuf, cues) {
  var iz = MSURE.izSuresi(sure(mogrtBuf));
  var ayak = MSURE.ayakIzi(cues, iz);
  var hazir = sc.call("KS_prepareCaptionMogrt", { path: SABLON_YOLU, start: ayak.start, end: ayak.end, batch: "cap-akis" });
  var sonuc = { iz: iz, ayak: ayak, prep: hazir, yerlesen: [] };
  if (!hazir.ok) return sonuc;
  for (var i = 0; i < cues.length; i++) {
    var rr = sc.call("KS_placeCaptionMogrt", { path: SABLON_YOLU, track: hazir.track, batch: "cap-akis",
      start: cues[i].start, end: cues[i].end, text: cues[i].text, iz: iz });
    sonuc.yerlesen.push(rr);
    if (!rr.ok) break;
  }
  return sonuc;
}
s = senaryo({ sure: 5, izler: SONRAKI });
var akis = panelAkisi(s, MOGRT_5SN, CUES);
ok("Panel akisi: sure definition.json'dan 5 sn, ayak izi 1.25 - 7.4 (son altyazinin basi + 5)",
  akis.iz === 5 && akis.ayak.start === 1.25 && Math.abs(akis.ayak.end - 7.4) < 1e-9, JSON.stringify(akis.ayak));
ok("Panel akisi: V1'de altyazidan hemen sonra (4-6 sn) kullanici klibi var: V1 secilmez, yeni ust iz (V2) acilir",
  akis.prep.ok && akis.prep.track === 1 && akis.prep.trackName === "V2" && akis.prep.newTrack === true, JSON.stringify(akis.prep));
ok("Panel akisi: tum altyazilar V2'ye yerlesir, birbirini 'dolu' saymaz (onceki kirpildi)",
  akis.yerlesen.length === 2 && akis.yerlesen.every(function (x) { return x.ok; }) && s.altyazilar(1).length === 2 &&
  s.altyazilar(1)[0].end.seconds === 2.4 && s.altyazilar(1)[1].end.seconds === 3.5, JSON.stringify(akis.yerlesen));
ok("Panel akisi: V1'deki 4-6 sn kullanici klibi yerinde ve tam boyda, hicbir sey ezilmez",
  durum.ezilen.length === 0 && s.kullanici(0).length === 1 && s.kullanici(0)[0].start.seconds === 4 && s.kullanici(0)[0].end.seconds === 6,
  JSON.stringify(durum.ezilen));
s = senaryo({ sure: 5, izler: [[{ ad: "Bitiş kartı", a: 10, b: 12 }]] });
akis = panelAkisi(s, MOGRT_5SN, CUES);
ok("Panel akisi: kullanici klibi ayak izinin disindaysa (10 sn) V1 kullanilir, yeni iz acilmaz, klip yerinde",
  akis.prep.ok && akis.prep.track === 0 && !akis.prep.newTrack && akis.yerlesen.every(function (x) { return x.ok; }) &&
  durum.ezilen.length === 0 && s.kullanici(0)[0].start.seconds === 10, JSON.stringify(akis.prep));
s = senaryo({ sure: 30, izler: [[{ ad: "Kullanıcı alt üçlüsü", a: 20, b: 25 }]] });
akis = panelAkisi(s, Buffer.from("bozuk"), CUES);
ok("Panel akisi: sure okunamazsa temkinli " + MSURE.VARSAYILAN_SURE + " sn: 30 sn'lik sablonda 20 sn'deki klip de korunur",
  akis.iz === MSURE.VARSAYILAN_SURE && akis.prep.ok && akis.prep.track === 1 && akis.yerlesen.every(function (x) { return x.ok; }) &&
  durum.ezilen.length === 0 && s.kullanici(0)[0].start.seconds === 20 && s.kullanici(0)[0].end.seconds === 25, JSON.stringify(akis));

/* ---- 5) js/mogrt-sure.js: .mogrt'tan süre ---- */
var paketteki = fs.readFileSync(path.join(ROOT, "assets", "mogrt", "altyazi-efekt-v1.mogrt"));
ok("Paketteki 1 saatlik sablonun suresi ~3600 sn (8999991 / 2500)", Math.abs(sure(paketteki) - 3600) < 0.01, sure(paketteki));
ok("deflate'li definition.json: value / scale (12500 / 2500 = 5 sn)", sure(MOGRT_5SN) === 5, sure(MOGRT_5SN));
ok("sakli (yontem 0) definition.json da okunur",
  sure(zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: 30, scale: 1 } }), yontem: 0 }])) === 30);
ok("Birden cok dil: en uzun sure",
  sure(zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: 5, scale: 1 }, tr_TR: { value: 75, scale: 10 } }) }])) === 7.5);
ok("Zip yorumu (EOCD sonrasi) okumayi bozmaz",
  sure(zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: 8, scale: 1 } }) }], { yorum: "Adobe Premiere Pro" })) === 8);
ok("UTF-8 BOM'lu definition.json",
  sure(zipYap([{ ad: "definition.json", veri: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), tanim({ en_US: { value: 9, scale: 1 } })]) }])) === 9);
var buyuk = zipYap([{ ad: "media/arkaplan.mp4", veri: Buffer.alloc(3 * 1024 * 1024, 7), yontem: 0 },
  { ad: "definition.json", veri: tanim({ en_US: { value: 12, scale: 1 } }) }]);
var oc = okuyucu(buyuk);
ok("Yalniz merkez dizin ve definition.json okunur (3 MB'lik medya okunmaz)",
  MSURE.sablonSuresi(oc.oku, buyuk.length, zlib.inflateRawSync) === 12 && oc.okunan < 70 * 1024, oc.okunan + " bayt");
var u8 = new Uint8Array(MOGRT_5SN);
ok("oku Uint8Array dondururse de calisir",
  MSURE.sablonSuresi(function (k, n) { return u8.slice(k, k + n); }, u8.length, function (v) { return zlib.inflateRawSync(Buffer.from(v)); }) === 5);
ok("Sure okunamaz: definition.json yok", sure(zipYap([{ ad: "thumb.png", veri: Buffer.alloc(10) }])) === 0);
ok("Sure okunamaz: sourceInfoLocalized / duration yok",
  sure(zipYap([{ ad: "definition.json", veri: Buffer.from(JSON.stringify({ capsuleName: "x" })) }])) === 0 &&
  sure(zipYap([{ ad: "definition.json", veri: Buffer.from(JSON.stringify({ sourceInfoLocalized: { en_US: { name: "x" } } })) }])) === 0);
ok("Sure okunamaz: scale 0 / negatif / sayi degil",
  sure(zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: 5, scale: 0 } }) }])) === 0 &&
  sure(zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: -5, scale: 1 } }) }])) === 0 &&
  sure(zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: "abc", scale: 1 } }) }])) === 0);
ok("Sure okunamaz: bozuk JSON", sure(zipYap([{ ad: "definition.json", veri: Buffer.from("{ bozuk") }])) === 0);
ok("Sure okunamaz: zip degil / bos / kesik", sure(Buffer.from("bozuk")) === 0 && sure(Buffer.alloc(0)) === 0 &&
  sure(Buffer.alloc(4096, 0x50)) === 0 && sure(MOGRT_5SN.slice(0, MOGRT_5SN.length - 30)) === 0);
ok("Sure okunamaz: sifreli girdi ya da zip64 isareti",
  sure(zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: 5, scale: 1 } }), bayrak: 1, yontem: 0 }])) === 0 &&
  sure(zipYap([{ ad: "definition.json", veri: tanim({ en_US: { value: 5, scale: 1 } }) }], { zip64: true })) === 0);
ok("Deflate acici verilmezse 0 (cokmez)", MSURE.sablonSuresi(okuyucu(MOGRT_5SN).oku, MOGRT_5SN.length) === 0);
ok("oku hata atarsa 0", MSURE.sablonSuresi(function () { throw new Error("EIO"); }, 1000, zlib.inflateRawSync) === 0);

/* ---- 6) Ayak izi ---- */
ok("izSuresi: bilinmeyen sure temkinli varsayilana duser", MSURE.izSuresi(0) === 60 && MSURE.izSuresi(NaN) === 60 &&
  MSURE.izSuresi(-1) === 60 && MSURE.izSuresi(Infinity) === 60 && MSURE.izSuresi(4.5) === 4.5);
var ai = MSURE.ayakIzi([{ start: 1, end: 3 }, { start: 3, end: 20 }], 5);
ok("ayakIzi: son altyazi sablondan uzunsa bitisi", ai.start === 1 && ai.end === 20, JSON.stringify(ai));
ai = MSURE.ayakIzi([{ start: 1, end: 3 }, { start: 3, end: 4 }], 5);
ok("ayakIzi: ilk baslangictan son baslangic + sure", ai.start === 1 && ai.end === 8, JSON.stringify(ai));
ai = MSURE.ayakIzi([{ start: 1, end: 2 }], 0);
ok("ayakIzi: sure yoksa varsayilan", ai.end === 61, JSON.stringify(ai));
ok("ayakIzi: bos liste", JSON.stringify(MSURE.ayakIzi([], 5)) === '{"start":0,"end":0}');

/* ---- 7) Kaynak denetimi: panel ayak izini ve 'iz'i gönderir ---- */
var captions = fs.readFileSync(path.join(ROOT, "js", "captions.js"), "utf8");
var uyg = captions.slice(captions.indexOf("async function mogrtStiliniUygula("), captions.indexOf("Altyazı Efektleri › Premiere yerel (3.3 adım 21, Beta)"));
ok("Panel: sure secili sablondan okunur, ayak izi tum altyazilardan hesaplanir",
  /var iz = mogrtIzSuresi\(secilenMogrt\.path\);/.test(uyg) && /var ayak = MSURE\.ayakIzi\(cs, iz\);/.test(uyg));
ok("Panel: KS_prepareCaptionMogrt ayak iziyle cagrilir (son altyazinin bitisiyle degil)",
  /KS_prepareCaptionMogrt", \{\s*path: secilenMogrt\.path,\s*start: ayak\.start,\s*end: ayak\.end,/.test(uyg) && !/cs\[cs\.length - 1\]\.end/.test(uyg));
ok("Panel: her KS_placeCaptionMogrt cagrisi sablon suresini 'iz' olarak verir", /KS_placeCaptionMogrt", \{[^}]*\biz: iz\b[^}]*\}/.test(uyg));
ok("Panel: sure dosyadan zlib.inflateRawSync ile okunur, dosya kapatilir",
  /MSURE\.sablonSuresi\(/.test(captions) && /zlib\.inflateRawSync\(veri\)/.test(captions) && /K\.fs\.closeSync\(fd\)/.test(captions));
var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
ok("index.html js/mogrt-sure.js'i captions.js'ten once yukler",
  html.indexOf('<script src="js/mogrt-sure.js"></script>') !== -1 &&
  html.indexOf('<script src="js/mogrt-sure.js"></script>') < html.indexOf('<script src="js/captions.js"></script>'));
ok("MOGRT seciliyken libass emoji bekcisi bu yolu engellemez", /if \(!secilenMogrt && emojiIceriyorMu\(\)\)/.test(captions));
ok("Normal caption ve stilli MOGRT ayri butonlardir",
  /id="cap-apply"[^>]*>Normal altyazı izi ekle/.test(html) && /id="cap-apply-style"/.test(html));
ok("Normal buton stilden bagimsiz, stil butonu MOGRT yolunu acar",
  /apply\(false\)/.test(captions) && /apply\(true\)/.test(captions) && /if \(stilIle\)/.test(captions));

console.log("\n" + passed + "/" + (passed + failed) + " gecti");
process.exit(failed ? 1 : 0);
