# Suflo Studio sunucusu

Suflo Studio, KYG Digital için tek kullanıcılı, özel içerik üretimi ve ajans takip uygulamasıdır. Müşteri adları, aylık ücretler ve çekim takvimi gibi gerçek, özel bilgiler tutar.

- **Arayüz:** `docs/studio/`, yani `https://suflo.app/studio/` (GitHub Pages, statik).
- **Sunucu:** bu klasör, yani `https://assets.suflo.app/studio/v1/index.php` (Hostinger PHP).
- **Veri:** sunucuda, `public_html` dışındaki tek bir SQLite dosyasında (ya da isteğe bağlı MySQL'de). Tarayıcıda veri ya da oturum saklanmaz. Telefon ve bilgisayar aynı kayıtları görür.

Suflo Pro lisans servisinden (`pro-v1`) tamamen ayrıdır: ayar dosyası, veritabanı ve oturum çerezi ayrı. Pro lisansı Studio'ya giriş hakkı vermez.

## Güvenlik modeli

- Giriş tek şifreyle yapılır. Şifrenin yalnız özeti sunucudaki ayar dosyasında ya da veritabanında durur. Arayüz kodunda şifre yoktur.
- Girişten sonra sunucu `HttpOnly`, `Secure`, `SameSite=Strict` bir oturum çerezi verir. Veritabanında çerezin kendisi değil, yalnız SHA-256 özeti tutulur.
- Oturum 14 gün kullanılmazsa, her durumda da 60 günde biter.
- Giriş dışındaki **her** istek sunucuda oturum denetiminden geçer; oturumsuz istek `401` alır.
- İstekler yalnız `allowed_origins` listesindeki adresten kabul edilir. Ayrıca `X-Studio: 1` başlığı ve JSON gövde zorunludur; bunlar CSRF koruması sağlar.
- 15 dakikada aynı IP'den 8 (tüm IP'lerden toplam 24) hatalı denemeden sonra giriş geçici olarak kilitlenir. Açık oturumlar bu kilitten etkilenmez.
- Silme işlemi yoktur; kayıtlar arşivlenir.
- İçe aktarma ve geri yüklemeden önce sunucu tüm verinin otomatik kopyasını alır (son 30 kopya saklanır).
- İki cihaz aynı kaydı değiştirirse sürüm denetimi eskisinin üzerine yazmayı engeller (`409`).
- `noindex` ve `robots.txt` yalnız arama motorları içindir; güvenlik bunlara dayanmaz.

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
4. `allowed_origins` alanı `['https://suflo.app']` olarak kalmalı. Site `www.` ile de açılıyorsa onu da ekle.
5. Veritabanı:
   - Varsayılan SQLite için bir şey yapma; `private/studio-v1/` klasörünün PHP tarafından yazılabilir olması yeterli.
   - `pdo_sqlite` yoksa hPanel → **Veritabanları → MySQL** ile ayrı bir veritabanı ve kullanıcı aç. Ardından `config.php` içinde şunları doldur: `'dsn' => 'mysql:host=localhost;dbname=...;charset=utf8mb4'`, `db_user` ve `db_pass`.
6. Kontrol: `https://suflo.app/studio/` adresini aç ve giriş ekranının geldiğini gör. Yanlış şifrenin reddedildiğini, doğru şifreyle girildiğini dene.
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
