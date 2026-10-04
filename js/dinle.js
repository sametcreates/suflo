/*
 * Suflo — "Dinle" önizleme oynatıcısı (Konuşmadan kes + Otomatik kesim)
 * Kesimler uygulanmış gibi sesi ffmpeg ile tek mp3'e çıkarıp paneldeki
 * <audio>'da çalar; timeline'a dokunmaz. Filtre js/textcut.js'te (testli).
 *   - Her yeni istek ya da kapat() öncekini geçersiz kılar: ffmpeg bitene
 *     kadar klip değiştiyse / analiz yenilendiyse eski ses çalınmaz.
 *   - Uzun kliplerde yalnız ilk MAX_SN saniye dinlenir (hız + komut satırı sınırı).
 *   - o.only: yalnız kesilecek parçalar çalınır; en fazla MAX_SN (300) aralık.
 */
window.KDinle = function (audioId) {
  "use strict";
  var MAX_SN = 300;
  var surum = 0, yol = "";

  function el(id) { return document.getElementById(id); }

  function dosyaUrl(p) {
    return encodeURI("file:///" + String(p || "").replace(/\\/g, "/"))
      .replace(/#/g, "%23").replace(/\?/g, "%3F").replace(/'/g, "%27");
  }

  function birak() {
    var a = el(audioId);
    if (a) {
      try { a.pause(); } catch (e) {}
      // dosya tutamacini birak (Windows'ta acik dosya silinemez)
      try { a.removeAttribute("src"); a.load(); } catch (e2) {}
      a.hidden = true;
    }
    if (yol) { try { K.fs.unlinkSync(yol); } catch (e3) {} yol = ""; }
  }

  function kapat() { surum++; birak(); }

  /*
   * o: { mediaPath, inPoint, dur (kaynak sn), cuts, clip ({clipStart, clipEnd, dur}), gecerli(), only }
   * Doner: { ok, kisaltildi } — ok:false ise istek geçersiz kaldı (sessizce bırakıldı)
   */
  async function cal(o) {
    kapat();
    var benim = surum;
    var ff = await K.findFfmpeg();
    if (!ff) throw new Error("ffmpeg bulunamadı.");
    // only: yalniz kesilecek parcalar calinir. Klip boyunca dagilabilirler: tum klip
    // okunur, ama filtreye en fazla MAX_SN aralik girer (komut satiri siniri)
    var only = !!o.only;
    var cuts = o.cuts || [];
    var sure, kisaltildi;
    if (only) {
      sure = Number(o.dur) || 0;
      kisaltildi = cuts.length > MAX_SN;
      cuts = cuts.slice(0, MAX_SN);
    } else {
      sure = Math.min(Number(o.dur) || 0, MAX_SN);
      kisaltildi = Number(o.dur) > MAX_SN;
    }
    var cikti = K.path.join(K.tmpDir(), "suflo_dinle_" + Date.now() + "_" + benim + ".mp3");   // ayni ms icinde iki istek cakismasin
    var args = ["-y", "-ss", String(o.inPoint), "-t", String(sure), "-i", o.mediaPath, "-vn", "-ac", "1", "-b:a", "96k"];
    var filtre = only
      ? window.SufloTextCut.previewFilter(cuts, o.clip, sure, { only: true })
      : window.SufloTextCut.previewFilter(cuts, o.clip, sure);
    if (only && !filtre) throw new Error("Dinlenecek kesim yok.");
    if (filtre) args.push("-af", filtre);
    args.push(cikti);
    var r = await K.run(ff, args, { timeout: Math.max(120000, sure * 1000) });
    var gecersiz = benim !== surum || (o.gecerli && !o.gecerli());
    if (gecersiz || r.code !== 0 || !K.fs.existsSync(cikti)) {
      try { K.fs.unlinkSync(cikti); } catch (e) {}
      if (gecersiz) return { ok: false };
      throw new Error("Önizleme üretilemedi: " + String(r.stderr || "").split("\n").filter(Boolean).slice(-1)[0]);
    }
    yol = cikti;
    var a = el(audioId);
    a.hidden = false;
    a.src = dosyaUrl(cikti);
    try { await a.play(); } catch (eP) {}
    return { ok: true, kisaltildi: kisaltildi };
  }

  return { cal: cal, kapat: kapat, MAX_SN: MAX_SN };
};
