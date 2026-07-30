# Lansman öncesi test — 10 dakika

v1.6 ve v1.7'de çok şey değişti ama hiçbiri **Premiere'in içinde** denenmedi. Ben tarayıcıda ve
Node'da doğruladım; gerçek Premiere'de çalıştıran olmadı. Aşağıdaki tur bunu kapatıyor.

**Önce:** `Suflo-1.7.4.zxp` kurulu mu? Panelde sağ üstte **v1.7** yazmalı.
Konuşma içeren 1-2 dakikalık bir test videosu aç.

Takılan olursa: **Ayarlar → Destek → Günlüğü kopyala** → bana yapıştır.

---

## Windows

### 1. Seçili klip (temel akış)
- [ ] Timeline'da bir klip seç → **Altyazı oluştur**
- [ ] Satırlar listeye düşüyor mu?
- [ ] Bir satırda yazım hatasını düzelt
- [ ] **Sekansa uygula** → altyazı izi oluştu mu, program monitöründe görünüyor mu?

### 2. Tekrar uygulama uyarısı ⚠️ YENİ
- [ ] Aynı sekansa **ikinci kez** "Sekansa uygula" bas
- [ ] Düğme turuncuya dönüp **"Yine de yeni altyazı izi ekle"** oldu mu?
- [ ] Uyarı mesajı çıktı mı? (İkinci basışta uygulamalı.)

### 3. Altyazı dosyası nerede? ⚠️ YENİ
- [ ] Proje panelinde içe aktarılan SRT'ye sağ tık → **Reveal in Explorer**
- [ ] Dosya **proje klasöründe** mi? (Temp'te OLMAMALI.)
  Proje kaydedilmemişse `%APPDATA%\Kesit\srt` içinde olmalı.

### 4. Dışa aktarma biçimleri ⚠️ YENİ
Sonuç listesinin üstündeki açılır menüden sırayla seç, **indir**'e bas:
- [ ] **SRT** → masaüstünde açılıyor mu, Türkçe karakterler doğru mu?
- [ ] **WebVTT** → dosya `WEBVTT` ile başlıyor mu?
- [ ] **ASS** → "Satır uzunluğu"nu *kelime kelime* yapıp tekrar indir; içinde `{\k` etiketleri var mı?
- [ ] **TXT** → zaman damgası olmadan düz metin mi?

### 5. In → Out ve Sekans kapsamı
- [ ] In/Out işaretle → kapsamı **In → Out** yap → altyazı oluştur
- [ ] Kapsamı **Sekans** yap → altyazı oluştur
- [ ] Ses katmanı çipleri (A1, A2...) görünüyor mu, birini kapatınca o kanal atlanıyor mu?

### 6. Ayarlar gidiş-geliş ⚠️ YENİ
- [ ] Sağ üstteki **⚙ Ayarlar** düğmesi kolay bulunuyor mu?
- [ ] Ayarların üstündeki **‹ Altyazıya dön** çalışıyor mu?
- [ ] **Esc** de çıkarıyor mu?

### 7. Editör
- [ ] Zaman damgasına **çift tık** → elle zaman yaz → liste sıralanıyor mu?
- [ ] Bir satırda imleci ortaya koy, **Enter** → satır bölünüyor mu?
- [ ] **−0,5 sn** / **+0,5 sn** → altyazılar kayıyor mu?
- [ ] **Ctrl+Z** hepsini geri alıyor mu?

---

## Mac

Windows'taki 1-7 adımlarının aynısı, **artı** özellikle şunlar (mac'te hiç denenmedi):

- [ ] **In → Out** kapsamı çalışıyor mu?  ← *en riskli, yol ayracı körlemesine yazıldı*
- [ ] **Sekans** kapsamı çalışıyor mu?  ← *aynı risk*
- [ ] Ayarlar → ffmpeg satırında **✓ /opt/homebrew/bin/ffmpeg** gibi bir yol yazıyor mu?
- [ ] Yerel motor satırında **Metal (Apple GPU)** yazıyor mu? (M serisi Mac'teysen)
- [ ] SRT proje klasörüne yazılıyor mu?

---

## Sonuç

Hepsi geçerse: **lansmana teknik engel yok.**

Geçmeyen madde olursa numarasını + günlüğü at, önce onu düzeltiriz. Post paylaşıldıktan
sonra çıkan hata, paylaşılmadan önce çıkan hatadan çok daha pahalı.
