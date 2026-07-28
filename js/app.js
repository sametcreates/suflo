/*
 * Kesit — uygulama kabuğu
 * Sekmeler, bağlam yoklaması (seçili klip otomatik algılanır), toast bildirimleri,
 * ayarlar ve ffmpeg denetimi.
 */
window.KApp = (function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  var ctx = { hasSeq: false, sel: null, sequence: "" };
  var ctxListeners = [];
  var polling = false;

  /* ---------------- Toast ---------------- */

  function toast(msg, kind) {
    var box = el("toasts");
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add("out");
      setTimeout(function () { t.remove(); }, 300);
    }, kind === "bad" ? 5200 : 3200);
  }

  /* ---------------- Bağlam ---------------- */

  function onContext(fn) { ctxListeners.push(fn); }

  function renderContext() {
    var elx = el("ctx-text");
    var dot = el("host-dot");
    if (!ctx.connected) {
      dot.className = "host-dot off";
      elx.innerHTML = K.nodeOK
        ? '<span class="dim">Premiere\'e bağlanılamadı</span>'
        : '<span class="dim">önizleme modu — Premiere dışında</span>';
      return;
    }
    dot.className = "host-dot ok";
    if (!ctx.hasSeq) {
      elx.innerHTML = '<span class="dim">aktif sequence yok — bir sequence aç</span>';
    } else if (ctx.sel) {
      elx.innerHTML = '<span class="ok-mark">●</span><span class="sel-name"></span> <span class="dim">· ' +
        ctx.sel.dur.toFixed(1) + ' sn seçili</span>';
      elx.querySelector(".sel-name").textContent = ctx.sel.name;
    } else {
      elx.innerHTML = '<span class="dim">' + esc(ctx.sequence) + ' · klip seçilmedi</span>';
    }
  }

  function esc(s) {
    var d = document.createElement("i");
    d.textContent = s || "";
    return d.innerHTML;
  }

  async function pollContext() {
    if (polling) return;
    polling = true;
    try {
      var r = await K.call("KS_getContext");
      var prev = JSON.stringify({ s: ctx.sel && ctx.sel.mediaPath, q: ctx.sequence, c: ctx.connected });
      if (r.ok) {
        ctx = r;
        ctx.connected = true;
      } else {
        ctx = { connected: false, hasSeq: false, sel: null, sequence: "" };
      }
      var now = JSON.stringify({ s: ctx.sel && ctx.sel.mediaPath, q: ctx.sequence, c: ctx.connected });
      renderContext();
      if (prev !== now) ctxListeners.forEach(function (fn) { fn(ctx); });
    } finally {
      polling = false;
    }
  }

  /* ---------------- Sekmeler ---------------- */

  var tabListeners = {};
  function onTab(name, fn) { tabListeners[name] = fn; }

  function initTabs() {
    var tabs = document.querySelectorAll(".tab");
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener("click", function () {
        Array.prototype.forEach.call(tabs, function (x) { x.classList.remove("active"); });
        Array.prototype.forEach.call(document.querySelectorAll(".tabpane"), function (p) {
          p.classList.remove("active");
        });
        t.classList.add("active");
        el("tab-" + t.dataset.tab).classList.add("active");
        if (tabListeners[t.dataset.tab]) tabListeners[t.dataset.tab]();
      });
    });
  }

  /* ---------------- Ayarlar ---------------- */

  function refreshFolderList() {
    var box = el("set-folders");
    var s = K.settings();
    box.innerHTML = "";
    if (s.folders.length === 0) {
      box.innerHTML = '<div class="empty">Bağlı klasör yok.</div>';
      return;
    }
    s.folders.forEach(function (f, i) {
      var row = document.createElement("div");
      row.className = "folder-item";
      var p = document.createElement("span");
      p.className = "path";
      p.textContent = f;
      p.title = f;
      var x = document.createElement("button");
      x.className = "seg-x";
      x.textContent = "×";
      x.title = "Kaldır";
      x.onclick = function () {
        s.folders.splice(i, 1);
        K.saveSettings();
        refreshFolderList();
        KSfx.refresh();
        toast("Klasör kaldırıldı");
      };
      row.appendChild(p);
      row.appendChild(x);
      box.appendChild(row);
    });
  }

  /* ---------------- Yerel Whisper kurulumu ---------------- */

  var WCPP_ZIP = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.9.1/whisper-blas-bin-x64.zip";
  var WCPP_MODEL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin";
  var installingLocal = false;

  function refreshLocalStatus() {
    var box = el("set-local-status");
    var btn = el("set-local-install");
    var lw = K.whisperLocal();
    if (lw) {
      box.className = "inline-status good";
      box.textContent = "✓ kurulu — " + lw.model.replace(/^.*[\\\/]/, "").replace(/^ggml-|\.bin$/g, "");
      btn.hidden = true;
    } else {
      box.className = "inline-status";
      box.textContent = installingLocal ? box.textContent : "kurulu değil";
      btn.hidden = installingLocal;
    }
  }

  async function installLocalWhisper(progressEl) {
    if (installingLocal) return;
    if (!K.nodeOK) { toast("Bu ortamda kurulamaz — Premiere içinde dene", "bad"); return; }
    installingLocal = true;
    var box = el("set-local-status");
    el("set-local-install").hidden = true;
    function say(msg) {
      box.className = "inline-status";
      box.textContent = msg;
      if (progressEl) progressEl.textContent = msg;
    }
    try {
      var dir = K.whisperDir();
      K.fs.mkdirSync(K.path.join(dir, "models"), { recursive: true });

      say("Motor iniyor… (20 MB)");
      var zipPath = K.path.join(dir, "wcpp.zip");
      var r1 = await K.download(WCPP_ZIP, zipPath, function (f) {
        say("Motor iniyor… %" + Math.round(f * 100));
      });
      if (!r1.ok) throw new Error("Motor indirilemedi: " + r1.error);
      say("Motor açılıyor…");
      var un = await K.unzip(zipPath, dir);
      try { K.fs.unlinkSync(zipPath); } catch (e) {}
      if (!un) throw new Error("Zip açılamadı.");

      say("Model iniyor… (~570 MB, birkaç dk)");
      var mPath = K.path.join(dir, "models", "ggml-large-v3-turbo-q5_0.bin");
      var r2 = await K.download(WCPP_MODEL, mPath, function (f) {
        say("Model iniyor… %" + Math.round(f * 100));
      });
      if (!r2.ok) throw new Error("Model indirilemedi: " + r2.error);

      if (!K.whisperLocal()) throw new Error("Kurulum doğrulanamadı.");
      var st = K.settings();
      st.provider = "local";
      K.saveSettings();
      el("set-provider").value = "local";
      toast("Yerel motor hazır — altyazı artık tamamen offline", "good");
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      installingLocal = false;
      refreshLocalStatus();
      KCaptions.refreshSetup();
    }
  }

  /* ---------------- Solo mod (altyazı-öncelikli ürün) ---------------- */

  function applySoloMode() {
    var solo = !K.settings().showModules;
    document.body.classList.toggle("solo", solo);
    // gizlenen bir sekmede kaldıysak altyazıya dön
    if (solo) {
      var active = document.querySelector(".tab.active");
      if (active && ["sfx", "cut", "motion"].indexOf(active.dataset.tab) !== -1) {
        document.querySelector('.tab[data-tab="captions"]').click();
      }
    }
  }

  function initSettings() {
    var s = K.settings();
    el("set-modules").checked = !!s.showModules;
    el("set-modules").addEventListener("change", function () {
      var st = K.settings();
      st.showModules = this.checked;
      K.saveSettings();
      applySoloMode();
    });
    el("set-provider").value = s.provider || "groq";
    el("set-apikey").value = s.apiKey || "";
    el("set-endpoint").value = s.endpoint || "";
    el("set-custom-row").hidden = s.provider !== "custom";

    el("set-provider").addEventListener("change", function () {
      el("set-custom-row").hidden = this.value !== "custom";
    });

    el("set-local-install").addEventListener("click", function () { installLocalWhisper(); });
    refreshLocalStatus();

    el("set-save").addEventListener("click", function () {
      var st = K.settings();
      st.provider = el("set-provider").value;
      st.apiKey = el("set-apikey").value.trim();
      st.endpoint = el("set-endpoint").value.trim();
      if (K.saveSettings()) toast("Ayarlar kaydedildi", "good");
      else toast("Ayarlar kaydedilemedi", "bad");
      KCaptions.refreshSetup();
    });

    el("lnk-groq").addEventListener("click", function (e) {
      e.preventDefault();
      K.cs.openURLInDefaultBrowser("https://console.groq.com/keys");
    });

    el("set-add-folder").addEventListener("click", function () {
      KSfx.addFolder(function () { refreshFolderList(); });
    });

    el("set-ffmpeg-recheck").addEventListener("click", checkFfmpeg);
    el("set-ffmpeg-install").addEventListener("click", installFfmpeg);

    refreshFolderList();
  }

  async function checkFfmpeg() {
    var box = el("set-ffmpeg-status");
    box.className = "inline-status";
    box.textContent = "kontrol ediliyor…";
    var ff = await K.findFfmpeg(true);
    if (ff) {
      box.className = "inline-status good";
      box.textContent = "✓ " + ff;
    } else {
      box.className = "inline-status bad";
      box.textContent = "✕ bulunamadı — Kesim ve Altyazı çalışmaz";
    }
    return ff;
  }

  async function installFfmpeg() {
    var box = el("set-ffmpeg-status");
    box.className = "inline-status";
    box.textContent = "winget ile kuruluyor… (birkaç dakika sürebilir)";
    var r = await K.run("winget", [
      "install", "--id", "Gyan.FFmpeg", "-e",
      "--accept-source-agreements", "--accept-package-agreements"
    ], { timeout: 480000 });
    if (r.code === 0) {
      toast("ffmpeg kuruldu", "good");
      await checkFfmpeg();
    } else {
      box.className = "inline-status bad";
      box.textContent = "✕ winget başarısız — ffmpeg.org'dan elle kur, Premiere'i yeniden başlat";
    }
  }

  /* ---------------- Başlat ---------------- */

  function init() {
    initTabs();
    initSettings();
    applySoloMode();
    KSfx.init();
    KCaptions.init();
    KCut.init();
    KMotion.init();
    pollContext();
    checkFfmpeg();
    setInterval(pollContext, 2500);
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    toast: toast,
    onContext: onContext,
    onTab: onTab,
    ctx: function () { return ctx; },
    refreshFolders: refreshFolderList,
    installLocalWhisper: installLocalWhisper
  };
})();
