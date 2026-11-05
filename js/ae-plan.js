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
 *                             etkin kelime animatörünün kelime dizini anahtarları, deneme filigranı, uyarılar)
 *
 * Kipler: "duz" (ücretsiz; Premiere'in ücretsiz caption izinin karşılığı: düz beyaz yazı, siyah kontur, alt güvenli
 * bölge) ve "stilli" (Altyazı Efektleri: kartlar önizlemeyle AYNI kurulur — js/caption-mogrt-json.js satirlar →
 * stil motorunun efektSatirlari; konum js/altyazi-efekt.js konumNoktasi; Pro / deneme kapısı panelde, "overlay").
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
    function () { return yukle("SufloStyleEngine", "./style-engine.js"); });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAePlan = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (aeBul, cmjBul, seBul) {
  "use strict";

  var AE_ = null, CMJ_ = null, SE_ = null;
  function AE() { if (!AE_ && aeBul) AE_ = aeBul(); return AE_; }
  function CMJ() { if (!CMJ_ && cmjBul) CMJ_ = cmjBul(); return CMJ_; }
  function SE() { if (!SE_ && seBul) SE_ = seBul(); return SE_; }

  var SURUM = 1;
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
  var EN_KUCUK_PUNTO = 12;
  // Altyazı Efektleri girişi: stil motorunun T'si (300 ms, Dengeli şiddet) ve kayma payı scaled(50)
  var GIRIS_SN = 0.3;
  var KAYMA = 50;
  var ZIPLA_OLCEK = 112;
  // Deneme filigranı (js/filigran.js'in karşılığı): sağ üstte "suflo.app", kısa kenarın ~%2,6'sı, ~%60 opak
  var FILIGRAN = { metin: "suflo.app", oran: 0.026, opak: 60, font: "ArialMT" };

  var UYARI = {
    kutu: "Arka plan kutusu After Effects çıktısında henüz yok; yazı kutusuz eklendi.",
    aktif: "Titre ve Glitch kelime hareketleri After Effects çıktısında henüz yok; etkin kelime yalnız vurgu rengini alır.",
    zipla: "Zıpla kelime hareketi After Effects'te etkin kelimeyi büyüterek gösterilir."
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

  // Ücretsiz düz kip: her altyazı satırı bir katman, alt güvenli bölgede ortalı, uzun satırda punto küçülür
  function duzKartlar(cues, kad, guvenli) {
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
    var out = [];
    (cues || []).forEach(function (c) {
      // Düz kipte *vurgu* işareti yazılmaz (panel zaten ayıklar; burada da ayıklanır)
      var metin = aeMetni(String(c && c.text != null ? c.text : "").replace(/\*([^*\s][^*]*?)\*/g, "$1"));
      var bas = sayi(c && c.start), son = sayi(c && c.end);
      if (!metin || bas === null || son === null || !(son > bas)) return;
      var enUzun = 1;
      metin.split("\r").forEach(function (s) { enUzun = Math.max(enUzun, s.length); });
      var fs = Math.max(EN_KUCUK_PUNTO, Math.min(temel, Math.floor(genislik / (enUzun * DUZ_GENISLIK))));
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

  // Altyazı Efektleri (stilli) kartları: önizlemenin kartları (stil motoru) + görünüm
  function stilliKartlar(cues, ayar, kad, o, uyarilar) {
    var ae = AE(), cmj = CMJ();
    if (!ae || !cmj) throw new Error("Altyazı Efektleri modeli yüklenemedi.");
    var n = ae.normalize(ayar);
    var cueKind = o && o.cueKind ? o.cueKind : "lines";
    var guvenli = !!(o && o.guvenli);
    var olcek = Math.min(kad.w, kad.h) / 1080;
    var liste = cmj.satirlar(cues || [], n, { kadraj: { w: kad.w, h: kad.h, guvenli: guvenli }, cueKind: cueKind });
    var p = ae.konumNoktasi(n, { w: kad.w, h: kad.h, guvenli: guvenli, ornek: { cues: cues || [], cueKind: cueKind } });
    var konum = [yuvarla(p.x / 100 * kad.w, 1), yuvarla(p.y / 100 * kad.h, 1)];
    var font = o && typeof o.font === "string" && o.font ? o.font : ae.sablonFontu(n);
    var vurguRenk = rgb01(n.vurguRenk);
    /*
     * Kontur: libass'in konturu yazının DIŞINDA kontur kalınlığı kadardır; AE'nin konturu çizginin ortasındadır ve
     * "dolgu konturun üstünde" ile dışta yarısı görünür: genişlik 2 × kontur.
     */
    var kontur = n.kontur > 0 ? yuvarla(2 * n.kontur * olcek, 1) : 0;
    var golge = n.golge ? { renk: rgb01(n.golge.renk), opak: n.golge.opak, aci: 135, mesafe: yuvarla(n.golge.mesafe * olcek, 1), yumusak: yuvarla(n.golge.yumusak * olcek, 1) } : null;
    if (n.kutu) uyarilar.push(UYARI.kutu);
    if (n.aktif === "titre" || n.aktif === "glitch") uyarilar.push(UYARI.aktif);
    if (n.aktif === "zipla") uyarilar.push(UYARI.zipla);
    var etkin = n.vurgu || n.aktif === "zipla";
    return liste.map(function (s) {
      var metin = aeMetni(s.text);
      var vurgulu = [];
      (s.vurgu || []).forEach(function (v, i) { if (v) vurgulu.push({ i0: i, i1: i + 1, renk: vurguRenk }); });
      return { bas: s.start, son: s.end, metin: metin, konum: konum.slice(), capa: [0.5, 0.5],
        yazi: { font: font, boyut: Math.max(EN_KUCUK_PUNTO, Math.round(s.fs > 0 ? s.fs : n.boyut * olcek)), renk: rgb01(n.renk),
          kontur: kontur, konturRenk: rgb01(n.konturRenk), italik: n.italik === true },
        golge: golge, _giris: n.giris, _olcek: olcek, _kelimeler: s.kelimeler,
        aktif: etkin ? { renk: n.vurgu ? vurguRenk : null, olcek: n.aktif === "zipla" ? ZIPLA_OLCEK : null, anahtarlar: [] } : null,
        sabitVurgu: vurgulu, kelimeSayisi: s.kelimeler.length };
    });
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
    if (ozet.length > 32) ozet = ozet.slice(0, 31) + "…";
    return "Suflo " + no + " · " + ozet;
  }

  /*
   * plan(cues, o) — cues: panelin altyazı satırları ({ start, end, text, words? }; kompozisyon saniyesi; stilli kipte
   * *vurgu* işaretli). o: { mod: "duz" | "stilli", ayar (Altyazı Efektleri ayarı), cueKind, guvenli, font (PostScript adı,
   * verilmezse ayarın), w, h, fps, sure (kompozisyon), filigran (deneme), isId }.
   * Aynı girdi aynı planı verir (zaman damgası / rastgelelik yok; iş kimliği çağırandan).
   * Döner: { surum, isaret, isId, mod, comp, katmanlar: [...], filigran: null | {...}, uyarilar: [...] }
   */
  function plan(cues, o) {
    o = o || {};
    var kad = kadrajOku(o);
    var mod = o.mod === "stilli" ? "stilli" : "duz";
    var uyarilar = [];
    var kartlar = mod === "stilli" ? stilliKartlar(cues, o.ayar, kad, o, uyarilar) : duzKartlar(cues, kad, !!o.guvenli);
    kartlar = zamanla(kartlar, kad);
    var katmanlar = kartlar.map(function (k, i) {
      var g = k._giris ? girisAnahtarlari(k._giris, k.bas, k.son, k.konum, k._olcek) : [];
      if (k.aktif) k.aktif.anahtarlar = kelimeAnahtarlari(k._kelimeler, k.bas, k.son);
      return { tur: "satir", ad: katmanAdi(i + 1, k.metin), metin: k.metin, bas: k.bas, son: k.son, konum: k.konum, capa: k.capa,
        yazi: k.yazi, golge: k.golge, giris: g, aktif: k.aktif, sabitVurgu: k.sabitVurgu, kelimeSayisi: k.kelimeSayisi };
    });
    var sonuncu = katmanlar.length ? katmanlar[katmanlar.length - 1].son : 0;
    var filigran = o.filigran === true && katmanlar.length ? filigranKatmani(kad, kad.sure > 0 ? kad.sure : sonuncu) : null;
    return { surum: SURUM, isaret: ISARET, etiket: ETIKET, isId: String(o.isId || "suflo"), mod: mod,
      comp: { w: kad.w, h: kad.h, fps: kad.fps, sure: kad.sure }, katmanlar: katmanlar, filigran: filigran, uyarilar: uyarilar };
  }

  // Katmanın yorumu (host-ae.jsx aynısını yazar; kaldırma bu önekle tanır)
  function yorum(isId, tur) { return ISARET + " | " + String(isId || "") + " | " + String(tur || "satir"); }
  function suflonunMu(yorumMetni) { return String(yorumMetni || "").indexOf(ISARET) === 0; }

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
    plan: plan,
    yorum: yorum,
    suflonunMu: suflonunMu
  };
});
