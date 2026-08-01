## Suflo 1.9.1 — Destek bölümü geri döndü, önizleme yenilendi

1.9.0'da bir hata yaptım: modülleri kaldırırken Ayarlar'daki **Destek** bölümü de yanlışlıkla silindi. Yani "Sorun bildir" ve "Günlüğü kopyala" düğmeleri kayboldu. Bu sürüm onları geri getiriyor.

Hata sessizdi: panel açılıyor, konsol temiz, yalnızca en altta küçük bir uyarı çıkıyordu. Bir daha yaşanmaması için artık her sürümde **JS'in dokunduğu her arayüz öğesinin gerçekten var olduğu** otomatik kontrol ediliyor.

### Önizleme yeniden tasarlandı

Arkadaki satranç deseni kaldırıldı — panelin koyu diline yamalı duruyordu ve "burası boş" hissi veriyordu. Yerine sinematik bir zemin geldi, önizleme daha kompakt oldu ve düğmeler yazının üstünden çekildi.

Asıl yenilik: **"Kare al"** düğmesi. Timeline'daki playhead'in olduğu kareyi arka plan olarak alıyor, yani altyazıyı **kendi görüntünün üstünde** görüyorsun. Temsili bir zemin altyazının gerçekten okunup okunmadığını gösteremez; kendi karen gösterir.

(Premiere'in kare dışa aktarımı belgelenmemiş bir API; çalışmadığı sürümlerde panel sessizce sinematik zemine dönüyor, özellik kaybolmuyor.)

### Kurulum

1. [Kurulum ZIP'ini indir](https://github.com/sametcreates/suflo/releases/latest), aç
2. Kur dosyasına çift tıkla (Windows: `Suflo-Kur.bat`, Mac: `Suflo-Kur.command`)
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

---

### 1.9.0'da gelenler (hatırlatma)

**Stilli katman:** altyazı, seçtiğin renk ve kelime vurgusuyla şeffaf bir video katmanı olarak timeline'a ekleniyor — Premiere'in caption izinin yapamadığı görünüm. Kurgun bozulmuyor.

**Görünüm ayarları:** renk, yazı tipi, punto, kontur, ekran konumu, arka plan kutusu ve karaoke vurgu rengi panelden seçiliyor; canlı önizleme bunları anında gösteriyor.

**Tek tıkla kurucu:** ZXP Installer bağımlılığı kalktı.

### 1.8.0'da gelenler (hatırlatma)

Suflo tek işe indirgendi: yalnızca altyazı.
