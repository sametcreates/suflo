/*
 * Suflo — Sesi iyileştir (Kesim sekmesi)
 * Filtre zinciri, ölçüm ayrıştırma ve gecikme hesabı js/audio-clean.js'te (saf,
 * testli). Burada: seçili klibin sesini ffmpeg ile işle, gürültü azaltıcının
 * gecikmesini ölçüp telafi et (dudak senkronu), sonucu klibin altına koy.
 */
window.KSes = (function () {
  "use strict";

  var AC = window.SufloAudioClean;
  var busy = false;
  var gecikmeOnbellek = {};   // zincir -> sn (oturum boyunca)

  function el(id) { return document.getElementById(id); }

  function durum(msg, cls) {
    var e = el("ses-status");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function secim() { var c = KApp.ctx(); return c && c.sel ? c.sel : null; }

  function ayarlar() {
    return { hedef: el("ses-hedef").value, guc: el("ses-guc").value };
  }

  function dugmeler() {
    var var_ = !!secim() && !busy;
    el("ses-olc").disabled = !var_;
    el("ses-go").disabled = !var_;
  }

  function f32(buf) {
    var a = new Float32Array(Math.floor(buf.length / 4));
    for (var i = 0; i < a.length; i++) a[i] = buf.readFloatLE(i * 4);
    return a;
  }

  async function probe(ff, af) {
    var yol = K.path.join(K.tmpDir(), "suflo_sesprobe_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7) + ".raw");
    var args = ["-y", "-v", "error", "-f", "lavfi", "-i", AC.PROBE_KAYNAK];
    if (af) args.push("-af", af);
    args.push("-t", "4", "-ar", String(AC.PROBE_SR), "-ac", "1", "-f", "f32le", yol);
    try {
      var r = await K.run(ff, args, { timeout: 60000 });
      if (r.code !== 0 || !K.fs.existsSync(yol)) throw new Error("ses testi çalışmadı");
      return f32(K.fs.readFileSync(yol));
    } finally {
      try { K.fs.unlinkSync(yol); } catch (e) {}
    }
  }

  // Zincirin gecikmesi (sn): ffmpeg surumune gore degisir, olcup onbellege al
  async function gecikme(ff, zincir) {
    var anahtar = ff + "|" + zincir;
    if (gecikmeOnbellek[anahtar] != null) return gecikmeOnbellek[anahtar];
    var ref = await probe(ff, null);
    var out = await probe(ff, zincir);
    var d = AC.measureLag(ref, out, AC.PROBE_SR, 300);
    gecikmeOnbellek[anahtar] = d;
    K.log("[ses] zincir gecikmesi " + (d * 1000).toFixed(1) + " ms");
    return d;
  }

  // Kaynaktaki ses akislari (ffmpeg -i stderr'inden). Ses yoksa anlasilir hata.
  async function akislar(ff, medya) {
    var r = await K.run(ff, ["-hide_banner", "-i", medya], { timeout: 60000 });
    var a = AC.parseStreams(r.stderr);
    if (!a.length) throw new Error("Bu klipte ses yok.");
    return a;
  }

  async function olcum(ff, args) {
    var r = await K.run(ff, ["-hide_banner", "-nostats"].concat(args).concat(["-af", "ebur128", "-f", "null", "-"]),
      { timeout: 900000 });
    return AC.parseEbur128(r.stderr);
  }

  async function olc() {
    var c = secim();
    var hata = AC.clipCheck(c);
    if (hata) { durum(hata, "warn"); return; }
    if (busy) return;
    busy = true; dugmeler();
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");
      durum("Ses ölçülüyor…");
      var dur = c.outPoint - c.inPoint;
      await akislar(ff, c.mediaPath);
      var m = await olcum(ff, ["-ss", String(c.inPoint), "-t", String(dur), "-i", c.mediaPath, "-map", "0:a:0"]);
      var h = AC.HEDEFLER[ayarlar().hedef];
      durum("Şu an: " + AC.describe(m.I, h.I) + " · hedef " + h.ad);
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      busy = false; dugmeler();
    }
  }

  // Tek klibi isle ve yerlestir. Doner: { yer, ak, sonra, cikti }
  async function tekKlip(ff, c, son, o) {
    var ak = await akislar(ff, c.mediaPath);
    var dur = c.outPoint - c.inPoint;
    var ad = String(c.name || "ses").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
    var cikti = K.path.join(K.srtDir(), "suflo-temiz-" + ad + "-" + Date.now() + ".wav");
    K.fs.mkdirSync(K.path.dirname(cikti), { recursive: true });
    var yerlesti = false;
    try {
      // ilk ses akisi; kanal sayisi sabit (5.1/4 kanalli kamera dosyasi tek stereo klip olsun)
      var r = await K.run(ff, ["-y", "-hide_banner", "-nostats", "-ss", String(c.inPoint), "-t", String(dur), "-i", c.mediaPath,
        "-map", "0:a:0", "-af", son, "-t", String(dur), "-ac", String(AC.outputChannels(ak[0].kanal)), "-ar", "48000", "-c:a", "pcm_s16le", cikti],
        { timeout: Math.max(180000, dur * 3000) });
      if (r.code !== 0 || !K.fs.existsSync(cikti)) {
        throw new Error("Ses işlenemedi: " + String(r.stderr || "").split("\n").filter(Boolean).slice(-1)[0]);
      }
      // islem sirasinda baska klip secilse de temiz ses BASLADIGI klibin altina gider (c sabit)
      var yer = await K.call("KS_placeCleanAudio", {
        path: cikti, start: c.clipStart, end: c.clipEnd, inPoint: c.inPoint, mediaPath: c.mediaPath,
        name: "Suflo temiz · " + (c.name || "ses"),
        // birden cok ses akisi (OBS mikrofon + masaustu gibi): yalniz ilki temizlendi, digerleri kapanmasin
        disableOriginal: ak.length === 1
      }, 120000);
      if (!yer.ok) throw new Error(yer.error);
      yerlesti = true;   // dosya artik projede: hata olsa da silinmez
      return { yer: yer, ak: ak, cikti: cikti };
    } finally {
      if (!yerlesti) { try { K.fs.unlinkSync(cikti); } catch (e2) {} }
    }
  }

  async function iyilestir() {
    if (typeof Pro !== "undefined" && !Pro.gate("audioclean")) return;
    if (busy) return;
    var c = secim();
    var hata = AC.clipCheck(c);
    if (hata) { durum(hata, "warn"); return; }
    busy = true; dugmeler();
    var btn = el("ses-go");
    try {
      // birden cok klip secildiyse hepsi (bagli video+ses cifti tek sayilir)
      var liste = [c];
      try {
        var sr = await K.call("KS_getSelectedClips", {}, 15000);
        if (sr && sr.ok && sr.clips && sr.clips.length > 1) liste = sr.clips;
      } catch (eS) {}
      var uygun = liste.filter(function (k) { return !AC.clipCheck(k); });
      var atlanan = liste.length - uygun.length;
      if (!uygun.length) throw new Error(AC.clipCheck(liste[0]) || "Uygun klip yok.");

      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");
      var o = ayarlar();
      var zincir = AC.filterChain(o);
      durum("Senkron için filtre gecikmesi ölçülüyor…");
      var son = AC.compensate(zincir, await gecikme(ff, zincir));

      var sonuclar = [], hatalar = [];
      for (var i = 0; i < uygun.length; i++) {
        var k = uygun[i];
        durum((uygun.length > 1 ? (i + 1) + "/" + uygun.length + " · " : "") + "Ses temizleniyor… (" + Math.round(k.outPoint - k.inPoint) + " sn)");
        try { sonuclar.push(await tekKlip(ff, k, son, o)); }
        catch (eK) { hatalar.push((k.name || "klip") + ": " + K.hataYardimi(eK)); }
      }
      if (!sonuclar.length) throw new Error(hatalar.join("; "));

      var ilk = sonuclar[0];
      var sonra = await olcum(ff, ["-i", ilk.cikti]);
      var kapatilan = sonuclar.reduce(function (n, x) { return n + (x.yer.disabled || 0); }, 0);
      var cokAkis = sonuclar.some(function (x) { return x.ak.length > 1; });
      var jl = sonuclar.some(function (x) { return x.yer.skipped; });
      var not = (kapatilan ? " · orijinal ses kapatıldı (sağ tık → Etkinleştir ile geri açılır)" : "") +
        (cokAkis ? " · birden çok ses akışlı dosyada yalnız ilki temizlendi, orijinali elle kapat" : "") +
        (jl ? " · seçimden uzun orijinal ses (J/L kesim) elle kapatılmalı" : "") +
        (atlanan ? " · " + atlanan + " klip atlandı (hızı değişmiş ya da çok kısa)" : "") +
        (hatalar.length ? " · hata: " + hatalar.join("; ").slice(0, 160) : "");
      durum("Bitti: " + (sonuclar.length > 1 ? sonuclar.length + " klip · " : "") + AC.describe(sonra.I, AC.HEDEFLER[o.hedef].I) +
        " · " + ilk.yer.trackName + not, hatalar.length ? "warn" : "good");
      var a = el("ses-audio");
      if (a) {
        a.src = encodeURI("file:///" + ilk.cikti.replace(/\\/g, "/")).replace(/#/g, "%23").replace(/\?/g, "%3F").replace(/'/g, "%27");
        a.hidden = false;
      }
      KApp.toast(sonuclar.length > 1 ? sonuclar.length + " klibin sesi iyileştirildi" :
        "Temiz ses " + ilk.yer.trackName + " kanalına eklendi" + (ilk.yer.newTrack ? " (yeni kanal)" : ""), "good");
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      busy = false; dugmeler();
      if (btn) btn.disabled = !secim();
    }
  }

  function init() {
    if (!AC || !el("ses-card")) return;
    el("ses-olc").addEventListener("click", olc);
    el("ses-go").addEventListener("click", iyilestir);
    KApp.onContext(function () { dugmeler(); });
    dugmeler();
  }

  return { init: init };
})();
