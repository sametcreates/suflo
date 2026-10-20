# Suflo Studio sunucusu

Suflo Studio, KYG Digital için tek kullanıcılı, özel içerik üretimi ve ajans takip uygulamasıdır. Müşteri adları, aylık ücretler ve çekim takvimi gibi gerçek, özel bilgiler tutar.

- **Arayüz:** `docs/studio/` (statik dosyalar). Nereden sunulacağı aşağıdaki **Dağıtım seçeneği**ne bağlıdır.
- **Sunucu:** bu klasör, yani `https://assets.suflo.app/studio/v1/index.php` (Hostinger PHP).
- **Veri:** sunucuda, `public_html` dışındaki tek bir SQLite dosyasında (ya da isteğe bağlı MySQL'de). Tarayıcıda veri ya da oturum saklanmaz. Telefon ve bilgisayar aynı kayıtları görür.

Suflo Pro lisans servisinden (`pro-v1`) tamamen ayrıdır: ayar dosyası, veritabanı ve oturum çerezi ayrı. Pro lisansı Studio'ya giriş hakkı vermez.

## Güvenlik modeli

- Giriş tek şifreyle yapılır. Şifrenin yalnız özeti sunucudaki ayar dosyasında ya da veritabanında durur. Arayüz kodunda şifre yoktur.
- Girişten sonra sunucu bir oturum çerezi verir. Çerez `__Host-` önekli, `HttpOnly`, `Secure` ve `SameSite=Strict`tir; `Path=/` ve alan adı yoktur, yani kardeş alt alan adları bu çerezi yazamaz. Veritabanında çerezin kendisi değil, yalnız SHA-256 özeti tutulur.
- Oturum 14 gün kullanılmazsa, her durumda da 60 günde biter.
- Giriş dışındaki **her** istek sunucuda oturum denetiminden geçer; oturumsuz istek `401` alır.
- İstekler yalnız `allowed_origins` listesindeki adresten kabul edilir. Ayrıca `X-Studio: 1` başlığı ve JSON gövde zorunludur; bunlar CSRF koruması sağlar.
- **Hatalı giriş kilidi:**
  - Her deneme şifre denetiminden *önce* kaydedilir; paralel denemeler sınırı aşamaz.
  - 15 dakikada aynı IP'den (IPv6'da /64 bloğundan) 8, tüm IP'lerden toplam 24 hatalı denemeden sonra giriş kilitlenir.
  - Şifre değiştirmedeki "mevcut şifre" denemeleri de aynı sınıra tabidir.
- **Tanınan cihaz:** Doğru şifreyle girilen cihaza ayrı bir `__Host-` çerezi (400 gün) verilir. Bu çerez erişim vermez; yalnız o cihazı IP ve toplam kilidinden muaf tutar. Böylece bir saldırgan sürekli yanlış deneyerek sahibini kilitli tutamaz. Tanınan cihazın da kendi sınırı vardır: 15 dakikada 8 hatalı deneme.
- Yeni bir cihazdan ilk giriş, saldırı sürerken kilide takılabilir. Kilit 15 dakikalık pencereyle kendiliğinden açılır.
- Silme işlemi yoktur; kayıtlar arşivlenir.
- **Sürüm denetimi:** İki cihaz aynı kaydı değiştirirse, eski sürümle yazan `409` alır ve hiçbir şey sessizce ezilmez. Sürüm numaraları hep artan tek bir sayaçtan gelir; geri yüklemede bile tekrar kullanılmaz. Güncelleme `WHERE surum = ?` ile yapılır.
- **Eşzamanlı yazmalar:** Yazmalar işlem (transaction) içinde yapılır. SQLite'ta yazma kilidi baştan alınır (`BEGIN IMMEDIATE`). MySQL'de tablolar `InnoDB` ve `utf8mb4` olarak kurulur.
- **İçe aktarma ve geri yükleme:**
  - Yedekteki kimliği (id) olan kayıtlar yalnız kimliğe göre eşlenir; "benzer" diye hiçbir kayıt elenmez.
  - Elle hazırlanmış (kimliksiz) listeler ad ve tarihe göre mükerrer denetiminden geçer.
  - Uygulamadan önce, aynı işlem içinde otomatik kopya alınır (son 30 kopya saklanır).
- `noindex` ve `robots.txt` yalnız arama motorları içindir; güvenlik bunlara dayanmaz.

## Dağıtım seçeneği (karar gerekli)

Tarayıcıda aynı adresten (origin) yüklenen her betik, o adresin izin verdiği isteklere ortak olur. `suflo.app` satış sitesi üçüncü taraf ödeme betiği (`app.lemonsqueezy.com/js/lemon.js`) ve başka sayfa betikleri yükler. Studio da `https://suflo.app` adresinden sunulursa, bu betiklerden biri ele geçirilirse ya da sitede bir XSS açığı olursa, oturumun açık olduğu tarayıcıda Studio verisi okunabilir.

- **A — `https://suflo.app/studio/`** (GitHub Pages; ilk istenen yol)
  - `allowed_origins = ['https://suflo.app']`.
  - Kurulumu en kolay seçenek. Yukarıdaki risk kalır.
