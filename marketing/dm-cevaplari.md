# DM ve yorum cevapları

Kopyala, yapıştır, gerekirse ismi ekle. Hepsi kısa tutuldu: uzun cevap okunmuyor.

**Altın kural:** ilk cevapta tek bir eylem iste. İki şey isteyen mesajın ikisi de yapılmıyor.

---

## 1. En sık gelen: "nasıl indiriyorum / link"

> suflo.app — sitede yeşil butondan indir, kurulum 2 dakika. Takılırsan yaz, birlikte hallederiz.

Yorum altına (kısa):

> suflo.app 👌

---

## 2. "Gerçekten ücretsiz mi? / nerede para kazanıyorsun?"

Bu soruya dürüst cevap veriyoruz, çünkü şüphe kurulumu durduruyor.

> Gerçekten ücretsiz, kayıt bile istemiyor. Kaynak kodu açık (MIT), yani kimse sonradan paralı yapamaz. Ben kurgu yapıyorum, bu aracı kendime yazdım; herkese açmanın maliyeti yok.

---

## 3. "Mac'te çalışıyor mu?"

> Evet. Mac'te motor Homebrew ile kuruluyor, panel sana adım adım söylüyor. M1/M2/M3'te Apple GPU'yu kullanıyor, hızlı.

Homebrew bilmiyorsa devamı:

> Homebrew yoksa panelin verdiği komutu Terminal'e yapıştırman yeterli, bir kere yapılıyor. Ya da hiç uğraşmadan Ayarlar'dan ücretsiz Groq anahtarıyla bulut motorunu seç, aynı sonuç.

---

## 4. "Premiere'in hangi sürümü gerekiyor?"

> 2020 ve sonrası çalışıyor, 2024/2025'te test ettim. Panel Pencere > Uzantılar altında çıkıyor.

---

## 5. "İnternet gerekiyor mu?"

> Kurulumdan sonra hayır. Model bir kere iniyor, sonra her şey kendi bilgisayarında. Sesin hiçbir yere gitmiyor.

---

## 6. "Kurdum ama panel görünmüyor"

En sık kurulum sorunu. Sırayla sor, hepsini birden sorma:

> Premiere'i tamamen kapatıp açtın mı? Panel: Pencere > Uzantılar > Suflo altında.

Hâlâ yoksa:

> Bir ihtimal imzasız uzantı engeli. Sitedeki kurulum bölümünde tek satırlık çözüm var: suflo.app/#kurulum — ordaki adımı yapıp Premiere'i yeniden aç.

---

## 6b. "ffmpeg bulunamadı" diyor

**v1.7.9'da çözüldü** — panel ffmpeg'i artık kendisi indiriyor. Gelen bu şikâyetin cevabı tek satır:

> Bunu 1.7.9'da çözdüm, panel ffmpeg'i kendisi kuruyor artık. suflo.app'ten son sürümü indirip kurar mısın? Bir şey yapmana gerek kalmayacak.

Eski sürümde kalmak isterse ya da indirme takılırsa:

> Ayarlar > ffmpeg > "ffmpeg'i indir ve kur" düğmesine bas. Yaklaşık 100 MB, bir kerelik. Takılırsa Ayarlar > Destek > "Sorun bildir"e basıp bana yolla.

Neden gerekiyor diye sorarsa:

> ffmpeg sesi videodan ayırıp yapay zekânın anladığı formata çeviriyor. Hem yerel hem bulut motorunda gerekli. Eskiden Windows'un kendi kurucusuna güveniyordum ama her makinede çalışmıyordu, o yüzden artık panel kendisi indiriyor.

---

## 7. "Motor inmiyor / hata veriyor"

> Panelde Ayarlar (sağ üstteki dişli) > Destek > "Sorun bildir"e bas. Günlüğü kopyalayıp açılan sayfaya yapıştır, ne olduğunu görüp düzelteyim.

Sabırsız kullanıcıya alternatif:

