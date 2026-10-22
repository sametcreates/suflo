<?php
declare(strict_types=1);

/*
 * Suflo Studio ortak veri kitapligi (panel API'si index.php ve sohbet baglantisi / MCP arka ucu birlikte kullanir).
 *
 * - Yalniz veri mantigi: ayar yukleme, veritabani ve sema, islem (SQLite BEGIN IMMEDIATE / MySQL FOR UPDATE),
 *   alan dogrulama (temizle), kayit yazma (istemci kimligiyle tekrarlanabilir olusturma + "WHERE surum = ?"),
 *   kayit okuma, anlik kopya ve gunluk kopya, sifre denemesi (hatali giris kilidi) ve sifre izi.
 * - HTTP yaniti, CORS, oturum cerezi yazma ve panel islemleri index.php'dedir; bu dosya oturum denetimi YAPMAZ.
 *   Cagiran taraf (panel: oturum; MCP: Bearer jeton + kapsam) kendi yetki denetimini bu islevlerden ONCE yapar.
 * - Kurulum / veritabani / kilit hatalari studio_dur() ile bildirilir: panel kendi yanitlayicisini kaydeder (yanit verip
 *   cikar, davranis eskisiyle ayni); kaydedilmemisse StudioHatasi firlatilir (kitaplik olarak kullanimda surec cikmaz).
 * - Dogrudan HTTP ile acilamaz: v1/.htaccess FilesMatch ile reddeder; ayrica STUDIO_ORTAK sabiti tanimlanmadan
 *   yuklenirse hicbir sey yapmadan 403 ile cikar.
 */

if (!defined('STUDIO_ORTAK')) {
    http_response_code(403);
    exit;
}

const STUDIO_SURUM = 1;
const SEMA_SURUM = '3';
const STUDIO_TABLOLARI = ['kayitlar', 'oturumlar', 'cihazlar', 'girisler', 'ayar', 'anliklar', 'sayac'];
const CIHAZ_BOSTA = 180 * 24 * 3600;        // bu kadar kullanilmayan taninan cihaz unutulur
const TURLER = ['musteri', 'icerik', 'etkinlik', 'blok', 'ozelgun', 'ayar'];
const BLOK_ICERIK_SINIRI = 50;              // bir calisma blogunda en cok bu kadar icerik
const ANLIK_SINIRI = 30;                    // ice aktarma / geri yukleme oncesi kopyalardan en cok bu kadar
const GUNLUK_ANLIK_SINIRI = 14;             // gunluk kopyalardan en cok bu kadar (digerlerinden ayri sayilir)
// Kullaniciya gorunen ortak mesaj (hata kodlari degismez; arayuz koda gore davranir)
const MESGUL_MESAJI = 'Sunucu meşgul; birkaç saniye sonra yeniden dene.';

/** Kurulum / veritabani / kilit hatasi: $http (503, 429 ...), $kod (kurulum, veritabani, mesgul, kilit), kullaniciya gorunen mesaj. */
final class StudioHatasi extends RuntimeException {
    public int $http;
    public string $kod;
    public function __construct(int $http, string $kod, string $mesaj) {
        parent::__construct($mesaj);
        $this->http = $http;
        $this->kod = $kod;
    }
}
/** Hata yanitlayicisini kaydeder (panel: yanit verip cikan hata()). null: kaldirir (StudioHatasi firlatilir). */
function studio_dur_ayarla(?callable $f): void { $GLOBALS['__studio_dur'] = $f; }
/** Islemi durdurur: kayitli yanitlayici varsa onu cagirir (panel orada cikar); yoksa ya da donerse StudioHatasi firlatir. */
function studio_dur(int $http, string $kod, string $mesaj): void {
    $f = $GLOBALS['__studio_dur'] ?? null;
    if (is_callable($f)) $f($http, $kod, $mesaj);
    throw new StudioHatasi($http, $kod, $mesaj);
}

/* ---------------- Ayarlar ---------------- */

/** Ayar dizisine varsayilanlari ekler ve kitapligin etkin ayari yapar ($GLOBALS['C']). */
function studio_ayar_kullan(array $C): array {
    $C += [
        'password_hash' => '', 'dsn' => '', 'db_user' => '', 'db_pass' => '',
        'allowed_origins' => [], 'session_idle' => 14 * 24 * 3600, 'session_max' => 60 * 24 * 3600,
        'login_max_fail' => 8, 'login_window' => 900, 'cookie_secure' => true,
    ];
    $GLOBALS['C'] = $C;
    return $C;
}
/** private/<klasor>-v1/config.php dosyasini okur. Hata: StudioHatasi (503, kurulum; mesajda gizli bilgi ya da yol yok). */
function studio_ayar_yukle(string $yol): array {
    if (!is_file($yol)) throw new StudioHatasi(503, 'kurulum', 'Sunucu ayar dosyası bulunamadı.');
    try {
        $C = (static function (string $y) { return require $y; })($yol);
    } catch (Throwable $e) {
        throw new StudioHatasi(503, 'kurulum', 'Sunucu ayar dosyası okunamadı.');
    }
    if (!is_array($C)) throw new StudioHatasi(503, 'kurulum', 'Sunucu ayar dosyası okunamadı.');
    return studio_ayar_kullan($C);
}

/* ---------------- Veritabani ---------------- */

