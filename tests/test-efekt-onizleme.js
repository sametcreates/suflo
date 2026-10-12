// Suflo testi: Altyazı Efektleri canlı önizlemesinin gerçek çizim sırası (3.3, plan adım 16 incelemesi).
// captions.js'in GERÇEK işlevleri (motorOnizlemeOynat, motorCizimiBaslat, efektOnizlemeTazele,
// onizlemeOynat, onizlemeDurdur) sahte DOM, sahte dosya sistemi ve elle bitirilen ffmpeg ile çalışır.
//  - çizim sürerken MOGRT seçilirse eski çizim MOGRT önizlemesinin üstüne çıkmaz
//  - çizim sürerken stil kodu uygulanırsa eski görünüm "seçili ayarlarla" diye kalmaz, kodun görünümü
//    çizilir; ikinci ffmpeg ilki bitmeden başlamaz
//  - her çizimin ASS / font kopyası kendi klasöründe: biri ötekinin fontunu silemez
//  - önizleme katmanla aynı font dosyalarını kullanır (kalın kapalı Montserrat → Regular)
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
function govde(imza) {
  var i = cap.indexOf(imza);
  if (i < 0) throw new Error("yok: " + imza);
  return cap.slice(i, cap.indexOf("\n  }\n", i) + 4);
}
var SE = require(path.join(KOK, "js", "style-engine.js"));
var OR = require(path.join(KOK, "js", "overlay-render.js"));

function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

