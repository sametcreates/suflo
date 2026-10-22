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
- **Tekrarlanan istek (mükerrer kayıt yok):** Zayıf bağlantıda sunucu kaydı yazar ama yanıt telefona ulaşmayabilir; sahibi "Kaydet"e yeniden basar.
  - Arayüz yeni kaydı kendi ürettiği kimlikle (`id`, sürümsüz) gönderir; pencere açıkken aynı kimlik kullanılır. Toplu eklemede (toplu içerik, stok girişi) her satırın kimliği satırın içeriğine bağlıdır; düzeltilen satır yeni kimlik alır.
  - Sunucu, var olan bir kimliğe sürümsüz ya da eski sürümle gelen yazmada kayıt zaten tam gönderildiği gibiyse yeni sürüm yazmaz, var olan kaydı başarıyla döner. İçerik farklıysa eskisi gibi `409` döner; arayüz bu pencerenin yazdığı, o zamandan beri değişmemiş kaydı bir kez güncelleme olarak gönderir, toplu eklemede veriyi tazeleyip yalnız eksik satırları ekler.
  - Kimlik göndermeyen eski arayüz eskisi gibi çalışır (her istek yeni kayıt).
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
  - "Tüm veriyi bu dosyayla değiştir" yedekteki ayar kaydını (varsayılan stok eşiği) da geri getirir.
  - Uygulamadan önce, aynı işlem içinde otomatik kopya alınır (bkz. Bakım → Otomatik kopyalar).
  - "Tüm veriyi bu dosyayla değiştir" ve kopyaya dönüş onayı (`onay`) büyük / küçük harf ve Türkçe harf farkı gözetmez: `GERİ YÜKLE`, `geri yükle` ve eski arayüzün gönderdiği `GERI YUKLE` kabul edilir.
  - Tek seferde en çok 8 MB veri (yedeğin sıkıştırılmış JSON hali, Türkçe harfler 2 bayt sayılır) ve tür başına 20.000 kayıt içe aktarılabilir. Daha büyük bir yedek indirildiğinde uyarı gösterilir.
  - "Tüm veriyi bu dosyayla değiştir" ve otomatik kopyaya dönüş, kayıtların oluşturma ve son değişiklik zamanlarını korur (liste sırası değişmez); yalnız sürüm numaraları yenilenir. Yedekte ayar yoksa (boş) şu anki ayar da kaldırılır; onay penceresi bunu söyler.
  - Dosyanın üst düzeyindeki tanınmayan listeler (örneğin elle yazılmış bir `cekimler` listesi) ve geçmiş satırlarındaki tanınmayan anahtarlar da önizlemede uyarı olarak gösterilir.
- `noindex` ve `robots.txt` yalnız arama motorları içindir; güvenlik bunlara dayanmaz.

## Dağıtım seçeneği (karar gerekli)

Tarayıcıda aynı adresten (origin) yüklenen her betik, o adresin izin verdiği isteklere ortak olur. `suflo.app` satış sitesi üçüncü taraf ödeme betiği (`app.lemonsqueezy.com/js/lemon.js`) ve başka sayfa betikleri yükler. Studio da `https://suflo.app` adresinden sunulursa, bu betiklerden biri ele geçirilirse ya da sitede bir XSS açığı olursa, oturumun açık olduğu tarayıcıda Studio verisi okunabilir.

- **A — `https://suflo.app/studio/`** (GitHub Pages; ilk istenen yol)
  - `allowed_origins = ['https://suflo.app']`.
  - Kurulumu en kolay seçenek. Yukarıdaki risk kalır.
