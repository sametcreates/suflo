# Suflo Pro içerik servisi

Bu servis ücretli MOGRT, SFX, Motion BG ve `.prfpset` dosyalarını `public_html` dışında tutar. Panel lisansı Lemon Squeezy'de doğrulandıktan sonra kısa ömürlü bir oturumla dosya indirir.

Üretim klasörleri aynı domain kökünde şöyle olmalıdır:

```text
public_html/pro/v1/index.php
public_html/pro/v1/.htaccess
private/pro-v1/config.php
private/pro-v1/manifest.json
private/pro-v1/content/mogrt/...
private/pro-v1/content/sfx/...
private/pro-v1/content/motionbg/...
private/pro-v1/content/presets/...
```

`node tools/build-pro-cdn.js <paket-klasoru> <icerik-surumu>` komutu bu yükleme ağacını `dist/pro-cdn/upload/` altında üretir ve güçlü bir token anahtarı oluşturur. Ardından `powershell -ExecutionPolicy Bypass -File tools/pro-cdn-zip.ps1` tek parça Hostinger ZIP'ini üretir.

Çalışan sunucuda yalnız Pro içeriğini güncellemek için `powershell -ExecutionPolicy Bypass -File tools/pro-content-zip.ps1` kullan. Oluşan arşivi `private/pro-v1/` içine çıkar; yalnız `content/` ile `manifest.json` değişir, çalışan `config.php` lisans anahtarı korunur.

Hostinger'da ZIP'i `public_html` klasörünün **bir üstündeki domain köküne** yükleyip çıkart. Çıkarma sonunda `public_html/` ile `private/` aynı seviyede olmalı. `private/pro-v1/config.php` gizli token taşır; bu dosyayı veya Hostinger ZIP'ini GitHub'a, müşteriye ya da public bir URL'ye yükleme.

Yayın öncesi `node tools/check-pro-cdn.js` çalıştır. Geçersiz deneme lisansına JSON `403` dönüyorsa servis ve lisans kapısı hazırdır. `tools/publish.ps1` bu kontrol geçmeden yeni GitHub sürümünü yayınlamaz. `private/` hiçbir zaman public GitHub paketine eklenmez.

Servis, Lemon Squeezy doğrulama kotasını kötüye kullanıma karşı korumak için lisans denemelerini IP başına dakikada 15 ile sınırlar; IP adresini saklamaz, yalnızca SHA-256 özetiyle kısa süreli sayaç tutar. Pro içerik dosyalarının indirilmesi bu sınırdan etkilenmez.

2.8.2 ve yeni istemciler `presets/*.prfpset` içeriğini de alır. Daha eski istemcilere katalog preset yolları filtrelenerek döner; böylece eski MOGRT/SFX/Motion BG kurulumu yeni içerik türü yüzünden kesilmez.

`tools/publish.ps1` her yayında ZXP ve kolay kurulum ZIP'ini yeniden üretir, tüm testleri çalıştırır ve `tools/verify-release.ps1` ile imzayı, arşiv yollarını, gerekli Pro Sync dosyalarını ve ücretli/gizli içerik sızıntısını doğrular. Bu kapılardan biri geçmezse commit, push ve release başlamaz.

## Davet et, kazan (uyuyan özellik)

`index.php` üç yeni işlem taşır: `referral` (Pro sahibinin davet kodu ve davet sayısı), `referral_stats` (yalnız sayı, kod oluşturmaz) ve `attribution` ("Bizi nereden duydun?" yanıtı). Davet işlemleri `config.php` içinde `referral_enabled => true`, dolu bir `ls_api_key` ve en az bir `referral_variant_ids` girilene dek `503 referral_disabled` döner; panel bu durumda sessizce ücretsiz paylaşım bağlantısına düşer. 3.0 istemciler etkilenmez.