function db(): PDO {
    static $pdo = null;
    global $C;
    if ($pdo) return $pdo;
    if ((string)$C['dsn'] === '') studio_dur(503, 'kurulum', 'Veritabanı ayarı (dsn) boş.');
    try {
        $pdo = new PDO((string)$C['dsn'], (string)$C['db_user'], (string)$C['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (Throwable $e) {
        studio_dur(503, 'veritabani', 'Veritabanına bağlanılamadı.');
    }
    if (mysql()) {
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_bin");
    } else {
        $pdo->exec('PRAGMA busy_timeout=8000');
        $pdo->exec('PRAGMA journal_mode=WAL');
    }
    sema_kur($pdo);
    return $pdo;
}
function mysql(): bool {
    static $m = null;
    if ($m === null) $m = db_surucu() === 'mysql';
    return $m;
}
function db_surucu(): string {
    global $C;
    return strtolower((string)strtok((string)$C['dsn'], ':'));
}

/** ayar.sema degeri; tablo ya da satir yoksa null. */
function sema_degeri(PDO $p): ?string {
    try {
        $s = $p->query("SELECT deger FROM ayar WHERE anahtar = 'sema'");
        $r = $s->fetch();
        $s->closeCursor();
        return $r ? (string)$r['deger'] : null;
    } catch (Throwable $e) {
        return null;
    }
}
/** Tablo var mi (kolonlarina bakilmaz). Mesgul hatasi yukari iletilir. */
function tablo_var(PDO $p, string $t): bool {
    try {
        $s = $p->query("SELECT 1 FROM $t LIMIT 0");
        $s->closeCursor();
        return true;
    } catch (Throwable $e) {
        if (mesgul_mu($e)) throw $e;
        return false;
    }
}
/**
 * Tablolari bir kez kurar (ayar.sema surumu tutulur; her istekte DDL calismaz). Ayni anda gelen ilk istekler
 * kurulum kilidinde bekler (SQLite: BEGIN IMMEDIATE, MySQL: GET_LOCK).
 * Kurulum once ayar tablosuna "kuruluyor-<surum>" isareti yazar, tablolar bitince isareti surumle degistirir.
 * Yalniz bu isaretli yarim kurulum kaldigi yerden tamamlanir (MySQL'de DDL kendiliginden onaylanir). Isaret yokken
 * Studio tablolarindan biri zaten varsa (eski gelistirme surumu ya da ayni veritabanini kullanan baska bir uygulama)
 * ya da sema baska bir surumse uzerine sessizce kurulmaz; acik bir kurulum hatasi doner.
 */
function sema_kur(PDO $p): void {
    if (sema_degeri($p) === SEMA_SURUM) return;
    $isaret = 'kuruluyor-' . SEMA_SURUM;
    $my = mysql();
    $metin = $my ? 'LONGTEXT' : 'TEXT';
    $son = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin' : '';
    $kilitli = false;
    try {
        if ($my) {
            $s = $p->query("SELECT GET_LOCK('suflo_studio_sema', 20) AS k");
            $k = $s->fetch();
            $s->closeCursor();
            if (!$k || (int)$k['k'] !== 1) throw new RuntimeException('kilit');
        } else {
            $p->exec('BEGIN IMMEDIATE');
        }
        $kilitli = true;
        $sema = sema_degeri($p);
        if ($sema !== SEMA_SURUM) {
            if ($sema === null) {
                // Kurulum izi yok: yalniz hic Studio tablosu yoksa (ya da yalniz bos bir ayar tablosu varsa; MySQL'de
                // ayar tablosu kurulup isaret yazilmadan kesilmis olabilir) yeni kurulum yapilir
                foreach (STUDIO_TABLOLARI as $t) if ($t !== 'ayar' && tablo_var($p, $t)) throw new RuntimeException('eski_sema');
                if (tablo_var($p, 'ayar')) {
                    $s = $p->query('SELECT COUNT(*) AS c FROM ayar');
                    $c = $s->fetch();
                    $s->closeCursor();
                    if ((int)$c['c'] > 0) throw new RuntimeException('eski_sema');
                }
            } elseif ($sema !== $isaret) {
                throw new RuntimeException('eski_sema');
            }
            $p->exec("CREATE TABLE IF NOT EXISTS ayar (anahtar VARCHAR(64) NOT NULL PRIMARY KEY, deger $metin NOT NULL)$son");
            if ($sema === null) $p->exec("INSERT INTO ayar (anahtar, deger) VALUES ('sema', '$isaret')");
            $p->exec("CREATE TABLE IF NOT EXISTS kayitlar (id VARCHAR(40) NOT NULL PRIMARY KEY, tur VARCHAR(10) NOT NULL, anahtar CHAR(64) NULL, veri $metin NOT NULL, surum BIGINT NOT NULL, olusturma BIGINT NOT NULL, guncelleme BIGINT NOT NULL, UNIQUE (tur, anahtar))$son");
            $p->exec("CREATE TABLE IF NOT EXISTS oturumlar (ozet CHAR(64) NOT NULL PRIMARY KEY, olusturma BIGINT NOT NULL, son BIGINT NOT NULL)$son");
            $p->exec("CREATE TABLE IF NOT EXISTS cihazlar (ozet CHAR(64) NOT NULL PRIMARY KEY, olusturma BIGINT NOT NULL, son BIGINT NOT NULL)$son");
            $p->exec("CREATE TABLE IF NOT EXISTS girisler (kim CHAR(24) NOT NULL PRIMARY KEY, ip CHAR(64) NOT NULL, cihaz CHAR(64) NULL, zaman BIGINT NOT NULL" . ($my ? ', INDEX giris_zaman (zaman)' : '') . ")$son");
            if (!$my) $p->exec('CREATE INDEX IF NOT EXISTS giris_zaman ON girisler (zaman)');
            $p->exec("CREATE TABLE IF NOT EXISTS anliklar (id VARCHAR(40) NOT NULL PRIMARY KEY, sira BIGINT NOT NULL, zaman BIGINT NOT NULL, neden VARCHAR(40) NOT NULL, ozet VARCHAR(255) NOT NULL, veri $metin NOT NULL)$son");
            $p->exec("CREATE TABLE IF NOT EXISTS sayac (ad VARCHAR(32) NOT NULL PRIMARY KEY, deger BIGINT NOT NULL)$son");
            $p->exec("DELETE FROM sayac WHERE ad = 'surum'");
            $p->exec("INSERT INTO sayac (ad, deger) VALUES ('surum', 0)");
            $p->exec("UPDATE ayar SET deger = '" . SEMA_SURUM . "' WHERE anahtar = 'sema'");
        }
        if ($my) { $s = $p->query("SELECT RELEASE_LOCK('suflo_studio_sema')"); $s->closeCursor(); }
        else $p->exec('COMMIT');
    } catch (Throwable $e) {
        try {
            if ($kilitli && $my) { $s = $p->query("SELECT RELEASE_LOCK('suflo_studio_sema')"); $s->closeCursor(); }
            elseif ($kilitli) $p->exec('ROLLBACK');
        } catch (Throwable $e2) {}
        if ($e->getMessage() === 'kilit' || mesgul_mu($e)) studio_dur(503, 'mesgul', MESGUL_MESAJI);
        if ($e->getMessage() === 'eski_sema') {
            studio_dur(503, 'kurulum', 'Veritabanı uyumsuz: Studio tablolarıyla aynı adlı tablolar var (eski bir Studio denemesi ya da aynı veritabanını kullanan başka bir uygulama). Studio için ayrı, boş bir veritabanı kullan; başka uygulamanın tablolarını silme.');
        }
        studio_dur(503, 'kurulum', 'Veritabanı tabloları oluşturulamadı.');
    }
}

/** Tek satir okur ve imleci kapatir (SQLite'ta acik okuma kilidi kalmasin). */
function tek(string $sql, array $par = []): ?array {
    $s = db()->prepare($sql);
    $s->execute($par);
    $r = $s->fetch();
    $s->closeCursor();
    return $r ?: null;
}
function hepsi(string $sql, array $par = []): array {
    $s = db()->prepare($sql);
    $s->execute($par);
    $r = $s->fetchAll();
    $s->closeCursor();
    return $r;
}
/** Yazma sorgusu; etkilenen satir sayisini doner. */
function calistir(string $sql, array $par = []): int {
    $s = db()->prepare($sql);
    $s->execute($par);
    $n = $s->rowCount();
    $s->closeCursor();
    return $n;
}
/** Islem: yazma kilidi bastan alinir (SQLite BEGIN IMMEDIATE, MySQL sayac satirinda FOR UPDATE), hata olursa geri alinir. */
function islem(callable $f) {
    $p = db();
    if (mysql()) {
        $p->beginTransaction();
        // BEGIN IMMEDIATE karsiligi: yazma kilidi her okumadan once alinir (REPEATABLE READ goruntusu kilitten sonra olusur)
        tek("SELECT deger FROM sayac WHERE ad = 'surum' FOR UPDATE");
    } else {
        $p->exec('BEGIN IMMEDIATE');
    }
    try {
        $r = $f();
        if (mysql()) $p->commit(); else $p->exec('COMMIT');
        return $r;
    } catch (Throwable $e) {
        try { if (mysql()) { if ($p->inTransaction()) $p->rollBack(); } else $p->exec('ROLLBACK'); } catch (Throwable $e2) {}
        throw $e;
    }
}
/** Hic tekrarlanmayan, hep artan surum numarasi (islem icinde cagrilir). */
function yeni_surum(): int {
    calistir("UPDATE sayac SET deger = deger + 1 WHERE ad = 'surum'");
    return (int)tek("SELECT deger FROM sayac WHERE ad = 'surum'")['deger'];
}

function ayar_oku(string $k): ?string {
    $r = tek('SELECT deger FROM ayar WHERE anahtar = ?', [$k]);
    return $r ? (string)$r['deger'] : null;
}
function ayar_yaz(string $k, string $v): void {
    calistir('DELETE FROM ayar WHERE anahtar = ?', [$k]);
    calistir('INSERT INTO ayar (anahtar, deger) VALUES (?, ?)', [$k, $v]);
}
function yeni_id(): string { return bin2hex(random_bytes(12)); }
function simdi(): int { return time(); }
/** IP ozeti. IPv6'da /64 onek kullanilir (tek kisinin cok sayida adresi olabilir). Ham IP saklanmaz. */
function ip_ozet(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $b = @inet_pton($ip);
    if ($b !== false && strlen($b) === 16 && substr($b, 0, 12) !== str_repeat("\0", 10) . "\xff\xff") {
        $ip = bin2hex(substr($b, 0, 8)) . '::/64';
    }
    return hash('sha256', 'studio|' . $ip);
}

/** Cerez adi: guvenli kipte __Host- onekli (yalniz bu alan adi, Path=/, Secure; kardes alan adi yazamaz). */
function cerez_adi(string $tur): string {
    global $C;
    $ad = $tur === 'cihaz' ? 'suflo_studio_cihaz' : 'suflo_studio';
    return $C['cookie_secure'] ? '__Host-' . $ad : $ad;
}

function cerez_oku(string $tur): string {
    $t = $_COOKIE[cerez_adi($tur)] ?? '';
    if (!is_string($t)) return '';
    return preg_match('/^[A-Za-z0-9_-]{40,64}$/', $t) ? $t : '';
}
function rastgele_anahtar(): string { return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='); }

/** Taninan cihaz: daha once dogru sifreyle girilmis cihaz. Yalniz hatali giris kilidini asmaya yarar, erisim vermez.
 *  Sifre degisince ve "tum oturumlari kapat"ta hepsi unutulur; 180 gun kullanilmayan cihaz da unutulur. */
function cihaz_ozeti(): ?string {
    $t = cerez_oku('cihaz');
    if ($t === '') return null;
    $oz = hash('sha256', $t);
    return tek('SELECT 1 AS v FROM cihazlar WHERE ozet = ? AND son >= ?', [$oz, simdi() - CIHAZ_BOSTA]) ? $oz : null;
}

function cihazlari_unut(): void { calistir('DELETE FROM cihazlar'); }
/** Gecerli sifre ozeti. Panelden degistirilen sifre veritabaninda durur; ama config.php'deki ozet
 *  o degisiklikten sonra elle degistirildiyse (sifre unutuldu) config.php'deki gecerli olur. */
function sifre_ozeti(): string {
    global $C;
    $cfg = (string)$C['password_hash'];
    $db = ayar_oku('password_hash');
    if ($db !== null && $db !== '' && ayar_oku('password_hash_kaynak') === hash('sha256', $cfg)) return $db;
    return $cfg;
}
/**
 * Sifre denemesi (giris, sifre degistirme ve sohbet baglantisi onayi). Deneme sifre denetiminden ONCE kaydedilir; sonra
 * sayilir (paralel denemeler siniri asamaz). Taninan cihaz yalniz kendi sayacina tabidir; digerleri IP basina ve toplam
 * sinira. Dogruysa ya da kilide takildiysa deneme kaydi silinir (yalniz yanlis sifre denemeleri sayilir).
 * Doner: ['durum' => 'dogru' | 'yanlis' | 'kilitli', 'ozet' => dogruysa denetlenen sifre ozeti, degilse null]. Cikmaz.
 */
function sifre_dene_durum(string $sifre, ?string $cihaz): array {
    global $C;
    $n = simdi();
    $pencere = $n - (int)$C['login_window'];
    $max = max(1, (int)$C['login_max_fail']);
    $kim = yeni_id();
    calistir('DELETE FROM girisler WHERE zaman < ?', [$n - 86400]);
    calistir('INSERT INTO girisler (kim, ip, cihaz, zaman) VALUES (?, ?, ?, ?)', [$kim, ip_ozet(), $cihaz, $n]);
    if ($cihaz !== null) {
        $kilit = (int)tek('SELECT COUNT(*) AS c FROM girisler WHERE cihaz = ? AND zaman >= ?', [$cihaz, $pencere])['c'] > $max;
    } else {
        $kilit = (int)tek('SELECT COUNT(*) AS c FROM girisler WHERE cihaz IS NULL AND ip = ? AND zaman >= ?', [ip_ozet(), $pencere])['c'] > $max
            || (int)tek('SELECT COUNT(*) AS c FROM girisler WHERE cihaz IS NULL AND zaman >= ?', [$pencere])['c'] > 3 * $max;
    }
    if ($kilit) {
        // kilide takilan deneme sayilmaz (yalniz sifresi denenenler sayilir): tek bir saldirgan kilidi sonsuza uzatamaz
        calistir('DELETE FROM girisler WHERE kim = ?', [$kim]);
        return ['durum' => 'kilitli', 'ozet' => null];
    }
    $ozet = sifre_ozeti();
    $dogru = $ozet !== '' && strlen($sifre) <= 1024 && password_verify($sifre, $ozet);
    if ($dogru) { calistir('DELETE FROM girisler WHERE kim = ?', [$kim]); return ['durum' => 'dogru', 'ozet' => $ozet]; }
    usleep(400000);
    return ['durum' => 'yanlis', 'ozet' => null];
}
/** Panelin sifre denemesi: dogruysa denetlenen sifre ozeti, yanlissa null; kilitliyse studio_dur(429) (panelde 429 ile cikar). */
function sifre_dene(string $sifre, ?string $cihaz): ?string {
    $d = sifre_dene_durum($sifre, $cihaz);
    if ($d['durum'] === 'kilitli') studio_dur(429, 'kilit', 'Çok fazla hatalı deneme. Biraz sonra yeniden dene.');
    return $d['ozet'];
}
/** Etkin sifre ozetinin parmak izi (veritabaninda saklanir; ozetin kendisi degil). */
function sifre_izi(string $ozet): string { return hash('sha256', 'iz|' . $ozet); }
/**
 * config.php'deki sifre ozeti elle degistirilirse (sifre unutuldu / sifre ele gecirildi) butun oturumlar ve
 * taninan cihazlar sonlanir: etkin ozetin parmak izi saklanir, degisirse temizlenir. Hatali giris kayitlari da
 * silinir: sahibinin sifreyi hatirlamaya calisirken biriktirdigi denemeler sifirlamadan sonra onu kilitlemesin.
 */
function sifre_izi_denetle(): void {
    if (ayar_oku('sifre_izi') === sifre_izi(sifre_ozeti())) return;   // hizli yol (kilitsiz)
    islem(function () {
        // Yazma kilidi altinda yeniden hesaplanir: kilitsiz okunan ozet, o arada tamamlanan bir sifre degisikliginden
        // once kalmis olabilir; eski parmak iziyle temizlik yapilirsa sahibinin yeni oturumu ve cihazi silinirdi
        $iz = sifre_izi(sifre_ozeti());
        $eski = ayar_oku('sifre_izi');
        if ($eski === $iz) return;
        if ($eski !== null) { calistir('DELETE FROM oturumlar'); cihazlari_unut(); calistir('DELETE FROM girisler'); }
        ayar_yaz('sifre_izi', $iz);
    });
}

/**
 * Sohbet baglantisi (MCP) onayi icin sahibin sifresi: panelin kilidinden (sifre_dene_durum, ayni girisler tablosu, ayni
 * sinirlar, taninan cihaz cerezi) gecer. Sifre hic ayarlanmamissa deneme sayilmaz: 'kurulmadi'.
 * Doner: ['durum' => 'dogru' | 'yanlis' | 'kilitli' | 'kurulmadi', 'iz' => yalniz 'dogru'da sifre_izi(dogrulanan ozet)].
 */
function sahip_sifre_dene(string $sifre): array {
    if (sifre_ozeti() === '') return ['durum' => 'kurulmadi', 'iz' => null];
    $d = sifre_dene_durum($sifre, cihaz_ozeti());
    return ['durum' => $d['durum'], 'iz' => $d['ozet'] !== null ? sifre_izi($d['ozet']) : null];
}
/** Etkin sifre ozetinin parmak izi; sifre ayarlanmamissa null. Veritabani hatasi (mesgul dahil) istisna olarak yukari gider. */
function sahip_sifre_izi(): ?string {
    $o = sifre_ozeti();
    return $o === '' ? null : sifre_izi($o);
}

/* ---------------- Dogrulama ---------------- */

function norm(string $s): string {
    if (class_exists('Normalizer')) $s = (string)(Normalizer::normalize($s, Normalizer::FORM_C) ?: $s);
    $s = (string)preg_replace('/[\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u', '', $s);
    $s = str_replace(['I', 'İ'], ['ı', 'i'], trim($s));
    $s = mb_strtolower($s, 'UTF-8');
    return preg_replace('/\s+/u', ' ', $s) ?? $s;
}
/** Hata mesajlarinda alan adi yerine arayuzdeki etiket (bilinmeyen alan oldugu gibi kalir). */
const ALAN_AD = [
    'ad' => 'Ad', 'kurum' => 'Kurum', 'ucret' => 'Aylık ücret', 'not' => 'Not', 'id' => 'Kayıt kimliği', 'tur' => 'Tür',
    'siklik' => 'Yayın sıklığı', 'siklik.tur' => 'Yayın sıklığı', 'siklik.haftalikAdet' => 'Haftada kaç paylaşım', 'siklik.gunler' => 'Yayın günleri',
    'siklik.gunTurleri' => 'Güne özel paylaşım türü', 'siklik.baslangic' => 'Başlangıç / sıradaki yayın tarihi',
    'slotTuru' => 'Beklenen paylaşım türü', 'slotIstisna' => 'Tek güne özel paylaşım türü', 'slotIstisna tarihi' => 'Tek güne özel paylaşım tarihi',
    'stokUyari' => 'Stok uyarı eşiği', 'varsayilanStokUyari' => 'Varsayılan stok eşiği', 'sonYedek' => 'Son yedek tarihi',
    'baslik' => 'Başlık', 'durum' => 'Durum', 'oncelik' => 'Öncelik', 'teslimTarihi' => 'Kurgu teslim tarihi',
    'planTarihi' => 'Planlanan yayın tarihi', 'yayinTarihi' => 'Yayınlandığı tarih', 'revizyonNotu' => 'Revizyon notu',
    'dosyalar' => 'Dosya bağlantıları', 'dosyalar.ham' => 'Ham görüntü bağlantısı', 'dosyalar.proje' => 'Proje dosyası bağlantısı',
    'dosyalar.final' => 'Final bağlantısı', 'gecmis.z' => 'Geçmiş satırının zamanı', 'gecmis.m' => 'Geçmiş satırı',
    'basTarih' => 'Başlangıç tarihi', 'bitTarih' => 'Bitiş tarihi', 'basSaat' => 'Başlangıç saati', 'bitSaat' => 'Bitiş saati', 'konum' => 'Konum',
    'tamamZaman' => 'Tamamlanma zamanı', 'icerikIdler' => 'Bloktaki içerikler', 'tarih' => 'Tarih', 'herYil' => 'Her yıl tekrar',
    'calismaBas' => 'Çalışma saati başlangıcı', 'calismaBit' => 'Çalışma saati bitişi', 'haftalikHedef' => 'Haftalık hedef',
];
function alan_ad(string $alan): string { return ALAN_AD[$alan] ?? $alan; }
function sayi_metni(int $n): string { return number_format($n, 0, ',', '.'); }
/** Istekteki kimlik / tur gibi skaler deger; dizi ya da nesne gelirse 422 (PHP uyarisi uretmeden). */
function skaler_metin($v, string $alan): string {
    if (is_string($v)) return $v;
    if (is_int($v)) return (string)$v;
    if ($v === null) return '';
    throw new InvalidArgumentException(alan_ad($alan) . ' geçersiz');
}
function metin($v, int $max, bool $zorunlu, string $alan): string {
    if ($v === null) $v = '';
    if (!is_string($v)) throw new InvalidArgumentException(alan_ad($alan) . ' metin olmalı');
    $v = trim(str_replace("\0", '', $v));
    if ($zorunlu && $v === '') throw new InvalidArgumentException(alan_ad($alan) . ' boş olamaz');
    if (mb_strlen($v) > $max) throw new InvalidArgumentException(alan_ad($alan) . ' çok uzun (en çok ' . sayi_metni($max) . ' karakter)');
    return $v;
}
function secim($v, array $izin, string $vars, string $alan): string {
    if ($v === null || $v === '') return $vars;
    if (!is_string($v) || !in_array($v, $izin, true)) throw new InvalidArgumentException(alan_ad($alan) . ' geçersiz');
    return $v;
}
function tarih($v, string $alan, bool $zorunlu = false): ?string {
    if ($v === null || $v === '') {
        if ($zorunlu) throw new InvalidArgumentException(alan_ad($alan) . ' gerekli');
        return null;
    }
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        throw new InvalidArgumentException(alan_ad($alan) . ' geçerli bir tarih olmalı (YYYY-AA-GG)');
    }
    return $v;
}
function saat($v, string $alan): ?string {
    if ($v === null || $v === '') return null;
    if (!is_string($v) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) throw new InvalidArgumentException(alan_ad($alan) . ' geçerli bir saat olmalı (SS:DD)');
    return $v;
}
/** Zaman damgasi 'YYYY-AA-GG SS:DD' (Istanbul saati; ornegin tamamlanma ani) ya da bossa null. */
function zaman_damgasi($v, string $alan): ?string {
    if ($v === null || $v === '') return null;
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):[0-5]\d$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        throw new InvalidArgumentException(alan_ad($alan) . ' geçerli bir zaman olmalı (YYYY-AA-GG SS:DD)');
    }
    return $v;
}
function tamsayi($v, int $min, int $max, string $alan): ?int {
    if ($v === null || $v === '') return null;
    if (is_string($v) && preg_match('/^-?\d+$/', $v)) $v = (int)$v;
    if (!is_int($v) || $v < $min || $v > $max) throw new InvalidArgumentException(alan_ad($alan) . ' ' . sayi_metni($min) . ' ile ' . sayi_metni($max) . ' arasında tam sayı olmalı');
    return $v;
}
function mantik($v): bool { return $v === true || $v === 1 || $v === '1' || $v === 'true'; }

