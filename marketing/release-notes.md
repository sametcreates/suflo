## Suflo 2.9.6 — Normal veya stilli, karar senin

- Caption Editor sonucunda iki bağımsız ekleme yolu artık aynı anda görünüyor: **Normal altyazı izi ekle** ve **Stil seçerek ekle**.
- Bir MOGRT stili seçmek normal Premiere caption yolunu artık değiştirmiyor veya gizlemiyor. Kullanıcı aynı altyazıyı düzenlenebilir normal caption izi olarak her zaman ekleyebiliyor.
- Stil seçildiğinde ikinci düğme seçilen şablonun adıyla açılıyor ve yalnız animasyonlu MOGRT yerleştirme yolunu çalıştırıyor.
- Kalite uyarıları ve tekrar uygulama onayları normal ve stilli yollar için ayrı tutuluyor; bir yolun onayı diğerini yanlışlıkla tetiklemiyor.
- Dar Premiere panellerinde iki seçenek alt alta, geniş panellerde yan yana ve okunaklı biçimde yerleşiyor.

## Suflo 2.9.5 — Tek altyazı motoru ve Suflo Caption Editor

- Kullanıcının karşısındaki yerel/bulut motor karmaşası kaldırıldı. Yeni **Suflo Altyazı Motoru** en doğru kurulu modeli ve GPU'yu kullanır; yerel çekirdek çalışmazsa yalnız önceden ayarlanmış güvenli bulut yedeğine geçer.
- Yerel transkripsiyonda daha isabetli sonuç için beam search ve en güçlü kurulu model önceliği getirildi. Proje sözlüğündeki isimler, markalar ve özel terimler artık motorun ilk dinleme yönlendirmesine de ekleniyor.
- Yeni **Suflo Caption Editor**; kalite puanı, kelime ve okuma hızı istatistiği, düşük güvenli metinler, çakışan zamanlar, aşırı hızlı ve uzun satırlar için canlı uyarılar gösteriyor.
- Arama, yalnız sorunlu satırları gösterme, tek tıkla nizami metin/zaman düzeltme, zaman koduna tıklayıp playhead'i götürme, 50 adımlı geçmiş ve otomatik taslak kaydı eklendi.
- Kullanıcının yaptığı tek kelimelik düzeltmeler proje sözlüğüne öğretilebiliyor; sonraki altyazılarda hem transkripsiyon öncesi hem sonrasında kullanılıyor.
- İsteğe bağlı **AI metin kontrolü** zaman kodlarını ve satır sayısını değiştirmeden yalnız yazım, noktalama ve bariz konuşma tanıma hatalarını denetliyor.
- Enter ile böl, Alt+Enter ile yeni satır ekle, Ctrl+Enter ile sonraki satıra geç gibi hızlı düzenleme kısayolları eklendi.
- Kritik okuma hızı, zaman veya güven sorunu bulunan altyazılar timeline'a uygulanmadan önce Suflo açıkça uyarıyor; sorunlu sonuç artık fark edilmeden sekansa gitmiyor.

## Suflo 2.9.4 — Hızlı açılış ve yeni Suflo Doctor

- Premiere projesi açılırken büyük MOGRT, SFX, emoji ve Motion BG arşivleri artık aynı anda taranmıyor. Suflo önce hafif arayüzünü açıyor; kütüphaneler yalnız ilgili bölüme girildiğinde yükleniyor.
- Panel, proje veya çalışma alanı açılışında Premiere'e aralıksız bağlam sorgusu göndermiyor. Canlı klip/sekans takibi kullanıcı panelle etkileşince başlıyor.
- Yüzlerce MOGRT önizlemesi aynı anda oynatılmıyor; hareketli önizleme kartın üzerine gelince yükleniyor. Büyük kütüphanelerde ilk açılış ve kaydırma belirgin biçimde hafifledi.
- **Suflo Doctor** baştan tasarlandı: yabancı kalkan simgesi ve uzun banner görünümü kaldırıldı; gerçek Suflo amblemi, kompakt kontrol kapsamı ve tek satırlık tarama aksiyonu getirildi.
- Doctor'ın tarama, güvenli onarım ve rapor kopyalama mantığı korundu. Tarama sırasında buton griye düşmek yerine markalı işlem durumunu gösteriyor; sonuçlar daha okunaklı bir tanı kartında açılıyor.

