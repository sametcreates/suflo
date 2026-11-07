/*
 * Suflo testi: yeni eklenen efektler (AutoCaptions koleksiyonu) panelde öne çıkar ve koleksiyon adı yazılmaz.
 *  - Kütüphane (js/library.js, gerçek kaynak, sahte DOM): her bölümde yeniler başta ve YENİ rozetli; yeni altyazı
 *    şablonları Yazı Animasyonları'nda da görünür; "AutoCaptions" adı kartlarda yok; Pro paketindeki yeni başlık
 *    MOGRT'leri ("AutoCaptions Titles/") Diğer'e değil Yazı Animasyonları'na gider (vitrinle aynı)
 *  - Altyazı sekmesi (captions.js işlevleri): Premiere Şablonları'nda yeniler başta, adında önek yok, rozet YENİ;
 *    galeride Yeni sekmesi ve yeni çipler başta (veri sırası değişmez); "Yeni efektler" bandı index.html'de
 *  - Görünen metinlerde (index.html, i18n değerleri, görünür panel dizgeleri) AutoCaptions geçmez
 */
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecti = 0, kaldi = 0;
function ok(ad, kosul, kanit) {
  if (kosul) { gecti++; console.log("PASS " + ad); }
  else { kaldi++; console.log("FAIL " + ad + "   [" + String(kanit).slice(0, 300) + "]"); }
}

/* ---------------- sahte DOM (yalnız library.js ciz'in kullandıkları) ---------------- */
function oge(etiket) {
  var o = { tagName: etiket, childNodes: [], attrs: {}, className: "", textContent: "", _html: "" };
  o.setAttribute = function (k, v) { o.attrs[k] = String(v); };
  o.getAttribute = function (k) { return o.attrs.hasOwnProperty(k) ? o.attrs[k] : null; };
  o.addEventListener = function () {};
  o.appendChild = function (c) { o.childNodes.push(c); return c; };
  o.classList = { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } };
  o.querySelector = function () { return oge("span"); };
  Object.defineProperty(o, "innerHTML", { get: function () { return o._html; }, set: function (v) { o._html = String(v); if (!v) o.childNodes = []; } });
  return o;
}
function kutuphane(secenek) {
  var dom = { "mogrt-grid": oge("div"), "mogrt-bos": oge("p") };
  var ctx = {
    console: console, Promise: Promise, Buffer: Buffer, setTimeout: setTimeout, clearTimeout: clearTimeout,
    document: {
      getElementById: function (id) { return dom[id] || null; },
      querySelectorAll: function () { return []; },
      createElement: function (t) { return oge(t); }
    },
    Pro: { isPro: function () { return !!secenek.pro; }, gate: function () { return !!secenek.pro; }, on: function () {} },
    KCaptions: { refreshMogrtStyles: function () {} },
    KApp: { toast: function () {}, onTab: function () {} },
    K: {
      nodeOK: true, fs: fs, path: path, os: os,
      settingsPath: function () { return path.join(secenek.tmp, "Kesit", "settings.json"); },
      extensionPath: function () { return secenek.ext; },
      settings: function () { return secenek.ayar; },
      saveSettings: function () { return true; },
      unzip: function () { return Promise.reject(new Error("test")); },
      log: function () {}
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "library.js"), "utf8"), ctx, { filename: "js/library.js" });
  return { ctx: ctx, dom: dom };
}
function kartlar(dom) {
  return dom["mogrt-grid"].childNodes.map(function (k) {
    var ad = (/<b title="([^"]*)"/.exec(k._html) || [])[1] || "";
    return { ad: ad, yeni: /class="mogrt-yeni">YENİ</.test(k._html), html: k._html };
  });
}
function yeniBasta(liste) {
  var sonYeni = -1, ilkEski = liste.length;
  liste.forEach(function (k, i) { if (k.yeni) sonYeni = i; else if (ilkEski === liste.length) ilkEski = i; });
  return sonYeni < ilkEski;
}