function id_bicim($v): bool { return is_string($v) && preg_match('/^[a-z0-9]{8,40}$/', $v) === 1; }

/** Kaydi beyaz listeye gore temizler. $var: id => tur (musteri / etkinlik referanslari icin). */
/** Alan nesne olmali (ya da hic verilmemeli): yanlis bicim sessizce bos sayilmaz. */
function nesne($v, string $alan): array {
    if ($v === null) return [];
    if (!is_array($v) || ($v !== [] && array_keys($v) === range(0, count($v) - 1))) throw new InvalidArgumentException(alan_ad($alan) . ' biçimi hatalı');
    return $v;
}
/** Duz liste mi ([] ya da 0'dan sirali anahtarli dizi; JSON nesnesi degil). */
function liste_mi($v): bool { return is_array($v) && ($v === [] || array_keys($v) === range(0, count($v) - 1)); }
/**
 * $saklananBlok: guncellenen blogun sunucudaki icerik kimlikleri (yalniz blogun musterisi degismiyorsa). Eski surum
 * (blogu tanimayan index.php) bu iceriklerden birinin musterisini degistirmis olabilir: o kimlik bloktan sessizce cikar
 * (ice aktarma da boyle yapar), blok tasinip tamamlanabilir. Yeni eklenen baska musteri icerigi yine reddedilir.
 */
