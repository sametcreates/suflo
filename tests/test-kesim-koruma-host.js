// Suflo testi: Otomatik Kesim 3.4 adım 7 — KS_applyCuts korunan katmanlar + expectSeqId, KS_getTrackLayout klip
// listesi (bağlı öğeler), KS_exportAudio süresi. Sahte Premiere + sahte QE: V1 kamera görüntüsü, A1 kamera sesi
// (V1'e bağlı), A2 tek parça sürekli müzik.
//  - A2 korununca hiç razor'lanmaz, silinmez; ripple boşluk moduna düşmez
//  - expectSeqId tutmazsa hata, kopya da oluşmaz
//  - protect olmadan çıktı ve timeline 3.3 ile aynı (protectedSkipped alanı yok)
//  - korunan video katmanı ripple'da boşluk moduna düşer; Premiere bağlı klibi birlikte silerse protectedChanged
//  - bağlı çift uyarısı: KS_getTrackLayout + SufloSessizlik.korumaOner
var fs = require("fs"), path = require("path"), vm = require("vm");
var S = require(path.join(__dirname, "..", "js", "sessizlik.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

var TPS = 254016000000;
function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", {
  get: function () { return String(Math.round(this.seconds * TPS)); },
  set: function (v) { this.seconds = Number(v) / TPS; }
});
FakeTime.prototype.getFormatted = function () { return String(this.seconds); };

/*
 * ortam.bagApi: getLinkedItems var mı (eski Premiere'de yok). ortam.zincir: remove() bağlı öğeleri de siler
 * (Premiere'in bağlı seçimle silmesi gibi; korunan katman değişti mi denetimini sınar).
 */
var ortam = { bagApi: true, zincir: false };
var nodeSayac = 0;
function klip(bas, son, o) {
  o = o || {};
  var c = { start: { seconds: bas }, end: { seconds: son }, inPoint: { seconds: o.inPoint !== undefined ? o.inPoint : bas }, name: o.name || "klip",
    nodeId: "n" + (++nodeSayac), mediaType: o.tur === "a" ? "Audio" : "Video", _grup: o.grup || null, _iz: null,
    projectItem: { getMediaPath: function () { return o.yol || "C:\\cekim\\kamera.mp4"; } },
    setSelected: function () { c._secili = true; },
    remove: function (ripple) {
      var tr = c._iz, i = tr._k.indexOf(c);
      if (i === -1) throw new Error("zaten silinmiş");
      var boy = c.end.seconds - c.start.seconds;
      tr._k.splice(i, 1);
      if (ripple) tr._k.slice(i).forEach(function (k) { k.start = { seconds: k.start.seconds - boy }; k.end = { seconds: k.end.seconds - boy }; });
      silinenler.push({ iz: tr.name, s: c.start.seconds, e: c.end.seconds });
      if (ortam.zincir && c._grup) {
        tumKlipler(tr._seq).forEach(function (k) { if (k !== c && k._grup === c._grup && k._iz._k.indexOf(k) !== -1) k.remove(ripple); });
      }
    }
  };
  if (ortam.bagApi) {
    c.getLinkedItems = function () {
      var out = c._grup ? tumKlipler(c._iz._seq).filter(function (k) { return k._grup === c._grup; }) : [c];
      var col = { numItems: out.length }; out.forEach(function (k, i) { col[i] = k; }); return col;
    };
  }
  return c;
}
var silinenler = [];
function iz(ad, klipler, o) {
  o = o || {};
  var t = { name: ad, _k: klipler, _kilit: !!o.kilit, _mute: !!o.mute,
    isLocked: function () { return t._kilit; }, isMuted: function () { return t._mute; }, setMute: function (v) { t._mute = !!v; } };
  klipler.forEach(function (k) { k._iz = t; });
  Object.defineProperty(t, "clips", { get: function () {
    var col = { numItems: t._k.length }; t._k.forEach(function (k, i) { col[i] = k; }); return col;
  } });
  return t;
}
function izler(liste) { var o = { numTracks: liste.length }; liste.forEach(function (t, i) { o[i] = t; }); return o; }
function tumKlipler(seq) {
  var out = [], i;
  for (i = 0; i < seq.videoTracks.numTracks; i++) out = out.concat(seq.videoTracks[i]._k);
  for (i = 0; i < seq.audioTracks.numTracks; i++) out = out.concat(seq.audioTracks[i]._k);
  return out;
}

