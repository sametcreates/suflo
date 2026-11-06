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
 *   kategori  "kart" | "kelime" | "harf" | "karaoke" | "surekli" | "autocaptions" (seçicinin grupları)
 *   aciklama  bir cümle
 *   klasik    { giris, aktif }: en yakın klasik çift. Premiere yerel çıktı (MOGRT sözleşmesi yalnız textAnim 0-5 /
 *             hlAnim 0-3 bilir), After Effects planı, eski paneller ve suflo.app/stil bununla gösterir
 *   ae        "tam" | "yakin" | "yok": After Effects çıktısındaki karşılığı (js/ae-plan.js aeDestegi ile aynı; test
 *             denetler): tam yerel metin animatörü / katman anahtarı, yakin yerel ama farkı uyarıda, yok klasik çift + uyarı
 *   sure      hareketin Dengeli şiddetteki süresi (ms); stil motoru bunu şiddete böler (Yumuşak uzun, Sert kısa).
 *             daktilo'da kelime başına üst sınır (harfler kelimenin söylenişine yayılır)
 *   renkler   (isteğe bağlı) animasyonun kullandığı ek renk alanları: "vurguKutuRenk" (vurgu kutusunun rengi; boşsa
 *             vurgu rengi), "vurguRenk2" (ikinci vurgu rengi; boşsa vurgu renginden türetilir: ikinciVurgu)
 *
 *   koleksiyon (isteğe bağlı) "autocaptions": AutoCaptions koleksiyonu (kategori "autocaptions"; aşağıdaki not)
 *
 * AutoCaptions koleksiyonu dışındakiler Suflo'nun kendi animasyonlarıdır; hiçbir üçüncü taraf şablonundan / ön ayarından
 * alınmadı. AutoCaptions koleksiyonu ClashiVFX AutoCaptions'ın hareketlerinin yazarın izniyle yeniden kurulmuş hâlidir
 * (THIRD_PARTY_NOTICES.md).
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
    { id: "surekli", ad: "Sürekli" },
    // AutoCaptions koleksiyonu (ClashiVFX AutoCaptions'ın giriş hareketleri; yazarın izniyle, aşağıda)
    { id: "autocaptions", ad: "AutoCaptions" }
  ];

  var ANIMASYONLAR = [
    { id: "kelime-pop", ad: "Kelime pop", kategori: "kelime", aciklama: "Her kelime söylendiği anda küçükten büyüyüp yerine oturur; önceki kelimeler kalır.",
      klasik: { giris: "pop", aktif: "yok" }, ae: "yakin", sure: 220 },
    { id: "yukari-suzul", ad: "Yukarı süzül", kategori: "kelime", aciklama: "Her kelime söylendiği anda biraz aşağıdan belirerek yukarı süzülür.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "yakin", sure: 320 },
    { id: "dalga", ad: "Dalga", kategori: "kelime", aciklama: "Kart açılırken kelimeler sırayla dalgalanarak gelir ve durulur.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "yakin", sure: 420 },
    { id: "zipla-gel", ad: "Zıplayarak gel", kategori: "kelime", aciklama: "Her kelime yukarıdan düşer, hafifçe sekip yerine oturur.",
      klasik: { giris: "asagi", aktif: "yok" }, ae: "yakin", sure: 380 },
    { id: "daktilo", ad: "Daktilo", kategori: "harf", aciklama: "Her kelime söylenirken harf harf yazılır.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 600 },
    { id: "harf-belir", ad: "Harf harf belir", kategori: "harf", aciklama: "Kart açılırken harfler sırayla yumuşakça belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yakin", sure: 350 },
    { id: "netles", ad: "Netleş", kategori: "kart", aciklama: "Kart bulanıktan netleşerek belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 350 },
    { id: "yandan-kay", ad: "Yandan kay", kategori: "kart", aciklama: "Kart soldan yavaşlayarak kayıp belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 380 },
    { id: "aralik-acil", ad: "Sinematik aralık", kategori: "kart", aciklama: "Harf aralığı genişten normale kapanırken kart belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 450 },
    { id: "olcek-darbe", ad: "Ölçek darbesi", kategori: "karaoke", aciklama: "Konuşulan kelime kısa bir darbeyle büyüyüp geri döner.",
      klasik: { giris: "yok", aktif: "zipla" }, ae: "tam", sure: 180 },
    { id: "renk-gecis", ad: "Renk geçişi", kategori: "karaoke", aciklama: "Konuşulan kelime vurgu rengine yumuşakça geçer, bitince geri döner.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "tam", sure: 120 },
    { id: "sallanma", ad: "Sallanma", kategori: "karaoke", aciklama: "Konuşulan kelime iki kez hafifçe sağa sola sallanır.",
      klasik: { giris: "yok", aktif: "titre" }, ae: "tam", sure: 320 },
    /*
     * Parti 5: karaoke ve vurgu ailesi (kelimenin ölçülen zamanına bağlı) ve hareket ailesi. sure: dolguda vurgunun
     * önceki kelimeden çekilişi, kutuda kutunun belirişi, çizgide çizginin akışı, parlamada nabzın periyodu, nefeste
     * nefesin periyodu (hepsi Dengeli; şiddete bölünür). renkler: animasyonun kullandığı ek renk alanları (panel bu
     * renk seçicileri yalnız bu animasyonlar seçiliyken gösterir).
     */
    { id: "karaoke-dolgu", ad: "Karaoke dolgu", kategori: "karaoke", aciklama: "Konuşulan kelime söylenirken soldan sağa vurgu rengiyle dolar.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "yakin", sure: 150 },
    { id: "karaoke-birikimli", ad: "Biriken vurgu", kategori: "karaoke", aciklama: "Söylenen kelimeler vurgu renginde kalır; kart konuşuldukça boyanır.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "tam", sure: 120 },
    { id: "vurgu-kutusu", ad: "Vurgu kutusu", kategori: "karaoke", aciklama: "Konuşulan kelimenin arkasında dolu bir kutu kelimeden kelimeye atlar.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "yok", sure: 90, renkler: ["vurguKutuRenk"] },
    { id: "vurgu-cizgi", ad: "Vurgu çizgisi", kategori: "karaoke", aciklama: "Konuşulan kelimenin altında vurgu renginde bir çizgi soldan sağa akar.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "yok", sure: 240 },
    { id: "parlama", ad: "Parlama", kategori: "karaoke", aciklama: "Konuşulan kelimenin çevresinde vurgu renginde yumuşak bir ışıltı yavaşça nabız atar.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "yok", sure: 1000 },
    { id: "iki-ton", ad: "İki ton", kategori: "karaoke", aciklama: "Konuşulan ve *anahtar* kelimeler sırayla iki vurgu rengi alır.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "yakin", sure: 120, renkler: ["vurguRenk2"] },
    { id: "kromatik-yumusak", ad: "Yumuşak kromatik", kategori: "karaoke", aciklama: "Konuşulan kelimenin iki renkli gölgesi yanlardan kayıp onunla birleşir; titreme yok.",
      klasik: { giris: "yok", aktif: "yok" }, ae: "yok", sure: 220, renkler: ["vurguRenk2"] },
    { id: "buyuyen-vurgu", ad: "Büyüyen vurgu", kategori: "kelime", aciklama: "*Anahtar* kelime (yoksa kartın en uzun kelimesi) iri durur ve söylendiğinde patlayarak gelir.",
      klasik: { giris: "yok", aktif: "zipla" }, ae: "yakin", sure: 240 },
    { id: "dusus", ad: "Düşüş", kategori: "kelime", aciklama: "Kart açılırken kelimeler sırayla yukarıdan düşer, iki kez sönümlenerek sekip oturur.",
      klasik: { giris: "asagi", aktif: "yok" }, ae: "yakin", sure: 520 },
    { id: "kapak-cevir", ad: "Kapak çevir", kategori: "kart", aciklama: "Kart yatay ekseni çevresinde arkadan öne dönerek belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yakin", sure: 420 },
    { id: "donerek", ad: "Dönerek gel", kategori: "kart", aciklama: "Kart hafifçe eğik ve küçük başlar, dönerek düzelir ve tam boyuna gelir.",
      klasik: { giris: "pop", aktif: "yok" }, ae: "tam", sure: 400 },
    { id: "perde", ad: "Perde", kategori: "kart", aciklama: "Kart alttan yukarı açılan bir perdenin ardından ortaya çıkar.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "yakin", sure: 450 },
    { id: "nefes", ad: "Nefes", kategori: "surekli", aciklama: "Kart sakin bir nefes gibi çok hafifçe büyüyüp küçülür; podcast için.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 1200 },
    /*
     * AutoCaptions koleksiyonu (koleksiyon: "autocaptions"). ClashiVFX AutoCaptions eklentisinin giriş hareketleri
     * (Smooth Slide, Smooth Blur Slide, Smooth Flicker Slide, Smooth Glow Slide, Flicker, Blur & Flicker, Motion Blur,
     * Rough, Stretch, Zoom In, Slide from Right, Word by Word), yazarın izniyle Suflo'nun anahtar kare motorunda yeniden
     * kuruldu: süre ve eğriler eklentinin ön ayar verisinden (styles/motion-metadata.json, premiere-motion-metadata.json),
     * kod ya da .ffx / .prfpset dosyası alınmadı. Farklar: kırpışlar Suflo'nun ışığa duyarlılık kuralına göre tek
     * sönüşe indirildi (eklentide 250 ms'de üç); yön bulanıklığı ve kenar pürüzü eşit bulanıklıkla yaklaşık.
     */
    { id: "yumusak-kay", ad: "Yumuşak kayış", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart aşağıdan yavaşlayarak yerine kayar, yarı saydamdan tam görünür olur.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "tam", sure: 420 },
    { id: "bulanik-kay", ad: "Bulanık kayış", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart aşağıdan kayarken bulanıktan netleşir.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "tam", sure: 600 },
    { id: "titrek-kay", ad: "Kırpışan kayış", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart aşağıdan kayarken bir kez kırpışıp tam görünür olur.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "tam", sure: 540 },
    { id: "isilti-kay", ad: "Işıltılı kayış", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart aşağıdan kayarken yumuşak bir ışıltının içinden netleşir.",
      klasik: { giris: "yukari", aktif: "yok" }, ae: "yakin", sure: 420 },
    { id: "kirpis", ad: "Kırpış", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart belirir, bir kez kırpışır ve yerinde kalır.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 360 },
    { id: "bulanik-kirpis", ad: "Bulanık kırpış", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart bulanık belirir, bir kez kırpışırken netleşir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 360 },
    { id: "hiz-bulanik", ad: "Hız bulanıklığı", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart soldan hızla gelir, hareket bulanıklığı dinerek netleşir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yakin", sure: 300 },
    { id: "puruzlu", ad: "Pürüzlü giriş", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart dağınık ve bulanık başlar, hafifçe küçülerek netleşir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "yakin", sure: 540 },
    { id: "esnet", ad: "Esneyerek gel", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart yatayda geniş başlar ve esneyerek normal genişliğine döner.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 340 },
    { id: "yakinlas", ad: "Yakınlaş", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart büyük başlar ve kameraya yaklaşır gibi boyuna oturur.",
      klasik: { giris: "pop", aktif: "yok" }, ae: "tam", sure: 380 },
    { id: "sagdan-kay", ad: "Sağdan kay", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Kart sağdan yavaşlayarak kayıp belirir.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 380 },
    { id: "kelime-belir", ad: "Kelime kelime belir", kategori: "autocaptions", koleksiyon: "autocaptions",
      aciklama: "Her kelime söylendiği anda hareketsiz belirir; önceki kelimeler kalır.",
      klasik: { giris: "fade", aktif: "yok" }, ae: "tam", sure: 100 }
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
  // Animasyonun kullandığı ek renk alanları (kopya; yoksa [])
  function renkAlanlari(id) { return own(DIZIN, id) && DIZIN[id].renkler ? DIZIN[id].renkler.slice() : []; }

  /* ---------------- Renk yardımcıları (türetilmiş renkler; stil motoru ve panel aynısını kullanır) ---------------- */

  var HEX6 = /^#[0-9a-f]{6}$/i;
  function rgbDizi(hex) { var h = String(hex).slice(1); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function hexYaz(r, g, b) {
    return "#" + [r, g, b].map(function (v) { return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join("");
  }
  // WCAG göreli parlaklık ve kontrast oranı (1-21)
  function parlaklik(hex) {
    var c = rgbDizi(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function kontrast(a, b) {
    if (!HEX6.test(a) || !HEX6.test(b)) return 1;
    var x = parlaklik(a), y = parlaklik(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /*
   * İkinci vurgu rengi (vurguRenk2 boşken): vurgu renginin tamamlayıcısı (ton 180° döner), doygunluk en az %55,
   * açıklık %50-72 (beyaz yazı ve koyu kontur yanında seçilir). Geçersiz girdi: Suflo moru.
   */
  function ikinciVurgu(hex) { return tonKaydir(hex, 180); }
  // Rengin tonu derece kadar döner (doygunluk en az %55, açıklık %50-72); geçersiz girdi: Suflo moru
  function tonKaydir(hex, derece) {
    if (!HEX6.test(hex)) return "#8b7cf6";
    var c = rgbDizi(hex).map(function (v) { return v / 255; });
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0;
    if (d > 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === c[0]) h = ((c[1] - c[2]) / d) % 6;
      else if (mx === c[1]) h = (c[2] - c[0]) / d + 2;
      else h = (c[0] - c[1]) / d + 4;
      h *= 60;
    }
    h = ((h + (Number(derece) || 0)) % 360 + 360) % 360;
    s = Math.max(0.55, Math.min(1, s));
    l = Math.max(0.5, Math.min(0.72, l));
    var C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((h / 60) % 2 - 1)), m = l - C / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = C; g = X; } else if (h < 120) { r = X; g = C; } else if (h < 180) { g = C; b = X; }
    else if (h < 240) { g = X; b = C; } else if (h < 300) { r = X; b = C; } else { r = C; b = X; }
    return hexYaz((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  /*
   * Zemin (vurgu kutusu) üstünde okunacak yazı rengi: tercih (yazı rengi) zeminle WCAG ≥ 4,5 ise o; değilse siyah ya
   * da beyazdan kontrastı yüksek olanı.
   */
  function kontrastRengi(zemin, tercih) {
    if (!HEX6.test(zemin)) return HEX6.test(tercih) ? tercih.toLowerCase() : "#ffffff";
    if (HEX6.test(tercih) && kontrast(zemin, tercih) >= 4.5) return tercih.toLowerCase();
    return kontrast(zemin, "#000000") >= kontrast(zemin, "#ffffff") ? "#000000" : "#ffffff";
  }

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
    gruplar: gruplar,
    renkAlanlari: renkAlanlari,
    kontrast: kontrast,
    ikinciVurgu: ikinciVurgu,
    tonKaydir: tonKaydir,
    kontrastRengi: kontrastRengi
  };
});
