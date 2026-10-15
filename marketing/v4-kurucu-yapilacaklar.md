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
da sunucu değişikliği yok). Ücretsiz kullanıcı, kodla çalışan 10 Pro aracının her birini kendi videonda
3 kez dener: otomatik kesim, konuşmadan kes, viral anlar, otomatik zoom, geçişler, sesi iyileştir,
stilli altyazı katmanı ve kanca başlığı (ikisi ortak 3 hak), çeviri (çok dilli SRT paketi dahil), ritim,
hız rampası (3.2 adayı, § 12; hak yalnız en az bir klip rampalanınca, çalıştırma başına bir kez).
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
2. **Otomatik kesim:** Kesim sekmesinde bir klip seçip "Sessizlikleri bul" → satış penceresinde birincil düğme "Ücretsiz dene ·
   3 hakkın var", altında "Hak yalnız işlem başarıyla bitince düşer" (filigran notu **yok**). Bas: pencere
   kapanmalı ve analiz **kendiliğinden** başlamalı. Analiz bitince hak düşmemeli (Ayarlar'da hâlâ 3/3).
   "Kesimleri uygula" → kesimler uygulanmalı, "1 deneme hakkı kullanıldı · 2 kaldı" bildirimi çıkmalı, Ayarlar'da 2/3.
   Tekrar "Sessizlikleri bul" yeniden satış penceresini açmalı ("2 hakkın var").
   Sekmenin üstündeki tanıtım kartında "Otomatik kesimi aç — 749 TL" → pencerede yine "Ücretsiz dene";
   basınca `Deneme açık: şimdi "Sessizlikleri bul" düğmesine bas` bildirimi çıkmalı, sekme o düğmeye
   kaymalı ve "Sessizlikleri bul" pencere açmadan çalışmalı. Deneme açıkken tanıtım düğmesine yeniden
   basınca satın alma penceresi açılmalı ("Ücretsiz dene" olmadan); düğme tepkisiz **kalmamalı**.
   Zoom ("Zoom uygula"), Ritim ("Ritmi bul"), Kanca başlığı ("Playhead'e ekle") ve Geçişler (geçiş
   kartı) tanıtım kartlarında da bildirim doğru düğmenin adını söylemeli.
   SFX ve Motion BG tanıtım kartlarında "Ücretsiz dene" **olmamalı**.
3. **Hata hak yemez:** Klip seçmeden ya da kilitli track'te uygulamayı dene → hata mesajı, hak düşmemeli.
   Sesi iyileştir'i sesi olmayan bir klipte dene → hata, hak aynı.
4. **Klavye:** satış penceresinde Tab ile dolaş: ✕ → Ücretsiz dene → Suflo Pro'yu Al → Tüm Pro'yu gör →
   Lisans anahtarım var → yeniden ✕. Esc kapatmalı, odak tıkladığın düğmeye dönmeli.
5. **Konuşmadan kes, Viral anlar, Çeviri, Çok dilli SRT paketi, Geçişler, Ritim (marker ya da vuruşlarda
   böl), Sesi iyileştir:** her birinde "Ücretsiz dene" → işlem kendiliğinden çalışmalı → başarıda tek
   hak düşmeli. Ritimde aynı analizden önce "Markerları timeline'a at", sonra bir B-roll seçip
   "Seçili klibi vuruşlarda böl" → bölme satış penceresi açmadan çalışmalı ve toplamda **tek** hak
   düşmeli (ters sırada da tek hak); yeni bir "Ritmi bul" yeniden pencere açmalı. Viral anlarda Groq anahtarı yoksa anahtar sihirbazı açılmalı, hak düşmemeli. Çok dilli
   pakette yalnız kaynak dil seçiliyse (çeviri yok) hak düşmemeli. Sahne algılama ve B-roll önerileri
   satış penceresinde "Ücretsiz dene" **göstermemeli**.
6. **Otomatik zoom:** Deneme hakkıyla zoom ekle → "Zoom'u kaldır" kapısız çalışmalı; hakkı
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
9b. **Kurulum rehberi stil adımı:** lisanssız panelde Altyazı sekmesindeki "İlk adım" kartının 3. adımında
    "Stilleri gör" → "Timeline'a koy": pencerede "17 gerçek altyazı stili" kütüphane tanıtımı **değil**,
    stilli katman penceresi ("Ücretsiz dene · N hakkın var", filigran notu) çıkmalı. Pencereyi kapatıp
    "Tamam" de: önceki altyazı görünümü geri gelmeli. Yeniden "Timeline'a koy" → "Ücretsiz dene": Creator
    Punch katmanı filigranlı konmalı ve stilli katman sayacından tek hak düşmeli (örnek klipte de düşer).
10. **Hak bitince:** bir aracın 3 hakkını bitir → satış penceresinde "Ücretsiz dene" düğmesi çıkmamalı,
    "Suflo Pro'yu Al" birincil olmalı; Ayarlar'da o satır `0/3` ve soluk.
11. **Temiz yeniden oluşturma (en önemlisi; `ProjectItem.changeMediaPath` ilk kez burada kullanılıyor):**
    7 ve 9'da filigranlı katmanlar ürettiğin sekans açıkken Pro anahtarını etkinleştir.
    Nasıl çalışır: Suflo temiz .mov'u üretir ve projedeki deneme öğesini **yerinde** ona bağlar
    (Premiere'deki Replace Footage'ın aynısı). Timeline'daki klipler yerinde kalır, yalnız filigran
    gider. Premiere değiştiremezse yedek yol devreye girer: hiç dokunulmamış tek klip yeni temiz
    kliple değiştirilir; düzenlenmiş klibe dokunulmaz, temiz dosyanın yolu gösterilir.
    - "Suflo Pro aktif" ile birlikte bir kez "Deneme çıktılarını temiz yeniden oluştur…" bildirimi çıkmalı;
      Ayarlar › Suflo Pro'da "Deneme çıktılarını temiz yeniden oluştur" kartında her çıktı bir satır olmalı.
    - Başka bir sekans açıkken "Temiz oluştur" → "O sekansı aç: <ad>." demeli, timeline'a dokunmamalı.
    - **Dokunulmamış katman:** doğru sekansta "Temiz oluştur" → "Filigran kaldırıldı: deneme dosyası
      projede temiz olanla değiştirildi…" bildirimi; klip **aynı izde, aynı yerde** kalmalı ve oynatınca
      `suflo.app` görünmemeli (gerekirse playhead'i oynat ya da render çubuğunu yenile). Proje panelinde
      öğenin adı aynı kalmalı; sağ tık › Reveal in Explorer/Finder `suflo-temiz-…mov` dosyasını açmalı. Satır
      listeden gitmeli.
    - **Düzenlenmiş katman (bulgunun kendisi, mutlaka dene):** yeni bir deneme katmanı ekle, sonra
      (a) 5 sn sağa taşı, (b) baştan 1 sn kırp, (c) jiletle (C) ikiye böl ve ikinci parçayı kaydır,
      (d) Alt ile sürükleyip başka bir yere kopyala, (e) Effect Controls'ta Scale'i %80 yap.
      Pro'yu etkinleştirip "Temiz oluştur" → bu düzenlemelerin **hepsi** olduğu gibi kalmalı (konum,
      kırpma, parçalar, kopya, ölçek), yalnız filigran gitmeli. Ek klip konmamalı, yeni iz açılmamalı.
    - Aynı sekansta kullanıcının başka Suflo katmanlarına (ör. daha önce Pro'yla eklenmiş stil katmanları,
      eski kanca başlıkları) **dokunulmamalı**.
    - Filigranlı katmanı timeline'dan silip (öğe projede kalır) "Temiz oluştur" → öğe temizlenmeli,
      timeline'a yeni klip **konmamalı**.
    - Render uzun sürerken başka sekansa geç → öğe yine yerinde temizlenmeli (proje düzeyinde bir değişiklik).
    - "Listeden çıkar" yalnız listeden kaldırmalı, timeline'a dokunmamalı.
    - Yedek yol yalnız Premiere değiştirmeyi reddederse çalışır; elle zorlamak zor. Panel günlüğünde
      (`[temiz] yerinde değiştirilemedi: …`) bir satır görürsen sebebini bana ilet. O zaman beklenen:
      dokunulmamış tek klip → "Temiz katman Vn katmanına kondu", düzenlenmiş klip → sarı uyarıda
      "Deneme klibi timeline'da düzenlenmiş…" + temiz dosya yolu, timeline'a hiç dokunulmamış olmalı.
    Eski filigranlı .mov dosyası Suflo'nun altyazı klasöründe kalır (artık projede kullanılmaz); bu
    beklenen davranış.
12. **Pro kullanıcısı:** lisanslıyken hiçbir yerde "Ücretsiz dene" ya da deneme listesi görünmemeli,
    katmanlarda filigran olmamalı ve `pro-deneme.json` **oluşmamalı**.
13. Eski Premiere'de (2020/2021, CEF 74) 2. ve 7. adımı tekrarla: pencere ve "kendiliğinden yeniden
    çalışma" aynı davranmalı. Ayarlar › Suflo Pro'da deneme listesinde "Stilli altyazı ve kanca başlığı"
    adı `3/3` sayısına yapışmamalı; Pro'yla açılan "Deneme çıktılarını temiz yeniden oluştur" kartında
    "Temiz oluştur" ile "Listeden çıkar" arasında boşluk olmalı ve boşluksuz uzun bir sekans adı
    (ör. `Roportaj_2026_10_04_final_v3`) panelden taşmadan alt satıra kırılmalı.
14. **Okuma hatası hakları silmez:** Windows'ta antivirüs `pro-deneme.json`'u kısa süre kilitlerse
    (taramada) haklar sıfırlanmamalı; bunu elle zorlamak zor, yalnız Ayarlar'daki sayıların bir hak
    harcamasından sonra beklenmedik biçimde `0/3`'e düşmediğine bak.

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

---

## 5. Davet et, kazan (davet kodları, paylaşım kartı, isteğe bağlı "Made with Suflo")

**Şu an durum:** Panel ve site tarafı hazır, sunucu tarafı **uyuyor**. Sen açana dek:

- Ayarlar'daki "Davet et, kazan" kartı herkese (Pro sahibine de) kişisel bilgi taşımayan
  `https://suflo.app/?ref=xxxxxxxxxx` paylaşım bağlantısını, WhatsApp/X/Instagram düğmelerini ve
  "Ortaklık ve davet" sayfasını gösterir. Sunucu `503 referral_disabled` döndüğü sürece Pro'ya kod
  gösterilmez; panel hata vermez, sessizce paylaşım bağlantısına düşer.
- Davet şeridi (ilk kesim, ilk Shorts, 5. altyazı uygulaması; 30 günde en çok bir kez; iş sürerken ve
  yıldız şeridi açıkken çıkmaz) ve paylaşım metnindeki kredi satırı kutusu sunucudan bağımsız çalışır.
- "Bizi nereden duydun?" Pro etkinleşince bir kez sorulur; yanıt sunucuda
  `private/pro-v1/attribution.jsonl` dosyasına (gün, yanıt, lisansın SHA-256'sı) eklenir. Eski
  sunucu 400 dönerse panel bunu yok sayar.
- Site, `?d=KOD` ve `?ref=...` parametrelerini 30 gün saklar ve "Pro'yu al" bağlantılarına ekler.

Davet kodu açılınca: Pro sahibine `SFL` + 6 karakterlik bir kod üretilir (Lemon Squeezy'de %15, tek
seferlik, en çok 50 kullanım, yalnız Suflo Pro varyantlarında). Sayaç; ödenmiş, iade edilmemiş, 14
günden eski ve davet edenin kendi e-postası olmayan siparişlerin farklı e-postalarını sayar. 1 davet
"Davetçi", 3 davet "Kurucu" paketini açar; 10 davette kartta "seninle iletişime geçeceğiz" yazar
(ödülü sen elle verirsin).

### 5.1 Sunucuyu güncelle (yaklaşık 15 dk)

1. Yeni `server/pro-v1/index.php`'yi sunucudaki `public_html/pro/v1/index.php` üzerine yükle
   (en kolayı: `node tools/build-pro-cdn.js <paket> <surum>` ile üret, yalnız `index.php`'yi al).
2. Sunucudaki **çalışan** `private/pro-v1/config.php`'yi yeniden üretme; açıp `];` satırından önce
   şunları ekle (önceki satırın sonuna virgül koymayı unutma):
   ```php
       'ls_api_key' => '',
       'referral_enabled' => false,
       'referral_percent' => 15,
       'referral_max' => 50,
       'referral_variant_ids' => [],
       'referrals_path' => __DIR__ . '/referrals.json',
       'attribution_path' => __DIR__ . '/attribution.jsonl',
       'davet_dir' => __DIR__ . '/davet'
   ```
3. `node tools/check-pro-cdn.js` çalıştır. "Pro API hazir" ve "Davet ucu hazir (HTTP 503, uyuyan
   ozellik)" yazmalı. 400 görürsen `index.php` yüklenmemiştir.

Bu noktada her şey eski gibi çalışır; 3.0 panelleri hiçbir fark görmez.

### 5.2 Lemon Squeezy hazırlığı (yaklaşık 20 dk)

1. **Varyant kimlikleri:** Lemon Squeezy → Products → Suflo Pro → her varyantın (TRY ve 5. maddede
   açılacak USD varyantı) kimliğini not et (varyant düzenleme sayfasının adresindeki sayı). Bunlar
   `referral_variant_ids` olacak, ör. `[123456, 123457]`. Liste boşken özellik açılmaz.
2. **API anahtarı:** Settings → API → "+" ile yeni anahtar oluştur, adı `suflo-davet`. Anahtar
   **tüm mağazaya** yetkilidir (indirim, iade, müşteri verisi). Yalnız sunucudaki
   `private/pro-v1/config.php` içindeki `'ls_api_key' => '...'` satırına yapıştır. GitHub'a, panele,
   e-postaya, sohbete, ekran görüntüsüne asla koyma. Sızdığından şüphelenirsen hemen sil ve yenisini
   oluştur. Yayın sırasında `tools/verify-release.ps1`, anahtarın pakete girmediğini denetler
   (yerelde `SUFLO_LS_API_KEY` ortam değişkenini tanımlarsan anahtarın kendisini de arar).
3. **Ödeme bağlantısında indirim kodu:** Lemon Squeezy'nin `checkout[discount_code]=KOD` adres
   parametresiyle indirimi ödeme sayfasında hazır doldurduğunu bir kez doğrula: Discounts'ta elle
   `SFLTEST22` adında %15'lik bir kod aç, `https://suflo.app/?d=SFLTEST22` adresini aç, "Pro'yu al"a bas.
   Ödeme penceresinde indirim satırı görünmeli. Görünmüyorsa panel ve site yine çalışır ama alıcı kodu
   elle yazmak zorunda kalır; bu durumda bana haber ver. Sonra `SFLTEST22`'yi sil.

### 5.3 Test satın alımı ve açma (yaklaşık 30 dk)

1. Önce **test modunda** dene: Lemon Squeezy'de "Test mode"u aç, test modu API anahtarı oluştur. Test
   modundaki ürün ve varyant kimlikleri canlıdakinden farklıdır; deneme süresince `config.php`'de
   `product_id`, `referral_variant_ids` ve `ls_api_key`'i test modu değerleriyle değiştir (eski
   değerleri bir kenara yaz), `'referral_enabled' => true` yap.
2. Test modunda bir Suflo Pro satın al (kart: `4242 4242 4242 4242`), test lisansını panelde etkinleştir.
   Ayarlar › Davet et, kazan kartında `SFL…` kodu ve `0/1 davet` görünmeli. Lemon Squeezy →
   Discounts'ta `Davet SFL…` adında, %15, 50 kullanımlık, Suflo Pro'ya sınırlı bir indirim oluşmalı.
3. Başka bir e-postayla `https://suflo.app/?d=SFL…` adresinden ikinci bir test satın alımı yap. Ödeme
   sayfasında %15 indirim uygulanmalı. Sayaç ancak 14 gün sonra `1/1` olur (iade suistimaline karşı
   bilerek gecikmeli); bu adımda `0/1` görmen normal.
4. `config.php`'yi **canlı** değerlere geri çevir (canlı `product_id`, canlı varyant kimlikleri, canlı
   API anahtarı), `'referral_enabled' => true` bırak. Test modunda oluşan `referrals.json`'u sil
   (canlı lisanslarla eşleşmez, ama karışıklık olmasın).
5. Kendi canlı lisansınla kartı bir kez aç: kod gelmeli. Gelmezse `'referral_enabled' => false` yap;
   panel hemen paylaşım bağlantısına döner.

### 5.4 Ödül paketleri (yaklaşık 1 saat, sonra her güncellemede)

1. Pro paket klasörüne şu klasörleri ekle:
   - `davet/t1/mogrt/` ve `davet/t1/sfx/`: "Davetçi" (1 davet): birkaç altyazı MOGRT şablonu ve
     yaklaşık 30 ses efekti. Suflo Stili koyma: stiller açık kaynak koddur, ödül olamaz.
   - `davet/t3/mogrt/` ve `davet/t3/sfx/`: "Kurucu" (3 davet): ayrı bir paket.
2. `node tools/build-pro-cdn.js <paket> <surum>` çalıştır; çıktıda `davet=N` yazar ve
   `private/pro-v1/davet/manifest.json` oluşur. Ana katalog (`manifest.json`) bu klasörden etkilenmez.
3. `powershell -ExecutionPolicy Bypass -File tools/pro-content-zip.ps1` ile içerik arşivini al ve
   sunucuda `private/pro-v1/` içine çıkar (`davet/` klasörü de gelir, `config.php`'ye dokunmaz).
4. Ödüller yalnız **3.1.0 ve yeni** panellere gider (3.0 bilinmeyen yolda tüm eşitlemeyi durdururdu).
   Panel ödülleri `pro-content/davet/` altına indirir, hiç silmez; SFX ve Grafikler'de Pro
   koleksiyonunda görünür.
5. 3 davetteki "erken erişim" sözü ve 10 davetteki iletişim senin elinde: `referrals.json`'da
   `"tier": 10` olan kayıtları ayda bir kontrol et (kayıtta e-posta yok, yalnız özet; kişiyi Lemon
   Squeezy'de indirim kodunun siparişlerinden bulursun).

### 5.5 Site ve ortaklık

- `docs/ortaklik.html` yayında. "E-postayla yaz" düğmesi, sayfadaki `data-eposta=""` alanına herkese
  açık bir adres yazana dek gizli; o zamana dek yalnız Instagram düğmesi görünür. Kişisel Gmail'ini
  yazma; `ortaklik@` gibi bir yönlendirme adresi aç.
- "Ortaklık programına katıl" düğmesi `https://suflo.lemonsqueezy.com/affiliates` adresine gider.
  Lemon Squeezy → Affiliates'i açmadan önce Türkiye'de ödeme alabildiğini doğrula (PayPal 2016'dan beri
  yok); açamıyorsan düğmeyi sayfadan kaldır, IBAN'lı kişisel kod yolunu bırak.
- İçerik üreticisi kodları (ör. `EDITORALI15`) Lemon Squeezy → Discounts'ta elle açılır; panelin
  `SFL` kodlarıyla karışmaz. Ayda bir Discounts → kod → siparişler listesinden payı hesaplayıp IBAN'a
  gönder.
- Sitede `?d=` ile gelen ziyaretçiye yüzde yazmadan "Davet kodu ödeme sayfasına eklendi: SFL… ·
  indirim ödemede onaylanır" notu çıkar (kodun geçerliliğini ve kalan kullanımını yalnız Lemon Squeezy
  bilir). `referral_percent`'i değiştirirsen `docs/ortaklik.html`'deki %15'i de değiştir.

### 5.5a Sürüm 3.1.0 olmadan ödül inmez (yayın kapısı)

Sunucu davet ödüllerini (`manifest.extras.davet`) ve ödüllü tokeni yalnız 3.1.0 ve üstünü bildiren
panele gönderir. Paket sürümü artık 3.1.0 (`CSXS/manifest.xml` ve `js/bridge.js`); bu kapı açık.

1. Sürümü bir daha değiştirirsen `CSXS/manifest.xml` içinde `ExtensionBundleVersion` ve
   `Extension Version`'ı birlikte değiştir (`tools/package.ps1` `js/bridge.js` `VERSION`'ı kendiliğinden
   eşitler). `marketing/release-notes.md`'nin ilk başlığı da aynı sürümü yazmalı (`tools/publish.ps1`
   yoksa yayını durdurur, `tests/test-guncelleme.js` de düşer).
2. `tools/verify-release.ps1` sürüm sunucudaki eşiğin altındaysa yayını "Surum …, davet odullerinin
   sunucu esigi …'in altinda" diyerek durdurur. `node tests/test-davet-surum-esigi.js` aynı durumu
   artık hata olarak yakalar.
3. Panelin "Suflo 3.1'de yeni" penceresi (`js/app.js` `YENILIKLER`) sürümün ilk iki hanesini taşır;
   `tests/test-yenilikler.js` sürüm büyüyüp liste eski kalırsa düşer.

### 5.6 Premiere'de elle deneme (yayından önce, yaklaşık 25 dk)

1. **Ücretsiz panel:** Ayarlar › Davet et, kazan kartında `suflo.app/?ref=` bağlantısı, Kopyala,
   WhatsApp, X ve Instagram (yalnız kopyalar) çalışmalı. WhatsApp ve X tarayıcıda Türkçe karakterleri
   bozulmadan açmalı.
2. **Şerit:** yeni bir ayar dosyasıyla (ya da `davet` ayarlarını silerek) ilk konuşmadan kes / sessizlik
   kesiminin uygulanmasından sonra altta modal olmayan davet şeridi çıkmalı; işlem sürerken çıkmamalı.
   "Bir daha gösterme"den sonra ilk Shorts'ta ve 5. altyazı uygulamasında çıkmamalı. 3. altyazı
   uygulamasında yine GitHub yıldız şeridi çıkmalı, ikisi aynı anda görünmemeli.
