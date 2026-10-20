<?php
/*
 * Suflo Studio sunucu ayarlari (ORNEK). Gercek dosya sunucuda public_html DISINDA durur:
 *   <public_html'in ust klasoru>/private/studio-v1/config.php
 * Bu ornek dosyayi oraya kopyala ve alanlari doldur. Gercek config.php GitHub'a, panele, ZIP'e girmez.
 *
 * Suflo Pro lisans servisinden (private/pro-v1) tamamen ayridir: ayri klasor, ayri veritabani,
 * ayri oturum cerezi. Bir Suflo Pro lisansi Studio'ya giris hakki vermez.
 */
return [
    // Giris sifresinin ozeti. Duz sifre YAZMA. Ozeti olusturmak icin (kendi bilgisayarinda ya da
    // sunucunun terminalinde):  php sifre-ozeti.php   -> ciktiyi asagiya yapistir.
    'password_hash' => '',

    // Veritabani. Varsayilan: public_html disinda tek dosyalik SQLite (ek servis gerekmez).
    // Hostinger'da pdo_sqlite yoksa MySQL kullan: 'dsn' => 'mysql:host=localhost;dbname=...;charset=utf8mb4'
    'dsn' => 'sqlite:' . __DIR__ . '/studio.sqlite',
    'db_user' => '',
    'db_pass' => '',

    // Arayuzun calistigi adres. Yalniz buradan gelen istekler kabul edilir (CSRF korumasi).
    // Secenek A: ['https://suflo.app']  |  Secenek B (onerilen, ayri adres): ['https://assets.suflo.app']
    // Yalniz birini yaz (bkz. README "Dagitim secenegi").
    'allowed_origins' => ['https://suflo.app'],

    // Oturum: bosta kalma ve mutlak sure (saniye)
    'session_idle' => 14 * 24 * 3600,
    'session_max' => 60 * 24 * 3600,

    // Kaba kuvvet korumasi: 15 dakikada bu kadar hatali giriste kilit
    'login_max_fail' => 8,
    'login_window' => 900,
];
