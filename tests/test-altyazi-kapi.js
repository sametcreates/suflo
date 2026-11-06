// Suflo testi: altyazı yenilemesinin (parti 1-9) ücretsiz / Pro sınırı denetimi ve paket bütünlüğü.
//  1) js/ altındaki Pro.gate / isPro / denemeAcik çağrı yerleri ve argümanları, yenilemeden önceki (git 5d153e7) kümeyle
//     AYNI (tests/fixtures/pro-kapi-5d153e7.json; yorum satırları hariç). Bilinçli ekleme listesi boş: yeni stiller ve
//     animasyonlar var olan kapılardan geçer (Premiere stilli katman: Pro.gate("overlay", { deneme: true }), AE stilli:
//     denemesiz P.gate("overlay"), Premiere şablonu: Pro.gate("mogrt")).
//  2) Ücretsiz yollar Pro'ya hiç sormaz (sahte DOM, captions.js'in GERÇEK işlevleri): düz caption izi (#cap-apply),
//     SRT / VTT / TXT dışa aktarma, Otomatik emoji / vurgu, dolguları çıkar; önizleme ve saf modüllerde Pro yok.
//     Stilli ASS dışa aktarma 5d153e7'de de Pro'ydu (Pro.gate("assexport")): o sınır da aynı kalır.
//  3) Yenilemenin yeni modülleri index.html'de tüketicilerinden ÖNCE yüklenir ve paket denetiminde zorunludur.
//  "git diff 5d153e7..HEAD -- server docs marketing" boşluğu test değil, yayın raporunda kabuk adımıdır.
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 600) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8").replace(/\r\n/g, "\n"); }
var cap = oku("js/captions.js");
function govde(imza) {
  var i = cap.indexOf(imza);
  if (i < 0) throw new Error("yok: " + imza);
  return cap.slice(i, cap.indexOf("\n  }\n", i) + 4);
}

/* ---------------- 1) Pro kapısı çağrı kümesi ---------------- */
var TABAN = JSON.parse(oku("tests/fixtures/pro-kapi-5d153e7.json")).satirlar;
// Bilinçli olarak eklenen kapı satırları ("js/dosya.js: kırpılmış satır" → adet). Yenilemede YOK.
var BILINCLI_EK = {};
var simdi = {};
fs.readdirSync(path.join(KOK, "js")).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) {
  oku("js/" + f).split("\n").forEach(function (l) {
    if (!/(Pro|P)\.(gate|isPro|denemeAcik)\(/.test(l)) return;
    var kod = l.trim();
    if (/^(\*|\/\/|\/\*)/.test(kod)) return;
    var k = "js/" + f + ": " + kod;
    simdi[k] = (simdi[k] || 0) + 1;
  });
});
var beklenen = JSON.parse(J(TABAN));
Object.keys(BILINCLI_EK).forEach(function (k) { beklenen[k] = (beklenen[k] || 0) + BILINCLI_EK[k]; });
var fazla = Object.keys(simdi).filter(function (k) { return simdi[k] !== beklenen[k]; });
var eksik = Object.keys(beklenen).filter(function (k) { return !simdi[k]; });
ok("Pro.gate / isPro / denemeAcik çağrı yerleri ve argümanları 5d153e7 ile aynı (+ yalnız bilinçli eklemeler: yok)",
  fazla.length === 0 && eksik.length === 0 && Object.keys(TABAN).length > 50, "fazla: " + fazla.join(" || ") + " eksik: " + eksik.join(" || "));
