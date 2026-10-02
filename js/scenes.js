/*
 * Suflo Scenes — sahne algılama
 *
 * ffmpeg'in scene skorundan (select='gt(scene,T)',showinfo) sahne
 * değişimlerini çıkarır. Uzun kayıtları, derlemeleri ve indirilen videoları
 * sahne sahne bölmek ya da marker'lamak için. Saf modül: ffmpeg'i panel
 * çalıştırır, burada yalnız argümanlar, ayrıştırma ve zaman eşlemesi var.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloScenes = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // Hassasiyet: düşük eşik = daha çok sahne. 0.3 civarı genel amaçlı iyi bir başlangıç.
  var ESIKLER = { yuksek: 0.22, orta: 0.32, dusuk: 0.45 };

  function esik(hassasiyet) {
    if (typeof hassasiyet === "number" && isFinite(hassasiyet)) return Math.max(0.05, Math.min(0.9, hassasiyet));
    return ESIKLER[hassasiyet] || ESIKLER.orta;
  }

  /*
   * ffmpeg argümanları. Kare küçültülür (analiz hızlanır, skor değişmez sayılır);
   * ses yok sayılır. Çıktı stderr'deki showinfo satırlarıdır.
   */
  function ffmpegArgs(mediaPath, opts) {
    opts = opts || {};
    var args = ["-hide_banner", "-nostats"];
    if (opts.ss != null) args.push("-ss", String(opts.ss));
    if (opts.t != null) args.push("-t", String(opts.t));
    args.push("-i", mediaPath, "-an", "-sn", "-dn",
      "-vf", "scale=320:-2,select='gt(scene\\," + esik(opts.hassasiyet).toFixed(2) + ")',showinfo",
      "-f", "null", "-");
    return args;
  }

  /*
   * showinfo satırlarından pts_time'ları al. Doner: [{ t, skor }] (girdi saniyesi,
   * -ss'e göre 0 tabanlı). Skor, satırda "scene_score" varsa okunur.
   */
  function parse(stderr) {
    var out = [];
    String(stderr || "").split(/\r?\n/).forEach(function (line) {
      if (line.indexOf("Parsed_showinfo") === -1) return;
      var m = /pts_time:\s*(-?[\d.]+)/.exec(line);
      if (!m) return;
      var t = parseFloat(m[1]);
      if (!isFinite(t) || t < 0) return;
      var s = /scene_score[=:]\s*([\d.]+)/.exec(line);
      out.push({ t: t, skor: s ? parseFloat(s[1]) : null });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /*
   * Çok yakın değişimleri birleştir (flaş, hızlı kurgu titremesi), baştaki ve
   * sondaki çok kısa parçaları at.
   *   opts.minGap  iki sahne arası en az (sn) — varsayılan 1.0
   *   opts.dur     analiz edilen süre (sn): sondan minGap içindekiler atılır
   */
  function clean(list, opts) {
    opts = opts || {};
    var minGap = opts.minGap != null ? Number(opts.minGap) : 1.0;
    var dur = opts.dur != null ? Number(opts.dur) : Infinity;
    var out = [];
    (list || []).forEach(function (s) {
      if (s.t < minGap * 0.5 || s.t > dur - minGap * 0.5) return;
      var son = out[out.length - 1];
      if (son && s.t - son.t < minGap) {
        // yakın iki değişimden skoru yüksek olan kalsın
        if (s.skor != null && son.skor != null && s.skor > son.skor) out[out.length - 1] = s;
        return;
      }
      out.push(s);
    });
    return out;
  }

  /*
   * Girdi zamanını sequence zamanına çevir.
   *   clip: { clipStart, clipEnd, dur } (KS_getSelectedClips biçimi; dur = kaynak süre)
   * Hız değiştirilmiş klipte timeline/kaynak oranıyla ölçeklenir.
   */
  function toSequence(list, clip) {
    var tl = Number(clip.clipEnd) - Number(clip.clipStart);
    var hiz = Number(clip.dur) > 0 && tl > 0 ? tl / Number(clip.dur) : 1;
    return (list || []).map(function (s) {
      return { t: Number(clip.clipStart) + s.t * hiz, skor: s.skor };
    }).filter(function (s) { return s.t > Number(clip.clipStart) && s.t < Number(clip.clipEnd); });
  }

  return { ESIKLER: ESIKLER, esik: esik, ffmpegArgs: ffmpegArgs, parse: parse, clean: clean, toSequence: toSequence };
});
