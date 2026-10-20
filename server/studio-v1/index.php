<?php
declare(strict_types=1);

/*
 * Suflo Studio API (tek kullanicili ozel icerik uretim ve ajans takip uygulamasi)
 *
 * - Suflo Pro lisans servisinden (pro-v1) TAMAMEN ayri: ayri config (private/studio-v1/config.php),
 *   ayri veritabani, ayri oturum cerezi. Pro lisansi burada hicbir yetki vermez.
 * - Her istek: POST + JSON, Origin izin listesinde, "X-Studio: 1" basligi (CSRF), giris disindaki
 *   her islemde sunucu tarafli oturum denetimi (HttpOnly, Secure, SameSite=Strict cerez).
 * - Veri: kayitlar tablosunda tur (musteri | icerik | etkinlik | ayar) basina beyaz listeli JSON.
 *   Silme yok, arsiv var. Iyimser surum denetimi (iki cihazda ayni kayit). Ice aktarma ve geri
 *   yuklemeden once otomatik anlik kopya.
 * - Gizli bilgi (sifre ozeti, veritabani sifresi) yalniz private config'te; yanitlara/gunluge girmez.
 */

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, private');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

const STUDIO_SURUM = 1;
const COOKIE_AD = 'suflo_studio';
const GOVDE_SINIRI = 8 * 1024 * 1024;
const TURLER = ['musteri', 'icerik', 'etkinlik', 'ayar'];

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
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    if (!$mysql) {
        $pdo->exec('PRAGMA journal_mode=WAL');
        $pdo->exec('PRAGMA busy_timeout=5000');
    }
    $metin = $mysql ? 'LONGTEXT' : 'TEXT';
    $pdo->exec("CREATE TABLE IF NOT EXISTS kayitlar (id VARCHAR(40) PRIMARY KEY, tur VARCHAR(20) NOT NULL, anahtar VARCHAR(255) NULL, veri $metin NOT NULL, surum INTEGER NOT NULL, olusturma BIGINT NOT NULL, guncelleme BIGINT NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS oturumlar (ozet CHAR(64) PRIMARY KEY, olusturma BIGINT NOT NULL, son BIGINT NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS girisler (ip CHAR(64) NOT NULL, zaman BIGINT NOT NULL, basarili INTEGER NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS ayar (anahtar VARCHAR(64) PRIMARY KEY, deger $metin NOT NULL)");
    $pdo->exec("CREATE TABLE IF NOT EXISTS anliklar (id VARCHAR(40) PRIMARY KEY, zaman BIGINT NOT NULL, neden VARCHAR(40) NOT NULL, ozet VARCHAR(255) NOT NULL, veri $metin NOT NULL)");
    try { $pdo->exec('CREATE UNIQUE INDEX kayit_anahtar ON kayitlar (tur, anahtar)'); } catch (Throwable $e) {}
    try { $pdo->exec('CREATE INDEX giris_zaman ON girisler (zaman)'); } catch (Throwable $e) {}
    return $pdo;
}

function ayar_oku(string $k): ?string {
    $s = db()->prepare('SELECT deger FROM ayar WHERE anahtar = ?');
    $s->execute([$k]);
    $r = $s->fetch();
    return $r ? (string)$r['deger'] : null;
}
function ayar_yaz(string $k, string $v): void {
    $p = db();
    $p->prepare('DELETE FROM ayar WHERE anahtar = ?')->execute([$k]);
    $p->prepare('INSERT INTO ayar (anahtar, deger) VALUES (?, ?)')->execute([$k, $v]);
}
function yeni_id(): string { return bin2hex(random_bytes(12)); }
function simdi(): int { return time(); }
function ip_ozet(): string { return hash('sha256', 'studio|' . (string)($_SERVER['REMOTE_ADDR'] ?? '')); }

/* ---------------- Oturum ---------------- */

