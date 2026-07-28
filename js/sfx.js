/*
 * Kesit — SFX modülü
 * Yerel klasörleri indeksler; arama, klavye gezinme (↓↑ + Enter), favoriler,
 * son kullanılanlar, önizleme ve playhead'e yerleştirme.
 */
window.KSfx = (function () {
  "use strict";

  var index = [];        // { name, path, folder, hay }
  var filtered = [];
  var cursor = -1;       // klavye imleci (filtered index)
  var filterMode = "all";
  var audio = new Audio();
  var playingPath = null;
  var durCache = {};     // path -> "0:03"
  var previewTimer = null;

  var PLAY_SVG = '<svg viewBox="0 0 12 12"><path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor"/></svg>';
  var STOP_SVG = '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>';

  function el(id) { return document.getElementById(id); }
  function basename(p) { return p.replace(/^.*[\\\/]/, ""); }
  function stripExt(n) { return n.replace(/\.[^.]+$/, ""); }

  function fileUrl(p) {
    return encodeURI("file:///" + p.replace(/\\/g, "/"))
      .replace(/#/g, "%23").replace(/\?/g, "%3F");
  }

  /* ---------------- İndeks ---------------- */

  function buildIndex() {
    index = [];
    var s = K.settings();
    s.folders.forEach(function (folder) {
      K.walkAudio(folder).forEach(function (f) {
        index.push({
          name: stripExt(basename(f)),
          path: f,
          folder: basename(folder),
          hay: f.toLowerCase()
        });
      });
    });
    el("sfx-empty").hidden = index.length > 0;
    el("sfx-list").hidden = index.length === 0;
    search(el("sfx-search").value);
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
    var st = K.settings();
    var pool = index;
    if (filterMode === "fav") {
      pool = index.filter(function (i) { return (st.favs || []).indexOf(i.path) !== -1; });
    } else if (filterMode === "recent") {
      var rec = st.recent || [];
      pool = [];
      rec.forEach(function (p) {
        for (var i = 0; i < index.length; i++) {
          if (index[i].path === p) { pool.push(index[i]); break; }
        }
      });
    }

    var terms = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      filtered = pool.slice(0, 300);
    } else {
      var scored = [];
      for (var i = 0; i < pool.length; i++) {
        var sc = score(pool[i], terms);
        if (sc >= 0) scored.push({ it: pool[i], sc: sc });
      }
      scored.sort(function (a, b) { return b.sc - a.sc; });
      filtered = scored.slice(0, 300).map(function (x) { return x.it; });
    }
    cursor = -1;
    el("sfx-count").textContent = filtered.length
      ? filtered.length + (filtered.length === 300 ? "+" : "") + " ses"
      : "";
    renderList();
  }

  /* ---------------- Liste ---------------- */

  function renderList() {
    var box = el("sfx-list");
    box.innerHTML = "";
    if (index.length === 0) return;
    if (filtered.length === 0) {
      box.innerHTML = '<div class="empty">Eşleşen ses yok.</div>';
      return;
    }
    var st = K.settings();
    var frag = document.createDocumentFragment();
    filtered.forEach(function (item, i) {
      var row = document.createElement("div");
      row.className = "sfx-row" + (i === cursor ? " cur" : "");
      row.draggable = true;
      row.dataset.i = i;

      var play = document.createElement("button");
      play.className = "sfx-play" + (playingPath === item.path ? " playing" : "");
      play.innerHTML = playingPath === item.path ? STOP_SVG : PLAY_SVG;
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
      var faved = (st.favs || []).indexOf(item.path) !== -1;
      star.className = "sfx-star" + (faved ? " faved" : "");
      star.textContent = faved ? "★" : "☆";
      star.title = "Favori";
      star.onclick = function (e) { e.stopPropagation(); toggleFav(item); };

      var add = document.createElement("button");
      add.className = "sfx-add";
      add.textContent = "Ekle";
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

  /* ---------------- Önizleme ---------------- */

  function preview(item) {
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
      }
    };
    audio.play().catch(function () { KApp.toast("Önizleme açılamadı: " + item.name, "bad"); });
    playingPath = item.path;
    renderList();
    audio.onended = function () { playingPath = null; renderList(); };
  }

  /* ---------------- Aksiyonlar ---------------- */

  function toggleFav(item) {
    var s = K.settings();
    s.favs = s.favs || [];
    var i = s.favs.indexOf(item.path);
    if (i === -1) s.favs.push(item.path);
    else s.favs.splice(i, 1);
    K.saveSettings();
    if (filterMode === "fav") search(el("sfx-search").value);
    else renderList();
  }

  async function insert(item) {
    var r = await K.call("KS_insertSfx", { path: item.path });
    if (r.ok) {
      KApp.toast(item.name + " → A" + r.track, "good");
      var s = K.settings();
      s.recent = s.recent || [];
      var i = s.recent.indexOf(item.path);
      if (i !== -1) s.recent.splice(i, 1);
      s.recent.unshift(item.path);
      s.recent = s.recent.slice(0, 30);
      K.saveSettings();
    } else {
      KApp.toast(r.error, "bad");
    }
  }

  function addFolder(done) {
    // CEP'in yerel klasör diyaloğu varsa onu kullan
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var res = window.cep.fs.showOpenDialogEx(false, true, "Ses klasörü seç", null, null);
      if (res && res.data && res.data.length) {
        saveFolder(res.data[0]);
        if (done) done();
      }
      return;
    }
    // tarayıcı önizlemesi / eski CEP: input fallback
    var input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.onchange = function () {
      if (!input.files.length) return;
      var first = input.files[0];
      var full = first.path || "";
      if (!full) { KApp.toast("Klasör yolu okunamadı", "bad"); return; }
      var rel = first.webkitRelativePath || first.name;
      var root = full.slice(0, full.length - rel.length).replace(/[\\\/]$/, "");
      var topName = rel.split("/")[0];
      saveFolder(root && topName ? root + "\\" + topName : root);
      if (done) done();
    };
    input.click();
  }

  function saveFolder(folder) {
    var s = K.settings();
    if (s.folders.indexOf(folder) !== -1) { KApp.toast("Bu klasör zaten bağlı"); return; }
    s.folders.push(folder);
    K.saveSettings();
    buildIndex();
    KApp.refreshFolders();
    KApp.toast("Bağlandı: " + basename(folder) + " (" +
      index.filter(function (i) { return i.folder === basename(folder); }).length + " ses)", "good");
  }

  /* ---------------- Klavye ---------------- */

  function initKeys() {
    el("sfx-search").addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (filtered.length === 0) return;
        cursor = e.key === "ArrowDown"
          ? Math.min(cursor + 1, filtered.length - 1)
          : Math.max(cursor - 1, 0);
        refreshCursor();
        // gezinirken kısa gecikmeyle otomatik önizle
        clearTimeout(previewTimer);
        previewTimer = setTimeout(function () {
          if (filtered[cursor]) preview(filtered[cursor]);
        }, 260);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[cursor]) insert(filtered[cursor]);
        else if (filtered[0]) insert(filtered[0]);
      } else if (e.key === "Escape") {
        audio.pause();
        playingPath = null;
        renderList();
      }
    });
  }

  /* ---------------- Başlat ---------------- */

  function init() {
    el("sfx-search").addEventListener("input", function (e) { search(e.target.value); });
    el("sfx-add-folder").addEventListener("click", function () { addFolder(); });
    el("sfx-add-folder-big").addEventListener("click", function () { addFolder(); });

    Array.prototype.forEach.call(el("sfx-filter").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("sfx-filter").querySelectorAll("button"), function (x) {
          x.classList.remove("on");
        });
        b.classList.add("on");
        filterMode = b.dataset.f;
        search(el("sfx-search").value);
      });
    });

    initKeys();
    buildIndex();
  }

  return { init: init, refresh: buildIndex, addFolder: addFolder };
})();
