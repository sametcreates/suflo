# Suflo Studio uzak MCP sunucusu (sohbet bağlantısı)

claude.ai ve ChatGPT sohbetleri Studio'ya bu sunucu üzerinden bağlanır. İsteği sohbetin kendi modeli yorumlar. Sunucu yalnız doğrulanmış işlemleri yapar. Ek yapay zekâ, API anahtarı ya da ücretli servis yoktur; yalnız PHP 8.3 ve `pdo_sqlite` kullanılır.

Bu klasör şu parçaları içerir:

- OAuth 2.1 yetkilendirme sunucusu.
- Keşif belgeleri.
- MCP taşıma katmanı (Streamable HTTP; yalnız POST ve JSON, SSE yok).
- Ayrı bir SQLite deposu.
- Araç kaydı.

Studio kayıtlarına dokunan araç işleyicileri **arka uç arayüzünün** arkasındadır (aşağıda). Gerçek arka uç henüz bağlanmadı: `mcp-kitaplik/arka-studio.php` bilerek "kurulmadı" der. Bu sürüm canlıya yüklense bile hiçbir şifre kabul edilmez ve hiçbir bağlantı açılmaz.

Tasarımın kaynağı `mcp-tasarim.md` (v1) belgesidir. Panel (`../index.php`), Studio şeması ve `pro` dosyaları değişmedi.

## Dağıtım

| Repo (`server/studio-v1/mcp/`) | Sunucu (`public_html/` altında) | Not |
|---|---|---|
| `mcp.php` | `studio/mcp.php` | MCP uç noktası. Adres `https://assets.suflo.app/studio/mcp` |
| `oauth.php` | `studio/oauth.php` | `/studio/oauth/{authorize,token,register,revoke}` |
| `kesif.php` | `studio/kesif.php` | PRM ve AS / OIDC metadata |
| `mcp-onay.js`, `mcp-onay.css` | `studio/mcp-onay.js`, `studio/mcp-onay.css` | Onay sayfasının betiği ve stili |
| `mcp-kitaplik/` (`.htaccess` dahil) | `studio/mcp-kitaplik/` | Kitaplık. Dışarıya kapalı (403) |
| `studio.htaccess` | `studio/.htaccess` | `../arayuz.htaccess`'in **bütün kuralları** ve MCP kuralları. arayuz.htaccess'in yerine yüklenir |
| `well-known.htaccess` | `.well-known/.htaccess` | **Yeni dosya.** Yalnız tam keşif adlarını eşler; `acme-challenge`'a dokunmaz |

Test kurulumunda aynı dosyalar `public_html/studio-test/` altına konur. Ayar ve veri yolu uygulama klasörünün adından çıkar; panelle aynı kural geçerlidir: `dirname(DOCUMENT_ROOT)/private/<klasör>-v1/`.

- `studio` → `private/studio-v1/config.php` (canlıdaki bugünkü yol, değişmedi)
- `studio-test` → `private/studio-test-v1/config.php`

Depo ilk istekte kendiliğinden kurulur: `private/<klasör>-v1/mcp.sqlite` (ayrı dosya, kendi şema sürümü, kurulum kilidi altında). `config.php`'ye yeni ayar eklemek **gerekmez**; varsayılanlar koddadır.

Keşif adresleri (hepsi `kesif.php`'den gelir; `issuer` her belgede bayt bayt aynı):

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
| `mcp_arka` | `mcp-kitaplik/arka-studio.php` | Arka uç dosyası (testler sahte arka uç verir) |
| `cookie_secure` | `true` | Panelle ortak. Onay çerezi `__Host-` önekli olur |

### Geri dönüş

Üç yol var:

- `config.php`'de `'mcp_acik' => false` yaz.
- Ya da `studio/.htaccess`'teki "Suflo Studio MCP" bölümünü sil (ya da `arayuz.htaccess`'i geri koy) ve `mcp.php`, `oauth.php`, `kesif.php` dosyalarını ve `.well-known/.htaccess`'teki üç satırı kaldır.
- `mcp.sqlite` silinebilir; bütün bağlantılar biter.

Panel ve Studio verisi bunlardan etkilenmez.

## Güvenlik özeti

- **İstemci kaydı (DCR, RFC 7591):**
  - Dönüş adresi yalnız izin listesinden olabilir: https; http yalnız 127.0.0.1 / localhost; `#`, `/../` ve kullanıcı bilgisi yasak.
  - Hız sınırı: aynı IP'den saatte 10 kayıt, toplam günde 50 kayıt.
  - Her kayıt yeni bir istemci açar; var olan istemci asla değişmez. Hiç bağlanmamış istemciler 30 gün sonra silinir; bağlanmış istemci silinmez.
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

