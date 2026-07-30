# Ziyaretçi sayacı — KURULDU ✅

**Durum:** 30 Temmuz 2026'da kuruldu ve çalışıyor.
**Panel:** [dash.cloudflare.com](https://dash.cloudflare.com) → Analytics → Web analytics → suflo.app
**Hesap:** Sametkaygisiz27@gmail.com
**Bağımsız mod:** DNS/nameserver değiştirilmedi, domain Hostinger'da kaldı.

Aşağıdaki adımlar kayıt olarak duruyor (ikinci bir site eklemek gerekirse aynı yol).

---



**Neden:** Şu an suflo.app'i kaç kişinin ziyaret ettiğini bilmiyoruz. GitHub bize sadece
kaç kişinin **indirdiğini** söylüyor. İkisi olmadan lansmanın işe yarayıp yaramadığını
anlayamayız:

- 1000 kişi siteye geldi, 40 indirdi → **site ikna etmiyor**, metni/tasarımı değiştirmeliyiz
- 50 kişi geldi, 40 indirdi → **site harika, kimse duymuyor** — daha çok tanıtım lazım

Aynı sayı (40 indirme), tamamen zıt iki sonuç. Bu yüzden lazım.

**Neden Cloudflare Web Analytics:** Ücretsiz, **çerez kullanmıyor**, kişisel veri toplamıyor,
KVKK/GDPR açısından temiz. "Verilerin sende kalır" diye pazarlama yapan bir ürünün sitesinde
insanları izleyen bir araç olamaz — bu, olmayanı.

---

## Senin yapman gereken (tek şey)

Hesap açma işini senin yapman gerekiyor.

1. **[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)** adresine git,
   e-posta + şifre ile ücretsiz hesap aç. (Kart istemiyor.)
2. Sol menüden **Analytics & Logs** → **Web Analytics**'e gir.
3. **Add a site** düğmesine bas. Açılan kutuya şunu yaz:
   ```
   suflo.app
   ```
4. Cloudflare sana şuna benzer bir kod verecek:
   ```html
   <script defer src="https://static.cloudflareinsights.com/beacon.min.js"
           data-cf-beacon='{"token": "a1b2c3d4e5f6..."}'></script>
   ```
   **Tırnak içindeki uzun token'ı kopyala ve bana at.** Gerisini ben hallederim.

> Not: Cloudflare "site'ı Cloudflare'e taşı / nameserver değiştir" diye bir şey teklif ederse
> **gerek yok** — Web Analytics tek başına, sadece bu script ile çalışır. Domain'in
> Hostinger'da kalmaya devam eder, DNS'e dokunmuyoruz.

---

## Bende hazır olan

- `docs/index.html`'in sonunda script yorum içinde duruyor; token gelince yorumu kaldırıp
  yerine yazacağım, tek satırlık iş.
- Sitenin altına gizlilik notu eklendi: çerez yok, kişisel veri yok.

## Token geldikten sonra ne göreceğiz

Cloudflare panelinde günlük olarak:

- kaç ziyaretçi, kaç sayfa görüntüleme
- hangi ülkeden geldikleri (Azerbaycan trafiği ayrı görünecek — hedef kitlemiz)
- **hangi siteden geldikleri** (Instagram mı, YouTube mu, Google mı)
- hangi cihazdan (telefon/masaüstü)

Bunu GitHub'daki indirme sayısıyla birleştirince asıl aradığımız oran çıkıyor:

```
indirme / ziyaretçi = dönüşüm oranı
```

Bu oran %10'un altındaysa sitede sorun var, %30'un üstündeyse tanıtıma yüklenmek lazım.

## Kontrol

Token'ı koyduktan sonra siteyi açıp beklersen Cloudflare panelinde ilk ziyaret ~1 dakika
içinde görünür. Görünmezse reklam engelleyicin script'i durduruyordur — gizli sekmede dene.
