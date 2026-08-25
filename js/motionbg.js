/*
 * Suflo — Pro Motion BG kutuphanesi
 *
 * Hazir hareketli zeminler / overlay videolari (mp4/mov). Suflo Pro Paketinin
 * "motionbg" alt klasorunu (lisansliya icerik bulutundan otomatik iner) ve
 * istege bagli kullanicinin kendi klasorunu tarar; kartta kucuk bir video
 * onizlemesi gosterir, "Ekle" playhead'de bos bir ust video katmanina koyar
 * (host: KS_placeMotionBG). Panel dosyalari tasimaz — oldugu yerden okur.
 */
window.KMotionBG = (function () {
  "use strict";

  var index = [];        // { name, path, folder, hay }
  var filtered = [];
  var busyPath = null;
  var VIDEO = /\.(mp4|mov|m4v|webm)$/i;

  function el(id) { return document.getElementById(id); }
  function basename(p) { return String(p || "").replace(/^.*[\\\/]/, ""); }
  function stripExt(n) { return n.replace(/\.[^.]+$/, ""); }
  function norm(p) { return String(p || "").replace(/\\/g, "/").toLowerCase(); }
  function cleanName(n) {
    return String(n || "").replace(/^SUFLO\s*(?:BG|MOTION BG)?\s*-\s*/i, "")
      .replace(/\bKopie van\b/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || "Motion BG";
  }
  function fileUrl(p) {
    return encodeURI("file:///" + String(p).replace(/\\/g, "/")).replace(/#/g, "%23").replace(/\?/g, "%3F");
  }

  function kokDir() {
    if (!K.nodeOK || !K.path || !K.os) return "";
    var sp = K.settingsPath ? K.settingsPath() : null;
    return sp ? K.path.dirname(sp) : K.path.join(K.os.homedir(), "Suflo");
  }

  function proGate() { return typeof Pro === "undefined" || Pro.gate("motionbg"); }
  function isProUser() { return typeof Pro === "undefined" || (Pro.isPro && Pro.isPro()); }

  // Suflo Pro Paketi kokunde "motionbg" alt klasoru varsa onu tarar.
  function proPackMotionDir() {
    if (!K.nodeOK || !K.fs || !K.path) return "";
    var pack = String(K.settings().proPackKlasor || "").trim();
    if (!pack || !K.fs.existsSync(pack)) return "";
    var alt = K.path.join(pack, "motionbg");
    try { if (K.fs.existsSync(alt) && K.fs.statSync(alt).isDirectory()) return alt; } catch (e) {}
    return "";
  }

  function kaynaklar() {
    if (!K.nodeOK || !K.fs || !K.path) return [];
    var out = [];
    var pro = proPackMotionDir();
    if (pro) out.push(pro);
    var ek = String(K.settings().motionbgEkKlasor || "").trim();
    if (ek && K.fs.existsSync(ek) && !out.some(function (p) { return norm(p) === norm(ek); })) out.push(ek);
    return out;
  }

  function topla(dir, limit, derinlik) {
    var out = [];
    limit = limit || 2000;
    derinlik = derinlik === undefined ? 8 : derinlik;
    if (!dir || derinlik < 0 || !K.fs.existsSync(dir)) return out;
    try {
      K.fs.readdirSync(dir).forEach(function (f) {
        if (out.length >= limit || f.charAt(0) === ".") return;
        var tam = K.path.join(dir, f);
        try {
          if (VIDEO.test(f)) out.push(tam);
          else if (K.fs.statSync(tam).isDirectory()) out = out.concat(topla(tam, limit - out.length, derinlik - 1));
        } catch (e1) {}
      });
    } catch (e) {}
    return out;
  }

  /* ---------------- Indeks ---------------- */

  function buildIndex() {
    index = [];
    if (K.nodeOK && K.fs && K.path) {
      var seen = {};
      kaynaklar().forEach(function (root) {
        topla(root).forEach(function (f) {
          var key = norm(f);
          if (seen[key]) return;
          seen[key] = true;
          var name = cleanName(stripExt(basename(f)));
          index.push({ name: name, path: f, hay: name.toLowerCase() });
        });
      });
      index.sort(function (a, b) { return a.name.localeCompare(b.name); });
    }
    var sayac = el("motionbg-sayac");
    if (sayac) sayac.textContent = String(index.length);
    search(el("motionbg-search") ? el("motionbg-search").value : "");
  }

  function favlar() {
    var s = K.settings();
    if (!s.motionbgFavs) s.motionbgFavs = [];
    return s.motionbgFavs;
  }

  /* ---------------- Arama ---------------- */

  function search(q) {
    var terms = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) filtered = index.slice(0, 400);
    else filtered = index.filter(function (i) {
      for (var t = 0; t < terms.length; t++) if (i.hay.indexOf(terms[t]) === -1) return false;
      return true;
    }).slice(0, 400);
    var count = el("motionbg-count");
    if (count) count.textContent = filtered.length ? filtered.length + " zemin" : "";
    renderGrid();
  }

  /* ---------------- Cizim ---------------- */

  function renderGrid() {
    var grid = el("motionbg-grid");
    var empty = el("motionbg-empty");
    var tanitim = el("motionbg-tanitim");
    if (!grid) return;

    // Lisanssiz: tanitim + kilit
    var vitrin = !isProUser() && index.length === 0;
    if (tanitim) tanitim.hidden = !vitrin;
    if (vitrin) {
      grid.hidden = true;
      if (empty) empty.hidden = true;
      return;
    }
    if (empty) empty.hidden = index.length > 0;
    grid.hidden = index.length === 0;
    grid.innerHTML = "";
    if (!index.length) return;
    if (!filtered.length) { grid.innerHTML = '<div class="empty">Eşleşen zemin yok.</div>'; return; }

    var frag = document.createDocumentFragment();
    filtered.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "mbg-card" + (busyPath === item.path ? " busy" : "");
      card.setAttribute("role", "group");
      card.setAttribute("aria-label", item.name + " · playhead'e ekle");

      var vid = document.createElement("video");
      vid.className = "mbg-video";
      vid.muted = true; vid.loop = true; vid.playsInline = true;
      vid.preload = "metadata";
      vid.src = fileUrl(item.path);
      // Ilk kareyi poster gibi goster; hover'da oynat.
      card.onmouseenter = function () { try { vid.play(); } catch (e) {} };
      card.onmouseleave = function () { try { vid.pause(); vid.currentTime = 0; } catch (e) {} };

      var nm = document.createElement("div");
      nm.className = "mbg-name";
      nm.textContent = item.name;

      var fav = document.createElement("button");
      var faved = favlar().indexOf(item.path) !== -1;
      fav.className = "mbg-fav" + (faved ? " on" : "");
      fav.type = "button";
      fav.innerHTML = "♥";
      fav.title = "Favori";
      fav.onclick = function (e) { e.stopPropagation(); toggleFav(item); };

      var add = document.createElement("button");
      add.className = "mbg-add";
      add.type = "button";
      add.textContent = busyPath === item.path ? "Ekleniyor…" : "Ekle";
      add.onclick = function (e) { e.stopPropagation(); insert(item); };

      card.appendChild(vid);
      card.appendChild(fav);
      card.appendChild(nm);
      card.appendChild(add);
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  function toggleFav(item) {
    if (!proGate()) return;
    var fav = favlar();
    var i = fav.indexOf(item.path);
    if (i === -1) fav.push(item.path); else fav.splice(i, 1);
    K.saveSettings();
    renderGrid();
  }

  /* ---------------- Aksiyon ---------------- */

  async function insert(item) {
    if (busyPath || !proGate()) return;
    busyPath = item.path;
    renderGrid();
    try {
      var r = await K.call("KS_placeMotionBG", { path: item.path, name: item.name }, 60000);
      if (!r.ok) throw new Error(r.error || "Motion BG eklenemedi");
      KApp.toast(item.name + " → " + r.trackName + ", playhead" +
        (r.sesSilindi > 0 ? " · ses kaldırıldı" : ""), "good");
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      busyPath = null;
      renderGrid();
    }
  }

  function saveFolder(folder) {
    if (!folder) return;
    K.settings().motionbgEkKlasor = folder;
    K.saveSettings();
    buildIndex();
    KApp.toast("Motion BG klasörü bağlandı: " + basename(folder), "good");
  }

  function chooseFolder() {
    if (!proGate()) return;
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var res = window.cep.fs.showOpenDialogEx(false, true, "Motion BG klasörü seç", null, null);
      if (res && res.data && res.data.length) saveFolder(res.data[0]);
      return;
    }
    KApp.toast("Klasör yolunu Ayarlar → İçerik kütüphaneleri alanına yapıştır", "bad");
  }

  /* ---------------- Baslat ---------------- */

  function init() {
    if (!el("tab-motionbg")) return;
    var s = el("motionbg-search");
    if (s) s.addEventListener("input", function () { search(this.value); });
    var y = el("motionbg-yenile"); if (y) y.addEventListener("click", buildIndex);
    var kf = el("motionbg-add-folder"); if (kf) kf.addEventListener("click", chooseFolder);
    var kf2 = el("motionbg-add-folder-big"); if (kf2) kf2.addEventListener("click", chooseFolder);
    var sync = el("motionbg-propack-yukle"); if (sync) sync.addEventListener("click", function () { if (window.ProSync) ProSync.sync({ force: true }); });
    KApp.onTab("motionbg", function () { if (!index.length) buildIndex(); });
    if (typeof Pro !== "undefined") Pro.on(renderGrid);
    // Disk taraması Motion BG bölümü ilk açıldığında onTab üzerinden yapılır.
    renderGrid();
  }

  return {
    init: init,
    tara: buildIndex,
    chooseFolder: chooseFolder,
    sayisi: function () { return index.length; }
  };
})();
