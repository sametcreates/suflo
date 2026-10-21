<?php
/*
 * YALNIZ TESTLER ICIN: php -S yonlendiricisi. php -S .htaccess okumaz; bu dosya su iki dosyanin kurallarini
 * aynen taklit eder (Apache'deki gercek davranisi tests/test-studio-mcp-apache.js denetler):
 *   server/studio-v1/mcp/studio.htaccess      -> public_html/<uygulama>/.htaccess
 *   server/studio-v1/mcp/well-known.htaccess  -> public_html/.well-known/.htaccess
 */
$yol = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
$kok = rtrim((string)$_SERVER['DOCUMENT_ROOT'], '/');
$u = '(studio|studio-test)';
$hedef = null;
if (preg_match("#^/\\.well-known/oauth-protected-resource/$u/mcp$#", $yol, $m)) $hedef = "/$m[1]/kesif.php";
elseif (preg_match("#^/\\.well-known/(oauth-authorization-server|openid-configuration)/$u$#", $yol, $m)) $hedef = "/$m[2]/kesif.php";
elseif (preg_match("#^/$u/\\.well-known/(openid-configuration|oauth-authorization-server)$#", $yol, $m)) $hedef = "/$m[1]/kesif.php";
elseif (preg_match("#^/$u/mcp$#", $yol, $m)) $hedef = "/$m[1]/mcp.php";
elseif (preg_match("#^/$u/oauth/(authorize|token|register|revoke)$#", $yol, $m)) $hedef = "/$m[1]/oauth.php";
elseif (preg_match("#^/$u/mcp-kitaplik(/|$)#", $yol)) { http_response_code(403); echo 'Forbidden'; return true; }
if ($hedef === null) return false;   // statik dosya ya da dogrudan PHP (php -S kendisi sunar)
$_SERVER['SCRIPT_NAME'] = $hedef;
$_SERVER['SCRIPT_FILENAME'] = $kok . $hedef;
$_SERVER['PHP_SELF'] = $hedef;
chdir(dirname($kok . $hedef));
require $kok . $hedef;
return true;
