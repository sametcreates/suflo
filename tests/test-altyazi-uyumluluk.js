// Suflo testi: altyazı yenilemesinin (parti 1-9) geriye uyumluluk denetimi.
// Fikstürler (tests/fixtures/altyazi-eski/) yenilemeden ÖNCEKİ kodla (git 5d153e7) üretildi: uret.js eski panelin GERÇEK
// işlevlerini (tests/_altyazi-panel.js) ve eski stil motorunu kullandı. Burada aynı eserler BUGÜNKÜ panele yüklenir:
//  - SFL1 kodları (ilk altı görünüm, gölge / kutu / serbest konum / metin / yazar, 3.2 kimlikli neon / mrbeast), .suflo-stil
//    dosyası, Marka Kiti JSON'u, ★ Şablonum, altyazı tercihleri (savePrefs biçimi), yarım Shorts paketi işi
//  - görünür ayarlar, seçim ve stil motoruna giden ince ayar eskisiyle aynı (yeni alanlar yalnız nötr değerle)
//  - ASS çıktısı eski motorunkiyle bayt bayt aynı; tek istisna parti 1'in bilinçli efekt değişikliği (satır sayısı üst
//    sınır, dengeli kartlar): AÇIK anahtar listesi; orada da başlık / stiller, zaman aralığı ve kelime sırası aynı
//  - bugünkü panelin ürettiği kodlar ESKİ çözücüde (style-share-5d153e7.js) ok:true çözülür ve klasik yedeği gösterir
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var FX = path.join(__dirname, "fixtures", "altyazi-eski");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 400) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
function oku(ad) { return JSON.parse(fs.readFileSync(path.join(FX, ad), "utf8")); }
function kopya(o) { return JSON.parse(JSON.stringify(o)); }

var A = oku("artefaktlar.json"), ESKI_ASS = oku("ass-eski.json");
var ORTAK = require(path.join(FX, "ortak.js"));
var P = require(path.join(__dirname, "_altyazi-panel.js"));
var Y = P.kur(KOK);
var SE = Y.SE, AE = Y.AE, YA = Y.YA;
var ESKI_SS = require(path.join(FX, "style-share-5d153e7.js"));
var PL = require(path.join(KOK, "js", "shorts-paket-plan.js"));

// Eski panelde olmayan, bugün ince ayara eklenen alanlar ve nötr (eski çıktıyı değiştirmeyen) değerleri
var YENI_ALANLAR = { anim: [undefined, ""], vurguKutuRenk: [undefined, null, ""], vurguRenk2: [undefined, null, ""] };

/*
 * Parti 1'in BİLİNÇLİ efekt değişikliği (Altyazı Efektleri, "satır sayısı üst sınır" ve dengeli kart): sığan kısa
 * kart bölünmez, uzun metin kartları dengelenir. Bu anahtarlarda ASS farklıdır; başka hiçbir anahtar farklı olamaz.
 * Biçim: eser adı → farklı olan kadraj:metin listesi. Eski kimlikli (neon / glitch tabanlı) görünümler etkilenmez.
 */
