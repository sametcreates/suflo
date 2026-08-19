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

  function toast(msg, kind, sure) {
    var box = el("toasts");
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add("out");
      setTimeout(function () { t.remove(); }, 300);
    }, sure || (kind === "bad" ? 5200 : 3200));
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

  /* ---------------- Görünüm: Altyazı ↔ Ayarlar ---------------- */

  /*
   * Suflo yalnizca altyazi yapar. Panelde iki gorunum var: Altyazi ve Ayarlar;
   * disli ikisi arasinda gidip gelir. (Sekme cubugu kaldirildi — SFX/Kesim/Motion
   * modulleri urunden cikarildi, tek modul icin sekme gostermek gurultu.)
   */
  var tabListeners = {};
  function onTab(name, fn) { tabListeners[name] = fn; }

  function goster(ad) {
    Array.prototype.forEach.call(document.querySelectorAll(".tabpane"), function (p) {
      p.classList.remove("active");
    });
    var hedef = el("tab-" + ad);
    if (hedef) hedef.classList.add("active");
    // sekme çubuğu + dişli: aktif işareti tek yerden
    Array.prototype.forEach.call(document.querySelectorAll(".tab[data-tab]"), function (b) {
      b.classList.toggle("active", b.dataset.tab === ad);
    });
    if (tabListeners[ad]) tabListeners[ad]();
  }

  function ayarlardanCik() { goster("captions"); }

  function initTabs() {
    if (el("set-back")) el("set-back").addEventListener("click", ayarlardanCik);

    // Esc: ayarlar açıkken ve bir alana yazmıyorken çıkar
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (el("tab-settings").classList.contains("active")) { e.preventDefault(); ayarlardanCik(); }
    });

    // Sekmeler: dişli aç/kapa gibi davranır, diğerleri doğrudan geçer
    Array.prototype.forEach.call(document.querySelectorAll(".tab[data-tab]"), function (b) {
      b.addEventListener("click", function () {
        var ad = b.dataset.tab;
        if (ad === "settings" && el("tab-settings").classList.contains("active")) ad = "captions";
        goster(ad);
      });
    });
  }

  /* ---------------- Ayarlar ---------------- */



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
    var kurulumHatasi = null;
    // ilerleme metnini yazdığımız öğenin kendi etiketi: iş bitince geri konur,
    // yoksa kurulum kartındaki düğme "Motor iniyor… %62" yazısında donup kalıyor
    var progressEski = progressEl ? progressEl.textContent : null;
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
      // kurulum hatası en kritik an: çözüm önerisiyle ve uzun süre göster
      kurulumHatasi = K.hataYardimi(e);
      toast(kurulumHatasi, "bad", 12000);
    } finally {
      installingLocal = false;
      if (progressEl && progressEski !== null) progressEl.textContent = progressEski;
      refreshLocalStatus();
      KCaptions.refreshSetup();
      // refreshLocalStatus kutuyu ezdiği için hata ondan SONRA basılır
      if (kurulumHatasi) {
        box.className = "inline-status bad";
        box.textContent = "✕ " + kurulumHatasi;
      }
    }
  }


  /* ---------------- Suflo Pro lisans UI ---------------- */

  // Pro durumunu arayüze yansıt: ayar kartları + sekme/buton rozetleri.
  // pro.js yapılandırılmadıysa (lansman öncesi) markLocked hiçbir şey yapmaz.
  function reflectPro() {
    if (!window.Pro) return;
    var s = Pro.status();

    var locked = el("pro-locked-card"), active = el("pro-active-card");
    if (locked && active) {
      locked.hidden = !!s.pro;
      active.hidden = !s.pro;
      var em = el("pro-email");
      if (em) em.textContent = s.email ? "· " + s.email : "";
      var rc = el("pro-recheck");
      if (rc) rc.hidden = !s.needsRecheck;
    }

    // Pro'ya kilitli girişler: sekmeler + tekil butonlar
    Pro.markLocked(document.querySelector('.tab[data-tab="cut"]'), !s.pro);
    Pro.markLocked(document.querySelector('.tab[data-tab="beat"]'), !s.pro);
    Pro.markLocked(el("cap-overlay"), !s.pro);
    Pro.markLocked(el("cap-translate-go"), !s.pro);

    // Kilitli secenekler (karaoke modlari, kelimeli animasyonlar) acilir
    // listede " — PRO" ekiyle gorunsun: kullanici neyin ucretli oldugunu
    // secmeyi denemeden once gorur
    Array.prototype.forEach.call(document.querySelectorAll("option[data-pro]"), function (o) {
      if (!o.dataset.temel) o.dataset.temel = o.textContent;
      o.textContent = s.pro ? o.dataset.temel : o.dataset.temel + " — PRO";
    });
  }

  function initPro() {
    if (!window.Pro || !el("pro-activate")) return;

    el("pro-activate").addEventListener("click", function () {
      var key = el("pro-key").value;
      var msg = el("pro-msg");
      msg.textContent = "Etkinleştiriliyor…";
      msg.className = "inline-status";
      Pro.activate(key, function (r) {
        if (r.ok) {
          msg.textContent = "";
          toast("Suflo Pro aktif — iyi kurgular! 🎬", "good");
          reflectPro();
        } else {
          msg.textContent = r.error || "Etkinleştirilemedi.";
          msg.className = "inline-status bad";
        }
      });
    });

    el("pro-deactivate").addEventListener("click", function () {
      Pro.deactivate(function () {
        toast("Lisans bu makineden kaldırıldı.");
        reflectPro();
      });
    });

    el("pro-buy").addEventListener("click", function (e) {
      e.preventDefault();
      // Lemon Squeezy checkout — Suflo Pro 749 TL
      K.cs.openURLInDefaultBrowser("https://suflo.lemonsqueezy.com/checkout/buy/908e6046-8c5b-4473-9418-0860468e331c");
    });
  }

  function initSettings() {
    initPro();
    var s = K.settings();
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


    el("set-ffmpeg-recheck").addEventListener("click", function () { checkFfmpeg(true); });
    el("set-ffmpeg-install").addEventListener("click", installFfmpeg);
    // macOS'ta winget yok — dugme ne yapiyorsa onu yazsin
    // mac'te Homebrew varsa onunla, yoksa dogrudan indirmeyle kurulur
    if (K.MAC && K.brewYolu()) el("set-ffmpeg-install").textContent = "Homebrew ile kur";

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

    function gunlukKopyala() {
      var txt = K.logText();
      var ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      return ok ? txt.split("\n").length : 0;
    }

    el("set-copy-log").addEventListener("click", function () {
      var n = gunlukKopyala();
      if (n) toast("Günlük panoya kopyalandı (" + n + " satır)", "good");
      else toast("Kopyalanamadı", "bad");
    });

    // Tek tikla sorun bildirimi: gunluk panoya, tarayicida onceden doldurulmus
    // issue formu. Gunluk URL'ye konmaz (uzunluk + kisisel yol iceriyor olabilir).
    el("set-report").addEventListener("click", function () {
      var sistem = "Windows";
      if (K.MAC) {
        var arm = false;
        try { arm = require("os").arch() === "arm64"; } catch (e) {}
        sistem = arm ? "macOS (Apple Silicon: M1/M2/M3/M4)" : "macOS (Intel)";
      }
      var ppro = "";
      try { ppro = JSON.parse(window.__adobe_cep__.getHostEnvironment()).appVersion || ""; } catch (e) {}
      var u = "https://github.com/" + K.REPO + "/issues/new?template=hata-bildirimi.yml" +
        "&title=" + encodeURIComponent("[Hata] v" + K.VERSION + ": ") +
        "&sistem=" + encodeURIComponent(sistem);
      if (ppro) u += "&premiere=" + encodeURIComponent(ppro);
      var n = gunlukKopyala();
      K.cs.openURLInDefaultBrowser(u);
      toast(n
        ? "Günlük kopyalandı. Açılan sayfada \"Panel günlüğü\" alanına yapıştır (Ctrl+V)."
        : "Bildirim sayfası açıldı. Günlüğü \"Günlüğü kopyala\" ile ekleyebilirsin.", "good", 9000);
    });

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
      box.textContent = "✕ bulunamadı — altyazı çalışmaz. Aşağıdaki düğmeye bas, " +
        "panel indirip kursun (bir kerelik, yaklaşık 100 MB).";
    }
    return ff;
  }

  /*
   * ffmpeg kurulumu. Paket yoneticisi (winget/brew) DENENMEZ oncelikli yol olarak:
   * winget her makinede yok, kurumsal makinede kapali olabiliyor ve kurulum
   * basarili olsa bile PATH'i CALISAN Premiere surecine yansitmiyor. Bunun yerine
   * ikiliyi dogrudan indirip panelin kendi klasorune koyuyoruz.
   * macOS'ta Homebrew varsa once o denenir: kullanicinin sistemiyle uyumlu kalir.
   */
  var ffmpegKuruluyor = false;

  async function installFfmpeg() {
    if (ffmpegKuruluyor) return;
    ffmpegKuruluyor = true;
    var box = el("set-ffmpeg-status");
    var btn = el("set-ffmpeg-install");
    var eskiEtiket = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; }
    box.className = "inline-status";

    function say(m) { box.textContent = m; }

    try {
      if (K.MAC && K.brewYolu()) {
        say("brew install ffmpeg… (birkaç dakika sürebilir)");
        await K.run(K.brewYolu(), ["install", "ffmpeg"], { timeout: 1800000 });
        if (await K.findFfmpeg(true)) {
          toast("ffmpeg kuruldu", "good");
          await checkFfmpeg();
          return;
        }
        say("Homebrew kuramadı, doğrudan indiriliyor…");
      }

      await KEngine.installFfmpeg(say);
      var ff = await K.findFfmpeg(true);
      if (ff) {
        toast("ffmpeg hazır — altyazı alabilirsin", "good");
        await checkFfmpeg();
        KCaptions.refreshSetup();
      } else {
        throw new Error("kurulum sonrası doğrulanamadı");
      }
    } catch (e) {
      var m = K.hataYardimi(e);
      box.className = "inline-status bad";
      box.textContent = "✕ " + m;
      toast(m, "bad", 12000);
      K.log("ffmpeg kurulumu basarisiz: " + (e && e.message ? e.message : e));
    } finally {
      ffmpegKuruluyor = false;
      if (btn) { btn.disabled = false; btn.textContent = eskiEtiket; }
    }
  }

  /* ---------------- Başlat ---------------- */

  /* ---------------- Güncelleme kontrolü ---------------- */

  /*
   * Guncelleme. ZXP IMZALI oldugu icin panel kendi dosyalarini degistiremez —
   * degistirirse imza bozulur ve Premiere eklentiyi hic yuklemez. Yani "sessizce
   * guncelle" mumkun degil; yapabilecegimiz en iyi sey kullaniciyi tek tiklamayla
   * indirilmis .zxp dosyasinin onune getirmek.
   */
  var guncelleme = null;   // { surum, url, ad, not }

  function surumDahaYeni(yeni, mevcut) {
    var a = String(yeni).split(".").map(Number);
    var b = String(mevcut).split(".").map(Number);
    for (var i = 0; i < 3; i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true;
      if ((a[i] || 0) < (b[i] || 0)) return false;
    }
    return false;
  }

  async function checkUpdate() {
    if (!K.nodeOK) return;
    try {
      var r = await K.httpGet("https://api.github.com/repos/" + K.REPO + "/releases/latest");
      if (r.status !== 200) return;
      var j = JSON.parse(r.body);
      var tag = String(j.tag_name || "").replace(/^v/, "");
      if (!tag || !surumDahaYeni(tag, K.VERSION)) return;

      // kullanici bu surumu "gosterme" dediyse rahatsiz etme
      if (K.settings().skipVersion === tag) { K.log("guncelleme v" + tag + " kullanici tarafindan gizlendi"); return; }

      /*
       * Asıl dağıtım v1.9'dan beri Kurulum ZIP'i; .zxp yalnız ZXP Installer
       * kullananlar için duruyor. Eskiden burada YALNIZ .zxp aranıyordu —
       * ZIP'li bir release'te düğme sessizce devre dışı kalıyordu (yaşandı,
       * v2.2.0). Sıra: Kurulum ZIP > .zxp > release sayfası.
       */
      var varliklar = j.assets || [];
      var zip = varliklar.filter(function (a) { return /-Kurulum\.zip$/i.test(a.name); })[0];
      var zxp = varliklar.filter(function (a) { return /\.zxp$/i.test(a.name); })[0];
      var paket = zip || zxp;
      // Surum notunun ilk anlamli satiri: neden guncellesin, bir cumleyle
      var ilkSatir = String(j.body || "").split("\n").map(function (s) {
        return s.replace(/^[#*\->\s]+/, "").trim();
      }).filter(function (s) { return s.length > 12; })[0] || "";

      guncelleme = {
        surum: tag,
        url: paket ? paket.browser_download_url : ("https://github.com/" + K.REPO + "/releases/latest"),
        ad: paket ? paket.name : "Suflo-" + tag + "-Kurulum.zip",
        zip: !!zip,
        not: ilkSatir.slice(0, 90)
      };
      K.log("guncelleme mevcut: v" + tag);

      el("update-baslik").textContent = "Yeni sürüm: v" + tag;
      el("update-not").textContent = guncelleme.not ||
        (guncelleme.zip ? "İndir, ZIP'i aç, kur dosyasına çift tıkla." : "İndir, çift tıkla, Premiere'i yeniden başlat.");
      el("update-indir").disabled = !paket;
      el("update-bar").hidden = false;
    } catch (e) {}
  }

  // Indirilen dosyayi kullanicinin onune getir: once dosyayi acmayi dene
  // (ZXP Installer kuruluysa devrali), olmazsa klasoru ac.
  async function dosyayiGoster(yol) {
    var klasor = K.path.dirname(yol);
    if (K.MAC) {
      var r = await K.run("/usr/bin/open", [yol], { timeout: 20000 });
      if (r.code !== 0) await K.run("/usr/bin/open", ["-R", yol], { timeout: 20000 });
    } else {
      var w = await K.run("cmd", ["/c", "start", "", yol], { timeout: 20000 });
      if (w.code !== 0) await K.run("explorer", ["/select,", yol], { timeout: 20000 });
    }
    return klasor;
  }

  async function guncellemeyiIndir() {
    if (!guncelleme) return;
    var b = el("update-indir");
    b.disabled = true;
    var eski = b.textContent;
    b.textContent = "İniyor…";
    try {
      var indirilenler = K.path.join(K.os.homedir(), "Downloads");
      if (!K.fs.existsSync(indirilenler)) indirilenler = K.os.homedir();
      var hedef = K.path.join(indirilenler, guncelleme.ad);
      var d = await K.download(guncelleme.url, hedef, function (f) {
        b.textContent = "%" + Math.round(f * 100);
      }, 0, undefined, { key: "zxp:" + guncelleme.surum });
      if (!d.ok) throw new Error(d.error || "indirilemedi");
      await dosyayiGoster(hedef);
      // ZIP'in İÇİNDEN çalıştırılan .bat panel dosyalarını bulamaz — önce ayıklatmak şart
      el("update-not").textContent = guncelleme.zip
        ? "İndirildi. ZIP'i aç (sağ tık > Tümünü ayıkla), kur dosyasına çift tıkla, Premiere'i yeniden başlat."
        : "İndirildi. Dosyaya çift tıkla, sonra Premiere'i yeniden başlat.";
      b.textContent = "İndirildi ✓";
      toast("v" + guncelleme.surum + " indirildi: " + hedef, "good");
    } catch (e) {
      b.textContent = eski;
      b.disabled = false;
      toast("İndirilemedi: " + e.message + " — github.com/" + K.REPO + "/releases", "bad");
      K.cs.openURLInDefaultBrowser("https://github.com/" + K.REPO + "/releases/latest");
    }
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

    // Sürüm etiketleri tek kaynaktan (bridge.js VERSION) beslenir: elle yazılan
    // "v1.7" her yayında geride kalıyor, kullanıcı hangi sürümde olduğunu bilemiyordu
    ["brand-ver", "hakkinda-ver"].forEach(function (id) {
      var e = el(id);
      if (e) e.textContent = "v" + K.VERSION;
    });

    // Bağlam yoklaması ve ffmpeg denetimi ÖNCE: modüllerden bağımsız çalışsın
    guvenli("bağlam", pollContext);
    guvenli("ffmpeg", checkFfmpeg);
    setInterval(pollContext, 2500);

    // Pro lisans durumu EN ÖNCE: modüller isPro()'yu init sırasında okuyabilsin
    guvenli("Pro", function () {
      Pro.init();
      Pro.onUpgrade(function () {
        goster("settings");
        var k = el("pro-key"); if (k) k.focus();
      });
      Pro.on(reflectPro);
    });

    guvenli("sekmeler", initTabs);
    guvenli("ayarlar", initSettings);
    guvenli("Altyazı", function () { KCaptions.init(); });
    guvenli("Kesim", function () { KCut.init(); });
    guvenli("Ritim", function () { KBeat.init(); });
    guvenli("Pro-UI", reflectPro);

    if (el("update-indir")) el("update-indir").addEventListener("click", guncellemeyiIndir);
    if (el("update-kapat")) {
      el("update-kapat").addEventListener("click", function () {
        el("update-bar").hidden = true;
        if (guncelleme) {                      // bu sürüm için bir daha gösterme
          var s = K.settings();
          s.skipVersion = guncelleme.surum;
          K.saveSettings();
        }
      });
    }

    setTimeout(checkUpdate, 4000);
    // Panel günlerce açık kalabiliyor; tek açılış kontrolü yeni sürümü hiç göstermezdi
    setInterval(checkUpdate, 6 * 3600 * 1000);
    // eski geçici ses dosyalarını süpür (disk sessizce dolmasın)
    setTimeout(function () { try { K.sweepTemp(); } catch (e) {} }, 6000);
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    toast: toast,
    onContext: onContext,
    onTab: onTab,
    ctx: function () { return ctx; },
    installLocalWhisper: installLocalWhisper,
    checkUpdate: checkUpdate
  };
})();