## Suflo 2.9.3 — Pro vitrini ve daha kısa satın alma yolu

- Ücretsiz kullanıcılar artık Pro dosyaları bilgisayarlarında olmasa bile **17 gerçek altyazı stilini** Stil bölümünde kilitli olarak görüyor; 17 kartın tamamında MOGRT'ın kendi hareketli önizlemesi oynuyor.
- Creator Punch, Karaoke, Glitch, Typewriter ve diğer stiller satın almadan önce incelenebiliyor. Pro etkinleşince vitrin kartları kayboluyor ve aynı alanda gerçek 9:16, 16:9 veya 1:1 dosyaları kullanıma açılıyor.
- Stil kartı ve altyazı sonucu, genel bir satış mesajı yerine **17 stil · 3 oran · 51 MOGRT** değerini anlatan özelliğe özel Pro penceresini açıyor.
- Suflo.app'te altyazı stilleri Pro galerisinin ilk sekmesine taşındı; masaüstü ve mobilde sekiz gerçek animasyon örneği gösteriliyor, eski 7 stil metni güncel 17 stil iş akışıyla değiştirildi.
- Web ödeme akışı Lemon Squeezy'nin sayfa içi güvenli penceresiyle açılıyor. Panel ve web siparişleri, kişisel veri toplamadan siparişe kaynak/özellik/sürüm bilgisi ekliyor; böylece hangi Pro özelliğinin satış getirdiği ölçülebiliyor.
- Public kurulumda yalnız yaklaşık 0,36 MB'lık WEBP/WEBM önizlemeleri bulunuyor; ücretli MOGRT dosyaları GitHub paketine girmiyor ve lisanslı Pro Bulutu'nda kalıyor.

## Suflo 2.9.2 — 17 gerçek altyazı stili

- **Stil** bölümü geri geldi; artık Suflo'nun eski sentetik stil kartlarını değil, Pro İçerik Bulutu'ndan lisanslı kullanıcıya otomatik inen gerçek altyazı MOGRT'larını kullanıyor.
- Captioneer koleksiyonundaki 51 dosya arayüzde tekrarlanmıyor: **17 stil tek kart** olarak görünüyor; Suflo sekansa göre 9:16, 16:9 veya 1:1 varyantını arka planda otomatik seçiyor.
- Typewriter, Tiktok, Spinning, Slide, Slant, Obviously, Mr Beast, Motion Blur, Marker, Karaoke, Glitch, Emphasis, Comic, Clean, Block, Arch ve Akira stilleri destekleniyor.
- Seçilen şablon her altyazı cümlesine gerçek MOGRT klibi olarak yerleşiyor; metin düzenleniyor, başlangıç/bitiş süreleri korunuyor ve yarım kalan işlem güvenle geri alınıyor.
- Stil kartları ücretsiz kullanıcıda **Pro kilitli** görünür; etkin Pro lisansıyla tek tıkla tüm altyazılara uygulanır.
- Pro kullanıcı paketi yeniden kurmaz: 51 yeni MOGRT yalnızca bir kez, yaklaşık 99 MB'lık delta güncelleme olarak otomatik eşitlenir. Premiere'e önceden kurulmuş uyumlu yerel şablonlar da kullanılmaya devam eder.
- Uyumlu şablon bulunmayan sistemlerde boş ekran yerine açık bir kurulum durumu gösterilir.

## Suflo 2.9.1 — Creator Studio, Suflo Doctor ve güvenilir Pro araçları

