/*
 * Suflo Pro — yerlesik Motion presetleri
 *
 * 12 yerlesik preset panelden dogrudan uygulanir. Lisansli Suflo Smooth
 * .prfpset paketi ise Pro icerik bulutundan iner; Adobe API sessiz importu
 * desteklemedigi icin panel dosyayi gosterip tek seferlik gercek kurulumu anlatir.
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
    return PRESETS.filter(function (p) {
      if (filter === "fav" && !isFavorite(p.id)) return false;
      if (filter !== "all" && filter !== "fav" && p.group !== filter) return false;
      return !query || (p.name + " " + p.desc + " " + p.group).toLowerCase().indexOf(query) !== -1;
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
        '<h3 id="preset-pack-title">Preset paketi hazır</h3>' +
        '<p>Adobe, efekt presetlerini eklentiden sessizce içe aktarmaya izin vermiyor. Bir kez şu üç adımı yap; paket Premiere’de kalır.</p>' +
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

  async function installPack(pack, card) {
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
      showPackGuide(pack, file);
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad", 7000);
    } finally {
      busy = "";
      if (card) card.classList.remove("busy");
    }
  }

  function appendPackCard(grid, pack, locked) {
    var card = document.createElement("article");
    card.className = "preset-card preset-pack-card" + (locked ? " locked" : "");
    card.setAttribute("aria-label", pack.name + " · " + pack.count + " Premiere efekt preseti" + (locked ? " · kilitli" : ""));
    card.innerHTML =
      '<div class="preset-pack-visual" aria-hidden="true"><span>PR</span><b>' + pack.count + '</b><i>PRESET</i>' +
        (locked ? '<em><svg viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg></em>' : '') +
      '</div>' +
      '<div class="preset-pack-copy"><span class="preset-pack-label">YENİ · EFEKT PAKETİ</span><b>' + esc(pack.name) + '</b><p>' + esc(pack.desc) + '</p><small>Bir kez içe aktar · Premiere’de kalır</small></div>' +
      '<button type="button" class="preset-apply preset-pack-install' + (locked ? ' is-locked' : '') + '">' +
        (locked ? '<svg viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg><span>KİLİTLİ</span>' : '<svg viewBox="0 0 20 20"><path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 16h12"/></svg><span>KURULUMU AÇ</span>') +
      '</button>';
    card.querySelector(".preset-pack-install").addEventListener("click", function () { installPack(pack, card); });
    grid.appendChild(card);
  }

  async function apply(preset, card) {
    if (busy) return;
    if (typeof Pro !== "undefined" && !Pro.gate("presets")) return;
    busy = preset.id;
    if (card) card.classList.add("busy");
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
      if (card) card.classList.remove("busy");
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
    if (el("preset-count")) el("preset-count").textContent = list.length + " / " + PRESETS.length + " tek-tık · " + PACKS[0].count + " efekt";
    if (el("preset-sayac")) el("preset-sayac").textContent = String(PRESETS.length + PACKS[0].count);

    packs.forEach(function (pack) { appendPackCard(grid, pack, locked); });

    list.forEach(function (p) {
      var card = document.createElement("article");
      card.className = "preset-card" + (locked ? " locked" : "");
      card.setAttribute("role", "group");
      card.setAttribute("aria-label", p.name + (locked ? " · Suflo Pro preseti, kilitli" : " · secili klibe uygula"));
      var action = locked
        ? '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg><span>LOCKED</span>'
        : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4"/></svg><span>UYGULA</span>';
      card.innerHTML =
        '<div class="preset-preview preset-preview-' + esc(p.preview) + '" aria-hidden="true">' +
          '<span class="preset-frame"><i></i><b>SUFLO</b></span>' +
          '<em>' + esc(p.group.toUpperCase()) + '</em>' +
          (locked ? '<span class="preset-lock"><svg viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg></span>' : "") +
        '</div>' +
        '<div class="preset-body"><span><b>' + esc(p.name) + '</b><i>' + esc(p.desc) + '</i></span>' +
          '<button type="button" class="preset-fav' + (isFavorite(p.id) ? " on" : "") + '" title="Favori" aria-pressed="' + (isFavorite(p.id) ? "true" : "false") + '">♥</button>' +
        '</div>' +
        '<button type="button" class="preset-apply' + (locked ? " is-locked" : "") + '">' + action + '</button>';
      card.querySelector(".preset-fav").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFavorite(p.id);
      });
      card.querySelector(".preset-apply").addEventListener("click", function () { apply(p, card); });
      card.querySelector(".preset-preview").addEventListener("click", function () { apply(p, card); });
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
    if (typeof Pro !== "undefined") Pro.on(render);
    KApp.onTab("presets", render);
    render();
  }

  return {
    init: init,
    render: render,
    list: function () { return PRESETS.slice(); },
    packs: function () { return PACKS.slice(); },
    count: function () { return PRESETS.length; }
  };
})();
