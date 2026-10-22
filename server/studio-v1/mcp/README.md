# Suflo Studio uzak MCP sunucusu (sohbet bağlantısı)

claude.ai ve ChatGPT sohbetleri Studio'ya bu sunucu üzerinden bağlanır. İsteği sohbetin kendi modeli yorumlar. Sunucu yalnız doğrulanmış işlemleri yapar. Ek yapay zekâ, API anahtarı ya da ücretli servis yoktur; yalnız PHP 8.3 ve `pdo_sqlite` kullanılır.

Bu klasör şu parçaları içerir:

- OAuth 2.1 yetkilendirme sunucusu.
- Keşif belgeleri.
- MCP taşıma katmanı (Streamable HTTP; yalnız POST ve JSON, SSE yok).
- Ayrı bir SQLite deposu.
- Araç kaydı.

Studio kayıtlarına dokunan araç işleyicileri **arka uç arayüzünün** arkasındadır (aşağıda). Gerçek arka uç `mcp-kitaplik/arka-studio.php`'dir ve Studio veritabanına panelle **aynı kitaplıktan** (`../studio-ortak.php`) bağlanır: aynı doğrulama, aynı yazma yolu, aynı otomatik kopya, aynı şifre kilidi.

> **Dikkat:** Bu sürüm yüklendiğinde onay sayfası Studio şifresini kabul eder ve sohbet bağlantısı Studio verisine yazabilir. Önce test kurulumunda (`studio-test`, ayrı `private/studio-test-v1/config.php` ve **ayrı** `dsn`) dene. Kapatmak için `config.php`'ye `'mcp_acik' => false` yaz.

Tasarımın kaynağı `mcp-tasarim.md` (v1) belgesidir. Studio şeması ve `pro` dosyaları değişmedi. Panelin veri mantığı, davranışı değişmeden ortak kitaplığa (`../studio-ortak.php`) ayrıldı; gerçek arka uç onu kullanacak (aşağıda).

## Dağıtım

| Repo (`server/studio-v1/mcp/`) | Sunucu (`public_html/` altında) | Not |
|---|---|---|
| `mcp-giris.php` | `studio/mcp-giris.php` | MCP uç noktası. Adres `https://assets.suflo.app/studio/mcp` |
| `oauth-giris.php` | `studio/oauth-giris.php` | `/studio/oauth/{authorize,token,register,revoke}` |
| `kesif-giris.php` | `studio/kesif-giris.php` | PRM ve AS / OIDC metadata |
| `mcp-onay.js`, `mcp-onay.css` | `studio/mcp-onay.js`, `studio/mcp-onay.css` | Onay sayfasının betiği ve stili |
| `mcp-kitaplik/` (`.htaccess` dahil) | `studio/mcp-kitaplik/` | Kitaplık. Dışarıya kapalı (403) |
| `studio.htaccess` | `studio/.htaccess` | `../arayuz.htaccess`'in **bütün kuralları**, https yönlendirmesi ve MCP kuralları. arayuz.htaccess'in yerine yüklenir |
| `well-known.htaccess` | `.well-known/.htaccess` | **Yeni dosya.** Yalnız tam keşif adlarını eşler; `acme-challenge`'a dokunmaz |
| `../studio-ortak.php` | `studio/v1/studio-ortak.php` | Panelle ortak veri kitaplığı. Panelin `index.php`'si de onu ister; ikisi her zaman **birlikte** yüklenir. `v1/.htaccess` dışarıya kapatır (403) |

Giriş dosyalarının adı bilerek istek yollarından farklıdır (`mcp` → `mcp-giris.php`). MultiViews açık bir sunucuda `/studio/mcp` ya da `/studio/oauth/token` isteği aksi hâlde yeniden yazmadan önce `mcp.*` / `oauth.*` adlı bir dosyaya eşlenirdi. Bu yüzden `.htaccess`'te `Options -MultiViews` yoktur; Options değişikliğine izin vermeyen sunucularda o satır 500 verirdi. Dosyaları yeniden adlandırma.

`studio/.htaccess` kendi `RewriteEngine On` satırını taşıdığı için `public_html/.htaccess`'teki https yönlendirmesi `/studio/` altında (panel `/studio/v1/` dahil) artık uygulanmaz. Aynı yönlendirme `studio.htaccess`'te açıkça yapılır: `HTTPS` kapalı ve `X-Forwarded-Proto` `https` değilse 301 ile `https://` adresine.