var sekanslar = [], aktif = null, klonSayisi = 0;
function kopyaKlip(k) {
  var y = klip(k.start.seconds, k.end.seconds, { yol: k.projectItem.getMediaPath(), tur: k.mediaType === "Audio" ? "a" : "v", grup: k._grup, name: k.name, inPoint: k.inPoint.seconds });
  return y;
}
function sekansYap(id, v, a) {
  var s = { sequenceID: id, name: "Vlog " + id, end: String(60 * TPS), timebase: String(TPS / 25),
    videoTracks: izler(v), audioTracks: izler(a),
    getSettings: function () { return { videoDisplayFormat: 100 }; },
    getInPointAsTime: function () { var t = new FakeTime(); t.seconds = 10; return t; },
    getOutPointAsTime: function () { var t = new FakeTime(); t.seconds = 40; return t; },
    exportAsMediaDirect: function (out) { dosyalar[out] = 1; return ""; },
    clone: function () {
      klonSayisi++;
      var kid = id + "-kopya", sira = 1;
      while (sekanslar.some(function (x) { return x.sequenceID === kid; })) kid = id + "-kopya" + (++sira);
      var kop = sekansYap(kid, v.map(function (t) { return iz(t.name, t._k.map(kopyaKlip), { kilit: t._kilit }); }),
        a.map(function (t) { return iz(t.name, t._k.map(kopyaKlip), { kilit: t._kilit, mute: t._mute }); }));
      sekanslar.push(kop); proje.sequences = koleksiyon();
    }
  };
  v.concat(a).forEach(function (t) { t._seq = s; });
  return s;
}
function koleksiyon() { var o = { numSequences: sekanslar.length }; sekanslar.forEach(function (s, i) { o[i] = s; }); return o; }
var proje = { openSequence: function (id) { sekanslar.forEach(function (s) { if (s.sequenceID === id) aktif = s; }); } };
Object.defineProperty(proje, "activeSequence", { get: function () { return aktif; }, set: function (v) { aktif = v; } });

// QE razor: yalnız o katmanı böler; aynı anda bölünen bağlı parçalar (aynı grup + aynı an) yine bağlı kalır
var razorlar = [];
var qe = { project: { getActiveSequence: function () {
  return {
    numVideoTracks: aktif.videoTracks.numTracks, numAudioTracks: aktif.audioTracks.numTracks,
    getVideoTrackAt: function (i) { return { razor: function (tc) { razorlar.push("V" + (i + 1) + "@" + Number(tc)); bol(aktif.videoTracks[i], Number(tc)); } }; },
    getAudioTrackAt: function (i) { return { razor: function (tc) { razorlar.push("A" + (i + 1) + "@" + Number(tc)); bol(aktif.audioTracks[i], Number(tc)); } }; }
  };
} } };
function bol(tr, t) {
  for (var i = 0; i < tr._k.length; i++) {
    var k = tr._k[i];
    if (t > k.start.seconds + 1e-9 && t < k.end.seconds - 1e-9) {
      var yeni = klip(t, k.end.seconds, { yol: k.projectItem.getMediaPath(), tur: k.mediaType === "Audio" ? "a" : "v",
        grup: k._grup ? k._grup + "@" + t : null, inPoint: k.inPoint.seconds + (t - k.start.seconds) });
      yeni._iz = tr;
      k.end = { seconds: t };
      tr._k.splice(i + 1, 0, yeni);
      return;
    }
  }
}

