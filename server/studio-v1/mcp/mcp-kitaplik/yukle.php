<?php
declare(strict_types=1);
/* Suflo Studio MCP kitapligi: giris dosyalari (mcp-giris.php, oauth-giris.php, kesif-giris.php) yalniz bunu yukler. */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }
require __DIR__ . '/ortak.php';
require __DIR__ . '/depo.php';
require __DIR__ . '/arka.php';
require __DIR__ . '/araclar.php';
require __DIR__ . '/oauth.php';
require __DIR__ . '/tasima.php';
require __DIR__ . '/kesif.php';