Test kurulumunda aynı dosyalar `public_html/studio-test/` altına konur. Ayar ve veri yolu uygulama klasörünün adından çıkar; panelle aynı kural geçerlidir: `dirname(DOCUMENT_ROOT)/private/<klasör>-v1/`.

- `studio` → `private/studio-v1/config.php` (canlıdaki bugünkü yol, değişmedi)
- `studio-test` → `private/studio-test-v1/config.php`

Depo ilk istekte kendiliğinden kurulur: `private/<klasör>-v1/mcp.sqlite` (ayrı dosya, kendi şema sürümü, kurulum kilidi altında). Eski şema sürümündeki depo aynı kilit altında (`BEGIN IMMEDIATE`) yerinde yükseltilir; veri korunur (1 → 2: refresh token tolerans sütunları; 2 → 3: işlem günlüğünde grant sütunu ve `istek_anahtari` kayıtları). `config.php`'ye yeni ayar eklemek **gerekmez**; varsayılanlar koddadır.

Keşif adresleri (hepsi `kesif-giris.php`'den gelir; `issuer` her belgede bayt bayt aynı):

| Adres | Belge |
|---|---|
| `/.well-known/oauth-protected-resource/studio/mcp` | PRM (RFC 9728), `resource` = `https://assets.suflo.app/studio/mcp` |
| `/.well-known/oauth-authorization-server/studio` | AS metadata (RFC 8414), `issuer` = `https://assets.suflo.app/studio` |
| `/.well-known/openid-configuration/studio` | Aynı belge (OIDC biçimi) |
| `/studio/.well-known/openid-configuration` | Aynı belge (yolun sonuna eklenen biçim) |
| `/studio/.well-known/oauth-authorization-server` | Aynı belge (eski istemciler) |

Kök `.well-known/.htaccess` hakkında üç not:

- Bu dosyada `RewriteEngine On` var. Bu yüzden `public_html/.htaccess`'teki yeniden yazma kuralları (ör. https'e yönlendirme) `/.well-known/*` için uygulanmaz. ACME doğrulaması için bu zararsızdır, hatta iyidir.
- Klasörde başka bir `.htaccess` varsa üç `RewriteRule` satırı ona eklenir.
- Kurulumdan sonra `/.well-known/acme-challenge/<deneme-dosyası>`'nın 200 döndüğünü ve hPanel'de SSL'in geçerli kaldığını kontrol et.

### Ayarlar (`config.php`, hepsi isteğe bağlı)

| Anahtar | Varsayılan | Anlamı |
|---|---|---|
| `mcp_acik` | `true` | `false`: MCP, OAuth ve keşif 503 döner (genel kapatma anahtarı). Açılınca mevcut bağlantılar sürer |
| `kok_url` | `https://assets.suflo.app` | Dış kök adres. **Yalnız buradan** okunur, Host başlığından okunmaz |
| `mcp_redirect_izinli` | `claude.ai` ve `claude.com` `/api/mcp/auth_callback`, `chatgpt.com/connector_platform_oauth_redirect`, `chatgpt.com/connector/oauth/*` | Dönüş adresi izin listesi. `*` tek bir `[A-Za-z0-9_-]` yol parçası demektir |
| `mcp_origin_izinli` | `https://claude.ai`, `https://claude.com`, `https://chatgpt.com` | Origin başlığı gelirse bu listede olmalı; gelmezse kabul edilir |
| `mcp_db` | `private/<klasör>-v1/mcp.sqlite` | MCP deposu |
| `mcp_arka` | `mcp-kitaplik/arka-studio.php` | Arka uç dosyası (gerçek arka uç; testlerin bir bölümü sahte arka uç verir) |
| `dsn`, `db_user`, `db_pass` | (panelle ortak) | Gerçek arka ucun bağlandığı Studio veritabanı. Panel ile aynı `config.php`'den okunur |
| `cookie_secure` | `true` | Panelle ortak. Onay çerezi `__Host-` önekli olur |

### Geri dönüş

Üç yol var:

- `config.php`'de `'mcp_acik' => false` yaz.
- Ya da `studio/.htaccess`'teki "Suflo Studio MCP" bölümünü sil (ya da `arayuz.htaccess`'i geri koy) ve `mcp-giris.php`, `oauth-giris.php`, `kesif-giris.php` dosyalarını ve `.well-known/.htaccess`'teki üç satırı kaldır.
- `mcp.sqlite` silinebilir; bütün bağlantılar biter.

