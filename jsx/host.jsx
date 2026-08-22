/*
 * Kesit — Premiere Pro tarafı (ExtendScript, ES3)
 * Panel evalScript ile bu fonksiyonları çağırır.
 * Tüm girdiler encodeURIComponent'lenmiş JSON, tüm çıktılar JSON string döner.
 */

/* ---------- Mini JSON (ExtendScript'te yerleşik JSON yok) ---------- */
if (typeof KJSON === "undefined") {
  var KJSON = {
    stringify: function (v) {
      var t = typeof v;
      if (v === null || t === "undefined") return "null";
      if (t === "number") return isFinite(v) ? String(v) : "null";
      if (t === "boolean") return String(v);
      if (t === "string") {
        var s = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
                 .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
        return '"' + s + '"';
      }
      if (v instanceof Array) {
        var parts = [];
        for (var i = 0; i < v.length; i++) parts.push(KJSON.stringify(v[i]));
        return "[" + parts.join(",") + "]";
      }
      if (t === "object") {
        var kp = [];
        for (var k in v) {
          if (v.hasOwnProperty && !v.hasOwnProperty(k)) continue;
          kp.push(KJSON.stringify(k) + ":" + KJSON.stringify(v[k]));
        }
        return "{" + kp.join(",") + "}";
      }
      return "null";
    },
    parse: function (text) {
      if (/^[\],:{}\s]*$/.test(
        String(text).replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
          .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]")
          .replace(/(?:^|:|,)(?:\s*\[)+/g, ""))) {
        return eval("(" + text + ")");
      }
      throw new Error("KJSON.parse: gecersiz girdi");
    }
  };
}

function KS_arg(encoded) {
  if (!encoded) return {};
  try { return KJSON.parse(decodeURIComponent(encoded)); } catch (e) { return {}; }
}
function KS_ok(data) { data = data || {}; data.ok = true; return KJSON.stringify(data); }
function KS_err(msg) { return KJSON.stringify({ ok: false, error: String(msg) }); }

var KS_TPS = 254016000000; // Premiere ticks / saniye

/* ---------- Yardımcılar ---------- */

function KS_seq() { return app.project.activeSequence; }

/*
 * NOT — undo gruplama: Premiere ExtendScript'te YOK.
 * After Effects'teki app.beginUndoGroup/endUndoGroup ikilisinin Premiere karsiligi
 * bulunmuyor; Adobe'dan Bruce Bullis forumda dogrudan "No" diyor ve gruplama hala
 * acik bir ozellik talebi (DVAPR-4235114). Adobe bu yetenegi yalnizca UXP'ye verdi
 * (project.executeTransaction). Dolayisiyla cok adimli islemlerimiz (kesim, ease)
 * kullanicida birden fazla Ctrl+Z olarak geri alinir; bunu gizlemeye calisan sahte
 * bir sarmalayici yazmak yerine gercegi burada belgeliyoruz.
 * Kaynak: https://community.adobe.com/questions-729/undo-groups-in-premiere-1422157
 */

function KS_findBin(name) {
  var root = app.project.rootItem;
  for (var i = 0; i < root.children.numItems; i++) {
    var it = root.children[i];
    if (it.type === 2 /* BIN */ && it.name === name) return it;
  }
  return root.createBin(name);
}

function KS_findItemByPath(container, mediaPath) {
  for (var i = 0; i < container.children.numItems; i++) {
    var it = container.children[i];
    if (it.type === 2) {
      var found = KS_findItemByPath(it, mediaPath);
      if (found) return found;
    } else {
      try {
        if (it.getMediaPath && String(it.getMediaPath()).toLowerCase() === mediaPath.toLowerCase()) return it;
      } catch (e) {}
    }
  }
  return null;
}


function KS_firstSelectedClip() {
  var seq = KS_seq();
  if (!seq) return null;
  var sel = seq.getSelection();
  if (!sel || sel.length === 0) return null;
  for (var i = 0; i < sel.length; i++) {
    var cl = sel[i];
    try {
      if (cl.projectItem && cl.projectItem.getMediaPath()) return cl;
    } catch (e) {}
  }
  return null;
}

/* ---------- Bağlam: panelin 2.5 sn'de bir çektiği özet ---------- */

function KS_getContext() {
  try {
    var seq = KS_seq();
    var out = {
      app: String(app.version),
      project: app.project ? String(app.project.name) : "",
      sequence: seq ? String(seq.name) : "",
      hasSeq: !!seq,
      sel: null
    };
    if (seq) {
      // secili klip sayisi (bagli video+ses cifti tek sayilir)
      try {
        var selArr = seq.getSelection();
        var cnt = {}, nUniq = 0;
        if (selArr) {
          for (var si = 0; si < selArr.length; si++) {
            try {
              if (!selArr[si].projectItem) continue;
              var kk = String(selArr[si].projectItem.getMediaPath()).toLowerCase() +
                "@" + selArr[si].start.seconds.toFixed(3);
              if (!cnt[kk]) { cnt[kk] = 1; nUniq++; }
            } catch (eS) {}
          }
        }
        out.selCount = nUniq;
      } catch (eN) { out.selCount = 0; }

      var cl = KS_firstSelectedClip();
      if (cl) {
        out.sel = {
          name: String(cl.name),
          mediaPath: String(cl.projectItem.getMediaPath()),
          clipStart: cl.start.seconds,
          clipEnd: cl.end.seconds,
          inPoint: cl.inPoint.seconds,
          outPoint: cl.outPoint.seconds,
          dur: cl.outPoint.seconds - cl.inPoint.seconds
        };
      }
      try {
        var ip = seq.getInPointAsTime().seconds;
        var op = seq.getOutPointAsTime().seconds;
        out.seqIn = ip;
        out.seqOut = op;
        out.seqDur = seq.end ? Number(seq.end) / KS_TPS : 0;
      } catch (eIO) {}
      // ses katmanlari (altyazi icin katman secimi)
      try {
        out.audioTracks = [];
        for (var ti = 0; ti < seq.audioTracks.numTracks; ti++) {
          var trk = seq.audioTracks[ti];
          var hasClips = false;
          try { hasClips = trk.clips.numItems > 0; } catch (eH) {}
          out.audioTracks.push({
            name: "A" + (ti + 1),
            clips: hasClips
          });
        }
      } catch (eT) {}
    }
    return KS_ok(out);
  } catch (e) { return KS_err(e); }
}

/* ---------- Seçili klipler (toplu işlem) ---------- */

function KS_getSelectedClips() {
  try {
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var sel = seq.getSelection();
    var out = [];
    if (sel) {
      for (var i = 0; i < sel.length; i++) {
        var cl = sel[i];
        try {
          if (!cl.projectItem) continue;
          var mp = String(cl.projectItem.getMediaPath());
          if (!mp) continue;
          out.push({
            name: String(cl.name),
            mediaPath: mp,
            clipStart: cl.start.seconds,
            clipEnd: cl.end.seconds,
            inPoint: cl.inPoint.seconds,
            outPoint: cl.outPoint.seconds,
            dur: cl.outPoint.seconds - cl.inPoint.seconds
          });
        } catch (eC) {}
      }
    }
    // bagli video+ses cifti secimde iki ayri trackItem olarak gelir — tekillestir
    var seen = {}, ded = [];
    for (var j = 0; j < out.length; j++) {
      var key = out[j].mediaPath.toLowerCase() + "@" + out[j].clipStart.toFixed(3);
      if (seen[key]) continue;
      seen[key] = 1;
      ded.push(out[j]);
    }
    ded.sort(function (a, b) { return a.clipStart - b.clipStart; });
    return KS_ok({ clips: ded });
  } catch (e) { return KS_err(e); }
}

/* ---------- Suflo Pro: yerlesik Motion presetleri ---------- */

function KS_presetTime(sec) {
  var t = new Time();
  t.seconds = Math.max(0, Number(sec) || 0);
  return t;
}

