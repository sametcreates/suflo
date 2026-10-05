<?php
declare(strict_types=1);

/*
 * Suflo Pro Content API
 * - manifest: Lemon Squeezy lisansini dogrular, kisa omurlu indirme tokeni verir
 *   (3.1.0+ istemciye, davet kademesi varsa ek "extras.davet" odul katalogu)
 * - file: token dogrular, public_html disindaki Pro dosyalarini stream eder
 * - referral / referral_stats: Pro sahibinin davet kodu ve davet sayisi (Lemon Squeezy
 *   discount API'si). referral_enabled ve ls_api_key ayarlanana dek 503 (uyuyan ozellik).
 * - attribution: "Bizi nereden duydun?" yaniti (anahtar degil, ozeti saklanir)
 *
 * URL'lerde lisans anahtari/tokenu bulunmaz; istemci JSON POST kullanir.
 * ls_api_key yalniz private config.php'de durur; hicbir yanita ve gunluge yazilmaz.
 */

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, private');

function fail_json(int $status, string $message, array $extra = []): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['ok' => false, 'error' => $message], $extra), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function ok_json(array $data): void {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['ok' => true], $data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    fail_json(405, 'Yalniz POST desteklenir.');
}

$configPath = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/private/pro-v1/config.php';
if (!is_file($configPath)) {
    fail_json(503, 'Pro icerik servisi yapilandirilmadi.');
}
$cfg = require $configPath;
if (!is_array($cfg) || empty($cfg['token_secret']) || strlen((string)$cfg['token_secret']) < 32) {
    fail_json(503, 'Pro icerik servisi guvenli degil.');
}

$raw = file_get_contents('php://input');
if ($raw === false || strlen($raw) > 65536) fail_json(400, 'Gecersiz istek.');
$input = json_decode($raw, true);
if (!is_array($input)) fail_json(400, 'JSON bekleniyor.');
$action = (string)($input['action'] ?? '');

function b64url_encode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function b64url_decode(string $data): string|false {
    $pad = strlen($data) % 4;
    if ($pad) $data .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($data, '-_', '+/'), true);
}
function make_token(array $cfg, string $instanceId, bool $bind = false, int $ref = 0): string {
    $ttl = max(300, min(14400, (int)($cfg['token_ttl'] ?? 7200)));
    $payload = json_encode([
        'exp' => time() + $ttl,
        'iid' => hash('sha256', $instanceId),
        // 3.0+ istemci her dosya isteginde instance_id gonderir: bu token icin baglama
        // require_instance ayarindan bagimsiz zorunlu. client_version istemcinin beyani
        // oldugundan tam koruma icin 2.x emekliye ayrilinca require_instance => true yapilmali.
        'bind' => $bind ? 1 : 0,
        // davet kademesi: davet/t1|t3 odul dosyalari yalniz ref >= kademe olan tokenle iner
        'ref' => max(0, $ref),
        'nonce' => bin2hex(random_bytes(8))
    ], JSON_UNESCAPED_SLASHES);
    $body = b64url_encode((string)$payload);
    return $body . '.' . b64url_encode(hash_hmac('sha256', $body, (string)$cfg['token_secret'], true));
}
function verify_token(array $cfg, string $token): array|false {
    if (strlen($token) > 2048 || substr_count($token, '.') !== 1) return false;
    [$body, $sig] = explode('.', $token, 2);
    $given = b64url_decode($sig);
    if ($given === false) return false;
    $expected = hash_hmac('sha256', $body, (string)$cfg['token_secret'], true);
    if (!hash_equals($expected, $given)) return false;
    $decoded = b64url_decode($body);
    $payload = $decoded === false ? null : json_decode($decoded, true);
    if (!is_array($payload) || !isset($payload['exp']) || (int)$payload['exp'] < time() || empty($payload['iid'])) return false;
    return $payload;
}

