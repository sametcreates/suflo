# Suflo Studio sunucusu

Suflo Studio, KYG Digital için tek kullanıcılı, özel içerik üretimi ve ajans takip uygulamasıdır. Müşteri adları, aylık ücretler ve çekim takvimi gibi gerçek, özel bilgiler tutar.

- **Arayüz:** `server/studio-v1/arayuz/` (statik dosyalar), `https://assets.suflo.app/studio/` adresinden sunulur (seçenek B). `docs/studio/index.html` yalnız oraya yönlendirir.
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
  - Kilide takılan istekler sayılmaz; yalnız şifresi gerçekten denenen istekler sayılır. Böylece kilit sürerken yağdırılan istekler kilidi uzatamaz.
  - Şifre değiştirmedeki "mevcut şifre" denemeleri de aynı sınıra tabidir.
  - Oturumsuz istekler en çok 16 KB gövde gönderebilir. Büyük gövde (içe aktarma) yalnız oturum doğrulandıktan sonra okunur; oturumsuz büyük gövde okunmadan `401` alır.
  - Şifre, giriş oturumu açılmadan hemen önce, aynı işlem içinde yeniden denetlenir. Saklanan şifre parmak izi de karşılaştırılır. Doğrulama sürerken şifre değiştiyse (panelden ya da `config.php`'den) eski şifreyle oturum açılmaz.
- **Tanınan cihaz:**
  - Doğru şifreyle girilen cihaza ayrı bir `__Host-` çerezi verilir. Çerez her girişte uzatılır; 180 gün kullanılmayan cihaz unutulur.
  - Bu çerez erişim vermez; yalnız o cihazı IP ve toplam kilidinden muaf tutar. Böylece bir saldırgan sahibini bilinen cihazlarında kilitli tutamaz.
  - Tanınan cihazın da kendi sınırı vardır: 15 dakikada 8 hatalı deneme.
  - **Şifre değiştirince ve "Tüm cihazlarda çıkış yap"ta bütün tanınan cihazlar unutulur.** Çalınan bir cihazın çerezi de böylece geçersiz olur. İşlemi yapan cihaz yeni bir çerezle yeniden tanınır.
  - `config.php`'deki şifre özeti değiştirilirse (şifre sıfırlama) bütün oturumlar ve tanınan cihazlar da kapanır. Hatalı giriş kayıtları da silinir; şifreyi hatırlamaya çalışırken kilitlenen sahip, sıfırlamadan hemen sonra girebilir.
  - Sıfırlamadan sonra hiçbir cihaz tanınmaz. O sırada biri sürekli yanlış şifre deniyorsa ilk giriş toplam kilide takılabilir. Saldırı durunca kilit 15 dakika içinde açılır. Beklemeden girmek gerekirse `config.php`'de `login_max_fail` geçici olarak artırılabilir; girişten sonra eski değere döndürülmeli.
- Saldırı sürerken yeni bir cihazdan ilk giriş kilide takılabilir. Saldırı durunca kilit 15 dakika içinde kendiliğinden açılır. Bilinen cihazlar etkilenmez.
- Silme işlemi yoktur; kayıtlar arşivlenir.
- **Bağ denetimi:** Bir içerik, başka bir müşterinin çekimine bağlanamaz. Başka müşterinin içeriği bağlıyken bir çekimin müşterisi değiştirilemez. İçe aktarmada bu tür bir bağ kaldırılır ve önizlemede uyarı olarak gösterilir.
- **Veritabanı meşgulse** istek `503` ile "biraz sonra yeniden dene" der; yarım yazma olmaz.
- **Sürüm denetimi:** İki cihaz aynı kaydı değiştirirse, eski sürümle yazan `409` alır ve hiçbir şey sessizce ezilmez. Sürüm numaraları hep artan tek bir sayaçtan gelir; geri yüklemede bile tekrar kullanılmaz. Güncelleme `WHERE surum = ?` ile yapılır.
- **Eşzamanlı yazmalar:** Yazmalar işlem (transaction) içinde yapılır.
  - Yazma kilidi her okumadan önce alınır: SQLite'ta `BEGIN IMMEDIATE`, MySQL'de sayaç satırında `FOR UPDATE`.
  - Geri yükleme, aynı anda kaydedilen bir değişikliği sessizce silemez.
  - MySQL'de tablolar `InnoDB` ve `utf8mb4` olarak kurulur.
  - Tablolar ilk istekte bir kez, kurulum kilidi altında kurulur.
- **İçe aktarma ve geri yükleme:**
  - Yedekteki kimliği (id) olan kayıtlar yalnız kimliğe göre eşlenir; "benzer" diye hiçbir kayıt elenmez.
  - Elle hazırlanmış (kimliksiz) listeler ad ve tarihe göre mükerrer denetiminden geçer. Hem var olan kayıtlarla hem dosyadaki tekrar eden satırlarla karşılaştırılır.
  - Bir içerik ya da etkinlik müşteriye `musteriAdi` ile bağlanabilir. `musteriKurum` verilirse, boş da olsa, ad ve kurum tam eşleşmelidir. Verilmezse ad yalnız tek bir müşteriye uyduğunda bağlanır; birden çok aday varsa hata olur.
  - Önizlemede şunlar görünür: her kaydın hangi müşteriye bağlanacağı, eklenecek müşterilerin bilinen aylık ücret toplamı ve tanınmayan alanlar (bunlar uyarı olarak gösterilir, kaydedilmez).
  - Yanlış biçimli bir alan (ör. `siklik` metin olarak yazılmışsa) sessizce boş sayılmaz; hata olarak gösterilir.
  - Plan, uygulamada yazma kilidi altında yeniden hesaplanır. Önizleme verinin o anki sürümünü de taşır. Önizlemeden sonra herhangi bir kayıt değiştiyse içe aktarma yapılmaz; önizleme yenilenir.
  - Yedekte kimliği zaten var olan kayıtlar doğrulamadan önce atlanır. Eski bir yedekte artık geçersiz sayılan bir alan, mevcut kayıtlar yüzünden içe aktarmayı engellemez.
  - Liste yerine nesne beklenen alanlara liste gelirse (ya da tersi) hata gösterilir. Alt alanlardaki tanınmayan anahtarlar da uyarı olarak listelenir.
  - "Tümünü değiştir" yedekteki ayar kaydını (varsayılan stok eşiği) da geri getirir.
  - Uygulamadan önce, aynı işlem içinde otomatik kopya alınır. Son 30 kopya sıkıştırılarak saklanır.
  - Tek seferde en çok 8 MB veri (yedeğin sıkıştırılmış JSON hali, Türkçe harfler 2 bayt sayılır) ve tür başına 20.000 kayıt içe aktarılabilir. Daha büyük bir yedek indirildiğinde uyarı gösterilir.
  - "Tümünü değiştir" ve otomatik kopyaya dönüş, kayıtların oluşturma ve son değişiklik zamanlarını korur (liste sırası değişmez); yalnız sürüm numaraları yenilenir. Yedekte ayar yoksa (boş) şu anki ayar da kaldırılır; onay penceresi bunu söyler.
  - Dosyanın üst düzeyindeki tanınmayan listeler (örneğin elle yazılmış bir `cekimler` listesi) ve geçmiş satırlarındaki tanınmayan anahtarlar da önizlemede uyarı olarak gösterilir.
- `noindex` ve `robots.txt` yalnız arama motorları içindir; güvenlik bunlara dayanmaz.

## Dağıtım seçeneği (karar gerekli)

Tarayıcıda aynı adresten (origin) yüklenen her betik, o adresin izin verdiği isteklere ortak olur. `suflo.app` satış sitesi üçüncü taraf ödeme betiği (`app.lemonsqueezy.com/js/lemon.js`) ve başka sayfa betikleri yükler. Studio da `https://suflo.app` adresinden sunulursa, bu betiklerden biri ele geçirilirse ya da sitede bir XSS açığı olursa, oturumun açık olduğu tarayıcıda Studio verisi okunabilir.

- **A — `https://suflo.app/studio/`** (GitHub Pages; ilk istenen yol)
  - `allowed_origins = ['https://suflo.app']`.
  - Kurulumu en kolay seçenek. Yukarıdaki risk kalır.
- **B — `https://assets.suflo.app/studio/` (önerilen; örnek ayar dosyasının varsayılanı)**
  - Arayüz ve API aynı adreste olur. Bu adreste üçüncü taraf betik yoktur.
  - `server/studio-v1/arayuz/` içindeki dosyaları (`index.html`, `studio.css`, `studio-core.js`, `studio.js`, `favicon.svg`) `public_html/studio/` klasörüne yükle. `arayuz.htaccess` dosyasını da aynı yere `.htaccess` adıyla koy.
  - `allowed_origins = ['https://assets.suflo.app']`.
  - `suflo.app/studio/` (`docs/studio/index.html`) yalnız yönlendirme sayfasıdır ve hiçbir veriye erişmez. Arayüz kaynağı yayımlanmayan `server/studio-v1/arayuz/` klasöründedir; testler de oradan okur.
  - **Seçilen: B** (sahibinin onayıyla).
  - Önce `assets.suflo.app` üzerinde HTML/JS sunan başka bir sayfa olmadığını kontrol et.

Arayüz kodu iki seçenekte de aynıdır: `assets.suflo.app` üzerinden açılınca API'yi kendi adresinden çağırır.

## Hostinger'a kurulum (canlıya alma — onay gerektirir)

Önce kontrol et:

1. hPanel → **Gelişmiş → PHP Yapılandırması**: PHP **8.0 veya üstü** olmalı; `pdo_sqlite` (ya da MySQL kullanacaksan `pdo_mysql`) eklentisi açık olmalı.
2. `assets.suflo.app` için Pro servisinin durduğu yeri bul: `public_html/pro/v1/index.php` ve onun bir üstünde `private/pro-v1/`.

Klasör yapısı, Pro servisiyle aynı kök altında şöyle olmalı:

```text
public_html/studio/index.html        <- (yalnız seçenek B) arayüz: index.html, studio.css, studio-core.js, studio.js, favicon.svg
public_html/studio/.htaccess         <- (yalnız seçenek B) server/studio-v1/arayuz.htaccess
public_html/studio/v1/index.php      <- server/studio-v1/index.php
public_html/studio/v1/.htaccess      <- server/studio-v1/.htaccess
private/studio-v1/config.php         <- config.example.php'nin doldurulmuş kopyası
private/studio-v1/studio.sqlite      <- sunucu ilk istekte kendisi oluşturur
```

Adımlar:

1. `public_html/studio/v1/` klasörünü aç; `index.php` ve `.htaccess` dosyalarını yükle.
   - Seçenek B'de ayrıca: arayüz dosyalarını (`index.html`, `studio.css`, `studio-core.js`, `studio.js`, `favicon.svg`) `public_html/studio/` klasörüne yükle ve `arayuz.htaccess` dosyasını aynı klasöre `.htaccess` adıyla koy. Bu dosya güvenlik başlıklarını (çerçeveye gömmeyi engelleme dahil) ekler; atlanmamalı.
2. `private/studio-v1/` klasörünü aç. `config.example.php` dosyasını buraya `config.php` adıyla koy.
3. Şifre özetini üret. Tercihen Hostinger SSH terminalinde, ya da kendi bilgisayarında (PHP kuruluysa) `php sifre-ozeti.php` komutunu çalıştır. Windows terminalinde yazdığın şifre ekranda görünür; yanında kimse yokken çalıştır. Şifreyi iki kez yaz (en az 12 karakter). Çıkan `$argon2id$...` ya da `$2y$...` satırını `config.php` içindeki `'password_hash'` alanına yapıştır. `sifre-ozeti.php` dosyasını `public_html` içine **koyma**.
4. `allowed_origins`: seçenek A için `['https://suflo.app']`, seçenek B için `['https://assets.suflo.app']` (yalnız biri).
5. Veritabanı:
   - Varsayılan SQLite için bir şey yapma; `private/studio-v1/` klasörünün PHP tarafından yazılabilir olması yeterli.
   - `pdo_sqlite` yoksa hPanel → **Veritabanları → MySQL** ile ayrı bir veritabanı ve kullanıcı aç. Ardından `config.php` içinde şunları doldur: `'dsn' => 'mysql:host=localhost;dbname=...;charset=utf8mb4'`, `db_user` ve `db_pass`.
6. Kontrol: Studio adresini (A ya da B) aç ve giriş ekranının geldiğini gör. Yanlış şifrenin reddedildiğini ve doğru şifreyle girildiğini dene.
7. İlk veriyi yalnız giriş yaptıktan sonra **Ayarlar → İçe aktar** ile yükle. Önce önizlemeyi kontrol et, sonra "Yalnız yenileri ekle"ye bas.

`config.php`, `studio.sqlite` ve yedek dosyaları GitHub'a, e-postaya, sohbete ya da herkese açık bir klasöre girmemeli.

## İlk kurulum notu

Veritabanı ilk istekte boşsa tablolar kurulur (şema sürümü 3). Kurulum önce bir "kuruluyor" işareti yazar. Yarıda kesilen kurulum bu işaret sayesinde bir sonraki istekte tamamlanır. İşaret yokken Studio tablolarından biri zaten varsa (eski bir geliştirme sürümü ya da aynı veritabanını kullanan başka bir uygulama) ya da şema başka bir sürümse üzerine sessizce kurulmaz. Açık bir "uyumsuz" hatası döner ve arayüz bu mesajı gösterir. Bu durumda Studio için **ayrı, boş bir veritabanı** kullan (`config.php`'de `dsn`). Tablolar başka bir uygulamaya aitse onları **silme**. Yalnız tablolar eski bir Studio denemesine aitse: önce o denemenin yedeğini indir, sonra yeni boş veritabanına geçip yedeği içe aktar.

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