function cerez_yaz(string $deger, int $omur): void {
    global $C;
    $yol = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/') . '/';
    setcookie(COOKIE_AD, $deger, [
        'expires' => $omur > 0 ? simdi() + $omur : 1,
        'path' => $yol,
        'secure' => (bool)$C['cookie_secure'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}
function oturum_gecerli(): bool {
    global $C;
    $t = (string)($_COOKIE[COOKIE_AD] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{40,64}$/', $t)) return false;
    $oz = hash('sha256', $t);
    $s = db()->prepare('SELECT olusturma, son FROM oturumlar WHERE ozet = ?');
    $s->execute([$oz]);
    $r = $s->fetch();
    if (!$r) return false;
    $n = simdi();
    if ($n - (int)$r['son'] > (int)$C['session_idle'] || $n - (int)$r['olusturma'] > (int)$C['session_max']) {
        db()->prepare('DELETE FROM oturumlar WHERE ozet = ?')->execute([$oz]);
        return false;
    }
    if ($n - (int)$r['son'] > 300) db()->prepare('UPDATE oturumlar SET son = ? WHERE ozet = ?')->execute([$n, $oz]);
    return true;
}
function oturum_ac(): void {
    global $C;
    $t = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $n = simdi();
    db()->prepare('INSERT INTO oturumlar (ozet, olusturma, son) VALUES (?, ?, ?)')->execute([hash('sha256', $t), $n, $n]);
    db()->prepare('DELETE FROM oturumlar WHERE son < ? OR olusturma < ?')->execute([$n - (int)$C['session_idle'], $n - (int)$C['session_max']]);
    cerez_yaz($t, (int)$C['session_max']);
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

function anahtar(string $tur, array $v): ?string {
    if ($tur === 'musteri') return mb_substr(norm($v['ad']) . '|' . norm($v['kurum']), 0, 255);
    return null;
}
/** Ice aktarmada mukerrer denetimi icin dogal anahtar (veritabaninda tekil zorlanmaz). */
function dogal(string $tur, array $v): string {
    if ($tur === 'musteri') return 'm|' . norm($v['ad']) . '|' . norm($v['kurum']);
    if ($tur === 'etkinlik') return 'e|' . norm($v['baslik']) . '|' . $v['basTarih'] . '|' . ($v['basSaat'] ?? '');
    if ($tur === 'icerik') return 'i|' . $v['musteriId'] . '|' . norm($v['baslik']) . '|' . $v['tur'] . '|' . ($v['planTarihi'] ?? '');
    return 'a|' . $tur;
}

/* ---------------- Kayit islemleri ---------------- */

function tum_kayitlar(): array {
    return db()->query('SELECT id, tur, veri, surum, olusturma, guncelleme FROM kayitlar')->fetchAll();
}
function tur_haritasi(array $satirlar): array {
    $m = [];
    foreach ($satirlar as $r) $m[(string)$r['id']] = (string)$r['tur'];
    return $m;
}
function disa(array $r): array {
    $v = json_decode((string)$r['veri'], true) ?: [];
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

/** Tek kayit yaz (islem icinde cagrilir). Hata: istisna. */
function kayit_yaz(string $tur, ?string $id, array $veri, ?int $surum, array &$var): array {
    if (!in_array($tur, TURLER, true)) throw new InvalidArgumentException('bilinmeyen tur');
    $temiz = temizle($tur, $veri, $var);
    $anahtar = anahtar($tur, $temiz);
    $p = db();
    $n = simdi();
    if ($tur === 'ayar') $id = 'ayar';
    if ($id !== null && $id !== '') {
        if ($tur !== 'ayar' && !id_bicim($id)) throw new InvalidArgumentException('gecersiz id');
        $s = $p->prepare('SELECT tur, surum, veri, olusturma, guncelleme FROM kayitlar WHERE id = ?');
        $s->execute([$id]);
        $mevcut = $s->fetch();
        if ($mevcut) {
            if ((string)$mevcut['tur'] !== $tur) throw new InvalidArgumentException('tur degistirilemez');
            if ($surum === null || (int)$mevcut['surum'] !== $surum) {
                throw new RuntimeException('cakisma|' . json_encode(disa(array_merge($mevcut, ['id' => $id])), JSON_UNESCAPED_UNICODE));
            }
            $yeniSurum = (int)$mevcut['surum'] + 1;
            $p->prepare('UPDATE kayitlar SET veri = ?, anahtar = ?, surum = ?, guncelleme = ? WHERE id = ?')
              ->execute([json_encode($temiz, JSON_UNESCAPED_UNICODE), $anahtar, $yeniSurum, $n, $id]);
            return array_merge($temiz, ['id' => $id, 'surum' => $yeniSurum, 'olusturma' => (int)$mevcut['olusturma'], 'guncelleme' => $n]);
        }
        if ($tur !== 'ayar' && $surum !== null) throw new RuntimeException('yok|');
    } else {
        $id = yeni_id();
    }
    $p->prepare('INSERT INTO kayitlar (id, tur, anahtar, veri, surum, olusturma, guncelleme) VALUES (?, ?, ?, ?, 1, ?, ?)')
      ->execute([$id, $tur, $anahtar, json_encode($temiz, JSON_UNESCAPED_UNICODE), $n, $n]);
    $var[$id] = $tur;
    return array_merge($temiz, ['id' => $id, 'surum' => 1, 'olusturma' => $n, 'guncelleme' => $n]);
}

function yaz_hatasi(Throwable $e, ?int $sira = null): void {
    $ek = $sira === null ? [] : ['sira' => $sira];
    if ($e instanceof InvalidArgumentException) hata(422, 'gecersiz', $e->getMessage(), $ek);
    if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'cakisma|')) {
        hata(409, 'cakisma', 'Bu kayit baska bir yerde degismis. Guncel hali yuklendi.', $ek + ['guncel' => json_decode(substr($e->getMessage(), 8), true)]);
    }
    if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'yok|')) hata(404, 'yok', 'Kayit bulunamadi.', $ek);
    if ($e instanceof PDOException && (str_contains($e->getMessage(), 'UNIQUE') || str_contains($e->getMessage(), 'Duplicate'))) {
        hata(409, 'ayni_ad', 'Ayni ad (ve kurum) ile bir musteri zaten var.', $ek);
    }
    hata(500, 'sunucu', 'Kayit yazilamadi.', $ek);
}

function anlik_al(string $neden): string {
    $paket = veri_paketi();
    $id = yeni_id();
    $ozet = sprintf('%d musteri, %d icerik, %d etkinlik', count($paket['musteriler']), count($paket['icerikler']), count($paket['etkinlikler']));
    db()->prepare('INSERT INTO anliklar (id, zaman, neden, ozet, veri) VALUES (?, ?, ?, ?, ?)')
        ->execute([$id, simdi(), $neden, $ozet, json_encode($paket, JSON_UNESCAPED_UNICODE)]);
    // en yeni 30 anlik kalir
    $eski = db()->query('SELECT id FROM anliklar ORDER BY zaman DESC, id DESC')->fetchAll();
    foreach (array_slice($eski, 30) as $r) db()->prepare('DELETE FROM anliklar WHERE id = ?')->execute([$r['id']]);
    return $id;
}

/**
 * Ice aktarma plani. $kip: birlestir (yeni olanlari ekle, var olanlara dokunma) | degistir (tumunu yedekle degistir).
 * Gelen kayitlarda id olabilir (yedek) ya da olmayabilir (elle hazirlanmis liste); icerik / etkinlik musteriye
 * musteriId ya da musteriAdi (+ musteriKurum) ile baglanabilir.
 */
function ice_aktarma_plani(array $gelen, string $kip): array {
    $mevcut = $kip === 'degistir' ? [] : tum_kayitlar();
    $var = tur_haritasi($mevcut);
    $dogallar = [];
    $adlar = [];
    foreach ($mevcut as $r) {
        $v = json_decode((string)$r['veri'], true) ?: [];
        $t = (string)$r['tur'];
        if ($t === 'ayar') continue;
        $dogallar[dogal($t, $v)] = (string)$r['id'];
        if ($t === 'musteri') $adlar[norm((string)$v['ad']) . '|' . norm((string)($v['kurum'] ?? ''))] = (string)$r['id'];
    }
    $plan = ['ekle' => [], 'atla' => [], 'hatalar' => [], 'sayilar' => ['musteri' => 0, 'icerik' => 0, 'etkinlik' => 0, 'atlanan' => 0]];
    $idEslem = [];
    $sira = ['musteri' => 'musteriler', 'etkinlik' => 'etkinlikler', 'icerik' => 'icerikler'];
    foreach ($sira as $tur => $alan) {
        $liste = $gelen[$alan] ?? [];
        if (!is_array($liste)) { $plan['hatalar'][] = "$alan liste olmali"; continue; }
        if (count($liste) > 5000) { $plan['hatalar'][] = "$alan cok uzun"; continue; }
        foreach (array_values($liste) as $i => $k) {
            $etiket = $alan . '[' . ($i + 1) . ']';
            if (!is_array($k)) { $plan['hatalar'][] = "$etiket kayit degil"; continue; }
            $eskiId = isset($k['id']) && id_bicim($k['id']) ? (string)$k['id'] : null;
            if ($tur !== 'musteri') {
                $mid = $k['musteriId'] ?? null;
                if (is_string($mid) && isset($idEslem[$mid])) $k['musteriId'] = $idEslem[$mid];
                elseif ((!is_string($mid) || $mid === '') && isset($k['musteriAdi']) && is_string($k['musteriAdi'])) {
                    $ak = norm($k['musteriAdi']) . '|' . norm(is_string($k['musteriKurum'] ?? null) ? $k['musteriKurum'] : '');
                    $k['musteriId'] = $adlar[$ak] ?? null;
                    if ($k['musteriId'] === null) {
                        foreach ($adlar as $ak2 => $mid2) { if (explode('|', $ak2)[0] === norm($k['musteriAdi'])) { $k['musteriId'] = $mid2; break; } }
                    }
                    // ad verilmis ama bulunamamissa sessizce musterisiz yapilmaz: hata olarak onizlemede gosterilir
                    if ($k['musteriId'] === null) { $plan['hatalar'][] = "$etiket: musteri bulunamadi (" . mb_substr($k['musteriAdi'], 0, 60) . ')'; continue; }
                }
                if ($tur === 'icerik' && is_string($k['cekimId'] ?? null) && isset($idEslem[$k['cekimId']])) $k['cekimId'] = $idEslem[$k['cekimId']];
            }
            try {
                $temiz = temizle($tur, $k, $var);
            } catch (InvalidArgumentException $e) {
                $plan['hatalar'][] = "$etiket: " . $e->getMessage();
                continue;
            }
            $d = dogal($tur, $temiz);
            $ad = $tur === 'musteri' ? $temiz['ad'] : $temiz['baslik'];
            if ($eskiId !== null && isset($var[$eskiId])) {
                $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => 'ayni kayit zaten var'];
                $idEslem[$eskiId] = $eskiId;
                $plan['sayilar']['atlanan']++;
                continue;
            }
            if (isset($dogallar[$d])) {
                $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => 'mukerrer (ayni ad / tarih)'];
                if ($eskiId !== null) $idEslem[$eskiId] = $dogallar[$d];
                $plan['sayilar']['atlanan']++;
                continue;
            }
            $yeni = $eskiId !== null ? $eskiId : yeni_id();
            if ($eskiId !== null) $idEslem[$eskiId] = $yeni;
            $var[$yeni] = $tur;
            $dogallar[$d] = $yeni;
            if ($tur === 'musteri') $adlar[norm($temiz['ad']) . '|' . norm($temiz['kurum'])] = $yeni;
            $plan['ekle'][] = ['tur' => $tur, 'id' => $yeni, 'veri' => $temiz, 'ad' => $ad];
            $plan['sayilar'][$tur]++;
        }
    }
    return $plan;
}