var dosyalar = {};
function FakeFile(p) { this.fsName = p; this.exists = !!dosyalar[p] || /\.epr$/.test(p); }
function FakeFolder(p) { this.fsName = p; this.exists = /temp/.test(p); this.create = function () {}; this.getFiles = function () { return []; }; }
FakeFolder.temp = { fsName: "C:\\temp" };

var ctx = { app: { version: "25.1.0", project: proje, enableQE: function () {} }, qe: qe, $: { os: "Windows 10" },
  Time: FakeTime, File: FakeFile, Folder: FakeFolder,
  decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, Date: Date };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
function call(fn, arg) { return JSON.parse(arg === undefined ? ctx[fn]() : ctx[fn](encodeURIComponent(JSON.stringify(arg)))); }

/* V1 kamera (0–60), A1 kamera sesi (0–60, V1'e bağlı), A2 "Müzik" (0–60 tek klip) */
var grupNo = 0;
function vlog(id, o) {
  o = o || {};
  var g = "g" + (++grupNo);
  var v = [iz("Video 1", [klip(0, 60, { grup: g, name: "Kamera" })])];
  var a = [iz("Audio 1", [klip(0, 60, { tur: "a", grup: g, name: "Kamera" })]),
    iz(o.muzikAdi || "Müzik", [klip(0, 60, { tur: "a", yol: "C:\\muzik\\sarki.mp3", name: "sarki.mp3" })])];
  if (o.v2) v.push(iz("Video 2", o.v2));
  if (o.a3) a.push(iz("Audio 3", o.a3));
  var s = sekansYap(id, v, a);
  sekanslar.push(s); proje.sequences = koleksiyon();
  aktif = s;
  return s;
}
function ozet(seq) {
  function tr(t) { return t._k.map(function (k) { return [+k.start.seconds.toFixed(3), +k.end.seconds.toFixed(3)]; }); }
  var o = {}, i;
  for (i = 0; i < seq.videoTracks.numTracks; i++) o["V" + (i + 1)] = tr(seq.videoTracks[i]);
  for (i = 0; i < seq.audioTracks.numTracks; i++) o["A" + (i + 1)] = tr(seq.audioTracks[i]);
  return o;
}
function toplamSure(t) { return t._k.reduce(function (a, k) { return a + k.end.seconds - k.start.seconds; }, 0); }
var KESIMLER = [{ start: 10, end: 12 }, { start: 30, end: 31.5 }];
function kesimler() { return KESIMLER.map(function (k) { return { start: k.start, end: k.end }; }); }

/* ---------- 1) A2 müzik korunur: ripple, kopya sekansta ---------- */
var s1 = vlog("s1");
razorlar = []; silinenler = [];
var r1 = call("KS_applyCuts", { ranges: kesimler(), removeMode: "ripple", cloneFirst: true, protect: { video: [], audio: [1] }, expectSeqId: "s1" });
var k1 = aktif;
ok("koruma: kopya sekansta uygulandı, özgün sekans dokunulmadı", r1.ok && r1.newSeq && k1.sequenceID === "s1-kopya" && js(ozet(s1)) === js({ V1: [[0, 60]], A1: [[0, 60]], A2: [[0, 60]] }), js(r1));
ok("koruma: A2 (müzik) hiç razor'lanmadı", razorlar.length === 8 && razorlar.every(function (r) { return !/^A2@/.test(r); }), js(razorlar));
ok("koruma: A2 hiç silinmedi, tek parça 0–60 kaldı", js(ozet(k1).A2) === js([[0, 60]]) && silinenler.every(function (x) { return x.iz !== "Müzik"; }), js(ozet(k1).A2));
ok("koruma: ripple boşluk moduna düşmedi (rippleFallback false), V1 ve A1 3.5 sn kısaldı",
  r1.rippleFallback === false && Math.abs(toplamSure(k1.videoTracks[0]) - 56.5) < 1e-6 && Math.abs(toplamSure(k1.audioTracks[0]) - 56.5) < 1e-6 &&
  js(ozet(k1).V1) === js([[0, 10], [10, 28], [28, 56.5]]), js(ozet(k1)));
