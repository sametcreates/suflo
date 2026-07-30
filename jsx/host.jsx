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

function KS_timecode(seconds) {
  var seq = KS_seq();
  var t = new Time();
  t.seconds = seconds;
  var st = seq.getSettings();
  return t.getFormatted(st.videoFrameRate, st.videoDisplayFormat);
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

function KS_insertSfx(encoded) {
  try {
    var p = KS_arg(encoded);
    var mediaPath = p.path;
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok. Once bir sequence ac.");

    var item = KS_findItemByPath(app.project.rootItem, mediaPath);
    if (!item) {
      var bin = KS_findBin("Kesit SFX");
      app.project.importFiles([mediaPath], true, bin, false);
      item = KS_findItemByPath(app.project.rootItem, mediaPath);
    }
    if (!item) return KS_err("Dosya projeye alinamadi: " + mediaPath);

    var t = seq.getPlayerPosition(); // Time
    var sec = t.seconds;

    // O anda bos olan ilk ses kanalini bul
    var trackIdx = -1;
    for (var i = 0; i < seq.audioTracks.numTracks; i++) {
      var tr = seq.audioTracks[i];
      if (tr.isLocked && tr.isLocked()) continue;
      var busy = false;
      for (var c = 0; c < tr.clips.numItems; c++) {
        var cl = tr.clips[c];
        if (cl.start.seconds < sec + 0.001 && cl.end.seconds > sec + 0.001) { busy = true; break; }
      }
      if (!busy) { trackIdx = i; break; }
    }
    if (trackIdx === -1) return KS_err("Playhead konumunda bos ses kanali yok.");

    try {
      seq.audioTracks[trackIdx].overwriteClip(item, sec);
    } catch (e1) {
      var tt = new Time(); tt.seconds = sec;
      seq.audioTracks[trackIdx].overwriteClip(item, tt.ticks);
    }
    return KS_ok({ track: trackIdx + 1, at: sec });
  } catch (e) { return KS_err(e); }
}

/* ---------- Kesim ---------- */

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
  try { app.project.activeSequence = created; } catch (e1) {
    try { app.project.openSequence(created.sequenceID); } catch (e2) {}
  }
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
    var eps = 0.02;
    var removed = 0, selected = 0;
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

    return KS_ok({ cuts: boundaries.length, removed: removed, selected: selected, newSeq: newSeqName });
  } catch (e) { return KS_err(e); }
}

/* ---------- Motion ---------- */

function KS_getMotionProps() {
  try {
    var cl = KS_firstSelectedClip();
    if (!cl) return KS_err("Timeline'da bir klip sec.");
    var out = [];
    for (var c = 0; c < cl.components.numItems; c++) {
      var comp = cl.components[c];
      for (var pi = 0; pi < comp.properties.numItems; pi++) {
        var prop = comp.properties[pi];
        var keys = 0;
        try {
          var kk = prop.getKeys();
          keys = kk ? kk.length : 0;
        } catch (eK) {}
        if (keys >= 2) {
          out.push({
            comp: c, prop: pi,
            compName: String(comp.displayName),
            propName: String(prop.displayName),
            keys: keys
          });
        }
      }
    }
    return KS_ok({ clip: String(cl.name), props: out });
  } catch (e) { return KS_err(e); }
}

