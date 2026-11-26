<?php
return [
    'token_secret' => 'BU_ALANI_EN_AZ_64_RASTGELE_KARAKTERLE_DEGISTIR',
    'token_ttl' => 7200,
    // true: instance_id gondermeyen (3.0 oncesi) istemcilerin dosya istegi reddedilir.
    // Kullanicilar 3.0'a gecince ac.
    'require_instance' => false,
    'file_rate_per_min' => 600,
    'store_id' => 454844,
    'product_id' => 1302656,
    'variant_id' => 0,
    'content_root' => __DIR__ . '/content',
    'manifest_path' => __DIR__ . '/manifest.json',

    // ---- Davet et, kazan (uyuyan ozellik) ----
    // Lemon Squeezy API anahtari TUM MAGAZAYA yetkilidir (indirim, iade). Yalniz bu private
    // dosyada durur; GitHub'a, panele, ZIP'e asla girmez. Sizdigindan supheleniyorsan hemen
    // Lemon Squeezy > Settings > API'den sil ve yenisini olustur.
    'ls_api_key' => '',
    // Anahtari ekleyip ?d=KOD ile bir test-modu satin alimini bitirmeden true yapma.
    'referral_enabled' => false,
    'referral_percent' => 15,          // davet indirimi (%)
    'referral_max' => 50,              // bir kodun en cok kullanim sayisi
    'referral_variant_ids' => [],      // indirimin gecerli oldugu varyantlar (TRY ve USD), bos = kapali
    'referrals_path' => __DIR__ . '/referrals.json',
    'attribution_path' => __DIR__ . '/attribution.jsonl',
    'davet_dir' => __DIR__ . '/davet', // davet/t1 ve davet/t3 odul paketleri + manifest.json

    // ---- Meta Conversions API: Lemon Squeezy siparisi -> Purchase (uyuyan ozellik) ----
    // ls-webhook.php bu uc deger dolana ve meta_capi_enabled true olana dek 503 doner.
    // Belirtec ve sir yalniz bu private dosyada durur; GitHub'a, panele, ZIP'e asla girmez.
    // Kurulum adimlari: marketing/analytics-kurulum.md
    'meta_capi_enabled' => false,
    'meta_pixel_id' => '1084974704080878',   // "Suflo | Web ve Satin Alma" (gizli degil, sitede de yazar)
    'meta_capi_token' => '',                 // Events Manager > Ayarlar > Conversions API > erisim belirteci
    'ls_webhook_secret' => '',               // Lemon Squeezy > Settings > Webhooks > Signing secret (en az 16 karakter)
    'meta_test_event_code' => '',            // yalniz dogrulama sirasinda (Events Manager > Test events), sonra bosalt
    'meta_api_version' => 'v27.0',
    'meta_event_source_url' => 'https://suflo.app/',
    'meta_log_path' => __DIR__ . '/meta-webhook.log',
    'meta_sent_dir' => __DIR__ . '/meta-sent'
];
