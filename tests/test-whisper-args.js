// Suflo testi: js/whisper-args.js yerel motor argümanları (3.2 adım 5)
//  - çözme modları: "dogru" bugünkü -bs 5, "hizli" -bs 1 -bo 1 (sıcaklık geri dönüşü açık: -nf yok)
//  - VAD, sözlük ipucu, kelime modu (argüman değişmez), -ml 1 -sow yedeği, DTW (-dtw <ön ayar> -nfa), -tr
//    ve birlikte kullanımları; -tr Turbo / Tiny / Base'de reddedilir; DTW ön ayar haritası
//  - ASCII-güvenli yol kancası (K.guvenliYol), KEngine.buildArgs devri (engine.js)
//  - whisper-cli yardım metni, tanınmayan bayrak, Doctor satırları
//  - gerçek whisper.cpp v1.9.1 "-h" çıktısı (tests/fixtures/whisper-cli-v1.9.1-yardim.txt)
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var KOK = path.join(__dirname, "..");
var W = require(path.join(KOK, "js", "whisper-args.js"));

var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function sonra(a, bayrak) { var i = a.indexOf(bayrak); return i === -1 ? undefined : a[i + 1]; }
function say(a, x) { return a.filter(function (y) { return y === x; }).length; }

var TABAN = { model: "/m/ggml-large-v3-turbo-q5_0.bin", audio: "/t/a.wav", lang: "tr", outBase: "/t/a_w", threads: 6 };
function arg(ek) { return W.olustur(Object.assign({}, TABAN, ek || {})); }

/* ---------------- 1) çözme modları ---------------- */

var bugun = ["-m", "/m/ggml-large-v3-turbo-q5_0.bin", "-f", "/t/a.wav", "-l", "tr", "-ojf", "-of", "/t/a_w", "-t", "6", "-pp", "-bs", "5"];
ok("varsayılan (cozme yok) = bugünkü argümanlar birebir", js(arg()) === js(bugun), arg().join(" "));
ok("cozme 'dogru' = -bs 5 (bugünkü davranış), -bo yok", js(arg({ cozme: "dogru" })) === js(bugun));
var hizli = arg({ cozme: "hizli" });
ok("cozme 'hizli' = -bs 1 -bo 1", sonra(hizli, "-bs") === "1" && sonra(hizli, "-bo") === "1" && say(hizli, "-bs") === 1, hizli.join(" "));
ok("hızlıda sıcaklık geri dönüşü açık kalır (-nf / --no-fallback yok)", hizli.indexOf("-nf") === -1 && hizli.indexOf("--no-fallback") === -1);
ok("bilinmeyen / boş cozme -> varsayılan (dogru)", js(arg({ cozme: "turbo" })) === js(bugun) && js(arg({ cozme: null })) === js(bugun) && W.cozmeModu("HIZLI") === "hizli");
ok("varsayılan kıyastan önce değişmedi: VARSAYILAN_COZME = 'dogru'", W.VARSAYILAN_COZME === "dogru" && js(W.COZME_MODLARI) === js(["dogru", "hizli"]));
ok("cozmeBayraklari kopya döner (değiştirmek modülü bozmaz)", (function () { var b = W.cozmeBayraklari("hizli"); b.push("x"); return W.cozmeBayraklari("hizli").length === 4; })());
ok("dil yoksa auto, iş parçacığı yoksa 4", sonra(W.olustur({ model: "m", audio: "a", outBase: "o" }), "-l") === "auto" && sonra(W.olustur({ model: "m", audio: "a", outBase: "o" }), "-t") === "4");

/* ---------------- 2) VAD, ipucu, kelime modu, yedek ---------------- */

var vad = arg({ vad: "/w/models/ggml-silero-v5.1.2.bin" });
ok("VAD: --vad -vm <yol> -vsd 500 -vp 250 (milisaniye)", vad.join(" ").indexOf("--vad -vm /w/models/ggml-silero-v5.1.2.bin -vsd 500 -vp 250") !== -1, vad.join(" "));
ok("VAD yoksa --vad yok", arg().indexOf("--vad") === -1 && arg({ vad: "" }).indexOf("--vad") === -1);
var ipucu = arg({ prompt: new Array(900).join("ş") });
ok("sözlük ipucu --prompt, en çok 700 karakter", sonra(ipucu, "--prompt").length === 700);
ok("ipucu yoksa --prompt yok", arg({ prompt: "" }).indexOf("--prompt") === -1);
ok("kelime modu argümanı değiştirmez (tek -ojf transkripsiyonu)", js(arg({ wordLevel: true })) === js(arg({ wordLevel: false })));
var yedek = arg({ kelimeYedegi: true });
ok("eski derleme yedeği: -ml 1 -sow, -ojf korunur", yedek.join(" ").indexOf("-ml 1 -sow") !== -1 && yedek.indexOf("-ojf") !== -1);

