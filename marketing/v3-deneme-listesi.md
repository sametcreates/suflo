# Suflo 3.0 — Premiere deneme listesi

Bu sürümdeki kodun tamamı Windows, macOS ve Linux'ta otomatik testlerden geçti;
paneller tarayıcıda sahte verilerle denendi. **Premiere'in kendisinde** denenmesi
gerekenler aşağıda. Her maddeyi işaretle; bir şey beklendiği gibi çalışmazsa
`Ayarlar → Destek → Günlüğü kopyala` ile günlüğü al ve hangi madde olduğunu yaz.

Kurulum: dalı ZXP olarak paketle (`tools/package.ps1`) ya da geliştirici kurulumu
(`tools/install.ps1`) ile Premiere'e yükle. Denemeleri **kopya bir projede** yap.

---

## 1. Temel (her sürümde)
- [ ] Panel açılıyor, üst çubukta **v3.0.0** yazıyor, "bağlanıyor" kalmıyor.
- [ ] Bir klipten **Altyazı oluştur** çalışıyor (yerel motor).
- [ ] Groq anahtarıyla **bulut** altyazı: Türkçe karakterler (ş ğ ü ö ç ı İ) bozulmadan geliyor. *(3.0 düzeltmesi)*
- [ ] Çeviri: TR → EN çevir; çeviri sürerken bir satırı elle düzelt → o satırın üzerine yazılmadığını gör. *(3.0 düzeltmesi)*
- [ ] **Normal altyazı izi ekle** caption izini oluşturuyor.

## 2. Konuşmadan kes *(Kesim sekmesi → en altta)*
- [ ] İçinde "ııı / eee" ve tekrar olan konuşmalı bir klibi seç → **Konuşmayı yazıya dök**.
- [ ] Kelimeler listeleniyor; dolgular turuncu, tekrarlar pembe ve üstü çizili.
- [ ] Bir kelimeye tıkla → üstü çiziliyor, özet (kelime · kesim · −sn) güncelleniyor. Tekrar tıkla → geri geliyor.
- [ ] "Ara sözler" anahtarını aç → *şey, yani, işte* işaretleniyor.
- [ ] Duraksama "0,6 sn'ye kısalt" → uzun boşluklarda ⏸ etiketi görünüyor.
- [ ] **Kesimleri uygula** (Kopya sekansta) → yeni sekans açılıyor, kesimler doğru yerde, **ses ve görüntü senkron**.
- [ ] Kesim sonrası konuşma doğal duyuluyor (kelime ortasından kesilmiyor). Kesilmişse: hangi kelimede, günlükle bildir.
- [ ] Timeline'da boş yere tıklayınca liste kaybolmuyor; başka klip seçince sıfırlanıyor.

## 3. Suflo Stilleri *(Altyazı → Stil)*
- [ ] Stil bölümünün başında **Suflo Stilleri** (12 kart) görünüyor; altında Premiere Şablonları.
- [ ] Bir karta tıkla → önizlemede **gerçek render** oynuyor (ffmpeg gerekir).
- [ ] Altyazı oluşturduktan sonra **"Hormozi ile ekle"** → üst video kanalına şeffaf `.mov` katmanı geliyor, altyazı zamanları konuşmayla eşleşiyor.
- [ ] Satır modunda (42 karakter) oluşturulmuş altyazıyla da kelime stilleri anlamlı çalışıyor (kelimeler sırayla vurgulanıyor).
- [ ] **CapCut Clean / SaaS Glass / Premium**: yazı tipi Montserrat görünüyor (önceden yanlış fonttu). *(3.0 düzeltmesi)*
- [ ] Neon, Daktilo, Zıplayan, Karaoke Dolgu tek tek denendi; görüntüde taşma/kesilme yok.
- [ ] 9:16 dikey sekansta da konum doğru.
- [ ] Bir Premiere şablonu (MOGRT) seçince düğme "<şablon> ile ekle" oluyor ve MOGRT yolu eskisi gibi çalışıyor.
- [ ] Paneli kapat-aç → seçili Suflo stili hatırlanıyor.

## 4. Geçişler *(sol menü → Geçişler)*
- [ ] Kartların üzerine gelince önizleme animasyonu oynuyor.
- [ ] İki klibi art arda koy, playhead'i birleşim yerine getir → **Zoom İçeri → Uygula**.
- [ ] Giden klibin sonunda ve gelen klibin başında Ölçek keyframe'leri oluşuyor; geçiş akıcı.
- [ ] Whip Sola / Sağa / Yukarı / Aşağı: klip kadrajdan çıkıp diğeri karşı yönden giriyor.
- [ ] Aynı kesime ikinci kez farklı geçiş uygula → eski keyframe'ler birikmeden yenisi geliyor.
- [ ] Kısa klipte (< 0,5 sn) uyarı mesajıyla süre kısaltılıyor.
- [ ] Playhead kesimden uzaktayken "kesim yok" uyarısı veriyor.
- [ ] Ölçeği/konumu önceden değiştirilmiş (örn. %120) klipte geçiş o değerden başlayıp ona dönüyor.
- [ ] Hem eski Premiere'de (piksel konum) hem yenisinde (normalize konum) whip doğru yönde.

## 5. Bölümler *(Altyazı editörü → Bölümler (YouTube))*
- [ ] **Bölüm öner** → 0:00 dahil liste geliyor, "YouTube kurallarına uygun" yazıyor.
- [ ] **AI ile başlıkla** (Groq anahtarı) → anlamlı Türkçe başlıklar.
- [ ] Başlık/zaman düzenlenebiliyor; kural dışı olunca uyarı çıkıyor.
- [ ] **YouTube metnini kopyala** → panoya `0:00 Başlık` biçiminde geliyor.
- [ ] **Marker olarak ekle** → timeline'da başlıklı marker'lar (mümkünse Chapter türünde). Tekrar basınca eskiler yenileniyor.

## 6. Otomatik emoji *(Altyazı editörü araç çubuğu)*
- [ ] **Otomatik emoji** → birkaç satırın sonuna anlamlı emoji ekleniyor, art arda değil.
- [ ] Ctrl+Z ile geri alınıyor.
- [ ] Normal caption izine eklenince emojiler renkli görünüyor.

## 7. Pro sunucusu *(Hostinger)*
- [ ] Yeni `server/pro-v1/index.php` yüklendi.
- [ ] 3.0 panelde **Pro içerik eşitleme** çalışıyor (indirme izni cihaza bağlı).
- [ ] 2.9.x panelde de eşitleme hâlâ çalışıyor (`require_instance` = false iken).
- [ ] Kullanıcıların çoğu 3.0'a geçince `config.php` içinde `'require_instance' => true` yap.

## 8. Ücretsiz kullanıcı
- [ ] Pro olmayan kurulumda Konuşmadan kes, Suflo Stilleri ekleme ve Geçişler Pro penceresini açıyor; önizlemeler açık.
- [ ] Bölümler ve Otomatik emoji ücretsiz çalışıyor.
