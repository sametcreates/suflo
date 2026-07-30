## Suflo 1.7.1 — macOS desteği 🍎

Mac'te "Motor arşivi açılamadı" hatası alıyorsan bu sürüm onu çözüyor. Sorun şuydu: panel Mac'te de **Windows** motor arşivini indiriyor, sonra onu Windows'a özel komutlarla açmaya çalışıyordu. İkisi de Mac'te çalışmaz.

### Mac'te yerel motor artık kuruluyor

whisper.cpp macOS için hazır ikili yayınlamıyor (resmi sürüm dosyaları yalnızca Windows ve Ubuntu). Bu yüzden Mac'te motoru **Homebrew** kuruyor — panel bunu senin için yapıyor:

```bash
brew install whisper-cpp
```

Kurulum kartındaki düğme artık **"Yerel motoru kur (Homebrew)"** diyor. Homebrew yoksa panel bunu açıkça söylüyor ve ne yapman gerektiğini yazıyor (ya da Homebrew kurmadan ücretsiz Groq anahtarıyla buluttan başlayabilirsin).

**Apple Silicon'da GPU hızlandırma (Metal) kendiliğinden açık** — ayrı sürüm indirmek gerekmiyor, panel "Metal (Apple GPU)" yazıyor.

### Mac'te düzelen diğer şeyler

- **Model klasörü** doğru yerde: `~/Library/Application Support/Suflo/whisper` (eskiden Mac'in içine `AppData/Roaming` diye Windows klasörü açıyordu).
- **ffmpeg** artık bulunuyor: Homebrew (`/opt/homebrew`, `/usr/local`) ve MacPorts yolları taranıyor. Ayarlar'daki kur düğmesi Mac'te `brew install ffmpeg` çalıştırıyor.
- **Arşiv açma** `unzip`/`tar` ile yapılıyor (Windows'un `tar.exe`/PowerShell'i yerine).
- **Sekans sesi dışa aktarma** yolları Mac ayracıyla kuruluyor.
- CEP'in kısıtlı `PATH`'i yüzünden Homebrew araçları görünmüyordu; alt süreçlere doğru `PATH` veriliyor.

### Kurulum

1. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir (ücretsiz)
2. `Suflo-1.7.1.zxp` dosyasına çift tıkla
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

Gereksinim: Premiere 14.4 (2020) ve üstü · Windows veya macOS.

---

### 1.7.0'da gelenler (hatırlatma)

**Dört biçimde dışa aktarma:** SRT · WebVTT · **ASS** (stilli; kelime modunda karaoke `\k` etiketleriyle) · TXT.

```bash
ffmpeg -i video.mp4 -vf "subtitles=suflo-altyazi.ass" cikti.mp4
```

**İçe aktarma gerçekten VTT okuyor:** `<v>`, `<i>`, `{\an8}` etiketleri ve HTML varlıkları temizleniyor; cue ayarlı zaman satırları ve saat alanı olmayan kısa biçim doğru okunuyor.

**Aynı sekansa ikinci uygulamada onay:** Premiere var olan altyazı izini güncelleyemiyor, her seferinde yeni iz açıyor — panel artık uyarıyor.

**Panel kilitlenmiyor:** Premiere meşgul/modalken ExtendScript geri çağrısı hiç gelmeyebiliyor; bu durumda panel seçili klibi bir daha görmüyordu. Her çağrı artık zaman aşımıyla sonuçlanıyor.

---

*Free, open-source AI subtitles for Adobe Premiere — Windows and macOS. Runs Whisper locally (NVIDIA cuBLAS or Apple Metal) with no subscription, no credits, no limits. Exports SRT, WebVTT and styled ASS with karaoke timing tags.*
