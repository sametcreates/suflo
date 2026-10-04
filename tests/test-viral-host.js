// Suflo testi: host KS_addRangeMarkers + KS_setInOut (sahte Premiere modeliyle)
var fs = require("fs"), path = require("path"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 200) + "]" : "")); }

function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", { get: function () { return String(Math.round(this.seconds * 254016000000)); } });
var markers = [];
var seqState = {};
var sequence = {
  markers: {
    createMarker: function (t) {
      var m = { start: t, setColorByIndex: function (i) { this.renk = i; } }, bitis = { seconds: t };
      // Premiere 26.5 gibi: end'e sayi (sn) atanir, okununca Time doner; Time atamak hata
      Object.defineProperty(m, "end", { get: function () { return bitis; }, set: function (v) {
        if (typeof v !== "number") throw new Error("Illegal Parameter type"); bitis = { seconds: v }; } });
      markers.push(m); return m; },
    getFirstMarker: function () { return markers[0] || null; },
    getNextMarker: function (m) { var i = markers.indexOf(m); return markers[i + 1] || null; },
    deleteMarker: function (m) { markers.splice(markers.indexOf(m), 1); }
  },
  setInPoint: function (s) { seqState.in = s; },
  setOutPoint: function (s) { seqState.out = s; },
  setPlayerPosition: function (t) { seqState.ph = t; }
};
var ctx = { app: { project: { activeSequence: sequence } }, Time: FakeTime, decodeURIComponent: decodeURIComponent,
  encodeURIComponent: encodeURIComponent, isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error,
  File: function () {}, Folder: function () {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
function call(fn, arg) { return JSON.parse(ctx[fn](encodeURIComponent(JSON.stringify(arg)))); }

markers.push({ start: 1, comments: "kullanici notu" });
var r = call("KS_addRangeMarkers", { ranges: [{ start: 50, end: 90, name: "🔥 Sır", comment: "Şaşırtıcı" }, { start: 200, end: 230, name: "🔥 İki" }], replace: true });
ok("iki sureli marker eklendi", r.ok && r.added === 2, JSON.stringify(r));
var vm1 = markers.filter(function (m) { return /^Suflo viral/.test(m.comments || ""); });
ok("marker sonu (end) ayarlandi", vm1[0].end && vm1[0].end.seconds === 90, JSON.stringify(vm1[0].end));
ok("ad ve kanca yorumu yazildi, kirmizi renk", vm1[0].name === "🔥 Sır" && vm1[0].comments === "Suflo viral: Şaşırtıcı" && vm1[0].renk === 1);
var r2 = call("KS_addRangeMarkers", { ranges: [{ start: 10, end: 30, name: "yeni" }], replace: true });
ok("tekrar eklemede eski viral marker'lar yenilenir, kullanici marker'i kalir",
  r2.ok && r2.removed === 2 && markers.length === 2 && markers[0].comments === "kullanici notu", JSON.stringify(markers.map(function (m) { return m.comments; })));

var io = call("KS_setInOut", { start: 50, end: 90 });
ok("In/Out ve playhead ayarlandi", io.ok && seqState.in === 50 && seqState.out === 90 && seqState.ph === String(50 * 254016000000), JSON.stringify(seqState));
ok("gecersiz aralik reddedilir", call("KS_setInOut", { start: 9, end: 3 }).ok === false);


/* KS_makeShorts: alt sekans + 9:16 */
var olusan = [], tasinan = [], aktifler = [];
var kutuItem = { type: 2, name: "Suflo Shorts" };
ctx.app.project.rootItem = { children: { numItems: 1, 0: kutuItem }, createBin: function () { return kutuItem; } };
sequence.sequenceID = "ana";
sequence.getInPointAsTime = function () { return { seconds: 5 }; };
sequence.getOutPointAsTime = function () { return { seconds: 500 }; };
var reframeVar = true;
sequence.createSubsequence = function (ignore) {
  var alt = { sequenceID: "alt" + olusan.length, ignore: ignore, inn: seqState.in, out: seqState.out,
    projectItem: { moveBin: function (b) { tasinan.push(b.name); } },
    autoReframeSequence: reframeVar ? function (n, d, m, ad) { var x = { sequenceID: "dik" + olusan.length, name: ad, n: n, d: d, projectItem: { moveBin: function (b) { tasinan.push(b.name); } } }; olusan.push(x); return x; } : undefined };
  olusan.push(alt);
  ctx.app.project.activeSequence = alt;   // Premiere yeni sekansi acar
  return alt;
};
ctx.app.project.openSequence = function (id) { aktifler.push(id); };
Object.defineProperty(ctx.app.project, "activeSequence", { configurable: true, writable: true, value: sequence });
var ms = call("KS_makeShorts", { ranges: [{ start: 50, end: 90, name: "Shorts 1 · Sır" }, { start: 200, end: 230, name: "Shorts 2" }, { start: 9, end: 3, name: "bozuk" }], dikey: true });
ok("iki alt sekans + iki dikey olustu, bozuk aralik raporlandi", ms.ok && ms.made === 2 && ms.vertical === 2 && ms.errors.length === 1, JSON.stringify(ms));
ok("alt sekans dogru In/Out ile, tum izler (ignoreTrackTargeting)", olusan[0].inn === 50 && olusan[0].out === 90 && olusan[0].ignore === true);
ok("ad verildi, 9:16 Auto Reframe 9x16 oranla", olusan[0].name === "Shorts 1 · Sır" && olusan[1].n === 9 && olusan[1].d === 16 && /9x16$/.test(olusan[1].name));
ok("sekanslar Suflo Shorts kutusunda", tasinan.length === 4 && tasinan.every(function (n) { return n === "Suflo Shorts"; }));
ok("orijinal sekans geri aktif ve In/Out geri yuklendi", ctx.app.project.activeSequence === sequence && seqState.in === 5 && seqState.out === 500);
reframeVar = false;
var ms2 = call("KS_makeShorts", { ranges: [{ start: 10, end: 40, name: "x" }], dikey: true });
ok("Auto Reframe yoksa yatay sekans yine olusur, uyari doner", ms2.ok && ms2.made === 1 && ms2.vertical === 0 && /9:16/.test(ms2.errors[0]), JSON.stringify(ms2));
delete sequence.createSubsequence;
ok("createSubsequence yoksa anlasilir hata", call("KS_makeShorts", { ranges: [{ start: 1, end: 20 }] }).ok === false);


/* besinci inceleme: In/Out sirasi ve geri yukleme */
var cagrilar = [];
sequence.end = String(600 * 254016000000);
sequence.setInPoint = function (s) { cagrilar.push("in:" + s); seqState.in = s; };
sequence.setOutPoint = function (s) { cagrilar.push("out:" + s); seqState.out = s; };
sequence.createSubsequence = function () { return { sequenceID: "z", projectItem: { moveBin: function () {} } }; };
sequence.getInPointAsTime = function () { return { seconds: 300 }; };
sequence.getOutPointAsTime = function () { return { seconds: 400 }; };
call("KS_makeShorts", { ranges: [{ start: 450, end: 480, name: "x" }] });
ok("yeni In eski Out'tan sonra: once Out sona cekilir", cagrilar.slice(0, 3).join(" ") === "out:600 in:450 out:480", cagrilar.join(" "));
ok("geri yukleme: Out sona, In, sonra Out (In>Out olmaz)", cagrilar.slice(-3).join(" ") === "out:600 in:300 out:400", cagrilar.join(" "));
cagrilar = [];
sequence.getInPointAsTime = function () { return { seconds: -1 }; };
sequence.getOutPointAsTime = function () { throw new Error("yok"); };
call("KS_makeShorts", { ranges: [{ start: 10, end: 40, name: "x" }] });
ok("negatif In / okunamayan Out: 0..son'a doner, hata zinciri kopmaz", cagrilar.slice(-2).join(" ") === "in:0 out:600", cagrilar.join(" "));
var vj = fs.readFileSync(path.join(__dirname, "..", "js", "viral.js"), "utf8");
ok("panel aralik basina ayri cagri yapar", /ranges: \[\{ start: a\.start/.test(vj) && /for \(var i = 0; i < liste\.length/.test(vj));


/* Shorts altyazi eslemesi: dikey kopyanin kimligi doner, panel kaydeder ve yukler */
cagrilar = [];
sequence.createSubsequence = function () { return { sequenceID: "alt9", projectItem: { moveBin: function () {} },
  autoReframeSequence: function () { return { sequenceID: "dik9", projectItem: { moveBin: function () {} } }; } }; };
sequence.getInPointAsTime = function () { return { seconds: 0 }; };
sequence.getOutPointAsTime = function () { return { seconds: 600 }; };
var ds = call("KS_makeShorts", { ranges: [{ start: 10, end: 40, name: "x" }], dikey: true });
ok("dikey kopyanin sekans kimligi doner", ds.ok && ds.items[0].id === "alt9" && ds.items[0].dikeyId === "dik9", JSON.stringify(ds.items));
var cj = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8");
ok("panel: viral Shorts eslemesini kaydeder (hem yatay hem dikey)", /shortsKaydet\(r\.items/.test(vj) && /harita\[it\.dikeyId\] = JSON\.parse\(JSON\.stringify\(kayit\)\)/.test(vj) && /slice\(30\)/.test(vj));
ok("panel: Shorts sekansinda altyazi ana videodan yuklenir", /id="cap-shorts-al"/.test(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8")) && /function shortsAltyazisiAl/.test(cj) && /shortsDugmesi\(ctx\)/.test(cj));


/* yedinci inceleme */
var wd = cj.slice(cj.indexOf("function writeDraft()"), cj.indexOf("function cancelDraft()"));
ok("taslak: Shorts transkripti ana videonun taslagini ezmez (kendi kaydina yazilir)", /if \(shortsYuklenen\) \{ shortsKaydiGuncelle\(\); return; \}/.test(wd) && wd.indexOf("shortsKaydiGuncelle") < wd.indexOf("K.saveDraft"));
var sa = cj.slice(cj.indexOf("function shortsAltyazisiAl()"), cj.indexOf("function shortsAltyazisiAl()") + 1400);
ok("Shorts yukleme: editor gorunur, bos ekranda geri al yigini sifir, ana taslak yazilmaz",
  /el\("cap-result"\)\.hidden = false/.test(sa) && /undoStack\.length = 0/.test(sa) && !/saveDraftNow\(\)/.test(sa) && /cancelDraft\(\)/.test(sa));
ok("yeni transkript / SRT / taslak kurtarma Shorts modunu kapatir", (cj.match(/shortsYuklenen = "";/g) || []).length >= 3);
ok("viral: anlar baska sekansta bulunduysa Shorts olusturulmaz, bulundugu andaki transkript kullanilir",
  /bulSekans && simdiki !== bulSekans/.test(vj) && /var d = await sekansDenetle\(\);\s*if \(d\.uyari\) \{ durum\(d\.uyari, "warn"\); return; \}\s*var liste = gorunenler\(\);/.test(vj) &&
  /sliceSegments\(bulSegs \|\| KCaptions\.rawSegments\(\)/.test(vj));

/* sekizinci inceleme */
ok("geri al yigini Shorts durumunu tasir ve geri yukler", /shorts: shortsYuklenen, ts: Date\.now\(\)/.test(cj) && /if \(typeof st\.shorts === "string"\) \{\s*shortsYuklenen = st\.shorts;/.test(cj) &&
  /cevir: ceviriDili, shorts: shortsYuklenen, ts: Date\.now\(\) \}\);/.test(cj));
var goKod = cj.slice(cj.indexOf("var oncekiIs = segments.length"), cj.indexOf('el("cap-result-info").textContent = segments.length + " satır · düzenleyip uygula"'));
ok("yeni transkript: Shorts modu yalniz basarida kapanir", goKod.indexOf('shortsYuklenen = "";') > goKod.indexOf("clearRevert();"));
ok("uygulama: Shorts (ya da rehberin ornegi) uygulaninca ana taslak silinmez", /if \(!shortsYuklenen(?: && !ornekBelge)?\) K\.clearDraft\(\);/.test(cj));
ok("Shorts kaydi ceviri dilini de saklar", /harita\[shortsYuklenen\]\.ceviriDili = ceviriDili;/.test(cj));
ok("viral: kaynak transkript/sekans AI cagrisindan once yakalanir (sekans canli sorguyla)", vj.indexOf("var segsHam") < vj.indexOf("await KCaptions.chatCall") &&
  vj.indexOf("var sekansSorgu = sekansOku();") > 0 && vj.indexOf("var sekansSorgu = sekansOku();") < vj.indexOf("await KCaptions.chatCall"));
var rd = cj.slice(cj.indexOf("function restoreDraft(d) {"), cj.indexOf("function restoreDraft(d) {") + 600);
ok("taslak kurtarma: Shorts bayragi anlik goruntuden SONRA sifirlanir", rd.indexOf('snapshot("taslak kurtarma")') < rd.indexOf('shortsYuklenen = "";'));
/* createSubsequence(true) hata verirse argumansiz denenir */
sequence.createSubsequence = function (arg) { if (arg !== undefined) throw new Error("bu surumde arguman yok"); return { sequenceID: "argsiz", projectItem: { moveBin: function () {} } }; };
var fb = call("KS_makeShorts", { ranges: [{ start: 10, end: 40, name: "x" }] });
ok("createSubsequence argumansiz yedek", fb.ok && fb.items[0].id === "argsiz", JSON.stringify(fb));
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