async function run() {
  /* ---- 1) ücretsiz: gerçek vitrin katalogları (assets/pro-*-showcase) ---- */
  var TMP = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-yeni-"));
  var v = kutuphane({ pro: false, tmp: TMP, ext: KOK, ayar: { mogrtEkKlasor: "" } });
  await v.ctx.KLib.tara();
  v.ctx.KLib.setKategori("mogrt");
  var yazi = kartlar(v.dom);
  var yeniYazi = yazi.filter(function (k) { return k.yeni; });
  ok("Yazı Animasyonları: yeni efektler başta ve YENİ rozetli", yazi.length > 20 && yeniYazi.length === 19 && yeniBasta(yazi),
    yazi.slice(0, 22).map(function (k) { return (k.yeni ? "*" : "") + k.ad; }).join(","));
  ok("Yazı Animasyonları: 5 yeni başlık + 14 yeni altyazı şablonu (altyazı şablonları burada da var)",
    ["Highlighted Text", "Money Text Pro", "Cinematic Duo", "Comment Your Word", "Apple Selection", "Aura", "Azul"].every(function (a) {
      return yeniYazi.some(function (k) { return k.ad === a; }); }), yeniYazi.map(function (k) { return k.ad; }).join(","));
  ok("Yazı Animasyonları: eski efektler de yerinde (Smooth Up), yalnız sırası değişti", yazi.some(function (k) { return k.ad === "Smooth Up" && !k.yeni; }));
  v.ctx.KLib.setKategori("captions");
  var alt = kartlar(v.dom);
  ok("Altyazı Şablonları: 14 yeni şablon başta, 17 Suflo stili ardından", alt.length === 31 && alt.filter(function (k) { return k.yeni; }).length === 14 && yeniBasta(alt),
    alt.map(function (k) { return (k.yeni ? "*" : "") + k.ad; }).join(","));
  ok("kartlarda AutoCaptions adı yazmaz (ör. \"AutoCaptions Aura\" → \"Aura\")",
    yazi.concat(alt).every(function (k) { return !/autocaptions/i.test(k.ad); }) && alt.some(function (k) { return k.ad === "Aura"; }),
    yazi.concat(alt).filter(function (k) { return /autocaptions/i.test(k.ad); }).map(function (k) { return k.ad; }).join(","));
  v.ctx.KLib.setKategori("custom");
  ok("Diğer Animasyonlar'da yeni içerik yok (yanlış bölüme düşmez)", kartlar(v.dom).every(function (k) { return !k.yeni; }));

  /* ---- 2) Pro: kurulu Pro paketi dosyaları (pro-icerik-ekle düzeni) ---- */
  var PAKET = path.join(TMP, "pro-pack");
  function yaz(rel) { var p = path.join(PAKET, "mogrt", rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, "mogrt"); }
  yaz("Text Animations/SUFLO TEXT - 01 Smooth Up.mogrt");
  yaz("Text Animations/SUFLO TEXT - 02 Rainbow Text.mogrt");
  yaz("AutoCaptions Titles/SUFLO MOGRT - Comment Your Word.mogrt");
  yaz("AutoCaptions Titles/SUFLO MOGRT - Highlighted Text.mogrt");
  yaz("AutoCaptions Captions/SUFLO MOGRT - AutoCaptions Azul.mogrt");
  yaz("Captions/9x16 Karaoke Subtitles.mogrt");
  var p = kutuphane({ pro: true, tmp: TMP, ext: path.join(TMP, "yok"), ayar: { mogrtEkKlasor: "", proPackKlasor: PAKET } });
  await p.ctx.KLib.tara();
  p.ctx.KLib.setKategori("mogrt");
  var pYazi = kartlar(p.dom);
  ok("Pro: yeni başlık MOGRT'leri Yazı Animasyonları'nda (\"Comment Your Word\" Diğer'e düşmez), başta, YENİ rozetli",
    pYazi.length === 5 && pYazi.slice(0, 3).every(function (k) { return k.yeni; }) && pYazi.slice(3).every(function (k) { return !k.yeni; }) &&
    pYazi.some(function (k) { return k.ad === "Comment Your Word"; }), pYazi.map(function (k) { return (k.yeni ? "*" : "") + k.ad; }).join(","));
  ok("Pro: yeni altyazı şablonu Yazı Animasyonları'nda da, adı önek olmadan (Azul)", pYazi.some(function (k) { return k.ad === "Azul" && k.yeni; }));
  p.ctx.KLib.setKategori("captions");
  var pAlt = kartlar(p.dom);
  ok("Pro: Altyazı Şablonları'nda yeni şablon başta", pAlt.length === 2 && pAlt[0].ad === "Azul" && pAlt[0].yeni && !pAlt[1].yeni,
    pAlt.map(function (k) { return (k.yeni ? "*" : "") + k.ad; }).join(","));
  ok("Pro: Stil bölümüne giden altyazı şablonları değişmedi (yalnız caption grubu)", p.ctx.KLib.altyaziSayisi() === 2 && p.ctx.KLib.yaziSayisi() === 4,
    p.ctx.KLib.altyaziSayisi() + "/" + p.ctx.KLib.yaziSayisi());
  p.ctx.KLib.setKategori("custom");
  ok("Pro: Diğer Animasyonlar boş (yeni başlıklar orada değil)", kartlar(p.dom).length === 0, kartlar(p.dom).map(function (k) { return k.ad; }).join(","));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}

  /* ---- 3) Altyazı sekmesi: captions.js işlevleri ---- */
  var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
  function govde(imza) { var i = cap.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return cap.slice(i, cap.indexOf("\n  }\n", i) + 4); }
  var c = {};
  vm.createContext(c);
  vm.runInContext(govde("function yeniOnce(") + govde("function yeniMogrtMi(") + govde("function temizMogrtAdi(") +
    "this.yeniOnce = yeniOnce; this.yeniMogrtMi = yeniMogrtMi; this.temizMogrtAdi = temizMogrtAdi;", c);
  ok("yeniOnce: kararlı (yeniler başta, iki grup kendi sırasıyla), girdi değişmez", (function () {
    var g = [1, 2, 3, 4, 5, 6], s = c.yeniOnce(g, function (x) { return x % 2 === 0; });
    return JSON.stringify(s) === "[2,4,6,1,3,5]" && JSON.stringify(g) === "[1,2,3,4,5,6]";
  })());
  ok("Premiere Şablonları: vitrin (collection) ve kurulu dosya (yol / ad) yeni sayılır; Suflo stili değil",
    c.yeniMogrtMi({ collection: "AutoCaptions", display: "AutoCaptions Aura" }) &&
    c.yeniMogrtMi({ path: "/p/mogrt/AutoCaptions Captions/SUFLO MOGRT - AutoCaptions Azul.mogrt", display: "AutoCaptions Azul" }) &&
    !c.yeniMogrtMi({ display: "Karaoke", styleKey: "Karaoke" }) && !c.yeniMogrtMi(null));
  ok("Premiere Şablonları: ad önekiz (AutoCaptions Aura → Aura), eski adlar aynı (Mr Beast → Creator Punch)",
    c.temizMogrtAdi({ display: "AutoCaptions Aura" }) === "Aura" && c.temizMogrtAdi({ display: "AutoCaptions 4 Color Gradient" }) === "4 Color Gradient" &&
    c.temizMogrtAdi({ display: "9x16 Mr Beast Subtitles" }) === "Creator Punch" && c.temizMogrtAdi({ display: "AutoCaptions" }) === "AutoCaptions");
  var ciz = govde("function mogrtStilleriniCiz(");
  ok("Premiere Şablonları: sıralama yeniler başta, sonra ada göre; rozet YENİ", /var ya = yeniMogrtMi\(a\) \? 0 : 1, yb = yeniMogrtMi\(b\) \? 0 : 1;\s*return ya - yb \|\| temizMogrtAdi\(a\)\.localeCompare/.test(ciz) &&
    /badge\.textContent = \(yeniMogrtMi\(item\) \? "YENİ · " : ""\)/.test(ciz) && /"Suflo Pro · yeni şablon"/.test(ciz));
  ok("galeri: çipler ve sekmeler yeni koleksiyonla başlar, animasyon seçicide Yeni grubu Klasik'in ardından",
    /yeniOnce\(AE\.GORUNUMLER, function \(g\) \{ return g\.koleksiyon === "autocaptions"; \}\)/.test(govde("function gorunumleriCiz(")) &&
    /kategoriler: yeniOnce\(AE\.KATEGORILER, function \(k\) \{ return k\.id === "autocaptions"; \}\)/.test(govde("function gorunumleriCiz(")) &&
    /yeniOnce\(YA\.gruplar\(\), function \(g\) \{ return g\.id === "autocaptions"; \}\)/.test(govde("function efektAnimSeciminiDoldur(")));
  var AE = require(path.join(KOK, "js", "altyazi-efekt.js")), YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
  ok("veri sırası değişmedi (stil kodları, Shorts paketi, en yakın görünüm): yeni koleksiyon kataloğun sonunda",
    AE.KATEGORILER[AE.KATEGORILER.length - 1].id === "autocaptions" && AE.GORUNUMLER[0].id === "temiz" && YA.KATEGORILER[YA.KATEGORILER.length - 1].id === "autocaptions");
  ok("kategori adı \"Yeni\" (galeri sekmesi, animasyon grubu)", AE.KATEGORILER[AE.KATEGORILER.length - 1].ad === "Yeni" && YA.KATEGORILER[YA.KATEGORILER.length - 1].ad === "Yeni");

  /* ---- 4) bant ve görünen metinler ---- */
  var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
  var iBant = html.indexOf('id="cap-yeni-efekt-bant"'), iGaleri = html.indexOf('id="cap-efekt-galeri"');
  ok("index.html: Yeni efektler bandı Altyazı Efektleri galerisinin hemen üstünde, sayı çeviriden muaf",
    iBant > 0 && iBant < iGaleri && /<button type="button" class="yeni-efekt-bant" id="cap-yeni-efekt-bant" hidden>/.test(html) &&
    /id="cap-yeni-efekt-sayi" data-i18n-skip/.test(html) && /Birine tıkla, altyazın doğrudan o efektle yazılsın · Pro/.test(html));
  var bant = govde("function yeniEfektBandiniKur(");
  ok("bant: sayıyı koleksiyondan sayar, tıklayınca Yeni sekmesini açar ve ilk yeni çipe odaklanır",
    /g\.koleksiyon === "autocaptions"/.test(bant) && /\.efekt-kategori\[data-kategori="autocaptions"\]/.test(bant) && /efekt-cip-yeni:not\(\[hidden\]\)/.test(bant) &&
    /bant\.__bagli/.test(bant));
  // Görünen metin: HTML yorumları ve betikler dışı; i18n değerleri; panel betiklerindeki tırnaklı dizgeler (yorumlar hariç)
  var gorunurHtml = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  ok("index.html görünen metinde AutoCaptions yok", !/autocaptions/i.test(gorunurHtml.replace(/<[^>]+>/g, " ")),
    (gorunurHtml.replace(/<[^>]+>/g, " ").match(/.{30}AutoCaptions.{30}/i) || [""])[0]);
  var en = fs.readFileSync(path.join(KOK, "i18n", "en.js"), "utf8").split("\n").filter(function (l) { return !/^\s*\/\//.test(l); }).join("\n");
  ok("i18n: çevirilerde AutoCaptions yok", !/autocaptions/i.test(en), (en.match(/.{40}AutoCaptions.{20}/i) || [""])[0]);
  var dizgeler = [];
  ["captions.js", "library.js", "pro.js", "app.js", "onboarding.js", "altyazi-efekt.js", "yazi-animasyonlari.js", "ae-panel.js"].forEach(function (f) {
    var kaynak = fs.readFileSync(path.join(KOK, "js", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    (kaynak.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g) || []).forEach(function (d) {
      if (/AutoCaptions/.test(d)) dizgeler.push(f + ": " + d);   // iç kimlik küçük harfle ("autocaptions") sayılmaz
    });
  });
  ok("panel betiklerinde görünen AutoCaptions dizgesi yok (iç kimlik \"autocaptions\" hariç)", dizgeler.length === 0, dizgeler.join(" | "));

  console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
  process.exit(kaldi ? 1 : 0);
}
run().catch(function (e) { console.log("FAIL test kosumu   [" + (e && e.stack ? e.stack : e) + "]"); process.exit(1); });
