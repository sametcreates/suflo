## Suflo 1.7.9 — ffmpeg artık kendi kuruluyor

En çok bildirilen sorun buydu: **"ffmpeg bulunamadı"**. Hem Windows'ta hem Mac'te. Bu sürüm onu kökünden çözüyor.

### Ne değişti

Panel artık ffmpeg'i **kendisi indirip kuruyor**. Senin bir şey yapmana gerek yok:

- Yerel motoru kurarken ffmpeg yoksa, motordan önce o kuruluyor.
- Bulut motoruyla çalışıyorsan da ilk altyazıda otomatik kuruluyor (ffmpeg her iki motorda da gerekli).
- Sistemde zaten ffmpeg varsa hiç dokunulmuyor.

Dosya panelin kendi klasörüne iniyor (`%APPDATA%\Kesit\ffmpeg`, Mac'te `~/Library/Application Support/Suflo/ffmpeg`). Sistem PATH'i değiştirilmiyor, yönetici izni istenmiyor.

### Neden eskisi çalışmıyordu

Eskiden Windows'ta `winget` çağırıyorduk. Üç ayrı yerde kırılıyordu: winget her Windows'ta yok, kurumsal makinelerde kapalı olabiliyor, ve kurulum başarılı olsa bile PATH'i **çalışan** Premiere sürecine yansıtmıyor — yani "kurdum ama panel görmüyor" durumu.

Ayrıca panelin ffmpeg arama listesinde bir tuzak vardı: Windows'ta bazı program kısayolları (App Execution Alias) diskte "yok" görünür, `fs.existsSync` onlar için çalışan bir programda bile `false` döner. Artık o yollar diskte yoklanmıyor, doğrudan çalıştırılarak sınanıyor.

### Mac kullanıcıları için önemli

Apple Silicon'da (M1/M2/M3/M4) artık doğru mimarideki ffmpeg iniyor. Önceki plandaki kaynak yalnızca Intel ikilisi yayınlıyordu ve Apple Silicon'da "Bad CPU type" hatası verirdi. İndirilen dosyanın Gatekeeper karantinası da otomatik temizleniyor, yoksa macOS çalıştırmayı engelliyor.

Homebrew'un varsa önce o kullanılıyor — sistemin kendi paketleriyle uyumlu kalırsın.

### Bekleme sırası düzeltildi

- **Sekans altyazısında** ffmpeg kontrolü artık en başta yapılıyor. Eskiden önce dakikalarca ses dışa aktarılıyor, sonra "ffmpeg yok" deniyordu.
- **Mac'te Homebrew yoksa** panel bunu ilk saniyede söylüyor; eskiden önce dosya indirip sonra vazgeçiyordu.
- Arama sırasında var olmayan yollar için artık boşuna program başlatılmıyor; kurulum kontrolü belirgin şekilde hızlandı.

### Sessiz düzeltmeler

- Ayarlar'daki düğme ile otomatik kurulum aynı anda çalışıp aynı dosyaya yazamıyor.
- `spawn ... ENOENT` gibi ham hatalar artık ne yapılacağını söylüyor.
- Adobe klasörlerinde ffmpeg aranmıyor: Premiere yalnızca kütüphane DLL'leri dağıtıyor, çağrılabilir bir ffmpeg koymuyor (2026 sürümleriyle dolu bir kurulumda arama sıfır sonuç verdi).
- Chocolatey ve Scoop kurulumları da aranıyor.

### Kurulum

1. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir (ücretsiz)
2. `Suflo-1.7.9.zxp` dosyasına çift tıkla
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

Gereksinim: Premiere 14.4 (2020) ve üstü · Windows veya macOS.

---

### 1.7.8'de gelenler (hatırlatma)

Hatalar artık çözümü de söylüyor (eksik Visual C++, eski işlemci, antivirüs, dolu disk, kopuk internet, geçersiz anahtar, kota). Ayarlar → Destek → **"Sorun bildir"** günlüğü kopyalayıp önceden doldurulmuş bildirim formunu açıyor. Türkçe ANSI (windows-1254) SRT dosyaları düzgün açılıyor ve içe aktarma geri alınabiliyor.

### 1.7.0'da gelenler (hatırlatma)

Dört biçimde dışa aktarma: SRT · WebVTT · **ASS** (stilli; kelime modunda karaoke `\k` etiketleriyle) · TXT.

```bash
ffmpeg -i video.mp4 -vf "subtitles=suflo-altyazi.ass" cikti.mp4
```
