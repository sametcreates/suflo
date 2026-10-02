# Suflo 3.0 — Premiere deneme listesi

Bu sürümdeki kodun tamamı Windows, macOS ve Linux'ta otomatik testlerden geçti;
paneller tarayıcıda sahte verilerle denendi. **Premiere'in kendisinde** denenmesi
gerekenler aşağıda. Her maddeyi işaretle; bir şey beklendiği gibi çalışmazsa
`Ayarlar → Destek → Günlüğü kopyala` ile günlüğü al ve hangi madde olduğunu yaz.

Kurulum: dalı ZXP olarak paketle (`tools/package.ps1`) ya da geliştirici kurulumu
(`tools/install.ps1`) ile Premiere'e yükle. Denemeleri **kopya bir projede** yap.

---

## 1. Temel (her sürümde)
- [ ] **İlk iş:** Bir sekans açıkken Ayarlar → **Suflo Doctor → Taramayı başlat** → "Suflo 3.0 Premiere API'leri" satırı yeşil mi? Sarıysa raporu kopyalayıp gönder (hangi özelliğin bu sürümde çalışmayacağını söyler).
- [ ] Panel açılıyor, üst çubukta **v3.0.0** yazıyor, "bağlanıyor" kalmıyor.
- [ ] İlk açılışta **"Suflo 3.0"** yenilikler penceresi çıkıyor; bir maddeye basınca ilgili bölüm açılıyor; panel yeniden açılınca pencere bir daha gelmiyor.
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
- [ ] **▶ Dinle** → kesimler uygulanmış ses panelde çalıyor; işaretlenen kelimeler duyulmuyor, timeline değişmiyor.
- [ ] Otomatik Kesim sonucunda da **▶ Dinle** sessizlikleri çıkarılmış sesi çalıyor.
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
- [ ] 9:16 sekansta stil önizlemesi dikey oynuyor; **Shorts güvenli alanını göster** açıkken kırmızı bölgeler çıkıyor ve altyazı bu bölgelerin dışında.
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

## 4b. Sahne algılama ve vuruşlarda bölme
- [ ] Kesim → **Sahne algılama**: birkaç farklı çekimden oluşan bir klibi seç → **Sahneleri bul** → değişim sayısı mantıklı.
- [ ] **Marker at** → sahne başlarında "Sahne" marker'ları.
- [ ] **Sahnelerde böl** → yalnız seçili klip (ve bağlı sesi) bölünüyor; müzik katmanı bölünmüyor.
- [ ] Ritim → müzik klibini analiz et → B-roll klibini seç → **Seçili klibi vuruşlarda böl** → B-roll vuruşlarda bölünüyor, müzik bölünmüyor.
- [ ] Birden çok klip seçip **Sesi iyileştir** → hepsi sırayla işleniyor, her biri kendi altına.
- [ ] Kesim → **Sesi iyileştir**: konuşmalı klibi seç → **Ölç** (LUFS değeri) → **Sesi iyileştir** → temiz ses altta yeni kanalda, orijinal ses kapalı (gri); **dudak senkronu kaymamış**; ses daha temiz ve yüksek.

## 5. Bölümler *(Altyazı editörü → Bölümler (YouTube))*
- [ ] **Bölüm öner** → 0:00 dahil liste geliyor, "YouTube kurallarına uygun" yazıyor.
- [ ] **AI ile başlıkla** (Groq anahtarı) → anlamlı Türkçe başlıklar.
- [ ] Başlık/zaman düzenlenebiliyor; kural dışı olunca uyarı çıkıyor.
- [ ] **YouTube metnini kopyala** → panoya `0:00 Başlık` biçiminde geliyor.
- [ ] **Marker olarak ekle** → timeline'da başlıklı marker'lar (mümkünse Chapter türünde). Tekrar basınca eskiler yenileniyor.
- [ ] Platformu **TikTok** seç → **✨ Paylaşım metni yaz** → kanca önerisine tıklayınca açıklamanın ilk satırı oluyor, etiket alanı gizli, 5 hashtag.
- [ ] **✨ Paylaşım metni yaz** (YouTube) → 5 başlık (tıkla → kopyala), açıklamanın sonunda bölümler ve hashtag'ler, etiketler kopyalanıyor.
- [ ] **B-roll önerileri** → **B-roll anlarını bul** → kartlar; zamana tıklayınca playhead oraya gidiyor; **Pexels'te ara** tarayıcıda açılıyor; **Marker olarak ekle** → yeşil süreli marker'lar, viral marker'lara dokunulmuyor.