function KS_presetComponent(clip, matchName, displayNames) {
  try {
    var list = clip.components;
    if (!list) return null;
    for (var i = 0; i < list.numItems; i++) {
      var item = list[i];
      var match = "";
      var display = "";
      try { match = String(item.matchName || ""); } catch (e0) {}
      try { display = String(item.displayName || "").toLowerCase(); } catch (e1) {}
      if (match === matchName) return item;
      for (var n = 0; n < displayNames.length; n++) {
        if (display === String(displayNames[n]).toLowerCase()) return item;
      }
    }
  } catch (e) {}
  return null;
}

function KS_presetProperty(component, matchNames, displayNames) {
  try {
    if (!component || !component.properties) return null;
    var list = component.properties;
    for (var i = 0; i < list.numItems; i++) {
      var item = list[i];
      var match = "";
      var display = "";
      try { match = String(item.matchName || ""); } catch (e0) {}
      try { display = String(item.displayName || "").toLowerCase(); } catch (e1) {}
      for (var m = 0; m < matchNames.length; m++) if (match === matchNames[m]) return item;
      for (var n = 0; n < displayNames.length; n++) {
        if (display === String(displayNames[n]).toLowerCase()) return item;
      }
    }
  } catch (e) {}
  return null;
}

function KS_presetProps(clip) {
  var motion = KS_presetComponent(clip, "ADBE Motion", ["Motion", "Hareket"]);
  var opacity = KS_presetComponent(clip, "ADBE Opacity", ["Opacity", "Opaklik", "Opakl\u0131k"]);
  return {
    position: KS_presetProperty(motion, ["ADBE Position"], ["Position", "Konum"]),
    scale: KS_presetProperty(motion, ["ADBE Scale"], ["Scale", "Olcek", "\u00d6l\u00e7ek"]),
    opacity: KS_presetProperty(opacity, ["ADBE Opacity"], ["Opacity", "Opaklik", "Opakl\u0131k"])
  };
}

function KS_presetCloneValue(value) {
  if (value && typeof value !== "string" && typeof value.length === "number") {
    var out = [];
    for (var i = 0; i < value.length; i++) out.push(value[i]);
    return out;
  }
  return value;
}

var KS_presetRemovedCount = 0;

function KS_presetKeys(prop, keys, clearStart, clearEnd) {
  if (!prop || !keys || !keys.length) return false;
  try {
    try {
      if (prop.areKeyframesSupported && !prop.areKeyframesSupported()) return false;
    } catch (eSupport) {}
    prop.setTimeVarying(true);
    var clearA = clearStart === undefined ? Number(keys[0].time) : Number(clearStart);
    var clearB = clearEnd === undefined ? Number(keys[keys.length - 1].time) : Number(clearEnd);
    var first = KS_presetTime(Math.min(clearA, clearB));
    var last = KS_presetTime(Math.max(clearA, clearB));
    var removedIndividually = false;
    try {
      // removeKeyRange bazı Premiere sürümlerinde hata vermeden hiçbir şey
      // yapmıyor. Var olan anahtarları tek tek silmek daha güvenilir.
      var existing = prop.getKeys ? prop.getKeys() : null;
      if (existing && typeof existing.length === "number") {
        for (var oldKey = existing.length - 1; oldKey >= 0; oldKey--) {
          var oldSec = Number(existing[oldKey] && existing[oldKey].seconds !== undefined ? existing[oldKey].seconds : existing[oldKey]);
          if (oldSec >= first.seconds - 0.002 && oldSec <= last.seconds + 0.002) {
            try {
              prop.removeKey(existing[oldKey]);
              KS_presetRemovedCount++;
              removedIndividually = true;
            } catch (eRemove) {}
          }
        }
      }
    } catch (e0) {}
    try {
      if (!removedIndividually && prop.removeKeyRange) prop.removeKeyRange(first, last);
    } catch (eRange) {}
    for (var i = 0; i < keys.length; i++) {
      var t = KS_presetTime(keys[i].time);
      try { prop.addKey(t); } catch (e1) {}
      prop.setValueAtKey(t, KS_presetCloneValue(keys[i].value), true);
      // 5, Premiere'in Bezier/ease turudur. Eski surum kabul etmezse
      // anahtarlar lineer kalir; preset yine calisir.
      try { if (prop.setInterpolationTypeAtKey) prop.setInterpolationTypeAtKey(t, 5, true); } catch (e2) {}
    }
    // Premiere bazen çağrıyı hata vermeden kabul edip anahtar yazmayabiliyor.
    // Kullanıcıya "uygulandı" demeden önce ilk ve son anahtarın gerçekten
    // parametre akışında bulunduğunu doğrula.
    try {
      var written = prop.getKeys ? prop.getKeys() : null;
      if (!written || typeof written.length !== "number") return false;
      var firstFound = false;
      var lastFound = false;
      var firstSec = Number(keys[0].time);
      var lastSec = Number(keys[keys.length - 1].time);
      for (var k = 0; k < written.length; k++) {
        var sec = Number(written[k] && written[k].seconds !== undefined ? written[k].seconds : written[k]);
        if (Math.abs(sec - firstSec) < 0.002) firstFound = true;
        if (Math.abs(sec - lastSec) < 0.002) lastFound = true;
      }
      return firstFound && lastFound;
    } catch (eVerify) { return false; }
  } catch (e) { return false; }
}

// ComponentParam anahtar zamanları sequence zamanını değil, klibin kaynak
// in/out zamanını kullanır. Timeline saniyesini kaynak saniyesine çevirmezsek
// Premiere çağrıyı kabul eder ama anahtarlar görünür klip aralığının dışında kalır.
function KS_presetSourceTime(clip, timelineSec, timelineStart, timelineEnd) {
  var duration = Math.max(0.000001, timelineEnd - timelineStart);
  var ratio = (Number(timelineSec) - timelineStart) / duration;
  ratio = Math.max(0, Math.min(1, ratio));
  var sourceIn = 0;
  var sourceOut = duration;
  try { sourceIn = Number(clip.inPoint.seconds); } catch (eIn) {}
  try { sourceOut = Number(clip.outPoint.seconds); } catch (eOut) {}
  if (!isFinite(sourceIn)) sourceIn = 0;
  if (!isFinite(sourceOut) || Math.abs(sourceOut - sourceIn) < 0.000001) sourceOut = sourceIn + duration;
  var reversed = false;
  try { if (clip.isSpeedReversed) reversed = !!clip.isSpeedReversed(); } catch (eReverse) {}
  return reversed ? sourceOut - (sourceOut - sourceIn) * ratio : sourceIn + (sourceOut - sourceIn) * ratio;
}

function KS_presetClipKeys(clip, timelineStart, timelineEnd, prop, keys, clearTimelineStart, clearTimelineEnd) {
  var mapped = [];
  for (var i = 0; i < keys.length; i++) {
    mapped.push({
      time: KS_presetSourceTime(clip, keys[i].time, timelineStart, timelineEnd),
      value: keys[i].value
    });
  }
  var clearStart = clearTimelineStart === undefined ? undefined : KS_presetSourceTime(clip, clearTimelineStart, timelineStart, timelineEnd);
  var clearEnd = clearTimelineEnd === undefined ? undefined : KS_presetSourceTime(clip, clearTimelineEnd, timelineStart, timelineEnd);
  return KS_presetKeys(prop, mapped, clearStart, clearEnd);
}

function KS_presetPositionValue(prop) {
  try {
    var v = prop.getValue();
    if (v && typeof v.length === "number" && v.length >= 2) return [Number(v[0]), Number(v[1])];
  } catch (e) {}
  return null;
}

function KS_presetNumberValue(prop, fallback) {
  try {
    var v = Number(prop.getValue());
    if (isFinite(v)) return v;
  } catch (e) {}
  return fallback;
}