function temizle(string $tur, array $v, array $var, array $saklananBlok = []): array {
    if ($tur === 'musteri') {
        $s = nesne($v['siklik'] ?? null, 'siklik');
        $gunler = [];
        foreach ((array)($s['gunler'] ?? []) as $g) {
            $g = tamsayi($g, 1, 7, 'siklik.gunler');
            if ($g !== null && !in_array($g, $gunler, true)) $gunler[] = $g;
        }
        sort($gunler);
        // Haftalik duzende gune ozel beklenen tur (istege bagli): yalniz secili gunler icin
        $gunTurleri = [];
        foreach (nesne($s['gunTurleri'] ?? null, 'siklik.gunTurleri') as $g => $t) {
            $g = tamsayi(is_int($g) ? $g : (string)$g, 1, 7, 'siklik.gunTurleri');
            if ($g !== null && in_array($g, $gunler, true) && $t !== null && $t !== '') {
                $gunTurleri[(string)$g] = secim($t, ['video', 'post', 'story', 'diger'], 'video', 'siklik.gunTurleri');
            }
        }
        ksort($gunTurleri);
        // Tek tek paylasim gunlerinin beklenen turu (tarih => tur), her duzende
        $istisna = [];
        $gelenIstisna = nesne($v['slotIstisna'] ?? null, 'slotIstisna');
        if (count($gelenIstisna) > 2000) throw new InvalidArgumentException('Tek güne özel paylaşım türü listesi çok uzun');
        $dun = gmdate('Y-m-d', time() + 3 * 3600 - 86400); // Istanbul'da dunden eski gunler budanir
        foreach ($gelenIstisna as $t => $tt) {
            $t = tarih((string)$t, 'slotIstisna tarihi', true);
            if ($t < $dun) continue;
            if ($tt !== null && $tt !== '') $istisna[$t] = secim($tt, ['video', 'post', 'story', 'diger'], 'video', 'slotIstisna');
        }
        ksort($istisna);
        if (count($istisna) > 400) throw new InvalidArgumentException('Tek güne özel paylaşım türü en çok 400 gün için girilebilir');
        return [
            'ad' => metin($v['ad'] ?? null, 120, true, 'ad'),
            'kurum' => metin($v['kurum'] ?? null, 120, false, 'kurum'),
            'ucret' => tamsayi($v['ucret'] ?? null, 0, 100000000, 'ucret'),
            'siklik' => [
                'tur' => secim($s['tur'] ?? null, ['gunluk', 'uc_gun', 'haftalik', 'belirsiz'], 'belirsiz', 'siklik.tur'),
                'haftalikAdet' => tamsayi($s['haftalikAdet'] ?? null, 1, 7, 'siklik.haftalikAdet'),
                'gunler' => $gunler,
                'gunTurleri' => (object)$gunTurleri,
                'baslangic' => tarih($s['baslangic'] ?? null, 'siklik.baslangic'),
            ],
            'slotTuru' => secim($v['slotTuru'] ?? null, ['video', 'post', 'story', 'diger'], 'video', 'slotTuru'),
            'slotIstisna' => (object)$istisna,
            'stokUyari' => tamsayi($v['stokUyari'] ?? null, 0, 999, 'stokUyari'),
            'stokGirisi' => mantik($v['stokGirisi'] ?? false),
            'not' => metin($v['not'] ?? null, 5000, false, 'not'),
            'arsiv' => mantik($v['arsiv'] ?? false),
        ];
    }
    if ($tur === 'icerik') {
        $mid = $v['musteriId'] ?? null;
        if (!id_bicim($mid) || ($var[$mid] ?? '') !== 'musteri') throw new InvalidArgumentException('Müşteri bulunamadı');
        $cid = $v['cekimId'] ?? null;
        if ($cid === '' ) $cid = null;
        if ($cid !== null && (!id_bicim($cid) || ($var[$cid] ?? '') !== 'etkinlik')) throw new InvalidArgumentException('Bağlı çekim bulunamadı');
        // bagli cekim musterisiz olmali ya da ayni musteriye ait olmali
        global $ETK_MUSTERI;
        if ($cid !== null && ($ETK_MUSTERI[$cid] ?? null) !== null && $ETK_MUSTERI[$cid] !== $mid) throw new InvalidArgumentException('Seçili çekim başka bir müşteriye ait; bağlı çekimi kaldır ya da bu müşterinin bir çekimini seç');
        $d = nesne($v['dosyalar'] ?? null, 'dosyalar');
        $gecmis = [];
        foreach (array_slice(array_values((array)($v['gecmis'] ?? [])), -60) as $g) {
            if (!is_array($g)) continue;
            $gecmis[] = ['z' => metin($g['z'] ?? null, 25, true, 'gecmis.z'), 'm' => metin($g['m'] ?? null, 300, true, 'gecmis.m')];
        }
        return [
            'musteriId' => $mid,
            'baslik' => metin($v['baslik'] ?? null, 200, true, 'baslik'),
            'tur' => secim($v['tur'] ?? null, ['reels', 'video', 'post', 'story', 'diger'], 'reels', 'tur'),
            'durum' => secim($v['durum'] ?? null, ['fikir', 'cekim_planlandi', 'cekildi', 'kurguda', 'onayda', 'revizyonda', 'hazir', 'yayinlandi'], 'fikir', 'durum'),
            'oncelik' => secim($v['oncelik'] ?? null, ['dusuk', 'normal', 'yuksek'], 'normal', 'oncelik'),
            'cekimId' => $cid,
            'teslimTarihi' => tarih($v['teslimTarihi'] ?? null, 'teslimTarihi'),
            'planTarihi' => tarih($v['planTarihi'] ?? null, 'planTarihi'),
            'yayinTarihi' => tarih($v['yayinTarihi'] ?? null, 'yayinTarihi'),
            'revizyonNotu' => metin($v['revizyonNotu'] ?? null, 5000, false, 'revizyonNotu'),
            'dosyalar' => [
                'ham' => metin($d['ham'] ?? null, 1000, false, 'dosyalar.ham'),
                'proje' => metin($d['proje'] ?? null, 1000, false, 'dosyalar.proje'),
                'final' => metin($d['final'] ?? null, 1000, false, 'dosyalar.final'),
            ],
            'not' => metin($v['not'] ?? null, 5000, false, 'not'),
            'gecmis' => $gecmis,
            'arsiv' => mantik($v['arsiv'] ?? false),
        ];
    }
    if ($tur === 'etkinlik') {
        $mid = $v['musteriId'] ?? null;
        if ($mid === '') $mid = null;
        if ($mid !== null && (!id_bicim($mid) || ($var[$mid] ?? '') !== 'musteri')) throw new InvalidArgumentException('Müşteri bulunamadı');
        $tumGun = mantik($v['tumGun'] ?? false);
        $bt = tarih($v['basTarih'] ?? null, 'basTarih', true);
        $st = tarih($v['bitTarih'] ?? null, 'bitTarih') ?? $bt;
        $bs = $tumGun ? null : saat($v['basSaat'] ?? null, 'basSaat');
        $ss = $tumGun ? null : saat($v['bitSaat'] ?? null, 'bitSaat');
        if (!$tumGun && ($bs === null || $ss === null)) throw new InvalidArgumentException('Başlangıç ve bitiş saatini gir ya da “Tüm gün” seç');
        if ($st . ' ' . ($ss ?? '24:00') <= $bt . ' ' . ($bs ?? '00:00') && !($tumGun && $st >= $bt)) {
            throw new InvalidArgumentException('Bitiş başlangıçtan sonra olmalı');
        }
        return [
            'musteriId' => $mid,
            'baslik' => metin($v['baslik'] ?? null, 200, true, 'baslik'),
            'tur' => secim($v['tur'] ?? null, ['cekim', 'toplanti', 'diger'], 'cekim', 'tur'),
            'tumGun' => $tumGun,
            'basTarih' => $bt, 'basSaat' => $bs, 'bitTarih' => $st, 'bitSaat' => $ss,
            'konum' => metin($v['konum'] ?? null, 300, false, 'konum'),
            'not' => metin($v['not'] ?? null, 5000, false, 'not'),
            'durum' => secim($v['durum'] ?? null, ['planlandi', 'tamamlandi', 'iptal'], 'planlandi', 'durum'),
            // tamamlandi'ya gecilen an (istege bagli; arayuz yazar, eski kayitlarda yok -> null)
            'tamamZaman' => zaman_damgasi($v['tamamZaman'] ?? null, 'tamamZaman'),
            'arsiv' => mantik($v['arsiv'] ?? false),
        ];
    }
    if ($tur === 'blok') {
        // Calisma blogu: bir musterinin iceriklerine ayrilan edit zamani. Tamamlamak iceriklerin durumunu degistirmez.
        $mid = $v['musteriId'] ?? null;
        if (!id_bicim($mid) || ($var[$mid] ?? '') !== 'musteri') throw new InvalidArgumentException('Müşteri bulunamadı');
        $gelen = $v['icerikIdler'] ?? null;
        if ($gelen === null) $gelen = [];
        if (!liste_mi($gelen)) throw new InvalidArgumentException(alan_ad('icerikIdler') . ' biçimi hatalı');
        if (count($gelen) > BLOK_ICERIK_SINIRI) throw new InvalidArgumentException('Bir blokta en çok ' . BLOK_ICERIK_SINIRI . ' içerik olabilir');
        global $ICERIK_MUSTERI;
        $icerikler = [];
        foreach ($gelen as $iid) {
            // arsivlenmis icerik de gecerli referanstir (blok sessizce bozulmaz); yalniz var olmali ve ayni musteriye ait olmali
            if (!id_bicim($iid) || ($var[$iid] ?? '') !== 'icerik') throw new InvalidArgumentException('Bloktaki içeriklerden biri bulunamadı');
            if (($ICERIK_MUSTERI[$iid] ?? null) !== $mid) {
                if (in_array($iid, $saklananBlok, true)) continue;
                throw new InvalidArgumentException('Bloktaki içeriklerden biri başka bir müşteriye ait; blokta yalnız bu müşterinin içerikleri olabilir');
            }
            if (in_array($iid, $icerikler, true)) throw new InvalidArgumentException('Aynı içerik blokta iki kez geçiyor');
            $icerikler[] = $iid;
        }
        $bt = tarih($v['basTarih'] ?? null, 'basTarih', true);
        $st = tarih($v['bitTarih'] ?? null, 'bitTarih') ?? $bt;
        $bs = saat($v['basSaat'] ?? null, 'basSaat');
        $ss = saat($v['bitSaat'] ?? null, 'bitSaat');
        if ($bs === null || $ss === null) throw new InvalidArgumentException('Başlangıç ve bitiş saatini gir');
        // gece yarisini (ve birden cok gunu) asabilir; bitis kesin olarak baslangictan sonra olmali
        if ($st . ' ' . $ss <= $bt . ' ' . $bs) throw new InvalidArgumentException('Bitiş başlangıçtan sonra olmalı');
        return [
            'musteriId' => $mid,
            'icerikIdler' => $icerikler,
            // bos olabilir: arayuz basligi iceriklerden uretir
            'baslik' => metin($v['baslik'] ?? null, 200, false, 'baslik'),
            'basTarih' => $bt, 'basSaat' => $bs, 'bitTarih' => $st, 'bitSaat' => $ss,
            'durum' => secim($v['durum'] ?? null, ['planlandi', 'tamamlandi'], 'planlandi', 'durum'),
            'tamamZaman' => zaman_damgasi($v['tamamZaman'] ?? null, 'tamamZaman'),
            'not' => metin($v['not'] ?? null, 5000, false, 'not'),
            'arsiv' => mantik($v['arsiv'] ?? false),
        ];
    }
    if ($tur === 'ozelgun') {
        return [
            'baslik' => metin($v['baslik'] ?? null, 120, true, 'baslik'),
            'tarih' => tarih($v['tarih'] ?? null, 'tarih', true),
            'tur' => secim($v['tur'] ?? null, ['ozel', 'dogum'], 'ozel', 'tur'),
            'herYil' => mantik($v['herYil'] ?? false),
            'arsiv' => mantik($v['arsiv'] ?? false),
        ];
    }
    if ($tur === 'ayar') {
        // calisma saatleri gun icindeki dakika (bos: arayuz varsayilani 09:00-19:00); bitis baslangictan sonra olmali
        $cb = tamsayi($v['calismaBas'] ?? null, 0, 1440, 'calismaBas');
        $ce = tamsayi($v['calismaBit'] ?? null, 0, 1440, 'calismaBit');
        if (($ce ?? 1140) <= ($cb ?? 540)) throw new InvalidArgumentException('Çalışma saati bitişi başlangıcından sonra olmalı');
        return [
            'varsayilanStokUyari' => tamsayi($v['varsayilanStokUyari'] ?? null, 0, 999, 'varsayilanStokUyari'),
            // son JSON yedeginin indirildigi gun (istege bagli; arayuz yazar, eski ayar kaydinda yok)
            'sonYedek' => tarih($v['sonYedek'] ?? null, 'sonYedek'),
            'calismaBas' => $cb,
            'calismaBit' => $ce,
            // haftada tamamlanacak is hedefi; 0 ya da bos: hedef yok
            'haftalikHedef' => tamsayi($v['haftalikHedef'] ?? null, 0, 99, 'haftalikHedef'),
        ];
    }
    throw new InvalidArgumentException('Bilinmeyen kayıt türü');
}

