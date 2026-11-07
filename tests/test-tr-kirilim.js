// Suflo testi: js/tr-kirilim.js — Türkçe-duyarlı satır / kart kırılım cezası (kalite motoru, parti 1)
//   her kural (soru eki, de/da, ki, değil, son çekim edatları, satır sonu belirleyici / bağlaçlar, sayı + birim,
//   unvan + ad, noktalama ödülü, İngilizce işlev kelimeleri, dil kipleri) ve caption-layout.js dengeliSar'da
//   a / b hataları: önce (eski kural, dil false) / sonra
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var TK = require(path.join(KOK, "js", "tr-kirilim.js"));
var CL = require(path.join(KOK, "js", "caption-layout.js"));

var gecen = 0, toplam = 0;
function ok(ad, kosul, ek) {
  toplam++; if (kosul) gecen++;
  console.log((kosul ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : ""));
}
function J(x) { return JSON.stringify(x); }
var C = TK.kirilimCezasi, AGIR = TK.AGIR;
function agir(sol, sag, dil) { return C(sol, sag, dil) >= AGIR; }
function cezali(sol, sag, dil) { return C(sol, sag, dil) > 0; }
function her(liste, f) { var kotu = liste.filter(function (x) { return !f(x); }); return { tamam: kotu.length === 0, kotu: kotu }; }

