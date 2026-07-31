## Suflo 1.9.0 — Premiere'in yapamadığı altyazı

Premiere'in kendi altyazı izi tek renk ve animasyonsuzdur. Kelime kelime vurgulu, renkli, CapCut tarzı altyazı isteyen herkes bugüne kadar ya para ödedi ya da videoyu başka programa taşıdı. Bu sürümle Suflo onu Premiere'in içinde yapıyor.

### Stilli katman

Sonuç ekranında yeni bir düğme var: **"Stilli katman olarak ekle"**.

Altyazını seçtiğin renk, yazı tipi ve kelime vurgusuyla **şeffaf bir video katmanı** olarak render edip sekansındaki boş bir video kanalına koyuyor. Kurgun bozulmuyor, kliplerin yerinden oynamıyor — üstüne bir katman biniyor, o kadar. Boş kanal yoksa panel yeni bir kanal açıyor.

Premiere'in kendi altyazı izi de duruyor ("Sekansa uygula"). İkisi farklı işe yarıyor:

- **Sekansa uygula:** Premiere'in caption izi. Sonradan Premiere içinde düzenlenebilir, ama tek renk ve animasyonsuz.
- **Stilli katman:** istediğin görünüm, kelime kelime vurgu. Düzenlemek için panele dönersin.

Teknik tarafı merak edenler için: QuickTime Animation (qtrle) kodeğiyle kayıpsız ve alfa kanallı üretiliyor. Ölçtüm — dakikada ~26 MB, ProRes 4444'ün 12'de biri, üstelik 4 kat hızlı render oluyor.

### Görünüm ayarları ve canlı önizleme

Altyazının rengi, yazı tipi, puntosu, kontur kalınlığı, kontur rengi, ekran konumu ve arka plan kutusu artık panelden seçiliyor. Karaoke modunda vurgu rengi de ayrı.

Üstünde **canlı önizleme** var: altyazının videoda nasıl duracağını yazı tipiyle, konumuyla, konturuyla birlikte gösteriyor. "Oynat" düğmesi kelime vurgusunu gerçek zamanlamalarla oynatıyor.

Şablonlar da artık görünümü taşıyor: **Reels** Impact 110 punto ortada, **Belgesel** Georgia 54 punto kutulu, **YouTube** Arial 64 punto altta.

### Kurulum tek dosyaya indi

Eskiden önce ZXP/UXP Installer indirip kurman, sonra `.zxp` dosyasını bulman gerekiyordu. Artık:

1. Kurulum ZIP'ini indir, aç
2. **Suflo-Kur.bat** (Mac'te **Suflo-Kur.command**) dosyasına çift tıkla
3. Premiere'i aç

Kurucu paneli doğru yere kopyalıyor, Premiere ayarını yapıyor, Mac'te güvenlik damgasını temizliyor ve kurulumu doğruluyor. Premiere açıkken çalıştırırsan uyarıyor. `.zxp` dosyası da sürüm sayfasında duruyor, ZXP Installer kullanmayı tercih edenler için.

### Sessiz ama önemli düzeltme

ffmpeg'in altyazı filtrelerine Windows'ta mutlak dosya yolu verilemiyor: filtre sözdiziminde iki nokta üst üste parametre ayracı olduğu için `C:/...` ikinci parametre sanılıyor. Bu, stilli katman özelliğini tamamen çalışmaz hale getirirdi. Artık ffmpeg dosyanın kendi klasöründe çalıştırılıyor.

### Kurulum

1. [Kurulum ZIP'ini indir](https://github.com/sametcreates/suflo/releases/latest), aç
2. Kur dosyasına çift tıkla
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

Gereksinim: Premiere 14.4 (2020) ve üstü · Windows veya macOS.

---

### 1.8.0'da gelenler (hatırlatma)

Suflo tek işe indirgendi: **yalnızca altyazı.** SFX, Kesim ve Motion modülleri üründen çıkarıldı. Sekme çubuğu kalktı, panel doğrudan altyazı ekranıyla açılıyor.

### 1.7.9'da gelenler (hatırlatma)

ffmpeg artık panel tarafından kuruluyor; "ffmpeg bulunamadı" sorunu kökten çözüldü.
