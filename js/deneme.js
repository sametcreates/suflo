/*
 * Suflo — Pro'yu dene: her araca 3 kalıcı deneme hakkı
 *
 * Ücretsiz kullanıcı, yalnız kodla çalışan her Pro aracını kendi videosunda 3 kez
 * dener. Haklar süresiz; hak yalnız işlem BAŞARIYLA bitince düşer (pro.js kurar,
 * çağıran modül başarı dalında harcar). İçerik kütüphaneleri (MOGRT, SFX, Motion BG,
 * preset, Pro paketi, altyazı MOGRT stilleri), toplu klip, stilli ASS dışa aktarma,
 * Shorts paketi ve çoklu kamera listede YOK: onların hakkı her zaman 0.
 *
 * Durum: { v: 1, kullanilan: { cut: 1, zoom: 3, … } } — harcanan hak sayısı tutulur,
 * böylece iki depo (dosya + localStorage) birleşirken büyük olan kazanır ve bir deponun
 * silinmesi hakları geri doldurmaz. İmza/okuma pro.js'te; bu modül saf: DOM'a, dosyaya,
 * ağa dokunmaz.
 *
 * Satın alma sonrası temiz yeniden oluşturma için deneme çıktılarının (filigranlı stilli
 * katman / kanca başlığı) kaydı da burada doğrulanır ve sınırlanır.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloDeneme = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var HAK = 3;
  var SURUM = 1;
  var OZELLIKLER = ["cut", "textcut", "highlights", "zoom", "transitions", "audioclean", "overlay", "translate", "beat"];
  // Ayarlar'daki liste ve bildirimler için kısa adlar
  var AD = {
    cut: "Otomatik kesim",
    textcut: "Konuşmadan kes",
    highlights: "Viral anlar",
    zoom: "Otomatik zoom",
    transitions: "Geçişler",
    audioclean: "Sesi iyileştir",
    overlay: "Stilli altyazı ve kanca başlığı",
    translate: "Çeviri",
    beat: "Ritim"
  };
  var ANAHTAR = /^[A-Za-z]{1,32}$/;   // "__proto__" gibi anahtarlar geçersiz sayılır
  var UST_SINIR = 1000;               // makul olmayan sayılar (elle düzenleme) geçersiz

  function sahip(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function nesneMi(o) { return !!o && typeof o === "object" && Object.prototype.toString.call(o) === "[object Object]"; }
  function listede(f) { return OZELLIKLER.indexOf(String(f)) !== -1; }

  function bos() { return { v: SURUM, kullanilan: {} }; }

  // Bozuk ya da kurcalanmış depo için: hiç hak kalmamış durum (sıfırlama DEĞİL)
  function tukenmis() {
    var s = bos();
    OZELLIKLER.forEach(function (f) { s.kullanilan[f] = HAK; });
    return s;
  }

  function gecerliMi(s) {
    if (!nesneMi(s) || s.v !== SURUM || !nesneMi(s.kullanilan)) return false;
    for (var k in s.kullanilan) {
      if (!sahip(s.kullanilan, k)) continue;
      var n = s.kullanilan[k];
      if (!ANAHTAR.test(k)) return false;
      if (typeof n !== "number" || !isFinite(n) || Math.floor(n) !== n || n < 0 || n > UST_SINIR) return false;
    }
    return true;
  }

  // Bilinmeyen (daha yeni sürümün eklediği) anahtarlar korunur: eski sürüme dönen kullanıcı onları kaybetmez
  function kopya(s) {
    var out = bos();
    if (!gecerliMi(s)) return out;
    for (var k in s.kullanilan) if (sahip(s.kullanilan, k)) out.kullanilan[k] = s.kullanilan[k];
    return out;
  }

  function kullanildi(s, f) {
    if (!gecerliMi(s) || !sahip(s.kullanilan, f)) return 0;
    return Math.min(HAK, s.kullanilan[f]);
  }

  function kalan(s, f) {
    if (!listede(f) || !gecerliMi(s)) return 0;
    return Math.max(0, HAK - kullanildi(s, f));
  }

  // Değiştirmez; yeni durum döner. Geçersiz giriş → tükenmiş (hata durumunda hak açılmaz).
  function harca(s, f) {
    if (!gecerliMi(s)) return tukenmis();
    var out = kopya(s);
    if (!listede(f)) return out;
    var n = sahip(out.kullanilan, f) ? out.kullanilan[f] : 0;
    if (n < HAK) out.kullanilan[f] = n + 1;
    return out;
  }

  // Her özellik için harcananın BÜYÜĞÜ: depolardan biri silinse de haklar geri dolmaz
  function birlestir(a, b) {
    var out = kopya(a), ek = kopya(b);
    for (var k in ek.kullanilan) {
      if (!sahip(ek.kullanilan, k)) continue;
      var x = sahip(out.kullanilan, k) ? out.kullanilan[k] : 0;
      out.kullanilan[k] = Math.max(x, ek.kullanilan[k]);
    }
    return out;
  }

  function ozet(s) {
    var toplam = 0;
    var liste = OZELLIKLER.map(function (f) {
      var k = kalan(s, f);
      toplam += k;
      return { id: f, ad: AD[f], kalan: k, hak: HAK };
    });
    return { hak: HAK, toplamKalan: toplam, ozellikler: liste };
  }

  function harcamaMesaji(k) {
    k = Math.max(0, Math.round(Number(k) || 0));
    return k > 0 ? "1 deneme hakkı kullanıldı · " + k + " kaldı" : "1 deneme hakkı kullanıldı · bu araçta hakkın bitti";
  }

  /* ---------------- Deneme çıktıları (temiz yeniden oluşturma) ---------------- */

  var CIKTI_MAX = 10;
  var CIKTI_TURLERI = ["altyazi", "kanca"];
  var FONT_ADI = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,80}\.(ttf|otf)$/i;   // yalnız dosya adı: yol yok

  function pozitif(n) { return typeof n === "number" && isFinite(n) && n > 0; }

  function ciktiGecerliMi(k) {
    if (!nesneMi(k) || CIKTI_TURLERI.indexOf(k.tur) === -1) return false;
    if (typeof k.path !== "string" || !k.path || typeof k.sequenceId !== "string" || !k.sequenceId) return false;
    if (typeof k.assTemiz !== "string" || k.assTemiz.indexOf("[Events]") === -1) return false;
    if (typeof k.start !== "number" || !isFinite(k.start) || k.start < 0) return false;
    if (!pozitif(k.g) || !pozitif(k.y) || !pozitif(k.fps) || !pozitif(k.sure)) return false;
    if (Math.floor(k.g) !== k.g || Math.floor(k.y) !== k.y || k.g > 16384 || k.y > 16384) return false;
    if (!Array.isArray(k.fontFiles) || !k.fontFiles.every(function (f) { return typeof f === "string" && FONT_ADI.test(f) && f.indexOf("..") === -1; })) return false;
    return true;
  }

  // En yeni CIKTI_MAX kayıt kalır; aynı dosyanın eski kaydı yenisiyle değişir
  function ciktiEkle(liste, k) {
    var out = (Array.isArray(liste) ? liste : []).filter(function (x) { return ciktiGecerliMi(x) && (!k || x.path !== k.path); });
    if (ciktiGecerliMi(k)) out.push(k);
    return out.slice(-CIKTI_MAX);
  }

  function ciktiSil(liste, yol) {
    return (Array.isArray(liste) ? liste : []).filter(function (x) { return ciktiGecerliMi(x) && x.path !== yol; });
  }

  return {
    HAK: HAK, SURUM: SURUM, OZELLIKLER: OZELLIKLER.slice(), AD: AD, CIKTI_MAX: CIKTI_MAX,
    listede: listede, bos: bos, tukenmis: tukenmis, gecerliMi: gecerliMi, kalan: kalan, harca: harca,
    birlestir: birlestir, ozet: ozet, harcamaMesaji: harcamaMesaji,
    ciktiGecerliMi: ciktiGecerliMi, ciktiEkle: ciktiEkle, ciktiSil: ciktiSil
  };
});
