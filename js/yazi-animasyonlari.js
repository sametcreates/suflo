/*
 * Suflo — Yazı animasyonları kataloğu (animasyon motoru v2)
 *
 * Altyazı Efektleri'nin (styleId "efekt") "Animasyon" seçimi. Bir animasyon seçilince giriş animasyonunun da
 * vurgu (etkin kelime) animasyonunun da yerini alır; kelime vurgusu rengi (*anahtar kelime* dahil), gölge, kutu,
 * konum, güvenli alan ve hareket şiddeti geçerli kalır. anim "" = klasik (giriş + vurgu ayrı; çıktı eskisiyle aynı).
 *
 * Her kayıt:
 *   id        ascii, kebab ("kelime-pop"); stil motoru (js/style-engine.js) yalnız bu kimlikleri kabul eder
 *   ad        Türkçe görünen ad (i18n/en.js'te İngilizcesi)
 *   kategori  "kart" | "kelime" | "harf" | "karaoke" | "surekli" (seçicinin grupları)
 *   aciklama  bir cümle
 *   klasik    { giris, aktif }: en yakın klasik çift. Premiere yerel çıktı (MOGRT sözleşmesi yalnız textAnim 0-5 /
 *             hlAnim 0-3 bilir), After Effects planı, eski paneller ve suflo.app/stil bununla gösterir
 *   ae        "tam" | "yakin" | "yok": After Effects çıktısındaki karşılığı (şimdilik geçici; AE'de klasik çift çizilir)
 *   sure      hareketin Dengeli şiddetteki süresi (ms); stil motoru bunu şiddete böler (Yumuşak uzun, Sert kısa).
 *             daktilo'da kelime başına üst sınır (harfler kelimenin söylenişine yayılır)
 *
 * Hepsi Suflo'nun kendi animasyonlarıdır; hiçbir üçüncü taraf şablonundan / ön ayarından alınmadı.
 * Saf veri (DOM, Premiere, dosya sistemi yok). ES5, UMD (Node 12 / CEF 74). index.html'de style-engine.js'ten ÖNCE yüklenir.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloYaziAnimasyon = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // Seçicinin grup sırası ve adları (boş grup listelenmez)
  var KATEGORILER = [
    { id: "kelime", ad: "Kelime kelime" },
    { id: "harf", ad: "Harf harf" },
    { id: "kart", ad: "Kart girişi" },
    { id: "karaoke", ad: "Konuşulan kelime" },
    { id: "surekli", ad: "Sürekli" }
  ];

  var ANIMASYONLAR = [
    { id: "kelime-pop", ad: "Kelime pop", kategori: "kelime", aciklama: "Her kelime söylendiği anda küçükten büyüyüp yerine oturur; önceki kelimeler kalır.",
      klasik: { giris: "pop", aktif: "yok" }, ae: "yok", sure: 220 },
    { id: "yukari-suzul", ad: "Yukarı süzül", kategori: "kelime", aciklama: "Her kelime söylendiği anda biraz aşağıdan belirerek yukarı süzülür.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "yok", sure: 320 },
    { id: "dalga", ad: "Dalga", kategori: "kelime", aciklama: "Kart açılırken kelimeler sırayla dalgalanarak gelir ve durulur.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "yok", sure: 420 },
    { id: "zipla-gel", ad: "Zıplayarak gel", kategori: "kelime", aciklama: "Her kelime yukarıdan düşer, hafifçe sekip yerine oturur.",
      klasik: { giris: "asagi", aktif: "yok" }, ae: "yok", sure: 380 },
    { id: "daktilo", ad: "Daktilo", kategori: "harf", aciklama: "Her kelime söylenirken harf harf yazılır.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yok", sure: 600 },
    { id: "harf-belir", ad: "Harf harf belir", kategori: "harf", aciklama: "Kart açılırken harfler sırayla yumuşakça belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yok", sure: 350 },
    { id: "netles", ad: "Netleş", kategori: "kart", aciklama: "Kart bulanıktan netleşerek belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yakin", sure: 350 },
    { id: "yandan-kay", ad: "Yandan kay", kategori: "kart", aciklama: "Kart soldan yavaşlayarak kayıp belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yakin", sure: 380 },
    { id: "aralik-acil", ad: "Sinematik aralık", kategori: "kart", aciklama: "Harf aralığı genişten normale kapanırken kart belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yakin", sure: 450 },
    { id: "olcek-darbe", ad: "Ölçek darbesi", kategori: "karaoke", aciklama: "Konuşulan kelime kısa bir darbeyle büyüyüp geri döner.",
      klasik: { giris: "yok", aktif: "zipla" }, ae: "yok", sure: 180 },
    { id: "renk-gecis", ad: "Renk geçişi", kategori: "karaoke", aciklama: "Konuşulan kelime vurgu rengine yumuşakça geçer, bitince geri döner.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "yok", sure: 120 },
    { id: "sallanma", ad: "Sallanma", kategori: "karaoke", aciklama: "Konuşulan kelime iki kez hafifçe sağa sola sallanır.",
      klasik: { giris: "yok", aktif: "titre" }, ae: "yok", sure: 320 }
  ];

  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function kopya(o) { return JSON.parse(JSON.stringify(o)); }

  var DIZIN = {};
  ANIMASYONLAR.forEach(function (a) { DIZIN[a.id] = a; });

  // Kimliğin kaydı (kopya) ya da null; "" ve bilinmeyen kimlik null
  function bul(id) { return typeof id === "string" && own(DIZIN, id) ? kopya(DIZIN[id]) : null; }
  function kimlikler() { return ANIMASYONLAR.map(function (a) { return a.id; }); }
  // Geçerli kimlik ya da "" (klasik)
  function dogrula(id) { return typeof id === "string" && own(DIZIN, id) ? id : ""; }
  // En yakın klasik giriş / vurgu çifti; "" ya da bilinmeyen kimlikte null
  function klasik(id) { return own(DIZIN, id) ? kopya(DIZIN[id].klasik) : null; }
  // Seçicinin grupları: [{ id, ad, animasyonlar: [{ id, ad, aciklama }] }] KATEGORILER sırasıyla; boş grup yok
  function gruplar() {
    return KATEGORILER.map(function (k) {
      return { id: k.id, ad: k.ad, animasyonlar: ANIMASYONLAR.filter(function (a) { return a.kategori === k.id; })
        .map(function (a) { return { id: a.id, ad: a.ad, aciklama: a.aciklama }; }) };
    }).filter(function (g) { return g.animasyonlar.length > 0; });
  }

  return {
    ANIMASYONLAR: kopya(ANIMASYONLAR),
    KATEGORILER: kopya(KATEGORILER),
    bul: bul,
    kimlikler: kimlikler,
    dogrula: dogrula,
    klasik: klasik,
    gruplar: gruplar
  };
});
