// Suflo testi: animasyon motoru v2 — yazı animasyonları kataloğu ve stil motoru (yapısal; ffmpeg gerekmez).
//  - katalog (js/yazi-animasyonlari.js): kimlik, kategori, klasik çift, AE durumu, süre
//  - her animasyon × kadraj (16:9, 9:16 + güvenli, 1:1) × metin (1 kelime, 5 kelime, uzun kelime, *vurgu*):
//    derlenir, ASS'te NaN / undefined / Infinity yok, her Dialogue 10 alan ve başı < sonu, olaylar kart süresinde,
//    katman sırası (kutu < gölge < metin < hareket), süreler hareket şiddetiyle ölçeklenir, ışığa duyarlılık
//    (kelime başına saniyede en çok 3 belirme), kelime başına olay sayısı makul, son karede klasik durağan çıktı
//  - anim "" / yok / bilinmeyen: Altyazı Efektleri çıktısı değişiklik öncesiyle bayt bayt aynı (anlık görüntü)
//  - altyazi-efekt.js (normalize / overrides / görünüm / şablon indeksleri), ae-plan.js, Premiere yerel çıktı yedeği,
//    Shorts paketi
var fs = require("fs"), path = require("path");
var O = require("./_yazi-animasyon-ortak.js");
var KOK = O.KOK;
var YA = require(path.join(KOK, "js", "yazi-animasyonlari.js"));
var SE = require(path.join(KOK, "js", "style-engine.js"));
var AE = require(path.join(KOK, "js", "altyazi-efekt.js"));
var SS = require(path.join(KOK, "js", "style-share.js"));
var CMJ = require(path.join(KOK, "js", "caption-mogrt-json.js"));
var AP = require(path.join(KOK, "js", "ae-plan.js"));
var SPP = require(path.join(KOK, "js", "shorts-paket-plan.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }

/* ---------------- 1) katalog ---------------- */
var IDLER = YA.kimlikler();
var BEKLENEN = ["kelime-pop", "yukari-suzul", "daktilo", "harf-belir", "dalga", "zipla-gel", "netles", "olcek-darbe", "renk-gecis", "sallanma", "yandan-kay", "aralik-acil"];
ok("katalog: ilk 12 özgün animasyon", IDLER.length === 12 && BEKLENEN.every(function (id) { return IDLER.indexOf(id) !== -1; }), IDLER.join(","));
ok("katalog: kimlikler ascii kebab ve tekil", IDLER.every(function (id) { return /^[a-z]+(-[a-z]+)*$/.test(id); }) &&
  IDLER.filter(function (x, i) { return IDLER.indexOf(x) === i; }).length === IDLER.length);
var KAT = ["kart", "kelime", "harf", "karaoke", "surekli"];
ok("katalog: her kayıt tam (ad Türkçe, kategori, açıklama, klasik çift, ae, süre)", YA.ANIMASYONLAR.every(function (a) {
  return typeof a.ad === "string" && a.ad.length > 1 && KAT.indexOf(a.kategori) !== -1 && typeof a.aciklama === "string" && a.aciklama.length > 10 &&
    SE.GIRISLER.indexOf(a.klasik.giris) !== -1 && SE.AKTIFLER.indexOf(a.klasik.aktif) !== -1 && ["tam", "yakin", "yok"].indexOf(a.ae) !== -1 &&
    typeof a.sure === "number" && a.sure >= 80 && a.sure <= 1000;
}));
ok("katalog: kimlikler klasik giriş / vurgu kimlikleriyle çakışmaz; klasik listeler değişmedi (MOGRT sözleşmesi, site videoları)",
  IDLER.every(function (id) { return SE.GIRISLER.indexOf(id) === -1 && SE.AKTIFLER.indexOf(id) === -1; }) &&
  SE.GIRISLER.join(",") === "yok,pop,fade,yukari,asagi,zipla" && SE.AKTIFLER.join(",") === "yok,zipla,titre,glitch" &&
  SS.GIRISLER.join(",") === SE.GIRISLER.join(",") && AE.GIRISLER.length === 6 && AE.AKTIFLER.length === 4 &&
  SE.list().map(function (p) { return p.id; }).indexOf("kelime-pop") === -1);
ok("katalog: bul / dogrula / klasik / gruplar", YA.bul("netles").ad === "Netleş" && YA.bul("") === null && YA.bul("__proto__") === null &&
  YA.bul("toString") === null && YA.dogrula("dalga") === "dalga" && YA.dogrula("uzay") === "" && YA.dogrula(5) === "" &&
  J(YA.klasik("olcek-darbe")) === J({ giris: "yok", aktif: "zipla" }) && YA.klasik("") === null &&
  YA.gruplar().every(function (g) { return g.animasyonlar.length > 0; }) &&
  YA.gruplar().reduce(function (n, g) { return n + g.animasyonlar.length; }, 0) === 12);
ok("katalog: bul() kopya döner (değiştirmek kataloğu bozmaz)", (function () { var b = YA.bul("dalga"); b.klasik.giris = "pop"; b.sure = 1; return YA.bul("dalga").klasik.giris === "yukari" && YA.bul("dalga").sure === 420; })());

/* ---------------- 2) stil motoru doğrulaması ---------------- */
var tek = O.METINLER.bes;
function derle(ov, o) {
  o = o || {};
  return SE.compile({ styleId: "efekt", cues: o.cues || tek, cueKind: "words", width: o.w || 1920, height: o.h || 1080, intensity: o.intensity, overrides: ov });
}
ok("motor: katalogdaki her kimlik kabul (style.anim), bilinmeyen / tür dışı / __proto__ → \"\"", IDLER.every(function (id) { return derle({ anim: id }).style.anim === id; }) &&
  ["uzay", "", 5, null, {}, "__proto__", "constructor", "KELIME-POP", " kelime-pop"].every(function (v) { return derle({ anim: v }).style.anim === ""; }) &&
  SE.preset("efekt").style.anim === "");
ok("motor: eski stiller anim alanını yok sayar (çıktı aynı)", ["hormozi", "neon", "viral"].every(function (id) {
  return SE.compile({ styleId: id, cues: tek, cueKind: "words" }).ass === SE.compile({ styleId: id, cues: tek, cueKind: "words", overrides: { anim: "kelime-pop" } }).ass;
}));

// Değişiklik öncesi anlık görüntü: anim yok / "" / bilinmeyen → klasik çıktı bayt bayt aynı
var snap = JSON.parse(fs.readFileSync(path.join(__dirname, "yazi-animasyon-klasik-snapshot.json"), "utf8"));
[{}, { anim: "" }, { anim: "uzay" }, { anim: null }].forEach(function (ek) {
  var o = O.klasikOzetleri(SE, AE, ek), fark = Object.keys(snap).filter(function (k) { return snap[k] !== o[k]; });
  ok("klasik çıktı değişmedi (" + J(ek) + "): " + Object.keys(snap).length + " örnek, anahtarlar aynı",
    fark.length === 0 && J(Object.keys(o)) === J(Object.keys(snap)), fark.slice(0, 5).join(","));
});

/* ---------------- 3) her animasyon × kadraj × metin ---------------- */
function olaylar(ass) { return ass.split("\n").filter(function (l) { return /^Dialogue: /.test(l); }); }
function alanlar(l) {
  var g = l.slice("Dialogue: ".length), out = [];
  for (var i = 0; i < 9; i++) { var c = g.indexOf(","); out.push(g.slice(0, c)); g = g.slice(c + 1); }
  out.push(g);
  return out;
}
function sn(tc) { var p = tc.split(":"); return Number(p[0]) * 3600 + Number(p[1]) * 60 + Number(p[2]); }
function olay(l) { var a = alanlar(l); return { katman: Number(a[0]), bas: sn(a[1]), son: sn(a[2]), stil: a[3], metin: a[9], alan: a.length, ham: l }; }

/*
 * Kelimelerin görünürlüğü: olayın metninde \t(...) dışındaki son \alpha'ya göre her kelimenin (boşluk / \N ile ayrılmış)
 * herhangi bir harfi saydam değilse görünür. Döner: [bool] (kelime sırası)
 */
function gorunurler(metin) {
  var out = [], w = 0, alfa = "00", i = 0;
  while (i < metin.length) {
    if (metin[i] === "{") {
      var j = metin.indexOf("}", i), blok = metin.slice(i + 1, j).replace(/\\t\([^)]*\)/g, "");
      var m, re = /\\alpha&H([0-9A-F]{2})&/g;
      while ((m = re.exec(blok))) alfa = m[1];
      i = j + 1; continue;
    }
    if (metin[i] === " ") { w++; i++; continue; }
    if (metin[i] === "\\" && metin[i + 1] === "N") { w++; i += 2; continue; }
    if (alfa !== "FF") out[w] = true; else if (out[w] === undefined) out[w] = false;
    i++;
  }
  return out;
}
function tSayilari(metin) {
  var n = 0, m, re = /\\t\((\d+),(\d+)/g;
  while ((m = re.exec(metin))) n += Number(m[2]);
  re = /\\move\(-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+,\d+,(\d+)\)/g;
  while ((m = re.exec(metin))) n += Number(m[1]);
  re = /\\fade\(\d+,\d+,\d+,\d+,(\d+)/g;
  while ((m = re.exec(metin))) n += Number(m[1]);
  return n;
}

var sorun = { derle: [], sayi: [], alan: [], zaman: [], kart: [], katman: [], isik: [], olaySay: [], son: [] };
var KATMANLAR_SADE = [1, 2], KATMANLAR_TAM = [0, 1, 3, 4];
IDLER.forEach(function (id) {
  O.KADRAJLAR.forEach(function (k) {
    Object.keys(O.METINLER).forEach(function (mAd) {
      [false, true].forEach(function (zengin) {
        var anahtar = id + "@" + k.ad + ":" + mAd + (zengin ? "+gölge+kutu" : "");
        var ov = AE.overrides(Object.assign({}, AE.gorunum(zengin ? "zarif" : "temiz").ayar, { anim: id }));
        ov.guvenli = k.guvenli;
        if (zengin) { ov.kutu = true; ov.kutuOpak = 60; }
        var cues = O.METINLER[mAd], r;
        try { r = SE.compile({ styleId: "efekt", cues: cues, cueKind: "words", width: k.w, height: k.h, overrides: ov }); }
        catch (e) { sorun.derle.push(anahtar + " " + e.message); return; }
        if (/NaN|undefined|Infinity/.test(r.ass)) sorun.sayi.push(anahtar);
        var ev = olaylar(r.ass).map(olay);
        ev.forEach(function (e) {
          if (e.alan !== 10) sorun.alan.push(anahtar);
          if (!(e.bas < e.son)) sorun.zaman.push(anahtar + " " + e.ham.slice(0, 60));
        });
        // Kart süresi: önizleme / yerel çıktının kartları (efektSatirlari aynı kurar)
        var kartlar = SE.efektSatirlari({ cues: cues, cueKind: "words" }, ov, { width: k.w, height: k.h }).map(function (kt) {
          return { bas: kt.kelimeler[0].start, son: kt.kelimeler[kt.kelimeler.length - 1].end };
        });
        ev.forEach(function (e) {
          if (!kartlar.some(function (kt) { return e.bas >= kt.bas - 0.006 && e.son <= kt.son + 0.006; })) sorun.kart.push(anahtar + " " + e.bas + "-" + e.son);
        });
        // Katmanlar: sade 1 (taban) / 2 (hareket); gölge + kutu: 0 kutu, 1 gölge, 3 taban, 4 hareket
        var izinli = zengin ? KATMANLAR_TAM : KATMANLAR_SADE;
        ev.forEach(function (e) {
          if (izinli.indexOf(e.katman) === -1) sorun.katman.push(anahtar + " katman " + e.katman);
          if (e.stil === "SufloKutu" && e.katman !== 0) sorun.katman.push(anahtar + " kutu katmanı " + e.katman);
          if (zengin && e.stil === "Suflo" && e.katman === 0) sorun.katman.push(anahtar + " metin kutu katmanında");
        });
        // Metin olayları (gölge ve kutu hariç): kelime başına 8'den az
        var metinOlay = ev.filter(function (e) { return e.stil === "Suflo" && (zengin ? e.katman >= 3 : true); });
        if (metinOlay.length > 8 * cues.length) sorun.olaySay.push(anahtar + " " + metinOlay.length + " olay / " + cues.length + " kelime");
        // Işığa duyarlılık: her kelime için 10 ms'lik örneklerde görünür → görünmez → görünür geçişi; 1 sn'de en çok 3 belirme
        if (!zengin) {
          var bas = Math.min.apply(null, ev.map(function (e) { return e.bas; })), son = Math.max.apply(null, ev.map(function (e) { return e.son; }));
          var gorus = ev.map(function (e) { return { e: e, g: gorunurler(e.metin) }; });
          for (var w = 0; w < cues.length; w++) {
            var onceki = false, belirmeler = [];
            for (var t = bas; t < son; t += 0.01) {
              var simdi = gorus.some(function (x) { return t >= x.e.bas - 1e-9 && t < x.e.son - 1e-9 && x.g[w]; });
              if (simdi && !onceki) belirmeler.push(t);
              onceki = simdi;
            }
            for (var b = 0; b < belirmeler.length; b++) {
              var pencere = belirmeler.filter(function (x) { return x >= belirmeler[b] && x < belirmeler[b] + 1; }).length;
              if (pencere > 3) { sorun.isik.push(anahtar + " kelime " + w + ": " + pencere + " belirme / sn"); break; }
            }
          }
        }
        // Son kare: kartın son 10 ms'sinde süren olayların metni klasik durağan çıktınınkiyle aynı (renk geçişi \t taşır: render testi)
        if (id !== "renk-gecis") {
          var dov = Object.assign({}, ov, { anim: "", giris: "yok", aktif: "yok" });
          var duragan = olaylar(SE.compile({ styleId: "efekt", cues: cues, cueKind: "words", width: k.w, height: k.h, overrides: dov }).ass).map(olay);
          kartlar.forEach(function (kt) {
            var t = kt.son - 0.01;
            function anlik(liste) { return liste.filter(function (e) { return t >= e.bas && t < e.son; }).map(function (e) { return e.katman + "|" + e.stil + "|" + e.metin; }).sort().join("\n"); }
            if (anlik(ev) !== anlik(duragan)) sorun.son.push(anahtar + " t=" + t.toFixed(2) + " " + anlik(ev).slice(0, 160) + " ≠ " + anlik(duragan).slice(0, 160));
          });
        }
      });
    });
  });
});
var ornekSay = IDLER.length * O.KADRAJLAR.length * Object.keys(O.METINLER).length * 2;
ok("her animasyon × kadraj × metin derlenir (" + ornekSay + " örnek, gölge + kutu dahil)", sorun.derle.length === 0, sorun.derle.slice(0, 3).join(" | "));
ok("ASS'te NaN / undefined / Infinity yok", sorun.sayi.length === 0, sorun.sayi.slice(0, 5).join(","));
ok("her Dialogue 10 alan ve başı < sonu", sorun.alan.length === 0 && sorun.zaman.length === 0, sorun.alan.concat(sorun.zaman).slice(0, 3).join(" | "));
ok("olaylar kendi kartının süresinde", sorun.kart.length === 0, sorun.kart.slice(0, 4).join(" | "));
ok("katman sırası: kutu 0 < gölge 1 < taban metin < hareketli kelime; sade: taban 1, hareket 2", sorun.katman.length === 0, sorun.katman.slice(0, 4).join(" | "));
ok("kelime başına 8'den az metin olayı", sorun.olaySay.length === 0, sorun.olaySay.slice(0, 4).join(" | "));
ok("ışığa duyarlılık: hiçbir kelime saniyede 3'ten çok belirmez", sorun.isik.length === 0, sorun.isik.slice(0, 4).join(" | "));
ok("son kare: hareket bitince olaylar klasik durağan çıktıyla (giriş yok, vurgu yok) aynı", sorun.son.length === 0, sorun.son.slice(0, 2).join(" || "));

// Hareket şiddeti: Yumuşak > Dengeli > Sert (\t / \move / \fade süreleri toplamı); uzun kelimelerle (daktilo üst sınırı)
var yavas = O.kelimeler(["Bunu", "gören", "herkes", "şaşırdı"], 1.3, 1.2);
var siddetSorun = [];
IDLER.forEach(function (id) {
  var m = ["soft", "balanced", "hard"].map(function (s) {
    return olaylar(derle({ anim: id }, { cues: yavas, intensity: s }).ass).reduce(function (n, l) { return n + tSayilari(olay(l).metin); }, 0);
  });
  if (!(m[0] > m[1] && m[1] > m[2] && m[2] > 0)) siddetSorun.push(id + " " + J(m));
});
ok("süreler hareket şiddetiyle ölçeklenir (Yumuşak > Dengeli > Sert), her animasyonda", siddetSorun.length === 0, siddetSorun.join(" | "));

/* ---------------- 4) animasyonların kendisi ---------------- */
function ass(id, o) { return derle(Object.assign({ anim: id }, (o && o.ov) || {}), o).ass; }
var pop = ass("kelime-pop");
ok("kelime-pop: kelime %0 → %115 → %100 (~220 ms), üst katmanda; ölçek yalnız kelimeye satır içi, satır yüksekliği \\move ile dengelenir",
  /\{\\fscx0\\fscy0\\t\(0,\d+,\\fscx[\d.]+\\fscy[\d.]+\)\}Bunu\{\\fscx100\\fscy100\}/.test(pop) && /\\t\(0,\d+,\\fscx115\\fscy115\)\}Bunu/.test(pop) &&
  /\{\\fscx115\\fscy115\\t\(0,(80|90|100),\\fscx100\\fscy100\)\}Bunu/.test(pop) && /^Dialogue: 2,[^\n]*\\move\(960,913,960,907,0,90\)/m.test(pop) &&
  !/^Dialogue: 2,[^\n]*\\shad0\\fscx/m.test(pop), (pop.match(/\\fscx[^}]*/g) || []).slice(0, 3).join(" "));
var suz = ass("yukari-suzul");
ok("yukari-suzul: scaled(28) aşağıdan yukarı, saydamdan; kendi başında", /\\move\(960,935,960,913,0,140\)\\fade\(255,51,51,0,140,140,140\)/.test(suz) || /\\move\(\d+,935,/.test(suz), (suz.match(/\\move\([^)]*\)/) || [""])[0]);
var dak = ass("daktilo");
ok("daktilo: harfler kelimenin söylenişi içinde tek tek (\\t(x,x,\\alpha&H00&)), bir kez", /\{\\alpha&HFF&\\t\((\d+),\1,\\alpha&H00&\)\}/.test(dak));
var hb = ass("harf-belir");
var hbT = (hb.match(/\\t\((\d+),(\d+),\\alpha&H00&\)/g) || []).map(function (x) { return Number(/,(\d+),/.exec(x)[1]); });
ok("harf-belir: harfler kartın ilk 350 ms'sinde sırayla belirir", hbT.length >= 20 && Math.max.apply(null, hbT) <= 350 && hbT[0] < hbT[hbT.length - 1], hbT.slice(-3).join(","));
var dal = ass("dalga"), dalBas = olaylar(dal).filter(function (l) { return /^Dialogue: 2,/.test(l); }).map(function (l) { return olay(l).bas; });
ok("dalga: kelimeler kart başında 60 ms arayla, dikey salınımla girer", dalBas.indexOf(0.2) !== -1 && dalBas.indexOf(0.26) !== -1 && dalBas.indexOf(0.32) !== -1 && /\\move\(960,943,960,/.test(dal), dalBas.slice(0, 6).join(","));
var zg = ass("zipla-gel");
ok("zipla-gel: yukarıdan düşer, aşağı taşar, geri sekip oturur", /\\move\(960,847,960,/.test(zg) && /\\move\(960,917,960,903,/.test(zg), (zg.match(/\\move\([^)]*\)/g) || []).slice(0, 4).join(" "));
var net = ass("netles");
ok("netles: kart bulanıklık 10 → 0 ve saydamdan", /\\fade\(255,\d+,\d+,0,\d+,\d+,\d+\)\\blur10\\t\(0,\d+,\\blur[\d.]+\)/.test(net) && /\\blur[\d.]+\\t\(0,\d+,\\blur0\)/.test(net));
var od = ass("olcek-darbe");
ok("olcek-darbe: etkin kelime %100 → %122 → %100, 180 ms", /\\fscx100\\fscy100\\t\(0,80,\\fscx122\\fscy122\)/.test(od) && /\\fscx122\\fscy122\\t\(0,100,\\fscx100\\fscy100\)/.test(od));
var rg = ass("renk-gecis");
ok("renk-gecis: etkin kelime 120 ms'de vurgu rengine, kelime bitince geri", /\{\\1c&H00FFFFFF&?\\t\(0,120,\\1c&H003FD2FF\)\}/.test(rg) && /\{\\1c&H003FD2FF\\t\(0,120,\\1c&H00FFFFFF\)\}/.test(rg));
var sal = ass("sallanma");
ok("sallanma: ±5° iki kez, \\org kelimenin ortasında", /\\org\(\d+,\d+\)\\frz0\\t\(0,40,\\frz5\)\\t\(40,120,\\frz-5\)\\t\(120,200,\\frz5\)\\t\(200,280,\\frz-5\)\\t\(280,320,\\frz0\)/.test(sal),
  (sal.match(/\\org[^}]*/) || [""])[0]);
var yk = ass("yandan-kay");
ok("yandan-kay: kart %8 soldan iki parçalı yavaşlayarak (\\move) ve saydamdan", /\\move\(806,907,914,907,0,130\)/.test(yk) && /\\move\(\d+,907,960,907,0,\d+\)/.test(yk), (yk.match(/\\move\([^)]*\)/g) || []).slice(0, 2).join(" "));
var ar = ass("aralik-acil");
ok("aralik-acil: harf aralığı scaled(18) → 0 ve saydamdan", /\\fsp18\\t\(0,180,\\fsp5\)/.test(ar) && /\\fsp[\d.]+\\t\(0,\d+,\\fsp0\)/.test(ar));
// Uzun kelime kartı (\fscx sıkıştırması) ölçek animasyonunu sıkıştırmayla çarpar
var uz = derle({ anim: "kelime-pop", font: "Anton", boyut: 112, satir: 1, kelime: 3 }, { cues: [{ start: 0, end: 1, text: "Afyonkarahisarlılaştıramadıklarımızdanmışsınızcasına" }], w: 1080, h: 1920 }).ass;
ok("uzun kelime kartında ölçek \\fscx sıkıştırmasıyla çarpılır", /\\fscx\d+(\.\d)?\\fscy115/.test(uz) && !/\\fscx115\\fscy115/.test(uz), (uz.match(/\\fscx[\d.]+\\fscy115/) || [""])[0]);
// Kelime vurgusu / *anahtar kelime* renkleri animasyonla da
var vz = ass("kelime-pop", { cues: O.METINLER.vurgu, ov: { vurgu: false } });
ok("kelime vurgusu kapalıyken yalnız *anahtar kelime* vurgu renginde (animasyonda da)", /\\1c&H003FD2FF\}gerçekten/.test(vz) && !/\\1c&H003FD2FF\}Bu\b/.test(vz));
// Gölge ve kutu
var gk = derle({ anim: "yandan-kay", golge: { renk: "#000000", opak: 80, mesafe: 6, yumusak: 8 }, kutu: true }).ass;
ok("yandan-kay + kutu: kutu kartla kayar (\\move), gölge kopyası metinle aynı yolda", /^Dialogue: 0,.*SufloKutu.*\\move\(806,907,914,907,0,130\)/m.test(gk) &&
  /^Dialogue: 1,.*\\move\(806,907,914,907,0,130\).*\\4a/m.test(gk));
