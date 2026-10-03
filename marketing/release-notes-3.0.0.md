## Suflo 3.0.0 — Yapay zekâ ile kurgu

### Yeni
- **Viral anlar (Shorts bulucu):** Uzun videonun altyazısından yapay zekâ, kancayla başlayan ve tek başına anlaşılan 15–60 sn'lik anları puanlayarak bulur. Tek tıkla In/Out ayarla ya da kırmızı, süreli marker olarak ekle.
- **Konuşmadan kes:** Kesim sekmesinde klibi kelime kelime yazıya döker; *ııı, eee, hmm* gibi dolgu seslerini, *"ben ben"* tekrarlarını ve uzun duraksamaları işaretler. Bir kelimeye tıkla, videodan da çıksın. Kopya sekansta uygulanır, orijinal bozulmaz. Türkçe, Azerice, İngilizce ve Rusça. **▶ Dinle** ile sonucu uygulamadan önce panelde duy (Otomatik Kesim'de de var).
- **Suflo Stilleri:** Kendi stil motorumuzla **12 animasyonlu altyazı stili** — yeni Hormozi, Neon, Daktilo, Zıplayan ve Karaoke Dolgu dahil. MOGRT gerekmez; seçince canlı önizleme oynar, "ile ekle" altyazıyı şeffaf video katmanı olarak timeline'a koyar. Premiere şablonları da yanında durur.
- **Geçişler:** Yeni sekme. Playhead'i kesime getir, tek tıkla 13 geçişten birini uygula: zoom, whip (4 yön), itme, zıplama, punch, sarsıntı, karartma, yumuşak geçiş. Eklenti veya ayar katmanı gerekmez; keyframe'ler Premiere'de düzenlenebilir.
- **Bölümler (YouTube):** Altyazıdan bölüm önerir, istersen AI ile başlık atar, YouTube kurallarını (0:00, en az 3 bölüm, 10 sn) denetler. Açıklamaya kopyala ya da timeline'a Chapter marker'ı olarak ekle.
- **B-roll önerileri:** Yapay zekâ konuşmada ara görüntü konacak anları ve stok sitelerinde aranacak İngilizce kelimeleri bulur; yeşil süreli marker olarak eklenir, Pexels / Pixabay araması tek tıkla açılır.
- **Paylaşım metni (YouTube / Instagram Reels / TikTok):** YouTube için transkriptten 5 başlık önerisi, bölümleri içeren hazır açıklama, 500 karakter sınırına uygun etiketler ve 3 hashtag; Reels ve TikTok için kanca ilk satırı, açıklama ve 5 hashtag (2200 karakter). Bölümler kutusunda, ücretsiz; Groq anahtarı gerekir.
- **Çok dilli SRT paketi:** Altyazıyı seçtiğin dillere (EN, DE, AR, ES, FR, RU, PT, IT…) tek seferde çevirip her dil için ayrı SRT yazar — YouTube'da çok dilli altyazı için. Ekrandaki altyazı değişmez; büyük harf kuralı her dilin kendi kuralıyla.
- **Otomatik emoji:** Altyazı satırlarına anlamına göre seyrek emoji ekler; Türkçe eklerini tanır, art arda ve tekrar emoji koymaz. Ctrl+Z ile geri alınır.
- **Anahtar kelime vurgusu:** Altyazıda `*kelime*` yazdığın ya da **Otomatik vurgu**nun seçtiği kelimeler (sayılar, para, yüzde ve satırın en önemli kelimesi) tüm Suflo Stillerinde sürekli vurgu renginde görünür. SRT, VTT ve normal caption izinde yıldızlar otomatik temizlenir. Vurgulu kelimeler **Otomatik Zoom**'da punch-in, **Akıllı SFX**'te efekt noktası olur.
- **Kanca başlığı:** Shorts/Reels açılışı için animasyonlu başlık kartı (Kutu, Şerit, Sade, Neon, Etiket). Playhead'e ya da Viral anlar kartından o anın başına tek tıkla şeffaf katman olarak eklenir; `*kelime*` vurgu renginde; **AI ile öner** transkriptten 5 başlık yazar. Önizleme ücretsiz.
- **Shorts sekansları:** Viral anlardan tek tıkla her an için ayrı sekans (Proje panelinde "Suflo Shorts" kutusu); istersen Premiere Auto Reframe ile 9:16 dikey kopyası da çıkar. Orijinal sekansa dokunulmaz. Bir Shorts sekansını açınca altyazısı ana videonun transkriptinden tek tıkla gelir — yeniden yazıya dökmek gerekmez.
- **Sesi iyileştir:** Seçili klipte uğultu ve oda gürültüsünü azaltır, sesi YouTube (−14), podcast (−16) ya da yayın (−23 LUFS) seviyesine getirir. Temiz ses klibin altına yeni kanala gelir; gürültü azaltıcının gecikmesi ölçülüp telafi edildiği için dudak senkronu kaymaz. Orijinal ses silinmez, kapatılır.
- **9:16 için ayarlı stiller:** Dikey sekansta altyazılar TikTok/Reels/Shorts arayüzünün üstünde kalır, uzun kelimeler kadraja sığar; önizleme sekans oranında oynar ve **Shorts güvenli alanı** kırmızıyla gösterilir.
- **Sahne algılama:** Kesim sekmesinde. Uzun kayıtlarda ve hazır videolarda sahne değişimlerini görüntüden bulur; marker at ya da seçili klibi sahnelerde böl — müzik katmanına dokunulmaz.
- **Vuruşlarda böl:** Ritim sekmesinde müziği analiz et, B-roll'u seç, tek tıkla vuruşlarda kes.
- **Çift dilli altyazı:** Çeviriden sonra "çift dilli" anahtarıyla SRT/VTT ve altyazı izi orijinal + çeviriyi alt alta yazar.
- **Yenilikler penceresi:** 3.0'ı ilk açışta yeni özellikler tek ekranda; her biri tek tıkla ilgili bölümü açar.
- **Yeni diller:** Konuşma dili ve çeviri için Almanca, Arapça, İspanyolca, Fransızca, Portekizce, İtalyanca; çeviride ayrıca Felemenkçe ve Japonca.

### Düzeltildi
- Bulut altyazı ve çeviride **Türkçe harflerin (ş, ğ, ü…) "�" olarak bozulması** giderildi.
- **Montserrat kullanan altyazı stilleri** (CapCut Clean, SaaS Glass, Premium) libass'te yanlış fontla (DejaVu) çiziliyordu; artık gerçek Montserrat Bold kullanılıyor.
- "Konuşma bulunamadı" hatasında editör ekranı ile altyazı listesi ayrışmıyor; önceki iş korunuyor.
- Çeviri sürerken elle düzeltilen satırların üzerine artık yazılmıyor.
- Zamanı bozuk gelen bulut altyazı satırları SRT'ye sızmıyor.
- Uzun Premiere işlemleri (ses dışa aktarımı) sırasında arka plan sorguları birikmiyor.
- "#", "%" veya "'" içeren klasör/kullanıcı adlarında önizlemeler bozulmuyor; klip adındaki görünmez karakterler panel yanıtını bozmuyor.
- Aynı adlı iki sekans artık birbirine karışmıyor.
- Eski geçici render ve önizleme klasörleri otomatik temizleniyor.

### Güvenlik
- Pro içerik indirme izni artık cihaza bağlı; dosya indirmeye istek sınırı eklendi.
- Pro lisans önbelleği ve yapılandırması kolay atlatılamayacak şekilde sıkılaştırıldı.
- Güncelleme dosya adı komut satırına güvenli biçimde veriliyor; yayın kontrolü preset ve video dosyası sızıntısını da yakalıyor.
- **Otomatik güncelleme** indirilen dosyayı GitHub'ın SHA-256 özetiyle doğruluyor; uyuşmazsa kurmuyor.
- **Whisper modelleri** indirildikten sonra HuggingFace'in SHA-256 değeriyle doğrulanıyor; bozuk model kurulu sayılmıyor.

### Geliştirici
- Testler her push'ta Windows, macOS ve Linux'ta GitHub Actions ile çalışıyor (`node tools/test.js`).
- Yeni saf modüller (testli): `caption-text`, `textcut`, `chapters`, `auto-emoji`, `transitions`.

