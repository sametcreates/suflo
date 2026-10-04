# Kurucunun yapacakları (v3.1 / v4 yol haritası)

Kodla çözülemeyen, gerçek dünya girdisi isteyen işler. Kod, o girdi yokken de çalışır
(rehber "kendi klibinle" moduna düşer, satış ekranları eski yola düşer vb.). Bu dosya, her
özelliğin tam haliyle açılması için **senin** yapman gerekenleri sırasıyla listeler.
Her özellik kendi bölümünü ekler.

---

## 1. İlk altyazın 2 dakikada (ilk açılış rehberi, örnek klip, AI anahtar sihirbazı)

**Şu an durum:** Rehber, anahtar sihirbazı, AI düğmelerindeki "anahtar gerekli · 1 dk"
çipleri, motor kilidi ve "panel görünmüyor" rehberi hazır. Eksik olan tek şey **örnek
klip**: `assets/onboarding/ornek.json` olmadığı için 2. adım "Örnekte dene" yerine
"Timeline'da bir klip seç ve Altyazı oluştur'a bas" diyor ve ilk başarılı altyazıda
tamamlanıyor. Klibi ekleyince, kodda hiçbir değişiklik olmadan "Örnekte dene" açılır.

### 1.1 Örnek klibi kaydet (yaklaşık 30 dk)

Kendi yüzün ve sesin, **haklarının tamamı sende** (müzik yok, başka kişi yok, marka
logosu yok). Klip MIT lisanslı depoyla birlikte dağıtılacak.

- Süre: **15 saniye**, Türkçe, net konuşma, sessiz oda.
- Görüntü: dikey 9:16 (Reels/Shorts kullanıcısının sekansı da dikey olur), ışık önden.
- Önerilen metin (bir sayı ve bir özel ad, vurgu ve sözlük özelliklerini de gösterir):

  > Merhaba, ben Samet. Bu klip Suflo'nun örnek videosu. Premiere'in Türkçe
  > altyazısı yok; Suflo bunu bilgisayarında, iki dakikada, ücretsiz yapıyor.

### 1.2 Dört dosyayı üret (ffmpeg ile, yaklaşık 10 dk)

Kayıt `kayit.mov` olsun. Komutları depo kökünde çalıştır:

```bash
mkdir -p assets/onboarding

# 1) Video: 720x1280, 30 fps, H.264 + mono AAC. Hedef ≤ 1,5 MB (test 2 MB üstünü reddeder).
ffmpeg -y -i kayit.mov -t 15 \
  -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30" \
  -c:v libx264 -preset slow -crf 28 -profile:v high -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 96k -ac 1 assets/onboarding/ornek-tr.mp4
#    1,5 MB'ı geçerse -crf 30 ya da 32 ile tekrar dene.

# 2) Yerel motor için WAV: 16 kHz mono 16-bit PCM (whisper ffmpeg'siz okur; ~480 KB)
ffmpeg -y -i assets/onboarding/ornek-tr.mp4 -vn -ac 1 -ar 16000 -c:a pcm_s16le assets/onboarding/ornek-tr.wav

# 3) Groq bulut rotası için MP3 (~120 KB)
ffmpeg -y -i assets/onboarding/ornek-tr.mp4 -vn -ac 1 -ar 16000 -b:a 64k assets/onboarding/ornek-tr.mp3
```

### 1.3 Hazır transkripti üret ve ELLE kontrol et (yaklaşık 15 dk)

Motoru ya da anahtarı henüz olmayan kullanıcı bu transkripti görür; hatasız olmalı.
Turbo modeli Suflo'nun kendi klasöründe zaten var
(Windows: `%APPDATA%\Kesit\whisper\models`, Mac: `~/Library/Application Support/Suflo/whisper/models`).

```bash
# kelime zamanları (kelime kelime / birikimli modlar için)
whisper-cli -m <models>/ggml-large-v3-turbo-q5_0.bin -f assets/onboarding/ornek-tr.wav -l tr -oj -ml 1 -sow -of kelimeler
# satırlar (satır modları için)
whisper-cli -m <models>/ggml-large-v3-turbo-q5_0.bin -f assets/onboarding/ornek-tr.wav -l tr -oj -of satirlar
# panelin okuduğu biçime çevir
node tools/ornek-transkript.js --kelime kelimeler.json --satir satirlar.json > assets/onboarding/ornek-tr.words.json
```

Sonra `assets/onboarding/ornek-tr.words.json` dosyasını aç ve **yalnız metinleri** düzelt
(yazım, büyük harf, "Suflo" gibi özel adlar, noktalama). `start`/`end` değerlerine dokunma.
`kelimeler.json` ve `satirlar.json` geçici dosyalar, depoya ekleme.

### 1.4 Manifesti yaz

`assets/onboarding/ornek.json`:

```json
{
  "surum": 1,
  "lang": "tr",
  "video": "ornek-tr.mp4",
  "wav": "ornek-tr.wav",
  "mp3": "ornek-tr.mp3",
  "words": "ornek-tr.words.json",
  "sure": 15,
  "sekans": "Suflo Deneme"
}
```

