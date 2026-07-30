# Kurulum videosu — çekim planı

**Hedef:** Instagram'dan gelen, Premiere kullanan, altyazıya ihtiyacı olan biri. Teknik bilgisi olmayabilir.
**Süre hedefi:** 2,5 dakika. Kurulum videosu uzarsa kimse bitirmez.
**Tek video, bölümlü (YouTube chapters).** Mac kullanıcısı Windows kısmını atlayabilsin; tek link tek izlenme.

---

## Yapı

### 0:00 — Ödül önce (12 sn)

Konuşma yok, sadece ekran + müzik. Timeline'da bir klip seçili, panelde **Altyazı oluştur**'a basılıyor, birkaç saniye sonra altyazı satırları listeye düşüyor, **Sekansa uygula** → program monitöründe altyazı görünüyor.

> Üstte yazı: **"3 dakika sonra bu sende de olacak."**

Neden önce bu: insanlar kurulum adımlarını değil, sonucu görmek için kalıyor.

### 0:12 — Ne kuracağız (10 sn)

> "İki şey kuracağız: Premiere'e eklentiyi, bir de altyazıyı yazan motoru. İkisi de ücretsiz, bir kere kuruluyor. Abonelik yok, kredi yok."

Ekranda üç kutu: **Eklenti → Motor → Bitti**

### 0:22 — Windows (40 sn)

| Ekranda | Söylenen |
|---|---|
| aescripts.com/zxp-installer, indir + kur | "Önce şu ücretsiz yükleyiciyi kuruyoruz. Adobe eklentileri bununla kuruluyor." |
| suflo.app → Ücretsiz indir → .zxp dosyası | "Sonra Suflo'yu indiriyoruz." |
| .zxp'ye çift tık, yükleyici "Success" diyor | "Çift tıklıyorsun, o kadar." |
| Premiere kapanıyor, açılıyor, Window → Extensions → Suflo | "Premiere'i kapat aç. Window, Extensions, Suflo." |
| Panelde "Yerel motoru indir & kur", ilerleme çubuğu (hızlandırılmış) | "Bu düğmeye bas, gerisini panel yapıyor. Yaklaşık 600 megabayt, bir kere iniyor." |

> Üstte yazı: **"NVIDIA ekran kartın varsa otomatik hızlanır."**

### 1:02 — Mac (65 sn) ← en kritik bölüm

Burada yavaş git. Mac'te en çok takılan yer bu.

| Ekranda | Söylenen |
|---|---|
| `⌘ + boşluk` → "Terminal" → Enter | "Mac'te bir hazırlık var. Terminal'i açıyoruz — komut boşluk, Terminal yaz, Enter." |
| suflo.app/#kurulum, Homebrew komutu kopyalanıyor | "Siteden şu satırı kopyala." |
| Terminal'e yapıştırılıyor, Enter | "Yapıştır, Enter." |
| **Şifre satırı ekranda — yazarken hiçbir şey görünmüyor** | **"Şifreni isteyecek. Yazarken ekranda hiçbir şey görünmez — bozuk değil, Mac böyle. Yaz ve Enter'a bas."** |
| Kurulum akıyor (hızlandır), sonunda "Installation successful!" | "Biraz sürüyor. Sonunda 'Installation successful' yazacak." |
| Terminal'in önerdiği `eval "$(/opt/homebrew/bin/brew shellenv)"` satırları | **"Sana böyle iki satır daha kopyalamanı söylerse, onları da yapıştır. Atlarsan sonraki adım çalışmaz."** |
| `brew install ffmpeg` | "Son komut: brew install ffmpeg." |
| ZXP yükleyici + .zxp çift tık + Premiere yeniden başlat | "Buradan sonrası Windows'la aynı." |
| Panelde **"Yerel motoru kur (Homebrew)"** | "Bu düğmeye bas, panel motoru kuruyor." |

> Üstte yazı: **"M1 / M2 / M3 / M4 Mac'lerde Apple GPU otomatik kullanılır."**

Bu üç uyarıyı mutlaka söyle — Mac'te insanlar tam buralarda vazgeçiyor:
1. Şifre yazarken ekranda görünmez.
2. Terminal ek satır isterse onları da yapıştır.
3. Homebrew kurulumu uzun sürebilir, donmuş değil.

### 2:07 — İlk altyazı (20 sn)

Klip seç → dil Türkçe → "Altyazı oluştur" → liste geliyor → bir satırda yazım hatasını **düzelt** → "Sekansa uygula".

> "Ve önemli kısım: uygulamadan önce düzeltebiliyorsun. Yanlış yazdığı ismi burada düzeltip timeline'a öyle gönderiyorsun."

Bu bizim rakiplerden ayrıldığımız yer — atlamayalım.

### 2:27 — Kapanış (8 sn)

> "Ücretsiz, açık kaynak, sınırsız. Link açıklamada."

Ekranda: **suflo.app** + logo.

---

## Çekim notları

- **En az 1080p, tercihen 1440p.** İnsanlar telefondan izleyecek: Terminal ve panel yazıları küçük kalır, **komut yazarken ekranı yakınlaştır (zoom in)**.
- **Komutları elle yazma, kopyala-yapıştır göster.** Yazarken hata yapma riski + izleyici yanlış yazar.
- Homebrew ve model indirmelerini **hızlandır (4x-8x)**, ama süreyi ekranda yaz ("~5 dakika") — insan beklediğini bilsin.
- **Sessiz kısımlarda müzik, komut anlatırken müziği kıs.**

## Güvenlik — kayıttan önce kontrol et

Ekran kaydında sızabilecek şeyler:
- **Groq API anahtarın** — Ayarlar sekmesini gösterirsen anahtar alanı görünür. Kayıttan önce temizle ya da o kısmı gösterme.
- **Kişisel klasör yolları** (kullanıcı adın, proje isimleri, müşteri isimleri) — Terminal ve proje panelinde görünür.
- Masaüstü bildirimleri (WhatsApp, mail) — kayıt öncesi **Odaklanma / Do Not Disturb** aç.

## Video yayına girince

Bana linki at, şunları yapayım:
- suflo.app'in Kurulum bölümüne videoyu gömerim (Mac kartının başına).
- README'ye "▶ Kurulum videosu" linki eklerim.
- Release notlarına eklerim.

YouTube başlığı için öneri: **"Premiere'e ÜCRETSİZ AI altyazı — Suflo kurulumu (Windows + Mac)"**
Açıklamanın ilk satırı: suflo.app linki. Bölüm zaman kodlarını da açıklamaya koy, YouTube chapter'a çevirir.
