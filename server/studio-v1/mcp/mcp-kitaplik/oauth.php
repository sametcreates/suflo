<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP: OAuth 2.1 yetkilendirme sunucusu (tek kullanici).
 *   /<uygulama>/oauth/register   RFC 7591 dinamik istemci kaydi (redirect_uri izin listesi, hiz sinirli)
 *   /<uygulama>/oauth/authorize  GET onay sayfasi (Studio sifresi + izinler), POST onay (CSRF + tarayici cerezi)
 *   /<uygulama>/oauth/token      authorization_code (yalniz PKCE S256) ve refresh_token (her kullanimda yenisi)
 *   /<uygulama>/oauth/revoke     RFC 7009
 * Yonlendirmelerde iss (RFC 9207) ve state; resource (RFC 8707) kanonik MCP adresine esit olmali.
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

function mcp_oauth_hata(int $kod, string $hata, string $aciklama, array $basliklar = []): void {
    mcp_json($kod, ['error' => $hata, 'error_description' => $aciklama], $basliklar);
}

function mcp_oauth_calistir(): void {
    $uyg = preg_quote(mcp_ortam('uygulama'), '#');
    if (!preg_match('#^/' . $uyg . '/oauth/(authorize|token|register|revoke)$#', mcp_yol(), $m)) {
        mcp_json(404, ['error' => 'not_found']);
    }
    $uc = $m[1];
    $sayfa = $uc === 'authorize' && mcp_yontem() !== 'POST';
    try {
        if (!mcp_acik_mi()) {
            if ($sayfa) mcp_sayfa_hata(503, 'Sohbet bağlantıları kapalı', 'Suflo Studio sohbet bağlantıları şu an kapalı.');
            mcp_oauth_hata(503, 'temporarily_unavailable', 'MCP kapali.');
        }
        mcp_buda();
        switch ($uc) {
            case 'register': mcp_kayit(); break;
            case 'authorize': mcp_yontem() === 'POST' ? mcp_yetki_onay() : mcp_yetki_sayfa(); break;
            case 'token': mcp_token(); break;
            case 'revoke': mcp_iptal(); break;
        }
    } catch (Throwable $e) {
        $mesgul = mcp_mesgul_mu($e);
        if (!$mesgul && !($e instanceof McpKurulumHatasi)) error_log('suflo-mcp oauth: ' . get_class($e) . ': ' . $e->getMessage());
        if ($sayfa) mcp_sayfa_hata(503, 'Sunucu meşgul', 'Biraz sonra yeniden dene.');
        if ($uc === 'authorize') mcp_json(503, ['hata' => 'Sunucu meşgul; biraz sonra yeniden dene.'], ['Retry-After: 2']);
        if ($mesgul || $e instanceof McpKurulumHatasi) mcp_oauth_hata(503, 'temporarily_unavailable', 'Sunucu mesgul; yeniden dene.', ['Retry-After: 2']);
        mcp_oauth_hata(500, 'server_error', 'Sunucu hatasi.');
    }
}

/* ---------------- Ortak ---------------- */

