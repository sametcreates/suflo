<?php
declare(strict_types=1);

/*
 * Suflo Studio API (tek kullanicili ozel icerik uretim ve ajans takip uygulamasi)
 *
 * - Suflo Pro lisans servisinden (pro-v1) TAMAMEN ayri: ayri config (private/studio-v1/config.php),
 *   ayri veritabani, ayri oturum cerezi. Pro lisansi burada hicbir yetki vermez.
 * - Her istek: POST + JSON, Origin izin listesinde, "X-Studio: 1" basligi (CSRF), giris disindaki
 *   her islemde sunucu tarafli oturum denetimi (__Host- onekli, HttpOnly, Secure, SameSite=Strict cerez).
 * - Veri: kayitlar tablosunda tur (musteri | icerik | etkinlik | blok | ozelgun | ayar) basina beyaz listeli JSON.
 *   blok: musterinin iceriklerine ayrilan calisma (edit) zamani; ozelgun: takvimde ozel gun / dogum gunu.
 *   Eski surum (bu turleri bilmeyen index.php) bu satirlari veri paketinde gormez, cokmez.
 *   Silme yok, arsiv var. Iyimser surum denetimi: surum numaralari tek ve hep artan bir sayactan gelir,
 *   geri yuklemede bile tekrar kullanilmaz; guncelleme "WHERE surum = ?" ile yapilir.
 * - Yazmalar islem (transaction) icinde; SQLite'ta BEGIN IMMEDIATE ile yazma kilidi bastan alinir.
 * - Ice aktarma / geri yuklemeden ve her gunun ilk yazmasindan once ayni islem icinde otomatik anlik kopya.
 * - Istemci yeni kayda kendi kimligini verebilir: ayni istek tekrarlanirsa (yaniti kaybolan kaydetme) ikinci kayit olusmaz.
 * - Hatali giris kilidi; "taninan cihaz" cerezi olan cihaz kilitten etkilenmez (sahibi kilitlenemez).
 * - Gizli bilgi (sifre ozeti, veritabani sifresi) yalniz private config'te; yanitlara/gunluge girmez.
 * - Veri mantigi (veritabani, dogrulama, kayit yazma, anlik kopya, sifre kilidi) ayni klasordeki studio-ortak.php'dedir;
 *   sohbet baglantisi (MCP) da onu kullanir. Bu dosya HTTP katmani, oturum ve panel islemleridir.
 */

// PHP uyarilari yanita basilmaz (sunucu yolu sizmasin, JSON bozulmasin); yalniz sunucu gunlugune yazilir
ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, private');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

const GOVDE_SINIRI = 8 * 1024 * 1024;      // oturum acikken (ice aktarma)
const ACIK_GOVDE_SINIRI = 16 * 1024;        // oturumsuz istekler (oturum, giris) icin
const LISTE_SINIRI = 20000;                 // ice aktarmada tur basina en cok kayit
const CIHAZ_OMRU = 400 * 24 * 3600;
// Kullaniciya gorunen mesaj (hata kodlari degismez; arayuz koda gore davranir). MESGUL_MESAJI studio-ortak.php'de.
const SUNUCU_HATASI = 'Sunucuda beklenmeyen bir hata oldu. Biraz sonra yeniden dene.';

