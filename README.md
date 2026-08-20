# Suflo

**Premiere için ücretsiz, açık kaynak altyazı paneli.**
⭐ Çekirdek sonsuza dek ücretsiz ve MIT. Animasyonlu altyazı, otomatik kesim ve MOGRT/SFX kütüphaneleri için **[Suflo Pro →](https://suflo.app/pro)**
Türkçe ve Azerice dahil 99 dil — abonelik yok, kredi yok, hesap yok.

> Premiere'in yerleşik altyazısı Türkçe konuşmayı yazıya dökemiyor. Suflo döküyor, üstelik bilgisayarında çalışan yapay zekâyla.

## Özellikler

Suflo konuşmayı izlenebilir kurguya çevirir. Seçili klipten, In–Out aralığından ya da tüm sequence'tan
transkript çıkarır; panelin içinde düzenlersin; caption izi olarak uygular ya da SRT/VTT/ASS/TXT
olarak dışa aktarırsın. Emoji Assets (yerel klasörün veya bağlı Suflo Cloud kataloğu) ücretsizdir.
Pro katmanında sessizlik kesme, ritim marker'ları,
yerel MOGRT/SFX kütüphaneleri
ve altyazıdan Akıllı SFX önerileri bulunur.

| Ne | Nasıl |
|---|---|
| **Transkripsiyon** | Yerel motorla (whisper.cpp) çevrimdışı, ya da ücretsiz Groq anahtarıyla bulutta |
| **Düzenleme** | Satır bölme, birleştirme, zaman düzeltme, toplu kaydırma, geri al/yinele (Ctrl+Z/Y) |
| **Karaoke** | Kelime kelime ve birikimli mod; kelime zamanlarıyla |
| **Çeviri** | TR · AZ · EN · RU arası, satır satır |
| **Terim sözlüğü** | Marka ve özel isimlerin doğru yazımını her transkriptte uygular |
| **Dışa aktarma** | SRT · WebVTT · ASS (stilli, karaoke etiketli) · TXT |

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

| Ücretsiz (MIT, sonsuza dek) | Pro (bir kez 749 TL) |
|---|---|
| Yerel/bulut transkripsiyon (99 dil, çevrimdışı) | Bağımsız Stil Motoru ve şeffaf video katmanı |
| Altyazı editörü (bölme, birleştirme, zaman, geri al, taslak kurtarma) | Viral Vurgu · Pop · Belgesel · Premium stil aileleri |
| Düz stiller | Otomatik kesim (sessizlik temizleme) |
| SRT · WebVTT · TXT dışa aktarım | Ritim/beat marker'ları |
| SRT/VTT içe aktarım | Toplu çoklu klip transkripsiyonu |
| Premiere caption izine uygulama | TR · AZ · EN · RU çeviri |
| GPU hızlandırma | Stilli ASS dışa aktarım |
| Emoji seçici | Terim sözlüğü |
| Emoji Assets (yerel arşiv veya Suflo Cloud, favori/son, timeline'a ekleme) | MOGRT ve SFX kütüphaneleri (text ve diğer animasyonlar otomatik ayrılır) |
| — | Altyazıdan Akıllı SFX önerileri |
| — | Kütüphane sağlık kontrolü ve destek raporu |

Kıyas için: AutoCut yılda ~179 $, Submagic yılda ~228–468 $, Kaps ve Subs aylık dolar aboneliği + dakika kotası. Suflo Pro'da sayaç yok — bir kez öde, bitti.

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
3. Premiere'i kapat, tekrar aç → `Window > Extensions > Suflo`.
4. Panelde **"Yerel motoru indir & kur"** düğmesine bas. Gerisini panel yapar.

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
6. Premiere'i kapat, tekrar aç → `Window > Extensions > Suflo`.
7. Panelde **"Yerel motoru kur (Homebrew)"** düğmesine bas.

**Neden Homebrew?** whisper.cpp macOS için hazır ikili yayınlamıyor (resmi sürüm dosyaları yalnız Windows ve Ubuntu); Mac'te bu araçları kurmanın standart yolu Homebrew. Panel `brew install whisper-cpp` çalıştırır, modelleri kendisi indirir.

**Apple Silicon'da (M1 ve sonrası) GPU hızlandırma (Metal) kendiliğinden açıktır** — ayrı bir sürüm indirmek gerekmez.

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

### Testler

```powershell
powershell -ExecutionPolicy Bypass -File tools\test.ps1
```

Testler `js/*.js` dosyalarını **kaynaktan okuyup** çalıştırır; kopyalanmış mantık üzerinde
çalışmazlar. Bu yüzden bir test kırıldığında gerçekten ürün kırılmış demektir.

| Dosya | Ne ölçer |
|---|---|
| `test-download.js` | Yarım kalan indirmenin devamı, hangi HTTP hatasında dosya korunur/silinir |
| `test-parse.js` | SRT/VTT ayrıştırma, etiket ve HTML varlık temizliği, BOM/CRLF |
| `test-export.js` | SRT/VTT/ASS/TXT çıktıları (ffmpeg ile gerçekten ayrıştırılarak) |
| `test-burn.js` | ASS'in libass ile videoya gerçekten çizildiği (kare farkı) |
| `test-hata.js` | Hata rehberi: doğru tavsiye veriyor mu, masum hataya yanlış tavsiye veriyor mu |
| `test-mac.js` | macOS yolları: Homebrew, Metal, model klasörü, Windows'a özgü kodun çalışmaması |
| `test-v175.js` | Sürüm regresyonları |
| `seo-kontrol.js` | `docs/` site çıktısı: meta etiketler, JSON-LD, sitemap |
| `cakisma.js` | CSS sınıf adı çakışmaları (aynı ada iki tanım) |

`test-export.js` ve `test-burn.js` `ffmpeg` ister; yoksa atlanır.

## Yol haritası

Suflo'nun odağı konuşmayı izlenebilir kurguya çevirmek. Altyazı, sessizlik kesme, ritim,
MOGRT/SFX/Emoji Assets kütüphanesi ve Akıllı SFX aynı iş akışında buluşur. Sıradakiler:

- Konuşmacı ayrımı (podcast ve röportaj kurgusu için)
- SFX dalga formu ve ses seviyesi eşitleme
- Suflo içerik paketleri (özgün üretim tamamlandığında)
- Azerice arayüz çevirisi

Kelime kelime vurgulu altyazıyı timeline'a koyma listeden çıktı — 2.4.0 ile geldi, Pro katmanında.

## Lisans

MIT — [LICENSE](LICENSE). Dilediğin gibi kullan, değiştir, dağıt.
