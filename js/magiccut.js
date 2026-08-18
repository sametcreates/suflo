/*
 * Kesit — Kesim modülü
 * Seçili klip otomatik algılanır → "Duraksamaları bul" → görsel bar + liste →
 * varsayılan olarak kopya sekansta ripple uygular (orijinal hiç bozulmaz).
 */
window.KCut = (function () {
  "use strict";

  var clip = null;
  var ranges = [];      // { start, end, keep } — sequence zamanı
  var target = "clone"; // clone | here
  var busy = false;

  function el(id) { return document.getElementById(id); }

  function status(msg, cls) {
    var e = el("cut-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function fmt(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }

  function refreshButton() {
    var ctx = KApp.ctx();
    el("cut-analyze").disabled = busy || !ctx.sel;
    if (ctx.connected && !ctx.sel && !busy) status("Timeline'da bir klip seç.");
    else if (!busy) {
      /*
       * Uyarı/hata mesajına DOKUNMA: analyze'ın finally'si setBusy(false) →
       * buraya geliyor ve eski kod status("") ile hatayı daha kullanıcı
       * okuyamadan siliyordu — "tıklıyorum, hiçbir şey olmuyor" bunun sonucu.
       */
      var e = el("cut-status");
      if (!/warn|bad/.test(e.className)) status("");
    }
  }

  /* ---------------- Analiz ---------------- */

  function parseSilence(stderr) {
    var out = [];
    var lines = stderr.split(/\r?\n/);
    var pending = null;
    for (var i = 0; i < lines.length; i++) {
      var mStart = lines[i].match(/silence_start:\s*(-?[\d.]+)/);
      if (mStart) { pending = parseFloat(mStart[1]); continue; }
      var mEnd = lines[i].match(/silence_end:\s*([\d.]+)/);
      if (mEnd && pending !== null) {
        out.push({ start: Math.max(0, pending), end: parseFloat(mEnd[1]) });
        pending = null;
      }
    }
    return out;
  }

  async function analyze() {
    if (typeof Pro !== "undefined" && !Pro.gate("cut")) return; // Pro: otomatik kesim
    if (busy) return;
    clip = KApp.ctx().sel;
    if (!clip) { status("Önce bir klip seç.", "warn"); return; }
    busy = true;
    setBusy(true);
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");

      var noise = el("cut-noise").value;
      var minSil = parseFloat(el("cut-minsil").value);
      var pad = parseFloat(el("cut-pad").value);
      var dur = clip.outPoint - clip.inPoint;

      status("Ses analiz ediliyor… (" + dur.toFixed(0) + " sn)");
      var res = await K.run(ff, [
        "-hide_banner",
        "-ss", String(clip.inPoint),
        "-t", String(dur),
        "-i", clip.mediaPath,
        "-map", "0:a:0?",
        "-af", "silencedetect=noise=" + noise + "dB:d=" + minSil,
        "-f", "null", "-"
      ]);
      var sil = parseSilence(res.stderr || "");
      K.log("[kesim] ffmpeg kod=" + res.code + " ham aralik=" + sil.length +
        " sure=" + dur.toFixed(1) + " esik=" + noise + "dB");
      /*
       * ffmpeg hata verdiyse (ses akışı yok, dosya okunamadı, codec eksik…)
       * bunu "duraksama yok" diye yutma — eski davranış kullanıcıyı eşikle
       * boğuşturuyordu, oysa sorun bambaşkaydı.
       */
      if (sil.length === 0 && res.code !== 0) {
        throw new Error("ses analizi başarısız: " +
          String(res.stderr || "").split("\n").filter(function (s) { return s.trim(); })
            .slice(-2).join(" ").slice(0, 180));
      }

      var offset = clip.clipStart;
      ranges = [];
      for (var i = 0; i < sil.length; i++) {
        var s = sil[i].start + pad;
        var e = sil[i].end - pad;
        if (e - s < 0.25) continue;
        if (s < 0.05) s = 0.05;
        if (e > dur - 0.05) e = dur - 0.05;
        if (e <= s) continue;
        ranges.push({ start: offset + s, end: offset + e, keep: true });
      }

      if (ranges.length === 0) {
        el("cut-result").hidden = true;
        status("Bu eşikte duraksama yok — eşiği yükselt (-30 dB) ya da min. süreyi düşür.", "warn");
        return;
      }

      status("");
      el("cut-result").hidden = false;
      render();
      KApp.toast(ranges.length + " kesim önerisi bulundu", "good");
    } catch (e) {
      status("✕ " + e.message, "bad");
    } finally {
      busy = false;
      setBusy(false);
    }
  }

  function setBusy(b) {
    el("cut-analyze").classList.toggle("busy", b);
    el("cut-progress").hidden = !b;
    if (!b) refreshButton();
  }

  /* ---------------- Görselleştirme ---------------- */

  function activeRanges() {
    return ranges.filter(function (r) { return r.keep; });
  }

  function render() {
    renderBar();
    renderList();
    updateSummary();
  }

  function renderBar() {
    var bar = el("cut-bar");
    bar.innerHTML = "";
    if (!clip) return;
    var t0 = clip.clipStart, t1 = clip.clipEnd;
    var total = t1 - t0;
    if (total <= 0) return;
    var pos = t0;
    ranges.forEach(function (r, i) {
      if (r.start > pos) {
        var keep = document.createElement("span");
        keep.className = "keep";
        keep.style.width = ((r.start - pos) / total * 100) + "%";
        bar.appendChild(keep);
      }
      var cut = document.createElement("span");
      cut.className = "cut" + (r.keep ? "" : " off");
      cut.style.width = ((r.end - r.start) / total * 100) + "%";
      cut.title = fmt(r.start - t0) + " · −" + (r.end - r.start).toFixed(2) + " sn" + (r.keep ? "" : " (kapalı)");
      cut.onclick = function () { r.keep = !r.keep; render(); };
      bar.appendChild(cut);
      pos = r.end;
    });
    if (pos < t1) {
      var tail = document.createElement("span");
      tail.className = "keep";
      tail.style.width = ((t1 - pos) / total * 100) + "%";
      bar.appendChild(tail);
    }
  }

  function renderList() {
    var box = el("cut-ranges");
    box.innerHTML = "";
    ranges.forEach(function (r, i) {
      var row = document.createElement("div");
      row.className = "seg cut-seg" + (r.keep ? "" : " off");

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = r.keep;
      cb.onchange = function () { ranges[i].keep = cb.checked; render(); };

      var t = document.createElement("span");
      t.className = "seg-time mono";
      t.textContent = fmt(r.start - clip.clipStart);

      var d = document.createElement("span");
      d.className = "seg-dur";
      d.textContent = "−" + (r.end - r.start).toFixed(2) + " sn";

      row.appendChild(cb); row.appendChild(t); row.appendChild(d);
      box.appendChild(row);
    });
  }

  function updateSummary() {
    var act = activeRanges();
    var saved = act.reduce(function (a, r) { return a + (r.end - r.start); }, 0);
    var dur = clip ? (clip.outPoint - clip.inPoint) : 0;
    el("cut-summary").textContent = act.length + " kesim · −" + saved.toFixed(1) + " sn" +
      (dur > 0 ? " (%" + (saved / dur * 100).toFixed(0) + ")" : "");
    el("cut-apply").disabled = act.length === 0;
  }

  /* ---------------- Uygulama ---------------- */

  async function apply() {
    if (typeof Pro !== "undefined" && !Pro.gate("cut")) return; // Pro: otomatik kesim
    var act = activeRanges().map(function (r) { return { start: r.start, end: r.end }; });
    if (act.length === 0) return;
    el("cut-apply").disabled = true;
    status("Uygulanıyor…");
    var mode = target === "clone" ? "ripple" : el("cut-mode").value;
    // Yuzlerce kesim uygulamak uzun surebilir: zaman asimini genis tut
    var r = await K.call("KS_applyCuts", {
      ranges: act,
      removeMode: mode,
      cloneFirst: target === "clone"
    }, 900000);
    el("cut-apply").disabled = false;
    if (r.ok) {
      status("");
      var msg = r.newSeq
        ? "✂ Kopya sekansta uygulandı: " + r.newSeq
        : "✂ " + r.removed + " parça silindi" + (r.selected ? ", " + r.selected + " parça seçildi" : "");
      if (mode === "select") msg = "✂ Kesildi ve seçildi — silmek istersen Shift+Delete";
      KApp.toast(msg, "good");
    } else {
      status("✕ " + r.error, "bad");
    }
  }

  /* ---------------- Başlat ---------------- */

  function init() {
    function bindRange(id, valId, suffix) {
      var inp = el(id), out = el(valId);
      inp.addEventListener("input", function () { out.textContent = inp.value + suffix; });
    }
    bindRange("cut-noise", "cut-noise-val", " dB");
    bindRange("cut-minsil", "cut-minsil-val", " sn");
    bindRange("cut-pad", "cut-pad-val", " sn");

    Array.prototype.forEach.call(el("cut-target").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("cut-target").querySelectorAll("button"), function (x) {
          x.classList.remove("on");
        });
        b.classList.add("on");
        target = b.dataset.m;
        el("cut-here-row").hidden = target !== "here";
      });
    });

    el("cut-analyze").addEventListener("click", analyze);
    el("cut-apply").addEventListener("click", apply);

    KApp.onContext(function (ctx) {
      refreshButton();
      // seçim değiştiyse eski analiz geçersiz
      if (clip && (!ctx.sel || ctx.sel.mediaPath !== clip.mediaPath || ctx.sel.clipStart !== clip.clipStart)) {
        el("cut-result").hidden = true;
        ranges = [];
        clip = null;
      }
    });
    refreshButton();
  }

  return { init: init };
})();