/** Istenen kapsamlar: studio.yaz studio.oku'yu da kapsar; studio.oku zorunlu. offline_access ve taninmayanlar yok sayilir. Hic taninan yoksa null. */
function mcp_kapsam_coz(?string $s): ?array {
    if ($s === null || trim($s) === '') return MCP_KAPSAMLAR;
    $istenen = preg_split('/\s+/', trim($s)) ?: [];
    if (!array_intersect(MCP_KAPSAMLAR, $istenen)) return null;
    return in_array(MCP_KAPSAM_YAZ, $istenen, true) ? MCP_KAPSAMLAR : [MCP_KAPSAM_OKU];
}
function mcp_yonlendirme_url(string $ru, array $p): string {
    $p = array_filter($p, fn ($v) => $v !== null);
    return $ru . (str_contains($ru, '?') ? '&' : '?') . http_build_query($p, '', '&', PHP_QUERY_RFC3986);
}
function mcp_onay_cerez_adi(string $id): string {
    $ad = 'suflo_mcp_onay_' . substr($id, 0, 12);
    return mcp_c('cookie_secure') ? '__Host-' . $ad : $ad;
}
function mcp_onay_cerez(string $id, string $deger, int $omur): void {
    setcookie(mcp_onay_cerez_adi($id), $deger, [
        'expires' => $omur > 0 ? mcp_zaman() + $omur : 1,
        'path' => '/',
        'secure' => (bool)mcp_c('cookie_secure'),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}
/**
 * Istemci dogrulama (token, revoke). Public istemci (none): client_id yeter. Sirli istemci: client_secret_basic
 * ya da client_secret_post (ikisi de kabul). Basarisizsa 401 invalid_client ile cikar.
 */
function mcp_istemci_dogrula(array $p): array {
    $basic = false;
    $id = $p['client_id'] ?? null;
    $sir = $p['client_secret'] ?? null;
    $yb = mcp_yetki_basligi();
    if ($yb !== null && preg_match('/^Basic\s+([A-Za-z0-9+\/=]+)\s*$/i', $yb, $m)) {
        $coz = base64_decode($m[1], true);
        if ($coz === false || !str_contains($coz, ':')) mcp_oauth_hata(401, 'invalid_client', 'Basic kimlik bilgisi bozuk.', ['WWW-Authenticate: Basic realm="suflo-studio"']);
        [$a, $b] = explode(':', $coz, 2);
        if ($id !== null && $id !== urldecode($a)) mcp_oauth_hata(400, 'invalid_request', 'client_id iki farkli yerde farkli.');
        if ($sir !== null) mcp_oauth_hata(400, 'invalid_request', 'Birden cok istemci dogrulama yontemi.');
        $id = urldecode($a);
        $sir = urldecode($b);
        $basic = true;
    }
    $red = fn () => mcp_oauth_hata(401, 'invalid_client', 'Istemci dogrulanamadi.', $basic ? ['WWW-Authenticate: Basic realm="suflo-studio"'] : []);
    if (!is_string($id) || $id === '' || strlen($id) > 100) $red();
    $ist = mcp_tek('SELECT * FROM mcp_istemci WHERE id = ?', [$id]);
    if (!$ist) $red();
    if ($ist['yontem'] !== 'none') {
        if (!is_string($sir) || $sir === '' || !hash_equals((string)$ist['sir_ozet'], mcp_ozet($sir))) $red();
    }
    return $ist;
}
/** OAuth POST formu: dogru icerik turu, boyut, yinelenen parametre yok. */
function mcp_oauth_form(): array {
    if (mcp_yontem() !== 'POST') mcp_oauth_hata(405, 'invalid_request', 'Yalniz POST.', ['Allow: POST']);
    if (mcp_icerik_turu() !== 'application/x-www-form-urlencoded') mcp_oauth_hata(400, 'invalid_request', 'Content-Type application/x-www-form-urlencoded olmali.');
    $g = mcp_govde_oku(MCP_FORM_SINIRI);
    if ($g === null) mcp_oauth_hata(413, 'invalid_request', 'Istek cok buyuk.');
    [$p, $tekrar] = mcp_form_ayristir($g);
    if ($tekrar) mcp_oauth_hata(400, 'invalid_request', 'Yinelenen parametre: ' . implode(', ', $tekrar));
    return $p;
}

/* ---------------- /register (RFC 7591) ---------------- */

/** 429: RFC 7591 3.2.2 bicimli hata govdesi (error + error_description) ve Retry-After (saniye). */
function mcp_kayit_cok_fazla(int $saniye): void {
    mcp_oauth_hata(429, 'temporarily_unavailable', 'Cok fazla istemci kaydi; daha sonra yeniden dene.', ['Retry-After: ' . $saniye]);
}

function mcp_kayit(): void {
    if (mcp_yontem() !== 'POST') mcp_oauth_hata(405, 'invalid_request', 'Yalniz POST.', ['Allow: POST']);
    if (mcp_icerik_turu() !== 'application/json') mcp_oauth_hata(400, 'invalid_client_metadata', 'Content-Type application/json olmali.');
    $g = mcp_govde_oku(16384);
    if ($g === null) mcp_oauth_hata(413, 'invalid_client_metadata', 'Istek cok buyuk.');
    $m = json_decode($g, true, 16);
    if (!is_array($m) || ($m !== [] && array_is_list($m))) mcp_oauth_hata(400, 'invalid_client_metadata', 'Govde JSON nesnesi olmali.');
    // Hiz siniri (IP): ayni IP'den saatte 10 istek; dogrulamadan ONCE sayilir (bozuk istek de sayilir)
    if (!mcp_hiz('kayit|ip|' . mcp_ip_ozet(), 3600, 10)) mcp_kayit_cok_fazla(3600);
    $ru = $m['redirect_uris'] ?? null;
    if (!is_array($ru) || $ru === [] || count($ru) > 5 || !array_is_list($ru)) mcp_oauth_hata(400, 'invalid_redirect_uri', 'redirect_uris 1-5 adreslik bir liste olmali.');
    foreach ($ru as $u) {
        if (!is_string($u) || !mcp_yonlendirme_izinli($u)) mcp_oauth_hata(400, 'invalid_redirect_uri', 'Bu donus adresine izin yok.');
    }
    $ru = array_values(array_unique($ru));
    $yontem = $m['token_endpoint_auth_method'] ?? 'none';
    if (!in_array($yontem, ['none', 'client_secret_post', 'client_secret_basic'], true)) {
        mcp_oauth_hata(400, 'invalid_client_metadata', 'token_endpoint_auth_method: none, client_secret_post ya da client_secret_basic.');
    }
    $metinListesi = fn ($v) => is_array($v) && array_is_list($v) && !array_filter($v, fn ($x) => !is_string($x));
    $gt = $m['grant_types'] ?? ['authorization_code', 'refresh_token'];
    if (!$metinListesi($gt) || !in_array('authorization_code', $gt, true) || array_diff($gt, ['authorization_code', 'refresh_token'])) {
        mcp_oauth_hata(400, 'invalid_client_metadata', 'grant_types yalniz authorization_code ve refresh_token olabilir.');
    }
    $rt = $m['response_types'] ?? ['code'];
    if (!$metinListesi($rt) || array_diff($rt, ['code']) || $rt === []) mcp_oauth_hata(400, 'invalid_client_metadata', 'response_types yalniz code olabilir.');
    $ad = $m['client_name'] ?? '';
    if (!is_string($ad)) mcp_oauth_hata(400, 'invalid_client_metadata', 'client_name metin olmali.');
    $ad = mcp_kisalt($ad, 100);
    if ($ad === '') $ad = 'Adsız uygulama';
    $tur = $m['application_type'] ?? 'web';
    if (!in_array($tur, ['web', 'native'], true)) mcp_oauth_hata(400, 'invalid_client_metadata', 'application_type web ya da native olmali.');
    $kapsam = MCP_KAPSAMLAR;
    if (isset($m['scope'])) {
        if (!is_string($m['scope'])) mcp_oauth_hata(400, 'invalid_client_metadata', 'scope metin olmali.');
        $kapsam = mcp_kapsam_coz($m['scope']) ?? MCP_KAPSAMLAR;
    }
    $id = mcp_rastgele(18);
    $sir = $yontem === 'none' ? null : mcp_rastgele(32);
    $n = mcp_zaman();
    // Genel sinir: gunde 50 kayit. Yalniz butun dogrulamalardan GECEN kayitlar sayilir (reddedilen bozuk istekler gunluk
    // kotayi tuketip claude.ai / ChatGPT kayitlarini engellemesin). Sayac ve ekleme ayni islemde: eklenmeyen kayit sayilmaz.
    // Her kayit yeni bir istemci acar; var olan bir istemci asla degistirilmez ya da ezilmez.
    $eklendi = mcp_islem(function () use ($id, $ad, $ru, $yontem, $sir, $tur, $kapsam, $n) {
        if (!mcp_hiz(MCP_KAYIT_SAYACI, 86400, MCP_KAYIT_GUNLUK_SINIRI)) return false;
        mcp_calistir('INSERT INTO mcp_istemci (id, ad, yonlendirmeler, yontem, sir_ozet, uygulama_turu, kapsam, olusturma, ip_ozet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $ad, mcp_json_metin($ru), $yontem, $sir === null ? null : mcp_ozet($sir), $tur, implode(' ', $kapsam), $n, mcp_ip_ozet()]);
        return true;
    });
    if (!$eklendi) mcp_kayit_cok_fazla(max(60, 86400 - $n % 86400));
    mcp_gunluk($ad, 'istemci_kaydi', 'tamam', [], 'Donus: ' . implode(', ', array_map(fn ($u) => (string)parse_url($u, PHP_URL_HOST), $ru)));
    $yanit = [
        'client_id' => $id,
        'client_id_issued_at' => $n,
        'client_name' => $ad,
        'redirect_uris' => $ru,
        'grant_types' => ['authorization_code', 'refresh_token'],
        'response_types' => ['code'],
        'token_endpoint_auth_method' => $yontem,
        'application_type' => $tur,
        'scope' => implode(' ', $kapsam),
    ];
    if ($sir !== null) { $yanit['client_secret'] = $sir; $yanit['client_secret_expires_at'] = 0; }
    mcp_json(201, $yanit);
}

/* ---------------- /authorize ---------------- */

/** Onay sayfasi iskeleti. Betik ve stil ayri dosyadan (CSP: script-src 'self'; satir ici yok). */
function mcp_sayfa(int $kod, string $baslik, string $govde): void {
    http_response_code($kod);
    mcp_ortak_basliklar();
    header('Content-Type: text/html; charset=utf-8');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    $u = '/' . rawurlencode(mcp_ortam('uygulama'));
    $h = fn ($s) => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    echo '<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex, nofollow"><title>' . $h($baslik) . ' · Suflo Studio</title>'
        . '<link rel="stylesheet" href="' . $u . '/mcp-onay.css"></head><body><main class="kart">'
        . '<p class="marka">Suflo Studio</p><h1>' . $h($baslik) . '</h1>' . $govde . '</main></body></html>';
    exit;
}
function mcp_sayfa_hata(int $kod, string $baslik, string $mesaj): void {
    mcp_sayfa($kod, $baslik, '<p>' . htmlspecialchars($mesaj, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . '</p>');
}
/** Hata yonlendirmesi (istemci ve donus adresi dogrulandiktan sonra): error, error_description, state, iss. */
function mcp_yetki_hata_yonlendir(string $ru, string $hata, string $aciklama, ?string $state): void {
    http_response_code(302);
    mcp_ortak_basliklar();
    header('Location: ' . mcp_yonlendirme_url($ru, ['error' => $hata, 'error_description' => $aciklama, 'state' => $state, 'iss' => mcp_ortam('issuer')]));
    exit;
}

function mcp_yetki_sayfa(): void {
    if (mcp_yontem() !== 'GET' && mcp_yontem() !== 'HEAD') mcp_sayfa_hata(405, 'Geçersiz istek', 'Yalnız GET.');
    if (!mcp_hiz('yetki|' . mcp_ip_ozet(), 600, 60)) mcp_sayfa_hata(429, 'Çok fazla istek', 'Biraz sonra yeniden dene.');
    [$p, $tekrar] = mcp_form_ayristir((string)($_SERVER['QUERY_STRING'] ?? ''));
    $istemciId = $p['client_id'] ?? '';
    $ist = $istemciId !== '' && strlen($istemciId) <= 100 && !in_array('client_id', $tekrar, true)
        ? mcp_tek('SELECT * FROM mcp_istemci WHERE id = ?', [$istemciId]) : null;
    if (!$ist) mcp_sayfa_hata(400, 'Bilinmeyen uygulama', 'Bu bağlantı isteğindeki uygulama tanınmıyor. Sohbet uygulamasından bağlantıyı yeniden başlat.');
    $kayitli = json_decode((string)$ist['yonlendirmeler'], true) ?: [];
    $ru = $p['redirect_uri'] ?? null;
    $acik = $ru !== null;
    if ($ru === null && count($kayitli) === 1) $ru = $kayitli[0];
    // Donus adresi dogrulanmadan hicbir yere yonlendirilmez (acik yonlendirme yok)
    if (!is_string($ru) || in_array('redirect_uri', $tekrar, true) || !in_array($ru, $kayitli, true) || !mcp_yonlendirme_izinli($ru)) {
        mcp_sayfa_hata(400, 'Geçersiz dönüş adresi', 'Bu bağlantı isteğinin dönüş adresine izin verilmiyor.');
    }
    $state = isset($p['state']) && strlen($p['state']) <= 2048 ? $p['state'] : null;
    $don = fn (string $h, string $a) => mcp_yetki_hata_yonlendir($ru, $h, $a, $state);
    if (isset($p['state']) && $state === null) $don('invalid_request', 'state cok uzun.');
    if ($tekrar) $don('invalid_request', 'Yinelenen parametre: ' . implode(', ', $tekrar));
    if (($p['response_type'] ?? '') !== 'code') $don('unsupported_response_type', 'Yalniz response_type=code.');
    $meydan = $p['code_challenge'] ?? '';
    if ($meydan === '') $don('invalid_request', 'PKCE gerekli: code_challenge eksik.');
    if (($p['code_challenge_method'] ?? '') !== 'S256') $don('invalid_request', 'Yalniz code_challenge_method=S256.');
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $meydan)) $don('invalid_request', 'code_challenge bicimi gecersiz.');
    if (isset($p['resource']) && !mcp_kaynak_bizim_mi($p['resource'])) $don('invalid_target', 'resource bu MCP sunucusu degil.');
    $kapsamlar = mcp_kapsam_coz($p['scope'] ?? null);
    if ($kapsamlar === null) $don('invalid_scope', 'Desteklenen kapsamlar: studio.oku studio.yaz.');
    $istemciKapsami = explode(' ', (string)$ist['kapsam']);
    $kapsamlar = array_values(array_intersect($kapsamlar, $istemciKapsami)) ?: [MCP_KAPSAM_OKU];

    $id = mcp_rastgele(18);
    $csrf = mcp_rastgele(32);
    $cerez = mcp_rastgele(32);
    $n = mcp_zaman();
    mcp_calistir('INSERT INTO mcp_onay (id, csrf_ozet, cerez_ozet, istemci, yonlendirme, yonlendirme_acik, durum_param, meydan, kaynak, kapsam, olusturma, son)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$id, mcp_ozet($csrf), mcp_ozet($cerez), $ist['id'], $ru, $acik ? 1 : 0, $state, $meydan, mcp_ortam('kaynak'), implode(' ', $kapsamlar), $n, $n + MCP_ONAY_OMRU]);
    mcp_onay_cerez($id, $cerez, MCP_ONAY_OMRU);

    $h = fn ($s) => htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $host = (string)parse_url($ru, PHP_URL_HOST);
    $yerel = in_array($host, ['127.0.0.1', 'localhost'], true);
    $yazIstendi = in_array(MCP_KAPSAM_YAZ, $kapsamlar, true);
    $govde = '<p class="istek"><strong>' . $h($ist['ad']) . '</strong> <span class="soluk">(uygulamanın kendi verdiği ad)</span> Suflo Studio hesabına bağlanmak istiyor.</p>'
        . '<p>Onaydan sonra dönülecek adres: <strong class="adres">' . $h($host) . '</strong></p>'
        . ($yerel ? '<p class="uyari">Dikkat: dönüş adresi bu bilgisayardaki yerel bir uygulama. Bu bağlantıyı sen başlatmadıysan reddet.</p>' : '')
        . '<fieldset><legend>İzinler</legend>'
        . '<label class="izin"><input type="checkbox" checked disabled> <span><strong>Kayıtları okuma</strong>: müşteriler, takvim, içerikler (ücret bilgisi verilmez)</span></label>'
        . ($yazIstendi ? '<label class="izin"><input type="checkbox" id="yaz" checked> <span><strong>Kayıt ekleme ve durum güncelleme</strong>: müşteri, çekim, içerik. Silme yok.</span></label>' : '')
        . '</fieldset>'
        . '<label class="alan" for="sifre">Studio şifresi</label>'
        . '<input type="password" id="sifre" autocomplete="current-password" required autofocus>'
        . '<p class="hata" id="hata" role="alert" hidden></p>'
        . '<div class="dugmeler"><button type="button" id="izin" class="birincil">İzin ver</button> <button type="button" id="ret">Reddet</button></div>'
        . '<p class="soluk">Bu bağlantıyı istediğin zaman Studio → Ayarlar → Sohbet bağlantıları bölümünden kesebilirsin.</p>'
        . '<noscript><p class="hata">Bu sayfa JavaScript gerektirir.</p></noscript>'
        . '<div id="onay" hidden data-istek="' . $h($id) . '" data-csrf="' . $h($csrf) . '" data-adres="' . $h('/' . mcp_ortam('uygulama') . '/oauth/authorize') . '"></div>'
        . '<script src="/' . rawurlencode(mcp_ortam('uygulama')) . '/mcp-onay.js"></script>';
    mcp_sayfa(200, 'Sohbet bağlantısı', $govde);
}

/** Onay sayfasindan gelen karar (fetch, form-urlencoded). Yanit JSON: {yonlendir} ya da {hata}. */
function mcp_yetki_onay(): void {
    $yanit = fn (int $kod, string $mesaj, array $ek = []) => mcp_json($kod, ['hata' => $mesaj], $ek);
    if (mcp_icerik_turu() !== 'application/x-www-form-urlencoded') $yanit(415, 'Geçersiz istek.');
    // Capraz siteli form gonderimi bu basligi ekleyemez; Origin de bu adres olmali (CSRF jetonuna ek katman)
    if (mcp_baslik('X-Suflo-Onay') !== '1') $yanit(403, 'Geçersiz istek.');
    $origin = mcp_baslik('Origin');
    if ($origin === null || strtolower(rtrim($origin, '/')) !== mcp_ortam('kok')) $yanit(403, 'Bu adresten onay verilemez.');
    $g = mcp_govde_oku(8192);
    if ($g === null) $yanit(413, 'İstek çok büyük.');
    [$p] = mcp_form_ayristir($g);
    if (!mcp_hiz('onay|' . mcp_ip_ozet(), 900, 30)) $yanit(429, 'Çok fazla deneme. Biraz sonra yeniden dene.', ['Retry-After: 60']);
    $id = (string)($p['onay_istegi'] ?? '');
    $sure = 'Bu onay sayfasının süresi doldu ya da kullanıldı. Sohbet uygulamasından bağlantıyı yeniden başlat.';
    if (!preg_match('/^[A-Za-z0-9_-]{24}$/', $id)) $yanit(400, $sure);
    $r = mcp_tek('SELECT o.*, s.ad AS istemci_adi FROM mcp_onay o LEFT JOIN mcp_istemci s ON s.id = o.istemci WHERE o.id = ?', [$id]);
    if (!$r || (int)$r['kullanildi'] === 1 || (int)$r['son'] < mcp_zaman()) $yanit(400, $sure);
    if (!hash_equals((string)$r['csrf_ozet'], mcp_ozet((string)($p['csrf'] ?? '')))) $yanit(403, 'Güvenlik doğrulaması başarısız. Sayfayı sohbetten yeniden aç.');
    $cerez = $_COOKIE[mcp_onay_cerez_adi($id)] ?? '';
    if (!is_string($cerez) || !hash_equals((string)$r['cerez_ozet'], mcp_ozet($cerez))) $yanit(403, 'Güvenlik doğrulaması başarısız (tarayıcı). Sayfayı sohbetten yeniden aç.');
    $istemciAdi = (string)($r['istemci_adi'] ?? 'Bilinmeyen istemci');
    $ru = (string)$r['yonlendirme'];
    $state = $r['durum_param'];
    $karar = (string)($p['karar'] ?? '');

    if ($karar === 'ret') {
        if (mcp_calistir('UPDATE mcp_onay SET kullanildi = 1 WHERE id = ? AND kullanildi = 0', [$id]) !== 1) $yanit(400, $sure);
        mcp_onay_cerez($id, '', 0);
        mcp_gunluk($istemciAdi, 'yetki_ret', 'tamam', [], 'Sahip baglantiyi reddetti');
        mcp_json(200, ['yonlendir' => mcp_yonlendirme_url($ru, ['error' => 'access_denied', 'error_description' => 'Sahip izin vermedi.', 'state' => $state, 'iss' => mcp_ortam('issuer')])]);
    }
    if ($karar !== 'izin') $yanit(400, 'Geçersiz istek.');
    $sifre = $p['sifre'] ?? '';
    if ($sifre === '') $yanit(400, 'Studio şifresini yaz.');
    // Onay sayfasi basina en cok 10 deneme (panel kilidi ayrica ve once gelir)
    if (mcp_calistir('UPDATE mcp_onay SET deneme = deneme + 1 WHERE id = ? AND kullanildi = 0 AND deneme < 10', [$id]) !== 1) {
        $yanit(429, 'Bu sayfada çok fazla deneme yapıldı. Sohbet uygulamasından bağlantıyı yeniden başlat.');
    }
    $arka = mcp_arka();
    $s = $arka->sahip_sifre_dene($sifre);
    $durum = $s['durum'] ?? '';
    if ($durum === 'kilitli') { mcp_gunluk($istemciAdi, 'yetki', 'kilitli'); $yanit(429, 'Çok fazla hatalı deneme. Biraz sonra yeniden dene.', ['Retry-After: 60']); }
    if ($durum === 'kurulmadi') $yanit(503, 'Studio bağlantısı ya da şifresi henüz kurulmadı.');
    if ($durum === 'yanlis') { mcp_gunluk($istemciAdi, 'yetki', 'yanlis_sifre'); $yanit(401, 'Şifre yanlış.'); }
    $iz = $s['iz'] ?? null;
    if ($durum !== 'dogru' || !is_string($iz) || $iz === '') throw new RuntimeException('arka uc sahip_sifre_dene gecersiz yanit');
    // Dogrulama surerken sifre degistiyse eski sifreyle grant acilmaz (sonraki her istekte de iz karsilastirilir)
    $guncel = $arka->sahip_sifre_izi();
    if ($guncel === null || !hash_equals($guncel, $iz)) $yanit(409, 'Studio şifresi az önce değişti. Yeniden dene.');

    $kapsam = [MCP_KAPSAM_OKU];
    if (($p['yaz'] ?? '0') === '1' && in_array(MCP_KAPSAM_YAZ, explode(' ', (string)$r['kapsam']), true)) $kapsam[] = MCP_KAPSAM_YAZ;
    $kapsam = implode(' ', $kapsam);
    $kod = mcp_rastgele(32);
    $izinId = mcp_islem(function () use ($id, $kod, $kapsam, $iz) {
        $r = mcp_tek('SELECT * FROM mcp_onay WHERE id = ?', [$id]);
        $n = mcp_zaman();
        if (!$r || (int)$r['kullanildi'] === 1 || (int)$r['son'] < $n) return null;
        mcp_calistir('UPDATE mcp_onay SET kullanildi = 1 WHERE id = ?', [$id]);
        $izin = bin2hex(random_bytes(16));
        mcp_calistir("INSERT INTO mcp_izin (id, istemci, kapsam, kaynak, sifre_izi, olusturma, bitis, durum) VALUES (?, ?, ?, ?, ?, ?, ?, 'aktif')",
            [$izin, $r['istemci'], $kapsam, $r['kaynak'], $iz, $n, $n + MCP_IZIN_OMRU]);
        mcp_calistir('INSERT INTO mcp_kod (ozet, izin, istemci, yonlendirme, yonlendirme_acik, meydan, kaynak, kapsam, olusturma, son) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [mcp_ozet($kod), $izin, $r['istemci'], $r['yonlendirme'], (int)$r['yonlendirme_acik'], $r['meydan'], $r['kaynak'], $kapsam, $n, $n + MCP_KOD_OMRU]);
        mcp_calistir('UPDATE mcp_istemci SET son_kullanim = ? WHERE id = ?', [$n, $r['istemci']]);
        return $izin;
    });
    if ($izinId === null) $yanit(400, $sure);
    mcp_onay_cerez($id, '', 0);
    mcp_gunluk($istemciAdi, 'yetki_verildi', 'tamam', [], 'Kapsam: ' . $kapsam);
    mcp_json(200, ['yonlendir' => mcp_yonlendirme_url($ru, ['code' => $kod, 'state' => $state, 'iss' => mcp_ortam('issuer')])]);
}

/* ---------------- /token ---------------- */

function mcp_token(): void {
    $p = mcp_oauth_form();
    if (!mcp_hiz('token|' . mcp_ip_ozet(), 600, 120)) mcp_oauth_hata(429, 'temporarily_unavailable', 'Cok fazla istek.', ['Retry-After: 60']);
    $ist = mcp_istemci_dogrula($p);
    $tur = $p['grant_type'] ?? '';
    if ($tur === '') mcp_oauth_hata(400, 'invalid_request', 'grant_type eksik.');
    if ($tur === 'authorization_code') mcp_token_kod($p, $ist);
    if ($tur === 'refresh_token') mcp_token_yenile($p, $ist);
    mcp_oauth_hata(400, 'unsupported_grant_type', 'Yalniz authorization_code ve refresh_token.');
}

function mcp_token_kod(array $p, array $ist): void {
    $kod = $p['code'] ?? '';
    if (!is_string($kod) || $kod === '' || strlen($kod) > 200) mcp_oauth_hata(400, 'invalid_request', 'code eksik.');
    $guncelIz = mcp_arka()->sahip_sifre_izi();
    $sonuc = mcp_islem(function () use ($p, $ist, $kod, $guncelIz) {
        $r = mcp_tek('SELECT * FROM mcp_kod WHERE ozet = ?', [mcp_ozet($kod)]);
        if (!$r) return ['invalid_grant', 'Kod gecersiz.'];
        if ((int)$r['kullanildi'] === 1) {
            // Ikinci kullanim: kod calinmis olabilir; bu koddan cikan butun jetonlar (grant) iptal
            mcp_calistir("UPDATE mcp_izin SET durum = 'iptal', iptal_nedeni = 'kod_tekrar', iptal_zamani = ? WHERE id = ? AND durum = 'aktif'", [mcp_zaman(), $r['izin']]);
            mcp_calistir("UPDATE mcp_jeton SET durum = 'iptal' WHERE izin = ? AND durum = 'aktif'", [$r['izin']]);
            return ['invalid_grant', 'Kod daha once kullanildi.', 'kod_tekrar'];
        }
        // Bundan sonra her yolda kod yanar (tek kullanimlik)
        mcp_calistir('UPDATE mcp_kod SET kullanildi = 1 WHERE ozet = ?', [$r['ozet']]);
        if ((int)$r['son'] < mcp_zaman()) return ['invalid_grant', 'Kodun suresi doldu.'];
        if (!hash_equals((string)$r['istemci'], (string)$ist['id'])) return ['invalid_grant', 'Kod bu istemciye verilmedi.'];
        $ru = $p['redirect_uri'] ?? null;
        if ($ru === null && (int)$r['yonlendirme_acik'] === 1) return ['invalid_grant', 'redirect_uri eksik.'];
        if ($ru !== null && !hash_equals((string)$r['yonlendirme'], (string)$ru)) return ['invalid_grant', 'redirect_uri uyusmuyor.'];
        $dogrulayici = $p['code_verifier'] ?? '';
        if (!is_string($dogrulayici) || !preg_match('/^[A-Za-z0-9._~-]{43,128}$/', $dogrulayici)) return ['invalid_grant', 'PKCE code_verifier eksik ya da gecersiz.'];
        if (!hash_equals((string)$r['meydan'], mcp_b64url(hash('sha256', $dogrulayici, true)))) return ['invalid_grant', 'PKCE dogrulanamadi.'];
        if (isset($p['resource']) && !mcp_kaynak_bizim_mi((string)$p['resource'])) return ['invalid_target', 'resource bu MCP sunucusu degil.'];
        $izin = mcp_tek('SELECT * FROM mcp_izin WHERE id = ?', [$r['izin']]);
        if (!$izin || $izin['durum'] !== 'aktif' || (int)$izin['bitis'] <= mcp_zaman()) return ['invalid_grant', 'Izin gecersiz.'];
        if ($guncelIz === null || !hash_equals((string)$izin['sifre_izi'], $guncelIz)) return ['invalid_grant', 'Studio sifresi degisti; yeniden baglan.'];
        return ['tamam', mcp_jeton_ver($izin, (string)$r['kapsam']), $izin];
    });
    if ($sonuc[0] !== 'tamam') {
        if (($sonuc[2] ?? '') === 'kod_tekrar') mcp_gunluk((string)$ist['ad'], 'kod_tekrar', 'iptal', [], 'Ayni yetki kodu ikinci kez kullanildi; baglanti iptal edildi');
        mcp_oauth_hata(400, $sonuc[0], $sonuc[1]);
    }
    mcp_gunluk((string)$ist['ad'], 'jeton_verildi', 'tamam', [], 'Kapsam: ' . $sonuc[1]['scope']);
    mcp_json(200, $sonuc[1]);
}

/**
 * Donusturulmus (durum 'kullanildi') bir yenileme jetonu yeniden geldiginde tolerans karari. Tipik neden: access token
 * suresi dolunca istemcinin paralel iki istegi ayni refresh token ile iki kez yeniler; ikincisi saniyeler icinde gelir.
 * Doner: ['tolerans', halef satiri] (iptal yok, ikinci bir kardes jeton verilir), ['red'] (iptal yok, yalniz invalid_grant)
 * ya da ['iptal'] (tekrar algilama: grant'in tamami iptal).
 * Tolerans icin hepsi gerekir: ayni istemci, donusumden en cok MCP_YENILEME_TOLERANSI saniye gecmis, grant etkin ve
 * suresi dolmamis, panel sifre izi degismemis, halef (donusumde verilen yeni yenileme jetonu) hala etkin ve hic kullanilmamis.
 * Halef bir kez kullanildiysa ya da pencere gectiyse eski jetonun gelmesi calinma belirtisidir: tam iptal (eskisi gibi).
 */
function mcp_yenileme_toleransi(array $r, array $ist, ?array $izin, ?string $guncelIz, int $n): array {
    if ($r['donusum'] === null || $r['halef'] === null) return ['iptal'];
    $gecen = $n - (int)$r['donusum'];
    if ($gecen < 0 || $gecen > MCP_YENILEME_TOLERANSI) return ['iptal'];
    if (!hash_equals((string)$r['istemci'], (string)$ist['id'])) return ['iptal'];
    if (!$izin || $izin['durum'] !== 'aktif' || (int)$izin['bitis'] <= $n) return ['iptal'];
    if ($guncelIz === null || !hash_equals((string)$izin['sifre_izi'], $guncelIz)) return ['iptal'];
    $h = mcp_tek("SELECT * FROM mcp_jeton WHERE ozet = ? AND tur = 'yenileme'", [(string)$r['halef']]);
    if (!$h || $h['durum'] !== 'aktif' || (int)$h['son'] <= $n || $h['izin'] !== $r['izin'] || $h['ebeveyn'] === null) return ['iptal'];
    $kardes = (int)mcp_tek("SELECT COUNT(*) AS c FROM mcp_jeton WHERE tur = 'yenileme' AND ebeveyn = ? AND durum = 'aktif'", [(string)$h['ebeveyn']])['c'];
    if ($kardes >= MCP_YENILEME_KARDES_SINIRI) return ['red'];
    return ['tolerans', $h];
}

/**
 * refresh_token: her kullanimda yeni access + YENI refresh token (donusum). Eski jeton 'kullanildi' olur; donusum zamani ve
 * halefin ozeti saklanir. Tolerans penceresinde (bkz. mcp_yenileme_toleransi) eski jetonla gelen ikinci istege, halefi
 * iptal ETMEDEN onun kardesi olan yeni bir cift verilir: istemci hangi yaniti saklarsa saklasin calisir (yanitlarin hangisinin
 * en son yazildigi belli degildir; halef iptal edilseydi ilk yaniti saklayan istemcinin baglantisi bir saat sonra kopardi).
 * Kardeslerden biri dondurulunce digerleri de 'kullanildi' olur: sonradan gelirlerse tekrar algilamasi (pencere disinda
 * grant iptali) aynen isler. Etkin kardes sayisi MCP_YENILEME_KARDES_SINIRI ile sinirli.
 */
function mcp_token_yenile(array $p, array $ist): void {
    $j = $p['refresh_token'] ?? '';
    if (!is_string($j) || $j === '' || strlen($j) > 200) mcp_oauth_hata(400, 'invalid_request', 'refresh_token eksik.');
    $istenen = null;
    if (isset($p['scope']) && trim((string)$p['scope']) !== '') $istenen = preg_split('/\s+/', trim((string)$p['scope'])) ?: [];
    if (isset($p['resource']) && !mcp_kaynak_bizim_mi((string)$p['resource'])) mcp_oauth_hata(400, 'invalid_target', 'resource bu MCP sunucusu degil.');
    $guncelIz = mcp_arka()->sahip_sifre_izi();
    $sonuc = mcp_islem(function () use ($j, $ist, $istenen, $guncelIz) {
        $n = mcp_zaman();
        $r = mcp_tek("SELECT * FROM mcp_jeton WHERE ozet = ? AND tur = 'yenileme'", [mcp_ozet($j)]);
        if (!$r) return ['invalid_grant', 'Yenileme jetonu gecersiz.'];
        $izin = mcp_tek('SELECT * FROM mcp_izin WHERE id = ?', [$r['izin']]);
        $ebeveyn = (string)$r['ozet'];   // normal donusum: yeni yenileme jetonu bu jetondan cikar
        $tolerans = false;
        if ($r['durum'] === 'kullanildi') {
            $k = mcp_yenileme_toleransi($r, $ist, $izin, $guncelIz, $n);
            if ($k[0] === 'red') return ['invalid_grant', 'Cok fazla eszamanli yenileme; en son verilen yenileme jetonunu kullan.'];
            if ($k[0] !== 'tolerans') {
                // Donusturulmus (eski) yenileme jetonu pencere disinda ya da halefi kullanildiktan sonra geldi: calinmis olabilir; grant'in tamami iptal
                mcp_calistir("UPDATE mcp_izin SET durum = 'iptal', iptal_nedeni = 'yenileme_tekrar', iptal_zamani = ? WHERE id = ? AND durum = 'aktif'", [$n, $r['izin']]);
                mcp_calistir("UPDATE mcp_jeton SET durum = 'iptal' WHERE izin = ? AND durum = 'aktif'", [$r['izin']]);
                return ['invalid_grant', 'Yenileme jetonu daha once kullanildi.', 'yenileme_tekrar'];
            }
            $tolerans = true;
            $ebeveyn = (string)$k[1]['ebeveyn'];   // yeni jeton halefin kardesi olur
        } elseif ($r['durum'] !== 'aktif' || (int)$r['son'] <= $n) {
            return ['invalid_grant', 'Yenileme jetonu gecersiz.'];
        }
        if (!hash_equals((string)$r['istemci'], (string)$ist['id'])) return ['invalid_grant', 'Jeton bu istemciye verilmedi.'];
        if (!$izin || $izin['durum'] !== 'aktif' || (int)$izin['bitis'] <= $n) return ['invalid_grant', 'Izin gecersiz.'];
        if ($guncelIz === null || !hash_equals((string)$izin['sifre_izi'], $guncelIz)) return ['invalid_grant', 'Studio sifresi degisti; yeniden baglan.'];
        $verilen = explode(' ', (string)$izin['kapsam']);
        $kapsam = $verilen;
        if ($istenen !== null) {
            $taninan = array_values(array_intersect($istenen, MCP_KAPSAMLAR));
            if (array_diff($taninan, $verilen)) return ['invalid_scope', 'Istenen kapsam verilenden genis.'];
            $kapsam = $taninan ?: $verilen;
            if (in_array(MCP_KAPSAM_YAZ, $kapsam, true) && !in_array(MCP_KAPSAM_OKU, $kapsam, true)) $kapsam[] = MCP_KAPSAM_OKU;
        }
        $t = mcp_jeton_ver($izin, implode(' ', array_values(array_intersect(MCP_KAPSAMLAR, $kapsam))), $ebeveyn);
        if (!$tolerans) {
            $yeni = mcp_ozet($t['refresh_token']);
            mcp_calistir("UPDATE mcp_jeton SET durum = 'kullanildi', donusum = ?, halef = ? WHERE ozet = ?", [$n, $yeni, $r['ozet']]);
            // Tolerans penceresinde verilmis kardesler (ayni ebeveyn) de artik dondurulmus sayilir: halefleri bu yeni jeton
            if ($r['ebeveyn'] !== null) {
                mcp_calistir("UPDATE mcp_jeton SET durum = 'kullanildi', donusum = ?, halef = ? WHERE tur = 'yenileme' AND ebeveyn = ? AND durum = 'aktif' AND ozet <> ?",
                    [$n, $yeni, $r['ebeveyn'], $r['ozet']]);
            }
        }
        return ['tamam', $t, $tolerans ? 'tolerans' : ''];
    });
    if ($sonuc[0] !== 'tamam') {
        if (($sonuc[2] ?? '') === 'yenileme_tekrar') mcp_gunluk((string)$ist['ad'], 'yenileme_tekrar', 'iptal', [], 'Eski yenileme jetonu yeniden kullanildi; baglanti iptal edildi');
        mcp_oauth_hata(400, $sonuc[0], $sonuc[1]);
    }
    if ($sonuc[2] === 'tolerans') mcp_gunluk((string)$ist['ad'], 'yenileme_tolerans', 'tamam', [], 'Eszamanli yenileme: az once donusturulen jeton tolerans penceresinde kabul edildi');
    mcp_json(200, $sonuc[1]);
}

/* ---------------- /revoke (RFC 7009) ---------------- */

function mcp_iptal(): void {
    $p = mcp_oauth_form();
    if (!mcp_hiz('iptal|' . mcp_ip_ozet(), 600, 120)) mcp_oauth_hata(429, 'temporarily_unavailable', 'Cok fazla istek.', ['Retry-After: 60']);
    $ist = mcp_istemci_dogrula($p);
    $j = $p['token'] ?? '';
    if (!is_string($j) || $j === '') mcp_oauth_hata(400, 'invalid_request', 'token eksik.');
    $r = strlen($j) <= 200 ? mcp_tek('SELECT * FROM mcp_jeton WHERE ozet = ?', [mcp_ozet($j)]) : null;
    // Bilinmeyen / baska istemcinin jetonu: 200 (RFC 7009 2.2; varligi sizdirilmaz)
    if ($r && hash_equals((string)$r['istemci'], (string)$ist['id'])) {
        if ($r['tur'] === 'yenileme') {
            mcp_izin_iptal((string)$r['izin'], 'istemci_iptal');   // yenileme jetonu: butun grant
        } else {
            mcp_calistir("UPDATE mcp_jeton SET durum = 'iptal' WHERE ozet = ?", [$r['ozet']]);
        }
        mcp_gunluk((string)$ist['ad'], 'jeton_iptal', 'tamam', [], $r['tur'] === 'yenileme' ? 'Baglanti istemci tarafindan kapatildi' : 'Erisim jetonu iptal');
    }
    mcp_bos(200);
}