## 5b. Viral anlar ve çift dilli altyazı
- [ ] En az 5 dakikalık konuşmanın altyazısı → **Viral anlar (Shorts)** → **Viral anları bul** → puanlı 3–5 kart.
- [ ] Bir kartta **In/Out ayarla** → sekansın In/Out'u o ana geliyor, playhead başında; Ctrl+M ile yalnız o parça dışa aktarılıyor.
- [ ] **Marker olarak ekle** → kırmızı, süreli marker'lar; tekrar basınca eskiler yenileniyor, senin marker'larına dokunulmuyor.
- [ ] **Shorts sekansları oluştur** (9:16 açık) → "Suflo Shorts" kutusunda her an için bir sekans + "9x16" dikey kopyası; dikeyde konuşan kişi kadrajda; orijinal sekansın In/Out'u değişmemiş.
- [ ] Oluşan bir Shorts sekansını (yatay ya da 9x16) aç → Altyazı sekmesinde **"Bu Shorts'un altyazısını ana videodan al"** düğmesi → satırlar 0:00'dan başlıyor ve konuşmayla eşleşiyor; Suflo Stiliyle eklenebiliyor.
- [ ] Altyazıyı İngilizceye çevir → **çift dilli** anahtarı görünüyor → aç → SRT indir: her satırda üstte Türkçe, altta İngilizce.
- [ ] **Çok dilli SRT paketi** → EN + DE seç → Masaüstünde "Suflo altyazilar …" klasörü: kaynak dil + en.srt + de.srt; zamanlar aynı; ekrandaki altyazı değişmedi.
- [ ] Çift dilli açıkken **Normal altyazı izi ekle** → Premiere'de iki satırlı caption'lar.
- [ ] Konuşma dili **Deutsch** seçilerek Almanca bir klip doğru yazıya dökülüyor.

## 6. Otomatik emoji *(Altyazı editörü araç çubuğu)*
- [ ] **Otomatik emoji** → birkaç satırın sonuna anlamlı emoji ekleniyor, art arda değil.
- [ ] Ctrl+Z ile geri alınıyor.
- [ ] Normal caption izine eklenince emojiler renkli görünüyor.

## 6a. Anahtar kelime vurgusu *(Altyazı editörü araç çubuğu)*
- [ ] **Otomatik vurgu** → sayılar (örn. `*100 TL*`) ve satır başına bir önemli kelime yıldızla işaretleniyor; Ctrl+Z geri alıyor.
- [ ] Satırda bir kelimeye gelip **Ctrl+B** (Mac ⌘B) → kelime `*yıldızlanıyor*`, tekrar basınca kalkıyor; "Bu düzeltmeyi öğren" önerisi çıkmıyor.
- [ ] Bir satıra elle `*kelime*` yaz → Hormozi / Neon / Belgesel önizlemesinde o kelime vurgu renginde.
- [ ] Suflo Stili ile ekle → katmanda yıldız görünmüyor, kelime vurgulu.
- [ ] SRT indir ve **Normal altyazı izi ekle** → yıldızlar yok, metin temiz.
- [ ] Birkaç kelimeyi vurgula → Otomatik Zoom (Akıllı) → vurgulu kelimelerde punch-in; Akıllı SFX → vurgulu kelimede efekt önerisi ("para" → Para efekti).

## 6b'. Kanca başlığı *(sol menü → Kanca Başlığı)*
- [ ] Transkript varken **✨ AI ile öner** → 5 kısa başlık, vurgulu kelime sarı; birine tıkla → kutuya yazılıp önizleniyor.
- [ ] Başlık yaz → **Önizle** → kare görünüyor; stil/süre/konum değişince önizleme yenileniyor.
- [ ] Playhead'i bir yere getir → **Playhead'e ekle** → başlık tam o anda, boş üst katmanda; arka plan şeffaf.
- [ ] 9:16 sekansta başlık üstte ve kadraja sığıyor.
- [ ] Viral anlar kartında **Başlık ekle** → başlık o anın başına geliyor.

## 6b. Güvenlik ve sağlamlık
- [ ] Yeni bir model indir (örn. Base) → kurulum "Model doğrulanıyor…" adımından geçiyor.
- [ ] Ayarlar → güncelleme denetimi: (bir sonraki sürümde) indirilen paket "Doğrulanıyor…" adımından geçiyor.
- [ ] Bir saatlik sekansta "Sekans" kapsamıyla altyazı al → işlem sırasında panel donmuyor, bittiğinde bekleyen işlem yığını yok.
- [ ] Adında `#` olan bir klasördeki projede "Kare al" önizlemesi görünüyor.

## 7. Pro sunucusu *(Hostinger)*
- [ ] Yeni `server/pro-v1/index.php` yüklendi.
- [ ] 3.0 panelde **Pro içerik eşitleme** çalışıyor (indirme izni cihaza bağlı).
- [ ] 2.9.x panelde de eşitleme hâlâ çalışıyor (`require_instance` = false iken).
- [ ] Kullanıcıların çoğu 3.0'a geçince `config.php` içinde `'require_instance' => true` yap.

## 8. Ücretsiz kullanıcı
- [ ] Pro olmayan kurulumda Konuşmadan kes, Suflo Stilleri ekleme ve Geçişler Pro penceresini açıyor; önizlemeler açık.
- [ ] Bölümler ve Otomatik emoji ücretsiz çalışıyor.
