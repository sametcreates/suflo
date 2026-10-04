// Suflo testi: Tek Tık Shorts Paketi uçtan uca — js/shorts-paket.js GERÇEK akışı (sahte K ve
// sahte Premiere, gerçek ffmpeg/libass): çağrı sırası, şeffaf qtrle katmanlar, sekans boyu,
// paylaşım paketi dosyaları, LLM yeniden denemesi, geçici klasör temizliği
var fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm"), cp = require("child_process");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }
var ff = null;
try { cp.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); ff = "ffmpeg"; } catch (e) {}
if (!ff) { console.log("ATLA: ffmpeg yok"); console.log("0/0 gecti"); process.exit(0); }

var KOK = path.join(__dirname, "..");
function mod(ad) { return require(path.join(KOK, "js", ad)); }
var HL = mod("highlights.js");

var kok = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-paket-uc-"));
var tmp = path.join(kok, "tmp"), srt = path.join(kok, "cikti"), proje = path.join(kok, "Proje klasörü #1");
fs.mkdirSync(tmp); fs.mkdirSync(srt); fs.mkdirSync(proje);

/* ---------------- sahte DOM ---------------- */
var DOM = {}, dinleyici = {};
function Elem(tag, id) {
  this.tagName = tag; this.id = id || ""; this.childNodes = []; this.hidden = false; this.disabled = false;
  this.value = ""; this.checked = false; this.textContent = ""; this.className = ""; this.title = ""; this.open = true; this.src = "";
}
Elem.prototype.appendChild = function (c) { this.childNodes.push(c); return c; };
Elem.prototype.addEventListener = function (ad, fn) { dinleyici[this.id + ":" + ad] = fn; };
Object.defineProperty(Elem.prototype, "innerHTML", { set: function () { this.childNodes = []; }, get: function () { return ""; } });
function elem(id, ozellik) { var e = new Elem("div", id); for (var k in ozellik || {}) e[k] = ozellik[k]; DOM[id] = e; return e; }
["cap-paket", "cap-paket-olustur", "cap-paket-iptal", "cap-paket-devam", "cap-paket-klasor", "cap-paket-durum", "cap-paket-liste",
  "cap-paket-mogrt-not", "cap-paket-logo-not", "kanca-durum", "kanca-ekle", "kanca-resim", "tab-kanca"].forEach(function (id) { elem(id); });
elem("cap-paket-stil", { value: "" });
[["cap-paket-altyazi", true], ["cap-paket-kanca", true], ["cap-paket-ilerleme", true], ["cap-paket-cta", true], ["cap-paket-logo", false],
  ["cap-paket-metin", true], ["cap-paket-kredi", true]].forEach(function (x) { elem(x[0], { checked: x[1] }); });
elem("cap-paket-ilerleme-konum", { value: "ust" }); elem("cap-paket-ilerleme-stil", { value: "kapsul" }); elem("cap-paket-ilerleme-renk", { value: "#ff0000" });
elem("cap-paket-cta-metin", { value: "takip" }); elem("cap-paket-cta-ozel", { value: "" });
elem("kanca-metin", { value: "" }); elem("kanca-stil", { value: "sade" }); elem("kanca-sure", { value: "2" }); elem("kanca-konum", { value: "ust" }); elem("kanca-renk", { value: "#ffe600" });

