/*
 * Suflo — Araç ara (Ctrl+K / ⌘K komut paleti) saf modülü (DOM'suz; 3.4 adım 20)
 *
 * Panelin sol menüsündeki araçlar ve sık kullanılan eylemler tek bir aranabilir listede. Bu modül
 * kararları verir; küçük pencere (#arac-ara) ve gezinme js/app.js'te:
 *
 *   katla(s) / sade(s)        Türkçe duyarlı küçük harf ve aksan katlama (ş→s, ı/İ/I→i, ğ→g, ç→c, ö→o,
 *                             ü→u, â/î/û; harf ve rakam dışı her şey boşluk). katla uzunluğu korur
 *                             (eşleşen parçayı vurgulamak için), sade boşlukları teke indirir.
 *   kayitKur(navlar, o)       kayıt: sol menü girdileri (data-tab, ad, alt yazı, PRO kilidi) + EYLEMLER
 *                             (o.mevcut(eylem) false dönen eylem atlanır: sekmesi panelde olmayan; 3.4'te her eylemin
 *                             sekmesi var, test-arac-ara hiçbirinin atlanmadığını denetler). pro: Pro.gate anahtarı.
 *   puanla(oge, sorgu)        0 = eşleşmedi. Sorgunun her kelimesi bir yerde geçmeli; adın başı > kelime başı >
 *                             ad içinde > alt yazı / anahtar kelime > harf sırası (kısaltma, "hr" → Hız Rampası).
 *   ara(kayit, sorgu, durum)  boş sorgu: Favoriler, Son kullanılanlar, Araçlar, Eylemler bölümleri;
 *                             sorgu: puana göre sıralı (favori ve son kullanılan küçük bir ek puan alır).
 *   durumOku / durumYaz       favoriler ve son 8 kullanılan localStorage'da ("suflo.aracAra"); okuma / yazma
 *                             try/catch içinde, bozuk ya da yabancı kayıt yok sayılır.
 *   kisayolMu(e, mac)         Ctrl+K (Windows) / ⌘K (macOS); Shift / Alt / AltGr'li hâli değil. Latin olmayan
 *                             düzende (Rusça…) tuşun yerine bakılır (CEP'in panelde tuttuğu tuş da odur).
 *   tusDuzeniUyumsuz(e, mac, kodlar)  macOS: ⌘ + tutulan fiziksel tuş K olmayan bir harf yazıyor (Türkçe F'de
 *                             fiziksel K = M) → o tuşun ilgisi bırakılmalı.
 *   yeniKisayolTusu(e, mac, kodlar)   macOS: ⌘K tutulmayan bir fiziksel tuştan geldi (Türkçe F: fiziksel J) → o tuş
 *                             da tutulmalı (MAC_KVK: e.code → kVK); yoksa ⌘K Premiere'e de gider.
 *   macTuslariOku / macTuslariYaz     öğrenilen macOS tuşları localStorage'da ("suflo.aracAra.macTuslari"; try/catch).
 *   yaziAlaniMi(hedef)        metin kutusu, açılır liste, contenteditable ya da altyazı düzenleyicisi
 *                             (#cap-segments, #tc-words, [data-kisayol-yok]): kısayol orada hiç bağlanmaz.
 *   tusIlgisiBirakilsinMi(h)  odak düzenleyicide ama metin girişinde değil (satır düğmeleri): Ctrl+K ilgisi
 *                             bırakılır, tuş eskisi gibi Premiere'e gider (yoksa panelde tutulup ölü kalırdı).
 *   tusIlgisiAyarla(sahip, l) CEP registerKeyEventsInterest tek bir listeyi kabul eder (her çağrı öncekini
 *                             siler): araç arama kısayolu ve Altyazı Efektleri önizleme sahnesinin konum tuşları
 *                             burada birleştirilip tek kayıt olarak verilir. Ctrl+K panelde tutulmazsa Premiere'e de
 *                             gider (Premiere'de Ctrl+K = Kes / Add Edit). Panelin BÜTÜN tuş ilgileri buradan geçmeli:
 *                             doğrudan registerKeyEventsInterest çağrısı Ctrl+K ilgisini siler (test-arac-ara yakalar).
 *   hedefTusIlgisi(mac)       seçimden sonra odaktaki düğmede Enter / Boşluk (Premiere'e gitmesin diye).
 *
 * Fikir: Rebound'un klavyeyle kullanılan, favorili ve son kullanılanlı Home başlatıcısı. Kod Suflo'nun kendi
 * (temiz oda, kod alınmadı). Çalışma ortamı: CEF 74 / Node 12.3 (ES5).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAracAra = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var DEPO_ANAHTARI = "suflo.aracAra";
  var SON_MAX = 8;
  var FAV_MAX = 40;
  var SONUC_MAX = 40;

  /* ---------------- Türkçe katlama ---------------- */

  var HARF = {
    "İ": "i", "I": "i", "ı": "i", "i": "i", "Ş": "s", "ş": "s", "Ğ": "g", "ğ": "g", "Ç": "c", "ç": "c",
    "Ö": "o", "ö": "o", "Ü": "u", "ü": "u", "Â": "a", "â": "a", "Î": "i", "î": "i", "Û": "u", "û": "u"
  };

  // Tek karakter → tek karakter (uzunluk korunur): harf / rakam küçük ve aksansız, gerisi boşluk
  function karakter(c) {
    if (HARF.hasOwnProperty(c)) return HARF[c];
    var k = c.toLowerCase();
    if (k.length !== 1) k = c;
    if (/[a-z0-9]/.test(k)) return k;
    // diğer Latin aksanları (é, ñ, ə…): NFD'nin ilk harfi
    if (typeof k.normalize === "function") {
      var d = k.normalize("NFD");
      if (d.length > 1 && /[a-z]/.test(d.charAt(0)) && /^[̀-ͯ]+$/.test(d.slice(1))) return d.charAt(0);
    }
    if (k === "ə") return "e";
    return " ";
  }

  function katla(s) {
    s = s == null ? "" : String(s);
    var out = "";
    for (var i = 0; i < s.length; i++) out += karakter(s.charAt(i));
    return out;
  }

  function sade(s) { return katla(s).replace(/\s+/g, " ").replace(/^ | $/g, ""); }

  /* ---------------- Eylemler (statik liste) ---------------- */

  /*
   * Eylem seçilince panel o sekmeyi açar, hedef düğmeyi bulur (kapalı <details>'i açar), odaklar ve vurgular;
   * ÇALIŞTIRMAZ (Pro kapısı, onaylar ve seçim denetimi aracın kendi düğmesinde kalır; Enter'a bir kez daha basmak
   * yeter). hedef: ilk görünen kimlik seçilir, hiçbiri görünmüyorsa gerekli ipucu gösterilir.
   * pro: Pro.gate anahtarı (rozet için; kapı burada değil). anahtar: aramaya ek kelimeler (katlanmış, ASCII).
   */
  var EYLEMLER = [
    { id: "altyazi-olustur", ad: "Altyazı oluştur", tab: "captions", hedef: ["cap-go"], anahtar: "transkript yaziya dok whisper subtitle caption generate" },
    { id: "srt-ice-aktar", ad: "SRT içe aktar", tab: "captions", hedef: ["cap-import-srt"], anahtar: "srt vtt altyazi dosyasi import subtitle file" },
    // hedef: Pro kapılı "Çevir" düğmesi (dil seçilmemişse düğme "Önce hedef dili seç" der); yanındaki dil listesi yedek
    { id: "altyazi-cevir", ad: "Altyazıyı çevir", tab: "captions", hedef: ["cap-translate-go", "cap-translate"], pro: "translate",
      gerekli: "Önce altyazı oluştur ya da SRT içe aktar.", anahtar: "ceviri dil ingilizce translate language" },
    { id: "bolum-oner", ad: "Bölüm öner", tab: "captions", hedef: ["cap-ch-suggest"],
      gerekli: "Önce altyazı oluştur ya da SRT içe aktar.", anahtar: "bolumler youtube chapters" },
    { id: "viral-bul", ad: "Viral anları bul", tab: "captions", hedef: ["cap-vr-bul"], pro: "highlights",
      gerekli: "Önce altyazı oluştur ya da SRT içe aktar.", anahtar: "shorts reels tiktok viral moments klip" },
    { id: "sessizlik-bul", ad: "Sessizlikleri bul", tab: "cut", hedef: ["cut-analyze"], pro: "cut", anahtar: "sessizlik kesim jump cut silence" },
    { id: "kesim-uygula", ad: "Kesimleri uygula", tab: "cut", hedef: ["cut-apply"], pro: "cut",
      gerekli: "Önce sessizlikleri bul.", anahtar: "sessizlik kes apply cuts silence" },
    // 3.4 adım 7: kapsam ve korunan katmanlar Otomatik Kesim'in seçenekleri (Pro 'cut'); Katmanlar kapalıysa açılır
    { id: "kesim-kapsam", ad: "Kesim kapsamı", tab: "cut", hedef: ["cut-scope"], pro: "cut", anahtar: "in out sekans tum secili klip kapsam scope sequence range" },
    { id: "kesim-katman", ad: "Kesilmeyecek katmanlar", tab: "cut", hedef: ["cut-koru-izler", "cut-katman"], pro: "cut",
      anahtar: "korunan katman muzik dinlenecek ses protect protected tracks music listen" },
    // 3.4 adım 8 (ücretsiz): kesim kartının eylem satırı yalnız bir kesimden sonra görünür
    { id: "altyazi-uyarla", ad: "Altyazıyı yeni kurguya uyarla", tab: "cut", hedef: ["cut-altyazi-uyarla", "tc-altyazi-uyarla"],
      gerekli: "Önce kesimleri uygula.", anahtar: "kesimden sonra altyazi esle kaydir remap captions after cut" },
    { id: "konusmadan-kes", ad: "Konuşmadan kes", tab: "cut", hedef: ["tc-analyze"], pro: "textcut", anahtar: "dolgu eee tekrar filler text cut" },
    { id: "sahne-bul", ad: "Sahneleri bul", tab: "cut", hedef: ["sc-analyze"], pro: "cut", anahtar: "sahne algilama scene detect marker" },
    { id: "ses-iyilestir", ad: "Sesi iyileştir", tab: "cut", hedef: ["ses-go"], pro: "audioclean", anahtar: "gurultu lufs ses audio noise enhance" },
    { id: "zoom-uygula", ad: "Zoom uygula", tab: "zoom", hedef: ["zoom-run"], pro: "zoom", anahtar: "punch in yakinlastirma" },
    { id: "ritim-bul", ad: "Ritmi bul", tab: "beat", hedef: ["beat-analyze"], pro: "beat", anahtar: "beat muzik marker ritim bpm" },
    { id: "rampa-uygula", ad: "Rampayı uygula", tab: "hiz", hedef: ["hiz-uygula"], pro: "speedramp", anahtar: "hiz rampasi agir cekim speed ramp slow motion" },
    { id: "rampa-kaldir", ad: "Rampayı kaldır", tab: "hiz", hedef: ["hiz-kaldir"], anahtar: "hiz rampasi geri al remove speed ramp" },
    // 3.4: Özel eğri düzenleyicisi yalnız rampa listesinde Özel eğri seçiliyken görünür; değilse liste vurgulanır
    { id: "hiz-ozel", ad: "Özel hız eğrisi", tab: "hiz", hedef: ["hiz-ozel-editor", "hiz-grid"], pro: "speedramp",
      anahtar: "ozel rampa egri duzenleyici sfc1 kod custom speed curve editor" },
    // 3.4 Eğri sekmesi: uygulamak ve varışta yaylanma Pro ('curves'); kod / dosya paylaşımı ve geri almak ücretsiz
    { id: "egri-uygula", ad: "Eğri uygula", tab: "egri", hedef: ["egri-uygula"], pro: "curves", anahtar: "egri yumusatma easing bezier keyframe anahtar kare curve" },
    { id: "egri-yaylan", ad: "Varışta yaylan", tab: "egri", hedef: ["egri-yaylan-uygula"], pro: "curves",
      anahtar: "yaylanma salinim zipla overshoot bounce spring follow through" },
    { id: "egri-kod", ad: "Eğri kodu yapıştır", tab: "egri", hedef: ["egri-kod"], anahtar: "sfc1 kod paylas baglanti cubic bezier css share code paste link" },
    { id: "egri-kod-kopyala", ad: "Eğri kodunu kopyala", tab: "egri", hedef: ["egri-kod-kopyala"], anahtar: "sfc1 kod paylas baglanti share copy code link" },
    { id: "egri-ice-aktar", ad: "Eğri önayarlarını içe aktar", tab: "egri", hedef: ["egri-ice-aktar"], anahtar: "suflo egri dosya json import file presets" },
    { id: "egri-disa-aktar", ad: "Eğri önayarlarını dışa aktar", tab: "egri", hedef: ["egri-disa-aktar"], anahtar: "suflo egri dosya export file presets" },
    { id: "egri-geri-al", ad: "Suflo eğrilerini geri al", tab: "egri", hedef: ["egri-geri-tumu"], anahtar: "egri yaylanma kaldir sil tumu undo remove curves" },
    // 3.4 güvenli kaldırma: yalnız Suflo'nun kaydettiği anahtar kareler (ücretsiz)
    { id: "gecis-kaldir", ad: "Geçişi kaldır", tab: "gecis", hedef: ["gecis-kaldir"], anahtar: "gecis sil anahtar kare remove transition" },
    { id: "zoom-kaldir", ad: "Zoom'u kaldır", tab: "zoom", hedef: ["zoom-remove"], anahtar: "zoom sil punch in remove" },
    { id: "onayar-kaldir", ad: "Önayarı kaldır", tab: "presets", hedef: ["preset-kaldir"], anahtar: "hareket preset onayar sil remove motion" },
    { id: "kanca-ekle", ad: "Kanca başlığı ekle", tab: "kanca", hedef: ["kanca-ekle"], pro: "overlay", anahtar: "kanca baslik hook title shorts" },
    { id: "youtube-indir", ad: "YouTube'dan indir", tab: "youtube", hedef: ["yt-url"], pro: "youtube", anahtar: ["youtube indir video download", "mp3", "mp4"] },
    { id: "ayar-motor", ad: "Ayarlar › Motor", tab: "settings", hedef: ["grp-motor"], anahtar: "motor model whisper gpu cozme bulut yedegi engine" },
    { id: "model-ice-aktar", ad: "Model dosyası içe aktar", tab: "settings", hedef: ["set-model-ice"], anahtar: "model bin cevrimdisi offline import" },
    { id: "ayar-dil", ad: "Ayarlar › Arayüz dili", tab: "settings", hedef: ["set-ui-lang"], anahtar: "dil ingilizce turkce language english" },
    { id: "ayar-marka", ad: "Ayarlar › Marka Kiti", tab: "settings", hedef: ["grp-marka-kiti"], anahtar: "marka kiti logo renk font brand kit" },
    { id: "ayar-pro", ad: "Suflo Pro lisansı", tab: "settings", hedef: ["pro-key", "grp-pro"], anahtar: "pro lisans anahtar deneme license key trial" },
    { id: "doctor", ad: "Suflo Doctor", tab: "settings", hedef: ["set-library-health-run"], anahtar: "doctor saglik tarama onarim health scan" },
    { id: "kaynak-sina", ad: "Model kaynaklarını sına", tab: "settings", hedef: ["set-doctor-kaynak"],
      anahtar: "doctor huggingface hf mirror ag baglanti vekil proxy network test model sources" },
    // 3.4 adım 22: köprüyü açmak Pro ('mcp', deneme hakkı yok); her eylem ayrıca kendi aracının kapısından geçer
    { id: "ayar-mcp", ad: "Yapay zekâ köprüsü (MCP) › Köprüyü aç", tab: "mcp", hedef: ["mcp-ac", "grp-mcp"], pro: "mcp",
      anahtar: "mcp claude asistan otomasyon yapay zeka ai assistant automation bridge" },
    { id: "sorun-bildir", ad: "Sorun bildir", tab: "settings", hedef: ["set-report"], anahtar: "destek gunluk hata support log bug" },
    { id: "guncelleme", ad: "Güncellemeleri denetle", tab: "settings", hedef: ["set-guncelleme-denetle"], anahtar: "guncelleme surum update version" },
    { id: "rehber", ad: "Kurulum rehberini aç", tab: "settings", hedef: ["set-onb-ac"], anahtar: "rehber kurulum ilk adim onboarding guide" }
  ];

  // Sol menü girdilerine ek arama kelimeleri (katlanmış ASCII; İngilizce arayüzde de bulunsun diye İngilizceleri de)
  var ARAC_ANAHTAR = {
    "tab:captions": "transkript whisper srt caption subtitle",
    "tab:cut": "sessizlik jump cut silence filler",
    "tab:beat": "beat muzik bpm marker",
    "tab:zoom": "punch in yakinlastirma egri easing",
    "tab:gecis": "transition whip egri easing",
    "tab:hiz": "speed ramp slow motion agir cekim",
    "tab:egri": "easing bezier keyframe curve yumusatma",
    "tab:kanca": "hook baslik shorts",
    "tab:podcast": "multicam kamera mikrofon",
    "tab:youtube": ["download indir", "mp3", "mp4"],
    "tab:text/mogrt": "mogrt text animation yazi",
    "tab:text/captions": "mogrt caption template sablon",
    "tab:text/custom": "mogrt lower third logo",
    "tab:text/buton": "button abone subscribe",
    "tab:presets": "preset motion efekt effect hareket egri easing",
    "tab:text/fav": "favorite favori",
    "tab:sfx": "ses efekti sound effect",
    "tab:emoji-assets": "emoji png gif",
    "tab:motionbg": "background arka plan overlay",
    "tab:settings": "ayar settings lisans license dil language motor engine"
  };

  var BOLUMLER = { fav: "Favoriler", son: "Son kullanılanlar", arac: "Araçlar", eylem: "Eylemler" };

  /* ---------------- Kayıt ---------------- */

  // Anahtar kelimeler metin ya da metin dizisi (rakamlı kelimeler dizide: kapsama aracı onları arayüz metni sanmasın)
  function anahtarMetni(a) { return Array.isArray(a) ? a.join(" ") : String(a || ""); }

  // Sol menü adı: "YENİ" / "NEW" / "PRO" rozeti metne karışmışsa atılır
  function temizAd(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").replace(/(\s+(YENİ|YENI|NEW|PRO))+\s*$/, "").replace(/^\s+|\s+$/g, "");
  }

  function kayitKur(navlar, o) {
    o = o || {};
    var out = [], gorulen = {}, tabAdi = {};
    (navlar || []).forEach(function (n) {
      if (!n || !n.tab) return;
      var tab = String(n.tab), kat = n.kat ? String(n.kat) : "";
      var id = "tab:" + tab + (kat ? "/" + kat : "");
      var ad = temizAd(n.ad);
      if (gorulen[id] || !ad) return;
      gorulen[id] = true;
      if (!kat && !tabAdi[tab]) tabAdi[tab] = ad;
      out.push({ id: id, tur: "arac", ad: ad, alt: temizAd(n.alt), tab: tab, kat: kat, pro: !!n.pro,
        anahtar: anahtarMetni(ARAC_ANAHTAR[id]), hedef: [], gerekli: "", sira: out.length });
    });
    EYLEMLER.forEach(function (e) {
      if (typeof o.mevcut === "function" && !o.mevcut(e)) return;
      var id = "eylem:" + e.id;
      if (gorulen[id]) return;
      gorulen[id] = true;
      out.push({ id: id, tur: "eylem", ad: e.ad, alt: tabAdi[e.tab] || "", tab: e.tab, kat: "", pro: e.pro || "",
        anahtar: anahtarMetni(e.anahtar), hedef: e.hedef.slice(), gerekli: e.gerekli || "", sira: out.length });
    });
    return out;
  }

  /* ---------------- Puanlama ---------------- */

  function kelimeBasi(s, t) { return s.indexOf(t) === 0 || s.indexOf(" " + t) !== -1; }
  function tamKelime(s, t) { return (" " + s + " ").indexOf(" " + t + " ") !== -1; }
  function basHarfler(s) { return s.split(" ").map(function (w) { return w.charAt(0); }).join(""); }
  function harfSirasi(s, t) {
    var j = 0;
    for (var i = 0; i < s.length && j < t.length; i++) if (s.charAt(i) === t.charAt(j)) j++;
    return j === t.length;
  }

  function adlari(oge) {
    var out = [];
    [oge.ad, oge.adGoster].forEach(function (a) { var s = sade(a); if (s && out.indexOf(s) === -1) out.push(s); });
    return out;
  }

  function puanla(oge, sorgu) {
    if (!oge) return 0;
    var q = sade(sorgu);
    if (!q) return 0;
    var adlar = adlari(oge);
    var ek = sade([oge.alt, oge.altGoster, oge.anahtar].join(" "));
    // 1) bütün sorgu adla
    var tam = 0;
    adlar.forEach(function (a) {
      var v = 0;
      if (a === q) v = 1000;
      else if (a.indexOf(q + " ") === 0) v = 800;              // adın ilk kelime(ler)i
      else if (tamKelime(a, q)) v = 650;                        // adda tam kelime
      else if (a.indexOf(q) === 0) v = 600;                     // adın başı (kelimenin bir kısmı)
      else if (kelimeBasi(a, q)) v = 450;                       // bir kelimenin başı
      else if (q.length >= 2 && a.indexOf(q) !== -1) v = 250;  // ad içinde
      else if (q.length >= 2 && q.indexOf(" ") === -1 && basHarfler(a).indexOf(q) === 0) v = 220;   // baş harfler
      if (v > tam) tam = v;
    });
    // 2) her kelime bir yerde geçmeli
    var kelimeler = q.split(" "), toplam = tam;
    for (var i = 0; i < kelimeler.length; i++) {
      var t = kelimeler[i], v = 0;
      adlar.forEach(function (a) {
        var w = 0;
        if (a.indexOf(t) === 0) w = 160;
        else if (kelimeBasi(a, t)) w = 120;
        else if (t.length >= 2 && a.indexOf(t) !== -1) w = 60;
        if (w > v) v = w;
      });
      if (!v && kelimeBasi(ek, t)) v = 45;
      if (!v && t.length >= 3 && ek.indexOf(t) !== -1) v = 20;
      // tek kelimelik sorgu adın baş harfleriyse ("hr") bütün sorgu puanı yeter
      if (!v && tam && kelimeler.length === 1) v = 1;
      if (!v && t.length >= 3) {
        for (var j = 0; j < adlar.length && !v; j++) if (harfSirasi(adlar[j].replace(/ /g, ""), t)) v = 8;
      }
      if (!v) return 0;
      toplam += v;
    }
    return toplam;
  }

  /*
   * Eşleşen parça (vurgu için): gösterilen metinde [bas, son) — önce bütün sorgu (kelime başı öncelikli), yoksa
   * ilk kelime. katla() uzunluğu koruduğu için kesitler özgün metne birebir oturur. Yoksa null.
   */
  function eslesme(metin, sorgu) {
    var k = katla(metin), q = sade(sorgu);
    if (!q || !k) return null;
    function bul(t) {
      if (!t) return -1;
      if (k.indexOf(t) === 0) return 0;
      var i = k.indexOf(" " + t);
      if (i !== -1) return i + 1;
      return t.length >= 2 ? k.indexOf(t) : -1;
    }
    var i = bul(q), t = q;
    if (i < 0) { t = q.split(" ")[0]; i = bul(t); }
    return i < 0 ? null : { bas: i, son: i + t.length };
  }

  /* ---------------- Favoriler ve son kullanılanlar ---------------- */

  function bosDurum() { return { fav: [], son: [] }; }
  function gecerliId(x) { return typeof x === "string" && x.length <= 80 && /^(tab|eylem):[a-z0-9_\/-]+$/i.test(x); }

  function durumNormal(d) {
    var out = bosDurum();
    if (!d || typeof d !== "object") return out;
    [["fav", FAV_MAX], ["son", SON_MAX]].forEach(function (p) {
      var a = d[p[0]];
      if (!Array.isArray(a)) return;
      for (var i = 0; i < a.length && out[p[0]].length < p[1]; i++) {
        if (gecerliId(a[i]) && out[p[0]].indexOf(a[i]) === -1) out[p[0]].push(a[i]);
      }
    });
    return out;
  }

  function durumOku(depo) {
    try {
      if (!depo || typeof depo.getItem !== "function") return bosDurum();
      var ham = depo.getItem(DEPO_ANAHTARI);
      if (!ham) return bosDurum();
      return durumNormal(JSON.parse(ham));
    } catch (e) { return bosDurum(); }
  }

  function durumYaz(depo, d) {
    try {
      if (!depo || typeof depo.setItem !== "function") return false;
      var n = durumNormal(d);
      depo.setItem(DEPO_ANAHTARI, JSON.stringify({ s: 1, fav: n.fav, son: n.son }));
      return true;
    } catch (e) { return false; }
  }

  function favoriMi(d, id) { return durumNormal(d).fav.indexOf(id) !== -1; }

  function favoriDegistir(d, id) {
    var n = durumNormal(d);
    if (!gecerliId(id)) return n;
    var i = n.fav.indexOf(id);
    if (i !== -1) n.fav.splice(i, 1);
    else if (n.fav.length < FAV_MAX) n.fav.push(id);
    return n;
  }

  function sonEkle(d, id) {
    var n = durumNormal(d);
    if (!gecerliId(id)) return n;
    var i = n.son.indexOf(id);
    if (i !== -1) n.son.splice(i, 1);
    n.son.unshift(id);
    if (n.son.length > SON_MAX) n.son.length = SON_MAX;
    return n;
  }

  /* ---------------- Arama ---------------- */

  function ara(kayit, sorgu, durum, o) {
    o = o || {};
    kayit = kayit || [];
    var d = durumNormal(durum), out = [], kim = {};
    kayit.forEach(function (x) { kim[x.id] = x; });
    var fav = function (id) { return d.fav.indexOf(id) !== -1; };
    if (!sade(sorgu)) {
      var konuldu = {};
      var koy = function (x, bolum) {
        if (!x || konuldu[x.id]) return;
        konuldu[x.id] = true;
        out.push({ oge: x, bolum: bolum, fav: fav(x.id), puan: 0 });
      };
      d.fav.forEach(function (id) { koy(kim[id], "fav"); });
      d.son.forEach(function (id) { koy(kim[id], "son"); });
      kayit.forEach(function (x) { if (x.tur === "arac") koy(x, "arac"); });
      kayit.forEach(function (x) { if (x.tur === "eylem") koy(x, "eylem"); });
      return out;
    }
    kayit.forEach(function (x) {
      var p = puanla(x, sorgu);
      if (!p) return;
      if (fav(x.id)) p += 30;
      var si = d.son.indexOf(x.id);
      if (si !== -1) p += (SON_MAX - si) * 4;
      out.push({ oge: x, bolum: "", fav: fav(x.id), puan: p });
    });
    out.sort(function (a, b) {
      if (b.puan !== a.puan) return b.puan - a.puan;
      if (a.oge.tur !== b.oge.tur) return a.oge.tur === "arac" ? -1 : 1;
      return a.oge.sira - b.oge.sira;
    });
    var sinir = o.sinir > 0 ? o.sinir : SONUC_MAX;
    if (out.length > sinir) out.length = sinir;
    return out;
  }

  /* ---------------- Klavye ---------------- */

  /*
   * Ctrl+K (Windows) / ⌘K (macOS). Shift (Premiere: tüm izlerde kes), Alt ve AltGr (= Ctrl+Alt) hâlleri değil.
   * Tuş adı yoksa ya da Latin olmayan bir düzenin harfiyse (Rusça 'л', Yunanca 'κ'…) CEP'in panelde tuttuğu tuşa
   * bakılır (tusIlgisi): Windows'ta VK_K (keyCode 75; Kiril / Yunan düzenlerinde de K'nın yerindeki tuş), macOS'ta
   * fiziksel ANSI K (code "KeyK"). Yoksa Ctrl+K panelde tutulur (Premiere'in Kes'i çalışmaz) ama palet de açılmazdı.
   */
  function kisayolMu(e, mac) {
    if (!e || e.altKey || e.shiftKey || e.repeat) return false;
    if (mac ? !(e.metaKey && !e.ctrlKey) : !(e.ctrlKey && !e.metaKey)) return false;
    var k = e.key == null ? "" : String(e.key);
    if (k === "k" || k === "K") return true;
    if (k && k !== "Unidentified" && !(k.length === 1 && k.charCodeAt(0) > 127)) return false;
    var kod = e.code == null ? "" : String(e.code);
    if (mac) return kod ? kod === "KeyK" : e.keyCode === 75;
    return e.keyCode ? e.keyCode === 75 : kod === "KeyK";
  }

  /*
   * macOS: CEP ilgisi (tusIlgisi) fiziksel tuş tutar (başta ANSI K). Tutulan tuş etkin düzende başka bir Latin harfiyse
   * (Türkçe F'de fiziksel K = M, Dvorak'ta T) ⌘ + o harf (Türkçe F: ⌘M = Premiere'in Export Media'sı) panelde yutulur ama
   * palet açılmaz. Böyle bir ⌘ basışı görülünce app.js o tuşun ilgisini bırakır: ilk basış yutulmuş olur, sonrakiler
   * Premiere'e gider (kurucu 20.K3). kodlar: tutulan fiziksel tuşlar (e.code; verilmezse ["KeyK"]).
   */
  function tusDuzeniUyumsuz(e, mac, kodlar) {
    kodlar = Array.isArray(kodlar) ? kodlar : ["KeyK"];
    if (!mac || !e || !e.metaKey || e.ctrlKey || e.altKey || kodlar.indexOf(e.code) === -1) return false;
    var k = e.key == null ? "" : String(e.key);
    return k.length === 1 && /[a-z]/i.test(k) && k !== "k" && k !== "K";
  }

  /*
   * macOS sanal tuş kodları (kVK_ANSI_*, Events.h) — tarayıcının e.code adıyla. K harfi ANSI K'dan başka bir tuştaysa
   * (Türkçe F: fiziksel J, kVK 38; Dvorak: fiziksel V, kVK 9) ⌘K basışı paleti açar ama CEP o tuşu tutmadığı için
   * Premiere'e de gider (menü kısayolu harfle eşleşir: Add Edit). app.js ilk böyle basışta o tuşu da ilgiye ekler:
   * sonraki ⌘K'lar panelde kalır (inceleme 2).
   */
  var MAC_KVK = {
    KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7, KeyC: 8, KeyV: 9, IntlBackslash: 10, KeyB: 11,
    KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15, KeyY: 16, KeyT: 17, Digit1: 18, Digit2: 19, Digit3: 20, Digit4: 21, Digit6: 22,
    Digit5: 23, Equal: 24, Digit9: 25, Digit7: 26, Minus: 27, Digit8: 28, Digit0: 29, BracketRight: 30, KeyO: 31, KeyU: 32,
    BracketLeft: 33, KeyI: 34, KeyP: 35, KeyL: 37, KeyJ: 38, Quote: 39, KeyK: 40, Semicolon: 41, Backslash: 42, Comma: 43,
    Slash: 44, KeyN: 45, KeyM: 46, Period: 47, Backquote: 50
  };

  // macOS'ta bu ⌘K basışı tutulmayan bir fiziksel tuştan mı geldi? Öyleyse o tuşun e.code'u (ilgiye eklenecek), yoksa "".
  function yeniKisayolTusu(e, mac, kodlar) {
    kodlar = Array.isArray(kodlar) ? kodlar : ["KeyK"];
    if (!mac || !kisayolMu(e, true)) return "";
    var kod = e.code == null ? "" : String(e.code);
    return kod && MAC_KVK.hasOwnProperty(kod) && kodlar.indexOf(kod) === -1 ? kod : "";
  }

  /*
   * Öğrenilen macOS tuşları bu bilgisayarda saklanır (localStorage "suflo.aracAra.macTuslari"; inceleme 3): yoksa Türkçe F /
   * Dvorak kullanıcısının her panel yüklemesinde ilk ⌘K'sı Premiere'e de gider (Add Edit), ilk ⌘M'si yine yutulurdu.
   * Okuma: yalnız MAC_KVK'deki kodlar (en çok 8, tekrarsız); kayıt yok ya da bozuksa ["KeyK"]. Saklanan boş liste geçerlidir
   * (K bırakıldı, ⌘K'yı yazan tuş henüz görülmedi). Düzen değişirse tusDuzeniUyumsuz / yeniKisayolTusu yine düzeltir.
   */
  var MAC_TUS_ANAHTARI = "suflo.aracAra.macTuslari";
  function macTuslariNormal(a) {
    var out = [];
    (Array.isArray(a) ? a : []).forEach(function (k) {
      if (typeof k === "string" && MAC_KVK.hasOwnProperty(k) && out.indexOf(k) === -1 && out.length < 8) out.push(k);
    });
    return out;
  }
  function macTuslariOku(depo) {
    try {
      if (!depo || typeof depo.getItem !== "function") return ["KeyK"];
      var ham = depo.getItem(MAC_TUS_ANAHTARI);
      if (!ham) return ["KeyK"];
      var a = JSON.parse(ham);
      if (!Array.isArray(a)) return ["KeyK"];
      var n = macTuslariNormal(a);
      return n.length || !a.length ? n : ["KeyK"];
    } catch (e) { return ["KeyK"]; }
  }
  function macTuslariYaz(depo, kodlar) {
    try {
      if (!depo || typeof depo.setItem !== "function") return false;
      depo.setItem(MAC_TUS_ANAHTARI, JSON.stringify(macTuslariNormal(kodlar)));
      return true;
    } catch (e) { return false; }
  }

  function kisayolMetni(mac) { return mac ? "⌘K" : "Ctrl+K"; }

  // Metin kutusu sayılmayan input türleri (odaktayken Ctrl+K paleti açar)
  var ISARET_TURLERI = ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"];
  // Altyazı düzenleyicisi: satır kutuları ve Konuşmadan kes kelime listesi (kendi kısayolları var)
  var DUZENLEYICI_IDLERI = ["cap-segments", "tc-words"];

  // Metin girişi: metin kutusu, açılır liste, contenteditable (öğe ya da atası). CEP buradan Premiere'e tuş göndermez.
  function metinGirdisiMi(h) {
    if (!h || h.nodeType !== 1) return false;
    var tag = String(h.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") {
      var tur = String(h.type || (h.getAttribute && h.getAttribute("type")) || "").toLowerCase();
      if (ISARET_TURLERI.indexOf(tur) === -1) return true;
    }
    for (var n = h; n && n.nodeType === 1; n = n.parentNode) {
      if (n.isContentEditable === true) return true;
      var ce = n.getAttribute ? n.getAttribute("contenteditable") : null;
      if (ce !== null && ce !== undefined && String(ce).toLowerCase() !== "false") return true;
    }
    return false;
  }

  // Altyazı düzenleyicisinin (#cap-segments, #tc-words) ya da [data-kisayol-yok] kabın içinde mi?
  function duzenleyicideMi(h) {
    if (!h || h.nodeType !== 1) return false;
    for (var n = h; n && n.nodeType === 1; n = n.parentNode) {
      if (n.id && DUZENLEYICI_IDLERI.indexOf(n.id) !== -1) return true;
      if (n.hasAttribute && n.hasAttribute("data-kisayol-yok")) return true;
    }
    return false;
  }

  function yaziAlaniMi(h) { return metinGirdisiMi(h) || duzenleyicideMi(h); }

  /*
   * Odak altyazı düzenleyicisinde ama metin girişinde DEĞİL (satırın zaman düğmesi, böl / birleştir / sil düğmeleri…):
   * kısayol orada bağlanmadığı için Ctrl+K (⌘K) ilgisi bırakılmalı, yoksa CEP tuşu panelde tutar ve hiçbir şey olmaz
   * (Premiere'in Kes'i de çalışmaz). Odak oradan çıkınca app.js ilgiyi geri kurar (inceleme 2). Metin girişinde CEP
   * zaten Premiere'e tuş göndermez: ilgi değişmez.
   */
  function tusIlgisiBirakilsinMi(h) { return duzenleyicideMi(h) && !metinGirdisiMi(h); }

  /*
   * CEP tuş ilgisi. İşletim sisteminin sanal tuş kodları (CEP Cookbook): Windows VK_K = 75 + ctrlKey,
   * macOS kVK_ANSI_K = 40 + metaKey (⌘). macOS'ta kodlar: tutulacak fiziksel tuşlar (e.code; verilmezse ["KeyK"]);
   * bilinmeyen kod atlanır, boş liste = ilgi yok.
   */
  function tusIlgisi(mac, kodlar) {
    if (!mac) return [{ keyCode: 75, ctrlKey: true }];
    var out = [];
    (Array.isArray(kodlar) ? kodlar : ["KeyK"]).forEach(function (k) {
      if (MAC_KVK.hasOwnProperty(k)) out.push({ keyCode: MAC_KVK[k], metaKey: true });
    });
    return out;
  }

  /*
   * Seçimden sonra odak aracın düğmesinde (eylem) ya da sol menü girdisinde (araç). Odak metin kutusunda değilken CEP
   * tuşları Premiere'e de gönderir: düğmeyi çalıştırmak için basılan Enter Premiere'de Render Effects In to Out'u,
   * Boşluk oynatmayı başlatırdı. Odak orada kaldıkça Enter ve Boşluk panelde tutulur (app.js odak gidince bırakır).
   * Windows VK_RETURN 13 (sayısal tuş takımının Enter'ı dahil), VK_SPACE 32; macOS kVK_Return 36,
   * kVK_ANSI_KeypadEnter 76, kVK_Space 49.
   */
  function hedefTusIlgisi(mac) {
    return mac ? [{ keyCode: 36 }, { keyCode: 76 }, { keyCode: 49 }] : [{ keyCode: 13 }, { keyCode: 32 }];
  }

  function ilgiListesi(x) {
    if (typeof x === "string") {
      if (!x) return [];
      try { x = JSON.parse(x); } catch (e) { return []; }
    }
    return Array.isArray(x) ? x : [];
  }

  // { sahip: dizi | JSON } → tek JSON (sahip adına göre sıralı, yinelenen tuş bir kez); boşsa ""
  function ilgiBirlestir(kayitlar) {
    var out = [], gorulen = {};
    Object.keys(kayitlar || {}).sort().forEach(function (sahip) {
      ilgiListesi(kayitlar[sahip]).forEach(function (x) {
        if (!x || typeof x.keyCode !== "number") return;
        var t = { keyCode: x.keyCode };
        ["ctrlKey", "altKey", "shiftKey", "metaKey"].forEach(function (m) { if (x[m] === true) t[m] = true; });
        var anahtar = JSON.stringify(t);
        if (gorulen[anahtar]) return;
        gorulen[anahtar] = true;
        out.push(t);
      });
    });
    return out.length ? JSON.stringify(out) : "";
  }

  // cepGetir(): window.__adobe_cep__ (CEP dışında / testte null). ayarla(sahip, liste|""): liste boşsa sahip çıkar.
  function tusIlgisiYoneticisi(cepGetir) {
    var kayitlar = {}, son = null;
    return {
      ayarla: function (sahip, liste) {
        sahip = String(sahip || "");
        if (ilgiListesi(liste).length) kayitlar[sahip] = liste; else delete kayitlar[sahip];
        var cep = null;
        try { cep = typeof cepGetir === "function" ? cepGetir() : null; } catch (e) { cep = null; }
        if (!cep || typeof cep.registerKeyEventsInterest !== "function") return false;
        var json = ilgiBirlestir(kayitlar);
        try { cep.registerKeyEventsInterest(json); son = json; return true; } catch (e2) { return false; }
      },
      son: function () { return son; }
    };
  }

  var panelYoneticisi = tusIlgisiYoneticisi(function () {
    return typeof window !== "undefined" ? window.__adobe_cep__ : null;
  });

  return {
    DEPO_ANAHTARI: DEPO_ANAHTARI,
    SON_MAX: SON_MAX,
    FAV_MAX: FAV_MAX,
    SONUC_MAX: SONUC_MAX,
    EYLEMLER: EYLEMLER,
    ARAC_ANAHTAR: ARAC_ANAHTAR,
    BOLUMLER: BOLUMLER,
    katla: katla,
    sade: sade,
    temizAd: temizAd,
    kayitKur: kayitKur,
    puanla: puanla,
    eslesme: eslesme,
    ara: ara,
    durumNormal: durumNormal,
    durumOku: durumOku,
    durumYaz: durumYaz,
    favoriMi: favoriMi,
    favoriDegistir: favoriDegistir,
    sonEkle: sonEkle,
    kisayolMu: kisayolMu,
    tusDuzeniUyumsuz: tusDuzeniUyumsuz,
    MAC_KVK: MAC_KVK,
    yeniKisayolTusu: yeniKisayolTusu,
    MAC_TUS_ANAHTARI: MAC_TUS_ANAHTARI,
    macTuslariOku: macTuslariOku,
    macTuslariYaz: macTuslariYaz,
    kisayolMetni: kisayolMetni,
    yaziAlaniMi: yaziAlaniMi,
    metinGirdisiMi: metinGirdisiMi,
    duzenleyicideMi: duzenleyicideMi,
    tusIlgisiBirakilsinMi: tusIlgisiBirakilsinMi,
    tusIlgisi: tusIlgisi,
    hedefTusIlgisi: hedefTusIlgisi,
    ilgiBirlestir: ilgiBirlestir,
    tusIlgisiYoneticisi: tusIlgisiYoneticisi,
    tusIlgisiAyarla: function (sahip, liste) { return panelYoneticisi.ayarla(sahip, liste); }
  };
});
