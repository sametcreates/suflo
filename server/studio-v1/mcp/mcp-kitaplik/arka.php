<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP arka uc arayuzu (adapter). MCP katmani Studio kayitlarini bilmez; iki seyi bu arayuzden ister:
 *   1) Sahip dogrulama: onay sayfasindaki Studio sifresi PANELIN sifre_dene() kilidinden gecer (ayni sinirlar,
 *      ayni sayaclar). MCP kendi sifre denetimini YAPMAZ, kilidi asla gevsetmez ya da atlamaz.
 *   2) Arac isleyicileri: okuma / tekil yazma araclari ve toplu dogrula / uygula.
 * Gercek uygulama (Studio veritabanina bagli) mcp-kitaplik/arka-studio.php'dedir; testler config 'mcp_arka' ile sahte
 * bir arka uc verir. Ayrintili sozlesme: server/studio-v1/mcp/README.md "Arka uc arayuzu".
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

interface McpSahipDogrulayici {
    /**
     * Studio sifresini panelin kilitli denetiminden gecirir (deneme denetimden ONCE sayilir; kilitliyken sifre denenmez).
     * Doner: ['durum' => 'dogru' | 'yanlis' | 'kilitli' | 'kurulmadi', 'iz' => ?string]
     *   iz: yalniz 'dogru'da; denetlenen sifre ozetinin parmak izi (panelin sifre_izi(ozet) degeri).
     * Gecici hata (Studio veritabani mesgul): McpMesgulHatasi firlatir.
     */
    public function sahip_sifre_dene(string $sifre): array;

    /**
     * Su anki panel sifre parmak izi (panelde sifre_izi(sifre_ozeti())). Sifre hic ayarlanmadiysa null.
     * Her MCP isteginde ve jeton verirken cagrilir: degerin degismesi butun grant'leri gecersiz kilar.
     * Gecici hata: McpMesgulHatasi (null DONMEZ; null "sifre yok" demektir ve butun baglantilari keser).
     */
    public function sahip_sifre_izi(): ?string;
}

interface McpStudioArka {
    /**
     * Okuma ve tekil yazma araclari (studio_bugun ve studio_toplu_* MCP katmanindadir; buraya gelmez).
     * $girdi araç semasina gore DOGRULANMIS gelir (tur, bicim, zorunlu alan, uzunluk, enum; ek alan yok) ve
     * araca ozgu capraz kurallar (tarih araligi <= 62 gun, saat / sure tutarliligi) zaten denetlenmistir.
     * Is kurallari (musteri var mi, cakisma, mukerrer, surum) arka ucundur.
     * Doner: McpSonuc. Is hatasi: McpSonuc::hata(...) ya da McpAracHatasi; gecici hata: McpMesgulHatasi.
     */
    public function arac(string $ad, array $girdi, McpBaglam $b): McpSonuc;

    /**
     * Toplu islemleri dogrular, HICBIR SEY YAZMAZ.
     * Doner: ['gecerli' => bool, 'satirlar' => [['sira' => int, 'islem' => string, 'ozet' => string,
     *         'durum' => 'gecerli'|'uyari'|'hata', 'mesaj' => ?string], ...], 'uyarilar' => [string, ...]]
     */
    public function toplu_dogrula(array $islemler, McpBaglam $b): array;

    /**
     * Onaylanmis toplu islemleri uygular: once Studio otomatik kopyasi (anliklar, neden 'mcp_toplu_oncesi'), sonra
     * TEK islemde hepsi ya da hicbiri. $toplu_anahtar bu onay koduna ozgu ve sabittir: kayit kimlikleri bundan
     * turetilmeli (ornek: substr(sha256($toplu_anahtar . '|' . $sira), 0, 24)) ki yarida kesilen bir uygulamanin
     * yeniden denenmesi mukerrer kayit acmasin.
     * Doner: ['tamam' => bool, 'mesaj' => string, 'veri' => array, 'etkilenen' => [kimlik...], 'anlik_id' => ?string]
     * Gecici hata: McpMesgulHatasi (onay kodu yanmaz, ayni kodla yeniden denenebilir).
     */
    public function toplu_uygula(array $islemler, string $toplu_anahtar, McpBaglam $b): array;
}

/** Is hatasi (gecersiz musteri, bulunamayan kayit...): isError sonucu olur, mesaj modele / kullaniciya gosterilir. */
class McpAracHatasi extends RuntimeException {}

/** Arac sonucu. $veri structuredContent olur (araç outputSchema'sina uymali); $metin insan icin kisa ozet. */
final class McpSonuc {
    public function __construct(
        public array $veri = [],
        public ?string $metin = null,
        public bool $hata = false,
        public array $etkilenen = [],
        public string $ozet = ''
    ) {}
    /** Basarili sonuc. $etkilenen: yazilan / degisen kayit kimlikleri (gunluge yazilir). */
    public static function tamam(array $veri, ?string $metin = null, array $etkilenen = [], string $ozet = ''): self {
        return new self($veri, $metin, false, $etkilenen, $ozet);
    }
    /** Is hatasi (isError: true). $veri bos birakilabilir. */
    public static function hata(string $metin, array $veri = []): self {
        return new self($veri, $metin, true, [], $metin);
    }
}

/** Arac cagrisinin baglami: kim, hangi grant, hangi izinler. */
final class McpBaglam {
    public function __construct(
        public readonly string $izin_id,
        public readonly string $istemci_id,
        public readonly string $istemci_adi,
        public readonly array $kapsamlar,
        public readonly int $zaman,
        private readonly ?Closure $topluOnizleyici = null
    ) {}
    /** Tekil yazma araclarinda kayit kimligi: sha256('mcp|' + grant + '|' + istek_anahtari) ilk 24 hex. */
    public function kayit_kimligi(string $istek_anahtari): string {
        return substr(hash('sha256', 'mcp|' . $this->izin_id . '|' . $istek_anahtari), 0, 24);
    }
    public function yazabilir(): bool { return in_array(MCP_KAPSAM_YAZ, $this->kapsamlar, true); }
    /**
     * studio_toplu_onizle ile ayni yol: islemleri dogrular (sema + arka uc), gecerliyse onay kodu verir.
     * studio_icerik_olustur'da adet > 1 icin kullanilir. Doner: studio_toplu_onizle'nin cikti nesnesi.
     */
    public function toplu_onizle(array $islemler): array {
        if (!$this->topluOnizleyici) throw new LogicException('toplu onizleyici yok');
        return ($this->topluOnizleyici)($islemler);
    }
}

/** Arka ucu yukler (config 'mcp_arka', varsayilan mcp-kitaplik/arka-studio.php). Dosya her iki arayuzu de uygulayan bir nesne dondurur. */
function mcp_arka(): object {
    static $a = null;
    if ($a) return $a;
    $dosya = (string)mcp_c('mcp_arka');
    if ($dosya === '' || !is_file($dosya)) throw new McpKurulumHatasi('MCP arka uc dosyasi yok.');
    $a = (static function (string $dosya, array $C, string $ozel) { return require $dosya; })($dosya, $GLOBALS['__mcp']['C'], mcp_ortam('ozel'));
    if (!($a instanceof McpSahipDogrulayici) || !($a instanceof McpStudioArka)) {
        $a = null;
        throw new McpKurulumHatasi('MCP arka ucu arayuzleri uygulamiyor.');
    }
    return $a;
}