### 1.5 Doğrula ve gönder

```bash
node tools/test.js
```

`test-varliklar.js` şunları denetler: manifest geçerli, listelenen dosyalar var, her biri
2 MB'tan küçük, WAV 16 kHz mono 16-bit PCM, transkriptte en az 8 kelime var, klasörde
manifestte olmayan medya yok. Yayın denetimi (`tools/verify-release.ps1`) ve yayın betiği
(`tools/publish.ps1`, aynı desenle) bu klasördeki mp4/wav/mp3'e izin verir; başka yerdeki
ses dosyaları yine yasak. Yayın denetimi paket içinde `ornek.json` arar
(`tests/test-panel-rehberi.js` iki betiğin desenini birlikte denetler).

Dosyaları ekle: `git add assets/onboarding/ornek.json assets/onboarding/ornek-tr.*`
(`tools/publish.ps1` zaten `git add -A` ile yeni dosyaları da commit'ler; elle eklemek
yalnız yayından önce ayrı bir commit istiyorsan gerekir.)
README'nin lisans bölümüne bir satır ekle: "assets/onboarding içindeki örnek klip
Samet'e aittir; Suflo ile birlikte dağıtılır."

### 1.6 Premiere'de elle deneme (yayından önce, yaklaşık 20 dk)

Taze kurulumu taklit etmek için Premiere kapalıyken ayar dosyasını **yedekle** ve sil
(anahtarın ve tercihlerin de içinde; denemeden sonra yedeği geri koy):
Windows'ta `%APPDATA%\Kesit\settings.json`, Mac'te `~/Library/Application Support/Kesit/settings.json`.
Yalnız rehberi yeniden görmek istersen Ayarlar > Destek > "Kurulum rehberini aç" yeter;
taze kurulum davranışını (yenilikler penceresinin çıkmaması dahil) görmek için dosya silinmeli.

1. Premiere 25.6+ / 2026'da paneli `Window > Extensions (Legacy) > Suflo` ile aç.
   "Suflo 3.0'da yeni" penceresi **çıkmamalı**, Altyazı sekmesinin üstünde
   "İlk altyazın 2 dakikada" kartı ve şeridin altında "Kurulum 0/4" çipi görünmeli.
2. Panel açılırken Premiere donmamalı; kartta hiçbir şeye basmadan proje açıp kapat.
3. **Motor:** "Yerel motoru indir & kur" → Small (190 MB) iner. Örnek klip varken ffmpeg
   arkada iner (Ayarlar > ffmpeg satırında ilerlemesi görünür; hemen "Altyazı oluştur"a
   basarsan durum satırında da yüzde akmalı). Örnek klip yoksa ffmpeg kurulum düğmesinde
   ilerlemesiyle önce iner. NVIDIA'lı makinede cuBLAS **inmemeli**; daha önce cuBLAS motoru
   kurulmuşsa (Ayarlar > motor satırı "GPU") rehberden kurulum onu CPU'ya **düşürmemeli**.
   1. adımda "Atla"ya bas: kurulum kartı ("Yerel motoru indir & kur") rehberin altında,
   sekmenin üstünde görünür kalmalı; 2. adım "Önce motoru kur" demeli ve düğmesi "Motoru kur"
   olmalı, basınca 1. adım açılıp kurulum kartı içine gelmeli. Paneli kapatıp açınca da öyle.
4. **Örnek:** "Örnekte dene" → Proje panelinde "Suflo Ornek" kutusu, "Suflo Deneme" sekansı
   açılmalı, klip seçili olmalı; altyazı satırları gelmeli; "Normal altyazı izi ekle"
   yanıp sönmeli. İkinci kez basınca yeni kutu/sekans **oluşmamalı**.
   Eski Premiere'de (createNewSequenceFromClips yoksa) "Klibi Yeni Öğe simgesine sürükle" demeli
   ve "Normal altyazı izi ekle" **yanıp sönmemeli**. Örnek altyazı yüklüyken kendi sekansını
   açıp "Normal altyazı izi ekle"ye basarsan "Bu örnek altyazı Suflo Deneme sekansı için"
   uyarısı çıkmalı, kendi sekansına iz **eklenmemeli**.
   Proje açık değilken (Premiere Ana ekranı) "Örnekte dene" düzgün Türkçe "Açık proje yok…" demeli.
   Kurtarılmamış taslak varken ("Kurtar: N satır" düğmesi görünür) "Örnekte dene"ye bas:
   "Kurtar" düğmesi kaybolmamalı ve basınca eski iş gelmeli.
