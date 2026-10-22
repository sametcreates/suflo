<?php
declare(strict_types=1);
/*
 * test-studio-ortak.js icin: studio-ortak.php'yi KITAPLIK olarak (bir islevin icinden, panel olmadan) yukler ve
 * senaryolari calistirir. Cikti: tek JSON nesnesi (senaryo adi => sonuc). Yalniz anonim ornek veri.
 * Kullanim: php kosum.php <studio-ortak.php> <gecici klasor> <sifre ozeti>
 */
ini_set('display_errors', '1');
error_reporting(E_ALL);
set_error_handler(function ($no, $msg, $file, $line) { throw new ErrorException($msg, 0, $no, $file, $line); });

[$_, $kitaplik, $tmp, $ozet] = $argv;
$_SERVER['REMOTE_ADDR'] = '192.0.2.10';
$S = [];

// Kitaplik bir islevin icinden yuklenir (MCP arka ucu boyle yukler): genel haritalar yine global olmali
(static function () use ($kitaplik) {
    define('STUDIO_ORTAK', 1);
    require_once $kitaplik;
})();

function yakala(callable $f): array {
    try { return ['tamam' => true, 'deger' => $f()]; }
    catch (Throwable $e) {
        return ['tamam' => false, 'sinif' => get_class($e), 'mesaj' => $e->getMessage(),
            'http' => $e instanceof StudioHatasi ? $e->http : null, 'kod' => $e instanceof StudioHatasi ? $e->kod : null,
            'yazma' => yazma_hatasi_kodu($e), 'guncel' => cakisma_guncel_json($e) !== null ? json_decode((string)cakisma_guncel_json($e), true) : null];
    }
}

// 1) Ayar: dosya yok / bozuk / gecerli
$S['ayar_yok'] = yakala(fn() => studio_ayar_yukle($tmp . '/olmayan/config.php'));
file_put_contents($tmp . '/bozuk.php', "<?php return 'dizi degil';\n");
$S['ayar_bozuk'] = yakala(fn() => studio_ayar_yukle($tmp . '/bozuk.php'));
file_put_contents($tmp . '/bos-dsn.php', "<?php return ['password_hash' => ''];\n");
$C0 = studio_ayar_yukle($tmp . '/bos-dsn.php');
$S['ayar_varsayilan'] = ['login_max_fail' => $C0['login_max_fail'], 'cookie_secure' => $C0['cookie_secure'], 'global' => ($GLOBALS['C']['login_window'] ?? null)];
// 2) Yanitlayici yokken kurulum hatasi istisnadir, surec cikmaz
$S['dsn_bos'] = yakala(fn() => db());
// 3) Yanitlayici kayitliyken once o cagrilir (panel boyle cikar)
$cagri = [];
studio_dur_ayarla(function (int $h, string $k, string $m) use (&$cagri) { $cagri[] = [$h, $k]; });
$S['dsn_bos_isleyici'] = yakala(fn() => db());
$S['isleyici_cagrisi'] = $cagri;
studio_dur_ayarla(null);

// Gercek veritabani
$C = studio_ayar_kullan(['dsn' => 'sqlite:' . $tmp . '/studio.sqlite', 'password_hash' => $ozet, 'login_max_fail' => 2, 'login_window' => 900]);
$S['sema'] = sema_degeri(db());

// 4) Bos veritabaninda gunluk kopya alinmaz; ilk musteri istemcinin kimligiyle
$mid = 'aaaaaaaabbbbbbbbcccccccc';
$m1 = kayit_kaydet('musteri', $mid, ['ad' => 'Ornek Musteri', 'kurum' => 'Ornek Kurum', 'ucret' => 1000], null);
$anlikIlk = (int)tek('SELECT COUNT(*) AS c FROM anliklar')['c'];
$m2 = kayit_kaydet('musteri', $mid, ['ad' => 'Ornek Musteri', 'kurum' => 'Ornek Kurum', 'ucret' => 1000], null);
$S['idempotent'] = ['ilk' => $m1['surum'], 'tekrar' => $m2['surum'], 'id' => $m2['id'], 'sayi' => count(kayitlari_oku('musteri')),
    'anlik_ilk' => $anlikIlk, 'anlik' => (int)tek('SELECT COUNT(*) AS c FROM anliklar')['c']];