- **B — `https://assets.suflo.app/studio/` (önerilen)**
  - Arayüz ve API aynı adreste olur. Bu adreste üçüncü taraf betik yoktur.
  - `docs/studio/` içindeki dosyaları (`index.html`, `studio.css`, `studio-core.js`, `studio.js`, `favicon.svg`) `public_html/studio/` klasörüne yükle. `arayuz.htaccess` dosyasını da aynı yere `.htaccess` adıyla koy.
  - `allowed_origins = ['https://assets.suflo.app']`.
  - `suflo.app/studio/` yalnız bu adrese yönlendiren bir sayfa olur; o sayfa hiçbir veriye erişmez.
  - Önce `assets.suflo.app` üzerinde HTML/JS sunan başka bir sayfa olmadığını kontrol et.

Arayüz kodu iki seçenekte de aynıdır: `assets.suflo.app` üzerinden açılınca API'yi kendi adresinden çağırır.

## Hostinger'a kurulum (canlıya alma — onay gerektirir)

Önce kontrol et:

1. hPanel → **Gelişmiş → PHP Yapılandırması**: PHP **8.0 veya üstü** olmalı; `pdo_sqlite` (ya da MySQL kullanacaksan `pdo_mysql`) eklentisi açık olmalı.
2. `assets.suflo.app` için Pro servisinin durduğu yeri bul: `public_html/pro/v1/index.php` ve onun bir üstünde `private/pro-v1/`.

Klasör yapısı, Pro servisiyle aynı kök altında şöyle olmalı:

```text
public_html/studio/v1/index.php      <- server/studio-v1/index.php
public_html/studio/v1/.htaccess      <- server/studio-v1/.htaccess
private/studio-v1/config.php         <- config.example.php'nin doldurulmuş kopyası
private/studio-v1/studio.sqlite      <- sunucu ilk istekte kendisi oluşturur
```

Adımlar:

1. `public_html/studio/v1/` klasörünü aç; `index.php` ve `.htaccess` dosyalarını yükle.
2. `private/studio-v1/` klasörünü aç. `config.example.php` dosyasını buraya `config.php` adıyla koy.
3. Şifre özetini üret. Kendi bilgisayarında (PHP kuruluysa) ya da Hostinger SSH terminalinde `php sifre-ozeti.php` komutunu çalıştır. Şifreyi iki kez yaz (en az 12 karakter). Çıkan `$argon2id$...` ya da `$2y$...` satırını `config.php` içindeki `'password_hash'` alanına yapıştır. `sifre-ozeti.php` dosyasını `public_html` içine **koyma**.
4. `allowed_origins`: seçenek A için `['https://suflo.app']`, seçenek B için `['https://assets.suflo.app']` (yalnız biri).
5. Veritabanı:
   - Varsayılan SQLite için bir şey yapma; `private/studio-v1/` klasörünün PHP tarafından yazılabilir olması yeterli.
   - `pdo_sqlite` yoksa hPanel → **Veritabanları → MySQL** ile ayrı bir veritabanı ve kullanıcı aç. Ardından `config.php` içinde şunları doldur: `'dsn' => 'mysql:host=localhost;dbname=...;charset=utf8mb4'`, `db_user` ve `db_pass`.
6. Kontrol: Studio adresini (A ya da B) aç ve giriş ekranının geldiğini gör. Yanlış şifrenin reddedildiğini ve doğru şifreyle girildiğini dene.
7. İlk veriyi yalnız giriş yaptıktan sonra **Ayarlar → İçe aktar** ile yükle. Önce önizlemeyi kontrol et, sonra "Yalnız yenileri ekle"ye bas.

`config.php`, `studio.sqlite` ve yedek dosyaları GitHub'a, e-postaya, sohbete ya da herkese açık bir klasöre girmemeli.

## Bakım

- **Yedek:** Ayarlar → **JSON yedeği indir**. Dosya özel bilgi içerir.
- **Geri yükleme:** Ayarlar → İçe aktar → önizleme → "Tüm veriyi bu dosyayla değiştir" (onay için `GERI YUKLE` yazılır), ya da **Otomatik kopyalar** listesinden bir kopyaya dön.
- **Şifre değiştirme:** Ayarlar → Güvenlik. Yeni özet veritabanına yazılır ve diğer tüm oturumlar kapanır.
- **Şifre unutulursa:** `php sifre-ozeti.php` ile yeni özet üret ve `config.php`'deki `'password_hash'` alanına yaz. `config.php`'deki özet değişince o geçerli olur; daha önce panelden konan şifre artık geçmez. (PHP önbelleği yüzünden değişiklik birkaç saniye sonra etkin olur.)
- **Kapatma / geri alma:** `public_html/studio/v1/` klasörünü kaldırmak servisi kapatır. Veri `private/studio-v1/` içinde kalır.

## Testler

```text
node tests/test-studio-core.js   # stok, yayın ihtiyacı, takvim çakışması, saat dilimi, CSV (saf mantık)
node tests/test-studio-api.js    # gerçek php -S + geçici SQLite: yetki, CSRF, kilit, kayıt, içe aktarma, geri yükleme
node tests/test-studio-e2e.js    # gerçek tarayıcı (Playwright): masaüstü + telefon akışları
```

Testler yalnız anonim örnek veri kullanır. `php` ya da Playwright yoksa ilgili test **ATLA** yazıp geçer. CI'daki `php` işi, API testini her push'ta çalıştırır.