5. Motor kurmadan (yeni ayar dosyasıyla) "Örnekte dene" → "örnek transkript" etiketli satırlar.
6. **Stil:** "Stilleri gör" → Creator Punch kendi satırlarınla oynamalı (ffmpeg yoksa sessizce
   DOM önizlemesi). "Tamam" deyince önceki stil (ücretsiz kullanıcıda "Özel") geri gelmeli.
   Önizlemeden sonra yazı boyutunu/rengini değiştirip ya da başka bir karta dokunup "Tamam"
   dersen **senin** seçimin kalmalı; arada altyazı dilini değiştirdiysen dil de kalmalı.
   "Stilleri gör"e basıp Premiere'i kapat, yeniden aç: önceki stil geri gelmiş olmalı.
   "Timeline'a koy" ücretsizde Pro penceresini açmalı; Pro'da önizlemeden sonra Karaoke
   kartına dokunup basınca Karaoke konmalı (Creator Punch değil).
7. **AI:** "Anahtarı bağla" → "Ücretsiz anahtar al" tarayıcıda console.groq.com/keys açmalı.
   Anahtarı kopyala → "Panodan al" doldurmalı → "Doğrula ve kaydet". Ayarlar > Bulut yedeği'nde
   anahtar görünmeli; "Yedeği kaydet"e basınca silinmemeli. İnterneti kesip dene: "kaydedildi
   ama doğrulanamadı" demeli, "geçersiz" dememeli. Yanlış anahtarda "kabul etmedi" demeli.
   Yerel motor kurulu değilken sihirbaz (hangi düğmeden açılırsa açılsın) "sesin Groq'a gider"
   satırını göstermeli; yerel motor kuruluyken göstermemeli.
8. AI düğmeleri anahtar yokken: ücretsiz kullanıcıda yalnız AI metin kontrolü, Bölümler AI,
   Paylaşım metni ve Kanca AI yanında "anahtar gerekli · 1 dk" çipi olmalı; Viral anlar,
   Çevir ve B-roll yanında çip **olmamalı** (Pro penceresini açarlar). Pro kullanıcıda yedisinde
   de çip olmalı. 4. adımın metni ücretsizde çeviri/viral/B-roll'un Pro'da olduğunu söylemeli.
   Klavyeyle: Tab ile adım başlıklarına gel, Enter/Boşluk adımı açıp kapatmalı.