var gn = derle({ anim: "netles", golge: { renk: "#000000", opak: 80, mesafe: 6, yumusak: 8 } }).ass;
ok("netles + gölge: gölgenin bulanıklığı kendi yumuşaklığının altına inmez", /^Dialogue: 1,.*\\blur10\\t\(0,\d+,\\blur4\)/m.test(gn) && /^Dialogue: 3,.*\\blur10\\t\(0,\d+,\\blur4\)/m.test(gn) &&
  /^Dialogue: 1,.*\\blur4\}/m.test(gn) && /^Dialogue: 3,.*\\blur4\\t\(0,\d+,\\blur0\)/m.test(gn));
// Konuşmacı renkleri: koşu rengi metne
var kr = SE.compile({ styleId: "efekt", cues: tek.map(function (c, i) { return Object.assign({ speaker: i < 2 ? 0 : 1 }, c); }), cueKind: "words", speakerColors: ["#ff0000", "#00ff00"], overrides: { anim: "kelime-pop" } });
ok("Podcast konuşmacı renkleri animasyonda da (koşu başında \\1c)", /\{\\1c&H000000FF\}/.test(kr.ass) && /\{\\1c&H0000FF00\}/.test(kr.ass) && kr.eventCount > 5);

/* ---------------- 5) altyazi-efekt.js ---------------- */
ok("AE.normalize: anim katalog kimliği ya da \"\"; bilinmeyen tabanda kalır; görünümler klasik", AE.normalize({ anim: "dalga" }).anim === "dalga" &&
  AE.normalize({ anim: "uzay" }).anim === "" && AE.normalize({ anim: "uzay" }, { anim: "netles" }).anim === "netles" && AE.normalize({ anim: 3 }).anim === "" &&
  AE.normalize({}).anim === "" && AE.GORUNUMLER.every(function (g) { return g.ayar.anim === ""; }) && AE.VARSAYILAN.anim === SE.preset("efekt").style.anim);
