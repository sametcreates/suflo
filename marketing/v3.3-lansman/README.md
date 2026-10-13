# Suflo 3.2.0 / 3.3 lansman kiti

3.2.0 yayınının ve 3.3 öncesi tanıtımın taslakları. Metinler doğruluk kontrolünden geçti: 3.3 özellikleri her yerde
"3.3'te geliyor" etiketli, fiyat yalnız "749 ₺ + KDV, tek ödeme" (üstü çizili fiyat, geri sayım ve kur çevirisi yok),
YouTube indirici yalnız hakkın olan içerik için ve "YouTube Kullanım Şartları'na uymak senin sorumluluğunda" cümlesiyle.

| Dosya | İçinde ne var |
|---|---|
| [`instagram.md`](instagram.md) | 3.2 ve 3.3 carousel'leri (7'şer kare), 6 Reels / TikTok çekim planı, açıklamalar ve hashtag'ler, 10 Story karesi, yorum cevapları, paylaşım öncesi kontrol listesi |
| [`youtube.md`](youtube.md) | 4 eğitim videosu senaryosu (Hız Rampası, Türkçe altyazı, Altyazı Efektleri, YouTube indirici): başlık, küçük resim, bölümler, sahne sahne senaryo, B-roll, açıklama, etiketler, sabit yorum |
| [`eposta-ve-metinler.md`](eposta-ve-metinler.md) | 3.2.0 lansman e-postası, 3.3 tanıtım e-postası, Pro'ya geçiş e-postası, panel ve site metin blokları (TR / EN), Premiere ile dürüst karşılaştırma, 10 DM cevabı, kurucu için tutarsızlık listesi |

## Sahibin yapacakları

**Ekran kayıtları**
- Reels R1–R6 (`instagram.md` › C) ve dört YouTube videosu (`youtube.md`). 3.2 kayıtları yayındaki 3.2.0 ile; 3.3 kayıtları
  dalın test kurulumuyla (`tools/install.ps1` / `tools/install.sh`), kopya projede, yalnız kendi görüntün, sesin ve kanalınla.
- 3.3 kayıtlarında Altyazı Efektleri › **Çıktı: Video katmanı**. Premiere yerel çıktı (3.3 adım 21) deneme listesi `## 21`
  ve kurucu belgesindeki 21.1 (TranscriptAI şablonu için yazılı izin) / 21.2 (Premiere'de deneme) bitmeden gösterilmez.
- YouTube indirici videosunda dönüştürme İptal'ini (6:30) lisanslı kurulumla çek; 4K dönüştürme süresini kendin ölç.
- Carousel kareleri ve Story görselleri için gerçek panel ekran görüntüleri (1080 × 1350 ve 1080 × 1920); "önce / sonra"
  karelerinin "önce"si gerçek olsun (3.1 ya da eski satır ayarı).

**Küçük resimler**
- Dört YouTube küçük resmi (`youtube.md`'deki "Küçük resim" bölümleri). Video 1'de **PRO · 3 ücretsiz deneme** etiketi
  kalacak; Video 3 ve 4'te **3.3'TE GELİYOR** köşe etiketi. Adobe / Premiere / YouTube logosu yok.
- Reels kapak yazıları (`instagram.md` › C, her Reels'in "Kapak yazısı").

**Paylaşım takvimi**
- `instagram.md` › "Takvim önerisi" yalnız öneri; gerçek günleri sen seç (salı / perşembe, 12–13 arası).
- YouTube sırası: 2 → 1 → (3.3.0 yayınlanınca) 3 → 4.
- E-postalar: 3.2.0 e-postası yayın günü; 3.3 tanıtımı en erken bir hafta sonra; Pro'ya geçiş e-postası bir kez.
  Yalnız ticari ileti onayı olan listeye (İYS), BCC ile.
- 3.3.0 yayınlanınca: "3.3'te geliyor" etiketlerini "3.3 yayında" / "Suflo 3.3" yap.

**Yayından önce kapanması gerekenler**
- **YT.1** (`marketing/v4-kurucu-yapilacaklar.md`): YouTube indirici gönderileri, Story 8, Reels R6 ve Video 4 bundan önce
  yayınlanmaz.
- Sitedeki üstü çizili 1.249 ₺ / "erken erişim" etiketi ve diğer site tutarsızlıkları: `eposta-ve-metinler.md` ›
  "Tutarsızlıklar".
- Premiere'in Speech to Text dil listesini kayıt ve yayın günü Adobe'un güncel sayfasından yeniden kontrol et.
- YouTube videolarının gerçek bölüm zamanlarını kurgudan sonra açıklamalara yaz.
