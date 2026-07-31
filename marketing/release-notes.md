## Suflo 1.8.0 — artık sadece altyazı

Suflo dört araçlı bir kurgu paneli olarak başlamıştı: SFX kütüphanesi, altyazı, otomatik kesim ve keyframe easing. Bu sürümle **üçünü kaldırdım.** Geriye tek bir iş kaldı: altyazı.

### Neden

Dört işi orta düzeyde yapmak yerine bir işi kimsenin yapamadığı kadar iyi yapmak istiyorum. Premiere'in yerleşik altyazısı Türkçe konuşmayı yazıya dökemiyor ve bu üç yıldır çözülmemiş bir eksik. Suflo'nun var olma sebebi bu; gerisi dikkat dağıtıyordu.

Beta modüller ayarlardan açılabilen gizli bir seçenekti, yani çoğu kullanıcı zaten görmüyordu. Şimdi kod tabanından da çıktılar.

### Ne değişti

- **Sekme çubuğu kalktı.** Panel açılınca doğrudan altyazı ekranı geliyor; ayarlara sağ üstteki dişliden girip aynı düğmeyle geri dönüyorsun.
- Ayarlar'daki **"Beta modülleri göster"** seçeneği ve **SFX klasörleri** bölümü kaldırıldı.
- Panel paketi küçüldü: arayüzden 7,5 KB, Premiere tarafındaki koddan 7,7 KB fazlalık silindi. Kaldırılan modüllere ait üç JavaScript dosyası ve Premiere'e dokunan beş fonksiyon artık ürünle birlikte gelmiyor.
- Çeviri seçeneğindeki **"Pro önizleme — lansman süresince ücretsiz"** ibaresi kaldırıldı. Suflo ücretsiz; ileride paralı olacağı imasını taşıyan bir metin üründe durmamalıydı.

### Değişmeyen

Altyazı tarafında hiçbir şey eksilmedi. Transkripsiyon, editör, karaoke, çeviri, terim sözlüğü, dört biçimde dışa aktarma, caption izi olarak uygulama — hepsi yerinde.

Kaldırılan modüllere ihtiyacın varsa: kod açık kaynak ve git geçmişinde duruyor, silinmedi.

### Kurulum

1. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir (ücretsiz)
2. `Suflo-1.8.0.zxp` dosyasına çift tıkla
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

Gereksinim: Premiere 14.4 (2020) ve üstü · Windows veya macOS.

---

### 1.7.9'da gelenler (hatırlatma)

**ffmpeg artık panel tarafından kuruluyor.** En çok bildirilen "ffmpeg bulunamadı" sorunu kökten çözüldü: paket yöneticisine güvenmek yerine ikili doğrudan indirilip panelin kendi klasörüne konuyor. Apple Silicon'da doğru mimarideki sürüm iniyor ve macOS karantinası otomatik temizleniyor.

### 1.7.8'de gelenler (hatırlatma)

Hatalar artık çözümü de söylüyor. Ayarlar → Destek → **"Sorun bildir"** günlüğü kopyalayıp önceden doldurulmuş formu açıyor. Türkçe ANSI (windows-1254) SRT dosyaları düzgün açılıyor.