3. **Kredi satırı:** Bölümler › YouTube metni › "Sona Suflo kredi satırı ekle" ücretsizde varsayılan
   açık, Pro'da kapalı olmalı; işaretleyince satır metnin en sonunda görünmeli, kopyalanan metin
   kutudakiyle aynı olmalı.
4. **Pro, sunucu kapalı:** Pro lisansla kart yine paylaşım bağlantısını göstermeli, hata vermemeli.
5. **Pro, sunucu açık (5.3'ten sonra):** kod, "0/1 davet" ilerlemesi, Kopyala ve "Story kartı". Story
   kartı masaüstüne `Suflo-Davet-SFL….png` (1080x1920) kaydetmeli; kodu ve `suflo.app/?d=` adresini
   okunaklı göstermeli. libass uyarısı olan makinede düğme gizli olmalı.
6. **"Bizi nereden duydun?":** lisansı devre dışı bırakıp yeniden etkinleştir; soru yalnız ilk
   etkinleştirmede bir kez çıkmalı, "Geç" ile kapanmalı. Seçim sonrası sunucudaki
   `attribution.jsonl`'a bir satır eklenmeli.
7. **Ödüller (5.4'ten sonra, 3.1.0 panelle):** tier'i 1 olan bir lisansla Pro içeriklerini eşitle;
   `pro-content/davet/t1/` dolmalı, SFX'te ödül sesleri "SUFLO PRO" koleksiyonunda görünmeli,
   bir sesi timeline'a sürükleyip Premiere açıkken yeniden eşitleme hatasız bitmeli.

## 6. English (beta) arayüz + global satış (USD fiyat, marka güvenli adlar, İngilizce site)

Panel artık İngilizceyi gerçekten yükler. Dil sırası: `settings.json`'daki `uiLang` → eski
`localStorage` seçimi → settings.json bu açılıştan önce varsa **Türkçe** (her güncelleyen Türkçe
kalır; Premiere'in Türkçe arayüzü olmadığı için `navigator.language` çoğu Türk kurulumda `en-US`
döner, ona güvenilmez) → taze kurulumda rehberin iki dilli 0. adımı sorar. Fiyat tek kaynaktan
gelir (`js/pricing.js`): USD varyantı açılana kadar İngilizce arayüz ve İngilizce site
**"749 TRY (≈ $19)"** gösterir ve TRY ödemesini açar. Gösterilen fiyat ile açılan ödeme her zaman
aynı para birimindedir; senin bir şey yapmana gerek yok, satış bugün de çalışır.

### 6.1 USD varyantını aç (yaklaşık 15 dk, istediğin zaman)

1. Lemon Squeezy › Products › **Suflo Pro** (ürün `1302656`) › Variants › **Add variant**.
   Ad: `Suflo Pro (USD)`, fiyat **$39**, para birimi USD, "Pay once" (abonelik değil). İstersen
   karşılaştırma fiyatı olarak $59 yaz. Lisans anahtarı üretimini TRY varyantıyla aynı ayarla aç
   (aynı aktivasyon sınırı).
2. Varyantın **Share** düğmesinden ödeme adresini kopyala: `https://suflo.lemonsqueezy.com/checkout/buy/<uuid>`.
3. `js/pricing.js` içinde `PRICING.en.url` alanına bu adresi yaz (başka bir şeyi değiştirme).
   Lisans tarafında değişiklik gerekmez: `js/pro.js` ve sunucu `VARIANT_ID 0` ile her varyantı kabul eder.
4. `node tools/test.js` çalıştır. `tests/seo-kontrol.js` İngilizce sitenin eski TRY fiyatında
   kaldığını söyleyip **kalacak**: siteyi de güncellemen gerekir (6.2).
5. Test modunda bir USD satın alımı yap, gelen anahtarı panelde etkinleştir; Pro açılmalı.

### 6.2 İngilizce siteyi USD'ye çevir (USD varyantından sonra, yaklaşık 10 dk)

İngilizce sayfalar (`docs/en/`) fiyatı ve ödeme adresini `js/pricing.js`'ten alarak üretildi;
`tests/seo-kontrol.js` her sayfada gösterilen fiyatın (`data-price`), ödeme adresinin ve JSON-LD
`priceCurrency`'nin `SufloPricing`'le aynı olduğunu denetler. USD varyantından sonra:

1. `docs/en/index.html` ve `docs/en/pro.html` içinde `749 TRY (≈ $19)` → `$39`, ödeme adresi →
   USD varyantının adresi, `"priceCurrency":"TRY"` → `"USD"`, `"price":"749"` → `"39"`.
   "Checkout is in Turkish lira for now…" ve "Why is the price shown in Turkish lira?" metinlerini sil
   ya da "Prices in USD, tax added at checkout" diye değiştir. Bloglardaki tablolarda da aynı fiyatı düzelt.
2. `node tests/seo-kontrol.js` tamamen geçmeli.

### 6.3 Premiere'de elle deneme (yayından önce, yaklaşık 30 dk)

1. **Güncelleyen kullanıcı:** mevcut bir kurulumun üstüne kur (settings.json duruyor). Premiere
   İngilizce olsa bile panel **Türkçe** açılmalı, 0. adım çıkmamalı.
2. **Taze kurulum:** `%APPDATA%\Kesit\settings.json`'ı (Mac: `~/Library/Application Support/Kesit/settings.json`)
   yedekleyip sil. Altyazı sekmesinin üstünde "Arayüz dili · Interface language" kutusu, Premiere'in
   diline göre vurgulanmış bir düğmeyle çıkmalı. **English (beta)**'ya bas: panel yeniden yüklenmeden
   İngilizceye geçmeli; altyazı dili Otomatik olmalı; stil kartlarında "Don't miss this" yazmalı.
3. **Büyük harf:** İngilizcede "SETTINGS" gibi büyük harfli başlıklar noktalı İ ile ("SETTİNGS")
   yazılmamalı.
4. **Geri dönüş:** Ayarlar › Destek › Arayüz dili › Türkçe: panel yeniden yüklenmeden Türkçeye dönmeli,
   açık altyazı ve taslak kaybolmamalı. Bir altyazı oluşturulurken seçici gri (kapalı) olmalı.
5. **Fiyat:** İngilizcede bir Pro düğmesine bas; pencerede **749 TRY (≈ $19)** yazmalı, "Get Suflo Pro"
   TRY ödeme sayfasını açmalı. Türkçede her şey eskisi gibi **749 TL**.
6. **Hata metinleri:** sekans açık değilken Geçişler'den bir geçiş uygula; İngilizcede "No active sequence."
   görünmeli. Premiere'de oluşan bin/marker adları (Suflo Altyazi, Suflo Shorts) iki dilde aynı kalmalı.
7. **Diğer diller:** Altyazı › Dil › Diğer diller'den Japonca seç; "Bu alfabe stilli altyazı…"
   (İngilizcede "The styled caption layer's fonts may not include this script…") notu çıkmalı.
8. **Kurucu:** Windows `Suflo-Kur.bat`'ı Premiere açıkken çalıştır; soruya `Y` yaz, kurulum devam etmeli
   (eskiden iptal ediyordu). `H` / `N` iptal etmeli. Mac `.command`'da da aynı.
9. **Paket:** `tools\kurucu-yap.ps1` ve `tools\package.ps1` ile paket üret; `tools\verify-release.ps1`
   geçmeli (`i18n/en.js`, `js/i18n.js`, `js/pricing.js` zorunlu). Kurulumdan sonra panel klasöründe
   `i18n\en.js` olmalı.

### 6.4 İngilizce site ve lansman

1. `docs/en/` sayfaları (ana sayfa, Pro, 3 rehber) sitemap'te; yayından sonra Search Console'da
   `https://suflo.app/en/` için **URL denetimi › Dizine eklenmeyi iste** yap.
2. Rakip fiyatlarını (OpusClip, AutoCut, FireCut) 2.1'deki gibi doğrula; İngilizce rehberlerdeki
   tablolar Türkçe rehberlerle aynı rakamları kullanıyor, ikisini birlikte güncelle.
3. Product Hunt, Reddit ve X için metinler `marketing/product-hunt-kit.md`'de. Lansman günü öncesinde
   1270×760 galeri görselleri ve 30-60 sn'lik İngilizce demo videosu çekilmeli (kitte liste var).
4. Bundan sonra eklenen her yeni Türkçe metnin İngilizcesi aynı değişiklikte `i18n/en.js`'e girer
   (`tests/test-i18n.js` ve `node tools/i18n-coverage.js` bunu denetler).

## 7. Tek Tık Temizlik (tekrar çekimler, yarım başlangıçlar, take politikası, senaryo, tek inceleme listesi)

Konuşmadan kes kartı artık baştan alınan cümleleri de bulur. Kod tamam ve testli; **senden gerçek
dünya girdisi istemiyor** (anahtar, hesap, kayıt yok). AI gruplaması kullanıcının mevcut Groq
anahtarıyla çalışır, anahtar yoksa düğme kapalı durur ve yanında "anahtar gerekli · 1 dk" çipi
çıkar (Pro'da ve Konuşmadan kes deneme hakkı kalan ücretsiz kullanıcıda; hakkı bitmiş
ücretsiz kullanıcı kartı zaten Pro kapısında görür). Önbellek
`%APPDATA%\Kesit\transcripts` (Mac: `~/Library/Application Support/Kesit/transcripts`) altında
en çok 50 transkript / 100 MB tutar. Yapman gerekenler yalnız Premiere'de elle deneme ve tanıtım:

### 7.1 Premiere'de elle deneme (yaklaşık 25 dk)

Bir konuşma klibi çek ya da bul: aynı cümleyi 3 kez söyle ("Bugün size … göstereceğim"), bir
cümleyi yarıda kesip baştan al ("Şimdi size… Şimdi size ışığı göstereceğim"), araya bir kez
"pardon" de, sonra normal konuşmaya devam et. Çekimler arasında 1-2 sn sus.

1. **Tekrar çekim:** Kurgu › Konuşmadan kes › Konuşmayı yazıya dök. Kelime listesinde grup
   satırı "Tekrar ×3 · 1 2 3 ✓" çıkmalı; ilk iki çekim mavi ve üstü çizili, üçüncüsü mavi alt
   çizgili olmalı. "pardon" da atılanlara girmeli. Özet satırının sonunda "· 2 tekrar çekim" yazmalı.
2. **Çip:** "1" çipine bas: ✓ birinciye geçmeli, kelime renkleri yer değiştirmeli. Her çipin
   yanındaki ▶ yalnız o çekimi çalmalı.
3. **Politika:** "Tekrar çekimde" › "En uzunu tut" / "En akıcıyı tut": tutulan çekim değişmeli,
   yeniden yazıya dökme OLMAMALI (anında).
4. **Yarım başlangıç:** Groq (bulut) motoruyla yazıya dökersen noktalama gelmez; "Yarım başlangıç ×2"
   satırı "orta güven" rozetiyle ve işaretsiz gelmeli; İnceleme listesinde işaretsiz satır olarak
   durmalı. İşaretleyince kesime girmeli.
5. **İnceleme listesi:** her satırda neden çipi (dolgu / tekrar / tekrar çekim / yarım başlangıç /
   duraksama / senaryo dışı), işaret ve zaman olmalı. Zamana basınca Premiere'in oynatma kafası
   oraya gitmeli; işareti kaldırınca kelime listesinde de o parça geri gelmeli.
6. **Yalnız kesilecekleri dinle:** yalnız silinecek parçalar art arda çalmalı.
7. **Senaryo:** "Senaryoyu yapıştır" kutusuna okuduğun metni yapıştır: her cümle için senaryoya en
   yakın çekim kalmalı; senaryoda olmayan bir cümle ("Bu arada abone olun") İnceleme'de
   "senaryo dışı" olarak işaretsiz görünmeli, kendiliğinden kesilmemeli.
8. **AI:** Groq anahtarı varken "AI ile benzer anlatımları da grupla"yı aç: "AI benzer anlatımları
   arıyor…" görünmeli; bulduğu gruplar "AI" ve "orta güven" rozetiyle, işaretsiz gelmeli. Anahtarı
   geçici olarak bozarsan uyarı çıkmalı ve sezgisel sonuç kalmalı.
9. **Uygula:** Kopya sekansta uygula: yeni sekansın adı **"<sekans> — Suflo Temiz"** olmalı, özgün
   sekans dokunulmamış kalmalı. Ses ve görüntü senkronu kaymamalı.
10. **Önbellek:** aynı klipte tekrar "Konuşmayı yazıya dök": anında açılmalı ve kartta
    "önbellekten · Yeniden yazıya dök" görünmeli. "Yeniden yazıya dök" motoru yeniden çalıştırmalı.
    Kesimi uyguladıktan sonra kopya sekansta kalan bir parçayı seçip yazıya dök: yine önbellekten
    gelmeli (kapsayan girdi). Altyazı sekmesinde tek klip + "Kelime kelime" ile altyazı ürettiysen
    Konuşmadan kes o klibi de önbellekten açmalı.
11. **Ayarlar:** Ayarlar › Ek dolgu sözcükleri'ne `tr: yani yani` yaz, kaydet; açık incelemede
    "yani yani" turuncu dolgu olmalı. "Transkript önbelleğini temizle" sonrası aynı klip yeniden
    yazıya dökülmeli.
12. **Çok kesim:** 20 dk'lık dolgu dolu bir klipte 300'den fazla kesim çıkarsa uygulamada
    "300+ kesim birleştirildi" uyarısı görünmeli ve Premiere donmamalı.

### 7.2 Tanıtım (isteğe bağlı)

- Tekrar çekim temizliği 2026'da rakiplerin (AutoCut Repeat, FireCut, TimeBolt, Cutback) en çok
  öne çıkardığı özellik; Türkçede en iyi çalışan biz olmalıyız. 15 sn'lik bir önce/sonra videosu
  (3 çekim → tek tık → temiz) Shorts ve Reels için en güçlü malzeme.
- **AI'nın "farklı sözcüklerle tekrar"ı bulduğunu pazarlama**: prototipte bu ayrım zayıftı
  (yalnız 0,60–0,67 aralığı). Mesaj "baştan aldığın cümleleri bulur" olmalı.

## 8. Marka Kiti + stil ince ayarı + paylaşılabilir stil kodları

Kod tamam ve testli; **senden anahtar ya da hesap istemiyor**. Stil kodları (`SFL1.…`) tamamen
istemcide çözülür: sunucu yok, kod adresin `#` kısmında durur (sunucuya, günlüğe gitmez).
Yeni site sayfası `docs/stil.html` (suflo.app/stil) ve 12 Suflo Stilinin vitrin videoları
`docs/gorseller/suflo-stiller/*.webm` yayına hazır; yeniden üretmek için
`node tools/render-style-previews.js --site` (libass'li ffmpeg gerekir).

### 8.1 Premiere'de elle deneme (yaklaşık 20 dk)

1. **İnce ayar yalnız Suflo Stilinde:** Altyazı › Stil kartında bir MOGRT şablonu seç: "İnce ayar"
   görünmemeli. Bir Suflo Stili (ör. Bold Box) seç: "İnce ayar" açılmalı; içinde Animasyon ve
   Arka plan kutusu OLMAMALI, Yazı tipi listesinde "Sistem" grubu soluk (seçilemez) olmalı.
   Vurgu rengi kutusu soluk olmamalı ve değişince önizlemede aktif kelimenin rengi değişmeli.
2. **Platform arayüzünden kaçın:** 1080x1920 bir sekans aç. Kutucuk yalnız 9:16'da görünmeli.
   Viral Vurgu + uzun kelimeli bir altyazıyla aç/kapat: açıkken önizlemede yazı sağdaki kırmızı
   ikon sütunu kutusuna girmemeli. 16:9 sekansta kutucuk gizli olmalı.
3. **Paylaş / yapıştır:** İnce ayar › "Adın" alanına adını yaz, "Stili paylaş"a bas. Panodaki
   iki satır: `SFL1.…` kodu ve `https://suflo.app/stil#SFL1.…` bağlantısı. Başka bir stil seç,
   kodu Stil kartındaki "Stil kodu yapıştır" kutusuna yapıştırıp Uygula: aynı stil, renk ve yazı
   tipi gelmeli; stil ızgarasının üstünde "Stil: @adın" çipi görünmeli; önizleme oynamalı.
   Bozuk bir kod (son 10 karakteri sil) "Stil kodu bozuk…" uyarısı vermeli, hiçbir şey değişmemeli.
4. **.suflo-stil:** "dışa aktar" masaüstüne `suflo-stil-<stil>.suflo-stil` yazmalı; "içe aktar" ile
   aynı dosyayı seçince 3. adımdaki gibi uygulanmalı.
5. **Varsayılana dön:** ince ayarları boz, "Varsayılana dön": stilin kendi ayarları gelmeli.
6. **Marka Kiti:** Ayarlar › Marka Kiti: yazı tipi Lora, "Marka renklerini kullan" açık, kendi
   renklerin, logo olarak saydam bir PNG, köşe Sol üst, boyut %14; "Marka kitini her stile…"yi aç.
   Altyazı sekmesinde stil ızgarasının üstünde "Marka kiti açık" çipi çıkmalı; her Suflo Stili
   kartına basınca kitin yazı tipi/renkleriyle gelmeli; önizlemede logo sol üstte görünmeli.
7. **Logo katmanda:** Pro (ya da deneme hakkı) ile "… ile ekle": katmanda logo sol üstte, yazılar
   aynen; katman sekansın SONUNA kadar uzamalı (sekanstan uzun olmamalı). Logoyu diskten silip
   tekrar ekle: "Marka Kiti logosu bulunamadı; katman logosuz eklendi" uyarısı çıkmalı.
   Logonun kenarlarında koyu hale OLMAMALI (yarı saydam PNG ile kontrol et).
8. **9:16 + logo:** dikey sekansta "Platform arayüzünden kaçın" açıkken Sağ üst köşe: logo üst
   çubuğun (%7) altında ve ikon sütununun solunda kalmalı.
9. **Kanca başlığı:** kit açıkken Kanca sekmesinde "Marka kiti açık: yazı tipi ve renkler kitten
   gelir" notu görünmeli; önizleme kitin yazı tipiyle çizilmeli.
10. **Şimdiki ayarlardan doldur:** Altyazı'da bir stil + ince ayar seç, Ayarlar › Marka Kiti ›
    "Şimdiki ayarlardan doldur": alanlar dolmalı. Sistem yazı tipi (Arial) seçiliyken uyarı vermeli.
11. **İngilizce arayüz:** Ayarlar › Arayüz dili English: kart başlıkları "Brand kit", "Share style",
    "Avoid platform UI" olmalı; "Stil: @ad" çipindeki ad çevrilmemeli.

### 8.2 Site

- `docs/stil.html` yayına girince `https://suflo.app/stil#<panelden kopyaladığın kod>` aç:
  stil adı, yazarın, renk kutuları, yazı tipi, konum ve temel stilin videosu görünmeli; "Kodu
  kopyala" çalışmalı, "Suflo'yu indir" GitHub releases/latest'e gitmeli. Kodsuz `/stil` yalnız
  "nasıl kullanılır" kartını göstermeli. Search Console'a sitemap yeniden gönderilebilir.

### 8.3 Tanıtım (isteğe bağlı)

- Her paylaşılan kod bir Suflo reklamı: Instagram/TikTok'ta "stilimi kopyala" gönderilerine
  `suflo.app/stil#…` bağlantısı koymayı öner. İlk 5-10 hazır kodu (kendi markan, birkaç popüler
  renk) bir blog yazısında ya da sabit gönderide topla.
- Kullanıcıların kendi yerel yazı tiplerini yüklemesi (TTF ad tablosu + Türkçe glif denetimi)
  bilerek ertelendi; istek gelirse sıradaki sürüm.

## 9. Tek Tık Shorts Paketi (anlar → 9:16 sekanslar → marka altyazı, kanca, ilerleme çubuğu, CTA, logo → paylaşım paketi)

Kod tamam ve testli; **senden anahtar, hesap ya da sunucu değişikliği istemiyor**. Pro özelliği
(`shortsPaket`), deneme hakkı yok. AI anahtarı yoksa paylaşım metni yapay zekâsız hazırlanır
(başlık + anın gerekçesi + 3 genel hashtag); ffmpeg / libass yoksa altyazı, kanca ve çerçeve
adımları gerekçesiyle atlanır, sekanslar ve metin yine üretilir. Tek başına zincirlenmiş çok
sekanslı akış Premiere'de **hiç denenmedi**: aşağıdaki liste bunun için.

### 9.1 Premiere'de elle deneme (yaklaşık 30 dk; Premiere 24.3+ ve 14.4 ayrı ayrı)

1. **Hazırlık:** 3-5 dakikalık konuşmalı bir video, 16:9 sekans. Altyazı sekmesinde yazıya dök,
   Viral anlar › "Viral anları bul". Kartlarda "Pakete al" kutusu 60 ve üstü puanlılarda işaretli
   gelmeli; "Shorts Paketi" kutusu kartların altında, düğme "Paketi oluştur (N Shorts)".
2. **Seçenekler:** Altyazı stili listesinde yalnız Suflo Stilleri olmalı (Altyazı sekmesinde seçili
   Suflo Stili varsayılan). Altyazı sekmesinde bir MOGRT stili seçiliyken kutuyu aç: "Seçili MOGRT
   stili pakette kullanılamaz" notu görünmeli. Marka Kiti'nde logo yoksa "Logo" yanında "(Marka
   Kiti'nde logo yok)" yazmalı. CTA'da "Kendi metnim…" seçince 40 karakterlik kutu açılmalı.
3. **Paket (Pro):** 3 an işaretli, her şey açık, Paketi oluştur. Beklenen sıra: önce 3 sekans +
   9x16 kopyaları "Suflo Shorts" kutusunda (Auto Reframe birkaç dakika sürebilir), sonra her
   9:16 Short açılır ve içine sırayla "Suflo Paket · Altyazı", "Suflo Paket · Kanca",
   "Suflo Paket · Çerçeve" katmanları 0. saniyeden konur. Liste satırlarında çipler sırayla
   "çalışıyor" → "tamam" olmalı. Bitince ana sekans yeniden açık olmalı.
4. **Görüntü:** her Short'ta altyazı seçilen stilde ve platform arayüzünden uzakta; kanca ilk
   saniyelerde kartta seçtiğin metinle; ilerleme çubuğu üstte (durum çubuğunun altında) soldan
   sağa dolmalı ve videonun SONUNDA tam dolu olmalı; son ~2,5 sn'de CTA ("Takip et"); Marka Kiti
   logosu seçtiğin köşede. Çerçeve katmanı Short'tan uzun OLMAMALI. 8 sn'den kısa bir an ekle:
   o Short'ta CTA olmamalı (satırda "CTA atlandı: Short 8 sn'den kısa").
5. **Dosyalar:** proje klasöründe `Suflo-Shorts-paylasim-paketi-<tarih>.txt` ve `.csv` olmalı;
   bildirimdeki "Klasörü aç" (ve kutudaki düğme) klasörü açmalı. TXT'yi Not Defteri'nde, CSV'yi
   Google Sheets'te aç: Türkçe harfler doğru, her Short için YouTube Shorts / TikTok / Reels
   metinleri ayrı. **Not:** Türkçe Excel CSV'de ayırıcı olarak `;` bekler; virgüllü CSV'yi Excel'de
   Veri › Metinden ile açmak gerekebilir (Sheets ve Numbers doğrudan açar).
6. **Kredi satırı:** "Kredi satırı" kapalıyken açıklamalarda "Altyazılar: Suflo" OLMAMALI;
   açıkken her açıklamanın en sonunda olmalı.
7. **İptal / Devam et:** 3 anlık pakette 2. Short'un altyazısı sırasında İptal: o adım bitince
   durmalı, ana sekans açılmalı, "Devam et" görünmeli. Paneli kapatıp aç (ya da Premiere'i yeniden
   başlat), Viral anlar kutusunu aç: "Devam et" yine görünmeli; basınca biten adımlar
   TEKRARLANMADAN kalan adımlar yapılmalı (aynı katman iki kez konmamalı).
8. **Sekans değiştirme:** paket çalışırken Premiere'de elle başka bir sekansa geç: o adım
   "Etkin sekans değişti; katman konmadı" hatasıyla düşmeli, paket diğer adımlarla sürmeli,
   hiçbir katman yanlış sekansa konmamalı. Sonra Devam et ile hatalı adım tamamlanmalı.
9. **Miras altyazı:** ana sekansa önce "Suflo Stilleri ile ekle" ile altyazı katmanı koy, sonra
   paketi çalıştır: 9:16 Short'larda kaynaktan kopyalanan (kırpık) altyazı klibi KAPALI (gri,
   Premiere'de sağ tık › Etkinleştir ile geri açılır) olmalı ve üstünde paketin 9:16 altyazısı
   ("Suflo Paket · Altyazı") olmalı; satırda "kaynaktan kopyalanan altyazı katmanı kapatıldı" notu.
   Çift altyazı olmamalı. Yatay pakette kopya katman kalır, altyazı adımı "atlandı" olur.
   Premiere'in kendi altyazı izi (Captions track) varsa Short'a da kopyalanır; panel bunu
   göremez, gerekirse elle sil.
10. **Başka sekansta bulunan anlar:** anları bulduktan sonra başka bir sekans aç, Paketi oluştur:
    "Viral anlar başka bir sekansta bulundu" uyarısı, hiçbir sekans oluşmamalı.
11. **Auto Reframe olmayan sürüm (14.4 / 22.x öncesi):** Paketi oluştur "yatay sekanslarla
    hazırlansın mı?" sorusu sormalı; Hayır → hiçbir şey olmamalı; Evet → yatay Shorts, katmanlar
    16:9 boyutunda.
12. **AI anahtarı yok:** Ayarlar'dan anahtarı sil, paketi çalıştır: metin adımı yine "tamam",
    TXT'de başlık = anın başlığı, açıklama = anın gerekçesi + `#shorts #keşfet #viral`.
13. **Groq kota (429):** çok sayıda Short (8-10) ile dene: metin adımları sırayla (aynı anda değil)
    çalışmalı; kota dolarsa panel bekleyip yeniden denemeli, en sonunda yedeğe düşmeli.
14. **Uzun Auto Reframe:** 90 sn'lik bir an ile dene: 600 sn içinde bitmezse panel sekansı adıyla
    bulup devam etmeli (aynı Short iki kez oluşmamalı). Bulamayıp adımı hata yaptıysa Auto Reframe
    bitince Devam et'e bas: "Suflo Shorts" kutusunda o Short'tan yine TEK yatay + TEK 9x16 olmalı.
15. **İngilizce arayüz:** Ayarlar › English: kutu "Shorts Pack", düğme "Create pack (N Shorts)",
    CTA seçenekleri İngilizce. Video Türkçe ise CTA videoya Türkçe yazılmalı ("Takip et"), TXT
    etiketleri İngilizce. Almanca / İspanyolca / Fransızca / Portekizce / İtalyanca / Rusça /
    Arapça / Azerice videoda hazır CTA o dilde; başka dilde İngilizce ve satırda not.
16. **Devam et başka videoda:** paketi yarıda İptal et, başka bir videoda Viral anlar bul, eski
    paketi Devam et ile sürdür: kalan Short'ların altyazısı İLK videonun konuşması olmalı.
    Yarım paket varken "Paketi oluştur": önce "Yarım kalan bir Shorts Paketi var…" sorusu gelmeli.
17. **libass'sız ffmpeg:** paket başlarken "altyazı, kanca, çerçeve atlanacak: …libass yok"
    bildirimi gelmeli; sonuç sarı ve "katmansız Short" saymalı, yeşil "hazır" dememeli.
18. **Hazırlanırken İptal:** "Hazırlanıyor…" yazarken İptal: hiçbir sekans oluşmamalı.

### 9.2 Bilinen sınırlar (bilerek kapsam dışı)

- AME kuyruğuna dışa aktarma yok (doğrulanabilir .epr yok); Short'ları Premiere'de Ctrl+M ile çıkar.
- Auto Reframe yoksa ortadan kırpma yedeği yok (setSettings doğrulanmadı); yatay paket önerilir.
- Bölünmüş ekran / ekran paylaşımı yerleşimleri sonraki sürümde.
- YouTube Shorts hashtag'leri 3 ile sınırlı (YouTube başlığın üstünde yalnız ilk 3'ü gösterir).

### 9.3 Tanıtım (isteğe bağlı)

- Ana demo: "1 video → 5 bitmiş Shorts, Premiere'in içinde, kredi yok". Ekran kaydı: Viral anları
  bul → Pakete al → Paketi oluştur → 5 Short'u art arda oynat → TXT'deki hazır metinler.
  OpusClip / Klap / Submagic karşılaştırmasında "dakika kredisi yok, video buluta gitmez" vurgusu.

## 10. Podcast Modu (mikrofona göre otomatik kamera geçişi + konuşmacı renkli altyazı)

Kod tamam ve testli; **senden anahtar, hesap ya da sunucu değişikliği istemiyor**. Pro özelliği
(`multicam`), deneme hakkı yok; analiz ve önizleme ücretsiz, timeline'a uygulamak Pro.
Kapsam v1 = "her konuşmacının kendi mikrofonu" (Mod A). Tek mikrofona karışık kayıtta konuşmacı
ayırma (Mod B), yüz takibi ve multicam kaynak sekansında açı değiştirme kapsam dışı. Premiere'de
**hiç denenmedi**; özellikle iki davranış doğrulanmadı ve kod ikisine de koruma koyuyor:
bağlı video klibini kapatmanın sesini de kapatıp kapatmadığı (ses durumu önce alınıp sonra geri
yüklenir) ve `KS_exportAudio`'nun tek katmanı susturma ile ayırması (susturulmuş istenen katman
geçici açılır, sonra geri yüklenir).

### 10.1 Deneme kaydı hazırla (yaklaşık 15 dk, bir kez)

1. İki kişilik 3-5 dakikalık bir sohbet kaydet: iki kamera (telefon da olur), **her kişiye ayrı
   yaka mikrofonu** (ya da iki kanallı kayıtta L / R ayrı). Bir bölümde ikiniz aynı anda konuşun
   (çapraz konuşma), bir bölümde biriniz 20 sn'den uzun tek başına konuşsun.
2. Premiere'de kameraları senkronla (Synchronize › Audio), her kamerayı ayrı video katmanına
   (V1 = sen, V2 = konuk), her mikrofonu ayrı ses katmanına (A1 = sen, A2 = konuk) koy. İstersen
   geniş plan için üçüncü bir kamerayı V3'e koy. Multicam kaynak sekansı KULLANMA.
3. Bu sekansı `Suflo Podcast Deneme` adıyla sakla; aşağıdaki liste ve tanıtım videosu bunu kullanır.

### 10.2 Premiere'de elle deneme (yaklaşık 30 dk; Premiere 24.x / 25.x ve 14.4 ayrı ayrı)

Liste `marketing/v3.1-deneme-listesi.md` › 8'de (ilk sürümü `v3-deneme-listesi.md` › 6c). Özellikle şunlara bak ve sonucu bana yaz:
- Uygulamadan sonra **ses katmanlarında kapanan klip var mı?** Varsa paneldeki son durum satırını
  ve Premiere sürümünü yaz (bağlı klip koruması o sürümde nasıl davrandı).
- **Ctrl+Z** ile kaç adımda geri alındığı (Premiere undo gruplamayı desteklemiyor; Kopyada
  uygula bu yüzden varsayılan).
- 1 saatlik bir podcast'te analiz süresi (mikrofon başına bir Premiere dışa aktarımı yapılır).
- `TrackItem.disabled` (klip aç / kapa) o sürümde çalışıyor mu? Panel hiçbir kesimden önce tek
  klipte dener ve geri alır; çalışmıyorsa "Bu Premiere sürümünde Suflo klipleri açıp kapatamıyor"
  der ve sekansa dokunmaz. Özellikle 14.4'te bu mesajı görürsen sürümü yaz.
- Kamera klipleri sesle bağlıyken (Ctrl+L ile koparmadan) **Bu sekansta** uygula: iki yönlü bağ
  varsa hata kesimlerden ÖNCE gelmeli, sekans parçalanmamalı.
- Kopyada uygula → En kısa planı değiştir → yeniden uygula (kopya açıkken): orijinalden yeni bir
  kopya oluşmalı, "sekansı yeniden tara" hatası çıkmamalı.

### 10.3 Bilinen sınırlar (bilerek kapsam dışı)

- Multicam kaynak sekansı: açıyı değiştirecek API yok, panel reddeder ve kameraları ayrı
  katmanlara koymayı söyler.
- Premiere'in kendi altyazı izi (SRT) renk taşıyamaz; konuşmacı renkleri yalnız Suflo Stilleri
  katmanında ve ASS dışa aktarımında.
- Analiz bellekte tutulur; panel kapanınca konuşmacı renkleri için yeniden analiz gerekir.
- Mikrofon dışa aktarılamazsa yalnız düz klipte (tek klip, birleşik / multicam değil, dosyası başka
  mikrofonla paylaşılmayan) dosyadan okuma yedeği var.

### 10.4 Tanıtım (isteğe bağlı)

- "AutoPod ayda 29 $; Suflo'da Podcast Modu tek seferlik Pro'nun içinde" karşılaştırması. Ekran
  kaydı: Sekansı tara → Analiz et → önizleme çubukları → Kopyada uygula → oynat.

## 11. Yayın toparlaması (3.1.0)

Kodda yapılanlar: paket sürümü 3.1.0, `marketing/release-notes.md` başına "Suflo 3.1.0" bölümü,
panelde "Suflo 3.1'de yeni" penceresi (Shorts Paketi, Podcast Modu, tek tık temizlik, viral puan,
Marka Kiti, Pro'yu dene, davet, English), Ayarlar'daki Ücretsiz / Pro listesinde Shorts Paketi ve
Podcast Modu, README'nin İngilizce bölümünde 3.1 özellikleri, İngilizce arayüzde upsell "örnek gör"
bağlantısı `suflo.app/en/pro.html`.

### 11.1 Yayından önce (yaklaşık 10 dk)

1. `marketing/release-notes.md`'deki 3.1.0 notunu oku, istersen kısalt; GitHub sürüm açıklamasına
   yalnız bu en üst bölüm gider.
2. Premiere'de 3.0 ayarları olan bir panelle aç: "Suflo 3.1" yenilikler penceresi bir kez çıkmalı,
   her satır ilgili sekmeyi ya da Ayarlar kartını açmalı (Podcast sekmesi, Marka Kiti, Davet et, kazan,
   Arayüz dili). Kapatınca bir daha çıkmamalı. Taze kurulumda rehber açıksa pencere çıkmamalı.
3. Arayüzü English yap, bir Pro düğmesinin upsell penceresinde örnek bağlantısının
   `suflo.app/en/pro.html`'i açtığını gör.

### 11.2 Site metinleri (Türkçe site hazır, İngilizce site sende; yaklaşık 20 dk)

Türkçe ana sayfa (`docs/index.html`) bu dalda 3.1 için güncellendi: duyuru şeridi "v3.1 yayında"
ve dört yeni özellik, ücretsiz kartında "Pro araçlarına 3 ücretsiz deneme · English arayüz (beta)",
Pro kartında tekrar çekim temizliği, 0–100 viral puan, Tek Tık Shorts Paketi, Podcast Modu ve
Marka Kiti satırları, JSON-LD `softwareVersion` 3.1.0 ve Pro açıklaması, ödeme bağlantılarında
`app_version=3.1.0`, `#surum` v3.1.0, site haritasında `lastmod`. "+ KDV", iade yok notu, erken
erişim geri sayımı ve "75+ içerik üreticisi" satırı olduğu gibi kaldı.

1. **Sıra önemli:** siteyi yayınlayan dala (main / GitHub Pages) bu değişiklikleri **3.1.0 GitHub
   sürümü yayınlandıktan sonra** al. Önce alırsan site henüz indirilemeyen özellikleri vaat eder
   (sayfa sürüm numarasını GitHub'dan canlı okuduğu için şeritte "v3.0.0" görünür).
2. Erken erişim geri sayımı `v3.0.0` etiketine bakıyor; yeni bir kampanya yapmayacaksan dokunma.
3. `docs/en/index.html`: aynı dört özelliği İngilizce ekle (One-click Shorts package, Podcast Mode,
   retake cleanup, Brand kit); JSON-LD'yi eşitle. (Bu dalda yapılmadı.)
4. `node tools/test.js` (SEO denetimi dahil) yeşil kalmalı.
5. Premiere'de elle deneme listesi: `marketing/v3.1-deneme-listesi.md`.

## 12. Hız Rampası (tek tıkla ağır çekim ve hızlanma; 3.2 adayı)

Kod tamam ve testli (`test-speedramp*.js`); **senden anahtar, hesap ya da sunucu değişikliği istemiyor**.
Pro özelliği (`speedramp`), 3 deneme hakkı (deneme listesi 9 → 10 araç); eğri kartları, canlı önizleme ve
"Rampayı kaldır" ücretsiz. Premiere'de **hiç denenmedi**.

Neden böyle kuruldu (kısa): Premiere, Zaman Yeniden Eşleme'yi eklentilere açmıyor (bileşen
`components`'ta yok, UXP'de yok, QE `addVideoEffect("Time Remapping")` bir şey eklemiyor). Suflo aralığı
kareye oturan 3–28 parçaya bölüp her parçaya QE `setSpeed` ile kendi sabit hızını yazıyor; sonuç Hız/Süre
ile düzenlenebilen sıradan klipler. Aralığın yeri ve süresi hiç değişmez (ripple yok; tek izde ripple
senkronu bozardı). Ses aralıkta kapatılır ya da olduğu gibi bırakılır; sesi hızlandırma kapsam dışı.
`setSpeed`'in imzası ve birimi belgesiz: host bir kalibrasyon merdiveniyle dener (5/3/2/1 argüman, oran ya
da yüzde), her adımı geri okur, tutmazsa klibi tek %100 klibe geri getirir; bulunan biçim sürüm başına
panelde saklanır. Ctrl+Z rampayı tek adımda geri almaz (Premiere'de undo gruplama yok); bu yüzden
"Rampayı kaldır" ve bildirimdeki "Geri al" var, ilk denemede de "Önce sekansı kopyala" kendiliğinden işaretli.

İnceleme düzeltmeleri (kısa): her parça TAM hızına yukarıdan yaklaşılarak yazılır (hızlanma süreyi tam
kareye yuvarlar, yavaşlama tam yazar), uç yalnız o hızda ve yalnız gerektiği kadar uzatılır: Dengeli, klibin
Out'u medyanın sonu olsa da (kırpılmamış kuyruk) medya istemez. "Rampayı kaldır" hiçbir parçayı silmeden önce
ilk parçayı %100'e alır (QE yoksa ya da hız yazılamazsa hiçbir şey silinmez); birimi bilinmeyen sürümde birim
silinecek son parçada yoklanır. In/Out rampadan sonra dış video parçaları kendi seslerine yeniden bağlanır.
Arayüz adları: yoğunluk **Hafif / Normal / Güçlü** (tasarım notundaki Hafif / Orta / Sert değil: sözlükte "Orta"
altyazı konumu olarak "Middle", "Sert" "Hard" çevriliyor; "Güçlü" Sesi iyileştir'deki yoğunlukla aynı dil).
Vuruş anı seçeneği müzik vuruşuyla karışmasın diye "Darbe anını playhead'e hizala"; aradeğerleme seçicisi
"Yavaş parçalarda: Kare harmanlama / Optik akış / Aradeğerleme yok".

### 12.1 Premiere'de elle deneme (yaklaşık 45 dk; 26.x / 25.x, mümkünse 22.x–24.x ve 14.4 ayrı ayrı)

Liste `marketing/v3.1-deneme-listesi.md` › 13'te. Sonucu bana yazarken özellikle şunları ekle:
- Doctor'da hangi Hız Rampası satırının sarı çıktığı ve Premiere sürümü.
- Günlükteki `cal` (units: ratio / percent, sig: 5 / 5d / 3 / 2 / 1) ve ilk rampanın kaç `setSpeed`
  denemesi sürdüğü. 14.x'te imza ne çıktı?
- Bir rampanın Ctrl+Z ile kaç adımda geri alındığı ve günlükteki `undoSteps`.
- Yavaşlatılan bir parçada Premiere süreyi korudu mu, yoksa boş alana uzadı mı (QE `setSpeed` ikinci
  argümanı ""). Hızlı parçalarda inPoint / outPoint okumaları ölçekli mi?
- Bağlı seste "Rampada sesi kapat" sonrası aralık dışındaki sesin hâlâ bağlı olup olmadığı.
- İç içe sekans öğesi ve kenarında cross dissolve olan klip ne yaptı.

Eğer bir sürümde QE `setSpeed` hiç yoksa ya da kalibrasyon hep başarısız oluyorsa (Doctor'da "QE hız
yazma (setSpeed)" sarı), söyle: o zaman ffmpeg ile render edilen sürekli eğri yolu (Katman 2) yapılır.
Premiere bir gün Zaman Yeniden Eşleme'yi betiklere açarsa Doctor "Zaman Yeniden Eşleme API'si açık"
der; o zaman gerçek anahtar kareler (Katman 3) yazılabilir.

### 12.2 Sürüm (3.2.0) — bu dalda bilerek yapılmadı

`CSXS/manifest.xml` 3.1.0'da kaldı ve `marketing/release-notes.md`'nin ilk satırına dokunulmadı:
`yayinla.yml`, main'e her gönderimde manifest sürümünün GitHub'da yayını yoksa otomatik yayınlıyor.
Elle denemeden sonra 3.2.0'a geçerken birlikte yap: manifest ve `js/bridge.js` sürümü, release-notes'un
başına "Suflo 3.2.0" bölümü, `js/app.js` YENILIKLER (surum + Hız Rampası satırı), rehberin yedek metni ve
`tests/test-yenilikler.js` beklentileri; README'de *(3.2)* etiketleri zaten var.

### 12.3 Bilinen sınırlar (bilerek kapsam dışı)

- Basamaklı: parçalar sabit hızda (Normal'de en çok 16, Çok'ta 28 parça); gerçek sürekli eğri yok.
- Ses hızlandırılmaz; "Sesi olduğu gibi bırak"ta rampa içinde kayar, Dengeli'de aralık sonunda yine senkron.
- Rampadan sonra eklenen zoom / geçiş anahtarları parça başına doğrusal eşlenir: önce rampa, sonra zoom.
- Kaldırmadan sonra T0/T1'de ve seste görünmez kesikler (through-edit) kalır; iki yan %100, kaynak sürekli.
- Kısa (12 kareden az) klip, fotoğraf, grafik/MOGRT, ayar katmanı, ters, hızı değişmiş, Zaman Yeniden
  Eşlemeli, Warp Stabilizer'lı, multicam ve kilitli izdeki klipler reddedilir.

### 12.4 Tanıtım (isteğe bağlı)

- "Premiere'de hız rampası için keyframe sürüklemek yok: eğriyi seç, uygula, Hız/Süre'de düzenle." Ekran
  kaydı: Darbe kartı → playhead'i vuruş anına koy → Uygula → oynat. Ritme Rampa için müzikli bir B-roll.
- Önayar adları genel (Ağır Çekim Dalışı, Darbe…); rakip ya da kişi adıyla anılan önayar adı kullanma.


---

## 3.2

Altı açık kaynak projeden (`marketing/alti-repo-plan.json`, `plan.build_order`) gelen 3.2 adımları.
Her adım kendi alt bölümünü ekler. Elle Premiere denemeleri `marketing/v3.2-deneme-listesi.md`'de.

### Adım 1: Ölçülmüş kelime zamanları (-ojf)

Ne değişti: yerel motor artık `-oj` yerine `-ojf` ile çalışıyor; whisper.cpp JSON'a belirteç başına metin,
zaman ve olasılık yazıyor. `js/whisper-words.js` bunları kelimelere çeviriyor (Raunen'den uyarlandı, MIT,
`THIRD_PARTY_NOTICES.md`). Karaoke için ikinci "-ml 1 -sow" turu kalktı (yalnız belirteç yazmayan eski
derlemede yedek olarak duruyor), yerel motorun güven değeri geri geldi, satır ve kelime modu aynı
önbellek girdisini paylaşıyor. Ücretsiz; senin girdin olmadan da tam çalışır.

İnceleme düzeltmeleri (bilmen gereken davranışlar):
- **Konuşmadan kes altyazının transkriptini kullanmaz.** Dolgu ipucuyla ("Iıı, eee, hmm…") ister; altyazı
  ipucusuz yazıya döküldüğü için o transkriptte dolgular çoğu zaman yok. Altyazıdan sonra Konuşmadan kes
  yine bir kez yazıya döker (3.1'de karaoke sonrası kullanıyordu, artık hiç kullanmaz); ikinci açılış
  kendi "dolgu" girdisinden anında gelir. Hız için geri almak istersen `js/transcript-cache.js` › `istemler`.
- **Shorts kayıtları ölçülmüş kelime taşımaz.** `settings.json` her ayar kaydında baştan yazılıyor; kelimeler
  dosyayı ~5 kat şişiriyordu. Shorts altyazısında kelime stilleri karakter oranıyla akar (3.1'deki gibi).
- **VAD'siz koşu** (Silero modeli inmemiş): kelime zamanları whisper'ın belirteç zamanlarından aynen alınır.
- **Boşluklu tire** (" - ", " — ") kendi kelimesidir; önceki kelimeye yapışmaz ("Evet-" olmaz).

**1.1 Gerçek bir -ojf fikstürü ekle (önerilir, yaklaşık 20 dk).**
Bu oturumda internet kısıtlıydı (Hugging Face'e erişim yoktu, model indirilemedi), bu yüzden
`tests/fixtures/whisper-*.json` whisper.cpp v1.9.1'in `examples/cli/cli.cpp` `output_json(full=true)`
biçimiyle birebir, elle kısaltılmış örnekler. Segment-belirteç düzeni `src/whisper.cpp` v1.9.1'den alındı
(pencerenin ilk segmenti dışında başlangıç zaman belirteci yok, ilk metin belirtecinin zamanı segment
başıyla tutmayabilir; VAD'siz örnek `whisper-ojf-vadsiz.json`). Yine de gerçek bir koşu, CI'ın göremediği
biçim farklarını yakalar. Gerçek bir koşunun çıktısı eklenirse `tests/test-whisper-words.js` onu kendiliğinden bulur ve
değişmezleri (her satırda kelime ve güven var, kelime metni satır metniyle tutuyor, kelimeler satırın içinde
ve sıralı) onda da sınar; dosya yokken o bölüm "ATLA" der.

1. "değil", "ışık", "şimdi", "güzel" gibi kelimeler geçen, arada 1–2 sn duraklama olan ~20 sn'lik Türkçe
   bir konuşma kaydet (kendi sesin; telif yok). Örn. "Bu ışık hiç de kötü değil, değil mi? Şimdi kamerayı
   biraz sola çevirelim. … Güzel. Peki, sonra tekrar deneyelim!"
2. 16 kHz mono WAV'a çevir:
   `ffmpeg -i kayit.m4a -ac 1 -ar 16000 -c:a pcm_s16le ornek-ojf.wav`
3. Suflo'nun kurduğu motorla çalıştır (VAD açık: Suflo'nun varsayılanı):
   - Windows (PowerShell):
     `& "$env:APPDATA\Kesit\whisper\whisper-cli.exe" -m "$env:APPDATA\Kesit\whisper\models\ggml-large-v3-turbo-q5_0.bin" -f ornek-ojf.wav -l tr -ojf -pp -bs 5 --vad -vm "$env:APPDATA\Kesit\whisper\models\ggml-silero-v5.1.2.bin" -vsd 500 -vp 250 -of whisper-ojf-tr-gercek 2> whisper-ojf-tr-gercek.stderr.txt`
     (`whisper-cli.exe` `whisper\Release\` altındaysa o yolu kullan; model adı Ayarlar'da seçili modele göre değişebilir.)
   - macOS: `whisper-cli -m "$HOME/Library/Application Support/Suflo/whisper/models/ggml-large-v3-turbo-q5_0.bin" -f ornek-ojf.wav -l tr -ojf -pp -bs 5 --vad -vm "$HOME/Library/Application Support/Suflo/whisper/models/ggml-silero-v5.1.2.bin" -vsd 500 -vp 250 -of whisper-ojf-tr-gercek 2> whisper-ojf-tr-gercek.stderr.txt`
   (`2>` stderr'i dosyaya yazar: içindeki `vad_segment_info` satırları whisper'ın VAD eşleme tablosu; panel
   aynı satırlarla belirteç zamanlarını özgün sese taşır.)
4. Çıkan `whisper-ojf-tr-gercek.json`'da `"params"` içindeki `"model"` satırı kendi kullanıcı adını içeriyorsa
   yolu `models/ggml-large-v3-turbo-q5_0.bin` yap. Başka bir şeye dokunma (fikstür ham kalmalı).
5. İki dosyayı `tests/fixtures/whisper-ojf-tr-gercek.json` ve `tests/fixtures/whisper-ojf-tr-gercek.stderr.txt` olarak koy
   (stderr'de kendi kullanıcı adın geçen yolları `models/...` yap), `node tests/test-whisper-words.js` çalıştır:
   "gerçek -ojf" ile başlayan üç satır PASS olmalı. Kaldıysa günlükle birlikte bana yaz (VAD zaman tabanı
   ya da yeni bir belirteç biçimi olabilir). Sonra commit'le.
6. Aynı WAV'ı **VAD olmadan** bir kez daha çalıştır: 3. adımdaki komuttan `--vad -vm "…" -vsd 500 -vp 250`
   kısmını sil ve `-of whisper-ojf-tr-gercek-vadsiz` yap (stderr gerekmez). Çıkan JSON'u 4. adımdaki gibi
   temizleyip `tests/fixtures/whisper-ojf-tr-gercek-vadsiz.json` olarak koy; "gerçek -ojf (VAD'siz)" satırı
   PASS olmalı. İki fikstür de eklenince test o bölümü artık "ATLA" demez.

**1.2 macOS Homebrew motorunu doğrula (yaklaşık 5 dk).** `whisper-cli --help | grep ojf` bir satır
göstermeli. Göstermiyorsa ya da Ayarlar › Destek › Günlüğü kopyala'da kelime modunda
"yerel motor belirtec zamani vermedi (eski derleme?)" satırı görünüyorsa `brew upgrade whisper-cpp` yap.
Eski derlemede de çalışır (eski "-ml 1 -sow" turuna düşer), yalnız iki kat sürer ve satır modunda kelime
zamanı / güven olmaz.

**1.3 3.2.0 sürüm notu.** Sürüm 3.2.0'a geçerken (`## 12.2` ile birlikte) `marketing/release-notes.md`'nin
3.2.0 bölümüne şu satırı ekle: "Yerel motor her transkriptte kelime zamanlarını ölçüyor: kelime kelime
altyazı tek turda, kelime stilleri satır modunda da gerçek konuşma anında, yerel motorda da 'emin değil'
uyarısı." `js/app.js` YENILIKLER listesine istersen aynı satırın kısası.

**1.4 Paketi doğrula.** `tools/package.ps1` ve `tools/kurucu-yap.ps1` artık `THIRD_PARTY_NOTICES.md`'yi
pakete koyuyor; `tools/verify-release.ps1` ZXP'de ya da kurulum ZIP'inde `LICENSE` veya
`THIRD_PARTY_NOTICES.md` yoksa yayını durduruyor. Yayından önce `verify-release.ps1`'in yeşil bittiğini gör.

### Adım 2: Ses etiketi filtresi ve sessiz ses uyarısı

Ne değişti: `js/caption-text.js` Whisper'ın konuşma dışı etiketlerini (`[BLANK_AUDIO]`, `[Müzik]`, `(alkış)`,
`*laughs*`, yalnız ♪ satırları; Türkçe ve İngilizce sözlük) yeni transkriptlerden atıyor; karışık satırda
yalnız etiket siliniyor, `*vurgu*` gerçek kelimelerde kalıyor. Kalıplar Raunen'den uyarlandı (MIT,
`THIRD_PARTY_NOTICES.md` Raunen girdisine `js/caption-text.js` eklendi). Ayarlar'da yeni **Altyazı** kartı:
"Ses etiketlerini koru" (varsayılan kapalı) etiketleri `[Müzik]` biçiminde tutar. Yeni `js/sessiz-ses.js`
motor çalışmadan önce sesin tepesini ölçüyor (WAV 1 MB parçalarla; bulut MP3'ünde aynı ffmpeg geçişinde
`volumedetect`); tepe 0,001'in altındaysa Altyazı ya da Konuşmadan kes kartında "Yine de devam et" /
"Vazgeç" soruluyor. Ücretsiz; senin girdin olmadan tam çalışır, harici şablon ya da hesap gerekmez.

Bilmen gereken davranışlar:
- whisper-cli'nin `-sns` (konuşma dışı belirteç bastırma) bayrağı **bilerek kullanılmadı**: noktalama
  benzeri belirteçleri de bastırıyor. Filtre transkripsiyondan sonra metinde çalışır.
- Filtre yalnız **yeni transkriptlerde** çalışır; taslaktan kurtarılan, SRT'den içe alınan ya da elle yazılan
  satırlara dokunmaz.
- **Konuşmadan kes'in kelime listesi filtrelenmez**: `[Müzik]` kelimesi orada konuşma gibi kalır, böylece müzikli
  bölümler duraksama sayılıp kesilmez (3.1 davranışı).
- Toplu klipte sessiz klip için **bir kez** sorulur; soru klibin adını ve sırasını ("klip 2/6 (ad)") söyler ve
  kararın sonraki sessiz kliplere de uygulanacağını yazar. "Vazgeç" sessiz klipleri atlar, diğerleri işlenir.
- Soru açıkken ilerleme çubuğu durur. Kullanıcı başka sekmedeyse ~20 sn'lik sarı bildirim ve "Uyarıyı göster"
  düğmesi çıkar (iş cevap bekliyor; kullanıcı hâlâ yazıya döküldüğünü sanmasın).
- Bulut rotasında tepe, yüklenen sesle aynı biçimde (mono, 16 kHz) ölçülür: ters fazlı stereo gibi mono'da
  sıfırlanan ses de uyarı verir.
- Etiket satırı (atılsa da tutulsa da) "3+ aynı satır = takılma" zincirini keser: alkışla ayrılmış aynı cümle
  atılmaz; koru ayarı konuşma satırlarını değiştirmez. Koru açıkken art arda `[Müzik]` satırları takılma sayılmaz.
- Transkriptte yalnız ses etiketi varsa (koru kapalı) kırmızı "Konuşma bulunamadı." yerine sarı uyarı
  Ayarlar › Altyazı › Ses etiketlerini koru'yu gösterir. "Vazgeç" ya da hata, ekrandaki belgenin algılanan dilini
  silmez.
- Uyarı metni sekans kapsamında "Altyazı › Ses katmanları" der (panelde kartın adı bu; planda "Ses kanalları"
  geçiyordu). Seçili klip kapsamında ayrı bir metin klibin kaynağını anlatır (orada katman seçimi yok).

**2.1 Premiere'de dene (yaklaşık 15 dk).** `marketing/v3.2-deneme-listesi.md` › `## 2` maddeleri.

**2.2 3.2.0 sürüm notu.** Sürüm 3.2.0'a geçerken `marketing/release-notes.md`'nin 3.2.0 bölümüne şu satırı ekle:
"Altyazıda [Müzik], (alkış) ve ♪ gibi ses etiketleri artık çıkmıyor (erişilebilirlik için Ayarlar › Altyazı ›
Ses etiketlerini koru). Ses neredeyse tamamen sessizse motor çalışmadan önce uyarı: sessize alınmış katmanlar
için dakikalarca beklemek ya da API kotası harcamak yok." `js/app.js` YENILIKLER listesine istersen kısası.

### Adım 3: Canlı transkripsiyon, İptal ve kalan süre

Ne değişti: yerel motor çalışırken whisper-cli'nin her segmenti bitirince stdout'a yazdığı
`[00:00:01.380 --> 00:00:04.000]  metin` satırları (Suflo `-np` vermez) Altyazı oluştur'un altında soluk, salt
okunur, "canlı" rozetli geçici satırlar olarak akıyor (`js/whisper-akis.js`, yeni saf modül). Durum satırı
`-pp` yüzdelerini yumuşatıp kalan süreyi ve gerçek zaman çarpanını söylüyor:
`12 satır · %34 · ~1 dk 20 sn kaldı · 3,1× gerçek zaman`. İş sürerken **İptal** düğmesi "Altyazı oluştur"un yerine
geçiyor; `K.run` iptalde Windows'ta `taskkill /pid N /T /F` (süreç ağacı), macOS'ta `SIGKILL` gönderiyor. Aynı
iptal jetonu motor/model/ffmpeg indirmelerinde (Ayarlar'ın yerel çekirdek ve ffmpeg satırlarında ve kurulum
kartında "İptal"; yarım `.part` korunur) ve
Otomatik Kesim'in ffmpeg analizinde de var. Fikirler Premiere TR ve Raunen'den (MIT), kod Suflo'nun kendi:
`THIRD_PARTY_NOTICES.md` değişmedi. Ücretsiz; senin girdin olmadan tam çalışır, harici şablon ya da hesap gerekmez.

Bilmen gereken davranışlar:
- **Geçici satırlar belge değildir.** Taslağa, geri al yığınına ve transkript önbelleğine girmez; motor bitince
  yerini `-ojf` JSON'undan kurulan nihai satırlar alır. Bu yüzden canlı satırla nihai satırın bölünmesi farklı
  olabilir (nihai satırlar satır uzunluğu ayarına göre yeniden kurulur, sözlük uygulanır).
- **Bulut motoru (Groq/OpenAI) akış vermez**; canlı kutu açılmaz, İptal yalnız yüklemeyi keser. Kelime kelime
  için eski `-ml 1` yedeğine düşen eski derlemelerde (belirteç zamanı yok) o tur akış göstermez.
- **Takılma kurtarması**: takılma noktasından sonraki (tekrarlanan) geçici satırlar silinir, kalan kısım kendi
  ofsetiyle akar. Planda "temizle" yazıyordu; takılmadan önceki doğru satırlar ekranda kalsın diye yalnız
  takılmadan sonrası silinir.
- **Ses dışa aktarımı** (sekans / In-Out) Premiere'de senkron ExtendScript: o sırada İptal kapalıdır, ipucu
  nedenini söyler. Bitince açılır.
- **İptal hiçbir şeyi yarım bırakmaz**: geçici WAV/MP3 ve whisper JSON'u silinir, ekrandaki altyazı ve taslak
  olduğu gibi kalır, toplu klipte işlenmiş klipler de uygulanmaz, yerel iptal bulut yedeğine geçmez (ses
  yüklenmez). Sessiz ses sorusu açıkken İptal soruyu kapatır.
- **Kalan süre tahmindir**: whisper.cpp yüzdeyi ~30 sn'lik ses pencerelerinde ve %5 adımla bildirir; arada
  gözlenen hızla ilerlenir, sonraki beklenen bildirim geçilmez. VAD sessizlikleri attığı için yüzde konuşma
  süresine göredir; çok sessiz kayıtta tahmin ilk dakikada oynak olabilir.
- **İndirme iptali**: rehber ffmpeg'i arka planda kuruyorken Altyazı oluştur'un İptal'i yalnız altyazı işini
  durdurur; arka plandaki indirme sürer (işi başlatan iptal eder). İptal edilen altyazı işinin durum satırı o
  indirmenin ilerlemesini artık almaz ("İptal edildi." ekranda kalır; yüzde Ayarlar › ffmpeg satırında akar).
  Ayarlar'dan başka bir kurulumun indirmesini bekleyen İptal (ör. rehberin Turbo indirmesi sürerken Ayarlar'da
  Turbo "İndir & kur") "Bekleme iptal edildi — başka bir kurulum indirmeye devam ediyor." der; "İndirme iptal
  edildi" yalnız indirme gerçekten durduğunda görünür. GPU ısınması başarısız olunca inen CPU motoru da aynı
  İptal'le kesilir (yarım dosya korunur, "Hazır" denmez).
- **Çift tıklama koruması**: İptal, başlatma düğmesinin ("Altyazı oluştur", "Sessizlikleri bul", "İndir & kur")
  yerinde belirir. Göründükten sonraki ~0,5 sn içindeki tık ve çift tıkın ikinci tıkı yok sayılır; yoksa çift tık
  yeni başlayan işi anında iptal ediyordu. Klavyeyle (Enter/Boşluk) basış her zaman geçerli.
- **macOS Homebrew ffmpeg**: Ayarlar › ffmpeg'de Homebrew kurulumu sürerken İptal görünmez (brew yarıda
  kesilirse yarım paket kalabilir); Homebrew kuramazsa başlayan doğrudan indirmede İptal çıkar.

**3.1 Premiere'de dene (yaklaşık 25 dk).** `marketing/v3.2-deneme-listesi.md` › `## 3` maddeleri. En önemlileri
3.6 (iptalden sonra Görev Yöneticisi'nde `whisper-cli.exe` / `ffmpeg.exe` kalmıyor) ve 3.14 (iptal edilen model
indirmesi kaldığı yerden devam ediyor).

**3.2 macOS'ta satırlar akıyor mu? (yaklaşık 5 dk).** whisper.cpp segment satırını yazdıktan sonra `fflush(stdout)`
yapıyor; Homebrew derlemesinde de öyle olmalı. Deneme listesi 3.19'da satırlar iş sonunda topluca geliyorsa
Terminal'de şunu çalıştır ve satırların teker teker mi geldiğine bak:
`whisper-cli -m "$HOME/Library/Application Support/Suflo/whisper/models/ggml-large-v3-turbo-q5_0.bin" -f ornek.wav -l tr -pp | cat`
Teker teker geliyorsa panelde başka bir sorun var (günlüğü bana gönder); topluca geliyorsa `brew upgrade whisper-cpp`
yap. Her iki durumda da altyazı ve İptal çalışır; yalnız canlı satırlar sonda görünür.

**3.3 3.2.0 sürüm notu.** Sürüm 3.2.0'a geçerken `marketing/release-notes.md`'nin 3.2.0 bölümüne şu satırı ekle:
"Altyazı çıkarırken satırlar canlı akıyor, kalan süre ve hız görünüyor; uzun bir işi İptal ile anında durdurabilirsin
(geçici dosyalar silinir, ekrandaki altyazın bozulmaz). Motor ve model indirmeleri de iptal edilebilir ve kaldığı
yerden devam eder." `js/app.js` YENILIKLER listesine istersen kısası.

### Adım 4: Okunabilir altyazı düzeni (kelimeden satır, 2 × 42, kısa parça birleştirme, kelime hizalama)

Ne değişti: yeni saf modül `js/caption-layout.js`. Satır modunda (Satır uzunluğu 32 / 42 karakter ve yeni
**2 satır × 42 (YouTube/TV)**) altyazılar yerel motorun ölçülmüş kelime zamanlarından kuruluyor: karakter sınırı,
isteğe bağlı **Kelime sınırı** (2–12), 0,6 sn'den uzun duraklama, cümle sonu ve en uzun süre satırı kırıyor; aynı
satır sayısıyla dengeleniyor (iki satır 38/4 değil 21/21). **Ayarlar › Altyazı**'ya en kısa / en uzun süre (0,8 / 6 sn)
ve "Kısa parçaları birleştir" (varsayılan açık) geldi. Caption Editor'da **Shift+Enter** satır içinde alt satıra geçer,
metin düzeltmesi kelime zamanlarını LCS ile yeni metne hizalar (AI kontrolü, sözlük, bul & değiştir de), zaman
alanı "başlangıç – bitiş" kabul eder ve kelimeleri ölçekler. SRT/VTT iki satırı tek cue'ya yazar, ASS `\N`; satır
modunda ASS karaoke dolgusu gerçek kelime zamanlarından. Belgesel stilinin iki satır bölmesi aynı işlevi
(`ikiyeBolNoktasi`) kullanıyor; stil çıktısı bayt bayt aynı (`tests/style-engine-snapshot.json`). Raunen'in `wrapText`
ve `shapeSegments` birleştirme / bölme / süre geçişleri uyarlandı (MIT, `THIRD_PARTY_NOTICES.md` Raunen girdisine
`js/caption-layout.js` eklendi); kelimeden satır kurma ve LCS hizalama Suflo'nun kendi kodu (Animated Captions /
TranscriptAI'dan yalnız fikir, kod yok). Ücretsiz; senin girdin olmadan tam çalışır, harici şablon ya da hesap gerekmez.

Bilmen gereken davranışlar:
- **Menü değerleri değişti:** "32 / 42 karakter" artık `l32` / `l42` (kelimeden satır). 3.1 tercihleri, şablonlar
  (`maxlen: "c42"`) ve stil kodları açılışta aynı menü girdisine eşlenir. Paylaşılan stil kodu 3.1 uyumlu kalsın diye
  `l42` koda `c42` olarak yazılır; `c42x2` 3.1'de "geçersiz ayar atlandı" uyarısıyla satır uzunluğu olmadan açılır.
  "60 karakter" (`c60`) eski yolla çalışır.
- **Kelime zamanı yoksa** (bulut satır modu, eski önbellek, SRT içe alma) 32 / 42 karakter 3.1'deki gibi çalışır;
  yalnız eski eşit kelime bölmesi yerine karakter bütçesiyle bölünür (bir parça artık satır uzunluğunu aşmaz).
  2 satır × 42 aynı yolu iki satırlık bütçeyle izler. Kelime sınırı bu yolda etkisizdir.
- **En kısa / en uzun süre ve birleştirme** yalnız satır modlarında (32 / 42, 2 × 42) ve yeni transkriptlerde geçerli;
  kelime kelime, N kelime ve 60 karakter değişmedi. Kısa satır yalnız sonraki satıra kadar BOŞ zamana uzar (0,08 sn
  boşluk bırakır), satırlar hiç üst üste binmez.
- **Elle eklenen kırılım** (Shift+Enter) her satır modunda kabul edilir; kalite denetimi her satırı ayrı sayar
  ("Satır çok uzun" satır başına). 2 satır × 42'de "Nizami düzelt" uzun satırı bölmek yerine iki satıra kırar.
- **SRT içindeki satır sonu artık CRLF** (dosyanın geri kalanı gibi; çift dilli SRT dahil). Çift dilli altyazıda her dil
  tek satıra indirilir (4 satırlık cue olmasın). TXT'de her altyazı tek satır. SRT/VTT **içe alırken** çok satırlı
  cue'lar 3.1'deki gibi tek satıra birleşir (bilinen sınır).
- **Diğer araçlar** (bölümler, viral anlar, zoom, SFX, kanca) altyazı metnini tek satır alır; çeviri satır kırılımını
  modele gönderir, kırılımı korumayabilir (çeviride kelime zamanları zaten düşer, 3.1 gibi).
- **Satır modunda karaoke**: Suflo Stili seçmeden ince ayardaki Animasyon'da "Karaoke dolgu" / "Akıcı dolgu" artık
  yerel transkriptte satır modunda da seçilebilir; ASS'te her satır tek olay, `\k` süreleri satır başından birikimli
  yuvarlanır. Kelime zamanı olmayan transkriptte bu seçenekler eskisi gibi soluk ve fade'e düşer.

**4.1 Premiere'de dene (yaklaşık 25 dk).** `marketing/v3.2-deneme-listesi.md` › `## 4` maddeleri. En önemlisi **4.3**:
2 satır × 42 altyazıyı "Normal altyazı izi ekle" ile uygula ve Premiere altyazı izinde cue'nun iki satır göründüğünü
doğrula (`KS_importSrtAsCaptions` değişmedi; Premiere SRT'deki CRLF satır sonunu satır kırılımı sayıyor). Premiere iki
satırı tek satıra yapıştırırsa ya da iki ayrı cue yaparsa: Premiere sürümünü ve dışa aktarılan SRT'yi (Dışa aktarma ›
SRT › indir) bana gönder; o arada kullanıcılar 42 karakter modunu kullanabilir (iki satır yalnız seçilirse oluşur).

**4.2 Varsayılan değerler (isteğe bağlı, 5 dk).** En kısa 0,8 sn / en uzun 6 sn / birleştirme açık / kelime sınırı 0
Netflix-YouTube önerilerine yakın. Kendi kanalında farklı bir varsayılan istersen (ör. en uzun 7 sn) `index.html`'deki
`set-min-sure` / `set-max-sure` `value`'sunu ve `js/app.js` `altyaziSureAyarlari` varsayılanını birlikte değiştir.

**4.3 3.2.0 sürüm notu.** Sürüm 3.2.0'a geçerken `marketing/release-notes.md`'nin 3.2.0 bölümüne şu satırı ekle:
"Satır modunda altyazılar artık kelime zamanlarından kuruluyor: cümle sonunda ve duraklamada kırılan, dengeli
satırlar; yeni '2 satır × 42 (YouTube/TV)', kelime sınırı ve Ayarlar › Altyazı'da en kısa / en uzun süre. Metni
düzelttiğinde kelime zamanları kaybolmuyor; Shift+Enter satır içinde alt satıra geçiyor." `js/app.js` YENILIKLER
listesine istersen kısası.

### Adım 5: Yerel motor seçenekleri (Hızlı / En doğru, DTW hassas kelime, çevrimdışı İngilizce)

Ne değişti: argüman kurma yeni saf modülde (`js/whisper-args.js`; `KEngine.buildArgs` ona devreder, ASCII-güvenli
yol eşlemesi aynı). **Ayarlar › Çözme**: En doğru (bugünkü `-bs 5`, varsayılan) ya da Hızlı (`-bs 1 -bo 1`; sıcaklık
geri dönüşü açık), yerel motorun her koşusunda. Altyazı kartında **Hassas kelime zamanlaması (DTW, biraz daha
yavaş)**: yalnız yerel motor + kelime tabanlı mod (kelime kelime, birikimli, N kelime) ya da kelime tabanlı Suflo
Stilinde görünür; motor `-dtw <ön ayar> -nfa` ile çalışır (tiny, base, small, large.v3.turbo, large.v3) ve
`js/whisper-words.js` kelime başını `t_dtw / 100` sn alır; sonu kelimenin kendi belirteç sonu (DTW kaymasıyla),
sonraki kelimenin başıyla sınırlı — 0,3 sn'ye kadar boşluk kapanır, daha uzun duraklama (ve VAD'in attığı sessizlik)
korunur, son kelime segment sonuna uzamaz. (İlk sürüm sonu sonraki kelimenin başı alıyordu: duraklamada kelime
ekranda kalıyor, 3 kelime / iki satır modları duraklamada bölünmüyordu; inceleme düzeltmesi.) Dil satırında
**İngilizceye çevir (çevrimdışı)**: `-tr`, yalnız Small ve Large. **Suflo Doctor** çözme modunu ve DTW desteğini
gösterir. Çözme ve DTW **ücretsiz**; çevrimdışı İngilizce **Pro** — yeni özellik anahtarı `offlineTranslate`, 3 deneme
hakkı (deneme listesi 10 → 11 araç, Ayarlar › Suflo Pro'daki tablo kendiliğinden gösterir). Raunen'den (MIT) yalnız
fikir (bayrakları açmak); kod Suflo'nun kendi, clean-room (Raunen'in DTW yolu `-nfa` vermiyor, `t_dtw` okumuyordu).
Kıyas aracı: `tools/motor-kiyas.js`.

Benim doğruladıklarım (bu ortamda HuggingFace kapalıydı, gerçek modelleri indiremedim): whisper.cpp v1.9.1'i
kaynaktan derledim. Yardım metni (`tests/fixtures/whisper-cli-v1.9.1-yardim.txt`) flash attention'ın varsayılan
**açık** olduğunu gösteriyor. q5_1 olarak nicemlenmiş (rastgele ağırlıklı) bir tiny dosyasında: `-dtw tiny` tek başına
"dtw_token_timestamps is not supported with flash_attn - disabling" yazıp bütün `t_dtw`'leri -1 bırakıyor; `-nfa` ile
`t_dtw ≥ 0` geliyor (santisaniye), `--vad` ile de (VAD tablosuyla eşleniyor); `-tr` JSON'a `"translate": true` yazıyor.
CPU'da 66 sn seste DTW'nin kendi ek yükü ~%3, `-nfa` dahil ~%6 çıktı ama bu rastgele ağırlıklı (anlamsız metin
çözen) tiny dosyasındaydı: temsilî değil, README'de verilmiyor (hız tablosunun "+ DTW" satırı 5.1'deki ölçümünü
bekliyor). Gerçek koşu çıktısı panelin ayrıştırıcısından geçti. Gerçek Turbo / Large / Small dosyalarında DTW'nin çalıştığını ve Türkçe hız / doğruluğu SEN ölçeceksin (5.1, 5.2).

Bilmen gereken davranışlar:
- **Varsayılan "En doğru" kalıyor**, kıyas (5.1) yapılana dek. Raunen'in ~13× / 1,4× iddiası Türkçe için doğrulanmadı.
- **DTW otomatik kapanır:** motor `t_dtw` vermezse (hepsi -1) ya da derleme `-dtw` / `-nfa` tanımazsa (eski Homebrew;
  o zaman aynı ses DTW'siz yeniden çözülür) o **model + derleme** için kapanır (`settings.json` › `dtwKapali`, ör.
  `"turbo@cuda"`), günlüğe yazılır, anahtarın altında not ve "Yeniden dene" çıkar. CPU'ya ya da başka modele geçince
  yeniden denenir.
- **DTW açıkken canlı satırlar akmıyor** (yüzde, kalan süre ve hız akıyor): whisper.cpp v1.9.1'de DTW açıkken yeni
  segment bildirimi DTW hesabından sonraya kalıyor ve o döngü (`src/whisper.cpp`, `seg < n_segments`) ilk 30 sn'lik
  pencereden sonra hiç satır yazmıyor, ilkinde satırları yineliyor. Nihai altyazı JSON'dan, etkilenmiyor.
- **Çevrimdışı çeviri bulut yedeğine geçmez** (yedek çevirmez; kaynak dilde altyazı "çeviri" sayılmasın), transkript
  önbelleğine yazılmaz (Konuşmadan kes İngilizce kelime almasın), rehberin örnek klibinde kapalı. Sözlük ipucu
  çeviride İngilizce çerçeveyle ("Names and terms: …") gider. Belge İngilizce sayılır (büyük harf "THIS", kalite,
  çok dilli paket `en.srt`); işaret satırlarda (`cikisDili: "en"`) durur (satır bölünce iki parçaya da geçer), geri al /
  taslak / Shorts kaydıyla taşınır. Belgenin dili de belgeyle taşınır (geri al girdisi, taslak ve Shorts kaydında `dil`;
  SRT içe aktarmada sıfırlanır): çevrimdışı İngilizceden Ctrl+Z ile dönülen Türkçe belge Türkçe kalır (BİR, `tr.srt`,
  Türkçe başlıklar). 3.2 öncesi taslak / Shorts kaydında `dil` yok: işaretli satırlardan "en", değilse Altyazı › Dil.
- **Dosya adı eki:** çeviri belgesi `suflo-altyazi.en.srt` olarak iner. Bu ek bulut (LLM) çevirisinde de hedef dili
  alır (`suflo-altyazi.de.srt`); çift dilli dışa aktarmada ek yok. 3.1'de çeviri sonrası dosya adı eksizdi.
- **Hızlı moddaki transkript** önbellekte ayrı tutulur: motor kimliği `yerel:<model>:hizli` (En doğru eksiz
  `yerel:<model>` kalır, eski önbellek girdileri geçerli). Hızlı'da yazıya dökülen klip En doğru'ya geçince yeniden
  çözülür. Hızlı'da durum satırı "Suflo Motoru · yerel · hızlı çözme…" der ("yüksek doğruluk" değil).

**5.1 Türkçe kıyas ve varsayılan kararı (yaklaşık 1,5 saat; Windows, NVIDIA kartlı makinede).**
1. Üç örnek hazırla, her biri 1–3 dk Türkçe konuşma: `studyo` (iyi mikrofon), `telefon` (telefonla kayıt), `gurultulu`
   (kafe / sokak). Bir klasöre (ör. `D:\kiyas`) 16 kHz mono WAV olarak koy:
   `ffmpeg -i studyo.mp4 -ar 16000 -ac 1 -c:a pcm_s16le D:\kiyas\studyo.wav` (diğer ikisi aynı).
2. Her biri için referans metni `D:\kiyas\studyo.txt` (UTF-8): Suflo'nun Large + En doğru çıktısını SRT/TXT olarak al,
   sesi dinleyerek **elle düzelt** (kelime kelime doğru olsun; noktalama ve büyük harf önemli değil).
3. Panelden Large v3 ve Turbo'yu indir (Ayarlar › Doğruluk modeli; dosyalar `%APPDATA%\Kesit\whisper\models`).
   Kurulu motor GPU (cuBLAS) ise CPU karşılaştırması için
   `https://github.com/ggerganov/whisper.cpp/releases/download/v1.9.1/whisper-blas-bin-x64.zip`'i ayrı bir klasöre
   (ör. `D:\whisper-cpu`) aç.
4. `%APPDATA%\Kesit\whisper` içinde `whisper-cli.exe`'yi bul (bir alt klasörde de olabilir; aşağıdaki `--cli`'ye o
   yolu ver). Depo klasöründe (Node 12+):
   `node tools/motor-kiyas.js --cli "%APPDATA%\Kesit\whisper\whisper-cli.exe" --modeller "%APPDATA%\Kesit\whisper\models" --ornekler D:\kiyas --model turbo,large --dtw --vad "%APPDATA%\Kesit\whisper\models\ggml-silero-v5.1.2.bin" --json D:\kiyas\gpu.json`
   ve aynısını `--cli D:\whisper-cpu\whisper-cli.exe ... --json D:\kiyas\cpu.json` ile (exe alt klasördeyse yolunu ver).
   Windows kullanıcı adında ya da klasör adında Türkçe harf olması sorun değil: araç panel gibi yolları 8.3 kısa adına,
   o kapalıysa `C:\ProgramData\Suflo\ascii-onbellek`'e kopyaya çevirir (model ilk koşuda bir kez kopyalanabilir).
   Bir satırda "ASCII olmayan yol whisper-cli'ye gitti" görürsen örnekleri ve modelleri `D:\kiyas` gibi yalnız ASCII
   harfli bir klasöre koyup `--modeller`/`--ornekler`'i ona çevir.
   Çıktı tablosu her model / mod / DTW için gerçek zaman çarpanını ve WER'i verir. İki JSON'u bana gönder.
5. Karar kuralı: Turbo ve Large'da, CPU ve GPU'da, üç örneğin hepsinde Hızlı'nın WER'i En doğru'dan en çok
   **1 puan** fazlaysa **ve** Hızlı en az **1,5×** hızlıysa varsayılanı Hızlı yap; değilse En doğru kalsın. Hızlı'ya
   geçmek için: `js/whisper-args.js` › `VARSAYILAN_COZME = "hizli"`, `index.html` › `#set-cozme`'de Hızlı'yı ilk
   seçenek yap ve "(önerilen)"i ona taşı, `tests/test-whisper-args.js` / `tests/test-caption-quality.js` /
   `tests/test-motor-secenekleri.js`'teki varsayılan beklentilerini güncelle (ya da bana yaz, ben yaparım).
6. README'deki hız tablosunun "Hızlı" ve "+ DTW" satırlarına ölçtüğün çarpanları ve WER'i yaz.

**5.2 DTW'yi gerçek modellerde doğrula (5.1'in içinde, ek süre yok).** `--dtw` ile her model satırında araç
"t_dtw N/M" yazar. Turbo, Large ve (kuruluysa) Small'da GPU ve CPU'da N > 0 olmalı. Bir satırda **0/M** görürsen o
model + derlemede DTW çalışmıyor demektir: kullanıcıda otomatik kapanır (zarar yok) ama bana yaz. Ek yük: aynı model
ve modda DTW açık / kapalı gerçek zaman çarpanlarının oranı.

