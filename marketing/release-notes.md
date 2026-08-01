## Suflo 1.9.2 — Mac kurulum hatası düzeltildi

Mac'te kurmaya çalışan birkaç kişi **"erişim ayrıcalıklarına sahip olmadığınız için açılamadı"** hatası aldı. Sebep bendeydi ve kurulum daha başlamadan bitiyordu. Düzeltildi.

### Ne olmuştu

Kurulum paketi Windows'ta üretiliyor ve iki şey ters gidiyordu; ikisi de Windows'ta test ederken görünmüyor, yalnızca Mac'te ortaya çıkıyordu:

**Çalıştırma izni kayboluyordu.** Windows'un arşivleme aracı ZIP dosyalarına Unix izin bilgisini hiç yazmıyor. Mac tarafında `Suflo-Kur.command` çalıştırılamaz halde açılıyor, çift tıklayınca da izin hatası veriyordu.

**Klasör yapısı bozuluyordu.** Aynı araç yol ayracı olarak ters bölü yazıyor (`panel\index.html`), oysa ZIP standardı düz bölü ister. macOS bunu klasör değil, adının içinde ters bölü olan tek bir dosya sanıyor — yani `panel` klasörü hiç oluşmuyor ve kurucu dosyaları bulamıyordu.

Artık paket üretilirken her iki şey de düzeltiliyor ve her sürümde otomatik kontrol ediliyor: mac kurucusunun çalıştırılabilir olduğu, yolların düz bölü kullandığı ve panelin bütün dosyalarının pakette bulunduğu sınanıyor.

### Elindeki eski dosyayla uğraşmak istersen

Yeniden indirmek en kolayı, ama istersen eski dosyayı da kurtarabilirsin: Terminal'i aç, `chmod +x` yaz (sonuna boşluk bırak), `Suflo-Kur.command` dosyasını Terminal penceresine sürükle, Enter'a bas. Sonra dosyaya tekrar çift tıkla.

### Kurulum

1. [Kurulum ZIP'ini indir](https://github.com/sametcreates/suflo/releases/latest), aç
2. Kur dosyasına çift tıkla (Windows: `Suflo-Kur.bat`, Mac: `Suflo-Kur.command`)
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

---

### 1.9.1'de gelenler (hatırlatma)

Ayarlar'daki **Destek** bölümü geri geldi ("Sorun bildir" ve "Günlüğü kopyala"); 1.9.0'da yanlışlıkla silinmişti. Önizleme yeniden tasarlandı ve **"Kare al"** düğmesiyle altyazıyı kendi görüntünün üstünde görebiliyorsun.

### 1.9.0'da gelenler (hatırlatma)

**Stilli katman:** altyazı, seçtiğin renk ve kelime vurgusuyla şeffaf bir video katmanı olarak timeline'a ekleniyor. **Görünüm ayarları:** renk, yazı tipi, punto, kontur, konum. **Tek tıkla kurucu.**
