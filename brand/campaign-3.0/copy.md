# Suflo 3.0 — Instagram lansman karuseli (9 kare, 1080x1350)

## Ana reklam metni

Suflo 3.0 yayında. Kurgunun sıkıcı kısmını yapay zekâ yapsın.

Mevcut kullanıcılara ücretsiz güncelleme: panelde çıkan şeritten tek tıkla kur.

3.0'da yeni:

• Viral anlar: yapay zekâ uzun videodan kancayla başlayan 15–60 sn'lik anları bulur; tek tıkla her biri ayrı 9:16 Shorts sekansı olur
• Kanca başlığı: Shorts/Reels açılışına 5 stil başlık kartı (Kutu, Şerit, Sade, Neon, Etiket); AI 5 başlık önerir
• Konuşmadan kes: ııı, eee, hmm gibi dolgu seslerini, tekrarları ve duraksamaları temizler; sahne algılama + 13 geçiş
• Sesi iyileştir: uğultu ve oda gürültüsünü azaltır, sesi −14 LUFS'e getirir; dudak senkronu korunur, toplu klip desteği
• Anahtar kelime vurgusu: *kelime* ya da Ctrl+B ile altyazıda vurgu, tüm Suflo Stillerinde; 12 animasyonlu altyazı stili
• Daha fazlası: B-roll önerileri (Pexels/Pixabay), YouTube/Instagram/TikTok için açıklama + hashtag, 10+ dile çeviri ve çok dilli SRT paketi

AI altyazı çekirdeği ücretsiz ve sınırsız kalır. Pro; yukarıdakiler + 242 animasyon, 1.076 SFX, 290 preset ve 30 hareketli zemin.

Suflo Pro erken erişim fiyatı: 749 ₺ + KDV, tek ödeme, ömür boyu güncelleme. Erken erişim fiyatı v3 lansmanından 7 gün sonra bitiyor, sonra 1.249 ₺.

https://suflo.app

## Kısa reklam metni

Suflo 3.0: uzun videodan tek tıkla Shorts, ııı/eee temizliği, temiz ses ve 12 animasyonlu altyazı stili. Premiere'in içinde. Altyazı ücretsiz; Pro erken erişimde 749 ₺ + KDV, tek ödeme.

## Başlık

Kurgunun sıkıcı kısmını yapay zekâ yapsın.

## Açıklama

Suflo 3.0 — ücretsiz güncelleme. Pro erken erişim: 749 ₺ + KDV.

## CTA

Hemen İncele → suflo.app

## Kare kare metin

1. KURGUNUN SIKICI KISMINI YAPAY ZEKÂ YAPSIN. · SUFLO v3.0 · ÜCRETSİZ GÜNCELLEME
2. UZUN VİDEO GİR. SHORTS ÇIKSIN. — Viral anlar → tek tıkla 9:16 Shorts sekansları
3. İLK SANİYEDE KAYDIRMAYI DURDUR. — Kanca başlığı: 5 stil + AI ile öner
4. "ııı", "eee"? OTOMATİK SİLİNDİ. — Konuşmadan kes + sahne algılama + 13 geçiş
5. UĞULTUYU AL. SESİ SEVİYEYE OTURT. — −14 LUFS, dudak senkronu, toplu klip
6. ÖNEMLİ KELİMEYİ ÖNE ÇIKAR. — *kelime* / Ctrl+B, 12 animasyonlu altyazı stili
7. ARA GÖRÜNTÜ. METİN. ÇEVİRİ. — B-roll, paylaşım metni, 10+ dil + çok dilli SRT
8. ALTYAZI BEDAVA. KURGU PRO'DA. — Ücretsiz vs Pro tablosu
9. BİR KEZ ÖDE. HEP GÜNCEL KAL. — 749 ₺ + KDV, erken erişim 7 gün, sonra 1.249 ₺, suflo.app

## Alt metin

Suflo 3.0'ın yeni özelliklerini (viral anlardan 9:16 Shorts sekansları, kanca başlığı, konuşmadan kesim, ses iyileştirme, anahtar kelime vurgusu, 12 animasyonlu altyazı stili, B-roll önerileri, paylaşım metni ve çok dilli altyazı), ücretsiz ve Pro farkını ve 749 ₺ + KDV erken erişim fiyatını anlatan dokuz karelik Instagram karuseli.

## İddia kaynakları

- Sürüm: `CSXS/manifest.xml` — 3.0.0
- Özellikler ve ayrıntılar (15–60 sn, 5 kanca stili, 13 geçiş, −14/−16/−23 LUFS, dudak senkronu, 12 Suflo Stili, `*kelime*`, B-roll, paylaşım metni, çok dilli SRT): `marketing/release-notes.md` (Suflo 3.0.0), `js/hook-title.js`, `js/transitions.js`, `js/style-engine.js`, `js/ses.js`
- Ctrl+B / Otomatik vurgu: `index.html` (cap-auto-vurgu)
- Ücretsiz/Pro ayrımı, 242 animasyon, 1.076 SFX, 290 preset, 30 hareketli zemin, 749 ₺ + KDV, 1.249 ₺, iade yok: `docs/index.html` fiyat bölümü ve SSS
- Erken erişim süresi: `docs/index.html` geri sayımı (v3.0.0 yayınından 7 gün)

Görsellerde gerçek Premiere/Suflo ekran görüntüsü yoktur; tüm arayüzler "temsilî" stilize çizimlerdir (puanlar, süreler, örnek cümleler örnektir). Kanca başlığı kartları gerçek stil fontlarıyla (Anton, Montserrat Bold, Archivo Black, Bebas Neue) çizildi. Müşteri yorumu, süre/kazanç garantisi veya doğrulanmamış performans iddiası kullanılmadı.

## Yeniden üretme

```
node brand/campaign-3.0/render.js
```

Playwright + Chromium gerekir (sharp gerekmez). Çıktı: `01-…09-*.png`, `carousel-preview.png`, `render-qa.json`.
