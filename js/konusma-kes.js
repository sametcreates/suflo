/*
 * Suflo — Konuşmadan kes (metinle kurgu)
 * Seçili klibi kelime zamanlı yazıya döker; dolgu seslerini, tekrarları ve
 * uzun duraksamaları işaretler. Kullanıcı kelimelere tıklayarak kesileceği
 * seçer; kesimler mevcut KS_applyCuts ile (varsayılan kopya sekansta) uygulanır.
 * Hesaplamanın tamamı js/textcut.js'te (saf, testli).
 */
window.KTextCut = (function () {
  "use strict";

  var TC = window.SufloTextCut;
  var clip = null;
  var lang = "tr";
  var words = [];      // [{start, end, text}]
  var oneri = [];      // classify sonucu: "filler" | "repeat" | "soft" | null
  var elle = {};       // index -> true (kes) / false (koru): öneriyi ezer
  var target = "clone";
  var busy = false;

  function el(id) { return document.getElementById(id); }

  function status(msg, cls) {
    var e = el("tc-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
    if (cls === "bad" && msg) K.log("[konusmadan kes] " + msg);
  }

  function fmt(sec) {
    var t = Math.max(0, Math.round(sec * 10) / 10);
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }

  function refreshButton() {
    var ctx = KApp.ctx();
    el("tc-analyze").disabled = busy || !ctx.sel;
  }

  function setBusy(b) {
    busy = b;
    el("tc-analyze").classList.toggle("busy", b);
    el("tc-progress").hidden = !b;
    refreshButton();
  }

  function secenekler() {
    return {
      lang: lang,
      soft: el("tc-soft").checked,
      repeats: el("tc-repeat").checked
    };
  }

  function yenidenSinifla() {
    oneri = TC.classify(words, secenekler());
    var dolguAcik = el("tc-filler").checked;
    if (!dolguAcik) oneri = oneri.map(function (k) { return k === "filler" ? null : k; });
  }

  function kesilsinMi(i) {
    if (elle.hasOwnProperty(i)) return elle[i];
    return !!oneri[i];
  }

  function kesimler() {
    var removed = words.map(function (w, i) { return kesilsinMi(i); });
    var pause = el("tc-pause").value;
    return TC.buildCuts(words, removed, {
      maxPause: pause === "" ? null : Number(pause),
      clipStart: clip ? clip.clipStart : undefined,
      clipEnd: clip ? clip.clipEnd : undefined
    });
  }

  function render() {
    var box = el("tc-words");
    box.innerHTML = "";
    var pause = el("tc-pause").value;
    var maxPause = pause === "" ? null : Number(pause);
    var frag = document.createDocumentFragment();
    words.forEach(function (w, i) {
      // kisaltilacak uzun duraksamayi gorunur kil
      if (maxPause && i > 0 && w.start - words[i - 1].end > maxPause) {
        var p = document.createElement("span");
        p.className = "tc-pause";
        p.textContent = "⏸ " + (w.start - words[i - 1].end).toFixed(1) + " sn";
        p.title = "Uzun duraksama — " + maxPause + " sn'ye kısaltılacak";
        frag.appendChild(p);
      }
      var s = document.createElement("span");
      var kes = kesilsinMi(i);
      var cls = "tc-w";
      if (kes) cls += " " + (elle[i] === true && !oneri[i] ? "cut" : (oneri[i] || "cut"));
      else if (oneri[i]) cls += " kept";
      s.className = cls;
      s.textContent = w.text;
      s.title = fmt(w.start - (clip ? clip.clipStart : 0)) + (oneri[i] ? " · öneri: " +
        ({ filler: "dolgu", repeat: "tekrar", soft: "ara söz" }[oneri[i]]) : "");
      s.onclick = function () {
        elle[i] = !kesilsinMi(i);
        if (elle[i] === !!oneri[i]) delete elle[i];   // öneriyle ayni: elle kaydi gereksiz
        render();
      };
      frag.appendChild(s);
      frag.appendChild(document.createTextNode(" "));
    });
    box.appendChild(frag);
    ozet();
  }

  function ozet() {
    var r = kesimler();
    var kelime = words.filter(function (w, i) { return kesilsinMi(i); }).length;
    var sn = TC.totalSeconds(r);
    var dur = clip ? clip.clipEnd - clip.clipStart : 0;
    el("tc-summary").textContent = kelime + " kelime · " + r.length + " kesim · −" + sn.toFixed(1) + " sn" +
      (dur > 0 ? " (%" + (sn / dur * 100).toFixed(0) + ")" : "");
    el("tc-apply").disabled = r.length === 0;
  }

  async function analyze() {
    if (typeof Pro !== "undefined" && !Pro.gate("textcut")) return; // Pro: konusmadan kes
    if (busy) return;
    if (!window.KCaptions || !KCaptions.transcribeWords) { status("Altyazı motoru yüklenemedi.", "bad"); return; }
    setBusy(true);
    status("Hazırlanıyor…");
    try {
      var dilSecimi = (el("cap-lang") && el("cap-lang").value) || "tr";
      var sonuc = await KCaptions.transcribeWords({
        prompt: TC.fillerPrompt(dilSecimi === "auto" ? "tr" : dilSecimi),
        onStatus: function (m, c) { status(m, c); }
      });
      clip = sonuc.clip;
      lang = sonuc.lang || "tr";
      words = sonuc.words;
      elle = {};
      if (!words.length) {
        el("tc-result").hidden = true;
        status("Bu klipte konuşma bulunamadı.", "warn");
        return;
      }
      yenidenSinifla();
      status("");
      el("tc-result").hidden = false;
      render();
      var n = oneri.filter(Boolean).length;
      KApp.toast(words.length + " kelime · " + n + " kesim önerisi", "good");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (typeof Pro !== "undefined" && !Pro.gate("textcut")) return;
    var r = kesimler().map(function (x) { return { start: x.start, end: x.end }; });
    if (!r.length) return;
    el("tc-apply").disabled = true;
    status("Uygulanıyor…");
    try {
      var res = await K.call("KS_applyCuts", {
        ranges: r,
        removeMode: "ripple",
        cloneFirst: target === "clone"
      }, 900000);
      if (res.ok) {
        status("");
        var msg = res.newSeq ? "✂ Kopya sekansta uygulandı: " + res.newSeq : "✂ " + res.removed + " parça silindi";
        if (res.rippleFallback) {
          status("⚠ Bazı track'ler aralığı tam kaplamıyor — senkron bozulmasın diye kesimler boşluk bırakılarak silindi.", "warn");
          KApp.toast(msg + " (boşluk modunda)", "warn");
        } else {
          KApp.toast(msg, "good");
        }
        // Timeline degisti: eski zamanlar artik gecersiz
        el("tc-result").hidden = true;
        words = []; oneri = []; elle = {}; clip = null;
      } else {
        status("✕ " + res.error, "bad");
      }
    } finally {
      el("tc-apply").disabled = false;
    }
  }

  function init() {
    if (!TC) return;
    el("tc-analyze").addEventListener("click", analyze);
    el("tc-apply").addEventListener("click", apply);
    el("tc-reset").addEventListener("click", function () { elle = {}; render(); });
    ["tc-filler", "tc-repeat", "tc-soft"].forEach(function (id) {
      el(id).addEventListener("change", function () { if (words.length) { yenidenSinifla(); render(); } });
    });
    el("tc-pause").addEventListener("change", function () { if (words.length) render(); });
    Array.prototype.forEach.call(el("tc-target").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("tc-target").querySelectorAll("button"), function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        target = b.dataset.m;
      });
    });
    KApp.onContext(function (ctx) {
      refreshButton();
      // BASKA bir klip secildiyse eski transkript gecersiz. Secimin kalkmasi
      // (timeline'da bosluga tiklamak) incelemeyi silmesin; kesim secim istemez.
      if (clip && !busy && ctx.sel && (ctx.sel.mediaPath !== clip.mediaPath || ctx.sel.clipStart !== clip.clipStart)) {
        el("tc-result").hidden = true;
        words = []; oneri = []; elle = {}; clip = null;
      }
    });
    refreshButton();
  }

  return { init: init };
})();