Dosya: `mcp-kitaplik/arka.php`. Arka uç, iki arayüzü birden uygulayan **bir nesne döndüren** bir PHP dosyasıdır (`return new class ... implements McpSahipDogrulayici, McpStudioArka { ... };`). Dosyanın kapsamında iki değişken vardır: `$C` (config dizisi) ve `$ozel` (`private/<klasör>-v1`). Bu dosya `mcp-kitaplik/arka-studio.php`'nin yerine yazılır; istenirse config'te `mcp_arka` ile başka bir dosya gösterilir. Örnek uygulama: `tests/fixtures/studio-mcp/arka-sahte.php` (yalnız test için).

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
- Bugünkü `sifre_dene()` kilitte `hata(429)` ile **çıkar** ve `index.php` üst düzey kod çalıştırır. Bu yüzden panel kodu, durum döndüren bir kitaplık işlevine ayrılmalıdır. Davranışı ve sınırları değişmemelidir.

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
| Çakışma | `cakismayi_onayla !== true` ise YAZMAZ; `durum = 'cakisma'` ve `cakisanlar` döner |
| Mükerrer (tekil yazmalar) | Kayıt kimliği `$b->kayit_kimligi($girdi['istek_anahtari'])` olmalı: `sha256('mcp|'.grant.'|'.anahtar)` ilk 24 hex. Aynı anahtar → aynı kayıt (`durum = 'zaten_vardi'`). Anlamsal mükerrer de denetlenir (aynı müşteri, aynı başlangıç, benzer başlık; müşteride aynı ad ve kurum) |
| Güncelleme | Panelin `WHERE surum = ?` mekanizması kullanılır. Uyuşmazlıkta yazılmaz; `durum = 'surum_uyusmadi'` ve güncel kayıt döner |
| `studio_icerik_olustur` ve `adet > 1` | YAZMAZ. `$b->toplu_onizle($islemler)` çağrılır; dönen önizleme ve `onay_kodu` ile `durum = 'onay_gerekli'` döndürülür |
| Geçmiş satırı | MCP ile oluşan içeriklerin geçmişine "Sohbetten eklendi (`$b->istemci_adi`)" yazılır |
| Ücret | Hiçbir çıktıda dönmez |
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

1. Önce anlık kopyayı al: `anlik_al('mcp_toplu_oncesi')`.
2. Sonra **tek işlemde** hepsini ya da hiçbirini uygula.
3. Kayıt kimliklerini `$toplu_anahtar`'dan türet, ör. `substr(sha256($toplu_anahtar.'|'.$sira), 0, 24)`. Yarıda kesilen bir uygulama yeniden denenebilir; böylece mükerrer açılmaz.

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
| `studio_musteri_olustur`, `studio_cekim_olustur`, `studio_icerik_olustur` | studio.yaz | destructive=false, idempotent=true |
| `studio_icerik_durum_guncelle`, `studio_cekim_durum_guncelle` | studio.yaz | destructive=true, idempotent=true |
| `studio_toplu_onizle` | studio.yaz | readOnly (yalnız önizler ve kod verir) |
| `studio_toplu_uygula` | studio.yaz | destructive=true, idempotent=true |

## Panel entegrasyonu (Ayarlar → "Sohbet bağlantıları")

Depo işlevleri `mcp-kitaplik/depo.php`'dedir:

| İşlev | Ne yapar |
|---|---|
| `mcp_baglantilar()` | Bağlantıları listeler: istemci, kapsam, oluşturma, son kullanım, durum. Jeton dönmez |
| `mcp_baglanti_kes($izinId)` | Tek bir bağlantıyı keser |
| `mcp_tumunu_kes()` | Bütün bağlantıları keser |
| `mcp_gunluk_son(100)` | İşlem günlüğünün son kayıtlarını döndürür |

Panelden kullanmak için: `define('SUFLO_MCP', 1); require '<public_html>/studio/mcp-kitaplik/yukle.php'; mcp_baslat('<public_html>/studio');`. Bu çağrılar panelin oturum denetiminden **sonra** yapılmalıdır.

## Testler

```text
node tests/test-studio-mcp.js          # php -S + .htaccess taklidi + sahte arka uç: tam OAuth akışı, iki MCP dönemi, araçlar, olumsuz durumlar
node tests/test-studio-mcp-apache.js   # gerçek Apache + mod_php: .htaccess kuralları, Authorization geçişi, 301 yok, acme-challenge, kapalı kitaplık
```

- `php` (ya da `pdo_sqlite`) yoksa iki test de ATLA der. Apache ya da `mod_php` yoksa Apache testi ATLA der.
- `tests/fixtures/studio-mcp/yonlendirici.php`, `studio.htaccess` ve `well-known.htaccess` kurallarını `php -S` için taklit eder.
- Dağıtım tablosu `tests/_studio-mcp-ortak.js` içindeki `DAGITIM` listesiyle aynıdır; testler kurulumu oradan yapar.

## Açık konular

- **Gerçek arka uç:** panelin `sifre_dene` / `sifre_izi` / kayıt işlevleri çağrılabilir bir kitaplığa ayrılmalı (yukarıda).
- **Panelin test kurulumu:** panel (`../index.php`) ayar yolunu `private/studio-v1` olarak sabit yazar. `public_html/studio-test/v1/` kurulursa canlı veriyi kullanır. MCP klasör adından türetir; panelde de aynı türetme gerekir.
- **ChatGPT `connector/oauth/{callback_id}`:** önek varsayılan olarak izinlidir. Daha dar tutmak için yönetim sayfasında görünen tam adres `mcp_redirect_izinli`'ye yazılabilir.
- **Eşzamanlı yenileme:** aynı refresh token iki istekle aynı anda gelirse tasarım gereği grant iptal olur (tekrar algılama). Gerçek istemcilerde görülürse kısa bir tolerans penceresi düşünülebilir.