- **B — `https://assets.suflo.app/studio/` (önerilen; örnek ayar dosyasının varsayılanı)**
  - Arayüz ve API aynı adreste olur. Bu adreste üçüncü taraf betik yoktur.
  - `server/studio-v1/arayuz/` içindeki dosyaları (`index.html`, `studio.css`, `studio-core.js`, `studio.js`, `favicon.svg`) `public_html/studio/` klasörüne yükle. `arayuz.htaccess` dosyasını da aynı yere `.htaccess` adıyla koy. MCP kuruluysa `arayuz.htaccess` yerine `mcp/studio.htaccess` dosyasını `.htaccess` adıyla koy (bkz. mcp/README.md).
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
public_html/studio/.htaccess         <- (yalnız seçenek B) server/studio-v1/arayuz.htaccess (MCP kuruluysa: server/studio-v1/mcp/studio.htaccess)
public_html/studio/v1/index.php      <- server/studio-v1/index.php
public_html/studio/v1/studio-ortak.php <- server/studio-v1/studio-ortak.php (ortak veri kitaplığı; index.php onsuz çalışmaz)
public_html/studio/v1/.htaccess      <- server/studio-v1/.htaccess
private/studio-v1/config.php         <- config.example.php'nin doldurulmuş kopyası
private/studio-v1/studio.sqlite      <- sunucu ilk istekte kendisi oluşturur
```

Ayar yolu uygulama klasörünün adından çıkar: `public_html/<klasör>/v1/index.php` → `private/<klasör>-v1/config.php`. Canlıda (`studio`) yol değişmedi. Test kurulumu (`public_html/studio-test/`) kendi `private/studio-test-v1/config.php`'sini, kendi veritabanını ve kendi oturum çerezini kullanır. Hazır paketler: `node tools/studio-paket.js paket --cikis <repo dışında klasör>` (bkz. `mcp/README.md` → Paketler).

Adımlar:

1. `public_html/studio/v1/` klasörünü aç; `index.php`, `studio-ortak.php` ve `.htaccess` dosyalarını yükle.
   - `studio-ortak.php` ortak veri kitaplığıdır (veritabanı, doğrulama, kayıt yazma, otomatik kopya, şifre kilidi). Panel ve sohbet bağlantısı (MCP) aynı kodu kullanır. `index.php` ile **aynı klasörde** olmalı; eksikse panel "Sunucu dosyası eksik (studio-ortak.php)" der.
   - Dışarıdan açılamaz: `.htaccess` onu reddeder (403); `.htaccess` işlemese bile dosya kendi başına çağrılınca hiçbir şey yapmadan 403 ile çıkar. Bu yüzden `.htaccess`'i atlama ve iki dosyayı her güncellemede **birlikte** yükle.
   - Seçenek B'de ayrıca: arayüz dosyalarını (`index.html`, `studio.css`, `studio-core.js`, `studio.js`, `favicon.svg`) `public_html/studio/` klasörüne yükle ve `arayuz.htaccess` dosyasını aynı klasöre `.htaccess` adıyla koy. Bu dosya güvenlik başlıklarını (çerçeveye gömmeyi engelleme dahil) ekler; atlanmamalı. MCP kuruluysa `arayuz.htaccess` yerine `mcp/studio.htaccess` dosyasını `.htaccess` adıyla koy (bkz. mcp/README.md).
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

- **Yedek:** Ayarlar → **JSON yedeği indir**. Dosya özel bilgi içerir. İndirilen gün ayar kaydına (`sonYedek`) yazılır ve Ayarlar → Yedekleme'de "Son JSON yedeği: … (N gün önce)" olarak görünür; telefon ve bilgisayar aynı tarihi görür. Hiç indirilmediyse ya da 14 günden eskiyse Genel Bakış'ta küçük bir hatırlatma çıkar.
- **Geri yükleme:** Ayarlar → İçe aktar → önizleme → "Tüm veriyi bu dosyayla değiştir" (onay için `GERİ YÜKLE` yazılır; büyük / küçük harf ve Türkçe harf farkı önemsiz), ya da **Otomatik kopyalar** listesinden bir kopyaya dön.
- **Otomatik kopyalar:** Sunucu tüm verinin sıkıştırılmış kopyasını alır:
  - her gün (İstanbul saatiyle) ilk kaydetmeden önce, aynı işlem içinde ("Günlük kopya"; kayıt yazılamazsa kopya da alınmaz, hiç kayıt yoksa alınmaz). Günün işareti `ayar` tablosunda `gunluk_anlik` satırında durur;
  - her içe aktarma, "Tüm veriyi bu dosyayla değiştir" ve kopyaya dönüşten önce.
  - Son 14 günlük kopya ve son 30 diğer kopya ayrı ayrı saklanır; günlük kopyalar içe aktarma kopyalarını listeden itmez. Liste Ayarlar → **Otomatik kopyalar**'dadır; her kopyaya dönülebilir (dönmeden önce şu anki hal de kopyalanır).
- **Son yedek tarihi:** Ayar kaydı isteğe bağlı `sonYedek` alanını (`YYYY-AA-GG`, son JSON yedeğinin indirildiği gün) tutar. Alan hiç gönderilmezse (eski arayüz eşiği kaydederken) saklı değer korunur; `null` gönderilirse silinir. Eski ayar kaydı ve eski yedekler bu alan olmadan çalışır.
- **Günlük kullanım (arayüz):**
  - İçerik satırlarında (İçerikler, Genel Bakış, müşteri sayfası, arama) ve pano kartlarında doğal sonraki adım için tek tık düğmesi vardır (ör. "→ Onaya gönder"; onaydakinde "→ Onaylandı" ve "→ Revizyon"). Pencere açılmaz, geçmişe yazılır, "Geri al" bildirimi gelir. Arşivdeki ve yayınlanmış içerikte düğme yoktur.
  - Revizyona alırken (tek tık "→ Revizyon", panoda sürükleme ya da toplu durum) küçük bir pencere "Ne düzeltilecek?" notunu ve isteğe bağlı yeni teslim tarihini sorar. Eski teslim tarihi kendiliğinden değişmez (pencerede "Önceki teslim tarihi: … (geçti)" yazar). Not geçmişe metniyle yazılır ("Revizyon notu: …", en çok 250 karakter); ikinci revizyonda ilk not kaybolmaz. Revizyondaki içeriğin notu listede ve panoda kısaltılmış görünür. Durum, not ve tarih tek değişiklikle kaydedilir; "Geri al" hepsini geri getirir.
  - Çekim "Tamamlandı" yapılınca (Genel Bakış düğmesi, çekim penceresi ya da takvim) bildirim, bağlı ve hâlâ "Fikir" / "Çekim planlandı"da duran içerikleri tek tıkla "Çekildi" yapmayı ve "İçerik ekle"yi (çekim seçili toplu ekleme) önerir; tıklanmadıkça hiçbir şey değişmez. Toplantı ve "diğer" türündeki etkinlikte bu teklif çıkmaz (yalnız "Geri al"). Unutulanlar Genel Bakış'ta "Çekimi tamamlandı, içerik “Çekildi” yapılmadı" bölümünde görünür. Bugünkü çekimin bitiş saati geçtiyse "Tamamlandı / İptal" düğmeleri ertesi günü beklemeden çıkar.
  - Çekim penceresinde başlangıç günü değişince süre korunur: iki günlük çekim iki gün, gece yarısını geçen çekim yine ertesi güne kadar sürer. Aynı gün içinde bitiş saati başlangıçtan önceyse bitiş tarihini ertesi gün yapma ipucu çıkar.
  - Tarih kutuları 2000–2099 arasını kabul eder: masaüstünde yıl iki haneli yazılırsa (tarayıcı "0026" yapar) kaydetmeden önce uyarı çıkar. Kayıtta zaten öyle duran eski bir tarih dokunulmadıkça kaydı engellemez.
  - İçeriğin müşterisi değişince başka müşterinin çekimine bağ kendiliğinden kalkar ve yanında nedeni yazar. Çekimin müşterisi, başka müşterinin içeriği (arşivdekiler dahil) bağlıyken değiştirilemez; pencere o içerikleri adıyla sayar.
  - "Bu kopyaya dön" onayı şu anki ve kopyadaki müşteri / içerik / çekim sayılarını yan yana yazar ve kopyadan sonra eklenen ve değiştirilen her şeyin geri alınacağını söyler.
  - Giriş ekranında "Şifreni mi unuttun?" açıklaması vardır (şifre e-postayla sıfırlanmaz; bkz. aşağıda "Şifre unutulursa"; veriler silinmez). Kilit mesajı yaklaşık 15 dakika beklemeyi söyler.
  - CSV dışa aktarımında sütun adları ve değerler ekrandaki gibidir ("Beklenen paylaşım türü: Diğer", "Ham görüntü bağlantısı").
  - Genel Bakış: başlığın altında boş olmayan her bölüm için sayılı bir düğme (dokununca o bölüme kayar); her bölümde en çok 5 satır ve aynı filtreli listeyi açan "+N tane daha"; en üstte "Bugün paylaşılacaklar" (bugüne planlı, yayına hazır içerikler, tek tık "Yayınlandı"); karşılanmayan paylaşım günleri müşteri başına tek satır. "Müşteri bazında durum" tablosu katlanır; açık / kapalı tercihi yalnız o tarayıcıda hatırlanır.
  - Onaydaki içerikte "N gündür onayda" yazar (geçmişteki son onaya gönderim günü; 3 günden itibaren uyarı renginde). Geçmişinde bu bilgi olmayan eski kayıtta yazmaz.
  - İçerikler listesi 200'er satır gösterir ("Daha fazla göster"); "Tümünü seç" yine filtreye uyan tüm içerikleri seçer (sayısı yazar). Kutu işaretlemek sayfayı yeniden çizmez; Shift ile tıklanan kutu son tıklananla arasındaki satırları da seçer. Satırın boş yerine dokunmak içeriği açar.
  - Liste ve panoda 14 günden önce yayınlanmış içerikler varsayılan olarak gizlidir; "N eski yayınlanmış içerik gizli · Göster" ile görünür. Durum ya da tarih filtresi, arama, çekim ve arşiv görünümünde hepsi gösterilir. Yayın tarihi olmayan kayıt gizlenmez. Panoda her sütun en çok 60 kart gösterir; sayı gerçek toplamdır, kalanı "+N tane daha · listede aç" ile açılır.
  - Arama: içerikler listedeki sırayla gelir (yayınlanmamışlar önce, arşivdekiler en sonda); 100'den fazlaysa "+N tane daha → İçerikler listesinde aç (A) · arşivde M": iki bağlantı aynı aramayla arşivde olmayan ve arşivdeki içerik listelerini açar, yazan sayılar açılan listelerdekiyle aynıdır. Çekimler yaklaşanlar önce gelir; 50'den fazlası "tane daha göster" ile yerinde açılır.
  - **Takvim** (menüde "Takvim"; eski `#/cekim` adresleri ve `g` / `t` / `kayan` / `musteri` parametreleri aynen çalışır, `#/takvim` da açar): saatli hafta (masaüstü varsayılan) / gün (700 px altı varsayılan) / ay görünümü; Çekim / Edit / Birlikte filtresi; çekim mavi + kamera, edit bloğu mor + makas, toplantı / diğer gri. Çalışma saatleri (Ayar: `calismaBas` / `calismaBit`, varsayılan 09–19) öne çıkar, gece saatleri katlıdır ("↑ / ↓ N iş" ipucu). Şimdi çizgisi Türkiye saatidir. Üst şerit: resmî tatiller, özel günler, doğum günleri (katmanlar bu cihazda açılıp kapanır), içeriklerin teslim tarihleri ince bayrak olarak ve tüm gün etkinlikler.
  - Takvimde sürükle-taşı (15 dk, günler arası), alt kenardan süre, sürüklerken çakışma hayaleti; hiçbir iş kendiliğinden kaydırılmaz. Her değişiklik hemen ekrana yansır ve mevcut kaydetme akışıyla (beklenen sürüm) gider: "Kaydediliyor… / ✓ Kaydedildi / Kaydedilemedi". Kaydedilemezse ekran sunucudaki hale döner, "Tekrar dene" çıkar; kayıt başka sekme / cihazda değiştiyse güncel hali yüklenir ve söylenir, üzerine yazılmaz. Her değişiklikten sonra tek "Geri al" bildirimi (önceki değerlerle yeni kaydetme). Klavye: oklar 15 dk / 1 gün, Shift + yukarı / aşağı süre, Enter ayrıntı (ekran okuyucuya duyurulur). Telefonda ayrıntı alttan açılır; adım düğmeleriyle taşınır, yana kaydırınca gün değişir.
  - Planlanacaklar çekmecesi: edit zamanı ayrılmamış içerikler müşteri + bağlı çekime göre gruplanır ("Müşteri — 2 reels"); takvime sürüklenince ya da "Zaman ayır"la önerilen boş aralığa bu içeriklere bağlı bir çalışma bloğu (`blok`) oluşur. Boş aralığı seçince hızlı oluşturma (Edit = blok, Çekim = çekim etkinliği; müşteri seçilmeden kaydedilmez, tahminle atanmaz; "Ayrıntılı form" tam pencereleri açar).
  - Tamamlama: bloğu bitirmek içeriğin durumunu değiştirmez; "Edit işini tamamla" bağlı içerikleri mevcut durum akışıyla "Yayına hazır" yapar (geri alınabilir). Çekimi tamamlamak içerikleri değiştirmez ("N video edit bekliyor"); çekim ertelenirken bağlı bloklar ve teslimler listelenir, değiştirilmez. "Bugün N iş tamamladın" ve isteğe bağlı haftalık hedef (Ayar: `haftalikHedef`; dolunca tek, sakin bildirim). Tamamlama sesi varsayılan kapalı (bu cihazda açılır); hareket azaltma tercihi animasyonları kapatır. "Şimdi ne yapayım?" kurala dayalı tek öneri ve nedenlerini gösterir; yalnız basınca takvime ekler. Takvim ayarlarında özel gün ekle / düzenle / arşivle (her yıl tekrar seçeneği). Google Takvim eşitlemesi yoktur; veri başka servise gitmez.
  - Takvimde telefon ve erişilebilirlik:
    - Telefonda (700 px altı) gün görünümü açılır. Üstte hafta şeridi vardır; gün, şeride dokunarak ya da takvimi sağa / sola kaydırarak değişir. Takvim parmakla yukarı / aşağı kayar; kaydırma yanlışlıkla "Yeni iş" açmaz.
    - Bir işe dokununca ayrıntı alttan açılır. "−15 / +15" (saat), "‹ / ›" (gün) ve süre düğmeleri en az 44 px'tir. Planlanacaklar da alttan açılır. Bildirimler alttaki düğme çubuğunun üstünde çıkar.
    - Aynı saatte çakışan işler yan yana durur ve müşteri adı okunur kalır. Sütun dar olduğu için sığmayanlar kaybolmaz: kenardaki "+N" düğmesi onları listeler.
    - Yalnız klavyeyle de kullanılır: Tab ile "Yeni", müşteri seç, Kaydet; oklarla taşı, Enter ile ayrıntı, Esc ile kapat (odak karta döner). Telefonda alttan açılan pencerede Tab pencerenin dışına çıkmaz.
    - Ekran okuyucu her kartı türü, müşterisi, işi, günü ve saatiyle okur; her düğmenin adı vardır. Kaydetme durumu da okunur.
    - Renk tek işaret değildir: türler simgeyle (kamera / makas) ve yazıyla da ayrılır. Çakışma "⚠" ile, geciken teslim "Gecikti · …" yazısıyla, biten iş üstü çizili ve tik işaretiyle görünür.
    - Cihazda "hareketi azalt" açıksa animasyonlar kapanır.
    - Çok iş olan haftalar (300 iş) hızlı çizilir. Uzun müşteri adları taşmaz. Çok eski ya da çok ileri tarihli işler görünür ve sürükleyerek ya da klavyeyle taşınır.
    - Arşivdeki müşterinin çekimleri eski takvimdeki gibi görünür. İçerikleri, teslim bayrakları ve Planlanacaklar'daki grupları gizlidir.
    - Bağı kopmuş kayıt (silinmiş müşteri, içerik ya da çekim) sayfayı bozmaz: kart "Müşterisiz" yazar. Bozuk saatli kayıt çizilmez.
    - Saatler her yerde Türkiye saatidir; cihaz başka saat dilimindeyse de "bugün" ve şimdi çizgisi İstanbul'a göredir.
  - Stok sayfası acil olanları üstte gösterir: önce stok uyarısı olanlar (ilk karşılanmayan paylaşım günü en yakın olan önce), sonra stok girişi yapılmayanlar, sonra diğerleri.
  - Tarayıcının geri tuşu sayfayı kalınan kaydırma konumunda açar; yeni açılan sayfa en üstten başlar.
  - Telefonda: girdiler 16 px (iPhone dokununca sayfayı büyütmez), düğmeler parmak boyunda, toplu seçim çubuğu ekranın altında sabit ("Durumu değiştir" durum seçilmeden kapalı), Müşteriler ve "Müşteri bazında durum" tabloları kart olarak, Yayın Takviminde müşteri seçimi "Filtreler" altında katlı; takvimlerin ay görünümünde hücreye dokunmak o günü açar.
  - Toplu arşivleme 10 ve daha fazla içerikte önce sorar. İçerikler → Arşiv görünümünde toplu düğme "Arşivden çıkar"dır. 5 ve daha fazla kaydı değiştiren işlemin "Geri al" bildirimi kapatılana kadar durur.
  - Yazı yazılmış bir pencere Esc, ×, Vazgeç ya da telefonda geri tuşuyla kapatılmak istenirse önce "Kaydedilmemiş değişiklik" diye sorar; böyle bir pencere açıkken sekme kapatılır ya da sayfa yenilenirse tarayıcı uyarır. Hiçbir şey değişmediyse ya da kaydetme sürerken soru çıkmaz.
