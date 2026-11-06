/*
 * Suflo — Altyazı Efektleri oluşturucusunun saf modeli (3.3)
 *
 * Altyazı sekmesindeki "Altyazı Efektleri" bölümü tek bir temel stil üretir: stil motorundaki
 * "efekt" (js/style-engine.js). Bu modül arayüzden bağımsız kısmı taşır:
 *   - GIRISLER / AKTIFLER: giriş ve vurgu animasyonlarının kimlik ve adları
 *   - GORUNUMLER: "Hazır görünümler" (kontrolleri dolduran 6 başlangıç + parti 3'ün stil kütüphanesi; rozet yok)
 *   - KATEGORILER / gruplar(): kütüphanenin kategorileri (Viral · Shorts, Minimal, Podcast, Eğitim, Sinematik, Marka)
 *   - normalize(ayar): oluşturucu ayarını doğrular, eksik / geçersiz alan varsayılana döner
 *   - overrides(ayar): stil motoruna ve SFL1 koduna giden ince ayar (styleId "efekt")
 *   - eskiGorunum / eskiStilden: eski Suflo stil kimlikleri (Creator Punch, Bold Box…) en yakın
 *     görünüme taşınır (kayıtlı tercih, eski SFL1 kodu, Shorts paketi seçimi)
 *   - sablonIndeksleri / sablonStili: TranscriptAI altyazı şablonunun JSON_Input sözleşmesiyle
 *     1:1 eşleme. Yerel (render'sız) MOGRT çıktısı 3.3'ün sonraki adımında bu ek yeri kullanır.
 *     Yalnız veri düzeni izlenir (birlikte çalışabilirlik); şablondan kod alınmadı.
 *   - 3.3 adım 17: gölge (golge), arka plan kutusu (kutu, kutuRenk, kutuOpak), serbest konum
 *     (konumX / konumY, %5-95; sürüklerken kartın kadraja sığdığı banda) ve önizlemede sürükleme: konumNoktasi, surukle (hazır konumlara ±%3
 *     yapışır), kaydir (ok tuşları), sifirla (çift tık), konumEtiketi ("X %50 · Y %85").
 *     Şablonun sözleşmesinde konum yok: sablonKonumu klibin Motion › Position'ı için oranı verir.
 *
 * Sözleşme sırası (JSON_Input dizisi): [vurguRGB, yaziRGB, font (PostScript adı), punto, kontur [1,r,g,b,kalınlık]|[0],
 *   gölge [1,r,g,b,opaklık,mesafe,yumuşaklık]|[0], kutu [1,r,g,b,opaklık]|[0], textAnim 0-5, hlAnim 0-3, satırlar]
 *
 * DOM'a, Premiere'e, dosya sistemine dokunmaz. ES5, UMD (Node 12 / CEF 74).
 */