**5.3 Gerçek DTW fikstürü (isteğe bağlı, 10 dk).** 10–20 sn'lik Türkçe bir WAV'ı Large ya da Turbo ile
`whisper-cli -m <model> -f ornek.wav -l tr -ojf -of whisper-ojf-dtw-gercek -dtw large.v3.turbo -nfa --vad -vm <silero> 2> whisper-ojf-dtw-gercek.stderr.txt`
ile çöz (Large'da ön ayar `large.v3`), iki dosyayı `tests/fixtures/` altına koy. `tests/test-whisper-words.js` onları
bulunca gerçek DTW çıktısını da sınar (şimdi "ATLA" yazıyor).

**5.4 Pro sayfası ve sürüm notu.** suflo.app Pro listesine (ve istersen fiyat sayfasına) "Çevrimdışı İngilizce
çeviri (internetsiz, yerel motor)" ekle. Sürüm 3.2.0'a geçerken `marketing/release-notes.md`'nin 3.2.0 bölümüne:
"Ayarlar › Çözme ile yerel motoru Hızlı ya da En doğru çalıştır; kelime kelime ve karaoke altyazıda 'Hassas kelime
zamanlaması (DTW)' vurguyu sözcüğün söylendiği ana oturtur. Yeni Pro aracı: konuşmayı internetsiz İngilizce altyazıya
çevir (Small / Large model, 3 deneme hakkı)." `js/app.js` YENILIKLER listesine istersen kısası.

**5.5 Premiere'de dene (yaklaşık 40 dk).** `marketing/v3.2-deneme-listesi.md` › `## 5` maddeleri; en önemlisi 5.6
(her modelde ve derlemede DTW) ve 5.10–5.12 (deneme hakkı, büyük harf, `.en.srt`).

## 3.3

3.3'ün kapsamı: `marketing/alti-repo-plan.json` › `plan.build_order` adım 16, 17, 18 ve 21 (Altyazı Efektleri
oluşturucusu, bu sırayla) ve YouTube indirici. Her adım kendi alt bölümünü ekler. Elle Premiere denemeleri
`marketing/v3.3-deneme-listesi.md`'de.