function ortam() {
  var dosyalar = {}, silinen = [], calistirmalar = [], domYedegi = 0;
  function dugum(ek) {
    var d = { hidden: false, disabled: false, textContent: "", src: "", loop: false, checked: false, style: {}, attrs: {} };
    d.removeAttribute = function (k) { delete d.attrs[k]; if (k === "src") d.src = ""; };
    d.pause = function () {}; d.load = function () {}; d.play = function () { return Promise.resolve(); };
    d.classList = { remove: function () {}, add: function () {} };
    for (var k in ek || {}) d[k] = ek[k];
    return d;
  }
  var dom = {
    "cap-render-onizleme": dugum({ hidden: true }), "cap-onizleme-metin": dugum(), "cap-onizleme-not": dugum(), "cap-onizleme-oynat": dugum(),
    "cap-sahne": dugum(), "cap-mogrt-onizleme": dugum({ hidden: true }), "cap-guvenli-alan": dugum()
  };
  var sahteFs = {
    mkdirSync: function (p) { dosyalar[p + "/"] = true; },
    writeFileSync: function (p, v) { dosyalar[p] = String(v); },
    existsSync: function (p) { return Object.prototype.hasOwnProperty.call(dosyalar, p) || /[\\/]fonts[\\/]/.test(p); },
    copyFileSync: function (a, b) { dosyalar[b] = "kopya:" + path.basename(a); },
    unlinkSync: function (p) { if (!Object.prototype.hasOwnProperty.call(dosyalar, p)) throw new Error("ENOENT " + p); delete dosyalar[p]; silinen.push(p); },
    rmdirSync: function (p) {
      var dolu = Object.keys(dosyalar).some(function (k) { return k !== p + "/" && k.indexOf(p + path.sep) === 0; });
      if (dolu) throw new Error("ENOTEMPTY " + p);
      delete dosyalar[p + "/"];
    }
  };
  var K = {
    nodeOK: true, path: path, fs: sahteFs, tmpDir: function () { return "/tmp/suflo"; }, log: function () {},
    findFfmpeg: function () { return Promise.resolve("ffmpeg"); },
    run: function (ff, args, o) {
      var c = { args: args, cwd: o.cwd, bitti: null, fontlar: Object.keys(dosyalar).filter(function (k) { return /\.ttf$/.test(k) && k.indexOf(o.cwd) === 0; }) };
      calistirmalar.push(c);
      return new Promise(function (r) {
        c.bitti = function () { dosyalar[args[args.length - 1]] = "webm"; r({ code: 0 }); };
      });
    }
  };
  var durum = { stil: { aile: "efekt", yogunluk: "balanced", font: "Montserrat", boyut: 76, renk: "#ffffff", konturRenk: "#000000", vurguRenk: "#ffd23f",
    kontur: 5, konum: 2, kutu: false, animasyon: "efekt", guvenli: false, giris: "fade", aktif: "yok", vurgu: true, kalin: true, italik: false, satir: 2, kelime: 5 } };
  var kod = [govde("function onizlemeDurdur("), govde("async function motorOnizlemeOynat("), govde("function motorCizimiBaslat("),
    govde("function efektOnizlemeTazele("), govde("function onizlemeOynat(")].join("\n");
  var api = new Function("K", "window", "el", "KApp", "durum", "say",
    "var EFEKT = 'efekt', secilenMogrt = null, secilenMotorStili = 'efekt';\n" +
    "var onizlemeSaat = null, onizlemeKareYol = null, onizlemeRenderYol = null, onizlemeRenderCalisiyor = false, onizlemeNesil = 0;\n" +
    "var efektSaat = null, efektTekrar = false;\n" +
    "function stil() { return JSON.parse(JSON.stringify(durum.stil)); } function motorStiliMi(id) { return window.SufloStyleEngine.has(id); }\n" +
    "function motorOnizlemeCueleri() { return [{ start: 0.15, end: 0.7, text: 'Bunu' }, { start: 0.77, end: 1.3, text: 'gören' }]; }\n" +
    "function onizlemeBoyutu() { return { w: 960, h: 540, dikey: false }; } function konusmaciRenkleri(o) { return o; }\n" +
    "function cueler() { return []; } function motorCueTuru() { return 'words'; } function markaKiti() { return null; }\n" +
    "function motorAyarlari(st) { return { font: st.font, boyut: st.boyut, renk: st.renk, konturRenk: st.konturRenk, vurguRenk: st.vurguRenk, kontur: st.kontur, konum: st.konum, giris: st.giris, aktif: st.aktif, vurgu: st.vurgu, kalin: st.kalin, italik: st.italik, satir: st.satir, kelime: st.kelime }; }\n" +
    "function uzantiDizini() { return '/ext'; } function guvenliAlanFiltresi() { return ''; } function sahneOraniniAyarla() {}\n" +
    "function dosyaUrl(p) { return 'file://' + p; } function onizlemeCiz() {} function onizlemeOynatDom() { say.dom++; } function temizMogrtAdi() { return 'Şablon'; }\n" +
    kod +
    "\nreturn { tazele: efektOnizlemeTazele, oynat: onizlemeOynat, durdur: onizlemeDurdur," +
    " mogrtSec: function (m) { secilenMogrt = m; secilenMotorStili = ''; onizlemeDurdur(); }," +
    " kodUygula: function (st) { durum.stil = st; onizlemeDurdur(); efektOnizlemeTazele(true); }," +
    " durum: function () { return { calisiyor: onizlemeRenderCalisiyor, tekrar: efektTekrar, renderYol: onizlemeRenderYol }; } };")(
    K, { SufloStyleEngine: SE, SufloOverlayRender: OR }, function (id) { return dom[id] || null; }, { ctx: function () { return {}; } }, durum, { get dom() { return domYedegi; }, set dom(v) { domYedegi = v; } });
  return { api: api, dom: dom, dosyalar: dosyalar, silinen: silinen, run: calistirmalar, domYedegi: function () { return domYedegi; }, durum: durum };
}