ok("Premiere stilli katman: Pro.gate(\"overlay\", { deneme: true, … }) (3 deneme + filigran)",
  /Pro\.gate\("overlay", \{ deneme: true, yeniden: function \(\) \{ overlayUygula\(\)/.test(govde("async function overlayUygula(")));
var aePanel = oku("js/ae-panel.js");
ok("After Effects stilli: denemesiz P.gate(\"overlay\", { yeniden }) ; düz AE çıktısı kapısız", /if \(stilli && P && !P\.gate\("overlay", \{ yeniden: /.test(aePanel) &&
  !/P\.gate\("overlay", \{[^}]*deneme/.test(aePanel));
var kod = ["stil-galeri.js", "altyazi-akis.js", "yazi-animasyonlari.js", "stil-kodu.js", "tr-kirilim.js", "kufur-maske.js", "altyazi-efekt.js", "style-engine.js",
  "caption-layout.js", "caption-text.js", "caption-quality.js", "caption-mogrt-json.js", "auto-emoji.js", "ae-plan.js"];
var proYazan = kod.filter(function (f) {
  return oku("js/" + f).split("\n").some(function (l) { var t = l.trim(); return !/^(\*|\/\/|\/\*)/.test(t) && /\bPro\.|\bwindow\.Pro\b/.test(t); });
});
ok("saf altyazı modülleri (galeri, akış, animasyon kataloğu, stil kodu, kırılım, küfür maskesi, motor, düzen, metin, emoji, AE planı) Pro'ya hiç sormaz",
  proYazan.length === 0, proYazan.join(", "));
// overlay-render.js yalnız deneme çıktısını kaydeder (Pro.denemeCiktisiEkle: filigranlı deneme dosyası; 5d153e7'de de aynı), kapı açmaz
var orPro = oku("js/overlay-render.js").split("\n").filter(function (l) { return /\bPro\./.test(l) && !/^\s*(\*|\/\/)/.test(l); }).map(function (l) { return l.trim(); });
ok("overlay-render.js Pro'dan yalnız deneme çıktısı kaydını kullanır (kapı yok)", orPro.length === 2 && orPro.every(function (l) { return /denemeCiktisiEkle/.test(l); }), J(orPro));
var onizleme = ["function efektOnizlemeTazele(", "async function motorOnizlemeOynat(", "function motorCizimiBaslat(", "function onizlemeOynat(", "function onizlemeOynatDom(",
  "function buildSrt(", "function buildVtt(", "function otomatikEmoji(", "function otomatikVurgu(", "function dolgulariCikar(", "function kufurMaskele(", "function gorunumUygula(",
  "function efektAnimSeciminiDoldur(", "function stilKoduUygula(", "function stilKodu(", "function sablonumUygula("];
var onizlemeKapili = onizleme.filter(function (imza) {
  var i = cap.indexOf(imza);
  if (i < 0) i = cap.indexOf(imza.replace(/^async /, ""));
  if (i < 0) return true;
  return /\bPro\./.test(cap.slice(i, cap.indexOf("\n  }\n", i)));
});
ok("önizleme, stil seçimi / kodu, SRT / VTT kurucuları, otomatik emoji / vurgu, metin temizliği gövdelerinde Pro yok", onizlemeKapili.length === 0, onizlemeKapili.join(", "));

/* ---------------- 2) ücretsiz yollar sahte DOM'da Pro'ya sormaz ---------------- */
function proKaydi() {
  var kayit = [];
  return { kayit: kayit, gate: function (f) { kayit.push("gate:" + f); return false; }, isPro: function () { kayit.push("isPro"); return false; },
    denemeAcik: function (f) { kayit.push("denemeAcik:" + f); return false; } };
}
function dugum(ek) { var d = { value: "", hidden: false, textContent: "", classList: { add: function () {}, remove: function () {} } }; for (var k in ek || {}) d[k] = ek[k]; return d; }

// 2a) Dışa aktar: SRT / VTT / TXT ücretsiz; ASS (stilli) 5d153e7'deki gibi Pro.gate("assexport")
function disaAktar(fmt) {
  var Pro = proKaydi(), yazilan = [], toastlar = [];
  var dom = { "cap-export-fmt": dugum({ value: fmt }) };
  var f = new Function("Pro", "el", "KApp", "K", "CL", "CT",
    "var segments = [{ start: 0, end: 1, text: 'Merhaba *dünya*' }, { start: 1, end: 2, text: 'ikinci satır' }], segmentsMode = 'l42';\n" +
    "function dosyaDilEki() { return ''; } function styleText(t) { return t; } function kufurMaskele(t) { return t; } function ciftDilAcik() { return false; }\n" +
    "function buildSrt() { return '1\\n00:00:00,000 --> 00:00:01,000\\nMerhaba\\n'; } function buildVtt() { return 'WEBVTT\\n'; }\n" +
    "function saveToDesktop(ad, icerik) { yaz(ad); return '/ev/' + ad; } function stil() { return { aile: 'efekt' }; } function motorStiliMi() { return true; }\n" +
    "var yaz = arguments[6];\n" + govde("function saveAs(") + "\nreturn saveAs;")(
    Pro, function (id) { return dom[id] || null; }, { toast: function (m) { toastlar.push(m); } }, { log: function () {} },
    { duzMetin: function (t) { return t; } }, { stripEmphasis: function (t) { return String(t).replace(/\*/g, ""); } }, function (ad) { yazilan.push(ad); });
  f();
  return { pro: Pro.kayit, yazilan: yazilan, toastlar: toastlar };
}
["srt", "vtt", "txt"].forEach(function (fmt) {
  var r = disaAktar(fmt);
  ok("dışa aktar " + fmt.toUpperCase() + ": Pro'ya sorulmaz, dosya yazılır", r.pro.length === 0 && r.yazilan.length === 1 && new RegExp("\\." + fmt + "$").test(r.yazilan[0]), J(r));
});
var ra = disaAktar("ass");
ok("dışa aktar ASS (stilli): 5d153e7'deki sınır aynı — yalnız Pro.gate(\"assexport\"), Pro değilse dosya yazılmaz", J(ra.pro) === J(["gate:assexport"]) && ra.yazilan.length === 0, J(ra));

// 2b) Düz caption izi (#cap-apply → apply(false)): Pro yok, SRT yazılıp içe aktarılır
(async function () {
  var Pro = proKaydi(), cagri = [], toastlar = [];
  var K = { srtDir: function () { return "/srt"; }, path: path, clearDraft: function () {}, log: function () {},
    fs: { existsSync: function () { return true; }, accessSync: function () {}, constants: { W_OK: 2 }, writeFileSync: function (p) { cagri.push("yaz:" + path.basename(p).replace(/\d+/, "N")); } },
    call: function (ad) { cagri.push(ad); return Promise.resolve(ad === "KS_projectDir" ? { ok: true, dir: "/proje" } : { ok: true, captionTrack: true }); } };
  var apply = new Function("Pro", "K", "KApp", "el",
    "var segments = [{ start: 0, end: 1, text: 'Merhaba' }], ornekBelge = null, ornekSekansId = '', belgeKesimAdi = null, belgeSekansId = '', shortsYuklenen = false;\n" +
    "var uygulananSekans = {}, onayBekleyen = null, kaliteOnayBekleyen = '', secilenMogrt = null, secilenMotorStili = 'efekt';\n" +
    "function qualityReport() { return { bad: 0 }; } function buildSrt() { return '1\\n00:00:00,000 --> 00:00:01,000\\nMerhaba\\n'; } function ciftDilAcik() { return false; }\n" +
    "function uygulaEtiketiniSifirla() {} function cancelDraft() {} function hideRestore() {} function yildizIste() {}\n" +
    "function overlayUygula() { throw new Error('stilli yol çağrıldı'); } function mogrtStiliniUygula() { throw new Error('şablon yolu çağrıldı'); } function status() {}\n" +
    govde("async function apply(") + "\nreturn apply;")(Pro, K, { ctx: function () { return { sequenceId: "s1" }; }, toast: function (m) { toastlar.push(m); } }, function () { return dugum(); });
  var sonuc = await apply(false);
  ok("düz caption izi (#cap-apply): Pro'ya sorulmaz; SRT yazılır, Premiere'e caption izi olarak aktarılır", Pro.kayit.length === 0 && sonuc.ok === true &&
    sonuc.captionTrack === true && cagri.indexOf("KS_importSrtAsCaptions") !== -1, J([Pro.kayit, sonuc, cagri]));

  // 2c) Otomatik emoji / vurgu, dolguları çıkar
  var AutoEmoji = require(path.join(KOK, "js", "auto-emoji.js"));
  var CT = require(path.join(KOK, "js", "caption-text.js"));
  function editorIslevi(imza, segs, mod) {
    var P = proKaydi(), t = [];
    var f = new Function("Pro", "K", "KApp", "el", "window", "CT",
      "var segments = " + J(segs) + ", segmentsMode = " + J(mod || "l42") + ", ceviriDili = '', algilananDil = 'tr';\n" +
      "var OTO_EMOJI_YOGUNLUK = ['seyrek', 'dengeli', 'yogun'];\n" +
      "function ceviriVar() { return false; } function cevrimdisiEn() { return false; } function arayuzDili() { return 'tr'; } function styleLocale() { return 'tr'; }\n" +
      "function snapshot() {} function render() {} function saveDraftNow() {} function kelimeleriYenidenHizala() {}\n" +
      govde("function otomatikEmojiSecenekleri(") + "\n" + govde(imza) + "\nreturn function () { " + /function (\w+)\(/.exec(imza)[1] + "(); return segments; };")(
      P, { settings: function () { return {}; }, saveSettings: function () {} }, { toast: function (m) { t.push(m); } }, function () { return null; },
      { SufloAutoEmoji: AutoEmoji }, CT);
    var segsSonra = f();
    return { pro: P.kayit, toast: t, segs: segsSonra };
  }
  var cumleler = [{ start: 0, end: 2, text: "Bugün harika bir gün, çok mutluyum" }, { start: 2, end: 4, text: "Tam 3 ayda 100 bin TL kazandık" },
    { start: 4, end: 6, text: "ııı yani eee şey bunu gerçekten çok sevdim" }];
  var oe = editorIslevi("function otomatikEmoji(", cumleler);
  ok("Otomatik emoji: Pro'ya sorulmaz, emoji eklenir", oe.pro.length === 0 && J(oe.segs) !== J(cumleler), J(oe));
  var ov = editorIslevi("function otomatikVurgu(", cumleler);
  ok("Otomatik vurgu: Pro'ya sorulmaz, *anahtar kelime* işaretlenir", ov.pro.length === 0 && ov.segs.some(function (s) { return /\*/.test(s.text); }), J(ov));
  var dc = editorIslevi("function dolgulariCikar(", cumleler);
  ok("Dolguları çıkar (metin temizliği): Pro'ya sorulmaz, ııı / eee çıkar", dc.pro.length === 0 && !/ııı|eee/.test(dc.segs[2].text), J(dc));

  /* ---------------- 3) yeni modüller: yükleme sırası ve paket ---------------- */
  var html = oku("index.html");
  var sira = [];
  html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) { sira.push(src); return m; });
  // Bir modülün global adı → dosyası ("root.SufloX = api" ya da "window.SufloX = ")
  var saglayan = {};
  sira.forEach(function (src) {
    var p = path.join(KOK, src);
    if (!fs.existsSync(p)) return;
    var m, rx = /(?:root|window)\.(Suflo\w+|K[A-Z]\w+) = /g, t = oku(src);
    while ((m = rx.exec(t))) if (!saglayan[m[1]]) saglayan[m[1]] = src;
  });
  var sorun = [];
  sira.forEach(function (src, i) {
    var p = path.join(KOK, src);
    if (!fs.existsSync(p)) { sorun.push(src + " yok"); return; }
    var t = oku(src), m;
    // yükleme anında okunan bağımlılık: "var X = (root && root.SufloY)" (UMD başı) ya da IIFE'nin üst düzeyinde "var X = window.SufloY"
    var rx = /^\s*var \w+ = \(?root && root\.(Suflo\w+)|^  var \w+ = window\.(Suflo\w+)/gm;
    while ((m = rx.exec(t))) {
      var ad = m[1] || m[2], s = saglayan[ad];
      if (s && sira.indexOf(s) > i) sorun.push(src + " → " + ad + " (" + s + " sonra yükleniyor)");
    }
  });
  ok("index.html: her modül yükleme anında okuduğu modülden SONRA gelir (" + sira.length + " betik)", sorun.length === 0 && sira.length > 50, sorun.join(" | "));
  var YENI = ["js/tr-kirilim.js", "js/yazi-animasyonlari.js", "js/stil-kodu.js", "js/stil-galeri.js", "js/altyazi-akis.js", "js/kufur-maske.js"];
  var vr = oku("tools/verify-release.ps1");
  var gerekli = (/\$required = @\(([\s\S]*?)\n\s*\)/.exec(vr) || ["", ""])[1];
  var paketEksik = YENI.filter(function (f) {
    return !fs.existsSync(path.join(KOK, f)) || sira.indexOf(f) === -1 || gerekli.indexOf("'(^|/)" + f.replace(/\./g, "\\.").replace(/-/g, "-") + "$'") === -1;
  });
  ok("yenilemenin yeni modülleri var, index.html'de yüklü ve verify-release'te zorunlu (eksikse sessizce eski davranışa düşerdi)", paketEksik.length === 0, paketEksik.join(", "));
  ok("paket betikleri js/ klasörünü bütün taşır (yeni modül ayrıca listelenmez)", /\$stageItems = @\([^)]*"js"/.test(oku("tools/package.ps1")) &&
    /\$panelItems = @\([^)]*"js"/.test(oku("tools/kurucu-yap.ps1")) && /"js"/.test(oku("tools/install.ps1")));
  ok("jsx/host-ae.jsx (After Effects ana bilgisayarı) jsx/ ile pakette", /\$stageItems = @\([^)]*"jsx"/.test(oku("tools/package.ps1")) && fs.existsSync(path.join(KOK, "jsx", "host-ae.jsx")));

  console.log("\n" + gecen + "/" + toplam + " geçti");
  if (gecen !== toplam) process.exit(1);
})().catch(function (e) { console.log("FAIL beklenmeyen hata: " + (e && e.stack || e)); process.exit(1); });
