<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP arac kaydi: tanimlar (ad, baslik, Turkce aciklama, inputSchema / outputSchema, ipuclari),
 * JSON Schema alt kume dogrulayicisi, studio_bugun (saf tarih hesabi) ve toplu onay akisi (onizle -> kod -> uygula).
 * Studio kayitlarina dokunan isleyiciler arka uctadir (arka.php: McpStudioArka).
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

const MCP_TALIMATLAR = "Suflo Studio, tek kullanıcılı içerik üretim ve ajans takip uygulamasıdır (müşteriler, çekim takvimi, edit blokları, içerikler). Saat dilimi her zaman Europe/Istanbul (UTC+3, yaz saati yok).\n"
    . "1) 'Yarın', 'cuma', 'haftaya' gibi göreli tarihleri önce studio_bugun ile kesin tarihe çevir; tarihleri YYYY-AA-GG, saatleri SS:DD (24 saat) gönder; yanıtında tarihin yanına gün adını yaz.\n"
    . "2) Müşteri kimliğini studio_musteri_ara ile bul (ya da musteri_adi alanına tam adı yaz: sunucu yalnız tam eşleşmeyi kabul eder). Hiç ya da birden çok eşleşme varsa, tarih / saat eksik ya da 'öğleden sonra', 'akşam' gibi muğlaksa YAZMA; kullanıcıya sor. Tahmin etme.\n"
    . "3) Her yazma isteğine yeni bir istek_anahtari ver; aynı isteği yeniden gönderirken aynı anahtarı kullan (mükerrer kayıt açılmaz).\n"
    . "4) Birden çok kayıt için önce studio_toplu_onizle; önizlemeyi kullanıcıya göster ve yalnız açık onay gelirse studio_toplu_uygula'yı çağır.\n"
    . "5) Güncellemelerde beklenen_surum olarak en son okunan sürümü ver. Çakışma (takvimde aynı saatte çekim ya da edit bloğu) ya da sürüm uyuşmazlığında kullanıcıya sor; cakismayi_onayla'yı yalnız kullanıcı açıkça kabul ederse ver.\n"
    . "6) Silme, mesaj gönderme ve ücret / finans işlemi yoktur.";

const MCP_ICERIK_DURUMLARI = ['fikir', 'cekim_planlandi', 'cekildi', 'kurguda', 'onayda', 'revizyonda', 'hazir', 'yayinlandi'];
const MCP_ICERIK_TURLERI = ['reels', 'video', 'post', 'story', 'diger'];
const MCP_ETKINLIK_TURLERI = ['cekim', 'toplanti', 'diger'];
const MCP_ETKINLIK_DURUMLARI = ['planlandi', 'tamamlandi', 'iptal'];
const MCP_TAKVIM_EN_COK_GUN = 62;
const MCP_BELIRSIZLIK = " Göreli tarihleri ('yarın', 'cuma', 'haftaya') önce studio_bugun ile kesin tarihe çevir; tarih, saat ya da müşteri belli değilse ('öğleden sonra', 'akşama doğru', yalnız ad) tahmin etme, kullanıcıya sor.";

/* ---------------- Tanimlar ---------------- */

