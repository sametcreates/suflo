## Suflo 1.7.8 — takıldığında ne yapacağını söyleyen sürüm

Bu sürümde yeni bir özellik yok; kurulumda veya kullanımda takılan kişinin **tek başına çıkabilmesi** üzerine çalıştım.

### Hatalar artık çözümü de söylüyor

Eskiden "Yerel motor çıktı üretmedi (kod=3221225781)" gibi bir şey görüyordun ve yapabileceğin bir şey yoktu. Artık aynı hata şunu ekliyor:

> Çözüm: Bir Windows bileşeni eksik görünüyor. Şu adresten Visual C++ paketini kur, Premiere'i yeniden başlat: aka.ms/vs/17/release/vc_redist.x64.exe

Tanınan durumlar: eksik Visual C++, AVX desteklemeyen eski işlemci, antivirüs engeli, dolu disk, kopuk internet, geçersiz API anahtarı, bulut kotası ve meşgul Premiere. Tanınmayan bir hata olduğu gibi kalıyor; "Konuşma bulunamadı" gibi normal durumlara gereksiz tavsiye eklenmiyor.

### Ayarlar → Destek → "Sorun bildir"

Tek tıkla tanılama günlüğünü panoya kopyalar ve önceden doldurulmuş bildirim formunu açar. İşletim sistemin ve Premiere sürümün otomatik doluyor; senin yapacağın tek şey günlüğü yapıştırmak. Günlük hiçbir yere kendiliğinden gönderilmiyor, kontrol tamamen sende.

### Türkçe ANSI altyazılar düzgün açılıyor

Elde dolaşan eski SRT'lerin çoğu windows-1254 kodlamasında. Bunları içe aktarınca bütün ş/ğ/ı/İ harfleri bozuluyordu. Artık dosyanın kodlaması ham baytlardan anlaşılıyor ve doğru çözülüyor. İçe aktarma ayrıca geri alınabilir hale geldi: yanlış dosya seçersen Ctrl+Z ile dönebilirsin.

### Sessiz düzeltmeler

- **Ses katmanların artık her durumda eski haline dönüyor.** Sekans sesi dışa aktarılırken seçmediğin katmanlar geçici olarak susturuluyordu; dışa aktarma yarıda hata verirse bu susturma üzerinde kalabiliyordu. Artık ne olursa olsun geri alınıyor.
- **Toplu işlemde disk şişmesi giderildi:** her klibin geçici ses dosyası işi biter bitmez siliniyor (20 kliplik bir işte gigabaytlar fark ediyor).
- **Kurulum hatasında** kurulum düğmesi "Motor iniyor… %62" yazısında donup kalmıyor.
- **Sürüm numarası** panelin üstünde ve Hakkında bölümünde artık gerçek sürümü gösteriyor.

### Geliştiriciler için

- `tests/` klasörü ve `tools\test.ps1` eklendi. Testler panelin gerçek kaynağını dosyadan okuyup çalıştırıyor, kopya mantık sınamıyor.
- GitHub'da hata bildirimi ve özellik isteği için form şablonları eklendi.
- ExtendScript'te undo gruplama denemesi kaldırıldı: Premiere bu API'yi sunmuyor (Adobe'nun kendi yanıtı ve açık özellik talebi DVAPR-4235114). Kodda sahte bir sarmalayıcı tutmak yerine durum belgelendi.

### Kurulum

1. [ZXP/UXP Installer](https://aescripts.com/learn/zxp-installer/) indir (ücretsiz)
2. `Suflo-1.7.8.zxp` dosyasına çift tıkla
3. Premiere'i yeniden başlat → **Window > Extensions > Suflo**

Gereksinim: Premiere 14.4 (2020) ve üstü · Windows veya macOS.

---

### 1.7.1'de gelenler (hatırlatma): macOS desteği

Mac'te yerel motor Homebrew ile kuruluyor (`brew install whisper-cpp`); panel bunu senin için yapıyor. Apple Silicon'da Metal hızlandırma kendiliğinden açık. Model klasörü `~/Library/Application Support/Suflo/whisper`.

### 1.7.0'da gelenler (hatırlatma)

Dört biçimde dışa aktarma: SRT · WebVTT · **ASS** (stilli; kelime modunda karaoke `\k` etiketleriyle) · TXT.

```bash
ffmpeg -i video.mp4 -vf "subtitles=suflo-altyazi.ass" cikti.mp4
```