ok("AE.overrides: anim yalnız seçiliyse (klasikte alan yok, paylaşım kodu uyarısız)", AE.overrides({ anim: "netles" }).anim === "netles" &&
  !("anim" in AE.overrides({})) && !("anim" in AE.overrides({ anim: "" })));
ok("gorunumuBul: animasyon seçilince hazır görünüm çipi kalkar", AE.gorunumuBul(AE.gorunum("vurucu").ayar) === "vurucu" &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("vurucu").ayar, { anim: "kelime-pop" })) === "");
var si = AE.sablonIndeksleri({ anim: "olcek-darbe", giris: "fade", aktif: "glitch" });
ok("sablonIndeksleri: anim → katalogdaki klasik çift (MOGRT textAnim 0-5 / hlAnim 0-3)", si.textAnim === 0 && si.hlAnim === 1 &&
  IDLER.every(function (id) { var x = AE.sablonIndeksleri({ anim: id }); return x.textAnim >= 0 && x.textAnim <= 5 && x.hlAnim >= 0 && x.hlAnim <= 3 &&
    x.textAnim === SE.GIRISLER.indexOf(YA.klasik(id).giris) && x.hlAnim === SE.AKTIFLER.indexOf(YA.klasik(id).aktif); }) &&
  J(AE.sablonIndeksleri({ giris: "zipla", aktif: "titre" })) === J({ textAnim: 5, hlAnim: 2 }), J(si));