/** Arac listesi (sabit sirada). "_" ile baslayan anahtarlar ic kullanimdir, tools/list'e girmez. */
function mcp_araclar(): array {
    static $liste = null;
    if ($liste !== null) return $liste;

    $id = fn (string $acik) => ['type' => 'string', 'pattern' => '^[a-z0-9]{8,40}$', 'description' => $acik];
    $tarih = fn (string $acik) => ['type' => 'string', 'format' => 'date', 'pattern' => '^[0-9]{4}-[0-9]{2}-[0-9]{2}$', 'description' => $acik . ' (YYYY-AA-GG, İstanbul takvimi; göreli günleri studio_bugun ile çöz)'];
    $saat = fn (string $acik) => ['type' => 'string', 'pattern' => '^([01][0-9]|2[0-3]):[0-5][0-9]$', 'description' => $acik . ' (SS:DD, 24 saat, İstanbul)'];
    $metin = fn (int $en, string $acik, int $az = 0) => ['type' => 'string', 'minLength' => $az, 'maxLength' => $en, 'description' => $acik];
    $anahtar = ['type' => 'string', 'minLength' => 8, 'maxLength' => 80, 'pattern' => '^[A-Za-z0-9._:-]{8,80}$',
        'description' => 'Bu isteğe özgü rastgele anahtar (ör. bir UUID). Aynı isteği yeniden gönderirken aynı anahtarı kullan; böylece mükerrer kayıt açılmaz.'];
    $surum = ['type' => 'integer', 'minimum' => 1, 'description' => 'Kaydın en son okunan sürümü (studio_takvim ya da studio_icerik_listele yanıtındaki surum).'];
    $nullMetin = ['type' => ['string', 'null']];
    $musteriAdi = ['type' => 'string', 'minLength' => 1, 'maxLength' => 250,
        'description' => "musteri_id yerine müşterinin TAM adı (ya da studio_musteri_ara'daki \"ad · kurum\" biçimi). Büyük / küçük harf ve Türkçe harf farkı gözetilmez ama ad eksiksiz olmalı: hiç ya da birden çok müşteri eşleşirse hiçbir şey yazılmaz ve adaylar döner; kullanıcıya sor."];
    $okuma = ['readOnlyHint' => true, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false];
    $ekleme = ['readOnlyHint' => false, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false];
    $degistirme = ['readOnlyHint' => false, 'destructiveHint' => true, 'idempotentHint' => true, 'openWorldHint' => false];
    $nesne = fn (array $ozellik, array $zorunlu, bool $kapali = true) => ['type' => 'object', 'properties' => $ozellik]
        + ($zorunlu ? ['required' => $zorunlu] : []) + ($kapali ? ['additionalProperties' => false] : []);

    $musteri = $nesne([
        'id' => ['type' => 'string'], 'ad' => ['type' => 'string'], 'kurum' => ['type' => 'string'],
        'arsiv' => ['type' => 'boolean'], 'yayin_duzeni' => ['type' => 'string'],
    ], ['id', 'ad', 'kurum', 'arsiv'], false);
    $etkinlik = $nesne([
        'id' => ['type' => 'string'], 'surum' => ['type' => 'integer'], 'baslik' => ['type' => 'string'],
        'musteri_id' => $nullMetin, 'musteri_adi' => $nullMetin, 'tur' => ['type' => 'string', 'enum' => MCP_ETKINLIK_TURLERI],
        'tum_gun' => ['type' => 'boolean'], 'baslangic' => ['type' => 'string'], 'bitis' => ['type' => 'string'],
        'durum' => ['type' => 'string', 'enum' => MCP_ETKINLIK_DURUMLARI], 'konum' => ['type' => 'string'],
        'tarih' => ['type' => 'string'], 'baslangic_saati' => $nullMetin, 'bitis_tarihi' => ['type' => 'string'], 'bitis_saati' => $nullMetin,
        'gun_adi' => ['type' => 'string'],
        'cakisan_idler' => ['type' => 'array', 'items' => ['type' => 'string']],
    ], ['id', 'surum', 'baslik', 'musteri_id', 'tur', 'tum_gun', 'baslangic', 'bitis', 'durum'], false);
    $blok = $nesne([
        'id' => ['type' => 'string'], 'surum' => ['type' => 'integer'], 'baslik' => ['type' => 'string'],
        'musteri_id' => ['type' => 'string'], 'musteri_adi' => $nullMetin,
        'icerik_idler' => ['type' => 'array', 'items' => ['type' => 'string']],
        'icerikler' => ['type' => 'array', 'items' => $nesne(['id' => ['type' => 'string'], 'baslik' => ['type' => 'string']], ['id', 'baslik'], false)],
        'tarih' => ['type' => 'string'], 'baslangic_saati' => ['type' => 'string'], 'bitis_tarihi' => ['type' => 'string'], 'bitis_saati' => ['type' => 'string'],
        'gun_adi' => ['type' => 'string'], 'baslangic' => ['type' => 'string'], 'bitis' => ['type' => 'string'],
        'durum' => ['type' => 'string', 'enum' => ['planlandi', 'tamamlandi']],
        'cakisan_idler' => ['type' => 'array', 'items' => ['type' => 'string']],
    ], ['id', 'surum', 'baslik', 'musteri_id', 'icerik_idler', 'baslangic', 'bitis', 'durum'], false);
    $icerik = $nesne([
        'id' => ['type' => 'string'], 'surum' => ['type' => 'integer'], 'baslik' => ['type' => 'string'],
        'musteri_id' => ['type' => 'string'], 'musteri_adi' => $nullMetin, 'tur' => ['type' => 'string', 'enum' => MCP_ICERIK_TURLERI],
        'durum' => ['type' => 'string', 'enum' => MCP_ICERIK_DURUMLARI], 'teslim_tarihi' => $nullMetin, 'plan_tarihi' => $nullMetin,
        'cekim_id' => $nullMetin,
    ], ['id', 'surum', 'baslik', 'musteri_id', 'tur', 'durum'], false);
    $cakisan = $nesne(['id' => ['type' => 'string'], 'tur' => ['type' => 'string', 'enum' => ['etkinlik', 'blok']], 'baslik' => ['type' => 'string'],
        'baslangic' => ['type' => 'string'], 'bitis' => ['type' => 'string']],
        ['id', 'baslik', 'baslangic', 'bitis'], false);

    // Toplu islem ogeleri (tekil araclarin alanlari, istek_anahtari ve adet olmadan)
    $icerikAlanlari = [
        'musteri_id' => $id('İçeriğin müşterisi (studio_musteri_ara ile bulunan id).'),
        'baslik' => $metin(200, 'İçerik başlığı.', 1),
        'tur' => ['type' => 'string', 'enum' => MCP_ICERIK_TURLERI, 'description' => 'İçerik türü.'],
        'teslim_tarihi' => $tarih('Teslim tarihi'),
        'plan_tarihi' => $tarih('Paylaşım planı tarihi'),
        'durum' => ['type' => 'string', 'enum' => MCP_ICERIK_DURUMLARI, 'default' => 'fikir', 'description' => 'Başlangıç durumu (varsayılan fikir).'],
        'cekim_id' => $id('Bağlı çekim (aynı müşterinin ya da müşterisiz bir çekim).'),
        'not' => $metin(2000, 'Kısa not.'),
    ];
    $cekimAlanlari = [
        'musteri_id' => ['type' => ['string', 'null'], 'pattern' => '^[a-z0-9]{8,40}$', 'description' => 'Müşteri id (studio_musteri_ara); müşterisiz etkinlik için null. musteri_adi ile birlikte verilmez.'],
        'baslik' => $metin(200, 'Etkinlik başlığı.', 1),
        'tur' => ['type' => 'string', 'enum' => MCP_ETKINLIK_TURLERI, 'description' => 'cekim, toplanti ya da diger.'],
        'tarih' => $tarih('Başlangıç tarihi'),
        'baslangic_saati' => $saat('Başlangıç saati; tüm gün etkinlikte verilmez'),
        'bitis_saati' => $saat('Bitiş saati; sure_dakika ile birlikte verilmez'),
        'sure_dakika' => ['type' => 'integer', 'minimum' => 5, 'maximum' => 1440, 'description' => 'Süre (dakika); bitis_saati yerine.'],
        'tum_gun' => ['type' => 'boolean', 'default' => false, 'description' => 'Tüm gün etkinlik. Yalnız kullanıcı açıkça tüm gün dediyse true; saat belli değilse kullanıcıya sor.'],
        'bitis_tarihi' => $tarih('Birden çok güne yayılan etkinliğin bitiş tarihi'),
        'konum' => $metin(300, 'Konum.'),
        'not' => $metin(2000, 'Kısa not.'),
        'cakismayi_onayla' => ['type' => 'boolean', 'default' => false, 'description' => 'Yalnız kullanıcı çakışmayı açıkça kabul ettiyse true.'],
    ];
    $topluOge = ['oneOf' => [
        $nesne(['islem' => ['const' => 'icerik_olustur']] + $icerikAlanlari, ['islem', 'musteri_id', 'baslik', 'tur']),
        $nesne(['islem' => ['const' => 'cekim_olustur']] + $cekimAlanlari, ['islem', 'musteri_id', 'baslik', 'tur', 'tarih']),
        $nesne(['islem' => ['const' => 'icerik_durum'], 'icerik_id' => $id('İçerik id.'),
            'yeni_durum' => ['type' => 'string', 'enum' => MCP_ICERIK_DURUMLARI], 'beklenen_surum' => $surum, 'not' => $metin(500, 'Kısa not.')],
            ['islem', 'icerik_id', 'yeni_durum', 'beklenen_surum']),
        $nesne(['islem' => ['const' => 'cekim_durum'], 'cekim_id' => $id('Çekim / etkinlik id.'),
            'yeni_durum' => ['type' => 'string', 'enum' => MCP_ETKINLIK_DURUMLARI], 'beklenen_surum' => $surum],
            ['islem', 'cekim_id', 'yeni_durum', 'beklenen_surum']),
    ], 'description' => 'Tek işlem: islem alanı icerik_olustur | cekim_olustur | icerik_durum | cekim_durum; diğer alanlar ilgili tekil aracınkiyle aynı.'];
    $onizlemeCikti = $nesne([
        'gecerli' => ['type' => 'boolean'],
        'satirlar' => ['type' => 'array', 'items' => $nesne([
            'sira' => ['type' => 'integer'], 'islem' => ['type' => 'string'], 'ozet' => ['type' => 'string'],
            'durum' => ['type' => 'string', 'enum' => ['gecerli', 'uyari', 'hata']], 'mesaj' => $nullMetin,
        ], ['sira', 'islem', 'ozet', 'durum'], false)],
        'uyarilar' => ['type' => 'array', 'items' => ['type' => 'string']],
        'onay_kodu' => $nullMetin,
        'son_gecerlilik' => $nullMetin,
    ], ['gecerli', 'satirlar', 'uyarilar', 'onay_kodu', 'son_gecerlilik']);

    $liste = [
        [
            'name' => 'studio_bugun',
            'title' => 'Bugünün tarihi (İstanbul)',
            'description' => "İstanbul saatine göre şu anki tarih ve saati, gün adını ve önümüzdeki 14 günün tarih–gün adı tablosunu döndürür. 'Yarın', 'cuma', 'haftaya salı' gibi göreli tarihleri yazmadan önce bu araçla kesin tarihe çevir.",
            'inputSchema' => $nesne([], []),
            'outputSchema' => $nesne([
                'saat_dilimi' => ['type' => 'string'], 'simdi' => ['type' => 'string', 'format' => 'date-time'],
                'tarih' => ['type' => 'string', 'format' => 'date'], 'saat' => ['type' => 'string'], 'gun_adi' => ['type' => 'string'],
                'hafta_baslangici' => ['type' => 'string', 'format' => 'date'],
                'gunler' => ['type' => 'array', 'items' => $nesne(['tarih' => ['type' => 'string', 'format' => 'date'], 'gun_adi' => ['type' => 'string'], 'goreli' => ['type' => 'string']], ['tarih', 'gun_adi', 'goreli'])],
            ], ['saat_dilimi', 'simdi', 'tarih', 'saat', 'gun_adi', 'hafta_baslangici', 'gunler']),
            'annotations' => ['title' => 'Bugünün tarihi (İstanbul)'] + $okuma,
            '_kapsam' => MCP_KAPSAM_OKU, '_isleyici' => 'ic',
        ],
        [
            'name' => 'studio_musteri_ara',
            'title' => 'Müşteri ara',
            'description' => 'Ada ya da kuruma göre müşteri arar (büyük / küçük harf ve Türkçe karakter duyarsız; ad parçası yeter). Yazma araçlarında kullanılacak müşteri id\'sini buradan al. Hiç ya da birden çok eşleşme varsa tahmin etme; kullanıcıya hangisi olduğunu sor. Arşivdeki müşteriler arsiv: true ile döner (onlara yeni kayıt açılmaz). Ücret bilgisi döndürülmez.',
            'inputSchema' => $nesne(['sorgu' => $metin(100, 'Aranacak ad ya da kurum (en az 1 karakter).', 1)], ['sorgu']),
            'outputSchema' => $nesne(['musteriler' => ['type' => 'array', 'items' => $musteri], 'toplam' => ['type' => 'integer']], ['musteriler', 'toplam']),
            'annotations' => ['title' => 'Müşteri ara'] + $okuma,
            '_kapsam' => MCP_KAPSAM_OKU, '_isleyici' => 'arka',
        ],
        [
            'name' => 'studio_takvim',
            'title' => 'Takvim',
            'description' => 'Verilen tarih aralığındaki takvimi döndürür: çekim / toplantı / etkinlikler ve edit (çalışma) blokları (id, surum, başlık, müşteri, başlangıç–bitiş, durum, çakışanlar), içerik teslim tarihleri, planlı paylaşımlar, resmî tatiller ve özel günler. Çakışma kuralı Studio ile aynı: iptal, tamamlanmış ve arşivdeki kayıtlar sayılmaz; uç uca değmek çakışma değildir. Aralık en çok 62 gün; tarihler YYYY-AA-GG, İstanbul saati.' . MCP_BELIRSIZLIK,
            'inputSchema' => $nesne([
                'baslangic_tarihi' => $tarih('Aralığın ilk günü'),
                'bitis_tarihi' => $tarih('Aralığın son günü (dahil)'),
                'musteri_id' => $id('Yalnız bu müşterinin kayıtları (isteğe bağlı).'),
            ], ['baslangic_tarihi', 'bitis_tarihi']),
            'outputSchema' => $nesne([
                'etkinlikler' => ['type' => 'array', 'items' => $etkinlik],
                'bloklar' => ['type' => 'array', 'items' => $blok],
                'teslimler' => ['type' => 'array', 'items' => $nesne([
                    'tarih' => ['type' => 'string'], 'icerik_id' => ['type' => 'string'], 'baslik' => ['type' => 'string'],
                    'musteri_id' => ['type' => 'string'], 'musteri_adi' => $nullMetin, 'tur' => ['type' => 'string'], 'durum' => ['type' => 'string'],
                ], ['tarih', 'icerik_id', 'baslik', 'musteri_id'], false)],
                'paylasimlar' => ['type' => 'array', 'items' => $nesne([
                    'tarih' => ['type' => 'string'], 'musteri_id' => ['type' => 'string'], 'musteri_adi' => $nullMetin,
                    'tur' => ['type' => 'string'], 'icerik_id' => $nullMetin, 'baslik' => $nullMetin,
                ], ['tarih', 'musteri_id', 'tur'], false)],
                'ozel_gunler' => ['type' => 'array', 'items' => $nesne([
                    'tarih' => ['type' => 'string'], 'ad' => ['type' => 'string'], 'tur' => ['type' => 'string', 'enum' => ['tatil', 'ozel', 'dogum']],
                    'yarim_gun' => ['type' => 'boolean'],
                ], ['tarih', 'ad', 'tur'], false)],
                'notlar' => ['type' => 'array', 'items' => ['type' => 'string']],
            ], ['etkinlikler', 'bloklar', 'teslimler', 'paylasimlar', 'ozel_gunler']),
            'annotations' => ['title' => 'Takvim'] + $okuma,
            '_kapsam' => MCP_KAPSAM_OKU, '_isleyici' => 'arka', '_capraz' => 'mcp_capraz_takvim',
        ],
        [
            'name' => 'studio_icerik_listele',
            'title' => 'İçerikleri listele',
            'description' => 'İçerikleri (reels, video, post, story, diğer) müşteriye, duruma ve tarih aralığına göre listeler. Tarih aralığı teslim ya da plan tarihine uygulanır. En çok 100 kayıt.',
            'inputSchema' => $nesne([
                'musteri_id' => $id('Yalnız bu müşterinin içerikleri.'),
                'durum' => ['type' => 'string', 'enum' => MCP_ICERIK_DURUMLARI, 'description' => 'Yalnız bu durumdakiler.'],
                'tarih_baslangic' => $tarih('Teslim / plan tarihi bundan önce olmayanlar'),
                'tarih_bitis' => $tarih('Teslim / plan tarihi bundan sonra olmayanlar'),
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100, 'default' => 50, 'description' => 'En çok kayıt (varsayılan 50).'],
            ], []),
            'outputSchema' => $nesne(['icerikler' => ['type' => 'array', 'items' => $icerik], 'toplam' => ['type' => 'integer']], ['icerikler', 'toplam']),
            'annotations' => ['title' => 'İçerikleri listele'] + $okuma,
            '_kapsam' => MCP_KAPSAM_OKU, '_isleyici' => 'arka', '_capraz' => 'mcp_capraz_icerik_listele',
        ],
        [
            'name' => 'studio_musteri_olustur',
            'title' => 'Müşteri oluştur',
            'description' => 'Yeni müşteri kaydı açar. Yalnız kullanıcı açıkça yeni müşteri istediyse kullan (bir adı bulamadın diye müşteri açma; sor). Aynı ad ve kurumla bir müşteri zaten varsa yenisini açmaz; mevcut kaydı ve bir uyarı döndürür. Ücret bu araçla girilmez.',
            'inputSchema' => $nesne([
                'ad' => $metin(120, 'Müşteri adı.', 1),
                'kurum' => $metin(120, 'Kurum / marka (isteğe bağlı).'),
                'not' => $metin(2000, 'Kısa not.'),
                'istek_anahtari' => $anahtar,
            ], ['ad', 'istek_anahtari']),
            'outputSchema' => $nesne([
                'durum' => ['type' => 'string', 'enum' => ['olusturuldu', 'zaten_vardi']],
                'musteri' => $musteri, 'uyari' => $nullMetin,
            ], ['durum', 'musteri', 'uyari']),
            'annotations' => ['title' => 'Müşteri oluştur'] + $ekleme,
            '_kapsam' => MCP_KAPSAM_YAZ, '_isleyici' => 'arka',
        ],
        [
            'name' => 'studio_cekim_olustur',
            'title' => 'Çekim / etkinlik oluştur',
            'description' => 'Takvime çekim, toplantı ya da başka bir etkinlik ekler. Müşteri: musteri_id ya da musteri_adi (tam ad); müşterisiz etkinlik için musteri_id: null. Saatli etkinlikte baslangic_saati ve ya bitis_saati ya da sure_dakika gerekir; tüm gün etkinlikte saat verilmez. Takvimdeki başka bir etkinlik ya da edit bloğuyla çakışıyorsa ve cakismayi_onayla true değilse KAYDETMEZ, çakışanları döndürür: kullanıcıya sor. Aynı müşteri, aynı başlangıç ve aynı başlıkla bir kayıt zaten varsa yenisini açmaz.' . MCP_BELIRSIZLIK,
            'inputSchema' => $nesne($cekimAlanlari + ['musteri_adi' => $musteriAdi, 'istek_anahtari' => $anahtar], ['baslik', 'tur', 'tarih', 'istek_anahtari']),
            'outputSchema' => $nesne([
                'durum' => ['type' => 'string', 'enum' => ['olusturuldu', 'zaten_vardi', 'cakisma']],
                'etkinlik' => ['anyOf' => [$etkinlik, ['type' => 'null']]],
                'cakisanlar' => ['type' => 'array', 'items' => $cakisan],
                'mesaj' => ['type' => 'string'],
            ], ['durum', 'etkinlik', 'cakisanlar', 'mesaj']),
            'annotations' => ['title' => 'Çekim / etkinlik oluştur'] + $ekleme,
            '_kapsam' => MCP_KAPSAM_YAZ, '_isleyici' => 'arka', '_capraz' => 'mcp_capraz_cekim',
        ],
        [
            'name' => 'studio_icerik_olustur',
            'title' => 'İçerik oluştur',
            'description' => "Bir müşteri için içerik kaydı (reels, video, post, story, diğer) açar; teslim_tarihi (kurgu teslimi), plan_tarihi (paylaşım) ve cekim_id (bağlı çekim) verilebilir. Müşteri: musteri_id ya da musteri_adi (tam ad). adet 1 ise hemen kaydeder. adet 1'den büyükse KAYDETMEZ: önizleme ve onay_kodu döndürür; kullanıcı açıkça onaylarsa studio_toplu_uygula ile uygula." . MCP_BELIRSIZLIK,
            'inputSchema' => $nesne(['musteri_id' => $icerikAlanlari['musteri_id'], 'musteri_adi' => $musteriAdi] + $icerikAlanlari + [
                'adet' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50, 'default' => 1, 'description' => 'Kaç içerik (1 = hemen kaydet; fazlası önizleme + onay).'],
                'istek_anahtari' => $anahtar,
            ], ['baslik', 'tur', 'istek_anahtari']),
            '_capraz' => 'mcp_capraz_icerik',
            'outputSchema' => $nesne([
                'durum' => ['type' => 'string', 'enum' => ['olusturuldu', 'zaten_vardi', 'onay_gerekli']],
                'icerik' => ['anyOf' => [$icerik, ['type' => 'null']]],
                'onizleme' => ['anyOf' => [$onizlemeCikti, ['type' => 'null']]],
                'onay_kodu' => $nullMetin,
                'son_gecerlilik' => $nullMetin,
            ], ['durum', 'icerik', 'onizleme', 'onay_kodu', 'son_gecerlilik']),
            'annotations' => ['title' => 'İçerik oluştur'] + $ekleme,
            '_kapsam' => MCP_KAPSAM_YAZ, '_isleyici' => 'arka',
        ],
        [
            'name' => 'studio_edit_zamani_ayir',
            'title' => 'Edit zamanı ayır',
            'description' => "Bir müşterinin içerikleri için takvimde edit (kurgu) zamanı, yani çalışma bloğu ayırır. icerik_idler aynı müşterinin içerikleri olmalı (studio_icerik_listele). İçeriklerin durumu değişmez. Takvimdeki bir çekim, etkinlik ya da başka bir blokla çakışıyorsa ve cakismayi_onayla true değilse KAYDETMEZ, çakışanları döndürür: kullanıcıya sor." . MCP_BELIRSIZLIK,
            'inputSchema' => $nesne([
                'musteri_id' => $id('Blokun müşterisi (studio_musteri_ara). musteri_adi ile birlikte verilmez.'),
                'musteri_adi' => $musteriAdi,
                'icerik_idler' => ['type' => 'array', 'minItems' => 1, 'maxItems' => 50, 'items' => $id('İçerik id.'), 'description' => 'Bu blokta çalışılacak içerikler (1–50, hepsi aynı müşterinin).'],
                'tarih' => $tarih('Başlangıç tarihi'),
                'baslangic_saati' => $saat('Başlangıç saati'),
                'bitis_saati' => $saat('Bitiş saati; sure_dakika ile birlikte verilmez'),
                'sure_dakika' => ['type' => 'integer', 'minimum' => 15, 'maximum' => 720, 'description' => 'Süre (dakika); bitis_saati yerine.'],
                'bitis_tarihi' => $tarih('Gece yarısını aşan bloğun bitiş tarihi'),
                'baslik' => $metin(200, 'Blok başlığı (isteğe bağlı; boşsa Studio içeriklerden üretir).'),
                'not' => $metin(2000, 'Kısa not.'),
                'cakismayi_onayla' => ['type' => 'boolean', 'default' => false, 'description' => 'Yalnız kullanıcı çakışmayı açıkça kabul ettiyse true.'],
                'istek_anahtari' => $anahtar,
            ], ['icerik_idler', 'tarih', 'baslangic_saati', 'istek_anahtari']),
            'outputSchema' => $nesne([
                'durum' => ['type' => 'string', 'enum' => ['olusturuldu', 'zaten_vardi', 'cakisma']],
                'blok' => ['anyOf' => [$blok, ['type' => 'null']]],
                'cakisanlar' => ['type' => 'array', 'items' => $cakisan],
                'mesaj' => ['type' => 'string'],
            ], ['durum', 'blok', 'cakisanlar', 'mesaj']),
            'annotations' => ['title' => 'Edit zamanı ayır'] + $ekleme,
            '_kapsam' => MCP_KAPSAM_YAZ, '_isleyici' => 'arka', '_capraz' => 'mcp_capraz_blok',
        ],
        [
            'name' => 'studio_icerik_durum_guncelle',
            'title' => 'İçerik durumunu güncelle',
            'description' => 'Bir içeriğin durumunu değiştirir (ör. kurguda → onayda). beklenen_surum, kaydın en son okunan sürümü olmalı (studio_icerik_listele). Kayıt bu arada değiştiyse (ör. panelden) HİÇBİR ŞEY YAZMAZ: hata (409 sürüm uyuşmazlığı) ve güncel kaydı döndürür; kullanıcıya güncel hali göster ve sor.',
            'inputSchema' => $nesne([
                'icerik_id' => $id('İçerik id.'),
                'yeni_durum' => ['type' => 'string', 'enum' => MCP_ICERIK_DURUMLARI, 'description' => 'Yeni durum.'],
                'beklenen_surum' => $surum,
                'not' => $metin(500, 'Geçmişe eklenecek kısa not.'),
            ], ['icerik_id', 'yeni_durum', 'beklenen_surum']),
            'outputSchema' => $nesne([
                'durum' => ['type' => 'string', 'enum' => ['guncellendi', 'surum_uyusmadi', 'degisiklik_yok']],
                'icerik' => $icerik,
            ], ['durum', 'icerik']),
            'annotations' => ['title' => 'İçerik durumunu güncelle'] + $degistirme,
            '_kapsam' => MCP_KAPSAM_YAZ, '_isleyici' => 'arka',
        ],
        [
            'name' => 'studio_cekim_durum_guncelle',
            'title' => 'Çekim durumunu güncelle',
            'description' => 'Bir çekimin / etkinliğin durumunu planlandi, tamamlandi ya da iptal yapar. beklenen_surum, kaydın en son okunan sürümü olmalı (studio_takvim). Kayıt bu arada değiştiyse HİÇBİR ŞEY YAZMAZ: hata (409 sürüm uyuşmazlığı) ve güncel kaydı döndürür; kullanıcıya sor.',
            'inputSchema' => $nesne([
                'cekim_id' => $id('Çekim / etkinlik id.'),
                'yeni_durum' => ['type' => 'string', 'enum' => MCP_ETKINLIK_DURUMLARI, 'description' => 'Yeni durum.'],
                'beklenen_surum' => $surum,
            ], ['cekim_id', 'yeni_durum', 'beklenen_surum']),
            'outputSchema' => $nesne([
                'durum' => ['type' => 'string', 'enum' => ['guncellendi', 'surum_uyusmadi', 'degisiklik_yok']],
                'etkinlik' => $etkinlik,
            ], ['durum', 'etkinlik']),
            'annotations' => ['title' => 'Çekim durumunu güncelle'] + $degistirme,
            '_kapsam' => MCP_KAPSAM_YAZ, '_isleyici' => 'arka',
        ],
        [
            'name' => 'studio_toplu_onizle',
            'title' => 'Toplu işlem önizlemesi',
            'description' => "1–50 işlemi doğrular ve önizler; HİÇBİR ŞEY YAZMAZ. Her işlem bir nesnedir: islem alanı icerik_olustur, cekim_olustur, icerik_durum ya da cekim_durum; diğer alanlar ilgili tekil aracınkiyle aynıdır (istek_anahtari ve musteri_adi yok: musteri_id ver). Çakışan çekim, eksik / yanlış müşteri ya da eski sürüm hata satırı olur. Hepsi geçerliyse 15 dakika geçerli, tek kullanımlık bir onay_kodu döner. Önizlemeyi kullanıcıya göster; yalnız kullanıcı açıkça onaylarsa studio_toplu_uygula'yı çağır.",
            'inputSchema' => $nesne(['islemler' => ['type' => 'array', 'minItems' => 1, 'maxItems' => 50, 'items' => $topluOge, 'description' => 'Uygulanacak işlemler (1–50).']], ['islemler']),
            'outputSchema' => $onizlemeCikti,
            'annotations' => ['title' => 'Toplu işlem önizlemesi'] + $okuma,
            '_kapsam' => MCP_KAPSAM_YAZ, '_isleyici' => 'ic',
        ],
        [
            'name' => 'studio_toplu_uygula',
            'title' => 'Toplu işlemi uygula',
            'description' => "studio_toplu_onizle'nin (ya da adet > 1 ile studio_icerik_olustur'un) verdiği onay_kodu ile işlemleri tek seferde uygular: hepsi ya da hiçbiri. Uygulamadan önce Studio'nun otomatik kopyası alınır ('Sohbet toplu işlemi öncesi'; Ayarlar → Otomatik kopyalar'dan geri yüklenebilir). Yalnız kullanıcı önizlemeyi açıkça onayladıktan sonra çağır. Aynı kod yeniden gönderilirse işlem tekrarlanmaz; ilk sonuç döner.",
            'inputSchema' => $nesne(['onay_kodu' => ['type' => 'string', 'pattern' => '^[A-Za-z0-9_-]{20,64}$', 'description' => 'studio_toplu_onizle yanıtındaki onay_kodu.']], ['onay_kodu']),
            'outputSchema' => $nesne([
                'durum' => ['type' => 'string', 'enum' => ['uygulandi', 'daha_once_uygulandi', 'basarisiz']],
                'mesaj' => ['type' => 'string'],
                'sonuc' => ['type' => 'object'],
                'etkilenen' => ['type' => 'array', 'items' => ['type' => 'string']],
                'anlik_id' => $nullMetin,
            ], ['durum', 'mesaj', 'sonuc', 'etkilenen', 'anlik_id']),
            'annotations' => ['title' => 'Toplu işlemi uygula'] + $degistirme,
            '_kapsam' => MCP_KAPSAM_YAZ, '_isleyici' => 'ic',
        ],
    ];
    return $liste;
}