function KS_applyMotionPreset(encoded) {
  try {
    KS_presetRemovedCount = 0;
    var p = KS_arg(encoded);
    var id = String(p.id || "");
    var allowed = {
      "simple-zoom-in": 1, "simple-zoom-out": 1, "pop-in": 1,
      "slide-in-left": 1, "slide-in-right": 1, "slide-in-up": 1, "slide-in-down": 1,
      "fade-in": 1, "fade-out": 1, "punch": 1, "micro-shake": 1, "slide-out-right": 1
    };
    if (!allowed[id]) return KS_err("Bilinmeyen Suflo preseti.");
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var selected = seq.getSelection();
    if (!selected || !selected.length) return KS_err("Timeline'da en az bir video klibi sec.");
    var duration = Number(p.duration);
    if (!isFinite(duration) || duration < 0.18 || duration > 1.5) duration = 0.45;
    var strength = Number(p.strength);
    if (!isFinite(strength) || strength < 0.5 || strength > 1.8) strength = 1;
    var playhead = 0;
    try { playhead = seq.getPlayerPosition().seconds; } catch (eP) {}
    var frameW = Number(seq.frameSizeHorizontal) || 1920;
    var frameH = Number(seq.frameSizeVertical) || 1080;
    var applied = 0;
    var skipped = 0;

    for (var i = 0; i < selected.length; i++) {
      var clip = selected[i];
      var props = KS_presetProps(clip);
      if (!props.position && !props.scale && !props.opacity) { skipped++; continue; }
      var start = Number(clip.start.seconds) || 0;
      var end = Number(clip.end.seconds) || start;
      var clipDur = Math.max(0, end - start);
      if (clipDur < 0.08) { skipped++; continue; }
      var d = Math.min(duration, Math.max(0.08, clipDur * 0.46));
      var clearD = Math.min(1.5, Math.max(0.08, clipDur * 0.46));
      var pos = KS_presetPositionValue(props.position);
      var scale = KS_presetNumberValue(props.scale, 100);
      var opacity = KS_presetNumberValue(props.opacity, 100);
      var normalized = pos && Math.abs(pos[0]) <= 2.5 && Math.abs(pos[1]) <= 2.5;
      var dx = (normalized ? 0.18 : frameW * 0.18) * strength;
      var dy = (normalized ? 0.18 : frameH * 0.18) * strength;
      var changed = false;
      var t0 = start;
      var t1 = start + d * 0.78;
      var t2 = start + d;

      if (id === "simple-zoom-in" && props.scale) {
        changed = KS_presetClipKeys(clip, start, end, props.scale, [{ time: t0, value: scale * (1 + .12 * strength) }, { time: t1, value: scale * .985 }, { time: t2, value: scale }], start, start + clearD) || changed;
      } else if (id === "simple-zoom-out" && props.scale) {
        changed = KS_presetClipKeys(clip, start, end, props.scale, [{ time: t0, value: scale * Math.max(.55, 1 - .14 * strength) }, { time: t1, value: scale * 1.015 }, { time: t2, value: scale }], start, start + clearD) || changed;
      } else if (id === "pop-in") {
        if (props.scale) changed = KS_presetClipKeys(clip, start, end, props.scale, [{ time: t0, value: scale * Math.max(.45, 1 - .28 * strength) }, { time: t1, value: scale * (1 + .08 * strength) }, { time: t2, value: scale }], start, start + clearD) || changed;
        if (props.opacity) changed = KS_presetClipKeys(clip, start, end, props.opacity, [{ time: t0, value: 0 }, { time: start + d * .52, value: opacity }], start, start + clearD) || changed;
      } else if (id.indexOf("slide-in-") === 0 && pos) {
        var from = [pos[0], pos[1]];
        if (id === "slide-in-left") from[0] -= dx;
        if (id === "slide-in-right") from[0] += dx;
        if (id === "slide-in-up") from[1] -= dy;
        if (id === "slide-in-down") from[1] += dy;
        var over = [pos[0] + (pos[0] - from[0]) * .035, pos[1] + (pos[1] - from[1]) * .035];
        changed = KS_presetClipKeys(clip, start, end, props.position, [{ time: t0, value: from }, { time: t1, value: over }, { time: t2, value: pos }], start, start + clearD) || changed;
        if (props.opacity) changed = KS_presetClipKeys(clip, start, end, props.opacity, [{ time: t0, value: 0 }, { time: start + d * .62, value: opacity }], start, start + clearD) || changed;
      } else if (id === "fade-in" && props.opacity) {
        changed = KS_presetClipKeys(clip, start, end, props.opacity, [{ time: t0, value: 0 }, { time: t2, value: opacity }], start, start + clearD) || changed;
      } else if (id === "fade-out" && props.opacity) {
        t0 = end - d; t2 = end;
        changed = KS_presetClipKeys(clip, start, end, props.opacity, [{ time: t0, value: opacity }, { time: t2, value: 0 }], end - clearD, end) || changed;
      } else if (id === "slide-out-right" && pos) {
        t0 = end - d; t1 = t0 + d * .22; t2 = end;
        changed = KS_presetClipKeys(clip, start, end, props.position, [{ time: t0, value: pos }, { time: t1, value: [pos[0] - dx * .035, pos[1]] }, { time: t2, value: [pos[0] + dx, pos[1]] }], end - clearD, end) || changed;
        if (props.opacity) changed = KS_presetClipKeys(clip, start, end, props.opacity, [{ time: t0 + d * .35, value: opacity }, { time: t2, value: 0 }], end - clearD, end) || changed;
      } else if (id === "punch" && props.scale) {
        var center = playhead > start + d && playhead < end - d ? playhead : start + clipDur * .5;
        var half = Math.min(d * .5, Math.max(.08, Math.min(center - start, end - center)));
        var clearHalf = Math.min(clearD * .5, Math.max(.08, Math.min(center - start, end - center)));
        changed = KS_presetClipKeys(clip, start, end, props.scale, [{ time: center - half, value: scale }, { time: center, value: scale * (1 + .12 * strength) }, { time: center + half, value: scale }], center - clearHalf, center + clearHalf) || changed;
      } else if (id === "micro-shake" && pos) {
        var c = playhead > start + d && playhead < end - d ? playhead : start + clipDur * .5;
        var span = Math.min(d, Math.max(.16, clipDur * .25));
        var clearSpan = Math.min(clearD, Math.max(.16, clipDur * .25));
        changed = KS_presetClipKeys(clip, start, end, props.position, [
          { time: c - span * .5, value: pos },
          { time: c - span * .25, value: [pos[0] - dx * .055, pos[1] + dy * .025] },
          { time: c, value: [pos[0] + dx * .045, pos[1] - dy * .03] },
          { time: c + span * .25, value: [pos[0] - dx * .025, pos[1] + dy * .018] },
          { time: c + span * .5, value: pos }
        ], c - clearSpan * .5, c + clearSpan * .5) || changed;
      }
      if (changed) applied++; else skipped++;
    }
    if (!applied) return KS_err("Secili klipte uygulanabilir Motion/Opacity ozelligi bulunamadi.");
    return KS_ok({ applied: applied, skipped: skipped, preset: id, removedKeys: KS_presetRemovedCount });
  } catch (e) { return KS_err(e); }
}

/* ---------- Suflo Pro: Otomatik Zoom ---------- */

