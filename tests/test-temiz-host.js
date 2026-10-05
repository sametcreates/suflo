// Suflo testi: host KS_swapOverlayMedia + KS_overlayInstances (sahte Premiere modeliyle)
// Satın alma sonrası temiz yeniden oluşturma: deneme dosyası projede YERİNDE temiz olanla
// değiştirilir (changeMediaPath) — timeline'daki taşıma/kırpma/bölme/kopya korunur. Örnek
// sorgusu yalnız okur. İnceleme bulgusu: eskiden temiz klip kayıttaki ana tam uzunlukta konup
// deneme dosyasının TÜM klipleri siliniyordu; düzenlenmiş kurgu sessizce bozuluyordu.
var fs = require("fs"), path = require("path"), vm = require("vm");
var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) { toplam++; if (kosul) gecen++; console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 240) + "]" : "")); }

var DENEME = "C:\\Users\\Ali\\AppData\\Roaming\\Suflo\\srt\\suflo-altyazi-1.mov";
var TEMIZ = "C:\\Users\\Ali\\AppData\\Roaming\\Suflo\\srt\\suflo-temiz-altyazi-2.mov";
var VAR_OLAN = {};
VAR_OLAN[TEMIZ] = true;

function oge(yol, ek) {
  var o = { type: 1, name: "oge", yol: yol, degisti: [], getMediaPath: function () { return this.yol; },
    changeMediaPath: function (p, override) { this.degisti.push([p, override]); this.yol = p; return true; },
    canChangeMediaPath: function () { return true; } };
  Object.keys(ek || {}).forEach(function (k) { o[k] = ek[k]; });
  return o;
}
function kutu(cocuklar) {
  var c = { numItems: cocuklar.length };
  cocuklar.forEach(function (x, i) { c[i] = x; });
  return { type: 2, children: c };
}
function zaman(s) { return { seconds: s }; }
var silinen = [];
function klip(item, bas, bit, gir, cik) {
  return { projectItem: item, start: zaman(bas), end: zaman(bit), inPoint: zaman(gir), outPoint: zaman(cik), nodeId: "n" + bas,
    remove: function () { silinen.push(this); } };
}
function iz(klipler) {
  var c = { numItems: klipler.length };
  klipler.forEach(function (x, i) { c[i] = x; });
  return { clips: c };
}

function host(rootItem, seq) {
  var ctx = { app: { version: "25.1.0", project: { rootItem: rootItem, activeSequence: seq } },
    Time: function () {}, decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent, isFinite: isFinite,
    Math: Math, String: String, Number: Number, Error: Error,
    File: function (p) { this.exists = !!VAR_OLAN[p]; }, Folder: function () {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "jsx", "host.jsx"), "utf8"), ctx);
  return function (fn, arg) { return JSON.parse(ctx[fn](encodeURIComponent(JSON.stringify(arg)))); };
}

/* ---------------- KS_overlayInstances: yalnız okur ---------------- */
var deneme = oge(DENEME), baska = oge("C:\\Users\\Ali\\Videos\\roportaj.mp4"), eskiSuflo = oge("C:\\Users\\Ali\\AppData\\Roaming\\Suflo\\srt\\suflo-altyazi-0.mov");
// kullanıcı deneme katmanını jiletle bölmüş, ikinci parçayı kaydırmış ve başka ize kopyalamış
var seq = { timebase: String(254016000000 / 25), videoTracks: { numTracks: 3,
  0: iz([klip(baska, 0, 60, 0, 60)]),
  1: iz([klip(deneme, 12.5, 14, 0, 1.5), klip(deneme, 20, 21.5, 1.5, 3), klip(eskiSuflo, 30, 33, 0, 3)]),
  2: iz([klip(deneme, 40, 43, 0, 3)]) } };
var cagir = host(kutu([kutu([deneme, eskiSuflo]), baska]), seq);
// Windows: büyük/küçük harf ve \ ile / farkı önemsiz
var r = cagir("KS_overlayInstances", { path: DENEME.replace(/\\/g, "/").toUpperCase() });
ok("örnekler: yalnız deneme dosyasının klipleri (3), başka Suflo katmanı ve video hariç", r.ok && r.instances.length === 3, JSON.stringify(r));
ok("örnek: iz, başlangıç/bitiş, kaynak in/out", JSON.stringify(r.instances[1]) === JSON.stringify({ track: 1, trackName: "V2", start: 20, end: 21.5, inPoint: 1.5, outPoint: 3 }) &&
  r.instances[2].trackName === "V3" && r.instances[2].start === 40, JSON.stringify(r.instances));