function mcp_arac_bul(string $ad): ?array {
    foreach (mcp_araclar() as $a) if ($a['name'] === $ad) return $a;
    return null;
}
/** tools/list icin: ic anahtarlar cikarilir, bos nesneler {} olur. */
function mcp_arac_listesi(): array {
    return array_map(function ($a) {
        $a = array_filter($a, fn ($k) => $k[0] !== '_', ARRAY_FILTER_USE_KEY);
        return mcp_nesneye($a);
    }, mcp_araclar());
}
/** JSON'da {} olmasi gereken bos PHP dizilerini (properties, annotations...) stdClass yapar. */
function mcp_nesneye($v, ?string $anahtar = null) {
    if (!is_array($v)) return $v;
    if ($v === []) return in_array($anahtar, ['properties', 'arguments', 'structuredContent', 'sonuc', 'capabilities', 'tools'], true) ? new stdClass() : [];
    $sonuc = [];
    foreach ($v as $k => $x) $sonuc[$k] = mcp_nesneye($x, is_string($k) ? $k : $anahtar);
    return $sonuc;
}

/* ---------------- JSON Schema (alt kume) ---------------- */

function mcp_tur_adi(string $t): string {
    return ['object' => 'nesne', 'array' => 'liste', 'string' => 'metin', 'integer' => 'tam sayı', 'number' => 'sayı', 'boolean' => 'true / false', 'null' => 'null'][$t] ?? $t;
}
function mcp_tur_uyar($v, string $t): bool {
    return match ($t) {
        'object' => is_array($v) && ($v === [] || !array_is_list($v)) || $v instanceof stdClass,
        'array' => is_array($v) && array_is_list($v),
        'string' => is_string($v),
        'integer' => is_int($v) || (is_float($v) && is_finite($v) && floor($v) === $v && abs($v) < 9.0e15),
        'number' => is_int($v) || is_float($v),
        'boolean' => is_bool($v),
        'null' => $v === null,
        default => false,
    };
}
/**
 * Degeri semaya gore dogrular ve normallestirir (tam sayi gibi gelen 3.0 -> 3; eksik isteğe bagli alanlara 'default').
 * Desteklenenler: type (tek ya da liste), properties, required, additionalProperties (false), enum, const, minLength,
 * maxLength, pattern, format (date, date-time), minimum, maximum, minItems, maxItems, items, oneOf (islem const ile secim),
 * anyOf. $hatalar'a Turkce iletiler eklenir.
 */
