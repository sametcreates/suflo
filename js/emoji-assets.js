/*
 * Suflo — Emoji Assets (ucretsiz)
 *
 * Kullanicinin PNG/WEBP/GIF/JPG arsivini oldugu yerden okur. Dosyalari paket
 * icine kopyalamaz; arama, favori, son kullanilan, buyuk onizleme ve playhead'e
 * guvenli yerlestirme saglar. WEBP, Premiere'e girmeden once yerelde PNG olur.
 * Mevcut Unicode emoji secici UCRETSIZ kalir; bu ayri bir Pro medya kutuphanesidir.
 */
window.KEmojiAssets = (function () {
  "use strict";

  var items = [];
  var filtered = [];
  var filterMode = "all";
  var busyPath = "";

  function el(id) { return document.getElementById(id); }
  function basename(p) { return String(p || "").replace(/^.*[\\\/]/, ""); }
  function norm(p) { return String(p || "").replace(/\\/g, "/").toLowerCase(); }
  function extname(p) {
    var m = String(p || "").match(/\.([^.\\\/]+)$/);
    return m ? m[1].toLowerCase() : "";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>\"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fold(s) {
    return String(s || "").toLowerCase()
      .replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ıİi]/g, "i")
      .replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u")
      .replace(/[áàâä]/g, "a").replace(/[éèêë]/g, "e");
  }
  function fileUrl(p) {
    return encodeURI("file:///" + String(p || "").replace(/\\/g, "/"))
      .replace(/#/g, "%23").replace(/\?/g, "%3F");
  }

  function temizAd(file) {
    var n = basename(file).replace(/\.[^.]+$/, "");
    // Arsivdeki "[Free Download IOS Emojis]" gibi site/indirme etiketleri
    // kullanici arayuzune marka gibi sizmasin.
    n = n.replace(/\s*\[[^\]]*(?:free\s*download|download|ios|iphone|emoji)[^\]]*\]\s*/ig, " ");
    n = n.replace(/(?:[_\s-](?:u\+)?[0-9a-f]{4,6})(?:-fe0f)?$/i, "");
    n = n.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!n) n = "Emoji";
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  function proGate() {
    // Emoji Assets UCRETSIZDIR (Samet karari, 20 Agu 2026): emoji gorselleri
    // ucuncu-taraf telifli oldugu icin asla paywall arkasina girmez.
    return true;
  }
  function favlar() {
    var s = K.settings();
    if (!s.emojiAssetFavs) s.emojiAssetFavs = [];
    return s.emojiAssetFavs;
  }
  function sonlar() {
    var s = K.settings();
    if (!s.emojiAssetRecent) s.emojiAssetRecent = [];
    return s.emojiAssetRecent;
  }
  function favMi(item) { return favlar().indexOf(item.path) !== -1; }

  function rootFolder() { return String(K.settings().emojiAssetsKlasor || "").trim(); }

  function buildIndex() {
    items = [];
    var root = rootFolder();
    if (!K.nodeOK || !K.fs || !K.path || !root || !K.fs.existsSync(root)) {
      sayac();
      render();
      return;
    }
    var paths = K.walkVisual ? K.walkVisual(root, 6000, 12) : [];
    var seenPath = {}, seenCopy = {};
    paths.forEach(function (p) {
      var pkey = norm(p);
      if (seenPath[pkey]) return;
      seenPath[pkey] = 1;
      var size = 0;
      try { size = K.fs.statSync(p).size || 0; } catch (e) { return; }
      var name = temizAd(p);
      // Ayni ad + ayni bayt boyutuyla tekrar kopyalanmis dosyayi tek kart yap.
      var copyKey = fold(basename(p)) + "|" + size;
      if (seenCopy[copyKey]) return;
      seenCopy[copyKey] = 1;
      var rel = p.slice(root.length).replace(/^[\\\/]+/, "");
      var parts = rel.split(/[\\\/]/);
      var format = extname(p).toUpperCase();
      if (format === "JPEG") format = "JPG";
      items.push({
        path: p, name: name, format: format,
        folder: parts.length > 1 ? parts[0] : basename(root),
        size: size,
        hay: fold(name + " " + basename(p) + " " + rel)
      });
    });
    items.sort(function (a, b) { return a.name.localeCompare(b.name); });
    sayac();
    search(el("emoji-assets-search") ? el("emoji-assets-search").value : "");
  }

  function sayac() {
    var n = el("emoji-assets-sayac");
    if (n) n.textContent = String(items.length);
  }

  function search(q) {
    var pool = items;
    if (filterMode === "fav") pool = items.filter(favMi);
    else if (filterMode === "recent") {
      var map = {};
      items.forEach(function (item) { map[norm(item.path)] = item; });
      pool = sonlar().map(function (p) { return map[norm(p)]; }).filter(Boolean);
    }
    var terms = fold(q).split(/\s+/).filter(Boolean);
    filtered = pool.filter(function (item) {
      for (var i = 0; i < terms.length; i++) if (item.hay.indexOf(terms[i]) === -1) return false;
      return true;
    }).slice(0, 600);
    render();
  }

  function setFilter(mode) {
    filterMode = mode === "fav" || mode === "recent" ? mode : "all";
    Array.prototype.forEach.call(el("emoji-assets-filter").querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.dataset.f === filterMode);
    });
    search(el("emoji-assets-search").value);
  }

  function render() {
    var grid = el("emoji-assets-grid"), empty = el("emoji-assets-empty");
    if (!grid || !empty) return;
    var root = rootFolder();
    empty.hidden = !!(root && K.nodeOK && K.fs && K.fs.existsSync(root));
    grid.hidden = !empty.hidden;
    grid.innerHTML = "";
    var count = el("emoji-assets-count");
    if (count) count.textContent = items.length ? filtered.length + " / " + items.length + " ASSET" : "YEREL ARŞİV";
    var title = el("emoji-assets-baslik"), alt = el("emoji-assets-alt");
    if (title) title.textContent = filterMode === "fav" ? "Favori Emojiler" : (filterMode === "recent" ? "Son Kullanılanlar" : "Emoji Assets");
    if (alt) alt.textContent = items.length ? items.length + " görsel bulundu · dosyalar yerinde kalır" : "Kendi görsellerin, Premiere'in içinde";
    if (!empty.hidden) return;
    if (!filtered.length) {
      grid.innerHTML = '<p class="hint" style="grid-column:1/-1">' +
        (filterMode === "fav" ? "Henüz favori yok — kartların kalbine tıkla." : "Aramayla eşleşen emoji bulunamadı.") + "</p>";
      return;
    }

    var locked = false; // Emoji Assets ucretsiz — kart hicbir zaman kilitlenmez
    var frag = document.createDocumentFragment();
    filtered.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "mogrt-kart emoji-asset-kart " + item.format.toLowerCase() + (locked ? " locked" : "") + (busyPath === item.path ? " busy" : "");
      var action = locked
        ? '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg><span>LOCKED</span>'
        : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4"/></svg><span>' + (busyPath === item.path ? "HAZIRLANIYOR" : "DRAG") + "</span>";
      card.innerHTML =
        '<span class="mogrt-thumb">' +
          '<img src="' + fileUrl(item.path) + '" alt="" loading="lazy">' +
          '<span class="mogrt-source">PERSONAL EMOJI</span>' +
          '<span class="emoji-format">' + esc(item.format) + "</span>" +
          '<button type="button" class="mogrt-kalp' + (favMi(item) ? " sevildi" : "") + '" title="Favori">♥</button>' +
          (locked ? '<span class="mogrt-lock"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg></span>' : "") +
        "</span>" +
        '<span class="mogrt-card-body">' +
          '<span class="mogrt-meta"><b title="' + esc(item.name) + '">' + esc(item.name) + "</b><i>" + esc(item.folder) + " · " + esc(item.format) + "</i></span>" +
          '<button type="button" class="mogrt-ekle-btn' + (locked ? " is-locked" : "") + '">' + action + "</button>" +
        "</span>";

      card.querySelector(".mogrt-kalp").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFav(item);
      });
      card.querySelector(".mogrt-thumb").addEventListener("click", function () { place(item, card); });
      card.querySelector(".mogrt-ekle-btn").addEventListener("click", function () { place(item, card); });
      if (!locked) {
        card.setAttribute("draggable", "true");
        card.addEventListener("dragstart", function (e) {
          card.classList.add("dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "copy";
            try { e.dataTransfer.setData("text/uri-list", fileUrl(item.path)); } catch (e1) {}
            try { e.dataTransfer.setData("text/plain", item.path); } catch (e2) {}
          }
        });
        card.addEventListener("dragend", function () {
          card.classList.remove("dragging");
          place(item, card);
        });
      }
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  function toggleFav(item) {
    if (!proGate()) return;
    var favs = favlar(), i = favs.indexOf(item.path);
    if (i === -1) favs.push(item.path); else favs.splice(i, 1);
    K.saveSettings();
    search(el("emoji-assets-search").value);
  }

  function cacheDir() {
    var base = K.settingsPath ? K.path.dirname(K.settingsPath()) : K.tmpDir();
    var dir = K.path.join(base, "emoji-cache");
    try { if (!K.fs.existsSync(dir)) K.fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    return dir;
  }
  function hashText(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }
  // WEBP'yi panelin kendi Chromium'uyla coz: ffmpeg'in webp decoder'i
  // ANIMASYONLU WebP'yi desteklemiyor ("skipping unsupported chunk: ANIM"),
  // tarayici ise hepsini acar. Blob -> createImageBitmap -> canvas -> PNG;
  // blob'dan geldigi icin canvas taint olmaz, seffaflik korunur.
  function webpToPngCanvas(srcPath, outPath) {
    return new Promise(function (resolve, reject) {
      try {
        var buf = K.fs.readFileSync(srcPath);
        var blob = new Blob([new Uint8Array(buf)], { type: "image/webp" });
        createImageBitmap(blob).then(function (bmp) {
          var c = document.createElement("canvas");
          c.width = bmp.width; c.height = bmp.height;
          c.getContext("2d").drawImage(bmp, 0, 0);
          var b64 = c.toDataURL("image/png").split(",")[1];
          K.fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
          if (bmp.close) bmp.close();
          resolve(outPath);
        }).catch(reject);
      } catch (e) { reject(e); }
    });
  }

  async function preparePath(item) {
    if (item.format !== "WEBP") return item.path;
    var stat = K.fs.statSync(item.path);
    var out = K.path.join(cacheDir(), "webp-" + hashText(norm(item.path) + "|" + stat.size + "|" + stat.mtimeMs) + ".png");
    if (K.fs.existsSync(out) && K.fs.statSync(out).size > 0) return out;
    try {
      return await webpToPngCanvas(item.path, out);
    } catch (eCanvas) {
      K.log("[emoji] tarayici WEBP donusumu olmadi, ffmpeg deneniyor: " + (eCanvas && eCanvas.message));
    }
    var ff = await K.findFfmpeg();
    if (!ff) throw new Error("Bu WEBP dosyası açılamadı ve ffmpeg de kurulu değil.");
    var r = await K.run(ff, ["-y", "-i", item.path, "-frames:v", "1", "-update", "1", out], { timeout: 120000 });
    if (r.code !== 0 || !K.fs.existsSync(out)) throw new Error("Bu WEBP dosyası Premiere uyumlu PNG'ye çevrilemedi.");
    return out;
  }

  async function place(item, card) {
    if (busyPath || !proGate()) return;
    busyPath = item.path;
    render();
    try {
      var path = await preparePath(item);
      var payload = { path: path, name: item.name };
      if (item.format === "GIF") payload.keepDuration = true;
      else payload.dur = 5;
      var r = await K.call("KS_placeGraphic", payload, 120000);
      if (!r.ok) throw new Error(r.error || "Emoji eklenemedi");
      var rec = sonlar(), i = rec.indexOf(item.path);
      if (i !== -1) rec.splice(i, 1);
      rec.unshift(item.path);
      K.settings().emojiAssetRecent = rec.slice(0, 50);
      K.saveSettings();
      KApp.toast(item.name + " → " + r.trackName + ", playhead", "good");
      if (card) { card.classList.add("ok"); setTimeout(function () { card.classList.remove("ok"); }, 900); }
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      busyPath = "";
      render();
    }
  }

  function saveFolder(folder) {
    folder = String(folder || "").trim().replace(/^"|"$/g, "");
    if (folder && (!K.fs.existsSync(folder) || !K.fs.statSync(folder).isDirectory())) {
      KApp.toast("Emoji klasörü bulunamadı: " + folder, "bad");
      return false;
    }
    K.settings().emojiAssetsKlasor = folder;
    K.saveSettings();
    var input = el("set-emoji-assets-klasor"); if (input) input.value = folder;
    buildIndex();
    if (folder) KApp.toast("Emoji klasörü bağlandı: " + basename(folder), "good");
    return true;
  }

  function chooseFolder() {
    if (!proGate()) return;
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var r = window.cep.fs.showOpenDialogEx(false, true, "Emoji Assets klasörü seç", null, null);
      if (r && r.data && r.data.length) saveFolder(r.data[0]);
      return;
    }
    KApp.toast("Klasör yolunu Ayarlar → İçerik kütüphaneleri alanına yapıştır", "bad");
  }

  function init() {
    if (!el("tab-emoji-assets")) return;
    el("emoji-assets-search").addEventListener("input", function () { search(this.value); });
    el("emoji-assets-yenile").addEventListener("click", buildIndex);
    el("emoji-assets-add-folder").addEventListener("click", chooseFolder);
    el("emoji-assets-add-folder-big").addEventListener("click", chooseFolder);
    Array.prototype.forEach.call(el("emoji-assets-filter").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { setFilter(b.dataset.f); });
    });
    if (typeof Pro !== "undefined") Pro.on(render);
    KApp.onTab("emoji-assets", function () { if (!items.length) buildIndex(); });
    buildIndex();
  }

  return {
    init: init,
    tara: buildIndex,
    chooseFolder: chooseFolder,
    saveFolder: saveFolder,
    setFilter: setFilter,
    sayisi: function () { return items.length; },
    adlar: function () { return items.map(function (x) { return x.name; }); }
  };
})();
