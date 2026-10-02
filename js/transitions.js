/*
 * Suflo Transitions — kesim geçişleri
 *
 * İki klibin birleştiği kesime, iki tarafa eşleşik keyframe'ler yazarak geçiş
 * yapar: giden klip (A) kesimden önce, gelen klip (B) kesimden sonra hareket
 * eder. Eklenti, ayar katmanı ya da MOGRT gerekmez; yalnız Premiere'in kendi
 * Motion (Konum/Ölçek) ve Opaklık özellikleri kullanılır.
 *
 * Plan saf ve görecelidir — host (KS_applyCutTransition) klibin gerçek
 * değerleriyle çarpar:
 *   t      kesime göre saniye (A için negatif, B için pozitif)
 *   scale  klibin kendi ölçeğinin çarpanı (1 = değişmez)
 *   x, y   kadraj genişliği/yüksekliği oranında kayma (0.5 = yarım kadraj)
 *   opacity klibin kendi opaklığının çarpanı
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloTransitions = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var LIST = [
    { id: "zoom-in", name: "Zoom İçeri", desc: "Kesimden içeri dalar", group: "zoom" },
    { id: "zoom-out", name: "Zoom Dışarı", desc: "Geriye çekilerek açılır", group: "zoom" },
    { id: "whip-left", name: "Whip Sola", desc: "Hızlı kaydırma, sola", group: "whip" },
    { id: "whip-right", name: "Whip Sağa", desc: "Hızlı kaydırma, sağa", group: "whip" },
    { id: "whip-up", name: "Whip Yukarı", desc: "Hızlı kaydırma, yukarı", group: "whip" },
    { id: "whip-down", name: "Whip Aşağı", desc: "Hızlı kaydırma, aşağı", group: "whip" },
    { id: "push-left", name: "İtme Sola", desc: "Yeni sahne eskisini iter", group: "push" },
    { id: "push-up", name: "İtme Yukarı", desc: "Dikey itme, Reels ritmi", group: "push" },
    { id: "bounce", name: "Zıplama", desc: "Gelen klip esneyerek oturur", group: "impact" },
    { id: "punch", name: "Punch", desc: "Kesimde kısa vurgu zoomu", group: "impact" },
    { id: "shake", name: "Sarsıntı", desc: "Kesimde kamera sarsıntısı", group: "impact" },
    { id: "dip", name: "Karartma", desc: "Siyaha inip yeniden açılır", group: "fade" },
    { id: "cross", name: "Yumuşak Geçiş", desc: "A kaybolurken B belirir", group: "fade" }
  ];

  function has(id) { return LIST.some(function (t) { return t.id === id; }); }

  function clampNum(v, lo, hi, def) {
    v = Number(v);
    if (!isFinite(v)) return def;
    return Math.max(lo, Math.min(hi, v));
  }

  // Bir özellik için keyframe dizisi: [[t, değer], ...] -> [{t, v}]
  function keys(pairs) {
    return pairs.map(function (p) { return { t: p[0], v: p[1] }; });
  }

  /*
   * Plan üret.
   *   opts.duration  geçişin TOPLAM süresi (sn), kesimin iki yanına yarı yarıya — 0.2..1.6, varsayılan 0.5
   *   opts.strength  0.5..1.8, varsayılan 1
   * Doner: { id, half, out: {scale?, x?, y?, opacity?}, in: {...} } — her özellik keyframe dizisi
   */
  function plan(id, opts) {
    opts = opts || {};
    if (!has(id)) throw new Error("Bilinmeyen geçiş: " + id);
    var d = clampNum(opts.duration, 0.2, 1.6, 0.5);
    var k = clampNum(opts.strength, 0.5, 1.8, 1);
    var h = d / 2;
    var out = {}, inn = {};

    if (id === "zoom-in") {
      out.scale = keys([[-h, 1], [-h * 0.35, 1 + 0.18 * k], [0, 1 + 0.55 * k]]);
      inn.scale = keys([[0, 1 + 0.45 * k], [h * 0.55, 1 + 0.06 * k], [h, 1]]);
    } else if (id === "zoom-out") {
      out.scale = keys([[-h, 1], [0, Math.max(0.45, 1 - 0.32 * k)]]);
      inn.scale = keys([[0, 1 + 0.4 * k], [h * 0.6, 1 - 0.015], [h, 1]]);
    } else if (/^whip-/.test(id)) {
      var dx = id === "whip-left" ? -1 : id === "whip-right" ? 1 : 0;
      var dy = id === "whip-up" ? -1 : id === "whip-down" ? 1 : 0;
      var m = 1.05 * k;
      // A hizlanarak kadrajdan cikar, B ters taraftan hizla girip yavaslar
      if (dx) {
        out.x = keys([[-h, 0], [-h * 0.45, dx * 0.08 * m], [0, dx * m]]);
        inn.x = keys([[0, -dx * m], [h * 0.45, -dx * 0.08 * m], [h, 0]]);
      } else {
        out.y = keys([[-h, 0], [-h * 0.45, dy * 0.08 * m], [0, dy * m]]);
        inn.y = keys([[0, -dy * m], [h * 0.45, -dy * 0.08 * m], [h, 0]]);
      }
    } else if (id === "push-left" || id === "push-up") {
      var ax = id === "push-left" ? "x" : "y";
      out[ax] = keys([[-h, 0], [0, -0.5]]);
      inn[ax] = keys([[0, 0.5], [h, 0]]);   // A'nin son yarisinin aynasi: tek hareket gibi okunur
    } else if (id === "bounce") {
      inn.scale = keys([[0, Math.max(0.5, 1 - 0.22 * k)], [h * 0.45, 1 + 0.07 * k], [h * 0.75, 1 - 0.02 * k], [h, 1]]);
      inn.opacity = keys([[0, 0], [h * 0.3, 1]]);
    } else if (id === "punch") {
      out.scale = keys([[-h, 1], [0, 1 + 0.1 * k]]);
      inn.scale = keys([[0, 1 + 0.16 * k], [h, 1]]);
    } else if (id === "shake") {
      var a = 0.018 * k;
      inn.x = keys([[0, 0], [h * 0.2, -a], [h * 0.4, a * 0.8], [h * 0.6, -a * 0.5], [h * 0.8, a * 0.25], [h, 0]]);
      inn.y = keys([[0, 0], [h * 0.2, a * 0.6], [h * 0.4, -a * 0.5], [h * 0.6, a * 0.3], [h, 0]]);
      inn.scale = keys([[0, 1 + 0.05 * k], [h, 1 + 0.05 * k]]);   // kenar boslugu gorunmesin
    } else if (id === "dip") {
      out.opacity = keys([[-h, 1], [0, 0]]);
      inn.opacity = keys([[0, 0], [h, 1]]);
    } else if (id === "cross") {
      out.opacity = keys([[-h, 1], [0, 0.15]]);
      inn.opacity = keys([[0, 0.15], [h, 1]]);
    }
    return { id: id, half: h, out: out, "in": inn };
  }

  /*
   * Kesim bul: oynatma kafasina en yakin, A'nin bittigi ve B'nin basladigi an.
   *   clips: [{ track, start, end }] (sequence sn) — yalniz video klipler
   *   tol: aranacak en buyuk uzaklik (sn)
   * Doner: { track, cut, a (index), b (index) } ya da null. Ust katman oncelikli.
   */
  function findCut(clips, playhead, tol) {
    tol = tol != null ? tol : 1.0;
    var best = null;
    for (var i = 0; i < clips.length; i++) {
      for (var j = 0; j < clips.length; j++) {
        if (i === j || clips[i].track !== clips[j].track) continue;
        if (Math.abs(clips[i].end - clips[j].start) > 0.02) continue;
        var cut = clips[j].start;
        var dist = Math.abs(cut - playhead);
        if (dist > tol) continue;
        var better = !best || dist < best.dist - 0.001 ||
          (Math.abs(dist - best.dist) <= 0.001 && clips[i].track > best.track);
        if (better) best = { track: clips[i].track, cut: cut, a: i, b: j, dist: dist };
      }
    }
    return best;
  }

  /*
   * Plan klipler icin cok kisa mi? Gecis yarisi A'nin ya da B'nin yarisini asamaz.
   * Doner: uygulanabilir yari sure (sn) ya da 0.
   */
  function fitHalf(half, aDur, bDur) {
    var lim = Math.min(Number(aDur) || 0, Number(bDur) || 0) * 0.5;
    if (lim < 0.08) return 0;
    return Math.min(half, lim);
  }

  function valueAt(ks, t) {
    if (!ks || !ks.length) return 0;
    if (t <= ks[0].t) return ks[0].v;
    for (var i = 1; i < ks.length; i++) {
      if (t <= ks[i].t) {
        var a = ks[i - 1], b = ks[i];
        return a.v + (b.v - a.v) * ((t - a.t) / ((b.t - a.t) || 1));
      }
    }
    return ks[ks.length - 1].v;
  }

  // x ve y ayri zamanlarda olabilir: Premiere Konum'u tek [x,y] ozelligidir, birlestir
  function mergeXY(xs, ys) {
    if (!xs && !ys) return null;
    var times = [];
    (xs || []).concat(ys || []).forEach(function (k) {
      if (!times.some(function (t) { return Math.abs(t - k.t) < 1e-6; })) times.push(k.t);
    });
    times.sort(function (a, b) { return a - b; });
    return times.map(function (t) {
      return { t: t, x: xs ? valueAt(xs, t) : 0, y: ys ? valueAt(ys, t) : 0 };
    });
  }

  /*
   * Host'a gidecek bicim: { half, out: {scale, pos, opacity}, in: {...} }
   * pos = [{t, x, y}] (kadraj orani), scale/opacity = [{t, v}] (carpan)
   */
  function hostPlan(id, opts) {
    var p = plan(id, opts);
    function side(o) {
      var r = {};
      if (o.scale) r.scale = o.scale;
      if (o.opacity) r.opacity = o.opacity;
      var pos = mergeXY(o.x, o.y);
      if (pos) r.pos = pos;
      return r;
    }
    return { id: p.id, half: p.half, out: side(p.out), "in": side(p["in"]) };
  }

  return { list: function () { return LIST.slice(); }, has: has, plan: plan, hostPlan: hostPlan, mergeXY: mergeXY, findCut: findCut, fitHalf: fitHalf };
});