function mcp_sema_uygula($v, array $s, string $yol, array &$hatalar) {
    $ad = $yol === '' ? 'girdi' : $yol;
    if (isset($s['anyOf'])) {
        foreach ($s['anyOf'] as $alt) { $h = []; $n = mcp_sema_uygula($v, $alt, $yol, $h); if (!$h) return $n; }
        $hatalar[] = "$ad: izin verilen biçimlerden hiçbirine uymuyor";
        return $v;
    }
    if (isset($s['oneOf'])) {
        $secim = null;
        if (is_array($v) && isset($v['islem']) && is_string($v['islem'])) {
            foreach ($s['oneOf'] as $alt) if (($alt['properties']['islem']['const'] ?? null) === $v['islem']) $secim = $alt;
        }
        if ($secim === null) {
            $gecen = [];
            foreach ($s['oneOf'] as $alt) { $h = []; $n = mcp_sema_uygula($v, $alt, $yol, $h); if (!$h) $gecen[] = $n; }
            if (count($gecen) === 1) return $gecen[0];
            $hatalar[] = "$ad: islem alanı icerik_olustur, cekim_olustur, icerik_durum ya da cekim_durum olmalı";
            return $v;
        }
        return mcp_sema_uygula($v, $secim, $yol, $hatalar);
    }
    if (array_key_exists('const', $s) && $v !== $s['const']) { $hatalar[] = "$ad: " . json_encode($s['const'], JSON_UNESCAPED_UNICODE) . ' olmalı'; return $v; }
    if (isset($s['type'])) {
        $turler = (array)$s['type'];
        $uyan = null;
        foreach ($turler as $t) if (mcp_tur_uyar($v, $t)) { $uyan = $t; break; }
        if ($uyan === null) { $hatalar[] = "$ad: " . implode(' ya da ', array_map('mcp_tur_adi', $turler)) . ' olmalı'; return $v; }
        if ($uyan === 'integer' && is_float($v)) $v = (int)$v;
    }
    if (isset($s['enum']) && !in_array($v, $s['enum'], true)) { $hatalar[] = "$ad: şunlardan biri olmalı: " . implode(', ', array_map(fn ($x) => is_string($x) ? $x : json_encode($x), $s['enum'])); return $v; }
    if (is_string($v)) {
        $uzunluk = mb_strlen($v, 'UTF-8');
        if (!mb_check_encoding($v, 'UTF-8')) { $hatalar[] = "$ad: geçersiz karakter kodlaması"; return $v; }
        if (isset($s['minLength']) && $uzunluk < $s['minLength']) $hatalar[] = $s['minLength'] === 1 ? "$ad: boş olamaz" : "$ad: en az {$s['minLength']} karakter olmalı";
        if (isset($s['maxLength']) && $uzunluk > $s['maxLength']) $hatalar[] = "$ad: en çok {$s['maxLength']} karakter olmalı";
        if (isset($s['format']) && $s['format'] === 'date') {
            if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) { $hatalar[] = "$ad: geçerli bir YYYY-AA-GG tarihi olmalı"; return $v; }
            // Studio takvimi 2000-2099 arasini tanir (core makulTarih): 0001-01-01 gibi bicimce gecerli ama anlamsiz tarih yazilmaz
            if ($v < '2000-01-01' || $v > '2099-12-31') { $hatalar[] = "$ad: 2000-01-01 ile 2099-12-31 arasında olmalı"; return $v; }
        } elseif (isset($s['format']) && $s['format'] === 'date-time') {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/', $v)) { $hatalar[] = "$ad: tarih-saat (RFC 3339) olmalı"; return $v; }
        }
        if (isset($s['pattern']) && !preg_match('/' . str_replace('/', '\/', $s['pattern']) . '/u', $v)) {
            $hatalar[] = "$ad: " . (isset($s['format']) ? 'biçimi geçersiz' : (str_contains($s['pattern'], '[01][0-9]') ? 'SS:DD (00:00–23:59) olmalı' : 'biçimi geçersiz'));
        }
    }
    if ((is_int($v) || is_float($v)) && !is_bool($v)) {
        if (isset($s['minimum']) && $v < $s['minimum']) $hatalar[] = "$ad: en az {$s['minimum']} olmalı";
        if (isset($s['maximum']) && $v > $s['maximum']) $hatalar[] = "$ad: en çok {$s['maximum']} olmalı";
    }
    $tur = is_array($v) ? (array_is_list($v) && $v !== [] ? 'array' : (in_array('array', (array)($s['type'] ?? []), true) && $v === [] ? 'array' : 'object')) : null;
    if ($tur === 'array') {
        if (isset($s['minItems']) && count($v) < $s['minItems']) $hatalar[] = "$ad: en az {$s['minItems']} öğe olmalı";
        if (isset($s['maxItems']) && count($v) > $s['maxItems']) { $hatalar[] = "$ad: en çok {$s['maxItems']} öğe olmalı"; return $v; }
        if (isset($s['items'])) foreach ($v as $i => $x) $v[$i] = mcp_sema_uygula($x, $s['items'], $yol . '[' . $i . ']', $hatalar);
    } elseif ($tur === 'object' && (isset($s['properties']) || isset($s['required']) || array_key_exists('additionalProperties', $s))) {
        $ozellik = $s['properties'] ?? [];
        foreach ((array)($s['required'] ?? []) as $z) if (!array_key_exists($z, $v)) $hatalar[] = ($yol === '' ? '' : "$yol.") . "$z: zorunlu alan eksik";
        foreach ($v as $k => $x) {
            $ky = $yol === '' ? (string)$k : "$yol.$k";
            if (isset($ozellik[$k])) $v[$k] = mcp_sema_uygula($x, $ozellik[$k], $ky, $hatalar);
            elseif (($s['additionalProperties'] ?? true) === false) $hatalar[] = "$ky: bilinmeyen alan";
        }
        foreach ($ozellik as $k => $alt) if (!array_key_exists($k, $v) && array_key_exists('default', $alt)) $v[$k] = $alt['default'];
    }
    return $v;
}