ok("klasikAyar / animasyonu", AE.klasikAyar({ anim: "zipla-gel", giris: "pop" }).giris === "asagi" && AE.klasikAyar({ anim: "zipla-gel" }).anim === "" &&
  AE.klasikAyar({ giris: "pop" }).giris === "pop" && AE.animasyonu({}) === null &&
  J(AE.animasyonu({ anim: "sallanma" })) === J({ id: "sallanma", ad: "Sallanma", klasik: { giris: "yok", aktif: "titre" }, girisAd: "Yok", aktifAd: "Titre" }));

/* ---------------- 6) Premiere yerel çıktı (MOGRT) yedeği ---------------- */
var mAyar = AE.normalize(Object.assign({}, AE.gorunum("temiz").ayar, { anim: "kelime-pop" }));
var mb = CMJ.build(O.METINLER.bes, mAyar, { cueKind: "words" });
var md = JSON.parse(mb.parcalar[0].json);
var mKlasik = JSON.parse(CMJ.build(O.METINLER.bes, AE.normalize(Object.assign({}, mAyar, { anim: "", giris: "pop", aktif: "yok" })), { cueKind: "words" }).parcalar[0].json);
ok("MOGRT: sözleşmede yazı animasyonu yok → en yakın klasik çift (Pop + Yok: textAnim 1, hlAnim 0), geri kalanı aynı",
  md[7] === 1 && md[8] === 0 && J(md) === J(mKlasik), J(md.slice(0, 9)));