- **Takvim veri modeli (yalnız ekleme; şema sürümü ve tablo yapısı değişmedi):** Yeni kayıtlar aynı `kayitlar` tablosunda yeni tür adlarıyla durur. Eski kayıtlar ve alanlar olduğu gibi çalışır.
  - `blok` (çalışma bloğu, edit zamanı): `musteriId` (zorunlu), `icerikIdler` (en çok 50; hepsi aynı müşterinin içeriği olmalı), `baslik` (boş olabilir; arayüz içeriklerden üretir), `basTarih` / `basSaat` / `bitTarih` / `bitSaat` (gece yarısını aşabilir; bitiş başlangıçtan sonra olmalı), `durum` (`planlandi` / `tamamlandi`), `tamamZaman`, `not`, `arsiv`. Bloğu tamamlamak içeriklerin durumunu değiştirmez.
  - `ozelgun`: `baslik`, `tarih`, `tur` (`ozel` / `dogum`), `herYil`, `arsiv`.
  - `etkinlik`: isteğe bağlı `tamamZaman` (tamamlandığı an, Türkiye saatiyle). Eski kayıtlarda yoktur; tarih uydurulmaz.
  - `ayar`: isteğe bağlı `calismaBas` / `calismaBit` (gün içindeki dakika; varsayılan 540–1140, yani 09.00–19.00) ve `haftalikHedef` (0–99; boş ya da 0 hedef yok). Gönderilmeyen alan saklı değeri korur.
  - Yedek, içe aktarma, otomatik kopya ve kopyaya dönüş bu türleri de taşır.
