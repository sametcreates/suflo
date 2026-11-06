// Suflo testi: geriye uyumlu stil kodu (js/stil-kodu.js, animasyon motoru v2).
//  - yazı animasyonu SFL1. kodunun üst düzey "ek" nesnesinde; önek ve v: 1 aynı
//  - gidip gelir (encode → decode); overrides'ta giriş / vurgu klasik çift
//  - bugünkü SS.decode (3.3 / 3.4 panelleri, suflo.app/stil) yeni kodu kabul eder, klasik çifti verir ("ek" yalnız uyarı)
//  - 3.2.0 çözücüsü (tests/fixtures) yeni kodda fırlatmaz; efekt stilini eskisi gibi "bu sürümde yok" diye reddeder
//  - kötü niyetli "ek" (bilinmeyen kimlik, __proto__, iç içe nesne, 10 KB metin) güvenle atılır
//  - eski kodlar (animasyonsuz) bayt bayt aynı kodlanır ve aynı çözülür
//  - parti 5: vurguKutuRenk / vurguRenk2 "ek"te gidip gelir, eski çözücü klasik karşılığı görür, kötü renk atılır
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var SS = require(path.join(KOK, "js", "style-share.js"));
var SK = require(path.join(KOK, "js", "stil-kodu.js"));
var YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
function ham(kod) { return JSON.parse(SS.b64urlDecode(kod.slice(SS.PREFIX.length))); }
function elle(obj) { return SS.PREFIX + SS.b64urlEncode(JSON.stringify(obj)); }
var STILLER = SE.list().map(function (p) { return p.id; });
function izin(id) { return STILLER.indexOf(id) !== -1; }

ok("style-share.js docs kopyasıyla bayt bayt aynı (dokunulmadı)", fs.readFileSync(path.join(KOK, "js", "style-share.js"), "utf8") === fs.readFileSync(path.join(KOK, "docs", "js", "style-share.js"), "utf8"));

/* ---------------- 1) kodlama ---------------- */
var tarif = { styleId: "efekt", overrides: Object.assign(AE.overrides(AE.gorunum("vurucu").ayar), { anim: "kelime-pop", guvenli: true }),
  text: { maxlen: "k1", kase: "upper", punct: false }, author: "ayse" };
var kod = SK.encode(tarif), j = ham(kod);
ok("encode: önek SFL1. ve v: 1 aynı; anim overrides'ta yok, ek.anim'de", kod.indexOf("SFL1.") === 0 && j.v === 1 && j.styleId === "efekt" &&
  !("anim" in j.overrides) && J(j.ek) === J({ anim: "kelime-pop" }), J(j));
ok("encode: giriş / vurgu katalogdaki klasik çift (Kelime pop → Pop + Yok)", j.overrides.giris === "pop" && j.overrides.aktif === "yok", J(j.overrides));
ok("encode: girdi değişmez (overrides.anim yerinde)", tarif.overrides.anim === "kelime-pop" && tarif.overrides.aktif === "zipla");
ok("encode: kod paylaşım sınırının (2048) çok altında", kod.length < 1024, kod.length);
var klasikTarif = { styleId: "efekt", overrides: AE.overrides(AE.gorunum("zarif").ayar), text: { maxlen: "c42x2" } };
ok("encode: animasyonsuz kod SS.encode ile bayt bayt aynı (eski kodlar değişmez)", SK.encode(klasikTarif) === SS.encode(klasikTarif) &&
  SK.encode(Object.assign({}, klasikTarif, { overrides: Object.assign({}, klasikTarif.overrides, { anim: "" }) })) === SS.encode(klasikTarif) &&
  SK.encode({ styleId: "neon", overrides: { renk: "#ff0000" } }) === SS.encode({ styleId: "neon", overrides: { renk: "#ff0000" } }));
ok("encode: bilinmeyen anim ya da eski stil kimliği → ek yok", ham(SK.encode({ styleId: "efekt", overrides: { anim: "uzay" } })).ek === undefined &&
  ham(SK.encode({ styleId: "hormozi", overrides: { anim: "kelime-pop" } })).ek === undefined);