/* ---------------- sahte Premiere ---------------- */
var W = 270, H = 480, FPS = 10;
var aktif = "ana", cagrilar = [], sekanslar = { ana: { w: 1920, h: 1080, end: 120 } }, konan = [], makeNo = 0;
var ayarlar = {};
var kaynak = [
  { start: 4, end: 7, text: "Bugün *para* biriktirmenin 🔥 sırrını anlatıyorum." },
  { start: 7, end: 11, text: "İlk kural: harcamadan önce bekle." },
  { start: 11, end: 14.5, text: "Bu kadar basit, gerçekten!" },
  { start: 30, end: 34, text: "İkinci an burada başlıyor." },
  { start: 34, end: 41.5, text: "Ve burada bitiyor, takip et." }
];
function cagri(fn, arg) {
  cagrilar.push({ fn: fn, arg: arg ? JSON.parse(JSON.stringify(arg)) : arg, aktif: aktif });
  if (fn === "KS_apiProbe") return { ok: true, autoReframe: true, subsequence: true };
  if (fn === "KS_makeShorts") {
    if (arg.sourceId !== "ana") return { ok: false, error: "kaynak yok" };
    makeNo++;
    var r = arg.ranges[0], uzun = r.end - r.start;
    sekanslar["alt" + makeNo] = { w: 1920, h: 1080, end: uzun, ad: r.name };
    sekanslar["dik" + makeNo] = { w: W, h: H, end: uzun, ad: r.name + " 9x16" };
    return { ok: true, made: 1, vertical: 1, items: [{ name: r.name, id: "alt" + makeNo, dikeyId: "dik" + makeNo, dikey: true }], errors: [] };
  }
  if (fn === "KS_openSequenceById") {
    if (!sekanslar[arg.id]) return { ok: false, error: "Sekans projede bulunamadi (silinmis olabilir)." };
    aktif = arg.id;
    var s = sekanslar[arg.id];
    return { ok: true, id: arg.id, name: arg.id, width: s.w, height: s.h, end: s.end, fps: FPS, paket: [] };
  }
  if (fn === "KS_findSequenceByName") {
    var ids = Object.keys(sekanslar).filter(function (id) { return sekanslar[id].ad === arg.name && (arg.haric || []).indexOf(id) === -1; });
    return { ok: true, id: ids.length ? ids[ids.length - 1] : "", name: arg.name, count: ids.length, ids: ids };
  }
  if (fn === "KS_sequenceSufloLayers") return { ok: true, altyazi: 0, kanca: 0, paket: 0, toplam: 0 };
  if (fn === "KS_overlaySpec") { var a = sekanslar[aktif]; return { ok: true, width: a.w, height: a.h, fps: FPS, end: a.end }; }
  if (fn === "KS_placeOverlay") {
    if (arg.expectSeqId && arg.expectSeqId !== aktif) return { ok: false, error: "Etkin sekans degisti; katman konmadi." };
    konan.push({ seq: aktif, name: arg.name, path: arg.path, at: arg.at });
    return { ok: true, trackName: "V" + (konan.length + 1), start: arg.at };
  }
  if (fn === "KS_projectDir") return { ok: true, dir: proje };
  return { ok: false, error: "bilinmeyen " + fn };
}
var llmCagri = 0, llmAcik = 0, llmCakisti = false;
var PAKET = JSON.stringify({
  youtube: { titles: ["Para biriktirmenin sırrı"], description: "Kısa ve net.", hashtags: ["#para", "#tasarruf", "#finans", "#fazla"] },
  tiktok: { titles: ["Bunu kimse söylemiyor"], description: "Kaydet!", hashtags: ["#para", "#a", "#b", "#c", "#d", "#e"] },
  reels: { titles: ["Reels kancası"], description: "Reels metni.", hashtags: ["#reels"] }
});
var K = {
  nodeOK: true, MAC: false, fs: fs, path: path, log: function () {},
  settings: function () { return ayarlar; }, saveSettings: function () { ayarlar = JSON.parse(JSON.stringify(ayarlar)); },
  tmpDir: function () { return tmp; }, srtDir: function () { return srt; },
  extensionPath: function () { return KOK; },
  findFfmpeg: function () { return Promise.resolve(ff); }, libassUyarisi: function () { return ""; },
  hataYardimi: function (e) { return e && e.message ? e.message : String(e); },
  run: function (exe, args, o) {
    return new Promise(function (res) {
      cp.execFile(exe, args, { cwd: o && o.cwd, maxBuffer: 1 << 26 }, function (err, so, se) { res({ code: err ? (err.code || 1) : 0, stdout: so, stderr: se }); });
    });
  },
  call: function (fn, arg) { return new Promise(function (r) { setTimeout(function () { r(cagri(fn, arg)); }, 1); }); },
  httpJson: function (url, basliklar, govde) {
    llmCagri++;
    if (llmAcik) llmCakisti = true;
    llmAcik++;
    var n = llmCagri;
    return new Promise(function (r) {
      setTimeout(function () {
        llmAcik--;
        if (n === 1) r({ status: 429, body: "{\"error\":{\"message\":\"Rate limit reached. Please try again in 20ms.\"}}" });
        else if (n === 3) r({ status: 401, body: "invalid key" });
        else r({ status: 200, body: JSON.stringify({ choices: [{ message: { content: PAKET } }] }) });
      }, 3);
    });
  }
};
// "Ayarlar" kaydı: K.settings() aynı nesneyi döner; saveSettings derin kopyalar (gerçek kayıt gibi)
K.saveSettings = function () {};