// Token yalniz onu alan cihazda gecerli olsun: sizan bir token baska makinede
// tum Pro icerigini indirmeye yetmesin. 3.0 oncesi istemciler instance_id
// gondermez; 'require_instance' => true ile onlar da kapatilir.
function token_matches_instance(array $cfg, array $payload, string $instanceId): bool {
    if ($instanceId === '') return empty($cfg['require_instance']) && empty($payload['bind']);
    if (strlen($instanceId) > 256) return false;
    return hash_equals((string)$payload['iid'], hash('sha256', $instanceId));
}

function allow_manifest_request(array $cfg): bool {
    return allow_request($cfg, 'manifest', 15);
}

function allow_request(array $cfg, string $bucket, int $limit): bool {
    // Lemon Squeezy lisans API kotasini rastgele anahtar denemelerine karsi koru.
    // IP'nin kendisi diske yazilmaz; yalniz SHA-256 dosya adi tutulur. Paylasimli
    // hosting yazmaya izin vermezse gercek musteriyi engellememek icin fail-open.
    $base = dirname((string)($cfg['manifest_path'] ?? '')) . '/rate-limit/' . $bucket;
    if (!is_dir($base) && !@mkdir($base, 0700, true) && !is_dir($base)) return true;
    $ipHash = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    $file = $base . '/' . $ipHash . '.json';
    $handle = @fopen($file, 'c+');
    if ($handle === false) return true;
    if (!@flock($handle, LOCK_EX)) { fclose($handle); return true; }
    $now = time();
    rewind($handle);
    $saved = json_decode((string)stream_get_contents($handle), true);
    $window = is_array($saved) ? (int)($saved['window'] ?? 0) : 0;
    $count = is_array($saved) ? (int)($saved['count'] ?? 0) : 0;
    if ($window <= 0 || $now - $window >= 60) { $window = $now; $count = 0; }
    $allowed = $count < $limit;
    if ($allowed) $count++;
    ftruncate($handle, 0); rewind($handle);
    fwrite($handle, json_encode(['window' => $window, 'count' => $count], JSON_UNESCAPED_SLASHES));
    fflush($handle); flock($handle, LOCK_UN); fclose($handle);
    return $allowed;
}

function post_form(string $url, array $fields): array {
    $body = http_build_query($fields, '', '&', PHP_QUERY_RFC3986);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_USERAGENT => 'Suflo-Pro-Content/1.0'
        ]);
        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$status, is_string($response) ? $response : ''];
    }
    $context = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 20, 'ignore_errors' => true,
        'header' => "Accept: application/json\r\nContent-Type: application/x-www-form-urlencoded\r\nUser-Agent: Suflo-Pro-Content/1.0\r\n",
        'content' => $body
    ]]);
    $response = @file_get_contents($url, false, $context);
    $status = 0;
    foreach (($http_response_header ?? []) as $line) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $m)) { $status = (int)$m[1]; break; }
    }
    return [$status, is_string($response) ? $response : ''];
}

// Lemon Squeezy API koku; testler sahte sunucuya yonlendirmek icin private config'te degistirebilir
function ls_base(array $cfg): string {
    $base = trim((string)($cfg['ls_api_base'] ?? ''));
    return rtrim($base !== '' ? $base : 'https://api.lemonsqueezy.com', '/');
}

// Lisansi dogrular; gecerliyse lisans kimligi ve musteri e-postasi (yalniz sunucu ici kullanim)
function validate_license_data(array $cfg, string $licenseKey, string $instanceId): array|false {
    if ($licenseKey === '' || $instanceId === '' || strlen($licenseKey) > 256 || strlen($instanceId) > 256) return false;
    [$status, $body] = post_form(ls_base($cfg) . '/v1/licenses/validate', [
        'license_key' => $licenseKey,
        'instance_id' => $instanceId
    ]);
    if ($status !== 200) return false;
    $data = json_decode($body, true);
    if (!is_array($data) || ($data['valid'] ?? false) !== true) return false;
    if (($data['license_key']['status'] ?? '') !== 'active') return false;
    $meta = $data['meta'] ?? [];
    if ((int)($meta['store_id'] ?? 0) !== (int)$cfg['store_id']) return false;
    if ((int)($meta['product_id'] ?? 0) !== (int)$cfg['product_id']) return false;
    if (!empty($cfg['variant_id']) && (int)($meta['variant_id'] ?? 0) !== (int)$cfg['variant_id']) return false;
    $licenseId = (string)($data['license_key']['id'] ?? '');
    return [
        // kimlik yoksa anahtarin ozeti: davet kaydi yine lisansa bagli kalir
        'id' => $licenseId !== '' ? 'id:' . $licenseId : 'key:' . hash('sha256', $licenseKey),
        'email' => strtolower(trim((string)($meta['customer_email'] ?? '')))
    ];
}

