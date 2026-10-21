<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP uc noktasi (kaynak): https://assets.suflo.app/<uygulama>/mcp
 * Yer: public_html/<uygulama>/mcp.php; .htaccess "mcp" -> mcp.php (Authorization basligi gecirilir).
 */
define('SUFLO_MCP', 1);
require __DIR__ . '/mcp-kitaplik/yukle.php';
mcp_baslat(__DIR__);
mcp_tasima_calistir();
