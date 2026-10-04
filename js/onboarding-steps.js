/*
 * Suflo — "İlk altyazın 2 dakikada" rehberinin saf kuralları
 *
 * DOM'suz, durumsuz, Premiere'siz: karar tablosu (kart ne zaman görünür),
 * adım hesaplayıcı (motor → örnek → stil → yapay zekâ), model seçimi, Groq
 * anahtarı ayıklama/doğrulama sonucu ve örnek klip manifesti/WAV başlığı
 * denetimi. js/onboarding.js (arayüz) bunları kullanır; Node testleri aynı
 * kodu doğrudan çalıştırır (tests/test-onboarding.js).
 *
 * CEF 74 / Node 12.3: ?. ?? replaceAll .at() yok.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloOnboarding = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var SURUM = 1;
  var ADIMLAR = ["motor", "ornek", "stil", "ai"];
  var DURUMLAR = ["bekliyor", "tamam", "atlandi", "yok"];
  var ONBOARDING_MODELI = "small";

  function yeniKayit() {
    return {
      surum: SURUM,
      adimlar: { motor: "bekliyor", ornek: "bekliyor", stil: "bekliyor", ai: "bekliyor" },
      kapandi: false,
      bitti: false
    };
  }

  // Diskten gelen (eksik, eski ya da bozuk) kaydı güvenli biçime getir
  function kayitDuzelt(k) {
    var temiz = yeniKayit();
    if (!k || typeof k !== "object") return temiz;
    var a = k.adimlar && typeof k.adimlar === "object" ? k.adimlar : {};
    ADIMLAR.forEach(function (ad) {
      if (DURUMLAR.indexOf(a[ad]) !== -1) temiz.adimlar[ad] = a[ad];
    });
    temiz.kapandi = k.kapandi === true;
    temiz.bitti = k.bitti === true;
    if (typeof k.model === "string" && /^[a-z0-9-]{2,20}$/.test(k.model)) temiz.model = k.model;
    if (stilYedegiGecerli(k.stilYedek)) temiz.stilYedek = k.stilYedek;
    return temiz;
  }

  /*
   * Stil adımının önizleme öncesi görünümü (KCaptions.stilYedegi()): panel deneme
   * sürerken kapanırsa bir sonraki açılışta geri konsun diye kayıtta durur.
   * Yalnız düz nesne ve makul boyut kabul edilir.
   */
  function stilYedegiGecerli(y) {
    if (!y || typeof y !== "object" || Array.isArray(y)) return false;
    if (!y.alan || typeof y.alan !== "object" || Array.isArray(y.alan)) return false;
    try { return JSON.stringify(y).length <= 20000; } catch (e) { return false; }
  }

  /*
   * Kart ne zaman görünür?
   *   g.ayarDosyasiVardi  settings.json bu yüklemeden ÖNCE var mıydı (yoksa taze kurulum)
   *   g.onboarding        settings.onboarding (yoksa undefined)
   *   g.yeniliklerGoruldu "3.0" gibi; yalnız bilgi amaçlı (yükseltenleri tanımak için)
   *   g.modelVar          yerel model + motor kurulu mu
   *   g.apiKey            bulut/AI anahtarı var mı
   *   g.uygulandi         daha önce sekansa en az bir altyazı uygulandı mı
   * Döner:
   *   "tam"  taze kurulum, hiç başlayamamış (modelsiz, anahtarsız, uygulamasız) kullanıcı
   *          ya da rehberi başlamış ama bitirmemiş/kapatmamış kullanıcı (kayıt var:
   *          kayıt yalnız rehber tam kartken yazılır)
   *   "cip"  yükselten ama anahtarı olmayan kullanıcı: yalnız "AI anahtarı" çipi
   *   "yok"  rehber bitti ya da kapatıldı ya da gerek yok
   */
  function gosterimKarari(g) {
    g = g || {};
    var ob = g.onboarding;
    if (ob && (ob.kapandi === true || ob.bitti === true)) return "yok";
    if (!g.ayarDosyasiVardi) return "tam";
    if (ob && typeof ob === "object" && Number(ob.surum) > 0) return "tam";
    var takili = !g.modelVar && !g.apiKey && !g.uygulandi;
    if (takili) return "tam";
    if (!g.apiKey) return "cip";
    return "yok";
  }

  /*
   * Adımların güncel durumu. Kalıcı kayıt (kullanıcının "Atla" dedikleri, stil
   * adımının kapanması, ilk başarılı altyazı) gerçeklerle birleşir:
   *   motor  yerel model kurulu ya da bulut rotası hazır (anahtar + yerel olmayan sağlayıcı)
   *   ornek  ilk altyazı çıktıysa tamam; örnek klip dosyaları yoksa "yok" — o zaman
   *          kart bu adımda "kendi klibinle ilk altyazı" talimatını gösterir ve adım
   *          ilk başarılı "Altyazı oluştur"da tamamlanır
   *   stil   kullanıcı stil adımını kapattıysa tamam
   *   ai     AI anahtarı varsa tamam
   * "siradaki": sırayla ilk bekleyen ya da "yok" (kendi klibinle) adım.
   */
  function adimlariHesapla(kayit, gercek) {
    var k = kayitDuzelt(kayit);
    var g = gercek || {};
    var bulutHazir = !!g.apiKey && g.provider !== "local";
    var a = {};
    a.motor = (g.modelVar || bulutHazir) ? "tamam" : (k.adimlar.motor === "atlandi" ? "atlandi" : "bekliyor");
    if (k.adimlar.ornek === "tamam" || g.ilkAltyazi) a.ornek = "tamam";
    else if (k.adimlar.ornek === "atlandi") a.ornek = "atlandi";
    else a.ornek = g.ornekVar ? "bekliyor" : "yok";
    a.stil = (k.adimlar.stil === "tamam" || k.adimlar.stil === "atlandi") ? k.adimlar.stil : "bekliyor";
    a.ai = g.apiKey ? "tamam" : (k.adimlar.ai === "atlandi" ? "atlandi" : "bekliyor");
    var siradaki = null, biten = 0;
    ADIMLAR.forEach(function (ad) {
      if (a[ad] === "tamam" || a[ad] === "atlandi") biten++;
      else if (!siradaki) siradaki = ad;
    });
    return {
      adimlar: a,
      siradaki: siradaki,
      tamamlanan: biten,
      toplam: ADIMLAR.length,
      bitti: biten === ADIMLAR.length,
      ornekModu: g.ornekVar ? "ornek" : "kendi"
    };
  }

  function ilerlemeMetni(h) {
    return "Kurulum " + h.tamamlanan + "/" + h.toplam;
  }

  /*
   * İlk model: hızlı inen, dile uygun olan. Turbo (574 MB) ve cuBLAS ilk altyazıdan
   * SONRA isteğe bağlı ("Daha doğru model"). Mac'te yerel motor Homebrew ister;
   * Homebrew yoksa önerilen yol ücretsiz Groq anahtarıyla bulut.
   *   o: { lang, ramGB, gpu ("cuda"|"metal"|"cpu"|...), mac, brew, motorVar }
   */
  var BOYUT = { tiny: 32, base: 60, small: 190, turbo: 574, large: 1080 };
  function modelSec(o) {
    o = o || {};
    if (o.mac && !o.brew && !o.motorVar) return { bulut: true, neden: "brew-yok" };
    var dil = String(o.lang || "tr").toLowerCase().slice(0, 2);
    var model = dil === "en" ? "base" : ONBOARDING_MODELI;
    // Çok düşük bellekte (Premiere'i zaten zorlayan makine) daha küçük model
    if (model === "small" && Number(o.ramGB) > 0 && Number(o.ramGB) < 4) model = "base";
    return { bulut: false, model: model, sizeMB: BOYUT[model], gpuOner: o.gpu === "cuda" };
  }

  /*
   * Stil denemesi bitince kayıtlı altyazı tercihi (settings.capPrefs): YALNIZ görünüm
   * alanları önizleme öncesine döner, deneme sırasında kaydedilen başka tercihler (ör.
   * altyazı dili) kalır. Önceden tercih yoksa görünüm alanları silinir (açılışta
   * varsayılan görünüm). Döner: yeni capPrefs ya da null (hiç tercih kalmadı: sil).
   *   simdi: şu anki settings.capPrefs · eski: önizleme öncesi capPrefs (ya da null)
   */
  /*
   * Stil adımı açıkken (önizleme öncesi görünüm yedekteyken) kullanıcının bir dokunuşu
   * "bilinçli seçim" mi? Evetse yedek bırakılır ve adım kapanınca görünüm geri alınmaz.
   *   o.tur     "kart": stil ızgarasında tıklama · "ayar": görünüm kontrolü (change/input)
   *   o.pro     kullanıcı Pro mu
   *   o.kart    tıklama bir stil kartında mı (ızgara boşluğu, başlık: false)
   *   o.kilitli kart kilitli mi (PRO rozetli şablon yalnız satış penceresini açar)
   *   o.secili  tıklamadan SONRA o kart seçili mi (seçim gerçekten ona geçti mi)
   *   o.id      ayar kontrolünün kimliği
   * Ücretsiz kullanıcıda animasyonlu stil katmanı Pro'dur: kart dokunuşları ve yalnız o
   * katmanı etkileyen ayarlar (yazı tipi, boyut, renk...) önizlemedir, adım kapanınca geri
   * alınır. Ücretsiz altyazı izini etkileyen ayarlar (satır uzunluğu, harf, noktalama)
   * bilinçli seçimdir. Kart dokunuşu da seçim sayılsaydı ücretsiz varsayılan sessizce
   * Pro stiline (tek kelime, BÜYÜK HARF satırlar) dönerdi.
   */
  var UCRETSIZ_IZ_AYARLARI = ["cap-maxlen", "cap-case", "cap-punct"];
  function stilDokunusuSecimMi(o) {
    o = o || {};
    if (o.tur === "ayar") return !!o.pro || UCRETSIZ_IZ_AYARLARI.indexOf(String(o.id || "")) !== -1;
    if (o.tur === "kart") return !!o.pro && !!o.kart && !o.kilitli && !!o.secili;
    return false;
  }

  function sinifVar(n, c) {
    if (!n) return false;
    if (n.classList && typeof n.classList.contains === "function") return n.classList.contains(c);
    return (" " + String(n.className || "") + " ").indexOf(" " + c + " ") !== -1;
  }

  /*
   * Stil ızgarasındaki bir tıklamanın hedefi: hedeften ızgaraya (kap) doğru çıkıp
   * .stil-sec kartını bulur. DOM'suz test edilebilsin diye yalnız parentNode/sınıf okur.
   * Döner: { kart, kilitli, secili } (stilDokunusuSecimMi'ye verilir).
   */
  function stilTiklamasi(hedef, kap) {
    var n = hedef, kart = null;
    for (var i = 0; n && n !== kap && i < 20; i++) {
      if (sinifVar(n, "stil-sec")) { kart = n; break; }
      n = n.parentNode;
    }
    return {
      kart: !!kart,
      kilitli: !!kart && (sinifVar(kart, "locked") || sinifVar(kart, "pro-locked")),
      secili: !!kart && sinifVar(kart, "secili")
    };
  }

  var STIL_TERCIHLERI = ["maxlen", "kase", "punct", "preset", "mogrtPath", "motorStili", "stil"];
  function stilTercihiGeriYukle(simdi, eski) {
    var kaynak = eski && typeof eski === "object" ? eski : null;
    if (!simdi || typeof simdi !== "object") return kaynak ? JSON.parse(JSON.stringify(kaynak)) : null;
    var out = JSON.parse(JSON.stringify(simdi));
    STIL_TERCIHLERI.forEach(function (k) {
      if (kaynak && Object.prototype.hasOwnProperty.call(kaynak, k)) out[k] = JSON.parse(JSON.stringify(kaynak[k] === undefined ? null : kaynak[k]));
      else delete out[k];
    });
    return Object.keys(out).length ? out : null;
  }

  /*
   * Rehberin "Yerel motoru indir & kur" seçenekleri (app.js installLocalWhisper'a gider).
   *   o: { model, cudaKurulu (çalışan cuBLAS motoru zaten kurulu), ornekVar }
   * İlk kurulumda cuBLAS (646 MB) inmez; ama kurulu cuBLAS motoru CPU sürümüyle
   * EZİLMEZ (useGpu:false CPU zip'ini indirip GPU hızlandırmayı sessizce kapatırdı).
   * ffmpeg yalnız örnek klip varken arkaya bırakılır: örnek hazır WAV ile çözülür;
   * örnek yokken ilk altyazı ffmpeg ister ve indirme ilerlemesi kurulum düğmesinde görünsün.
   */
  function kurulumSecenekleri(o) {
    o = o || {};
    return { modelId: o.model || ONBOARDING_MODELI, useGpu: !!o.cudaKurulu, ffmpegArkada: !!o.ornekVar };
  }

  /*
   * Yapay zekâ özelliklerinden hangileri Pro? (Pro kapısı anahtardan ÖNCE çalışır;
   * ücretsiz kullanıcıya "anahtarla çalışır" denmesin.) Ad → Pro.gate özellik anahtarı.
   */
  var PRO_AI = { "Çeviri": "translate", "Çok dilli SRT paketi": "translate", "Viral anlar": "highlights", "B-roll önerileri": "highlights" };
  function aiProOzelligi(ozellik) {
    return Object.prototype.hasOwnProperty.call(PRO_AI, ozellik) ? PRO_AI[ozellik] : "";
  }

  // Rehberin 4. adımı ve anahtar sihirbazı: Pro durumuna göre dürüst özellik listesi
  function aiMetni(pro, tamam) {
    if (pro) {
      return tamam ? "Yapay zekâ açık: çeviri, AI metin kontrolü, viral anlar, B-roll önerileri ve bölüm başlıkları hazır."
        : "Çeviri, AI metin kontrolü, viral anlar, B-roll önerileri, bölüm başlıkları ve paylaşım metni ücretsiz bir Groq anahtarıyla çalışır.";
    }
    return tamam ? "Yapay zekâ açık: AI metin kontrolü, bölüm başlıkları, paylaşım metni ve kanca önerileri hazır. Çeviri, viral anlar ve B-roll Pro'da."
      : "AI metin kontrolü, bölüm başlıkları, paylaşım metni ve kanca önerileri ücretsiz bir Groq anahtarıyla çalışır. Çeviri, viral anlar ve B-roll önerileri Pro'da aynı anahtarla açılır.";
  }

  /*
   * KS_importSample hata kodu → kullanıcı metni (host.jsx ES3 ve ASCII; Türkçe metin
   * ve İngilizce çevirisi burada). Bilinmeyen kodda host'un iletisi, o da yoksa genel metin.
   */
  var ORNEK_HATALARI = {
    "proje-yok": "Açık proje yok. Önce bir proje aç ya da yeni bir proje oluştur, sonra tekrar dene.",
    "yol-yok": "Örnek klip bulunamadı. Suflo'yu yeniden kurmayı dene.",
    "dosya-yok": "Örnek klip bulunamadı. Suflo'yu yeniden kurmayı dene.",
    "ice-alinamadi": "Örnek klip projeye alınamadı. Premiere'de açık bir pencere varsa kapatıp tekrar dene."
  };
  function ornekHataMetni(r) {
    var kod = r && typeof r.kod === "string" ? r.kod : "";
    if (kod && Object.prototype.hasOwnProperty.call(ORNEK_HATALARI, kod)) return ORNEK_HATALARI[kod];
    return r && r.error ? String(r.error) : "Premiere örnek klibi alamadı.";
  }

  /*
   * KS_importSample sonucu ne yapılır?
   *   "hazir"    sekans açık ve klip içinde: altyazı çıkar, "Normal altyazı izi ekle" vurgulanır
   *   "surukle"  sekans kurulamadı (eski Premiere): altyazı çıkar ama uygula vurgulanmaz;
   *              kullanıcı klibi Yeni Öğe simgesine sürükleyip açılan sekansta uygular
   *   "ac"       sekans var ama etkinleştirilemedi (modal pencere vb.): altyazı ÇIKMAZ —
   *              yoksa örnek altyazı kullanıcının açık sekansına uygulanabilirdi
   */
  function ornekSonucu(r) {
    if (!r || !r.ok) return "hata";
    if (r.needsDrag) return "surukle";
    if (r.active === false) return "ac";
    return "hazir";
  }

  /*
   * "Atla" hangi adımı atlar? Kullanıcı bir başlığı açtıysa (sırayı beklemeden) ve o
   * adım hâlâ bekliyorsa onu; değilse sıradakini.
   */
  function atlanacakAdim(h, acikAdim) {
    if (!h) return null;
    var d = acikAdim && h.adimlar ? h.adimlar[acikAdim] : "";
    if (d === "bekliyor" || d === "yok") return acikAdim;
    return h.siradaki || null;
  }

  /*
   * Groq anahtarını yapıştırılan metinden ayıkla: boşluk, tırnak, "Bearer " ve
   * etrafındaki açıklama satırları atılır. Tam olarak BİR anahtar bulunmalı;
   * çıplak "gsk_", OpenAI'nin "sk-…" anahtarları ve anahtarsız çok satırlı metin
   * "" döner. Anahtar hiçbir yerde günlüğe yazılmaz.
   */
  var ANAHTAR_RE = /(^|[^A-Za-z0-9_])(gsk_[A-Za-z0-9]{20,200})(?![A-Za-z0-9_])/g;
  function anahtarAyikla(metin) {
    var s = String(metin == null ? "" : metin);
    if (s.length > 4000) return "";
    var bulunan = [];
    var m;
    ANAHTAR_RE.lastIndex = 0;
    while ((m = ANAHTAR_RE.exec(s)) !== null) {
      if (bulunan.indexOf(m[2]) === -1) bulunan.push(m[2]);
    }
    return bulunan.length === 1 ? bulunan[0] : "";
  }

  /*
   * GET https://api.groq.com/openai/v1/models yanıtının anlamı.
   * Çevrimdışı/sunucu hatası ASLA "geçersiz" sayılmaz: anahtar uyarıyla kaydedilir.
   */
  function anahtarSonucu(durumKodu) {
    var k = Number(durumKodu) || 0;
    if (k >= 200 && k < 300) return { durum: "ok", gecerli: true, kaydet: true };
    if (k === 401 || k === 403) return { durum: "gecersiz", gecerli: false, kaydet: false };
    if (k === 429) return { durum: "limit", gecerli: true, kaydet: true };
    if (k === 0 || k >= 500) return { durum: "baglanti-yok", gecerli: null, kaydet: true };
    return { durum: "belirsiz", gecerli: null, kaydet: true };
  }

  /*
   * Arka planda inen daha doğru model, kullanıcının o arada seçtiği modeli ezmesin:
   * yalnız ayar hâlâ rehberin kurduğu modelse yenisine geçilir. Döner: yeni id ya da null.
   */
  function modelGecisi(mevcut, rehberModeli, yeni) {
    if (!yeni) return null;
    if (String(mevcut || "") === String(rehberModeli || ONBOARDING_MODELI)) return yeni;
    return null;
  }

  /* ---------------- Örnek klip (assets/onboarding) ---------------- */

  var DOSYA_ADI = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
  function dosyaAdiGecerli(ad, uzanti) {
    return typeof ad === "string" && DOSYA_ADI.test(ad) && ad.indexOf("..") === -1 &&
      new RegExp("\\." + uzanti + "$", "i").test(ad);
  }

  /*
   * ornek.json: { surum:1, lang:"tr", video:"ornek-tr.mp4", wav:"ornek-tr.wav",
   *               mp3:"ornek-tr.mp3", words:"ornek-tr.words.json", sure:15, sekans:"Suflo Deneme" }
   * Yalnız aynı klasördeki düz dosya adları kabul edilir (yol yok, ".." yok).
   */
  function ornekManifestDogrula(m) {
    if (!m || typeof m !== "object") return { ok: false, hata: "manifest okunamadı" };
    var gerek = [["video", "mp4"], ["wav", "wav"], ["words", "json"]];
    for (var i = 0; i < gerek.length; i++) {
      if (!dosyaAdiGecerli(m[gerek[i][0]], gerek[i][1])) return { ok: false, hata: gerek[i][0] + " dosya adı geçersiz" };
    }
    if (m.mp3 !== undefined && m.mp3 !== "" && !dosyaAdiGecerli(m.mp3, "mp3")) return { ok: false, hata: "mp3 dosya adı geçersiz" };
    var dosyalar = { video: m.video, wav: m.wav, words: m.words };
    if (m.mp3) dosyalar.mp3 = m.mp3;
    var sure = Number(m.sure);
    return {
      ok: true,
      dosyalar: dosyalar,
      lang: /^[a-z]{2}$/.test(String(m.lang || "")) ? m.lang : "tr",
      sure: isFinite(sure) && sure > 0 && sure < 120 ? sure : 15,
      sekans: typeof m.sekans === "string" && m.sekans.trim() ? m.sekans.trim().slice(0, 60) : "Suflo Deneme"
    };
  }

  // RIFF/WAVE başlığı: whisper ffmpeg'siz okuyabilsin diye 16 kHz mono 16-bit PCM olmalı
  function wavBaslik(buf) {
    try {
      if (!buf || buf.length < 44) return { ok: false, hata: "dosya çok kısa" };
      var ascii = function (a, n) { var s = ""; for (var i = 0; i < n; i++) s += String.fromCharCode(buf[a + i]); return s; };
      var u16 = function (a) { return buf[a] | (buf[a + 1] << 8); };
      var u32 = function (a) { return (buf[a] | (buf[a + 1] << 8) | (buf[a + 2] << 16)) + buf[a + 3] * 16777216; };
      if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") return { ok: false, hata: "RIFF/WAVE değil" };
      var p = 12;
      while (p + 8 <= buf.length) {
        var ad = ascii(p, 4), boy = u32(p + 4);
        if (ad === "fmt ") {
          if (p + 24 > buf.length) return { ok: false, hata: "fmt parçası eksik" };
          var b = { ok: true, bicim: u16(p + 8), kanal: u16(p + 10), ornekleme: u32(p + 12), bit: u16(p + 22) };
          b.uygun = b.bicim === 1 && b.kanal === 1 && b.ornekleme === 16000 && b.bit === 16;
          return b;
        }
        p += 8 + boy + (boy % 2);
      }
      return { ok: false, hata: "fmt parçası yok" };
    } catch (e) { return { ok: false, hata: String(e && e.message ? e.message : e) }; }
  }

  function sayi(x) { var n = Number(x); return isFinite(n) ? n : NaN; }
  function zamanliMi(x) { return x && isFinite(sayi(x.start)) && isFinite(sayi(x.end)) && sayi(x.end) >= sayi(x.start) && String(x.text || "").trim(); }

  // Kelimelerden satır: cümle sonu, uzun boşluk ya da 12 kelimede yeni satır
  function kelimelerdenSatirlar(words) {
    var out = [], acc = [];
    function bosalt() {
      if (!acc.length) return;
      out.push({ start: acc[0].start, end: acc[acc.length - 1].end, text: acc.map(function (w) { return w.text; }).join(" ") });
      acc = [];
    }
    for (var i = 0; i < words.length; i++) {
      var w = words[i], onceki = acc[acc.length - 1];
      if (onceki && (w.start - onceki.end > 0.8 || acc.length >= 12)) bosalt();
      acc.push(w);
      if (/[.!?…]$/.test(w.text)) bosalt();
    }
    bosalt();
    return out;
  }

  /*
   * Hazır transkript (ornek-tr.words.json): { lang, words:[{start,end,text}], segments:[…] }
   * ya da yalnız kelime dizisi. Zamanlar klibe görelidir. Döner: { lang, words, segments }
   * (segments yoksa kelimelerden kurulur). Bozuk kayıtlar atılır.
   */
  function ornekKelimeleri(veri) {
    var v = veri;
    if (Array.isArray(v)) v = { words: v };
    if (!v || typeof v !== "object") return { lang: "tr", words: [], segments: [] };
    function temizle(liste) {
      return (Array.isArray(liste) ? liste : []).filter(zamanliMi).map(function (x) {
        return { start: sayi(x.start), end: sayi(x.end), text: String(x.text).trim() };
      }).sort(function (a, b) { return a.start - b.start; });
    }
    var words = temizle(v.words);
    var segments = temizle(v.segments);
    if (!segments.length && words.length) segments = kelimelerdenSatirlar(words);
    return { lang: /^[a-z]{2}$/.test(String(v.lang || "")) ? v.lang : "tr", words: words, segments: segments };
  }

  /*
   * go()'nun motor çıktısıyla aynı girdi: kelime zamanlı modlarda (k1/kc) kelimeler,
   * satır modlarında (wN/cN) satırlar; hepsi sekansa göre kaydırılmış (offset).
   */
  function ornekGirdisi(ornek, lenVal, offset) {
    var o = Number(offset) || 0;
    var kaynak = /^k/.test(String(lenVal || "")) ? ornek.words : ornek.segments;
    return (kaynak || []).map(function (s) { return { start: s.start + o, end: s.end + o, text: s.text }; });
  }

  return {
    SURUM: SURUM,
    ADIMLAR: ADIMLAR,
    ONBOARDING_MODELI: ONBOARDING_MODELI,
    yeniKayit: yeniKayit,
    kayitDuzelt: kayitDuzelt,
    gosterimKarari: gosterimKarari,
    adimlariHesapla: adimlariHesapla,
    ilerlemeMetni: ilerlemeMetni,
    modelSec: modelSec,
    kurulumSecenekleri: kurulumSecenekleri,
    aiProOzelligi: aiProOzelligi,
    aiMetni: aiMetni,
    ornekHataMetni: ornekHataMetni,
    ornekSonucu: ornekSonucu,
    atlanacakAdim: atlanacakAdim,
    stilYedegiGecerli: stilYedegiGecerli,
    stilTercihiGeriYukle: stilTercihiGeriYukle,
    stilDokunusuSecimMi: stilDokunusuSecimMi,
    stilTiklamasi: stilTiklamasi,
    anahtarAyikla: anahtarAyikla,
    anahtarSonucu: anahtarSonucu,
    modelGecisi: modelGecisi,
    ornekManifestDogrula: ornekManifestDogrula,
    wavBaslik: wavBaslik,
    kelimelerdenSatirlar: kelimelerdenSatirlar,
    ornekKelimeleri: ornekKelimeleri,
    ornekGirdisi: ornekGirdisi
  };
});
