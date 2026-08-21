## Suflo 2.6.5 — Motion Preset düzeltmesi

- Motion preset anahtar kareleri artık timeline'ın mutlak saniyesine değil, seçili klibin gerçek kaynak in/out zamanına yazılır.
- Kesilmiş, timeline'ın ilerleyen bölümünde duran ve hızlandırılmış kliplerde Slide, Zoom, Fade, Pop ve vurgu hareketleri görünür klip aralığına doğru uygulanır.
- Premiere anahtar kareleri gerçekten yazmadıysa Suflo artık yanlışlıkla “uygulandı” mesajı göstermez; anlaşılır hata verir.
- Aynı preset farklı hızla yeniden uygulandığında önceki denemeden kalan fazla anahtar kareler temizlenir.

## Suflo 2.6.4 — Motion Presetleri

- **12 yeni yerleşik Motion preseti:** Simple Zoom In/Out, Pop In, dört yönlü Slide In, Fade In/Out, Focus Punch, Micro Shake ve Slide Out Right.
- Timeline'da bir veya birden fazla klip seçip tek tıkla uygulanır; harici `.prfpset` paketi kurmak gerekmez.
- Preset kartlarında canlı hareket önizlemesi, arama, Slide/Zoom/Fade/Vurgu filtreleri ve favoriler bulunur.
- Hızlı, Dengeli ve Sinematik süre seçenekleriyle Yumuşak, Normal ve Güçlü hareket seviyeleri eklendi.
- Ücretsiz kullanıcı bütün presetleri canlı önizlemeli ve kilitli görür; Suflo Pro etkinleşince kartlar anında açılır.
- Pro MOGRT klasörleri artık Text ve Diğer Animasyonlar olarak doğru kategorilenir; hakları doğrulanmış yeni paketler sonradan karışıklık yaratmadan eklenebilir.

## Suflo 2.6.3 — Emoji Cloud bağlantı onarımı

- Önceki sürümlerden kalan boş Emoji CDN ayarı artık Suflo Cloud adresini ezmiyor; yerel emoji klasörü kullanılmıyorsa 169 öğelik canlı katalog otomatik bağlanıyor.
- Kullanıcı Emoji CDN'i bilerek kapatırsa bu tercih korunuyor; eski bozuk ayarla bilinçli tercih birbirinden ayrılıyor.
- Yerel emoji klasörü kaldırıldığında, kullanıcı bulut kataloğunu ayrıca kapatmadıysa Suflo Cloud otomatik geri geliyor.
- Sunucudaki katalog, önizleme ve dosya özetleri yeniden doğrulandı.
- Hostinger'ın PNG optimizasyonunun dosya özetini değiştirmesi engellendi; asıl emoji dosyası byte-koruyan güvenli akıştan gelirken hafif önizlemeler CDN'de kalıyor.

## Suflo 2.6.2 — Pro İçerik Bulutu + premium vitrin

- **Bir kez etkinleştir, sürekli güncel kal:** 40 MOGRT ve 265 SFX lisans doğrulandıktan sonra otomatik kurulur; yeni kataloglarda yalnız değişen dosyalar indirilir.
- **Güvenli ve kesintiye dayanıklı eşitleme:** yarım indirme kaldığı yerden sürer, her dosya SHA-256 ile doğrulanır, bozuk yerel içerik otomatik onarılır ve çalışan son sürüm korunur.
- **Hızlı başlangıç:** değişmeyen 300+ MB içerik her Premiere açılışında yeniden hashlenmez; değişiklikte anında, en geç yedi günde bir tam bütünlük kontrolü yapılır.
- **Ücretsizden Pro'ya gerçek vitrin:** ücretsiz kullanıcı 40 yazı efektinin gerçek önizlemesini ve 11 kategorideki 265 SFX'i görür; timeline eylemleri net biçimde kilitlidir.
- **Yeni Pro penceresi:** özelliğe özel örnekler, 749 TL tek seferlik fiyat, satın alma, canlı demo ve mevcut lisansı etkinleştirme yolları tek premium akışta sunulur.
- **Güçlendirilmiş lisans ve dağıtım:** Lemon Squeezy store/product sahipliği yeniden doğrulanır; ücretli dosyalar public pakete girmez ve canlı Pro API hazır değilse GitHub yayını otomatik durur.
- **Daha erişilebilir panel:** stil, MOGRT ve SFX kilitleri klavye ve ekran okuyucu için anlamlı etiketler taşır; modal kapanınca odak kullanıcının kaldığı karta döner.

