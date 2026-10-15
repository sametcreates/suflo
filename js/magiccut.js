/*
 * Kesit — Kesim modülü
 * Seçili klip otomatik algılanır → "Duraksamaları bul" → görsel bar + liste →
 * varsayılan olarak kopya sekansta ripple uygular (orijinal hiç bozulmaz).
 *
 * 3.4 canlı eşik: ses BİR KEZ çözülür (K.runAkis → SufloSessizlik tepe zarfı, bellekte); Eşik /
 * Min. sessizlik / Tampon / Min. konuşma kaydırıcıları haritayı ~100 ms içinde yeniden çizer, ffmpeg
 * yeniden çalışmaz. Uygula'da silencedetect son ayarlarla bir kez koşar (eski akışla birebir); kesimler
 * önizlemeden farklı çıkarsa Uygula önce farkı gösterir, ikinci tık uygular. Kullanıcının kapattığı
 * bölgeler ayrı bir karar listesinde (kapatilanlar) tutulur. Çözümleme olmazsa eski silencedetect akışı
 * aynen çalışır.
 *
 * 3.4 kapsam ve korunan katmanlar (adım 7): #cut-scope (Seçili klip | In → Out | Sekans). Sekans kapsamlarında
 * "Dinlenecek ses" çiplerindeki katmanlar KS_exportAudio ile tek WAV'a karışır (ofsetiyle); zarf ve bul() bu
 * WAV'da koşar, aralıklar ofsetle sekans zamanına çevrilir (klip yerine sahte bir "klip": WAV, inPoint 0,
 * clipStart = ofset). WAV Uygula'dan sonra, kapsam / sekans / dinlenen ses değişince ve panel kapanırken silinir.
 * "Kesilmeyecek katmanlar" (her kapsamda; KS_getTrackLayout'tan, SufloSessizlik.korumaOner önerisiyle) Uygula'da
 * KS_applyCuts'a protect olarak gider; analiz edilen sekans expectSeqId ile denetlenir. Katmanlar panel açılırken
 * OKUNMAZ: kapsam düğmesi, Katmanlar bölümünü açmak, Yenile ya da Sessizlikleri bul okur (düzen düşmüşse Uygula da).
 * In → Out / Sekans aralığı panel bağlamından değil, katman okumasıyla aynı anda Premiere'den alınır (scope); seçimler
 * katman imzasına bağlıdır, sekans değişince (Kopya sekansta'nın kopyası dahil) düşmez.
 */
