/*
 * Suflo — Pro SFX kutuphanesi
 *
 * Yerel SFX klasorlerini derinlemesine tarar; arama, favori, son kullanilan,
 * on dinleme ve playhead'e yerlestirme saglar. Panel ses dosyalarini kendi
 * paketine kopyalamaz: kullanicinin sectigi klasorden okur.
 */
window.KSfx = (function () {
  "use strict";

  var index = [];          // { name, path, folder, collection, hay }
  var filtered = [];
  var cursor = -1;
  var filterMode = "all"; // all | fav | recent
  var folderMode = "all";
  var audio = new Audio();
  var playingPath = null;
  var durCache = {};
  var previewTimer = null;
  var busyPath = null;
  var smartMode = false;
  var smartCues = [];

  // Dosya adlarinda hem Turkce hem yaygin Ingilizce paket adlari aranir.
  // Kurallar yerelde calisir; transkript veya dosya adlari hicbir yere gitmez.
  var SMART_RULES = [
    { id: "alert", label: "Dikkat", priority: 10,
      match: /\b(dikkat|uyari|sakın|sakin|onemli|önemli|warning|careful|attention)\b/i,
      terms: ["alert", "warning", "alarm", "impact", "hit", "uyari", "dikkat"] },
    { id: "success", label: "Sonuç", priority: 9,
      match: /\b(sonuc|sonuç|tamam|bitti|basardik|başardık|kazandik|kazandık|success|done|final|result)\b/i,
      terms: ["success", "win", "complete", "positive", "ding", "sonuc", "final"] },
    { id: "transition", label: "Geçiş", priority: 8,
      match: /\b(ama|fakat|ancak|oysa|simdi|şimdi|sonra|but|however|now|next|then)\b/i,
      terms: ["whoosh", "swoosh", "swish", "transition", "wipe", "gecis", "geçiş"] },
    { id: "reveal", label: "Göster", priority: 7,
      match: /\b(bak|iste|işte|gor|gör|goster|göster|look|watch|here|show|reveal)\b/i,
      terms: ["pop", "reveal", "click", "bubble", "pluck", "goster", "göster"] },
    { id: "number", label: "Madde", priority: 6,
      match: /\b(birinci|ikinci|ucuncu|üçüncü|1\.?|2\.?|3\.?|first|second|third)\b/i,
      terms: ["tick", "click", "tap", "beep", "ui", "pop"] },
    { id: "question", label: "Soru", priority: 5,
      match: /\?\s*$/,
      terms: ["question", "curious", "notification", "pluck", "pop", "hmm"] },
    { id: "emphasis", label: "Vurgu", priority: 4,
      match: /!\s*$/,
      terms: ["impact", "hit", "boom", "punch", "pop", "accent"] }
  ];

  var PLAY_SVG = '<svg viewBox="0 0 12 12"><path d="M2.5 1.5 L10.5 6 L2.5 10.5 Z" fill="currentColor"/></svg>';
  var STOP_SVG = '<svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor"/></svg>';

  function el(id) { return document.getElementById(id); }
  function basename(p) { return String(p || "").replace(/^.*[\\\/]/, ""); }
  function stripExt(n) { return n.replace(/\.[^.]+$/, ""); }
  function norm(p) { return String(p || "").replace(/\\/g, "/").toLowerCase(); }
  function cleanFolder(n) {
    n = String(n || "").replace(/^SUFLO\s*-\s*/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return n || "Suflo SFX";
  }
  function folderInfo(root, file) {
    var rel = file.slice(root.length).replace(/^[\\\/]+/, "");
    var parts = rel.split(/[\\\/]/);
    parts.pop();
    if (!parts.length) return { folder: "Suflo SFX", collection: cleanFolder(basename(root)) };
    var collection = cleanFolder(parts[0]);
    // Vault paket adini kategori olarak gostermek yerine bir alt klasordeki
    // gercek SFX turunu kullan: WHOOSH, CLICKS, CAMERA, RISERS gibi.
    var folder = parts.length > 1 && (/^SUFLO\b/i.test(parts[0]) || /\b(?:collection|library)\b/i.test(parts[0]))
      ? cleanFolder(parts[1])
      : cleanFolder(parts[0]);
    return { folder: folder, collection: collection };
  }
  function fold(s) {
    return String(s || "").toLowerCase()
      .replace(/[ç]/g, "c").replace(/[ğ]/g, "g").replace(/[ıİi]/g, "i")
      .replace(/[ö]/g, "o").replace(/[ş]/g, "s").replace(/[ü]/g, "u")
      .replace(/[áàâä]/g, "a").replace(/[éèêë]/g, "e");
  }

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

  function builtinSfxDir() {
    if (!K.nodeOK || !K.path || !K.extensionPath) return "";
    var root = K.extensionPath();
    return root ? K.path.join(root, "content", "sfx") : "";
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
    var out = [];
    var builtin = builtinSfxDir();
    if (builtin && K.fs.existsSync(builtin)) out.push(builtin);
    out.push(sfxDir());
    var ek = String(K.settings().sfxEkKlasor || "").trim();
    if (ek && K.fs.existsSync(ek) && !out.some(function (p) { return norm(p) === norm(ek); })) out.push(ek);
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
        var info = folderInfo(root, f);
        var name = stripExt(basename(f));
        var isBuiltin = norm(root) === norm(builtinSfxDir());
        index.push({ name: name, path: f, folder: info.folder,
          collection: isBuiltin ? "SUFLO ORIGINALS" : info.collection, builtin: isBuiltin,
          hay: (name + " " + rel).toLowerCase(), smartHay: fold(name + " " + rel) });
      });
    });
    index.sort(function (a, b) { return a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name); });
    var empty = el("sfx-empty"), list = el("sfx-list");
    if (empty) empty.hidden = index.length > 0;
    if (list) list.hidden = index.length === 0;
    var total = el("sfx-sayac"); if (total) total.textContent = String(index.length);
    search(el("sfx-search") ? el("sfx-search").value : "");
  }

  /* ---------------- Arama + filtre ---------------- */

  function folderCounts() {
    var counts = {};
    index.forEach(function (item) { counts[item.folder] = (counts[item.folder] || 0) + 1; });
    return counts;
  }

  function renderFolderBrowser() {
    var browser = el("sfx-folder-browser");
    if (!browser) return;
    browser.innerHTML = "";
    var counts = folderCounts();
    Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (folder) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "sfx-folder-card";
      card.innerHTML = '<span class="sfx-folder-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 9h17"/></svg></span><span class="sfx-folder-meta"><b></b><i></i></span><span class="sfx-folder-arrow">›</span>';
      card.querySelector("b").textContent = folder;
      card.querySelector("i").textContent = counts[folder] + " ses efekti";
      card.onclick = function () {
        folderMode = folder;
        search(el("sfx-search").value);
      };
      browser.appendChild(card);
    });
  }

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
    if (folderMode !== "all") pool = pool.filter(function (i) { return i.folder === folderMode; });

    var terms = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) filtered = pool.slice(0, 600);
    else {
      var scored = [];
      pool.forEach(function (i) {
        var sc = score(i, terms);
        if (sc >= 0) scored.push({ item: i, score: sc });
      });
      scored.sort(function (a, b) { return b.score - a.score || a.item.name.localeCompare(b.item.name); });
      filtered = scored.slice(0, 600).map(function (x) { return x.item; });
    }
    filtered.sort(function (a, b) { return a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name); });
    cursor = -1;
    var count = el("sfx-count");
    if (count) count.textContent = filtered.length ? filtered.length + (filtered.length === 600 ? "+" : "") + " ses" : "";
    renderList();
  }

  /* ---------------- Akilli SFX ---------------- */

  function ruleFor(text) {
    var t = fold(text);
    for (var i = 0; i < SMART_RULES.length; i++) {
      if (SMART_RULES[i].match.test(t)) return SMART_RULES[i];
    }
    return null;
  }

  function bestForRule(rule, used) {
    var best = null, bestScore = 0;
    var fav = favlar(), recent = sonlar();
    index.forEach(function (item) {
      var h = item.smartHay || fold(item.hay);
      var sc = 0;
      rule.terms.forEach(function (term, ti) {
        var f = fold(term);
        if (h.indexOf(f) !== -1) sc += Math.max(2, 9 - ti);
      });
      if (fav.indexOf(item.path) !== -1) sc += 3;
      var ri = recent.indexOf(item.path); if (ri !== -1) sc += Math.max(0, 2 - ri / 10);
      if (used && used[norm(item.path)]) sc -= 2;
      if (sc > bestScore) { bestScore = sc; best = item; }
    });
    return best;
  }

  function smartSuggestions(segments) {
    var cues = [], used = {};
    (segments || []).forEach(function (seg) {
      var text = String(seg && seg.text || "").trim();
      if (!text) return;
      var rule = ruleFor(text);
      if (!rule) return;
      var time = Math.max(0, Number(seg.start) || 0);
      var item = bestForRule(rule, used);
      var cue = { time: time, end: Number(seg.end) || time, text: text, rule: rule, item: item };
      var last = cues.length ? cues[cues.length - 1] : null;
      if (last && time - last.time < 0.8) {
        if (rule.priority > last.rule.priority) cues[cues.length - 1] = cue;
        return;
      }
      cues.push(cue);
      if (item) used[norm(item.path)] = 1;
    });
    return cues.slice(0, 16);
  }

  function timeText(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function smartRender() {
    var box = el("sfx-smart-list"), status = el("sfx-smart-status");
    if (!box) return;
    box.innerHTML = "";
    var ready = smartCues.filter(function (c) { return !!c.item; }).length;
    if (status) status.textContent = smartCues.length
      ? smartCues.length + " vurgu · " + ready + " eşleşen ses"
      : "Bu altyazıda belirgin bir vurgu noktası bulunamadı.";
    if (!smartCues.length) {
      box.innerHTML = '<div class="sfx-smart-empty">“Ama”, “şimdi”, “dikkat”, “sonuç” gibi anlatım dönüşleri ve !/? işaretleri öneri üretir.</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    smartCues.forEach(function (cue) {
      var row = document.createElement("div");
      row.className = "sfx-smart-row" + (cue.item && busyPath === cue.item.path ? " busy" : "");

      var at = document.createElement("button");
      at.className = "sfx-smart-time";
      at.textContent = timeText(cue.time);
      at.title = "Bu ana git";
      at.onclick = function () { K.call("KS_setPlayerPosition", { sec: cue.time }, 15000); };

      var body = document.createElement("div");
      body.className = "sfx-smart-body";
      var title = document.createElement("b");
      title.textContent = cue.rule.label + (cue.item ? " · " + cue.item.name : "");
      var quote = document.createElement("small");
      quote.textContent = "“" + cue.text.slice(0, 88) + (cue.text.length > 88 ? "…" : "") + "”";
      body.appendChild(title); body.appendChild(quote);

      if (cue.item) {
        var play = document.createElement("button");
        play.className = "sfx-smart-preview" + (playingPath === cue.item.path ? " playing" : "");
        play.innerHTML = playingPath === cue.item.path ? STOP_SVG : PLAY_SVG;
        play.title = "Ön dinle";
        play.onclick = function () { preview(cue.item); };
        var add = document.createElement("button");
        add.className = "sfx-add";
        add.textContent = busyPath === cue.item.path ? "Ekleniyor…" : "Bu ana ekle";
        add.onclick = function () { insert(cue.item, cue.time, cue.rule.label); };
        row.appendChild(at); row.appendChild(play); row.appendChild(body); row.appendChild(add);
      } else {
        var find = document.createElement("button");
        find.className = "sfx-add"; find.textContent = "Benzerini ara";
        find.onclick = function () {
          closeSmart();
          var input = el("sfx-search"); input.value = cue.rule.terms[0]; input.focus(); search(input.value);
        };
        row.appendChild(at); row.appendChild(body); row.appendChild(find);
      }
      frag.appendChild(row);
    });
    box.appendChild(frag);
  }

  function showSmart() {
    if (!proGate()) return;
    var segs = window.KCaptions && KCaptions.getSegments ? KCaptions.getSegments() : [];
    if (!segs.length) {
      KApp.toast("Önce Altyazı sekmesinde bir transkript oluştur", "bad");
      return;
    }
    smartCues = smartSuggestions(segs);
    smartMode = true;
    el("sfx-smart-panel").hidden = false;
    el("sfx-list").hidden = true;
    el("sfx-empty").hidden = true;
    if (el("sfx-folder-browser")) el("sfx-folder-browser").hidden = true;
    if (el("sfx-folder-nav")) el("sfx-folder-nav").hidden = true;
    el("sfx-smart-btn").classList.add("on");
    smartRender();
  }

  function closeSmart() {
    smartMode = false;
    var panel = el("sfx-smart-panel"); if (panel) panel.hidden = true;
    var btn = el("sfx-smart-btn"); if (btn) btn.classList.remove("on");
    var list = el("sfx-list"), empty = el("sfx-empty");
    if (list) list.hidden = index.length === 0;
    if (empty) empty.hidden = index.length > 0;
    renderList();
  }

  /* ---------------- Liste ---------------- */

  function renderList() {
    var box = el("sfx-list");
    if (!box) return;
    box.innerHTML = "";
    var query = el("sfx-search") ? String(el("sfx-search").value || "").trim() : "";
    var folderView = filterMode === "all" && folderMode === "all" && !query;
    var browser = el("sfx-folder-browser");
    var nav = el("sfx-folder-nav");
    if (browser) browser.hidden = !folderView;
    if (nav) nav.hidden = folderMode === "all";
    box.hidden = folderView || !index.length;
    if (folderMode !== "all") {
      var title = el("sfx-folder-title"), folderCount = el("sfx-folder-count");
      if (title) title.textContent = folderMode;
      if (folderCount) folderCount.textContent = filtered.length + " ses";
    }
    if (!index.length) return;
    if (folderView) {
      renderFolderBrowser();
      var count0 = el("sfx-count");
      if (count0) count0.textContent = Object.keys(folderCounts()).length + " klasör";
      return;
    }
    if (!filtered.length) {
      box.innerHTML = '<div class="empty">Eşleşen ses yok.</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    var groupCounts = {};
    filtered.forEach(function (item) { groupCounts[item.folder] = (groupCounts[item.folder] || 0) + 1; });
    var lastFolder = null;
    filtered.forEach(function (item, i) {
      if (folderMode === "all" && item.folder !== lastFolder) {
        lastFolder = item.folder;
        var group = document.createElement("div");
        group.className = "sfx-group";
        group.innerHTML = '<span class="sfx-group-icon">▰</span><b></b><span></span>';
        group.querySelector("b").textContent = item.folder;
        group.querySelector("span:last-child").textContent = groupCounts[item.folder] + " ses";
        frag.appendChild(group);
      }
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
      sub.textContent = (item.collection !== item.folder ? item.collection : "Suflo SFX") +
        (durCache[item.path] ? " · " + durCache[item.path] : "");
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

  function redraw() {
    renderList();
    if (smartMode) smartRender();
  }

  function preview(item) {
    if (!proGate()) return;
    if (playingPath === item.path) {
      audio.pause();
      playingPath = null;
      redraw();
      return;
    }
    audio.pause();
    audio.src = fileUrl(item.path);
    audio.currentTime = 0;
    audio.onloadedmetadata = function () {
      if (audio.duration && isFinite(audio.duration)) {
        var d = audio.duration;
        durCache[item.path] = Math.floor(d / 60) + ":" + ("0" + Math.floor(d % 60)).slice(-2);
        redraw();
      }
    };
    audio.play().catch(function () { KApp.toast("Önizleme açılamadı: " + item.name, "bad"); });
    playingPath = item.path;
    redraw();
    audio.onended = function () { playingPath = null; redraw(); };
  }

  /* ---------------- Aksiyonlar ---------------- */

  function toggleFav(item) {
    if (!proGate()) return;
    var fav = favlar();
    var i = fav.indexOf(item.path);
    if (i === -1) fav.push(item.path); else fav.splice(i, 1);
    K.saveSettings();
    if (filterMode === "fav") search(el("sfx-search").value); else redraw();
  }

  async function insert(item, atSeconds, cueLabel) {
    if (busyPath || !proGate()) return;
    busyPath = item.path;
    redraw();
    try {
      var payload = { path: item.path, name: item.name };
      if (atSeconds !== undefined && isFinite(Number(atSeconds))) payload.time = Math.max(0, Number(atSeconds));
      var r = await K.call("KS_insertSfx", payload, 60000);
      if (!r.ok) throw new Error(r.error || "Ses eklenemedi");
      KApp.toast(item.name + " → " + r.trackName + ", " +
        (payload.time !== undefined ? timeText(payload.time) + (cueLabel ? " · " + cueLabel : "") : "playhead"), "good");
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
      redraw();
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
        if (smartMode) closeSmart();
        redraw();
      }
    });
  }

  function setFilter(mode) {
    if (smartMode) closeSmart();
    filterMode = mode === "fav" || mode === "recent" ? mode : "all";
    folderMode = "all";
    Array.prototype.forEach.call(el("sfx-filter").querySelectorAll("button"), function (b) {
      b.classList.toggle("on", b.dataset.f === filterMode);
    });
    search(el("sfx-search").value);
  }

  /* ---------------- Baslat ---------------- */

  function init() {
    if (!el("tab-sfx")) return;
    el("sfx-search").addEventListener("input", function () { if (smartMode) closeSmart(); search(this.value); });
    el("sfx-add-folder").addEventListener("click", chooseFolder);
    el("sfx-add-folder-big").addEventListener("click", chooseFolder);
    el("sfx-yenile").addEventListener("click", buildIndex);
    el("sfx-smart-btn").addEventListener("click", function () { if (smartMode) closeSmart(); else showSmart(); });
    el("sfx-smart-close").addEventListener("click", closeSmart);
    el("sfx-folder-back").addEventListener("click", function () {
      folderMode = "all";
      search(el("sfx-search").value);
    });
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
    sayisi: function () { return index.length; },
    klasorSayisi: function () {
      var seen = {};
      index.forEach(function (item) { seen[item.folder] = true; });
      return Object.keys(seen).length;
    },
    oneriler: smartSuggestions
  };
})();
