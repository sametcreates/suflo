/*
 * Suflo — Altyazı modülü
 * Kapsam: seçili klip / in-out aralığı / tüm sequence.
 * Motor: yerel whisper.cpp (offline) veya OpenAI-uyumlu API (Groq/OpenAI/özel).
 * Stil: noktalama, BÜYÜK/küçük harf (TR/AZ duyarlı), satır uzunluğu.
 */
window.KCaptions = (function () {
  "use strict";

  var segments = [];   // { start, end, text } — sequence zamanı, HAM metin
  var busy = false;
  var scope = "clip";  // clip | inout | entire
  var trackSel = {};   // ses katmanı index -> seçili mi (varsayılan: true)
  var lastTrackCount = -1;

  function el(id) { return document.getElementById(id); }

  /* ---------------- Geri alma yığını + taslak kaydı ---------------- */

  var undoStack = [];
  var redoStack = [];
  var UNDO_MAX = 25;
  var draftTimer = null;

  function snapshot(etiket) {
    undoStack.push({ segs: JSON.stringify(segments), etiket: etiket || "" });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0;
    refreshUndoUI();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push({ segs: JSON.stringify(segments), etiket: "" });
    var st = undoStack.pop();
    segments = JSON.parse(st.segs);
    render();
    refreshUndoUI();
    saveDraftSoon();          // diskteki taslak ekrandakiyle aynı kalsın
    KApp.toast(st.etiket ? "Geri alındı: " + st.etiket : "Geri alındı");
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push({ segs: JSON.stringify(segments), etiket: "" });
    segments = JSON.parse(redoStack.pop().segs);
    render();
    refreshUndoUI();
    saveDraftSoon();
  }

  function refreshUndoUI() {
    var u = el("cap-undo"), r = el("cap-redo");
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
  }

  // Taslağı diske yaz — panel kapanırsa iş kaybolmaz
  function writeDraft() {
    if (!segments.length) return;
    var ctx = KApp.ctx();
    K.saveDraft({
      segments: segments,
      sequence: ctx.sequence || "",
      scope: scope,
      ts: Date.now()
    });
  }
  function cancelDraft() { if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; } }
  // uzun iş bitti (transkript, içe alma, çeviri): beklemeden yaz
  function saveDraftNow() { cancelDraft(); writeDraft(); }
  // tuş vuruşu: debounce
  function saveDraftSoon() {
    cancelDraft();
    draftTimer = setTimeout(function () { draftTimer = null; writeDraft(); }, 1200);
  }

  // Kurtarma teklifi artık geçersiz: ekranda taze iş var ya da taslak silindi
  function hideRestore() { var b = el("cap-restore"); if (b) b.hidden = true; }

  function restoreDraft(d) {
    // Ekranda iş varsa üzerine yazmadan önce anlık görüntü al — Ctrl+Z geri getirsin
    if (segments.length) snapshot("taslak kurtarma");
    else { undoStack.length = 0; redoStack.length = 0; }
    segments = JSON.parse(JSON.stringify(d.segments));   // taslak nesnesini takma adla mutasyona uğratma
    clearRevert();                                       // eski dokümanın metinleri bu satırlara ait değil
    el("cap-result").hidden = false;
    render();                                            // önce render, sonra etiket (render eziyor)
    el("cap-result-info").textContent = segments.length + " satır · kurtarıldı";
    refreshUndoUI();
  }

  // panelle birlikte gelen WAV export presetleri (once 16 kHz, olmazsa 48 kHz)
  function bundledEpr() {
    try {
      // SystemPath global DEĞİL — CSInterface üzerinden erişilir
      var root = K.cs.getSystemPath(CSInterface.SystemPath.EXTENSION);
      if (root) {
        // Windows'ta Adobe exporter karisik ayraci reddediyor (Error code 10) — hepsi ters bolu
        // olmali. macOS'ta ters bolu YOLU BOZAR: orada egik cizgi kalmali.
        var ay = K.MAC ? "/" : "\\";
        if (!K.MAC) root = root.replace(/\//g, "\\");
        return [root + ay + "jsx" + ay + "presets" + ay + "wav16k.epr",
                root + ay + "jsx" + ay + "presets" + ay + "wav48k.epr"];
      }
    } catch (e) { K.log("[altyazı] gömülü preset yolu alınamadı: " + e); }
    return [];
  }

  function status(msg, cls) {
    var e = el("cap-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
    if (cls === "bad" && msg) K.log("[altyazı] " + msg);
  }

  /* ---------------- Kurulum durumu ---------------- */

  function engineReady() {
    var s = K.settings();
    if (s.provider === "local") return !!KEngine.activeModel() && !!K.whisperLocal();
    return !!s.apiKey;
  }

  function refreshSetup() {
    el("cap-setup").hidden = engineReady();

    /*
     * ffmpeg olmadan bulut motoru da calismaz. Kullanici Groq anahtarini yapistirip
     * "hazirim" saniyordu, sonra ilk denemede duvara carpiyordu. Anahtar alanina
     * dokunmadan once eksigi soyluyoruz; kurulum artik otomatik ama beklenmedik
     * bir indirme kullaniciyi sasirtmasin.
     */
    var ipucu = el("cap-ffmpeg-ipucu");
    if (ipucu) {
      K.findFfmpeg().then(function (ff) {
        ipucu.hidden = !!ff;
      }).catch(function () {});
    }
    // macOS'ta motor Homebrew'dan gelir (whisper.cpp resmi mac ikilisi yayınlamıyor):
    // kullanıcı "indir & kur" deyip anlamsız bir hata almasın, ne olacağını baştan bilsin
    if (K.MAC) {
      var t = el("cap-setup-text");
      var b = el("cap-local-install");
      var brewVar = !!K.brewYolu();
      if (t) {
        t.innerHTML = brewVar
          ? "<strong>Altyazı için bir motor gerek.</strong> Mac'te motoru Homebrew kurar " +
            "(<code>brew install whisper-cpp</code>) — hesap, anahtar, internet aboneliği yok. " +
            "Apple Silicon'da Metal ile hızlanır."
          : "<strong>Altyazı için bir motor gerek.</strong> Mac'te yerel motor <b>Homebrew</b> " +
            "ile kurulur, ama Homebrew bulunamadı. brew.sh'taki tek satırlık komutu Terminal'de " +
            "çalıştırıp paneli yeniden aç — ya da aşağıdan ücretsiz Groq anahtarıyla buluttan başla.";
      }
      if (b) {
        b.textContent = brewVar ? "Yerel motoru kur (Homebrew)" : "Homebrew gerekli";
        b.disabled = !brewVar;
      }
    }
    refreshButton();
  }

  function refreshButton() {
    var ctx = KApp.ctx();
    var needSel = scope === "clip";
    var ready = engineReady() && (needSel ? !!ctx.sel : !!ctx.hasSeq);
    el("cap-go").disabled = busy || !ready;
    // coklu secimde CTA etiketi klip sayisini gostersin
    if (scope === "clip") {
      el("cap-go-scope").textContent = (ctx.selCount > 1)
        ? "Seçili klipler (" + ctx.selCount + ")"
        : "Seçili klip";
    }
    // is surerken ilerleme yazisini talimatlarla ezme
    if (busy || !ctx.connected) return;
    if (!engineReady()) {
      status(K.settings().provider === "local"
        ? "Yerel motor bulunamadı — Ayarlar'dan kur ya da motor değiştir."
        : "API anahtarı gerekli — yukarıdan gir ya da yerel motoru kur.");
    } else if (needSel && !ctx.sel) status("Timeline'da konuşma içeren bir klip seç.");
    else if (!needSel && !ctx.hasSeq) status("Önce bir sequence aç.");
    else {
      // hata mesajini koru, yalnizca talimat metinlerini temizle
      if (el("cap-status").className.indexOf("bad") === -1) status("");
    }
  }

  /* ---------------- Sağlayıcı ---------------- */

  function providerConfig() {
    var s = K.settings();
    if (s.provider === "openai") {
      return { url: "https://api.openai.com/v1/audio/transcriptions", model: "whisper-1", key: s.apiKey };
    }
    if (s.provider === "custom") {
      return { url: s.endpoint, model: "whisper-1", key: s.apiKey };
    }
    return {
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      model: "whisper-large-v3-turbo",
      key: s.apiKey
    };
  }

  /* ---------------- Ses hazırlama ---------------- */

  // Kaynak dosyadan (klip) ya da hazır WAV'dan (sequence exportu) motorun istediği formata çevir
  async function convertAudio(srcPath, opts) {
    var ff = await K.findFfmpeg();
    if (!ff) {
      /*
       * Kullaniciyi Ayarlar'a yollayip yalniz birakmak yerine burada kuruyoruz:
       * "ffmpeg bulunamadi - Ayarlar'dan kur" mesaji, cogu kisinin vazgectigi yerdi.
       */
      status("ffmpeg kuruluyor… (bir kerelik, ses dönüştürme için gerekli)");
      try {
        await KEngine.installFfmpeg(function (m) { status(m); });
        ff = await K.findFfmpeg(true);
      } catch (eF) {
        throw new Error("ffmpeg kurulamadı: " + (eF && eF.message ? eF.message : eF) +
          " — Ayarlar > ffmpeg bölümünden elle bir yol gösterebilirsin.");
      }
      if (!ff) throw new Error("ffmpeg kurulamadı — Ayarlar > ffmpeg bölümünden elle yol göster.");
    }
    var wav = opts.wav;
    var out = K.path.join(K.tmpDir(), "cap_" + Date.now() + (wav ? ".wav" : ".mp3"));
    var args = ["-y"];
    if (opts.ss !== undefined) args = args.concat(["-ss", String(opts.ss), "-t", String(opts.t)]);
    args = args.concat(["-i", srcPath, "-vn", "-ac", "1", "-ar", "16000"]);
    if (wav) {
      args = args.concat(["-c:a", "pcm_s16le"]);
    } else {
      // 24 MB API sınırına sığması için uzun seslerde bitrate düşür
      var br = (opts.durHint && opts.durHint > 2700) ? "32k" : "64k";
      args = args.concat(["-b:a", br]);
    }
    args.push(out);
    var r = await K.run(ff, args, { timeout: 900000 });
    if (r.code !== 0 || !K.fs.existsSync(out)) {
      throw new Error("Ses hazırlanamadı: " + (r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 180));
    }
    if (!wav) {
      var mb = K.fs.statSync(out).size / 1048576;
      if (mb > 24) {
        try { K.fs.unlinkSync(out); } catch (e) {}
        throw new Error("Ses çok uzun (" + mb.toFixed(0) + " MB). Yerel motoru kullan ya da parça parça al.");
      }
    }
    return out;
  }

  /* ---------------- Motorlar ---------------- */

  async function transcribeLocal(audioPath, wordLevel) {
    var lw = K.whisperLocal();
    if (!lw) throw new Error("Yerel motor kurulu değil — Ayarlar'dan kur.");
    var outBase = audioPath.replace(/\.wav$/i, "") + "_w";
    var lang = el("cap-lang").value || "auto";
    var threads = 4;
    try { threads = Math.max(2, Math.min(8, K.os.cpus().length - 2)); } catch (e) {}

    // motor katmanı: VAD (sessizlik atlama) + beam search + karaoke bayrakları
    var built = KEngine.buildArgs({
      model: lw.model,
      audio: audioPath,
      lang: lang,
      outBase: outBase,
      threads: threads,
      wordLevel: wordLevel
    });
    var args = built.args;
    K.log("yerel motor: " + (KEngine.installedBuild() === "cuda" ? "GPU" : "CPU") +
      ", VAD " + (built.vad ? "acik" : "kapali") +
      ", model " + String(lw.model).replace(/^.*[\\\/]/, ""));

    var r = await K.run(lw.exe, args, {
      timeout: 7200000,
      onStderr: function (s) {
        var m = s.match(/progress\s*=\s*(\d+)%/);
        if (m) status("Transkribe ediliyor… %" + m[1] + " (yerel)");
      }
    });
    var jsonPath = outBase + ".json";
    if (!K.fs.existsSync(jsonPath)) {
      // çıkış kodu mesajda kalsın: hata rehberi eksik DLL / eski CPU kalıplarını kodla tanır
      throw new Error("Yerel motor çıktı üretmedi (kod=" + r.code + "): " +
        (r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 180));
    }
    var parsed = JSON.parse(K.fs.readFileSync(jsonPath, "utf8").toString());
    try { K.fs.unlinkSync(jsonPath); } catch (e2) {}
    var segs = (parsed.transcription || []).map(function (t) {
      var s = t.offsets ? t.offsets.from / 1000 : NaN;
      var e = t.offsets ? t.offsets.to / 1000 : NaN;
      // offsets bozuksa timestamps dizgesinden coz ("00:00:01,380")
      if ((!isFinite(s) || (s === 0 && e === 0)) && t.timestamps && t.timestamps.from) {
        s = tcParse(t.timestamps.from);
        e = tcParse(t.timestamps.to);
      }
      return { start: s || 0, end: e || 0, text: String(t.text || "").trim() };
    });
    if (wordLevel) {
      K.log("yerel kelime modu: " + segs.length + " parça, ilk3=" +
        segs.slice(0, 3).map(function (x) { return x.start.toFixed(2); }).join(","));
    }
    return segs;
  }

  /*
   * "00:00:01,380" · "00:00:04.000 align:start" · "01:23.500" -> saniye.
   * Sona kadar eşleşme aranmaz: WebVTT zaman satırının ardına cue ayarları
   * (align/position/line/size) eklenebiliyor, bunlar zamanı bozmamalı.
   */
  function tcParse(t) {
    var s = String(t).trim();
    var m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
    // saat alanı olmayan biçim (mm:ss.mmm) — VTT kısa biçimi ve elle düzenlemede yaygın
    var m2 = s.match(/^(\d+):(\d+)[,.](\d+)/);
    if (m2) return (+m2[1]) * 60 + (+m2[2]) + (+m2[3]) / 1000;
    // milisaniyesiz biçimler
    var m3 = s.match(/^(\d+):(\d+):(\d+)/);
    if (m3) return (+m3[1]) * 3600 + (+m3[2]) * 60 + (+m3[3]);
    var m4 = s.match(/^(\d+):(\d+)/);
    if (m4) return (+m4[1]) * 60 + (+m4[2]);
    return 0;
  }

  var VARLIKLAR = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

  /*
   * İçe aktarılan altyazıdaki biçimlendirmeyi temizle. Sıra önemli: ÖNCE etiketler
   * silinir, SONRA varlıklar çözülür — tersi olursa yazarın bilerek kaçırdığı
   * "&lt;b&gt;" metni etikete dönüşüp silinir.
   */
  function temizleEtiket(t) {
    var s = String(t || "");
    s = s.replace(/\{\\[^}]*\}/g, "");        // ASS/SSA override blokları: {\an8}, {\pos(..)}
    s = s.replace(/<[^>]+>/g, "");            // VTT/SRT etiketleri: <v Ad>, <i>, <c.sinif>, <b>
    s = s.replace(/&#x([0-9a-fA-F]+);/g, function (_, h) {
      return String.fromCharCode(parseInt(h, 16));
    });
    s = s.replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); });
    s = s.replace(/&([a-zA-Z]+);/g, function (tam, ad) {
      var v = VARLIKLAR[ad.toLowerCase()];
      return v === undefined ? tam : v;
    });
    return s.replace(/\s+/g, " ").trim();
  }

  // Satırları zamana göre sırala (elle düzenleme ve kaydırma sonrası şart)
  function sortSegments() {
    segments.sort(function (a, b) { return a.start - b.start; });
  }

  function apiError(status, body) {
    if (status === 401) return new Error("API anahtarı geçersiz — Ayarlar'dan kontrol et.");
    if (status === 429) return new Error("API kotası doldu — biraz bekleyip tekrar dene ya da yerel motora geç.");
    return new Error("API " + status + ": " + String(body).slice(0, 160));
  }

  async function transcribeCloud(audioPath, durHint, wordLevel) {
    var cfg = providerConfig();
    if (!cfg.url) throw new Error("Endpoint tanımsız — Ayarlar'a bak.");
    var fields = { model: cfg.model, response_format: "verbose_json" };
    if (wordLevel) fields["timestamp_granularities[]"] = ["word", "segment"];
    var lang = el("cap-lang").value;
    if (lang) fields.language = lang;
    var buf = K.fs.readFileSync(audioPath);

    var json;
    if (K.nodeOK) {
      var r = await K.httpUpload(cfg.url, { "Authorization": "Bearer " + cfg.key },
        fields, buf, "audio.mp3", "audio/mpeg");
      if (r.status === 0) throw new Error("Bağlantı hatası: " + String(r.body).slice(0, 160));
      if (r.status < 200 || r.status >= 300) throw apiError(r.status, r.body);
      try { json = JSON.parse(r.body); }
      catch (e) { throw new Error("API yanıtı okunamadı: " + String(r.body).slice(0, 120)); }
    } else {
      var form = new FormData();
      form.append("file", new Blob([new Uint8Array(buf)], { type: "audio/mpeg" }), "audio.mp3");
      for (var k in fields) {
        if (fields[k] instanceof Array) {
          for (var fi = 0; fi < fields[k].length; fi++) form.append(k, fields[k][fi]);
        } else form.append(k, fields[k]);
      }
      var res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Authorization": "Bearer " + cfg.key },
        body: form
      });
      if (!res.ok) throw apiError(res.status, await res.text());
      json = await res.json();
    }
    // karaoke: kelime dizisi varsa onu kullan (word alanı "word", segment alanı "text")
    if (wordLevel && json.words && json.words.length) {
      var ws = json.words.map(function (w) {
        return { start: Number(w.start) || 0, end: Number(w.end) || 0, text: String(w.word || "").trim() };
      });
      K.log("bulut kelime modu: " + ws.length + " kelime, ilk3=" +
        ws.slice(0, 3).map(function (x) { return x.start.toFixed(2); }).join(","));
      return ws;
    }
    if (wordLevel) {
      K.log("bulut kelime zamanı DÖNMEDİ (words alanı yok) — segment fallback");
    }
    var raw = json.segments || [];
    if (raw.length === 0 && json.text) {
      raw = [{ start: 0, end: durHint || 5, text: json.text }];
    }
    return raw.map(function (s) {
      return { start: Number(s.start), end: Number(s.end), text: String(s.text || "").trim() };
    });
  }

  /* ---------------- Temizlik + bölme ---------------- */

  // Whisper'ın bilinen halüsinasyonlarını süz
  function cleanSegments(segs) {
    var out = [];
    var junk = /^(altyaz[ıi]\s*m\.?\s*k\.?|abone olmay[ıi] unutmay[ıi]n)$/i;
    var lastText = "", repeat = 0;
    for (var i = 0; i < segs.length; i++) {
      var t = segs[i].text;
      if (!t) continue;
      var norm = t.toLowerCase().replace(/[.,!?;:…]/g, "").replace(/\s+/g, " ").trim();
      if (!norm) continue; // sadece noktalamadan olusan segment ("...")
      if (junk.test(norm)) continue;
      if (norm === lastText) {
        repeat++;
        if (repeat >= 2) continue; // 3+ kez aynı satır: takılma, at
      } else { repeat = 0; }
      lastText = norm;
      out.push(segs[i]);
    }
    return out;
  }

  /* ---------------- Karaoke ---------------- */

  // kelime cue'ları: her kelime kendi zamanında, bir sonrakiyle çakışmadan
  function karaokeWords(words) {
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var end = Math.max(w.end, w.start + 0.12);
      if (words[i + 1] && end > words[i + 1].start) end = words[i + 1].start;
      if (end <= w.start) end = w.start + 0.05;
      out.push({ start: w.start, end: end, text: w.text });
    }
    return out;
  }

  // birikimli karaoke: satır kelime kelime dolar (n kelimede ya da uzun boşlukta sıfırlanır)
  function karaokeCumulative(words, n) {
    var out = [];
    var line = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var prev = words[i - 1];
      if (line.length >= n || (prev && w.start - prev.end > 1.2)) line = [];
      line.push(w.text);
      var end = Math.max(w.end, w.start + 0.12);
      if (words[i + 1] && end > words[i + 1].start) end = words[i + 1].start;
      if (end <= w.start) end = w.start + 0.05;
      out.push({ start: w.start, end: end, text: line.join(" ") });
    }
    return out;
  }

  // kelime modu: her satırda en fazla n kelime, süre orantılı bölünür
  function splitWords(segs, n) {
    var out = [];
    segs.forEach(function (s) {
      var words = String(s.text || "").trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      var pieces = Math.ceil(words.length / n);
      var dur = s.end - s.start;
      var step = dur / pieces;
      for (var i = 0; i < pieces; i++) {
        out.push({
          start: s.start + step * i,
          end: s.start + step * (i + 1),
          text: words.slice(i * n, (i + 1) * n).join(" ")
        });
      }
    });
    return out;
  }

  /*
   * Whisper (özellikle VAD açıkken) bir cue'nun sonunu sonraki konuşma başlayana
   * kadar uzatabiliyor: 3 saniyelik cümle 17 saniye ekranda kalıyor.
   * Metnin okunması için gereken makul süreyi aşan sonları kırp.
   */
  function trimOverlongCues(segs) {
    var GAP = 0.12;
    return segs.map(function (s, i) {
      var chars = s.text.length;
      // ~13 karakter/sn okuma hızı + 0.7 sn tampon, en az 1.2 sn
      var makul = Math.max(1.2, chars / 13 + 0.7);
      var dur = s.end - s.start;
      if (dur > makul * 1.8) {
        var yeni = s.start + makul;
        var next = segs[i + 1];
        if (next && yeni > next.start - GAP) yeni = Math.max(s.start + 0.5, next.start - GAP);
        return { start: s.start, end: yeni, text: s.text };
      }
      return s;
    });
  }

  function splitLong(segs, maxChars, maxDur) {
    var out = [];
    segs.forEach(function (s) {
      var text = String(s.text || "").trim();
      var dur = s.end - s.start;
      if (!text) return;
      if (text.length <= maxChars && dur <= maxDur) { out.push(s); return; }
      var pieces = Math.ceil(Math.max(text.length / maxChars, dur / maxDur));
      var words = text.split(/\s+/);
      var per = Math.ceil(words.length / pieces);
      var acc = [];
      for (var i = 0; i < pieces; i++) acc.push(words.slice(i * per, (i + 1) * per).join(" "));
      acc = acc.filter(Boolean);
      var step = dur / acc.length;
      acc.forEach(function (w, i) {
        out.push({ start: s.start + step * i, end: s.start + step * (i + 1), text: w });
      });
    });
    return out;
  }

  /* ---------------- Terim sözlüğü ---------------- */

  /*
   * Whisper Türkçe'de marka/kişi adlarını ve jargonu tutarlı biçimde yanlış yazar.
   * Sözlük transkripsiyon SONRASI çalışır — dil algılamayı ve çıktıyı bozmaz,
   * deterministiktir, kullanıcı sonucu görüp kuralı düzeltebilir.
   * Biçim: her satır "yanlış => doğru"
   */
  function parseGlossary(text) {
    var out = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var m = line.split("=>");
      if (m.length !== 2) return;
      var from = m[0].trim(), to = m[1].trim();
      if (from) out.push({ from: from, to: to });
    });
    return out;
  }

  function glossaryText() {
    var g = K.settings().glossary || [];
    return g.map(function (r) { return r.from + " => " + r.to; }).join("\n");
  }

  /*
   * Harf/rakam sınırı testi. Unicode özellik kaçışları (\p{L}) Chromium 64+ ister; REGEX
   * LİTERALİ olarak yazılırsa eski CEF'te ayrıştırma anında SyntaxError verir ve tüm modül
   * düşer (panel bomboş açılır). new RegExp ile kurulunca hata yakalanabilir hale gelir.
   */
  var HARF = (function () {
    try { return new RegExp("[\\p{L}\\p{N}]", "u"); }
    catch (eU) {
      // eski CEF yedegi: carpma (00D7) ve bolme (00F7) isaretleri dislanir
      return new RegExp("[0-9A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F" +
        "\\u0370-\\u1FFF\\u2C00-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD]");
    }
  })();

  // Türkçe-duyarlı kelime bazlı değiştirme (İ/ı eşleşmesi doğru çalışır)
  function trReplace(text, from, to) {
    var loc = styleLocale() || "tr";
    var lowText = text.toLocaleLowerCase(loc);
    var lowFrom = from.toLocaleLowerCase(loc);
    if (lowText.indexOf(lowFrom) === -1) return text;
    var out = "";
    var i = 0;
    var harf = HARF;
    while (i < text.length) {
      if (lowText.startsWith(lowFrom, i)) {
        var oncesi = i === 0 ? "" : text[i - 1];
        var sonrasi = text[i + from.length] || "";
        var sinirOK = (!oncesi || !harf.test(oncesi)) && (!sonrasi || !harf.test(sonrasi));
        if (sinirOK) { out += to; i += from.length; continue; }
      }
      out += text[i];
      i++;
    }
    return out;
  }

  function applyGlossary(segs) {
    if (typeof Pro !== "undefined" && !Pro.isPro()) return segs;             // Pro: sozluk (sessiz atla)
    var rules = K.settings().glossary || [];
    if (!rules.length) return segs;
    var n = 0;
    segs.forEach(function (s) {
      var before = s.text;
      rules.forEach(function (r) { s.text = trReplace(s.text, r.from, r.to); });
      if (s.text !== before) n++;
    });
    if (n) K.log("sozluk: " + n + " satirda duzeltme yapildi");
    return segs;
  }

  /* ---------------- Şablonlar + tercih kalıcılığı ---------------- */

  /*
   * Şablon = metin kuralları + görünüm. Görünüm de dahil olmalı: kullanıcı
   * "Reels" seçince Reels gibi görünmesini bekliyor, yalnız satır uzunluğunun
   * değişmesini değil.
   */
  var PRESETS = {
    yt: {
      maxlen: "c42", kase: "normal", punct: true,
      stil: { font: "Arial", boyut: 64, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#ffe14d", kontur: 4, konum: 2, kutu: false, animasyon: "yok" }
    },
    reels: {
      // Hormozi görünümü: satır sabit durur, okunan kelime sarıya döner
      maxlen: "k1", kase: "upper", punct: false,
      stil: { font: "Anton", boyut: 96, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#ffe14d", kontur: 6, konum: 5, kutu: false, animasyon: "vurgu" }
    },
    karaoke: {
      maxlen: "k1", kase: "upper", punct: false,
      stil: { font: "Archivo Black", boyut: 92, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#8b7cf6", kontur: 6, konum: 5, kutu: false, animasyon: "karaoke" }
    },
    pop: {
      // kelimeler tek tek büyüyerek gelir
      maxlen: "k1", kase: "upper", punct: false,
      stil: { font: "Bebas Neue", boyut: 108, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#ffe14d", kontur: 5, konum: 5, kutu: false, animasyon: "pop" }
    },
    enerjik: {
      // Bungee + zıplama: çocuk/eğlence içerikleri
      maxlen: "k1", kase: "upper", punct: false,
      stil: { font: "Bungee", boyut: 76, renk: "#ffe14d", konturRenk: "#1a1a2e",
              vurguRenk: "#ffffff", kontur: 6, konum: 5, kutu: false, animasyon: "bounce" }
    },
    doc: {
      maxlen: "c60", kase: "normal", punct: true,
      stil: { font: "Georgia", boyut: 54, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#8b7cf6", kontur: 0, konum: 2, kutu: true, animasyon: "fade" }
    }
  };

  function applyPreset(key) {
    var p = (key === "user") ? K.settings().userPreset : PRESETS[key];
    if (!p) return;
    el("cap-maxlen").value = p.maxlen;
    el("cap-case").value = p.kase;
    el("cap-punct").checked = p.punct;
    stiliYaz(p.stil);
    vurguKutusuDurumu();
    onizlemeDurdur();
    onizlemeCiz();
    stilKartiIsaretle(key);
  }

  // Seçili kartı görsel olarak işaretle (stil elle değişince hiçbiri seçili kalmaz)
  function stilKartiIsaretle(key) {
    var grid = el("cap-stil-grid");
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll(".stil-sec"), function (b) {
      b.classList.toggle("secili", b.dataset.preset === key);
    });
  }

  function initStilKartlari() {
    var grid = el("cap-stil-grid");
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll(".stil-sec"), function (b) {
      b.addEventListener("click", function () {
        var key = b.dataset.preset;
        if (el("cap-preset")) el("cap-preset").value = key;
        applyPreset(key);
        savePrefs();
        // dokunmanın karşılığı anında: seçilen stil hemen oynasın
        if (onizlemeSaat) onizlemeDurdur();
        onizlemeOynat();
      });
    });
  }

  // "Şablonum" seçeneğini menüde göster/oluştur
  function ensureUserPresetOption() {
    if (!K.settings().userPreset) return;
    var sel = el("cap-preset");
    if (sel.querySelector('option[value="user"]')) return;
    var o = document.createElement("option");
    o.value = "user";
    o.textContent = "★ Şablonum";
    sel.appendChild(o);
  }

  function saveUserPreset() {
    var s = K.settings();
    s.userPreset = {
      maxlen: el("cap-maxlen").value,
      kase: el("cap-case").value,
      punct: el("cap-punct").checked,
      stil: stil()
    };
    K.saveSettings();
    ensureUserPresetOption();
    el("cap-preset").value = "user";
    savePrefs();
    KApp.toast("Şablonun kaydedildi — menüde ★ Şablonum", "good");
  }

  /* ---------------- Görünüm (stil) ---------------- */

  /*
   * Altyazının görünümü tek bir yerden okunur; hem ASS dosyasına hem panel
   * önizlemesine AYNI değerler gider, böylece önizleme yalan söylemez.
   */
  function stil() {
    function d(id, varsayilan) {
      var e = el(id);
      return e ? e.value : varsayilan;
    }
    return {
      font: d("cap-font", "Arial"),
      boyut: parseInt(d("cap-boyut", "72"), 10) || 72,
      renk: d("cap-renk", "#ffffff"),
      konturRenk: d("cap-renk-kontur", "#000000"),
      vurguRenk: d("cap-renk-vurgu", "#8b7cf6"),
      kontur: parseInt(d("cap-kontur", "4"), 10),
      konum: parseInt(d("cap-konum", "2"), 10),          // ASS Alignment: 2 alt, 5 orta, 8 üst
      kutu: !!(el("cap-kutu") && el("cap-kutu").checked),
      animasyon: d("cap-animasyon", "yok")
    };
  }

  /*
   * Panelle birlikte gelen fontlar (Google Fonts, OFL lisanslı; lisans dosyaları
   * fonts/ klasöründe). Hepsi cmap denetiminden geçti: Türkçe glifler TAM —
   * eksik glifli font libass'te sessizce başka fonta düşer ve yazı karışık çıkar.
   */
  var FONTLAR = {
    "Anton": "Anton.ttf",
    "Archivo Black": "ArchivoBlack.ttf",
    "Bebas Neue": "BebasNeue.ttf",
    "Bungee": "Bungee.ttf"
  };

  function uzantiDizini() {
    try { return decodeURI(K.cs.getSystemPath(CSInterface.SystemPath.EXTENSION)); }
    catch (e) { return ""; }
  }

  /*
   * ASS rengi &HAABBGGRR biçimindedir: alfa önce, sonra mavi-yeşil-kırmızı
   * (HTML'in tam TERSİ sırada). Alfa da terstir: 00 opak, FF tamamen saydam.
   */
  function assRenk(hex, saydamlik) {
    var h = String(hex || "#ffffff").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
    var a = ("0" + Number(saydamlik || 0).toString(16)).slice(-2);
    return ("&H" + a + b + g + r).toUpperCase();
  }

  function savePrefs() {
    try {
      var s = K.settings();
      var st = stil();
      s.capPrefs = {
        lang: el("cap-lang").value,
        maxlen: el("cap-maxlen").value,
        kase: el("cap-case").value,
        punct: el("cap-punct").checked,
        preset: el("cap-preset").value,
        stil: st
      };
      K.saveSettings();
    } catch (e) {}
  }

  function loadPrefs() {
    var p = K.settings().capPrefs;
    if (!p) return;
    try {
      if (p.lang !== undefined) el("cap-lang").value = p.lang;
      if (p.maxlen) el("cap-maxlen").value = p.maxlen;
      if (p.kase) el("cap-case").value = p.kase;
      if (p.punct !== undefined) el("cap-punct").checked = p.punct;
      if (p.preset !== undefined) el("cap-preset").value = p.preset;
      stiliYaz(p.stil);
    } catch (e) {}
  }

  // Kayıtlı görünüm ayarlarını kontrollere geri koy
  function stiliYaz(st) {
    if (!st) return;
    var esle = {
      "cap-font": st.font, "cap-boyut": st.boyut, "cap-renk": st.renk,
      "cap-renk-kontur": st.konturRenk, "cap-renk-vurgu": st.vurguRenk,
      "cap-kontur": st.kontur, "cap-konum": st.konum,
      "cap-animasyon": st.animasyon
    };
    Object.keys(esle).forEach(function (id) {
      var e = el(id);
      if (e && esle[id] !== undefined && esle[id] !== null) e.value = String(esle[id]);
    });
    if (el("cap-kutu") && st.kutu !== undefined) el("cap-kutu").checked = !!st.kutu;
  }

  /* ---------------- Stil ---------------- */

  function styleLocale() {
    var l = el("cap-lang").value;
    if (l === "tr") return "tr-TR";
    if (l === "az") return "az";
    if (l === "ru") return "ru";
    return undefined;
  }

  function styleText(t) {
    var mode = el("cap-case").value;
    var keepPunct = el("cap-punct").checked;
    var out = t;
    if (!keepPunct) {
      out = out.replace(/[.,!?;:…»«""()\-–—]/g, " ").replace(/\s+/g, " ").trim();
    }
    var loc = styleLocale();
    if (mode === "upper") out = loc ? out.toLocaleUpperCase(loc) : out.toUpperCase();
    else if (mode === "lower") out = loc ? out.toLocaleLowerCase(loc) : out.toLowerCase();
    return out;
  }

  // WAV başlığındaki byteRate'ten süreyi hesapla (preset formatından bağımsız)
  /*
   * WAV suresi = (dosya boyutu - 44 baytlik baslik) / saniyedeki bayt.
   * Yalnizca BASLIGI oku: tum dosyayi belege almak 1 saatlik sekansta 115 MB (16 kHz mono),
   * 48 kHz stereo yedekte ~690 MB demek ve paneli kilitliyordu.
   */
  function wavDuration(p) {
    var fd = null;
    try {
      var boyut = K.fs.statSync(p).size;
      if (boyut <= 44) return 0;
      var b = require("buffer").Buffer.alloc(44);
      fd = K.fs.openSync(p, "r");
      K.fs.readSync(fd, b, 0, 44, 0);
      var br = b[28] | (b[29] << 8) | (b[30] << 16) | (b[31] << 24);
      if (br > 0) return Math.max(0, (boyut - 44) / br);
    } catch (e) {
      K.log("[altyazı] wav süresi okunamadı: " + e.message);
    } finally {
      if (fd !== null) { try { K.fs.closeSync(fd); } catch (e2) {} }
    }
    return 0;
  }

  /* ---------------- Ses katmanları ---------------- */

  function renderTracks(ctx, force) {
    var card = el("cap-tracks-card");
    var box = el("cap-tracks");
    var list = (ctx && ctx.audioTracks) || [];
    var show = scope !== "clip" && ctx && ctx.hasSeq && list.length > 0;
    card.hidden = !show;
    if (!show) { lastTrackCount = -1; return; }
    if (!force && list.length === lastTrackCount) return; // her poll'da DOM'u yeniden kurma
    lastTrackCount = list.length;
    box.innerHTML = "";

    var TICK = '<svg viewBox="0 0 16 16"><path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" stroke="currentColor" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var DASH = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.4" fill="none"/><path d="M5.6 8 h4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

    function chip(label, on, title, onClick, faded) {
      var b = document.createElement("button");
      b.type = "button";
      // "empty" DEĞİL: o genel bir sınıf (boş liste yazısı, padding:20px) ve çipi şişiriyordu
      b.className = "track-chip" + (on ? " on" : "") + (faded ? " bos" : "");
      b.title = title || "";
      b.innerHTML = (on ? TICK : DASH) + "<span></span>";
      b.querySelector("span").textContent = label;
      b.onclick = onClick;
      return b;
    }

    var allOn = list.every(function (t, i) { return trackSel[i] !== false; });
    box.appendChild(chip("Tümü", allOn, "Tüm katmanlar", function () {
      list.forEach(function (t, i) { trackSel[i] = !allOn; });
      renderTracks(ctx, true);
    }));

    list.forEach(function (t, i) {
      var on = trackSel[i] !== false;
      box.appendChild(chip(t.name, on,
        t.clips ? t.name + " — klip var" : t.name + " — boş katman",
        function () { trackSel[i] = !on; renderTracks(ctx, true); },
        !t.clips));
    });
  }

  /* ---------------- Ana akış ---------------- */

  async function go() {
    if (busy) return;
    var ctx = KApp.ctx();
    var clip = ctx.sel;
    if (scope === "clip" && !clip) { status("Önce timeline'da bir klip seç.", "warn"); return; }
    busy = true;
    setBusy(true);
    var tempFiles = [];
    try {
      /*
       * ffmpeg'i EN BASTA hazirla. Sekans kapsaminda ses disa aktarimi dakikalar
       * suruyor; kontrolu sonraya birakmak, kullanicinin bes dakika bekleyip
       * "ffmpeg bulunamadi" duymasi demekti. Kurulum gerekiyorsa simdi olsun.
       */
      if (!(await K.findFfmpeg())) {
        status("ffmpeg kuruluyor… (bir kerelik, ses dönüştürme için gerekli)");
        try {
          await KEngine.installFfmpeg(function (m) { status(m); });
          await K.findFfmpeg(true);
        } catch (eFF) {
          throw new Error("ffmpeg kurulamadı: " + (eFF && eFF.message ? eFF.message : eFF) +
            " — Ayarlar > ffmpeg bölümünden elle bir yol gösterebilirsin.");
        }
      }

      var useLocal = K.settings().provider === "local";
      var audioSrc, seqOffset, durHint;

      var speedFactor = 1;
      var batchClips = null; // coklu klip: [clip, ...] — tek klipte null kalir
      if (scope === "clip") {
        var sc = await K.call("KS_getSelectedClips");
        if (sc.ok && sc.clips && sc.clips.length > 1) {
          if (typeof Pro !== "undefined" && !Pro.isPro()) {                   // Pro: toplu klip
            Pro.gate("batch");
            clip = sc.clips[0];                               // ilk kliple devam et
          } else {
            batchClips = sc.clips;
          }
        } else if (sc.ok && sc.clips && sc.clips.length === 1) {
          clip = sc.clips[0];
        }
        if (batchClips) {
          // coklu klip: her klip ayri islenir, asagida birlestirilir
          audioSrc = null;
        } else {
          seqOffset = clip.clipStart;
          durHint = clip.dur;
          // hiz degistirilmis klipte kaynak suresi != timeline suresi; damgalari olcekle
          var tlDur = clip.clipEnd - clip.clipStart;
          if (clip.dur > 0 && tlDur > 0) speedFactor = tlDur / clip.dur;
          status("Ses çıkarılıyor…");
          audioSrc = await convertAudio(clip.mediaPath, {
            wav: useLocal, ss: clip.inPoint, t: clip.dur, durHint: durHint
          });
          tempFiles.push(audioSrc);
        }
      } else {
        // katman seçimi: hepsi seçiliyse host'a filtre gönderme
        var trackArg = null;
        var at = ctx.audioTracks || [];
        if (at.length) {
          var enabled = [];
          at.forEach(function (t, i) { if (trackSel[i] !== false) enabled.push(i); });
          if (enabled.length === 0) throw new Error("En az bir ses katmanı seç.");
          if (enabled.length < at.length) trackArg = enabled;
        }
        status(scope === "inout" ? "In → Out sesi dışa aktarılıyor…" : "Sequence sesi dışa aktarılıyor…");
        // Uzun sekanslarda dışa aktarım dakikalar sürebilir: varsayılan zaman aşımını uzat
        var ex = await K.call("KS_exportAudio",
          { scope: scope, epr: bundledEpr(), tracks: trackArg }, 3600000);
        if (!ex.ok) throw new Error(ex.error);
        tempFiles.push(ex.wav);
        seqOffset = ex.offset;
        durHint = wavDuration(ex.wav);
        status("Ses hazırlanıyor…");
        audioSrc = await convertAudio(ex.wav, { wav: useLocal, durHint: durHint });
        tempFiles.push(audioSrc);
      }

      var lenVal = el("cap-maxlen").value; // "c42" karakter, "w3" kelime, "k1"/"kc" karaoke
      var karaoke = /^k/.test(lenVal);
      if (karaoke && typeof Pro !== "undefined" && !Pro.isPro()) {           // Pro: kelime-zamanlama
        Pro.gate("karaoke");
        karaoke = false; lenVal = "w3";                       // satir moduna dus, akisi kirma
      }
      var mapped = [];

      if (batchClips) {
        // toplu islem: klipler sirayla; biri patlarsa digerleri devam eder
        var failed = [];
        for (var bi = 0; bi < batchClips.length; bi++) {
          var bc = batchClips[bi];
          var tag = "Klip " + (bi + 1) + "/" + batchClips.length + " (" + bc.name + "): ";
          var ba = null;
          try {
            status(tag + "ses çıkarılıyor…");
            ba = await convertAudio(bc.mediaPath, {
              wav: useLocal, ss: bc.inPoint, t: bc.dur, durHint: bc.dur
            });
            tempFiles.push(ba);
            status(tag + "transkribe ediliyor…");
            var bRaw = useLocal
              ? await transcribeLocal(ba, karaoke)
              : await transcribeCloud(ba, bc.dur, karaoke);
            var bTl = bc.clipEnd - bc.clipStart;
            var bf = (bc.dur > 0 && bTl > 0) ? bTl / bc.dur : 1;
            bRaw.forEach(function (s) {
              if (!s.text) return;
              mapped.push({
                start: bc.clipStart + s.start * bf,
                end: bc.clipStart + s.end * bf,
                text: s.text
              });
            });
          } catch (eB) {
            failed.push(bc.name);
            K.log("toplu islem atladi [" + bc.name + "]: " + eB.message);
          } finally {
            // klip biter bitmez WAV'ini sil: 20 kliplik toplu iste disk sismesin
            // (yol tempFiles'ta da durur; sondaki toplu silme yokluga aldirmaz)
            if (ba) { try { K.fs.unlinkSync(ba); } catch (eT) {} }
          }
        }
        if (mapped.length === 0) throw new Error("Hiçbir klipten konuşma alınamadı.");
        if (failed.length) KApp.toast(failed.length + " klip atlandı: " + failed.join(", ").slice(0, 100), "bad");
        mapped.sort(function (a, b) { return a.start - b.start; });
      } else {
        status(useLocal ? "Transkribe ediliyor… (yerel)" : "Transkribe ediliyor…");
        var raw = useLocal
          ? await transcribeLocal(audioSrc, karaoke)
          : await transcribeCloud(audioSrc, durHint, karaoke);

        mapped = raw.map(function (s) {
          return {
            start: seqOffset + s.start * speedFactor,
            end: seqOffset + s.end * speedFactor,
            text: s.text
          };
        }).filter(function (s) { return s.text; });
      }

      if (karaoke) {
        // kelime bazında yalnız boş/noktalama filtresi; tekrar filtresi meşru kelimeleri yer
        mapped = mapped.filter(function (s) {
          return s.text.replace(/[.,!?;:…]/g, "").trim();
        });
        // bozulmuş kelime zamanı korumasi: 8+ kelime var ama hepsi ayni ana yigilmis
        if (mapped.length >= 8) {
          var tMin = mapped[0].start, tMax = mapped[0].start;
          mapped.forEach(function (s) {
            if (s.start < tMin) tMin = s.start;
            if (s.start > tMax) tMax = s.start;
          });
          if (tMax - tMin < 1) {
            K.log("karaoke HATA: " + mapped.length + " kelimenin tümü " + tMin.toFixed(2) + " sn civarında");
            throw new Error("Motor kelime zamanlarını veremedi (tüm kelimeler aynı anda). " +
              "Ayarlar > Destek'ten günlüğü kopyalayıp bildir; şimdilik satır modunu kullan.");
          }
        }
        segments = lenVal === "kc" ? karaokeCumulative(mapped, 4) : karaokeWords(mapped);
      } else {
        mapped = cleanSegments(mapped);
        mapped = trimOverlongCues(mapped);
        if (/^w\d+$/.test(lenVal)) {
          segments = splitWords(mapped, parseInt(lenVal.slice(1), 10) || 3);
        } else {
          segments = splitLong(mapped, parseInt(lenVal.slice(1), 10) || 42, 4.5);
        }
      }
      applyGlossary(segments);
      undoStack.length = 0;
      redoStack.length = 0;
      refreshUndoUI();
      savePrefs();
      if (segments.length === 0) throw new Error("Konuşma bulunamadı.");

      status("");
      hideRestore();             // ekranda taze iş var: eski taslak teklifi artık geçersiz
      clearRevert();             // yeni doküman — eski çevirinin orijinalleri buraya ait değil
      uygulaEtiketiniSifirla();  // yeni transkript: uygula düğmesi normal haline dönsün
      el("cap-result").hidden = false;
      el("cap-result-info").textContent = segments.length + " satır · düzenleyip uygula";
      render();
      // Uzun bir transkripsiyon bitti: kullanıcı hiçbir şeye dokunmasa da taslak diskte olsun
      saveDraftNow();
      KApp.toast(segments.length + " altyazı satırı hazır", "good");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      tempFiles.forEach(function (f) { try { K.fs.unlinkSync(f); } catch (e2) {} });
      busy = false;
      setBusy(false);
    }
  }

  function setBusy(b) {
    el("cap-go").classList.toggle("busy", b);
    if (b) el("cap-go").disabled = true;
    el("cap-progress").hidden = !b;
    if (!b) refreshButton();
  }

  /* ---------------- Segment düzenleme ---------------- */

  function tc(sec, comma) {
    if (sec < 0) sec = 0;
    // önce toplam ms'e yuvarla ki ,999 üstü kesirler saniyeye doğru devretsin
    var total = Math.round(sec * 1000);
    var h = Math.floor(total / 3600000);
    var m = Math.floor((total % 3600000) / 60000);
    var s = Math.floor((total % 60000) / 1000);
    var ms = total % 1000;
    function p(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
    return p(h, 2) + ":" + p(m, 2) + ":" + p(s, 2) + (comma ? "," : ".") + p(ms, 3);
  }

  function render() {
    // Gerçek satırlar geldiğinde/değiştiğinde önizleme de onlardan beslensin
    onizlemeCiz();
    var box = el("cap-segments");
    box.innerHTML = "";
    segments.forEach(function (s, i) {
      var row = document.createElement("div");
      row.className = "seg";

      /* zaman: tek tık → playhead, çift tık → elle düzenle */
      var t = document.createElement("button");
      t.className = "seg-time mono jump";
      t.textContent = tc(s.start, false).slice(3, 8);
      t.title = "Tık: playhead'i götür · Çift tık: zamanı düzenle";
      t.onclick = function () { K.call("KS_setPlayerPosition", { sec: s.start }); };
      t.ondblclick = function () { editTime(i, t); };

      var inp = document.createElement("input");
      inp.type = "text";
      inp.value = s.text;
      inp.dataset.i = String(i);
      inp.onfocus = function () { inp.dataset.before = inp.value; };
      inp.oninput = function () { segments[i].text = inp.value; saveDraftSoon(); };
      inp.onblur = function () {
        // metin gerçekten değiştiyse geri alınabilir olsun
        if (inp.dataset.before !== undefined && inp.dataset.before !== inp.value) {
          var eski = JSON.parse(JSON.stringify(segments));
          eski[i].text = inp.dataset.before;
          undoStack.push({ segs: JSON.stringify(eski), etiket: "metin düzenleme" });
          if (undoStack.length > UNDO_MAX) undoStack.shift();
          redoStack.length = 0;
          refreshUndoUI();
          inp.dataset.before = inp.value;
        }
      };
      // Enter: imleç konumundan böl
      inp.onkeydown = function (e) {
        if (e.key === "Enter") { e.preventDefault(); splitAt(i, inp.selectionStart); }
      };

      var spl = document.createElement("button");
      spl.className = "seg-x";
      spl.textContent = "⤸";
      spl.title = "İmleçten böl (Enter)";
      spl.onclick = function () { splitAt(i, inp.selectionStart || Math.floor(inp.value.length / 2)); };

      var mrg = document.createElement("button");
      mrg.className = "seg-x";
      mrg.textContent = "⨝";
      mrg.title = "Sonraki satırla birleştir";
      if (i === segments.length - 1) mrg.style.visibility = "hidden";
      mrg.onclick = function () {
        var nx = segments[i + 1];
        if (!nx) return;
        snapshot("birleştirme");
        // çeviri öncesi metinleri de birleştir, yoksa "çeviriyi geri al" bu satırı atlar
        if (typeof segments[i].orig === "string" || typeof nx.orig === "string") {
          segments[i].orig = ((segments[i].orig || segments[i].text) + " " +
            (nx.orig || nx.text)).replace(/\s+/g, " ").trim();
        }
        segments[i].text = (segments[i].text + " " + nx.text).replace(/\s+/g, " ").trim();
        segments[i].end = nx.end;
        segments.splice(i + 1, 1);
        render(); saveDraftSoon();
      };

      var del = document.createElement("button");
      del.className = "seg-x";
      del.textContent = "×";
      del.title = "Satırı sil";
      del.onclick = function () {
        snapshot("satır silme");
        segments.splice(i, 1);
        render(); saveDraftSoon();
      };

      row.appendChild(t); row.appendChild(inp);
      row.appendChild(spl); row.appendChild(mrg); row.appendChild(del);
      box.appendChild(row);
    });
    el("cap-result-info").textContent = segments.length + " satır · düzenleyip uygula";
  }

  // Boşluksuz yazı sistemleri (Japonca/Çince/Korece): kelime sınırı yok, her yerden bölünür
  var BOSLUKSUZ = new RegExp("[\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7AF]");

  /* satırı imleç konumundan böl — süreyi karakter oranına göre paylaştır */
  function splitAt(i, pos) {
    var s = segments[i];
    if (!s) return;
    var text = s.text;
    if (pos === null || pos === undefined) pos = Math.floor(text.length / 2);
    // kelime ortasında bölmeyi engelle: en yakın boşluğa kaydır
    if (pos > 0 && pos < text.length && text[pos] !== " ") {
      var sag = text.indexOf(" ", pos);
      var sol = text.lastIndexOf(" ", pos);
      if (sag === -1 && sol === -1) {
        // Metinde hiç boşluk yok. Boşluksuz yazı sistemlerinde (CJK) her karakter sınırı
        // geçerlidir; Latin/Kiril tek kelimesini ortadan kesmek ise her zaman hatadır
        // (karaoke ve "kelime kelime" modlarında her satır tek kelimedir).
        if (!BOSLUKSUZ.test(text)) {
          KApp.toast("Tek kelimelik satır bölünemez — metni düzenle ya da ⨝ ile birleştir.", "warn");
          return;
        }
      } else {
        pos = (sag !== -1 && (sol === -1 || sag - pos <= pos - sol)) ? sag : sol;
      }
    }
    var a = text.slice(0, pos).trim();
    var b = text.slice(pos).trim();
    if (!a || !b) { KApp.toast("Bölmek için imleci metnin ortasına koy.", "warn"); return; }
    snapshot("bölme");
    var dur = s.end - s.start;
    var oran = a.length / Math.max(1, a.length + b.length);
    var kesme = s.start + Math.max(0.3, dur * oran);
    if (kesme >= s.end - 0.15) kesme = s.start + dur / 2;
    segments.splice(i, 1,
      { start: s.start, end: kesme, text: a },
      { start: kesme, end: s.end, text: b });
    render(); saveDraftSoon();
    KApp.toast("Satır bölündü", "good");
  }

  /* zaman damgasını elle düzenle (çift tık) */
  function editTime(i, btn) {
    var s = segments[i];
    if (!s) return;
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "seg-time-edit mono";
    inp.value = tc(s.start, false).slice(0, 12); // hh:mm:ss.mmm
    btn.replaceWith(inp);
    inp.focus();
    inp.select();
    function bitir(kaydet) {
      if (kaydet) {
        // biçimi ÖNCE doğrula — tcParse tanımadığı girdide 0 döner, o sessizce 00:00 yapar
        var v = inp.value.trim();
        var gecerli = /^\d{1,2}:\d{1,2}(:\d{1,2})?[.,]\d{1,3}$/.test(v) ||
                      /^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(v);
        var yeni = gecerli ? tcParse(v.indexOf(".") === -1 && v.indexOf(",") === -1 ? v + ".000" : v) : NaN;
        if (gecerli && isFinite(yeni) && yeni >= 0) {
          var dur = s.end - s.start;
          snapshot("zaman düzenleme");
          segments[i].start = yeni;
          segments[i].end = yeni + Math.max(0.3, dur);
          sortSegments();          // sıra bozulmasın: SRT komşu kontrolü sıralı liste ister
          saveDraftSoon();
        } else {
          KApp.toast("Zaman biçimi: dd:ss.mmm (örn. 01:23.500)", "warn");
        }
      }
      render();
    }
    inp.onblur = function () { bitir(true); };
    inp.onkeydown = function (e) {
      if (e.key === "Enter") { e.preventDefault(); bitir(true); }
      if (e.key === "Escape") { e.preventDefault(); bitir(false); }
    };
  }

  /* tüm satırları topluca kaydır (in/out kayması düzeltmesi) */
  function shiftAll(sec) {
    if (!segments.length || !sec) return;
    // TOPLU sınır: start ve end'i ayrı ayrı kırpmak cue sürelerini bozar ve kaydırmayı
    // tersine çevrilemez yapar. Tek bir miktar uygulanır, süreler aynen korunur.
    var minStart = segments[0].start;
    segments.forEach(function (s) { if (s.start < minStart) minStart = s.start; });
    var uyg = Math.max(sec, -minStart);
    if (Math.abs(uyg) < 0.001) {
      KApp.toast("Altyazılar sequence başında — daha geriye kaydırılamaz.", "warn");
      return;                        // snapshot YOK: boş tıklama undo geçmişini yemesin
    }
    snapshot("toplu kaydırma");
    segments.forEach(function (s) { s.start += uyg; s.end += uyg; });
    var msg = (uyg > 0 ? "+" : "") + uyg.toFixed(2) + " sn kaydırıldı";
    if (Math.abs(uyg - sec) > 0.001) msg += " (sequence başına dayandı)";
    render(); saveDraftSoon();
    KApp.toast(msg, Math.abs(uyg - sec) < 0.001 ? "good" : "warn");
  }

  /* araya yeni boş satır ekle */
  function insertAfter(i) {
    var s = segments[i];
    var nx = segments[i + 1];
    var start = s ? s.end + 0.05 : 0;
    var end = nx ? Math.min(nx.start - 0.05, start + 1.5) : start + 1.5;
    if (end <= start) end = start + 0.5;
    snapshot("satır ekleme");
    segments.splice(i + 1, 0, { start: start, end: end, text: "", orig: "" });
    render(); saveDraftSoon();
  }

  /* ---------------- Çeviri (LLM) ---------------- */

  /*
   * Çeviri geri alma. Orijinal metin index dizisinde DEĞİL, segmentin kendisinde (s.orig)
   * taşınır: bölme/birleştirme/silme/sıralama index eşlemesini bozduğu için index tabanlı
   * saklama, geri alındığında metinleri yanlış satırlara yazıyordu.
   */
  var preTranslate = null; // yalnızca "çeviri yapıldı" bayrağı
  function clearRevert() {
    preTranslate = null;
    var b = el("cap-revert");
    if (b) b.hidden = true;
  }

  var LANG_NAMES = { en: "English", tr: "Turkish", az: "Azerbaijani", ru: "Russian" };

  function chatConfig() {
    var s = K.settings();
    if (s.provider === "openai" && s.apiKey) {
      return { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", key: s.apiKey };
    }
    if (s.provider === "custom" && s.endpoint && s.apiKey) {
      return {
        url: s.endpoint.replace(/\/audio\/transcriptions.*$/, "/chat/completions"),
        model: "llama-3.3-70b-versatile", key: s.apiKey
      };
    }
    // local dahil: anahtar varsa Groq'un ücretsiz LLM'i
    if (s.apiKey) {
      return { url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile", key: s.apiKey };
    }
    return null;
  }

  async function chatCall(cfg, bodyObj) {
    if (K.nodeOK) {
      var r = await K.httpJson(cfg.url, { "Authorization": "Bearer " + cfg.key }, bodyObj);
      if (r.status === 0) throw new Error("Bağlantı hatası: " + String(r.body).slice(0, 140));
      if (r.status < 200 || r.status >= 300) throw apiError(r.status, r.body);
      return JSON.parse(r.body);
    }
    var res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj)
    });
    if (!res.ok) throw apiError(res.status, await res.text());
    return await res.json();
  }

  async function translateAll() {
    if (typeof Pro !== "undefined" && !Pro.gate("translate")) return; // Pro: ceviri
    if (segments.length === 0) return;
    var target = el("cap-translate").value;
    if (!target) { KApp.toast("Önce hedef dili seç.", "warn"); return; }
    var cfg = chatConfig();
    if (!cfg) {
      KApp.toast("Çeviri için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad");
      return;
    }
    var btn = el("cap-translate-go");
    btn.disabled = true;
    try {
      var texts = segments.map(function (s) { return s.text; });
      var out = [];
      var BATCH = 60;
      for (var i = 0; i < texts.length; i += BATCH) {
        status("Çevriliyor… " + Math.min(i + BATCH, texts.length) + "/" + texts.length);
        var chunk = texts.slice(i, i + BATCH);
        var json = await chatCall(cfg, {
          model: cfg.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "You translate subtitle lines for video. Reply ONLY with a JSON object {\"lines\": [...]} containing exactly " +
                chunk.length + " translated lines in the same order. Keep translations short and natural for subtitles. Do not merge or split lines."
            },
            {
              role: "user",
              content: "Translate to " + (LANG_NAMES[target] || target) + ":\n" + JSON.stringify(chunk)
            }
          ]
        });
        var content = json.choices && json.choices[0] && json.choices[0].message.content;
        var parsed = JSON.parse(content);
        var lines = parsed.lines || parsed.Lines;
        if (!lines || lines.length !== chunk.length) {
          throw new Error("Çeviri satır sayısı tutmadı (" + (lines ? lines.length : 0) + "/" + chunk.length + ") — tekrar dene.");
        }
        out = out.concat(lines);
      }
      segments.forEach(function (s, i2) {
        if (typeof s.orig !== "string") s.orig = texts[i2];   // zincir çeviride ilk orijinali koru
        s.text = String(out[i2] || "").trim() || s.text;
      });
      preTranslate = true;
      status("");
      el("cap-revert").hidden = false;
      render(); saveDraftNow();
      KApp.toast(texts.length + " satır çevrildi", "good");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      btn.disabled = false;
    }
  }

  function revertTranslate() {
    if (!preTranslate) return;
    var atlanan = 0;
    snapshot("çeviriyi geri al");
    segments.forEach(function (s) {
      if (typeof s.orig === "string") { s.text = s.orig; delete s.orig; }
      else atlanan++;                    // orijinali olmayan (sonradan eklenen) satıra dokunma
    });
    clearRevert();
    render(); saveDraftNow();
    KApp.toast(atlanan
      ? "Orijinale dönüldü · " + atlanan + " satır yapısal düzenlendiği için çeviride kaldı"
      : "Orijinal metne dönüldü", atlanan ? "warn" : undefined);
  }

  /* ---------------- Bul & değiştir ---------------- */

  function findReplace() {
    var find = el("cap-find").value;
    if (!find) return;
    var rep = el("cap-replace").value;
    var ci = el("cap-fr-ci") && el("cap-fr-ci").checked;   // büyük/küçük harf duyarsız
    var n = 0;
    var yedek = JSON.stringify(segments);
    segments.forEach(function (s) {
      var before = s.text;
      if (ci) {
        s.text = trReplace(s.text, find, rep);        // Türkçe-duyarlı, kelime sınırlı
      } else if (s.text.indexOf(find) !== -1) {
        s.text = s.text.split(find).join(rep);
      }
      if (s.text !== before) n++;
    });
    if (n) {
      undoStack.push({ segs: yedek, etiket: "bul & değiştir" });
      if (undoStack.length > UNDO_MAX) undoStack.shift();
      redoStack.length = 0;
      refreshUndoUI();     // yığını elle güncelledik: ↶/↷ düğmelerini de güncelle
      render(); saveDraftSoon();
    }
    KApp.toast(n ? n + " satırda değiştirildi" : "Eşleşme yok", n ? "good" : undefined);
  }

  // Bu düzeltmeyi kalıcı sözlüğe ekle — bir daha elle uğraşma
  function addToGlossary() {
    var from = el("cap-find").value.trim();
    var to = el("cap-replace").value.trim();
    if (!from) { KApp.toast("Önce 'bul' alanını doldur.", "warn"); return; }
    var s = K.settings();
    s.glossary = s.glossary || [];
    var mevcut = s.glossary.filter(function (r) { return r.from !== from; });
    mevcut.push({ from: from, to: to });
    s.glossary = mevcut;
    K.saveSettings();
    if (el("set-glossary")) el("set-glossary").value = glossaryText();
    KApp.toast("Sözlüğe eklendi: " + from + " → " + to, "good");
  }

  /* ---------------- SRT içe aktarma ---------------- */

  function parseSrt(text) {
    var out = [];
    var blocks = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n").split(/\n\s*\n/);
    blocks.forEach(function (b) {
      var lines = b.split("\n").filter(function (l) { return l.trim(); });
      var ti = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("-->") !== -1) { ti = i; break; }
      }
      if (ti === -1) return;
      var m = lines[ti].split("-->");
      var start = tcParse(m[0]);
      var end = tcParse(m[1]);
      var txt = temizleEtiket(lines.slice(ti + 1).join(" "));
      if (txt) out.push({ start: start, end: end, text: txt });
    });
    return out;
  }

  function importSrt() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt,.vtt";
    input.onchange = function () {
      if (!input.files.length) return;
      var dosya = input.files[0];

      function yerlestir(metin, kodlama) {
        var segs = parseSrt(metin);
        if (!segs.length) { KApp.toast("Dosyada altyazı bulunamadı.", "bad"); return; }
        /*
         * Ekranda iş varsa üzerine yazmadan önce anlık görüntü al: kullanıcı yanlış
         * dosya seçtiyse Ctrl+Z ile geri dönebilsin. Ekran boşsa yığını temizle, yoksa
         * geri alma eski bir dokümanın satırlarını geri getirir.
         */
        if (segments.length) snapshot("SRT içe aktarma");
        else { undoStack.length = 0; redoStack.length = 0; }
        segments = segs;
        uygulaEtiketiniSifirla();  // yeni doküman: "yine de uygula" onayı geçersiz
        refreshUndoUI();
        clearRevert();
        hideRestore();
        el("cap-result").hidden = false;
        el("cap-result-info").textContent = segs.length + " satır · içe aktarıldı";
        render();
        saveDraftNow();
        KApp.toast(segs.length + " satır içe aktarıldı" +
          (kodlama ? " (" + kodlama + " olarak okundu)" : "") +
          " — düzenle, çevir, uygula", "good");
      }

      /*
       * Türkiye'de dolaşan SRT'lerin çoğu windows-1254 (Türkçe ANSI); UTF-8 sanıp
       * okursak bütün ş/ğ/ı/İ harfleri bozulur.
       *
       * Kodlamayı HAM BAYTTAN karar veriyoruz: TextDecoder'ı fatal kipte çalıştırınca
       * geçersiz UTF-8'de istisna atar, geçerlide atmaz. "Çıktıda bozuk karakter var mı"
       * diye bakmak işe YARAMAZ: windows-1254 tek baytlık bir kodlamadır, her bayt
       * dizisini sessizce kabul eder, yani o kontrol hiçbir zaman "hayır" demez.
       */
      var reader = new FileReader();
      reader.onload = function () {
        var buf = reader.result;
        var metin, kodlama = "";
        try {
          metin = new TextDecoder("utf-8", { fatal: true }).decode(buf);
        } catch (eU) {
          try {
            metin = new TextDecoder("windows-1254").decode(buf);
            kodlama = "Türkçe ANSI";
            K.log("[altyazı] gecerli UTF-8 degil, windows-1254 olarak okundu: " + dosya.name);
          } catch (eW) {
            KApp.toast("Dosyanın kodlaması çözülemedi.", "bad");
            return;
          }
        }
        yerlestir(metin, kodlama);
      };
      reader.onerror = function () { KApp.toast("Dosya okunamadı.", "bad"); };
      reader.readAsArrayBuffer(dosya);
    };
    input.click();
  }

  /* ---------------- SRT + uygulama ---------------- */

  /*
   * Stil uygulanmış, çakışması giderilmiş cue listesi.
   * TÜM dışa aktarma biçimleri bunu kullanır — biçimler arası davranış ayrışmasın.
   */
  function cueler() {
    var out = [];
    segments.forEach(function (s, i) {
      var txt = styleText(s.text);
      if (!txt) return; // stil sonrasi bos kalan cue yazilmaz
      // minimum 0.3 sn gorunum — ama bir sonraki cue ile CAKISMA (karaoke'de kritik)
      var end = Math.max(s.end, s.start + 0.3);
      var next = segments[i + 1];
      if (next && end > next.start) end = Math.max(next.start, s.start + 0.05);
      out.push({ start: s.start, end: end, text: txt });
    });
    return out;
  }

  function buildSrt() {
    var out = [];
    cueler().forEach(function (c, i) {
      out.push(String(i + 1));
      out.push(tc(c.start, true) + " --> " + tc(c.end, true));
      out.push(c.text);
      out.push("");
    });
    return out.join("\r\n");
  }

  // WebVTT — YouTube, web oynatıcılar ve sosyal platformların istediği biçim
  function buildVtt() {
    var out = ["WEBVTT", ""];
    cueler().forEach(function (c, i) {
      out.push(String(i + 1));
      out.push(tc(c.start, false) + " --> " + tc(c.end, false));
      out.push(c.text);
      out.push("");
    });
    return out.join("\n");
  }

  /* ---------------- ASS / SSA (stilli altyazı) ---------------- */

  // ASS zamanı: H:MM:SS.cc (santisaniye, tek haneli saat)
  function assTc(sec) {
    if (sec < 0) sec = 0;
    var cs = Math.round(sec * 100);
    var h = Math.floor(cs / 360000);
    var m = Math.floor((cs % 360000) / 6000);
    var s = Math.floor((cs % 6000) / 100);
    var c = cs % 100;
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return h + ":" + p(m) + ":" + p(s) + "." + p(c);
  }

  // Süslü parantez ASS'te override bloğu açar; metindeki gerçek parantez kaçırılmalı
  function assMetin(t) {
    return String(t || "").replace(/\{/g, "\\{").replace(/\}/g, "\\}")
      .replace(/\r?\n/g, "\\N");
  }

  /*
   * Kelime modundaki cue'ları satırlara toplayıp karaoke (\k) etiketi üretir.
   * \k değeri SANTİSANİYE cinsindendir ve o kelimenin vurgulanma süresidir.
   */
  function assKaraokeSatirlari(cs) {
    var satirlar = [], grup = [];
    function bosalt() {
      if (grup.length) { satirlar.push(grup); grup = []; }
    }
    for (var i = 0; i < cs.length; i++) {
      grup.push(cs[i]);
      var son = cs[i], sonraki = cs[i + 1];
      var bosluk = sonraki ? sonraki.start - son.end : 99;
      // satırı kapat: 5 kelime doldu, araya sessizlik girdi ya da noktalama bitti
      if (grup.length >= 5 || bosluk > 0.7 || /[.!?…]$/.test(son.text)) bosalt();
    }
    bosalt();
    return satirlar;
  }

  /* ---------------- Canlı önizleme ---------------- */

  /*
   * Altyazının videoda nasıl duracağını panelde gösterir. ASS ile AYNI stil
   * nesnesini okur — burada güzel görünüp dışa aktarımda başka türlü çıkması
   * kullanıcının güvenini bitirecek tek şey olurdu.
   *
   * Ölçek: sahne genişliği / 1920. ASS 1920x1080 sahneye göre yazıldığı için
   * aynı oranı kullanınca panel görüntüsü gerçek çıktıyla aynı olur.
   */
  var onizlemeSaat = null;
  var onizlemeKare = null;      // playhead'den alınan gerçek kare (file:// URL)

  /*
   * Kullanıcının kendi görüntüsünü arka plan yap: altyazının GERÇEK sahnede
   * nasıl durduğunu düz bir zemin gösteremez. Premiere'in kare dışa aktarımı
   * belgelenmemiş ve her sürümde yok; başarısız olursa sessizce sinematik
   * zemine düşülür, özellik kaybolmaz.
   */
  async function kareTazele() {
    var not = el("cap-onizleme-not");
    var sahne = el("cap-sahne");
    if (!sahne || !K.nodeOK) return;
    try {
      if (not) not.textContent = "Timeline'dan kare alınıyor…";
      var yol = K.path.join(K.tmpDir(), "suflo-onizleme.png");
      try { K.fs.unlinkSync(yol); } catch (e0) {}

      var r = await K.call("KS_grabFrame", { path: yol }, 30000);
      if (!r.ok || !K.fs.existsSync(yol)) throw new Error(r.error || "kare alınamadı");

      // aynı dosya adı tarayıcıda önbelleklenir: sorgu ekiyle tazele
      onizlemeKare = "file:///" + yol.replace(/\\/g, "/") + "?t=" + Date.now();
      sahne.style.backgroundImage = "url('" + onizlemeKare + "')";
      sahne.classList.add("kare-var");
      if (not) not.textContent = "Arka plan: timeline'daki kare · yenilemek için tekrar bas";
    } catch (e) {
      onizlemeKare = null;
      sahne.style.backgroundImage = "";
      sahne.classList.remove("kare-var");
      if (not) not.textContent = "Timeline'dan kare alınamadı — temsili zemin gösteriliyor";
    }
  }

  /*
   * Bağımlı kontrollerin durumu:
   * - Vurgu rengi yalnız karaoke/vurgu animasyonlarında iş görür.
   * - Kelime zamanlı animasyonlar kelime verisi ister (Satır uzunluğu → Karaoke);
   *   yoksa seçenekler kapatılır ve ipucu gösterilir. Kullanıcının seçimi
   *   değiştirilmez — buildAss zaten güvenle fade'e düşüyor.
   */
  function vurguKutusuDurumu() {
    var kelimeVar = /^k/.test(el("cap-maxlen") ? el("cap-maxlen").value : "");
    var anim = el("cap-animasyon") ? el("cap-animasyon").value : "yok";

    var kutu = el("cap-renk-vurgu-kutu");
    if (kutu) kutu.classList.toggle("pasif", !(anim === "karaoke" || anim === "vurgu"));

    var secici = el("cap-animasyon");
    if (secici) {
      Array.prototype.forEach.call(secici.options, function (o) {
        if (ANIMASYONLAR[o.value] && ANIMASYONLAR[o.value].kelimeli) o.disabled = !kelimeVar;
      });
    }
    var ipucu = el("cap-animasyon-ipucu");
    if (ipucu) ipucu.hidden = kelimeVar || !(ANIMASYONLAR[anim] && ANIMASYONLAR[anim].kelimeli);
  }

  function onizlemeDurdur() {
    if (onizlemeSaat) { clearTimeout(onizlemeSaat); onizlemeSaat = null; }
    var b = el("cap-onizleme-oynat");
    if (b) b.textContent = "▶ Oynat";
  }

  function onizlemeCiz(vurguIndex) {
    var sahne = el("cap-sahne");
    var kutu = el("cap-onizleme-metin");
    if (!sahne || !kutu) return;

    var st = stil();
    var karaoke = /^k/.test(el("cap-maxlen").value);
    var olcek = sahne.clientWidth / 1920;

    // Yerleşim: ASS Alignment 2/5/8 -> alt/orta/üst
    kutu.className = "onizleme-alt " + (st.konum === 8 ? "ust" : st.konum === 5 ? "orta" : "alt");
    kutu.style.fontFamily = st.font + ", sans-serif";
    kutu.style.fontSize = Math.max(7, st.boyut * olcek) + "px";
    kutu.style.fontWeight = "700";
    kutu.style.color = st.renk;

    // Kontur: ASS'in outline'ı her yöne eşit; tarayıcıda dört yönlü gölgeyle taklit
    if (st.kontur > 0) {
      var k = Math.max(1, st.kontur * olcek);
      kutu.style.textShadow = [
        k + "px 0 0 " + st.konturRenk, "-" + k + "px 0 0 " + st.konturRenk,
        "0 " + k + "px 0 " + st.konturRenk, "0 -" + k + "px 0 " + st.konturRenk,
        k + "px " + k + "px 0 " + st.konturRenk, "-" + k + "px -" + k + "px 0 " + st.konturRenk,
        k + "px -" + k + "px 0 " + st.konturRenk, "-" + k + "px " + k + "px 0 " + st.konturRenk
      ].join(",");
    } else {
      kutu.style.textShadow = st.kutu ? "none" : "0 " + (2 * olcek) + "px " + (3 * olcek) + "px rgba(0,0,0,.6)";
    }

    // Örnek metin: gerçek transkript varsa ondan, yoksa temsili bir cümle
    var ornek = onizlemeMetni();
    if (!ornek.kelimeler.length) {
      kutu.innerHTML = "";
      if (!sahne.querySelector(".onizleme-bos")) {
        var bos = document.createElement("div");
        bos.className = "onizleme-bos";
        bos.textContent = "Altyazı oluşturunca burada nasıl görüneceğini görürsün.";
        sahne.appendChild(bos);
      }
      return;
    }
    var bosEski = sahne.querySelector(".onizleme-bos");
    if (bosEski) bosEski.remove();

    /*
     * Kelimeleri animasyona göre diz. vurguIndex "şu an okunan kelime";
     * undefined ise durağan görünüm (oynatma yok).
     */
    var anim = st.animasyon || "yok";
    var kelimeli = karaoke && ANIMASYONLAR[anim] && ANIMASYONLAR[anim].kelimeli;
    var oynuyor = vurguIndex !== undefined;

    kutu.innerHTML = "";
    if (oynuyor && !kelimeli) {
      // satır animasyonları: ilk karede satırın tamamı efektle girer
      if (anim === "fade") kutu.classList.add("satir-fade");
      if (anim === "slide") kutu.classList.add("satir-slide");
    }

    ornek.kelimeler.forEach(function (kelime, i) {
      // pop/bounce oynarken henüz sırası gelmeyen kelime hiç çizilmez
      if (oynuyor && (anim === "pop" || anim === "bounce") && i > vurguIndex) return;

      var s = document.createElement("span");
      s.className = "kelime";
      s.textContent = kelime + (i < ornek.kelimeler.length - 1 ? " " : "");
      if (st.kutu) {
        s.classList.add("kutu");
        s.style.background = "rgba(0,0,0,.75)";
      }

      if (oynuyor && kelimeli) {
        if (anim === "karaoke") {
          if (i <= vurguIndex) s.style.color = st.vurguRenk;
        } else if (anim === "vurgu") {
          if (i === vurguIndex) {
            s.style.color = st.vurguRenk;
            s.classList.add("kelime-vurgu");
          }
        } else if (i === vurguIndex) {
          s.classList.add(anim === "bounce" ? "kelime-bounce" : "kelime-pop");
        }
      }
      kutu.appendChild(s);
    });
  }

  /*
   * Önizlemede gösterilecek kelimeler. Gerçek transkript varsa ORTASINDAN bir
   * satır alınır (baştaki satır çoğu videoda "merhaba" gibi kısa ve temsil etmez).
   */
  function onizlemeMetni() {
    if (!segments.length) {
      return { kelimeler: ["Örnek", "altyazı", "böyle", "görünecek"], sureler: null };
    }
    var karaoke = /^k/.test(el("cap-maxlen").value);
    if (karaoke) {
      var cs = cueler();
      if (!cs.length) return { kelimeler: [], sureler: null };
      var gruplar = assKaraokeSatirlari(cs);
      var g = gruplar[Math.floor(gruplar.length / 2)] || gruplar[0] || [];
      return {
        kelimeler: g.map(function (c) { return styleText(c.text); }).filter(Boolean),
        sureler: g.map(function (c) { return Math.max(0.12, c.end - c.start); })
      };
    }
    var orta = segments[Math.floor(segments.length / 2)] || segments[0];
    var metin = styleText(orta.text || "");
    return { kelimeler: metin ? metin.split(/\s+/) : [], sureler: null };
  }

  function onizlemeOynat() {
    var b = el("cap-onizleme-oynat");
    if (onizlemeSaat) { onizlemeDurdur(); onizlemeCiz(); return; }

    var veri = onizlemeMetni();
    if (!veri.kelimeler.length) return;

    var st = stil();
    var anim = st.animasyon || "yok";
    var kelimeli = /^k/.test(el("cap-maxlen").value) &&
                   ANIMASYONLAR[anim] && ANIMASYONLAR[anim].kelimeli;

    if (b) b.textContent = "■ Durdur";

    if (!kelimeli) {
      // satır animasyonu tek seferde oynar (fade/slide girişi), sonra durur
      onizlemeCiz(0);
      onizlemeSaat = setTimeout(function () { onizlemeDurdur(); onizlemeCiz(); }, 1600);
      return;
    }

    var i = 0;
    function adim() {
      onizlemeCiz(i);
      var sure = veri.sureler ? veri.sureler[i] * 1000 : 380;
      i++;
      if (i >= veri.kelimeler.length) {
        onizlemeSaat = setTimeout(function () {
          onizlemeDurdur();
          onizlemeCiz();
        }, Math.min(1200, sure));
        return;
      }
      onizlemeSaat = setTimeout(adim, Math.min(1500, sure));
    }
    adim();
  }

  /*
   * ---------------- Animasyon motoru ----------------
   *
   * Rakip paketler animasyonlu yazıyı hazır şablon olarak satıyor ve metni
   * kullanıcı elle yazıyor. Burada tersi yapılır: transkript zaten var,
   * animasyon ASS override etiketleriyle KOD tarafından üretilir.
   *
   * İki sınıf var:
   *   Kelime zamanlı (karaoke verisi ister): karaoke, vurgu, pop, bounce
   *   Satır bazlı  (her modda çalışır):      yok, fade, slide
   *
   * Kelime zamanlı animasyonlarda çakışma tuzağı: aynı hizada eşzamanlı iki
   * Dialogue olayı libass'te üst üste binmemek için KAYDIRILIR ve satır zıplar.
   * Bu yüzden pop/bounce/vurgu olayları hep ARDIŞIK pencereler halinde yazılır
   * (kelime_i.start → kelime_{i+1}.start): hiçbir an iki olay üst üste gelmez.
   */

  var ANIMASYONLAR = {
    yok:     { ad: "Yok",            kelimeli: false },
    fade:    { ad: "Yumuşak geçiş",  kelimeli: false },
    slide:   { ad: "Alttan kayma",   kelimeli: false },
    karaoke: { ad: "Karaoke dolgu",  kelimeli: true },
    vurgu:   { ad: "Aktif kelime",   kelimeli: true },
    pop:     { ad: "Pop",            kelimeli: true },
    bounce:  { ad: "Zıplama",        kelimeli: true }
  };

  // Konuma göre satırın çapa noktası (slide animasyonunun \move hedefi)
  function assCapa(konum, pw, ph, altBosluk) {
    if (konum === 8) return { x: Math.round(pw / 2), y: altBosluk + 20 };
    if (konum === 5) return { x: Math.round(pw / 2), y: Math.round(ph / 2) };
    return { x: Math.round(pw / 2), y: ph - altBosluk };
  }

  function buildAss(opts) {
    opts = opts || {};
    var st = opts.stil || stil();
    var font = opts.font || st.font || "Arial";
    var boyut = opts.boyut || st.boyut || 72;
    var kelimeVerisi = !!opts.karaoke;      // segmentler kelime zamanlı mı

    /*
     * Animasyon seçimi. Geriye dönük uyum: eski çağrılar yalnız {karaoke:true}
     * geçiyordu, o durumda karaoke dolgusu korunur. Kelime zamanlı bir animasyon
     * istenip elde kelime verisi yoksa fade'e düşülür — bozuk çıktı üretmekten
     * ve olayları yanlış zamanlamaktan iyidir.
     */
    var anim = opts.animasyon || st.animasyon || (kelimeVerisi ? "karaoke" : "yok");
    if (!ANIMASYONLAR[anim]) anim = "yok";
    if (ANIMASYONLAR[anim].kelimeli && !kelimeVerisi) anim = "fade";
    if (ANIMASYONLAR[anim].kelimeli && typeof Pro !== "undefined" && !Pro.isPro()) anim = "fade"; // Pro: kelimeli animasyon

    var cs = cueler();

    /*
     * Renk yerleşimi animasyona göre değişir:
     * karaoke: \k soldurması Secondary'den Primary'ye akar → vurgu Primary'de.
     * vurgu/pop/bounce: taban metin normal renkte, aktif kelime satır içi
     * etiketle boyanır → Primary normal renk olmalı.
     */
    var birincil = (anim === "karaoke") ? assRenk(st.vurguRenk) : assRenk(st.renk);
    var ikincil = assRenk(st.renk);
    var kenarBicim = st.kutu ? 3 : 1;
    var arkaRenk = assRenk("#000000", st.kutu ? 0x40 : 0x80);
    var golge = st.kutu ? 0 : 2;
    var altBosluk = st.konum === 2 ? 90 : 40;

    /*
     * PlayRes çıktı çözünürlüğüyle AYNI olmalı, yoksa font ölçeği kayar.
     * "YCbCr Matrix: None" olmadığında libass TV aralığı varsayıp saf beyazı
     * 255 yerine 235 çiziyor.
     */
    var pw = opts.genislik || 1920;
    var ph = opts.yukseklik || 1080;

    var bas = [
      "[Script Info]",
      "; Suflo ile üretildi — https://suflo.app",
      "ScriptType: v4.00+",
      "WrapStyle: 2",
      "ScaledBorderAndShadow: yes",
      "YCbCr Matrix: None",
      "PlayResX: " + pw,
      "PlayResY: " + ph,
      "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour," +
        " Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline," +
        " Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      "Style: Suflo," + font + "," + boyut + "," + birincil + "," + ikincil + "," +
        assRenk(st.konturRenk) + "," + arkaRenk + "," +
        "-1,0,0,0,100,100,0,0," + kenarBicim + "," + st.kontur + "," + golge + "," +
        st.konum + ",80,80," + altBosluk + ",1",
      "",
      "[Events]",
      "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ];

    function olay(bas0, son0, metin) {
      bas.push("Dialogue: 0," + assTc(bas0) + "," + assTc(son0) + ",Suflo,,0,0,0,," + metin);
    }

    // Satır bazlı animasyon etiketi (satırın tamamına uygulanır)
    function satirEtiketi() {
      if (anim === "fade") return "{\\fad(180,180)}";
      if (anim === "slide") {
        var c = assCapa(st.konum, pw, ph, altBosluk);
        return "{\\move(" + c.x + "," + (c.y + 42) + "," + c.x + "," + c.y + ",0,220)\\fad(150,0)}";
      }
      return "";
    }

    var vurguAss = assRenk(st.vurguRenk);

    if (ANIMASYONLAR[anim].kelimeli) {
      assKaraokeSatirlari(cs).forEach(function (grup) {
        var sonBitis = grup[grup.length - 1].end;

        if (anim === "karaoke") {
          var parcalar = grup.map(function (c) {
            var sure = Math.max(1, Math.round((c.end - c.start) * 100)); // santisaniye
            return "{\\k" + sure + "}" + assMetin(c.text);
          });
          olay(grup[0].start, sonBitis, parcalar.join(" "));
          return;
        }

        /*
         * vurgu/pop/bounce: kelime başına BİR ardışık pencere.
         * Pencere i, kelime i'nin başından bir SONRAKİ kelimenin başına sürer
         * (son kelimede satırın bitişine). Olaylar hiç örtüşmediği için libass
         * çakışma kaydırması tetiklenmez, satır yerinde durur.
         */
        for (var i = 0; i < grup.length; i++) {
          var pBas = grup[i].start;
          var pSon = (i + 1 < grup.length) ? grup[i + 1].start : sonBitis;
          if (pSon - pBas < 0.01) pSon = pBas + 0.01;

          var parca = [];
          for (var j = 0; j < grup.length; j++) {
            var k = assMetin(grup[j].text);
            /*
             * \t'nin üçüncü parametresi ivme eğrisi: t^accel. accel<1 hızlı
             * başlayıp yumuşak oturur (ease-out) — "premium" hissin kaynağı
             * tam bu; doğrusal büyüme mekanik ve ucuz durur.
             */
            if (anim === "vurgu") {
              // satırın tamamı hep görünür; aktif kelime renk + hafif büyüme alır
              if (j === i) {
                parca.push("{\\1c" + vurguAss + "\\fscx114\\fscy114\\t(0,110,0.6,\\fscx100\\fscy100)}" + k + "{\\r}");
              } else {
                parca.push(k);
              }
            } else if (j <= i) {
              // pop/bounce: kelimeler birikerek gelir; yalnız YENİ kelime animasyonlu
              if (j === i) {
                var giris = (anim === "pop")
                  ? "{\\fscx38\\fscy38\\t(0,90,0.55,\\fscx106\\fscy106)\\t(90,150,\\fscx100\\fscy100)}"
                  : "{\\fscx30\\fscy30\\t(0,85,0.5,\\fscx124\\fscy124)\\t(85,175,0.8,\\fscx100\\fscy100)}";
                parca.push(giris + k + "{\\r}");
              } else {
                parca.push(k);
              }
            }
          }
          olay(pBas, pSon, parca.join(" "));
        }
      });
    } else {
      var etiket = satirEtiketi();
      if (kelimeVerisi) {
        // kelime segmentleri var ama satır animasyonu istendi: satır olarak birleştir
        assKaraokeSatirlari(cs).forEach(function (grup) {
          var metin = grup.map(function (c) { return assMetin(c.text); }).join(" ");
          olay(grup[0].start, grup[grup.length - 1].end, etiket + metin);
        });
      } else {
        cs.forEach(function (c) {
          olay(c.start, c.end, etiket + assMetin(c.text));
        });
      }
    }
    return bas.join("\n") + "\n";
  }

  /*
   * Premiere'in createCaptionTrack'i HER çağrıda YENİ bir altyazı izi açar; var olanı
   * değiştirmenin betik yolu yok. Düzelt-uygula-düzelt döngüsünde kullanıcı farkında
   * olmadan üst üste izler biriktiriyor ve altyazılar çakışık görünüyor.
   * Çözüm: aynı sekansa ikinci kez uygulamadan önce açıkça onay iste.
   */
  var uygulananSekans = {};   // sekans adı -> son uygulama zamanı (oturum içi)
  var onayBekleyen = null;
  var UYGULA_ETIKET = "Sekansa uygula";

  function uygulaEtiketiniSifirla() {
    onayBekleyen = null;
    var b = el("cap-apply");
    if (b) { b.textContent = UYGULA_ETIKET; b.classList.remove("warn"); }
  }

  /* ---------------- Animasyonlu altyazı: timeline'a overlay ---------------- */

  /*
   * Premiere'in caption izi kelime kelime vurgu yapamıyor (ExtendScript'ten
   * caption stiline erişim de yok). Bu yüzden altyazıyı ŞEFFAF bir video
   * katmanı olarak render edip kullanıcının sekansındaki boş bir video
   * kanalına koyuyoruz: kurgusuna dokunmadan CapCut görünümü elde ediyor.
   *
   * Codec qtrle (QuickTime Animation): ölçümde ProRes 4444'ten 12 kat küçük
   * (26 MB/dk'ya karşı 317) ve 4 kat hızlı, üstelik kayıpsız RGB. Sebebi
   * içerik: karenin neredeyse tamamı değişmeyen saydam piksel, RLE bunu
   * mükemmel sıkıştırıyor. Uyumsuzluk çıkarsa ProRes 4444 yedeği var.
   */
  async function overlayUygula() {
    if (typeof Pro !== "undefined" && !Pro.gate("overlay")) return; // Pro: animasyonlu katman
    if (segments.length === 0) return;
    /*
     * Emoji bekçisi: libass emojiyi HİÇ çizemiyor (denendi — tofu bile değil,
     * boş). Sessizce emojisiz render etmek kullanıcıyı "neden kayboldu" diye
     * bırakır; dürüst olan burada durup yol göstermek.
     */
    if (emojiIceriyorMu()) {
      status("Altyazıda emoji var. Stilli katman motoru emoji çizemiyor; " +
        "emojili altyazı için \"Sekansa uygula\"yı kullan (Premiere renkli çizer) " +
        "ya da emojileri kaldırıp tekrar dene.", "warn");
      return;
    }
    var btn = el("cap-overlay");
    if (btn) btn.disabled = true;
    var temizle = [];

    try {
      status("Sekans bilgisi alınıyor…");
      var spec = await K.call("KS_overlaySpec", {});
      if (!spec.ok) throw new Error(spec.error);

      var g = spec.width || 1920, y = spec.height || 1080;
      // ProRes 4:4:4 tek sayı boyut kabul etmez; qtrle için de zararsız
      if (g % 2) g++;
      if (y % 2) y++;
      var fps = spec.fps > 0 ? spec.fps : 25;

      /*
       * Overlay sekansın BAŞINDAN başlar (ya da in noktasından), bu yüzden
       * altyazı zamanları o başlangıca göre kaydırılmalı: ffmpeg'in ürettiği
       * videonun 0. saniyesi, timeline'da klibin konduğu ana denk gelir.
       */
      var baslangic = (scope === "inout" && spec.inPoint > 0) ? spec.inPoint : 0;
      var cs = cueler();
      if (!cs.length) throw new Error("Yazılacak altyazı yok.");
      var sonBitis = cs[cs.length - 1].end - baslangic;
      var sure = Math.max(1, Math.ceil(sonBitis + 2));

      var st = stil();
      var karaoke = /^k/.test(el("cap-maxlen").value);
      var ass = buildAssKaydirilmis(baslangic,
        { karaoke: karaoke, animasyon: st.animasyon, genislik: g, yukseklik: y });

      // ffmpeg altyazı filtresi mutlak yol kabul etmiyor: kendi klasöründe çalıştır
      var dizin = K.path.join(K.tmpDir(), "overlay-" + Date.now());
      K.fs.mkdirSync(dizin, { recursive: true });
      var assAd = "altyazi.ass";
      K.fs.writeFileSync(K.path.join(dizin, assAd), ass, "utf8");
      temizle.push(K.path.join(dizin, assAd));

      /*
       * Paket font seçiliyse dosyayı render klasörüne kopyala ve libass'e
       * fontsdir ile ver. Yol yine GÖRECELİ (fontsdir=.) — mutlak yol,
       * filtre sözdizimindeki ":" yüzünden burada da patlar.
       */
      var fontsdir = "";
      if (FONTLAR[st.font]) {
        try {
          var fKaynak = K.path.join(uzantiDizini(), "fonts", FONTLAR[st.font]);
          if (K.fs.existsSync(fKaynak)) {
            K.fs.copyFileSync(fKaynak, K.path.join(dizin, FONTLAR[st.font]));
            temizle.push(K.path.join(dizin, FONTLAR[st.font]));
            fontsdir = ":fontsdir=.";
          } else {
            K.log("[altyazı] paket font dosyası yok: " + fKaynak);
          }
        } catch (eF2) { K.log("[altyazı] font kopyalanamadı: " + eF2.message); }
      }

      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı.");

      var cikti = K.path.join(K.srtDir(), "suflo-altyazi-" + Date.now() + ".mov");
      K.fs.mkdirSync(K.path.dirname(cikti), { recursive: true });

      status("Altyazı katmanı hazırlanıyor… (" + Math.round(sure) + " sn)");

      /*
       * alpha=1 ZORUNLU: subtitles filtresinde varsayılan false ve yazılmazsa
       * libass alfayı hiç işlemez — video tamamen görünmez çıkar.
       * unpremultiply: ffmpeg premultiplied üretir, Premiere straight bekler;
       * olmadan yazı kenarlarında koyu hale oluşur. Boyuta etkisi yok.
       */
      var kaynak = "color=c=black@0.0:s=" + g + "x" + y + ":r=" + fps + ":d=" + sure +
        ",format=rgba,subtitles=f=" + assAd + ":alpha=1" + fontsdir + ",unpremultiply=inplace=1";

      var r = await K.run(ff, ["-y", "-f", "lavfi", "-i", kaynak, "-c:v", "qtrle", "-an", cikti],
        { timeout: 3600000, cwd: dizin });

      if (r.code !== 0 || !K.fs.existsSync(cikti)) {
        throw new Error("Altyazı katmanı üretilemedi: " +
          String(r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 200));
      }

      status("Timeline'a yerleştiriliyor…");
      var yer = await K.call("KS_placeOverlay",
        { path: cikti, scope: scope, name: "Suflo Altyazı" }, 120000);
      if (!yer.ok) throw new Error(yer.error);

      var mb = (K.fs.statSync(cikti).size / 1048576).toFixed(1);
      status("");
      KApp.toast("Altyazı " + yer.trackName + " katmanına eklendi" +
        (yer.newTrack ? " (yeni katman açıldı)" : "") + " · " + mb + " MB", "good", 8000);
      yildizIste();
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      temizle.forEach(function (f) { try { K.fs.unlinkSync(f); } catch (e2) {} });
      if (btn) btn.disabled = false;
    }
  }

  /*
   * Overlay videosu klibin konduğu andan başlar; bu yüzden ASS zamanları
   * o başlangıca göre sıfırlanır. buildAss doğrudan cueler() okuduğu için
   * segmentleri geçici olarak kaydırıp geri koyuyoruz.
   */
  function buildAssKaydirilmis(offset, opts) {
    if (!offset) return buildAss(opts);
    var yedek = segments.map(function (s) { return { start: s.start, end: s.end }; });
    try {
      segments.forEach(function (s) { s.start -= offset; s.end -= offset; });
      return buildAss(opts);
    } finally {
      segments.forEach(function (s, i) { s.start = yedek[i].start; s.end = yedek[i].end; });
    }
  }

  async function apply() {
    if (segments.length === 0) return;
    var sekans = (KApp.ctx().sequence || "") || "?";
    if (uygulananSekans[sekans] && onayBekleyen !== sekans) {
      onayBekleyen = sekans;
      var btn = el("cap-apply");
      btn.textContent = "Yine de yeni altyazı izi ekle";
      btn.classList.add("warn");
      KApp.toast("Bu sekansa zaten altyazı uyguladın. Premiere var olan izi güncelleyemiyor, " +
        "YENİ bir altyazı izi ekler — eskisini silmezsen ikisi üst üste görünür.", "warn");
      return;
    }
    try {
      var srt = buildSrt();
      if (!srt) { KApp.toast("Yazılacak altyazı metni kalmadı.", "bad"); return; }
      // Premiere içe aktardığı SRT'yi KOPYALAMAZ, diskteki yola referans verir. Bu yüzden
      // temp'e yazmak yasak (biz ya da Windows süpürünce projedeki altyazı kırılır):
      // proje klasörü varsa oraya, yoksa kalıcı srt klasörüne yaz.
      var dir = K.srtDir();
      try {
        var pr = await K.call("KS_projectDir", {});
        if (pr.ok && pr.dir && K.fs.existsSync(pr.dir)) {
          K.fs.accessSync(pr.dir, K.fs.constants.W_OK);   // yazılamıyorsa srtDir'de kal
          dir = pr.dir;
        }
      } catch (eD) {}
      var p = K.path.join(dir, "suflo_" + Date.now() + ".srt");
      K.fs.writeFileSync(p, "﻿" + srt, "utf8");
      var r = await K.call("KS_importSrtAsCaptions", { srtPath: p });
      if (r.ok) {
        uygulananSekans[sekans] = Date.now();
        uygulaEtiketiniSifirla();
        if (r.captionTrack) {
          // Yalnızca iş gerçekten sekansa yerleştiyse taslağı sil.
          // cancelDraft şart: 1,2 sn içinde bir tuş vuruşu olduysa zamanlayıcı taslağı diriltir.
          cancelDraft();
          K.clearDraft();
          hideRestore();
          KApp.toast("Altyazı izi oluşturuldu", "good");
          yildizIste();
        } else {
          // caption izi oluşmadı: düzenlenebilir tek kopya olan taslağı SİLME
          KApp.toast("SRT projeye alındı — proje panelinden timeline'a sürükle: " + p, "good");
        }
      } else {
        KApp.toast(r.error, "bad");
      }
    } catch (e) {
      KApp.toast(e.message, "bad");
    }
  }

  /* ---------------- Emoji seçici ---------------- */

  /*
   * Görsel emoji seti: Twemoji SVG'leri (CC-BY 4.0, emoji/LISANS.txt).
   * Apple'ın emoji çizimleri Apple'ın telifli eseri olduğu için paketlenemez;
   * görsel set kullanmanın asıl değeri tutarlılık — karakter olarak eklenen
   * emoji her platformda farklı çizilir, görsel her yerde aynıdır.
   *
   * İki mod:
   *   Metne ekle   → emoji KARAKTERİ seçili satıra girer. "Sekansa uygula"
   *                  yolunda Premiere kendi motoruyla renkli çizer.
   *                  Stilli katmanda ÇİZİLEMEZ (libass emoji desteklemiyor,
   *                  kanıtlandı: tofu bile değil, boş) — o yol uyarıyla durur.
   *   Sahneye bırak → SVG panelde PNG'ye çevrilir, playhead'e küçük bir
   *                  grafik klip olarak iner. Viral kurgudaki "kocaman 🔥
   *                  pat diye girer" görünümü budur ve libass'ten bağımsızdır.
   */
  var EMOJI_ARAMA = {
    "😂": "gulme komik lol", "🤣": "gulme yerlere komik", "😅": "ter gulme",
    "😍": "ask kalp goz begen", "🥹": "duygu aglamakli tatli", "😮": "sasirma vay",
    "😱": "sok korku cigLik", "🤯": "beyin patlama sok", "🙄": "goz devirme biktim",
    "😭": "aglama huzun", "🥶": "soguk donma", "😴": "uyku sikici", "🤔": "dusunme acaba",
    "😎": "havali gozluk", "✅": "onay tamam dogru tik", "❌": "hayir yanlis iptal",
    "⚠️": "uyari dikkat", "❗": "unlem onemli", "❓": "soru", "💯": "yuz tam mukemmel",
    "👇": "asagi ok", "👆": "yukari ok", "👉": "sag ok isaret", "🔝": "top zirve ust",
    "👍": "begen tamam", "👎": "begenme koty", "👏": "alkis bravo", "🙏": "tesekkur dua rica",
    "🤝": "anlasma el sikisma", "💪": "guc kas", "🤞": "sans dilek",
    "🔥": "ates alev viral", "💰": "para kese zengin", "🤑": "para goz dolar",
    "💸": "para ucan harcama", "📈": "grafik artis buyume", "🚀": "roket firlama",
    "⭐": "yildiz favori", "🏆": "kupa sampiyon birinci", "🎯": "hedef isabet",
    "⚡": "simsek hizli enerji", "🎬": "klaket film kurgu", "🎥": "kamera video",
    "🎧": "kulaklik muzik ses", "🎵": "nota muzik", "📱": "telefon mobil",
    "💡": "fikir ampul", "⏰": "saat alarm zaman", "📌": "pin sabit not",
    "🎁": "hediye kutu", "❤️": "kalp ask sevgi"
  };

  /*
   * TR arama köprüsü: katalogdaki adlar İngilizce (emoji-data). Türkçe sorgu
   * önce burada İngilizce karşılıklarına genişletilir, sonra adlarda aranır.
   * Anahtarlar aksansız yazılır; sorgu da aksansızlaştırılır (ateş -> ates).
   */
  var EMOJI_TR = {
    "ates": "fire", "alev": "fire", "kalp": "heart", "ask": "heart love", "sevgi": "heart",
    "gulme": "laugh joy rofl", "komik": "laugh joy", "aglama": "cry sob tear", "uzgun": "sad cry",
    "opucuk": "kiss", "para": "money dollar bank", "zengin": "money", "el": "hand",
    "alkis": "clap", "dua": "pray", "tesekkur": "pray thanks", "roket": "rocket",
    "yildiz": "star", "gunes": "sun", "ay": "moon", "kopek": "dog", "kedi": "cat",
    "yemek": "food", "pizza": "pizza", "kahve": "coffee", "cay": "tea", "bayrak": "flag",
    "turkiye": "turkey", "azerbaycan": "azerbaijan", "futbol": "soccer", "basketbol": "basketball",
    "muzik": "music note", "kamera": "camera", "video": "video movie", "film": "movie clapper",
    "telefon": "phone", "bilgisayar": "computer laptop", "ucak": "airplane", "araba": "car",
    "ev": "house home", "agac": "tree", "cicek": "flower blossom", "deniz": "water wave ocean",
    "yagmur": "rain", "kar": "snow", "dondurma": "ice cream", "pasta": "cake",
    "dogumgunu": "birthday", "hediye": "gift", "kitap": "book", "kalem": "pencil pen",
    "makas": "scissors", "kilit": "lock", "anahtar": "key", "saat": "clock watch",
    "zaman": "clock hourglass", "uyari": "warning", "yasak": "prohibited no",
    "tik": "check", "onay": "check", "tamam": "check ok", "carpi": "cross mark",
    "hayir": "cross no", "soru": "question", "unlem": "exclamation", "ok": "arrow",
    "yukari": "up", "asagi": "down", "sag": "right", "sol": "left", "guclu": "muscle flex",
    "kas": "muscle", "bebek": "baby", "kadin": "woman", "erkek": "man", "adam": "man",
    "aile": "family", "gozluk": "glasses sunglasses", "kral": "crown king", "tac": "crown",
    "kafatasi": "skull", "olum": "skull death", "hayalet": "ghost", "seytan": "imp devil",
    "melek": "angel halo innocent", "palyaco": "clown", "maymun": "monkey", "aslan": "lion",
    "ayi": "bear", "tavsan": "rabbit", "yilan": "snake", "balik": "fish", "kus": "bird",
    "kelebek": "butterfly", "ari": "bee honeybee", "orumcek": "spider", "at": "horse",
    "inek": "cow", "domuz": "pig", "panda": "panda", "elma": "apple", "muz": "banana",
    "cilek": "strawberry", "karpuz": "watermelon", "uzum": "grapes", "limon": "lemon",
    "biber": "pepper", "ekmek": "bread", "peynir": "cheese", "yumurta": "egg",
    "tavuk": "chicken", "patates": "fries potato", "makarna": "spaghetti", "bira": "beer",
    "sarap": "wine", "sise": "bottle", "top": "ball", "oyun": "game video game",
    "kupa": "trophy", "sampiyon": "trophy medal", "madalya": "medal", "hedef": "dart target",
    "beyin": "brain", "goz": "eye", "agiz": "mouth", "dil": "tongue", "burun": "nose",
    "kulak": "ear", "ayak": "foot", "sus": "shush quiet", "sessiz": "mute quiet",
    "uyku": "sleep zzz", "havali": "sunglasses cool", "sok": "shock astonished exploding",
    "korku": "fear scream", "kizgin": "angry rage", "sinirli": "angry", "dusunme": "thinking",
    "utanma": "flushed blush", "ter": "sweat", "hasta": "sick ill mask thermometer",
    "parti": "party tada confetti", "kutlama": "party tada", "dans": "dance dancer",
    "isik": "light bulb", "fikir": "bulb idea", "simsek": "zap lightning", "enerji": "zap",
    "bomba": "bomb", "silah": "pistol", "bicak": "knife", "cekic": "hammer",
    "ingiliz anahtari": "wrench", "temizlik": "soap sponge broom", "tuvalet": "toilet",
    "banyo": "bath shower", "polis": "police", "doktor": "health worker doctor",
    "asci": "cook chef", "ogretmen": "teacher", "yazilim": "technologist computer",
    "grafik": "chart", "artis": "chart increasing", "dusus": "chart decreasing",
    "takvim": "calendar", "posta": "mail envelope", "mektup": "envelope", "kutu": "package box",
    "cop": "wastebasket trash", "pil": "battery", "buyutec": "magnifying",
    "mikrofon": "microphone", "kulaklik": "headphone", "hoparlor": "speaker loud",
    "zil": "bell", "gemi": "ship boat", "tren": "train", "bisiklet": "bicycle bike",
    "motor": "motorcycle", "otobus": "bus", "dunya": "earth globe world", "harita": "map",
    "cadir": "tent camping", "dag": "mountain", "plaj": "beach", "sehir": "city",
    "gece": "night", "gokkusagi": "rainbow", "bulut": "cloud", "ruzgar": "wind",
    "sicak": "hot fire", "soguk": "cold freezing"
  };

  var emojiKatalog = null;     // katalog.json — 3770 emoji, kategoriler, sheet koordinatları
  var emojiEsleme = null;      // 51 Twemoji SVG (çevrimdışı yedek)
  var emojiMod = "metin";
  var emojiSetAdi = "apple";   // apple | twitter — spritesheet seçimi
  var emojiKatSecim = -1;      // -1 = tümü
  var emojiSheetCss = null;    // hazır sheet'in CSS url'i
  var emojiGeo = null;         // { cols, rows } sprite geometrisi
  var sonSegmentGirdisi = null;

  function trAksansiz(s) {
    return String(s).toLocaleLowerCase("tr")
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
  }

  function emojiDizini() {
    return nodeVarMi() ? K.path.join(uzantiDizini(), "emoji") : "emoji";
  }
  function nodeVarMi() { return !!(K && K.nodeOK); }

  async function emojiEslemeYukle() {
    if (emojiEsleme) return emojiEsleme;
    try {
      if (nodeVarMi()) {
        emojiEsleme = JSON.parse(K.fs.readFileSync(K.path.join(emojiDizini(), "esleme.json"), "utf8"));
      } else {
        emojiEsleme = await (await fetch("emoji/esleme.json")).json();
      }
    } catch (e) {
      K.log("[emoji] esleme yuklenemedi: " + e.message);
      emojiEsleme = {};
    }
    return emojiEsleme;
  }

  async function emojiKatalogYukle() {
    if (emojiKatalog) return emojiKatalog;
    try {
      if (nodeVarMi()) {
        emojiKatalog = JSON.parse(K.fs.readFileSync(K.path.join(emojiDizini(), "katalog.json"), "utf8"));
      } else {
        emojiKatalog = await (await fetch("emoji/katalog.json")).json();
      }
      /*
       * Geometri TAHMİNİ (gerçek ölçüm sheet yüklenince yapılır): katalogdan
       * maxX+1 sütun saymak YANILTIR — Apple görseli olmayan hücreler katalog
       * dışı kalınca sütun eksik sayılıyor ve sprite'lar yarım hücre kayıyordu.
       */
      var mx = 0, my = 0;
      emojiKatalog.emojiler.forEach(function (e) {
        if (e.x > mx) mx = e.x;
        if (e.y > my) my = e.y;
      });
      emojiGeo = { cols: mx + 1, rows: my + 1 };
    } catch (e) {
      K.log("[emoji] katalog yuklenemedi: " + e.message);
      emojiKatalog = null;
    }
    return emojiKatalog;
  }

  function emojiDurum(metin, oran) {
    var kutu = el("cap-emoji-durum");
    if (!kutu) return;
    kutu.hidden = !metin;
    el("cap-emoji-durum-metin").textContent = metin || "";
    var bar = el("cap-emoji-durum-bar");
    if (bar) bar.style.width = (oran != null ? Math.round(oran * 100) : 0) + "%";
  }

  /*
   * Spritesheet: Apple/Twemoji çizimleri TELİF nedeniyle pakete konamaz
   * (Apple'ın emoji sanatı Apple'ın eseridir). Panel seti ilk kullanımda
   * KULLANICININ makinesine indirir — ffmpeg ve Whisper modeliyle aynı
   * model; repo yalnız MIT lisanslı metadata taşır. Tek dosya (20 MB),
   * 3770 ayrı istek değil.
   */
  async function emojiSheetHazirla() {
    var url = emojiKatalog.sheet.url.replace("-apple", "-" + emojiSetAdi).replace("/apple/", "/" + emojiSetAdi + "/");
    if (!nodeVarMi()) { emojiSheetCss = url; return; }   // tarayıcı önizlemesi: doğrudan CDN

    var hedef = K.path.join(K.emojiSetDir(), emojiSetAdi + "-64.png");
    var varMi = false;
    try { varMi = K.fs.existsSync(hedef) && K.fs.statSync(hedef).size > 1000000; } catch (e) {}
    if (!varMi) {
      emojiDurum((emojiSetAdi === "apple" ? "Apple" : "Twemoji") +
        " emoji seti indiriliyor (~20 MB, tek seferlik)…", 0);
      var d = await K.download(url, hedef, function (f) {
        emojiDurum("Emoji seti indiriliyor… %" + Math.round(f * 100), f);
      }, 0, undefined, { key: "emoji:" + emojiSetAdi });
      if (!d.ok) throw new Error(d.error || "emoji seti indirilemedi");
    }
    emojiDurum("");
    emojiSheetCss = "file:///" + hedef.replace(/\\/g, "/");
  }

  /* Gerçek sütun/satır sayısı görselin kendisinden: hücre aralığı 66px (64+2 pay) */
  function emojiGeoOlc() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var c = Math.round(img.naturalWidth / 66);
        var r = Math.round(img.naturalHeight / 66);
        if (c > 0 && r > 0) emojiGeo = { cols: c, rows: r };
        resolve();
      };
      img.onerror = function () { resolve(); };   // katalog tahminiyle devam
      img.src = emojiSheetCss;
    });
  }

  function emojiKatCiz() {
    var kutu = el("cap-emoji-kats");
    if (!kutu || !emojiKatalog) return;
    kutu.innerHTML = "";
    var sayilar = {};
    emojiKatalog.emojiler.forEach(function (e) { sayilar[e.g] = (sayilar[e.g] || 0) + 1; });

    function cip(ad, deger, sayi) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = ad;
      if (sayi) {
        var n = document.createElement("b");
        n.textContent = String(sayi);
        b.appendChild(n);
      }
      if (deger === emojiKatSecim) b.className = "on";
      b.addEventListener("click", function () {
        emojiKatSecim = deger;
        el("cap-emoji-ara").value = "";
        emojiKatCiz();
        emojiGridCiz();
      });
      kutu.appendChild(b);
    }
    cip("Tümü", -1, emojiKatalog.emojiler.length);
    emojiKatalog.kategoriler.forEach(function (ad, i) { cip(ad, i, sayilar[i] || 0); });
  }

  function emojiHucre(e) {
    var b = document.createElement("button");
    b.type = "button";
    b.title = e.n.split(" ").slice(0, 4).join(" ");
    var s = document.createElement("span");
    s.className = "em";
    /*
     * Yüzde tabanlı sprite konumlama: piksel tabanlı ofset, kesirli ölçekte
     * hücre hücre kayma biriktiriyordu (her emoji yarım görünüyordu).
     * bg-size = kolon*%100 iken pozisyon x/(kolon-1) tam hücre başına düşer —
     * ölçekten bağımsız, kaymasız.
     */
    s.style.backgroundImage = "url('" + emojiSheetCss + "')";
    s.style.backgroundSize = (emojiGeo.cols * 100) + "% " + (emojiGeo.rows * 100) + "%";
    s.style.backgroundPosition =
      (e.x * 100 / (emojiGeo.cols - 1)) + "% " + (e.y * 100 / (emojiGeo.rows - 1)) + "%";
    b.appendChild(s);
    b.addEventListener("click", function () { emojiSec(e.c, e); });
    return b;
  }

  function emojiGridCiz() {
    var grid = el("cap-emoji-grid");
    if (!grid) return;
    grid.innerHTML = "";

    /* Katalog ya da sheet yoksa: 51 Twemoji SVG ile çevrimdışı yedek */
    if (!emojiKatalog || !emojiSheetCss) {
      if (!emojiEsleme) return;
      Object.keys(emojiEsleme).forEach(function (ch) {
        var b = document.createElement("button");
        b.type = "button";
        var img = document.createElement("img");
        img.alt = ch;
        img.src = (nodeVarMi() ? "file:///" + emojiDizini().replace(/\\/g, "/") + "/" : "emoji/") + emojiEsleme[ch];
        b.appendChild(img);
        b.addEventListener("click", function () { emojiSec(ch); });
        grid.appendChild(b);
      });
      return;
    }

    var sorgu = trAksansiz(el("cap-emoji-ara").value).trim();
    var jetonlar = sorgu ? sorgu.split(/\s+/).map(function (j) {
      return EMOJI_TR[j] ? j + " " + EMOJI_TR[j] : j;   // TR köprüsü: her jeton EN karşılıklarıyla genişler
    }) : [];

    var parca = document.createDocumentFragment();
    var sonKat = -9;
    var sayi = 0;
    for (var i = 0; i < emojiKatalog.emojiler.length; i++) {
      var e = emojiKatalog.emojiler[i];
      if (!sorgu && emojiKatSecim !== -1 && e.g !== emojiKatSecim) continue;
      if (sorgu) {
        var metin = e.n + " " + (EMOJI_ARAMA[e.c] || "");
        var uydu = true;
        for (var j = 0; j < jetonlar.length; j++) {
          var secenekler = jetonlar[j].split(" ");
          var biri = false;
          for (var k = 0; k < secenekler.length; k++) {
            if (secenekler[k] && metin.indexOf(secenekler[k]) !== -1) { biri = true; break; }
          }
          if (!biri) { uydu = false; break; }
        }
        if (!uydu) continue;
      }
      // "Tümü" görünümünde kategori başlıkları (aramada gereksiz)
      if (!sorgu && emojiKatSecim === -1 && e.g !== sonKat) {
        sonKat = e.g;
        var bas = document.createElement("div");
        bas.className = "emoji-baslik";
        bas.textContent = emojiKatalog.kategoriler[e.g];
        parca.appendChild(bas);
      }
      parca.appendChild(emojiHucre(e));
      sayi++;
    }
    grid.appendChild(parca);
    if (sorgu && sayi === 0) {
      var yok = document.createElement("div");
      yok.className = "emoji-baslik";
      yok.textContent = "Sonuç yok — İngilizce de deneyebilirsin (fire, heart…)";
      grid.appendChild(yok);
    }
  }

  function emojiSec(ch, giris) {
    if (emojiMod === "sahne") { emojiSahneyeBirak(ch, giris); return; }
    var inp = sonSegmentGirdisi;
    if (!inp || !inp.isConnected) {
      KApp.toast("Önce listeden bir altyazı satırına tıkla.", "warn");
      return;
    }
    var i = parseInt(inp.dataset.i, 10);
    var bas = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
    var son = inp.selectionEnd != null ? inp.selectionEnd : bas;
    // emoji ile metin arasında boşluk bırak: "kelime🔥" değil "kelime 🔥"
    var sol = inp.value.slice(0, bas);
    var ek = (sol && !/\s$/.test(sol) ? " " : "") + ch;
    inp.value = sol + ek + inp.value.slice(son);
    if (!isNaN(i) && segments[i]) { segments[i].text = inp.value; saveDraftSoon(); }
    inp.focus();
    var yeniKonum = bas + ek.length;
    try { inp.setSelectionRange(yeniKonum, yeniKonum); } catch (e) {}
    onizlemeCiz();
  }

  /*
   * Emoji -> 512px şeffaf PNG -> playhead'e grafik klip. Üç çizim yolu,
   * kalite sırasıyla:
   *   1) Sistem emoji fontu canvas'ta (Mac: Apple Color Emoji = GERÇEK Apple
   *      çizimi, her boyutta net; Win: Segoe UI Emoji). Piksel sayımıyla
   *      doğrulanır — eski CEF'lerde renkli font çizilemeyebiliyor.
   *   2) Paketteki 51 Twemoji SVG'den biriyse: vektörden 512'ye, net.
   *   3) İndirilen spritesheet'in 64px hücresi büyütülür (yumuşatmalı; en son çare).
   */
  function emojiPikselVarMi(ctx) {
    var v = ctx.getImageData(96, 96, 320, 320).data;
    var dolu = 0;
    for (var i = 3; i < v.length; i += 4) { if (v[i] > 8) dolu++; }
    return dolu > 400;
  }

  async function emojiSahneyeBirak(ch, giris) {
    if (!nodeVarMi()) { KApp.toast("Sahneye bırakma yalnız Premiere içinde çalışır.", "warn"); return; }
    try {
      var c = document.createElement("canvas");
      c.width = 512; c.height = 512;
      var ctx = c.getContext("2d");

      // 1) sistem emoji fontu
      ctx.font = "440px \"Apple Color Emoji\",\"Segoe UI Emoji\",\"Noto Color Emoji\",sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, 256, 276);

      if (!emojiPikselVarMi(ctx)) {
        ctx.clearRect(0, 0, 512, 512);
        var svgAd = emojiEsleme && emojiEsleme[ch];
        if (svgAd) {
          // 2) paket Twemoji SVG
          var svg = K.fs.readFileSync(K.path.join(emojiDizini(), svgAd), "utf8");
          await new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () { ctx.drawImage(img, 0, 0, 512, 512); resolve(); };
            img.onerror = function () { reject(new Error("SVG çizilemedi")); };
            img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          });
        } else if (emojiSheetCss && giris) {
          // 3) spritesheet hücresi
          await new Promise(function (resolve, reject) {
            var img = new Image();
            img.onload = function () {
              ctx.imageSmoothingEnabled = true;
              ctx.drawImage(img, giris.x * 66 + 1, giris.y * 66 + 1, 64, 64, 0, 0, 512, 512);
              resolve();
            };
            img.onerror = function () { reject(new Error("sheet okunamadı")); };
            img.src = emojiSheetCss;
          });
        } else {
          throw new Error("bu emoji çizilemedi");
        }
      }

      var kod = Array.from(ch).map(function (k) {
        return k.codePointAt(0).toString(16);
      }).join("-");
      var hedef = K.path.join(K.srtDir(), "emoji-" + kod + ".png");
      K.fs.mkdirSync(K.path.dirname(hedef), { recursive: true });
      K.fs.writeFileSync(hedef, c.toDataURL("image/png").split(",")[1], "base64");

      var r = await K.call("KS_placeGraphic", { path: hedef, dur: 1.6, name: "Emoji " + ch }, 60000);
      if (!r.ok) throw new Error(r.error);
      KApp.toast(ch + " " + r.trackName + " katmanına, playhead'e bırakıldı", "good");
    } catch (e) {
      KApp.toast("Emoji bırakılamadı: " + e.message, "bad");
    }
  }

  async function emojiPaneliDoldur() {
    await emojiEslemeYukle();          // çevrimdışı yedek her koşulda hazır olsun
    await emojiKatalogYukle();
    if (emojiKatalog) {
      try {
        await emojiSheetHazirla();
        await emojiGeoOlc();
      } catch (e) {
        K.log("[emoji] sheet hazirlanamadi: " + e.message);
        emojiDurum("Set indirilemedi — çevrimdışı yedek gösteriliyor (51 emoji).");
        emojiSheetCss = null;
      }
    }
    emojiKatCiz();
    emojiGridCiz();
  }

  function initEmoji() {
    var ac = el("cap-emoji-ac");
    var panel = el("cap-emoji-panel");
    if (!ac || !panel) return;

    try { emojiSetAdi = K.settings().emojiSet || "apple"; } catch (e) {}
    var setSec = el("cap-emoji-set");
    if (setSec) setSec.value = emojiSetAdi;

    ac.addEventListener("click", async function (e) {
      e.stopPropagation();
      if (panel.hidden) {
        panel.hidden = false;
        el("cap-emoji-ara").focus();
        await emojiPaneliDoldur();
      } else panel.hidden = true;
    });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !panel.contains(e.target) && e.target !== ac) panel.hidden = true;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) panel.hidden = true;
    });

    var araZaman = null;
    el("cap-emoji-ara").addEventListener("input", function () {
      if (araZaman) clearTimeout(araZaman);
      araZaman = setTimeout(emojiGridCiz, 120);   // 3770 hücreyi her tuşta değil, nefes alınca çiz
    });

    if (setSec) {
      setSec.addEventListener("change", async function () {
        emojiSetAdi = setSec.value;
        emojiSheetCss = null;
        try {
          var s = K.settings();
          s.emojiSet = emojiSetAdi;
          K.saveSettings();
        } catch (e) {}
        try {
          await emojiSheetHazirla();
          await emojiGeoOlc();
        } catch (e2) { emojiDurum("Set indirilemedi: " + e2.message); }
        emojiGridCiz();
      });
    }

    Array.prototype.forEach.call(el("cap-emoji-mod").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("cap-emoji-mod").querySelectorAll("button"), function (x) {
          x.classList.remove("on");
        });
        b.classList.add("on");
        emojiMod = b.dataset.m;
        el("cap-emoji-hint").textContent = emojiMod === "sahne"
          ? "Playhead'e grafik klip olarak iner · Mac'te gerçek Apple çizimi"
          : "Seçili satıra eklenir · görseller kullanıcı makinesine indirilir";
      });
    });

    // hangi satırın aktif olduğunu izle (emoji oraya girer)
    el("cap-segments").addEventListener("focusin", function (e) {
      if (e.target && e.target.tagName === "INPUT" && e.target.dataset.i !== undefined) {
        sonSegmentGirdisi = e.target;
      }
    });
  }

  // Astral (surrogate) karakter = pratikte emoji. Stilli katman yolunun bekçisi.
  function emojiIceriyorMu() {
    for (var i = 0; i < segments.length; i++) {
      if (/[\uD800-\uDFFF☀-➿⭐❗✅❌]/.test(segments[i].text || "")) return true;
    }
    return false;
  }

  /*
   * Ucuncu basarili uygulamadan sonra BIR KEZ yildiz iste.
   * Kurallar bilincli: (1) mutlu anda sorulur, isin ortasinda degil, (2) omurde tek sefer,
   * (3) kapatilabilir ve isi engellemez. Erken veya tekrarlayan istek uruna zarar verir.
   */
  function yildizIste() {
    var s = K.settings();
    if (s.yildizSoruldu) return;
    s.basariliUygulama = (s.basariliUygulama || 0) + 1;
    K.saveSettings();
    if (s.basariliUygulama < 3) return;

    s.yildizSoruldu = true;
    K.saveSettings();

    // toast yerine kalici, kapatilabilir bir serit: kullanici hazir oldugunda tiklar
    var bar = el("star-bar");
    if (!bar) return;
    bar.hidden = false;
  }

  function initYildizBar() {
    var bar = el("star-bar");
    if (!bar) return;
    el("star-go").addEventListener("click", function () {
      K.cs.openURLInDefaultBrowser("https://github.com/" + K.REPO);
      bar.hidden = true;
    });
    el("star-close").addEventListener("click", function () { bar.hidden = true; });
  }

  function saveToDesktop(name, content) {
    var dir = K.path.join(K.os.homedir(), "Desktop");
    if (!K.fs.existsSync(dir)) dir = K.os.homedir();
    var p = K.path.join(dir, name);
    K.fs.writeFileSync(p, content, "utf8");
    return p;
  }

  /*
   * Seçili biçimde dosyaya yaz. ASS'te BOM YAZILMAZ: libass/ffmpeg BOM'lu [Script Info]
   * başlığını tanımıyor. SRT/VTT/TXT'te BOM Türkçe karakterler için kalsın.
   */
  function saveAs() {
    try {
      var fmt = (el("cap-export-fmt") && el("cap-export-fmt").value) || "srt";
      var kelimeModu = /^(k1|kc|w\d+)$/.test(el("cap-maxlen").value);
      var icerik, ad, bom = "﻿";
      if (fmt === "txt") {
        var lines = segments.map(function (s) { return styleText(s.text); }).filter(Boolean);
        if (!lines.length) { KApp.toast("Yazılacak metin yok.", "bad"); return; }
        icerik = lines.join("\r\n");
        ad = "suflo-transkript.txt";
      } else if (fmt === "vtt") {
        icerik = buildVtt();
        ad = "suflo-altyazi.vtt";
      } else if (fmt === "ass") {
        if (typeof Pro !== "undefined" && !Pro.gate("assexport")) return;    // Pro: stilli ASS
        icerik = buildAss({ karaoke: kelimeModu, animasyon: stil().animasyon });
        ad = "suflo-altyazi.ass";
        bom = "";
      } else {
        icerik = buildSrt();
        ad = "suflo-altyazi.srt";
      }
      if (!icerik) { KApp.toast("Yazılacak altyazı metni kalmadı.", "bad"); return; }
      var yol = saveToDesktop(ad, bom + icerik);
      var not = (fmt === "ass" && kelimeModu) ? " · karaoke etiketleriyle" : "";
      KApp.toast("Kaydedildi: " + yol + not, "good");
    } catch (e) {
      KApp.toast(e.message, "bad");
    }
  }

  /* ---------------- Başlat ---------------- */

  function init() {
    el("cap-go").addEventListener("click", go);
    el("cap-apply").addEventListener("click", apply);
    if (el("cap-overlay")) el("cap-overlay").addEventListener("click", overlayUygula);
    el("cap-save").addEventListener("click", saveAs);
    el("cap-import-srt").addEventListener("click", function (e) { e.preventDefault(); importSrt(); });
    el("cap-preset-save").addEventListener("click", saveUserPreset);
    el("cap-translate-go").addEventListener("click", translateAll);
    el("cap-revert").addEventListener("click", revertTranslate);
    el("cap-fr-go").addEventListener("click", findReplace);
    el("cap-fr-glossary").addEventListener("click", addToGlossary);
    el("cap-undo").addEventListener("click", undo);
    el("cap-redo").addEventListener("click", redo);
    el("cap-shift-back").addEventListener("click", function () { shiftAll(-0.5); });
    el("cap-shift-fwd").addEventListener("click", function () { shiftAll(0.5); });
    el("cap-add-line").addEventListener("click", function () { insertAfter(segments.length - 1); });
    initYildizBar();
    initStilKartlari();
    initEmoji();
    // acilista secili sablonu kartlara yansit
    if (el("cap-preset") && el("cap-preset").value) stilKartiIsaretle(el("cap-preset").value);

    /* Görünüm kontrolleri: her değişiklikte önizleme anında yenilenir ve kaydedilir */
    ["cap-font", "cap-boyut", "cap-renk", "cap-renk-kontur", "cap-renk-vurgu",
     "cap-kontur", "cap-konum", "cap-kutu", "cap-animasyon"].forEach(function (id) {
      var e = el(id);
      if (!e) return;
      // renk seçicide "input" anlık, diğerlerinde "change" yeterli
      var olay = e.type === "color" ? "input" : "change";
      e.addEventListener(olay, function () {
        onizlemeDurdur();
        vurguKutusuDurumu();     // animasyon değişince ipucu ve vurgu rengi durumu
        onizlemeCiz();
        savePrefs();
        // stil elle değiştiyse artık hazır şablonda değiliz
        if (el("cap-preset")) el("cap-preset").value = "";
        stilKartiIsaretle("");
      });
    });
    if (el("cap-onizleme-oynat")) el("cap-onizleme-oynat").addEventListener("click", onizlemeOynat);
    if (el("cap-onizleme-kare")) el("cap-onizleme-kare").addEventListener("click", kareTazele);

    // Satır uzunluğu karaoke'ye geçince vurgu rengi anlam kazanır: önizleme onu da yansıtsın
    if (el("cap-maxlen")) {
      el("cap-maxlen").addEventListener("change", function () {
        onizlemeDurdur();
        vurguKutusuDurumu();
        onizlemeCiz();
      });
    }
    vurguKutusuDurumu();
    onizlemeCiz();
    // panel genişleyince ölçek değişir; önizleme yeniden çizilmeli
    window.addEventListener("resize", function () { onizlemeCiz(); });

    // Ctrl+Z / Ctrl+Y — metin alanında yazarken tarayıcının kendi geri alması çalışsın
    document.addEventListener("keydown", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var t = e.target;
      var yaziyor = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      var k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey && !yaziyor) { e.preventDefault(); undo(); }
      else if ((k === "y" || (k === "z" && e.shiftKey)) && !yaziyor) { e.preventDefault(); redo(); }
    });

    ensureUserPresetOption();

    // Yarım kalmış transkript varsa kurtarmayı öner
    try {
      var d = K.loadDraft();
      if (d) {
        setTimeout(function () {
          KApp.toast("Yarım kalmış transkript var (" + d.segments.length +
            " satır). Kurtarmak için Altyazı sekmesindeki düğmeye bas.", "good");
          var b = el("cap-restore");
          if (b) {
            b.hidden = false;
            b.textContent = "Kurtar: " + d.segments.length + " satır" +
              (d.sequence ? " · " + d.sequence : "");
            b.onclick = function () { restoreDraft(d); b.hidden = true; };
          }
        }, 1500);
      }
    } catch (eD) {}

    Array.prototype.forEach.call(el("cap-scope").querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(el("cap-scope").querySelectorAll("button"), function (x) {
          x.classList.remove("on");
        });
        b.classList.add("on");
        scope = b.dataset.s;
        el("cap-go-scope").textContent = b.textContent;
        renderTracks(KApp.ctx(), true);
        refreshButton();
      });
    });

    el("cap-groq-link").addEventListener("click", function (e) {
      e.preventDefault();
      K.cs.openURLInDefaultBrowser("https://console.groq.com/keys");
    });
    el("cap-local-install").addEventListener("click", function () {
      KApp.installLocalWhisper(el("cap-local-install"));
    });
    el("cap-key-save").addEventListener("click", function () {
      var v = el("cap-key-input").value.trim();
      if (!v) return;
      var s = K.settings();
      s.apiKey = v;
      if (s.provider === "local" && !K.whisperLocal()) s.provider = "groq";
      K.saveSettings();
      document.getElementById("set-apikey").value = v;
      document.getElementById("set-provider").value = s.provider;
      refreshSetup();
      KApp.toast("Anahtar kaydedildi", "good");
    });

    // şablon seçimi kontrolleri günceller; elle değişiklik şablonu "Özel"e düşürür
    el("cap-preset").addEventListener("change", function () {
      applyPreset(this.value);
      savePrefs();
    });
    ["cap-maxlen", "cap-case", "cap-punct", "cap-lang"].forEach(function (id) {
      el(id).addEventListener("change", function () {
        if (id !== "cap-lang") el("cap-preset").value = "";
        savePrefs();
      });
    });
    loadPrefs();

    var sonSekans = null;
    KApp.onContext(function (ctx) {
      // başka sekansa geçildiyse bekleyen "yine de ekle" onayı düşsün
      if (ctx.sequence !== sonSekans) { sonSekans = ctx.sequence; uygulaEtiketiniSifirla(); }
      refreshButton();
      renderTracks(ctx);
    });
    refreshSetup();
  }

  return {
    init: init,
    refreshSetup: refreshSetup,
    glossaryText: glossaryText,
    parseGlossary: parseGlossary
  };
})();