ok("koruma: protectedSkipped { video: 0, audio: 1 }, 4 parça silindi, korunan katman değişmedi",
  js(r1.protectedSkipped) === js({ video: 0, audio: 1 }) && r1.removed === 4 && !r1.protectedChanged && !r1.protectedVideoGap, js(r1));

/* ---------- 2) protect olmadan: 3.3 ile aynı çıktı ve timeline ---------- */
var s2 = vlog("s2");
razorlar = []; silinenler = [];
var r2 = call("KS_applyCuts", { ranges: kesimler(), removeMode: "ripple", cloneFirst: true });
var k2 = aktif;
ok("protect yok: çıktı alanları 3.3'teki gibi (protectedSkipped yok)",
  js(Object.keys(r2).sort()) === js(["cuts", "newSeq", "ok", "removed", "rippleFallback", "selected"]) &&
  r2.cuts === 4 && r2.removed === 6 && r2.selected === 0 && r2.rippleFallback === false && r2.newSeq === "Vlog s2-kopya", js(r2));
ok("protect yok: her katman razor'landı ve kesildi (A2 dahil, 3.3 davranışı)",
  razorlar.length === 12 && js(ozet(k2).A2) === js([[0, 10], [10, 28], [28, 56.5]]) && js(ozet(k2).V1) === js(ozet(k1).V1), js(ozet(k2)));
var s2b = vlog("s2b");
var r2b = call("KS_applyCuts", { ranges: kesimler(), removeMode: "ripple", cloneFirst: false, protect: { video: [], audio: [] } });
ok("boş protect: timeline protect'sizle aynı, protectedSkipped { 0, 0 }", r2b.ok && js(ozet(s2b)) === js(ozet(k2)) && js(r2b.protectedSkipped) === js({ video: 0, audio: 0 }), js(r2b));
var s2c = vlog("s2c");
var r2c = call("KS_applyCuts", { ranges: kesimler(), removeMode: "gap", cloneFirst: false });
ok("protect yok, gap: boşluk bırakır, kaydırmaz", r2c.ok && js(ozet(s2c).A2) === js([[0, 10], [12, 30], [31.5, 60]]) && r2c.removed === 6, js(ozet(s2c)));
var s2d = vlog("s2d");
var r2d = call("KS_applyCuts", { ranges: kesimler(), removeMode: "select", cloneFirst: false, protect: { audio: [1] } });
ok("select + koruma: korunan katmanda seçim yok, diğerleri kesilip seçildi", r2d.ok && r2d.selected === 4 && r2d.removed === 0 &&
  s2d.audioTracks[1]._k.length === 1 && !s2d.audioTracks[1]._k[0]._secili, js(r2d));

/* ---------- 3) expectSeqId ---------- */
var s3 = vlog("s3");
var klonOnce = klonSayisi, sekansOnce = sekanslar.length;
razorlar = [];
var r3 = call("KS_applyCuts", { ranges: kesimler(), removeMode: "ripple", cloneFirst: true, protect: { audio: [1] }, expectSeqId: "baska-sekans" });
ok("expectSeqId tutmuyor: hata (kod sekans), kopya oluşmadı, razor yok, timeline aynı",
  !r3.ok && r3.kod === "sekans" && klonSayisi === klonOnce && sekanslar.length === sekansOnce && razorlar.length === 0 && aktif === s3 &&
  js(ozet(s3)) === js({ V1: [[0, 60]], A1: [[0, 60]], A2: [[0, 60]] }), js(r3));
var r3b = call("KS_applyCuts", { ranges: kesimler(), removeMode: "gap", cloneFirst: false, expectSeqId: "s3" });
ok("expectSeqId tutuyor: uygulanır", r3b.ok && r3b.removed === 6, js(r3b));