Panel ve Studio verisi bunlardan etkilenmez.

## Güvenlik özeti

- **İstemci kaydı (DCR, RFC 7591):**
  - Dönüş adresi yalnız izin listesinden olabilir: https; http yalnız 127.0.0.1 / localhost; `#`, `/../` ve kullanıcı bilgisi yasak.
  - Hız sınırı: aynı IP'den saatte 10 istek (doğrulamadan önce sayılır, reddedilen istekler dahil) ve toplam günde 50 kayıt. Genel sayaç yalnız bütün doğrulamalardan geçen ve gerçekten eklenen kayıtları sayar; sayaç ile ekleme aynı işlemdedir. Dolunca 429 döner: gövde RFC 7591 biçiminde (`error: temporarily_unavailable`, `error_description`), `Retry-After` bir sonraki güne (UTC) kalan saniye.
  - Her kayıt yeni bir istemci açar; var olan istemci asla değişmez. Hiç bağlanmamış (grant almamış) istemciler 6 saat sonra silinir; bağlanmış istemci silinmez. Kayıttan sonra 6 saat içinde onaylanmayan bir bağlantı sohbet uygulamasından yeniden başlatılmalıdır (onay sayfası "Bilinmeyen uygulama" der).
  - **Kalan risk:** kayıt kimlik doğrulamasız ve açıktır (MCP istemcileri böyle çalışır). Çok sayıda IP'si olan biri izinli bir dönüş adresiyle (`claude.ai` ...) geçerli kayıtlar gönderip günlük 50'lik kotayı yine doldurabilir. O gün claude.ai / ChatGPT yeni bağlantı kuramaz; **var olan bağlantılar etkilenmez** (kayıt yalnız ilk bağlanmada gerekir). Sahte istemciler hiçbir şeye erişemez (onay sayfası Studio şifresi ister) ve 6 saat sonra silinir. Sahip, Ayarlar ekranından `mcp_kayit_sayaci_sifirla()` ile sayacı sıfırlayıp hemen bağlanabilir.
  - CIMD yok (`client_id_metadata_document_supported` yazılmaz).
