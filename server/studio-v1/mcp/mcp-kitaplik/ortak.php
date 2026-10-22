<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP: ortak parcalar (ayar, adresler, HTTP yanitlari, rastgele / ozet yardimcilari).
 * Bu klasor (public_html/<uygulama>/mcp-kitaplik/) .htaccess ile disariya kapalidir; dogrudan cagrilirsa hicbir sey yapmaz.
 * Islevlerin hepsi mcp_ onekli: panelin (v1/index.php) islevleriyle (db, tek, hata, islem...) cakismaz.
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

const MCP_SURUM = '1.0.0';
const MCP_ERISIM_OMRU = 3600;              // access token: 60 dk
const MCP_YENILEME_OMRU = 30 * 86400;      // refresh token: 30 gun, her kullanimda yenisi (kayan)
const MCP_YENILEME_TOLERANSI = 60;         // donusturulmus refresh token bu kadar saniye icinde yeniden gelirse (eszamanli yenileme) iptal yok
const MCP_YENILEME_KARDES_SINIRI = 3;      // tolerans penceresinde ayni donusumden en cok bu kadar etkin yenileme jetonu
const MCP_IZIN_OMRU = 180 * 86400;         // grant mutlak omru
const MCP_KOD_OMRU = 300;                  // authorization code: 5 dk, tek kullanimlik
const MCP_ONAY_OMRU = 600;                 // onay sayfasi istegi + CSRF: 10 dk, tek kullanimlik
const MCP_TOPLU_OMRU = 900;                // toplu onay kodu: 15 dk, tek kullanimlik
const MCP_GOVDE_SINIRI = 1048576;          // MCP govdesi en cok 1 MiB
const MCP_FORM_SINIRI = 65536;             // OAuth form / JSON govdesi
const MCP_KAPSAM_OKU = 'studio.oku';
const MCP_KAPSAM_YAZ = 'studio.yaz';
const MCP_KAPSAMLAR = [MCP_KAPSAM_OKU, MCP_KAPSAM_YAZ];
const MCP_ESKI_SURUMLER = ['2025-11-25', '2025-06-18'];      // initialize ile anlasilan (eski donem)
const MCP_YENI_SURUMLER = ['2026-07-28'];                    // istek basina _meta ile (yeni donem)
const MCP_ILK_YENI_SURUM = '2026-07-28';
const MCP_VARSAYILAN_YONLENDIRMELER = [
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'https://chatgpt.com/connector_platform_oauth_redirect',
    'https://chatgpt.com/connector/oauth/*',     // * = tek yol parcasi: [A-Za-z0-9_-]{1,128}
];
const MCP_VARSAYILAN_ORIGINLER = ['https://claude.ai', 'https://claude.com', 'https://chatgpt.com'];

/** Gecici (yeniden denenebilir) hata: veritabani mesgul ya da Studio kilitli. */
class McpMesgulHatasi extends RuntimeException {}
/** Kurulum hatasi (ayar yok, sema uyumsuz...). */
class McpKurulumHatasi extends RuntimeException {}

/**
 * Giris dosyasinin klasorunden uygulama adini (studio / studio-test) bulur, ayari yukler.
 * Ayar yolu panelle ayni kural: dirname(DOCUMENT_ROOT)/private/<uygulama>-v1/config.php
 * (canlida public_html/studio -> private/studio-v1; test kurulumunda public_html/studio-test -> private/studio-test-v1).
 */
function mcp_baslat(string $giris): void {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    $uyg = basename($giris);
    if (!preg_match('/^[a-z0-9][a-z0-9-]{0,39}$/', $uyg)) mcp_kurulum_yaniti('Uygulama klasoru adi gecersiz.');
    $belge = (string)($_SERVER['DOCUMENT_ROOT'] ?? '');
    if ($belge === '') $belge = dirname($giris);
    $ozel = dirname(rtrim($belge, '/\\')) . '/private/' . $uyg . '-v1';
    $yol = $ozel . '/config.php';
    if (!is_file($yol)) mcp_kurulum_yaniti('Suflo Studio sunucusu henuz yapilandirilmadi.');
    try {
        $C = (static function (string $f) { return require $f; })($yol);
    } catch (Throwable $e) {
        mcp_kurulum_yaniti('Suflo Studio ayar dosyasi okunamadi.');
    }
    if (!is_array($C)) mcp_kurulum_yaniti('Suflo Studio ayar dosyasi okunamadi.');
    $C += [
        'password_hash' => '',
        'cookie_secure' => true,
        'mcp_acik' => true,
        'kok_url' => 'https://assets.suflo.app',
        'mcp_redirect_izinli' => MCP_VARSAYILAN_YONLENDIRMELER,
        'mcp_origin_izinli' => MCP_VARSAYILAN_ORIGINLER,
        'mcp_db' => $ozel . '/mcp.sqlite',
        'mcp_arka' => __DIR__ . '/arka-studio.php',
    ];
    $kok = strtolower(rtrim((string)$C['kok_url'], '/'));
    // Dis kok adres yalniz ayardan gelir (Host basligindan asla: issuer / resource saldirganca degistirilemez)
    if (!preg_match('#^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$#', $kok)
        && !preg_match('#^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$#', $kok)) {
        mcp_kurulum_yaniti('kok_url gecersiz.');
    }
    $GLOBALS['__mcp'] = [
        'C' => $C,
        'uygulama' => $uyg,
        'ozel' => $ozel,
        'kok' => $kok,
        'issuer' => $kok . '/' . $uyg,
        'kaynak' => $kok . '/' . $uyg . '/mcp',
        'prm' => $kok . '/.well-known/oauth-protected-resource/' . $uyg . '/mcp',
    ];
}

