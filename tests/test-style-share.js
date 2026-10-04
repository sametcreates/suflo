// Suflo testi: js/style-share.js (paylaşılabilir stil kodları, ince ayar doğrulaması) ve
// js/marka-kiti.js (Marka Kiti şeması, birleştirme, logo yerleşimi)
var fs = require("fs"), path = require("path");
var kok = path.join(__dirname, "..");
var SS = require(path.join(kok, "js", "style-share.js"));
var MK = require(path.join(kok, "js", "marka-kiti.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var STILLER = ["mrbeast", "capcut", "saas", "viral", "pop", "doc", "premium", "hormozi", "neon", "daktilo", "ziplama", "dolgu"];

/* ---------------- FONTS ---------------- */
ok("6 paket fontu", SS.fontNames().join(",") === "Anton,Archivo Black,Bebas Neue,Bungee,Lora,Montserrat", SS.fontNames().join(","));
ok("font dosyaları gerçekten var", SS.fontNames().every(function (n) { return fs.existsSync(path.join(kok, "fonts", SS.FONTS[n].file)); }));
ok("hasFont: proto / bilinmeyen değil", SS.hasFont("Lora") && !SS.hasFont("__proto__") && !SS.hasFont("toString") && !SS.hasFont("Arial"));

/* ---------------- round trip ---------------- */
var tarif = {
  styleId: "hormozi", intensity: "hard",
  overrides: { font: "Lora", renk: "#FFAA00", konturRenk: "#000000", vurguRenk: "#22ccff", boyut: 120, kontur: 6, konum: 8, guvenli: true },
  text: { maxlen: "k1", kase: "upper", punct: false },
  author: "Şükrü_Öğün.tr"
};
var kod = SS.encode(tarif);
ok("SFL1. öneki", kod.indexOf("SFL1.") === 0, kod.slice(0, 12));
ok("kod ≤ 600 karakter", kod.length <= 600, kod.length);
ok("kod yalnız URL güvenli karakter", /^SFL1\.[A-Za-z0-9_-]+$/.test(kod));
var c = SS.decode(kod, STILLER);
ok("çözülür", c.ok && c.recipe.styleId === "hormozi" && c.recipe.intensity === "hard", JSON.stringify(c));
ok("Türkçe yazar adı korunur", c.recipe.author === "Şükrü_Öğün.tr", c.recipe.author);
ok("ince ayar korunur (renk küçük harfe), fontFile yerelde türetilir", c.recipe.overrides.renk === "#ffaa00" && c.recipe.overrides.font === "Lora" &&
  c.recipe.overrides.fontFile === "Lora.ttf" && c.recipe.overrides.boyut === 120 && c.recipe.overrides.konum === 8 && c.recipe.overrides.guvenli === true,
  JSON.stringify(c.recipe.overrides));
ok("metin biçimi korunur", JSON.stringify(c.recipe.text) === JSON.stringify({ maxlen: "k1", kase: "upper", punct: false }), JSON.stringify(c.recipe.text));
ok("uyarı yok", c.warnings.length === 0, c.warnings.join(","));
ok("tam paylaşım bağlantısı da çözülür", SS.decode(SS.shareUrl(kod), STILLER).ok && SS.shareUrl(kod) === "https://suflo.app/stil#" + kod);
ok("bölünmüş (satır sonlu) kod çözülür", SS.decode("  " + kod.slice(0, 30) + "\n" + kod.slice(30) + " \n", STILLER).ok);
ok("izin listesi verilmezse yalnız biçim", SS.decode(kod).ok);
ok("izin listesi nesne / işlev", SS.decode(kod, { hormozi: 1 }).ok && SS.decode(kod, function (id) { return id === "hormozi"; }).ok);

/* ---------------- reddedilenler (asla fırlatmaz) ---------------- */
function red(ad, girdi, liste) {
  var r;
  try { r = SS.decode(girdi, liste || STILLER); } catch (e) { ok(ad + " (fırlattı!)", false, e.message); return; }
  ok(ad, r && r.ok === false && typeof r.error === "string" && r.error.length > 5 && r.recipe === null, JSON.stringify(r));
}
red("yanlış önek", "SFL2." + kod.slice(5));
red("önek yok", "merhaba");
red("2048'den uzun girdi", "SFL1." + new Array(2100).join("A"));
red("bozuk base64 (geçersiz karakter)", "SFL1.ab$cd");
red("bozuk base64 (uzunluk)", "SFL1.a");
red("JSON değil", "SFL1." + SS.b64urlEncode("{bu json degil"));
red("JSON dizi", "SFL1." + SS.b64urlEncode("[1,2]"));
red("JSON null", "SFL1." + SS.b64urlEncode("null"));
red("bilinmeyen stil → ok:false", SS.encode({ styleId: "uzayli" }));
red("stil kimliği yok", "SFL1." + SS.b64urlEncode(JSON.stringify({ v: 1 })));
red("daha yeni sürüm", "SFL1." + SS.b64urlEncode(JSON.stringify({ v: 2, styleId: "viral" })));
red("boş", "");
red("metin olmayan", null);
red("sayı", 42);
red("<script> yazar reddedilir", "SFL1." + SS.b64urlEncode(JSON.stringify({ v: 1, styleId: "viral", author: "<script>alert(1)</script>" })));
red("33 karakter yazar reddedilir", "SFL1." + SS.b64urlEncode(JSON.stringify({ v: 1, styleId: "viral", author: new Array(34).join("a") })));
red("yazar sayı reddedilir", "SFL1." + SS.b64urlEncode(JSON.stringify({ v: 1, styleId: "viral", author: 5 })));
red("geçersiz UTF-8", "SFL1." + "_w");

/* ---------------- enjeksiyon temizliği ---------------- */
function coz(obj) { return SS.decode("SFL1." + SS.b64urlEncode(JSON.stringify(obj)), STILLER); }
var kotu = coz({ v: 1, styleId: "viral", overrides: {
  font: "Arial,0,0}{\\pos(0,0)", renk: "#}{\\b1", konturRenk: "#12345", vurguRenk: "red", konum: 3, boyut: 9999, kontur: -4,
  fontFile: "../../x", guvenli: "evet", ekstra: "x"
}, text: { maxlen: "c999", kase: "}{", punct: "1" }, intensity: "çok", logo: "C:\\Users\\a\\logo.png" });
ok("kötü kod yine de çözülür (alanlar atılır)", kotu.ok, kotu.error);
var o = kotu.recipe.overrides;
ok("'}{\\pos' içeren font atılır", o.font === undefined && o.fontFile === undefined, JSON.stringify(o));
ok("'#}{\\b1' renk ve kötü renkler atılır", o.renk === undefined && o.konturRenk === undefined && o.vurguRenk === undefined);
ok("konum 3 atılır", o.konum === undefined);
ok("boyut 9999 → 180, kontur -4 → 0", o.boyut === 180 && o.kontur === 0, JSON.stringify(o));
ok("guvenli boolean değilse atılır", o.guvenli === undefined);
ok("fontFile '../../x' girdiden alınmaz", JSON.stringify(o).indexOf("..") === -1);
ok("metin biçimi kötü değerler atılır", JSON.stringify(kotu.recipe.text) === "{}", JSON.stringify(kotu.recipe.text));
ok("yoğunluk kötü değeri atılır", kotu.recipe.intensity === undefined);
ok("bilinmeyen üst alan (logo yolu) tarife girmez", kotu.recipe.logo === undefined && kotu.warnings.indexOf("logo") !== -1, kotu.warnings.join(","));
ok("uyarılar atılan alanları sayar", ["font", "renk", "konum", "boyut", "fontFile", "ekstra", "text.maxlen", "intensity"].every(function (w) { return kotu.warnings.indexOf(w) !== -1; }), kotu.warnings.join(","));
ok("konum 'guvenli' metni atılır", coz({ v: 1, styleId: "viral", overrides: { konum: "guvenli" } }).recipe.overrides.konum === undefined);
var proto = coz(JSON.parse('{"v":1,"styleId":"viral","__proto__":{"x":1},"overrides":{"__proto__":{"font":"Lora"},"constructor":{"a":1}}}'));
ok("__proto__ yok sayılır", proto.ok && proto.recipe.overrides.font === undefined && ({}).x === undefined && ({}).font === undefined &&
  Object.keys(proto.recipe.overrides).length === 0, JSON.stringify(proto.recipe));
var s1 = SS.sanitizeOverrides({ boyut: "72", kontur: "5", konum: "2", renk: "#ABCDEF" });
ok("sanitize: sayı metni kabul edilir", s1.boyut === 72 && s1.kontur === 5 && s1.konum === 2 && s1.renk === "#abcdef", JSON.stringify(s1));
ok("sanitize: nesne olmayan → {}", JSON.stringify(SS.sanitizeOverrides(null)) === "{}" && JSON.stringify(SS.sanitizeOverrides([1])) === "{}");

/* ---------------- yerel yollar asla kodlanmaz ---------------- */
var yerel = SS.encode({ styleId: "viral", overrides: { font: "Montserrat", fontFile: "C:\\Users\\ali\\fonts\\x.ttf", logo: "/Users/ali/logo.png" },
  logo: { path: "/Users/ali/logo.png" }, path: "/tmp/x", author: "../etc" });
var yerelJson = SS.b64urlDecode(yerel.slice(5));
ok("yerel yollar ve fontFile koda girmez", !/Users|tmp|\\\\|fontFile|logo|\.ttf/.test(yerelJson), yerelJson);
ok("geçersiz yazar koda yazılmaz", !/author/.test(yerelJson));
var thrown = false;
try { SS.encode({ styleId: "../x" }); } catch (e) { thrown = true; }
ok("encode: geçersiz stil kimliği fırlatır", thrown);

/* ---------------- base64url ---------------- */
["", "a", "ab", "abc", "Çağrı ışık ÖĞÜŞİ ✓ 😀", JSON.stringify({ a: "é" })].forEach(function (s) {
  ok("b64url gidiş-dönüş: " + JSON.stringify(s).slice(0, 20), SS.b64urlDecode(SS.b64urlEncode(s)) === s);
});
ok("b64url Node Buffer ile aynı", SS.b64urlEncode("Merhaba dünya!?") === Buffer.from("Merhaba dünya!?", "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));

/* ---------------- docs kopyası ---------------- */
ok("docs/js/style-share.js bayt bayt aynı", fs.readFileSync(path.join(kok, "docs", "js", "style-share.js")).equals(fs.readFileSync(path.join(kok, "js", "style-share.js"))));

/* ---------------- Marka Kiti: normalize ---------------- */
var bos = MK.normalize(null);
ok("normalize(null): varsayılan, kapalı", bos.kit.on === false && bos.kit.logo.kose === "ss" && bos.kit.ilerleme.konum === "yok" && bos.warnings.length === 0, JSON.stringify(bos));
var n = MK.normalize({
  on: true,
  stil: { id: "hormozi", overrides: { font: "Bungee", renk: "#FF0000", konum: 8, boyut: 300, font2: "x" } },
  kanca: { stil: "neon", renk: "#00ff00", sure: 99 },
  ilerleme: { konum: "alt", renk: "kirmizi", kalinlik: 100 },
  cta: { acik: true, metin: "Abone ol ve bildirimleri aç, kaçırma! Daha da uzun bir çağrı metni", sure: 0.2 },
  logo: { path: "/Users/ali/marka/logo.PNG", kose: "as", oran: 0.9 },
  kredi: "evet"
}, { styleIds: STILLER, hookStyles: ["kutu", "serit", "sade", "neon", "etiket"] });
var k = n.kit;
ok("normalize: açık + stil kimliği", k.on && k.stil.id === "hormozi");
ok("normalize: kit alanları (punto kitte tutulmaz)", k.stil.overrides.font === "Bungee" && k.stil.overrides.fontFile === "Bungee.ttf" &&
  k.stil.overrides.renk === "#ff0000" && k.stil.overrides.konum === 8 && k.stil.overrides.boyut === undefined, JSON.stringify(k.stil.overrides));
ok("normalize: kanca süresi 1-5", k.kanca.sure === 5 && k.kanca.stil === "neon" && k.kanca.renk === "#00ff00");
ok("normalize: ilerleme renk yedeği, kalınlık 2-24", k.ilerleme.konum === "alt" && k.ilerleme.renk === "#8b7cf6" && k.ilerleme.kalinlik === 24);
ok("normalize: CTA ≤ 40 karakter, süre 1.5-4", k.cta.acik && k.cta.metin.length <= 40 && k.cta.sure === 1.5, k.cta.metin.length + " " + k.cta.sure);
ok("normalize: logo oranı 0.08-0.25, köşe", k.logo.oran === 0.25 && k.logo.kose === "as" && k.logo.path === "/Users/ali/marka/logo.PNG");
ok("normalize: kredi yalnız true", k.kredi === false);
ok("normalize: uyarılar", ["ilerleme.renk", "cta.metin"].every(function (w) { return n.warnings.indexOf(w) !== -1; }), n.warnings.join(","));
var n2 = MK.normalize({ on: "true", stil: { id: "yok", overrides: { font: "Comic Sans", renk: "#12" } }, kanca: { stil: "uzay" },
  logo: { path: "https://x.com/logo.png", kose: "orta", oran: "abc" } }, { styleIds: STILLER, hookStyles: ["kutu"] });
ok("normalize: geçersiz değerler varsayılana", n2.kit.on === false && n2.kit.stil.id === "" && Object.keys(n2.kit.stil.overrides).length === 0 &&
  n2.kit.kanca.stil === "" && n2.kit.logo.path === "" && n2.kit.logo.kose === "ss" && n2.kit.logo.oran === 0.14, JSON.stringify(n2.kit));
ok("normalize: uyarılar geçersizleri sayar", ["stil.id", "stil.overrides.font", "stil.overrides.renk", "kanca.stil", "logo.path", "logo.kose"].every(function (w) {
  return n2.warnings.indexOf(w) !== -1; }), n2.warnings.join(","));
ok("logo yolu: yalnız png/jpg, kontrol karakteri yok", MK.isLogoPath("C:\\Marka\\logo.jpg") && MK.isLogoPath("/a/b.jpeg") &&
  !MK.isLogoPath("/a/b.gif") && !MK.isLogoPath("/a/b\n.png") && !MK.isLogoPath("file:///a.png") && !MK.isLogoPath(""));

/* ---------------- mergeBrandKit önceliği ---------------- */
var preset = { aile: "viral", font: "Archivo Black", fontFile: "ArchivoBlack.ttf", boyut: 118, renk: "#ffffff", konturRenk: "#05070b", vurguRenk: "#ffd83d", konum: 5 };
var kapali = MK.mergeBrandKit(preset, MK.normalize({ on: false, stil: { overrides: { renk: "#ff0000" } } }).kit);
ok("kit kapalı: değişmez kopya", JSON.stringify(kapali) === JSON.stringify(preset) && kapali !== preset);
var kitA = MK.normalize({ on: true, stil: { overrides: { font: "Lora", renk: "#FF0000", vurguRenk: "#00ff00" } } }).kit;
var m = MK.mergeBrandKit(preset, kitA);
ok("kit > stil: yazı tipi, renkler", m.font === "Lora" && m.fontFile === "Lora.ttf" && m.renk === "#ff0000" && m.vurguRenk === "#00ff00");
ok("kitte olmayan alanlar stilden (kontur rengi, punto)", m.konturRenk === "#05070b" && m.boyut === 118 && m.aile === "viral");
ok("kitte konum yoksa stilin kendi konumu", m.konum === 5);
ok("kitte konum varsa kit", MK.mergeBrandKit(preset, MK.normalize({ on: true, stil: { overrides: { konum: 2 } } }).kit).konum === 2);
ok("girdi değişmez", preset.font === "Archivo Black" && preset.renk === "#ffffff");
var h = MK.mergeHook({ text: "x", stil: "kutu", vurguRenk: "#ffe600" }, kitA);
ok("mergeHook: font + renk + kit vurgu", h.font === "Lora" && h.renk === "#ff0000" && h.vurguRenk === "#00ff00" && h.stil === "kutu", JSON.stringify(h));
var kitB = MK.normalize({ on: true, stil: { overrides: { vurguRenk: "#00ff00" } }, kanca: { renk: "#123456" } }).kit;
ok("mergeHook: kanca.renk kit vurgusundan önce", MK.mergeHook({ vurguRenk: "#ffe600" }, kitB).vurguRenk === "#123456");
ok("mergeHook: kit kapalı → aynı", JSON.stringify(MK.mergeHook({ a: 1 }, MK.defaults())) === "{\"a\":1}");

/* ---------------- fromCurrent ---------------- */
var fc = MK.fromCurrent({ aile: "neon", font: "Bebas Neue", renk: "#F4FBFF", konturRenk: "#0b1020", vurguRenk: "#2af5ff", konum: 5, boyut: 118 }, { on: true });
ok("fromCurrent: kit alanları doldu, açık kalır", fc.on && fc.stil.id === "neon" && fc.stil.overrides.font === "Bebas Neue" && fc.stil.overrides.renk === "#f4fbff" &&
  fc.stil.overrides.konum === undefined && fc.stil.overrides.boyut === undefined, JSON.stringify(fc.stil));
ok("fromCurrent: konum istenirse", MK.fromCurrent({ font: "Arial", konum: "8" }, null, true).stil.overrides.konum === 8);
ok("fromCurrent: sistem fontu kite alınmaz", MK.fromCurrent({ font: "Arial" }).stil.overrides.font === undefined);

/* ---------------- kit değişimi: styleFieldsChanged / rebaseBrandKit ---------------- */
var tabanStil = { aile: "viral", font: "Montserrat", renk: "#ffffff", konturRenk: "#000000", vurguRenk: "#ffe14d", konum: 2, boyut: 80 };
var kitK = MK.normalize({ on: true, stil: { overrides: { font: "Anton", renk: "#112233", konturRenk: "#000000", vurguRenk: "#ff00aa" } }, logo: { path: "C:/l.png", kose: "ss", oran: 0.1 } }).kit;
var kitLogo = MK.normalize({ on: true, stil: { overrides: { font: "Anton", renk: "#112233", konturRenk: "#000000", vurguRenk: "#ff00aa" } }, logo: { path: "C:/l.png", kose: "su", oran: 0.2 } }).kit;
ok("styleFieldsChanged: yalnız logo/köşe/boyut değişimi stil değişimi değil", !MK.styleFieldsChanged(kitK, kitLogo));
ok("styleFieldsChanged: açma, kapama, font, renk değişimi", MK.styleFieldsChanged(null, kitK) && MK.styleFieldsChanged(kitK, MK.normalize(Object.assign({}, kitK, { on: false })).kit) &&
  MK.styleFieldsChanged(kitK, MK.normalize({ on: true, stil: { overrides: { font: "Bungee", renk: "#112233", konturRenk: "#000000", vurguRenk: "#ff00aa" } } }).kit));
// paylaşılan kod (Bungee, kırmızı) kitin üstüne uygulanmış: kit değişimi bunları ezmez
var kodluStil = Object.assign({}, MK.mergeBrandKit(tabanStil, kitK), { font: "Bungee", renk: "#ff0000" });
var kitK2 = MK.normalize({ on: true, stil: { overrides: { font: "Lora", renk: "#445566", konturRenk: "#000000", vurguRenk: "#00ffaa" } } }).kit;
var rb = MK.rebaseBrandKit(kodluStil, tabanStil, kitK, kitK2);
ok("rebaseBrandKit: koddan gelen font ve renk korunur, kitte duran vurgu yeni kite geçer", rb.changed && rb.stil.font === "Bungee" && rb.stil.renk === "#ff0000" &&
  rb.stil.vurguRenk === "#00ffaa" && rb.stil.boyut === 80, JSON.stringify(rb.stil));
var kapat = MK.rebaseBrandKit(MK.mergeBrandKit(tabanStil, kitK), tabanStil, kitK, MK.normalize(Object.assign({}, kitK, { on: false })).kit);
ok("rebaseBrandKit: kit kapanınca kitin değerleri hazır stilin değerlerine döner", kapat.changed && kapat.stil.font === "Montserrat" && kapat.stil.renk === "#ffffff" &&
  kapat.stil.vurguRenk === "#ffe14d" && kapat.stil.konum === 2, JSON.stringify(kapat.stil));
var ac = MK.rebaseBrandKit(tabanStil, tabanStil, MK.normalize({ on: false }).kit, kitK);
ok("rebaseBrandKit: kit açılınca hazır stil kite geçer (mergeBrandKit ile aynı)", ac.changed &&
  ["font", "renk", "konturRenk", "vurguRenk", "konum"].every(function (k) { return String(ac.stil[k]) === String(MK.mergeBrandKit(tabanStil, kitK)[k]); }));
var elle = MK.rebaseBrandKit(Object.assign({}, tabanStil, { renk: "#abcdef" }), tabanStil, MK.normalize({ on: false }).kit, kitK);
ok("rebaseBrandKit: elle ince ayarlanmış renk kit açılınca da korunur", elle.stil.renk === "#abcdef" && elle.stil.font === "Anton");
ok("rebaseBrandKit: değişiklik yoksa changed false", !MK.rebaseBrandKit(kodluStil, tabanStil, kitK, kitLogo).changed);

/* ---------------- deneme filigranı: logo filigranın üstüne binmez ---------------- */
// js/filigran.js: \an9\pos(0.97w, 0.04h | 0.10h), boy = kısa kenar × 0.026; "suflo.app" ≤ 7 × boy genişlik, 1.4 × boy yükseklik (cömert kutu)
function filigranKutusu(W, H) {
  var boy = Math.max(10, Math.round(Math.min(W, H) * 0.026)), x2 = Math.round(W * 0.97), y1 = Math.round(H * (H > W ? 0.10 : 0.04));
  return { x1: x2 - 7 * boy, x2: x2, y1: y1, y2: y1 + 1.4 * boy };
}
var cakisan = [];
[[1920, 1080], [1080, 1920], [1080, 1080], [3840, 2160], [720, 1280]].forEach(function (b) {
  MK.CORNERS.forEach(function (kose) {
    [0.08, 0.14, 0.25].forEach(function (oran) {
      [false, true].forEach(function (guvenli) {
        var W = b[0], H = b[1], p = MK.logoPlacement(W, H, MK.watermarkSafeCorner(kose), oran, guvenli);
        var lh = p.lw;   // kare logo (en kötü durum: yükseklik = genişlik; daha uzunu da test edilir)
        [lh, lh * 2, H].forEach(function (yuk) {   // kare, dikey ve kare boyunda logo
          var y1 = p.alt ? p.y - yuk : p.y, y2 = p.alt ? p.y : p.y + yuk;
          var f = filigranKutusu(W, H);
          if (p.x < f.x2 && p.x + p.lw > f.x1 && y1 < f.y2 && y2 > f.y1) cakisan.push(W + "x" + H + " " + kose + " " + oran + " " + guvenli);
        });
      });
    });
  });
});
ok("deneme: her köşe, oran, logo boyunda logo filigranla kesişmez (sağ köşeler sola geçer)", cakisan.length === 0 && MK.watermarkSafeCorner("su") === "ss" &&
  MK.watermarkSafeCorner("as") === "au" && MK.watermarkSafeCorner("au") === "au" && MK.watermarkSafeCorner("x") === "ss", cakisan.slice(0, 3).join(" | "));

/* ---------------- logoPlacement ---------------- */
var W = 1080, H = 1920;
["su", "ss", "as", "au"].forEach(function (kose) {
  var p = MK.logoPlacement(W, H, kose, 0.25, true);
  var ustUzak = p.alt || p.y >= Math.ceil(H * 0.07);
  var ikonUzak = !(kose === "su" || kose === "as") || p.x + p.lw <= W * 0.87;
  var altUzak = !p.alt || p.y <= H * 0.78;
  ok("9:16 + güvenli " + kose + ": üst %7, ikon sütunu ve alt arayüz dışı", ustUzak && ikonUzak && altUzak && p.x >= 0 && p.lw % 2 === 0, JSON.stringify(p));
});
var p0 = MK.logoPlacement(W, H, "su", 0.25, false);
ok("güvenli kapalı: köşeye yaslanır", p0.y === Math.round(1080 * 0.04) && p0.x + p0.lw === W - Math.round(1080 * 0.04), JSON.stringify(p0));
var p169 = MK.logoPlacement(1920, 1080, "su", 0.1, true);
ok("16:9'da güvenli bayrağı yerleşimi değiştirmez", JSON.stringify(p169) === JSON.stringify(MK.logoPlacement(1920, 1080, "su", 0.1, false)));
ok("alt köşe: ffmpeg ifadesi logo yüksekliğini düşer", MK.logoPlacement(1920, 1080, "au", 0.1, false).yExpr === (1080 - 43) + "-overlay_h",
  MK.logoPlacement(1920, 1080, "au", 0.1, false).yExpr);
ok("geçersiz köşe → sol üst, oran kırpılır", MK.logoPlacement(1920, 1080, "x", 5).x === 43 && MK.logoPlacement(1920, 1080, "x", 5).lw === 480);

/* ---------------- suflo.app/stil sayfası (docs/js/stil-sayfa.js, sahte DOM) ---------------- */
var vm = require("vm");
var E = require(path.join(kok, "js", "style-engine.js"));
var sayfaSrc = fs.readFileSync(path.join(kok, "docs", "js", "stil-sayfa.js"), "utf8");
var adlar = new Function("var window = {}, document = { getElementById: function () { return { addEventListener: function () {} }; } }; " +
  sayfaSrc.slice(sayfaSrc.indexOf("var STILLER = {"), sayfaSrc.indexOf("};", sayfaSrc.indexOf("var STILLER = {")) + 2) + " return STILLER;")();
ok("sayfadaki stil adları motorla aynı (her Suflo Stili)", JSON.stringify(adlar) === JSON.stringify(E.list().reduce(function (o, p) { o[p.id] = p.name; return o; }, {})), JSON.stringify(adlar));
ok("her Suflo Stilinin site önizlemesi var", E.list().every(function (p) { return fs.existsSync(path.join(kok, "docs", "gorseller", "suflo-stiller", p.id + ".webm")); }));
var BASLIKLAR = { "renk-yazi": "Yazı", "renk-kontur": "Kontur", "renk-vurgu": "Vurgu" };
function sayfa(hash, dil) {
  var D = {}, dinle = {};
  function e(id) { if (!D[id]) D[id] = { id: id, hidden: false, textContent: "", title: BASLIKLAR[id] || "", style: {}, src: "", addEventListener: function () {}, play: function () { return { catch: function () {} }; } }; return D[id]; }
  var c = { window: {}, document: { getElementById: e, title: "", documentElement: { lang: dil || "tr" } }, location: { hash: hash }, navigator: {}, decodeURIComponent: decodeURIComponent, String: String, setTimeout: setTimeout };
  c.window.addEventListener = function (ad, f) { dinle[ad] = f; };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(kok, "docs", "js", "style-share.js"), "utf8"), c);
  vm.runInContext(sayfaSrc, c);
  return { D: D, doc: c.document, hashDegis: function (h) { c.location.hash = h; dinle.hashchange(); } };
}
var s1 = sayfa("#" + SS.encode({ styleId: "neon", overrides: { font: "Lora", renk: "#FF0000", vurguRenk: "#00ff00", konum: 8 }, author: "Ayşe_Kurgu" }));
ok("sayfa: geçerli kod gösterilir (ad, yazar, font, konum, video)", !s1.D["stil-icerik"].hidden && s1.D["stil-hata"].hidden &&
  s1.D["stil-ad"].textContent === "Neon · @Ayşe_Kurgu" && s1.D["stil-yazar"].textContent === "@Ayşe_Kurgu" && s1.D["stil-font"].textContent === "Lora" &&
  s1.D["stil-konum"].textContent === "Üst" && s1.D["stil-video"].src === "gorseller/suflo-stiller/neon.webm", JSON.stringify(s1.D["stil-ad"]));
ok("sayfa: renkler yalnız doğrulanmış hex, eksik renk gizli", s1.D["renk-yazi"].style.backgroundColor === "#ff0000" && s1.D["renk-vurgu"].style.backgroundColor === "#00ff00");
ok("sayfa: kontur rengi yoksa kutu gizli", s1.D["renk-kontur"].hidden === true);
var s2 = sayfa("#" + "SFL1." + SS.b64urlEncode(JSON.stringify({ v: 1, styleId: "viral", author: "<img src=x onerror=alert(1)>" })));
ok("sayfa: kötü yazar → hata kartı, içerik gizli", !s2.D["stil-hata"].hidden && s2.D["stil-icerik"].hidden && /yazar/.test(s2.D["stil-hata-metin"].textContent));
var s3 = sayfa("#SFL1." + SS.b64urlEncode(JSON.stringify({ v: 1, styleId: "uzayli" })));
ok("sayfa: bilinmeyen stil → hata, video yok", !s3.D["stil-hata"].hidden && s3.D["stil-icerik"].hidden && (!s3.D["stil-video"] || s3.D["stil-video"].src === ""));
var s4 = sayfa("");
ok("sayfa: kodsuz ziyaret → yalnız nasıl kullanılır", s4.D["stil-hata"].hidden && s4.D["stil-icerik"].hidden);


// hashchange: önceki kodun gizlediği renk kutusu yeni kodda geri gelir, başlık birikmez
var s5 = sayfa("#" + SS.encode({ styleId: "neon", overrides: { renk: "#aaaaaa" } }));
ok("sayfa: ilk kodda vurgu rengi yok → gizli", s5.D["renk-vurgu"].hidden === true && s5.D["renk-yazi"].title === "Yazı #aaaaaa");
s5.hashDegis("#" + SS.encode({ styleId: "pop", overrides: { renk: "#ff0000", vurguRenk: "#00ff00", font: "Anton" } }));
ok("sayfa: hashchange sonrası vurgu kutusu görünür, başlık birikmez", s5.D["renk-vurgu"].hidden === false && s5.D["renk-vurgu"].style.backgroundColor === "#00ff00" &&
  s5.D["renk-yazi"].title === "Yazı #ff0000" && s5.D["renk-vurgu"].title === "Vurgu #00ff00", s5.D["renk-yazi"].title + " | " + s5.D["renk-vurgu"].hidden);
s5.hashDegis("#" + SS.encode({ styleId: "doc" }));
ok("sayfa: renksiz üçüncü kodda kutular gizli, eski renk ve font kalmaz", s5.D["renk-yazi"].hidden && s5.D["renk-vurgu"].hidden &&
  s5.D["renk-yazi"].style.backgroundColor === "" && s5.D["stil-font"].style.fontFamily === "" && s5.D["stil-font"].textContent === "Stilin kendi yazı tipi");

// İngilizce sayfa (docs/en/stil.html, <html lang="en">)
var e1 = sayfa("#" + SS.encode({ styleId: "ziplama", overrides: { renk: "#FF0000", konum: 8 }, author: "ayse" }), "en");
ok("EN sayfa: İngilizce stil adı, konum, başlık, video yolu", e1.D["stil-ad"].textContent === "Bouncy · @ayse" && e1.D["stil-konum"].textContent === "Top" &&
  e1.doc.title === "Bouncy · Shared Suflo Style" && e1.D["stil-font"].textContent === "The style's own font" &&
  e1.D["stil-video"].src === "../gorseller/suflo-stiller/ziplama.webm" && e1.D["renk-yazi"].title === "Text #ff0000", JSON.stringify([e1.D["stil-ad"].textContent, e1.doc.title, e1.D["renk-yazi"].title]));
var e2 = sayfa("#SFL1." + SS.b64urlEncode(JSON.stringify({ v: 1, styleId: "uzayli" })), "en");
ok("EN sayfa: hata metni İngilizce", !e2.D["stil-hata"].hidden && e2.D["stil-hata-metin"].textContent === "This style is not available in this Suflo version.");
var e3 = sayfa("#SFL1.bozuk!!", "en");
ok("EN sayfa: bozuk kod → İngilizce genel hata", !e3.D["stil-hata"].hidden && !/[ğışİŞ]/.test(e3.D["stil-hata-metin"].textContent) && e3.D["stil-hata-metin"].textContent.length > 10, e3.D["stil-hata-metin"].textContent);
var enAdlar = new Function("var window = {}, document = { getElementById: function () { return { addEventListener: function () {} }; } }; " +
  sayfaSrc.slice(sayfaSrc.indexOf("var STILLER_EN = {"), sayfaSrc.indexOf("};", sayfaSrc.indexOf("var STILLER_EN = {")) + 2) + " return STILLER_EN;")();
var enSoz = require(path.join(kok, "i18n", "en.js"));
var enSozluk = enSoz.strings;
ok("EN sayfa: her Suflo Stilinin İngilizce adı var, panelin İngilizce adıyla aynı", E.list().every(function (p) {
  var cevrilmis = enSozluk && typeof enSozluk === "object" && enSozluk[p.name] ? enSozluk[p.name] : p.name;
  return enAdlar[p.id] === cevrilmis;
}), JSON.stringify(enAdlar));
ok("shareUrl: İngilizce arayüz /en/stil, Türkçe (ya da dil yok) /stil", SS.shareUrl("SFL1.x", "en") === "https://suflo.app/en/stil#SFL1.x" &&
  SS.shareUrl("SFL1.x", "tr") === "https://suflo.app/stil#SFL1.x" && SS.shareUrl("SFL1.x") === "https://suflo.app/stil#SFL1.x");

console.log("\n" + gecen + "/" + toplam + " geçti");
process.exit(gecen === toplam ? 0 : 1);
