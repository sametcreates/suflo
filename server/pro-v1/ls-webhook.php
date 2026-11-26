<?php
declare(strict_types=1);

/*
 * Suflo — Lemon Squeezy siparis webhook'u -> Meta Conversions API (Purchase)
 *
 * Lemon Squeezy "order_created" olayini imzasiyla dogrular (X-Signature: ham govdenin
 * HMAC-SHA256 hex ozeti) ve siparisi Meta'ya Purchase olarak bildirir: tutar, para birimi,
 * event_id, fbc, fbp, tarayici bilgisi ve e-postanin SHA-256 ozeti.
 *
 * Yalniz suflo.app'te olcum iznini KABUL etmis alicinin siparisi gonderilir. Site
 * (docs/js/olcum.js) izin varsa odeme baglantisina checkout[custom][event_id] ekler; bu alan
 * yoksa (izin verilmedi ya da satin alma panelden basladi) Meta'ya hicbir sey gitmez.
 *
 * Erisim belirteci ve webhook sirri yalniz private/pro-v1/config.php'de durur; hicbir yanita ve
 * gunluge yazilmaz. meta_capi_enabled, meta_capi_token ve ls_webhook_secret ayarlanana dek
 * POST 503 doner (uyuyan ozellik). GET yalniz "hazir mi" bilgisini verir.
 */

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, private');

function yanit(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function metin($v): string {
    return (is_string($v) || is_int($v) || is_float($v)) ? (string)$v : '';
}
function tam($v): int {
    return is_int($v) ? $v : (is_numeric($v) ? (int)$v : 0);
}

function meta_hazir(array $cfg): bool {
    return !empty($cfg['meta_capi_enabled'])
        && preg_match('/^[0-9]{6,20}$/', metin($cfg['meta_pixel_id'] ?? '')) === 1
        && strlen(trim(metin($cfg['meta_capi_token'] ?? ''))) >= 20
        && strlen(metin($cfg['ls_webhook_secret'] ?? '')) >= 16;
}

/* ---------------- Lemon Squeezy: siparisi sade bir diziye cevir ---------------- */
// Odeme saglayicisi degisirse yalniz bu islev (ve imza denetimi) degisir; Meta tarafi ayni kalir.
function ls_siparis(array $payload): ?array {
    $data = $payload['data'] ?? null;
    if (!is_array($data) || metin($data['type'] ?? '') !== 'orders') return null;
    $a = $data['attributes'] ?? null;
    if (!is_array($a)) return null;
    $meta = is_array($payload['meta'] ?? null) ? $payload['meta'] : [];
    $item = is_array($a['first_order_item'] ?? null) ? $a['first_order_item'] : [];
    return [
        'id' => metin($data['id'] ?? ''),
        'status' => metin($a['status'] ?? ''),
        'refunded' => !empty($a['refunded']),
        'test' => !empty($a['test_mode']) || !empty($meta['test_mode']),
        'email' => strtolower(trim(metin($a['user_email'] ?? ''))),
        'currency' => strtoupper(trim(metin($a['currency'] ?? ''))),
        // tutarlar kurus cinsinden tam sayi
        'total' => tam($a['total'] ?? 0),
        'tax' => tam($a['tax'] ?? 0),
        'created' => metin($a['created_at'] ?? ''),
        'product' => metin($item['product_name'] ?? ''),
        'custom' => is_array($meta['custom_data'] ?? null) ? $meta['custom_data'] : [],
    ];
}

/* ---------------- Meta Conversions API ---------------- */
function meta_olay(array $cfg, array $o, string $eventId, string $fbc, string $fbp, string $ua): array {
    $now = time();
    $t = strtotime($o['created']);
    // Meta 7 gunden eski event_time'i (ve tum istegi) reddeder; gelecekteki zamani da kabul etmez
    if ($t === false || $t > $now || $t < $now - 6 * 86400) $t = $now;
    $user = [];
    if ($o['email'] !== '' && filter_var($o['email'], FILTER_VALIDATE_EMAIL) !== false) {
        $user['em'] = [hash('sha256', $o['email'])];
    }
    if ($fbc !== '') $user['fbc'] = $fbc;
    if ($fbp !== '') $user['fbp'] = $fbp;
    if ($ua !== '') $user['client_user_agent'] = $ua;
    $kaynak = trim(metin($cfg['meta_event_source_url'] ?? ''));
    return [
        'event_name' => 'Purchase',
        'event_time' => $t,
        'event_id' => $eventId,
        'action_source' => 'website',
        'event_source_url' => $kaynak !== '' ? $kaynak : 'https://suflo.app/',
        'user_data' => $user,
        'custom_data' => [
            'currency' => $o['currency'],
            // vergi haric tutar: sitedeki fiyat (749) ve InitiateCheckout degeriyle ayni olcek
            'value' => round(($o['total'] - $o['tax']) / 100, 2),
            'content_type' => 'product',
            'content_ids' => ['suflo-pro'],
            'content_name' => $o['product'] !== '' ? $o['product'] : 'Suflo Pro',
            'num_items' => 1,
            'order_id' => $o['id'],
        ],
    ];
}

function http_post_form(string $url, array $fields): array {
    $body = http_build_query($fields, '', '&', PHP_QUERY_RFC3986);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_USERAGENT => 'Suflo-Meta-CAPI/1.0'
        ]);
        $response = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        return [$status, is_string($response) ? $response : ''];
    }
    $context = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 12, 'ignore_errors' => true,
        'header' => "Accept: application/json\r\nContent-Type: application/x-www-form-urlencoded\r\nUser-Agent: Suflo-Meta-CAPI/1.0\r\n",
        'content' => $body
    ]]);
    $response = @file_get_contents($url, false, $context);
    $basliklar = function_exists('http_get_last_response_headers')
        ? (http_get_last_response_headers() ?? [])
        : ($http_response_header ?? []);
    $status = 0;
    foreach ($basliklar as $line) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', (string)$line, $m)) { $status = (int)$m[1]; break; }
    }
    return [$status, is_string($response) ? $response : ''];
}

