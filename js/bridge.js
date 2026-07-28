/*
 * Kesit — köprü katmanı
 * CEP/Node yeteneklerini tek yerde toplar: ExtendScript çağrıları, dosya sistemi,
 * ffmpeg çalıştırma, ayar saklama. CEP dışında (tarayıcı önizlemesi) güvenle çöker.
 */
window.K = (function () {
  "use strict";

  var cs = new CSInterface();
  var nodeOK = false;
  var fs = null, path = null, os = null, cp = null;

  try {
    if (typeof require === "function") {
      fs = require("fs");
      path = require("path");
      os = require("os");
      cp = require("child_process");
      nodeOK = true;
    }
  } catch (e) { nodeOK = false; }

  /* ---------------- ExtendScript ---------------- */

  function call(fn, arg) {
    return new Promise(function (resolve) {
      var script = arg === undefined
        ? fn + "()"
        : fn + '("' + encodeURIComponent(JSON.stringify(arg)) + '")';
      cs.evalScript(script, function (res) {
        if (res === "EvalScript error.") {
          log("jsx HATA " + fn + ": EvalScript error");
          resolve({ ok: false, error: "ExtendScript hatası (" + fn + ")" });
          return;
        }
        try {
          var parsed = JSON.parse(res);
          if (parsed && parsed.ok === false) log("jsx " + fn + ": " + parsed.error);
          resolve(parsed);
        }
        catch (e) {
          log("jsx " + fn + ": yanit okunamadi");
          resolve({ ok: false, error: "Yanıt okunamadı: " + String(res).slice(0, 200) });
        }
      });
    });
  }

  /* ---------------- Ayarlar ---------------- */

  function settingsPath() {
    if (!nodeOK) return null;
    var base;
    try { base = cs.getSystemPath(CSInterface.SystemPath.USER_DATA); } catch (e) { base = ""; }
    if (!base) base = os.homedir();
    var dir = path.join(base, "Kesit");
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (e2) {}
    return path.join(dir, "settings.json");
  }

  var _settings = null;

  function loadSettings() {
    if (_settings) return _settings;
    _settings = { folders: [], provider: "local", endpoint: "", apiKey: "", ffmpeg: "", favs: [], recent: [] };
    try {
      var p = settingsPath();
      if (p && fs.existsSync(p)) {
        var disk = JSON.parse(fs.readFileSync(p, "utf8"));
        for (var k in disk) if (disk.hasOwnProperty(k)) _settings[k] = disk[k];
      }
    } catch (e) {}
    return _settings;
  }

  function saveSettings() {
    try {
      var p = settingsPath();
      if (p) fs.writeFileSync(p, JSON.stringify(loadSettings(), null, 2), "utf8");
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- Süreç çalıştırma ---------------- */

  function run(cmd, args, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!nodeOK) { resolve({ code: -1, stdout: "", stderr: "Node erişimi yok" }); return; }
      var child;
      try {
        child = cp.spawn(cmd, args, { windowsHide: true });
      } catch (e) {
        resolve({ code: -1, stdout: "", stderr: String(e) });
        return;
      }
      var out = "", err = "", done = false;
      var timer = setTimeout(function () {
        if (done) return;
        try { child.kill(); } catch (e) {}
        done = true;
        resolve({ code: -1, stdout: out, stderr: err + "\n[zaman aşımı]" });
      }, opts.timeout || 300000);

      function finish(code) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (code !== 0) {
          log("run HATA [" + String(cmd).replace(/^.*[\\\/]/, "") + "] kod=" + code + " " +
            String(err).split("\n").slice(-2).join(" ").slice(0, 200));
        }
        resolve({ code: code, stdout: out, stderr: err });
      }
      child.stdout.on("data", function (d) { out += d.toString(); });
      child.stderr.on("data", function (d) {
        var s = d.toString();
        err += s;
        if (opts.onStderr) opts.onStderr(s);
      });
      child.on("error", function (e) { err += String(e); finish(-1); });
      child.on("close", finish);
    });
  }

  /* ---------------- HTTP (Node üzerinden, CORS'suz) ---------------- */

  /*
   * CEP panelinin CEF tarafından yapılan fetch çağrıları file:// origin +
   * Authorization header yüzünden CORS preflight'a takılabilir (OpenAI izin
   * vermez). Node'un https modülü tarayıcı kısıtlarına tabi değildir; API
   * yüklemeleri bu yoldan yapılır.
   */
  function httpUpload(urlStr, headers, fields, fileBuf, filename, mime) {
    return new Promise(function (resolve) {
      if (!nodeOK) { resolve({ status: 0, body: "Node erişimi yok" }); return; }
      var proto, Buf, u;
      try {
        u = new URL(urlStr);
        proto = require(u.protocol === "http:" ? "http" : "https");
        Buf = require("buffer").Buffer;
      } catch (e) {
        resolve({ status: 0, body: String(e) });
        return;
      }
      var boundary = "----kesit" + Date.now().toString(36);
      var parts = [];
      function addField(name, val) {
        parts.push(Buf.from(
          "--" + boundary + "\r\n" +
          'Content-Disposition: form-data; name="' + name + '"\r\n\r\n' +
          val + "\r\n"
        ));
      }
      for (var k in fields) {
        if (!fields.hasOwnProperty(k)) continue;
        // dizi degerler ayni adla coklu part olur (timestamp_granularities[] gibi)
        if (fields[k] instanceof Array) {
          for (var ai = 0; ai < fields[k].length; ai++) addField(k, fields[k][ai]);
        } else {
          addField(k, fields[k]);
        }
      }
      parts.push(Buf.from(
        "--" + boundary + "\r\n" +
        'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
        "Content-Type: " + (mime || "application/octet-stream") + "\r\n\r\n"
      ));
      parts.push(Buf.from(fileBuf));
      parts.push(Buf.from("\r\n--" + boundary + "--\r\n"));
      var body = Buf.concat(parts);

      var hdrs = { "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": body.length };
      for (var h in headers) if (headers.hasOwnProperty(h)) hdrs[h] = headers[h];

      var req;
      try {
        req = proto.request({
          hostname: u.hostname,
          port: u.port || (u.protocol === "http:" ? 80 : 443),
          path: u.pathname + (u.search || ""),
          method: "POST",
          headers: hdrs
        }, function (res) {
          var data = "";
          res.on("data", function (d) { data += d.toString(); });
          res.on("end", function () { resolve({ status: res.statusCode, body: data }); });
          res.on("error", function (eRs) { resolve({ status: 0, body: String(eRs) }); });
        });
      } catch (e2) {
        resolve({ status: 0, body: String(e2) });
        return;
      }
      req.on("error", function (e3) { resolve({ status: 0, body: String(e3) }); });
      req.setTimeout(300000, function () { req.destroy(); resolve({ status: 0, body: "zaman aşımı" }); });
      req.write(body);
      req.end();
    });
  }

  /* ---------------- HTTP GET (güncelleme kontrolü) ---------------- */

  function httpGet(urlStr, headers) {
    return new Promise(function (resolve) {
      if (!nodeOK) { resolve({ status: 0, body: "Node erişimi yok" }); return; }
      var proto, u;
      try {
        u = new URL(urlStr);
        proto = require(u.protocol === "http:" ? "http" : "https");
      } catch (e) { resolve({ status: 0, body: String(e) }); return; }
      var hdrs = { "User-Agent": "Suflo-Panel" };
      for (var h in headers) if (headers.hasOwnProperty(h)) hdrs[h] = headers[h];
      var req = proto.get({
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + (u.search || ""),
        headers: hdrs
      }, function (res) {
        var data = "";
        res.on("data", function (d) { data += d.toString(); });
        res.on("end", function () { resolve({ status: res.statusCode, body: data }); });
        res.on("error", function (e2) { resolve({ status: 0, body: String(e2) }); });
      });
      req.on("error", function (e3) { resolve({ status: 0, body: String(e3) }); });
      req.setTimeout(20000, function () { req.destroy(); resolve({ status: 0, body: "zaman aşımı" }); });
    });
  }

  /* ---------------- Tanılama günlüğü ---------------- */

  var VERSION = "1.5.0";
  // yayin sirasinda publish.ps1 gercek kullanici adiyla degistirir
  var REPO = "OWNER/suflo";
  var logBuf = [];

  function log(msg) {
    var t = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    logBuf.push(p(t.getHours()) + ":" + p(t.getMinutes()) + ":" + p(t.getSeconds()) + "  " + msg);
    if (logBuf.length > 300) logBuf.shift();
  }

  function logText() {
    var head = [
      "Suflo v" + VERSION,
      "node: " + (nodeOK ? "ok" : "yok"),
      "ffmpeg: " + (_ffmpeg || "bulunmadı"),
      "yerel motor: " + (whisperLocal() ? "kurulu" : "yok"),
      "motor secimi: " + (loadSettings().provider || "?"),
      "---"
    ];
    return head.join("\n") + "\n" + logBuf.join("\n");
  }

  /* ---------------- HTTP JSON (Node üzerinden, CORS'suz) ---------------- */

  function httpJson(urlStr, headers, bodyObj) {
    return new Promise(function (resolve) {
      if (!nodeOK) { resolve({ status: 0, body: "Node erişimi yok" }); return; }
      var proto, u, Buf;
      try {
        u = new URL(urlStr);
        proto = require(u.protocol === "http:" ? "http" : "https");
        Buf = require("buffer").Buffer;
      } catch (e) { resolve({ status: 0, body: String(e) }); return; }
      var body = Buf.from(JSON.stringify(bodyObj), "utf8");
      var hdrs = { "Content-Type": "application/json", "Content-Length": body.length };
      for (var h in headers) if (headers.hasOwnProperty(h)) hdrs[h] = headers[h];
      var req;
      try {
        req = proto.request({
          hostname: u.hostname,
          port: u.port || (u.protocol === "http:" ? 80 : 443),
          path: u.pathname + (u.search || ""),
          method: "POST",
          headers: hdrs
        }, function (res) {
          var data = "";
          res.on("data", function (d) { data += d.toString(); });
          res.on("end", function () { resolve({ status: res.statusCode, body: data }); });
          res.on("error", function (e2) { resolve({ status: 0, body: String(e2) }); });
        });
      } catch (e3) { resolve({ status: 0, body: String(e3) }); return; }
      req.on("error", function (e4) { resolve({ status: 0, body: String(e4) }); });
      req.setTimeout(300000, function () { req.destroy(); resolve({ status: 0, body: "zaman aşımı" }); });
      req.write(body);
      req.end();
    });
  }

  /* ---------------- Yerel Whisper (whisper.cpp) ---------------- */

  function whisperDir() {
    return path.join(os.homedir(), "AppData", "Roaming", "Kesit", "whisper");
  }

  // Kurulu yerel motoru bul: { exe, model } veya null
  function whisperLocal() {
    if (!nodeOK) return null;
    try {
      var dir = whisperDir();
      var exe = null;
      var names = ["whisper-cli.exe", "main.exe", "whisper.exe"];
      for (var i = 0; i < names.length; i++) {
        var c = path.join(dir, names[i]);
        if (fs.existsSync(c)) { exe = c; break; }
      }
      if (!exe) {
        // zip bazen alt klasore acilir
        var subs = fs.readdirSync(dir);
        for (var si = 0; si < subs.length && !exe; si++) {
          for (var ni = 0; ni < names.length; ni++) {
            var c2 = path.join(dir, subs[si], names[ni]);
            try { if (fs.existsSync(c2)) { exe = c2; break; } } catch (eS) {}
          }
        }
      }
      if (!exe) return null;
      var mdir = path.join(dir, "models");
      if (!fs.existsSync(mdir)) return null;
      var files = fs.readdirSync(mdir);
      var model = null;
      for (var mi = 0; mi < files.length; mi++) {
        if (/^ggml-.*\.bin$/i.test(files[mi]) && fs.statSync(path.join(mdir, files[mi])).size > 50000000) {
          model = path.join(mdir, files[mi]);
          break;
        }
      }
      if (!model) return null;
      return { exe: exe, model: model, dir: dir };
    } catch (e) { return null; }
  }

  // Yonlendirme takip eden dosya indirici (panelden kurulum icin)
  function download(urlStr, destPath, onProgress, redirects) {
    redirects = redirects || 0;
    return new Promise(function (resolve) {
      if (!nodeOK) { resolve({ ok: false, error: "Node erişimi yok" }); return; }
      if (redirects > 6) { resolve({ ok: false, error: "Çok fazla yönlendirme" }); return; }
      var u, proto;
      try {
        u = new URL(urlStr);
        proto = require(u.protocol === "http:" ? "http" : "https");
      } catch (e) { resolve({ ok: false, error: String(e) }); return; }
      var req = proto.get({
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: u.pathname + (u.search || ""),
        headers: { "User-Agent": "Kesit-Panel" }
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          var next = res.headers.location.indexOf("http") === 0
            ? res.headers.location
            : u.protocol + "//" + u.hostname + res.headers.location;
          download(next, destPath, onProgress, redirects + 1).then(resolve);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          resolve({ ok: false, error: "HTTP " + res.statusCode });
          return;
        }
        var total = Number(res.headers["content-length"] || 0);
        var got = 0;
        // once .part'a yaz; ancak butunlugu dogrulaninca nihai ada tasi —
        // yarim indirme asla "kurulu model" sanilmasin
        var partPath = destPath + ".part";
        var out;
        try { out = fs.createWriteStream(partPath); }
        catch (eO) { resolve({ ok: false, error: String(eO) }); return; }
        function fail(msg) {
          try { out.destroy(); } catch (e1) {}
          try { fs.unlinkSync(partPath); } catch (e2) {}
          resolve({ ok: false, error: msg });
        }
        res.on("data", function (d) {
          got += d.length;
          if (onProgress && total) onProgress(got / total, got);
        });
        res.pipe(out);
        out.on("finish", function () {
          out.close(function () {
            if (total > 0 && got !== total) { fail("Eksik indirme: " + got + "/" + total); return; }
            try {
              if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
              fs.renameSync(partPath, destPath);
              resolve({ ok: true, bytes: got });
            } catch (eR2) { fail(String(eR2)); }
          });
        });
        res.on("error", function (eR) { fail(String(eR)); });
        out.on("error", function (eW) { fail(String(eW)); });
      });
      req.on("error", function (eq) { resolve({ ok: false, error: String(eq) }); });
      req.setTimeout(1800000, function () { req.destroy(); resolve({ ok: false, error: "indirme zaman aşımı" }); });
    });
  }

  async function unzip(zipPath, destDir) {
    try { fs.mkdirSync(destDir, { recursive: true }); } catch (eM) {}
    // Windows'un yerlesik bsdtar'i: argv ile gectigimiz icin tirnak sorunu yok
    var tarExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
    if (fs.existsSync(tarExe)) {
      var r = await run(tarExe, ["-xf", zipPath, "-C", destDir], { timeout: 180000 });
      if (r.code === 0) return true;
    }
    // PowerShell fallback — tek tirnaklari ikileyerek kacir (O'Neil gibi kullanici adlari)
    function q(s) { return String(s).replace(/'/g, "''"); }
    var r2 = await run("powershell", [
      "-NoProfile", "-Command",
      "Expand-Archive -LiteralPath '" + q(zipPath) + "' -DestinationPath '" + q(destDir) + "' -Force"
    ], { timeout: 180000 });
    return r2.code === 0;
  }

  /* ---------------- ffmpeg ---------------- */

  var _ffmpeg = null;

  function ffmpegCandidates() {
    var list = [];
    var s = loadSettings();
    if (s.ffmpeg) list.push(s.ffmpeg);
    list.push("ffmpeg");
    if (nodeOK) {
      var home = os.homedir();
      list.push(path.join(home, "AppData", "Local", "Microsoft", "WinGet", "Links", "ffmpeg.exe"));
      // winget bazen Links symlink'ini olusturmaz; paket klasorunu dogrudan tara
      try {
        var pkgRoot = path.join(home, "AppData", "Local", "Microsoft", "WinGet", "Packages");
        var pkgs = fs.readdirSync(pkgRoot);
        for (var pi = 0; pi < pkgs.length; pi++) {
          if (pkgs[pi].indexOf("FFmpeg") === -1 && pkgs[pi].indexOf("ffmpeg") === -1) continue;
          var inner = fs.readdirSync(path.join(pkgRoot, pkgs[pi]));
          for (var ii = 0; ii < inner.length; ii++) {
            var cand = path.join(pkgRoot, pkgs[pi], inner[ii], "bin", "ffmpeg.exe");
            if (fs.existsSync(cand)) list.push(cand);
          }
        }
      } catch (eW) {}
      list.push("C:\\ffmpeg\\bin\\ffmpeg.exe");
      list.push("C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe");
      // Adobe kendi ffmpeg'ini de getirir
      list.push("C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\ffmpeg.exe");
    }
    return list;
  }

  async function findFfmpeg(force) {
    if (_ffmpeg && !force) return _ffmpeg;
    var cands = ffmpegCandidates();
    for (var i = 0; i < cands.length; i++) {
      var r = await run(cands[i], ["-version"]);
      if (r.code === 0 && /ffmpeg version/i.test(r.stdout + r.stderr)) {
        _ffmpeg = cands[i];
        return _ffmpeg;
      }
    }
    _ffmpeg = null;
    return null;
  }

  /* ---------------- Dosya yardımcıları ---------------- */

  var AUDIO_EXT = [".wav", ".mp3", ".aif", ".aiff", ".m4a", ".flac", ".ogg", ".wma"];

  function isAudio(f) {
    var l = f.toLowerCase();
    for (var i = 0; i < AUDIO_EXT.length; i++) if (l.slice(-AUDIO_EXT[i].length) === AUDIO_EXT[i]) return true;
    return false;
  }

  function walkAudio(dir, limit, depth) {
    var out = [];
    if (!nodeOK) return out;
    limit = limit || 4000;
    depth = depth === undefined ? 6 : depth;
    if (depth < 0) return out;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (var i = 0; i < entries.length; i++) {
      if (out.length >= limit) break;
      var e = entries[i];
      var full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.charAt(0) === ".") continue;
        out = out.concat(walkAudio(full, limit - out.length, depth - 1));
      } else if (isAudio(e.name)) {
        out.push(full);
      }
    }
    return out;
  }

  function tmpDir() {
    if (!nodeOK) return "";
    var d = path.join(os.tmpdir(), "kesit");
    try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }

  return {
    cs: cs,
    nodeOK: nodeOK,
    fs: fs, path: path, os: os,
    call: call,
    run: run,
    httpUpload: httpUpload,
    httpJson: httpJson,
    httpGet: httpGet,
    log: log,
    logText: logText,
    VERSION: VERSION,
    REPO: REPO,
    whisperLocal: whisperLocal,
    whisperDir: whisperDir,
    download: download,
    unzip: unzip,
    findFfmpeg: findFfmpeg,
    settings: loadSettings,
    saveSettings: saveSettings,
    walkAudio: walkAudio,
    isAudio: isAudio,
    tmpDir: tmpDir
  };
})();
