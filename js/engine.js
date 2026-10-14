/*
 * Suflo — yerel motor katmanı
 * Model kataloğu, GPU tespiti, dayanıklı kurulum (resume + ayna + boyut denetimi).
 * Panelin geri kalanı yalnızca KEngine üzerinden konuşur.
 */
window.KEngine = (function () {
  "use strict";

  /* ---------------- Katalog ---------------- */

  // Aynı dosya için birden fazla kaynak: ilki düşerse sıradakine geçilir.
  function hfUrls(file) {
    return [
      "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/" + file,
      "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/" + file
    ];
  }

  var MODELS = [
    {
      id: "tiny",
      file: "ggml-tiny-q5_1.bin",
      urls: hfUrls("ggml-tiny-q5_1.bin"),
      sizeMB: 32,
      label: "Tiny — en hızlı, kaba",
      note: "zayıf bilgisayar, hızlı taslak"
    },
    {
      id: "base",
      file: "ggml-base-q5_1.bin",
      urls: hfUrls("ggml-base-q5_1.bin"),
      sizeMB: 60,
      label: "Base — hızlı",
      note: "kısa videolar, hızlı iş"
    },
    {
      id: "small",
      file: "ggml-small-q5_1.bin",
      urls: hfUrls("ggml-small-q5_1.bin"),
      sizeMB: 190,
      label: "Small — dengeli",
      note: "günlük kullanım"
    },
    {
      id: "turbo",
      file: "ggml-large-v3-turbo-q5_0.bin",
      urls: hfUrls("ggml-large-v3-turbo-q5_0.bin"),
      sizeMB: 574,
      label: "Turbo — önerilen",
      note: "hız/doğruluk dengesi en iyi",
      recommended: true
    },
    {
      id: "large",
      file: "ggml-large-v3-q5_0.bin",
      urls: hfUrls("ggml-large-v3-q5_0.bin"),
      sizeMB: 1080,
      label: "Large v3 — en doğru",
      note: "Türkçe'de en iyi sonuç, yavaş"
    }
  ];

  var VAD = {
    file: "ggml-silero-v5.1.2.bin",
    urls: [
      "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin",
      "https://hf-mirror.com/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin"
    ],
    sizeMB: 2
  };

  var BUILDS = {
    cpu: {
      id: "cpu",
      urls: ["https://github.com/ggerganov/whisper.cpp/releases/download/v1.9.1/whisper-blas-bin-x64.zip"],
      sizeMB: 20,
      label: "CPU (BLAS)"
    },
    cuda: {
      id: "cuda",
      urls: ["https://github.com/ggerganov/whisper.cpp/releases/download/v1.9.1/whisper-cublas-12.4.0-bin-x64.zip"],
      sizeMB: 646,
      label: "NVIDIA GPU (cuBLAS)"
    }
  };

  /* ---------------- Model bütünlüğü ---------------- */

  /*
   * Modeller yalnız boyutla denetleniyordu: kesik/bozuk ya da ayna tarafından
   * değiştirilmiş dosya "kurulu" sayılabilirdi. HuggingFace'in herkese açık
   * dosya ağacı API'si her LFS dosyasının SHA-256'sını (lfs.oid) verir; indirme
   * bitince dosya onunla karşılaştırılır. API'ye ulaşılamazsa (kurumsal ağ)
   * boyut denetimiyle devam edilir — kurulum engellenmez.
   */
  var HF_AGAC = {};
  var HF_OZET_ZAMAN_ASIMI = 15000;

  function hfDepo(item) {
    var u = (item.urls || [])[0] || "";
    var m = /huggingface\.co\/([^\/]+\/[^\/]+)\/resolve\/main\//.exec(u);
    return m ? m[1] : "";
  }

  // Ağaç yanıtından dosyanın beklenen SHA-256'sı ("" = bilinmiyor)
  function hfBeklenenOzet(agac, dosya) {
    if (!Array.isArray(agac)) return "";
    for (var i = 0; i < agac.length; i++) {
      var e = agac[i];
      if (e && e.path === dosya && e.lfs && /^[0-9a-f]{64}$/i.test(String(e.lfs.oid || ""))) return String(e.lfs.oid).toLowerCase();
    }
    return "";
  }

  async function hfOzetGetir(item) {
    var depo = hfDepo(item);
    if (!depo || !item.file) return "";
    if (!HF_AGAC[depo]) {
      // Yalniz huggingface.co: dosya aynadan indiyse ozeti de aynadan almak, degistirilmis
      // bir aynanin kendi dosyasini onaylamasi olurdu. Ulasilamazsa "bilinmiyor".
      try {
        // 3.4 adım 19: duvar saati sınırı (çevrimdışı içe aktarmada bağlantı aşaması 21-75 sn askıda
        // kalmasın) ve kullanıcının başlattığı iş olduğu için kurumsal HTTPS denetiminde sistem kökleri
        var r = await K.httpGet("https://huggingface.co/api/models/" + depo + "/tree/main", { "Accept": "application/json" },
          { timeout: HF_OZET_ZAMAN_ASIMI, sistemKokleri: true });
        if (r.status === 200) HF_AGAC[depo] = JSON.parse(r.body);
      } catch (e) {}
    }
    return hfBeklenenOzet(HF_AGAC[depo], item.file);
  }

  function dosyaOzeti(yol) {
    return new Promise(function (resolve) {
      try {
        var h = require("crypto").createHash("sha256");
        var st = K.fs.createReadStream(yol);
        st.on("data", function (c) { h.update(c); });
        st.on("end", function () { resolve(h.digest("hex")); });
        st.on("error", function () { resolve(""); });
      } catch (e) { resolve(""); }
    });
  }

  // true: doğrulandı ya da doğrulanamadı (bilinmiyor); false: uyuşmadı (dosya silinir)
  // sonuc (isteğe bağlı, 3.4 adım 19): sonuc.durum = "dogrulandi" | "bilinmiyor" | "uyusmadi" —
  // içe aktarma "doğrulanmadı" durumunu kullanıcıya sormak için ayırt eder
  async function modelDogrula(item, yol, say, sonuc) {
    sonuc = sonuc || {};
    var beklenen = "";
    try { beklenen = await hfOzetGetir(item); } catch (e) {}
    if (!beklenen) { sonuc.durum = "bilinmiyor"; K.log("[model] SHA-256 bilinmiyor, boyut denetimiyle devam: " + item.file); return true; }
    if (say) say("Model doğrulanıyor…");
    var ozet = await dosyaOzeti(yol);
    if (ozet === beklenen) { sonuc.durum = "dogrulandi"; K.log("[model] SHA-256 dogrulandi: " + item.file); return true; }
    sonuc.durum = "uyusmadi";
    K.log("[model] SHA-256 UYUSMADI: " + item.file + " " + ozet + " != " + beklenen);
    try { K.fs.unlinkSync(yol); } catch (e2) {}
    return false;
  }

  function MIA() { return (typeof window !== "undefined" && window.SufloModelIceAktar) || null; }

  // İçe aktarılmış özel modeller (settings.ozelModeller; 3.4 adım 19). Katalogda yoklar, doğrulanmazlar.
  function ozelModeller() {
    var mia = MIA();
    if (!mia) return [];
    var liste = [];
    try { liste = mia.ozelListeyeEkle(K.settings().ozelModeller, null); } catch (e) { liste = []; }
    return liste.map(function (x) { return mia.ozelModelKaydi(x.file, x.sizeMB * 1048576); });
  }

  function modelById(id) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i];
    if (/^ozel:/.test(String(id || ""))) {
      var oz = ozelModeller();
      for (var j = 0; j < oz.length; j++) if (oz[j].id === id) return oz[j];
    }
    return null;
  }

  /*
   * Kurulumun (Ayarlar "İndir & kur", Doctor "Motoru onar") kuracağı model. Özel model yalnız
   * dosyası diskteyse seçilebilir: dosyası silinmiş / karantinaya alınmış Özel model indirilemez,
   * settings.model ona takılı kalırsa her onarım motoru kurup modelde düşerdi. O zaman katalogdaki
   * varsayılana (Turbo) dönülür; kurulum bitince settings.model da ona geçer.
   */
  function kurulumModeli(id) {
    var m = modelById(id);
    if (m && m.ozel && !installedModels().some(function (x) { return x.id === m.id; })) {
      K.log("[model] ozel model dosyasi yok, varsayilan modele donuluyor: " + m.file);
      m = null;
    }
    return m || modelById("turbo");
  }

  // Arayüzde kısa ad: katalog "Turbo"; Özel model dosya adıyla ("Özel model" tek başına hangisi olduğunu söylemez)
  function modelKisaAdi(m) {
    if (!m) return "";
    var label = String(m.label || m.file || "");
    if (m.ozel) return label.indexOf(" — ") !== -1 ? label.slice(label.indexOf(" — ") + 3) : label;
    return label.split(" —")[0];
  }

  /*
   * Çevrimdışı içe aktarma işareti (settings.modelIceAktarma[dosya]): "dogrulanmadi" katalog
   * modeli SHA-256'sız kuruldu demektir. Ayarlar listesi, motor durumu ve Doctor bunu gösterir;
   * Doctor "Doğrula" internet varken modelYenidenDogrula ile denetler.
   */
  function iceAktarmaIsaretiYaz(file, durum) {
    var s = K.settings();
    var kayitlar = s.modelIceAktarma && typeof s.modelIceAktarma === "object" ? s.modelIceAktarma : null;
    if (!durum) {
      if (!kayitlar || !Object.prototype.hasOwnProperty.call(kayitlar, file)) return;
      delete kayitlar[file];
    } else {
      kayitlar = kayitlar || {};
      kayitlar[file] = durum;
    }
    s.modelIceAktarma = kayitlar;
    K.saveSettings();
  }

  function dogrulanmadiMi(m) {
    if (!m || m.ozel) return false;
    var s = K.settings();
    return !!(s.modelIceAktarma && typeof s.modelIceAktarma === "object" && s.modelIceAktarma[m.file] === "dogrulanmadi");
  }

  // Kurulu, çevrimdışı içe aktarılıp henüz doğrulanmamış katalog modelleri
  function dogrulanmamisModeller() {
    return installedModels().filter(dogrulanmadiMi);
  }

  // Diskte kurulu modelleri döndür
  function installedModels() {
    var out = [];
    if (!K.nodeOK) return out;
    try {
      var mdir = K.path.join(K.whisperDir(), "models");
      if (!K.fs.existsSync(mdir)) return out;
      var files = K.fs.readdirSync(mdir);
      MODELS.forEach(function (m) {
        if (files.indexOf(m.file) !== -1) {
          var size = 0;
          try { size = K.fs.statSync(K.path.join(mdir, m.file)).size; } catch (e) {}
          // yarım kalmış dosyayı kurulu sayma (beklenenin %85'inden küçükse)
          if (size > m.sizeMB * 1048576 * 0.85) out.push(m);
        }
      });
      // içe aktarılmış özel modeller: dosya duruyor ve 1 MB'tan büyükse kurulu
      ozelModeller().forEach(function (m) {
        if (files.indexOf(m.file) === -1) return;
        try { if (K.fs.statSync(K.path.join(mdir, m.file)).size > 1048576) out.push(m); } catch (e2) {}
      });
    } catch (e) {}
    return out;
  }

  function vadPath() {
    if (!K.nodeOK) return null;
    try {
      var p = K.path.join(K.whisperDir(), "models", VAD.file);
      if (K.fs.existsSync(p) && K.fs.statSync(p).size > 500000) return p;
    } catch (e) {}
    return null;
  }

  // Kullanıcının seçtiği model (yoksa kurulu olanların en iyisi)
  function activeModel() {
    var inst = installedModels();
    if (!inst.length) return null;
    var want = K.settings().model;
    for (var i = 0; i < inst.length; i++) if (inst[i].id === want) return inst[i];
    // tercih yoksa kurulu en doğru modeli seç. Kullanıcı hız istiyorsa model
    // listesinden Turbo'yu açıkça seçebilir; varsayılan kaliteyi sessizce düşürme.
    var order = ["large", "turbo", "small", "base", "tiny"];
    for (var o = 0; o < order.length; o++) {
      for (var j = 0; j < inst.length; j++) if (inst[j].id === order[o]) return inst[j];
    }
    return inst[0];
  }

  function activeModelPath() {
    var m = activeModel();
    return m ? K.path.join(K.whisperDir(), "models", m.file) : null;
  }

  /* ---------------- GPU tespiti ---------------- */

  var _gpu = null; // { kind: "cuda"|"cpu", name: string }

  async function detectGpu(force) {
    if (_gpu && !force) return _gpu;
    _gpu = { kind: "cpu", name: "" };
    if (!K.nodeOK) return _gpu;
    if (K.MAC) {
      // Apple Silicon'da whisper.cpp Metal ile derli: ayri surucu/derleme secimi yok
      if (K.macMetal()) {
        _gpu = { kind: "metal", name: "Apple Silicon (Metal)" };
        K.log("GPU: Apple Silicon - Metal kullanilacak");
      } else {
        K.log("GPU: Intel Mac, CPU modu");
      }
      return _gpu;
    }
    try {
      var r = await K.run("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"], { timeout: 15000 });
      if (r.code === 0 && r.stdout && r.stdout.trim()) {
        _gpu = { kind: "cuda", name: r.stdout.trim().split("\n")[0].trim() };
        K.log("GPU: NVIDIA algilandi - " + _gpu.name);
        return _gpu;
      }
    } catch (e) {}
    K.log("GPU: yok, CPU modu");
    return _gpu;
  }

  function gpuInfo() { return _gpu; }

  // Kurulu derlemenin türü (settings'te saklanır)
  function installedBuild() {
    return K.settings().engineBuild || "cpu";
  }

  /* ---------------- Kurulum ---------------- */

  function fmtMB(n) { return n >= 1024 ? (n / 1024).toFixed(1) + " GB" : n + " MB"; }

  /* ---------------- İptal (3.2: Altyazı oluştur'un İptal'i ve kurulum İptal'i) ---------------- */

  // Kullanıcı indirmeyi iptal etti: .part korunur, sonraki kurulum kaldığı yerden devam eder
  var INDIRME_IPTAL = "İndirme iptal edildi — inen kısım korundu, yeniden başlatınca kaldığı yerden devam eder.";
  function iptalHatasi(mesaj) {
    if (K.iptalHatasi) return K.iptalHatasi(mesaj);
    var e = new Error(mesaj || "İptal edildi");
    e.iptal = true;
    return e;
  }
  function iptalDenetle(iptal, mesaj) {
    if (iptal && iptal.iptalEdildi) throw iptalHatasi(mesaj || INDIRME_IPTAL);
  }
  // Sonradan katılanın İptal'i: indirme DURMAZ (onu başka bir kurulum başlattı), yalnız bu bekleme biter.
  // "İndirme iptal edildi" demek yanlış olurdu: indirme bant genişliği kullanmaya devam ediyor.
  var BEKLEME_IPTAL = "Bekleme iptal edildi — başka bir kurulum indirmeye devam ediyor.";
  /*
   * Kilitli (paylaşılan) bir işi bekleyen ikinci çağıranın iptali yalnız KENDİ beklemesini
   * keser: işi başlatan (örn. rehberin arka plan ffmpeg kurulumu) sürer. İşi başlatanın
   * jetonu ise indirmenin kendisine gider.
   *   sahip    işi başlatanın jetonu: katılan aynı jetonu taşıyorsa iptal indirmeyi zaten keser,
   *            iş kendi "İndirme iptal edildi" hatasıyla biter (bekleme mesajı verilmez)
   *   iptalde  (isteğe bağlı) katılanın beklemesi iptalle bitince bir kez çağrılır: örn. ilerleme
   *            dinleyicisini sökmek (yoksa süren indirme iptal edilen işin durum satırına yazmaya devam eder)
   */
  function iptalliBekle(is, iptal, sahip, iptalde) {
    if (!iptal || iptal === sahip || typeof iptal.dinle !== "function") return is;
    return new Promise(function (resolve, reject) {
      var birak = iptal.dinle(function () {
        if (typeof iptalde === "function") {
          try { iptalde(); } catch (eI) { K.log("iptal temizligi: " + (eI && eI.message ? eI.message : eI)); }
        }
        reject(iptalHatasi(BEKLEME_IPTAL));
      });
      is.then(function (v) { birak(); resolve(v); }, function (e) { birak(); reject(e); });
    });
  }

  // Aynalı + ilerlemeli indirme.
  // label aynı zamanda mantıksal kimlik: yarım dosya (.part) yalnızca aynı kimliğe devam eder,
  // böylece aynalar arası devam korunur ama farklı dosyalar birbirine eklenmez.
  // iptal: K.iptalJetonu() — iptalde sonraki aynaya geçilmez, { ok: false, iptal: true } döner
  /*
   * Döner: { ok } ya da { ok: false, error, kept, sertifika, dnsEngeli }. Birden çok kaynakta
   * hata SON aynanınki olurdu: huggingface.co için konan "Kurumsal ağ filtresi … (Cisco Umbrella)"
   * teşhisi (3.4 adım 19, K.download) aynanın başka nedenli hatasıyla ezilip yalnız günlükte
   * kalıyordu. DNS filtresi teşhisli ilk hata korunur ve döndürülen hatanın başına konur.
   */
  async function fetchFile(item, destPath, onPct, label, iptal) {
    var urls = item.urls || [item.url];
    var lastErr = "";
    var kept = 0;
    var dnsHata = "", dnsEngeli = "", sertifika = false;
    for (var i = 0; i < urls.length; i++) {
      if (iptal && iptal.iptalEdildi) return { ok: false, iptal: true, error: "İptal edildi", kept: kept };
      if (i > 0) K.log("indirme aynasi deneniyor (" + (i + 1) + "/" + urls.length + "): " + label);
      var r = await K.download(urls[i], destPath, function (f) {
        if (onPct) onPct(f);
      }, 0, undefined, { key: label, expectedMB: item.sizeMB, iptal: iptal || null });
      if (r.ok) return { ok: true };
      if (r.iptal) return { ok: false, iptal: true, error: "İptal edildi", kept: r.kept || kept };
      lastErr = r.error || "bilinmeyen hata";
      if (r.kept) kept = r.kept;
      if (r.sertifika) sertifika = true;
      if (r.dnsEngeli && !dnsHata) { dnsHata = lastErr; dnsEngeli = String(r.dnsEngeli); }
      K.log("indirme basarisiz [" + label + "] kaynak " + (i + 1) + ": " + lastErr);
    }
    var hata = lastErr;
    if (dnsHata && dnsHata !== lastErr) hata = dnsHata + " · " + lastErr;
    return { ok: false, error: hata, kept: kept, sertifika: sertifika, dnsEngeli: dnsEngeli };
  }

  /*
   * İndirme hatasını kullanıcıya anlaşılır anlat. Korunan yarım dosyayı söylemek şart:
   * yoksa kullanıcı her şeyin baştan ineceğini sanıp vazgeçiyor ya da klasörü siliyor.
   */
  function indirmeHatasi(ad, d, item) {
    if (d && d.iptal) return iptalHatasi(INDIRME_IPTAL);
    var m = ad + " indirilemedi: " + d.error;
    if (d.kept > 1048576 && item && item.sizeMB) {
      m += " — %" + Math.round(d.kept / (item.sizeMB * 1048576) * 100) +
        "'i korundu, tekrar dene (kaldığı yerden devam eder)";
    }
    return new Error(m);
  }

  // İndirmesi yarıda kalan motor arşivlerini temizle (646 MB'a kadar ölü ağırlık olabilir)
  function cleanEngineParts(dir) {
    try {
      K.fs.readdirSync(dir).forEach(function (f) {
        if (/^engine-.*\.zip(\.part(\.json)?)?$/i.test(f)) {
          try { K.fs.unlinkSync(K.path.join(dir, f)); } catch (e) {}
        }
      });
    } catch (e) {}
  }

  // cuBLAS'a dönmeden önce CUDA DLL'lerini sil: hem ~600 MB yer açar hem de
  // ggml_backend_load_all() exe klasörünü taradığı için bozuk backend tekrar denenmesin.
  function stripCudaDlls(dir) {
    var files = ["ggml-cuda.dll", "cublasLt64_12.dll", "cublas64_12.dll",
      "cudart64_12.dll", "nvrtc64_120_0.dll", "nvrtc-builtins64_124.dll"];
    [K.path.join(dir, "Release"), dir].forEach(function (d) {
      files.forEach(function (f) {
        try { K.fs.unlinkSync(K.path.join(d, f)); } catch (e) {}
      });
    });
  }

  /*
   * Derleme gerçekten çalışıyor mu? Çıkış kodu YETMEZ: whisper-cli, CUDA yüklenemese de
   * -h dalında koşulsuz exit(0) yapar ve hatayı yalnızca stderr'e yazar. Bu yüzden GPU için
   * POZİTİF kanıt aranır — eşleşme yoksa emniyetli tarafa (CPU) düşülür.
   */
  async function probeBuild(wantCuda) {
    var lw = K.whisperLocal({ skipModel: true });
    if (!lw) return { ok: false, why: "motor dosyasi bulunamadi" };
    var t = await K.run(lw.exe, ["-h"], { timeout: 60000 });
    var blob = String(t.stdout || "") + String(t.stderr || "");
    if (t.code !== 0) return { ok: false, why: "kod=" + t.code + " " + blob.slice(-160) };
    if (!wantCuda) return { ok: true };
    var yuklendi = /load_backend:\s*loaded CUDA backend/i.test(blob);
    var bulundu = /ggml_cuda_init:\s*found\s+[1-9]\d*\s+CUDA device/i.test(blob);
    if (yuklendi && bulundu) return { ok: true };
    var m = /ggml_cuda_init:[^\n]*/i.exec(blob);
    return { ok: false, why: m ? m[0].slice(0, 160) : "CUDA arka ucu yuklenmedi" };
  }

  /*
   * Tam kurulum: motor derlemesi + model (+ VAD).
   * opts: { modelId, useGpu, onStatus(msg), ffmpegArkada, iptal }
   *   ffmpegArkada: ffmpeg'i motordan ONCE kurma; model inince arka planda baslat.
   *     Rehberin ilk altyazisi hazir 16 kHz WAV kullanir, ffmpeg beklemez. Donuste
   *     sonuc.ffmpegIsi (promise | null) arka plan kurulumunu izlemek icindir.
   *
   * KILIT: app.js (Ayarlar/kurulum karti/rehber) ve library-health.js (Doctor onarimi)
   * ayni anda kurulum baslatabiliyor; ikisi ayni .part dosyasina yazip yarisirdi.
   * Surmekte olan kurulum varken gelen cagri onun sonucunu paylasir.
   *
   * IPTAL (opts.iptal, K.iptalJetonu): isi baslatanin jetonu indirmelere gider (istek kesilir,
   * .part korunur) ve adimlar arasinda denetlenir; Homebrew kurulumu ve arsiv acma yarida
   * kesilmez (yarim kurulum birakmasin), bitince iptal edilir. Sonradan katilanin jetonu
   * yalniz kendi beklemesini keser.
   */
  var _kurulumIsi = null;
  var _kurulumJetonu = null;   // işi başlatanın iptal jetonu (iptalliBekle: aynı jetonla katılan)

  function install(opts) {
    if (_kurulumIsi) return iptalliBekle(_kurulumIsi, opts && opts.iptal, _kurulumJetonu);
    var is = kurulumYap(opts);
    _kurulumIsi = is;
    _kurulumJetonu = (opts && opts.iptal) || null;
    var birak = function () { if (_kurulumIsi === is) { _kurulumIsi = null; _kurulumJetonu = null; } };
    is.then(birak, birak);
    return is;
  }

  function kurulumSuruyor() { return !!_kurulumIsi; }

  async function kurulumYap(opts) {
    opts = opts || {};
    var say = opts.onStatus || function () {};
    var iptal = opts.iptal || null;
    if (!K.nodeOK) throw new Error("Bu ortamda kurulamaz — Premiere içinde dene.");

    var dir = K.whisperDir();
    K.fs.mkdirSync(K.path.join(dir, "models"), { recursive: true });

    var model = kurulumModeli(opts.modelId);

    /*
     * 0) ON KOSULLAR — tek bir bayt indirmeden once. Karsilanamayacak bir kurulum
     * icin once yuz megabayt indirtip sonra "olmadi" demek en sinir bozucu davranis.
     * macOS'ta motor Homebrew'dan geliyor; brew yoksa daha ise baslamadan soyle.
     */
    var haveExe0 = !!K.whisperLocal({ skipModel: true });
    if (K.MAC && !haveExe0 && !K.brewYolu()) {
      throw new Error("macOS'ta yerel motor Homebrew ile kurulur, ama Homebrew bulunamadı. " +
        "Terminal'e şunu yapıştırıp paneli yeniden aç: " +
        '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" ' +
        "— ya da Homebrew kurmadan, Ayarlar'dan ücretsiz Groq anahtarıyla bulut motorunu kullan.");
    }

    /*
     * 1) ffmpeg — motordan ONCE. Modeli indirip "hazir" dedikten sonra ilk altyazi
     * denemesinde "ffmpeg bulunamadi" duvarina carpmak, kullanicilarin buyuk
     * cogunlugunun vazgectigi yerdi. Sistemde varsa dokunulmuyor.
     */
    var ffVar = opts.ffmpegArkada ? true : await K.findFfmpeg(true);
    if (!ffVar) {
      say("ffmpeg kuruluyor… (ses dönüştürme için gerekli)");
      try {
        await installFfmpeg(say, iptal);
        await K.findFfmpeg(true);       // onbellegi tazele
      } catch (eF) {
        if (eF && eF.iptal) throw eF;   // kullanici iptal etti: motora gecme
        // Motor kurulumunu bunun yuzunden IPTAL ETME: kullanici ffmpeg'i elle de
        // kurabilir, ama neyin eksik kaldigini bilerek devam etsin.
        K.log("ffmpeg otomatik kurulamadi: " + eF.message);
        say("ffmpeg kurulamadı, motor kurulumuna devam ediliyor…");
      }
    }

    /* 1) motor derlemesi — zaten varsa atla */
    iptalDenetle(iptal);
    var haveExe = !!K.whisperLocal({ skipModel: true });
    var wantBuild = opts.useGpu ? "cuda" : "cpu";

    if (K.MAC) {
      /*
       * macOS için whisper.cpp RESMİ İKİLİ YAYINLAMIYOR: v1.9.1 varlıkları yalnızca
       * Windows (x64/Win32) ve Ubuntu. Homebrew formülü (whisper-cpp) aynı sürümü ve
       * çağırdığımız aynı `whisper-cli`yi veriyor, Apple Silicon için hazır bottle'ı var.
       * Bu yüzden macOS'ta arşiv indirmiyoruz — motoru brew kuruyor.
       */
      if (!haveExe) {
        var brew = K.brewYolu();
        if (!brew) {
          throw new Error("macOS'ta yerel motor Homebrew ile kurulur, ama Homebrew bulunamadı. " +
            "Terminal'e şunu yapıştırıp paneli yeniden aç: " +
            '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" ' +
            "— ya da Homebrew kurmadan, Ayarlar'dan ücretsiz Groq anahtarıyla bulut motorunu kullan.");
        }
        say("Motor kuruluyor: brew install whisper-cpp (birkaç dakika sürebilir)…");
        var bi = await K.run(brew, ["install", "whisper-cpp"], { timeout: 1800000 });
        if (!K.whisperLocal({ skipModel: true })) {
          throw new Error("Homebrew motoru kuramadı (kod=" + bi.code + "): " +
            String(bi.stderr || bi.stdout).split("\n").slice(-3).join(" ").slice(0, 220));
        }
        K.log("mac motoru kuruldu: brew whisper-cpp");
      }
      var prM = await probeBuild(false);
      if (!prM.ok) throw new Error("Motor çalıştırılamadı: " + prM.why);
      var sM = K.settings();
      sM.engineBuild = K.macMetal() ? "metal" : "cpu";
      K.saveSettings();
    } else if (!haveExe || installedBuild() !== wantBuild) {
      var build = BUILDS[wantBuild];
      say("Motor iniyor… (" + fmtMB(build.sizeMB) + ")");
      // Derleme başına ayrı ad: yarım kalan cuBLAS .part'ı CPU zip'ine eklenmesin
      var zipPath = K.path.join(dir, "engine-" + build.id + ".zip");
      var d1 = await fetchFile(build, zipPath, function (f) {
        say("Motor iniyor… %" + Math.round(f * 100) + " (" + fmtMB(build.sizeMB) + ")");
      }, "motor:" + build.id, iptal);
      if (!d1.ok) throw indirmeHatasi("Motor", d1, build);

      say("Motor açılıyor…");
      var ok = await K.unzip(zipPath, dir);
      try { K.fs.unlinkSync(zipPath); } catch (e) {}
      if (!ok) throw new Error("Motor arşivi açılamadı.");

      // Derleme gerçekten çalışıyor mu? CPU'da da sınanır — bozuk kurulum "başarılı" görünmesin.
      var pr = await probeBuild(wantBuild === "cuda");
      if (!pr.ok && wantBuild === "cuda") {
        K.log("cuBLAS dogrulanamadi, CPU'ya donuluyor: " + pr.why);
        say("GPU sürümü bu sürücüde çalışmadı, CPU sürümüne dönülüyor…");
        var cpu = BUILDS.cpu;
        stripCudaDlls(dir);
        var zp2 = K.path.join(dir, "engine-" + cpu.id + ".zip");
        var d2 = await fetchFile(cpu, zp2, function (f) {
          say("CPU motoru iniyor… %" + Math.round(f * 100));
        }, "motor:cpu", iptal);
        if (!d2.ok) throw indirmeHatasi("CPU motoru", d2, cpu);
        var ok2 = await K.unzip(zp2, dir);
        try { K.fs.unlinkSync(zp2); } catch (e) {}
        if (!ok2) throw new Error("CPU motor arşivi açılamadı.");
        var pr2 = await probeBuild(false);
        if (!pr2.ok) throw new Error("Motor çalıştırılamadı: " + pr2.why);
        wantBuild = "cpu";
      } else if (!pr.ok) {
        throw new Error("Motor çalıştırılamadı: " + pr.why);
      }
      var s0 = K.settings();
      s0.engineBuild = wantBuild;
      K.saveSettings();
    }

    /* 2) model — model basina kilitli indirme (installModel ile ayni is paylasilir) */
    iptalDenetle(iptal);
    await installModel(model.id, say, iptal);

    /* 3) VAD — küçük, sessizlikleri atlayıp hızlandırır */
    iptalDenetle(iptal);
    if (!vadPath()) {
      say("Sessizlik dedektörü iniyor… (2 MB)");
      var vPath = K.path.join(dir, "models", VAD.file);
      var d4 = await fetchFile(VAD, vPath, null, "vad", iptal);
      if (d4.iptal) throw indirmeHatasi("VAD", d4, VAD);
      if (!d4.ok) K.log("VAD indirilemedi (kritik degil): " + d4.error);
      else if (!(await modelDogrula(VAD, vPath, null))) K.log("VAD dogrulanamadi, silindi (kritik degil)");
    }

    var s = K.settings();
    s.model = model.id;
    s.provider = "local";
    K.saveSettings();

    if (!K.whisperLocal()) throw new Error("Kurulum doğrulanamadı.");

    /* 4) GPU ısınma — CUDA çekirdeklerini şimdi derle ki ilk gerçek iş hızlı olsun.
     *    (Blackwell gibi yeni kartlarda ilk çalıştırma 30+ sn sürebiliyor.) */
    if (installedBuild() === "cuda") {
      say("GPU hazırlanıyor… (ilk sefer, bir dakika sürebilir)");
      var w = { ok: false, reason: "throw" };
      try { w = await warmUp(); } catch (eW) { K.log("GPU isinma atlandi: " + eW.message); }
      // Yalnızca motor GERÇEKTEN çalışmadıysa CPU'ya dön. ffmpeg yokluğu GPU'yu suçlamaz.
      if (!w.ok && w.reason === "engine-run") {
        say("GPU sürümü bu sürücüde çalışmadı, CPU sürümüne dönülüyor…");
        stripCudaDlls(dir);
        var zp3 = K.path.join(dir, "engine-" + BUILDS.cpu.id + ".zip");
        var d5 = await fetchFile(BUILDS.cpu, zp3, function (f) {
          say("CPU motoru iniyor… %" + Math.round(f * 100));
        }, "motor:cpu", iptal);
        // İptal: indirme kesilir, .part korunur (yeniden kurunca kaldığı yerden); CUDA DLL'leri
        // silinmiş durum ağ hatasındakiyle aynı. Kullanıcıya "Hazır" değil iptal uyarısı gider.
        if (d5.iptal) throw indirmeHatasi("CPU motoru", d5, BUILDS.cpu);
        var ok3 = d5.ok && await K.unzip(zp3, dir);
        try { K.fs.unlinkSync(zp3); } catch (e) {}
        if (ok3) {
          var s2 = K.settings();
          s2.engineBuild = "cpu";
          K.saveSettings();
          K.log("CPU derlemesine donuldu");
        } else {
          K.log("CPU'ya donulemedi: " + (d5.error || "arsiv acilamadi"));
        }
      } else if (!w.ok) {
        K.log("GPU isinma yapilamadi (" + w.reason + ") - dogrulama atlandi, derleme degistirilmedi");
      }
    } else if (K.MAC && K.macMetal()) {
      // Metal shader'ları da ilk çalıştırmada derleniyor: bedeli şimdi öde
      say("Motor hazırlanıyor…");
      try { await warmUp(); } catch (eW2) { K.log("isinma atlandi: " + eW2.message); }
    }

    cleanEngineParts(dir);
    var ffmpegHazir = !!(await K.findFfmpeg(true));
    /*
     * ffmpegArkada: motor hazir, ilk altyazi ffmpeg'siz baslayabilir; ffmpeg (Windows'ta
     * 141 MB) simdi arka planda iner. Hata kurulumu bozmaz: kullanici dosyasindan altyazi
     * alirken convertAudio ayni kilitli isi bekler ya da yeniden dener.
     */
    var ffmpegIsi = null;
    if (opts.ffmpegArkada && !ffmpegHazir) {
      ffmpegIsi = installFfmpeg(opts.onFfmpeg || function () {}).then(function (yol) {
        return K.findFfmpeg(true).then(function () { return yol; });
      }, function (eArk) {
        K.log("ffmpeg arka plan kurulumu basarisiz: " + (eArk && eArk.message ? eArk.message : eArk));
        return null;
      });
    }
    return {
      model: model,
      build: installedBuild(),
      vad: !!vadPath(),
      ffmpeg: ffmpegHazir,
      ffmpegIsi: ffmpegIsi
    };
  }

  /*
   * Yalniz modeli indir + SHA-256 dogrula. settings.provider'a ve settings.model'e
   * ASLA dokunmaz: hangi modelin kullanilacagina cagiran karar verir (rehberin
   * "Daha dogru model" dugmesi, modelGecisi kurali). Model basina kilit: ayni
   * modeli isteyen ikinci cagri ayni indirmeyi bekler (ayni .part dosyasina iki
   * yazici olmaz).
   */
  var _modelIsleri = {};
  var _modelJetonlari = {};   // model başına işi başlatanın iptal jetonu

  // iptal (isteğe bağlı): K.iptalJetonu() — işi başlatanınki indirmeyi keser, sonradan katılanınki
  // yalnız kendi beklemesini
  function installModel(id, onStatus, iptal) {
    var model = modelById(id);
    if (!model) return Promise.reject(new Error("Bilinmeyen model: " + id));
    if (_modelIsleri[model.id]) return iptalliBekle(_modelIsleri[model.id], iptal, _modelJetonlari[model.id]);
    var is = modelKur(model, onStatus || function () {}, iptal);
    _modelIsleri[model.id] = is;
    _modelJetonlari[model.id] = iptal || null;
    var birak = function () {
      if (_modelIsleri[model.id] === is) { delete _modelIsleri[model.id]; delete _modelJetonlari[model.id]; }
    };
    is.then(birak, birak);
    return is;
  }

  async function modelKur(model, say, iptal) {
    if (!K.nodeOK) throw new Error("Bu ortamda kurulamaz — Premiere içinde dene.");
    var dir = K.whisperDir();
    K.fs.mkdirSync(K.path.join(dir, "models"), { recursive: true });
    var mPath = K.path.join(dir, "models", model.file);
    var already = installedModels().some(function (m) { return m.id === model.id; });
    if (already) return { model: model, already: true };
    if (model.ozel) throw new Error("Özel model dosyası bulunamadı: Ayarlar › Motor › Model dosyası içe aktar ile yeniden ekle.");
    say(model.label + " iniyor… (" + fmtMB(model.sizeMB) + ")");
    var d3 = await fetchFile(model, mPath, function (f) {
      say(model.label + " iniyor… %" + Math.round(f * 100) + " (" + fmtMB(model.sizeMB) + ")");
    }, "model:" + model.id, iptal);
    if (!d3.ok) {
      var eI = indirmeHatasi(model.label.split(" —")[0], d3, model);
      // 3.4 adım 19: ağ yüzünden inmeyen MODEL için K.hataYardimi çevrimdışı içe aktarmayı da söyler
      if (!d3.iptal) eI.modelIceAktarOner = true;
      throw eI;
    }
    if (!(await modelDogrula(model, mPath, say))) {
      throw new Error(model.label.split(" —")[0] + " indirildi ama doğrulanamadı (bozuk dosya). Tekrar dene.");
    }
    // yeni inen dosya içe aktarılanın yerini aldı: "doğrulanmadı" işareti artık bu dosyayı anlatmaz
    iceAktarmaIsaretiYaz(model.file, null);
    return { model: model, already: false };
  }

  /* ---------------- Çevrimdışı model içe aktarma (3.4 adım 19) ---------------- */

  /*
   * Kurumsal ağda huggingface.co'ya ulaşılamayan kullanıcı, modeli başka bir bilgisayarda indirip
   * buradan kurar. Kararlar js/model-ice-aktar.js'te (saf); burada dosya işleri:
   *   1. ilk 4 bayt + boyut denetimi (ggml imzası, > 1 MB, <= 4 GB)
   *   2. katalog kimliği dosya adından; eşleşmezse yalnız onayla "Özel model"
   *   3. hedef doluysa SESSİZCE ÜZERİNE YAZILMAZ: onay istenir
   *   4. <hedef>.ice-aktar.part'a kopyala -> katalog modeliyse modelDogrula (SHA-256);
   *      ağ yoksa "doğrulanmadı" onayı; uyuşmazsa ya da onay yoksa .part silinir
   *   5. .part -> hedef (rename); seçim bu modele geçer
   * secenek: { onayla: async function (tur, metin) -> bool, say: function (metin) }
   *   tur: "ozel" | "ustune-yaz" | "dogrulanmadi"
   * Döner: { ok: true, id, file, durum: "dogrulandi"|"dogrulanmadi"|"ozel" } ya da { ok: false, vazgecildi: true }
   * Kullanıcının seçtiği kaynak dosyaya ASLA dokunulmaz (yalnız okunur).
   */
  var _iceAktariliyor = false;

  function dosyaKopyala(kaynak, hedef, ilerleme) {
    return new Promise(function (resolve, reject) {
      var toplam = 0, giden = 0, bitti = false;
      try { toplam = K.fs.statSync(kaynak).size; } catch (e0) {}
      function son(e) { if (bitti) return; bitti = true; if (e) reject(e); else resolve(giden); }
      var oku, yaz;
      try {
        oku = K.fs.createReadStream(kaynak);
        yaz = K.fs.createWriteStream(hedef);
      } catch (e1) { son(e1); return; }
      oku.on("data", function (c) {
        giden += c.length;
        if (ilerleme && toplam) ilerleme(giden / toplam);
      });
      oku.on("error", function (e2) { try { yaz.destroy(); } catch (e3) {} son(e2); });
      yaz.on("error", function (e4) { try { oku.destroy(); } catch (e5) {} son(e4); });
      yaz.on("finish", function () {
        if (toplam && giden !== toplam) son(new Error("Kopya eksik: " + giden + "/" + toplam + " bayt"));
        else son(null);
      });
      oku.pipe(yaz);
    });
  }

  // .part -> hedef (üzerine, atomik). Windows'ta antivirüs / dizinleyici yeni yazılan dosyayı kısa
  // süre tutar: EPERM / EBUSY / EACCES'te birkaç kez kısa beklemeyle yeniden denenir.
  function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function yerineKoy(kaynak, hedef) {
    var son = null;
    for (var i = 0; i < 4; i++) {
      try { K.fs.renameSync(kaynak, hedef); return; }
      catch (e) {
        son = e;
        if (!e || !/^(EPERM|EBUSY|EACCES)$/.test(String(e.code || ""))) throw e;
        if (i < 3) await bekle(250 * (i + 1));
      }
    }
    throw son;
  }

  function ayniYol(a, b) {
    function n(p) { var r = K.path.resolve(p); return K.WIN ? r.toLowerCase() : r; }
    try { return n(a) === n(b); } catch (e) { return false; }
  }

  async function modelIceAktar(kaynak, secenek) {
    secenek = secenek || {};
    var mia = MIA();
    if (!mia) throw new Error("Model içe aktarma modülü yüklenmedi.");
    if (!K.nodeOK) throw new Error("Bu ortamda kurulamaz — Premiere içinde dene.");
    if (_iceAktariliyor) throw new Error("Başka bir model içe aktarılıyor; bitmesini bekle.");
    var onayla = typeof secenek.onayla === "function" ? secenek.onayla : function () { return false; };
    var say = typeof secenek.say === "function" ? secenek.say : function () {};
    _iceAktariliyor = true;
    try {
      var st;
      try { st = K.fs.statSync(kaynak); } catch (eS) { throw new Error("Dosya okunamadı: " + mia.dosyaAdi(kaynak)); }
      if (!st.isFile()) throw new Error("Bir model dosyası (.bin) seç.");
      var bas = require("buffer").Buffer.alloc(4), fd = null, okunan = 0;
      try { fd = K.fs.openSync(kaynak, "r"); okunan = K.fs.readSync(fd, bas, 0, 4, 0); }
      catch (eR) { throw new Error("Dosya okunamadı: " + mia.dosyaAdi(kaynak)); }
      finally { if (fd !== null) { try { K.fs.closeSync(fd); } catch (eC) {} } }
      var den = mia.basligiDenetle(okunan >= 4 ? bas : bas.slice(0, okunan), st.size);
      if (!den.ok) throw new Error(den.mesaj);

      var ad = mia.dosyaAdi(kaynak);
      var item = mia.katalogEslestir(ad, MODELS);
      if (item) {
        var bd = mia.katalogBoyutDenetle(item, st.size);
        if (!bd.ok) throw new Error(bd.mesaj);
      }
      var ozel = null;
      if (!item) {
        if (!(await onayla("ozel", mia.ozelUyari(ad, mia.aileTahmin(ad, MODELS))))) return { ok: false, vazgecildi: true };
        ozel = mia.ozelModelKaydi(mia.ozelDosyaAdi(ad, MODELS), st.size);
      }
      var hedefAd = item ? item.file : ozel.file;
      var mdir = K.path.join(K.whisperDir(), "models");
      K.fs.mkdirSync(mdir, { recursive: true });
      var hedef = K.path.join(mdir, hedefAd);
      if (ayniYol(kaynak, hedef)) throw new Error("Bu dosya zaten Suflo'nun model klasöründe: yeniden içe aktarmaya gerek yok.");
      var hedefVar = false;
      try { hedefVar = K.fs.existsSync(hedef); } catch (eE) {}
      if (hedefVar && !(await onayla("ustune-yaz", mia.ustuneYazSorusu(hedefAd)))) return { ok: false, vazgecildi: true };

      var part = hedef + mia.PART_EKI;
      var durum = item ? "dogrulandi" : "ozel";
      try {
        try { K.fs.unlinkSync(part); } catch (eU) {}
        say("Model kopyalanıyor…");
        await dosyaKopyala(kaynak, part, function (f) { say("Model kopyalanıyor… %" + Math.round(f * 100)); });
        if (item) {
          var sonuc = {};
          if (!(await modelDogrula(item, part, say, sonuc))) {
            throw new Error(item.label.split(" —")[0] + " doğrulanamadı: SHA-256 uyuşmadı (bozuk ya da farklı bir dosya). Kurulmadı.");
          }
          if (sonuc.durum === "bilinmiyor") {
            if (!(await onayla("dogrulanmadi", mia.dogrulanmadiSorusu(item.label.split(" —")[0])))) {
              try { K.fs.unlinkSync(part); } catch (eV) {}
              return { ok: false, vazgecildi: true };
            }
            durum = "dogrulanmadi";
          }
        }
        // onay alındı (ya da hedef boştu): .part'ı yerine koy. Hedef ÖNCEDEN SİLİNMEZ: rename
        // eskisini tek adımda değiştirir (Windows'ta MoveFileExW REPLACE_EXISTING, POSIX rename(2)).
        // Silip sonra taşımak, taşıma düşerse (antivirüs / dizinleyici yeni dosyayı tutuyor: EPERM)
        // kullanıcıyı ne eski ne yeni modelle bırakırdı.
        await yerineKoy(part, hedef);
      } catch (e) {
        try { K.fs.unlinkSync(part); } catch (eP) {}
        throw e;
      }

      var s = K.settings();
      if (ozel) s.ozelModeller = mia.ozelListeyeEkle(s.ozelModeller, ozel);
      var kayitlar = s.modelIceAktarma && typeof s.modelIceAktarma === "object" ? s.modelIceAktarma : {};
      kayitlar[hedefAd] = durum;
      s.modelIceAktarma = kayitlar;
      var id = item ? item.id : ozel.id;
      s.model = id;
      K.saveSettings();
      K.log("[model] ice aktarildi: " + hedefAd + " (" + durum + ")");
      return { ok: true, id: id, file: hedefAd, durum: durum, model: item || ozel };
    } finally {
      _iceAktariliyor = false;
    }
  }

  /*
   * Doctor'da "Doğrula": çevrimdışı içe aktarılıp "doğrulanmadı" kalan katalog modelini internet
   * varken SHA-256 ile denetler. Döner: { durum: "dogrulandi" | "bilinmiyor" | "uyusmadi", model }
   *   dogrulandi  işaret kalkar
   *   bilinmiyor  huggingface.co'ya yine ulaşılamadı: işaret kalır
   *   uyusmadi    modelDogrula dosyayı siler (bozuk ya da değiştirilmiş dosya kullanılmaz), işaret kalkar
   */
  async function modelYenidenDogrula(id, say) {
    var m = modelById(id);
    if (!m || m.ozel) throw new Error("Bu model katalogda yok: doğrulanamaz.");
    var yol = K.path.join(K.whisperDir(), "models", m.file);
    if (!K.fs.existsSync(yol)) throw new Error(m.label.split(" —")[0] + " kurulu değil.");
    var sonuc = {};
    await modelDogrula(m, yol, say, sonuc);
    if (sonuc.durum === "dogrulandi" || sonuc.durum === "uyusmadi") iceAktarmaIsaretiYaz(m.file, null);
    return { durum: sonuc.durum || "bilinmiyor", model: m };
  }

  /*
   * Doctor "Model kaynaklarını sına": motorun indirildiği yer (ana makinesi sınanır). Windows:
   * GitHub sürüm arşivi. macOS: motoru Homebrew kurar (brew install whisper-cpp), paketler
   * (bottle) ghcr.io'dan iner; github.com'a ulaşmak orada bir şey söylemez.
   */
  function motorKaynakAdresi() { return K.MAC ? "https://ghcr.io/" : BUILDS.cpu.urls[0]; }

  /*
   * Kısa sessiz sesle bir tur çalıştırıp CUDA çekirdek önbelleğini doldur.
   * Dönüş: { ok, reason } — reason "engine-run" ise motor gerçekten çalışmıyor (CPU'ya dönülür),
   * "ffmpeg"/"engine" ise sadece doğrulama yapılamadı (derlemeye dokunulmaz).
   */
  async function warmUp() {
    var lw = K.whisperLocal();
    if (!lw) return { ok: false, reason: "engine" };
    var ff = await K.findFfmpeg();
    if (!ff) return { ok: false, reason: "ffmpeg" };
    var wav = K.path.join(K.tmpDir(), "warmup.wav");
    var r0 = await K.run(ff, ["-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
      "-t", "2", "-c:a", "pcm_s16le", wav], { timeout: 60000 });
    if (r0.code !== 0) return { ok: false, reason: "ffmpeg" };
    var out = wav.replace(/\.wav$/i, "_w");
    var r1 = await K.run(lw.exe, ["-m", lw.model, "-f", wav, "-l", "en", "-oj", "-of", out, "-t", "4"],
      { timeout: 300000 });
    var uretti = false;
    try { uretti = K.fs.existsSync(out + ".json"); } catch (e) {}
    try { K.fs.unlinkSync(wav); } catch (e) {}
    try { K.fs.unlinkSync(out + ".json"); } catch (e) {}
    var blob = String(r1.stderr || "") + String(r1.stdout || "");
    if (!uretti && r1.code !== 0) {
      K.log("isinma basarisiz (kod=" + r1.code + "): " + blob.slice(-300));
      return { ok: false, reason: "engine-run" };
    }
    if (/ggml_cuda_init:\s*failed|CUDA error/i.test(blob)) {
      K.log("isinmada CUDA hatasi: " + (/ggml_cuda_init:[^\n]*|CUDA error[^\n]*/i.exec(blob) || [""])[0]);
      return { ok: false, reason: "engine-run" };
    }
    K.log("GPU isinma tamam");
    return { ok: true };
  }

  /* ---------------- Whisper argümanları ---------------- */

  /*
   * transcribeLocal için argüman üretir — VAD, çözme modu, thread, DTW, çeviri. Argüman kurma
   * saf modülde (js/whisper-args.js, SufloWhisperArgs.olustur; Node testleri doğrudan çalıştırır).
   * -ojf: JSON'a belirteç başına metin, zaman, olasılık (p) ve t_dtw yazılır. Satır ve kelime
   * kelime modu AYNI çıktıyı kullanır (js/whisper-words.js kelimelere ayırır).
   * wordLevel: argümanı değiştirmez (karaoke için ikinci tur gerekmez).
   * kelimeYedegi: yalnız belirteç yazmayan eski derlemede kelime zamanı için
   *   eski "-ml 1 -sow" turu (transcribeLocal yalnız o durumda ister).
   * cozme ("dogru" | "hizli"), dtw (bool), cevir (bool), modelId: whisper-args.js'e bakın.
   */
  function buildArgs(o) {
    o = o || {};
    // whisper-cli Windows'ta argv'yi ANSI okur: Turkce karakterli kullanici
    // adinda model/ses yolu bozulup motor cokuyordu (issue #7). Yol
    // argumanlari ASCII-guvenli esdegerlerine cevrilir; cikti tabani ayni
    // fiziksel klasorde kalir ki cagiran outBase + ".json" dosyasini bulsun.
    var G = (typeof K !== "undefined" && K.guvenliYol)
      ? K.guvenliYol
      : function (p) { return p; };
    var WAR = typeof window !== "undefined" ? window.SufloWhisperArgs : null;
    if (!WAR) throw new Error("js/whisper-args.js yüklenmedi");
    // VAD: sessizlikleri atla (büyük hız kazancı + halüsinasyon azalır)
    var vp = vadPath();
    var girdi = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) girdi[k] = o[k];
    girdi.vad = vp;
    girdi.yol = G;
    var secim = WAR.secenekler(girdi);
    return {
      args: WAR.olustur(girdi), vad: !!vp,
      cozme: secim.cozme, dtw: secim.dtw, cevir: secim.cevir, modelId: secim.modelId,
      gunluk: WAR.gunlukMetni(girdi)
    };
  }

  /* ---------------- ffmpeg kurulumu ---------------- */

  /*
   * ffmpeg olmadan HICBIR SEY calismaz: hem yerel hem bulut motoru sesin once
   * ffmpeg'den gecmesini bekliyor. Kullanicilarin cogunun takildigi yer burasiydi.
   *
   * Neden paket yoneticisine guvenmiyoruz: winget her Windows'ta yok, kurumsal
   * makinelerde kapali olabiliyor, ve kurulum basarili olsa bile PATH'i CALISAN
   * Premiere surecine yansitmiyor — kullanici "kurdum ama gormuyor" durumunda kaliyor.
   * Bu yuzden motoru nasil indiriyorsak ffmpeg'i de oyle indirip kendi klasorumuze
   * koyuyoruz; PATH'e, yonetici hakkina, kuruluma bagimli degiliz.
   */
  var FFMPEG_KAYNAKLARI = {
    win: [
      {
        /*
         * BtbN LGPL derlemesi. Iki sebeple birinci sirada:
         * 1) URL ve ARSIV ICI YOL ikisi de kalici — etiket kelimesi kelimesine
         *    "latest", klasor adi zip adiyla ayni ve icinde surum yok.
         * 2) LGPLv3: MIT bir urun icin en temiz secim (GPL-only x264/x265 yok,
         *    ki bizim isimizde kullanilmiyorlar zaten).
         */
        url: "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip",
        sizeMB: 141,
        desen: "*/bin/ffmpeg.exe",
        strip: 2
      },
      {
        // Yedek: ffmpeg.org'un onerdigi gyan.dev derlemesi (GPLv3).
        // Klasor adinda surum var (ffmpeg-<surum>-essentials_build) — bu yuzden
        // sabit yol degil, joker desen kullaniyoruz.
        url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
        sizeMB: 105,
        desen: "*/bin/ffmpeg.exe",
        strip: 2
      }
    ],
    /*
     * macOS: mimariye gore SECILIR. evermeet.cx bilerek kullanilmiyor —
     * yalnizca Intel ikilisi yayinliyor ve Apple Silicon'da "Bad CPU type"
     * hatasi verir; Premiere Apple Silicon'da native arm64 calistigi icin
     * panel de arm64'tur.
     */
    macArm: [
      {
        url: "https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip",
        sizeMB: 27,
        desen: "ffmpeg",
        strip: 0
      }
    ],
    macIntel: [
      {
        url: "https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip",
        sizeMB: 32,
        desen: "ffmpeg",
        strip: 0
      },
      {
        url: "https://evermeet.cx/ffmpeg/getrelease/zip",   // yalnizca Intel icin gecerli
        sizeMB: 25,
        desen: "ffmpeg",
        strip: 0
      }
    ]
  };

  function ffmpegKaynaklari() {
    if (!K.MAC) return FFMPEG_KAYNAKLARI.win;
    var arm = false;
    try { arm = K.os.arch() === "arm64"; } catch (e) {}
    return arm ? FFMPEG_KAYNAKLARI.macArm : FFMPEG_KAYNAKLARI.macIntel;
  }

  /*
   * ffmpeg'i indirip panelin klasorune kur. onStatus(mesaj) ile ilerleme bildirir.
   * Basarili olursa calisabilir dosyanin tam yolunu, olmazsa hata firlatir.
   */
  /*
   * Ayni anda iki kurulum baslamasin: Ayarlar'daki dugme ile altyazi akisindaki
   * otomatik kurulum ust uste binebiliyor ve ikisi de AYNI zip dosyasina yazip
   * AYNI hedefi olusturmaya calisirdi. Ikinci cagri birincinin sonucunu bekler.
   */
  var _ffmpegIsi = null;
  var _ffmpegJetonu = null;    // isi baslatanin iptal jetonu
  var _ffmpegDinleyici = [];   // surmekte olan isin ilerlemesini bekleyen her cagiran
  var _ffmpegSon = "";         // son ilerleme metni: sonradan katilan bos ekranda beklemesin

  /*
   * Ikinci cagri yalniz sonucu degil ILERLEMEYI de paylasir: rehber ffmpeg'i arkada
   * baslatip kullanici hemen "Altyazi olustur"a basinca durum satiri "ffmpeg kuruluyor…"
   * da donup kalmasin, yuzde aksin.
   */
  // iptal (isteğe bağlı): işi başlatanınki indirmeyi keser (.part korunur), sonradan katılanınki
  // (örn. rehberin arka plan kurulumu sürerken Altyazı oluştur'un İptal'i) yalnız kendi beklemesini
  function installFfmpeg(onStatus, iptal) {
    if (!_ffmpegIsi) {
      var dinleyiciler = [];
      _ffmpegDinleyici = dinleyiciler;
      _ffmpegSon = "";
      if (typeof onStatus === "function") dinleyiciler.push(onStatus);
      var is = ffmpegKur(function (m) {
        if (_ffmpegDinleyici === dinleyiciler) _ffmpegSon = m;
        dinleyiciler.slice().forEach(function (fn) {
          try { fn(m); } catch (eD) { K.log("ffmpeg ilerleme dinleyicisi: " + (eD && eD.message ? eD.message : eD)); }
        });
      }, iptal);
      _ffmpegIsi = is;
      _ffmpegJetonu = iptal || null;
      // sonuc ne olursa olsun kilidi birak, ama sonucu cagirana aynen ilet
      var birak = function () {
        if (_ffmpegIsi === is) { _ffmpegIsi = null; _ffmpegJetonu = null; _ffmpegDinleyici = []; _ffmpegSon = ""; }
      };
      is.then(birak, birak);
      return is;
    }
    var liste = _ffmpegDinleyici, eklendi = false;
    var zatenIptal = !!(iptal && iptal.iptalEdildi);
    if (!zatenIptal && typeof onStatus === "function" && liste.indexOf(onStatus) === -1) {
      liste.push(onStatus);
      eklendi = true;
      if (_ffmpegSon) { try { onStatus(_ffmpegSon); } catch (eS) {} }
    }
    // Katılanın İptal'i: ilerleme dinleyicisi de sökülür. Yoksa arkada süren indirme, iptal edilmiş
    // Altyazı oluştur'un durum satırına "ffmpeg iniyor… %31" yazmaya devam ederdi.
    return iptalliBekle(_ffmpegIsi, iptal, _ffmpegJetonu, function () {
      if (!eklendi) return;
      var k = liste.indexOf(onStatus);
      if (k !== -1) liste.splice(k, 1);
    });
  }

  async function ffmpegKur(onStatus, iptal) {
    var say = onStatus || function () {};
    if (!K.nodeOK) throw new Error("Bu ortamda kurulamaz — Premiere içinde dene.");

    var dir = K.ffmpegDir();
    K.fs.mkdirSync(dir, { recursive: true });

    var hedef = K.path.join(dir, K.MAC ? "ffmpeg" : "ffmpeg.exe");
    var kaynaklar = ffmpegKaynaklari();
    var sonHata = "";

    for (var i = 0; i < kaynaklar.length; i++) {
      var kaynak = kaynaklar[i];
      var zip = K.path.join(dir, "ffmpeg-indirme.zip");
      try {
        say("ffmpeg iniyor… (" + fmtMB(kaynak.sizeMB) + ")");
        iptalDenetle(iptal);
        var d = await K.download(kaynak.url, zip, function (f) {
          say("ffmpeg iniyor… %" + Math.round(f * 100) + " (" + fmtMB(kaynak.sizeMB) + ")");
        }, 0, undefined, { key: "ffmpeg:" + i, expectedMB: kaynak.sizeMB, iptal: iptal || null });
        if (d.iptal) throw iptalHatasi(INDIRME_IPTAL);   // sonraki aynaya geçme; .part korunur
        if (!d.ok) { sonHata = d.error || "indirilemedi"; continue; }

        say("ffmpeg açılıyor…");
        var cikti = await ffmpegCikar(zip, dir, kaynak);
        try { K.fs.unlinkSync(zip); } catch (eZ) {}
        if (!cikti) { sonHata = "arşiv açılamadı"; continue; }

        if (K.MAC) {
          // indirilen dosya calistirilabilir degil: calistirma izni ver
          try { K.fs.chmodSync(hedef, 493); } catch (eC) {}   // 0755
          /*
           * Gatekeeper karantinasi: internetten inen her dosyaya
           * com.apple.quarantine ozniteligi konur ve calistirilmak istendiginde
           * "gelistirici dogrulanamadi" diye engellenir. Kendi indirdigimiz
           * ikilide bunu temizliyoruz, yoksa ffmpeg mac'te hic calismaz.
           */
          try { await K.run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", hedef], { timeout: 30000 }); } catch (eQ) {}
        }

        // GERCEKTEN calisiyor mu? Varligina degil, cikisina bak.
        say("ffmpeg doğrulanıyor…");
        var t = await K.run(hedef, ["-version"], { timeout: 60000 });
        if (t.code !== 0 || !/ffmpeg version/i.test(String(t.stdout) + String(t.stderr))) {
          try { K.fs.unlinkSync(hedef); } catch (eD) {}
          sonHata = "indirilen ffmpeg çalışmadı";
          continue;
        }

        var s = K.settings();
        s.ffmpeg = hedef;            // aday listesinde en one gecsin
        K.saveSettings();
        K.log("ffmpeg kuruldu: " + hedef);
        return hedef;
      } catch (e) {
        if (e && e.iptal) throw e;
        sonHata = e && e.message ? e.message : String(e);
        try { K.fs.unlinkSync(zip); } catch (eZ2) {}
      }
    }
    throw new Error("ffmpeg kurulamadı: " + sonHata);
  }

  /*
   * Arsivden YALNIZ ffmpeg ikilisini cikar. Windows'un yerlesik bsdtar'i joker
   * desen + --strip-components destekliyor; boylece 100 MB'lik arsivden ffplay,
   * ffprobe ve belgeler acilmadan tek dosya aliniyor.
   * Joker desteklenmezse tumunu acip dosyayi arayan yedege dusulur.
   */
  async function ffmpegCikar(zip, dir, kaynak) {
    var hedefAd = K.MAC ? "ffmpeg" : "ffmpeg.exe";
    var hedef = K.path.join(dir, hedefAd);
    try { K.fs.unlinkSync(hedef); } catch (e) {}

    if (!K.MAC) {
      var tarExe = K.path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
      if (K.fs.existsSync(tarExe)) {
        var r = await K.run(tarExe, ["-xf", zip, "-C", dir,
          "--strip-components=" + kaynak.strip, kaynak.desen], { timeout: 300000 });
        if (r.code === 0 && K.fs.existsSync(hedef)) return true;
      }
    }

    // Yedek: arsivi tumuyle ac, ikiliyi bul, tasi, gerisini temizle
    var gecici = K.path.join(dir, "_ac");
    K.rmrf(gecici);
    var ok = await K.unzip(zip, gecici);
    if (!ok) return false;

    var bulunan = ikiliAra(gecici, hedefAd, 4);
    if (bulunan) {
      try { K.fs.copyFileSync(bulunan, hedef); } catch (e3) { return false; }
    }
    K.rmrf(gecici);
    return !!bulunan && K.fs.existsSync(hedef);
  }

  function ikiliAra(kok, ad, derinlik) {
    if (derinlik < 0) return null;
    var girisler;
    try { girisler = K.fs.readdirSync(kok, { withFileTypes: true }); } catch (e) { return null; }
    for (var i = 0; i < girisler.length; i++) {
      var tam = K.path.join(kok, girisler[i].name);
      if (girisler[i].isDirectory()) {
        var alt = ikiliAra(tam, ad, derinlik - 1);
        if (alt) return alt;
      } else if (girisler[i].name.toLowerCase() === ad.toLowerCase()) {
        return tam;
      }
    }
    return null;
  }

  return {
    MODELS: MODELS,
    installFfmpeg: installFfmpeg,
    modelById: modelById,
    installedModels: installedModels,
    activeModel: activeModel,
    activeModelPath: activeModelPath,
    vadPath: vadPath,
    detectGpu: detectGpu,
    gpuInfo: gpuInfo,
    installedBuild: installedBuild,
    install: install,
    installModel: installModel,
    kurulumSuruyor: kurulumSuruyor,
    buildArgs: buildArgs,
    fmtMB: fmtMB,
    modelIceAktar: modelIceAktar,
    ozelModeller: ozelModeller,
    motorKaynakAdresi: motorKaynakAdresi,
    kurulumModeli: kurulumModeli,
    modelKisaAdi: modelKisaAdi,
    dogrulanmadiMi: dogrulanmadiMi,
    dogrulanmamisModeller: dogrulanmamisModeller,
    modelYenidenDogrula: modelYenidenDogrula,
    _hfBeklenenOzet: hfBeklenenOzet,
    _hfDepo: hfDepo,
    _modelDogrula: modelDogrula
  };
})();
