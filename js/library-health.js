/*
 * Suflo Doctor — sistem ve icerik saglik kontrolu
 *
 * Premiere koprusu, ffmpeg, yerel motor/model, GPU, Pro esitleme, preset paketi
 * ve yerel kutuphaneleri tek raporda toplar. Tarama salt okunurdur. Kullanici
 * acikca Onar'a basarsa yalniz guvenli kurulum/esitleme islemleri calisir;
 * timeline'a veya kullanicinin medya dosyalarina dokunulmaz.
 */
window.KLibraryHealth = (function () {
  "use strict";

  // Tarayıcı penceresi / Premiere iletişim kutusu DOM değil: çevirmen göremez, metin burada çevrilir
  function uiMetni(s) { return window.SufloI18n ? SufloI18n.tr(s) : s; }

  var AUDIO_RE = /\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i;
  var AUDIO_LIKE_RE = /\.(aac|caf|opus|ac3|amr|ape)$/i;
  var VISUAL_RE = /\.(png|webp|gif|jpe?g)$/i;
  var lastReport = null;
  var busy = false;
  var ACTIONS = {
    "repair-ffmpeg": "FFmpeg'i onar",
    "repair-engine": "Motoru onar",
    "sync-pro": "Eşitle",
    "clear-folders": "Bağlantıyı temizle",
    "check-update": "Güncelle",
    "update-ytdlp": "yt-dlp'yi güncelle",
    "verify-model": "Doğrula"
  };
  var GROUP_LABELS = {
    system: "Sistem",
    premiere: "Premiere",
    engine: "Altyazı motoru",
    pro: "Pro içerikler",
    libraries: "Kütüphaneler"
  };
  var GROUP_ORDER = ["system", "premiere", "engine", "pro", "libraries"];
  // En sık destek mesajı: "Suflo menüde yok". Panel açılmadan önce olduğu için
  // çözüm panel dışında, sitede; Doctor raporu ve kartı bu sayfayı gösterir.
  var PANEL_REHBERI = "https://suflo.app/blog/premiere-suflo-paneli-gorunmuyor";

  function el(id) { return document.getElementById(id); }
  function norm(p) { return String(p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase(); }
  function basename(p) { return String(p || "").replace(/^.*[\\\/]/, ""); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function formatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(n < 104857600 ? 1 : 0) + " MB";
    return (n / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }

  function baseDir() {
    if (!K.nodeOK || !K.path || !K.os) return "";
    var sp = K.settingsPath ? K.settingsPath() : null;
    return sp ? K.path.dirname(sp) : K.path.join(K.os.homedir(), "Suflo");
  }

  function roots(type) {
    if (!K.nodeOK || !K.path) return [];
    var out = [];
    if (type === "mogrt" && K.extensionPath) {
      var ext = K.extensionPath();
      if (ext) out.push({ path: K.path.join(ext, "content", "mogrt"), label: "Suflo Originals", builtin: true });
    }
    if (type === "emoji") {
      var emojiRoot = String(K.settings().emojiAssetsKlasor || "").trim();
      if (emojiRoot) out.push({ path: emojiRoot, label: "Bağlı klasör", builtin: false });
      return out;
    }
    var builtin = K.path.join(baseDir(), type === "mogrt" ? "mogrt" : "sfx");
    out.push({ path: builtin, label: "Suflo klasörü", builtin: true });
    var key = type === "mogrt" ? "mogrtEkKlasor" : "sfxEkKlasor";
    var extra = String(K.settings()[key] || "").trim();
    var duplicate = out.some(function (root) { return norm(root.path) === norm(extra); });
    if (extra && !duplicate) out.push({ path: extra, label: "Bağlı klasör", builtin: false });
    // Suflo Pro Paketi (satin alanin gosterdigi klasor)
    var packRoot = String(K.settings().proPackKlasor || "").trim();
    if (packRoot) {
      var sub = K.path.join(packRoot, type === "mogrt" ? "mogrt" : "sfx");
      var packPath = packRoot;
      try { if (K.fs && K.fs.existsSync(sub) && K.fs.statSync(sub).isDirectory()) packPath = sub; } catch (e) {}
      if (!out.some(function (root) { return norm(root.path) === norm(packPath); }))
        out.push({ path: packPath, label: "Suflo Pro paketi", builtin: false });
    }
    return out;
  }

  function mogrtZipMi(file) {
    var fd = null;
    try {
      var b = Buffer.alloc ? Buffer.alloc(4) : new Buffer(4);
      fd = K.fs.openSync(file, "r");
      var n = K.fs.readSync(fd, b, 0, 4, 0);
      K.fs.closeSync(fd); fd = null;
      return n >= 2 && b[0] === 0x50 && b[1] === 0x4b;
    } catch (e) {
      try { if (fd !== null) K.fs.closeSync(fd); } catch (e2) {}
      return false;
    }
  }

  function scan(type, maxFiles, maxDepth) {
    var result = {
      type: type, files: [], count: 0, bytes: 0, suspicious: [], unsupported: [],
      duplicates: [], unreadable: [], truncated: false, roots: []
    };
    if (!K.nodeOK || !K.fs || !K.path) return result;
    maxFiles = maxFiles || 20000;
    maxDepth = maxDepth === undefined ? 12 : maxDepth;
    var seenPaths = {};
    var names = {};

    function walk(dir, depth) {
      if (result.files.length >= maxFiles) { result.truncated = true; return; }
      if (depth < 0) { result.truncated = true; return; }
      var entries;
      try { entries = K.fs.readdirSync(dir, { withFileTypes: true }); }
      catch (e) { result.unreadable.push(dir); return; }
      for (var i = 0; i < entries.length; i++) {
        if (result.files.length >= maxFiles) { result.truncated = true; break; }
        var entry = entries[i];
        if (entry.name.charAt(0) === ".") continue;
        var full = K.path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, depth - 1); continue; }

        var accepted = type === "mogrt" ? /\.mogrt$/i.test(entry.name) : (type === "emoji" ? VISUAL_RE.test(entry.name) : AUDIO_RE.test(entry.name));
        if (!accepted) {
          if (type === "sfx" && AUDIO_LIKE_RE.test(entry.name)) result.unsupported.push(full);
          continue;
        }
        var key = norm(full);
        if (seenPaths[key]) continue;
        seenPaths[key] = 1;
        var size = 0;
        try { size = K.fs.statSync(full).size || 0; }
        catch (eS) { result.unreadable.push(full); continue; }
        result.files.push(full);
        result.bytes += size;
        var nkey = basename(full).toLowerCase();
        if (!names[nkey]) names[nkey] = [];
        names[nkey].push(full);
        if (size === 0 || (type === "mogrt" && !mogrtZipMi(full))) result.suspicious.push(full);
      }
    }

    roots(type).forEach(function (root) {
      var state = { path: root.path, label: root.label, builtin: root.builtin, exists: false, directory: false };
      try {
        state.exists = K.fs.existsSync(root.path);
        state.directory = state.exists && K.fs.statSync(root.path).isDirectory();
      } catch (e) {}
      result.roots.push(state);
      if (state.directory) walk(root.path, maxDepth);
    });
    Object.keys(names).forEach(function (name) {
      if (names[name].length > 1) result.duplicates.push({ name: name, paths: names[name] });
    });
    result.count = result.files.length;
    return result;
  }

  function addCheck(report, status, title, detail, action, group) {
    report.checks.push({
      status: status,
      title: title,
      detail: detail || "",
      action: action || "",
      group: group || "libraries"
    });
    if (status === "bad") report.status = "bad";
    else if (status === "warn" && report.status === "good") report.status = "warn";
  }

  function makeReport() {
    var report = {
      status: "good", checks: [], generatedAt: new Date().toISOString(),
      version: K.VERSION || "", mogrt: null, sfx: null, emoji: null
    };
    if (!K.nodeOK || !K.fs || !K.path) {
      addCheck(report, "bad", "Panel dosya erişimi kapalı", "Premiere'i yeniden başlat; Suflo yerel motor ve içerikleri bu erişim olmadan kullanamaz.", "", "system");
      return report;
    }
    addCheck(report, "good", "Panel dosya erişimi", "Hazır", "", "system");
    report.mogrt = scan("mogrt");
    report.sfx = scan("sfx");
    report.emoji = scan("emoji");

    [report.mogrt, report.sfx, report.emoji].forEach(function (r) {
      var ad = r.type === "mogrt" ? "MOGRT" : (r.type === "emoji" ? "Emoji Assets" : "SFX");
      var missing = r.roots.filter(function (x) { return !x.builtin && !x.directory; });
      var remoteEmoji = r.type === "emoji" && String(K.settings().emojiAssetsCatalogUrl || "").trim();
      var freeSfx = r.type === "sfx" && window.Pro && Pro.isPro && !Pro.isPro() && !String(K.settings().sfxEkKlasor || "").trim();
      if (missing.length) addCheck(report, "bad", ad + " klasörü bulunamadı", missing[0].path, "clear-folders", "libraries");
      else if (!r.count && remoteEmoji) addCheck(report, "good", "Emoji içerik bulutu", "Uzak katalog bağlı · görseller seçilince güvenli önbelleğe alınır.");
      else if (!r.count && freeSfx) addCheck(report, "good", "SFX arşivi", "Suflo Free kullanılıyor · kendi klasörünü istersen bağlayabilirsin.");
      else if (!r.count) addCheck(report, "warn", ad + " arşivi boş", "Ayarlar'dan klasör bağla veya dosyaları Suflo klasörüne ekle.");
      else addCheck(report, "good", ad + " arşivi", r.count + " dosya · " + formatBytes(r.bytes));

      if (r.suspicious.length) addCheck(report, "warn", ad + " içinde şüpheli dosya", r.suspicious.length + " dosya boş, okunamıyor veya geçerli paket görünmüyor.");
      if (r.unsupported.length) addCheck(report, "warn", "Desteklenmeyen ses biçimi", r.unsupported.length + " dosya (AAC/CAF/OPUS gibi) listelenmeyecek.");
      if (r.duplicates.length) addCheck(report, "warn", ad + " yinelenen adlar", r.duplicates.length + " dosya adı birden fazla klasörde geçiyor.");
      if (r.unreadable.length) addCheck(report, "bad", ad + " okunamayan konum", r.unreadable.length + " dosya veya klasöre erişilemiyor.");
      if (r.truncated) addCheck(report, "warn", ad + " tarama sınırı", "Arşiv çok büyük veya çok derin; ilk 20.000 dosya kontrol edildi.");
    });
    return report;
  }

  function safeJson(file) {
    try { return JSON.parse(K.fs.readFileSync(file, "utf8")); } catch (e) { return null; }
  }

  function versionParts(value) {
    return String(value || "").replace(/^v/i, "").split(".").map(function (x) { return parseInt(x, 10) || 0; });
  }

  function newerVersion(remote, local) {
    var a = versionParts(remote), b = versionParts(local);
    for (var i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true;
      if ((a[i] || 0) < (b[i] || 0)) return false;
    }
    return false;
  }

  function localSystemChecks(report) {
    if (!K.nodeOK || !K.fs || !K.path) return;
    try {
      var settingsFile = K.settingsPath && K.settingsPath();
      var settingsDir = settingsFile ? K.path.dirname(settingsFile) : "";
      if (!settingsDir) throw new Error("ayar klasörü bulunamadı");
      K.fs.accessSync(settingsDir, K.fs.constants ? K.fs.constants.W_OK : 2);
      addCheck(report, "good", "Ayar ve önbellek klasörü", "Yazılabilir", "", "system");
    } catch (e) {
      addCheck(report, "bad", "Ayar klasörüne yazılamıyor", K.hataYardimi ? K.hataYardimi(e) : String(e), "", "system");
    }

    try {
      var ext = K.extensionPath && K.extensionPath();
      var manifest = ext ? K.path.join(ext, "CSXS", "manifest.xml") : "";
      if (!manifest || !K.fs.existsSync(manifest)) throw new Error("manifest.xml bulunamadı");
      var raw = K.fs.readFileSync(manifest, "utf8");
      var m = /ExtensionBundleVersion="([^"]+)"/i.exec(raw);
      var installed = m ? m[1] : "";
      if (installed && K.VERSION && installed !== K.VERSION) {
        addCheck(report, "warn", "Sürüm dosyaları birbiriyle uyuşmuyor", "Manifest " + installed + " · panel " + K.VERSION, "check-update", "system");
      } else {
        addCheck(report, "good", "Suflo kurulum dosyaları", "v" + (installed || K.VERSION || "?"), "", "system");
      }
    } catch (eM) {
      addCheck(report, "bad", "Suflo kurulumu eksik", String(eM && eM.message ? eM.message : eM), "check-update", "system");
    }

    try {
      if (K.fs.statfsSync) {
        var stat = K.fs.statfsSync(baseDir());
        var free = Number(stat.bavail || stat.bfree || 0) * Number(stat.bsize || 0);
        if (free && free < 2 * 1024 * 1024 * 1024) {
          addCheck(report, "warn", "Disk alanı azalıyor", formatBytes(free) + " boş · motor ve Pro güncellemeleri için en az 2 GB önerilir.", "", "system");
        } else if (free) {
          addCheck(report, "good", "Disk alanı", formatBytes(free) + " boş", "", "system");
        }
      }
    } catch (eD) {}
  }

  /*
   * 3.0 ozelliklerinin Premiere API gereksinimleri (KS_apiProbe). null = aktif
   * sekans yokken sinanamadi. Doner: Doctor kontrol satirlari.
   */
  function apiKontrolleri(a) {
    var out = [];
    var gerek = [
      { k: "subsequence", ad: "Alt sekans (createSubsequence)", etki: "Shorts sekansları oluşturulamaz" },
      { k: "autoReframe", ad: "Auto Reframe", etki: "Shorts'un 9:16 kopyası çıkmaz (yatay sekans yine oluşur)" },
      { k: "markers", ad: "Marker API", etki: "Bölüm, viral ve B-roll marker'ları eklenemez" },
      { k: "qeAddTracks", ad: "QE kanal ekleme", etki: "Boş kanal yoksa Sesi iyileştir / katmanlar yeni kanal açamaz" },
      { k: "trackItemDisabled", ad: "Klip devre dışı bırakma", etki: "Sesi iyileştir orijinal sesi kapatamaz (elle kapat)" },
      { k: "seqFromClips", ad: "Klipten sekans (createNewSequenceFromClips)", etki: "Rehberin örnek klibi sekansa kendiliğinden konmaz; klibi Yeni Öğe simgesine sürüklemen gerekir" },
      // Hız Rampası (KS_apiProbe yalnız typeof okur; setSpeed hiçbir zaman çağrılmaz)
      { k: "qeSetSpeed", ad: "QE hız yazma (setSpeed)", etki: "Hız Rampası klibe hız yazamaz" },
      { k: "unlinkSelection", ad: "Bağlantı koparma (unlinkSelection)", etki: "Sesle bağlı kliplerde Hız Rampası önce Ctrl+L ile bağlantıyı koparmanı ister" },
      { k: "interp", ad: "Kare harmanlama (setTimeInterpolationType)", etki: "Hız Rampası parçalara kare harmanlamayı açamaz; Premiere'de elle aç" },
      { k: "speedRead", ad: "Hız okuma (getSpeed)", etki: "Hızı değişmiş klipler süre karşılaştırmasıyla bulunur" }
    ];
    var eksik = [], bilinmeyen = [];
    gerek.forEach(function (g) {
      if (a[g.k] === false) eksik.push(g);
      else if (a[g.k] === null || a[g.k] === undefined) bilinmeyen.push(g.ad);
    });
    if (!a.qe) eksik.push({ ad: "QE DOM", etki: "Razor kesimleri ve kanal ekleme çalışmaz" });
    if (!eksik.length) {
      out.push({ status: "good", title: "Suflo 3.0 Premiere API'leri",
        detail: bilinmeyen.length ? "Sınananların hepsi var · sekans açıp tekrar tara: " + bilinmeyen.join(", ") : "Hepsi bu Premiere sürümünde mevcut",
        group: "premiere" });
    } else {
      eksik.forEach(function (g) {
        out.push({ status: "warn", title: "Premiere'de yok: " + g.ad, detail: g.etki, group: "premiere" });
      });
    }
    // Bilgi: Premiere bir gün Zaman Yeniden Eşleme'yi betiklere açarsa (Hız Rampası Katman 3)
    if (a.timeRemapApi === true) {
      out.push({ status: "good", title: "Zaman Yeniden Eşleme API'si açık",
        detail: "Bu Premiere sürümü Zaman Yeniden Eşleme'yi betiklere gösteriyor; Hız Rampası ileride gerçek eğri yazabilir", group: "premiere" });
    }
    return out;
  }

  async function premiereChecks() {
    if (!K.call) return [{ status: "warn", title: "Premiere bağlantısı sınanamadı", detail: "Paneli Premiere içinde açıp tekrar tara.", group: "premiere" }];
    try {
      var r = await K.call("KS_getContext", undefined, 8000);
      if (!r || !r.ok) throw new Error(r && r.error ? r.error : "yanıt alınamadı");
      var sonuc = [{
        status: "good", title: "Premiere bağlantısı",
        detail: "Premiere " + (r.app || "?") + (r.hasSeq ? " · sekans: " + (r.sequence || "açık") : " · aktif sekans yok"),
        group: "premiere"
      }];
      try {
        var a = await K.call("KS_apiProbe", undefined, 8000);
        if (a && a.ok) apiKontrolleri(a).forEach(function (c) { sonuc.push(c); });
      } catch (eA) {}
      return sonuc;
    } catch (e) {
      return [{ status: "bad", title: "Premiere bağlantısı yanıt vermiyor", detail: K.hataYardimi ? K.hataYardimi(e) : String(e), group: "premiere" }];
    }
  }

  async function ffmpegChecks() {
    if (!K.findFfmpeg) return [{ status: "bad", title: "FFmpeg denetlenemedi", detail: "Panel köprüsü eksik.", action: "repair-ffmpeg", group: "engine" }];
    try {
      var ff = await K.findFfmpeg(true);
      if (!ff) return [{ status: "bad", title: "FFmpeg bulunamadı", detail: "Altyazı, kesim, zoom ve ritim analizi çalışmaz.", action: "repair-ffmpeg", group: "engine" }];
      if (K.ffmpegLibass && K.ffmpegLibass() === false) {
        return [{ status: "warn", title: "FFmpeg altyazı çizemiyor (libass yok)", detail: ff + " · Altyazı Efektleri ve kanca başlığı çalışmaz; Suflo'nun ffmpeg'ini kur.", action: "repair-ffmpeg", group: "engine" }];
      }
      return [{ status: "good", title: "FFmpeg", detail: ff, group: "engine" }];
    } catch (e) {
      return [{ status: "bad", title: "FFmpeg çalışmıyor", detail: K.hataYardimi ? K.hataYardimi(e) : String(e), action: "repair-ffmpeg", group: "engine" }];
    }
  }

  /*
   * Yerel motor seçenekleri (js/whisper-args.js doctorSatirlari): Ayarlar › Çözme ve "Hassas kelime
   * zamanlaması (DTW)" — derleme -dtw / -nfa tanıyor mu (whisper-cli -h), modelin ön ayarı var mı,
   * bu model + derlemede otomatik kapatıldı mı. Yalnız okur; ayar yazmaz.
   */
  function motorSecenekSatirlari(probe, model, ready, build) {
    var WAR = window.SufloWhisperArgs;
    if (!WAR || !WAR.doctorSatirlari) return [];
    var s = K.settings ? K.settings() : {};
    var yardim = probe ? WAR.yardimDestegi(String(probe.stdout || "") + "\n" + String(probe.stderr || "")) : null;
    return WAR.doctorSatirlari({
      cozme: s.cozme, dtwAyar: s.dtw === true, model: model && model.id ? model.id : (ready && ready.model) || "",
      derleme: build, dtwKapali: s.dtwKapali, yardim: yardim
    }).map(function (c) { return { status: c.status, title: c.title, detail: c.detail, group: "engine" }; });
  }

  async function engineChecks() {
    var checks = [];
    var settings = K.settings ? K.settings() : {};
    var provider = String(settings.provider || "local");
    var cloudReady = provider !== "local" && (!!String(settings.apiKey || "").trim() || provider === "custom");
    var executable = K.whisperLocal ? K.whisperLocal({ skipModel: true }) : null;
    var ready = K.whisperLocal ? K.whisperLocal() : null;
    if (!executable) {
      checks.push({ status: cloudReady ? "warn" : "bad", title: "Yerel motor kurulu değil", detail: cloudReady ? "Suflo bulut yedeğiyle çalışabilir; çevrimdışı kullanım için yerel çekirdeği kur." : "Doctor motoru, modeli ve gerekli yardımcı dosyaları kurabilir.", action: "repair-engine", group: "engine" });
    } else if (!ready) {
      checks.push({ status: cloudReady ? "warn" : "bad", title: "Yerel model eksik veya bozuk", detail: "Seçili model yeniden doğrulanmalı.", action: "repair-engine", group: "engine" });
    } else {
      try {
        var probe = await K.run(ready.exe, ["-h"], { timeout: 60000 });
        if (!probe || probe.code !== 0) throw new Error("motor kod=" + (probe ? probe.code : "?"));
        var model = window.KEngine && KEngine.activeModel ? KEngine.activeModel() : null;
        var build = window.KEngine && KEngine.installedBuild ? KEngine.installedBuild() : "cpu";
        var modelAdi = model ? (KEngine.modelKisaAdi ? KEngine.modelKisaAdi(model) : model.label.split(" —")[0]) : basename(ready.model);
        checks.push({ status: "good", title: "Yerel altyazı motoru", detail: modelAdi + " · " + String(build).toUpperCase(), group: "engine" });
        // 3.4 adım 19: çevrimdışı içe aktarılıp SHA-256'sı denetlenmemiş model ("doğrulanmadı")
        if (model && KEngine.dogrulanmadiMi && KEngine.dogrulanmadiMi(model)) {
          checks.push({ status: "warn", title: "Model doğrulanmadı", detail: modelAdi + " çevrimdışı içe aktarıldı; SHA-256 henüz denetlenmedi. İnternet varken Doğrula'ya bas.", action: "verify-model", group: "engine" });
        }
        // 3.2 adım 5: etkin çözme modu ve DTW desteği (yardım metni yukarıdaki "-h" yoklamasından)
        motorSecenekSatirlari(probe, model, ready, build).forEach(function (c) { checks.push(c); });
      } catch (eP) {
        checks.push({ status: cloudReady ? "warn" : "bad", title: "Yerel motor açılmıyor", detail: K.hataYardimi ? K.hataYardimi(eP) : String(eP), action: "repair-engine", group: "engine" });
      }
    }
    if (provider !== "local") {
      var needsKey = provider === "groq" || provider === "openai";
      if (needsKey && !String(settings.apiKey || "").trim()) {
        checks.push({ status: ready ? "warn" : "bad", title: "Bulut yedeği hazır değil", detail: "Yedek bağlantı seçili ancak API anahtarı eksik.", group: "engine" });
      } else {
        checks.push({ status: "good", title: "Otomatik motor yedeği", detail: provider + " · yalnız yerel rota çalışmazsa kullanılır", group: "engine" });
      }
    }

    if (window.KEngine && KEngine.detectGpu) {
      try {
        var gpu = await KEngine.detectGpu(true);
        var label = gpu.kind === "cuda" ? (gpu.name || "NVIDIA CUDA") : (gpu.kind === "metal" ? "Apple Silicon · Metal" : "CPU modu");
        checks.push({ status: "good", title: "Donanım hızlandırma", detail: label, group: "engine" });
      } catch (eG) {
        checks.push({ status: "warn", title: "GPU denetlenemedi", detail: String(eG && eG.message ? eG.message : eG), group: "engine" });
      }
    }
    return checks;
  }

  async function networkChecks() {
    if (!K.httpGet || !K.REPO) return [];
    try {
      var r = await K.httpGet("https://api.github.com/repos/" + K.REPO + "/releases/latest", { "Accept": "application/vnd.github+json" });
      if (!r || r.status !== 200) throw new Error(r && r.body ? String(r.body).slice(0, 100) : "bağlantı kurulamadı");
      var data = JSON.parse(r.body || "{}");
      var latest = String(data.tag_name || "").replace(/^v/i, "");
      if (latest && newerVersion(latest, K.VERSION)) {
        return [{ status: "warn", title: "Yeni Suflo sürümü var", detail: "v" + latest + " hazır · kurulu v" + K.VERSION, action: "check-update", group: "system" }];
      }
      return [{ status: "good", title: "Güncelleme bağlantısı", detail: "Suflo v" + (K.VERSION || latest || "?") + " güncel", group: "system" }];
    } catch (e) {
      return [{ status: "warn", title: "İnternet bağlantısı sınanamadı", detail: "Yerel özellikler çalışmaya devam eder · " + String(e && e.message ? e.message : e), group: "system" }];
    }
  }

  /*
   * 3.4 adım 19 — "Model kaynaklarını sına": huggingface.co, hf-mirror.com ve motor sürüm
   * sunucusuna 5 sn zaman aşımlı (duvar saati: DNS, bağlantı, vekil tüneli dahil) HEAD isteği
   * (paralel). Her kaynağın adı HEAD ile aynı anda çözülür: 146.112.0.0/16 (Cisco Umbrella) /
   * 0.0.0.0 kurumsal filtre olarak anlatılır (HEAD yanıt verse bile: engel sunucusu 200/302 döner).
   * Satırlar js/ag-dayanim.js kaynakSatirlari ile kurulur (group "engine", kaynak: true).
   * Yalnız düğmeyle çalışır: panel açılışında ve normal taramada ağ isteği yapılmaz.
   * Sistem kökleri düğmeye basılınca önceden OKUNMAZ (Windows'ta gizli PowerShell yalnız gerçek bir sertifika
   * hatasında başlar); okuma 5 sn'ye sığmazsa satır HTTPS denetimini ve "birkaç saniye sonra yeniden sına"yı söyler.
   */
  async function kaynakSina() {
    var ag = window.SufloAgDayanim;
    if (!ag || !K.httpGet) return [];
    var motorUrl = window.KEngine && KEngine.motorKaynakAdresi ? KEngine.motorKaynakAdresi() : "";
    var adresler = ag.kaynakAdresleri(motorUrl);
    var sonuclar = await Promise.all(adresler.map(async function (a) {
      var t0 = Date.now(), r = null;
      // DNS her kaynak için ve HEAD ile AYNI ANDA sorulur (en çok 3 sn, toplam süre 5 sn'yi aşmaz):
      // Cisco Umbrella kök sertifikası kurulu ağda engel sunucusu TLS'i geçip 200 / 302 döner,
      // yalnız HEAD'e bakmak engellenen kaynağı "ulaşılıyor" gösterirdi
      var dnsIsi = K.dnsEngeli ? Promise.resolve().then(function () { return K.dnsEngeli(a.host); }).then(null, function () { return ""; }) : Promise.resolve("");
      try { r = await K.httpGet(a.url, {}, { method: "HEAD", timeout: ag.SINAMA_ZAMAN_ASIMI, sistemKokleri: true }); }
      catch (e) { r = { status: 0, body: String(e && e.message ? e.message : e) }; }
      r = r || { status: 0, body: "" };
      // Node hata kodu iletiyle birlikte taşınır: ileti OpenSSL sürümüne göre değişir (OpenSSL 3:
      // "self-signed certificate in certificate chain"), kod değişmez (SELF_SIGNED_CERT_IN_CHAIN)
      var hata = "";
      if (!r.status) {
        var metin = String(r.body || r.kod || "bağlantı kurulamadı");
        hata = r.kod ? { code: String(r.kod), message: metin } : metin;
      }
      var s = {
        id: a.id, ad: a.ad, host: a.host, status: Number(r.status) || 0, hata: hata,
        sure: Date.now() - t0, caDenendi: !!r.caDenendi, caSuresiDoldu: !!r.caSuresiDoldu, dnsEngelAdresi: ""
      };
      s.dnsEngelAdresi = String((await dnsIsi) || "");
      return s;
    }));
    return ag.kaynakSatirlari(sonuclar);
  }

  // Önceki sınama satırlarını at, yenilerini ekle, genel durumu yeniden hesapla
  function kaynakSatirlariniEkle(report, satirlar) {
    report.checks = (report.checks || []).filter(function (c) { return !c.kaynak; });
    (satirlar || []).forEach(function (c) {
      report.checks.push({ status: c.status, title: c.title, detail: c.detail || "", action: "", group: c.group || "engine", kaynak: true });
    });
    report.status = "good";
    report.checks.forEach(function (c) {
      if (c.status === "bad") report.status = "bad";
      else if (c.status === "warn" && report.status === "good") report.status = "warn";
    });
    return report;
  }

  async function kaynaklariSina() {
    if (busy) return lastReport;
    busy = true;
    setWorking("Model kaynakları sınanıyor…");
    try {
      // Tam tarama hiç yapılmadıysa önce o (sınamayla aynı anda): yalnız dosya erişimi ve
      // kütüphane satırlarından kurulan rapor, üç kaynak satırı iyi diye "Suflo hazır" yazıp
      // "Yerel motor kurulu değil"i hiç sınamadan Altyazı motoru çipini yeşile boyardı
      var temel = lastReport;
      var isler = [kaynakSina()];
      if (!temel) { temel = makeReport(); isler.push(runAsyncChecks(temel)); }
      var sonuclar = await Promise.all(isler);
      var satirlar = sonuclar[0];
      if (isler.length > 1 && window.KApp && KApp.refreshContext) KApp.refreshContext();
      lastReport = kaynakSatirlariniEkle(temel, satirlar);
      var kotu = satirlar.filter(function (c) { return c.status !== "good"; }).length;
      if (window.KApp) {
        KApp.toast(kotu ? "Bazı model kaynaklarına ulaşılamıyor: ayrıntı Doctor raporunda" : "Tüm model kaynaklarına ulaşılıyor", kotu ? "warn" : "good", kotu ? 9000 : 4500);
      }
      render(lastReport);
      return lastReport;
    } catch (e) {
      if (window.KApp) KApp.toast(K.hataYardimi ? K.hataYardimi(e) : String(e), "bad", 9000);
      if (lastReport) render(lastReport);
      return lastReport;
    } finally {
      busy = false;
      clearWorking();
    }
  }

  function proChecks(report) {
    if (!window.Pro || !Pro.status) return;
    var license = Pro.status();
    if (!license.ready) {
      addCheck(report, "warn", "Pro lisansı henüz doğrulanmadı", "Paneli birkaç saniye açık tutup tekrar tara.", "", "pro");
      return;
    }
    if (!license.pro) {
      addCheck(report, "good", "Lisans durumu", "Suflo Free aktif", "", "pro");
      return;
    }
    addCheck(report, "good", "Suflo Pro lisansı", license.needsRecheck ? "Çevrimdışı kullanım açık · internette yeniden doğrulanacak" : "Aktif", "", "pro");

    var settings = K.settings();
    var root = String(settings.proPackKlasor || "").trim();
    var managed = !!settings.proPackManaged;
    if (!root || !K.fs.existsSync(root)) {
      addCheck(report, "bad", "Pro içerik klasörü bulunamadı", root || "İçerikler henüz kurulmamış.", "sync-pro", "pro");
      return;
    }
    if (!managed) {
      addCheck(report, "good", "Eski Pro Pack bağlantısı", root, "", "pro");
      return;
    }

    var manifestFile = K.path.join(root, ".suflo-manifest.json");
    var manifest = safeJson(manifestFile);
    if (!manifest || !Array.isArray(manifest.files)) {
      addCheck(report, "bad", "Pro içerik manifesti eksik", "Çalışan klasör değişmeden yeniden eşitlenebilir.", "sync-pro", "pro");
      return;
    }
    var missing = 0, wrongSize = 0, unsafe = 0;
    var resolvedRoot = K.path.resolve(root);
    for (var i = 0; i < manifest.files.length; i++) {
      var item = manifest.files[i] || {};
      var target = K.path.resolve(root, String(item.path || "").replace(/\//g, K.path.sep));
      if (target !== resolvedRoot && target.indexOf(resolvedRoot + K.path.sep) !== 0) { unsafe++; continue; }
      try {
        var stat = K.fs.statSync(target);
        if (!stat.isFile()) missing++;
        else if (Number(item.bytes) > 0 && stat.size !== Number(item.bytes)) wrongSize++;
      } catch (eF) { missing++; }
    }
    if (unsafe || missing || wrongSize) {
      addCheck(report, "bad", "Pro içerikleri eksik veya bozuk", missing + " eksik · " + wrongSize + " boyutu hatalı" + (unsafe ? " · " + unsafe + " güvensiz kayıt" : ""), "sync-pro", "pro");
    } else {
      addCheck(report, "good", "Pro içerik bütünlüğü", manifest.files.length + " dosya · içerik " + (manifest.version || settings.proContentVersion || "?"), "", "pro");
    }

    var presetItems = manifest.files.filter(function (item) { return /^presets\/.+\.prfpset$/i.test(String(item.path || "")); });
    if (!presetItems.length) {
      addCheck(report, "bad", "Preset paketi manifestte yok", "Pro presetleri eşitlenmeli.", "sync-pro", "pro");
    } else {
      var presetFile = K.path.join(root, String(presetItems[0].path).replace(/\//g, K.path.sep));
      try {
        if (!window.SufloPresetPack) throw new Error("preset okuyucu yüklenmedi");
        var parsed = SufloPresetPack.parse(K.fs.readFileSync(presetFile, "utf8"));
        var expected = 0;
        try { expected = window.KPresets && KPresets.packs ? Number(KPresets.packs()[0].count || 0) : 0; } catch (eE) {}
        if (!parsed.total || (expected && parsed.total !== expected)) throw new Error("okunan " + parsed.total + (expected ? "/" + expected : ""));
        addCheck(report, "good", "Premiere preset paketi", parsed.total + " efekt · " + parsed.direct + " doğrudan · " + parsed.fallback + " uyumluluk", "", "pro");
      } catch (eP) {
        addCheck(report, "bad", "Preset paketi okunamıyor", String(eP && eP.message ? eP.message : eP), "sync-pro", "pro");
      }
    }

    try {
      var releases = K.path.dirname(root);
      var staging = K.fs.readdirSync(releases, { withFileTypes: true }).filter(function (x) { return x.isDirectory() && /\.staging$/i.test(x.name); });
      if (staging.length) {
        var ps = window.ProSync && ProSync.status ? ProSync.status() : {};
        if (ps.phase === "syncing") addCheck(report, "good", "Pro güncellemesi sürüyor", ps.detail || staging[0].name, "", "pro");
        else addCheck(report, "warn", "Yarım kalan Pro güncellemesi var", "Aktif içerikler güvende; eşitleme kaldığı yerden devam edebilir.", "sync-pro", "pro");
      }
    } catch (eS) {}

    if (window.ProSync && ProSync.status) {
      var sync = ProSync.status();
      if (sync.phase === "error") addCheck(report, "warn", "Son Pro eşitlemesi tamamlanamadı", sync.error || sync.detail, "sync-pro", "pro");
    }
  }

  /*
   * YouTube indirici (3.3): yt-dlp kurulu mu, kurulum kaydıyla aynı dosya mı (SHA-256), güncelleme var mı.
   * Kurulu değilse uyarı değil (ilk kullanımda iner). Satırlar js/youtube-indir.js doctorSatiri'ndan.
   */
  async function ytdlpChecks() {
    if (!window.KYoutube || !KYoutube.doctorSatirlari) return [];
    try { return await KYoutube.doctorSatirlari(); } catch (e) {
      return [{ status: "warn", title: "yt-dlp denetlenemedi", detail: String(e && e.message ? e.message : e), group: "system" }];
    }
  }

  async function runAsyncChecks(report) {
    localSystemChecks(report);
    var batches = await Promise.all([premiereChecks(), ffmpegChecks(), engineChecks(), networkChecks(), ytdlpChecks()]);
    batches.forEach(function (checks) {
      (checks || []).forEach(function (c) { addCheck(report, c.status, c.title, c.detail, c.action, c.group); });
    });
    proChecks(report);
    return report;
  }

  function reportText(report) {
    if (!report) return "";
    var lines = ["Suflo Doctor raporu", "Sürüm: " + (report.version || "?"), "Durum: " + report.status.toUpperCase(), "Tarih: " + report.generatedAt,
      "Panel menüde görünmüyorsa: " + PANEL_REHBERI];
    var group = "";
    orderedChecks(report).forEach(function (c) {
      if (c.group !== group) {
        group = c.group;
        lines.push("", (GROUP_LABELS[group] || group).toUpperCase());
      }
      lines.push("[" + c.status.toUpperCase() + "] " + c.title + (c.detail ? " — " + c.detail : ""));
    });
    [report.mogrt, report.sfx, report.emoji].forEach(function (r) {
      if (!r) return;
      lines.push("");
      lines.push(r.type.toUpperCase() + ": " + r.count + " dosya, " + formatBytes(r.bytes));
      r.roots.forEach(function (x) { lines.push("- " + x.label + ": " + x.path + " [" + (x.directory ? "ok" : "yok") + "]"); });
      if (r.suspicious.length) lines.push("- Şüpheli ilk dosya: " + r.suspicious[0]);
      if (r.unreadable.length) lines.push("- Okunamayan ilk konum: " + r.unreadable[0]);
    });
    return lines.join("\n");
  }

  function orderedChecks(report) {
    return (report && report.checks ? report.checks : []).map(function (c, i) { return { c: c, i: i }; })
      .sort(function (a, b) {
        var ga = GROUP_ORDER.indexOf(a.c.group), gb = GROUP_ORDER.indexOf(b.c.group);
        if (ga < 0) ga = GROUP_ORDER.length;
        if (gb < 0) gb = GROUP_ORDER.length;
        return ga === gb ? a.i - b.i : ga - gb;
      }).map(function (x) { return x.c; });
  }

  function repairableActions(report) {
    var seen = {}, out = [];
    (report && report.checks || []).forEach(function (c) {
      if (!c.action || c.action === "check-update" || c.status === "good" || seen[c.action]) return;
      seen[c.action] = 1; out.push(c.action);
    });
    if (seen["repair-engine"] && seen["repair-ffmpeg"]) out = out.filter(function (a) { return a !== "repair-ffmpeg"; });
    return out;
  }

  // Karttaki dört çip (Premiere, Altyazı motoru, Pro Cloud, Presetler) taramanın gerçek sonucunu
  // gösterir: o bölümdeki en kötü durum; denetim yoksa "" (nötr). Presetler, Pro grubundaki preset
  // denetimleridir; Pro Cloud geri kalanı
  var CIPLER = {
    premiere: function (c) { return c.group === "premiere"; },
    engine: function (c) { return c.group === "engine"; },
    pro: function (c) { return c.group === "pro" && !/preset/i.test(c.title); },
    preset: function (c) { return c.group === "pro" && /preset/i.test(c.title); }
  };
  var CIP_SIRA = { good: 1, warn: 2, bad: 3 };
  function cipDurumlari(report) {
    var out = {};
    Object.keys(CIPLER).forEach(function (k) {
      var en = "";
      ((report && report.checks) || []).forEach(function (c) {
        if (CIPLER[k](c) && (CIP_SIRA[c.status] || 0) > (CIP_SIRA[en] || 0)) en = c.status;
      });
      out[k] = en;
    });
    return out;
  }
  var CIP_METNI = { good: "sorun yok", warn: "uyarı var", bad: "düzeltilmesi gereken sorun var", "": "denetlenmedi" };
  function cipleriCiz(report) {
    var d = cipDurumlari(report);
    Array.prototype.forEach.call(document.querySelectorAll("[data-doctor-cip]"), function (s) {
      var k = s.getAttribute("data-doctor-cip");
      var durum = report ? (d[k] || "") : "";
      s.className = durum;
      if (report) s.setAttribute("title", uiMetni(s.textContent) + ": " + uiMetni(CIP_METNI[durum]));
      else s.removeAttribute("title");
    });
  }

  function render(report) {
    cipleriCiz(report);
    var box = el("set-library-health-result");
    var copy = el("set-library-health-copy");
    var fixAll = el("set-doctor-fix-all");
    if (!box) return;
    box.hidden = false;
    box.className = "library-health " + report.status;
    var title = report.status === "good" ? "Suflo hazır" : (report.status === "warn" ? "Suflo çalışır, birkaç uyarı var" : "Düzeltilmesi gereken sorun var");
    var good = report.checks.filter(function (c) { return c.status === "good"; }).length;
    var html = '<div class="library-health-title"><span class="library-health-dot"></span><b>' + title + '</b><span class="doctor-score">' + good + "/" + report.checks.length + " başarılı</span></div>";
    html += '<div class="library-health-checks">';
    var group = "";
    orderedChecks(report).forEach(function (c) {
      if (c.group !== group) {
        group = c.group;
        html += '<div class="library-health-group">' + esc(GROUP_LABELS[group] || group) + "</div>";
      }
      var icon = c.status === "good" ? "✓" : (c.status === "warn" ? "!" : "×");
      html += '<div class="library-health-line ' + c.status + '"><span>' + icon + "</span><div><b>" + esc(c.title) + "</b>" + (c.detail ? "<small>" + esc(c.detail) + "</small>" : "") + "</div>";
      if (c.action && c.status !== "good" && ACTIONS[c.action]) {
        html += '<button type="button" class="doctor-repair" data-doctor-action="' + esc(c.action) + '">' + esc(ACTIONS[c.action]) + "</button>";
      }
      html += "</div>";
    });
    html += "</div>";
    box.innerHTML = html;
    if (copy) copy.hidden = false;
    if (fixAll) fixAll.hidden = repairableActions(report).length === 0;
  }

  function setWorking(label) {
    var box = el("set-library-health-result");
    var runBtn = el("set-library-health-run");
    if (runBtn) {
      if (!runBtn._doctorIdleHtml) runBtn._doctorIdleHtml = runBtn.innerHTML;
      runBtn.classList.add("is-scanning");
      runBtn.setAttribute("aria-busy", "true");
      runBtn.innerHTML = '<span class="spinner"></span><span>İşlem sürüyor…</span>';
    }
    if (box) {
      box.hidden = false; box.className = "library-health checking";
      box.innerHTML = '<div class="library-health-title"><span class="spinner"></span><b>' + esc(label || "Suflo taranıyor…") + '</b></div><div class="doctor-progress">Timeline ve medya dosyaları değiştirilmez.</div>';
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-doctor-action], #set-library-health-run, #set-doctor-fix-all, #set-doctor-kaynak"), function (b) { b.disabled = true; });
  }

  function clearWorking() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-doctor-action], #set-library-health-run, #set-doctor-fix-all, #set-doctor-kaynak"), function (b) { b.disabled = false; });
    var runBtn = el("set-library-health-run");
    if (runBtn) {
      if (runBtn._doctorIdleHtml) runBtn.innerHTML = runBtn._doctorIdleHtml;
      runBtn._doctorIdleHtml = "";
      runBtn.classList.remove("is-scanning");
      runBtn.removeAttribute("aria-busy");
    }
  }

  async function run() {
    if (busy) return lastReport;
    busy = true;
    setWorking("Suflo baştan sona taranıyor…");
    try {
      lastReport = makeReport();
      await runAsyncChecks(lastReport);
      // Doctor Premiere koprusunu basariyla sorgulamissa ana ekran da ayni
      // baglami hemen alsin. Boylece Doctor yesilken ust cubukta
      // "baglaniyor" kalmasi ve Altyazi olustur butonunun pasifligi gider.
      if (window.KApp && KApp.refreshContext) KApp.refreshContext();
      render(lastReport);
      return lastReport;
    } catch (e) {
      lastReport = lastReport || { status: "bad", checks: [], generatedAt: new Date().toISOString(), version: K.VERSION || "" };
      addCheck(lastReport, "bad", "Doctor taraması tamamlanamadı", K.hataYardimi ? K.hataYardimi(e) : String(e), "", "system");
      render(lastReport);
      return lastReport;
    } finally {
      busy = false;
      clearWorking();
    }
  }

  function refreshLibraries() {
    var jobs = [];
    try { if (window.KLib && KLib.tara) jobs.push(Promise.resolve(KLib.tara())); } catch (e) {}
    try { if (window.KSfx && KSfx.tara) jobs.push(Promise.resolve(KSfx.tara())); } catch (e2) {}
    try { if (window.KEmojiAssets && KEmojiAssets.tara) jobs.push(Promise.resolve(KEmojiAssets.tara())); } catch (e3) {}
    return Promise.all(jobs);
  }

  async function performAction(action, say) {
    say = say || function () {};
    if (action === "repair-ffmpeg") {
      if (!window.KEngine || !KEngine.installFfmpeg) throw new Error("FFmpeg kurulum motoru yüklenmedi.");
      await KEngine.installFfmpeg(say);
      if (!(await K.findFfmpeg(true))) throw new Error("FFmpeg kurulumdan sonra doğrulanamadı.");
      return;
    }
    if (action === "repair-engine") {
      if (!window.KEngine || !KEngine.install) throw new Error("Yerel motor kurulum modülü yüklenmedi.");
      var gpu = await KEngine.detectGpu(true);
      await KEngine.install({
        modelId: K.settings().model || "turbo",
        useGpu: gpu && gpu.kind === "cuda",
        onStatus: say
      });
      return;
    }
    if (action === "sync-pro") {
      if (!window.Pro || !Pro.isPro || !Pro.isPro()) { if (window.Pro) Pro.gate("propack"); throw new Error("Suflo Pro etkin değil."); }
      if (!window.ProSync) throw new Error("Pro eşitleme modülü yüklenmedi.");
      var result = await ProSync.sync({ force: true });
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "Pro içerikleri eşitlenemedi.");
      return;
    }
    if (action === "clear-folders") {
      var settings = K.settings();
      ["mogrtEkKlasor", "sfxEkKlasor", "emojiAssetsKlasor"].forEach(function (key) {
        var value = String(settings[key] || "").trim();
        if (value && (!K.fs || !K.fs.existsSync(value))) settings[key] = "";
      });
      if (!settings.proPackManaged) {
        var legacy = String(settings.proPackKlasor || "").trim();
        if (legacy && (!K.fs || !K.fs.existsSync(legacy))) settings.proPackKlasor = "";
      }
      K.saveSettings();
      await refreshLibraries();
      return;
    }
    if (action === "verify-model") {
      // 3.4 adım 19: çevrimdışı içe aktarılan katalog modelini internet varken SHA-256 ile denetle
      if (!window.KEngine || !KEngine.modelYenidenDogrula || !KEngine.dogrulanmamisModeller) throw new Error("Yerel motor kurulum modülü yüklenmedi.");
      var bekleyen = KEngine.dogrulanmamisModeller();
      for (var vi = 0; vi < bekleyen.length; vi++) {
        var dv = await KEngine.modelYenidenDogrula(bekleyen[vi].id, say);
        var vAd = KEngine.modelKisaAdi ? KEngine.modelKisaAdi(dv.model) : bekleyen[vi].id;
        if (dv.durum === "uyusmadi") throw new Error(vAd + " doğrulanamadı: SHA-256 uyuşmadı, dosya silindi. Modeli yeniden indir ya da içe aktar.");
        if (dv.durum !== "dogrulandi") throw new Error(vAd + " doğrulanamadı: huggingface.co'ya ulaşılamadı. İnternet varken yeniden dene.");
      }
      return;
    }
    if (action === "update-ytdlp") {
      if (!window.KYoutube || !KYoutube.guncelle) throw new Error("YouTube indirici yüklenmedi.");
      await KYoutube.guncelle(say);
      return;
    }
    if (action === "check-update") {
      var update = el("set-guncelleme-denetle");
      if (update) update.click();
      return;
    }
    throw new Error("Bilinmeyen Doctor onarımı: " + action);
  }

  async function repair(action) {
    if (busy || !action) return;
    if (action === "clear-folders" && window.confirm && !window.confirm(uiMetni("Yalnız artık bulunamayan harici klasör bağlantıları temizlensin mi? Dosyalar silinmez."))) return;
    busy = true;
    setWorking((ACTIONS[action] || "Sorun") + " çalışıyor…");
    try {
      await performAction(action, function (msg) { setWorking(msg); });
      if (window.KApp) KApp.toast("Suflo Doctor onarımı tamamladı", "good");
    } catch (e) {
      var message = K.hataYardimi ? K.hataYardimi(e) : String(e);
      if (window.KApp) KApp.toast(message, "bad", 12000);
      K.log("[doctor] onarim basarisiz: " + String(e && e.message ? e.message : e));
    } finally {
      busy = false;
      clearWorking();
      await run();
    }
  }

  async function repairAll() {
    if (busy || !lastReport) return;
    var actions = repairableActions(lastReport);
    if (!actions.length) return;
    if (window.confirm && !window.confirm(uiMetni("Doctor yalnız güvenli kurulum, eşitleme ve bozuk klasör bağlantılarını onaracak. Timeline ve medya dosyalarına dokunulmayacak. Devam edilsin mi?"))) return;
    busy = true;
    setWorking("Güvenli sorunlar düzeltiliyor…");
    var errors = [];
    try {
      for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        setWorking((ACTIONS[action] || action) + " · " + (i + 1) + "/" + actions.length);
        try { await performAction(action, function (msg) { setWorking(msg); }); }
        catch (e) { errors.push((ACTIONS[action] || action) + ": " + String(e && e.message ? e.message : e)); }
      }
      if (window.KApp) KApp.toast(errors.length ? ("Bazı onarımlar tamamlanamadı: " + errors[0]) : "Suflo Doctor tüm güvenli onarımları tamamladı", errors.length ? "warn" : "good", errors.length ? 12000 : 4500);
    } finally {
      busy = false;
      clearWorking();
      await run();
    }
  }

  function copyReport() {
    if (!lastReport) return;
    var txt = reportText(lastReport);
    function done() { if (window.KApp) KApp.toast("Suflo Doctor raporu kopyalandı", "good"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(function () { fallbackCopy(txt); });
    } else fallbackCopy(txt);
  }

  function fallbackCopy(txt) {
    var ta = document.createElement("textarea");
    ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    if (window.KApp) KApp.toast("Suflo Doctor raporu kopyalandı", "good");
  }

  function init() {
    var runBtn = el("set-library-health-run");
    var copyBtn = el("set-library-health-copy");
    var fixAllBtn = el("set-doctor-fix-all");
    var box = el("set-library-health-result");
    if (runBtn) runBtn.addEventListener("click", function () { run(); });
    if (copyBtn) copyBtn.addEventListener("click", copyReport);
    var panelRehberi = el("set-doctor-panel-rehberi");
    if (panelRehberi) panelRehberi.addEventListener("click", function (e) {
      e.preventDefault();
      if (K.cs && K.cs.openURLInDefaultBrowser) K.cs.openURLInDefaultBrowser(PANEL_REHBERI);
    });
    if (fixAllBtn) fixAllBtn.addEventListener("click", repairAll);
    var kaynakBtn = el("set-doctor-kaynak");
    if (kaynakBtn) kaynakBtn.addEventListener("click", function () { kaynaklariSina(); });
    if (box) box.addEventListener("click", function (event) {
      var target = event.target;
      while (target && target !== box && !target.getAttribute("data-doctor-action")) target = target.parentNode;
      if (!target || target === box) return;
      repair(target.getAttribute("data-doctor-action"));
    });
  }

  var api = {
    init: init,
    run: run,
    scan: scan,
    makeReport: makeReport,
    runAsyncChecks: runAsyncChecks,
    reportText: reportText,
    formatBytes: formatBytes,
    repair: repair,
    repairAll: repairAll,
    apiKontrolleri: apiKontrolleri,
    cipDurumlari: cipDurumlari,
    kaynakSina: kaynakSina,
    kaynaklariSina: kaynaklariSina,
    kaynakSatirlariniEkle: kaynakSatirlariniEkle,
    PANEL_REHBERI: PANEL_REHBERI,
    last: function () { return lastReport; }
  };
  window.KDoctor = api;
  return api;
})();
