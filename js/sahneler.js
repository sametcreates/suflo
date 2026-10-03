/*
 * Suflo — Sahne algılama (v3.0)
 * Seçili klibin görüntüsünde sahne değişimlerini ffmpeg scene skoruyla bulur;
 * marker atar ya da klibi sahnelerde böler (KS_splitSelectedAt).
 * Ayrıştırma ve zaman eşlemesi js/scenes.js'te (saf, testli).
 */
window.KSahne = (function () {
  "use strict";

  var SC = window.SufloScenes;
  var clip = null;
  var sahneler = [];   // [{ t (sequence sn), skor }]
  var busy = false;

  function el(id) { return document.getElementById(id); }

  function status(msg, cls) {
    var e = el("sc-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
    if (cls === "bad" && msg) K.log("[sahne] " + msg);
  }

  function refreshButton() {
    el("sc-analyze").disabled = busy || !KApp.ctx().sel;
  }

  function setBusy(b) {
    busy = b;
    el("sc-analyze").classList.toggle("busy", b);
    el("sc-progress").hidden = !b;
    refreshButton();
  }

  function cizBar() {
    var bar = el("sc-bar");
    bar.innerHTML = "";
    if (!clip) return;
    var t0 = clip.clipStart, toplam = clip.clipEnd - clip.clipStart, onceki = t0;
    sahneler.concat([{ t: clip.clipEnd }]).forEach(function (s, i) {
      var parca = document.createElement("span");
      parca.className = i % 2 ? "cut" : "keep";
      parca.style.width = ((s.t - onceki) / toplam * 100) + "%";
      bar.appendChild(parca);
      onceki = s.t;
    });
  }

  async function analyze() {
    if (typeof Pro !== "undefined" && !Pro.gate("cut")) return;
    if (busy) return;
    var sc = await K.call("KS_getSelectedClips");
    if (!sc.ok || !sc.clips || !sc.clips.length) { status("Timeline'da bir video klibi seç.", "warn"); return; }
    clip = sc.clips[0];
    // Yeni analiz: eski sonuc basarisiz analizde de ekranda kalmasin
    sahneler = [];
    el("sc-result").hidden = true;
    setBusy(true);
    status("Görüntü taranıyor… (" + Math.round(clip.dur) + " sn)");
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar'dan kur.");
      var r = await K.run(ff, SC.ffmpegArgs(clip.mediaPath, {
        ss: clip.inPoint, t: clip.dur, hassasiyet: el("sc-hassas").value
      }), { timeout: Math.max(300000, clip.dur * 3000) });
      var ham = SC.parse(r.stderr || "");
      if (!ham.length && r.code !== 0) {
        throw new Error("Görüntü okunamadı: " + String(r.stderr || "").split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 160));
      }
      sahneler = SC.toSequence(SC.clean(ham, { minGap: 1, dur: clip.dur }), clip);
      if (!sahneler.length) {
        el("sc-result").hidden = true;
        status("Bu hassasiyette sahne değişimi bulunamadı — 'Yüksek'i dene.", "warn");
        return;
      }
      status("");
      el("sc-summary").textContent = sahneler.length + " sahne değişimi · " + (sahneler.length + 1) + " parça";
      el("sc-result").hidden = false;
      cizBar();
      KApp.toast(sahneler.length + " sahne değişimi bulundu", "good");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function uygula(bol) {
    if (typeof Pro !== "undefined" && !Pro.gate("cut")) return;
    if (!sahneler.length || !clip) return;
    // Bolme yalniz analiz edilen klibe: secim degistiyse baska klibi bu zamanlarda kesme
    if (bol) {
      var sc = await K.call("KS_getSelectedClips");
      var ayni = sc.ok && (sc.clips || []).some(function (c) {
        return c.mediaPath === clip.mediaPath && Math.abs(c.clipStart - clip.clipStart) < 0.01;
      });
      if (!ayni) { status("Sahneler başka bir klip için bulundu — o klibi seç ya da yeniden tara.", "warn"); return; }
    }
    var times = sahneler.map(function (s) { return s.t; });
    try {
      var r = bol
        ? await K.call("KS_splitSelectedAt", { times: times, markers: false }, 300000)
        : await K.call("KS_addMarkers", { times: times, name: "Sahne" }, 120000);
      if (!r.ok) throw new Error(r.error);
      KApp.toast(bol ? "✂ Klip " + r.cuts + " sahne değişiminde bölündü" : r.added + " sahne marker'ı atıldı", "good");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    }
  }

  function init() {
    if (!SC || !el("sc-analyze")) return;
    el("sc-analyze").addEventListener("click", analyze);
    el("sc-markers").addEventListener("click", function () { uygula(false); });
    el("sc-split").addEventListener("click", function () { uygula(true); });
    KApp.onContext(refreshButton);
    refreshButton();
  }

  return { init: init };
})();
