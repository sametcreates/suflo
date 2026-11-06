// Suflo testi: animasyon motoru v2 — yazı animasyonları kataloğu ve stil motoru (yapısal; ffmpeg gerekmez).
//  - katalog (js/yazi-animasyonlari.js): kimlik, kategori, klasik çift, AE durumu, süre
//  - her animasyon × kadraj (16:9, 9:16 + güvenli, 1:1) × metin (1 kelime, 5 kelime, uzun kelime, *vurgu*):
//    derlenir, ASS'te NaN / undefined / Infinity yok, her Dialogue 10 alan ve başı < sonu, olaylar kart süresinde,
//    katman sırası (kutu < gölge < metin < hareket), süreler hareket şiddetiyle ölçeklenir, ışığa duyarlılık
//    (kelime başına saniyede en çok 3 belirme), kelime başına olay sayısı makul, son karede klasik durağan çıktı
//  - anim "" / yok / bilinmeyen: Altyazı Efektleri çıktısı değişiklik öncesiyle bayt bayt aynı (anlık görüntü)
//  - altyazi-efekt.js (normalize / overrides / görünüm / şablon indeksleri), ae-plan.js, Premiere yerel çıktı yedeği,
//    Shorts paketi
//  - parti 5: 13 yeni animasyon (karaoke / vurgu ve hareket ailesi; katalog ≥ 24, Türkçe ad + İngilizce çeviri),
//    vurguKutuRenk / vurguRenk2 doğrulaması, kenar metinleri (Türkçe büyük harf, Arapça, 0,08 sn'lik kelimeler, tek
//    kelimelik kart), kelime sınırlarında üst üste olay yok, kutudaki yazının kontrastı, MOGRT notu, galeri glifleri
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
// Parti 5: karaoke / vurgu ailesi ve hareket ailesi
var PARTI5 = ["karaoke-dolgu", "karaoke-birikimli", "vurgu-kutusu", "vurgu-cizgi", "parlama", "iki-ton", "kromatik-yumusak",
  "buyuyen-vurgu", "dusus", "kapak-cevir", "donerek", "perde", "nefes"];
ok("katalog: ilk 12 özgün animasyon", BEKLENEN.every(function (id) { return IDLER.indexOf(id) !== -1; }), IDLER.join(","));
ok("katalog (parti 5): 13 yeni animasyon, toplam ≥ 24", PARTI5.every(function (id) { return IDLER.indexOf(id) !== -1; }) && IDLER.length >= 24 &&
  IDLER.length === BEKLENEN.length + PARTI5.length, IDLER.length);
// Sayım testi: her kimliğin Türkçe adı, açıklaması ve İngilizce çevirisi (i18n/en.js), geçerli klasik yedeği
var EN = (function () { var src = fs.readFileSync(path.join(KOK, "i18n", "en.js"), "utf8"); return function (tr) { return src.indexOf(J(tr) + ":") !== -1; }; })();
var cevirisiz = [];
YA.ANIMASYONLAR.forEach(function (a) { [a.ad, a.aciklama].forEach(function (t) { if (!EN(t)) cevirisiz.push(t); }); });
YA.KATEGORILER.forEach(function (k) { if (!EN(k.ad) && k.ad !== "Kelime kelime") cevirisiz.push(k.ad); });
ok("katalog: kimlikler tekil, Türkçe ad, İngilizce çevirisi (ad + açıklama) ve geçerli klasik yedeği her kayıtta", IDLER.length >= 24 &&
  IDLER.filter(function (x, i) { return IDLER.indexOf(x) === i; }).length === IDLER.length && cevirisiz.length === 0 &&
  YA.ANIMASYONLAR.every(function (a) { return /[a-zçğıöşüİ]/i.test(a.ad) && SE.GIRISLER.indexOf(a.klasik.giris) !== -1 && SE.AKTIFLER.indexOf(a.klasik.aktif) !== -1; }),
  cevirisiz.slice(0, 4).join(" | "));