/* ---------------- Islemler ---------------- */

// Oturum gerektirmeyenler
if ($islem === 'oturum') {
    basari(['girisli' => oturum_gecerli(), 'kurulu' => sifre_ozeti() !== '']);
}
if ($islem === 'giris') {
    $ozet = sifre_ozeti();
    if ($ozet === '') hata(503, 'kurulum', 'Giris sifresi henuz ayarlanmadi.');
    $n = simdi();
    $p = db();
    $p->prepare('DELETE FROM girisler WHERE zaman < ?')->execute([$n - 86400]);
    $s = $p->prepare('SELECT COUNT(*) AS c FROM girisler WHERE basarili = 0 AND zaman >= ? AND ip = ?');
    $s->execute([$n - (int)$C['login_window'], ip_ozet()]);
    $ipHata = (int)$s->fetch()['c'];
    $s = $p->prepare('SELECT COUNT(*) AS c FROM girisler WHERE basarili = 0 AND zaman >= ?');
    $s->execute([$n - (int)$C['login_window']]);
    $tumHata = (int)$s->fetch()['c'];
    if ($ipHata >= (int)$C['login_max_fail'] || $tumHata >= 3 * (int)$C['login_max_fail']) {
        hata(429, 'kilit', 'Cok fazla hatali deneme. Biraz sonra yeniden dene.');
    }
    $sifre = $G['sifre'] ?? '';
    $dogru = is_string($sifre) && strlen($sifre) <= 1024 && password_verify($sifre, $ozet);
    $p->prepare('INSERT INTO girisler (ip, zaman, basarili) VALUES (?, ?, ?)')->execute([ip_ozet(), $n, $dogru ? 1 : 0]);
    if (!$dogru) {
        usleep(400000);
        hata(401, 'sifre', 'Sifre yanlis.');
    }
    oturum_ac();
    basari(['girisli' => true]);
}