var toastlar = [];
var ctx = {
  confirm: function () { return false; }, document: { getElementById: function (id) { return DOM[id] || null; }, createElement: function (t) { return new Elem(t); }, createTextNode: function (t) { return { textContent: t }; } },
  K: K, Pro: { gate: function () { return true; }, filigranGerekli: function () { return false; }, isPro: function () { return true; } },
  KApp: { toast: function (m, c, s, e) { toastlar.push({ m: m, c: c, e: e }); }, ctx: function () { return { sequence: "Ana sekans" }; }, davetAni: function () {} },
  decodeURI: decodeURI, Date: Date, Math: Math, String: String, Number: Number, Object: Object, Promise: Promise, Error: Error, isFinite: isFinite,
  JSON: JSON, setTimeout: setTimeout, Array: Array, RegExp: RegExp, console: console
};
ctx.window = ctx;   // panelde window === global: KCaptions, KViral, KKanca çıplak adla da okunur
var w = ctx;
w.SufloStyleShare = mod("style-share.js"); w.SufloMarkaKiti = mod("marka-kiti.js"); w.SufloStyleEngine = mod("style-engine.js");
w.SufloCaptionText = mod("caption-text.js"); w.SufloYouTubeMeta = mod("youtube-meta.js"); w.SufloHookTitle = mod("hook-title.js");
w.SufloOverlayRender = mod("overlay-render.js"); w.SufloShortsEkler = mod("shorts-ekler.js"); w.SufloShortsPlan = mod("shorts-paket-plan.js");
w.SufloReferral = mod("referral-core.js");
w.KCaptions = {
  language: function () { return "tr"; }, chatConfig: function () { return { url: "https://api.groq.com/openai/v1/chat/completions", model: "m", key: "k" }; },
  stilAyarlari: function () { return { aile: "hormozi" }; }, mogrtSecili: function () { return false; }
};
w.KViral = {
  paketAnlari: function () {
    return [
      { id: 1, start: 4, end: 14.5, title: "*Para* biriktirme", reason: "Somut tavsiye", score: 82, hooks: ["Bunu *bil*", "Diğer"], kancaNo: 0, paketSec: true },
      { id: 2, start: 30, end: 41.5, title: "İkinci an", reason: "Merak", score: 66, hooks: ["İkinci kanca"], kancaNo: 0, paketSec: true }
    ];
  },
  sekansDenetle: function () { return Promise.resolve({ sekans: aktif === "ana" ? "ana" : aktif, uyari: aktif === "ana" ? "" : "başka sekans" }); },
  kaynakSegs: function () { return JSON.parse(JSON.stringify(kaynak)); },
  shortsKaydet: function (items, an, segs) {
    var kayit = { ad: an.title, start: an.start, end: an.end, mod: "plain", segs: HL.sliceSegments(segs, an.start, an.end), ts: Date.now() };
    ayarlar.shortsAltyazi = ayarlar.shortsAltyazi || {};
    items.forEach(function (it) { if (it.id) ayarlar.shortsAltyazi[it.id] = kayit; if (it.dikeyId) ayarlar.shortsAltyazi[it.dikeyId] = kayit; });
  },
  sekansiBagla: function () {}, tur: function () { return "egitim"; }, mesgul: function () { return false; }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(KOK, "js", "kanca.js"), "utf8"), ctx);
