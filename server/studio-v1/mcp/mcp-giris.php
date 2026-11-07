<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP uc noktasi (kaynak): https://assets.suflo.app/<uygulama>/mcp
 * Yer: public_html/<uygulama>/mcp-giris.php; .htaccess "mcp" -> mcp-giris.php (Authorization basligi gecirilir).
 * Dosya adi bilerek istek yolundan farkli: MultiViews acik sunucularda "mcp" istegi bir mcp.* dosyasina eslenmesin.
 */
define('SUFLO_MCP', 1);
require __DIR__ . '/mcp-kitaplik/yukle.php';
mcp_baslat(__DIR__);
mcp_tasima_calistir();
