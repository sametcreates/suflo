/*
 * Suflo — Konuşmadan kes (metinle kurgu) + Tek Tık Temizlik
 * Seçili klibi kelime zamanlı yazıya döker; dolgu seslerini, tekrarları,
 * baştan alınan cümleleri (tekrar çekimler, yarım başlangıçlar) ve uzun
 * duraksamaları işaretler. Kullanıcı kelimelere tıklayarak ya da inceleme
 * listesinden kesileceği seçer; kesimler mevcut KS_applyCuts ile (varsayılan
 * kopya sekansta) uygulanır.
 * Hesaplamanın tamamı saf modüllerde (testli): js/textcut.js, js/retakes.js,
 * js/transcript-cache.js. Burası yalnız DOM ve Premiere yapıştırıcısı.
 * Tek doğruluk kaynağı kelime görünümü: inceleme listesindeki işaret de elle[]'ye yazar.
 */
window.KTextCut = (function () {
  "use strict";

  var TC = window.SufloTextCut;
  var RT = window.SufloRetakes;
  var clip = null;
  var sekans = "";     // analizin yapildigi sekans: baska sekansa kesim uygulanmasin
  var lang = "tr";
  var words = [];      // [{start, end, text}]
  var oneri = [];      // classify + tekrar çekim: "filler" | "repeat" | "soft" | "falsestart" | "retake" | null
  var etiket = [];     // RT.labelWords: "retake" | "falsestart" | "kept" | null
  var tk = null;       // RT.detect sonucu (gruplar)
  var elle = {};       // index -> true (kes) / false (koru): öneriyi ezer
  var grupSecim = {};  // "takes" anahtarı -> { keep, on }: kullanıcının grup kararları
  var korunanDuraksama = {};   // işareti kaldırılan duraksama kesimleri: anahtar -> { start, end }
  var kaldirilan = [];         // incelemede işareti kaldırılan kelime parçaları: [{ words, reason, start, end }]
  var aiGruplari = null;       // doğrulanmış AI grupları (bu klip için)
  var aiSurum = 0, aiMesgul = 0;   // aiMesgul: süren AI geçişinin sürümü (0 = yok)
  var onbellektenMi = false;
  var bellek = [];     // bellek içi önbellek: son birkaç klibin transkripti [{ anahtar, sonuc }]
  var target = "clone";
  var busy = false;

  var NEDEN = {
    "dolgu": "dolgu", "tekrar": "tekrar", "tekrar-cekim": "tekrar çekim", "yarim": "yarım başlangıç",
    "duraksama": "duraksama", "senaryo-disi": "senaryo dışı", "elle": "elle silinen"
  };

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

  function aiHazir() {
    try { return !!(window.KCaptions && KCaptions.chatConfig && KCaptions.chatConfig()); } catch (e) { return false; }
  }

  function refreshButton() {
    var ctx = KApp.ctx();
    el("tc-analyze").disabled = busy || !ctx.sel;
    // AI gruplama anahtar ister: yoksa kapalı (yanında rehberin "anahtar gerekli" çipi)
    var ai = el("tc-ai");
    if (ai) {
      var hazir = aiHazir();
      ai.disabled = !hazir;
      if (!hazir) ai.checked = false;
    }
  }

  function setBusy(b) {
    busy = b;
    el("tc-analyze").classList.toggle("busy", b);
    el("tc-progress").hidden = !b;
    refreshButton();
  }

  function retakeAcik() { return !!(RT && el("tc-retake") && el("tc-retake").checked); }

  function secenekler() {
    return {
      lang: lang,
      soft: el("tc-soft").checked,
      repeats: el("tc-repeat").checked,
      extraFillers: K.settings().extraFillers || "",
      phraseRepeats: retakeAcik()
    };
  }

  function grupAnahtari(g) { return g.takes.join(","); }

  function yenidenSinifla() {
    oneri = TC.classify(words, secenekler());
    var dolguAcik = el("tc-filler").checked;
    if (!dolguAcik) oneri = oneri.map(function (k) { return k === "filler" ? null : k; });
    tk = null; etiket = [];
    if (retakeAcik() && words.length) {
      tk = RT.detect(words, {
        lang: lang,
        policy: el("tc-policy").value,
        script: el("tc-script") ? el("tc-script").value : "",
        llm: aiGruplari
      });
      // kullanıcının çip / inceleme kararları (yeniden sınıflamada kaybolmasın)
      tk.groups.forEach(function (g) {
        var sec = grupSecim[grupAnahtari(g)];
        if (!sec) return;
        if (sec.keep != null) RT.setKeep(tk, g, sec.keep);
        if (sec.on != null) g.on = sec.on;
      });
      etiket = RT.labelWords(words, tk);
      // Tekrar çekim grubuna giren cümlelerde karar yalnız grubun: cümle içi kuralın
      // (classify phraseRepeats) "falsestart"ı işaretsiz bir orta güvenli grubu kesmesin
      var wi = RT.wordIndex(tk);
      Object.keys(wi).forEach(function (k) { if (oneri[k] === "falsestart") oneri[k] = null; });
      etiket.forEach(function (e, i) { if (e === "retake" || e === "falsestart") oneri[i] = e; });
    }
  }

  function kesilsinMi(i) {
    if (elle.hasOwnProperty(i)) return elle[i];
    return !!oneri[i];
  }

  function duraksamaAnahtari(r) { return Number(r.start).toFixed(2); }

  // hamMi: kullanıcının koruduğu duraksamalar da dahil (inceleme listesindeki işaretsiz satırlar için)
  function kesimler(hamMi) {
    var removed = words.map(function (w, i) { return kesilsinMi(i); });
    var pause = el("tc-pause").value;
    var r = TC.buildCuts(words, removed, {
      maxPause: pause === "" ? null : Number(pause),
      clipStart: clip ? clip.clipStart : undefined,
      clipEnd: clip ? clip.clipEnd : undefined
    });
    if (hamMi) return r;
    return r.filter(function (x) {
      return !(x.reason === "pause" && korunanDuraksama.hasOwnProperty(duraksamaAnahtari(x)));
    });
  }

  function duraksamaDegistir(r, koru) {
    var k = duraksamaAnahtari(r);
    if (koru) korunanDuraksama[k] = { start: r.start, end: r.end };
    else delete korunanDuraksama[k];
  }

  function grupBul(gid) {
    if (!tk) return null;
    for (var i = 0; i < tk.groups.length; i++) if (tk.groups[i].id === gid) return tk.groups[i];
    return null;
  }

  // Grubun kelimelerindeki elle kararları silinir: grup kararı yeniden geçerli olur
  function grupElleTemizle(g) {
    g.takes.concat(g.cues).forEach(function (sid) {
      var s = tk.sents[sid];
      for (var k = s.a; k <= s.b; k++) delete elle[k];
    });
  }

  function cekimSec(g, sid) {
    grupSecim[grupAnahtari(g)] = { keep: sid, on: true };
    grupElleTemizle(g);
    yenidenSinifla();
    render();
  }

  // "Tekrar ×3  [1] [2] [3✓]  orta güven" satırı: grubun ilk çekiminden önce
  function grupSatiri(g) {
    var row = document.createElement("div");
    row.className = "tc-take-row" + (g.on ? "" : " off");
    var bas = document.createElement("span");
    bas.className = "tc-take-label";
    bas.setAttribute("data-i18n-ui", "");
    bas.textContent = (g.kind === "falsestart" ? "Yarım başlangıç" : "Tekrar") + " ×" + g.takes.length;
    row.appendChild(bas);
    g.takes.forEach(function (sid, n) {
      var take = document.createElement("span");
      take.className = "tc-take" + (sid === g.keep && g.on ? " keep" : "");
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tc-chip";
      chip.textContent = (n + 1) + (sid === g.keep ? " ✓" : "");
      chip.title = sid === g.keep ? (g.on ? "Tutulan çekim" : "Önerilen çekim — işaretsiz grup") : "Bu çekimi tut";
      chip.onclick = function () { cekimSec(g, sid); };
      var oyna = document.createElement("button");
      oyna.type = "button";
      oyna.className = "tc-play";
      oyna.textContent = "▶";
      oyna.title = "Yalnız bu çekimi dinle";
      oyna.onclick = function () { cekimDinle(sid, oyna); };
      take.appendChild(chip);
      take.appendChild(oyna);
      row.appendChild(take);
    });
    if (g.conf === "orta") {
      var rozet = document.createElement("span");
      rozet.className = "tc-conf";
      rozet.setAttribute("data-i18n-ui", "");
      rozet.textContent = "orta güven";
      rozet.title = g.on ? "Sen onayladın" : "Emin değiliz: işaretlemedik. Bir çekim seç ya da incelemede işaretle.";
      row.appendChild(rozet);
    }
    if (g.source === "llm") {
      var ai = document.createElement("span");
      ai.className = "tc-conf";
      ai.setAttribute("data-i18n-ui", "");
      ai.textContent = "AI";
      row.appendChild(ai);
    }
    return row;
  }

  function render() {
    var box = el("tc-words");
    box.innerHTML = "";
    var pause = el("tc-pause").value;
    var maxPause = pause === "" ? null : Number(pause);
    var frag = document.createDocumentFragment();
    var duraksamaKesimleri = {};
    kesimler(true).forEach(function (r) { if (r.reason === "pause") duraksamaKesimleri[duraksamaAnahtari(r)] = r; });
    var ilkCekim = {};
    if (tk) tk.groups.forEach(function (g) { ilkCekim[tk.sents[g.takes[0]].a] = g; });
    words.forEach(function (w, i) {
      if (ilkCekim[i]) frag.appendChild(grupSatiri(ilkCekim[i]));
      // kisaltilacak uzun duraksamayi gorunur kil
      if (maxPause && i > 0 && w.start - words[i - 1].end > maxPause) {
        var p = document.createElement("span");
        p.className = "tc-pause";
        p.setAttribute("data-i18n-ui", "");
        p.textContent = "⏸ " + (w.start - words[i - 1].end).toFixed(1) + " sn";
        var pk = duraksamaKesimleri[(Number(words[i - 1].end) + maxPause / 2).toFixed(2)];
        if (pk) {
          var korunan = korunanDuraksama.hasOwnProperty(duraksamaAnahtari(pk));
          p.className += korunan ? " kept" : "";
          p.title = korunan ? "Uzun duraksama — olduğu gibi kalacak. Tıkla: kısalt" : "Uzun duraksama — " + maxPause + " sn'ye kısaltılacak. Tıkla: olduğu gibi kalsın";
          (function (r0, k0) { p.onclick = function () { duraksamaDegistir(r0, !k0); render(); }; })(pk, korunan);
        } else {
          p.title = "Uzun duraksama — " + maxPause + " sn'ye kısaltılacak";
        }
        frag.appendChild(p);
      }
      var s = document.createElement("span");
      var kes = kesilsinMi(i);
      var cls = "tc-w";
      if (kes) cls += " " + (elle[i] === true && !oneri[i] ? "cut" : (oneri[i] || "cut"));
      else if (oneri[i]) cls += " kept";
      if (!kes && etiket[i] === "kept") cls += " retake-kept";
      s.className = cls;
      s.textContent = w.text;
      s.title = fmt(w.start - (clip ? clip.clipStart : 0)) + (oneri[i] ? " · öneri: " +
        ({ filler: "dolgu", repeat: "tekrar", soft: "ara söz", retake: "tekrar çekim", falsestart: "yarım başlangıç" }[oneri[i]]) : "");
      s.onclick = function () {
        elle[i] = !kesilsinMi(i);
        if (elle[i] === !!oneri[i]) delete elle[i];   // öneriyle ayni: elle kaydi gereksiz
        render();
      };
      frag.appendChild(s);
      frag.appendChild(document.createTextNode(" "));
    });
    box.appendChild(frag);
    inceleme();
    ozet();
  }

  /*
   * Tek inceleme listesi: kesilecek her parça bir satır (işaretli) + işaretlenmemiş
   * adaylar (orta güvenli gruplar, senaryo dışı cümleler) + kullanıcının işaretini
   * kaldırdığı parçalar (işaretsiz kalır, yeniden işaretlenebilir). İşaret elle[]'ye yazar.
   */
  function inceleme() {
    var box = el("tc-review");
    if (!box) return;
    box.innerHTML = "";
    var r = kesimler();
    var cut = words.map(function (w, i) { return kesilsinMi(i); });
    var satirlar = RT ? RT.reviewRows({ words: words, cut: cut, labels: oneri, elle: elle, cuts: r, res: tk }) :
      r.map(function (x) { return { type: "range", start: x.start, end: x.end, reason: x.reason === "pause" ? "duraksama" : "dolgu", checked: true, words: [] }; });
    // işareti kaldırılan kelime parçaları: kelimeler hâlâ kalıyorsa işaretsiz satır
    kaldirilan = kaldirilan.filter(function (e) { return e.words.every(function (i) { return !cut[i]; }); });
    kaldirilan.forEach(function (e) {
      satirlar.push({ type: "kaldirilan", start: e.start, end: e.end, reason: e.reason, checked: false, words: e.words });
    });
    // korunan duraksamalar: kesim hâlâ önerilse işaretsiz satır
    kesimler(true).forEach(function (x) {
      if (x.reason === "pause" && korunanDuraksama.hasOwnProperty(duraksamaAnahtari(x))) {
        satirlar.push({ type: "duraksama", start: x.start, end: x.end, reason: "duraksama", checked: false, words: [] });
      }
    });
    satirlar.sort(function (a, b) { return a.start - b.start; });
    el("tc-review-head").hidden = !satirlar.length;
    var frag = document.createDocumentFragment();
    var cs = clip ? clip.clipStart : 0;
    satirlar.forEach(function (row) {
      var d = document.createElement("div");
      d.className = "tc-rv" + (row.checked ? "" : " off");
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = row.checked;
      cb.setAttribute("data-i18n-ui", "");   // inceleme listesi kullanıcı içeriği: ipucu yine çevrilsin
      cb.title = row.checked ? "İşareti kaldır: bu parça kalsın" : "İşaretle: bu parça kesilsin";
      cb.onchange = function () { satirDegisti(row, cb.checked); };
      var neden = document.createElement("span");
      neden.className = "tc-reason r-" + row.reason;
      neden.setAttribute("data-i18n-ui", "");
      neden.textContent = NEDEN[row.reason] || row.reason;
      var zaman = document.createElement("button");
      zaman.type = "button";
      zaman.className = "tc-time link-btn";
      zaman.textContent = fmt(row.start - cs);
      zaman.title = "Oynatma kafasını buraya götür";
      zaman.onclick = function () { K.call("KS_setPlayerPosition", { sec: row.start }); };
      var metin = document.createElement("span");
      metin.className = "tc-rv-text";
      if (row.words.length) {
        metin.textContent = row.words.slice(0, 14).map(function (i) { return words[i].text; }).join(" ") + (row.words.length > 14 ? " …" : "");
      } else {
        metin.setAttribute("data-i18n-ui", "");
        metin.textContent = "⏸ " + (row.end - row.start).toFixed(1) + " sn";
      }
      d.appendChild(cb);
      d.appendChild(neden);
      d.appendChild(zaman);
      if (row.conf === "orta") {
        var rz = document.createElement("span");
        rz.className = "tc-conf"; rz.setAttribute("data-i18n-ui", "");
        rz.textContent = "orta güven";
        d.appendChild(rz);
      }
      d.appendChild(metin);
      frag.appendChild(d);
    });
    box.appendChild(frag);
  }

  function elleYaz(ws, deger) {
    ws.forEach(function (i) { elle[i] = deger; if (elle[i] === !!oneri[i]) delete elle[i]; });
  }

  // Satırın tüm kelimeleri AÇIK tek bir tekrar çekim grubunun atılan çekimlerinde mi? (grup döner)
  function atilanCekimGrubu(ws) {
    if (!tk || !ws.length) return null;
    var wi = RT.wordIndex(tk), gid = null;
    for (var n = 0; n < ws.length; n++) {
      var m = wi[ws[n]];
      if (!m || m.rol === "keep" || (gid !== null && m.group !== gid)) return null;
      gid = m.group;
    }
    var g = grupBul(gid);
    return g && g.on ? g : null;
  }

  function grupAcKapa(g, acik) {
    var sec = grupSecim[grupAnahtari(g)] || {};
    sec.on = acik;
    if (sec.keep == null) sec.keep = g.keep;
    grupSecim[grupAnahtari(g)] = sec;
    grupElleTemizle(g);
    yenidenSinifla();
  }

  function satirDegisti(row, isaretli) {
    if (row.type === "group") {
      var g = grupBul(row.gid);
      if (!g) return;
      grupAcKapa(g, isaretli);
    } else if (row.type === "offscript") {
      elleYaz(row.words, isaretli);
    } else if (row.type === "kaldirilan") {
      if (isaretli) {
        elleYaz(row.words, true);
        kaldirilan = kaldirilan.filter(function (e) { return e.words.join(",") !== row.words.join(","); });
      }
    } else if (row.words.length) {
      // tekrar çekim satırı: karar grubun (özet ve çipler de "kalıyor" desin), grup satırı işaretsiz kalır
      var tg = isaretli ? null : atilanCekimGrubu(row.words);
      if (tg) grupAcKapa(tg, false);
      else {
        elleYaz(row.words, isaretli);
        if (!isaretli) kaldirilan.push({ words: row.words.slice(), reason: row.reason, start: row.start, end: row.end });
      }
    } else {
      // yalnız duraksama (işaretsiz satır da yeniden işaretlenebilir)
      duraksamaDegistir(row, !isaretli);
    }
    render();
  }

  function ozet() {
    var r = kesimler();
    var kelime = words.filter(function (w, i) { return kesilsinMi(i); }).length;
    var sn = TC.totalSeconds(r);
    var dur = clip ? clip.clipEnd - clip.clipStart : 0;
    var n = RT && tk ? RT.droppedCount(tk) : 0;
    el("tc-summary").textContent = kelime + " kelime · " + r.length + " kesim · −" + sn.toFixed(1) + " sn" +
      (dur > 0 ? " (%" + (sn / dur * 100).toFixed(0) + ")" : "") + (n ? " · " + n + " tekrar çekim" : "");
    el("tc-apply").disabled = r.length === 0;
    el("tc-dinle-cuts").disabled = r.length === 0;
  }

  // Bellek içi önbellek anahtarı: klip + istenen dil (#cap-lang) + motor kimliği (disk önbelleği gibi)
  function klipAnahtari(c, dil, motor) {
    return c ? [c.mediaPath, Number(c.clipStart).toFixed(3), Number(c.clipEnd).toFixed(3), Number(c.inPoint || 0).toFixed(3),
      dil || "auto", motor || ""].join("|") : "";
  }

  function motorKimligi() {
    try { return KCaptions.motorKimligi ? String(KCaptions.motorKimligi() || "") : ""; } catch (e) { return ""; }
  }

  function sifirla() {
    words = []; oneri = []; etiket = []; tk = null; elle = {}; clip = null; sekans = "";
    grupSecim = {}; korunanDuraksama = {}; kaldirilan = []; aiGruplari = null; aiSurum++; aiMesgul = 0;
  }

  // zorla: "Yeniden yazıya dök" — disk ve bellek önbelleğini atla
  async function analyze(zorla) {
    zorla = zorla === true;
    // Pro: konusmadan kes (ucretsizde 3 deneme hakki; hak yalniz kesim uygulaninca duser)
    if (typeof Pro !== "undefined" && !Pro.gate("textcut", { deneme: true, yeniden: function () { analyze(zorla); } })) return;
    if (busy) return;
    if (!window.KCaptions || !KCaptions.transcribeWords) { status("Altyazı motoru yüklenemedi.", "bad"); return; }
    setBusy(true);
    sesiKapat();   // eski klibin onizlemesi yeni analizle karismasin
    status("Hazırlanıyor…");
    // Analizin BASLADIGI sekans: uzun transkripsiyon sirasinda sekans degisirse karismasin
    var basSekans = KApp.ctx().sequenceId || KApp.ctx().sequence || "";
    try {
      var arayuz = window.SufloI18n ? SufloI18n.getLang() : "tr";
      var dilSecimi = TC.promptLang(el("cap-lang") && el("cap-lang").value, "", arayuz);
      // bellek içi önbellek: aynı klip (politika/senaryo değişikliği yeniden yazıya dökmez).
      // Seçim Premiere'e TAZE sorulur: 2.5 sn'lik bağlam yoklaması eski klibi gösterebilir
      var istenenDil = (el("cap-lang") && el("cap-lang").value) || "auto";
      var sc = await K.call("KS_getSelectedClips");
      var secili = sc && sc.ok && sc.clips && sc.clips.length ? sc.clips[0] : null;
      var anahtar = secili ? klipAnahtari(secili, istenenDil, motorKimligi()) : "";
      var sonuc = null;
      if (!zorla && anahtar) {
        for (var b = 0; b < bellek.length; b++) if (bellek[b].anahtar === anahtar) { sonuc = bellek[b].sonuc; sonuc.fromCache = true; break; }
      }
      if (!sonuc) {
        var istek = {
          prompt: TC.fillerPrompt(dilSecimi),
          cache: zorla ? false : undefined,
          onStatus: function (m, c) { status(m, c); }
        };
        if (secili) istek.clip = secili;
        sonuc = await KCaptions.transcribeWords(istek);
        var a2 = klipAnahtari(sonuc.clip, istenenDil, sonuc.motor || motorKimligi());
        bellek = bellek.filter(function (x) { return x.anahtar !== a2; });
        bellek.push({ anahtar: a2, sonuc: sonuc });
        if (bellek.length > 6) bellek.shift();
      }
      sifirla();
      clip = sonuc.clip;
      sekans = basSekans;
      lang = sonuc.lang || arayuz;
      words = sonuc.words.map(function (w) { return { start: w.start, end: w.end, text: w.text, confidence: w.confidence }; });
      onbellektenMi = !!sonuc.fromCache;
      el("tc-cache").hidden = !onbellektenMi;
      if (!words.length) {
        el("tc-result").hidden = true; sesiKapat();
        status("Bu klipte konuşma bulunamadı.", "warn");
        return;
      }
      yenidenSinifla();
      status("");
      el("tc-result").hidden = false;
      render();
      var n = oneri.filter(Boolean).length;
      var g = tk ? RT.droppedCount(tk) : 0;
      KApp.toast(words.length + " kelime · " + n + " kesim önerisi" + (g ? " · " + g + " tekrar çekim" : ""), "good");
      if (el("tc-ai") && el("tc-ai").checked) aiGrupla();
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  /*
   * İsteğe bağlı AI geçişi: ~60 cümlelik parçalar sırayla; doğrulanmış gruplar
   * sezgisel sonuca eklenir (çakışmada sezgisel kazanır, AI grupları "orta").
   * Hata ya da 429: uyarı, sezgisel sonuç kalır. Geç gelen cevap başka klibe uygulanmaz.
   */
  async function aiGrupla() {
    if (aiMesgul || !RT || !retakeAcik() || !words.length) return;
    var cfg = null;
    try { cfg = KCaptions.chatConfig(); } catch (e0) { cfg = null; }
    if (!cfg) return;
    var benim = ++aiSurum, benimKlip = clip;
    aiMesgul = benim;
    var sents = RT.sentences(words, { lang: lang });
    var parcalar = RT.llmChunks(sents.length, 60, 5);
    var hepsi = [];
    try {
      for (var i = 0; i < parcalar.length; i++) {
        status("AI benzer anlatımları arıyor… " + (i + 1) + "/" + parcalar.length);
        var json = await KCaptions.chatCall(cfg, RT.llmRequest(sents, parcalar[i], cfg.model));
        if (benim !== aiSurum || clip !== benimKlip) return;   // klip değişti: bu cevap bayat
        var metin = json && json.choices && json.choices[0] && json.choices[0].message ? json.choices[0].message.content : "";
        hepsi = hepsi.concat(RT.parseLLM(metin, parcalar[i], sents));
      }
      aiGruplari = hepsi;
      yenidenSinifla();
      render();
      status("");
      var yeni = tk ? tk.groups.filter(function (g) { return g.source === "llm"; }).length : 0;
      KApp.toast(yeni ? "AI " + yeni + " grup daha buldu — incelemede işaretsiz duruyor" : "AI yeni bir grup bulmadı", yeni ? "good" : "");
    } catch (e) {
      if (benim === aiSurum) {
        status("");
        KApp.toast("AI gruplama yapılamadı — sezgisel sonuç geçerli. " + K.hataYardimi(e), "warn");
      }
    } finally {
      if (aiMesgul === benim) aiMesgul = 0;
    }
  }

  async function apply() {
    if (typeof Pro !== "undefined" && !Pro.gate("textcut", { deneme: true, yeniden: apply })) return;
    // Premiere yüzlerce kesimde yavaşlar: en fazla 300 (yakın kesimler birleşir, en kısalar kalır)
    // birleşme yalnız arasında tutulan kelime olmayan boşluklarda (konuşma yutulmaz)
    var tutulan = words.filter(function (w, i) { return !kesilsinMi(i); });
    var sinirli = TC.capCuts(kesimler(), { max: 300, mergeGap: 0.25, keep: tutulan });
    var r = sinirli.ranges.map(function (x) { return { start: x.start, end: x.end }; });
    if (!r.length) return;
    if (sinirli.merged || sinirli.dropped) {
      KApp.toast("300+ kesim birleştirildi" + (sinirli.dropped ? " — en kısa " + sinirli.dropped + " kesim atlandı" : ""), "warn");
    }
    sesiKapat();
    // Bayat olabilecek yoklama yerine Premiere'e taze sor
    var tazeCtx = await K.call("KS_getContext");
    var aktif = tazeCtx.ok ? (tazeCtx.sequenceId || tazeCtx.sequence || "") : "";
    if (sekans && aktif && aktif !== sekans) {
      status("Bu kesimler başka bir sekans için. O sekansı aç ya da klibi yeniden yazıya dök.", "warn");
      return;
    }
    el("tc-apply").disabled = true;
    status("Uygulanıyor…");
    try {
      var arg = { ranges: r, removeMode: "ripple", cloneFirst: target === "clone" };
      // kopya sekansın adı: "<sekans> — Suflo Temiz"; dokunulmamış özgün sekans yedektir
      // (ad Premiere'e veri olarak gider, çevirmen görmez: arayüz diliyle burada kurulur)
      if (target === "clone" && tazeCtx.ok && tazeCtx.sequence) {
        var ek = window.SufloI18n && SufloI18n.getLang && SufloI18n.getLang() === "en" ? " — Suflo Clean" : " — Suflo Temiz";
        arg.cloneName = String(tazeCtx.sequence) + ek;
      }
      var res = await K.call("KS_applyCuts", arg, 900000);
      if (res.ok) {
        if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("textcut", KApp.toast);   // deneme: yalniz basarida
        status("");
        var msg = res.newSeq ? "✂ Kopya sekansta uygulandı: " + res.newSeq : "✂ " + res.removed + " parça silindi";
        if (res.rippleFallback) {
          status("⚠ Bazı track'ler aralığı tam kaplamıyor — senkron bozulmasın diye kesimler boşluk bırakılarak silindi.", "warn");
          KApp.toast(msg + " (boşluk modunda)", "warn");
        } else {
          KApp.toast(msg, "good");
        }
        // Timeline degisti: eski zamanlar artik gecersiz
        el("tc-result").hidden = true; sesiKapat();
        sifirla();
        bellek = [];
      } else {
        status("✕ " + res.error, "bad");
      }
    } finally {
      el("tc-apply").disabled = false;
    }
  }

  // "Dinle": kesimler uygulanmis gibi sesi panelde cal (timeline'a dokunmaz)
  var oynatici = window.KDinle ? window.KDinle("tc-audio") : null;
  function sesiKapat() { if (oynatici) oynatici.kapat(); }

  async function dugmeyleCal(btn, o, sonra) {
    btn.disabled = true;
    // özgün Türkçe etiket: iş sürerken arayüz dili değişse de doğru dile döner (çevirmen çevirir)
    var eskiYazi = window.SufloI18n && SufloI18n.orig ? SufloI18n.orig(btn) : btn.textContent;
    btn.textContent = "Hazırlanıyor…";
    var benimKlip = clip;
    o.gecerli = function () { return clip === benimKlip; };
    try {
      var r = await oynatici.cal(o);
      if (sonra) sonra(r);
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      btn.disabled = false;
      btn.textContent = eskiYazi;
    }
  }

  function dinle() {
    if (!clip || !words.length || !oynatici) return;
    dugmeyleCal(el("tc-dinle"), { mediaPath: clip.mediaPath, inPoint: clip.inPoint, dur: clip.dur, cuts: kesimler(), clip: clip }, function (r) {
      if (r.ok && r.kisaltildi) status("Uzun klip: ilk " + Math.round(oynatici.MAX_SN / 60) + " dakika dinletiliyor.");
    });
  }

  // Yalnız kesilecek parçaları art arda çal (en fazla 300 kesim)
  function dinleKesilenler() {
    if (!clip || !words.length || !oynatici) return;
    var r = kesimler();
    if (!r.length) return;
    dugmeyleCal(el("tc-dinle-cuts"), { mediaPath: clip.mediaPath, inPoint: clip.inPoint, dur: clip.dur, cuts: r, clip: clip, only: true }, function (s) {
      if (s.ok && s.kisaltildi) status("Çok kesim var: yalnız ilk " + oynatici.MAX_SN + " kesim dinletiliyor.");
    });
  }

  // Tek bir çekimi çal: klibin o aralığı alt klip gibi okunur
  function cekimDinle(sid, btn) {
    if (!clip || !tk || !oynatici) return;
    var s = tk.sents[sid];
    var tl = clip.clipEnd - clip.clipStart;
    var hiz = clip.dur > 0 && tl > 0 ? tl / clip.dur : 1;
    var a = Math.max(clip.clipStart, s.start - 0.1), b = Math.min(clip.clipEnd, s.end + 0.15);
    var kaynakSure = (b - a) / hiz;
    dugmeyleCal(btn, {
      mediaPath: clip.mediaPath, inPoint: Number(clip.inPoint) + (a - clip.clipStart) / hiz, dur: kaynakSure,
      cuts: [], clip: { clipStart: a, clipEnd: b, dur: kaynakSure }
    });
  }

  function init() {
    if (!TC) return;
    el("tc-dinle").addEventListener("click", dinle);
    el("tc-dinle-cuts").addEventListener("click", dinleKesilenler);
    el("tc-analyze").addEventListener("click", function () { analyze(false); });
    el("tc-retranscribe").addEventListener("click", function () { analyze(true); });
    el("tc-apply").addEventListener("click", apply);
    el("tc-reset").addEventListener("click", function () {
      elle = {}; grupSecim = {}; korunanDuraksama = {}; kaldirilan = [];
      if (words.length) yenidenSinifla();
      render();
    });
    ["tc-filler", "tc-repeat", "tc-soft", "tc-retake"].forEach(function (id) {
      el(id).addEventListener("change", function () { if (words.length) { yenidenSinifla(); render(); } });
    });
    // politika değişince kullanıcının çekim seçimleri politikaya bırakılır (açık/kapalı kararı kalır)
    el("tc-policy").addEventListener("change", function () {
      Object.keys(grupSecim).forEach(function (k) { delete grupSecim[k].keep; });
      if (words.length) { yenidenSinifla(); render(); }
    });
    var senaryoZaman = null;
    el("tc-script").addEventListener("input", function () {
      clearTimeout(senaryoZaman);
      senaryoZaman = setTimeout(function () { if (words.length) { yenidenSinifla(); render(); } }, 400);
    });
    el("tc-ai").addEventListener("change", function () {
      if (el("tc-ai").checked) { if (words.length) aiGrupla(); }
      else {
        aiSurum++; aiMesgul = 0;
        if (aiGruplari) { aiGruplari = null; if (words.length) { yenidenSinifla(); render(); } }
      }
    });
    // Ayarlar'da ek dolgular kaydedildi: açık inceleme yeniden sınıflansın
    document.addEventListener("suflo:dolgu", function () { if (words.length) { yenidenSinifla(); render(); } });
    document.addEventListener("suflo:ayar", refreshButton);
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
        el("tc-result").hidden = true; sesiKapat();
        sifirla();
      }
    });
    refreshButton();
  }

  return { init: init };
})();
