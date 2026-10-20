<?php
/*
 * Suflo Studio: giris sifresinin ozetini uretir (yalniz komut satirinda calisir).
 *   php sifre-ozeti.php
 * Ciktiyi private/studio-v1/config.php icindeki 'password_hash' alanina yapistir.
 * Sifre ekrana yazilmaz, hicbir yere kaydedilmez.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function sor(string $istem): string {
    fwrite(STDOUT, $istem);
    $gizle = DIRECTORY_SEPARATOR === '/' && function_exists('shell_exec') && @shell_exec('stty -echo 2>/dev/null') !== null;
    $s = fgets(STDIN);
    if ($gizle) { @shell_exec('stty echo 2>/dev/null'); fwrite(STDOUT, "\n"); }
    return rtrim((string)$s, "\r\n");
}

$a = sor('Yeni sifre (en az 12 karakter): ');
if (mb_strlen($a) < 12) { fwrite(STDERR, "Sifre en az 12 karakter olmali.\n"); exit(1); }
$b = sor('Yeni sifre (tekrar): ');
if (!hash_equals($a, $b)) { fwrite(STDERR, "Sifreler ayni degil.\n"); exit(1); }
$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
fwrite(STDOUT, password_hash($a, $algo) . "\n");
