/*
 * Suflo Pro — panelden dogrudan Motion presetleri
 *
 * 12 yerlesik preset ile Suflo Smooth paketindeki standart Premiere
 * parametreleri panelden secili klibe uygulanir. Opak Adobe/ucuncu taraf
 * verisi kullanan az sayidaki preset, dosyayi gosteren guvenli ice aktarma
 * yoluna duser; hicbir zaman sahte "uygulandi" mesaji verilmez.
 */
window.KPresets = (function () {
  "use strict";

  var PRESETS = [
    { id: "simple-zoom-in", name: "Simple Zoom In", group: "zoom", desc: "Yumusak yaklasma", preview: "zoom-in" },
    { id: "simple-zoom-out", name: "Simple Zoom Out", group: "zoom", desc: "Temiz acilma", preview: "zoom-out" },
    { id: "pop-in", name: "Pop In", group: "zoom", desc: "Esnek giris", preview: "pop" },
    { id: "slide-in-left", name: "Slide In Left", group: "slide", desc: "Soldan giris", preview: "slide-left" },
    { id: "slide-in-right", name: "Slide In Right", group: "slide", desc: "Sagdan giris", preview: "slide-right" },
    { id: "slide-in-up", name: "Slide In Up", group: "slide", desc: "Alttan yukari", preview: "slide-up" },
    { id: "slide-in-down", name: "Slide In Down", group: "slide", desc: "Yukaridan asagi", preview: "slide-down" },
    { id: "fade-in", name: "Clean Fade In", group: "fade", desc: "Temiz gorunme", preview: "fade-in" },
    { id: "fade-out", name: "Clean Fade Out", group: "fade", desc: "Temiz kaybolma", preview: "fade-out" },
    { id: "punch", name: "Focus Punch", group: "impact", desc: "Vurgu zoomu", preview: "punch" },
    { id: "micro-shake", name: "Micro Shake", group: "impact", desc: "Kisa kamera vurgusu", preview: "shake" },
    { id: "slide-out-right", name: "Slide Out Right", group: "slide", desc: "Saga cikis", preview: "slide-out" }
  ];
  var PACKS = [
    {
      id: "suflo-smooth-278",
      name: "Suflo Smooth Editing Pack",
      file: "Suflo Smooth Editing Pack.prfpset",
      count: 278,
      group: "pack",
      desc: "Shake · Slide · Zoom · Transition · Look",
      keywords: "shake slide zoom transition look blur flash flicker stroke vignette preset paketi"
    }
  ];
  var filter = "all";
  var query = "";
  var busy = "";
  var packCatalog = [];
  var packCatalogKey = "";
  var packLoading = false;
  var packError = "";

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function favorites() {
    var s = K.settings();
    if (!Array.isArray(s.motionPresetFavs)) s.motionPresetFavs = [];
    return s.motionPresetFavs;
  }
  function isFavorite(id) { return favorites().indexOf(id) !== -1; }
  function toggleFavorite(id) {
    var favs = favorites();
    var at = favs.indexOf(id);
    if (at === -1) favs.push(id); else favs.splice(at, 1);
    K.saveSettings();
    render();
  }
  function speedValue() {
    var input = el("preset-speed");
    var n = Number(input && input.value);
    return isFinite(n) && n >= .18 && n <= 1.5 ? n : .45;
  }
  function strengthValue() {
    var input = el("preset-strength");
    var n = Number(input && input.value);
    return isFinite(n) && n >= .5 && n <= 1.8 ? n : 1;
  }
  function filtered() {
    return PRESETS.concat(packCatalog).filter(function (p) {
      if (filter === "fav" && !isFavorite(p.id)) return false;
      if (filter === "pack" && p.source !== "pack") return false;
      if (filter !== "all" && filter !== "fav" && filter !== "pack" && p.group !== filter) return false;
      return !query || (p.name + " " + p.desc + " " + p.group + " " + (p.folder || "")).toLowerCase().indexOf(query) !== -1;
    });
  }

  function visiblePacks() {
    if (filter !== "all" && filter !== "pack") return [];
    return PACKS.filter(function (p) {
      return !query || (p.name + " " + p.desc + " " + p.keywords).toLowerCase().indexOf(query) !== -1;
    });
  }

  function packRoot() {
    if (!K.nodeOK || !K.fs || !K.path) return "";
    var root = String(K.settings().proPackKlasor || "").trim();
    if (!root || !K.fs.existsSync(root)) return "";
    var dir = K.path.join(root, "presets");
    try { return K.fs.existsSync(dir) && K.fs.statSync(dir).isDirectory() ? dir : ""; } catch (e) { return ""; }
  }

  function packPath(pack) {
    var root = packRoot();
    if (!root) return "";
    var exact = K.path.join(root, pack.file);
    try { if (K.fs.existsSync(exact) && K.fs.statSync(exact).isFile()) return exact; } catch (e0) {}
    try {
      var names = K.fs.readdirSync(root);
      for (var i = 0; i < names.length; i++) {
        if (String(names[i]).toLowerCase() !== String(pack.file).toLowerCase()) continue;
        var candidate = K.path.join(root, names[i]);
        if (K.fs.statSync(candidate).isFile()) return candidate;
      }
    } catch (e1) {}
    return "";
  }

  function loadPackCatalog(force) {
    if (packLoading || !K.nodeOK || !K.fs || !K.path || !window.SufloPresetPack) return;
    if (typeof Pro !== "undefined" && !Pro.isPro()) return;
    var file = packPath(PACKS[0]);
    if (!file) return;
    var stat;
    try { stat = K.fs.statSync(file); } catch (e0) { return; }
    var key = file + ":" + stat.size + ":" + Number(stat.mtimeMs || stat.mtime);
    if (!force && packCatalogKey === key && packCatalog.length) return;
    packLoading = true;
    packError = "";
    render();
    setTimeout(function () {
      try {
        var parsed = window.SufloPresetPack.parse(K.fs.readFileSync(file, "utf8"));
        if (!parsed || parsed.total !== PACKS[0].count) {
          throw new Error("Preset kataloğu eksik: " + (parsed ? parsed.total : 0) + "/" + PACKS[0].count);
        }
        packCatalog = parsed.presets;
        packCatalogKey = key;
      } catch (e) {
        packCatalog = [];
        packCatalogKey = "";
        packError = e && e.message ? e.message : String(e);
        K.log("preset paketi okunamadi: " + packError);
      }
      packLoading = false;
      render();
    }, 20);
  }

  async function revealFile(file) {
    if (!file || !K.nodeOK) return false;
    var r = K.MAC
      ? await K.run("/usr/bin/open", ["-R", file], { timeout: 10000 })
      : await K.run("explorer.exe", ["/select,", file], { timeout: 10000 });
    return !!r && r.code === 0;
  }

  function showPackGuide(pack, file) {
    var old = document.querySelector("#preset-pack-guide");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var wrap = document.createElement("div");
    wrap.id = "preset-pack-guide";
    wrap.className = "preset-pack-guide";
    wrap.innerHTML =
      '<div class="preset-pack-dialog" role="dialog" aria-modal="true" aria-labelledby="preset-pack-title">' +
        '<button class="preset-pack-x" type="button" aria-label="Kapat">×</button>' +
        '<span class="preset-pack-kicker">SUFLO PRO · ' + pack.count + ' EFEKT</span>' +
        '<h3 id="preset-pack-title">Premiere modu gerekiyor</h3>' +
        '<p>Bu preset özel Adobe verisi veya harici efekt kullanıyor. Suflo 270 preseti doğrudan uygular; bu özel preset için güvenli içe aktarma gerekir.</p>' +
        '<ol><li><b>Dosyayı göster</b> düğmesine bas.</li><li>Premiere’de <b>Effects → Presets</b> klasörüne sağ tıkla.</li><li><b>Import Presets</b> deyip seçili <code>.prfpset</code> dosyasını aç.</li></ol>' +
        '<div class="preset-pack-path">' + esc(file) + '</div>' +
        '<div class="preset-pack-actions"><button class="btn primary preset-pack-reveal" type="button">Dosyayı göster</button><button class="btn ghost preset-pack-done" type="button">Tamam</button></div>' +
      '</div>';
    document.body.appendChild(wrap);
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    wrap.querySelector(".preset-pack-x").addEventListener("click", close);
    wrap.querySelector(".preset-pack-done").addEventListener("click", close);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    wrap.querySelector(".preset-pack-reveal").addEventListener("click", async function () {
      var ok = await revealFile(file);
      KApp.toast(ok ? "Preset dosyası seçili olarak açıldı." : "Dosya gösterilemedi: " + file, ok ? "good" : "bad");
    });
  }

  async function installPack(pack, card, guide) {
    if (busy) return;
    if (typeof Pro !== "undefined" && !Pro.gate("presets")) return;
    busy = pack.id;
    if (card) card.classList.add("busy");
    try {
      var file = packPath(pack);
      if (!file && typeof ProSync !== "undefined") {
        KApp.toast("Preset paketi buluttan eşitleniyor…");
        var sync = await ProSync.sync({ force: true });
        if (!sync || sync.ok === false) throw new Error(sync && sync.error ? sync.error : "Pro içerikleri eşitlenemedi.");
        file = packPath(pack);
      }
      if (!file) throw new Error("Preset paketi henüz indirilmedi. Ayarlar → Pro İçerikleri bölümünden eşitlemeyi çalıştır.");
      loadPackCatalog(true);
      if (guide) showPackGuide(pack, file);
      else KApp.toast("Preset kataloğu hazırlandı — karttan seçip doğrudan uygula.", "good", 5000);
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad", 7000);
    } finally {
      busy = "";
      if (card) card.classList.remove("busy");
    }
  }

  function appendPackCard(grid, pack, locked) {
    var card = document.createElement("article");
    var ready = !locked && packCatalog.length === pack.count;
    card.className = "preset-card preset-pack-card" + (locked ? " locked" : "") + (ready ? " ready" : "");
    card.setAttribute("aria-label", pack.name + " · " + pack.count + " Premiere efekt preseti" + (locked ? " · kilitli" : ""));
    card.innerHTML =
      '<div class="preset-pack-visual" aria-hidden="true"><span>PR</span><b>' + pack.count + '</b><i>PRESET</i>' +
        (locked ? '<em><svg viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg></em>' : '') +
      '</div>' +
      '<div class="preset-pack-copy"><span class="preset-pack-label">SUFLO NATIVE PRESET MOTORU</span><b>' + esc(pack.name) + '</b><p>' + esc(pack.desc) + '</p><small>' +
        (locked ? 'Pro’da presetleri panelden seçip uygula' : (ready ? '270 doğrudan · 8 özel Premiere modu' : (packLoading ? 'Preset kataloğu hazırlanıyor…' : (packError ? esc(packError) : 'Buluttan eşitle ve panelden kullan')))) + '</small></div>' +
      '<button type="button" class="preset-apply preset-pack-install' + (locked ? ' is-locked' : '') + '">' +
        (locked ? '<svg viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg><span>KİLİTLİ</span>' : (ready ? '<svg viewBox="0 0 20 20"><path d="m4 10 3.5 3.5L16 5"/></svg><span>278 HAZIR</span>' : '<svg viewBox="0 0 20 20"><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 16h12"/></svg><span>' + (packLoading ? 'HAZIRLANIYOR' : 'ŞİMDİ EŞİTLE') + '</span>')) +
      '</button>';
    card.querySelector(".preset-pack-install").addEventListener("click", function () {
      if (locked) { if (typeof Pro !== "undefined") Pro.gate("presets"); return; }
      if (ready) {
        filter = "pack";
        var filters = el("preset-filter");
        if (filters) Array.prototype.forEach.call(filters.querySelectorAll("button"), function (b) { b.classList.toggle("on", b.getAttribute("data-f") === "pack"); });
        render();
        return;
      }
      installPack(pack, card, false);
    });
    grid.appendChild(card);
  }

  async function apply(preset, card) {
    if (busy) return;
    if (typeof Pro !== "undefined" && !Pro.gate("presets")) return;
    busy = preset.id;
    setApplyBusy(card, true);
    try {
      var result = await K.call("KS_applyMotionPreset", {
        id: preset.id,
        duration: speedValue(),
        strength: strengthValue()
      }, 30000);
      if (!result || !result.ok) throw new Error(result && result.error ? result.error : "Preset uygulanamadi.");
      if (card) card.classList.add("ok");
      KApp.toast(result.applied + " klibe uygulandi · " + preset.name, "good");
      setTimeout(function () { if (card) card.classList.remove("ok"); }, 900);
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      busy = "";
      setApplyBusy(card, false);
    }
  }

  async function applyPacked(preset, card) {
    if (busy) return;
    if (typeof Pro !== "undefined" && !Pro.gate("presets")) return;
    if (!preset.direct) { installPack(PACKS[0], card, true); return; }
    busy = preset.id;
    setApplyBusy(card, true);
    try {
      if (!K.nodeOK || !K.fs || !K.path || !K.settingsPath) throw new Error("Preset çalışma alanı açılamadı.");
      var settingsFile = K.settingsPath();
      if (!settingsFile) throw new Error("Suflo veri klasörü bulunamadı.");
      var runtime = K.path.join(K.path.dirname(settingsFile), "preset-runtime.json");
      var tmp = runtime + ".tmp";
      K.fs.writeFileSync(tmp, JSON.stringify({
        schema: 1,
        id: preset.id,
        name: preset.name,
        components: preset.components
      }), "utf8");
      try { if (K.fs.existsSync(runtime)) K.fs.unlinkSync(runtime); } catch (e0) {}
      K.fs.renameSync(tmp, runtime);
      var result = await K.call("KS_applyPackedPreset", {
        path: runtime,
        speed: speedValue() / .45,
        strength: strengthValue()
      }, 120000);
      if (!result || !result.ok) {
        var message = result && result.error ? result.error : "Preset uygulanamadı.";
        if (/Eksik efekt|efekt motoru/i.test(message)) {
          var sourceFile = packPath(PACKS[0]);
          if (sourceFile) showPackGuide(PACKS[0], sourceFile);
        }
        throw new Error(message);
      }
      if (card) card.classList.add("ok");
      var suffix = result.skippedComponents ? " · " + result.skippedComponents + " bileşen atlandı" : "";
      KApp.toast(result.applied + " klibe doğrudan uygulandı · " + preset.name + suffix, result.skippedComponents ? "warn" : "good", 6000);
      setTimeout(function () { if (card) card.classList.remove("ok"); }, 900);
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad", 8000);
    } finally {
      busy = "";
      setApplyBusy(card, false);
    }
  }

  function setApplyBusy(card, active) {
    if (!card) return;
    var button = card.querySelector(".preset-apply");
    var label = button && button.querySelector("span");
    card.classList.toggle("busy", !!active);
    if (!button) return;
    button.disabled = !!active;
    button.setAttribute("aria-busy", active ? "true" : "false");
    if (!label) return;
    if (active) {
      if (!label.getAttribute("data-idle-label")) label.setAttribute("data-idle-label", label.textContent || "UYGULA");
      label.textContent = "UYGULANIYOR…";
    } else {
      label.textContent = label.getAttribute("data-idle-label") || "UYGULA";
    }
  }

  function render() {
    var grid = el("preset-grid");
    var empty = el("preset-empty");
    if (!grid) return;
    var list = filtered();
    var packs = visiblePacks();
    var locked = typeof Pro !== "undefined" && !Pro.isPro();
    grid.innerHTML = "";
    if (empty) empty.hidden = !!(list.length || packs.length);
    var total = PRESETS.length + (packCatalog.length || PACKS[0].count);
    if (el("preset-count")) el("preset-count").textContent = (packLoading ? "Katalog hazırlanıyor · " : "") + list.length + " / " + total + " panel preseti";
    if (el("preset-sayac")) el("preset-sayac").textContent = String(PRESETS.length + PACKS[0].count);

    packs.forEach(function (pack) { appendPackCard(grid, pack, locked); });

    list.forEach(function (p) {
      var card = document.createElement("article");
      var fallback = p.source === "pack" && !p.direct;
      card.className = "preset-card" + (locked ? " locked" : "") + (p.source === "pack" ? " preset-pack-entry" : "") + (fallback ? " fallback" : "");
      card.setAttribute("role", "group");
      card.setAttribute("aria-label", p.name + (locked ? " · Suflo Pro preseti, kilitli" : " · secili klibe uygula"));
      var action = locked
        ? '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg><span>LOCKED</span>'
        : (fallback
          ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 16h12"/></svg><span>PREMIERE MODU</span>'
          : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4"/></svg><span>UYGULA</span>');
      card.innerHTML =
        '<div class="preset-preview preset-preview-' + esc(p.preview) + '" aria-hidden="true">' +
          '<span class="preset-frame"><i></i><b>SUFLO</b></span>' +
          '<em>' + esc(p.source === "pack" ? "SUFLO SMOOTH" : p.group.toUpperCase()) + '</em>' +
          (locked ? '<span class="preset-lock"><svg viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg></span>' : "") +
        '</div>' +
        '<div class="preset-body"><span><b title="' + esc(p.name) + '">' + esc(p.name) + '</b><i title="' + esc(p.folder || p.desc) + '">' + esc(p.folder || p.desc) + '</i></span>' +
          '<button type="button" class="preset-fav' + (isFavorite(p.id) ? " on" : "") + '" title="Favori" aria-pressed="' + (isFavorite(p.id) ? "true" : "false") + '">♥</button>' +
        '</div>' +
        '<button type="button" class="preset-apply' + (locked ? " is-locked" : "") + '">' + action + '</button>';
      card.querySelector(".preset-fav").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFavorite(p.id);
      });
      var run = function () { if (p.source === "pack") applyPacked(p, card); else apply(p, card); };
      card.querySelector(".preset-apply").addEventListener("click", run);
      card.querySelector(".preset-preview").addEventListener("click", run);
      grid.appendChild(card);
    });
  }

  function init() {
    if (!el("tab-presets")) return;
    var search = el("preset-search");
    if (search) search.addEventListener("input", function () { query = this.value.trim().toLowerCase(); render(); });
    var filters = el("preset-filter");
    if (filters) Array.prototype.forEach.call(filters.querySelectorAll("button"), function (button) {
      button.addEventListener("click", function () {
        filter = button.getAttribute("data-f") || "all";
        Array.prototype.forEach.call(filters.querySelectorAll("button"), function (b) { b.classList.toggle("on", b === button); });
        render();
      });
    });
    var cta = el("preset-proya-gec");
    if (cta) cta.addEventListener("click", function () { if (typeof Pro !== "undefined") Pro.gate("presets"); });
    if (typeof Pro !== "undefined") Pro.on(function () { render(); loadPackCatalog(false); });
    if (typeof ProSync !== "undefined" && ProSync.on) ProSync.on(function (state) {
      if (state && state.phase === "ready") loadPackCatalog(false);
    });
    KApp.onTab("presets", function () { render(); loadPackCatalog(false); });
    loadPackCatalog(false);
    render();
  }

  return {
    init: init,
    render: render,
    list: function () { return PRESETS.slice(); },
    packs: function () { return PACKS.slice(); },
    catalog: function () { return packCatalog.slice(); },
    loadPackCatalog: loadPackCatalog,
    count: function () { return PRESETS.length + (packCatalog.length || PACKS[0].count); }
  };
})();
