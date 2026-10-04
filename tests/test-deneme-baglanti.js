// Suflo testi: Pro'yu dene bağlantıları — 9 araç deneme kapısından geçer, hak yalnız
// başarı dalında düşer; kütüphaneler/MOGRT/toplu/ASS deneme almaz; filigran yalnız
// stilli katman ve kanca başlığında; temiz yeniden oluşturma KS_removeOverlay'e nodeId vermez.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var ayikla = require("./_ayikla.js");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8").replace(/\r\n/g, "\n"); }

// Adlı işlevin gövdesi (aynı girintideki bir sonraki işleve kadar)
function govde(src, imza) {
  var i = src.indexOf(imza);
  if (i === -1) return "";
  var sonrakiler = ["\n  async function ", "\n  function "].map(function (k) { return src.indexOf(k, i + imza.length); }).filter(function (x) { return x > 0; });
  return src.slice(i, sonrakiler.length ? Math.min.apply(null, sonrakiler) : src.length);
}

/* ---------------- 1) 9 araç: deneme kapısı + başarıda harcama ---------------- */
// [dosya, işlev imzası, özellik, başarı denetimi (harcamadan ÖNCE gelmeli), harcama bekleniyor mu]
var SITELER = [
  ["js/magiccut.js", "async function analyze()", "cut", null, false],
  ["js/magiccut.js", "async function apply()", "cut", "if (r.ok) {", true],
  ["js/konusma-kes.js", "async function analyze()", "textcut", null, false],
  ["js/konusma-kes.js", "async function apply()", "textcut", "if (res.ok) {", true],
  ["js/viral.js", "async function bul()", "highlights", "if (!bulunan.length) throw", true],
  ["js/ses.js", "async function iyilestir()", "audioclean", "if (!sonuclar.length) throw", true],
  ["js/kanca.js", "async function ekle(ek)", "overlay", "if (!yer.ok) throw", true],
  ["js/zoom.js", "async function calistir()", "zoom", "if (!result || !result.ok) throw", true],
  ["js/gecisler.js", "async function uygula(t, btn)", "transitions", "if (!r.ok) throw", true],
  ["js/beat.js", "async function analyze()", "beat", null, false],
  ["js/beat.js", "async function apply()", "beat", "if (!r.ok) throw", true],
  ["js/beat.js", "async function bol()", "beat", "if (!r.ok) throw", true],
  ["js/captions.js", "async function translateAll()", "translate", "var out = await metinleriCevir(", true],
  ["js/captions.js", "async function cokDilliPaket()", "translate", "yazilan > 1 &&", true],
  ["js/captions.js", "async function overlayUygula()", "overlay", "if (!yer.ok) throw", true]
];
var kapiliOzellikler = {};
SITELER.forEach(function (s) {
  var g = govde(oku(s[0]), s[1]);
  var ad = s[0].replace("js/", "") + " " + s[1].replace(/^async function /, "");
  if (!g) { ok(ad + ": işlev bulundu", false); return; }
  if (s[1] !== "async function apply()" || s[0] !== "js/beat.js") {
    // beat.js apply (marker) kapısız: analiz zaten deneme kapısından geçti
    var kapi = new RegExp('Pro\\.gate\\("' + s[2] + '", \\{ deneme: true, yeniden: ');
    ok(ad + ": deneme: true + yeniden ile kapı", kapi.test(g), (g.match(/Pro\.gate\([^\n]*/) || [""])[0]);
    if (kapi.test(g)) kapiliOzellikler[s[2]] = true;
  }
  var harca = g.indexOf('Pro.denemeHarca("' + s[2] + '"');
  if (!s[4]) { ok(ad + ": analizde hak düşmez", harca === -1); return; }
  var basari = g.indexOf(s[3]);
  // dış try'ın catch'i (işlev gövdesi girintisi: 4 boşluk); içteki döngü/yardımcı catch'leri sayılmaz
  var hata = g.search(/\n    \} catch \(/);
  ok(ad + ": hak yalnız başarı denetiminden sonra düşer", basari > 0 && harca > basari && (hata === -1 || harca < hata), "basari " + basari + " harca " + harca + " catch " + hata);
});
var DOKUZ = ["cut", "textcut", "highlights", "zoom", "transitions", "audioclean", "overlay", "translate", "beat"];
ok("9 özelliğin hepsi deneme kapısında", DOKUZ.every(function (f) { return kapiliOzellikler[f]; }), Object.keys(kapiliOzellikler).join(","));
ok("deneme listesi deneme.js ile aynı", JSON.stringify(require(path.join(KOK, "js", "deneme.js")).OZELLIKLER) === JSON.stringify(DOKUZ));

/* ---------------- 2) deneme almayan kapılar ---------------- */
var jsDosyalari = fs.readdirSync(path.join(KOK, "js")).filter(function (f) { return /\.js$/.test(f); });
var yanlis = [], denemeli = [];
jsDosyalari.forEach(function (f) {
  // ham kaynak (özellik adı metin içinde); yorum satırları atlanır
  oku("js/" + f).split("\n").forEach(function (satir, i) {
    if (/^\s*(\/\/|\*|\/\*)/.test(satir)) return;
    var re = /Pro\.gate\("([A-Za-z]+)"([^)]*)/g, m;
    while ((m = re.exec(satir))) {
      if (/deneme/.test(m[2])) {
        denemeli.push(f + ":" + (i + 1) + " " + m[1]);
        if (DOKUZ.indexOf(m[1]) === -1) yanlis.push(f + ":" + (i + 1) + " " + m[1]);
      }
    }
  });
});
ok("tarama deneme kapılarını buluyor (15 kapı: 14 araç + rehberin stil adımı)", denemeli.length === 15, denemeli.join(" | "));
// Rehberin "Timeline'a koy"u Altyazı sekmesindeki "… ile ekle" ile aynı stilli katman denemesini sunar;
// MOGRT stili seçiliyse denemesiz kütüphane penceresi (inceleme bulgusu: Suflo Stili için de captionStyles açılıyordu)
var koy = govde(oku("js/onboarding.js"), "function stilKoyTikla()");
ok("onboarding stilKoyTikla: Suflo Stili için overlay denemesi, MOGRT için kütüphane", /Pro\.gate\("overlay", \{ deneme: true, yeniden: stilKoyTikla \}\)/.test(koy) &&
  /KCaptions\.mogrtSecili\(\)\) \{ Pro\.gate\("captionStyles"\); return; \}/.test(koy) && koy.indexOf("mogrtSecili") < koy.indexOf('Pro.gate("overlay"') &&
  koy.indexOf('Pro.gate("overlay"') < koy.indexOf("KCaptions.applyStyled()"), koy.slice(0, 300));