ok("katalog: renkAlanlari (vurgu kutusu → vurguKutuRenk; iki ton, kromatik → vurguRenk2; öbürleri boş)",
  J(YA.renkAlanlari("vurgu-kutusu")) === J(["vurguKutuRenk"]) && J(YA.renkAlanlari("iki-ton")) === J(["vurguRenk2"]) &&
  J(YA.renkAlanlari("kromatik-yumusak")) === J(["vurguRenk2"]) && J(YA.renkAlanlari("dalga")) === "[]" && J(YA.renkAlanlari("uzay")) === "[]" &&
  J(YA.renkAlanlari("__proto__")) === "[]");
ok("renk yardımcıları: ikinciVurgu #rrggbb ve vurgudan belirgin; kontrastRengi WCAG ≥ 4,5", ["#ffd23f", "#ff5fa2", "#2af5ff", "#9e9e9e", "#000000", "#ffffff"].every(function (h) {
  var r = YA.ikinciVurgu(h); return /^#[0-9a-f]{6}$/.test(r) && r !== h;
}) && YA.ikinciVurgu("bozuk") === "#8b7cf6" && ["#ffd23f", "#1b1f2a", "#7a2cff", "#ff2e4d", "#808080", "#00d1ff", "#f5efe1"].every(function (z) {
  return YA.kontrast(z, YA.kontrastRengi(z, "#ffffff")) >= 4.5;
}) && YA.kontrastRengi("#1b1f2a", "#ffffff") === "#ffffff" && YA.kontrastRengi("#ffd23f", "#ffffff") === "#000000");
ok("katalog: kimlikler ascii kebab ve tekil", IDLER.every(function (id) { return /^[a-z]+(-[a-z]+)*$/.test(id); }) &&
  IDLER.filter(function (x, i) { return IDLER.indexOf(x) === i; }).length === IDLER.length);