function mcp_c(string $k) { return $GLOBALS['__mcp']['C'][$k] ?? null; }
function mcp_ortam(string $k): string { return (string)$GLOBALS['__mcp'][$k]; }
function mcp_acik_mi(): bool { return !in_array(mcp_c('mcp_acik'), [false, 0, '0', 'false', 'kapali', 'hayir', null], true); }
function mcp_uc(string $ad): string { return mcp_ortam('issuer') . '/oauth/' . $ad; }
function mcp_zaman(): int { return time(); }
function mcp_istanbul(): DateTimeZone { static $z = null; return $z ??= new DateTimeZone('Europe/Istanbul'); }
function mcp_iso(int $t): string { return (new DateTimeImmutable('@' . $t))->setTimezone(mcp_istanbul())->format(DATE_ATOM); }

/* ---------------- HTTP ---------------- */

function mcp_ortak_basliklar(): void {
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
    header('Pragma: no-cache');
    header('X-LiteSpeed-Cache-Control: no-cache');
    header('X-Robots-Tag: noindex, nofollow');
}
function mcp_json_metin($veri): string {
    $j = json_encode($veri, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    return $j === false ? '{"error":"server_error"}' : $j;
}
/**
 * JSON yanit ve cikis. Durum kodu basliklardan SONRA yazilir: PHP, WWW-Authenticate basligi eklenince durumu
 * kendiliginden 401 yapar (403 insufficient_scope bozulmasin).
 */
function mcp_json(int $kod, $veri, array $basliklar = []): void {
    mcp_ortak_basliklar();
    foreach ($basliklar as $b) header($b);
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($kod);
    echo mcp_json_metin($veri);
    exit;
}
/** Govdesiz yanit (202 Accepted, 200 revoke...). */
function mcp_bos(int $kod, array $basliklar = []): void {
    mcp_ortak_basliklar();
    foreach ($basliklar as $b) header($b);
    header('Content-Length: 0');
    http_response_code($kod);
    exit;
}
function mcp_kurulum_yaniti(string $mesaj): void {
    mcp_json(503, ['error' => 'temporarily_unavailable', 'error_description' => $mesaj], ['Retry-After: 30']);
}
function mcp_yontem(): string { return strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? '')); }
function mcp_yol(): string { return (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH); }
function mcp_icerik_turu(): string { return strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? ''))[0])); }

/** Istek basligi (buyuk/kucuk harf duyarsiz). */
function mcp_baslik(string $ad): ?string {
    $k = 'HTTP_' . strtoupper(str_replace('-', '_', $ad));
    if (isset($_SERVER[$k]) && is_string($_SERVER[$k])) return $_SERVER[$k];
    static $hepsi = null;
    if ($hepsi === null) {
        $hepsi = [];
        if (function_exists('getallheaders')) {
            foreach ((array)getallheaders() as $a => $d) $hepsi[strtolower((string)$a)] = (string)$d;
        }
    }
    return $hepsi[strtolower($ad)] ?? null;
}
/**
 * Authorization basligi. Barindiriciya gore farkli yerde durur: HTTP_AUTHORIZATION (php -S, LiteSpeed),
 * REDIRECT_HTTP_AUTHORIZATION (Apache: .htaccess RewriteRule E= ile, ic yonlendirmeden sonra), getallheaders()
 * (mod_php / LSAPI / FPM). Sorgu dizesindeki access_token asla okunmaz.
 */
function mcp_yetki_basligi(): ?string {
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $k) {
        if (isset($_SERVER[$k]) && is_string($_SERVER[$k]) && $_SERVER[$k] !== '') return $_SERVER[$k];
    }
    $b = mcp_baslik('Authorization');
    return $b === null || $b === '' ? null : $b;
}
/** Govdeyi en cok $sinir bayt okur; asarsa null. */
function mcp_govde_oku(int $sinir): ?string {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $sinir) return null;
    $g = (string)file_get_contents('php://input', false, null, 0, $sinir + 1);
    return strlen($g) > $sinir ? null : $g;
}
/**
 * application/x-www-form-urlencoded / sorgu dizesi ayristirma. OAuth parametreleri en cok bir kez gecebilir:
 * tekrar edenler ayrica doner. Dizi bicimli adlar (a[]=) duz metin sayilir.
 */