### Adım 16: Altyazı Efektleri oluşturucusu (Suflo Stilleri galerisinin yerine)

Ne değişti: Altyazı sekmesindeki 12 kartlık "Suflo Stilleri" galerisi kalktı; yerinde "Altyazı Efektleri": beş
hazır görünüm çipi, büyük canlı önizleme (gerçek libass çıktısı) ve giriş / vurgu animasyonu, kelime vurgusu, renk,
yazı tipi + kalın / italik, boyut, kontur, satır sayısı, en çok kelime, konum. Stil motorunda tek temel stil `efekt`
(`js/style-engine.js`), model `js/altyazi-efekt.js`. Eski 12 stil motorda duruyor: eski kayıtlar, 3.2 SFL1 kodları
ve Shorts Paketi seçimleri en yakın görünüme taşınıyor (yazı tipi, renk, konum korunuyor). "Suflo Stilleri" her
yerde "Altyazı Efektleri" (İngilizce "Caption Effects"). Katman Pro.gate("overlay") ile, mevcut 3 deneme hakkıyla.
Animated Captions / TranscriptAI'dan yalnız fikir alındı (temiz oda); bu adımda kod ya da MOGRT paketlenmedi.

**16.1 Görünümleri onayla (5 dk).** Beş görünümün adı ve değeri `js/altyazi-efekt.js` › `GORUNUMLER`'de: Temiz,
Vurucu, Canlı, Zarif, Glitch. Ad ya da renk değiştirmek istersen orada değiştir; "Temiz" stil motorundaki `efekt`
varsayılanıyla birebir aynı kalmalı (`js/style-engine.js` › `STYLES.efekt.style`; test denetler). Yeni ad eklersen
`i18n/en.js`'e İngilizcesini yaz (ör. "Vurucu": "Punchy").