vm.runInContext(fs.readFileSync(path.join(KOK, "js", "shorts-paket.js"), "utf8"), ctx);

function ffprobe(p) {
  var j = JSON.parse(cp.execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height,pix_fmt:format=duration", "-of", "json", p]).toString());
  return { st: j.streams[0], sure: Number(j.format.duration) };
}

w.KShortsPaket.init();
ok("init: stil listesi Suflo Stilleri, varsayılan Altyazı sekmesindeki stil", DOM["cap-paket-stil"].childNodes.length >= 7 && DOM["cap-paket-stil"].value === "hormozi",
  DOM["cap-paket-stil"].value);
ok("init: düğme seçili an sayısını gösterir", DOM["cap-paket-olustur"].textContent === "Paketi oluştur (2 Shorts)" && !DOM["cap-paket-olustur"].disabled);
ok("init: kayıtsız seçimde kredi satırı kapalı (isteğe bağlı), çubuk üstte", DOM["cap-paket-kredi"].checked === false && DOM["cap-paket-ilerleme-konum"].value === "ust");
DOM["cap-paket-stil"].value = "viral";
DOM["cap-paket-kredi"].checked = true;
DOM["cap-paket-ilerleme-renk"].value = "#ff0000";
DOM["cap-paket-ilerleme-stil"].value = "kalin";
var bas = Date.now();
dinleyici["cap-paket-olustur:click"]().then(function () {
  var sira = cagrilar.map(function (c) { return c.fn + (c.fn === "KS_placeOverlay" ? "(" + c.arg.name + ")" : "") + (c.fn === "KS_openSequenceById" ? "(" + c.arg.id + ")" : ""); });
  var beklenen = ["KS_apiProbe", "KS_findSequenceByName", "KS_findSequenceByName", "KS_makeShorts", "KS_findSequenceByName", "KS_findSequenceByName", "KS_makeShorts",
    "KS_openSequenceById(dik1)", "KS_sequenceSufloLayers", "KS_placeOverlay(Suflo Paket · Altyazı)", "KS_overlaySpec", "KS_placeOverlay(Suflo Paket · Kanca)", "KS_placeOverlay(Suflo Paket · Çerçeve)",
    "KS_openSequenceById(dik2)", "KS_sequenceSufloLayers", "KS_placeOverlay(Suflo Paket · Altyazı)", "KS_overlaySpec", "KS_placeOverlay(Suflo Paket · Kanca)", "KS_placeOverlay(Suflo Paket · Çerçeve)",
    "KS_openSequenceById(ana)", "KS_projectDir"];
  ok("çağrı sırası: önce iki sekans, sonra Short başına aç → altyazı → kanca → çerçeve, sonunda ana sekans", sira.join(" | ") === beklenen.join(" | "), sira.join(" | "));
  var ms = cagrilar.filter(function (c) { return c.fn === "KS_makeShorts"; });
  ok("KS_makeShorts: tek aralık, 9:16, kaynak sekans kimliği, Short adı", ms.every(function (c) { return c.arg.ranges.length === 1 && c.arg.dikey === true && c.arg.sourceId === "ana"; }) &&
    ms[0].arg.ranges[0].name === "Shorts 1 · Para biriktirme" && ms[0].arg.ranges[0].start === 4, JSON.stringify(ms[0].arg));
  ok("katmanlar beklenen sekansa, 0. saniyeye", konan.length === 6 && konan.every(function (k) { return k.at === 0 && /^dik[12]$/.test(k.seq); }) &&
    cagrilar.filter(function (c) { return c.fn === "KS_placeOverlay"; }).every(function (c) { return c.arg.expectSeqId === c.aktif; }), JSON.stringify(konan.map(function (k) { return k.seq + ":" + k.name; })));
  ok("ana sekans sonunda yeniden açık", aktif === "ana");

  konan.forEach(function (k) {
    var ad = k.name.replace("Suflo Paket · ", "") + " (" + k.seq + ")";
    var var_ = fs.existsSync(k.path);
    ok("çıktı var: " + ad, var_, k.path);
    if (!var_) return;
    var p = ffprobe(k.path);
    ok(ad + ": qtrle, alfa kanallı, Short boyutunda", p.st.codec_name === "qtrle" && /a/.test(p.st.pix_fmt) && p.st.width === W && p.st.height === H, JSON.stringify(p.st));
    if (/Çerçeve/.test(k.name)) {
      var uzun = k.seq === "dik1" ? 10.5 : 11.5;
      ok(ad + ": Short'un boyunda (kare ızgarasında, uzun değil)", p.sure <= uzun + 1e-6 && p.sure >= uzun - 0.11, p.sure);
      var son = cp.execFileSync(ff, ["-v", "error", "-sseof", "-0.5", "-i", k.path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 26 });
      var opak = 0, kirmizi = 0;
      for (var i = 0; i < son.length; i += 4) { if (son[i + 3] > 200) { opak++; if (son[i] > 200 && son[i + 1] < 60 && son[i + 2] < 60) kirmizi++; } }
      ok(ad + ": son saniyede CTA ve dolu kırmızı çubuk", opak > 1500 && kirmizi > 100, "opak " + opak + " kırmızı " + kirmizi);
    }
    if (/Altyazı/.test(k.name)) ok(ad + ": süre altyazılar boyunca, Short'tan uzun değil", p.sure <= (k.seq === "dik1" ? 10.5 : 11.5) + 1e-6, p.sure);
  });

  var j = ayarlar.shortsPaketIs;
  ok("iş ayarlara yazıldı, bitti, tüm adımlar tamam", j && j.durum === "bitti" && j.kisalar.every(function (k) {
    return ["sekans", "altyazi", "kanca", "cerceve", "metin"].every(function (a) { return k.adimlar[a] === "tamam"; });
  }), j && JSON.stringify(j.kisalar.map(function (k) { return k.adimlar; })));
  ok("LLM: 429'da gövdedeki süre kadar beklenip yeniden denendi, çağrılar üst üste binmedi", llmCagri === 3 && !llmCakisti);
  ok("LLM: AI metni kullanıldı (YouTube 3 hashtag), hatalı ikinci Short yedeğe düştü", j.kisalar[0].paylasim.youtube.ai === true && j.kisalar[0].paylasim.youtube.baslik === "Para biriktirmenin sırrı" &&
    /#para #tasarruf #finans(\n|$)/.test(j.kisalar[0].paylasim.youtube.aciklama) && j.kisalar[1].paylasim.youtube.ai === false && j.kisalar[1].notlar.metinAi === "ai-hata",
    JSON.stringify(j.kisalar[0].paylasim.youtube));
  ok("kredi satırı açıkken açıklamaların sonunda", /Altyazılar: Suflo · suflo\.app$/.test(j.kisalar[0].paylasim.tiktok.aciklama));

  var dosyalar = fs.readdirSync(proje);
  var txt = dosyalar.filter(function (f) { return /^Suflo-Shorts-paylasim-paketi-\d{8}-\d{6}\.txt$/.test(f); })[0];
  var csv = dosyalar.filter(function (f) { return /^Suflo-Shorts-paylasim-paketi-\d{8}-\d{6}\.csv$/.test(f); })[0];
  ok("TXT ve CSV proje klasörüne yazıldı", !!txt && !!csv, dosyalar.join(","));
  if (txt) {
    var t = fs.readFileSync(path.join(proje, txt), "utf8");
    ok("TXT: BOM, CRLF, iki Short ve platformlar", t.charCodeAt(0) === 0xFEFF && /\r\n/.test(t) && /=== 1\. Shorts 1 · Para biriktirme/.test(t) && /=== 2\. Shorts 2 · İkinci an/.test(t) &&
      /\[TikTok\]/.test(t), t.slice(0, 200));
  }
  if (csv) ok("CSV: başlık + iki satır", fs.readFileSync(path.join(proje, csv), "utf8").split("\r\n").filter(Boolean).length === 3);
  var son = toastlar[toastlar.length - 1];
  ok("bildirim: özet ve 'Klasörü aç' eylemi", son && /Shorts Paketi hazır: 2\/2 Short tamam/.test(son.m) && son.e && son.e.metin === "Klasörü aç", son && son.m);
  ok("paneldeki 'Klasörü aç' görünür, İptal gizli, düğme yeniden etkin", DOM["cap-paket-klasor"].hidden === false && DOM["cap-paket-iptal"].hidden === true && !DOM["cap-paket-olustur"].disabled);
  ok("ilerleme listesi: Short başına 5 çip, hepsi tamam", DOM["cap-paket-liste"].childNodes.length === 2 &&
    DOM["cap-paket-liste"].childNodes[0].childNodes[1].childNodes.length === 5 &&
    DOM["cap-paket-liste"].childNodes[0].childNodes[1].childNodes.every(function (c) { return /tamam/.test(c.className); }));
  var kalan = fs.readdirSync(tmp);
  ok("geçici klasörler temizlendi", kalan.length === 0, kalan.join(","));
  ok("emoji Short altyazısından atıldı (render patlamadı)", JSON.stringify(ayarlar.shortsAltyazi.dik1.segs).indexOf("🔥") !== -1 && konan[0].name === "Suflo Paket · Altyazı");

  // Devam et: kayıtlı işte hata yoksa hiçbir şey tekrarlanmaz; hatalı adım yeniden denenir
  var oncekiCagri = cagrilar.length;
  ayarlar.shortsPaketIs.kisalar[1].adimlar.cerceve = "hata";
  ayarlar.shortsPaketIs.kisalar[1].hatalar.cerceve = "Etkin sekans degisti; katman konmadi.";
  ayarlar.shortsPaketIs.durum = "iptal";
  w.KShortsPaket.guncelle();
  ok("Devam et yarım işte görünür", DOM["cap-paket-devam"].hidden === false);
  return dinleyici["cap-paket-devam:click"]().then(function () {
    var yeni = cagrilar.slice(oncekiCagri).map(function (c) { return c.fn + (c.fn === "KS_placeOverlay" ? "(" + c.arg.name + ")" : "") + (c.fn === "KS_openSequenceById" ? "(" + c.arg.id + ")" : ""); });
    ok("Devam et: yalnız hatalı adım (Short 2 çerçeve) yeniden, sonra ana sekans", yeni.join(" | ") ===
      "KS_openSequenceById(dik2) | KS_sequenceSufloLayers | KS_placeOverlay(Suflo Paket · Çerçeve) | KS_openSequenceById(ana) | KS_projectDir", yeni.join(" | "));
    ok("Devam et sonrası iş bitti", ayarlar.shortsPaketIs.durum === "bitti" && ayarlar.shortsPaketIs.kisalar[1].adimlar.cerceve === "tamam");
  });
}).then(function () {
  console.log("süre " + ((Date.now() - bas) / 1000).toFixed(1) + " sn");
  try { fs.rmSync(kok, { recursive: true, force: true }); } catch (e) {}
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}).catch(function (e) { console.log("FAIL istisna " + (e && e.stack || e)); process.exit(1); });