9. Kartı ✕ ile kapat → Ayarlar > Destek > "Kurulum rehberini aç" geri getirmeli.
10. Ayarlar > Suflo Doctor: "Klipten sekans" satırı (eski Premiere'de sarı) ve
    "Panel menüde görünmüyor mu? →" bağlantısı site sayfasını açmalı.
11. Mac'te Homebrew olmayan makinede 1. adım "Ücretsiz anahtarla başla" önermeli ve
    sihirbazda "sesin Groq'a gider" uyarısı görünmeli.

### 1.7 Site ve reklam

- `docs/blog/premiere-suflo-paneli-gorunmuyor.html` main'e birleşince suflo.app'te yayına girer;
  destek DM'lerinde bu bağlantıyı kullan.
- Yol haritasındaki büyüme maddesi: "2 dakikada ilk Türkçe altyazı" ekran kaydını (30-60 sn)
  bu rehberle çek; sitenin üst bölümüne ve reklamlara koy. Pazarlamada **"2 dakikada"** de,
  "60 saniye" deme (Windows'ta indirmeler yüzünden doğru değil).

---

## 2. SEO ve yardım sayfaları (docs/blog)

Yeni sayfalar:

- `docs/blog/premiere-suflo-paneli-gorunmuyor.html`: panel görünmüyor / boş / açılmıyor sorun giderme rehberi
- `docs/blog/premiere-turkce-altyazi-otomatik.html`: Premiere'de otomatik Türkçe altyazı, adım adım
- `docs/blog/autocut-firecut-alternatifi.html`: AutoCut ve FireCut ile dürüst karşılaştırma
- `docs/blog/opusclip-alternatifi-premiere.html`: uzun videodan Shorts, OpusClip ile karşılaştırma

Hepsi `docs/sitemap.xml` ve `docs/blog/index.html` içinde. `tests/test-blog.js` yapısal veriyi, canonical'ı, site haritasını ve sorun giderme rehberinin kurucularla tutarlılığını denetler.

**Neden senin işin:** Rakip fiyatları yol haritası araştırmasından (`marketing/v4-yol-haritasi.json` → `plan.competitor_table`) alındı. O oturumda üreticilerin sitelerine doğrudan erişilemedi; rakamlar arama sonucu özetlerinden ve üçüncü taraf incelemelerden derlendi. Ayrıca Premiere 25.6 ve sonrasındaki menü adı (`Window > Extensions (Legacy)`) gerçek bir Premiere'de denenmedi. Sayfalar bu yüzden "Ekim 2026 itibarıyla" diye tarihli ve kaynaklı.

### 2.1 Rakip fiyatlarını doğrula (tanıtmadan önce, sonra her 3 ayda bir)

1. Şu sayfaları aç ve rakamları sayfalardaki tablolarla karşılaştır:
   - FireCut: https://firecut.ai/pricing/all/ → Starter / Pro / Max aylık ve yıllık fiyat, deneme süresi (7 gün), aylık planlarda iade süresi (3 gün).
   - AutoCut: https://www.autocut.com/en/ (fiyat bölümü) → Basic / AI aylık ve yıllık fiyat, deneme süresi (14 gün), DaVinci Resolve desteği.
   - OpusClip: https://www.opus.pro/pricing → Free (60 kredi/ay, filigran), Starter, Pro aylık ve yıllık; kredilerin süresi (60 gün); Premiere XML dışa aktarmanın hangi planda olduğu.
2. Fark varsa ilgili HTML dosyasında üç yeri birlikte güncelle: "Kısa karşılaştırma" tablosu, "Bir yılda ne ödersin?" tablosu (çarpımları yeniden hesapla) ve fiyattan söz eden SSS cevapları. SSS metni sayfada iki kez geçer: görünen `<details>` ve `<script type="application/ld+json">` içindeki FAQPage. İkisi birebir aynı olmalı (`tests/test-blog.js` denetler).
3. Tarihleri güncelle: "Ekim 2026 itibarıyla" ve "Fiyatlar: Ekim 2026" ifadelerini yeni aya çevir, `Güncel:` satırını, JSON-LD'deki `dateModified` değerini ve `docs/sitemap.xml` içindeki `<lastmod>` değerini değiştir.
4. `node tools/test.js` çalıştır, commit'le.

### 2.2 Premiere 2026'daki menü adını doğrula

1. Windows'ta ve Mac'te Premiere 26.x'i aç, Suflo'yu menüde bul.
2. Panel `Window > Extensions (Legacy) > Suflo` altında değilse `docs/blog/premiere-suflo-paneli-gorunmuyor.html` (hızlı kontrol, 1. bölüm, temiz kurulum adımları, HowTo ve SSS) ile `docs/blog/premiere-turkce-altyazi-otomatik.html` (1. adım) içindeki menü yolunu düzelt.
3. Aynı yol kurucuların bitiş metinlerinde, README'de ve Suflo Doctor'da da geçer: `tools/install.ps1`, `tools/install.sh`,
   `tools/kurucu-yap.ps1`, `tools/kurucu/Suflo-Kur.bat`, `tools/kurucu/Suflo-Kur.command`, `README.md`. Hepsini birlikte düzelt.
4. `tests/test-blog.js` içindeki "rehber yeni ve eski menu yolunu veriyor" ve `tests/test-panel-rehberi.js` içindeki
   "Extensions (Legacy) yolu" denetimlerini aynı yola çevir.

### 2.3 Google'a haber ver

1. Google Search Console → Site haritaları → `https://suflo.app/sitemap.xml` adresini yeniden gönder.
2. URL denetimi → dört yeni adres için tek tek "Dizine eklenmesini iste":
   - https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor
   - https://suflo.app/blog/premiere-turkce-altyazi-otomatik
   - https://suflo.app/blog/autocut-firecut-alternatifi
   - https://suflo.app/blog/opusclip-alternatifi-premiere

### 2.4 Suflo değiştikçe sayfaları güncel tut

- Suflo Pro fiyatı değişirse karşılaştırma sayfalarındaki tutarları ve SSS'leri güncelle: `grep -n "749" docs/blog/*.html`.
- Yeni özellik yayına girince (ör. podcast kamera geçişi, senaryoya göre tekrar temizliği, marka kiti, tek tıkla ilk taslak) "Suflo'da (henüz) olmayanlar" listelerinden çıkar. Yayına girmeden listeden çıkarma.
- Pro'ya iade ya da deneme hakkı gelirse "Pro'da iade yok" maddesini ve deneme satırlarını güncelle.
- Sorun giderme rehberinin adresi (`https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor`) Suflo Doctor ve kurucu bitiş metninden bağlanacak; adresi değiştirme.

---

## 3. Viral Skor 2.0 (açıklamalı 0–100 puan, cümle güvenli kenarlar)

**Şu an durum:** Kod tamam ve gerçek dünya girdisi gerektirmiyor: yapay zekâ adımı, kullanıcının
zaten girdiği Groq/OpenAI anahtarını kullanır, host (`jsx/host.jsx`) değişmedi. Senin işin
Premiere'de elle deneme, puanların gerçek videolarda makul dağılıp dağılmadığına bakmak ve
yayından sonra site metinlerini güncellemek.

Ne değişti, kısaca: Viral anlar kutusunda **Tür** (Genel, Podcast, Eğitim, Komedi, Motivasyon,
Ürün inceleme, Röportaj, Oyun), **Adet** (3–10) ve **"Ne arıyorsun?"** alanı var. Model her ana
5 alt puan (kanca, bağımsızlık, duygu, değer, kapanış), bir neden ve 3 kanca başlığı verir;
toplam puan panelde hesaplanır (`js/highlights.js` → `WEIGHTS`). Klipler cümle ortasında
başlamaz/bitmez; noktalama yoksa 0,6 sn'lik duraksama cümle sonu sayılır. Kartta ±1 cümle
düğmeleri, sıralama (puan/zaman) ve "Yalnız ≥60" filtresi var. Seçimler `settings.json`'da
`viralTur`, `viralAdet`, `viralOdak`, `viralMinPuan`, `viralSira` olarak kalır.

### 3.1 Premiere'de elle deneme (yayından önce, yaklaşık 25 dk)

Hazırlık: Pro lisanslı panel, Groq anahtarı, en az 5 dakikalık konuşmalı bir sekans ve
çıkarılmış altyazısı. Mümkünse hem Premiere 2020/2021'de (CEF 74) hem 2025/2026'da dene.

1. Altyazı sekmesi > **Viral anlar (Shorts)**: Tür, Adet, Süre seçicileri ve "Ne arıyorsun?
   (isteğe bağlı)" alanı "Viral anları bul" düğmesinin **üstünde** olmalı. Panel daraltılınca
   (yaklaşık 280 px) seçiciler iki sütuna geçmeli, yatay kaydırma çubuğu çıkmamalı.
2. Tür: Podcast, Adet: 3, odak: "en komik an" → **Viral anları bul**. En çok 3 an gelmeli
   (bildirim "3 viral an bulundu" ya da daha az; model fazlasını döndürse de). Her kartta: renkli halka
   (≥80 yeşil, 60–79 sarı, <60 kırmızı) içinde puan ve altında "/100 tahmini"; 5 çubuk (Kanca,
   Bağımsızlık, Duygu, Değer, Kapanış); italik neden satırı; 3 kanca başlığı seçeneği;
   "◀ +1 cümle, −1 | −1, +1 cümle ▶" satırı; Önizle ve Başlık ekle. Listenin üstünde sıralama,
   "Yalnız ≥60" ve "Puanlar yapay zekâ tahminidir; izlenme garantisi değildir." notu.
3. **Halka eski Premiere'de:** 2020/2021'de halka dairesel dolu görünmeli (CSS conic-gradient,
   Chromium 69+). Düz gri halka görürsen not et; puan sayısı yine okunur.
4. **Kenarlar:** Bir kartta **Önizle** → In/Out ve playhead o anın başına gelmeli. Premiere'de
   In'den Out'a oynat: klip cümle ortasında başlamamalı ve bitmemeli. 5 farklı kartta dene; kaç
   tanesinin temiz başlayıp bittiğini not et (hedef: 5'te en az 4).
5. **±1 cümle:** Aynı kartta "+1 cümle ▶" → süre etiketi uzamalı ve (aynı sekanstayken)
   Premiere'deki Out noktası **kendiliğinden** yeni sona kaymalı. "−1" ile geri al. Süre seçili
   aralığın (ör. 20–60 sn) dışına çıkınca süre etiketi sarıya dönmeli. Komşu kartla çakışacak
   yöndeki düğme gri (basılamaz) olmalı; "Yalnız ≥60" ile gizlenen bir an ise görünen kartın
   düğmesini kilitlememeli. Tek cümlelik (ya da tek uzun cümleli) bir kartta "−1" gri olmalı:
   kenar asla cümle ortasına düşmez. Klavye: Tab ile "+1 cümle ▶"ye gel, Enter'a art arda bas;
   her basışta bir cümle daha eklenmeli (odak düğmede kalır).
6. Başka bir sekansı aç → bir kartta Önizle: "Viral anlar başka bir sekansta bulundu" uyarısı
   çıkmalı, In/Out değişmemeli; ±1 cümle kart üzerinde çalışır ama Premiere'e dokunmaz.
   **Hızlı geçiş denemesi:** bir kartta Önizle → Premiere'de başka bir sekansa (ör. bir
   "Suflo Shorts" sekansına) geç → **hemen** panele dönüp o kartta "+1 cümle ▶"ye bas. Açık
   sekansın In/Out'u ve playhead'i değişmemeli; panelde "In/Out güncellenmedi: Premiere'de başka
   bir sekans açık." yazmalı. Aynı hızlı geçişle **Shorts sekansları oluştur** da uyarı vermeli.
   **Ters hızlı geçiş:** Premiere'de başka bir sekansa geç → **hemen** panele dönüp "Viral anları
   bul"a bas. Anlar bu (yeni açtığın) sekansa ait sayılmalı: Önizle In/Out'u ayarlamalı, Shorts
   oluşmalı, "başka bir sekansta" uyarısı **çıkmamalı**.
7. Kanca seçeneklerinden **ikincisini** seç → **Başlık ekle**: timeline'a bu metin gelmeli,
   `*yıldızlı*` kelime vurgu renginde.
8. "Zamana göre" ve "Yalnız ≥60" → liste **yeni arama yapmadan** değişmeli. Paneli kapatıp aç:
   tür, adet, odak, sıralama ve ≥60 seçimi yerinde olmalı.
9. **Marker olarak ekle** → kırmızı süreli marker'lar; marker yorumu "Suflo viral: 87/100 · neden".
10. **Listeyi kopyala** → Not Defteri'ne yapıştır: her satırda "87/100 tahmini (kanca … ·
    bağımsızlık … · …)" ve altında seçili kanca ("Kanca: …").
11. "Yalnız ≥60" açıkken **Shorts sekansları oluştur** yalnız ekranda görünen anları yapmalı.
12. Altyazıda birkaç satırı sil/ekle, sonra bir kartta ±1 cümle: kenar yine doğru cümleye
    kaymalı (panel aramanın gördüğü transkripti saklar).
13. Noktalama kapalı ("Noktalama: kaldır") ya da karaoke kelime kelime bir transkriptte
    yeniden ara: kenarlar duraksamalara oturmalı; ±1 cümle bir duraksamaya ya da tek satıra kaymalı.

### 3.2 Puan dağılımını kontrol et (yayından sonraki ilk hafta, yaklaşık 30 dk)

3–4 farklı türde gerçek videoda (podcast, eğitim, komedi) aramayı çalıştır ve puanları not et.
İstem modelden "ortalama klip ≈ 50, tüm aralığı kullan, klipleri birbirine göre sırala" diye
ister. Puanlar yine de hep 75–90'da toplanıyorsa ya da hep 40'ın altındaysa bana örnek
videoları ve `Listeyi kopyala` çıktısını gönder; istemdeki kalibrasyon cümlesi ya da
`WEIGHTS` buna göre ayarlanır (`tests/test-viral-skor.js`'teki ağırlık testleri de güncellenir).

### 3.3 Yayından sonra site metinleri

- `docs/blog/opusclip-alternatifi-premiere.html`: "Viral puan" satırını ("Her an için puan,
  başlık ve 'neden işe yarar' notu") 0–100 puan, 5 alt puan, neden ve 3 kanca başlığı diye
  güncelle; "Komutla an arama yok" maddesini "Ne arıyorsun?" odak alanı ve tür seçimiyle
  yeniden yaz (serbest komutla arama artık kısmen var); 2. adımdaki "en iyi 3-5 anı" ifadesini
  "3–10 anı" yap. SSS metni sayfada iki kez geçer (görünen `<details>` ve JSON-LD); ikisini
  birlikte değiştir, `dateModified` ve `docs/sitemap.xml` `<lastmod>` değerlerini güncelle,
  `node tools/test.js` çalıştır.
- Pazarlamada "izlenme garantisi", "viral olur" deme; "yapay zekâ tahmini", "nedeniyle
  açıklanan puan" de. Panel de bunu söylüyor.

---

## 4. Pro'yu dene: her araca 3 kalıcı hak (+ deneme filigranı)

**Şu an durum:** Kod tamam ve gerçek dünya girdisi gerektirmiyor (Lemon Squeezy anahtarı, yeni ürün ya
da sunucu değişikliği yok). Ücretsiz kullanıcı, kodla çalışan 9 Pro aracının her birini kendi videonda
3 kez dener: otomatik kesim, konuşmadan kes, viral anlar, otomatik zoom, geçişler, sesi iyileştir,
stilli altyazı katmanı ve kanca başlığı (ikisi ortak 3 hak), çeviri (çok dilli SRT paketi dahil), ritim.
Haklar süresiz; hak yalnız işlem **başarıyla** bitince düşer. İçerik kütüphaneleri (MOGRT, SFX, Motion BG,
preset, Pro paketi, altyazı MOGRT stilleri), toplu klip, stilli ASS dışa aktarma, sahne algılama ve
B-roll önerileri denemeye açık değil.

Nasıl çalışır, kısaca: Pro düğmesine basan ücretsiz kullanıcı satış penceresinde "Ücretsiz dene · N
hakkın var" düğmesini görür. Basınca deneme kurulur, pencere kapanır ve aynı işlem kendiliğinden yeniden
çalışır. Deneme hakkıyla eklenen stilli altyazı katmanı ve kanca başlığının sağ üstünde küçük, yarı saydam
`suflo.app` yazısı olur (SRT/VTT, caption izi, ses ve kesimlerde asla). Haklar
`%APPDATA%\Suflo\pro-deneme.json` (Mac: `~/Library/Application Support/Suflo/pro-deneme.json`) dosyasında
imzalı tutulur ve panelin localStorage'ına (`suflo.deneme`) yansıtılır. Bozuk ya da elle değiştirilmiş
dosya hakları sıfırlamaz, tüketir. Lisans gibi bu da onur sistemi: iki depoyu birden silen kişi hakları
geri alır; bu kabul edildi.

Satın alma sonrası: Pro'yu etkinleştiren kullanıcı, deneme hakkıyla ürettiği filigranlı çıktılar varsa
bir kez "Deneme çıktılarını temiz yeniden oluştur" bildirimi görür. Ayarlar › Suflo Pro kartındaki
listede her çıktı için "Temiz oluştur" düğmesi var. Kayıtlar `deneme-ciktilari.json` dosyasında (en çok 10).

**Ürün kararı (bilmen gereken):** Terim sözlüğü artık ücretsizde de uygulanıyor. Önceden Ayarlar'da
kilitsiz görünüyordu ama ücretsiz kullanıcıda transkripte sessizce uygulanmıyordu. Yol haritası onu
ücretsiz çekirdekte saydığı için Pro tablosundan çıkarıldı ve kod buna uyduruldu. Pro'da kalmasını
istersen `js/captions.js` → `applyGlossary` başına Pro kapısını geri koy, Ayarlar'daki sözlük kartına
kilit rozeti ekle ve README ile Ayarlar'daki Pro tablosunu geri çevir.

### 4.1 Premiere'de elle deneme (yayından önce, yaklaşık 40 dk)

Hazırlık: **lisanssız** bir panel (Ayarlar › Suflo Pro › "Bu makinede devre dışı bırak" ya da Pro'suz
bir kullanıcı hesabı), Groq anahtarı, konuşmalı bir sekans ve çıkarılmış altyazısı, müzikli bir klip.
Haklar sıfırdan başlasın diye Premiere kapalıyken `pro-deneme.json` ve `deneme-ciktilari.json`
dosyalarını sil. localStorage aynası da hakları tutar: geliştirici kurulumunda Chrome'da
`http://localhost:8092` → Console → `localStorage.removeItem("suflo.deneme")`. Yalnız dosyayı silersen
haklar geri **dolmamalı** (bu da denenecek bir davranış).

1. Ayarlar › Suflo Pro: "Pro'yu dene: her araca 3 hak" kartında 9 satır, her biri `3/3` olmalı.
   Pro karşılaştırmasında "Sözlük" yazmamalı; ücretsiz sütununda "Kelime kelime altyazı · terim sözlüğü"
   olmalı. Hakkında satırında "v1.7" ve "ücretsiz altyazı paneli" görünmemeli.
2. **Otomatik kesim:** Kesim sekmesinde "Analiz et" → satış penceresinde birincil düğme "Ücretsiz dene ·
   3 hakkın var", altında "Hak yalnız işlem başarıyla bitince düşer" (filigran notu **yok**). Bas: pencere
   kapanmalı ve analiz **kendiliğinden** başlamalı. Analiz bitince hak düşmemeli (Ayarlar'da hâlâ 3/3).
   "Uygula" → kesimler uygulanmalı, "1 deneme hakkı kullanıldı · 2 kaldı" bildirimi çıkmalı, Ayarlar'da 2/3.
   Tekrar "Analiz et" yeniden satış penceresini açmalı ("2 hakkın var").
3. **Hata hak yemez:** Klip seçmeden ya da kilitli track'te uygulamayı dene → hata mesajı, hak düşmemeli.
   Sesi iyileştir'i sesi olmayan bir klipte dene → hata, hak aynı.
4. **Klavye:** satış penceresinde Tab ile dolaş: ✕ → Ücretsiz dene → Suflo Pro'yu Al → Tüm Pro'yu gör →
   Lisans anahtarım var → yeniden ✕. Esc kapatmalı, odak tıkladığın düğmeye dönmeli.
5. **Konuşmadan kes, Viral anlar, Çeviri, Çok dilli SRT paketi, Geçişler, Ritim (marker ya da vuruşlarda
   böl), Sesi iyileştir:** her birinde "Ücretsiz dene" → işlem kendiliğinden çalışmalı → başarıda tek
   hak düşmeli. Viral anlarda Groq anahtarı yoksa anahtar sihirbazı açılmalı, hak düşmemeli. Çok dilli
   pakette yalnız kaynak dil seçiliyse (çeviri yok) hak düşmemeli. Sahne algılama ve B-roll önerileri
   satış penceresinde "Ücretsiz dene" **göstermemeli**.
6. **Otomatik zoom:** Deneme hakkıyla zoom ekle → "Zoom anahtarlarını temizle" kapısız çalışmalı; hakkı
   bitmiş kullanıcı da temizleyebilmeli.
7. **Stilli altyazı katmanı:** Bir Suflo Stili (ör. Creator Punch) seç → "ile ekle" → satış penceresindeki
   notta "stilli katmanlarda küçük suflo.app filigranı olur" yazmalı. "Ücretsiz dene" → katman V-kanalına
   konmalı. Premiere'de oynat: sağ üstte küçük, yarı saydam `suflo.app` görünmeli (16:9'da en üstte, 9:16
   sekansta biraz daha aşağıda, Reels arayüzünün altında). Altyazının kendisi değişmemeli.
   Aynı altyazıyı "Normal altyazı izi ekle" ile caption izine koy ve SRT/VTT dışa aktar: filigran **olmamalı**.
8. **MOGRT sızıntısı:** Pro'yken bir altyazı MOGRT stili seç, lisansı devre dışı bırak, paneli kapatıp aç
   (seçim tercihlerden geri gelir). "ile ekle" → deneme MOGRT'yi uygulamamalı; satış penceresi ya da
   "Deneme yalnız Suflo Stilleri için" uyarısı çıkmalı.
9. **Kanca başlığı:** Kanca sekmesinde "Playhead'e ekle" (ve Viral anlar kartında "Başlık ekle") → stilli
   katmanla **aynı** hak sayacından düşmeli; başlıkta sağ üstte filigran olmalı, önizleme PNG'sinde olmamalı.
10. **Hak bitince:** bir aracın 3 hakkını bitir → satış penceresinde "Ücretsiz dene" düğmesi çıkmamalı,
    "Suflo Pro'yu Al" birincil olmalı; Ayarlar'da o satır `0/3` ve soluk.
11. **Temiz yeniden oluşturma (en önemlisi, `KS_removeOverlay` ilk kez burada kullanılıyor):**
    7 ve 9'da filigranlı katmanlar ürettiğin sekans açıkken Pro anahtarını etkinleştir.
    - "Suflo Pro aktif" ile birlikte bir kez "Deneme çıktılarını temiz yeniden oluştur…" bildirimi çıkmalı;
      Ayarlar › Suflo Pro'da "Deneme çıktılarını temiz yeniden oluştur" kartında her çıktı bir satır olmalı.
    - Başka bir sekans açıkken "Temiz oluştur" → "O sekansı aç: <ad>." demeli, timeline'a dokunmamalı.
    - Doğru sekansta "Temiz oluştur" → filigransız yeni katman **aynı başlangıç anına** (başka bir V-kanalına
      ya da yeni kanala) konmalı, filigranlı eski katman timeline'dan **kaldırılmalı**; satır listeden gitmeli.
      Aynı sekansta kullanıcının başka Suflo katmanlarına (ör. daha önce Pro'yla eklenmiş stil katmanları,
      eski kanca başlıkları) **dokunulmamalı**: yalnız o deneme dosyasının klibi silinir.
    - Filigranlı katmanı elle silip "Temiz oluştur" → temiz katman konmalı, "eski filigranlı katman
      bulunamadı, varsa elle sil" uyarısı çıkmalı.
    - Render uzun sürerken başka sekansa geç → temiz katman yanlış sekansa **konmamalı** ("O sekansı aç").
    - "Listeden çıkar" yalnız listeden kaldırmalı, timeline'a dokunmamalı.
    Proje panelindeki "Suflo" kutusunda eski filigranlı .mov öğesi kalır (timeline'dan çıkar, projeden
    silinmez); bu beklenen davranış.
12. **Pro kullanıcısı:** lisanslıyken hiçbir yerde "Ücretsiz dene" ya da deneme listesi görünmemeli,
    katmanlarda filigran olmamalı ve `pro-deneme.json` **oluşmamalı**.
13. Eski Premiere'de (2020/2021, CEF 74) 2. ve 7. adımı tekrarla: pencere ve "kendiliğinden yeniden
    çalışma" aynı davranmalı.

### 4.2 Yayından sonra site ve pazarlama metinleri

- `docs/index.html`: "Demo sürümü var mı?" sorusunun cevabını (görünen `<details>` ve JSON-LD FAQPage,
  ikisi birebir aynı) şöyle güncelle: ücretsiz sürüm sınırsız; Pro araçlarının her birini kendi videonda
  3 kez deneyebilirsin, hak yalnız işlem başarılı olunca düşer. Fiyat kartındaki "almadan önce ücretsiz
  sürümü sınırsız dene" notuna "Pro araçlarını her birinde 3 kez dene" ekle. "Bu bir deneme sürümü değil.
  Kısıt yok, kredi yok, filigran yok." cümlesi ücretsiz çekirdek için hâlâ doğru; olduğu gibi kalabilir.
- Karşılaştırma sayfaları (`docs/blog/autocut-firecut-alternatifi.html`, `docs/blog/opusclip-alternatifi-premiere.html`):
  2.4'teki madde geçerli: "Pro'da deneme yok" ya da "almadan deneyemezsin" anlamına gelen satırları
  "her Pro aracında 3 kalıcı deneme hakkı" diye güncelle; iade satırı (iade yok) değişmiyor. SSS'leri
  `<details>` ve JSON-LD'de birlikte değiştir, `dateModified` ve `docs/sitemap.xml` `<lastmod>`
  değerlerini güncelle, `node tools/test.js` çalıştır.
- Destek / satış DM'lerinde "önce dene" itirazına cevap: "Panelde her Pro aracını kendi videonda 3 kez
  deneyebilirsin; hak yalnız işlem başarılı olunca düşer, süresi yok."
- Reels'te paylaşılan deneme çıktıları `suflo.app` filigranı taşır: ilk haftalarda yorumlarda/etiketlerde
  "suflo.app" görürsen o içerik üreticisine ulaş (Pro kodu ya da paylaşım izni), satın aldıysa Ayarlar'daki
  temiz yeniden oluşturmayı hatırlat.
