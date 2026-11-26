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

---

# Meta pikseli ve satın alma ölçümü (reklamlar için)

**Durum:** kod hazır (26 Kasım 2026), canlıda **değil**. Aşağıdaki adımlar bitince çalışır.
Site tarafı 1. adımla, satın alma bildirimi 2–8. adımlarla açılır.

**Neden:** Meta reklamları satın almaları göremiyordu. Piksel yalnız Lemon Squeezy'nin ödeme
penceresinde çalışıyordu; pencere sitenin içinde açıldığı için reklam tıklaması (`fbclid`)
satın almaya bağlanamıyordu. Reklam Yöneticisi'nde 1 Ağustos'tan beri 1 satın alma görünüyor.

**Ne değişti:**

- Sitede küçük bir onay şeridi var. Ziyaretçi **"Kabul et" demeden Meta'dan hiçbir şey
  yüklenmez**, çerez yazılmaz. Cloudflare sayacı (çerezsiz) eskisi gibi sürer.
- Kabul edende Meta pikseli yüklenir: sayfa görüntüleme, Pro bölümünü görme, "Pro'yu al"a basma.
- Satın alma sunucudan bildirilir: Lemon Squeezy siparişi `assets.suflo.app`'e haber verir,
  sunucu Meta'ya "Purchase" yollar (tutar, reklam tıklaması kimliği, e-postanın özeti).
- Altbilgideki "Çerez yok · takip yok" yazısı "Onay vermezsen çerez ve takip yok" oldu;
  yanında "Çerez tercihleri" bağlantısı var (ziyaretçi kararını oradan değiştirir).

## Senin yapman gerekenler (sırayla)

1. **PR'ı birleştir.** Site yayına girer: şerit görünür, kabul edende piksel çalışır (sayfa
   görüntüleme, Pro'yu görme, "Pro'yu al" tıklaması). Satın alma tarafı aşağıdaki adımlar bitene
   kadar eskisi gibi kalır, hiçbir şey bozulmaz. Dosyalar bundan sonra `main` dalında durur;
   4. ve 7. adımda bilgisayarındaki kopyanın güncel olması gerekir (değilse bana söyle, güncellerim).
2. **Meta erişim belirteci üret.** Events Manager → "Suflo | Web ve Satın Alma" pikseli →
   Ayarlar → Conversions API bölümü → "Erişim belirteci oluştur" (Generate access token).
   Kopyala. Bu belirteç şifre gibidir: sohbete, e-postaya, GitHub'a yapıştırma.
3. **Webhook sırrı üret.** PowerShell'de:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(20).toString('hex'))"
   ```
   Çıkan 40 karakteri bir yere not et; iki yerde kullanacaksın (4. ve 6. adım).
4. **Sunucuya koy (Hostinger Dosya Yöneticisi).** İki dosya, ikisi de yeni; var olan hiçbir
   dosyayı değiştirmiyorsun.
   - `server/pro-v1/ls-webhook.php` dosyasını `public_html/pro/v1/` içine yükle.
   - `private/pro-v1/` içinde **`meta.php`** adında yeni bir dosya oluştur ve şunu yapıştır
     (iki değeri kendi belirtecin ve sırrınla değiştir):
     ```php
     <?php
     return [
         'meta_capi_enabled' => true,
         'meta_pixel_id' => '1084974704080878',
         'meta_capi_token' => 'BELIRTECI_BURAYA_YAPISTIR',
         'ls_webhook_secret' => 'SIRRI_BURAYA_YAPISTIR',
         'meta_test_event_code' => '',
     ];
     ```
   Ayarlar bilerek `config.php`'den ayrı duruyor: bu dosyada bir yazım hatası olursa yalnız
   webhook çalışmaz, Pro lisansları ve içerik indirme etkilenmez.
5. **Dosya yerinde mi bak.** Tarayıcıda `https://assets.suflo.app/pro/v1/ls-webhook.php` aç.
   `"ready":true` yazmalı. `false` ise `meta.php` yok ya da 4. adımdaki değerlerden biri boş.
   Sayfa hata veriyorsa `meta.php`'de yazım hatası var (tırnak ya da virgül).