/* ---------------- 3) DTW ---------------- */

var harita = { tiny: "tiny", base: "base", small: "small", turbo: "large.v3.turbo", large: "large.v3" };
Object.keys(harita).forEach(function (id) {
  var a = arg({ dtw: true, modelId: id });
  ok("DTW ön ayarı: " + id + " -> " + harita[id] + " (+ -nfa)", sonra(a, "-dtw") === harita[id] && a.indexOf("-nfa") !== -1 && a.indexOf("-nfa") === a.indexOf("-dtw") + 2, a.join(" "));
});
ok("DTW_ON_AYAR dışa açılan kopya plandaki haritayla aynı", js(W.DTW_ON_AYAR) === js(harita));
ok("modelId yoksa dosya adından: Suflo'nun 5 model dosyası",
  W.dtwOnAyari("ggml-tiny-q5_1.bin") === "tiny" && W.dtwOnAyari("/x/ggml-base-q5_1.bin") === "base" &&
  W.dtwOnAyari("C:\\Users\\Ş\\whisper\\models\\ggml-small-q5_1.bin") === "small" &&
  W.dtwOnAyari("ggml-large-v3-turbo-q5_0.bin") === "large.v3.turbo" && W.dtwOnAyari("ggml-large-v3-q5_0.bin") === "large.v3");
ok("dosya adından: varsayılan TABAN modeli turbo", sonra(arg({ dtw: true }), "-dtw") === "large.v3.turbo");
ok("ön ayarı bilinmeyen model (medium, .en, large-v2, özel) DTW almaz",
  ["ggml-medium.bin", "ggml-base.en.bin", "ggml-tiny.en-q5_1.bin", "ggml-large-v2.bin", "ozel-model.bin", "", null].every(function (m) {
    var a = W.olustur({ model: m, audio: "a", outBase: "o", dtw: true });
    return a.indexOf("-dtw") === -1 && a.indexOf("-nfa") === -1;
  }));
ok("DTW kapalıyken -dtw / -nfa yok (flash attention varsayılanı korunur)", arg().indexOf("-dtw") === -1 && arg().indexOf("-nfa") === -1 && arg({ dtw: false }).indexOf("-nfa") === -1);
ok("-ml 1 yedeğinde DTW eklenmez (eski derleme -dtw tanımaz)", arg({ dtw: true, kelimeYedegi: true }).indexOf("-dtw") === -1);
var s1 = W.secenekler({ model: "ggml-medium.bin", dtw: true });
ok("secenekler: ön ayar yoksa dtwReddi", s1.dtw === "" && s1.dtwReddi === true && W.secenekler(TABAN).dtwReddi === false);

/* ---------------- 4) çevrimdışı İngilizce (-tr) ---------------- */

ok("-tr: Small ve Large'da eklenir", arg({ cevir: true, modelId: "small" }).indexOf("-tr") !== -1 && arg({ cevir: true, modelId: "large" }).indexOf("-tr") !== -1);
ok("-tr: Turbo'da REDDEDİLİR (çeviri için eğitilmedi)", arg({ cevir: true, modelId: "turbo" }).indexOf("-tr") === -1 && arg({ cevir: true }).indexOf("-tr") === -1);
ok("-tr: Tiny ve Base'de reddedilir, bilinmeyen modelde reddedilir",
  ["tiny", "base"].every(function (id) { return arg({ cevir: true, modelId: id }).indexOf("-tr") === -1; }) &&
  W.olustur({ model: "ggml-medium.bin", audio: "a", outBase: "o", cevir: true }).indexOf("-tr") === -1);
ok("cevirebilir: yalnız small ve large (kimlik ya da dosya)", W.cevirebilir("small") && W.cevirebilir("ggml-large-v3-q5_0.bin") &&
  !W.cevirebilir("turbo") && !W.cevirebilir("ggml-large-v3-turbo-q5_0.bin") && !W.cevirebilir("tiny") && !W.cevirebilir("base") && !W.cevirebilir(""));