/* ---------- 4) korunan VIDEO katmanı ripple'da: boşluk moduna düşer ---------- */
var s4 = vlog("s4", { v2: [klip(5, 50, { name: "Başlık", yol: "C:\\grafik\\baslik.mogrt" })] });
var r4 = call("KS_applyCuts", { ranges: kesimler(), removeMode: "ripple", cloneFirst: false, protect: { video: [1], audio: [1] } });
ok("korunan V2 + ripple: boşluk moduna düştü (protectedVideoGap, rippleFallback), V1 kaymadı, V2 bütün",
  r4.ok && r4.protectedVideoGap === true && r4.rippleFallback === true && js(ozet(s4).V1) === js([[0, 10], [12, 30], [31.5, 60]]) &&
  js(ozet(s4).V2) === js([[5, 50]]) && js(r4.protectedSkipped) === js({ video: 1, audio: 1 }), js(r4) + " " + js(ozet(s4)));
var s4b = vlog("s4b", { v2: [klip(0, 8, { name: "Giriş" })] });
var r4b = call("KS_applyCuts", { ranges: kesimler(), removeMode: "ripple", cloneFirst: false, protect: { video: [1] } });
ok("korunan V2 ilk kesimden önce bitiyor: ripple kalır (kayacak içerik yok)", r4b.ok && !r4b.protectedVideoGap && r4b.rippleFallback === false && js(ozet(s4b).V2) === js([[0, 8]]), js(r4b));

/* ---------- 5) Premiere bağlı klibi birlikte silerse: protectedChanged ---------- */
ortam.zincir = true;
var vurgu = klip(10.2, 11.8, { name: "Vurgu", grup: "zincir" }), vurguSes = klip(10.2, 11.8, { tur: "a", grup: "zincir", yol: "C:\\sfx\\vurgu.wav" });
var s5 = vlog("s5", { v2: [vurgu], a3: [vurguSes] });
var r5 = call("KS_applyCuts", { ranges: kesimler(), removeMode: "gap", cloneFirst: false, protect: { audio: [2] } });
ok("bağlı silme korunan katmana uzandı: protectedChanged (panel uyarır)", r5.ok && r5.protectedChanged === true && s5.audioTracks[2]._k.length === 0, js(r5));
ortam.zincir = false;
var s5b = vlog("s5b", { v2: [klip(10.2, 11.8, { name: "Vurgu", grup: "zincir2" })], a3: [klip(10.2, 11.8, { tur: "a", grup: "zincir2" })] });
var r5b = call("KS_applyCuts", { ranges: kesimler(), removeMode: "gap", cloneFirst: false, protect: { audio: [2] } });
ok("bağlı silme yoksa korunan katman aynı: protectedChanged yok", r5b.ok && !r5b.protectedChanged && s5b.audioTracks[2]._k.length === 1, js(r5b));

/* ---------- 6) Kilitli katman ve geçersiz dizin ---------- */
var s6 = vlog("s6");
var r6 = call("KS_applyCuts", { ranges: kesimler(), removeMode: "ripple", cloneFirst: false, protect: { video: [7], audio: [1, 1, -1, "x"] } });
ok("koruma: geçersiz / yinelenen dizinler sayılmaz", r6.ok && js(r6.protectedSkipped) === js({ video: 0, audio: 1 }) && js(ozet(s6).A2) === js([[0, 60]]), js(r6));

/* ---------- 7) KS_getTrackLayout klip listesi + bağlı çift uyarısı ---------- */
var s7 = vlog("s7");
var lay = call("KS_getTrackLayout", { klipler: true, start: 0, end: 60 });
var a1k = lay.audio[0].klipler[0];
ok("getTrackLayout klipler: aralıktaki klipler, ad, yol, hiza; ses klibinde bağlı video öğesi",
  lay.ok && lay.video[0].klipler.length === 1 && lay.audio[1].klipler.length === 1 && a1k.s === 0 && a1k.e === 60 && a1k.hiza === 0 &&
  js(a1k.bag) === js([{ s: 0, e: 60, yol: "C:\\cekim\\kamera.mp4", tur: "Video" }]) && js(lay.audio[1].klipler[0].bag) === "[]" && lay.video[0].klipler[0].bag === undefined, js(lay.audio));
