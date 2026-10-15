// Suflo testi: köprünün (js/bridge.js) geç cevap işlevi (3.4 adım 12 incelemesi). Premiere'in ExtendScript'i zaman
// aşımında durdurulamaz: yoğun anahtar yazan çağrı (Geçiş / Zoom / Hareket önayarı özel eğride) panel vazgeçtikten
// sonra da biter. K.call'un 4. bağımsız değişkeni (gec) o geç cevabı BİR KEZ alır; böylece kaldırma kayıtları
// kaybolmaz. Verilmezse geç cevap eskisi gibi atılır; zamanında gelen cevap gec'e hiç gitmez.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var bekleyen = [];   // evalScript geri çağrıları (sahte Premiere istendiğinde cevaplar)
var sandbox = {
  console: console, JSON: JSON, Math: Math, Date: Date, String: String, Number: Number, Object: Object, Array: Array,
  Error: Error, RegExp: RegExp, Promise: Promise, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
  encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
  setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
  navigator: { platform: "Win32", userAgent: "Windows" },
  document: { getElementById: function () { return null; }, addEventListener: function () {} },
  CSInterface: function () {
    return { getSystemPath: function () { return ""; }, evalScript: function (s, cb) { bekleyen.push({ s: s, cb: cb }); } };
  }
};
sandbox.CSInterface.SystemPath = { EXTENSION: "extension", USER_DATA: "userData" };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(KOK, "js", "bridge.js"), "utf8"), sandbox, { filename: "js/bridge.js" });
var K = sandbox.K;

(async function () {
  ok("köprü yüklendi, K.call var", K && typeof K.call === "function");

  // 1) zaman aşımı → { ok:false, zamanAsimi:true }; geç cevap gec'e bir kez gider
  var gelen = [];
  var p1 = K.call("KS_applyMotionPreset", { id: "pop-in" }, 20, function (v) { gelen.push(v); });
  var c1 = bekleyen.pop();
  var r1 = await p1;
  ok("zaman aşımı: ok false, zamanAsimi true, eski hata metni", r1.ok === false && r1.zamanAsimi === true &&
    r1.error === "Premiere yanıt vermedi (KS_applyMotionPreset) — işlem zaman aşımına uğradı." && gelen.length === 0, js(r1));
  ok("betik eskisi gibi kodlanır (fn(\"…\"))", /^KS_applyMotionPreset\("/.test(c1.s));
  c1.cb(JSON.stringify({ ok: true, applied: 3, records: [{ tur: "hareket" }] }));
  ok("geç cevap gec işlevine çözülmüş olarak gider", gelen.length === 1 && gelen[0].ok === true && gelen[0].applied === 3 && gelen[0].records.length === 1, js(gelen));
  c1.cb(JSON.stringify({ ok: true, applied: 9 }));
  ok("ikinci geç cevap yok sayılır (bir kez)", gelen.length === 1);

  // 2) zamanında gelen cevap gec'e gitmez
  var gelen2 = [];
  var p2 = K.call("KS_autoZoom", { keys: [] }, 1000, function (v) { gelen2.push(v); });
  bekleyen.pop().cb(JSON.stringify({ ok: true, applied: 1 }));
  var r2 = await p2;
  await bekle(5);
  ok("zamanında cevap: söz çözülür, gec çağrılmaz", r2.ok === true && r2.applied === 1 && r2.zamanAsimi === undefined && gelen2.length === 0, js([r2, gelen2]));

  // 3) gec verilmezse geç cevap eskisi gibi atılır (hata yok)
  var p3 = K.call("KS_applyCutTransition", { plan: {} }, 15);
  var c3 = bekleyen.pop();
  var r3 = await p3;
  var atti = true;
  try { c3.cb(JSON.stringify({ ok: true })); } catch (e) { atti = false; }
  ok("gec yoksa geç cevap sessizce atılır", r3.zamanAsimi === true && atti);

  // 4) geç gelen ExtendScript hatası / bozuk yanıt da gec'e { ok:false } olarak gider; gec'in kendi hatası köprüyü bozmaz
  var gelen4 = [];
  var p4 = K.call("KS_autoZoom", {}, 10, function (v) { gelen4.push(v); throw new Error("işleyici hatası"); });
  var c4 = bekleyen.pop();
  await p4;
  var bozulmadi = true;
  try { c4.cb("EvalScript error."); } catch (e) { bozulmadi = false; }
  ok("geç ExtendScript hatası gec'e ok:false; işleyicinin hatası yakalanır", bozulmadi && gelen4.length === 1 && gelen4[0].ok === false, js(gelen4));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
