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
    'davet_dir' => __DIR__ . '/davet'  // davet/t1 ve davet/t3 odul paketleri + manifest.json
];
