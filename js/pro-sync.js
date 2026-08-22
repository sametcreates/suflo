/*
 * Suflo Pro icerik esitleme
 *
 * Lisans bir kez etkinlestirilir. Panel, lisansli manifesti arka planda alir;
 * yalniz yeni/degisen MOGRT ve SFX dosyalarini indirir. Yeni surum tamamen
 * dogrulanmadan aktif klasor degismez, bu nedenle yarim indirme calisan paketi
 * bozamaz.
 */
window.ProSync = (function () {
  "use strict";

  var crypto = null, http = null, https = null, urlmod = null;
  try {
    crypto = require("crypto");
    http = require("http");
    https = require("https");
    urlmod = require("url");
  } catch (e) {}

  var cfg = {
    endpoint: "https://assets.suflo.app/pro/v1/index.php",
    root: "",
    manifestFetcher: null,
    fileFetcher: null
  };
  var subs = [];
  var running = null;
  var initialized = false;
  var timer = null;
  var lastPro = false;
  var current = {
    phase: "idle", progress: 0, version: "", detail: "", file: "",
    downloaded: 0, copied: 0, total: 0, bytesDone: 0, bytesTotal: 0,
    lastSync: 0, path: "", error: "", offline: false
  };

  function clone(obj) {
    var out = {};
    for (var k in obj) if (obj.hasOwnProperty(k)) out[k] = obj[k];
    return out;
  }
  function status() { return clone(current); }
  function emit() {
    var s = status();
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](s); } catch (e) {}
    }
  }
  function setState(patch) {
    for (var k in patch) if (patch.hasOwnProperty(k)) current[k] = patch[k];
    emit();
  }
  function on(fn) { if (typeof fn === "function") { subs.push(fn); try { fn(status()); } catch (e) {} } }

  function ensureDir(dir) {
    if (!dir || !K.fs || K.fs.existsSync(dir)) return;
    var parent = K.path.dirname(dir);
    if (parent && parent !== dir) ensureDir(parent);
    try { K.fs.mkdirSync(dir); } catch (e) {}
  }
  function removeTree(dir) {
    if (!dir || !K.fs || !K.fs.existsSync(dir)) return;
    var st;
    try { st = K.fs.lstatSync(dir); } catch (e) { return; }
    if (!st.isDirectory() || st.isSymbolicLink()) { try { K.fs.unlinkSync(dir); } catch (e1) {} return; }
    var entries = [];
    try { entries = K.fs.readdirSync(dir); } catch (e2) {}
    entries.forEach(function (name) { removeTree(K.path.join(dir, name)); });
    try { K.fs.rmdirSync(dir); } catch (e3) {}
  }
  function readJson(file) {
    try { return JSON.parse(K.fs.readFileSync(file, "utf8")); } catch (e) { return null; }
  }
  function writeJson(file, obj) {
    ensureDir(K.path.dirname(file));
    var tmp = file + ".tmp";
    K.fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    try { if (K.fs.existsSync(file)) K.fs.unlinkSync(file); } catch (e0) {}
    K.fs.renameSync(tmp, file);
  }
  function hashFile(file) {
    return new Promise(function (resolve, reject) {
      if (!crypto) { reject(new Error("Dosya doğrulama motoru bulunamadı.")); return; }
      var h = crypto.createHash("sha256");
      var input = K.fs.createReadStream(file);
      input.on("data", function (chunk) { h.update(chunk); });
      input.on("error", reject);
      input.on("end", function () { resolve(h.digest("hex")); });
    });
  }

  function rootDir() {
    if (cfg.root) return K.path.resolve(cfg.root);
    var sp = K.settingsPath && K.settingsPath();
    if (!sp) return "";
    return K.path.join(K.path.dirname(sp), "pro-content");
  }
  function inside(root, target) {
    var r = K.path.resolve(root), t = K.path.resolve(target);
    return t === r || t.indexOf(r + K.path.sep) === 0;
  }
  function safeVersion(value) {
    value = String(value || "");
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(value)) throw new Error("Geçersiz içerik sürümü.");
    return value;
  }
  function safeItem(item) {
    if (!item || typeof item !== "object") throw new Error("Bozuk içerik kaydı.");
    var rel = String(item.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.length > 260 || /[\x00-\x1f]/.test(rel) || rel.split("/").some(function (p) { return !p || p === "." || p === ".."; }))
      throw new Error("Güvensiz içerik yolu.");
    var mogrt = /^mogrt\/.+\.mogrt$/i.test(rel);
    var sfx = /^sfx\/.+\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i.test(rel);
    var motionbg = /^motionbg\/.+\.(mp4|mov|m4v|webm)$/i.test(rel);
    if (!mogrt && !sfx && !motionbg) throw new Error("Desteklenmeyen Pro içerik türü: " + rel);
    var bytes = Number(item.bytes);
    var sha = String(item.sha256 || "").toLowerCase();
    if (!isFinite(bytes) || bytes < 1 || bytes > 4 * 1024 * 1024 * 1024) throw new Error("Geçersiz dosya boyutu: " + rel);
    if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error("Geçersiz dosya özeti: " + rel);
    return { path: rel, bytes: bytes, sha256: sha };
  }
  function validateManifest(raw) {
    if (!raw || raw.ok !== true || !raw.token) throw new Error((raw && raw.error) || "Pro içerik sunucusu yanıt vermedi.");
    var version = safeVersion(raw.content_version);
    if (!Array.isArray(raw.files) || !raw.files.length || raw.files.length > 10000) throw new Error("Pro içerik kataloğu boş veya geçersiz.");
    var seen = {}, total = 0;
    var files = raw.files.map(function (item) {
      var clean = safeItem(item);
      var key = clean.path.toLowerCase();
      if (seen[key]) throw new Error("İçerik kataloğunda yinelenen dosya: " + clean.path);
      seen[key] = true; total += clean.bytes;
      return clean;
    });
    if (total > 20 * 1024 * 1024 * 1024) throw new Error("Pro içerik kataloğu güvenli boyut sınırını aşıyor.");
    var canonical = files.map(function (f) { return f.path + ":" + f.bytes + ":" + f.sha256; }).join("\n");
    var id = crypto ? crypto.createHash("sha256").update(version + "\n" + canonical).digest("hex") : version;
    return { version: version, files: files, token: String(raw.token), totalBytes: total, manifestId: id };
  }

  async function fetchManifest(creds) {
    if (cfg.manifestFetcher) return cfg.manifestFetcher(cfg.endpoint, creds);
    var r = await K.httpJson(cfg.endpoint, { "User-Agent": "Suflo-ProSync/" + K.VERSION }, {
      action: "manifest",
      license_key: creds.licenseKey,
      instance_id: creds.instanceId,
      client_version: K.VERSION
    });
    if (!r || r.status !== 200) {
      var requestError = new Error(r && r.status ? "İçerik sunucusu HTTP " + r.status : "İçerik sunucusuna ulaşılamadı.");
      requestError.status = r && r.status ? Number(r.status) : 0;
      throw requestError;
    }
    try { return JSON.parse(r.body); } catch (e) { throw new Error("İçerik sunucusundan bozuk yanıt geldi."); }
  }

  function defaultDownload(endpoint, token, item, dest, onProgress) {
    return new Promise(function (resolve, reject) {
      if (!http || !https || !urlmod || !crypto) { reject(new Error("İndirme motoru hazır değil.")); return; }
      ensureDir(K.path.dirname(dest));
      var part = dest + ".part";
      var existing = 0;
      try { if (K.fs.existsSync(part)) existing = K.fs.statSync(part).size; } catch (e0) {}
      if (existing >= item.bytes) { try { K.fs.unlinkSync(part); } catch (e1) {} existing = 0; }

      function attempt(offset, retried) {
        var u = urlmod.parse(endpoint);
        var body = Buffer.from(JSON.stringify({ action: "file", token: token, path: item.path }), "utf8");
        var headers = {
          "Accept": "application/octet-stream",
          "Content-Type": "application/json",
          "Content-Length": body.length,
          "User-Agent": "Suflo-ProSync/" + K.VERSION
        };
        if (offset > 0) headers.Range = "bytes=" + offset + "-";
        var client = u.protocol === "http:" ? http : https;
        var req = client.request({ method: "POST", hostname: u.hostname, port: u.port || (u.protocol === "http:" ? 80 : 443), path: u.path, headers: headers }, function (res) {
          if (offset > 0 && res.statusCode === 200 && !retried) {
            res.resume(); try { K.fs.unlinkSync(part); } catch (e2) {}
            attempt(0, true); return;
          }
          var accepted = res.statusCode === 200 || (res.statusCode === 206 && offset > 0);
          if (!accepted) {
            var err = ""; res.setEncoding("utf8"); res.on("data", function (d) { if (err.length < 300) err += d; });
            res.on("end", function () { reject(new Error("Dosya indirilemedi (HTTP " + res.statusCode + ")" + (err ? ": " + err : ""))); });
            return;
          }
          if (res.statusCode === 206) {
            var cr = /bytes\s+(\d+)-\d+\/(\d+)/i.exec(String(res.headers["content-range"] || ""));
            if (!cr || Number(cr[1]) !== offset || Number(cr[2]) !== item.bytes) {
              res.resume(); try { K.fs.unlinkSync(part); } catch (e3) {}
              attempt(0, true); return;
            }
          }
          var got = offset;
          var out = K.fs.createWriteStream(part, offset > 0 ? { flags: "a" } : undefined);
          var settled = false;
          function fail(err) { if (settled) return; settled = true; try { out.destroy(); } catch (e4) {} reject(err); }
          res.on("data", function (chunk) { got += chunk.length; if (onProgress) onProgress(Math.min(1, got / item.bytes), got); });
          res.on("error", fail); out.on("error", fail); res.pipe(out);
          out.on("finish", function () {
            out.close(async function () {
              if (settled) return;
              try {
                var size = K.fs.statSync(part).size;
                if (size !== item.bytes) throw new Error("Eksik indirme: " + size + "/" + item.bytes);
                var sha = await hashFile(part);
                if (sha !== item.sha256) { try { K.fs.unlinkSync(part); } catch (e5) {} throw new Error("Dosya doğrulaması başarısız: " + item.path); }
                if (K.fs.existsSync(dest)) K.fs.unlinkSync(dest);
                K.fs.renameSync(part, dest); settled = true; resolve({ ok: true, bytes: size });
              } catch (e6) { fail(e6); }
            });
          });
        });
        req.setTimeout(30 * 60 * 1000, function () { req.destroy(new Error("İndirme zaman aşımı.")); });
        req.on("error", reject); req.write(body); req.end();
      }
      attempt(existing, false);
    });
  }

  async function fetchFile(manifest, item, dest, onProgress) {
    if (cfg.fileFetcher) return cfg.fileFetcher(cfg.endpoint, manifest.token, item, dest, onProgress);
    return defaultDownload(cfg.endpoint, manifest.token, item, dest, onProgress);
  }
  function stateMap(state) {
    var out = {};
    if (!state || !Array.isArray(state.files)) return out;
    state.files.forEach(function (f) { if (f && f.path) out[String(f.path).toLowerCase()] = f; });
    return out;
  }
  function localFileMap(dir, files) {
    var out = {};
    files.forEach(function (item) {
      try {
        var file = K.path.join(dir, item.path.replace(/\//g, K.path.sep));
        var st = K.fs.statSync(file);
        out[item.path.toLowerCase()] = { bytes: st.size, mtimeMs: Math.floor(Number(st.mtimeMs || st.mtime.getTime())) };
      } catch (e) {}
    });
    return out;
  }
  async function readyRelease(dir, manifest) {
    var saved = readJson(K.path.join(dir, ".suflo-manifest.json"));
    if (!saved || saved.manifestId !== manifest.manifestId) return false;
    var local = saved.localFiles && typeof saved.localFiles === "object" ? saved.localFiles : {};
    var forceFull = !Number(saved.verifiedAt) || Date.now() - Number(saved.verifiedAt) > 7 * 24 * 3600 * 1000;
    var metadataChanged = forceFull;
    for (var i = 0; i < manifest.files.length; i++) {
      var item = manifest.files[i], file = K.path.join(dir, item.path.replace(/\//g, K.path.sep));
      try {
        if (!inside(dir, file) || !K.fs.existsSync(file)) return false;
        var st = K.fs.statSync(file), mtimeMs = Math.floor(Number(st.mtimeMs || st.mtime.getTime()));
        if (st.size !== item.bytes) return false;
        var marker = local[item.path.toLowerCase()];
        // Indirme/kopyalama aninda hash dogrulanir. Sonraki acilislarda dosya
        // boyutu ve degisiklik zamani ayniysa 300+ MB'yi tekrar hashleyip
        // Premiere'i yormayiz. Metadata degistiyse veya son tam kontrolden
        // yedi gun gectiyse tum SHA-256 ozetleri yeniden dogrulanir.
        if (forceFull || !marker || marker.bytes !== st.size || marker.mtimeMs !== mtimeMs) {
          if ((await hashFile(file)) !== item.sha256) return false;
          local[item.path.toLowerCase()] = { bytes: st.size, mtimeMs: mtimeMs };
          metadataChanged = true;
        }
      }
      catch (e) { return false; }
    }
    if (metadataChanged) {
      saved.localFiles = local;
      saved.verifiedAt = Date.now();
      writeJson(K.path.join(dir, ".suflo-manifest.json"), saved);
    }
    return true;
  }
  function pruneReleases(activeDir, previousDir) {
    var releases = K.path.join(rootDir(), "releases");
    if (!releases || !K.fs.existsSync(releases)) return;
    var keep = {};
    [activeDir, previousDir].forEach(function (p) {
      if (p && inside(releases, p)) keep[K.path.resolve(p).toLowerCase()] = true;
    });
    var entries = [];
    try { entries = K.fs.readdirSync(releases); } catch (e0) { return; }
    entries.forEach(function (name) {
      var full = K.path.join(releases, name);
      if (!inside(releases, full) || keep[K.path.resolve(full).toLowerCase()]) return;
      try {
        var st = K.fs.lstatSync(full);
        if (st.isDirectory() && !st.isSymbolicLink()) removeTree(full);
      } catch (e1) {}
    });
  }
  function activateRelease(dir, manifest, downloaded, copied, previousDir) {
    var s = K.settings();
    var releases = K.path.join(rootDir(), "releases");
    var rollback = "";
    if (previousDir && inside(releases, previousDir) && K.path.resolve(previousDir) !== K.path.resolve(dir)) rollback = previousDir;
    else if (s.proContentPreviousPath && inside(releases, String(s.proContentPreviousPath)) && K.path.resolve(String(s.proContentPreviousPath)) !== K.path.resolve(dir)) rollback = String(s.proContentPreviousPath);
    s.proPackKlasor = dir;
    s.proPackManaged = true;
    s.proContentVersion = manifest.version;
    s.proContentLastSync = Date.now();
    s.proContentPreviousPath = rollback;
    K.saveSettings();
    setState({ phase: "ready", progress: 1, version: manifest.version, detail: "Pro içerikleri güncel", file: "", downloaded: downloaded || 0, copied: copied || 0, total: manifest.files.length, bytesDone: manifest.totalBytes, bytesTotal: manifest.totalBytes, lastSync: s.proContentLastSync, path: dir, error: "", offline: false });
    try { if (window.KLib) KLib.tara(); } catch (e1) {}
    try { if (window.KSfx) KSfx.tara(); } catch (e2) {}
    try { if (window.KMotionBG) KMotionBG.tara(); } catch (e4) {}
    // Disk sisirmesin: aktif surum ve bir onceki geri donus kopyasi disindakileri temizle.
    try { pruneReleases(dir, rollback); } catch (e3) {}
  }

  async function runSync(options) {
    options = options || {};
    if (!K.nodeOK || !K.fs || !K.path) throw new Error("Pro içerik eşitleme için dosya erişimi gerekli.");
    if (!window.Pro || !Pro.isPro()) {
      setState({ phase: "locked", detail: "Pro etkinleştirilince içerikler otomatik kurulur", progress: 0, error: "" });
      return { ok: false, locked: true };
    }
    var creds = Pro.contentCredentials && Pro.contentCredentials();
    if (!creds) throw new Error("Pro lisans bilgisi bulunamadı; lisansı yeniden doğrula.");
    var root = rootDir();
    if (!root) throw new Error("Pro içerik klasörü oluşturulamadı.");
    ensureDir(root); ensureDir(K.path.join(root, "releases"));
    setState({ phase: "checking", detail: "Pro içerikleri kontrol ediliyor…", progress: 0, error: "", offline: false });

    var raw;
    try { raw = await fetchManifest(creds); }
    catch (networkError) {
      var existing = String(K.settings().proPackKlasor || "");
      if (K.settings().proPackManaged && existing && inside(root, existing) && K.fs.existsSync(existing)) {
        setState({ phase: "ready", detail: "Çevrimdışı · kurulu Pro içerikleri hazır", path: existing, version: String(K.settings().proContentVersion || ""), lastSync: Number(K.settings().proContentLastSync || 0), offline: true, error: "" });
        return { ok: true, offline: true, path: existing };
      }
      // Ilk kurulumda gecici baglanti/sunucu hatasi tek denemede musteriye
      // yuklenmesin. Lisans reddi (4xx) tekrar edilmez; yalniz ag/5xx bir kez denenir.
      var statusCode = Number(networkError && networkError.status || 0);
      if (statusCode && statusCode < 500) throw networkError;
      setState({ phase: "checking", detail: "Bağlantı yenileniyor…", progress: 0, error: "" });
      await new Promise(function (resolve) { setTimeout(resolve, 900); });
      raw = await fetchManifest(creds);
    }
    var manifest = validateManifest(raw);
    var releases = K.path.join(root, "releases");
    var releaseDir = K.path.join(releases, manifest.version);
    if (!inside(releases, releaseDir)) throw new Error("İçerik sürümü güvenli değil.");
    if (await readyRelease(releaseDir, manifest)) {
      activateRelease(releaseDir, manifest, 0, manifest.files.length, String(K.settings().proPackKlasor || ""));
      return { ok: true, current: true, version: manifest.version, path: releaseDir };
    }

    var staging = releaseDir + ".staging";
    if (!inside(releases, staging)) throw new Error("Geçici içerik yolu güvenli değil.");
    var stagingMeta = readJson(K.path.join(staging, ".suflo-staging.json"));
    if (!stagingMeta || stagingMeta.manifestId !== manifest.manifestId) removeTree(staging);
    ensureDir(staging);
    writeJson(K.path.join(staging, ".suflo-staging.json"), { schema: 1, version: manifest.version, manifestId: manifest.manifestId, startedAt: Date.now() });

    var previousDir = String(K.settings().proPackKlasor || "");
    var previousState = K.settings().proPackManaged && previousDir && inside(root, previousDir)
      ? readJson(K.path.join(previousDir, ".suflo-manifest.json")) : null;
    var previous = stateMap(previousState);
    var doneBytes = 0, downloaded = 0, copied = 0;
    setState({ phase: "syncing", detail: manifest.files.length + " içerik hazırlanıyor", version: manifest.version, total: manifest.files.length, bytesTotal: manifest.totalBytes, bytesDone: 0, progress: 0 });

    try {
      for (var i = 0; i < manifest.files.length; i++) {
        var item = manifest.files[i];
        var dest = K.path.join(staging, item.path.replace(/\//g, K.path.sep));
        if (!inside(staging, dest)) throw new Error("Güvensiz hedef yolu: " + item.path);
        ensureDir(K.path.dirname(dest));
        var prev = previous[item.path.toLowerCase()];
        var source = previousDir ? K.path.join(previousDir, item.path.replace(/\//g, K.path.sep)) : "";
        var reused = false;
        // Onceki baglanti koptuysa tamamlanmis staging dosyasini yeniden indirme.
        try {
          if (K.fs.existsSync(dest) && K.fs.statSync(dest).size === item.bytes) {
            if ((await hashFile(dest)) === item.sha256) { reused = true; copied++; }
            else K.fs.unlinkSync(dest);
          }
        } catch (eStage) { try { if (K.fs.existsSync(dest)) K.fs.unlinkSync(dest); } catch (eStage2) {} }
        if (prev && prev.sha256 === item.sha256 && source && inside(previousDir, source)) {
          try {
            if (!reused && K.fs.existsSync(source) && K.fs.statSync(source).size === item.bytes) {
              K.fs.copyFileSync(source, dest);
              if ((await hashFile(dest)) === item.sha256) { reused = true; copied++; }
              else K.fs.unlinkSync(dest);
            }
          } catch (eCopy) {}
        }
        var before = doneBytes;
        setState({ file: item.path, detail: (i + 1) + "/" + manifest.files.length + " · " + (reused ? "hazır dosya taşınıyor" : "indiriliyor") });
        if (!reused) {
          await fetchFile(manifest, item, dest, function (ratio, got) {
            var live = before + Math.min(item.bytes, got || Math.round(item.bytes * ratio));
            setState({ bytesDone: live, progress: manifest.totalBytes ? Math.min(.995, live / manifest.totalBytes) : 0 });
          });
          var actualSha = await hashFile(dest);
          if (actualSha !== item.sha256 || K.fs.statSync(dest).size !== item.bytes) throw new Error("Doğrulama başarısız: " + item.path);
          downloaded++;
        }
        doneBytes += item.bytes;
        setState({ bytesDone: doneBytes, progress: manifest.totalBytes ? Math.min(.995, doneBytes / manifest.totalBytes) : 0, downloaded: downloaded, copied: copied });
      }
      writeJson(K.path.join(staging, ".suflo-manifest.json"), {
        schema: 1, version: manifest.version, manifestId: manifest.manifestId,
        syncedAt: Date.now(), verifiedAt: Date.now(), files: manifest.files,
        localFiles: localFileMap(staging, manifest.files)
      });
      try { K.fs.unlinkSync(K.path.join(staging, ".suflo-staging.json")); } catch (eMarker) {}
      if (K.fs.existsSync(releaseDir)) removeTree(releaseDir);
      K.fs.renameSync(staging, releaseDir);
      activateRelease(releaseDir, manifest, downloaded, copied, previousDir);
      return { ok: true, version: manifest.version, path: releaseDir, downloaded: downloaded, copied: copied };
    } catch (e) {
      // Dogrulanan staging dosyalari ve .part parcasi kalir; ayni manifestle
      // sonraki deneme kaldigi yerden devam eder. Farkli manifest gelirse ustte temizlenir.
      throw e;
    }
  }

  function sync(options) {
    if (running) return running;
    running = runSync(options).catch(function (e) {
      K.log("[pro-sync] " + (e && e.message ? e.message : e));
      setState({ phase: "error", detail: "Pro içerikleri güncellenemedi", error: e && e.message ? e.message : String(e), offline: false });
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }).then(function (result) { running = null; return result; });
    return running;
  }
  function openFolder() {
    var p = String(current.path || K.settings().proPackKlasor || "");
    if (!p || !K.fs.existsSync(p)) return false;
    K.run(K.MAC ? "open" : "explorer", [p]).catch(function () {});
    return true;
  }
  function restoreInstalledState() {
    var s = K.settings();
    var p = String(s.proPackKlasor || "");
    if (!s.proPackManaged || !p || !K.fs || !K.fs.existsSync(p)) return false;
    var saved = readJson(K.path.join(p, ".suflo-manifest.json"));
    var total = saved && Array.isArray(saved.files) ? saved.files.length : 0;
    var bytes = saved && Array.isArray(saved.files) ? saved.files.reduce(function (sum, f) { return sum + (Number(f.bytes) || 0); }, 0) : 0;
    setState({ phase: "ready", progress: 1, version: String(s.proContentVersion || (saved && saved.version) || ""),
      detail: "Kurulu Pro içerikleri hazır · güncelleme kontrol edilecek", total: total,
      bytesDone: bytes, bytesTotal: bytes, lastSync: Number(s.proContentLastSync || 0), path: p,
      error: "", offline: false });
    return true;
  }
  function init() {
    if (initialized) return;
    initialized = true;
    lastPro = !!(window.Pro && Pro.isPro());
    if (window.Pro) Pro.on(function (s) {
      var nowPro = !!(s && s.pro);
      if (nowPro && !lastPro) setTimeout(function () { sync({ silent: true }); }, 350);
      if (!nowPro) setState({ phase: "locked", detail: "Pro etkinleştirilince içerikler otomatik kurulur", progress: 0, error: "" });
      lastPro = nowPro;
    });
    if (lastPro) {
      restoreInstalledState();
      setTimeout(function () { sync({ silent: true }); }, 4500);
    }
    timer = setInterval(function () { if (window.Pro && Pro.isPro()) sync({ silent: true }); }, 6 * 3600 * 1000);
  }
  function configure(options) {
    options = options || {};
    if (options.endpoint) cfg.endpoint = String(options.endpoint);
    if (options.root) cfg.root = String(options.root);
    if (options.manifestFetcher) cfg.manifestFetcher = options.manifestFetcher;
    if (options.fileFetcher) cfg.fileFetcher = options.fileFetcher;
  }

  return { init: init, sync: sync, status: status, on: on, openFolder: openFolder, configure: configure, rootDir: rootDir, VERSION: "1.0.0" };
})();