/*
 * Olayi Meta'ya yollar. Belirtec istek GOVDESINDE gider (adres satirinda degil): sunucu ve vekil
 * gunluklerine dusmez. Doner: ok, http, received, trace, error, code. Hata iletisinde belirtec
 * gecerse yildizlanir.
 */
function meta_gonder(array $cfg, array $olay, string $testKodu): array {
    $taban = trim(metin($cfg['meta_api_base'] ?? ''));   // testler sahte sunucuya yonlendirir
    $taban = rtrim($taban !== '' ? $taban : 'https://graph.facebook.com', '/');
    $surum = metin($cfg['meta_api_version'] ?? '');
    if (preg_match('/^v[0-9]{1,3}\.[0-9]$/', $surum) !== 1) $surum = 'v27.0';
    $belirtec = trim(metin($cfg['meta_capi_token'] ?? ''));
    $fields = [
        'data' => (string)json_encode([$olay], JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE),
        'access_token' => $belirtec,
    ];
    if ($testKodu !== '') $fields['test_event_code'] = $testKodu;
    [$status, $body] = http_post_form($taban . '/' . $surum . '/' . metin($cfg['meta_pixel_id']) . '/events', $fields);
    $json = json_decode($body, true);
    $alinan = is_array($json) ? tam($json['events_received'] ?? 0) : 0;
    $hata = ''; $kod = 0;
    if (is_array($json) && is_array($json['error'] ?? null)) {
        $kod = tam($json['error']['code'] ?? 0);
        $hata = metin($json['error']['error_user_msg'] ?? '');
        if ($hata === '') $hata = metin($json['error']['message'] ?? '');
        if ($belirtec !== '') $hata = str_replace($belirtec, '***', $hata);
        $hata = substr((string)preg_replace('/[^\x20-\x7E]/', ' ', $hata), 0, 300);
    }
    return [
        'ok' => $status === 200 && $alinan >= 1,
        'http' => $status,
        'received' => $alinan,
        'trace' => is_array($json) ? substr(metin($json['fbtrace_id'] ?? ''), 0, 64) : '',
        'error' => $hata,
        'code' => $kod,
    ];
}