## Suflo 2.6.1 — Stil Motoru v2 + Suflo Cloud Emoji

- Emoji Assets artık Hostinger gibi statik bir sunucudaki güvenli `catalog.json` kataloğuna bağlanabiliyor.
- Kartlarda hafif WEBP önizlemeler açılıyor; asıl PNG, WEBP, GIF veya JPG yalnızca kullanıcı seçtiğinde indiriliyor.
- İndirilen dosya boyut ve SHA-256 özetiyle doğrulanıyor, yerel önbelleğe alınıyor ve mevcut güvenli Premiere timeline akışıyla playhead'e ekleniyor.
- CDN paketleyici CORS/cache ayarlarını, katalog dosyasını ve Hostinger kurulum notunu otomatik üretiyor; dağıtım hakkı onayı olmadan çalışmıyor.

- Viral Vurgu artık iki satırlı, aktif kelimeli ve katmanlı creator kompozisyonu üretiyor.
- Pop stili renkli sticker kutuları, beyaz çerçeve, gölge ve confetti katmanlarıyla yeniden çizildi.
- Belgesel ve Premium stilleri editoryal panel, altın cetvel ve sinematik reveal sistemiyle yenilendi.
- Stil kartları gerçek 16:9 demo sahneleri, okunaklı yakın plan ve kesintisiz animasyon döngüsü kullanıyor.

## Suflo 2.6.0 — Stil Motoru, sıfırdan

- **Dört bağımsız stil ailesi:** Viral Vurgu, Pop, Belgesel ve Premium artık aynı efektin renk/font varyasyonu değil; her birinin satır yapısı, hareket eğrisi, vurgu kuralı ve kompozisyonu ayrı.
- **Gerçek motor önizlemeleri:** Stil kartları temsili CSS animasyonu yerine dağıtımdaki motorun render ettiği hareketli örnekleri gösterir.
- **Gerçek canlı önizleme:** Premiere içinde “Oynat”, seçili ayarlarla kısa bir render üretir; “Kare al” kullanıldıysa sonucu kullanıcının kendi görüntüsünde gösterir.
- **Yeni lisanslı fontlar:** Belgesel için Lora, Premium için Montserrat eklendi. Türkçe karakterler ve gerçek libass renderları test edildi.
- **Tek kaynaklı motor:** Stil üretimi altyazı editöründen ayrıldı; ASS dışa aktarımı ve timeline katmanı aynı yeni motoru kullanır.

## Suflo 2.5.8 — Dümdüz, doğru altyazı

- **Kelime kelime ve birikimli satır modları artık ücretsiz** — kelime zamanlı altyazı için Pro gerekmez.
- **Emoji Assets'te WEBP düzeltmesi:** animasyonlu WebP dosyaları da artık tek tıkla timeline'a eklenir (dönüşüm panelin içinde yapılır, ffmpeg şart değil).
- **Emoji Assets tamamen ücretsiz:** kalan PRO rozetleri de kaldırıldı.
- **Stil/animasyon arayüzü kaldırıldı:** panel dümdüz, doğru altyazıya odaklanır — stilini Premiere'in kendi caption aracından seçersin.

## Suflo 2.5.7 — Emoji Assets artık ücretsiz

- **Emoji Assets herkese açıldı:** Kendi PNG / WEBP / GIF arşivini bağla, büyük kartlarda ara, tek tıkla timeline'a ekle — artık Pro gerekmez. (Emoji görselleri hiçbir zaman paralı pakete girmez.)
- **Suflo Pro Paketi tek tıkla:** Satın aldıktan sonra indirdiğin paketi Ayarlar → Suflo Pro Paketi'nden göster; `mogrt/`, `sfx/` ve varsa `emoji/` klasörleri otomatik bağlanır.
- Küçük panel iyileştirmeleri ve metin düzeltmeleri.

## Suflo 2.5.6 — Lisans düzeltmesi + hafif kurulum

- **Lisans doğrulaması düzeltildi:** Suflo Pro satın alan herkes anahtarını sorunsuz etkinleştirir (ürün bağlantısı canlı mağazaya güncellendi).
- **Çok daha hafif indirme:** Kurulum paketi artık birkaç MB. İçerik kütüphanesi (hazır yazı animasyonları + SFX) ayrı **Suflo Pro Paketi** olarak gelir — satın alınca Lemon Squeezy'den indirip Ayarlar → Suflo Pro Paketi'nden tek tıkla yüklersin.
- **Panel "Pro'yu Al" bağlantısı** canlı ödeme sayfasına güncellendi.
- Tüm Pro özellikleri (animasyonlu altyazı, otomatik kesim, ritim, çeviri, ASS, sözlük) kuruluma ihtiyaç duymadan çalışır.