ok("örnek: sekans kare süresi timebase'den", Math.abs(r.frame - 0.04) < 1e-9, r.frame);
ok("örnek sorgusu hiçbir klibi silmez, medyayı değiştirmez", silinen.length === 0 && deneme.degisti.length === 0);
ok("örnek sorgusu: yol yoksa hata", cagir("KS_overlayInstances", {}).ok === false);
ok("örnek sorgusu: sekans yoksa hata", host(kutu([]), null)("KS_overlayInstances", { path: DENEME }).ok === false);

/* ---------------- KS_swapOverlayMedia: projede yerinde değiştir ---------------- */
var s1 = cagir("KS_swapOverlayMedia", { path: DENEME.toLowerCase(), newPath: TEMIZ });
ok("değiştirme: kutudaki deneme öğesi temiz dosyaya bağlandı (güvenlik denetimi açık)", s1.ok && s1.items === 1 && s1.swapped === 1 &&
  deneme.yol === TEMIZ && JSON.stringify(deneme.degisti) === JSON.stringify([[TEMIZ, false]]), JSON.stringify(s1));
ok("değiştirme: başka öğelere (eski Suflo katmanı, video) dokunulmaz, klip silinmez", eskiSuflo.degisti.length === 0 && baska.degisti.length === 0 && silinen.length === 0);
var sonra = cagir("KS_overlayInstances", { path: TEMIZ });
ok("değiştirme sonrası: bütün düzenlenmiş klipler yerinde, artık temiz dosyada", sonra.instances.length === 3 &&
  sonra.instances.map(function (o) { return o.start + "-" + o.end; }).join(",") === "12.5-14,20-21.5,40-43", JSON.stringify(sonra.instances));

var s2 = cagir("KS_swapOverlayMedia", { path: DENEME, newPath: "C:\\yok.mov" });
ok("temiz dosya diskte yoksa hata, hiçbir şey değişmez", s2.ok === false && /Temiz dosya yok/.test(s2.error), JSON.stringify(s2));
ok("öğe bulunamazsa swapped 0 + sebep (yedek yola geçilir)", (function () {
  var x = host(kutu([oge("C:\\baska.mov")]), seq)("KS_swapOverlayMedia", { path: DENEME, newPath: TEMIZ });
  return x.ok && x.items === 0 && x.swapped === 0 && /proje ogesi yok/.test(x.reason);
})());

var kilitli = oge(DENEME, { canChangeMediaPath: function () { return false; } });
var k1 = host(kutu([kilitli]), seq)("KS_swapOverlayMedia", { path: DENEME, newPath: TEMIZ });
ok("canChangeMediaPath false: değiştirilmez, swapped 0", k1.ok && k1.items === 1 && k1.swapped === 0 && kilitli.degisti.length === 0 && /canChangeMediaPath/.test(k1.reason), JSON.stringify(k1));
var eskiApi = oge(DENEME); eskiApi.changeMediaPath = undefined;
var k2 = host(kutu([eskiApi]), seq)("KS_swapOverlayMedia", { path: DENEME, newPath: TEMIZ });
ok("changeMediaPath yok (eski API): swapped 0", k2.ok && k2.swapped === 0 && /changeMediaPath yok/.test(k2.reason), JSON.stringify(k2));
var sessiz = oge(DENEME, { changeMediaPath: function () { return false; } });
var k3 = host(kutu([sessiz]), seq)("KS_swapOverlayMedia", { path: DENEME, newPath: TEMIZ });
ok("changeMediaPath sessizce başarısız: getMediaPath doğrulaması swapped 0 der", k3.ok && k3.swapped === 0 && /yol degismedi/.test(k3.reason), JSON.stringify(k3));
var atan = oge(DENEME, { changeMediaPath: function () { throw new Error("Bad media"); } });
var k4 = host(kutu([atan]), seq)("KS_swapOverlayMedia", { path: DENEME, newPath: TEMIZ });
ok("changeMediaPath istisna atarsa: swapped 0, sebep raporlanır", k4.ok && k4.swapped === 0 && /Bad media/.test(k4.reason), JSON.stringify(k4));
var iki = [oge(DENEME), oge(DENEME, { canChangeMediaPath: function () { return false; } })];
var k5 = host(kutu([iki[0], kutu([iki[1]])]), seq)("KS_swapOverlayMedia", { path: DENEME, newPath: TEMIZ });
ok("aynı dosyadan iki öğe, biri kilitli: kısmi (items 2, swapped 1)", k5.ok && k5.items === 2 && k5.swapped === 1, JSON.stringify(k5));
ok("değiştirme: yol eksikse hata", cagir("KS_swapOverlayMedia", { path: DENEME }).ok === false);

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
