# Suflo Pro içerik servisi

Bu servis ücretli MOGRT, SFX, Motion BG ve `.prfpset` dosyalarını `public_html` dışında tutar. Panel lisansı Lemon Squeezy'de doğrulandıktan sonra kısa ömürlü bir oturumla dosya indirir.

Üretim klasörleri aynı domain kökünde şöyle olmalıdır:

```text
public_html/pro/v1/index.php
public_html/pro/v1/.htaccess
private/pro-v1/config.php
private/pro-v1/manifest.json
private/pro-v1/content/mogrt/...
private/pro-v1/content/sfx/...
private/pro-v1/content/motionbg/...
private/pro-v1/content/presets/...
```

`node tools/build-pro-cdn.js <paket-klasoru> <icerik-surumu>` komutu bu yükleme ağacını `dist/pro-cdn/upload/` altında üretir ve güçlü bir token anahtarı oluşturur. Ardından `powershell -ExecutionPolicy Bypass -File tools/pro-cdn-zip.ps1` tek parça Hostinger ZIP'ini üretir.

Çalışan sunucuda yalnız Pro içeriğini güncellemek için `powershell -ExecutionPolicy Bypass -File tools/pro-content-zip.ps1` kullan. Oluşan arşivi `private/pro-v1/` içine çıkar; yalnız `content/` ile `manifest.json` değişir, çalışan `config.php` lisans anahtarı korunur.

Hostinger'da ZIP'i `public_html` klasörünün **bir üstündeki domain köküne** yükleyip çıkart. Çıkarma sonunda `public_html/` ile `private/` aynı seviyede olmalı. `private/pro-v1/config.php` gizli token taşır; bu dosyayı veya Hostinger ZIP'ini GitHub'a, müşteriye ya da public bir URL'ye yükleme.

Yayın öncesi `node tools/check-pro-cdn.js` çalıştır. Geçersiz deneme lisansına JSON `403` dönüyorsa servis ve lisans kapısı hazırdır. `tools/publish.ps1` bu kontrol geçmeden yeni GitHub sürümünü yayınlamaz. `private/` hiçbir zaman public GitHub paketine eklenmez.

Servis, Lemon Squeezy doğrulama kotasını kötüye kullanıma karşı korumak için lisans denemelerini IP başına dakikada 15 ile sınırlar; IP adresini saklamaz, yalnızca SHA-256 özetiyle kısa süreli sayaç tutar. Pro içerik dosyalarının indirilmesi bu sınırdan etkilenmez.

2.8.2 ve yeni istemciler `presets/*.prfpset` içeriğini de alır. Daha eski istemcilere katalog preset yolları filtrelenerek döner; böylece eski MOGRT/SFX/Motion BG kurulumu yeni içerik türü yüzünden kesilmez.

`tools/publish.ps1` her yayında ZXP ve kolay kurulum ZIP'ini yeniden üretir, tüm testleri çalıştırır ve `tools/verify-release.ps1` ile imzayı, arşiv yollarını, gerekli Pro Sync dosyalarını ve ücretli/gizli içerik sızıntısını doğrular. Bu kapılardan biri geçmezse commit, push ve release başlamaz.