## Suflo 2.5.5 — Hazır SFX Kütüphanesi

- **820 hazır SFX:** SUFLO Main SFX Library artık kurulumla birlikte gelir.
- **Klasör klasör kullanım:** Önce kategori kartını aç, sesi ön dinle ve timeline'a ekle; tek tıkla klasörlere dön.
- **Daha büyük MOGRT önizlemeleri:** Yazı animasyonları daha net ve anlaşılır görünür.
- **Kompakt Emoji Assets:** Aynı ekranda daha fazla emoji kartı görünür.
- SFX dosyaları Pro lisansı etkinleşince klasör seçmeden otomatik kullanıma açılır.

## Suflo 2.5.4 — Emoji Assets

- Yeni Pro **Emoji Assets** kütüphanesi: kendi PNG, WEBP, GIF ve JPG klasörünü bağla.
- **Yazı Animasyonları boş görünme sorunu giderildi:** kart adları anında çizilir, thumbnail'lar arkadan yüklenir.
- MOGRT'lar klasör yapısına göre ayrıldı: saf text efektleri **Yazı Animasyonları**'nda; logo, ikon, lower third, liste ve diğer paketler **Diğer Animasyonlar**'da.
- 172 görsellik yerel arşivde büyük ve net kartlar, arama, favoriler ve son kullanılanlar.
- DRAG veya tek tıkla playhead'deki güvenli boş video katmanına yerleştirme.
- WEBP görseller Premiere uyumlu şeffaf PNG'ye yerelde otomatik hazırlanır; GIF hareketi korunur.
- Dosya adlarındaki indirme sitesi/iOS etiketleri arayüzde temizlenir; dosyanın kendisine dokunulmaz.
- Ücretsiz Unicode emoji seçici aynen ücretsiz kalır. Pro, görselleri değil yerel arşiv iş akışını açar.

## Suflo 2.5.3 — Studio arayüzü

- Suflo, daha profesyonel ve Adobe uyumlu **Studio UI** tasarımına geçti.
- MOGRT kartları büyütüldü; önizlemeler kırpılmadan ve daha net gösteriliyor.
- Aktif kartlarda **DRAG**, Pro kartlarında belirgin **LOCKED** durumu bulunuyor.
- MOGRT kartları sürüklenip bırakıldığında mevcut playhead'e güvenli biçimde yerleştiriliyor.
- Sol menüdeki emoji karakterleri tutarlı çizgi ikonlarla değiştirildi.
- Panelin başlangıç alanı genişletildi; büyük ekranda daha fazla kart rahatça görülebiliyor.

---

## Suflo 2.5.2 — Yazı Animasyonları düzeltmesi

- 2.5.1'in ilk paketini kuran kullanıcılara düzeltmenin otomatik ulaşması için sürüm numarası yükseltildi.
- **Yazı Animasyonları** artık yalnızca tam 40 seçilmiş Suflo Original gösterir.
- Bağlı klasörlerdeki diğer şablonlar ayrı **Bağlı MOGRT'lar** bölümüne taşındı.
- Vault'taki aynı Suflo efektinin farklı ad veya klasördeki kopyası otomatik elenir.
- 40 MOGRT'ın tamamı kurulum paketine dahil edildi.

---

## Suflo 2.5.1 — Akıllı SFX, kütüphane sağlık kontrolü, içerik paketi altyapısı

- **Yazı Animasyonları temizlendi:** bölüm artık tam 40 seçilmiş Suflo Original gösterir; bağlı klasörlerdeki diğer MOGRT'lar ayrı **Bağlı MOGRT'lar** bölümünde tutulur.
- Vault'ta farklı klasör veya dosya adıyla bulunan Suflo Original kopyaları otomatik ayıklanır; aynı efekt ikinci kez görünmez.
- **40 adet sametcreates yapımı Suflo Originals Text Animation** doğrudan Pro paketine eklendi ve klasör bağlamadan hazır görünür.
- **Akıllı SFX araması:** çok kelimeli arama puanlamayla sıralanır; favoriler ve son kullanılanlar ayrı görünümler.
- **Kütüphane Sağlık Kontrolü:** Ayarlar'dan tek bakışta MOGRT/SFX kaynaklarının durumu; kopyalanabilir tanı raporu.
- **İçerik paketi altyapısı:** panel, `content/` klasöründeki paketlenmiş MOGRT'leri katalogla birlikte otomatik listeler.
- Kullanıcının kendi MOGRT/SFX klasörlerini bağlama özelliği aynen duruyor; derin alt klasör taraması iyileştirildi.
- Paketleme araçları `content/` klasörünü tanıyor.

