/*
 * Suflo — Sesi iyileştir: konuşma sesi için ffmpeg filtre zinciri + ölçüm ayrıştırma
 *
 * Uğultu/rüzgâr kesme (highpass), gürültü azaltma (afftdn), hafif sıkıştırma
 * ve hedef yüksekliğe normalize (loudnorm). Premiere'in Enhance Speech'i olmayan
 * sürümlerde de çalışır; sonuç ayrı bir ses klibidir, orijinal korunur.
 * Saf modül: ffmpeg'i panel çalıştırır.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAudioClean = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // Hedef yükseklik (entegre LUFS) ve gerçek tepe
  var HEDEFLER = {
    youtube: { ad: "YouTube / Shorts (−14 LUFS)", I: -14, TP: -1.5 },
    podcast: { ad: "Podcast (−16 LUFS)", I: -16, TP: -1.5 },
    yayin: { ad: "TV / yayın (−23 LUFS)", I: -23, TP: -2 }
  };

  // Temizlik gücü: gürültü tabanı (afftdn nf, dB) ve sıkıştırma oranı
  var GUCLER = {
    hafif: { nf: -20, nr: 8, oran: 2 },
    standart: { nf: -25, nr: 12, oran: 3 },
    guclu: { nf: -30, nr: 20, oran: 4 }
  };

  /*
   * opts: { hedef: "youtube"|"podcast"|"yayin", guc: "hafif"|"standart"|"guclu",
   *         gurultu: bool (varsayılan true), normalize: bool (varsayılan true) }
   * Doner: ffmpeg -af ifadesi
   */
  function filterChain(opts) {
    opts = opts || {};
    var h = HEDEFLER[opts.hedef] || HEDEFLER.youtube;
    var g = GUCLER[opts.guc] || GUCLER.standart;
    var zincir = [
      "highpass=f=80",            // ugultu, rüzgâr, masa titreşimi
      "lowpass=f=14000"           // tıslama
    ];
    if (opts.gurultu !== false) {
      // tn=1: gürültü profilini sesten sürekli takip et (oda tonu değişse de)
      zincir.push("afftdn=nr=" + g.nr + ":nf=" + g.nf + ":tn=1");
    }
    zincir.push("acompressor=threshold=-21dB:ratio=" + g.oran + ":attack=8:release=120:makeup=2");
    if (opts.normalize !== false) {
      zincir.push("loudnorm=I=" + h.I + ":TP=" + h.TP + ":LRA=11");
    }
    // loudnorm içeride 192 kHz'e çıkar: çıktıyı proje hızına geri indir
    zincir.push("aresample=48000");
    return zincir.join(",");
  }

  /*
   * ffmpeg ebur128 özetinden entegre yükseklik (I, LUFS), aralık (LRA) ve
   * gerçek tepe (peak, dBFS; yalnız peak=true ile). Bulunamazsa null alanlar.
   */
  function parseEbur128(stderr) {
    var s = String(stderr || "");
    var ozet = s.lastIndexOf("Summary:");
    var parca = ozet >= 0 ? s.slice(ozet) : s;
    function al(re) { var m = re.exec(parca); return m ? parseFloat(m[1]) : null; }
    var I = al(/I:\s*(-?[\d.]+|-inf)\s*LUFS/);
    var LRA = al(/LRA:\s*(-?[\d.]+)\s*LU/);
    var peak = al(/Peak:\s*(-?[\d.]+)\s*dBFS/);
    return { I: isFinite(I) ? I : null, LRA: isFinite(LRA) ? LRA : null, peak: isFinite(peak) ? peak : null };
  }

  // Ölçüm metni: "−26,3 LUFS (sessiz)" gibi
  function describe(I, hedefI) {
    if (I == null) return "ölçülemedi";
    var fark = (hedefI == null ? -14 : hedefI) - I;
    var t = (I < 0 ? "−" : "") + Math.abs(I).toFixed(1).replace(".", ",") + " LUFS";
    if (I < -50) return t + " (neredeyse sessiz)";
    if (fark > 6) return t + " (kısık)";
    if (fark < -3) return t + " (yüksek)";
    return t + " (iyi)";
  }

  /*
   * Klip uygun mu? Hız değişmiş klipte kaynak saniyesi timeline saniyesiyle
   * eşleşmez; temiz ses kaymış olurdu.
   *   clip: { clipStart, clipEnd, inPoint, outPoint }
   */
  function clipCheck(clip) {
    if (!clip || !clip.mediaPath) return "Önce sesi olan bir klip seç.";
    var tl = Number(clip.clipEnd) - Number(clip.clipStart);
    var src = Number(clip.outPoint) - Number(clip.inPoint);
    if (!(tl > 0.2) || !(src > 0.2)) return "Klip çok kısa.";
    if (Math.abs(tl - src) > Math.max(0.05, tl * 0.002)) return "Hızı değiştirilmiş klipte çalışmaz (hız %100 olmalı).";
    if (tl > 4 * 3600) return "Klip 4 saatten uzun.";
    return "";
  }

  /*
   * Gecikme telafisi. Gürültü azaltıcılar (afftdn ~25 ms, anlmdn ~8 ms; sürüme
   * göre değişir) sesi geciktirir: dudak senkronu kayar. Panel aynı zinciri kısa
   * bir test sinyalinden geçirip measureLag ile ölçer, compensate ile geri alır.
   */
  var PROBE_KAYNAK = "aevalsrc='0.4*sin(2*PI*(200+300*t)*t)*(0.5+0.5*sin(2*PI*3*t))':d=4:s=48000";
  var PROBE_SR = 8000;

  // ref ve out: Float32Array (aynı örnekleme hızı). Doner: out'un ref'e göre gecikmesi (sn)
  function measureLag(ref, out, sr, maxMs) {
    sr = sr || PROBE_SR;
    var maxL = Math.round((maxMs || 300) * sr / 1000);
    var bas = Math.round(sr * 0.5), son = Math.min(ref.length, out.length) - maxL - 1;
    if (son <= bas) return 0;
    var enIyi = -Infinity, enL = 0;
    for (var L = -maxL; L <= maxL; L++) {
      var t = 0;
      for (var i = bas; i < son; i += 2) {
        var j = i + L;
        if (j >= 0 && j < out.length) t += ref[i] * out[j];
      }
      if (t > enIyi) { enIyi = t; enL = L; }
    }
    return enL / sr;
  }

  // Zincire gecikme telafisi ekle (başı kırp, sonu doldur; çıktı -t ile kesilir)
  function compensate(chain, lagSec) {
    var d = Number(lagSec);
    if (!(d > 0.0004) || d > 0.5) return chain;
    return chain + ",atrim=start=" + d.toFixed(5) + ",asetpts=PTS-STARTPTS,apad";
  }

  return { HEDEFLER: HEDEFLER, measureLag: measureLag, compensate: compensate, PROBE_KAYNAK: PROBE_KAYNAK, PROBE_SR: PROBE_SR, GUCLER: GUCLER, filterChain: filterChain, parseEbur128: parseEbur128, describe: describe, clipCheck: clipCheck };
});
