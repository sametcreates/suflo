## Suflo 1.7.0 — WebVTT + ASS dışa aktarma, karaoke etiketleri, dayanıklılık 🎬

Bu sürüm altyazıyı Premiere'in dışına da taşıyor: YouTube'a yükleyeceğin VTT'yi ve ffmpeg ile videoya gömebileceğin stilli ASS'i doğrudan panelden alıyorsun.

### Yeni: dört biçimde dışa aktarma

Sonuç listesinin üstündeki biçim seçicisinden seç, **indir**:

| Biçim | Ne için |
|---|---|
| **SRT** | Premiere caption izi — her yerde çalışır |
| **WebVTT** | YouTube, web oynatıcılar, sosyal platformlar |
| **ASS** | Stilli altyazı; ffmpeg ile videoya gömülür, Aegisub/DaVinci/VLC okur |
| **TXT** | Zaman damgasız transkript (video açıklaması, blog) |

**Karaoke etiketleri:** satır uzunluğunu "kelime" modlarından birine (2-5 kelime ya da kelime kelime) alıp ASS indirirsen, kelimeler `\k` zamanlama etiketleriyle satırlara toplanır — gerçek karaoke vurgusu. Videoya gömmek için:

```bash
ffmpeg -i video.mp4 -vf "subtitles=suflo-altyazi.ass" cikti.mp4
```

### İçe aktarma gerçekten VTT okuyor

YouTube'dan indirdiğin altyazıyı panele atınca artık:
- `<v Konuşmacı>`, `<i>`, `<b>`, `{\an8}` gibi etiketler temizleniyor (eskiden altyazının içine ham olarak giriyordu),
- `&amp;`, `&#305;` gibi HTML varlıkları çözülüyor,
- zaman satırındaki cue ayarları (`align:start position:0%`) zamanı bozmuyor,
- saat alanı olmayan kısa biçim (`00:01.000 --> 00:03.500`) doğru okunuyor — eskiden hepsi 00:00 oluyordu.

### Aynı sekansa ikinci kez uygulama

Premiere'in betik arayüzü var olan altyazı izini güncelleyemiyor, her seferinde **yeni** bir iz açıyor. Düzelt-uygula-düzelt döngüsünde farkında olmadan üst üste izler birikiyordu. Artık aynı sekansa ikinci kez uygularken panel önce uyarıyor ve onay istiyor; ne olacağını açıkça söylüyor.

### Panel artık kilitlenmiyor

Premiere meşgul ya da modal bir pencere açıkken ExtendScript geri çağrısı hiç gelmeyebiliyor. Bu durumda bağlam yoklaması sonsuza dek askıda kalıyor ve **panel seçili klibi bir daha hiç görmüyordu** — paneli kapatıp açmadan düzelmiyordu. Artık her çağrı en geç zaman aşımında sonuçlanıyor, ayrıca yoklama için bekçi var: Premiere cevap vermeye başlayınca panel kendini toparlıyor.

### Kurulum

1. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir (ücretsiz)
2. `Suflo-1.7.0.zxp` dosyasına çift tıkla
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

Gereksinim: Windows, Premiere 14.4 (2020) ve üstü. ffmpeg ve yerel motor panel içinden kurulur.

---

*Free, open-source AI subtitles for Adobe Premiere. Runs Whisper locally with optional NVIDIA GPU acceleration — no subscription, no credits, no limits. Now exports SRT, WebVTT and styled ASS with karaoke timing tags.*
