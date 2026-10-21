<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP kesif belgeleri (PRM, AS / OIDC metadata). Yer: public_html/<uygulama>/kesif.php.
 * public_html/.well-known/.htaccess ve public_html/<uygulama>/.htaccess yalniz tam kesif adlarini buraya yonlendirir.
 */
define('SUFLO_MCP', 1);
require __DIR__ . '/mcp-kitaplik/yukle.php';
mcp_baslat(__DIR__);
mcp_kesif_calistir();