**16.2 Premiere'de dene (yaklaşık 40 dk).** `marketing/v3.3-deneme-listesi.md` › `## 16` maddeleri; en önemlisi 16.2–16.4
(gerçek önizleme ve animasyonlar), 16.8–16.9 (eski kayıt ve eski kod taşıma), 16.11–16.12 (deneme hakkı ve timeline).

**16.3 Site görselleri (isteğe bağlı, 20 dk).** Site metni güncellendi (`docs/index.html`, `docs/en/index.html`,
`docs/en/pro.html`, iki blog yazısı, `docs/stil.html`). Eski galeriyi gösteren görseller kaldı: `docs/gorseller/v3/kelime-vurgusu.webp`
(alt metni "12 animasyonlu altyazı stili") ve varsa Pro sayfasındaki stil kartı ekran görüntüleri. 3.3 panelinden
Altyazı Efektleri bölümünün yeni ekran görüntüsünü al (Vurucu seçili, önizleme oynarken) ve değiştir; alt metni
"Altyazı Efektleri: giriş ve vurgu animasyonlu kendi altyazın" yap. `docs/gorseller/suflo-stiller/efekt.webm` stil
sayfasının yeni vitrini (`node tools/render-style-previews.js --site --id efekt` ile yeniden üretilebilir). Paylaşılan
efekt kodunun sayfası kodun giriş × vurgu animasyon çiftini oynatır: `docs/gorseller/suflo-stiller/efekt-<giris>-<aktif>.webm`
(24 dosya, ~280 KB; `node tools/render-style-previews.js --site --efekt` ile yeniden üretilir, stil motoru değişince yenile).