var s2 = W.secenekler({ modelId: "turbo", cevir: true });
ok("secenekler: Turbo'da ceviriReddi, Large'da cevir", s2.cevir === false && s2.ceviriReddi === true && W.secenekler({ modelId: "large", cevir: true }).cevir === true);
ok("-tr kaynak dili korur (-l tr -tr: Türkçe ses İngilizceye)", sonra(arg({ cevir: true, modelId: "large" }), "-l") === "tr");
ok("istenmeyen çeviri -tr eklemez", arg({ modelId: "large" }).indexOf("-tr") === -1);

/* ---------------- 5) birlikte kullanım ---------------- */

var hepsi = W.olustur({ model: "/m/ggml-large-v3-q5_0.bin", audio: "/a.wav", outBase: "/o", lang: "tr", threads: 8,
  cozme: "hizli", vad: "/v.bin", prompt: "Suflo", dtw: true, cevir: true });
ok("hızlı + VAD + ipucu + DTW + -tr hepsi bir arada, her bayrak bir kez",
  sonra(hepsi, "-bs") === "1" && sonra(hepsi, "-bo") === "1" && hepsi.indexOf("--vad") !== -1 && sonra(hepsi, "--prompt") === "Suflo" &&
  sonra(hepsi, "-dtw") === "large.v3" && say(hepsi, "-nfa") === 1 && say(hepsi, "-tr") === 1 && say(hepsi, "-ojf") === 1, hepsi.join(" "));
ok("bayrak sırası: çözme, --prompt, VAD, DTW, -tr (sondaki eklemeler yolları kaydırmaz)",
  hepsi.indexOf("-bs") < hepsi.indexOf("--prompt") && hepsi.indexOf("--prompt") < hepsi.indexOf("--vad") &&
  hepsi.indexOf("--vad") < hepsi.indexOf("-dtw") && hepsi.indexOf("-dtw") < hepsi.indexOf("-tr"));
ok("Turbo + DTW + -tr: DTW eklenir, -tr reddedilir", (function () { var a = arg({ dtw: true, cevir: true }); return sonra(a, "-dtw") === "large.v3.turbo" && a.indexOf("-tr") === -1; })());
ok("takılma kurtarma turunun -mc 0 eki sona eklenebilir (dizi döner)", Array.isArray(arg({ dtw: true })) && arg().concat(["-mc", "0"]).slice(-2).join(" ") === "-mc 0");
ok("hiçbir öğe undefined / null değil", [arg(), hizli, vad, hepsi, yedek].every(function (a) { return a.every(function (x) { return typeof x === "string"; }); }));

/* ---------------- 6) ASCII-güvenli yol kancası ---------------- */

var cagri = [];
var kanca = W.olustur({ model: "C:\\Users\\BASIN TEKNİK\\m.bin", audio: "C:\\Users\\BASIN TEKNİK\\a.wav", outBase: "C:\\Users\\BASIN TEKNİK\\a_w",
  vad: "C:\\Users\\BASIN TEKNİK\\v.bin", yol: function (p, tur) { cagri.push(tur); return "C:\\BASINT~1\\" + p.replace(/^.*\\/, ""); } });
ok("yol kancası model, ses, çıktı ve VAD yolunu çevirir", kanca[1] === "C:\\BASINT~1\\m.bin" && kanca[3] === "C:\\BASINT~1\\a.wav" &&
  sonra(kanca, "-of") === "C:\\BASINT~1\\a_w" && sonra(kanca, "-vm") === "C:\\BASINT~1\\v.bin", kanca.join(" "));
ok("kanca türleri: girdi, girdi, cikti, girdi", js(cagri) === js(["girdi", "girdi", "cikti", "girdi"]), js(cagri));
ok("kanca yoksa yollar olduğu gibi", arg()[1] === TABAN.model && sonra(arg(), "-of") === TABAN.outBase);
ok("-dtw ön ayarı ve dil kancadan geçmez (yol değil)", (function () {
  var t = [];
  var a = W.olustur(Object.assign({}, TABAN, { dtw: true, yol: function (p, tur) { t.push(p); return p; } }));
  return t.indexOf("large.v3.turbo") === -1 && t.indexOf("tr") === -1 && sonra(a, "-dtw") === "large.v3.turbo";
})());

/* ---------------- 7) KEngine.buildArgs devri (engine.js) ---------------- */