var gecersizKimlik = false;
try { SK.encode({ styleId: "KÖTÜ", overrides: { anim: "dalga" } }); } catch (e) { gecersizKimlik = true; }
ok("encode: geçersiz stil kimliği SS.encode gibi fırlatır", gecersizKimlik);

/* ---------------- 2) gidip gelme ---------------- */
var d = SK.decode(kod, izin);
ok("decode: gidip gelir; anim overrides'a ve recipe.ek'e, uyarı yok", d.ok && d.recipe.overrides.anim === "kelime-pop" && J(d.recipe.ek) === J({ anim: "kelime-pop" }) &&
  d.warnings.length === 0 && d.recipe.author === "ayse" && d.recipe.text.kase === "upper" && d.recipe.overrides.guvenli === true, J(d));
ok("decode: her katalog kimliği gidip gelir", YA.kimlikler().every(function (id) {
  var x = SK.decode(SK.encode({ styleId: "efekt", overrides: { anim: id } }), izin);
  return x.ok && x.recipe.overrides.anim === id && x.recipe.overrides.giris === YA.klasik(id).giris && x.recipe.overrides.aktif === YA.klasik(id).aktif && x.warnings.length === 0;
}));
ok("decode: paylaşım bağlantısı ve bölünmüş kod da", SK.decode(SS.shareUrl(kod), izin).recipe.overrides.anim === "kelime-pop" &&
  SK.decode(kod.slice(0, 20) + "\n  " + kod.slice(20), izin).recipe.overrides.anim === "kelime-pop");
// motor kodu çözülmüş ayarla animasyonu çizer
var cizim = SE.compile({ styleId: "efekt", cues: [{ start: 0, end: 1, text: "Merhaba" }], cueKind: "words", overrides: d.recipe.overrides });
ok("çözülen kod motorda yazı animasyonunu çizer", cizim.style.anim === "kelime-pop" && /\\fscx0\\fscy0/.test(cizim.ass));

/* ---------------- 3) eski çözücüler ---------------- */
var bugun = SS.decode(kod, izin);
ok("bugünkü SS.decode (3.3 / 3.4 paneli, suflo.app/stil) kabul eder: klasik Pop + Yok, yalnız 'ek' uyarısı", bugun.ok && bugun.recipe.overrides.giris === "pop" &&
  bugun.recipe.overrides.aktif === "yok" && !("anim" in bugun.recipe.overrides) && J(bugun.warnings) === J(["ek"]) && bugun.recipe.overrides.font === "Anton", J(bugun));
var kutu = { module: { exports: {} } };
kutu.exports = kutu.module.exports;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "fixtures", "style-share-3.2.0.js"), "utf8"), kutu);
var Eski32 = kutu.module.exports;
var e32 = Eski32.decode(kod, function (id) { return ["mrbeast", "capcut", "saas", "viral", "pop", "doc", "premium", "hormozi", "neon", "daktilo", "ziplama", "dolgu"].indexOf(id) !== -1; });
ok("3.2.0 çözücüsü: fırlatmaz, efekt kodunu eskisi gibi 'bu sürümde yok' diye reddeder", !e32.ok && /efekt/.test(e32.error), e32.error);
var e32serbest = Eski32.decode(kod);
ok("3.2.0 çözücüsü (izin listesi olmadan): kodu ayrıştırır, 'ek' ve bilmediği alanlar yalnız uyarı", e32serbest.ok && e32serbest.recipe.styleId === "efekt" &&
  e32serbest.warnings.indexOf("ek") !== -1 && e32serbest.recipe.overrides.font === "Anton", J(e32serbest.warnings));

