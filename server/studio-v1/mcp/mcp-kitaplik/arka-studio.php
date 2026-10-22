<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP: GERCEK arka uc. Studio veritabanina panelle AYNI kitapliktan (v1/studio-ortak.php) baglanir:
 * ayni dogrulama (temizle), ayni yazma yolu (islem + kayit_yaz: istemci kimligiyle tekrarlanabilir olusturma, WHERE surum = ?),
 * ayni gunluk / anlik kopya, ayni sifre kilidi (girisler tablosu). Studio semasi degismez; MCP kendi deposunu (mcp.sqlite) kullanir.
 *
 * Kurallar (araclar.php aciklamalari ve MCP_TALIMATLAR ile ayni):
 *  - Musteri tahmin edilmez: musteri_id var olmali ve arsivde olmamali; musteri_adi yalniz TAM (Turkce harf duyarsiz) adla
 *    eslesir; hic ya da birden cok eslesme -> is hatasi + aday adlar, hicbir sey yazilmaz.
 *  - Cakisma kurali arayuzle (studio-core.js zamanCakisanlari / takvimdeSayilir) ayni: etkinlik + calisma blogu birlikte;
 *    arsiv, iptal ve tamamlanmis sayilmaz; [bas, bit) yari acik (uc uca degmek cakisma degil); tum gun etkinlik butun gunu kapatir.
 *  - Tekil yazma: kayit kimligi $b->kayit_kimligi(istek_anahtari); ayni anahtar ayni kayda gider (mukerrer yok). Anahtarin
 *    baska girdiyle kullanimi MCP katmaninda (mcp_istek) reddedilir. Anlamsal mukerrer (ayni musteri + baslangic + baslik ...)
 *    yeni kayit acmaz.
 *  - Guncelleme beklenen_surum ile; uyusmazlikta YAZILMAZ: is hatasi (409) + guncel kayit.
 *  - Toplu uygulama: once anlik kopya ('mcp_toplu_oncesi', panel Ayarlar'dan geri yuklenir), sonra tek islemde hepsi ya da hicbiri.
 *  - Ucret (ucret) ve musteri notu hicbir ciktida yoktur. Silme / arsivleme / mesaj araci yoktur.
 *
 * Kapsamdaki degiskenler: $C (config dizisi), $ozel (private/<uygulama>-v1 klasoru).
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

// Kitaplik: public_html/<uygulama>/v1/studio-ortak.php (panel index.php'nin yaninda; v1/.htaccess disariya kapatir)
$kitaplik = __DIR__ . '/../v1/studio-ortak.php';
if (!is_file($kitaplik)) throw new McpKurulumHatasi('Studio veri kitapligi (v1/studio-ortak.php) bulunamadi.');
if (!defined('STUDIO_ORTAK')) define('STUDIO_ORTAK', 1);
require_once $kitaplik;
studio_dur_ayarla(null);      // kitaplik hatalari istisna olsun (surec cikmasin)
studio_ayar_kullan($C);

return new class implements McpSahipDogrulayici, McpStudioArka {
    private const DURUM_AD = ['fikir' => 'Fikir', 'cekim_planlandi' => 'Çekim planlandı', 'cekildi' => 'Çekildi', 'kurguda' => 'Kurguda',
        'onayda' => 'Müşteri onayında', 'revizyonda' => 'Revizyonda', 'hazir' => 'Yayına hazır', 'yayinlandi' => 'Yayınlandı'];
    private const ETKINLIK_DURUM_AD = ['planlandi' => 'Planlandı', 'tamamlandi' => 'Tamamlandı', 'iptal' => 'İptal'];
    private const TUR_AD = ['reels' => 'Reels', 'video' => 'Video', 'post' => 'Post', 'story' => 'Story', 'diger' => 'Diğer'];
    private const ETKINLIK_TUR_AD = ['cekim' => 'Çekim', 'toplanti' => 'Toplantı', 'diger' => 'Diğer'];
    private const GUN_KISA = [1 => 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    // Resmi tatiller: arayuzdeki studio-core.js ile ayni tablo (2429 sayili Kanun; dini bayramlar Diyanet, yalniz yayimlanmis yillar)
    private const SABIT_TATILLER = [['01-01', 'Yılbaşı'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'],
        ['05-19', "Atatürk'ü Anma, Gençlik ve Spor Bayramı"], ['07-15', 'Demokrasi ve Millî Birlik Günü'], ['08-30', 'Zafer Bayramı'],
        ['10-28', 'Cumhuriyet Bayramı arifesi', true], ['10-29', 'Cumhuriyet Bayramı']];
    private const DINI_BAYRAMLAR = [
        2026 => [['03-19', 'Ramazan Bayramı arifesi', true], ['03-20', 'Ramazan Bayramı 1. gün'], ['03-21', 'Ramazan Bayramı 2. gün'], ['03-22', 'Ramazan Bayramı 3. gün'],
            ['05-26', 'Kurban Bayramı arifesi', true], ['05-27', 'Kurban Bayramı 1. gün'], ['05-28', 'Kurban Bayramı 2. gün'], ['05-29', 'Kurban Bayramı 3. gün'], ['05-30', 'Kurban Bayramı 4. gün']],
        2027 => [['03-08', 'Ramazan Bayramı arifesi', true], ['03-09', 'Ramazan Bayramı 1. gün'], ['03-10', 'Ramazan Bayramı 2. gün'], ['03-11', 'Ramazan Bayramı 3. gün'],
            ['05-15', 'Kurban Bayramı arifesi', true], ['05-16', 'Kurban Bayramı 1. gün'], ['05-17', 'Kurban Bayramı 2. gün'], ['05-18', 'Kurban Bayramı 3. gün'], ['05-19', 'Kurban Bayramı 4. gün']],
    ];

    /* ================= Sahip dogrulama (panelin kilidi) ================= */

    public function sahip_sifre_dene(string $sifre): array {
        return $this->koru(fn () => \sahip_sifre_dene($sifre));
    }
    public function sahip_sifre_izi(): ?string {
        return $this->koru(fn () => \sahip_sifre_izi());
    }

    /* ================= Araclar ================= */

    public function arac(string $ad, array $g, McpBaglam $b): McpSonuc {
        return $this->koru(function () use ($ad, $g, $b) {
            switch ($ad) {
                case 'studio_musteri_ara': return $this->musteriAra($g);
                case 'studio_takvim': return $this->takvim($g);
                case 'studio_icerik_listele': return $this->icerikListele($g);
                case 'studio_musteri_olustur': return $this->musteriOlustur($g, $b);
                case 'studio_cekim_olustur': return $this->cekimOlustur($g, $b);
                case 'studio_icerik_olustur': return $this->icerikOlustur($g, $b);
                case 'studio_edit_zamani_ayir': return $this->editZamaniAyir($g, $b);
                case 'studio_icerik_durum_guncelle': return $this->durumGuncelle('icerik', $g['icerik_id'], $g, $b);
                case 'studio_cekim_durum_guncelle': return $this->durumGuncelle('etkinlik', $g['cekim_id'], $g, $b);
            }
            throw new McpAracHatasi('Bilinmeyen araç.');
        });
    }

    /* ---------------- Okuma ---------------- */

    private function musteriAra(array $g): McpSonuc {
        $v = $this->oku();
        $q = $this->katla($g['sorgu']);
        $tamQ = norm($g['sorgu']);
        $l = [];
        foreach ($v['musteri'] as $m) {
            $a = $this->katla((string)$m['ad']);
            $k = $this->katla((string)($m['kurum'] ?? ''));
            if (str_contains($a, $q) || ($k !== '' && str_contains($k, $q)) || str_contains(trim($a . ' ' . $k), $q)) {
                $l[] = ['m' => $m, 'tam' => norm((string)$m['ad']) === $tamQ || norm($this->musteriAdi($m)) === $tamQ];
            }
        }
        usort($l, fn ($x, $y) => [$y['tam'], empty($x['m']['arsiv']) ? 0 : 1, $this->katla((string)$x['m']['ad'])]
            <=> [$x['tam'], empty($y['m']['arsiv']) ? 0 : 1, $this->katla((string)$y['m']['ad'])]);
        $musteriler = array_map(fn ($x) => $this->musteriDisa($x['m']), array_slice($l, 0, 50));
        $n = count($l);
        if ($n === 0) $metin = 'Eşleşen müşteri yok. Tahmin etme: kullanıcıya hangi müşteri olduğunu sor (yeni müşteri yalnız kullanıcı isterse açılır).';
        elseif ($n === 1) $metin = '1 müşteri bulundu: ' . $this->musteriAdi($l[0]['m']) . (empty($l[0]['m']['arsiv']) ? '' : ' (arşivde: yeni kayıt açılmaz)') . '.';
        else $metin = $n . ' müşteri eşleşti: ' . implode(', ', array_map(fn ($x) => $this->musteriAdi($x['m']), array_slice($l, 0, 10)))
            . '. Hangisi olduğu belli değilse kullanıcıya sor; tahmin etme.';
        return McpSonuc::tamam(['musteriler' => $musteriler, 'toplam' => $n], $metin, [], 'Musteri arama: ' . $n . ' sonuc');
    }

    private function takvim(array $g): McpSonuc {
        $v = $this->oku();
        $mid = $g['musteri_id'] ?? null;
        if ($mid !== null && !isset($v['musteri'][$mid])) throw new McpAracHatasi("Müşteri bulunamadı ($mid). studio_musteri_ara ile doğru id'yi bul.");
        $bas = $g['baslangic_tarihi'];
        $bit = $g['bitis_tarihi'];
        $rBas = $bas . ' 00:00';
        $rBit = $this->gunEkle($bit, 1) . ' 00:00';
        $cak = $this->cakismaHaritasi($v);
        $icinde = function (array $x) use ($rBas, $rBit, $mid) {
            if (!empty($x['arsiv']) || empty($x['basTarih'])) return false;
            if ($mid !== null && ($x['musteriId'] ?? null) !== $mid) return false;
            [$a, $z] = $this->aralik($x);
            return $a < $rBit && $rBas < $z;
        };
        $sirala = function (array &$l) { usort($l, fn ($x, $y) => [$x['baslangic'], $x['id']] <=> [$y['baslangic'], $y['id']]); };
        $etkinlikler = [];
        foreach ($v['etkinlik'] as $e) if ($icinde($e)) $etkinlikler[] = $this->etkinlikDisa($e, $v, $cak);
        $sirala($etkinlikler);
        $bloklar = [];
        foreach ($v['blok'] as $k) if ($icinde($k)) $bloklar[] = $this->blokDisa($k, $v, $cak);
        $sirala($bloklar);
        $teslimler = [];
        $paylasimlar = [];
        foreach ($v['icerik'] as $i) {
            if (!empty($i['arsiv']) || ($mid !== null && $i['musteriId'] !== $mid)) continue;
            $t = $i['teslimTarihi'] ?? null;
            if (is_string($t) && $t >= $bas && $t <= $bit) {
                $teslimler[] = ['tarih' => $t, 'icerik_id' => $i['id'], 'baslik' => (string)$i['baslik'], 'musteri_id' => $i['musteriId'],
                    'musteri_adi' => $this->musteriAdi($v['musteri'][$i['musteriId']] ?? null), 'tur' => (string)$i['tur'], 'durum' => (string)$i['durum']];
            }
            $p = $i['planTarihi'] ?? null;
            if (is_string($p) && $p >= $bas && $p <= $bit) {
                $paylasimlar[] = ['tarih' => $p, 'musteri_id' => $i['musteriId'], 'musteri_adi' => $this->musteriAdi($v['musteri'][$i['musteriId']] ?? null),
                    'tur' => (string)$i['tur'], 'icerik_id' => $i['id'], 'baslik' => (string)$i['baslik']];
            }
        }
        usort($teslimler, fn ($x, $y) => [$x['tarih'], $x['baslik']] <=> [$y['tarih'], $y['baslik']]);
        usort($paylasimlar, fn ($x, $y) => [$x['tarih'], (string)$x['baslik']] <=> [$y['tarih'], (string)$y['baslik']]);
        [$ozel, $notlar] = $this->ozelGunler($v, $bas, $bit);
        $veri = ['etkinlikler' => $etkinlikler, 'bloklar' => $bloklar, 'teslimler' => $teslimler, 'paylasimlar' => $paylasimlar,
            'ozel_gunler' => $ozel, 'notlar' => $notlar];
        $metin = $bas . ' ' . $this->gunAdi($bas) . ' – ' . $bit . ' ' . $this->gunAdi($bit) . ': ' . count($etkinlikler) . ' çekim / etkinlik, '
            . count($bloklar) . ' edit bloğu, ' . count($teslimler) . ' teslim, ' . count($paylasimlar) . ' planlı paylaşım, ' . count($ozel) . ' tatil / özel gün.';
        return McpSonuc::tamam($veri, $metin, [], 'Takvim: ' . $bas . ' - ' . $bit);
    }

    private function icerikListele(array $g): McpSonuc {
        $v = $this->oku();
        $mid = $g['musteri_id'] ?? null;
        if ($mid !== null && !isset($v['musteri'][$mid])) throw new McpAracHatasi("Müşteri bulunamadı ($mid). studio_musteri_ara ile doğru id'yi bul.");
        $tb = $g['tarih_baslangic'] ?? null;
        $te = $g['tarih_bitis'] ?? null;
        $aralikta = fn (?string $t) => is_string($t) && ($tb === null || $t >= $tb) && ($te === null || $t <= $te);
        $l = [];
        foreach ($v['icerik'] as $i) {
            if (!empty($i['arsiv'])) continue;
            if ($mid !== null && $i['musteriId'] !== $mid) continue;
            if (isset($g['durum']) && $i['durum'] !== $g['durum']) continue;
            if (($tb !== null || $te !== null) && !$aralikta($i['teslimTarihi'] ?? null) && !$aralikta($i['planTarihi'] ?? null)) continue;
            $l[] = $i;
        }
        usort($l, fn ($x, $y) => [$x['teslimTarihi'] ?? $x['planTarihi'] ?? '9999', (string)$x['baslik'], $x['id']]
            <=> [$y['teslimTarihi'] ?? $y['planTarihi'] ?? '9999', (string)$y['baslik'], $y['id']]);
        $out = array_map(fn ($i) => $this->icerikDisa($i, $v), array_slice($l, 0, (int)$g['limit']));
        return McpSonuc::tamam(['icerikler' => $out, 'toplam' => count($l)], count($l) . ' içerik' . (count($l) > count($out) ? ' (ilk ' . count($out) . ' gösteriliyor)' : '') . '.', [], 'Icerik listesi: ' . count($l));
    }

    /* ---------------- Tekil yazma ---------------- */

    private function musteriOlustur(array $g, McpBaglam $b): McpSonuc {
        $id = $b->kayit_kimligi($g['istek_anahtari']);
        return $this->yazIslem(function (array $v, array &$var) use ($g, $id) {
            $t = $this->turu($v, $id);
            if ($t !== null) {
                $this->ayniTur($t, 'musteri');
                return McpSonuc::tamam(['durum' => 'zaten_vardi', 'musteri' => $this->musteriDisa($v['musteri'][$id]), 'uyari' => 'Bu istek daha önce işlendi; yeni kayıt açılmadı.'],
                    'Bu istek daha önce işlendi; müşteri zaten var: ' . $this->musteriAdi($v['musteri'][$id]) . '.', [], 'Tekrar: zaten vardi ' . $id);
            }
            $veri = ['ad' => $g['ad'], 'kurum' => $g['kurum'] ?? '', 'not' => $g['not'] ?? ''];
            $temiz = $this->dene(fn () => temizle('musteri', $veri, $var));
            foreach ($v['musteri'] as $m) {
                if (norm((string)$m['ad']) === norm($temiz['ad']) && norm((string)($m['kurum'] ?? '')) === norm($temiz['kurum'])) {
                    $u = 'Aynı ad ve kurumla müşteri zaten var' . (empty($m['arsiv']) ? '' : ' (arşivde)') . '; yeni kayıt açılmadı.';
                    return McpSonuc::tamam(['durum' => 'zaten_vardi', 'musteri' => $this->musteriDisa($m), 'uyari' => $u], $u, [], 'Ayni ad: ' . $m['id']);
                }
            }
            $k = $this->kaydet('musteri', $id, $veri, null, $var);
            return McpSonuc::tamam(['durum' => 'olusturuldu', 'musteri' => $this->musteriDisa($k), 'uyari' => null],
                'Müşteri oluşturuldu: ' . $this->musteriAdi($k) . '.', [$id], 'Musteri olusturuldu');
        });
    }

    private function cekimOlustur(array $g, McpBaglam $b): McpSonuc {
        $id = $b->kayit_kimligi($g['istek_anahtari']);
        return $this->yazIslem(function (array $v, array &$var) use ($g, $id) {
            $t = $this->turu($v, $id);
            if ($t !== null) {
                $this->ayniTur($t, 'etkinlik');
                $e = $this->etkinlikDisa($v['etkinlik'][$id], $v, $this->cakismaHaritasi($v));
                return McpSonuc::tamam(['durum' => 'zaten_vardi', 'etkinlik' => $e, 'cakisanlar' => [], 'mesaj' => 'Bu istek daha önce işlendi; yeni kayıt açılmadı.'],
                    'Bu istek daha önce işlendi; kayıt zaten var: ' . $this->zamanMetni($e) . '.', [], 'Tekrar: zaten vardi ' . $id);
            }
            $mid = $this->musteriCoz($g, $v, true);
            $z = $this->adayZaman($g, true);
            $veri = ['musteriId' => $mid, 'baslik' => $g['baslik'], 'tur' => $g['tur'], 'konum' => $g['konum'] ?? '', 'not' => $g['not'] ?? '', 'durum' => 'planlandi'] + $z;
            $temiz = $this->dene(fn () => temizle('etkinlik', $veri, $var));
            if ($e = $this->ayniEtkinlik($v, $temiz)) {
                $m = 'Aynı müşteri, başlangıç ve başlıkla bir kayıt zaten var; yeni kayıt açılmadı.';
                return McpSonuc::tamam(['durum' => 'zaten_vardi', 'etkinlik' => $this->etkinlikDisa($e, $v, $this->cakismaHaritasi($v)), 'cakisanlar' => [], 'mesaj' => $m],
                    $m, [], 'Anlamsal mukerrer: ' . $e['id']);
            }
            $c = $this->zamanCakisanlari($v, $temiz);
            $cd = array_map(fn ($o) => $this->cakisanDisa($o, $v), $c);
            if ($c && ($g['cakismayi_onayla'] ?? false) !== true) {
                $m = 'KAYDEDİLMEDİ: ' . $this->zamanMetni($this->zamanAlanlari($temiz)) . ' takvimde dolu: ' . $this->cakisanMetni($cd)
                    . '. Kullanıcıya sor; kabul ederse aynı istek_anahtari ve cakismayi_onayla: true ile yeniden çağır.';
                return McpSonuc::tamam(['durum' => 'cakisma', 'etkinlik' => null, 'cakisanlar' => $cd, 'mesaj' => $m], $m, [], 'Cakisma: kaydedilmedi (' . count($c) . ')');
            }
            $k = $this->kaydet('etkinlik', $id, $veri, null, $var);
            $e = $this->etkinlikDisa($k, $v, [$id => array_map(fn ($x) => $x['id'], $cd)]);
            $m = 'Kaydedildi: ' . ($e['musteri_adi'] !== null ? $e['musteri_adi'] . ' · ' : '') . $k['baslik'] . ', ' . $this->zamanMetni($e) . ' (İstanbul).'
                . ($c ? ' Kullanıcının onayıyla çakışan kayıtlar var: ' . $this->cakisanMetni($cd) . '.' : '') . $this->gecmisUyarisi($z);
            return McpSonuc::tamam(['durum' => 'olusturuldu', 'etkinlik' => $e, 'cakisanlar' => $cd, 'mesaj' => $m], $m, [$id],
                'Cekim olusturuldu ' . $z['basTarih'] . ' ' . ($z['basSaat'] ?? 'tum gun') . ($c ? ' (cakisma onayli)' : ''));
        });
    }

    private function icerikOlustur(array $g, McpBaglam $b): McpSonuc {
        if ($g['adet'] > 1) {
            $v = $this->oku();
            $mid = $this->musteriCoz($g, $v, false);
            $islemler = [];
            for ($i = 1; $i <= $g['adet']; $i++) {
                $op = ['islem' => 'icerik_olustur', 'musteri_id' => $mid, 'baslik' => mb_substr($g['baslik'], 0, 190) . " ($i/{$g['adet']})", 'tur' => $g['tur']];
                foreach (['teslim_tarihi', 'plan_tarihi', 'durum', 'cekim_id', 'not'] as $k) if (isset($g[$k])) $op[$k] = $g[$k];
                $islemler[] = $op;
            }
            $o = $b->toplu_onizle($islemler);
            if (!$o['gecerli']) {
                $h = array_values(array_filter(array_map(fn ($s) => $s['mesaj'] ?? null, $o['satirlar'])));
                throw new McpAracHatasi('Hiçbir şey kaydedilmedi; önizleme geçersiz: ' . ($h[0] ?? 'girdi geçersiz') . '.');
            }
            $m = 'KAYDEDİLMEDİ: ' . $g['adet'] . ' içerik için önizleme hazır (' . $this->musteriAdi($v['musteri'][$mid])
                . (isset($g['teslim_tarihi']) ? ', teslim ' . $g['teslim_tarihi'] . ' ' . $this->gunAdi($g['teslim_tarihi']) : '') . '). Önizlemeyi kullanıcıya göster; '
                . 'açıkça onaylarsa studio_toplu_uygula ile onay_kodu gönder (geçerlilik: ' . $o['son_gecerlilik'] . ').';
            return McpSonuc::tamam(['durum' => 'onay_gerekli', 'icerik' => null, 'onizleme' => $o, 'onay_kodu' => $o['onay_kodu'], 'son_gecerlilik' => $o['son_gecerlilik']],
                $m, [], 'Icerik onizleme: ' . $g['adet'] . ' adet');
        }
        $id = $b->kayit_kimligi($g['istek_anahtari']);
        return $this->yazIslem(function (array $v, array &$var) use ($g, $id, $b) {
            $bos = ['onizleme' => null, 'onay_kodu' => null, 'son_gecerlilik' => null];
            $t = $this->turu($v, $id);
            if ($t !== null) {
                $this->ayniTur($t, 'icerik');
                return McpSonuc::tamam(['durum' => 'zaten_vardi', 'icerik' => $this->icerikDisa($v['icerik'][$id], $v)] + $bos,
                    'Bu istek daha önce işlendi; içerik zaten var: ' . $v['icerik'][$id]['baslik'] . '.', [], 'Tekrar: zaten vardi ' . $id);
            }
            $mid = $this->musteriCoz($g, $v, false);
            $veri = $this->icerikVerisi($g, $mid, $v, $b);
            $temiz = $this->dene(fn () => temizle('icerik', $veri, $var));
            if ($i = $this->ayniIcerik($v, $temiz)) {
                $m = 'Aynı müşteri, başlık, tür ve tarihlerle bir içerik zaten var; yeni kayıt açılmadı.';
                return McpSonuc::tamam(['durum' => 'zaten_vardi', 'icerik' => $this->icerikDisa($i, $v)] + $bos, $m, [], 'Anlamsal mukerrer: ' . $i['id']);
            }
            $k = $this->kaydet('icerik', $id, $veri, null, $var);
            $m = 'İçerik kaydedildi: ' . $this->musteriAdi($v['musteri'][$mid]) . ' · ' . $k['baslik'] . ' (' . self::TUR_AD[$k['tur']] . ', ' . self::DURUM_AD[$k['durum']] . ')'
                . ($k['teslimTarihi'] ? ', teslim ' . $k['teslimTarihi'] . ' ' . $this->gunAdi($k['teslimTarihi']) : '')
                . ($k['planTarihi'] ? ', paylaşım ' . $k['planTarihi'] . ' ' . $this->gunAdi($k['planTarihi']) : '') . '.';
            return McpSonuc::tamam(['durum' => 'olusturuldu', 'icerik' => $this->icerikDisa($k, $v)] + $bos, $m, [$id], 'Icerik olusturuldu');
        });
    }

    private function editZamaniAyir(array $g, McpBaglam $b): McpSonuc {
        $id = $b->kayit_kimligi($g['istek_anahtari']);
        return $this->yazIslem(function (array $v, array &$var) use ($g, $id) {
            $t = $this->turu($v, $id);
            if ($t !== null) {
                $this->ayniTur($t, 'blok');
                $k = $this->blokDisa($v['blok'][$id], $v, $this->cakismaHaritasi($v));
                return McpSonuc::tamam(['durum' => 'zaten_vardi', 'blok' => $k, 'cakisanlar' => [], 'mesaj' => 'Bu istek daha önce işlendi; yeni kayıt açılmadı.'],
                    'Bu istek daha önce işlendi; edit bloğu zaten var: ' . $this->zamanMetni($k) . '.', [], 'Tekrar: zaten vardi ' . $id);
            }
            $mid = $this->musteriCoz($g, $v, false);
            $gorulen = [];
            foreach ($g['icerik_idler'] as $iid) {
                $i = $v['icerik'][$iid] ?? null;
                if (!$i) throw new McpAracHatasi("Hiçbir şey kaydedilmedi: içerik bulunamadı ($iid). studio_icerik_listele ile doğru id'yi bul.");
                if ($i['musteriId'] !== $mid) {
                    throw new McpAracHatasi('Hiçbir şey kaydedilmedi: “' . $i['baslik'] . '” (' . $iid . ') başka bir müşterinin içeriği (' . $this->musteriAdi($v['musteri'][$i['musteriId']] ?? null)
                        . '); bir edit bloğunda yalnız ' . $this->musteriAdi($v['musteri'][$mid]) . ' içerikleri olabilir.');
                }
                if (!empty($i['arsiv'])) throw new McpAracHatasi('Hiçbir şey kaydedilmedi: “' . $i['baslik'] . '” arşivde.');
                if (isset($gorulen[$iid])) throw new McpAracHatasi("Hiçbir şey kaydedilmedi: içerik listede iki kez geçiyor ($iid).");
                $gorulen[$iid] = true;
            }
            $z = $this->adayZaman($g, false);
            unset($z['tumGun']);
            $veri = ['musteriId' => $mid, 'icerikIdler' => array_values($g['icerik_idler']), 'baslik' => $g['baslik'] ?? '', 'durum' => 'planlandi', 'not' => $g['not'] ?? ''] + $z;
            $temiz = $this->dene(fn () => temizle('blok', $veri, $var));
            $dg = dogal('blok', $temiz);
            foreach ($v['blok'] as $k) {
                if (empty($k['arsiv']) && dogal('blok', $k) === $dg) {
                    $m = 'Aynı müşteri, başlangıç ve içeriklerle bir edit bloğu zaten var; yeni kayıt açılmadı.';
                    return McpSonuc::tamam(['durum' => 'zaten_vardi', 'blok' => $this->blokDisa($k, $v, $this->cakismaHaritasi($v)), 'cakisanlar' => [], 'mesaj' => $m], $m, [], 'Anlamsal mukerrer: ' . $k['id']);
                }
            }
            $c = $this->zamanCakisanlari($v, $temiz);
            $cd = array_map(fn ($o) => $this->cakisanDisa($o, $v), $c);
            if ($c && ($g['cakismayi_onayla'] ?? false) !== true) {
                $m = 'KAYDEDİLMEDİ: ' . $this->zamanMetni($this->zamanAlanlari($temiz)) . ' takvimde dolu: ' . $this->cakisanMetni($cd)
                    . '. Kullanıcıya sor; kabul ederse aynı istek_anahtari ve cakismayi_onayla: true ile yeniden çağır.';
                return McpSonuc::tamam(['durum' => 'cakisma', 'blok' => null, 'cakisanlar' => $cd, 'mesaj' => $m], $m, [], 'Cakisma: kaydedilmedi (' . count($c) . ')');
            }
            $k = $this->kaydet('blok', $id, $veri, null, $var);
            $d = $this->blokDisa($k, $v, [$id => array_map(fn ($x) => $x['id'], $cd)]);
            $m = 'Edit zamanı ayrıldı: ' . $this->musteriAdi($v['musteri'][$mid]) . ', ' . count($k['icerikIdler']) . ' içerik, ' . $this->zamanMetni($d) . ' (İstanbul).'
                . ($c ? ' Kullanıcının onayıyla çakışan kayıtlar var: ' . $this->cakisanMetni($cd) . '.' : '') . $this->gecmisUyarisi($z);
            return McpSonuc::tamam(['durum' => 'olusturuldu', 'blok' => $d, 'cakisanlar' => $cd, 'mesaj' => $m], $m, [$id],
                'Edit blogu olusturuldu ' . $z['basTarih'] . ' ' . $z['basSaat'] . ($c ? ' (cakisma onayli)' : ''));
        });
    }

    /** icerik / etkinlik durum guncellemesi (beklenen_surum ile; uyusmazlikta hicbir sey yazilmaz). */
    private function durumGuncelle(string $tur, string $id, array $g, McpBaglam $b): McpSonuc {
        $anahtar = $tur === 'icerik' ? 'icerik' : 'etkinlik';
        $adi = $tur === 'icerik' ? 'İçerik' : 'Çekim / etkinlik';
        return $this->yazIslem(function (array $v, array &$var) use ($tur, $id, $g, $b, $anahtar, $adi) {
            $r = $v[$tur][$id] ?? null;
            if (!$r) throw new McpAracHatasi("$adi bulunamadı ($id). " . ($tur === 'icerik' ? 'studio_icerik_listele' : 'studio_takvim') . " ile doğru id'yi bul.");
            if (!empty($r['arsiv'])) throw new McpAracHatasi("$adi arşivde; sohbetten değiştirilmez.");
            $disa = fn (array $x) => $tur === 'icerik' ? $this->icerikDisa($x, $v) : $this->etkinlikDisa($x, $v, $this->cakismaHaritasi($v));
            if ((int)$r['surum'] !== $g['beklenen_surum']) return $this->surumHatasi($adi, $anahtar, $g['beklenen_surum'], $r, $disa);
            $adlar = $tur === 'icerik' ? self::DURUM_AD : self::ETKINLIK_DURUM_AD;
            if ($r['durum'] === $g['yeni_durum']) {
                return McpSonuc::tamam(['durum' => 'degisiklik_yok', $anahtar => $disa($r)], "$adi zaten “" . $adlar[$r['durum']] . '” durumunda; değişiklik yapılmadı.', [], 'Degisiklik yok');
            }
            $n = $this->durumVerisi($tur, $r, $g['yeni_durum'], $g['not'] ?? null, $b);
            try {
                $k = $this->kaydet($tur, $id, $n, (int)$r['surum'], $var);
            } catch (RuntimeException $e) {
                if (yazma_hatasi_kodu($e) !== 'cakisma') throw $e;
                $guncel = kayit_oku($tur, $id) ?? $r;
                return $this->surumHatasi($adi, $anahtar, $g['beklenen_surum'], $guncel, $disa);
            }
            $m = "$adi güncellendi: “" . $k['baslik'] . '”: ' . $adlar[$r['durum']] . ' → ' . $adlar[$k['durum']] . ' (yeni sürüm ' . $k['surum'] . ').';
            return McpSonuc::tamam(['durum' => 'guncellendi', $anahtar => $disa($k)], $m, [$id], 'Durum: ' . $r['durum'] . ' -> ' . $k['durum']);
        });
    }
    private function surumHatasi(string $adi, string $anahtar, int $beklenen, array $guncel, callable $disa): McpSonuc {
        $adlar = $anahtar === 'icerik' ? self::DURUM_AD : self::ETKINLIK_DURUM_AD;
        return McpSonuc::hata("409 Sürüm uyuşmazlığı: $adi bu arada değişmiş (beklenen sürüm $beklenen, güncel sürüm " . (int)$guncel['surum']
            . ', şu anki durum: ' . ($adlar[$guncel['durum']] ?? $guncel['durum']) . '). Hiçbir şey yazılmadı. Güncel hali kullanıcıya göster ve sor; '
            . 'yine isterse beklenen_surum: ' . (int)$guncel['surum'] . ' ile yeniden çağır.', ['durum' => 'surum_uyusmadi', $anahtar => $disa($guncel)]);
    }

    /* ================= Toplu ================= */

    public function toplu_dogrula(array $islemler, McpBaglam $b): array {
        return $this->koru(function () use ($islemler, $b) {
            $v = $this->oku();
            $var = tur_haritasi(tum_kayitlar());
            $sanal = ['ogeler' => [], 'guncellenen' => []];
            $satirlar = [];
            foreach (array_values($islemler) as $i => $op) $satirlar[] = $this->opDogrula($op, $i, $v, $var, $sanal, $b)['satir'];
            $hata = (bool)array_filter($satirlar, fn ($s) => $s['durum'] === 'hata');
            $uyarilar = $hata ? ['Hatalı satırlar var; hiçbir şey yazılmadı ve onay kodu verilmedi. Hataları düzeltip yeniden önizle.']
                : ['Onaylanırsa uygulamadan önce Studio\'nun otomatik kopyası alınır (Ayarlar → Otomatik kopyalar: “Sohbet toplu işlemi öncesi”).'];
            return ['gecerli' => !$hata, 'satirlar' => $satirlar, 'uyarilar' => $uyarilar];
        });
    }

    public function toplu_uygula(array $islemler, string $toplu_anahtar, McpBaglam $b): array {
        try {
            return $this->koru(fn () => islem(function () use ($islemler, $b) {
                $v = $this->oku();
                $var = tur_haritasi(tum_kayitlar());
                $sanal = ['ogeler' => [], 'guncellenen' => []];
                $hazir = [];
                foreach (array_values($islemler) as $i => $op) {
                    $d = $this->opDogrula($op, $i, $v, $var, $sanal, $b);
                    if ($d['satir']['durum'] === 'hata') {
                        throw new McpAracHatasi(($i + 1) . '. işlem (' . $d['satir']['ozet'] . '): ' . $d['satir']['mesaj']
                            . ' Veri önizlemeden sonra değişmiş olabilir; studio_toplu_onizle ile yeniden önizle.');
                    }
                    $hazir[] = $d;
                }
                gunluk_anlik();
                $anlik = anlik_al('mcp_toplu_oncesi');
                $sayac = [];
                $kayitlar = [];
                $etkilenen = [];
                $say = ['olusturulan' => 0, 'guncellenen' => 0, 'zaten_vardi' => 0];
                foreach ($hazir as $i => $d) {
                    if (isset($d['zaten'])) {
                        // ayni icerik / etkinlik zaten var (tekil araclarla ayni anlamsal mukerrer kurali): yeni kayit acilmaz
                        $say['zaten_vardi']++;
                        $kayitlar[] = ['sira' => $i, 'islem' => $d['op']['islem'], 'id' => $d['zaten'], 'durum' => 'zaten_vardi'];
                        continue;
                    }
                    if ($d['yeni']) {
                        // Kimlik: grant + islemin kanonik icerigi + ayni islemin kacinci tekrari. Ayni liste baska bir onay koduyla
                        // yeniden onaylansa ya da yarida kesilen uygulama yeniden denense de ikinci kayit acilmaz.
                        $oz = mcp_kanonik_json($d['op']);
                        $sayac[$oz] = ($sayac[$oz] ?? 0) + 1;
                        $id = substr(hash('sha256', 'mcp|' . $b->izin_id . '|toplu|' . $oz . '|' . $sayac[$oz]), 0, 24);
                        $varolan = tek('SELECT tur FROM kayitlar WHERE id = ?', [$id]);
                        if ($varolan) {
                            if ((string)$varolan['tur'] !== $d['tur']) throw new RuntimeException('toplu kimlik cakismasi');
                            $say['zaten_vardi']++;
                            $kayitlar[] = ['sira' => $i, 'islem' => $d['op']['islem'], 'id' => $id, 'durum' => 'zaten_vardi'];
                            continue;
                        }
                        $this->kaydet($d['tur'], $id, $d['veri'], null, $var);
                        $say['olusturulan']++;
                    } else {
                        $id = $d['id'];
                        try {
                            $this->kaydet($d['tur'], $id, $d['veri'], $d['surum'], $var);
                        } catch (RuntimeException $e) {
                            if (yazma_hatasi_kodu($e) === 'cakisma') throw new McpAracHatasi(($i + 1) . '. işlem: kayıt bu arada değişmiş (sürüm uyuşmazlığı).');
                            throw $e;
                        }
                        $say['guncellenen']++;
                    }
                    $etkilenen[] = $id;
                    $kayitlar[] = ['sira' => $i, 'islem' => $d['op']['islem'], 'id' => $id, 'durum' => $d['yeni'] ? 'olusturuldu' : 'guncellendi'];
                }
                $mesaj = count($hazir) . ' işlem uygulandı: ' . $say['olusturulan'] . ' oluşturuldu, ' . $say['guncellenen'] . ' güncellendi'
                    . ($say['zaten_vardi'] ? ', ' . $say['zaten_vardi'] . ' zaten vardı (yeniden açılmadı)' : '')
                    . '. Önceki hal otomatik kopyada (Ayarlar → Otomatik kopyalar: “Sohbet toplu işlemi öncesi”).';
                return ['tamam' => true, 'mesaj' => $mesaj, 'veri' => $say + ['kayitlar' => $kayitlar], 'etkilenen' => $etkilenen, 'anlik_id' => $anlik];
            }));
        } catch (McpAracHatasi $e) {
            return ['tamam' => false, 'mesaj' => 'Uygulanmadı, hiçbir şey yazılmadı: ' . $e->getMessage(), 'veri' => [], 'etkilenen' => [], 'anlik_id' => null];
        }
    }

    /**
     * Tek toplu islemi dogrular (yazmaz). $sanal: bu listede daha once gecen islemler (aralarindaki cakisma ve ayni kaydin iki kez
     * guncellenmesi icin). Doner: ['satir' => onizleme satiri, 'op', 'yeni' => olusturma mi, 'tur', 'veri' (yazilacak), 'id', 'surum',
     * 'zaten' => anlamsal mukerrerde var olan kaydin kimligi (uygulamada atlanir)].
     */
    private function opDogrula(array $op, int $sira, array $v, array &$var, array &$sanal, McpBaglam $b): array {
        $sonuc = ['op' => $op, 'yeni' => false, 'tur' => '', 'veri' => [], 'id' => null, 'surum' => null];
        $satir = function (string $durum, string $ozet, ?string $mesaj) use ($sira, $op) {
            return ['sira' => $sira, 'islem' => $op['islem'], 'ozet' => $ozet, 'durum' => $durum, 'mesaj' => $mesaj];
        };
        try {
            switch ($op['islem']) {
                case 'icerik_olustur': {
                    $mid = $this->musteriCoz(['musteri_id' => $op['musteri_id']], $v, false);
                    $veri = $this->icerikVerisi($op, $mid, $v, $b);
                    $temiz = $this->dene(fn () => temizle('icerik', $veri, $var));
                    $ozet = 'İçerik: “' . $temiz['baslik'] . '” · ' . self::TUR_AD[$temiz['tur']] . ' · ' . $this->musteriAdi($v['musteri'][$mid])
                        . ($temiz['teslimTarihi'] ? ' · teslim ' . $temiz['teslimTarihi'] . ' ' . $this->gunAdi($temiz['teslimTarihi']) : '')
                        . ($temiz['planTarihi'] ? ' · paylaşım ' . $temiz['planTarihi'] . ' ' . $this->gunAdi($temiz['planTarihi']) : '');
                    $s = ['yeni' => true, 'tur' => 'icerik', 'veri' => $veri] + $sonuc;
                    if ($i = $this->ayniIcerik($v, $temiz)) return ['satir' => $satir('uyari', $ozet, 'Aynı içerik zaten var (' . $i['id'] . '); uygulanınca yeni kayıt açılmaz.'), 'zaten' => $i['id']] + $s;
                    return ['satir' => $satir('gecerli', $ozet, null)] + $s;
                }
                case 'cekim_olustur': {
                    $mid = $this->musteriCoz(['musteri_id' => $op['musteri_id']], $v, true);
                    $z = $this->adayZaman($op, true);
                    $veri = ['musteriId' => $mid, 'baslik' => $op['baslik'], 'tur' => $op['tur'], 'konum' => $op['konum'] ?? '', 'not' => $op['not'] ?? '', 'durum' => 'planlandi'] + $z;
                    $temiz = $this->dene(fn () => temizle('etkinlik', $veri, $var));
                    $ozet = self::ETKINLIK_TUR_AD[$temiz['tur']] . ': “' . $temiz['baslik'] . '”' . ($mid ? ' · ' . $this->musteriAdi($v['musteri'][$mid]) : '')
                        . ' · ' . $this->zamanMetni($this->zamanAlanlari($temiz));
                    $s = ['yeni' => true, 'tur' => 'etkinlik', 'veri' => $veri] + $sonuc;
                    if ($e = $this->ayniEtkinlik($v, $temiz)) return ['satir' => $satir('uyari', $ozet, 'Aynı kayıt zaten var (' . $e['id'] . '); uygulanınca yeni kayıt açılmaz.'), 'zaten' => $e['id']] + $s;
                    $c = array_map(fn ($o) => $this->cakisanDisa($o, $v), $this->zamanCakisanlari($v, $temiz, $sanal['ogeler']));
                    $sanal['ogeler'][] = ['tur' => 'etkinlik', 'k' => $temiz + ['id' => 'toplu-' . $sira], 'r' => $this->aralik($temiz)];
                    if ($c && ($op['cakismayi_onayla'] ?? false) !== true) return ['satir' => $satir('hata', $ozet, 'Çakışma: ' . $this->cakisanMetni($c) . '. Kullanıcı kabul ederse bu işleme cakismayi_onayla: true ekleyip yeniden önizle.')] + $s;
                    return ['satir' => $satir($c ? 'uyari' : 'gecerli', $ozet, $c ? 'Kullanıcının onayıyla çakışıyor: ' . $this->cakisanMetni($c) . '.' : null)] + $s;
                }
                case 'icerik_durum':
                case 'cekim_durum': {
                    $tur = $op['islem'] === 'icerik_durum' ? 'icerik' : 'etkinlik';
                    $id = $op[$tur === 'icerik' ? 'icerik_id' : 'cekim_id'];
                    $r = $v[$tur][$id] ?? null;
                    if (!$r) throw new McpAracHatasi(($tur === 'icerik' ? 'İçerik' : 'Çekim / etkinlik') . " bulunamadı ($id).");
                    $adlar = $tur === 'icerik' ? self::DURUM_AD : self::ETKINLIK_DURUM_AD;
                    $ozet = 'Durum: “' . $r['baslik'] . '”: ' . ($adlar[$r['durum']] ?? $r['durum']) . ' → ' . $adlar[$op['yeni_durum']];
                    if (!empty($r['arsiv'])) throw new McpAracHatasi('Kayıt arşivde; sohbetten değiştirilmez.');
                    if ((int)$r['surum'] !== $op['beklenen_surum']) throw new McpAracHatasi('Sürüm uyuşmuyor (beklenen ' . $op['beklenen_surum'] . ', güncel ' . (int)$r['surum'] . '): kayıt değişmiş. Güncel hali okuyup yeniden önizle.');
                    if (isset($sanal['guncellenen'][$id])) throw new McpAracHatasi('Aynı kayıt bu listede birden çok kez güncelleniyor.');
                    $sanal['guncellenen'][$id] = true;
                    $s = ['tur' => $tur, 'id' => $id, 'surum' => (int)$r['surum'], 'veri' => $this->durumVerisi($tur, $r, $op['yeni_durum'], $op['not'] ?? null, $b)] + $sonuc;
                    if ($r['durum'] === $op['yeni_durum']) return ['satir' => $satir('uyari', $ozet, 'Zaten bu durumda; yalnız geçmişe not düşülür.')] + $s;
                    return ['satir' => $satir('gecerli', $ozet, null)] + $s;
                }
            }
            throw new McpAracHatasi('Bilinmeyen işlem.');
        } catch (McpAracHatasi $e) {
            return ['satir' => $satir('hata', $this->opOzeti($op), $e->getMessage())] + $sonuc;
        }
    }
    private function opOzeti(array $op): string {
        return match ($op['islem']) {
            'icerik_olustur' => 'İçerik: “' . ($op['baslik'] ?? '') . '”',
            'cekim_olustur' => 'Çekim: “' . ($op['baslik'] ?? '') . '” ' . ($op['tarih'] ?? ''),
            'icerik_durum' => 'İçerik durumu: ' . ($op['icerik_id'] ?? ''),
            'cekim_durum' => 'Çekim durumu: ' . ($op['cekim_id'] ?? ''),
            default => (string)$op['islem'],
        };
    }

    /* ================= Yardimcilar ================= */

    /** Kitaplik hatalarini MCP hatalarina cevirir: mesgul / kilit -> McpMesgulHatasi (yeniden dene), kurulum -> McpKurulumHatasi. */
    private function koru(callable $f) {
        try {
            return $f();
        } catch (StudioHatasi $e) {
            if ($e->kod === 'mesgul' || $e->kod === 'kilit') throw new McpMesgulHatasi($e->getMessage());
            throw new McpKurulumHatasi('Studio: ' . $e->getMessage());
        } catch (PDOException $e) {
            if (mesgul_mu($e)) throw new McpMesgulHatasi('Studio veritabanı meşgul.');
            throw $e;
        }
    }
    /** Yazma islemi: panelle ayni islem() (SQLite BEGIN IMMEDIATE / MySQL FOR UPDATE); okuma ve denetim kilit altinda. */
    private function yazIslem(callable $f) {
        return islem(function () use ($f) {
            $v = $this->oku();
            $var = tur_haritasi(tum_kayitlar());
            return $f($v, $var);
        });
    }
    /** Panelin "kaydet" yolu (islem icinde): gunun ilk yazmasiysa gunluk kopya, sonra kayit_yaz. Dogrulama hatasi -> is hatasi. */
    private function kaydet(string $tur, string $id, array $veri, ?int $surum, array &$var): array {
        gunluk_anlik();
        try {
            return kayit_yaz($tur, $id, $veri, $surum, $var);
        } catch (Throwable $e) {
            $k = yazma_hatasi_kodu($e);
            if ($k === 'cakisma') throw $e;
            if ($k === 'gecersiz') throw new McpAracHatasi('Hiçbir şey kaydedilmedi: ' . $e->getMessage() . '.');
            if ($k === 'ayni_ad') throw new McpAracHatasi('Hiçbir şey kaydedilmedi: aynı ad ve kurumla bir müşteri zaten var.');
            if ($k === 'yok') throw new McpAracHatasi('Hiçbir şey kaydedilmedi: kayıt bulunamadı.');
            if ($k === 'mesgul') throw new McpMesgulHatasi('Studio veritabanı meşgul.');
            throw $e;
        }
    }
    /** Panelin dogrulamasi (temizle) hata verirse is hatasi; hicbir sey yazilmaz. */
    private function dene(callable $f) {
        try {
            return $f();
        } catch (InvalidArgumentException $e) {
            throw new McpAracHatasi('Hiçbir şey kaydedilmedi: ' . $e->getMessage() . '.');
        }
    }
    /** Anlamsal mukerrer (tekil ve toplu ayni kural): ayni musteri + baslik + tur + plan / teslim tarihi, arsivde olmayan icerik. */
    private function ayniIcerik(array $v, array $temiz): ?array {
        foreach ($v['icerik'] as $i) {
            if (empty($i['arsiv']) && $i['musteriId'] === $temiz['musteriId'] && norm((string)$i['baslik']) === norm($temiz['baslik']) && $i['tur'] === $temiz['tur']
                && ($i['planTarihi'] ?? null) === $temiz['planTarihi'] && ($i['teslimTarihi'] ?? null) === $temiz['teslimTarihi']) return $i;
        }
        return null;
    }
    /** Anlamsal mukerrer etkinlik: panelin dogal anahtari (musteri + baslik + baslangic), arsiv ve iptal haric. */
    private function ayniEtkinlik(array $v, array $temiz): ?array {
        $dg = dogal('etkinlik', $temiz);
        foreach ($v['etkinlik'] as $e) if (empty($e['arsiv']) && ($e['durum'] ?? '') !== 'iptal' && dogal('etkinlik', $e) === $dg) return $e;
        return null;
    }
    private function ayniTur(string $t, string $beklenen): void {
        if ($t !== $beklenen) throw new McpAracHatasi('Bu istek_anahtari başka türde bir kayıt için kullanılmış; hiçbir şey yapılmadı. Yeni istek için yeni bir istek_anahtari ver.');
    }

    /** Butun kayitlar (arsiv dahil), tur basina id => kayit (panelin disa bicimi). */
    private function oku(): array {
        $p = veri_paketi();
        $h = fn (array $l) => array_column($l, null, 'id');
        return ['musteri' => $h($p['musteriler']), 'icerik' => $h($p['icerikler']), 'etkinlik' => $h($p['etkinlikler']),
            'blok' => $h($p['bloklar']), 'ozelgun' => $p['ozelgunler'], 'ayar' => $p['ayar']];
    }
    private function turu(array $v, string $id): ?string {
        foreach (['musteri', 'icerik', 'etkinlik', 'blok'] as $t) if (isset($v[$t][$id])) return $t;
        $r = tek('SELECT tur FROM kayitlar WHERE id = ?', [$id]);
        return $r ? (string)$r['tur'] : null;
    }

    /**
     * Musteri: musteri_id (var olmali, arsivde olmamali; $bosOlur ise null = musterisiz) ya da musteri_adi (TAM ad ya da
     * "ad · kurum", Turkce harf duyarsiz). Hic / birden cok eslesme: is hatasi + adaylar, tahmin yok.
     */
    private function musteriCoz(array $g, array $v, bool $bosOlur): ?string {
        if (array_key_exists('musteri_adi', $g)) {
            $q = norm($g['musteri_adi']);
            $es = array_values(array_filter($v['musteri'], fn ($m) => norm((string)$m['ad']) === $q || norm($this->musteriAdi($m)) === $q));
            $aktif = array_values(array_filter($es, fn ($m) => empty($m['arsiv'])));
            $ad = '“' . mcp_kisalt($g['musteri_adi'], 120) . '”';
            if (count($aktif) === 1) return $aktif[0]['id'];
            if (count($aktif) > 1) {
                throw new McpAracHatasi("Hiçbir şey kaydedilmedi: $ad adıyla " . count($aktif) . ' müşteri var: ' . $this->adaylar($aktif)
                    . '. Hangisi olduğunu kullanıcıya sor; sonra musteri_id ile yeniden çağır.');
            }
            if ($es) throw new McpAracHatasi("Hiçbir şey kaydedilmedi: $ad arşivde (" . $this->adaylar($es) . '). Arşivdeki müşteriye sohbetten kayıt açılmaz.');
            $qk = $this->katla($g['musteri_adi']);
            $kelimeler = array_filter(explode(' ', $qk), fn ($k) => mb_strlen($k) >= 3);
            $benzer = array_values(array_filter($v['musteri'], function ($m) use ($qk, $kelimeler) {
                if (!empty($m['arsiv'])) return false;
                $a = $this->katla($this->musteriAdi($m));
                if ($qk !== '' && (str_contains($a, $qk) || str_contains($qk, $this->katla((string)$m['ad'])))) return true;
                foreach ($kelimeler as $k) if (str_contains($a, $k)) return true;
                return false;
            }));
            throw new McpAracHatasi("Hiçbir şey kaydedilmedi: $ad adında müşteri yok." . ($benzer
                ? ' Benzer adlar: ' . $this->adaylar(array_slice($benzer, 0, 5)) . '. Hangisi olduğunu kullanıcıya sor (tahmin etme); sonra musteri_id ile yeniden çağır.'
                : ' Kullanıcıya sor; yeni müşteri yalnız kullanıcı açıkça isterse studio_musteri_olustur ile açılır.'));
        }
        $id = $g['musteri_id'] ?? null;
        if ($id === null) {
            if ($bosOlur) return null;
            throw new McpAracHatasi('Hiçbir şey kaydedilmedi: musteri_id ya da musteri_adi gerekli.');
        }
        $m = $v['musteri'][$id] ?? null;
        if (!$m) throw new McpAracHatasi("Hiçbir şey kaydedilmedi: müşteri bulunamadı ($id). studio_musteri_ara ile doğru id'yi bul; tahmin etme.");
        if (!empty($m['arsiv'])) throw new McpAracHatasi('Hiçbir şey kaydedilmedi: “' . $this->musteriAdi($m) . '” arşivde. Arşivdeki müşteriye sohbetten kayıt açılmaz.');
        return $id;
    }
    private function adaylar(array $l): string {
        return implode(', ', array_map(fn ($m) => '“' . $this->musteriAdi($m) . '” (id: ' . $m['id'] . ')', $l));
    }

    /** Yeni icerik verisi (panel alanlariyla); gecmise "Sohbetten eklendi (<istemci>)" satiri yazilir. */
    private function icerikVerisi(array $g, string $mid, array $v, McpBaglam $b): array {
        $cid = $g['cekim_id'] ?? null;
        if ($cid !== null) {
            $e = $v['etkinlik'][$cid] ?? null;
            if (!$e) throw new McpAracHatasi("Hiçbir şey kaydedilmedi: bağlı çekim bulunamadı ($cid). studio_takvim ile doğru id'yi bul.");
            if (!empty($e['arsiv'])) throw new McpAracHatasi('Hiçbir şey kaydedilmedi: bağlı çekim arşivde.');
        }
        $durum = $g['durum'] ?? 'fikir';
        return [
            'musteriId' => $mid, 'baslik' => $g['baslik'], 'tur' => $g['tur'], 'durum' => $durum, 'cekimId' => $cid,
            'teslimTarihi' => $g['teslim_tarihi'] ?? null, 'planTarihi' => $g['plan_tarihi'] ?? null,
            'yayinTarihi' => $durum === 'yayinlandi' ? istanbul_gunu() : null, 'not' => $g['not'] ?? '',
            'gecmis' => [['z' => $this->damga(), 'm' => 'Sohbetten eklendi (' . mcp_kisalt($b->istemci_adi, 120) . ')']],
        ];
    }
    /** Durum degisikligi verisi: arayuzdeki durumDegistir / etkinlikDurumu ile ayni (yayin tarihi, tamamlanma ani, gecmis satiri). */
    private function durumVerisi(string $tur, array $r, string $yeni, ?string $not, McpBaglam $b): array {
        $n = $r;
        unset($n['id'], $n['surum'], $n['olusturma'], $n['guncelleme']);
        $eski = (string)$r['durum'];
        $n['durum'] = $yeni;
        if ($tur === 'etkinlik') {
            $n['tamamZaman'] = $yeni === 'tamamlandi' ? ($eski === 'tamamlandi' ? ($r['tamamZaman'] ?? null) : $this->damga()) : null;
            return $n;
        }
        if ($yeni === 'yayinlandi' && empty($n['yayinTarihi'])) $n['yayinTarihi'] = istanbul_gunu();
        if ($eski === 'yayinlandi' && $yeni !== 'yayinlandi') $n['yayinTarihi'] = null;
        $z = $this->damga();
        $kaynak = 'Sohbetten değiştirildi (' . mcp_kisalt($b->istemci_adi, 120) . ')' . ($not !== null && trim($not) !== '' ? ': ' . $not : '');
        $gecmis = array_values((array)($r['gecmis'] ?? []));
        $gecmis[] = ['z' => $z, 'm' => mcp_kisalt($kaynak, 300)];
        // durum satiri en sonda ve arayuzle ayni bicimde ("… → Müşteri onayında": onay bekleme suresi bundan hesaplanir)
        if ($eski !== $yeni) $gecmis[] = ['z' => $z, 'm' => (self::DURUM_AD[$eski] ?? $eski) . ' → ' . self::DURUM_AD[$yeni]];
        $n['gecmis'] = array_slice($gecmis, -60);
        return $n;
    }

    /* ---------------- Zaman ve cakisma (studio-core.js ile ayni kurallar) ---------------- */

    /** Girdiden aday zaman alanlari (panel bicimi). sure_dakika gece yarisini asabilir (bitis ertesi gun). */
    private function adayZaman(array $g, bool $tumGunOlur): array {
        if ($tumGunOlur && ($g['tum_gun'] ?? false) === true) {
            return ['tumGun' => true, 'basTarih' => $g['tarih'], 'basSaat' => null, 'bitTarih' => $g['bitis_tarihi'] ?? $g['tarih'], 'bitSaat' => null];
        }
        $bas = $g['baslangic_saati'];
        if (isset($g['sure_dakika'])) {
            $d = (new DateTimeImmutable($g['tarih'] . ' ' . $bas . ':00', new DateTimeZone('UTC')))->modify('+' . (int)$g['sure_dakika'] . ' minutes');
            $bt = $d->format('Y-m-d');
            $bs = $d->format('H:i');
        } else {
            $bt = $g['bitis_tarihi'] ?? $g['tarih'];
            $bs = $g['bitis_saati'];
        }
        return ['tumGun' => false, 'basTarih' => $g['tarih'], 'basSaat' => $bas, 'bitTarih' => $bt, 'bitSaat' => $bs];
    }
    /** [baslangic, bitis) 'YYYY-AA-GG SS:DD'; tum gun: bitis gununun ertesi 00:00 (core aralik). */
    private function aralik(array $x): array {
        $bit = !empty($x['bitTarih']) ? $x['bitTarih'] : $x['basTarih'];
        if (!empty($x['tumGun'])) return [$x['basTarih'] . ' 00:00', $this->gunEkle($bit, 1) . ' 00:00'];
        return [$x['basTarih'] . ' ' . $x['basSaat'], $bit . ' ' . $x['bitSaat']];
    }
    /** Takvimde sayilan kayit (core takvimdeSayilir): arsiv, iptal ve tamamlanmis sayilmaz. */
    private function sayilir(array $x): bool {
        return empty($x['arsiv']) && ($x['durum'] ?? '') !== 'iptal' && ($x['durum'] ?? '') !== 'tamamlandi' && !empty($x['basTarih']);
    }
    private function ogeler(array $v): array {
        $l = [];
        foreach ($v['etkinlik'] as $e) if ($this->sayilir($e)) $l[] = ['tur' => 'etkinlik', 'k' => $e, 'r' => $this->aralik($e)];
        foreach ($v['blok'] as $k) if ($this->sayilir($k)) $l[] = ['tur' => 'blok', 'k' => $k, 'r' => $this->aralik($k)];
        return $l;
    }
    /** aday ile cakisan sayilan kayitlar (core zamanCakisanlari): aday kendi kimligiyle karsilasmaz; uc uca degmek cakisma degil. */
    private function zamanCakisanlari(array $v, array $aday, array $ek = []): array {
        $r = $this->aralik($aday);
        $id = $aday['id'] ?? null;
        return array_values(array_filter(array_merge($this->ogeler($v), $ek), fn ($o) => $o['k']['id'] !== $id && $o['r'][0] < $r[1] && $r[0] < $o['r'][1]));
    }
    /** id -> cakistigi kayit idleri (core takvimCakismalari). */
    private function cakismaHaritasi(array $v): array {
        $a = $this->ogeler($v);
        usort($a, fn ($x, $y) => strcmp($x['r'][0], $y['r'][0]));
        $m = [];
        $n = count($a);
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n && $a[$j]['r'][0] < $a[$i]['r'][1]; $j++) {
                if ($a[$i]['r'][0] < $a[$j]['r'][1] && $a[$i]['k']['id'] !== $a[$j]['k']['id']) {
                    $m[$a[$i]['k']['id']][] = $a[$j]['k']['id'];
                    $m[$a[$j]['k']['id']][] = $a[$i]['k']['id'];
                }
            }
        }
        return $m;
    }
    private function gecmisUyarisi(array $z): string {
        $bas = $z['basTarih'] . ' ' . ($z['basSaat'] ?? '23:59');
        return $bas < $this->damga() ? ' Uyarı: başlangıç geçmişte kalıyor; tarih doğru mu kullanıcıya teyit ettir.' : '';
    }

    /* ---------------- Cikti bicimleri (ucret YOK) ---------------- */

    private function musteriAdi(?array $m): ?string {
        if (!$m) return null;
        return (string)$m['ad'] . (($m['kurum'] ?? '') !== '' ? ' · ' . $m['kurum'] : '');
    }
    private function musteriDisa(array $m): array {
        return ['id' => (string)$m['id'], 'ad' => (string)$m['ad'], 'kurum' => (string)($m['kurum'] ?? ''), 'arsiv' => !empty($m['arsiv']),
            'yayin_duzeni' => $this->yayinDuzeni($m)];
    }
    /** Yayin duzeni metni (core siklikMetni; bugun Istanbul). */
    private function yayinDuzeni(array $m): string {
        $s = (array)($m['siklik'] ?? []);
        $tur = $s['tur'] ?? 'belirsiz';
        if ($tur === 'gunluk') return 'Her gün 1';
        if ($tur === 'uc_gun') {
            $b = $s['baslangic'] ?? null;
            if (!is_string($b) || $b === '') return '3 günde 1 (başlangıç tarihi yok)';
            $bugun = istanbul_gunu();
            $sira = $b >= $bugun ? $b : $this->gunEkle($bugun, (3 - $this->gunFarki($b, $bugun) % 3) % 3);
            return '3 günde 1 (sıradaki: ' . $sira . ' ' . $this->gunAdi($sira) . ')';
        }
        if ($tur === 'haftalik') {
            $gunler = array_values(array_filter((array)($s['gunler'] ?? []), fn ($x) => is_int($x) && $x >= 1 && $x <= 7));
            return (!empty($s['haftalikAdet']) ? 'Haftada ' . (int)$s['haftalikAdet'] : 'Haftalık')
                . ($gunler ? ': ' . implode(', ', array_map(fn ($x) => self::GUN_KISA[$x], $gunler)) : ' (günler seçilmedi)');
        }
        return 'Belirlenmedi';
    }
    /** Zaman alanlari: tarih, saatler, ISO baslangic / bitis (saatli: YYYY-AA-GGTSS:DD; tum gun: yalniz tarih, bitis dahil). */
    private function zamanAlanlari(array $x): array {
        $tg = !empty($x['tumGun']);
        $bt = !empty($x['bitTarih']) ? $x['bitTarih'] : $x['basTarih'];
        return ['tum_gun' => $tg, 'tarih' => $x['basTarih'], 'baslangic_saati' => $tg ? null : $x['basSaat'], 'bitis_tarihi' => $bt, 'bitis_saati' => $tg ? null : $x['bitSaat'],
            'gun_adi' => $this->gunAdi($x['basTarih']), 'baslangic' => $tg ? $x['basTarih'] : $x['basTarih'] . 'T' . $x['basSaat'], 'bitis' => $tg ? $bt : $bt . 'T' . $x['bitSaat']];
    }
    private function zamanMetni(array $z): string {
        $t = $z['tarih'] . ' ' . $this->gunAdi($z['tarih']);
        if (!empty($z['tum_gun'])) return $t . ', tüm gün' . ($z['bitis_tarihi'] !== $z['tarih'] ? ' (' . $z['bitis_tarihi'] . ' ' . $this->gunAdi($z['bitis_tarihi']) . "'ye kadar)" : '');
        return $t . ' ' . $z['baslangic_saati'] . '–' . $z['bitis_saati'] . ($z['bitis_tarihi'] !== $z['tarih'] ? ' (' . $z['bitis_tarihi'] . ' ' . $this->gunAdi($z['bitis_tarihi']) . ')' : '');
    }
    private function etkinlikDisa(array $e, array $v, array $cak): array {
        $mid = $e['musteriId'] ?? null;
        return ['id' => (string)$e['id'], 'surum' => (int)$e['surum'], 'baslik' => (string)$e['baslik'], 'musteri_id' => $mid,
            'musteri_adi' => $this->musteriAdi($mid !== null ? ($v['musteri'][$mid] ?? null) : null), 'tur' => (string)$e['tur']]
            + $this->zamanAlanlari($e)
            + ['durum' => (string)$e['durum'], 'konum' => (string)($e['konum'] ?? ''), 'cakisan_idler' => array_values($cak[$e['id']] ?? [])];
    }
    private function blokBasligi(array $k, array $v): string {
        $b = trim((string)($k['baslik'] ?? ''));
        return $b !== '' ? $b : 'Edit: ' . ($this->musteriAdi($v['musteri'][$k['musteriId']] ?? null) ?? 'müşteri');
    }
    private function blokDisa(array $k, array $v, array $cak): array {
        $z = $this->zamanAlanlari($k);
        unset($z['tum_gun']);
        return ['id' => (string)$k['id'], 'surum' => (int)$k['surum'], 'baslik' => $this->blokBasligi($k, $v), 'musteri_id' => (string)$k['musteriId'],
            'musteri_adi' => $this->musteriAdi($v['musteri'][$k['musteriId']] ?? null), 'icerik_idler' => array_values((array)$k['icerikIdler']),
            'icerikler' => array_values(array_map(fn ($i) => ['id' => $i, 'baslik' => (string)($v['icerik'][$i]['baslik'] ?? '(bulunamadı)')], (array)$k['icerikIdler']))]
            + $z + ['durum' => (string)$k['durum'], 'cakisan_idler' => array_values($cak[$k['id']] ?? [])];
    }
    private function icerikDisa(array $i, array $v): array {
        return ['id' => (string)$i['id'], 'surum' => (int)$i['surum'], 'baslik' => (string)$i['baslik'], 'musteri_id' => (string)$i['musteriId'],
            'musteri_adi' => $this->musteriAdi($v['musteri'][$i['musteriId']] ?? null), 'tur' => (string)$i['tur'], 'durum' => (string)$i['durum'],
            'teslim_tarihi' => $i['teslimTarihi'] ?? null, 'plan_tarihi' => $i['planTarihi'] ?? null, 'cekim_id' => $i['cekimId'] ?? null];
    }
    private function cakisanDisa(array $o, array $v): array {
        $z = $this->zamanAlanlari($o['k']);
        $b = $o['tur'] === 'blok' ? $this->blokBasligi($o['k'], $v) : (string)$o['k']['baslik'];
        $mid = $o['k']['musteriId'] ?? null;
        if ($o['tur'] === 'etkinlik' && $mid !== null && isset($v['musteri'][$mid])) $b .= ' (' . $this->musteriAdi($v['musteri'][$mid]) . ')';
        return ['id' => (string)$o['k']['id'], 'tur' => $o['tur'], 'baslik' => $b, 'baslangic' => $z['baslangic'], 'bitis' => $z['bitis']];
    }
    private function cakisanMetni(array $cd): string {
        return implode('; ', array_map(fn ($c) => ($c['tur'] === 'blok' ? 'edit bloğu ' : '') . '“' . $c['baslik'] . '” ' . str_replace('T', ' ', $c['baslangic']) . '–' . str_replace('T', ' ', $c['bitis']), $cd));
    }

    /** Aralik icindeki resmi tatiller ve ozel gunler (core resmiTatiller / gununOzelGunleri) + dini bayram bilinmeyen yil notu. */
    private function ozelGunler(array $v, string $bas, string $bit): array {
        $l = [];
        $notlar = [];
        $ilkDini = min(array_keys(self::DINI_BAYRAMLAR));
        for ($y = (int)substr($bas, 0, 4); $y <= (int)substr($bit, 0, 4); $y++) {
            $liste = array_merge(self::SABIT_TATILLER, self::DINI_BAYRAMLAR[$y] ?? []);
            foreach ($liste as $t) {
                $tarih = $y . '-' . $t[0];
                if ($tarih >= $bas && $tarih <= $bit) $l[] = ['tarih' => $tarih, 'ad' => $t[1], 'tur' => 'tatil', 'yarim_gun' => !empty($t[2])];
            }
            if (!isset(self::DINI_BAYRAMLAR[$y])) $notlar[] = $y . ': ' . ($y < $ilkDini ? 'Bu yıl için dini bayram tarihleri eklenmedi' : 'Dini bayram tarihleri Diyanet takvimi yayımlanınca eklenecek') . ' (tahmin edilmez).';
        }
        for ($g = $bas; $g <= $bit; $g = $this->gunEkle($g, 1)) {
            foreach ($v['ozelgun'] as $o) {
                if (!empty($o['arsiv']) || !is_string($o['tarih'] ?? null)) continue;
                $eslesir = $o['tarih'] === $g;
                if (!$eslesir && !empty($o['herYil']) && $g >= $o['tarih']) {
                    $ag = substr($o['tarih'], 5);
                    if ($ag === '02-29' && !checkdate(2, 29, (int)substr($g, 0, 4))) $ag = '02-28';
                    $eslesir = substr($g, 5) === $ag;
                }
                if ($eslesir) $l[] = ['tarih' => $g, 'ad' => (string)$o['baslik'], 'tur' => $o['tur'] === 'dogum' ? 'dogum' : 'ozel', 'yarim_gun' => false];
            }
        }
        usort($l, fn ($x, $y) => [$x['tarih'], $x['tur'] === 'tatil' ? 0 : 1, $x['ad']] <=> [$y['tarih'], $y['tur'] === 'tatil' ? 0 : 1, $y['ad']]);
        return [$l, $notlar];
    }

    /* ---------------- Tarih / metin ---------------- */

    private function gunEkle(string $t, int $n): string {
        return (new DateTimeImmutable($t . ' 00:00:00', new DateTimeZone('UTC')))->modify(($n >= 0 ? '+' : '') . $n . ' day')->format('Y-m-d');
    }
    private function gunFarki(string $a, string $b): int { return mcp_gun_farki($a, $b); }
    private function gunAdi(string $t): string { return mcp_gun_adi(new DateTimeImmutable($t . ' 00:00:00', new DateTimeZone('UTC'))); }
    /** Istanbul zaman damgasi 'YYYY-AA-GG SS:DD' (UTC+3, yaz saati yok; panelin damga() bicimi). */
    private function damga(): string { return gmdate('Y-m-d H:i', simdi() + 3 * 3600); }
    /** Arama icin katlama (core katla): Turkce kucuk harf, aksansiz, bosluklar tek. */
    private function katla(string $s): string {
        $s = norm($s);
        return trim((string)preg_replace('/\s+/u', ' ', strtr($s, ['ç' => 'c', 'ğ' => 'g', 'ı' => 'i', 'ö' => 'o', 'ş' => 's', 'ü' => 'u', 'â' => 'a', 'î' => 'i', 'û' => 'u'])));
    }
};