function motorOrtami(vadVar, guvenli) {
  var sb = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, Buffer: Buffer };
  sb.window = sb;
  sb.K = {
    nodeOK: true, MAC: false, log: function () {},
    path: path, os: require("os"),
    whisperDir: function () { return "/w"; },
    fs: { existsSync: function (p) { return !!vadVar && /silero/.test(p); }, statSync: function () { return { size: 900000 }; } },
    settings: function () { return {}; },
    guvenliYol: guvenli
  };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "whisper-args.js"), "utf8"), sb, { filename: "whisper-args.js" });
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "engine.js"), "utf8"), sb, { filename: "engine.js" });
  return sb.KEngine;
}
var E = motorOrtami(true, function (p, tur) { return tur === "cikti" ? p + "~" : "~" + p; });
var b1 = E.buildArgs(Object.assign({}, TABAN, { cozme: "hizli", dtw: true, cevir: true }));
ok("buildArgs: { args, vad, cozme, dtw, cevir, modelId, gunluk } döner", Array.isArray(b1.args) && b1.vad === true &&
  b1.cozme === "hizli" && b1.dtw === "large.v3.turbo" && b1.cevir === false && b1.modelId === "turbo" && typeof b1.gunluk === "string", js(b1));
ok("buildArgs: K.guvenliYol model/ses/çıktı/VAD'a uygulanır", b1.args[1] === "~" + TABAN.model && sonra(b1.args, "-of") === TABAN.outBase + "~" &&
  /^~.*silero/.test(sonra(b1.args, "-vm")), b1.args.join(" "));
ok("buildArgs: çıktı saf modülle birebir aynı (vad + yol aynı)", js(b1.args) === js(W.olustur(Object.assign({}, TABAN, { cozme: "hizli", dtw: true, cevir: true,
  vad: path.join("/w", "models", "ggml-silero-v5.1.2.bin"), yol: function (p, tur) { return tur === "cikti" ? p + "~" : "~" + p; } }))));
var E2 = motorOrtami(false, null);
var b2 = E2.buildArgs(TABAN);
ok("buildArgs: VAD modeli yoksa vad false, --vad yok; kanca yoksa yollar aynen", b2.vad === false && b2.args.indexOf("--vad") === -1 && b2.args[1] === TABAN.model && js(b2.args) === js(bugun));
ok("buildArgs: çağıranın nesnesi değişmez (yol/vad eklenmez)", (function () { var o = Object.assign({}, TABAN); E.buildArgs(o); return o.yol === undefined && o.vad === undefined; })());
ok("buildArgs günlüğü: cozme ve dtw yazılır", /cozme=hizli \(.*-bs 1 -bo 1\)/.test(b1.gunluk) && /dtw=large\.v3\.turbo/.test(b1.gunluk) && /ceviri=reddedildi \(turbo\)/.test(b1.gunluk), b1.gunluk);
ok("günlük: DTW kapalıyken dtw=kapali, istenip ön ayar yokken dtw=yok (model)", /dtw=kapali/.test(W.gunlukMetni(TABAN)) &&
  /dtw=yok \(bilinmeyen model\)/.test(W.gunlukMetni({ model: "x.bin", dtw: true })) && W.gunlukMetni(TABAN).indexOf("ceviri") === -1);

/* ---------------- 8) whisper-cli yardım metni ve hatalar ---------------- */

var yardim = fs.readFileSync(path.join(__dirname, "fixtures", "whisper-cli-v1.9.1-yardim.txt"), "utf8");
var d = W.yardimDestegi(yardim);
ok("gerçek v1.9.1 yardımı: -dtw, -nfa, -tr, -bo desteklenir", d.okundu && d.dtw && d.nfa && d.tr && d.bo, js(d));
ok("v1.9.1 yardımında flash attention varsayılan AÇIK (DTW için -nfa şart)", /-fa,\s+--flash-attn\s+\[true\s*\]/.test(yardim));
var eski = yardim.split("\n").filter(function (s) { return !/-dtw|flash-attn/.test(s); }).join("\n");
var d2 = W.yardimDestegi(eski);
ok("eski yardım (-dtw/-nfa yok): okundu ama DTW desteklenmez", d2.okundu && !d2.dtw && !d2.nfa && d2.tr, js(d2));
ok("tanınmayan metin: okundu false", W.yardimDestegi("segmentation fault").okundu === false && W.yardimDestegi(null).okundu === false);
ok("tanınmayan bayrak ayıklanır (whisper-cli kod 0 ile çıkar)", W.bilinmeyenBayrak("error: unknown argument: -nfa\n\nusage: whisper-cli [options]") === "-nfa" &&
  W.bilinmeyenBayrak("whisper_init: ok") === "" && W.bilinmeyenBayrak(undefined) === "");