- **Takvim güncellemesi ve geri dönüş:**
  - Güncellemeden **önce** Ayarlar → **JSON yedeği indir** ile yedek al. Dosyaları yükledikten sonra ilk kaydetmede sunucu ayrıca günlük otomatik kopya alır.
  - Eski dosyalara (`index.php` ve arayüz) dönülebilir. Takvim sürümünün `index.php`'si tek dosyadır, `studio-ortak.php`'yi kullanmaz; dönüşte o dosya klasörde kalabilir. Eski sürüm `blok` ve `ozelgun` kayıtlarını görmez, göstermez ama silmez; veritabanında kalırlar ve yeni sürüme dönülünce yine görünürler.
  - Eski sürümdeyken dikkat:
    - Bir çekimi kaydetmek o çekimin `tamamZaman` alanını siler.
    - Ayar kaydetmek (stok eşiği) çalışma saatlerini ve haftalık hedefi siler.
    - "Tüm veriyi bu dosyayla değiştir" ve kopyaya dönüş, bloklar ile özel günleri de siler.
    - Bir içeriğin müşterisini değiştirmek, o içeriği içeren çalışma bloğunu bozmaz; yeni sürüme dönünce blok ilk kaydedilişinde (taşıma, tamamlama ya da düzenleme) o içerik bloktan kendiliğinden çıkar.
    - Gerekirse yeni sürüme dönüp güncellemeden önce aldığın JSON yedeğini "Yalnız yenileri ekle" ile içe aktar.
