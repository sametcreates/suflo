<?php
declare(strict_types=1);
/* Suflo Studio MCP kitapligi: giris dosyalari (mcp-giris.php, oauth-giris.php, kesif-giris.php) yalniz bunu yukler. */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }
// Kitaplik PHP 8.1 ozellikleri kullanir (readonly, array_is_list). Eski PHP'de ciplak 500 yerine acik mesaj; bu dosyanin
// kendisinde 8.1'e ozgu soz dizimi yoktur (ayristirma hatasi ancak asagidaki require'larda olurdu). Panel icinden
// (SUFLO_MCP_PANEL) yuklenirse yanit basilmaz, istisna atilir: panel kendi JSON hatasini verir.
if (PHP_VERSION_ID < 80100) {
    if (defined('SUFLO_MCP_PANEL')) throw new RuntimeException('Suflo MCP PHP 8.1+ gerektirir.');
    http_response_code(503); header('Content-Type: text/plain; charset=utf-8'); echo 'Suflo MCP PHP 8.1+ gerektirir.'; exit;
}
require __DIR__ . '/ortak.php';
require __DIR__ . '/depo.php';
require __DIR__ . '/arka.php';
require __DIR__ . '/araclar.php';
require __DIR__ . '/oauth.php';
require __DIR__ . '/tasima.php';
require __DIR__ . '/kesif.php';
