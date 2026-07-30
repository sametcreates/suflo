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

  var CLAP_IC = '<svg class="ctx-ic" viewBox="0 0 16 16"><path d="M1.8 6.2 h12.4 v6.4 a1.4 1.4 0 0 1 -1.4 1.4 h-9.6 a1.4 1.4 0 0 1 -1.4-1.4 z" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M2.2 6.2 L3.4 3.3 L14.2 4.6 L13.4 6.2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M6.4 3.7 L5.4 6.2 M9.9 4.1 L8.9 6.2" stroke="currentColor" stroke-width="1.1"/></svg>';

  function renderContext() {
    var elx = el("ctx-text");
    var dot = el("host-dot");
    var strip = el("context-strip");
    if (!ctx.connected) {
      dot.className = "host-dot off";
      strip.innerHTML = CLAP_IC + '<span id="ctx-text" class="dim">' +
        (K.nodeOK ? "Premiere'e bağlanılamadı" : "önizleme modu — Premiere dışında") + "</span>";
      return;
    }
    dot.className = "host-dot ok";
    if (!ctx.hasSeq) {
      strip.innerHTML = CLAP_IC + '<span id="ctx-text" class="dim">Sequence yok</span>' +
        '<span class="pill">bir sequence aç</span>';
    } else if (ctx.sel) {
      var pill = (ctx.selCount > 1)
        ? ctx.selCount + " klip seçili"
        : ctx.sel.dur.toFixed(1) + " sn";
      strip.innerHTML = CLAP_IC + '<span id="ctx-text" class="sel-name"></span>' +
        '<span class="pill live"></span>';
      strip.querySelector(".sel-name").textContent = ctx.sel.name;
      strip.querySelector(".pill").textContent = pill;
    } else {
      strip.innerHTML = CLAP_IC + '<span id="ctx-text" class="sel-name"></span>' +
        '<span class="pill">Klip seçilmedi</span>';
      strip.querySelector(".sel-name").textContent = ctx.sequence;
    }
  }

  function esc(s) {
    var d = document.createElement("i");
    d.textContent = s || "";
    return d.innerHTML;
  }

  /*
   * Bağlam yoklaması. `polling` kilidi eşzamanlı çağrıyı engeller, ama takılı kalırsa panel
   * seçili klibi bir daha hiç görmez — bu yüzden bekçi var: makul süreyi aşan yoklama
   * terk edilmiş sayılır ve kilit açılır. K.call zaten kendi zaman aşımıyla sonuçlanıyor;
   * bu ikinci savunma katmanı.
   */
  var pollBasladi = 0;
  var POLL_BEKCI = 30000;

  async function pollContext() {
    if (polling) {
      if (Date.now() - pollBasladi < POLL_BEKCI) return;
      K.log("baglam yoklamasi takildi (" + Math.round((Date.now() - pollBasladi) / 1000) + " sn), kilit aciliyor");
      polling = false;
    }
    polling = true;
    pollBasladi = Date.now();
    try {
      var r = await K.call("KS_getContext", undefined, 20000);
      var prev = JSON.stringify({ s: ctx.sel && ctx.sel.mediaPath, n: ctx.selCount, q: ctx.sequence, c: ctx.connected });
      if (r.ok) {
        ctx = r;
        ctx.connected = true;
      } else {
        ctx = { connected: false, hasSeq: false, sel: null, sequence: "" };
      }
      var now = JSON.stringify({ s: ctx.sel && ctx.sel.mediaPath, n: ctx.selCount, q: ctx.sequence, c: ctx.connected });
      renderContext();
      if (prev !== now) ctxListeners.forEach(function (fn) { fn(ctx); });
    } finally {
      polling = false;
    }
  }

  /* ---------------- Sekmeler ---------------- */

  var tabListeners = {};
  function onTab(name, fn) { tabListeners[name] = fn; }

  // Ayarlardan çıkış: Altyazı sekmesine dön (solo modda sekme çubuğu gizli olduğu için şart)
  function ayarlardanCik() {
    var b = document.querySelector('.tab[data-tab="captions"]');
    if (b) b.click();
  }

  function initTabs() {
    var tabs = document.querySelectorAll(".tab");
    if (el("set-back")) el("set-back").addEventListener("click", ayarlardanCik);
    // Esc: ayarlar açıkken ve bir alana yazmıyorken çıkar
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (el("tab-settings").classList.contains("active")) { e.preventDefault(); ayarlardanCik(); }
    });
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener("click", function () {
        // solo modda dişli aç/kapa gibi çalışır (geri dönüş için sekme çubuğu yok)
        if (t.dataset.tab === "settings" && document.body.classList.contains("solo") &&
            el("tab-settings").classList.contains("active")) {
          document.querySelector('.tab[data-tab="captions"]').click();
          return;
        }
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

  var installingLocal = false;

  function refreshLocalStatus() {
    var box = el("set-local-status");
    var btn = el("set-local-install");
    var m = KEngine.activeModel();
    var gpu = KEngine.gpuInfo();
    var derleme = KEngine.installedBuild();
    var hw = derleme === "cuda"
      ? "GPU" + (gpu && gpu.name ? " (" + gpu.name.replace(/NVIDIA\s*/i, "") + ")" : "")
      : (derleme === "metal" ? "Metal (Apple GPU)" : "CPU");
    if (m) {
      box.className = "inline-status good";
      box.textContent = "✓ " + m.label.split(" —")[0] + " · " + hw + (KEngine.vadPath() ? " · VAD" : "");
      btn.textContent = "Değiştir";
      btn.hidden = false;
    } else {
      box.className = "inline-status";
      box.textContent = installingLocal ? box.textContent : "kurulu değil";
      btn.textContent = "İndir & kur";
      btn.hidden = installingLocal;
    }
    refreshModelPicker();
  }

  // Ayarlar'daki model listesi: kurulu olanlar işaretli, seçim kalıcı
  function refreshModelPicker() {
    var sel = el("set-model");
    if (!sel) return;
    var inst = KEngine.installedModels().map(function (m) { return m.id; });
    var active = KEngine.activeModel();
    sel.innerHTML = "";
    KEngine.MODELS.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.id;
      var kurulu = inst.indexOf(m.id) !== -1;
      o.textContent = (kurulu ? "✓ " : "") + m.label + " — " + KEngine.fmtMB(m.sizeMB);
      sel.appendChild(o);
    });
    sel.value = active ? active.id : (K.settings().model || "turbo");
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
      say("Donanım kontrol ediliyor…");
      var gpu = await KEngine.detectGpu(true);
      var useGpu = gpu.kind === "cuda" && el("set-gpu") ? el("set-gpu").checked : (gpu.kind === "cuda");
      var modelId = (el("set-model") && el("set-model").value) || K.settings().model || "turbo";

      var res = await KEngine.install({ modelId: modelId, useGpu: useGpu, onStatus: say });

      el("set-provider").value = "local";
      var donanim = res.build === "cuda" ? " · GPU hızlandırmalı"
        : (res.build === "metal" ? " · Metal hızlandırmalı" : " · CPU");
      toast("Hazır: " + res.model.label.split(" —")[0] + donanim +
        (res.vad ? " · sessizlik atlama açık" : ""), "good");
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
    if (el("set-model")) {
      el("set-model").addEventListener("change", function () {
        var st2 = K.settings();
        var inst = KEngine.installedModels().map(function (m) { return m.id; });
        st2.model = this.value;
        K.saveSettings();
        if (inst.indexOf(this.value) === -1) {
          el("set-local-status").className = "inline-status warn";
          el("set-local-status").textContent = "bu model kurulu değil — indirmek için düğmeye bas";
          el("set-local-install").textContent = "İndir & kur";
          el("set-local-install").hidden = false;
        } else {
          refreshLocalStatus();
          KCaptions.refreshSetup();
        }
      });
    }
    // GPU tespiti arka planda: kutuyu ancak NVIDIA varsa göster
    KEngine.detectGpu().then(function (g) {
      var row = el("set-gpu-row");
      if (!row) return;
      if (g.kind === "cuda") {
        row.hidden = false;
        el("set-gpu-name").textContent = g.name.replace(/NVIDIA\s*/i, "");
        if (el("set-gpu")) el("set-gpu").checked = K.settings().engineBuild !== "cpu";
      } else {
        row.hidden = true;
      }
      refreshLocalStatus();
    });
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

    el("set-ffmpeg-recheck").addEventListener("click", function () { checkFfmpeg(true); });
    el("set-ffmpeg-install").addEventListener("click", installFfmpeg);
    // macOS'ta winget yok — dugme ne yapiyorsa onu yazsin
    if (K.MAC) el("set-ffmpeg-install").textContent = "Homebrew ile kur";

    // Elle ffmpeg yolu: paket yoneticisi kurmak istemeyenler icin (tek dosya indirip gosterir)
    if (el("set-ffmpeg-path")) {
      el("set-ffmpeg-path").value = s.ffmpeg || "";
      el("set-ffmpeg-path").addEventListener("change", async function () {
        var st = K.settings();
        st.ffmpeg = this.value.trim();
        K.saveSettings();
        var ff = await K.findFfmpeg(true);      // onbellegi tazele, gercekten calisiyor mu bak
        if (ff) toast("ffmpeg bulundu: " + ff, "good");
        else if (st.ffmpeg) toast("Bu yolda çalışan bir ffmpeg bulunamadı.", "bad");
        checkFfmpeg(true);
      });
    }

    // terim sözlüğü
    if (el("set-glossary")) {
      el("set-glossary").value = KCaptions.glossaryText();
      el("set-glossary-save").addEventListener("click", function () {
        var st = K.settings();
        st.glossary = KCaptions.parseGlossary(el("set-glossary").value);
        K.saveSettings();
        el("set-glossary-info").textContent = st.glossary.length + " kural kayıtlı";
        toast(st.glossary.length + " sözlük kuralı kaydedildi", "good");
      });
      var gl = K.settings().glossary || [];
      if (gl.length) el("set-glossary-info").textContent = gl.length + " kural kayıtlı";
    }

    // vekil sunucu — kurumsal ağda indirmeler buradan geçer
    if (el("set-proxy")) {
      el("set-proxy").value = s.proxyUrl || "";
      el("set-noproxy").value = s.noProxy || "";
      ["set-proxy", "set-noproxy"].forEach(function (id) {
        el(id).addEventListener("change", function () {
          var st = K.settings();
          st.proxyUrl = el("set-proxy").value.trim();
          st.noProxy = el("set-noproxy").value.trim();
          K.saveSettings();
          toast(st.proxyUrl ? "Vekil sunucu kaydedildi" : "Vekil sunucu kapatıldı");
        });
      });
    }

    el("set-copy-log").addEventListener("click", function () {
      var txt = K.logText();
      var ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      if (ok) toast("Günlük panoya kopyalandı (" + txt.split("\n").length + " satır)", "good");
      else toast("Kopyalanamadı", "bad");
    });

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
      // ffmpeg olmadan HEM yerel HEM bulut altyazi calismaz: sebebi ve cikis yolunu soyle
      box.textContent = K.MAC
        ? "✕ bulunamadı — altyazı çalışmaz. Homebrew ile kur ya da aşağıya yolu yaz."
        : "✕ bulunamadı — altyazı çalışmaz. winget ile kur ya da aşağıya yolu yaz.";
    }
    return ff;
  }

  async function installFfmpeg() {
    var box = el("set-ffmpeg-status");
    box.className = "inline-status";
    var r;
    if (K.MAC) {
      var brew = K.brewYolu();
      if (!brew) {
        box.className = "inline-status bad";
        box.textContent = "✕ Homebrew yok — brew.sh'tan kur, sonra buraya dön";
        toast("macOS'ta ffmpeg Homebrew ile kurulur. brew.sh adresindeki tek satırlık " +
          "komutu Terminal'de çalıştırıp paneli yeniden aç.", "bad");
        return;
      }
      box.textContent = "brew install ffmpeg… (birkaç dakika sürebilir)";
      r = await K.run(brew, ["install", "ffmpeg"], { timeout: 1800000 });
    } else {
      box.textContent = "winget ile kuruluyor… (birkaç dakika sürebilir)";
      r = await K.run("winget", [
        "install", "--id", "Gyan.FFmpeg", "-e",
        "--accept-source-agreements", "--accept-package-agreements"
      ], { timeout: 480000 });
    }
    // Kurulum aracı 0 dönmese de ffmpeg ortaya çıkmış olabilir: sonuca değil GERÇEĞE bak
    var ff = await K.findFfmpeg(true);
    if (ff) {
      toast("ffmpeg kuruldu", "good");
      await checkFfmpeg();
    } else {
      box.className = "inline-status bad";
      box.textContent = K.MAC
        ? "✕ brew ffmpeg kuramadı — Terminal'de 'brew install ffmpeg' dene"
        : "✕ winget başarısız — ffmpeg.org'dan elle kur, Premiere'i yeniden başlat";
      K.log("ffmpeg kurulumu basarisiz: kod=" + r.code + " " +
        String(r.stderr || r.stdout).split("\n").slice(-2).join(" ").slice(0, 200));
    }
  }

  /* ---------------- Başlat ---------------- */

  /* ---------------- Güncelleme kontrolü ---------------- */

  async function checkUpdate() {
    // yayindan once REPO yer tutucudur; kontrol devre disi kalir
    if (!K.nodeOK || K.REPO.indexOf("OWNER") === 0) return;
    try {
      var r = await K.httpGet("https://api.github.com/repos/" + K.REPO + "/releases/latest");
      if (r.status !== 200) return;
      var tag = String(JSON.parse(r.body).tag_name || "").replace(/^v/, "");
      if (!tag) return;
      var cur = K.VERSION.split(".").map(Number);
      var yeni = tag.split(".").map(Number);
      var newer = false;
      for (var i = 0; i < 3; i++) {
        if ((yeni[i] || 0) > (cur[i] || 0)) { newer = true; break; }
        if ((yeni[i] || 0) < (cur[i] || 0)) break;
      }
      if (newer) {
        K.log("guncelleme mevcut: v" + tag);
        toast("Yeni sürüm hazır: v" + tag + " — github.com/" + K.REPO + "/releases", "good");
      }
    } catch (e) {}
  }

  /*
   * Her adımı izole çalıştır: tek bir modül yüklenemezse (ör. eski CEF'te ayrıştırılamayan
   * bir dosya) panelin tamamı boş açılmasın. Hata sessiz kalmasın diye günlüğe düşer.
   */
  function guvenli(ad, fn) {
    try { fn(); } catch (e) {
      K.log("init " + ad + " hata: " + (e && e.message ? e.message : e));
      toast(ad + " bölümü yüklenemedi — Ayarlar > Destek'ten günlüğü gönder.", "bad");
    }
  }

  function init() {
    // Global hata yakalayıcı: aksi halde bir arıza tamamen sessiz kalıyor
    window.addEventListener("error", function (ev) {
      try { K.log("js hata: " + (ev.message || "") + " @ " + (ev.filename || "") + ":" + (ev.lineno || 0)); } catch (e) {}
    });

    // Bağlam yoklaması ve ffmpeg denetimi ÖNCE: modüllerden bağımsız çalışsın
    guvenli("bağlam", pollContext);
    guvenli("ffmpeg", checkFfmpeg);
    setInterval(pollContext, 2500);

    guvenli("sekmeler", initTabs);
    guvenli("ayarlar", initSettings);
    guvenli("mod", applySoloMode);
    guvenli("SFX", function () { KSfx.init(); });
    guvenli("Altyazı", function () { KCaptions.init(); });
    guvenli("Kesim", function () { KCut.init(); });
    guvenli("Motion", function () { KMotion.init(); });

    setTimeout(checkUpdate, 4000);
    // eski geçici ses dosyalarını süpür (disk sessizce dolmasın)
    setTimeout(function () { try { K.sweepTemp(); } catch (e) {} }, 6000);
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