function KS_autoZoom(encoded) {
  /*
   * Panelden hazir plan alir: { keys:[{time,value}], clearStart, clearEnd }.
   * time = timeline saniyesi, value = CARPAN (1.0 = klibin kendi olcegi).
   * Secili kliplerin Motion > Scale ozelligine, kaynak-zaman eslemesiyle
   * (KS_presetClipKeys) anahtar kare yazar; onceki zoom anahtarlarini
   * clear araligiyla temizler — yeniden uygulamak guvenlidir.
   */
  try {
    KS_presetRemovedCount = 0;
    var p = KS_arg(encoded);
    var keys = p && p.keys;
    if (!keys || !keys.length) return KS_err("Zoom plani bos.");
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var selected = seq.getSelection();
    if (!selected || !selected.length) return KS_err("Timeline'da bir video klibi sec.");
    // sabit nokta (0..1, [0.5,0.5]=merkez): merkez disiysa zoom'la senkron
    // pozisyon kaymasi yazilir; secilen nokta kadrajda sabit kalir.
    var ax = 0.5, ay = 0.5;
    if (p.anchor && p.anchor.length >= 2) {
      ax = Number(p.anchor[0]); ay = Number(p.anchor[1]);
      if (!isFinite(ax)) ax = 0.5; if (!isFinite(ay)) ay = 0.5;
      ax = Math.max(0.1, Math.min(0.9, ax)); ay = Math.max(0.1, Math.min(0.9, ay));
    }
    var merkezde = Math.abs(ax - 0.5) < 0.01 && Math.abs(ay - 0.5) < 0.01;
    var frameW = Number(seq.frameSizeHorizontal) || 1920;
    var frameH = Number(seq.frameSizeVertical) || 1080;
    var applied = 0, skipped = 0;
    for (var i = 0; i < selected.length; i++) {
      var clip = selected[i];
      var props = KS_presetProps(clip);
      if (!props.scale) { skipped++; continue; }
      var start = Number(clip.start.seconds) || 0;
      var end = Number(clip.end.seconds) || start;
      if (end - start < 0.2) { skipped++; continue; }
      var base = KS_presetNumberValue(props.scale, 100);
      var pos0 = KS_presetPositionValue(props.position);
      var normalized = pos0 && Math.abs(pos0[0]) <= 2.5 && Math.abs(pos0[1]) <= 2.5;
      var sx = (ax - 0.5) * (normalized ? 1 : frameW);
      var sy = (ay - 0.5) * (normalized ? 1 : frameH);
      var mapped = [];
      var posKeys = [];
      for (var k = 0; k < keys.length; k++) {
        var t = Number(keys[k].time);
        var v = Number(keys[k].value);
        if (!isFinite(t) || !isFinite(v) || v <= 0) continue;
        if (t < start) t = start;
        if (t > end) t = end;
        mapped.push({ time: t, value: base * v });
        if (!merkezde && pos0) {
          posKeys.push({ time: t, value: [pos0[0] - sx * (v - 1), pos0[1] - sy * (v - 1)] });
        }
      }
      if (!mapped.length) { skipped++; continue; }
      var cs = p.clearStart === undefined ? start : Math.max(start, Number(p.clearStart));
      var ce = p.clearEnd === undefined ? end : Math.min(end, Number(p.clearEnd));
      var ok = KS_presetClipKeys(clip, start, end, props.scale, mapped, cs, ce);
      if (!merkezde && posKeys.length && props.position) {
        KS_presetClipKeys(clip, start, end, props.position, posKeys, cs, ce);
      } else if (props.position && pos0) {
        // merkez / anchor kapali: onceki zoom'dan kalan pozisyon kaymalarini geri al
        KS_presetClipKeys(clip, start, end, props.position, [{ time: start, value: pos0 }, { time: end, value: pos0 }], cs, ce);
      }
      if (ok) applied++; else skipped++;
    }
    if (!applied) return KS_err("Secili klipte Motion > Scale ozelligi bulunamadi.");
    return KS_ok({ applied: applied, skipped: skipped, keyCount: keys.length, removedKeys: KS_presetRemovedCount });
  } catch (e) { return KS_err(e); }
}

/* ---------- Playhead ---------- */

function KS_setPlayerPosition(encoded) {
  try {
    var p = KS_arg(encoded); // { sec }
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var t = new Time();
    t.seconds = Number(p.sec) || 0;
    seq.setPlayerPosition(t.ticks);
    return KS_ok({});
  } catch (e) { return KS_err(e); }
}

/*
 * Kaydedilmiş projenin klasörü. Altyazı SRT'si buraya yazılır: Premiere içe aktarılan
 * dosyayı kopyalamaz, yola referans verir — proje yanında duran dosya asla süpürülmez.
 * Proje kaydedilmemişse path boştur; panel kendi kalıcı klasörüne düşer.
 */
function KS_projectDir() {
  try {
    var p = app.project ? String(app.project.path || "") : "";
    if (!p) return KS_ok({ dir: "" });
    var f = new File(p);
    var d = f.parent;
    if (!d || !d.exists) return KS_ok({ dir: "" });
    // Folder.fsName URI kodlamasi icermez (Folder.name icerir — orada decodeURIComponent sart)
    return KS_ok({ dir: String(d.fsName) });
  } catch (e) { return KS_ok({ dir: "" }); }
}

/* ---------- SFX ---------- */


/* ---------- Kesim ---------- */



/* ---------- Motion ---------- */



/* ---------- Altyazı: sequence sesini dışa aktar ---------- */

// Premiere kurulumundaki sistem WAV export presetini (.epr) bul
function KS_findWavEpr() {
  // macOS'ta Adobe uygulamalari /Applications altinda; C:/ taramasi orada hicbir sey bulmaz
  var roots = ($.os.indexOf("Windows") !== -1)
    ? ["C:/Program Files/Adobe", "C:/Program Files (x86)/Adobe"]
    : ["/Applications", "/Applications/Adobe"];
  var best = null, fallback = null;
  for (var r = 0; r < roots.length; r++) {
    var root = new Folder(roots[r]);
    if (!root.exists) continue;
    var apps = root.getFiles(function (f) {
      // Folder.name URI-kodludur ("Adobe%20Premiere%20Pro%202026") — cozerek esle
      return f instanceof Folder && /premiere pro/i.test(String(f.displayName || decodeURIComponent(f.name)));
    });
    for (var a = 0; a < apps.length; a++) {
      // macOS'ta presetler .app paketinin icinde: .../X.app/Contents/... altina in
      var taban = apps[a].fsName;
      if ($.os.indexOf("Windows") === -1) {
        var bundles = apps[a].getFiles(function (f) {
          return f instanceof Folder && /\.app$/i.test(String(decodeURIComponent(f.name)));
        });
        if (bundles.length) taban = bundles[0].fsName + "/Contents";
      }
      // 1) Settings/EncoderPresets (Wave48mono16.epr vb.)
      var encP = new Folder(taban + "/Settings/EncoderPresets");
      if (encP.exists) {
        var encs = encP.getFiles("*.epr");
        for (var ei = 0; ei < encs.length; ei++) {
          var enm = String(decodeURIComponent(encs[ei].name));
          if (/16khz/i.test(enm)) { best = encs[ei].fsName; }
          else if (!best && /wav|wave/i.test(enm)) { fallback = fallback || encs[ei].fsName; }
        }
      }
      // 2) MediaIO/systempresets (Waveform Audio ... .epr)
      var sysP = new Folder(apps[a].fsName + "/MediaIO/systempresets");
      if (!sysP.exists) continue;
      var groups = sysP.getFiles(function (f) { return f instanceof Folder; });
      for (var g = 0; g < groups.length; g++) {
        var eprs = groups[g].getFiles("*.epr");
        for (var e = 0; e < eprs.length; e++) {
          var nm = String(decodeURIComponent(eprs[e].name));
          if (/wav|waveform/i.test(nm)) {
            if (!best || /48/.test(nm)) best = best || eprs[e].fsName;
          }
          // klasor adi WAV fourCC'sini iceriyorsa (WAVE = 57415645) yedek olarak tut
          if (!fallback && /5757_4156|57415645/i.test(groups[g].name)) fallback = eprs[e].fsName;
        }
      }
    }
  }
  return best || fallback;
}