function cevap(int $kod, array $veri): void {
    http_response_code($kod);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($veri, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function hata(int $kod, string $h, string $mesaj, array $ek = []): void {
    cevap($kod, array_merge(['ok' => false, 'hata' => $h, 'mesaj' => $mesaj], $ek));
}
function basari(array $veri = []): void {
    cevap(200, array_merge(['ok' => true], $veri));
}

/* ---------------- Ayarlar ---------------- */

/** Ayar okunamadan donen kurulum hatasi. Arayuz "sunucuya ulasilamadi" yerine "kurulmadi" gorebilsin diye
 *  bilinen Studio adreslerine CORS basliklari eklenir (yanit gizli bilgi icermez). */
function kurulum_hatasi(string $mesaj): void {
    $o = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if (in_array($o, ['https://suflo.app', 'https://assets.suflo.app'], true)) {
        header('Access-Control-Allow-Origin: ' . $o);
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-Studio');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Vary: Origin');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
    hata(503, 'kurulum', $mesaj);
}

// Ortak veri kitapligi: index.php ile ayni klasorde (v1/.htaccess dogrudan erisimi reddeder; STUDIO_ORTAK olmadan da calismaz)
if (!is_file(__DIR__ . '/studio-ortak.php')) kurulum_hatasi('Sunucu dosyası eksik (studio-ortak.php).');
define('STUDIO_ORTAK', 1);
require_once __DIR__ . '/studio-ortak.php';
// Kitapligin kurulum / veritabani / kilit hatalari panelde dogrudan JSON yanitiyla cikar (eskisi gibi)
studio_dur_ayarla('hata');

$configPath = dirname((string)($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) . '/private/studio-v1/config.php';
try {
    $C = studio_ayar_yukle($configPath);
} catch (StudioHatasi $e) {
    kurulum_hatasi($e->getMessage());
}

/* ---------------- CORS + CSRF ---------------- */

$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
$izinli = in_array($origin, (array)$C['allowed_origins'], true);
if ($izinli) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-Studio');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Max-Age: 600');
}
header('Vary: Origin');
$yontem = (string)($_SERVER['REQUEST_METHOD'] ?? '');
if ($yontem === 'OPTIONS') {
    if (!$izinli) hata(403, 'kaynak', 'Bu adresten erişim yok.');
    http_response_code(204);
    exit;
}
if ($yontem !== 'POST') hata(405, 'yontem', 'Yalnız POST.');
if (!$izinli) hata(403, 'kaynak', 'Bu adresten erişim yok.');
if (($_SERVER['HTTP_X_STUDIO'] ?? '') !== '1') hata(403, 'baslik', 'Eksik istek başlığı.');
$ctype = strtolower(trim(explode(';', (string)($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
if ($ctype !== 'application/json') hata(415, 'icerik_turu', 'Content-Type application/json olmalı.');
// Oturum govdeden once denetlenir: oturumsuz istek (oturum, giris) yalniz kucuk govde gonderebilir;
// buyuk govde (ice aktarma) yalniz gecerli oturumla okunur ve cozulur.
try {
    sifre_izi_denetle();
    $oturumlu = oturum_gecerli();
} catch (Throwable $e) {
    if (mesgul_mu($e)) hata(503, 'mesgul', MESGUL_MESAJI);
    hata(500, 'sunucu', SUNUCU_HATASI);
}
$sinir = $oturumlu ? GOVDE_SINIRI : ACIK_GOVDE_SINIRI;
// oturumsuz buyuk govde: suresi dolmus oturumla ice aktarma gibi; "dosya buyuk" degil "giris gerekli" doner
$asim = function () use ($oturumlu) { if (!$oturumlu) hata(401, 'oturum', 'Giriş gerekli.'); hata(413, 'buyuk', 'İstek çok büyük.'); };
$uzunluk = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($uzunluk > $sinir) $asim();
$ham = (string)file_get_contents('php://input', false, null, 0, $sinir + 1);
if (strlen($ham) > $sinir) $asim();
$G = json_decode($ham, true, 64);
if (!is_array($G)) hata(400, 'json', 'Geçersiz JSON.');
$islem = is_string($G['islem'] ?? null) ? $G['islem'] : '';


/* ---------------- Oturum ve cihaz ---------------- */

function cerez_yaz(string $tur, string $deger, int $omur): void {
    global $C;
    setcookie(cerez_adi($tur), $deger, [
        'expires' => $omur > 0 ? simdi() + $omur : 1,
        'path' => '/',
        'secure' => (bool)$C['cookie_secure'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function oturum_gecerli(): bool {
    global $C;
    $t = cerez_oku('oturum');
    if ($t === '') return false;
    $oz = hash('sha256', $t);
    $r = tek('SELECT olusturma, son FROM oturumlar WHERE ozet = ?', [$oz]);
    if (!$r) return false;
    $n = simdi();
    if ($n - (int)$r['son'] > (int)$C['session_idle'] || $n - (int)$r['olusturma'] > (int)$C['session_max']) {
        calistir('DELETE FROM oturumlar WHERE ozet = ?', [$oz]);
        return false;
    }
    if ($n - (int)$r['son'] > 300) { try { calistir('UPDATE oturumlar SET son = ? WHERE ozet = ?', [$n, $oz]); } catch (Throwable $e) { /* mesgulse sonraki istekte */ } }
    return true;
}
function oturum_ac(): void {
    global $C;
    $t = rastgele_anahtar();
    $n = simdi();
    calistir('INSERT INTO oturumlar (ozet, olusturma, son) VALUES (?, ?, ?)', [hash('sha256', $t), $n, $n]);
    calistir('DELETE FROM oturumlar WHERE son < ? OR olusturma < ?', [$n - (int)$C['session_idle'], $n - (int)$C['session_max']]);
    cerez_yaz('oturum', $t, (int)$C['session_max']);
}
/** Basarili giristen sonra: bilinen cihazin suresi uzatilir, bilinmeyen cihaz kaydedilir. */
function cihaz_tani(?string $mevcut): void {
    $n = simdi();
    if ($mevcut !== null) {
        calistir('UPDATE cihazlar SET son = ? WHERE ozet = ?', [$n, $mevcut]);
        cerez_yaz('cihaz', cerez_oku('cihaz'), CIHAZ_OMRU);
        return;
    }
    $t = rastgele_anahtar();
    calistir('INSERT INTO cihazlar (ozet, olusturma, son) VALUES (?, ?, ?)', [hash('sha256', $t), $n, $n]);
    calistir('DELETE FROM cihazlar WHERE son < ?', [$n - CIHAZ_BOSTA]);
    cerez_yaz('cihaz', $t, CIHAZ_OMRU);
}

/** Geri yukleme onayi: "GERİ YÜKLE" (eski arayuz "GERI YUKLE" gonderir); buyuk / kucuk harf ve Turkce harf farki onemsiz. */
function onay_dogru($v): bool {
    return is_string($v) && strlen($v) <= 100 && strtr(norm($v), ['ı' => 'i', 'ü' => 'u']) === 'geri yukle';
}



function yaz_hatasi(Throwable $e, ?int $sira = null): void {
    $ek = $sira === null ? [] : ['sira' => $sira];
    switch (yazma_hatasi_kodu($e)) {
        case 'gecersiz': hata(422, 'gecersiz', $e->getMessage(), $ek);
        case 'cakisma': hata(409, 'cakisma', 'Bu kayıt başka bir yerde değişmiş. Güncel hali yüklendi.', $ek + ['guncel' => json_decode((string)cakisma_guncel_json($e))]);
        case 'yok': hata(404, 'yok', 'Kayıt bulunamadı.', $ek);
        case 'ayni_ad': hata(409, 'ayni_ad', 'Aynı ad (ve kurum) ile bir müşteri zaten var.', $ek);
        case 'mesgul': hata(503, 'mesgul', MESGUL_MESAJI, $ek);
        case 'veritabani_sinir': hata(503, 'veritabani_sinir', 'Veri, MySQL paket sınırını (max_allowed_packet) aştı; hosting panelinden artırılmalı.', $ek);
    }
    hata(500, 'sunucu', 'Kayıt yazılamadı; değişiklik kaydedilmedi. Biraz sonra yeniden dene.', $ek);
}

/** Ice aktarmada taninan alanlar; digerleri yok sayilir ve onizlemede uyari olarak gosterilir. */
const BILINEN_ALT_ALANLAR = [
    'siklik' => ['tur', 'haftalikAdet', 'gunler', 'gunTurleri', 'baslangic'],
    'dosyalar' => ['ham', 'proje', 'final'],
];
const BILINEN_AYAR = ['id', 'surum', 'olusturma', 'guncelleme', 'varsayilanStokUyari', 'sonYedek', 'calismaBas', 'calismaBit', 'haftalikHedef'];
const BILINEN_ALANLAR = [
    'musteri' => ['id', 'surum', 'olusturma', 'guncelleme', 'ad', 'kurum', 'ucret', 'siklik', 'slotTuru', 'slotIstisna', 'stokUyari', 'stokGirisi', 'not', 'arsiv'],
    'etkinlik' => ['id', 'surum', 'olusturma', 'guncelleme', 'musteriId', 'musteriAdi', 'musteriKurum', 'baslik', 'tur', 'tumGun', 'basTarih', 'basSaat', 'bitTarih', 'bitSaat', 'konum', 'not', 'durum', 'tamamZaman', 'arsiv'],
    'icerik' => ['id', 'surum', 'olusturma', 'guncelleme', 'musteriId', 'musteriAdi', 'musteriKurum', 'baslik', 'tur', 'durum', 'oncelik', 'cekimId', 'teslimTarihi', 'planTarihi', 'yayinTarihi', 'revizyonNotu', 'dosyalar', 'not', 'gecmis', 'arsiv'],
    'blok' => ['id', 'surum', 'olusturma', 'guncelleme', 'musteriId', 'musteriAdi', 'musteriKurum', 'icerikIdler', 'baslik', 'basTarih', 'basSaat', 'bitTarih', 'bitSaat', 'durum', 'tamamZaman', 'not', 'arsiv'],
    'ozelgun' => ['id', 'surum', 'olusturma', 'guncelleme', 'baslik', 'tarih', 'tur', 'herYil', 'arsiv'],
];

/**
 * Ice aktarma plani. $kip: birlestir (yalniz yenileri ekle, var olanlara dokunma) | degistir (tumunu bu dosyayla degistir).
 * - Kimligi (id) olan kayit (yedek) yalniz kimligine gore eslenir: veritabaninda varsa atlanir, yoksa ayni kimlikle eklenir.
 *   Ayni dosyada ayni kimlik iki kez gecerse hata. Boylece yedekten geri yuklemede hicbir kayit "benzer" diye elenmez.
 * - Kimliksiz kayit (elle hazirlanmis liste) dogal anahtarla veritabanindaki kayitlara ve dosyadaki onceki kimliksiz
 *   satirlara karsi denetlenir (ayni satir iki kez eklenmez).
 * - Musteri ad + kurum veritabaninda tekil oldugundan: ayni musteri veritabaninda varsa ona baglanir ve atlanir;
 *   ayni dosyada iki kez geciyorsa hata.
 * - Icerik / etkinlik / calisma blogu musteriye musteriId (dosyadaki kimlik) ya da musteriAdi (+ musteriKurum) ile baglanir.
 * - Calisma blogundaki icerikler dosyadaki kimlikle eslenir; olmayan icerik hata, baska musteriye ait icerik uyariyla bloktan cikarilir.
 *   musteriKurum verilmisse (bos da olsa) ad + kurum tam eslesmeli; verilmemisse ad yalniz tek bir musteriye uyuyorsa baglanir.
 * - degistir kipinde yedekteki ayar kaydi da geri yuklenir.
 */
function ice_aktarma_plani(array $gelen, string $kip): array {
    global $ETK_MUSTERI, $ICERIK_MUSTERI;
    $mevcut = $kip === 'degistir' ? [] : tum_kayitlar();
    $var = tur_haritasi($mevcut);
    $dbDogal = [];
    $musteriAd = [];     // norm(ad)|norm(kurum) => id
    $adIndeks = [];      // norm(ad) => [norm(ad)|norm(kurum), ...] (ayni adli adaylar)
    $musteriAdlari = []; // id => "ad · kurum" (onizlemede baglantiyi gostermek icin)
    foreach ($mevcut as $r) {
        $v = json_decode((string)$r['veri'], true) ?: [];
        $t = (string)$r['tur'];
        if ($t === 'ayar') continue;
        $dbDogal[dogal($t, $v)] = (string)$r['id'];
        if ($t === 'musteri') {
            $ak = norm((string)$v['ad']) . '|' . norm((string)($v['kurum'] ?? ''));
            $musteriAd[$ak] = (string)$r['id'];
            $adIndeks[norm((string)$v['ad'])][] = $ak;
            $musteriAdlari[(string)$r['id']] = (string)$v['ad'] . (($v['kurum'] ?? '') !== '' ? ' · ' . $v['kurum'] : '');
        }
    }
    $plan = ['ekle' => [], 'atla' => [], 'hatalar' => [], 'uyarilar' => [],
        'sayilar' => ['musteri' => 0, 'icerik' => 0, 'etkinlik' => 0, 'blok' => 0, 'ozelgun' => 0, 'atlanan' => 0],
        'ucret' => ['bilinen' => 0, 'belirsiz' => 0, 'toplam' => 0]];
    $idEslem = [];      // dosyadaki kimlik => son kimlik
    $dosyaIdleri = [];  // bu dosyada gorulen kimlikler
    $dosyaMusteri = []; // bu dosyada eklenecek musterilerin dogal anahtari
    $dosyaDogal = [];   // bu dosyada eklenecek kimliksiz etkinlik / iceriklerin dogal anahtari
    $bilinmeyen = [];   // "alan" => sayi
    // sira onemli: blok, iceriklerinden sonra gelir (icerik kimlikleri eslenmis olsun)
    $sira = ['musteri' => 'musteriler', 'etkinlik' => 'etkinlikler', 'icerik' => 'icerikler', 'blok' => 'bloklar', 'ozelgun' => 'ozelgunler'];
    // Onizlemede satir etiketi: "2. müşteri (Ad)"; bolum adi arayuzdeki gibi
    $satirAd = ['musteri' => 'müşteri', 'etkinlik' => 'çekim / etkinlik', 'icerik' => 'içerik', 'blok' => 'çalışma bloğu', 'ozelgun' => 'özel gün'];
    $bolumAd = ['musteri' => 'Müşteriler', 'etkinlik' => 'Çekim / etkinlikler', 'icerik' => 'İçerikler', 'blok' => 'Çalışma blokları', 'ozelgun' => 'Özel günler'];
    foreach ($sira as $tur => $alan) {
        $liste = $gelen[$alan] ?? [];
        if (!is_array($liste)) { $plan['hatalar'][] = "{$bolumAd[$tur]} ($alan) liste biçiminde olmalı"; continue; }
        if (count($liste) > LISTE_SINIRI) { $plan['hatalar'][] = "{$bolumAd[$tur]} ($alan) listesi çok uzun (en çok " . sayi_metni(LISTE_SINIRI) . ' kayıt)'; continue; }
        foreach (array_values($liste) as $i => $k) {
            $etiket = ($i + 1) . '. ' . $satirAd[$tur];
            if (!is_array($k)) { $plan['hatalar'][] = "$etiket: kayıt biçimi hatalı"; continue; }
            $satirBasligi = $k[$tur === 'musteri' ? 'ad' : 'baslik'] ?? null;
            if (is_string($satirBasligi) && trim($satirBasligi) !== '') $etiket .= ' (' . mb_substr(trim($satirBasligi), 0, 60) . ')';
            foreach (array_keys($k) as $ak) {
                if (!in_array((string)$ak, BILINEN_ALANLAR[$tur], true)) { $bk = "$alan." . mb_substr((string)$ak, 0, 40); $bilinmeyen[$bk] = ($bilinmeyen[$bk] ?? 0) + 1; }
                elseif (isset(BILINEN_ALT_ALANLAR[$ak]) && is_array($k[$ak])) {
                    foreach (array_keys($k[$ak]) as $alt) {
                        if (!in_array((string)$alt, BILINEN_ALT_ALANLAR[$ak], true)) { $bk = "$alan.$ak." . mb_substr((string)$alt, 0, 40); $bilinmeyen[$bk] = ($bilinmeyen[$bk] ?? 0) + 1; }
                    }
                } elseif ($ak === 'gecmis' && is_array($k[$ak])) {
                    // gecmis ogeleri { z, m }: baska anahtarlar kaydedilmez, uyarilir
                    foreach ($k[$ak] as $g) {
                        if (!is_array($g)) continue;
                        foreach (array_keys($g) as $alt) {
                            if ($alt !== 'z' && $alt !== 'm') { $bk = "$alan.gecmis[]." . mb_substr((string)$alt, 0, 40); $bilinmeyen[$bk] = ($bilinmeyen[$bk] ?? 0) + 1; }
                        }
                    }
                }
            }
            $eskiId = isset($k['id']) && id_bicim($k['id']) ? (string)$k['id'] : null;
            if ($eskiId !== null) {
                if (isset($dosyaIdleri[$eskiId])) { $plan['hatalar'][] = "$etiket: aynı kayıt kimliği dosyada iki kez geçiyor"; continue; }
                $dosyaIdleri[$eskiId] = 1;
                // zaten var olan kayit: dokunulmaz, bugunku kurallara gore yeniden dogrulanmaz (eski yedek birlestirilebilir)
                if (isset($var[$eskiId])) {
                    if ($var[$eskiId] !== $tur) { $plan['hatalar'][] = "$etiket: bu kayıt kimliği başka türde bir kayda ait"; continue; }
                    $ad0 = $k[$tur === 'musteri' ? 'ad' : 'baslik'] ?? null;
                    $ad0 = is_string($ad0) ? $ad0 : $eskiId;
                    $plan['atla'][] = ['tur' => $tur, 'ad' => mb_substr($ad0, 0, 120), 'neden' => 'aynı kayıt zaten var'];
                    $idEslem[$eskiId] = $eskiId;
                    $plan['sayilar']['atlanan']++;
                    continue;
                }
            }
            if ($tur !== 'musteri' && $tur !== 'ozelgun') {
                $mid = $k['musteriId'] ?? null;
                if (is_string($mid) && $mid !== '' && isset($idEslem[$mid])) {
                    $k['musteriId'] = $idEslem[$mid];
                } elseif ((!is_string($mid) || $mid === '') && isset($k['musteriAdi']) && is_string($k['musteriAdi']) && trim($k['musteriAdi']) !== '') {
                    $ad = norm($k['musteriAdi']);
                    $bulunan = null;
                    if (array_key_exists('musteriKurum', $k) && $k['musteriKurum'] !== null) {
                        if (!is_string($k['musteriKurum'])) { $plan['hatalar'][] = "$etiket: müşteri kurumu (musteriKurum) metin olmalı"; continue; }
                        $kurum = norm($k['musteriKurum']);
                        $bulunan = $musteriAd[$ad . '|' . $kurum] ?? null;
                    } else {
                        $adaylar = $adIndeks[$ad] ?? [];
                        if (count($adaylar) > 1) { $plan['hatalar'][] = "$etiket: “" . mb_substr($k['musteriAdi'], 0, 60) . '” adında birden çok müşteri var; hangisi olduğunu belirtmek için kurumunu (musteriKurum) ekle'; continue; }
                        if (count($adaylar) === 1) $bulunan = $musteriAd[$adaylar[0]];
                    }
                    if ($bulunan === null) { $plan['hatalar'][] = "$etiket: “" . mb_substr($k['musteriAdi'], 0, 60) . '” adlı müşteri bulunamadı'; continue; }
                    $k['musteriId'] = $bulunan;
                }
                if ($tur === 'icerik' && is_string($k['cekimId'] ?? null) && isset($idEslem[$k['cekimId']])) $k['cekimId'] = $idEslem[$k['cekimId']];
                // baska musterinin cekimine bagli icerik: dosya reddedilmez, bag kaldirilir ve uyarilir
                if ($tur === 'icerik' && is_string($k['cekimId'] ?? null) && $k['cekimId'] !== '' && ($ETK_MUSTERI[$k['cekimId']] ?? null) !== null
                    && is_string($k['musteriId'] ?? null) && $ETK_MUSTERI[$k['cekimId']] !== $k['musteriId']) {
                    $plan['uyarilar'][] = "$etiket: bağlı çekim başka müşteriye ait; bu bağ kaldırılacak";
                    $k['cekimId'] = null;
                }
                // calisma blogu: icerik kimlikleri eslenir; baska musteriye ait icerik (ornegin sonradan musterisi degismis)
                // dosyayi reddettirmez, uyariyla bloktan cikarilir. Olmayan icerik temizle()'de hata olur.
                if ($tur === 'blok' && liste_mi($k['icerikIdler'] ?? null)) {
                    $liste2 = [];
                    $cikan = 0;
                    foreach ($k['icerikIdler'] as $iid) {
                        if (is_string($iid) && isset($idEslem[$iid])) $iid = $idEslem[$iid];
                        if (is_string($iid) && is_string($k['musteriId'] ?? null) && isset($ICERIK_MUSTERI[$iid]) && $ICERIK_MUSTERI[$iid] !== $k['musteriId']) { $cikan++; continue; }
                        $liste2[] = $iid;
                    }
                    if ($cikan) $plan['uyarilar'][] = "$etiket: $cikan içerik başka müşteriye ait; bloktan çıkarılacak";
                    $k['icerikIdler'] = $liste2;
                }
            }
            try {
                $temiz = temizle($tur, $k, $var);
            } catch (InvalidArgumentException $e) {
                $plan['hatalar'][] = "$etiket: " . $e->getMessage();
                continue;
            }
            $ad = $tur === 'musteri' ? $temiz['ad'] : $temiz['baslik'];
            if ($tur === 'blok' && $ad === '') $ad = 'Çalışma bloğu ' . $temiz['basTarih'] . ' ' . $temiz['basSaat'];
            $d = dogal($tur, $temiz);
            if ($tur === 'musteri') {
                if (isset($dosyaMusteri[$d])) { $plan['hatalar'][] = "$etiket: aynı müşteri (ad + kurum) dosyada iki kez geçiyor"; continue; }
                if (isset($dbDogal[$d])) {
                    $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => 'aynı ad ve kurumla müşteri zaten var'];
                    if ($eskiId !== null) $idEslem[$eskiId] = $dbDogal[$d];
                    $plan['sayilar']['atlanan']++;
                    continue;
                }
                $dosyaMusteri[$d] = 1;
            } elseif ($eskiId === null && (isset($dbDogal[$d]) || isset($dosyaDogal[$d]))) {
                $plan['atla'][] = ['tur' => $tur, 'ad' => $ad, 'neden' => isset($dbDogal[$d]) ? 'aynı ad ve tarihle zaten var' : 'dosyada aynı satır iki kez geçiyor'];
                $plan['sayilar']['atlanan']++;
                continue;
            }
            if ($eskiId === null && $tur !== 'musteri') $dosyaDogal[$d] = 1;
            $yeni = $eskiId ?? yeni_id();
            if ($eskiId !== null) $idEslem[$eskiId] = $yeni;
            $var[$yeni] = $tur;
            if ($tur === 'etkinlik') $ETK_MUSTERI[$yeni] = $temiz['musteriId'];
            if ($tur === 'icerik') $ICERIK_MUSTERI[$yeni] = $temiz['musteriId'];
            if ($tur === 'musteri') {
                $ak = norm($temiz['ad']) . '|' . norm($temiz['kurum']);
                $musteriAd[$ak] = $yeni;
                $adIndeks[norm($temiz['ad'])][] = $ak;
                $musteriAdlari[$yeni] = $temiz['ad'] . ($temiz['kurum'] !== '' ? ' · ' . $temiz['kurum'] : '');
                if ($temiz['ucret'] === null) $plan['ucret']['belirsiz']++;
                else { $plan['ucret']['bilinen']++; $plan['ucret']['toplam'] += $temiz['ucret']; }
            }
            $bag = isset($temiz['musteriId']) && $tur !== 'musteri' ? ($musteriAdlari[$temiz['musteriId']] ?? null) : null;
            $ek = $tur === 'musteri' ? ['ucret' => $temiz['ucret'], 'siklik' => $temiz['siklik']['tur']] : [];
            $plan['ekle'][] = ['tur' => $tur, 'id' => $yeni, 'veri' => $temiz, 'ad' => $ad, 'bag' => $bag, 'ek' => $ek,
                'olusturma' => isset($k['olusturma']) && is_int($k['olusturma']) && $k['olusturma'] > 0 ? $k['olusturma'] : null,
                'guncelleme' => isset($k['guncelleme']) && is_int($k['guncelleme']) && $k['guncelleme'] > 0 ? $k['guncelleme'] : null];
            $plan['sayilar'][$tur]++;
        }
    }
    foreach ($bilinmeyen as $bk => $n) $plan['uyarilar'][] = "Bilinmeyen alan '$bk' ($n kayıtta): yok sayılacak";
    // degistir: yedekteki ayar kaydi da geri gelir
    $plan['ayar'] = null;
    $plan['ayarSil'] = $kip === 'degistir' && array_key_exists('ayar', $gelen) && $gelen['ayar'] === null;
    if ($kip === 'degistir' && isset($gelen['ayar']) && is_array($gelen['ayar'])) {
        foreach (array_keys($gelen['ayar']) as $ak) if (!in_array((string)$ak, BILINEN_AYAR, true)) $plan['uyarilar'][] = "Bilinmeyen alan 'ayar." . mb_substr((string)$ak, 0, 40) . "': yok sayılacak";
        try { $plan['ayar'] = temizle('ayar', $gelen['ayar'], $var); }
        catch (InvalidArgumentException $e) { $plan['hatalar'][] = 'Ayarlar: ' . $e->getMessage(); }
    }
    return $plan;
}
function plan_ozeti(array $plan, string $kip): array {
    $o = ['kip' => $kip, 'sayilar' => $plan['sayilar'], 'ucret' => $plan['ucret'], 'hatalar' => array_slice($plan['hatalar'], 0, 100),
        'hataSayisi' => count($plan['hatalar']), 'uyarilar' => array_slice($plan['uyarilar'], 0, 50), 'atla' => array_slice($plan['atla'], 0, 200),
        'ekle' => array_map(fn($e) => ['tur' => $e['tur'], 'ad' => $e['ad'], 'bag' => $e['bag']] + $e['ek'], array_slice($plan['ekle'], 0, 500)),
        'ayar' => $plan['ayar'] !== null, 'ayarSil' => !empty($plan['ayarSil']), 'durum' => veri_durumu()];
    if ($kip === 'degistir') $o['kaldirilacak'] = sayilar(veri_paketi());
    return $o;
}

/** Kayitlari (yeniden) yazar; surum numaralari sayactan gelir, hic tekrarlanmaz. Islem icinde cagrilir. */
function kayitlari_ekle(array $ekle): void {
    $n = simdi();
    foreach ($ekle as $e) {
        calistir('INSERT INTO kayitlar (id, tur, anahtar, veri, surum, olusturma, guncelleme) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$e['id'], $e['tur'], anahtar($e['tur'], $e['veri']), json_metin($e['veri']), yeni_surum(), $e['olusturma'] ?? $n, $e['guncelleme'] ?? $n]);
    }
}

/* ---------------- Sohbet baglantilari (MCP) ---------------- */

/**
 * Ayarlar -> "Sohbet baglantilari". Yalniz oturum denetiminden SONRA (switch icinden) cagrilir; buraya gelen istek
 * yukaridaki Origin + X-Studio + JSON + oturum denetimlerinin hepsinden gecmistir (MCP icin ayri bir giris yolu yok).
 * MCP kitapligi panelle ayni uygulama klasorundedir (public_html/studio/mcp-kitaplik/); yoksa "kurulu degil" doner.
 * config 'mcp_acik' => false ise MCP deposu hic acilmaz, bos durum doner. Jeton, ozet ya da sir hicbir yanita girmez.
 * Doner: null = kurulu degil, false = kapali, true = acik (kitaplik yuklu, mcp_baslat yapildi).
 */
function mcp_panel_hazirla(): ?bool {
    static $durum = 0;
    if ($durum !== 0) return $durum;
    $kok = dirname(__DIR__);
    $yukle = $kok . '/mcp-kitaplik/yukle.php';
    if (!is_file($yukle)) return $durum = null;
    if (!defined('SUFLO_MCP')) define('SUFLO_MCP', 1);
    if (!defined('SUFLO_MCP_PANEL')) define('SUFLO_MCP_PANEL', 1);   // kitaplik kurulum hatasinda yanit basip cikmasin, istisna atsin
    require_once $yukle;
    mcp_baslat($kok);
    return $durum = mcp_acik_mi();
}
/** Panelle MCP ayni ayar dosyasini okuyorsa (canli kurulum) panel sifre izi MCP'ye uygulanir: sifre degistiyse eski baglantilar listede "aktif" gorunmez. */
function mcp_panel_sifre_izi(): void {
    global $configPath;
    $a = realpath(mcp_ortam('ozel') . '/config.php');
    if ($a !== false && $a === realpath($configPath)) mcp_sifre_izi_uygula(sahip_sifre_izi());
}
function mcp_panel_durum(): array {
    $acik = mcp_panel_hazirla();
    $bos = ['kurulu' => $acik !== null, 'acik' => (bool)$acik, 'adres' => $acik === null ? null : mcp_ortam('kaynak'),
        'baglantilar' => [], 'gunluk' => [], 'kayit' => null];
    if (!$acik) return $bos;
    mcp_panel_sifre_izi();
    $n = time();
    $b = array_values(array_filter(mcp_baglantilar(), fn ($r) => $r['durum'] === 'aktif' && (int)$r['bitis'] > $n));
    $bos['baglantilar'] = array_map(fn ($r) => [
        'id' => (string)$r['id'], 'istemci' => (string)$r['istemci'], 'hostlar' => $r['yonlendirme_hostlari'],
        'kapsam' => array_values(array_filter(explode(' ', (string)$r['kapsam']))),
        'olusturma' => (int)$r['olusturma'], 'sonKullanim' => $r['son_kullanim'] === null ? null : (int)$r['son_kullanim'],
    ], $b);
    $bos['gunluk'] = array_map(fn ($r) => [
        'zaman' => (int)$r['zaman'], 'istemci' => (string)$r['istemci'], 'olay' => (string)$r['olay'], 'sonuc' => (string)$r['sonuc'],
        'kayitlar' => array_values(array_filter((array)$r['etkilenen'], 'is_string')), 'ozet' => (string)$r['ozet'],
    ], mcp_gunluk_son(20));
    $bos['kayit'] = mcp_kayit_sayaci();
    return $bos;
}
/** Panel MCP islemi: istisnalari panelin JSON hatalarina cevirir. */
function mcp_panel(callable $f): void {
    try {
        $sonuc = $f() + ['mcp' => mcp_panel_durum()];
    } catch (Throwable $e) {
        if ((function_exists('mcp_mesgul_mu') && mcp_mesgul_mu($e)) || mesgul_mu($e)) hata(503, 'mesgul', MESGUL_MESAJI);
        error_log('suflo-studio mcp paneli: ' . $e->getMessage());
        if ($e instanceof McpKurulumHatasi) hata(503, 'mcp_kurulum', 'Sohbet bağlantısı ayarları okunamadı (sunucu ayarlarını kontrol et).');
        hata(500, 'sunucu', SUNUCU_HATASI);
    }
    basari($sonuc);
}

/* ---------------- Islemler ---------------- */

try {
    // Oturum gerektirmeyenler
    if ($islem === 'oturum') {
        basari(['girisli' => $oturumlu, 'kurulu' => sifre_ozeti() !== '']);
    }
    if ($islem === 'giris') {
        if (sifre_ozeti() === '') hata(503, 'kurulum', 'Giriş şifresi henüz ayarlanmadı.');
        $sifre = $G['sifre'] ?? '';
        $cihaz = cihaz_ozeti();
        $dogrulanan = is_string($sifre) ? sifre_dene($sifre, $cihaz) : null;
        if ($dogrulanan === null) hata(401, 'sifre', 'Şifre yanlış.');
        // oturum, yazma kilidi altinda ve sifre bu arada degismediyse acilir (sifre degisikligiyle yaris olmaz).
        // Saklanan parmak izi de denetlenir: bu istek config.php'nin eski halini okumus olabilir; bu arada yeni
        // ozetle gelen bir istek oturumlari temizlediyse eski sifreyle acilan oturum temizligin ardindan kalmasin.
        $tamam = islem(function () use ($dogrulanan, $cihaz) {
            if (sifre_ozeti() !== $dogrulanan || ayar_oku('sifre_izi') !== sifre_izi($dogrulanan)) return false;
            oturum_ac();
            cihaz_tani($cihaz);
            return true;
        });
        if (!$tamam) hata(401, 'sifre', 'Şifre yanlış.');
        basari(['girisli' => true]);
    }

    // Bundan sonrasi oturum ister
    if (!$oturumlu) hata(401, 'oturum', 'Giriş gerekli.');

    switch ($islem) {
        case 'cikis':
            $t = cerez_oku('oturum');
            if ($t !== '') calistir('DELETE FROM oturumlar WHERE ozet = ?', [hash('sha256', $t)]);
            cerez_yaz('oturum', '', 0);
            basari();

        case 'veri':
            basari(['veri' => veri_paketi(), 'sunucuZamani' => simdi(), 'surum' => STUDIO_SURUM]);

        case 'kaydet':
            try {
                $k = kayit_kaydet(skaler_metin($G['tur'] ?? '', 'tur'), isset($G['id']) ? skaler_metin($G['id'], 'id') : null, is_array($G['veri'] ?? null) ? $G['veri'] : [],
                    isset($G['surum']) ? (int)$G['surum'] : null);
            } catch (Throwable $e) {
                yaz_hatasi($e);
            }
            basari(['kayit' => $k]);

        case 'toplu':
            $liste = $G['kayitlar'] ?? null;
            if (!is_array($liste) || count($liste) === 0 || count($liste) > 500) hata(422, 'gecersiz', 'Bir seferde 1 ile 500 arasında kayıt gönderilebilir.');
            $sira = 0;
            try {
                $sonuc = islem(function () use ($liste, &$sira) {
                    gunluk_anlik();
                    $var = tur_haritasi(tum_kayitlar());
                    $out = [];
                    foreach (array_values($liste) as $i => $k) {
                        $sira = $i;
                        if (!is_array($k)) throw new InvalidArgumentException('Kayıt biçimi hatalı');
                        $out[] = kayit_yaz(skaler_metin($k['tur'] ?? '', 'tur'), isset($k['id']) ? skaler_metin($k['id'], 'id') : null, is_array($k['veri'] ?? null) ? $k['veri'] : [],
                            isset($k['surum']) ? (int)$k['surum'] : null, $var);
                    }
                    return $out;
                });
            } catch (Throwable $e) {
                yaz_hatasi($e, $sira);
            }
            basari(['kayitlar' => $sonuc]);

        case 'ice_aktar':
            $kip = ($G['kip'] ?? 'birlestir') === 'degistir' ? 'degistir' : 'birlestir';
            $gelen = $G['veriler'] ?? null;
            if (!is_array($gelen)) hata(422, 'gecersiz', 'Dosyada içe aktarılacak veri yok.');
            if (!empty($G['onizleme'])) basari(['onizleme' => plan_ozeti(ice_aktarma_plani($gelen, $kip), $kip)]);
            if ($kip === 'degistir' && !onay_dogru($G['onay'] ?? null)) hata(422, 'onay', 'Tüm verinin değiştirilmesi için onay gerekli.');
            $beklenen = is_array($G['beklenen'] ?? null) ? $G['beklenen'] : null;
            try {
                // Plan, yazma kilidi altinda yeniden hesaplanir (arada baska cihaz yazmis olabilir)
                $sonuc = islem(function () use ($gelen, $kip, $beklenen) {
                    $durumOnce = veri_durumu();
                    $plan = ice_aktarma_plani($gelen, $kip);
                    $ozet = plan_ozeti($plan, $kip);
                    if (count($plan['hatalar']) > 0) throw new RuntimeException('plan|' . json_encode($ozet, JSON_UNESCAPED_UNICODE));
                    if ($beklenen !== null) {
                        $eskimis = isset($beklenen['durum']) && (int)$beklenen['durum'] !== $durumOnce;
                        foreach (['musteri', 'icerik', 'etkinlik', 'blok', 'ozelgun', 'atlanan'] as $k) {
                            if (isset($beklenen[$k]) && (int)$beklenen[$k] !== $plan['sayilar'][$k]) $eskimis = true;
                        }
                        if ($eskimis) throw new RuntimeException('onizleme_eski|' . json_encode($ozet, JSON_UNESCAPED_UNICODE));
                    }
                    $a = anlik_al($kip === 'degistir' ? 'geri_yukleme_oncesi' : 'ice_aktarma_oncesi');
                    if ($kip === 'degistir') calistir($plan['ayar'] !== null || !empty($plan['ayarSil']) ? 'DELETE FROM kayitlar' : "DELETE FROM kayitlar WHERE tur <> 'ayar'");
                    kayitlari_ekle($plan['ekle']);
                    if ($plan['ayar'] !== null) kayitlari_ekle([['tur' => 'ayar', 'id' => 'ayar', 'veri' => $plan['ayar'],
                        'olusturma' => is_int($gelen['ayar']['olusturma'] ?? null) && $gelen['ayar']['olusturma'] > 0 ? $gelen['ayar']['olusturma'] : null,
                        'guncelleme' => is_int($gelen['ayar']['guncelleme'] ?? null) && $gelen['ayar']['guncelleme'] > 0 ? $gelen['ayar']['guncelleme'] : null]]);
                    return ['ozet' => $ozet, 'anlik' => $a];
                });
            } catch (Throwable $e) {
                if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'plan|')) {
                    hata(422, 'gecersiz', 'Dosyada hatalı kayıtlar var; önce önizlemedeki hataları düzelt.', ['onizleme' => json_decode(substr($e->getMessage(), 5))]);
                }
                if ($e instanceof RuntimeException && str_starts_with($e->getMessage(), 'onizleme_eski|')) {
                    hata(409, 'onizleme_eski', 'Veri önizlemeden sonra değişti; önizlemeyi yenile.', ['onizleme' => json_decode(substr($e->getMessage(), 14))]);
                }
                yaz_hatasi($e);
            }
            basari(['sonuc' => $sonuc['ozet'], 'anlik' => $sonuc['anlik']]);

        case 'disa_aktar':
            basari(['yedek' => ['format' => 'suflo-studio-yedek', 'surum' => STUDIO_SURUM, 'olusturma' => gmdate('c'), 'veriler' => veri_paketi()]]);

        case 'anliklar':
            $r = hepsi('SELECT id, zaman, neden, ozet FROM anliklar ORDER BY sira DESC');
            basari(['anliklar' => array_map(fn($x) => ['id' => $x['id'], 'zaman' => (int)$x['zaman'], 'neden' => $x['neden'], 'ozet' => $x['ozet']], $r)]);

        case 'anlik_geri':
            if (!onay_dogru($G['onay'] ?? null)) hata(422, 'onay', 'Onay gerekli.');
            $r = tek('SELECT veri FROM anliklar WHERE id = ?', [is_string($G['id'] ?? null) ? $G['id'] : '']);
            if (!$r) hata(404, 'yok', 'Otomatik kopya bulunamadı.');
            $paket = anlik_coz((string)$r['veri']);
            $ekle = [];
            // bu surumden onceki kopyalarda bloklar / ozelgunler yok: geri donuste bos gelir
            $gruplar = ['musteri' => $paket['musteriler'] ?? [], 'etkinlik' => $paket['etkinlikler'] ?? [], 'icerik' => $paket['icerikler'] ?? [],
                'blok' => $paket['bloklar'] ?? [], 'ozelgun' => $paket['ozelgunler'] ?? [],
                'ayar' => isset($paket['ayar']) && is_array($paket['ayar']) ? [$paket['ayar']] : []];
            foreach ($gruplar as $tur => $l) {
                foreach ($l as $x) {
                    $v = $x;
                    unset($v['id'], $v['surum'], $v['olusturma'], $v['guncelleme']);
                    $ekle[] = ['tur' => $tur, 'id' => (string)$x['id'], 'veri' => $v, 'olusturma' => (int)($x['olusturma'] ?? 0) ?: null,
                        'guncelleme' => (int)($x['guncelleme'] ?? 0) ?: null];
                }
            }
            try {
                $yeniAnlik = islem(function () use ($ekle) {
                    $a = anlik_al('anlik_geri_oncesi');
                    calistir('DELETE FROM kayitlar');
                    kayitlari_ekle($ekle);
                    return $a;
                });
            } catch (Throwable $e) {
                yaz_hatasi($e);
            }
            basari(['anlik' => $yeniAnlik]);

        case 'sifre_degistir':
            $eski = $G['eski'] ?? '';
            $yeni = $G['yeni'] ?? '';
            $cihazSd = cihaz_ozeti();
            if (!is_string($eski) || sifre_dene($eski, $cihazSd) === null) hata(401, 'sifre', 'Mevcut şifre yanlış.');
            if (!is_string($yeni) || mb_strlen($yeni) < 12 || strlen($yeni) > 1024) hata(422, 'gecersiz', 'Yeni şifre en az 12 karakter olmalı.');
            islem(function () use ($yeni) {
                global $C;
                ayar_yaz('password_hash', password_hash($yeni, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT));
                ayar_yaz('password_hash_kaynak', hash('sha256', (string)$C['password_hash']));
                calistir('DELETE FROM oturumlar');
                cihazlari_unut(); // calinmis bir cihaz cerezi kilitten muaf kalmasin
                ayar_yaz('sifre_izi', sifre_izi(sifre_ozeti()));
                oturum_ac();
                cihaz_tani(null);
            });
            basari();

        case 'mcp_durum':
            mcp_panel(fn () => []);

        case 'mcp_baglanti_kes':
            $mid = $G['id'] ?? null;
            if (!is_string($mid) || !preg_match('/^[A-Za-z0-9_-]{1,100}$/', $mid)) hata(422, 'gecersiz', 'Bağlantı kimliği geçersiz.');
            mcp_panel(fn () => ['kesildi' => mcp_panel_hazirla() === true && mcp_baglanti_kes($mid)]);

        case 'mcp_tumunu_kes':
            mcp_panel(fn () => ['kesilen' => mcp_panel_hazirla() === true ? mcp_tumunu_kes() : 0]);

        case 'mcp_kayit_sayaci_sifirla':
            mcp_panel(fn () => ['sifirlandi' => mcp_panel_hazirla() === true && mcp_kayit_sayaci_sifirla()]);

        case 'oturumlari_kapat':
            islem(function () {
                calistir('DELETE FROM oturumlar');
                cihazlari_unut();
                cihaz_tani(null); // bu cihaz taninmaya devam eder (yeni anahtarla); digerleri unutulur
            });
            cerez_yaz('oturum', '', 0);
            basari();

        default:
            hata(400, 'islem', 'Bilinmeyen işlem. Sayfayı yenile; sunucu dosyası güncel olmayabilir.');
    }
} catch (Throwable $e) {
    if ($e instanceof PDOException && mesgul_mu($e)) hata(503, 'mesgul', MESGUL_MESAJI);
    hata(500, 'sunucu', SUNUCU_HATASI);
}