- **Kod:** `SFL` + 6 karakter (A-Z, 2-7). Lisans kimliğinin `token_secret` ile HMAC'inden türetilir ama `referrals.json` içinde saklanır; `token_secret` değişse de mevcut kod değişmez. Lemon Squeezy'de `%referral_percent`, en çok `referral_max` kullanım, tek seferlik ve yalnız `referral_variant_ids` varyantlarına geçerli bir indirim olarak açılır.
- **Sayaç:** indirimi kullanan, ödemesi tamamlanmış, iade edilmemiş, davet edenin kendi e-postası olmayan ve 14 günden eski siparişlerin farklı e-postaları sayılır. Sonuç 600 sn önbellekte tutulur. Kademeler 1 / 3 / 10; kazanılan kademe iadeyle geri düşmez.
- **Ödüller:** `private/pro-v1/davet/t1/` ve `davet/t3/` altındaki MOGRT/SFX dosyaları, `davet/manifest.json` ile 3.1.0+ istemcilere `manifest.extras.davet` olarak gider. Ana `files[]`, `content_version` ve `counts` değişmez. İndirme tokeni `ref` kademesini taşır; `davet/tN/` yolu yalnız `ref >= N` ise iner. Ödül paketini oluşturmak için paket klasörüne `davet/t1/{mogrt,sfx}/` ve `davet/t3/{mogrt,sfx}/` ekleyip `build-pro-cdn.js` çalıştır.
- **Kayıtlar:** `referrals.json` yalnız lisans kimliğinin SHA-256'sı, kod, indirim kimliği ve e-posta özetini tutar; `attribution.jsonl` gün, yanıt ve lisans anahtarının SHA-256'sını tutar. İkisi de `private/` altında kalır.

**Güvenlik:** Lemon Squeezy API anahtarı **tüm mağazaya** yetkilidir (indirim, iade, müşteri verisi). Yalnız sunucudaki `private/pro-v1/config.php` dosyasında durur; GitHub'a, panele, ZXP/ZIP'e, e-postaya veya sohbete asla girmez. Sunucu anahtarı yalnız `Authorization` başlığında gönderir, yanıtlara ve günlüklere yazmaz. Sızdığından şüphelenirsen hemen Lemon Squeezy > Settings > API'den sil ve yenisini oluştur. `tools/verify-release.ps1`, paketlerde gömülü bir Bearer tokeni, dolu bir `ls_api_key` ya da (yerelde `SUFLO_LS_API_KEY` veya private config'te biliniyorsa) anahtarın kendisi bulunursa yayını durdurur. `tools/check-pro-cdn.js`, `referral` işleminin `403`/`503` JSON döndüğünü de doğrular.

Çalışan sunucuda `config.php`'yi yeniden üretme: yeni anahtarları (`ls_api_key`, `referral_enabled`, `referral_percent`, `referral_max`, `referral_variant_ids`, `referrals_path`, `attribution_path`, `davet_dir`) `config.example.php`'den elle ekle. Açma adımları `marketing/v4-kurucu-yapilacaklar.md` içindedir.

## Meta Conversions API: sipariş → Purchase (uyuyan özellik)

`ls-webhook.php`, Lemon Squeezy'nin `order_created` webhook'unu alır ve siparişi Meta Conversions API'ye `Purchase` olarak bildirir. `index.php`'den bağımsız tek dosyadır ve ayarlarını **kendi dosyasından**, `private/pro-v1/meta.php`'den okur (örneği `meta.example.php`). Pro servisinin `config.php`'sine hiç dokunmaz: Meta ayarı girilirken yapılacak bir yazım hatası lisans doğrulamayı ve içerik indirmeyi etkilemez, yalnız bu webhook'u durdurur. `meta.php` yokken, ya da `meta_capi_enabled => true`, dolu bir `meta_capi_token` ve en az 16 karakterlik `ls_webhook_secret` girilene dek `POST` isteklerine `503` döner. `GET` yalnız `{"ok":true,"service":"suflo-ls-webhook","ready":true|false}` verir.

Üretim yolu: `public_html/pro/v1/ls-webhook.php` → `https://assets.suflo.app/pro/v1/ls-webhook.php`. Kurulum adımları `marketing/analytics-kurulum.md` içindedir.