function KS_exportAudio(encoded) {
  try {
    var p = KS_arg(encoded); // { scope: "entire"|"inout", epr: "panel preseti", tracks: [0,2,...] opsiyonel }
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");

    // once panelle gelen gomulu presetler (sirayla dene), olmazsa sistem taramasi
    var eprList = [];
    var pe = p.epr instanceof Array ? p.epr : (p.epr ? [p.epr] : []);
    for (var pi = 0; pi < pe.length; pi++) {
      if (pe[pi] && (new File(pe[pi])).exists) eprList.push(pe[pi]);
    }
    var sysEpr = KS_findWavEpr();
    if (sysEpr) eprList.push(sysEpr);
    if (eprList.length === 0) return KS_err("WAV export preseti bulunamadi. 'Secili klip' kapsamini kullan.");

    // katman secimi: secilmeyenleri gecici sustur, export sonrasi geri al
    var savedMute = null;
    var i, tr;
    if (p.tracks && p.tracks.length > 0 && p.tracks.length < seq.audioTracks.numTracks) {
      var want = {};
      for (i = 0; i < p.tracks.length; i++) want[p.tracks[i]] = 1;
      savedMute = [];
      for (i = 0; i < seq.audioTracks.numTracks; i++) {
        tr = seq.audioTracks[i];
        var was = false;
        try { was = tr.isMuted(); } catch (eM) {}
        savedMute.push(was);
        if (!want[i] && !was) { try { tr.setMute(1); } catch (eS) {} }
      }
    }
    function restoreMute() {
      if (!savedMute) return;
      for (var ri = 0; ri < savedMute.length; ri++) {
        try { seq.audioTracks[ri].setMute(savedMute[ri] ? 1 : 0); } catch (eR) {}
      }
    }

    // Adobe exporter karisik ayracli yollari reddeder (Windows'ta Error code 10) —
    // yol bastan sona platformun ayraci olmali ve klasor onceden var olmali
    var res = "", done = false, out, AY;
    try {
      AY = ($.os.indexOf("Windows") !== -1) ? "\\" : "/";
      var tdir = new Folder(Folder.temp.fsName + AY + "Suflo");
      if (!tdir.exists) tdir.create();
      out = tdir.fsName + AY + "seq_" + (new Date().getTime()) + ".wav";
      var wa = (p.scope === "inout") ? 1 : 0; // 1 = in-out, 0 = tum sequence

      for (var ei2 = 0; ei2 < eprList.length && !done; ei2++) {
        try {
          res = seq.exportAsMediaDirect(out, eprList[ei2], wa);
        } catch (eX) {
          res = String(eX);
        }
        done = (new File(out)).exists;
      }
    } finally {
      // ne olursa olsun katmanlar eski haline donmeli: kullanicinin miksini bozamayiz
      restoreMute();
    }

    if (!done) {
      return KS_err("Ses disari alinamadi" + (res ? ": " + res : ".") + " 'Secili klip' kapsamini dene.");
    }
    var offset = 0;
    if (p.scope === "inout") {
      try { offset = seq.getInPointAsTime().seconds; } catch (eI) {}
    }
    return KS_ok({ wav: out, offset: offset });
  } catch (e) { return KS_err(e); }
}

/* ---------- Altyazı: SRT içe aktar ---------- */

function KS_importSrtAsCaptions(encoded) {
  try {
    var p = KS_arg(encoded); // { srtPath }
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");

    var bin = KS_findBin("Kesit Altyazi");
    app.project.importFiles([p.srtPath], true, bin, false);
    var item = KS_findItemByPath(app.project.rootItem, p.srtPath);
    if (!item) {
      var base = p.srtPath.replace(/^.*[\\\/]/, "");
      for (var i = 0; i < bin.children.numItems; i++) {
        if (String(bin.children[i].name).toLowerCase() === base.toLowerCase()) { item = bin.children[i]; break; }
      }
    }
    if (!item) return KS_err("SRT projeye aktarilamadi.");

    // createCaptionTrack basarisizligi exception DEGIL false donusuyle bildirir
    /*
     * createCaptionTrack basarisizligi exception DEGIL donus degeriyle bildiriyor, ama
     * hangi degerle bildirdigi belgesiz. Panel bu sinyale bakip taslagi SILDIGI icin
     * yanlis "basarili" bir saatlik isi yok edebilir: yalnizca KESIN pozitif kabul edilir
     * (undefined/null "bilmiyorum" demektir, basari degil).
     */
    function tryCap(fmt) {
      try {
        var r = (fmt === undefined)
          ? seq.createCaptionTrack(item, 0)
          : seq.createCaptionTrack(item, 0, fmt);
        if (r === false) return "hayir";
        if (r === undefined || r === null) return "belirsiz"; // track OLUSMUS olabilir!
        return "evet";
      } catch (eC) { return "hayir"; }
    }
    /*
     * Ikinci deneme YALNIZ kesin basarisizlikta yapilir: "belirsiz" donuste
     * tekrar denemek ayni SRT'den IKINCI bir altyazi track'i olusturabiliyor.
     * Belirsizlikte captionTrack:false doner; panel taslagi korur (mevcut
     * katilik), kullanici track'i timeline'da gorurse zaten dokunmaz.
     */
    var d1 = tryCap(); // varsayilan format zaten Subtitle
    if (d1 === "hayir" && typeof Sequence !== "undefined" && Sequence.CAPTION_FORMAT_SUBTITLE !== undefined) {
      d1 = tryCap(Sequence.CAPTION_FORMAT_SUBTITLE);
    }
    return KS_ok({ imported: true, captionTrack: d1 === "evet" });
  } catch (e) { return KS_err(e); }
}

/* ---------- Onizleme icin timeline'dan kare al ---------- */

/*
 * Panelin onizlemesinde kullanicinin KENDI goruntusunu gostermek icin
 * playhead'deki kareyi PNG olarak disari alir. Boylece altyazinin gercek
 * sahne uzerinde nasil duracagi gorulur — duz bir zemin bunu gosteremez.
 *
 * exportFramePNG belgelenmis degil ve her surumde bulunmayabilir; yoksa
 * ok:false doner ve panel duz zemine duser (ozellik kaybolmaz).
 */
function KS_grabFrame(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    if (!p.path) return KS_err("Hedef yol verilmedi.");

    var t = null;
    try { t = seq.getPlayerPosition(); } catch (eP) {}
    if (!t) return KS_err("Playhead konumu okunamadi.");

    var yazildi = false;
    // Surumlere gore iki imza dolasimda: (time, path) ve (path)
    try {
      if (seq.exportFramePNG) {
        try { seq.exportFramePNG(t.ticks, p.path); } catch (e1) { seq.exportFramePNG(p.path); }
        yazildi = (new File(p.path)).exists;
      }
    } catch (e2) {}

    if (!yazildi) return KS_err("Bu Premiere surumunde kare disari alinamiyor.");
    return KS_ok({ path: p.path, at: t.seconds });
  } catch (e) { return KS_err(e); }
}

/* ---------- Altyazi overlay: video katmanina yerlestir ---------- */

var KS_OVERLAY_BIN   = "Suflo Altyazi";
var KS_OVERLAY_LABEL = 11; // Magenta

function KS_fps(seq) {
  var tb = Number(seq.timebase);
  return (tb > 0) ? (KS_TPS / tb) : 0;
}

function KS_overlaySpec() {
  try {
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var st = null;
    try { st = seq.getSettings(); } catch (eS) {}
    var inS = 0, outS = 0;
    try { inS = seq.getInPointAsTime().seconds; outS = seq.getOutPointAsTime().seconds; } catch (eIO) {}
    return KS_ok({
      fps:      KS_fps(seq),
      timebase: String(seq.timebase),
      width:    st ? Number(st.videoFrameWidth)  : 0,
      height:   st ? Number(st.videoFrameHeight) : 0,
      zeroPoint: Number(seq.zeroPoint) / KS_TPS,
      end:       Number(seq.end) / KS_TPS,
      inPoint: inS,
      outPoint: outS,
      vTracks: seq.videoTracks.numTracks
    });
  } catch (e) { return KS_err(e); }
}