ok("MOGRT: kullanıcıya not (animasyonNotu → bildirimEkleri)", CMJ.animasyonNotu(mAyar) === "Bu animasyon Premiere yerel çıktıda en yakın karşılığıyla (Pop + Yok) gelir" &&
  CMJ.animasyonNotu(AE.gorunum("temiz").ayar) === "" &&
  CMJ.bildirimEkleri({ anim: CMJ.animasyonNotu(mAyar) })[0] === CMJ.animasyonNotu(mAyar) && CMJ.bildirimEkleri({ anim: "" }).length === 0);
var capSrc = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8");
ok("panel: yerel çıktı bildirimine animasyon notu gider", /CMJ\.bildirimEkleri\(\{ font: fontSec, vurguKaybi: plan\.vurguKaybi, logo: logoVar, konusmaci: konusmaciVar, konumYok: konumYok \|\| olcekYok,\s*anim: CMJ\.animasyonNotu \? CMJ\.animasyonNotu\(ayar\) : "" \}\)/.test(capSrc));

/* ---------------- 7) After Effects planı ---------------- */
var apo = { mod: "stilli", w: 1920, h: 1080, fps: 30, cueKind: "words" };
var apA = AP.plan(O.METINLER.bes, Object.assign({}, apo, { ayar: Object.assign({}, AE.gorunum("temiz").ayar, { anim: "yukari-suzul" }) }));
var apK = AP.plan(O.METINLER.bes, Object.assign({}, apo, { ayar: Object.assign({}, AE.gorunum("temiz").ayar, { giris: "yukari" }) }));
ok("AE planı: yazı animasyonu klasik çiftle (Yukarı kay) ve UYARI ile", apA.uyarilar.indexOf(AP.UYARI.anim) !== -1 &&
  J(apA.katmanlar.map(function (k) { return k.giris; })) === J(apK.katmanlar.map(function (k) { return k.giris; })) && apK.uyarilar.indexOf(AP.UYARI.anim) === -1);

