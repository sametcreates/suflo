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

  // panelle birlikte gelen WAV export presetleri (once 16 kHz, olmazsa 48 kHz)
  function bundledEpr() {
    try {
      var root = K.cs.getSystemPath(SystemPath.EXTENSION);
      if (root) {
        root = root.replace(/\//g, "\\");
        return [root + "\\jsx\\presets\\wav16k.epr", root + "\\jsx\\presets\\wav48k.epr"];
      }
    } catch (e) {}
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
    if (s.provider === "local") return !!K.whisperLocal();
    return !!s.apiKey;
  }

  function refreshSetup() {
    el("cap-setup").hidden = engineReady();
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
    if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");
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
    var args = [
      "-m", lw.model,
      "-f", audioPath,
      "-l", lang,
      "-oj", "-of", outBase,
      "-t", String(threads),
      "-pp"
    ];
    // karaoke: her kelime kendi zaman damgasıyla ayrı segment olur
    if (wordLevel) args = args.concat(["-ml", "1", "-sow"]);
    var r = await K.run(lw.exe, args, {
      timeout: 7200000,
      onStderr: function (s) {
        var m = s.match(/progress\s*=\s*(\d+)%/);
        if (m) status("Transkribe ediliyor… %" + m[1] + " (yerel)");
      }
    });
    var jsonPath = outBase + ".json";
    if (!K.fs.existsSync(jsonPath)) {
      throw new Error("Yerel motor çıktı üretmedi: " +
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

  // "00:00:01,380" -> saniye
  function tcParse(t) {
    var m = String(t).match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return 0;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
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

  /* ---------------- Şablonlar + tercih kalıcılığı ---------------- */

  var PRESETS = {
    yt:      { maxlen: "c42", kase: "normal", punct: true },
    reels:   { maxlen: "w3",  kase: "upper",  punct: false },
    karaoke: { maxlen: "k1",  kase: "upper",  punct: false },
    doc:     { maxlen: "c60", kase: "normal", punct: true }
  };

  function applyPreset(key) {
    var p = (key === "user") ? K.settings().userPreset : PRESETS[key];
    if (!p) return;
    el("cap-maxlen").value = p.maxlen;
    el("cap-case").value = p.kase;
    el("cap-punct").checked = p.punct;
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
      punct: el("cap-punct").checked
    };
    K.saveSettings();
    ensureUserPresetOption();
    el("cap-preset").value = "user";
    savePrefs();
    KApp.toast("Şablonun kaydedildi — menüde ★ Şablonum", "good");
  }

  function savePrefs() {
    try {
      var s = K.settings();
      s.capPrefs = {
        lang: el("cap-lang").value,
        maxlen: el("cap-maxlen").value,
        kase: el("cap-case").value,
        punct: el("cap-punct").checked,
        preset: el("cap-preset").value
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
    } catch (e) {}
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
  function wavDuration(p) {
    try {
      var b = K.fs.readFileSync(p);
      var br = b[28] | (b[29] << 8) | (b[30] << 16) | (b[31] << 24);
      if (br > 0) return Math.max(0, (b.length - 44) / br);
    } catch (e) {}
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
      b.className = "track-chip" + (on ? " on" : "") + (faded ? " empty" : "");
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
      var useLocal = K.settings().provider === "local";
      var audioSrc, seqOffset, durHint;

      var speedFactor = 1;
      var batchClips = null; // coklu klip: [clip, ...] — tek klipte null kalir
      if (scope === "clip") {
        var sc = await K.call("KS_getSelectedClips");
        if (sc.ok && sc.clips && sc.clips.length > 1) {
          batchClips = sc.clips;
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
        var ex = await K.call("KS_exportAudio", { scope: scope, epr: bundledEpr(), tracks: trackArg });
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
      var mapped = [];

      if (batchClips) {
        // toplu islem: klipler sirayla; biri patlarsa digerleri devam eder
        var failed = [];
        for (var bi = 0; bi < batchClips.length; bi++) {
          var bc = batchClips[bi];
          var tag = "Klip " + (bi + 1) + "/" + batchClips.length + " (" + bc.name + "): ";
          try {
            status(tag + "ses çıkarılıyor…");
            var ba = await convertAudio(bc.mediaPath, {
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
        if (/^w\d+$/.test(lenVal)) {
          segments = splitWords(mapped, parseInt(lenVal.slice(1), 10) || 3);
        } else {
          segments = splitLong(mapped, parseInt(lenVal.slice(1), 10) || 42, 4.5);
        }
      }
      savePrefs();
      if (segments.length === 0) throw new Error("Konuşma bulunamadı.");

      status("");
      el("cap-result").hidden = false;
      el("cap-result-info").textContent = segments.length + " satır · düzenleyip uygula";
      render();
      KApp.toast(segments.length + " altyazı satırı hazır", "good");
    } catch (e) {
      status("✕ " + e.message, "bad");
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
    var box = el("cap-segments");
    box.innerHTML = "";
    segments.forEach(function (s, i) {
      var row = document.createElement("div");
      row.className = "seg";

      var t = document.createElement("button");
      t.className = "seg-time mono jump";
      t.textContent = tc(s.start, false).slice(3, 8);
      t.title = "Playhead'i buraya götür";
      t.onclick = function () { K.call("KS_setPlayerPosition", { sec: s.start }); };

      var inp = document.createElement("input");
      inp.type = "text";
      inp.value = s.text;
      inp.oninput = function () { segments[i].text = inp.value; };

      var mrg = document.createElement("button");
      mrg.className = "seg-x";
      mrg.textContent = "⨝";
      mrg.title = "Sonraki satırla birleştir";
      if (i === segments.length - 1) mrg.style.visibility = "hidden";
      mrg.onclick = function () {
        var nx = segments[i + 1];
        if (!nx) return;
        segments[i].text = (segments[i].text + " " + nx.text).replace(/\s+/g, " ").trim();
        segments[i].end = nx.end;
        segments.splice(i + 1, 1);
        render();
      };

      var del = document.createElement("button");
      del.className = "seg-x";
      del.textContent = "×";
      del.title = "Satırı sil";
      del.onclick = function () { segments.splice(i, 1); render(); };

      row.appendChild(t); row.appendChild(inp); row.appendChild(mrg); row.appendChild(del);
      box.appendChild(row);
    });
  }

  /* ---------------- Çeviri (LLM) ---------------- */

  var preTranslate = null; // çeviri öncesi metinler (geri almak için)

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
      preTranslate = texts;
      segments.forEach(function (s, i2) { s.text = String(out[i2] || "").trim() || s.text; });
      status("");
      el("cap-revert").hidden = false;
      render();
      KApp.toast(texts.length + " satır çevrildi", "good");
    } catch (e) {
      status("✕ " + e.message, "bad");
    } finally {
      btn.disabled = false;
    }
  }

  function revertTranslate() {
    if (!preTranslate) return;
    segments.forEach(function (s, i) { if (preTranslate[i] !== undefined) s.text = preTranslate[i]; });
    preTranslate = null;
    el("cap-revert").hidden = true;
    render();
    KApp.toast("Orijinal metne dönüldü");
  }

  /* ---------------- Bul & değiştir ---------------- */

  function findReplace() {
    var find = el("cap-find").value;
    if (!find) return;
    var rep = el("cap-replace").value;
    var n = 0;
    segments.forEach(function (s) {
      if (s.text.indexOf(find) !== -1) {
        s.text = s.text.split(find).join(rep);
        n++;
      }
    });
    render();
    KApp.toast(n ? n + " satırda değiştirildi" : "Eşleşme yok", n ? "good" : undefined);
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
      var txt = lines.slice(ti + 1).join(" ").trim();
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
      var reader = new FileReader();
      reader.onload = function () {
        var segs = parseSrt(reader.result);
        if (!segs.length) { KApp.toast("Dosyada altyazı bulunamadı.", "bad"); return; }
        segments = segs;
        preTranslate = null;
        el("cap-revert").hidden = true;
        el("cap-result").hidden = false;
        el("cap-result-info").textContent = segs.length + " satır · içe aktarıldı";
        render();
        KApp.toast(segs.length + " satır içe aktarıldı — düzenle, çevir, uygula", "good");
      };
      reader.readAsText(input.files[0], "utf-8");
    };
    input.click();
  }

  /* ---------------- SRT + uygulama ---------------- */

  function buildSrt() {
    var out = [], n = 0;
    segments.forEach(function (s, i) {
      var txt = styleText(s.text);
      if (!txt) return; // stil sonrasi bos kalan cue yazilmaz
      n++;
      // minimum 0.3 sn gorunum — ama bir sonraki cue ile CAKISMA (karaoke'de kritik)
      var end = Math.max(s.end, s.start + 0.3);
      var next = segments[i + 1];
      if (next && end > next.start) end = Math.max(next.start, s.start + 0.05);
      out.push(String(n));
      out.push(tc(s.start, true) + " --> " + tc(end, true));
      out.push(txt);
      out.push("");
    });
    return out.join("\r\n");
  }

  async function apply() {
    if (segments.length === 0) return;
    try {
      var srt = buildSrt();
      if (!srt) { KApp.toast("Yazılacak altyazı metni kalmadı.", "bad"); return; }
      var p = K.path.join(K.tmpDir(), "suflo_" + Date.now() + ".srt");
      K.fs.writeFileSync(p, "﻿" + srt, "utf8");
      var r = await K.call("KS_importSrtAsCaptions", { srtPath: p });
      if (r.ok) {
        KApp.toast(r.captionTrack
          ? "Altyazı izi oluşturuldu"
          : "SRT projeye alındı — proje panelinden timeline'a sürükle", "good");
      } else {
        KApp.toast(r.error, "bad");
      }
    } catch (e) {
      KApp.toast(e.message, "bad");
    }
  }

  function saveToDesktop(name, content) {
    var dir = K.path.join(K.os.homedir(), "Desktop");
    if (!K.fs.existsSync(dir)) dir = K.os.homedir();
    var p = K.path.join(dir, name);
    K.fs.writeFileSync(p, content, "utf8");
    return p;
  }

  function saveSrt() {
    try {
      var srt = buildSrt();
      if (!srt) { KApp.toast("Yazılacak altyazı metni kalmadı.", "bad"); return; }
      KApp.toast("Kaydedildi: " + saveToDesktop("suflo-altyazi.srt", "﻿" + srt), "good");
    } catch (e) {
      KApp.toast(e.message, "bad");
    }
  }

  // düz transkript: video açıklaması / blog için, zaman damgasız
  function saveTxt() {
    try {
      var lines = segments.map(function (s) { return styleText(s.text); }).filter(Boolean);
      if (!lines.length) { KApp.toast("Yazılacak metin yok.", "bad"); return; }
      KApp.toast("Kaydedildi: " + saveToDesktop("suflo-transkript.txt", "﻿" + lines.join("\n")), "good");
    } catch (e) {
      KApp.toast(e.message, "bad");
    }
  }

  /* ---------------- Başlat ---------------- */

  function init() {
    el("cap-go").addEventListener("click", go);
    el("cap-apply").addEventListener("click", apply);
    el("cap-save-srt").addEventListener("click", saveSrt);
    el("cap-save-txt").addEventListener("click", saveTxt);
    el("cap-import-srt").addEventListener("click", function (e) { e.preventDefault(); importSrt(); });
    el("cap-preset-save").addEventListener("click", saveUserPreset);
    el("cap-translate-go").addEventListener("click", translateAll);
    el("cap-revert").addEventListener("click", revertTranslate);
    el("cap-fr-go").addEventListener("click", findReplace);
    ensureUserPresetOption();

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

    KApp.onContext(function (ctx) {
      refreshButton();
      renderTracks(ctx);
    });
    refreshSetup();
  }

  return { init: init, refreshSetup: refreshSetup };
})();
