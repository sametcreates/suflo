<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP deposu: ayri bir SQLite dosyasi (private/<uygulama>-v1/mcp.sqlite). Studio veritabanina ve
 * semasina dokunmaz. Jeton, kod ve sirlarin yalniz SHA-256 ozeti saklanir.
 *
 * Tablolar (hepsi mcp_ onekli; yanlislikla Studio veritabani verilse bile panel tablolariyla cakismaz):
 *   mcp_ayar     sema surumu
 *   mcp_istemci  dinamik kayitli OAuth istemcileri (RFC 7591); hic sessizce degistirilmez
 *   mcp_onay     onay sayfasi istekleri: CSRF + tarayici cerezi ozeti, OAuth parametreleri (10 dk, tek kullanimlik)
 *   mcp_izin     grant'ler: kapsam, kaynak (audience), panel sifre izi, mutlak bitis, durum
 *   mcp_kod      authorization code'lar (5 dk, tek kullanimlik, PKCE meydan okumasina bagli)
 *   mcp_jeton    access / refresh jetonlari (ozet, tur, grant, bitis, durum: aktif | kullanildi | iptal). Yenileme jetonunda
 *                donusum (dondurulme zamani), halef (yerine verilen yenileme jetonunun ozeti) ve ebeveyn (hangi jetonun
 *                donusumunden ciktigi): ayni anda gelen iki yenilemenin ikincisi icin kisa tolerans penceresi (oauth.php)
 *   mcp_toplu    toplu onay kodlari (islem listesinin ozetine ve grant'e bagli, 15 dk, tek kullanimlik, sonuc saklanir)
 *   mcp_gunluk   islem gunlugu (sir / jeton yok)
 *   mcp_sayac    hiz siniri sayaclari (sabit pencere; pencere = baslangic zamani)
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

const MCP_SEMA = '2';
const MCP_KAYIT_SAYACI = 'kayit|toplam';         // DCR genel gunluk sayaci (mcp_sayac anahtari)
const MCP_KAYITSIZ_ISTEMCI_OMRU = 6 * 3600;     // hic baglanmamis (grant almamis) istemci bu sureden sonra silinir

function mcp_mesgul_mu(Throwable $e): bool {
    return $e instanceof McpMesgulHatasi
        || (bool)preg_match('/database is locked|database table is locked|Lock wait timeout|Deadlock/i', $e->getMessage());
}

function mcp_db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $yol = (string)mcp_c('mcp_db');
    if ($yol === '' || !is_dir(dirname($yol))) throw new McpKurulumHatasi('MCP veritabani klasoru yok.');
    $pdo = new PDO('sqlite:' . $yol, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA busy_timeout=8000');
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('PRAGMA synchronous=NORMAL');
    mcp_sema_kur($pdo);
    return $pdo;
}

function mcp_sema_degeri(PDO $p): ?string {
    try {
        $s = $p->query("SELECT deger FROM mcp_ayar WHERE anahtar = 'sema'");
        $r = $s->fetch();
        $s->closeCursor();
        return $r ? (string)$r['deger'] : null;
    } catch (Throwable $e) {
        if (mcp_mesgul_mu($e)) throw $e;
        return null;
    }
}

/**
 * Tablolari bir kez, kurulum kilidi altinda kurar. SQLite'ta DDL islem icindedir: yarim kurulum kalmaz.
 * Eski surumdeki depo yerinde, ayni kilit altinda yukseltilir (veri korunur): 1 -> 2 mcp_jeton'a donusum / halef /
 * ebeveyn sutunlari. Bilinmeyen (daha yeni) bir sema surumu bulunursa uzerine yazilmaz (acik kurulum hatasi).
 */
function mcp_sema_kur(PDO $p): void {
    if (mcp_sema_degeri($p) === MCP_SEMA) return;
    $p->exec('BEGIN IMMEDIATE');
    try {
        $s = mcp_sema_degeri($p);
        if ($s === null) {
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_ayar (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL)');
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_istemci (id TEXT PRIMARY KEY, ad TEXT NOT NULL, yonlendirmeler TEXT NOT NULL,
                yontem TEXT NOT NULL, sir_ozet TEXT NULL, uygulama_turu TEXT NOT NULL, kapsam TEXT NOT NULL,
                olusturma INTEGER NOT NULL, ip_ozet TEXT NOT NULL, son_kullanim INTEGER NULL)');
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_onay (id TEXT PRIMARY KEY, csrf_ozet TEXT NOT NULL, cerez_ozet TEXT NOT NULL,
                istemci TEXT NOT NULL, yonlendirme TEXT NOT NULL, yonlendirme_acik INTEGER NOT NULL, durum_param TEXT NULL,
                meydan TEXT NOT NULL, kaynak TEXT NOT NULL, kapsam TEXT NOT NULL, olusturma INTEGER NOT NULL, son INTEGER NOT NULL,
                kullanildi INTEGER NOT NULL DEFAULT 0, deneme INTEGER NOT NULL DEFAULT 0)');
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_izin (id TEXT PRIMARY KEY, istemci TEXT NOT NULL, kapsam TEXT NOT NULL,
                kaynak TEXT NOT NULL, sifre_izi TEXT NOT NULL, olusturma INTEGER NOT NULL, bitis INTEGER NOT NULL,
                son_kullanim INTEGER NULL, durum TEXT NOT NULL, iptal_nedeni TEXT NULL, iptal_zamani INTEGER NULL)');
            $p->exec('CREATE INDEX IF NOT EXISTS mcp_izin_istemci ON mcp_izin (istemci)');
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_kod (ozet TEXT PRIMARY KEY, izin TEXT NOT NULL, istemci TEXT NOT NULL,
                yonlendirme TEXT NOT NULL, yonlendirme_acik INTEGER NOT NULL, meydan TEXT NOT NULL, kaynak TEXT NOT NULL,
                kapsam TEXT NOT NULL, olusturma INTEGER NOT NULL, son INTEGER NOT NULL, kullanildi INTEGER NOT NULL DEFAULT 0)');
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_jeton (ozet TEXT PRIMARY KEY, tur TEXT NOT NULL, izin TEXT NOT NULL,
                istemci TEXT NOT NULL, kapsam TEXT NOT NULL, kaynak TEXT NOT NULL, olusturma INTEGER NOT NULL,
                son INTEGER NOT NULL, durum TEXT NOT NULL, donusum INTEGER NULL, halef TEXT NULL, ebeveyn TEXT NULL)');
            $p->exec('CREATE INDEX IF NOT EXISTS mcp_jeton_izin ON mcp_jeton (izin)');
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_toplu (kod_ozet TEXT PRIMARY KEY, izin TEXT NOT NULL, islemler TEXT NOT NULL,
                islem_ozeti TEXT NOT NULL, olusturma INTEGER NOT NULL, son INTEGER NOT NULL, durum TEXT NOT NULL,
                sonuc TEXT NULL, alinma INTEGER NULL)');
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_gunluk (sira INTEGER PRIMARY KEY AUTOINCREMENT, zaman INTEGER NOT NULL,
                istemci TEXT NOT NULL, olay TEXT NOT NULL, sonuc TEXT NOT NULL, etkilenen TEXT NOT NULL, ozet TEXT NOT NULL)');
            $p->exec('CREATE TABLE IF NOT EXISTS mcp_sayac (anahtar TEXT PRIMARY KEY, pencere INTEGER NOT NULL, sayi INTEGER NOT NULL)');
            $p->exec("INSERT INTO mcp_ayar (anahtar, deger) VALUES ('sema', '" . MCP_SEMA . "')");
        } elseif ($s === '1') {
            // 1 -> 2: yenileme jetonu tolerans penceresi icin sutunlar. Eski 'kullanildi' satirlarinda donusum NULL kalir:
            // onlar icin tolerans yok (eskisi gibi tekrar = grant iptali).
            $p->exec('ALTER TABLE mcp_jeton ADD COLUMN donusum INTEGER NULL');
            $p->exec('ALTER TABLE mcp_jeton ADD COLUMN halef TEXT NULL');
            $p->exec('ALTER TABLE mcp_jeton ADD COLUMN ebeveyn TEXT NULL');
            $p->exec("UPDATE mcp_ayar SET deger = '" . MCP_SEMA . "' WHERE anahtar = 'sema'");
        } elseif ($s !== MCP_SEMA) {
            throw new McpKurulumHatasi('MCP veritabani baska bir sema surumunde.');
        }
        $p->exec('COMMIT');
    } catch (Throwable $e) {
        try { $p->exec('ROLLBACK'); } catch (Throwable $e2) {}
        throw $e;
    }
}

function mcp_tek(string $sql, array $par = []): ?array {
    $s = mcp_db()->prepare($sql);
    $s->execute($par);
    $r = $s->fetch();
    $s->closeCursor();
    return $r ?: null;
}
function mcp_hepsi(string $sql, array $par = []): array {
    $s = mcp_db()->prepare($sql);
    $s->execute($par);
    $r = $s->fetchAll();
    $s->closeCursor();
    return $r;
}
function mcp_calistir(string $sql, array $par = []): int {
    $s = mcp_db()->prepare($sql);
    $s->execute($par);
    $n = $s->rowCount();
    $s->closeCursor();
    return $n;
}
/** Yazma islemi: kilit bastan alinir (BEGIN IMMEDIATE); hata olursa geri alinir. Ic ice cagrilirsa disariya katilir. */
function mcp_islem(callable $f) {
    static $derinlik = 0;
    if ($derinlik > 0) return $f();
    $p = mcp_db();
    $p->exec('BEGIN IMMEDIATE');
    $derinlik++;
    try {
        $r = $f();
        $derinlik--;
        $p->exec('COMMIT');
        return $r;
    } catch (Throwable $e) {
        $derinlik--;
        try { $p->exec('ROLLBACK'); } catch (Throwable $e2) {}
        throw $e;
    }
}

/* ---------------- Hiz siniri ---------------- */

/** Sabit pencereli sayac. Sinir asilmadiysa sayar ve true doner. */
function mcp_hiz(string $anahtar, int $pencere, int $sinir): bool {
    return (bool)mcp_islem(function () use ($anahtar, $pencere, $sinir) {
        $no = intdiv(mcp_zaman(), $pencere) * $pencere;   // pencerenin baslangic zamani
        $r = mcp_tek('SELECT pencere, sayi FROM mcp_sayac WHERE anahtar = ?', [$anahtar]);
        if ($r && (int)$r['pencere'] === $no) {
            if ((int)$r['sayi'] >= $sinir) return false;
            mcp_calistir('UPDATE mcp_sayac SET sayi = sayi + 1 WHERE anahtar = ?', [$anahtar]);
            return true;
        }
        mcp_calistir('INSERT OR REPLACE INTO mcp_sayac (anahtar, pencere, sayi) VALUES (?, ?, 1)', [$anahtar, $no]);
        return true;
    });
}

/* ---------------- Gunluk ---------------- */

/** Islem gunlugu satiri. $etkilenen: kayit kimlikleri; $ozet: kisa aciklama (sir, jeton, sifre ASLA). */
function mcp_gunluk(string $istemci, string $olay, string $sonuc, array $etkilenen = [], string $ozet = ''): void {
    $kimlikler = array_values(array_slice(array_filter(array_map('strval', $etkilenen), fn ($x) => $x !== ''), 0, 100));
    try {
        mcp_calistir('INSERT INTO mcp_gunluk (zaman, istemci, olay, sonuc, etkilenen, ozet) VALUES (?, ?, ?, ?, ?, ?)', [
            mcp_zaman(), mcp_kisalt($istemci, 100), mcp_kisalt($olay, 60), mcp_kisalt($sonuc, 60),
            mcp_json_metin($kimlikler), mcp_kisalt($ozet, 300),
        ]);
    } catch (Throwable $e) {
        error_log('suflo-mcp gunluk yazilamadi: ' . $e->getMessage());
    }
}

/* ---------------- Grant / jeton ---------------- */

function mcp_izin_iptal(string $izin, string $neden): void {
    mcp_islem(function () use ($izin, $neden) {
        mcp_calistir("UPDATE mcp_izin SET durum = 'iptal', iptal_nedeni = ?, iptal_zamani = ? WHERE id = ? AND durum = 'aktif'", [$neden, mcp_zaman(), $izin]);
        mcp_calistir("UPDATE mcp_jeton SET durum = 'iptal' WHERE izin = ? AND durum = 'aktif'", [$izin]);
    });
}
/** Panel sifresi degistiyse / sifirlandiysa (ya da hic yoksa) parmak izi uymayan butun grant'ler iptal. */
function mcp_sifre_izi_uygula(?string $guncel): void {
    mcp_islem(function () use ($guncel) {
        $iptal = $guncel === null
            ? mcp_hepsi("SELECT id FROM mcp_izin WHERE durum = 'aktif'")
            : mcp_hepsi("SELECT id FROM mcp_izin WHERE durum = 'aktif' AND sifre_izi <> ?", [$guncel]);
        foreach ($iptal as $r) {
            mcp_calistir("UPDATE mcp_izin SET durum = 'iptal', iptal_nedeni = 'sifre_degisti', iptal_zamani = ? WHERE id = ?", [mcp_zaman(), $r['id']]);
            mcp_calistir("UPDATE mcp_jeton SET durum = 'iptal' WHERE izin = ? AND durum = 'aktif'", [$r['id']]);
        }
    });
}
/**
 * Yeni access + refresh jetonu (islem icinde cagrilir). Jetonun kendisi yalniz yanitta doner.
 * $ebeveyn: yenileme jetonu bir donusumden cikiyorsa o donusumun kaynagi olan yenileme jetonunun ozeti (ilk verilende null).
 */
function mcp_jeton_ver(array $izin, string $kapsam, ?string $ebeveyn = null): array {
    $n = mcp_zaman();
    $erisim = mcp_rastgele(32);
    $yenileme = mcp_rastgele(32);
    $erisimSon = min($n + MCP_ERISIM_OMRU, (int)$izin['bitis']);
    $yenilemeSon = min($n + MCP_YENILEME_OMRU, (int)$izin['bitis']);
    $ekle = 'INSERT INTO mcp_jeton (ozet, tur, izin, istemci, kapsam, kaynak, olusturma, son, durum, ebeveyn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
    mcp_calistir($ekle, [mcp_ozet($erisim), 'erisim', $izin['id'], $izin['istemci'], $kapsam, $izin['kaynak'], $n, $erisimSon, 'aktif', null]);
    mcp_calistir($ekle, [mcp_ozet($yenileme), 'yenileme', $izin['id'], $izin['istemci'], $izin['kapsam'], $izin['kaynak'], $n, $yenilemeSon, 'aktif', $ebeveyn]);
    mcp_calistir('UPDATE mcp_izin SET son_kullanim = ? WHERE id = ?', [$n, $izin['id']]);
    return [
        'access_token' => $erisim,
        'token_type' => 'Bearer',
        'expires_in' => max(1, $erisimSon - $n),
        'refresh_token' => $yenileme,
        'scope' => $kapsam,
    ];
}
/**
 * Access token denetimi (MCP her istekte). Doner: ['gecerli' => true, 'izin' => [...], 'kapsamlar' => [...], 'istemci_adi' => ...]
 * ya da ['gecerli' => false, 'neden' => '...']. Audience: jetonun kaynagi bu sunucunun kanonik MCP adresi olmali.
 */
function mcp_erisim_dogrula(string $jeton, ?string $guncelIz): array {
    $r = mcp_tek("SELECT j.durum AS j_durum, j.son AS j_son, j.kapsam AS j_kapsam, j.kaynak AS j_kaynak,
            i.id, i.istemci, i.kapsam, i.kaynak, i.sifre_izi, i.bitis, i.durum, i.son_kullanim, s.ad AS istemci_adi
        FROM mcp_jeton j JOIN mcp_izin i ON i.id = j.izin LEFT JOIN mcp_istemci s ON s.id = i.istemci
        WHERE j.ozet = ? AND j.tur = 'erisim'", [mcp_ozet($jeton)]);
    $n = mcp_zaman();
    if (!$r) return ['gecerli' => false, 'neden' => 'bilinmiyor'];
    if ($r['j_durum'] !== 'aktif' || $r['durum'] !== 'aktif') return ['gecerli' => false, 'neden' => 'iptal'];
    if ((int)$r['j_son'] <= $n || (int)$r['bitis'] <= $n) return ['gecerli' => false, 'neden' => 'suresi_doldu'];
    if (!mcp_kaynak_bizim_mi((string)$r['j_kaynak']) || !mcp_kaynak_bizim_mi((string)$r['kaynak'])) return ['gecerli' => false, 'neden' => 'audience'];
    if ($guncelIz === null || !hash_equals((string)$r['sifre_izi'], $guncelIz)) {
        mcp_sifre_izi_uygula($guncelIz);
        return ['gecerli' => false, 'neden' => 'sifre_degisti'];
    }
    if ($r['son_kullanim'] === null || $n - (int)$r['son_kullanim'] > 60) {
        try { mcp_calistir('UPDATE mcp_izin SET son_kullanim = ? WHERE id = ?', [$n, $r['id']]); } catch (Throwable $e) { /* mesgulse sonra */ }
    }
    return [
        'gecerli' => true,
        'izin' => $r,
        'kapsamlar' => array_values(array_intersect(MCP_KAPSAMLAR, explode(' ', (string)$r['j_kapsam']))),
        'istemci_adi' => (string)($r['istemci_adi'] ?? 'Bilinmeyen istemci'),
    ];
}

/* ---------------- Toplu onay kodlari ---------------- */

/** Islem listesinin kanonik JSON'u (anahtarlar sirali): ozet buna gore alinir. */
function mcp_kanonik_json($v): string {
    $sirala = function ($x) use (&$sirala) {
        if (!is_array($x)) return $x;
        if ($x !== [] && array_keys($x) !== range(0, count($x) - 1)) { ksort($x, SORT_STRING); }
        return array_map($sirala, $x);
    };
    return mcp_json_metin($sirala($v));
}
function mcp_toplu_kod_ver(string $izin, array $islemler): array {
    $kod = mcp_rastgele(24);
    $json = mcp_kanonik_json($islemler);
    $n = mcp_zaman();
    mcp_islem(function () use ($kod, $izin, $json, $n) {
        mcp_calistir("INSERT INTO mcp_toplu (kod_ozet, izin, islemler, islem_ozeti, olusturma, son, durum) VALUES (?, ?, ?, ?, ?, ?, 'bekliyor')",
            [mcp_ozet($kod), $izin, $json, mcp_ozet($json), $n, $n + MCP_TOPLU_OMRU]);
    });
    return ['kod' => $kod, 'son' => $n + MCP_TOPLU_OMRU];
}

/* ---------------- Studio Ayarlar icin (panel entegrasyonu) ---------------- */

/** "Sohbet baglantilari" listesi: istemci, kapsam, olusturma, son kullanim, durum. Jeton / ozet donmez. */
function mcp_baglantilar(): array {
    return mcp_hepsi("SELECT i.id, COALESCE(s.ad, 'Bilinmeyen istemci') AS istemci, i.kapsam, i.olusturma, i.son_kullanim, i.bitis,
            i.durum, i.iptal_nedeni FROM mcp_izin i LEFT JOIN mcp_istemci s ON s.id = i.istemci
        WHERE i.durum = 'aktif' OR i.iptal_zamani > ? ORDER BY COALESCE(i.son_kullanim, i.olusturma) DESC LIMIT 200", [mcp_zaman() - 30 * 86400]);
}
function mcp_baglanti_kes(string $izin): bool {
    $var = mcp_tek("SELECT 1 AS v FROM mcp_izin WHERE id = ? AND durum = 'aktif'", [$izin]) !== null;
    if ($var) { mcp_izin_iptal($izin, 'sahip_kesti'); mcp_gunluk('Studio', 'baglanti_kes', 'tamam', [], 'Sahip bir sohbet baglantisini kesti'); }
    return $var;
}
function mcp_tumunu_kes(): int {
    $n = 0;
    foreach (mcp_hepsi("SELECT id FROM mcp_izin WHERE durum = 'aktif'") as $r) { mcp_izin_iptal($r['id'], 'sahip_kesti'); $n++; }
    mcp_gunluk('Studio', 'tumunu_kes', 'tamam', [], "Sahip tum sohbet baglantilarini kesti ($n)");
    return $n;
}
/**
 * DCR genel gunluk sayacini (gunde 50 kayit) sifirlar. Ayarlar ekrani icin: biri kotayi doldurduysa sahip yeni bir
 * sohbet baglantisi kurabilsin diye. IP basina sinira dokunmaz. Doner: sayac vardiysa true.
 */
function mcp_kayit_sayaci_sifirla(): bool {
    $var = mcp_calistir('DELETE FROM mcp_sayac WHERE anahtar = ?', [MCP_KAYIT_SAYACI]) > 0;
    mcp_gunluk('Studio', 'kayit_sayaci_sifirla', 'tamam', [], 'Sahip istemci kaydi gunluk sayacini sifirladi');
    return $var;
}
function mcp_gunluk_son(int $adet = 100): array {
    $adet = max(1, min(500, $adet));
    return array_map(function ($r) {
        $r['etkilenen'] = json_decode((string)$r['etkilenen'], true) ?: [];
        return $r;
    }, mcp_hepsi("SELECT zaman, istemci, olay, sonuc, etkilenen, ozet FROM mcp_gunluk ORDER BY sira DESC LIMIT $adet"));
}

/* ---------------- Budama ---------------- */

/** Suresi dolmus kayitlari temizler. Arada bir (rastgele) cagrilir; hata olursa sessizce sonraki istege kalir. */
function mcp_buda(bool $zorla = false): void {
    if (!$zorla && random_int(1, 50) !== 1) return;
    try {
        mcp_islem(function () {
            $n = mcp_zaman();
            mcp_calistir('DELETE FROM mcp_onay WHERE son < ?', [$n - 86400]);
            mcp_calistir('DELETE FROM mcp_kod WHERE son < ?', [$n - 86400]);
            mcp_calistir('DELETE FROM mcp_jeton WHERE son < ?', [$n - 86400]);
            mcp_calistir('DELETE FROM mcp_toplu WHERE son < ?', [$n - 86400]);
            mcp_calistir('DELETE FROM mcp_sayac WHERE pencere < ?', [$n - 86400]);   // pencereler en cok 1 gun
            mcp_calistir("DELETE FROM mcp_izin WHERE (durum <> 'aktif' AND iptal_zamani < ?) OR bitis < ?", [$n - 30 * 86400, $n - 30 * 86400]);
            mcp_calistir("UPDATE mcp_izin SET durum = 'iptal', iptal_nedeni = 'suresi_doldu', iptal_zamani = ? WHERE durum = 'aktif' AND bitis < ?", [$n, $n]);
            // Hic kullanilmamis (grant almamis) istemciler 6 saat sonra silinir (sahte kayitlar birikmesin; gercek istemci
            // kayittan hemen sonra onay sayfasina gider). Kullanilmis istemci hic silinmez (ChatGPT ayni istemciyi yeniden
            // kullanir; silinirse invalid_client olur).
            mcp_calistir('DELETE FROM mcp_istemci WHERE son_kullanim IS NULL AND olusturma < ?', [$n - MCP_KAYITSIZ_ISTEMCI_OMRU]);
            $esik = mcp_tek('SELECT sira FROM mcp_gunluk ORDER BY sira DESC LIMIT 1 OFFSET 5000');
            if ($esik) mcp_calistir('DELETE FROM mcp_gunluk WHERE sira <= ?', [(int)$esik['sira']]);
        });
    } catch (Throwable $e) {
        if (!mcp_mesgul_mu($e)) error_log('suflo-mcp budama: ' . $e->getMessage());
    }
}
