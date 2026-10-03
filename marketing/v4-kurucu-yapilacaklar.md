# Kurucunun yapacakları (v3.1 / v4 yol haritası)

Kodla çözülemeyen, gerçek dünya girdisi isteyen işler. Her özellik kendi bölümünü ekler. Bu işler yapılmadan da ilgili özellik çalışır; aşağıdaki adımlar onu tamamlar.

## SEO ve yardım sayfaları (docs/blog)

Yeni sayfalar:

- `docs/blog/premiere-suflo-paneli-gorunmuyor.html`: panel görünmüyor / boş / açılmıyor sorun giderme rehberi
- `docs/blog/premiere-turkce-altyazi-otomatik.html`: Premiere'de otomatik Türkçe altyazı, adım adım
- `docs/blog/autocut-firecut-alternatifi.html`: AutoCut ve FireCut ile dürüst karşılaştırma
- `docs/blog/opusclip-alternatifi-premiere.html`: uzun videodan Shorts, OpusClip ile karşılaştırma

Hepsi `docs/sitemap.xml` ve `docs/blog/index.html` içinde. `tests/test-blog.js` yapısal veriyi, canonical'ı, site haritasını ve sorun giderme rehberinin kurucularla tutarlılığını denetler.

**Neden senin işin:** Rakip fiyatları yol haritası araştırmasından (`marketing/v4-yol-haritasi.json` → `plan.competitor_table`) alındı. O oturumda üreticilerin sitelerine doğrudan erişilemedi; rakamlar arama sonucu özetlerinden ve üçüncü taraf incelemelerden derlendi. Ayrıca Premiere 25.6 ve sonrasındaki menü adı (`Window > Extensions (Legacy)`) gerçek bir Premiere'de denenmedi. Sayfalar bu yüzden "Ekim 2026 itibarıyla" diye tarihli ve kaynaklı.

### 1. Rakip fiyatlarını doğrula (tanıtmadan önce, sonra her 3 ayda bir)

1. Şu sayfaları aç ve rakamları sayfalardaki tablolarla karşılaştır:
   - FireCut: https://firecut.ai/pricing/all/ → Starter / Pro / Max aylık ve yıllık fiyat, deneme süresi (7 gün), aylık planlarda iade süresi (3 gün).
   - AutoCut: https://www.autocut.com/en/ (fiyat bölümü) → Basic / AI aylık ve yıllık fiyat, deneme süresi (14 gün), DaVinci Resolve desteği.
   - OpusClip: https://www.opus.pro/pricing → Free (60 kredi/ay, filigran), Starter, Pro aylık ve yıllık; kredilerin süresi (60 gün); Premiere XML dışa aktarmanın hangi planda olduğu.
2. Fark varsa ilgili HTML dosyasında üç yeri birlikte güncelle: "Kısa karşılaştırma" tablosu, "Bir yılda ne ödersin?" tablosu (çarpımları yeniden hesapla) ve fiyattan söz eden SSS cevapları. SSS metni sayfada iki kez geçer: görünen `<details>` ve `<script type="application/ld+json">` içindeki FAQPage. İkisi birebir aynı olmalı (`tests/test-blog.js` denetler).
3. Tarihleri güncelle: "Ekim 2026 itibarıyla" ve "Fiyatlar: Ekim 2026" ifadelerini yeni aya çevir, `Güncel:` satırını, JSON-LD'deki `dateModified` değerini ve `docs/sitemap.xml` içindeki `<lastmod>` değerini değiştir.
4. `node tools/test.js` çalıştır, commit'le.

### 2. Premiere 2026'daki menü adını doğrula

1. Windows'ta ve Mac'te Premiere 26.x'i aç, Suflo'yu menüde bul.
2. Panel `Window > Extensions (Legacy) > Suflo` altında değilse `docs/blog/premiere-suflo-paneli-gorunmuyor.html` (hızlı kontrol, 1. bölüm, temiz kurulum adımları, HowTo ve SSS) ile `docs/blog/premiere-turkce-altyazi-otomatik.html` (1. adım) içindeki menü yolunu düzelt.
3. `tests/test-blog.js` içindeki "rehber yeni ve eski menu yolunu veriyor" denetimini aynı yola çevir.

### 3. Google'a haber ver

1. Google Search Console → Site haritaları → `https://suflo.app/sitemap.xml` adresini yeniden gönder.
2. URL denetimi → dört yeni adres için tek tek "Dizine eklenmesini iste":
   - https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor
   - https://suflo.app/blog/premiere-turkce-altyazi-otomatik
   - https://suflo.app/blog/autocut-firecut-alternatifi
   - https://suflo.app/blog/opusclip-alternatifi-premiere

### 4. Suflo değiştikçe sayfaları güncel tut

- Suflo Pro fiyatı değişirse karşılaştırma sayfalarındaki tutarları ve SSS'leri güncelle: `grep -n "749" docs/blog/*.html`.
- Yeni özellik yayına girince (ör. podcast kamera geçişi, senaryoya göre tekrar temizliği, marka kiti, tek tıkla ilk taslak) "Suflo'da (henüz) olmayanlar" listelerinden çıkar. Yayına girmeden listeden çıkarma.
- Pro'ya iade ya da deneme hakkı gelirse "Pro'da iade yok" maddesini ve deneme satırlarını güncelle.
- Sorun giderme rehberinin adresi (`https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor`) Suflo Doctor ve kurucu bitiş metninden bağlanacak; adresi değiştirme.
