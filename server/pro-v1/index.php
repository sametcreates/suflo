<?php
declare(strict_types=1);

/*
 * Suflo Pro Content API
 * - manifest: Lemon Squeezy lisansini dogrular, kisa omurlu indirme tokeni verir
 * - file: token dogrular, public_html disindaki Pro dosyalarini stream eder
 *
 * URL'lerde lisans anahtari/tokenu bulunmaz; istemci JSON POST kullanir.
 */

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, private');

function fail_json(int $status, string $message): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
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
function make_token(array $cfg, string $instanceId): string {
    $ttl = max(300, min(14400, (int)($cfg['token_ttl'] ?? 7200)));
    $payload = json_encode([
        'exp' => time() + $ttl,
        'iid' => hash('sha256', $instanceId),
        'nonce' => bin2hex(random_bytes(8))
    ], JSON_UNESCAPED_SLASHES);
    $body = b64url_encode((string)$payload);
    return $body . '.' . b64url_encode(hash_hmac('sha256', $body, (string)$cfg['token_secret'], true));
}
function verify_token(array $cfg, string $token): bool {
    if (strlen($token) > 2048 || substr_count($token, '.') !== 1) return false;
    [$body, $sig] = explode('.', $token, 2);
    $given = b64url_decode($sig);
    if ($given === false) return false;
    $expected = hash_hmac('sha256', $body, (string)$cfg['token_secret'], true);
    if (!hash_equals($expected, $given)) return false;
    $decoded = b64url_decode($body);
    $payload = $decoded === false ? null : json_decode($decoded, true);
    return is_array($payload) && isset($payload['exp']) && (int)$payload['exp'] >= time() && !empty($payload['iid']);
}

function allow_manifest_request(array $cfg): bool {
    // Lemon Squeezy lisans API kotasini rastgele anahtar denemelerine karsi koru.
    // IP'nin kendisi diske yazilmaz; yalniz SHA-256 dosya adi tutulur. Paylasimli
    // hosting yazmaya izin vermezse gercek musteriyi engellememek icin fail-open.
    $base = dirname((string)($cfg['manifest_path'] ?? '')) . '/rate-limit';
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
    $allowed = $count < 15;
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

function validate_license(array $cfg, string $licenseKey, string $instanceId): bool {
    if ($licenseKey === '' || $instanceId === '' || strlen($licenseKey) > 256 || strlen($instanceId) > 256) return false;
    [$status, $body] = post_form('https://api.lemonsqueezy.com/v1/licenses/validate', [
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
    return true;
}

function safe_content_path(array $cfg, string $relative): string|false {
    $relative = str_replace('\\', '/', trim($relative, '/'));
    if ($relative === '' || strlen($relative) > 260 || str_contains($relative, "\0")) return false;
    foreach (explode('/', $relative) as $part) if ($part === '' || $part === '.' || $part === '..') return false;
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
    if (!validate_license($cfg, $licenseKey, $instanceId)) fail_json(403, 'Lisans dogrulanamadi.');
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
    $manifest['ok'] = true;
    $manifest['token'] = make_token($cfg, $instanceId);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($action === 'file') {
    $token = (string)($input['token'] ?? '');
    if (!verify_token($cfg, $token)) fail_json(401, 'Indirme oturumu gecersiz veya suresi doldu.');
    $file = safe_content_path($cfg, (string)($input['path'] ?? ''));
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

fail_json(400, 'Bilinmeyen islem.');