/** Musteri icin veritabaninda tekil anahtar (ad + kurum, Turkce kucuk harf). Sabit uzunluk: SHA-256. */
function anahtar(string $tur, array $v): ?string {
    if ($tur === 'musteri') return hash('sha256', norm($v['ad']) . '|' . norm($v['kurum']));
    return null;
}
/** Kimliksiz (elle hazirlanmis) kayitlarda mukerrer denetimi icin dogal anahtar. */
function dogal(string $tur, array $v): string {
    if ($tur === 'musteri') return 'm|' . norm($v['ad']) . '|' . norm($v['kurum']);
    if ($tur === 'etkinlik') return 'e|' . ($v['musteriId'] ?? '') . '|' . norm($v['baslik']) . '|' . $v['basTarih'] . '|' . ($v['basSaat'] ?? '');
    if ($tur === 'icerik') return 'i|' . $v['musteriId'] . '|' . norm($v['baslik']) . '|' . $v['tur'] . '|' . ($v['planTarihi'] ?? '');
    if ($tur === 'blok') return 'b|' . $v['musteriId'] . '|' . $v['basTarih'] . '|' . $v['basSaat'] . '|' . implode(',', $v['icerikIdler']);
    if ($tur === 'ozelgun') return 'o|' . norm($v['baslik']) . '|' . $v['tarih'] . '|' . $v['tur'];
    return 'a|' . $tur;
}

