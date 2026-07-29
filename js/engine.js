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

  function modelById(id) {
    for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === id) return MODELS[i];
    return null;
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
    // tercih yoksa: turbo > large > small > base > tiny sırası
    var order = ["turbo", "large", "small", "base", "tiny"];
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

  // Aynalı + ilerlemeli indirme.
  // label aynı zamanda mantıksal kimlik: yarım dosya (.part) yalnızca aynı kimliğe devam eder,
  // böylece aynalar arası devam korunur ama farklı dosyalar birbirine eklenmez.
  async function fetchFile(item, destPath, onPct, label) {
    var urls = item.urls || [item.url];
    var lastErr = "";
    var kept = 0;
    for (var i = 0; i < urls.length; i++) {
      if (i > 0) K.log("indirme aynasi deneniyor (" + (i + 1) + "/" + urls.length + "): " + label);
      var r = await K.download(urls[i], destPath, function (f) {
        if (onPct) onPct(f);
      }, 0, undefined, { key: label, expectedMB: item.sizeMB });
      if (r.ok) return { ok: true };
      lastErr = r.error || "bilinmeyen hata";
      if (r.kept) kept = r.kept;
      K.log("indirme basarisiz [" + label + "] kaynak " + (i + 1) + ": " + lastErr);
    }
    return { ok: false, error: lastErr, kept: kept };
  }

  /*
   * İndirme hatasını kullanıcıya anlaşılır anlat. Korunan yarım dosyayı söylemek şart:
   * yoksa kullanıcı her şeyin baştan ineceğini sanıp vazgeçiyor ya da klasörü siliyor.
   */
  function indirmeHatasi(ad, d, item) {
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
   * opts: { modelId, useGpu, onStatus(msg) }
   */
  async function install(opts) {
    opts = opts || {};
    var say = opts.onStatus || function () {};
    if (!K.nodeOK) throw new Error("Bu ortamda kurulamaz — Premiere içinde dene.");

    var dir = K.whisperDir();
    K.fs.mkdirSync(K.path.join(dir, "models"), { recursive: true });

    var model = modelById(opts.modelId) || modelById("turbo");

    /* 1) motor derlemesi — zaten varsa atla */
    var haveExe = !!K.whisperLocal({ skipModel: true });
    var wantBuild = opts.useGpu ? "cuda" : "cpu";
    if (!haveExe || installedBuild() !== wantBuild) {
      var build = BUILDS[wantBuild];
      say("Motor iniyor… (" + fmtMB(build.sizeMB) + ")");
      // Derleme başına ayrı ad: yarım kalan cuBLAS .part'ı CPU zip'ine eklenmesin
      var zipPath = K.path.join(dir, "engine-" + build.id + ".zip");
      var d1 = await fetchFile(build, zipPath, function (f) {
        say("Motor iniyor… %" + Math.round(f * 100) + " (" + fmtMB(build.sizeMB) + ")");
      }, "motor:" + build.id);
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
        }, "motor:cpu");
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

    /* 2) model */
    var mPath = K.path.join(dir, "models", model.file);
    var already = installedModels().some(function (m) { return m.id === model.id; });
    if (!already) {
      say(model.label + " iniyor… (" + fmtMB(model.sizeMB) + ")");
      var d3 = await fetchFile(model, mPath, function (f) {
        say(model.label + " iniyor… %" + Math.round(f * 100) + " (" + fmtMB(model.sizeMB) + ")");
      }, "model:" + model.id);
      if (!d3.ok) throw indirmeHatasi(model.label.split(" —")[0], d3, model);
    }

    /* 3) VAD — küçük, sessizlikleri atlayıp hızlandırır */
    if (!vadPath()) {
      say("Sessizlik dedektörü iniyor… (2 MB)");
      var vPath = K.path.join(dir, "models", VAD.file);
      var d4 = await fetchFile(VAD, vPath, null, "vad");
      if (!d4.ok) K.log("VAD indirilemedi (kritik degil): " + d4.error);
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
        }, "motor:cpu");
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
    }

    cleanEngineParts(dir);
    return { model: model, build: installedBuild(), vad: !!vadPath() };
  }

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
   * transcribeLocal için argüman üretir — VAD, beam search, thread, GPU.
   * wordLevel: karaoke modu
   */
  function buildArgs(o) {
    var args = [
      "-m", o.model,
      "-f", o.audio,
      "-l", o.lang || "auto",
      "-oj", "-of", o.outBase,
      "-t", String(o.threads || 4),
      "-pp"
    ];

    // VAD: sessizlikleri atla (büyük hız kazancı + halüsinasyon azalır)
    // Not: -vp ve -vsd MİLİSANİYE cinsinden (whisper-cli varsayılanları 30 / 100).
    var vp = vadPath();
    if (vp) {
      args.push("--vad", "-vm", vp);
      args.push("-vsd", "500");   // 500 ms altındaki sessizlikte segment bölme
      args.push("-vp", "250");    // konuşma sınırlarına 250 ms tampon (kelime yutulmasın)
    }

    if (o.wordLevel) args.push("-ml", "1", "-sow");
    return { args: args, vad: !!vp };
  }

  return {
    MODELS: MODELS,
    modelById: modelById,
    installedModels: installedModels,
    activeModel: activeModel,
    activeModelPath: activeModelPath,
    vadPath: vadPath,
    detectGpu: detectGpu,
    gpuInfo: gpuInfo,
    installedBuild: installedBuild,
    install: install,
    buildArgs: buildArgs,
    fmtMB: fmtMB
  };
})();
