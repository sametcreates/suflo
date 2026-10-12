/*
 * Suflo — yerel motor (whisper-cli) argümanları (saf, DOM'suz, durumsuz modül)
 *
 * KEngine.buildArgs bu modüle devreder; yol argümanlarını ASCII-güvenli eşdeğerlerine çeviren
 * kanca (K.guvenliYol, issue #7) o.yol olarak gelir. Seçenekler (3.2 adım 5):
 *
 *   cozme   "dogru" (varsayılan, bugünkü davranış: beam search -bs 5)
 *           "hizli" (açgözlü çözme: -bs 1 -bo 1). Sıcaklık geri dönüşü whisper'da açık kalır
 *           (-nf verilmez): takılan pencere yine yüksek sıcaklıkla yeniden çözülür.
 *           Varsayılan, Türkçe kıyas (stüdyo / telefon / gürültülü; CPU ve CUDA; turbo ve large;
 *           gerçek zaman çarpanı ve WER) yapılana dek "dogru" kalır: tools/motor-kiyas.js.
 *   dtw     true: hassas kelime zamanı. Model kimliği whisper.cpp'nin hizalama başlığı ön ayarına
 *           eşlenir (tiny, base, small, large.v3.turbo, large.v3) ve "-dtw <ön ayar> -nfa" eklenir:
 *           v1.9.1 flash attention açıkken DTW'yi sessizce kapatır (src/whisper.cpp:3709) ve
 *           flash attention orada varsayılan olarak açıktır. Ön ayarı bilinmeyen modelde eklenmez.
 *   cevir   true: "-tr" (çevrimdışı İngilizce çeviri). Yalnız Small ve Large: Turbo çeviri için
 *           eğitilmedi, Tiny/Base'in çevirisi kullanılamayacak kadar zayıf. Başka modelde eklenmez
 *           (cevirebilir() ile önceden sorulur).
 *
 * Bayrak başvurusu whisper.cpp v1.9.1 examples/cli/cli.cpp. Raunen'den (MIT) yalnız fikir: çözme
 * bayraklarını açmak; kod Suflo'nun kendi, taşınmadı (Raunen'in DTW yolu -nfa vermiyor ve t_dtw okumuyor).
 * Çalışma ortamı: CEF 74 / Node 12 (ES5).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloWhisperArgs = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var VARSAYILAN_COZME = "dogru";
  var COZME = {
    dogru: { bayrak: ["-bs", "5"], ad: "En doğru", ozet: "beam search, -bs 5" },
    hizli: { bayrak: ["-bs", "1", "-bo", "1"], ad: "Hızlı", ozet: "açgözlü, -bs 1 -bo 1" }
  };
  // Suflo model kimliği -> whisper.cpp -dtw ön ayarı (examples/cli/cli.cpp, WHISPER_AHEADS_*)
  var DTW_ON_AYAR = { tiny: "tiny", base: "base", small: "small", turbo: "large.v3.turbo", large: "large.v3" };
  var CEVIRI_MODELLERI = ["small", "large"];
  var ISTEM_SINIRI = 700;

  function sahip(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function cozmeModu(x) {
    var m = String(x == null ? "" : x).toLowerCase();
    return sahip(COZME, m) ? m : VARSAYILAN_COZME;
  }

  function cozmeBayraklari(mod) { return COZME[cozmeModu(mod)].bayrak.slice(); }

  /*
   * Model kimliği: Suflo kimliği ("turbo") ya da model dosyası / yolu ("…/ggml-large-v3-turbo-q5_0.bin").
   * Yalnız İngilizce modeller (.en), large-v1/v2 ve bilinmeyen dosyalar "" döner: onlar için ne DTW
   * ön ayarı ne çeviri seçilir (yanlış hizalama başlıklarıyla çalışmaktansa hiç çalışmamak).
   */
  function modelKimligi(x) {
    var s = String(x == null ? "" : x);
    if (sahip(DTW_ON_AYAR, s)) return s;
    var ad = s.replace(/^.*[\\\/]/, "").toLowerCase();
    if (!ad) return "";
    if (/(^|[-_.])en([-_.]|$)/.test(ad.replace(/\.bin$/, ""))) return "";
    if (/large-v3-turbo|large-turbo|turbo/.test(ad)) return "turbo";
    if (/large-v3(?![\w-]*turbo)/.test(ad)) return "large";
    if (/large/.test(ad)) return "";
    if (/medium/.test(ad)) return "";
    if (/small/.test(ad)) return "small";
    if (/base/.test(ad)) return "base";
    if (/tiny/.test(ad)) return "tiny";
    return "";
  }

  function dtwOnAyari(model) {
    var id = modelKimligi(model);
    return sahip(DTW_ON_AYAR, id) ? DTW_ON_AYAR[id] : "";
  }

  function cevirebilir(model) { return CEVIRI_MODELLERI.indexOf(modelKimligi(model)) !== -1; }

  function kimlik(p) { return p; }

  /*
   * Gerçekte uygulanacak seçenekler (günlük, Doctor ve çağıranın kararı için):
   *   { cozme, dtw: ön ayar | "", cevir: bool, ceviriReddi: bool (istendi ama model desteklemiyor),
   *     dtwReddi: bool (istendi ama ön ayar yok ya da -ml 1 yedeği) }
   * Model kimliği o.modelId'den, yoksa o.model dosya adından okunur.
   */
  function secenekler(o) {
    o = o || {};
    var id = modelKimligi(o.modelId || o.model);
    var dtw = "", dtwReddi = false;
    if (o.dtw === true) {
      // -ml 1 -sow yedeği belirteç zamanı yazmayan ESKİ derlemeler içindir: DTW'yi de tanımazlar
      dtw = o.kelimeYedegi ? "" : (sahip(DTW_ON_AYAR, id) ? DTW_ON_AYAR[id] : "");
      dtwReddi = !dtw;
    }
    var cevir = o.cevir === true && CEVIRI_MODELLERI.indexOf(id) !== -1;
    return {
      cozme: cozmeModu(o.cozme), modelId: id, dtw: dtw, dtwReddi: dtwReddi,
      cevir: cevir, ceviriReddi: o.cevir === true && !cevir
    };
  }

  /*
   * whisper-cli argümanları (string[]). Sıra bugünküyle aynı kalır: -m -f -l -ojf -of -t -pp,
   * çözme bayrakları, --prompt, VAD, -ml 1 -sow yedeği, DTW, -tr.
   *   o.model, o.audio, o.outBase  yollar (o.yol(p, "girdi" | "cikti") ile çevrilir)
   *   o.vad      Silero VAD modelinin yolu ("" / null: VAD yok)
   *   o.lang     dil kodu ("" / null: "auto")
   *   o.threads  iş parçacığı (varsayılan 4)
   *   o.prompt   ilk çözme ipucu (en çok 700 karakter)
   *   o.kelimeYedegi  eski derleme yedeği: -ml 1 -sow
   *   o.cozme, o.dtw, o.cevir, o.modelId  yukarıdaki seçenekler
   */
  function olustur(o) {
    o = o || {};
    var G = typeof o.yol === "function" ? o.yol : kimlik;
    var s = secenekler(o);
    var args = [
      "-m", G(o.model, "girdi"),
      "-f", G(o.audio, "girdi"),
      "-l", o.lang || "auto",
      "-ojf", "-of", G(o.outBase, "cikti"),
      "-t", String(o.threads || 4),
      "-pp"
    ].concat(cozmeBayraklari(s.cozme));

    // Proje sözlüğündeki doğru marka/kişi adları ilk çözme geçişine yön verir
    if (o.prompt) args.push("--prompt", String(o.prompt).slice(0, ISTEM_SINIRI));

    // VAD: sessizlikleri atla. -vp ve -vsd MİLİSANİYE (whisper-cli varsayılanları 30 / 100):
    // 500 ms altındaki sessizlikte segment bölme, konuşma sınırlarına 250 ms tampon
    if (o.vad) args.push("--vad", "-vm", G(o.vad, "girdi"), "-vsd", "500", "-vp", "250");

    if (o.kelimeYedegi) args.push("-ml", "1", "-sow");
    if (s.dtw) args.push("-dtw", s.dtw, "-nfa");
    if (s.cevir) args.push("-tr");
    return args;
  }

  // Günlük satırının gövdesi: "cozme=hizli (açgözlü, -bs 1 -bo 1), dtw=large.v3.turbo, ceviri=en"
  function gunlukMetni(o) {
    var s = secenekler(o);
    var parca = ["cozme=" + s.cozme + " (" + COZME[s.cozme].ozet + ")"];
    parca.push("dtw=" + (s.dtw || (o && o.dtw === true ? "yok (" + (s.modelId || "bilinmeyen model") + ")" : "kapali")));
    if (o && o.cevir === true) parca.push("ceviri=" + (s.cevir ? "en" : "reddedildi (" + (s.modelId || "bilinmeyen model") + ")"));
    return parca.join(", ");
  }

  /*
   * whisper-cli tanımadığı bayrakta "error: unknown argument: -nfa" yazar, kullanımı basar ve
   * KOD 0 ile çıkar (JSON yok). Döner: tanınmayan bayrak ("" = yok).
   */
  function bilinmeyenBayrak(stderr) {
    var m = /error:\s*unknown argument:\s*(\S+)/i.exec(String(stderr == null ? "" : stderr));
    return m ? m[1] : "";
  }

  // "error: unknown DTW preset 'large.v3.turbo'" (ön ayarı bilmeyen eski derleme)
  function bilinmeyenOnAyar(stderr) {
    var m = /unknown DTW preset\s*'([^']*)'/i.exec(String(stderr == null ? "" : stderr));
    return m ? m[1] : "";
  }

  /*
   * "whisper-cli -h" çıktısından desteklenen bayraklar. okundu false: yardım metni tanınmadı
   * (eski / farklı ikili); o zaman çağıran desteği bilinmiyor saymalı.
   */
  function yardimDestegi(metin) {
    var t = String(metin == null ? "" : metin);
    var var_ = function (re) { return re.test(t); };
    var okundu = var_(/--beam-size|--model\b|usage:/i);
    return {
      okundu: okundu,
      dtw: var_(/(^|\s)-dtw\b|--dtw\b/),
      nfa: var_(/(^|\s)-nfa\b|--no-flash-attn\b/),
      tr: var_(/(^|\s)-tr\b|--translate\b/),
      bo: var_(/(^|\s)-bo\b|--best-of\b/)
    };
  }

  // Otomatik DTW kapatma kaydının anahtarı: model + motor derlemesi (CPU/CUDA/Metal ayrı denenir)
  function dtwAnahtari(model, derleme) {
    var id = modelKimligi(model) || "bilinmeyen";
    return id + "@" + (String(derleme || "") || "cpu");
  }

  /*
   * -ojf çıktısındaki DTW sonucu (SufloWhisperWords.segmentleriCoz bilgisi): { toplam, olculen }
   *   "yok"      t_dtw alanı hiç yok (eski derleme ya da DTW istenmedi)
   *   "kapali"   alan var, hepsi -1: motor DTW'yi kapattı (flash attention, desteklenmeyen model)
   *   "calisti"  en az bir belirteçte t_dtw ≥ 0
   */
  function dtwSonucu(d) {
    d = d || {};
    var toplam = Number(d.toplam) || 0, olculen = Number(d.olculen) || 0;
    if (toplam <= 0) return "yok";
    return olculen > 0 ? "calisti" : "kapali";
  }

  /*
   * Doctor satırları (Altyazı motoru grubu). Girdi:
   *   { cozme, dtwAyar (bool), model (kimlik ya da dosya), derleme, dtwKapali ({ anahtar: neden }),
   *     yardim (yardimDestegi() sonucu ya da null) }
   * Döner: [{ status, title, detail }]
   */
  function doctorSatirlari(d) {
    d = d || {};
    var mod = cozmeModu(d.cozme);
    var satirlar = [{
      status: "good", title: "Çözme modu",
      detail: mod === "hizli" ? "Hızlı · açgözlü çözme (-bs 1 -bo 1)" : "En doğru · beam search (-bs 5)"
    }];
    var onAyar = dtwOnAyari(d.model);
    var y = d.yardim || null;
    var kapali = d.dtwKapali && typeof d.dtwKapali === "object" ? d.dtwKapali : {};
    var anahtar = dtwAnahtari(d.model, d.derleme);
    var dtw;
    if (y && y.okundu && !(y.dtw && y.nfa)) {
      dtw = { status: "warn", detail: "Bu motor derlemesi -dtw / -nfa tanımıyor · kelime zamanı belirteç zamanından gelir" };
    } else if (!onAyar) {
      dtw = { status: "warn", detail: "Bu model için DTW ön ayarı yok · kelime zamanı belirteç zamanından gelir" };
    } else if (sahip(kapali, anahtar)) {
      dtw = { status: "warn", detail: "Bu model ve derlemede DTW zamanı gelmedi, otomatik kapatıldı (" + onAyar + ")" };
    } else {
      dtw = { status: "good", detail: (d.dtwAyar ? "Açık" : "Kapalı") + " · desteklenir (" + onAyar + ")" };
    }
    satirlar.push({ status: dtw.status, title: "Hassas kelime zamanlaması (DTW)", detail: dtw.detail });
    return satirlar;
  }

  return {
    VARSAYILAN_COZME: VARSAYILAN_COZME,
    COZME_MODLARI: ["dogru", "hizli"],
    DTW_ON_AYAR: (function () { var o = {}; for (var k in DTW_ON_AYAR) if (sahip(DTW_ON_AYAR, k)) o[k] = DTW_ON_AYAR[k]; return o; })(),
    CEVIRI_MODELLERI: CEVIRI_MODELLERI.slice(),
    cozmeModu: cozmeModu,
    cozmeBayraklari: cozmeBayraklari,
    modelKimligi: modelKimligi,
    dtwOnAyari: dtwOnAyari,
    cevirebilir: cevirebilir,
    secenekler: secenekler,
    olustur: olustur,
    gunlukMetni: gunlukMetni,
    bilinmeyenBayrak: bilinmeyenBayrak,
    bilinmeyenOnAyar: bilinmeyenOnAyar,
    yardimDestegi: yardimDestegi,
    dtwAnahtari: dtwAnahtari,
    dtwSonucu: dtwSonucu,
    doctorSatirlari: doctorSatirlari
  };
});
