<?php
declare(strict_types=1);

/*
 * Suflo Studio API (tek kullanicili ozel icerik uretim ve ajans takip uygulamasi)
 *
 * - Suflo Pro lisans servisinden (pro-v1) TAMAMEN ayri: ayri config (private/studio-v1/config.php),
 *   ayri veritabani, ayri oturum cerezi. Pro lisansi burada hicbir yetki vermez.
 * - Her istek: POST + JSON, Origin izin listesinde, "X-Studio: 1" basligi (CSRF), giris disindaki
 *   her islemde sunucu tarafli oturum denetimi (__Host- onekli, HttpOnly, Secure, SameSite=Strict cerez).
 * - Veri: kayitlar tablosunda tur (musteri | icerik | etkinlik | ayar) basina beyaz listeli JSON.
 *   Silme yok, arsiv var. Iyimser surum denetimi: surum numaralari tek ve hep artan bir sayactan gelir,
 *   geri yuklemede bile tekrar kullanilmaz; guncelleme "WHERE surum = ?" ile yapilir.
 * - Yazmalar islem (transaction) icinde; SQLite'ta BEGIN IMMEDIATE ile yazma kilidi bastan alinir.
 * - Ice aktarma / geri yuklemeden once ayni islem icinde otomatik anlik kopya.
 * - Hatali giris kilidi; "taninan cihaz" cerezi olan cihaz kilitten etkilenmez (sahibi kilitlenemez).
 * - Gizli bilgi (sifre ozeti, veritabani sifresi) yalniz private config'te; yanitlara/gunluge girmez.
 */

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, private');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

const STUDIO_SURUM = 1;
const SEMA_SURUM = '3';
const STUDIO_TABLOLARI = ['kayitlar', 'oturumlar', 'cihazlar', 'girisler', 'ayar', 'anliklar', 'sayac'];
const GOVDE_SINIRI = 8 * 1024 * 1024;      // oturum acikken (ice aktarma)
const ACIK_GOVDE_SINIRI = 16 * 1024;        // oturumsuz istekler (oturum, giris) icin
const LISTE_SINIRI = 20000;                 // ice aktarmada tur basina en cok kayit
const CIHAZ_BOSTA = 180 * 24 * 3600;        // bu kadar kullanilmayan taninan cihaz unutulur
const TURLER = ['musteri', 'icerik', 'etkinlik', 'ayar'];
const CIHAZ_OMRU = 400 * 24 * 3600;

function cevap(int $kod, array $veri): void {
    http_response_code($kod);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($veri, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function hata(int $kod, string $h, string $mesaj, array $ek = []): void {
    cevap($kod, array_merge(['ok' => false, 'hata' => $h, 'mesaj' => $mesaj], $ek));
}
function basari(array $veri = []): void {
    cevap(200, array_merge(['ok' => true], $veri));
}

/* ---------------- Ayarlar ---------------- */

/** Ayar okunamadan donen kurulum hatasi. Arayuz "sunucuya ulasilamadi" yerine "kurulmadi" gorebilsin diye
 *  bilinen Studio adreslerine CORS basliklari eklenir (yanit gizli bilgi icermez). */
function kurulum_hatasi(string $mesaj): void {
    $o = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if (in_array($o, ['https://suflo.app', 'https://assets.suflo.app'], true)) {
        header('Access-Control-Allow-Origin: ' . $o);
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-Studio');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Vary: Origin');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
    hata(503, 'kurulum', $mesaj);
}

$configPath = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/private/studio-v1/config.php';
if (!is_file($configPath)) kurulum_hatasi('Suflo Studio sunucusu henuz yapilandirilmadi.');
try {
    $C = require $configPath;
} catch (Throwable $e) {
    kurulum_hatasi('Suflo Studio ayar dosyasi okunamadi.');
}
if (!is_array($C)) kurulum_hatasi('Suflo Studio ayar dosyasi okunamadi.');
$C += [
    'password_hash' => '', 'dsn' => '', 'db_user' => '', 'db_pass' => '',
    'allowed_origins' => [], 'session_idle' => 14 * 24 * 3600, 'session_max' => 60 * 24 * 3600,
    'login_max_fail' => 8, 'login_window' => 900, 'cookie_secure' => true,
];

/* ---------------- CORS + CSRF ---------------- */

$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
$izinli = in_array($origin, (array)$C['allowed_origins'], true);
if ($izinli) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-Studio');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Max-Age: 600');
}
header('Vary: Origin');
$yontem = (string)($_SERVER['REQUEST_METHOD'] ?? '');
if ($yontem === 'OPTIONS') {
    if (!$izinli) hata(403, 'kaynak', 'Bu adresten erisim yok.');
    http_response_code(204);
    exit;
}
if ($yontem !== 'POST') hata(405, 'yontem', 'Yalniz POST.');
if (!$izinli) hata(403, 'kaynak', 'Bu adresten erisim yok.');
if (($_SERVER['HTTP_X_STUDIO'] ?? '') !== '1') hata(403, 'baslik', 'Eksik istek basligi.');
$ctype = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
if ($ctype !== 'application/json') hata(415, 'icerik_turu', 'Content-Type application/json olmali.');
// Oturum govdeden once denetlenir: oturumsuz istek (oturum, giris) yalniz kucuk govde gonderebilir;
// buyuk govde (ice aktarma) yalniz gecerli oturumla okunur ve cozulur.
try {
    sifre_izi_denetle();
    $oturumlu = oturum_gecerli();
} catch (Throwable $e) {
    if (mesgul_mu($e)) hata(503, 'mesgul', 'Sunucu mesgul; yeniden dene.');
    hata(500, 'sunucu', 'Sunucu hatasi.');
}
$sinir = $oturumlu ? GOVDE_SINIRI : ACIK_GOVDE_SINIRI;
// oturumsuz buyuk govde: suresi dolmus oturumla ice aktarma gibi; "dosya buyuk" degil "giris gerekli" doner
$asim = function () use ($oturumlu) { if (!$oturumlu) hata(401, 'oturum', 'Giris gerekli.'); hata(413, 'buyuk', 'Istek cok buyuk.'); };
$uzunluk = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($uzunluk > $sinir) $asim();
$ham = (string)file_get_contents('php://input', false, null, 0, $sinir + 1);
if (strlen($ham) > $sinir) $asim();
$G = json_decode($ham, true, 64);
if (!is_array($G)) hata(400, 'json', 'Gecersiz JSON.');
$islem = (string)($G['islem'] ?? '');

/* ---------------- Veritabani ---------------- */