/* ---------------- Kayit islemleri ---------------- */

function tum_kayitlar(): array {
    return hepsi('SELECT id, tur, veri, surum, olusturma, guncelleme FROM kayitlar');
}
// Genel haritalar ($GLOBALS ile: kitaplik bir islevin icinden yuklense de islevlerin "global" bildirimi ayni diziyi gorur)
$GLOBALS['ETK_MUSTERI'] = [];    // etkinlik id => musteri id | null (bagli cekim denetimi icin)
$GLOBALS['ICERIK_BAG'] = [];     // icerik id => [musteriId, cekimId] (cekimin musterisi degisirken denetim icin)
$GLOBALS['ICERIK_MUSTERI'] = []; // icerik id => musteri id (calisma blogundaki icerikler ayni musteriye mi ait)
$GLOBALS['BLOK_BAG'] = [];       // blok id => [musteriId, [icerik id, ...]] (icerigin musterisi degisirken denetim icin)
function tur_haritasi(array $satirlar): array {
    global $ETK_MUSTERI, $ICERIK_BAG, $ICERIK_MUSTERI, $BLOK_BAG;
    $m = [];
    $ETK_MUSTERI = [];
    $ICERIK_BAG = [];
    $ICERIK_MUSTERI = [];
    $BLOK_BAG = [];
    foreach ($satirlar as $r) {
        $m[(string)$r['id']] = (string)$r['tur'];
        if ((string)$r['tur'] === 'etkinlik') {
            $v = json_decode((string)$r['veri'], true) ?: [];
            $ETK_MUSTERI[(string)$r['id']] = isset($v['musteriId']) && is_string($v['musteriId']) ? $v['musteriId'] : null;
        } elseif ((string)$r['tur'] === 'icerik') {
            $v = json_decode((string)$r['veri'], true) ?: [];
            if (!empty($v['cekimId'])) $ICERIK_BAG[(string)$r['id']] = [(string)($v['musteriId'] ?? ''), (string)$v['cekimId']];
            $ICERIK_MUSTERI[(string)$r['id']] = (string)($v['musteriId'] ?? '');
        } elseif ((string)$r['tur'] === 'blok') {
            $v = json_decode((string)$r['veri'], true) ?: [];
            $BLOK_BAG[(string)$r['id']] = [(string)($v['musteriId'] ?? ''), array_values(array_filter((array)($v['icerikIdler'] ?? []), 'is_string'))];
        }
    }
    return $m;
}
/** Etkinligin musterisi degisirken ona bagli baska musterinin icerigi kalmasin. */
function cekim_baglarini_denetle(string $id, ?string $musteriId): void {
    global $ICERIK_BAG;
    if ($musteriId === null) return;
    foreach ($ICERIK_BAG as $bag) {
        if ($bag[1] === $id && $bag[0] !== $musteriId) throw new InvalidArgumentException('Bu çekime başka müşterinin içerikleri bağlı. Müşteriyi değiştirmeden önce o içeriklerin “Bağlı çekim” alanını boşalt');
    }
}
/** Icerigin musterisi degisirken onu iceren (arsivdekiler dahil) calisma blogu baska musteride kalmasin. */
function blok_baglarini_denetle(string $id, string $musteriId): void {
    global $BLOK_BAG;
    foreach ($BLOK_BAG as $bag) {
        if ($bag[0] !== $musteriId && in_array($id, $bag[1], true)) throw new InvalidArgumentException('Bu içerik başka müşterinin bir çalışma bloğunda. Müşteriyi değiştirmeden önce içeriği o bloktan çıkar');
    }
}
function bag_haritasi_yaz(string $tur, string $id, array $temiz): void {
    global $ETK_MUSTERI, $ICERIK_BAG, $ICERIK_MUSTERI, $BLOK_BAG;
    if ($tur === 'etkinlik') $ETK_MUSTERI[$id] = $temiz['musteriId'];
    if ($tur === 'icerik') {
        if (!empty($temiz['cekimId'])) $ICERIK_BAG[$id] = [$temiz['musteriId'], $temiz['cekimId']]; else unset($ICERIK_BAG[$id]);
        $ICERIK_MUSTERI[$id] = $temiz['musteriId'];
    }
    if ($tur === 'blok') $BLOK_BAG[$id] = [$temiz['musteriId'], $temiz['icerikIdler']];
}
function disa(array $r): array {
    $v = json_decode((string)$r['veri'], true) ?: [];
    // bos nesne JSON'da {} kalsin (dizi [] olmasin)
    if (isset($v['siklik']) && is_array($v['siklik']) && array_key_exists('gunTurleri', $v['siklik'])) $v['siklik']['gunTurleri'] = (object)$v['siklik']['gunTurleri'];
    if (array_key_exists('slotIstisna', $v) && is_array($v['slotIstisna'])) $v['slotIstisna'] = (object)$v['slotIstisna'];
    return array_merge($v, ['id' => (string)$r['id'], 'surum' => (int)$r['surum'], 'olusturma' => (int)$r['olusturma'], 'guncelleme' => (int)$r['guncelleme']]);
}
function veri_paketi(): array {
    $p = ['musteriler' => [], 'icerikler' => [], 'etkinlikler' => [], 'bloklar' => [], 'ozelgunler' => [], 'ayar' => null];
    foreach (tum_kayitlar() as $r) {
        $t = (string)$r['tur'];
        if ($t === 'musteri') $p['musteriler'][] = disa($r);
        elseif ($t === 'icerik') $p['icerikler'][] = disa($r);
        elseif ($t === 'etkinlik') $p['etkinlikler'][] = disa($r);
        elseif ($t === 'blok') $p['bloklar'][] = disa($r);
        elseif ($t === 'ozelgun') $p['ozelgunler'][] = disa($r);
        elseif ($t === 'ayar') $p['ayar'] = disa($r);
    }
    return $p;
}
/** Tur basina kayit sayisi (eski paketlerde bloklar / ozelgunler yok: 0). */
function sayilar(array $paket): array {
    return ['musteri' => count($paket['musteriler']), 'icerik' => count($paket['icerikler']), 'etkinlik' => count($paket['etkinlikler']),
        'blok' => count($paket['bloklar'] ?? []), 'ozelgun' => count($paket['ozelgunler'] ?? [])];
}
function json_metin(array $v): string { return json_encode($v, JSON_UNESCAPED_UNICODE); }