- **İmza:** `X-Signature` başlığı ham gövdenin `ls_webhook_secret` ile HMAC-SHA256 hex özetidir. Gövde çözülmeden önce, `hash_equals` ile denetlenir; tutmazsa `401` ve Meta'ya gidilmez.
- **İzin kapısı:** Site (`docs/js/olcum.js`) ziyaretçi ölçüm iznini kabul ettiyse ödeme bağlantısına `checkout[custom][event_id]`, `fbc`, `fbp`, `ua` ekler. Lemon Squeezy 255 karakterden uzun bir özel alanı HTTP 422 ile reddeder (ödeme sayfası hiç açılmaz; 26 Kasım 2026'da ölçüldü), bu yüzden uzun değerler 250'lik iki parçaya bölünür (`fbc` + `fbc2`, `ua` + `ua2`) ve burada birleştirilir. `event_id` yoksa sipariş Meta'ya **gönderilmez** (`no_consent`): izin vermeyen ziyaretçi ve Premiere panelinden başlayan satın alma bu yüzden bildirilmez.
- **Gönderilen olay:** `event_name: Purchase`, `action_source: website`, `event_id` (siteden gelen), `event_time` (sipariş anı), `user_data`: `em` (e-postanın SHA-256 özeti), `fbc`, `fbp`, `client_user_agent`; `custom_data`: `value` (toplam − vergi), `currency`, `order_id`, `content_ids: ["suflo-pro"]`. Düz e-posta, ad ve IP gönderilmez. Siteden gelen `fbc`/`fbp` biçime uymuyorsa atılır.
- **Atlanan siparişler** (`200`, günlüğe nedeniyle yazılır): `not_paid`, `refunded`, `no_consent`, `test_mode` (test kodu yokken), `no_value`, `no_user_data`, `duplicate`. `order_created` dışındaki olaylar `event_ignored` ile kabul edilir.
- **Tekrar:** Gönderilen siparişin numarasının SHA-256'sı `meta-sent/` altına işaret olarak yazılır; Lemon Squeezy'nin yeniden denemesi ya da elle yeniden gönderim Meta'ya ikinci kez gitmez. Meta reddederse işaret silinir ve `502` dönülür: Lemon Squeezy üç kez daha dener.
- **Test:** `meta_test_event_code` doluyken her olay o kodla gider (Events Manager → Test events). Test modundaki sipariş yalnız kod doluyken gönderilir. `node tools/ls-webhook-dene.js` satın alma yapmadan imzalı bir deneme siparişi yollar.
- **Kayıtlar:** `meta-webhook.log` satır başına bir JSON tutar: zaman, sipariş numarası, sonuç, Meta'nın HTTP kodu ve `fbtrace_id`. E-posta, belirteç, sır ve `fbc`/`fbp` değeri yazılmaz. 1 MB'ı geçince `.1` olarak döndürülür.

**Çift sayım:** Lemon Squeezy'nin kendi Meta pikseli (Design → Meta pixel) ödeme sayfasında `fbq("track","Purchase",{event_id: <sipariş no>, ...})` çağırır: kimliği pikselin dördüncü parametresi (`eventID`) yerine özel veri olarak yollar. Meta tekilleştirmeyi yalnız `eventID` ile yapar; bu yüzden o olay sunucudan giden `Purchase` ile eşleştirilemez. Bu webhook açıkken Lemon Squeezy'deki "Meta pixel" anahtarı kapatılmalıdır, yoksa izin veren alıcıların satın alması iki kez sayılır.

**Güvenlik:** `meta_capi_token` pikselinize olay yazma yetkisi verir. Yalnız `private/pro-v1/meta.php`'de durur; isteğin gövdesinde gönderilir (adres satırında değil), yanıtlara ve günlüğe yazılmaz, Meta'nın hata iletisinde geçerse yıldızlanır. Sızdığından şüphelenirsen Events Manager'da yenisini üretip eskisini iptal et.

**Sağlayıcı değişirse:** Lemon Squeezy'ye özgü kısım imza denetimi ile `ls_siparis()` işlevidir. `meta_olay()` ve `meta_gonder()` sağlayıcıdan bağımsızdır.