(function (root, factory) {
  function yukle(ad, yol) {
    var m = (root && root[ad]) || null;
    if (!m && typeof require === "function") { try { m = require(yol); } catch (e) { m = null; } }
    return m;
  }
  // Yazı animasyonları kataloğu (animasyon motoru v2): index.html'de önce yüklenir, Node'da require
  var YA = (root && root.SufloYaziAnimasyon) || null;
  if (!YA && typeof require === "function") { try { YA = require("./yazi-animasyonlari.js"); } catch (e) { YA = null; } }
  var api = factory(yukle("SufloStyleShare", "./style-share.js"), function () { return yukle("SufloStyleEngine", "./style-engine.js"); }, YA);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAltyaziEfekt = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (SS, motorBul, YA) {
  "use strict";

  // Stil motoru (hazır konumların kadraja göre noktası için); index.html'de önce yüklenir, Node'da require
  var SE_ = null;
  function motor() { if (!SE_ && motorBul) SE_ = motorBul(); return SE_; }

  var STIL = "efekt";

  // Dizin sırası şablonun textAnim / hlAnim değeridir (stil motorunun GIRISLER / AKTIFLER'iyle aynı)
  var GIRISLER = [
    { id: "yok", ad: "Yok" },
    { id: "pop", ad: "Pop" },
    { id: "fade", ad: "Belirme" },
    { id: "yukari", ad: "Yukarı kay" },
    { id: "asagi", ad: "Aşağı kay" },
    { id: "zipla", ad: "Zıpla" }
  ];
  var AKTIFLER = [
    { id: "yok", ad: "Yok" },
    { id: "zipla", ad: "Zıpla" },
    { id: "titre", ad: "Titre" },
    { id: "glitch", ad: "Glitch" }
  ];

  var KONUMLAR = [1, 2, 5, 8];
  /*
   * Hazır konumların 16:9 bağlantı noktası (% kadraj; stil motorunun efekt bağlantı noktasıyla aynı: alt sol x %8,5
   * y %85,5, alt %84, orta %62, üst %22) ve adları. Sürükleme / ok tuşu / artı işareti bunu değil kartın ORTASINI
   * kullanır (olcu: stil motorunun efektKonumlari, kadraja ve ayara göre); tablo yalnız motor yokken yedektir.
   * Sürüklerken ±%3 içinde yapışılır.
   */
  var KONUM_NOKTALARI = { 1: { x: 8.5, y: 85.5, ad: "Alt sol" }, 2: { x: 50, y: 84, ad: "Alt" }, 5: { x: 50, y: 62, ad: "Orta" }, 8: { x: 50, y: 22, ad: "Üst" } };
  var YAPISMA = 3;
  // Stil motoru / paylaşım koduyla aynı aralıklar (test eşleşmeyi denetler)
  var GOLGE_VARSAYILAN = { renk: "#000000", opak: 75, mesafe: 5, yumusak: 5 };
  var GOLGE_ARALIK = { opak: [0, 100], mesafe: [0, 20], yumusak: [0, 30] };
  var KUTU_OPAK = [0, 100], KONUM_YUZDE = [5, 95];
  var KASE = ["normal", "upper", "lower"];
  var RENK = /^#[0-9a-f]{6}$/i;
  // Panelle gelen yazı tipleri (style-share.js yoksa yedek liste: 3.2'nin 6 fontu; 3.3'ün yenileri yalnız FONTS'tan)
  var FONTLAR = SS && SS.fontNames ? SS.fontNames() : ["Anton", "Archivo Black", "Bebas Neue", "Bungee", "Lora", "Montserrat"];

  /*
   * Hazır görünümler. "temiz" stil motorundaki efekt varsayılanıyla birebir aynı (test denetler).
   * anim (animasyon motoru v2): yazı animasyonu, js/yazi-animasyonlari.js kimliği; "" klasik (giriş + vurgu ayrı).
   * İlk altı görünüm klasik (anim ""): onları seçmek seçili animasyonu bırakır; kütüphanenin bazı görünümleri
   * (aşağıda) kendi yazı animasyonuyla gelir, seçilince o animasyon seçilir.
   * Meta: kategori (KATEGORILER kimliği), aciklama (tek kısa Türkçe satır), marka (yalnız Marka görünümlerinde true).
   * kase / punct: yazım biçimi ve noktalama (Altyazı ayarları), görünüm seçilince onlar da dolar (3.2'nin
   * noktalamasız stillerinin yerini alan Vurucu / Canlı / Glitch noktalamasız).
   * Her görünüm her alanı VARSAYILAN sırasıyla taşır (normalize'dan aynen geçer). Adım 17: Vurucu sert,
   * Zarif yumuşak gölgeli; "Kutulu" yarı saydam arka plan kutusu (konturusuz, okunur).
   */
  var GORUNUMLER = [
    { id: "temiz", ad: "Temiz", kategori: "minimal", aciklama: "Beyaz yazı, ince siyah kontur, sarı vurgu: her videoya uyan sade başlangıç.", ayar: {
      giris: "fade", aktif: "yok", vurgu: true, vurguRenk: "#ffd23f", renk: "#ffffff", font: "Montserrat",
      kalin: true, italik: false, boyut: 76, kontur: 5, konturRenk: "#000000", konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true,
      golge: null, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null, anim: "", vurguKutuRenk: null, vurguRenk2: null } },
    { id: "vurucu", ad: "Vurucu", kategori: "viral", aciklama: "Büyük harf, kalın kontur ve sert gölge; konuşulan kelime zıplar.", ayar: {
      giris: "pop", aktif: "zipla", vurgu: true, vurguRenk: "#ffe600", renk: "#ffffff", font: "Anton",
      kalin: true, italik: false, boyut: 112, kontur: 8, konturRenk: "#000000", konum: 5, satir: 2, kelime: 3, kase: "upper", punct: false,
      golge: { renk: "#000000", opak: 85, mesafe: 7, yumusak: 0 }, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null, anim: "", vurguKutuRenk: null, vurguRenk2: null } },
    { id: "canli", ad: "Canlı", kategori: "viral", aciklama: "Kalın harfler, pembe vurgu, zıplayarak gelen kelimeler.", ayar: {
      giris: "zipla", aktif: "zipla", vurgu: true, vurguRenk: "#ff5fa2", renk: "#ffffff", font: "Archivo Black",
      kalin: true, italik: false, boyut: 92, kontur: 6, konturRenk: "#16121f", konum: 5, satir: 2, kelime: 3, kase: "upper", punct: false,
      golge: null, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null, anim: "", vurguKutuRenk: null, vurguRenk2: null } },
    { id: "zarif", ad: "Zarif", kategori: "sinematik", aciklama: "Serif yazı, altın vurgu ve yumuşak gölge; aşağıdan süzülür.", ayar: {
      giris: "yukari", aktif: "yok", vurgu: true, vurguRenk: "#e3c27a", renk: "#f7f3ea", font: "Lora",
      kalin: false, italik: false, boyut: 70, kontur: 2, konturRenk: "#0b0b0d", konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true,
      golge: { renk: "#000000", opak: 60, mesafe: 3, yumusak: 10 }, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null, anim: "", vurguKutuRenk: null, vurguRenk2: null } },
    { id: "kutulu", ad: "Kutulu", kategori: "podcast", aciklama: "Yarı saydam koyu kutuda kontursuz yazı; uzun konuşmada rahat okunur.", ayar: {
      giris: "fade", aktif: "yok", vurgu: true, vurguRenk: "#ffd23f", renk: "#ffffff", font: "Montserrat",
      kalin: true, italik: false, boyut: 64, kontur: 0, konturRenk: "#000000", konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true,
      golge: null, kutu: true, kutuRenk: "#000000", kutuOpak: 65, konumX: null, konumY: null, anim: "", vurguKutuRenk: null, vurguRenk2: null } },
    { id: "glitch", ad: "Glitch", kategori: "viral", aciklama: "Tek satır dar harfler, camgöbeği vurgu ve glitch titreşimi.", ayar: {
      giris: "asagi", aktif: "glitch", vurgu: true, vurguRenk: "#2af5ff", renk: "#ffffff", font: "Bebas Neue",
      kalin: true, italik: false, boyut: 118, kontur: 3, konturRenk: "#0b1020", konum: 5, satir: 1, kelime: 3, kase: "upper", punct: false,
      golge: null, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null, anim: "", vurguKutuRenk: null, vurguRenk2: null } }
  ];

  /*
   * Stil kütüphanesi (parti 3): kategoriler ve 24 özgün hazır görünüm. Hepsi Suflo'nun kendi adı, rengi ve fikridir;
   * hiçbir üçüncü taraf ön ayarı, şablonu ya da üreticisi taklit edilmedi. Hepsi düz "efekt" ayarıdır: önizlemek ve
   * düzenlemek ücretsiz, timeline'a eklemek her görünümde olduğu gibi Pro.gate("overlay", { deneme: true }).
   * Meta alanlar (kategori, aciklama, marka) görünüm kaydında durur, ayar'a girmez (normalize / stil kodu / tercih bilmez).
   * Tipografi kuralları (tests/test-altyazi-efekt.js denetler): yalnız büyük harfli görüntü fontları (Anton, Bebas Neue,
   * Bungee, Bangers) kase "upper" ile; yazı ile kontur / kutu (ikisi de yoksa gölge) arasında WCAG kontrastı ≥ 4,5;
   * vurgu rengi yazı renginden stil motorunun renk uzaklığıyla belirgin; punto 56-130 (1080 tabanı); viral 1-2 satır,
   * ≤ 4 kelime; podcast ve eğitim 2 satır, 5-7 kelime; her font Türkçe harflerin tamamını içerir.
   * Yazı animasyonlu görünümlerde giris / aktif katalogdaki en yakın klasik çifttir (Premiere yerel çıktı, After
   * Effects, eski paneller ve stil kodunun klasik karşılığı onu çizer).
   * Marka görünümleri (marka: true) nötr varsayılanlarla gelir; Marka Kiti açıkken her görünüm gibi kitin yazı tipi,
   * renkleri ve konumuyla uygulanır (captions.js gorunumUygula → mergeBrandKit), çipleri kitin örneğini gösterir.
   */
  var KATEGORILER = [
    { id: "viral", ad: "Viral · Shorts" },
    { id: "minimal", ad: "Minimal" },
    { id: "podcast", ad: "Podcast" },
    { id: "egitim", ad: "Eğitim" },
    { id: "sinematik", ad: "Sinematik" },
    { id: "marka", ad: "Marka" },
    // AutoCaptions koleksiyonu (aşağıda; yazarın izniyle)
    { id: "autocaptions", ad: "AutoCaptions" }
  ];
  // Kütüphane kaydı → tam ayar (VARSAYILAN alan sırasıyla; verilmeyen alan: gölge yok, kutu kapalı, serbest konum yok, klasik)
  var AYAR_SIRASI = ["giris", "aktif", "vurgu", "vurguRenk", "renk", "font", "kalin", "italik", "boyut", "kontur", "konturRenk", "konum",
    "satir", "kelime", "kase", "punct", "golge", "kutu", "kutuRenk", "kutuOpak", "konumX", "konumY", "anim", "vurguKutuRenk", "vurguRenk2"];
  var KUTUPHANE_TABAN = { vurgu: true, italik: false, golge: null, kutu: false, kutuRenk: "#000000", kutuOpak: 50, konumX: null, konumY: null, anim: "",
    vurguKutuRenk: null, vurguRenk2: null };
  function kutuphaneKaydi(id, ad, kategori, aciklama, a, ek) {
    var ayar = {};
    AYAR_SIRASI.forEach(function (k) { ayar[k] = Object.prototype.hasOwnProperty.call(a, k) ? a[k] : KUTUPHANE_TABAN[k]; });
    var g = { id: id, ad: ad, kategori: kategori, aciklama: aciklama, ayar: ayar };
    if (ek && ek.marka === true) g.marka = true;
    return g;
  }
  function golgeAyari(renk, opak, mesafe, yumusak) { return { renk: renk, opak: opak, mesafe: mesafe, yumusak: yumusak }; }
  var KUTUPHANE = [
    /* Viral · Shorts */
    kutuphaneKaydi("patlama", "Patlama", "viral", "Çizgi roman harfleri ve turuncu vurgu; her kelime söylendiği an patlar.", {
      giris: "pop", aktif: "yok", vurguRenk: "#ff7a1a", renk: "#ffffff", font: "Bangers", kalin: true, boyut: 108, kontur: 7, konturRenk: "#1a0b2e",
      konum: 5, satir: 2, kelime: 3, kase: "upper", punct: false, golge: golgeAyari("#1a0b2e", 80, 6, 0), anim: "kelime-pop" }),
    kutuphaneKaydi("neon-gece", "Neon Gece", "viral", "Mor ışıltılı gölge, neon yeşili vurgu; konuşulan kelime nabız gibi atar.", {
      giris: "yok", aktif: "zipla", vurguRenk: "#39ff88", renk: "#f2fbff", font: "Exo 2", kalin: true, boyut: 96, kontur: 4, konturRenk: "#140a33",
      konum: 5, satir: 2, kelime: 3, kase: "upper", punct: false, golge: golgeAyari("#7a2cff", 70, 0, 12), anim: "olcek-darbe" }),
    kutuphaneKaydi("seker", "Şeker", "viral", "Yuvarlak kalın harfler, mürdüm kontur ve limon vurgu; kelimeler sekerek gelir.", {
      giris: "asagi", aktif: "yok", vurguRenk: "#ffe14a", renk: "#ffffff", font: "Nunito", kalin: true, boyut: 98, kontur: 6, konturRenk: "#7a1146",
      konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, anim: "zipla-gel" }),
    kutuphaneKaydi("turbo", "Turbo", "viral", "Tek satır, eğik dar harfler ve kırmızı vurgu; hızlı kurgulara.", {
      giris: "yukari", aktif: "titre", vurguRenk: "#ff2e4d", renk: "#ffffff", font: "Bebas Neue", kalin: true, italik: true, boyut: 124, kontur: 5,
      konturRenk: "#000000", konum: 5, satir: 1, kelime: 2, kase: "upper", punct: false, golge: golgeAyari("#000000", 90, 8, 0) }),
    kutuphaneKaydi("sokak", "Sokak", "viral", "Geniş blok harfler ve camgöbeği vurgu; kelimeler dalga gibi akar.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#00d1ff", renk: "#fff7e0", font: "Bungee", kalin: true, boyut: 84, kontur: 6, konturRenk: "#111111",
      konum: 2, satir: 2, kelime: 2, kase: "upper", punct: false, golge: golgeAyari("#000000", 70, 4, 2), anim: "dalga" }),
    /* Minimal */
    kutuphaneKaydi("sade-beyaz", "Sade Beyaz", "minimal", "Yalnız beyaz yazı ve hafif gölge; vurgu yok, dikkat görüntüde kalır.", {
      giris: "fade", aktif: "yok", vurgu: false, vurguRenk: "#ffcf5c", renk: "#ffffff", font: "Inter", kalin: true, boyut: 68, kontur: 3,
      konturRenk: "#000000", konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true, golge: golgeAyari("#000000", 55, 2, 6) }),
    kutuphaneKaydi("ince-cizgi", "İnce Çizgi", "minimal", "İnce harfler, nane yeşili vurgu; harfler sırayla belirir.", {
      giris: "fade", aktif: "yok", vurguRenk: "#7fe0c4", renk: "#ffffff", font: "Montserrat", kalin: false, boyut: 64, kontur: 2, konturRenk: "#111111",
      konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true, golge: golgeAyari("#000000", 60, 2, 8), anim: "harf-belir" }),
    kutuphaneKaydi("kagit", "Kâğıt", "minimal", "Krem kutuda koyu mürekkep yazı ve kiremit vurgu; açık sahnelerde de okunur.", {
      giris: "fade", aktif: "yok", vurguRenk: "#c2410c", renk: "#1d1b16", font: "Poppins", kalin: true, boyut: 62, kontur: 0, konturRenk: "#000000",
      konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true, kutu: true, kutuRenk: "#f5efe1", kutuOpak: 92 }),
    kutuphaneKaydi("nefes", "Nefes", "minimal", "Kontursuz yumuşak yazı, geniş hale gölge; kelimeler yukarı süzülür.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#8fd0ff", renk: "#fbfbf8", font: "Nunito", kalin: false, boyut: 66, kontur: 0, konturRenk: "#000000",
      konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true, golge: golgeAyari("#000000", 75, 0, 14), anim: "yukari-suzul" }),
    /* Podcast */
    kutuphaneKaydi("studyo", "Stüdyo", "podcast", "Lacivert kutu, kehribar vurgu; uzun sohbetlerde gözü yormaz.", {
      giris: "fade", aktif: "yok", vurguRenk: "#ffb547", renk: "#ffffff", font: "Inter", kalin: true, boyut: 60, kontur: 0, konturRenk: "#000000",
      konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true, kutu: true, kutuRenk: "#1b1f2a", kutuOpak: 78 }),
    kutuphaneKaydi("sohbet", "Sohbet", "podcast", "Yuvarlak harfler ve nane vurgu; konuşulan kelime renge yumuşakça geçer.", {
      giris: "yok", aktif: "yok", vurguRenk: "#6ee7b7", renk: "#ffffff", font: "Nunito", kalin: true, boyut: 66, kontur: 4, konturRenk: "#23202b",
      konum: 2, satir: 2, kelime: 7, kase: "normal", punct: true, golge: golgeAyari("#000000", 50, 2, 6), anim: "renk-gecis" }),
    kutuphaneKaydi("gece-yayini", "Gece Yayını", "podcast", "Gece mavisi kutu ve lavanta vurgu; satırlar aşağıdan kayar.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#b69cff", renk: "#eef2ff", font: "Poppins", kalin: true, boyut: 62, kontur: 0, konturRenk: "#000000",
      konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true, kutu: true, kutuRenk: "#0d0b1f", kutuOpak: 70 }),
    kutuphaneKaydi("mikrofon", "Mikrofon", "podcast", "Koyu lacivert kontur, mercan vurgu; konuşulan kelime hafifçe zıplar.", {
      giris: "pop", aktif: "zipla", vurguRenk: "#ff6b5e", renk: "#ffffff", font: "Montserrat", kalin: true, boyut: 70, kontur: 6, konturRenk: "#0f172a",
      konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true }),
    /* Eğitim */
    kutuphaneKaydi("ders-notu", "Ders Notu", "egitim", "Lacivert kutuda net yazı, sarı vurgu; anahtar terimler öne çıkar.", {
      giris: "fade", aktif: "yok", vurguRenk: "#ffd166", renk: "#ffffff", font: "Poppins", kalin: true, boyut: 60, kontur: 0, konturRenk: "#000000",
      konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true, kutu: true, kutuRenk: "#1e3a5f", kutuOpak: 85 }),
    kutuphaneKaydi("tebesir", "Tebeşir", "egitim", "Yeşil tahta kutusu, tebeşir beyazı ve pembe vurgu; kelimeler harf harf yazılır.", {
      giris: "fade", aktif: "yok", vurguRenk: "#ff9ec4", renk: "#f4f1e8", font: "Nunito", kalin: true, boyut: 62, kontur: 0, konturRenk: "#000000",
      konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true, kutu: true, kutuRenk: "#1f3d2b", kutuOpak: 88, anim: "daktilo" }),
    // Parti 5: konuşulan kelime fosforlu kalemle işaretlenmiş gibi (vurgu kutusu; kutudaki yazı kontrast renginde siyah)
    kutuphaneKaydi("vurgu-kalemi", "Vurgu Kalemi", "egitim", "Beyaz yazı, fosforlu limon vurgu: önemli kelime işaretlenmiş gibi.", {
      giris: "yok", aktif: "yok", vurguRenk: "#d4ff3a", renk: "#ffffff", font: "Inter", kalin: true, boyut: 68, kontur: 5, konturRenk: "#111111",
      konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true, anim: "vurgu-kutusu" }),
    kutuphaneKaydi("formul", "Formül", "egitim", "Teknik harfler, koyu kutu ve turkuaz vurgu; kart netleşerek belirir.", {
      giris: "fade", aktif: "yok", vurguRenk: "#5eead4", renk: "#e8f1ff", font: "Chakra Petch", kalin: true, boyut: 58, kontur: 0, konturRenk: "#000000",
      konum: 2, satir: 2, kelime: 7, kase: "normal", punct: true, kutu: true, kutuRenk: "#101828", kutuOpak: 80, anim: "netles" }),
    /* Sinematik */
    kutuphaneKaydi("jenerik", "Jenerik", "sinematik", "Büyük harf serif, geniş aralıktan kapanan harfler; film açılışı gibi.", {
      giris: "fade", aktif: "yok", vurguRenk: "#d9b46a", renk: "#f5f1e6", font: "Libre Caslon Display", kalin: false, boyut: 74, kontur: 1,
      konturRenk: "#000000", konum: 2, satir: 2, kelime: 6, kase: "upper", punct: true, golge: golgeAyari("#000000", 65, 2, 12), anim: "aralik-acil" }),
    kutuphaneKaydi("altin-saat", "Altın Saat", "sinematik", "Eğik serif, sıcak krem yazı ve kehribar vurgu; gün batımı tonu.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#ffb347", renk: "#fff4e0", font: "Lora", kalin: false, italik: true, boyut: 72, kontur: 2,
      konturRenk: "#2a1606", konum: 2, satir: 2, kelime: 6, kase: "normal", punct: true, golge: golgeAyari("#3a1d00", 60, 3, 10) }),
    kutuphaneKaydi("belgesel-bandi", "Belgesel Bandı", "sinematik", "Alt solda yarı saydam bant; kart yandan kayarak gelir.", {
      giris: "fade", aktif: "yok", vurguRenk: "#f0c419", renk: "#ffffff", font: "Inter", kalin: true, boyut: 58, kontur: 0, konturRenk: "#000000",
      konum: 1, satir: 2, kelime: 6, kase: "normal", punct: true, kutu: true, kutuRenk: "#000000", kutuOpak: 55, anim: "yandan-kay" }),
    kutuphaneKaydi("sessiz-film", "Sessiz Film", "sinematik", "Siyah ara yazı kartında büyük harf serif; renk yok, yalnız gri vurgu.", {
      giris: "fade", aktif: "yok", vurguRenk: "#9e9e9e", renk: "#f2f2f2", font: "Libre Caslon Display", kalin: false, boyut: 66, kontur: 0,
      konturRenk: "#000000", konum: 5, satir: 2, kelime: 5, kase: "upper", punct: true, kutu: true, kutuRenk: "#0a0a0a", kutuOpak: 90 }),
    /* Marka: Marka Kiti açıkken yazı tipi, renkler ve konum kitten */
    kutuphaneKaydi("marka-sade", "Marka · Sade", "marka", "Kitinin yazı tipi ve renkleriyle sade altyazı; kit kapalıyken nötr.", {
      giris: "fade", aktif: "yok", vurguRenk: "#8b7cf6", renk: "#ffffff", font: "Montserrat", kalin: true, boyut: 72, kontur: 4, konturRenk: "#111111",
      konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true }, { marka: true }),
    kutuphaneKaydi("marka-vurgulu", "Marka · Vurgulu", "marka", "Kitinin vurgu rengiyle iri, zıplayan kelimeler; kit kapalıyken sarı.", {
      giris: "pop", aktif: "zipla", vurguRenk: "#ffcc00", renk: "#ffffff", font: "Poppins", kalin: true, boyut: 96, kontur: 6, konturRenk: "#000000",
      konum: 5, satir: 2, kelime: 3, kase: "upper", punct: false, golge: golgeAyari("#000000", 80, 5, 0) }, { marka: true }),
    kutuphaneKaydi("marka-kutulu", "Marka · Kutulu", "marka", "Koyu kutuda kitinin yazı tipi; kit kapalıyken mavi vurgu.", {
      giris: "fade", aktif: "yok", vurguRenk: "#4cc9f0", renk: "#ffffff", font: "Inter", kalin: true, boyut: 62, kontur: 0, konturRenk: "#000000",
      konum: 2, satir: 2, kelime: 5, kase: "normal", punct: true, kutu: true, kutuRenk: "#111111", kutuOpak: 75 }, { marka: true })
  ];

  /*
   * AutoCaptions koleksiyonu (kategori "autocaptions", koleksiyon: "autocaptions"). ClashiVFX AutoCaptions eklentisinin
   * yazı stilleri, yazarın izniyle Suflo'nun "efekt" motorunda yeniden kuruldu: renkler eklentinin önizleme görsellerinden,
   * gölge / ışıltı / degrade değerleri stil ön ayarlarından (Styles (After Effects)/*.style.json) okundu. Eklentinin kodu,
   * .ffx / .mogrt / .prfpset dosyaları ve lisans bileşeni alınmadı. Motorun karşılığı olmayanlar yaklaşık:
   *   ışıltı (Glow)   → renkli, mesafesiz, yumuşak gölge (hale)
   *   degrade (Ramp)  → iki tonlu vurgu (iki-ton) ya da açık-koyu yazı + yumuşak gölge
   *   el yazısı fontlar (Azul, Rosa, Lima Viva, Editorial) → paketteki eğik serif (Lora / Libre Caslon Display)
   *   Paper Wiggle'ın sürekli titreşimi → konuşulan kelimede Sallanma
   * Önizlemek ve düzenlemek ücretsiz; timeline'a eklemek her görünümde olduğu gibi Pro.gate("overlay", { deneme: true }).
   * Eklentideki "Simple", "Blanco con sombra", "Glitch", "Outline / Stroke", "Type Writer" ve "Different" Suflo'da
   * zaten var (Temiz, Sade Beyaz, Glitch, Vurucu, Tebeşir / Daktilo animasyonu); tekrar eklenmedi.
   */
  function ac(id, ad, aciklama, a) { var g = kutuphaneKaydi(id, ad, "autocaptions", aciklama, a); g.koleksiyon = "autocaptions"; return g; }
  function hale(renk, opak, yumusak) { return golgeAyari(renk, opak, 0, yumusak); }
  var AUTOCAPTIONS = [
    ac("ac-azul", "Azul", "Eğik serif mavi yazı ve mavi ışıltı; yumuşak kayışla gelir.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#ffffff", renk: "#4d8dff", font: "Lora", kalin: true, italik: true, boyut: 84, kontur: 3,
      konturRenk: "#050b24", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#1f5bff", 85, 16), anim: "yumusak-kay" }),
    ac("ac-celeste", "Celeste", "Açık camgöbeği kalın yazı, camgöbeği hale; sıcak sarı vurgu.", {
      giris: "pop", aktif: "zipla", vurguRenk: "#ffd23f", renk: "#7af7ff", font: "Montserrat", kalin: true, boyut: 88, kontur: 4,
      konturRenk: "#002a33", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#00c8ff", 80, 14) }),
    ac("ac-rojo", "Rojo", "Kırmızı kalın yazı ve kırmızı ışıltı; konuşulan kelime beyaz parlar.", {
      giris: "pop", aktif: "zipla", vurguRenk: "#ffffff", renk: "#ff5252", font: "Montserrat", kalin: true, boyut: 88, kontur: 4,
      konturRenk: "#2a0000", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#ff1a1a", 80, 14) }),
    ac("ac-rosa", "Rosa", "Eğik serif pembe yazı, pembe hale; kart bulanıktan kayarak netleşir.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#ffffff", renk: "#ff66f2", font: "Lora", kalin: true, italik: true, boyut: 84, kontur: 3,
      konturRenk: "#2a0026", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#e01bd6", 80, 16), anim: "bulanik-kay" }),
    ac("ac-verde", "Verde", "Yeşil kalın yazı ve yeşil ışıltı; konuşulan kelime beyaz parlar.", {
      giris: "pop", aktif: "zipla", vurguRenk: "#ffffff", renk: "#4cf04c", font: "Montserrat", kalin: true, boyut: 88, kontur: 4,
      konturRenk: "#002400", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#12c912", 80, 14) }),
    ac("ac-naranja", "Naranja", "Turuncu kalın yazı ve turuncu ışıltı; kart sıcak bir parıltıyla kayar.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#ffffff", renk: "#ff8a3d", font: "Montserrat", kalin: true, boyut: 88, kontur: 4,
      konturRenk: "#2b0f00", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#ff4d00", 80, 14), anim: "isilti-kay" }),
    ac("ac-arcoiris", "Arcoíris", "Gökkuşağı tonları: turuncu yazı, sarı ve mavi vurgular sırayla.", {
      giris: "yok", aktif: "yok", vurguRenk: "#ffe94a", renk: "#ff6a2b", font: "Archivo Black", kalin: true, boyut: 90, kontur: 5,
      konturRenk: "#1a0800", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#ff3b00", 70, 12), anim: "iki-ton" }),
    ac("ac-sombra-degradada", "Sombra Degradada", "Beyazdan griye inen yazı hissi, yumuşak koyu gölge; sade ve ağır.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#9a9a9a", renk: "#f4f4f4", font: "Montserrat", kalin: true, boyut: 96, kontur: 0,
      konturRenk: "#000000", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: golgeAyari("#000000", 80, 6, 12), anim: "yumusak-kay" }),
    ac("ac-violeta", "Violeta Enfocada", "Mor kalın yazı ve geniş mor ışıltı; konuşulan kelime beyaz.", {
      giris: "pop", aktif: "yok", vurguRenk: "#ffffff", renk: "#c45cff", font: "Archivo Black", kalin: true, boyut: 86, kontur: 4,
      konturRenk: "#14001f", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#9c0cfc", 90, 20) }),
    ac("ac-lima", "Lima Viva", "Eğik serif lime yeşili yazı, yeşil hale; kart bir kez kırpışarak kayar.", {
      giris: "yukari", aktif: "yok", vurguRenk: "#ffffff", renk: "#5cf26e", font: "Lora", kalin: false, italik: true, boyut: 86, kontur: 3,
      konturRenk: "#002408", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#1fd13a", 80, 14), anim: "titrek-kay" }),
    ac("ac-editorial", "Editorial", "Dergi kapağı gibi eğik serif, pembe-mor ışıltı; kart büyükten oturur.", {
      giris: "pop", aktif: "yok", vurguRenk: "#ffffff", renk: "#f27aff", font: "Libre Caslon Display", kalin: false, italik: true, boyut: 90, kontur: 3,
      konturRenk: "#24002a", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#c21bd6", 80, 16), anim: "yakinlas" }),
    ac("ac-aura", "Aura", "Buz mavisi yazı ve geniş camgöbeği hale; sarı vurgu.", {
      giris: "fade", aktif: "yok", vurguRenk: "#ffd23f", renk: "#b0fcff", font: "Montserrat", kalin: true, boyut: 86, kontur: 3,
      konturRenk: "#00262b", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#39e6ff", 85, 22) }),
    ac("ac-shine", "Shine", "Altın sarısı yazı ve turuncu parıltı; konuşulan kelime beyaz.", {
      giris: "pop", aktif: "zipla", vurguRenk: "#ffffff", renk: "#ffb020", font: "Montserrat", kalin: true, boyut: 88, kontur: 4,
      konturRenk: "#2b1600", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#ff7a00", 85, 16) }),
    ac("ac-funk", "Funk", "Mavi blok harfler ve koyu mavi sert gölge; kart esneyerek gelir.", {
      giris: "fade", aktif: "yok", vurguRenk: "#ffffff", renk: "#33b4ff", font: "Archivo Black", kalin: true, boyut: 76, kontur: 4,
      konturRenk: "#041a4d", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: golgeAyari("#0a3cbf", 100, 8, 0), anim: "esnet" }),
    ac("ac-gradient", "Gradient", "Gümüş tonlu yazı, ince koyu kontur ve yumuşak gölge; sarı vurgu.", {
      giris: "fade", aktif: "yok", vurguRenk: "#ffd23f", renk: "#e3e3e3", font: "Montserrat", kalin: true, boyut: 90, kontur: 2,
      konturRenk: "#151515", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: golgeAyari("#000000", 60, 5, 14) }),
    ac("ac-dort-renk", "4 Color Gradient", "Pastel camgöbeği yazı; pembe ve yeşil vurgular sırayla, beyaz hale.", {
      giris: "yok", aktif: "yok", vurguRenk: "#ff7af5", renk: "#8af5ff", font: "Montserrat", kalin: true, boyut: 88, kontur: 4,
      konturRenk: "#0b1a2b", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: hale("#ffffff", 55, 18), anim: "iki-ton" }),
    ac("ac-light-sweep", "Light Sweep", "Açık mavi yazı, mavi kontur; konuşulan kelimede ışık nabzı.", {
      giris: "yok", aktif: "yok", vurguRenk: "#ffd23f", renk: "#c4e8ff", font: "Montserrat", kalin: true, boyut: 86, kontur: 4,
      konturRenk: "#1d36d6", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, anim: "parlama" }),
    ac("ac-paper-wiggle", "Paper Wiggle", "Yuvarlak beyaz harfler, kâğıt gibi koyu kontur; konuşulan kelime sallanır.", {
      giris: "yok", aktif: "titre", vurguRenk: "#ffd23f", renk: "#ffffff", font: "Nunito", kalin: true, boyut: 86, kontur: 5,
      konturRenk: "#1c1c1c", konum: 5, satir: 2, kelime: 3, kase: "normal", punct: false, golge: golgeAyari("#000000", 60, 4, 4), anim: "sallanma" }),
    ac("ac-text-box", "Text Box", "Dolu mavi kutuda büyük harf beyaz yazı; sarı vurgu, sağdan kayar.", {
      giris: "fade", aktif: "yok", vurguRenk: "#ffe14a", renk: "#ffffff", font: "Montserrat", kalin: true, boyut: 80, kontur: 0,
      konturRenk: "#000000", konum: 5, satir: 2, kelime: 3, kase: "upper", punct: false, kutu: true, kutuRenk: "#0b3cff", kutuOpak: 100, anim: "sagdan-kay" })
  ];
  KUTUPHANE = KUTUPHANE.concat(AUTOCAPTIONS);
  // İlk altı görünüm aynı sırada başta kalır (temiz 0. dizin: stil motorunun efekt varsayılanı)
  GORUNUMLER = GORUNUMLER.concat(KUTUPHANE);

  /*
   * Eski stil kimliği → en yakın görünüm. 3.2'nin kutulu stilleri (Clean Pill, SaaS Glass ve Belgesel: metnin
   * arkasında koyu panel) adım 17'den beri arka plan kutusu olan "Kutulu"ya taşınır; yazı tipi / renk / konum
   * eskiStilden ile eski stilden gelir (Belgesel Lora'sıyla).
   */
  var ESKI = {
    mrbeast: "vurucu", hormozi: "vurucu", viral: "vurucu",
    pop: "canli", ziplama: "canli",
    capcut: "kutulu", saas: "kutulu", doc: "kutulu",
    dolgu: "temiz", daktilo: "temiz",
    premium: "zarif",
    neon: "glitch"
  };

  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }
  function kopya(o) { return JSON.parse(JSON.stringify(o)); }
  function idler(liste) { return liste.map(function (x) { return x.id; }); }
  function sayi(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
    return null;
  }

  function gorunum(id) {
    for (var i = 0; i < GORUNUMLER.length; i++) if (GORUNUMLER[i].id === id) return kopya(GORUNUMLER[i]);
    return null;
  }

  var VARSAYILAN = GORUNUMLER[0].ayar;

  /*
   * Oluşturucu ayarını doğrula. Eksik ya da geçersiz alan taban değere (verilmezse "Temiz") döner;
   * sayılar aralığa kırpılır. Dönen nesnede her alan VAR.
   */
  function normalize(ayar, taban) {
    var a = ayar !== null && typeof ayar === "object" && !(ayar instanceof Array) ? ayar : {};
    var t = taban && typeof taban === "object" ? normalize(taban) : kopya(VARSAYILAN);
    var out = kopya(t);
    if (own(a, "giris") && idler(GIRISLER).indexOf(a.giris) !== -1) out.giris = a.giris;
    if (own(a, "aktif") && idler(AKTIFLER).indexOf(a.aktif) !== -1) out.aktif = a.aktif;
    // Yazı animasyonu: katalog kimliği ya da "" (klasik); bilinmeyen kimlik tabanda kalır
    if (own(a, "anim") && (a.anim === "" || animKaydi(a.anim))) out.anim = a.anim;
    // Parti 5: vurgu kutusu rengi ve ikinci vurgu rengi: null (türetilir) ya da #rrggbb; bozuk değer tabanda kalır
    ["vurguKutuRenk", "vurguRenk2"].forEach(function (k) {
      if (own(a, k) && (a[k] === null || (typeof a[k] === "string" && RENK.test(a[k])))) out[k] = a[k] === null ? null : a[k].toLowerCase();
    });
    ["vurgu", "kalin", "italik"].forEach(function (k) { if (own(a, k) && typeof a[k] === "boolean") out[k] = a[k]; });
    ["vurguRenk", "renk", "konturRenk"].forEach(function (k) { if (own(a, k) && typeof a[k] === "string" && RENK.test(a[k])) out[k] = a[k].toLowerCase(); });
    if (own(a, "font") && FONTLAR.indexOf(a.font) !== -1) out.font = a.font;
    function aralik(k, en, ust) {
      if (!own(a, k)) return;
      var n = sayi(a[k]);
      if (n !== null) out[k] = Math.max(en, Math.min(ust, Math.round(n)));
    }
    aralik("boyut", 36, 180);
    aralik("kontur", 0, 16);
    aralik("satir", 1, 3);
    aralik("kelime", 1, 10);
    if (own(a, "konum")) { var p = sayi(a.konum); if (KONUMLAR.indexOf(p) !== -1) out.konum = p; }
    if (own(a, "kase") && KASE.indexOf(a.kase) !== -1) out.kase = a.kase;
    if (own(a, "punct") && typeof a.punct === "boolean") out.punct = a.punct;
    // Adım 17: gölge (null = yok), kutu, serbest konum
    if (own(a, "golge")) {
      if (a.golge === null || a.golge === false) out.golge = null;
      else if (a.golge && typeof a.golge === "object" && !(a.golge instanceof Array)) out.golge = golgeNormalize(a.golge);
    }
    if (own(a, "kutu") && typeof a.kutu === "boolean") out.kutu = a.kutu;
    if (own(a, "kutuRenk") && typeof a.kutuRenk === "string" && RENK.test(a.kutuRenk)) out.kutuRenk = a.kutuRenk.toLowerCase();
    aralik("kutuOpak", KUTU_OPAK[0], KUTU_OPAK[1]);
    // Konum ikisi birlikte: biri geçersizse (ya da null) hazır konuma dönülür
    if (own(a, "konumX") || own(a, "konumY")) {
      var x = sayi(a.konumX), y = sayi(a.konumY);
      if (x !== null && y !== null) { out.konumX = kirp(x, KONUM_YUZDE); out.konumY = kirp(y, KONUM_YUZDE); }
      else { out.konumX = null; out.konumY = null; }
    }
    return out;
  }

  function kirp(n, ar) { return Math.max(ar[0], Math.min(ar[1], Math.round(n))); }
  // Katalogdaki yazı animasyonu kaydı ya da null ("" / bilinmeyen / katalog yüklenmedi)
  function animKaydi(id) { return YA && YA.bul && typeof id === "string" && id ? YA.bul(id) : null; }
  function golgeNormalize(g) {
    var out = kopya(GOLGE_VARSAYILAN);
    if (typeof g.renk === "string" && RENK.test(g.renk)) out.renk = g.renk.toLowerCase();
    ["opak", "mesafe", "yumusak"].forEach(function (k) { var n = sayi(g[k]); if (n !== null) out[k] = kirp(n, GOLGE_ARALIK[k]); });
    return out;
  }

  // Stil motoruna / SFL1 koduna giden ince ayar (kase / punct metin kuralıdır, buraya girmez; guvenli çağıranın)
  function overrides(ayar) {
    var n = normalize(ayar);
    var o = {
      font: n.font, renk: n.renk, konturRenk: n.konturRenk, vurguRenk: n.vurguRenk, boyut: n.boyut, kontur: n.kontur, konum: n.konum,
      giris: n.giris, aktif: n.aktif, vurgu: n.vurgu, kalin: n.kalin, italik: n.italik, satir: n.satir, kelime: n.kelime,
      golge: n.golge ? kopya(n.golge) : null, kutu: n.kutu, kutuRenk: n.kutuRenk, kutuOpak: n.kutuOpak, konumX: n.konumX, konumY: n.konumY
    };
    // Yazı animasyonu yalnız seçiliyse (klasikte alan hiç yok: stil motoru / SFL1 / Shorts paketi çıktısı aynı)
    if (n.anim) o.anim = n.anim;
    // Parti 5 renkleri yalnız elle seçildiyse (null = türetilir; alan yok, eski çıktı / kod aynı)
    if (n.vurguKutuRenk) o.vurguKutuRenk = n.vurguKutuRenk;
    if (n.vurguRenk2) o.vurguRenk2 = n.vurguRenk2;
    return o;
  }

  /*
   * Parti 5: animasyonun kullandığı ek renk alanları (panel renk seçicilerini yalnız bunlar için gösterir) ve geçerli
   * renkleri: vurguKutuRenk boşsa vurgu rengi, vurguRenk2 boşsa vurgu renginin karşıtı (yazi-animasyonlari ikinciVurgu).
   */
  function renkAlanlari(ayar) {
    var n = normalize(ayar);
    return n.anim && YA && YA.renkAlanlari ? YA.renkAlanlari(n.anim) : [];
  }
  function gecerliRenkler(ayar) {
    var n = normalize(ayar);
    return { vurguKutuRenk: n.vurguKutuRenk || n.vurguRenk,
      vurguRenk2: n.vurguRenk2 || (YA && YA.ikinciVurgu ? YA.ikinciVurgu(n.vurguRenk) : n.vurguRenk) };
  }

  /*
   * Yazı animasyonunun en yakın klasik karşılığı (animasyon motoru v2). Premiere yerel çıktının sözleşmesi (textAnim 0-5,
   * hlAnim 0-3), After Effects planı ve eski paneller yazı animasyonunu bilmez: ayar giriş / vurgu animasyonu katalogdaki
   * klasik çiftle, anim "" olarak döner. anim yoksa normalize(ayar) aynen.
   */
  function klasikAyar(ayar) {
    var n = normalize(ayar), k = animKaydi(n.anim);
    if (k) { n.giris = k.klasik.giris; n.aktif = k.klasik.aktif; }
    n.anim = "";
    return n;
  }
  // Seçili yazı animasyonu: { id, ad, klasik: { giris, aktif }, girisAd, aktifAd } ya da null (klasik)
  function animasyonu(ayar) {
    var k = animKaydi(normalize(ayar).anim);
    if (!k) return null;
    function ad(liste, id) { for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i].ad; return id; }
    return { id: k.id, ad: k.ad, klasik: kopya(k.klasik), girisAd: ad(GIRISLER, k.klasik.giris), aktifAd: ad(AKTIFLER, k.klasik.aktif) };
  }

  function eskiGorunum(styleId) {
    return typeof styleId === "string" && own(ESKI, styleId) ? ESKI[styleId] : null;
  }

  /*
   * Eski stil (kayıtlı tercih, 3.2 SFL1 kodu, Shorts paketi) → oluşturucu ayarı: en yakın görünüm,
   * üstüne eski ayarın marka alanları (paket yazı tipi, yazı / kontur / vurgu rengi, konum).
   * Punto ve kontur kalınlığı görünümden gelir: eski stillerin ölçüsü kendi kompozisyonlarına göreydi.
   * Bilinmeyen kimlikte null.
   */
  function eskiStilden(styleId, stil) {
    var g = gorunum(eskiGorunum(styleId));
    if (!g) return null;
    var s = stil && typeof stil === "object" ? stil : {};
    var marka = {};
    ["font", "renk", "konturRenk", "vurguRenk", "konum"].forEach(function (k) { if (own(s, k)) marka[k] = s[k]; });
    return normalize(marka, g.ayar);
  }

  /*
   * Görünüm seçimi hâlâ ayarlarla aynı mı? (Kontrol elle değişince seçili çip kalkar.) kase / punct hariç:
   * yazım biçimi ve noktalama Altyazı ayarlarında, kullanıcı ayrıca değiştirebilir. Kutu kapalıyken kutunun rengi /
   * opaklığı görünmez, sayılmaz.
   */
  function gorunurAyar(a) {
    var n = normalize(a);
    delete n.kase;
    delete n.punct;
    if (!n.kutu) { delete n.kutuRenk; delete n.kutuOpak; }
    // Parti 5 renkleri yalnız onları kullanan animasyonda görünür
    var ra = renkAlanlari(n);
    ["vurguKutuRenk", "vurguRenk2"].forEach(function (k) { if (ra.indexOf(k) === -1) delete n[k]; });
    return JSON.stringify(n).toLowerCase();
  }
  function gorunumuBul(ayar) {
    var n = gorunurAyar(ayar);
    for (var i = 0; i < GORUNUMLER.length; i++) if (gorunurAyar(GORUNUMLER[i].ayar) === n) return GORUNUMLER[i].id;
    return "";
  }

  /* ---------------- Serbest konum: önizlemede sürükleme (adım 17) ---------------- */

  /*
   * Bu kadrajda hazır konumların noktası (kartın ortası, %) ve serbest konumun dikey / yatay sınırı. o: { w, h (sekans;
   * yoksa 1920×1080), guvenli ("Platform arayüzünden kaçın"), ornek (önizlemenin kartları: { cues, cueKind }, stil
   * motorunun compile'ına gidenler) }. Stil motoru çizdiği yeri verir: 9:16'da Alt %74'e çekilir, kart %7-78 bandına
   * sığdırılır; yatayda kart kadraja (ve ikon sütununun soluna) sığar: X bandı en geniş örnek kartın genişliğine göre
   * (ornek yoksa satır ~16 karakter). Sürükleme, ok tuşu, artı işareti, etiket ve kaydedilen değer bununla çizilenle aynı.
   * Motor yoksa 16:9 bağlantı noktaları ve %5-95.
   */
  function olcu(ayar, o) {
    o = o || {};
    var noktalar = {}, ySinir = KONUM_YUZDE.slice(), xSinir = KONUM_YUZDE.slice(), SE = motor();
    var r = null;
    if (SE && SE.efektKonumlari) {
      var ov = overrides(ayar);
      ov.guvenli = o.guvenli === true;
      var ornek = o.ornek && typeof o.ornek === "object" ? o.ornek : null;
      try { r = SE.efektKonumlari(ov, sayi(o.w) || 1920, sayi(o.h) || 1080, ornek); } catch (e) { r = null; }
    }
    KONUMLAR.forEach(function (k) {
      var p = r && r.noktalar && r.noktalar[k], v = KONUM_NOKTALARI[k];
      noktalar[k] = { x: p && sayi(p.x) !== null ? sayi(p.x) : v.x, y: p && sayi(p.y) !== null ? sayi(p.y) : v.y, ad: v.ad };
    });
    return { noktalar: noktalar, ySinir: bant(r && r.ySinir, ySinir), xSinir: bant(r && r.xSinir, xSinir) };
  }
  // Motorun bandı (% , bir ondalık) → tam sayı aralığı (%5-95 içinde); bant bir noktaya inmişse o nokta
  function bant(s, yedek) {
    var a = s ? sayi(s[0]) : null, b = s ? sayi(s[1]) : null;
    if (a === null || b === null) return yedek;
    var lo = Math.max(KONUM_YUZDE[0], Math.ceil(Math.min(a, b))), hi = Math.min(KONUM_YUZDE[1], Math.floor(Math.max(a, b)));
    return lo <= hi ? [lo, hi] : [kirp((a + b) / 2, KONUM_YUZDE), kirp((a + b) / 2, KONUM_YUZDE)];
  }

  /*
   * Ayarın önizlemedeki noktası (%): serbest konum (çizilen banda sığdırılmış: kaydedilen değer başka kadrajdan ya da
   * daha dar bir örnek metinden kalmış olabilir; motor kartı oraya çizer) ya da hazır konumun kart ortası. o: olcu() gibi.
   */
  function konumNoktasi(ayar, o) {
    var n = normalize(ayar), t = olcu(n, o);
    if (n.konumX !== null && n.konumY !== null) return { x: kirp(n.konumX, t.xSinir), y: kirp(n.konumY, t.ySinir), konum: n.konum, serbest: true };
    var p = t.noktalar[n.konum];
    return { x: p.x, y: p.y, konum: n.konum, serbest: false };
  }

  /*
   * Sürükleme (x, y: kadrajın %'si; kartın ortası) → ayarın konum alanları. En yakın hazır konumun noktasına ±%3
   * içinde yapışır: o hazır konum seçilir, serbest konum silinir. Değilse tam sayılar, çizilen banda sığmış: X kartın
   * kadraja sığdığı bant (olcu xSinir), Y dikey bant (9:16'da %7-78 içinde). o: olcu() alanları + taban: sürükleme başındaki hazır konum. Yapışmayan noktada hazır konum
   * tabana döner (sürüklerken bir yapışma bölgesinden geçmek hazır konumu değiştirmez; çift tık / sıfırla ona döner).
   * Döner: { konum, konumX, konumY, x, y, yapisti: 0 | hazır konum }
   */
  function surukle(ayar, x, y, o) {
    var n = normalize(ayar), t = olcu(n, o);
    var taban = o && KONUMLAR.indexOf(sayi(o.taban)) !== -1 ? sayi(o.taban) : n.konum;
    var px = sayi(x), py = sayi(y);
    if (px === null || py === null) {
      var p0 = konumNoktasi(n, o);
      return { konum: n.konum, konumX: n.konumX, konumY: n.konumY, x: p0.x, y: p0.y, yapisti: 0 };
    }
    var en = 0, enUzak = Infinity;
    KONUMLAR.forEach(function (k) {
      var p = t.noktalar[k], dx = Math.abs(px - p.x), dy = Math.abs(py - p.y);
      // 9:16'da Alt sol ile Alt'ın kart ortaları yakın düşer: bölgeler örtüşürse en yakın kazanır
      if (dx <= YAPISMA && dy <= YAPISMA && dx * dx + dy * dy < enUzak) { en = k; enUzak = dx * dx + dy * dy; }
    });
    if (en) return { konum: en, konumX: null, konumY: null, x: t.noktalar[en].x, y: t.noktalar[en].y, yapisti: en };
    var kx = kirp(px, t.xSinir), ky = kirp(py, t.ySinir);
    return { konum: taban, konumX: kx, konumY: ky, x: kx, y: ky, yapisti: 0 };
  }

  // Ok tuşu: dx / dy % (Shift ile 5). Hazır konumdan başlanırsa onun kart ortasından; yapışmaz; çizilen banda sığar
  function kaydir(ayar, dx, dy, o) {
    var n = normalize(ayar), t = olcu(n, o), p = konumNoktasi(n, o);
    var kx = kirp(p.x + (sayi(dx) || 0), t.xSinir), ky = kirp(p.y + (sayi(dy) || 0), t.ySinir);
    return { konum: n.konum, konumX: kx, konumY: ky, x: kx, y: ky, yapisti: 0 };
  }

  // Çift tık: serbest konum silinir, hazır konum (konum) geçerli olur
  function sifirla(ayar, o) {
    var n = normalize(ayar), p = olcu(n, o).noktalar[n.konum];
    return { konum: n.konum, konumX: null, konumY: null, x: p.x, y: p.y, yapisti: n.konum };
  }

  /*
   * CEP (Premiere paneli): odak metin kutusu / açılır listede değilken basılan tuşlar Premiere'e de gider (ok tuşları
   * oynatma kafasını kaydırır, Home sekansın başına atlar). Önizleme sahnesi odaktayken konum tuşları panelde tutulur:
   * window.__adobe_cep__.registerKeyEventsInterest(konumTusIlgisi(mac)); odak gidince "" ile bırakılır. Kodlar işletim
   * sisteminin sanal tuş kodlarıdır (CEP Cookbook): Windows VK 37-40 oklar, 36 Home, 27 Esc; macOS 123-126 oklar,
   * 115 Home, 53 Esc. Her tuş Shift'siz ve Shift'li (%5 adım); Ctrl / Alt / Cmd'li hâlleri Premiere'de kalır.
   */
  var KONUM_TUSLARI = { win: [37, 38, 39, 40, 36, 27], mac: [123, 124, 125, 126, 115, 53] };
  function konumTusIlgisi(mac) {
    var out = [];
    KONUM_TUSLARI[mac ? "mac" : "win"].forEach(function (k) { out.push({ keyCode: k }); out.push({ keyCode: k, shiftKey: true }); });
    return JSON.stringify(out);
  }

  /*
   * Önizleme etiketi (Türkçe yazım; İngilizce arayüzde i18n deseni "X 50% · Y 85%" yapar). Hazır konumda
   * adı: "Alt · hazır konum".
   */
  function konumEtiketi(nokta) {
    if (!nokta) return "";
    if (nokta.yapisti && KONUM_NOKTALARI[nokta.yapisti]) return KONUM_NOKTALARI[nokta.yapisti].ad + " · hazır konum";
    return "X %" + Math.round(nokta.x) + " · Y %" + Math.round(nokta.y);
  }

  /*
   * Yerel MOGRT (3.3 sonraki adım): şablonun JSON sözleşmesinde konum yok; klibin Motion › Position'ı
   * için kartın ortasının kadraj oranı (0-1). Hazır konumda o konumun noktası; serbest konumda kartın kadraja sığdığı
   * banda kırpılmış nokta (konumNoktasi; o.ornek ile metnin genişliğine göre), kart kadraj dışına itilmez.
   */
  function sablonKonumu(ayar, o) {
    var p = konumNoktasi(ayar, o);
    return { x: Math.round(p.x * 10) / 1000, y: Math.round(p.y * 10) / 1000, serbest: p.serbest };
  }

  /* ---------------- TranscriptAI şablonu sözleşmesi (yerel MOGRT çıktısı için ek yeri) ---------------- */

  function rgb(hex) {
    var h = String(hex || "").replace("#", "");
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }

  /*
   * Şablonun yazı tipi alanı (3.) Premiere'in setFont'una giden PostScript adıdır; kalın / italik
   * yalnız bu adla taşınır (sözleşmede ayrı bayrak yok; TranscriptAI istemcisi de aile + kalın +
   * italik → PostScript adı eşler). Yalnız Suflo'nun paketlediği yüzler (fonts/ dosyalarının nameID 6'sı
   * ve Lora'nın adlı örnekleri): kurulu olmayan bir ad (ör. Montserrat-Italic) şablonda yazı tipini
   * tümden düşürür, eksik yüz yerine en yakın paket yüzü gider. Tek ağırlıklı görüntü fontlarında
   * (Anton, Archivo Black, Bebas Neue, Bungee) kalın / italik yüz yok; italik hiçbir pakette yok.
   * Yerel MOGRT adımı bu fontları kullanıcıya kurmalı ya da kurulu değilse libass katmanına düşmeli
   * (Premiere yalnız sisteme kurulu fontu çizer).
   */
  var POSTSCRIPT = {
    "Anton": { n: "Anton-Regular" },
    "Archivo Black": { n: "ArchivoBlack-Regular" },
    "Bebas Neue": { n: "BebasNeue-Regular" },
    "Bungee": { n: "Bungee-Regular" },
    "Lora": { n: "Lora-Regular", b: "Lora-Bold" },
    "Montserrat": { n: "Montserrat-Regular", b: "Montserrat-Bold" },
    // 3.3 adım 18: yeni fontların paketteki statik yüzleri (nameID 6; test dosyalardan okuyup denetler)
    "Bangers": { n: "Bangers-Regular" },
    "Inter": { n: "Inter-Regular", b: "Inter-Bold" },
    "Poppins": { n: "Poppins-Regular", b: "Poppins-Bold" },
    "Nunito": { n: "Nunito-Regular", b: "Nunito-Bold" },
    "Libre Caslon Display": { n: "LibreCaslonDisplay-Regular" },
    "Exo 2": { n: "Exo2-Regular", b: "Exo2-Bold" },
    "Chakra Petch": { n: "ChakraPetch-Regular", b: "ChakraPetch-Bold" }
  };
  function sablonFontu(ayar) {
    var n = normalize(ayar);
    var e = own(POSTSCRIPT, n.font) ? POSTSCRIPT[n.font] : null;
    if (!e) return n.font;
    return n.kalin && e.b ? e.b : e.n;
  }

  // Yazı animasyonu seçiliyse en yakın klasik çift (klasikAyar): sözleşme yalnız textAnim 0-5 / hlAnim 0-3 bilir
  function sablonIndeksleri(ayar) {
    var n = klasikAyar(ayar);
    return { textAnim: Math.max(0, idler(GIRISLER).indexOf(n.giris)), hlAnim: Math.max(0, idler(AKTIFLER).indexOf(n.aktif)) };
  }

  /*
   * Sözleşmenin ilk 9 alanı (satırlar hariç). o.olcek: punto çarpanı (sekans yüksekliği / 1080 gibi;
   * yerleştirme adımı kendi ölçüsünü verir). Kelime vurgusu kapalıysa vurgu rengi yazı rengidir.
   * Gölge [1, r, g, b, opaklık, mesafe, yumuşaklık] | [0]; kutu [1, r, g, b, opaklık] | [0] (adım 17).
   */
  function sablonStili(ayar, o) {
    var n = normalize(ayar);
    var olcek = o && typeof o.olcek === "number" && isFinite(o.olcek) && o.olcek > 0 ? o.olcek : 1;
    var ind = sablonIndeksleri(n);
    var kontur = n.kontur > 0 ? [1].concat(rgb(n.konturRenk), [n.kontur]) : [0];
    var golge = n.golge ? [1].concat(rgb(n.golge.renk), [n.golge.opak, n.golge.mesafe, n.golge.yumusak]) : [0];
    var kutu = n.kutu ? [1].concat(rgb(n.kutuRenk), [n.kutuOpak]) : [0];
    return [rgb(n.vurgu ? n.vurguRenk : n.renk), rgb(n.renk), sablonFontu(n), Math.round(n.boyut * olcek), kontur, golge, kutu, ind.textAnim, ind.hlAnim];
  }

  /*
   * Kategoriye göre gruplar (Shorts paketi optgroup'ları, galeri sekmeleri): [{ id, ad, gorunumler: [{ id, ad }] }]
   * KATEGORILER sırasıyla, her grupta GORUNUMLER sırası; boş grup yok. Kategorisi bilinmeyen görünüm (olmamalı) dışarıda.
   */
  function gruplar() {
    return KATEGORILER.map(function (k) {
      return { id: k.id, ad: k.ad, gorunumler: GORUNUMLER.filter(function (g) { return g.kategori === k.id; }).map(function (g) { return { id: g.id, ad: g.ad }; }) };
    }).filter(function (k) { return k.gorunumler.length > 0; });
  }

  return {
    STIL: STIL,
    GIRISLER: kopya(GIRISLER),
    AKTIFLER: kopya(AKTIFLER),
    GORUNUMLER: kopya(GORUNUMLER),
    KATEGORILER: kopya(KATEGORILER),
    gruplar: gruplar,
    VARSAYILAN: kopya(VARSAYILAN),
    gorunum: gorunum,
    normalize: normalize,
    overrides: overrides,
    eskiGorunum: eskiGorunum,
    eskiStilden: eskiStilden,
    gorunumuBul: gorunumuBul,
    klasikAyar: klasikAyar,
    animasyonu: animasyonu,
    renkAlanlari: renkAlanlari,
    gecerliRenkler: gecerliRenkler,
    KONUM_NOKTALARI: kopya(KONUM_NOKTALARI),
    YAPISMA: YAPISMA,
    konumNoktasi: konumNoktasi,
    konumOlcusu: olcu,
    surukle: surukle,
    kaydir: kaydir,
    sifirla: sifirla,
    konumEtiketi: konumEtiketi,
    konumTusIlgisi: konumTusIlgisi,
    sablonKonumu: sablonKonumu,
    sablonIndeksleri: sablonIndeksleri,
    sablonFontu: sablonFontu,
    sablonStili: sablonStili
  };
});