function KS_trackFreeIn(track, aSec, bSec) {
  try {
    // kilitli track'e overwriteClip yazamaz: "bos" degil "dolu" say
    if (track.isLocked && track.isLocked()) return false;
    var n = track.clips.numItems;
    if (n === 0) return true;
    for (var i = 0; i < n; i++) {
      var c = track.clips[i];
      if (c.end.seconds > aSec + 1e-4 && c.start.seconds < bSec - 1e-4) return false;
    }
    return true;
  } catch (e) { return false; }
}

function KS_findFreeVideoTrack(seq, aSec, bSec) {
  for (var i = seq.videoTracks.numTracks - 1; i >= 0; i--) {
    if (KS_trackFreeIn(seq.videoTracks[i], aSec, bSec)) {
      var top = i;
      while (top + 1 < seq.videoTracks.numTracks &&
             KS_trackFreeIn(seq.videoTracks[top + 1], aSec, bSec)) top++;
      return top;
    }
  }
  return -1;
}

function KS_addTopVideoTrack() {
  var seq0 = app.project.activeSequence;
  var before = seq0.videoTracks.numTracks;
  try {
    app.enableQE();
    if (typeof qe === "undefined" || !qe.project) return false;
    var q = qe.project.getActiveSequence();
    if (!q || !q.addTracks) return false;
    q.addTracks(1, before, 0, 1, 0, 0, 0);
  } catch (e) { return false; }
  return app.project.activeSequence.videoTracks.numTracks > before;
}

function KS_clipAt(track, sec) {
  try {
    for (var i = 0; i < track.clips.numItems; i++) {
      if (Math.abs(track.clips[i].start.seconds - sec) < 1e-3) return track.clips[i];
    }
  } catch (e) {}
  return null;
}

function KS_tryPlace(track, item, startSec) {
  var t = new Time();
  t.seconds = startSec;
  var forms = [t.ticks, startSec];
  for (var k = 0; k < forms.length; k++) {
    var n0 = track.clips.numItems;
    /*
     * Temizlik icin konum imzasi: ayni medyadan track'te ONCEDEN konmus klip
     * varsa nodeId eslesmesi kullanicinin ESKI klibini silebiliyordu. Yeni
     * geleni, yerlestirme oncesinde OLMAYAN start konumundan taniriz.
     */
    var once = {};
    for (var q = 0; q < n0; q++) {
      try { once[String(track.clips[q].start.ticks)] = 1; } catch (eQ) {}
    }
    try { track.overwriteClip(item, forms[k]); } catch (e) { continue; }
    var good = KS_clipAt(track, startSec);
    if (good) return good;
    if (track.clips.numItems > n0) {
      for (var j = track.clips.numItems - 1; j >= 0; j--) {
        try {
          if (!once[String(track.clips[j].start.ticks)]) {
            track.clips[j].remove(0, 0);
            break;
          }
        } catch (eJ) {}
      }
    }
  }
  return null;
}

function KS_placeOverlay(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    if (!p.path || !(new File(p.path)).exists) return KS_err("Overlay dosyasi yok: " + p.path);

    var v = String(app.version).split(".");
    if (Number(v[0]) === 24 && Number(v[1]) === 2) {
      return KS_err("Premiere 24.2/24.2.1'de overwriteClip kurguyu kaydiriyor (24.3'te duzeldi).");
    }

    var bin = KS_findBin(KS_OVERLAY_BIN);
    app.project.importFiles([p.path], true, bin, false);

    var item = null;
    try {
      var hits = app.project.rootItem.findItemsMatchingMediaPath(p.path, 1);
      if (hits && hits.length) item = hits[0];
    } catch (eF) {}
    if (!item) item = KS_findItemByPath(app.project.rootItem, p.path);
    if (!item) return KS_err("Overlay projeye aktarilamadi.");

    var etiket = String(p.name || "Suflo Altyazi");
    try { item.name = etiket; } catch (eN) {}
    try { item.setColorLabel(KS_OVERLAY_LABEL); } catch (eL) {}

    var startSec = 0;
    if (p.scope === "inout") {
      try { startSec = seq.getInPointAsTime().seconds; } catch (eI) {}
    }
    // not: zeroPoint EKLENMEZ — trackItem.start zaten zeroPoint'ten bagimsiz
    // sekans-ici saniye sayar; eklemek baslangic timecode'u 00:00:00:00
    // olmayan sekanslarda altyazi katmanini komple kaydiriyordu.
    var durSec = 0;
    try { durSec = item.getOutPoint().seconds - item.getInPoint().seconds; } catch (eD) {}
    if (!(durSec > 0)) durSec = 1 / 30;

    var idx = KS_findFreeVideoTrack(seq, startSec, startSec + durSec);
    var yeni = false;
    if (idx < 0) {
      if (KS_addTopVideoTrack()) {
        seq = app.project.activeSequence;
        idx = KS_findFreeVideoTrack(seq, startSec, startSec + durSec);
        yeni = idx >= 0;
      }
    }
    if (idx < 0) return KS_err("Bos video katmani yok ve yeni katman acilamadi.");

    var clip = KS_tryPlace(seq.videoTracks[idx], item, startSec);
    if (!clip) return KS_err("Klip katmana yerlestirilemedi.");

    try { clip.name = etiket; } catch (eCn) {}
    var nodeId = "";
    try { nodeId = String(clip.nodeId); } catch (eNi) {}

    return KS_ok({
      track: idx, trackName: "V" + (idx + 1), newTrack: yeni,
      start: clip.start.seconds, end: clip.end.seconds, nodeId: nodeId
    });
  } catch (e) { return KS_err(e); }
}

function KS_removeOverlay(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var n = 0;
    for (var i = 0; i < seq.videoTracks.numTracks; i++) {
      var tr = seq.videoTracks[i];
      for (var j = tr.clips.numItems - 1; j >= 0; j--) {
        var c = tr.clips[j];
        var esles = false;
        try { if (p.nodeId && String(c.nodeId) === String(p.nodeId)) esles = true; } catch (eA) {}
        try {
          if (!esles && p.path && c.projectItem &&
              String(c.projectItem.getMediaPath()).toLowerCase() === String(p.path).toLowerCase()) esles = true;
        } catch (eB) {}
        if (esles) { try { c.remove(0, 0); n++; } catch (eR) {} }
      }
    }
    return KS_ok({ removed: n });
  } catch (e) { return KS_err(e); }
}

/* ---------- SFX kutuphanesi: playhead'e ses yerlestirme ---------- */

function KS_findFreeAudioTrack(seq, aSec, bSec) {
  for (var i = 0; i < seq.audioTracks.numTracks; i++) {
    if (KS_trackFreeIn(seq.audioTracks[i], aSec, bSec)) return i;
  }
  return -1;
}

function KS_insertSfx(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    if (!p.path || !(new File(p.path)).exists) return KS_err("Ses dosyasi bulunamadi: " + p.path);

    var item = KS_findItemByPath(app.project.rootItem, p.path);
    if (!item) {
      var bin = KS_findBin("Suflo SFX");
      app.project.importFiles([p.path], true, bin, false);
      try {
        var hits = app.project.rootItem.findItemsMatchingMediaPath(p.path, 1);
        if (hits && hits.length) item = hits[0];
      } catch (eF) {}
      if (!item) item = KS_findItemByPath(app.project.rootItem, p.path);
    }
    if (!item) return KS_err("Ses projeye aktarilamadi.");
    try { if (p.name) item.name = String(p.name); } catch (eN) {}

    // Akilli SFX bir altyazi vurgusunun kesin zamanini yollar; normal kutuphane
    // kullaniminda parametre yoktur ve mevcut playhead davranisi korunur.
    var start = Number(p.time);
    if (!(start >= 0)) {
      start = 0;
      try { start = seq.getPlayerPosition().seconds; } catch (eP) {}
    }
    var dur = 0;
    try { dur = item.getOutPoint().seconds - item.getInPoint().seconds; } catch (eD) {}
    if (!(dur > 0)) dur = 5;

    // Yalniz playhead anini degil, sesin kaplayacagi butun araligi kontrol et;
    // aksi halde overwriteClip ilerideki bir sesi sessizce ezebilir.
    var idx = KS_findFreeAudioTrack(seq, start, start + dur);
    if (idx < 0) return KS_err("Sesin suresi boyunca bos bir audio katmani yok. Yeni bir audio katmani acip tekrar dene.");

    var clip = KS_tryPlace(seq.audioTracks[idx], item, start);
    if (!clip) return KS_err("Ses timeline'a yerlestirilemedi.");
    try { if (p.name) clip.name = String(p.name); } catch (eCN) {}

    var sure = dur;
    try { sure = clip.end.seconds - clip.start.seconds; } catch (eS) {}
    return KS_ok({ track: idx, trackName: "A" + (idx + 1), start: start, dur: sure });
  } catch (e) { return KS_err(e); }
}