var UZUN_UC = ["16x9:uzun", "9x16:uzun", "1x1:uzun"];
var KISA_YATAY = ["16x9:vurgu"];
var BEKLENEN_FARK = {
  "kod:temiz": KISA_YATAY.concat(UZUN_UC), "kod:vurucu": KISA_YATAY.concat(UZUN_UC), "kod:canli": KISA_YATAY.concat(UZUN_UC),
  "kod:zarif": KISA_YATAY.concat(UZUN_UC), "kod:kutulu": KISA_YATAY.concat(UZUN_UC), "kod:glitch": [],
  "kod:temiz+golge": KISA_YATAY.concat(UZUN_UC), "kod:vurucu+kutu": KISA_YATAY.concat(UZUN_UC),
  "kod:zarif+serbest": KISA_YATAY.concat(UZUN_UC), "kod:glitch+italik": [],
  // tek kelimelik kart (k1) + BÜYÜK HARF: dikey ve kare kadrajda da kısa kart artık bölünmez
  "kod:canli+metin+yazar": ["16x9:vurgu", "9x16:vurgu", "1x1:vurgu"].concat(UZUN_UC),
  "kod:neon (3.2)": ["9x16:uzun", "1x1:uzun"], "kod:mrbeast (3.2)": KISA_YATAY.concat(UZUN_UC),
  "suflo-stil": KISA_YATAY.concat(UZUN_UC),
  "kit:temiz": KISA_YATAY.concat(UZUN_UC), "kit:vurucu": KISA_YATAY.concat(UZUN_UC), // Marka Kiti (Lora, kutu, gölge, serbest konum): canlı'nın iri puntosu dikey / karede de tek satıra sığmazdı, eski motor
  // kartı küçültüyordu; bugün taban puntoda iki satır. Glitch'in uzun metni kitin kutusuyla dengeli kartlara bölünür
  "kit:canli": ["16x9:vurgu", "9x16:vurgu", "1x1:vurgu"].concat(UZUN_UC),
  "kit:zarif": KISA_YATAY.concat(UZUN_UC), "kit:kutulu": KISA_YATAY.concat(UZUN_UC), "kit:glitch": ["9x16:uzun", "1x1:uzun"],
  "sablonum": [],
  "prefs:canli": KISA_YATAY.concat(UZUN_UC), "prefs:kutulu": KISA_YATAY.concat(UZUN_UC), "prefs:hormozi (3.2)": KISA_YATAY.concat(UZUN_UC)
};

function ovKarsilastir(eski, yeni) {
  var sorun = [];
  Object.keys(eski).forEach(function (k) { if (J(eski[k]) !== J(yeni[k])) sorun.push(k + ": " + J(eski[k]) + " → " + J(yeni[k])); });
  Object.keys(yeni).forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(eski, k)) return;
    if (!YENI_ALANLAR[k] || YENI_ALANLAR[k].indexOf(yeni[k]) === -1) sorun.push("yeni alan " + k + "=" + J(yeni[k]));
  });
  return sorun;
}
function gorunurKarsilastir(eski, yeni) {
  return Object.keys(eski).filter(function (k) { return eski[k] !== yeni[k]; }).map(function (k) { return k + ": " + eski[k] + " → " + yeni[k]; });
}