ok("bilinmeyen DTW ön ayarı ayıklanır", W.bilinmeyenOnAyar("error: unknown DTW preset 'large.v3.turbo'") === "large.v3.turbo" && W.bilinmeyenOnAyar("") === "");
ok("dtwAnahtari: model + derleme", W.dtwAnahtari("ggml-large-v3-turbo-q5_0.bin", "cuda") === "turbo@cuda" && W.dtwAnahtari("small", "") === "small@cpu" && W.dtwAnahtari("x.bin", "metal") === "bilinmeyen@metal");
ok("dtwSonucu: yok / kapali / calisti", W.dtwSonucu({}) === "yok" && W.dtwSonucu({ toplam: 40, olculen: 0 }) === "kapali" && W.dtwSonucu({ toplam: 40, olculen: 3 }) === "calisti");

/* ---------------- 9) Doctor satırları ---------------- */

function satir(d0, baslik) { return W.doctorSatirlari(d0).filter(function (s) { return s.title === baslik; })[0]; }
var D1 = satir({ cozme: "dogru", model: "turbo", dtwAyar: true, yardim: d }, "Çözme modu");
ok("Doctor: çözme modu satırı (En doğru · beam search -bs 5)", D1.status === "good" && /En doğru/.test(D1.detail) && /-bs 5/.test(D1.detail), js(D1));
ok("Doctor: Hızlı modu", /Hızlı · açgözlü/.test(satir({ cozme: "hizli" }, "Çözme modu").detail));
ok("Doctor: bilinmeyen çözme -> En doğru", /En doğru/.test(satir({ cozme: "?" }, "Çözme modu").detail));
var T = "Hassas kelime zamanlaması (DTW)";
ok("Doctor: DTW destekleniyor + açık (ön ayar adıyla)", (function () { var s = satir({ model: "ggml-large-v3-turbo-q5_0.bin", dtwAyar: true, yardim: d }, T); return s.status === "good" && /Açık · desteklenir \(large\.v3\.turbo\)/.test(s.detail); })());
ok("Doctor: DTW destekleniyor + kapalı", /Kapalı · desteklenir \(small\)/.test(satir({ model: "small", dtwAyar: false, yardim: d }, T).detail));
ok("Doctor: eski derleme -dtw tanımıyor -> uyarı", (function () { var s = satir({ model: "turbo", dtwAyar: true, yardim: d2 }, T); return s.status === "warn" && /-dtw \/ -nfa tanımıyor/.test(s.detail); })());
ok("Doctor: ön ayarı olmayan model -> uyarı", /DTW ön ayarı yok/.test(satir({ model: "ggml-medium.bin", yardim: d }, T).detail));
ok("Doctor: otomatik kapatılmış (model@derleme) -> uyarı", (function () {
  var s = satir({ model: "turbo", derleme: "cuda", dtwAyar: true, yardim: d, dtwKapali: { "turbo@cuda": "t_dtw" } }, T);
  var cpu = satir({ model: "turbo", derleme: "cpu", dtwAyar: true, yardim: d, dtwKapali: { "turbo@cuda": "t_dtw" } }, T);
  return s.status === "warn" && /otomatik kapatıldı/.test(s.detail) && cpu.status === "good";
})());
ok("Doctor: yardım okunamadıysa model ön ayarına göre karar verilir", satir({ model: "base", yardim: null }, T).status === "good");
ok("Doctor: her zaman iki satır", W.doctorSatirlari({}).length === 2 && W.doctorSatirlari().length === 2);

/* ---------------- 10) panel bağlantısı ---------------- */

var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
function sira(ad) { return html.indexOf('<script src="js/' + ad + '"'); }
ok("index.html: whisper-args.js engine.js'ten önce yüklenir", sira("whisper-args.js") > 0 && sira("whisper-args.js") < sira("engine.js"));
var motorKaynak = fs.readFileSync(path.join(KOK, "js", "engine.js"), "utf8");
ok("engine.js: buildArgs SufloWhisperArgs.olustur'a devreder (bayrakları kendisi yazmaz)", /WAR\.olustur\(girdi\)/.test(motorKaynak) &&
  !/"-bs", "5"/.test(motorKaynak.slice(motorKaynak.indexOf("function buildArgs"), motorKaynak.indexOf("ffmpeg kurulumu"))));

console.log("\n" + gecen + "/" + toplam + " gecti");
if (gecen !== toplam) process.exit(1);
