# Suflo

**Premiere için ücretsiz, açık kaynak altyazı paneli.**
⭐ Çekirdek sonsuza dek ücretsiz ve MIT. Animasyonlu altyazı, otomatik kesim ve MOGRT/SFX kütüphaneleri için **[Suflo Pro →](https://suflo.app/pro)**
Türkçe ve Azerice dahil 99 dil — abonelik yok, kredi yok, hesap yok.

> Premiere'in yerleşik altyazısı Türkçe konuşmayı yazıya dökemiyor. Suflo döküyor, üstelik bilgisayarında çalışan yapay zekâyla.

## Özellikler

Suflo konuşmayı izlenebilir kurguya çevirir. Seçili klipten, In–Out aralığından ya da tüm sequence'tan
transkript çıkarır; panelin içinde düzenlersin; caption izi olarak uygular ya da SRT/VTT/ASS/TXT
olarak dışa aktarırsın. Emoji Assets (yerel klasörün veya bağlı Suflo Cloud kataloğu) ücretsizdir.
Pro katmanında sessizlik kesme, ritim marker'ları, panelden seçili klibe uygulanan 12 Motion preseti + 278 efektlik Suflo Smooth kataloğu ve otomatik güncellenen 262 MOGRT + 1.076 SFX + 30 Motion BG kütüphanesi
ve altyazıdan Smart SFX 2.0 önerileri bulunur.

| Ne | Nasıl |
|---|---|
| **İlk altyazın 2 dakikada** *(3.1)* | İlk açılışta 4 adımlı rehber: hızlı küçük model (Türkçe: Small, 190 MB, ffmpeg arkada), örnek klipte deneme, stil önizlemesi, ücretsiz Groq anahtarı sihirbazı (panodan al + doğrula). AI düğmelerinde "anahtar gerekli · 1 dk" kısayolu |
| **Pro'yu dene** *(3.1)* | Kodla çalışan her Pro aracına kendi videonda 3 deneme hakkı: otomatik kesim, konuşmadan kes, viral anlar, otomatik zoom, geçişler, sesi iyileştir, Suflo Stilleri katmanı ve kanca başlığı, çeviri, ritim. Haklar süresiz; hak yalnız işlem başarıyla bitince düşer. Deneme stilli katmanlarında küçük bir suflo.app filigranı olur, Pro'yu alınca temiz yeniden oluşturulur |
| **Viral Skor 2.0** *(3.1)* | Viral anlara açıklamalı 0–100 puan: kanca, bağımsızlık, duygu, değer ve kapanış alt puanları ile tek satırlık neden (toplam yerelde hesaplanır). Tür (podcast, eğitim, komedi…), adet (3–10) ve "ne arıyorsun?" odağı; klipler cümle ortasında başlamaz/bitmez, kartta ±1 cümle düğmeleri; 3 kanca başlığı seçeneği "Başlık ekle"ye gider. Puanlar tahmindir, izlenme garantisi değildir |
| **Transkripsiyon** | Yerel motorla (whisper.cpp) çevrimdışı, ya da ücretsiz Groq anahtarıyla bulutta |
| **Düzenleme** | Satır bölme, birleştirme, zaman düzeltme, toplu kaydırma, geri al/yinele (Ctrl+Z/Y) |
| **Karaoke** | Kelime kelime ve birikimli mod; kelime zamanlarıyla |
| **Çeviri** | TR · AZ · EN · RU · DE · AR · ES · FR · PT · IT (+ NL, JA hedef), satır satır; **çok dilli SRT paketi** |
| **Terim sözlüğü** | Marka ve özel isimlerin doğru yazımını her transkriptte uygular |
| **Dışa aktarma** | SRT · WebVTT · ASS (stilli, karaoke etiketli) · TXT |
| **Konuşmadan kes** *(3.0)* | Iıı/eee, tekrar ve duraksamaları kelimeye tıklayarak kes; ▶ Dinle önizlemesi |
| **Bölümler** *(3.0)* | Konuşmadan YouTube bölümleri, AI başlık, kural denetimi, Chapter marker |
| **Paylaşım metni** *(3.0)* | YouTube başlık/açıklama/etiket; Reels ve TikTok kanca + açıklama + hashtag |
| **B-roll önerileri** *(3.0)* | Ara görüntü anları + İngilizce stok arama kelimeleri, yeşil marker |
| **Otomatik emoji** *(3.0)* | Satırın anlamına göre seyrek emoji, Türkçe ek dostu |
| **Anahtar kelime vurgusu** *(3.0)* | `*kelime*` ya da Otomatik vurgu: sayılar ve önemli kelimeler her stilde vurgu renginde |
| **Sesi iyileştir** *(3.0)* | Gürültü azaltma + LUFS normalize, gecikme telafili (senkron kaymaz) |
| **Shorts sekansları** *(3.0)* | Viral anlardan tek tıkla alt sekans + Auto Reframe 9:16; altyazısı ana transkriptten hazır |
| **Kanca başlığı** *(3.0)* | Shorts açılışına animasyonlu başlık kartı; playhead'e ya da viral anın başına |
| **Çift dilli altyazı** *(3.0)* | Çeviri sonrası orijinal + çeviri alt alta (SRT/VTT/caption izi) |
| **Geçişler** *(3.0)* | Kesime tek tıkla 13 geçiş (zoom, whip, itme…), eklentisiz keyframe |
| **Sahne algılama** *(3.0)* | Sahne değişimlerinde marker ya da bölme; vuruşlarda bölme |
| **Suflo Doctor** | Premiere bağlantısı, motor, Pro içerik ve 3.0 API uyumluluğu tek taramada |

### Altyazı motorları

- **Yerel (önerilen):** whisper.cpp bilgisayarında çalışır. İnternet, hesap, anahtar gerekmez. Panel tek düğmeyle kurar.
  - **Model seçimi:** Tiny (32 MB) · Base · Small · **Turbo (varsayılan)** · Large v3 (1 GB, Türkçe'de en iyi)
  - **NVIDIA GPU desteği:** ekran kartı otomatik algılanır, cuBLAS sürümü kurulur — ölçümde 7 kat hız
  - **Sessizlik atlama (VAD):** konuşma olmayan bölümler işlenmez — %61 hız + daha az uydurma altyazı
- **Groq bulut:** ücretsiz API anahtarıyla saniyeler içinde sonuç (günde 8 saat ses kotası). OpenAI ve özel endpoint (self-hosted Whisper dahil) de desteklenir.

**Hız (83 sn ses):** CPU 8,5 sn · NVIDIA GPU **1,2 sn**

### Altyazı editörü

Satır bölme (Enter) · birleştirme · elle zaman düzenleme (çift tık) · toplu kaydırma (±0,5 sn) · satır ekleme/silme · **geri al/yinele (Ctrl+Z / Ctrl+Y)** · zamana tıklayıp playhead'e gitme.

### Dışa aktarma

| Biçim | Ne için |
|---|---|
| **SRT** | Premiere caption izi, her yerde çalışır |
| **WebVTT** | YouTube, web oynatıcılar, sosyal platformlar |
| **ASS** | Stilli altyazı — kelime kelime modunda **karaoke (`\k`) etiketleriyle**; ffmpeg ile videoya gömülür, Aegisub/DaVinci/VLC okur |
| **TXT** | Zaman damgasız transkript (video açıklaması, blog) |

İçe aktarma: SRT ve WebVTT. Etiketler (`<v>`, `<i>`, `{\an8}`) ve HTML varlıkları temizlenir; cue ayarları olan zaman satırları ve saat alanı olmayan kısa biçim doğru okunur.

### Stiller ve düzeltme

Noktalama kaldır/koru · Normal / BÜYÜK HARF / küçük harf (Türkçe İ-ı ve Azerice kurallarına uygun) · satır uzunluğu kelime (2-5) veya karakter (32/42/60) · karaoke (kelime kelime / birikimli) · Whisper halüsinasyon filtresi · **terim sözlüğü** (`yanlış => doğru` kuralları her transkriptte otomatik uygulanır).

### İş kaybına karşı

Taslak transkript biter bitmez diske yazılır — panel kapanırsa kurtarılır. Uygulanan SRT proje klasörüne yazılır (Premiere dosyayı kopyalamaz, yola referans verir). Model indirmesi kesilirse kaldığı yerden devam eder, ayna sunucu dener, kota/sunucu hatasında inen kısım korunur, yarım dosya kurulu sayılmaz. Vekil sunucu (proxy) Ayarlar'dan girilir; https için CONNECT tüneli kurulur.

## Suflo Pro

Çekirdek Suflo MIT lisanslı ve sonsuza dek ücretsiz — transkripsiyon, editör, dışa aktarım kimsenin kilidi arkasına girmiyor. Pro, üstüne gelen katman: altyazı animasyonları, sessizlikleri temizleyen otomatik kesim, ritim marker'ları ve yerel içerik kütüphaneleri. Tek seferlik **749 TL**, abonelik yok, ömür boyu → [suflo.app/pro](https://suflo.app/pro)

| Ücretsiz (MIT, sonsuza dek) | Pro (bir kez 749 TL + KDV) |
|---|---|
| Yerel/bulut transkripsiyon (99 dil, çevrimdışı) | Bağımsız Stil Motoru ve şeffaf video katmanı |
| Altyazı editörü (bölme, birleştirme, zaman, geri al, taslak kurtarma) | Creator Punch · CapCut Clean · SaaS Glass dahil Stil Motoru v3 |
| Düz stiller | Otomatik kesim (sessizlik temizleme) |
| SRT · WebVTT · TXT dışa aktarım | Ritim/beat marker'ları |
| SRT/VTT içe aktarım | Toplu çoklu klip transkripsiyonu |
| Premiere caption izine uygulama | 12 dile çeviri + çok dilli SRT paketi |
| GPU hızlandırma | Stilli ASS dışa aktarım |
| Emoji seçici | **Sesi iyileştir** · **Otomatik zoom** · **Kanca başlığı** |
| Bölümler (YouTube) + otomatik emoji | **Konuşmadan kes:** dolgu sesi, tekrar ve duraksama temizliği, kelimeye tıklayıp kes |
| Terim sözlüğü (`yanlış => doğru`, her transkriptte) | **Suflo Stilleri:** 12 animasyonlu altyazı stili (Hormozi, Neon, Daktilo…) timeline'da, MOGRT gerekmez |
| Kelime kelime ve birikimli (karaoke) altyazı izi | **Geçişler:** kesime tek tıkla 13 geçiş (zoom, whip, itme…), eklentisiz |
| — | **Viral anlar:** uzun videodan 15–90 sn'lik Shorts/Reels anları, açıklamalı 0–100 puan (Viral Skor 2.0), cümle güvenli kenarlar, In/Out ve süreli marker |
| — | **Sahne algılama** ve **vuruşlarda bölme**; kesimleri uygulamadan **▶ Dinle** |
| Emoji Assets (yerel arşiv veya Suflo Cloud, favori/son, timeline'a ekleme) | Panelden uygulanan 12 yerleşik Motion + 278 efekt preseti + Pro İçerik Bulutu: 262 MOGRT, 1.076 SFX ve 30 Motion BG |
| — | Smart SFX 2.0: yoğunluk, güven puanı, alternatifler, toplu ekleme ve dalga önizlemesi |
| — | Kütüphane sağlık kontrolü ve destek raporu |

Abonelikli veya kredi tabanlı kurgu panellerinin aksine Suflo Pro'da sayaç ve otomatik yenileme yok — bir kez öde, bitti.

**Pro'yu dene.** Almadan önce kendi videonda dene: kodla çalışan her Pro aracına (otomatik kesim, konuşmadan kes, viral anlar, otomatik zoom, geçişler, sesi iyileştir, Suflo Stilleri katmanı ve kanca başlığı, çeviri, ritim) **3 deneme hakkın** var. Haklar süresiz; hak yalnız işlem başarıyla bitince düşer (hata ya da boş sonuç hak yemez; yalnız analiz eden adımlar da hak yemez). Deneme hakkıyla eklenen stilli altyazı katmanı ve kanca başlığının sağ üstünde küçük, yarı saydam bir `suflo.app` filigranı olur; SRT/VTT, Premiere caption izi, ses ve kesimler **hiçbir zaman** filigranlanmaz. Pro'yu etkinleştirince Ayarlar › Suflo Pro'daki "Deneme çıktılarını temiz yeniden oluştur" listesi, o sekans açıkken her deneme çıktısını filigransız yeniden üretip aynı yere koyar ve eskisini kaldırır. İçerik kütüphaneleri (MOGRT, SFX, Motion BG, preset, altyazı MOGRT stilleri), toplu klip ve stilli ASS dışa aktarma denemeye açık değil. Kalan hakların Ayarlar › Suflo Pro'da görünür.

### Pro İçerik Bulutu

Pro lisansı bir kez etkinleştirilir. Slide, Zoom, Pop, Fade ve vurgu ailelerindeki 12 yerleşik Motion preseti anında açılır. Panel, 262 MOGRT, 14 koleksiyona ayrılmış 1.076 SFX, 30 Motion BG ve 278 efektlik Suflo Smooth `.prfpset` paketini private içerik servisinden indirir; sonraki sürümlerde yalnız değişen dosyaları alır. Suflo Native Preset Motoru paketin XML'ini içeride okur: standart Premiere parametrelerini kullanan 270 preset karttan seçili klibe doğrudan uygulanır. Adobe'nin opak özel verisini kullanan 8 preset ise yanlış sonuç üretmek yerine açıkça Premiere uyumluluk moduna yönlendirilir. Kesilen indirme kaldığı yerden devam eder ve yeni sürüm tüm SHA-256 kontrollerini geçmeden çalışan kütüphane değişmez. Public GitHub paketinde ücretli içerik bulunmaz; yalnız kilitli vitrinler vardır. Sunucu yerleşimi ve Hostinger paketi için [`server/pro-v1/README.md`](server/pro-v1/README.md) dosyasına bak.

Kurulu içeriklerin değişmeyen dosyaları her Premiere açılışında yeniden hashlenmez; boyut/değişiklik zamanı farklıysa anında, her durumda en geç yedi günde bir tam SHA-256 doğrulaması yapılır. Geçici ilk bağlantı hatası otomatik yeniden denenir; kurulu son sağlam sürüm çevrimdışıyken kullanılmaya devam eder.

**Dürüstlük notu:** 2.3.0'da bu özelliklerin hepsi ücretsizdi. 2.4.0'a güncellersen Pro özellikleri kilitlenir — bunu küçük puntoya gömmüyoruz, açıkça söylüyoruz. Güncelleme zorunlu değil; 2.3.0'da kalabilirsin, çalışmaya devam eder. Kod MIT: fork'layıp kendi yolunu da çizebilirsin. Pro'nun gerekçesi basit: Suflo tek geliştirici işi ve Pro geliri geliştirmeyi sürdürülebilir kılıyor. Çekirdek ücretsiz ve açık kaynak kalıyor.

Unicode emoji seçici, fontlar ve **Emoji Assets** asla paywall arkasına girmez — hepsi ücretsiz katmandadır. Emoji Assets, kullanıcının kendi klasörünü veya Suflo Cloud kataloğunu yöneten iş akışıdır; emoji görsellerinin kendisi satılmaz. Apple/Twemoji gibi üçüncü taraf görseller dağıtım hakkı doğrulanmadan pakete konmaz.

### Suflo Cloud Emoji (Hostinger)

Dağıtım hakkı sana ait PNG/WEBP/GIF/JPG klasöründen statik sunucu paketi üret:

```powershell
node tools\build-emoji-cdn.js --source "D:\lisansli-emojiler" --out "D:\suflo-emoji-cdn" --rights-confirmed --license-name "Suflo owned assets"
```

Oluşan klasörün içindeki `assets/`, `thumbs/`, `catalog.json` ve `.htaccess` dosyalarını Hostinger'da aynı klasöre yükle. Sonra panelde **Ayarlar → İçerik kütüphaneleri → Emoji CDN** alanına `https://alan-adin/emoji/v1/catalog.json` adresini yapıştır. Panel yalnızca küçük önizlemeleri gösterir; kullanıcı karta bastığında asıl dosyayı indirir, SHA-256 ile doğrular, önbelleğe alır ve Premiere playhead'ine ekler.

`--rights-confirmed`, dağıtım hakkını bilinçli olarak onaylayan güvenlik kapısıdır. Kaynağı veya lisansı belirsiz iOS/Apple görselleri bu pakete konmamalıdır.

## Kurulum

**Windows ve macOS**, Premiere 14.4 (2020) ve üstü. Bir kere kurulur, sonra hep hazır.

### 🪟 Windows

1. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir ve kur (ücretsiz).
2. [Son sürüm `.zxp` dosyasını indir](https://github.com/sametcreates/suflo/releases/latest), çift tıkla.
3. Premiere'i kapat, tekrar aç → `Window > Extensions (Legacy) > Suflo` (Premiere 25.6+ ve 2026) ya da `Window > Extensions > Suflo` (daha eski sürümler).
4. Altyazı sekmesinin üstündeki **"İlk altyazın 2 dakikada"** rehberini izle: motoru kurar, örnek klipte dener, stilini ve yapay zekâyı açarsın. Gerisini panel yapar.

NVIDIA ekran kartın varsa hızlandırma otomatik açılır.

### 🍎 Mac

Mac'te iki yardımcı program gerekiyor. Panel bunları senin için kurar, ama önce **Homebrew** denen kurulum yardımcısına ihtiyacı var. Kopyala, yapıştır, bitti.

1. **Terminal'i aç.** (`⌘ + boşluk` → "Terminal" yaz → Enter)
2. **Homebrew'u kur** — şu satırı Terminal'e yapıştır, Enter'a bas. Mac şifreni isteyecek; yazarken ekranda görünmez, normali bu.

   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

   Bittiğinde "Installation successful!" yazar. Terminal sana `eval "$(/opt/homebrew/bin/brew shellenv)"` gibi ek satırlar kopyalamanı söylerse onları da yapıştır.
3. **Ses aracını kur:**

   ```bash
   brew install ffmpeg
   ```
4. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir ve kur (ücretsiz).
5. [Son sürüm `.zxp` dosyasını indir](https://github.com/sametcreates/suflo/releases/latest), çift tıkla.
6. Premiere'i kapat, tekrar aç → `Window > Extensions (Legacy) > Suflo` (Premiere 25.6+ ve 2026) ya da `Window > Extensions > Suflo` (daha eski sürümler).
7. Rehberde ya da panelde **"Yerel motoru kur (Homebrew)"** düğmesine bas. Homebrew yoksa rehber ücretsiz Groq anahtarıyla buluttan başlatır.

**Neden Homebrew?** whisper.cpp macOS için hazır ikili yayınlamıyor (resmi sürüm dosyaları yalnız Windows ve Ubuntu); Mac'te bu araçları kurmanın standart yolu Homebrew. Panel `brew install whisper-cpp` çalıştırır, modelleri kendisi indirir.

**Apple Silicon'da (M1 ve sonrası) GPU hızlandırma (Metal) kendiliğinden açıktır** — ayrı bir sürüm indirmek gerekmez.

**Panel menüde görünmüyor mu?** Premiere'i tamamen kapatıp yeniden aç; 25.6+ ve 2026'da yol `Window > Extensions (Legacy)`. Adım adım kontrol listesi: [suflo.app/blog/premiere-suflo-paneli-gorunmuyor](https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor)

**Homebrew istemiyorum:** ffmpeg'i [evermeet.cx](https://evermeet.cx/ffmpeg/)'ten tek dosya olarak indir, panelde `Ayarlar > ffmpeg > Elle yol` alanına yerini yaz, ücretsiz Groq anahtarıyla bulut modunu kullan. (Bu durumda ses Groq'a gider ve internet gerekir.)

### Geliştirici kurulumu (kaynaktan)

```bash
powershell -ExecutionPolicy Bypass -File tools/install.ps1
```

### ffmpeg neden gerekli?

Hem yerel hem bulut motoru sesi ffmpeg ile çıkarıp 16 kHz'e çeviriyor — yani ffmpeg her iki durumda da şart. **Panel bunu kendisi halleder:** motoru kurarken ya da ilk altyazıda ffmpeg yoksa indirip kendi klasörüne koyar (`%APPDATA%\Kesit\ffmpeg`, macOS'ta `~/Library/Application Support/Suflo/ffmpeg`). Sistemde zaten ffmpeg varsa ona dokunulmaz.

Paket yöneticisine (winget) bilerek güvenilmiyor: her Windows'ta bulunmuyor, kurumsal makinelerde kapalı olabiliyor ve kurulum başarılı olsa bile PATH'i **çalışan** Premiere sürecine yansıtmıyor. macOS'ta Homebrew varsa önce o denenir.

## Kullanım notları

**Altyazı.** Kapsamı seç (klip / In–Out / sequence), dili seç, "Altyazı oluştur". Liste gelince satırları düzenle, stilini seç, "Sequence'a uygula" — Premiere caption izi oluşturur; olmazsa SRT projeye alınır, timeline'a sürüklersin. "SRT indir" ile dosya olarak da alabilirsin. Yerel motor ses süresinin ~1,5-2 katı sürede çalışır; acelen varsa Groq'a geç.

## Sık sorulanlar

**Gerçekten ücretsiz mi?** Çekirdek: evet, sonsuza dek. Transkripsiyon (99 dil, çevrimdışı), altyazı editörü, düz stiller, SRT/VTT/TXT dışa aktarım ve caption izine uygulama MIT lisanslı ve ücretsiz; yerel motor bilgisayarında çalışır, kimseye ödeme yapmazsın. Animasyonlu altyazı, otomatik kesim ve ritim marker'ları gibi ileri özellikler 2.4.0'dan itibaren [Suflo Pro](https://suflo.app/pro)'da — tek seferlik 749 TL, abonelik yok. Dürüst olalım: 2.3.0'da bunlar da ücretsizdi. Güncellemek zorunda değilsin; eski sürüm çalışmaya devam eder, kod da MIT.

**Verilerim nereye gidiyor?** Yerel motorda **sesin hiçbir yere gitmez** — bilgisayarından çıkmaz. Bulut motorunu seçersen ses yalnızca senin seçtiğin sağlayıcıya (Groq/OpenAI) gider. Tek istisna: **çeviri özelliği** buluttan çalışır, yani onu kullanırsan altyazı **metni** sağlayıcıya gönderilir (ses değil). Çeviri yapmazsan yerel motorda hiçbir şey dışarı çıkmaz.

**Orijinal sequence'ım bozulur mu?** Hayır. Suflo yalnızca yeni bir caption izi ekler; mevcut kliplerine, kesimlerine ve ses katmanlarına dokunmaz.

## Geliştirme

```
css/style.css     tasarım sistemi
js/bridge.js      CEP köprüsü: Node, ffmpeg, indirici (resume+ayna), taslak, günlük
js/engine.js      yerel motor: model kataloğu, GPU tespiti, kurulum, whisper argümanları
js/captions.js    altyazı modülü + editör (bölme, zaman, undo, sözlük)
jsx/host.jsx      Premiere ExtendScript tarafı
tests/            testler (panelin gerçek kaynağını çalıştırır)
tools/            kur/kaldır/paketle/yayınla/dev-server/test
```

Önizleme: `node tools/devserver.js` → http://localhost:5177 (Premiere dışında sahte veriyle açılır).
Paket: `tools/package.ps1` (ZXPSignCmd gerekir) → `dist/Suflo-x.y.z.zxp`.
Yayın paketi doğrulama: `tools/verify-release.ps1` → imza, gerekli dosyalar, ZIP yolları ve ücretli/gizli içerik sızıntısı.
Güvenli yayın: `tools/publish.ps1` → güncel paketleri yeniden üretir, doğrulamayı ve tüm testleri geçirir, canlı Pro API hazırsa commit/push/release yapar.

### Testler

```bash
node tools/test.js            # Windows, macOS, Linux
node tools/test.js --hizli    # ffmpeg gerektirenleri atla
```

Windows'ta `powershell -ExecutionPolicy Bypass -File tools\test.ps1` de aynı işi yapar.
Her push'ta GitHub Actions testleri Windows, macOS ve Linux'ta çalıştırır (`.github/workflows/test.yml`).
Windows'a özgü bölümler (8.3 kısa yol, `tar.exe` ile ZIP) diğer sistemlerde kendini atlar.

Testler `js/*.js` dosyalarını **kaynaktan okuyup** çalıştırır; kopyalanmış mantık üzerinde
çalışmazlar. Bu yüzden bir test kırıldığında gerçekten ürün kırılmış demektir.

| Dosya | Ne ölçer |
|---|---|
| `test-download.js` | Yarım kalan indirmenin devamı, hangi HTTP hatasında dosya korunur/silinir |
| `test-caption-text.js` | Halüsinasyon temizliği, karaoke, satır bölme, Türkçe-duyarlı terim sözlüğü |
| `test-textcut.js` | Konuşmadan kes: dolgu/tekrar algılama, kesim aralıkları, duraksama kısaltma |
| `test-chapters.js` | YouTube bölümleri: öneri, kural denetimi, AI yanıtı ayrıştırma |
| `test-auto-emoji.js` | Otomatik emoji: Türkçe kök eşleşmesi, yoğunluk ve tekrar koruması |
| `test-vurgu.js` | Anahtar kelime vurgusu: 12 stilde vurgu rengi, otomatik seçim, dışa aktarımda işaret temizliği |
| `test-vurgu-entegre.js` | Vurgulu kelimeler Otomatik Zoom ve Akıllı SFX'te: an, kural, sınır önceliği |
| `test-youtube-meta.js` | YouTube metni: başlık/açıklama/etiket/hashtag temizliği ve YouTube sınırları |
| `test-paket.js` | Çok dilli SRT paketi: zamanlama, dile göre büyük harf, ortak çeviri fonksiyonu |
| `test-broll.js` | B-roll önerileri: istem, ayrıştırma, stok arama bağlantıları, host marker etiketi/rengi |
| `test-api-probe.js` | Doctor: Premiere API yoklaması (alt sekans, Auto Reframe, QE, marker, klip kapatma) projeye dokunmadan |
| `test-es3.js` | `jsx/` ExtendScript: ES5+/ES6 kullanımı (forEach, trim, let, =>, JSON, sondaki virgül) yok — yalnız Premiere'de patlayacak hatalar |
| `test-cef.js` | Panel JS Premiere 14.4 (CEF 74 / Node 12.3) uyumu: `?.`, `??`, `replaceAll` vb. yok; `rmrf` eski Node'da çalışır |
| `test-ffmpeg-secim.js` | ffmpeg seçimi: libass'li aday tercih edilir; libass'siz (Homebrew sade) ffmpeg'de anlaşılır uyarı |
| `test-kanca.js` | Kanca başlığı: ASS üretimi, libass render (şeffaflık, vurgu rengi), host `at` yerleşimi |
| `test-kanca-uctan.js` | Kanca başlığı uçtan uca: panelin gerçek ffmpeg komutu → şeffaf qtrle .mov, yerleşim argümanları, temizlik |
| `test-dinle.js` | Dinle önizlemesi: eski isteğin sesi çalmaz, dosya/tutamaç temizliği, uzun klipte ilk 5 dk |
| `test-dikey.js` | 9:16: stil ölçeği, güvenli alan konumu, 12 stilde libass taşma kontrolü |
| `test-ses.js` | Sesi iyileştir: filtre zinciri, ebur128, gecikme ölçümü/telafisi (gerçek ffmpeg), host yerleşimi |
| `test-ses-uctan.js` | Sesi iyileştir uçtan uca: 5.1 kaynak → stereo, senkron < 1 ms, sessiz klipte anlaşılır hata |
| `test-transitions.js` · `test-transition-host.js` | Geçiş planları ve host'un sahte Premiere modelinde gerçek keyframe yazımı |
| `test-highlights.js` · `test-viral-host.js` | Viral anlar: satır sınırı, süre uzatma/kırpma, çakışma; süreli marker ve In/Out |
| `test-viral-skor.js` | Viral Skor 2.0: istem (tür beyaz listesi, adet 3–10, 120 karakter odak), ağırlıklı puan (0–10 ölçeği tek kez, eksik alt puan), cümle sınırına oturtma, ±1 cümle (uzun cümlede cümle ortasına düşmez), adet sınırı, ≥60 filtresi, kopyalanan liste |
| `test-viral-ui.js` | Viral Skor 2.0 panel akışı (sahte DOM): ayar kalıcılığı, puan halkası ve alt puan çubukları, kanca seçimi → Başlık ekle, kenar kayınca yalnız o kart (odak korunur), canlı sekans sorgusuyla In/Out ve Shorts, gizli an kenarı kilitlemez, adet sınırı |
| `test-scenes.js` | Sahne algılama (gerçek ffmpeg) ve seçili klibi bölme |
| `test-model-dogrulama.js` | Whisper modellerinin SHA-256 doğrulaması |
| `test-ceviri-dili.js` | Çeviri sonrası büyük harf kuralının hedef dile uyması |
| `test-varliklar.js` | Panelin başvurduğu yerel görsellerin gerçekten var olması |
| `test-utf8.js` | Parça parça gelen HTTP yanıtlarında Türkçe harflerin bozulmaması |
| `test-parse.js` | SRT/VTT ayrıştırma, etiket ve HTML varlık temizliği, BOM/CRLF |
| `test-export.js` | SRT/VTT/ASS/TXT çıktıları (ffmpeg ile gerçekten ayrıştırılarak) |
| `test-burn.js` | ASS'in libass ile videoya gerçekten çizildiği (kare farkı) |
| `test-hata.js` | Hata rehberi: doğru tavsiye veriyor mu, masum hataya yanlış tavsiye veriyor mu |
| `test-mac.js` | macOS yolları: Homebrew, Metal, model klasörü, Windows'a özgü kodun çalışmaması |
| `test-pro-license.js` | Store/product sahipliği, yanlış aktivasyonu geri bırakma, private kimlik sızıntısı; deneme hakları: kurmadan kapı kapalı, harcama imzalı yazılır, kurcalanmış/bozuk depo 0 hak verir, ayna silinen dosyayı geri doldurmaz, "Ücretsiz dene" düğmesi kurar ve eylemi yeniden çalıştırır, Pro'da deneme dosyası yazılmaz |
| `test-deneme.js` | Pro'yu dene durum mantığı: 9 araç 3'er hak, kütüphaneler 0, harca alttan sınırlı ve girdiyi değiştirmez, birleştirmede büyük kazanır, lisans biçimli nesne reddedilir, deneme çıktısı kaydı (en çok 10, font adı yol içeremez) |
| `test-filigran.js` | Deneme filigranı: tek stil + tek olay, idempotent, ilk stilin fontu, `\an9` ve `&H66&`, dikeyde daha aşağıda, son olayı kapsar, özgün satırlar bayt bayt aynı; libass'le gerçek render'da yalnız filigranlıda sağ üst dolu |
| `test-overlay-render.js` | Ortak şeffaf katman render'ı (gerçek ffmpeg: qtrle, alfa, çift boyut) ve temiz yeniden oluşturma: sekans eşleşmezse dokunmaz, önce yerleştirir, yalnız başarıda `{path}` ile kaldırır (nodeId asla), render sırasında sekans değişirse yerleştirmez |
| `test-deneme-baglanti.js` | Deneme bağlantıları: 9 araç deneme kapısında, hak yalnız başarı dalında düşer, kütüphane/MOGRT/toplu/ASS kapıları denemesiz, zoom kaldırma kapısız, ücretsizde MOGRT stili reddedilir, filigran yalnız stilli katman ve kanca başlığında, betik sırası, Ayarlar kartları ve Pro tablosu; gecisler.js'te hata/başarı davranışı |
| `test-pro-sync.js` | Delta indirme, kaldığı yerden devam, atomik sürüm geçişi, offline geri dönüş |
| `test-pro-cdn.js` | Private Hostinger ağacı, manifest hash'leri ve yayın öncesi API güvenlik kapısı |
| `test-v175.js` | Sürüm regresyonları |
| `seo-kontrol.js` | `docs/` site çıktısı: meta etiketler, JSON-LD, sitemap |
| `cakisma.js` | CSS sınıf adı çakışmaları (aynı ada iki tanım) |

`test-export.js` ve `test-burn.js` `ffmpeg` ister; yoksa atlanır.

## Yol haritası

Suflo'nun odağı konuşmayı izlenebilir kurguya çevirmek. Altyazı, sessizlik kesme, ritim,
MOGRT/SFX/Emoji Assets kütüphanesi ve Akıllı SFX aynı iş akışında buluşur. Sıradakiler:

- Konuşmacı ayrımı (podcast ve röportaj kurgusu için)
- SFX dalga formu ve ses seviyesi eşitleme
- Yeni yazı animasyonu ve SFX koleksiyonları (Pro İçerik Bulutu üzerinden)
- Azerice arayüz çevirisi

Kelime kelime vurgulu altyazıyı timeline'a koyma listeden çıktı — 2.4.0 ile geldi, Pro katmanında.

## Lisans

MIT — [LICENSE](LICENSE). Dilediğin gibi kullan, değiştir, dağıt.