- Arayüz baştan sona daha sakin, minimal ve marka moruna uyumlu bir **Creator Studio** diline geçirildi; dar Premiere panellerinde ikon rayına dönüşerek yatay taşmayı önlüyor.
- Yeni **Suflo Doctor**; Premiere bağlantısını, FFmpeg'i, yerel motor/modeli, GPU'yu, Pro içeriklerini ve kütüphaneleri tek taramada denetliyor, güvenli onarım seçenekleri sunuyor.
- **Smart SFX 2.0**; Sade/Dengeli/Enerjik yoğunluk, güven puanı, üç alternatif, toplu timeline ekleme ve sarılabilir gerçek dalga önizlemesi getiriyor.
- **Auto Zoom**, altyazıdaki cümle dönüşleri, duraklamalar, sayılar ve vurgulardan AutoCut benzeri karar noktaları çıkarıyor; hızlandırılmış ve yavaşlatılmış kliplerin timeline süresini doğru kullanıyor.
- Stil Motoru v3'e gerçek katman ve hareket üreten **Creator Punch**, **CapCut Clean** ve **SaaS Glass** eklendi; gömülü Türkçe fontlarla render hattında doğrulandı.
- Premiere'in yerel Graphic Templates klasöründeki Captioneer altyazıları ayrı ve açıkça **Pro** işaretli **Altyazı Şablonları** bölümünde tutuluyor. Ücretsiz kullanıcılar şablonları görebiliyor; timeline'a ekleme lisans kapısından geçiyor.
- Premiere'de hata veren eski `Subtitle 01–05` kalıntıları Suflo kütüphanesinde gösterilmiyor; gerçek Captioneer 16:9, 9:16 ve 1:1 şablonları korunuyor.
- Karışıklık yaratan **Stil Katmanı** bölümü ve eski katman uygulama düğmesi Altyazı ekranından kaldırıldı. Düzenlenebilir Premiere caption izi için tek ve net **Sekansa uygula** akışı kaldı.
- Büyük `.prfpset` efektlerinde değişmeyen değerler tekrar yazılmıyor ve Effect Controls paneli yalnız son anahtar karede yenileniyor. İlk uygulamada dakikalar süren bekleme kaldırıldı; motor yalnız doğruladığı klip ve parametreler için başarı bildiriyor.

## Suflo 2.9.0 — Creator Studio

- Arayüz baştan sona daha sakin, minimal ve marka moruna uyumlu bir **Apple tarzı creator studio** diline geçirildi; 560 px altındaki Premiere panellerinde ikon rayına dönüşerek yatay taşmayı önlüyor.
- Altyazı Stil Motoru v3'e gerçek katman ve hareket üreten **Creator Punch**, **CapCut Clean** ve **SaaS Glass** eklendi. Yedi stilin tamamı gömülü Türkçe fontlarla gerçek libass render hattında doğrulandı.
- Premiere'in yerel Graphic Templates klasörü otomatik taranıyor; kurulu Captioneer altyazı MOGRT'ları taşınmadan **Altyazı Şablonları** bölümünde görünür. Logo, yorum, lower third, liste, ikon ve podcast şablonları artık yanlışlıkla Yazı Animasyonları'na düşmüyor.
- **Smart SFX 2.0**, daha geniş anlamsal vurgu kuralları, Sade/Dengeli/Enerjik yoğunluk, güven puanı, üç alternatif, toplu timeline ekleme ve sarılabilir gerçek dalga önizlemesi getiriyor. Analiz yerelde kalıyor.
- **Auto Zoom**, altyazıdaki cümle dönüşleri, duraklamalar, sayılar ve vurgulardan AutoCut benzeri karar noktaları çıkarıyor; hızlandırılmış/yavaşlatılmış kliplerde timeline süresini doğru kullanıyor.
- `.prfpset` motoru `AE.` matchName farklarını ve normal timeline/QE klip dizini kaymalarını gideriyor; efekt Premiere tarafından listenin arasına eklense bile doğru bileşeni bulup yalnız gerçek parametre yazıldıysa başarı bildiriyor.

## Suflo 2.8.7 — Suflo Doctor

