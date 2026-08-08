## Suflo 2.0 — Konuşman animasyonlu altyazıya dönüşüyor

Bugüne kadar animasyonlu altyazı iki şekilde yapılıyordu: ya videoyu CapCut'a taşıyordun, ya da hazır şablon alıp **metni elle yazıyordun.** Suflo 2.0 ikisini de gereksiz kılıyor: konuşma otomatik yazıya dökülüyor, seçtiğin animasyonla şeffaf bir katman olarak timeline'ına iniyor. Metin yazmak yok, şablon doldurmak yok, program değiştirmek yok.

### 6 animasyon stili

| Stil | Ne yapıyor |
|---|---|
| **Aktif kelime** | Satır sabit durur, okunan kelime renklenip hafifçe büyür (Hormozi görünümü) |
| **Pop** | Kelimeler tek tek büyüyerek gelir |
| **Zıplama** | Kelimeler taşarak girip yerine oturur |
| **Karaoke dolgu** | Renk, okunan kelimeyi soldan doldurur |
| **Yumuşak geçiş** | Satırlar fade ile girer çıkar |
| **Alttan kayma** | Satır aşağıdan kayarak gelir |

Hepsi kelime zamanlamalarını gerçek transkripsiyondan alıyor — animasyon konuşmayla senkron, elle hizalama yok.

### 4 yeni font, paketle birlikte

**Anton, Archivo Black, Bebas Neue ve Bungee** artık Suflo ile geliyor. Sosyal medya altyazılarının standart fontları bunlar; hiçbirini ayrıca kurman gerekmiyor.

Dördü de tek tek denetlendi: **Türkçe karakterlerin tamamı var** (ğ, ş, İ, ı dahil). Bu önemli çünkü eksik glifli font, yazıyı sessizce karışık fontlu çiziyor — denetimde iki popüler font tam bu yüzden elendi. Hepsi açık lisanslı (SIL OFL), lisans dosyaları pakette.

### Hazır şablonlar yenilendi

- **Reels — aktif kelime:** Anton, ortada, sarı vurgu
- **Pop — kelimeler gelir:** Bebas Neue, büyük punto
- **Karaoke dolgu:** Archivo Black, mor dolgu
- **Enerjik — zıplama:** Bungee, sarı, çocuk/eğlence içerikleri
- **YouTube Klasik** ve **Belgesel** duruyor

Şablonu seç, önizlemede oynat, "Stilli katman olarak ekle" — bitti.

### Önizleme animasyonları da gösteriyor

Paneldeki önizleme artık seçtiğin animasyonu gerçek kelime zamanlamalarıyla oynatıyor. Render'da kullanılan font dosyasının aynısıyla çiziyor, yani gördüğün şey çıkacak olan şey.

### Kurulum

1. [Kurulum ZIP'ini indir](https://github.com/sametcreates/suflo/releases/latest), aç
2. Kur dosyasına çift tıkla (Windows: `Suflo-Kur.bat`, Mac: `Suflo-Kur.command`)
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

Gereksinim: Premiere 14.4 (2020) ve üstü · Windows veya macOS. Ek program gerekmez; motor ve ffmpeg'i panel kendisi kurar.

---

### 1.9.x'te gelenler (hatırlatma)

Stilli şeffaf katman, görünüm ayarları (renk/font/kontur/konum), canlı önizleme + "Kare al", tek tıkla kurucu, Mac kurulum düzeltmeleri.