/* ---------------- 4) kötü niyetli ek ---------------- */
var taban = ham(SS.encode({ styleId: "efekt", overrides: { giris: "pop" } }));
function ekli(ek) { var o = JSON.parse(J(taban)); o.ek = ek; return elle(o); }
var kotuler = [
  ["bilinmeyen kimlik", { anim: "uzay-isini" }, ["ek.anim"]],
  ["__proto__ kimliği", { anim: "__proto__" }, ["ek.anim"]],
  ["toString kimliği", { anim: "toString" }, ["ek.anim"]],
  ["sayı", { anim: 7 }, ["ek.anim"]],
  ["iç içe nesne", { anim: { id: "dalga" } }, ["ek.anim"]],
  ["dizi", ["dalga"], ["ek"]],
  ["metin", "dalga", ["ek"]],
  ["null", null, ["ek"]],
  ["bilinmeyen alt alan", { anim: "dalga", gizli: { a: 1 } }, ["ek.gizli"]],
  ["garip alan adı", { "a b<script>": 1 }, ["ek"]]
];
kotuler.forEach(function (k) {
  var x = SK.decode(ekli(k[1]), izin);
  var animBekle = k[1] && k[1].anim === "dalga" && !(k[1] instanceof Array) ? "dalga" : undefined;
  ok("kötü ek (" + k[0] + "): kod yine uygulanır, alan atılır, uyarı " + J(k[2]), x.ok && x.recipe.overrides.giris === "pop" && x.recipe.overrides.anim === animBekle &&
    J(x.warnings) === J(k[2]) && Object.prototype.toString.call(x.recipe.overrides) === "[object Object]", J(x));
});
var proto = SK.decode(SS.PREFIX + SS.b64urlEncode('{"v":1,"styleId":"efekt","ek":{"__proto__":{"anim":"dalga","kirli":1},"anim":"netles"}}'), izin);
ok("ek.__proto__: prototip kirlenmez, yalnız geçerli anim alınır", proto.ok && proto.recipe.overrides.anim === "netles" && ({}).kirli === undefined &&
  proto.recipe.ek.kirli === undefined && proto.warnings.indexOf("ek.__proto__") !== -1, J(proto));
var ust = SK.decode(SS.PREFIX + SS.b64urlEncode('{"v":1,"styleId":"efekt","__proto__":{"ek":{"anim":"dalga"}}}'), izin);
ok("üst düzey __proto__ içindeki ek okunmaz", ust.ok && ust.recipe.overrides.anim === undefined && ({}).ek === undefined, J(ust));
var buyuk = new Array(10241).join("x");
var b1 = SK.decode(ekli({ anim: buyuk }), izin);
ok("10 KB'lık ek: kod sınırını (2048) aşar → SS.decode gibi reddedilir, fırlatmaz", !b1.ok && b1.error === "Stil kodu çok uzun.", b1.error);
var b2 = SK.decode(ekli({ anim: "dalga", dolgu: new Array(600).join("x") }), izin);
ok("ek boyut sınırı (512): büyük ek tümden atılır", b2.ok && b2.recipe.overrides.anim === undefined && J(b2.warnings) === J(["ek"]), J(b2.warnings));
ok("eski stil kimliği + ek.anim: animasyon atılır (yalnız Altyazı Efektleri çizer)", (function () {
  var o = ham(SS.encode({ styleId: "neon", overrides: { renk: "#ff0000" } })); o.ek = { anim: "dalga" };
  var x = SK.decode(elle(o), izin);
  return x.ok && x.recipe.overrides.anim === undefined && x.recipe.ek === undefined && J(x.warnings) === J(["ek.anim"]);
})());
ok("ek.anim \"\": uyarısız klasik", (function () { var x = SK.decode(ekli({ anim: "" }), izin); return x.ok && x.recipe.overrides.anim === undefined && x.warnings.length === 0; })());
ok("bozuk kod: SS.decode'un hatası aynen", J(SK.decode("SFL1.bozuk!!", izin)) === J(SS.decode("SFL1.bozuk!!", izin)) && SK.decode(null).ok === false && SK.decode(undefined).ok === false);

