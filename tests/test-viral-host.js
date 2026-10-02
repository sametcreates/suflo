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
    createMarker: function (t) { var m = { start: t, setColorByIndex: function (i) { this.renk = i; } }; markers.push(m); return m; },
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

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