> Beklemek istemiyorsan Ayarlar'dan "Groq" motorunu seç, ücretsiz anahtar alıp yapıştır; indirme derdi olmadan çalışır.

---

## 8. "Türkçe ne kadar doğru çıkıyor?"

Abartma. Beklenti yönetimi şikâyeti önler.

> Temiz seste bence elle düzeltmeye neredeyse gerek kalmıyor. Gürültülü ortamda birkaç kelime kaçıyor, ama panelin içinde düzenleyip öyle uyguluyorsun, dışa aktarıp geri almaya gerek yok.

---

## 9. "Ne kadar sürüyor?"

> Bende 1.5 dakikalık ses birkaç saniyede bitiyor (RTX 5060 Ti). Ekran kartı yoksa daha uzun ama yine de video süresinden kısa.

---

## 10. "Hangi diller?"

> Otomatik algılıyor, 99 dil destekliyor. Türkçe ve Azerice dahil, ki Premiere'in kendi altyazısında ikisi de yok.

---

## 11. "Azerbaycan'dan / yurt dışından yazanlar"

Azerice yorumlar geldi, bu kitle değerli: Premiere'in Azerice desteği hiç yok.

> Bəli, Azərbaycan dili də dəstəklənir 🙌 suflo.app — pulsuzdur.

(İngilizce yazana:)

> Yes, it works in English too and it's free: suflo.app

---

## 12. "Kaynak kodu var mı? / güvenli mi?"

> github.com/sametcreates/suflo — hepsi açık, MIT. İstersen kodu okuyup kendin derleyebilirsin.

---

## 13. "CapCut / Kapix / Subs'tan farkı ne?"

Rakip kötülemiyoruz, farkı söylüyoruz.

> Onlar iyi araçlar, ama ya abonelik ya kredi istiyor. Suflo ücretsiz ve sesin bilgisayardan çıkmıyor. Bir de Premiere'in kendi altyazısı Türkçe bilmiyor, Suflo biliyor.

---

## 14. İş teklifi gelirse (kurgu, altyazı, özel geliştirme)

Bunlar gerçek para. Hemen fiyat verme, önce işi öğren.

> Olur, ilgilenirim. Ne tür bir iş, ne kadar süre ve teslim ne zaman? Ona göre net bir fiyat vereyim.

Özel geliştirme isteyene (stüdyo, ajans):

> Suflo açık kaynak, ama şirkete özel bir akış (kendi şablonunuz, toplu işleme, kurumsal kurulum) istiyorsanız onu ayrıca yapıyorum. Neye ihtiyaç olduğunu yazın, kapsam çıkarayım.

---

## 15. "Nasıl destek olabilirim?"

Bağış linki henüz yok; şimdilik en değerli destek görünürlük.

> Sağ ol 🙏 Şu an en çok işime yarayan şey: GitHub'da yıldız, ya da bu videoyu kurgu yapan bir arkadaşına göndermen.

---

## 16. Kimseye söz verme listesi

Bu cümleleri KURMA:

- "Yarın ekleyeceğim" — tarih verme, "bakacağım" de.
- "Kesin çalışır" — "bende çalışıyor, sende bakalım" de.
- "Adobe'nin altyazısından daha doğru" — ölçmedik, iddia etme. Doğru cümle: "Adobe Türkçe altyazı çıkarmıyor, Suflo çıkarıyor."
- "Sesin Adobe'ye gidiyor" — gitmiyor, Adobe de cihaz üzerinde çalışıyor. Bizim farkımız dil desteği ve ücret.

---

## 17. Yorumlara "ALTYAZI" yazanlar

Reel altındaki anahtar kelime akışı. Toplu cevap:

> Yolladım 📩 (DM'ye: suflo.app — ücretsiz, kayıt yok. Takılırsan yaz.)

Not: Instagram aynı metni arka arkaya çok kez göndermeyi spam sayıp kısıtlıyor. Cevabı her seferinde biraz değiştir: bazen "link geldi", bazen "attım", bazen sadece 📩.
