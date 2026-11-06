// Suflo testi: host.jsx senkron doğrulama "Dinle" — KS_oynat / KS_oynatDurdur, sahte Premiere nesne modeliyle gerçek çalıştırma
// (test-egri-host.js düzeni). Playhead her durumda kartın başına gider; oynatma QE oynatıcısıyla (player.play / qe.startPlayback),
// hiçbiri yoksa { oynadi: false }. Durdurma aynı sırayla. Sekans yoksa hata.
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..");

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : ""));
}
function js(x) { return JSON.stringify(x); }

var TPS = 254016000000;
function FakeTime() { this.seconds = 0; }
Object.defineProperty(FakeTime.prototype, "ticks", { get: function () { return String(Math.round(this.seconds * TPS)); } });
var olay = [];
var sequence = { sequenceID: "seq-1", setPlayerPosition: function (ticks) { olay.push(["konum", Number(ticks) / TPS]); } };
var qeSahte = null, qeAcildi = 0;
var ctx = {
  app: { version: "25.1.0", project: { activeSequence: sequence }, enableQE: function () { qeAcildi++; ctx.qe = qeSahte; } },
  Time: FakeTime, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
  isFinite: isFinite, Math: Math, String: String, Number: Number, Error: Error, File: function () {}, Folder: function () {}
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), ctx, { filename: "jsx/host.jsx" });
function cagir(fn, arg) { return JSON.parse(ctx[fn](arg === undefined ? undefined : encodeURIComponent(JSON.stringify(arg)))); }

// 1) QE sekans oynatıcısı var
qeSahte = { project: { getActiveSequence: function () { return { player: { play: function (h) { olay.push(["play", h]); }, stop: function () { olay.push(["stop"]); } } }; } },
  startPlayback: function () { olay.push(["qeStart"]); }, stopPlayback: function () { olay.push(["qeStop"]); } };
olay = [];
var r = cagir("KS_oynat", { sec: 12.48 });
ok("oynat: playhead kartın başına (tick), sonra QE oynatıcısı normal hızda", r.ok && r.oynadi === true && r.yol === "player" && r.sec === 12.48 &&
  js(olay) === js([["konum", 12.48], ["play", 1]]), js([r, olay]));
olay = [];
var d = cagir("KS_oynatDurdur");
ok("durdur: QE oynatıcısının stop'u", d.ok && d.durdu === true && js(olay) === js([["stop"]]), js([d, olay]));

// 2) yalnız qe.startPlayback
qeSahte = { project: { getActiveSequence: function () { return {}; } }, startPlayback: function () { olay.push(["qeStart"]); }, stopPlayback: function () { olay.push(["qeStop"]); } };
olay = [];
r = cagir("KS_oynat", { sec: 3 });
d = cagir("KS_oynatDurdur");
ok("oynatıcı yoksa qe.startPlayback / stopPlayback", r.oynadi === true && r.yol === "qe" && d.durdu === true && js(olay) === js([["konum", 3], ["qeStart"], ["qeStop"]]), js(olay));

// 3) oynatıcı patlıyor → yedek
qeSahte = { project: { getActiveSequence: function () { return { player: { play: function () { throw new Error("yok"); } } }; } }, startPlayback: function () { olay.push(["qeStart"]); } };
olay = [];
r = cagir("KS_oynat", { sec: 1 });
ok("oynatıcı hata verirse qe.startPlayback'e düşer", r.oynadi === true && r.yol === "qe" && js(olay) === js([["konum", 1], ["qeStart"]]), js(olay));

// 4) QE hiç yok
qeSahte = undefined;
olay = [];
r = cagir("KS_oynat", { sec: -4 });
d = cagir("KS_oynatDurdur");
ok("QE yoksa: playhead yine gider (negatif zaman 0), oynadi false; durdur hata vermez", r.ok && r.oynadi === false && r.yol === "" && js(olay) === js([["konum", 0]]) && d.ok && d.durdu === false, js([r, d, olay]));
ctx.app.enableQE = function () { throw new Error("QE kapalı"); };
r = cagir("KS_oynat", { sec: 2 });
ok("enableQE fırlatırsa da playhead gider, oynadi false", r.ok && r.oynadi === false, js(r));

// 5) sekans yok
ctx.app.project.activeSequence = null;
r = cagir("KS_oynat", { sec: 2 });
ok("sekans yoksa anlaşılır hata", r.ok === false && r.error === "Aktif sequence yok.", js(r));

// 6) ES3: KS_oynat* gövdelerinde ES5+ yok
var src = fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8");
var bas = src.indexOf("function KS_oynatQE("), son = src.indexOf("/*", src.indexOf("function KS_oynatDurdur("));
var govde = src.slice(bas, son);
ok("ES3: forEach / map / JSON / let / const / => yok", bas > 0 && !/\.forEach\(|\.map\(|\bJSON\.|\blet\s|\bconst\s|=>/.test(govde));

console.log("\n" + gecen + "/" + toplam + " gecti");
if (gecen !== toplam) process.exit(1);