var layEski = call("KS_getTrackLayout");
ok("getTrackLayout argümansız: eski çıktı (klipler yok, Podcast Modu)", layEski.ok && layEski.video[0].klipler === undefined && layEski.audio.length === 2);
var layDar = call("KS_getTrackLayout", { klipler: true, start: 61, end: 70 });
ok("getTrackLayout: aralık dışındaki klipler listelenmez", layDar.audio[0].klipler.length === 0 && layDar.video[0].klipler.length === 0);

var o7 = S.korumaOner(lay, { start: 0, end: 60, mod: "ripple", kesimler: kesimler(), dinleGerekli: true });
ok("öneri: A2 'Müzik' adıyla korunur, dinlenecek ses kamera sesi A1 (videoya bağlı), video işaretsiz, uyarı yok",
  js(o7.koru) === js({ video: [], audio: [1] }) && js(o7.dinle) === js([0]) && js(o7.oner.audio) === "[]" && o7.uyarilar.length === 0, js(o7));
var o7b = S.korumaOner(lay, { start: 0, end: 60, mod: "ripple", kesimler: kesimler(), koru: { video: [], audio: [0, 1] } });
var bg = o7b.uyarilar.filter(function (u) { return u.kod === "bagli"; })[0];
ok("bağlı çift uyarısı: A1 korunurken bağlı V1 kesiliyor (liste)", bg && bg.toplam === 1 && bg.ciftler[0].audio === 0 && bg.ciftler[0].video === 0 && bg.ciftler[0].koruTaraf === "audio", js(o7b.uyarilar));

ortam.bagApi = false;
var s7b = vlog("s7b", { muzikAdi: "Audio 2" });
var layB = call("KS_getTrackLayout", { klipler: true, start: 0, end: 60 });
ortam.bagApi = true;
var o7c = S.korumaOner(layB, { start: 0, end: 60, mod: "ripple", kesimler: kesimler(), koru: { video: [], audio: [0] } });
ok("getLinkedItems yok (eski Premiere): bag null, aynı medya + hiza sezgisiyle bağlı çift bulunur",
  layB.audio[0].klipler[0].bag === null && o7c.uyarilar.some(function (u) { return u.kod === "bagli" && u.ciftler[0].video === 0; }), js(o7c.uyarilar));
var o7d = S.korumaOner(layB, { start: 0, end: 60, mod: "ripple" });
ok("adı 'Audio 2' olan tek parça müzik: önerilir (vurgulu) ama işaretlenmez", js(o7d.koru.audio) === "[]" && js(o7d.oner.audio) === js([1]) && js(o7d.dinle) === js([0]), js(o7d));
ok("korunan V1 + ripple: video-ripple uyarısı", S.korumaOner(lay, { start: 0, end: 60, mod: "ripple", koru: { video: [0], audio: [] } }).uyarilar.some(function (u) { return u.kod === "video-ripple" && js(u.izler) === "[0]"; }));

/* ---------- 8) KS_exportAudio: süre ve ofset ---------- */
var s8 = vlog("s8");
var e1 = call("KS_exportAudio", { scope: "inout", epr: ["C:\\ext\\wav16k.epr"], tracks: [0], unmuteWanted: true });
ok("exportAudio In/Out: ofset In noktası, süre Out − In; katman susturmaları geri yüklendi",
  e1.ok && e1.offset === 10 && e1.duration === 30 && !s8.audioTracks[0]._mute && !s8.audioTracks[1]._mute, js(e1));
var e2 = call("KS_exportAudio", { scope: "entire", epr: ["C:\\ext\\wav16k.epr"] });
ok("exportAudio Sekans: ofset 0, süre sekans sonu", e2.ok && e2.offset === 0 && e2.duration === 60, js(e2));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