- **Onay sayfası (`/oauth/authorize`):**
  - Sayfada şunlar görünür: uygulamanın kendi verdiği ad (kaçışlı), dönüş adresinin host'u, izinler (`studio.oku` zorunlu, `studio.yaz` seçilebilir) ve Studio şifresi.
  - Gizlilik ve çerçeve: `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `noindex`, `no-store`, `no-referrer`.
  - Karar `fetch` ile gönderilir. Bunun iki nedeni var: `.htaccess`'teki arayüz CSP'si `form-action 'none'`'dır ve Apache bunu PHP'nin kendi CSP'siyle **birlikte** gönderir; form gönderimi engellenirdi. Kararın geçerli olması için beş koşul gerekir:
    - aynı Origin,
    - `X-Suflo-Onay: 1` başlığı,
    - tek kullanımlık CSRF jetonu (istek kimliğine bağlı, 10 dk),
    - sayfayı açan tarayıcının `HttpOnly` + `SameSite=Strict` çerezi,
    - sayfa başına en çok 10 deneme.
- **Şifre denetimi panelin kilidindedir.** Şifre her zaman arka ucun `sahip_sifre_dene()` işlevinden geçer; MCP kendi denetimini yapmaz. Grant oluşurken panelin şifre izi saklanır. Panelde şifre değişirse ya da `config.php`'deki özet değişirse bütün grant'ler bir sonraki istekte geçersiz olur.
- **Kod ve jetonlar:**
  - Kod 5 dk geçerlidir, tek kullanımlıktır. Yalnız PKCE S256 kabul edilir; `plain` ve PKCE'siz istek reddedilir. Kod; istemciye, dönüş adresine, PKCE'ye, `resource`'a ve kapsama bağlıdır. İkinci kez kullanılırsa o koddan çıkan grant iptal edilir.
  - Access token 60 dk geçerlidir.
  - Refresh token 30 gün kayar ve her kullanımda yenisi verilir. Eski refresh token yeniden gelirse grant'in tamamı iptal edilir.
  - **Eşzamanlı yenileme toleransı (60 sn):** access token süresi dolunca istemcinin paralel iki isteği aynı refresh token'ı iki kez gönderebilir. Az önce dönüştürülmüş jeton 60 saniye içinde yeniden gelirse ve şu koşulların hepsi tutarsa grant iptal edilmez: aynı istemci, grant etkin, panel şifre izi değişmemiş, dönüşümde verilen yeni (halef) refresh token hâlâ etkin ve hiç kullanılmamış. Bu durumda halef **iptal edilmeden** onun kardeşi olan yeni bir access + refresh çifti verilir. İstemci iki yanıttan hangisini saklarsa saklasın çalışır (hangisinin en son yazıldığı belli değildir). Kardeşlerden biri dönüştürülünce diğerleri de "kullanıldı" olur; sonradan gelirlerse tekrar algılaması aynen işler. Aynı dönüşümden en çok 3 etkin kardeş olur; fazlası iptalsiz `invalid_grant` alır. Pencere dışında ya da halef kullanılmışsa eski davranış geçerlidir: grant'in tamamı iptal. Kalan risk: eski refresh token'ı çalan biri, meşru dönüşümden sonraki 60 saniye içinde ve meşru istemci halefi kullanmadan önce gelirse iptal tetiklenmeden bir kardeş çift alır. Kardeşlerden biri dönüştürüldüğünde diğeri "kullanıldı" olur; pencere dışında gelince tekrar algılaması grant'i yine iptal eder.
  - Grant'in mutlak ömrü 180 gündür.
  - Jetonlar opaktır (32 bayt). Depoda yalnız SHA-256 özetleri durur.
  - `resource` (RFC 8707) kanonik MCP adresine eşit olmalıdır. Jetonun audience'ı her istekte denetlenir.
  - Yönlendirmelerde `iss` (RFC 9207) bulunur. `/revoke` RFC 7009'a uyar.
- **MCP uç noktası:**
  - Yalnız POST kabul edilir; GET ve DELETE 405 döner (`Allow: POST`). Oturum kimliği yoktur.
  - Origin denetimi ve Bearer jeton denetimi JSON-RPC'den **önce** yapılır:
    - jeton yok → 401, `error` özniteliği yok
    - jeton geçersiz, süresi dolmuş, iptal ya da yanlış audience → 401 `invalid_token`
    - yazma aracı ama `studio.yaz` yok → 403 `insufficient_scope` (`scope="studio.oku studio.yaz"`)
  - Gövde sınırları: en çok 1 MiB; toplu dizi 400/-32600; bozuk JSON 400/-32700.
- **Hız sınırları:**
  - Grant başına 10 dakikada 600 istek ve 60 yazma.
  - IP başına: onay sayfası 10 dakikada 60, onay kararı 15 dakikada 30, token 10 dakikada 120 istek.
  - Veritabanı meşgulse 503 ve `Retry-After` döner.
- **Önbellek:** Bütün yanıtlarda `Cache-Control: no-store` ve `X-LiteSpeed-Cache-Control: no-cache` bulunur.
- **İki protokol dönemi aynı uçta (dönem, gövdeden belirlenir):**
  - **Eski dönem:** `initialize` ile anlaşılır. Desteklenen sürümler 2025-11-25 ve 2025-06-18. 2025-03-26 isteyen istemciye 2025-06-18 önerilir; bilinmeyen sürüme 2025-11-25.
  - **Yeni dönem (2026-07-28):** her istekte `_meta` zarfı gelir ve `server/discover` desteklenir.
    - `MCP-Protocol-Version`, `Mcp-Method` ve (tools/call'da) `Mcp-Name` başlıkları gövdeyle aynı olmalı; değilse 400/-32020.
    - Desteklenmeyen sürüm 400/-32022, eksik zarf 400/-32602, bilinmeyen yöntem 404/-32601 döner.
  - Kurallar `@modelcontextprotocol/server` 2.3.1 sınıflandırıcısıyla aynıdır.

## Arka uç arayüzü (gerçek Studio işleyicilerini yazacak kişi için)

Dosya: `mcp-kitaplik/arka.php`. Arka uç, iki arayüzü birden uygulayan **bir nesne döndüren** bir PHP dosyasıdır (`return new class ... implements McpSahipDogrulayici, McpStudioArka { ... };`). Dosyanın kapsamında iki değişken vardır: `$C` (config dizisi) ve `$ozel` (`private/<klasör>-v1`). Gerçek uygulama `mcp-kitaplik/arka-studio.php`'dir; istenirse config'te `mcp_arka` ile başka bir dosya gösterilir. Sahte uygulama: `tests/fixtures/studio-mcp/arka-sahte.php` (yalnız taşıma katmanı testleri için).

```php
interface McpSahipDogrulayici {
    // Panelin sifre_dene() kilidinden geçer (deneme denetimden ÖNCE sayılır; kilitliyken şifre denenmez).
    // Döner: ['durum' => 'dogru'|'yanlis'|'kilitli'|'kurulmadi', 'iz' => ?string]   ('iz' yalnız 'dogru'da: sifre_izi(dogrulanan ozet))
    public function sahip_sifre_dene(string $sifre): array;
    // Şu anki iz: sifre_izi(sifre_ozeti()); şifre yoksa null. Her MCP isteğinde çağrılır.
    // Geçici hatada McpMesgulHatasi fırlatır; null DÖNDÜRMEZ (null = "şifre yok" = bütün bağlantılar kesilir).
    public function sahip_sifre_izi(): ?string;
}
interface McpStudioArka {
    public function arac(string $ad, array $girdi, McpBaglam $b): McpSonuc;                    // okuma + tekil yazma araçları
    public function toplu_dogrula(array $islemler, McpBaglam $b): array;                      // hiçbir şey yazmaz
    public function toplu_uygula(array $islemler, string $toplu_anahtar, McpBaglam $b): array; // anlık kopya + tek işlem
}
```

### `sahip_sifre_dene`

- Panelin `sifre_dene($sifre, cihaz_ozeti())` işlevini **aynen** kullanmalıdır. Aynı `girisler` tablosunu, aynı sınırları (`login_max_fail`, `login_window`) ve tanınan cihaz kuralını uygular.
- Onay sayfası panelle aynı adreste (`assets.suflo.app`) açıldığından tarayıcı `__Host-suflo_studio_cihaz` çerezini de gönderir.
- Bunun için `studio-ortak.php`'deki `sahip_sifre_dene($sifre)` kullanılır: panelin `sifre_dene_durum()` kilidinden geçer (`cihaz_ozeti()` dahil), çıkmaz, `['durum', 'iz']` döner. Şifre hiç ayarlanmamışsa `kurulmadi` döner ve deneme sayılmaz. Panelin kendi `sifre_dene()`'si aynı çekirdeği kullanır; kilitte yine 429 yanıtı verir.
- `sahip_sifre_izi()`: şu anki iz ya da şifre yoksa null. Veritabanı hatası istisna olarak gelir; arka uç bunu `McpMesgulHatasi`'na çevirir (null döndürmez).

### `arac($ad, $girdi, $b)`

Bu işleve okuma araçları ve tekil yazma araçları gelir. `studio_bugun`, `studio_toplu_onizle` ve `studio_toplu_uygula` MCP katmanındadır; buraya gelmez.

Girdi buraya gelmeden önce MCP katmanında denetlenir:

- `$girdi` aracın `inputSchema`'sına göre **doğrulanmıştır**: tür, biçim (YYYY-AA-GG, SS:DD), zorunlu alanlar, uzunluk ve enum; tanınmayan alan yoktur.
- Varsayılanlar doldurulmuştur: `adet = 1`, `limit = 50`, `durum = 'fikir'`, `tum_gun = false`, `cakismayi_onayla = false`.
- Çapraz kurallar denetlenmiştir:
  - Takvim aralığı en çok 62 gündür; bitiş başlangıçtan önce olamaz.
  - Saatli etkinlikte `baslangic_saati` zorunludur, `bitis_saati` ya da `sure_dakika`'dan tam olarak biri verilir.
  - Tüm gün etkinlikte saat verilmez.

İş kuralları arka uçtadır:

| Durum | Ne yapılır |
|---|---|
| Müşteri yok ya da arşivde | `McpAracHatasi('…')` ya da `McpSonuc::hata('…')`. Model kullanıcıya sorar |
| Müşteri adı (`musteri_adi`) | Yalnız **tam** ad (ya da "ad · kurum"), Türkçe büyük / küçük harf duyarsız (`norm()`). Hiç ya da birden çok eşleşme: iş hatası + aday adlar (id'leriyle); hiçbir şey yazılmaz, tahmin edilmez. Eksik ad ("Özge") benzer adları önerir ama seçmez |
| Çakışma | Arayüzle aynı kural (`studio-core.js` `zamanCakisanlari` / `takvimdeSayilir`): etkinlik **ve** çalışma bloğu birlikte; arşiv, iptal ve tamamlanmış sayılmaz; `[başlangıç, bitiş)` yarı açık (uç uca değmek çakışma değil); tüm gün etkinlik bütün günü kapatır. `cakismayi_onayla !== true` ise YAZMAZ; `durum = 'cakisma'` ve `cakisanlar` (id, tür, başlık, saat) döner |
| Mükerrer (tekil yazmalar) | Kayıt kimliği `$b->kayit_kimligi($girdi['istek_anahtari'])`: `sha256('mcp|'.grant.'|'.anahtar)` ilk 24 hex; yazma panelin istemci kimlikli `kayit_yaz` yoludur. Aynı anahtar → aynı kayıt (`durum = 'zaten_vardi'`). Aynı anahtar **farklı girdiyle** (ya da başka araçta) gelirse MCP katmanı (`mcp_istek`) arka uca gitmeden reddeder. Anlamsal mükerrer de denetlenir (etkinlik: aynı müşteri + başlık + başlangıç; içerik: aynı müşteri + başlık + tür + tarihler; blok: aynı müşteri + başlangıç + içerikler; müşteri: aynı ad + kurum) |
| Güncelleme | Panelin `WHERE surum = ?` mekanizması kullanılır. Uyuşmazlıkta hiçbir şey yazılmaz: **iş hatası** (`isError`, metin "409 Sürüm uyuşmazlığı"), `structuredContent` `durum = 'surum_uyusmadi'` ve güncel kayıt |
| `studio_icerik_olustur` ve `adet > 1` | YAZMAZ. `$b->toplu_onizle($islemler)` çağrılır; dönen önizleme ve `onay_kodu` ile `durum = 'onay_gerekli'` döndürülür |
| Geçmiş satırı | MCP ile oluşan içeriklerin geçmişine "Sohbetten eklendi (`$b->istemci_adi`)" yazılır; durum değişikliğinde "Sohbetten değiştirildi (…)" ve arayüzle aynı "Eski → Yeni" satırı |
| Ücret | Hiçbir çıktıda dönmez; müşteri notu da dönmez. Araç şemaları `ucret` alanını kabul etmez (bilinmeyen alan) |
| Geçici hata | `McpMesgulHatasi` fırlatılır. Model "meşgul, aynı istek_anahtari ile yeniden dene" görür |

Dönüş biçimi:

- Başarılı sonuç: `McpSonuc::tamam($veri, $kisaMetin, $etkilenenKimlikler, $gunlukOzeti)`.
- İş hatası: `McpSonuc::hata($metin)`.
- `$veri`, aracın `outputSchema`'sına **uymalıdır**. MCP katmanı bunu denetler; uymazsa sonuç `isError` olur ve sunucu günlüğüne yazılır.
- `$etkilenen` ve `$ozet` işlem günlüğüne yazılır. Sır, şifre ya da jeton yazma.

### `toplu_dogrula($islemler, $b)`

Her işlem `islem` alanını taşır: `icerik_olustur`, `cekim_olustur`, `icerik_durum` ya da `cekim_durum`. İşlemler `studio_toplu_onizle` şemasına göre doğrulanmış gelir.

Döner: `['gecerli' => bool, 'satirlar' => [['sira','islem','ozet','durum' => 'gecerli'|'uyari'|'hata','mesaj'], …], 'uyarilar' => [string…]]`.

`gecerli` true ise MCP katmanı bir onay kodu verir. Kod 15 dk geçerlidir, tek kullanımlıktır ve işlem listesinin SHA-256 özetine ve grant'e bağlıdır; liste depoda saklanır.

### `toplu_uygula($islemler, $toplu_anahtar, $b)`

Bu işlev yalnız kullanıcı kodu onayladıktan sonra çağrılır:

1. Önce anlık kopyayı al: `anlik_al('mcp_toplu_oncesi')` (`studio-ortak.php`; `islem()` içinde, yazmalarla aynı işlemde).
2. Sonra **tek işlemde** hepsini ya da hiçbirini uygula.
3. Kayıt kimliklerini kararlı türet ki yarıda kesilen bir uygulama yeniden denenebilsin ve mükerrer açılmasın. En basiti `$toplu_anahtar`'dan: `substr(sha256($toplu_anahtar.'|'.$sira), 0, 24)`. Gerçek arka uç daha sıkısını yapar: `sha256('mcp|'.grant.'|toplu|'.kanonikJSON(işlem).'|'.tekrarSırası)`; aynı liste başka bir onay koduyla yeniden onaylansa da ikinci kayıt açılmaz. Ayrıca anlamsal mükerrer satırlar önizlemede "uyari" olur ve uygulamada atlanır (`zaten_vardi`).
4. Önizlemeden sonra veri değiştiyse (eski sürüm, çakışma) uygulama **hiçbir şey yazmaz** (kopya da geri alınır) ve `tamam: false` döner.

Döner: `['tamam' => bool, 'mesaj' => string, 'veri' => array, 'etkilenen' => [kimlik…], 'anlik_id' => ?string]`.

Aynı kod yeniden gelirse ilk sonuç döner ve işlem tekrarlanmaz. `McpMesgulHatasi` fırlatılırsa kod yanmaz.

### `McpBaglam`

| Alan / yöntem | Anlamı |
|---|---|
| `izin_id` | Grant kimliği |
| `istemci_id` | İstemci kimliği |
| `istemci_adi` | İstemcinin kendi verdiği ad, ör. "Claude" |
| `kapsamlar` | Jetonun kapsamları |
| `zaman` | İsteğin zamanı |
| `kayit_kimligi($anahtar)` | Tekil yazmalarda kayıt kimliği |
| `yazabilir()` | Jetonda `studio.yaz` var mı |
| `toplu_onizle($islemler)` | `studio_toplu_onizle` ile aynı yol |

### Araçlar

Tanımlar `mcp-kitaplik/araclar.php`'dedir: ad, Türkçe başlık ve açıklama, şemalar, dört ipucu. `openWorldHint` hepsinde false'tur.

| Araç | İzin | İpuçları |
|---|---|---|
| `studio_bugun` | studio.oku | readOnly (MCP katmanında; İstanbul tarihi, 14 günlük tablo) |
| `studio_musteri_ara`, `studio_takvim`, `studio_icerik_listele` | studio.oku | readOnly |
| `studio_musteri_olustur`, `studio_cekim_olustur`, `studio_icerik_olustur`, `studio_edit_zamani_ayir` | studio.yaz | destructive=false, idempotent=true |
| `studio_icerik_durum_guncelle`, `studio_cekim_durum_guncelle` | studio.yaz | destructive=true, idempotent=true |
| `studio_toplu_onizle` | studio.yaz | readOnly (yalnız önizler ve kod verir) |
| `studio_toplu_uygula` | studio.yaz | destructive=true, idempotent=true |

## Ortak veri kitaplığı (`../studio-ortak.php`)

Panelle aynı veri kodu. Arka uç onu şöyle yükler (arka uç dosyasının kapsamında `$C` ve `$ozel` vardır):

```php
define('STUDIO_ORTAK', 1);
require_once __DIR__ . '/../v1/studio-ortak.php';   // arka uç public_html/<klasör>/mcp-kitaplik/ içinde; kitaplık <klasör>/v1/'de
studio_ayar_kullan($C);   // varsayılanlar + kitaplığın etkin ayarı
```

- Kurulum, veritabanı ve kilit hataları `StudioHatasi` istisnasıdır (`http`, `kod`: `kurulum` / `veritabani` / `mesgul` / `kilit`). Kitaplık süreci sonlandırmaz; panel ise kendi yanıtlayıcısını `studio_dur_ayarla('hata')` ile kaydeder ve eskisi gibi JSON yanıtıyla çıkar.
- Yazma: `kayit_kaydet($tur, $id, $veri, $surum)` panelin "kaydet" işlemidir: tek işlemde (SQLite `BEGIN IMMEDIATE`, MySQL `FOR UPDATE`) günlük otomatik kopya + `kayit_yaz`. İstemcinin verdiği kimlikle yeni kayıt tekrarlanırsa ikinci kayıt açılmaz; güncelleme yalnız `$surum` hâlâ geçerliyse yazılır. Birden çok yazma için `islem(function () { gunluk_anlik(); $var = tur_haritasi(tum_kayitlar()); … kayit_yaz(…, $var) … })`.
- Hata türü: `yazma_hatasi_kodu($e)` → `gecersiz` | `cakisma` | `yok` | `ayni_ad` | `mesgul` | `veritabani_sinir` | `sunucu`. `cakisma`'da güncel kayıt `cakisma_guncel_json($e)`'dedir.
- Okuma: `kayit_oku($tur, $id)`, `kayitlari_oku($tur)` (arşivdekiler dahil; `ucret` alanı da gelir, **arka uç çıktıya koymaz**), `veri_paketi()`.
- Doğrulama: `temizle()` panelin beyaz listesidir; `tarih()`, `saat()`, `metin()` aynı Türkçe mesajları verir.
- Kitaplık oturum ya da jeton denetimi yapmaz. Çağıran taraf (panel: oturum; MCP: Bearer jeton + kapsam) yetkiyi **önce** denetler.
- Dışarıdan açılamaz: `v1/.htaccess` `FilesMatch` ile reddeder; ayrıca `STUDIO_ORTAK` tanımlanmadan çağrılırsa hiçbir şey yapmadan 403 ile çıkar.

## Panel entegrasyonu (Ayarlar → "Sohbet bağlantıları")

Depo işlevleri `mcp-kitaplik/depo.php`'dedir:

| İşlev | Ne yapar |
|---|---|
| `mcp_baglantilar()` | Bağlantıları listeler: istemci, kapsam, oluşturma, son kullanım, durum. Jeton dönmez |
| `mcp_baglanti_kes($izinId)` | Tek bir bağlantıyı keser |
| `mcp_kayit_sayaci_sifirla()` | İstemci kaydının günlük genel sayacını (günde 50) sıfırlar; IP başına sınıra dokunmaz |
| `mcp_tumunu_kes()` | Bütün bağlantıları keser |
| `mcp_gunluk_son(100)` | İşlem günlüğünün son kayıtlarını döndürür |

Panelden kullanmak için: `define('SUFLO_MCP', 1); require '<public_html>/studio/mcp-kitaplik/yukle.php'; mcp_baslat('<public_html>/studio');`. Bu çağrılar panelin oturum denetiminden **sonra** yapılmalıdır.

## Testler

```text
node tests/test-studio-mcp.js          # 1) php -S + .htaccess taklidi + sahte arka uç: tam OAuth akışı, iki MCP dönemi, araçlar, olumsuz durumlar
                                       # 2) GERÇEK arka uç + geçici Studio veritabanı + panel API: uçtan uca sohbet senaryosu (sonuç panelden okunur),
                                       #    yetkisiz erişim, yanlış veri, belirsiz müşteri, mükerrer (paralel dahil), çakışma, sürüm, toplu + panelden geri yükleme, ücret yok