/* ---------------- 8) Shorts paketi ---------------- */
var spA = SPP.stilAyarlari("efekt", null, true, Object.assign({}, AE.gorunum("temiz").ayar, { anim: "netles" }), true);
var spK = SPP.stilAyarlari("efekt", null, true, AE.gorunum("temiz").ayar, true);
ok("Shorts paketi: panelin yazı animasyonu stil motoruna gider; klasikte alan yok", spA.overrides.anim === "netles" && !("anim" in spK.overrides) &&
  SE.compile({ styleId: "efekt", cues: tek, cueKind: "words", overrides: spA.overrides }).style.anim === "netles");

/* ---------------- 9) yükleme sırası, ES5 ---------------- */
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
function sira(f) { return html.indexOf('<script src="js/' + f + '"'); }
ok("index.html: katalog ve stil kodu style-share.js'ten sonra, style-engine.js'ten önce", sira("yazi-animasyonlari.js") > sira("style-share.js") &&
  sira("yazi-animasyonlari.js") < sira("style-engine.js") && sira("stil-kodu.js") > sira("yazi-animasyonlari.js") && sira("stil-kodu.js") < sira("captions.js"));
var yaSrc = fs.readFileSync(path.join(KOK, "js", "yazi-animasyonlari.js"), "utf8") + fs.readFileSync(path.join(KOK, "js", "stil-kodu.js"), "utf8");
ok("yeni modüller ES5 (let / const / => / class / şablon metni yok)", !/\b(let|const|class)\s|=>|`/.test(yaSrc));
// Doğrulama: paket denetimi yeni modülleri zorunlu tutar (eksik paket animasyonları ve stil kodunun "ek"ini sessizce
// klasiğe düşürürdü: seçici boş kalır, paylaşılan kodun animasyonu kaybolur)
var vr = fs.readFileSync(path.join(KOK, "tools", "verify-release.ps1"), "utf8");
ok("verify-release: js/yazi-animasyonlari.js ve js/stil-kodu.js paket için zorunlu",
  /'\(\^\|\/\)js\/yazi-animasyonlari\\\.js\$'/.test(vr) && /'\(\^\|\/\)js\/stil-kodu\\\.js\$'/.test(vr));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