function mcp_form_ayristir(string $qs): array {
    $p = [];
    $tekrar = [];
    if ($qs === '') return [$p, $tekrar];
    foreach (explode('&', $qs) as $parca) {
        if ($parca === '') continue;
        $esit = strpos($parca, '=');
        $ad = urldecode($esit === false ? $parca : substr($parca, 0, $esit));
        $deger = $esit === false ? '' : urldecode(substr($parca, $esit + 1));
        if (array_key_exists($ad, $p)) $tekrar[$ad] = true;
        $p[$ad] = $deger;
    }
    return [$p, array_keys($tekrar)];
}

/* ---------------- Rastgele / ozet ---------------- */

function mcp_b64url(string $b): string { return rtrim(strtr(base64_encode($b), '+/', '-_'), '='); }
function mcp_rastgele(int $bayt = 32): string { return mcp_b64url(random_bytes($bayt)); }
function mcp_ozet(string $s): string { return hash('sha256', $s); }
/** IP ozeti (hiz siniri icin). IPv6'da /64 onek. Ham IP saklanmaz. */
function mcp_ip_ozet(): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $b = @inet_pton($ip);
    if ($b !== false && strlen($b) === 16 && substr($b, 0, 12) !== str_repeat("\0", 10) . "\xff\xff") {
        $ip = bin2hex(substr($b, 0, 8)) . '::/64';
    }
    return hash('sha256', 'mcp|' . $ip);
}
/** Gunluk / ekran icin kisa, tek satirlik metin (denetim karakterleri temizlenir). */
function mcp_kisalt(string $s, int $n): string {
    $s = (string)preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s);
    $s = trim((string)preg_replace('/\s+/u', ' ', $s));
    return mb_strlen($s) > $n ? mb_substr($s, 0, $n - 1) . '…' : $s;
}

/* ---------------- Adres denetimleri ---------------- */

/** RFC 8707 resource karsilastirmasi icin kanonik bicim (sema/host kucuk harf, varsayilan port yok, sonda / yok). */
function mcp_kaynak_kanonik(string $u): ?string {
    $p = parse_url($u);
    if (!is_array($p) || empty($p['scheme']) || empty($p['host'])) return null;
    if (isset($p['fragment']) || isset($p['user']) || isset($p['pass']) || isset($p['query'])) return null;
    $s = strtolower($p['scheme']);
    if ($s !== 'https' && $s !== 'http') return null;
    $port = isset($p['port']) ? (int)$p['port'] : null;
    if (($s === 'https' && $port === 443) || ($s === 'http' && $port === 80)) $port = null;
    return $s . '://' . strtolower($p['host']) . ($port ? ':' . $port : '') . rtrim((string)($p['path'] ?? ''), '/');
}
function mcp_kaynak_bizim_mi(string $u): bool {
    $k = mcp_kaynak_kanonik($u);
    return $k !== null && $k === mcp_kaynak_kanonik(mcp_ortam('kaynak'));
}
/**
 * redirect_uri izinli mi: bicim (https; http yalniz 127.0.0.1 / localhost; parca / kullanici bilgisi yok) ve
 * ayardaki izin listesi (tam esitlik; "*" ile biten giris tek bir [A-Za-z0-9_-] yol parcasina izin verir).
 */
function mcp_yonlendirme_izinli(string $uri): bool {
    if ($uri === '' || strlen($uri) > 512 || preg_match('/[\x00-\x20\x7F"<>\\\\^`{|}]/', $uri)) return false;
    $p = parse_url($uri);
    if (!is_array($p) || empty($p['scheme']) || empty($p['host']) || isset($p['fragment']) || isset($p['user']) || isset($p['pass'])) return false;
    $s = $p['scheme'];
    if ($s !== 'https' && !($s === 'http' && in_array($p['host'], ['127.0.0.1', 'localhost'], true))) return false;
    if (str_contains((string)($p['path'] ?? ''), '/.')) return false;   // nokta bolumleri (/../) yok
    foreach ((array)mcp_c('mcp_redirect_izinli') as $izin) {
        if (!is_string($izin) || $izin === '') continue;
        if (str_ends_with($izin, '*')) {
            $onek = substr($izin, 0, -1);
            if (str_starts_with($uri, $onek) && preg_match('/^[A-Za-z0-9_-]{1,128}$/', substr($uri, strlen($onek)))) return true;
        } elseif (hash_equals($izin, $uri)) {
            return true;
        }
    }
    return false;
}
function mcp_origin_izinli(string $o): bool {
    foreach ((array)mcp_c('mcp_origin_izinli') as $izin) if (is_string($izin) && hash_equals(strtolower($izin), strtolower($o))) return true;
    return false;
}
