## Suflo 1.6.0 — hız, GPU ve gerçek altyazı editörü 🚀

Bu sürüm iki şeyi değiştiriyor: **çok daha hızlı** ve artık sadece altyazı üreten değil, **altyazıyı düzenlediğin** bir araç.

### Hız: 22 kata kadar

| | 83 saniyelik ses |
|---|---|
| v1.5 (CPU) | 26,7 sn |
| v1.6 CPU + sessizlik atlama | 8,5 sn |
| **v1.6 NVIDIA GPU + sessizlik atlama** | **1,2 sn** |

- **Sessizlik atlama (VAD):** Konuşma olmayan bölümler artık motora hiç gönderilmiyor. Hem hızlandırıyor hem de sessizlikte doğan uydurma altyazıları (“abone olmayı unutmayın” vb.) kaynağında kesiyor. Ölçümlerde zaman damgalarını da düzeltti.
- **NVIDIA GPU desteği:** Ekran kartın varsa Suflo onu kendisi bulur ve GPU sürümünü kurar. Kurulum sonunda GPU’yu bir kez ısıtır, böylece ilk gerçek işin de hızlı olur.
- **Model seçimi:** Tiny (32 MB) → Large v3 (1 GB) arası beş model. Zayıf dizüstüde Tiny, Türkçe’de en iyi sonuç için Large. Varsayılan: Turbo.

### Altyazı editörü

- **Satır bölme** — imleci koy, Enter’a bas (ya da ⤸). Süre karakter oranına göre paylaşılır, kelime ortasından bölmez.
- **Zaman düzenleme** — zaman damgasına çift tıkla, elle yaz. Geçersiz biçim reddedilir, liste otomatik sıralanır.
- **Geri al / yinele** — Ctrl+Z, Ctrl+Y. Bölme, birleştirme, silme, çeviri, bul & değiştir; hepsi geri alınabilir.
- **Toplu kaydırma** — tüm altyazılar 0,5 saniye ileri/geri. In–out kayması olan sekanslarda hayat kurtarır.
- **Satır ekleme** — araya boş satır.

### Terim sözlüğü (Türkçe/Azerice için)

Whisper marka ve kişi adlarını sürekli yanlış yazar. Ayarlar’a `yanlış => doğru` biçiminde kural yaz, her transkriptte otomatik düzeltilsin. Büyük/küçük harf eşleşmesi Türkçe İ-ı kurallarına uygun çalışır. Bul & değiştir’de bulduğun düzeltmeyi tek tıkla sözlüğe ekleyebilirsin.

### İş kaybına karşı koruma

- **Taslak kurtarma:** Transkript diske yazılır. Panel kapanır, Premiere çökerse iş kaybolmaz — açılışta kurtarma teklif edilir. Transkript biter bitmez yazılır: hiçbir şeye dokunmadan panel kapanırsa da kurtarılır.
- **Altyazı dosyası projenin yanında:** Uygulanan SRT artık geçici klasöre değil, proje klasörüne (yoksa kalıcı Suflo klasörüne) yazılır. Premiere içe aktardığı dosyayı kopyalamıyor, yola referans veriyor — geçici klasörde duran altyazı bir gün sonra kırılırdı.
- **Kesintiye dayanıklı indirme:** Model indirmesi düşerse kaldığı yerden devam eder, ayna sunucu dener; yarım dosya asla “kurulu” sayılmaz. HuggingFace kota (429) ya da geçici sunucu hatası verdiğinde inen kısım **korunur** — 1 GB'lık model baştan inmez. Sunucunun gönderdiği aralık doğrulanır, farklı bir dosyadan kalan yarım indirme birleştirilmez.
- **Vekil sunucu (proxy):** Artık Ayarlar'dan girilebiliyor ve https adresler için gerçek CONNECT tüneli kuruluyor — kurumsal ağlarda kurulum sessizce bozulmuyor. `NO_PROXY` ve yerel adres muafiyeti destekli.
- **Otomatik temizlik:** Bir günden eski geçici ses dosyaları silinir; altyazı dosyalarına asla dokunulmaz.

### Düzeltmeler

- **GPU doğrulaması gerçek oldu.** Motorun GPU'yu gerçekten kullandığı çıktıdan kanıtlanıyor; sürücü eski ya da CUDA yüklenemiyorsa otomatik CPU sürümüne dönülüyor (ve CUDA DLL'leri silinip ~600 MB yer açılıyor). Eskiden bozuk GPU kurulumu “hazır” görünüyordu.
- **Toplu kaydırma** artık cue sürelerini bozmuyor. Sequence başında olan altyazılarda tek tek kırpma yapmak yerine kaydırma topluca sınırlanıyor, üst üste tıklamak satırları 0'a yığmıyor ve Ctrl+Z tek adımda geri alıyor.
- **Çeviriyi geri al** yapısal düzenlemeden sonra metinleri kaydırmıyor. Orijinal metin satırın kendisinde taşınıyor; satır silme, bölme, birleştirme, yeniden sıralama sonrası doğru satıra dönüyor.
- **Tek kelimelik satır** artık kelime ortasından bölünmüyor (karaoke modunda her satır tek kelime olduğu için kritikti). Japonca/Çince/Korece gibi boşluksuz yazılarda bölme çalışmaya devam ediyor.
- **Bul & değiştir** sonrası geri alma düğmesi aktifleşiyor; eşleşme bulunmazsa geçmişe hayalet kayıt düşmüyor.
- **Kurtarma teklifi** taze işin üzerinde açık kalmıyor; yanlışlıkla tıklanırsa yapılan iş Ctrl+Z ile geri geliyor.
- **Gömülü WAV presetleri** artık gerçekten kullanılıyor (sequence/In–Out ses aktarımı daha güvenilir).
- **Bir modül yüklenemezse** panelin tamamı boş açılmıyor; hata günlüğe düşüyor ve diğer bölümler çalışmaya devam ediyor.

> Kurulum gereksinimi: Premiere 14.4 (2020) ve üstü. Daha eski sürümlerde panel ayağa kalkamıyordu; artık ZXP kurulumu baştan uyarı veriyor.

### Kurulum

1. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir (ücretsiz)
2. `Suflo-1.6.0.zxp` dosyasına çift tıkla
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

Gereksinim: Windows, Adobe Premiere. ffmpeg ve yerel motor panel içinden kurulur.

---

*Free, open-source AI subtitles for Adobe Premiere. Runs Whisper locally with optional NVIDIA GPU acceleration — no subscription, no credits, no limits.*