function validate_license(array $cfg, string $licenseKey, string $instanceId): bool {
    return validate_license_data($cfg, $licenseKey, $instanceId) !== false;
}

/*
 * Lemon Squeezy JSON:API cagrisi (Bearer anahtar). Doner: [HTTP durumu, cozulmus JSON|null].
 * Anahtar yalniz Authorization basliginda gider; hata mesajina, yanita ve gunluge yazilmaz.
 */
function ls_api(array $cfg, string $method, string $pathOrUrl, ?array $body = null): array {
    $key = trim((string)($cfg['ls_api_key'] ?? ''));
    if ($key === '') return [0, null];
    $url = str_starts_with($pathOrUrl, ls_base($cfg) . '/') ? $pathOrUrl : ls_base($cfg) . $pathOrUrl;
    $headers = ['Accept: application/vnd.api+json', 'Content-Type: application/vnd.api+json', 'Authorization: Bearer ' . $key];
    $payload = $body === null ? null : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $response = false; $status = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_USERAGENT => 'Suflo-Referral/1.0'
        ];
        if ($payload !== null) $opts[CURLOPT_POSTFIELDS] = $payload;
        curl_setopt_array($ch, $opts);
        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
    } else {
        $http = ['method' => $method, 'timeout' => 15, 'ignore_errors' => true,
            'header' => implode("\r\n", $headers) . "\r\nUser-Agent: Suflo-Referral/1.0\r\n"];
        if ($payload !== null) $http['content'] = $payload;
        $response = @file_get_contents($url, false, stream_context_create(['http' => $http]));
        foreach (($http_response_header ?? []) as $line) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $m)) { $status = (int)$m[1]; break; }
        }
    }
    $data = is_string($response) ? json_decode($response, true) : null;
    return [$status, is_array($data) ? $data : null];
}

/* ---------------- Davet et, kazan ---------------- */

const REFERRAL_TIERS = [1, 3, 10];
const REFERRAL_ANSWERS = ['youtube', 'instagram', 'tiktok', 'arkadas', 'kod', 'google', 'diger'];

function referral_tier_for(int $count): int {
    $tier = 0;
    foreach (REFERRAL_TIERS as $t) if ($count >= $t) $tier = $t;
    return $tier;
}
function referral_variants(array $cfg): array {
    $ids = [];
    foreach ((array)($cfg['referral_variant_ids'] ?? []) as $v) if ((int)$v > 0) $ids[] = (string)(int)$v;
    return array_values(array_unique($ids));
}
function referral_enabled(array $cfg): bool {
    return !empty($cfg['referral_enabled']) && trim((string)($cfg['ls_api_key'] ?? '')) !== '' && count(referral_variants($cfg)) > 0;
}
function referrals_path(array $cfg): string {
    $p = (string)($cfg['referrals_path'] ?? '');
    return $p !== '' ? $p : dirname((string)($cfg['manifest_path'] ?? '')) . '/referrals.json';
}
function base32_raw(string $bin): string {
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 5) as $chunk) $out .= $alphabet[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}
// Kod lisanstan turetilir ama kayitta saklanir: token_secret degisse de mevcut kod degismez
function referral_code(array $cfg, string $licenseId, int $attempt): string {
    $msg = 'suflo-ref:' . $licenseId . ($attempt > 0 ? ':' . $attempt : '');
    return 'SFL' . substr(base32_raw(hash_hmac('sha256', $msg, (string)$cfg['token_secret'], true)), 0, 6);
}