// Bundan sonrasi oturum ister
if (!oturum_gecerli()) hata(401, 'oturum', 'Giris gerekli.');

switch ($islem) {
    case 'cikis':
        $t = (string)($_COOKIE[COOKIE_AD] ?? '');
        if ($t !== '') db()->prepare('DELETE FROM oturumlar WHERE ozet = ?')->execute([hash('sha256', $t)]);
        cerez_yaz('', 0);
        basari();

    case 'veri':
        basari(['veri' => veri_paketi(), 'sunucuZamani' => simdi(), 'surum' => STUDIO_SURUM]);

    case 'kaydet':
        $var = tur_haritasi(tum_kayitlar());
        $p = db();
        try {
            $p->beginTransaction();
            $k = kayit_yaz((string)($G['tur'] ?? ''), isset($G['id']) ? (string)$G['id'] : null, is_array($G['veri'] ?? null) ? $G['veri'] : [],
                isset($G['surum']) ? (int)$G['surum'] : null, $var);
            $p->commit();
        } catch (Throwable $e) {
            if ($p->inTransaction()) $p->rollBack();
            yaz_hatasi($e);
        }
        basari(['kayit' => $k]);

    case 'toplu':
        $liste = $G['kayitlar'] ?? null;
        if (!is_array($liste) || count($liste) === 0 || count($liste) > 500) hata(422, 'gecersiz', 'kayitlar 1-500 ogeli liste olmali.');
        $var = tur_haritasi(tum_kayitlar());
        $p = db();
        $sonuc = [];
        $i = 0;
        try {
            $p->beginTransaction();
            foreach (array_values($liste) as $i => $k) {
                if (!is_array($k)) throw new InvalidArgumentException('kayit degil');
                $sonuc[] = kayit_yaz((string)($k['tur'] ?? ''), isset($k['id']) ? (string)$k['id'] : null, is_array($k['veri'] ?? null) ? $k['veri'] : [],
                    isset($k['surum']) ? (int)$k['surum'] : null, $var);
            }
            $p->commit();
        } catch (Throwable $e) {
            if ($p->inTransaction()) $p->rollBack();
            yaz_hatasi($e, $i);
        }
        basari(['kayitlar' => $sonuc]);

    case 'ice_aktar':
        $kip = ($G['kip'] ?? 'birlestir') === 'degistir' ? 'degistir' : 'birlestir';
        $gelen = $G['veriler'] ?? null;
        if (!is_array($gelen)) hata(422, 'gecersiz', 'veriler eksik.');
        $plan = ice_aktarma_plani($gelen, $kip);
        $ozet = ['kip' => $kip, 'sayilar' => $plan['sayilar'], 'hatalar' => array_slice($plan['hatalar'], 0, 100),
            'hataSayisi' => count($plan['hatalar']), 'atla' => array_slice($plan['atla'], 0, 100),
            'ekle' => array_map(fn($e) => ['tur' => $e['tur'], 'ad' => $e['ad']], array_slice($plan['ekle'], 0, 200))];
        if (!empty($G['onizleme'])) basari(['onizleme' => $ozet]);
        if (count($plan['hatalar']) > 0) hata(422, 'gecersiz', 'Dosyada hatali kayitlar var; once onizlemede duzelt.', ['onizleme' => $ozet]);
        if ($kip === 'degistir' && ($G['onay'] ?? '') !== 'GERI YUKLE') hata(422, 'onay', 'Tum verinin degistirilmesi icin onay gerekli.');
        $p = db();
        try {
            $anlik = anlik_al($kip === 'degistir' ? 'geri_yukleme_oncesi' : 'ice_aktarma_oncesi');
            $p->beginTransaction();
            if ($kip === 'degistir') $p->exec("DELETE FROM kayitlar WHERE tur <> 'ayar'");
            $n = simdi();
            $ins = $p->prepare('INSERT INTO kayitlar (id, tur, anahtar, veri, surum, olusturma, guncelleme) VALUES (?, ?, ?, ?, 1, ?, ?)');
            foreach ($plan['ekle'] as $e) {
                $ins->execute([$e['id'], $e['tur'], anahtar($e['tur'], $e['veri']), json_encode($e['veri'], JSON_UNESCAPED_UNICODE), $n, $n]);
            }
            $p->commit();
        } catch (Throwable $e) {
            if ($p->inTransaction()) $p->rollBack();
            yaz_hatasi($e);
        }
        basari(['sonuc' => $ozet, 'anlik' => $anlik]);

    case 'disa_aktar':
        basari(['yedek' => ['format' => 'suflo-studio-yedek', 'surum' => STUDIO_SURUM, 'olusturma' => gmdate('c'), 'veriler' => veri_paketi()]]);

    case 'anliklar':
        $r = db()->query('SELECT id, zaman, neden, ozet FROM anliklar ORDER BY zaman DESC, id DESC')->fetchAll();
        basari(['anliklar' => array_map(fn($x) => ['id' => $x['id'], 'zaman' => (int)$x['zaman'], 'neden' => $x['neden'], 'ozet' => $x['ozet']], $r)]);

    case 'anlik_geri':
        if (($G['onay'] ?? '') !== 'GERI YUKLE') hata(422, 'onay', 'Onay gerekli.');
        $s = db()->prepare('SELECT veri FROM anliklar WHERE id = ?');
        $s->execute([(string)($G['id'] ?? '')]);
        $r = $s->fetch();
        if (!$r) hata(404, 'yok', 'Anlik kopya bulunamadi.');
        $paket = json_decode((string)$r['veri'], true) ?: [];
        $p = db();
        try {
            $yeniAnlik = anlik_al('anlik_geri_oncesi');
            $p->beginTransaction();
            $p->exec('DELETE FROM kayitlar');
            $ins = $p->prepare('INSERT INTO kayitlar (id, tur, anahtar, veri, surum, olusturma, guncelleme) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $hepsi = array_merge(
                array_map(fn($x) => ['musteri', $x], $paket['musteriler'] ?? []),
                array_map(fn($x) => ['etkinlik', $x], $paket['etkinlikler'] ?? []),
                array_map(fn($x) => ['icerik', $x], $paket['icerikler'] ?? []),
                isset($paket['ayar']) && is_array($paket['ayar']) ? [['ayar', $paket['ayar']]] : []
            );
            foreach ($hepsi as [$tur, $x]) {
                $v = $x;
                unset($v['id'], $v['surum'], $v['olusturma'], $v['guncelleme']);
                $ins->execute([(string)$x['id'], $tur, $tur === 'musteri' ? anahtar($tur, $v) : null, json_encode($v, JSON_UNESCAPED_UNICODE),
                    (int)($x['surum'] ?? 1) + 1, (int)($x['olusturma'] ?? simdi()), simdi()]);
            }
            $p->commit();
        } catch (Throwable $e) {
            if ($p->inTransaction()) $p->rollBack();
            yaz_hatasi($e);
        }
        basari(['anlik' => $yeniAnlik]);

    case 'sifre_degistir':
        $eski = $G['eski'] ?? '';
        $yeni = $G['yeni'] ?? '';
        if (!is_string($eski) || !password_verify($eski, sifre_ozeti())) {
            usleep(400000);
            hata(401, 'sifre', 'Mevcut sifre yanlis.');
        }
        if (!is_string($yeni) || mb_strlen($yeni) < 12 || strlen($yeni) > 1024) hata(422, 'gecersiz', 'Yeni sifre en az 12 karakter olmali.');
        ayar_yaz('password_hash', password_hash($yeni, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT));
        ayar_yaz('password_hash_kaynak', hash('sha256', (string)$C['password_hash']));
        db()->exec('DELETE FROM oturumlar');
        oturum_ac();
        basari();

    case 'oturumlari_kapat':
        db()->exec('DELETE FROM oturumlar');
        cerez_yaz('', 0);
        basari();

    default:
        hata(400, 'islem', 'Bilinmeyen islem.');
}