var KAT = ["kart", "kelime", "harf", "karaoke", "surekli"];
ok("katalog: her kayıt tam (ad Türkçe, kategori, açıklama, klasik çift, ae, süre)", YA.ANIMASYONLAR.every(function (a) {
  return typeof a.ad === "string" && a.ad.length > 1 && KAT.indexOf(a.kategori) !== -1 && typeof a.aciklama === "string" && a.aciklama.length > 10 &&
    SE.GIRISLER.indexOf(a.klasik.giris) !== -1 && SE.AKTIFLER.indexOf(a.klasik.aktif) !== -1 && ["tam", "yakin", "yok"].indexOf(a.ae) !== -1 &&
    typeof a.sure === "number" && a.sure >= 80 && a.sure <= 1500;
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
  YA.gruplar().reduce(function (n, g) { return n + g.animasyonlar.length; }, 0) === IDLER.length);
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
  // Parti 5: karaoke dolgusu / çizgi akışı (\kf, santisaniye)
  re = /\\kf(\d+)/g;
  while ((m = re.exec(metin))) n += Number(m[1]) * 10;
  return n;
}
// Sürekli (periyodik) animasyonların periyodu: \t parçalarının en sık süresi (toplam kelime süresine bağlı, periyot şiddete)
function periyot(ass) {
  var say = {}, m, re = /\\t\((\d+),(\d+),/g;
  while ((m = re.exec(ass))) { var d = Number(m[2]) - Number(m[1]); if (d > 0) say[d] = (say[d] || 0) + 1; }
  var en = 0; Object.keys(say).forEach(function (d) { if (!en || say[d] > say[en]) en = d; });
  return Number(en);
}

var sorun = { derle: [], sayi: [], alan: [], zaman: [], kart: [], katman: [], isik: [], olaySay: [], son: [] };
var KATMANLAR_SADE = [1, 2], KATMANLAR_TAM = [0, 1, 3, 4];
/*
 * Parti 5: süs katmanı (kutu, çizgi, ışıltı, kromatik kopyalar) glitch katmanında (sade 0, gölge + kutu 2).
 * Son kare karşılaştırması: "renk" renk etiketleri dışında aynı (biriken vurgu, iki ton: renk tasarımın kendisi),
 * "sus" süs katmanı ve renkler dışında aynı (metin klasik durağan yerinde; kutu / çizgi / ışıltı ek), "olcek" büyüyen
 * vurgunun durağan satır içi ölçeği dışında aynı, "atla" renk geçişi (\t taşır; render testi denetler).
 */
var SUSLU = ["vurgu-kutusu", "vurgu-cizgi", "parlama", "kromatik-yumusak"];
var SON_MOD = { "renk-gecis": "atla", "karaoke-birikimli": "renk", "iki-ton": "renk", "vurgu-kutusu": "sus", "vurgu-cizgi": "sus", "parlama": "sus",
  "buyuyen-vurgu": "olcek" };
// Kenar metinleri (anlık görüntüye girmez): Türkçe büyük harf ve Arapça
var EK_METINLER = {
  buyukTr: O.kelimeler(["İSTANBUL'DA", "ŞİMDİ", "*ÇOK*", "GÜZEL", "ĞÜŞİÖÇ"], 0.42, 0.38),
  arapca: O.kelimeler(["مرحبا", "بكم", "في", "سوفلو"], 0.5, 0.45)
};
var TUM_METINLER = Object.assign({}, O.METINLER, EK_METINLER);
IDLER.forEach(function (id) {
  O.KADRAJLAR.forEach(function (k) {
    Object.keys(TUM_METINLER).forEach(function (mAd) {
      [false, true].forEach(function (zengin) {
        var anahtar = id + "@" + k.ad + ":" + mAd + (zengin ? "+gölge+kutu" : "");
        var ov = AE.overrides(Object.assign({}, AE.gorunum(zengin ? "zarif" : "temiz").ayar, { anim: id }));
        ov.guvenli = k.guvenli;
        if (zengin) { ov.kutu = true; ov.kutuOpak = 60; }
        var cues = TUM_METINLER[mAd], r;
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
        var susK = zengin ? 2 : 0, suslu = SUSLU.indexOf(id) !== -1;
        var izinli = (zengin ? KATMANLAR_TAM : KATMANLAR_SADE).concat(suslu ? [susK] : []);
        ev.forEach(function (e) {
          if (izinli.indexOf(e.katman) === -1) sorun.katman.push(anahtar + " katman " + e.katman);
          if (e.stil === "SufloKutu" && e.katman !== 0 && !((id === "vurgu-kutusu" || id === "vurgu-cizgi") && e.katman === susK)) sorun.katman.push(anahtar + " kutu katmanı " + e.katman);
          if (e.stil === "SufloKutu" && !zengin && id !== "vurgu-kutusu" && id !== "vurgu-cizgi") sorun.katman.push(anahtar + " kutusuz kartta SufloKutu");
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
        var mod = SON_MOD[id] || "ayni";
        if (mod !== "atla") {
          var dov = Object.assign({}, ov, { anim: "", giris: "yok", aktif: "yok" });
          var duragan = olaylar(SE.compile({ styleId: "efekt", cues: cues, cueKind: "words", width: k.w, height: k.h, overrides: dov }).ass).map(olay);
          var sade = function (m) {
            if (mod === "renk" || mod === "sus") m = m.replace(/\\[123]c&H[0-9A-F]+&?/g, "").replace(/\{\}/g, "");
            if (mod === "olcek") m = m.replace(/\{\\fscx[\d.]+\\fscy\d+\}/g, "");
            return m;
          };
          kartlar.forEach(function (kt) {
            var t = kt.son - 0.01;
            // susuz: süs katmanındaki olaylar sayılmaz (yalnız "sus" kipinde, animasyonlu çıktıda)
            function anlik(liste, susuz) { return liste.filter(function (e) { return t >= e.bas && t < e.son && !(susuz && e.katman === susK); })
              .map(function (e) { return e.katman + "|" + e.stil + "|" + sade(e.metin); }).sort().join("\n"); }
            if (anlik(ev, mod === "sus") !== anlik(duragan, false)) sorun.son.push(anahtar + " t=" + t.toFixed(2) + " " + anlik(ev, mod === "sus").slice(0, 160) + " ≠ " + anlik(duragan, false).slice(0, 160));
          });
        }
      });
    });
  });
});
var ornekSay = IDLER.length * O.KADRAJLAR.length * Object.keys(TUM_METINLER).length * 2;
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
var PERIYODIK = ["parlama", "nefes"];
IDLER.forEach(function (id) {
  var m = ["soft", "balanced", "hard"].map(function (s) {
    if (PERIYODIK.indexOf(id) !== -1) return periyot(derle({ anim: id }, { cues: yavas, intensity: s }).ass);
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

/* ---------------- 4b) parti 5: kenar durumları ---------------- */
// Taban katmanında (metin) aynı anda en çok bir olay: kelime sınırlarında üst üste binen olay yok (çift çizim / titreme olurdu)
var cokluHizli = O.kelimeler(["Bu", "çok", "hızlı", "bir", "cümle", "oldu"], 0.09, 0.08);
var tekKisa = [{ start: 0.5, end: 0.58, text: "Evet" }];
var ustUste = [], kisaSorun = [];
PARTI5.forEach(function (id) {
  [O.METINLER.bes, O.METINLER.vurgu, cokluHizli, tekKisa, EK_METINLER.buyukTr].forEach(function (cues, ci) {
    [false, true].forEach(function (zengin) {
      var ov = Object.assign({ anim: id }, zengin ? { golge: { renk: "#000000", opak: 70, mesafe: 4, yumusak: 4 }, kutu: true } : {});
      var r;
      try { r = derle(ov, { cues: cues }); } catch (e) { kisaSorun.push(id + "#" + ci + " " + e.message); return; }
      if (/NaN|undefined|Infinity/.test(r.ass)) kisaSorun.push(id + "#" + ci + " NaN");
      var ev = olaylar(r.ass).map(olay);
      if (ev.some(function (e) { return !(e.bas < e.son); })) kisaSorun.push(id + "#" + ci + " boş olay");
      var taban = zengin ? 3 : 1, sus = zengin ? 2 : 0;
      [[taban, "Suflo"], [sus, "SufloKutu"]].forEach(function (kt) {
        var l = ev.filter(function (e) { return e.katman === kt[0] && e.stil === kt[1]; }).sort(function (a, b) { return a.bas - b.bas; });
        for (var i = 1; i < l.length; i++) if (l[i].bas < l[i - 1].son - 1e-9) { ustUste.push(id + "#" + ci + (zengin ? "+zengin" : "") + " katman " + kt[0] + " " + l[i - 1].son + " > " + l[i].bas); break; }
      });
    });
  });
});
ok("parti 5: kelime sınırlarında taban metin ve kelime kutusu / çizgisi üst üste binmez (her an tek olay)", ustUste.length === 0, ustUste.slice(0, 3).join(" | "));
ok("parti 5: animasyondan kısa kelimeler (0,08 sn), tek kelimelik kısa kart: derlenir, boş olay yok", kisaSorun.length === 0, kisaSorun.slice(0, 3).join(" | "));
// Tek kelimelik kart: her animasyon son karede klasik durağanla (kipine göre) aynı yukarıda (metin "tek"); çizgi yalnız kelimede
var tekCizgi = derle({ anim: "vurgu-cizgi" }, { cues: O.METINLER.tek }).ass;
ok("vurgu-cizgi tek kelimelik satırda: satır yüksekliği saydam \\h ile korunur", /\\h\{\\fscy1\\3a&H60&/.test(tekCizgi) && /\{\\fscy100\\3a&HFF&\}\\h/.test(tekCizgi));
// Doğrulama: guvenliStil (motor) ve AE.normalize
var dogru = derle({ anim: "vurgu-kutusu", vurguKutuRenk: "#ABCDEF", vurguRenk2: "#123456" }).style;
ok("motor: vurguKutuRenk / vurguRenk2 #rrggbb (küçük harfe) ya da null; #rgb, isim, enjeksiyon, sayı stilin kendisi (null)", dogru.vurguKutuRenk === "#abcdef" && dogru.vurguRenk2 === "#123456" &&
  ["#abc", "red", "#12345g", "#123456}{\\pos(0,0)", 5, {}, [], true, ""].every(function (v) { var st = derle({ vurguKutuRenk: v, vurguRenk2: v }).style; return st.vurguKutuRenk === null && st.vurguRenk2 === null; }) &&
  derle({ vurguRenk2: null }).style.vurguRenk2 === null && SE.preset("efekt").style.vurguKutuRenk === null && SE.preset("efekt").style.vurguRenk2 === null);
ok("AE.normalize: renkler null ya da #rrggbb (küçük harf); bozuk değer tabanda kalır; görünümler alanları taşır (null)", AE.normalize({ vurguRenk2: "#ABCDEF" }).vurguRenk2 === "#abcdef" &&
  AE.normalize({ vurguKutuRenk: "#abc" }).vurguKutuRenk === null && AE.normalize({ vurguKutuRenk: "kırmızı" }, { vurguKutuRenk: "#111111" }).vurguKutuRenk === "#111111" &&
  AE.normalize({ vurguKutuRenk: null }, { vurguKutuRenk: "#111111" }).vurguKutuRenk === null && AE.normalize({}).vurguRenk2 === null &&
  AE.GORUNUMLER.every(function (g) { return g.ayar.vurguKutuRenk === null && g.ayar.vurguRenk2 === null; }) &&
  AE.VARSAYILAN.vurguKutuRenk === SE.preset("efekt").style.vurguKutuRenk);
ok("AE.overrides: renkler yalnız elle seçildiyse (klasik / türetilmişte alan yok: eski çıktı, kod, Shorts paketi aynı)",
  !("vurguKutuRenk" in AE.overrides({})) && !("vurguRenk2" in AE.overrides({ anim: "iki-ton" })) && AE.overrides({ vurguRenk2: "#123456" }).vurguRenk2 === "#123456");
ok("gorunumuBul: renk yalnız onu kullanan animasyonda görünümü değiştirir", AE.gorunumuBul(Object.assign({}, AE.gorunum("temiz").ayar, { vurguRenk2: "#123456" })) === "temiz" &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("vurgu-kalemi").ayar, { vurguKutuRenk: "#123456" })) === "" &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("vurgu-kalemi").ayar, { vurguRenk2: "#123456" })) === "vurgu-kalemi");
ok("AE.renkAlanlari / gecerliRenkler", J(AE.renkAlanlari({ anim: "vurgu-kutusu" })) === J(["vurguKutuRenk"]) && J(AE.renkAlanlari({})) === "[]" &&
  J(AE.gecerliRenkler({ vurguRenk: "#ffd23f" })) === J({ vurguKutuRenk: "#ffd23f", vurguRenk2: YA.ikinciVurgu("#ffd23f") }) &&
  AE.gecerliRenkler({ vurguRenk2: "#010203", vurguKutuRenk: "#040506" }).vurguKutuRenk === "#040506");
// Vurgu kutusu: kutudaki kelimenin rengi kutuya göre WCAG ≥ 4,5, konturu kutu renginde; kutu rengi verilmezse vurgu rengi
var kontrastSorun = [];
["#ffd23f", "#1b1f2a", "#7a2cff", "#ff2e4d", "#808080", "#00d1ff", "#f5efe1", "#ffffff", "#000000"].forEach(function (kr) {
  var a = derle({ anim: "vurgu-kutusu", vurguKutuRenk: kr, renk: "#ffffff" }).ass;
  var m = /^Dialogue: 1,[^\n]*\{\\1c(&H[0-9A-F]{8})\\3c(&H[0-9A-F]{8})\}Bunu/m.exec(a);
  if (!m) { kontrastSorun.push(kr + " eşleşmedi"); return; }
  var hex = function (ass) { return "#" + ass.slice(8, 10) + ass.slice(6, 8) + ass.slice(4, 6); };
  if (YA.kontrast(kr, hex(m[1]).toLowerCase()) < 4.5 || hex(m[2]).toLowerCase() !== kr) kontrastSorun.push(kr + " → " + hex(m[1]));
});
ok("vurgu-kutusu: kutudaki yazı kutu rengine göre WCAG ≥ 4,5 (9 kutu rengi), konturu kutu renginde", kontrastSorun.length === 0, kontrastSorun.join(" | "));
ok("vurgu-kutusu: kutu rengi verilmezse vurgu rengi; SufloKutu stili ASS başlığında (arka plan kutusu kapalıyken de), başka animasyonda yok",
  /SufloKutu,[^\n]*\\3c&H003FD2FF/.test(derle({ anim: "vurgu-kutusu" }).ass) && /^Style: SufloKutu,/m.test(derle({ anim: "vurgu-kutusu" }).ass) &&
  !/^Style: SufloKutu,/m.test(derle({ anim: "parlama" }).ass) && !/^Style: SufloKutu,/m.test(derle({}).ass));
var itn = derle({ anim: "iki-ton", vurguRenk2: "#00aa55" }).ass, itd = derle({ anim: "iki-ton" }).ass;
ok("iki-ton: tek sıradaki kelime vurguRenk2, boşsa vurgu renginin karşıtı", /\\1c&H0055AA00\)\}gören/.test(itn) &&
  itd.indexOf(SE.assColor ? "" : "") !== -1 && new RegExp("\\\\1c&H00" + YA.ikinciVurgu("#ffd23f").slice(5, 7).toUpperCase() + YA.ikinciVurgu("#ffd23f").slice(3, 5).toUpperCase() + YA.ikinciVurgu("#ffd23f").slice(1, 3).toUpperCase() + "\\)\\}gören").test(itd));
var yavasP5 = O.kelimeler(["Uzun", "kelime"], 3, 2.9);
var par = derle({ anim: "parlama" }, { cues: yavasP5 }).ass;
var parT = []; (par.match(/\\t\((\d+),(\d+),\\3a/g) || []).forEach(function (x) { var m = /(\d+),(\d+)/.exec(x); parT.push(Number(m[2]) - Number(m[1])); });
ok("parlama: nabız yarım periyodu ≥ 333 ms (≤ 1,5 Hz) her şiddette, ışıltı hiç kaybolmaz (\\3a 50 ↔ B0)", ["soft", "balanced", "hard"].every(function (si) {
  // ilk \t(0, …) ışıltının belirişi (nabız değil)
  var a = derle({ anim: "parlama" }, { cues: yavasP5, intensity: si }).ass, ok2 = true, m, re = /\\t\((\d+),(\d+),\\3a&H(B0|50)&\)/g, n = 0;
  while ((m = re.exec(a))) { if (m[1] === "0") continue; n++; if (Number(m[2]) - Number(m[1]) < 333) ok2 = false; }
  return ok2 && n > 4;
}) && !/\\t\(\d+,\d+,\\3a&HFF&\)/.test(par), parT.slice(0, 4).join(","));
var nef = derle({ anim: "nefes" }, { cues: yavasP5 }).ass;
ok("nefes: %100 ↔ %103, kartın sonu %100 ve durağan", /\\fscx103\\fscy103/.test(nef) && !/\\fscx10[4-9]/.test(nef) &&
  /\\pos\(960,907\)\\fs76\\q2\\1c&H00FFFFFF\\3c&H00000000\\bord5\\shad0\}Uzun \{\\1c&H003FD2FF\}kelime/.test(nef));
var by = derle({ anim: "buyuyen-vurgu" }, { cues: O.METINLER.vurgu }).ass;
ok("buyuyen-vurgu: *anahtar* kelime durağan %120 ve 0 → %135 → %120 girer; öbürleri kart başından tabanda", /\{\\fscx120\\fscy120\}gerçekten\{\\fscx100\\fscy100\}/.test(by) &&
  /\\fscx0\\fscy0\\t\(0,\d+,\\fscx[\d.]+\\fscy[\d.]+\)\}gerçekten/.test(by) && /\\fscx135\\fscy135/.test(by) && /^Dialogue: 1,0:00:00\.20,[^\n]*\}Bu\{\\1c&H00FFFFFF\} \{\\alpha&HFF&\}/m.test(by));
var byUzun = derle({ anim: "buyuyen-vurgu", font: "Anton", boyut: 112, satir: 1 }, { cues: [{ start: 0, end: 1, text: "Afyonkarahisarlılaştıramadıklarımızdanmışsınızcasına" }], w: 1080, h: 1920 }).ass;
ok("buyuyen-vurgu: sığmayan (uzun) kelime büyütülmez (%100'de durur)", !/fscy120/.test(byUzun) && /\\fscy100\)/.test(byUzun), (byUzun.match(/\\fscx[\d.]+\\fscy\d+/g) || []).slice(0, 4).join(" "));
var pr = derle({ anim: "perde" }).ass;
ok("perde: \\clip dikdörtgeni kartın altından üstüne yükselir (\\t), hareket bitince clip yok", /\\clip\(0,(\d+),1920,1080\)\\t\(0,\d+,\\clip\(0,(\d+),1920,1080\)\)/.test(pr) &&
  (function () { var m = /\\clip\(0,(\d+),1920,1080\)/.exec(pr); return Number(m[1]) > 907; })() && /^Dialogue: 1,0:00:00\.6[5-9],[^\n]*\\pos\(960,907\)\\fs76[^\n]*\\shad0\}/m.test(pr));