/* ---------------- kayit: gunluk ve "bu siparis gonderildi" isareti ---------------- */
// Gunlukte e-posta, belirtec, sir, fbc/fbp YOK: yalniz siparis numarasi ve sonuc.
function gunluk(string $path, array $satir): void {
    if ($path === '') return;
    if ((int)@filesize($path) > 1048576) @rename($path, $path . '.1');
    $satir = array_merge(['t' => gmdate('Y-m-d\TH:i:s\Z')], $satir);
    @file_put_contents($path, json_encode($satir, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
}
// Lemon Squeezy basarisiz teslimati 3 kez daha dener, panelden elle de yeniden gonderilebilir:
// ayni siparis ikinci kez Meta'ya gitmesin. Doner: ['yeni'|'var'|'yok', yol]. Dizin yazilamiyorsa
// 'yok': gonderim yine yapilir (Meta ayni event_id + event_name'i zaten tek sayar).
function isaret_al(string $dir, string $siparisNo): array {
    if ($dir === '' || $siparisNo === '') return ['yok', ''];
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) return ['yok', ''];
    $path = rtrim($dir, '/\\') . '/' . hash('sha256', $siparisNo) . '.json';
    $h = @fopen($path, 'x');
    if ($h === false) return [is_file($path) ? 'var' : 'yok', $path];
    fwrite($h, (string)json_encode(['t' => time()]));
    fclose($h);
    return ['yeni', $path];
}

/* ---------------- istek ---------------- */
$configPath = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/private/pro-v1/config.php';
$cfg = [];
if (is_file($configPath)) {
    $cfg = require $configPath;
}
if (!is_array($cfg)) $cfg = [];

$method = (string)($_SERVER['REQUEST_METHOD'] ?? '');
if ($method === 'GET') {
    // Kurulum denetimi: gizli hicbir sey donmez
    yanit(200, ['ok' => true, 'service' => 'suflo-ls-webhook', 'ready' => meta_hazir($cfg)]);
}
if ($method !== 'POST') {
    header('Allow: GET, POST');
    yanit(405, ['ok' => false, 'error' => 'Yalniz POST desteklenir.']);
}
if (!meta_hazir($cfg)) {
    yanit(503, ['ok' => false, 'error' => 'Meta Conversions API yapilandirilmadi.']);
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') yanit(400, ['ok' => false, 'error' => 'Bos istek.']);
if (strlen($raw) > 262144) yanit(413, ['ok' => false, 'error' => 'Istek cok buyuk.']);

// Imza, govde cozulmeden once ve sabit zamanli karsilastirmayla denetlenir
$verilen = strtolower(trim(metin($_SERVER['HTTP_X_SIGNATURE'] ?? '')));
$beklenen = hash_hmac('sha256', $raw, metin($cfg['ls_webhook_secret']));
if ($verilen === '' || !hash_equals($beklenen, $verilen)) {
    yanit(401, ['ok' => false, 'error' => 'Imza dogrulanamadi.']);
}

$payload = json_decode($raw, true);
if (!is_array($payload)) yanit(400, ['ok' => false, 'error' => 'JSON bekleniyor.']);
$olayAdi = is_array($payload['meta'] ?? null) ? metin($payload['meta']['event_name'] ?? '') : '';
// Baska olaylar (iade, abonelik...) kabul edilir ama islenmez: 200, Lemon Squeezy yeniden denemesin
if ($olayAdi !== 'order_created') yanit(200, ['ok' => true, 'sent' => false, 'reason' => 'event_ignored']);

$o = ls_siparis($payload);
if ($o === null || $o['id'] === '') yanit(200, ['ok' => true, 'sent' => false, 'reason' => 'not_an_order']);

$ozel = dirname($configPath);
$gunlukYolu = metin($cfg['meta_log_path'] ?? '');
if ($gunlukYolu === '') $gunlukYolu = $ozel . '/meta-webhook.log';
$isaretDizini = metin($cfg['meta_sent_dir'] ?? '');
if ($isaretDizini === '') $isaretDizini = $ozel . '/meta-sent';

$atla = static function (string $neden) use ($gunlukYolu, $o): void {
    gunluk($gunlukYolu, ['order' => $o['id'], 'result' => 'skipped', 'reason' => $neden, 'test' => $o['test']]);
    yanit(200, ['ok' => true, 'sent' => false, 'reason' => $neden]);
};

if ($o['status'] !== 'paid') $atla('not_paid');
if ($o['refunded']) $atla('refunded');

// Izin isareti: site yalniz olcum izni verilmisse event_id ekler
$eventId = metin($o['custom']['event_id'] ?? '');
if (preg_match('/^[A-Za-z0-9._\-]{8,64}$/', $eventId) !== 1) $atla('no_consent');

$testKodu = trim(metin($cfg['meta_test_event_code'] ?? ''));
if (preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $testKodu) !== 1) $testKodu = '';
// Test modundaki siparis yalniz test kodu tanimliyken (Events Manager > Test events) gider
if ($o['test'] && $testKodu === '') $atla('test_mode');

if ($o['total'] - $o['tax'] <= 0 || preg_match('/^[A-Z]{3}$/', $o['currency']) !== 1) $atla('no_value');

// Siteden gelen alanlar bicimine uymuyorsa atilir; oldugu gibi Meta'ya aktarilmaz
$fbc = metin($o['custom']['fbc'] ?? '');
if (preg_match('/^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_.\-]{8,1000}$/', $fbc) !== 1) $fbc = '';
$fbp = metin($o['custom']['fbp'] ?? '');
if (preg_match('/^fb\.[0-9]\.[0-9]{10,16}\.[0-9]{1,24}$/', $fbp) !== 1) $fbp = '';
$ua = substr(trim((string)preg_replace('/[^\x20-\x7E]/', '', metin($o['custom']['ua'] ?? ''))), 0, 512);

$olay = meta_olay($cfg, $o, $eventId, $fbc, $fbp, $ua);
// Eslestirilecek hicbir bilgi yoksa Meta olayi zaten reddeder: bosuna yeniden deneme dongusu baslatma
if (count($olay['user_data']) === 0) $atla('no_user_data');

[$isaret, $isaretYolu] = isaret_al($isaretDizini, $o['id']);
if ($isaret === 'var') $atla('duplicate');

$sonuc = meta_gonder($cfg, $olay, $testKodu);
if (!$sonuc['ok']) {
    // Isaret geri alinir ki Lemon Squeezy'nin yeniden denemesi islenebilsin
    if ($isaret === 'yeni') @unlink($isaretYolu);
    gunluk($gunlukYolu, ['order' => $o['id'], 'result' => 'failed', 'http' => $sonuc['http'], 'code' => $sonuc['code'],
        'error' => $sonuc['error'], 'trace' => $sonuc['trace'], 'test' => $o['test']]);
    yanit(502, ['ok' => false, 'sent' => false, 'error' => 'Meta olayi kabul etmedi.', 'meta_http' => $sonuc['http'],
        'meta_code' => $sonuc['code'], 'meta_error' => $sonuc['error']]);
}
gunluk($gunlukYolu, ['order' => $o['id'], 'result' => 'sent', 'http' => $sonuc['http'], 'received' => $sonuc['received'],
    'trace' => $sonuc['trace'], 'click_id' => $fbc !== '', 'browser_id' => $fbp !== '', 'test' => $o['test']]);
yanit(200, ['ok' => true, 'sent' => true, 'test' => $o['test']]);