var farkSayisi = 0, ayniSayisi = 0;
// Bir eserin bugünkü paneldeki durumu eskisiyle aynı mı + ASS'leri (her kadraj × metin)
function denetle(anahtar, beklenen, e) {
  var st = e.api.stil(), ov = e.api.motorAyarlari(st), d = e.api.durum();
  var g = gorunurKarsilastir(beklenen.gorunur, e.gorunur());
  ok(anahtar + ": görünür ayarlar aynı", g.length === 0, g.join("; "));
  ok(anahtar + ": seçim (stil, görünüm, son görünüm, yazar) aynı", J(d) === J(beklenen.durum), J(d) + " ≠ " + J(beklenen.durum));
  var s = ovKarsilastir(beklenen.ov, ov);
  ok(anahtar + ": stil motoruna giden ince ayar aynı (yeni alanlar nötr)", s.length === 0, s.join("; "));
  ok(anahtar + ": yeni panelde Animasyon Klasik", !e.dom["cap-efekt-anim"] || e.dom["cap-efekt-anim"].value === "");
  if (!beklenen.stilId) return;
  var izinli = BEKLENEN_FARK[anahtar];
  ok(anahtar + ": beklenen fark listesi açıkça yazılı", izinli instanceof Array);
  var beklenmeyen = [], bozuk = [], gercekFark = [], dilFarki = [];
  ORTAK.KADRAJLAR.forEach(function (k) {
    Object.keys(ORTAK.METINLER).forEach(function (m) {
      var tam = anahtar + "@" + k.ad + ":" + m;
      var eskiOz = ESKI_ASS[tam];
      var yeni = ORTAK.ozet(SE.compile({ styleId: d.motor, intensity: st.yogunluk, cueKind: "words", cues: ORTAK.METINLER[m], width: k.w, height: k.h, overrides: kopya(ov) }).ass);
      // panel bugün kırılım dilini de verir (kirilimDili: Türkçe); bu örneklerde Türkçe-duyarlı kırılım ek fark üretmez
      var yeniTr = ORTAK.ozet(SE.compile({ styleId: d.motor, intensity: st.yogunluk, cueKind: "words", cues: ORTAK.METINLER[m], width: k.w, height: k.h, overrides: kopya(ov), dil: "tr" }).ass);
      if (yeniTr.sha !== yeni.sha) dilFarki.push(tam);
      if (!eskiOz) { beklenmeyen.push(tam + " (fikstürde yok)"); return; }
      if (yeni.sha === eskiOz.sha) { ayniSayisi++; return; }
      farkSayisi++;
      gercekFark.push(k.ad + ":" + m);
      if (!izinli || izinli.indexOf(k.ad + ":" + m) === -1) beklenmeyen.push(tam);
      // bilinçli fark: başlık + stiller, zaman aralığı ve okunan kelime sırası aynı; yalnız kart / satır kırılımı değişir
      if (yeni.bas !== eskiOz.bas || J(yeni.zaman) !== J(eskiOz.zaman) || yeni.kartlar.join(" ") !== eskiOz.kartlar.join(" ")) bozuk.push(tam);
    });
  });
  ok(anahtar + ": ASS eski motorla bayt bayt aynı (parti 1 efekt farkları hariç)", beklenmeyen.length === 0, beklenmeyen.join(", "));
  ok(anahtar + ": panelin kırılım dili (tr) verilince de aynı çıktı", dilFarki.length === 0, dilFarki.join(", "));
  ok(anahtar + ": bilinçli farklarda başlık / stiller, zaman ve kelime sırası aynı", bozuk.length === 0, bozuk.join(", "));
  ok(anahtar + ": fark listesi güncel (artık aynı olan anahtar listede kalmasın)", J((izinli || []).slice().sort()) === J(gercekFark.slice().sort()),
    J(gercekFark));
}

/* ---------------- 1) SFL1 kodları ---------------- */
A.kodlar.forEach(function (k) {
  var e = Y.ortam();
  var sonuc = e.api.stilKoduUygula(k.kod);
  ok("kod:" + k.ad + ": bugünkü panelde uygulanır", sonuc === true && k.ok === true);
  ok("kod:" + k.ad + ": bildirimler aynı (eski kimlikte en yakın görünüm uyarısı dahil)", J(e.toastlar) === J(k.beklenen.toastlar), J(e.toastlar));
  denetle("kod:" + k.ad, k.beklenen, e);
  // bugünkü panelden yeniden paylaşılan kod eski panelin koduyla aynı (eski kimlikli kodlar efekt'e taşınmış olur)
  var yeniKod = e.api.stilKodu().kod;
  var eskiYeniden = ESKI_SS.decode(yeniKod, function (id) { return A.eskiStiller.indexOf(id) !== -1; });
  ok("kod:" + k.ad + ": yeniden paylaşılan kod eski çözücüde uyarısız çözülür", eskiYeniden.ok && eskiYeniden.warnings.length === 0, J(eskiYeniden.warnings));
  ok("kod:" + k.ad + ": yeniden paylaşılan kod eski panelin yeniden paylaştığıyla bayt bayt aynı", yeniKod === k.yenidenKod);
});

/* ---------------- 2) .suflo-stil dosyası ---------------- */
var dosya = fs.readFileSync(path.join(FX, A.sufloStil.dosya), "utf8");
var es = Y.ortam();
ok(".suflo-stil (kod + bağlantı) bugünkü panelde uygulanır", es.api.stilKoduUygula(dosya) === true);
denetle("suflo-stil", A.sufloStil.beklenen, es);