var kc = derle({ anim: "kapak-cevir" }).ass, dn = derle({ anim: "donerek" }).ass;
ok("kapak-cevir: \\frx 70 → 0, \\org kartın ortasında; donerek: \\frz -12 → 0 ve %85 → %100", /\\org\(960,869\)\\frx70\\t\(0,\d+,\\frx[\d.]+\)/.test(kc) &&
  /\\org\(960,869\)/.test(dn) && /\\frz-12/.test(dn) && /\\fscx85\\fscy85/.test(dn), (kc.match(/\\org[^}]*/) || [""])[0]);
var kr = derle({ anim: "kromatik-yumusak" }).ass;
ok("kromatik-yumusak: iki kopya kelime başında, ±scaled(5) çaprazdan \\move ile kayar ve söner (\\fade), titreşim / rastgele sıçrama yok",
  (kr.match(/^Dialogue: 0,0:00:00\.20,/gm) || []).length === 2 && /\\move\(955,912,960,907,0,\d+\)/.test(kr) && /\\move\(965,902,960,907,0,\d+\)/.test(kr) &&
  /\\fade\(48,255,255,0,/.test(kr) && !/\\t\(\d+,\d+,\\(alpha|1a)&H00/.test(kr.split("\n").filter(function (l) { return /^Dialogue: 0,/.test(l); }).join("\n")));
var dol = derle({ anim: "karaoke-dolgu" }).ass;
ok("karaoke-dolgu: etkin kelime \\kf (dolgu kelimenin %90'ı), sonrası \\k0 hecesinde aynı renk; gölge kopyası dolgusuz",
  /\{\\1c&H003FD2FF\\2c&H00FFFFFF\\kf36\}Bunu\{\\1c&H00FFFFFF\\2c&H00FFFFFF\\k0\}/.test(dol) &&
  !/^Dialogue: 1,.*\\kf/m.test(derle({ anim: "karaoke-dolgu", golge: { renk: "#000000", opak: 80, mesafe: 4, yumusak: 2 } }).ass));
// MOGRT notu her yeni animasyonda en yakın klasik karşılığın adını verir
ok("MOGRT: her parti 5 animasyonunda Premiere yerel çıktı notu klasik karşılığın adıyla", PARTI5.every(function (id) {
  var a = AE.animasyonu({ anim: id }), n = CMJ.animasyonNotu({ anim: id });
  return a && n.indexOf("(" + a.girisAd + " + " + a.aktifAd + ")") !== -1;
}));

/* ---------------- 5) altyazi-efekt.js ---------------- */
// Parti 3: ilk altı görünüm klasik kalır; kütüphanenin animasyonlu görünümleri yalnız katalog kimliği taşır
ok("AE.normalize: anim katalog kimliği ya da \"\"; bilinmeyen tabanda kalır; ilk altı görünüm klasik, kütüphanedekiler katalogdan", AE.normalize({ anim: "dalga" }).anim === "dalga" &&
  AE.normalize({ anim: "uzay" }).anim === "" && AE.normalize({ anim: "uzay" }, { anim: "netles" }).anim === "netles" && AE.normalize({ anim: 3 }).anim === "" &&
  AE.normalize({}).anim === "" && AE.GORUNUMLER.slice(0, 6).every(function (g) { return g.ayar.anim === ""; }) &&
  AE.GORUNUMLER.every(function (g) { return g.ayar.anim === "" || IDLER.indexOf(g.ayar.anim) !== -1; }) && AE.VARSAYILAN.anim === SE.preset("efekt").style.anim);
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

/* ---------------- 8b) stil galerisi glifleri ---------------- */
var GAL = require(path.join(KOK, "js", "stil-galeri.js"));
var glifler = IDLER.map(function (id) { return GAL.glif({ anim: id, giris: "yok", aktif: "yok" }); });
ok("stil galerisi: her animasyonun kendi minik glifi var (tekil)", glifler.every(function (x) { return typeof x === "string" && x.length > 0; }) &&
  glifler.filter(function (x, i) { return glifler.indexOf(x) === i; }).length === glifler.length, glifler.join(" "));

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