- Yeni **Suflo Doctor**, Premiere bağlantısını, FFmpeg'i, yerel motor/modeli, GPU'yu, Pro içerikleri, gerçek `.prfpset` paketini ve tüm kütüphaneleri tek taramada kontrol eder.
- Eksik FFmpeg/motor, yarım Pro eşitlemesi ve artık bulunamayan harici klasör bağlantıları için güvenli tek tık onarım sunar; timeline'a ve medya dosyalarına dokunmaz.
- Pro manifestindeki her dosyanın varlığı ve boyutu denetlenir; preset paketi açılarak efekt sayısı ile doğrudan/uyumluluk modları doğrulanır.
- 2.8.6'da grafik/emoji yerleştirmesine yanlışlıkla taşınan Motion BG dönüş alanı düzeltildi; Motion BG artık kaldırdığı bağlı ses sayısını panele doğru bildirir.

## Suflo 2.8.6 — Motion BG ses düzeltmesi

- **Düzeltildi:** Motion BG eklerken kaynak videonun **ses izi de timeline'a düşüyordu.** Motion BG görsel bir katmandır — artık yalnızca görüntü eklenir, bağlı ses klibi otomatik temizlenir.
- Güvenli temizlik: yalnızca **aynı medyadan, aynı konuma** düşen ses klibi silinir — timeline'daki kendi ses klipleriniz etkilenmez.

## Suflo 2.8.5 — Baştan düzenlenen 1.076 SFX

- SFX kütüphanesi 14 anlaşılır koleksiyonda 1.076 benzersiz sese çıktı; panelde arama, ön dinleme ve timeline'a ekleme aynı akışta çalışıyor.
- Kökte duran 495 dağınık sesin tamamı doğru koleksiyonlara ayrıldı; kökte başıboş ses kalmadı.
- `seni seçtim` koleksiyonu `sametcreates Essentials` adıyla yenilendi ve panelde her zaman ilk sırada gösteriliyor.
- 20+ GB arşivdeki ana SFX kütüphanesinden uygun sesler seçildi; birebir aynı 512 kopya ile müzik dosyaları Pro paketinden çıkarıldı.
- Mevcut Pro kullanıcıları paketi yeniden kurmaz: Suflo açıldığında yalnız yeni ve değişen içerikler güvenli içerik bulutundan otomatik iner.

## Suflo 2.8.4 — Presetler seçili klibe güvenilir biçimde uygulanıyor

- Essential Graphics ve yazı kliplerinde Premiere efekti listenin arasına yerleştirse bile Suflo yeni bileşeni gerçek kimliğiyle buluyor.
- `.prfpset` içindeki sabit değerler artık Adobe'nin doğru `StartKeyframe` alanından okunuyor.
- 64-bit renk değerleri kayıpsız ARGB kanallarına çevrilip Premiere'in renk API'siyle uygulanıyor.
- Canlı Premiere testinde `SUFLO Cyan Dropshadow` seçili Graphic klibine 6/6 parametreyle uygulandı ve renk doğrulandı.

## Suflo 2.8.3 — 290 preset artık panelden uygulanıyor

- **Suflo Native Preset Motoru:** 278 efektlik Suflo Smooth `.prfpset` paketi artık panel içinde gerçek kartlara ayrılıyor; arama, kategori ve favorilerle geziliyor.
- **270 preset doğrudan timeline'a:** Klibi seç, kartta **Uygula**'ya bas. Suflo efekti ve anahtar kareleri klibin gerçek kaynak in/out aralığına yazar; elle dosya gösterme ve Import Presets adımları yok.
- **8 özel preset için dürüst uyumluluk modu:** Adobe'nin opak Lumetri/özel veri yapısını kullanan kartlar yanlış sonuç veya sahte “uygulandı” mesajı üretmez; yalnız bu kartlarda Premiere içe aktarma rehberi açılır.
- **Sürüm ve dil uyumu:** Efektler önce Premiere'in efekt motorunda ad/matchName ile, gerekirse katalog taramasıyla bulunur; eksik üçüncü taraf efekt varsa anlaşılır hata ve güvenli fallback gösterilir.
- Gerçek 8,2 MB paket 278/278 kart, 270 doğrudan + 8 uyumluluk olarak doğrulandı; 32 test dosyasının tamamı geçti.

