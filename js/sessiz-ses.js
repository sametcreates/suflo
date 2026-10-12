/*
 * Suflo — Sessiz ses denetimi
 *
 * Altyazı motoru (yerel ya da bulut) çalışmadan ÖNCE hazırlanan sesin tepe genliğine bakar.
 * Ses kanalları kapalı / sessize alınmış bir sekans ya da sesi ayrı dosyada duran bir klip
 * neredeyse tamamen sessiz bir WAV üretir; motor o zaman dakikalarca çalışıp "[BLANK_AUDIO]"
 * ya da halüsinasyon döndürür, bulut yedeğinde API kotası boşa harcanır. Tepe 0,001'in
 * (yaklaşık -60 dBFS) altındaysa panel kullanıcıya sorar: "Yine de devam et" / "Vazgeç".
 *
 *   wavBasligi(oku, boyut)             -> { bicim, kanal, oran, bit, veriBas, veriBoyut } | null
 *   tepeOlcer(bilgi)                   -> { besle(buf, n), tepe, ornek }  (parça sınırını aşan örnek taşınır)
 *   dosyaTepesi(fs, yol, secenek)      -> { tepe, ornek, tam, bilgi } | null   (fs.readSync, 1 MB parçalar)
 *   dosyaTepesiAsync(fs, yol, secenek) -> Promise (aynısı; arada olay döngüsüne nefes aldırır)
 *   volumedetectTepe(stderr)           -> ffmpeg volumedetect "max_volume" satırından doğrusal tepe | NaN
 *   sessizMi(tepe, esik)               -> tepe < esik
 *   denetle({ tepe, esik, karar, onay }) -> Promise<{ sessiz, tepe, devam, soruldu }>
 *
 * Saf UMD modülü: DOM yok; dosya sistemi enjekte edilir (Node testleri sahte fs verir).
 * ES5 (CEF 74 / Node 12.3). Fikir Raunen'in tepe < 0.001 uyarısından; kod Suflo'nun kendi.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloSessizSes = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var ESIK = 0.001;                 // ~ -60 dBFS
  var PARCA = 1048576;              // 1 MB okuma parçası
  var NEFES = 16;                   // async okumada her 16 parçada bir olay döngüsüne dön

  function dbfs(tepe) {
    return tepe > 0 ? 20 * Math.log(tepe) / Math.LN10 : -Infinity;
  }

  function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 16777216; }
  function u16(b, i) { return b[i] | (b[i + 1] << 8); }
  function kimlik(b, i) { return String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]); }

  /*
   * RIFF/WAVE başlığını parça parça gez: ffmpeg "LIST", Premiere "bext"/"JUNK" parçası
   * ekleyebilir, veri her zaman 44. baytta başlamaz.
   *   oku(konum, uzunluk) -> Buffer (dosyanın o kısmı; sonda kısa olabilir)
   *   boyut: dosya boyutu (bayt)
   * Desteklenen: PCM tamsayı (8/16/24/32 bit) ve IEEE kayan nokta (32/64 bit), WAVE_FORMAT_EXTENSIBLE dahil.
   */
  function wavBasligi(oku, boyut) {
    if (!(boyut >= 12)) return null;
    var b = oku(0, 12);
    if (!b || b.length < 12 || kimlik(b, 0) !== "RIFF" || kimlik(b, 8) !== "WAVE") return null;
    var konum = 12, fmt = null;
    for (var adim = 0; adim < 64 && konum + 8 <= boyut; adim++) {
      var h = oku(konum, 8);
      if (!h || h.length < 8) return null;
      var ad = kimlik(h, 0), uzun = u32(h, 4);
      if (ad === "fmt ") {
        var f = oku(konum + 8, Math.min(uzun, 64));
        if (!f || f.length < 16) return null;
        var bicim = u16(f, 0);
        if (bicim === 0xFFFE && f.length >= 26) bicim = u16(f, 24);   // EXTENSIBLE: alt biçim GUID'in ilk iki baytı
        fmt = { bicim: bicim, kanal: u16(f, 2), oran: u32(f, 4), bit: u16(f, 14) };
      } else if (ad === "data") {
        if (!fmt) return null;
        var bas = konum + 8;
        // akıştan yazılmış WAV'da boyut 0 ya da 0xFFFFFFFF olabilir: dosya sonuna kadar oku
        var veri = (uzun > 0 && uzun !== 0xFFFFFFFF && bas + uzun <= boyut) ? uzun : boyut - bas;
        var tamsayi = fmt.bicim === 1 && (fmt.bit === 8 || fmt.bit === 16 || fmt.bit === 24 || fmt.bit === 32);
        var kayan = fmt.bicim === 3 && (fmt.bit === 32 || fmt.bit === 64);
        if (!tamsayi && !kayan) return null;
        return { bicim: fmt.bicim, kanal: fmt.kanal, oran: fmt.oran, bit: fmt.bit, veriBas: bas, veriBoyut: Math.max(0, veri) };
      }
      konum += 8 + uzun + (uzun & 1);
    }
    return null;
  }

  /*
   * Akış hâlinde tepe |s| ölçer. besle(buf, n): buf'ın ilk n baytı (varsayılan tamamı).
   * Örnek parça sınırına düşerse (24 bit, tek baytlık okuma) eksik baytlar sonraki parçaya taşınır.
   * Tepe 0..1 (tam ölçek 1). Kanallar ayrılmaz: tüm kanalların en büyüğü.
   */
  function tepeOlcer(bilgi) {
    var bayt = Math.max(1, (bilgi.bit / 8) | 0);
    var kayan = bilgi.bicim === 3;
    var artik = [];
    var o = { tepe: 0, ornek: 0 };

    function ornekDegeri(b, i) {
      var v;
      if (kayan) {
        v = bayt === 4 ? b.readFloatLE(i) : b.readDoubleLE(i);
        v = Math.abs(v);
        return v === v ? Math.min(v, 1e9) : 0;     // NaN -> 0
      }
      if (bayt === 1) return Math.abs(b[i] - 128) / 128;
      if (bayt === 2) { v = b[i] | (b[i + 1] << 8); if (v >= 32768) v -= 65536; return Math.abs(v) / 32768; }
      if (bayt === 3) { v = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16); if (v >= 8388608) v -= 16777216; return Math.abs(v) / 8388608; }
      v = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);   // 32 bit işaretli
      return Math.abs(v) / 2147483648;
    }

    o.besle = function (buf, n) {
      if (!buf) return o;
      n = n === undefined ? buf.length : Math.min(n, buf.length);
      var i = 0;
      if (artik.length) {
        while (artik.length < bayt && i < n) artik.push(buf[i++]);
        if (artik.length < bayt) return o;
        var tek = artikTampon(artik);
        var v0 = ornekDegeri(tek, 0);
        if (v0 > o.tepe) o.tepe = v0;
        o.ornek++;
        artik = [];
      }
      var tepe = o.tepe, sayac = 0;
      var son = n - ((n - i) % bayt);
      if (!kayan && bayt === 2) {
        // sıcak yol (16 bit, Suflo'nun 16 kHz WAV'ı): satır içi, tamsayı karşılaştırma
        var enBuyuk = 0;
        for (; i < son; i += 2) {
          var s = buf[i] | (buf[i + 1] << 8);
          if (s >= 32768) s = 65536 - s;          // |negatif|; -32768 -> 32768 (tam ölçek)
          if (s > enBuyuk) enBuyuk = s;
          sayac++;
        }
        if (enBuyuk / 32768 > tepe) tepe = enBuyuk / 32768;
      } else {
        for (; i < son; i += bayt) {
          var v = ornekDegeri(buf, i);
          if (v > tepe) tepe = v;
          sayac++;
        }
      }
      o.tepe = tepe;
      o.ornek += sayac;
      for (; i < n; i++) artik.push(buf[i]);
      return o;
    };
    return o;
  }

  function artikTampon(dizi) {
    if (typeof Buffer !== "undefined" && Buffer.from) return Buffer.from(dizi);
    return new Uint8Array(dizi);
  }
  function tampon(n) {
    if (typeof Buffer !== "undefined" && Buffer.alloc) return Buffer.alloc(n);
    return new Uint8Array(n);
  }

  // fs ile dosyanın bir kısmını oku (başlık gezinmesi için)
  function okuyucu(fs, fd) {
    return function (konum, uzun) {
      var b = tampon(Math.max(0, uzun));
      var n = uzun > 0 ? fs.readSync(fd, b, 0, uzun, konum) : 0;
      return n < b.length ? b.slice(0, n) : b;
    };
  }

  function hazirla(fs, yol, secenek) {
    secenek = secenek || {};
    var boyut = fs.statSync(yol).size;
    var fd = fs.openSync(yol, "r");
    var bilgi;
    try { bilgi = wavBasligi(okuyucu(fs, fd), boyut); }
    catch (e) { try { fs.closeSync(fd); } catch (e2) {} throw e; }
    if (!bilgi) { try { fs.closeSync(fd); } catch (e3) {} return null; }
    var parca = Math.max(1, Number(secenek.parca) || PARCA);
    return {
      fd: fd, bilgi: bilgi, parca: parca, buf: tampon(parca), olcer: tepeOlcer(bilgi),
      konum: bilgi.veriBas, son: bilgi.veriBas + bilgi.veriBoyut,
      // esik verilirse tepe eşiği geçer geçmez durulur (normal seste ilk parçada biter)
      dur: secenek.esik > 0 ? Number(secenek.esik) : Infinity
    };
  }
  // Bir parça oku; devam edilecekse true
  function adim(fs, d) {
    if (d.konum >= d.son || d.olcer.tepe >= d.dur) return false;
    var istek = Math.min(d.parca, d.son - d.konum);
    var n = fs.readSync(d.fd, d.buf, 0, istek, d.konum);
    if (!(n > 0)) return false;
    d.olcer.besle(d.buf, n);
    d.konum += n;
    return d.konum < d.son && d.olcer.tepe < d.dur;
  }
  function sonuc(fs, d) {
    try { fs.closeSync(d.fd); } catch (e) {}
    return { tepe: d.olcer.tepe, ornek: d.olcer.ornek, tam: d.konum >= d.son, bilgi: d.bilgi };
  }

  /*
   * WAV dosyasının tepe genliği. fs: Node fs (openSync/readSync/statSync/closeSync).
   *   secenek.esik  bu değere ulaşınca okumayı bırak (tam: false); verilmezse dosyanın tamamı
   *   secenek.parca okuma parçası (bayt, varsayılan 1 MB)
   * WAV değilse ya da biçim desteklenmiyorsa null.
   */
  function dosyaTepesi(fs, yol, secenek) {
    var d = hazirla(fs, yol, secenek);
    if (!d) return null;
    try { while (adim(fs, d)) {} }
    catch (e) { sonuc(fs, d); throw e; }
    return sonuc(fs, d);
  }

  // Aynısı, Promise: uzun sessiz dosyada panel donmasın diye her NEFES parçada bir olay döngüsüne döner
  function dosyaTepesiAsync(fs, yol, secenek) {
    return new Promise(function (resolve, reject) {
      var d;
      try { d = hazirla(fs, yol, secenek); } catch (e) { reject(e); return; }
      if (!d) { resolve(null); return; }
      function tur() {
        try {
          for (var k = 0; k < NEFES; k++) {
            if (!adim(fs, d)) { resolve(sonuc(fs, d)); return; }
          }
        } catch (e) { sonuc(fs, d); reject(e); return; }
        setTimeout(tur, 0);
      }
      tur();
    });
  }

  /*
   * ffmpeg -af volumedetect çıktısı: "[Parsed_volumedetect_0 @ 0x..] max_volume: -23.4 dB".
   * Bulut rotasının MP3'ü dönüştürülürken ölçülür (ayrı bir okuma yok). "-inf dB" -> 0.
   * Satır yoksa NaN (bilinmiyor: denetim atlanır).
   */
  function volumedetectTepe(stderr) {
    var m = /max_volume:\s*(-?inf|-?[\d.]+)\s*dB/i.exec(String(stderr == null ? "" : stderr));
    if (!m) return NaN;
    if (/inf/i.test(m[1])) return m[1].charAt(0) === "-" ? 0 : Infinity;
    var db = parseFloat(m[1]);
    return isFinite(db) ? Math.pow(10, db / 20) : NaN;
  }

  function sessizMi(tepe, esik) {
    var e = esik > 0 ? esik : ESIK;
    return typeof tepe === "number" && isFinite(tepe) && tepe >= 0 && tepe < e;
  }

  /*
   * Denetim akışı (panelden bağımsız):
   *   o.tepe   ölçülen tepe (bilinmiyorsa null/NaN: denetim atlanır, devam)
   *   o.esik   eşik (varsayılan 0,001)
   *   o.karar  toplu işte paylaşılan karar nesnesi: { devam: true|false } bir kez sorulunca dolar,
   *            sonraki sessiz klipler yeniden sorulmaz
   *   o.onay   function(bilgi) -> bool | Promise<bool>  ("Yine de devam et" = true, "Vazgeç" = false)
   * Döner: Promise<{ sessiz, tepe, devam, soruldu }>
   */
  function denetle(o) {
    o = o || {};
    var tepe = o.tepe;
    var sessiz = sessizMi(tepe, o.esik);
    if (!sessiz) return Promise.resolve({ sessiz: false, tepe: tepe, devam: true, soruldu: false });
    var karar = o.karar || null;
    if (karar && typeof karar.devam === "boolean") {
      return Promise.resolve({ sessiz: true, tepe: tepe, devam: karar.devam, soruldu: false });
    }
    var bilgi = { tepe: tepe, dbfs: dbfs(tepe), esik: o.esik > 0 ? o.esik : ESIK };
    return Promise.resolve(typeof o.onay === "function" ? o.onay(bilgi) : false).then(function (cevap) {
      var devam = cevap === true;
      if (karar) karar.devam = devam;
      return { sessiz: true, tepe: tepe, devam: devam, soruldu: true };
    });
  }

  return {
    ESIK: ESIK,
    PARCA: PARCA,
    dbfs: dbfs,
    wavBasligi: wavBasligi,
    tepeOlcer: tepeOlcer,
    dosyaTepesi: dosyaTepesi,
    dosyaTepesiAsync: dosyaTepesiAsync,
    volumedetectTepe: volumedetectTepe,
    sessizMi: sessizMi,
    denetle: denetle
  };
});
