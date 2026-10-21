<?php
declare(strict_types=1);
/*
 * YALNIZ TESTLER ICIN sahte Suflo Studio arka ucu (tests/test-studio-mcp*.js). Canliya ASLA yuklenmez.
 * Gercek arka uc (Studio veritabanina bagli) ayni arayuzu uygulayacak: server/studio-v1/mcp/README.md.
 *
 * - Sahip dogrulama panelin sifre_dene() kurallarini taklit eder: deneme sifre denetiminden ONCE kaydedilir; pencere
 *   icindeki hatali deneme sayisi login_max_fail'i asarsa 'kilitli' (sifre denenmez, deneme sayilmaz); dogruysa deneme silinir.
 * - Sifre izi panelle ayni: sha256('iz|' + password_hash).
 * - Kayitlar ayri bir SQLite dosyasinda, anonim ornek veriyle.
 * Test anahtarlari (config): sahte_mesgul => true (gecici hata), sahte_bozuk_cikti => true (semaya uymayan cikti),
 * sahte_hata_verisi => true (is hatasi + semaya uymayan veri: structuredContent gonderilmemeli).
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

return new class($C, $ozel) implements McpSahipDogrulayici, McpStudioArka {
    private PDO $db;
    private array $C;

    public function __construct(array $C, string $ozel) {
        $this->C = $C;
        $this->db = new PDO('sqlite:' . $ozel . '/sahte-studio.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $this->db->exec('PRAGMA busy_timeout=8000');
        $this->db->exec('PRAGMA journal_mode=WAL');
        $this->db->exec('BEGIN IMMEDIATE');
        try {
            $this->db->exec('CREATE TABLE IF NOT EXISTS girisler (kim TEXT PRIMARY KEY, zaman INTEGER NOT NULL)');
            $this->db->exec('CREATE TABLE IF NOT EXISTS musteri (id TEXT PRIMARY KEY, ad TEXT, kurum TEXT, arsiv INTEGER, surum INTEGER)');
            $this->db->exec('CREATE TABLE IF NOT EXISTS etkinlik (id TEXT PRIMARY KEY, musteri_id TEXT NULL, baslik TEXT, tur TEXT, tum_gun INTEGER,
                bas TEXT, bit TEXT, durum TEXT, konum TEXT, surum INTEGER)');
            $this->db->exec('CREATE TABLE IF NOT EXISTS icerik (id TEXT PRIMARY KEY, musteri_id TEXT, baslik TEXT, tur TEXT, durum TEXT,
                teslim TEXT NULL, plan TEXT NULL, cekim_id TEXT NULL, surum INTEGER, gecmis TEXT)');
            $this->db->exec('CREATE TABLE IF NOT EXISTS anlik (id TEXT PRIMARY KEY, neden TEXT, zaman INTEGER)');
            if ((int)$this->db->query('SELECT COUNT(*) FROM musteri')->fetchColumn() === 0) {
                $this->db->exec("INSERT INTO musteri VALUES ('aaaaaaaa0001', 'Örnek Kafe', 'Örnek Gıda', 0, 1), ('aaaaaaaa0002', 'Deneme Spor', '', 0, 2),
                    ('aaaaaaaa0003', 'Örnek Kafe', 'Başka Şube', 0, 3)");
                $this->db->exec("INSERT INTO etkinlik VALUES ('bbbbbbbb0001', 'aaaaaaaa0002', 'Deneme çekim', 'cekim', 0, '2099-01-05T10:00', '2099-01-05T12:00', 'planlandi', '', 4)");
                $this->db->exec("INSERT INTO icerik VALUES ('cccccccc0001', 'aaaaaaaa0001', 'Tanıtım reels', 'reels', 'kurguda', '2099-01-10', NULL, NULL, 5, '[]')");
            }
            $this->db->exec('COMMIT');
        } catch (Throwable $e) {
            $this->db->exec('ROLLBACK');
            throw $e;
        }
    }

    /* ---- Sahip dogrulama (panel sifre_dene taklidi) ---- */

    public function sahip_sifre_dene(string $sifre): array {
        $ozet = (string)($this->C['password_hash'] ?? '');
        if ($ozet === '') return ['durum' => 'kurulmadi', 'iz' => null];
        $n = time();
        $max = max(1, (int)($this->C['login_max_fail'] ?? 8));
        $kim = bin2hex(random_bytes(12));
        $this->db->prepare('INSERT INTO girisler (kim, zaman) VALUES (?, ?)')->execute([$kim, $n]);
        $s = $this->db->prepare('SELECT COUNT(*) FROM girisler WHERE zaman >= ?');
        $s->execute([$n - (int)($this->C['login_window'] ?? 900)]);
        if ((int)$s->fetchColumn() > $max) {
            $this->db->prepare('DELETE FROM girisler WHERE kim = ?')->execute([$kim]);
            return ['durum' => 'kilitli', 'iz' => null];
        }
        if (strlen($sifre) <= 1024 && password_verify($sifre, $ozet)) {
            $this->db->prepare('DELETE FROM girisler WHERE kim = ?')->execute([$kim]);
            return ['durum' => 'dogru', 'iz' => hash('sha256', 'iz|' . $ozet)];
        }
        return ['durum' => 'yanlis', 'iz' => null];
    }
    public function sahip_sifre_izi(): ?string {
        $ozet = (string)($this->C['password_hash'] ?? '');
        return $ozet === '' ? null : hash('sha256', 'iz|' . $ozet);
    }

    /* ---- Yardimcilar ---- */

    private function norm(string $s): string { return mb_strtolower(str_replace(['I', 'İ'], ['ı', 'i'], trim($s)), 'UTF-8'); }
    private function tek(string $sql, array $p = []): ?array { $s = $this->db->prepare($sql); $s->execute($p); $r = $s->fetch(); return $r ?: null; }
    private function hepsi(string $sql, array $p = []): array { $s = $this->db->prepare($sql); $s->execute($p); return $s->fetchAll(); }
    private function yaz(string $sql, array $p = []): void { $this->db->prepare($sql)->execute($p); }
    private function surum(): int { return (int)$this->db->query('SELECT COALESCE(MAX(surum), 0) FROM (SELECT surum FROM musteri UNION ALL SELECT surum FROM etkinlik UNION ALL SELECT surum FROM icerik)')->fetchColumn() + 1; }
    private function musteriAdi(?string $id): ?string { if ($id === null) return null; $r = $this->tek('SELECT ad FROM musteri WHERE id = ?', [$id]); return $r ? $r['ad'] : null; }
    private function musteriDisa(array $r): array { return ['id' => $r['id'], 'ad' => $r['ad'], 'kurum' => $r['kurum'], 'arsiv' => (bool)$r['arsiv'], 'yayin_duzeni' => 'belirsiz']; }
    private function etkinlikDisa(array $r): array {
        return ['id' => $r['id'], 'surum' => (int)$r['surum'], 'baslik' => $r['baslik'], 'musteri_id' => $r['musteri_id'], 'musteri_adi' => $this->musteriAdi($r['musteri_id']),
            'tur' => $r['tur'], 'tum_gun' => (bool)$r['tum_gun'], 'baslangic' => $r['bas'], 'bitis' => $r['bit'], 'durum' => $r['durum'], 'konum' => (string)$r['konum'], 'cakisan_idler' => []];
    }
    private function icerikDisa(array $r): array {
        return ['id' => $r['id'], 'surum' => (int)$r['surum'], 'baslik' => $r['baslik'], 'musteri_id' => $r['musteri_id'], 'musteri_adi' => $this->musteriAdi($r['musteri_id']),
            'tur' => $r['tur'], 'durum' => $r['durum'], 'teslim_tarihi' => $r['teslim'], 'plan_tarihi' => $r['plan'], 'cekim_id' => $r['cekim_id']];
    }
    private function islem(callable $f) {
        $this->db->exec('BEGIN IMMEDIATE');
        try { $r = $f(); $this->db->exec('COMMIT'); return $r; } catch (Throwable $e) { $this->db->exec('ROLLBACK'); throw $e; }
    }
    /** Cekim baslangic / bitis (YYYY-AA-GGTSS:DD ya da tum gunde YYYY-AA-GG). */
    private function aralik(array $g): array {
        if (($g['tum_gun'] ?? false) === true) return [$g['tarih'], $g['bitis_tarihi'] ?? $g['tarih'], true];
        $bas = $g['tarih'] . 'T' . $g['baslangic_saati'];
        if (isset($g['sure_dakika'])) {
            $bit = (new DateTimeImmutable($g['tarih'] . ' ' . $g['baslangic_saati']))->modify('+' . $g['sure_dakika'] . ' minutes')->format('Y-m-d\TH:i');
        } else {
            $bit = ($g['bitis_tarihi'] ?? $g['tarih']) . 'T' . $g['bitis_saati'];
        }
        return [$bas, $bit, false];
    }
    private function cakisanlar(string $bas, string $bit, bool $tumGun): array {
        if ($tumGun) return [];
        return array_map(fn ($r) => ['id' => $r['id'], 'baslik' => $r['baslik'], 'baslangic' => $r['bas'], 'bitis' => $r['bit']],
            $this->hepsi("SELECT * FROM etkinlik WHERE tum_gun = 0 AND durum <> 'iptal' AND bas < ? AND bit > ?", [$bit, $bas]));
    }
    private function musteriVarMi(?string $id): void {
        if ($id !== null && !$this->tek('SELECT 1 FROM musteri WHERE id = ?', [$id])) throw new McpAracHatasi('Müşteri bulunamadı (' . $id . '). studio_musteri_ara ile doğru id\'yi bul.');
    }

    /* ---- Araclar ---- */

    public function arac(string $ad, array $g, McpBaglam $b): McpSonuc {
        if (!empty($this->C['sahte_mesgul'])) throw new McpMesgulHatasi('studio kilitli');
        switch ($ad) {
            case 'studio_musteri_ara':
                if (!empty($this->C['sahte_bozuk_cikti'])) return McpSonuc::tamam(['musteriler' => 'bozuk', 'toplam' => 0]);
                if (!empty($this->C['sahte_hata_verisi'])) return McpSonuc::hata('Arama yapılamadı (deneme).', ['musteriler' => [], 'neden' => 'deneme']);
                $q = $this->norm($g['sorgu']);
                $l = array_values(array_filter($this->hepsi('SELECT * FROM musteri ORDER BY id'),
                    fn ($r) => str_contains($this->norm($r['ad']), $q) || str_contains($this->norm($r['kurum']), $q)));
                return McpSonuc::tamam(['musteriler' => array_map([$this, 'musteriDisa'], $l), 'toplam' => count($l)], count($l) . ' müşteri bulundu.');
            case 'studio_takvim':
                $l = $this->hepsi('SELECT * FROM etkinlik WHERE substr(bas, 1, 10) <= ? AND substr(bit, 1, 10) >= ? ORDER BY bas', [$g['bitis_tarihi'], $g['baslangic_tarihi']]);
                if (isset($g['musteri_id'])) $l = array_values(array_filter($l, fn ($r) => $r['musteri_id'] === $g['musteri_id']));
                return McpSonuc::tamam(['etkinlikler' => array_map([$this, 'etkinlikDisa'], $l), 'paylasimlar' => []]);
            case 'studio_icerik_listele':
                $l = $this->hepsi('SELECT * FROM icerik ORDER BY id');
                $l = array_values(array_filter($l, fn ($r) => (!isset($g['musteri_id']) || $r['musteri_id'] === $g['musteri_id']) && (!isset($g['durum']) || $r['durum'] === $g['durum'])));
                return McpSonuc::tamam(['icerikler' => array_map([$this, 'icerikDisa'], array_slice($l, 0, $g['limit'])), 'toplam' => count($l)]);
            case 'studio_musteri_olustur':
                return $this->islem(function () use ($g, $b) {
                    $id = $b->kayit_kimligi($g['istek_anahtari']);
                    if ($r = $this->tek('SELECT * FROM musteri WHERE id = ?', [$id])) return McpSonuc::tamam(['durum' => 'zaten_vardi', 'musteri' => $this->musteriDisa($r), 'uyari' => 'Bu istek daha önce işlendi.']);
                    foreach ($this->hepsi('SELECT * FROM musteri') as $r) {
                        if ($this->norm($r['ad']) === $this->norm($g['ad']) && $this->norm($r['kurum']) === $this->norm($g['kurum'] ?? '')) {
                            return McpSonuc::tamam(['durum' => 'zaten_vardi', 'musteri' => $this->musteriDisa($r), 'uyari' => 'Aynı ad ve kurumla müşteri zaten var.']);
                        }
                    }
                    $this->yaz('INSERT INTO musteri VALUES (?, ?, ?, 0, ?)', [$id, $g['ad'], $g['kurum'] ?? '', $this->surum()]);
                    return McpSonuc::tamam(['durum' => 'olusturuldu', 'musteri' => $this->musteriDisa($this->tek('SELECT * FROM musteri WHERE id = ?', [$id])), 'uyari' => null],
                        'Müşteri oluşturuldu.', [$id], 'Musteri: ' . $g['ad']);
                });
            case 'studio_cekim_olustur':
                return $this->islem(function () use ($g, $b) {
                    $id = $b->kayit_kimligi($g['istek_anahtari']);
                    if ($r = $this->tek('SELECT * FROM etkinlik WHERE id = ?', [$id])) return McpSonuc::tamam(['durum' => 'zaten_vardi', 'etkinlik' => $this->etkinlikDisa($r), 'cakisanlar' => [], 'mesaj' => 'Bu istek daha önce işlendi.']);
                    $this->musteriVarMi($g['musteri_id']);
                    [$bas, $bit, $tg] = $this->aralik($g);
                    $c = $this->cakisanlar($bas, $bit, $tg);
                    if ($c && $g['cakismayi_onayla'] !== true) return McpSonuc::tamam(['durum' => 'cakisma', 'etkinlik' => null, 'cakisanlar' => $c, 'mesaj' => 'Çakışma var; kaydedilmedi. Kullanıcıya sor.']);
                    $this->yaz('INSERT INTO etkinlik VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [$id, $g['musteri_id'], $g['baslik'], $g['tur'], $tg ? 1 : 0, $bas, $bit, 'planlandi', $g['konum'] ?? '', $this->surum()]);
                    return McpSonuc::tamam(['durum' => 'olusturuldu', 'etkinlik' => $this->etkinlikDisa($this->tek('SELECT * FROM etkinlik WHERE id = ?', [$id])), 'cakisanlar' => $c, 'mesaj' => 'Kaydedildi.'],
                        'Etkinlik kaydedildi.', [$id], 'Cekim: ' . $g['baslik']);
                });
            case 'studio_icerik_olustur':
                if ($g['adet'] > 1) {
                    $islemler = [];
                    for ($i = 1; $i <= $g['adet']; $i++) {
                        $op = ['islem' => 'icerik_olustur', 'musteri_id' => $g['musteri_id'], 'baslik' => $g['baslik'] . " ($i/{$g['adet']})", 'tur' => $g['tur']];
                        foreach (['teslim_tarihi', 'plan_tarihi', 'durum', 'cekim_id', 'not'] as $k) if (isset($g[$k])) $op[$k] = $g[$k];
                        $islemler[] = $op;
                    }
                    $o = $b->toplu_onizle($islemler);
                    return McpSonuc::tamam(['durum' => 'onay_gerekli', 'icerik' => null, 'onizleme' => $o, 'onay_kodu' => $o['onay_kodu'], 'son_gecerlilik' => $o['son_gecerlilik']],
                        'Kaydedilmedi: ' . $g['adet'] . ' içerik için önizleme hazır. Kullanıcı onaylarsa studio_toplu_uygula.');
                }
                return $this->islem(function () use ($g, $b) {
                    $id = $b->kayit_kimligi($g['istek_anahtari']);
                    if ($r = $this->tek('SELECT * FROM icerik WHERE id = ?', [$id])) return McpSonuc::tamam(['durum' => 'zaten_vardi', 'icerik' => $this->icerikDisa($r), 'onizleme' => null, 'onay_kodu' => null, 'son_gecerlilik' => null]);
                    $this->musteriVarMi($g['musteri_id']);
                    $this->yaz('INSERT INTO icerik VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [$id, $g['musteri_id'], $g['baslik'], $g['tur'], $g['durum'], $g['teslim_tarihi'] ?? null, $g['plan_tarihi'] ?? null, $g['cekim_id'] ?? null, $this->surum(),
                        json_encode([['m' => 'Sohbetten eklendi (' . $b->istemci_adi . ')']], JSON_UNESCAPED_UNICODE)]);
                    return McpSonuc::tamam(['durum' => 'olusturuldu', 'icerik' => $this->icerikDisa($this->tek('SELECT * FROM icerik WHERE id = ?', [$id])), 'onizleme' => null, 'onay_kodu' => null, 'son_gecerlilik' => null],
                        'İçerik kaydedildi.', [$id], 'Icerik: ' . $g['baslik']);
                });
            case 'studio_icerik_durum_guncelle':
            case 'studio_cekim_durum_guncelle':
                $tablo = $ad === 'studio_icerik_durum_guncelle' ? 'icerik' : 'etkinlik';
                $id = $g[$tablo === 'icerik' ? 'icerik_id' : 'cekim_id'];
                $anahtar = $tablo === 'icerik' ? 'icerik' : 'etkinlik';
                return $this->islem(function () use ($tablo, $id, $g, $anahtar) {
                    $r = $this->tek("SELECT * FROM $tablo WHERE id = ?", [$id]);
                    if (!$r) throw new McpAracHatasi('Kayıt bulunamadı.');
                    $disa = fn ($r) => $tablo === 'icerik' ? $this->icerikDisa($r) : $this->etkinlikDisa($r);
                    if ((int)$r['surum'] !== $g['beklenen_surum']) return McpSonuc::tamam(['durum' => 'surum_uyusmadi', $anahtar => $disa($r)], 'Kayıt bu arada değişmiş; güncellenmedi.');
                    if ($r['durum'] === $g['yeni_durum']) return McpSonuc::tamam(['durum' => 'degisiklik_yok', $anahtar => $disa($r)]);
                    $this->yaz("UPDATE $tablo SET durum = ?, surum = ? WHERE id = ? AND surum = ?", [$g['yeni_durum'], $this->surum(), $id, $r['surum']]);
                    return McpSonuc::tamam(['durum' => 'guncellendi', $anahtar => $disa($this->tek("SELECT * FROM $tablo WHERE id = ?", [$id]))], 'Güncellendi.', [$id], 'Durum: ' . $g['yeni_durum']);
                });
        }
        throw new McpAracHatasi('Bilinmeyen araç.');
    }

    /* ---- Toplu ---- */

    private function opDenetle(array $op): ?string {
        switch ($op['islem']) {
            case 'icerik_olustur':
                return $this->tek('SELECT 1 FROM musteri WHERE id = ?', [$op['musteri_id']]) ? null : 'Müşteri bulunamadı.';
            case 'cekim_olustur':
                return $op['musteri_id'] === null || $this->tek('SELECT 1 FROM musteri WHERE id = ?', [$op['musteri_id']]) ? null : 'Müşteri bulunamadı.';
            case 'icerik_durum':
            case 'cekim_durum':
                $t = $op['islem'] === 'icerik_durum' ? 'icerik' : 'etkinlik';
                $r = $this->tek("SELECT surum FROM $t WHERE id = ?", [$op[$t === 'icerik' ? 'icerik_id' : 'cekim_id']]);
                if (!$r) return 'Kayıt bulunamadı.';
                return (int)$r['surum'] === $op['beklenen_surum'] ? null : 'Sürüm uyuşmuyor (kayıt değişmiş).';
        }
        return 'Bilinmeyen işlem.';
    }
    public function toplu_dogrula(array $islemler, McpBaglam $b): array {
        if (!empty($this->C['sahte_mesgul'])) throw new McpMesgulHatasi('studio kilitli');
        $satirlar = [];
        foreach ($islemler as $i => $op) {
            $h = $this->opDenetle($op);
            $satirlar[] = ['sira' => $i, 'islem' => $op['islem'], 'ozet' => (string)($op['baslik'] ?? ($op['yeni_durum'] ?? '')), 'durum' => $h ? 'hata' : 'gecerli', 'mesaj' => $h];
        }
        return ['gecerli' => !array_filter($satirlar, fn ($s) => $s['durum'] === 'hata'), 'satirlar' => $satirlar, 'uyarilar' => []];
    }
    public function toplu_uygula(array $islemler, string $anahtar, McpBaglam $b): array {
        if (!empty($this->C['sahte_mesgul'])) throw new McpMesgulHatasi('studio kilitli');
        return $this->islem(function () use ($islemler, $anahtar, $b) {
            foreach ($islemler as $op) if ($h = $this->opDenetle($op)) return ['tamam' => false, 'mesaj' => 'Uygulanmadı: ' . $h, 'veri' => [], 'etkilenen' => [], 'anlik_id' => null];
            $anlik = bin2hex(random_bytes(8));
            $this->yaz('INSERT INTO anlik VALUES (?, ?, ?)', [$anlik, 'mcp_toplu_oncesi', time()]);
            $ids = [];
            foreach ($islemler as $i => $op) {
                $id = substr(hash('sha256', $anahtar . '|' . $i), 0, 24);
                if ($op['islem'] === 'icerik_olustur') {
                    if (!$this->tek('SELECT 1 FROM icerik WHERE id = ?', [$id])) {
                        $this->yaz('INSERT INTO icerik VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [$id, $op['musteri_id'], $op['baslik'], $op['tur'], $op['durum'] ?? 'fikir',
                            $op['teslim_tarihi'] ?? null, $op['plan_tarihi'] ?? null, $op['cekim_id'] ?? null, $this->surum(), '[]']);
                    }
                    $ids[] = $id;
                } elseif ($op['islem'] === 'cekim_olustur') {
                    if (!$this->tek('SELECT 1 FROM etkinlik WHERE id = ?', [$id])) {
                        [$bas, $bit, $tg] = $this->aralik($op);
                        $this->yaz('INSERT INTO etkinlik VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [$id, $op['musteri_id'], $op['baslik'], $op['tur'], $tg ? 1 : 0, $bas, $bit, 'planlandi', $op['konum'] ?? '', $this->surum()]);
                    }
                    $ids[] = $id;
                } else {
                    $t = $op['islem'] === 'icerik_durum' ? 'icerik' : 'etkinlik';
                    $rid = $op[$t === 'icerik' ? 'icerik_id' : 'cekim_id'];
                    $this->yaz("UPDATE $t SET durum = ?, surum = ? WHERE id = ?", [$op['yeni_durum'], $this->surum(), $rid]);
                    $ids[] = $rid;
                }
            }
            return ['tamam' => true, 'mesaj' => count($islemler) . ' işlem uygulandı.', 'veri' => ['islem_sayisi' => count($islemler)], 'etkilenen' => $ids, 'anlik_id' => $anlik];
        });
    }
};
