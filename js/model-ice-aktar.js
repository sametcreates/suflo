/*
 * Suflo — çevrimdışı model içe aktarma (saf, DOM'suz, durumsuz modül; 3.4 adım 19)
 *
 * Kurumsal ağda huggingface.co'ya ulaşılamayan kullanıcı modeli başka bir bilgisayarda indirip
 * Ayarlar › Motor › "Model dosyası içe aktar" ile kurar. Bu modül kararları verir; dosya
 * kopyalama, SHA-256 doğrulaması (KEngine modelDogrula) ve onay pencereleri js/engine.js'te:
 *
 *   basligiDenetle(bas, boyut)  ilk 4 bayt küçük-sonlu "ggml" imzası (0x67676d6c), boyut 1 MB'tan
 *                               büyük (Git-LFS işaretçisi reddedilir) ve en çok 4 GB.
 *   katalogEslestir(ad, MODELS) dosya adından katalog kimliği (nicemlenmiş adlar dahil:
 *                               ggml-large-v3-turbo-q5_0.bin -> turbo; tarayıcının " (1)" eki,
 *                               "ggml-" öneki olmayan ad ve büyük harf tolere edilir).
 *   aileTahmin(ad, MODELS)      katalogda olmayan ama tanıdık aile (ör. turbo q8_0): uyarı metni için.
 *   ozelDosyaAdi(ad, katalog)   bilinmeyen ggml dosyası yalnız "Özel model" olarak, katalog
 *                               adlarıyla çakışmayan güvenli bir adla (ozel-*.bin) kurulur.
 *
 * Fikir: Raunen (MIT) importModelFile / inspectModelFile. Kod Suflo'nun kendi (temiz oda).
 * Çalışma ortamı: CEF 74 / Node 12.3 (ES5).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloModelIceAktar = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var MAGIC = 0x67676d6c;            // "ggml", küçük-sonlu: baytlar 6c 6d 67 67
  var ALT_SINIR = 1048576;           // 1 MB: üstünde olmalı (LFS işaretçisi ~130 bayt)
  var UST_SINIR = 4 * 1073741824;    // 4 GB: en büyük whisper modeli (large f16) ~3,1 GB
  var PART_EKI = ".ice-aktar.part";  // indirmenin .part / .part.json dosyalarıyla çakışmaz

  function bayt(bas, i) {
    if (!bas || bas.length <= i) return -1;
    var b = bas[i];
    return typeof b === "number" ? (b & 255) : -1;
  }

  function sihirliSayi(bas) {
    if (bayt(bas, 3) < 0) return -1;
    return ((bayt(bas, 0)) | (bayt(bas, 1) << 8) | (bayt(bas, 2) << 16)) + bayt(bas, 3) * 16777216;
  }

  function asciiBas(bas, n) {
    var s = "";
    for (var i = 0; i < n; i++) {
      var b = bayt(bas, i);
      if (b < 0) break;
      s += String.fromCharCode(b);
    }
    return s;
  }

  /*
   * bas: dosyanın ilk baytları (Buffer / Uint8Array / dizi, en az 4). boyut: bayt.
   * Döner: { ok: true } ya da { ok: false, kod: "lfs"|"kucuk"|"buyuk"|"gguf"|"magic"|"okunamadi", mesaj }
   */
  function basligiDenetle(bas, boyut) {
    boyut = Number(boyut) || 0;
    var ilk = asciiBas(bas, 4);
    if (boyut <= ALT_SINIR) {
      if (ilk === "vers") {
        return { ok: false, kod: "lfs", mesaj: "Bu dosya model değil, Git LFS işaretçisi (yalnız birkaç yüz bayt). Modeli Hugging Face'teki indirme (resolve) bağlantısından indir." };
      }
      return { ok: false, kod: "kucuk", mesaj: "Dosya model olamayacak kadar küçük (1 MB ya da daha az). İndirme yarım kalmış olabilir." };
    }
    if (boyut > UST_SINIR) {
      return { ok: false, kod: "buyuk", mesaj: "Dosya 4 GB'tan büyük: whisper.cpp modeli olamaz." };
    }
    if (bayt(bas, 3) < 0) return { ok: false, kod: "okunamadi", mesaj: "Dosyanın başı okunamadı." };
    if (ilk === "GGUF") {
      return { ok: false, kod: "gguf", mesaj: "Bu bir GGUF dosyası; Suflo'nun motoru (whisper.cpp) ggml biçiminde .bin model ister." };
    }
    if (sihirliSayi(bas) !== MAGIC) {
      return { ok: false, kod: "magic", mesaj: "Bu dosya whisper.cpp modeli değil (ggml imzası yok)." };
    }
    return { ok: true };
  }

  function dosyaAdi(yol) {
    return String(yol || "").replace(/^.*[\\\/]/, "");
  }

  // Tarayıcı / işletim sistemi kopya eklerini ve büyük harfi temizle; "ggml-" önekini tamamla
  function adNormal(ad) {
    var s = dosyaAdi(ad).toLowerCase().trim();
    s = s.replace(/\s*\(\d+\)(?=\.bin$)/, "")              // "x (1).bin"
      .replace(/\s*-\s*(kopya|copy)(\s*\(\d+\))?(?=\.bin$)/, "") // "x - Kopya.bin"
      .replace(/\s+/g, "");
    if (!/\.bin$/.test(s)) return "";
    if (s.indexOf("ggml-") !== 0) s = "ggml-" + s;
    return s;
  }

  // katalog: [{ id, file }] (KEngine.MODELS). Döner: eşleşen öğe ya da null
  function katalogEslestir(ad, katalog) {
    var n = adNormal(ad);
    if (!n) return null;
    var liste = katalog || [];
    for (var i = 0; i < liste.length; i++) {
      if (liste[i] && liste[i].file && String(liste[i].file).toLowerCase() === n) return liste[i];
    }
    return null;
  }

  /*
   * Katalog modeli için boyut denetimi: KEngine.installedModels beklenenin %85'inden küçük dosyayı
   * kurulu saymaz. Çevrimdışı ("doğrulanmadı") içe aktarılan yarım dosya kurulmuş gibi görünüp
   * listede çıkmasın diye kopyalamadan önce reddedilir.
   */
  function katalogBoyutDenetle(item, boyut) {
    var mb = Number(item && item.sizeMB) || 0;
    if (!mb || Number(boyut) > mb * 1048576 * 0.85) return { ok: true };
    var ad = String(item.label || item.file || "").split(" —")[0];
    return {
      ok: false, kod: "yarim",
      mesaj: "Dosya " + ad + " için beklenenden küçük (" + Math.round(Number(boyut) / 1048576) + " MB, beklenen ~" + mb + " MB): indirme yarım kalmış olabilir."
    };
  }

  var NICEM_RE =/-(q\d(?:_[0-9k])?(?:_[a-z])?|f16|f32)$/;

  // "ggml-large-v3-turbo-q8_0.bin" -> { aile: "large-v3-turbo", nicem: "q8_0", id: "turbo" }
  function aileTahmin(ad, katalog) {
    var n = adNormal(ad);
    if (!n) return null;
    var govde = n.replace(/^ggml-/, "").replace(/\.bin$/, "");
    var m = NICEM_RE.exec(govde);
    var nicem = m ? m[1] : "";
    var aile = m ? govde.slice(0, m.index) : govde;
    var liste = katalog || [];
    for (var i = 0; i < liste.length; i++) {
      var f = String(liste[i] && liste[i].file || "").toLowerCase().replace(/^ggml-/, "").replace(/\.bin$/, "");
      var fm = NICEM_RE.exec(f);
      var fAile = fm ? f.slice(0, fm.index) : f;
      if (fAile && fAile === aile) return { aile: aile, nicem: nicem, id: liste[i].id };
    }
    return { aile: aile, nicem: nicem, id: "" };
  }

  // Özel model için güvenli, katalogla çakışmayan dosya adı (ozel-<ad>.bin, en çok 80 karakter)
  function ozelDosyaAdi(ad, katalog) {
    var g = dosyaAdi(ad).toLowerCase().replace(/\.bin$/i, "").replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "").replace(/^ozel-/, "");
    if (!g) g = "model";
    g = g.slice(0, 70);
    var s = "ozel-" + g + ".bin";
    var liste = katalog || [];
    for (var i = 0; i < liste.length; i++) {
      if (liste[i] && String(liste[i].file).toLowerCase() === s) { s = "ozel-" + g + "-1.bin"; break; }
    }
    return s;
  }

  function ozelModelKaydi(file, boyut) {
    var mb = Math.max(1, Math.round((Number(boyut) || 0) / 1048576));
    return {
      id: "ozel:" + file,
      file: file,
      sizeMB: mb,
      label: "Özel model — " + file.replace(/^ozel-/, "").replace(/\.bin$/, ""),
      note: "içe aktarıldı, doğrulanmadı",
      ozel: true
    };
  }

  // settings.ozelModeller listesine ekle / güncelle (aynı dosya bir kez); bozuk girdileri at
  function ozelListeyeEkle(liste, kayit) {
    var out = [];
    (Array.isArray(liste) ? liste : []).forEach(function (x) {
      if (!x || typeof x.file !== "string" || !/^ozel-[a-z0-9._-]+\.bin$/.test(x.file)) return;
      if (kayit && x.file === kayit.file) return;
      out.push({ file: x.file, sizeMB: Number(x.sizeMB) || 1 });
    });
    if (kayit) out.push({ file: kayit.file, sizeMB: kayit.sizeMB });
    return out;
  }

  /* ---------------- Onay metinleri (engine.js sorar, app.js gösterir) ---------------- */

  function ozelUyari(ad, aile) {
    var tanidik = aile && aile.id ? " (" + aile.aile + (aile.nicem ? " " + aile.nicem : "") + ": katalogdaki sürümden farklı)" : "";
    return "Bu dosya Suflo'nun model kataloğunda yok" + tanidik + ". Doğruluğu denetlenemez ve DTW ön ayarı uygulanmaz. Yalnız güvendiğin bir kaynaktan aldıysan devam et. Özel model olarak eklensin mi?";
  }

  function dogrulanmadiSorusu(etiket) {
    return "İnternete ulaşılamadığı için " + etiket + " SHA-256 ile doğrulanamadı (doğrulanmadı). Dosyayı güvendiğin bir kaynaktan aldıysan kurulsun mu?";
  }

  function ustuneYazSorusu(file) {
    return "Model klasöründe zaten " + file + " var. Mevcut model silinip içe aktarılan dosya yerine konsun mu?";
  }

  return {
    MAGIC: MAGIC,
    ALT_SINIR: ALT_SINIR,
    UST_SINIR: UST_SINIR,
    PART_EKI: PART_EKI,
    basligiDenetle: basligiDenetle,
    dosyaAdi: dosyaAdi,
    adNormal: adNormal,
    katalogEslestir: katalogEslestir,
    katalogBoyutDenetle: katalogBoyutDenetle,
    aileTahmin: aileTahmin,
    ozelDosyaAdi: ozelDosyaAdi,
    ozelModelKaydi: ozelModelKaydi,
    ozelListeyeEkle: ozelListeyeEkle,
    ozelUyari: ozelUyari,
    dogrulanmadiSorusu: dogrulanmadiSorusu,
    ustuneYazSorusu: ustuneYazSorusu
  };
});
