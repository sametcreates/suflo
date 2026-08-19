/*
 * Suflo — Pro SFX kutuphanesi
 *
 * Yerel SFX klasorlerini derinlemesine tarar; arama, favori, son kullanilan,
 * on dinleme ve playhead'e yerlestirme saglar. Panel ses dosyalarini kendi
 * paketine kopyalamaz: kullanicinin sectigi klasorden okur.
 */
window.KSfx = (function () {
  "use strict";

  var index = [];          // { name, path, folder, hay }
  var filtered = [];
  var cursor = -1;
  var filterMode = "all"; // all | fav | recent
  var audio = new Audio();
  var playingPath = null;
  var durCache = {};
  var previewTimer = null;
  var busyPath = null;

  var PLAY_SVG = '<svg viewBox="0 0 12 12"><path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor"/></svg>';
  var STOP_SVG = '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>';

  function el(id) { return document.getElementById(id); }
  function basename(p) { return String(p || "").replace(/^.*[\\\/]/, ""); }
  function stripExt(n) { return n.replace(/\.[^.]+$/, ""); }
  function norm(p) { return String(p || "").replace(/\\/g, "/").toLowerCase(); }

  function fileUrl(p) {
    return encodeURI("file:///" + p.replace(/\\/g, "/"))
      .replace(/#/g, "%23").replace(/\?/g, "%3F");
  }

  function kokDir() {
    if (!K.nodeOK || !K.path || !K.os) return "";
    var sp = K.settingsPath ? K.settingsPath() : null;
    return sp ? K.path.dirname(sp) : K.path.join(K.os.homedir(), "Suflo");
  }

  function sfxDir() {
    if (!K.nodeOK || !K.fs || !K.path) return "";
    var d = K.path.join(kokDir(), "sfx");
    try { if (!K.fs.existsSync(d)) K.fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }

  function proGate() {
    return typeof Pro === "undefined" || Pro.gate("sfx");
  }

  function favlar() {
    var s = K.settings();
    if (!s.sfxFavs) s.sfxFavs = [];
    return s.sfxFavs;
  }

  function sonlar() {
    var s = K.settings();
    if (!s.sfxRecent) s.sfxRecent = [];
    return s.sfxRecent;
  }

  /* ---------------- Indeks ---------------- */

  function kaynaklar() {
    if (!K.nodeOK || !K.fs || !K.path) return [];
    var out = [sfxDir()];
    var ek = String(K.settings().sfxEkKlasor || "").trim();
    if (ek && K.fs.existsSync(ek) && norm(ek) !== norm(out[0])) out.push(ek);
    return out;
  }

  function buildIndex() {
    index = [];
    if (!K.nodeOK || !K.fs || !K.path) {
      var empty0 = el("sfx-empty"), list0 = el("sfx-list"), total0 = el("sfx-sayac");
      if (empty0) empty0.hidden = false;
      if (list0) list0.hidden = true;
      if (total0) total0.textContent = "0";
      search("");
      return;
    }
    var seen = {};
    kaynaklar().forEach(function (root) {
      K.walkAudio(root, 12000, 12).forEach(function (f) {
        var key = norm(f);
        if (seen[key]) return;
        seen[key] = true;
        var rel = f.slice(root.length).replace(/^[\\\/]+/, "");
        var parts = rel.split(/[\\\/]/);
        var folder = parts.length > 1 ? parts[0] : basename(root);
        var name = stripExt(basename(f));
        index.push({ name: name, path: f, folder: folder, hay: (name + " " + rel).toLowerCase() });
      });
    });
    index.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var empty = el("sfx-empty"), list = el("sfx-list");
    if (empty) empty.hidden = index.length > 0;
    if (list) list.hidden = index.length === 0;
    var total = el("sfx-sayac"); if (total) total.textContent = String(index.length);
    search(el("sfx-search") ? el("sfx-search").value : "");
  }

  /* ---------------- Arama + filtre ---------------- */

  function score(item, terms) {
    var s = 0;
    var lname = item.name.toLowerCase();
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (lname.indexOf(t) === 0) s += 5;
      else if (lname.indexOf(t) !== -1) s += 3;
      else if (item.hay.indexOf(t) !== -1) s += 1;
      else return -1;
    }
    return s;
  }

  function search(q) {
    var pool = index;
    if (filterMode === "fav") {
      pool = index.filter(function (i) { return favlar().indexOf(i.path) !== -1; });
    } else if (filterMode === "recent") {
      var map = {};
      index.forEach(function (i) { map[norm(i.path)] = i; });
      pool = sonlar().map(function (p) { return map[norm(p)]; }).filter(Boolean);
    }

    var terms = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) filtered = pool.slice(0, 400);
    else {
      var scored = [];
      pool.forEach(function (i) {
        var sc = score(i, terms);
        if (sc >= 0) scored.push({ item: i, score: sc });
      });
      scored.sort(function (a, b) { return b.score - a.score || a.item.name.localeCompare(b.item.name); });
      filtered = scored.slice(0, 400).map(function (x) { return x.item; });
    }
    cursor = -1;
    var count = el("sfx-count");
    if (count) count.textContent = filtered.length ? filtered.length + (filtered.length === 400 ? "+" : "") + " ses" : "";
    renderList();
  }

  /* ---------------- Liste ---------------- */

  function renderList() {
    var box = el("sfx-list");
    if (!box) return;
    box.innerHTML = "";
    if (!index.length) return;
    if (!filtered.length) {
      box.innerHTML = '<div class="empty">Eşleşen ses yok.</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    filtered.forEach(function (item, i) {
      var row = document.createElement("div");
      row.className = "sfx-row" + (i === cursor ? " cur" : "") + (busyPath === item.path ? " busy" : "");
      row.draggable = true;
      row.dataset.i = i;

      var play = document.createElement("button");
      play.className = "sfx-play" + (playingPath === item.path ? " playing" : "");
      play.innerHTML = playingPath === item.path ? STOP_SVG : PLAY_SVG;
      play.title = playingPath === item.path ? "Durdur" : "Ön dinle";
      play.onclick = function (e) { e.stopPropagation(); preview(item); };

      var meta = document.createElement("div");
      meta.className = "sfx-meta";
      var nm = document.createElement("div");
      nm.className = "sfx-name";
      nm.textContent = item.name;
      var sub = document.createElement("div");
      sub.className = "sfx-sub";
      sub.textContent = item.folder + (durCache[item.path] ? " · " + durCache[item.path] : "");
      meta.appendChild(nm);
      meta.appendChild(sub);

      var star = document.createElement("button");
      var faved = favlar().indexOf(item.path) !== -1;
      star.className = "sfx-star" + (faved ? " faved" : "");
      star.textContent = faved ? "★" : "☆";
      star.title = "Favori";
      star.onclick = function (e) { e.stopPropagation(); toggleFav(item); };

      var add = document.createElement("button");
      add.className = "sfx-add";
      add.textContent = busyPath === item.path ? "Ekleniyor…" : "Ekle";
      add.onclick = function (e) { e.stopPropagation(); insert(item); };

      row.ondblclick = function () { preview(item); };
      row.onclick = function () { cursor = i; refreshCursor(); };
      row.ondragstart = function (ev) {
        ev.dataTransfer.setData("text/uri-list", fileUrl(item.path));
        ev.dataTransfer.setData("text/plain", item.path);
      };

      row.appendChild(play);
      row.appendChild(meta);
      row.appendChild(star);
      row.appendChild(add);
      frag.appendChild(row);
    });
    box.appendChild(frag);
  }

  function refreshCursor() {
    var rows = el("sfx-list").querySelectorAll(".sfx-row");
    Array.prototype.forEach.call(rows, function (r) {
      r.classList.toggle("cur", Number(r.dataset.i) === cursor);
    });
    var cur = el("sfx-list").querySelector(".sfx-row.cur");
    if (cur) cur.scrollIntoView({ block: "nearest" });
  }

  /* ---------------- On dinleme ---------------- */

  function preview(item) {
    if (!proGate()) return;
    if (playingPath === item.path) {
      audio.pause();
      playingPath = null;
      renderList();
      return;
    }
    audio.pause();
    audio.src = fileUrl(item.path);
    audio.currentTime = 0;
    audio.onloadedmetadata = function () {
      if (audio.duration && isFinite(audio.duration)) {
        var d = audio.duration;
        durCache[item.path] = Math.floor(d / 60) + ":" + ("0" + Math.floor(d % 60)).slice(-2);
        renderList();
      }
    };
    audio.play().catch(function () { KApp.toast("Önizleme açılamadı: " + item.name, "bad"); });
    playingPath = item.path;
    renderList();
    audio.onended = function () { playingPath = null; renderList(); };
  }

  /* ---------------- Aksiyonlar ---------------- */

  function toggleFav(item) {
    if (!proGate()) return;
    var fav = favlar();
    var i = fav.indexOf(item.path);
    if (i === -1) fav.push(item.path); else fav.splice(i, 1);
    K.saveSettings();
    if (filterMode === "fav") search(el("sfx-search").value); else renderList();
  }

  async function insert(item) {
    if (busyPath || !proGate()) return;
    busyPath = item.path;
    renderList();
    try {
      var r = await K.call("KS_insertSfx", { path: item.path, name: item.name }, 60000);
      if (!r.ok) throw new Error(r.error || "Ses eklenemedi");
      KApp.toast(item.name + " → " + r.trackName + ", playhead", "good");
      var rec = sonlar();
      var i = rec.indexOf(item.path);
      if (i !== -1) rec.splice(i, 1);
      rec.unshift(item.path);
      K.settings().sfxRecent = rec.slice(0, 40);
      K.saveSettings();
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      busyPath = null;
      renderList();
    }
  }

  function saveFolder(folder) {
    if (!folder) return;
    K.settings().sfxEkKlasor = folder;
    K.saveSettings();
    var input = el("set-sfx-klasor"); if (input) input.value = folder;
    buildIndex();
    KApp.toast("SFX klasörü bağlandı: " + basename(folder), "good");
  }

  function chooseFolder() {
    if (!proGate()) return;
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var res = window.cep.fs.showOpenDialogEx(false, true, "SFX klasörü seç", null, null);
      if (res && res.data && res.data.length) saveFolder(res.data[0]);
      return;
    }
    KApp.toast("Klasör yolunu Ayarlar → İçerik kütüphaneleri alanına yapıştır", "bad");
  }

  /* ---------------- Klavye ---------------- */

  function initKeys() {
    el("sfx-search").addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!filtered.length) return;
        cursor = e.key === "ArrowDown" ? Math.min(cursor + 1, filtered.length - 1) : Math.max(cursor - 1, 0);
        refreshCursor();
        clearTimeout(previewTimer);
        previewTimer = setTimeout(function () { if (filtered[cursor]) preview(filtered[cursor]); }, 260);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[cursor]) insert(filtered[cursor]); else if (filtered[0]) insert(filtered[0]);
      } else if (e.key === "Escape") {
        audio.pause();
        playingPath = null;
        renderList();
      }
    });
  }

  function setFilter(mode) {
    filterMode = mode === "fav" || mode === "recent" ? mode : "all";
    Array.prototype.forEach.call(el("sfx-filter").querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.dataset.f === filterMode);
    });
    search(el("sfx-search").value);
  }

  /* ---------------- Baslat ---------------- */

  function init() {
    if (!el("tab-sfx")) return;
    el("sfx-search").addEventListener("input", function () { search(this.value); });
    el("sfx-add-folder").addEventListener("click", chooseFolder);
    el("sfx-add-folder-big").addEventListener("click", chooseFolder);
    el("sfx-yenile").addEventListener("click", buildIndex);
    Array.prototype.forEach.call(el("sfx-filter").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () { setFilter(b.dataset.f); });
    });
    initKeys();
    KApp.onTab("sfx", function () { if (!index.length) buildIndex(); });
    if (typeof Pro !== "undefined") Pro.on(renderList);
    buildIndex();
  }

  return {
    init: init,
    tara: buildIndex,
    chooseFolder: chooseFolder,
    setFilter: setFilter,
    sayisi: function () { return index.length; }
  };
})();
