# Suflo

**Premiere Pro için ücretsiz, açık kaynak kurgu paneli.**
SFX kütüphanesi · yapay zekâ altyazı · otomatik ilk kesim · keyframe easing — abonelik yok, kredi yok, hesap yok.

> Eski adıyla *Kesit*. Kapix ve Subs gibi ücretli panellere ücretsiz, bakımlı bir alternatif.

## Özellikler

| Modül | Ne yapar | Maliyet |
|---|---|---|
| **SFX** | Kendi ses klasörlerini bağla; ara, dinle (↓↑ + Enter), favorile, playhead'e bırak | Ücretsiz, sınırsız |
| **Altyazı** | Seçili klip, In–Out aralığı ya da tüm sequence'tan transkript; düzenle, stille, caption izi olarak uygula. TR · AZ · EN · RU · oto | Yerel motorla ücretsiz, sınırsız |
| **Kesim** | Duraksamaları bulur, kesimleri görsel barda gösterir, kopya sekansta güvenle uygular | Ücretsiz, sınırsız |
| **Motion** | Sürüklenebilir bezier eğrisiyle keyframe easing; her keyframe aralığına uygular | Ücretsiz, sınırsız |

### Altyazı motorları

- **Yerel (önerilen):** whisper.cpp + Whisper large-v3-turbo bilgisayarında çalışır. İnternet, hesap, anahtar gerekmez. Panel tek düğmeyle kurar (~570 MB, bir kez).
- **Groq bulut:** ücretsiz API anahtarıyla saniyeler içinde sonuç (günde 8 saat ses kotası). OpenAI ve özel endpoint (self-hosted Whisper dahil) de desteklenir.

### Altyazı stilleri

Noktalama kaldır/koru · Normal / BÜYÜK HARF / küçük harf (Türkçe İ-ı ve Azerice kurallarına uygun) · satır uzunluğu 32/42/60 · Whisper halüsinasyon filtresi ("Altyazı M.K." vb. otomatik süzülür).

## Kurulum

1. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir (ücretsiz).
2. Son sürüm `Suflo-x.y.z.zxp` dosyasını indirip çift tıkla.
3. Premiere Pro'yu yeniden başlat → `Window > Extensions > Suflo`.

Geliştirici kurulumu (kaynaktan):

```bash
powershell -ExecutionPolicy Bypass -File tools/install.ps1
```

### Gereksinimler

- Premiere Pro 2022+ (CEP 11/12), Windows. macOS desteği yol haritasında.
- **ffmpeg** — Kesim ve Altyazı için. Panel Ayarlar sekmesinden tek tıkla kurulur (winget).

## Kullanım notları

**Altyazı.** Kapsamı seç (klip / In–Out / sequence), dili seç, "Altyazı oluştur". Liste gelince satırları düzenle, stilini seç, "Sequence'a uygula" — Premiere caption izi oluşturur; olmazsa SRT projeye alınır, timeline'a sürüklersin. "SRT indir" ile dosya olarak da alabilirsin. Yerel motor ses süresinin ~1,5-2 katı sürede çalışır; acelen varsa Groq'a geç.

**Kesim.** Eşik (dB) sesin ne kadar altını "sessizlik" saydığını belirler; gürültülü çekimde -30, temiz kayıtta -45 dene. Tampon, kesimin konuşmanın nefesini yemesini engeller. Varsayılan uygulama hedefi **kopya sekans**tır: orijinal sequence'a hiç dokunulmaz.

**Motion.** Effect Controls'ta bir özelliğe en az iki keyframe koy. Panel özellikleri kendisi listeler; eğriyi preset'ten seç ya da tutamaçları sürükleyerek çiz.

**SFX.** Arama kutusundan çıkmadan ↓↑ ile gez (otomatik önizler), Enter ile ekle. ★ ile favorile.

## Sık sorulanlar

**Gerçekten ücretsiz mi?** Evet. Panel MIT lisanslı açık kaynak; yerel altyazı motoru bilgisayarında çalışır, kimseye ödeme yapmazsın. Groq'u seçersen kendi ücretsiz anahtarını kullanırsın — kart bilgisi istemez.

**Verilerim nereye gidiyor?** Yerel motorda hiçbir yere — ses bilgisayarından çıkmaz. Bulut motorunda ses yalnızca seçtiğin sağlayıcıya (Groq/OpenAI) gider.

**Orijinal sequence'ım bozulur mu?** Kesim varsayılan olarak kopya sekansta çalışır; Altyazı yalnızca caption izi ekler; Magic benzeri hiçbir işlem kaynağı silmez.

## Geliştirme

```
css/style.css     tasarım sistemi
js/bridge.js      CEP köprüsü: Node, ffmpeg, whisper.cpp, indirici
js/captions.js    altyazı modülü
js/magiccut.js    kesim modülü
js/motion.js      easing modülü
js/sfx.js         ses kütüphanesi
jsx/host.jsx      Premiere ExtendScript tarafı
tools/            kur/kaldır/paketle/dev-server
```

Önizleme: `node tools/devserver.js` → http://localhost:5177 (Premiere dışında sahte veriyle açılır).
Paket: `tools/package.ps1` (ZXPSignCmd gerekir) → `dist/Suflo-x.y.z.zxp`.

## Yol haritası

- Kelime kelime (karaoke) altyazı stilleri
- macOS desteği
- Azerice arayüz çevirisi
- Sequence tabanlı kesim (klip bağımsız)

## Lisans

MIT — [LICENSE](LICENSE). Dilediğin gibi kullan, değiştir, dağıt.