6. **Lemon Squeezy'de webhook ekle.** Settings → Webhooks → "+":
   - Callback URL: `https://assets.suflo.app/pro/v1/ls-webhook.php`
   - Signing secret: 3. adımdaki sır
   - Olay: yalnız `order_created`
7. **"Test events" ile doğrula (satın alma yapmadan).**
   - Events Manager → Test events (Olayları test et) → sunucu olayları için gösterilen test
     kodunu kopyala (`TEST12345` gibi).
   - `meta.php`'de `'meta_test_event_code' => 'TEST12345'` yap.
   - PowerShell'de, depo klasöründe:
     ```powershell
     $env:SUFLO_LS_WEBHOOK_SECRET = Read-Host "Webhook sırrı"
     ```
     ```powershell
     node tools/ls-webhook-dene.js
     ```
   - "TAMAM" yazmalı ve Test events ekranında 1,00 TRY'lik bir Purchase görünmeli. (Meta test
     olaylarını da sayar: pikselde 1 TL'lik tek bir deneme satın alması kalır.)
   - Sonra `meta_test_event_code` değerini yeniden boşalt (`''`).
8. **Lemon Squeezy'nin kendi pikselini kapat.** Lemon Squeezy → Design → **"Meta pixel"
   anahtarını kapat.** 7. adım geçer geçmez, aynı gün yap. İki nedeni var:
   - Çift sayım: o piksel satın almayı Meta'nın eşleştirebileceği bir kimlikle göndermiyor;
     açık kalırsa onay veren alıcının satın alması **iki kez** sayılır.
   - Şeritteki söz: o piksel ödeme penceresinde kimseye sormadan yükleniyor. Açık kalırsa
     "Reddet" diyen ziyaretçi "Pro'yu al"a bastığında Meta pikseli yine çalışır.
9. **Canlıda bak.** suflo.app'i gizli sekmede aç, "Kabul et" de, sayfada gez, "Pro'yu al"a bas.
   Events Manager → Test events'te (tarayıcı olayları) PageView, ViewContent, InitiateCheckout
   görünmeli. İlk gerçek satıştan sonra `private/pro-v1/meta-webhook.log` dosyasında o siparişin
   `sent` satırına bak.

## Bilmen gerekenler

- **Onay vermeyen ölçülmez.** Şeridi geçen ya da "Reddet" diyen ziyaretçinin ne gezintisi ne
  satın alması Meta'ya gider. Meta'daki satın alma sayısı Lemon Squeezy'deki sipariş sayısından
  düşük kalır; bu bilerek böyle.
- **Panelden başlayan satın alma Meta'ya gitmez** (Premiere içindeki "Pro'yu al"). Orada onay
  sorulmuyor.
- **Tutar vergi hariç gider** (749 TL), sitedeki fiyatla aynı.
- **Lemon Squeezy kapanıyor.** Kendi belgelerindeki duyuru: yeni kayıt almıyor, 31 Mart 2027'de
  kapanacak. Ödeme sağlayıcısı değişince bu webhook'un Lemon Squeezy'ye bakan kısmı ve sitedeki
  ödeme bağlantıları yeniden yazılacak; onay şeridi, piksel ve Meta'ya gönderim aynı kalır.
- **Gizlilik metni yok.** Şerit ne yüklendiğini ve neyin gönderildiğini söylüyor ama sitede
  ayrı bir KVKK aydınlatma metni / gizlilik sayfası yok. İstersen eklenir.
- **Sorun çıkarsa:** sunucuda `private/pro-v1/meta-webhook.log` her siparişi tek satırla yazar
  (`sent`, `skipped` + neden, `failed` + Meta'nın hata iletisi). İçinde e-posta ya da belirteç
  olmaz. Lemon Squeezy'nin webhook ekranı da her teslimatın yanıtını gösterir.