/* ---------------- 1) modül biçimi ---------------- */
var kaynak = fs.readFileSync(path.join(KOK, "js", "tr-kirilim.js"), "utf8");
ok("UMD: module.exports ve window.SufloTrKirilim", typeof C === "function" && /root\.SufloTrKirilim = api/.test(kaynak));
ok("saf modül: DOM / dosya sistemi / ağ yok", !/document\.|require\(|XMLHttpRequest|fetch\(/.test(kaynak));
ok("eşikler: AĞIR 10, edat / bağlaç 6, hafif 3, cümle sonu ödülü -6, virgül ödülü -4",
  AGIR === 10 && TK.CEZA === 6 && TK.HAFIF === 3 && TK.ODUL_CUMLE === -6 && TK.ODUL_VIRGUL === -4);
ok("sıradan iki kelime arası 0 (iyi kırılım)", C("Bugün", "size") === 0 && C("kamerayla", "ilgili") === 0 && C("", "x") === 0 && C(null, undefined) === 0);

/* ---------------- 2) satır BAŞINDA ceza (Türkçe) ---------------- */
var soru = ["mi", "mı", "mu", "mü", "misin", "mısın", "mıyım", "miyim", "musunuz", "müsünüz", "müydü", "mıydı", "miymiş", "mıymış",
  "miyiz", "misiniz", "midir", "mı?", "misin,", "musun?", "mıydık", "miyse", "*mi*"];
var s1 = her(soru, function (w) { return agir("yapabilir", w, "tr"); });
ok("soru eki (mi / mı / mu / mü + kişi / zaman ekleri, sonda noktalama) satır başında AĞIR", s1.tamam, J(s1.kotu));
ok("soru eki büyük harfle de (toLocaleUpperCase('tr'): MİSİN, MI; dil bilmeden: MISIN)",
  agir("YAPABİLİR", "yapabilir misin".toLocaleUpperCase("tr").split(" ")[1], "tr") && agir("GELDİ", "MI?", "tr") && agir("YAPABILIR", "MISIN", "tr"));
var degilSoru = ["mum", "mis", "müdür", "mimar", "mutlu", "müzik", "misafir"];
var s2 = her(degilSoru, function (w) { return !agir("bir", w, "tr") || w === "müdür"; });
ok("soru ekine benzeyen sözcükler (mum, mis, müdür, mimar, mutlu…) soru eki sayılmaz", s2.tamam && !agir("yeni", "müdür", "tr"), J(s2.kotu));
ok("ayrı yazılan de / da satır başında cezalı (bağlaç da olsa önceki kelimeyle kalır)",
  cezali("ben", "de", "tr") && cezali("sen", "da", "tr") && cezali("ben", "DE", "tr") && !agir("ben", "de", "tr"));
ok("'ki' satır başında cezalı (dedi ki)", cezali("dedi", "ki", "tr") && cezali("dedi", "ki:", "tr"));
var degil = ["değil", "değilim", "değilsin", "değildi", "değilmiş", "değiller", "Değil,"];
var s3 = her(degil, function (w) { return cezali("kötü", w, "tr"); });
ok("'değil' ve çekimleri satır başında cezalı", s3.tamam, J(s3.kotu));
var edat = ["gibi", "kadar", "için", "ile", "göre", "sonra", "önce", "beri", "karşı", "rağmen", "dolayı", "boyunca", "İÇİN", "KARŞI"];
var s4 = her(edat, function (w) { return C("bunun", w, "tr") === TK.CEZA; });
ok("son çekim edatları (gibi, kadar, için, ile, göre, sonra, önce, beri, karşı, rağmen, dolayı, boyunca) satır başında cezalı", s4.tamam, J(s4.kotu));
ok("virgülden sonra edat / bağlaç satır başında serbest ('…, sonra eve' ödüllü)", C("Yedik,", "sonra", "tr") < 0 && C("bitti.", "Sonra", "tr") < 0);

/* ---------------- 3) satır SONUNDA ceza (Türkçe) ---------------- */
var son = ["bir", "bu", "şu", "o", "her", "hiç", "en", "çok", "daha", "ve", "ile", "ya", "veya", "ama", "fakat", "çünkü", "eğer", "hem",
  "BİR", "Bir", "BIR", "*bir*", "ÇÜNKÜ"];
var s5 = her(son, function (w) { return C(w, "şey", "tr") >= TK.CEZA; });
ok("bir, bu, şu, o, her, hiç, en, çok, daha, ve, ile, ya, veya, ama, fakat, çünkü, eğer, hem satır sonunda cezalı (büyük harf, *vurgu* dahil)", s5.tamam, J(s5.kotu));
ok("belirleyici satır sonunda değil başında serbest ('…önemli\\nbir şey')", C("önemli", "bir", "tr") === 0 && C("bir", "şey", "tr") > 0);

/* ---------------- 4) sayı + birim, unvan + ad (her dilde) ---------------- */
var sayilar = [["10", "bin"], ["100", "TL"], ["3", "ayda"], ["1.250", "TL"], ["2026", "yılında"], ["5", "kişi"], ["12", "dakika"], ["3,5", "milyon"],
  ["10", "000"], ["2", "kg"], ["50", "km'lik"], ["100", "TL'ye"], ["4", "saat"], ["30", "fps"], ["20", "yaşında"], ["7", "gün"], ["3", "ay"]];
["tr", "en", "de", "ar", undefined].forEach(function (dil) {
  var s6 = her(sayilar, function (p) { return agir(p[0], p[1], dil); });
  ok("sayı birimden ya da başka sayıdan ayrılmaz: 10 bin, 100 TL, 3 ayda, 1.250 TL, 2026 yılında… (dil " + dil + ")", s6.tamam, J(s6.kotu));
});
ok("para işareti / 'yüzde' sayıdan ayrılmaz ($ 100, yüzde 50), %50 tek belirteç; sayıdan sonra sıradan kelime hafif",
  agir("$", "100") && agir("yüzde", "50", "tr") && C("%50", "indirim", "tr") === TK.HAFIF && C("Saat", "10", "tr") === 0);
ok("sıra sayısı küçük harfli kelimeden ayrılmaz (2. sırada, 3. kez); büyük harfle süren yeni cümle ödüllü (5. Sonra)",
  agir("2.", "sırada", "tr") && agir("3.", "kez") && agir("10.", "yılımız", "de") && C("5.", "Sonra", "tr") === TK.ODUL_CUMLE);
ok("cümle sonundaki ya da virgüllü sayıdan sonra kırmak serbest (2026. / 10,)", C("2026.", "Sonra", "tr") < 0 && C("10,", "bin", "tr") < AGIR);
var unvan = [["Dr.", "Ayşe"], ["Prof.", "Ali"], ["Doç.", "Can"], ["Av.", "Zeynep"], ["Sayın", "Bakan"], ["Mr.", "Smith"], ["Dr", "Mehmet"], ["DR.", "AYŞE"]];
["tr", "en", "fr"].forEach(function (dil) {
  var s7 = her(unvan, function (p) { return agir(p[0], p[1], dil); });
  ok("unvan addan ayrılmaz, unvanın noktası cümle sonu ödülü almaz (dil " + dil + ")", s7.tamam, J(s7.kotu));
});

/* ---------------- 5) noktalama ödülü, tek noktalama belirteci ---------------- */
ok("virgül / noktalı virgül / iki nokta / uzun çizgi sonrası ödül (-4)", [",", ";", ":"].every(function (p) { return C("geldi" + p, "ve", "tr") === TK.ODUL_VIRGUL; }) &&
  C("—", "sonra") === TK.ODUL_VIRGUL && C("geldi—", "sonra") === TK.ODUL_VIRGUL);
ok("cümle sonu (. ! ? …, kapanış tırnağı / parantez kalabilir) sonrası daha büyük ödül (-6)",
  ["geldi.", "geldi!", "geldi?", "geldi…", "geldi.”", "geldi.)", "geldi?»"].every(function (w) { return C(w, "Sonra", "tr") === TK.ODUL_CUMLE; }));
ok("Arapça / Doğu Asya noktalaması: ؟ ve 。 cümle sonu, ، ve 、 virgül", C("هل؟", "نعم", "ar") === TK.ODUL_CUMLE && C("كتاب،", "قلم", "ar") === TK.ODUL_VIRGUL &&
  C("今日。", "明日", "zh") === TK.ODUL_CUMLE && C("今日、", "明日", "zh") === TK.ODUL_VIRGUL);
ok("yalnız noktalamadan oluşan belirteç ('?', '—', '...') satır başına düşmez; açılış tırnağı satır sonunda kalmaz",
  agir("Quoi", "?", "fr") && agir("geldi", "—") && agir("dur", "...") && agir("dedi", "«") === false && agir("«", "Merhaba", "tr") && agir("“", "Hi", "en"));
ok("emoji ve yalnız sembol belirteci noktalama sayılmaz (ceza yok)", C("harika", "🔥") === 0 && C("🔥", "harika", "tr") === 0 && C("A", "&", "de") === 0);

/* ---------------- 6) İngilizce, dil kipleri ---------------- */
var en = ["a", "an", "the", "of", "to", "and", "The", "AND"];
var s8 = her(en, function (w) { return C(w, "store", "en") === TK.HAFIF; });
ok("İngilizce: a / an / the / of / to / and satır sonunda hafif ceza (3)", s8.tamam, J(s8.kotu));
ok("İngilizce kipte Türkçe kurallar yok (mi, bir, de serbest; sayı ve noktalama kuralları var)",
  C("yapabilir", "misin", "en") === 0 && C("bir", "şey", "en") === 0 && agir("10", "bin", "en") && C("done,", "then", "en") === TK.ODUL_VIRGUL);
ok("tr / az tam Türkçe kuralları, bölge kodu (tr-TR, az-Latn) da", agir("yapabilir", "misin", "az") && agir("yapabilir", "misin", "tr-TR") &&
  agir("yapabilir", "misin", "az-Latn") && C("the", "store", "tr") === 0);
ok("dil verilmezse ('' / auto / undefined): tr + en birlikte", agir("yapabilir", "misin") && agir("yapabilir", "misin", "") && agir("yapabilir", "misin", "auto") &&
  C("the", "store") === TK.HAFIF && C("bir", "şey") === TK.CEZA && TK.dilKipi() === "tr+en");
ok("başka / bilinmeyen dil (de, fr, ar, xx): yalnız noktalama ve sayı kuralları", ["de", "fr", "ar", "xx", "ja"].every(function (d) {
  return C("yapabilir", "misin", d) === 0 && C("the", "store", d) === 0 && agir("10", "bin", d) && C("geldi.", "dann", d) === TK.ODUL_CUMLE && TK.dilKipi(d) === "";
}));

/* ---------------- 7) a / b: dengeliSar önce / sonra ---------------- */
var A = "Bu işi gerçekten yapabilir misin, yoksa bırakalım mı?", B = "Bugün size çok önemli bir şey anlatacağım arkadaşlar";
ok("a ÖNCE (eski kural, dil false): soru eki fiilinden koparılır, virgül kırılımı yok sayılır",
  CL.dengeliSar(A, 42, 2, false) === "Bu işi gerçekten yapabilir\nmisin, yoksa bırakalım mı?", J(CL.dengeliSar(A, 42, 2, false)));
ok("a SONRA (2 × 42 ve 2 × 34): soru eki fiiliyle, kırılım virgülden sonra",
  CL.dengeliSar(A, 42, 2) === "Bu işi gerçekten yapabilir misin,\nyoksa bırakalım mı?" && CL.dengeliSar(A, 34, 2) === CL.dengeliSar(A, 42, 2), J(CL.dengeliSar(A, 42, 2)));
ok("a SONRA (28 karakter, 3 satıra izin): iki satırlık tek sığan bölme ağır olduğundan üç satır, ağır kırılım yok",
  CL.dengeliSar(A, 28, 3) === "Bu işi gerçekten\nyapabilir misin,\nyoksa bırakalım mı?", J(CL.dengeliSar(A, 28, 3)));
/*
 * 2 × 28 sert sınırı: "misin,"den sonra kırmak ilk satırı 33 karaktere çıkarır; 28'e sığan TEK iki satırlık bölme
 * "yapabilir\nmisin". maxChars ve maxLines sert sınır kaldığından motor o bölmeyi verir (kelime düşmez, satır taşmaz).
 */
ok("a, 2 × 28: sert sınırlar içinde başka iki satırlık bölme yok; tek sığan bölme verilir (satır 28'i aşmaz)",
  CL.dengeliSar(A, 28, 2).split("\n").length === 2 && CL.dengeliSar(A, 28, 2).split("\n").every(function (s) { return s.length <= 28; }));
ok("b ÖNCE (eski kural): belirleyici 'bir' satır sonunda asılı", CL.dengeliSar(B, 30, 2, false) === "Bugün size çok önemli bir\nşey anlatacağım arkadaşlar", J(CL.dengeliSar(B, 30, 2, false)));
ok("b SONRA: 'bir şey' birlikte, satırlar 30'u aşmaz", CL.dengeliSar(B, 30, 2) === "Bugün size çok önemli bir şey\nanlatacağım arkadaşlar" &&
  CL.dengeliSar(B, 30, 2, "tr") === CL.dengeliSar(B, 30, 2), J(CL.dengeliSar(B, 30, 2)));
ok("b, Türkçe olmayan dilde (en / de) Türkçe kuralı uygulanmaz (eski en dengeli kırılım)",
  CL.dengeliSar(B, 30, 2, "en") === CL.dengeliSar(B, 30, 2, false) && CL.dengeliSar(B, 30, 2, "de") === CL.dengeliSar(B, 30, 2, false));
ok("sayı + birim ve unvan + ad dengeliSar'da birlikte kalır",
  CL.dengeliSar("Toplam 1.250 TL ödedik ve 3 ayda bitirdik", 22, 2) === "Toplam 1.250 TL ödedik\nve 3 ayda bitirdik" &&
  CL.dengeliSar("Dr. Ayşe Yılmaz bugün bizimle burada", 20, 2) === "Dr. Ayşe Yılmaz\nbugün bizimle burada" &&
  CL.dengeliSar("Bugün tam 10 bin kişiye ulaştık arkadaşlar", 24, 2).indexOf("10\nbin") === -1);

/* ---------------- 8) kenar durumlar ---------------- */
ok("boş metin, tek kelime, yalnız noktalama: dengeliSar düşmez, metin aynı",
  CL.dengeliSar("", 30, 2) === "" && CL.dengeliSar("Merhaba", 3, 2) === "Merhaba" && CL.dengeliSar("?", 30, 2) === "?");
var emojili = "Bugün 🔥 çok güzel bir gün oldu 🎉 arkadaşlar";
ok("emoji ve Arapça metinde kelime düşmez, satırlar sınırda", [emojili, "هذا نص عربي طويل جدا للاختبار هنا، ثم نكمل"].every(function (t) {
  var r = CL.dengeliSar(t, 24, 2);
  return r.replace(/\n/g, " ") === t && r.split("\n").every(function (s) { return s.length <= 24; });
}), J(CL.dengeliSar(emojili, 24, 2)));
// 94 karakter: 3 × 40 / 42 / 48'e sığar (3 × 36'da "misiniz,"den sonra kırmak ilk satırı 40 yapar: tek sığan bölme ağır)
ok("3 satırda da sert sınırlar (her satır ≤ maxChars, ≤ maxLines satır), kelime sırası korunur, soru eki satır başında değil", (function () {
  var t = "Peki bu işi gerçekten yapabilir misiniz, yoksa bırakalım mı? Çünkü zaman çok kısa ve bütçe yok";
  return [[40, 3], [42, 3], [48, 3]].every(function (x) {
    var r = CL.dengeliSar(t, x[0], x[1]);
    return r.replace(/\n/g, " ") === t && r.split("\n").length <= x[1] && r.split("\n").every(function (s) { return s.length <= x[0]; }) && !/\nmisiniz/.test(r);
  });
})());

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