/**
 * Tek kayit yaz (islem icinde cagrilir). Hata: istisna. Guncelleme yalniz istemcinin bildigi surum hala gecerliyse olur.
 * Yeni kayit istemcinin sectigi kimlikle (id, surumsuz) gelebilir: ayni istek tekrarlanirsa ikinci kayit olusmaz.
 */
function kayit_yaz(string $tur, ?string $id, array $veri, ?int $surum, array &$var): array {
    if (!in_array($tur, TURLER, true)) throw new InvalidArgumentException('Bilinmeyen kayıt türü');
    if ($tur === 'ayar') {
        // Ayar alanlari ayri ekranlardan kaydedilir (esik, son yedek, takvim calisma saatleri ve hedef); eski arayuz yalniz
        // esikle kaydeder. Gonderilmeyen alan silinmez, saklisi korunur; acikca null gonderilen alan bosaltilir.
        $eskiAyar = null;
        foreach (['sonYedek', 'calismaBas', 'calismaBit', 'haftalikHedef'] as $ak) {
            if (array_key_exists($ak, $veri)) continue;
            if ($eskiAyar === null) {
                $r = tek("SELECT veri FROM kayitlar WHERE id = 'ayar' AND tur = 'ayar'");
                $eskiAyar = $r ? (json_decode((string)$r['veri'], true) ?: []) : [];
            }
            $eski = $eskiAyar[$ak] ?? null;
            try {
                if ($ak === 'sonYedek' && is_string($eski)) $veri[$ak] = tarih($eski, $ak);
                elseif ($ak !== 'sonYedek' && is_int($eski)) $veri[$ak] = tamsayi($eski, 0, $ak === 'haftalikHedef' ? 99 : 1440, $ak);
            } catch (InvalidArgumentException $e) { /* bozuksa tasinmaz */ }
        }
    }
    global $BLOK_BAG;
    $saklanan = [];
    if ($tur === 'blok' && is_string($id) && isset($BLOK_BAG[$id]) && $BLOK_BAG[$id][0] === ($veri['musteriId'] ?? null)) $saklanan = $BLOK_BAG[$id][1];
    $temiz = temizle($tur, $veri, $var, $saklanan);
    $anahtar = anahtar($tur, $temiz);
    $n = simdi();
    if ($tur === 'ayar') $id = 'ayar';
    if ($id !== null && $id !== '') {
        if ($tur !== 'ayar' && !id_bicim($id)) throw new InvalidArgumentException('Geçersiz kayıt kimliği');
        $mevcut = tek('SELECT tur, surum, veri, olusturma, guncelleme FROM kayitlar WHERE id = ?', [$id]);
        if ($mevcut) {
            if ((string)$mevcut['tur'] !== $tur) throw new InvalidArgumentException('Kaydın türü değiştirilemez');
            // Tekrarlanan istek (yaniti kaybolan kaydetme yeniden gonderildi): surumsuz (yeni kayit) ya da eski surumlu yazma,
            // kayit zaten tam gonderildigi gibiyse basarili sayilir ve var olan kayit doner; yeni surum yazilmaz, ikinci kayit
            // olusmaz. Icerik farkliysa eskisi gibi 409 doner (hicbir sey sessizce ezilmez).
            if (($surum === null || $surum !== (int)$mevcut['surum']) && json_metin($temiz) === (string)$mevcut['veri']) {
                return disa(array_merge($mevcut, ['id' => $id]));
            }
            if ($tur === 'etkinlik') cekim_baglarini_denetle($id, $temiz['musteriId']);
            if ($tur === 'icerik') blok_baglarini_denetle($id, $temiz['musteriId']);
            $yeniSurum = yeni_surum();
            $degisen = $surum === null ? 0 : calistir('UPDATE kayitlar SET veri = ?, anahtar = ?, surum = ?, guncelleme = ? WHERE id = ? AND surum = ?',
                [json_metin($temiz), $anahtar, $yeniSurum, $n, $id, $surum]);
            if ($degisen !== 1) {
                $guncel = tek('SELECT tur, surum, veri, olusturma, guncelleme FROM kayitlar WHERE id = ?', [$id]);
                throw new RuntimeException('cakisma|' . json_encode(disa(array_merge($guncel ?: $mevcut, ['id' => $id])), JSON_UNESCAPED_UNICODE));
            }
            bag_haritasi_yaz($tur, $id, $temiz);
            return array_merge($temiz, ['id' => $id, 'surum' => $yeniSurum, 'olusturma' => (int)$mevcut['olusturma'], 'guncelleme' => $n]);
        }
        // surumle gelen ama artik olmayan kayit (ayar dahil) yeniden yaratilmaz
        if ($surum !== null) throw new RuntimeException('yok|');
    } else {
        $id = yeni_id();
    }
    $yeniSurum = yeni_surum();
    calistir('INSERT INTO kayitlar (id, tur, anahtar, veri, surum, olusturma, guncelleme) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$id, $tur, $anahtar, json_metin($temiz), $yeniSurum, $n, $n]);
    $var[$id] = $tur;
    bag_haritasi_yaz($tur, $id, $temiz);
    return array_merge($temiz, ['id' => $id, 'surum' => $yeniSurum, 'olusturma' => $n, 'guncelleme' => $n]);
}

function mesgul_mu(Throwable $e): bool {
    return (bool)preg_match('/database is locked|database table is locked|Lock wait timeout|Deadlock/i', $e->getMessage());
}

/** Anlik kopya verisi sikistirilarak saklanir (MySQL max_allowed_packet ve disk icin); eski bicim de okunur. */
function anlik_paketle(array $paket): string {
    $j = json_metin($paket);
    if (function_exists('gzcompress')) { $z = gzcompress($j, 6); if ($z !== false) return 'z:' . base64_encode($z); }
    return $j;
}
function anlik_coz(string $veri): array {
    if (str_starts_with($veri, 'z:')) { $j = gzuncompress((string)base64_decode(substr($veri, 2), true)); $veri = $j === false ? '' : $j; }
    return json_decode($veri, true) ?: [];
}
/**
 * Anlik kopya (islem icinde cagrilir); sira hep artan sayactan (ayni saniyede de dogru sira). Gunluk kopyalardan en yeni 14,
 * digerlerinden (ice aktarma / geri yukleme oncesi) en yeni 30 kalir: ayri sayilir, gunluk kopyalar digerlerini itmez.
 */
function anlik_al(string $neden): string {
    $paket = veri_paketi();
    $id = yeni_id();
    $s = sayilar($paket);
    calistir('INSERT INTO anliklar (id, sira, zaman, neden, ozet, veri) VALUES (?, ?, ?, ?, ?, ?)',
        [$id, yeni_surum(), simdi(), $neden, sprintf('%d müşteri, %d içerik, %d çekim / etkinlik', $s['musteri'], $s['icerik'], $s['etkinlik'])
            . ($s['blok'] || $s['ozelgun'] ? sprintf(', %d çalışma bloğu, %d özel gün', $s['blok'], $s['ozelgun']) : ''), anlik_paketle($paket)]);
    $say = ['gunluk' => 0, 'diger' => 0];
    foreach (hepsi('SELECT id, neden FROM anliklar ORDER BY sira DESC') as $r) {
        $g = (string)$r['neden'] === 'gunluk' ? 'gunluk' : 'diger';
        if (++$say[$g] > ($g === 'gunluk' ? GUNLUK_ANLIK_SINIRI : ANLIK_SINIRI)) calistir('DELETE FROM anliklar WHERE id = ?', [$r['id']]);
    }
    return $id;
}
/** Istanbul takvim gunu (UTC+3, yaz saati yok). */
function istanbul_gunu(): string { return gmdate('Y-m-d', simdi() + 3 * 3600); }
/**
 * Gunluk otomatik kopya: her Istanbul gununun ilk kaydet / toplu yazmasindan once, ayni islem icinde alinir (yazma
 * basarisiz olursa kopya ve gun isareti de geri alinir). Gun isareti ayar tablosunda durur. Okuma islemlerinde alinmaz
 * (sayac artar, acik ice aktarma onizlemeleri eskirdi). Hic kayit yoksa kopya alinmaz, gun de isaretlenmez.
 */
function gunluk_anlik(): void {
    $gun = istanbul_gunu();
    if (ayar_oku('gunluk_anlik') === $gun) return;
    if (!tek("SELECT 1 AS v FROM kayitlar WHERE tur <> 'ayar' LIMIT 1")) return;
    anlik_al('gunluk');
    ayar_yaz('gunluk_anlik', $gun);
}

/** Verinin "durumu": her yazmada artan sayac. Onizleme ile uygulama arasinda degistiyse onizleme eskidir. */
function veri_durumu(): int { return (int)(tek("SELECT deger FROM sayac WHERE ad = 'surum'")['deger'] ?? 0); }

/* ---------------- Kitaplik olarak kullanim (panel ve sohbet baglantisi ortak yolu) ---------------- */

/** Verilen turdeki tek kayit (disa bicimde: veri + id, surum, olusturma, guncelleme); yoksa ya da turu farkliysa null. */
function kayit_oku(string $tur, string $id): ?array {
    if (!in_array($tur, TURLER, true)) throw new InvalidArgumentException('Bilinmeyen kayıt türü');
    if ($tur === 'ayar' ? $id !== 'ayar' : !id_bicim($id)) return null;
    $r = tek('SELECT id, tur, veri, surum, olusturma, guncelleme FROM kayitlar WHERE id = ? AND tur = ?', [$id, $tur]);
    return $r ? disa($r) : null;
}
/** Bir turun butun kayitlari (arsivdekiler dahil; disa bicimde). Bilinmeyen tur: InvalidArgumentException. */
function kayitlari_oku(string $tur): array {
    if (!in_array($tur, TURLER, true)) throw new InvalidArgumentException('Bilinmeyen kayıt türü');
    return array_map('disa', hepsi('SELECT id, tur, veri, surum, olusturma, guncelleme FROM kayitlar WHERE tur = ?', [$tur]));
}
/**
 * Panelin "kaydet" islemi: tek islemde gunluk kopya (gunun ilk yazmasiysa) + kayit_yaz. Yeni kayit istemcinin sectigi
 * kimlikle gelebilir (ayni istek tekrarlanirsa ikinci kayit olusmaz); guncelleme yalniz $surum hala gecerliyse yazilir.
 * Hata: istisna (yazma_hatasi_kodu ile siniflandirilir); hicbir sey yazilmaz.
 */
function kayit_kaydet(string $tur, ?string $id, array $veri, ?int $surum): array {
    return islem(function () use ($tur, $id, $veri, $surum) {
        gunluk_anlik();
        $var = tur_haritasi(tum_kayitlar());
        return kayit_yaz($tur, $id, $veri, $surum, $var);
    });
}
/**
 * Yazma hatasinin turu (kitaplik kullaniminda kurulum / veritabani hatasi StudioHatasi olarak gelir): gecersiz (dogrulama) | cakisma (surum uyusmadi) | yok (surumle gelen kayit yok) |
 * ayni_ad (ayni ad + kurumla musteri var) | mesgul | veritabani_sinir | sunucu.
 */
function yazma_hatasi_kodu(Throwable $e): string {
    if ($e instanceof StudioHatasi) return $e->kod === 'mesgul' ? 'mesgul' : 'sunucu';   // yalniz kitaplik kullaniminda (panel cikar)
    if ($e instanceof InvalidArgumentException) return 'gecersiz';
    if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'cakisma|')) return 'cakisma';
    if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'yok|')) return 'yok';
    if ($e instanceof PDOException && (str_contains($e->getMessage(), 'UNIQUE') || str_contains($e->getMessage(), 'Duplicate'))) return 'ayni_ad';
    if ($e instanceof PDOException && mesgul_mu($e)) return 'mesgul';
    if ($e instanceof PDOException && preg_match('/max_allowed_packet|packet bigger|1153/i', $e->getMessage())) return 'veritabani_sinir';
    return 'sunucu';
}
/** Surum uyusmazliginda kaydin guncel hali (JSON metni; nesneler {} olarak kalir) ya da null. */
function cakisma_guncel_json(Throwable $e): ?string {
    return yazma_hatasi_kodu($e) === 'cakisma' ? substr($e->getMessage(), 8) : null;
}