**16.4 Sürüm notu ve tanıtım (3.3.0'a geçerken).** `marketing/release-notes.md`'nin 3.3.0 bölümüne: "Altyazı
Efektleri: eski stil galerisinin yerinde kendi altyazı efektini kur: giriş (Pop, Belirme, Yukarı / Aşağı kay, Zıpla) ve
vurgu animasyonu (Zıpla, Titre, Glitch), kelime vurgusu, renk, yazı tipi, kalın / italik, satır ve kelime sayısı; beş
hazır görünümle başla. Eski stillerin ve stil kodların en yakın görünüme taşınır." `js/app.js` YENILIKLER listesine
istersen kısası. Eski sürüm notlarındaki (3.0–3.2) "Suflo Stilleri" geçmiş kayıt olduğu için bilerek değişmedi.

**16.5 Sonraki adımlar için not.** Yerel (render'sız) MOGRT çıktısı adım 21'de: TranscriptAI şablonu
(`dist/source/dinamik_altyazi_motoru.mogrt`, izinli) o adımda pakete girer. `tools/verify-release.ps1` `.mogrt`
dosyalarını ücretli içerik sayıp yayını durduruyor; adım 21 o dosyayı ayrıca izinli listeye almalı. Oluşturucu
kontrolleri şablonun JSON sözleşmesine 1:1 eşleniyor (`js/altyazi-efekt.js` › `sablonStili`, `sablonIndeksleri`).
Yazı tipi alanı PostScript adıdır (`sablonFontu`: Montserrat-Bold, Anton-Regular…; kalın bu adla gider, italik yüz
pakette yok). Premiere yalnız sisteme **kurulu** fontu çizer: adım 21 paket fontlarını kullanıcıya kurmalı (Windows
`%LOCALAPPDATA%\Microsoft\Windows\Fonts` + HKCU kaydı, macOS `~/Library/Fonts`) ya da kurulu değilse libass katmanına
düşmeli; yoksa şablon yazı tipini düşürür (Arial).

**16.6 Yeni statik font: `fonts/Montserrat-Regular.ttf` (bilgi).** "Kalın yazı" kapalıyken libass'in seçtiği Regular yüz;
`Montserrat-Bold.ttf` gibi paketteki değişken `Montserrat.ttf`'ten fontTools ile üretildi (OFL, aynı lisans dosyası,
`THIRD_PARTY_NOTICES.md`'de yazılı). `tools/verify-release.ps1` iki statik Montserrat'ı zorunlu tutar; ZXP / kurucu
`fonts/` klasörünü bütün taşır, ek adım yok.

### Adım 17: Gölge, arka plan kutusu ve serbest X / Y konum

Ne değişti: Altyazı Efektleri oluşturucusuna **Gölge** (renk, opaklık 0-100, mesafe 0-20, yumuşaklık 0-30) ve
**Arka plan kutusu** (renk, opaklık) anahtarları, önizlemede **sürükleyerek serbest konum** (artı işareti, "X %50 · Y %85"
etiketi, hazır konumlara ±%3 yapışma, ok tuşları %1 / Shift %5, çift tık / Home sıfırlar) ve altıncı hazır görünüm
**Kutulu** geldi; Vurucu sert, Zarif yumuşak gölgeli. Stil motoru (`js/style-engine.js`, yalnız `efekt`): gölge ayrı
katmanda metnin görünmez kopyasıdır (`\4c \4a \shad \blur`, yazı keskin kalır), kutu ikinci stil satırı `SufloKutu`
(BorderStyle 3, satır satır, `\xbord20 \ybord0`), serbest konum `\an5` + kadraja / 9:16 sınırlarına kart kart sığdırma.
Varsayılanlar ve 12 eski stil bayt bayt aynı (anlık görüntü testi). SFL1 kodu, Şablonum, Marka Kiti (isteğe bağlı:
serbest konum, gölge, kutu) ve Shorts Paketi aynı ayarı taşır. Katman yine Pro.gate("overlay"), 3 deneme hakkı; yeni
deneme anahtarı yok. TranscriptAI'dan bu adımda yalnız aralıklar / sözleşme alanları izlendi (kod ya da varlık yok).
16. adımın ikinci incelemesinden kalan dört küçük bulgu da düzeldi (CEF 74 odak çizgisi, efektte hareket şiddeti hep
Dengeli, 3.2 rehber yedeğinin taşınması, Shorts Paketi'nde noktalama).

**17.1 Görünüşü onayla (10 dk).** Gölge yumuşaklığı ve kutu payı yaklaşıktır: yumuşaklık `\blur` = yumuşaklık / 2
(1080p'de), gölge mesafesi şablonun Drop Shadow yönüyle (135°) eksen başına mesafe · cos 45°, kutu yatay payı 20 px
(şablondaki `pad = 20`), dikey pay satır yüksekliği. Değiştirmek istersen `js/style-engine.js` › `renderEfekt` başındaki
`golgeEk` / `kutuPay`; testler (`tests/test-style-engine.js`) sayıları denetler, birlikte güncelle. Kutulu / Vurucu / Zarif
görünümlerinin değerleri `js/altyazi-efekt.js` › `GORUNUMLER`.

**17.2 Premiere'de dene (yaklaşık 50 dk).** `marketing/v3.3-deneme-listesi.md` › `## 17`; en önemlisi 17.2–17.3 (gerçek
gölge / kutu), 17.5–17.9 (sürükle, yapış, klavye, kenarlar, 9:16), 17.11 (timeline'da önizlemeyle aynı, Suflo'nun
Windows / macOS ffmpeg'iyle), eski Premiere için 17.18 ve 17.25, inceleme düzeltmeleri için 17.22–17.28 (Vurucu'da
zıplayan kelimenin gölgesi, Shorts CTA'sının yeri, 3.2 Clean Pill → Kutulu).

**17.3 Sürüm notu (3.3.0'a geçerken).** `marketing/release-notes.md` 3.3.0 bölümüne: "Altyazı Efektleri'ne gölge ve
arka plan kutusu; yazıyı önizlemede sürükleyerek istediğin yere koy (hazır konumlara yapışır, ok tuşlarıyla ince ayar);
yeni Kutulu görünümü. Shorts Paketi altyazısı Altyazı sekmesinin noktalama ayarını izler."

**17.4 Site görseli (isteğe bağlı, 10 dk).** Site metni güncellendi (`docs/index.html`, `docs/en/index.html`). 16.3'teki
yeni ekran görüntüsünü alırken önizlemede sürükleme anını (artı işareti ve "X %… · Y %…" etiketi görünürken) ya da
Kutulu görünümünü kullanabilirsin.

**17.5 Adım 21 için not (yerel MOGRT).** Şablonun JSON sözleşmesi gölge ve kutuyu taşıyor (`sablonStili`: gölge
`[1,r,g,b,opaklık,mesafe,yumuşaklık]`, kutu `[1,r,g,b,opaklık]`). **Konum sözleşmede yok**: yerleştirme klibin
Motion › Position'ını `AE.sablonKonumu(ayar)` oranıyla (0-1, kartın ortası) ayarlamalı. Şablon denemesinde iki şeye bak:
(a) Drop Shadow'un Opacity ifadesi JSON'daki 0-100'ü yüzde mi, 0-255 mi okuyor (AE'de bu efektin opaklığı ifadede
0-255 olabilir; öyleyse gölge önizlemeden çok soluk çıkar, değer 2,55 ile çarpılmalı); (b) şablonun kutusu tek dikdörtgen
(`sourceRectAtTime` + 20 px), Suflo önizlemesi satır satır kutu çizer: farkı onayla ya da libass tarafını tek kutuya çevir.

**17.6 Kutulu eşlemesini onayla (2 dk).** İncelemeden sonra 3.2'nin kutulu stilleri (Clean Pill, SaaS Glass, Belgesel)
"Temiz" / "Zarif" yerine arka plan kutulu **Kutulu**'ya taşınıyor (eski stilin yazı tipi / renkleri / konumu korunur).
Belgesel'i kutusuz Zarif'e döndürmek istersen `js/altyazi-efekt.js` › `ESKI` (testi `tests/test-altyazi-efekt.js`).

### YouTube indirici (sol menü › YouTube İndir; bilgi ücretsiz, indirmek Pro `youtube`, 3 deneme)

Ne değişti: yeni araç. Bağlantı (watch?v=, youtu.be, Shorts, m. / music.youtube.com; oynatma listesinden yalnız o video)
→ Bilgi al (ücretsiz) → MP3 / 720p / 1080p / 4K → İndir. 720p / 1080p H.264 + AAC MP4 iner; 4K (YouTube'da VP9 / AV1) ve
H.264'süz videolar Suflo'nun ffmpeg'iyle H.264 / AAC'ye çevrilir. Dosya proje klasörü › `Suflo İndirilenler`'e (değiştirilebilir)
iner, projede `Suflo İndirilenler` kutusuna alınır (`KS_importDownloaded`, timeline'a dokunmaz). yt-dlp pakette yok: ilk
kullanımda GitHub'dan son sürüm + aynı sürümün `SHA2-256SUMS`'ı iner, SHA-256 tutmadan çalışmaz; Güncelle ve Doctor satırı
var. İlk indirmede bir kez "yalnız hakkın olan içerik" onayı (`settings.json` › `ytOnay`). Kod: `js/youtube-indir.js` (saf),
`js/youtube-indir-ui.js`, `jsx/host.jsx` › `KS_importDownloaded`; testler `tests/test-youtube-indir*.js`, `tests/test-youtube-host.js`.

**YT.1 Hukuk ve satış metni (yayından önce, 30 dk).** Lemon Squeezy'nin ve (varsa) Adobe Exchange'in kabul edilebilir
kullanım şartlarını "YouTube indirici" özelliği için bir kez oku: bazı ödeme sağlayıcıları "telif ihlalini kolaylaştıran
araç" satışını yasaklıyor. Satış ve site metninde aracı "kendi videolarını / izinli içeriği Premiere'e al" diye anlat;
"YouTube'dan istediğin videoyu indir" gibi ifade kullanma. Onay metni `js/youtube-indir.js` › `ONAY_METNI`'de ve
`index.html` › `#yt-onay`'da (değiştirirsen `ONAY_SURUMU`'nu 2 yap: herkese yeniden sorulur; `i18n/en.js`'e İngilizcesini yaz).

**YT.2 Premiere'de dene (yaklaşık 60 dk, Windows ve macOS).** `marketing/v3.3-deneme-listesi.md` › `## YT` maddeleri;
en önemlisi YT.3–YT.4 (doğrulanmış kurulum), YT.8 (4K dönüştürme hızı, Windows'ta hangi kodlayıcı), YT.11 (İptal sonrası
arkada `yt-dlp` / `ffmpeg` süreci kalmıyor), YT.14 (Türkçe harfli kullanıcı / proje yolu).

**YT.3 Deno kararı (YT.16'dan sonra, 15 dk).** YouTube 2025 sonundan beri bazı kaliteleri JavaScript çalıştırıcısı olmadan
vermiyor; yt-dlp Deno'yu kendisi arar, Suflo `~/.deno/bin` ve Homebrew / Chocolatey / Scoop yollarını da dener ve yoksa
uyarı gösterir. Suflo Deno İNDİRMEZ. YT.16'da Deno'suz makinede 1080p / 4K gelmiyorsa bir sonraki sürüm için karar ver:
Deno'yu (MIT, ~40 MB) yt-dlp gibi ilk kullanımda indirip yayımlanan SHA-256 ile doğrulamak (yeni iş: `THIRD_PARTY_NOTICES.md`,
`denoAdaylari`) ya da yalnız uyarıda bırakmak.

**YT.4 Windows'ta 4K dönüştürme (YT.8'den sonra, bilgi).** Suflo'nun Windows ffmpeg'i (BtbN LGPL) libx264 taşımaz; dönüştürme
sırayla Media Foundation (`h264_mf`), NVENC, Quick Sync, AMF, OpenH264, son çare MPEG-4 ile yapılır ve sonuç satırı hangisini
kullandığını söyler. Kalite / hız kabul edilmezse seçenek: Windows'ta gyan.dev GPL derlemesini (libx264'lü, zaten yedek kaynak)
birinci kaynak yapmak; GPL ikili de pakete girmez, çalışırken iner ve `THIRD_PARTY_NOTICES.md` zaten listeliyor.

**YT.5 Destek cevapları (15 dk).** `marketing/dm-cevaplari.md`'ye ekle: (a) virüs koruması `yt-dlp.exe`'yi engelliyor
(PyInstaller ikilisi; Suflo SHA-256 doğruladıktan sonra çalıştırır; `%APPDATA%\Kesit\yt-dlp` klasörünü dışlamalara ekle,
sonra Güncelle); (b) "Sign in to confirm you're not a bot" (bekle, Güncelle; Suflo tarayıcı çerezi kullanmaz, bilerek);
(c) yaş sınırlı / üyelere özel videolar indirilemez (bilerek).

**YT.6 Sürüm notu ve yenilikler (3.3.0'a geçerken).** `marketing/release-notes.md`'nin 3.3.0 bölümüne: "YouTube indirici:
kendi videolarını ya da izinli içeriği bağlantıyla MP3, 720p, 1080p ya da 4K olarak indir; Premiere'e uygun MP4'e çevrilip
projendeki 'Suflo İndirilenler' kutusuna gelir (Pro, 3 deneme hakkı)." `js/app.js` › `YENILIKLER` 3.3'e geçerken
`{ ikon: "▼", baslik: "YouTube indirici", metin: "…", sekme: "youtube", hedef: "yt-url" }` maddesini ekleyebilirsin
(Türkçe metne İngilizce karşılık `i18n/en.js`).

**YT.7 Bakım (bilgi).** yt-dlp varlık adlarını değiştirirse (`yt-dlp.exe`, `yt-dlp_arm64.exe`, `yt-dlp_macos`)
`js/youtube-indir.js` › `varlikAdaylari` güncellenmeli; listede ad yoksa kurulum güvenle durur ("SHA2-256SUMS listesinde
yt-dlp dosyası yok"). GitHub API'ye ulaşılamazsa (kimliksiz sınır saatte 60 istek) `latest/download` kullanılır; SUMS ve ikili
yine birlikte doğrulanır. Doctor her taramada GitHub'a bir istek atar (yalnız yt-dlp kuruluysa).

## 3.4

3.4'ün Eğri hattı: `marketing/alti-repo-plan.json` › `plan.build_order` adım 9–15 (yumuşatma motoru, Eğri sekmesi,
kayıt tabanlı kaldırma, Geçiş / Zoom / Hareket eğrisi, Hız Rampası özel eğrisi, varışta yaylanma, paylaşım kodları).
Her adım kendi alt bölümünü ekler. Elle Premiere denemeleri `marketing/v3.4-deneme-listesi.md`'de. Bu iş yerel
`yerel-34-egri` dalında; 3.3 bitip yayınlanana dek uzak depoya gönderilmez.

### Adım 9: Yumuşatma motoru ve anahtar kare kayıtları (altyapı, ücretsiz; görünen araç yok)

Ne değişti: iki saf modül geldi. `js/ease-curve.js` (`SufloEase`) Rebound'un (MIT, commit `0f9fd6c`) yumuşatma
motorundan uyarlandı: CSS cubic-bezier çözücüsü, Penner kümesi (quad … bounce), yay (spring), örnekleyici, hız grafiği
ve yaylanma (overshoot) matematiği. Suflo'nun kendi eklemeleri: çok noktalı eğri (en çok 8 nokta), şekli bozmadan nokta
ekleme (de Casteljau), çevir (ease-in ↔ ease-out), ters çevir (yalnız tekdüze eğri), tek `cubic-bezier()` metni
okuma / yazma, 15 hazır eğri ve `bakePlan` (eğriyi iki anahtar kare arasına timeline karelerinde sık anahtar kare
olarak yazma planı). `js/key-records.js` (`SufloKeyRecords`) Suflo'nun yazdığı anahtar kareleri kayıt olarak tutar
ve "hâlâ yerinde mi" denetler (iki uç + kayıtlı zamanların en az %60'ı, 0,25 kare tolerans); depo proje başına
localStorage anahtarı, projede en çok 300, toplam 2000 kayıt; boyut da sınırlı (proje 400 000, toplam 1 000 000 karakter,
zamanlar sıkıştırılmış), kota ya da sınır dolunca en eski kayıtlar tek tek atılır. Panel açılışında Premiere'e ya da ağa
çağrı yok.
OpenCurve'den yalnız fikir alındı (lisansı yok); kodu, tabloları ve metin sözdizimi kullanılmadı.

**9.1 Lisans ve atıf (5 dk, bilgi).** `THIRD_PARTY_NOTICES.md`'ye Rebound girdisi eklendi (commit, MIT, telif satırı,
tam lisans metni, uyarlanan dosyalar); `js/ease-curve.js` başında atıf satırı, uyarlanan her işlevde
`// Rebound: <ad>` işareti var. ZXP ve kurucu `THIRD_PARTY_NOTICES.md`'yi zaten taşıyor; `tools/verify-release.ps1`
iki yeni dosyayı (`js/ease-curve.js`, `js/key-records.js`) zorunlu tutuyor. Yapacak bir şey yok; yalnız göz at.

**9.2 İsteğe bağlı teşekkür satırı (2 dk, karar).** Plan README'ye "İlham: OpenCurve, Rebound" satırını isteğe
bağlı bırakıyor (lisans iddiası değil, teşekkür). Eklenmedi; istersen `README.md` › `## Lisanslar / Licenses` altına
ekle. OpenCurve'ün adı başka hiçbir yerde geçmemeli (inceleme `opencurve` arar; tek izinli yer adım 15'teki
OpenCurve JSON içe aktarıcısı).

**9.3 Hazır eğri adlarını onayla (5 dk).** `js/ease-curve.js` › `BUILTINS`: Doğrusal, Yumuşak, Yumuşak giriş,
Yumuşak çıkış, Yumuşak giriş-çıkış, Sert giriş, Sert çıkış, Güçlü S, Geri çekil, Taşma, Esnek, Zıplama, Yay yumuşak,
Yay canlı, Çift yumuşak (İngilizceleri `nameEn` alanında ve `i18n/en.js`'te). "Süzülme" Hız Rampası önayarı olduğu
için kullanılmadı. Ad değiştirirsen `i18n/en.js`'teki karşılığını da değiştir; "Yumuşak" (Smooth) ve "Zıplama"
(Bounce) sözlükte başka araçlarla ortak, eğri seçicisi İngilizce adı `SufloEase.builtinName()`'den alır.

**9.4 Eğri fiyatlandırması (bilgi, adım 10'a not).** Senin kararınla adım 10'da Eğri editörü ve önizleme ücretsiz;
eğriyi anahtar karelere uygulamak Pro (`Pro.gate('curves')`, 3 deneme hakkı, `js/deneme.js` listesine `curves` girer,
Ayarlar'daki Pro / deneme tablosunda görünür). Adım 9'da kapı yok; sunucu tarafında yapılacak bir şey yok (deneme
hakları panelde tutuluyor).

**9.5 Premiere'de dene (10 dk).** `marketing/v3.4-deneme-listesi.md` › `## 9` (geliştirici kurulumu + Chrome'da
`http://localhost:8092` konsolu). Özellikle 9.1'i eski Premiere'de (14.x / 2020, CEF 74) yap.

### Adım 10: Eğri sekmesi: kendi anahtar karelerine özel yumuşatma (Pro: düzenlemek ücretsiz, uygulamak 3 deneme hakkı)

Ne değişti: sol menüde **Eğri** sekmesi (Hız Rampası'nın altında). Kullanıcı Effect Controls'te bir özelliğe iki anahtar
kare koyar, playhead'i aralarına getirir, eğriyi seçer, Uygula der; Suflo eğriyi aralarına her kareye (ya da 2 / 4 karede
bir) sık anahtar kare olarak yazar (Premiere'in betikleri Bezier tutamacı yazamaz), uçtaki iki anahtar değişmez. Seçili
klipler (en çok 20) toplu, yoksa playhead'in altındaki klip. SVG düzenleyici (Değer / Hız, tutamaç, çok nokta, Shift / Alt /
Delete), 15 hazır eğri + kendi önayarların, canlı önizleme sahnesi (Premiere'e gitmez), kaba "Premiere'de önizle",
cubic-bezier alanı, kısayollar (Enter, U, F, I, V, 1–9). Geri al yalnız Suflo'nun yazdığı ve hâlâ duran anahtarları siler;
kayıtlar `SufloKeyRecords` deposunda (adım 9), panel kapanıp açılsa da çalışır. Host: `KS_easePeek` / `KS_easeScan` /
`KS_easeBake` / `KS_easeUndo` ve Doctor'da `kfInterp` satırı. Panel açılışında Premiere'e çağrı yok; yoklama yalnız sekme
görünür, panel odakta ve Premiere boştayken 1,2 sn'de bir ve ucuz. OpenCurve'den yalnız fikir alındı (lisansı yok; kod,
tablo, metin sözdizimi yok); motor Rebound (MIT, adım 9).

**10.1 Fiyat kararın uygulandı (bilgi).** Senin kararınla düzenleyici, önayarlar, önizleme ve geri alma ücretsiz; eğriyi
anahtar karelere uygulamak (tek klip ya da toplu) `Pro.gate('curves')`, 3 deneme hakkı. `js/deneme.js` listesine 13. araç
olarak `curves` ("Eğri (anahtar kare yumuşatma)") girdi, Ayarlar › Suflo Pro'daki deneme tablosunda görünür; Pro listesine
"Eğri: anahtar karelerine özel yumuşatma (düzenlemek ücretsiz)" satırı eklendi. Hak yalnız en az bir özellik gerçekten
yazılınca, bir kez düşer. Sunucu tarafında yapılacak bir şey yok (haklar panelde). Planın ayrı "egri-toplu" kapısı yok:
toplu uygulama da aynı `curves` kapısından geçer. Farklı istersen (ör. tek klip ücretsiz) söyle.

**10.2 Premiere'de dene (30–40 dk).** `marketing/v3.4-deneme-listesi.md` › `## 10`. Özellikle: **10.3** (Delete, F, I, V
Premiere'e gitmemeli; Delete seçili klibi silmemeli), **10.5** (deneme penceresi ve hak bir kez), **10.6** (%50 hız ve ters
klip), **10.7** (yazılan anahtarlar Doğrusal mı: `setInterpolationTypeAtKey` sabiti 0 = doğrusal varsayımı Premiere'de
doğrulanmadı) ve **10.9** (Geri al senin elle eklediğin anahtarı korumalı). Hem yeni (2025 / 2026) hem eski (14.x / 2020,
CEF 74) Premiere'de.

**10.3 Adlar (5 dk, karar).** Sol menü adı "Eğri" (açıklama "anahtar kare yumuşatma"), İngilizcesi "Easing". Panelde "Bezier
tutamaçları" iddiası yok: arayüz ve README "tutamaç yazamaz, sık anahtar kare" der. Site, blog ve sürüm notu bu adımda
değişmedi; 3.4 yayınında Eğri'yi anlatırken de "Bezier tutamacı" deme, "her kareye anahtar kare" de.

**10.4 Yenilikler penceresi (3.4 yayınında).** `js/app.js` › `YENILIKLER` hâlâ 3.2'nin listesi. 3.4'ü yayınlarken sürümü
"3.4" yapıp Eğri maddesini (`sekme: "egri"`, `hedef: "egri-editor"`) ekle; bu adımda bilerek dokunulmadı (yayın kararı).

**10.5 Ses düzeyi sonra (bilgi).** v1 yalnız video katmanlarındaki özellikleri tarar (arayüzde yazıyor). Ses Volume
anahtarları için ayrı bir adım gerekir; şimdilik bir şey yapma.

### Adım 11: Kayıt tabanlı güvenli kaldırma: Geçiş, Zoom, Hareket önayarı (ücretsiz)

Ne değişti: `KS_applyCutTransition`, `KS_autoZoom` ve `KS_applyMotionPreset` artık yazdıkları her özellik için bir kayıt
döndürür (klip nodeId, sekans, özellik kimliği, yazılan anahtar zamanları, yazmadan önceki kenar değerleri, kaynak çapası);
panel bunları `js/kayit-kaldir.js` ile proje başına saklar (adım 9'un `SufloKeyRecords` deposu, Eğri ile ortak). Yeni host
işlevi `KS_removeSufloKeys` yalnız canlı kaydın (iki uç yerinde ve zamanların en az %60'ı) Suflo'nun yazdığı ve hâlâ duran
anahtarlarını siler, kenar değerlerini geri koyar, updateUI ile tazeler; taşınan klibi nodeId ile bulur, bulunamayan klibin
kaydını saklar, Premiere'de geri alınmış uygulamanın kaydını bitirir. Geçişler'e **Geçişi kaldır**, Hareket önayarlarına
**Önayarı kaldır** geldi; **Zoom'u kaldır** artık kullanıcının Ölçek anahtarlarını silmiyor. Uygulama bildirimlerinde kapısız
**Geri al**. Kaydı olmayan zoom ve geçişte eski yöntem yalnız onayla çalışır. Kaldırmak her tierde ücretsiz (Pro kapısı ve
deneme hakkı yok). OpenCurve'den yalnız "canlılık parmak izli kayıt" fikri alındı; kod yok.

**11.1 Fiyat (bilgi).** Senin kuralın uygulandı: Suflo'nun yazdığını kaldırmak hiçbir zaman ücretli değil. Geçişler ve Zoom
uygulamak Pro (3 deneme hakkı) olarak kaldı; kaldırma düğmeleri ücretsizde de kilitsiz. Sunucu tarafında yapılacak bir şey yok.

**11.2 Eski önayarlar için karar (5 dk).** 3.3 ve öncesinde uygulanan Hareket önayarlarının kaydı yok; plan "kayıt yoksa
bugünkü davranış onayla" diyor, ama önayarlarda bugün hiçbir kaldırma yolu yoktu ve bir önayarın penceresi (giriş / çıkış /
playhead çevresi) sonradan bilinemiyor. Bu yüzden Önayarı kaldır kaydı olmayan önayarı tahminle silmez; kullanıcıya Ctrl+Z ya
da Effect Controls'ü önerir. Geçişte eski yöntem, uygulamanın kendisinin de temizlediği kesim penceresidir (onaylı). Önayar
için de onaylı bir "giriş / çıkış penceresini temizle" istersen söyle.

**11.3 Zoom'un eski yöntemi (bilgi, sonra düzeltilebilir).** Onaylı eski yol 3.3'teki `kaldir()`'ın aynısı: klibin tüm Ölçek
anahtarlarını silip iki düz anahtar yazar ve Konum'u sıfırlar. Düz değer klibin başındaki değerden okunur; zoom klibin başında
yakınlaşmış başlıyorsa düz değer de yakın kalır (3.3'ten beri var olan sınır; kayıtlı yol bunu yaşamaz). Aynı sebeple zoom'u
aynı klibe ikinci kez uygulamak hâlâ birincinin üstüne biner (taban yakınlaşmış ilk anahtardan okunur; 3.3'ten beri). Kayıtlı
kaldırma bunu telafi eder: yeniden uygulamada yeni kayıt ilk uygulamanın "önceki değer"ini devralır, Zoom'u kaldır ölçeği
zoom'dan önceki değere döndürür (yalnız yerine geçilen kayıt uygulamadan hemen önce hâlâ canlıysa; Premiere'de geri
alınmış eski kaydın bayat değeri devralınmaz, klip taşınmış olsa da eşlenir). Zoom'un tabanını düzeltmek (yeniden
uygulamada üst üste binmesin) ayrı bir iş; istersen söyle.

**11.4 Yerel depo (bilgi).** Kayıtlar bu bilgisayarın panel deposunda (proje yolu karma anahtarla; projede Eğri ve araç
kayıtları için ayrı ayrı en çok 300, toplam 2000 kayıt, en eskiler tek tek atılır; çok klipli bir araç uygulaması Eğri'nin
Geri al kayıtlarını atmaz). Proje başka bilgisayarda açılırsa kayıt yok: eski yöntem (onaylı) ya da Ctrl+Z.
Projenin içine yazmak (marker / proje meta verisi) sonraki bir karar.

**11.5 Premiere'de dene (25–30 dk).** `marketing/v3.4-deneme-listesi.md` › `## 11`. Özellikle **11.2** (kendi anahtarın kalır,
kenarlar eski değerde), **11.6** (eski geçiş: onay, Karartma'dan sonra klip siyah kalmaz), **11.7** (zoom kaldırma senin Ölçek
anahtarını silmez), **11.9** (önayar kaldırınca Opaklık 80'e döner) ve **11.10** (hakları bitmiş ücretsiz kullanıcı kaldırabilir).
Hem yeni (2025 / 2026) hem eski (14.x / 2020, CEF 74) Premiere'de. `setTimeVarying(false)` + `setValue` ile sabit değere
dönüşün Premiere'de anahtar bırakmadığını (Effect Controls'te kronometre kapalı) doğrula. İnceleme düzeltmeleri için
**11.13 (d)** ve **11.14** (araçlar arası: Zoom + Punch, Zoom + geçiş, Karartma → Zoom İçeri, Ctrl+Z sonra yeniden uygulama,
çoklu seçim uyarısı) da dene. İkinci inceleme için **11.15** (Eğri ile birlikte kaldırma) ve **11.16** (seçili klip
playhead'in önüne geçmez, onayda kesim yeri) da.

**11.6 Kaynak satırı (PR / birleştirme, 1 dk).** Adım 11'in ilk dört commit'inde (675cddd, 13b08f1, 63c3fe7, 74dfccb) kaynak
satırı yok; inceleme düzeltmesi commit'inde var. 3.4 PR açıklamasına ve squash-merge commit'ine şu satırı ekle:
`Kaynak: temiz oda (OpenCurve'den yalnız "canlılık parmak izli kayıt" fikri); kod alınmadı, bildirim gerekmez.`
(plan › attribution_notes: her adımın commit / PR metni kaynağı ve kodun alınıp alınmadığını söyler).

**11.7 İkinci inceleme: iki davranış değişikliği (bilgi, 2 dk).** (a) Bir araç anahtarının ucunda duran **Suflo Eğrisi**
artık o araçla birlikte kalkar: Zoom'un, geçişin ya da önayarın iki anahtarı arasına Eğri uygulanmışsa Zoom'u kaldır /
Geçişi kaldır / Önayarı kaldır Eğri'nin iç anahtarlarını da siler ve Eğri kaydını bitirir (bildirim "…Suflo eğrisi de
kaldırıldı" der). Önceden Eğri'nin anahtarları kalıyor, rampa görünür kalıyor ve Eğri'nin Geri al'ı onları bulamıyordu.
Uçları senin kendi anahtarların olan Eğri'ye dokunulmaz. (b) **Geçişi kaldır** artık seçili klibe göre kesim seçmez:
playhead'e en fazla 1 sn uzaktaki, Suflo geçişi olan en yakın kesimi kaldırır (yoksa en yakın kesimi). Kaydı olmayan
geçişin onayı ilk satırda hangi kesim olduğunu söyler ("Kesim: V1, 00:09.04") ve Tamam tam o kesimi temizler; önceden
seçili bir klip, onaylanan eski yöntemle başka bir kesimdeki senin anahtarlarını sildirebiliyordu. Geçiş **uygulama**
kuralı değişmedi (seçili klibin kesimi öncelikli). Yapılacak bir şey yok; 11.15 / 11.16'da gözle doğrula.

### Adım 12: Geçiş, Zoom ve Hareket önayarlarında özel eğri (her aracın kendi katmanı; eğri seçmek ücretsiz)

Ne değişti: Geçişler, Otomatik Zoom ve Hareket önayarları sekmelerinde küçük resimli **Eğri** seçicisi (Eğri sekmesinin
kart ızgarasıyla aynı; `js/egri.js` › `SufloEgriIzgara`, `SufloEgriSecici`). Varsayılan **Otomatik** = bugünkü çıktı (panelin
Premiere'e gönderdiği yük 3.4 adım 12 öncesiyle bayt bayt aynı; `tests/fixtures/egri-otomatik-3.4.json`). Başka bir eğride
yeni saf modül `js/egri-secim.js` (`SufloEgriSecim`) her parçayı `SufloEase.bakePlan` ile sık anahtar karelere çevirir (her
kare, 1 sn'den uzun parçada 2 karede bir; özellik başına en çok 2000 ara anahtar, aşarsa adım katlanır); host
`KS_presetKeys`'in yeni `dense` bayrağıyla Bezier (5) yazmaz, `setInterpolationTypeAtKey` varsa doğrusal (0) yazar, updateUI
yine yalnız son anahtarda, ilk / son anahtar doğrulaması aynı; yazılan her anahtar kayda girer (adım 11'in kaldırması aynen
çalışır). `ease` alanı: `'auto'` | hazır eğri kimliği | `cubic-bezier(…)` | `SFC1.` kodu. Temiz oda; yalnız Suflo'nun kendi
`js/ease-curve.js`'i (Rebound MIT, adım 9'da atıflı).

**12.1 Fiyat (bilgi).** Senin kuralın: araçların katmanı aynen. Geçişler `transitions`, Zoom `zoom` (ikisi de Pro, 3 deneme
hakkı), Hareket önayarları `presets` (Pro, denemesiz) kapısından geçer; eğri **seçmek ve küçük resimlere bakmak ücretsiz**.
`js/deneme.js`'e yeni anahtar eklenmedi, `curves` hakkı bu araçlarda düşmez. Sunucu tarafında yapılacak bir şey yok.

**12.2 Tasarım kararlarını onayla (10 dk, karar).** Plan "her anahtar parçasını yoğunlaştır" diyor; birebir uygulanınca
Zoom İçeri / Whip gibi üç anahtarlı hareketler ortadaki anahtarda durup kalkıyordu. Bu yüzden:
(a) **Aynı yöne giden ara anahtarlar tek parça** sayılır (Suflo'nun ivme biçimiydi, onun yerini eğri alır); yön değiştiren
anahtarlar (taşma, zıplama, sarsıntı tepeleri) ve duruş / kalkış anları korunur.
(b) **Geçişte giden klip (A) eğrinin aynasını** (`SufloEase.flip`) kullanır: kullanıcı "Sert çıkış" seçince A kesime hızlanır,
B kesimden yavaşlar (Suflo'nun kendi geçişleri gibi). Birebir aynı eğriyi istersen `js/transitions.js` › `hostPlan`'da
`S.ayna(c.curve)` yerine `c.curve` yaz.
(c) **Zoom'da özel eğri Yumuşak stilin %1,2'lik taşmasını yazmaz** (taşmayı istersen Taşma / yay eğrisini seçersin); Jump Cut
eğrisizdir, Snap-In'in kademeleri tek eğrili harekete dönüşür.
(d) **Hareket önayarlarında** anahtarları host her seçili klibin o anki değerlerinden kurduğu için panel `bakePlan` yerine eğriyi
241 noktalık tablo (`SufloEase.bakeFactors`) olarak gönderir, host aynı kare kuralıyla yoğunlaştırır (`KS_egriYogun`). Yalnız
12 yerleşik önayar; Suflo Smooth paketi (`.prfpset`) kendi anahtarlarını korur.
Farklı istersen söyle.

**12.3 SFC1 kodu çekirdeği (bilgi, adım 15'e not).** Kullanıcı önayarları ve çok noktalı / yay eğrileri seçicide `SFC1.` kodu
olarak taşınır (`SufloEase.sfcKodla` / `sfcCoz`: `"SFC1." + base64url(UTF-8 JSON { v: 1, tur: 'egri', ad, curve })`, en çok 4096
karakter, 8 nokta, ad 40 karakter, denetim karakterleri atılır). Adım 15 bunu genişletecek (`tur: 'hiz'`, `.suflo-egri`
dosyası, içe / dışa aktarma); biçim değişirse seçicinin yerel depoda tuttuğu kodlar `coz` ile geçersiz sayılır ve Otomatik'e
düşer (veri kaybı yok, kullanıcı yeniden seçer).

**12.4 Premiere'de dene (30–40 dk).** `marketing/v3.4-deneme-listesi.md` › `## 12`. Özellikle **12.2** (Otomatik 3.3 ile aynı),
**12.4** (doğrusal anahtar simgesi: `setInterpolationTypeAtKey` sabiti 0 = doğrusal varsayımı adım 10.7 ile birlikte
doğrulanmalı), **12.5** (kısa klipte anahtar yığılması yok), **12.6** (uzun klipte özel eğrili zoom süresi; Premiere çok
yavaşsa sınırı 2000'den düşürebiliriz: `js/egri-secim.js` › `EN_COK` ve `jsx/host.jsx` › `KS_EGRI_EN_COK`) ve **12.9**
(29,97 kare/sn). Hem yeni (2025 / 2026) hem eski (14.x / 2020, CEF 74) Premiere'de.

**12.5 Yenilikler penceresi (3.4 yayınında).** `js/app.js` › `YENILIKLER`'e Eğri maddesiyle birlikte "Geçiş, Zoom ve Hareket
önayarlarında özel eğri" de girebilir (`sekme: "gecis"`, `hedef: "gecis-egri"`); bu adımda bilerek dokunulmadı. Site / sürüm
notunda "Bezier tutamacı" deme, "her kareye anahtar kare" de (adım 10.3).

**12.6 Kaynak satırı (PR / birleştirme, 1 dk).** 3.4 PR açıklamasına ve squash-merge commit'ine:
`Kaynak: temiz oda (OpenCurve'den yalnız "otomatik Bezier yerine tam eğri" fikri); kod alınmadı, yalnız Suflo'nun Rebound (MIT,
adım 9'da atıflı) motoru kullanıldı, yeni bildirim gerekmez.`

### Adım 13: Hız Rampası için Özel eğri editörü (Pro: 'speedramp' kapısı ve 3 deneme hakkı; düzenlemek ücretsiz)

Ne değişti: Hız Rampası'na 12. kart **Özel eğri** (`js/speedramp.js` LIST `{ id: 'ozel', group: 'ozel', hit: null, keys: [] }`).
Anahtarlar seçeneklerden gelir (`o.ozelKeys` [[t, %]], `o.ozelHit`); `SufloSpeedRamp.ozelDogrula` onları 2–8 noktaya, t = 0 ve
t = 1 uçlarına, %10–%1000 hıza oturtur (aynı t'de en çok iki nokta = sert basamak). Sonra her şey hazır eğrilerle aynı yoldan
geçer: yoğunluk, yumuşatma, vuruş anı hizalama, parçalama, Otomatik / Dengeli kaynak bütçesi, uyarı kodları, srcFrames ≤ F.
`hostPlan` ve `KS_applySpeedRamp` değişmedi (host'a dokunulmadı). Düzenleyici `SufloEgriEditor` (adım 10) yeni **'hiz' modu**
(`js/egri.js` › `hizOlustur`; geometri saf ve testli: `SufloSpeedRamp.ozel`). Her hazır kartta **Düzenle** anahtarları kopyalar
(aynı anahtarlar bire bir aynı planı verir; testli). Önizleme her düzenlemede 80 ms ertelenerek, Premiere'e gitmeden yenilenir.
Son özel eğri `suflo.hizRampa.ozel`, adlı özel rampalar (en çok 12) `suflo.hizRampa.ozelKayitlar` anahtarında, yalnız bu
bilgisayarın yerel deposunda (her erişim korumalı; bozuk depo başlangıç eğrisine döner). Temiz oda: OpenCurve'den yalnız "hız
eğrisini noktalarla düzenleme" fikri; kod, tablo, sabit, metin sözdizimi ya da arayüz alınmadı. Rebound'dan kod alınmadı (Suflo'nun
kendi düzenleyicisi ve hız rampası matematiği); yeni bildirim gerekmez.

**13.1 Fiyat (bilgi).** Senin kuralın: Hız Rampası'nın katmanı aynen. Özel eğriyi çizmek, Düzenle, önizleme ve kayıtlar
**ücretsiz**; timeline'a uygulamak `Pro.gate('speedramp')` ve aynı 3 deneme hakkı (hak yalnız en az bir klip rampalanınca düşer).
`js/deneme.js`'e yeni anahtar eklenmedi, Ayarlar › Pro / deneme tablosu değişmedi. Sunucu tarafında yapılacak bir şey yok.

**13.2 Tasarım kararlarını onayla (10 dk, karar).**
(a) **Başlangıç eğrisi:** Özel eğri ilk açıldığında tek derin ağır çekim (%100 → %30 → %100, ağır çekim anı 0,5). Başka bir
başlangıç istersen `js/speedramp.js` › `OZEL_VARSAYILAN`.
(b) **Alt+tık sert basamak:** noktanın hızı solda kalır, aynı anda bir sonraki noktanın hızına atlanır (o da aynıysa öncekine,
o da aynıysa iki katına). İkinci Alt+tık tıklanan noktayı bırakıp basamağı kapatır. Alt'ın Windows'ta Premiere menüsünü
uyandırma ihtimaline karşı aynı iş **Sert basamak** düğmesinde de var (deneme listesi 13.4).
(c) **Yoğunluk ve Yumuşatma özel eğriye de uygulanır** (Düzenle ile kopyalanan eğri hazır karttakiyle aynı rampayı versin diye).
(d) **Uç noktalar** silinmez ve zamanı oynamaz (yalnız hızı); en çok 8 nokta; iki ayrı nokta arasında en az %1 zaman.
(e) **Klavye (inceleme sonrası değişti):** kısayol olmaması Delete'i Premiere'den saklamıyordu (CEP, odak metin kutusunda
değilken tuşu Premiere'e de verir: seçili timeline klibi silinirdi). Artık düzenleyici odaktayken Delete / Backspace panelde tutulur
ve seçili noktayı siler (Eğri sekmesindeki düzenleyici gibi); bir kartın Düzenle'si odaktayken Enter / Space panelde tutulur
(Premiere render / oynatma başlatmaz). Odak gidince ya da sekmeden çıkınca tuşlar Premiere'e geri verilir. Ok tuşları
tutulmaz (playhead Premiere'de kalır). Deneme listesi 13.12.
(g) **Geri al (inceleme sonrası):** Düzenle rozeti kart resminin köşesinde; Düzenle / kayıtlı rampa / Sıfırla, adıyla
kaydedilmemiş elle çizilmiş bir eğrinin üstüne yazınca bildirimde **Geri al** çıkar (hazır kart kopyası, başlangıç eğrisi ya da
kayıtlı rampa yeniden elde edildiği için onlarda çıkmaz). Rozeti kartın dışına taşımak istersen söyle.
(f) **Ritme Rampa'da Düzenle yok:** plan "her önayar kartı" diyor, ama Ritme Rampa'nın sabit anahtarı yok (eğrisi her klipte
o klibin vuruşlarından kurulur); kopyalanacak bir eğri olmadığı için kartında Düzenle gösterilmez. İstersen o anki klibin vuruş
eğrisini kopyalayan bir Düzenle eklenebilir (klibe bağlı, başka klipte anlamı değişir).
Farklı istersen söyle.

**13.3 Paylaşım kodu (bilgi, adım 15'e not).** Plan özel rampaların `SFC1` koduyla `tur: 'hiz'` olarak paylaşılmasını adım 15'e
bırakıyor; bu adımda kod yok. Depo biçimi adım 15'in `keys` alanıyla aynı (`[[t, %]]`, `SufloSpeedRamp.ozelYuzde`), ağır çekim
anı `hit` (0,02–0,98 ya da null); adım 15 `SufloSpeedRamp.ozelDogrula`'yı doğrulayıcı olarak kullanabilir.

**13.4 Premiere'de dene (25–35 dk).** `marketing/v3.4-deneme-listesi.md` › `## 13`. Özellikle **13.3** (sürüklerken panel
takılmıyor mu; yavaş makinede 80 ms gecikme az gelirse `js/hiz-rampasi.js` › `OZEL_GECIKME`), **13.4** (Windows'ta Alt+tık ve
Premiere menüsü), **13.6** (uygulanan parçalar önizlemeyle aynı) ve **13.7** (hızlı özel eğride medya sonu). Hem yeni (2025 / 2026)
hem eski (14.x / 2020, CEF 74) Premiere'de.

**13.5 Yenilikler penceresi ve tanıtım (3.4 yayınında, isteğe bağlı).** `js/app.js` › `YENILIKLER`'e "Hız Rampası'nda kendi
eğrini çiz" maddesi (`sekme: "hiz"`) eklenebilir; tanıtım kartı (`#hiz-tanitim`) hâlâ "11 eğri" diyor, istersen "11 eğri +
özel eğri" yap. Bu adımda bilerek dokunulmadı.

**13.6 Kaynak satırı (PR / birleştirme, 1 dk).** 3.4 PR açıklamasına ve squash-merge commit'ine:
`Kaynak: temiz oda (OpenCurve'den yalnız "hız eğrisini noktalarla düzenleme" fikri; Rebound'dan "ortak düzenleyiciyle hız grafiği"
fikri); kod alınmadı, Suflo'nun kendi SufloEgriEditor'ü ve hız rampası matematiği kullanıldı, yeni bildirim gerekmez.`

### Adım 14: Varışta yaylanma (follow-through) (Pro: Eğri'nin 'curves' kapısı ve ortak 3 deneme hakkı; ayarlar ücretsiz)

Ne değişti: Eğri sekmesinde **Varışta yaylan** kartı (`#egri-yaylan`). Hareket iniş anahtar karesine vardıktan sonra hedefi
varış hızıyla orantılı aşar, salınıp oturur: After Effects'teki overshoot ifadesinin anahtar kareye pişirilmiş hâli.
Matematik adım 9'da Rebound'dan (MIT, atıflı) alınan `dampedSine` / `followThroughAnchors` / `autoDuration`; plan Suflo'nun
`SufloEase.yaylanPlan`'ı: değer_k = taban + hız · genlik · s(t_k − iniş). Varışlar `SufloEgriModel.varislar` (tek varış:
kullanıcının anahtarlarında playhead'i saran çiftin ikinci ucu, bkz. 14.8 (a); **Tüm varışlar**: bekleme ve Eğri iç anahtarları hariç her
iniş), varış hızı boyut başına önceki anahtardan (Eğri'nin son sık anahtarıysa bitiş eğimi). Host `KS_easeBake`'e `tur: 'yaylan'`
öğeleri (`KS_easeYaylanOge`): iniş ve sonraki anahtar değerleriyle doğrulanır, yalnız inişten sonra ve sonraki anahtardan / klip
sonundan önce yazar; `setInterpolationTypeAtKey` varsa tepe / çukurlara seyrek plan + Bezier (5), yoksa 2 karede bir sık plan.
Kayıt `tur: 'yaylan'` (uçsuz, iniş `kenarDegerleri[0]`); satır Geri al'ı, U, bildirim, Tümünü geri al (`KS_easeUndo`) ve adım 11'in
kaldırması (`KS_removeSufloKeys`) siler; inişi silen bir Geçiş / Zoom / Önayar kaldırması ardındaki yaylanmayı da kaldırır. Ayarlar
`suflo.egri.yaylan` anahtarında (yalnız bu bilgisayarın yerel deposu). Temiz oda: plan adımı yalnız Rebound'a dayanıyor; OpenCurve
açılmadı, kod / tablo / metin alınmadı. Yeni bildirim gerekmez (overshoot.js adım 9'da Rebound girdisiyle zaten atıflı).

**14.1 Fiyat (bilgi).** Senin kuralın: "part of 'curves'". Ayarlar, önizleme ve geri almak **ücretsiz**; anahtar karelere yazmak
`Pro.gate('curves')` ve Eğri ile **ortak** 3 deneme hakkı (hak yalnız en az bir varış yazılınca, bir kez). `js/deneme.js`'e yeni
anahtar eklenmedi; Ayarlar › Pro / deneme tablosundaki ad "Eğri (yumuşatma ve varışta yaylanma)", Pro etiketi ve Ayarlar'daki Pro
listesi de yaylanmayı anıyor. Sunucu tarafında yapılacak bir şey yok.

**14.2 Premiere'de Bezier türünü doğrula (5 dk, önemli).** Plan yaylanma anahtarlarını `setInterpolationTypeAtKey(t, 5)` ile
Bezier yapar ("enum'u kfInterp yoklamasıyla doğrula"); yoklama yalnız işlevin VARLIĞINI görebilir, 5'in Premiere'de gerçekten
Bezier olduğunu göremez (Geçiş / Zoom / Hareket önayarlarının seyrek anahtarları da 5 kullanıyor). Deneme listesi **14.3**:
Effect Controls'te yaylanma anahtarı Bezier / Otomatik Bezier görünmeli. Başka bir tür görünürse sürümü yaz; 5 yerine doğru sayı
`jsx/host.jsx` › `KS_easeYaylanOge`'de tek yerde değişir.

**14.3 Tasarım kararlarını onayla (10 dk, karar).**
(a) **Varsayılanlar:** Genlik 0,10 sn, Frekans 3 Hz, Sönüm 6 (oturma ≈ 0,8 sn): 0,5 sn'de 500 px giden (1000 px/sn) bir harekette ilk aşım
≈ 60 px. Daha belirgin istersen `js/ease-curve.js` › `YAYLAN`. Sönüm kaydırıcısı tam sayı adımlı (İngilizce arayüzde ondalık virgül
görünmesin diye).
(b) **Sonraki anahtar başka değerdeyse** taban o anahtara doğru doğrusal gider (plan "iniş değeri" diyor; ama sabit taban senin
sonraki hareketini yaylanma bitene dek bekletip sonra sıkıştırırdı). Kullanıcının o aralıkta Bezier yumuşatması varsa hafif sapma
olabilir.
(c) **2 kareden az yer:** inişten sonra sonraki anahtara / klibin son karesine kadar 2'den az yazılabilir kare varsa yazılmaz
(Tüm varışlar'da sessizce geçilir, tek varışta nedeni söylenir).
(d) **Kayıt uçsuz:** yaylanma kaydı kendi anahtarlarıyla yaşar; kullanıcı sonraki anahtarı taşısa da Geri al bulur. Aynı inişe
yeniden uygulama öncekinin yerine geçer; kullanıcı pencerenin ortasına anahtar koyduysa yeni yaylanma ondan önce biter, eskinin
ötesindeki anahtarları da silinir (onun anahtarı kalır).
(e) **Değerler yalnız Uygula'da okunur:** yoklama taraması değer okumaz (40 özellik × 400 anahtar yavaş olurdu); Uygula işaretli
satırların değerlerini taze taramayla ister.
(f) **Kısayol:** Eğri'nin kısayolları (Enter, U, F, I, V, 1–9) aynı; Varışta yaylan için ayrı tuş eklenmedi (CEP tuş ilgisi
listesi değişmedi). Odak Varışta yaylan kartındayken (kaydırıcı, Tüm varışlar kutusu) Enter yaylanmayı uygular, Eğri'yi değil.
U ve Tümünü geri al yaylanmayı da kaldırır.
Farklı istersen söyle.

**14.4 Premiere'de dene (25–35 dk).** `marketing/v3.4-deneme-listesi.md` › `## 14`. Özellikle **14.3** (Bezier türü), **14.4**
(sonraki anahtarı geçmez, yer reddi), **14.5** (yeniden uygulama ve Geri al) ve **14.9** (Geçişi kaldır yaylanmayı da kaldırır).
Hem yeni (2025 / 2026) hem eski (14.x / 2020, CEF 74) Premiere'de.

**14.5 Pazarlama (bilgi).** "Bezier tutamaçları" iddiası yok: yaylanma anahtar karelere yazılır (her tepe / çukura bir anahtar;
Premiere izin veriyorsa Bezier ara değerleme). Tanıtım kartı artık "Eğriyi ve yaylanmayı düzenlemek, önizlemek ve geri almak
ücretsiz" diyor. `js/app.js` › `YENILIKLER`'e "Eğri: Varışta yaylan" maddesi (`sekme: "egri"`) 3.4 yayınında eklenebilir; bu adımda
bilerek dokunulmadı.

**14.6 Kaynak satırı (PR / birleştirme, 1 dk).** 3.4 PR açıklamasına ve squash-merge commit'ine:
`Kaynak: Rebound (MIT) overshoot.js — adım 9'da js/ease-curve.js'e atıflı uyarlandı (dampedSine, extremaTimes, autoDuration,
followThroughAnchors); varışlar, plan, host yazımı ve arayüz Suflo'nun (temiz oda), yeni bildirim gerekmez.`
İnceleme düzeltme commit'i bu satırı zaten taşıyor (adım 14'ün ilk beş commit'inde yoktu; geçmiş yeniden yazılmadı). Squash-merge
yapmazsan da PR açıklamasına ekle.

**14.7 İnceleme kararlarını onayla (5 dk, karar).** Adım 14 incelemesinden sonra davranış:
(a) **Kapsam:** yalnız Hareket › Konum, Ölçek (ve Ölçek genişliği), Döndürme ve Opaklık yaylanır (plan adımı 14 (4)). Efekt
parametreleri (Bulanıklık, Kırpma %…), Bağlantı noktası ve Titreme önleme satırı Varışta yaylan için seçilmez (Eğri için seçilir).
İngilizce / Türkçe olmayan Premiere'de Hareket parametreleri Premiere'in sabit sırasıyla tanınır (Konum 0, Ölçek 1, Ölçek genişliği 2,
Döndürme 4); bu sıra bir sürümde değişirse `js/egri-model.js` › `YAYLAN_HAREKET_SIRA`.
(b) **Sınırlar:** Opaklık (0–100) ve Ölçek (≥ 0) aşımı kırpılmaz, sınıra sığacak kadar küçültülür (ilk tepe sınıra değer). Aşım
ayarın %10'undan küçülecekse (iniş sınırda: 0'a sönen / 100'e dolan Opaklık, 0'a küçülen Ölçek) yazılmaz: "iniş değeri sınırda".
Önceden 100'e dolan opaklık kırpılıp "yalnız aşağı salınım" yazılıyordu; 0'a sönen klip yeniden görünüyordu. Eşik
`js/ease-curve.js` › `YAYLAN.EN_AZ_ORAN`.
(c) **Tüm varışlar ve süren hareket:** hareketin aynı yönde, varış hızının en az dörtte biriyle sürdüğü ara anahtarda o boyut
yaylanmaz (köşede yalnız duran boyut); hiçbir boyut kalmazsa anahtar sessizce geçilir. Tek varışta (playhead'in çifti) kullanıcı
seçtiği için yine yazılır. Oran `js/egri-model.js` › `DEVAM_ORAN` (0,25).
(d) **Son anahtar tam iniş değerinde:** sönümlü sinüsün pencere sonundaki kalıntısı (%0,5 civarı) yazılmaz; iniş son anahtarsa
özellik senin değerinde oturur.
(e) **Eğri yaylanmanın içindeyse** (iki yaylanma anahtarı arasına Eğri) yaylanma yeniden uygulanmaz; önce o Eğri geri alınır.
Tümünü geri al Eğri kayıtlarını yaylanmalardan önce geri alır.
(f) **40'tan çok varış** (Tüm varışlar) aynı klibin birkaç KS_easeBake çağrısına bölünür (çağrı başına en çok 40 öğe).
Farklı istersen söyle.

**14.8 İkinci inceleme kararlarını onayla (5 dk, karar).**
(a) **Tek varışta iniş kullanıcının anahtarlarından:** Varışta yaylan, Suflo'nun yaylanma anahtarlarını saymadan playhead'i saran
çiftin ikinci anahtarına yazar. Önceden playhead bir yaylanmanın içindeyken o yaylanma yeniden yazılıyordu; yaylanma sonraki
anahtarda kısaldıysa (iniş → sonraki anahtar oturma süresinden kısa) o sonraki anahtar tek varışta hiç seçilemiyordu. Artık bir
yaylanmayı yeniden ayarlamak için playhead o inişe gelen aralıkta olur (Eğri'nin çift kuralıyla aynı); yalnız son anahtarın
yaylanmasında (sonrasında çift yok) playhead yaylanmanın içindeyken de o iniş yeniden yazılır. Satır rozeti ve satırın Geri al'ı
playhead yaylanmanın içindeyken o yaylanmayı göstermeyi sürdürür.
(b) **400'den çok anahtarlı satırda Tüm varışlar yazmaz:** tarama böyle bir özellikte yalnız playhead çevresindeki 400 anahtarı
verir; pencerenin kenarındaki yaylanmalar tanınmadığı için tepeleri iniş sanılıp Suflo'nun kendi anahtarları arasına yaylanma
yazılıyordu, pencere dışındaki inişler de sessizce eski ayarda kalıyordu. Artık satır "400'den çok anahtar kare var; Tüm varışlar'ı
kapatıp varışlara tek tek uygula" nedeniyle atlanır; tek varış çalışır. İleride gerekirse host değer istenen satırın tüm anahtarlarını
(bir okuma bütçesiyle) döndürebilir; bu adımda yapılmadı (40 × 400 değer okuması zaten Uygula'nın üst sınırı).
(c) **Geri al kayıtlarının yeri:** Eğri ve yaylanma kayıtları proje başına ortak en çok 300 (adım 11'in sınıf sınırı); fazlası en
eskilerden atılır. Tüm varışlar sınırsız sayıda varış yazabildiği için tek uygulama önceki tüm eğrilerin Geri al'ını sessizce
silebiliyordu. Artık Tüm varışlar boş yerden çok kayıt yazacaksa önce sorulur (İptal: hiçbir şey yazılmaz, hak düşmez); her
uygulamada (Eğri dahil) yer açmak için eski kayıt atıldıysa sarı bildirim söyler. Tek varış Eğri gibi bir uygulamada en çok 40 kayıt
yazar ve sormaz. Sınırı büyütmek istersen `js/key-records.js` › `PROJE_SINIR` (localStorage boyut sınırları da var).
Farklı istersen söyle.

### Adım 15: Eğri paylaşım kodları ve içe / dışa aktarma (paylaşmak ücretsiz; uygulamak her aracın kendi kapısından)

Ne değişti: Eğri sekmesinde **Paylaş ve içe aktar** kartı (Kodu kopyala, kod kutusu + Yükle, İçe aktar… / Dışa aktar…), kendi
önayarlarını yeniden adlandırma ve sürükleyerek (ya da ◀ ▶ ile) sıralama; Hız Rampası › Özel eğri'de aynısı (kod kutusu, Kodu
kopyala, İçe / Dışa aktar, kayıtlı rampayı Adı değiştir, çipleri sürükle); Geçiş / Zoom / Hareket'in Eğri seçicisinde "kod ya da
cubic-bezier yapıştır" kutusu. Kod: `SFC1.` + base64url(JSON) — `{ v: 1, tur: 'egri', ad, curve }` ya da `{ v: 1, tur: 'hiz', ad,
keys: [[t, %]], hit }`; bağlantı `https://suflo.app/egri#KOD` (`/en/egri`). Dosya: `.suflo-egri` = `{ suflo: 'egri', v: 1, presets:
[{ ad, tur, curve | keys, hit? }] }`, en çok 64 KB / 32 önayar, BOM atılır, ad 40 karakter (denetim ve görünmez yön karakterleri
atılır), eğri başına 8 nokta, sonlu olmayan sayı reddedilir, aralık dışı kırpılır, aynı ad + eğri ikinci kez alınmaz. Çekirdek
`js/ease-curve.js` (SufloEase: paylasimKodla / paylasimCoz / iceAktar / dosyaOku / dosyaYaz / cssCoz), liste işlemleri
`js/egri-model.js` ve `js/speedramp.js`, panel `js/egri.js` (SufloEgriPaylas: pano, `window.cep.fs` pencereleri, dağıtım) ve
`js/hiz-rampasi.js`. Site: `docs/egri.html`, `docs/en/egri.html`, `docs/js/egri-sayfa.js` ve panelin bayt bayt kopyası
`docs/js/ease-curve.js` (test denetler). Panel dosya listesi değişmedi (yeni runtime dosyası yok; paketleme aynı).

**15.1 Fiyat (bilgi).** Senin kuralın: "free to create/share codes; applying goes through the Pro 'curves' gate". Kod oluşturmak,
kopyalamak, yapıştırmak, içe / dışa aktarmak, önayarı adlandırmak ve sıralamak **ücretsiz** ve kapısız (deneme hakkı düşmez).
Uygulamak değişmedi: Eğri sekmesinde içe aktarılan eğri `Pro.gate('curves')` (3 deneme hakkı) ile yazılır. İki yorum, farklı
istersen söyle: (a) içe aktarılan bir **Hız Rampası** eğrisi Hız Rampası'nın kendi kapısından (`'speedramp'`, adım 13'ün kuralı)
uygulanır, ikinci bir 'curves' kapısı eklenmedi; (b) Geçiş / Zoom / Hareket seçicisine yapıştırılan eğri o aracın kapısından geçer
(adım 12'nin kuralı). `js/deneme.js`'e yeni anahtar eklenmedi.

**15.2 Dış eğri aracının dışa aktarma dosyasını dene (10 dk, önemli).** Plan, OpenCurve'ün dışa aktarma dosyasının yalnız JSON
biçimini (`{ opencurve: 1, presets: [{ name, curve }] }`) okumamızı söylüyor; temiz oda kuralı yüzünden o araç **hiç açılmadı**, bu
yüzden `curve` alanının içi tahminle, geniş okunuyor: tek kübik (`"cubic-bezier(a,b,c,d)"`, `[x1,y1,x2,y2]`, `{x1,y1,x2,y2}`) ve
çok noktalı (`[[x,y],…]`, `{ points | pts: [{ x, y, in / out: {x,y} ya da [x,y] }] }`, tutamaçlar MUTLAK koordinat varsayılır);
gerisi "tanınmayan eğri" uyarısıyla atlanır. Elinde o araçla yapılmış gerçek bir dışa aktarma dosyası varsa (kendi bilgisayarında,
aracı kodunu açmadan yalnız kullanarak) Suflo'da **İçe aktar…** ile dene (deneme listesi **15.8**): şekiller aynı görünüyor mu,
kaç tanesi atlandı? Tutamaçlar göreli çıkarsa ya da başka bir alan adı kullanılıyorsa bana yalnız **dosyanın biçimini** (bir örnek
dosya) gönder; okuyucu `js/ease-curve.js`'teki işaretli "DIŞ BİÇİM OKUYUCUSU" bölümünde, tek yerde güncellenir. O aracın adı depoda
yalnız o bölümde geçer (test denetler); panel ve site metinleri "bir eğri aracının JSON dışa aktarması" der.

**15.3 suflo.app/egri sayfasını yayınla (3.4 yayınında, 2 dk).** Panelin Kodu kopyala'sı `https://suflo.app/egri#KOD` (İngilizce
arayüzde `/en/egri`) bağlantısı üretir; `docs/egri.html` ve `docs/en/egri.html` 3.4 ile birlikte yayınlanmalı (site haritasına
eklendi). Sayfa kodu tarayıcıda, panelin kopyası `docs/js/ease-curve.js` ile çözer; sunucuya bir şey gitmez (CSP `connect-src
'none'`). Yayından sonra deneme listesi **15.13**. Ana sayfaya ya da blog'a bağlantı bu adımda eklenmedi (isteğe bağlı).

**15.4 Premiere'de dene (20–30 dk).** `marketing/v3.4-deneme-listesi.md` › `## 15`. Özellikle **15.2** (kopyala → yükle, pano),
**15.6 / 15.7** (Windows ve macOS'ta kaydetme / açma pencereleri, uzantısız ad, 64 KB, BOM), **15.11** (sürükle-bırak CEF 74'te) ve
**15.4** (seçicide Enter / Esc Premiere'e gitmez). Hem yeni (2025 / 2026) hem eski (14.x / 2020, CEF 74) Premiere'de.

**15.5 Tasarım kararlarını onayla (5 dk, karar).**
(a) **Tek kod düzenleyiciye, birden çok kod önayarlara:** tek eğri kodu yüklenince önayar olarak kendiliğinden kaydedilmez (Önayar
olarak kaydet kodun adını kullanır); dosya ya da alt alta birkaç kod doğrudan önayarlara eklenir. Hız Rampası kodu Eğri sekmesine
yapıştırılırsa Hız Rampası'nın kayıtlı rampalarına eklenir; eğri kodu Hız Rampası'na yapıştırılırsa yönlendirme metni çıkar.
(b) **Dışa aktarma her sekmenin kendi listesi:** Eğri'nin dosyası yalnız eğri önayarlarını (en çok 24), Hız Rampası'nınki yalnız
kayıtlı rampaları (en çok 12) taşır; ikisi birlikte 32 önayar sınırını aşabileceği için tek dosyada birleştirilmedi. İçe aktarma
her dosyayı türüne göre dağıtır.
(c) **Ad çakışması:** içe aktarılan önayar aynı ad + aynı eğriyse atlanır; aynı ad başka eğriyse "Ad (2)" olarak eklenir (Hız
Rampası'nın Kaydet'i adla üzerine yazdığı için içe aktarma hiçbir kaydın üstüne yazmaz).
(d) **cubic-bezier yapıştırma:** düz `cubic-bezier()`, onu içeren CSS bildirimi, yalın dört sayı ve `ease` / `linear` / `ease-in` /
`ease-out` / `ease-in-out` kabul edilir; x 0–1 dışı reddedilir, y -1–2'ye kırpılır ve kullanıcıya söylenir. Elle yazılan
`cubic-bezier()` alanının eski sıkı kuralı (`fromCss`) API'de duruyor.
(e) **Paylaşım sayfası:** plan suflo.app/egri'yi isteğe bağlı sayıyordu; Kodu kopyala'nın bağlantısı boş bir sayfaya gitmesin
diye yapıldı (stil sayfasının düzeniyle, panelin çözücüsüyle).
Farklı istersen söyle.

**15.7 İnceleme düzeltmeleri (bilgi, 2 dk).** (a) **Birden çok kod:** kod kutusu artık birkaç satırlık (textarea; Enter yükler,
Shift+Enter alt satır) ve 64 KB'a kadar dosya metnini kesmez. Yapıştırılan metin her `SFC1.` başından bölünür: alt alta, boşlukla ya
da bitişik kodlar ve bağlantılar ayrılır; "Kodu kopyala"nın kod + bağlantı çifti tek kod sayılır. Önceden son satır bağlantıysa
yalnız sonuncusu alınıyordu. Tek kod bekleyen yerler (cubic-bezier alanı, Geçiş / Zoom / Hareket seçicisi) iki farklı koda "Birden
çok farklı kod var…" der, birini sessizce seçmez; cubic-bezier alanı adlı çok noktalı kodları kesmesin diye 4096 karakter alır.
(b) **Hız Rampası ad kutusu:** düzenleyiciye başka eğri gelince (Düzenle, Sıfırla, Geri al, kod) seçili kayıt bırakılır ve kutudaki
o kaydın adı silinir; koddan gelen ad başka bir kaydınsa "Ad (2)" önerilir. Kaydet böylece kullanıcının bir rampasının üstüne başka
eğri yazmaz (elle aynı adı yazarsan yine günceller, adım 13'ün kuralı). (c) **Dışa aktar:** uzantı pencereden sonra eklenince aynı
adlı dosya varsa üzerine yazmadan önce sorulur. (d) **Lisans:** `js/ease-curve.js`'in başında Rebound'un MIT lisansı artık tam metniyle;
suflo.app'teki bayt bayt kopyası (THIRD_PARTY_NOTICES.md sitede yok) bildirimi kendisi taşır. (e) README'deki dış aracın adı
kaldırıldı ("yalnız dosya biçimi okunur"); test README'yi de tarar. Deneme listesi **15.15**.

**15.6 Kaynak satırı (PR / birleştirme, 1 dk).** 3.4 PR açıklamasına ve squash-merge commit'ine:
`Kaynak: adım 15 temiz oda — paylaşım kodu, .suflo-egri dosyası, cubic-bezier yapıştırma ve arayüz Suflo'nun; OpenCurve açılmadı,
yalnız planın tanımladığı dışa aktarma dosya biçimi okunur (kod / tablo / sözdizimi / arayüz alınmadı), bildirim gerekmez; Rebound
kodu eklenmedi (docs/js/ease-curve.js panelin kopyası, THIRD_PARTY_NOTICES Rebound girdisinde).`
