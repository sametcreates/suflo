/*
 * Suflo — After Effects altyazı planı (deneysel; saf modül)
 *
 * Suflo paneli After Effects'te de açılır (CSXS/manifest.xml AEFT). Altyazı orada Premiere'in caption izi / video
 * katmanı değil, kompozisyondaki YEREL METİN KATMANLARIDIR: her altyazı kartı bir metin katmanı. Kararların hepsi
 * burada (Node'da test edilir); jsx/host-ae.jsx yalnız planı yürütür.
 *
 *   uygulamaKodu(env)         CSInterface.getHostEnvironment() → "PPRO" | "AEFT" | "" (bilinmeyen / tarayıcı önizlemesi)
 *   hostCagrisi(fn, kod)      After Effects'te panelin K.call'u: Premiere işlevinin AE karşılığı (KS_getContext →
 *                             KSAE_baglam …) ve cevabı Premiere biçimine çeviren işlev; karşılığı olmayan KS_* çağrısı
 *                             hiç gönderilmez (engel: Premiere'e özgü host.jsx kodu AE projesinde çalışmasın)
 *   katmanKaynagi(k)          seçili katmanın kaynak dosyasında okunacak aralık: katmanın inPoint / startTime /
 *                             esnetmesi (stretch) ve kompozisyon sınırı; zaman yeniden eşleme ve ters katman reddedilir
 *   baglamSekli / klipSekli   KSAE_baglam / KSAE_seciliKatmanlar cevabı → KS_getContext / KS_getSelectedClips biçimi
 *                             (app.js bağlam şeridi ve captions.js "Seçili klip" transkripti değişmeden çalışır)
 *   plan(cues, o)             altyazı satırları + stil → katman planı (zaman, metin, konum, yazı, giriş anahtarları,
 *                             etkin kelime animatörünün kelime dizini anahtarları, yazı animasyonunun metin animatörleri,
 *                             arka plan kutusu, deneme filigranı, uyarılar)
 *   aeDestegi(id)             yazı animasyonunun After Effects karşılığı: "tam" | "yakin" | "yok" (katalogdaki ae alanı
 *                             bununla aynı olmalı; test denetler)
 *
 * Kipler: "duz" (ücretsiz; Premiere'in ücretsiz caption izinin karşılığı: düz beyaz yazı, siyah kontur, alt güvenli
 * bölge) ve "stilli" (Altyazı Efektleri: kartlar önizlemeyle AYNI kurulur — js/caption-mogrt-json.js satirlar →
 * stil motorunun efektSatirlari; konum js/altyazi-efekt.js konumNoktasi; denemesiz Pro kapısı panelde, "overlay").
 * Suflo'nun oluşturduğu her katmanın yorumu ISARET ile başlar: "Suflo altyazılarını kaldır" yalnız onları siler.
 *
 * After Effects'te gerçek denemesi YAPILMADI (README "After Effects (deneysel)"). DOM'a, AE'ye, dosyaya dokunmaz.
 * ES5, UMD (Node 12 / CEF 74).
 */
