/*
 * Suflo — kullanıcı MOGRT şablonunun süresi ve importMGT ayak izi (saf, DOM'suz, durumsuz modül)
 *
 * seq.importMGT şablonu kendi TAM süresiyle (overwrite) bırakır, klibin ucu ancak sonra altyazının bitişine kırpılır
 * ve kırpma ezilen klibi geri getirmez. Altyazı › Stil › Premiere şablonu yolu (js/captions.js mogrtStiliniUygula)
 * bu yüzden izi her altyazının başından başı + şablon süresine kadar boş ister: KS_prepareCaptionMogrt'a grubun ayak
 * izi, KS_placeCaptionMogrt'a "iz" (şablon süresi) gider (jsx/host.jsx). Altyazı Efektleri'nin paketteki 1 saatlik
 * şablonu için aynı kural js/caption-mogrt-json.js izAraligi'nde.
 *
 *   sablonSuresi(oku, boyut, ac): .mogrt (zip) içindeki definition.json › sourceInfoLocalized.<dil>.duration
 *     { value, scale } → saniye (diller arasında en uzunu). oku(konum, uzunluk) → Buffer / Uint8Array: dosyadan yalnız
 *     sondaki merkez dizin ve definition.json okunur (şablonun videoları / görselleri okunmaz). ac(veri) → Buffer:
 *     deflate açıcı (Node zlib.inflateRawSync). Okunamazsa (zip değil, zip64, şifreli, alan yok ya da bozuk) 0.
 *   zipGirdisi(oku, boyut, ad, ac): zip'ten tek bir girdinin baytları (ya da null).
 *   tanimSuresi(def): ayrıştırılmış definition.json'dan süre (sn) ya da 0.
 *   izSuresi(sure): süre bilinmiyorsa (0) temkinli VARSAYILAN_SURE (60 sn).
 *   ayakIzi(cues, sure): { start, end } (sn) — ilk başlangıçtan max(bitiş, başlangıç + süre)'nin en büyüğüne.
 *
 * Dosya sistemine dokunmaz (dosyayı panel açar: js/captions.js mogrtIzSuresi). Çalışma ortamı: CEF 74 / Node 12 (ES5).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloMogrtSure = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // Süre okunamazsa ayak izi: tipik altyazı şablonu birkaç saniye; daha uzunu da yeni üst ize düşer
  var VARSAYILAN_SURE = 60;
  var TANIM = "definition.json";
  // Zip sonundaki kayıt (EOCD) 22 bayt + en çok 65535 baytlık yorum
  var EOCD_EN_COK = 22 + 65535;
  // definition.json birkaç KB; sınırlar bozuk / garip arşivde belleği korur
  var SINIR = { dizin: 8 * 1024 * 1024, sikisik: 8 * 1024 * 1024, acik: 32 * 1024 * 1024 };

  function u16(b, i) { return b && b.length >= i + 2 ? b[i] | (b[i + 1] << 8) : -1; }
  function u32(b, i) { return b && b.length >= i + 4 ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 16777216 : -1; }

  // Buffer ise UTF-8; Uint8Array ise bayt bayt (JSON'un sayıları ASCII, yanlış çözülen harf ayrıştırmayı bozmaz)
  function metin(b) {
    if (!b) return "";
    if (typeof b.readUInt32LE === "function") return b.toString("utf8");
    var s = "";
    for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, Array.prototype.slice.call(b, i, i + 8192));
    return s;
  }

  function zipGirdisi(oku, boyut, ad, ac) {
    try {
      boyut = Number(boyut);
      if (!(boyut >= 22)) return null;
      var kuyrukUz = Math.min(boyut, EOCD_EN_COK);
      var kuyruk = oku(boyut - kuyrukUz, kuyrukUz);
      if (!kuyruk || kuyruk.length < 22) return null;
      var e = -1;
      for (var i = kuyruk.length - 22; i >= 0; i--) {
        if (kuyruk[i] === 0x50 && kuyruk[i + 1] === 0x4b && kuyruk[i + 2] === 5 && kuyruk[i + 3] === 6 &&
            i + 22 + u16(kuyruk, i + 20) <= kuyruk.length) { e = i; break; }
      }
      if (e < 0) return null;
      var adet = u16(kuyruk, e + 10), dizinUz = u32(kuyruk, e + 12), dizinKonum = u32(kuyruk, e + 16);
      // zip64 (0xFFFF / 0xFFFFFFFF işaretleri) desteklenmez: süre bilinmiyor sayılır
      if (adet === 0xffff || dizinUz === 0xffffffff || dizinKonum === 0xffffffff) return null;
      if (!(adet > 0) || !(dizinUz >= 46) || dizinUz > SINIR.dizin || dizinKonum + dizinUz > boyut) return null;
      var dizin = oku(dizinKonum, dizinUz);
      if (!dizin || dizin.length < dizinUz) return null;
      var aranan = String(ad).toLowerCase();
      for (var k = 0, p = 0; k < adet && p + 46 <= dizin.length; k++) {
        if (u32(dizin, p) !== 0x02014b50) return null;
        var bayrak = u16(dizin, p + 8), yontem = u16(dizin, p + 10);
        var sikisik = u32(dizin, p + 20), acik = u32(dizin, p + 24);
        var adUz = u16(dizin, p + 28), ekUz = u16(dizin, p + 30), yorumUz = u16(dizin, p + 32);
        var yerel = u32(dizin, p + 42);
        var girdiAdi = metin(dizin.slice(p + 46, p + 46 + adUz)).replace(/^\.?\//, "").toLowerCase();
        p += 46 + adUz + ekUz + yorumUz;
        if (girdiAdi !== aranan) continue;
        // şifreli (bit 0) okunamaz; yalnız saklı (0) ve deflate (8)
        if ((bayrak & 1) || (yontem !== 0 && yontem !== 8) || (yontem === 8 && typeof ac !== "function")) return null;
        if (sikisik > SINIR.sikisik || acik > SINIR.acik || yerel + 30 > boyut) return null;
        var lh = oku(yerel, 30);
        if (u32(lh, 0) !== 0x04034b50) return null;
        var veriKonum = yerel + 30 + u16(lh, 26) + u16(lh, 28);
        if (veriKonum + sikisik > boyut) return null;
        var veri = oku(veriKonum, sikisik);
        if (!veri || veri.length < sikisik) return null;
        return yontem === 8 ? ac(veri) : veri;
      }
      return null;
    } catch (err) { return null; }
  }

  function oranSure(d) {
    if (!d || typeof d !== "object") return 0;
    var v = Number(d.value), sc = Number(d.scale);
    if (!(v > 0) || !(sc > 0)) return 0;
    var s = v / sc;
    return isFinite(s) && s > 0 ? s : 0;
  }

  function tanimSuresi(def) {
    if (!def || typeof def !== "object") return 0;
    var en = 0, loc = def.sourceInfoLocalized;
    if (loc && typeof loc === "object") {
      for (var dil in loc) {
        if (Object.prototype.hasOwnProperty.call(loc, dil) && loc[dil]) en = Math.max(en, oranSure(loc[dil].duration));
      }
    }
    return en;
  }

  function sablonSuresi(oku, boyut, ac) {
    var ham = zipGirdisi(oku, boyut, TANIM, ac);
    if (!ham) return 0;
    try { return tanimSuresi(JSON.parse(metin(ham).replace(/^﻿/, ""))); } catch (e) { return 0; }
  }

  function izSuresi(sure) {
    var s = Number(sure);
    return s > 0 && isFinite(s) ? s : VARSAYILAN_SURE;
  }

  function ayakIzi(cues, sure) {
    var c = cues || [];
    if (!c.length) return { start: 0, end: 0 };
    var iz = izSuresi(sure), bas = Infinity, son = 0;
    for (var i = 0; i < c.length; i++) {
      var a = Math.max(0, Number(c[i].start) || 0), b = Number(c[i].end) || 0;
      bas = Math.min(bas, a);
      son = Math.max(son, b, a + iz);
    }
    return { start: bas, end: son };
  }

  return {
    VARSAYILAN_SURE: VARSAYILAN_SURE,
    zipGirdisi: zipGirdisi,
    tanimSuresi: tanimSuresi,
    sablonSuresi: sablonSuresi,
    izSuresi: izSuresi,
    ayakIzi: ayakIzi
  };
});
