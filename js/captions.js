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
  var mogrtStilleri = [];
  var gercekMogrtStilleri = [];
  var mogrtVitrini = [];
  var mogrtVitriniIsi = null;
  var aktifMogrtOnizlemeDurdur = null;
  var secilenMogrt = null;
  var secilenMotorStili = "";   // Suflo stil motoru (kendi animasyonlu stillerimiz): overlay yolu
  var bekleyenMogrtYolu = "";
  var mogrtBaglam = { width: 0, height: 0 };

  function el(id) { return document.getElementById(id); }

  // Yerel dosya -> URL: "#", "?", "%" ve "'" iceren yollar (O'Neil kullanici adi,
  // "Proje #2" klasoru) onizlemeyi ve CSS url('...')'yi bozmasin
  function dosyaUrl(p) {
    return encodeURI("file:///" + String(p || "").replace(/\\/g, "/"))
      .replace(/#/g, "%23").replace(/\?/g, "%3F").replace(/'/g, "%27");
  }

  // Saf metin islevleri js/caption-text.js'te (Node testleri dogrudan calistirir)
  var CT = window.SufloCaptionText;
  var cleanSegments = CT.cleanSegments;
  var karaokeWords = CT.karaokeWords;
  var karaokeCumulative = CT.karaokeCumulative;
  var splitWords = CT.splitWords;
  var trimOverlongCues = CT.trimOverlongCues;
  var splitLong = CT.splitLong;
  var parseGlossary = CT.parseGlossary;
  function trReplace(text, from, to) { return CT.trReplace(text, from, to, styleLocale() || "tr"); }

  /* ---------------- Geri alma yığını + taslak kaydı ---------------- */

  var undoStack = [];
  var redoStack = [];
  var UNDO_MAX = 50;
  var draftTimer = null;
  /*
   * Ekrandaki belge rehberin örnek klibinin transkripti mi? Örnek ASLA taslak olarak
   * yazılmaz (tek draft.json'daki, henüz kurtarılmamış işi ezmesin) ve "Kurtar" teklifini
   * gizlemez. ornekSekansId: örneğin ait olduğu "Suflo Deneme" sekansı (uygula koruması).
   */
  var ornekBelge = false;
  var ornekSekansId = "";
  var editorQuery = "";
  var editorOnlyIssues = false;
  var selectedSegment = -1;
  var lastCorrection = null;

  /*
   * Uretim anindaki satir modu ("k1" | "kc" | "w" | "plain").
   * Disa aktarim ve overlay, UI'daki GUNCEL secime degil ekrandaki verinin
   * gercek bicimine bakmali: "kc" katlama ve mod degisince yanlis \k uretimi
   * hatalarinin koku UI'dan okumakti.
   */
  var segmentsMode = "plain";

  // Motorun algiladigi dil (ISO kodu): dil secimi "Otomatik" iken buyuk/kucuk
  // harf donusumunun TR/AZ/RU kurallarini uygulayabilmesi icin saklanir.
  var algilananDil = "";

  // Onizleme/ipucu icin: ekranda veri varsa GERCEK bicimine, henuz uretim
  // yapilmadiysa UI secimine bak (bir sonraki uretimin bicimini gosterir).
  function kelimeModuAktif() {
    if (segments.length) return segmentsMode === "k1";
    return /^k/.test(el("cap-maxlen") ? el("cap-maxlen").value : "");
  }
  function dilKodu(x) {
    x = String(x || "").toLowerCase();
    if (x.length === 2) return x;
    return { turkish: "tr", azerbaijani: "az", russian: "ru", english: "en", german: "de", arabic: "ar",
      spanish: "es", french: "fr", portuguese: "pt", italian: "it", dutch: "nl", japanese: "ja" }[x] || "";
  }

  // Geri al yigini girdisi: satirlar + mod + ceviri hedef dili (buyuk harf kurali buna bagli)
  function durumAl(etiket) {
    return { segs: JSON.stringify(segments), etiket: etiket || "", mode: segmentsMode, cevir: ceviriDili,
      shorts: shortsYuklenen, ornek: ornekBelge, ts: Date.now() };
  }
  // shorts: ekrandaki belgenin Shorts kaydi mi (geri alinca taslak dogru yere yazilsin)
  function durumYukle(st) {
    segments = JSON.parse(st.segs);
    if (st.mode) segmentsMode = st.mode;
    if (typeof st.cevir === "string") ceviriDili = st.cevir;
    if (typeof st.shorts === "string") {
      shortsYuklenen = st.shorts;
      try { shortsDugmesi(KApp.ctx()); } catch (eS) {}
    }
    // geri alınan belge örnek değilse taslak yazımı yeniden açılır (aynı belgedeki
    // metin düzenleme anlık görüntüsü bayrak taşımaz: o zaman bayrak değişmez)
    if (typeof st.ornek === "boolean") ornekBelge = st.ornek;
  }

  function snapshot(etiket) {
    uygulaEtiketiniSifirla();
    undoStack.push(durumAl(etiket || ""));
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0;
    refreshUndoUI();
    renderHistory();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(durumAl(""));
    var st = undoStack.pop();
    durumYukle(st);
    render();
    refreshUndoUI();
    renderHistory();
    saveDraftSoon();          // diskteki taslak ekrandakiyle aynı kalsın
    KApp.toast(st.etiket ? "Geri alındı: " + st.etiket : "Geri alındı");
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(durumAl(""));
    durumYukle(redoStack.pop());
    render();
    refreshUndoUI();
    renderHistory();
    saveDraftSoon();
  }

  function refreshUndoUI() {
    var u = el("cap-undo"), r = el("cap-redo");
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
  }

  // Taslağı diske yaz — panel kapanırsa iş kaybolmaz
  function writeDraft() {
    if (ornekBelge) return;   // rehberin örnek transkripti: kayıtlı (kurtarılmamış) taslağa dokunma
    var ctx = KApp.ctx();
    // Ekrandaki Shorts transkripti (hangi sekans acik olursa olsun) ana videonun taslagini
    // ezmesin: duzenlemeler Shorts kaydina yazilir
    if (shortsYuklenen) { shortsKaydiGuncelle(); return; }
    if (!segments.length) { K.clearDraft(); return; } // bosaltilan ekran = bosaltilan taslak
    K.saveDraft({
      segments: segments,
      mode: segmentsMode,
      ceviriDili: ceviriDili,
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
    // (anlık görüntü Shorts bayragini da tasir: sifirlama ONDAN sonra)
    if (segments.length) snapshot("taslak kurtarma");
    else { undoStack.length = 0; redoStack.length = 0; }
    shortsYuklenen = "";
    ornekBelge = false;
    segments = JSON.parse(JSON.stringify(d.segments));   // taslak nesnesini takma adla mutasyona uğratma
    segmentsMode = d.mode || "plain";
    clearRevert();                                       // eski dokümanın metinleri bu satırlara ait değil
    ceviriDili = d.ceviriDili || "";                     // taslak çevrilmişse hedef dil (s.orig satırlarda)
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

  // Baska bir sekme (or. Konusmadan kes) motoru kullanirken ilerleme oraya akar
  var durumYonlendir = null;
  var ekIpucu = "";

  function status(msg, cls) {
    if (durumYonlendir) { durumYonlendir(msg, cls); return; }
    var e = el("cap-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
    if (cls === "bad" && msg) K.log("[altyazı] " + msg);
  }

  /* ---------------- Kurulum durumu ---------------- */

  function engineReady() {
    var s = K.settings();
    return localEngineReady() || (s.provider !== "local" && !!s.apiKey);
  }

  function localEngineReady() {
    return !!KEngine.activeModel() && !!K.whisperLocal();
  }

  function cloudEngineReady() {
    var s = K.settings();
    return s.provider !== "local" && !!s.apiKey;
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
    // kurulum/anahtar durumu degisti: rehber adimlari yalniz Node gercekleriyle tazelenir
    if (window.KOnboarding && KOnboarding.yenile) { try { KOnboarding.yenile(); } catch (eO) {} }
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
      status("Suflo Altyazı Motoru hazır değil — yerel çekirdeği kur veya Ayarlar'dan bulut yedeği ekle.");
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

  // dilAyari: rehberin örnek klibi gibi çağrılar #cap-lang'i ve kayıtlı tercihi
  // değiştirmeden kendi dilini geçirir (undefined → panelde seçili dil)
  async function transcribeLocal(audioPath, wordLevel, dilAyari) {
    var lw = K.whisperLocal();
    if (!lw) throw new Error("Yerel motor kurulu değil — Ayarlar'dan kur.");
    // çıktı tabanı geçici klasörde: rehberin örnek WAV'ı ayar klasöründe duruyor,
    // whisper'ın JSON'u (ve takılma kurtarmanın parçası) oraya yazılmasın
    var outBase = K.path.join(K.tmpDir(), K.path.basename(audioPath).replace(/\.wav$/i, "") + "_w");
    var lang = (dilAyari !== undefined ? dilAyari : el("cap-lang").value) || "auto";
    var threads = 4;
    try { threads = Math.max(2, Math.min(8, K.os.cpus().length - 2)); } catch (e) {}

    // motor katmanı: VAD (sessizlik atlama) + beam search + karaoke bayrakları
    var built = KEngine.buildArgs({
      model: lw.model,
      audio: audioPath,
      lang: lang,
      outBase: outBase,
      threads: threads,
      wordLevel: wordLevel,
      prompt: glossaryPrompt()
    });
    K.log("yerel motor: " + (KEngine.installedBuild() === "cuda" ? "GPU" : "CPU") +
      ", VAD " + (built.vad ? "acik" : "kapali") +
      ", model " + String(lw.model).replace(/^.*[\\\/]/, ""));

    var segs = await yerelCalistir(lw.exe, built.args, outBase, "");

    /*
     * Takilma kurtarma: whisper bir satira takilip sesin sonuna kadar onu
     * tekrarladiysa (cleanSegments sonra bunlari atar, altyazi orada biter),
     * sesi takilma noktasindan kes ve o parcayi onceki metne bakmadan (-mc 0)
     * yeniden coz. Sozluk ipucu --carry-initial-prompt ile korunur.
     */
    var ti = CT.sondaTakilma(segs, wordLevel ? 6 : 3);
    var sesSure = /\.wav$/i.test(audioPath) ? wavDuration(audioPath) : 0;
    if (ti >= 0 && sesSure - segs[ti].start > 5) {
      var kesBas = Math.max(0, segs[ti].start);
      K.log("yerel motor takildi: " + kesBas.toFixed(1) + " sn'den itibaren '" +
        String(segs[ti].text).slice(0, 40) + "' tekrarlaniyor (" + (segs.length - ti) +
        " satir) - kalan ses yeniden cozuluyor");
      var parca = outBase + "_kalan.wav";
      try {
        var ff = await K.findFfmpeg();
        var rk = await K.run(ff, ["-y", "-ss", kesBas.toFixed(3), "-i", audioPath, "-c:a", "pcm_s16le", parca],
          { timeout: 900000 });
        if (rk.code !== 0 || !K.fs.existsSync(parca)) throw new Error("ses kesilemedi");
        var ek = KEngine.buildArgs({
          model: lw.model, audio: parca, lang: lang, outBase: outBase + "_kalan",
          threads: threads, wordLevel: wordLevel, prompt: glossaryPrompt()
        }).args.concat(["-mc", "0"]);
        var kalan;
        try {
          // eski whisper-cli (or. Homebrew) bu bayragi tanimayabilir: o zaman bayraksiz dene
          kalan = await yerelCalistir(lw.exe, ek.indexOf("--prompt") !== -1 ? ek.concat(["--carry-initial-prompt"]) : ek,
            outBase + "_kalan", " · kalan kısım");
        } catch (eCarry) {
          kalan = await yerelCalistir(lw.exe, ek, outBase + "_kalan", " · kalan kısım");
        }
        kalan.forEach(function (sg) { sg.start += kesBas; sg.end += kesBas; });
        var yeniden = CT.sondaTakilma(kalan, wordLevel ? 6 : 3);
        K.log("takilma kurtarma: " + kalan.length + " satir eklendi" +
          (yeniden >= 0 ? " (kalan kisim da tekrarla bitiyor)" : ""));
        if (kalan.length) segs = segs.slice(0, ti).concat(kalan);
      } catch (eK) {
        K.log("takilma kurtarma basarisiz: " + (eK && eK.message ? eK.message : eK));
      } finally {
        try { K.fs.unlinkSync(parca); } catch (eP) {}
      }
    }
    if (wordLevel) {
      K.log("yerel kelime modu: " + segs.length + " parça, ilk3=" +
        segs.slice(0, 3).map(function (x) { return x.start.toFixed(2); }).join(","));
    }
    return segs;
  }

  // whisper-cli'yi calistir, JSON ciktisini segmentlere cevir
  async function yerelCalistir(exe, args, outBase, etiket) {
    var r = await K.run(exe, args, {
      timeout: 7200000,
      onStderr: function (s) {
        var m = s.match(/progress\s*=\s*(\d+)%/);
        if (m) status("Transkribe ediliyor… %" + m[1] + " (yerel" + etiket + ")");
      }
    });
    var jsonPath = outBase + ".json";
    if (!K.fs.existsSync(jsonPath)) {
      // çıkış kodu mesajda kalsın: hata rehberi eksik DLL / eski CPU kalıplarını kodla tanır
      throw new Error("Yerel motor çıktı üretmedi (kod=" + r.code + "): " +
        (r.stderr || "").split("\n").slice(-3).join(" ").slice(0, 180));
    }
    var parsed = JSON.parse(K.fs.readFileSync(jsonPath, "utf8").toString());
    if (!etiket) { try { algilananDil = dilKodu(parsed.result && parsed.result.language); } catch (eDil) {} }
    try { K.fs.unlinkSync(jsonPath); } catch (e2) {}
    return (parsed.transcription || []).map(function (t) {
      var s = t.offsets ? t.offsets.from / 1000 : NaN;
      var e = t.offsets ? t.offsets.to / 1000 : NaN;
      // offsets bozuksa timestamps dizgesinden coz ("00:00:01,380")
      if ((!isFinite(s) || (s === 0 && e === 0)) && t.timestamps && t.timestamps.from) {
        s = tcParse(t.timestamps.from);
        e = tcParse(t.timestamps.to);
      }
      var probs = (t.tokens || []).map(function (token) { return Number(token && token.p); })
        .filter(function (p) { return isFinite(p) && p >= 0 && p <= 1; });
      var confidence = probs.length
        ? probs.reduce(function (n, p) { return n + p; }, 0) / probs.length
        : (isFinite(Number(t.avg_logprob)) ? Math.exp(Number(t.avg_logprob)) : undefined);
      return { start: s || 0, end: e || 0, text: String(t.text || "").trim(), confidence: confidence };
    });
  }

  /*
   * "00:00:01,380" · "00:00:04.000 align:start" · "01:23.500" -> saniye.
   * Sona kadar eşleşme aranmaz: WebVTT zaman satırının ardına cue ayarları
   * (align/position/line/size) eklenebiliyor, bunlar zamanı bozmamalı.
   */
  function tcParse(t) {
    var s = String(t).trim();
    var m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + parseFloat("0." + m[4]); // ".5" = 500 ms, 5 ms degil
    // saat alanı olmayan biçim (mm:ss.mmm) — VTT kısa biçimi ve elle düzenlemede yaygın
    var m2 = s.match(/^(\d+):(\d+)[,.](\d+)/);
    if (m2) return (+m2[1]) * 60 + (+m2[2]) + parseFloat("0." + m2[3]);
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

  async function transcribeCloud(audioPath, durHint, wordLevel, dilAyari) {
    var cfg = providerConfig();
    if (!cfg.url) throw new Error("Endpoint tanımsız — Ayarlar'a bak.");
    var fields = { model: cfg.model, response_format: "verbose_json" };
    var prompt = glossaryPrompt();
    if (prompt) fields.prompt = prompt;
    if (wordLevel) fields["timestamp_granularities[]"] = ["word", "segment"];
    var lang = dilAyari !== undefined ? dilAyari : el("cap-lang").value;
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
    try { if (json.language) algilananDil = dilKodu(json.language); } catch (eDil2) {}
    // karaoke: kelime dizisi varsa onu kullan (word alanı "word", segment alanı "text")
    if (wordLevel && json.words && json.words.length) {
      var ws = json.words.map(function (w) {
        return { start: Number(w.start) || 0, end: Number(w.end) || 0, text: String(w.word || "").trim(), confidence: isFinite(Number(w.confidence)) ? Number(w.confidence) : undefined };
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
      var confidence = isFinite(Number(s.confidence)) ? Number(s.confidence)
        : (isFinite(Number(s.avg_logprob)) ? Math.exp(Number(s.avg_logprob)) : undefined);
      return { start: Number(s.start), end: Number(s.end), text: String(s.text || "").trim(), confidence: confidence };
    }).filter(function (s) {
      // Bozuk/eksik zamanli bulut segmenti NaN olarak SRT'ye sizmasin
      return isFinite(s.start) && isFinite(s.end) && s.end >= s.start;
    });
  }

  /*
   * Kullanici tek bir "Suflo Altyazi Motoru" gorur. Suflo once yerel ve en
   * mahrem rotayi dener; kullanici Ayarlar'dan yedek acmissa yalniz yerel
   * cekirdek basarisiz oldugunda buluta gecer. Bu sayede kolaylik icin hata
   * toleransindan vazgecilmez.
   */
  /*
   * secenek (isteğe bağlı): { dil, bulutSes }
   *   dil      #cap-lang yerine bu dil (rehberin örnek klibi: "tr")
   *   bulutSes bulut rotası için hazır sıkıştırılmış ses (örnek klibin MP3'ü):
   *            WAV'ı ffmpeg ile dönüştürmeye gerek kalmaz
   */
  async function transcribeSuflo(audioPath, durHint, wordLevel, tempFiles, secenek) {
    secenek = secenek || {};
    var errors = [];
    if (localEngineReady()) {
      try {
        status("Suflo Motoru · yerel yüksek doğruluk…");
        return await transcribeLocal(audioPath, wordLevel, secenek.dil);
      } catch (eLocal) {
        errors.push("yerel: " + (eLocal && eLocal.message ? eLocal.message : eLocal));
        K.log("Suflo motoru yerel rota basarisiz: " + errors[errors.length - 1]);
      }
    }
    if (cloudEngineReady()) {
      var cloudAudio = secenek.bulutSes || audioPath;
      try {
        if (/\.wav$/i.test(cloudAudio)) {
          status("Suflo Motoru · güvenli yedek için ses hazırlanıyor…");
          cloudAudio = await convertAudio(audioPath, { wav: false, durHint: durHint });
          if (tempFiles) tempFiles.push(cloudAudio);
        }
        status("Suflo Motoru · güvenli bulut yedeği…");
        return await transcribeCloud(cloudAudio, durHint, wordLevel, secenek.dil);
      } catch (eCloud) {
        errors.push("yedek: " + (eCloud && eCloud.message ? eCloud.message : eCloud));
      }
    }
    throw new Error(errors.length
      ? "Suflo Altyazı Motoru tamamlayamadı — " + errors.join(" · ")
      : "Suflo Altyazı Motoru hazır değil — yerel çekirdeği kur veya bulut yedeği ekle.");
  }

  /* ---------------- Terim sözlüğü ---------------- */

  function glossaryText() {
    var g = K.settings().glossary || [];
    return g.map(function (r) { return r.from + " => " + r.to; }).join("\n");
  }

  // Dogru yazimlari motora daha sesi dinlerken ogret. Sonraki deterministik
  // sozluk gecisi yine kalir; prompt yalniz ilk tahmini guclendirir.
  function glossaryPrompt() {
    var rules = K.settings().glossary || [];
    var correct = [];
    rules.forEach(function (r) {
      var t = String(r && r.to || "").trim();
      if (t && correct.indexOf(t) === -1) correct.push(t);
    });
    var terim = correct.length
      ? "Doğru yazılması gereken özel adlar ve terimler: " + correct.join(", ").slice(0, 700) + "."
      : "";
    return (ekIpucu ? ekIpucu + (terim ? " " : "") : "") + terim;
  }

  /*
   * Secili klibin KELIME zamanli transkripti (sequence zamaninda). Altyazi
   * editorune dokunmaz; Konusmadan kes gibi baska araclar kullanir.
   *   opts.clip      KS_getSelectedClips'ten bir klip (yoksa secim okunur)
   *   opts.prompt    motora ek ipucu (or. dolgu seslerini yazdirmak icin)
   *   opts.onStatus  ilerleme mesajlari
   * Doner: { clip, lang, words: [{start, end, text, confidence}] }
   */
  async function transcribeWords(opts) {
    opts = opts || {};
    if (busy) throw new Error("Altyazı motoru şu an başka bir iş yapıyor — bitmesini bekle.");
    if (!engineReady()) throw new Error("Önce Altyazı sekmesinden Suflo Altyazı Motoru'nu kur (ya da Groq anahtarı gir).");
    // busy, ilk await'ten ONCE alinir: secim beklenirken "Altyazı oluştur"a basilirsa
    // iki is ayni durum degiskenlerini (ekIpucu, durumYonlendir) paylasmasin
    busy = true;
    refreshButton();
    // Bu klibin dili altyazi belgesinin algilanan dilini ezmesin
    var belgeDili = algilananDil;
    var temp = [];
    try {
      var clip = opts.clip;
      if (!clip) {
        var sc = await K.call("KS_getSelectedClips");
        if (!sc.ok || !sc.clips || !sc.clips.length) throw new Error("Timeline'da konuşma içeren bir klip seç.");
        clip = sc.clips[0];
      }
      durumYonlendir = opts.onStatus || function () {};
      ekIpucu = String(opts.prompt || "");
      algilananDil = "";
      status("Ses çıkarılıyor…");
      var audio = await convertAudio(clip.mediaPath, {
        wav: localEngineReady(), ss: clip.inPoint, t: clip.dur, durHint: clip.dur
      });
      temp.push(audio);
      var raw = await transcribeSuflo(audio, clip.dur, true, temp);
      var tl = clip.clipEnd - clip.clipStart;
      var hiz = (clip.dur > 0 && tl > 0) ? tl / clip.dur : 1;
      var words = raw.map(function (w) {
        return {
          start: clip.clipStart + w.start * hiz,
          end: clip.clipStart + w.end * hiz,
          text: String(w.text || "").trim(),
          confidence: w.confidence
        };
      }).filter(function (w) {
        // yalniz noktalamadan olusan belirtecler kelime degil
        return w.text.replace(/[.,!?;:…"'«»]/g, "").trim() && isFinite(w.start) && isFinite(w.end);
      });
      words.sort(function (a, b) { return a.start - b.start; });
      return { clip: clip, lang: algilananDil || (el("cap-lang") && el("cap-lang").value) || arayuzDili(), words: words };
    } finally {
      temp.forEach(function (f) { try { K.fs.unlinkSync(f); } catch (e2) {} });
      algilananDil = belgeDili;
      ekIpucu = "";
      durumYonlendir = null;
      busy = false;
      refreshButton();
    }
  }

  // Terim sozlugu ucretsiz cekirdekte (Ayarlar'da kilitsiz gorunur; motor istemine de herkes icin gider)
  function applyGlossary(segs) {
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
  function motorPreset(id) {
    var p = window.SufloStyleEngine && window.SufloStyleEngine.preset(id);
    if (!p) throw new Error("Stil motoru yüklenemedi: " + id);
    return { maxlen: p.text.maxlen, kase: p.text.kase, punct: p.text.punct, stil: p.style };
  }

  var PRESETS = {
    mrbeast: motorPreset("mrbeast"),
    capcut: motorPreset("capcut"),
    saas: motorPreset("saas"),
    viral: motorPreset("viral"),
    pop: motorPreset("pop"),
    doc: motorPreset("doc"),
    premium: motorPreset("premium"),
    // Eski kayitli tercihler acilmaya devam etsin.
    yt: {
      maxlen: "c42", kase: "normal", punct: true,
      stil: { aile: "custom", yogunluk: "balanced", font: "Arial", boyut: 64, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#ffe14d", kontur: 4, konum: 2, kutu: false, animasyon: "yok" }
    },
    reels: {
      // Hormozi görünümü: satır sabit durur, okunan kelime sarıya döner
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "viral", yogunluk: "balanced", font: "Anton", boyut: 96, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#ffe14d", kontur: 6, konum: 5, kutu: false, animasyon: "vurgu" }
    },
    karaoke: {
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "custom", yogunluk: "balanced", font: "Archivo Black", boyut: 92, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#8b7cf6", kontur: 6, konum: 5, kutu: false, animasyon: "karaoke" }
    },
    enerjik: {
      // Bungee + zıplama: çocuk/eğlence içerikleri
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "pop", yogunluk: "hard", font: "Bungee", boyut: 76, renk: "#ffe14d", konturRenk: "#1a1a2e",
              vurguRenk: "#ffffff", kontur: 6, konum: 5, kutu: false, animasyon: "bounce" }
    },
    /* ---- Suflo imza stilleri (keskin, tanınır kimlikler) ---- */
    sari: {
      // Hormozi: kalın beyaz, okunan kelime sarı
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "custom", yogunluk: "balanced", font: "Anton", boyut: 96, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#ffd21e", kontur: 7, konum: 5, kutu: false, animasyon: "vurgu" }
    },
    yesil: {
      // MrBeast/KHABY: çok kalın kontur, okunan kelime parlak yeşil
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "custom", yogunluk: "hard", font: "Archivo Black", boyut: 88, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#2fe36a", kontur: 9, konum: 5, kutu: false, animasyon: "vurgu" }
    },
    kutu: {
      // Kutu-vurgu: okunan kelime dolu kırmızı kutunun içinde
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "custom", yogunluk: "balanced", font: "Archivo Black", boyut: 80, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#ff3b3b", kontur: 3, konum: 5, kutu: true, animasyon: "vurgu" }
    },
    temiz: {
      // Yayın-temiz alt bant: Montserrat, sade, okunur (röportaj/eğitim)
      maxlen: "c42", kase: "normal", punct: true,
      stil: { aile: "custom", yogunluk: "balanced", font: "Montserrat", boyut: 58, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#8b7cf6", kontur: 2, konum: 2, kutu: false, animasyon: "fade" }
    },
    zarif: {
      // Zarif serif: Lora, ince pill, dingin içerik (moda/lifestyle)
      maxlen: "c42", kase: "normal", punct: true,
      stil: { aile: "custom", yogunluk: "balanced", font: "Lora", boyut: 54, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#c5a96b", kontur: 1, konum: 2, kutu: true, animasyon: "fade" }
    },
    neon: {
      // Neon: Bebas parlak camgöbeği, vurgu magenta, gece/oyun içerikleri
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "custom", yogunluk: "balanced", font: "Bebas Neue", boyut: 92, renk: "#45e6ff", konturRenk: "#052b3a",
              vurguRenk: "#ff4df0", kontur: 5, konum: 5, kutu: false, animasyon: "vurgu" }
    },
    beyaz: {
      // Temiz kalın beyaz — MrBeast/haber: kelime kelime beliren, renksiz güçlü
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "custom", yogunluk: "balanced", font: "Anton", boyut: 92, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#f0f0f0", kontur: 7, konum: 5, kutu: false, animasyon: "vurgu" }
    },
    mor: {
      // Mor Vurgu — Sarı'nın soğuk kardeşi, marka/teknoloji içerikleri
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "custom", yogunluk: "balanced", font: "Anton", boyut: 94, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#a78bfa", kontur: 7, konum: 5, kutu: false, animasyon: "vurgu" }
    },
    sticker: {
      // Sticker — Bungee, renkli, zıplayan; eğlence/çocuk içerikleri
      maxlen: "k1", kase: "upper", punct: false,
      stil: { aile: "custom", yogunluk: "hard", font: "Bungee", boyut: 74, renk: "#ffe14d", konturRenk: "#1a1a2e",
              vurguRenk: "#ff6b6b", kontur: 6, konum: 5, kutu: false, animasyon: "bounce" }
    },
    daktilo: {
      // Daktilo — kelime kelime beliren, sakin anlatı/eğitim
      maxlen: "c42", kase: "normal", punct: true,
      stil: { aile: "custom", yogunluk: "balanced", font: "Montserrat", boyut: 54, renk: "#ffffff", konturRenk: "#000000",
              vurguRenk: "#6fdca0", kontur: 2, konum: 2, kutu: false, animasyon: "karaoke" }
    }
  };

  // Stil motorundaki her stil (yeni eklenenler dahil) tek kaynaktan sablon olur.
  // Ayni adli eski "custom" sablonlari (neon, daktilo) EZER: kart motor stilini
  // gosteriyor; eski sablon kalsaydi "Neon ile ekle" eski ASS yoluna dusuyordu.
  if (window.SufloStyleEngine) {
    window.SufloStyleEngine.list().forEach(function (mp) {
      PRESETS[mp.id] = motorPreset(mp.id);
    });
  }

  function motorStiliMi(id) { return !!(window.SufloStyleEngine && window.SufloStyleEngine.has(id)); }

  // Altyazi verisinin bicimi: kelime stilleri satir altyazisini kelimelere boler
  function motorCueTuru() {
    if (!segments.length || segmentsMode === "k1") return "words";
    if (segmentsMode === "kc") return "cumulative";
    return "lines";
  }

  function applyPreset(key) {
    var p = (key === "user") ? K.settings().userPreset : PRESETS[key];
    if (!p) return;
    secilenMogrt = null;
    // "user" (Şablonum) gibi anahtarlar motor stili tasiyabilir: stilin ailesine bak
    secilenMotorStili = motorStiliMi(key) ? key : (p.stil && motorStiliMi(p.stil.aile) ? p.stil.aile : "");
    bekleyenMogrtYolu = "";
    el("cap-maxlen").value = p.maxlen;
    el("cap-case").value = p.kase;
    el("cap-punct").checked = p.punct;
    stiliYaz(p.stil);
    vurguKutusuDurumu();
    onizlemeDurdur();
    onizlemeCiz();
    stilKartiIsaretle(key);
    uygulamaIpucunuGuncelle();
  }

  // Seçili kartı görsel olarak işaretle (stil elle değişince hiçbiri seçili kalmaz)
  function stilKartiIsaretle(key) {
    var grid = el("cap-stil-grid");
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll(".stil-sec"), function (b) {
      var mogrtYolu = b.getAttribute("data-mogrt-path") || "";
      b.classList.toggle("secili", mogrtYolu
        ? !!(secilenMogrt && secilenMogrt.path === mogrtYolu)
        : (!secilenMogrt && b.dataset.preset === key));
    });
  }

  function mogrtOrani(item) {
    var hay = String((item && item.path) || "") + " " + String((item && item.display) || "");
    if (/(?:Portrait|9[•x:._-]?16)/i.test(hay)) return "portrait";
    if (/(?:Landscape|16[•x:._-]?9)/i.test(hay)) return "landscape";
    if (/(?:Square|1[•x:._-]?1)/i.test(hay)) return "square";
    return "unknown";
  }

  function sekansOrani() {
    var w = Number(mogrtBaglam.width) || 0, h = Number(mogrtBaglam.height) || 0;
    if (!w || !h) return "portrait";
    var r = w / h;
    return r > 1.2 ? "landscape" : (r < .82 ? "portrait" : "square");
  }

  function oranEtiketi(oran) {
    return oran === "landscape" ? "16:9" : (oran === "square" ? "1:1" : "9:16");
  }

  function temizMogrtAdi(item) {
    var ad = String(item && item.display || "Altyazı Şablonu")
      .replace(/^\s*(?:16[•x:._-]?9|9[•x:._-]?16|1[•x:._-]?1)\s*/i, "")
      .replace(/\s+Subtitles?\s*$/i, "") || "Altyazı Şablonu";
    var halkaAcikAdlar = {
      "mr beast": "Creator Punch",
      "tiktok": "Social Pop",
      "obviously": "Bold Statement"
    };
    return halkaAcikAdlar[ad.toLocaleLowerCase("tr-TR")] || ad;
  }

  function mogrtStilAnahtari(item) {
    var ham = String(item && item.styleKey || temizMogrtAdi(item));
    return ham.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  }

  function mogrtVitrinDosyasi(item, alan, uzanti) {
    var rel = String(item && item[alan] || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!new RegExp("^previews\\/[a-z0-9._-]+\\." + uzanti + "$", "i").test(rel)) return "";
    return "assets/pro-caption-showcase/" + rel;
  }

  function mogrtVitrininiYukle() {
    if (mogrtVitrini.length) return Promise.resolve(mogrtVitrini);
    if (mogrtVitriniIsi) return mogrtVitriniIsi;
    mogrtVitriniIsi = Promise.resolve().then(async function () {
      var items = [];
      if (K.nodeOK && K.fs && K.path && K.extensionPath) {
        try {
          var root = K.extensionPath();
          if (root) {
            var raw = JSON.parse(K.fs.readFileSync(K.path.join(root, "assets", "pro-caption-showcase", "catalog.json"), "utf8"));
            items = Array.isArray(raw.items) ? raw.items : [];
          }
        } catch (e) { K.log("[altyazi] Stil vitrini okunamadi: " + (e && e.message)); }
      }
      if (!items.length && typeof fetch === "function") {
        try {
          var res = await fetch("assets/pro-caption-showcase/catalog.json", { cache: "no-store" });
          if (res.ok) {
            var webRaw = await res.json();
            items = Array.isArray(webRaw.items) ? webRaw.items : [];
          }
        } catch (e2) { K.log("[altyazi] Web stil vitrini okunamadi: " + (e2 && e2.message)); }
      }
      mogrtVitrini = items.map(function (item, index) {
        return {
          path: "",
          ad: String(item.id || ("caption-preview-" + index)),
          display: String(item.name || item.styleKey || "Altyazı Stili"),
          styleKey: String(item.styleKey || item.name || ""),
          thumb: mogrtVitrinDosyasi(item, "preview", "webp"),
          previewVideo: mogrtVitrinDosyasi(item, "video", "webm"),
          showcase: true,
          pro: true,
          group: "caption"
        };
      }).filter(function (item) { return item.styleKey && item.thumb; });
      return mogrtVitrini;
    }).then(function (items) {
      mogrtVitriniIsi = null;
      return items;
    }, function (err) {
      mogrtVitriniIsi = null;
      throw err;
    });
    return mogrtVitriniIsi;
  }

  function mogrtStilleriniBirlestir() {
    var pro = typeof Pro === "undefined" || Pro.isPro();
    mogrtStilleri = gercekMogrtStilleri.slice();
    if (!pro) mogrtStilleri = mogrtStilleri.concat(mogrtVitrini);
  }

  function uygulamaIpucunuGuncelle() {
    var hint = el("cap-apply-hint");
    var styleBtn = el("cap-apply-style");
    if (!secilenMogrt && secilenMotorStili) {
      var mAd = (window.SufloStyleEngine.preset(secilenMotorStili) || {}).name || secilenMotorStili;
      if (hint) hint.textContent = mAd + " seçili: Suflo altyazıyı şeffaf bir video katmanı olarak üretip timeline'ın üst kanalına koyar. Normal caption izi her zaman kullanılabilir.";
      if (styleBtn) {
        styleBtn.disabled = false;
        if (kaliteOnayBekleyen !== "style") styleBtn.textContent = mAd + " ile ekle";
      }
    } else if (secilenMogrt) {
      if (hint) hint.textContent = "Normal caption izi her zaman kullanılabilir. " + temizMogrtAdi(secilenMogrt) + " seçili; stil düğmesi MOGRT animasyonunu tüm altyazılara uygular.";
      if (styleBtn) {
        styleBtn.disabled = false;
        if (kaliteOnayBekleyen !== "style") styleBtn.textContent = temizMogrtAdi(secilenMogrt) + " ile ekle";
      }
    } else {
      if (hint) hint.textContent = "Normal ekleme Premiere'in düzenlenebilir caption izini oluşturur. Animasyonlu ekleme için yukarıdan bir stil seç.";
      if (styleBtn) { styleBtn.disabled = true; styleBtn.textContent = "Stil seçerek ekle"; }
    }
  }

  function mogrtStiliniSec(item) {
    if (typeof Pro !== "undefined" && !Pro.gate("mogrt")) return;
    secilenMogrt = item;
    secilenMotorStili = "";
    bekleyenMogrtYolu = "";
    if (el("cap-style-family")) el("cap-style-family").value = "mogrt";
    if (el("cap-preset")) el("cap-preset").value = "";
    stilKartiIsaretle("");
    uygulamaIpucunuGuncelle();
    onizlemeDurdur();
    onizlemeCiz();
    savePrefs();
  }

  /*
   * Suflo Stilleri: kendi stil motorumuzun animasyonlu stilleri. MOGRT
   * gerektirmez; secilince canli onizleme gercek libass ciktisini oynatir,
   * "ile ekle" seffaf bir video katmani uretip timeline'a koyar.
   */
  // Stil kartlarındaki örnek sözcükler arayüz dilinde (önizleme kullanıcı bölgesinde, çevirmen dokunmaz)
  function stilOrnekKelimeleri(buyuk) {
    var en = arayuzDili() === "en";
    var k = en ? ["Don't", "miss", "this"] : ["Bunu", "sakın", "kaçırma"];
    return buyuk ? k.map(function (x) { return x.toLocaleUpperCase(en ? "en-US" : "tr-TR"); }) : k;
  }
  function stilOrnekleriniYaz() {
    var grid = el("cap-stil-grid");
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll(".sm-ornek"), function (o) {
      var k = stilOrnekKelimeleri(o.getAttribute("data-kase") === "upper");
      Array.prototype.forEach.call(o.querySelectorAll(".sm-k"), function (w, i) { if (k[i]) w.textContent = k[i]; });
    });
  }

  function motorStilleriniCiz() {
    var grid = el("cap-stil-grid");
    if (!grid || !window.SufloStyleEngine) return;
    Array.prototype.forEach.call(grid.querySelectorAll(".stil-motor-head,.stil-motor"), function (n) { n.remove(); });
    var kilitli = typeof Pro !== "undefined" && !Pro.isPro();
    var frag = document.createDocumentFragment();
    var head = document.createElement("div");
    head.className = "stil-mogrt-head stil-motor-head";
    var hb = document.createElement("b");
    hb.textContent = "Suflo Stilleri";
    var hs = document.createElement("span");
    hs.textContent = window.SufloStyleEngine.list().length + " animasyonlu stil · After Effects gerekmez";
    head.appendChild(hb); head.appendChild(hs);
    frag.appendChild(head);
    var sel = el("cap-preset");
    window.SufloStyleEngine.list().forEach(function (mp) {
      // gizli select eski kodun okudugu degeri tasir: yeni stillerin secenegi de olsun
      if (sel && !sel.querySelector('option[value="' + mp.id + '"]')) {
        var opt = document.createElement("option");
        opt.value = mp.id; opt.textContent = mp.name;
        sel.appendChild(opt);
      }
      var st = mp.style;
      var card = document.createElement("button");
      card.type = "button";
      card.className = "stil-sec stil-motor stil-motor-" + mp.id;
      card.dataset.preset = mp.id;
      card.setAttribute("aria-label", mp.name + " · " + mp.description);
      var badge = document.createElement("span");
      badge.className = "ss-rozet";
      badge.textContent = "SUFLO";   // kilit rozetini Pro modulu kendisi ekliyor
      var scene = document.createElement("span");
      scene.className = "ss-sahne";
      var ornek = document.createElement("span");
      ornek.className = "sm-ornek";
      ornek.style.fontFamily = '"' + st.font + '", sans-serif';
      ornek.style.color = st.renk;
      ornek.style.setProperty("--sm-vurgu", st.vurguRenk);
      ornek.style.setProperty("--sm-kontur", st.konturRenk);
      ornek.setAttribute("data-kase", mp.text.kase === "upper" ? "upper" : "");
      var kelimeler = stilOrnekKelimeleri(mp.text.kase === "upper");
      kelimeler.forEach(function (k, i) {
        var w = document.createElement("span");   // <i> degil: .stil-sec i kurali kucultup soluklastiriyor
        w.className = "sm-k";
        w.textContent = k;
        if (i === 1) w.className += " sm-aktif";
        ornek.appendChild(w);
        if (i < kelimeler.length - 1) ornek.appendChild(document.createTextNode(" "));
      });
      scene.appendChild(ornek);
      var info = document.createElement("span");
      info.className = "ss-bilgi";
      var title = document.createElement("b");
      title.textContent = mp.name;
      var sub = document.createElement("i");
      sub.textContent = mp.description;
      info.appendChild(title); info.appendChild(sub);
      card.appendChild(badge); card.appendChild(scene); card.appendChild(info);
      card.addEventListener("click", function () {
        // Onizleme herkese acik; timeline'a ekleme Pro (overlay) kapisinda
        if (el("cap-preset")) el("cap-preset").value = mp.id;
        if (el("cap-style-family")) el("cap-style-family").value = "motor";
        applyPreset(mp.id);
        savePrefs();
        if (onizlemeSaat) onizlemeDurdur();
        onizlemeOynat();
      });
      frag.appendChild(card);
    });
    grid.insertBefore(frag, grid.firstChild);
    if (secilenMotorStili && !secilenMogrt) stilKartiIsaretle(secilenMotorStili);
  }

  function mogrtStilleriniCiz() {
    var grid = el("cap-stil-grid");
    if (!grid) return;
    // Suflo Stilleri basligi da .stil-mogrt-head tasir: ona dokunma
    Array.prototype.forEach.call(grid.querySelectorAll(".stil-mogrt-head:not(.stil-motor-head),.stil-mogrt,.stil-mogrt-empty"), function (n) { n.remove(); });
    var oran = sekansOrani();
    var istenenAnahtar = secilenMogrt ? mogrtStilAnahtari(secilenMogrt) : "";
    if (bekleyenMogrtYolu) {
      for (var bi = 0; bi < mogrtStilleri.length; bi++) {
        if (mogrtStilleri[bi].path === bekleyenMogrtYolu) {
          istenenAnahtar = mogrtStilAnahtari(mogrtStilleri[bi]);
          break;
        }
      }
      bekleyenMogrtYolu = "";
    }
    var liste = mogrtStilleri.filter(function (item) {
      var itemOran = mogrtOrani(item);
      return itemOran === oran || itemOran === "unknown";
    });
    var tekil = {};
    liste = liste.filter(function (item) {
      var key = mogrtStilAnahtari(item);
      if (tekil[key]) return false;
      tekil[key] = true;
      return true;
    });
    if (!liste.length) {
      var empty = document.createElement("div");
      empty.className = "stil-mogrt-empty";
      var vitrinBekleniyor = typeof Pro !== "undefined" && !Pro.isPro() && !!mogrtVitriniIsi;
      empty.innerHTML = vitrinBekleniyor
        ? "<b>17 stil hazırlanıyor…</b><span>Gerçek MOGRT önizlemeleri yükleniyor.</span>"
        : "<b>Altyazı şablonu bulunamadı</b><span>Pro lisansını etkinleştirip Ayarlar → Pro İçerikleri bölümünden eşitlemeyi çalıştır.</span>";
      grid.appendChild(empty);
      secilenMogrt = null;
      uygulamaIpucunuGuncelle();
      return;
    }
    liste.sort(function (a, b) { return temizMogrtAdi(a).localeCompare(temizMogrtAdi(b)); });
    if (istenenAnahtar) {
      secilenMogrt = null;
      for (var si = 0; si < liste.length; si++) {
        if (mogrtStilAnahtari(liste[si]) === istenenAnahtar) {
          secilenMogrt = liste[si];
          break;
        }
      }
    }

    var head = document.createElement("div");
    head.className = "stil-mogrt-head";
    var headTitle = document.createElement("b");
    headTitle.textContent = "Premiere Şablonları";
    var headMeta = document.createElement("span");
    var vitrinSayisi = liste.filter(function (item) { return item.showcase; }).length;
    headMeta.textContent = vitrinSayisi
      ? liste.length + " stil · 3 oran · gerçek önizleme"
      : oranEtiketi(oran) + " · " + liste.length + " kullanıma hazır stil";
    head.appendChild(headTitle);
    head.appendChild(headMeta);
    grid.appendChild(head);

    liste.forEach(function (item) {
      var card = document.createElement("button");
      var kilitli = !!item.showcase || (typeof Pro !== "undefined" && !Pro.isPro());
      card.type = "button";
      card.className = "stil-sec stil-mogrt" + (kilitli ? " locked" : "");
      card.setAttribute("data-mogrt-path", item.path || "");
      card.setAttribute("aria-label", temizMogrtAdi(item) + (kilitli ? " · Suflo Pro ile kilidi aç" : " Premiere altyazı stilini seç"));
      var badge = document.createElement("span");
      badge.className = "ss-rozet";
      badge.textContent = kilitli ? "PRO" : "MOGRT";
      var scene = document.createElement("span");
      scene.className = "ss-sahne";
      var previewPoster = null;
      if (item.thumb) {
        var img = document.createElement("img");
        img.src = item.thumb;
        img.alt = "";
        scene.appendChild(img);
        previewPoster = img;
      } else {
        var fallback = document.createElement("span");
        fallback.className = "stil-mogrt-fallback";
        fallback.textContent = temizMogrtAdi(item);
        scene.appendChild(fallback);
        previewPoster = fallback;
      }
      var info = document.createElement("span");
      info.className = "ss-bilgi";
      var title = document.createElement("b");
      title.textContent = temizMogrtAdi(item);
      var sub = document.createElement("i");
      sub.textContent = kilitli ? "Suflo Pro · animasyonu görmek için üzerine gel" : "Premiere Graphic Template · kullanıma hazır";
      info.appendChild(title);
      info.appendChild(sub);
      card.appendChild(badge);
      card.appendChild(scene);
      card.appendChild(info);
      card.addEventListener("click", function () {
        if (kilitli) {
          if (typeof Pro !== "undefined") Pro.gate("captionStyles");
          return;
        }
        mogrtStiliniSec(item);
      });
      if (item.previewVideo) {
        var previewVideo = null;
        function baslat() {
          // CEP, panel acilisinda cok sayida WebM kaynagi ayni anda hazirlaninca
          // Premiere'in GPU surecini kilitleyebiliyor. Yalniz uzerine gelinen tek
          // kart icin video yarat; ayrilinca decoder'i tamamen serbest birak.
          if (aktifMogrtOnizlemeDurdur && aktifMogrtOnizlemeDurdur !== durdur) {
            aktifMogrtOnizlemeDurdur();
          }
          if (!previewVideo) {
            previewVideo = document.createElement("video");
            previewVideo.className = "stil-mogrt-video";
            previewVideo.muted = true;
            previewVideo.loop = true;
            previewVideo.playsInline = true;
            previewVideo.preload = "none";
            previewVideo.poster = item.thumb || "";
            previewVideo.setAttribute("aria-hidden", "true");
            previewVideo.src = item.previewVideo;
            previewVideo.addEventListener("error", durdur, { once: true });
            if (previewPoster) previewPoster.style.display = "none";
            scene.appendChild(previewVideo);
          }
          aktifMogrtOnizlemeDurdur = durdur;
          var oynat = previewVideo.play();
          if (oynat && oynat.catch) oynat.catch(function () {});
        }
        function durdur() {
          if (previewVideo) {
            try {
              previewVideo.pause();
              previewVideo.removeAttribute("src");
              previewVideo.load();
              previewVideo.remove();
            } catch (e) {}
            previewVideo = null;
          }
          if (previewPoster) previewPoster.style.display = "";
          if (aktifMogrtOnizlemeDurdur === durdur) aktifMogrtOnizlemeDurdur = null;
        }
        card.addEventListener("mouseenter", baslat);
        card.addEventListener("mouseleave", durdur);
        card.addEventListener("focus", baslat);
        card.addEventListener("blur", durdur);
      }
      grid.appendChild(card);
    });
    if (secilenMogrt && el("cap-style-family")) el("cap-style-family").value = "mogrt";
    stilKartiIsaretle(el("cap-preset") ? el("cap-preset").value : "");
    uygulamaIpucunuGuncelle();
    onizlemeCiz();
  }

  function refreshMogrtStyles(items) {
    gercekMogrtStilleri = (items || []).filter(function (item) { return item && item.path; });
    mogrtStilleriniBirlestir();
    mogrtStilleriniCiz();
    if (typeof Pro !== "undefined" && !Pro.isPro()) {
      mogrtVitrininiYukle().then(function () {
        mogrtStilleriniBirlestir();
        mogrtStilleriniCiz();
      }).catch(function (e) { K.log("[altyazi] Stil vitrini yuklenemedi: " + (e && e.message)); });
    }
  }

  function initStilKartlari() {
    var grid = el("cap-stil-grid");
    if (!grid) return;
    Array.prototype.forEach.call(grid.querySelectorAll(".stil-sec"), function (b) {
      b.addEventListener("click", function () {
        var key = b.dataset.preset;
        secilenMogrt = null;
        bekleyenMogrtYolu = "";
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
      aile: d("cap-style-family", "custom"),
      yogunluk: d("cap-yogunluk", "balanced"),
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
    "Bungee": "Bungee.ttf",
    "Lora": "Lora.ttf",
    "Montserrat": "Montserrat-Bold.ttf"   // statik Bold: libass degisken fontu secemiyor, DejaVu'ya dusuyordu
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
        mogrtPath: secilenMogrt && secilenMogrt.path ? secilenMogrt.path : "",
        motorStili: secilenMogrt ? "" : secilenMotorStili,
        stil: st
      };
      K.saveSettings();
    } catch (e) {}
  }

  // Dil bilinmediğinde (Otomatik + henüz algılanmadı) arayüz dili: İngilizce arayüzde "tr" varsayımı
  // İngilizce metni Türkçe büyük harf kuralıyla ("THİS") ve Türkçe istemlerle işlerdi
  function arayuzDili() {
    try { return window.SufloI18n ? SufloI18n.getLang() : "tr"; } catch (e) { return "tr"; }
  }

  // "Diğer diller": Whisper'ın tanıdığı öbür diller (README'deki 99 dil seçicide de olsun)
  function digerDilleriEkle() {
    var sel = el("cap-lang");
    if (!sel || !window.SufloDiller || sel.querySelector("optgroup[data-diger]")) return;
    var grup = document.createElement("optgroup");
    grup.label = "Diğer diller";
    grup.setAttribute("data-diger", "1");
    SufloDiller.moreLanguages().forEach(function (d) {
      var o = document.createElement("option");
      o.value = d[0];
      o.textContent = d[1];
      grup.appendChild(o);
    });
    sel.appendChild(grup);
  }

  // CJK / Hint alfabeleri: altyazı izi ve SRT çalışır, stilli katmanın yazı tiplerinde glif olmayabilir
  function glifUyarisi() {
    var not = el("cap-lang-glif"), sel = el("cap-lang");
    if (!not || !sel) return;
    not.hidden = !(window.SufloDiller && SufloDiller.glyphWarning(sel.value));
  }

  function loadPrefs() {
    var p = K.settings().capPrefs;
    // Kayıtlı tercih yokken İngilizce arayüzde altyazı dili Otomatik (Whisper dili kendisi bulur)
    if (!p) { if (arayuzDili() === "en" && el("cap-lang")) el("cap-lang").value = ""; return; }
    try {
      if (p.lang !== undefined) el("cap-lang").value = p.lang;
      if (p.maxlen) el("cap-maxlen").value = p.maxlen;
      if (p.kase) el("cap-case").value = p.kase;
      if (p.punct !== undefined) el("cap-punct").checked = p.punct;
      if (p.preset !== undefined) el("cap-preset").value = p.preset;
      bekleyenMogrtYolu = p.mogrtPath || "";
      // 3.0 oncesi tercihlerde motorStili alani yok: stil ailesinden cikar
      secilenMotorStili = p.mogrtPath ? "" : (motorStiliMi(p.motorStili) ? p.motorStili :
        (p.stil && motorStiliMi(p.stil.aile) ? p.stil.aile : ""));
      stiliYaz(p.stil);
    } catch (e) {}
  }

  // Kayıtlı görünüm ayarlarını kontrollere geri koy
  function stiliYaz(st) {
    if (!st) return;
    var esle = {
      "cap-style-family": st.aile, "cap-yogunluk": st.yogunluk,
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

  function styleLocale(kaynak) {
    // Cevrilmis metin hedef dilin kuralina uyar: Turkce'den Ingilizceye cevrilen
    // "this" BUYUK HARF'te "THİS" olmasin
    if (!kaynak && ceviriVar()) {
      if (ceviriDili) return { tr: "tr-TR", az: "az", ru: "ru" }[ceviriDili];
      // hedef dil bilinmiyor (3.0 oncesi taslak): kaynak kurali degil, cevrilmis
      // metinden tahmin — Turkceye ozgu harf varsa tr, yoksa dil-bagimsiz kural
      var ornek = segments.slice(0, 40).map(function (s) { return s.text; }).join(" ");
      return /[ğışĞİŞ]/.test(ornek) ? "tr-TR" : undefined;
    }
    var l = el("cap-lang").value;
    if (l === "") l = algilananDil; // "Otomatik": motorun algiladigi dile guven
    if (l === "tr") return "tr-TR";
    if (l === "az") return "az";
    if (l === "ru") return "ru";
    return undefined;
  }

  // kaynakDili: true ise metin orijinal (s.orig) — kaynak dilin buyuk/kucuk harf kurali
  function styleText(t, kaynakDili) {
    var mode = el("cap-case").value;
    var keepPunct = el("cap-punct").checked;
    var out = t;
    if (!keepPunct) {
      out = out.replace(/[.,!?;:…»«""()\-–—\u060C\u061F\u061B]/g, " ").replace(/\s+/g, " ").trim();   // + Arapça ، ؟ ؛
    }
    var loc = kaynakDili ? styleLocale(true) : styleLocale();
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

  /*
   * opts.ornek (yalnız rehberin "Örnekte dene" adımı): { wav, mp3, lang, offset, sure }
   * Hazır 16 kHz mono WAV doğrudan yerel motora, MP3 buluta gider: ffmpeg ön
   * denetimi, kapsam/ses dışa aktarımı atlanır; #cap-lang ve kayıtlı tercih
   * değişmez. Tıklama işleyicisi MouseEvent geçirdiği için opts.ornek ayrıca sınanır.
   */
  async function go(opts) {
    if (busy) return false;
    var ornek = (opts && opts.ornek && opts.ornek.wav) ? opts.ornek : null;
    var ctx = KApp.ctx();
    var clip = ctx.sel;
    if (!ornek && scope === "clip" && !clip) { status("Önce timeline'da bir klip seç.", "warn"); return false; }
    var basarili = false;
    busy = true;
    setBusy(true);
    /*
     * Ekranda duzenlenmis is varken yeni transkript uretmek TEK korumasiz
     * yikici yoldu: undo yigini temizlenip taslak da eziliyordu. importSrt
     * kalibi buraya da uygulanir — eski dokuman simdiden yakalanir, asagida
     * yigina itilir; kullanici Ctrl+Z ile geri donebilir.
     */
    var oncekiIs = segments.length
      ? durumAl("yeni transkript")
      : null;
    algilananDil = "";
    var tempFiles = [];
    try {
      /*
       * ffmpeg'i EN BASTA hazirla. Sekans kapsaminda ses disa aktarimi dakikalar
       * suruyor; kontrolu sonraya birakmak, kullanicinin bes dakika bekleyip
       * "ffmpeg bulunamadi" duymasi demekti. Kurulum gerekiyorsa simdi olsun.
       */
      // Rehberin örnek klibi hazır WAV/MP3 ile gelir: ffmpeg gerekmez (ilk altyazı
      // 141 MB'lık ffmpeg indirmesini beklemesin)
      if (!ornek && !(await K.findFfmpeg())) {
        status("ffmpeg kuruluyor… (bir kerelik, ses dönüştürme için gerekli)");
        try {
          await KEngine.installFfmpeg(function (m) { status(m); });
          await K.findFfmpeg(true);
        } catch (eFF) {
          throw new Error("ffmpeg kurulamadı: " + (eFF && eFF.message ? eFF.message : eFF) +
            " — Ayarlar > ffmpeg bölümünden elle bir yol gösterebilirsin.");
        }
      }

      // Kullanici motor secmez: Suflo yerel rota hazirsa WAV, degilse bulut icin
      // sikistirilmis ses hazirlar. Yerel hata verirse transcribeSuflo kendi MP3
      // yedegini olusturup guvenli rotaya gecer.
      var useLocal = localEngineReady();
      var audioSrc, seqOffset, durHint;
      var motorSecenek = null;

      var speedFactor = 1;
      var batchClips = null; // coklu klip: [clip, ...] — tek klipte null kalir
      if (ornek) {
        // ornek dosyalari ayar klasorunde kalici: tempFiles'a EKLENMEZ (silinmesin)
        audioSrc = ornek.wav;
        seqOffset = Number(ornek.offset) || 0;
        durHint = Number(ornek.sure) || wavDuration(ornek.wav) || 15;
        motorSecenek = { dil: ornek.lang || "tr", bulutSes: ornek.mp3 || "" };
      } else if (scope === "clip") {
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

      var lenVal = el("cap-maxlen").value; // "c42" karakter, "w3" kelime, "k1"/"kc" kelime-zamanli
      // Kelime kelime / birikimli modlar UCRETSIZDIR (Samet karari, 20 Agu 2026)
      var karaoke = /^k/.test(lenVal);
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
            var bRaw = await transcribeSuflo(ba, bc.dur, karaoke, tempFiles);
            var bTl = bc.clipEnd - bc.clipStart;
            var bf = (bc.dur > 0 && bTl > 0) ? bTl / bc.dur : 1;
            bRaw.forEach(function (s) {
              if (!s.text) return;
              mapped.push({
                start: bc.clipStart + s.start * bf,
                end: bc.clipStart + s.end * bf,
                text: s.text,
                confidence: s.confidence
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
        status("Suflo Altyazı Motoru dinliyor…");
        var raw = await transcribeSuflo(audioSrc, durHint, karaoke, tempFiles, motorSecenek);

        mapped = raw.map(function (s) {
          return {
            start: seqOffset + s.start * speedFactor,
            end: seqOffset + s.end * speedFactor,
            text: s.text,
            confidence: s.confidence
          };
        }).filter(function (s) { return s.text; });
      }

      // Satir kurma tek yerde (caption-text.js): rehberin hazir ornek transkripti de
      // ayni yolu kullanir, iki cikti hic ayrismaz
      var kurulan;
      try { kurulan = CT.segmentleriKur(mapped, lenVal); }
      catch (eKur) {
        if (eKur && eKur.ayrinti) K.log("karaoke HATA: " + eKur.ayrinti);
        throw eKur;
      }
      segments = kurulan.segments;
      segmentsMode = kurulan.mode;
      applyGlossary(segments);
      if (segments.length === 0) {
        // Eski dokumana geri don: ekrandaki satirlar ile bellek ayrismasin,
        // bos dizi bir sonraki taslak yazimiyla kayitli isi de silmesin.
        if (oncekiIs) durumYukle(oncekiIs); else segments = [];
        throw new Error("Konuşma bulunamadı.");
      }
      if (oncekiIs) {
        undoStack.push(oncekiIs);
        if (undoStack.length > UNDO_MAX) undoStack.shift();
        redoStack.length = 0;
      } else {
        undoStack.length = 0;
        redoStack.length = 0;
      }
      refreshUndoUI();
      savePrefs();

      status("");
      // ekranda taze iş var: eski taslak teklifi artık geçersiz — örnek klip hariç
      // (örnek taslak sayılmaz; kurtarılmamış iş "Kurtar" ile hâlâ geri gelebilsin)
      ornekBelge = !!ornek;
      if (!ornek) hideRestore();
      clearRevert();             // yeni doküman — eski çevirinin orijinalleri buraya ait değil
      shortsYuklenen = "";       // yeni transkript (basariyla geldi): artik Shorts kaydi degil, normal taslak
      uygulaEtiketiniSifirla();  // yeni transkript: uygula düğmesi normal haline dönsün
      el("cap-result").hidden = false;
      el("cap-result-info").textContent = segments.length + " satır · düzenleyip uygula";
      render();
      // Uzun bir transkripsiyon bitti: kullanıcı hiçbir şeye dokunmasa da taslak diskte olsun
      saveDraftNow();
      KApp.toast(segments.length + " altyazı satırı hazır", "good");
      basarili = true;
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      tempFiles.forEach(function (f) { try { K.fs.unlinkSync(f); } catch (e2) {} });
      busy = false;
      setBusy(false);
    }
    if (basarili) sonucBildir({ kaynak: ornek ? "ornek" : "go", satir: segments.length });
    return basarili;
  }

  /*
   * Başarılı transkript dinleyicileri (rehber: "ilk altyazı" adımı). Dinleyici
   * hatası altyazı akışını bozmasın diye her biri ayrı sarılır.
   */
  var sonucDinleyiciler = [];
  function onSonuc(fn) { if (typeof fn === "function") sonucDinleyiciler.push(fn); }
  function sonucBildir(bilgi) {
    sonucDinleyiciler.forEach(function (fn) {
      try { fn(bilgi); } catch (e) { K.log("[altyazı] sonuç dinleyicisi: " + (e && e.message ? e.message : e)); }
    });
  }

  /*
   * Rehberin hazır örnek transkripti (motor ya da anahtar henüz yokken): go() ile
   * AYNI satır kurma yolu (CT.segmentleriKur) ve aynı anlık görüntü/geri al akışı.
   *   veri: SufloOnboarding.ornekKelimeleri() çıktısı { lang, words, segments }
   *   offset: klibin sekanstaki başlangıcı (sn)
   */
  function ornekYukle(veri, offset) {
    if (busy || !veri || !window.SufloOnboarding) return false;
    var lenVal = el("cap-maxlen").value;
    var girdi = window.SufloOnboarding.ornekGirdisi(veri, lenVal, offset);
    if (!girdi.length) return false;
    var kurulan = CT.segmentleriKur(girdi, lenVal);
    if (!kurulan.segments.length) return false;
    // Ekranda iş varsa üzerine yazmadan önce anlık görüntü: Ctrl+Z geri getirir
    // (anlık görüntü Shorts bayrağını taşır: sıfırlama ONDAN sonra)
    if (segments.length) snapshot("örnek transkript");
    else { undoStack.length = 0; redoStack.length = 0; }
    shortsYuklenen = "";
    segments = kurulan.segments;
    segmentsMode = kurulan.mode;
    applyGlossary(segments);
    algilananDil = veri.lang || "tr";
    ornekBelge = true;         // taslak yazılmaz, "Kurtar" teklifi gizlenmez
    clearRevert();
    uygulaEtiketiniSifirla();
    el("cap-result").hidden = false;
    render();                                            // önce render, sonra etiket (render eziyor)
    el("cap-result-info").textContent = segments.length + " satır · örnek transkript";
    refreshUndoUI();
    renderHistory();
    saveDraftNow();
    sonucBildir({ kaynak: "ornekYukle", satir: segments.length });
    return true;
  }

  function setBusy(b) {
    el("cap-go").classList.toggle("busy", b);
    if (b) el("cap-go").disabled = true;
    el("cap-progress").hidden = !b;
    if (!b) refreshButton();
  }

  /* ---------------- Segment düzenleme ---------------- */

  function qualityOptions() {
    var len = el("cap-maxlen") ? el("cap-maxlen").value : "c42";
    var mc = /^c(\d+)$/.exec(len);
    return {
      lang: (ceviriDili && ceviriVar() ? ceviriDili : "") || (el("cap-lang") && el("cap-lang").value) || algilananDil || arayuzDili(),
      maxChars: mc ? Number(mc[1]) : 42,
      wordMode: /^k/.test(len) || segmentsMode === "k1" || segmentsMode === "kc"
    };
  }

  function qualityReport() {
    if (!window.SufloCaptionQuality) return { rows: [], total: segments.length, words: 0, flagged: 0, avgCps: 0, score: 0, bad: 0, warn: 0 };
    return window.SufloCaptionQuality.analyze(segments, qualityOptions());
  }

  function updateQualityUI(report) {
    report = report || qualityReport();
    var score = el("cap-quality-score");
    if (score) {
      score.className = "caption-quality-score " + (report.score >= 90 ? "good" : (report.score >= 72 ? "warn" : "bad"));
      var strong = score.querySelector("strong");
      if (strong) strong.textContent = String(report.score);
    }
    if (el("cap-stat-lines")) el("cap-stat-lines").textContent = String(report.total);
    if (el("cap-stat-flags")) el("cap-stat-flags").textContent = String(report.flagged);
    if (el("cap-stat-speed")) el("cap-stat-speed").textContent = report.avgCps.toFixed(1);
    if (el("cap-stat-words")) el("cap-stat-words").textContent = String(report.words);
    if (el("cap-quality-label")) {
      el("cap-quality-label").textContent = !report.flagged
        ? "Tüm satırlar okunabilirlik ve zamanlama kontrolünden geçti."
        : report.flagged + " satır gözden geçirilmeli · " + report.bad + " kritik, " + report.warn + " uyarı";
    }
    if (el("cap-result-info")) el("cap-result-info").textContent = report.total + " satır · kalite " + report.score + "/100";
  }

  function applyEditorFilters() {
    var box = el("cap-segments");
    if (!box) return;
    var oldEmpty = box.querySelector(".editor-filter-empty");
    if (oldEmpty) oldEmpty.remove();
    var q = String(editorQuery || "").toLocaleLowerCase("tr");
    var visible = 0;
    Array.prototype.forEach.call(box.querySelectorAll(".seg"), function (row) {
      var i = Number(row.dataset.i);
      var textMatches = !q || String(segments[i] && segments[i].text || "").toLocaleLowerCase("tr").indexOf(q) !== -1;
      var show = textMatches && (!editorOnlyIssues || row.classList.contains("flagged"));
      row.classList.toggle("filtered", !show);
      if (show) visible++;
    });
    if (!visible) {
      var empty = document.createElement("div");
      empty.className = "empty editor-filter-empty";
      empty.textContent = editorOnlyIssues ? "Kontrol gerektiren satır kalmadı." : "Aramana uyan altyazı bulunamadı.";
      box.appendChild(empty);
    }
  }

  function historyTime(ts) {
    if (!ts) return "";
    try { return new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); }
    catch (e) { return ""; }
  }

  function restoreHistory(index) {
    var st = undoStack[index];
    if (!st) return;
    redoStack.push(durumAl("geçmişten önce"));
    durumYukle(st);
    undoStack = undoStack.slice(0, index);
    render();
    refreshUndoUI();
    saveDraftNow();
    var menu = el("cap-history-menu");
    if (menu) menu.hidden = true;
    KApp.toast("Geçmiş sürüm geri getirildi", "good");
  }

  function renderHistory() {
    var menu = el("cap-history-menu");
    if (!menu) return;
    menu.innerHTML = "";
    if (!undoStack.length) {
      var empty = document.createElement("button");
      empty.type = "button";
      empty.disabled = true;
      empty.textContent = "Henüz düzenleme geçmişi yok";
      menu.appendChild(empty);
      return;
    }
    for (var i = undoStack.length - 1; i >= Math.max(0, undoStack.length - 12); i--) {
      (function (idx) {
        var st = undoStack[idx];
        var b = document.createElement("button");
        b.type = "button";
        var label = document.createElement("span");
        label.textContent = st.etiket || "Düzenleme";
        var time = document.createElement("small");
        time.textContent = historyTime(st.ts);
        b.appendChild(label); b.appendChild(time);
        b.onclick = function () { restoreHistory(idx); };
        menu.appendChild(b);
      })(i);
    }
  }

  function correctionFromEdit(before, after) {
    // *vurgu* eklemek/kaldirmak yazim duzeltmesi degildir: sozluge onerilmez
    var a = CT.stripEmphasis(String(before || "")).trim().split(/\s+/);
    var b = CT.stripEmphasis(String(after || "")).trim().split(/\s+/);
    if (a.length !== b.length || a.length > 40) return null;
    var changed = [];
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) changed.push({ from: a[i], to: b[i] });
    if (changed.length !== 1) return null;
    var clean = function (x) { return String(x || "").replace(/^[\s"'“”‘’([{]+|[\s"'“”‘’.,!?;:)}\]]+$/g, ""); };
    var out = { from: clean(changed[0].from), to: clean(changed[0].to) };
    return out.from && out.to && out.from !== out.to ? out : null;
  }

  function showLastCorrection(correction) {
    lastCorrection = correction;
    var b = el("cap-learn-last");
    if (!b) return;
    b.hidden = !correction;
    b.textContent = correction ? "Bu düzeltmeyi öğren: “" + correction.from + "” → “" + correction.to + "”" : "";
  }

  function learnLastCorrection() {
    if (!lastCorrection) return;
    var s = K.settings();
    s.glossary = (s.glossary || []).filter(function (r) { return r.from !== lastCorrection.from; });
    s.glossary.push({ from: lastCorrection.from, to: lastCorrection.to });
    K.saveSettings();
    if (el("set-glossary")) el("set-glossary").value = glossaryText();
    KApp.toast("Suflo öğrendi: " + lastCorrection.from + " → " + lastCorrection.to, "good");
    showLastCorrection(null);
  }

  function qualityAutoFix() {
    if (!segments.length || !window.SufloCaptionQuality) return;
    var next = window.SufloCaptionQuality.autoFix(segments, qualityOptions());
    applyGlossary(next);
    if (JSON.stringify(next) === JSON.stringify(segments)) {
      KApp.toast("Altyazı zaten nizami görünüyor", "good");
      return;
    }
    snapshot("nizami otomatik düzeltme");
    segments = next;
    render(); saveDraftNow();
    KApp.toast("Metin, satır uzunluğu ve zamanlama düzeltildi", "good");
  }

  // Anlamina gore satir sonlarina emoji: seyrek, tekrarsiz, Ctrl+Z ile geri alinir
  function otomatikEmoji() {
    if (!segments.length || !window.SufloAutoEmoji) return;
    var dil = algilananDil || (el("cap-lang") && el("cap-lang").value) || arayuzDili();
    var oneriler = window.SufloAutoEmoji.suggest(segments, { lang: dil === "en" ? "en" : "tr" });
    if (!oneriler.length) {
      KApp.toast("Emojiye uygun satır bulunamadı", "warn");
      return;
    }
    snapshot("otomatik emoji");
    oneriler.forEach(function (o) {
      segments[o.index].text = window.SufloAutoEmoji.append(segments[o.index].text, o.emoji);
    });
    render(); saveDraftNow();
    KApp.toast(oneriler.length + " satıra emoji eklendi · beğenmezsen Ctrl+Z", "good");
  }

  /*
   * Otomatik anahtar kelime vurgusu: sayilar (birimiyle) ve satir basina en
   * anlamli tek kelime *isaretlenir*. Suflo Stilleri bunlari vurgu renginde
   * cizer. Kelime modunda 6'li pencereler satir gibi degerlendirilir.
   */
  function otomatikVurgu() {
    if (!segments.length) return;
    if (segmentsMode === "kc") {
      KApp.toast("Birikimli karaoke modunda vurgu yok; Kelime ya da Satır modunu kullan.", "warn");
      return;
    }
    var yeni = segments.map(function (s) { return s.text; });
    if (segmentsMode === "k1" || segmentsMode === "w") {
      for (var b = 0; b < segments.length; b += 6) {
        var pencere = yeni.slice(b, b + 6);
        if (pencere.some(CT.hasEmphasis)) continue;
        var tekSozcuk = pencere.every(function (w) { return !/\s/.test(String(w).trim()); });
        if (!tekSozcuk) continue;
        var sonuc = CT.autoEmphasis(pencere.join(" ")).split(/\s+/);
        if (sonuc.length !== pencere.length) continue;
        // pencere genelindeki "*a b*" araligi kelime basina "*a*" "*b*" olur
        var maske = CT.emphasisMask(sonuc.join(" "));
        sonuc.forEach(function (w, k) {
          yeni[b + k] = maske[k] ? CT.toggleWord(CT.stripEmphasis(w), 0) : w;
        });
      }
    } else {
      yeni = yeni.map(function (t) { return CT.autoEmphasis(t); });
    }
    var n = 0;
    yeni.forEach(function (t, i) { if (t !== segments[i].text) n++; });
    if (!n) {
      KApp.toast("Vurgulanacak yeni kelime bulunamadı (işaretli satırlara dokunulmaz).", "warn");
      return;
    }
    snapshot("otomatik vurgu");
    yeni.forEach(function (t, i) { segments[i].text = t; });
    render(); saveDraftNow();
    KApp.toast(n + " " + (segmentsMode === "k1" || segmentsMode === "w" ? "kelime" : "satır") +
      " vurgulandı · Suflo Stillerinde vurgu renginde görünür · Ctrl+Z ile geri al", "good");
  }

  async function proofreadAll() {
    if (!segments.length) return;
    var cfg = chatConfig();
    if (!cfg) {
      if (window.KOnboarding) KOnboarding.anahtarIste("AI metin kontrolü");
      else KApp.toast("AI metin kontrolü için Ayarlar > Bulut yedeği bölümüne bir anahtar ekle.", "warn");
      return;
    }
    var btn = el("cap-proofread");
    btn.disabled = true;
    try {
      var refs = segments.slice();
      var originals = refs.map(function (s) { return s.text; });
      var corrected = [];
      var BATCH = 50;
      for (var i = 0; i < originals.length; i += BATCH) {
        // *vurgu* isaretleri modele gitmez (dusurur ya da markdown ekler); donuste geri konur
        var chunk = originals.slice(i, i + BATCH).map(CT.stripEmphasis);
        status("AI metin kontrolü… " + Math.min(i + BATCH, originals.length) + "/" + originals.length);
        var json = await chatCall(cfg, {
          model: cfg.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You proofread subtitle lines. Fix only clear spelling, Turkish punctuation, capitalization and obvious speech-recognition errors. Preserve meaning, tone, slang, names, line order and line count. Never merge, split, censor or rewrite. Reply ONLY as JSON {\"lines\":[...]}, with exactly " + chunk.length + " strings." },
            { role: "user", content: "Language: " + ((el("cap-lang") && el("cap-lang").value) || algilananDil || "auto") + "\nKnown correct terms: " + glossaryPrompt() + "\nLines:\n" + JSON.stringify(chunk) }
          ]
        });
        var content = json.choices && json.choices[0] && json.choices[0].message.content;
        var parsed = JSON.parse(content || "{}");
        if (!parsed.lines || parsed.lines.length !== chunk.length) throw new Error("Kontrol satır sayısı değişti; mevcut metin korunarak işlem durduruldu.");
        corrected = corrected.concat(parsed.lines);
      }
      corrected = corrected.map(function (text, i2) {
        var t = String(text || "").trim();
        if (!t) return originals[i2];
        var geri = CT.reapplyEmphasis(originals[i2], t);
        return geri === null ? originals[i2] : geri;   // kelime sayisi degistiyse vurgu kaybolmasin
      });
      var changed = 0;
      corrected.forEach(function (text, i2) { if (text !== originals[i2]) changed++; });
      if (!changed) { status(""); KApp.toast("AI kontrolü tamamlandı; açık bir yazım hatası bulunmadı", "good"); return; }
      snapshot("AI metin kontrolü");
      refs.forEach(function (s, i3) { s.text = String(corrected[i3] || s.text).trim() || s.text; s.proofread = true; });
      applyGlossary(segments);
      status(""); render(); saveDraftNow();
      KApp.toast(changed + " satır ikinci kontrolden geçirildi", "good");
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      btn.disabled = false;
    }
  }

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
    ceviriDugmeleriniGuncelle();   // geri al/yinele/taslak sonrasi da satirlarla tutarli
    // Gerçek satırlar geldiğinde/değiştiğinde önizleme de onlardan beslensin
    onizlemeCiz();
    var box = el("cap-segments");
    box.innerHTML = "";
    var report = qualityReport();
    var q = String(editorQuery || "").toLocaleLowerCase("tr");
    var visible = 0;
    segments.forEach(function (s, i) {
      var rowQuality = report.rows[i] || { issues: [], cps: 0, duration: Math.max(0, s.end - s.start), flagged: false, bad: false, confidence: s.confidence };
      var row = document.createElement("div");
      row.className = "seg" + (rowQuality.flagged ? " flagged" : "") + (rowQuality.bad ? " bad" : "") + (selectedSegment === i ? " selected" : "");
      row.dataset.i = String(i);
      var textMatches = !q || String(s.text || "").toLocaleLowerCase("tr").indexOf(q) !== -1;
      if (!textMatches || (editorOnlyIssues && !rowQuality.flagged)) row.classList.add("filtered");
      else visible++;
      row.onclick = function (ev) {
        if (ev.target && ev.target.tagName === "BUTTON") return;
        selectedSegment = i;
        Array.prototype.forEach.call(box.querySelectorAll(".seg.selected"), function (x) { x.classList.remove("selected"); });
        row.classList.add("selected");
      };

      var meta = document.createElement("div");
      meta.className = "seg-meta";
      var number = document.createElement("span");
      number.className = "seg-index";
      number.textContent = "#" + String(i + 1);

      /* zaman: tek tık → playhead, çift tık → elle düzenle */
      var t = document.createElement("button");
      t.className = "seg-time mono jump";
      t.textContent = tc(s.start, false).slice(3, 8) + "–" + tc(s.end, false).slice(3, 8);
      t.title = "Tık: playhead'i götür · Çift tık: zamanı düzenle";
      t.onclick = function () { K.call("KS_setPlayerPosition", { sec: s.start }); };
      t.ondblclick = function () { editTime(i, t); };
      meta.appendChild(number); meta.appendChild(t);

      var textWrap = document.createElement("div");
      textWrap.className = "seg-text-wrap";
      var inp = document.createElement("textarea");
      inp.rows = 1;
      inp.value = s.text;
      inp.dataset.i = String(i);
      function fit() { inp.style.height = "auto"; inp.style.height = Math.min(90, Math.max(30, inp.scrollHeight)) + "px"; }
      inp.onfocus = function () { inp.dataset.before = inp.value; selectedSegment = i; row.classList.add("selected"); };
      inp.oninput = function () {
        segments[i].text = inp.value;
        fit();
        updateQualityUI(qualityReport());
        saveDraftSoon();
      };
      inp.onblur = function () {
        // metin gerçekten değiştiyse geri alınabilir olsun
        if (inp.dataset.before !== undefined && inp.dataset.before !== inp.value) {
          var correction = correctionFromEdit(inp.dataset.before, inp.value);
          var eski = JSON.parse(JSON.stringify(segments));
          eski[i].text = inp.dataset.before;
          undoStack.push({ segs: JSON.stringify(eski), etiket: "metin düzenleme", mode: segmentsMode, cevir: ceviriDili, shorts: shortsYuklenen, ts: Date.now() });
          if (undoStack.length > UNDO_MAX) undoStack.shift();
          redoStack.length = 0;
          refreshUndoUI();
          renderHistory();
          if (correction) showLastCorrection(correction);
          inp.dataset.before = inp.value;
        }
      };
      // Enter: bol · Alt+Enter: alta satir ekle · Ctrl+Enter: sonraki satira gec
      // Ctrl/Cmd+B: imlecteki kelimeyi (ya da secimi) *vurgula* / vurguyu kaldir
      inp.onkeydown = function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "b" || e.key === "B")) {
          e.preventDefault();
          var sonuc = CT.toggleRange(inp.value, inp.selectionStart, inp.selectionEnd);
          if (sonuc.text !== inp.value) {
            inp.value = sonuc.text;
            inp.setSelectionRange(sonuc.caret, sonuc.caret);
            inp.oninput();
          }
          return;
        }
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (e.altKey) { insertAfter(i); return; }
        if (e.ctrlKey || e.metaKey) {
          var next = box.querySelector('textarea[data-i="' + String(i + 1) + '"]');
          if (next) { next.focus(); next.select(); }
          return;
        }
        splitAt(i, inp.selectionStart);
      };
      textWrap.appendChild(inp);
      setTimeout(fit, 0);

      var actions = document.createElement("div");
      actions.className = "seg-actions";
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
        if (isFinite(Number(segments[i].confidence)) && isFinite(Number(nx.confidence))) {
          segments[i].confidence = (Number(segments[i].confidence) + Number(nx.confidence)) / 2;
        }
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

      actions.appendChild(spl); actions.appendChild(mrg); actions.appendChild(del);

      var foot = document.createElement("div");
      foot.className = "seg-foot";
      var timing = document.createElement("span");
      timing.textContent = rowQuality.duration.toFixed(1) + " sn · " + rowQuality.cps.toFixed(1) + " kr/sn";
      foot.appendChild(timing);
      if (rowQuality.confidence !== null && rowQuality.confidence !== undefined && isFinite(rowQuality.confidence)) {
        var conf = document.createElement("span");
        conf.textContent = "%" + Math.round(rowQuality.confidence * 100) + " güven";
        foot.appendChild(conf);
      }
      rowQuality.issues.forEach(function (problem) {
        var badge = document.createElement("span");
        badge.className = "seg-issue " + problem.level;
        badge.textContent = problem.label;
        foot.appendChild(badge);
      });

      row.appendChild(meta); row.appendChild(textWrap); row.appendChild(actions); row.appendChild(foot);
      box.appendChild(row);
    });
    if (!visible) {
      var empty = document.createElement("div");
      empty.className = "empty editor-filter-empty";
      empty.textContent = editorOnlyIssues ? "Kontrol gerektiren satır kalmadı." : "Aramana uyan altyazı bulunamadı.";
      box.appendChild(empty);
    }
    updateQualityUI(report);
    renderHistory();
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
      { start: s.start, end: kesme, text: a, confidence: s.confidence },
      { start: kesme, end: s.end, text: b, confidence: s.confidence });
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
    // orig ALANI YOK: bos dize de string oldugundan "orijinale don" bu satiri
    // bos metinle ezerdi; alan hic olmayinca revertTranslate dogru atlar.
    segments.splice(i + 1, 0, { start: start, end: end, text: "" });
    render(); saveDraftSoon();
  }

  /* ---------------- Çeviri (LLM) ---------------- */

  /*
   * Çeviri geri alma. Orijinal metin index dizisinde DEĞİL, segmentin kendisinde (s.orig)
   * taşınır: bölme/birleştirme/silme/sıralama index eşlemesini bozduğu için index tabanlı
   * saklama, geri alındığında metinleri yanlış satırlara yazıyordu.
   */
  /*
   * Ceviri durumu ayri bir bayrakta DEGIL, veride: s.orig tasiyan satir varsa
   * belge cevrilmistir. Bayrak geri al/yinele, taslak kurtarma ve yeni
   * transkriptten sonra satirlarla ayrisiyordu (dugmeler yanlis gorunuyordu).
   */
  var ceviriDili = "";     // son cevirinin hedef dili (buyuk harf ve kalite kurallari icin)
  function ceviriVar() {
    for (var i = 0; i < segments.length; i++) if (typeof segments[i].orig === "string") return true;
    return false;
  }
  function ceviriDugmeleriniGuncelle() {
    var var_ = ceviriVar();
    var b = el("cap-revert");
    if (b) b.hidden = !var_;
    var c = el("cap-cift-dil-sar");
    if (c) c.hidden = !var_;
  }
  function clearRevert() {
    ceviriDili = "";
    var b = el("cap-revert");
    if (b) b.hidden = true;
    var c = el("cap-cift-dil-sar");
    if (c) c.hidden = true;
  }

  // Çeviri sonrası "çift dilli": orijinal + çeviri alt alta (SRT/VTT/normal iz)
  function ciftDilAcik() {
    var c = el("cap-cift-dil");
    return !!(c && c.checked && ceviriVar());
  }

  var LANG_NAMES = {
    en: "English", tr: "Turkish", az: "Azerbaijani", ru: "Russian", de: "German", ar: "Arabic",
    es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese"
  };

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

  /*
   * Metin dizisini hedef dile cevir (60'arlik parcalar, satir sayisi korunur).
   * *vurgu* isaretleri modelden korunmasi istenir. Doner: ceviri dizisi.
   */
  async function metinleriCevir(cfg, texts, target, ilerleme) {
    var out = [];
    var BATCH = 60;
    for (var i = 0; i < texts.length; i += BATCH) {
      if (ilerleme) ilerleme(Math.min(i + BATCH, texts.length), texts.length);
      var chunk = texts.slice(i, i + BATCH);
      var json = await chatCall(cfg, {
        model: cfg.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You translate subtitle lines for video. Reply ONLY with a JSON object {\"lines\": [...]} containing exactly " +
              chunk.length + " translated lines in the same order. Keep translations short and natural for subtitles. Do not merge or split lines. " +
              "Words wrapped in single asterisks (*word*) are highlighted: wrap the corresponding translated words in single asterisks too. Never add other asterisks or markdown."
          },
          {
            role: "user",
            content: "Translate to " + (LANG_NAMES[target] || target) + ":\n" + JSON.stringify(chunk)
          }
        ]
      });
      var content = json.choices && json.choices[0] && json.choices[0].message.content;
      var parsed = JSON.parse(String(content || "{}").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
      var lines = parsed.lines || parsed.Lines;
      if (!lines || lines.length !== chunk.length) {
        throw new Error("Çeviri satır sayısı tutmadı (" + (lines ? lines.length : 0) + "/" + chunk.length + ") — tekrar dene.");
      }
      out = out.concat(lines);
    }
    return out;
  }

  async function translateAll() {
    // Pro: ceviri (ucretsizde 3 deneme hakki; hak yalniz ceviri yazilinca duser)
    if (typeof Pro !== "undefined" && !Pro.gate("translate", { deneme: true, yeniden: translateAll })) return;
    if (segments.length === 0) return;
    var target = el("cap-translate").value;
    if (!target) { KApp.toast("Önce hedef dili seç.", "warn"); return; }
    var cfg = chatConfig();
    if (!cfg) {
      if (window.KOnboarding) KOnboarding.anahtarIste("Çeviri");
      else KApp.toast("Çeviri için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad");
      return;
    }
    var btn = el("cap-translate-go");
    btn.disabled = true;
    try {
      // Ceviri surerken kullanici satir boler/silerse indeksler kayar ve
      // ceviriler yanlis satirlara yazilirdi. Referanslari simdiden yakala:
      // silinen segmentin cevirisi zararsizca dusar, kalanlar dogru esler.
      var segsRef = segments.slice();
      var texts = segsRef.map(function (s) { return s.text; });
      var out = await metinleriCevir(cfg, texts, target, function (n, top) { status("Çevriliyor… " + n + "/" + top); });
      snapshot("çeviri");
      // Ceviri surerken elle duzeltilen ya da yeni transkript/ice aktarmayla
      // ekrandan kalkan satirlarin uzerine yazma: kullanicinin isi kaybolmasin.
      var guncel = new Set(segments);
      var atlananDuzenleme = 0;
      segsRef.forEach(function (s, i2) {
        if (!guncel.has(s)) return;
        if (s.text !== texts[i2]) { atlananDuzenleme++; return; }
        if (typeof s.orig !== "string") s.orig = texts[i2];   // zincir çeviride ilk orijinali koru
        s.text = CT.normalizeEmphasis(String(out[i2] || "").trim()) || s.text;
      });
      ceviriDili = target;
      status("");
      el("cap-revert").hidden = false;
      if (el("cap-cift-dil-sar")) el("cap-cift-dil-sar").hidden = false;
      render(); saveDraftNow();
      KApp.toast(texts.length + " satır çevrildi" +
        (atlananDuzenleme ? " · çeviri sırasında düzenlenen " + atlananDuzenleme + " satıra dokunulmadı" : ""), "good");
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("translate", KApp.toast);   // deneme: yalniz basarida
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      btn.disabled = false;
    }
  }

  /*
   * Cok dilli SRT paketi: secilen her dile cevirip ayri SRT yazar (YouTube'un cok
   * dilli altyazisi icin). Ekrandaki altyazi DEGISMEZ. Kaynak: ceviri yapilmissa
   * orijinal satirlar (s.orig), degilse ekrandaki metin. Zamanlar cueler() ile ayni.
   */
  async function cokDilliPaket() {
    if (typeof Pro !== "undefined" && !Pro.gate("translate", { deneme: true, yeniden: cokDilliPaket })) return;
    if (!segments.length) return;
    if (segmentsMode !== "plain") {
      KApp.toast("Çok dilli paket satır modunda çalışır: kelime/karaoke modunda her kelime ayrı çevrilirdi. Satır uzunluğunu \"Satır\" yapıp yeniden oluştur.", "warn", 8000);
      return;
    }
    var diller = Array.prototype.map.call(document.querySelectorAll(".cap-paket-dil:checked"), function (x) { return x.value; });
    if (!diller.length) { KApp.toast("En az bir dil seç.", "warn"); return; }
    var cfg = chatConfig();
    if (!cfg) {
      if (window.KOnboarding) KOnboarding.anahtarIste("Çok dilli SRT paketi");
      else KApp.toast("Çeviri için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad");
      return;
    }
    var btn = el("cap-paket-go");
    btn.disabled = true;
    try {
      var kaynak = segments.map(function (s) {
        return { start: s.start, end: s.end, text: CT.stripEmphasis(typeof s.orig === "string" ? s.orig : s.text) };
      });
      var zaman = paketZamanlari(kaynak);
      var metinler = zaman.map(function (z) { return kaynak[z.i].text; });
      var klasor = K.path.join(K.os.homedir(), "Desktop");
      if (!K.fs.existsSync(klasor)) klasor = K.os.homedir();
      var t0 = new Date();
      function iki(n) { return (n < 10 ? "0" : "") + n; }
      // yerel saat, saniyeli: ayni dakikada iki paket birbirini ezmesin (Windows'ta ":" yok)
      klasor = K.path.join(klasor, "Suflo altyazilar " + t0.getFullYear() + "-" + iki(t0.getMonth() + 1) + "-" + iki(t0.getDate()) +
        " " + iki(t0.getHours()) + "." + iki(t0.getMinutes()) + "." + iki(t0.getSeconds()));
      K.fs.mkdirSync(klasor, { recursive: true });
      var kaynakDil = algilananDil || (el("cap-lang") && el("cap-lang").value) || "";
      if (!kaynakDil) kaynakDil = "kaynak";   // "Otomatik" ve taslaktan: dil bilinmiyor
      K.fs.writeFileSync(K.path.join(klasor, kaynakDil + ".srt"), "\uFEFF" + paketSrt(zaman, metinler, kaynakDil), "utf8");
      var yazilan = 1, hatalar = [];
      for (var d = 0; d < diller.length; d++) {
        var dil = diller[d];
        if (dil === kaynakDil) continue;
        try {
          var out = await metinleriCevir(cfg, metinler, dil, function (n, top) {
            status((LANG_NAMES[dil] || dil) + " · " + n + "/" + top + " (" + (d + 1) + "/" + diller.length + ")");
          });
          var temiz = out.map(function (t, i) { return CT.stripEmphasis(String(t || "").trim()) || metinler[i]; });
          K.fs.writeFileSync(K.path.join(klasor, dil + ".srt"), "\uFEFF" + paketSrt(zaman, temiz, dil), "utf8");
          yazilan++;
        } catch (eD) { hatalar.push((LANG_NAMES[dil] || dil) + ": " + K.hataYardimi(eD)); }
      }
      status(hatalar.length ? "Bazı diller atlandı: " + hatalar.join("; ").slice(0, 200) : "", hatalar.length ? "warn" : "");
      KApp.toast(yazilan + " SRT yazıldı → " + klasor, "good", 9000);
      // deneme: en az bir dile cevrildiyse (yalniz kaynak SRT yazildiysa hak dusmez)
      if (yazilan > 1 && typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("translate", KApp.toast);
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
    } finally {
      btn.disabled = false;
    }
  }

  // cueler() ile ayni zamanlama kurali (en az 0.3 sn, sonraki satirla cakisma yok); bos satir atlanir
  function paketZamanlari(list) {
    var out = [];
    list.forEach(function (s, i) {
      if (!String(s.text || "").trim()) return;
      var end = Math.max(s.end, s.start + 0.3);
      var next = list[i + 1];
      if (next && end > next.start) end = Math.max(next.start, s.start + 0.05);
      out.push({ i: i, start: s.start, end: end });
    });
    return out;
  }

  // styleText'in dile ozel hali: buyuk/kucuk harf kurali hedef dilden (de/en'de "i" -> "I")
  function paketStil(t, dil) {
    var mode = el("cap-case").value;
    var out = String(t || "");
    if (!el("cap-punct").checked) {
      out = out.replace(/[.,!?;:…»«""()\-–—\u060C\u061F\u061B]/g, " ").replace(/\s+/g, " ").trim();
    }
    var loc = { tr: "tr-TR", az: "az", ru: "ru" }[dil];
    if (mode === "upper") out = loc ? out.toLocaleUpperCase(loc) : out.toUpperCase();
    else if (mode === "lower") out = loc ? out.toLocaleLowerCase(loc) : out.toLowerCase();
    return out;
  }

  function paketSrt(zaman, metinler, dil) {
    var out = [], no = 0;
    zaman.forEach(function (z, k) {
      // bos satir SRT'yi bozar: once stil, bos kalani atla; metindeki bos satirlari kapat
      var metin = paketStil(String(metinler[k] || "").replace(/\r?\n\s*\n+/g, "\n").trim(), dil);
      if (!metin.trim()) return;
      out.push(String(++no));
      out.push(tc(z.start, true) + " --> " + tc(z.end, true));
      out.push(metin);
      out.push("");
    });
    return out.join("\r\n");
  }

  function revertTranslate() {
    if (!ceviriVar()) return;
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
        segs.sort(function (a, b) { return a.start - b.start; }); // editor zaman sirasi varsayar; sirasiz SRT sureleri cokertiyordu
        /*
         * Ekranda iş varsa üzerine yazmadan önce anlık görüntü al: kullanıcı yanlış
         * dosya seçtiyse Ctrl+Z ile geri dönebilsin. Ekran boşsa yığını temizle, yoksa
         * geri alma eski bir dokümanın satırlarını geri getirir.
         */
        if (segments.length) snapshot("SRT içe aktarma");
        else { undoStack.length = 0; redoStack.length = 0; }
        shortsYuklenen = "";
        ornekBelge = false;
        segments = segs;
        segmentsMode = "plain";    // ice aktarilan SRT'de kelime zamani verisi yok
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
  // opts.ciftDil: ceviri yapilmis satirlarda ust satir orijinal, alt satir ceviri
  // (yalniz SRT/VTT ve normal caption izi; stilli yollar kelime gruplar, tek dil kalir)
  // opts.vurgu: *anahtar kelime* isaretleri korunur (yalniz Suflo Stilleri cizer);
  // diger tum ciktilarda isaret kaldirilir
  function cueler(opts) {
    var out = [];
    var cift = !!(opts && opts.ciftDil);
    var vurguKoru = !!(opts && opts.vurgu);
    segments.forEach(function (s, i) {
      var txt = styleText(vurguKoru ? s.text : CT.stripEmphasis(s.text));
      if (!txt) return; // stil sonrasi bos kalan cue yazilmaz
      if (cift && typeof s.orig === "string") {
        var asil = styleText(CT.stripEmphasis(s.orig), true);
        if (asil && asil !== txt) txt = asil + "\n" + txt;
      }
      // minimum 0.3 sn gorunum — ama bir sonraki cue ile CAKISMA (karaoke'de kritik)
      var end = Math.max(s.end, s.start + 0.3);
      var next = segments[i + 1];
      if (next && end > next.start) end = Math.max(next.start, s.start + 0.05);
      out.push({ start: s.start, end: end, text: txt });
    });
    return out;
  }

  function buildSrt(opts) {
    var out = [];
    cueler(opts).forEach(function (c, i) {
      out.push(String(i + 1));
      out.push(tc(c.start, true) + " --> " + tc(c.end, true));
      out.push(c.text);
      out.push("");
    });
    return out.join("\r\n");
  }

  // WebVTT — YouTube, web oynatıcılar ve sosyal platformların istediği biçim
  function buildVtt(opts) {
    var out = ["WEBVTT", ""];
    cueler(opts).forEach(function (c, i) {
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
  function assKaraokeSatirlari(cs, kelimeSiniri) {
    var satirlar = [], grup = [];
    var sinir = Math.max(1, parseInt(kelimeSiniri, 10) || 5);
    function bosalt() {
      if (grup.length) { satirlar.push(grup); grup = []; }
    }
    for (var i = 0; i < cs.length; i++) {
      grup.push(cs[i]);
      var son = cs[i], sonraki = cs[i + 1];
      var bosluk = sonraki ? sonraki.start - son.end : 99;
      // satırı kapat: stilin kelime sınırı doldu, araya sessizlik girdi ya da noktalama bitti
      if (grup.length >= sinir || bosluk > 0.7 || /[.!?…]$/.test(son.text)) bosalt();
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
  var onizlemeKareYol = null;
  var onizlemeRenderYol = null;
  var onizlemeRenderCalisiyor = false;

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
      onizlemeKare = dosyaUrl(yol) + "?t=" + Date.now();
      onizlemeKareYol = yol;
      sahne.style.backgroundImage = "url('" + onizlemeKare + "')";
      sahne.classList.add("kare-var");
      if (not) not.textContent = "Arka plan: timeline'daki kare · yenilemek için tekrar bas";
    } catch (e) {
      onizlemeKare = null;
      onizlemeKareYol = null;
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
    var kelimeVar = kelimeModuAktif();
    var anim = el("cap-animasyon") ? el("cap-animasyon").value : "yok";

    var kutu = el("cap-renk-vurgu-kutu");
    if (kutu) kutu.classList.toggle("pasif",
      !(anim === "karaoke" || anim === "vurgu" || anim === "viral" || anim === "pop" || anim === "premium"));

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
    var video = el("cap-render-onizleme");
    if (video) {
      try { video.pause(); } catch (e0) {}
      video.hidden = true;
      video.removeAttribute("src");
      try { video.load(); } catch (e1) {}
    }
    if (onizlemeRenderYol) {
      try { K.fs.unlinkSync(onizlemeRenderYol); } catch (e2) {}
      onizlemeRenderYol = null;
    }
    // CSS onizlemesi 16:9 sahnede calisir
    var sahne = el("cap-sahne");
    if (sahne) { sahne.style.aspectRatio = ""; sahne.classList.remove("dikey"); }
    var mogrtImg = el("cap-mogrt-onizleme");
    if (mogrtImg) mogrtImg.hidden = true;
    var metin = el("cap-onizleme-metin");
    if (metin) metin.hidden = false;
    var not = el("cap-onizleme-not");
    if (not) not.textContent = "Bir stile dokun; kendi karende görmek için \"Kare al\"";
    var b = el("cap-onizleme-oynat");
    if (b) b.textContent = "▶ Oynat";
  }

  function onizlemeCiz(vurguIndex) {
    var sahne = el("cap-sahne");
    var kutu = el("cap-onizleme-metin");
    if (!sahne || !kutu) return;

    var mogrtImg = el("cap-mogrt-onizleme");
    if (secilenMogrt) {
      kutu.hidden = true;
      if (mogrtImg) {
        if (secilenMogrt.thumb) mogrtImg.src = secilenMogrt.thumb;
        mogrtImg.hidden = !secilenMogrt.thumb;
      }
      var mogrtNot = el("cap-onizleme-not");
      if (mogrtNot) mogrtNot.textContent = temizMogrtAdi(secilenMogrt) + " · Premiere MOGRT önizlemesi";
      return;
    }
    if (mogrtImg) mogrtImg.hidden = true;
    kutu.hidden = false;

    var st = stil();
    var rec = stilRecetesi(st);
    var karaoke = kelimeModuAktif();
    var olcek = sahne.clientWidth / 1920;

    // Yerleşim: ASS Alignment 2/5/8 -> alt/orta/üst
    kutu.className = "onizleme-alt stil-" + rec.aile + " " +
      (st.konum === 8 ? "ust" : st.konum === 5 ? "orta" : "alt");
    kutu.style.fontFamily = st.font + ", sans-serif";
    kutu.style.fontSize = Math.max(7, st.boyut * olcek) + "px";
    kutu.style.fontWeight = rec.aile === "doc" ? "600" : "800";
    kutu.style.color = st.renk;
    kutu.style.letterSpacing = (rec.spacing * olcek) + "px";
    kutu.style.background = st.kutu ? "rgba(5,8,13,.83)" : "transparent";
    kutu.style.padding = st.kutu ? Math.max(3, rec.boxPadding * olcek) + "px " +
      Math.max(6, rec.boxPadding * 1.5 * olcek) + "px" : "0";
    kutu.style.borderRadius = st.kutu ? Math.max(3, 7 * olcek) + "px" : "0";

    // Kontur: ASS'in outline'ı her yöne eşit; tarayıcıda dört yönlü gölgeyle taklit
    if (st.kontur > 0) {
      var k = Math.max(1, st.kontur * olcek);
      var golgeler = [
        k + "px 0 0 " + st.konturRenk, "-" + k + "px 0 0 " + st.konturRenk,
        "0 " + k + "px 0 " + st.konturRenk, "0 -" + k + "px 0 " + st.konturRenk,
        k + "px " + k + "px 0 " + st.konturRenk, "-" + k + "px -" + k + "px 0 " + st.konturRenk,
        k + "px -" + k + "px 0 " + st.konturRenk, "-" + k + "px " + k + "px 0 " + st.konturRenk
      ];
      if (rec.shadow) golgeler.push("0 " + Math.max(1, rec.shadow * olcek) + "px " +
        Math.max(2, rec.shadow * 1.6 * olcek) + "px rgba(0,0,0,.78)");
      kutu.style.textShadow = golgeler.join(",");
    } else {
      kutu.style.textShadow = st.kutu ? "none" : "0 " + Math.max(1, rec.shadow * olcek) +
        "px " + Math.max(2, rec.shadow * 1.7 * olcek) + "px rgba(0,0,0,.72)";
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
      if (anim === "doc") kutu.classList.add("satir-doc");
    }

    if (oynuyor && anim === "premium") kutu.classList.add("satir-premium");
    var premiumVurgu = anim === "premium" ? vurguKelimesi(ornek.kelimeler.map(function (k) {
      return { text: k };
    })) : -1;
    var popPalet = [st.vurguRenk, "#45e6ff", st.renk, "#ff6b6b"];

    ornek.kelimeler.forEach(function (kelime, i) {
      // pop/bounce oynarken henüz sırası gelmeyen kelime hiç çizilmez
      if (oynuyor && anim === "pop" && rec.aile === "pop" && i !== vurguIndex) return;
      if (oynuyor && (anim === "pop" || anim === "bounce") && rec.aile !== "pop" && i > vurguIndex) return;

      var s = document.createElement("span");
      s.className = "kelime";
      s.textContent = kelime + (i < ornek.kelimeler.length - 1 ? " " : "");
      if (anim === "premium" && i === premiumVurgu) s.style.color = st.vurguRenk;
      if (anim === "pop" && rec.aile === "pop") {
        s.style.color = popPalet[i % popPalet.length];
        s.style.setProperty("--pop-rot", (i % 2 ? "4deg" : "-5deg"));
      }

      if (oynuyor && kelimeli) {
        if (anim === "karaoke") {
          if (i <= vurguIndex) s.style.color = st.vurguRenk;
        } else if (anim === "vurgu") {
          if (i === vurguIndex) {
            s.style.color = st.vurguRenk;
            s.classList.add("kelime-vurgu");
          }
        } else if (anim === "viral") {
          if (i === vurguIndex) {
            s.style.color = st.vurguRenk;
            s.classList.add("kelime-viral");
          }
        } else if (anim === "premium") {
          // Premium bütün satırı tek hareketle oynatır; kelime kelime zıplamaz.
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
      return { kelimeler: arayuzDili() === "en" ? ["This", "is", "your", "caption"] : ["Örnek", "altyazı", "böyle", "görünecek"], sureler: null };
    }
    var karaoke = kelimeModuAktif();
    if (karaoke) {
      var cs = cueler();
      if (!cs.length) return { kelimeler: [], sureler: null };
      var rec = stilRecetesi(stil());
      if (rec.aile === "pop") {
        var bas = Math.max(0, Math.floor(cs.length / 2) - 1);
        var popOrnek = cs.slice(bas, bas + Math.min(4, cs.length));
        return {
          kelimeler: popOrnek.map(function (c) { return styleText(c.text); }).filter(Boolean),
          sureler: popOrnek.map(function (c) { return Math.max(0.12, c.end - c.start); })
        };
      }
      var gruplar = assKaraokeSatirlari(cs, rec.maxWords);
      var g = gruplar[Math.floor(gruplar.length / 2)] || gruplar[0] || [];
      return {
        kelimeler: g.map(function (c) { return styleText(c.text); }).filter(Boolean),
        sureler: g.map(function (c) { return Math.max(0.12, c.end - c.start); })
      };
    }
    var orta = segments[Math.floor(segments.length / 2)] || segments[0];
    var metin = styleText(CT.stripEmphasis(orta.text || ""));
    return { kelimeler: metin ? metin.split(/\s+/) : [], sureler: null };
  }

  function motorOnizlemeCueleri(st) {
    var cs = cueler({ vurgu: true });
    if (!cs.length) {
      if (st.aile === "doc") return [{ start: 0.15, end: 2.7, text: "Hikâyenin başladığı yer." }];
      var ornekler = st.aile === "pop" ? ["POP!", "ŞAK!", "VAY!"] :
        st.aile === "mrbeast" ? ["BU", "FİKİR", "PATLADI"] :
        st.aile === "capcut" ? ["daha", "hızlı", "edit"] :
        st.aile === "saas" ? ["Sade", "hızlı", "profesyonel"] :
        st.aile === "premium" ? ["DAHA", "AZ", "DAHA", "İYİ"] : ["BUNU", "SAKIN", "KAÇIRMA"];
      return ornekler.map(function (k, i) {
        return { start: 0.15 + i * 0.68, end: 0.72 + i * 0.68, text: styleText(k) };
      });
    }

    var adet = st.aile === "doc" ? 1 : 4;
    var bas = Math.max(0, Math.floor(cs.length / 2) - Math.floor(adet / 2));
    var secilen = cs.slice(bas, bas + adet);
    var ilk = secilen[0].start;
    return secilen.map(function (c) {
      return { start: c.start - ilk + 0.15, end: c.end - ilk + 0.15, text: c.text };
    });
  }

  /*
   * Onizleme boyutu sekansin oranini izler (yukseklik 540). Dikey (9:16)
   * sekansta Shorts/Reels/TikTok arayuzunun kapattigi bolgeler isaretlenebilir.
   */
  function onizlemeBoyutu(ctx) {
    var w = Number(ctx && ctx.width) || 0, h = Number(ctx && ctx.height) || 0;
    if (!(w > 0 && h > 0)) return { w: 960, h: 540, dikey: false };
    var oran = Math.max(0.4, Math.min(2.4, w / h));
    // kisa kenar en az 320 (stil motoru genisligi 320'ye sabitler; PlayRes video ile ayni kalsin)
    if (oran < 1) return { w: 320, h: Math.round(320 / oran / 2) * 2, dikey: h > w * 1.2 };
    return { w: Math.round(540 * oran / 2) * 2, h: 540, dikey: false };
  }

  // TikTok / Reels / Shorts ortak "kapali" bolgeleri (1080x1920 olcumlerinden, oransal):
  // ust durum cubugu, sag ikon sutunu, alt aciklama + dugmeler
  var GUVENLI_ALAN = [
    { x: 0, y: 0, w: 1, h: 0.07 },
    { x: 0.87, y: 0.35, w: 0.13, h: 0.43 },
    { x: 0, y: 0.78, w: 1, h: 0.22 }
  ];
  function guvenliAlanFiltresi(w, h) {
    return GUVENLI_ALAN.map(function (b) {
      var x = Math.round(b.x * w), y = Math.round(b.y * h), bw = Math.round(b.w * w), bh = Math.round(b.h * h);
      return "drawbox=x=" + x + ":y=" + y + ":w=" + bw + ":h=" + bh + ":color=0xff3b5c@0.22:t=fill," +
        "drawbox=x=" + x + ":y=" + y + ":w=" + bw + ":h=" + bh + ":color=0xff3b5c@0.7:t=1";
    }).join(",");
  }

  function sahneOraniniAyarla(ob) {
    var sahne = el("cap-sahne");
    if (!sahne) return;
    sahne.style.aspectRatio = ob.w + " / " + ob.h;
    sahne.classList.toggle("dikey", !!ob.dikey);
    var sar = el("cap-guvenli-sar");
    if (sar) sar.hidden = !ob.dikey;
  }

  async function motorOnizlemeOynat() {
    var st = stil();
    if (!K.nodeOK || !motorStiliMi(st.aile)) return false;
    var ff = await K.findFfmpeg();
    if (!ff) return false;

    var btn = el("cap-onizleme-oynat");
    var not = el("cap-onizleme-not");
    if (btn) { btn.disabled = true; btn.textContent = "Hazırlanıyor…"; }
    if (not) not.textContent = "Yeni stil motoru gerçek çıktıyı hazırlıyor…";

    var dizin = K.path.join(K.tmpDir(), "suflo-style-preview");
    K.fs.mkdirSync(dizin, { recursive: true });
    if (onizlemeRenderYol) {
      try { K.fs.unlinkSync(onizlemeRenderYol); } catch (e0) {}
    }
    var kimlik = Date.now();
    var assYol = K.path.join(dizin, "preview-" + kimlik + ".ass");
    var cikti = K.path.join(dizin, "preview-" + kimlik + ".webm");
    var fontDosyasi = FONTLAR[st.font];
    var fontKopya = fontDosyasi ? K.path.join(dizin, fontDosyasi) : null;

    try {
      var cues = motorOnizlemeCueleri(st);
      // Sekansin en-boy oranında onizle: 9:16'da stil yerlesimi farklidir
      var ob = onizlemeBoyutu(KApp.ctx());
      var built = window.SufloStyleEngine.compile({
        styleId: st.aile, intensity: st.yogunluk, cues: cues, width: ob.w, height: ob.h,
        cueKind: cueler().length ? motorCueTuru() : "words",
        overrides: {
          font: st.font, fontFile: fontDosyasi, boyut: st.boyut,
          renk: st.renk, konturRenk: st.konturRenk, vurguRenk: st.vurguRenk,
          kontur: st.kontur, konum: st.konum
        }
      });
      K.fs.writeFileSync(assYol, built.ass, "utf8");
      if (fontDosyasi) {
        var kaynak = K.path.join(uzantiDizini(), "fonts", fontDosyasi);
        if (K.fs.existsSync(kaynak)) K.fs.copyFileSync(kaynak, fontKopya);
      }
      var son = cues[cues.length - 1];
      var sure = Math.max(2.2, (son ? son.end : 2) + 0.45);
      var vf = "ass=" + K.path.basename(assYol) + ":fontsdir=.";
      var guvenli = ob.dikey && el("cap-guvenli-alan") && el("cap-guvenli-alan").checked;
      if (guvenli) vf += "," + guvenliAlanFiltresi(ob.w, ob.h);
      var args = ["-y"];
      if (onizlemeKareYol && K.fs.existsSync(onizlemeKareYol)) {
        args.push("-loop", "1", "-i", onizlemeKareYol, "-t", sure.toFixed(2),
          "-vf", "scale=" + ob.w + ":" + ob.h + ":force_original_aspect_ratio=increase,crop=" + ob.w + ":" + ob.h + "," + vf);
      } else {
        args.push("-f", "lavfi", "-i", "color=c=#101522:s=" + ob.w + "x" + ob.h + ":r=24:d=" + sure.toFixed(2), "-vf", vf);
      }
      args.push("-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0", "-pix_fmt", "yuv420p", "-an", cikti);
      var r = await K.run(ff, args, { timeout: 120000, cwd: dizin });
      if (r.code !== 0 || !K.fs.existsSync(cikti)) return false;

      onizlemeRenderYol = cikti;
      var video = el("cap-render-onizleme");
      var metin = el("cap-onizleme-metin");
      if (!video) return false;
      if (metin) metin.hidden = true;
      video.src = dosyaUrl(cikti) + "?t=" + kimlik;
      video.hidden = false;
      sahneOraniniAyarla(ob);
      video.loop = true;
      await video.play();
      if (btn) { btn.disabled = false; btn.textContent = "■ Durdur"; }
      if (not) not.textContent = "Gerçek stil motoru çıktısı · seçili ayarlarla";
      return true;
    } catch (e) {
      K.log("[stil önizleme] " + e.message);
      return false;
    } finally {
      try { K.fs.unlinkSync(assYol); } catch (e1) {}
      if (fontKopya) try { K.fs.unlinkSync(fontKopya); } catch (e2) {}
      if (btn && btn.disabled) btn.disabled = false;
    }
  }

  function onizlemeOynat() {
    var video = el("cap-render-onizleme");
    if (onizlemeRenderCalisiyor || (video && !video.hidden)) {
      onizlemeRenderCalisiyor = false;
      onizlemeDurdur();
      onizlemeCiz();
      return;
    }
    if (secilenMogrt) {
      var preview = secilenMogrt.previewVideo;
      var mogrtImg = el("cap-mogrt-onizleme");
      var mogrtNot = el("cap-onizleme-not");
      var mogrtBtn = el("cap-onizleme-oynat");
      if (!preview || !video) {
        if (mogrtNot) mogrtNot.textContent = "Animasyon timeline'a eklendiğinde gerçek zamanlamasıyla oynar.";
        return;
      }
      if (mogrtImg) mogrtImg.hidden = true;
      var metin = el("cap-onizleme-metin");
      if (metin) metin.hidden = true;
      video.src = preview;
      video.hidden = false;
      video.loop = true;
      video.play().catch(function () {});
      if (mogrtBtn) mogrtBtn.textContent = "■ Durdur";
      if (mogrtNot) mogrtNot.textContent = temizMogrtAdi(secilenMogrt) + " · gerçek MOGRT animasyonu";
      return;
    }
    var st = stil();
    if (K.nodeOK && /^(mrbeast|capcut|saas|viral|pop|doc|premium)$/.test(st.aile)) {
      onizlemeRenderCalisiyor = true;
      motorOnizlemeOynat().then(function (ok) {
        onizlemeRenderCalisiyor = false;
        if (!ok) onizlemeOynatDom();
      });
      return;
    }
    onizlemeOynatDom();
  }

  function onizlemeOynatDom() {
    var b = el("cap-onizleme-oynat");
    if (onizlemeSaat) { onizlemeDurdur(); onizlemeCiz(); return; }

    var veri = onizlemeMetni();
    if (!veri.kelimeler.length) return;

    var st = stil();
    var anim = st.animasyon || "yok";
    var kelimeli = kelimeModuAktif() &&
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

  function stilRecetesi(st) {
    var aile = (st && st.aile) || "custom";
    var tumu = {
      custom:  { aile: "custom", maxWords: 5, spacing: 0, shadow: 2, boxAlpha: 0x40,
                 boxPadding: 0, marginLR: 80, marginV: 90 },
      viral:   { aile: "viral", maxWords: 3, spacing: 0, shadow: 4, boxAlpha: 0x40,
                 boxPadding: 0, marginLR: 110, marginV: 80 },
      pop:     { aile: "pop", maxWords: 1, spacing: 1, shadow: 5, boxAlpha: 0x40,
                 boxPadding: 0, marginLR: 90, marginV: 70 },
      doc:     { aile: "doc", maxWords: 9, spacing: 0.4, shadow: 0, boxAlpha: 0x2b,
                 boxPadding: 14, marginLR: 150, marginV: 82 },
      premium: { aile: "premium", maxWords: 4, spacing: 4, shadow: 3, boxAlpha: 0x40,
                 boxPadding: 0, marginLR: 150, marginV: 74 },
      mrbeast: { aile: "mrbeast", maxWords: 3, spacing: 0, shadow: 7, boxAlpha: 0x40,
                 boxPadding: 0, marginLR: 90, marginV: 72 },
      capcut:  { aile: "capcut", maxWords: 4, spacing: 0, shadow: 1, boxAlpha: 0x24,
                 boxPadding: 18, marginLR: 100, marginV: 80 },
      saas:    { aile: "saas", maxWords: 6, spacing: 0.5, shadow: 0, boxAlpha: 0x28,
                 boxPadding: 20, marginLR: 120, marginV: 86 }
    };
    return tumu[aile] || tumu.custom;
  }

  function yogunlukCarpani(deger) {
    if (deger === "soft") return 0.72;
    if (deger === "hard") return 1.24;
    return 1;
  }

  // Premium stilde her kelimeyi boyamak yerine yalnız anlam taşıyan bir kelimeyi seç.
  function vurguKelimesi(grup) {
    var atla = /^(ve|ile|bir|bu|şu|o|da|de|mi|mı|mu|mü|için|ama|the|a|an|and|or|of|to)$/i;
    var enIyi = 0, puan = -1;
    for (var i = 0; i < grup.length; i++) {
      var ham = String(grup[i].text || "").replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]/g, "");
      var p = ham.length + (/\d/.test(ham) ? 8 : 0) - (atla.test(ham) ? 6 : 0);
      if (p > puan) { puan = p; enIyi = i; }
    }
    return enIyi;
  }

  var ANIMASYONLAR = {
    yok:     { ad: "Yok",            kelimeli: false },
    fade:    { ad: "Yumuşak geçiş",  kelimeli: false },
    slide:   { ad: "Alttan kayma",   kelimeli: false },
    doc:     { ad: "Belgesel bandı", kelimeli: false },
    karaoke: { ad: "Karaoke dolgu",  kelimeli: true },
    akici:   { ad: "Akıcı dolgu",    kelimeli: true },
    yazim:   { ad: "Daktilo",        kelimeli: true },
    vurgu:   { ad: "Aktif kelime",   kelimeli: true },
    viral:   { ad: "Viral vurgu",    kelimeli: true },
    pop:     { ad: "Pop",            kelimeli: true },
    bounce:  { ad: "Zıplama",        kelimeli: true },
    premium: { ad: "Premium",        kelimeli: true },
    mrbeast: { ad: "Creator Punch",  kelimeli: true },
    capcut:  { ad: "CapCut Clean",   kelimeli: true },
    saas:    { ad: "SaaS Glass",     kelimeli: true }
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
    var rec = stilRecetesi(st);
    var hareket = yogunlukCarpani(st.yogunluk);
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
    // Pro: kelimeli animasyon (stilli katman denemesi kuruluyken de acik)
    if (ANIMASYONLAR[anim].kelimeli && typeof Pro !== "undefined" && !Pro.isPro() && !(Pro.denemeAcik && Pro.denemeAcik("overlay"))) anim = "fade";

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
    var arkaRenk = assRenk(rec.aile === "doc" ? "#05080d" : "#000000",
      st.kutu ? rec.boxAlpha : 0x80);
    var golge = st.kutu ? 0 : rec.shadow;
    var konturDegeri = st.kutu ? rec.boxPadding : st.kontur;
    var altBosluk = st.konum === 2 ? rec.marginV : 40;

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
        "-1,0,0,0,100,100," + rec.spacing + ",0," + kenarBicim + "," + konturDegeri + "," + golge + "," +
        st.konum + "," + rec.marginLR + "," + rec.marginLR + "," + altBosluk + ",1",
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
      if (anim === "doc") {
        var dc = assCapa(st.konum, pw, ph, altBosluk);
        var dY = Math.round(18 * hareket);
        var dMs = Math.round(320 / hareket);
        return "{\\move(" + dc.x + "," + (dc.y + dY) + "," + dc.x + "," + dc.y + ",0," + dMs + ")" +
          "\\fad(" + dMs + ",240)\\blur0.35}";
      }
      return "";
    }

    var vurguAss = assRenk(st.vurguRenk);

    if (ANIMASYONLAR[anim].kelimeli) {
      assKaraokeSatirlari(cs, rec.maxWords).forEach(function (grup) {
        var sonBitis = grup[grup.length - 1].end;

        if (anim === "karaoke" || anim === "akici") {
          // akici: \kf kelimeyi soldan saga surekli boyar (kesikli \k yerine)
          var kTag = anim === "akici" ? "\\kf" : "\\k";
          var parcalar = grup.map(function (c, gi) {
            /*
             * \k sureleri ARDISIKTIR: kelimeler arasi duraklama onceki
             * kelimenin penceresine dahil edilmezse dolgu her duraklamada
             * gercek konusmadan biraz daha one kayar. Son kelime haric sure,
             * bir SONRAKI kelimenin baslangicina kadar sayilir.
             */
            var sonraki = grup[gi + 1];
            var sure = Math.max(1, Math.round(((sonraki ? sonraki.start : c.end) - c.start) * 100)); // santisaniye
            return "{" + kTag + sure + "}" + assMetin(c.text);
          });
          olay(grup[0].start, sonBitis, parcalar.join(" "));
          return;
        }

        if (anim === "premium") {
          // Premium hareket satırı parçalamaz: bütün ifade tek nefeste girer,
          // yalnızca anlam taşıyan bir kelime sıcak altınla vurgulanır.
          var pVurgu = vurguKelimesi(grup);
          var pGiris = Math.round(360 / hareket);
          var pScale = Math.max(93, 100 - Math.round(4 * hareket));
          var pMetin = grup.map(function (c, ci) {
            var k = assMetin(c.text);
            if (ci !== pVurgu) return k;
            return "{\\1c" + vurguAss + "}" + k + "{\\1c" + birincil + "}";
          }).join(" ");
          olay(grup[0].start, sonBitis,
            "{\\fad(" + pGiris + ",260)\\fscx" + pScale + "\\fscy" + pScale +
            "\\blur0.8\\t(0," + pGiris + ",0.65,\\fscx100\\fscy100\\blur0.15)}" + pMetin);
          return;
        }

        if (anim === "pop" && rec.aile === "pop") {
          // Pop ailesinde kelimeler birikmez; her vuruş temiz bir kart gibi
          // tek başına görünür. Renk ve açı kontrollü döner, ekran kirlenmez.
          var palet = [st.vurguRenk, "#45e6ff", st.renk, "#ff6b6b"];
          for (var pi = 0; pi < grup.length; pi++) {
            var popBas = grup[pi].start;
            var popSon = (pi + 1 < grup.length) ? grup[pi + 1].start : sonBitis;
            if (popSon - popBas < 0.01) popSon = popBas + 0.01;
            var popMs = Math.round(120 / hareket);
            var popAsma = Math.round(118 + 8 * hareket);
            var popAci = Math.round((pi % 2 ? 3.5 : -4.5) * hareket);
            var popRenk = assRenk(palet[pi % palet.length]);
            var popTag = "{\\1c" + popRenk + "\\3c" + assRenk(st.konturRenk) +
              "\\bord" + st.kontur + "\\shad" + rec.shadow + "\\frz" + popAci +
              "\\fscx18\\fscy18\\blur1.6\\t(0," + popMs + ",0.48,\\fscx" + popAsma +
              "\\fscy" + popAsma + "\\blur0)\\t(" + popMs + "," + (popMs + 90) +
              ",0.78,\\fscx100\\fscy100\\frz0)\\fad(0,70)}";
            olay(popBas, popSon, popTag + assMetin(grup[pi].text));
          }
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
            if (anim === "viral") {
              // Viral vurgu: bütün kısa ifade görünür, yalnız konuşulan kelime
              // sarı darbe alır. Büyük overshoot tek kelimede kaldığı için okunur.
              if (j === i) {
                var vMs = Math.round(125 / hareket);
                var vAsma = Math.round(118 + 7 * hareket);
                parca.push("{\\1c" + vurguAss + "\\3c" + assRenk(st.konturRenk) +
                  "\\bord" + (st.kontur + 1) + "\\shad" + rec.shadow +
                  "\\fscx62\\fscy62\\blur1.4\\t(0," + vMs + ",0.5,\\fscx" + vAsma +
                  "\\fscy" + vAsma + "\\blur0)\\t(" + vMs + "," + (vMs + 90) +
                  ",0.82,\\fscx100\\fscy100)}" + k + "{\\r}");
              } else {
                parca.push(k);
              }
            } else if (anim === "vurgu") {
              // satırın tamamı hep görünür; aktif kelime renk + hafif büyüme alır
              if (j === i) {
                parca.push("{\\1c" + vurguAss + "\\fscx114\\fscy114\\t(0,110,0.6,\\fscx100\\fscy100)}" + k + "{\\r}");
              } else {
                parca.push(k);
              }
            } else if (anim === "yazim") {
              /*
               * Daktilo: onceki kelimeler duruk, YENI kelime harf harf belirir.
               * Numara: ikincil renk alfasi tam seffaf ({\2a&HFF&}) + harf
               * basina \k — karaoke "henuz soylenmemis" harfleri gorunmez
               * kilar, \k sirasi geldikce harf "yazilir". Pencerenin ~%60'i
               * yazima harcanir, kalani okunur halde bekler.
               */
              if (j < i) parca.push(k);
              else if (j === i) {
                var harfler = String(grup[j].text).split("");
                var csTop = Math.max(4, Math.round((pSon - pBas) * 100));
                var per = Math.max(2, Math.min(8, Math.floor((csTop * 0.6) / Math.max(1, harfler.length))));
                var hp = "{\\2a&HFF&}";
                for (var hh = 0; hh < harfler.length; hh++) {
                  hp += "{\\k" + per + "}" + assMetin(harfler[hh]);
                }
                parca.push(hp);
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
        assKaraokeSatirlari(cs, rec.maxWords).forEach(function (grup) {
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
  var kaliteOnayBekleyen = "";
  var UYGULA_ETIKET = "Normal altyazı izi ekle";

  function uygulaEtiketiniSifirla() {
    onayBekleyen = null;
    kaliteOnayBekleyen = "";
    var b = el("cap-apply");
    if (b) { b.textContent = UYGULA_ETIKET; b.classList.remove("warn"); }
    var styleBtn = el("cap-apply-style");
    if (styleBtn) styleBtn.classList.remove("warn");
    // Stil dugmesinin metni/durumu tek yerde: MOGRT ve Suflo Stilleri ayni kurala uyar
    uygulamaIpucunuGuncelle();
  }

  /* ---------------- Animasyonlu altyazı: timeline'a overlay ---------------- */

  function mogrtCueleri() {
    var cs = cueler();
    if (segmentsMode !== "k1" && segmentsMode !== "w") return cs;
    return assKaraokeSatirlari(cs, 5).map(function (grup) {
      return {
        start: grup[0].start,
        end: grup[grup.length - 1].end,
        text: grup.map(function (cue) { return cue.text; }).join(" ")
      };
    });
  }

  async function mogrtStiliniUygula() {
    if (!secilenMogrt || !secilenMogrt.path) throw new Error("Önce bir Premiere altyazı şablonu seç.");
    if (!K.nodeOK || !K.fs || !K.fs.existsSync(secilenMogrt.path)) throw new Error("Seçili MOGRT dosyası artık bulunamıyor.");
    var cs = mogrtCueleri();
    if (!cs.length) throw new Error("Yazılacak altyazı yok.");
    var batch = "cap-" + Date.now().toString(36);
    var prep = await K.call("KS_prepareCaptionMogrt", {
      path: secilenMogrt.path,
      start: cs[0].start,
      end: cs[cs.length - 1].end,
      batch: batch
    }, 30000);
    if (!prep || !prep.ok) throw new Error(prep && prep.error ? prep.error : "Altyazı katmanı hazırlanamadı.");

    var placed = 0;
    try {
      for (var i = 0; i < cs.length; i++) {
        status("MOGRT altyazıları yerleştiriliyor… " + (i + 1) + " / " + cs.length);
        var r = await K.call("KS_placeCaptionMogrt", {
          path: secilenMogrt.path,
          track: prep.track,
          batch: batch,
          start: cs[i].start,
          end: cs[i].end,
          text: cs[i].text
        }, 60000);
        if (!r || !r.ok) throw new Error((r && r.error ? r.error : "MOGRT altyazı yerleştirilemedi.") + " (satır " + (i + 1) + ")");
        placed++;
      }
    } catch (e) {
      status("Tamamlanamayan MOGRT altyazıları geri alınıyor…", "warn");
      await K.call("KS_removeCaptionMogrtBatch", { batch: batch }, 30000);
      throw e;
    }
    status("");
    KApp.toast(placed + " altyazı · " + temizMogrtAdi(secilenMogrt) + " · " + prep.trackName, "good", 8000);
    yildizIste();
  }

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
    // Pro: animasyonlu katman (ucretsizde kanca basligiyla ortak 3 deneme hakki; deneme ciktisi filigranli)
    if (typeof Pro !== "undefined" && !Pro.gate("overlay", { deneme: true, yeniden: function () { overlayUygula().then(uygulaEtiketiniSifirla); } })) return;
    // Deneme yalniz Suflo Stilleri icin: tercihlerden geri yuklenen bir MOGRT stili deneme kapisindan sizmasin
    if (typeof Pro !== "undefined" && !Pro.isPro() && secilenMogrt) {
      status("Deneme yalnız Suflo Stilleri için. Bir Suflo Stili seç ya da Pro'ya geç.", "warn");
      KApp.toast("Deneme yalnız Suflo Stilleri için.", "warn");
      return;
    }
    if (segments.length === 0) return;
    /*
     * Emoji bekçisi: libass emojiyi HİÇ çizemiyor (denendi — tofu bile değil,
     * boş). Sessizce emojisiz render etmek kullanıcıyı "neden kayboldu" diye
     * bırakır; dürüst olan burada durup yol göstermek.
     */
    if (!secilenMogrt && emojiIceriyorMu()) {
      status("Altyazıda emoji var. Stilli katman motoru emoji çizemiyor; " +
        "emojili altyazı için \"Sekansa uygula\"yı kullan (Premiere renkli çizer) " +
        "ya da emojileri kaldırıp tekrar dene.", "warn");
      return;
    }

    try {
      if (secilenMogrt) {
        await mogrtStiliniUygula();
        return;
      }
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
      var sure = CT.katmanSuresi(sonBitis, (Number(spec.end) || 0) - baslangic, fps);

      var st = stil();
      var stilDerlemesi = null;
      var ass;
      if (motorStiliMi(st.aile)) {
        stilDerlemesi = window.SufloStyleEngine.compile({
          styleId: st.aile,
          intensity: st.yogunluk,
          cueKind: motorCueTuru(),
          cues: cueler({ vurgu: true }),
          offset: baslangic,
          width: g,
          height: y,
          overrides: {
            font: st.font, fontFile: FONTLAR[st.font], boyut: st.boyut,
            renk: st.renk, konturRenk: st.konturRenk, vurguRenk: st.vurguRenk,
            kontur: st.kontur, konum: st.konum
          }
        });
        ass = stilDerlemesi.ass;
      } else {
        // Eski kayitli ozel sablonlar yalnız geriye donuk uyumluluk icin kalir.
        var karaoke = segmentsMode === "k1";
        ass = buildAssKaydirilmis(baslangic,
          { karaoke: karaoke, animasyon: st.animasyon, genislik: g, yukseklik: y });
      }

      /*
       * Deneme hakkıyla (Pro değil) üretilen katmana sağ üstte küçük suflo.app filigranı
       * eklenir; filigransız ASS satın alma sonrası temiz yeniden oluşturmak için saklanır.
       */
      var filigranli = typeof Pro !== "undefined" && !!Pro.filigranGerekli && Pro.filigranGerekli();
      var assTemiz = ass;
      if (filigranli) {
        if (!window.SufloFiligran) throw new Error("Deneme filigranı yüklenemedi.");
        ass = window.SufloFiligran.ekle(ass, { width: g, height: y });
      }

      /*
       * Render ortak modülde (js/overlay-render.js): ASS ve paket fontları geçici klasöre
       * yazılır, ffmpeg orada çalışır (altyazı filtresi mutlak yol kabul etmez, fontsdir=.).
       */
      var fontDosyalari = (stilDerlemesi ? stilDerlemesi.fontFiles : [FONTLAR[st.font]]).filter(Boolean);
      var cikti = K.path.join(K.srtDir(), "suflo-altyazi-" + Date.now() + ".mov");
      await window.SufloOverlayRender.render(K, {
        ass: ass, fontFiles: fontDosyalari, g: g, y: y, fps: fps, sure: sure, cikti: cikti,
        fontDizini: K.path.join(uzantiDizini(), "fonts"),
        durum: function (m) { status(m); }
      });

      status("Timeline'a yerleştiriliyor…");
      var katmanAdi = "Suflo Stil · " + (stilDerlemesi ? stilDerlemesi.id : "Özel");
      var yer = await K.call("KS_placeOverlay", { path: cikti, scope: scope, name: katmanAdi }, 120000);
      if (!yer.ok) throw new Error(yer.error);
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("overlay", KApp.toast);   // deneme: yalniz basarida
      if (filigranli && window.SufloOverlayRender.denemeKaydet) {
        await window.SufloOverlayRender.denemeKaydet(K, Pro, {
          tur: "altyazi", start: typeof yer.start === "number" ? yer.start : baslangic, path: cikti, ad: katmanAdi,
          assTemiz: assTemiz, fontFiles: fontDosyalari, g: g, y: y, fps: fps, sure: sure
        });
      }

      var mb = (K.fs.statSync(cikti).size / 1048576).toFixed(1);
      status("");
      KApp.toast("Altyazı " + yer.trackName + " katmanına eklendi" +
        (yer.newTrack ? " (yeni katman açıldı)" : "") + " · " + mb + " MB", "good", 8000);
      yildizIste();
    } catch (e) {
      status("✕ " + K.hataYardimi(e), "bad");
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

  async function apply(stilIle) {
    if (segments.length === 0) return;
    stilIle = stilIle === true;
    // Rehberin örnek altyazısı yalnız kendi "Suflo Deneme" sekansına: başka sekans açıksa uygulama
    if (ornekBelge && ornekSekansId && KApp.ctx().sequenceId && String(KApp.ctx().sequenceId) !== ornekSekansId) {
      KApp.toast("Bu örnek altyazı Suflo Deneme sekansı için. Önce o sekansı aç, sonra uygula.", "warn", 8000);
      return;
    }
    if (stilIle && !secilenMogrt && !secilenMotorStili) {
      KApp.toast("Önce Altyazı ayarlarından bir stil seç.", "warn");
      return;
    }
    var rapor = qualityReport();
    var kritik = Number(rapor.bad) || 0;
    var sekans = (KApp.ctx().sequenceId || KApp.ctx().sequence || "") || "?";
    var kaliteAnahtari = stilIle ? "style" : "normal";
    var yeniIzOnayi = !stilIle && uygulananSekans[sekans] && onayBekleyen !== sekans;
    if ((kritik > 0 && kaliteOnayBekleyen !== kaliteAnahtari) || yeniIzOnayi) {
      if (kritik > 0) kaliteOnayBekleyen = kaliteAnahtari;
      if (yeniIzOnayi) onayBekleyen = sekans;
      var uyariBtn = el(stilIle ? "cap-apply-style" : "cap-apply");
      if (uyariBtn) {
        uyariBtn.textContent = yeniIzOnayi
          ? "Yine de yeni iz ekle" + (kritik > 0 ? " · " + kritik + " sorun" : "")
          : kritik + " kritik sorunla yine de uygula";
        uyariBtn.classList.add("warn");
      }
      var uyari = kritik > 0
        ? kritik + " kritik altyazı sorunu var. Önce kırmızı satırları kontrol et veya Nizami düzelt'i kullan."
        : "";
      if (yeniIzOnayi) {
        uyari += (uyari ? " " : "") + "Bu sekansa zaten altyazı uygulandı; devam etmek yeni bir altyazı izi ekler.";
      }
      KApp.toast(uyari, "warn", 9000);
      return;
    }
    if (stilIle && !secilenMogrt && secilenMotorStili) {
      await overlayUygula();             // Pro kapisi overlayUygula icinde
      uygulaEtiketiniSifirla();
      return;
    }
    if (stilIle) {
      if (typeof Pro !== "undefined" && !Pro.gate("mogrt")) return;
      try {
        await mogrtStiliniUygula();
        uygulaEtiketiniSifirla();
      } catch (eMogrt) {
        status("", "");
        KApp.toast("✕ " + (eMogrt && eMogrt.message ? eMogrt.message : eMogrt), "bad", 8000);
      }
      return;
    }
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
      var srt = buildSrt({ ciftDil: ciftDilAcik() });
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
          // Shorts transkripti ya da rehberin örneği uygulandıysa ana videonun taslağı
          // (uygulanmamış iş olabilir) silinmez, "Kurtar" teklifi de kalır
          if (!shortsYuklenen && !ornekBelge) K.clearDraft();
          if (!ornekBelge) hideRestore();
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

  function emojiIceriyorMu() {
    for (var i = 0; i < segments.length; i++) {
      /*
       * Yalniz GERCEKTEN renkli cizilen karakterler: surrogate ciftleri,
       * VS16 secicisi ve Emoji_Presentation=Yes olan dar BMP kumesi.
       * Eski genis ☀-➿ araligi ♪ ★ ✓ gibi siradan sembolleri de emoji
       * sayip stilli katmani gereksiz yere engelliyordu.
       */
      if (/[\uD800-\uDFFF\uFE0F\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u270A\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55]/.test(segments[i].text || "")) return true;
    }
    return false;
  }

  /*
   * Ucuncu basarili uygulamadan sonra BIR KEZ yildiz iste.
   * Kurallar bilincli: (1) mutlu anda sorulur, isin ortasinda degil, (2) omurde tek sefer,
   * (3) kapatilabilir ve isi engellemez. Erken veya tekrarlayan istek uruna zarar verir.
   * Sayac yildizdan sonra da surer: 5. basarili uygulama davet seridinin anidir (js/davet.js;
   * yildiz seridi acikken ya da Premiere mesgulken cikmaz, 30 gunde en cok bir kez).
   */
  function yildizIste() {
    var s = K.settings();
    s.basariliUygulama = (s.basariliUygulama || 0) + 1;
    K.saveSettings();
    if (!s.yildizSoruldu && s.basariliUygulama >= 3) {
      s.yildizSoruldu = true;
      K.saveSettings();
      // toast yerine kalici, kapatilabilir bir serit: kullanici hazir oldugunda tiklar
      var bar = el("star-bar");
      if (bar) bar.hidden = false;
      return;
    }
    if (window.KApp && KApp.davetAni) KApp.davetAni({ type: "apply", count: s.basariliUygulama });
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
      var kelimeModu = segmentsMode === "k1" || segmentsMode === "w"; // kc haric: ASS'te metin katlaniyordu
      var icerik, ad, bom = "﻿";
      if (fmt === "txt") {
        var lines = segments.map(function (s) { return styleText(CT.stripEmphasis(s.text)); }).filter(Boolean);
        if (!lines.length) { KApp.toast("Yazılacak metin yok.", "bad"); return; }
        icerik = lines.join("\r\n");
        ad = "suflo-transkript.txt";
      } else if (fmt === "vtt") {
        icerik = buildVtt({ ciftDil: ciftDilAcik() });
        ad = "suflo-altyazi.vtt";
      } else if (fmt === "ass") {
        if (typeof Pro !== "undefined" && !Pro.gate("assexport")) return;    // Pro: stilli ASS
        var assStil = stil();
        if (motorStiliMi(assStil.aile)) {
          icerik = window.SufloStyleEngine.compile({
            styleId: assStil.aile, intensity: assStil.yogunluk, cues: cueler({ vurgu: true }), cueKind: motorCueTuru(),
            overrides: {
              font: assStil.font, fontFile: FONTLAR[assStil.font], boyut: assStil.boyut,
              renk: assStil.renk, konturRenk: assStil.konturRenk,
              vurguRenk: assStil.vurguRenk, kontur: assStil.kontur, konum: assStil.konum
            }
          }).ass;
        } else {
          icerik = buildAss({ karaoke: kelimeModu, animasyon: assStil.animasyon });
        }
        ad = "suflo-altyazi.ass";
        bom = "";
      } else {
        icerik = buildSrt({ ciftDil: ciftDilAcik() });
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
    el("cap-apply").addEventListener("click", function () { apply(false); });
    el("cap-apply-style").addEventListener("click", function () { apply(true); });
    el("cap-save").addEventListener("click", saveAs);
    el("cap-import-srt").addEventListener("click", function (e) { e.preventDefault(); importSrt(); });
    el("cap-preset-save").addEventListener("click", saveUserPreset);
    el("cap-translate-go").addEventListener("click", translateAll);
    if (el("cap-paket-go")) el("cap-paket-go").addEventListener("click", cokDilliPaket);
    el("cap-revert").addEventListener("click", revertTranslate);
    el("cap-fr-go").addEventListener("click", findReplace);
    el("cap-fr-glossary").addEventListener("click", addToGlossary);
    el("cap-undo").addEventListener("click", undo);
    el("cap-redo").addEventListener("click", redo);
    el("cap-shift-back").addEventListener("click", function () { shiftAll(-0.5); });
    el("cap-shift-fwd").addEventListener("click", function () { shiftAll(0.5); });
    el("cap-add-line").addEventListener("click", function () { insertAfter(segments.length - 1); });
    if (el("cap-editor-search")) el("cap-editor-search").addEventListener("input", function () {
      editorQuery = this.value || "";
      applyEditorFilters();
    });
    if (el("cap-filter-issues")) el("cap-filter-issues").addEventListener("click", function () {
      editorOnlyIssues = !editorOnlyIssues;
      this.classList.toggle("on", editorOnlyIssues);
      applyEditorFilters();
    });
    if (el("cap-auto-fix")) el("cap-auto-fix").addEventListener("click", qualityAutoFix);
    if (el("cap-auto-emoji")) el("cap-auto-emoji").addEventListener("click", otomatikEmoji);
    if (el("cap-auto-vurgu")) el("cap-auto-vurgu").addEventListener("click", otomatikVurgu);
    if (el("cap-guvenli-alan")) el("cap-guvenli-alan").addEventListener("change", function () {
      var v = el("cap-render-onizleme");
      if (v && !v.hidden) { onizlemeDurdur(); motorOnizlemeOynat(); }
    });
    if (el("cap-proofread")) el("cap-proofread").addEventListener("click", proofreadAll);
    if (el("cap-learn-last")) el("cap-learn-last").addEventListener("click", learnLastCorrection);
    if (el("cap-history")) el("cap-history").addEventListener("click", function () {
      var menu = el("cap-history-menu");
      renderHistory();
      menu.hidden = !menu.hidden;
    });
    initYildizBar();
    initStilKartlari();
    motorStilleriniCiz();
    // Emoji seçici ayrı modülde (js/emoji-picker.js); altyazı durumuna bu arayüzle bağlanır
    if (window.KEmojiPicker) {
      KEmojiPicker.init({
        segments: function () { return segments; },
        kaydet: saveDraftSoon,
        onizle: onizlemeCiz,
        uzantiDizini: uzantiDizini
      });
    }
    // acilista secili sablonu kartlara yansit
    if (el("cap-preset") && el("cap-preset").value) stilKartiIsaretle(el("cap-preset").value);

    /* Görünüm kontrolleri: her değişiklikte önizleme anında yenilenir ve kaydedilir */
    ["cap-font", "cap-boyut", "cap-renk", "cap-renk-kontur", "cap-renk-vurgu", "cap-yogunluk",
     "cap-kontur", "cap-konum", "cap-kutu", "cap-animasyon"].forEach(function (id) {
      var e = el(id);
      if (!e) return;
      // renk seçicide "input" anlık, diğerlerinde "change" yeterli
      var olay = e.type === "color" ? "input" : "change";
      e.addEventListener(olay, function () {
        secilenMogrt = null;
        bekleyenMogrtYolu = "";
        onizlemeDurdur();
        vurguKutusuDurumu();     // animasyon değişince ipucu ve vurgu rengi durumu
        onizlemeCiz();
        savePrefs();
        // stil elle değiştiyse artık hazır şablonda değiliz; aile hâlâ bir Suflo
        // stiliyse o stil (ince ayarlı haliyle) seçili kalır ve kartı işaretli görünür
        if (el("cap-preset")) el("cap-preset").value = "";
        secilenMotorStili = motorStiliMi(stil().aile) ? stil().aile : "";
        stilKartiIsaretle(secilenMotorStili);
        uygulamaIpucunuGuncelle();
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
      if (k === "f" && el("cap-result") && !el("cap-result").hidden) {
        e.preventDefault(); el("cap-editor-search").focus(); el("cap-editor-search").select();
      }
      else if (k === "z" && !e.shiftKey && !yaziyor) { e.preventDefault(); undo(); }
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
      // Rehber açıksa hızlı başlangıç: dile uygun küçük model, ffmpeg arkada, GPU sonra
      var rehber = window.KOnboarding && KOnboarding.kurulumSecenekleri ? KOnboarding.kurulumSecenekleri() : null;
      KApp.installLocalWhisper(el("cap-local-install"), rehber);
    });
    el("cap-key-save").addEventListener("click", function () {
      if (anahtarKaydet(el("cap-key-input").value)) KApp.toast("Anahtar kaydedildi", "good");
    });

    // şablon seçimi kontrolleri günceller; elle değişiklik şablonu "Özel"e düşürür
    el("cap-preset").addEventListener("change", function () {
      applyPreset(this.value);
      savePrefs();
    });
    digerDilleriEkle();
    ["cap-maxlen", "cap-case", "cap-punct", "cap-lang"].forEach(function (id) {
      el(id).addEventListener("change", function () {
        if (id !== "cap-lang") el("cap-preset").value = "";
        if (id === "cap-lang") glifUyarisi();
        savePrefs();
      });
    });
    loadPrefs();
    glifUyarisi();
    // Arayüz dili değişince (Ayarlar ya da ilk açılış seçicisi): örnek sözcükler ve kayıtlı
    // tercih yoksa altyazı dili (İngilizcede Otomatik) yeni dile uyar
    if (window.SufloI18n && SufloI18n.onChange) SufloI18n.onChange(function (l) {
      if (!K.settings().capPrefs && el("cap-lang")) { el("cap-lang").value = l === "en" ? "" : "tr"; glifUyarisi(); }
      stilOrnekleriniYaz();
      onizlemeCiz();
    });
    vurguKutusuDurumu();
    onizlemeCiz();
    stilKartiIsaretle(el("cap-preset").value);
    uygulamaIpucunuGuncelle();

    if (el("cap-shorts-al")) el("cap-shorts-al").addEventListener("click", shortsAltyazisiAl);
    var sonSekans = null;
    KApp.onContext(function (ctx) {
      shortsDugmesi(ctx);
      // başka sekansa geçildiyse bekleyen "yine de ekle" onayı düşsün
      if (ctx.sequence !== sonSekans) { sonSekans = ctx.sequence; uygulaEtiketiniSifirla(); }
      refreshButton();
      renderTracks(ctx);
      var oncekiOran = sekansOrani();
      mogrtBaglam = { width: Number(ctx.width) || 0, height: Number(ctx.height) || 0 };
      if (oncekiOran !== sekansOrani()) mogrtStilleriniCiz();
    });
    refreshSetup();
  }

  /*
   * Suflo Shorts sekansi acikken: ana videonun transkriptinden o anin satirlari
   * (viral.js olustururken K.settings().shortsAltyazi'ya yazar) yeniden yaziya
   * dokmeden yuklenir.
   */
  var shortsYuklenen = "";
  function shortsKaydi(ctx) {
    var id = ctx && ctx.sequenceId;
    var harita = (K.settings().shortsAltyazi) || {};
    return id && harita[id] ? { id: String(id), kayit: harita[id] } : null;
  }
  // Shorts transkriptindeki duzenlemeler kendi kaydina (ayarlar) yazilir; ana taslak korunur
  function shortsKaydiGuncelle() {
    var s = K.settings();
    var harita = s.shortsAltyazi || {};
    if (!harita[shortsYuklenen]) return;
    harita[shortsYuklenen].segs = JSON.parse(JSON.stringify(segments));
    harita[shortsYuklenen].mod = segmentsMode;
    harita[shortsYuklenen].ceviriDili = ceviriDili;
    harita[shortsYuklenen].ts = Date.now();
    K.saveSettings();
  }

  function shortsDugmesi(ctx) {
    var b = el("cap-shorts-al");
    if (!b) return;
    var k = shortsKaydi(ctx);
    var goster = !!k && k.kayit.segs && k.kayit.segs.length && shortsYuklenen !== k.id;
    b.hidden = !goster;
    if (goster) b.textContent = "Bu Shorts'un altyazısını ana videodan al (" + k.kayit.segs.length + " satır)";
  }
  function shortsAltyazisiAl() {
    var k = shortsKaydi(KApp.ctx());
    if (!k) return;
    cancelDraft();   // bekleyen ana-video taslak yazimi Shorts satirlariyla calismasin
    if (segments.length) snapshot("Shorts altyazısı");
    else { undoStack.length = 0; redoStack.length = 0; refreshUndoUI(); }
    segments = JSON.parse(JSON.stringify(k.kayit.segs));
    segmentsMode = k.kayit.mod || "plain";
    shortsYuklenen = k.id;
    ornekBelge = false;
    // ceviri bilgisi satirlarda (orig) kalir; hedef dil kayittan
    ceviriDili = k.kayit.ceviriDili || "";
    hideRestore();
    el("cap-result").hidden = false;
    el("cap-result-info").textContent = segments.length + " satır · Shorts (ana videodan)";
    render();
    shortsDugmesi(KApp.ctx());
    KApp.toast("Altyazı yüklendi: " + segments.length + " satır · yeniden yazıya dökmeye gerek yok", "good");
  }

  /*
   * Bulut/AI anahtarını kaydet (altyazı kurulum kartı ve rehberin anahtar sihirbazı).
   * Sağlayıcı kuralı: yerel motor hazırsa "local" kalır (anahtar yalnız AI metin
   * özellikleri için kullanılır), değilse Groq bulut rotası açılır. secenek.saglayici
   * "groq" ise (sihirbaz Groq'ta doğruladı) OpenAI/özel ayarı Groq'a çevrilir.
   * Ayarlar'daki alanlara da yansıtılır: yoksa sonraki "Yedeği kaydet" anahtarı siler.
   */
  function anahtarKaydet(v, secenek) {
    v = String(v || "").trim();
    if (!v) return false;
    secenek = secenek || {};
    var s = K.settings();
    s.apiKey = v;
    if (s.provider === "local" || !s.provider) {
      if (!K.whisperLocal()) s.provider = "groq";
    } else if (secenek.saglayici === "groq") {
      s.provider = "groq";
    }
    K.saveSettings();
    var ak = document.getElementById("set-apikey");
    var sp = document.getElementById("set-provider");
    if (ak) ak.value = v;
    if (sp) {
      sp.value = s.provider || "local";
      var ozel = document.getElementById("set-custom-row");
      if (ozel) ozel.hidden = sp.value !== "custom";
    }
    refreshSetup();
    ayarDegisti("anahtar");
    return true;
  }

  /*
   * Anahtarı kaydetmek altyazı sesini buluta (Groq) gönderecek mi? anahtarKaydet yerel
   * motor yokken sağlayıcıyı "groq" yapar; go() yerel motor hazır değilse bulut rotasını
   * kullanır. Sihirbaz bu durumda açık onay satırını gösterir.
   */
  function anahtarSesiBulutaGonderir() {
    if (localEngineReady()) return false;
    var s = K.settings();
    if (s.provider === "local" || !s.provider) return !K.whisperLocal();
    return true;
  }

  // Ayar değişti: AI çipleri, rehber ve motor rotası tazelensin
  function ayarDegisti(neden) {
    try { document.dispatchEvent(new CustomEvent("suflo:ayar", { detail: { neden: neden || "" } })); } catch (e) {}
  }

  /*
   * Rehberin stil adımı: Creator Punch gibi bir Suflo stilini geçici dener.
   * Tercih KAYDEDİLMEZ; stilYedegi() ile alınan önceki durum adım kapanınca
   * stilYedeginiYukle() ile geri konur — ücretsiz kullanıcının varsayılanı
   * sessizce Pro stiline dönmesin.
   */
  var STIL_ALANLARI = ["cap-preset", "cap-maxlen", "cap-case", "cap-style-family", "cap-yogunluk", "cap-font",
    "cap-boyut", "cap-renk", "cap-renk-kontur", "cap-renk-vurgu", "cap-kontur", "cap-konum", "cap-animasyon"];
  function stilYedegi() {
    var y = {
      alan: {},
      punct: !!(el("cap-punct") && el("cap-punct").checked),
      kutu: !!(el("cap-kutu") && el("cap-kutu").checked),
      motor: secilenMotorStili, mogrt: secilenMogrt, bekleyen: bekleyenMogrtYolu,
      prefs: K.settings().capPrefs ? JSON.stringify(K.settings().capPrefs) : null
    };
    STIL_ALANLARI.forEach(function (id) { var e = el(id); if (e) y.alan[id] = e.value; });
    return y;
  }
  function stilYedeginiYukle(y) {
    if (!y || !y.alan) return;
    onizlemeDurdur();
    STIL_ALANLARI.forEach(function (id) {
      var e = el(id);
      if (e && y.alan[id] !== undefined) e.value = y.alan[id];
    });
    if (el("cap-punct")) el("cap-punct").checked = y.punct;
    if (el("cap-kutu")) el("cap-kutu").checked = y.kutu;
    secilenMotorStili = y.motor || "";
    secilenMogrt = y.mogrt || null;
    bekleyenMogrtYolu = y.bekleyen || "";
    /*
     * Kayıtlı tercihte YALNIZ görünüm alanları önceki haline döner; deneme sırasında
     * kaydedilen başka tercihler (ör. altyazı dili) korunur. Önceden tercih yoksa
     * görünüm alanları silinir (açılışta varsayılan görünüm gelir), gerisi kalır.
     */
    var s = K.settings();
    var eski = null;
    try { eski = y.prefs ? JSON.parse(y.prefs) : null; } catch (eP) { eski = null; }
    var yeni = window.SufloOnboarding ? window.SufloOnboarding.stilTercihiGeriYukle(s.capPrefs, eski) : eski;
    if (yeni) s.capPrefs = yeni; else delete s.capPrefs;
    K.saveSettings();
    vurguKutusuDurumu();
    onizlemeCiz();
    stilKartiIsaretle(secilenMogrt ? "" : (y.alan["cap-preset"] || secilenMotorStili));
    uygulamaIpucunuGuncelle();
  }
  function stilDene(id) {
    if (!PRESETS[id]) return false;
    if (el("cap-preset")) el("cap-preset").value = id;
    applyPreset(id);
    var grid = el("cap-stil-grid");
    if (grid && grid.scrollIntoView) {
      try { grid.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (eS) { grid.scrollIntoView(); }
    }
    // Gercek stil motoru onizlemesi ffmpeg ister; yoksa sessizce atla (DOM onizlemesi kalir)
    K.findFfmpeg().then(function (ff) {
      if (!ff || !motorStiliMi(stil().aile)) return;
      if (onizlemeSaat) onizlemeDurdur();
      onizlemeRenderCalisiyor = true;
      return motorOnizlemeOynat().then(function () { onizlemeRenderCalisiyor = false; });
    }).catch(function () { onizlemeRenderCalisiyor = false; });
    return true;
  }

  // Diger moduller (ornegin Akilli SFX) transkripti okuyabilsin; asil dizi
  // disaridan degistirilemesin diye yalnizca sade bir kopya verilir.
  // vurgu: kullanicinin *isaretledigi* ilk kelime ve tahmini ani (Zoom / Akilli SFX kullanir)
  function segmentsSnapshot() {
    return segments.map(function (s) {
      var o = { start: Number(s.start) || 0, end: Number(s.end) || 0, text: CT.stripEmphasis(String(s.text || "")) };
      var v = CT.emphasisInfo(s);
      if (v) o.vurgu = v;
      return o;
    });
  }

  return {
    init: init,
    refreshSetup: refreshSetup,
    // Rehber (js/onboarding.js): örnek klip, hazır transkript, anahtar, stil denemesi
    go: go,
    ornekYukle: ornekYukle,
    onSonuc: onSonuc,
    anahtarKaydet: anahtarKaydet,
    ayarDegisti: ayarDegisti,
    stilYedegi: stilYedegi,
    stilYedeginiYukle: stilYedeginiYukle,
    stilDene: stilDene,
    // Kullanıcının seçili bir animasyonlu stili (Suflo stili ya da MOGRT) var mı
    stilSecili: function () { return !!(secilenMogrt || secilenMotorStili); },
    // Seçili stil bir MOGRT mi (Pro kütüphanesi; Suflo Stillerinin aksine deneme hakkı yok)
    mogrtSecili: function () { return !!secilenMogrt; },
    // Bilinçli görünüm değişikliği sayılan kontroller (rehber: stil yedeğini bırakır)
    stilKontrolleri: function () { return STIL_ALANLARI.concat(["cap-punct", "cap-kutu"]); },
    // Rehberin örnek klibi: altyazı yalnız bu sekansa uygulanır ("" = bilinmiyor)
    ornekHedefi: function (seqId) { ornekSekansId = seqId ? String(seqId) : ""; },
    anahtarSesiBulutaGonderir: anahtarSesiBulutaGonderir,
    applyStyled: function () { return apply(true); },
    hasSegments: function () { return segments.length > 0; },
    engineReady: engineReady,
    localEngineReady: localEngineReady,
    glossaryText: glossaryText,
    parseGlossary: parseGlossary,
    getSegments: segmentsSnapshot,
    translationLang: function () { return ceviriDili; },
    // Shorts sekanslari icin ham satirlar (*vurgu* ve orig korunur) ve mod
    rawSegments: function () { return JSON.parse(JSON.stringify(segments)); },
    mode: function () { return segmentsMode; },
    refreshEngineStyles: motorStilleriniCiz,
    transcribeWords: transcribeWords,
    // Bulut LLM (Groq/OpenAI) — ceviri ile ayni ayar ve anahtar
    chatConfig: chatConfig,
    chatCall: chatCall,
    // Bolum/viral basliklari ekrandaki metnin dilinde: ceviri varsa hedef dil
    language: function () { return (ceviriDili && ceviriVar() ? ceviriDili : "") || algilananDil || (el("cap-lang") && el("cap-lang").value) || arayuzDili(); },
    refreshMogrtStyles: refreshMogrtStyles
  };
})();