function db(): PDO {
    static $pdo = null;
    global $C;
    if ($pdo) return $pdo;
    if ((string)$C['dsn'] === '') hata(503, 'kurulum', 'Veritabani ayari (dsn) bos.');
    try {
        $pdo = new PDO((string)$C['dsn'], (string)$C['db_user'], (string)$C['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (Throwable $e) {
        hata(503, 'veritabani', 'Veritabanina baglanilamadi.');
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
        if ($e->getMessage() === 'kilit' || mesgul_mu($e)) hata(503, 'mesgul', 'Sunucu mesgul; yeniden dene.');
        if ($e->getMessage() === 'eski_sema') {
            hata(503, 'kurulum', 'Veritabani bu surumle uyumsuz bir gelistirme surumune ait. Yeni, bos bir veritabani kullanin (eski SQLite dosyasini ya da MySQL tablolarini kaldirin), sonra yedegi ice aktarin.');
        }
        hata(503, 'kurulum', 'Veritabani tablolari olusturulamadi.');
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

/* ---------------- Oturum ve cihaz ---------------- */

/** Cerez adi: guvenli kipte __Host- onekli (yalniz bu alan adi, Path=/, Secure; kardes alan adi yazamaz). */
function cerez_adi(string $tur): string {
    global $C;
    $ad = $tur === 'cihaz' ? 'suflo_studio_cihaz' : 'suflo_studio';
    return $C['cookie_secure'] ? '__Host-' . $ad : $ad;
}
function cerez_yaz(string $tur, string $deger, int $omur): void {
    global $C;
    setcookie(cerez_adi($tur), $deger, [
        'expires' => $omur > 0 ? simdi() + $omur : 1,
        'path' => '/',
        'secure' => (bool)$C['cookie_secure'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}
function cerez_oku(string $tur): string {
    $t = (string)($_COOKIE[cerez_adi($tur)] ?? '');
    return preg_match('/^[A-Za-z0-9_-]{40,64}$/', $t) ? $t : '';
}
function rastgele_anahtar(): string { return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '='); }

function oturum_gecerli(): bool {
    global $C;
    $t = cerez_oku('oturum');
    if ($t === '') return false;
    $oz = hash('sha256', $t);
    $r = tek('SELECT olusturma, son FROM oturumlar WHERE ozet = ?', [$oz]);
    if (!$r) return false;
    $n = simdi();
    if ($n - (int)$r['son'] > (int)$C['session_idle'] || $n - (int)$r['olusturma'] > (int)$C['session_max']) {
        calistir('DELETE FROM oturumlar WHERE ozet = ?', [$oz]);
        return false;
    }
    if ($n - (int)$r['son'] > 300) { try { calistir('UPDATE oturumlar SET son = ? WHERE ozet = ?', [$n, $oz]); } catch (Throwable $e) { /* mesgulse sonraki istekte */ } }
    return true;
}
function oturum_ac(): void {
    global $C;
    $t = rastgele_anahtar();
    $n = simdi();
    calistir('INSERT INTO oturumlar (ozet, olusturma, son) VALUES (?, ?, ?)', [hash('sha256', $t), $n, $n]);
    calistir('DELETE FROM oturumlar WHERE son < ? OR olusturma < ?', [$n - (int)$C['session_idle'], $n - (int)$C['session_max']]);
    cerez_yaz('oturum', $t, (int)$C['session_max']);
}
/** Taninan cihaz: daha once dogru sifreyle girilmis cihaz. Yalniz hatali giris kilidini asmaya yarar, erisim vermez.
 *  Sifre degisince ve "tum oturumlari kapat"ta hepsi unutulur; 180 gun kullanilmayan cihaz da unutulur. */
function cihaz_ozeti(): ?string {
    $t = cerez_oku('cihaz');
    if ($t === '') return null;
    $oz = hash('sha256', $t);
    return tek('SELECT 1 AS v FROM cihazlar WHERE ozet = ? AND son >= ?', [$oz, simdi() - CIHAZ_BOSTA]) ? $oz : null;
}
/** Basarili giristen sonra: bilinen cihazin suresi uzatilir, bilinmeyen cihaz kaydedilir. */
function cihaz_tani(?string $mevcut): void {
    $n = simdi();
    if ($mevcut !== null) {
        calistir('UPDATE cihazlar SET son = ? WHERE ozet = ?', [$n, $mevcut]);
        cerez_yaz('cihaz', cerez_oku('cihaz'), CIHAZ_OMRU);
        return;
    }
    $t = rastgele_anahtar();
    calistir('INSERT INTO cihazlar (ozet, olusturma, son) VALUES (?, ?, ?)', [hash('sha256', $t), $n, $n]);
    calistir('DELETE FROM cihazlar WHERE son < ?', [$n - CIHAZ_BOSTA]);
    cerez_yaz('cihaz', $t, CIHAZ_OMRU);
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
 * Sifre denemesi (giris ve sifre degistirme). Deneme sifre denetiminden ONCE kaydedilir; sonra sayilir
 * (paralel denemeler siniri asamaz). Taninan cihaz yalniz kendi sayacina tabidir; digerleri IP basina ve
 * toplam sinira. Dogruysa ya da kilide takildiysa deneme kaydi silinir (yalniz yanlis sifre denemeleri sayilir).
 * Doner: dogruysa denetlenen sifre ozeti, yanlissa null; kilitliyse 429 ile cikar.
 */
function sifre_dene(string $sifre, ?string $cihaz): ?string {
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
        hata(429, 'kilit', 'Cok fazla hatali deneme. Biraz sonra yeniden dene.');
    }
    $ozet = sifre_ozeti();
    $dogru = $ozet !== '' && strlen($sifre) <= 1024 && password_verify($sifre, $ozet);
    if ($dogru) { calistir('DELETE FROM girisler WHERE kim = ?', [$kim]); return $ozet; }
    usleep(400000);
    return null;
}
/** Etkin sifre ozetinin parmak izi (veritabaninda saklanir; ozetin kendisi degil). */
function sifre_izi(string $ozet): string { return hash('sha256', 'iz|' . $ozet); }
/**
 * config.php'deki sifre ozeti elle degistirilirse (sifre unutuldu / sifre ele gecirildi) butun oturumlar ve
 * taninan cihazlar sonlanir: etkin ozetin parmak izi saklanir, degisirse temizlenir. Hatali giris kayitlari da
 * silinir: sahibinin sifreyi hatirlamaya calisirken biriktirdigi denemeler sifirlamadan sonra onu kilitlemesin.
 */
function sifre_izi_denetle(): void {
    $iz = sifre_izi(sifre_ozeti());
    if (ayar_oku('sifre_izi') === $iz) return;
    islem(function () use ($iz) {
        $eski = ayar_oku('sifre_izi');
        if ($eski === $iz) return;
        if ($eski !== null) { calistir('DELETE FROM oturumlar'); cihazlari_unut(); calistir('DELETE FROM girisler'); }
        ayar_yaz('sifre_izi', $iz);
    });
}

/* ---------------- Dogrulama ---------------- */

function norm(string $s): string {
    if (class_exists('Normalizer')) $s = (string)(Normalizer::normalize($s, Normalizer::FORM_C) ?: $s);
    $s = (string)preg_replace('/[\x{200B}-\x{200D}\x{2060}\x{FEFF}]/u', '', $s);
    $s = str_replace(['I', 'İ'], ['ı', 'i'], trim($s));
    $s = mb_strtolower($s, 'UTF-8');
    return preg_replace('/\s+/u', ' ', $s) ?? $s;
}
function metin($v, int $max, bool $zorunlu, string $alan): string {
    if ($v === null) $v = '';
    if (!is_string($v)) throw new InvalidArgumentException("$alan metin olmali");
    $v = trim(str_replace("\0", '', $v));
    if ($zorunlu && $v === '') throw new InvalidArgumentException("$alan bos olamaz");
    if (mb_strlen($v) > $max) throw new InvalidArgumentException("$alan cok uzun (en cok $max)");
    return $v;
}
function secim($v, array $izin, string $vars, string $alan): string {
    if ($v === null || $v === '') return $vars;
    if (!is_string($v) || !in_array($v, $izin, true)) throw new InvalidArgumentException("$alan gecersiz");
    return $v;
}
function tarih($v, string $alan, bool $zorunlu = false): ?string {
    if ($v === null || $v === '') {
        if ($zorunlu) throw new InvalidArgumentException("$alan gerekli");
        return null;
    }
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
        throw new InvalidArgumentException("$alan YYYY-AA-GG olmali");
    }
    return $v;
}
function saat($v, string $alan): ?string {
    if ($v === null || $v === '') return null;
    if (!is_string($v) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $v)) throw new InvalidArgumentException("$alan SS:DD olmali");
    return $v;
}
function tamsayi($v, int $min, int $max, string $alan): ?int {
    if ($v === null || $v === '') return null;
    if (is_string($v) && preg_match('/^-?\d+$/', $v)) $v = (int)$v;
    if (!is_int($v) || $v < $min || $v > $max) throw new InvalidArgumentException("$alan $min-$max arasinda tam sayi olmali");
    return $v;
}
function mantik($v): bool { return $v === true || $v === 1 || $v === '1' || $v === 'true'; }
function id_bicim($v): bool { return is_string($v) && preg_match('/^[a-z0-9]{8,40}$/', $v) === 1; }

/** Kaydi beyaz listeye gore temizler. $var: id => tur (musteri / etkinlik referanslari icin). */
/** Alan nesne olmali (ya da hic verilmemeli): yanlis bicim sessizce bos sayilmaz. */
function nesne($v, string $alan): array {
    if ($v === null) return [];
    if (!is_array($v) || ($v !== [] && array_keys($v) === range(0, count($v) - 1))) throw new InvalidArgumentException("$alan nesne olmali");
    return $v;
}
function temizle(string $tur, array $v, array $var): array {
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
        if (count($gelenIstisna) > 2000) throw new InvalidArgumentException('slotIstisna cok uzun');
        $dun = gmdate('Y-m-d', time() + 3 * 3600 - 86400); // Istanbul'da dunden eski gunler budanir
        foreach ($gelenIstisna as $t => $tt) {
            $t = tarih((string)$t, 'slotIstisna tarihi', true);
            if ($t < $dun) continue;
            if ($tt !== null && $tt !== '') $istisna[$t] = secim($tt, ['video', 'post', 'story', 'diger'], 'video', 'slotIstisna');
        }
        ksort($istisna);
        if (count($istisna) > 400) throw new InvalidArgumentException('slotIstisna en cok 400 gun');
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
        if (!id_bicim($mid) || ($var[$mid] ?? '') !== 'musteri') throw new InvalidArgumentException('musteri bulunamadi');
        $cid = $v['cekimId'] ?? null;
        if ($cid === '' ) $cid = null;
        if ($cid !== null && (!id_bicim($cid) || ($var[$cid] ?? '') !== 'etkinlik')) throw new InvalidArgumentException('bagli cekim bulunamadi');
        // bagli cekim musterisiz olmali ya da ayni musteriye ait olmali
        global $ETK_MUSTERI;
        if ($cid !== null && ($ETK_MUSTERI[$cid] ?? null) !== null && $ETK_MUSTERI[$cid] !== $mid) throw new InvalidArgumentException('bagli cekim baska musteriye ait');
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
        if ($mid !== null && (!id_bicim($mid) || ($var[$mid] ?? '') !== 'musteri')) throw new InvalidArgumentException('musteri bulunamadi');
        $tumGun = mantik($v['tumGun'] ?? false);
        $bt = tarih($v['basTarih'] ?? null, 'basTarih', true);
        $st = tarih($v['bitTarih'] ?? null, 'bitTarih') ?? $bt;
        $bs = $tumGun ? null : saat($v['basSaat'] ?? null, 'basSaat');
        $ss = $tumGun ? null : saat($v['bitSaat'] ?? null, 'bitSaat');
        if (!$tumGun && ($bs === null || $ss === null)) throw new InvalidArgumentException('saatli etkinlikte baslangic ve bitis saati gerekli');
        if ($st . ' ' . ($ss ?? '24:00') <= $bt . ' ' . ($bs ?? '00:00') && !($tumGun && $st >= $bt)) {
            throw new InvalidArgumentException('bitis baslangictan sonra olmali');
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
            'arsiv' => mantik($v['arsiv'] ?? false),
        ];
    }
    if ($tur === 'ayar') {
        return [
            'varsayilanStokUyari' => tamsayi($v['varsayilanStokUyari'] ?? null, 0, 999, 'varsayilanStokUyari'),
        ];
    }
    throw new InvalidArgumentException('bilinmeyen tur');
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
    return 'a|' . $tur;
}

/* ---------------- Kayit islemleri ---------------- */

function tum_kayitlar(): array {
    return hepsi('SELECT id, tur, veri, surum, olusturma, guncelleme FROM kayitlar');
}
$ETK_MUSTERI = [];  // etkinlik id => musteri id | null (bagli cekim denetimi icin)
$ICERIK_BAG = [];   // icerik id => [musteriId, cekimId] (cekimin musterisi degisirken denetim icin)
function tur_haritasi(array $satirlar): array {
    global $ETK_MUSTERI, $ICERIK_BAG;
    $m = [];
    $ETK_MUSTERI = [];
    $ICERIK_BAG = [];
    foreach ($satirlar as $r) {
        $m[(string)$r['id']] = (string)$r['tur'];
        if ((string)$r['tur'] === 'etkinlik') {
            $v = json_decode((string)$r['veri'], true) ?: [];
            $ETK_MUSTERI[(string)$r['id']] = isset($v['musteriId']) && is_string($v['musteriId']) ? $v['musteriId'] : null;
        } elseif ((string)$r['tur'] === 'icerik') {
            $v = json_decode((string)$r['veri'], true) ?: [];
            if (!empty($v['cekimId'])) $ICERIK_BAG[(string)$r['id']] = [(string)($v['musteriId'] ?? ''), (string)$v['cekimId']];
        }
    }
    return $m;
}
/** Etkinligin musterisi degisirken ona bagli baska musterinin icerigi kalmasin. */
function cekim_baglarini_denetle(string $id, ?string $musteriId): void {
    global $ICERIK_BAG;
    if ($musteriId === null) return;
    foreach ($ICERIK_BAG as $bag) {
        if ($bag[1] === $id && $bag[0] !== $musteriId) throw new InvalidArgumentException('bu cekime baska musterinin icerikleri bagli; once o iceriklerin bagli cekimini kaldirin');
    }
}
function bag_haritasi_yaz(string $tur, string $id, array $temiz): void {
    global $ETK_MUSTERI, $ICERIK_BAG;
    if ($tur === 'etkinlik') $ETK_MUSTERI[$id] = $temiz['musteriId'];
    if ($tur === 'icerik') { if (!empty($temiz['cekimId'])) $ICERIK_BAG[$id] = [$temiz['musteriId'], $temiz['cekimId']]; else unset($ICERIK_BAG[$id]); }
}
function disa(array $r): array {
    $v = json_decode((string)$r['veri'], true) ?: [];
    // bos nesne JSON'da {} kalsin (dizi [] olmasin)
    if (isset($v['siklik']) && is_array($v['siklik']) && array_key_exists('gunTurleri', $v['siklik'])) $v['siklik']['gunTurleri'] = (object)$v['siklik']['gunTurleri'];
    if (array_key_exists('slotIstisna', $v) && is_array($v['slotIstisna'])) $v['slotIstisna'] = (object)$v['slotIstisna'];
    return array_merge($v, ['id' => (string)$r['id'], 'surum' => (int)$r['surum'], 'olusturma' => (int)$r['olusturma'], 'guncelleme' => (int)$r['guncelleme']]);
}
function veri_paketi(): array {
    $p = ['musteriler' => [], 'icerikler' => [], 'etkinlikler' => [], 'ayar' => null];
    foreach (tum_kayitlar() as $r) {
        $t = (string)$r['tur'];
        if ($t === 'musteri') $p['musteriler'][] = disa($r);
        elseif ($t === 'icerik') $p['icerikler'][] = disa($r);
        elseif ($t === 'etkinlik') $p['etkinlikler'][] = disa($r);
        elseif ($t === 'ayar') $p['ayar'] = disa($r);
    }
    return $p;
}
function sayilar(array $paket): array {
    return ['musteri' => count($paket['musteriler']), 'icerik' => count($paket['icerikler']), 'etkinlik' => count($paket['etkinlikler'])];
}
function json_metin(array $v): string { return json_encode($v, JSON_UNESCAPED_UNICODE); }

/** Tek kayit yaz (islem icinde cagrilir). Hata: istisna. Guncelleme yalniz istemcinin bildigi surum hala gecerliyse olur. */
function kayit_yaz(string $tur, ?string $id, array $veri, ?int $surum, array &$var): array {
    if (!in_array($tur, TURLER, true)) throw new InvalidArgumentException('bilinmeyen tur');
    $temiz = temizle($tur, $veri, $var);
    $anahtar = anahtar($tur, $temiz);
    $n = simdi();
    if ($tur === 'ayar') $id = 'ayar';
    if ($id !== null && $id !== '') {
        if ($tur !== 'ayar' && !id_bicim($id)) throw new InvalidArgumentException('gecersiz id');
        $mevcut = tek('SELECT tur, surum, veri, olusturma, guncelleme FROM kayitlar WHERE id = ?', [$id]);
        if ($mevcut) {
            if ((string)$mevcut['tur'] !== $tur) throw new InvalidArgumentException('tur degistirilemez');
            if ($tur === 'etkinlik') cekim_baglarini_denetle($id, $temiz['musteriId']);
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

function yaz_hatasi(Throwable $e, ?int $sira = null): void {
    $ek = $sira === null ? [] : ['sira' => $sira];
    if ($e instanceof InvalidArgumentException) hata(422, 'gecersiz', $e->getMessage(), $ek);
    if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'cakisma|')) {
        hata(409, 'cakisma', 'Bu kayit baska bir yerde degismis. Guncel hali yuklendi.', $ek + ['guncel' => json_decode(substr($e->getMessage(), 8))]);
    }
    if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'yok|')) hata(404, 'yok', 'Kayit bulunamadi.', $ek);
    if ($e instanceof PDOException && (str_contains($e->getMessage(), 'UNIQUE') || str_contains($e->getMessage(), 'Duplicate'))) {
        hata(409, 'ayni_ad', 'Ayni ad (ve kurum) ile bir musteri zaten var.', $ek);
    }
    if ($e instanceof PDOException && mesgul_mu($e)) hata(503, 'mesgul', 'Sunucu mesgul; yeniden dene.', $ek);
    if ($e instanceof PDOException && preg_match('/max_allowed_packet|packet bigger|1153/i', $e->getMessage())) {
        hata(503, 'veritabani_sinir', 'Veri MySQL paket sinirini (max_allowed_packet) asti; hosting panelinden artirilmali.', $ek);
    }
    hata(500, 'sunucu', 'Kayit yazilamadi.', $ek);
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
/** Anlik kopya (islem icinde cagrilir). En yeni 30 kopya kalir; sira hep artan sayactan (ayni saniyede de dogru sira). */
function anlik_al(string $neden): string {
    $paket = veri_paketi();
    $id = yeni_id();
    $s = sayilar($paket);
    calistir('INSERT INTO anliklar (id, sira, zaman, neden, ozet, veri) VALUES (?, ?, ?, ?, ?, ?)',
        [$id, yeni_surum(), simdi(), $neden, sprintf('%d musteri, %d icerik, %d etkinlik', $s['musteri'], $s['icerik'], $s['etkinlik']), anlik_paketle($paket)]);
    foreach (array_slice(hepsi('SELECT id FROM anliklar ORDER BY sira DESC'), 30) as $r) calistir('DELETE FROM anliklar WHERE id = ?', [$r['id']]);
    return $id;
}

/** Ice aktarmada taninan alanlar; digerleri yok sayilir ve onizlemede uyari olarak gosterilir. */
const BILINEN_ALT_ALANLAR = [
    'siklik' => ['tur', 'haftalikAdet', 'gunler', 'gunTurleri', 'baslangic'],
    'dosyalar' => ['ham', 'proje', 'final'],
];
const BILINEN_AYAR = ['id', 'surum', 'olusturma', 'guncelleme', 'varsayilanStokUyari'];
const BILINEN_ALANLAR = [
    'musteri' => ['id', 'surum', 'olusturma', 'guncelleme', 'ad', 'kurum', 'ucret', 'siklik', 'slotTuru', 'slotIstisna', 'stokUyari', 'stokGirisi', 'not', 'arsiv'],
    'etkinlik' => ['id', 'surum', 'olusturma', 'guncelleme', 'musteriId', 'musteriAdi', 'musteriKurum', 'baslik', 'tur', 'tumGun', 'basTarih', 'basSaat', 'bitTarih', 'bitSaat', 'konum', 'not', 'durum', 'arsiv'],
    'icerik' => ['id', 'surum', 'olusturma', 'guncelleme', 'musteriId', 'musteriAdi', 'musteriKurum', 'baslik', 'tur', 'durum', 'oncelik', 'cekimId', 'teslimTarihi', 'planTarihi', 'yayinTarihi', 'revizyonNotu', 'dosyalar', 'not', 'gecmis', 'arsiv'],
];

/**
 * Ice aktarma plani. $kip: birlestir (yalniz yenileri ekle, var olanlara dokunma) | degistir (tumunu bu dosyayla degistir).
 * - Kimligi (id) olan kayit (yedek) yalniz kimligine gore eslenir: veritabaninda varsa atlanir, yoksa ayni kimlikle eklenir.
 *   Ayni dosyada ayni kimlik iki kez gecerse hata. Boylece yedekten geri yuklemede hicbir kayit "benzer" diye elenmez.
 * - Kimliksiz kayit (elle hazirlanmis liste) dogal anahtarla veritabanindaki kayitlara ve dosyadaki onceki kimliksiz
 *   satirlara karsi denetlenir (ayni satir iki kez eklenmez).
 * - Musteri ad + kurum veritabaninda tekil oldugundan: ayni musteri veritabaninda varsa ona baglanir ve atlanir;
 *   ayni dosyada iki kez geciyorsa hata.
 * - Icerik / etkinlik musteriye musteriId (dosyadaki kimlik) ya da musteriAdi (+ musteriKurum) ile baglanir.
 *   musteriKurum verilmisse (bos da olsa) ad + kurum tam eslesmeli; verilmemisse ad yalniz tek bir musteriye uyuyorsa baglanir.
 * - degistir kipinde yedekteki ayar kaydi da geri yuklenir.
 */
function ice_aktarma_plani(array $gelen, string $kip): array {
    global $ETK_MUSTERI;
    $mevcut = $kip === 'degistir' ? [] : tum_kayitlar();
    $var = tur_haritasi($mevcut);
    $dbDogal = [];
    $musteriAd = [];     // norm(ad)|norm(kurum) => id
    $adIndeks = [];      // norm(ad) => [norm(ad)|norm(kurum), ...] (ayni adli adaylar)
    $musteriAdlari = []; // id => "ad · kurum" (onizlemede baglantiyi gostermek icin)
    foreach ($mevcut as $r) {
        $v = json_decode((string)$r['veri'], true) ?: [];
        $t = (string)$r['tur'];
        if ($t === 'ayar') continue;
        $dbDogal[dogal($t, $v)] = (string)$r['id'];
        if ($t === 'musteri') {
            $ak = norm((string)$v['ad']) . '|' . norm((string)($v['kurum'] ?? ''));
            $musteriAd[$ak] = (string)$r['id'];
            $adIndeks[norm((string)$v['ad'])][] = $ak;
            $musteriAdlari[(string)$r['id']] = (string)$v['ad'] . (($v['kurum'] ?? '') !== '' ? ' · ' . $v['kurum'] : '');
        }
    }
    $plan = ['ekle' => [], 'atla' => [], 'hatalar' => [], 'uyarilar' => [],
        'sayilar' => ['musteri' => 0, 'icerik' => 0, 'etkinlik' => 0, 'atlanan' => 0],
        'ucret' => ['bilinen' => 0, 'belirsiz' => 0, 'toplam' => 0]];
    $idEslem = [];      // dosyadaki kimlik => son kimlik
    $dosyaIdleri = [];  // bu dosyada gorulen kimlikler
    $dosyaMusteri = []; // bu dosyada eklenecek musterilerin dogal anahtari
    $dosyaDogal = [];   // bu dosyada eklenecek kimliksiz etkinlik / iceriklerin dogal anahtari
    $bilinmeyen = [];   // "alan" => sayi
    $sira = ['musteri' => 'musteriler', 'etkinlik' => 'etkinlikler', 'icerik' => 'icerikler'];
    foreach ($sira as $tur => $alan) {
        $liste = $gelen[$alan] ?? [];
        if (!is_array($liste)) { $plan['hatalar'][] = "$alan liste olmali"; continue; }
        if (count($liste) > LISTE_SINIRI) { $plan['hatalar'][] = "$alan cok uzun (en cok " . LISTE_SINIRI . ')'; continue; }
        foreach (array_values($liste) as $i => $k) {
            $etiket = $alan . '[' . ($i + 1) . ']';
            if (!is_array($k)) { $plan['hatalar'][] = "$etiket kayit degil"; continue; }
            foreach (array_keys($k) as $ak) {
                if (!in_array((string)$ak, BILINEN_ALANLAR[$tur], true)) { $bk = "$alan." . mb_substr((string)$ak, 0, 40); $bilinmeyen[$bk] = ($bilinmeyen[$bk] ?? 0) + 1; }
                elseif (isset(BILINEN_ALT_ALANLAR[$ak]) && is_array($k[$ak])) {
                    foreach (array_keys($k[$ak]) as $alt) {
                        if (!in_array((string)$alt, BILINEN_ALT_ALANLAR[$ak], true)) { $bk = "$alan.$ak." . mb_substr((string)$alt, 0, 40); $bilinmeyen[$bk] = ($bilinmeyen[$bk] ?? 0) + 1; }
                    }
                }
            }
            $eskiId = isset($k['id']) && id_bicim($k['id']) ? (string)$k['id'] : null;
            if ($eskiId !== null) {
                if (isset($dosyaIdleri[$eskiId])) { $plan['hatalar'][] = "$etiket: ayni kimlik dosyada iki kez"; continue; }
                $dosyaIdleri[$eskiId] = 1;
                // zaten var olan kayit: dokunulmaz, bugunku kurallara gore yeniden dogrulanmaz (eski yedek birlestirilebilir)
                if (isset($var[$eskiId])) {
                    if ($var[$eskiId] !== $tur) { $plan['hatalar'][] = "$etiket: bu kimlik baska turde bir kayda ait"; continue; }
                    $ad0 = (string)($k[$tur === 'musteri' ? 'ad' : 'baslik'] ?? $eskiId);
                    $plan['atla'][] = ['tur' => $tur, 'ad' => mb_substr($ad0, 0, 120), 'neden' => 'ayni kayit zaten var'];
                    $idEslem[$eskiId] = $eskiId;
                    $plan['sayilar']['atlanan']++;
                    continue;
                }
            }
            if ($tur !== 'musteri') {
                $mid = $k['musteriId'] ?? null;
                if (is_string($mid) && $mid !== '' && isset($idEslem[$mid])) {
                    $k['musteriId'] = $idEslem[$mid];
                } elseif ((!is_string($mid) || $mid === '') && isset($k['musteriAdi']) && is_string($k['musteriAdi']) && trim($k['musteriAdi']) !== '') {
                    $ad = norm($k['musteriAdi']);
                    $bulunan = null;
                    if (array_key_exists('musteriKurum', $k) && $k['musteriKurum'] !== null) {
                        $kurum = is_string($k['musteriKurum']) ? norm($k['musteriKurum']) : '';
                        $bulunan = $musteriAd[$ad . '|' . $kurum] ?? null;
                    } else {
                        $adaylar = $adIndeks[$ad] ?? [];
                        if (count($adaylar) > 1) { $plan['hatalar'][] = "$etiket: ayni adda birden cok musteri var, musteriKurum ekle (" . mb_substr($k['musteriAdi'], 0, 60) . ')'; continue; }
                        if (count($adaylar) === 1) $bulunan = $musteriAd[$adaylar[0]];
                    }
                    if ($bulunan === null) { $plan['hatalar'][] = "$etiket: musteri bulunamadi (" . mb_substr($k['musteriAdi'], 0, 60) . ')'; continue; }
                    $k['musteriId'] = $bulunan;
                }
                if ($tur === 'icerik' && is_string($k['cekimId'] ?? null) && isset($idEslem[$k['cekimId']])) $k['cekimId'] = $idEslem[$k['cekimId']];
                // baska musterinin cekimine bagli icerik: dosya reddedilmez, bag kaldirilir ve uyarilir
                if ($tur === 'icerik' && is_string($k['cekimId'] ?? null) && $k['cekimId'] !== '' && ($ETK_MUSTERI[$k['cekimId']] ?? null) !== null
                    && is_string($k['musteriId'] ?? null) && $ETK_MUSTERI[$k['cekimId']] !== $k['musteriId']) {
                    $plan['uyarilar'][] = "$etiket: bagli cekim baska musteriye ait; bag kaldirilacak";
                    $k['cekimId'] = null;
                }
            }
            try {
                $temiz = temizle($tur, $k, $var);
            } catch (InvalidArgumentException $e) {
                $plan['hatalar'][] = "$etiket: " . $e->getMessage();
                continue;
            }
            $ad = $tur === 'musteri' ? $temiz['ad'] : $temiz['baslik'];
            $d = dogal($tur, $temiz);
            if ($tur === 'musteri') {
                if (isset($dosyaMusteri[$d])) { $plan['hatalar'][] = "$etiket: ayni musteri (ad + kurum) dosyada iki kez"; continue; }
                if (isset($dbDogal[$d])) {
                    $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => 'ayni ad ve kurumla musteri zaten var'];
                    if ($eskiId !== null) $idEslem[$eskiId] = $dbDogal[$d];
                    $plan['sayilar']['atlanan']++;
                    continue;
                }
                $dosyaMusteri[$d] = 1;
            } elseif ($eskiId === null && (isset($dbDogal[$d]) || isset($dosyaDogal[$d]))) {
                $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => isset($dbDogal[$d]) ? 'mukerrer (ayni ad / tarih zaten var)' : 'dosyada ayni satir iki kez'];
                $plan['sayilar']['atlanan']++;
                continue;
            }
            if ($eskiId === null && $tur !== 'musteri') $dosyaDogal[$d] = 1;
            $yeni = $eskiId ?? yeni_id();
            if ($eskiId !== null) $idEslem[$eskiId] = $yeni;
            $var[$yeni] = $tur;
            if ($tur === 'etkinlik') $ETK_MUSTERI[$yeni] = $temiz['musteriId'];
            if ($tur === 'musteri') {
                $ak = norm($temiz['ad']) . '|' . norm($temiz['kurum']);
                $musteriAd[$ak] = $yeni;
                $adIndeks[norm($temiz['ad'])][] = $ak;
                $musteriAdlari[$yeni] = $temiz['ad'] . ($temiz['kurum'] !== '' ? ' · ' . $temiz['kurum'] : '');
                if ($temiz['ucret'] === null) $plan['ucret']['belirsiz']++;
                else { $plan['ucret']['bilinen']++; $plan['ucret']['toplam'] += $temiz['ucret']; }
            }
            $bag = $tur === 'musteri' ? null : ($temiz['musteriId'] !== null ? ($musteriAdlari[$temiz['musteriId']] ?? null) : null);
            $ek = $tur === 'musteri' ? ['ucret' => $temiz['ucret'], 'siklik' => $temiz['siklik']['tur']] : [];
            $plan['ekle'][] = ['tur' => $tur, 'id' => $yeni, 'veri' => $temiz, 'ad' => $ad, 'bag' => $bag, 'ek' => $ek,
                'olusturma' => isset($k['olusturma']) && is_int($k['olusturma']) && $k['olusturma'] > 0 ? $k['olusturma'] : null];
            $plan['sayilar'][$tur]++;
        }
    }
    foreach ($bilinmeyen as $bk => $n) $plan['uyarilar'][] = "bilinmeyen alan '$bk' ($n kayit): yok sayilacak";
    // degistir: yedekteki ayar kaydi da geri gelir
    $plan['ayar'] = null;
    if ($kip === 'degistir' && isset($gelen['ayar']) && is_array($gelen['ayar'])) {
        foreach (array_keys($gelen['ayar']) as $ak) if (!in_array((string)$ak, BILINEN_AYAR, true)) $plan['uyarilar'][] = "bilinmeyen alan 'ayar." . mb_substr((string)$ak, 0, 40) . "': yok sayilacak";
        try { $plan['ayar'] = temizle('ayar', $gelen['ayar'], $var); }
        catch (InvalidArgumentException $e) { $plan['hatalar'][] = 'ayar: ' . $e->getMessage(); }
    }
    return $plan;
}
/** Verinin "durumu": her yazmada artan sayac. Onizleme ile uygulama arasinda degistiyse onizleme eskidir. */
function veri_durumu(): int { return (int)(tek("SELECT deger FROM sayac WHERE ad = 'surum'")['deger'] ?? 0); }
function plan_ozeti(array $plan, string $kip): array {
    $o = ['kip' => $kip, 'sayilar' => $plan['sayilar'], 'ucret' => $plan['ucret'], 'hatalar' => array_slice($plan['hatalar'], 0, 100),
        'hataSayisi' => count($plan['hatalar']), 'uyarilar' => array_slice($plan['uyarilar'], 0, 50), 'atla' => array_slice($plan['atla'], 0, 200),
        'ekle' => array_map(fn($e) => ['tur' => $e['tur'], 'ad' => $e['ad'], 'bag' => $e['bag']] + $e['ek'], array_slice($plan['ekle'], 0, 500)),
        'ayar' => $plan['ayar'] !== null, 'durum' => veri_durumu()];
    if ($kip === 'degistir') $o['kaldirilacak'] = sayilar(veri_paketi());
    return $o;
}

/** Kayitlari (yeniden) yazar; surum numaralari sayactan gelir, hic tekrarlanmaz. Islem icinde cagrilir. */
function kayitlari_ekle(array $ekle): void {
    $n = simdi();
    foreach ($ekle as $e) {
        calistir('INSERT INTO kayitlar (id, tur, anahtar, veri, surum, olusturma, guncelleme) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$e['id'], $e['tur'], anahtar($e['tur'], $e['veri']), json_metin($e['veri']), yeni_surum(), $e['olusturma'] ?? $n, $n]);
    }
}

/* ---------------- Islemler ---------------- */

try {
    // Oturum gerektirmeyenler
    if ($islem === 'oturum') {
        basari(['girisli' => $oturumlu, 'kurulu' => sifre_ozeti() !== '']);
    }
    if ($islem === 'giris') {
        if (sifre_ozeti() === '') hata(503, 'kurulum', 'Giris sifresi henuz ayarlanmadi.');
        $sifre = $G['sifre'] ?? '';
        $cihaz = cihaz_ozeti();
        $dogrulanan = is_string($sifre) ? sifre_dene($sifre, $cihaz) : null;
        if ($dogrulanan === null) hata(401, 'sifre', 'Sifre yanlis.');
        // oturum, yazma kilidi altinda ve sifre bu arada degismediyse acilir (sifre degisikligiyle yaris olmaz).
        // Saklanan parmak izi de denetlenir: bu istek config.php'nin eski halini okumus olabilir; bu arada yeni
        // ozetle gelen bir istek oturumlari temizlediyse eski sifreyle acilan oturum temizligin ardindan kalmasin.
        $tamam = islem(function () use ($dogrulanan, $cihaz) {
            if (sifre_ozeti() !== $dogrulanan || ayar_oku('sifre_izi') !== sifre_izi($dogrulanan)) return false;
            oturum_ac();
            cihaz_tani($cihaz);
            return true;
        });
        if (!$tamam) hata(401, 'sifre', 'Sifre yanlis.');
        basari(['girisli' => true]);
    }

    // Bundan sonrasi oturum ister
    if (!$oturumlu) hata(401, 'oturum', 'Giris gerekli.');

    switch ($islem) {
        case 'cikis':
            $t = cerez_oku('oturum');
            if ($t !== '') calistir('DELETE FROM oturumlar WHERE ozet = ?', [hash('sha256', $t)]);
            cerez_yaz('oturum', '', 0);
            basari();

        case 'veri':
            basari(['veri' => veri_paketi(), 'sunucuZamani' => simdi(), 'surum' => STUDIO_SURUM]);

        case 'kaydet':
            try {
                $k = islem(function () use ($G) {
                    $var = tur_haritasi(tum_kayitlar());
                    return kayit_yaz((string)($G['tur'] ?? ''), isset($G['id']) ? (string)$G['id'] : null, is_array($G['veri'] ?? null) ? $G['veri'] : [],
                        isset($G['surum']) ? (int)$G['surum'] : null, $var);
                });
            } catch (Throwable $e) {
                yaz_hatasi($e);
            }
            basari(['kayit' => $k]);

        case 'toplu':
            $liste = $G['kayitlar'] ?? null;
            if (!is_array($liste) || count($liste) === 0 || count($liste) > 500) hata(422, 'gecersiz', 'kayitlar 1-500 ogeli liste olmali.');
            $sira = 0;
            try {
                $sonuc = islem(function () use ($liste, &$sira) {
                    $var = tur_haritasi(tum_kayitlar());
                    $out = [];
                    foreach (array_values($liste) as $i => $k) {
                        $sira = $i;
                        if (!is_array($k)) throw new InvalidArgumentException('kayit degil');
                        $out[] = kayit_yaz((string)($k['tur'] ?? ''), isset($k['id']) ? (string)$k['id'] : null, is_array($k['veri'] ?? null) ? $k['veri'] : [],
                            isset($k['surum']) ? (int)$k['surum'] : null, $var);
                    }
                    return $out;
                });
            } catch (Throwable $e) {
                yaz_hatasi($e, $sira);
            }
            basari(['kayitlar' => $sonuc]);

        case 'ice_aktar':
            $kip = ($G['kip'] ?? 'birlestir') === 'degistir' ? 'degistir' : 'birlestir';
            $gelen = $G['veriler'] ?? null;
            if (!is_array($gelen)) hata(422, 'gecersiz', 'veriler eksik.');
            if (!empty($G['onizleme'])) basari(['onizleme' => plan_ozeti(ice_aktarma_plani($gelen, $kip), $kip)]);
            if ($kip === 'degistir' && ($G['onay'] ?? '') !== 'GERI YUKLE') hata(422, 'onay', 'Tum verinin degistirilmesi icin onay gerekli.');
            $beklenen = is_array($G['beklenen'] ?? null) ? $G['beklenen'] : null;
            try {
                // Plan, yazma kilidi altinda yeniden hesaplanir (arada baska cihaz yazmis olabilir)
                $sonuc = islem(function () use ($gelen, $kip, $beklenen) {
                    $durumOnce = veri_durumu();
                    $plan = ice_aktarma_plani($gelen, $kip);
                    $ozet = plan_ozeti($plan, $kip);
                    if (count($plan['hatalar']) > 0) throw new RuntimeException('plan|' . json_encode($ozet, JSON_UNESCAPED_UNICODE));
                    if ($beklenen !== null) {
                        $eskimis = isset($beklenen['durum']) && (int)$beklenen['durum'] !== $durumOnce;
                        foreach (['musteri', 'icerik', 'etkinlik', 'atlanan'] as $k) {
                            if (isset($beklenen[$k]) && (int)$beklenen[$k] !== $plan['sayilar'][$k]) $eskimis = true;
                        }
                        if ($eskimis) throw new RuntimeException('onizleme_eski|' . json_encode($ozet, JSON_UNESCAPED_UNICODE));
                    }
                    $a = anlik_al($kip === 'degistir' ? 'geri_yukleme_oncesi' : 'ice_aktarma_oncesi');
                    if ($kip === 'degistir') calistir($plan['ayar'] !== null ? 'DELETE FROM kayitlar' : "DELETE FROM kayitlar WHERE tur <> 'ayar'");
                    kayitlari_ekle($plan['ekle']);
                    if ($plan['ayar'] !== null) kayitlari_ekle([['tur' => 'ayar', 'id' => 'ayar', 'veri' => $plan['ayar']]]);
                    return ['ozet' => $ozet, 'anlik' => $a];
                });
            } catch (Throwable $e) {
                if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'plan|')) {
                    hata(422, 'gecersiz', 'Dosyada hatali kayitlar var; once onizlemede duzelt.', ['onizleme' => json_decode(substr($e->getMessage(), 5))]);
                }
                if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'onizleme_eski|')) {
                    hata(409, 'onizleme_eski', 'Veri onizlemeden sonra degisti; onizlemeyi yenile.', ['onizleme' => json_decode(substr($e->getMessage(), 14))]);
                }
                yaz_hatasi($e);
            }
            basari(['sonuc' => $sonuc['ozet'], 'anlik' => $sonuc['anlik']]);

        case 'disa_aktar':
            basari(['yedek' => ['format' => 'suflo-studio-yedek', 'surum' => STUDIO_SURUM, 'olusturma' => gmdate('c'), 'veriler' => veri_paketi()]]);

        case 'anliklar':
            $r = hepsi('SELECT id, zaman, neden, ozet FROM anliklar ORDER BY sira DESC');
            basari(['anliklar' => array_map(fn($x) => ['id' => $x['id'], 'zaman' => (int)$x['zaman'], 'neden' => $x['neden'], 'ozet' => $x['ozet']], $r)]);

        case 'anlik_geri':
            if (($G['onay'] ?? '') !== 'GERI YUKLE') hata(422, 'onay', 'Onay gerekli.');
            $r = tek('SELECT veri FROM anliklar WHERE id = ?', [(string)($G['id'] ?? '')]);
            if (!$r) hata(404, 'yok', 'Anlik kopya bulunamadi.');
            $paket = anlik_coz((string)$r['veri']);
            $ekle = [];
            $gruplar = ['musteri' => $paket['musteriler'] ?? [], 'etkinlik' => $paket['etkinlikler'] ?? [], 'icerik' => $paket['icerikler'] ?? [],
                'ayar' => isset($paket['ayar']) && is_array($paket['ayar']) ? [$paket['ayar']] : []];
            foreach ($gruplar as $tur => $l) {
                foreach ($l as $x) {
                    $v = $x;
                    unset($v['id'], $v['surum'], $v['olusturma'], $v['guncelleme']);
                    $ekle[] = ['tur' => $tur, 'id' => (string)$x['id'], 'veri' => $v, 'olusturma' => (int)($x['olusturma'] ?? 0) ?: null];
                }
            }
            try {
                $yeniAnlik = islem(function () use ($ekle) {
                    $a = anlik_al('anlik_geri_oncesi');
                    calistir('DELETE FROM kayitlar');
                    kayitlari_ekle($ekle);
                    return $a;
                });
            } catch (Throwable $e) {
                yaz_hatasi($e);
            }
            basari(['anlik' => $yeniAnlik]);

        case 'sifre_degistir':
            $eski = $G['eski'] ?? '';
            $yeni = $G['yeni'] ?? '';
            $cihazSd = cihaz_ozeti();
            if (!is_string($eski) || sifre_dene($eski, $cihazSd) === null) hata(401, 'sifre', 'Mevcut sifre yanlis.');
            if (!is_string($yeni) || mb_strlen($yeni) < 12 || strlen($yeni) > 1024) hata(422, 'gecersiz', 'Yeni sifre en az 12 karakter olmali.');
            islem(function () use ($yeni) {
                global $C;
                ayar_yaz('password_hash', password_hash($yeni, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT));
                ayar_yaz('password_hash_kaynak', hash('sha256', (string)$C['password_hash']));
                calistir('DELETE FROM oturumlar');
                cihazlari_unut(); // calinmis bir cihaz cerezi kilitten muaf kalmasin
                ayar_yaz('sifre_izi', sifre_izi(sifre_ozeti()));
                oturum_ac();
                cihaz_tani(null);
            });
            basari();

        case 'oturumlari_kapat':
            islem(function () {
                calistir('DELETE FROM oturumlar');
                cihazlari_unut();
                cihaz_tani(null); // bu cihaz taninmaya devam eder (yeni anahtarla); digerleri unutulur
            });
            cerez_yaz('oturum', '', 0);
            basari();

        default:
            hata(400, 'islem', 'Bilinmeyen islem.');
    }
} catch (Throwable $e) {
    if ($e instanceof PDOException && mesgul_mu($e)) hata(503, 'mesgul', 'Sunucu mesgul; yeniden dene.');
    hata(500, 'sunucu', 'Sunucu hatasi.');
}