/* ---------- Kesim (v2.2 ile geri geldi) ---------- */

function KS_timecode(seconds) {
  var seq = KS_seq();
  var t = new Time();
  t.seconds = seconds;
  /*
   * getSettings().videoFrameRate BU API'DE YOK (v1.9'da kanıtlandı — overlay
   * fps'i bu yüzden timebase'ten alınır). Eski kod onu getFormatted'a verip
   * exception fırlatıyordu; razor'lar sessizce atlanıyor, kesim "çalışmıyor"
   * görünüyordu. Tek karenin süresi = seq.timebase tick'i; getFormatted'ın
   * beklediği kare hızı Time'ı budur.
   */
  var kare = new Time();
  kare.ticks = String(seq.timebase);
  var df = 0;
  try { df = seq.getSettings().videoDisplayFormat; } catch (e) {}
  return t.getFormatted(kare, df);
}


function KS_cloneActiveSeq() {
  var seq = KS_seq();
  var before = {};
  var i, s;
  for (i = 0; i < app.project.sequences.numSequences; i++) {
    before[String(app.project.sequences[i].sequenceID)] = 1;
  }
  seq.clone();
  var created = null;
  for (i = 0; i < app.project.sequences.numSequences; i++) {
    s = app.project.sequences[i];
    if (!before[String(s.sequenceID)]) { created = s; break; }
  }
  if (!created) return null;
  /*
   * Aktiflestirme sessizce basarisiz olabiliyor (kilitli panel, modal dialog).
   * Dogrulamadan donersek kesimler ORIJINAL sekansa uygulanir — kullanicinin
   * "kopyada calis" guvencesi bosa cikar. Aktif sekansin kimligini dogrula.
   */
  try { app.project.activeSequence = created; } catch (e1) {}
  var act = KS_seq();
  if (!act || String(act.sequenceID) !== String(created.sequenceID)) {
    try { app.project.openSequence(created.sequenceID); } catch (e2) {}
    act = KS_seq();
  }
  if (!act || String(act.sequenceID) !== String(created.sequenceID)) return null;
  return created;
}


function KS_applyCuts(encoded) {
  try {
    var p = KS_arg(encoded); // { ranges:[{start,end}], removeMode:"ripple"|"gap"|"select", cloneFirst:bool }
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var ranges = p.ranges || [];
    if (ranges.length === 0) return KS_err("Kesilecek aralik yok.");

    var newSeqName = "";
    if (p.cloneFirst) {
      var cloned = KS_cloneActiveSeq();
      if (!cloned) return KS_err("Kopya sekans olusturulamadi. 'Bu sekansta' modunu dene.");
      seq = KS_seq();
      if (!seq || String(seq.sequenceID) !== String(cloned.sequenceID)) {
        return KS_err("Kopya sekans aktif edilemedi — 'Bu sekansta' modunu dene.");
      }
      newSeqName = String(seq.name);
    }

    app.enableQE();
    var qseq = qe.project.getActiveSequence();

    // 1) Tum sinirlarda razor
    var boundaries = [];
    var r, i, t;
    for (i = 0; i < ranges.length; i++) { boundaries.push(ranges[i].start); boundaries.push(ranges[i].end); }
    for (i = 0; i < boundaries.length; i++) {
      var tc = KS_timecode(boundaries[i]);
      for (t = 0; t < qseq.numVideoTracks; t++) {
        try { qseq.getVideoTrackAt(t).razor(tc); } catch (eV) {}
      }
      for (t = 0; t < qseq.numAudioTracks; t++) {
        try { qseq.getAudioTrackAt(t).razor(tc); } catch (eA) {}
      }
    }

    // 2) Sessiz araliklarin icindeki kliplere davran (ripple icin sondan basa)
    // eps: sabit 0.02 kare suresinden kucuk kalabiliyordu (24 fps'te kare
    // 0.0417 sn) — razor'un kareye yuvarladigi parcalar "inside" sayilmiyordu.
    var tb = 0;
    try { tb = Number(seq.timebase); } catch (eTb) {}
    var eps = (tb > 0 ? tb / KS_TPS : 0.02) + 0.005;
    var removed = 0, selected = 0;

    /*
     * Ripple guvenligi: clip.remove(ripple=true) YALNIZ kendi track'ini
     * kaydirir. Bir track araligi kliplerle tam kaplamiyorsa o track
     * digerlerinden az kayar ve timeline KALICI senkron kaybeder.
     * Boyle bir aralik varsa ripple'i bosluk (gap) moduna dusur ve bildir.
     */
    var rippleDustu = false;
    if (p.removeMode === "ripple") {
      var kapliMi = function (tracks, rr) {
        for (var ti2 = 0; ti2 < tracks.numTracks; ti2++) {
          var tr2 = tracks[ti2];
          try { if (tr2.isLocked && tr2.isLocked()) continue; } catch (eL2) {}
          var toplam = 0, sonrasiVar = false, n2 = tr2.clips.numItems;
          for (var ci2 = 0; ci2 < n2; ci2++) {
            var c2 = tr2.clips[ci2];
            if (c2.start.seconds >= rr.start - eps && c2.end.seconds <= rr.end + eps) {
              toplam += c2.end.seconds - c2.start.seconds;
            }
            if (c2.end.seconds > rr.start + eps) sonrasiVar = true;
          }
          if (!sonrasiVar) continue; // bu track'te kayacak icerik yok
          if (toplam < (rr.end - rr.start) - 2 * eps) return false;
        }
        return true;
      };
      for (i = 0; i < ranges.length; i++) {
        if (!kapliMi(seq.audioTracks, ranges[i]) || !kapliMi(seq.videoTracks, ranges[i])) {
          rippleDustu = true;
          p.removeMode = "gap";
          break;
        }
      }
    }
    ranges.sort(function (a, b) { return b.start - a.start; });

    function handleTracks(tracks) {
      for (var ti = 0; ti < tracks.numTracks; ti++) {
        var tr = tracks[ti];
        if (tr.isLocked && tr.isLocked()) continue;
        for (var ci = tr.clips.numItems - 1; ci >= 0; ci--) {
          var cl = tr.clips[ci];
          var inside = (cl.start.seconds >= r.start - eps) && (cl.end.seconds <= r.end + eps);
          if (!inside) continue;
          if (p.removeMode === "select") {
            try { cl.setSelected(true, true); selected++; } catch (eS) {}
          } else {
            try {
              cl.remove(p.removeMode === "ripple", false);
              removed++;
            } catch (eR) {
              try { cl.setSelected(true, true); selected++; } catch (eS2) {}
            }
          }
        }
      }
    }

    for (i = 0; i < ranges.length; i++) {
      r = ranges[i];
      handleTracks(seq.audioTracks);
      handleTracks(seq.videoTracks);
    }

    return KS_ok({ cuts: boundaries.length, removed: removed, selected: selected, newSeq: newSeqName, rippleFallback: rippleDustu });
  } catch (e) { return KS_err(e); }
}


/* ---------- Ritim: sequence markerlari ---------- */

/*
 * Vurus zamanlarina sequence marker atar. createMarker saniye alir ve
 * belgelidir; ad atamasi bazi surumlerde salt-okunur olabilir, o yuzden
 * ad hatasi marker eklemeyi durdurmaz.
 */