window.KCut = (function () {
  "use strict";

  var clip = null;
  var ranges = [];      // { start, end, keep, birlesik? } — sequence zamanı
  var adalar = [];      // Min. konuşma ile kesime katılan kısa konuşma adaları (sequence zamanı)
  /*
   * Kullanıcının kapattığı bölgeler (sequence zamanı, { start, end, keep:false }): türetilmiş `ranges`ten
   * AYRI. Yalnız çubuk / liste tıklaması yazar (S.kararYaz); her yeniden hesaplanan küme (kaydırıcı,
   * önbellek, Uygula doğrulaması) bununla eşlenir. Klip değişince ve Uygula'dan sonra boşalır.
   */
  var kapatilanlar = [];
  var target = "clone"; // clone | here
  var busy = false;
  /*
   * apply() sürerken (doğrulama + KS_applyCuts, 900 sn'ye dek): harita ve Uygula KİLİTLİ. busy yalnız ffmpeg
   * analizini / doğrulamasını kapsar; KS_applyCuts beklenirken kaydırıcı / Otomatik / kesim tıklaması
   * updateSummary'yle "Kesimleri uygula"yı yeniden açıyor, ikinci tık aynı sekans zamanlarını ikinci kez
   * kestiriyordu (ripple'dan sonra konuşma silerdi). Kilitliyken gelen kaydırıcı değişimi bekletilir (canliBekliyor),
   * kilit açılınca (Uygula başarısızsa) harita yeni ayarla kurulur.
   */
  var uygulaniyor = false;
  var canliBekliyor = false;
  // 3.4: tek çözümleme + canlı eşik
  var S = window.SufloSessizlik || null;
  var zarfOnbellek = S ? S.onbellekYap(4) : null;   // mediaPath|in|dur → tepe zarfı
  var zarf = null;          // geçerli klibin zarfı; null → eski (silencedetect) akış
  var hamSessizlik = null;  // eski akış: { liste, noise, minSil } silencedetect ham aralıkları
  var sdOnbellek = {};      // silencedetect sonucu: anahtar|eşik|min. sessizlik → ham aralıklar
  var sonAnahtar = "";
  /*
   * Ekrandaki analizin klibi + sekanstaki yeri (anahtar@clipStart). Kararlar (kapatilanlar) ve harita SEKANS zamanında:
   * aynı medya / in / süre başka konumdaysa (klip taşındı, aynı aralığın kopyası seçildi; onContext bunu bildirmez)
   * önceki kararlar yeni konumdaki başka bir kesime oturmasın. Zarf ve silencedetect önbellekleri klibe göredir
   * (sonAnahtar): konum değişince ffmpeg yeniden çalışmaz. Yeniden analiz edilmeden de eski konuma kesilmez: onPoll
   * taşınan / kırpılan klibin analizini bırakır, Uygula Premiere'e taze sorar (klipYeriniDenetle).
   */
  var sonKonum = "";
  var farkUyarisi = false;  // durum satırında "doğrulama kesimleri değiştirdi" uyarısı var (kaydırıcı silsin)
  // Otomatik'in durum satırı ("Otomatik eşik: …" / düşük SNR uyarısı) ve önerdiği eşik: Eşik elle değişince silinir
  var otoMesaj = null;      // { esik: "-45", metin }
  var canliZaman = null;
  var CANLI_MS = 100;
  // Süren ffmpeg analizinin iptal jetonu (K.iptalJetonu): "İptal" düğmesi süreç ağacını öldürür
  var iptalJetonu = null;
  // setBusy(true) anı: "İptal" "Sessizlikleri bul"un yerinde belirir; çift tıklamanın ikinci tıkı analizi iptal etmesin
  var iptalAcilis = 0;
  // setBusy(false) anı: "Sessizlikleri bul" "İptal"in yerinde yeniden belirir; İptal'e çift tıkın ikinci tıkı yeni analiz başlatmasın
  var baslatAcilis = 0;
  // 3.4 adım 7: kapsam ve korunan katmanlar
  var kapsam = "clip";      // clip | inout | entire (#cut-scope)
  var katman = null;        // KS_getTrackLayout({ klipler }) sonucu; null: henüz okunmadı
  var katmanAralik = null;  // katmanın okunduğu sekans aralığı
  var katmanCiftleri = [];  // S.bagliCiftler(katman): bağlı video–ses çiftleri (her çizimde yeniden aranmasın)
  var katmanOkunuyor = false;
  var secDinle = null;      // kullanıcının "Dinlenecek ses" seçimi ([i]); null: öneri
  var secKoru = null;       // kullanıcının "Kesilmeyecek katmanlar" seçimi ({ video, audio }); null: öneri
  /*
   * Seçimlerin bağlı olduğu katman imzası (katmanImzasi: katman sayısı + adlar). Başka sekansa geçince düzen (katman)
   * düşer ama seçimler ve imza KALIR: yeni sekansın düzeni aynı imzayı taşıyorsa (Kopya sekansta'nın açtığı kopya hep
   * taşır) seçimler sürer, taşımıyorsa öneriye döner. null: bu oturumda düzen hiç okunmadı.
   */
  var secImza = null;
  var sonKoruSayisi = 0;    // son okunan düzende korunan katman sayısı (düzen okunamazsa Uygula korumasız gitmesin)
  // Son okumanın kapsamı: { scope: "inout" | "entire" | "", aralik: hostKapsamAraligi sonucu | null, kap: host değerleri | null }
  var katmanKapsam = null;
  var geciciWav = "";       // sekans kapsamında KS_exportAudio'nun karışımı
  var analizSeqId = "";     // analizin yapıldığı sekans: KS_applyCuts expectSeqId
  var zorlaBosluk = false;  // "Boşluk bırakarak uygula" (korunan video katmanı ripple'da kaymasın)
  // 3.4 adım 8: Uygula'dan sonra "Altyazıyı yeni kurguya uyarla" satırı (js/kesim-altyazi.js; ücretsiz)
  var altyaziEylemi = null;
  // KS_applyCuts hiçbir parça silmedi / seçmedi (kesimler yalnız boş bölgelerde): hak düşmez
  var KESIM_YOK = {
    burada: "⚠ Hiçbir klip kesilmedi: kesimler yalnız boş bölgelere (ya da kilitli katmanlara) denk geldi, timeline değişmedi.",
    kopya: "⚠ Hiçbir klip kesilmedi: kesimler yalnız boş bölgelere (ya da kilitli katmanlara) denk geldi, açılan kopya sekans özgünüyle aynı."
  };
  /*
   * Seçili klip kapsamında analiz edilen klip Premiere'de analizden sonra taşındı / kırpıldı (aynı medya): kesimler ve
   * harita sekans zamanında (analizdeki clipStart), eski konumdadır. harita: yoklama fark etti (analiz bırakıldı);
   * uygula: Uygula'daki taze denetim fark etti (KS_applyCuts gönderilmedi); okunamadi: denetim Premiere'den okuyamadı.
   */
  var KLIP_DEGISTI = {
    harita: "Seçili klip analizden sonra değişti (taşındı, kırpıldı ya da aynı dosyanın başka klibi seçildi): öneriler eski konumdaydı. Sessizlikleri yeniden bul.",
    uygula: "✕ Seçili klip analizden sonra değişti (taşındı, kırpıldı ya da başka klip seçildi): kesimler eski konuma düşerdi, uygulanmadı. Sessizlikleri yeniden bul.",
    okunamadi: "✕ Klibin yeri Premiere'den okunamadı: kesimler uygulanmadı. Yeniden Kesimleri uygula."
  };
  var IPTAL_IPUCU = "ffmpeg analizini durdurur; önceki sonuç ekranda kalır";
  var IPTAL_KILITLI = "Premiere sesi dışa aktarıyor; bu adım yarıda kesilemez. Bitince İptal açılır.";
  // Uygula sonrası korunan katman uyarısı: kopyada özgün sekans sağlam; "Bu sekansta" geri alma tek adım değil
  var KORUNAN_UYARI = {
    degisti: {
      kopya: "⚠ Korunan bir katman değişti: Premiere bağlı klibi birlikte kesmiş olabilir. Özgün sekans değişmedi; kopyayı kontrol et, gerekirse kopyayı silip korumayı değiştirerek yeniden uygula.",
      burada: "⚠ Korunan bir katman değişti: Premiere bağlı klibi birlikte kesmiş olabilir. Kontrol et: tek Ctrl+Z (Mac: Cmd+Z) geri getirmez, her kesim ve silme ayrı adımdır; Geçmiş (History) panelinde kesimlerden önceki adıma dön."
    },
    eksik: {
      kopya: "⚠ Korunan katmanlardan bazıları sekansta bulunamadı, kesilmiş olabilir. Özgün sekans değişmedi; kopyayı kontrol et.",
      burada: "⚠ Korunan katmanlardan bazıları sekansta bulunamadı, kesilmiş olabilir. Kontrol et: tek Ctrl+Z (Mac: Cmd+Z) geri getirmez, her kesim ve silme ayrı adımdır; Geçmiş (History) panelinde kesimlerden önceki adıma dön."
    }
  };

  function el(id) { return document.getElementById(id); }

  function status(msg, cls) {
    var e = el("cut-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function fmt(sec) {
    // once onda birlige yuvarla, sonra bol: 59.97 -> "1:00.0", "0:60.0" degil
    var t = Math.round(sec * 10) / 10;
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }

  // Seçili kapsam analize hazır mı: klipte seçili klip, sekans kapsamlarında açık sekans
  function hazirMi(ctx) { return kapsam === "clip" ? !!ctx.sel : !!ctx.hasSeq; }
  function hazirDegilMetni() { return kapsam === "clip" ? "Timeline'da bir klip seç." : "Bir sekans aç."; }

  function refreshButton() {
    var ctx = KApp.ctx();
    // Uygula sürerken de meşgul: "Sessizlikleri bul" kapalı, "Uygulanıyor…" silinmez, Uygula yeniden açılmaz
    var mesgul = busy || uygulaniyor;
    el("cut-analyze").disabled = mesgul || !hazirMi(ctx);
    if (ctx.connected && !hazirMi(ctx) && !mesgul) status(hazirDegilMetni());
    else if (!mesgul) {
      /*
       * Uyarı/hata mesajına DOKUNMA: analyze'ın finally'si setBusy(false) →
       * buraya geliyor ve eski kod status("") ile hatayı daha kullanıcı
       * okuyamadan siliyordu — "tıklıyorum, hiçbir şey olmuyor" bunun sonucu.
       */
      var e = el("cut-status");
      if (!/warn|bad/.test(e.className)) status("");
    }
    // iş bitti: "Kesimleri uygula" meşgulken kapalıydı (updateSummary busy'ye bakar), yeniden aç
    if (!mesgul && clip && !el("cut-result").hidden) updateSummary();
  }

  /* ---------------- Analiz ---------------- */

  function parseSilence(stderr) {
    var out = [];
    var lines = stderr.split(/\r?\n/);
    var pending = null;
    for (var i = 0; i < lines.length; i++) {
      var mStart = lines[i].match(/silence_start:\s*(-?[\d.]+)/);
      if (mStart) { pending = parseFloat(mStart[1]); continue; }
      var mEnd = lines[i].match(/silence_end:\s*([\d.]+)/);
      if (mEnd && pending !== null) {
        out.push({ start: Math.max(0, pending), end: parseFloat(mEnd[1]) });
        pending = null;
      }
    }
    return out;
  }

  // Kaydırıcıların anlık değerleri (dur: klibin kaynak süresi)
  function ayarlar() {
    return {
      noise: el("cut-noise").value,
      esik: parseFloat(el("cut-noise").value),
      minSil: parseFloat(el("cut-minsil").value),
      pad: parseFloat(el("cut-pad").value),
      minKeep: el("cut-minkeep") ? parseFloat(el("cut-minkeep").value) || 0 : 0,
      dur: clip ? clip.outPoint - clip.inPoint : 0
    };
  }

  function kesimAyari(a) {
    return { win: S.PENCERE, esik: a.esik, minSessizlik: a.minSil, pay: a.pad, minKonusma: a.minKeep,
      minKesim: 0.25, kenar: 0.05, sure: a.dur };
  }

  // Klip-göreli kesimler → sequence zamanı
  function sekansaCevir(sonuc) {
    var offset = clip.clipStart;
    adalar = sonuc.adalar.map(function (a) { return { start: offset + a.start, end: offset + a.end }; });
    return sonuc.kesimler.map(function (k) {
      var r = { start: offset + k.start, end: offset + k.end, keep: true };
      if (k.birlesik) { r.birlesik = true; r.adaSayisi = k.adaSayisi; }
      return r;
    });
  }

  /*
   * ffmpeg silencedetect (eski akış ve Uygula'daki doğrulama aynı çağrıyı kullanır). Önce zarfla aynı
   * zaman süzgeci (S.ZAMAN_SUZGECI): ses akışı geç başlıyorsa (baştaki boşluk) ya da PTS boşluğu varsa
   * ikisi de onu sessizlik sayar, aynı eksende ölçer. Kaymasız dosyada sonuç 3.3'le aynıdır.
   */
  function sessizlikBul(ff, a, jeton) {
    return K.run(ff, [
      "-hide_banner",
      "-ss", String(clip.inPoint),
      "-t", String(a.dur),
      "-i", clip.mediaPath,
      "-map", "0:a:0?",
      "-af", S.ZAMAN_SUZGECI + ",silencedetect=noise=" + a.noise + "dB:d=" + a.minSil,
      "-f", "null", "-"
    ], { timeout: Math.max(300000, a.dur * 2000), iptal: jeton });
  }

  function sdAnahtar(a) { return sonAnahtar + "|" + a.noise + "|" + a.minSil; }

  /*
   * Tek çözümleme: s16le, özgün örnekleme hızı ve kanal sayısı, pipe:1 → tepe zarfı (saniyede 100
   * değer, geçici dosya yok, süre sınırı yok). Hız silencedetect'inkiyle aynı kalır (16 kHz'e inmez:
   * tıslamalı kayıtta önizleme doğrulamadan ~6 dB alçak ölçüyordu). Kanal sayısı ve hız stderr'deki
   * "Output #0" satırından okunur; okunana dek gelen parçalar bekletilir (en çok 16 MB, sonra
   * vazgeçilir → eski akış).
   * Döner: { zarf } | { iptal: true } | { neden }
   */
  async function zarfCikar(ff, a, jeton) {
    var st = S.tepeZarfi(), kanal = 0, sr = 0, stderr = "", bekleyen = [], bekleyenBayt = 0, vazgec = false;
    var yerel = K.iptalJetonu();
    var birak = jeton && jeton.dinle ? jeton.dinle(function () { yerel.iptal(); }) : null;
    function besle(b) { S.zarfBesle(st, b, { kanal: kanal, sr: sr, win: S.PENCERE }); }
    function bilgiOku(s) { var b = S.cikisBilgisi(s); kanal = b.kanal; sr = b.sr; }
    var res;
    try {
      res = await K.runAkis(ff, S.cozumlemeArgs(clip.mediaPath, clip.inPoint, a.dur), {
        timeout: Math.max(300000, a.dur * 2000), iptal: yerel,
        onStderr: function (s) {
          if (kanal) return;
          stderr += s;
          bilgiOku(stderr);
          if (kanal) { bekleyen.forEach(besle); bekleyen = []; bekleyenBayt = 0; }
        },
        onData: function (b) {
          if (kanal) { besle(b); return; }
          bekleyen.push(b); bekleyenBayt += b.length;
          if (bekleyenBayt > 16 * 1024 * 1024) { vazgec = true; bekleyen = []; yerel.iptal(); }
        }
      });
    } finally {
      if (birak) birak();
    }
    if (jeton && jeton.iptalEdildi) return { iptal: true };
    if (vazgec) return { neden: "no channel count" };
    if (!res || res.code !== 0) return { neden: "kod " + (res ? res.code : "?") + (res && res.hata ? " " + res.hata : "") };
    if (!kanal) {
      bilgiOku(res.stderr || "");
      if (!kanal) return { neden: "no channel count" };
      bekleyen.forEach(besle);
    }
    var z = S.zarfBitir(st);
    if (!z.length) return { neden: "no audio stream" };
    K.log("[kesim] zarf: " + z.length + " pencere, " + kanal + " kanal, " + sr + " Hz, " + res.bayt + " bayt");
    return { zarf: z };
  }

  /*
   * Sonuç (Yapay zekâ köprüsü / MCP kullanır; düğme yok sayar): { sonuc: 'bulundu'|'yok'|'iptal'|
   * 'klip_yok'|'hata'|'mesgul', kismi? }. Analiz sonuç dalına ulaşmadıysa (iptal, hata, klip yok)
   * önceki aralıklar ve liste olduğu gibi kalır.
   */
  async function analyze(ev) {
    // kapıdan ÖNCE: başıboş ikinci tık deneme penceresi de açmasın (Pro "yeniden" olay taşımaz, geçer)
    if (K.baslatTikiGecerli && !K.baslatTikiGecerli(ev, baslatAcilis)) return { sonuc: "mesgul" };
    // Pro: otomatik kesim (ucretsizde 3 deneme hakki; hak yalniz kesim uygulaninca duser)
    if (typeof Pro !== "undefined" && !Pro.gate("cut", { deneme: true, yeniden: analyze })) return { sonuc: "pro" };
    if (busy || uygulaniyor) return { sonuc: "mesgul" };
    sesiKapat();
    var ctx = KApp.ctx();
    var sekansMi = kapsam !== "clip";
    if (sekansMi) {
      /*
       * In → Out / Sekans: sesi Premiere dışa aktarır (her analizde taze; timeline arada değişmiş olabilir). Aralık
       * burada bağlamdan (KApp.ctx) ALINMAZ: bağlam yalnız panel odaktayken yoklanır, Premiere'de I / O'ya basıp hemen
       * tıklayınca bayattır. In / Out'u sekansSesiHazirla katmanlarla aynı okumada Premiere'den alır.
       */
      if (!ctx.hasSeq) { status(kapsamHataMetni("sekans"), "warn"); return; }
      sonucuBirak();
      onbellekleriBosalt();
    } else {
      clip = ctx.sel;
      if (!clip) { status("Önce bir klip seç.", "warn"); return { sonuc: "klip_yok" }; }
      /*
       * Başka klip (ya da aynı klibin in/out'u kaydı, ya da aynı klip sekansta başka konumda): önceki analizin
       * HİÇBİR parçası taşınmaz — kararlar, zarf, ham silencedetect aralıkları ve ekrandaki sonuç. İlk await'ten
       * ÖNCE: İptal / hata eski klibin sesini yeni klibin in/out'uyla eşleştirilmiş halde bırakmasın. Aynı klipte
       * aynı yerde iptal edilen yeniden analizde önceki sonuç ekranda kalır. Konum (clipStart) de sayılır: bağlam
       * yoklaması yalnız medya / seçim sayısı / sekans değişince haber verir; taşınan klipte (ya da aynı aralığın
       * başka yerdeki kopyasında) sekans zamanındaki kararlar eski konumdaki kesimlere oturup "kesme" denen
       * duraksamayı kestiriyordu. Zarf önbelleği klibe göre (sonAnahtar): ffmpeg yeniden çalışmaz.
       */
      var anahtar = S.anahtar(clip.mediaPath, clip.inPoint, clip.outPoint - clip.inPoint);
      var konum = anahtar + "@" + Number(clip.clipStart);
      if (konum !== sonKonum) {
        ranges = []; adalar = []; kapatilanlar = [];
        zarf = null; hamSessizlik = null; farkUyarisi = false;
        el("cut-result").hidden = true;
        render();   // çubuk / liste / özet boşalır, "Kesimleri uygula" kapanır
      }
      sonAnahtar = anahtar;
      sonKonum = konum;
    }
    var benimKlip = clip;
    analizSeqId = ctx.sequenceId ? String(ctx.sequenceId) : "";
    busy = true;
    iptalJetonu = K.iptalJetonu ? K.iptalJetonu() : null;
    var jeton = iptalJetonu;
    setBusy(true);
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");
      if (jeton && jeton.iptalEdildi) { status("İptal edildi.", "warn"); return { sonuc: "iptal" }; }
      // bu arada onContext analizi bıraktıysa (seçim değişti): ffmpeg boş klibin (clip null) yoluyla çağrılmasın
      if (!sekansMi && clip !== benimKlip) return;

      if (sekansMi) {
        var hazir = await sekansSesiHazirla(ctx, jeton);
        if (!hazir) return;           // iptal / uyarı (durum yazıldı)
        clip = benimKlip = hazir;
        // analiz edilen sekans: Premiere'in döndürdüğü kimlik (tıklama anındaki bağlam bayat olabilir)
        if (hazir.seqId) analizSeqId = hazir.seqId;
        sonAnahtar = S.anahtar(clip.mediaPath, clip.inPoint, clip.outPoint - clip.inPoint);
      } else if (katman || katmanBolumuAcik() || secImza !== null) {
        /*
         * Katmanlar bölümü açıldıysa koruma önerisi bu klibin aralığıyla tazelenir (okunamazsa analiz sürer).
         * Bölüm açık ama düzen yoksa da (sekans değişti / bölüm sekanssız açıldı) okunur: ipucu bunu söylüyor,
         * okunmazsa Uygula korumasız giderdi. Bölüm kapalı ama bu oturumda düzen okunduysa da (secImza) okunur:
         * başka sekansa geçince (Kopya sekansta'nın açtığı kopya dahil) düzen düşer; okunmazsa ikinci geçişte
         * korunan müzik kesilirdi.
         */
        await katmanlariOku({ start: clip.clipStart, end: clip.clipEnd });
        if (clip !== benimKlip) return;
      }

      var a = ayarlar();
      var dur = a.dur, noise = a.noise;

      // 3.4: tek çözümleme → canlı eşik. Önbellekte varsa ffmpeg hiç çalışmaz.
      var onbAnahtar = sonAnahtar;   // bağlam değişimi await sırasında sonAnahtar'ı boşaltabilir
      var z = zarfOnbellek.al(onbAnahtar);
      if (!z && K.runAkis) {
        status("Ses çözümleniyor… (" + dur.toFixed(0) + " sn)");
        var c = await zarfCikar(ff, a, jeton);
        if (c.iptal) { status("İptal edildi.", "warn"); return; }
        if (clip !== benimKlip) return;   // analiz sürerken seçim değişti
        if (c.zarf) { z = c.zarf; zarfOnbellek.koy(onbAnahtar, z); }
        else K.log("[kesim] PCM cozumleme olmadi (" + c.neden + "): silencedetect akisina donuluyor");
      }
      if (z) {
        zarf = z; hamSessizlik = null;
        el("cut-result").hidden = false;
        /*
         * Önbellekten gelen zarfta ffmpeg koşmaz, "Ses çözümleniyor…" yazılmaz: önceki hata / uyarı (başarısız Uygula'nın
         * "✕ Katman kilitli", "İptal edildi.") başarılı analizin üstünde kalırdı (refreshButton uyarıya dokunmaz).
         * yenidenHesapla kendi uyarısını (eşikte duraksama yok) yine yazar.
         */
        status("");
        otoMesaj = null;
        yenidenHesapla();
        if (ranges.length) KApp.toast(ranges.length + " kesim önerisi bulundu", "good");
        return { sonuc: ranges.length ? "bulundu" : "yok" };
      }
      zarf = null;

      status("Ses analiz ediliyor… (" + dur.toFixed(0) + " sn)");
      var res = await sessizlikBul(ff, a, jeton);
      // kullanıcı iptal etti: yarım sonucu öneri diye gösterme, önceki analiz ekranda kalır
      if (res.iptal) { status("İptal edildi.", "warn"); return { sonuc: "iptal" }; }
      if (clip !== benimKlip) return;
      var sil = parseSilence(res.stderr || "");
      K.log("[kesim] ffmpeg kod=" + res.code + " ham aralik=" + sil.length +
        " sure=" + dur.toFixed(1) + " esik=" + noise + "dB");
      /*
       * ffmpeg hata verdiyse (ses akışı yok, dosya okunamadı, codec eksik…)
       * bunu "duraksama yok" diye yutma — eski davranış kullanıcıyı eşikle
       * boğuşturuyordu, oysa sorun bambaşkaydı.
       */
      if (sil.length === 0 && res.code !== 0) {
        throw new Error("ses analizi başarısız: " +
          String(res.stderr || "").split("\n").filter(function (s) { return s.trim(); })
            .slice(-2).join(" ").slice(0, 180));
      }

      // tampon, 0.25 sn alt sınırı, Min. konuşma birleştirmesi ve kenar kırpması: SufloSessizlik (zarfla aynı kurallar)
      hamSessizlik = { liste: sil, noise: noise, minSil: a.minSil };
      if (res.code === 0) sdOnbellek[sdAnahtar(a)] = sil;
      ranges = S.kararEsle(kapatilanlar, sekansaCevir(S.kesimlereCevir(sil, kesimAyari(a))));

      if (ranges.length === 0) {
        el("cut-result").hidden = true;
        status("Bu eşikte duraksama yok — eşiği yükselt (-30 dB) ya da min. süreyi düşür.", "warn");
        return { sonuc: "yok" };
      }

      /*
       * ffmpeg hatayla bitti ama yine de aralik bulduysa (zaman asimi, yarim
       * okuma…) sonuc klibin yalnizca bir kismini kapsiyor olabilir. Bunu tam
       * sonucmus gibi sunmak, kullanicinin klibin sonundaki sessizlikleri
       * gozden kacirmasina yol acar — acikca soyle.
       */
      var kismi = res.code !== 0 && sil.length > 0;
      if (kismi) {
        status("⚠ Analiz tamamlanamadı — öneriler klibin yalnız bir kısmını kapsıyor olabilir. Tekrar dene.", "warn");
      } else {
        status("");
      }
      el("cut-result").hidden = false;
      render();
      KApp.toast(ranges.length + " kesim önerisi bulundu", kismi ? "warn" : "good");
      return { sonuc: "bulundu", kismi: kismi };
    } catch (e) {
      status("✕ " + e.message, "bad");
      return { sonuc: "hata", mesaj: String(e && e.message ? e.message : e) };
    } finally {
      busy = false;
      iptalJetonu = null;
      // sekans kapsamında sonuç çıkmadıysa (iptal / hata) dışa aktarılan karışım kalmasın
      if (sekansMi && clip === benimKlip && !zarf && !hamSessizlik) { wavSil(); clip = null; }
      setBusy(false);
    }
  }

  function setBusy(b) {
    el("cut-analyze").classList.toggle("busy", b);
    el("cut-progress").hidden = !b;
    // analiz sürerken "Sessizlikleri bul" yerine "İptal"
    var iptal = el("cut-cancel");
    if (iptal) {
      el("cut-analyze").hidden = b;
      iptal.hidden = !b;
      iptal.disabled = false;
    }
    iptalAcilis = b ? Date.now() : 0;
    baslatAcilis = b ? 0 : Date.now();
    if (!b) refreshButton();
  }

  function iptalEt(ev) {
    if (!busy || !iptalJetonu) return;
    if (K.iptalTikiGecerli && !K.iptalTikiGecerli(ev, iptalAcilis)) return;
    el("cut-cancel").disabled = true;
    iptalJetonu.iptal();
  }

  /* ---------------- Kapsam ve korunan katmanlar (3.4 adım 7) ---------------- */

  function kapsamHataMetni(kod) {
    if (kod === "inout") return "Sekansta In / Out yok: Premiere'de I ve O ile işaretle ya da Sekans kapsamını seç.";
    if (kod === "sekans") return "Önce bir sekans aç.";
    // sekans açık ama boş (süresi bir kareden kısa): "sekans aç" demek yanıltırdı
    if (kod === "bos") return "Sekans boş: önce klip ekle.";
    return "Önce bir klip seç.";
  }

  // KS_exportAudio senkron ExtendScript: o sırada İptal kapalı, ipucu nedenini söyler
  function iptalKilit(kilitli) {
    var b = el("cut-cancel");
    if (!b) return;
    b.disabled = !!kilitli || !!(iptalJetonu && iptalJetonu.iptalEdildi);
    b.title = kilitli ? IPTAL_KILITLI : IPTAL_IPUCU;
  }

  function eprListesi() {
    try { return window.KCaptions && KCaptions.bundledEpr ? KCaptions.bundledEpr() : []; } catch (e) { return []; }
  }

  /*
   * Sekans kapsamında dışa aktarılan karışımı sil (Uygula, kapsam / sekans / dinlenen ses değişimi, panel kapanışı).
   * Windows'ta açık dosya silinemez: İptal'de ffmpeg (taskkill eşzamansız), ▶ Dinle ya da Uygula doğrulaması WAV'ı
   * hâlâ tutuyor olabilir. Silinemeyen yol unutulmaz: artan aralıklarla yeniden denenir, sonraki wavSil ve panel
   * kapanışı da dener (yoksa her iptal sekans uzunluğunda bir WAV bırakırdı).
   */
  var silinecekler = [];
  var silZaman = null, silDeneme = 0;
  var SIL_MS = 500, SIL_DENEME = 8;
  function dosyaSil(yol) {
    try {
      if (K.fs && K.fs.existsSync(yol)) K.fs.unlinkSync(yol);
      return true;
    } catch (e) {
      K.log("[kesim] gecici wav silinemedi (" + (e && e.code || "") + "): " + (e && e.message));
      return false;
    }
  }
  function bekleyenleriSil() {
    silinecekler = silinecekler.filter(function (y) { return !dosyaSil(y); });
    return silinecekler.length === 0;
  }
  function silmeyiYinele() {
    if (silZaman || !silinecekler.length || silDeneme >= SIL_DENEME) return;
    silZaman = setTimeout(function () {
      silZaman = null;
      silDeneme++;
      if (!bekleyenleriSil()) silmeyiYinele();
    }, SIL_MS * Math.pow(2, silDeneme));
  }
  function wavSil() {
    if (geciciWav) {
      if (silinecekler.indexOf(geciciWav) === -1) silinecekler.push(geciciWav);
      geciciWav = "";
      silDeneme = 0;
    }
    if (!silinecekler.length) return;
    if (!bekleyenleriSil()) silmeyiYinele();
  }

  // Ekrandaki analizi bırak (kapsam değişti, sekans kapsamında yeni analiz başlıyor)
  function sonucuBirak() {
    sesiKapat();
    if (canliZaman) { clearTimeout(canliZaman); canliZaman = null; }
    canliBekliyor = false;
    ranges = []; adalar = []; kapatilanlar = [];
    zarf = null; hamSessizlik = null; farkUyarisi = false;
    clip = null;
    wavSil();
    el("cut-result").hidden = true;
    render();
  }

  /*
   * Katman düzenini oku (KS_getTrackLayout, aralığa değen kliplerle). Yalnız kullanıcı eyleminden: kapsam düğmesi,
   * Katmanlar bölümünü açmak, Yenile, Sessizlikleri bul, Uygula (düzen düşmüşse). Katman imzası değiştiyse seçimler
   * öneriye döner. Aynı kapsam / aralık için süren bir okuma varsa (kapsam tıkının hemen ardından Sessizlikleri bul)
   * yenisi açılmaz, o beklenir; süren okuma başka kapsamın / aralığınsa bitince bu kapsam için yeniden okunur (yoksa
   * In → Out'tan Sekans'a hızlı geçişte Sekans analizi In / Out aralığının düzeniyle yapılırdı).
   * aralik verilmezse In → Out / Sekans'ta aralığı Premiere okuma anında kendi In / Out'undan verir (scope).
   * Döner: düzen | null (durum ipucuna yazıldı).
   */
  var katmanSozu = null, katmanSozAnahtari = "";
  function katmanlariOku(aralik) {
    var anahtar = aralik ? "a:" + aralik.start + "-" + aralik.end : "k:" + kapsam;
    if (katmanSozu) {
      if (katmanSozAnahtari === anahtar) return katmanSozu;
      return katmanSozu.then(function () { return katmanlariOku(aralik); });
    }
    katmanOkunuyor = true;
    katmanSozAnahtari = anahtar;
    katmanSozu = katmanOkuIc(aralik).then(function (r) {
      katmanOkunuyor = false; katmanSozu = null; return r;
    }, function (e) {
      katmanOkunuyor = false; katmanSozu = null;
      katmanIpucu("Katmanlar okunamadı: " + (e && e.message));
      return null;
    });
    return katmanSozu;
  }
  async function katmanOkuIc(aralik) {
    var ctx = KApp.ctx();
    if (!ctx.hasSeq) { katmanIpucu("Katmanları görmek için bir sekans aç."); return null; }
    var yuk = { klipler: true };
    var ar = aralik || null;
    if (!ar && kapsam === "clip") {
      ar = S.kapsamAraligi("clip", ctx);
      if (ar.hata) ar = null;
    }
    /*
     * In → Out / Sekans (ya da seçili klip yok): aralığı Premiere okuma anında kendi In / Out'undan / sonundan verir
     * (kapsam). Bağlamın seqIn / seqOut'u bayat olabilir: Dinlenecek ses önerisi, bağlı çift uyarısı ve "In / Out yok"
     * denetimi eski aralığa göre yapılırdı.
     */
    if (ar) { yuk.start = ar.start; yuk.end = ar.end; }
    else yuk.scope = kapsam === "clip" ? "entire" : kapsam;
    var r = null;
    try {
      r = await K.call("KS_getTrackLayout", yuk, 60000);
    } catch (e) {
      r = { ok: false, error: e && e.message };
    }
    if (!r || !r.ok || !r.audio || !r.video) {
      katmanIpucu(r && r.error ? "Katmanlar okunamadı: " + r.error : "Katmanlar okunamadı.");
      return null;
    }
    // okuma sürerken başka sekansa geçildiyse bu düzen artık etkin sekansın değil
    var simdi = KApp.ctx();
    if (simdi.sequenceId && r.seqId && String(simdi.sequenceId) !== String(r.seqId)) return null;
    var kapAr = null;
    if (yuk.scope) {
      // host kapsam döndürmediyse (eski host.jsx) bağlamın değerleri
      var kap = r.kapsam || { scope: yuk.scope, seqIn: ctx.seqIn, seqOut: ctx.seqOut, seqDur: ctx.seqDur, frame: ctx.frame };
      kapAr = S.hostKapsamAraligi(kap);
      ar = kapAr.hata ? S.hostKapsamAraligi({ scope: "entire", seqDur: kap.seqDur, frame: kap.frame }) : kapAr;
      if (ar.hata) ar = { start: 0, end: 0 };
      katmanKapsam = { scope: yuk.scope, aralik: kapAr, kap: r.kapsam || null };
    } else {
      katmanKapsam = { scope: "", aralik: null, kap: null };
    }
    /*
     * Seçimler katman DİZİNİDİR: katman eklenip silinince / yeniden adlandırılınca aynı dizin başka katmanı gösterir
     * (müzik A2'den A3'e kayar, "korunan A2" boş katman olur): imza değiştiyse öneriye dön. Yalnız sekans kimliği
     * değiştiyse (Kopya sekansta'nın açtığı kopya, aynı düzende başka sekans) seçimler sürer: düşürülürse elle korunan
     * müzik ikinci geçişte kesilirdi.
     */
    var imza = katmanImzasi(r);
    if (secImza !== imza) { secDinle = null; secKoru = null; }
    secImza = imza;
    katman = r;
    katmanAralik = ar.end > ar.start ? ar : { start: 0, end: Number(r.duration) || 0 };
    katmanCiftleri = S.bagliCiftler(katman);
    renderKatmanlar();
    renderUyarilar();
    return katman;
  }

  function katmanIpucu(m) {
    var e = el("cut-katman-ipucu");
    if (e) e.textContent = m || "";
  }

  function katmanBolumuAcik() { var d = el("cut-katman"); return !!(d && d.open); }

  // Katman adları (KS_applyCuts expectTracks: protect dizinleri bu düzene göre)
  function katmanAdlari(lay) {
    function adlar(l) { return (l || []).map(function (iz) { return String((iz && iz.name) || ""); }); }
    return { video: adlar(lay && lay.video), audio: adlar(lay && lay.audio) };
  }
  function katmanImzasi(lay) { return JSON.stringify(katmanAdlari(lay)); }

  // Önerinin aralığı: analiz edilmiş kapsam (klip / In-Out / sekans), yoksa katmanın okunduğu aralık
  function oneriAraligi() {
    if (clip) return { start: clip.clipStart, end: clip.clipEnd };
    return katmanAralik || { start: 0, end: 0 };
  }

  // hedef: Yapay zekâ köprüsünün zorunlu kopyası ("clone"); verilmezse hedef düğmesinin seçimi
  function etkinMod(hedef) { return (hedef || target) === "clone" ? "ripple" : el("cut-mode").value; }

  function korumaHesapla(mod) {
    if (!katman || !S) return null;
    var ar = oneriAraligi();
    var act = ranges.length ? activeRanges() : null;
    return S.korumaOner(katman, { start: ar.start, end: ar.end, dinle: secDinle, koru: secKoru, mod: mod || etkinMod(),
      kesimler: act, dinleGerekli: kapsam !== "clip", ciftler: katmanCiftleri });
  }

  function uyariBul(o, kod) {
    if (!o) return null;
    for (var i = 0; i < o.uyarilar.length; i++) if (o.uyarilar[i].kod === kod) return o.uyarilar[i];
    return null;
  }

  // Korunan video katmanı ripple'da geride kalır: Kesimleri uygula kapalı, "Boşluk bırakarak uygula" açık
  function videoRippleEngeli(mod) { return !!uyariBul(korumaHesapla(mod), "video-ripple"); }

  function listeDegistir(liste, i) {
    var out = [], var_ = false;
    (liste || []).forEach(function (x) { if (x === i) var_ = true; else out.push(x); });
    if (!var_) out.push(i);
    return out.sort(function (a, b) { return a - b; });
  }

  function dinleDegistir(i) {
    if (busy || uygulaniyor) return;
    var o = korumaHesapla();
    if (!o) return;
    secDinle = listeDegistir(o.dinle, i);
    // Sekans kapsamında analiz eski karışımla yapıldı: bayat, yeniden bulunmalı
    if (clip && clip.kapsam) {
      sonucuBirak();
      status("Dinlenecek ses değişti: Sessizlikleri yeniden bul.", "warn");
    }
    renderKatmanlar();
    renderUyarilar();
  }

  function koruDegistir(tur, i) {
    if (busy || uygulaniyor) return;
    var o = korumaHesapla();
    if (!o) return;
    var k = { video: o.koru.video.slice(), audio: o.koru.audio.slice() };
    k[tur] = listeDegistir(k[tur], i);
    secKoru = k;
    renderKatmanlar();
    renderUyarilar();
    if (clip && !el("cut-result").hidden) updateSummary();
  }

  var TIK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" stroke="currentColor" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CIZGI = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M5.6 8 h4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  var KILIT = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M5.5 7V5.3a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';

  function izCipi(tur, i, iz, on, sinif, baslik, tikla) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "track-chip cut-iz" + (on ? " on" : "") + (sinif ? " " + sinif : "");
    b.title = baslik || "";
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.innerHTML = /kilitli/.test(sinif || "") ? KILIT : on ? TIK : CIZGI;
    // katman adı kullanıcı içeriği: çevrilmez ("Müzik" adlı katman "Music" olmasın)
    var sp = document.createElement("span");
    sp.setAttribute("data-i18n-skip", "");
    sp.textContent = S.izEtiketi(tur, i, iz && iz.name);
    b.appendChild(sp);
    if (/kilitli/.test(sinif || "")) b.disabled = true;
    else b.onclick = tikla;
    return b;
  }

  function izDoluMu(iz, ar) {
    var k = (iz && iz.klipler) || [];
    for (var i = 0; i < k.length; i++) if (Math.min(k[i].e, ar.end) - Math.max(k[i].s, ar.start) > 1e-3) return true;
    return false;
  }

  // "Dinlenecek ses" ve "Kesilmeyecek katmanlar" çip satırları
  function renderKatmanlar() {
    var dinSatir = el("cut-dinle-satir"), korSatir = el("cut-koru-satir");
    if (!dinSatir || !korSatir) return;
    var o = korumaHesapla();
    var ozet = el("cut-katman-ozet");
    if (!o) {
      dinSatir.hidden = true; korSatir.hidden = true;
      if (ozet) ozet.textContent = "";
      katmanIpucu(KApp.ctx().hasSeq ? "Katmanlar sekanstan okunur: bu bölümü açınca ya da Sessizlikleri bul'da." : "Katmanları görmek için bir sekans aç.");
      return;
    }
    katmanIpucu("");
    sonKoruSayisi = o.koru.video.length + o.koru.audio.length;
    var ar = oneriAraligi();
    dinSatir.hidden = kapsam === "clip";
    korSatir.hidden = false;
    var dinKutu = el("cut-dinle-izler"), korKutu = el("cut-koru-izler");
    dinKutu.innerHTML = "";
    korKutu.innerHTML = "";
    katman.audio.forEach(function (iz, i) {
      var on = o.dinle.indexOf(i) !== -1, dolu = izDoluMu(iz, ar);
      var bas = iz.muted ? "Premiere'de susturulmuş: dinlenirse dışa aktarımda geçici olarak açılır" :
        dolu ? "Sessizlik bu katmanların karışımında aranır" : "Bu aralıkta klip yok";
      dinKutu.appendChild(izCipi("audio", i, iz, on, (iz.locked ? "kilitli" : "") + (dolu ? "" : " bos"),
        iz.locked ? "Premiere'de kilitli" : bas, function () { dinleDegistir(i); }));
    });
    function korCip(tur, iz, i) {
      var on = o.koru[tur].indexOf(i) !== -1, oneri = tur === "audio" && o.oner.audio.indexOf(i) !== -1;
      var adla = tur === "audio" && o.adla.audio.indexOf(i) !== -1, dolu = izDoluMu(iz, ar);
      var bas = iz.locked ? "Premiere'de kilitli: zaten kesilmez" :
        oneri ? "Öneri: tek bir klip aralığın çoğunu kaplıyor (müzik ya da ambiyans olabilir)" :
        adla ? "Adı müzik / ambiyans: varsayılan olarak korunur" :
        tur === "video" ? "Korunan video katmanı Ripple'da kaymaz: yalnız boşluk modunda güvenli" :
        "Korunan katman kesilmez ve kaymaz";
      korKutu.appendChild(izCipi(tur, i, iz, on || iz.locked, (iz.locked ? "kilitli" : "") + (oneri && !on ? " oneri" : "") + (dolu ? "" : " bos"),
        bas, function () { koruDegistir(tur, i); }));
    }
    katman.video.forEach(function (iz, i) { korCip("video", iz, i); });
    katman.audio.forEach(function (iz, i) { korCip("audio", iz, i); });
    if (ozet) {
      var parca = [];
      if (kapsam !== "clip") parca.push(o.dinle.length + " dinlenen");
      parca.push((o.koru.video.length + o.koru.audio.length) + " korunan");
      ozet.textContent = parca.join(" · ");
    }
  }

  // Uyarılar (#cut-koru-uyari, Kesimleri uygula'nın üstünde): korunan video + ripple, bağlı çiftin ayrılması
  function renderUyarilar() {
    var kutu = el("cut-koru-uyari");
    if (!kutu) return;
    kutu.innerHTML = "";
    var o = clip ? korumaHesapla() : null;
    var vr = uyariBul(o, "video-ripple"), bg = uyariBul(o, "bagli");
    kutu.hidden = !vr && !bg;
    if (vr) {
      var p1 = document.createElement("p");
      p1.className = "cut-uyari-satir";
      p1.textContent = "⚠ Korunan video katmanı (" + vr.izler.map(function (i) { return "V" + (i + 1); }).join(", ") +
        ") Ripple'da kaymaz: kurgunun geri kalanıyla senkronu bozulur. Boşluk bırakarak uygula ya da korumayı kaldır.";
      kutu.appendChild(p1);
      var b = document.createElement("button");
      b.type = "button";
      b.id = "cut-bosluk-uygula";
      b.className = "btn tiny";
      b.textContent = "Boşluk bırakarak uygula";
      b.title = "Kesimler silinir, yerlerinde boşluk kalır: hiçbir katman kaymaz";
      b.disabled = busy || uygulaniyor || activeRanges().length === 0;
      b.onclick = boslukluUygula;
      kutu.appendChild(b);
    }
    if (bg) {
      var p2 = document.createElement("p");
      p2.className = "cut-uyari-satir";
      p2.textContent = "⚠ Bağlı klipler ayrılacak: bir tarafı korunuyor, öbür tarafı kesiliyor (" + bg.toplam + " çift).";
      kutu.appendChild(p2);
      var ul = document.createElement("ul");
      ul.className = "cut-bagli-liste";
      bg.ciftler.slice(0, 5).forEach(function (c) {
        var li = document.createElement("li");
        li.textContent = zamanGoster(c.start) + " · " + (c.koruTaraf === "audio"
          ? "A" + (c.audio + 1) + " korunuyor, V" + (c.video + 1) + " kesiliyor"
          : "V" + (c.video + 1) + " korunuyor, A" + (c.audio + 1) + " kesiliyor");
        if (c.ad) {
          var ad = document.createElement("span");
          ad.className = "dim";
          ad.setAttribute("data-i18n-skip", "");
          ad.textContent = " · " + c.ad;
          li.appendChild(ad);
        }
        ul.appendChild(li);
      });
      if (bg.toplam > 5) {
        var son = document.createElement("li");
        son.className = "dim";
        son.textContent = "ve " + (bg.toplam - 5) + " çift daha";
        ul.appendChild(son);
      }
      kutu.appendChild(ul);
    }
  }

  // Sekans kapsamında zamanlar sekans zamanı (Premiere'deki gibi), klipte klibin başından
  function zamanGoster(t) {
    if (!clip || clip.kapsam) return fmt(t);
    return fmt(t - clip.clipStart);
  }

  /*
   * In → Out / Sekans: dinlenecek ses katmanları KS_exportAudio ile tek WAV'a (ofsetiyle). Aralık katmanlarla aynı
   * okumada Premiere'in kendi In / Out'undan (katmanKapsam); dışa aktarılan karışımın ofset / süresi o aralıkla
   * karşılaştırılır. Döner: sahte klip { mediaPath: wav, inPoint: 0, outPoint: süre, clipStart: ofset, clipEnd, kapsam,
   * seqId, dinle } | null (iptal / uyarı; durum yazıldı). Hata fırlatır (analyze yakalar).
   */
  async function sekansSesiHazirla(ctx, jeton) {
    status("Katmanlar okunuyor…");
    var lay = await katmanlariOku();
    if (!lay || !katmanKapsam || katmanKapsam.scope !== kapsam) throw new Error("katmanlar okunamadı — Premiere meşgul olabilir, yeniden dene.");
    if (jeton && jeton.iptalEdildi) { status("İptal edildi.", "warn"); return null; }
    var okunan = katmanKapsam;
    var aralik = okunan.aralik;
    if (aralik.hata) { status(kapsamHataMetni(aralik.hata), "warn"); return null; }
    var o = korumaHesapla();
    /*
     * Dinlenecek katmanların hiçbirinde bu aralıkta klip yoksa da (kullanıcının seçimi aynı adlı katmanlarla başka In / Out'a
     * taşındı: B-roll bölümü) karışım sessiz çıkar ve tüm aralık tek kesim olurdu: boş seçim gibi durulur (3.4 inceleme).
     */
    var dinlenenDolu = !!(o && o.dinle.some(function (i) { return izDoluMu(lay.audio[i], aralik); }));
    if (!o || !o.dinle.length || !dinlenenDolu) {
      /*
       * Aralıkta hiçbir ses katmanında klip yoksa (yalnız video: ekran kaydı, timelapse; ya da hiç ses katmanı yok) seçilecek
       * çip yok ya da hepsi boş: boş çip seçmek sessiz karışım dışa aktarır, tüm aralık tek kesim olurdu.
       */
      var sesVar = lay.audio.some(function (iz) { return izDoluMu(iz, aralik); });
      if (!sesVar) {
        status("Bu aralıkta ses klibi yok: sessizlik aranacak ses bulunamadı.", "warn");
        return null;
      }
      var det = el("cut-katman");
      if (det) det.open = true;
      status("Dinlenecek bir ses katmanı seç (Katmanlar › Dinlenecek ses).", "warn");
      return null;
    }
    status(kapsam === "inout" ? "In → Out sesi dışa aktarılıyor…" : "Sekans sesi dışa aktarılıyor…");
    iptalKilit(true);
    var ex;
    try {
      // Uzun sekansta dışa aktarım dakikalar sürebilir
      ex = await K.call("KS_exportAudio", { scope: kapsam, tracks: o.dinle, epr: eprListesi(), unmuteWanted: true }, 3600000);
    } finally {
      iptalKilit(false);
    }
    if (ex && ex.ok && ex.wav) geciciWav = String(ex.wav);
    if (jeton && jeton.iptalEdildi) { status("İptal edildi.", "warn"); return null; }
    if (!ex || !ex.ok) throw new Error((ex && ex.error) || "Premiere sesi dışa aktaramadı.");
    /*
     * Analiz edilen sekans Premiere'in söylediği: katmanların okunduğu ve sesin dışa aktarıldığı sekans. Tıklama anındaki
     * bağlam (KApp.ctx) panel odakta değilken yoklanmaz, bayat olabilir; ikisi arasında sekans değiştiyse karışım
     * okunan katmanlara ait değil (WAV analyze'ın finally'sinde silinir).
     */
    var seqId = String(ex.seqId || lay.seqId || ctx.sequenceId || "");
    if (ex.seqId && lay.seqId && String(ex.seqId) !== String(lay.seqId)) {
      throw new Error("etkin sekans analiz sırasında değişti — Sessizlikleri yeniden bul.");
    }
    /*
     * Karışım, katmanların (ve önerilen Dinlenecek ses'in) okunduğu aralığın mı? Arada In / Out taşındıysa ya da sekans
     * sonu değiştiyse dinlenen katmanlar başka aralığa göre seçildi: o aralıkta sessiz olan karışım tümüyle "sessizlik"
     * görünür ve harita konuşmayı kesmeyi önerirdi.
     */
    if (okunan.kap && !S.disaAktarimTutar(okunan.kap, ex)) {
      K.log("[kesim] disa aktarim araligi okunan kapsamla tutmuyor: ofset=" + ex.offset + " sure=" + ex.duration +
        " okunan=" + JSON.stringify(okunan.kap));
      throw new Error(kapsam === "inout" ? "In / Out analiz sırasında değişti — Sessizlikleri yeniden bul." :
        "sekansın süresi analiz sırasında değişti — Sessizlikleri yeniden bul.");
    }
    var dur = Number(ex.duration) > 0 ? Number(ex.duration) : aralik.end - aralik.start;
    var ofset = Number(ex.offset) || 0;
    /*
     * Analiz edilen kurgunun izi (KS_kurguIzi: tüm kliplerin yeri). Uygula KS_applyCuts'a expectIz olarak verir: analizden
     * sonra Premiere'de klipler taşındı / kırpıldı / silindiyse kesimler eski sekans zamanlarına düşerdi, host uygulamaz
     * (3.4 son inceleme). İz okunamazsa (eski host) denetim yapılmaz.
     */
    var kurguIz = "";
    try {
      var izR = await K.call("KS_kurguIzi", { seqId: seqId }, 20000);
      if (izR && izR.ok && typeof izR.iz === "string") kurguIz = izR.iz;
    } catch (eIz) { kurguIz = ""; }
    K.log("[kesim] " + kapsam + " karisimi: " + o.dinle.map(function (i) { return "A" + (i + 1); }).join(",") +
      " ofset=" + ofset.toFixed(3) + " sure=" + dur.toFixed(3));
    return { mediaPath: geciciWav, inPoint: 0, outPoint: dur, clipStart: ofset, clipEnd: ofset + dur,
      name: kapsam === "inout" ? "In → Out" : "Sekans", kapsam: kapsam, seqId: seqId,
      dinle: o.dinle.slice(), kurguIz: kurguIz };
  }

  function kapsamSec(s) {
    if (busy || uygulaniyor || s === kapsam) return;
    kapsam = s;
    Array.prototype.forEach.call(el("cut-scope").querySelectorAll("button"), function (x) {
      x.classList.toggle("on", x.dataset.s === s);
    });
    // önceki kapsamın analizi (ve karışım WAV'ı) bu kapsama taşınmaz
    if (clip) sonucuBirak();
    onbellekleriBosalt();
    var ctx = KApp.ctx();
    if (s !== "clip" && ctx.hasSeq) {
      var det = el("cut-katman");
      if (det) det.open = true;
      katmanlariOku();
    }
    renderKatmanlar();
    status("");
    refreshButton();
  }

  // "Boşluk bırakarak uygula": korunan video katmanı varken ripple yerine gap
  function boslukluUygula() {
    zorlaBosluk = true;
    return apply();
  }

  /* ---------------- Canlı eşik (3.4) ---------------- */

  var BOS_UYARI = "Bu eşikte duraksama yok — eşiği yükselt (-30 dB) ya da min. süreyi düşür.";
  var ESKI_UYARI = "Eşik ve min. sessizlik bu klipte canlı güncellenemiyor: Sessizlikleri bul ile yenile.";
  // Yedek akışta (ses çözümlenemedi, silencedetect haritası) zarf yok: Sessizlikleri bul yine çözemez, Otomatik ölçemez
  var OTOMATIK_YOK = "Otomatik eşik bu klipte kullanılamıyor: ses çözümlenemedi. Eşiği elle ayarla, sonra Sessizlikleri bul.";

  // Durum satırı bu metni mi gösteriyor (İngilizce arayüzde çevrilmiş haliyle de: SufloI18n.orig özgün Türkçeyi verir)
  function durumGosteriyor(metin) {
    var e = el("cut-status");
    if (!metin || !e) return false;
    if (e.textContent === metin) return true;
    return !!(window.SufloI18n && SufloI18n.orig && SufloI18n.orig(e) === metin);
  }

  /*
   * Kaydırıcı değişti: zarf varsa bul() ile harita yeniden kurulur (ffmpeg yok); eski akışta yalnız
   * Tampon ve Min. konuşma canlıdır (ham silencedetect aralıkları üzerinden). Yeni aralıklar bir önceki
   * kümeyle değil, kullanıcının karar listesiyle (kapatilanlar) eşlenir: aradaki konumlarda karar kaybolmaz.
   */
  function yenidenHesapla() {
    if (!clip || !S) return;
    // Uygula sürerken harita değişmez (uygulanan küme ekranda kalır); kilit açılınca yeni ayarla kurulur
    if (uygulaniyor) { canliBekliyor = true; return; }
    var a = ayarlar(), sonuc;
    if (zarf) sonuc = S.bul(zarf, kesimAyari(a));
    else if (hamSessizlik) sonuc = S.kesimlereCevir(hamSessizlik.liste, kesimAyari(a));
    else return;
    ranges = S.kararEsle(kapatilanlar, sekansaCevir(sonuc));
    // "doğrulama kesimleri değiştirdi" uyarısı doğrulanmış haritayı anlatıyordu; harita artık önizleme
    var farkVardi = farkUyarisi;
    farkUyarisi = false;
    // Otomatik'in satırı ("Otomatik eşik: -45 dB …") Eşik elle değişince kaydırıcıyla çelişirdi
    var otoEskidi = !!otoMesaj && String(a.noise) !== otoMesaj.esik;
    var otoGorunur = otoEskidi && durumGosteriyor(otoMesaj.metin);
    if (otoEskidi) otoMesaj = null;
    if (zarf && ranges.length === 0) status(BOS_UYARI, "warn");
    else if (!zarf && (String(a.noise) !== String(hamSessizlik.noise) || a.minSil !== hamSessizlik.minSil)) status(ESKI_UYARI, "warn");
    else if (farkVardi || otoGorunur || durumGosteriyor(BOS_UYARI) || durumGosteriyor(ESKI_UYARI)) status("");
    // eski akışta "duraksama yok" sonucu gizlemişti; Tampon / Min. konuşma kesim çıkarınca geri gelsin
    if (ranges.length) el("cut-result").hidden = false;
    render();
  }

  // Kaydırıcı 'input' olayları ~100 ms'de bir toplanır (sürüklerken her piksel yeniden çizmesin)
  function canliGuncelle() {
    if (canliZaman) clearTimeout(canliZaman);
    canliZaman = setTimeout(function () {
      canliZaman = null;
      if (uygulaniyor) { canliBekliyor = true; return; }
      if (busy) return;
      yenidenHesapla();
    }, CANLI_MS);
  }

  // "Otomatik": eşiği klibin kendi zarfından öner (arka plan p10 + 8 dB); düşük SNR'de uyar
  function otomatikEsik() {
    if (uygulaniyor) return;   // Uygula sürerken eşik ve harita değişmez
    if (!zarf) {
      // yedek akışta Sessizlikleri bul zaten koştu: yeniden bulmak yine çözemez, "önce bul" demek çıkmaz sokak
      status(hamSessizlik ? OTOMATIK_YOK : "Önce Sessizlikleri bul: otomatik eşik klibin kendi sesinden ölçülür.", "warn");
      return;
    }
    var o = S.esikOner(zarf);
    if (!o) return;
    var inp = el("cut-noise");
    inp.value = String(o.esik);
    el("cut-noise-val").textContent = inp.value + " dB";
    if (canliZaman) { clearTimeout(canliZaman); canliZaman = null; }
    yenidenHesapla();
    var metin;
    if (o.dusukSnr) {
      metin = "⚠ Konuşma ile arka plan gürültüsü arasındaki fark az (" + Math.round(o.konusma - o.taban) +
        " dB): kesimler kelime kırpabilir ya da sessizlik kaçırabilir. Önce Sesi iyileştir'i dene ya da eşiği elle ayarla.";
      status(metin, "warn");
    } else {
      metin = "Otomatik eşik: " + o.esik + " dB (arka plan " + Math.round(o.taban) + " dB, konuşma " + Math.round(o.konusma) + " dB)";
      status(metin);
    }
    otoMesaj = { esik: inp.value, metin: metin };
  }

  /* ---------------- Görselleştirme ---------------- */

  function activeRanges() {
    return ranges.filter(function (r) { return r.keep; });
  }

  function render() {
    renderBar();
    renderWave();
    renderList();
    updateSummary();
    renderUyarilar();
  }

  /*
   * Kullanıcı bir kesimi açtı / kapattı (çubuk ya da liste): karar listesine yazılır, ekrandaki küme de
   * listeyle yeniden eşlenir (sonraki kaydırıcı hareketinin göstereceğiyle aynı görünsün).
   */
  function kararVer(r, keep) {
    // Uygula sürerken karar değişmez; liste onay kutusu tıklamayla değişmişse eski haline çizilir
    if (uygulaniyor) { render(); return; }
    kapatilanlar = S.kararYaz(kapatilanlar, r, keep, ranges);
    r.keep = keep;
    ranges = S.kararEsle(kapatilanlar, ranges);
    render();
  }

  // Bir kesimin içine düşen Min. konuşma adaları (taralı gösterilir)
  function kesimAdalari(r) {
    return adalar.filter(function (a) { return a.start >= r.start - 1e-6 && a.end <= r.end + 1e-6; });
  }

  function renderBar() {
    var bar = el("cut-bar");
    bar.innerHTML = "";
    if (!clip) return;
    var t0 = clip.clipStart, t1 = clip.clipEnd;
    var total = t1 - t0;
    if (total <= 0) return;
    var pos = t0;
    ranges.forEach(function (r, i) {
      if (r.start > pos) {
        var keep = document.createElement("span");
        keep.className = "keep";
        keep.style.width = ((r.start - pos) / total * 100) + "%";
        bar.appendChild(keep);
      }
      var baslik = zamanGoster(r.start) + " · −" + (r.end - r.start).toFixed(2) + " sn" +
        (r.birlesik ? " · kısa konuşma birleştirildi" : "") + (r.keep ? "" : " (kapalı)");
      var ic = r.birlesik ? kesimAdalari(r) : [];
      if (!ic.length) {
        var cut = document.createElement("span");
        cut.className = "cut" + (r.keep ? "" : " off");
        cut.style.width = ((r.end - r.start) / total * 100) + "%";
        cut.title = baslik;
        cut.onclick = function () { kararVer(r, !r.keep); };
        bar.appendChild(cut);
      } else {
        // birleşik kesim: sessiz parçalar düz, araya giren kısa konuşma adaları taralı (hepsi aynı aralığı açıp kapatır)
        var p = r.start, parcalar = [];
        ic.forEach(function (a) {
          if (a.start > p) parcalar.push({ s: p, e: a.start, ada: false });
          parcalar.push({ s: a.start, e: a.end, ada: true });
          p = a.end;
        });
        if (p < r.end) parcalar.push({ s: p, e: r.end, ada: false });
        parcalar.forEach(function (pc) {
          var sp = document.createElement("span");
          sp.className = "cut parca" + (pc.ada ? " ada" : "") + (r.keep ? "" : " off");
          sp.style.width = ((pc.e - pc.s) / total * 100) + "%";
          var adaSn = (pc.e - pc.s).toFixed(2);
          sp.title = pc.ada ? "Kısa konuşma (" + adaSn + " sn) — Min. konuşma nedeniyle kesime katıldı" + (r.keep ? "" : " (kapalı)") : baslik;
          sp.onclick = function () { kararVer(r, !r.keep); };
          bar.appendChild(sp);
        });
      }
      pos = r.end;
    });
    if (pos < t1) {
      var tail = document.createElement("span");
      tail.className = "keep";
      tail.style.width = ((t1 - pos) / total * 100) + "%";
      bar.appendChild(tail);
    }
  }

  /*
   * #cut-wave: tepe zarfı (sütun başına min/max), kesim bölgeleri, taralı Min. konuşma adaları ve
   * kesikli eşik çizgisi. Yalnız zarf varken görünür (eski silencedetect akışında zarf yok).
   */
  var DB_ALT = -70;
  function renderWave() {
    var cv = el("cut-wave");
    if (!cv) return;
    if (!zarf || !clip || !S) { cv.hidden = true; return; }
    cv.hidden = false;
    var g = cv.getContext ? cv.getContext("2d") : null;
    if (!g) return;
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(1, Math.round((cv.clientWidth || 320) * dpr));
    var h = Math.max(1, Math.round((cv.clientHeight || 56) * dpr));
    if (cv.width !== w) cv.width = w;
    if (cv.height !== h) cv.height = h;
    g.clearRect(0, 0, w, h);
    var t0 = clip.clipStart, total = clip.clipEnd - clip.clipStart;
    if (!(total > 0)) return;
    function y(db) {
      var t = (Math.max(DB_ALT, Math.min(0, db)) - DB_ALT) / -DB_ALT;
      return h - t * h;
    }
    function x(t) { return (t - t0) / total * w; }
    // kesim bölgeleri
    ranges.forEach(function (r) {
      g.fillStyle = r.keep ? "rgba(114,124,255,.22)" : "rgba(255,255,255,.05)";
      g.fillRect(x(r.start), 0, Math.max(1, x(r.end) - x(r.start)), h);
    });
    // Min. konuşma adaları: taralı
    adalar.forEach(function (a) {
      var x0 = x(a.start), aw = Math.max(1, x(a.end) - x0);
      g.save();
      g.beginPath(); g.rect(x0, 0, aw, h); g.clip();
      g.strokeStyle = "rgba(234,200,119,.75)"; g.lineWidth = dpr;
      g.beginPath();
      for (var k = x0 - h; k < x0 + aw; k += 5 * dpr) { g.moveTo(k, h); g.lineTo(k + h, 0); }
      g.stroke();
      g.restore();
    });
    // zarf (zarf klibin kaynak süresini kapsar; tuval de klibin timeline süresini)
    var ciftler = S.kucult(zarf, w), sw = w / Math.max(1, ciftler.length);
    g.fillStyle = "rgba(203,210,255,.85)";
    for (var i = 0; i < ciftler.length; i++) {
      var yt = y(ciftler[i][1]), yb = y(ciftler[i][0]);
      g.fillRect(i * sw, yt, Math.max(1, sw), Math.max(dpr, yb - yt));
    }
    // eşik çizgisi (kesikli)
    var ye = Math.round(y(ayarlar().esik)) + 0.5;
    g.save();
    if (g.setLineDash) g.setLineDash([4 * dpr, 3 * dpr]);
    g.strokeStyle = "#eac877"; g.lineWidth = dpr;
    g.beginPath(); g.moveTo(0, ye); g.lineTo(w, ye); g.stroke();
    g.restore();
  }

  function renderList() {
    var box = el("cut-ranges");
    box.innerHTML = "";
    ranges.forEach(function (r, i) {
      var row = document.createElement("div");
      row.className = "seg cut-seg" + (r.keep ? "" : " off");

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = r.keep;
      cb.onchange = function () { kararVer(r, cb.checked); };

      var t = document.createElement("span");
      t.className = "seg-time mono";
      t.textContent = zamanGoster(r.start);

      var d = document.createElement("span");
      d.className = "mc-cut-length";
      d.textContent = "−" + (r.end - r.start).toFixed(2) + " sn";

      row.appendChild(cb); row.appendChild(t); row.appendChild(d);
      if (r.birlesik) {
        var b = document.createElement("span");
        b.className = "mc-birlesik";
        // #cut-ranges kullanıcı içeriği kabı (i18n): rozet arayüz metni, adacık olarak işaretle
        b.setAttribute("data-i18n-ui", "");
        b.textContent = "birleşik";
        b.title = "Min. konuşma: araya giren kısa konuşma da bu kesime katıldı";
        row.appendChild(b);
      }
      box.appendChild(row);
    });
  }

  function updateSummary() {
    var act = activeRanges();
    var saved = act.reduce(function (a, r) { return a + (r.end - r.start); }, 0);
    var dur = clip ? (clip.outPoint - clip.inPoint) : 0;
    var birlesik = act.filter(function (r) { return r.birlesik; }).length;
    el("cut-summary").textContent = act.length + " kesim · −" + saved.toFixed(1) + " sn" +
      (dur > 0 ? " (%" + (saved / dur * 100).toFixed(0) + ")" : "") +
      (birlesik ? " · " + birlesik + " birleşik" : "");
    // korunan video katmanı ripple'da geride kalır: yalnız "Boşluk bırakarak uygula" açık
    el("cut-apply").disabled = act.length === 0 || busy || uygulaniyor || videoRippleEngeli();
  }

  // Eski akışın ham silencedetect aralıkları ekrandaki ayarla (eşik + min. sessizlik) koşmuşsa onlar
  // (ffmpeg hatayla bitip yarım sonuç verdiyse de: kısmi uyarısıyla gösterilen buydu, 3.3 de bunu uygulardı)
  function hamGecerli(a) {
    if (!hamSessizlik) return null;
    return String(hamSessizlik.noise) === String(a.noise) && hamSessizlik.minSil === a.minSil ? hamSessizlik.liste : null;
  }

  /*
   * Uygula öncesi doğrulama (3.4): ffmpeg silencedetect son ayarlarla BİR KEZ koşar (eski akışla
   * birebir aynı kesimler); kullanıcının kararları (kapatilanlar) kararEsle ile eşlenir. Aynı ayarla
   * zaten koştuysa (önbellek ya da eski akışın ham aralıkları) yeniden koşmaz. Döner: aralıklar | null
   * (iptal / hata, durum yazıldı). Doğrulama ffmpeg hatasıyla biterse önizlemedeki (zarf) aralıklar
   * kullanılır ve günlüğe yazılır.
   */
  async function kesimleriDogrula() {
    var a = ayarlar(), benimKlip = clip;
    var ham = sdOnbellek[sdAnahtar(a)] || hamGecerli(a);
    if (!ham) {
      var ff = await K.findFfmpeg();
      if (!ff) { status("✕ ffmpeg bulunamadı — Ayarlar sekmesinden kur.", "bad"); return null; }
      busy = true;
      iptalJetonu = K.iptalJetonu ? K.iptalJetonu() : null;
      var jeton = iptalJetonu;
      setBusy(true);
      try {
        status("Kesimler doğrulanıyor… (" + a.dur.toFixed(0) + " sn)");
        var res = await sessizlikBul(ff, a, jeton);
        if (res.iptal) { status("İptal edildi.", "warn"); return null; }
        if (clip !== benimKlip) return null;
        var sil = parseSilence(res.stderr || "");
        K.log("[kesim] dogrulama ffmpeg kod=" + res.code + " ham aralik=" + sil.length + " esik=" + a.noise + "dB");
        if (res.code !== 0) {
          if (zarf) {
            K.log("[kesim] dogrulama tamamlanamadi: onizlemedeki kesimler uygulaniyor");
            return ranges.slice();
          }
          throw new Error("ses analizi başarısız: " +
            String(res.stderr || "").split("\n").filter(function (s) { return s.trim(); }).slice(-2).join(" ").slice(0, 180));
        }
        ham = sil;
        sdOnbellek[sdAnahtar(a)] = sil;
      } catch (e) {
        status("✕ " + e.message, "bad");
        return null;
      } finally {
        busy = false;
        iptalJetonu = null;
        setBusy(false);
      }
    }
    if (!clip || clip !== benimKlip) return null;
    var eslenmis = S.kararEsle(kapatilanlar, sekansaCevir(S.kesimlereCevir(ham, kesimAyari(a))));
    K.log("[kesim] dogrulama: onizleme=" + ranges.length + " silencedetect=" + eslenmis.length);
    ranges = eslenmis;
    render();
    return ranges;
  }

  /* ---------------- Uygulama ---------------- */

  // ek.cloneFirst === true (Yapay zekâ köprüsü): kopya sekans zorunlu, açık seçenekle. Köprü paylaşılan
  // "target"a yazmaz: kesim sürerken kullanıcının hedef düğmesiyle seçtiği değer ezilmez.
  // Düğmenin tık olayı (Event) cloneFirst taşımaz: o an seçili hedef geçerli.
  async function apply(ek) {
    var kopyaZorunlu = !!(ek && ek.cloneFirst === true);
    var hedef = kopyaZorunlu ? "clone" : target;
    // "Boşluk bırakarak uygula" isteği kapıdan ÖNCE alınır: kapı lisans / deneme penceresi açıp vazgeçilirse sonraki
    // düz Kesimleri uygula tıkı boşluk moduna dönmesin
    var bosluk = zorlaBosluk;
    zorlaBosluk = false;
    var yeniden = kopyaZorunlu ? function () { return apply({ cloneFirst: true }); } : (bosluk ? boslukluUygula : apply);
    if (typeof Pro !== "undefined" && !Pro.gate("cut", { deneme: true, yeniden: yeniden })) return; // Pro: otomatik kesim
    if (busy || uygulaniyor || !clip || activeRanges().length === 0) return;
    // Korunan video katmanı ripple'da kaymaz (senkron bozulur): düz Uygula kapalı, boşluk modu önerilir
    if (!bosluk && etkinMod(hedef) === "ripple" && videoRippleEngeli(etkinMod(hedef))) {
      status("Korunan video katmanı Ripple'da kaymaz: Boşluk bırakarak uygula ya da korumayı kaldır.", "warn");
      return;
    }
    /*
     * Doğrulamadan KS_applyCuts dönene dek kilitli (uygulaniyor): kaydırıcı, Otomatik, kesim tıklaması ve
     * bağlam değişimi haritayı değiştirip "Kesimleri uygula"yı yeniden açamaz; ikinci tık geri döner.
     */
    uygulaniyor = true;
    el("cut-apply").disabled = true;
    var r = null;
    try {
      sesiKapat();
      farkUyarisi = false;
      var sade = function (k) { return { start: k.start, end: k.end }; };
      // 3.4: önizleme zarftan; uygulanan kesimler silencedetect doğrulamasından
      var onizleme = activeRanges().map(sade);
      var dogru = await kesimleriDogrula();
      if (!dogru) return;
      var act = dogru.filter(function (k) { return k.keep; }).map(sade);
      if (act.length === 0) {
        status("Doğrulamadan sonra uygulanacak kesim kalmadı — eşiği ya da min. sessizliği değiştir.", "warn");
        return;
      }
      /*
       * Doğrulama önizlemeden (dinlenen / haritada görülen) farklı kesim verdiyse sormadan uygulama:
       * doğrulanmış küme haritada (kesimleriDogrula çizdi), kullanıcı kontrol edip yeniden Uygula'ya basar;
       * ikinci tık doğrulama önbelleğinden gelir, ffmpeg yeniden koşmaz. (Sayı farkı ya da > 50 ms kenar kayması.)
       */
      if (!S.kesimlerAyni(onizleme, act)) {
        K.log("[kesim] dogrulama onizlemeden farkli: onizleme=" + onizleme.length + " dogrulama=" + act.length + " — uygulanmadi");
        status("Doğrulama kesimleri değiştirdi (önizleme " + onizleme.length + " kesim, doğrulama " + act.length +
          " kesim): haritayı kontrol et, sonra yeniden Kesimleri uygula.", "warn");
        farkUyarisi = true;
        return;
      }
      /*
       * Bu oturumda düzen okunmuştu ama şimdi yok (başka sekansa geçildi, analizdeki okuma başarısız oldu): korunan
       * katmanlar bilinmeden KS_applyCuts korumasız giderdi. Önce yeniden okunur; okunamazsa ve son düzende korunan
       * katman varsa uygulanmaz.
       */
      if (!katman && secImza !== null) {
        var korKlip = clip;
        status("Katmanlar okunuyor…");
        await katmanlariOku({ start: clip.clipStart, end: clip.clipEnd });
        if (!clip || clip !== korKlip) return;
        if (!katman && sonKoruSayisi > 0) {
          status("Katmanlar okunamadı: korunan katmanlar bilinmeden kesim uygulanmaz. Katmanlar › Yenile'ye bas, sonra yeniden Kesimleri uygula.", "warn");
          return;
        }
      }
      status("Uygulanıyor…");
      /*
       * Seçili klip kapsamı: kesimler sekans zamanında (analizdeki clipStart + klip-göreli zaman). Bağlam yoklaması aynı
       * medyanın taşınmasını / kırpılmasını onContext'e bildirmez, yoklama da yalnız panel odaktayken koşar: Premiere'de
       * klibi taşıyıp hemen Uygula'ya basınca kesimler eski konuma (öndeki klibe, konuşmanın ortasına) düşer, deneme hakkı
       * da giderdi. Premiere'e taze sorulur; klip analizdeki yerinde değilse gönderilmez, analiz bırakılır (zarf ve
       * doğrulama önbellekleri kaynağa göre kalır: yeniden Sessizlikleri bul ffmpeg'siz).
       */
      if (!clip.kapsam) {
        var yerKlip = clip;
        var yer = await klipYeriniDenetle(yerKlip);
        if (!clip || clip !== yerKlip) return;
        if (yer === "okunamadi") { status(KLIP_DEGISTI.okunamadi, "bad"); return; }
        if (yer === "degisti") {
          K.log("[kesim] analiz edilen klip tasindi/kirpildi/secim degisti (clipStart " + yerKlip.clipStart + "): KS_applyCuts gonderilmedi");
          sesiKapat();
          analiziBirak();
          status(KLIP_DEGISTI.uygula, "bad");
          return;
        }
      }
      var mode = etkinMod(hedef);
      if (bosluk && mode === "ripple") mode = "gap";
      // esleme: host kesilen sekansı, kareyi ve gerçek ripple kaymasını bildirir (altyazıyı yeni kurguya uyarlamak için)
      var yuk = { ranges: act, removeMode: mode, cloneFirst: hedef === "clone", esleme: true };
      /*
       * Sekans kapsamında sessizlik kliplerin arasındaki boş bölgeye de düşer: hiçbir katmanda klip olmayan kısım her
       * katmanda eşit (0) sayılır, ripple boşluk moduna düşmez (esitKayma). Seçili klipte gönderilmez: protect'siz
       * çağrı 3.3'teki tam kaplama kuralıyla birebir aynı kalır.
       */
      if (clip.kapsam) yuk.esitKayma = true;
      // sekans kapsamı: analiz edilen kurgu değiştiyse host uygulamaz (kod "kurgu")
      if (clip.kapsam && clip.kurguIz) yuk.expectIz = clip.kurguIz;
      // 3.4 adım 7: analiz edilen sekans (kopyadan önce denetlenir) ve korunan katmanlar (yalnız varsa)
      if (analizSeqId) yuk.expectSeqId = analizSeqId;
      var kor = korumaHesapla(mode);
      var korYuk = kor ? S.korumaYuku(kor.koru) : null;
      if (korYuk) yuk.protect = korYuk;
      // protect dizinleri bu düzene göre: host katman sayısı / adları tutmazsa (arada katman eklendi, silindi) uygulamaz
      if (korYuk) yuk.expectTracks = katmanAdlari(katman);
      if (korYuk) K.log("[kesim] korunan katmanlar: " + korYuk.video.map(function (i) { return "V" + (i + 1); })
        .concat(korYuk.audio.map(function (i) { return "A" + (i + 1); })).join(",") + " mod=" + mode);
      // Yuzlerce kesim uygulamak uzun surebilir: zaman asimini genis tut
      r = await K.call("KS_applyCuts", yuk, 900000);
      /*
       * Hiçbir parça silinmedi ya da seçilmedi (host removed 0, selected 0): kesimlerin hepsi kliplerin arasındaki boş
       * bölgelere (sekans kapsamı) ya da kilitli katmanlara denk geldi, timeline değişmedi. "Uygulandı" denmez, deneme
       * hakkı düşmez (hak yalnız gerçekten uygulanan kesimde), altyazı eylemi ve davet anı yok.
       */
      var degismedi = !!(r && r.ok && r.removed === 0 && !r.selected);
      if (degismedi) {
        onbellekleriBosalt();
        analiziBirak();
        status(r.newSeq ? KESIM_YOK.kopya : KESIM_YOK.burada, "warn");
        KApp.toast(r.newSeq ? KESIM_YOK.kopya : KESIM_YOK.burada, "warn");
        K.log("[kesim] KS_applyCuts hicbir parca silmedi/secmedi (" + act.length + " aralik): deneme hakki dusmedi");
      } else if (r.ok) {
        if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("cut", KApp.toast);   // deneme: yalniz basarida
        /*
         * Timeline değişti: önbellekler VE canlı analiz bayat. Zarf / ham aralıklar / harita bırakılır,
         * sonuç gizlenir, "Kesimleri uygula" yeni analize dek kapalı kalır: kaydırıcılar ve Otomatik
         * Uygula'dan önceki çözümlemeden taze görünümlü bir harita kurup eski konumlara ikinci kez
         * kesim uygulatamaz (ripple'dan sonra konuşma silerdi).
         */
        onbellekleriBosalt();
        analiziBirak();
        status("");
        var msg = r.newSeq
          ? "✂ Kopya sekansta uygulandı: " + r.newSeq
          : "✂ " + r.removed + " parça silindi" + (r.selected ? ", " + r.selected + " parça seçildi" : "");
        if (mode === "select") msg = "✂ Kesildi ve seçildi — silmek istersen Shift+Delete";
        // host'un gerçekten koruduğu katman sayısı (geçersiz dizin atılır): istenenden azsa "korunan" denmez, uyarılır
        var korEksik = !!(korYuk && r.protectedSkipped &&
          (Number(r.protectedSkipped.video) < korYuk.video.length || Number(r.protectedSkipped.audio) < korYuk.audio.length));
        if (korYuk && r.protectedSkipped && !korEksik) {
          msg += " · korunan: " + korYuk.video.map(function (i) { return "V" + (i + 1); })
            .concat(korYuk.audio.map(function (i) { return "A" + (i + 1); })).join(", ");
        }
        if (r.protectedChanged || korEksik) {
          /*
           * Premiere bağlı klibi birlikte kesmiş / silmiş olabilir ya da korunan katman bulunamadı. ExtendScript'te
           * geri alma gruplanmaz (her razor / silme ayrı adım): tek Ctrl+Z demek yanıltır. Kopyada özgün sekans sağlam.
           */
          var tur = korEksik ? "eksik" : "degisti";
          status(KORUNAN_UYARI[tur][r.newSeq ? "kopya" : "burada"], "warn");
          KApp.toast(msg, "warn");
        } else if (r.protectedVideoGap) {
          status("⚠ Korunan video katmanı kaymasın diye kesimler boşluk bırakılarak silindi.", "warn");
          KApp.toast(msg + " (boşluk modunda)", "warn");
        } else if (r.rippleFallback) {
          // host, senkron kaybini onlemek icin ripple'i bosluk moduna dusurdu
          status("⚠ Bazı track'ler aralığı tam kaplamıyor — senkron bozulmasın diye kesimler boşluk bırakılarak silindi.", "warn");
          KApp.toast(msg + " (boşluk modunda)", "warn");
        } else {
          KApp.toast(msg, "good");
        }
        // 3.4 adım 8: kesim kaydı; Altyazı sekmesindeki belge bu kurgunun öncesine aitse "Altyazıyı yeni kurguya uyarla"
        // (mod: rippleFallback → boşluk, yoksa uygulanan; Sadece kes + seç'te hiçbir şey silinmedi: eylem yok)
        if (altyaziEylemi) {
          var bag = KApp.ctx() || {};
          try {
            altyaziEylemi.kesimSonrasi(r, { removeMode: mode, kaynak: analizSeqId || String(bag.sequenceId || ""), kaynakAd: String(bag.sequence || ""),
              ranges: act, kare: bag.frame });
          } catch (eA) { K.log("[kesim] altyazi eylemi: " + (eA && eA.message ? eA.message : eA)); }   // kesim zaten uygulandı
        }
        // ilk uygulanan kesim: davet seridinin anlarindan biri (mesgulken/yildiz seridi acikken cikmaz)
        if (KApp.davetAni) KApp.davetAni("cut");
      }
    } finally {
      kilidiAc();
    }
    // hata kilit açıldıktan sonra yazılır (bekleyen kaydırıcı haritayı yeniden kursa da silinmesin)
    if (r && !r.ok) {
      // expectSeqId tutmadı (arada başka sekansa geçildi): hiçbir şey yapılmadı, kopya da açılmadı
      if (r.kod === "sekans") status("✕ Etkin sekans değişti: kesimler uygulanmadı. Analiz edilen sekansı aç ya da Sessizlikleri yeniden bul.", "bad");
      else if (r.kod === "kurgu") {
        // expectIz tutmadı: analizden sonra klipler taşındı / kırpıldı / silindi; hiçbir şey yapılmadı, analiz bırakılır
        sesiKapat();
        analiziBirak();
        status("✕ Sekans analizden sonra değişti (klipler taşındı, kırpıldı ya da silindi): kesimler eski yerlere düşerdi, uygulanmadı. Sessizlikleri yeniden bul.", "bad");
      } else if (r.kod === "katman") {
        /*
         * expectTracks tutmadı: analizden sonra katman eklendi / silindi / yeniden adlandırıldı, korunan dizinler başka
         * katmanı gösterirdi. Hiçbir şey yapılmadı. Düzen yeniden okunur (seçimler öneriye döner), kullanıcı kontrol eder.
         */
        status("✕ Katman düzeni değişti (katman eklendi, silindi ya da yeniden adlandırıldı): kesimler uygulanmadı. Katmanlar yeniden okunuyor: korunanları kontrol et, sonra yeniden Kesimleri uygula.", "bad");
        var det = el("cut-katman");
        if (det) det.open = true;
        katmanlariOku(clip ? { start: clip.clipStart, end: clip.clipEnd } : null);
      } else status("✕ " + r.error, "bad");
    }
    return r;
  }

  /*
   * Kilit açılır: bekleyen kaydırıcı değişimi varsa harita yeni ayarla kurulur (Uygula başarısız / fark /
   * iptal); "Sessizlikleri bul" ve (sonuç görünürse) "Kesimleri uygula" yeniden açılır. Süreç satırı
   * ("Kesimler doğrulanıyor…", "Uygulanıyor…") kalmaz; uyarı ve hata (ör. boşluk modu) silinmez.
   */
  function kilidiAc() {
    if (!uygulaniyor) return;
    uygulaniyor = false;
    var bekleyen = canliBekliyor;
    canliBekliyor = false;
    if (bekleyen && clip && (zarf || hamSessizlik)) yenidenHesapla();
    var ctx = KApp.ctx(), e = el("cut-status");
    el("cut-analyze").disabled = busy || !hazirMi(ctx);
    if (!/warn|bad/.test(e.className)) status(ctx.connected && !hazirMi(ctx) ? hazirDegilMetni() : "");
    if (clip && !el("cut-result").hidden) updateSummary();
    renderUyarilar();
  }

  // Canlı analizi bırak (Uygula'dan sonra): bir sonraki "Sessizlikleri bul" baştan çözümler
  function analiziBirak() {
    if (canliZaman) { clearTimeout(canliZaman); canliZaman = null; }
    canliBekliyor = false;
    zarf = null;
    hamSessizlik = null;
    ranges = [];
    adalar = [];
    kapatilanlar = [];
    farkUyarisi = false;
    clip = null;
    // sekans kapsamının karışımı: timeline değişti, bir sonraki analiz yeniden dışa aktarır
    wavSil();
    el("cut-result").hidden = true;
    render();   // çubuk / liste / dalga boşalır, "Kesimleri uygula" kapanır
  }

  // Premiere'in saniye değerleri (aynı klipte her okumada aynı); yarım milisaniye pay, bir kareden çok küçük
  function ayniZaman(a, b) {
    if (a === b) return true;
    var x = Number(a), y = Number(b);
    return isFinite(x) && isFinite(y) && Math.abs(x - y) < 0.0005;
  }

  /*
   * Seçili klip kapsamı: bağlamdaki seçim analiz edilen klibin kendisi mi — aynı medya, in / out ve sekanstaki yer
   * (clipStart, clipEnd: hız değişimi de). Kesimler ve kararlar sekans zamanında; yer ya da in / out değişince eskidir.
   */
  function klipYerindeMi(sel, c) {
    return !!(sel && c && sel.mediaPath === c.mediaPath && ayniZaman(sel.clipStart, c.clipStart) &&
      ayniZaman(sel.clipEnd, c.clipEnd) && ayniZaman(sel.inPoint, c.inPoint) && ayniZaman(sel.outPoint, c.outPoint));
  }

  /*
   * Uygula'dan hemen önce Premiere'e taze sorulur (KApp.ctx() son yoklamadır, panel odakta değilken hiç yenilenmez).
   * Döner: null (gönderilebilir; sekans yoksa / başka sekans etkinse KS_applyCuts kendisi reddeder: "Etkin sekans
   * değişti", analiz kalır) | "degisti" | "okunamadi".
   */
  async function klipYeriniDenetle(c) {
    var r = null;
    try { r = await K.call("KS_getContext", undefined, 20000); } catch (e) { r = null; }
    if (!r || !r.ok) return "okunamadi";
    if (!r.hasSeq || (analizSeqId && r.sequenceId && String(r.sequenceId) !== analizSeqId)) return null;
    return klipYerindeMi(r.sel, c) ? null : "degisti";
  }

  /* ---------------- Yapay zekâ köprüsü (MCP, 3.4) ---------------- */
  // Düğmelerin aynı işlevleri (aynı kapı, aynı deneme hakkı); kesim HER ZAMAN kopya sekansta
  function durumMetni() { var e = el("cut-status"); return e ? { metin: e.textContent || "", kotu: /\bbad\b/.test(e.className) } : { metin: "", kotu: false }; }
  // Kaydırıcı düğmeyle aynı yoldan: değer + "input" olayı (yanındaki "-38 dB" etiketi de güncellenir)
  function kaydir(id, v, alt, ust) {
    var e = el(id);
    if (!e || typeof v !== "number" || !isFinite(v)) return;
    e.value = String(Math.max(alt, Math.min(ust, v)));
    try { e.dispatchEvent(new Event("input", { bubbles: true })); } catch (er) {}
  }
  async function mcpAnaliz(o) {
    o = o || {};
    // meşgul / klip yokken kaydırıcılara dokunulmaz, önceki analiz ve liste olduğu gibi kalır
    if (busy) return { ok: false, hata: "mesgul", mesaj: "Auto Cut is already running." };
    // 3.4 adım 7: In → Out / Sekans kapsamında seçili klip gerekmez (panelin kapsamı geçerli)
    if (kapsam === "clip" && !KApp.ctx().sel) return { ok: false, hata: "klip_yok", mesaj: "Select a clip on the timeline first." };
    kaydir("cut-noise", o.esik_db, -60, -20);
    kaydir("cut-minsil", o.min_sessizlik, 0.3, 2.5);
    kaydir("cut-pad", o.pay, 0, 0.5);
    var r = await analyze();
    var d = durumMetni();
    var sonuc = r && r.sonuc;
    if (sonuc === "bulundu" || sonuc === "yok") {
      return { ok: true, klip: clip ? clip.name : "", araliklar: ranges.map(function (x) { return { baslangic: x.start, bitis: x.end }; }),
        kismi: !!(r && r.kismi), durum: d.metin };
    }
    if (sonuc === "klip_yok") return { ok: false, hata: "klip_yok", mesaj: "Select a clip on the timeline first." };
    if (sonuc === "iptal") return { ok: false, hata: "iptal", mesaj: "The analysis was cancelled in Suflo." };
    if (sonuc === "mesgul") return { ok: false, hata: "mesgul", mesaj: "Auto Cut is already running." };
    if (sonuc === "pro") return { ok: false, hata: "pro_gerekli", mesaj: "Auto Cut needs Suflo Pro." };
    return { ok: false, hata: "analiz_hatasi", mesaj: (r && r.mesaj) || d.metin || "Not analysed." };
  }
  async function mcpKes() {
    if (!activeRanges().length) return { ok: false, hata: "analiz_yok", mesaj: "Run suflo_sessizlik_analiz first: there are no cut ranges." };
    var r = await apply({ cloneFirst: true });   // kopya sekans zorunlu: özgün sekans hiç bozulmaz
    if (!r) return { ok: false, hata: "uygulanamadi", mesaj: durumMetni().metin || "Not applied." };
    if (!r.ok) return { ok: false, hata: "uygulanamadi", mesaj: r.error || "Not applied." };
    // hiçbir parça silinmedi (kesimler boşluğa / kilitli katmana düştü): "uygulandı" denmez
    if (r.removed === 0 && !r.selected) return { ok: false, hata: "uygulanamadi", mesaj: durumMetni().metin || "Nothing was cut." };
    return { ok: true, kopyaSekans: r.newSeq || "", bosluklu: !!(r.rippleFallback || r.protectedVideoGap) };
  }

  /* ---------------- Dinle (önizleme) ---------------- */

  // Kesimler uygulanmis gibi sesi panelde cal (ortak oynatici: js/dinle.js)
  var oynatici = window.KDinle ? window.KDinle("cut-audio") : null;
  function sesiKapat() { if (oynatici) oynatici.kapat(); }

  async function dinle() {
    if (!clip || !window.SufloTextCut || !oynatici) return;
    var btn = el("cut-dinle");
    btn.disabled = true;
    // özgün Türkçe etiket: iş sürerken arayüz dili değişse de doğru dile döner (çevirmen çevirir)
    var eski = window.SufloI18n && SufloI18n.orig ? SufloI18n.orig(btn) : btn.textContent;
    btn.textContent = "Hazırlanıyor…";
    var benimKlip = clip;
    try {
      var dur = clip.outPoint - clip.inPoint;
      var r = await oynatici.cal({
        mediaPath: clip.mediaPath, inPoint: clip.inPoint, dur: dur, cuts: activeRanges(),
        clip: { clipStart: clip.clipStart, clipEnd: clip.clipEnd, dur: dur },
        gecerli: function () { return clip === benimKlip; }
      });
      if (r.ok && r.kisaltildi) status("Uzun klip: ilk " + Math.round(oynatici.MAX_SN / 60) + " dakika dinletiliyor.");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      btn.disabled = false;
      btn.textContent = eski;
    }
  }

  /* ---------------- Başlat ---------------- */

  function init() {
    function bindRange(id, valId, suffix) {
      var inp = el(id), out = el(valId);
      inp.addEventListener("input", function () { out.textContent = inp.value + suffix; });
    }
    bindRange("cut-noise", "cut-noise-val", " dB");
    bindRange("cut-minsil", "cut-minsil-val", " sn");
    bindRange("cut-pad", "cut-pad-val", " sn");
    if (el("cut-minkeep")) bindRange("cut-minkeep", "cut-minkeep-val", " sn");
    // 3.4 canlı eşik: analizden sonra kaydırıcılar haritayı ffmpeg'siz günceller
    ["cut-noise", "cut-minsil", "cut-pad", "cut-minkeep"].forEach(function (id) {
      if (el(id)) el(id).addEventListener("input", canliGuncelle);
    });
    if (el("cut-noise-auto")) el("cut-noise-auto").addEventListener("click", otomatikEsik);
    // panel genişliği değişince dalga yeniden çizilsin (tuval piksel boyu)
    window.addEventListener("resize", function () { if (zarf && !el("cut-result").hidden) renderWave(); });

    Array.prototype.forEach.call(el("cut-target").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("cut-target").querySelectorAll("button"), function (x) {
          x.classList.remove("on");
        });
        b.classList.add("on");
        target = b.dataset.m;
        el("cut-here-row").hidden = target !== "here";
        // yöntem değişti: korunan video + ripple uyarısı ve Kesimleri uygula yeniden değerlendirilir
        if (clip && !el("cut-result").hidden) updateSummary();
        renderUyarilar();
      });
    });
    if (el("cut-mode")) el("cut-mode").addEventListener("change", function () {
      if (clip && !el("cut-result").hidden) updateSummary();
      renderUyarilar();
    });

    // 3.4 adım 7: kapsam (Seçili klip | In → Out | Sekans) ve katman çipleri
    if (el("cut-scope")) {
      Array.prototype.forEach.call(el("cut-scope").querySelectorAll("button"), function (b) {
        b.addEventListener("click", function () { kapsamSec(b.dataset.s); });
      });
    }
    var det = el("cut-katman");
    if (det) {
      // Katmanlar bölümü açılınca (kullanıcı eylemi) düzen okunur; panel açılışında Premiere'e gidilmez
      det.addEventListener("toggle", function () { if (det.open && !katman && !katmanOkunuyor) katmanlariOku(); });
    }
    if (el("cut-katman-yenile")) el("cut-katman-yenile").addEventListener("click", function () {
      if (busy || uygulaniyor) return;
      katmanlariOku(clip ? { start: clip.clipStart, end: clip.clipEnd } : null);
    });
    // panel kapanırken sekans karışımı kalmasın (kalırsa bridge.sweepTemp 24 saat sonra süpürür)
    window.addEventListener("unload", wavSil);
    renderKatmanlar();

    el("cut-analyze").addEventListener("click", analyze);
    if (el("cut-cancel")) el("cut-cancel").addEventListener("click", iptalEt);
    if (window.KKesimAltyazi && el("cut-altyazi")) {
      altyaziEylemi = window.KKesimAltyazi({ kutu: "cut-altyazi", metin: "cut-altyazi-metin", uyarla: "cut-altyazi-uyarla" });
    }
    el("cut-apply").addEventListener("click", apply);
    if (el("cut-dinle")) el("cut-dinle").addEventListener("click", dinle);

    KApp.onContext(function (ctx) {
      refreshButton();
      /*
       * Başka sekansa geçildi: okunan katman düzeni o sekansın değil, düşer (bir sonraki okuma yeni sekanstan). Seçimler
       * (secDinle / secKoru) DÜŞMEZ: katman imzasına (secImza) bağlıdır, yeni düzen aynı imzayı taşıyorsa sürer
       * (katmanOkuIc). Kopya sekansta Uygula kopyayı etkin yapar: burada silinirse ikinci geçiş korumasız giderdi.
       */
      if (katman && ctx.sequenceId && String(ctx.sequenceId) !== String(katman.seqId)) {
        katman = null; katmanCiftleri = []; katmanKapsam = null;
        renderKatmanlar();
        renderUyarilar();
      } else if (!katman && !katmanOkunuyor && katmanBolumuAcik()) {
        // bölüm açık, düzen yok: sekans açılınca / kapanınca ipucu tazelensin (Premiere'e gidilmez; Sessizlikleri bul okur)
        renderKatmanlar();
      }
      // seçim değiştiyse eski analiz geçersiz (sekans kapsamında: sekans değiştiyse / kapandıysa)
      var gecersiz = clip && (clip.kapsam
        ? (!ctx.hasSeq || (ctx.sequenceId && clip.seqId && String(ctx.sequenceId) !== String(clip.seqId)))
        : !klipYerindeMi(ctx.sel, clip));
      if (gecersiz) {
        el("cut-result").hidden = true;
        sesiKapat();
        wavSil();
        ranges = [];
        adalar = [];
        kapatilanlar = [];
        farkUyarisi = false;
        clip = null;
        // 3.4: klip değişti → zarf ve doğrulama önbelleği geçersiz
        zarf = null;
        hamSessizlik = null;
        onbellekleriBosalt();
      }
    });
    /*
     * Her yoklamada (app.js onPoll; onContext yalnız medya / seçim sayısı / sekans değişince gelir): seçili klip kapsamında
     * analiz edilen klip aynı medyayla taşındı / kırpıldıysa harita ve kaydırıcıların kurduğu kesimler eski konumda.
     * Analiz bırakılır, nedeni söylenir; zarf ve doğrulama önbellekleri kaynağa göre kalır (yeniden bulmak ffmpeg'siz).
     * Yoklama panel odakta değilken koşmaz: Uygula ayrıca Premiere'e taze sorar (klipYeriniDenetle). Analiz ya da Uygula
     * sürerken bırakılmaz: süren çözümlemenin zarfı önbelleğe girsin (bir sonraki yoklama bırakır, yeniden bulmak anında),
     * Uygula'yı kendi taze denetimi durdurur.
     */
    if (KApp.onPoll) KApp.onPoll(function (ctx) {
      if (busy || uygulaniyor) return;
      if (!clip || clip.kapsam || !ctx || !ctx.sel || klipYerindeMi(ctx.sel, clip)) return;
      // seçim kalktı / başka sekans: onContext'in işi (yukarıda); burada yalnız aynı medyanın yeri / in / out'u değişti
      if (ctx.sel.mediaPath !== clip.mediaPath) return;
      if (analizSeqId && ctx.sequenceId && String(ctx.sequenceId) !== analizSeqId) return;
      K.log("[kesim] analiz edilen klip tasindi/kirpildi (clipStart " + clip.clipStart + " -> " + ctx.sel.clipStart + "): analiz birakildi");
      sesiKapat();
      analiziBirak();
      status(KLIP_DEGISTI.harita, "warn");
    });
    refreshButton();
  }

  function onbellekleriBosalt() {
    if (zarfOnbellek) zarfOnbellek.temizle();
    sdOnbellek = {};
    sonAnahtar = "";
    sonKonum = "";
  }

  return { init: init, mcpAnaliz: mcpAnaliz, mcpKes: mcpKes };
})();
