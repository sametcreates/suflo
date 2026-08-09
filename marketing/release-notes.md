## Suflo 2.2 — Kesim geri döndü, ritim geldi, emoji geldi

"Altyazının baronu" olduk; şimdi baronun çevresini kuruyoruz. Bu sürüm panele iki sekme ve altyazı düzenleyiciye bir emoji seçici ekliyor — üçü de tamamen makinede çalışıyor, hiçbir şey internete gitmiyor.

### Otomatik kesim geri döndü (Kesim sekmesi)

Seçili klibin sesindeki duraksamaları bulur, turuncu şeritte gösterir, istemediğin kesimi tek tıkla kapatırsın, "Kesimleri uygula" ile timeline'da keser. Hassasiyet ayarları (eşik dB, en kısa sessizlik, pay) ince ayar başlığının altında. Jump-cut'lı konuşma videosu kurgulayanlar için dakikalar kazandırır.

### Ritim sekmesi — vuruşa marker

Seçili klibin müziğindeki vuruşları bulur ve timeline'a **sequence marker** olarak atar; kesimlerini markerlara hizalarsın. İki bant var: **Bas** (kick/808) ve **Tiz** (snare/hi-hat) — spektral akı analiziyle ayrılıyor, "her vuruş / 2'de 1 / 4'te 1" sıklık seçenekli. BPM tahmini de gösteriliyor. Pazarlama cilası değil, gerçek sinyal işleme: FFT + uyarlanır eşik + parabolik tepe interpolasyonu.

### Emoji seçici

Altyazı düzenleyicinin üstünde 😊 düğmesi: 51 emojilik seçilmiş set, Türkçe arama ("ateş", "para", "gülme"…). İki mod:

- **Metne ekle** — emoji karakteri seçili satıra, imlecin olduğu yere girer. "Sekansa uygula" yolunda Premiere kendi motoruyla renkli çizer.
- **Sahneye bırak** — emoji, playhead'e şeffaf bir **grafik klip** olarak iner; Motion'la büyütüp konumlandırırsın. Viral kurgudaki "kocaman 🔥 pat diye girer" görünümü.

Dürüstlük notu: stilli katman motoru (libass) emoji çizemiyor — emojili satırla stilli katman istersen panel seni uyarır ve doğru yola yönlendirir; sessizce emoji yutmaz.

Panel içindeki emoji görselleri [Twemoji](https://github.com/jdecked/twemoji)'den (CC-BY 4.0). Apple'ın emoji çizimleri Apple'ın telifli eseri olduğu için hiçbir eklenti onları yasal olarak paketleyemez; "Metne ekle" modunda eklenen karakterler Premiere'de sistemin (Windows/macOS) kendi emojileriyle çizilir — Mac'te Apple emojileri olarak görünür.

### Ayrıca

- BPM tahmini kare kuantalamasından etkilenmiyor artık (120 BPM'lik parçada 115 gösterme hatası giderildi)
- Marker zamanları alt-kare hassasiyetinde (parabolik interpolasyon)
- 19 + 11 + 23 yeni otomatik test (ritim, kesim, emoji hattı)

### Kurulum

1. [Kurulum ZIP'ini indir](https://github.com/sametcreates/suflo/releases/latest), aç
2. Kur dosyasına çift tıkla (Windows: `Suflo-Kur.bat`, Mac: `Suflo-Kur.command`)
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

---

### 2.1'de gelenler (hatırlatma)

Görsel stil kartları: altı canlı kart, her biri kendi animasyonunu kendi fontuyla oynatıyor. İnce ayar katlandı, kelime girişlerine easing geldi, sitede gerçek fontlar.