/* ---------------- 4b) parti 5: vurgu kutusu rengi ve ikinci vurgu rengi ---------------- */
var renkTarif = { styleId: "efekt", overrides: Object.assign(AE.overrides(AE.gorunum("temiz").ayar), { anim: "vurgu-kutusu", vurguKutuRenk: "#FF00AA", vurguRenk2: "#00cc88" }) };
var rk = SK.encode(renkTarif), rj = ham(rk);
// Doğrulama: kod yalnız animasyonun KULLANDIĞI rengi taşır (vurgu kutusu → vurguKutuRenk; vurguRenk2 onda kullanılmaz)
ok("parti 5 encode: renkler overrides'ta yok, ek'te (küçük harf); yalnız animasyonun kullandığı renk", !("vurguKutuRenk" in rj.overrides) && !("vurguRenk2" in rj.overrides) &&
  J(rj.ek) === J({ anim: "vurgu-kutusu", vurguKutuRenk: "#ff00aa" }), J(rj.ek));
var rd = SK.decode(rk, izin);
ok("parti 5 decode: renk gidip gelir (overrides + recipe.ek), uyarı yok", rd.ok && rd.recipe.overrides.vurguKutuRenk === "#ff00aa" &&
  rd.recipe.overrides.vurguRenk2 === undefined && rd.recipe.overrides.anim === "vurgu-kutusu" && rd.warnings.length === 0, J(rd.warnings));
var ikiTon = SK.decode(SK.encode({ styleId: "efekt", overrides: { anim: "iki-ton", vurguRenk2: "#123456", vurguKutuRenk: "#654321" } }), izin);
ok("parti 5: iki ton ikinci vurgu rengini taşır, kullanmadığı kutu rengini taşımaz", ikiTon.ok && ikiTon.recipe.overrides.vurguRenk2 === "#123456" &&
  ikiTon.recipe.overrides.vurguKutuRenk === undefined && ikiTon.recipe.overrides.anim === "iki-ton" && ikiTon.warnings.length === 0, J(ikiTon));
/*
 * Doğrulama (regresyon): panelde bir kez renk seçip Klasik'e (ya da rengi kullanmayan animasyona) dönen kullanıcının
 * kodu, kullanılmayan renk yüzünden "ek" taşımamalı: eski paneller ve suflo.app/stil klasik bir kodda "1 geçersiz ayar
 * atlandı" uyarısı gösterirdi. Klasik kod SS.encode'unkiyle bayt bayt aynı kalır.
 */
var klasikRenkli = { styleId: "efekt", overrides: Object.assign(AE.overrides(AE.gorunum("temiz").ayar), { vurguKutuRenk: "#ff00aa", vurguRenk2: "#123456" }), text: { maxlen: "c32", kase: "normal", punct: true } };
var klasikTemiz = { styleId: "efekt", overrides: AE.overrides(AE.gorunum("temiz").ayar), text: { maxlen: "c32", kase: "normal", punct: true } };
ok("parti 5: animasyonsuz kodda kullanılmayan renk koda girmez (SS.encode ile bayt bayt aynı, eski çözücüde uyarı yok)",
  SK.encode(klasikRenkli) === SS.encode(klasikTemiz) && ham(SK.encode(klasikRenkli)).ek === undefined &&
  SS.decode(SK.encode(klasikRenkli), izin).warnings.length === 0);
ok("parti 5: rengi kullanmayan animasyonda renk koda girmez (yalnız anim)",
  J(ham(SK.encode({ styleId: "efekt", overrides: { anim: "dalga", vurguKutuRenk: "#ff00aa", vurguRenk2: "#123456" } })).ek) === J({ anim: "dalga" }));
// Çözücü ileriye uyumlu kalır: elle yazılmış ek'te animasyonsuz renk de kabul edilir (motor klasikte kullanmaz)
var yalnizRenk = SK.decode(ekli({ vurguRenk2: "#123456" }), izin);
ok("parti 5: çözücü animasyonsuz ek rengini uyarısız kabul eder (klasikte kullanılmaz)", yalnizRenk.ok && yalnizRenk.recipe.overrides.vurguRenk2 === "#123456" &&
  yalnizRenk.recipe.overrides.anim === undefined && yalnizRenk.warnings.length === 0, J(yalnizRenk));