## Suflo 2.8.2 — Suflo Smooth preset paketi + yeni SFX

- **278 efektlik Suflo Smooth Editing Pack:** Shake, Slide, Zoom, Transition ve Look aileleri Pro İçerik Bulutundan otomatik iner.
- **Gerçek kurulum akışı:** Adobe `.prfpset` dosyalarını eklenti API'sinden sessizce içe aktarmadığı için Suflo dosyayı seçili olarak açar ve Premiere'deki tek seferlik üç adımı gösterir; yanıltıcı “uygulandı” mesajı vermez.
- **9 yeni Suflo whoosh:** SFX kütüphanesi 760'tan 769'a çıktı.
- Eski istemciler uyumlu, filtrelenmiş kataloğu almaya devam eder; 2.8.2 yalnız yeni preset dosyasını ve değişen içerikleri indirir.

## Suflo 2.8.1 — Motion BG senkron düzeltmesi (hotfix)

- **Düzeltildi:** 2.8.0'da Pro içerik eşitleme motionbg (mp4/mov) dosyalarını “desteklenmeyen içerik türü” diye reddedip **tüm senkronu durduruyordu** — artık Motion BG videoları da (yeni MOGRT/SFX ile birlikte) sorunsuz iniyor.
- 2.8.0 kullanıyorsan bu sürüme güncelle; panel Pro içeriği otomatik tamamlar.

## Suflo 2.8.0 — Dev icerik guncellemesi (Motion BG + 3 kat MOGRT + SFX)

- **Yeni “Motion BG” kategorisi:** 30 hareketli zemin & overlay (light leak, film grain, gradient, grid, VHS, glitch...). Kartta canli on izleme; tek tıkla playhead’de üst video katmanına düşer. Kendi arşivini de bağlayabilirsin.
- **MOGRT kütüphanesi 3 katına:** +116 yazı animasyonu, +51 element/particle/screen, +20 geçiş. Yazı / Diğer Animasyonlar / Butonlar kategorilerine dağılır.
- **SFX kütüphanesi ~3 katına:** 265 → 760 seçilmiş ses efekti.
- Tüm Pro içerik lisansla otomatik, delta olarak iner — sadece yeni dosyalar.

## Suflo 2.7.7 — Butonlar kütüphanesi

- **Yeni “Butonlar” kategorisi:** 35 hazır animasyonlu buton (Abone Ol, Takip Et, İndir, Sepete Ekle, Beğen, Paylaş, Kaydol…) — hepsi Türkçe adla. Sol menüde ayrı sekme.
- Lisansla Pro İçerik Bulutundan otomatik iner; panelden aranır, ön izlenir, tek tıkla playhead’e eklenir.

## Suflo 2.7.6 — Stil katmanı yeniden: 10 tanınır stil

- **Motor-tabanlı 4 eski stil (Viral Vurgu/Pop/Belgesel/Premium) kaldırıldı.** Yerine 10 keskin, tanınır stil: Sarı Vurgu, Yeşil Kontur, Kutu, Neon, Temiz, Zarif, Beyaz Kalın, Mor Vurgu, Sticker, Daktilo.
- Her stil panelde **gerçek örnek kelimeyle** görünür (AutoCut topluluk-preset tarzı) — hangi stilin ne olduğu bir bakışta belli.
- Başlık sadeleşti: "Bir görünüm seç — altyazın o stille gelir."

## Suflo 2.7.5 — Sürüm senkronu düzeltmesi

- **Kritik düzeltme:** panel kendi sürümünü (bridge.js) manifest ile senkronsuz raporluyordu (2.6.5te kalmıştı) — bu yüzden güncel kullanıcılara bile "Güncelle" şeridi çıkıyordu. Artık build sırasında sürüm manifestten otomatik yazılıyor; güncel olan güncel görünür.

## Suflo 2.7.4 — Kaçırılmaz güncelleme hatırlatıcısı

