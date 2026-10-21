<?php
declare(strict_types=1);
/*
 * Suflo Studio MCP: GERCEK arka uc (Studio veritabanina bagli). HENUZ BAGLANMADI.
 *
 * Bu yer tutucu bilerek "kurulmadi" der: onay sayfasi hicbir sifreyi kabul etmez, grant / jeton olusmaz, araclar
 * calismaz. Boylece dosyalar canliya erken yuklense bile hicbir sey acilmaz.
 *
 * Gercek uygulama (sonraki asama) bu dosyanin yerine yazilacak ve:
 *  - sahip_sifre_dene(): panelin sifre_dene($sifre, cihaz_ozeti()) kilidini AYNEN kullanir (panel kodu, cikis yapan
 *    hata() yerine durum donduren bir kitapliga ayrilmali); 'dogru'da sifre_izi(dogrulanan ozet) dondurur.
 *  - sahip_sifre_izi(): sifre_izi(sifre_ozeti()); sifre bossa null.
 *  - arac() / toplu_dogrula() / toplu_uygula(): panelin temizle(), kayit_yaz(), islem(), anlik_al() mantigiyla.
 * Sozlesme: server/studio-v1/mcp/README.md "Arka uc arayuzu". Bu dosya config 'mcp_arka' ile degistirilebilir.
 *
 * Kapsamdaki degiskenler: $C (config dizisi), $ozel (private/<uygulama>-v1 klasoru).
 */
if (!defined('SUFLO_MCP')) { http_response_code(404); exit; }

return new class implements McpSahipDogrulayici, McpStudioArka {
    public function sahip_sifre_dene(string $sifre): array { return ['durum' => 'kurulmadi', 'iz' => null]; }
    public function sahip_sifre_izi(): ?string { return null; }
    public function arac(string $ad, array $girdi, McpBaglam $b): McpSonuc {
        return McpSonuc::hata('Studio bağlantısı henüz kurulmadı.');
    }
    public function toplu_dogrula(array $islemler, McpBaglam $b): array {
        return ['gecerli' => false, 'satirlar' => [], 'uyarilar' => ['Studio bağlantısı henüz kurulmadı.']];
    }
    public function toplu_uygula(array $islemler, string $toplu_anahtar, McpBaglam $b): array {
        return ['tamam' => false, 'mesaj' => 'Studio bağlantısı henüz kurulmadı.', 'veri' => [], 'etkilenen' => [], 'anlik_id' => null];
    }
};