(function (root, factory) {
  function yukle(ad, yol) {
    var m = (root && root[ad]) || null;
    if (!m && typeof require === "function") { try { m = require(yol); } catch (e) { m = null; } }
    return m;
  }
  // Bağımlılıklar çağrı anında yüklenir: bu dosya index.html'de bridge.js'ten ÖNCE gelir (K.call eşlemesi)
  var api = factory(function () { return yukle("SufloAltyaziEfekt", "./altyazi-efekt.js"); },
    function () { return yukle("SufloCaptionMogrtJson", "./caption-mogrt-json.js"); },
    function () { return yukle("SufloStyleEngine", "./style-engine.js"); },
    function () { return yukle("SufloCaptionLayout", "./caption-layout.js"); });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAePlan = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (aeBul, cmjBul, seBul, clBul) {
  "use strict";

  var AE_ = null, CMJ_ = null, SE_ = null, CL_ = null;
  function AE() { if (!AE_ && aeBul) AE_ = aeBul(); return AE_; }
  function CMJ() { if (!CMJ_ && cmjBul) CMJ_ = cmjBul(); return CMJ_; }
  function SE() { if (!SE_ && seBul) SE_ = seBul(); return SE_; }
  function CL() { if (!CL_ && clBul) CL_ = clBul(); return CL_; }

  /*
   * Plan sürümü (host-ae.jsx KSAE_PLAN_SURUMU ile aynı). 2: yazı animasyonlarının metin animatörleri (animatorler),
   * katman anahtarları (katmanAnahtarlari), kutu, maske, 3B, gruplama ve yedek font. Eski host yeni planı reddeder
   * (animatörleri bilmeden yanlış çıktı vermesin).
   */
  var SURUM = 2;
  /*
   * Kayıt işareti: Suflo'nun oluşturduğu katmanın yorumu (Layer › Comment) "Suflo altyazi | <iş> | <tür>" diye başlar.
   * ASCII: ExtendScript dosyası ve AE'nin yorum alanı kodlama sürprizi yaşatmasın. Katman ayrıca ETIKET rengini alır
   * (Timeline'da tek bakışta görünür). shy kullanılmaz: "Hide shy layers" açık kompozisyonda altyazılar kaybolurdu.
   */
  var ISARET = "Suflo altyazi";
  var ETIKET = 9;
  var MIN_SURUM = 17;   // manifestteki AEFT alt sınırı (test eşleşmeyi denetler)

  /*
   * Ücretsiz düz kip: Premiere'in ücretsiz caption izi gibi sade. Punto ve kontur 1080 kısa kenara göre (stil motoru
   * kuralı). Arial her iki işletim sisteminde kurulu (PostScript adları): Suflo'nun paket fontları AE'ye kurulu olmayabilir.
   */
  var DUZ = { font: "Arial-BoldMT", boyut: 60, kontur: 4, renk: "#ffffff", konturRenk: "#000000" };
  // Güvenli bölge: yatayda başlık güvenli alanı (%10 kenar payı); 9:16'da platform arayüzünün üstü (stil motoru GUVENLI_ALAN)
  var BASLIK_GUVENLI = 0.1;
  var DIKEY_ALT_YEDEK = 0.78;
  // Ortalama karakter genişliği (em): Arial Bold karışık harfte ~0,55 (caption-mogrt-json ARIAL_GENISLIK büyük harfli 0,62)
  var DUZ_GENISLIK = 0.55;
  // AE metin katmanının otomatik satır aralığı (punto × ~1,2): sarılan düz altyazının yüksekliği
  var DUZ_SATIR_ARALIGI = 1.2;
  var EN_KUCUK_PUNTO = 12;
  // Altyazı Efektleri girişi: stil motorunun T'si (300 ms, Dengeli şiddet) ve kayma payı scaled(50)
  var GIRIS_SN = 0.3;
  var KAYMA = 50;
  var ZIPLA_OLCEK = 112;
  // Deneme filigranı (js/filigran.js'in karşılığı): sağ üstte "suflo.app", kısa kenarın ~%2,6'sı, ~%60 opak
  var FILIGRAN = { metin: "suflo.app", oran: 0.026, opak: 60, font: "ArialMT" };

  var UYARI = {
    aktif: "Titre ve Glitch kelime hareketleri After Effects çıktısında henüz yok; etkin kelime yalnız vurgu rengini alır.",
    zipla: "Zıpla kelime hareketi After Effects'te etkin kelimeyi büyüterek gösterilir.",
    /*
     * Animasyon motoru v2: yazı animasyonunun AE karşılığı (aeDestegi). "yok": katalogdaki klasik giriş / vurgu çiftiyle
     * çizilir; "yakin": yerel metin animatörleriyle, farkı NOTLAR'da. {} animasyonun adı (i18n kalıbı adı da çevirir).
     */
    animYok: "«{}» yazı animasyonu After Effects çıktısında yok; en yakın klasik giriş ve vurgu animasyonuyla eklendi.",
    animYakin: "«{}» yazı animasyonu After Effects'te yaklaşık karşılığıyla eklendi: {}."
  };
  // "yakin" animasyonların After Effects'teki farkı (UYARI.animYakin'in ikinci {}'si)
  var NOTLAR = {
    "kelime-pop": "kelimeler küçükten büyüyerek gelir, sondaki sekme yok",
    "yukari-suzul": "hızlı konuşmada kelimenin süzülmesi sonraki kelime başlayınca biter",
    "dalga": "dalgayı kartın tamamı yapar, kelimeler sırayla belirir",
    "zipla-gel": "zıplayışı kartın tamamı yapar, kelimeler söylendikçe belirir",
    "dusus": "düşüşü kartın tamamı yapar, kelimeler sırayla belirir",
    "harf-belir": "harfler iç içe geçmeden birbiri ardına belirir",
    "karaoke-dolgu": "dolgu harf harf ilerler, önceki kelime anında normale döner",
    "iki-ton": "renk değişimi yumuşak geçişsiz, anında",
    "buyuyen-vurgu": "anahtar kelime yanındakileri itmeden büyür",
    "kapak-cevir": "kart 3B katman olarak X ekseninde döner, perspektif kompozisyonun kamerasına bağlı",
    "perde": "perde maskesi yazıyla birlikte yükselir",
    // AutoCaptions koleksiyonu
    "isilti-kay": "ışıltı yerine yumuşak bulanıklık kullanılır",
    "hiz-bulanik": "yön bulanıklığı yerine her yöne eşit bulanıklık kullanılır",
    "puruzlu": "kenar pürüzü yok, kart bulanıktan netleşir"
  };
  var HATA = {
    comp: "After Effects'te bir kompozisyon aç.",
    secim: "Kompozisyonda sesi olan bir katman seç (video ya da ses dosyası).",
    kaynak: "Seçili katmanın kaynağı bir dosya değil (ön kompozisyon, katı renk ya da metin); sesi doğrudan okunamıyor. Kaynak dosyalı bir katman seç.",
    ses: "Seçili katmanda ses yok. Sesi olan bir katman seç.",
    remap: "Zaman yeniden eşleme (Time Remap) açık katmanın sesi bu sürümde okunamıyor.",
    ters: "Ters çevrilmiş (eksi esnetmeli) katmanın sesi okunamıyor.",
    disarida: "Seçili katman kompozisyonun görünen süresinin dışında kalıyor.",
    yok: "Bu işlem After Effects'te kullanılamaz (yalnız Premiere Pro)."
  };

  function sayi(v) { var n = Number(v); return typeof v !== "boolean" && v !== null && v !== "" && isFinite(n) ? n : null; }
  function yuvarla(v, b) { var k = Math.pow(10, b); return Math.round(v * k) / k; }
  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }

  /* ---------------- Ana uygulama ---------------- */

  /*
   * CSInterface.getHostEnvironment() nesnesi (ya da __adobe_cep__'in JSON metni). appName: "PPRO" | "AEFT" (CEP'in
   * uygulama kimlikleri). Tanınmayan / boş: "" (panel Premiere davranışında kalır).
   */
  function uygulamaKodu(env) {
    var e = env;
    if (typeof e === "string") { try { e = JSON.parse(e); } catch (eJ) { e = null; } }
    if (!e || typeof e !== "object") return "";
    var ad = String(e.appName || e.appId || "").toUpperCase();
    return ad === "AEFT" || ad === "PPRO" ? ad : "";
  }

  /* ---------------- Katman zamanı ---------------- */

  /*
   * k (KSAE_seciliKatmanlar katmanı): { inPoint, outPoint, startTime (kompozisyon sn), stretch (%; 100 normal),
   * timeRemap (bool), tur ("dosya" | "comp" | "diger"), mediaPath, hasAudio } + compSure (sn).
   * Kaynak saniyesi = (kompozisyon saniyesi − startTime) × 100 / stretch. Kompozisyonun dışına taşan kısım okunmaz
   * (inPoint < 0 ya da outPoint > süre). Döner: { ok, ss, t, clipStart, clipEnd } (ss / t kaynak sn) | { ok:false, error }.
   */
  function katmanKaynagi(k) {
    if (!k || typeof k !== "object") return { ok: false, error: HATA.secim };
    if (k.tur !== "dosya" || !k.mediaPath) return { ok: false, error: HATA.kaynak };
    if (k.hasAudio === false) return { ok: false, error: HATA.ses };
    if (k.timeRemap === true) return { ok: false, error: HATA.remap };
    var esnet = sayi(k.stretch);
    if (esnet === null || esnet === 0) esnet = 100;
    if (esnet < 0) return { ok: false, error: HATA.ters };
    var bas = sayi(k.inPoint) || 0, son = sayi(k.outPoint) || 0, baslangic = sayi(k.startTime) || 0;
    var sure = sayi(k.compSure);
    var c0 = Math.max(0, bas), c1 = sure !== null && sure > 0 ? Math.min(son, sure) : son;
    if (!(c1 - c0 > 0.001)) return { ok: false, error: HATA.disarida };
    var oran = 100 / esnet;
    return { ok: true, ss: yuvarla((c0 - baslangic) * oran, 6), t: yuvarla((c1 - c0) * oran, 6), clipStart: yuvarla(c0, 6), clipEnd: yuvarla(c1, 6) };
  }

  // Premiere'in KS_getSelectedClips klibi: inPoint / dur KAYNAK saniyesi, clipStart / clipEnd kompozisyon saniyesi
  function klipNesnesi(k, z) {
    return { name: String(k.name || ""), mediaPath: String(k.mediaPath), clipStart: z.clipStart, clipEnd: z.clipEnd,
      inPoint: z.ss, outPoint: yuvarla(z.ss + z.t, 6), dur: z.t, aeKatman: sayi(k.index) || 0 };
  }

  // Seçili katmanlardan okunabilenler (kompozisyon sırasıyla) ve ilk okunamayanın nedeni
  function uygunKatmanlar(r) {
    var comp = r && r.comp ? r.comp : null, out = [], ilkHata = "";
    (r && r.katmanlar instanceof Array ? r.katmanlar : []).forEach(function (k) {
      var kk = {};
      for (var a in k) if (own(k, a)) kk[a] = k[a];
      kk.compSure = comp ? comp.duration : null;
      var z = katmanKaynagi(kk);
      if (z.ok) out.push(klipNesnesi(kk, z));
      else if (!ilkHata) ilkHata = z.error;
    });
    // Aynı dosyanın aynı andaki iki seçili katmanı (ör. kopya) tek sayılır (Premiere'in video + ses çifti gibi)
    var gorulen = {}, tek = [];
    out.forEach(function (c) {
      var a = c.mediaPath.toLowerCase() + "@" + c.clipStart.toFixed(3);
      if (gorulen[a]) return;
      gorulen[a] = 1;
      tek.push(c);
    });
    tek.sort(function (a, b) { return a.clipStart - b.clipStart; });
    return { clips: tek, hata: ilkHata };
  }

  /*
   * KSAE_seciliKatmanlar → KS_getSelectedClips biçimi { ok, clips }. Kompozisyon yoksa ya da hiçbir seçili katman
   * okunamıyorsa ok:false ve Türkçe neden (ilk okunamayan katmanınki).
   */
  function klipSekli(r) {
    if (!r || r.ok === false) return r || { ok: false, error: HATA.comp };
    if (!r.comp) return { ok: false, error: HATA.comp };
    var u = uygunKatmanlar(r);
    if (!u.clips.length) return { ok: false, error: u.hata || HATA.secim };
    return { ok: true, clips: u.clips };
  }

  /*
   * KSAE_baglam → KS_getContext biçimi (app.js bağlam şeridi, captions.js kapsam denetimi). Kompozisyon "sequence"
   * yerine geçer; kimliği "ae:" önekli (Premiere sekans kimliğiyle karışmasın). Ses izi seçimi yok (audioTracks boş).
   * selUyari: katman seçili ama okunamıyor (bağlam şeridi nedenini gösterir).
   */
  function baglamSekli(r) {
    if (!r || r.ok === false) return r || { ok: false, error: HATA.comp };
    var c = r.comp || null;
    var out = { ok: true, app: String(r.app || ""), host: "AEFT", project: String(r.project || ""), hasSeq: !!c, sequence: c ? String(c.name || "") : "",
      sequenceId: c ? "ae:" + String(c.id) : "", sel: null, selCount: 0, audioTracks: [] };
    if (!c) return out;
    out.width = sayi(c.width) || 0;
    out.height = sayi(c.height) || 0;
    out.seqDur = sayi(c.duration) || 0;
    out.playhead = sayi(c.time) || 0;
    if (sayi(c.fps) > 0) { out.fps = Number(c.fps); out.frame = yuvarla(1 / Number(c.fps), 9); }
    var u = uygunKatmanlar(r);
    out.selCount = u.clips.length;
    if (u.clips.length) out.sel = u.clips[0];
    else if (r.katmanlar && r.katmanlar.length) out.selUyari = u.hata;
    return out;
  }

  /*
   * Panelin K.call'u After Effects'te: { ad, donustur } (ad: gönderilecek ExtendScript işlevi; donustur: cevabı Premiere
   * biçimine çeviren işlev ya da null) ya da { engel } (gönderilmez, cevap engel). Premiere'de (kod !== "AEFT") her şey
   * olduğu gibi gider. KSAE_* doğrudan geçer.
   */
  var ESLEME = {
    KS_getContext: { ad: "KSAE_baglam", donustur: baglamSekli },
    KS_getSelectedClips: { ad: "KSAE_seciliKatmanlar", donustur: klipSekli },
    KS_setPlayerPosition: { ad: "KSAE_oynatmaKafasi", donustur: null },
    KS_projectDir: { ad: "KSAE_projeKlasoru", donustur: null }
  };
  function hostCagrisi(fn, kod) {
    var ad = String(fn || "");
    if (kod !== "AEFT") return { ad: ad, donustur: null };
    if (own(ESLEME, ad)) return { ad: ESLEME[ad].ad, donustur: ESLEME[ad].donustur };
    if (/^KS_/.test(ad)) return { engel: { ok: false, kod: "after-effects", error: HATA.yok } };
    return { ad: ad, donustur: null };
  }

  /* ---------------- Plan ---------------- */

  function rgb01(hex) {
    var h = String(hex || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(h)) h = "ffffff";
    return [yuvarla(parseInt(h.slice(0, 2), 16) / 255, 4), yuvarla(parseInt(h.slice(2, 4), 16) / 255, 4), yuvarla(parseInt(h.slice(4, 6), 16) / 255, 4)];
  }

  // Kart metni: kontrol karakteri yok; satır kırılımı AE'nin TextDocument'ındaki "\r"
  function aeMetni(t) {
    return String(t == null ? "" : t).replace(/\r\n?/g, "\n").split("\n").map(function (s) {
      return s.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").replace(/^ | $/g, "");
    }).filter(function (s) { return s.length > 0; }).join("\r");
  }

  function kadrajOku(o) {
    var w = sayi(o && o.w), h = sayi(o && o.h), fps = sayi(o && o.fps), sure = sayi(o && o.sure);
    return { w: w > 0 ? Math.round(w) : 1920, h: h > 0 ? Math.round(h) : 1080, fps: fps > 0 ? fps : 25, sure: sure > 0 ? sure : 0 };
  }

  /*
   * Kartların zamanı kareye oturur ve çakışmaz: başlangıç önceki kartın sonundan önce olamaz, her kart en az bir kare.
   * Kompozisyon süresi biliniyorsa dışında başlayan kart düşer, taşan kırpılır. Kartın kendi anahtarları (etkin kelime)
   * kartın içine sıkıştırılır (zamanHizala).
   */
  function zamanla(kartlar, kad) {
    var kare = 1 / kad.fps, onceki = 0, out = [];
    function oturt(t) { return yuvarla(Math.round(t * kad.fps) / kad.fps, 6); }
    kartlar.slice().sort(function (a, b) { return a.bas - b.bas; }).forEach(function (k) {
      var bas = Math.max(oturt(Math.max(0, k.bas)), onceki);
      var son = Math.max(oturt(k.son), yuvarla(bas + kare, 6));
      if (kad.sure > 0) {
        if (bas >= kad.sure - 1e-6) return;
        son = Math.min(son, kad.sure);
      }
      k.bas = bas; k.son = son;
      onceki = son;
      out.push(k);
    });
    return out;
  }

  // Kelime düşürmeden açgözlü sarma (js/caption-layout.js yüklenemezse yedek)
  function acgozluSar(s, n) {
    var out = [], cur = "";
    s.split(" ").forEach(function (w) {
      if (!w) return;
      var aday = cur ? cur + " " + w : w;
      if (cur && aday.length > n) { out.push(cur); cur = w; } else cur = aday;
    });
    if (cur) out.push(cur);
    return out;
  }

  /*
   * Düz kipte satırı sar (Premiere'in caption izi gibi; eskiden yalnız punto küçülüyor, 12 punto tabanında yazı kadrajdan
   * taşıyordu). Temel puntoda sığmayan satır önce dengeli iki satıra (js/caption-layout.js dengeliSar: 21/21, 38/4 değil),
   * iki satıra da sığmazsa kelime düşürmeden daha çok satıra bölünür. Döner: satırlar.
   */
  // dil (isteğe bağlı): altyazının dili, kırılım Türkçe-duyarlı (js/tr-kirilim.js)
  function duzSar(metin, sigan, dil) {
    var cl = CL(), out = [];
    metin.split("\r").forEach(function (s) {
      if (s.length <= sigan) { out.push(s); return; }
      var parca = cl && cl.dengeliSar ? String(cl.dengeliSar(s, sigan, 2, dil)).split("\n") : acgozluSar(s, sigan);
      parca.forEach(function (p) { if (p) out.push(p); });
    });
    return out;
  }

  // Ücretsiz düz kip: her altyazı satırı bir katman, alt güvenli bölgede ortalı; uzun satır sarılır, punto yalnız yedek olarak küçülür
  function duzKartlar(cues, kad, guvenli, dil) {
    var olcek = Math.min(kad.w, kad.h) / 1080, dikey = kad.h > kad.w * 1.2;
    var se = SE(), ga = se && se.GUVENLI_ALAN && se.GUVENLI_ALAN[2] ? Number(se.GUVENLI_ALAN[2].y) : DIKEY_ALT_YEDEK;
    var altY = dikey ? ga : 1 - BASLIK_GUVENLI;
    /*
     * Yazının sığacağı genişlik: başlık güvenli alanı (%80); 9:16'da "Platform arayüzünden kaçın" açıkken stil motorunun
     * %74'ü (ortalı yazının sağ kenarı %87'deki ikon sütununun solunda kalır). Yatay konum her zaman orta.
     */
    var genislik = kad.w * (dikey && guvenli ? 0.74 : 1 - 2 * BASLIK_GUVENLI);
    var x = kad.w / 2;
    var temel = Math.max(EN_KUCUK_PUNTO, Math.round(DUZ.boyut * olcek));
    var sigan = Math.max(1, Math.floor(genislik / (temel * DUZ_GENISLIK)));
    // Sarılan yazı alttan çapalı yukarı büyür: üst başlık güvenli alanını aşmasın
    var yukseklik = kad.h * (altY - BASLIK_GUVENLI);
    var out = [];
    (cues || []).forEach(function (c) {
      // Düz kipte *vurgu* işareti yazılmaz (panel zaten ayıklar; burada da ayıklanır)
      var metin = aeMetni(String(c && c.text != null ? c.text : "").replace(/\*([^*\s][^*]*?)\*/g, "$1"));
      var bas = sayi(c && c.start), son = sayi(c && c.end);
      if (!metin || bas === null || son === null || !(son > bas)) return;
      var satirlar = duzSar(metin, sigan, dil);
      metin = satirlar.join("\r");
      var enUzun = 1;
      satirlar.forEach(function (s) { enUzun = Math.max(enUzun, s.length); });
      // Yedek küçültme: sarılsa da sığmayan tek uzun kelime ya da güvenli yüksekliği aşan çok satır
      var fs = Math.max(EN_KUCUK_PUNTO, Math.min(temel, Math.floor(genislik / (enUzun * DUZ_GENISLIK)),
        Math.floor(yukseklik / (satirlar.length * DUZ_SATIR_ARALIGI))));
      out.push({ bas: bas, son: son, metin: metin, konum: [yuvarla(x, 1), yuvarla(kad.h * altY, 1)], capa: [0.5, 1],
        yazi: { font: DUZ.font, boyut: fs, renk: rgb01(DUZ.renk), kontur: yuvarla(2 * DUZ.kontur * olcek, 1), konturRenk: rgb01(DUZ.konturRenk), italik: false },
        golge: null, giris: [], aktif: null, sabitVurgu: [], kelimeSayisi: metin.split(/[ \r]+/).length });
    });
    return out;
  }

  /*
   * Giriş animasyonu (stil motorunun efektGirisi'nin AE karşılığı): kart başından T sn'de biter (kart daha kısaysa kart
   * sonunda). Katmanın Transform anahtarları: [{ ozellik: "opaklik" | "olcek" | "konum", anahtarlar: [[sn, değer]] }].
   */
  function girisAnahtarlari(giris, bas, son, konum, olcek) {
    var T = Math.min(GIRIS_SN, Math.max(0.01, son - bas));
    function t(o) { return yuvarla(bas + T * o, 6); }
    if (giris === "fade") return [{ ozellik: "opaklik", anahtarlar: [[t(0), 0], [t(1), 100]] }];
    if (giris === "pop") return [{ ozellik: "olcek", anahtarlar: [[t(0), [0, 0]], [t(1), [100, 100]]] }];
    if (giris === "zipla") return [{ ozellik: "olcek", anahtarlar: [[t(0), [0, 0]], [t(0.5), [112, 112]], [t(0.77), [96, 96]], [t(1), [100, 100]]] }];
    var d = yuvarla(KAYMA * olcek, 1);
    if (giris === "yukari") return [{ ozellik: "konum", anahtarlar: [[t(0), [konum[0], yuvarla(konum[1] + d, 1)]], [t(1), konum.slice()]] }];
    if (giris === "asagi") return [{ ozellik: "konum", anahtarlar: [[t(0), [konum[0], yuvarla(konum[1] - d, 1)]], [t(1), konum.slice()]] }];
    return [];
  }

  /*
   * Etkin kelime (Range Selector, Units = Index, Based On = Words): kelime i'nin başında Start = i, End = i + 1
   * (Hold anahtar). Zamanlar kartın içine sıkıştırılır; aynı karede iki kelime başlarsa sonraki kazanır, ilk anahtar
   * kart başında. Döner: [[sn, i]]
   */
  function kelimeAnahtarlari(kelimeler, bas, son) {
    var out = [];
    (kelimeler || []).forEach(function (z, i) {
      var t = yuvarla(Math.max(bas, Math.min(son, Number(z && z[0]) || 0)), 6);
      if (i === 0) t = bas;
      if (out.length && t <= out[out.length - 1][0] + 1e-9) out[out.length - 1] = [out[out.length - 1][0], i];
      else out.push([t, i]);
    });
    return out;
  }

  /* ---------------- Yazı animasyonları: After Effects metin animatörleri ---------------- */

  /*
   * Animasyon motoru v2'nin (js/style-engine.js ANIM) AE karşılığı. Her animasyon kartın zamanına ve kelime pencerelerine
   * göre deterministik bir plan verir:
   *   animatorler        [{ ad, tabani: "karakter" | "kelime", ozellikler: { opaklik, konum, olcek, donme, bulaniklik,
   *                      izleme, dolguRengi, konturRengi } (AE değeriyle: konum [x, y, 0], olcek [s, s, 100], bulaniklik
   *                      [b, b], renk [r, g, b] 0-1), anahtarlar: { özellik: [[sn, değer]] } (isteğe bağlı),
   *                      secici: { birim: "indeks" | "yuzde", baslangic, son, ofset (sabit), baslangicAnahtarlari,
   *                      sonAnahtarlari, ofsetAnahtarlari, miktarAnahtarlari ([[sn, değer]]), sekil ("kare" …), tut (true:
   *                      hepsi Hold; ya da ["baslangic", …]) } }]
   *   katmanAnahtarlari  [{ ozellik: "opaklik" | "olcek" | "konum" | "donme" | "xDonme", anahtarlar, yumusatma (etki %) }]
   *   gruplama           metnin Anchor Point Grouping'i ("kelime": ölçek / dönme kelimenin ortasında)
   *   ucBoyut            katman 3B (kapak-cevir)
   *   maske              { ad, ifade } (perde: sourceRectAtTime'a bağlı maske yolu ifadesi)
   * Seçici kuralı ("gizliden açığa" süpürme): animatörün özellikleri gizli / başlangıç hâlidir; seçici [Başlangıç, Son)
   * aralığı henüz girmemiş birimleri seçer, Başlangıç anahtarlarıyla birim birim ilerler (Square şekil, kesirli dizin
   * birimin kısmi seçimidir). Hareket penceresi stil motorununkiyle aynı (Dengeli şiddet; T gibi).
   * Hiçbir çağrı zaman damgası ya da rastgelelik kullanmaz; anahtarlar kartın [bas, son] aralığında, zamanca artan.
   * Hepsi Suflo'nun kendi animasyonları; üçüncü taraf ön ayarı / ifadesi yok.
   */
  var SEKME = 0.01;   // en kısa hareket penceresi (sn)
  var DAKTILO_ORAN = 0.8, DOLGU_ORAN = 0.9;
  var BUYUYEN_OLCEK = 112;

  function sc(v, olcek) { return Math.max(1, Math.round(v * olcek)); }
  function ondalik(v) { return Math.round(v * 10) / 10; }
  function kirp(t, a, b) { return Math.max(a, Math.min(b, t)); }
  // Kelimenin AE'deki karakter sayısı (Based On: Characters Excluding Spaces); emoji vekil çifti tek karakter
  function harfSayisi(w) { return (String(w).match(/[\ud800-\udbff][\udc00-\udfff]|[^\s]/g) || []).length; }
  // Zamanca artan anahtar listesine ekle: aynı ya da önceki zamana düşen anahtar sonuncunun değerini alır (son kazanır)
  function anahtarEkle(liste, t, v) {
    t = yuvarla(t, 6);
    var son = liste.length ? liste[liste.length - 1] : null;
    if (son && t <= son[0] + 1e-6) { son[1] = v; return; }
    liste.push([t, v]);
  }
  // Kart başından T = min(D, kart) sn'lik hareket: kare [[kesir, değer]] → [[sn, f(değer)]]
  function kartKeyleri(kare, c, f) {
    var T = Math.max(SEKME, Math.min(c.D, c.son - c.bas)), out = [];
    kare.forEach(function (k) { anahtarEkle(out, c.bas + T * k[0], f(k[1])); });
    return out;
  }
  /*
   * Gizliden açığa süpürme: pencereler [[a, b]] birim sırasıyla, egri [[u, p]] (p 0 → 1 artan). Birimin hareketi bir
   * sonraki birimin başında biter (tek Başlangıç değeri iki birimi aynı anda süremez). Döner: Başlangıç anahtarları.
   */
  function supurme(pencereler, egri, c) {
    var out = [], onceki = c.bas;
    pencereler.forEach(function (w, i) {
      var a = Math.max(onceki, kirp(w[0], c.bas, c.son));
      var ust = i + 1 < pencereler.length ? Math.max(a, kirp(pencereler[i + 1][0], c.bas, c.son)) : c.son;
      var b = Math.max(a, Math.min(kirp(w[1], c.bas, c.son), ust));
      egri.forEach(function (k) { anahtarEkle(out, a + (b - a) * k[0], yuvarla(i + k[1], 4)); });
      onceki = b;
    });
    if (!out.length) out.push([c.bas, 0]);
    return out;
  }
  // Kelimenin adımı: [başı, sonraki kelimenin başı ya da kart sonu] (kartın içine kırpılmış)
  function adimlar(c) {
    return c.kel.map(function (w, i) {
      var a = kirp(Number(w[0]) || 0, c.bas, c.son);
      var b = i + 1 < c.kel.length ? kirp(Number(c.kel[i + 1][0]) || 0, c.bas, c.son) : c.son;
      return [a, Math.max(a, b)];
    });
  }
  // Girişli kelimenin hareket penceresi (stil motoru: kartın kalanının %80'i, en çok D)
  function kelimePenceresi(c) {
    return adimlar(c).map(function (s) { return [s[0], s[0] + Math.max(SEKME, Math.min(c.D, (c.son - s[0]) * 0.8))]; });
  }
  // Sıralı belirme pencereleri: kart başından kademe arayla (dalga, düşüş)
  function kademePenceresi(c, kademe) {
    var n = c.kel.length, k = n > 1 ? Math.min(kademe, (c.son - c.bas) * 0.5 / (n - 1)) : kademe;
    return c.kel.map(function (w, i) { return [c.bas + i * k, c.bas + (i + 1) * k]; });
  }
  function kelimeSecici(c, ek) {
    var s = { birim: "indeks", baslangic: 0, son: c.kel.length, sekil: "kare" };
    for (var a in ek) if (own(ek, a)) s[a] = ek[a];
    return s;
  }
  function karakterSayilari(c) {
    var taban = [], N = 0;
    c.kelimeler.forEach(function (w, i) { taban[i] = N; N += harfSayisi(w); });
    return { taban: taban, N: N };
  }
  function animator(ad, tabani, ozellikler, secici, anahtarlar) {
    var a = { ad: ad, tabani: tabani, ozellikler: ozellikler, secici: secici };
    if (anahtarlar) a.anahtarlar = anahtarlar;
    return a;
  }
  // Kartın tamamı (yüzde birimi, %0-100): özellik anahtarlarıyla
  function kartSecici() { return { birim: "yuzde", baslangic: 0, son: 100 }; }
  function konumKeyleri(kare, c, eksen) {
    return kartKeyleri(kare, c, function (v) { return eksen === 0 ? [yuvarla(c.konum[0] + v, 1), c.konum[1]] : [c.konum[0], yuvarla(c.konum[1] + v, 1)]; });
  }
  function opaklikKeyleri(kare, c) { return { ozellik: "opaklik", anahtarlar: kartKeyleri(kare, c, function (v) { return Math.round(v * 100); }) }; }
  // Kelime kelime sırayla belirme (opaklık süpürmesi)
  function belirme(ad, pencereler, c) {
    return animator(ad, "kelime", { opaklik: 0 }, kelimeSecici(c, { baslangicAnahtarlari: supurme(pencereler, [[0, 0], [1, 1]], c) }));
  }
  // Etkin kelimenin seçimi (Hold): kelime i'nin başında Başlangıç = i, Son = i + 1; secim(i) false ise boş (0, 0)
  function etkinSecim(c, secim) {
    var bs = [], sn = [];
    adimlar(c).forEach(function (s, i) {
      var var_ = !secim || secim(i);
      anahtarEkle(bs, i === 0 ? c.bas : s[0], var_ ? i : 0);
      anahtarEkle(sn, i === 0 ? c.bas : s[0], var_ ? i + 1 : 0);
    });
    return { baslangicAnahtarlari: bs, sonAnahtarlari: sn };
  }
  // Etkin kelimenin kendi adımına sığan darbe penceresi (%80, en çok D): Amount anahtarları egri [[u, %]]
  function darbeMiktari(c, egri) {
    var out = [];
    adimlar(c).forEach(function (s) {
      var b = s[0] + Math.min(c.D, (s[1] - s[0]) * 0.8);
      if (b - s[0] < SEKME) return;
      egri.forEach(function (k) { anahtarEkle(out, s[0] + (b - s[0]) * k[0], k[1]); });
    });
    if (!out.length) out.push([c.bas, 0]);
    return out;
  }
  // Renk geçişi: etkin kelime D sn'de vurguya geçer, önceki aynı sürede döner (aralık [Başlangıç, Son) kayar)
  function renkKaymasi(c, birikimli) {
    var bs = [], sn = [];
    adimlar(c).forEach(function (s, i) {
      var b = s[0] + Math.min(c.D, s[1] - s[0]);
      anahtarEkle(sn, s[0], i); anahtarEkle(sn, b, i + 1);
      if (!birikimli) { anahtarEkle(bs, s[0], i === 0 ? 0 : i - 1); anahtarEkle(bs, b, i); }
    });
    var out = { sonAnahtarlari: sn };
    if (birikimli) out.baslangic = 0; else out.baslangicAnahtarlari = bs;
    return out;
  }

  /*
   * Kimlik → plan(c). c: { bas, son, D (sn, Dengeli), kel ([[kb, ks]] kelime pencereleri), kelimeler (metinler), anahtar
   * ([bool] *anahtar* kelime), fs, olcek (kısa kenar / 1080), w, h, konum, kontur, vurgu ve vurgu2 ([r, g, b] 0-1) }.
   * Döner: { animatorler, katmanAnahtarlari, gruplama, ucBoyut, maske, ikiTon (*anahtar* kelimelerin rengi sırayla vurgu /
   * vurgu2) }. Klasik etkin kelime rengi tanımın etkinRenk alanından (aşağıda). Burada olmayan kimlik "yok" (klasik çift).
   */
  var ANIM_AE = {
    "kelime-pop": { ae: "yakin", kur: function (c) {
      return { gruplama: "kelime", animatorler: [animator("Suflo kelime pop", "kelime", { olcek: [0, 0, 100] },
        kelimeSecici(c, { baslangicAnahtarlari: supurme(kelimePenceresi(c), [[0, 0], [0.6, 1]], c) }))] };
    } },
    "yukari-suzul": { ae: "yakin", kur: function (c) {
      var d = sc(28, c.olcek), p = kelimePenceresi(c);
      return { animatorler: [
        animator("Suflo süzül konum", "kelime", { konum: [0, d, 0] }, kelimeSecici(c, { baslangicAnahtarlari: supurme(p, [[0, 0], [0.45, yuvarla(1 - Math.round(d * 0.22) / d, 4)], [1, 1]], c) })),
        animator("Suflo süzül opaklık", "kelime", { opaklik: 0 }, kelimeSecici(c, { baslangicAnahtarlari: supurme(p, [[0, 0], [0.45, 0.8], [1, 1]], c) }))] };
    } },
    "dalga": { ae: "yakin", kur: function (c) {
      var d = sc(36, c.olcek);
      return { katmanAnahtarlari: [{ ozellik: "konum", anahtarlar: konumKeyleri([[0, d], [0.3, -Math.round(d * 0.4)], [0.6, Math.round(d * 0.16)], [1, 0]], c, 1) }],
        animatorler: [belirme("Suflo dalga belirme", kademePenceresi(c, 0.06), c)] };
    } },
    "zipla-gel": { ae: "yakin", kur: function (c) {
      var p = adimlar(c).map(function (s) { return [s[0], s[0] + Math.max(SEKME, Math.min(c.D * 0.3, s[1] - s[0]))]; });
      return { katmanAnahtarlari: [{ ozellik: "konum", yumusatma: 60,
        anahtarlar: konumKeyleri([[0, -sc(60, c.olcek)], [0.55, sc(10, c.olcek)], [0.8, -sc(4, c.olcek)], [1, 0]], c, 1) }],
        animatorler: [belirme("Suflo zıpla belirme", p, c)] };
    } },
    "dusus": { ae: "yakin", kur: function (c) {
      var d = sc(80, c.olcek);
      return { katmanAnahtarlari: [{ ozellik: "konum", anahtarlar: konumKeyleri([[0, -d], [0.42, 0], [0.6, -Math.round(d * 0.24)], [0.78, 0],
        [0.9, -Math.round(d * 0.07)], [1, 0]], c, 1) }], animatorler: [belirme("Suflo düşüş belirme", kademePenceresi(c, 0.07), c)] };
    } },
    "daktilo": { ae: "tam", kur: function (c) {
      // Harf j kelime penceresinin j / harf sayısı anında belirir (Hold; bir kez, yanıp sönme yok)
      var ks = karakterSayilari(c), bs = [[c.bas, 0]];
      adimlar(c).forEach(function (s, i) {
        var L = harfSayisi(c.kelimeler[i]), Dw = Math.max(SEKME, Math.min(c.D, (s[1] - s[0]) * DAKTILO_ORAN));
        for (var j = 0; j < L; j++) anahtarEkle(bs, s[0] + j * Dw / L, ks.taban[i] + j + 1);
      });
      return { animatorler: [animator("Suflo daktilo", "karakter", { opaklik: 0 },
        { birim: "indeks", baslangic: 0, son: ks.N, sekil: "kare", baslangicAnahtarlari: bs, tut: true })] };
    } },
    "harf-belir": { ae: "yakin", kur: function (c) {
      var N = karakterSayilari(c).N, T = Math.max(SEKME, Math.min(c.D, c.son - c.bas));
      return { animatorler: [animator("Suflo harf belir", "karakter", { opaklik: 0 },
        { birim: "indeks", baslangic: 0, son: N, sekil: "kare", baslangicAnahtarlari: [[c.bas, 0], [yuvarla(c.bas + T, 6), N]] })] };
    } },
    "netles": { ae: "tam", kur: function (c) {
      var b = ondalik(10 * c.olcek);
      return { katmanAnahtarlari: [opaklikKeyleri([[0, 0], [0.6, 1]], c)],
        animatorler: [animator("Suflo netleş", "karakter", { bulaniklik: [b, b] }, kartSecici(),
          { bulaniklik: kartKeyleri([[0, b], [1, 0]], c, function (v) { return [v, v]; }) })] };
    } },
    "yandan-kay": { ae: "tam", kutuIzler: true, kur: function (c) {
      var d = Math.round(c.w * 0.08);
      return { katmanAnahtarlari: [{ ozellik: "konum", yumusatma: 50, anahtarlar: konumKeyleri([[0, -d], [0.35, -Math.round(d * 0.3)], [1, 0]], c, 0) },
        opaklikKeyleri([[0, 0], [0.5, 1]], c)] };
    } },
    "aralik-acil": { ae: "tam", kur: function (c) {
      // Harf aralığı (piksel, \fsp) → AE Tracking (1/1000 em)
      var d = sc(18, c.olcek), fs = Math.max(1, c.fs);
      function trk(px) { return Math.round(px / fs * 1000); }
      return { katmanAnahtarlari: [opaklikKeyleri([[0, 0], [0.5, 1]], c)],
        animatorler: [animator("Suflo aralık", "karakter", { izleme: trk(d) }, kartSecici(),
          { izleme: kartKeyleri([[0, d], [0.4, Math.round(d * 0.28)], [1, 0]], c, trk) })] };
    } },
    "olcek-darbe": { ae: "tam", kur: function (c) {
      var s = etkinSecim(c);
      return { gruplama: "kelime", animatorler: [animator("Suflo ölçek darbesi", "kelime", { olcek: [122, 122, 100] },
        { birim: "indeks", sekil: "kare", baslangicAnahtarlari: s.baslangicAnahtarlari, sonAnahtarlari: s.sonAnahtarlari, tut: ["baslangic", "son"],
          miktarAnahtarlari: darbeMiktari(c, [[0, 0], [0.45, 100], [1, 0]]) })] };
    } },
    "sallanma": { ae: "tam", kur: function (c) {
      // \frz pozitif saat yönünün tersi; AE'de pozitif saat yönü: değer −5°
      var s = etkinSecim(c);
      return { gruplama: "kelime", animatorler: [animator("Suflo sallanma", "kelime", { donme: -5 },
        { birim: "indeks", sekil: "kare", baslangicAnahtarlari: s.baslangicAnahtarlari, sonAnahtarlari: s.sonAnahtarlari, tut: ["baslangic", "son"],
          miktarAnahtarlari: darbeMiktari(c, [[0, 0], [0.125, 100], [0.375, -100], [0.625, 100], [0.875, -100], [1, 0]]) })] };
    } },
    "renk-gecis": { ae: "tam", kur: function (c) {
      var r = renkKaymasi(c, false);
      r.birim = "indeks"; r.sekil = "kare";
      return { animatorler: [animator("Suflo renk geçişi", "kelime", { dolguRengi: c.vurgu }, r)] };
    } },
    "karaoke-birikimli": { ae: "tam", kur: function (c) {
      var r = renkKaymasi(c, true);
      r.birim = "indeks"; r.sekil = "kare";
      return { animatorler: [animator("Suflo biriken vurgu", "kelime", { dolguRengi: c.vurgu }, r)] };
    } },
    "karaoke-dolgu": { ae: "yakin", kur: function (c) {
      // Karakter dizini: Başlangıç kelimenin ilk harfine atlar (Hold), Son söylenişin %90'ında son harfine akar
      var ks = karakterSayilari(c), bs = [], sn = [];
      adimlar(c).forEach(function (s, i) {
        var L = harfSayisi(c.kelimeler[i]);
        anahtarEkle(bs, s[0], ks.taban[i]);
        anahtarEkle(sn, s[0], ks.taban[i]);
        anahtarEkle(sn, s[0] + Math.max(0, (s[1] - s[0]) * DOLGU_ORAN), ks.taban[i] + L);
      });
      return { animatorler: [animator("Suflo karaoke dolgu", "karakter", { dolguRengi: c.vurgu },
        { birim: "indeks", sekil: "kare", baslangicAnahtarlari: bs, sonAnahtarlari: sn, tut: ["baslangic"] })] };
    } },
    "iki-ton": { ae: "yakin", kur: function (c) {
      var cift = etkinSecim(c, function (i) { return i % 2 === 0; }), tek = etkinSecim(c, function (i) { return i % 2 === 1; });
      return { ikiTon: true, animatorler: [
        animator("Suflo iki ton 1", "kelime", { dolguRengi: c.vurgu }, { birim: "indeks", sekil: "kare", baslangicAnahtarlari: cift.baslangicAnahtarlari,
          sonAnahtarlari: cift.sonAnahtarlari, tut: true }),
        animator("Suflo iki ton 2", "kelime", { dolguRengi: c.vurgu2 }, { birim: "indeks", sekil: "kare", baslangicAnahtarlari: tek.baslangicAnahtarlari,
          sonAnahtarlari: tek.sonAnahtarlari, tut: true })] };
    } },
    "buyuyen-vurgu": { ae: "yakin", kur: function (c) {
      // *Anahtar* kelimeler (yoksa harfçe en uzun kelime): durağan %112; söylendiğinde 0 → %126 → %112 (ikinci animatör)
      var anahtar = [];
      c.anahtar.forEach(function (v, i) { if (v && i < c.kelimeler.length) anahtar.push(i); });
      if (!anahtar.length) {
        // Önizlemeyle aynı seçim (stil motoru): hitap / dolgu sözcüğü ("arkadaşlar", "gerçekten") en uzun sayılmaz; hepsi öyleyse eski seçim
        var se = SE(), anlamsiz = se && se.anlamsizKelime ? se.anlamsizKelime : function () { return false; }, en = -1;
        c.kelimeler.forEach(function (w, i) { if (!anlamsiz(w) && (en < 0 || harfSayisi(w) > harfSayisi(c.kelimeler[en]))) en = i; });
        if (en < 0) {
          en = 0;
          c.kelimeler.forEach(function (w, i) { if (harfSayisi(w) > harfSayisi(c.kelimeler[en])) en = i; });
        }
        anahtar.push(en);
      }
      var p = kelimePenceresi(c), out = [];
      anahtar.forEach(function (i) {
        var a = kirp(p[i][0], c.bas, c.son), b = Math.max(a, kirp(p[i][1], c.bas, c.son)), m = [];
        anahtarEkle(m, c.bas, 100);
        anahtarEkle(m, a, 100);
        anahtarEkle(m, a + (b - a) * 0.6, -12.5);
        anahtarEkle(m, b, 0);
        out.push(animator("Suflo büyüyen", "kelime", { olcek: [BUYUYEN_OLCEK, BUYUYEN_OLCEK, 100] },
          { birim: "indeks", sekil: "kare", baslangic: i, son: i + 1 }));
        out.push(animator("Suflo büyüyen giriş", "kelime", { olcek: [0, 0, 100] },
          { birim: "indeks", sekil: "kare", baslangic: i, son: i + 1, miktarAnahtarlari: m }));
      });
      return { gruplama: "kelime", animatorler: out };
    } },
    "nefes": { ae: "tam", kur: function (c) {
      // Kart %100 ↔ %103, periyot kartı tam sayıda nefese bölecek kadar esner (en az 0,7 sn); son 0,15 sn durağan
      var sure = c.son - c.bas - 0.15, adet = sure >= c.D * 0.6 && sure >= 0.7 ? Math.max(1, Math.round(sure / c.D)) : 0;
      while (adet > 1 && sure / adet < 0.7) adet--;
      if (!adet) return {};
      var P = sure / adet, k = [];
      for (var j = 0; j < adet; j++) { anahtarEkle(k, c.bas + j * P, [100, 100]); anahtarEkle(k, c.bas + (j + 0.5) * P, [103, 103]); }
      anahtarEkle(k, c.bas + adet * P, [100, 100]);
      return { katmanAnahtarlari: [{ ozellik: "olcek", anahtarlar: k }] };
    } },
    "donerek": { ae: "tam", kur: function (c) {
      return { katmanAnahtarlari: [
        { ozellik: "donme", anahtarlar: kartKeyleri([[0, 12], [0.5, 2.5], [1, 0]], c, function (v) { return v; }) },
        { ozellik: "olcek", anahtarlar: kartKeyleri([[0, 85], [0.5, 98], [1, 100]], c, function (v) { return [v, v]; }) },
        opaklikKeyleri([[0, 0], [0.35, 1]], c)] };
    } },
    "kapak-cevir": { ae: "yakin", kur: function (c) {
      return { ucBoyut: true, katmanAnahtarlari: [
        { ozellik: "xDonme", anahtarlar: kartKeyleri([[0, 70], [0.5, 12], [1, 0]], c, function (v) { return v; }) },
        opaklikKeyleri([[0, 0], [0.4, 1]], c)] };
    } },
    "perde": { ae: "yakin", kur: function (c) {
      var T = Math.max(SEKME, Math.min(c.D, c.son - c.bas)), pay = Math.round(c.kontur + c.fs * 0.3);
      return { maske: { ad: "Suflo perde", ifade: perdeIfadesi(c.bas, c.bas + 0.6 * T, c.bas + T, pay) },
        katmanAnahtarlari: [{ ozellik: "konum", anahtarlar: konumKeyleri([[0, sc(14, c.olcek)], [0.6, sc(3, c.olcek)], [1, 0]], c, 1) }] };
    } },
    /*
     * AutoCaptions koleksiyonu (stil motorundaki eğrilerle aynı; yazarın izniyle). Kayışlar katman konumu + opaklık,
     * bulanıklık "Suflo …" metin animatörünün Bulanıklığı (netles gibi), esnet / yakınlaş katman ölçeği.
     */
    "yumusak-kay": { ae: "tam", kutuIzler: true, kur: function (c) { return acKayis(c, [[0, 0.5], [0.3, 1]]); } },
    "bulanik-kay": { ae: "tam", kutuIzler: true, kur: function (c) {
      return acBulanik(acKayis(c, [[0, 0], [0.18, 1]]), "Suflo bulanık kayış", [[0, ondalik(11 * c.olcek)], [0.25, 0]], c);
    } },
    "titrek-kay": { ae: "tam", kutuIzler: true, kur: function (c) { return acKayis(c, [[0, 0], [0.12, 1], [0.24, 0.35], [0.4, 1]]); } },
    "isilti-kay": { ae: "yakin", kutuIzler: true, kur: function (c) {
      return acBulanik(acKayis(c, [[0, 0.6], [0.2, 1]]), "Suflo ışıltılı kayış", [[0, ondalik(8 * c.olcek)], [1, 0]], c);
    } },
    "kirpis": { ae: "tam", kur: function (c) { return { katmanAnahtarlari: [opaklikKeyleri([[0, 0], [0.25, 1], [0.5, 0.3], [1, 1]], c)] }; } },
    "bulanik-kirpis": { ae: "tam", kur: function (c) {
      return acBulanik({ katmanAnahtarlari: [opaklikKeyleri([[0, 0], [0.25, 1], [0.5, 0.3], [1, 1]], c)] }, "Suflo bulanık kırpış",
        [[0, ondalik(10 * c.olcek)], [0.5, ondalik(3 * c.olcek)], [1, 0]], c);
    } },
    "hiz-bulanik": { ae: "yakin", kutuIzler: true, kur: function (c) {
      var d = Math.round(c.w * 0.06);
      return acBulanik({ katmanAnahtarlari: [{ ozellik: "konum", anahtarlar: konumKeyleri([[0, -d], [1, 0]], c, 0) }, opaklikKeyleri([[0, 0], [0.3, 1]], c)] },
        "Suflo hız bulanıklığı", [[0, ondalik(14 * c.olcek)], [1, 0]], c);
    } },
    "puruzlu": { ae: "yakin", kur: function (c) {
      return acBulanik({ katmanAnahtarlari: [{ ozellik: "olcek", anahtarlar: kartKeyleri([[0, 104], [1, 100]], c, function (v) { return [v, v]; }) },
        opaklikKeyleri([[0, 0], [0.23, 1]], c)] }, "Suflo pürüzlü giriş", [[0, ondalik(9 * c.olcek)], [0.62, 0]], c);
    } },
    "esnet": { ae: "tam", kur: function (c) {
      return { katmanAnahtarlari: [{ ozellik: "olcek", anahtarlar: kartKeyleri([[0, 130], [0.6, 97], [1, 100]], c, function (v) { return [v, 100]; }) },
        opaklikKeyleri([[0, 0], [0.3, 1]], c)] };
    } },
    "yakinlas": { ae: "tam", kur: function (c) {
      return { katmanAnahtarlari: [{ ozellik: "olcek", anahtarlar: kartKeyleri([[0, 140], [1, 100]], c, function (v) { return [v, v]; }) },
        opaklikKeyleri([[0, 0], [0.35, 1]], c)] };
    } },
    "sagdan-kay": { ae: "tam", kutuIzler: true, kur: function (c) {
      var d = Math.round(c.w * 0.08);
      return { katmanAnahtarlari: [{ ozellik: "konum", yumusatma: 50, anahtarlar: konumKeyleri([[0, d], [0.35, Math.round(d * 0.3)], [1, 0]], c, 0) },
        opaklikKeyleri([[0, 0], [0.5, 1]], c)] };
    } },
    "kelime-belir": { ae: "tam", kur: function (c) { return { animatorler: [belirme("Suflo kelime kelime", kelimePenceresi(c), c)] }; } }
  };
  // AutoCaptions kayışı: kart aşağıdan (1080 tabanında 60 px) yavaşlayarak; opaklık eğrisi kayışa göre
  function acKayis(c, opak) {
    var d = sc(60, c.olcek);
    return { katmanAnahtarlari: [{ ozellik: "konum", yumusatma: 50, anahtarlar: konumKeyleri([[0, d], [0.35, Math.round(d * 0.3)], [1, 0]], c, 1) },
      opaklikKeyleri(opak, c)] };
  }
  // Plana kartın tamamına bulanıklık animatörü ekler (netles ile aynı yapı)
  function acBulanik(p, ad, egri, c) {
    p.animatorler = (p.animatorler || []).concat([animator(ad, "karakter", { bulaniklik: [egri[0][1], egri[0][1]] }, kartSecici(),
      { bulaniklik: kartKeyleri(egri, c, function (v) { return [v, v]; }) })]);
    return p;
  }
  /*
   * Etkin kelime klasik kuraldaki gibi (kelime vurgusu açıkken) vurgu renginde kalır: önizlemede metin()'in varsayılan
   * rengini alan bütün türler (kelime / harf girişleri, kart, darbe, büyüyen, nefes). Renk / dolgu türlerinde (renk-gecis,
   * karaoke-birikimli, karaoke-dolgu, iki-ton) etkin kelimenin rengi animasyonun kendisidir: klasik etkin kelime yok.
   */
  ["kelime-pop", "yukari-suzul", "dalga", "zipla-gel", "dusus", "daktilo", "harf-belir", "netles", "yandan-kay", "aralik-acil",
    "olcek-darbe", "sallanma", "buyuyen-vurgu", "nefes", "donerek", "kapak-cevir", "perde",
    "yumusak-kay", "bulanik-kay", "titrek-kay", "isilti-kay", "kirpis", "bulanik-kirpis", "hiz-bulanik", "puruzlu", "esnet", "yakinlas",
    "sagdan-kay", "kelime-belir"].forEach(function (id) {
    ANIM_AE[id].etkinRenk = true;
  });

  function aeDestegi(id) { return typeof id === "string" && own(ANIM_AE, id) ? ANIM_AE[id].ae : "yok"; }

  function sayiYaz(v) { return String(yuvarla(Number(v) || 0, 4)); }
  // Statik ölçü anı: katmanın son karesi (hareketler oturmuş; kutu ve perde yazının durağan ölçüsünü alır)
  var IFADE_T = "var T = Math.max(%L.inPoint, %L.outPoint - thisComp.frameDuration);\n";
  /*
   * Perde: metnin durağan kutusunu (sourceRectAtTime) alttan yukarı açan maske yolu. t0 → t1 %85, t1 → t2 %100 açılır;
   * pay kontur ve Türkçe şapka / çengel için. createPath AE 15+ (manifestin alt sınırı 17).
   */
  function perdeIfadesi(t0, t1, t2, pay) {
    return "// Suflo perde\n" + IFADE_T.replace(/%L\./g, "") +
      "var r = sourceRectAtTime(T, false), p = " + sayiYaz(pay) + ";\n" +
      "var f = time <= " + sayiYaz(t1) + " ? linear(time, " + sayiYaz(t0) + ", " + sayiYaz(t1) + ", 0, 0.85) : linear(time, " + sayiYaz(t1) + ", " + sayiYaz(t2) + ", 0.85, 1);\n" +
      "var l = r.left - p, s = r.left + r.width + p, b = r.top + r.height + p, u = b - (r.height + 2 * p) * f;\n" +
      "createPath([[l, u], [s, u], [s, b], [l, b]], [], [], true)";
  }
  /*
   * Arka plan kutusu (Altyazı Efektleri "kutu"): metin katmanına bağlı (parent) şekil katmanı. Kutu metnin durağan
   * ölçüsünü alır (stil motorunun kuralı: kutu ölçeklenmez / solmaz / dönmez; yalnız yandan kayışta kartla kayar):
   * konum ifadesi yazının durağan ortası (izle: o anki), ölçek ve dönme üst katmanınkini geri alır. Yatay pay
   * kompozisyonun piksel en-boyuna bölünür (kare olmayan piksel). Hepsi ifade: yazı sonradan değişse de kutu uyar.
   */
  function kutuPlani(n, fs, olcek, izle) {
    var px = sc(20, olcek), py = Math.max(1, Math.round(fs * 0.1));
    var t = IFADE_T.replace(/%L\./g, "parent.");
    return { renk: rgb01(n.kutuRenk), opak: n.kutuOpak, payX: px, payY: py, izle: !!izle, ifade: {
      konum: "// Suflo kutu\n" + t + "var r = parent.sourceRectAtTime(T, false);\n" +
        "parent.fromComp(parent.toComp([r.left + r.width / 2, r.top + r.height / 2], " + (izle ? "time" : "T") + "))",
      olcek: "var s = parent.transform.scale.value, o = [];\n" +
        "for (var i = 0; i < value.length; i++) { var v = i < s.length ? s[i] : 100; o.push(Math.abs(v) > 0.001 ? 10000 / v : 100); }\no",
      donme: "-parent.transform.rotation",
      boyut: t + "var r = parent.sourceRectAtTime(T, false);\n[r.width + 2 * " + px + " / thisComp.pixelAspect, r.height + 2 * " + py + "]"
    } };
  }

  // Altyazı Efektleri (stilli) kartları: önizlemenin kartları (stil motoru) + görünüm
  function stilliKartlar(cues, ayar, kad, o, uyarilar) {
    var ae = AE(), cmj = CMJ();
    if (!ae || !cmj) throw new Error("Altyazı Efektleri modeli yüklenemedi.");
    /*
     * Yazı animasyonu (animasyon motoru v2): AE karşılığı varsa (aeDestegi "tam" / "yakin") giriş ve vurgu animasyonunun
     * yerini metin animatörleri alır; yoksa en yakın klasik giriş / vurgu çifti (uyarıyla). Kartlar, konum ve renkler
     * her durumda animasyonlu ayardan (önizlemeyle aynı).
     */
    var secili = ae.animasyonu ? ae.animasyonu(ayar) : null;
    var destek = secili ? aeDestegi(secili.id) : "yok";
    var yerel = !!secili && destek !== "yok";
    var n = yerel ? ae.normalize(ayar) : (ae.klasikAyar ? ae.klasikAyar(ayar) : ae.normalize(ayar));
    if (secili && !yerel) uyarilar.push(UYARI.animYok.replace("{}", secili.ad));
    if (yerel && destek === "yakin") uyarilar.push(UYARI.animYakin.replace("{}", secili.ad).replace("{}", NOTLAR[secili.id] || ""));
    var renkler = yerel && ae.gecerliRenkler ? ae.gecerliRenkler(n) : { vurguRenk2: n.vurguRenk };
    var cueKind = o && o.cueKind ? o.cueKind : "lines";
    var guvenli = !!(o && o.guvenli);
    var olcek = Math.min(kad.w, kad.h) / 1080;
    var dil = o && typeof o.dil === "string" ? o.dil : undefined;
    var liste = cmj.satirlar(cues || [], n, { kadraj: { w: kad.w, h: kad.h, guvenli: guvenli }, cueKind: cueKind, dil: dil });
    var p = ae.konumNoktasi(n, { w: kad.w, h: kad.h, guvenli: guvenli, ornek: { cues: cues || [], cueKind: cueKind, dil: dil } });
    var konum = [yuvarla(p.x / 100 * kad.w, 1), yuvarla(p.y / 100 * kad.h, 1)];
    var font = o && typeof o.font === "string" && o.font ? o.font : ae.sablonFontu(n);
    var vurguRenk = rgb01(n.vurguRenk), vurguRenk2 = rgb01(renkler.vurguRenk2 || n.vurguRenk);
    /*
     * Kontur: libass'in konturu yazının DIŞINDA kontur kalınlığı kadardır; AE'nin konturu çizginin ortasındadır ve
     * "dolgu konturun üstünde" ile dışta yarısı görünür: genişlik 2 × kontur.
     */
    var kontur = n.kontur > 0 ? yuvarla(2 * n.kontur * olcek, 1) : 0;
    var golge = n.golge ? { renk: rgb01(n.golge.renk), opak: n.golge.opak, aci: 135, mesafe: yuvarla(n.golge.mesafe * olcek, 1), yumusak: yuvarla(n.golge.yumusak * olcek, 1) } : null;
    if (!yerel && (n.aktif === "titre" || n.aktif === "glitch")) uyarilar.push(UYARI.aktif);
    if (!yerel && n.aktif === "zipla") uyarilar.push(UYARI.zipla);
    var tanim = yerel ? ANIM_AE[secili.id] : null;
    var etkin = yerel ? (tanim.etkinRenk && n.vurgu) : (n.vurgu || n.aktif === "zipla");
    // Kutu kartla kayar: klasik Yukarı / Aşağı kay girişi ve Yandan kay (stil motorunun kutu kuralı)
    var kutuIzler = yerel ? !!tanim.kutuIzler : (n.giris === "yukari" || n.giris === "asagi");
    return liste.map(function (s) {
      var metin = aeMetni(s.text);
      var vurgulu = [];
      (s.vurgu || []).forEach(function (v, i) { if (v) vurgulu.push({ i0: i, i1: i + 1, renk: vurguRenk }); });
      var boyut = Math.max(EN_KUCUK_PUNTO, Math.round(s.fs > 0 ? s.fs : n.boyut * olcek));
      return { bas: s.start, son: s.end, metin: metin, konum: konum.slice(), capa: [0.5, 0.5],
        yazi: { font: font, yedekFont: n.kalin === false ? "ArialMT" : "Arial-BoldMT", boyut: boyut, renk: rgb01(n.renk),
          kontur: kontur, konturRenk: rgb01(n.konturRenk), italik: n.italik === true },
        golge: golge, _giris: yerel ? "yok" : n.giris, _olcek: olcek, _kelimeler: s.kelimeler,
        _anim: yerel ? { id: secili.id, D: (animSuresi(secili.id) || 300) / 1000, vurgu: s.vurgu || [], vurgu1: vurguRenk, vurgu2: vurguRenk2, kontur: kontur } : null,
        _kutu: n.kutu ? kutuPlani(n, boyut, olcek, kutuIzler) : null,
        aktif: etkin ? { renk: n.vurgu ? vurguRenk : null, olcek: !yerel && n.aktif === "zipla" ? ZIPLA_OLCEK : null, anahtarlar: [] } : null,
        sabitVurgu: vurgulu, kelimeSayisi: s.kelimeler.length };
    });
  }

  // Katalogdaki Dengeli süre (ms); katalog yüklenemezse null
  function animSuresi(id) {
    var ya = (typeof window !== "undefined" && window.SufloYaziAnimasyon) || null;
    if (!ya && typeof require === "function") { try { ya = require("./yazi-animasyonlari.js"); } catch (e) { ya = null; } }
    var k = ya && ya.bul ? ya.bul(id) : null;
    return k && k.sure > 0 ? Number(k.sure) : null;
  }

  // Kartın yazı animasyonu planı (zamanla()'dan sonra: kartın son bas / son'u ile)
  function animasyonKatmani(k, kad) {
    var A = k._anim, kelimeler = k.metin.split(/[ \r]+/);
    var c = { bas: k.bas, son: k.son, D: A.D, kel: k._kelimeler || [], kelimeler: kelimeler, anahtar: A.vurgu, fs: k.yazi.boyut,
      olcek: k._olcek, w: kad.w, h: kad.h, konum: k.konum, kontur: A.kontur, vurgu: A.vurgu1, vurgu2: A.vurgu2 };
    // Kelime pencereleri kelime sayısı kadar (cmj'nin kelimeleri metnin kelimeleriyle aynı; değilse kısa olan)
    if (c.kel.length > kelimeler.length) c.kel = c.kel.slice(0, kelimeler.length);
    if (c.kelimeler.length > c.kel.length) c.kelimeler = c.kelimeler.slice(0, c.kel.length);
    return ANIM_AE[A.id].kur(c) || {};
  }

  function filigranKatmani(kad, son) {
    var kisa = Math.min(kad.w, kad.h);
    var pay = Math.round(kisa * 0.03);
    return { tur: "filigran", ad: "Suflo deneme filigranı", metin: FILIGRAN.metin, bas: 0, son: yuvarla(son, 6),
      konum: [kad.w - pay, pay], capa: [1, 0], opaklik: FILIGRAN.opak,
      yazi: { font: FILIGRAN.font, boyut: Math.max(EN_KUCUK_PUNTO, Math.round(kisa * FILIGRAN.oran)), renk: [1, 1, 1], kontur: 0, konturRenk: [0, 0, 0], italik: false } };
  }

  function katmanAdi(sira, metin) {
    var no = String(sira);
    while (no.length < 3) no = "0" + no;
    var ozet = String(metin).replace(/\r/g, " ");
    if (ozet.length > 32) {
      var kes = 31;
      if (/[\ud800-\udbff]/.test(ozet.charAt(kes - 1))) kes--;   // vekil çiftini bölme (emoji katman adında yarım kalmasın)
      ozet = ozet.slice(0, kes) + "…";
    }
    return "Suflo " + no + " · " + ozet;
  }

  /*
   * plan(cues, o) — cues: panelin altyazı satırları ({ start, end, text, words? }; kompozisyon saniyesi; stilli kipte
   * *vurgu* işaretli). o: { mod: "duz" | "stilli", ayar (Altyazı Efektleri ayarı), cueKind, guvenli, font (PostScript adı,
   * verilmezse ayarın), w, h, fps, sure (kompozisyon), filigran (panel artık vermez: AE'de deneme hakkı yok; host desteği duruyor), isId,
   * dil (altyazının dili: satır / kart kırılımı Türkçe-duyarlı; verilmezse tr + en) }.
   * Aynı girdi aynı planı verir (zaman damgası / rastgelelik yok; iş kimliği çağırandan).
   * Döner: { surum, isaret, isId, mod, comp, katmanlar: [...], filigran: null | {...}, uyarilar: [...] }
   */
  function plan(cues, o) {
    o = o || {};
    var kad = kadrajOku(o);
    var mod = o.mod === "stilli" ? "stilli" : "duz";
    var uyarilar = [];
    var kartlar = mod === "stilli" ? stilliKartlar(cues, o.ayar, kad, o, uyarilar) : duzKartlar(cues, kad, !!o.guvenli, typeof o.dil === "string" ? o.dil : undefined);
    kartlar = zamanla(kartlar, kad);
    var katmanlar = kartlar.map(function (k, i) {
      var g = k._giris ? girisAnahtarlari(k._giris, k.bas, k.son, k.konum, k._olcek) : [];
      if (k.aktif) k.aktif.anahtarlar = kelimeAnahtarlari(k._kelimeler, k.bas, k.son);
      var a = k._anim ? animasyonKatmani(k, kad) : {};
      // İki ton: *anahtar* kelimeler de sırayla vurgu / ikinci vurgu rengi
      if (a.ikiTon) k.sabitVurgu.forEach(function (v) { if (v.i0 % 2 === 1) v.renk = k._anim.vurgu2; });
      return { tur: "satir", ad: katmanAdi(i + 1, k.metin), metin: k.metin, bas: k.bas, son: k.son, konum: k.konum, capa: k.capa,
        yazi: k.yazi, golge: k.golge, giris: g, aktif: k.aktif, sabitVurgu: k.sabitVurgu, kelimeSayisi: k.kelimeSayisi,
        animasyon: k._anim ? k._anim.id : "", animatorler: a.animatorler || [], katmanAnahtarlari: a.katmanAnahtarlari || [],
        gruplama: a.gruplama || (k.aktif && k.aktif.olcek ? "kelime" : null), ucBoyut: a.ucBoyut === true, maske: a.maske || null,
        kutu: k._kutu || null };
    });
    var sonuncu = katmanlar.length ? katmanlar[katmanlar.length - 1].son : 0;
    var filigran = o.filigran === true && katmanlar.length ? filigranKatmani(kad, kad.sure > 0 ? kad.sure : sonuncu) : null;
    return { surum: SURUM, isaret: ISARET, etiket: ETIKET, isId: String(o.isId || "suflo"), mod: mod,
      comp: { w: kad.w, h: kad.h, fps: kad.fps, sure: kad.sure }, katmanlar: katmanlar, filigran: filigran, uyarilar: uyarilar };
  }

  // Katmanın yorumu (host-ae.jsx aynısını yazar; kaldırma bu önekle tanır). Ayraç şart: yorumu yalnız "Suflo altyazi" ile
  // BAŞLAYAN kullanıcı katmanı ("Suflo altyazisi için not") Suflo'nun sayılmaz
  function yorum(isId, tur) { return ISARET + " | " + String(isId || "") + " | " + String(tur || "satir"); }
  function suflonunMu(yorumMetni) { return String(yorumMetni || "").indexOf(ISARET + " | ") === 0; }

  return {
    SURUM: SURUM,
    ISARET: ISARET,
    ETIKET: ETIKET,
    MIN_SURUM: MIN_SURUM,
    DUZ: JSON.parse(JSON.stringify(DUZ)),
    GIRIS_SN: GIRIS_SN,
    FILIGRAN: JSON.parse(JSON.stringify(FILIGRAN)),
    UYARI: JSON.parse(JSON.stringify(UYARI)),
    HATA: JSON.parse(JSON.stringify(HATA)),
    uygulamaKodu: uygulamaKodu,
    katmanKaynagi: katmanKaynagi,
    klipSekli: klipSekli,
    baglamSekli: baglamSekli,
    hostCagrisi: hostCagrisi,
    aeMetni: aeMetni,
    kelimeAnahtarlari: kelimeAnahtarlari,
    girisAnahtarlari: girisAnahtarlari,
    aeDestegi: aeDestegi,
    NOTLAR: JSON.parse(JSON.stringify(NOTLAR)),
    plan: plan,
    yorum: yorum,
    suflonunMu: suflonunMu
  };
});