function KS_applyEase(encoded) {
  try {
    var p = KS_arg(encoded); // { comp, prop, curve:[[x,y]...], density }
    var cl = KS_firstSelectedClip();
    if (!cl) return KS_err("Bir klip sec.");
    var comp = cl.components[p.comp];
    if (!comp) return KS_err("Bilesen bulunamadi.");
    var prop = comp.properties[p.prop];
    if (!prop) return KS_err("Ozellik bulunamadi.");

    var keys;
    try { keys = prop.getKeys(); } catch (eK) { return KS_err("Bu ozellik keyframe desteklemiyor."); }
    if (!keys || keys.length < 2) return KS_err("En az 2 keyframe gerekli.");

    // once tum orijinal keylerin zaman ve degerlerini topla
    var orig = [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var sec = keys[i].seconds !== undefined ? keys[i].seconds : Number(keys[i].ticks) / KS_TPS;
      orig.push({ t: sec, v: prop.getValueAtKey(keys[i]) });
    }

    var curve = p.curve;
    function curveY(x) {
      for (var ci = 1; ci < curve.length; ci++) {
        if (x <= curve[ci][0]) {
          var x0 = curve[ci - 1][0], y0 = curve[ci - 1][1];
          var x1 = curve[ci][0], y1 = curve[ci][1];
          if (x1 - x0 < 0.0001) return y1;
          var f = (x - x0) / (x1 - x0);
          return y0 + (y1 - y0) * f;
        }
      }
      return curve[curve.length - 1][1];
    }
    function timeAt(sec) { var tt = new Time(); tt.seconds = sec; return tt; }

    prop.setTimeVarying(true);
    var added = 0;

    // her ardisik keyframe cifti arasina ayni egriyi uygula
    for (i = 0; i < orig.length - 1; i++) {
      var a = orig[i], b = orig[i + 1];
      var span = b.t - a.t;
      if (span < 0.05) continue;
      var isArr = (a.v instanceof Array);
      var steps = Math.max(4, Math.round(span * (p.density || 15)));
      if (steps > 120) steps = 120;
      for (var s = 1; s < steps; s++) {
        var f = s / steps;
        var sec2 = a.t + span * f;
        var prog = curveY(f);
        var val;
        if (isArr) {
          val = [];
          for (var d = 0; d < a.v.length; d++) val.push(a.v[d] + (b.v[d] - a.v[d]) * prog);
        } else {
          val = a.v + (b.v - a.v) * prog;
        }
        try {
          prop.addKey(timeAt(sec2));
          prop.setValueAtKey(timeAt(sec2), val, 1);
          added++;
        } catch (eA) {}
      }
    }
    return KS_ok({ added: added, pairs: orig.length - 1 });
  } catch (e) { return KS_err(e); }
}

/* ---------- Altyazı: sequence sesini dışa aktar ---------- */

// Premiere kurulumundaki sistem WAV export presetini (.epr) bul
function KS_findWavEpr() {
  var roots = ["C:/Program Files/Adobe", "C:/Program Files (x86)/Adobe"];
  var best = null, fallback = null;
  for (var r = 0; r < roots.length; r++) {
    var root = new Folder(roots[r]);
    if (!root.exists) continue;
    var apps = root.getFiles(function (f) {
      // Folder.name URI-kodludur ("Adobe%20Premiere%20Pro%202026") — cozerek esle
      return f instanceof Folder && /premiere pro/i.test(String(f.displayName || decodeURIComponent(f.name)));
    });
    for (var a = 0; a < apps.length; a++) {
      // 1) Settings/EncoderPresets (Wave48mono16.epr vb.)
      var encP = new Folder(apps[a].fsName + "/Settings/EncoderPresets");
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
    var AY = ($.os.indexOf("Windows") !== -1) ? "\\" : "/";
    var tdir = new Folder(Folder.temp.fsName + AY + "Suflo");
    if (!tdir.exists) tdir.create();
    var out = tdir.fsName + AY + "seq_" + (new Date().getTime()) + ".wav";
    var wa = (p.scope === "inout") ? 1 : 0; // 1 = in-out, 0 = tum sequence

    var res = "", done = false;
    for (var ei2 = 0; ei2 < eprList.length && !done; ei2++) {
      try {
        res = seq.exportAsMediaDirect(out, eprList[ei2], wa);
      } catch (eX) {
        res = String(eX);
      }
      done = (new File(out)).exists;
    }
    restoreMute();

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
    function tryCap(fmt) {
      try {
        var r = (fmt === undefined)
          ? seq.createCaptionTrack(item, 0)
          : seq.createCaptionTrack(item, 0, fmt);
        return (r !== false);
      } catch (eC) { return false; }
    }
    var created = tryCap(); // varsayilan format zaten Subtitle
    if (!created && typeof Sequence !== "undefined" && Sequence.CAPTION_FORMAT_SUBTITLE !== undefined) {
      created = tryCap(Sequence.CAPTION_FORMAT_SUBTITLE);
    }
    return KS_ok({ imported: true, captionTrack: created });
  } catch (e) { return KS_err(e); }
}