---

## Suflo 2.3.0 — Emoji seçici büyüdü: 3770 emoji, Apple görünümü

51 emojilik mini seçici, tam bir kataloğa dönüştü:

- **3770 emoji** — 9 kategori (Suratlar, İnsanlar, Doğa, Yiyecek, Seyahat, Aktivite, Nesneler, Semboller, Bayraklar), sayaçlı kategori çipleri, ten rengi çeşitleri dahil.
- **Apple görünümü** — Windows'ta bile. Görsel set ilk kullanımda tek dosya olarak (~20 MB) senin makinene iner; ffmpeg ve Whisper modeliyle aynı model. İstersen Twemoji setine geçebilirsin.
- **Türkçe arama** — "ateş", "kalp", "para", "gülme", "köpek"… 200'e yakın Türkçe sözcük İngilizce kataloğa köprülenir; İngilizce arama da çalışır.
- **Sahneye bırak akıllandı** — Mac'te gerçek Apple çizimi her boyutta net (sistem fontundan render); eski CEF'lerde otomatik yedek yollar devreye girer.
- İnternet yoksa 51 emojilik yerleşik Twemoji yedeği açılır — seçici asla boş kalmaz.

Telif notu: Apple'ın ve Twitter'ın emoji çizimleri pakete ve depoya konmaz (Apple'ın telifli eseri); panel görselleri herkese açık CDN'den doğrudan kullanıcının diskine indirir. Depoda yalnız MIT lisanslı metadata (adlar, kategoriler, koordinatlar) taşınır.

---

## Suflo 2.2.1 — Kesim düzeltmeleri

2.2.0'daki "Duraksamaları bul" bazı kurulumlarda sonuçsuz görünüyordu. Üç düzeltme:

- **Kesimleri uygulama onarıldı**: razor zamankodu, Premiere API'sinde bulunmayan bir alandan (`videoFrameRate`) türetilmeye çalışılıyordu ve sessizce başarısız oluyordu — artık sekansın kendi zaman tabanından hesaplanıyor.
- **Hatalar artık görünür**: ffmpeg ses analizinde hata verirse (ses akışı yok, dosya okunamıyor…) eskiden yanıltıcı "duraksama yok" mesajı çıkıyordu, üstelik durum satırı hatayı anında sildiği için çoğu zaman hiçbir şey görünmüyordu. İkisi de düzeldi; gerçek hata mesajı ekranda kalıyor.
- Kesim analizi artık tanı günlüğüne yazıyor (Ayarlar → Destek → "Günlüğü kopyala" ile paylaşabilirsin).

---

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
## Suflo 2.6.2 — Pro İçerik Bulutu + premium vitrin

- **Bir kez etkinleştir, hep güncel kal:** 40 yazı animasyonu ve 265 SFX lisans doğrulandıktan sonra otomatik kurulur; yeni içerik sürümünde yalnız değişen dosyalar indirilir.
- Kesilen indirme kaldığı yerden devam eder. Yeni paket tamamen SHA-256 doğrulanmadan çalışan kütüphane değişmez; aktif sürümle birlikte bir önceki geri dönüş kopyası korunur.
- Ücretsiz kullanıcılar artık 40 MOGRT'ın gerçek önizlemesini ve 11 kategorideki 265 SFX'i kilitli vitrin olarak görebilir; ücretli dosyaların hiçbiri açık pakete girmez.
- Yazı stili kartları canlı önizlemeye açık kalırken Pro timeline çıktısı her kartta belirgin kilitle anlatılır.
- Özelliğe özel yeni Pro penceresi gerçek MOGRT örnekleri, SFX vitrini, net fiyat ve ayrı satın alma / demo / lisans yolları sunar.
- Lisans doğrulaması hem istemcide hem private içerik servisinde store + product sahipliğini kontrol eder; yanlış ürün aktivasyonu koltuğu geri bırakır.
- Public paketleyiciler ücretli `content/` klasörünü gömmeyi reddeder. Yayın aracı, private Pro API canlı ve lisans kapısı çalışır durumda değilse sürümü yayınlamaz.