ok("kütüphane / MOGRT / toplu / ASS / Shorts paketi kapıları deneme almaz", yanlis.length === 0, yanlis.join(" | "));
["js/sahneler.js", "js/broll-ui.js", "js/library.js", "js/presets.js", "js/sfx.js", "js/motionbg.js", "js/emoji-assets.js", "js/library-health.js"].forEach(function (f) {
  ok(f + ": deneme hiç geçmez", !/deneme/.test(ayikla(oku(f))));
});
var cap = oku("js/captions.js");
ok("captions.js: MOGRT, toplu klip ve stilli ASS kapıları denemesiz", /Pro\.gate\("mogrt"\)/.test(cap) && /Pro\.gate\("batch"\)/.test(cap) && /Pro\.gate\("assexport"\)/.test(cap) &&
  !/Pro\.gate\("(mogrt|batch|assexport|captionStyles)",/.test(cap));

/* ---------------- 3) zoom kaldır kapısız, MOGRT sızıntısı kapalı ---------------- */
var zoom = oku("js/zoom.js");
ok("zoom.js kaldir(): kapı yok (deneme zoom'u her zaman geri alınır)", !/Pro\./.test(govde(zoom, "async function kaldir()")) && govde(zoom, "async function kaldir()").length > 50);
var ou = govde(cap, "async function overlayUygula()");
ok("overlayUygula: ücretsizde seçili MOGRT stilini reddeder", /if \(typeof Pro !== "undefined" && !Pro\.isPro\(\) && secilenMogrt\) \{[\s\S]{0,200}Deneme yalnız Suflo Stilleri için[\s\S]{0,200}return;/.test(ou) &&
  ou.indexOf("!Pro.isPro() && secilenMogrt") < ou.indexOf("mogrtStiliniUygula"));
ok("eski kelimeli animasyon: deneme kuruluyken düşürülmez", /!Pro\.isPro\(\) && !\(Pro\.denemeAcik && Pro\.denemeAcik\("overlay"\)\)\) anim = "fade"/.test(cap));
ok("terim sözlüğü ücretsiz (sessiz Pro atlaması yok)", !/Pro\./.test(govde(cap, "function applyGlossary(")));

/* ---------------- 4) filigran yalnız stilli katman ve kanca başlığında ---------------- */
var filigranKullanan = [];
jsDosyalari.forEach(function (f) { if (f !== "filigran.js" && /SufloFiligran\.ekle\(/.test(oku("js/" + f))) filigranKullanan.push(f); });
ok("SufloFiligran.ekle yalnız captions.js ve kanca.js'te", filigranKullanan.sort().join(",") === "captions.js,kanca.js", filigranKullanan.join(","));
ok("captions.js: filigran yalnız overlayUygula içinde, filigranGerekli'ye bağlı", (cap.match(/SufloFiligran\.ekle\(/g) || []).length === 1 && /SufloFiligran\.ekle\(/.test(ou) && /Pro\.filigranGerekli\(\)/.test(ou));
var kancaEkle = govde(oku("js/kanca.js"), "async function ekle(ek)");
ok("kanca.js: filigran yalnız ekle'de (önizleme temiz)", /SufloFiligran\.ekle\(/.test(kancaEkle) && /Pro\.filigranGerekli\(\)/.test(kancaEkle) && !/SufloFiligran/.test(govde(oku("js/kanca.js"), "async function onizle()")));
ok("deneme çıktısı kaydı: temiz ASS saklanır (stilli katman + kanca)", /assTemiz: assTemiz/.test(ou) && /denemeKaydet\(K, Pro,/.test(ou) && /assTemiz: built\.ass/.test(kancaEkle) && /denemeKaydet\(K, Pro,/.test(kancaEkle));
["exportFile", "async function apply(stilIle)"].forEach(function (imza) {
  var g = govde(cap, imza);
  ok("filigran " + imza + " yolunda yok (SRT/VTT/caption izi temiz)", !g || !/SufloFiligran/.test(g));
});

/* ---------------- 5) KS_removeOverlay asla nodeId almaz ---------------- */
var kaldirma = [];
jsDosyalari.forEach(function (f) {
  var src = oku("js/" + f), re = /K\.call\("KS_removeOverlay",([^)]*)\)/g, m;
  while ((m = re.exec(src))) kaldirma.push(f + ": " + m[1].trim());
});
ok("KS_removeOverlay yalnız {path} ile çağrılır", kaldirma.length >= 1 && kaldirma.every(function (c) { return /^\{ path: [^,}]+ \}/.test(c.split(": ").slice(1).join(": ")) && !/nodeId/.test(c); }), kaldirma.join(" | "));
var ortak = oku("js/overlay-render.js");
ok("temiz yeniden oluşturma: önce yerleştir, yalnız başarıda kaldır", ortak.indexOf('K.call("KS_placeOverlay"') < ortak.indexOf('K.call("KS_removeOverlay"') &&
  /if \(!yer \|\| !yer\.ok\) \{[\s\S]{0,120}return \{ ok: false/.test(ortak));
// İnceleme bulgusu: kullanıcının taşıdığı/kırptığı/böldüğü deneme katmanı ezilmesin
ok("temiz yeniden oluşturma: önce projede yerinde değiştir; yedek yol düzenlenmiş klibe dokunmaz",
  ortak.indexOf('K.call("KS_swapOverlayMedia"') > 0 && ortak.indexOf('K.call("KS_swapOverlayMedia"') < ortak.indexOf('K.call("KS_overlayInstances"') &&
  ortak.indexOf('K.call("KS_overlayInstances"') < ortak.indexOf('K.call("KS_placeOverlay"') &&
  /!ilkHalinde\(kayit, ornekler, d\.frame\)\) \{\s*return \{ ok: false, elle: true/.test(ortak));
var hostSrc = oku("jsx/host.jsx");
ok("host: KS_swapOverlayMedia ve KS_overlayInstances tanımlı", /function KS_swapOverlayMedia\(encoded\)/.test(hostSrc) && /function KS_overlayInstances\(encoded\)/.test(hostSrc));

/* ---------------- 6) yükleme sırası, eşzamanlı kapı ---------------- */
var html = oku("index.html");
function sira(f) { return html.indexOf('<script src="js/' + f + '"'); }
ok("deneme.js, pro.js'ten önce yüklenir", sira("deneme.js") > 0 && sira("deneme.js") < sira("pro.js"));
ok("filigran.js ve overlay-render.js, captions.js ve kanca.js'ten önce", sira("filigran.js") > 0 && sira("overlay-render.js") > 0 &&
  sira("filigran.js") < sira("captions.js") && sira("overlay-render.js") < sira("captions.js") && sira("overlay-render.js") < sira("kanca.js"));
var pro = ayikla(oku("js/pro.js"));
ok("pro.js: confirm yok, kapı senkron (async/await/Promise yok)", !/\bconfirm\(/.test(pro) && !/async function gate|function gate\([^)]*\)\s*\{[^}]*await/.test(pro));
ok("pro.js: 'Ücretsiz dene' tıklaması kurar, kapatır, eylemi setTimeout ile yeniden çalıştırır",
  /denemeBaslat\(feature\);\s*close\(\);[\s\S]{0,80}setTimeout\(function \(\) \{ o\.yeniden\(\); \}, 0\)/.test(oku("js/pro.js")));

/* ---------------- 7) Ayarlar: kalan haklar, temiz yeniden oluşturma, metin düzeltmeleri ---------------- */
function blok(src, id) {
  var i = src.indexOf('id="' + id + '"');
  if (i < 0) return "";
  var bas = src.lastIndexOf("<div", i), derinlik = 0, re = /<\/?div\b/g, m;
  re.lastIndex = bas;
  while ((m = re.exec(src))) { derinlik += m[0] === "<div" ? 1 : -1; if (derinlik === 0) return src.slice(bas, m.index + 6); }
  return "";
}
var kilitli = blok(html, "pro-locked-card"), etkin = blok(html, "pro-active-card");
ok("#pro-deneme-liste kilitli Pro kartının içinde", /id="pro-deneme-liste"/.test(kilitli) && /id="pro-deneme-kart"[^>]*hidden/.test(kilitli));
ok("temiz yeniden oluşturma kartı etkin Pro kartının içinde", /id="pro-temiz-kart"[^>]*hidden/.test(etkin) && /id="pro-temiz-liste"/.test(etkin) && /Deneme çıktılarını temiz yeniden oluştur/.test(etkin));
var app = oku("js/app.js");
var rp = govde(app, "function reflectPro()");
ok("reflectPro kalan hakları ve temiz kartını çizer", /denemeListesiniCiz\(s\)/.test(rp) && /temizKartiniCiz\(s\)/.test(rp));
ok("liste satırı 'ad kalan/hak' (Otomatik kesim 2/3), Pro'da gizli", /o\.kalan \+ "\/" \+ o\.hak/.test(govde(app, "function denemeListesiniCiz(")) && /kart\.hidden = !!s\.pro/.test(govde(app, "function denemeListesiniCiz(")));
var dt = govde(app, "async function denemeyiTemizle(");
ok("temiz yeniden oluşturma ortak modülle; başarıda kayıt silinir", /SufloOverlayRender\.temizYenidenOlustur\(K, k,/.test(dt) && dt.indexOf("Pro.denemeCiktisiSil(k.path)") > dt.indexOf("if (!r.ok)"));
ok("Pro tanıtım kartı düğmeleri denemeyi sunar (pro.js listede olmayanı süzer)", /Pro\.gate\(feature, \{ deneme: true, yeniden: function \(\) \{ denemeyeYonlendir\(feature\); \} \}\);/.test(app) &&
  /Dm\.listede\(feature\) && Number\(o\.kalan\) > 0/.test(oku("js/pro.js")));
// İnceleme bulgusu: kurulu deneme kapıyı sessizce geçirdiği için tanıtım düğmesi (satın alma yolu) ölü kalıyordu
var tanitimBas = app.indexOf('querySelectorAll(".pro-ac-btn, #yazi-proya-gec")');
var tanitimIsl = app.slice(tanitimBas, app.indexOf("var styleUpsell", tanitimBas));
ok("tanıtım düğmesi: deneme kuruluysa satın alma penceresi (deneme kapısı değil)",
  /if \(Pro\.denemeAcik && Pro\.denemeAcik\(feature\)\) \{ Pro\.gate\(feature\); return; \}/.test(tanitimIsl) &&
  tanitimIsl.indexOf("Pro.denemeAcik(feature)") < tanitimIsl.indexOf("deneme: true"), tanitimIsl.slice(0, 200));
var yonlendir = govde(app, "function denemeyeYonlendir(");
ok("tanıtımdan kurulan deneme aracın asıl düğmesini adıyla gösterir ('tekrar tıkla' demez)", /SufloDeneme\.tanitimIpucu\(feature\)/.test(yonlendir) &&
  /toast\(ip\.mesaj/.test(yonlendir) && /scrollIntoView/.test(yonlendir) && !/tekrar tıkla/.test(tanitimIsl + yonlendir));
ok("etkinleştirmeden sonra deneme çıktısı varsa bir kez hatırlatılır", /if \(Pro\.denemeCiktilari && Pro\.denemeCiktilari\(\)\.length\) \{\s*toast\("Deneme çıktılarını temiz yeniden oluştur/.test(app));
ok("Pro karşılaştırması: Sözlük yok, yeni araçlar var", !/Sözlük/.test(kilitli.split('class="pro-renk"')[1] || "") &&
  ["Konuşmadan kes", "viral puan", "Geçişler", "Suflo Stilleri timeline'da", "Kanca başlığı", "Sesi iyileştir", "Otomatik zoom", "Ritim", "12 dile çeviri"].every(function (x) { return kilitli.indexOf(x) !== -1; }));
ok("ücretsiz sütunu: kelime kelime altyazı ve terim sözlüğü", /<li>Kelime kelime altyazı · terim sözlüğü<\/li>/.test(kilitli));
ok("kanca başlığı tanıtımı 5 stil (seçicideki stil sayısı)", /<strong>5<\/strong> stil/.test(blok(html, "kanca-tanitim")) && html.match(/id="kanca-stil">[\s\S]*?<\/select>/)[0].match(/<option /g).length === 5);
ok("eski 'v1.7' ve 'ücretsiz altyazı paneli' yedekleri yok", !/v1\.7</.test(html) && !/ücretsiz altyazı paneli/.test(html));
ok("çeviri ipucu artık 'ücretsiz' demiyor", !/başka dile çevir \(ücretsiz/.test(html));

/* ---------------- 8) davranış: gecisler.js (sahte Pro) ---------------- */
function gecisCalistir(o) {
  var olay = {}, cagri = [], harcanan = [], toastlar = [], kapi = [];
  function e(id) {
    var x = { id: id, children: [], className: "", textContent: "", disabled: false, style: {}, innerHTML: "", _o: {} };
    x.appendChild = function (c) { x.children.push(c); return c; };
    x.addEventListener = function (t, fn) { x._o[t] = fn; };
    return x;
  }
  var dom = { "gecis-grid": e("gecis-grid"), "gecis-status": e("gecis-status"), "gecis-sure": e("s"), "gecis-guc": e("g"), "gecis-sayac": e("c") };
  dom["gecis-sure"].value = "0.5"; dom["gecis-guc"].value = "1";
  var ctx = {
    window: {}, document: { getElementById: function (id) { return dom[id] || null; }, createElement: function () { return e(""); } },
    K: { call: function (fn, a) { cagri.push(fn); return Promise.resolve(o.cevap); } },
    KApp: { toast: function (m, t) { toastlar.push([m, t]); } },
    Pro: {
      isPro: function () { return false; }, on: function () {},
      gate: function (f, op) { kapi.push([f, op]); return !!o.kurulu; },
      denemeHarca: function (f, bildir) { harcanan.push(f); bildir("1 deneme hakkı kullanıldı · 2 kaldı", "good"); return 2; }
    },
    Promise: Promise, Number: Number, String: String, Error: Error
  };
  ctx.window.SufloTransitions = require(path.join(KOK, "js", "transitions.js"));
  vm.createContext(ctx);
  vm.runInContext(oku("js/gecisler.js"), ctx);
  ctx.window.KGecis.init();
  var kart = dom["gecis-grid"].children[0], btn = kart.children[2];
  return Promise.resolve(btn._o.click()).then(function () { return new Promise(function (r) { setTimeout(r, 5); }); })
    .then(function () { return { cagri: cagri, harcanan: harcanan, toastlar: toastlar, kapi: kapi, durum: dom["gecis-status"].textContent }; });
}
Promise.resolve().then(function () {
  return gecisCalistir({ kurulu: false }).then(function (r) {
    ok("gecisler: kurulmamışken Premiere'e gidilmez, kapı deneme + yeniden ile çağrılır", r.cagri.length === 0 && r.kapi.length === 1 &&
      r.kapi[0][0] === "transitions" && r.kapi[0][1].deneme === true && typeof r.kapi[0][1].yeniden === "function" && r.harcanan.length === 0);
  });
}).then(function () {
  return gecisCalistir({ kurulu: true, cevap: { ok: false, error: "Playhead bir kesimde değil." } }).then(function (r) {
    ok("gecisler: Premiere hatasında hak düşmez", r.cagri.length === 1 && r.harcanan.length === 0 && /Playhead/.test(r.durum), JSON.stringify(r));
  });
}).then(function () {
  return gecisCalistir({ kurulu: true, cevap: { ok: true, track: 1, half: 0.25 } }).then(function (r) {
    ok("gecisler: başarıda tek hak düşer ve bildirilir", r.harcanan.join(",") === "transitions" &&
      r.toastlar.some(function (t) { return t[0] === "1 deneme hakkı kullanıldı · 2 kaldı"; }), JSON.stringify(r.toastlar));
  });
}).then(function () {
  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}).catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); process.exit(1); });