(async function () {
  /* ---- 1) çizim sürerken Premiere şablonu seçildi ---- */
  var a = ortam();
  a.api.tazele(true);
  await bekle(5);
  ok("ayar değişince gerçek çizim başlar (tek ffmpeg)", a.run.length === 1 && a.api.durum().calisiyor === true, a.run.length);
  a.api.mogrtSec({ path: "/x.mogrt" });
  a.dom["cap-mogrt-onizleme"].hidden = false;   // mogrtStiliniSec → onizlemeCiz şablon görselini açar
  a.run[0].bitti();
  await bekle(5);
  var v = a.dom["cap-render-onizleme"];
  ok("çizim bitmeden MOGRT seçildi: eski efekt videosu şablon önizlemesinin üstüne çıkmaz", v.hidden === true && v.src === "" &&
    a.dom["cap-mogrt-onizleme"].hidden === false && a.dom["cap-onizleme-not"].textContent.indexOf("seçili ayarlarla") === -1, v.src);
  ok("atılan çizimin çıktısı silinir, DOM yedeğine düşülmez, bayrak iner", a.silinen.some(function (p) { return /preview-.*\.webm$/.test(p); }) &&
    a.domYedegi() === 0 && a.api.durum().calisiyor === false && a.api.durum().renderYol === null, a.silinen.join(" | "));

  /* ---- 2) çizim sürerken stil kodu uygulandı ---- */
  var b = ortam();
  b.api.tazele(true);
  await bekle(5);
  var yeniStil = Object.assign({}, b.durum.stil, { font: "Anton", giris: "pop", aktif: "zipla", kalin: false });
  b.api.kodUygula(yeniStil);
  await bekle(5);
  ok("çizim sürerken kod uygulandı: ikinci ffmpeg ilki bitmeden başlamaz, yeni çizim sıraya girer", b.run.length === 1 && b.api.durum().tekrar === true &&
    b.api.durum().calisiyor === true);
  b.run[0].bitti();
  await bekle(5);
  ok("ilk (eski görünüm) çizim gösterilmez; kodun görünümü yeniden çizilir", b.run.length === 2 && b.dom["cap-render-onizleme"].src === "", b.run.length);
  b.run[1].bitti();
  await bekle(5);
  var cikti2 = b.run[1].args[b.run[1].args.length - 1];
  ok("ikinci çizim gösterilir: 'seçili ayarlarla' gerçekten seçili ayar", b.dom["cap-render-onizleme"].hidden === false &&
    b.dom["cap-render-onizleme"].src.indexOf(cikti2) !== -1 && /seçili ayarlarla/.test(b.dom["cap-onizleme-not"].textContent), b.dom["cap-render-onizleme"].src);
  ok("her çizim kendi klasöründe (ASS, font): biri ötekinin fontunu silemez", b.run[0].cwd !== b.run[1].cwd &&
    b.run[0].fontlar.every(function (f) { return f.indexOf(b.run[0].cwd) === 0; }) && b.run[1].fontlar.every(function (f) { return f.indexOf(b.run[1].cwd) === 0; }),
    b.run.map(function (r) { return r.cwd; }).join(" | "));
  ok("önizleme katmanla aynı fontu kullanır: Anton; kalın kapalı Montserrat'ta Regular", b.run[1].fontlar.map(function (f) { return path.basename(f); }).join() === "Anton.ttf");
  ok("çizim bitince iş klasörü temizlenir (ASS ve font kopyası kalmaz)", Object.keys(b.dosyalar).filter(function (k) { return /[\\/]is-/.test(k); }).length === 0,
    Object.keys(b.dosyalar).join(" | "));
  var c = ortam();
  c.durum.stil.kalin = false;
  c.api.tazele(true);
  await bekle(5);
  ok("kalın kapalı Montserrat önizlemesi Montserrat-Regular.ttf ile çizilir", c.run[0].fontlar.map(function (f) { return path.basename(f); }).join() === "Montserrat-Regular.ttf",
    c.run[0].fontlar.join());

  /* ---- 3) Durdur çizimi keser ama ikinci ffmpeg'e yol açmaz ---- */
  var d = ortam();
  d.api.oynat();
  await bekle(5);
  d.api.oynat();   // Durdur
  d.api.tazele(true);   // hemen ardından ayar değişti
  await bekle(5);
  ok("Durdur'dan sonra gelen ayar değişikliği süren çizimin bitmesini bekler (eşzamanlı iki ffmpeg yok)", d.run.length === 1 && d.api.durum().tekrar === true);
  d.run[0].bitti();
  await bekle(5);
  ok("durdurulan çizim gösterilmez, sıradaki çizim başlar", d.dom["cap-render-onizleme"].src === "" && d.run.length === 2);

  /* ---- 4) stil kodu uygulama süren çizimi "Durdur" saymaz ---- */
  var sk = govde("function stilKoduUygula(");
  ok("stilKoduUygula önizlemeyi efektOnizlemeTazele(true) ile ister (onizlemeOynat değil)", /efektOnizlemeTazele\(true\);\s*return true;/.test(sk) && sk.indexOf("onizlemeOynat()") === -1);

  console.log("\n" + gecen + "/" + toplam + " geçti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL beklenmeyen hata: " + (e && e.stack)); process.exit(1); });
