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
const SEMA_SURUM = '2';
const GOVDE_SINIRI = 8 * 1024 * 1024;
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

$configPath = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/private/studio-v1/config.php';
if (!is_file($configPath)) {
    hata(503, 'kurulum', 'Suflo Studio sunucusu henuz yapilandirilmadi.');
}
$C = require $configPath;
if (!is_array($C)) hata(503, 'kurulum', 'Suflo Studio ayar dosyasi okunamadi.');
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
$uzunluk = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($uzunluk > GOVDE_SINIRI) hata(413, 'buyuk', 'Istek cok buyuk.');
$ham = (string)file_get_contents('php://input', false, null, 0, GOVDE_SINIRI + 1);
if (strlen($ham) > GOVDE_SINIRI) hata(413, 'buyuk', 'Istek cok buyuk.');
$G = json_decode($ham, true);
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

/** Tablolari bir kez kurar (ayar.sema surumu tutulur; her istekte DDL calismaz). */
function sema_kur(PDO $p): void {
    try {
        $s = $p->query("SELECT deger FROM ayar WHERE anahtar = 'sema'");
        $r = $s->fetch();
        $s->closeCursor();
        if ($r && (string)$r['deger'] === SEMA_SURUM) return;
    } catch (Throwable $e) { /* tablo yok: kurulacak */ }
    $my = mysql();
    $metin = $my ? 'LONGTEXT' : 'TEXT';
    $son = $my ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin' : '';
    try {
        $p->exec("CREATE TABLE IF NOT EXISTS kayitlar (id VARCHAR(40) NOT NULL PRIMARY KEY, tur VARCHAR(10) NOT NULL, anahtar CHAR(64) NULL, veri $metin NOT NULL, surum BIGINT NOT NULL, olusturma BIGINT NOT NULL, guncelleme BIGINT NOT NULL, UNIQUE (tur, anahtar))$son");
        $p->exec("CREATE TABLE IF NOT EXISTS oturumlar (ozet CHAR(64) NOT NULL PRIMARY KEY, olusturma BIGINT NOT NULL, son BIGINT NOT NULL)$son");
        $p->exec("CREATE TABLE IF NOT EXISTS cihazlar (ozet CHAR(64) NOT NULL PRIMARY KEY, olusturma BIGINT NOT NULL)$son");
        $p->exec("CREATE TABLE IF NOT EXISTS girisler (kim CHAR(24) NOT NULL PRIMARY KEY, ip CHAR(64) NOT NULL, cihaz CHAR(64) NULL, zaman BIGINT NOT NULL)$son");
        $p->exec("CREATE TABLE IF NOT EXISTS ayar (anahtar VARCHAR(64) NOT NULL PRIMARY KEY, deger $metin NOT NULL)$son");
        $p->exec("CREATE TABLE IF NOT EXISTS anliklar (id VARCHAR(40) NOT NULL PRIMARY KEY, sira BIGINT NOT NULL, zaman BIGINT NOT NULL, neden VARCHAR(40) NOT NULL, ozet VARCHAR(255) NOT NULL, veri $metin NOT NULL)$son");
        $p->exec("CREATE TABLE IF NOT EXISTS sayac (ad VARCHAR(32) NOT NULL PRIMARY KEY, deger BIGINT NOT NULL)$son");
        if (!$my) $p->exec('CREATE INDEX IF NOT EXISTS giris_zaman ON girisler (zaman)');
        elseif (!tek("SELECT 1 AS v FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'girisler' AND index_name = 'giris_zaman'")) {
            $p->exec('CREATE INDEX giris_zaman ON girisler (zaman)');
        }
        if (!tek("SELECT deger FROM sayac WHERE ad = 'surum'")) calistir("INSERT INTO sayac (ad, deger) VALUES ('surum', 0)");
        calistir("DELETE FROM ayar WHERE anahtar = 'sema'");
        calistir("INSERT INTO ayar (anahtar, deger) VALUES ('sema', ?)", [SEMA_SURUM]);
    } catch (Throwable $e) {
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
/** Islem: SQLite'ta yazma kilidi bastan alinir (BEGIN IMMEDIATE), hata olursa geri alinir. */
function islem(callable $f) {
    $p = db();
    if (mysql()) $p->beginTransaction(); else $p->exec('BEGIN IMMEDIATE');
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
    if ($n - (int)$r['son'] > 300) calistir('UPDATE oturumlar SET son = ? WHERE ozet = ?', [$n, $oz]);
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
/** Taninan cihaz: daha once dogru sifreyle girilmis cihaz. Yalniz hatali giris kilidini asmaya yarar, erisim vermez. */
function cihaz_ozeti(): ?string {
    $t = cerez_oku('cihaz');
    if ($t === '') return null;
    $oz = hash('sha256', $t);
    return tek('SELECT 1 AS v FROM cihazlar WHERE ozet = ?', [$oz]) ? $oz : null;
}
function cihaz_tani(?string $mevcut): void {
    if ($mevcut !== null) return;
    $t = rastgele_anahtar();
    calistir('INSERT INTO cihazlar (ozet, olusturma) VALUES (?, ?)', [hash('sha256', $t), simdi()]);
    calistir('DELETE FROM cihazlar WHERE olusturma < ?', [simdi() - CIHAZ_OMRU]);
    cerez_yaz('cihaz', $t, CIHAZ_OMRU);
}
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
 * toplam sinira. Dogruysa deneme kaydi silinir. Doner: true (dogru) | false (yanlis); kilitliyse 429 ile cikar.
 */
function sifre_dene(string $sifre, ?string $cihaz): bool {
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
    if ($kilit) hata(429, 'kilit', 'Cok fazla hatali deneme. Biraz sonra yeniden dene.');
    $ozet = sifre_ozeti();
    $dogru = $ozet !== '' && strlen($sifre) <= 1024 && password_verify($sifre, $ozet);
    if ($dogru) { calistir('DELETE FROM girisler WHERE kim = ?', [$kim]); return true; }
    usleep(400000);
    return false;
}

/* ---------------- Dogrulama ---------------- */

function norm(string $s): string {
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
function temizle(string $tur, array $v, array $var): array {
    if ($tur === 'musteri') {
        $s = is_array($v['siklik'] ?? null) ? $v['siklik'] : [];
        $gunler = [];
        foreach ((array)($s['gunler'] ?? []) as $g) {
            $g = tamsayi($g, 1, 7, 'siklik.gunler');
            if ($g !== null && !in_array($g, $gunler, true)) $gunler[] = $g;
        }
        sort($gunler);
        // Haftalik duzende gune ozel beklenen tur (istege bagli): yalniz secili gunler icin
        $gunTurleri = [];
        foreach ((is_array($s['gunTurleri'] ?? null) ? $s['gunTurleri'] : []) as $g => $t) {
            $g = tamsayi(is_int($g) ? $g : (string)$g, 1, 7, 'siklik.gunTurleri');
            if ($g !== null && in_array($g, $gunler, true) && $t !== null && $t !== '') {
                $gunTurleri[(string)$g] = secim($t, ['video', 'post', 'story', 'diger'], 'video', 'siklik.gunTurleri');
            }
        }
        ksort($gunTurleri);
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
        $d = is_array($v['dosyalar'] ?? null) ? $v['dosyalar'] : [];
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
function tur_haritasi(array $satirlar): array {
    $m = [];
    foreach ($satirlar as $r) $m[(string)$r['id']] = (string)$r['tur'];
    return $m;
}
function disa(array $r): array {
    $v = json_decode((string)$r['veri'], true) ?: [];
    // bos nesne JSON'da {} kalsin (dizi [] olmasin)
    if (isset($v['siklik']) && is_array($v['siklik']) && array_key_exists('gunTurleri', $v['siklik'])) $v['siklik']['gunTurleri'] = (object)$v['siklik']['gunTurleri'];
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
            $yeniSurum = yeni_surum();
            $degisen = $surum === null ? 0 : calistir('UPDATE kayitlar SET veri = ?, anahtar = ?, surum = ?, guncelleme = ? WHERE id = ? AND surum = ?',
                [json_metin($temiz), $anahtar, $yeniSurum, $n, $id, $surum]);
            if ($degisen !== 1) {
                $guncel = tek('SELECT tur, surum, veri, olusturma, guncelleme FROM kayitlar WHERE id = ?', [$id]);
                throw new RuntimeException('cakisma|' . json_encode(disa(array_merge($guncel ?: $mevcut, ['id' => $id])), JSON_UNESCAPED_UNICODE));
            }
            return array_merge($temiz, ['id' => $id, 'surum' => $yeniSurum, 'olusturma' => (int)$mevcut['olusturma'], 'guncelleme' => $n]);
        }
        if ($tur !== 'ayar' && $surum !== null) throw new RuntimeException('yok|');
    } else {
        $id = yeni_id();
    }
    $yeniSurum = yeni_surum();
    calistir('INSERT INTO kayitlar (id, tur, anahtar, veri, surum, olusturma, guncelleme) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [$id, $tur, $anahtar, json_metin($temiz), $yeniSurum, $n, $n]);
    $var[$id] = $tur;
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
    hata(500, 'sunucu', 'Kayit yazilamadi.', $ek);
}
function mesgul_mu(Throwable $e): bool {
    return (bool)preg_match('/database is locked|database table is locked|Lock wait timeout|Deadlock/i', $e->getMessage());
}

/** Anlik kopya (islem icinde cagrilir). En yeni 30 kopya kalir; sira hep artan sayactan (ayni saniyede de dogru sira). */
function anlik_al(string $neden): string {
    $paket = veri_paketi();
    $id = yeni_id();
    $s = sayilar($paket);
    calistir('INSERT INTO anliklar (id, sira, zaman, neden, ozet, veri) VALUES (?, ?, ?, ?, ?, ?)',
        [$id, yeni_surum(), simdi(), $neden, sprintf('%d musteri, %d icerik, %d etkinlik', $s['musteri'], $s['icerik'], $s['etkinlik']), json_metin($paket)]);
    foreach (array_slice(hepsi('SELECT id FROM anliklar ORDER BY sira DESC'), 30) as $r) calistir('DELETE FROM anliklar WHERE id = ?', [$r['id']]);
    return $id;
}

/**
 * Ice aktarma plani. $kip: birlestir (yalniz yenileri ekle, var olanlara dokunma) | degistir (tumunu bu dosyayla degistir).
 * - Kimligi (id) olan kayit (yedek) yalniz kimligine gore eslenir: veritabaninda varsa atlanir, yoksa ayni kimlikle eklenir.
 *   Ayni dosyada ayni kimlik iki kez gecerse hata. Boylece yedekten geri yuklemede hicbir kayit "benzer" diye elenmez.
 * - Kimliksiz kayit (elle hazirlanmis liste) dogal anahtarla yalniz veritabanindaki kayitlara karsi denetlenir.
 * - Musteri ad + kurum veritabaninda tekil oldugundan: ayni musteri veritabaninda varsa ona baglanir ve atlanir;
 *   ayni dosyada iki kez geciyorsa hata.
 * - Icerik / etkinlik musteriye musteriId (dosyadaki kimlik) ya da musteriAdi (+ musteriKurum) ile baglanir.
 *   musteriKurum verilmisse tam eslesme gerekir; verilmemisse ad yalniz tek bir musteriye uyuyorsa baglanir.
 */
function ice_aktarma_plani(array $gelen, string $kip): array {
    $mevcut = $kip === 'degistir' ? [] : tum_kayitlar();
    $var = tur_haritasi($mevcut);
    $dbDogal = [];
    $musteriAd = [];   // norm(ad)|norm(kurum) => id
    $musteriAdlari = []; // id => ad (onizlemede baglantiyi gostermek icin)
    foreach ($mevcut as $r) {
        $v = json_decode((string)$r['veri'], true) ?: [];
        $t = (string)$r['tur'];
        if ($t === 'ayar') continue;
        $dbDogal[dogal($t, $v)] = (string)$r['id'];
        if ($t === 'musteri') {
            $musteriAd[norm((string)$v['ad']) . '|' . norm((string)($v['kurum'] ?? ''))] = (string)$r['id'];
            $musteriAdlari[(string)$r['id']] = (string)$v['ad'];
        }
    }
    $plan = ['ekle' => [], 'atla' => [], 'hatalar' => [], 'sayilar' => ['musteri' => 0, 'icerik' => 0, 'etkinlik' => 0, 'atlanan' => 0]];
    $idEslem = [];      // dosyadaki kimlik => son kimlik
    $dosyaIdleri = [];  // bu dosyada gorulen kimlikler
    $dosyaMusteri = []; // bu dosyada eklenecek musterilerin dogal anahtari
    $sira = ['musteri' => 'musteriler', 'etkinlik' => 'etkinlikler', 'icerik' => 'icerikler'];
    foreach ($sira as $tur => $alan) {
        $liste = $gelen[$alan] ?? [];
        if (!is_array($liste)) { $plan['hatalar'][] = "$alan liste olmali"; continue; }
        if (count($liste) > 5000) { $plan['hatalar'][] = "$alan cok uzun"; continue; }
        foreach (array_values($liste) as $i => $k) {
            $etiket = $alan . '[' . ($i + 1) . ']';
            if (!is_array($k)) { $plan['hatalar'][] = "$etiket kayit degil"; continue; }
            $eskiId = isset($k['id']) && id_bicim($k['id']) ? (string)$k['id'] : null;
            if ($eskiId !== null) {
                if (isset($dosyaIdleri[$eskiId])) { $plan['hatalar'][] = "$etiket: ayni kimlik dosyada iki kez"; continue; }
                $dosyaIdleri[$eskiId] = 1;
            }
            if ($tur !== 'musteri') {
                $mid = $k['musteriId'] ?? null;
                if (is_string($mid) && $mid !== '' && isset($idEslem[$mid])) {
                    $k['musteriId'] = $idEslem[$mid];
                } elseif ((!is_string($mid) || $mid === '') && isset($k['musteriAdi']) && is_string($k['musteriAdi']) && trim($k['musteriAdi']) !== '') {
                    $ad = norm($k['musteriAdi']);
                    $kurum = is_string($k['musteriKurum'] ?? null) ? norm($k['musteriKurum']) : '';
                    $bulunan = null;
                    if (isset($musteriAd[$ad . '|' . $kurum])) $bulunan = $musteriAd[$ad . '|' . $kurum];
                    elseif ($kurum === '') {
                        $adaylar = array_values(array_filter(array_keys($musteriAd), fn($a) => explode('|', $a)[0] === $ad));
                        if (count($adaylar) > 1) { $plan['hatalar'][] = "$etiket: ayni adda birden cok musteri var, musteriKurum ekle (" . mb_substr($k['musteriAdi'], 0, 60) . ')'; continue; }
                        if (count($adaylar) === 1) $bulunan = $musteriAd[$adaylar[0]];
                    }
                    if ($bulunan === null) { $plan['hatalar'][] = "$etiket: musteri bulunamadi (" . mb_substr($k['musteriAdi'], 0, 60) . ')'; continue; }
                    $k['musteriId'] = $bulunan;
                }
                if ($tur === 'icerik' && is_string($k['cekimId'] ?? null) && isset($idEslem[$k['cekimId']])) $k['cekimId'] = $idEslem[$k['cekimId']];
            }
            try {
                $temiz = temizle($tur, $k, $var);
            } catch (InvalidArgumentException $e) {
                $plan['hatalar'][] = "$etiket: " . $e->getMessage();
                continue;
            }
            $ad = $tur === 'musteri' ? $temiz['ad'] : $temiz['baslik'];
            $d = dogal($tur, $temiz);
            if ($eskiId !== null && isset($var[$eskiId])) {
                if ($var[$eskiId] !== $tur) { $plan['hatalar'][] = "$etiket: bu kimlik baska turde bir kayda ait"; continue; }
                $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => 'ayni kayit zaten var'];
                $idEslem[$eskiId] = $eskiId;
                $plan['sayilar']['atlanan']++;
                continue;
            }
            if ($tur === 'musteri') {
                if (isset($dosyaMusteri[$d])) { $plan['hatalar'][] = "$etiket: ayni musteri (ad + kurum) dosyada iki kez"; continue; }
                if (isset($dbDogal[$d])) {
                    $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => 'ayni ad ve kurumla musteri zaten var'];
                    if ($eskiId !== null) $idEslem[$eskiId] = $dbDogal[$d];
                    $plan['sayilar']['atlanan']++;
                    continue;
                }
                $dosyaMusteri[$d] = 1;
            } elseif ($eskiId === null && isset($dbDogal[$d])) {
                $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => 'mukerrer (ayni ad / tarih)'];
                $plan['sayilar']['atlanan']++;
                continue;
            }
            $yeni = $eskiId ?? yeni_id();
            if ($eskiId !== null) $idEslem[$eskiId] = $yeni;
            $var[$yeni] = $tur;
            if ($tur === 'musteri') {
                $musteriAd[norm($temiz['ad']) . '|' . norm($temiz['kurum'])] = $yeni;
                $musteriAdlari[$yeni] = $temiz['ad'];
            }
            $bag = $tur === 'musteri' ? null : ($temiz['musteriId'] !== null ? ($musteriAdlari[$temiz['musteriId']] ?? null) : null);
            $plan['ekle'][] = ['tur' => $tur, 'id' => $yeni, 'veri' => $temiz, 'ad' => $ad, 'bag' => $bag,
                'olusturma' => isset($k['olusturma']) && is_int($k['olusturma']) && $k['olusturma'] > 0 ? $k['olusturma'] : null];
            $plan['sayilar'][$tur]++;
        }
    }
    return $plan;
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
        basari(['girisli' => oturum_gecerli(), 'kurulu' => sifre_ozeti() !== '']);
    }
    if ($islem === 'giris') {
        if (sifre_ozeti() === '') hata(503, 'kurulum', 'Giris sifresi henuz ayarlanmadi.');
        $sifre = $G['sifre'] ?? '';
        $cihaz = cihaz_ozeti();
        if (!is_string($sifre) || !sifre_dene($sifre, $cihaz)) hata(401, 'sifre', 'Sifre yanlis.');
        oturum_ac();
        cihaz_tani($cihaz);
        basari(['girisli' => true]);
    }

    // Bundan sonrasi oturum ister
    if (!oturum_gecerli()) hata(401, 'oturum', 'Giris gerekli.');

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
            $plan = ice_aktarma_plani($gelen, $kip);
            $ozet = ['kip' => $kip, 'sayilar' => $plan['sayilar'], 'hatalar' => array_slice($plan['hatalar'], 0, 100),
                'hataSayisi' => count($plan['hatalar']), 'atla' => array_slice($plan['atla'], 0, 200),
                'ekle' => array_map(fn($e) => ['tur' => $e['tur'], 'ad' => $e['ad'], 'bag' => $e['bag']], array_slice($plan['ekle'], 0, 500))];
            if ($kip === 'degistir') $ozet['kaldirilacak'] = sayilar(veri_paketi());
            if (!empty($G['onizleme'])) basari(['onizleme' => $ozet]);
            if (count($plan['hatalar']) > 0) hata(422, 'gecersiz', 'Dosyada hatali kayitlar var; once onizlemede duzelt.', ['onizleme' => $ozet]);
            if ($kip === 'degistir' && ($G['onay'] ?? '') !== 'GERI YUKLE') hata(422, 'onay', 'Tum verinin degistirilmesi icin onay gerekli.');
            try {
                $anlik = islem(function () use ($kip, $plan) {
                    $a = anlik_al($kip === 'degistir' ? 'geri_yukleme_oncesi' : 'ice_aktarma_oncesi');
                    if ($kip === 'degistir') calistir("DELETE FROM kayitlar WHERE tur <> 'ayar'");
                    kayitlari_ekle($plan['ekle']);
                    return $a;
                });
            } catch (Throwable $e) {
                yaz_hatasi($e);
            }
            basari(['sonuc' => $ozet, 'anlik' => $anlik]);

        case 'disa_aktar':
            basari(['yedek' => ['format' => 'suflo-studio-yedek', 'surum' => STUDIO_SURUM, 'olusturma' => gmdate('c'), 'veriler' => veri_paketi()]]);

        case 'anliklar':
            $r = hepsi('SELECT id, zaman, neden, ozet FROM anliklar ORDER BY sira DESC');
            basari(['anliklar' => array_map(fn($x) => ['id' => $x['id'], 'zaman' => (int)$x['zaman'], 'neden' => $x['neden'], 'ozet' => $x['ozet']], $r)]);

        case 'anlik_geri':
            if (($G['onay'] ?? '') !== 'GERI YUKLE') hata(422, 'onay', 'Onay gerekli.');
            $r = tek('SELECT veri FROM anliklar WHERE id = ?', [(string)($G['id'] ?? '')]);
            if (!$r) hata(404, 'yok', 'Anlik kopya bulunamadi.');
            $paket = json_decode((string)$r['veri'], true) ?: [];
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
            if (!is_string($eski) || !sifre_dene($eski, cihaz_ozeti())) hata(401, 'sifre', 'Mevcut sifre yanlis.');
            if (!is_string($yeni) || mb_strlen($yeni) < 12 || strlen($yeni) > 1024) hata(422, 'gecersiz', 'Yeni sifre en az 12 karakter olmali.');
            islem(function () use ($yeni) {
                global $C;
                ayar_yaz('password_hash', password_hash($yeni, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT));
                ayar_yaz('password_hash_kaynak', hash('sha256', (string)$C['password_hash']));
                calistir('DELETE FROM oturumlar');
            });
            oturum_ac();
            basari();

        case 'oturumlari_kapat':
            calistir('DELETE FROM oturumlar');
            cerez_yaz('oturum', '', 0);
            basari();

        default:
            hata(400, 'islem', 'Bilinmeyen islem.');
    }
} catch (Throwable $e) {
    if ($e instanceof PDOException && mesgul_mu($e)) hata(503, 'mesgul', 'Sunucu mesgul; yeniden dene.');
    hata(500, 'sunucu', 'Sunucu hatasi.');
}
