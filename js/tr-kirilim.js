/*
 * Suflo — Türkçe-duyarlı satır / kart kırılım cezası (kalite motoru, parti 1)
 *
 * kirilimCezasi(solKelime, sagKelime, dil) -> sayı
 *   Satır (ya da kart) solKelime'den SONRA, sagKelime'den ÖNCE kırılırsa ne kadar kötü?
 *   0 iyi kırılım, büyük kötü, eksi ödül (virgülden / cümle sonundan sonra kırmak).
 *   AGIR (10) ve üstü "ağır" kırılımdır: sığan başka bir kırılım varsa hiç seçilmez (caption-layout.js
 *   parcalaCezali önce ağır kırılım sayısını, sonra toplam cezayı, sonra dengeyi en aza indirir).
 *
 * Kurallar (tablolar küçük ve aşağıda belgeli):
 *   tr / az (tam Türkçe kuralları):
 *     satır BAŞINDA ceza: soru eki mi/mı/mu/mü ve kişi / zaman ekli hâlleri (misin, mıyım, musunuz, müydü,
 *       miymiş…; sonda noktalama olabilir) AĞIR; ayrı yazılan de/da (bağlaç da olsa önceki kelimeyle kalır),
 *       "ki" (dedi ki), "değil" ve çekimleri, son çekim edatları (gibi, kadar, için, ile, göre, sonra, önce,
 *       beri, karşı, rağmen, dolayı, boyunca)
 *     satır SONUNDA ceza: bir, bu, şu, o, her, hiç, en, çok, daha, ve, ile, ya, veya, ama, fakat, çünkü, eğer, hem
 *   en: satır sonunda a / an / the / of / to / and (hafif)
 *   dil verilmezse ("", "auto", undefined): tr + en birlikte (panelin ve stil motorunun varsayılanı)
 *   başka / bilinmeyen dil: yalnız noktalama ve sayı kuralları
 *   her dilde:
 *     - sayı biriminden ya da başka sayıdan ayrılmaz: "10 bin", "100 TL", "3 ayda", "1.250 TL", "2026 yılında" (AĞIR)
 *     - unvan addan ayrılmaz: "Dr. Ayşe", "Prof. Ali", "Mr. Smith" (AĞIR; unvanın noktası cümle sonu sayılmaz)
 *     - sıra sayısı ardındaki küçük harfli kelimeden ayrılmaz: "2. sırada", "3. kez" (AĞIR; nokta cümle sonu sayılmaz)
 *     - yalnız noktalamadan oluşan belirteç ("?", "—") satır başına, tek başına açılış tırnağı («, “, ¿) satır
 *       sonuna düşmez (AĞIR)
 *     - , ; : — ve Arapça / Doğu Asya virgülünden sonra kırmak ödül; cümle sonundan (. ! ? …) sonra daha büyük ödül
 *   Satırı noktalamayla biten kelimeden sonraki kırılımda sağdaki edat / bağlaç cezası uygulanmaz ("…, sonra eve").
 *
 * Eşleştirme Türkçe-duyarlı küçük harfle: İ/I/ı/i aynı harf sayılır (toLocaleUpperCase("tr") ile büyütülmüş
 * "Mİ", "MI" ve dil bilmeden büyütülmüş "BIR" de tutar); *vurgu* yıldızları ve kesme işaretinden sonrası
 * (TL'ye, 2026'da) yok sayılır.
 *
 * Saf UMD modülü: DOM yok, ES5 (CEF 74 / Node 12.3).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloTrKirilim = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var AGIR = 10;          // ağır kırılım eşiği (soru eki, sayı + birim, unvan + ad, tek noktalama)
  var CEZA = 6;           // Türkçe edat / bağlaç / belirleyici
  var HAFIF = 3;          // İngilizce işlev kelimesi, sayıdan sonra sıradan kelime
  var ODUL_CUMLE = -6;    // cümle sonundan sonra kırmak
  var ODUL_VIRGUL = -4;   // , ; : — sonrası

  function tablo(liste) { var t = {}; for (var i = 0; i < liste.length; i++) t[liste[i]] = true; return t; }
  // Tablolar anahtar() biçiminde: küçük harf, ı → i
  var TR_SON = tablo(["bir", "bu", "şu", "o", "her", "hiç", "en", "çok", "daha", "ve", "ile", "ya", "veya", "ama", "fakat", "çünkü", "eğer", "hem"]);
  var TR_BAS = tablo(["gibi", "kadar", "için", "ile", "göre", "sonra", "önce", "beri", "karşi", "rağmen", "dolayi", "boyunca", "de", "da", "ki"]);
  // Soru eki: mi / mu / mü (ı → i) ve kişi / zaman ekleri. "müdür" (yönetici) ad olarak da yaygın: dışarıda
  var SORU_EKI = /^m[iuü](?:y?[iuü]m|s[iuü]n(?:[iuü]z)?|y[iuü]z|d[iuü]r(?:lar|ler)?|yd[iuü](?:m|n|k|n[iuü]z|lar|ler)?|ym[iuü]ş(?:[iuü]m|s[iuü]n|[iuü]z|s[iuü]n[iuü]z|lar|ler)?|yse|yken)?$/;
  var DEGIL = /^değil/;
  var EN_SON = tablo(["a", "an", "the", "of", "to", "and"]);
  // Unvanlar (noktalı ya da noktasız): ardındaki addan ayrılmaz
  var UNVAN = tablo(["dr.", "prof.", "doç.", "av.", "öğr.", "sn.", "sayin", "op.", "uzm.", "müh.", "yrd.", "mr.", "mrs.", "ms.", "st.",
    "dr", "prof", "doç", "mr", "mrs"]);
  /*
   * Sayıdan sonra gelip ondan ayrılmayan birimler. Uzun birimler ekli de tutar ("yılında", "binlerce", "kişiye");
   * kısalar (TL, km, kg…) yalnız kendisi ya da kesmeli eki ("TL'ye" → "tl"). "ay" kısa ama ekleri sayılı.
   */
  var BIRIM_UZUN = /^(bin|milyon|milyar|trilyon|lira|kuruş|dolar|euro|avro|sterlin|saniye|dakika|saat|gün|hafta|yil|sene|yaş|kilo|gram|metre|litre|kişi|adet|tane|derece|bölüm|sayfa|puan|yüzde|thousand|million|billion|trillion|percent|dollar|euro|pound|year|month|week|day|hour|minute|second|people|times)/;
  var BIRIM_KISA = /^(tl|usd|eur|try|gbp|sn|dk|sa|kg|gr|g|ton|km|m|cm|mm|lt|ml|k|kb|mb|gb|tb|px|fps|hz|khz|mhz|ghz|x|%|\$|€|₺|£|ay(da|dan|a|i|lik|lar|larca|dir|in|ini|inda)?)$/;
  // Sayıdan ÖNCE gelip ondan ayrılmayanlar: para işareti, "yüzde", "No."
  var SAYI_ONU = tablo(["$", "€", "₺", "£", "%", "yüzde", "no.", "no", "nr.", "sayi", "madde"]);
  // Sayı belirteci (1.250 · 3,5 · 10:30 · %50 · 2026'da); sağdaki sayı kesmeli ek alabilir
  var SAYI = /^[%$€₺£]?[+\-−]?\d[\d.,:\/]*(?:[%$€₺£]|['’]\S*)?$/;
  var SAYI_YALIN = /^[%$€₺£]?[+\-−]?\d[\d.,:\/]*[%$€₺£]?$/;
  // Satırın sonunda: cümle sonu / virgül türü noktalama (kapanış tırnağı, parantez kalabilir)
  var CUMLE_SONU = /[.!?…؟。！？]["'”’»)\]]*$/;
  var VIRGUL = /[,;:—–،、，；：]["'”’»)\]]*$/;
  // Yalnız noktalamadan oluşan belirteç ("?", "—", "...", "«"); emoji ve semboller sayılmaz
  var YALNIZ_NOKTALAMA = /^[.,!?;:…\-–—"'«»“”‘’„()\[\]{}¿¡؟،、。，！？・\/|~_]+$/;
  var ACILIS = /^[«“"'‘„(\[¿¡]+$/;
  // Sıra sayısı (1-3 hane + nokta) ve küçük harfle başlayan sonraki kelime (Türkçe harfler dahil)
  var SIRA_SAYISI = /^\d{1,3}\.$/;
  var KUCUK_BAS = /^[a-zçğıöşüâîû]/;

  // Dil kipi: "tr" (tam Türkçe), "en", "tr+en" (varsayılan), "" (yalnız noktalama + sayı)
  function dilKipi(dil) {
    if (dil === undefined || dil === null) return "tr+en";
    var d = String(dil).toLowerCase().replace(/^\s+|\s+$/g, "");
    if (d === "" || d === "auto" || d === "tr+en") return "tr+en";
    d = d.slice(0, 2);
    if (d === "tr" || d === "az") return "tr";
    if (d === "en") return "en";
    return "";
  }

  // Eşleştirme anahtarı: *vurgu* yıldızı yok, Türkçe-duyarlı küçük harf (İ/I/ı → i), birleşik nokta atılır
  function kucuk(s) {
    return String(s == null ? "" : s).replace(/\*/g, "").replace(/İ/g, "i").replace(/I/g, "i").toLowerCase()
      .replace(/̇/g, "").replace(/ı/g, "i");
  }
  // Baştaki / sondaki noktalama ve tırnak atılmış hâli; kesme işaretinden sonrası (ek) atılır
  function govde(s) {
    var k = kucuk(s).replace(/^["'“‘«(\[¿¡]+/, "").replace(/["'”’»)\]]+$/, "");
    return k.replace(/[.,!?;:…؟،、，！？。—–\-]+$/, "").split(/['’]/)[0];
  }
  function noktalamaMi(s) { return YALNIZ_NOKTALAMA.test(String(s == null ? "" : s).replace(/\*/g, "")); }
  function birimMi(g) { return BIRIM_UZUN.test(g) || BIRIM_KISA.test(g); }

  /*
   * sol: satırın son kelimesi, sag: sonraki satırın ilk kelimesi. Döner: ceza (sayı).
   */
  function kirilimCezasi(sol, sag, dil) {
    var kip = dilKipi(dil);
    var tr = kip === "tr" || kip === "tr+en", en = kip === "en" || kip === "tr+en";
    var solHam = String(sol == null ? "" : sol).replace(/\*/g, "");
    var sagHam = String(sag == null ? "" : sag).replace(/\*/g, "");
    if (!solHam || !sagHam) return 0;
    var solK = kucuk(solHam), solG = govde(solHam), sagG = govde(sagHam);
    var ceza = 0;
    // yalnız noktalamadan oluşan belirteç satır başına düşmez ("Quoi ?", " — "); açılış tırnağı satır sonunda kalmaz
    if (noktalamaMi(sagHam) && !ACILIS.test(sagHam)) ceza += AGIR;
    if (ACILIS.test(solHam)) ceza += AGIR;
    // unvan + ad (unvanın noktası cümle sonu değildir)
    var unvan = !!UNVAN[solK];
    if (unvan && !noktalamaMi(sagHam)) return ceza + AGIR;
    // sayı + birim / sayı, para işareti + sayı
    var solSayi = SAYI_YALIN.test(solHam), sagSayi = SAYI.test(sagHam);
    if (solSayi && !VIRGUL.test(solHam) && !CUMLE_SONU.test(solHam)) {
      if (sagSayi || birimMi(sagG)) ceza += AGIR;
      else ceza += HAFIF;
    } else if (sagSayi && SAYI_ONU[solK]) ceza += AGIR;
    // sıra sayısı ("2. sırada", "1. Dünya" değil küçük harfle süren): nokta cümle sonu değil, ardındaki addan ayrılmaz
    if (SIRA_SAYISI.test(solHam) && KUCUK_BAS.test(sagHam)) return ceza + AGIR;
    // noktalamayla biten satır: yeni yan cümle başlar; sağdaki edat / bağlaç cezası yok
    if (CUMLE_SONU.test(solHam) && !unvan) return ceza + ODUL_CUMLE;
    if (VIRGUL.test(solHam) || solHam === "—" || solHam === "–") return ceza + ODUL_VIRGUL;
    if (tr) {
      if (SORU_EKI.test(sagG) && sagG !== "müdür") ceza += AGIR;
      else if (TR_BAS[sagG] || DEGIL.test(sagG)) ceza += CEZA;
      if (TR_SON[solG]) ceza += CEZA;
    }
    if (en && EN_SON[solG] && !(tr && TR_SON[solG])) ceza += HAFIF;
    return ceza;
  }

  return {
    kirilimCezasi: kirilimCezasi,
    dilKipi: dilKipi,
    AGIR: AGIR,
    CEZA: CEZA,
    HAFIF: HAFIF,
    ODUL_CUMLE: ODUL_CUMLE,
    ODUL_VIRGUL: ODUL_VIRGUL
  };
});