// Davet kaydini kilitle ve oku. Doner: [dosya tutamaci, veri] ya da false (yazilamiyor)
function referral_lock(array $cfg): array|false {
    $path = referrals_path($cfg);
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) return false;
    $handle = @fopen($path, 'c+');
    if ($handle === false) return false;
    if (!@flock($handle, LOCK_EX)) { fclose($handle); return false; }
    rewind($handle);
    $data = json_decode((string)stream_get_contents($handle), true);
    if (!is_array($data)) $data = [];
    if (!isset($data['users']) || !is_array($data['users'])) $data['users'] = [];
    if (!isset($data['codes']) || !is_array($data['codes'])) $data['codes'] = [];
    $data['schema'] = 1;
    return [$handle, $data];
}
function referral_unlock($handle, ?array $data = null): void {
    if ($data !== null) {
        ftruncate($handle, 0); rewind($handle);
        fwrite($handle, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        fflush($handle);
    }
    flock($handle, LOCK_UN);
    fclose($handle);
}
// Kilitsiz okuma (manifest yolunda Lemon Squeezy'ye hic gidilmez)
function referral_entry(array $cfg, string $userHash): ?array {
    $path = referrals_path($cfg);
    if (!is_file($path)) return null;
    $handle = @fopen($path, 'r');
    if ($handle === false) return null;
    @flock($handle, LOCK_SH);
    $data = json_decode((string)stream_get_contents($handle), true);
    @flock($handle, LOCK_UN);
    fclose($handle);
    $entry = is_array($data) ? ($data['users'][$userHash] ?? null) : null;
    return is_array($entry) ? $entry : null;
}

/*
 * Lemon Squeezy'de kod olustur. 422 (kod alinmis) gelirse yeni kodla en cok 3 kez daha dener.
 * Doner: ['code' => ..., 'discount_id' => ...] ya da false
 */
function referral_create_discount(array $cfg, string $licenseId, array $takenCodes): array|false {
    $percent = max(1, min(90, (int)($cfg['referral_percent'] ?? 15)));
    $max = max(1, min(100000, (int)($cfg['referral_max'] ?? 50)));
    $variants = array_map(static fn(string $id): array => ['type' => 'variants', 'id' => $id], referral_variants($cfg));
    $attempt = 0;
    for ($try = 0; $try < 4; $try++) {
        $code = referral_code($cfg, $licenseId, $attempt);
        while (isset($takenCodes[$code]) && $attempt < 50) { $attempt++; $code = referral_code($cfg, $licenseId, $attempt); }
        [$status, $data] = ls_api($cfg, 'POST', '/v1/discounts', [
            'data' => [
                'type' => 'discounts',
                'attributes' => [
                    'name' => 'Davet ' . $code,
                    'code' => $code,
                    'amount' => $percent,
                    'amount_type' => 'percent',
                    'is_limited_to_products' => true,
                    'is_limited_redemptions' => true,
                    'max_redemptions' => $max,
                    'duration' => 'once'
                ],
                'relationships' => [
                    'store' => ['data' => ['type' => 'stores', 'id' => (string)(int)$cfg['store_id']]],
                    'variants' => ['data' => $variants]
                ]
            ]
        ]);
        if (($status === 200 || $status === 201) && is_array($data) && !empty($data['data']['id'])) {
            return ['code' => $code, 'discount_id' => (string)$data['data']['id']];
        }
        if ($status !== 422) return false;
        $takenCodes[$code] = true;
        $attempt++;
    }
    return false;
}

/*
 * Davet sayisi: indirimi kullanan, odemesi tamamlanmis (iade edilmemis), davet edenin kendisi
 * olmayan ve 14 gunden eski siparislerin FARKLI e-postalari. links.next en cok 5 sayfa izlenir.
 */
function referral_count(array $cfg, string $discountId, string $selfEmailHash): int|false {
    $base = ls_base($cfg);
    $url = $base . '/v1/discount-redemptions?filter%5Bdiscount_id%5D=' . rawurlencode($discountId) . '&include=order&page%5Bsize%5D=100';
    $emails = [];
    $minAge = 14 * 86400;
    $now = time();
    for ($page = 0; $page < 5 && $url !== ''; $page++) {
        [$status, $data] = ls_api($cfg, 'GET', $url);
        if ($status !== 200 || !is_array($data)) return false;
        $orders = [];
        foreach ((array)($data['included'] ?? []) as $inc) {
            if (is_array($inc) && ($inc['type'] ?? '') === 'orders') $orders[(string)($inc['id'] ?? '')] = (array)($inc['attributes'] ?? []);
        }
        foreach ((array)($data['data'] ?? []) as $redemption) {
            if (!is_array($redemption)) continue;
            $a = (array)($redemption['attributes'] ?? []);
            if (isset($a['discount_id']) && (string)$a['discount_id'] !== $discountId) continue;
            $orderId = (string)($a['order_id'] ?? ($redemption['relationships']['order']['data']['id'] ?? ''));
            $order = $orders[$orderId] ?? null;
            if (!is_array($order)) continue;
            if (($order['status'] ?? '') !== 'paid' || !empty($order['refunded'])) continue;
            $email = strtolower(trim((string)($order['user_email'] ?? '')));
            if ($email === '' || hash('sha256', $email) === $selfEmailHash) continue;
            $created = strtotime((string)($order['created_at'] ?? ''));
            if ($created === false || $now - $created < $minAge) continue;
            $emails[$email] = true;
        }
        $next = (string)($data['links']['next'] ?? '');
        // yalniz ayni API'nin ayni uc noktasi izlenir: anahtar baska bir adrese gonderilmez
        $url = ($next !== '' && str_starts_with($next, $base . '/v1/discount-redemptions?')) ? $next : '';
    }
    return count($emails);
}

// Disari giden yanit: e-posta, anahtar ve indirim kimligi asla yok
function referral_public(array $entry, array $cfg): array {
    $count = max(0, (int)($entry['count'] ?? 0));
    return [
        'code' => (string)$entry['code'],
        'count' => $count,
        'tier' => max((int)($entry['tier'] ?? 0), referral_tier_for($count)),
        'percent' => max(1, min(90, (int)($cfg['referral_percent'] ?? 15))),
        'share_url' => 'https://suflo.app/?d=' . rawurlencode((string)$entry['code'])
    ];
}

/* ---------------- Davet odulleri (manifest extras) ---------------- */

function davet_dir(array $cfg): string {
    $d = (string)($cfg['davet_dir'] ?? '');
    return $d !== '' ? $d : dirname((string)($cfg['manifest_path'] ?? '')) . '/davet';
}
// Kademeye gore odul katalogu: davet/t1 (1+ davet), davet/t3 (3+ davet). Ana katalogdan ayri.
function davet_extras(array $cfg, int $tier): ?array {
    if ($tier < 1) return null;
    $path = davet_dir($cfg) . '/manifest.json';
    if (!is_file($path)) return null;
    $m = json_decode((string)file_get_contents($path), true);
    if (!is_array($m) || empty($m['version']) || !is_array($m['files'] ?? null)) return null;
    $files = [];
    foreach ($m['files'] as $item) {
        $p = str_replace('\\', '/', (string)($item['path'] ?? ''));
        if (!preg_match('#^davet/t(1|3)/(mogrt|sfx)/#i', $p, $mm)) continue;
        if ((int)$mm[1] > $tier) continue;
        $files[] = ['path' => $p, 'bytes' => (int)($item['bytes'] ?? 0), 'sha256' => strtolower((string)($item['sha256'] ?? ''))];
    }
    if (!$files) return null;
    return ['version' => (string)$m['version'], 'files' => $files];
}

function safe_content_path(array $cfg, string $relative, int $ref = 0): string|false {
    $relative = str_replace('\\', '/', trim($relative, '/'));
    if ($relative === '' || strlen($relative) > 260 || str_contains($relative, "\0")) return false;
    foreach (explode('/', $relative) as $part) if ($part === '' || $part === '.' || $part === '..') return false;
    // Davet odulleri: yalniz tokenin ref kademesi yeterliyse, davet_dir altindan
    if (preg_match('#^davet/#i', $relative)) {
        if (!preg_match('#^davet/t(1|3)/(mogrt/.+\.mogrt|sfx/.+\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma))$#iu', $relative, $dm)) return false;
        if ($ref < (int)$dm[1]) return false;
        $droot = realpath(davet_dir($cfg));
        $dfile = realpath(davet_dir($cfg) . '/' . substr($relative, strlen('davet/')));
        if ($droot === false || $dfile === false || !is_file($dfile)) return false;
        if (!str_starts_with($dfile, rtrim($droot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)) return false;
        return $dfile;
    }
    $isMogrt = preg_match('#^mogrt/.+\.mogrt$#iu', $relative) === 1;
    $isSfx = preg_match('#^sfx/.+\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$#iu', $relative) === 1;
    $isMotionBg = preg_match('#^motionbg/.+\.(mp4|mov|m4v|webm)$#iu', $relative) === 1;
    $isPreset = preg_match('#^presets/.+\.prfpset$#iu', $relative) === 1;
    if (!$isMogrt && !$isSfx && !$isMotionBg && !$isPreset) return false;
    $root = realpath((string)$cfg['content_root']);
    $file = realpath((string)$cfg['content_root'] . '/' . $relative);
    if ($root === false || $file === false || !is_file($file)) return false;
    $prefix = rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
    if (!str_starts_with($file, $prefix)) return false;
    return $file;
}

if ($action === 'manifest') {
    if (!allow_manifest_request($cfg)) {
        header('Retry-After: 60');
        fail_json(429, 'Cok fazla lisans denemesi. Bir dakika sonra tekrar dene.');
    }
    $licenseKey = trim((string)($input['license_key'] ?? ''));
    $instanceId = trim((string)($input['instance_id'] ?? ''));
    $license = validate_license_data($cfg, $licenseKey, $instanceId);
    if ($license === false) fail_json(403, 'Lisans dogrulanamadi.');
    $manifestPath = (string)$cfg['manifest_path'];
    if (!is_file($manifestPath)) fail_json(503, 'Icerik katalogu hazir degil.');
    $manifest = json_decode((string)file_get_contents($manifestPath), true);
    if (!is_array($manifest) || empty($manifest['content_version']) || empty($manifest['files'])) fail_json(503, 'Icerik katalogu bozuk.');
    // 2.8.1 ve daha eski istemciler .prfpset yolunu tanimaz. Onlara katalogu
    // filtreleyerek mevcut MOGRT/SFX/Motion BG esitlemesini bozmadan surdur.
    $clientVersion = trim((string)($input['client_version'] ?? ''));
    if ($clientVersion === '' || version_compare($clientVersion, '2.8.2', '<')) {
        $manifest['files'] = array_values(array_filter($manifest['files'], static function ($item): bool {
            $path = strtolower(str_replace('\\', '/', (string)($item['path'] ?? '')));
            return !str_starts_with($path, 'presets/');
        }));
        $manifest['total_bytes'] = array_sum(array_map(static fn($item): int => (int)($item['bytes'] ?? 0), $manifest['files']));
        if (isset($manifest['counts']) && is_array($manifest['counts'])) {
            $manifest['counts']['presets'] = 0;
            $manifest['counts']['total'] = count($manifest['files']);
        }
    }
    // Davet odulleri ayri, yalniz eklenen bir kanaldan gelir: files[], content_version ve counts
    // aynen kalir (surum klasorleri degismez; Premiere ice aktarilmis SFX'i kilitler). 3.0 ve eskisi
    // bilinmeyen yol onekinde tum esitlemeyi durdurdugu icin extras yalniz 3.1.0+ istemciye gider.
    $refTier = 0;
    if ($clientVersion !== '' && version_compare($clientVersion, '3.1.0', '>=')) {
        $entry = referral_entry($cfg, hash('sha256', $license['id']));
        if ($entry !== null) $refTier = max((int)($entry['tier'] ?? 0), referral_tier_for((int)($entry['count'] ?? 0)));
        $extras = davet_extras($cfg, $refTier);
        if ($extras !== null) $manifest['extras'] = ['davet' => $extras];
        else $refTier = 0;
    }
    $manifest['ok'] = true;
    $manifest['token'] = make_token($cfg, $instanceId, $clientVersion !== '' && version_compare($clientVersion, '3.0.0', '>='), $refTier);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($action === 'file') {
    // Tam kutuphane ~1.700 dosya; dakikada 600 istek ilk kurulumu yavaslatmaz,
    // tek IP'den sinirsiz cekimi ise durdurur.
    if (!allow_request($cfg, 'file', (int)($cfg['file_rate_per_min'] ?? 600))) {
        header('Retry-After: 60');
        fail_json(429, 'Cok fazla indirme istegi. Bir dakika sonra tekrar dene.');
    }
    $token = (string)($input['token'] ?? '');
    $payload = verify_token($cfg, $token);
    if ($payload === false) fail_json(401, 'Indirme oturumu gecersiz veya suresi doldu.');
    if (!token_matches_instance($cfg, $payload, trim((string)($input['instance_id'] ?? '')))) {
        fail_json(401, 'Indirme oturumu bu cihaza ait degil.');
    }
    $file = safe_content_path($cfg, (string)($input['path'] ?? ''), (int)($payload['ref'] ?? 0));
    if ($file === false) fail_json(404, 'Icerik bulunamadi.');
    $size = filesize($file);
    if ($size === false) fail_json(500, 'Dosya okunamadi.');
    $start = 0; $end = $size - 1;
    $range = (string)($_SERVER['HTTP_RANGE'] ?? '');
    if ($range !== '') {
        if (!preg_match('/^bytes=(\d+)-$/', $range, $m)) {
            http_response_code(416); header("Content-Range: bytes */$size"); exit;
        }
        $start = (int)$m[1];
        if ($start < 0 || $start >= $size) { http_response_code(416); header("Content-Range: bytes */$size"); exit; }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    $length = $end - $start + 1;
    // Buyuk MOGRT/SFX dosyalarini PHP/OpenResty tamponuna yigmak yerine akit.
    // Paylasimli hosting izin vermiyorsa @ ile sessizce varsayilana doner.
    if (function_exists('set_time_limit')) @set_time_limit(0);
    @ini_set('zlib.output_compression', '0');
    while (ob_get_level() > 0) @ob_end_clean();
    header('Content-Type: application/octet-stream');
    header('Accept-Ranges: bytes');
    header('X-Accel-Buffering: no');
    header('Content-Length: ' . $length);
    header('Content-Disposition: attachment; filename="suflo-pro-content"');
    $handle = fopen($file, 'rb');
    if ($handle === false) fail_json(500, 'Dosya acilamadi.');
    if ($start > 0) fseek($handle, $start);
    $remaining = $length;
    while ($remaining > 0 && !feof($handle)) {
        $chunk = fread($handle, min(1048576, $remaining));
        if ($chunk === false) break;
        echo $chunk; $remaining -= strlen($chunk);
        if (function_exists('fastcgi_finish_request')) { /* cikti tamponu sunucu tarafinda yonetilir */ }
        flush();
    }
    fclose($handle);
    exit;
}

if ($action === 'referral' || $action === 'referral_stats') {
    if (!allow_request($cfg, 'referral', 6)) {
        header('Retry-After: 60');
        fail_json(429, 'Cok fazla davet istegi. Bir dakika sonra tekrar dene.');
    }
    // Uyuyan ozellik: kurucu anahtari ekleyip test satin alimini bitirene dek kapali
    if (!referral_enabled($cfg)) fail_json(503, 'Davet sistemi henuz acik degil.', ['reason' => 'referral_disabled']);
    $licenseKey = trim((string)($input['license_key'] ?? ''));
    $instanceId = trim((string)($input['instance_id'] ?? ''));
    $license = validate_license_data($cfg, $licenseKey, $instanceId);
    if ($license === false) fail_json(403, 'Lisans dogrulanamadi.');
    if (function_exists('set_time_limit')) @set_time_limit(120);
    $userHash = hash('sha256', $license['id']);
    $emailHash = $license['email'] !== '' ? hash('sha256', $license['email']) : '';

    $entry = referral_entry($cfg, $userHash);
    if ($entry === null || empty($entry['code'])) {
        if ($action === 'referral_stats') ok_json(['code' => null, 'count' => 0, 'tier' => 0]);
        // Olusturma kilit altinda: ayni lisansin es zamanli iki istegi iki indirim acmasin
        $locked = referral_lock($cfg);
        if ($locked === false) fail_json(503, 'Davet kaydi yazilamadi.', ['reason' => 'referral_storage']);
        [$handle, $data] = $locked;
        $entry = $data['users'][$userHash] ?? null;
        if (!is_array($entry) || empty($entry['code'])) {
            $created = referral_create_discount($cfg, $license['id'], $data['codes']);
            if ($created === false) {
                referral_unlock($handle);
                header('Retry-After: 3600');
                fail_json(503, 'Davet kodu su an olusturulamadi. Daha sonra tekrar dene.', ['reason' => 'referral_busy']);
            }
            $entry = ['code' => $created['code'], 'discount_id' => $created['discount_id'], 'email_hash' => $emailHash,
                'created_at' => time(), 'count' => 0, 'tier' => 0, 'counted_at' => 0];
            $data['users'][$userHash] = $entry;
            $data['codes'][$created['code']] = $userHash;
            referral_unlock($handle, $data);
        } else {
            referral_unlock($handle);
        }
    }

    // Sayac tembel tazelenir, 600 sn onbellek: Lemon Squeezy kotasi korunur
    if (time() - (int)($entry['counted_at'] ?? 0) >= 600 && !empty($entry['discount_id'])) {
        $count = referral_count($cfg, (string)$entry['discount_id'], (string)($entry['email_hash'] ?? $emailHash));
        if ($count !== false) {
            $locked = referral_lock($cfg);
            if ($locked !== false) {
                [$handle, $data] = $locked;
                $cur = $data['users'][$userHash] ?? $entry;
                $cur['count'] = $count;
                // kademe geri dusmez: kazanilan odul iadeyle geri alinmaz
                $cur['tier'] = max((int)($cur['tier'] ?? 0), referral_tier_for($count));
                $cur['counted_at'] = time();
                $data['users'][$userHash] = $cur;
                referral_unlock($handle, $data);
                $entry = $cur;
            }
        }
    }
    ok_json(referral_public($entry, $cfg));
}

if ($action === 'attribution') {
    if (!allow_request($cfg, 'attribution', 10)) {
        header('Retry-After: 60');
        fail_json(429, 'Cok fazla istek. Bir dakika sonra tekrar dene.');
    }
    $answer = (string)($input['answer'] ?? '');
    if (!in_array($answer, REFERRAL_ANSWERS, true)) fail_json(400, 'Gecersiz yanit.');
    $licenseKey = trim((string)($input['license_key'] ?? ''));
    $line = json_encode([
        'day' => gmdate('Y-m-d'),
        'answer' => $answer,
        // anahtarin kendisi degil ozeti: ayni kisinin cift yanitini ayirt etmeye yeter
        'license' => ($licenseKey !== '' && strlen($licenseKey) <= 256) ? hash('sha256', $licenseKey) : null
    ], JSON_UNESCAPED_SLASHES) . "\n";
    $path = (string)($cfg['attribution_path'] ?? '');
    if ($path === '') $path = dirname((string)($cfg['manifest_path'] ?? '')) . '/attribution.jsonl';
    @file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
    ok_json([]);
}

fail_json(400, 'Bilinmeyen islem.');