/**
 * Cikti degerini JSON'a hazirlar: semada nesne olan bos PHP dizileri {} olur (PHP'de [] ile {} ayni gorunur).
 * anyOf'ta degere uyan ilk dal izlenir.
 */
function mcp_cikti_bicimle($v, array $s) {
    if (isset($s['anyOf'])) {
        foreach ($s['anyOf'] as $alt) { $h = []; mcp_sema_uygula($v, $alt, '', $h); if (!$h) return mcp_cikti_bicimle($v, $alt); }
        return $v;
    }
    if (!is_array($v)) return $v;
    $turler = (array)($s['type'] ?? []);
    if ($v === []) return in_array('object', $turler, true) && !in_array('array', $turler, true) ? new stdClass() : [];
    if (array_is_list($v)) {
        if (isset($s['items'])) foreach ($v as $i => $x) $v[$i] = mcp_cikti_bicimle($x, $s['items']);
        return $v;
    }
    foreach ($v as $k => $x) if (isset($s['properties'][$k])) $v[$k] = mcp_cikti_bicimle($x, $s['properties'][$k]);
    return $v;
}

/* ---------------- Capraz kurallar (arka uca gitmeden) ---------------- */

function mcp_gun_farki(string $a, string $b): int {
    return (int)round((strtotime($b . ' 00:00:00 UTC') - strtotime($a . ' 00:00:00 UTC')) / 86400);
}
function mcp_capraz_takvim(array $g): ?string {
    $f = mcp_gun_farki($g['baslangic_tarihi'], $g['bitis_tarihi']);
    if ($f < 0) return 'bitis_tarihi, baslangic_tarihi\'nden önce olamaz.';
    if ($f + 1 > MCP_TAKVIM_EN_COK_GUN) return 'Tarih aralığı en çok ' . MCP_TAKVIM_EN_COK_GUN . ' gün olabilir.';
    return null;
}
function mcp_capraz_icerik_listele(array $g): ?string {
    if (isset($g['tarih_baslangic'], $g['tarih_bitis']) && $g['tarih_bitis'] < $g['tarih_baslangic']) return 'tarih_bitis, tarih_baslangic\'tan önce olamaz.';
    return null;
}
/** Musteri: musteri_id (cekimde null olabilir) ya da musteri_adi'ndan tam olarak biri. */
function mcp_capraz_musteri(array $g, bool $bosOlur): ?string {
    $id = array_key_exists('musteri_id', $g);
    $ad = array_key_exists('musteri_adi', $g);
    if ($id && $ad) return 'musteri_id ve musteri_adi birlikte verilmez; birini ver.';
    if (!$id && !$ad) return 'musteri_id ya da musteri_adi gerekli' . ($bosOlur ? ' (müşterisiz etkinlik için musteri_id: null).' : '.');
    if ($id && $g['musteri_id'] === null && !$bosOlur) return 'musteri_id gerekli.';
    return null;
}
function mcp_capraz_icerik(array $g): ?string { return mcp_capraz_musteri($g, false); }
/** Edit blogu: musteri + saat / sure tutarliligi (tum gun yok). */
function mcp_capraz_blok(array $g): ?string { return mcp_capraz_musteri($g, false) ?? mcp_capraz_zaman($g); }
/** Cekim / etkinlik: musteri + saat. Toplu islemde musteri_id her zaman vardir (sema). */
function mcp_capraz_cekim(array $g): ?string { return mcp_capraz_musteri($g, true) ?? mcp_capraz_zaman($g); }
/** Saat / sure / tum gun tutarliligi. Muğlak ya da eksik saat: yazma, sor. */
function mcp_capraz_zaman(array $g): ?string {
    $tumGun = ($g['tum_gun'] ?? false) === true;
    $bas = $g['baslangic_saati'] ?? null;
    $bit = $g['bitis_saati'] ?? null;
    $sure = $g['sure_dakika'] ?? null;
    $bitTarih = $g['bitis_tarihi'] ?? null;
    if ($bitTarih !== null && $bitTarih < $g['tarih']) return 'bitis_tarihi, tarih\'ten önce olamaz.';
    if ($tumGun) {
        if ($bas !== null || $bit !== null || $sure !== null) return 'Tüm gün etkinlikte baslangic_saati, bitis_saati ve sure_dakika verilmez.';
        return null;
    }
    if ($bas === null) return 'Saatli etkinlikte baslangic_saati gerekli. Saat belli değilse tahmin etme, kullanıcıya sor; tum_gun: true yalnız kullanıcı açıkça tüm gün dediyse.';
    if (($bit === null) === ($sure === null)) return 'bitis_saati ya da sure_dakika alanlarından tam olarak biri verilmeli.';
    if ($sure !== null && $bitTarih !== null && $bitTarih !== $g['tarih']) return 'sure_dakika ile birlikte farklı bir bitis_tarihi verilmez.';
    if ($bit !== null && ($bitTarih ?? $g['tarih']) . ' ' . $bit <= $g['tarih'] . ' ' . $bas) return 'Bitiş, başlangıçtan sonra olmalı.';
    return null;
}

