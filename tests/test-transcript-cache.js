// Suflo testi: js/transcript-cache.js — transkript önbelleği (kaynak zamanı, kapsayan girdi, LRU, atomik yazım)
var fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
var TCache = require(path.join(__dirname, "..", "js", "transcript-cache.js"));

var gecen = 0, toplam = 0;
function chk(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : ""));
}

var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-tcache-"));
var dir = path.join(kok, "Kesit", "transcripts");
var saat = 1000;
function yeni(o) {
  o = o || {};
  return TCache.create({ fs: o.fs || fs, path: path, crypto: crypto, dir: dir, maxEntries: o.maxEntries, maxBytes: o.maxBytes, now: function () { return ++saat; } });
}
var C = yeni();
var meta = { mediaPath: "/v/klip.mp4", size: 1000, mtimeMs: 111, inPoint: 10, dur: 20, lang: "tr", engine: "yerel:large", prompt: "dolgu" };
var kelimeler = [
  { start: 0.5, end: 0.9, text: "Merhaba", confidence: 0.9 },
  { start: 5.0, end: 5.4, text: "ııı" },
  { start: 12.0, end: 12.5, text: "kamera" },
  { start: 19.0, end: 19.6, text: "son." }
];

chk("boş önbellek: ıska", C.get(meta) === null);
chk("put başarılı", C.put(meta, { words: kelimeler, lang: "tr" }) === true);
var g1 = C.get(meta);
chk("put/get gidiş-dönüş (inPoint'e göreli)", g1 && g1.words.length === 4 && g1.words[0].start === 0.5 && g1.words[3].end === 19.6 && g1.lang === "tr" && g1.covering === false, JSON.stringify(g1));
chk("güven değeri korunur", g1 && g1.words[0].confidence === 0.9 && !("confidence" in g1.words[1]));
var disk = JSON.parse(fs.readFileSync(path.join(dir, C.key(meta) + ".json"), "utf8"));
chk("diskte KAYNAK-mutlak zaman", disk.words[0].start === 10.5 && disk.words[3].end === 29.6, JSON.stringify(disk.words[0]));

function degis(k, v) { var m = JSON.parse(JSON.stringify(meta)); m[k] = v; return m; }
chk("mtime değişince ıska", C.get(degis("mtimeMs", 112)) === null);
chk("boyut değişince ıska", C.get(degis("size", 1001)) === null);
chk("dil / motor / istem değişince ıska", C.get(degis("lang", "en")) === null && C.get(degis("engine", "bulut:x")) === null && C.get(degis("prompt", "altyazi")) === null);
chk("istem yedeği: altyazı isteği yoksa dolgu kullanılmaz, dolgu varsa sıralı arama bulur", C.get(degis("prompt", "altyazi"), { prompts: ["altyazi"] }) === null &&
  C.get(degis("prompt", "altyazi"), { prompts: ["altyazi", "dolgu"] }) !== null);

// kapsayan girdi: kesimden kalan alt klip [21, 29] kaynak saniyesi
var alt = degis("inPoint", 21); alt.dur = 8;
var g2 = C.get(alt);
chk("kapsayan girdi: kesilmiş ve kaydırılmış kelimeler", g2 && g2.covering === true && g2.words.length === 1 && g2.words[0].text === "kamera" &&
  Math.abs(g2.words[0].start - 1.0) < 1e-9 && Math.abs(g2.words[0].end - 1.5) < 1e-9, JSON.stringify(g2));
var tasan = degis("inPoint", 25); tasan.dur = 10;   // 25..35: girdinin dışına taşıyor
chk("aralığı aşan istek kapsanmaz", C.get(tasan) === null);
// dolgu tercihi: aynı aralıkta altyazı girdisi de varsa dolgu önce gelir
C.put(degis("prompt", "altyazi"), { words: [{ start: 0, end: 1, text: "altyazıdan" }], lang: "tr" });
var g3 = C.get(meta, { prompts: ["dolgu", "altyazi"] });
chk("Konuşmadan kes 'dolgu' girdisini tercih eder", g3 && g3.prompt === "dolgu" && g3.words[0].text === "Merhaba");
var yalnizAlt = degis("mediaPath", "/v/diger.mp4");
var digerAlt = degis("mediaPath", "/v/diger.mp4"); digerAlt.prompt = "altyazi";
C.put(digerAlt, { words: [{ start: 1, end: 2, text: "yalnız" }], lang: "tr" });
var g4 = C.get(yalnizAlt, { prompts: ["dolgu", "altyazi"] });
chk("dolgu girdisi yoksa altyazı girdisine düşer", g4 && g4.prompt === "altyazi" && g4.words[0].text === "yalnız");

// atomik yazım: geride .tmp kalmaz
var artik = fs.readdirSync(dir).filter(function (f) { return /\.tmp/.test(f); });
chk("atomik yazım: geçici dosya kalmaz", artik.length === 0, artik.join(","));
// rename düşerse (Windows kilidi) yeniden denenir; tamamen düşerse false döner, fırlatmaz
var kiriFs = Object.create(fs);
kiriFs.renameSync = function () { throw new Error("EPERM"); };
var Ck = yeni({ fs: kiriFs });
var sonucK;
try { sonucK = Ck.put(degis("inPoint", 99), { words: kelimeler }); } catch (e) { sonucK = "fırlattı"; }
chk("yazım tümden düşerse false, fırlatmaz, tmp silinir", sonucK === false && fs.readdirSync(dir).filter(function (f) { return /\.tmp/.test(f); }).length === 0, String(sonucK));