// ayni kimlik, farkli icerik, surumsuz: sessizce ezilmez
$S['ayni_kimlik_farkli'] = yakala(fn() => kayit_kaydet('musteri', $mid, ['ad' => 'Baska Ad'], null));
// ayni ad + kurum, baska kimlik: ayni_ad
$S['ayni_ad'] = yakala(fn() => kayit_kaydet('musteri', 'dddddddddddddddddddddddd', ['ad' => 'ornek musteri', 'kurum' => 'ORNEK KURUM'], null));
// 5) Gunluk kopya: kayit varken gunun ilk yazmasindan once (bugun isaretlenmemis olsun)
calistir("DELETE FROM ayar WHERE anahtar = 'gunluk_anlik'");
$gunlukOnce = (int)tek("SELECT COUNT(*) AS c FROM anliklar WHERE neden = 'gunluk'")['c'];
$i1 = kayit_kaydet('icerik', 'eeeeeeeeeeeeeeeeeeeeeeee', ['musteriId' => $mid, 'baslik' => 'Ornek reels', 'tur' => 'reels'], null);
$i2 = kayit_kaydet('icerik', 'ffffffffffffffffffffffff', ['musteriId' => $mid, 'baslik' => 'Ikinci', 'tur' => 'post'], null);
$S['gunluk'] = ['once' => $gunlukOnce, 'gunluk_sayisi' => (int)tek("SELECT COUNT(*) AS c FROM anliklar WHERE neden = 'gunluk'")['c'], 'isaret' => ayar_oku('gunluk_anlik') === istanbul_gunu()];
// 6) Surum denetimi
$g1 = kayit_kaydet('icerik', $i1['id'], ['musteriId' => $mid, 'baslik' => 'Ornek reels', 'tur' => 'reels', 'durum' => 'kurguda'], $i1['surum']);
$S['guncelle'] = ['eski' => $i1['surum'], 'yeni' => $g1['surum'], 'durum' => $g1['durum']];
$S['eski_surum'] = yakala(fn() => kayit_kaydet('icerik', $i1['id'], ['musteriId' => $mid, 'baslik' => 'Ornek reels', 'tur' => 'reels', 'durum' => 'hazir'], $i1['surum']));
$S['olmayan_surumlu'] = yakala(fn() => kayit_kaydet('icerik', '111111111111111111111111', ['musteriId' => $mid, 'baslik' => 'Yok'], 5));
$S['gecersiz'] = yakala(fn() => kayit_kaydet('icerik', null, ['musteriId' => 'olmayanmusteri00', 'baslik' => 'X'], null));
$S['gecersiz_tarih'] = yakala(fn() => kayit_kaydet('etkinlik', null, ['baslik' => 'Cekim', 'basTarih' => '2026-02-30', 'tumGun' => true], null));
$S['bilinmeyen_tur'] = yakala(fn() => kayit_kaydet('fatura', null, [], null));
// 7) Okuma
$S['oku'] = ['icerik' => kayit_oku('icerik', $i1['id'])['durum'] ?? null, 'tur_farkli' => kayit_oku('musteri', $i1['id']),
    'bicimsiz' => kayit_oku('icerik', "x' OR 1=1"), 'liste' => count(kayitlari_oku('icerik')), 'ucret_var' => array_key_exists('ucret', kayit_oku('musteri', $mid) ?? [])];
$S['oku_bilinmeyen'] = yakala(fn() => kayitlari_oku('fatura'));
// 8) Islem: yazma kilidi bastan alinir; hata olursa hicbir sey kalmaz
$S['kilit'] = islem(function () use ($tmp) {
    $p2 = new PDO('sqlite:' . $tmp . '/studio.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $p2->exec('PRAGMA busy_timeout=0');
    try { $p2->exec('BEGIN IMMEDIATE'); $p2->exec('ROLLBACK'); return 'kilitsiz'; }
    catch (Throwable $e) { return mesgul_mu($e) ? 'kilitli' : 'baska:' . $e->getMessage(); }
});
$once = veri_durumu();
$S['geri_al'] = yakala(fn() => islem(function () use ($mid) {
    $var = tur_haritasi(tum_kayitlar());
    kayit_yaz('icerik', '222222222222222222222222', ['musteriId' => $mid, 'baslik' => 'Geri alinacak'], null, $var);
    throw new InvalidArgumentException('bilerek');
}));
$S['geri_al_sonra'] = ['kayit' => kayit_oku('icerik', '222222222222222222222222'), 'durum_ayni' => veri_durumu() === $once];
// 9) Anlik kopya (toplu yazma oncesi) ve cozumu
$aid = islem(fn() => anlik_al('mcp_toplu_oncesi'));
$ar = tek('SELECT neden, ozet, veri FROM anliklar WHERE id = ?', [$aid]);
$paket = anlik_coz((string)$ar['veri']);
$S['anlik'] = ['neden' => $ar['neden'], 'ozet' => $ar['ozet'], 'musteri' => count($paket['musteriler'] ?? []), 'icerik' => count($paket['icerikler'] ?? []),
    'bloklar_var' => array_key_exists('bloklar', $paket)];
// 10) Sahibin sifresi: panelin kilidi, surec cikmaz
$S['iz'] = ['iz' => sahip_sifre_izi(), 'beklenen' => sifre_izi($ozet)];
$S['sifre_dogru'] = sahip_sifre_dene('ornek-ortak-sifre-1');
$S['sifre_yanlis'] = [sahip_sifre_dene('yanlis-1')['durum'], sahip_sifre_dene('yanlis-2')['durum'], sahip_sifre_dene('yanlis-3')['durum']];
$S['sifre_kilitte_dogru'] = sahip_sifre_dene('ornek-ortak-sifre-1');
$S['sifre_dene_panel_kilit'] = yakala(fn() => sifre_dene('ornek-ortak-sifre-1', null));
$S['giris_kaydi'] = (int)tek('SELECT COUNT(*) AS c FROM girisler')['c'];
// sifre ayarlanmamis: deneme sayilmaz. Etkin ozet degistigi icin ilk deneme panel gibi once sifre_izi_denetle() yapar:
// eski hatali denemeler (girisler) silinir. Sonra eklenen bir kayit ikinci denemede artmaz (deneme sayilmaz).
$GLOBALS['C']['password_hash'] = '';
$ilk = sahip_sifre_dene('herhangi');
$temizlendi = (int)tek('SELECT COUNT(*) AS c FROM girisler')['c'];
calistir('INSERT INTO girisler (kim, ip, cihaz, zaman) VALUES (?, ?, ?, ?)', [yeni_id(), 'ornek-ip', null, simdi()]);
$S['kurulmadi'] = ['ilk' => $ilk, 'dene' => sahip_sifre_dene('herhangi'), 'iz' => sahip_sifre_izi(), 'temizlendi' => $temizlendi,
    'giris_kaydi' => (int)tek('SELECT COUNT(*) AS c FROM girisler')['c']];

echo json_encode($S, JSON_UNESCAPED_UNICODE);
