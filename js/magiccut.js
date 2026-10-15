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
  // Süren ffmpeg analizinin iptal jetonu (K.iptalJetonu): "İptal" düğmesi süreç ağacını öldürür
  var iptalJetonu = null;
  // setBusy(true) anı: "İptal" "Sessizlikleri bul"un yerinde belirir; çift tıklamanın ikinci tıkı analizi iptal etmesin
  var iptalAcilis = 0;
  // setBusy(false) anı: "Sessizlikleri bul" "İptal"in yerinde yeniden belirir; İptal'e çift tıkın ikinci tıkı yeni analiz başlatmasın
  var baslatAcilis = 0;

  function el(id) { return document.getElementById(id); }

  function status(msg, cls) {
    var e = el("cut-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function fmt(sec) {
    // once onda birlige yuvarla, sonra bol: 59.97 -> "1:00.0", "0:60.0" degil
    var t = Math.round(sec * 10) / 10;
    var m = Math.floor(t / 60), s = t - m * 60;
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

  /*
   * Sonuç (Yapay zekâ köprüsü / MCP kullanır; düğme yok sayar): { sonuc: 'bulundu'|'yok'|'iptal'|
   * 'klip_yok'|'hata'|'mesgul', kismi? }. Analiz sonuç dalına ulaşmadıysa (iptal, hata, klip yok)
   * önceki aralıklar ve liste olduğu gibi kalır.
   */
  async function analyze(ev) {
    // kapıdan ÖNCE: başıboş ikinci tık deneme penceresi de açmasın (Pro "yeniden" olay taşımaz, geçer)
    if (K.baslatTikiGecerli && !K.baslatTikiGecerli(ev, baslatAcilis)) return { sonuc: "mesgul" };
    // Pro: otomatik kesim (ucretsizde 3 deneme hakki; hak yalniz kesim uygulaninca duser)
    if (typeof Pro !== "undefined" && !Pro.gate("cut", { deneme: true, yeniden: analyze })) return { sonuc: "pro" };
    if (busy) return { sonuc: "mesgul" };
    sesiKapat();
    clip = KApp.ctx().sel;
    if (!clip) { status("Önce bir klip seç.", "warn"); return { sonuc: "klip_yok" }; }
    busy = true;
    iptalJetonu = K.iptalJetonu ? K.iptalJetonu() : null;
    var jeton = iptalJetonu;
    setBusy(true);
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");
      if (jeton && jeton.iptalEdildi) { status("İptal edildi.", "warn"); return { sonuc: "iptal" }; }

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
      ], { timeout: Math.max(300000, dur * 2000), iptal: jeton });
      // kullanıcı iptal etti: yarım sonucu öneri diye gösterme, önceki analiz ekranda kalır
      if (res.iptal) { status("İptal edildi.", "warn"); return { sonuc: "iptal" }; }
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
        return { sonuc: "yok" };
      }

      /*
       * ffmpeg hatayla bitti ama yine de aralik bulduysa (zaman asimi, yarim
       * okuma…) sonuc klibin yalnizca bir kismini kapsiyor olabilir. Bunu tam
       * sonucmus gibi sunmak, kullanicinin klibin sonundaki sessizlikleri
       * gozden kacirmasina yol acar — acikca soyle.
       */
      var kismi = res.code !== 0 && sil.length > 0;
      if (kismi) {
        status("⚠ Analiz tamamlanamadı — öneriler klibin yalnız bir kısmını kapsıyor olabilir. Tekrar dene.", "warn");
      } else {
        status("");
      }
      el("cut-result").hidden = false;
      render();
      KApp.toast(ranges.length + " kesim önerisi bulundu", kismi ? "warn" : "good");
      return { sonuc: "bulundu", kismi: kismi };
    } catch (e) {
      status("✕ " + e.message, "bad");
      return { sonuc: "hata", mesaj: String(e && e.message ? e.message : e) };
    } finally {
      busy = false;
      iptalJetonu = null;
      setBusy(false);
    }
  }

  function setBusy(b) {
    el("cut-analyze").classList.toggle("busy", b);
    el("cut-progress").hidden = !b;
    // analiz sürerken "Sessizlikleri bul" yerine "İptal"
    var iptal = el("cut-cancel");
    if (iptal) {
      el("cut-analyze").hidden = b;
      iptal.hidden = !b;
      iptal.disabled = false;
    }
    iptalAcilis = b ? Date.now() : 0;
    baslatAcilis = b ? 0 : Date.now();
    if (!b) refreshButton();
  }

  function iptalEt(ev) {
    if (!busy || !iptalJetonu) return;
    if (K.iptalTikiGecerli && !K.iptalTikiGecerli(ev, iptalAcilis)) return;
    el("cut-cancel").disabled = true;
    iptalJetonu.iptal();
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
      d.className = "mc-cut-length";
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

  // ek.cloneFirst === true (Yapay zekâ köprüsü): kopya sekans zorunlu, açık seçenekle. Köprü paylaşılan
  // "target"a yazmaz: kesim sürerken kullanıcının hedef düğmesiyle seçtiği değer ezilmez.
  // Düğmenin tık olayı (Event) cloneFirst taşımaz: o an seçili hedef geçerli.
  async function apply(ek) {
    var kopyaZorunlu = !!(ek && ek.cloneFirst === true);
    var hedef = kopyaZorunlu ? "clone" : target;
    var yeniden = kopyaZorunlu ? function () { return apply({ cloneFirst: true }); } : apply;
    if (typeof Pro !== "undefined" && !Pro.gate("cut", { deneme: true, yeniden: yeniden })) return; // Pro: otomatik kesim
    var act = activeRanges().map(function (r) { return { start: r.start, end: r.end }; });
    if (act.length === 0) return;
    sesiKapat();
    el("cut-apply").disabled = true;
    status("Uygulanıyor…");
    var mode = hedef === "clone" ? "ripple" : el("cut-mode").value;
    // Yuzlerce kesim uygulamak uzun surebilir: zaman asimini genis tut
    var r = await K.call("KS_applyCuts", {
      ranges: act,
      removeMode: mode,
      cloneFirst: hedef === "clone"
    }, 900000);
    el("cut-apply").disabled = false;
    if (r.ok) {
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("cut", KApp.toast);   // deneme: yalniz basarida
      status("");
      var msg = r.newSeq
        ? "✂ Kopya sekansta uygulandı: " + r.newSeq
        : "✂ " + r.removed + " parça silindi" + (r.selected ? ", " + r.selected + " parça seçildi" : "");
      if (mode === "select") msg = "✂ Kesildi ve seçildi — silmek istersen Shift+Delete";
      if (r.rippleFallback) {
        // host, senkron kaybini onlemek icin ripple'i bosluk moduna dusurdu
        status("⚠ Bazı track'ler aralığı tam kaplamıyor — senkron bozulmasın diye kesimler boşluk bırakılarak silindi.", "warn");
        KApp.toast(msg + " (boşluk modunda)", "warn");
      } else {
        KApp.toast(msg, "good");
      }
      // ilk uygulanan kesim: davet seridinin anlarindan biri (mesgulken/yildiz seridi acikken cikmaz)
      if (KApp.davetAni) KApp.davetAni("cut");
    } else {
      status("✕ " + r.error, "bad");
    }
    return r;
  }

  /* ---------------- Yapay zekâ köprüsü (MCP, 3.4) ---------------- */
  // Düğmelerin aynı işlevleri (aynı kapı, aynı deneme hakkı); kesim HER ZAMAN kopya sekansta
  function durumMetni() { var e = el("cut-status"); return e ? { metin: e.textContent || "", kotu: /\bbad\b/.test(e.className) } : { metin: "", kotu: false }; }
  // Kaydırıcı düğmeyle aynı yoldan: değer + "input" olayı (yanındaki "-38 dB" etiketi de güncellenir)
  function kaydir(id, v, alt, ust) {
    var e = el(id);
    if (!e || typeof v !== "number" || !isFinite(v)) return;
    e.value = String(Math.max(alt, Math.min(ust, v)));
    try { e.dispatchEvent(new Event("input", { bubbles: true })); } catch (er) {}
  }
  async function mcpAnaliz(o) {
    o = o || {};
    // meşgul / klip yokken kaydırıcılara dokunulmaz, önceki analiz ve liste olduğu gibi kalır
    if (busy) return { ok: false, hata: "mesgul", mesaj: "Auto Cut is already running." };
    if (!KApp.ctx().sel) return { ok: false, hata: "klip_yok", mesaj: "Select a clip on the timeline first." };
    kaydir("cut-noise", o.esik_db, -60, -20);
    kaydir("cut-minsil", o.min_sessizlik, 0.3, 2.5);
    kaydir("cut-pad", o.pay, 0, 0.5);
    var r = await analyze();
    var d = durumMetni();
    var sonuc = r && r.sonuc;
    if (sonuc === "bulundu" || sonuc === "yok") {
      return { ok: true, klip: clip ? clip.name : "", araliklar: ranges.map(function (x) { return { baslangic: x.start, bitis: x.end }; }),
        kismi: !!(r && r.kismi), durum: d.metin };
    }
    if (sonuc === "klip_yok") return { ok: false, hata: "klip_yok", mesaj: "Select a clip on the timeline first." };
    if (sonuc === "iptal") return { ok: false, hata: "iptal", mesaj: "The analysis was cancelled in Suflo." };
    if (sonuc === "mesgul") return { ok: false, hata: "mesgul", mesaj: "Auto Cut is already running." };
    if (sonuc === "pro") return { ok: false, hata: "pro_gerekli", mesaj: "Auto Cut needs Suflo Pro." };
    return { ok: false, hata: "analiz_hatasi", mesaj: (r && r.mesaj) || d.metin || "Not analysed." };
  }
  async function mcpKes() {
    if (!activeRanges().length) return { ok: false, hata: "analiz_yok", mesaj: "Run suflo_sessizlik_analiz first: there are no cut ranges." };
    var r = await apply({ cloneFirst: true });   // kopya sekans zorunlu: özgün sekans hiç bozulmaz
    if (!r) return { ok: false, hata: "uygulanamadi", mesaj: durumMetni().metin || "Not applied." };
    if (!r.ok) return { ok: false, hata: "uygulanamadi", mesaj: r.error || "Not applied." };
    return { ok: true, kopyaSekans: r.newSeq || "", bosluklu: !!r.rippleFallback };
  }

  /* ---------------- Dinle (önizleme) ---------------- */

  // Kesimler uygulanmis gibi sesi panelde cal (ortak oynatici: js/dinle.js)
  var oynatici = window.KDinle ? window.KDinle("cut-audio") : null;
  function sesiKapat() { if (oynatici) oynatici.kapat(); }

  async function dinle() {
    if (!clip || !window.SufloTextCut || !oynatici) return;
    var btn = el("cut-dinle");
    btn.disabled = true;
    // özgün Türkçe etiket: iş sürerken arayüz dili değişse de doğru dile döner (çevirmen çevirir)
    var eski = window.SufloI18n && SufloI18n.orig ? SufloI18n.orig(btn) : btn.textContent;
    btn.textContent = "Hazırlanıyor…";
    var benimKlip = clip;
    try {
      var dur = clip.outPoint - clip.inPoint;
      var r = await oynatici.cal({
        mediaPath: clip.mediaPath, inPoint: clip.inPoint, dur: dur, cuts: activeRanges(),
        clip: { clipStart: clip.clipStart, clipEnd: clip.clipEnd, dur: dur },
        gecerli: function () { return clip === benimKlip; }
      });
      if (r.ok && r.kisaltildi) status("Uzun klip: ilk " + Math.round(oynatici.MAX_SN / 60) + " dakika dinletiliyor.");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      btn.disabled = false;
      btn.textContent = eski;
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
    if (el("cut-cancel")) el("cut-cancel").addEventListener("click", iptalEt);
    el("cut-apply").addEventListener("click", apply);
    if (el("cut-dinle")) el("cut-dinle").addEventListener("click", dinle);

    KApp.onContext(function (ctx) {
      refreshButton();
      // seçim değiştiyse eski analiz geçersiz
      if (clip && (!ctx.sel || ctx.sel.mediaPath !== clip.mediaPath || ctx.sel.clipStart !== clip.clipStart)) {
        el("cut-result").hidden = true;
        sesiKapat();
        ranges = [];
        clip = null;
      }
    });
    refreshButton();
  }

  return { init: init, mcpAnaliz: mcpAnaliz, mcpKes: mcpKes };
})();
