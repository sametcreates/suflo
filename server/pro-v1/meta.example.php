<?php
// Meta Conversions API ayarlari: Lemon Squeezy siparisi -> Purchase (ls-webhook.php okur).
// Sunucuda private/pro-v1/meta.php adiyla durur. Pro icerik servisinin config.php'sinden bilerek
// AYRI: burada yapilan bir yazim hatasi yalniz webhook'u durdurur, lisans dogrulamayi ve icerik
// indirmeyi (index.php) etkilemez.
// Belirtec ve sir yalniz o private dosyada durur; GitHub'a, panele, ZIP'e, sohbete asla girmez.
// Kurulum adimlari: marketing/analytics-kurulum.md
return [
    'meta_capi_enabled' => false,            // uc deger dolup bu true olana dek ls-webhook.php 503 doner
    'meta_pixel_id' => '1084974704080878',   // "Suflo | Web ve Satin Alma" (gizli degil, sitede de yazar)
    'meta_capi_token' => '',                 // Events Manager > Ayarlar > Conversions API > erisim belirteci
    'ls_webhook_secret' => '',               // Lemon Squeezy > Settings > Webhooks > Signing secret (en az 16 karakter)
    'meta_test_event_code' => '',            // yalniz dogrulama sirasinda (Events Manager > Test events), sonra bosalt
    'meta_api_version' => 'v27.0',
    'meta_event_source_url' => 'https://suflo.app/',
    'meta_log_path' => __DIR__ . '/meta-webhook.log',
    'meta_sent_dir' => __DIR__ . '/meta-sent'
];