node tests/test-studio-mcp-apache.js   # gerçek Apache + mod_php (MultiViews açık, Options yalnız Indexes): .htaccess kuralları, https yönlendirmesi, Authorization geçişi, acme-challenge, kapalı kitaplık, kapalı v1/studio-ortak.php; studio-test gerçek arka uçla
node tests/test-studio-ortak.js        # ortak veri kitaplığı panelsiz: kayıt, sürüm, mükerrer, otomatik kopya, şifre kilidi, doğrudan erişim
```

- `php` (ya da `pdo_sqlite`) yoksa iki test de ATLA der. Apache ya da `mod_php` yoksa Apache testi ATLA der.
- `tests/fixtures/studio-mcp/yonlendirici.php`, `studio.htaccess` ve `well-known.htaccess` kurallarını `php -S` için taklit eder.
- Dağıtım tablosu `tests/_studio-mcp-ortak.js` içindeki `DAGITIM` listesiyle aynıdır; testler kurulumu oradan yapar.

## Açık konular

- **Panelin test kurulumu:** panel (`../index.php`) ayar yolunu `private/studio-v1` olarak sabit yazar. `public_html/studio-test/v1/` kurulursa panel canlı veriyi kullanır. MCP (gerçek arka uç dahil) klasör adından türetir: `studio-test` için `private/studio-test-v1/config.php` ve oradaki `dsn` kullanılır. Test kurulumunda bu `dsn` mutlaka ayrı bir veritabanı olmalı (canlı ayar dosyası kopyalanırsa sohbet canlı veriye yazar).
- **Belirsiz saat ifadeleri:** sunucu yalnız `YYYY-AA-GG` ve `SS:DD` kabul eder; "öğleden sonra" gibi ifadeleri sohbet modeli sormalıdır (araç açıklamaları ve talimat bunu söyler). Model yine de bir saat uydurursa sunucu bunu ayırt edemez.
- **ChatGPT `connector/oauth/{callback_id}`:** önek varsayılan olarak izinlidir. Daha dar tutmak için yönetim sayfasında görünen tam adres `mcp_redirect_izinli`'ye yazılabilir.
- **Kayıt kotası:** günlük 50'lik genel kota çok IP'li biri tarafından geçerli kayıtlarla doldurulabilir (yukarıda "Kalan risk"). Ayarlar ekranına "kayıt sayacını sıfırla" düğmesi eklenmeli (`mcp_kayit_sayaci_sifirla()`).
