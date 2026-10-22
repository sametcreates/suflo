<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP: Streamable HTTP tasima katmani (yalniz POST, tek JSON yanit, SSE yok, oturum kimligi yok).
 *
 * Sira: kapali mi -> yontem (GET/DELETE 405) -> Origin -> Bearer jeton (JSON-RPC'den ONCE) -> govde -> donem -> yontem.
 * Iki donem ayni uc noktada:
 *  - eski: initialize ile anlasma (2025-11-25, 2025-06-18; 2025-03-26 isteyen istemciye 2025-06-18 onerilir).
 *  - yeni (2026-07-28): her istekte params._meta["io.modelcontextprotocol/protocolVersion"] + MCP-Protocol-Version,
 *    Mcp-Method, tools/call'da Mcp-Name basliklari (govdeyle ayni olmali: degilse 400 / -32020); server/discover.
 * Donem govdeden belirlenir (basliklar capraz denetim); ayrintilar @modelcontextprotocol/server 2.x ile ayni kurallar.
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

const MCP_META_SURUM = 'io.modelcontextprotocol/protocolVersion';
const MCP_META_YETENEK = 'io.modelcontextprotocol/clientCapabilities';
const MCP_META_ISTEMCI = 'io.modelcontextprotocol/clientInfo';
const MCP_META_SUNUCU = 'io.modelcontextprotocol/serverInfo';

function mcp_sunucu_bilgisi(): array { return ['name' => 'suflo-studio', 'title' => 'Suflo Studio', 'version' => MCP_SURUM]; }
function mcp_tum_surumler(): array { return array_merge(MCP_YENI_SURUMLER, MCP_ESKI_SURUMLER); }
function mcp_yeni_mi(string $s): bool { return strcmp($s, MCP_ILK_YENI_SURUM) >= 0 && (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $s); }

/** WWW-Authenticate degeri. $hata yoksa (hic kimlik bilgisi gelmediyse) error ozniteligi yazilmaz. */
function mcp_www_authenticate(?string $hata = null, ?string $aciklama = null): string {
    $p = [];
    if ($hata !== null) $p[] = 'error="' . $hata . '"';
    if ($aciklama !== null) $p[] = 'error_description="' . str_replace(['"', '\\'], '', $aciklama) . '"';
    $p[] = 'resource_metadata="' . mcp_ortam('prm') . '"';
    $p[] = 'scope="' . implode(' ', MCP_KAPSAMLAR) . '"';
    return 'Bearer ' . implode(', ', $p);
}
function mcp_rpc_hata(int $http, $id, int $kod, string $mesaj, $veri = null, array $basliklar = []): void {
    $h = ['code' => $kod, 'message' => $mesaj];
    if ($veri !== null) $h['data'] = $veri;
    mcp_json($http, ['jsonrpc' => '2.0', 'id' => $id, 'error' => $h], $basliklar);
}
function mcp_rpc_sonuc($id, $sonuc): void {
    mcp_json(200, ['jsonrpc' => '2.0', 'id' => $id, 'result' => $sonuc]);
}
/** Mcp-Name gibi basliklarda =?base64?...?= degerini cozer; gecersizse null. */
function mcp_baslik_coz(string $v): ?string {
    $v = trim($v, " \t");
    if (str_starts_with($v, '=?base64?') && str_ends_with($v, '?=') && strlen($v) >= 11) {
        $b = substr($v, 9, -2);
        if (!preg_match('/^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/', $b)) return null;
        $s = base64_decode($b, true);
        return $s === false || !mb_check_encoding($s, 'UTF-8') ? null : $s;
    }
    return $v;
}
function mcp_uyusmazlik(string $baslik, string $aciklama, $id): void {
    mcp_rpc_hata(400, $id, -32020, 'Bad Request: the request headers and body disagree: ' . $aciklama, ['mismatch' => ['header' => $baslik, 'body' => $aciklama]]);
}

function mcp_tasima_calistir(): void {
    if (!mcp_acik_mi()) mcp_json(503, ['error' => 'temporarily_unavailable', 'error_description' => 'Suflo Studio MCP kapali.']);
    if (mcp_yontem() !== 'POST') mcp_json(405, ['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32000, 'message' => 'Method not allowed.']], ['Allow: POST']);
    $origin = mcp_baslik('Origin');
    if ($origin !== null && $origin !== '' && !mcp_origin_izinli($origin)) {
        mcp_json(403, ['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32000, 'message' => 'Forbidden: Origin not allowed.']]);
    }
    try {
        mcp_buda();
        $yetki = mcp_yetki_denetle();
        mcp_istek_isle($yetki);
    } catch (Throwable $e) {
        if (mcp_mesgul_mu($e) || $e instanceof McpKurulumHatasi) {
            mcp_json(503, ['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32000, 'message' => 'Sunucu meşgul; birkaç saniye sonra yeniden dene.']], ['Retry-After: 2']);
        }
        error_log('suflo-mcp tasima: ' . get_class($e) . ': ' . $e->getMessage());
        mcp_json(500, ['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32603, 'message' => 'Internal error']]);
    }
}

/** Bearer jeton denetimi; gecersizse 401 ile cikar. Doner: mcp_erisim_dogrula sonucu. */
function mcp_yetki_denetle(): array {
    $yb = mcp_yetki_basligi();
    if ($yb === null || !preg_match('/^Bearer[ \t]+(\S*)[ \t]*$/i', $yb, $m)) {
        // Hic Bearer kimlik bilgisi yok: error ozniteligi yok (RFC 6750 3.1)
        mcp_json(401, ['error' => 'unauthorized', 'error_description' => 'Yetki gerekli.'], ['WWW-Authenticate: ' . mcp_www_authenticate()]);
    }
    $jeton = $m[1];
    $red = fn (string $a) => mcp_json(401, ['error' => 'invalid_token', 'error_description' => $a], ['WWW-Authenticate: ' . mcp_www_authenticate('invalid_token', $a)]);
    if (!preg_match('/^[A-Za-z0-9_-]{20,200}$/', $jeton)) $red('Jeton bicimi gecersiz.');
    $d = mcp_erisim_dogrula($jeton, mcp_arka()->sahip_sifre_izi());
    if (!$d['gecerli']) {
        $neden = ['bilinmiyor' => 'Jeton gecersiz.', 'iptal' => 'Jeton iptal edildi.', 'suresi_doldu' => 'Jetonun suresi doldu.',
            'audience' => 'Jeton bu sunucu icin verilmedi.', 'sifre_degisti' => 'Studio sifresi degisti; yeniden baglan.'][$d['neden']] ?? 'Jeton gecersiz.';
        $red($neden);
    }
    if (!mcp_hiz('mcp|' . $d['izin']['id'], 600, 600)) {
        mcp_json(429, ['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32000, 'message' => 'Çok fazla istek; biraz bekle.']], ['Retry-After: 60']);
    }
    return $d;
}

function mcp_istek_isle(array $yetki): void {
    if (mcp_icerik_turu() !== 'application/json') mcp_rpc_hata(415, null, -32600, 'Content-Type application/json olmali.');
    $g = mcp_govde_oku(MCP_GOVDE_SINIRI);
    if ($g === null) mcp_rpc_hata(413, null, -32600, 'Istek cok buyuk (en cok 1 MiB).');
    try {
        $j = json_decode($g, true, 64, JSON_THROW_ON_ERROR);
    } catch (Throwable $e) {
        mcp_rpc_hata(400, null, -32700, 'Parse error');
    }
    if (is_array($j) && array_is_list($j)) mcp_rpc_hata(400, null, -32600, 'Bad Request: JSON-RPC batches are not supported by this endpoint');
    if (!is_array($j) || ($j['jsonrpc'] ?? null) !== '2.0') mcp_rpc_hata(400, null, -32600, 'Bad Request: the request body is not a valid JSON-RPC message');
    $idVar = array_key_exists('id', $j);
    $id = $j['id'] ?? null;
    if (!array_key_exists('method', $j)) {
        // Istemcinin bir yanit gondermesi (sunucu istek gondermez): kabul edilir, islenmez
        if ($idVar && (array_key_exists('result', $j) || array_key_exists('error', $j))) mcp_bos(202);
        mcp_rpc_hata(400, null, -32600, 'Bad Request: the request body is not a valid JSON-RPC message');
    }
    $yontem = $j['method'];
    if (!is_string($yontem) || $yontem === '') mcp_rpc_hata(400, null, -32600, 'Invalid Request: method');
    if ($idVar && !is_string($id) && !is_int($id)) mcp_rpc_hata(400, null, -32600, 'Invalid Request: id must be a string or an integer');
    $params = $j['params'] ?? [];
    if (!is_array($params) || ($params !== [] && array_is_list($params))) {
        if (!$idVar) mcp_bos(202);
        mcp_rpc_hata(200, $id, -32602, 'Invalid params: params must be an object');
    }
    $meta = isset($params['_meta']) && is_array($params['_meta']) ? $params['_meta'] : null;
    $iddia = $meta !== null && array_key_exists(MCP_META_SURUM, $meta);
    $pvb = mcp_baslik('MCP-Protocol-Version');
    $pvb = $pvb === null ? null : trim($pvb, " \t");
    $mb = mcp_baslik('Mcp-Method');
    $mb = $mb === null ? null : trim($mb, " \t");
    $baslikYeni = $pvb !== null && mcp_yeni_mi($pvb);

    /* ---- donem ---- */
    if (!$idVar) {
        // Bildirim: yalniz tutarlilik denetimi, sonra 202 (islenecek bildirim yok)
        if ($iddia) {
            $v = $meta[MCP_META_SURUM];
            if (!is_string($v)) mcp_rpc_hata(400, null, -32602, 'Invalid _meta envelope: ' . MCP_META_SURUM . ' must be a string');
            if ($pvb !== null && $pvb !== $v) mcp_uyusmazlik($pvb, "the notification envelope names protocol version $v but the MCP-Protocol-Version header names $pvb", null);
            if (mcp_yeni_mi($v) && $mb !== null && $mb !== $yontem) mcp_uyusmazlik($mb, "the notification body names method $yontem but the Mcp-Method header names $mb", null);
        } elseif ($baslikYeni && $mb !== null && $mb !== $yontem) {
            mcp_uyusmazlik($mb, "the notification body names method $yontem but the Mcp-Method header names $mb", null);
        }
        mcp_bos(202);
    }
    $yeniGecerli = $iddia && is_string($meta[MCP_META_SURUM]) && mcp_yeni_mi($meta[MCP_META_SURUM]) && mcp_zarf_sorunu($meta) === null;
    if ($yontem === 'initialize' && !$yeniGecerli) {
        if ($baslikYeni) mcp_uyusmazlik($pvb, 'an initialize request (legacy handshake) was sent with a modern MCP-Protocol-Version header', $id);
        mcp_eski_donem($yontem, $params, $id, $yetki, null);
    }
    if ($iddia) {
        $sorun = mcp_zarf_sorunu($meta);
        if ($sorun !== null) mcp_rpc_hata(400, $id, -32602, 'Invalid _meta envelope for protocol revision ' . MCP_ILK_YENI_SURUM . ': ' . $sorun, ['envelope' => ['problem' => $sorun]]);
        $v = $meta[MCP_META_SURUM];
        if ($pvb !== null && $pvb !== $v) mcp_uyusmazlik($pvb, "the body envelope names protocol version $v but the MCP-Protocol-Version header names $pvb", $id);
        if ($mb !== null && $mb !== $yontem) mcp_uyusmazlik($mb, "the body names method $yontem but the Mcp-Method header names $mb", $id);
        if (!mcp_yeni_mi($v)) mcp_eski_donem($yontem, $params, $id, $yetki, $v);
        mcp_yeni_donem($yontem, $params, $id, $yetki, $v, $pvb, $mb);
    }
    if ($baslikYeni) {
        mcp_rpc_hata(400, $id, -32602, "Invalid params: the MCP-Protocol-Version header names protocol revision $pvb, but the request is missing the required per-request envelope key(s): " . ($meta === null ? '_meta' : MCP_META_SURUM),
            ['envelope' => ['missing' => [$meta === null ? '_meta' : MCP_META_SURUM]]]);
    }
    mcp_eski_donem($yontem, $params, $id, $yetki, $pvb);
}

/** Yeni donem zarfi: protocolVersion metin, clientCapabilities nesne (zorunlu), clientInfo nesne (istege bagli). */
function mcp_zarf_sorunu(array $meta): ?string {
    if (!is_string($meta[MCP_META_SURUM] ?? null)) return MCP_META_SURUM . ': missing or not a string';
    if (!array_key_exists(MCP_META_YETENEK, $meta)) return MCP_META_YETENEK . ': missing';
    $y = $meta[MCP_META_YETENEK];
    if (!is_array($y) || ($y !== [] && array_is_list($y))) return MCP_META_YETENEK . ': expected an object';
    if (array_key_exists(MCP_META_ISTEMCI, $meta)) {
        $i = $meta[MCP_META_ISTEMCI];
        if (!is_array($i) || !is_string($i['name'] ?? null) || !is_string($i['version'] ?? null)) return MCP_META_ISTEMCI . ': expected {name, version}';
    }
    return null;
}

/* ---------------- Eski donem (initialize) ---------------- */

function mcp_eski_donem(string $yontem, array $params, $id, array $yetki, ?string $surum): void {
    if ($yontem !== 'initialize' && $surum !== null && !in_array($surum, array_merge(MCP_ESKI_SURUMLER, ['2025-03-26']), true)) {
        mcp_rpc_hata(400, $id, -32600, "Bad Request: unsupported protocol version $surum", ['supported' => mcp_tum_surumler(), 'requested' => $surum]);
    }
    switch ($yontem) {
        case 'initialize':
            $istenen = $params['protocolVersion'] ?? null;
            $verilen = is_string($istenen) && in_array($istenen, MCP_ESKI_SURUMLER, true) ? $istenen
                : ($istenen === '2025-03-26' ? '2025-06-18' : MCP_ESKI_SURUMLER[0]);
            mcp_rpc_sonuc($id, [
                'protocolVersion' => $verilen,
                'capabilities' => ['tools' => ['listChanged' => false]],
                'serverInfo' => mcp_sunucu_bilgisi(),
                'instructions' => MCP_TALIMATLAR,
            ]);
        case 'ping':
            mcp_rpc_sonuc($id, new stdClass());
        case 'tools/list':
            mcp_rpc_sonuc($id, ['tools' => mcp_arac_listesi()]);
        case 'tools/call':
            mcp_rpc_sonuc($id, mcp_arac_cagrisi($params, $id, $yetki));
        default:
            mcp_rpc_hata(200, $id, -32601, 'Method not found: ' . mcp_kisalt($yontem, 80));
    }
}

/* ---------------- Yeni donem (2026-07-28) ---------------- */

function mcp_yeni_donem(string $yontem, array $params, $id, array $yetki, string $surum, ?string $pvb, ?string $mb): void {
    if (!in_array($surum, MCP_YENI_SURUMLER, true)) {
        mcp_rpc_hata(400, $id, -32022, "Unsupported protocol version: $surum", ['supported' => mcp_tum_surumler(), 'requested' => $surum]);
    }
    // Standart basliklar (SEP-2243): her istekte MCP-Protocol-Version ve Mcp-Method; tools/call'da Mcp-Name = params.name
    if ($pvb === null) mcp_uyusmazlik('(missing)', "the body envelope names protocol version $surum but the required MCP-Protocol-Version header is absent", $id);
    if ($mb === null) mcp_uyusmazlik('(missing)', "the body names method $yontem but the required Mcp-Method header is absent", $id);
    if ($yontem === 'tools/call' && is_string($params['name'] ?? null)) {
        $nb = mcp_baslik('Mcp-Name');
        if ($nb === null) mcp_uyusmazlik('(missing)', "the body carries params.name=\"{$params['name']}\" but the required Mcp-Name header is absent", $id);
        $coz = mcp_baslik_coz($nb);
        if ($coz === null) mcp_uyusmazlik($nb, 'the Mcp-Name header carries an invalid Base64 sentinel value', $id);
        if ($coz !== $params['name']) mcp_uyusmazlik($nb, "the body carries params.name=\"{$params['name']}\" but the Mcp-Name header names \"$coz\"", $id);
    }
    $ttl = 300000;
    switch ($yontem) {
        case 'server/discover':
            mcp_rpc_sonuc($id, [
                'resultType' => 'complete',
                'supportedVersions' => mcp_tum_surumler(),
                'capabilities' => ['tools' => ['listChanged' => false]],
                'instructions' => MCP_TALIMATLAR,
                'ttlMs' => $ttl,
                'cacheScope' => 'private',
                '_meta' => [MCP_META_SUNUCU => mcp_sunucu_bilgisi()],
            ]);
        case 'tools/list':
            mcp_rpc_sonuc($id, ['resultType' => 'complete', 'tools' => mcp_arac_listesi(), 'ttlMs' => $ttl, 'cacheScope' => 'private']);
        case 'tools/call':
            mcp_rpc_sonuc($id, ['resultType' => 'complete'] + mcp_arac_cagrisi($params, $id, $yetki));
        default:
            mcp_rpc_hata(404, $id, -32601, 'Method not found: ' . mcp_kisalt($yontem, 80));
    }
}

/* ---------------- tools/call ---------------- */

function mcp_arac_cagrisi(array $params, $id, array $yetki): array {
    $ad = $params['name'] ?? null;
    if (!is_string($ad) || $ad === '') mcp_rpc_hata(200, $id, -32602, 'Invalid params: name');
    $arac = mcp_arac_bul($ad);
    if ($arac === null) mcp_rpc_hata(200, $id, -32602, 'Unknown tool: ' . mcp_kisalt($ad, 80));
    $arg = $params['arguments'] ?? [];
    if ($arg === null) $arg = [];
    if (!is_array($arg) || ($arg !== [] && array_is_list($arg))) mcp_rpc_hata(200, $id, -32602, 'Invalid params: arguments must be an object');
    $izin = $yetki['izin'];
    // Kapsam: yazma araci studio.yaz ister; yoksa 403 insufficient_scope (istemci izni yukseltebilir)
    if (!in_array($arac['_kapsam'], $yetki['kapsamlar'], true)) {
        mcp_json(403, ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => -32001, 'message' => 'Bu araç için yazma izni (studio.yaz) gerekli.']],
            ['WWW-Authenticate: ' . mcp_www_authenticate('insufficient_scope', 'Bu arac icin studio.yaz gerekli.')]);
    }
    $istemciAdi = $yetki['istemci_adi'];
    $baglam = null;
    $baglam = new McpBaglam((string)$izin['id'], (string)$izin['istemci'], $istemciAdi, $yetki['kapsamlar'], mcp_zaman(),
        function (array $islemler) use (&$baglam) { return mcp_toplu_onizle($islemler, $baglam); });

    $sonuc = mcp_arac_calistir($arac, $arg, $baglam);
    if (!$sonuc->hata && isset($arac['outputSchema'])) {
        $h = [];
        $sonuc->veri = mcp_sema_uygula($sonuc->veri, $arac['outputSchema'], '', $h);
        if ($h) {
            error_log('suflo-mcp cikti semasi (' . $ad . '): ' . implode('; ', array_slice($h, 0, 5)));
            $sonuc = McpSonuc::hata('Sunucu yanıtı beklenen biçimde değil (' . $ad . '). İşlem yapılmış olabilir; ' . ($arac['_kapsam'] === MCP_KAPSAM_YAZ ? 'tekrar etmeden önce okuma araçlarıyla kontrol et.' : 'yeniden dene.'));
        }
    }
    $etkilenen = $sonuc->hata ? [] : $sonuc->etkilenen;
    mcp_gunluk($istemciAdi, $ad, $sonuc->hata ? 'hata' : 'tamam', $etkilenen, $sonuc->ozet !== '' ? $sonuc->ozet : ($sonuc->metin ?? ''), (string)$izin['id']);
    $icerik = [];
    if ($sonuc->metin !== null && $sonuc->metin !== '') $icerik[] = ['type' => 'text', 'text' => $sonuc->metin];
    if ($sonuc->veri !== []) $icerik[] = ['type' => 'text', 'text' => mcp_json_metin($sonuc->veri)];
    if (!$icerik) $icerik[] = ['type' => 'text', 'text' => $sonuc->hata ? 'İşlem yapılamadı.' : 'Tamam.'];
    $r = ['content' => $icerik, 'isError' => $sonuc->hata];
    $yapisal = !$sonuc->hata || $sonuc->veri !== [];
    if ($yapisal && $sonuc->hata && isset($arac['outputSchema'])) {
        // Hata sonucu da structuredContent tasiyorsa aracin outputSchema'sina uymali: resmi SDK istemcileri (v1) isError'da da
        // dogrular ve uymazsa cagriyi istisnayla dusurur. Uymuyorsa structuredContent hic gonderilmez; bilgi metin icerikte kalir.
        $h = [];
        $sonuc->veri = mcp_sema_uygula($sonuc->veri, $arac['outputSchema'], '', $h);
        if ($h) $yapisal = false;
    }
    if ($yapisal) {
        $r['structuredContent'] = isset($arac['outputSchema'])
            ? mcp_cikti_bicimle($sonuc->veri, $arac['outputSchema'])
            : ($sonuc->veri === [] ? new stdClass() : $sonuc->veri);
        if ($r['structuredContent'] === []) $r['structuredContent'] = new stdClass();
    }
    return $r;
}

/** Girdi dogrulama + capraz kurallar + isleyici. Is ve girdi hatalari isError sonucu olur (model duzeltebilsin). */
function mcp_arac_calistir(array $arac, array $arg, McpBaglam $b): McpSonuc {
    $hatalar = [];
    $girdi = mcp_sema_uygula($arg, $arac['inputSchema'], '', $hatalar);
    if ($hatalar) return McpSonuc::hata('Girdi geçersiz, hiçbir şey yapılmadı: ' . implode('; ', array_slice($hatalar, 0, 10)) . '.');
    if (isset($arac['_capraz'])) {
        $h = ($arac['_capraz'])($girdi);
        if ($h !== null) return McpSonuc::hata('Girdi geçersiz, hiçbir şey yapılmadı: ' . $h);
    }
    if ($arac['_kapsam'] === MCP_KAPSAM_YAZ && ($arac['annotations']['readOnlyHint'] ?? false) !== true && !mcp_hiz('yazma|' . $b->izin_id, 600, 60)) {
        return McpSonuc::hata('Çok fazla yazma isteği (10 dakikada en çok 60). Biraz bekleyip yeniden dene.');
    }
    // istek_anahtari: ayni anahtar farkli girdiyle gelirse arka uca gidilmez (yanlis kayit doner ya da mukerrer olurdu)
    $ayrim = [];
    if (isset($girdi['istek_anahtari']) && is_string($girdi['istek_anahtari'])) {
        try {
            $ayrim = mcp_istek_ayir($b->izin_id, $arac['name'], $girdi);
        } catch (Throwable $e) {
            if (mcp_mesgul_mu($e)) return McpSonuc::hata('Sunucu şu an meşgul. Birkaç saniye sonra aynı istek_anahtari ile yeniden dene.');
            throw $e;
        }
        if (isset($ayrim['hata'])) return McpSonuc::hata($ayrim['hata']);
    }
    $sonuc = mcp_arac_isle($arac, $girdi, $b);
    if ($ayrim) mcp_istek_bitir($ayrim, !$sonuc->hata && $sonuc->etkilenen !== []);
    return $sonuc;
}

/** Isleyici: yerlesik araclar ya da arka uc. Is hatalari ve gecici hatalar isError sonucu olur. */
function mcp_arac_isle(array $arac, array $girdi, McpBaglam $b): McpSonuc {
    try {
        switch ($arac['name']) {
            case 'studio_bugun': return mcp_arac_bugun();
            case 'studio_toplu_onizle':
                $o = mcp_toplu_onizle($girdi['islemler'], $b);
                $m = $o['gecerli']
                    ? 'Önizleme hazır; hiçbir şey yazılmadı. Kullanıcı onaylarsa studio_toplu_uygula ile onay_kodu gönder (geçerlilik: ' . $o['son_gecerlilik'] . ').'
                    : 'Önizleme geçersiz; hiçbir şey yazılmadı ve onay kodu verilmedi.';
                return McpSonuc::tamam($o, $m, [], 'Toplu onizleme: ' . count($girdi['islemler']) . ' islem' . ($o['gecerli'] ? '' : ' (gecersiz)'));
            case 'studio_toplu_uygula': return mcp_toplu_uygula($girdi['onay_kodu'], $b);
            default: return mcp_arka()->arac($arac['name'], $girdi, $b);
        }
    } catch (McpAracHatasi $e) {
        return McpSonuc::hata($e->getMessage());
    } catch (Throwable $e) {
        if (mcp_mesgul_mu($e)) return McpSonuc::hata('Studio şu an meşgul. Birkaç saniye sonra aynı istek_anahtari ile yeniden dene.');
        error_log('suflo-mcp arac ' . $arac['name'] . ': ' . get_class($e) . ': ' . $e->getMessage());
        return McpSonuc::hata('Beklenmeyen sunucu hatası (' . $arac['name'] . ').');
    }
}
