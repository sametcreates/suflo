/*
 * Suflo — şeffaf katman render'ı (ortak): ASS + fontlar → ffmpeg/libass → qtrle .mov
 *
 * captions.js'teki "Altyazı Efektleri ile ekle" (overlayUygula) akışından çıkarıldı; deneme
 * çıktılarının satın alma sonrası temiz yeniden oluşturulması da aynı yolu kullanır.
 * Zincir: color=black@0 → format=rgba → subtitles(alpha=1) → unpremultiply → qtrle.
 *   alpha=1 ZORUNLU: yazılmazsa libass alfayı işlemez, video tamamen görünmez çıkar.
 *   unpremultiply: ffmpeg premultiplied üretir, Premiere straight bekler (koyu hale olmasın).
 *   qtrle: saydam karede ProRes 4444'ten ~12 kat küçük ve kayıpsız.
 * ffmpeg altyazı filtresi mutlak yol kabul etmez: ASS ve fontlar geçici klasöre yazılır,
 * ffmpeg orada çalışır (fontsdir=. göreli).
 *
 * K (bridge.js arayüzü) dışarıdan verilir; bu yüzden modül sahte K ile node'da test edilir.
 */
(function (root, factory) {
  // Marka Kiti logo yerlesimi (saf); yoksa logo verilen x/y ile kullanilir
  var MK = (root && root.SufloMarkaKiti) || null;
  if (!MK && typeof require === "function") { try { MK = require("./marka-kiti.js"); } catch (e) { MK = null; } }
  // Kalan süre metni transkripsiyonla aynı dilde ("~1 dk 20 sn kaldı"): js/whisper-akis.js sureMetni
  var WA = (root && root.SufloWhisperAkis) || null;
  if (!WA && typeof require === "function") { try { WA = require("./whisper-akis.js"); } catch (e2) { WA = null; } }
  var api = factory(MK, WA);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloOverlayRender = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (MK, WA) {
  "use strict";

  // js/filigran.js filigranliMi ile aynı (STIL = "SufloFiligran")
  var FILIGRAN_STILI = /^\s*Style:\s*SufloFiligran\s*,/m;

  // ProRes 4:4:4 tek sayı boyut kabul etmez; qtrle için de zararsız
  function ciftBoyut(n) {
    n = Math.round(Number(n) || 0);
    return n + (n % 2);
  }

  function kaynak(o) {
    return "color=c=black@0.0:s=" + o.g + "x" + o.y + ":r=" + o.fps + ":d=" + o.sure +
      ",format=rgba,subtitles=f=" + (o.assAd || "altyazi.ass") + ":alpha=1" + (o.fontsdir || "") + ",unpremultiply=inplace=1";
  }

  function ffmpegArgs(src, cikti) {
    return ["-y", "-f", "lavfi", "-i", src, "-c:v", "qtrle", "-an", cikti];
  }

  /*
   * Marka Kiti logosu: { name (geçici klasördeki göreli ad), lw (genişlik px), x, y (sayı ya da
   * "<alt kenar>-overlay_h") }. Sayılar ve ad doğrulanır: argümana tırnaksız yazılır.
   */
  function logoGecerli(logo) {
    return !!(logo && /^logo\.(png|jpe?g)$/i.test(String(logo.name || "")) &&
      Number(logo.lw) >= 2 && isFinite(Number(logo.lw)) && isFinite(Number(logo.x)) &&
      /^\d+(-overlay_h)?$/.test(String(logo.y)));
  }

  // [giris][logo] → logo bindirme. Ölçeklenen logo straight alfa (format=rgba); bindirme
  // unpremultiply'dan SONRA: önce yapılırsa logo rengi ikiye katlanıyor (denendi)
  function logoFiltresi(logo, giris, logoGiris) {
    return logoGiris + "scale=" + Math.round(Number(logo.lw)) + ":-2,format=rgba[l];" +
      giris + "[l]overlay=x=" + Math.round(Number(logo.x)) + ":y=" + logo.y + ":format=auto:shortest=1";
  }

  /*
   * Katman render'ının ffmpeg argümanları.
   * o: { assName, fontsdir ("." ya da ""), w, h, fps, dur, logo?, out }
   * logo yoksa bugünkü argümanların AYNISI (kaynak + ffmpegArgs).
   */
  function buildArgs(o) {
    o = o || {};
    var src = o.src || kaynak({ g: o.w, y: o.h, fps: o.fps, sure: o.dur, assAd: o.assName,
      fontsdir: o.fontsdir ? ":fontsdir=" + o.fontsdir : "" });
    var args = !logoGecerli(o.logo) ? ffmpegArgs(src, o.out)
      : ["-y", "-f", "lavfi", "-i", src, "-loop", "1", "-i", o.logo.name,
        "-filter_complex", logoFiltresi(o.logo, "[0:v]", "[1:v]"), "-c:v", "qtrle", "-an", o.out];
    /*
     * kare: kesin kare sayısı (-frames:v). Tek ve parçalı yol aynı sayıda kare üretsin diye ikisi de
     *   kareSayisi(sure, fps) ile sınırlanır (renk kaynağı d=sure ile ceil(sure·fps) üretebiliyordu).
     * ilerleme: -progress pipe:1 (stdout'a anahtar=değer satırları; ilerlemeCoz okur), -nostats.
     * İkisi de verilmezse bugünkü argümanların AYNISI. Çıktı dosyası hep son argüman.
     */
    var ek = [];
    if (Number(o.kare) > 0) ek.push("-frames:v", String(Math.round(Number(o.kare))));
    if (o.ilerleme) ek.push("-nostats", "-progress", "pipe:1");
    if (ek.length) args = args.slice(0, -1).concat(ek, [args[args.length - 1]]);
    return args;
  }

  /* ---------------- kare planı (saf) ---------------- */

  // fps 0 / NaN / sonsuz / saçma (> 1000, bozuk sekans bilgisi): 25 (render'ın eski varsayılanı)
  function gecerliFps(fps) {
    var f = Number(fps);
    return f > 0 && f <= 1000 && isFinite(f) ? f : 25;
  }

  /*
   * Kareye tam oturan cue zamanları (senkron doğrulamanın kareye yuvarlanmış zamanları katmanda da aynı karede başlasın).
   * ffmpeg'in altyazı süzgeci karenin zamanını ms'ye KESİP (floor) libass'e verir, ASS ise santisaniye taşır: 29,97 /
   * 59,94 / 23,976 fps'te kare zamanı (1,0677 sn) santisaniyeye yuvarlanınca (1,07) olay karenin ARDINDAN başlıyor, cue
   * bir kare geç açılıp bir kare geç kapanıyordu. Burada her zaman katman ızgarasının en yakın karesine oturur (ofs:
   * katmanın timeline başı; 0 = katman zamanı) ve LIBASS_PAY kadar öne alınır: santisaniyeye yuvarlanan değer o karenin
   * ms'sini geçmez, bir önceki karenin ms'sine de inmez (kare aralığı ≥ 15,5 ms, yani PAY_FPS_SINIR fps'e kadar;
   * ffmpeg'in r=29.97 ızgarasıyla 1 saatte birkaç ms'lik farkı da karşılar). Daha yüksek fps'te (100 / 119,88 / 120)
   * santisaniye penceresi kareden geniştir, sabit pay kartı bir kare ERKEN açardı: orada ffmpeg'in kare ms'si birebir
   * hesaplanır ((long long)(pts · av_q2d(1/r) · 1000)) ve (önceki kare, bu kare] aralığındaki son santisaniye seçilir;
   * aralıkta santisaniye yoksa (120 fps'te her 6 karede bir) eski en yakın santisaniye. Kopya döner (kelimeler de);
   * girdi değişmez. Yarım kareden kısa kart en az bir kare görünür. fps geçersizse cue'lar aynen (kopya).
   */
  var LIBASS_PAY = 0.0099;
  var PAY_FPS_SINIR = 64;
  function kareIzgarasi(fps) {
    var f = Number(fps);
    if (!(f > 0) || !isFinite(f) || f > 1000) return 0;
    var n = Math.round(f);
    if (Math.abs(f - n * 1000 / 1001) < 0.005 && Math.abs(f - n) > 0.005) return n * 1000 / 1001;
    return f;
  }
  // ffmpeg'in kare süresi (av_q2d(time_base)); f kareIzgarasi'nın değeri: NTSC ızgarasında 1001 / (n·1000), yoksa 1 / f
  function kareAdimi(f) {
    var n = Math.round(f);
    return Math.abs(f - n) > 0.005 && f === n * 1000 / 1001 ? 1001 / (n * 1000) : 1 / f;
  }
  function kareZamani(t, f, ofs, q) {
    var x = Number(t);
    if (!isFinite(x)) return t;
    var k = Math.round((x - ofs) * f + 1e-7);
    if (f <= PAY_FPS_SINIR || k <= 0) return Math.max(0, Math.round((ofs + k / f - LIBASS_PAY) * 1e6) / 1e6);
    // yüksek fps: libass'in gördüğü kare ms'si (ffmpeg vf_subtitles keser); olay [bas, son) ms aralığında görünür
    var simdi = Math.floor(k * q * 1000), once = Math.floor((k - 1) * q * 1000);
    var cs = Math.floor(simdi / 10);
    if (cs * 10 <= once) cs = Math.round(k / f * 100);   // aralıkta santisaniye yok: eski yuvarlama
    return Math.max(0, Math.round((ofs + cs / 100) * 1e6) / 1e6);
  }
  function kareZamanlari(cues, fps, ofs) {
    var f = kareIzgarasi(fps), o = Number(ofs) || 0, q = f ? kareAdimi(f) : 0;
    return (cues || []).map(function (c) {
      var y = {};
      for (var a in c) if (Object.prototype.hasOwnProperty.call(c, a)) y[a] = c[a];
      if (!f) return y;
      y.start = kareZamani(c.start, f, o, q);
      y.end = kareZamani(c.end, f, o, q);
      // yarım kareden kısa kart iki ucu aynı kareye oturup görünmez olmasın: en az bir kare (eski yuvarlama da bir kare gösterirdi)
      if (Number(c.end) > Number(c.start) && !(y.end > y.start)) y.end = kareZamani(Number(c.start) + 1 / f, f, o, q);
      if (c.words && c.words.length) {
        y.words = c.words.map(function (w) {
          var z = {};
          for (var b in w) if (Object.prototype.hasOwnProperty.call(w, b)) z[b] = w[b];
          z.start = kareZamani(w.start, f, o, q);
          z.end = kareZamani(w.end, f, o, q);
          return z;
        });
      }
      return y;
    });
  }

  // Katmanın kare sayısı: round(sure·fps), en az 1 (çok kısa katman da bir kare)
  function kareSayisi(sure, fps) {
    var s = Number(sure);
    if (!(s > 0) || !isFinite(s)) return 0;
    return Math.max(1, Math.round(s * gecerliFps(fps) + 1e-9));
  }

  // Parçalı render eşiği: 45 sn'den kısa katmanda süreç açma / birleştirme masrafı kazancı yer
  var PARCA_ESIK_SN = 45;
  var PARCA_EN_COK = 4;

  /*
   * [0, sure] aralığını kare sınırında parçalara böler: [{ t0, kare, bas }].
   *   bas: parçanın ilk karesinin sırası (tek parçalı render'daki kare numarası), t0 = bas / fps
   *   kare: parçanın kare sayısı; toplam = kareSayisi(sure, fps)
   * Parçalı: sure > 45 sn VE cpus ≥ 3 → min(cpus − 1, 4) parça (bir çekirdek panele / Premiere'e kalır).
   * agirlik (isteğe bağlı): piksel sayısının 1080p'ye oranı; 1'den büyükse eşik süresi ona bölünür (30 sn 4K,
   *   120 sn 1080p kadar iş: ölçümde tek süreçle ~1× gerçek zaman). 1080p ve altında eşik 45 sn kalır.
   * zorla (test / tanı): ≥ 2 ise eşik ve çekirdek sayısı yok sayılır. Parça sayısı kareyi aşmaz.
   * Geçersiz süre: []. Tek parça: [{ t0: 0, kare: N, bas: 0 }].
   */
  function parcaPlani(sure, fps, cpus, zorla, agirlik) {
    var f = gecerliFps(fps), n = kareSayisi(sure, f);
    if (!n) return [];
    var c = Math.floor(Number(cpus));
    if (!isFinite(c) || c < 1) c = 1;
    var k = 1;
    var z = Math.floor(Number(zorla));
    if (isFinite(z) && z >= 2) k = z;
    else {
      var a = Number(agirlik);
      if (!(a > 1) || !isFinite(a)) a = 1;
      if (Number(sure) * a > PARCA_ESIK_SN && c >= 3) k = Math.min(c - 1, PARCA_EN_COK);
    }
    k = Math.max(1, Math.min(k, n));
    var taban = Math.floor(n / k), artan = n % k, bas = 0, plan = [];
    for (var i = 0; i < k; i++) {
      var kare = taban + (i < artan ? 1 : 0);
      plan.push({ t0: bas / f, kare: kare, bas: bas });
      bas += kare;
    }
    return plan;
  }

  /*
   * Bir parçanın lavfi kaynağı. Renk kaynağının zaman tabanı 1/fps: setpts=PTS+bas (= T0/TB, tam sayı
   * kare; kayan nokta T0 kesilip bir kare kaymasın diye kare cinsinden) libass'e MUTLAK zamanı verir,
   * parça tek render'daki karelerinin aynısını çizer. setpts=PTS-STARTPTS çıktıyı (ve logonun döngülü
   * girdisiyle eşlemeyi) sıfırdan başlatır; birleştirici zamanları ardışık dizer. Renk kaynağı bir kare
   * uzun (d), kesin sayıyı -frames:v verir.
   */
  function parcaKaynak(o) {
    var f = gecerliFps(o.fps);
    var d = (Math.round(Number(o.kare)) + 1) / f;
    return "color=c=black@0.0:s=" + o.w + "x" + o.h + ":r=" + f + ":d=" + d +
      ",setpts=PTS+" + Math.round(Number(o.bas) || 0) +
      ",format=rgba,subtitles=f=" + (o.assName || "altyazi.ass") + ":alpha=1" + (o.fontsdir ? ":fontsdir=" + o.fontsdir : "") +
      ",unpremultiply=inplace=1,setpts=PTS-STARTPTS";
  }

  // o: { assName, fontsdir, w, h, fps, bas, kare, logo?, out } → parçanın ffmpeg argümanları (ilerlemeli)
  function parcaArgs(o) {
    return buildArgs({ src: parcaKaynak(o), logo: o.logo, out: o.out, kare: o.kare, ilerleme: true });
  }

  /*
   * Birleştirme listesinin satırı (concat demuxer): yol tek tırnak içinde, içindeki ' → '\''.
   * Suflo yalnız göreli, ASCII parça adları yazar ("parca-0/parca.mov"); kaçış yine de doğru olsun.
   */
  function concatSatiri(yol) {
    return "file '" + String(yol).replace(/\\/g, "/").replace(/'/g, "'\\''") + "'";
  }

  /* ---------------- ilerleme (saf) ---------------- */

  function zamanSn(anahtar, deger) {
    var v = String(deger).trim();
    if (anahtar === "out_time") {
      var m = /^(-)?(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(v);
      if (!m) return null;
      var t = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]);
      return m[1] ? -t : t;
    }
    // out_time_ms da (ffmpeg'in eski adlandırma hatası) mikrosaniyedir
    if (!/^-?\d+$/.test(v)) return null;   // N/A, boş, bozuk
    return Number(v) / 1e6;
  }

  /*
   * ffmpeg -progress satırlarından ilerleme oranı (0..1). satirlar: tam satırlar dizisi ya da metin
   * (metinde \n ile bitmeyen son parça yarım satırdır, okunmaz: "out_time_ms=12" aslında "…=12345678" olabilir).
   * Son geçerli out_time_us / out_time_ms / out_time kullanılır; N/A atlanır; progress=end → 1.
   * Bilgi yoksa (ya da sure geçersizse ve bitmediyse) null. Sonuç [0, 1]'e sıkıştırılır.
   */
  function ilerlemeCoz(satirlar, sure) {
    var liste;
    if (satirlar instanceof Array) liste = satirlar;
    else {
      liste = String(satirlar === undefined || satirlar === null ? "" : satirlar).split("\n");
      liste.pop();   // son parça: "\n" ile bittiyse boş, bitmediyse yarım satır
    }
    var s = Number(sure), son = null, bitti = false;
    for (var i = 0; i < liste.length; i++) {
      var m = /^\s*([a-z_]+)=(.*)$/.exec(String(liste[i]).replace(/\r$/, ""));
      if (!m) continue;
      if (m[1] === "progress" && m[2].trim() === "end") { bitti = true; continue; }
      if (m[1] !== "out_time_us" && m[1] !== "out_time_ms" && m[1] !== "out_time") continue;
      var t = zamanSn(m[1], m[2]);
      if (t === null || !isFinite(t)) continue;
      son = t;
    }
    if (bitti) return 1;
    if (son === null || !(s > 0) || !isFinite(s)) return null;
    return Math.max(0, Math.min(1, son / s));
  }

  /*
   * Akan stdout için okuyucu: parça parça gelen metni satırlara böler (yarım satırı saklar), her yeni
   * oran için fn(oran). Döner: fn(parça). Bellek: yalnız son yarım satır tutulur.
   */
  function ilerlemeOkuyucu(sure, fn) {
    var artik = "";
    return function (parca) {
      var metin = artik + String(parca === undefined || parca === null ? "" : parca);
      var kes = metin.lastIndexOf("\n");
      if (kes === -1) { artik = metin.slice(-4096); return; }
      artik = metin.slice(kes + 1);
      var p = ilerlemeCoz(metin.slice(0, kes).split("\n"), sure);
      if (p !== null && typeof fn === "function") fn(p);
    };
  }

  function kalanMetni(sn) {
    if (WA && WA.sureMetni) return WA.sureMetni(sn);
    var s = Math.max(1, Math.round(Number(sn) || 0));
    return s < 60 ? s + " sn" : Math.round(s / 60) + " dk";
  }

  /*
   * 'Altyazı katmanı çiziliyor · %42 · ~1 dk 10 sn kaldı' (transkripsiyonla aynı kalıp; " · " ile ayrılan
   * her parça İngilizce arayüzde ayrı çevrilir). Kalan süre geçen süreden kestirilir: en az %3 ve 1,5 sn
   * sonra (ilk saniyelerin font yükleme / açılış masrafı tahmini şişirmesin).
   */
  function ilerlemeMetni(oran, gecenMs, onEk) {
    var p = Math.max(0, Math.min(1, Number(oran) || 0));
    var parca = [onEk || "Altyazı katmanı çiziliyor", "%" + Math.min(100, Math.floor(p * 100 + 1e-9))];
    var g = Number(gecenMs) / 1000;
    if (p >= 0.03 && p < 1 && g >= 1.5 && isFinite(g)) {
      var kalan = kalanMetni(g * (1 - p) / p);
      if (kalan) parca.push("~" + kalan + " kaldı");
    }
    return parca.join(" · ");
  }

  /* ---------------- hata metinleri (saf) ---------------- */

  // stderr'in son anlamlı satırı: "[Parsed_x @ 0x55..] " öneki atılır, kırpılır
  function sonSatir(stderr) {
    var satirlar = String(stderr || "").split(/\r?\n/).map(function (x) {
      return x.replace(/^\s*\[[^\]]*@\s*(0x)?[0-9a-f]+\]\s*/i, "").trim();
    }).filter(function (x) { return x && x !== "[zaman aşımı]"; });
    return satirlar.length ? satirlar[satirlar.length - 1].slice(0, 200) : "";
  }

  /*
   * Bilinen ffmpeg / dosya sistemi hatalarının sınıfı:
   *   iptal | zaman | disk | filtre | izin | boyut | font | bilinmiyor
   * Sıra önemli: özel olan önce. Font: Windows derlemeleri her çizimde "Fontconfig error: Cannot load
   * default config file" yazar (başarıda da); yalnız gerçek yükleme hatası ya da son satır font diyorsa.
   */
  /*
   * libass'in başarılı çizimde de yazdığı bilgi satırları (font eşlemesi, emoji için yedek font arayışı). ffmpeg
   * mesajsız çökerse / öldürülürse son satır bunlardan biri olur: "font" sayılmamalı (yanlış "yeniden kur" önerisi).
   */
  var FONT_BILGI = /^fontselect: \(.*\) -> |^Glyph 0x[0-9a-f]+ not found, selecting one more font|^Using font provider|^Loading font file|^Font info:|^Shaper:|^Added subtitle file|^Error opening (memory )?font/i;   // gerçek font dosyası hatası FONT_ACILAMADI'yla önce yakalanır

  /*
   * fontsdir=. ile libass çalışma klasöründeki HER dosyayı font diye dener ve her çizimde (başarıda da) "Error opening
   * memory font 'altyazi.ass'" (logo.png, parcalar.txt…) yazar: yalnız adı gerçek font dosyası olan satır font hatasıdır.
   */
  var FONT_ACILAMADI = /Error opening (memory )?font:? *'?[^'\n]*\.(ttf|otf|ttc|otc|woff2?)'?/i;

  function hataSinifi(stderr, kod) {
    var s = String(stderr || "");
    if (Number(kod) === -2) return "iptal";
    if (/\[zaman aşımı\]/.test(s)) return "zaman";
    if (/No space left on device|ENOSPC|Disk quota exceeded|not enough space on the disk/i.test(s)) return "disk";
    if (/No such filter: '?(subtitles|ass)'?|Unknown filter '?(subtitles|ass)'?/i.test(s)) return "filtre";
    if (/Permission denied|EACCES|EPERM|Operation not permitted|Access is denied|Read-only file system|EROFS/i.test(s)) return "izin";
    if (/Invalid (frame |video )?size|Picture size \d+x\d+ is invalid|(width|height) (must be|not) divisible by 2|Unable to parse option value "?\d*x?\d*"? as image size/i.test(s)) return "boyut";
    var son = sonSatir(s);
    if (FONT_ACILAMADI.test(s) || /No usable fontconfig configuration|Error initializing fontconfig|fontconfig_init failed/i.test(s) ||
      (/font|glyph/i.test(son) && !FONT_BILGI.test(son))) return "font";
    return "bilinmiyor";
  }

  function klasorAdi(yol) {
    var p = String(yol || "");
    var i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    return i > 0 ? p.slice(0, i) : p;
  }

  /*
   * Kullanıcıya gösterilecek, ne yapacağını söyleyen Türkçe hata (İngilizcesi i18n/en.js'te).
   *   stderr  ffmpeg'in stderr'i     kod  çıkış kodu (-2 iptal, -1 zaman aşımı / başlatılamadı)
   *   baglam  { onek? (bilinmeyen hatanın başı, ör. "Başlık katmanı üretilemedi: "), cikti?, g?, y? }
   */
  function hataMetni(stderr, kod, baglam) {
    baglam = baglam || {};
    switch (hataSinifi(stderr, kod)) {
      case "iptal": return "İptal edildi";
      case "zaman": return "Katman çizimi zaman sınırını aştı ve durduruldu. Daha kısa bir aralıkla (In/Out) ya da bilgisayar boştayken tekrar dene.";
      case "disk": return "Diskte yer kalmadı: katman dosyası yazılamadı. Yer açıp tekrar dene. Çıktı klasörü: " + klasorAdi(baglam.cikti || "?");
      case "filtre": return "ffmpeg'in altyazı filtresi yok: Ayarlar › ffmpeg'den Suflo ffmpeg'ini kur.";
      case "izin": return "Çıktı klasörüne yazılamıyor (izin yok). Klasörün yazılabilir olduğundan emin ol; korumalı klasörse güvenlik yazılımında Premiere'e izin ver. Çıktı klasörü: " + klasorAdi(baglam.cikti || "?");
      case "boyut": return "Katman boyutu geçersiz (" + (baglam.g || "?") + "×" + (baglam.y || "?") + "): sekans ayarlarında kare boyutunu denetle, genişlik ve yükseklik çift sayı olmalı.";
      case "font": return "Yazı tipi yüklenemedi: Suflo'nun yazı tipi dosyaları eksik ya da bozuk olabilir. Suflo'yu yeniden kur ya da başka bir yazı tipi seç.";
      default:
        var son = sonSatir(stderr);
        return (baglam.onek || "Altyazı katmanı üretilemedi: ") + (son || ("ffmpeg kod " + kod));
    }
  }

  /* ---------------- iptal ---------------- */

  // bridge.js iptalJetonu ile aynı arayüz: parçalı render kardeş süreçleri tek seferde öldürür
  function yerelJeton() {
    var dinleyiciler = [];
    var j = {
      iptalEdildi: false,
      iptal: function () {
        if (j.iptalEdildi) return;
        j.iptalEdildi = true;
        var liste = dinleyiciler.slice();
        dinleyiciler.length = 0;
        for (var i = 0; i < liste.length; i++) { try { liste[i](); } catch (e) {} }
      },
      dinle: function (fn) {
        if (typeof fn !== "function") return function () {};
        if (j.iptalEdildi) { try { fn(); } catch (e0) {} return function () {}; }
        dinleyiciler.push(fn);
        return function () { var k = dinleyiciler.indexOf(fn); if (k !== -1) dinleyiciler.splice(k, 1); };
      }
    };
    return j;
  }

  function iptalHatasi(K) {
    var e = K && typeof K.iptalHatasi === "function" ? K.iptalHatasi("İptal edildi") : new Error("İptal edildi");
    e.iptal = true;
    return e;
  }

  /*
   * Panel önizlemesi (webm) aynı yerleşimle: stil + logo + isteğe bağlı güvenli alan kutuları.
   * o: { assName, w, h, dur, kare? (göreli ya da mutlak arka plan resmi), logo?, ekVf?, out }
   */
  function previewArgs(o) {
    o = o || {};
    var d = Number(o.dur).toFixed(2);
    var vf = "ass=" + o.assName + ":fontsdir=.";
    var args = ["-y"], on = "", logolu = logoGecerli(o.logo);
    if (o.kare) {
      args.push("-loop", "1", "-i", o.kare);
      if (!logolu) args.push("-t", d);   // eski komutla aynı sıra (çıktı seçeneği)
      on = "scale=" + o.w + ":" + o.h + ":force_original_aspect_ratio=increase,crop=" + o.w + ":" + o.h + ",";
    } else {
      args.push("-f", "lavfi", "-i", "color=c=#101522:s=" + o.w + "x" + o.h + ":r=24:d=" + d);
    }
    var ek = o.ekVf ? "," + o.ekVf : "";
    if (logolu) {
      // -t burada çıktı seçeneği: iki döngülü girdi de (kare + logo) süreye kırpılır
      args.push("-loop", "1", "-i", o.logo.name, "-filter_complex",
        "[0:v]" + on + vf + "[s];" + logoFiltresi(o.logo, "[s]", "[1:v]") + ek, "-t", d);
    } else {
      args.push("-vf", on + vf + ek);
    }
    args.push("-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0", "-pix_fmt", "yuv420p", "-an", o.out);
    return args;
  }

  /*
   * Kayıttaki logo ayarı ({ path, kose, oran, guvenli }) → geçici klasördeki kopya + yerleşim.
   * Dosya yoksa / okunamıyorsa null (katman logosuz üretilir, çağıran kullanıcıya söyler).
   */
  function logoHazirla(K, dizin, logo, w, h) {
    if (!logo || !logo.path) return null;
    var uzanti = (String(logo.path).match(/\.(png|jpe?g)$/i) || [])[1];
    if (!uzanti) return null;
    try {
      if (!K.fs.existsSync(logo.path)) return null;
      var ad = "logo." + uzanti.toLowerCase();
      K.fs.copyFileSync(logo.path, K.path.join(dizin, ad));
      var yer = MK ? MK.logoPlacement(w, h, logo.kose, logo.oran, logo.guvenli)
        : { lw: Math.max(2, Math.round(w * 0.14 / 2) * 2), x: Math.round(Math.min(w, h) * 0.04), yExpr: String(Math.round(Math.min(w, h) * 0.04)) };
      return { name: ad, lw: yer.lw, x: yer.x, y: yer.yExpr };
    } catch (e) {
      if (K.log) K.log("[katman] logo kopyalanamadı: " + e.message);
      return null;
    }
  }

  /*
   * Deneme (filigranlı) katmanda logo filigranın üstüne binmesin: filigran sağ üstte,
   * sağ köşedeki logo aynı yükseklikteki sol köşeye geçer (MK.watermarkSafeCorner). Kayıttaki ayar değişmez;
   * satın alma sonrası temiz yeniden oluşturmada logo seçilen köşede çıkar.
   */
  function filigranaGoreLogo(logo, ass) {
    if (!logo || !FILIGRAN_STILI.test(String(ass || ""))) return logo;
    var out = {};
    Object.keys(logo).forEach(function (k) { out[k] = logo[k]; });
    out.kose = MK ? MK.watermarkSafeCorner(logo.kose) : "ss";
    return out;
  }

  function uzantiFontlari(K) {
    var kok;
    try { kok = decodeURI(K.extensionPath()); } catch (e) { kok = K.extensionPath(); }
    return K.path.join(kok, "fonts");
  }

  // Klasörü alt klasörleriyle sil (parçalı render'ın parca-i klasörleri). Döner: tamamen silindi mi
  function klasoruSil(K, dizin) {
    try {
      K.fs.readdirSync(dizin).forEach(function (f) {
        var p = K.path.join(dizin, f), alt = false;
        try { alt = K.fs.statSync(p).isDirectory(); } catch (eS) { alt = false; }
        if (alt) klasoruSil(K, p);
        else { try { K.fs.unlinkSync(p); } catch (e) {} }
      });
      K.fs.rmdirSync(dizin);
      return true;
    } catch (e2) {
      try { return !K.fs.existsSync(dizin); } catch (e3) { return false; }
    }
  }

  function dosyaSil(K, yol) {
    try { if (K.fs.existsSync(yol)) K.fs.unlinkSync(yol); } catch (e) {}
    try { return !K.fs.existsSync(yol); } catch (e2) { return true; }
  }

  /*
   * İptalden hemen sonra Windows'ta taskkill zaman uyumsuz: ölmekte olan ffmpeg dosyayı birkaç yüz ms
   * kilitli tutabilir (EBUSY). Silinemeyen geçici klasör / yarım çıktı 1 ve 4 sn sonra yeniden denenir;
   * yine kalırsa "overlay-" öneki sayesinde bridge.js sweepTemp bir gün sonra süpürür.
   */
  function sonraSil(K, isler) {
    if (typeof setTimeout !== "function") return;
    [1000, 4000].forEach(function (ms) {
      var t = setTimeout(function () {
        isler.forEach(function (x) { try { x(); } catch (e) {} });
      }, ms);
      if (t && typeof t.unref === "function") t.unref();
    });
  }

  function cpuSayisi(K) {
    try { return K.os && K.os.cpus ? K.os.cpus().length : 1; } catch (e) { return 1; }
  }

  // Parçanın klasörü: ASS, fontlar ve logo KENDİ kopyası (fontsdir=. göreli; her ffmpeg kendi cwd'sinde)
  function parcaKlasoru(K, dizin, i, dosyalar) {
    var pd = K.path.join(dizin, "parca-" + i);
    K.fs.mkdirSync(pd, { recursive: true });
    dosyalar.forEach(function (ad) { K.fs.copyFileSync(K.path.join(dizin, ad), K.path.join(pd, ad)); });
    return pd;
  }

  /*
   * Parçaları eş zamanlı çiz, concat demuxer ile -c copy birleştir.
   * Döner: { ok: true } | { iptal: true } | { ok: false, r, neden, tekrarlanmaz? }
   *   tekrarlanmaz: tek süreçli yolun da aynı yere takılacağı hata (zaman aşımı, disk, izin, filtre yok)
   */
  async function parcaliCiz(K, c) {
    var grup = yerelJeton();
    var birak = c.jeton ? c.jeton.dinle(function () { grup.iptal(); }) : null;
    var oranlar = c.plan.map(function () { return 0; });
    var toplam = c.plan.reduce(function (a, p) { return a + p.kare; }, 0);
    var ilkHata = null;
    function bildir() {
      var t = 0;
      for (var i = 0; i < oranlar.length; i++) t += oranlar[i] * c.plan[i].kare;
      c.ilerlet(toplam ? t / toplam : 0);
    }
    try {
      /*
       * Bütün parça klasörleri hiçbir ffmpeg başlamadan hazırlanır. Kopyalarken disk dolarsa (uzun transkriptte ASS
       * onlarca MB, parça başına bir kopya) ham ENOSPC fırlatılmaz: sıradan başarısızlık döner, render tek süreçle
       * (tek kopya yeter; parça kopyaları finally'de silinir) yeniden dener. Bilerek tekrarlanmaz DEĞİL: yer, tek
       * sürecin gerektirmediği ek kopyalarda bitti. Tek süreç de sığmazsa hataMetni'nin "disk" metni gelir.
       */
      var klasorler;
      try { klasorler = c.plan.map(function (p, i) { return parcaKlasoru(K, c.dizin, i, c.dosyalar); }); }
      catch (eK) {
        var mK = String(eK && eK.message || eK);
        return { ok: false, r: { code: -1, stderr: mK }, neden: "parça klasörü hazırlanamadı: " + mK };
      }
      var isler = c.plan.map(function (p, i) {
        var pd = klasorler[i];
        var args = parcaArgs({ assName: c.assAd, fontsdir: c.fontsdir, w: c.g, h: c.y, fps: c.fps, bas: p.bas, kare: p.kare,
          logo: c.logo, out: "parca.mov" });
        return K.run(c.ff, args, {
          cwd: pd, timeout: c.timeout, iptal: grup,
          onStdout: ilerlemeOkuyucu(p.kare / c.fps, function (x) { oranlar[i] = x; bildir(); })
        }).then(function (r) {
          r = r || { code: -1, stderr: "" };
          if (!r.iptal && (r.code !== 0 || !K.fs.existsSync(K.path.join(pd, "parca.mov"))) && !ilkHata) {
            ilkHata = { i: i, r: r };
            grup.iptal();   // kardeşler boşuna çizmesin
          } else if (!r.iptal) { oranlar[i] = 1; bildir(); }
          return r;
        });
      });
      await Promise.all(isler);
      if (c.jeton && c.jeton.iptalEdildi) return { iptal: true };
      if (ilkHata) {
        var sinif = hataSinifi(ilkHata.r.stderr, ilkHata.r.code);
        return { ok: false, r: ilkHata.r, neden: "parça " + (ilkHata.i + 1) + ": " + sonSatir(ilkHata.r.stderr) + " (kod " + ilkHata.r.code + ")",
          tekrarlanmaz: ["zaman", "disk", "izin", "filtre"].indexOf(sinif) !== -1 };
      }
      var liste = c.plan.map(function (p, i) { return concatSatiri("parca-" + i + "/parca.mov"); }).join("\n") + "\n";
      K.fs.writeFileSync(K.path.join(c.dizin, "parcalar.txt"), liste, "utf8");
      if (typeof c.durum === "function") c.durum("Parçalar birleştiriliyor…");
      var rb = await K.run(c.ff, ["-y", "-hide_banner", "-nostats", "-f", "concat", "-safe", "0", "-i", "parcalar.txt", "-c", "copy", "-an", c.cikti],
        { cwd: c.dizin, timeout: c.timeout, iptal: c.jeton || undefined });
      rb = rb || { code: -1, stderr: "" };
      if (rb.iptal || (c.jeton && c.jeton.iptalEdildi)) return { iptal: true };
      if (rb.code !== 0 || !K.fs.existsSync(c.cikti)) {
        var sb = hataSinifi(rb.stderr, rb.code);
        // disk dolu burada tekrarlanır: birleştirme parçalar + çıktı (2 kat) yer ister; parça klasörleri silindikten
        // sonra tek süreç yalnız çıktı kadar yerle sığabilir
        return { ok: false, r: rb, neden: "birleştirme: " + sonSatir(rb.stderr) + " (kod " + rb.code + ")",
          tekrarlanmaz: ["zaman", "izin"].indexOf(sb) !== -1 };
      }
      return { ok: true };
    } finally {
      if (birak) birak();
      grup.iptal();   // biten iş: dinleyiciler bırakılır (süreçler zaten kapandı)
      // parça klasörleri artık gereksiz (birleştirildi ya da tek süreçle yeniden çizilecek): diskte yer tutmasın.
      // Silinemeyen (Windows'ta ölmekte olan süreç kilidi) render'ın kendi temizliğinde yeniden denenir.
      c.plan.forEach(function (p, i) { klasoruSil(K, K.path.join(c.dizin, "parca-" + i)); });
    }
  }

  /*
   * o: { ass, fontFiles, g, y, fps, sure, cikti?, assAd?, onek?, fontDizini?, timeout?, durum?(msg), durumMetni?,
   *      ilerlemeOneki?, hataOneki?, logo?: { path, kose, oran, guvenli }, iptal? (K.iptalJetonu()),
   *      parcaZorla? (≥ 2: parçalı yolu eşiksiz zorla; test), cpus? (çekirdek sayısı; verilmezse K.os) }
   * Döner: { path, g, y, fps, sure, kare, parca, logo: bool, logoAtlandi: bool }.
   * Hata: Error (hataMetni); iptalde e.iptal = true. Geçici klasör ve (başarısızlıkta) yarım çıktı her durumda silinir.
   * Süre sınırı katmanla büyür: katman süresinin 3 katı; altı o.timeout (verilmezse eskisi gibi 1 saat), en az 10 dk.
   *   (Yavaş bilgisayarda ağır efektli 4K katman gerçek zamanın birkaç katı sürebilir: 1 saatlik eski taban düşürülmez.)
   */
  async function render(K, o) {
    o = o || {};
    var g = ciftBoyut(o.g), y = ciftBoyut(o.y);
    var fps = gecerliFps(o.fps);
    var sure = Number(o.sure);
    if (!(g > 0 && y > 0 && sure > 0 && isFinite(sure))) throw new Error("Katman boyutu ya da süresi geçersiz.");
    if (typeof o.ass !== "string" || !o.ass) throw new Error("Yazılacak altyazı yok.");
    var jeton = o.iptal && typeof o.iptal.dinle === "function" ? o.iptal : null;
    if (jeton && jeton.iptalEdildi) throw iptalHatasi(K);
    var assAd = o.assAd || "altyazi.ass";
    // "overlay-" öneki: yarıda kalan klasörü bridge.js sweepTemp bir gün sonra süpürür
    var dizin = K.path.join(K.tmpDir(), (o.onek || "overlay-") + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
    K.fs.mkdirSync(dizin, { recursive: true });
    var cikti = o.cikti || K.path.join(K.srtDir(), "suflo-altyazi-" + Date.now() + ".mov");
    var ciktiOnceVardi = false;
    try { ciktiOnceVardi = K.fs.existsSync(cikti); } catch (eV) { ciktiOnceVardi = false; }
    var basarili = false, iptalOldu = false;
    try {
      K.fs.writeFileSync(K.path.join(dizin, assAd), o.ass, "utf8");
      var dosyalar = [assAd];
      var fontsdir = "";
      var fontKok = o.fontDizini || uzantiFontlari(K);
      (o.fontFiles || []).filter(Boolean).forEach(function (f) {
        var ad = K.path.basename(String(f));   // yalnız dosya adı: kayıttan gelen yol klasör dışına çıkamaz
        try {
          var src = K.path.join(fontKok, ad);
          if (K.fs.existsSync(src)) {
            K.fs.copyFileSync(src, K.path.join(dizin, ad));
            if (dosyalar.indexOf(ad) === -1) dosyalar.push(ad);
            fontsdir = ":fontsdir=.";
          } else if (K.log) K.log("[katman] paket font dosyası yok: " + src);
        } catch (eF) { if (K.log) K.log("[katman] font kopyalanamadı: " + eF.message); }
      });

      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı.");
      if (K.libassUyarisi && K.libassUyarisi()) throw new Error(K.libassUyarisi());
      if (jeton && jeton.iptalEdildi) throw iptalHatasi(K);

      K.fs.mkdirSync(K.path.dirname(cikti), { recursive: true });
      var logo = o.logo ? logoHazirla(K, dizin, filigranaGoreLogo(o.logo, o.ass), g, y) : null;
      if (logo) dosyalar.push(logo.name);
      if (typeof o.durum === "function") o.durum((o.durumMetni || "Altyazı katmanı hazırlanıyor…") + " (" + Math.round(sure) + " sn)");

      var timeout = Math.max(Number(o.timeout) > 0 ? Number(o.timeout) : 3600000, 600000, Math.round(sure * 3000));
      var kare = kareSayisi(sure, fps);
      var basMs = Date.now(), sonPct = -1, sonAn = 0;
      var ilerlet = function (p) {
        if (typeof o.durum !== "function" || (jeton && jeton.iptalEdildi)) return;
        var pct = Math.floor(p * 100), an = Date.now();
        // ffmpeg süreç başına ~2 kez/sn yazar (parçalıda 4 süreç): durum satırı titremesin
        if ((pct === sonPct && an - sonAn < 1000) || (an - sonAn < 250 && p < 1)) return;
        sonPct = pct; sonAn = an;
        o.durum(ilerlemeMetni(p, an - basMs, o.ilerlemeOneki));
      };
      var baglam = { onek: o.hataOneki, cikti: cikti, g: g, y: y };

      var plan = parcaPlani(sure, fps, o.cpus !== undefined ? o.cpus : cpuSayisi(K), o.parcaZorla, (g * y) / (1920 * 1080));
      var parcali = null;
      if (plan.length > 1) {
        parcali = await parcaliCiz(K, { ff: ff, dizin: dizin, dosyalar: dosyalar, assAd: assAd, fontsdir: fontsdir ? "." : "",
          g: g, y: y, fps: fps, plan: plan, logo: logo, cikti: cikti, timeout: timeout, jeton: jeton, ilerlet: ilerlet, durum: o.durum });
        if (parcali.iptal) { iptalOldu = true; throw iptalHatasi(K); }
        if (!parcali.ok) {
          if (K.log) K.log("[katman] parçalı render başarısız, tek süreçle yeniden: " + parcali.neden);
          if (parcali.tekrarlanmaz) throw new Error(hataMetni(parcali.r.stderr, parcali.r.code, baglam));
          dosyaSil(K, cikti);
          basMs = Date.now(); sonPct = -1;
        }
      }
      if (!parcali || !parcali.ok) {
        var r = await K.run(ff, buildArgs({ assName: assAd, fontsdir: fontsdir ? "." : "", w: g, h: y, fps: fps, dur: sure, logo: logo,
          out: cikti, kare: kare, ilerleme: true }), { timeout: timeout, cwd: dizin, iptal: jeton || undefined, onStdout: ilerlemeOkuyucu(sure, ilerlet) });
        r = r || { code: -1, stderr: "" };
        if (r.iptal || (jeton && jeton.iptalEdildi)) { iptalOldu = true; throw iptalHatasi(K); }
        if (r.code !== 0 || !K.fs.existsSync(cikti)) throw new Error(hataMetni(r.stderr, r.code, baglam));
      }
      basarili = true;
      return { path: cikti, g: g, y: y, fps: fps, sure: sure, kare: kare, parca: parcali && parcali.ok ? plan.length : 1,
        logo: !!logo, logoAtlandi: !!(o.logo && o.logo.path && !logo) };
    } finally {
      var dizinGitti = klasoruSil(K, dizin);
      var ciktiGitti = basarili || ciktiOnceVardi ? true : dosyaSil(K, cikti);
      if (iptalOldu && (!dizinGitti || !ciktiGitti)) {
        sonraSil(K, [function () { klasoruSil(K, dizin); }, function () { if (!ciktiOnceVardi) dosyaSil(K, cikti); }]);
      }
    }
  }

  // Türkçe ondalık: 12.5 → "12,5"
  function saniyeMetni(x) {
    var n = Math.round((Number(x) || 0) * 10) / 10;
    return String(n).replace(".", ",");
  }

  /*
   * Deneme katmanı timeline'da ilk konduğu gibi mi? Tek örnek; başlangıcı kayıttaki an;
   * baştan ve sondan kırpılmamış; hızı değişmemiş. Yalnız o zaman "yeni temiz klibi koy,
   * eskisini kaldır" kurguyu bozmaz. ornekler: KS_overlayInstances çıktısı (sn).
   * Tolerans: başlangıç ve giriş için yarım kare, süre için bir kare (render kare yuvarlaması).
   */
  function ilkHalinde(kayit, ornekler, kare) {
    if (!kayit || !ornekler || ornekler.length !== 1) return false;
    var o = ornekler[0];
    var k = Number(kare) > 0 ? Number(kare) : (Number(kayit.fps) > 0 ? 1 / Number(kayit.fps) : 1 / 24);
    if (Number(kayit.fps) > 0) k = Math.max(k, 1 / Number(kayit.fps));
    var yarim = k / 2 + 0.002, tam = k + 0.002;
    var bas = Number(o.start), bit = Number(o.end), gir = Number(o.inPoint), cik = Number(o.outPoint), sure = Number(kayit.sure);
    if (![bas, bit, gir, cik, sure, Number(kayit.start)].every(function (x) { return isFinite(x) && x >= 0; })) return false;
    return Math.abs(bas - Number(kayit.start)) <= yarim &&
      Math.abs(gir) <= yarim &&
      Math.abs(cik - sure) <= tam &&
      Math.abs((bit - bas) - sure) <= tam;
  }

  // Düzenlenmiş deneme klibi: timeline'a dokunulmaz, temiz dosya elle bağlanır (Replace Footage)
  function elleMesaji(kayit, temizYol) {
    var ad = kayit && kayit.ad ? kayit.ad : "Suflo Altyazı Efekti";
    return "Deneme klibi timeline'da düzenlenmiş (taşınmış, kırpılmış, bölünmüş ya da kopyalanmış); kurgun bozulmasın diye Suflo ona dokunmadı. " +
      "Proje panelinde \"" + ad + "\" öğesine sağ tıkla, Replace Footage ile temiz dosyayı seç (düzenlemelerin korunur), sonra listeden çıkar. Temiz dosya: " + temizYol;
  }

  /*
   * Başarılı temiz yeniden oluşturma için bildirim: { metin, tur: "good"|"warn" }.
   *   degistir:  deneme dosyası projede yerinde temiz olanla değiştirildi (düzenlemeler korunur)
   *   yerineKoy: tek, düzenlenmemiş klip vardı: temiz klip aynı ana kondu, eskisi kaldırıldı
   *   yerlestir: bu sekansta deneme klibi yoktu: temiz klip ilk konduğu ana kondu
   */
  function sonucMesaji(r) {
    r = r || {};
    if (r.yontem === "degistir") {
      var kalan = Number(r.degismeyen) || 0;
      return kalan > 0
        ? { metin: "Filigran kısmen kaldırıldı: " + kalan + " proje öğesi değiştirilemedi. Proje panelinde ona sağ tıkla, Replace Footage ile temiz dosyayı seç: " + (r.path || ""), tur: "warn" }
        : { metin: "Filigran kaldırıldı: deneme dosyası projede temiz olanla değiştirildi, timeline'daki düzenlemelerin aynen duruyor", tur: "good" };
    }
    var iz = r.yer && r.yer.trackName ? r.yer.trackName : "V?";
    if (r.yontem === "yerlestir") {
      var an = r.yer && typeof r.yer.start === "number" ? r.yer.start : 0;
      return { metin: "Bu sekansta deneme klibi bulunamadı: temiz katman ilk konduğu yere kondu (" + iz + ", " + saniyeMetni(an) + " sn)", tur: "warn" };
    }
    var eski = r.kaldirmaHatasi ? " · eski filigranlı katman kaldırılamadı, elle sil"
      : (Number(r.kaldirilan) > 0 ? "" : " · eski filigranlı katman bulunamadı, varsa elle sil");
    return { metin: "Temiz katman " + iz + " katmanına kondu" + eski, tur: eski ? "warn" : "good" };
  }

  /*
   * Satın alma sonrası: deneme çıktısını (filigranlı) filigransız yeniden üret ve değiştir.
   *   1) Premiere'de kaydın sekansı açık olmalı (değilse "O sekansı aç")
   *   2) kaydedilen temiz ASS aynı boyut/fps/süreyle yeniden render edilir
   *   3) ÖNCE yerinde değiştirme: KS_swapOverlayMedia projedeki deneme öğesini temiz dosyaya
   *      bağlar (changeMediaPath). Kullanıcının taşıdığı, kırptığı, böldüğü, kopyaladığı her
   *      klip ve eklediği efektler olduğu gibi kalır. Proje düzeyinde: sekans değişse de güvenli.
   *   4) Değiştirilemezse (yedek yol) sekans yeniden doğrulanır ve deneme klibinin ŞİMDİKİ hâline
   *      bakılır (KS_overlayInstances, yalnız okur):
   *        - tek ve ilk hâlinde klip: temiz klip kaydın başlangıcına konur, YALNIZ yerleştirme
   *          başarılıysa eskisi KS_removeOverlay ile kaldırılır: yalnız {path} verilir, ASLA nodeId
   *          (host.jsx: nodeId eşleşmesi kullanıcının eski kliplerini silebiliyordu)
   *        - hiç klip yok: temiz klip kaydın başlangıcına konur (kaldırılacak bir şey yok)
   *        - düzenlenmiş (taşınmış/kırpılmış/bölünmüş/çoğaltılmış): timeline'a DOKUNULMAZ; temiz
   *          dosya bırakılır ve elle bağlama (Replace Footage) yolu söylenir ({ elle: true })
   * Döner: { ok, hata?, sekansAc?, elle?, yontem?, yer?, kaldirilan?, kaldirmaHatasi?, degisen?, degismeyen?, path? }
   */
  async function temizYenidenOlustur(K, kayit, o) {
    o = o || {};
    if (!kayit || typeof kayit.assTemiz !== "string" || !kayit.path || !kayit.sequenceId) {
      return { ok: false, hata: "Deneme kaydı okunamadı." };
    }
    var sekansMesaji = kayit.sekans ? "O sekansı aç: " + kayit.sekans + "." : "O sekansı aç.";
    async function ayniSekans() {
      var c = await K.call("KS_getContext", undefined, 15000);
      if (!c || c.ok === false) return { ok: false, hata: (c && c.error) || "Premiere yanıt vermedi." };
      if (!c.sequenceId || String(c.sequenceId) !== String(kayit.sequenceId)) return { ok: false, sekansAc: true, hata: sekansMesaji };
      return { ok: true };
    }
    var s1 = await ayniSekans();
    if (!s1.ok) return s1;

    var cikti = K.path.join(K.srtDir(), "suflo-temiz-" + (kayit.tur === "kanca" ? "kanca" : "altyazi") + "-" + Date.now() + ".mov");
    function ciktiyiSil() { try { K.fs.unlinkSync(cikti); } catch (e) {} }
    try {
      await render(K, {
        ass: kayit.assTemiz, fontFiles: kayit.fontFiles, g: kayit.g, y: kayit.y, fps: kayit.fps, sure: kayit.sure,
        cikti: cikti, assAd: kayit.tur === "kanca" ? "kanca.ass" : "altyazi.ass", onek: "overlay-temiz-",
        fontDizini: o.fontDizini, durum: o.durum, logo: kayit.logo || null
      });
    } catch (e) {
      ciktiyiSil();
      return { ok: false, hata: e && e.message ? e.message : String(e) };
    }

    // 3) yerinde değiştir: timeline'daki her düzenleme korunur
    var sw = await K.call("KS_swapOverlayMedia", { path: kayit.path, newPath: cikti }, 60000);
    var degisen = sw && sw.ok ? (Number(sw.swapped) || 0) : 0;
    if (degisen > 0) {
      return { ok: true, yontem: "degistir", path: cikti, degisen: degisen, degismeyen: Math.max(0, (Number(sw.items) || 0) - degisen) };
    }
    var sebep = (sw && (sw.reason || sw.error)) || "-";
    if (K.log) K.log("[temiz] yerinde değiştirilemedi: " + sebep);

    // 4) yedek yol. Render dakikalar sürebilir: bu arada başka sekansa geçildiyse yanlış sekansa koyma
    var s2 = await ayniSekans();
    if (!s2.ok) { ciktiyiSil(); return s2; }
    var d = await K.call("KS_overlayInstances", { path: kayit.path }, 30000);
    if (!d || !d.ok) {
      ciktiyiSil();
      return { ok: false, hata: (d && d.error) || "Premiere yanıt vermedi." };
    }
    var ornekler = d.instances || [];
    if (ornekler.length && !ilkHalinde(kayit, ornekler, d.frame)) {
      return { ok: false, elle: true, path: cikti, hata: elleMesaji(kayit, cikti) };
    }

    var yer = await K.call("KS_placeOverlay", { path: cikti, at: kayit.start, name: kayit.ad || "Suflo Altyazı Efekti" }, 120000);
    if (!yer || !yer.ok) {
      ciktiyiSil();
      return { ok: false, hata: (yer && yer.error) || "Temiz katman timeline'a konamadı." };
    }
    if (!ornekler.length) return { ok: true, yontem: "yerlestir", yer: yer, path: cikti, kaldirilan: 0, kaldirmaHatasi: "" };
    var kal = await K.call("KS_removeOverlay", { path: kayit.path }, 60000);
    return {
      ok: true, yontem: "yerineKoy", yer: yer, path: cikti,
      kaldirilan: kal && kal.ok ? (Number(kal.removed) || 0) : 0,
      kaldirmaHatasi: kal && kal.ok ? "" : ((kal && kal.error) || "Eski katman kaldırılamadı.")
    };
  }

  /*
   * Deneme (filigranlı) çıktısını, satın alma sonrası temiz yeniden oluşturulsun diye kaydet.
   * Katman az önce konduğu için etkin sekans o sekanstır: kimliği taze sorulur.
   * k: { tur, start, path, ad, assTemiz, fontFiles, g, y, fps, sure, logo? }. Hata işlemi bozmaz (false).
   */
  async function denemeKaydet(K, Pro, k) {
    if (!Pro || !Pro.denemeCiktisiEkle || !k) return false;
    try {
      var c = await K.call("KS_getContext", undefined, 15000);
      if (!c || c.ok === false || !c.sequenceId) return false;
      k.sequenceId = String(c.sequenceId);
      k.sekans = String(c.sequence || "");
      k.ts = Date.now();
      return Pro.denemeCiktisiEkle(k) === true;
    } catch (e) { return false; }
  }

  return {
    ciftBoyut: ciftBoyut, kaynak: kaynak, ffmpegArgs: ffmpegArgs, buildArgs: buildArgs, previewArgs: previewArgs,
    kareSayisi: kareSayisi, kareZamanlari: kareZamanlari, LIBASS_PAY: LIBASS_PAY, parcaPlani: parcaPlani, parcaKaynak: parcaKaynak, parcaArgs: parcaArgs, concatSatiri: concatSatiri,
    PARCA_ESIK_SN: PARCA_ESIK_SN, ilerlemeCoz: ilerlemeCoz, ilerlemeOkuyucu: ilerlemeOkuyucu, ilerlemeMetni: ilerlemeMetni,
    hataSinifi: hataSinifi, hataMetni: hataMetni, sonSatir: sonSatir, yerelJeton: yerelJeton,
    logoHazirla: logoHazirla, filigranaGoreLogo: filigranaGoreLogo, render: render,
    ilkHalinde: ilkHalinde, elleMesaji: elleMesaji, sonucMesaji: sonucMesaji,
    temizYenidenOlustur: temizYenidenOlustur, denemeKaydet: denemeKaydet
  };
});