- Yeni sürüm şeridi artık ✕ ile **kalıcı gizlenmiyor** — yalnız o oturum kapanır, panel yeniden açılınca yumuşakça tekrar hatırlatır. Amaç: eski sürümdeki kullanıcılar yeni Pro özelliklerini kaçırmasın.
- Şerit mesajı iştah açıcı: "Güncelle — yeni özellikler var" + ne geldiği.
- İndir düğmesi artık **Güncelle**.

## Suflo 2.7.3 — "Güncel misin?" denetimi

- **Ayarlar → Güncelleme** grubu: mevcut sürüm + tek tıkla "Güncel misin? Denetle" butonu. Güncelsen "Güncelsin ✓" der, yeni sürüm varsa üstte indir şeridi çıkar.
- Üstteki **sürüm rozeti artık tıklanabilir** — tıklayınca güncellemeleri denetler.
- Amaç: eski sürümdeki ücretsiz kullanıcılar yeni Pro özelliklerini (otomatik zoom, yeni stiller, kesim) kaçırmasın.

## Suflo 2.7.2 — 6 yeni imza altyazı stili

- **Keskin, tanınır stiller** (AutoCut topluluk presetleri tarzı, %100 özgün): **Sarı Vurgu** (Hormozi — okunan kelime sararır), **Yeşil Kontur** (MrBeast — kalın kontur), **Kutu** (kelime dolu kutunun içinde), **Neon** (parlak camgöbeği/magenta, oyun-gece), **Temiz** (Montserrat yayın alt bandı), **Zarif** (Lora serif, lifestyle).
- Her stilin panel kartı artık gerçek örnek kelimeyle görünür — hangi stilin ne olduğu bir bakışta belli.
- Stil sayısı 4ten 10a çıktı; hepsi mevcut motorla uyumlu, aile: custom parametreleriyle.

## Suflo 2.7.1 — Otomatik Zoom: stiller + sabit nokta

- **Üç zoom stili (AutoCut tarzı):** Yumuşak (uçlarda içe/dışa yumuşama), Jump Cut (anahtar karesiz sert kesme), Snap-In (hızlı kademeli oturma).
- **Zoom merkezi / sabit nokta:** 3×3 ızgaradan seç — dikey (Reels) videoda üst-orta seçilince yüz kadrajda sabit kalır; zoom yüze kilitlenir.
- Merkez dışı seçimde pozisyon, zoomla senkron kayar; merkeze dönünce eski kayma otomatik geri alınır.
- 24 birim testi (stiller + sabit nokta dahil), tüm takım 30/30 yeşil.

## Suflo 2.7.0 — Otomatik Zoom

- **Yeni Pro özelliği: Otomatik Zoom.** Konuşmanı dinler, her konuşma başlangıcında yumuşak punch-in / punch-out ritmi kurar — elle keyframe’le saatler süren iş tek tık. Yoğunluk (%6–25) ve hız senin kontrolünde; "Ritmik" modda sabit aralıkla da çalışır.
- Anahtar kareler klibin kendi Scale değeriyle çarpan olarak yazılır: küçültülmüş/kadrajlanmış kliplerde de doğru sonuç.
- **"Zoom’u kaldır"** ile tek tıkla temizlenir; yeniden uygulamak güvenlidir (eski anahtarlar otomatik silinir).
- Plan üretici saf ve test edilebilir: 16 yeni birim testi (toplam takım 30 dosya, tümü yeşil).

## Suflo 2.6.6 — Otomatik Kesim, daha keşfedilebilir

- **Kesim sekmesinde net anlatım:** ne yaptığını, kazancını (elle ~40 dk jump-cut → ~2 dk) ve "orijinalin bozulmaz" güvencesini gösteren boş-durum kartı + 1-2-3 adım.
- **Ana akıştan keşif:** altyazı uygulandıktan sonra "Konuşma videon mu? Otomatik Kesim ile ölü anları temizle" ipucu çıkar; tek tıkla Kesim sekmesine götürür.
- **Doğru terim:** "Duraksamaları bul" → "Sessizlikleri bul"; menüde "sessizlik · jump cut".

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