/* ---------------- 3) Marka Kiti ---------------- */
var kit = oku(A.markaKiti.dosya);
var MK = Y.MK;
var kitN = MK.normalize(kopya(kit));
ok("Marka Kiti JSON'u bugünkü normalize'da uyarısız ve aynı", kitN.warnings.length === 0 && J(kitN.kit) === J(kit), J(kitN.warnings));
Object.keys(A.markaKiti.gorunumler).forEach(function (g) {
  var e = Y.ortam({ ayar: { markaKiti: kopya(kit) } });
  e.api.gorunumUygula(g);
  denetle("kit:" + g, A.markaKiti.gorunumler[g], e);
});

/* ---------------- 4) ★ Şablonum ---------------- */
var sab = oku(A.sablonum.dosya);
var esab = Y.ortam({ ayar: { userPreset: kopya(sab) } });
esab.api.gorunumleriCiz();
var sabCip = esab.dom["cap-efekt-gorunumler"].childNodes.filter(function (c) { return c.getAttribute("data-sablonum") === "1"; });
ok("★ Şablonum çipi eski kayıtla görünür", sabCip.length === 1);
esab.api.sablonumUygula();
denetle("sablonum", A.sablonum.beklenen, esab);

/* ---------------- 5) altyazı tercihleri (savePrefs biçimi) ---------------- */
var prefs = oku(A.capPrefs.dosya);
Object.keys(prefs).forEach(function (ad) {
  var e = Y.ortam({ ayar: { capPrefs: kopya(prefs[ad]) } });
  e.api.loadPrefs();
  denetle("prefs:" + ad, A.capPrefs.beklenen[ad], e);
  // bugünkü panel tercihi yeniden yazar, bir sonraki açılış aynı görünür ayarlarla gelir
  e.api.savePrefs();
  var e2 = Y.ortam({ ayar: { capPrefs: kopya(e.ayar.capPrefs) } });
  e2.api.loadPrefs();
  var g2 = gorunurKarsilastir(A.capPrefs.beklenen[ad].gorunur, e2.gorunur());
  ok("prefs:" + ad + ": bugünkü savePrefs → loadPrefs aynı görünür ayarlar", g2.length === 0, g2.join("; "));
});

/* ---------------- 6) yarım Shorts paketi ---------------- */
var sh = oku("shorts-is.json"), B = A.shorts;
var is = kopya(sh.is);
ok("Shorts işi: 'Devam et' görünür (devamEdilebilir aynı)", PL.devamEdilebilir(is) === B.devamEdilebilir && B.devamEdilebilir === true);
var dj = PL.resumeJob(kopya(is));
ok("Shorts işi: kaldığı adımdan sürer (sonraki adım aynı)", J(PL.nextStep(dj)) === J(B.sonraki), J(PL.nextStep(dj)));
var sn = PL.secimNormalize(kopya(sh.secim), null);
var snFark = Object.keys(B.secimNormalize).filter(function (k) { return J(sn[k]) !== J(B.secimNormalize[k]); });
ok("Shorts seçimi: eski alanlar aynı normalize edilir", snFark.length === 0, snFark.join(","));
var sa = PL.stilAyarlari(is.secim.stilId, null, true, is.secim.efekt, false);
var saFark = ovKarsilastir(B.stil.overrides, sa.overrides);
ok("Shorts stil ayarı (overrides, konum) aynı", saFark.length === 0 && sa.konum === B.stil.konum && sa.konumY === B.stil.konumY, saFark.join("; "));
var cc = PL.captionCues(sh.altyazi, { styleId: is.secim.stilId, lang: is.lang, kase: is.secim.efekt.kase, punct: is.secim.efekt.punct });
ok("Shorts altyazı cue'ları aynı", J(cc) === J(B.cues), J(cc).slice(0, 300));
var shAss = ORTAK.ozet(SE.compile({ styleId: is.secim.stilId, cueKind: cc.cueKind, cues: cc.cues, offset: 0, width: 1080, height: 1920, overrides: sa.overrides }).ass);
// Parti 1 farkı (açık): Vurucu'nun son kartı "ŞAŞIRDI BUGÜN" tek satıra sığmıyordu, eski motor bütün kartı küçültüyordu
// (fs 106); bugün taban puntoda (112) iki satıra bölünür. Başka hiçbir fark olmamalı
var SHORTS_FARK = true;
ok("Shorts altyazı katmanı: ASS farkı yalnız parti 1'in kart kırılımı (başlık, zaman, kelimeler aynı)", (shAss.sha !== B.ass.sha) === SHORTS_FARK &&
  shAss.bas === B.ass.bas && J(shAss.zaman) === J(B.ass.zaman) && J(shAss.kartlar) === J(B.ass.kartlar) && shAss.diyalog === B.ass.diyalog, J([shAss, B.ass]));