function KS_addMarkers(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var times = p.times || [];
    if (!times.length) return KS_err("Marker zamani yok.");
    var n = 0;
    for (var i = 0; i < times.length; i++) {
      try {
        var m = seq.markers.createMarker(Number(times[i]));
        if (m && p.name) { try { m.name = String(p.name); } catch (eN) {} }
        n++;
      } catch (eM) {}
    }
    if (n === 0) return KS_err("Hicbir marker eklenemedi.");
    return KS_ok({ added: n });
  } catch (e) { return KS_err(e); }
}

/* ---------- Emoji: playhead'e grafik klip ---------- */

/*
 * PNG'yi projeye alip playhead'de bos bir video kanalina koyar.
 * Overlay makinesini (KS_findFreeVideoTrack, KS_tryPlace) yeniden kullanir.
 * Sure ayari denenir; trackItem.end bazi surumlerde salt-okunur olabilir,
 * o durumda Premiere'in varsayilan duragan gorsel suresi kalir.
 */
function KS_placeGraphic(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    if (!p.path || !(new File(p.path)).exists) return KS_err("Gorsel yok: " + p.path);

    var bin = KS_findBin("Suflo Emoji");
    app.project.importFiles([p.path], true, bin, false);
    var item = null;
    try {
      var hits = app.project.rootItem.findItemsMatchingMediaPath(p.path, 1);
      if (hits && hits.length) item = hits[0];
    } catch (eF) {}
    if (!item) item = KS_findItemByPath(app.project.rootItem, p.path);
    if (!item) return KS_err("Gorsel projeye aktarilamadi.");
    try { if (p.name) item.name = String(p.name); } catch (eN) {}

    var start = 0;
    try { start = seq.getPlayerPosition().seconds; } catch (eP) {}
    var medyaDur = 0;
    try { medyaDur = item.getOutPoint().seconds - item.getInPoint().seconds; } catch (eMd) {}
    // Unicode secici 1.6 sn davranisini korur. Emoji Assets'teki hareketli GIF
    // ise kendi gercek suresiyle kalir; duragan asset'ler panelden 5 sn yollar.
    var dur = p.keepDuration && medyaDur > 0 ? medyaDur : (Number(p.dur) > 0 ? Number(p.dur) : 1.6);
    /*
     * Still once Premiere'in varsayilan duragan gorsel suresiyle (tipik 5 sn)
     * yerlesir, SONRA kirpilir. Bos-katman kontrolunu istenen 1.6 sn ile
     * yapmak yetmez: aradaki farkta kalan klipleri overwriteClip ezer.
     * Kontrolu gercek yerlesme ayak iziyle yap.
     */
    var yerlesikDur = 0;
    try { yerlesikDur = medyaDur || (item.getOutPoint().seconds - item.getInPoint().seconds); } catch (eG2) {}
    var kontrolDur = Math.max(dur, yerlesikDur > 0 ? yerlesikDur : dur);

    var idx = KS_findFreeVideoTrack(seq, start, start + kontrolDur);
    if (idx < 0) {
      if (KS_addTopVideoTrack()) {
        seq = app.project.activeSequence;
        idx = KS_findFreeVideoTrack(seq, start, start + kontrolDur);
      }
    }
    if (idx < 0) return KS_err("Bos video katmani yok.");

    var clip = KS_tryPlace(seq.videoTracks[idx], item, start);
    if (!clip) return KS_err("Gorsel katmana yerlestirilemedi.");

    var sure = 0;
    try {
      var t = new Time();
      t.seconds = start + dur;
      clip.end = t;
      sure = dur;
    } catch (eD) {
      try { sure = clip.end.seconds - clip.start.seconds; } catch (eD2) {}
    }
    return KS_ok({ track: idx, trackName: "V" + (idx + 1), start: start, dur: sure });
  } catch (e) { return KS_err(e); }
}


/* ---------- Yazi kutuphanesi: MOGRT yerlestirme ---------- */

/*
 * .mogrt'yi playhead'e (ya da verilen saniyeye) bos bir video katmanina koyar.
 * importMGT zamani TICK cinsinden STRING ister (dokumante); saniye -> tick
 * donusumu Time nesnesiyle yapilir. Donus TrackItem ya da falsy'dir — exception
 * garantisi yok, o yuzden hem try/catch hem truthiness kontrolu var.
 */
function KS_placeMogrt(encoded) {
  try {
    var p = KS_arg(encoded); // { path, startSec?, dur? }
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var f = new File(p.path);
    if (!f.exists) return KS_err("MOGRT bulunamadi: " + p.path);

    var start = Number(p.startSec);
    if (!(start >= 0)) {
      try { start = seq.getPlayerPosition().seconds; } catch (eP) { start = 0; }
    }
    // yerlestirme ayak izi: mogrt suresi bilinmiyorsa 5 sn varsay (tipik varsayilan)
    var iz = Number(p.dur) > 0 ? Number(p.dur) : 5;

    var idx = KS_findFreeVideoTrack(seq, start, start + iz);
    if (idx < 0) {
      if (KS_addTopVideoTrack()) {
        seq = app.project.activeSequence;
        idx = KS_findFreeVideoTrack(seq, start, start + iz);
      }
    }
    if (idx < 0) return KS_err("Bos video katmani yok.");

    var t = new Time();
    t.seconds = start;
    var clip = null;
    try { clip = seq.importMGT(f.fsName, t.ticks, idx, 0); } catch (eM) {}
    if (!clip) return KS_err("MOGRT yerlestirilemedi — dosya After Effects'ten disa aktarilmis bir .mogrt mi?");

    try { if (p.name) clip.name = String(p.name); } catch (eN) {}
    var sure = 0;
    try { sure = clip.end.seconds - clip.start.seconds; } catch (eS) {}
    return KS_ok({ track: idx, trackName: "V" + (idx + 1), start: start, dur: sure });
  } catch (e) { return KS_err(e); }
}

/*
 * Motion BG / overlay video: dosyayi "Suflo Motion BG" bin'ine alir ve
 * playhead'de bos bir ust video katmanina yerlestirir. MOGRT'tan farki:
 * bunlar hazir video dosyalari (mp4/mov), importMGT degil importFiles + overwriteClip.
 */
function KS_placeMotionBG(encoded) {
  try {
    var p = KS_arg(encoded); // { path, startSec?, name? }
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var f = new File(p.path);
    if (!f.exists) return KS_err("Motion BG bulunamadi: " + p.path);

    var start = Number(p.startSec);
    if (!(start >= 0)) {
      try { start = seq.getPlayerPosition().seconds; } catch (eP) { start = 0; }
    }
    var iz = Number(p.dur) > 0 ? Number(p.dur) : 5;

    var bin = KS_findBin("Suflo Motion BG");
    var item = KS_findItemByPath(app.project.rootItem, f.fsName);
    if (!item) {
      try { app.project.importFiles([f.fsName], true, bin, false); } catch (eI) {}
      item = KS_findItemByPath(app.project.rootItem, f.fsName);
    }
    if (!item) return KS_err("Motion BG projeye alinamadi.");

    var idx = KS_findFreeVideoTrack(seq, start, start + iz);
    if (idx < 0) {
      if (KS_addTopVideoTrack()) {
        seq = app.project.activeSequence;
        idx = KS_findFreeVideoTrack(seq, start, start + iz);
      }
    }
    if (idx < 0) return KS_err("Bos video katmani yok.");

    var placed = KS_tryPlace(seq.videoTracks[idx], item, start);
    if (!placed) return KS_err("Motion BG yerlestirilemedi.");
    try { if (p.name) placed.name = String(p.name); } catch (eN) {}
    var sure = 0;
    try { sure = placed.end.seconds - placed.start.seconds; } catch (eS) {}
    return KS_ok({ track: idx, trackName: "V" + (idx + 1), start: start, dur: sure });
  } catch (e) { return KS_err(e); }
}