- **Sunucu mesajları:** Türkçe harfli ve ekrandaki alan adlarıyla yazılır (ör. "Aylık ücret 0 ile 100.000.000 arasında tam sayı olmalı"; içe aktarma önizlemesinde "2. müşteri (Ad): …"). Hata kodları (`hata`) değişmez; arayüz koda göre davranır. Mesajlarda sunucu yolu ya da SQL yer almaz.
- **Şifre değiştirme:** Ayarlar → Güvenlik. Yeni özet veritabanına yazılır ve diğer tüm oturumlar kapanır.
- **Şifre unutulursa:** `php sifre-ozeti.php` ile yeni özet üret ve `config.php`'deki `'password_hash'` alanına yaz. `config.php`'deki özet değişince o geçerli olur; daha önce panelden konan şifre artık geçmez. (PHP önbelleği yüzünden değişiklik birkaç saniye sonra etkin olur.)
- **Kapatma / geri alma:** `public_html/studio/v1/` klasörünü kaldırmak servisi kapatır. Veri `private/studio-v1/` içinde kalır.

## Testler

```text
node tests/test-studio-core.js   # stok, yayın ihtiyacı, takvim çakışması, saat dilimi, CSV (saf mantık); arayüz dosyaları ve .htaccess denetimi
node tests/test-studio-api.js    # gerçek php -S + geçici SQLite: yetki, CSRF, kilit, kayıt, içe aktarma, geri yükleme
node tests/test-studio-ortak.js  # ortak veri kitaplığı panelsiz: kayıt / sürüm / mükerrer / otomatik kopya / şifre kilidi; doğrudan erişim 403
node tests/test-studio-e2e.js    # gerçek tarayıcı (Playwright): masaüstü (1280 / 1440 / 1920) + telefon (360 / 390 / 430) akışları, takvimde klavye, ekran okuyucu etiketleri, hareket azaltma, 300 iş, New York saat dilimi
```

Testler yalnız anonim örnek veri kullanır. `php` ya da Playwright yoksa ilgili test **ATLA** yazıp geçer. CI her push'ta şunları çalıştırır: `php` işi API testini (SQLite), `studio-mysql` işi aynı API testini MariaDB ile, `studio-e2e` işi tarayıcı testini Chromium ile. `studio-e2e` işinde Playwright ya da `pdo_sqlite` yoksa test atlanmaz, kalır (`STUDIO_E2E_ZORUNLU=1`).

API testini kendi MySQL / MariaDB sunucunla çalıştırmak için bağlantıyı ortam değişkeniyle ver. Kullanıcı `studio_test_` ile başlayan veritabanlarını açıp silebilmeli; test bitince açtıklarını siler. Sunucu kodu ortam değişkeni okumaz, yalnız test okur.

```text
STUDIO_TEST_MYSQL="host=127.0.0.1;port=3306" STUDIO_TEST_DB_USER=... STUDIO_TEST_DB_PASS=... node tests/test-studio-api.js
```
