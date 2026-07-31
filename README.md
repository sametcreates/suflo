# Suflo

**Premiere için ücretsiz, açık kaynak kurgu paneli.**
SFX kütüphanesi · yapay zekâ altyazı · otomatik ilk kesim · keyframe easing — abonelik yok, kredi yok, hesap yok.

> Kredi ve abonelik satan altyazı panellerine ücretsiz, bakımlı, açık kaynak bir alternatif.

## Özellikler

| Modül | Ne yapar | Maliyet |
|---|---|---|
| **SFX** | Kendi ses klasörlerini bağla; ara, dinle (↓↑ + Enter), favorile, playhead'e bırak | Ücretsiz, sınırsız |
| **Altyazı** | Seçili klip, In–Out aralığı ya da tüm sequence'tan transkript; düzenle, stille, caption izi olarak uygula. TR · AZ · EN · RU · oto | Yerel motorla ücretsiz, sınırsız |
| **Kesim** | Duraksamaları bulur, kesimleri görsel barda gösterir, kopya sekansta güvenle uygular | Ücretsiz, sınırsız |
| **Motion** | Sürüklenebilir bezier eğrisiyle keyframe easing; her keyframe aralığına uygular | Ücretsiz, sınırsız |

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

**Kesim.** Eşik (dB) sesin ne kadar altını "sessizlik" saydığını belirler; gürültülü çekimde -30, temiz kayıtta -45 dene. Tampon, kesimin konuşmanın nefesini yemesini engeller. Varsayılan uygulama hedefi **kopya sekans**tır: orijinal sequence'a hiç dokunulmaz.

**Motion.** Effect Controls'ta bir özelliğe en az iki keyframe koy. Panel özellikleri kendisi listeler; eğriyi preset'ten seç ya da tutamaçları sürükleyerek çiz.

**SFX.** Arama kutusundan çıkmadan ↓↑ ile gez (otomatik önizler), Enter ile ekle. ★ ile favorile.

## Sık sorulanlar

**Gerçekten ücretsiz mi?** Evet. Panel MIT lisanslı açık kaynak; yerel altyazı motoru bilgisayarında çalışır, kimseye ödeme yapmazsın. Groq'u seçersen kendi ücretsiz anahtarını kullanırsın — kart bilgisi istemez.

**Verilerim nereye gidiyor?** Yerel motorda **sesin hiçbir yere gitmez** — bilgisayarından çıkmaz. Bulut motorunu seçersen ses yalnızca senin seçtiğin sağlayıcıya (Groq/OpenAI) gider. Tek istisna: **çeviri özelliği** buluttan çalışır, yani onu kullanırsan altyazı **metni** sağlayıcıya gönderilir (ses değil). Çeviri yapmazsan yerel motorda hiçbir şey dışarı çıkmaz.

**Orijinal sequence'ım bozulur mu?** Kesim varsayılan olarak kopya sekansta çalışır; Altyazı yalnızca caption izi ekler; Magic benzeri hiçbir işlem kaynağı silmez.

## Geliştirme

```
css/style.css     tasarım sistemi
js/bridge.js      CEP köprüsü: Node, ffmpeg, indirici (resume+ayna), taslak, günlük
js/engine.js      yerel motor: model kataloğu, GPU tespiti, kurulum, whisper argümanları
js/captions.js    altyazı modülü + editör (bölme, zaman, undo, sözlük)
js/magiccut.js    kesim modülü
js/motion.js      easing modülü
js/sfx.js         ses kütüphanesi
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

- Kelime kelime (karaoke) altyazı stilleri
- macOS desteği
- Azerice arayüz çevirisi
- Sequence tabanlı kesim (klip bağımsız)

## Lisans

MIT — [LICENSE](LICENSE). Dilediğin gibi kullan, değiştir, dağıt.
