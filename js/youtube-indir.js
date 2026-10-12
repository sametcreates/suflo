/*
 * Suflo — YouTube indirici: saf mantık (v3.3)
 *
 * yt-dlp (https://github.com/yt-dlp/yt-dlp, Unlicense) ilk kullanımda indirilir ve aynı sürümün
 * SHA2-256SUMS dosyasıyla doğrulanmadan çalıştırılmaz. Bu modül DOM'a, dosyaya, ağa ve sürece
 * dokunmaz; panel tarafı (js/youtube-indir-ui.js) yalnız buradaki kararları uygular. Node ve
 * tarayıcıda aynı çalışır (UMD: window.SufloYoutubeIndir / module.exports),
 * tests/test-youtube-indir.js ile sınanır.
 *
 *   URL          urlCoz: yalnız tek video (watch?v=, youtu.be/, shorts/, m., music.) → kanonik adres
 *   bilgi        bilgiOzeti: yt-dlp -J çıktısından başlık, kanal, süre, küçük resim, kaliteler
 *   kalite       kaliteDurumu / varsayilanKalite / dosyaEtiketi / canliEngeli
 *   argümanlar   bilgiArgs / indirmeArgs / formatSecici / ffmpegKonumu: args dizisi (kabuk yok)
 *   ilerleme     satirCoz + izleyici: --progress-template satırlarından tek yüzde, hız, kalan süre
 *   ikili        varlikAdaylari / varlikSec / indirmeAdresleri / surumCoz / sumsCoz / ozetDogrula
 *                surumKarsilastir / ytdlpSurumu / eskiMi / metaGecerliMi / guncellemeIpucu / doctorSatiri
 *   hatalar      hataSinifla: stderr → kod + Türkçe mesaj + "Güncelle önerilsin mi"; uyarilar
 *   çıktı        varsayilanKlasor, artikMi, iptalSilinecekler, sonDosyaBul
 *   dönüştürme   akisBilgisi (ffmpeg -i), donusumKarari, kodlayicilar, kodlayiciSec, donusumArgs,
 *                ffmpegZaman, kalanTahmini, donusumNotu
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloYoutubeIndir = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  function sahip(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function sayi(x) {
    if (x === null || x === undefined || x === "") return null;
    var n = Number(x);
    return isFinite(n) ? n : null;
  }

  /* ================= URL ================= */

  // Kabul edilen sunucular: tam eşleşme (youtube.com.ornek.com ya da kullanici@youtube.com geçmez)
  var HOSTLAR = {
    "youtube.com": "yt", "www.youtube.com": "yt", "m.youtube.com": "yt", "music.youtube.com": "yt",
    "youtu.be": "kisa", "www.youtu.be": "kisa"
  };
  var ID_RE = /^[A-Za-z0-9_-]{11}$/;

  var URL_HATA = {
    bos: "Önce bir YouTube video bağlantısı yapıştır.",
    gecersiz: "Bu bir YouTube video bağlantısına benzemiyor. Videoyu YouTube'da aç, Paylaş › Kopyala ile aldığın bağlantıyı yapıştır.",
    baskaSite: "Yalnız YouTube video bağlantıları indirilir (youtube.com, youtu.be, YouTube Music).",
    liste: "Oynatma listesi indirilmez. Listeden tek bir videoyu aç ve onun bağlantısını yapıştır.",
    videoDegil: "Bu bağlantı tek bir videoyu göstermiyor (kanal, arama ya da başka bir sayfa). Videoyu açıp Paylaş › Kopyala ile aldığın bağlantıyı yapıştır."
  };

  function sorguCoz(q) {
    var out = {};
    String(q || "").replace(/^\?/, "").split("&").forEach(function (p) {
      if (!p) return;
      var i = p.indexOf("="), k = i < 0 ? p : p.slice(0, i), v = i < 0 ? "" : p.slice(i + 1);
      try { k = decodeURIComponent(k.replace(/\+/g, " ")); v = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { return; }
      if (!sahip(out, k)) out[k] = v;
    });
    return out;
  }

  /*
   * Girdi → { ok: true, id, url (kanonik watch adresi), listeVardi, shorts, kaynak } ya da { ok: false, kod, mesaj }.
   * Kanonik adres list= / index= / si= / t= gibi parametreleri atar: oynatma listesi bağlantısı yalnız
   * işaret ettiği videoyu indirir (yt-dlp'ye ayrıca --no-playlist verilir). Yalnız http(s); kullanıcı
   * bilgisi (kullanici@) ya da port taşıyan adres reddedilir.
   */
  function urlCoz(girdi) {
    var s = String(girdi === null || girdi === undefined ? "" : girdi).replace(/[\u200B-\u200F\u2060\uFEFF]/g, "").trim();
    s = s.replace(/^[<"'(\[]+|[>"')\].,;]+$/g, "");
    function hata(kod) { return { ok: false, kod: kod, mesaj: URL_HATA[kod] }; }
    if (!s) return hata("bos");
    // Yapıştırılan metnin içindeki ilk bağlantı ("şuna bak: https://youtu.be/…")
    if (/\s/.test(s)) {
      var ic = /(https?:\/\/\S+|(?:www\.|m\.|music\.)?youtu(?:be\.com|\.be)\/\S+)/i.exec(s);
      if (!ic) return hata("gecersiz");
      s = ic[1].replace(/[>"')\].,;]+$/g, "");
    }
    if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(s)) {
      // "javascript:…", "mailto:…" gibi şemalar; "youtube.com:443/…" gibi port değil
      if (/^[a-z][a-z0-9+.\-]*:/i.test(s) && !/^[^\/:]+\.[a-z]{2,}(:\d+)?[\/?#]/i.test(s)) return hata("gecersiz");
      s = "https://" + s.replace(/^\/+/, "");
    }
    var m = /^(https?):\/\/([^\/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(s);
    if (!m) return hata("gecersiz");
    var host = m[2].toLowerCase();
    if (!host || host.indexOf("@") !== -1 || /:\d*$/.test(host)) {
      return hata(HOSTLAR[host.replace(/^.*@/, "").replace(/:\d*$/, "")] ? "gecersiz" : "baskaSite");
    }
    var tur = HOSTLAR[host];
    if (!tur) return hata(/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(host) ? "videoDegil" : "baskaSite");
    var yol = (m[3] || "/").replace(/\/{2,}/g, "/");
    var sorgu = sorguCoz(m[4]);
    var id = "", shorts = false, sm;
    if (tur === "kisa") {
      id = (yol.split("/")[1] || "");
      if (!id) return hata("gecersiz");
    } else if (/^\/watch\/?$/i.test(yol)) {
      id = String(sorgu.v || "");
      if (!id) return sorgu.list ? hata("liste") : hata("gecersiz");
    } else if ((sm = /^\/shorts\/([^\/]+)\/?$/i.exec(yol))) {
      id = sm[1]; shorts = true;
    } else if (/^\/playlist\/?$/i.test(yol)) {
      return hata("liste");
    } else {
      return hata("videoDegil");
    }
    if (!ID_RE.test(id)) return hata("gecersiz");
    return { ok: true, id: id, url: "https://www.youtube.com/watch?v=" + id, listeVardi: !!sorgu.list, shorts: shorts, kaynak: host };
  }

  /* ================= Bilgi (yt-dlp -J) ================= */

  var KADEMELER = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320];

  /*
   * YouTube'un kendi etiketi (1080p): format_note varsa o; yoksa boyuttan. Etiket kısa kenara değil
   * 16:9 kutuya göre: 1920×804 (sinemaskop) 1080p, 1080×1920 (dikey) 1080p, 1440×1080 (4:3) 1080p.
   */
  function kaliteEtiketi(f) {
    if (!f) return 0;
    var not = /(\d{3,4})p/.exec(String(f.format_note || ""));
    if (not) return Number(not[1]);
    var w = sayi(f.width) || 0, h = sayi(f.height) || 0;
    if (!w || !h) return h > 0 ? h : 0;
    var e = Math.max(Math.min(w, h), Math.round(Math.max(w, h) * 9 / 16));
    var t = 0;
    for (var i = 0; i < KADEMELER.length; i++) if (KADEMELER[i] <= e * 1.02) t = KADEMELER[i];
    return t || e;
  }

  function videoMu(f) { return !!f && !!f.vcodec && f.vcodec !== "none" && !/storyboard/i.test(String(f.format_note || "")) && f.ext !== "mhtml"; }
  function sesMi(f) { return !!f && !!f.acodec && f.acodec !== "none"; }

  // Küçük resim yalnız YouTube'un görsel sunucularından (rastgele adres <img>'e girmesin)
  function kucukResimGuvenli(u) {
    var s = String(u || "");
    var m = /^https:\/\/([a-z0-9.-]+)\/[^\s"'<>\\]*$/i.exec(s);
    if (!m) return "";
    var h = m[1].toLowerCase();
    return /(^|\.)ytimg\.com$|(^|\.)ggpht\.com$|(^|\.)googleusercontent\.com$/.test(h) ? s : "";
  }

  function sureMetni(sn) {
    sn = Math.max(0, Math.round(Number(sn) || 0));
    var s = sn % 60, d = Math.floor(sn / 60) % 60, sa = Math.floor(sn / 3600);
    function iki(n) { return (n < 10 ? "0" : "") + n; }
    return sa ? sa + ":" + iki(d) + ":" + iki(s) : d + ":" + iki(s);
  }

  function temizMetin(x, sinir) { return String(x === null || x === undefined ? "" : x).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, sinir); }

  /*
   * -J çıktısı → panelin ihtiyacı kadar özet. Kaliteler (enIyi) yalnız videoda gerçekten olan
   * biçimlerden; dikey (Shorts) video için biçim süzgeci genişlik/yükseklik yer değiştirir.
   * formatlar: ilerleme hesabı için format_id → { video, ses, boyut }.
   */
  function bilgiOzeti(j) {
    if (typeof j === "string") { try { j = JSON.parse(j); } catch (e) { return null; } }
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    if (j._type === "playlist" || Array.isArray(j.entries)) return null;
    var fl = Array.isArray(j.formats) ? j.formats : [];
    var enIyi = 0, sesVar = false, enBuyukVideo = null, sesBoyutu = 0, formatlar = {};
    fl.forEach(function (f) {
      if (!f || typeof f !== "object") return;
      var v = videoMu(f), a = sesMi(f);
      var boyut = sayi(f.filesize) || sayi(f.filesize_approx) || 0;
      if (f.format_id !== undefined && f.format_id !== null) formatlar[String(f.format_id)] = { video: v, ses: a, boyut: boyut };
      if (a) sesVar = true;
      if (a && !v && boyut && /m4a|mp4/i.test(String(f.ext || "")) && boyut > sesBoyutu) sesBoyutu = boyut;
      if (!v) return;
      var e = kaliteEtiketi(f);
      if (e > enIyi) { enIyi = e; enBuyukVideo = f; }
    });
    // Biçim listesi yoksa (eski çıktı) üst düzey alanlardan
    if (!fl.length) {
      if (j.vcodec && j.vcodec !== "none") { enIyi = kaliteEtiketi(j); enBuyukVideo = j; }
      if (j.acodec && j.acodec !== "none") sesVar = true;
    }
    var w = enBuyukVideo ? sayi(enBuyukVideo.width) : sayi(j.width);
    var h = enBuyukVideo ? sayi(enBuyukVideo.height) : sayi(j.height);
    var canli = String(j.live_status || (j.is_live ? "is_live" : ""));
    var id = String(j.id || "");
    return {
      id: ID_RE.test(id) ? id : "",
      baslik: temizMetin(j.title || j.fulltitle || "", 300),
      kanal: temizMetin(j.channel || j.uploader || "", 120),
      sure: sayi(j.duration) || 0,
      sureMetni: j.duration ? sureMetni(j.duration) : "",
      kucukResim: kucukResimGuvenli(j.thumbnail),
      canli: canli === "is_live" || canli === "is_upcoming" || canli === "post_live" ? canli : "",
      dikey: !!(w && h && h > w),
      enIyi: enIyi,
      sesVar: sesVar,
      sesBoyutu: sesBoyutu,
      formatlar: formatlar
    };
  }

  // Canlı yayın sürerken ya da henüz başlamamışken indirme başlatılmaz (yt-dlp sonsuza dek kaydederdi)
  var CANLI_METNI = {
    is_live: "Bu bir canlı yayın ve hâlâ sürüyor. Yayın bitip kaydı yayınlanınca tekrar dene.",
    is_upcoming: "Bu yayın ya da prömiyer henüz başlamadı. Yayınlandıktan sonra tekrar dene.",
    post_live: "Yayın yeni bitti; YouTube kaydı hâlâ hazırlıyor. Birkaç saat sonra tekrar dene."
  };
  function canliEngeli(oz) { return oz && oz.canli && sahip(CANLI_METNI, oz.canli) ? CANLI_METNI[oz.canli] : ""; }

  /* ================= Kaliteler ================= */

  var KALITELER = ["mp3", "720", "1080", "2160"];
  var KALITE_ADI = { mp3: "MP3", "720": "720p", "1080": "1080p", "2160": "4K" };

  function kaliteGecerli(k) { return KALITELER.indexOf(String(k)) !== -1; }

  /*
   * Her çip: { acik, etiket }. Videoda olmayan kalite kapalı. Tek istisna: video 720p'nin altındaysa
   * 720p çipi videonun en iyisiyle (ör. 480p) açık kalır, 1080p ile 4K arasındaysa (1440p) 4K çipi o
   * kaliteyi gösterir: çip "en çok bu" demektir ve etiketi gerçekte ineni söyler (video hiç
   * indirilemez olmasın). Bilgi yoksa (null) hepsi kapalı.
   */
  function kaliteDurumu(oz) {
    var e = oz && oz.enIyi > 0 ? oz.enIyi : 0;
    var ses = !!(oz && oz.sesVar);
    return {
      mp3: { acik: ses, etiket: "MP3" },
      "720": { acik: e > 0, etiket: e > 0 && e < 720 ? e + "p" : "720p" },
      "1080": { acik: e >= 1080, etiket: "1080p" },
      "2160": { acik: e > 1080, etiket: e > 1080 && e < 2160 ? e + "p" : "4K" }
    };
  }

  function varsayilanKalite(durum, tercih) {
    if (!durum) return "";
    if (tercih && sahip(durum, tercih) && durum[tercih].acik) return String(tercih);
    if (durum["1080"] && durum["1080"].acik) return "1080";
    var sira = ["720", "2160", "mp3"];
    for (var i = 0; i < sira.length; i++) if (durum[sira[i]] && durum[sira[i]].acik) return sira[i];
    return "";
  }

  // Dosya adına eklenen kalite etiketi ("… [id] 1080p.mp4"): aynı videonun başka kalitesi eskisinin
  // üzerine "zaten indirildi" sayılmasın. Yalnız harf/rakam: yt-dlp şablonunda "%" anlam taşır.
  function dosyaEtiketi(kalite, durum) {
    var k = String(kalite);
    if (k === "mp3" || !kaliteGecerli(k)) return "";
    var e = durum && durum[k] && durum[k].etiket ? String(durum[k].etiket) : KALITE_ADI[k];
    return /^[A-Za-z0-9]{1,8}$/.test(e) ? e : KALITE_ADI[k];
  }

  /* ================= yt-dlp argümanları ================= */

  // %(...)s alanları yt-dlp'nin çıktı şablonu; bilinmeyen değer "NA" yazılır. Yol %(...)j: JSON
  // (ASCII kaçışlı) — Windows'ta kod sayfası Türkçe adı bozamaz.
  var ILERLEME_SABLONU = "SUFLOP %(progress.status)s %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s %(info.format_id)s";
  var ISLEM_SABLONU = "SUFLOPP %(progress.status)s %(progress.postprocessor)s";
  var DOSYA_SABLONU = "SUFLOF %(filepath)j";
  var CIKTI_SABLONU = "%(title).150B [%(id)s].%(ext)s";

  /*
   * Boyut süzgeci: 16:9 kutu. Yatayda [height<=?H][width<=?16H/9], dikeyde (Shorts) iki eksen yer
   * değiştirir; yalnız height<=H olsaydı 1080×1920 bir Short "1080p"de 480p inerdi. "?": boyutu
   * bilinmeyen biçim elenmez.
   */
  function boyutSuzgeci(H, dikey) {
    var W = Math.round(H * 16 / 9);
    return dikey ? "[width<=?" + H + "][height<=?" + W + "]" : "[height<=?" + H + "][width<=?" + W + "]";
  }

  // 720p/1080p: Premiere için önce H.264 (avc1) + AAC (m4a); yoksa en iyi video + ses, en son birleşik.
  // 4K: YouTube'da H.264 yok (VP9/AV1): en iyi ≤2160p; Premiere açamazsa sonra H.264'e dönüştürülür.
  function formatSecici(kalite, dikey) {
    kalite = String(kalite);
    if (kalite === "mp3") return "ba/b";
    var H = kalite === "2160" ? 2160 : (kalite === "720" ? 720 : 1080);
    var b = boyutSuzgeci(H, !!dikey);
    if (H === 2160) return "bv*" + b + "+ba[ext=m4a]/bv*" + b + "+ba/b" + b;
    return "bv*[vcodec^=avc1]" + b + "+ba[ext=m4a]/bv*" + b + "+ba/b" + b;
  }

  /*
   * Video sıralaması: önce çözünürlük ve kare hızı, sonra codec'te VP9 ve altı (H.264) tercih: aynı
   * çözünürlükte AV1 ve HDR VP9 (vp9.2) yerine SDR VP9 iner — Premiere için dönüştürmesi hızlı ve
   * renkleri soluklaşmaz. AV1 / HDR yalnız başka seçenek yoksa.
   */
  var VIDEO_SIRASI = "res,fps,vcodec:vp9";

  // yt-dlp --version çıktısı "2025.11.12" biçiminde; --js-runtimes bu sürümle geldi
  var JS_SURUMU = "2025.11.12";

  // --ffmpeg-location yalnız mutlak yolla: çıplak "ffmpeg" (PATH'te) verilirse yt-dlp onu bulamaz
  // ("does not exist") ve ffmpeg'siz devam ederdi; o zaman hiç verilmez, yt-dlp PATH'te arar
  function ffmpegKonumu(yol) {
    var s = String(yol || "");
    return /[\\\/]/.test(s) ? s : "";
  }

  /*
   * YouTube'un imza bulmacası için JavaScript çalıştırıcısı: yt-dlp Deno'yu PATH'te kendisi arar, ama
   * Premiere'in süreç ortamında resmî kurucunun yeri (~/.deno/bin) PATH'te yok. Bu yollardan ilki
   * diskte varsa --js-runtimes deno:<yol> verilir. Suflo Deno indirmez.
   */
  function denoAdaylari(platform, ev) {
    var e = String(ev || "");
    if (String(platform) === "win32") {
      var a = ["C:\\ProgramData\\chocolatey\\bin\\deno.exe"];
      if (e) a.unshift(e.replace(/[\\\/]+$/, "") + "\\.deno\\bin\\deno.exe", e.replace(/[\\\/]+$/, "") + "\\scoop\\shims\\deno.exe");
      return a;
    }
    var b = ["/opt/homebrew/bin/deno", "/usr/local/bin/deno"];
    if (e) b.unshift(e.replace(/\/+$/, "") + "/.deno/bin/deno");
    return b;
  }

  // Ayarlar › vekil sunucu (proxyUrl): şemasız "vekil:8080" http:// sayılır (bridge.js proxyFor gibi)
  function vekilAdresi(ham) {
    var s = String(ham || "").trim();
    if (!s || /[\s"]/.test(s)) return "";
    return /^[a-z][a-z0-9+.\-]*:\/\//i.test(s) ? s : "http://" + s;
  }

  // Ortak: kullanıcının kendi yt-dlp ayar dosyası çıktıyı/şablonu bozmasın (--ignore-config)
  function ortakArgs(o) {
    o = o || {};
    var a = ["--ignore-config", "--no-playlist"];
    if (o.jsRuntime && surumKarsilastir(o.surum, JS_SURUMU) >= 0) a.push("--js-runtimes", "deno:" + String(o.jsRuntime));
    if (o.proxy) a.push("--proxy", String(o.proxy));
    return a;
  }

  function bilgiArgs(url, o) {
    return ortakArgs(o).concat(["-J", "--", String(url)]);
  }

  /*
   * o: { url, kalite, klasor, ffmpeg (mutlak yol ya da ""), dikey, etiket, surum, jsRuntime, proxy }
   * --print dosya yolunu verir ama sessiz kipe geçirir: --progress ilerlemeyi yine yazdırır (sessiz
   * kipte stderr'e), --progress-delta satırları yarım saniyeye seyreltir (saatlik indirmede çıktı
   * birikmesin). Klasör -P ile: -o içindeki "%" şablon sayılır, klasör adındaki "%" bozmasın.
   */
  function indirmeArgs(o) {
    o = o || {};
    var k = String(o.kalite);
    if (!kaliteGecerli(k)) throw new Error("Geçersiz kalite: " + k);
    if (!o.klasor) throw new Error("Hedef klasör yok");
    var etiket = /^[A-Za-z0-9]{1,8}$/.test(String(o.etiket || "")) ? String(o.etiket) : "";
    var sablon = etiket ? "%(title).150B [%(id)s] " + etiket + ".%(ext)s" : CIKTI_SABLONU;
    var a = ortakArgs(o).concat([
      "--newline", "--progress", "--progress-delta", "0.5", "--no-mtime", "--windows-filenames",
      "--progress-template", "download:" + ILERLEME_SABLONU,
      "--progress-template", "postprocess:" + ISLEM_SABLONU,
      "--print", "after_move:" + DOSYA_SABLONU,
      "-P", String(o.klasor), "-o", sablon
    ]);
    var ff = ffmpegKonumu(o.ffmpeg);
    if (ff) a.push("--ffmpeg-location", ff);
    if (k === "mp3") a.push("-f", formatSecici("mp3"), "-x", "--audio-format", "mp3", "--audio-quality", "0");
    else a.push("-f", formatSecici(k, !!o.dikey), "-S", VIDEO_SIRASI, "--merge-output-format", "mp4");
    a.push("--", String(o.url));
    return a;
  }

  /* ================= İlerleme ================= */

  function na(x) { return x === undefined || x === null || x === "NA" || x === "None" ? null : sayi(x); }

  // Tek satır → { tur: "indir" | "islem" | "dosya", … } ya da null
  function satirCoz(satir) {
    var s = String(satir || "").replace(/\r/g, "").trim();
    var m = /^SUFLOP (\S+) (\S+) (\S+) (\S+) (\S+) (\S+)(?: (\S+))?$/.exec(s);
    if (m) {
      var toplam = na(m[3]);
      return { tur: "indir", durum: m[1], indirilen: na(m[2]), toplam: toplam !== null ? toplam : na(m[4]), hiz: na(m[5]), eta: na(m[6]),
        format: m[7] && m[7] !== "NA" ? m[7] : "" };
    }
    m = /^SUFLOPP (\S+) (\S+)$/.exec(s);
    if (m) return { tur: "islem", durum: m[1], islem: m[2] };
    m = /^SUFLOF (".*")$/.exec(s);
    if (m) {
      try { var yol = JSON.parse(m[1]); if (typeof yol === "string" && yol) return { tur: "dosya", yol: yol }; } catch (e) {}
    }
    return null;
  }

  /*
   * Parça parça gelen çıktıyı satıra böler (yarım satır sonraki parçaya kalır).
   * besle(parca) → tam satırlar; bitir() → kalan yarım satır (varsa) tek elemanlı dizi.
   */
  function satirTamponu() {
    var kalan = "";
    return {
      besle: function (parca) {
        var t = kalan + String(parca === null || parca === undefined ? "" : parca);
        var satirlar = t.split(/\r?\n|\r/);
        kalan = satirlar.pop();
        if (kalan.length > 65536) kalan = kalan.slice(-65536);   // satırsız çöp sınırsız büyümesin
        return satirlar.filter(function (x) { return x !== ""; });
      },
      bitir: function () { var k = kalan; kalan = ""; return k ? [k] : []; }
    };
  }

  var INDIR_PAYI = 0.95;   // yt-dlp aşamasının indirme kısmı; kalanı birleştirme / MP3'e çevirme

  function islemAsamasi(ad) {
    ad = String(ad || "");
    if (/Merger/i.test(ad)) return "birlestir";
    if (/ExtractAudio/i.test(ad)) return "mp3";
    if (/Fixup/i.test(ad)) return "duzelt";
    return "";
  }

  /*
   * Birleşik indirmede (video + ses) yt-dlp her parçayı ayrı 0→%100 indirir. İzleyici parça başına
   * baytı toplar; ilk parça yalnız video ise kalan ses parçası tahmin edilir (bilgideki m4a boyutu ya
   * da videonun %8'i). Yüzde hiç geri gitmez. o: { kalite, formatlar, sesBoyutu }
   */
  function izleyici(o) {
    o = o || {};
    var formatlar = o.formatlar || {};
    var bitenBayt = 0, bitenParca = 0, aktif = null, aktifToplam = 0, aktifInen = 0, son = 0, asama = "indir";
    return {
      besle: function (x) {
        if (!x) return null;
        if (x.tur === "indir") {
          var anahtar = x.format || "?";
          if (aktif !== null && anahtar !== aktif) {
            bitenBayt += Math.max(aktifToplam, aktifInen);
            bitenParca++;
            aktifToplam = 0; aktifInen = 0;
          }
          aktif = anahtar;
          if (x.toplam !== null && x.toplam > 0) aktifToplam = x.toplam;
          if (x.indirilen !== null && x.indirilen >= 0) aktifInen = x.indirilen;
          // "finished": parça tamam. Önceden inmiş dosyada ("has already been downloaded") inen bayt NA gelir
          if (x.durum === "finished") { if (aktifToplam < aktifInen) aktifToplam = aktifInen; else aktifInen = aktifToplam; }
          var kalanTahmin = 0;
          var f = sahip(formatlar, anahtar) ? formatlar[anahtar] : null;
          if (String(o.kalite) !== "mp3" && bitenParca === 0 && f && f.video && !f.ses) {
            kalanTahmin = o.sesBoyutu > 0 ? o.sesBoyutu : Math.max(aktifToplam, aktifInen) * 0.08;
          }
          var payda = bitenBayt + Math.max(aktifToplam, aktifInen) + kalanTahmin;
          var oran = payda > 0 ? (bitenBayt + aktifInen) / payda : 0;
          son = Math.max(son, Math.min(INDIR_PAYI, oran * INDIR_PAYI));
          asama = "indir";
          return { asama: asama, oran: son, hiz: x.hiz, eta: x.eta };
        }
        if (x.tur === "islem") {
          var a = islemAsamasi(x.islem);
          if (a && x.durum !== "finished") { asama = a; son = Math.max(son, INDIR_PAYI); }
          return { asama: asama, oran: son, hiz: null, eta: null };
        }
        return null;
      },
      oran: function () { return son; },
      asama: function () { return asama; }
    };
  }

  function ondalik(n, basamak) { return (Math.round(n * Math.pow(10, basamak)) / Math.pow(10, basamak)).toFixed(basamak).replace(".", ","); }

  function boyutMetni(bayt) {
    var b = Number(bayt) || 0;
    if (b >= 1073741824) return ondalik(b / 1073741824, 1) + " GB";
    if (b >= 1048576) return (b >= 104857600 ? String(Math.round(b / 1048576)) : ondalik(b / 1048576, 1)) + " MB";
    return Math.max(1, Math.round(b / 1024)) + " KB";
  }

  function hizMetni(bps) {
    var b = Number(bps);
    if (bps === null || bps === undefined || !isFinite(b) || b <= 0) return "";
    if (b >= 1048576) return ondalik(b / 1048576, 1) + " MB/sn";
    return Math.max(1, Math.round(b / 1024)) + " KB/sn";
  }

  // Canlı transkripsiyonla aynı biçim (js/whisper-akis.js sureMetni): "45 sn", "1 dk 20 sn", "12 dk";
  // bir saati aşan indirmede "1 sa 5 dk". i18n/en.js kalıpları çevirir.
  function sureKisa(sn) {
    var s = Math.max(1, Math.round(sn));
    if (s < 60) {
      if (s > 10) s = Math.min(55, Math.round(s / 5) * 5);
      return s + " sn";
    }
    if (s < 600) {
      var dk = Math.floor(s / 60), k = Math.round((s % 60) / 10) * 10;
      if (k === 60) { dk += 1; k = 0; }
      return k ? dk + " dk " + k + " sn" : dk + " dk";
    }
    if (s < 3600) return Math.round(s / 60) + " dk";
    var sa = Math.floor(s / 3600), d = Math.round((s % 3600) / 60);
    if (d === 60) { sa += 1; d = 0; }
    return d ? sa + " sa " + d + " dk" : sa + " sa";
  }
  function kalanMetni(sn) {
    if (sn === null || sn === undefined || sn === "") return "";
    var t = Number(sn);
    if (!isFinite(t) || t < 0) return "";
    return "~" + sureKisa(t) + " kaldı";
  }

  var ASAMA_METNI = {
    kur: "yt-dlp hazırlanıyor…",
    bilgi: "Video bilgisi alınıyor…",
    indir: "İndiriliyor…",
    birlestir: "Görüntü ve ses birleştiriliyor…",
    mp3: "MP3'e çevriliyor…",
    duzelt: "Dosya düzeltiliyor…",
    donustur: "Premiere için H.264'e dönüştürülüyor…",
    ice: "Premiere'e ekleniyor…"
  };

  // "İndiriliyor… · %45 · 4,2 MB/sn · ~1 dk 20 sn kaldı": her parça ayrı çevrilir (i18n " · " ile böler)
  function ilerlemeMetni(d) {
    if (!d) return "";
    var p = [];
    if (d.asama && sahip(ASAMA_METNI, d.asama)) p.push(ASAMA_METNI[d.asama]);
    var oran = Number(d.oran);
    p.push("%" + Math.floor(Math.max(0, Math.min(1, isFinite(oran) ? oran : 0)) * 100));
    var h = hizMetni(d.hiz);
    if (h) p.push(h);
    var k = kalanMetni(d.eta);
    if (k) p.push(k);
    return p.join(" · ");
  }

  /* ================= yt-dlp ikilisi: sürüm, varlık, SHA-256 ================= */

  var DEPO = "yt-dlp/yt-dlp";
  var SUMS_ADI = "SHA2-256SUMS";
  var ETIKET_RE = /^\d{4}\.\d{2}\.\d{2}(\.\d{1,6})?$/;
  var ESKI_GUN = 30;

  /*
   * Premiere'in çalıştığı platformlar: Windows yt-dlp.exe (x64; ARM Windows'ta yerel yt-dlp_arm64.exe
   * listede varsa o, yoksa x64 öykünmeyle), macOS yt-dlp_macos (universal). Adlar yt-dlp'nin kendi
   * güncelleyicisindeki adlar. Linux yalnız geliştirme/test içindir. Sıra = tercih sırası.
   */
  function varlikAdaylari(platform, arch) {
    var p = String(platform || ""), a = String(arch || "");
    if (p === "win32") return a === "arm64" ? ["yt-dlp_arm64.exe", "yt-dlp.exe"] : ["yt-dlp.exe"];
    if (p === "darwin") return ["yt-dlp_macos"];
    if (p === "linux") return a === "arm64" ? ["yt-dlp_linux_aarch64"] : ["yt-dlp_linux"];
    return [];
  }
  // SHA2-256SUMS'ta adı geçen ilk aday; liste yoksa ilk aday (indirme sonra yine listeyle doğrulanır)
  function varlikSec(sums, platform, arch) {
    var adaylar = varlikAdaylari(platform, arch);
    var liste = typeof sums === "string" ? sumsCoz(sums) : (sums || null);
    if (!liste) return adaylar[0] || null;
    for (var i = 0; i < adaylar.length; i++) if (sahip(liste, adaylar[i])) return adaylar[i];
    return null;
  }
  function yerelAd(platform) { return String(platform) === "win32" ? "yt-dlp.exe" : "yt-dlp"; }

  // İkili ve SUMS AYNI etiketten. Etiket bilinmiyorsa (API ulaşılamadı) "latest": iki istek arasında
  // yeni sürüm çıkarsa özet tutmaz ve kurulum güvenle durur (doğrulanmamış dosya çalışmaz).
  function indirmeAdresleri(etiket, varlik) {
    if (!varlik || !/^[A-Za-z0-9._-]+$/.test(varlik)) throw new Error("Geçersiz yt-dlp dosya adı");
    var kok = "https://github.com/" + DEPO + "/releases/";
    var gecerli = !!etiket && ETIKET_RE.test(etiket);
    var yer = gecerli ? "download/" + etiket + "/" : "latest/download/";
    return { ikili: kok + yer + varlik, sums: kok + yer + SUMS_ADI, etiket: gecerli ? etiket : "" };
  }
  var API_ADRESI = "https://api.github.com/repos/" + DEPO + "/releases/latest";

  // GitHub API yanıtı → { etiket, ozetler: { varlıkAdı: hex } } ya da null. İndirme adresi API'den
  // alınmaz (etiketten kurulur); API'nin "sha256:" özeti varsa ek denetim olarak kullanılır.
  function surumCoz(j) {
    if (typeof j === "string") { try { j = JSON.parse(j); } catch (e) { return null; } }
    if (!j || typeof j !== "object") return null;
    var etiket = String(j.tag_name || "").replace(/^v/, "");
    if (!ETIKET_RE.test(etiket)) return null;
    var ozetler = {};
    (Array.isArray(j.assets) ? j.assets : []).forEach(function (a) {
      if (!a || typeof a.name !== "string") return;
      var d = /^sha256:([0-9a-f]{64})$/i.exec(String(a.digest || ""));
      if (d) ozetler[a.name] = d[1].toLowerCase();
    });
    return { etiket: etiket, ozetler: ozetler };
  }

  // SHA2-256SUMS: "<64 hex>  <dosya>" satırları. Aynı ad iki farklı özetle geçerse o ad geçersiz sayılır.
  function sumsCoz(metin) {
    var out = {}, celiski = {};
    String(metin || "").split(/\r?\n/).forEach(function (sat) {
      var m = /^\s*([0-9a-fA-F]{64})\s+\*?(\S.*?)\s*$/.exec(sat);
      if (!m) return;
      var ad = m[2].replace(/^\.\//, ""), h = m[1].toLowerCase();
      if (sahip(out, ad) && out[ad] !== h) celiski[ad] = true;
      out[ad] = h;
    });
    for (var k in celiski) if (sahip(celiski, k)) delete out[k];
    return out;
  }

  /*
   * Yalnız listede tam adla bulunan ve hesaplanan özetle birebir aynı olan dosya geçer. apiOzeti
   * (isteğe bağlı): GitHub API'nin aynı varlık için verdiği özet; varsa o da aynı olmalı.
   */
  function ozetDogrula(sums, varlik, hesaplanan, apiOzeti) {
    var liste = typeof sums === "string" ? sumsCoz(sums) : (sums || {});
    var h = String(hesaplanan || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(h)) return { ok: false, kod: "ozetYok" };
    if (!sahip(liste, varlik)) return { ok: false, kod: "listedeYok" };
    if (apiOzeti && String(apiOzeti).toLowerCase() !== liste[varlik]) return { ok: false, kod: "apiCeliski", beklenen: liste[varlik] };
    return liste[varlik] === h ? { ok: true, beklenen: liste[varlik] } : { ok: false, kod: "uyusmadi", beklenen: liste[varlik] };
  }

  var DOGRULAMA_HATASI = {
    ozetYok: "İndirilen yt-dlp okunamadı; silindi. Tekrar dene.",
    listedeYok: "Bu sürümün SHA2-256SUMS listesinde yt-dlp dosyası yok; güvenlik için kurulmadı.",
    apiCeliski: "GitHub'ın iki kaynağı farklı SHA-256 veriyor; güvenlik için kurulmadı. Biraz sonra tekrar dene.",
    uyusmadi: "İndirilen yt-dlp doğrulanamadı (SHA-256 tutmadı); dosya silindi ve çalıştırılmadı. Tekrar dene."
  };
  function dogrulamaMesaji(kod) { return sahip(DOGRULAMA_HATASI, kod) ? DOGRULAMA_HATASI[kod] : DOGRULAMA_HATASI.uyusmadi; }

  function surumParcalari(s) { return String(s || "").split(".").map(function (x) { return parseInt(x, 10) || 0; }); }
  function surumKarsilastir(a, b) {
    var x = surumParcalari(a), y = surumParcalari(b);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  function ytdlpSurumu(cikti) {
    var m = /(\d{4}\.\d{2}\.\d{2}(?:\.\d{1,6})?)/.exec(String(cikti || ""));
    return m ? m[1] : "";
  }

  // Kurulumdan ya da son "güncel" denetiminden bu yana 30 gün geçtiyse Güncelle önerilir
  function eskiMi(meta, simdi, gun) {
    var ts = meta ? Math.max(Number(meta.denetim) || 0, Number(meta.kuruldu) || 0) : 0;
    if (!ts) return true;
    return (Number(simdi) || 0) - ts > (gun || ESKI_GUN) * 86400000;
  }

  // Kurulum kaydı (yt-dlp klasöründeki suflo-ytdlp.json): sha256 yoksa ikili hiç çalıştırılmaz
  function metaGecerliMi(m) {
    return !!m && typeof m === "object" && m.v === 1 && /^[0-9a-f]{64}$/.test(String(m.sha256 || "")) &&
      typeof m.varlik === "string" && /^[A-Za-z0-9._-]+$/.test(m.varlik) && (Number(m.kuruldu) || 0) > 0 &&
      (!m.surum || ETIKET_RE.test(String(m.surum)));
  }

  function gunFarki(simdi, ts) { return Math.max(0, Math.floor(((Number(simdi) || 0) - (Number(ts) || 0)) / 86400000)); }

  // Bilgi al sonrası, ağa gitmeden: kurulu yt-dlp 30 günden eskiyse durum satırının altında Güncelle
  function guncellemeIpucu(meta, simdi) {
    if (!metaGecerliMi(meta) || !eskiMi(meta, simdi)) return null;
    var g = gunFarki(simdi, Math.max(Number(meta.denetim) || 0, Number(meta.kuruldu) || 0));
    return { metin: "yt-dlp " + g + " gündür güncellenmedi. YouTube değiştikçe eski sürüm bozulabilir.", gun: g };
  }

  /*
   * Suflo Doctor satırı. o: { kurulu, dogrulandi, meta, enSon (API etiketi ya da ""), simdi }
   * Kurulu değilse uyarı DEĞİL (gerekince kendiliğinden iner); doğrulanamayan ya da eski ikili için
   * "update-ytdlp" onarımı.
   */
  function doctorSatiri(o) {
    o = o || {};
    var baslik = "yt-dlp (YouTube indirici)";
    if (!o.kurulu) return { status: "good", title: baslik, detail: "Kurulu değil · ilk kullanımda iner ve SHA-256 ile doğrulanır", action: "" };
    if (!o.dogrulandi || !metaGecerliMi(o.meta)) {
      return { status: "warn", title: "yt-dlp doğrulanamadı", detail: "Dosya kurulumdan sonra değişmiş ya da kaydı bozuk; çalıştırılmıyor. Güncelle ile yeniden indir.", action: "update-ytdlp" };
    }
    var surum = String(o.meta.surum || "?");
    if (o.enSon && ETIKET_RE.test(o.enSon) && surumKarsilastir(o.enSon, o.meta.surum) > 0) {
      return { status: "warn", title: "yt-dlp güncellemesi var", detail: surum + " kurulu · " + o.enSon + " hazır", action: "update-ytdlp" };
    }
    if (o.enSon && ETIKET_RE.test(o.enSon)) return { status: "good", title: baslik, detail: surum + " · güncel", action: "" };
    if (eskiMi(o.meta, o.simdi)) {
      return { status: "warn", title: "yt-dlp 30 günden eski", detail: surum + " · güncelleme denetlenemedi", action: "update-ytdlp" };
    }
    return { status: "good", title: baslik, detail: surum + " · güncelleme denetlenemedi", action: "" };
  }

  /* ================= Hatalar ================= */

  var HATALAR = {
    gecersizUrl: { mesaj: "YouTube bu bağlantıyı tanımadı. Videonun bağlantısını yeniden kopyala." },
    canli: { mesaj: "Bu bir canlı yayın ya da henüz başlamadı. Yayın bitip kaydı yayınlanınca tekrar dene." },
    ozel: { mesaj: "Bu video özel: yalnız sahibinin izin verdiği hesaplar görebilir, indirilemez." },
    uyelere: { mesaj: "Bu video yalnız kanal üyelerine açık, indirilemez." },
    yas: { mesaj: "Bu video yaş sınırlı: YouTube oturum açmadan göstermiyor. Suflo oturum bilgisi kullanmaz, indirilemez." },
    bolge: { mesaj: "Bu video senin ülkende yayınlanmıyor (bölge kısıtlaması), indirilemez." },
    giris: { mesaj: "YouTube oturum açmanı istiyor (\"bot olmadığını doğrula\"). Birkaç dakika bekleyip tekrar dene; sürerse yt-dlp'yi güncelle.", guncelle: true },
    cokIstek: { mesaj: "YouTube kısa sürede çok fazla istek aldı. Birkaç dakika bekleyip tekrar dene." },
    disk: { mesaj: "Diskte yer kalmadı. Hedef klasörün diskinde yer aç ya da başka bir klasör seç." },
    yazilamaz: { mesaj: "Hedef klasöre yazılamıyor (izin yok ya da salt okunur). Başka bir klasör seç." },
    ffmpegYok: { mesaj: "ffmpeg bulunamadı: görüntü ile ses birleştirilemedi. Ayarlar › ffmpeg'den Suflo'nun ffmpeg'ini kur." },
    ag: { mesaj: "İnternete bağlanılamadı. Bağlantını kontrol edip tekrar dene; şirket ya da okul ağındaysan Ayarlar'dan vekil sunucu tanımla." },
    formatYok: { mesaj: "Seçtiğin kalite bu videoda bulunamadı. Başka bir kalite seç ya da yt-dlp'yi güncelle.", guncelle: true },
    yok: { mesaj: "Video bulunamadı: kaldırılmış, gizlenmiş ya da bağlantı hatalı." },
    eski: { mesaj: "yt-dlp YouTube'un son değişikliğine uyamadı (eski sürüm). Güncelle'ye bas, sonra tekrar dene.", guncelle: true },
    calismadi: { mesaj: "yt-dlp çalıştırılamadı (dosya eksik, engellenmiş ya da bozuk). Güncelle ile yeniden indir; virüs koruması engelliyorsa Suflo'nun klasörüne izin ver.", guncelle: true },
    bilinmeyen: { mesaj: "yt-dlp hata verdi." }
  };

  // Sıra önemli: özgül olan önce ("Sign in to confirm your age" yaş, "Video unavailable … country" bölge)
  var HATA_KALIPLARI = [
    // ikilinin kendisi açılamadı (süreç başlamadı / PyInstaller açılamadı): klasör izniyle karışmasın diye önce
    ["calismadi", /\bspawn\b[^\n]*\b(enoent|eacces|eperm|unknown|ebadarch)\b|is not recognized as an internal|bad cpu type|exec format error|cannot execute binary|failed to execute script|\[pyi-\d+:error\]/i],
    ["canli", /live event will begin|premieres in|live stream recording is not available|this live stream|stream has not (started|finished)|is_upcoming|currently live|is live now/i],
    ["ozel", /private video|video is private/i],
    ["uyelere", /members[- ]only|join this channel|available to this channel'?s members|channel members/i],
    ["yas", /confirm your age|age[- ]restricted|inappropriate for some users/i],
    ["bolge", /not available in your country|not made this video available in your country|geo[- ]?restrict|blocked it in your country|from your location/i],
    ["giris", /not a bot|requires? (login|authentication)|login required|use --cookies|cookies-from-browser|sign in to (view|confirm)|only available for registered users/i],
    ["cokIstek", /http error 429|too many requests/i],
    ["disk", /no space left|errno 28\b|enospc|not enough space|winerror 112\b|disk (is )?full/i],
    ["yazilamaz", /permission denied|errno 13\b|access is denied|winerror 5\b|read-only file system|eacces|eperm|erofs|unable to open for writing|unable to create directory/i],
    ["ffmpegYok", /ffmpeg (is )?not (found|installed)|ffprobe and ffmpeg not found|ffmpeg-location .* does not exist/i],
    ["ag", /getaddrinfo|name or service not known|nodename nor servname|failed to resolve|temporary failure in name resolution|network is unreachable|no route to host|connection refused|connection reset|timed? ?out|errno 11001|urlopen error|unable to connect|max retries exceeded|remote end closed connection|certificate_verify_failed|ssl: /i],
    ["formatYok", /requested format is not available|no video formats found/i],
    ["yok", /video unavailable|has been removed|no longer available|account associated with this video has been terminated|this video does not exist|video is unavailable/i],
    ["gecersizUrl", /is not a valid url|unsupported url|incomplete youtube id/i],
    ["eski", /signature extraction failed|nsig extraction failed|signature solving failed|unable to extract|please report this issue|confirm you are on the latest version|update to the latest version|outdated|unable to decode n|n challenge|http error 403|jsinterp|extractorerror|not available on this app/i]
  ];

  function hataSatirlari(metin) {
    return String(metin || "").split(/\r?\n/).filter(function (s) { return /^\s*ERROR:/.test(s); }).map(function (s) { return s.trim(); });
  }

  /*
   * stderr (ve varsa stdout) → { kod, mesaj, guncelle, satir }. Önce yalnız "ERROR:" satırları
   * denenir (WARNING'ler yanıltmasın); eşleşme yoksa tüm metin.
   */
  function hataSinifla(stderr, stdout) {
    var hepsi = String(stderr || "") + "\n" + String(stdout || "");
    var hatalar = hataSatirlari(hepsi);
    var adaylar = hatalar.length ? [hatalar.join("\n"), hepsi] : [hepsi];
    for (var a = 0; a < adaylar.length; a++) {
      for (var i = 0; i < HATA_KALIPLARI.length; i++) {
        if (HATA_KALIPLARI[i][1].test(adaylar[a])) {
          var kod = HATA_KALIPLARI[i][0];
          return { kod: kod, mesaj: HATALAR[kod].mesaj, guncelle: !!HATALAR[kod].guncelle, satir: (hatalar[hatalar.length - 1] || "").replace(/^ERROR:\s*/, "").slice(0, 300) };
        }
      }
    }
    var son = hatalar[hatalar.length - 1] || String(stderr || "").trim().split(/\r?\n/).pop() || "";
    return { kod: "bilinmeyen", mesaj: HATALAR.bilinmeyen.mesaj, guncelle: false, satir: son.replace(/^ERROR:\s*/, "").slice(0, 300) };
  }

  // Hata değil, uyarı: JS çalıştırıcısı (Deno) yoksa YouTube bazı kaliteleri vermeyebilir
  var JS_YOK_METNI = "YouTube bazı kaliteleri JavaScript çalıştırıcısı olmadan vermiyor. deno.com'dan Deno'yu kurarsan Suflo onu kendiliğinden kullanır.";
  function uyarilar(stderr) {
    var t = String(stderr || "");
    return { jsYok: /no supported javascript runtime|javascript runtime could not be found|install(ed)? a supported javascript runtime|supported js runtime/i.test(t) };
  }

  /* ================= Çıktı dosyaları ================= */

  var KLASOR_ADI = "Suflo İndirilenler";

  function birlestir(kok, ad, sep) {
    var s = sep || "/";
    var k = String(kok || "").replace(/[\\\/]+$/, "");
    return k ? k + s + ad : ad;
  }

  // Varsayılan: kaydedilmiş projenin klasörü; proje kaydedilmemişse Videolar (macOS'ta Filmler)
  function varsayilanKlasor(o) {
    o = o || {};
    var sep = o.sep || (o.platform === "win32" ? "\\" : "/");
    if (o.projeKlasoru) return birlestir(o.projeKlasoru, KLASOR_ADI, sep);
    if (!o.ev) return "";
    return birlestir(birlestir(o.ev, o.platform === "darwin" ? "Movies" : "Videos", sep), KLASOR_ADI, sep);
  }

  function idDosyasiMi(ad, id) { return !!id && String(ad).indexOf("[" + id + "]") !== -1; }

  // yt-dlp'nin yarım / ara dosyaları ve Suflo'nun dönüştürme geçicisi
  function artikMi(ad) {
    var s = String(ad);
    return /\.(part|ytdl)$/i.test(s) || /\.part-Frag\d+(\.part)?$/i.test(s) || /\.f\d[0-9A-Za-z_-]*\.[A-Za-z0-9]+(\.part)?$/.test(s) ||
      /\.temp\.[A-Za-z0-9]+$/i.test(s) || /\.suflo-tmp\.[A-Za-z0-9]+$/i.test(s);
  }

  // İptalde silinecekler: bu indirmenin oluşturduğu her şey + videonun eski yarım dosyaları.
  // Daha önce tamamlanmış dosyaya (aynı video önceden indirildiyse) dokunulmaz.
  function iptalSilinecekler(onceki, simdiki, id) {
    var o = {};
    (onceki || []).forEach(function (a) { o[a] = 1; });
    return (simdiki || []).filter(function (ad) { return idDosyasiMi(ad, id) && (!sahip(o, ad) || artikMi(ad)); });
  }
  // Hata sonrası: yalnız yarım / ara dosyalar (tamamlanmış dosya kalır)
  function hataSilinecekler(simdiki, id) {
    return (simdiki || []).filter(function (ad) { return idDosyasiMi(ad, id) && artikMi(ad); });
  }

  var VIDEO_UZANTI = ["mp4", "mkv", "webm", "mov", "m4v"];
  var SES_UZANTI = ["mp3", "m4a", "opus", "webm", "ogg", "wav"];
  function uzanti(ad) { var m = /\.([A-Za-z0-9]+)$/.exec(String(ad)); return m ? m[1].toLowerCase() : ""; }

  /*
   * --print yolu okunamazsa (çok eski yt-dlp) klasörde videonun kimliğini taşıyan dosya: önce bu
   * indirmede yeni oluşanlar, sonra adında beklenen kalite etiketi olan, sonra MP4 / MP3.
   */
  function sonDosyaBul(adlar, id, kalite, onceki, etiket) {
    var mp3 = String(kalite) === "mp3";
    var o = {};
    (onceki || []).forEach(function (a) { o[a] = 1; });
    var uygun = (adlar || []).filter(function (ad) {
      return idDosyasiMi(ad, id) && !artikMi(ad) && (mp3 ? SES_UZANTI : VIDEO_UZANTI).indexOf(uzanti(ad)) !== -1;
    });
    var tercih = mp3 ? "mp3" : "mp4";
    function puan(ad) {
      return (sahip(o, ad) ? 0 : 4) + (etiket && ad.indexOf("] " + etiket + ".") !== -1 ? 2 : 0) + (uzanti(ad) === tercih ? 1 : 0);
    }
    uygun.sort(function (a, b) { return puan(b) - puan(a); });
    return uygun[0] || "";
  }

  /* ================= Premiere uyumu: ffmpeg -i ve dönüştürme ================= */

  function zamanSn(s) {
    var m = /(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(String(s || ""));
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  }

  // ffmpeg -i stderr → { video, ses, genislik, yukseklik, sure, onBit, hdr } (kapak resmi akışı sayılmaz)
  function akisBilgisi(stderr) {
    var t = String(stderr || ""), out = { video: "", ses: "", genislik: 0, yukseklik: 0, sure: 0, onBit: false, hdr: false };
    var d = /Duration:\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(t);
    if (d) out.sure = zamanSn(d[1]) || 0;
    t.split(/\r?\n/).forEach(function (sat) {
      var v = /Stream #\d+:\d+[^:]*: Video: ([A-Za-z0-9_]+)/.exec(sat);
      if (v && !out.video && !/attached pic/i.test(sat)) {
        out.video = v[1].toLowerCase();
        var b = /,\s*(\d{2,5})x(\d{2,5})[\s,\[]/.exec(sat + " ");
        if (b) { out.genislik = Number(b[1]); out.yukseklik = Number(b[2]); }
        out.onBit = /p10|p12/.test(sat);
        out.hdr = /smpte2084|arib-std-b67/i.test(sat);
      }
      var a = /Stream #\d+:\d+[^:]*: Audio: ([A-Za-z0-9_]+)/.exec(sat);
      if (a && !out.ses) out.ses = a[1].toLowerCase();
    });
    return out;
  }

  var PREMIERE_VIDEO = ["h264", "hevc"];
  var PREMIERE_SES = ["aac", "mp3", "alac", "ac3", "eac3"];
  var PREMIERE_KAP = ["mp4", "mov", "m4v"];

  /*
   * Premiere açar mı: video H.264/HEVC, ses AAC/MP3/PCM, kap MP4/MOV. Değilse { gerekli: true, video:
   * "copy" | "encode", ses: "copy" | "aac" }. VP9/AV1 (YouTube 4K) ve Opus hep dönüştürülür.
   * Akış okunamadıysa (video da ses de yok) dönüştürme denenmez: ffmpeg'in kendisi okuyamıyor.
   */
  function donusumKarari(akis, ad) {
    akis = akis || {};
    var ext = uzanti(ad);
    if (!akis.video && !akis.ses) return { gerekli: false, video: "", ses: "", sesDosyasi: !sahip({ mp4: 1, mkv: 1, webm: 1, mov: 1 }, ext), okunamadi: true };
    var vOk = !akis.video || PREMIERE_VIDEO.indexOf(akis.video) !== -1;
    var aOk = !akis.ses || PREMIERE_SES.indexOf(akis.ses) !== -1 || /^pcm_/.test(akis.ses);
    if (!akis.video) {
      // yalnız ses (MP3)
      // çıktı her zaman .mp3: ses zaten MP3 ise yalnız kap değişir (kopya), değilse MP3'e kodlanır
      var sesKap = ["mp3", "m4a", "wav", "aif", "aiff"].indexOf(ext) !== -1;
      var gerekliS = !(aOk && sesKap);
      return { gerekli: gerekliS, video: "", ses: !gerekliS || akis.ses === "mp3" ? "copy" : "mp3", sesDosyasi: true };
    }
    var kOk = PREMIERE_KAP.indexOf(ext) !== -1;
    return { gerekli: !(vOk && aOk && kOk), video: vOk ? "copy" : "encode", ses: aOk ? "copy" : "aac", sesDosyasi: false };
  }

  // Dönüştürmenin çıktı adı: ".mp4" (ses için ".mp3") ve geçici ad "<taban>.suflo-tmp.<uzantı>"
  function donusumAdlari(yol, sesDosyasi) {
    var s = String(yol || "");
    var taban = s.replace(/\.[A-Za-z0-9]+$/, "");
    var ext = sesDosyasi ? "mp3" : "mp4";
    return { gecici: taban + ".suflo-tmp." + ext, son: taban + "." + ext };
  }

  // Tercih sırası: libx264 (GPL derlemeler, macOS) → işletim sisteminin kodlayıcısı → donanım → OpenH264
  // → MPEG-4 (son çare). Suflo'nun Windows ffmpeg'i (BtbN LGPL) libx264 taşımaz.
  function kodlayiciSirasi(platform) {
    if (platform === "darwin") return ["libx264", "h264_videotoolbox", "libopenh264", "mpeg4"];
    if (platform === "win32") return ["libx264", "h264_mf", "h264_nvenc", "h264_qsv", "h264_amf", "libopenh264", "mpeg4"];
    return ["libx264", "libopenh264", "h264_vaapi", "mpeg4"];
  }

  // ffmpeg -encoders çıktısındaki video kodlayıcı adları
  function kodlayicilar(cikti) {
    var out = [];
    String(cikti || "").split(/\r?\n/).forEach(function (s) {
      var m = /^\s*V[.A-Z]{5}\s+([A-Za-z0-9_]+)\s/.exec(s);
      if (m) out.push(m[1]);
    });
    return out;
  }

  function kodlayiciSec(mevcut, platform) {
    var sira = kodlayiciSirasi(platform), liste = mevcut || [];
    return sira.filter(function (k) { return liste.indexOf(k) !== -1; });
  }

  function bitHizi(yukseklik) {
    var h = Number(yukseklik) || 1080;
    return h <= 720 ? "8M" : (h <= 1080 ? "16M" : (h <= 1440 ? "30M" : "50M"));
  }

  /*
   * o: { girdi, cikti, karar, kodlayici, yukseklik }. -map 0:a:0? sessiz videoda da çalışır;
   * -pix_fmt yuv420p: 10 bit (HDR) VP9/AV1 Premiere'in açtığı 8 bit H.264 olur.
   */
  function donusumArgs(o) {
    o = o || {};
    var k = o.karar || {};
    var a = ["-hide_banner", "-nostdin", "-y", "-i", String(o.girdi)];
    if (k.sesDosyasi) {
      a.push("-vn", "-map", "0:a:0");
      if (k.ses === "copy") a.push("-c:a", "copy"); else a.push("-c:a", "libmp3lame", "-q:a", "0");
      a.push(String(o.cikti));
      return a;
    }
    a.push("-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn");
    if (k.video === "copy") a.push("-c:v", "copy");
    else {
      var enc = String(o.kodlayici || "libx264"), br = bitHizi(o.yukseklik);
      a.push("-c:v", enc);
      if (enc === "libx264") a.push("-preset", (Number(o.yukseklik) || 0) > 1440 ? "faster" : "medium", "-crf", "18");
      else if (enc === "mpeg4") a.push("-q:v", "2");
      else if (enc === "h264_videotoolbox") a.push("-b:v", br, "-allow_sw", "1");
      else a.push("-b:v", br);
      a.push("-pix_fmt", "yuv420p");
    }
    if (k.ses === "copy") a.push("-c:a", "copy"); else a.push("-c:a", "aac", "-b:a", "192k");
    a.push("-max_muxing_queue_size", "1024", "-movflags", "+faststart", String(o.cikti));
    return a;
  }

  // ffmpeg ilerleme parçası ("… time=00:01:02.34 …", bir parçada birkaç tane olabilir) → son zaman (sn)
  function ffmpegZaman(metin) {
    var re = /time=\s*(-?\d+:\d{2}:\d{2}(?:\.\d+)?)/g, m, son = null;
    var s = String(metin || "");
    while ((m = re.exec(s))) son = m[1];
    if (son === null) return null;
    return zamanSn(son.replace(/^-/, ""));
  }

  // Geçen süreden kalan süre tahmini (sn); ilk %2'de ya da ilk 3 sn'de tahmin yok
  function kalanTahmini(oran, gecenSn) {
    var r = Number(oran), g = Number(gecenSn);
    if (!isFinite(r) || !isFinite(g) || r < 0.02 || g < 3) return null;
    if (r >= 1) return 0;
    return g * (1 - r) / r;
  }

  /*
   * Dönüştürmeden sonra kullanıcıya not: libx264 yoksa hangi kodlayıcının kullanıldığı, MPEG-4 son
   * çareyse kalite uyarısı, HDR kaynağın renkleri. "" = not yok.
   */
  function donusumNotu(kodlayici, akis) {
    var p = [];
    var k = String(kodlayici || "");
    if (k === "mpeg4") p.push("Bu ffmpeg'de H.264 kodlayıcısı yok; MPEG-4 ile dönüştürüldü (kalite biraz düşük). Ayarlar › ffmpeg'den Suflo'nun ffmpeg'ini kurabilirsin.");
    else if (k && k !== "libx264") p.push("Bu ffmpeg'de libx264 yok; dönüştürmede " + k + " kullanıldı.");
    if (akis && akis.hdr) p.push("Video HDR: Premiere için SDR'ye çevrildi, renkler biraz soluk görünebilir.");
    return p.join(" ");
  }

  /* ================= Onay ================= */

  var ONAY_METNI = "Yalnızca indirme hakkın olan içeriği indir: kendi videoların, izin aldığın ya da lisanslı içerik. YouTube Kullanım Şartları'na uymak senin sorumluluğunda.";
  var ONAY_SURUMU = 1;
  function onayVarMi(ayar) { return !!ayar && Number(ayar.ytOnay) >= ONAY_SURUMU; }

  return {
    // URL
    urlCoz: urlCoz, URL_HATA: URL_HATA,
    // bilgi ve kalite
    bilgiOzeti: bilgiOzeti, kaliteEtiketi: kaliteEtiketi, kaliteDurumu: kaliteDurumu, varsayilanKalite: varsayilanKalite,
    kaliteGecerli: kaliteGecerli, KALITELER: KALITELER.slice(), KALITE_ADI: KALITE_ADI, sureMetni: sureMetni, kucukResimGuvenli: kucukResimGuvenli,
    canliEngeli: canliEngeli, dosyaEtiketi: dosyaEtiketi,
    // argümanlar
    bilgiArgs: bilgiArgs, indirmeArgs: indirmeArgs, formatSecici: formatSecici, boyutSuzgeci: boyutSuzgeci, ffmpegKonumu: ffmpegKonumu,
    denoAdaylari: denoAdaylari, vekilAdresi: vekilAdresi,
    ILERLEME_SABLONU: ILERLEME_SABLONU, ISLEM_SABLONU: ISLEM_SABLONU, DOSYA_SABLONU: DOSYA_SABLONU, CIKTI_SABLONU: CIKTI_SABLONU,
    VIDEO_SIRASI: VIDEO_SIRASI, JS_SURUMU: JS_SURUMU,
    // ilerleme
    satirCoz: satirCoz, satirTamponu: satirTamponu, izleyici: izleyici, ilerlemeMetni: ilerlemeMetni, hizMetni: hizMetni,
    kalanMetni: kalanMetni, boyutMetni: boyutMetni, ASAMA_METNI: ASAMA_METNI, INDIR_PAYI: INDIR_PAYI,
    // ikili
    varlikAdaylari: varlikAdaylari, varlikSec: varlikSec, yerelAd: yerelAd, indirmeAdresleri: indirmeAdresleri, API_ADRESI: API_ADRESI,
    SUMS_ADI: SUMS_ADI, surumCoz: surumCoz, sumsCoz: sumsCoz, ozetDogrula: ozetDogrula, dogrulamaMesaji: dogrulamaMesaji,
    surumKarsilastir: surumKarsilastir, ytdlpSurumu: ytdlpSurumu, eskiMi: eskiMi, metaGecerliMi: metaGecerliMi, ESKI_GUN: ESKI_GUN,
    guncellemeIpucu: guncellemeIpucu, doctorSatiri: doctorSatiri,
    // hatalar
    hataSinifla: hataSinifla, uyarilar: uyarilar, HATALAR: HATALAR, JS_YOK_METNI: JS_YOK_METNI,
    // çıktı
    KLASOR_ADI: KLASOR_ADI, varsayilanKlasor: varsayilanKlasor, idDosyasiMi: idDosyasiMi, artikMi: artikMi,
    iptalSilinecekler: iptalSilinecekler, hataSilinecekler: hataSilinecekler, sonDosyaBul: sonDosyaBul, uzanti: uzanti,
    // dönüştürme
    akisBilgisi: akisBilgisi, donusumKarari: donusumKarari, donusumAdlari: donusumAdlari, kodlayicilar: kodlayicilar,
    kodlayiciSirasi: kodlayiciSirasi, kodlayiciSec: kodlayiciSec, donusumArgs: donusumArgs, ffmpegZaman: ffmpegZaman, bitHizi: bitHizi,
    kalanTahmini: kalanTahmini, donusumNotu: donusumNotu,
    // onay
    ONAY_METNI: ONAY_METNI, ONAY_SURUMU: ONAY_SURUMU, onayVarMi: onayVarMi
  };
});
