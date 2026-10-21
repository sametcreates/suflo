<?php
declare(strict_types=1);
/*
 * Suflo Studio OAuth 2.1 yetkilendirme sunucusu: /<uygulama>/oauth/{authorize,token,register,revoke}
 * Yer: public_html/<uygulama>/oauth.php; .htaccess "oauth/..." -> oauth.php. Dogrudan /oauth.php cagrisi 404.
 */
define('SUFLO_MCP', 1);
require __DIR__ . '/mcp-kitaplik/yukle.php';
mcp_baslat(__DIR__);
mcp_oauth_calistir();
