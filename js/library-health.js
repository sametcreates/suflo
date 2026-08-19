/*
 * Suflo — icerik kutuphaneleri saglik kontrolu
 *
 * Kullaniciya teknik dosya sistemi hatalari yerine tek ekranda anlasilir bir
 * rapor verir. Dosyalari tasimaz veya degistirmez; yalnizca okunabilirlik,
 * desteklenen bicim, sifir bayt ve yinelenen adlari denetler.
 */
window.KLibraryHealth = (function () {
  "use strict";

  var AUDIO_RE = /\.(wav|mp3|aif|aiff|m4a|flac|ogg|wma)$/i;
  var AUDIO_LIKE_RE = /\.(aac|caf|opus|ac3|amr|ape)$/i;
  var VISUAL_RE = /\.(png|webp|gif|jpe?g)$/i;
  var lastReport = null;

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

  function addCheck(report, status, title, detail) {
    report.checks.push({ status: status, title: title, detail: detail || "" });
    if (status === "bad") report.status = "bad";
    else if (status === "warn" && report.status === "good") report.status = "warn";
  }

  function makeReport() {
    var report = { status: "good", checks: [], generatedAt: new Date().toISOString(), mogrt: null, sfx: null, emoji: null };
    if (!K.nodeOK || !K.fs || !K.path) {
      addCheck(report, "bad", "Dosya erişimi kapalı", "Premiere'i yeniden başlat; panel Node erişimi olmadan yerel arşivi okuyamaz.");
      return report;
    }
    addCheck(report, "good", "Panel dosya erişimi", "Hazır");
    report.mogrt = scan("mogrt");
    report.sfx = scan("sfx");
    report.emoji = scan("emoji");

    [report.mogrt, report.sfx, report.emoji].forEach(function (r) {
      var ad = r.type === "mogrt" ? "MOGRT" : (r.type === "emoji" ? "Emoji Assets" : "SFX");
      var missing = r.roots.filter(function (x) { return !x.builtin && !x.directory; });
      if (missing.length) addCheck(report, "bad", ad + " klasörü bulunamadı", missing[0].path);
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

  function reportText(report) {
    if (!report) return "";
    var lines = ["Suflo kütüphane sağlık raporu", "Durum: " + report.status.toUpperCase(), "Tarih: " + report.generatedAt];
    report.checks.forEach(function (c) { lines.push("[" + c.status.toUpperCase() + "] " + c.title + (c.detail ? " — " + c.detail : "")); });
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

  function render(report) {
    var box = el("set-library-health-result");
    var copy = el("set-library-health-copy");
    if (!box) return;
    box.hidden = false;
    box.className = "library-health " + report.status;
    var title = report.status === "good" ? "Kütüphaneler hazır" : (report.status === "warn" ? "Küçük uyarılar var" : "Düzeltilmesi gereken sorun var");
    var html = '<div class="library-health-title"><span class="library-health-dot"></span><b>' + title + "</b></div>";
    html += '<div class="library-health-checks">';
    report.checks.forEach(function (c) {
      var icon = c.status === "good" ? "✓" : (c.status === "warn" ? "!" : "×");
      html += '<div class="library-health-line ' + c.status + '"><span>' + icon + "</span><div><b>" + esc(c.title) + "</b>" + (c.detail ? "<small>" + esc(c.detail) + "</small>" : "") + "</div></div>";
    });
    html += "</div>";
    box.innerHTML = html;
    if (copy) copy.hidden = false;
  }

  function run() {
    var box = el("set-library-health-result");
    if (box) { box.hidden = false; box.className = "library-health checking"; box.innerHTML = '<div class="library-health-title"><span class="spinner"></span><b>Kütüphaneler kontrol ediliyor…</b></div>'; }
    return new Promise(function (resolve) {
      setTimeout(function () {
        lastReport = makeReport();
        render(lastReport);
        resolve(lastReport);
      }, 30);
    });
  }

  function copyReport() {
    if (!lastReport) return;
    var txt = reportText(lastReport);
    function done() { if (window.KApp) KApp.toast("Kütüphane raporu kopyalandı", "good"); }
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
    if (window.KApp) KApp.toast("Kütüphane raporu kopyalandı", "good");
  }

  function init() {
    var runBtn = el("set-library-health-run");
    var copyBtn = el("set-library-health-copy");
    if (runBtn) runBtn.addEventListener("click", function () { run(); });
    if (copyBtn) copyBtn.addEventListener("click", copyReport);
  }

  return {
    init: init,
    run: run,
    scan: scan,
    makeReport: makeReport,
    reportText: reportText,
    formatBytes: formatBytes,
    last: function () { return lastReport; }
  };
})();
