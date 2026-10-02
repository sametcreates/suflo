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
      var m = await olcum(ff, ["-ss", String(c.inPoint), "-t", String(dur), "-i", c.mediaPath, "-vn"]);
      var h = AC.HEDEFLER[ayarlar().hedef];
      durum("Şu an: " + AC.describe(m.I, h.I) + " · hedef " + h.ad);
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      busy = false; dugmeler();
    }
  }

  async function iyilestir() {
    if (typeof Pro !== "undefined" && !Pro.gate("audioclean")) return;
    var c = secim();
    var hata = AC.clipCheck(c);
    if (hata) { durum(hata, "warn"); return; }
    if (busy) return;
    busy = true; dugmeler();
    var btn = el("ses-go");
    var cikti = "", yerlesti = false;
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("ffmpeg bulunamadı — Ayarlar sekmesinden kur.");
      var o = ayarlar();
      var zincir = AC.filterChain(o);
      durum("Senkron için filtre gecikmesi ölçülüyor…");
      var d = await gecikme(ff, zincir);
      var son = AC.compensate(zincir, d);
      var dur = c.outPoint - c.inPoint;
      var ad = String(c.name || "ses").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 40);
      cikti = K.path.join(K.srtDir(), "suflo-temiz-" + ad + "-" + Date.now() + ".wav");
      K.fs.mkdirSync(K.path.dirname(cikti), { recursive: true });
      durum("Ses temizleniyor… (" + Math.round(dur) + " sn)");
      var r = await K.run(ff, ["-y", "-hide_banner", "-nostats", "-ss", String(c.inPoint), "-t", String(dur), "-i", c.mediaPath, "-vn",
        "-af", son, "-t", String(dur), "-ar", "48000", "-c:a", "pcm_s16le", cikti],
        { timeout: Math.max(180000, dur * 3000) });
      if (r.code !== 0 || !K.fs.existsSync(cikti)) {
        throw new Error("Ses işlenemedi: " + String(r.stderr || "").split("\n").filter(Boolean).slice(-1)[0]);
      }
      // islem sirasinda baska klip secilse de temiz ses BASLADIGI klibin altina gider (c sabit)
      durum("Timeline'a yerleştiriliyor…");
      var yer = await K.call("KS_placeCleanAudio", {
        path: cikti, start: c.clipStart, end: c.clipEnd, mediaPath: c.mediaPath,
        name: "Suflo temiz · " + (c.name || "ses"), disableOriginal: true
      }, 120000);
      if (!yer.ok) throw new Error(yer.error);
      yerlesti = true;   // dosya artik projede: hata olsa da silinmez
      var sonra = await olcum(ff, ["-i", cikti]);
      durum("Bitti: " + AC.describe(sonra.I, AC.HEDEFLER[o.hedef].I) + " · " + yer.trackName +
        (yer.disabled ? " · orijinal ses kapatıldı (sağ tık → Etkinleştir ile geri açılır)" : ""), "good");
      var a = el("ses-audio");
      if (a) {
        a.src = encodeURI("file:///" + cikti.replace(/\\/g, "/")).replace(/#/g, "%23").replace(/\?/g, "%3F").replace(/'/g, "%27");
        a.hidden = false;
      }
      KApp.toast("Temiz ses " + yer.trackName + " kanalına eklendi" + (yer.newTrack ? " (yeni kanal)" : ""), "good");
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
      if (cikti && !yerlesti) { try { K.fs.unlinkSync(cikti); } catch (e2) {} }
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