/* ---------------- 7) bugünkü panelin kodları ESKİ çözücüde ---------------- */
function eskiCoz(kod) { return ESKI_SS.decode(kod, function (id) { return A.eskiStiller.indexOf(id) !== -1; }); }
var hepsi = [], eksik = [];
AE.GORUNUMLER.forEach(function (g) {
  var e = Y.ortam();
  e.api.gorunumUygula(g.id);
  var kod = e.api.stilKodu().kod;
  var d = eskiCoz(kod);
  var anim = AE.gorunum(g.id).ayar.anim || "";
  var klasik = anim ? YA.klasik(anim) : { giris: g.ayar.giris, aktif: g.ayar.aktif };
  var tamam = d.ok && d.recipe.styleId === "efekt" && d.recipe.overrides.giris === klasik.giris && d.recipe.overrides.aktif === klasik.aktif &&
    !Object.prototype.hasOwnProperty.call(d.recipe.overrides, "anim") && d.warnings.every(function (w) { return w === "ek"; }) && (anim ? true : d.warnings.length === 0);
  hepsi.push(g.id);
  if (!tamam) eksik.push(g.id + " " + J([d.ok, d.warnings, d.recipe && d.recipe.overrides.giris, d.recipe && d.recipe.overrides.aktif, klasik]));
});
ok("bugünkü panelin " + hepsi.length + " hazır görünüm kodu eski çözücüde ok:true, styleId efekt, klasik yedek giriş / vurgu (animasyon 'ek'te, yalnız 'ek' uyarısı)",
  eksik.length === 0 && hepsi.length >= 30, eksik.join(" | "));
var animEksik = [];
YA.kimlikler().forEach(function (anim) {
  var e = Y.ortam();
  e.api.gorunumUygula("temiz");
  e.dom["cap-efekt-anim"].value = anim;
  var kod = e.api.stilKodu().kod;
  var d = eskiCoz(kod), k = YA.klasik(anim);
  if (!(d.ok && d.recipe.overrides.giris === k.giris && d.recipe.overrides.aktif === k.aktif && J(d.warnings) === J(["ek"]))) animEksik.push(anim + " " + J(d.warnings));
});
ok("her yazı animasyonu (" + YA.kimlikler().length + ") seçiliyken kod eski çözücüde klasik yedek çiftle açılır", animEksik.length === 0 && YA.kimlikler().length >= 24, animEksik.join(" | "));
// eski çözücünün gördüğü klasik yedek eski motorda çizilebilir (efekt kimliği, bilinen giriş / vurgu)
ok("eski stil kimlikleri listesi fikstürde (eski panelin izinli stilleri)", A.eskiStiller.indexOf("efekt") !== -1 && A.eskiStiller.indexOf("neon") !== -1);

ok("özet: aynı / bilinçli farklı ASS sayıları anlamlı", ayniSayisi > 50 && farkSayisi > 0, ayniSayisi + " / " + farkSayisi);
console.log("ASS: " + ayniSayisi + " bayt bayt aynı, " + farkSayisi + " parti 1 efekt farkı (açık listede)");
console.log("\n" + gecen + "/" + toplam + " geçti");
if (gecen !== toplam) process.exit(1);