var eskiRk = SS.decode(rk, izin);
ok("parti 5, eski çözücü (SS.decode): kabul eder, renkleri görmez, klasik çift (yalnız 'ek' uyarısı)", eskiRk.ok && !("vurguKutuRenk" in eskiRk.recipe.overrides) &&
  !("vurguRenk2" in eskiRk.recipe.overrides) && eskiRk.recipe.overrides.giris === YA.klasik("vurgu-kutusu").giris && J(eskiRk.warnings) === J(["ek"]), J(eskiRk));
var e32r = Eski32.decode(rk);
ok("parti 5, 3.2.0 çözücüsü: fırlatmaz", e32r && typeof e32r.ok === "boolean");
ok("parti 5: renk null / geçersizse koda girmez", J(ham(SK.encode({ styleId: "efekt", overrides: { vurguRenk2: null, vurguKutuRenk: "kırmızı" } })).ek) === undefined &&
  SK.encode({ styleId: "efekt", overrides: { vurguRenk2: null } }) === SS.encode({ styleId: "efekt", overrides: {} }) &&
  ham(SK.encode({ styleId: "hormozi", overrides: { vurguRenk2: "#123456" } })).ek === undefined);
[["#abc (kısa)", { vurguRenk2: "#abc" }, ["ek.vurguRenk2"]], ["sayı", { vurguKutuRenk: 5 }, ["ek.vurguKutuRenk"]],
  ["enjeksiyon", { vurguKutuRenk: "#fff}{\\pos(0,0)" }, ["ek.vurguKutuRenk"]], ["iç içe", { vurguRenk2: { r: 1 } }, ["ek.vurguRenk2"]]].forEach(function (k) {
  var x = SK.decode(ekli(k[1]), izin);
  ok("kötü parti 5 rengi (" + k[0] + "): atılır, uyarı " + J(k[2]), x.ok && x.recipe.overrides.vurguRenk2 === undefined && x.recipe.overrides.vurguKutuRenk === undefined &&
    J(x.warnings) === J(k[2]), J(x));
});
ok("parti 5: eski stil kimliği + ek renkleri atılır", (function () {
  var o = ham(SS.encode({ styleId: "neon", overrides: { renk: "#ff0000" } })); o.ek = { vurguRenk2: "#123456" };
  var x = SK.decode(elle(o), izin);
  return x.ok && x.recipe.overrides.vurguRenk2 === undefined && x.recipe.ek === undefined && J(x.warnings) === J(["ek.vurguRenk2"]);
})());
var rc = SE.compile({ styleId: "efekt", cues: [{ start: 0, end: 1, text: "Merhaba" }, { start: 1, end: 2, text: "dünya" }], cueKind: "words", overrides: rd.recipe.overrides });
ok("parti 5: çözülen kodun kutu rengi motorda çizilir", rc.style.vurguKutuRenk === "#ff00aa" && /SufloKutu,[^\n]*\\3c&H00AA00FF/.test(rc.ass));

/* ---------------- 5) eski kodlar ---------------- */
var eskiKodlar = [
  SS.encode({ styleId: "efekt", overrides: AE.overrides(AE.gorunum("glitch").ayar), text: { maxlen: "k1", kase: "upper", punct: false }, author: "mehmet" }),
  SS.encode({ styleId: "neon", overrides: { font: "Lora", renk: "#00ff00", konum: 2, boyut: 90 }, text: { kase: "upper" } }),
  SS.encode({ styleId: "efekt", overrides: { konumX: 30, konumY: 70, golge: { opak: 50 }, kutu: true } }),
  elle({ v: 1, styleId: "efekt", overrides: { giris: "uzay" }, gelecek: 1 })
];
ok("eski kodlar SufloStilKodu ile aynı çözülür (ok, recipe, warnings)", eskiKodlar.every(function (k) { return J(SK.decode(k, izin)) === J(SS.decode(k, izin)); }));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