/* ---------------- Yerlesik araclar ---------------- */

function mcp_gun_adi(DateTimeInterface $d): string {
    return [1 => 'Pazartesi', 2 => 'Salı', 3 => 'Çarşamba', 4 => 'Perşembe', 5 => 'Cuma', 6 => 'Cumartesi', 7 => 'Pazar'][(int)$d->format('N')];
}
function mcp_arac_bugun(): McpSonuc {
    $simdi = (new DateTimeImmutable('@' . mcp_zaman()))->setTimezone(mcp_istanbul());
    $bugun = $simdi->setTime(0, 0);
    $aylar = [1 => 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    $gunler = [];
    for ($i = 0; $i < 14; $i++) {
        $d = $bugun->modify("+$i day");
        $gunler[] = ['tarih' => $d->format('Y-m-d'), 'gun_adi' => mcp_gun_adi($d),
            'goreli' => [0 => 'bugün', 1 => 'yarın', 2 => 'öbür gün'][$i] ?? "$i gün sonra"];
    }
    $veri = [
        'saat_dilimi' => 'Europe/Istanbul',
        'simdi' => $simdi->format(DATE_ATOM),
        'tarih' => $simdi->format('Y-m-d'),
        'saat' => $simdi->format('H:i'),
        'gun_adi' => mcp_gun_adi($simdi),
        'hafta_baslangici' => $bugun->modify('-' . ((int)$bugun->format('N') - 1) . ' day')->format('Y-m-d'),
        'gunler' => $gunler,
    ];
    $metin = 'Bugün ' . (int)$simdi->format('j') . ' ' . $aylar[(int)$simdi->format('n')] . ' ' . $simdi->format('Y') . ' ' . $veri['gun_adi'] . ', saat ' . $veri['saat'] . ' (İstanbul).';
    return McpSonuc::tamam($veri, $metin);
}

/* ---------------- Toplu onay akisi ---------------- */

/** studio_toplu_onizle cikti nesnesi. Sema + capraz kurallar + arka uc dogrulamasi; gecerliyse onay kodu. Hicbir Studio kaydi yazmaz. */
function mcp_toplu_onizle(array $islemler, McpBaglam $b): array {
    $bos = fn (array $satirlar, array $uyarilar = []) => ['gecerli' => false, 'satirlar' => $satirlar, 'uyarilar' => $uyarilar, 'onay_kodu' => null, 'son_gecerlilik' => null];
    $sema = mcp_arac_bul('studio_toplu_onizle')['inputSchema'];
    $hatalar = [];
    $norm = mcp_sema_uygula(['islemler' => $islemler], $sema, '', $hatalar);
    $satirlar = [];
    if (!$hatalar) {
        foreach ($norm['islemler'] as $i => $op) {
            $h = $op['islem'] === 'cekim_olustur' ? mcp_capraz_cekim($op) : null;
            if ($h !== null) $hatalar[] = "islemler[$i]: $h";
        }
    }
    if ($hatalar) {
        foreach (array_slice($hatalar, 0, 50) as $i => $h) $satirlar[] = ['sira' => $i, 'islem' => 'dogrulama', 'ozet' => 'Girdi geçersiz', 'durum' => 'hata', 'mesaj' => $h];
        return $bos($satirlar, ['Hiçbir şey yazılmadı. Hatalı alanları düzeltip yeniden önizle.']);
    }
    $d = mcp_arka()->toplu_dogrula($norm['islemler'], $b);
    $satirlar = [];
    foreach ((array)($d['satirlar'] ?? []) as $i => $s) {
        $satirlar[] = [
            'sira' => (int)($s['sira'] ?? $i), 'islem' => (string)($s['islem'] ?? ''), 'ozet' => mcp_kisalt((string)($s['ozet'] ?? ''), 300),
            'durum' => in_array($s['durum'] ?? '', ['gecerli', 'uyari', 'hata'], true) ? $s['durum'] : 'hata',
            'mesaj' => isset($s['mesaj']) ? mcp_kisalt((string)$s['mesaj'], 500) : null,
        ];
    }
    $uyarilar = array_values(array_map(fn ($x) => mcp_kisalt((string)$x, 500), (array)($d['uyarilar'] ?? [])));
    $gecerli = ($d['gecerli'] ?? false) === true && !array_filter($satirlar, fn ($s) => $s['durum'] === 'hata');
    if (!$gecerli) return $bos($satirlar, $uyarilar);
    $k = mcp_toplu_kod_ver($b->izin_id, $norm['islemler']);
    return ['gecerli' => true, 'satirlar' => $satirlar, 'uyarilar' => $uyarilar, 'onay_kodu' => $k['kod'], 'son_gecerlilik' => mcp_iso($k['son'])];
}

/** studio_toplu_uygula ciktisindaki 'sonuc' (semada nesne): bos ise stdClass ({}), JSON'da hicbir zaman [] olmaz. */
function mcp_toplu_sonuc_nesnesi($v) {
    $v = (array)$v;
    return $v === [] ? new stdClass() : $v;
}

/** studio_toplu_uygula: kod grant'e ve islem listesinin ozetine bagli; tek kullanimlik; ikinci kez gelirse ilk sonuc doner. */
function mcp_toplu_uygula(string $kod, McpBaglam $b): McpSonuc {
    $oz = mcp_ozet($kod);
    $n = mcp_zaman();
    [$durum, $r] = mcp_islem(function () use ($oz, $b, $n) {
        $r = mcp_tek('SELECT * FROM mcp_toplu WHERE kod_ozet = ?', [$oz]);
        if (!$r || !hash_equals((string)$r['izin'], $b->izin_id)) return ['yok', null];
        if ($r['durum'] === 'tamam' || $r['durum'] === 'basarisiz') return ['tekrar', $r];
        if ($r['durum'] === 'uygulaniyor' && (int)$r['alinma'] > $n - 120) return ['suruyor', null];
        if ($r['durum'] === 'bekliyor' && (int)$r['son'] < $n) return ['suresi', null];
        mcp_calistir("UPDATE mcp_toplu SET durum = 'uygulaniyor', alinma = ? WHERE kod_ozet = ?", [$n, $oz]);
        return ['al', $r];
    });
    if ($durum === 'yok') return McpSonuc::hata('Onay kodu geçersiz ya da bu bağlantıya ait değil. Önce studio_toplu_onizle ile yeni bir önizleme al.');
    if ($durum === 'suresi') return McpSonuc::hata('Onay kodunun süresi doldu (15 dakika). studio_toplu_onizle ile yeniden önizle ve kullanıcıya yeniden onaylat.');
    if ($durum === 'suruyor') return McpSonuc::hata('Bu toplu işlem şu an uygulanıyor. Biraz sonra aynı onay koduyla yeniden çağır; işlem tekrarlanmaz.');
    if ($durum === 'tekrar') {
        $veri = json_decode((string)$r['sonuc'], true) ?: [];
        // json_decode(..., true) bos nesneyi {} dizi [] yapar: 'sonuc' semada nesne, JSON'da yine {} olmali
        if (array_key_exists('sonuc', $veri)) $veri['sonuc'] = mcp_toplu_sonuc_nesnesi($veri['sonuc']);
        $ilk = $veri['durum'] ?? 'basarisiz';
        if ($ilk === 'uygulandi') $veri['durum'] = 'daha_once_uygulandi';
        return new McpSonuc($veri, 'Bu onay kodu daha önce kullanıldı; işlem tekrarlanmadı. İlk sonuç: ' . (string)($veri['mesaj'] ?? ''), $ilk !== 'uygulandi', [], 'Tekrar: ilk sonuc donduruldu');
    }
    $birak = fn () => mcp_calistir("UPDATE mcp_toplu SET durum = 'bekliyor', alinma = NULL WHERE kod_ozet = ? AND durum = 'uygulaniyor'", [$oz]);
    $kaydet = function (array $veri, bool $tamam) use ($oz) {
        mcp_calistir('UPDATE mcp_toplu SET durum = ?, sonuc = ? WHERE kod_ozet = ?', [$tamam ? 'tamam' : 'basarisiz', mcp_json_metin($veri), $oz]);
    };
    if (!hash_equals((string)$r['islem_ozeti'], mcp_ozet((string)$r['islemler']))) {
        $veri = ['durum' => 'basarisiz', 'mesaj' => 'Onay kaydı bozulmuş; hiçbir şey uygulanmadı.', 'sonuc' => new stdClass(), 'etkilenen' => [], 'anlik_id' => null];
        $kaydet($veri, false);
        return new McpSonuc($veri, $veri['mesaj'], true);
    }
    $islemler = json_decode((string)$r['islemler'], true);
    $anahtar = substr(hash('sha256', 'mcp|toplu|' . $b->izin_id . '|' . $oz), 0, 32);
    try {
        $s = mcp_arka()->toplu_uygula($islemler, $anahtar, $b);
    } catch (Throwable $e) {
        try { $birak(); } catch (Throwable $e2) {}
        if (mcp_mesgul_mu($e)) return McpSonuc::hata('Studio şu an meşgul. Birkaç saniye sonra aynı onay koduyla yeniden dene; işlem tekrarlanmaz.');
        error_log('suflo-mcp toplu_uygula: ' . get_class($e) . ': ' . $e->getMessage());
        return McpSonuc::hata('Toplu işlem uygulanamadı (sunucu hatası). Aynı onay koduyla yeniden denenebilir.');
    }
    $tamam = ($s['tamam'] ?? false) === true;
    $etkilenen = array_values(array_map('strval', (array)($s['etkilenen'] ?? [])));
    $veri = [
        'durum' => $tamam ? 'uygulandi' : 'basarisiz',
        'mesaj' => mcp_kisalt((string)($s['mesaj'] ?? ''), 1000),
        'sonuc' => mcp_toplu_sonuc_nesnesi($s['veri'] ?? []),
        'etkilenen' => $etkilenen,
        'anlik_id' => isset($s['anlik_id']) ? (string)$s['anlik_id'] : null,
    ];
    $kaydet($veri, $tamam);
    return new McpSonuc($veri, $veri['mesaj'], !$tamam, $tamam ? $etkilenen : [], 'Toplu: ' . count($islemler) . ' islem');
}