// bozuk dizin: ıska, fırlatmaz; sonra put dizini onarır
fs.writeFileSync(path.join(dir, "index.json"), "{bozuk json", "utf8");
var g5;
try { g5 = C.get(meta); } catch (e) { g5 = "fırlattı"; }
chk("bozuk dizin: ıska, fırlatmaz", g5 === null);
fs.unlinkSync(path.join(dir, "index.json"));
chk("eksik dizin: ıska", C.get(meta) === null);
chk("put sonrası dizin onarılır", C.put(meta, { words: kelimeler, lang: "tr" }) && C.get(meta) !== null);
// bozuk girdi dosyası: ıska
fs.writeFileSync(path.join(dir, C.key(meta) + ".json"), "xx", "utf8");
chk("bozuk girdi dosyası: ıska", C.get(meta) === null);

// LRU: 50'yi aşınca en eski kullanılan gider
C.clear();
for (var i = 0; i < 52; i++) C.put(degis("inPoint", 100 + i), { words: kelimeler, lang: "tr" });
chk("LRU: 50 girdiyle sınırlı", C.stats().entries === 50, C.stats().entries);
chk("LRU: en eski iki girdi silindi", C.get(degis("inPoint", 100)) === null && C.get(degis("inPoint", 101)) === null && C.get(degis("inPoint", 151)) !== null);
var dosyaSayisi = fs.readdirSync(dir).filter(function (f) { return /^[0-9a-f]{40}\.json$/.test(f); }).length;
chk("LRU: silinen girdinin dosyası da gider", dosyaSayisi === 50, dosyaSayisi);
// get lastUsed'ı tazeler: 102 okunduysa, yeni yazımda 103 silinir
C.get(degis("inPoint", 102));
C.put(degis("inPoint", 200), { words: kelimeler });
chk("LRU: okunan girdi korunur", C.get(degis("inPoint", 102)) !== null && C.get(degis("inPoint", 103)) === null);
// bayt sınırı
var Cb = yeni({ maxBytes: 1200 });
Cb.clear();
var uzun = [];
for (var u = 0; u < 20; u++) uzun.push({ start: u, end: u + 0.5, text: "kelime" + u });
Cb.put(degis("inPoint", 1), { words: uzun });
Cb.put(degis("inPoint", 2), { words: uzun });
chk("LRU: bayt sınırı aşılınca eskiler gider", Cb.stats().entries === 1 && Cb.stats().bytes <= 1200, JSON.stringify(Cb.stats()));

chk("clear() önbelleği boşaltır", C.clear() > 0 && fs.readdirSync(dir).length === 0 && C.get(meta) === null && C.stats().entries === 0);
var bosC = TCache.create({});
chk("bağımlılıksız örnek sessizce ıska verir", bosC.get(meta) === null && bosC.put(meta, { words: [] }) === false && bosC.clear() === 0);

// Node 12.3 uyumu: rmSync/rm, ?. ?? yok
var kaynak = fs.readFileSync(path.join(__dirname, "..", "js", "transcript-cache.js"), "utf8");
chk("yalnız Node 12 API'leri (rmSync/rm/promises yok)", !/rmSync|\.rm\(|fs\.promises|\?\.[a-zA-Z_(\[]|\?\?|replaceAll|=>/.test(kaynak));


// Panel bağlantısı (captions.js): önbellek meşgul/motor denetiminden önce, cache:false atlar,
// ıskadan sonra "dolgu", altyazıda yalnız tek klip + kelime zamanlı "altyazi" yazılır
var cap = fs.readFileSync(path.join(__dirname, "..", "js", "captions.js"), "utf8");
var tw = cap.slice(cap.indexOf("async function transcribeWords"), cap.indexOf("function applyGlossary"));
chk("transcribeWords: önbellek busy denetiminden önce", tw.indexOf("transcriptCache().get(") !== -1 && tw.indexOf("transcriptCache().get(") < tw.indexOf("if (busy) throw"));
chk("transcribeWords: opts.cache === false önbelleği atlar", /opts\.cache !== false/.test(tw));
chk("transcribeWords: anahtar sonucu GERÇEKTEN yazan rotayla (yerel düşüp bulut yazdıysa bulut)", /transcribeSuflo\(audio, clip\.dur, true, temp, rota\)/.test(tw) &&
  /motorOnce\.engine = rota\.motor/.test(tw) && /secenek\.motor = yerelKimlik\(\)/.test(cap) && /secenek\.motor = bulutKimlik\(\)/.test(cap));
chk("altyazı yazımı da gerçek rotayla anahtarlanır", /onbMeta\.engine = rotaSecenek\.motor/.test(cap));
chk("transcribeWords: ıskada 'dolgu' olarak yazar, 'dolgu' önce aranır", /onbellekMeta\(clip, istenenDil, "dolgu"\)/.test(tw) && /prompts: \["dolgu", "altyazi"\]/.test(tw));
chk("go(): yalnız tek klip + karaoke iken 'altyazi' yazar", /scope === "clip" && karaoke && clip\) \? onbellekMeta\(clip, .*"altyazi"\)/.test(cap));
chk("rawSegments transkript kaynağı olarak kullanılmaz", !/rawSegments/.test(fs.readFileSync(path.join(__dirname, "..", "js", "konusma-kes.js"), "utf8")));
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
chk("index.html: retakes.js ve transcript-cache.js textcut.js'ten sonra", html.indexOf("js/textcut.js") < html.indexOf("js/retakes.js") && html.indexOf("js/retakes.js") < html.indexOf("js/transcript-cache.js"));
try { fs.readdirSync(dir).forEach(function (f) { fs.unlinkSync(path.join(dir, f)); }); } catch (e) {}
console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
