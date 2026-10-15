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
                 .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")
                 // diger kontrol karakterleri (klip adinda olabilir) JSON'u bozmasin
                 .replace(/[\x00-\x1f\x7f\u2028\u2029]/g, function (c) {
                   var h = c.charCodeAt(0).toString(16);
                   return "\\u" + "0000".substr(h.length) + h;
                 });
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
  var text = decodeURIComponent(encoded);
  // Argumansiz K.call "undefined"/"null" gonderir: bos nesne
  if (text === "undefined" || text === "null" || text === "") return {};
  // Bozuk arguman sessizce {} olup yaniltici hatalara yol acmasin: acikca hata ver
  try { return KJSON.parse(text); } catch (e) { throw new Error("Panelden gelen arguman okunamadi."); }
}
function KS_ok(data) { data = data || {}; data.ok = true; return KJSON.stringify(data); }
function KS_err(msg) { return KJSON.stringify({ ok: false, error: String(msg) }); }
// Panel metni koda gore kurar (Turkce + Ingilizce sozluk panelde); error yalniz gunluk/yedek icin
function KS_errKod(kod, msg) { return KJSON.stringify({ ok: false, kod: String(kod), error: String(msg) }); }

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
      // Ad tekil degil (iki "Sequence 01" olabilir): durum anahtarlari icin kimlik
      sequenceId: seq ? String(seq.sequenceID) : "",
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
        try { out.playhead = seq.getPlayerPosition().seconds; } catch (ePH) {}
        // Hiz rampasinin ucretsiz onizlemesi kare sayisini buradan hesaplar (Premiere'e gitmeden)
        try { var tbC = Number(seq.timebase); if (tbC > 0) out.frame = tbC / KS_TPS; } catch (eFr) {}
        out.width = Number(seq.frameSizeHorizontal) || 0;
        out.height = Number(seq.frameSizeVertical) || 0;
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

// Bileseni ve dizinini bulur: { c, i } (dizin, kaldirma kaydinin compIdx'i; 3.4 adim 11)
function KS_presetComponentAt(clip, matchName, displayNames) {
  try {
    var list = clip.components;
    if (!list) return null;
    for (var i = 0; i < list.numItems; i++) {
      var item = list[i];
      var match = "";
      var display = "";
      try { match = String(item.matchName || ""); } catch (e0) {}
      try { display = String(item.displayName || "").toLowerCase(); } catch (e1) {}
      if (match === matchName) return { c: item, i: i };
      for (var n = 0; n < displayNames.length; n++) {
        if (display === String(displayNames[n]).toLowerCase()) return { c: item, i: i };
      }
    }
  } catch (e) {}
  return null;
}

function KS_presetComponent(clip, matchName, displayNames) {
  var r = KS_presetComponentAt(clip, matchName, displayNames);
  return r ? r.c : null;
}

// Ozelligi ve dizinini bulur: { p, i } (kaldirma kaydinin propIdx'i)
function KS_presetPropertyAt(component, matchNames, displayNames) {
  try {
    if (!component || !component.properties) return null;
    var list = component.properties;
    for (var i = 0; i < list.numItems; i++) {
      var item = list[i];
      var match = "";
      var display = "";
      try { match = String(item.matchName || ""); } catch (e0) {}
      try { display = String(item.displayName || "").toLowerCase(); } catch (e1) {}
      for (var m = 0; m < matchNames.length; m++) if (match === matchNames[m]) return { p: item, i: i };
      for (var n = 0; n < displayNames.length; n++) {
        if (display === String(displayNames[n]).toLowerCase()) return { p: item, i: i };
      }
    }
  } catch (e) {}
  return null;
}

function KS_presetProperty(component, matchNames, displayNames) {
  var r = KS_presetPropertyAt(component, matchNames, displayNames);
  return r ? r.p : null;
}

/*
 * Hareket > Konum / Olcek ve Opaklik. yer: { position | scale | opacity: { comp, ci, pi } } - Suflo'nun
 * yazdigi anahtarlarin kaydi (KS_kayitliYaz) ozelligi bu dizinler ve kimligiyle (KS_easeKimlik) yeniden bulur.
 */
function KS_presetProps(clip) {
  var motion = KS_presetComponentAt(clip, "ADBE Motion", ["Motion", "Hareket"]);
  var opacity = KS_presetComponentAt(clip, "ADBE Opacity", ["Opacity", "Opaklik", "Opakl\u0131k"]);
  var pos = motion ? KS_presetPropertyAt(motion.c, ["ADBE Position"], ["Position", "Konum"]) : null;
  var sc = motion ? KS_presetPropertyAt(motion.c, ["ADBE Scale"], ["Scale", "Olcek", "\u00d6l\u00e7ek"]) : null;
  var op = opacity ? KS_presetPropertyAt(opacity.c, ["ADBE Opacity"], ["Opacity", "Opaklik", "Opakl\u0131k"]) : null;
  var yer = {};
  if (pos) yer.position = { comp: motion.c, ci: motion.i, pi: pos.i };
  if (sc) yer.scale = { comp: motion.c, ci: motion.i, pi: sc.i };
  if (op) yer.opacity = { comp: opacity.c, ci: opacity.i, pi: op.i };
  return {
    position: pos ? pos.p : null,
    scale: sc ? sc.p : null,
    opacity: op ? op.p : null,
    yer: yer
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

/*
 * dense (3.4 adim 12, ozel egri): anahtarlar panelin sik (her kare / 2 karede bir) yazdigi egri ornekleri.
 * Premiere'in Bezier'i (5) yazilmaz (ornekler arasinda dalgalanma olmasin); Premiere izin veriyorsa (kfInterp:
 * setInterpolationTypeAtKey var) anahtarlar dogrusal (0) yapilir. updateUI yine yalniz son anahtarda; ilk / son
 * anahtar dogrulamasi ayni.
 */
function KS_presetKeys(prop, keys, clearStart, clearEnd, dense) {
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
    var dogrusal = dense === true && typeof prop.setInterpolationTypeAtKey === "function";
    for (var i = 0; i < keys.length; i++) {
      var t = KS_presetTime(keys[i].time);
      try { prop.addKey(t); } catch (e1) {}
      // Yalniz son anahtarda UI'yi tazele. Her anahtarda true vermek ozellikle
      // AE efektlerinde Effect Controls'i tekrar tekrar cizip 10-120 sn gecikme
      // yaratiyordu; anahtar verisinin kendisi false ile de aninda yazilir.
      prop.setValueAtKey(t, KS_presetCloneValue(keys[i].value), i === keys.length - 1);
      if (dense === true) {
        // ozel egri: 0 = dogrusal (sik ornekler arasinda Bezier dalgalanmasi olmasin)
        if (dogrusal) { try { prop.setInterpolationTypeAtKey(t, 0, false); } catch (e3) {} }
      } else {
        // 5, Premiere'in Bezier/ease turudur. Eski surum kabul etmezse
        // anahtarlar lineer kalir; preset yine calisir.
        try { if (prop.setInterpolationTypeAtKey) prop.setInterpolationTypeAtKey(t, 5, false); } catch (e2) {}
      }
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
// sinirsiz (3.4 Egri): oran [0,1]'e kirpilmaz. Klibin gorunen kisminin disindaki (tutamaktaki)
// kullanici anahtarlari arasina yazarken ic anahtarlar ucun ustune yigilmasin; ayni dogrusal esleme.
function KS_presetSourceTime(clip, timelineSec, timelineStart, timelineEnd, sinirsiz) {
  var duration = Math.max(0.000001, timelineEnd - timelineStart);
  var ratio = (Number(timelineSec) - timelineStart) / duration;
  if (!sinirsiz) ratio = Math.max(0, Math.min(1, ratio));
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

function KS_presetClipKeys(clip, timelineStart, timelineEnd, prop, keys, clearTimelineStart, clearTimelineEnd, dense) {
  var mapped = [];
  for (var i = 0; i < keys.length; i++) {
    mapped.push({
      time: KS_presetSourceTime(clip, keys[i].time, timelineStart, timelineEnd),
      value: keys[i].value
    });
  }
  var clearStart = clearTimelineStart === undefined ? undefined : KS_presetSourceTime(clip, clearTimelineStart, timelineStart, timelineEnd);
  var clearEnd = clearTimelineEnd === undefined ? undefined : KS_presetSourceTime(clip, clearTimelineEnd, timelineStart, timelineEnd);
  return KS_presetKeys(prop, mapped, clearStart, clearEnd, dense);
}

/* ---------- 3.4 adim 12: Gecis, Zoom ve Hareket onayarlarinda ozel egri (sik anahtarlar) ---------- */

/*
 * Yogun anahtarlari seyreltir (timeline saniyesi, artan): capa anahtarlar (a: 1; panelin seyrek plani) hep kalir;
 * aradaki egri ornegi yalniz bir onceki kalan anahtardan ve sonraki capadan en az yarim kare uzaksa kalir. Gecis
 * kisa klipte zamani sikistirinca (oran < 1) ornekler kare altina sikismasin. Hic capa isareti yoksa ilk ve son capa.
 */
function KS_yogunSeyrelt(keys, fps) {
  if (!keys || keys.length < 3) return keys;
  var yarim = 0.5 / (fps > 0 ? fps : 30), i, capaVar = false;
  for (i = 0; i < keys.length; i++) if (keys[i] && keys[i].a) { capaVar = true; break; }
  function capa(j) { return capaVar ? !!(keys[j] && keys[j].a) : (j === 0 || j === keys.length - 1); }
  // her anahtarin ardindaki ilk capanin zamani
  var sonraki = [], z = 1e15;
  for (i = keys.length - 1; i >= 0; i--) { sonraki[i] = z; if (capa(i)) z = Number(keys[i].time); }
  var out = [], son = -1e15;
  for (i = 0; i < keys.length; i++) {
    var t = Number(keys[i].time);
    if (capa(i) || (t - son >= yarim - 1e-9 && sonraki[i] - t >= yarim - 1e-9)) { out.push(keys[i]); son = t; }
  }
  return out;
}

/*
 * Portions adapted from Rebound (https://github.com/meszmate/rebound), MIT, Copyright (c) 2026 Rebound contributors.
 * See THIRD_PARTY_NOTICES.md. KS_egriTabloDeger: Rebound'un host/commands/spring.jsx'teki lookup'i (esit aralikli carpan
 * tablosunda dogrusal ara deger); KS_egriYogun'un boyut basina deger kurulumu (va + (vb - va) * f) ayni dosyadaki
 * bakeSegment'in fikri ("panel carpan tablosunu hesaplar, host yalniz ornekleyip yazar"). Kare secimi, capalar, sinirlar
 * ve geri kalan Suflo'nundur.
 */
// Panelin gonderdigi egri tablosu (SufloEase.bakeFactors: 0..1 araliginda esit aralikli ilerleme degerleri, uclar 0
// ve 1). Gecersizse null.
var KS_EGRI_TABLO_MIN = 17;
var KS_EGRI_TABLO_MAX = 1025;
var KS_EGRI_EN_COK = 2000;        // ozellik basina en cok ara anahtar (js/egri-secim.js ile ayni)
var KS_EGRI_TOPLAM_EN_COK = 6000; // Hareket onayari: tek cagrida en cok yogun anahtar (KS_EASE_MAX_WRITE ve
                                  // js/egri-secim.js HAREKET_EN_COK ile ayni)
function KS_egriTablo(t) {
  if (!t || typeof t === "string" || typeof t.length !== "number" || t.length < KS_EGRI_TABLO_MIN || t.length > KS_EGRI_TABLO_MAX) return null;
  var out = [];
  for (var i = 0; i < t.length; i++) {
    var v = Number(t[i]);
    if (!isFinite(v) || v < -1 || v > 2) return null;
    out.push(v);
  }
  if (Math.abs(out[0]) > 1e-6 || Math.abs(out[out.length - 1] - 1) > 1e-6) return null;
  return out;
}
// Rebound: lookup (host/commands/spring.jsx)
function KS_egriTabloDeger(tablo, u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  var x = u * (tablo.length - 1), i = Math.floor(x);
  if (i >= tablo.length - 1) return tablo[tablo.length - 1];
  return tablo[i] + (tablo[i + 1] - tablo[i]) * (x - i);
}
function KS_egriAyni(a, b) {
  if (typeof a === "number") return Math.abs(a - b) <= 1e-9;
  for (var i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return false;
  return true;
}
/*
 * Seyrek anahtarlari [{ time, value }] (timeline sn; value sayi ya da [x, y]) egri tablosuyla yogunlastirir: her parcanin
 * icine kare zamanlarinda (1 sn'den uzun parcada 2 karede bir; ozellik basina en cok 2000 ara anahtar, asarsa adim
 * ikiye katlanir) ara anahtar; uclardan en az yarim kare iceride. Degeri degismeyen parca atlanir. Seyrek anahtarlar
 * a: 1 (capa). opak: deger 0..100'e kirpilir. Kural js/egri-secim.js yogunlastir ile ayni (SufloEase.bakePlan kare
 * secimi); Hareket onayarlarinda ayni yonlu ara anahtar olmadigi icin birlestirme gerekmez.
 */
function KS_egriYogun(keys, tablo, fps, opak) {
  if (!keys || keys.length < 2 || !tablo) return keys;
  fps = fps > 0 ? fps : 30;
  var carpan = 1, parcalar, toplam, i;
  function kareler(t0, t1, adim) {
    var f0 = t0 * fps, f1 = t1 * fps;
    var taban = Math.abs(f0 - Math.round(f0)) < 1e-3 ? Math.round(f0) : Math.floor(f0);
    function aralik(s) {
      var jmin = Math.max(1, Math.floor((f0 + 0.5 - taban) / s) + 1);
      var jmax = Math.ceil((f1 - 0.5 - taban) / s) - 1;
      return { jmin: jmin, n: Math.max(0, jmax - jmin + 1) };
    }
    var ja = aralik(adim);
    if (!ja.n && adim > 1) {
      adim = Math.max(1, Math.min(adim, Math.floor((f1 - f0) / 2)));
      ja = aralik(adim);
      while (!ja.n && adim > 1) { adim--; ja = aralik(adim); }
    }
    var out = [];
    for (var j = 0; j < ja.n; j++) out.push((taban + (ja.jmin + j) * adim) / fps);
    return out;
  }
  for (;;) {
    parcalar = [];
    toplam = 0;
    for (i = 0; i < keys.length - 1; i++) {
      var a = keys[i], b = keys[i + 1], t0 = Number(a.time), t1 = Number(b.time);
      if (!(t1 > t0) || KS_egriAyni(a.value, b.value)) { parcalar.push([]); continue; }
      var zt = kareler(t0, t1, (t1 - t0 > 1 + 1e-9 ? 2 : 1) * carpan);
      parcalar.push(zt);
      toplam += zt.length;
    }
    if (toplam <= KS_EGRI_EN_COK || carpan >= 512) break;
    carpan *= 2;
  }
  var sonuc = [];
  for (i = 0; i < keys.length; i++) {
    sonuc.push({ time: keys[i].time, value: keys[i].value, a: 1 });
    if (i >= parcalar.length) continue;
    var p0 = keys[i], p1 = keys[i + 1], s0 = Number(p0.time), s1 = Number(p1.time);
    // Rebound: bakeSegment (host/commands/spring.jsx) fikri — boyut basina va + (vb - va) * carpan
    for (var q = 0; q < parcalar[i].length; q++) {
      var t = parcalar[i][q], e = KS_egriTabloDeger(tablo, (t - s0) / (s1 - s0)), v;
      if (typeof p0.value === "number") {
        v = p0.value + (p1.value - p0.value) * e;
        if (opak) v = Math.max(0, Math.min(100, v));
      } else {
        v = [];
        for (var k = 0; k < p0.value.length; k++) v.push(p0.value[k] + (p1.value[k] - p0.value[k]) * e);
      }
      sonuc.push({ time: t, value: v });
    }
  }
  return sonuc;
}

function KS_presetPositionValue(prop) {
  try {
    var v = prop.getValue();
    if (v && typeof v.length === "number" && v.length >= 2) return [Number(v[0]), Number(v[1])];
  } catch (e) {}
  return null;
}

function KS_presetPositionValueAt(prop, seconds) {
  try {
    if (prop && prop.getValueAtTime) {
      var v = prop.getValueAtTime(KS_presetTime(seconds));
      if (v && typeof v.length === "number" && v.length >= 2) return [Number(v[0]), Number(v[1])];
    }
  } catch (eAt) {}
  return KS_presetPositionValue(prop);
}

function KS_presetNumberValue(prop, fallback) {
  try {
    var v = Number(prop.getValue());
    if (isFinite(v)) return v;
  } catch (e) {}
  return fallback;
}

function KS_presetNumberValueAt(prop, seconds, fallback) {
  try {
    if (prop && prop.getValueAtTime) {
      var v = Number(prop.getValueAtTime(KS_presetTime(seconds)));
      if (isFinite(v)) return v;
    }
  } catch (eAt) {}
  return KS_presetNumberValue(prop, fallback);
}

// Hareket onayari yazimi (KS_kayitliYaz): ozel egri varsa (3.4 adim 12) seyrek anahtarlar tabloyla yogunlasir
// (KS_egriYogun; Opaklik 0..100) ve Bezier'siz yazilir. egri null: eskisi gibi. egri.say ({ n }): SAYIM gecisi,
// hicbir sey yazilmaz; yazilacak yogun anahtar sayisi eklenir (ust sinir: KS_kayitliYaz kare altini yalniz seyreltir).
function KS_onayarYaz(egri, kt, clip, start, end, props, ad, keys, clearA, clearB) {
  if (egri) keys = KS_egriYogun(keys, egri.tablo, egri.fps, ad === "opacity");
  if (egri && egri.say) {
    if (!props || !props[ad] || !keys || !keys.length) return false;
    egri.say.n += keys.length;
    return true;
  }
  return KS_kayitliYaz(kt, clip, start, end, props, ad, keys, clearA, clearB, !!egri);
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
    // 3.4 adim 12: ozel egri. Panel egriyi tablo olarak gonderir (p.egri.tablo; SufloEase.bakeFactors), seyrek
    // anahtarlar burada her klibin kendi degerleriyle kurulup kare zamanlarinda yogunlasir (KS_onayarYaz).
    // p.egri yoksa ('auto') yazim eskisi gibi (Bezier 5).
    var egri = null;
    if (p.egri) {
      var tablo = KS_egriTablo(p.egri.tablo);
      if (!tablo) return KS_err("Egri tablosu gecersiz.");
      egri = { tablo: tablo, fps: 30 };
      try { egri.fps = KS_easeFps(seq); } catch (eFps) {}
    }
    var frameW = Number(seq.frameSizeHorizontal) || 1920;
    var frameH = Number(seq.frameSizeVertical) || 1080;
    var applied = 0;
    var skipped = 0;
    // Kaldirma kayitlari (3.4 adim 11): her yazilan ozellik icin bir kayit (KS_kayitliYaz)
    var kt = KS_kayitToplayici(seq, "hareket");

    // 3.4 adim 12: ozel egride once SAYIM gecisi (hicbir sey yazilmaz, yalniz okunur; KS_onayarYaz egri.say): toplam
    // yogun anahtar KS_EGRI_TOPLAM_EN_COK'u asarsa cagri temizce reddedilir (Premiere dakikalarca kilitlenmesin;
    // panelin bekleme suresi isi kapsasin, zaman asiminda kayitlar kaybolmasin). Sonra yazim gecisi. 'auto': tek gecis.
    for (var gecis = egri ? 0 : 1; gecis < 2; gecis++) {
      applied = 0;
      skipped = 0;
      if (egri) egri.say = gecis === 0 ? { n: 0 } : null;
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
          changed = KS_onayarYaz(egri, kt, clip, start, end, props, "scale", [{ time: t0, value: scale * (1 + .12 * strength) }, { time: t1, value: scale * .985 }, { time: t2, value: scale }], start, start + clearD) || changed;
        } else if (id === "simple-zoom-out" && props.scale) {
          changed = KS_onayarYaz(egri, kt, clip, start, end, props, "scale", [{ time: t0, value: scale * Math.max(.55, 1 - .14 * strength) }, { time: t1, value: scale * 1.015 }, { time: t2, value: scale }], start, start + clearD) || changed;
        } else if (id === "pop-in") {
          if (props.scale) changed = KS_onayarYaz(egri, kt, clip, start, end, props, "scale", [{ time: t0, value: scale * Math.max(.45, 1 - .28 * strength) }, { time: t1, value: scale * (1 + .08 * strength) }, { time: t2, value: scale }], start, start + clearD) || changed;
          if (props.opacity) changed = KS_onayarYaz(egri, kt, clip, start, end, props, "opacity", [{ time: t0, value: 0 }, { time: start + d * .52, value: opacity }], start, start + clearD) || changed;
        } else if (id.indexOf("slide-in-") === 0 && pos) {
          var from = [pos[0], pos[1]];
          if (id === "slide-in-left") from[0] -= dx;
          if (id === "slide-in-right") from[0] += dx;
          if (id === "slide-in-up") from[1] -= dy;
          if (id === "slide-in-down") from[1] += dy;
          var over = [pos[0] + (pos[0] - from[0]) * .035, pos[1] + (pos[1] - from[1]) * .035];
          changed = KS_onayarYaz(egri, kt, clip, start, end, props, "position", [{ time: t0, value: from }, { time: t1, value: over }, { time: t2, value: pos }], start, start + clearD) || changed;
          if (props.opacity) changed = KS_onayarYaz(egri, kt, clip, start, end, props, "opacity", [{ time: t0, value: 0 }, { time: start + d * .62, value: opacity }], start, start + clearD) || changed;
        } else if (id === "fade-in" && props.opacity) {
          changed = KS_onayarYaz(egri, kt, clip, start, end, props, "opacity", [{ time: t0, value: 0 }, { time: t2, value: opacity }], start, start + clearD) || changed;
        } else if (id === "fade-out" && props.opacity) {
          t0 = end - d; t2 = end;
          changed = KS_onayarYaz(egri, kt, clip, start, end, props, "opacity", [{ time: t0, value: opacity }, { time: t2, value: 0 }], end - clearD, end) || changed;
        } else if (id === "slide-out-right" && pos) {
          t0 = end - d; t1 = t0 + d * .22; t2 = end;
          changed = KS_onayarYaz(egri, kt, clip, start, end, props, "position", [{ time: t0, value: pos }, { time: t1, value: [pos[0] - dx * .035, pos[1]] }, { time: t2, value: [pos[0] + dx, pos[1]] }], end - clearD, end) || changed;
          if (props.opacity) changed = KS_onayarYaz(egri, kt, clip, start, end, props, "opacity", [{ time: t0 + d * .35, value: opacity }, { time: t2, value: 0 }], end - clearD, end) || changed;
        } else if (id === "punch" && props.scale) {
          var center = playhead > start + d && playhead < end - d ? playhead : start + clipDur * .5;
          var half = Math.min(d * .5, Math.max(.08, Math.min(center - start, end - center)));
          var clearHalf = Math.min(clearD * .5, Math.max(.08, Math.min(center - start, end - center)));
          changed = KS_onayarYaz(egri, kt, clip, start, end, props, "scale", [{ time: center - half, value: scale }, { time: center, value: scale * (1 + .12 * strength) }, { time: center + half, value: scale }], center - clearHalf, center + clearHalf) || changed;
        } else if (id === "micro-shake" && pos) {
          var c = playhead > start + d && playhead < end - d ? playhead : start + clipDur * .5;
          var span = Math.min(d, Math.max(.16, clipDur * .25));
          var clearSpan = Math.min(clearD, Math.max(.16, clipDur * .25));
          changed = KS_onayarYaz(egri, kt, clip, start, end, props, "position", [
            { time: c - span * .5, value: pos },
            { time: c - span * .25, value: [pos[0] - dx * .055, pos[1] + dy * .025] },
            { time: c, value: [pos[0] + dx * .045, pos[1] - dy * .03] },
            { time: c + span * .25, value: [pos[0] - dx * .025, pos[1] + dy * .018] },
            { time: c + span * .5, value: pos }
          ], c - clearSpan * .5, c + clearSpan * .5) || changed;
        }
        if (changed) applied++; else skipped++;
      }
      if (gecis === 0 && egri.say.n > KS_EGRI_TOPLAM_EN_COK) {
        return KJSON.stringify({ ok: false, kod: "cokFazla", error: "Ozel egriyle cok fazla anahtar kare.",
          gereken: egri.say.n, enCok: KS_EGRI_TOPLAM_EN_COK });
      }
    }
    if (!applied) return KS_err("Secili klipte uygulanabilir Motion/Opacity ozelligi bulunamadi.");
    var cevap = { applied: applied, skipped: skipped, preset: id, removedKeys: KS_presetRemovedCount,
      records: kt.kayitlar, temizlenen: kt.temizlenen, tol: KS_kayitTol(kt), proje: KS_projeYolu() };
    if (egri) { cevap.yogun = true; cevap.yazilan = KS_kayitYazilan(kt); }
    return KS_ok(cevap);
  } catch (e) { return KS_err(e); }
}

/* ---------- Kesim gecisleri (v3.0) ---------- */

/*
 * Playhead'e en yakin kesimde (ayni katmanda A'nin bitip B'nin basladigi an)
 * iki klibe eslesik keyframe yazar. Plan panelde uretilir (js/transitions.js):
 *   p.plan = { half, out:{scale,pos,opacity}, in:{...} }
 *     scale/opacity: [{t, v}] klibin kendi degerinin carpani
 *     pos: [{t, x, y}] kadraj orani kayma
 *   p.tolerance: playhead'den en fazla bu kadar uzaktaki kesim (sn)
 */
// Yalniz anahtar sil (yenisini yazmadan): [startSec, endSec] KAYNAK zamani
function KS_presetClearKeys(prop, startSec, endSec) {
  if (!prop) return 0;
  var n = 0;
  try {
    var existing = prop.getKeys ? prop.getKeys() : null;
    if (!existing || typeof existing.length !== "number") return 0;
    var a = Math.min(startSec, endSec), b = Math.max(startSec, endSec);
    for (var i = existing.length - 1; i >= 0; i--) {
      var sec = Number(existing[i] && existing[i].seconds !== undefined ? existing[i].seconds : existing[i]);
      if (sec >= a - 0.002 && sec <= b + 0.002) {
        try { prop.removeKey(existing[i]); n++; KS_presetRemovedCount++; } catch (eR) {}
      }
    }
  } catch (e) {}
  return n;
}

function KS_isGraphicClip(c) {
  try { if (c.isMGT && c.isMGT()) return true; } catch (eM) {}
  try { if (!c.projectItem) return true; } catch (eP) {}
  return false;
}

// Bitisiklik toleransi yarim kare: 60 fps'de bir karelik bosluk kesim sayilmasin
function KS_gecisBitisik(seq) {
  var kare = Number(seq.timebase) / KS_TPS;
  return isFinite(kare) && kare > 0 ? kare * 0.5 : 0.008;
}

// Playhead'e en cok tol sn uzaktaki kesimler (ayni katmanda A'nin bitip B'nin basladigi an; kilitli katman atlanir).
// Klipler katman icinde zamana gore sirali: yalniz ardisik ciftler karsilastirilir (binlerce klipli kesilmis konusmada
// da hizli). Doner: [{ track, a, b, cut, dist, sec (secili bir klibe dokunuyor), grafik (altyazi / MOGRT siniri) }]
function KS_gecisKesimler(seq, playhead, tol) {
  var bitisik = KS_gecisBitisik(seq);
  var secili = [];
  try { var sa = seq.getSelection(); if (sa) for (var s0 = 0; s0 < sa.length; s0++) secili.push(sa[s0]); } catch (eS) {}
  var out = [];
  for (var ti = 0; ti < seq.videoTracks.numTracks; ti++) {
    var track = seq.videoTracks[ti];
    try { if (track.isLocked && track.isLocked()) continue; } catch (eL) {}
    var n = track.clips.numItems;
    var onceki = null;
    for (var i = 0; i < n; i++) {
      var c = track.clips[i];
      var cur = { c: c, s: Number(c.start.seconds), e: Number(c.end.seconds) };
      if (onceki && Math.abs(onceki.e - cur.s) <= bitisik) {
        var dist = Math.abs(cur.s - playhead);
        if (dist <= tol) {
          out.push({ track: ti, a: onceki.c, b: cur.c, cut: cur.s, dist: dist,
            sec: secili.length > 0 && (KS_gecisSeciliMi(secili, onceki.c) || KS_gecisSeciliMi(secili, cur.c)),
            grafik: KS_isGraphicClip(onceki.c) || KS_isGraphicClip(cur.c) });
        }
      }
      onceki = cur;
    }
  }
  return out;
}

// Iki adaydan x daha mi iyi: playhead'e daha yakin; esitlikte (1 ms) ust katman
function KS_gecisDahaIyi(x, y) {
  if (!y) return true;
  if (x.dist < y.dist - 0.001) return true;
  return Math.abs(x.dist - y.dist) <= 0.001 && x.track > y.track;
}

// Gecisi uygulamanin kesimi (KS_applyCutTransition): playhead'e en yakin kesim, en cok tol sn uzakta. Secim varsa
// secili klibe dokunan kesim once gelir; secime dokunmayan altyazi/grafik (MOGRT) sinirlari atlanir.
// Doner: { track, a, b, cut, dist } | null. Kaldirma secimi oncelemez: KS_kayitKesimSec.
function KS_gecisKesimBul(seq, playhead, tol) {
  var liste = KS_gecisKesimler(seq, playhead, tol);
  var bestSel = null, bestAny = null;
  for (var i = 0; i < liste.length; i++) {
    var aday = liste[i];
    if (aday.sec) {
      if (!bestSel || aday.dist < bestSel.dist - 0.001) bestSel = aday;
    } else if (!aday.grafik) {
      if (KS_gecisDahaIyi(aday, bestAny)) bestAny = aday;
    }
  }
  return bestSel || bestAny;
}

// Kesim tam yerinde: track katmaninda (0'dan) cut saniyesinde (yarim kare) birlesen iki klip. Kaldirmanin eski
// yontemi (onayla) panelin gosterdigi kesimi yeniden aramadan bununla bulur. Doner: KS_gecisKesimBul gibi | null
function KS_gecisKesimTam(seq, ti, cut) {
  if (!(ti >= 0) || Math.floor(ti) !== ti || !isFinite(cut)) return null;
  var bitisik = KS_gecisBitisik(seq);
  try {
    if (ti >= seq.videoTracks.numTracks) return null;
    var track = seq.videoTracks[ti];
    try { if (track.isLocked && track.isLocked()) return null; } catch (eL) {}
    var onceki = null;
    for (var i = 0; i < track.clips.numItems; i++) {
      var c = track.clips[i];
      var s = Number(c.start.seconds);
      if (onceki && Math.abs(onceki.e - s) <= bitisik && Math.abs(s - cut) <= bitisik) return { track: ti, a: onceki.c, b: c, cut: s, dist: 0 };
      onceki = { c: c, e: Number(c.end.seconds) };
    }
  } catch (e) {}
  return null;
}

function KS_gecisSeciliMi(secili, c) {
  for (var q = 0; q < secili.length; q++) {
    if (secili[q] === c || (c.nodeId && secili[q].nodeId && String(c.nodeId) === String(secili[q].nodeId))) return true;
  }
  return false;
}

/*
 * Kesimin bu yanindaki gecis penceresinde [t0, t1] Olcek / Konum / Opaklik anahtarlari silinir. Ozellikte hic anahtar
 * kalmadiysa pencerenin DISINDAKI (dinlenme) degere sabitlenir: deger temizlemeden once okunur, gecis onu etkilemez
 * (Premiere son anahtar silinince ozelligi o anahtarin degerinde birakir: Karartma'nin 0'inda kalan klip gorunmez olurdu).
 * Iki yol kullanir: gecis uygulanmadan once (onceki gecisin izi; hangi tur olursa olsun) ve eski yol (3.4 adim 11; kaydi
 * olmayan, onceki surumlerde uygulanmis gecis; panel once onay ister). kt verilirse silinenler kayit toplayicisina
 * bildirilir (KS_kayitTemizle). Doner: silinen anahtar sayisi.
 */
function KS_gecisPencereTemizle(clip, cStart, cEnd, t0, t1, tabanAn, kt) {
  var props = KS_presetProps(clip);
  var kaynakAn = KS_presetSourceTime(clip, tabanAn, cStart, cEnd);
  var adlar = ["scale", "position", "opacity"], n = 0;
  for (var i = 0; i < adlar.length; i++) {
    var prop = props[adlar[i]];
    if (!prop) continue;
    var taban = KS_kayitDegerAt(prop, kaynakAn);
    var tm = KS_kayitTemizle(kt, clip, cStart, cEnd, prop, props.yer ? props.yer[adlar[i]] : null, t0, t1);
    n += tm.n;
    if (tm.bosaldi && taban !== null) KS_kayitSabitle(prop, taban);
  }
  return n;
}

/*
 * p: { plan, tolerance }: playhead'e en yakin kesime gecis yazar. Doner: { cut, track, half, out, in, removedKeys,
 *   records (3.4: yazilan her ozelligin kaldirma kaydi, KS_kayitliYaz), proje }.
 * p: { temizle: true, tolerance, cut?, track? }: eski yol: kaydi olmayan gecisi pencereyle kaldirir
 *   (KS_gecisPencereTemizle). cut + track (1'den; KS_removeSufloKeys'in kesim cevabi, panel onayda gosterir) verilirse
 *   tam o kesim temizlenir (yeniden aranmaz: secim baska kesimi one gecirmesin); o kesim artik yoksa hata.
 */
function KS_applyCutTransition(encoded) {
  try {
    KS_presetRemovedCount = 0;
    var p = KS_arg(encoded);
    var plan = p.plan;
    var temizleModu = p.temizle === true;
    if (!temizleModu && (!plan || !(Number(plan.half) > 0))) return KS_err("Gecis plani gecersiz.");
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var playhead = 0;
    try { playhead = seq.getPlayerPosition().seconds; } catch (eP) {}
    var tol = Number(p.tolerance);
    if (!isFinite(tol) || tol <= 0) tol = 1.0;
    var MAX_HALF = KS_GECIS_MAX_HALF;
    var best = null;
    if (temizleModu && p.cut !== undefined && p.cut !== null) {
      best = KS_gecisKesimTam(seq, Number(p.track) - 1, Number(p.cut));
      if (!best) return KS_err("Kesim artik orada degil (timeline degismis); yeniden dene.");
    } else {
      best = KS_gecisKesimBul(seq, playhead, tol);
    }
    if (!best) return KS_err("Playhead'in yakininda kesim yok. Playhead'i iki klibin birlestigi yere getir.");

    var aStart = Number(best.a.start.seconds), aEnd2 = Number(best.a.end.seconds);
    var bStart2 = Number(best.b.start.seconds), bEnd = Number(best.b.end.seconds);
    var cut = best.cut;
    // Onceki bir gecisin (hangi tur olursa olsun) izi kalmasin: bu kesimde herhangi bir
    // gecisin dokunabilecegi en genis pencere temizlenir, taban degeri onun DISINDAN okunur.
    var wA = Math.min(MAX_HALF, (aEnd2 - aStart) * 0.5), wB = Math.min(MAX_HALF, (bEnd - bStart2) * 0.5);
    var tabanA = Math.max(aStart, cut - wA - 0.02), tabanB = Math.min(bEnd, cut + wB + 0.02);

    if (temizleModu) {
      // temizlenen: panel, penceresi temizlenen (artik olu) arac kayitlarini dusurur
      var ktT = KS_kayitToplayici(seq, "gecis");
      var silinen = KS_gecisPencereTemizle(best.a, aStart, aEnd2, cut - wA, aEnd2, tabanA, ktT) +
        KS_gecisPencereTemizle(best.b, bStart2, bEnd, bStart2, cut + wB, tabanB, ktT);
      return KS_ok({ cut: cut, track: best.track + 1, temizlendi: true, removedKeys: silinen, temizlenen: ktT.temizlenen, tol: KS_kayitTol(ktT),
        proje: KS_projeYolu() });
    }

    var half = Math.min(Number(plan.half), (aEnd2 - aStart) * 0.5, (bEnd - bStart2) * 0.5);
    if (!(half >= 0.08)) return KS_err("Kesimdeki klipler gecis icin cok kisa.");
    var oran = half / Number(plan.half);   // klip kisaysa plan zamanda sikistirilir
    // 3.4 adim 12: ozel egri. Plan sik anahtarlar tasir (capalar a: 1); Bezier (5) yazilmaz, kare alti sikisan
    // ornekler seyreltilir (KS_kayitliYaz), Opaklik 0..100'e kirpilir. 'auto' planda bu bayrak yok: yazim eskisi gibi.
    var yogun = plan.dense === true;
    var frameW = Number(seq.frameSizeHorizontal) || 1920;
    var frameH = Number(seq.frameSizeVertical) || 1080;

    // Kaldirma kayitlari (3.4 adim 11): her yazilan ozellik icin bir kayit; temizlenen anahtarlar da bildirilir
    var kt = KS_kayitToplayici(seq, "gecis");

    // Onceki gecisin izi: en genis pencere temizlenir; anahtari kalmayan ozellik pencere disindaki (dinlenme)
    // degerine sabitlenir. Aksi halde Premiere ozelligi silinen ilk anahtarin degerinde birakir (Karartma'dan sonra
    // Zoom Ici: B Opaklik 0'da, gorunmez) ve yeni gecis tabanini o artiktan okurdu.
    KS_gecisPencereTemizle(best.a, aStart, aEnd2, cut - wA, aEnd2, tabanA, kt);
    KS_gecisPencereTemizle(best.b, bStart2, bEnd, bStart2, cut + wB, tabanB, kt);

    // tabanAn: klibin "dinlenme" degerini okuyacagimiz timeline ani (gecis bolgesinin disi).
    // ValueAt KAYNAK zamani ister: timeline anini klibin kaynak zamanina cevir.
    function uygula(clip, side, cStart, cEnd, clearA, clearB, tabanAn) {
      if (!side) return false;
      var props = KS_presetProps(clip);
      var changed = false, k, list;
      var kaynakAn = KS_presetSourceTime(clip, tabanAn, cStart, cEnd);
      if (side.scale && props.scale) {
        var sc = KS_presetNumberValueAt(props.scale, kaynakAn, 100);
        list = [];
        for (k = 0; k < side.scale.length; k++) {
          list.push({ time: cut + side.scale[k].t * oran, value: sc * Number(side.scale[k].v) });
          if (yogun && side.scale[k].a) list[list.length - 1].a = 1;
        }
        changed = KS_kayitliYaz(kt, clip, cStart, cEnd, props, "scale", list, clearA, clearB, yogun) || changed;
      }
      if (side.opacity && props.opacity) {
        var op = KS_presetNumberValueAt(props.opacity, kaynakAn, 100);
        list = [];
        for (k = 0; k < side.opacity.length; k++) {
          var opV = op * Number(side.opacity[k].v);
          if (yogun) opV = Math.max(0, Math.min(100, opV));
          list.push({ time: cut + side.opacity[k].t * oran, value: opV });
          if (yogun && side.opacity[k].a) list[list.length - 1].a = 1;
        }
        changed = KS_kayitliYaz(kt, clip, cStart, cEnd, props, "opacity", list, clearA, clearB, yogun) || changed;
      }
      if (side.pos && props.position) {
        var pos = KS_presetPositionValueAt(props.position, kaynakAn);
        if (pos) {
          // Yeni Premiere surumleri konumu 0..1 normalize tutar; eskiler piksel
          var norm = Math.abs(pos[0]) <= 2.5 && Math.abs(pos[1]) <= 2.5;
          var fx = norm ? 1 : frameW, fy = norm ? 1 : frameH;
          list = [];
          for (k = 0; k < side.pos.length; k++) {
            list.push({ time: cut + side.pos[k].t * oran,
              value: [pos[0] + Number(side.pos[k].x) * fx, pos[1] + Number(side.pos[k].y) * fy] });
            if (yogun && side.pos[k].a) list[list.length - 1].a = 1;
          }
          changed = KS_kayitliYaz(kt, clip, cStart, cEnd, props, "position", list, clearA, clearB, yogun) || changed;
        }
      }
      return changed;
    }

    var outOk = uygula(best.a, plan.out, aStart, aEnd2, cut - half, aEnd2, tabanA);
    var inOk = uygula(best.b, plan["in"], bStart2, bEnd, bStart2, cut + half, tabanB);
    if (!outOk && !inOk) return KS_err("Kesimdeki kliplerde Motion/Opaklik ozelligi bulunamadi.");
    var cevap = { cut: cut, track: best.track + 1, half: half, out: outOk, "in": inOk, removedKeys: KS_presetRemovedCount,
      records: kt.kayitlar, temizlenen: kt.temizlenen, tol: KS_kayitTol(kt), proje: KS_projeYolu() };
    if (yogun) { cevap.yogun = true; cevap.yazilan = KS_kayitYazilan(kt); }
    return KS_ok(cevap);
  } catch (e) { return KS_err(e); }
}

/* ---------- Secili klibi verilen anlarda bol (sahne / vurus) — v3.0 ---------- */

/*
 * Yalniz SECILI kliplerin bulundugu katmanlari (bagli ses dahil) keser;
 * muzik gibi baska katmanlara dokunmaz. Sure secili kliplerin araligi
 * disindaki anlar atlanir.
 *   p.times: [sn] sequence zamani
 *   p.markers: true ise ayrica her ana marker koyar (p.name ile)
 */
function KS_splitSelectedAt(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var times = p.times || [];
    if (!times.length) return KS_err("Bolunecek an yok.");
    var sel = seq.getSelection();
    if (!sel || !sel.length) return KS_err("Timeline'da bolunecek klibi sec.");

    // katman -> o katmandaki SECILI kliplerin araliklari: bir an yalniz o katmanda
    // secili bir klibin icine dusuyorsa kesilir (secili olmayan klip kesilmez)
    var vIdx = {}, aIdx = {}, lo = null, ti, ci, si;
    function tara(tracks, hedef) {
      for (ti = 0; ti < tracks.numTracks; ti++) {
        var tr = tracks[ti];
        for (ci = 0; ci < tr.clips.numItems; ci++) {
          var c = tr.clips[ci];
          for (si = 0; si < sel.length; si++) {
            if (c === sel[si] || (c.nodeId && sel[si].nodeId && String(c.nodeId) === String(sel[si].nodeId))) {
              if (!hedef[ti]) hedef[ti] = [];
              hedef[ti].push([Number(c.start.seconds), Number(c.end.seconds)]);
              lo = 1;
            }
          }
        }
      }
    }
    function icinde(araliklar, t) {
      for (var q = 0; q < araliklar.length; q++) {
        if (t > araliklar[q][0] + 0.02 && t < araliklar[q][1] - 0.02) return true;
      }
      return false;
    }
    tara(seq.videoTracks, vIdx);
    tara(seq.audioTracks, aIdx);
    if (lo === null) return KS_err("Secili klip timeline'da bulunamadi.");

    app.enableQE();
    var qseq = qe.project.getActiveSequence();
    var kesilen = 0, k;
    for (var i = 0; i < times.length; i++) {
      var t = Number(times[i]);
      var tc = null, basarili = 0;
      for (k in vIdx) {
        if (vIdx.hasOwnProperty(k) && icinde(vIdx[k], t)) {
          if (tc === null) tc = KS_timecode(t);
          try { qseq.getVideoTrackAt(Number(k)).razor(tc); basarili++; } catch (eV) {}
        }
      }
      for (k in aIdx) {
        if (aIdx.hasOwnProperty(k) && icinde(aIdx[k], t)) {
          if (tc === null) tc = KS_timecode(t);
          try { qseq.getAudioTrackAt(Number(k)).razor(tc); basarili++; } catch (eA) {}
        }
      }
      if (!basarili) continue;   // kilitli katman vb.: "bolundu" denmesin
      if (p.markers) {
        try {
          var m = seq.markers.createMarker(t);
          if (m && p.name) m.name = String(p.name);
        } catch (eM) {}
      }
      kesilen++;
    }
    if (!kesilen) return KS_err("Verilen anlarin hicbiri secili klibin icinde degil.");
    var katman = 0;
    for (k in vIdx) if (vIdx.hasOwnProperty(k)) katman++;
    for (k in aIdx) if (aIdx.hasOwnProperty(k)) katman++;
    return KS_ok({ cuts: kesilen, tracks: katman });
  } catch (e) { return KS_err(e); }
}

/* ---------- Suflo Smooth: .prfpset'i panelden dogrudan uygula ---------- */

function KS_packRead(path) {
  var f = new File(String(path || ""));
  if (!f.exists) throw new Error("Preset çalışma dosyası bulunamadı.");
  if (!/\.json$/i.test(f.name)) throw new Error("Geçersiz preset çalışma dosyası.");
  try { if (Number(f.length) > 25 * 1024 * 1024) throw new Error("Preset çalışma dosyası çok büyük."); } catch (eSize) {
    if (/çok büyük/.test(String(eSize))) throw eSize;
  }
  if (!f.open("r")) throw new Error("Preset çalışma dosyası açılamadı.");
  var raw = f.read();
  f.close();
  return KJSON.parse(raw);
}

function KS_packSelectedVideo(seq) {
  var selected = seq.getSelection();
  var out = [];
  if (!selected || !selected.length) return out;
  for (var ti = 0; ti < seq.videoTracks.numTracks; ti++) {
    var track = seq.videoTracks[ti];
    for (var ci = 0; ci < track.clips.numItems; ci++) {
      var clip = track.clips[ci];
      for (var si = 0; si < selected.length; si++) {
        var same = clip === selected[si];
        try { if (!same && clip.nodeId && selected[si].nodeId) same = String(clip.nodeId) === String(selected[si].nodeId); } catch (eId) {}
        if (same) {
          var clipStart = 0, clipEnd = 0, clipName = "";
          try { clipStart = Number(clip.start.seconds) || 0; } catch (eStart) {}
          try { clipEnd = Number(clip.end.seconds) || clipStart; } catch (eEnd) {}
          try { clipName = String(clip.name || ""); } catch (eName) {}
          out.push({ clip: clip, track: ti, index: ci, start: clipStart, end: clipEnd, name: clipName });
          break;
        }
      }
    }
  }
  return out;
}

function KS_packNormMatchName(value) {
  return String(value || "").toLowerCase().replace(/^ae\./, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function KS_packNormDisplay(value) {
  return String(value || "").toLowerCase()
    .replace(/[ıİ]/g, "i").replace(/[öÖ]/g, "o").replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s").replace(/[çÇ]/g, "c").replace(/[ğĞ]/g, "g")
    .replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function KS_packComponentMatches(component, matchName, displayName) {
  if (!component) return false;
  try {
    if (matchName && KS_packNormMatchName(component.matchName) === KS_packNormMatchName(matchName)) return true;
  } catch (eM) {}
  try {
    if (displayName && KS_packNormDisplay(component.displayName) === KS_packNormDisplay(displayName)) return true;
  } catch (eD) {}
  return false;
}

function KS_packEffect(matchName, displayName) {
  var names = [String(displayName || ""), String(matchName || "")];
  var match = String(matchName || "");
  if (match.indexOf("AE.ADBE ") === 0) names.push(match.substr(8));
  if (match.indexOf("AE.") === 0) names.push(match.substr(3));
  for (var i = 0; i < names.length; i++) {
    if (!names[i]) continue;
    try {
      var fx = qe.project.getVideoEffectByName(names[i]);
      if (fx) return fx;
    } catch (e) {}
  }
  // Bazi Premiere surumleri getVideoEffectByName'de yalniz yerellestirilmis
  // adi kabul eder. Liste API'si varsa matchName/displayName uzerinden tara.
  var list = null;
  try { if (qe.project.getVideoEffectList) list = qe.project.getVideoEffectList(); } catch (eList) {}
  if (!list) { try { if (qe.project.getVideoEffects) list = qe.project.getVideoEffects(); } catch (eEffects) {} }
  if (list && typeof list.length === "number") {
    for (var li = 0; li < list.length; li++) {
      var item = list[li];
      try { if (matchName && KS_packNormMatchName(item.matchName) === KS_packNormMatchName(matchName)) return item; } catch (eLM) {}
      try { if (displayName && KS_packNormDisplay(item.displayName || item.name || item) === KS_packNormDisplay(displayName)) return item; } catch (eLD) {}
    }
  }
  return null;
}

function KS_packComponentCount(clip, matchName, displayName) {
  var components = clip && clip.components;
  if (!components) return 0;
  var count = 0;
  for (var i = 0; i < components.numItems; i++) {
    if (KS_packComponentMatches(components[i], matchName, displayName)) count++;
  }
  return count;
}

function KS_packComponent(clip, matchName, displayName, skipMatches) {
  var components = clip.components;
  if (!components) return null;
  var skip = Math.max(0, Number(skipMatches) || 0), seen = 0;
  // QE yeni efekti her zaman listenin sonuna eklemez. Essential Graphics
  // kliplerinde standart efektler Text/ucuncu taraf efektlerinin onune girer.
  // Dizin yerine, eklemeden once var olan ayni efekt sayisini atlayarak yeni
  // eslesen bileşeni bul.
  for (var i = 0; i < components.numItems; i++) {
    var c = components[i];
    if (!KS_packComponentMatches(c, matchName, displayName)) continue;
    if (seen >= skip) return c;
    seen++;
  }
  return null;
}

function KS_packQItemSeconds(item, field) {
  try {
    var value = item[field];
    if (value && value.seconds !== undefined) return Number(value.seconds);
    // QE zamani (QETime): secs / ticks
    if (value && value.secs !== undefined) return Number(value.secs);
    if (value && typeof value === "object" && value.ticks !== undefined) return Number(value.ticks) / KS_TPS;
    var raw = Number(value);
    if (!isFinite(raw)) return NaN;
    return Math.abs(raw) > 1000000 ? raw / KS_TPS : raw;
  } catch (e) { return NaN; }
}

function KS_packFindQClip(qseq, loc) {
  var track = null;
  try { track = qseq.getVideoTrackAt(loc.track); } catch (eTrack) {}
  if (!track) return null;
  var direct = null;
  try { direct = track.getItemAt(loc.index); } catch (eDirect) {}
  if (direct) {
    var directStart = KS_packQItemSeconds(direct, "start");
    if (!isFinite(directStart) || Math.abs(directStart - Number(loc.start || 0)) < .05) return direct;
  }
  var count = 0;
  try { count = Number(track.numItems) || 0; } catch (eCount) {}
  if (!count) { try { count = Number(track.clips && track.clips.numItems) || 0; } catch (eClips) {} }
  for (var i = 0; i < count; i++) {
    var item = null;
    try { item = track.getItemAt(i); } catch (eItem) {}
    if (!item) continue;
    var start = KS_packQItemSeconds(item, "start");
    var end = KS_packQItemSeconds(item, "end");
    if (isFinite(start) && Math.abs(start - Number(loc.start || 0)) < .05 &&
        (!isFinite(end) || Math.abs(end - Number(loc.end || 0)) < .08)) return item;
  }
  return direct;
}

function KS_packWaitForComponent(clip, matchName, displayName, beforeMatches) {
  var component = null;
  for (var attempt = 0; attempt < 6; attempt++) {
    component = KS_packComponent(clip, matchName, displayName, beforeMatches);
    if (component) return component;
    try { if (typeof $ !== "undefined" && $.sleep) $.sleep(55); } catch (eSleep) {}
  }
  return null;
}

function KS_packProperty(component, def) {
  if (!component || !component.properties) return null;
  var props = component.properties;
  var wanted = String(def.name || "").toLowerCase();
  if (wanted) {
    for (var i = 0; i < props.numItems; i++) {
      try { if (String(props[i].displayName || "").toLowerCase() === wanted) return props[i]; } catch (eN) {}
    }
  }
  var index = Number(def.index);
  if (isFinite(index) && index >= 0 && index < props.numItems) return props[index];
  return null;
}

function KS_packSourceTime(tick, component, sourceIn, sourceOut, speed) {
  var type = Number(component.type);
  var pin = Number(component.anchorIn) || 0;
  var pout = Number(component.anchorOut) || pin;
  var t = Number(tick) || 0;
  var dur = Math.max(0.000001, sourceOut - sourceIn);
  if (type === 0) {
    var span = Math.max(1, pout - pin);
    return sourceIn + ((t - pin) / span) * dur;
  }
  if (type === 2) return sourceOut - ((pout - t) / KS_TPS) * speed;
  return sourceIn + ((t - pin) / KS_TPS) * speed;
}

function KS_packSetParam(prop, def, component, clip, speed) {
  if (!prop || !def || def.direct === false) return false;
  var sourceIn = 0, sourceOut = 0;
  try { sourceIn = Number(clip.inPoint.seconds); } catch (eIn) {}
  try { sourceOut = Number(clip.outPoint.seconds); } catch (eOut) {}
  if (!isFinite(sourceIn)) sourceIn = 0;
  if (!isFinite(sourceOut) || sourceOut <= sourceIn) {
    try { sourceOut = sourceIn + Math.max(0.001, Number(clip.end.seconds) - Number(clip.start.seconds)); } catch (eDur) { sourceOut = sourceIn + 1; }
  }
  var reversed = false;
  try { if (clip.isSpeedReversed) reversed = !!clip.isSpeedReversed(); } catch (eReverse) {}
  var defs = def.keys || [];
  if (def.color && def.color.length === 4) {
    try {
      var oldColor = null;
      try { oldColor = prop.getColorValue(); } catch (eOldColor) {}
      var colorSame = oldColor && oldColor.length === 4;
      if (colorSame) {
        for (var oi = 0; oi < 4; oi++) {
          if (Math.abs(Number(oldColor[oi]) - Number(def.color[oi])) > 0.0001) { colorSame = false; break; }
        }
      }
      if (colorSame) return false;
      // updateUI=false: her parametrede Effect Controls'i yeniden cizmek buyuk
      // paketlerde saniyelerce bekletiyor. Deger yine render motoruna yazilir.
      prop.setColorValue(Number(def.color[0]), Number(def.color[1]), Number(def.color[2]), Number(def.color[3]), false);
      try {
        var actual = prop.getColorValue();
        if (actual && actual.length === 4) {
          for (var ci = 0; ci < 4; ci++) if (Math.abs(Number(actual[ci]) - Number(def.color[ci])) > 1) return false;
        }
      } catch (eColorVerify) {}
      return true;
    } catch (eColor) { return false; }
  }
  if (defs.length) {
    var mapped = [];
    var last = -1e100;
    for (var i = 0; i < defs.length; i++) {
      var sec = KS_packSourceTime(defs[i].tick, component, sourceIn, sourceOut, speed);
      if (reversed) sec = sourceOut - (sec - sourceIn);
      if (sec < sourceIn - 0.0005 || sec > sourceOut + 0.0005) continue;
      sec = Math.max(sourceIn, Math.min(sourceOut, sec));
      if (Math.abs(sec - last) < 0.000001) continue;
      mapped.push({ time: sec, value: KS_presetCloneValue(defs[i].value) });
      last = sec;
    }
    if (!mapped.length) return false;
    return KS_presetKeys(prop, mapped, mapped[0].time, mapped[mapped.length - 1].time);
  }
  if (def.current === null || def.current === undefined) return false;
  try {
    var target = KS_presetCloneValue(def.current);
    var current = null;
    try { current = prop.getValue(); } catch (eCurrent) {}
    var same = false;
    if (current && target && typeof current !== "string" && typeof target !== "string" &&
        typeof current.length === "number" && typeof target.length === "number" && current.length === target.length) {
      same = true;
      for (var vi = 0; vi < target.length; vi++) {
        if (Math.abs(Number(current[vi]) - Number(target[vi])) > 0.0001) { same = false; break; }
      }
    } else if (typeof current === "number" || typeof target === "number") {
      same = Math.abs(Number(current) - Number(target)) <= 0.0001;
    } else {
      same = String(current) === String(target);
    }
    if (same) return false;
    prop.setValue(target, false);
    return true;
  } catch (eSet) { return false; }
}

function KS_applyPackedPresetData(data, opts) {
  var seq = KS_seq();
  if (!seq) return KS_err("Aktif sequence yok.");
  if (!data || Number(data.schema) !== 1 || !(data.components instanceof Array) || !data.components.length) {
    return KS_err("Preset verisi geçersiz.");
  }
  var selected = KS_packSelectedVideo(seq);
  if (!selected.length) return KS_err("Timeline'da en az bir video klibi seç.");
  var speed = Number(opts && opts.speed);
  if (!isFinite(speed) || speed < .25 || speed > 3) speed = 1;
  try { app.enableQE(); } catch (eQE) { return KS_err("Premiere efekt motoru açılamadı: " + eQE); }
  if (typeof qe === "undefined" || !qe.project) return KS_err("Premiere efekt motoru bu sürümde kullanılamıyor.");
  var qseq = null;
  try { qseq = qe.project.getActiveSequence(); } catch (eSeq) {}
  if (!qseq) return KS_err("Aktif sequence efekt motorunda bulunamadı.");
  var applied = 0, skippedComponents = 0, appliedParams = 0, missing = [], engines = [];

  for (var si = 0; si < selected.length; si++) {
    var loc = selected[si];
    var qclip = null;
    qclip = KS_packFindQClip(qseq, loc);
    if (!qclip) { skippedComponents += data.components.length; continue; }
    var clipChanged = false;
    for (var ci = 0; ci < data.components.length; ci++) {
      var cdef = data.components[ci];
      if (!cdef || cdef.direct === false) { skippedComponents++; continue; }
      var component = null;
      if (cdef.intrinsic || String(cdef.matchName) === "AE.ADBE Opacity") {
        component = KS_packComponent(loc.clip, cdef.matchName, cdef.displayName);
      } else {
        var beforeMatches = KS_packComponentCount(loc.clip, cdef.matchName, cdef.displayName);
        var effect = KS_packEffect(cdef.matchName, cdef.displayName);
        if (!effect) {
          skippedComponents++;
          if (missing.length < 5) missing.push(cdef.displayName || cdef.matchName);
          continue;
        }
        try { qclip.addVideoEffect(effect); } catch (eAdd) {
          skippedComponents++;
          if (missing.length < 5) missing.push(cdef.displayName || cdef.matchName);
          continue;
        }
        component = KS_packWaitForComponent(loc.clip, cdef.matchName, cdef.displayName, beforeMatches);
      }
      if (!component) { skippedComponents++; continue; }
      var engineName = String(cdef.displayName || cdef.matchName || "Efekt");
      var engineSeen = false;
      for (var ei = 0; ei < engines.length; ei++) if (engines[ei] === engineName) { engineSeen = true; break; }
      if (!engineSeen && engines.length < 8) engines.push(engineName);
      var componentChanged = false;
      for (var pi = 0; pi < cdef.params.length; pi++) {
        var prop = KS_packProperty(component, cdef.params[pi]);
        if (KS_packSetParam(prop, cdef.params[pi], cdef, loc.clip, speed)) {
          componentChanged = true;
          appliedParams++;
        }
      }
      if (componentChanged) clipChanged = true;
      else skippedComponents++;
    }
    if (clipChanged) applied++;
  }
  if (!applied) {
    var why = missing.length ? " Eksik efekt: " + missing.join(", ") + "." : "";
    return KS_err("Preset seçili klibe uygulanamadı." + why);
  }
  return KS_ok({
    applied: applied,
    skippedComponents: skippedComponents,
    appliedParams: appliedParams,
    engines: engines,
    preset: String(data.name || "Suflo Smooth")
  });
}

function KS_applyPackedPreset(encoded) {
  try {
    var opts = KS_arg(encoded);
    var data = opts.data || KS_packRead(opts.path);
    return KS_applyPackedPresetData(data, opts);
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
    // 3.4 adim 12: ozel egri. Panel sik anahtarlar gonderir (capalar a: 1): Bezier (5) yazilmaz, Olcek ve Konum ayni
    // zamanlarda; 'auto' (dense yok) yazim eskisi gibi.
    var yogun = p.dense === true;
    // Kaldirma kayitlari (3.4 adim 11): Olcek ve Konum icin (KS_kayitliYaz). Panelin eski "Zoom'u kaldir" yolu
    // (kaydi olmayan klipte, onayla) bu fonksiyonu duz anahtarlarla cagirir; o yazimin kaydini panel saklamaz.
    var kt = KS_kayitToplayici(seq, "zoom");
    for (var i = 0; i < selected.length; i++) {
      var clip = selected[i];
      var props = KS_presetProps(clip);
      if (!props.scale) { skipped++; continue; }
      var start = Number(clip.start.seconds) || 0;
      var end = Number(clip.end.seconds) || start;
      if (end - start < 0.2) { skipped++; continue; }
      var sourceStart = 0;
      try { sourceStart = Number(clip.inPoint.seconds) || 0; } catch (eSourceStart) {}
      var base = KS_presetNumberValueAt(props.scale, sourceStart, 100);
      var pos0 = KS_presetPositionValueAt(props.position, sourceStart);
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
        if (yogun && keys[k].a) mapped[mapped.length - 1].a = 1;
        if (!merkezde && pos0) {
          posKeys.push({ time: t, value: [pos0[0] - sx * (v - 1), pos0[1] - sy * (v - 1)] });
          if (yogun && keys[k].a) posKeys[posKeys.length - 1].a = 1;
        }
      }
      if (!mapped.length) { skipped++; continue; }
      var cs = p.clearStart === undefined ? start : Math.max(start, Number(p.clearStart));
      var ce = p.clearEnd === undefined ? end : Math.min(end, Number(p.clearEnd));
      var ok = KS_kayitliYaz(kt, clip, start, end, props, "scale", mapped, cs, ce, yogun);
      if (!merkezde && posKeys.length && props.position) {
        KS_kayitliYaz(kt, clip, start, end, props, "position", posKeys, cs, ce, yogun);
      } else if (props.position && pos0) {
        // merkez / anchor kapali: onceki zoom'dan kalan pozisyon kaymalarini geri al
        KS_kayitliYaz(kt, clip, start, end, props, "position", [{ time: start, value: pos0 }, { time: end, value: pos0 }], cs, ce);
      }
      if (ok) applied++; else skipped++;
    }
    if (!applied) return KS_err("Secili klipte Motion > Scale ozelligi bulunamadi.");
    var cevap = { applied: applied, skipped: skipped, keyCount: keys.length, removedKeys: KS_presetRemovedCount, engine: "Motion > Scale",
      records: kt.kayitlar, temizlenen: kt.temizlenen, tol: KS_kayitTol(kt), proje: KS_projeYolu() };
    if (yogun) { cevap.yogun = true; cevap.yazilan = KS_kayitYazilan(kt); }
    return KS_ok(cevap);
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

    // katman secimi: secilmeyenleri gecici sustur, export sonrasi geri al.
    // unmuteWanted (Podcast Modu, istege bagli): istenen katman kullanicida susturulmussa
    // gecici olarak acilir; finally'de her katman eski haline doner. Varsayilan davranis ayni.
    var savedMute = null;
    var i, tr;
    var ac = p.unmuteWanted ? true : false;
    if (p.tracks && p.tracks.length > 0 && (p.tracks.length < seq.audioTracks.numTracks || ac)) {
      var want = {};
      for (i = 0; i < p.tracks.length; i++) want[p.tracks[i]] = 1;
      savedMute = [];
      for (i = 0; i < seq.audioTracks.numTracks; i++) {
        tr = seq.audioTracks[i];
        var was = false;
        try { was = tr.isMuted(); } catch (eM) {}
        savedMute.push(was);
        if (!want[i] && !was) { try { tr.setMute(1); } catch (eS) {} }
        else if (want[i] && was && ac) { try { tr.setMute(0); } catch (eU) {} }
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

/*
 * Premiere klibi en yakin KARE sinirina oturtur: 25 fps'te 41.62 sn (1040.5. kare)
 * 41.60/41.64'e duser ve 1 ms'lik KS_clipAt eslesmez. O zaman yerlestirmeden once
 * OLMAYAN ve istenen ana en fazla bir kare uzak klibi yeni klip say.
 */
function KS_yeniKlipYakin(track, once, sec) {
  var kare = 1 / 24;
  try {
    var tb = Number(app.project.activeSequence.timebase);
    if (tb > 0) kare = tb / 254016000000;
  } catch (eT) {}
  try {
    for (var i = 0; i < track.clips.numItems; i++) {
      var c = track.clips[i];
      if (once[String(c.start.ticks)]) continue;
      if (Math.abs(c.start.seconds - sec) <= kare + 1e-3) return c;
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
    var good = KS_clipAt(track, startSec) || KS_yeniKlipYakin(track, once, startSec);
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
    // Shorts paketi: katman yalniz beklenen sekansa (kullanici arada sekans degistirdiyse o adim durur)
    if (p.expectSeqId && String(seq.sequenceID) !== String(p.expectSeqId)) {
      return KS_err("Etkin sekans degisti; katman konmadi.");
    }
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
    // p.at: belirli an (sn) ya da "playhead" (kanca basligi gibi kisa katmanlar)
    if (p.at === "playhead") {
      try { startSec = seq.getPlayerPosition().seconds; } catch (eP) {}
    } else if (typeof p.at === "number" && isFinite(p.at) && p.at >= 0) {
      startSec = p.at;
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

/*
 * Satin alma sonrasi temiz yeniden olusturma (js/overlay-render.js temizYenidenOlustur).
 * Yol karsilastirmasi: Windows'ta buyuk/kucuk harf ve \ ile / farki onemsiz.
 */
function KS_yolAnahtari(p) {
  return String(p || "").replace(/\\/g, "/").toLowerCase();
}

// Projede medya yolu birebir eslesen TUM ogeler (kutular dahil, ozyinelemeli)
function KS_itemsByPath(container, anahtar, out) {
  var n = 0;
  try { n = container.children.numItems; } catch (eN) {}
  for (var i = 0; i < n; i++) {
    var it = container.children[i];
    if (!it) continue;
    if (it.type === 2) { KS_itemsByPath(it, anahtar, out); continue; }
    try { if (it.getMediaPath && KS_yolAnahtari(it.getMediaPath()) === anahtar) out.push(it); } catch (e) {}
  }
  return out;
}

/*
 * Deneme dosyasini projede temiz dosyayla degistir (ProjectItem.changeMediaPath): timeline'daki
 * her ornek (tasinmis, kirpilmis, bolunmus, kopyalanmis, baska sekanstaki) ve klibe eklenen
 * efektler aynen kalir. Yalniz yolu birebir eslesen ogeler; basari getMediaPath ile dogrulanir.
 * Doner: { items, swapped, reason }. swapped 0 ise cagiran timeline'a dokunmadan yedek yola gecer.
 */
function KS_swapOverlayMedia(encoded) {
  try {
    var p = KS_arg(encoded);
    if (!p.path || !p.newPath) return KS_err("Overlay yolu yok.");
    if (!(new File(p.newPath)).exists) return KS_err("Temiz dosya yok: " + p.newPath);
    var ogeler = KS_itemsByPath(app.project.rootItem, KS_yolAnahtari(p.path), []);
    var yeni = KS_yolAnahtari(p.newPath), n = 0, sebep = ogeler.length ? "" : "proje ogesi yok";
    for (var i = 0; i < ogeler.length; i++) {
      var it = ogeler[i];
      if (!it.changeMediaPath) { sebep = "changeMediaPath yok"; continue; }
      try {
        if (it.canChangeMediaPath && !it.canChangeMediaPath()) { sebep = "canChangeMediaPath false"; continue; }
      } catch (eC) {}
      try { it.changeMediaPath(p.newPath, false); } catch (eM) { sebep = String(eM); }
      var simdi = "";
      try { simdi = KS_yolAnahtari(it.getMediaPath()); } catch (eG) {}
      if (simdi === yeni) n++;
      else if (!sebep) sebep = "yol degismedi";
    }
    return KS_ok({ items: ogeler.length, swapped: n, reason: sebep });
  } catch (e) { return KS_err(e); }
}

/*
 * Deneme katmaninin aktif sekanstaki ornekleri (YALNIZ okur, hicbir seyi degistirmez): iz,
 * baslangic/bitis (sekans sn) ve kaynak in/out (sn). Yerinde degistirme olmazsa temiz yeniden
 * olusturma, kullanicinin duzenledigi katmani ezmemek icin buna bakar.
 */
function KS_overlayInstances(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    if (!p.path) return KS_err("Overlay yolu yok.");
    var anahtar = KS_yolAnahtari(p.path);
    var liste = [];
    for (var i = 0; i < seq.videoTracks.numTracks; i++) {
      var tr = seq.videoTracks[i];
      for (var j = 0; j < tr.clips.numItems; j++) {
        var c = tr.clips[j], yol = "";
        try { if (c.projectItem) yol = KS_yolAnahtari(c.projectItem.getMediaPath()); } catch (eP) {}
        if (yol !== anahtar) continue;
        var o = { track: i, trackName: "V" + (i + 1), start: -1, end: -1, inPoint: -1, outPoint: -1 };
        try { o.start = c.start.seconds; } catch (e1) {}
        try { o.end = c.end.seconds; } catch (e2) {}
        try { o.inPoint = c.inPoint.seconds; } catch (e3) {}
        try { o.outPoint = c.outPoint.seconds; } catch (e4) {}
        liste.push(o);
      }
    }
    var kare = 0;
    try { var tb = Number(seq.timebase); if (tb > 0) kare = tb / 254016000000; } catch (eT) {}
    return KS_ok({ instances: liste, frame: kare });
  } catch (e) { return KS_err(e); }
}

/* ---------- SFX kutuphanesi: playhead'e ses yerlestirme ---------- */

function KS_findFreeAudioTrack(seq, aSec, bSec) {
  for (var i = 0; i < seq.audioTracks.numTracks; i++) {
    var tr = seq.audioTracks[i];
    // sessize alinmis kanala konan ses duyulmaz: atla
    try { if (tr.isMuted && tr.isMuted()) continue; } catch (eM) {}
    if (KS_trackFreeIn(tr, aSec, bSec)) return i;
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

/*
 * Sesi iyilestir: temizlenmis sesi orijinal klibin TAM altina (ayni baslangic)
 * bos bir ses kanalina koy, orijinal ses klip(ler)ini devre disi birak.
 * Orijinal silinmez: istenirse Premiere'de yeniden etkinlestirilir.
 *   p: { path, start, end, mediaPath, name, disableOriginal }
 */
function KS_addAudioTrack(seq) {
  var before = seq.audioTracks.numTracks;
  try {
    app.enableQE();
    if (typeof qe === "undefined" || !qe.project) return false;
    var q = qe.project.getActiveSequence();
    if (!q || !q.addTracks) return false;
    q.addTracks(0, 0, 1, 1, before, 0, 0);
  } catch (e) { return false; }
  return app.project.activeSequence.audioTracks.numTracks > before;
}

function KS_placeCleanAudio(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    if (!p.path || !(new File(p.path)).exists) return KS_err("Temiz ses dosyasi yok: " + p.path);
    var start = Number(p.start), end = Number(p.end);
    if (!(end > start)) return KS_err("Gecersiz aralik.");

    var bin = KS_findBin("Suflo Ses");
    app.project.importFiles([p.path], true, bin, false);
    var item = null;
    try {
      var hits = app.project.rootItem.findItemsMatchingMediaPath(p.path, 1);
      if (hits && hits.length) item = hits[0];
    } catch (eF) {}
    if (!item) item = KS_findItemByPath(app.project.rootItem, p.path);
    if (!item) return KS_err("Ses projeye aktarilamadi.");
    try { if (p.name) item.name = String(p.name); } catch (eN) {}

    var idx = KS_findFreeAudioTrack(seq, start, end);
    var yeni = false;
    if (idx < 0) {
      if (KS_addAudioTrack(seq)) {
        seq = app.project.activeSequence;
        idx = KS_findFreeAudioTrack(seq, start, end);
        yeni = idx >= 0;
      }
    }
    if (idx < 0) return KS_err("Bos ses kanali yok ve yenisi acilamadi. Bir audio kanali ekleyip tekrar dene.");
    var clip = KS_tryPlace(seq.audioTracks[idx], item, start);
    if (!clip) return KS_err("Ses timeline'a yerlestirilemedi.");
    try { if (p.name) clip.name = String(p.name); } catch (eCn) {}

    // Yalniz temiz sesin TAM yerini tutan orijinal ses klipleri devre disi: ayni medya,
    // ayni kaynak hizasi (kaynak-timeline farki) ve temiz aralik icinde. J/L kesimde
    // disari tasan ya da ayni dosyanin baska anindan gelen klipler kapatilmaz.
    var kapatilan = 0, atlanan = 0, tol = 0.05;
    var hiza = Number(p.inPoint) - start;
    if (p.disableOriginal !== false && p.mediaPath) {
      for (var t = 0; t < seq.audioTracks.numTracks; t++) {
        if (t === idx) continue;
        var tr = seq.audioTracks[t];
        for (var c = 0; c < tr.clips.numItems; c++) {
          var k = tr.clips[c];
          try {
            if (!k.projectItem || String(k.projectItem.getMediaPath()) !== String(p.mediaPath)) continue;
            if (!(k.end.seconds > start + 0.01 && k.start.seconds < end - 0.01)) continue;
            var ayniHiza = !isFinite(hiza) || Math.abs((k.inPoint.seconds - k.start.seconds) - hiza) < tol;
            var icinde = k.start.seconds >= start - tol && k.end.seconds <= end + tol;
            if (!ayniHiza || !icinde) { atlanan++; continue; }
            k.disabled = true;
            kapatilan++;
          } catch (eK) {}
        }
      }
    }
    return KS_ok({ track: idx, trackName: "A" + (idx + 1), newTrack: yeni, disabled: kapatilan, skipped: atlanan,
      start: clip.start.seconds, end: clip.end.seconds });
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
    var p = KS_arg(encoded); // { ranges:[{start,end}], removeMode:"ripple"|"gap"|"select", cloneFirst:bool, cloneName? }
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
      // Kopya sekansa anlamli ad (or. "Vlog - Suflo Temiz"); ozgun sekans dokunulmamis yedek
      if (p.cloneName) { try { seq.name = String(p.cloneName); } catch (eN) {} }
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


/* ---------- Podcast Modu: mikrofona gore kamera gecisi ---------- */

/*
 * Kamera katmanlari yalniz KENDI acilis / kapanis anlarinda (QE razor) kesilir; parcalar
 * klip.disabled ile acilip kapanir. KS_applyCuts'a dokunulmaz. Multicam kaynak sekansinda
 * aci degistirecek API yok: oyle klipler bastan reddedilir.
 */
var KS_MC_EPS = 0.02;

function KS_mcKlipBayrak(cl, ad) {
  try {
    var pi = cl.projectItem;
    if (!pi || typeof pi[ad] !== "function") return false;
    return pi[ad]() ? true : false;
  } catch (e) { return false; }
}

function KS_mcIzBilgi(tr, i, video) {
  var o = { index: i, name: "", locked: false, muted: false, clipCount: 0, first: 0, last: 0, hasMulticam: false, hasMerged: false };
  try { o.name = String(tr.name || ""); } catch (eN) {}
  try { o.locked = tr.isLocked && tr.isLocked() ? true : false; } catch (eL) {}
  try { o.muted = tr.isMuted && tr.isMuted() ? true : false; } catch (eM) {}
  var n = 0;
  try { n = tr.clips.numItems; } catch (eC) {}
  o.clipCount = n;
  var yollar = {};
  for (var ci = 0; ci < n; ci++) {
    var cl = tr.clips[ci];
    var bas = Number(cl.start.seconds), son = Number(cl.end.seconds);
    if (ci === 0 || bas < o.first) o.first = bas;
    if (son > o.last) o.last = son;
    if (KS_mcKlipBayrak(cl, "isMulticamClip")) o.hasMulticam = true;
    if (KS_mcKlipBayrak(cl, "isMergedClip")) o.hasMerged = true;
    if (!video) {
      try { yollar[String(cl.projectItem.getMediaPath())] = 1; } catch (eP) {}
    }
  }
  // Duz ses klibi (tek klip, tek dosya, birlesik / multicam degil): Premiere disa aktaramazsa
  // panel sesi dogrudan dosyadan okuyabilir
  if (!video && n === 1 && !o.hasMulticam && !o.hasMerged) {
    try {
      var c0 = tr.clips[0];
      var yol = String(c0.projectItem.getMediaPath() || "");
      if (yol) o.plain = { path: yol, start: Number(c0.start.seconds), end: Number(c0.end.seconds), inPoint: Number(c0.inPoint.seconds) };
    } catch (eD) {}
  }
  return o;
}

function KS_getTrackLayout() {
  try {
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var v = [], a = [], i;
    for (i = 0; i < seq.videoTracks.numTracks; i++) v.push(KS_mcIzBilgi(seq.videoTracks[i], i, true));
    for (i = 0; i < seq.audioTracks.numTracks; i++) a.push(KS_mcIzBilgi(seq.audioTracks[i], i, false));
    var sure = 0;
    try { sure = Number(seq.end) / KS_TPS; } catch (eS) {}
    return KS_ok({ seqId: String(seq.sequenceID), name: String(seq.name), duration: sure, video: v, audio: a });
  } catch (e) { return KS_err(e); }
}

// Kamera katmanlarini dogrula: hata varsa HICBIR degisiklik yapilmadan doner
function KS_mcIzDenetle(seq, camTracks) {
  if (!camTracks || !camTracks.length) return { kod: "iz_yok", track: -1, error: "Kamera katmani secilmedi." };
  for (var i = 0; i < camTracks.length; i++) {
    var ti = Number(camTracks[i]);
    if (!(ti >= 0) || ti >= seq.videoTracks.numTracks) return { kod: "iz_yok", track: ti, error: "Video katmani bulunamadi: V" + (ti + 1) };
    var tr = seq.videoTracks[ti];
    var bilgi = KS_mcIzBilgi(tr, ti, true);
    if (bilgi.locked) return { kod: "kilitli", track: ti, error: "Katman kilitli: V" + (ti + 1) };
    if (!bilgi.clipCount) return { kod: "bos", track: ti, error: "Katmanda klip yok: V" + (ti + 1) };
    if (bilgi.hasMulticam) return { kod: "multicam", track: ti, error: "Multicam kaynak klibi desteklenmiyor: V" + (ti + 1) };
  }
  return null;
}

function KS_mcHata(h) {
  return KJSON.stringify({ ok: false, kod: h.kod, track: h.track, error: h.error });
}

function KS_multicamPrepare(encoded) {
  try {
    var p = KS_arg(encoded); // { camTracks:[...], cloneFirst:bool, cloneName?, seqId?, seqIds?:[...] }
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    if (p.seqId && String(seq.sequenceID) !== String(p.seqId)) {
      // Etkin sekans bu analizin Suflo kopyasiysa (onceki "Kopyada uygula") yeniden uygulama
      // calisir: kopya modunda orijinal acilip yeniden kopyalanir, yerinde modda kopyaya uygulanir
      var bilinen = false, ids = p.seqIds || [], k;
      for (k = 0; k < ids.length; k++) if (String(ids[k]) === String(seq.sequenceID)) bilinen = true;
      if (!bilinen) return KS_mcHata({ kod: "sekans", track: -1, error: "Aktif sekans degisti; sekansi yeniden tara." });
      if (p.cloneFirst) {
        seq = KS_activateSeq(p.seqId);
        if (!seq) return KS_mcHata({ kod: "orijinal", track: -1, error: "Orijinal sekans acilamadi." });
      }
    }
    var h = KS_mcIzDenetle(seq, p.camTracks);
    if (h) return KS_mcHata(h);
    var kopya = false;
    if (p.cloneFirst) {
      var cloned = KS_cloneActiveSeq();
      if (!cloned) return KS_mcHata({ kod: "kopya", track: -1, error: "Kopya sekans olusturulamadi. 'Bu sekansta' modunu dene." });
      seq = KS_seq();
      if (!seq || String(seq.sequenceID) !== String(cloned.sequenceID)) {
        return KS_mcHata({ kod: "kopya", track: -1, error: "Kopya sekans aktif edilemedi." });
      }
      if (p.cloneName) { try { seq.name = String(p.cloneName); } catch (eN) {} }
      kopya = true;
    }
    // Hicbir kesimden ONCE: klip acma/kapama bu surumde calisiyor mu, kamera sesle iki yonlu
    // bagli mi? Tek klipte denenir ve geri alinir (sekans net degismez).
    var b = KS_mcBagDene(seq, p.camTracks);
    if (b) return KJSON.stringify({ ok: false, kod: b.kod, track: b.track, cloned: kopya, error: b.error });
    return KS_ok({ seqId: String(seq.sequenceID), name: String(seq.name), cloned: kopya });
  } catch (e) { return KS_err(e); }
}

// t anindaki kamera katmani (plan [{s,e,t}] sirali; ikili arama)
function KS_mcIzAt(plan, t) {
  if (!plan || !plan.length) return -1;
  if (t < Number(plan[0].s)) return Number(plan[0].t);
  var lo = 0, hi = plan.length - 1;
  while (lo < hi) {
    var mid = Math.floor((lo + hi + 1) / 2);
    if (Number(plan[mid].s) <= t) lo = mid; else hi = mid - 1;
  }
  return Number(plan[lo].t);
}

function KS_mcSekansDenetle(p) {
  var seq = KS_seq();
  if (!seq) return { seq: null, hata: KS_err("Aktif sequence yok.") };
  if (!p.seqId || String(seq.sequenceID) !== String(p.seqId)) {
    return { seq: null, hata: KS_mcHata({ kod: "sekans", track: -1, error: "Aktif sekans degisti; islem durduruldu." }) };
  }
  return { seq: seq, hata: null };
}

function KS_multicamRazor(encoded) {
  try {
    var p = KS_arg(encoded); // { seqId, cuts:[{track,t}] }
    var d = KS_mcSekansDenetle(p);
    if (d.hata) return d.hata;
    var seq = d.seq;
    var cuts = p.cuts || [];
    var izler = [], gor = {}, i;
    for (i = 0; i < cuts.length; i++) {
      var k = String(Number(cuts[i].track));
      if (!gor[k]) { gor[k] = 1; izler.push(Number(cuts[i].track)); }
    }
    var h = izler.length ? KS_mcIzDenetle(seq, izler) : null;
    if (h) return KS_mcHata(h);

    app.enableQE();
    var qseq = qe.project.getActiveSequence();
    var kesilen = 0, atlanan = 0;
    for (i = 0; i < cuts.length; i++) {
      var ti = Number(cuts[i].track), t = Number(cuts[i].t);
      var tr = seq.videoTracks[ti], ic = false;
      // yalniz bir klibin icine dusen an kesilir (klip sinirinda ya da boslukta razor yok)
      for (var ci = 0; ci < tr.clips.numItems; ci++) {
        var cl = tr.clips[ci];
        if (t > Number(cl.start.seconds) + KS_MC_EPS && t < Number(cl.end.seconds) - KS_MC_EPS) { ic = true; break; }
      }
      if (!ic) { atlanan++; continue; }
      try { qseq.getVideoTrackAt(ti).razor(KS_timecode(t)); kesilen++; } catch (eR) { atlanan++; }
    }
    return KS_ok({ cuts: kesilen, skipped: atlanan });
  } catch (e) { return KS_err(e); }
}

// Ses kliplerinin aci/kapa durumu (bagli klip korumasi icin)
function KS_mcSesFoto(seq) {
  var foto = [];
  for (var ti = 0; ti < seq.audioTracks.numTracks; ti++) {
    var tr = seq.audioTracks[ti];
    for (var ci = 0; ci < tr.clips.numItems; ci++) {
      var cl = tr.clips[ci];
      var kapali = false;
      try { kapali = cl.disabled ? true : false; } catch (eD) {}
      foto.push({ cl: cl, s: Number(cl.start.seconds), e: Number(cl.end.seconds), d: kapali });
    }
  }
  return foto;
}

// Ses kliplerini fotograftaki duruma geri yukle; geri yuklenen sayisi
function KS_mcSesGeri(foto) {
  var n = 0;
  for (var i = 0; i < foto.length; i++) {
    var f = foto[i], suan = false;
    try { suan = f.cl.disabled ? true : false; } catch (eF) {}
    if (suan !== f.d) {
      try { f.cl.disabled = f.d; n++; } catch (eS) {}
    }
  }
  return n;
}

/*
 * Bag denemesi: ilk acik kamera klibi kapatilir ve geri okunur (TrackItem.disabled bu
 * Premiere'de yazilabiliyor mu), kapanan bagli ses geri acilinca video da geri aciliyor mu
 * (iki yonlu bag). Klip ve sesler eski haline getirilir. Hata: { kod, track, error } ya da null.
 */
function KS_mcBagDene(seq, camTracks) {
  var cl = null, ti = -1, i, ci;
  for (i = 0; i < camTracks.length && !cl; i++) {
    var tr = seq.videoTracks[Number(camTracks[i])];
    for (ci = 0; ci < tr.clips.numItems; ci++) {
      var k = tr.clips[ci], kapali = true;
      try { kapali = k.disabled ? true : false; } catch (eD) {}
      if (!kapali) { cl = k; ti = Number(camTracks[i]); break; }
    }
  }
  if (!cl) return null;
  var foto = KS_mcSesFoto(seq), sonuc = null, oku = false;
  try { cl.disabled = true; } catch (eW) {}
  try { oku = cl.disabled ? true : false; } catch (eR) {}
  if (!oku) {
    sonuc = { kod: "disabledApi", track: ti, error: "Bu Premiere surumunde klipler acilip kapatilamiyor (TrackItem.disabled)." };
  } else if (KS_mcSesGeri(foto)) {
    var v = false;
    try { v = cl.disabled ? true : false; } catch (eV) {}
    if (!v) sonuc = { kod: "linkedConflict", track: ti, error: "Kamera kliplerinin bagi sesle birlikte aciliyor/kapaniyor. Kamera kliplerinin baglantisini kopar (Ctrl+L)." };
  }
  try { cl.disabled = false; } catch (eG) {}
  KS_mcSesGeri(foto);
  return sonuc;
}

function KS_multicamEnable(encoded) {
  try {
    var p = KS_arg(encoded); // { seqId, plan:[{s,e,t}], camTracks:[...], from, to }
    var d = KS_mcSekansDenetle(p);
    if (d.hata) return d.hata;
    var seq = d.seq;
    var plan = p.plan || [];
    if (!plan.length) return KS_err("Kamera plani bos.");
    var h = KS_mcIzDenetle(seq, p.camTracks);
    if (h) return KS_mcHata(h);
    var from = (p.from === undefined || p.from === null) ? -1e9 : Number(p.from);
    var to = (p.to === undefined || p.to === null) ? 1e12 : Number(p.to);

    // BAGLI KLIP KORUMASI: video klibini kapatmak bagli sesini de kapatiyor olabilir
    // (dogrulanmamis davranis). Once tum ses kliplerinin durumu alinir, sonra geri yuklenir.
    var foto = KS_mcSesFoto(seq);
    var yazilan = [], degisen = 0, ayni = 0, basarisiz = 0, i, ci;
    for (i = 0; i < p.camTracks.length; i++) {
      var ti = Number(p.camTracks[i]);
      var tr = seq.videoTracks[ti];
      for (ci = 0; ci < tr.clips.numItems; ci++) {
        var cl = tr.clips[ci];
        var bas = Number(cl.start.seconds), son = Number(cl.end.seconds);
        var orta = (bas + son) / 2;
        if (orta < from || orta >= to) continue;
        var kapat = KS_mcIzAt(plan, orta) !== ti;
        var simdi = false;
        try { simdi = cl.disabled ? true : false; } catch (eG) {}
        if (simdi === kapat) { ayni++; continue; }   // degismeyen deger yeniden yazilmaz
        try { cl.disabled = kapat; } catch (eW) {}
        // geri oku: setter yoksa / yok sayiliyorsa yazma basarili sayilmaz
        var olan = simdi;
        try { olan = cl.disabled ? true : false; } catch (eO) {}
        if (olan === kapat) { degisen++; yazilan.push({ cl: cl, d: kapat }); } else basarisiz++;
      }
    }

    var geriYuklenen = KS_mcSesGeri(foto);
    if (basarisiz && !degisen) {
      return KJSON.stringify({ ok: false, kod: "disabledApi", failed: basarisiz, linkedRestored: geriYuklenen,
        error: "Bu Premiere surumunde klipler acilip kapatilamiyor (TrackItem.disabled)." });
    }
    if (geriYuklenen) {
      // ses geri yuklenince video da geri dondu mu? (iki yonlu bag) — o zaman calisamayiz
      for (i = 0; i < yazilan.length; i++) {
        var v = false;
        try { v = yazilan[i].cl.disabled ? true : false; } catch (eV) {}
        if (v !== yazilan[i].d) {
          return KJSON.stringify({ ok: false, kod: "linkedConflict", linkedRestored: geriYuklenen,
            error: "Kamera kliplerinin bagi sesle birlikte aciliyor/kapaniyor. Kamera kliplerinin baglantisini kopar (Ctrl+L)." });
        }
      }
    }
    return KS_ok({ changed: degisen, unchanged: ayni, failed: basarisiz, linkedRestored: geriYuklenen });
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

/*
 * YouTube bolumleri: her marker kendi basligiyla, mumkunse "Chapter" turunde.
 * p.chapters = [{ time: sn, name: "Baslik" }]; p.replace: once eski Suflo
 * bolum marker'larini sil (yorumu "Suflo bolum" olanlar).
 */
function KS_addChapterMarkers(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var list = p.chapters || [];
    if (!list.length) return KS_err("Bolum yok.");
    var silinen = 0;
    if (p.replace) {
      try {
        var eski = [];
        var mk = seq.markers.getFirstMarker();
        while (mk) {
          if (String(mk.comments || "") === "Suflo bolum") eski.push(mk);
          mk = seq.markers.getNextMarker(mk);
        }
        for (var e = 0; e < eski.length; e++) {
          try { seq.markers.deleteMarker(eski[e]); silinen++; } catch (eD) {}
        }
      } catch (eR) {}
    }
    var n = 0, chapterTuru = 0;
    for (var i = 0; i < list.length; i++) {
      try {
        var m = seq.markers.createMarker(Number(list[i].time));
        if (!m) continue;
        try { m.name = String(list[i].name || ""); } catch (eN) {}
        try { m.comments = "Suflo bolum"; } catch (eC) {}
        try { m.setTypeAsChapter(); chapterTuru++; } catch (eT) {}
        n++;
      } catch (eM) {}
    }
    if (n === 0) return KS_err("Hicbir marker eklenemedi.");
    return KS_ok({ added: n, chapterType: chapterTuru, removed: silinen });
  } catch (e) { return KS_err(e); }
}

/*
 * Viral anlar (Shorts): sureli marker. p.ranges = [{start, end, name, comment}];
 * p.replace: once eski Suflo viral marker'larini sil (yorumu "Suflo viral" ile baslayan).
 */
function KS_addRangeMarkers(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var list = p.ranges || [];
    if (!list.length) return KS_err("Aralik yok.");
    // etiket: yorum oneki (tekrar eklemede yalniz bu onekli marker'lar yenilenir); renk: marker renk indeksi
    var etiket = String(p.etiket || "Suflo viral");
    var renk = (typeof p.renk === "number" && p.renk >= 0 && p.renk <= 7) ? p.renk : 1;
    var silinen = 0;
    if (p.replace) {
      try {
        var eski = [];
        var mk = seq.markers.getFirstMarker();
        while (mk) {
          if (String(mk.comments || "").indexOf(etiket + ":") === 0) eski.push(mk);
          mk = seq.markers.getNextMarker(mk);
        }
        for (var e = 0; e < eski.length; e++) { try { seq.markers.deleteMarker(eski[e]); silinen++; } catch (eD) {} }
      } catch (eR) {}
    }
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      try {
        var m = seq.markers.createMarker(Number(list[i].start));
        if (!m) continue;
        try { m.name = String(list[i].name || ""); } catch (eN) {}
        try { m.comments = etiket + ": " + String(list[i].comment || ""); } catch (eC) {}
        // Marker.end SANIYE (sayi) alir: Premiere 26.5'te Time nesnesi "Illegal Parameter
        // type" atiyordu ve marker'lar suresiz kaliyordu. Time yalniz yedek.
        try { m.end = Number(list[i].end); } catch (eE) {
          try { var son = new Time(); son.seconds = Number(list[i].end); m.end = son; } catch (eE2) {}
        }
        try { if (m.setColorByIndex) m.setColorByIndex(renk); } catch (eK) {}   // viral: kirmizi, b-roll: yesil
        n++;
      } catch (eM) {}
    }
    if (n === 0) return KS_err("Hicbir marker eklenemedi.");
    return KS_ok({ added: n, removed: silinen });
  } catch (e) { return KS_err(e); }
}

/*
 * Suflo Doctor: 3.0 ozelliklerinin dayandigi Premiere API'leri bu kurulumda var mi?
 * Projeye DOKUNMAZ (yalniz typeof / ozellik okuma). Aktif sekans yoksa sekans
 * API'leri "bilinmiyor" (null) doner.
 */
function KS_apiProbe() {
  var out = { app: "", seq: false, subsequence: null, autoReframe: null, qe: false, qeAddTracks: null,
    markers: null, trackItemDisabled: null, trackMuted: null, seqFromClips: null };
  try { out.app = String(app.version); } catch (eV) {}
  // Rehberin ornek klibi icin (KS_importSample): yalniz typeof — ASLA cagrilmaz
  try { out.seqFromClips = !!(app.project && typeof app.project.createNewSequenceFromClips === "function"); } catch (eF) { out.seqFromClips = false; }
  var seq = null;
  try { seq = KS_seq(); } catch (eS) {}
  if (seq) {
    out.seq = true;
    try { out.subsequence = typeof seq.createSubsequence === "function"; } catch (e1) { out.subsequence = false; }
    try { out.autoReframe = typeof seq.autoReframeSequence === "function"; } catch (e2) { out.autoReframe = false; }
    try { out.markers = !!(seq.markers && typeof seq.markers.createMarker === "function"); } catch (e3) { out.markers = false; }
    try {
      var bulundu = false;
      for (var t = 0; t < seq.audioTracks.numTracks && !bulundu; t++) {
        var tr = seq.audioTracks[t];
        if (out.trackMuted === null) out.trackMuted = typeof tr.isMuted === "function";
        if (tr.clips.numItems > 0) { out.trackItemDisabled = typeof tr.clips[0].disabled === "boolean"; bulundu = true; }
      }
    } catch (e4) {}
  }
  // Hiz Rampasi (3.2): yalniz typeof / ozellik okuma. setSpeed, setReverse ve diger QE yazicilari
  // ASLA cagrilmaz; QE ogesinin .reverse ozelligi OKUNMAZ (ikisi de 26.3.2'de betigi oldurur).
  out.speedRead = null; out.qeSetSpeed = null; out.qeTimeInterp = null; out.qeFrameBlend = null; out.interp = null;
  out.qeUndoIndex = null; out.unlinkSelection = null; out.linkSelection = null; out.timeRemapApi = null;
  var vIz = -1, vKlip = null;
  if (seq) {
    try { out.unlinkSelection = typeof seq.unlinkSelection === "function"; } catch (e5) { out.unlinkSelection = false; }
    try { out.linkSelection = typeof seq.linkSelection === "function"; } catch (e6) { out.linkSelection = false; }
    try {
      for (var vt = 0; vt < seq.videoTracks.numTracks; vt++) {
        var vtr = seq.videoTracks[vt];
        if (vtr.clips.numItems > 0) { vIz = vt; vKlip = vtr.clips[0]; break; }
      }
    } catch (e7) {}
    if (vKlip) {
      try { out.speedRead = typeof vKlip.getSpeed === "function"; } catch (e8) { out.speedRead = false; }
      // Bilgi amacli: bir gun Zaman Yeniden Esleme bileseni DOM'a acilirsa (Katman 3)
      out.timeRemapApi = false;
      try {
        var bil = vKlip.components;
        for (var bi = 0; bi < bil.numItems; bi++) {
          var bad = "";
          try { bad = String(bil[bi].matchName || "") + " " + String(bil[bi].displayName || ""); } catch (e9) {}
          if (/time ?remap|zaman yeniden e[s\u015f]leme|remapeamento|velocidade/i.test(bad)) { out.timeRemapApi = true; break; }
        }
      } catch (e10) {}
    }
  }
  try {
    app.enableQE();
    out.qe = typeof qe !== "undefined" && !!qe.project;
    if (out.qe && seq) {
      var q = qe.project.getActiveSequence();
      out.qeAddTracks = !!(q && typeof q.addTracks === "function");
      if (vIz >= 0) {
        var qOge = null;
        try {
          var qIz = q && typeof q.getVideoTrackAt === "function" ? q.getVideoTrackAt(vIz) : null;
          var qn = qIz ? Number(qIz.numItems) || 0 : 0;
          for (var qj = 0; qj < qn; qj++) {
            var aday = qIz.getItemAt(qj);
            var tur = "";
            try { tur = String(aday.type); } catch (eT) {}
            if (aday && tur !== "Empty") { qOge = aday; break; }
          }
        } catch (eO) {}
        if (qOge) {
          out.qeSetSpeed = typeof qOge.setSpeed === "function";
          out.qeTimeInterp = typeof qOge.setTimeInterpolationType === "function";
          out.qeFrameBlend = typeof qOge.setFrameBlend === "function";
        }
      }
    }
    if (out.qe) { try { out.qeUndoIndex = typeof qe.project.undoStackIndex === "function"; } catch (eU) { out.qeUndoIndex = false; } }
  } catch (eQ) { out.qe = false; }
  if (!out.qe) { out.qeSetSpeed = false; out.qeTimeInterp = false; out.qeFrameBlend = false; out.qeUndoIndex = false; }
  if (out.qeTimeInterp !== null || out.qeFrameBlend !== null) out.interp = !!(out.qeTimeInterp || out.qeFrameBlend);
  // Egri (3.4): anahtar kare ara degerlemesi (ComponentParam.setInterpolationTypeAtKey). 'interp'ten
  // ayri: o QE'nin ZAMAN ara degerlemesi. Yalniz typeof; ASLA cagrilmaz. Secili klibin (yoksa ilk video
  // klibin) Hareket bilesenindeki ilk ozellige bakilir; klip yoksa bilinmiyor (null).
  out.kfInterp = null;
  if (seq) {
    var kfAday = [];
    try {
      var kfSecim = seq.getSelection();
      for (var ks = 0; kfSecim && ks < kfSecim.length && ks < 8; ks++) {
        var kfTur = "";
        try { kfTur = String(kfSecim[ks].mediaType || ""); } catch (eMt) {}
        if (kfTur !== "Audio") kfAday.push(kfSecim[ks]);
      }
    } catch (eKs) {}
    if (vKlip) kfAday.push(vKlip);
    for (var ka = 0; ka < kfAday.length && out.kfInterp === null; ka++) out.kfInterp = KS_easeInterpVar(kfAday[ka]);
  }
  return KS_ok(out);
}

/* ---------- Ilk acilis rehberi: ornek klibi projeye al ---------- */

// Sekansta medyasi verilen yol olan ilk video klip ({ clip, start }) ya da null
function KS_sampleClipIn(seq, mediaPath) {
  var hedef = String(mediaPath).toLowerCase();
  try {
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var tr = seq.videoTracks[t];
      for (var c = 0; c < tr.clips.numItems; c++) {
        var cl = tr.clips[c];
        try {
          if (cl.projectItem && String(cl.projectItem.getMediaPath()).toLowerCase() === hedef) {
            var bas = 0;
            try { bas = Number(cl.start.seconds) || 0; } catch (eS) {}
            return { clip: cl, start: bas };
          }
        } catch (eC) {}
      }
    }
  } catch (eT) {}
  return null;
}

/*
 * Rehberin "Ornekte dene" adimi. p: { path, seqName }
 *   1) acik proje ve var olan dosya sart
 *   2) "Suflo Ornek" kutusu
 *   3) ayni medya zaten projedeyse o oge yeniden kullanilir, yoksa importFiles
 *   4) ayni adli ("Suflo Deneme") sekans varsa o kullanilir
 *   5) yoksa createNewSequenceFromClips (typeof ile) — donus degerine GUVENILMEZ:
 *      once/sonra sequenceID farkiyla yeni sekans bulunur (KS_cloneActiveSeq gibi)
 *   6) sekans aktiflestirilir ve DOGRULANIR, klip secilir
 * Doner: { imported, sequenceId, created, reused, needsDrag, active, selected, offset }
 * API yoksa yalniz ice alir, needsDrag:true doner: panel "Klibi Yeni Oge simgesine
 * surukle" der.
 */
function KS_importSample(encoded) {
  try {
    var p = KS_arg(encoded);
    if (!app.project || !app.project.rootItem) return KS_errKod("proje-yok", "Acik proje yok. Once bir proje ac ya da yeni proje olustur.");
    var yol = String(p.path || "");
    if (!yol) return KS_errKod("yol-yok", "Ornek klip yolu verilmedi.");
    var dosya = new File(yol);
    if (!dosya.exists) return KS_errKod("dosya-yok", "Ornek klip bulunamadi: " + yol);
    var seqAdi = String(p.seqName || "Suflo Deneme").replace(/[\r\n\t]+/g, " ").substring(0, 60);
    var i, s;

    var kutu = KS_findBin("Suflo Ornek");
    var oge = null, iceAlindi = false;
    try {
      if (typeof app.project.rootItem.findItemsMatchingMediaPath === "function") {
        var esler = app.project.rootItem.findItemsMatchingMediaPath(yol, 1);
        if (esler && esler.length) oge = esler[0];
      }
    } catch (eF) {}
    if (!oge) oge = KS_findItemByPath(app.project.rootItem, yol);
    if (!oge) {
      app.project.importFiles([yol], true, kutu, false);
      oge = KS_findItemByPath(kutu, yol) || KS_findItemByPath(app.project.rootItem, yol);
      iceAlindi = true;
    }
    if (!oge) return KS_errKod("ice-alinamadi", "Ornek klip projeye alinamadi.");

    var seq = null;
    for (i = 0; i < app.project.sequences.numSequences; i++) {
      s = app.project.sequences[i];
      if (s && String(s.name) === seqAdi) { seq = s; break; }
    }
    var olusturuldu = false, yeniden = !!seq;
    if (!seq) {
      if (typeof app.project.createNewSequenceFromClips !== "function") {
        return KS_ok({ imported: iceAlindi, sequenceId: "", created: false, reused: false, needsDrag: true, active: false, selected: false, offset: 0 });
      }
      var once = {};
      for (i = 0; i < app.project.sequences.numSequences; i++) {
        once[String(app.project.sequences[i].sequenceID)] = 1;
      }
      try { app.project.createNewSequenceFromClips(seqAdi, [oge], kutu); } catch (eYeni) {}
      for (i = 0; i < app.project.sequences.numSequences; i++) {
        s = app.project.sequences[i];
        if (!once[String(s.sequenceID)]) { seq = s; break; }
      }
      if (!seq) {
        return KS_ok({ imported: iceAlindi, sequenceId: "", created: false, reused: false, needsDrag: true, active: false, selected: false, offset: 0 });
      }
      olusturuldu = true;
      try { if (String(seq.name) !== seqAdi) seq.name = seqAdi; } catch (eAd) {}
    }

    // Aktiflestirme sessizce basarisiz olabilir (modal pencere): kimligi dogrula
    try { app.project.activeSequence = seq; } catch (e1) {}
    var act = KS_seq();
    if (!act || String(act.sequenceID) !== String(seq.sequenceID)) {
      try { app.project.openSequence(seq.sequenceID); } catch (e2) {}
      act = KS_seq();
    }
    var aktif = !!(act && String(act.sequenceID) === String(seq.sequenceID));

    var secildi = false, offset = 0;
    var bulunan = KS_sampleClipIn(seq, yol);
    if (bulunan) {
      offset = bulunan.start;
      if (aktif) {
        try { bulunan.clip.setSelected(true, true); secildi = true; } catch (eSec) {}
      }
    }
    return KS_ok({ imported: iceAlindi, sequenceId: String(seq.sequenceID), created: olusturuldu, reused: yeniden,
      needsDrag: !bulunan && !olusturuldu, active: aktif, selected: secildi, offset: offset });
  } catch (e) { return KS_err(e); }
}

/* ---------- YouTube indirici (3.3): indirilen dosyayi projeye al ---------- */

/*
 * ExtendScript File yolu URI gibi cozer: "%50" -> "P", "%20" -> bosluk. Indirilen dosyanin adi YouTube
 * basligindan gelir ("Fiyatlar %50 dustu [id] 1080p.mp4"); duz yolla File baska bir (olmayan) dosyayi
 * gosterir. Once yol oldugu gibi, tutmazsa "%" kacirilarak ("%25") denenir. Panel dosyanin varligini
 * Node ile zaten dogruladi; burasi yalniz yanlis yolla ice almamak icin.
 */
function KS_downloadedExists(yol) {
  var y = String(yol || "");
  if (!y) return false;
  try { if ((new File(y)).exists) return true; } catch (e1) {}
  if (y.indexOf("%") !== -1) {
    try { if ((new File(y.replace(/%/g, "%25"))).exists) return true; } catch (e2) {}
  }
  return false;
}

/*
 * p: { path, bin } — bin: kokteki kutunun adi (panel verir; varsayilan "Suflo Indirilenler").
 *   1) acik proje ve var olan dosya sart (adinda "%" olan dosya: KS_downloadedExists)
 *   2) ayni medya projede zaten varsa yeniden ALINMAZ (reused) — ikinci indirmede kopya oge olmaz
 *   3) yoksa kutuya importFiles; oge yoluyla bulunur, bulunamazsa (macOS'ta Unicode yol bicimi
 *      farki) kutuya yeni eklenen son oge alinir
 *   4) Proje panelinde secmek ucuzsa denenir (select yoksa ya da hata verirse sessizce gecilir)
 * Timeline'a, sekanslara ve playhead'e DOKUNULMAZ.
 * Doner: { imported, reused, selected, bin, name }
 */
function KS_importDownloaded(encoded) {
  try {
    var p = KS_arg(encoded);
    if (!app.project || !app.project.rootItem) return KS_errKod("proje-yok", "Acik proje yok. Once bir proje ac ya da yeni proje olustur.");
    var yol = String(p.path || "");
    if (!yol) return KS_errKod("yol-yok", "Dosya yolu verilmedi.");
    if (!KS_downloadedExists(yol)) return KS_errKod("dosya-yok", "Indirilen dosya bulunamadi: " + yol);
    var kutuAdi = String(p.bin || "Suflo \u0130ndirilenler").replace(/[\r\n\t]+/g, " ").substring(0, 80);

    var oge = null;
    try {
      if (typeof app.project.rootItem.findItemsMatchingMediaPath === "function") {
        var esler = app.project.rootItem.findItemsMatchingMediaPath(yol, 1);
        if (esler && esler.length) oge = esler[0];
      }
    } catch (eF) {}
    if (!oge) oge = KS_findItemByPath(app.project.rootItem, yol);
    var yeniden = !!oge;

    if (!oge) {
      var kutu = KS_findBin(kutuAdi);
      var once = 0;
      try { once = kutu.children.numItems; } catch (eS) {}
      app.project.importFiles([yol], true, kutu, false);
      oge = KS_findItemByPath(kutu, yol) || KS_findItemByPath(app.project.rootItem, yol);
      if (!oge) {
        try { if (kutu.children.numItems > once) oge = kutu.children[kutu.children.numItems - 1]; } catch (eY) {}
      }
    }
    if (!oge) return KS_errKod("ice-alinamadi", "Dosya projeye alinamadi. Premiere bu bicimi acamiyor olabilir.");

    var secildi = false;
    try {
      if (typeof oge.select === "function") { oge.select(); secildi = true; }
    } catch (eSec) {}
    var ad = "";
    try { ad = String(oge.name || ""); } catch (eAd) {}
    return KS_ok({ imported: !yeniden, reused: yeniden, selected: secildi, bin: kutuAdi, name: ad });
  } catch (e) { return KS_err(e); }
}

// Sekansin In/Out'unu verilen araliga ayarla ve playhead'i basa getir
function KS_setInOut(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var a = Number(p.start), b = Number(p.end);
    if (!(b > a)) return KS_err("Gecersiz aralik.");
    seq.setInPoint(a);
    seq.setOutPoint(b);
    try {
      var t = new Time(); t.seconds = a;
      seq.setPlayerPosition(t.ticks);
    } catch (eP) {}
    return KS_ok({ start: a, end: b });
  } catch (e) { return KS_err(e); }
}

/*
 * Viral anlardan Shorts sekanslari: her aralik icin alt sekans (createSubsequence,
 * tum izler), istenirse Premiere Auto Reframe ile 9:16 kopyasi. Sekanslar
 * "Suflo Shorts" kutusuna gider; orijinal sekansin In/Out'u ve aktifligi geri yuklenir.
 *   p.ranges: [{ start, end, name }]   p.dikey: true -> 9:16 Auto Reframe
 */
function KS_makeShorts(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    // p.sourceId (Shorts paketi): alt sekans YALNIZ kaynak sekanstan; etkin olan bir Short ise
    // once kaynak acilir, acilamazsa reddedilir (Short'un alt sekansi olusmasin)
    if (p.sourceId && (!seq || String(seq.sequenceID) !== String(p.sourceId))) {
      seq = KS_activateSeq(p.sourceId);
      if (!seq) return KS_err("Kaynak sekans acilamadi; Shorts olusturulmadi.");
    }
    if (!seq) return KS_err("Aktif sequence yok.");
    var ranges = p.ranges || [];
    if (!ranges.length) return KS_err("Aralik yok.");
    if (typeof seq.createSubsequence !== "function") return KS_err("Bu Premiere surumu alt sekans olusturmayi desteklemiyor.");
    var eskiIn = null, eskiOut = null, sonSn = 0;
    try { eskiIn = seq.getInPointAsTime().seconds; } catch (eI0) {}
    try { eskiOut = seq.getOutPointAsTime().seconds; } catch (eO0) {}
    try { sonSn = Number(seq.end) / KS_TPS; } catch (eE) {}
    if (!(sonSn > 0)) sonSn = 1e6;
    var kutu = null;
    try { kutu = KS_findBin("Suflo Shorts"); } catch (eB) {}
    var yapilan = [], hatalar = [], dikeySayisi = 0;
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i];
      var a = Number(r.start), b = Number(r.end);
      var ad = String(r.name || ("Shorts " + (i + 1))).replace(/[\r\n\t]+/g, " ").substring(0, 70);
      if (!(b > a)) { hatalar.push(ad + ": gecersiz aralik"); continue; }
      try {
        // createSubsequence/autoReframe yeni sekansi acabilir: her turda asil sekans aktif
        try { app.project.activeSequence = seq; } catch (eAk) {}
        // Out once sona: yeni In eski Out'tan sonra gelirse Premiere In>Out'u reddedebilir
        seq.setOutPoint(sonSn);
        seq.setInPoint(a);
        seq.setOutPoint(b);
        var alt = null;
        try { alt = seq.createSubsequence(true); } catch (eCs) {}
        // bazi surumler argumani kabul etmez: varsayilan (iz hedeflemesi) ile tekrar dene
        if (!alt) { try { alt = seq.createSubsequence(); } catch (eCs2) {} }
        if (!alt) { hatalar.push(ad + ": alt sekans olusmadi"); continue; }
        try { alt.name = ad; } catch (eN) {}
        try { if (kutu && alt.projectItem) alt.projectItem.moveBin(kutu); } catch (eM) {}
        var kayit = { name: ad, id: String(alt.sequenceID), dikey: false };
        if (p.dikey) {
          try {
            var dik = typeof alt.autoReframeSequence === "function" ?
              alt.autoReframeSequence(9, 16, "default", ad + " 9x16", false) : null;
            if (dik) {
              kayit.dikey = true; dikeySayisi++;
              try { kayit.dikeyId = String(dik.sequenceID); } catch (eDi) {}
              try { if (kutu && dik.projectItem) dik.projectItem.moveBin(kutu); } catch (eM2) {}
            } else hatalar.push(ad + ": 9:16 olusmadi (Auto Reframe yok)");
          } catch (eR) { hatalar.push(ad + ": 9:16 olusmadi (" + eR + ")"); }
        }
        yapilan.push(kayit);
      } catch (eS) { hatalar.push(ad + ": " + eS); }
    }
    // orijinal sekansa don, In/Out'u geri yukle
    try { app.project.activeSequence = seq; } catch (eA) {}
    try { if (String(KS_seq().sequenceID) !== String(seq.sequenceID)) app.project.openSequence(seq.sequenceID); } catch (eO) {}
    // In/Out geri yukle: ayri ayri (biri hata verirse digeri yine yuklensin);
    // negatif/bos In 0'a, bos Out sekans sonuna doner. Out once sona: In>Out olmasin.
    try { seq.setOutPoint(sonSn); } catch (eG0) {}
    try { seq.setInPoint(eskiIn !== null && eskiIn > 0 ? eskiIn : 0); } catch (eG1) {}
    try { seq.setOutPoint(eskiOut !== null && eskiOut > 0 && eskiOut < sonSn ? eskiOut : sonSn); } catch (eG2) {}
    if (!yapilan.length) return KS_err(hatalar.join("; ") || "Sekans olusturulamadi.");
    return KS_ok({ made: yapilan.length, vertical: dikeySayisi, items: yapilan, errors: hatalar });
  } catch (e) { return KS_err(e); }
}

/* ---------- Tek Tik Shorts Paketi: sekans kimligiyle calisma ---------- */

var KS_PAKET_ONEKI = "Suflo Paket \u00B7";

// Projedeki sekans (kimlikle) ya da null
function KS_seqById(id) {
  var hedef = String(id || "");
  if (!hedef) return null;
  try {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      var s = app.project.sequences[i];
      if (String(s.sequenceID) === hedef) return s;
    }
  } catch (e) {}
  return null;
}

// Sekansi etkin yap (activeSequence, olmazsa openSequence) ve dogrula: etkin sekans ya da null
function KS_activateSeq(id) {
  var hedef = String(id || "");
  var s = KS_seqById(hedef);
  if (!s) return null;
  var a = null;
  try { a = KS_seq(); } catch (e0) {}
  if (a && String(a.sequenceID) === hedef) return a;
  try { app.project.activeSequence = s; } catch (e1) {}
  try { a = KS_seq(); } catch (e2) { a = null; }
  if (!a || String(a.sequenceID) !== hedef) {
    try { app.project.openSequence(hedef); } catch (e3) {}
    try { a = KS_seq(); } catch (e4) { a = null; }
  }
  return a && String(a.sequenceID) === hedef ? a : null;
}

function KS_basliyor(metin, onek) {
  return String(metin || "").substring(0, onek.length) === onek;
}

// Video izlerindeki "Suflo Paket ·" adli kliplerin adlari (devamda konmus katmanlar tanınir)
function KS_paketKatmanlari(seq) {
  var out = [];
  try {
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var tr = seq.videoTracks[t];
      for (var c = 0; c < tr.clips.numItems; c++) {
        var ad = "";
        try { ad = String(tr.clips[c].name); } catch (eA) {}
        if (KS_basliyor(ad, KS_PAKET_ONEKI)) out.push(ad);
      }
    }
  } catch (e) {}
  return out;
}

/*
 * Sekansi kimligiyle ac ve dogrula. Doner: { id, name, width, height, end, fps,
 * paket: ["Suflo Paket · …" klip adlari] } — yaniti kaybolan bir adimin koydugu katman
 * devam ederken tekrar konmasin.
 */
function KS_openSequenceById(encoded) {
  try {
    var p = KS_arg(encoded);
    if (!p.id) return KS_err("Sekans kimligi yok.");
    if (!KS_seqById(p.id)) return KS_err("Sekans projede bulunamadi (silinmis olabilir).");
    var seq = KS_activateSeq(p.id);
    if (!seq) return KS_err("Sekans acilamadi.");
    var st = null;
    try { st = seq.getSettings(); } catch (eS) {}
    var son = 0;
    try { son = Number(seq.end) / KS_TPS; } catch (eE) {}
    return KS_ok({
      id: String(seq.sequenceID), name: String(seq.name),
      width: st ? Number(st.videoFrameWidth) : 0, height: st ? Number(st.videoFrameHeight) : 0,
      end: son, fps: KS_fps(seq), paket: KS_paketKatmanlari(seq)
    });
  } catch (e) { return KS_err(e); }
}

/*
 * Adiyla sekans (en son olusturulani). 600 sn'lik KS_makeShorts cagrisi zaman asimina
 * ugrasa da Auto Reframe bitmis olabilir: panel kimligi buradan geri alir.
 * p.haric: bilinen kimlikler (baska Short'a ait olani alma).
 * Doner: { id, name, count, ids } — ids: eslesen tum kimlikler (proje sirasiyla)
 */
function KS_findSequenceByName(encoded) {
  try {
    var p = KS_arg(encoded);
    var ad = String(p.name || "");
    if (!ad) return KS_err("Sekans adi yok.");
    var haric = {};
    var liste = p.haric || [];
    for (var h = 0; h < liste.length; h++) haric[String(liste[h])] = 1;
    var bulunan = null, n = 0, ids = [];
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      var s = app.project.sequences[i];
      if (String(s.name) !== ad || haric[String(s.sequenceID)]) continue;
      bulunan = s; n++;
      ids.push(String(s.sequenceID));
    }
    return KS_ok({ id: bulunan ? String(bulunan.sequenceID) : "", name: ad, count: n, ids: ids });
  } catch (e) { return KS_err(e); }
}

/*
 * Short'a kaynaktan miras kalan Suflo katmanlari. createSubsequence tum izleri kopyalar:
 * kaynaktaki altyazi katmani Short'ta da vardir (ve Auto Reframe onu da kirpar). Ada ve
 * "Suflo Altyazi" kutusuna gore sayilir; paketin kendi katmanlari ("Suflo Paket ·") ayri.
 * Premiere'in kendi altyazi izi buradan gorulemez (panel yalniz uyarir).
 * Doner: { altyazi, kanca, paket, toplam }
 */
function KS_sufloSinifi(cl) {
  var ad = "", dosya = "", kutu = false;
  try { ad = String(cl.name); } catch (eA) {}
  try { dosya = String(cl.projectItem.getMediaPath()).replace(/\\/g, "/"); dosya = dosya.substring(dosya.lastIndexOf("/") + 1).toLowerCase(); } catch (eM) {}
  try { kutu = String(cl.projectItem.treePath).replace(/\\/g, "/").indexOf("/" + KS_OVERLAY_BIN + "/") !== -1; } catch (eT) {}
  if (KS_basliyor(ad, KS_PAKET_ONEKI)) return "paket";
  if (KS_basliyor(ad, "Suflo Kanca") || /^suflo-(temiz-)?kanca-/.test(dosya)) return "kanca";
  if (KS_basliyor(ad, "Suflo Stil") || KS_basliyor(ad, "Suflo Altyazi") || /^suflo-(temiz-)?altyazi-/.test(dosya) || kutu) return "altyazi";
  return "";
}

function KS_sequenceSufloLayers(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = p.id ? KS_seqById(p.id) : KS_seq();
    if (!seq) return KS_err("Sekans projede bulunamadi (silinmis olabilir).");
    var out = { altyazi: 0, kanca: 0, paket: 0, toplam: 0 };
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var tr = seq.videoTracks[t];
      for (var c = 0; c < tr.clips.numItems; c++) {
        var sinif = KS_sufloSinifi(tr.clips[c]);
        if (sinif === "paket") out.paket++;
        else if (sinif) { out[sinif]++; out.toplam++; }
      }
    }
    return KS_ok(out);
  } catch (e) { return KS_err(e); }
}

/*
 * 9:16 Short'a kaynaktan miras kalan altyazi katmanlarini kapat (trackItem.disabled): kaynagin
 * 16:9 seffaf katmani Auto Reframe'de kirpilir; paket yerine Short boyunda yenisini koyar.
 * Klip silinmez (kullanici geri acabilir). Doner: { altyazi, kapatilan }
 */
function KS_disableSufloCaptions(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = p.id ? KS_seqById(p.id) : null;
    if (!seq) return KS_err("Sekans projede bulunamadi (silinmis olabilir).");
    var out = { altyazi: 0, kapatilan: 0 };
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var tr = seq.videoTracks[t];
      for (var c = 0; c < tr.clips.numItems; c++) {
        var cl = tr.clips[c];
        if (KS_sufloSinifi(cl) !== "altyazi") continue;
        out.altyazi++;
        var kapali = false;
        try { if (cl.disabled === true) kapali = true; } catch (e0) {}
        if (!kapali) {
          try { cl.disabled = true; } catch (e1) {}
          try { kapali = cl.disabled === true; } catch (e2) { kapali = false; }
        }
        if (kapali) out.kapatilan++;
      }
    }
    return KS_ok(out);
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

/* ---------- Stil Katmani: yerel MOGRT altyazi sablonlari ---------- */

function KS_captionMogrtTextProp(component) {
  if (!component || !component.properties) return null;
  var props = component.properties;
  var names = ["Text", "Source Text", "Edit Text 01 - Text", "Title", "Subtitle"];
  if (props.getParamForDisplayName) {
    for (var ni = 0; ni < names.length; ni++) {
      try {
        var byName = props.getParamForDisplayName(names[ni]);
        if (byName) return byName;
      } catch (eName) {}
    }
  }
  var count = 0;
  try { count = Number(props.numItems) || Number(props.numProperties) || 0; } catch (eCount) {}
  for (var i = 0; i < count; i++) {
    var prop = props[i];
    var display = "";
    try { display = String(prop.displayName || ""); } catch (eDisplay) {}
    if (/(?:^|\s)(?:source\s+)?text(?:$|\s)|altyaz|subtitle|title/i.test(display)) return prop;
    // AE MOGRT metin kontrolleri getValue() ile JSON metin belgesi verir.
    try {
      var raw = prop.getValue();
      if (typeof raw === "string" && /"(?:textEditValue|mTextParam)"\s*:/.test(raw)) return prop;
    } catch (eValue) {}
  }
  return null;
}

function KS_captionMogrtTextFromValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return String(value);
  if (!/^\s*\{/.test(value)) return value;
  try {
    var obj = KJSON.parse(value);
    if (obj.textEditValue !== undefined) return String(obj.textEditValue);
    if (obj.mTextParam !== undefined) return String(obj.mTextParam);
    if (obj.value && obj.value.strDB && obj.value.strDB.length) return String(obj.value.strDB[0].str || "");
  } catch (e) {}
  return value;
}

function KS_captionMogrtSetText(prop, text) {
  if (!prop) return false;
  var raw = null;
  try { raw = prop.getValue(); } catch (eGet) {}
  var value = String(text || "").replace(/\r?\n/g, "\r");
  var payload = value;
  if (typeof raw === "string" && /^\s*\{/.test(raw)) {
    try {
      var obj = KJSON.parse(raw);
      if (obj.textEditValue !== undefined) obj.textEditValue = value;
      else if (obj.mTextParam !== undefined) obj.mTextParam = value;
      else obj.textEditValue = value;
      if (obj.fontTextRunLength !== undefined) obj.fontTextRunLength = [value.length];
      if (obj.fontTextRunStart !== undefined) obj.fontTextRunStart = [0];
      payload = KJSON.stringify(obj);
    } catch (eJson) { payload = value; }
  }
  try { prop.setValue(payload, true); } catch (eSet) { return false; }
  try { if (typeof $ !== "undefined" && $.sleep) $.sleep(45); } catch (eSleep) {}
  try {
    var actual = KS_captionMogrtTextFromValue(prop.getValue());
    return String(actual).replace(/\r?\n/g, "\r") === value;
  } catch (eVerify) { return true; }
}

function KS_prepareCaptionMogrt(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var f = new File(String(p.path || ""));
    if (!f.exists || !/\.mogrt$/i.test(f.name)) return KS_err("Altyazi MOGRT sablonu bulunamadi.");
    var start = Math.max(0, Number(p.start) || 0);
    var end = Math.max(start + .05, Number(p.end) || start + .05);
    var idx = KS_findFreeVideoTrack(seq, start, end);
    var yeni = false;
    if (idx < 0 && KS_addTopVideoTrack()) {
      seq = app.project.activeSequence;
      idx = KS_findFreeVideoTrack(seq, start, end);
      yeni = idx >= 0;
    }
    if (idx < 0) return KS_err("Altyazilar icin bos video katmani acilamadi.");
    return KS_ok({ track: idx, trackName: "V" + (idx + 1), newTrack: yeni });
  } catch (e) { return KS_err(e); }
}

function KS_placeCaptionMogrt(encoded) {
  var clip = null;
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var f = new File(String(p.path || ""));
    if (!f.exists) return KS_err("Altyazi MOGRT sablonu bulunamadi.");
    var track = Number(p.track);
    if (!isFinite(track) || track < 0 || track >= seq.videoTracks.numTracks) return KS_err("Altyazi video katmani bulunamadi.");
    var start = Math.max(0, Number(p.start) || 0);
    var end = Math.max(start + .05, Number(p.end) || start + .05);
    if (!KS_trackFreeIn(seq.videoTracks[track], start, end)) return KS_err("Altyazi katmaninda bu zaman araligi dolu.");

    var at = new Time();
    at.seconds = start;
    try { clip = seq.importMGT(f.fsName, at.ticks, track, 0); } catch (eImport) {}
    if (!clip) return KS_err("MOGRT timeline'a yerlestirilemedi.");

    var batch = String(p.batch || "").replace(/[^a-z0-9_-]/ig, "").slice(0, 40);
    try { clip.name = "Suflo Caption · " + batch; } catch (eName) {}
    var component = null;
    for (var wait = 0; wait < 8 && !component; wait++) {
      try { component = clip.getMGTComponent(); } catch (eMgt) {}
      if (!component) try { if (typeof $ !== "undefined" && $.sleep) $.sleep(55); } catch (eWait) {}
    }
    if (!component) throw new Error("Bu sablonun duzenlenebilir metin kontrolu Premiere'e acilmadi.");
    var textProp = KS_captionMogrtTextProp(component);
    if (!textProp) throw new Error("Sablonda 'Text' kontrolu bulunamadi.");
    if (!KS_captionMogrtSetText(textProp, String(p.text || ""))) throw new Error("MOGRT altyazi metni dogrulanamadi.");

    var until = new Time();
    until.seconds = end;
    try { clip.end = until; } catch (eEnd) {}
    var actualEnd = 0;
    try { actualEnd = Number(clip.end.seconds) || 0; } catch (eActual) {}
    if (Math.abs(actualEnd - end) > .08) {
      // Bazi surumler end atamasini ilk karede yutuyor; bir kez daha dene.
      try { clip.end = until; } catch (eEnd2) {}
      try { actualEnd = Number(clip.end.seconds) || 0; } catch (eActual2) {}
    }
    if (Math.abs(actualEnd - end) > .08) throw new Error("MOGRT suresi altyazi zamanina kirpilamadi.");

    return KS_ok({ track: track, trackName: "V" + (track + 1), start: start, end: actualEnd, text: String(p.text || "") });
  } catch (e) {
    try { if (clip) clip.remove(0, 0); } catch (eRemove) {}
    return KS_err(e);
  }
}

function KS_removeCaptionMogrtBatch(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var batch = String(p.batch || "").replace(/[^a-z0-9_-]/ig, "").slice(0, 40);
    var prefix = "Suflo Caption · " + batch;
    var removed = 0;
    for (var ti = 0; ti < seq.videoTracks.numTracks; ti++) {
      var tr = seq.videoTracks[ti];
      for (var ci = tr.clips.numItems - 1; ci >= 0; ci--) {
        try {
          if (String(tr.clips[ci].name || "") !== prefix) continue;
          tr.clips[ci].remove(0, 0);
          removed++;
        } catch (eClip) {}
      }
    }
    return KS_ok({ removed: removed });
  } catch (e) { return KS_err(e); }
}

/*
 * Motion BG / overlay video: dosyayi "Suflo Motion BG" bin'ine alir ve
 * playhead'de bos bir ust video katmanina yerlestirir. MOGRT'tan farki:
 * bunlar hazir video dosyalari (mp4/mov), importMGT degil importFiles + overwriteClip.
 */
/*
 * Motion BG gorsel bir katmandir; kaynak mp4'un ses izi playhead'e istenmeden
 * dusuyordu. Yerlestirmeden sonra AYNI medyadan, AYNI konumda duran bagli ses
 * klibini temizler. Kullanicinin onceden koydugu baska klipler etkilenmesin diye
 * hem medya yolu hem baslangic zamani eslesmek zorunda.
 */
function KS_removeLinkedAudio(seq, mediaPath, startSec) {
  var silindi = 0;
  try {
    var hedef = String(mediaPath).toLowerCase();
    for (var i = 0; i < seq.audioTracks.numTracks; i++) {
      var tr = seq.audioTracks[i];
      for (var j = tr.clips.numItems - 1; j >= 0; j--) {
        var cl = tr.clips[j];
        try {
          if (Math.abs(cl.start.seconds - startSec) > 0.05) continue;
          if (!cl.projectItem) continue;
          if (String(cl.projectItem.getMediaPath()).toLowerCase() !== hedef) continue;
          cl.remove(0, 0);
          silindi++;
        } catch (eC) {}
      }
    }
  } catch (e) {}
  return silindi;
}

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
    var sesSilindi = KS_removeLinkedAudio(seq, f.fsName, start);
    var sure = 0;
    try { sure = placed.end.seconds - placed.start.seconds; } catch (eS) {}
    return KS_ok({ track: idx, trackName: "V" + (idx + 1), start: start, dur: sure, sesSilindi: sesSilindi });
  } catch (e) { return KS_err(e); }
}

/* ---------- Hiz Rampasi (v3.2): basamakli dogal rampa ---------- */

/*
 * Premiere Zaman Yeniden Eslemeyi (Time Remapping) eklentilere acmiyor: bilesen
 * TrackItem.components'ta gorunmuyor (14.x - 26.x), UXP'de de yok, QE addVideoEffect
 * ("Time Remapping") basarili deyip bir sey eklemiyor. Suflo araligi kareye oturan
 * parcalara boler ve her parcaya QE setSpeed ile kendi sabit hizini yazar (plan panelde:
 * js/speedramp.js). Aralik yerinden ve suresinden oynamaz, ripple yok: sonraki klipler,
 * altyazi, muzik, marker kaymaz. Her adim geri okunur; bir adim tutmazsa klip tek %100
 * klibe geri getirilir (KS_rampRestore) — qe.project.undo ASLA cagrilmaz.
 * GUVENLIK (26.3.2): setReverse cagrilmaz, QE ogesinin .reverse ozelligi OKUNMAZ.
 * Panel acilisinda bu islevler cagrilmaz; yalniz dugmeye basinca.
 */

var KS_RAMP_IMZALAR = ["5", "5d", "3", "2", "1"];
var KS_RAMP_FOTO = /\.(png|jpe?g|psd|tiff?|gif|bmp|webp|ai|eps)$/i;
var KS_RAMP_MESAJ = {
  secimYok: "Bir video klip sec ya da Giris/Cikis koy.",
  grafik: "Grafik, MOGRT, ayar katmani ya da fotografa hiz rampasi uygulanmaz.",
  hizli: "Bu klibin hizi zaten degismis. Once Hiz/Sure'den %100'e al.",
  ters: "Ters oynatilan klipte rampa yapilamaz.",
  remap: "Bu klipte Zaman Yeniden Esleme var gibi gorunuyor; once kapat.",
  warp: "Warp Stabilizer hiz degisikligiyle calismaz.",
  kilitli: "Katman kilitli. Kilidi acip yeniden dene.",
  multicam: "Multicam ve birlestirilmis kliplerde hiz yazilamiyor.",
  kisa: "Rampa icin en az 12 kare gerekli.",
  qeYok: "Bu Premiere surumunde QE hiz yazma (setSpeed) yok.",
  linkedConflict: "Klip sesle bagli ve bag koparilamiyor. Ctrl+L ile bagi kopar, yeniden uygula.",
  tutamak: "Medya yetmedi: hizlanma icin klibin sonrasinda yeterli goruntu yok.",
  hizYazilamadi: "Premiere hizi kabul etmedi.",
  yerlesim: "Parcalar beklenen yere oturmadi.",
  geriAlinamadi: "Klip eski haline getirilemedi.",
  degisti: "Rampa parcalari degismis; Suflo dokunmadi.",
  sekans: "Aktif sekans degisti; islem durduruldu.",
  kopya: "Kopya sekans olusturulamadi.",
  plan: "Rampa plani gecersiz.",
  duz: "Bu ayarlarla rampa olusmuyor: parcalarin hepsi ayni hizda.",
  inoutKlipYok: "Giris-Cikis tek bir video klibin icinde olmali (kilitli ya da gizli katmanlar sayilmaz).",
  linkedBilinmiyor: "Bu Premiere surumunde Suflo klibin sesle bagini okuyamiyor ve koparamiyor."
};

// { ok:false, kod, error, ...ek } — panel metni koda gore kurar; error yalniz gunluk/yedek
function KS_rampHata(kod, ek) {
  var o = { ok: false, kod: String(kod), error: KS_RAMP_MESAJ[kod] || String(kod) };
  if (ek) { for (var k in ek) { if (ek.hasOwnProperty(k)) o[k] = ek[k]; } }
  return KJSON.stringify(o);
}

function KS_rampFrame(seq) {
  var tb = 0;
  try { tb = Number(seq.timebase); } catch (e) {}
  return tb > 0 ? tb / KS_TPS : 1 / 30;
}

// Ceyrek kare ileri: getFormatted yuvarlasa da kirpsa da istenen kareye duser
function KS_rampTC(t, frame) { return KS_timecode(Number(t) + frame / 4); }

function KS_rampSleep(ms) {
  try { if (typeof $ !== "undefined" && $.sleep) $.sleep(ms); } catch (e) {}
}

function KS_rampDeselect(seq) {
  var sel = null;
  try { sel = seq.getSelection(); } catch (e) {}
  if (!sel) return;
  for (var i = 0; i < sel.length; i++) {
    try { sel[i].setSelected(false, true); } catch (e2) {}
  }
}

function KS_rampYol(c) {
  try { if (c && c.projectItem) return String(c.projectItem.getMediaPath() || ""); } catch (e) {}
  return "";
}

function KS_rampAyni(a, b) {
  if (a === b) return true;
  try { if (a.nodeId && b.nodeId && String(a.nodeId) === String(b.nodeId)) return true; } catch (e) {}
  return false;
}

function KS_rampKoleksiyon(col) {
  var out = [], n = 0;
  if (!col) return out;
  try { n = col.numItems !== undefined ? Number(col.numItems) : Number(col.length); } catch (e) {}
  for (var i = 0; i < (n || 0); i++) {
    try { if (col[i]) out.push(col[i]); } catch (e2) {}
  }
  return out;
}

// Katmanda baslangici t'ye yarim kareden yakin klip
function KS_rampClipAt(track, t, frame) {
  try {
    for (var i = 0; i < track.clips.numItems; i++) {
      var c = track.clips[i];
      if (Math.abs(Number(c.start.seconds) - t) < frame / 2) return c;
    }
  } catch (e) {}
  return null;
}

// t katmandaki bir klibin kesin icinde mi (kenarda razor yok)
function KS_rampIcinden(track, t, yari) {
  try {
    for (var i = 0; i < track.clips.numItems; i++) {
      var c = track.clips[i];
      if (t > Number(c.start.seconds) + yari && t < Number(c.end.seconds) - yari) return true;
    }
  } catch (e) {}
  return false;
}

/*
 * QE ogesi: getItemAt bosluklari "Empty" oge olarak araya katar, DOM dizini guvenilmez.
 * Baslangica gore eslesir (KS_packQItemSeconds). .reverse OKUNMAZ.
 */
function KS_rampQItem(qseq, ti, t, frame) {
  var tr = null, n = 0;
  try { tr = qseq.getVideoTrackAt(ti); } catch (e) {}
  if (!tr) return null;
  try { n = Number(tr.numItems) || 0; } catch (eN) {}
  for (var i = 0; i < n; i++) {
    var it = null, tur = "";
    try { it = tr.getItemAt(i); } catch (eI) {}
    if (!it) continue;
    try { tur = String(it.type); } catch (eT) {}
    if (tur === "Empty") continue;
    var s = KS_packQItemSeconds(it, "start");
    if (isFinite(s) && Math.abs(s - t) < frame / 2) return it;
  }
  return null;
}

// Klibin hizi (1 = %100): getSpeed, yoksa QE speed, yoksa kaynak / sure
function KS_rampSpeed(clip, q) {
  var v = NaN;
  try { if (clip && typeof clip.getSpeed === "function") v = Math.abs(Number(clip.getSpeed())); } catch (e1) {}
  if (!(v > 0) && q) {
    try { v = Math.abs(Number(q.speed)); if (v > 10.5) v = v / 100; } catch (e2) {}
  }
  if (!(v > 0) && clip) {
    try {
      var d = Number(clip.end.seconds) - Number(clip.start.seconds);
      if (d > 0) v = (Number(clip.outPoint.seconds) - Number(clip.inPoint.seconds)) / d;
    } catch (e3) {}
  }
  return v > 0 ? v : 1;
}

// end yazar, geri okur, tutmazsa bir kez daha dener (KS_placeCaptionMogrt gibi); gercek sonu doner
function KS_rampSetEnd(clip, t) {
  var hedef = new Time();
  hedef.seconds = Number(t);
  try { clip.end = hedef; } catch (e1) {}
  var son = NaN;
  try { son = Number(clip.end.seconds); } catch (e2) {}
  if (!(Math.abs(son - t) < 0.0005)) {
    try { clip.end = hedef; } catch (e3) {}
    try { son = Number(clip.end.seconds); } catch (e4) {}
  }
  return son;
}

// 0 kare ornekleme, 1 kare harmanlama, 2 optik akis
function KS_rampInterp(q, tur) {
  try { if (typeof q.setTimeInterpolationType === "function") { q.setTimeInterpolationType(tur); return true; } } catch (e1) {}
  try { if (typeof q.setFrameBlend === "function") { q.setFrameBlend(tur > 0); return true; } } catch (e2) {}
  return false;
}

// setSpeed imzalari surumden surume degisiyor (26.x bes arguman ister)
function KS_rampCall(q, imza, oran, clip) {
  if (imza === "5") return q.setSpeed(oran, "", false, false, false);
  if (imza === "5d") {
    var sure = "";
    try { sure = String(Math.round((Number(clip.end.seconds) - Number(clip.start.seconds)) * KS_TPS)); } catch (e) {}
    return q.setSpeed(oran, sure, false, false, false);
  }
  if (imza === "3") return q.setSpeed(oran, "", false);
  if (imza === "2") return q.setSpeed(oran, "");
  return q.setSpeed(oran);
}

/*
 * Kalibrasyon merdiveni. o: { seq, qseq, ti, t (klibin baslangici), frame, v, cal {units, sig}, K, tam }
 * Onbellekteki imza/birim once; her imzada once oran (v) sonra yuzde (v x 100). Her cagridan
 * sonra 40 ms bekle ve hizi geri oku: %5 (ya da 1.5/K) icindeyse kabul. Okunan v/100 ya da
 * v x 100 ise ayni imza obur birimle; 'Not Enough Parameters' / 'Bad argument list' sonraki
 * imza; 'invalid trackitem' secimi kaldirip bir kez daha; hiz degismediyse 60 ms bekleyip bir
 * kez daha. En cok 8 cagri. Hiz degisimi kaynak giris noktasini korur: geri alma gerekmez.
 */
function KS_rampSetSpeed(o) {
  var v = Number(o.v), cal = o.cal || {}, i;
  // pay en cok %50: kisa parcada (K = 1-2) 'oran' ile yazilan v/100'u (yuzde birimli surum) kabul etmesin
  var tol = Math.min(0.5, Math.max(0.05, 1.5 / Math.max(1, Number(o.K) || 1)));
  var kanitBirim = "", kanitImza = "";
  var imzalar = [];
  if (cal.sig) imzalar.push(String(cal.sig));
  for (i = 0; i < KS_RAMP_IMZALAR.length; i++) {
    if (KS_RAMP_IMZALAR[i] !== String(cal.sig)) imzalar.push(KS_RAMP_IMZALAR[i]);
  }
  var ilk = cal.units === "percent" ? "percent" : "ratio";
  var cagri = 0, sonHata = "";
  var clip = KS_rampClipAt(o.seq.videoTracks[o.ti], o.t, o.frame);
  var q = KS_rampQItem(o.qseq, o.ti, o.t, o.frame);
  if (!clip || !q || typeof q.setSpeed !== "function") return { ok: false, kod: "qeYok", calls: 0 };
  var once = KS_rampSpeed(clip, null);
  // tam (geri yukleme): cagiran KS_rampHizKur hizi 5e-5 ile olcer ve zaten yetersiz buldu; %0,1
  // icinde 'zaten orada' deyip cagrisiz donmek (ornek 1.00026 -> 1) her turu bos gecirir: hizYazilamadi
  if (!o.tam && Math.abs(once - v) / v < 0.001) return { ok: true, units: cal.units || "", sig: cal.sig || "", speed: once, calls: 0 };
  for (var si = 0; si < imzalar.length && cagri < 8; si++) {
    var imza = imzalar[si], birim = ilk, denendi = {}, gecersizTekrar = false, ayniTekrar = false;
    while (cagri < 8) {
      var oran = birim === "percent" ? v * 100 : v, hata = "";
      once = KS_rampSpeed(clip, null);
      cagri++;
      try { KS_rampCall(q, imza, oran, clip); } catch (e) { hata = String(e && e.message ? e.message : e); }
      denendi[birim] = 1;
      if (hata) {
        sonHata = hata;
        if (/invalid ?track ?item/i.test(hata) && !gecersizTekrar) {
          gecersizTekrar = true;
          KS_rampDeselect(o.seq);
          clip = KS_rampClipAt(o.seq.videoTracks[o.ti], o.t, o.frame) || clip;
          q = KS_rampQItem(o.qseq, o.ti, o.t, o.frame) || q;
          continue;
        }
        break;
      }
      KS_rampSleep(40);
      clip = KS_rampClipAt(o.seq.videoTracks[o.ti], o.t, o.frame) || clip;
      q = KS_rampQItem(o.qseq, o.ti, o.t, o.frame) || q;
      var oku = KS_rampSpeed(clip, null);
      if (Math.abs(oku - v) / v <= tol) return { ok: true, units: birim, sig: imza, speed: oku, calls: cagri };
      var diger = birim === "ratio" ? "percent" : "ratio";
      var yanlis = birim === "ratio" ? v / 100 : v * 100;
      if (Math.abs(oku - yanlis) / yanlis <= tol) {
        // guclu kanit: dogru birim obur birim (yanlis birimle kirpilan klip hedefe varamasa da)
        if (!kanitBirim) { kanitBirim = diger; kanitImza = imza; }
        if (!denendi[diger]) { birim = diger; continue; }
        break;
      }
      if (Math.abs(oku - once) < 1e-6) {
        if (!ayniTekrar) { ayniTekrar = true; KS_rampSleep(60); continue; }
        break;
      }
      if (!denendi[diger]) { birim = diger; continue; }
      break;
    }
  }
  return { ok: false, kod: "hizYazilamadi", calls: cagri, error: sonHata, units: kanitBirim, sig: kanitImza };
}

/*
 * Klibi (baslangici o.t) tam o.v hizina getirir ve o.Kf > 0 ise ucunu o.t + Kf kareye uzatir.
 * Hizlanma sureyi tam kareye yukari yuvarlar (hiz = kaynak / sure, istenenin altinda kalir);
 * yavaslama sureyi korur, hizi tam yazar. Bu yuzden hizlanmada hiza YUKARIDAN yaklasilir:
 * kaynak araligi K2 tam kareye bolunerek v'nin hemen ustune cikilir, sonra v'ye yavaslatilir;
 * uc en son v hizinda uzatilir. Hicbir ara adim gerekenden fazla kaynak acmaz (hizlanmada once
 * mevcut, daha dusuk hizda uzatilir). o: { seq, qseq, ti, t, frame, v, Kf, maxSon, cal }
 * Doner: KS_rampSetSpeed gibi { ok, kod, units, sig, speed, calls }; kod 'tutamak': kaynak yetmedi.
 */
function KS_rampHizKur(o) {
  var v = Number(o.v), fr = o.frame, yari = fr / 2, tr = o.seq.videoTracks[o.ti], cal = o.cal || {}, cagri = 0, tur, R, u, sure, kare;
  // tam: geri yukleme (v = 1). Yuvarlama payi kabul edilmez: %99.83'te uzatilan ilk parca ozgun
  // kaynak araligina donmez, uzun aralikta %100'deki ses videodan kayardi. Pay 5e-5: Hiz/Sure'de %100,00
  // gorunur (0.9999 = %99,99 duzeltilir); Premiere'in ic yuvarlamasi (0.99999) sonsuz donguye sokmaz
  var tam = !!o.tam, TAM = 5e-5;
  var Kf = Number(o.Kf) || 0, hedefSon = o.t + Kf * fr, maxSon = Number(o.maxSon) || 0;
  function oku() {
    R = KS_rampClipAt(tr, o.t, fr);
    if (!R) return false;
    u = KS_rampSpeed(R, null);
    sure = Number(R.end.seconds) - Number(R.start.seconds);
    kare = Math.round(sure / fr);
    return true;
  }
  function bitir() {
    if (Kf && Number(R.end.seconds) < hedefSon - yari) { KS_rampSetEnd(R, hedefSon); oku(); }
    return { ok: true, units: cal.units || "", sig: cal.sig || "", speed: u, calls: cagri };
  }
  var yavaslatildi = false, yavasOnce = null;
  for (tur = 0; tur < 8; tur++) {
    if (!oku()) return { ok: false, kod: "qeYok", calls: cagri };
    // uc bu hizda uzatilacak: hedefin ustunde kalan hiz (yuvarlama payi bile) planin kaynagini asar,
    // o yuzden yukarida kalan hiz bir kez v'ye yavaslatilir; azicik altinda kalmak kabul. tam'da da:
    // 1.00004 TAM icinde ama t1'e uzatma L'den fazla kaynak ister (tutamak 0'da uc bir kare kisa kalir)
    if ((Math.abs(u - v) <= v * (tam ? TAM : 1e-5) && (!tam || u <= v * (1 + 1e-9) || yavaslatildi)) ||
        (!tam && ((u < v && v - u <= v * 0.002) || (yavaslatildi && Math.abs(u - v) <= v * 0.002)))) return bitir();
    // tam: Premiere yavaslatma istegini yok saydiysa (hiz hic degismedi) ayni setSpeed sonraki turlarda
    // yeniden gonderilip geri alma adimi biriktirmesin
    if (tam && yavasOnce !== null && Math.abs(u - yavasOnce) < 1e-9) return { ok: false, kod: "hizYazilamadi", calls: cagri, units: cal.units || "", sig: cal.sig || "" };
    yavasOnce = null;
    var istek, Kt;
    if (v < u) { istek = v; Kt = Math.max(kare, Kf, 1); yavaslatildi = true; if (tam) yavasOnce = u; }
    else {
      if (Kf && Number(R.end.seconds) < hedefSon - yari) {
        KS_rampSetEnd(R, hedefSon);
        if (!oku()) return { ok: false, kod: "qeYok", calls: cagri };
      }
      var span = sure * u;
      var K2 = Math.floor(span / (v * fr) + 1e-6);
      if (K2 >= 1) { istek = span / (K2 * fr) * (1 + 1e-7); Kt = K2; }
      else if (kare > 1) { istek = span / fr * (1 + 1e-7); Kt = 1; }   // tek kareye: hiz kare kat artar, sonraki tur buyutur
      else if (maxSon && Number(R.end.seconds) < maxSon - yari) { KS_rampSetEnd(R, maxSon); continue; }
      else return { ok: false, kod: "tutamak", calls: cagri };
    }
    KS_rampDeselect(o.seq);
    var onceBirim = cal.units || "";
    var ss = KS_rampSetSpeed({ seq: o.seq, qseq: o.qseq, ti: o.ti, t: o.t, frame: fr, v: istek, cal: cal, K: Kt, tam: tam });
    cagri += ss.calls || 0;
    if (ss.units) cal = { units: ss.units, sig: ss.sig };
    // yanlis birimle kirpilan klip hedefe varamadiysa: birim artik belli, sonraki tur yeniden yaklasir
    if (!ss.ok && !(ss.kod === "hizYazilamadi" && ss.units && ss.units !== onceBirim)) { ss.calls = cagri; return ss; }
  }
  if (!oku()) return { ok: false, kod: "qeYok", calls: cagri };
  if (tam ? Math.abs(u - v) <= v * TAM : Math.abs(u - v) / v <= Math.max(0.05, 1.5 / Math.max(1, Kf))) return bitir();
  return { ok: false, kod: "hizYazilamadi", calls: cagri, units: cal.units || "", sig: cal.sig || "" };
}

function KS_rampUndoIndex() {
  try {
    if (typeof qe !== "undefined" && qe && qe.project && typeof qe.project.undoStackIndex === "function") return Number(qe.project.undoStackIndex());
  } catch (e) {}
  return null;
}

/*
 * Klibin sesi: getLinkedItems'in verdigi ses ogeleri (medyasi ne olursa olsun: Clip > Link ile
 * baglanmis ayri kayit WAV'i da) + ayni medya, ayni kaynak hizasi (inPoint - start, 0.05 sn) ve
 * cakisan ses klipleri (KS_placeCleanAudio kurali). [{clip, track, start, end, yol, hiza, bagli}]
 * bagli: true getLinkedItems bagli diyor; false getLinkedItems var ama bu oge bagli degil; null
 * getLinkedItems yok, bag bilinmiyor.
 */
function KS_rampLinkedAudio(seq, clip) {
  var out = [], bagli = null, t, i, k;
  try { if (typeof clip.getLinkedItems === "function") bagli = KS_rampKoleksiyon(clip.getLinkedItems()); } catch (e) { bagli = null; }
  var yol = KS_rampYol(clip).toLowerCase();
  var cs = Number(clip.start.seconds), ce = Number(clip.end.seconds), hiza = Number(clip.inPoint.seconds) - cs;
  for (t = 0; t < seq.audioTracks.numTracks; t++) {
    var tr = seq.audioTracks[t];
    for (i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i], bag = false, ayni = false;
      if (bagli) { for (k = 0; k < bagli.length && !bag; k++) bag = KS_rampAyni(bagli[k], c); }
      if (!bag && yol) {
        try {
          ayni = KS_rampYol(c).toLowerCase() === yol && Math.abs((Number(c.inPoint.seconds) - Number(c.start.seconds)) - hiza) < 0.05 &&
            Number(c.end.seconds) > cs + 0.001 && Number(c.start.seconds) < ce - 0.001;
        } catch (e2) { ayni = false; }
      }
      if (bag || ayni) {
        out.push({ clip: c, track: t, start: Number(c.start.seconds), end: Number(c.end.seconds), yol: KS_rampYol(c).toLowerCase(),
          hiza: Number(c.inPoint.seconds) - Number(c.start.seconds), bagli: bag ? true : (bagli ? false : null) });
      }
    }
  }
  return out;
}

// Gercekten (ya da belki: getLinkedItems yok) bagli ses var mi; bag koparma yalniz o zaman gerekir
function KS_rampBagliVar(bag) {
  for (var i = 0; i < bag.length; i++) { if (bag[i].bagli !== false) return true; }
  return false;
}
// Bag biliniyor ve bagli oge var (Ctrl+L ile koparilinca cozulur) mi, yoksa yalniz bilinmeyen mi
function KS_rampBagliKesin(bag) {
  for (var i = 0; i < bag.length; i++) { if (bag[i].bagli === true) return true; }
  return false;
}
// Ses parcalarini tanima imzalari: videonun kendi medyasi hizasiz (eski kural), baska medya
// (bagli WAV) kendi kaynak hizasiyla
function KS_rampSesImza(bag, videoYol) {
  var out = [], gor = {}, vy = String(videoYol || "").toLowerCase();
  for (var i = 0; i < bag.length; i++) {
    var y = bag[i].yol;
    if (!y) continue;
    var h = y === vy ? null : Math.round(bag[i].hiza * 1000) / 1000;
    var a = y + "@" + h;
    if (gor[a]) continue;
    gor[a] = 1;
    out.push({ yol: y, hiza: h });
  }
  return out;
}
function KS_rampImzaUyar(imzalar, c) {
  var y = KS_rampYol(c).toLowerCase(), h = NaN;
  try { h = Number(c.inPoint.seconds) - Number(c.start.seconds); } catch (e) {}
  for (var i = 0; i < imzalar.length; i++) {
    if (imzalar[i].yol !== y) continue;
    if (imzalar[i].hiza === null || Math.abs(h - Number(imzalar[i].hiza)) <= 0.05) return true;
  }
  return false;
}

function KS_rampWarpVar(clip) {
  try {
    var comps = clip.components;
    for (var i = 0; i < comps.numItems; i++) {
      var mn = "", dn = "";
      try { mn = String(comps[i].matchName || ""); } catch (e1) {}
      try { dn = KS_packNormDisplay(comps[i].displayName); } catch (e2) {}
      if (mn.indexOf("SubspaceStabilizer") !== -1 || dn === "warp stabilizer" || dn === "sarsinti onleyici") return true;
    }
  } catch (e) {}
  return false;
}

/*
 * Rampa uygulanabilir mi? null ya da { kod, pct? }. Hicbir sey degistirmez.
 * kilitli, grafik (MOGRT / ayar katmani / matte / fotograf), multicam, ters, hizli,
 * remap (sure ile kaynak uyusmuyor), warp, kisa (12 kareden kisa)
 */
function KS_rampCheck(seq, clip, ti) {
  var tr = seq.videoTracks[ti];
  try { if (tr.isLocked && tr.isLocked()) return { kod: "kilitli" }; } catch (eL) {}
  var yol = KS_rampYol(clip);
  if (KS_isGraphicClip(clip) || !yol || KS_RAMP_FOTO.test(yol)) return { kod: "grafik" };
  if (KS_mcKlipBayrak(clip, "isMulticamClip") || KS_mcKlipBayrak(clip, "isMergedClip")) return { kod: "multicam" };
  try { if (typeof clip.isSpeedReversed === "function" && clip.isSpeedReversed()) return { kod: "ters" }; } catch (eR) {}
  var frame = KS_rampFrame(seq);
  var hiz = KS_rampSpeed(clip, null);
  if (Math.abs(hiz - 1) > 0.005) return { kod: "hizli", pct: Math.round(hiz * 100) };
  var sure = Number(clip.end.seconds) - Number(clip.start.seconds);
  var kaynak = Number(clip.outPoint.seconds) - Number(clip.inPoint.seconds);
  if (Math.abs(kaynak - sure) > frame + 0.005 * sure) return { kod: "remap" };
  if (KS_rampWarpVar(clip)) return { kod: "warp" };
  if (Math.round(sure / frame) < 12) return { kod: "kisa" };
  return null;
}

// Secili ogeler (kimlik ya da nodeId eslesmesi): [{clip, track}]
function KS_rampSecili(seq, tracks) {
  var sel = null, out = [];
  try { sel = seq.getSelection(); } catch (e) {}
  if (!sel || !sel.length) return out;
  for (var ti = 0; ti < tracks.numTracks; ti++) {
    var tr = tracks[ti];
    for (var ci = 0; ci < tr.clips.numItems; ci++) {
      var c = tr.clips[ci];
      for (var si = 0; si < sel.length; si++) {
        if (KS_rampAyni(c, sel[si])) { out.push({ clip: c, track: ti }); break; }
      }
    }
  }
  return out;
}

// Yalniz sesi secilmis bagli cift: ayni medya, ayni hiza, cakisan video klibe cozulur
function KS_rampSestenVideo(seq, sesler) {
  var out = [], gor = {};
  for (var i = 0; i < sesler.length; i++) {
    var a = sesler[i].clip, yol = KS_rampYol(a).toLowerCase();
    if (!yol) continue;
    var hiza = Number(a.inPoint.seconds) - Number(a.start.seconds);
    for (var ti = 0; ti < seq.videoTracks.numTracks; ti++) {
      var tr = seq.videoTracks[ti];
      for (var ci = 0; ci < tr.clips.numItems; ci++) {
        var c = tr.clips[ci];
        if (KS_rampYol(c).toLowerCase() !== yol) continue;
        if (Math.abs((Number(c.inPoint.seconds) - Number(c.start.seconds)) - hiza) >= 0.05) continue;
        if (!(Number(c.end.seconds) > Number(a.start.seconds) + 0.001 && Number(c.start.seconds) < Number(a.end.seconds) - 0.001)) continue;
        var anahtar = ti + "@" + Number(c.start.seconds).toFixed(4);
        if (gor[anahtar]) continue;
        gor[anahtar] = 1;
        out.push({ clip: c, track: ti });
      }
    }
  }
  return out;
}

/*
 * SALT OKUR. p: { range: "clips" | "inout", items?: [{track, start}] }
 * clips: secili video klipler (yalniz ses secildiyse bagli videosu); items verilirse secim yerine
 * o katmanda o anda baslayan klipler (paneldeki 'kaldirip yeniden uygula': kaldirma secimi bosaltir);
 * inout: Giris/Cikis'i kapsayan en ustteki kilitsiz, gorunur katmandaki etkin video klip. Aralik
 * kareye oturur; klip kenarina 1 kareden yakin kenar klip kenarina yapisir.
 * Doner: { seqId, frame, fps, playhead, appVersion, targets, skipped, caps }
 */
function KS_speedRampTargets(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var frame = KS_rampFrame(seq), yari = frame / 2;
    var aralik = p.range === "inout" ? "inout" : "clips";
    var playhead = 0, ip = 0, op = 0, i, k;
    try { playhead = Number(seq.getPlayerPosition().seconds) || 0; } catch (eP) {}
    var adaylar = [], atlanan = [];
    if (p.items instanceof Array && p.items.length) {
      aralik = "clips";
      for (i = 0; i < p.items.length; i++) {
        var itTi = Number(p.items[i] && p.items[i].track);
        if (!(itTi >= 0) || itTi >= seq.videoTracks.numTracks) continue;
        var itK = KS_rampClipAt(seq.videoTracks[itTi], Number(p.items[i].start), frame), cift = false;
        for (k = 0; k < adaylar.length && itK; k++) { if (KS_rampAyni(adaylar[k].clip, itK)) cift = true; }
        if (itK && !cift) adaylar.push({ clip: itK, track: itTi });
      }
    } else if (aralik === "clips") {
      var sv = KS_packSelectedVideo(seq);
      for (i = 0; i < sv.length; i++) adaylar.push({ clip: sv[i].clip, track: sv[i].track });
      if (!adaylar.length) adaylar = KS_rampSestenVideo(seq, KS_rampSecili(seq, seq.audioTracks));
    } else {
      try { ip = Number(seq.getInPointAsTime().seconds); op = Number(seq.getOutPointAsTime().seconds); } catch (eIO) {}
      if (!(op - ip >= frame)) return KS_rampHata("secimYok");
      var grafikAday = null;
      for (var vt = seq.videoTracks.numTracks - 1; vt >= 0 && !adaylar.length; vt--) {
        var vtr = seq.videoTracks[vt];
        try { if (vtr.isLocked && vtr.isLocked()) continue; } catch (eL) {}
        // gizli katman (goz kapali) ve devre disi klip: izleyicinin gordugu klip degil
        try { if (vtr.isMuted && vtr.isMuted()) continue; } catch (eM) {}
        for (var ci = 0; ci < vtr.clips.numItems; ci++) {
          var vc = vtr.clips[ci], kapaliV = false;
          try { kapaliV = vc.disabled ? true : false; } catch (eDv) {}
          if (kapaliV) continue;
          if (Number(vc.start.seconds) <= ip + yari && Number(vc.end.seconds) >= op - yari) {
            var yolV = KS_rampYol(vc);
            if (KS_isGraphicClip(vc) || !yolV || KS_RAMP_FOTO.test(yolV)) { if (!grafikAday) grafikAday = { clip: vc, track: vt }; break; }
            adaylar.push({ clip: vc, track: vt });
            break;
          }
        }
      }
      if (!adaylar.length && grafikAday) adaylar.push(grafikAday);
      // Giris/Cikis konmus ama tek bir klip kapsamiyor (kesimi asiyor, bosluk): ayri kod, ayri metin
      if (!adaylar.length) return KS_rampHata("inoutKlipYok");
    }
    if (!adaylar.length) return KS_rampHata("secimYok");

    var hedefler = [], klipler = [];
    for (i = 0; i < adaylar.length; i++) {
      var c = adaylar[i].clip, ti = adaylar[i].track;
      var s = Number(c.start.seconds), e = Number(c.end.seconds);
      var a = aralik === "inout" ? ip : s, b = aralik === "inout" ? op : e;
      a = Math.round(a / frame) * frame;
      b = Math.round(b / frame) * frame;
      if (Math.abs(a - s) <= frame || a < s) a = s;
      if (Math.abs(b - e) <= frame || b > e) b = e;
      var ad = "";
      try { ad = String(c.name || ""); } catch (eA) {}
      var h = KS_rampCheck(seq, c, ti);
      if (!h && Math.round((b - a) / frame) < 12) h = { kod: "kisa" };
      if (h) {
        atlanan.push({ name: ad, track: ti, start: s, kod: h.kod, pct: h.pct === undefined ? null : h.pct });
        continue;
      }
      var bag = KS_rampLinkedAudio(seq, c), ses = [];
      for (k = 0; k < bag.length; k++) ses.push({ track: bag[k].track, start: bag[k].start, end: bag[k].end });
      var cin = Number(c.inPoint.seconds);
      hedefler.push({ track: ti, start: s, end: e, inPoint: cin, outPoint: Number(c.outPoint.seconds), mediaPath: KS_rampYol(c), name: ad,
        rangeStart: a, rangeEnd: b, partial: a > s + yari || b < e - yari, srcIn: cin + (a - s), audio: ses, hasLinked: ses.length > 0 });
      klipler.push(c);
    }
    hedefler.sort(function (x, y) { return (x.rangeStart - y.rangeStart) || (x.track - y.track); });

    var caps = { setSpeed: null, interp: null, unlink: false, disabled: null, undoIndex: false };
    try { caps.unlink = typeof seq.unlinkSelection === "function"; } catch (eU) {}
    if (hedefler.length) {
      try { caps.disabled = typeof klipler[0].disabled === "boolean"; } catch (eD) {}
      try {
        app.enableQE();
        if (typeof qe !== "undefined" && qe && qe.project) {
          caps.undoIndex = typeof qe.project.undoStackIndex === "function";
          var qs = qe.project.getActiveSequence();
          var qi = qs ? KS_rampQItem(qs, hedefler[0].track, hedefler[0].start, frame) : null;
          caps.setSpeed = !!(qi && typeof qi.setSpeed === "function");
          caps.interp = !!(qi && (typeof qi.setTimeInterpolationType === "function" || typeof qi.setFrameBlend === "function"));
        } else caps.setSpeed = false;
      } catch (eQ) { caps.setSpeed = false; }
    }
    var surum = "";
    try { surum = String(app.version); } catch (eV) {}
    return KS_ok({ seqId: String(seq.sequenceID), frame: frame, fps: 1 / frame, playhead: playhead, appVersion: surum,
      targets: hedefler, skipped: atlanan, caps: caps });
  } catch (e) { return KS_err(e); }
}

// Hedef klibi yeniden bul: ayni katman, baslangic ve son yarim kare icinde, ayni medya
function KS_rampHedef(seq, ti, tg, yari) {
  try {
    var tr = seq.videoTracks[ti], yol = String(tg.mediaPath || "").toLowerCase();
    for (var i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i];
      if (Math.abs(Number(c.start.seconds) - Number(tg.start)) >= yari) continue;
      if (Math.abs(Number(c.end.seconds) - Number(tg.end)) >= yari) continue;
      if (yol && KS_rampYol(c).toLowerCase() !== yol) continue;
      return c;
    }
  } catch (e) {}
  return null;
}

// Aralik disinda degismemesi gereken video ogeleri: onceki / sonraki komsu, kismi aralikta dis parcalar
function KS_rampKomsuFoto(seq, ti, T0, T1, yari, clip) {
  var tr = seq.videoTracks[ti], foto = [], once = null, sonra = null;
  var cs = Number(clip.start.seconds), ce = Number(clip.end.seconds), cin = Number(clip.inPoint.seconds), yol = KS_rampYol(clip);
  for (var i = 0; i < tr.clips.numItems; i++) {
    var c = tr.clips[i], s = Number(c.start.seconds), e = Number(c.end.seconds);
    var kayit = { start: s, end: e, inPoint: Number(c.inPoint.seconds), yol: KS_rampYol(c), hiz: 0 };
    if (e <= cs + yari) once = kayit;
    else if (s >= ce - yari && !sonra) sonra = kayit;
  }
  if (once) foto.push(once);
  if (sonra) foto.push(sonra);
  if (T0 > cs + yari) foto.push({ start: cs, end: T0, inPoint: cin, yol: yol, hiz: 1 });
  if (T1 < ce - yari) foto.push({ start: T1, end: ce, inPoint: cin + (T1 - cs), yol: yol, hiz: 1 });
  return foto;
}

function KS_rampKomsuAyni(seq, ti, foto, frame) {
  var tr = seq.videoTracks[ti], yari = frame / 2;
  for (var f = 0; f < foto.length; f++) {
    var k = foto[f], c = KS_rampClipAt(tr, k.start, frame);
    if (!c) return false;
    if (Math.abs(Number(c.end.seconds) - k.end) > yari / 2) return false;
    if (Math.abs(Number(c.inPoint.seconds) - k.inPoint) > yari / 2) return false;
    if (KS_rampYol(c) !== k.yol) return false;
    if (k.hiz && Math.abs(KS_rampSpeed(c, null) - 1) > 0.005) return false;
  }
  return true;
}

// [T0, T1] ile cakisan ses ogeleri: { track, start, end, hiza (inPoint - start), d }
function KS_rampSesFoto(seq, T0, T1) {
  var foto = [];
  for (var t = 0; t < seq.audioTracks.numTracks; t++) {
    var tr = seq.audioTracks[t];
    for (var i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i], s = Number(c.start.seconds), e = Number(c.end.seconds);
      if (!(e > T0 + 0.001 && s < T1 - 0.001)) continue;
      var kapali = false;
      try { kapali = c.disabled ? true : false; } catch (eD) {}
      foto.push({ track: t, start: s, end: e, hiza: Number(c.inPoint.seconds) - s, d: kapali });
    }
  }
  return foto;
}

/*
 * Ses ogeleri hala ayni araligi ayni hizayla kapliyor mu (razor kesimleri serbest)? Baglanti
 * sessizce kopmadiysa video end yazimlari bagli sesi kirpar: burada yakalanir. tut: 'keep'
 * modunda ac/kapa durumu da ayni olmali.
 */
function KS_rampSesAyni(seq, foto, frame, tut) {
  var yari = frame / 2;
  for (var f = 0; f < foto.length; f++) {
    var k = foto[f], tr = seq.audioTracks[k.track], imlec = k.start;
    if (!tr) return false;
    for (var i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i], s = Number(c.start.seconds), e = Number(c.end.seconds);
      if (!(e > k.start + yari / 2 && s < k.end - yari / 2)) continue;
      if (Math.abs(s - imlec) > yari / 2) return false;
      if (Math.abs((Number(c.inPoint.seconds) - s) - k.hiza) > yari / 2) return false;
      if (tut) {
        var kapali = false;
        try { kapali = c.disabled ? true : false; } catch (eD) {}
        if (kapali !== k.d) return false;
      }
      imlec = e;
    }
    if (Math.abs(imlec - k.end) > yari / 2) return false;
  }
  return true;
}

// Verilen ses katmanlarinda [T0, T1] icindeki, klibin sesine ait parcalar (KS_rampSesImza)
function KS_rampSesParcalari(seq, izler, T0, T1, imzalar, yari) {
  var out = [];
  for (var t in izler) {
    if (!izler.hasOwnProperty(t)) continue;
    var tr = seq.audioTracks[Number(t)];
    for (var i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i], s = Number(c.start.seconds), e = Number(c.end.seconds);
      if (s < T0 - yari || e > T1 + yari) continue;
      if (!KS_rampImzaUyar(imzalar, c)) continue;
      out.push({ clip: c, track: Number(t), start: s, end: e });
    }
  }
  return out;
}

// [t0, t1] icindeki, ilk parcayla ayni medya ve ayni kaynak hizasindaki ses parcalari; ek: rec.ekSes
// (bagli baska medya, ornegin ayri kayit WAV'i: [{yol, hiza}])
function KS_rampSesHizali(seq, ilk, t0, t1, yari, ek) {
  var out = [], yol = KS_rampYol(ilk).toLowerCase(), hiza = Number(ilk.inPoint.seconds) - Number(ilk.start.seconds);
  var ekler = ek instanceof Array ? ek : [];
  for (var t = 0; t < seq.audioTracks.numTracks; t++) {
    var tr = seq.audioTracks[t];
    for (var i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i], s = Number(c.start.seconds), e = Number(c.end.seconds);
      if (s < t0 - yari || e > t1 + yari) continue;
      var es = KS_rampYol(c).toLowerCase() === yol && Math.abs((Number(c.inPoint.seconds) - s) - hiza) <= 0.05;
      if (!es && ekler.length) es = KS_rampImzaUyar(ekler, c);
      if (es) out.push({ clip: c, track: t, start: s, end: e });
    }
  }
  return out;
}

// Video ogesini [a, b] icindeki ayni medya ve ayni kaynak hizasindaki (ve ek) ses parcalariyla bagla
function KS_rampBagla(seq, vk, a, b, frame, ek) {
  if (!vk || typeof seq.linkSelection !== "function") return false;
  var bagla = KS_rampSesHizali(seq, vk, a, b, frame / 2, ek);
  if (!bagla.length) return false;
  KS_rampDeselect(seq);
  try { vk.setSelected(true, true); } catch (eS) {}
  for (var i = 0; i < bagla.length; i++) { try { bagla[i].clip.setSelected(true, true); } catch (eS2) {} }
  try { seq.linkSelection(); } catch (eL) {}
  KS_rampDeselect(seq);
  return true;
}

/*
 * Kismi aralikta bag koparilirken butun video ogesi secilir; Premiere Unlink secili ogeyi tum bag
 * grubundan cikarir, yani aralik disindaki ses parcalarindan da ayrilir. Video T0/T1'de kesildikten
 * sonra dis parcalar ([cs, T0], [T1, ce]: rec.dis) kendi seslerine yeniden baglanir.
 */
function KS_rampDisBagla(seq, rec, frame) {
  var dis = rec.dis || [], tr = seq.videoTracks[Number(rec.track)], yol = String(rec.mediaPath || "").toLowerCase(), n = 0;
  if (!tr || !rec.unlinked) return 0;
  for (var i = 0; i < dis.length; i++) {
    var a = Number(dis[i][0]), b = Number(dis[i][1]);
    var vk = KS_rampClipAt(tr, a, frame);
    if (!vk || Math.abs(Number(vk.end.seconds) - b) > frame / 2 || KS_rampYol(vk).toLowerCase() !== yol) continue;
    if (KS_rampBagla(seq, vk, a, b, frame, rec.ekSes)) n++;
  }
  return n;
}

// Kapatilan ses parcalarini ac, kopan bagi (ilk video parcasi + hizali ses, kismi aralikta dis
// parcalar da) yeniden kur. Video hic kesilmediyse ilk butun klip: kendi araliginin tum sesiyle baglanir.
function KS_rampSesGeri(seq, rec, ilk, frame) {
  var n = 0, i, ses = rec.audio || [];
  for (i = 0; i < ses.length; i++) {
    var at = seq.audioTracks[Number(ses[i].track)];
    var ac = at ? KS_rampClipAt(at, Number(ses[i].start), frame) : null;
    if (ac) { try { ac.disabled = false; n++; } catch (eA) {} }
  }
  if (rec.unlinked) {
    if (ilk) {
      KS_rampBagla(seq, ilk, Math.min(Number(rec.t0), Number(ilk.start.seconds)), Math.max(Number(rec.t1), Number(ilk.end.seconds)), frame, rec.ekSes);
    }
    KS_rampDisBagla(seq, rec, frame);
  }
  return n;
}

/*
 * Rampayi geri al: [t0, t1]'deki parcalarin hepsi ayni medya ve ilk parca t0'da, kaynak girisi
 * srcIn'e 1 kare yakin olmali (yoksa 'degisti', hicbir sey degismez). strict: parcalar bitisik ve
 * son parca t1'de biter (kullanicinin 'Rampayi kaldir'i); ic geri yuklemede bosluk olabilir ve video
 * hic kesilmemisse (ozgun klip yerinde) yalniz ses geri yuklenir.
 * 2..n kaldirilir (remove(false, false): lift, ripple yok), ilk parca TAM %100'e (5e-5) ve t1'e
 * uzatilir, kapatilan ses parcalari acilir, kopan bag linkSelection ile yeniden kurulur.
 * Zaman aradegerlemesi: ilk parcaya Suflo yazmadiysa (rec.ilkInterp null) ozgun ayar zaten
 * onda, dokunulmaz; yazdiysa ozgun bilinmez, Premiere varsayilani (0) yazilir. Secimden kurulan
 * ya da eski kayitta (undefined) dokunulmaz: %100'de aradegerleme gorunmez, 0 yazmak ise
 * kullanicinin kare hizi donusumu ayarini (optik akis) silebilirdi.
 */
function KS_rampRestore(seq, rec, frame, strict) {
  var sonuc = { ok: false, kod: "degisti", removed: 0, audio: 0 };
  try {
    var yari = frame / 2, ti = Number(rec.track), t0 = Number(rec.t0), t1 = Number(rec.t1), i, TAM = 5e-5;
    if (!(ti >= 0) || ti >= seq.videoTracks.numTracks) return sonuc;
    var tr = seq.videoTracks[ti], parca = [];
    var yol = String(rec.mediaPath || "").toLowerCase();
    if (!strict) {
      // Ic geri yukleme: video daha kesilmeden / hizi yazilmadan durulduysa ozgun klip yerinde;
      // yalniz ses geri yuklenir (aralik disindaki kesikler gorunmez kesik olarak kalir)
      for (i = 0; i < tr.clips.numItems; i++) {
        var k = tr.clips[i], ks = Number(k.start.seconds), ke = Number(k.end.seconds);
        if (ks <= t0 + yari && ke >= t1 - yari && KS_rampYol(k).toLowerCase() === yol && Math.abs(KS_rampSpeed(k, null) - 1) <= 0.002 &&
            Math.abs(Number(k.inPoint.seconds) + (t0 - ks) - Number(rec.srcIn)) <= frame + 0.0001) {
          sonuc.audio = KS_rampSesGeri(seq, rec, k, frame);
          sonuc.ok = true;
          sonuc.kod = "";
          return sonuc;
        }
      }
    }
    for (i = 0; i < tr.clips.numItems; i++) {
      var c = tr.clips[i], s = Number(c.start.seconds), e = Number(c.end.seconds);
      if (!(e > t0 + yari && s < t1 - yari)) continue;
      if (s < t0 - yari || e > t1 + yari) return sonuc;
      parca.push(c);
    }
    if (!parca.length) return sonuc;
    if (Math.abs(Number(parca[0].start.seconds) - t0) > yari) return sonuc;
    if (Math.abs(Number(parca[0].inPoint.seconds) - Number(rec.srcIn)) > frame + 0.0001) return sonuc;
    for (i = 0; i < parca.length; i++) {
      if (KS_rampYol(parca[i]).toLowerCase() !== yol) return sonuc;
      if (strict && i && Math.abs(Number(parca[i].start.seconds) - Number(parca[i - 1].end.seconds)) > yari) return sonuc;
    }
    if (strict && Math.abs(Number(parca[parca.length - 1].end.seconds) - t1) > yari) return sonuc;
    sonuc.kod = "geriAlinamadi";
    // Bozucu adim yoksa (strict) her sey yerinde kalir: rampa hala tam, ses kapali ve kayit duruyor.
    // Bir sey degistiyse ya da ic geri yuklemede (yarim rampa) en azindan ses acilip baglanir.
    var bozuldu = false;
    var vazgec = function () {
      if (!strict || bozuldu) {
        try { sonuc.audio = KS_rampSesGeri(seq, rec, KS_rampClipAt(seq.videoTracks[ti], t0, frame), frame); } catch (eS) {}
      }
      return sonuc;
    };
    var qseq = null;
    try {
      app.enableQE();
      if (typeof qe !== "undefined" && qe && qe.project) qseq = qe.project.getActiveSequence();
    } catch (eQ) {}
    var K = Math.round((t1 - t0) / frame), cal = rec.cal && rec.cal.units ? rec.cal : {};
    // 1) HICBIR SEY SILINMEDEN ilk parcayi %100'e al (2..n yerindeyken: hizlanma kisaltir, yavaslama
    // sureyi korur; bos yer gerekmez). QE yoksa ya da hiz yazilamazsa hicbir parca silinmez.
    if (Math.abs(KS_rampSpeed(parca[0], null) - 1) > TAM) {
      var q1 = qseq ? KS_rampQItem(qseq, ti, t0, frame) : null;
      if (!q1 || typeof q1.setSpeed !== "function") return vazgec();
      // Birim bilinmiyorsa once SILINECEK son parcada yokla: yanlis birim (oran yerine yuzde ya da
      // tersi) kaynagi kirpar; o kirpma ilk parcaya degil, zaten kaldirilacak parcaya olur. Yoklama
      // yarim hiza YAVASLATMADIR: dogru birimde sure korunur ve hiz tam tutar (kisa, yavas parcada da),
      // dar pay (K 1000) 'degismedi'yi kabul etmez
      if (!cal.units && parca.length > 1) {
        var son = parca[parca.length - 1], ts = Number(son.start.seconds), vs = KS_rampSpeed(son, null);
        var onceSon = [Number(son.end.seconds), vs];
        KS_rampDeselect(seq);
        var pr = KS_rampSetSpeed({ seq: seq, qseq: qseq, ti: ti, t: ts, frame: frame, v: vs * 0.5, cal: {}, K: 1000 });
        if (pr.units) cal = { units: pr.units, sig: pr.sig };
        var sonK = KS_rampClipAt(seq.videoTracks[ti], ts, frame);
        if (!sonK || Math.abs(Number(sonK.end.seconds) - onceSon[0]) > 0.0001 || Math.abs(KS_rampSpeed(sonK, null) - onceSon[1]) > 1e-6) bozuldu = true;
        if (!cal.units) return vazgec();
      }
      bozuldu = true;
      var b1 = KS_rampHizKur({ seq: seq, qseq: qseq, ti: ti, t: t0, frame: frame, v: 1, Kf: 0, maxSon: 0, cal: cal, tam: true });
      if (b1.units) cal = { units: b1.units, sig: b1.sig };
      if (!b1.ok) {
        // ilk parcanin kaynagi bir kareden kisa (cok yavas, cok kisa parca): 2..n kalktiktan ve uc
        // uzatildiktan sonra yeniden denenir. Baska her hata: kalan parcalar silinmez.
        if (b1.kod !== "tutamak") return vazgec();
      }
    }
    // 2) 2..n kaldir (lift, ripple yok). QE islemlerinden sonra yeniden toplanir.
    bozuldu = true;
    var tr2 = seq.videoTracks[ti], kalan = [];
    for (i = 0; i < tr2.clips.numItems; i++) {
      var c2 = tr2.clips[i], s2 = Number(c2.start.seconds), e2 = Number(c2.end.seconds);
      if (s2 > t0 + yari && s2 < t1 - yari && e2 <= t1 + yari && KS_rampYol(c2).toLowerCase() === yol) kalan.push(c2);
    }
    for (i = kalan.length - 1; i >= 0; i--) {
      try { kalan[i].remove(false, false); sonuc.removed++; } catch (eR) {}
    }
    // 3) ilk parca t1'e: %100'de tam ozgun kaynak; ilk parca hala yavassa once kendi hizinda uzatilir
    // (daha az kaynak), sonra yukaridan %100'e yaklasilir ve yeniden uzatilir
    var ilk = KS_rampClipAt(seq.videoTracks[ti], t0, frame);
    if (!ilk) return vazgec();
    KS_rampSetEnd(ilk, t1);
    for (var tur = 0; tur < 2; tur++) {
      ilk = KS_rampClipAt(seq.videoTracks[ti], t0, frame);
      if (!ilk) return vazgec();
      if (Math.abs(KS_rampSpeed(ilk, null) - 1) <= TAM && Math.abs(Number(ilk.end.seconds) - t1) <= yari) break;
      if (!qseq) return vazgec();
      var b2 = KS_rampHizKur({ seq: seq, qseq: qseq, ti: ti, t: t0, frame: frame, v: 1, Kf: K, maxSon: t1, cal: cal, tam: true });
      if (b2.units) cal = { units: b2.units, sig: b2.sig };
      if (!b2.ok) return vazgec();
    }
    if (typeof rec.ilkInterp === "number" && rec.ilkInterp > 0) {
      var qi = qseq ? KS_rampQItem(qseq, ti, t0, frame) : null;
      if (qi) KS_rampInterp(qi, 0);
    }
    ilk = KS_rampClipAt(seq.videoTracks[ti], t0, frame);
    if (!ilk || Math.abs(Number(ilk.end.seconds) - t1) > yari || Math.abs(KS_rampSpeed(ilk, null) - 1) > TAM ||
        Math.abs(Number(ilk.inPoint.seconds) - Number(rec.srcIn)) > frame + 0.0001) return vazgec();
    sonuc.audio = KS_rampSesGeri(seq, rec, ilk, frame);
    sonuc.ok = true;
    sonuc.kod = "";
    return sonuc;
  } catch (e) {
    sonuc.ok = false;
    return sonuc;
  }
}

/*
 * TEK klip. p: { target {track, start, end, mediaPath}, range {start, end}, plan {mode, segments
 * [[d, v]], srcFrames}, audio 'mute'|'keep', interp {slow 0|1|2, fast 0|1}, cal, expectSeqId,
 * cloneFirst, cloneName }
 * 1) her denetim degisiklikten ONCE  2) istenirse kopya sekans  3) foto  4) bagli ses: T0/T1'de
 * kes, bagi kopar, 'mute' ise aralik icini kapat  5) video T0/T1'de kesilir  6) parca parca:
 * hiz yaz, gerekirse ucu uzat, sonraki sinirda kes  7) dogrula  8) bozulursa KS_rampRestore
 */
function KS_applySpeedRamp(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    if (p.expectSeqId && String(seq.sequenceID) !== String(p.expectSeqId)) return KS_rampHata("sekans");
    var frame = KS_rampFrame(seq), yari = frame / 2, i, k;
    var tg = p.target || {}, rg = p.range || {}, pl = p.plan || {};
    var ti = Number(tg.track), T0 = Number(rg.start), T1 = Number(rg.end);

    // 1) plan ve klip
    var plParca = pl.segments;
    if (!(plParca instanceof Array) || plParca.length < 1 || plParca.length > 40 || !(T1 > T0) || !(Number(pl.srcFrames) > 0)) return KS_rampHata("plan");
    var N = plParca.length, D = [], V = [], topD = 0;
    for (i = 0; i < N; i++) {
      var dd = Number(plParca[i] && plParca[i][0]), vv = Number(plParca[i] && plParca[i][1]);
      if (!(dd >= 1) || Math.floor(dd) !== dd || !(vv >= 0.1 && vv <= 10)) return KS_rampHata("plan");
      D.push(dd); V.push(vv); topD += dd;
    }
    if (topD !== Math.round((T1 - T0) / frame)) return KS_rampHata("plan");
    if (topD < 12) return KS_rampHata("kisa");
    // tek hiz (tek parca ya da hizlar %1 icinde) rampa degil: ses kapatilip 'basarili' denmesin
    var vEn = V[0], vEc = V[0];
    for (i = 1; i < N; i++) { vEn = Math.max(vEn, V[i]); vEc = Math.min(vEc, V[i]); }
    if (N < 2 || vEn / vEc < 1.01) return KS_rampHata("duz");
    if (!(ti >= 0) || ti >= seq.videoTracks.numTracks) return KS_rampHata("degisti");
    var clip = KS_rampHedef(seq, ti, tg, yari);
    if (!clip) return KS_rampHata("degisti");
    var cs = Number(clip.start.seconds), ce = Number(clip.end.seconds);
    if (T0 < cs - yari || T1 > ce + yari) return KS_rampHata("plan");
    var h = KS_rampCheck(seq, clip, ti);
    if (h) return KS_rampHata(h.kod, { pct: h.pct === undefined ? null : h.pct, track: ti });
    try { app.enableQE(); } catch (eQ) {}
    if (typeof qe === "undefined" || !qe || !qe.project) return KS_rampHata("qeYok");
    var qseq = qe.project.getActiveSequence();
    var q0 = qseq ? KS_rampQItem(qseq, ti, cs, frame) : null;
    if (!q0 || typeof q0.setSpeed !== "function") return KS_rampHata("qeYok");
    var bag = KS_rampLinkedAudio(seq, clip);
    // Bag koparma yalniz gercekten (ya da getLinkedItems yoksa belki) bagli ses varken gerekir:
    // Ctrl+L ile koparilmis ayni medya sesi yeniden linkedConflict vermez
    if (KS_rampBagliVar(bag) && typeof seq.unlinkSelection !== "function") {
      return KS_rampHata(KS_rampBagliKesin(bag) ? "linkedConflict" : "linkedBilinmiyor", { track: ti });
    }

    // 2) kopya sekans (ozgun sekans dokunulmamis yedek kalir)
    var yeniSeq = "";
    if (p.cloneFirst) {
      var kop = KS_cloneActiveSeq();
      if (!kop) return KS_rampHata("kopya");
      seq = KS_seq();
      if (!seq || String(seq.sequenceID) !== String(kop.sequenceID)) return KS_rampHata("kopya");
      if (p.cloneName) { try { seq.name = String(p.cloneName); } catch (eN) {} }
      yeniSeq = String(seq.name);
      clip = KS_rampHedef(seq, ti, tg, yari);
      qseq = qe.project.getActiveSequence();
      if (!clip || !qseq) return KS_rampHata("kopya", { newSeq: yeniSeq, seqId: String(seq.sequenceID) });
      bag = KS_rampLinkedAudio(seq, clip);
    }

    // 3) foto
    var seqId = String(seq.sequenceID), mp = KS_rampYol(clip), ad = "";
    try { ad = String(clip.name || ""); } catch (eA) {}
    var cin = Number(clip.inPoint.seconds);
    var srcIn = cin + (T0 - cs);
    var sigma = srcIn + Number(pl.srcFrames) * frame;
    // Dengeli tanim geregi araligin kendi kaynagini kullanir: 4 ondalikli plan artigi Out'u asamaz
    if (String(pl.mode) === "balanced") sigma = Math.min(sigma, srcIn + topD * frame);
    var komsu = KS_rampKomsuFoto(seq, ti, T0, T1, yari, clip);
    var sesFoto = KS_rampSesFoto(seq, T0, T1);
    var undo0 = KS_rampUndoIndex();
    var rec = { v: 1, seqId: seqId, track: ti, t0: T0, t1: T1, srcIn: srcIn, mediaPath: mp, name: ad, audio: [], unlinked: false,
      mode: String(pl.mode || ""), dis: [], ekSes: [], ilkInterp: null };
    if (T0 > cs + yari) rec.dis.push([cs, T0]);
    if (T1 < ce - yari) rec.dis.push([T1, ce]);
    var uyarilar = [], cal = p.cal || {};
    var bozul = function (kod, ek) {
      rec.cal = cal;
      var rs = KS_rampRestore(seq, rec, frame, false);
      var o = { restored: !!rs.ok, newSeq: yeniSeq, seqId: seqId, track: ti };
      if (ek) { for (var x in ek) { if (ek.hasOwnProperty(x)) o[x] = ek[x]; } }
      return KS_rampHata(kod, o);
    };

    try {
      // 4) bagli ses
      if (bag.length) {
        KS_rampDeselect(seq);
        var izler = {};
        for (k = 0; k < bag.length; k++) izler[bag[k].track] = 1;
        for (var iz in izler) {
          if (!izler.hasOwnProperty(iz)) continue;
          var qa = qseq.getAudioTrackAt(Number(iz));
          if (KS_rampIcinden(seq.audioTracks[Number(iz)], T0, yari)) qa.razor(KS_rampTC(T0, frame));
          if (KS_rampIcinden(seq.audioTracks[Number(iz)], T1, yari)) qa.razor(KS_rampTC(T1, frame));
        }
        // bagli baska medya (ayri kayit WAV'i) da kapatilir; kaldirirken yeniden baglanmak uzere kayda girer
        var imzalar = KS_rampSesImza(bag, mp);
        for (k = 0; k < imzalar.length; k++) { if (imzalar[k].hiza !== null) rec.ekSes.push(imzalar[k]); }
        var sesParca = KS_rampSesParcalari(seq, izler, T0, T1, imzalar, yari);
        if (KS_rampBagliVar(bag)) {
          try { clip.setSelected(true, true); } catch (eS1) {}
          for (k = 0; k < sesParca.length; k++) { try { sesParca[k].clip.setSelected(true, true); } catch (eS2) {} }
          var koptu = false;
          try { seq.unlinkSelection(); koptu = true; } catch (eU) {}
          KS_rampDeselect(seq);
          if (!koptu) return bozul("linkedConflict");
          rec.unlinked = true;
        }
        if (p.audio !== "keep") {
          var kapanmadi = 0;
          for (k = 0; k < sesParca.length; k++) {
            var sp = sesParca[k], once = false, kapali = false;
            try { once = sp.clip.disabled ? true : false; } catch (eD0) {}
            if (once) continue;   // kullanicinin zaten kapattigi parca: kayda girmez, geri acilmaz
            try { sp.clip.disabled = true; } catch (eD) {}
            try { kapali = sp.clip.disabled ? true : false; } catch (eD2) {}
            if (kapali) rec.audio.push({ track: sp.track, start: sp.start, end: sp.end });
            else kapanmadi++;
          }
          if (kapanmadi) uyarilar.push("sesKapanmadi");
        }
      }

      // 5) video: aralik kenarlari klibin kesin icindeyse kes
      var qv = qseq.getVideoTrackAt(ti);
      if (T0 > cs + yari) qv.razor(KS_rampTC(T0, frame));
      if (T1 < ce - yari) qv.razor(KS_rampTC(T1, frame));
      var R = KS_rampClipAt(seq.videoTracks[ti], T0, frame);
      if (!R || Math.abs(Number(R.end.seconds) - T1) > yari) return bozul("yerlesim");

      // 6) parca parca kur: her parca KS_rampHizKur ile TAM hizina getirilir (hizlanmada yukaridan
      // yaklasma), ucu yalniz o hizda ve yalniz gerektigi kadar uzatilir: kesilmemis parca bir sonraki
      // sinirin bir kare otesine (orada kesilir), son parca T1'e. Ara adim planin kaynagini (sigma)
      // asmaz: Dengeli'de klibin Out'u medyanin sonu olsa da yeter. Uc yazimlari yalniz [R.end, T1]
      // icinde buyur, orasi da insa geregi bos (komsuya asla tasmaz)
      var Ds = [], kuyruk = [], acc = 0, q = T0, Kler = [];
      for (i = 0; i < N; i++) Ds.push(D[i] * frame);
      for (i = N - 1; i >= 0; i--) { acc += Ds[i] * V[i]; kuyruk[i] = acc; }
      var tip = p.interp || {}, yavasTip = Number(tip.slow) || 0, hizliTip = Number(tip.fast) || 0;
      for (var j = 0; j < N; j++) {
        var sonParca = j === N - 1, qn = q + Ds[j];
        R = KS_rampClipAt(seq.videoTracks[ti], q, frame);
        if (!R) return bozul("yerlesim");
        // i) kapali dongu: kalan kaynak / kalan plan; son parca kalan kaynagi tam tuketir
        var kalanKaynak = sigma - Number(R.inPoint.seconds);
        var duz = kalanKaynak / kuyruk[j];
        if (!isFinite(duz)) duz = 1;
        duz = Math.max(sonParca ? 0.85 : 0.97, Math.min(sonParca ? 1.15 : 1.03, duz));
        var v = V[j] * duz;
        if (sonParca) {
          var vTam = kalanKaynak / (T1 - q);
          if (vTam >= V[j] * 0.85 && vTam <= V[j] * 1.15) v = vTam;
        }
        var Kf = sonParca ? Math.round((T1 - q) / frame) : D[j] + 1, hedefSon = sonParca ? T1 - yari : qn + frame * 0.75;
        var hk = KS_rampHizKur({ seq: seq, qseq: qseq, ti: ti, t: q, frame: frame, v: v, Kf: Kf, maxSon: T1, cal: cal });
        if (hk.units) cal = { units: hk.units, sig: hk.sig };
        if (!hk.ok) return bozul(hk.kod === "qeYok" ? "yerlesim" : (hk.kod === "tutamak" ? "tutamak" : "hizYazilamadi"));
        R = KS_rampClipAt(seq.videoTracks[ti], q, frame);
        if (!R) return bozul("yerlesim");
        if (Number(R.end.seconds) < hedefSon) {
          // ii) medya sonu ucu durdurdu (hizli parcadan sonra az kaynak kaldi, klibin Out'u medyanin sonu):
          // ulasilan kaynagi (Dengeli'de en az sigma'ya kadarini) Kf kareye yayan biraz daha yavas hiz;
          // fark kapali dongude sonraki parcalara gecer, dogrulama payi karar verir
          var ulas = (Number(R.end.seconds) - q) * KS_rampSpeed(R, null);
          if (String(pl.mode) === "balanced") ulas = Math.max(ulas, sigma - Number(R.inPoint.seconds));
          var vAlt = ulas / (Kf * frame);
          if (vAlt < v && vAlt >= V[j] * 0.85) {
            hk = KS_rampHizKur({ seq: seq, qseq: qseq, ti: ti, t: q, frame: frame, v: vAlt, Kf: Kf, maxSon: T1, cal: cal });
            if (hk.units) cal = { units: hk.units, sig: hk.sig };
            if (!hk.ok) return bozul(hk.kod === "qeYok" ? "yerlesim" : (hk.kod === "tutamak" ? "tutamak" : "hizYazilamadi"));
            R = KS_rampClipAt(seq.videoTracks[ti], q, frame);
            if (!R) return bozul("yerlesim");
          }
          if (Number(R.end.seconds) < hedefSon) return bozul("tutamak");
        }
        Kler.push(D[j]);
        if (!sonParca) {
          // iii) sonraki sinirin en az bir kare otesine uzandi; orada kes
          qv.razor(KS_rampTC(qn, frame));
          if (!KS_rampClipAt(seq.videoTracks[ti], qn, frame)) return bozul("yerlesim");
        } else if (Math.abs(Number(R.end.seconds) - T1) > yari) return bozul("tutamak");
        // iv) zaman aradegerlemesi KESIMDEN SONRA: sonraki parca ozgun ayari miras alsin. Yalniz istenen
        // parcaya yazilir (yavas: secilen; hizli: bulaniklik aciksa); %100 civari ve bulaniksiz hizli
        // parca klibin ozgun ayarinda kalir (kare hizi donusumu icin secilmis optik akis bozulmasin)
        var aradeg = V[j] < 0.98 ? yavasTip : (V[j] > 1.02 && hizliTip > 0 ? hizliTip : null);
        if (aradeg !== null) {
          var qi = KS_rampQItem(qseq, ti, q, frame);
          if (qi && KS_rampInterp(qi, aradeg) && j === 0) rec.ilkInterp = aradeg;
        }
        q = qn;
      }

      // 7) dogrula: N bitisik parca T0..T1, hizlar plana yakin, komsular ve ses yerinde
      var tr2 = seq.videoTracks[ti], parcalar = [], hizlar = [];
      for (i = 0; i < tr2.clips.numItems; i++) {
        var pc = tr2.clips[i], ps = Number(pc.start.seconds);
        if (ps > T0 - yari && ps < T1 - yari) parcalar.push(pc);
      }
      if (parcalar.length !== N) return bozul("yerlesim");
      if (Math.abs(Number(parcalar[0].start.seconds) - T0) > yari || Math.abs(Number(parcalar[N - 1].end.seconds) - T1) > yari) return bozul("yerlesim");
      for (i = 0; i < N; i++) {
        if (i && Math.abs(Number(parcalar[i].start.seconds) - Number(parcalar[i - 1].end.seconds)) > yari / 2) return bozul("yerlesim");
        var oku = KS_rampSpeed(parcalar[i], null);
        hizlar.push(Math.round(oku * 10000) / 10000);
        // plan payi %5 (son parca kapali dongunun %15'i) + tam kare suresinin yuvarlama payi
        var izin = (i === N - 1 ? 0.15 : 0.05) + 0.6 / Math.max(1, Kler[i]);
        if (Math.abs(oku - V[i]) / V[i] > izin) return bozul("hizYazilamadi");
      }
      if (!KS_rampKomsuAyni(seq, ti, komsu, frame)) return bozul("yerlesim");
      if (!KS_rampSesAyni(seq, sesFoto, frame, p.audio === "keep")) return bozul("linkedConflict");
      var sonP = parcalar[N - 1];
      var srcSon = Number(sonP.inPoint.seconds) + (Number(sonP.end.seconds) - Number(sonP.start.seconds)) * KS_rampSpeed(sonP, null);
      var srcErr = Math.abs(srcSon - sigma) / frame;
      if (srcErr > 2) uyarilar.push("kaynakKaydi");

      // 8) kismi aralik: dis video parcalarini kendi seslerine yeniden bagla (bag koparilirken ayrildilar)
      KS_rampDisBagla(seq, rec, frame);

      // 9) parcalari sec
      KS_rampDeselect(seq);
      for (i = 0; i < N; i++) { try { parcalar[i].setSelected(true, true); } catch (eSel) {} }
      var undo1 = KS_rampUndoIndex();
      rec.cal = cal;
      return KS_ok({ pieces: N, track: ti, record: rec, cal: cal, speeds: hizlar, srcErr: Math.round(srcErr * 100) / 100,
        undoSteps: (undo0 !== null && undo1 !== null) ? undo1 - undo0 : null, newSeq: yeniSeq, seqId: seqId, warnings: uyarilar });
    } catch (eM) {
      return bozul("yerlesim", { detail: String(eM) });
    }
  } catch (e) { return KS_err(e); }
}

function KS_rampArdisik(a, b, frame) {
  if (KS_rampYol(a).toLowerCase() !== KS_rampYol(b).toLowerCase()) return false;
  if (Math.abs(Number(b.start.seconds) - Number(a.end.seconds)) > frame / 2) return false;
  var beklenen = Number(a.inPoint.seconds) + (Number(a.end.seconds) - Number(a.start.seconds)) * KS_rampSpeed(a, null);
  return Math.abs(Number(b.inPoint.seconds) - beklenen) <= frame * 1.5;
}

function KS_rampYuzde(c) { return Math.abs(KS_rampSpeed(c, null) - 1) <= 0.005; }

// Bilesen listesi (matchName sirasi): ayni klibin razor parcalari ayni; Lumetri eklenmis komsu farkli
function KS_rampBilesenler(c) {
  var out = [], n = 0, comps = null;
  try { comps = c.components; n = Number(comps.numItems) || 0; } catch (e) { return "?"; }
  for (var i = 0; i < n; i++) {
    var mn = "";
    try { mn = String(comps[i].matchName || ""); } catch (e2) {}
    out.push(mn);
  }
  return out.join("|");
}

/*
 * Kayit yoksa secimden (sekans kopyalandi, proje baska makinede, depo silindi, 30'dan fazla rampa):
 * secili parcanin iki yanindaki ayni medya, bitisik, kaynagi devam eden parcalar. Uclardaki %100
 * parcalar rampa sayilmaz (ayni cekimin elle kesilmis devami, ustelik kendi efektleriyle); yalniz iki
 * %100-disi parcanin arasindaki %100 parca icte kalir. Secili parca kirpilan bir %100 uc ise rampa
 * yok. Parcalarin bilesen listesi secili parcayla ayni olmali; degilse (rampa sonradan degismis ya da
 * komsu baska bir klip) 'degisti': hicbir sey silinmez.
 * Ses tahmin edilmez: kapali ayni medya sesini kullanici da kapatmis olabilir. audio [] ve
 * unlinked false; sesKapali > 0 ise panel kullaniciya sesi elle acmasini soyler.
 */
function KS_rampSecimdenKayit(seq, frame) {
  var sec = KS_packSelectedVideo(seq);
  if (!sec.length) return null;
  var ti = sec[0].track, tr = seq.videoTracks[ti], yari = frame / 2, liste = [], i, ix = -1;
  for (i = 0; i < tr.clips.numItems; i++) liste.push(tr.clips[i]);
  for (i = 0; i < liste.length; i++) { if (KS_rampAyni(liste[i], sec[0].clip)) { ix = i; break; } }
  if (ix < 0) return null;
  var bas = ix, son = ix;
  while (bas > 0 && KS_rampArdisik(liste[bas - 1], liste[bas], frame)) bas--;
  while (son < liste.length - 1 && KS_rampArdisik(liste[son], liste[son + 1], frame)) son++;
  while (bas < son && KS_rampYuzde(liste[bas])) bas++;
  while (son > bas && KS_rampYuzde(liste[son])) son--;
  if (ix < bas || ix > son) return null;
  var degisik = false;
  for (i = bas; i <= son; i++) { if (!KS_rampYuzde(liste[i])) degisik = true; }
  if (!degisik) return null;
  var imza = KS_rampBilesenler(liste[ix]);
  for (i = bas; i <= son; i++) { if (KS_rampBilesenler(liste[i]) !== imza) return { kod: "degisti" }; }
  var ilk = liste[bas], yol = KS_rampYol(ilk);
  var t0 = Number(ilk.start.seconds), t1 = Number(liste[son].end.seconds);
  var hiza = Number(ilk.inPoint.seconds) - t0, kapali = 0;
  for (var a = 0; a < seq.audioTracks.numTracks; a++) {
    var at = seq.audioTracks[a];
    for (var c = 0; c < at.clips.numItems; c++) {
      var ac = at.clips[c], s = Number(ac.start.seconds), e = Number(ac.end.seconds);
      if (KS_rampYol(ac).toLowerCase() !== yol.toLowerCase()) continue;
      if (!(e > t0 + yari && s < t1 - yari)) continue;
      if (Math.abs((Number(ac.inPoint.seconds) - s) - hiza) > 0.05) continue;
      var d = false;
      try { d = ac.disabled ? true : false; } catch (eD) {}
      if (d) kapali++;
    }
  }
  var ad = "";
  try { ad = String(ilk.name || ""); } catch (eA) {}
  return { v: 1, seqId: String(seq.sequenceID), track: ti, t0: t0, t1: t1, srcIn: Number(ilk.inPoint.seconds), mediaPath: yol,
    name: ad, audio: [], unlinked: false, mode: "", secimden: true, sesKapali: kapali };
}

// Panelin kayitlarindan secili parcayi iceren (ayni sekans, katman, medya) en yeni kayit
function KS_rampKayitEsle(seq, kayitlar) {
  if (!(kayitlar instanceof Array) || !kayitlar.length) return null;
  var sec = KS_packSelectedVideo(seq);
  if (!sec.length) return null;
  var c = sec[0].clip, ti = sec[0].track, bas = Number(c.start.seconds), yol = KS_rampYol(c).toLowerCase(), sid = String(seq.sequenceID);
  for (var i = kayitlar.length - 1; i >= 0; i--) {
    var k = kayitlar[i];
    if (!k || typeof k !== "object") continue;
    if (k.seqId && String(k.seqId) !== sid) continue;
    if (Number(k.track) !== ti) continue;
    if (String(k.mediaPath || "").toLowerCase() !== yol) continue;
    if (bas >= Number(k.t0) - 0.01 && bas < Number(k.t1) - 0.01) return k;
  }
  return null;
}

/*
 * 'Geri al' / 'Rampayi kaldir' (Ctrl+Z rampayi tek adimda geri almaz: QE kayitlari geri
 * alinir, DOM end/disabled yazimlari cogu zaman alinmaz). p: { record } ya da { fromSelection: true,
 * records? }: secim CANLI okunur; panelin kayitlarindan (records) secili parcayi iceren kayit varsa o
 * kullanilir (ses ve bag bilgisiyle), yoksa geometriden kurulur (KS_rampSecimdenKayit). Ek olarak cal:
 * panelin bu Premiere surumu icin bildigi setSpeed imza/birimi (kayitta yoksa kullanilir; secimden
 * kurulan kayitta hic yoktur). Yoksa KS_rampRestore birimi silinecek son parcada yoklar.
 * Basarida geri gelen klip secili birakilir: panelin 'kaldirip yeniden uygula'si ve onizlemesi onu gorur.
 * Doner: { track, t0, t1, removed, audio, name, seqId, kayit (kullanilan panel kaydi {seqId, track, t0} | null), warnings }
 */
function KS_removeSpeedRamp(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_err("Aktif sequence yok.");
    var frame = KS_rampFrame(seq);
    var rec = p.record || null, panelKaydi = !!rec;
    if (p.fromSelection || !rec) {
      rec = KS_rampKayitEsle(seq, p.records);
      panelKaydi = !!rec;
      if (!rec) {
        rec = KS_rampSecimdenKayit(seq, frame);
        if (rec && rec.kod) return KS_rampHata(rec.kod);
      }
      if (!rec) return KS_rampHata("secimYok");
    } else if (rec.seqId && String(rec.seqId) !== String(seq.sequenceID)) return KS_rampHata("sekans");
    if (!(rec.cal && rec.cal.units) && p.cal && (p.cal.units === "ratio" || p.cal.units === "percent")) {
      rec.cal = { units: String(p.cal.units), sig: String(p.cal.sig || "") };
    }
    var rs = KS_rampRestore(seq, rec, frame, true);
    if (!rs.ok) return KS_rampHata(rs.kod || "degisti", { track: Number(rec.track) });
    var ti = Number(rec.track), uyari = [];
    if (rec.secimden && Number(rec.sesKapali) > 0) uyari.push("sesKayitsiz");
    KS_rampDeselect(seq);
    var geri = KS_rampClipAt(seq.videoTracks[ti], Number(rec.t0), frame);
    if (geri) { try { geri.setSelected(true, true); } catch (eSel) {} }
    return KS_ok({ track: ti, t0: Number(rec.t0), t1: Number(rec.t1), removed: rs.removed, audio: rs.audio, name: String(rec.name || ""),
      seqId: String(seq.sequenceID), kayit: panelKaydi ? { seqId: String(rec.seqId || ""), track: ti, t0: Number(rec.t0) } : null, warnings: uyari });
  } catch (e) { return KS_err(e); }
}

/* ======================================================================
 * Egri (3.4 adim 10): kullanicinin KENDI anahtar karelerine ozel yumusatma
 * ----------------------------------------------------------------------
 * Premiere'in ExtendScript'i Bezier tutamaclarini yazamaz: panel egriyi (js/ease-curve.js
 * bakePlan) iki kullanici anahtari arasina timeline karelerinde sik anahtarlar olarak planlar,
 * host yazar. Paneldeki tum zamanlar TIMELINE saniyesi; ComponentParam anahtarlari klibin KAYNAK
 * zamaninda: KS_presetSourceTime (hiz ve ters oynatmaya duyarli; burada kirpmasiz) ve tersi
 * KS_easeTimeline. Yalniz video katmanlari (v1); ses Volume sonraki surumde.
 *   KS_easePeek()   ucuz yoklama, bilesen yurumez: { seqId, ph, selSig, fps, proje }
 *   KS_easeScan(p)  hedef klip(ler)in anahtarli sayi / [x,y] ozellikleri, playhead'i saran cift
 *   KS_easeBake(p)  dogrula (klip, ozellik, uc anahtarlar ve degerleri, ic anahtar) + yaz; kayit doner
 *   KS_easeUndo(p)  yalniz kaydedilen ve hala duran zamanlari siler; bulunamayan kayitlar geri doner
 * Suflo'nun kendi kodu (temiz oda): ozellik adlari tablosu da Suflo'nun.
 * ====================================================================== */

var KS_EASE_MAX_PROPS = 40;     // taramada en cok ozellik (tum klipler)
var KS_EASE_MAX_KEYS = 400;     // ozellik basina panele giden anahtar
var KS_EASE_MAX_CLIPS = 20;     // toplu: en cok secili klip
var KS_EASE_MAX_ITEM_KEYS = 2000;   // bakePlan sinirinin aynisi
var KS_EASE_MAX_WRITE = 6000;   // tek KS_easeBake cagrisinda en cok yazilan anahtar
var KS_EASE_TOL_KARE = 0.25;    // eslesme toleransi: 0,25 kare (SufloKeyRecords ile ayni)

// Bilinen ozellikler: kucuk harfli Ingilizce ya da Turkce gorunen ad / matchName (AE. oneki atilmis)
// -> Suflo'nun Turkce etiketi (panel Ingilizce arayuzde i18n/en.js ile cevirir). Bilinmeyen ozellik
// Premiere'in kendi adiyla (kullanicinin Premiere dili) gosterilir. ASCII disi harfler \u kacisiyla
// (KS_presetProps gibi): BOM'suz dosya sistem kod sayfasiyla okunsa da etiketler ve anahtarlar bozulmaz.
var KS_EASE_ADLAR = {
  "position": "Konum", "konum": "Konum", "adbe position": "Konum",
  "scale": "\u00D6l\u00E7ek", "\u00F6l\u00E7ek": "\u00D6l\u00E7ek", "olcek": "\u00D6l\u00E7ek", "adbe scale": "\u00D6l\u00E7ek",
  "scale width": "\u00D6l\u00E7ek geni\u015Fli\u011Fi", "\u00F6l\u00E7ek geni\u015Fli\u011Fi": "\u00D6l\u00E7ek geni\u015Fli\u011Fi",
  "adbe scale width": "\u00D6l\u00E7ek geni\u015Fli\u011Fi",
  "rotation": "D\u00F6nd\u00FCrme", "d\u00F6nd\u00FCrme": "D\u00F6nd\u00FCrme", "adbe rotation": "D\u00F6nd\u00FCrme",
  "adbe rotation angle": "D\u00F6nd\u00FCrme",
  "anchor point": "Ba\u011Flant\u0131 noktas\u0131", "ba\u011Flant\u0131 noktas\u0131": "Ba\u011Flant\u0131 noktas\u0131",
  "adbe anchor point": "Ba\u011Flant\u0131 noktas\u0131",
  "anti-flicker filter": "Titreme \u00F6nleme", "titreme \u00F6nleme filtresi": "Titreme \u00F6nleme",
  "adbe anti-flicker filter": "Titreme \u00F6nleme",
  "opacity": "Opakl\u0131k", "opakl\u0131k": "Opakl\u0131k", "opaklik": "Opakl\u0131k", "adbe opacity": "Opakl\u0131k"
};

function KS_easeAd(s) {
  return String(s || "").toLowerCase().replace(/^ae\./, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
}

function KS_easeFps(seq) {
  var f = 0;
  try { f = KS_fps(seq); } catch (e) {}
  return f > 0 && f <= 1000 ? f : 30;
}

// Klibin kaynak capasi: { clipIn, clipOut, ters } (KS_presetSourceTime ile ayni yedekler). Kayit bunu da
// saklar: slip / bastan ripple kirpma klibin baslangicini degil giris noktasini kaydirir; anahtarlar
// (kaynak zamaninda) timeline'da kayar, Geri al onlari bu capayla bulur (KS_easeCapaKaymasi).
function KS_easeKaynak(clip, start, end) {
  var dur = Math.max(0.000001, end - start);
  var sIn = 0, sOut = dur;
  try { sIn = Number(clip.inPoint.seconds); } catch (eIn) {}
  try { sOut = Number(clip.outPoint.seconds); } catch (eOut) {}
  if (!isFinite(sIn)) sIn = 0;
  if (!isFinite(sOut) || Math.abs(sOut - sIn) < 0.000001) sOut = sIn + dur;
  var ters = false;
  try { if (clip.isSpeedReversed) ters = !!clip.isSpeedReversed(); } catch (eR) {}
  return { clipIn: sIn, clipOut: sOut, ters: ters };
}

// Kaynak saniyesi -> timeline saniyesi (KS_presetSourceTime'in tersi, kirpmasiz); kay: KS_easeKaynak
function KS_easeKaynaktan(kay, srcSec, start, end) {
  var dur = Math.max(0.000001, end - start);
  var oran = kay.ters ? (kay.clipOut - Number(srcSec)) / (kay.clipOut - kay.clipIn) : (Number(srcSec) - kay.clipIn) / (kay.clipOut - kay.clipIn);
  return start + oran * dur;
}

function KS_easeTimeline(clip, srcSec, start, end) {
  return KS_easeKaynaktan(KS_easeKaynak(clip, start, end), srcSec, start, end);
}

// Timeline saniyesi -> kaynak saniyesi (KS_presetSourceTime(..., sinirsiz) ile ayni; kay: KS_easeKaynak). Klibin
// eslemesi bir kez okunur, anahtar basina Premiere'e gidilmez (ExtendScript koprusu yavas, ana is parcaciginda).
function KS_easeKaynaga(kay, timelineSec, start, end) {
  var dur = Math.max(0.000001, end - start);
  var oran = (Number(timelineSec) - start) / dur;
  return kay.ters ? kay.clipOut - (kay.clipOut - kay.clipIn) * oran : kay.clipIn + (kay.clipOut - kay.clipIn) * oran;
}

function KS_easeSaniye(t) {
  return Number(t && t.seconds !== undefined ? t.seconds : t);
}

// Ozelligin anahtar zamanlari (timeline saniyesi, artan) ve Time nesneleri: [{ t, k }]. Klibin kaynak eslemesi
// (giris / cikis noktasi, ters) cagri basina BIR kez okunur (kay verildiyse hic okunmaz).
function KS_easeAnahtarlar(clip, prop, start, end, kay) {
  var out = [];
  var ham = null;
  try { ham = prop.getKeys ? prop.getKeys() : null; } catch (e) { ham = null; }
  if (!ham || typeof ham.length !== "number") return out;
  if (!kay && ham.length) kay = KS_easeKaynak(clip, start, end);
  for (var i = 0; i < ham.length; i++) {
    var s = KS_easeSaniye(ham[i]);
    if (!isFinite(s)) continue;
    out.push({ t: KS_easeKaynaktan(kay, s, start, end), k: ham[i] });
  }
  out.sort(function (x, y) { return x.t - y.t; });
  return out;
}

// Deger: sayi ya da [x,y]; baska (renk, onay kutusu, metin) null
function KS_easeDeger(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (v && typeof v !== "string" && typeof v.length === "number" && v.length === 2) {
    var x = Number(v[0]), y = Number(v[1]);
    if (isFinite(x) && isFinite(y)) return [x, y];
  }
  return null;
}

function KS_easeYakin(x, y) { return Math.abs(x - y) <= 1e-3 * Math.max(1, Math.abs(x), Math.abs(y)); }

function KS_easeAyni(a, b) {
  if (typeof a === "number" && typeof b === "number") return KS_easeYakin(a, b);
  if (a && b && typeof a !== "number" && typeof b !== "number" && a.length === 2 && b.length === 2) {
    return KS_easeYakin(Number(a[0]), Number(b[0])) && KS_easeYakin(Number(a[1]), Number(b[1]));
  }
  return false;
}

// Anahtarda deger (Time nesnesiyle); okunamazsa null
function KS_easeDegerAt(prop, k) {
  try { if (prop.getValueAtKey) return KS_easeDeger(prop.getValueAtKey(k)); } catch (e) {}
  try { if (prop.getValueAtTime) return KS_easeDeger(prop.getValueAtTime(k)); } catch (e2) {}
  return null;
}

// Bilesen + ozelligin kimligi: "AE.ADBE Motion/Position" (ozelligin matchName'i varsa o, yoksa gorunen adi).
// Bake bu metni yeniden kurup karsilastirir: efekt sirasi degistiyse (compIdx/propIdx baska ozellige
// dusuyorsa) yazmaz.
function KS_easeKimlik(comp, prop) {
  var cm = "", pm = "";
  try { cm = String(comp.matchName || ""); } catch (e1) {}
  if (!cm) { try { cm = String(comp.displayName || ""); } catch (e2) {} }
  try { pm = String(prop.matchName || ""); } catch (e3) {}
  if (!pm) { try { pm = String(prop.displayName || ""); } catch (e4) {} }
  return (cm + "/" + pm).substr(0, 128);
}

// Opaklik ozelligi mi (deger 0..100 kirpilir). ComponentParam'in matchName'i yok, gorunen adi Premiere'in
// dilinde ("Deckkraft", "Opacite"): Opaklik bileseni (matchName dilden bagimsiz) icinde bilesenle AYNI
// adli parametre opakliktir (maske parametrelerinin adi farkli). Ingilizce / Turkce adlar da kabul.
function KS_easeOpakMi(comp, prop) {
  var cm = "", cd = "", pm = "", pd = "";
  try { cm = KS_easeAd(comp.matchName); } catch (e1) {}
  try { cd = KS_easeAd(comp.displayName); } catch (e2) {}
  try { pm = KS_easeAd(prop.matchName); } catch (e3) {}
  try { pd = KS_easeAd(prop.displayName); } catch (e4) {}
  var opBileseni = cm === "adbe opacity";
  if (opBileseni && (pm === "adbe opacity" || (pd && pd === cd))) return true;
  return /opacity|opakl/.test(cm + " " + cd) && /opacity|opakl/.test(pm + " " + pd);
}

// Hareket > Olcek / Olcek genisligi mi (varista yaylanma degeri >= 0 kirpar; 3.4 adim 14). Ingilizce / Turkce adlar Suflo
// tablosuyla; tablo disi adli (baska dildeki) Premiere'de Hareket bileseninin sabit sirasiyla (1 Olcek, 2 Olcek genisligi)
function KS_easeOlcekMi(comp, prop, pi) {
  var et = KS_easeEtiket(comp, prop);
  if (et.tablo) return et.label === "\u00D6l\u00E7ek" || et.label === "\u00D6l\u00E7ek geni\u015Fli\u011Fi";
  var cm = "";
  try { cm = KS_easeAd(comp.matchName); } catch (e1) {}
  return cm === "adbe motion" && (pi === 1 || pi === 2);
}

// Etiket: once Suflo tablosu (Hareket / Opaklik), yoksa Premiere'in adi (bilesen > ozellik)
function KS_easeEtiket(comp, prop) {
  var adlar = [];
  try { adlar.push(KS_easeAd(prop.matchName)); } catch (e1) {}
  try { adlar.push(KS_easeAd(prop.displayName)); } catch (e2) {}
  var cAd = "";
  try { cAd = String(comp.displayName || ""); } catch (e3) {}
  var cm = "";
  try { cm = KS_easeAd(comp.matchName) + " " + KS_easeAd(cAd); } catch (e4) {}
  var yerlesik = /adbe motion|adbe opacity|(^| )motion|hareket|opacity|opakl/.test(cm);
  if (yerlesik) {
    for (var i = 0; i < adlar.length; i++) {
      if (adlar[i] && KS_EASE_ADLAR.hasOwnProperty(adlar[i])) return { label: KS_EASE_ADLAR[adlar[i]], tablo: true };
    }
  }
  var pAd = "";
  try { pAd = String(prop.displayName || ""); } catch (e5) {}
  return { label: (cAd ? cAd + " \u203A " : "") + (pAd || "?"), tablo: false };
}

// Anahtar kare ara degerlemesi yazilabiliyor mu (KS_apiProbe; ASLA cagrilmaz). Hareket bileseni yoksa null.
function KS_easeInterpVar(clip) {
  try {
    var list = clip.components;
    if (!list) return null;
    for (var i = 0; i < list.numItems; i++) {
      var c = list[i], ad = "";
      try { ad = KS_easeAd(c.matchName) + " " + KS_easeAd(c.displayName); } catch (eA) {}
      if (!/adbe motion|(^| )motion|hareket/.test(ad)) continue;
      if (!c.properties || !(c.properties.numItems > 0)) return null;
      return typeof c.properties[0].setInterpolationTypeAtKey === "function";
    }
  } catch (e) {}
  return null;
}

function KS_easeAyniKlip(a, b) {
  if (a === b) return true;
  try { if (a.nodeId && b.nodeId && String(a.nodeId) === String(b.nodeId)) return true; } catch (e) {}
  return false;
}

// Klibin video katmani (yoksa -1)
function KS_easeKatman(seq, c) {
  try {
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var tr = seq.videoTracks[t];
      for (var i = 0; i < tr.clips.numItems; i++) if (KS_easeAyniKlip(tr.clips[i], c)) return t;
    }
  } catch (e) {}
  return -1;
}

// Video klibi mi: mediaType varsa ona, yoksa video katmanlarinda olmasina bakilir
function KS_easeVideoMu(seq, c) {
  var tur = "";
  try { tur = String(c.mediaType || ""); } catch (e) {}
  if (tur === "Video") return true;
  if (tur === "Audio") return false;
  return KS_easeKatman(seq, c) >= 0;
}

function KS_easeKlipOzeti(c) {
  var o = { nodeId: "", clipName: "", clipStart: 0, clipEnd: 0 };
  try { o.nodeId = String(c.nodeId || ""); } catch (e1) {}
  try { o.clipName = String(c.name || ""); } catch (e2) {}
  try { o.clipStart = Number(c.start.seconds); } catch (e3) {}
  try { o.clipEnd = Number(c.end.seconds); } catch (e4) {}
  return o;
}

// Secili video klipleri (en cok n), timeline sirasiyla; bagli ses ikizi atlanir
function KS_easeSecili(seq, n) {
  var out = [];
  var sel = null;
  try { sel = seq.getSelection(); } catch (e) { sel = null; }
  for (var i = 0; sel && i < sel.length && out.length < n; i++) {
    var c = sel[i];
    if (!c || !KS_easeVideoMu(seq, c)) continue;
    var tekrar = false;
    for (var j = 0; j < out.length; j++) if (KS_easeAyniKlip(out[j], c)) tekrar = true;
    if (!tekrar) out.push(c);
  }
  out.sort(function (a, b) { return KS_easeKlipOzeti(a).clipStart - KS_easeKlipOzeti(b).clipStart; });
  return out;
}

// Katman hedef olamaz mi: kilitli (Suflo kilitli katmana yazmaz; ExtendScript kilidi kendisi uygulamaz) ya da gizli
// (goz kapali: izleyicinin gordugu katman degil). KS_speedRampTargets'teki gibi.
function KS_easeKatmanKapali(tr) {
  try { if (tr.isLocked && tr.isLocked()) return true; } catch (eL) {}
  try { if (tr.isMuted && tr.isMuted()) return true; } catch (eM) {}
  return false;
}
// Devre disi klip (Etkin isareti kapali): izleyicinin gordugu klip degil
function KS_easeKlipKapali(c) {
  try { return c.disabled === true; } catch (e) { return false; }
}
// Klibin katmani kilitli mi (bake / geri al yazmaz; 'kilitli'). dizin: KS_klipDizini (istege bagli)
function KS_easeKilitli(seq, c, dizin) {
  var ti = dizin ? KS_klipDizindeKatman(dizin, c) : -1;
  if (ti < 0) ti = KS_easeKatman(seq, c);
  if (ti < 0) return false;
  try { var tr = seq.videoTracks[ti]; return !!(tr.isLocked && tr.isLocked()); } catch (e) { return false; }
}

// Playhead'in altindaki en ustteki video klibi: kilitli / gizli katman ve devre disi klip atlanir (izleyicinin gordugu,
// Suflo'nun yazabilecegi klip)
function KS_easeUstteki(seq, ph) {
  try {
    for (var t = seq.videoTracks.numTracks - 1; t >= 0; t--) {
      var tr = seq.videoTracks[t];
      if (KS_easeKatmanKapali(tr)) continue;
      for (var i = 0; i < tr.clips.numItems; i++) {
        var c = tr.clips[i];
        if (KS_easeKlipKapali(c)) continue;
        var a = Number(c.start.seconds), b = Number(c.end.seconds);
        if (ph >= a - 1e-6 && ph < b - 1e-6) return c;
      }
    }
  } catch (e) {}
  return null;
}

/*
 * Sekansin video klipleri BIR kez yurunur (kayit basina tum sekansi yurumek binlerce klipte dakikalar surer):
 * nid: nodeId -> { c, t (katman) } (ilk bulunan), ad: ad -> [{ c, bas }] (yuruyus sirasiyla). KS_klipDizindeBul,
 * KS_easeKlipBul ile ayni sonucu verir (once nodeId, yoksa ad + baslangic yarim kare icinde, ilk bulunan).
 */
function KS_klipDizini(seq) {
  var d = { nid: {}, ad: {} };
  try {
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var tr = seq.videoTracks[t];
      for (var i = 0; i < tr.clips.numItems; i++) {
        var c = tr.clips[i], nid = "", ad = null, bas = NaN;
        try { nid = String(c.nodeId || ""); } catch (eN) {}
        if (nid && !d.nid.hasOwnProperty("n" + nid)) d.nid["n" + nid] = { c: c, t: t };
        try { ad = String(c.name); bas = Number(c.start.seconds); } catch (eA) { ad = null; }
        if (ad !== null) {
          if (!d.ad.hasOwnProperty("a" + ad)) d.ad["a" + ad] = [];
          d.ad["a" + ad].push({ c: c, bas: bas });
        }
      }
    }
  } catch (e) {}
  return d;
}
function KS_klipDizindeBul(d, h, fps) {
  if (!h) return null;
  if (h.nodeId && d.nid.hasOwnProperty("n" + String(h.nodeId))) return d.nid["n" + String(h.nodeId)].c;
  if (h.clipName !== undefined && h.clipStart !== undefined && h.clipStart !== null) {
    var l = d.ad.hasOwnProperty("a" + String(h.clipName)) ? d.ad["a" + String(h.clipName)] : null, yari = 0.5 / fps;
    for (var i = 0; l && i < l.length; i++) if (Math.abs(l[i].bas - Number(h.clipStart)) <= yari) return l[i].c;
  }
  return null;
}
// Klibin katmani dizinden (nodeId ile; yoksa -1)
function KS_klipDizindeKatman(d, c) {
  var nid = "";
  try { nid = String(c.nodeId || ""); } catch (e) {}
  return nid && d.nid.hasOwnProperty("n" + nid) ? d.nid["n" + nid].t : -1;
}

// Klibi nodeId ile, yoksa ad + baslangic (yarim kare icinde) ile bul
function KS_easeKlipBul(seq, h, fps) {
  if (!h) return null;
  var yari = 0.5 / fps, adli = null;
  try {
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var tr = seq.videoTracks[t];
      for (var i = 0; i < tr.clips.numItems; i++) {
        var c = tr.clips[i];
        var nid = "";
        try { nid = String(c.nodeId || ""); } catch (eN) {}
        if (h.nodeId && nid && nid === String(h.nodeId)) return c;
        if (!adli && h.clipName !== undefined && h.clipStart !== undefined && h.clipStart !== null) {
          try { if (String(c.name) === String(h.clipName) && Math.abs(Number(c.start.seconds) - Number(h.clipStart)) <= yari) adli = c; } catch (eA) {}
        }
      }
    }
  } catch (e) {}
  return adli;
}

/*
 * Birlestirme yuruyusu: artan anahtarlar [{ t }] ile zamanlar (siralanir) arasinda tol icinde eslesen
 * ANAHTAR indisleri (her anahtar en cok bir kez). O(n + m): ExtendScript yavas, 2000 x 2000 ic ice
 * dongu saniyeler surer.
 */
function KS_easeEslestir(anahtarlar, zamanlar, tol) {
  var z = [];
  for (var q = 0; q < zamanlar.length; q++) { var v = Number(zamanlar[q]); if (isFinite(v)) z.push(v); }
  z.sort(function (x, y) { return x - y; });
  var out = [], i = 0, j = 0;
  while (i < z.length && j < anahtarlar.length) {
    var d = anahtarlar[j].t - z[i];
    if (Math.abs(d) <= tol) { out.push(j); i++; j++; }
    else if (d < 0) j++;
    else i++;
  }
  return out;
}

// Sirali anahtarlarda t'ye tol icinde bir anahtarin indisi (yoksa -1)
function KS_easeBulIndis(liste, t, tol) {
  for (var i = 0; i < liste.length; i++) if (Math.abs(liste[i].t - t) <= tol) return i;
  return -1;
}

// Playhead'i saran cift: playhead bir anahtarin ustundeyse o anahtar ve sonraki (son anahtarda bir onceki)
function KS_easeCift(anahtarlar, ph, tol) {
  var n = anahtarlar.length;
  if (n < 2 || ph < anahtarlar[0].t - tol || ph > anahtarlar[n - 1].t + tol) return null;
  var i = 0;
  while (i < n - 2 && ph >= anahtarlar[i + 1].t - tol) i++;
  return { i0: i, i1: i + 1 };
}

// Panelin verdigi uclar (canli Suflo kaydi) playhead'i sariyorsa cift odur: kaydin ic anahtarlari
// cifti bolmesin (Egri yeniden uygulanirken degistir ile yalniz kendi yazdiklari degisir). Aralik sonda
// yari acik (js/egri-model.js ciftBul ile ayni): playhead B'nin ustundeyse duz kural gecerli (B ve sonraki);
// B son anahtarsa kaydin cifti kalir (son anahtarda bir onceki cift).
function KS_easeIpucu(ipuclari, kimlik, ph, anahtarlar, tol) {
  if (!ipuclari || typeof ipuclari.length !== "number") return null;
  for (var i = 0; i < ipuclari.length && i < 400; i++) {
    var u = ipuclari[i];
    if (!u || String(u.nodeId) !== kimlik.nodeId || Number(u.compIdx) !== kimlik.compIdx || Number(u.propIdx) !== kimlik.propIdx) continue;
    var a = Number(u.t0), b = Number(u.t1);
    if (!(isFinite(a) && isFinite(b) && b > a) || ph < a - tol || ph > b + tol) continue;
    var i0 = KS_easeBulIndis(anahtarlar, a, tol), i1 = KS_easeBulIndis(anahtarlar, b, tol);
    if (!(i0 >= 0 && i1 > i0)) continue;
    if (ph >= b - tol && i1 < anahtarlar.length - 1) continue;
    return { i0: i0, i1: i1, kayitli: true };
  }
  return null;
}

/*
 * Playhead modunda sonucun gecerli oldugu aralik (yoklama bunun disinda yeniden tarar): secilen klibin
 * araligi, UST katmanlardaki kliplerle kirpilir (playhead oraya girince en ustteki klip degisir). ust null
 * (playhead altinda klip yok): tum video katmanlarinda playhead'i saran bosluk (bir klibe girince taranir).
 */
function KS_easeKapsam(seq, ph, ust) {
  var a = -1e9, b = 1e9, ti = -1;
  if (ust) {
    try { a = Number(ust.start.seconds); b = Number(ust.end.seconds); } catch (eU) {}
    ti = KS_easeKatman(seq, ust);
  }
  try {
    for (var t = ti + 1; t < seq.videoTracks.numTracks; t++) {
      var tr = seq.videoTracks[t];
      if (KS_easeKatmanKapali(tr)) continue;   // KS_easeUstteki gibi: hedef olamayan katman kapsami bolmez
      for (var i = 0; i < tr.clips.numItems; i++) {
        var c = tr.clips[i], cs = NaN, ce = NaN;
        if (KS_easeKlipKapali(c)) continue;
        try { cs = Number(c.start.seconds); ce = Number(c.end.seconds); } catch (eC) {}
        if (!isFinite(cs) || !isFinite(ce)) continue;
        // KS_easeUstteki ile ayni sinirlar: [cs - 1e-6, ce - 1e-6) playhead'i icerir
        if (ph >= ce - 1e-6) { if (Math.min(ce, ph) > a) a = Math.min(ce, ph); }
        else if (ph < cs - 1e-6) { if (cs < b) b = cs; }
      }
    }
  } catch (eT) {}
  return [a, b];
}

// Tarama degerIste listesinde bu satir (nodeId + compIdx + propIdx) var mi (en cok 40 oge bakilir)
function KS_easeDegerIstendi(liste, kim) {
  if (!liste || typeof liste.length !== "number") return false;
  for (var i = 0; i < liste.length && i < KS_EASE_MAX_PROPS; i++) {
    var u = liste[i];
    if (u && String(u.nodeId) === kim.nodeId && Number(u.compIdx) === kim.compIdx && Number(u.propIdx) === kim.propIdx) return true;
  }
  return false;
}

/*
 * Ucuz yoklama (panel 1,2 sn'de bir, yalniz Egri sekmesi gorunur ve panel odaktayken): bilesen
 * yurumez. selSig: en cok 8 secili video klibinin "nodeId|baslangic|bitis"i.
 */
function KS_easePeek() {
  try {
    var seq = KS_seq();
    var proje = "";
    try { proje = String(app.project.path || ""); } catch (eP) {}
    if (!seq) return KS_ok({ seqId: "", ph: 0, selSig: "", fps: 30, proje: proje });
    var ph = 0;
    try { ph = Number(seq.getPlayerPosition().seconds) || 0; } catch (ePh) {}
    var imza = [];
    var sel = null;
    try { sel = seq.getSelection(); } catch (eS) { sel = null; }
    for (var i = 0; sel && i < sel.length && imza.length < 8; i++) {
      var c = sel[i], tur = "";
      try { tur = String(c.mediaType || ""); } catch (eT) {}
      if (tur === "Audio") continue;
      var o = KS_easeKlipOzeti(c);
      imza.push(o.nodeId + "|" + Math.round(o.clipStart * 10000) / 10000 + "|" + Math.round(o.clipEnd * 10000) / 10000);
    }
    return KS_ok({ seqId: String(seq.sequenceID), ph: ph, selSig: imza.join(","), fps: KS_easeFps(seq), proje: proje });
  } catch (e) { return KS_err(e); }
}

/*
 * p: { maxProps (<= 40), ipuclari: [{ nodeId, compIdx, propIdx, t0, t1 }] (canli Suflo kayitlarinin uclari),
 *      degerIste?: [{ nodeId, compIdx, propIdx }] (3.4 adim 14: bu satirlara degerler eklenir) }
 * Hedef: secili video klipleri (en cok 20), yoksa playhead'in altindaki en ustteki video klibi.
 * Doner: { seqId, ph, fps, proje, kaynak: 'secim'|'playhead'|'yok', kapsam: [a, b) (bu sonucun gecerli
 *   oldugu playhead araligi: secimde sinirsiz; playhead'de klibin ust katmanlarla kirpilmis araligi; klip
 *   yoksa playhead'i saran bosluk; 400'den cok anahtarda pencere), klipler: [...], props: [{ nodeId, clipName, clipStart, clipEnd,
 *   clipIn, clipOut, ters (kaynak capasi: panel kaydin canliligini slip / ripple kirpmadan sonra da bununla olcer), compIdx,
 *   propIdx, matchName, label, labelTablo, opak, tur: 'sayi'|'xy', keys (timeline sn), kesik,
 *   pair: { t0, t1, i0, i1, ic, kayitli } | null, v0, v1, fps, kfInterp (Bezier yazilabilir mi), degerler? (degerIste'de olan
 *   satirda keys ile hizali degerler) }], atlanan (sinir disi ozellik) }
 */
function KS_easeScan(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_errKod("sekansYok", "Aktif sequence yok.");
    var fps = KS_easeFps(seq), tol = KS_EASE_TOL_KARE / fps;
    var ph = 0;
    try { ph = Number(seq.getPlayerPosition().seconds) || 0; } catch (ePh) {}
    var enCok = Number(p.maxProps);
    if (!(enCok >= 1 && enCok <= KS_EASE_MAX_PROPS)) enCok = KS_EASE_MAX_PROPS;
    var proje = "";
    try { proje = String(app.project.path || ""); } catch (eP) {}
    var hedefler = KS_easeSecili(seq, KS_EASE_MAX_CLIPS), kaynak = "secim";
    var kapsamA = -1e9, kapsamB = 1e9;
    if (!hedefler.length) {
      var ust = KS_easeUstteki(seq, ph);
      if (ust) {
        hedefler = [ust];
        kaynak = "playhead";
      } else kaynak = "yok";
      var kp = KS_easeKapsam(seq, ph, ust);
      kapsamA = kp[0];
      kapsamB = kp[1];
    }
    var klipler = [], props = [], atlanan = 0;
    for (var h = 0; h < hedefler.length; h++) {
      var clip = hedefler[h];
      var oz = KS_easeKlipOzeti(clip);
      oz.track = KS_easeKatman(seq, clip);
      klipler.push(oz);
      var kay = KS_easeKaynak(clip, oz.clipStart, oz.clipEnd);
      var comps = null;
      try { comps = clip.components; } catch (eC) { comps = null; }
      if (!comps) continue;
      for (var ci = 0; ci < comps.numItems; ci++) {
        var comp = comps[ci], plist = null;
        try { plist = comp.properties; } catch (eL) { plist = null; }
        if (!plist) continue;
        for (var pi = 0; pi < plist.numItems; pi++) {
          var prop = plist[pi];
          var degisken = false;
          try { degisken = !!(prop.isTimeVarying && prop.isTimeVarying()); } catch (eV) {}
          if (!degisken) continue;
          var ilk = null;
          try { ilk = KS_easeDeger(prop.getValue()); } catch (eG) { ilk = null; }
          if (ilk === null) continue;
          var an = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd, kay);
          if (an.length < 2) continue;
          if (props.length >= enCok) { atlanan++; continue; }
          var kim = { nodeId: oz.nodeId, compIdx: ci, propIdx: pi };
          var cift = KS_easeIpucu(p.ipuclari, kim, ph, an, tol) || KS_easeCift(an, ph, tol);
          // 400'den cok anahtar: playhead'in cevresindeki pencere (kapsam daralir; disina cikinca panel yeniden tarar)
          var bas = 0, son = an.length, kesik = false;
          if (an.length > KS_EASE_MAX_KEYS) {
            kesik = true;
            var orta = cift ? cift.i0 : (ph > an[an.length - 1].t ? an.length - 1 : 0);
            bas = Math.max(0, Math.min(an.length - KS_EASE_MAX_KEYS, orta - Math.floor(KS_EASE_MAX_KEYS / 2)));
            son = bas + KS_EASE_MAX_KEYS;
            // canli Suflo kaydinin araligi pencereden genis olabilir (Her kare, uzun cift): iki ucu ve tum ic
            // anahtarlari gider; panel canliligi bu anahtarlarla olcer, cift kaybolmaz
            if (cift && cift.kayitli && cift.i1 - cift.i0 < KS_EASE_MAX_ITEM_KEYS * 2) {
              if (cift.i0 < bas) bas = cift.i0;
              if (cift.i1 >= son) son = cift.i1 + 1;
            }
            if (cift && (cift.i0 < bas || cift.i1 >= son)) cift = null;
            else if (cift) cift = { i0: cift.i0 - bas, i1: cift.i1 - bas, kayitli: cift.kayitli };
            if (bas > 0) kapsamA = Math.max(kapsamA, an[bas].t);
            if (son < an.length) kapsamB = Math.min(kapsamB, an[son - 1].t);
            // pencereden tasan canli kayit (playhead disinda): playhead kaydin araligina girince yeniden
            // taransin (ipucuyla kaydin tum anahtarlari gelir; yarim pencereyle cift bolunmesin)
            var ipl = p.ipuclari, wA = an[bas].t, wB = an[son - 1].t;
            for (var u = 0; ipl && typeof ipl.length === "number" && u < ipl.length && u < 400; u++) {
              var hu = ipl[u];
              if (!hu || String(hu.nodeId) !== kim.nodeId || Number(hu.compIdx) !== ci || Number(hu.propIdx) !== pi) continue;
              var ha = Number(hu.t0), hb = Number(hu.t1);
              if (!(isFinite(ha) && isFinite(hb) && hb > ha) || (ha >= wA - tol && hb <= wB + tol)) continue;
              if (hb <= ph + tol) kapsamA = Math.max(kapsamA, Math.min(hb, ph));
              else if (ha > ph) kapsamB = Math.min(kapsamB, ha);
            }
          }
          var keys = [];
          for (var k = bas; k < son; k++) keys.push(Math.round(an[k].t * 1000000) / 1000000);
          var etiket = KS_easeEtiket(comp, prop);
          var oge = {
            nodeId: oz.nodeId, clipName: oz.clipName, clipStart: oz.clipStart, clipEnd: oz.clipEnd, track: oz.track,
            clipIn: kay.clipIn, clipOut: kay.clipOut, ters: kay.ters, compIdx: ci, propIdx: pi, matchName: KS_easeKimlik(comp, prop), label: etiket.label, labelTablo: etiket.tablo,
            opak: KS_easeOpakMi(comp, prop), tur: typeof ilk === "number" ? "sayi" : "xy",
            keys: keys, kesik: kesik, toplam: an.length, pair: null, v0: null, v1: null, fps: fps,
            // 3.4 adim 14: varista yaylanma Bezier (5) yazabilir mi (yalniz typeof; KS_apiProbe kfInterp ile ayni denetim)
            kfInterp: typeof prop.setInterpolationTypeAtKey === "function"
          };
          // Varista yaylanma (3.4 adim 14): istenen satirlarda tum anahtarlarin degerleri (keys ile hizali; okunamayan null).
          // Yalniz Uygula'da ve yalniz isaretli satirlar icin istenir (yoklamada degil): 40 x 400 okuma yavas olur
          if (KS_easeDegerIstendi(p.degerIste, kim)) {
            var dg = [];
            for (var kd = bas; kd < son; kd++) dg.push(KS_easeDegerAt(prop, an[kd].k));
            oge.degerler = dg;
          }
          if (cift) {
            oge.pair = { t0: keys[cift.i0], t1: keys[cift.i1], i0: cift.i0, i1: cift.i1, ic: cift.i1 - cift.i0 - 1, kayitli: !!cift.kayitli };
            oge.v0 = KS_easeDegerAt(prop, an[bas + cift.i0].k);
            oge.v1 = KS_easeDegerAt(prop, an[bas + cift.i1].k);
          }
          props.push(oge);
        }
      }
    }
    return KS_ok({ seqId: String(seq.sequenceID), ph: ph, fps: fps, proje: proje, kaynak: kaynak, kapsam: [kapsamA, kapsamB],
      klipler: klipler, props: props, atlanan: atlanan });
  } catch (e) { return KS_err(e); }
}

/*
 * p: { target: { nodeId, clipName, clipStart, seqId }, items: [{ compIdx, propIdx, matchName, t0, t1, v0, v1,
 *      keys: [{ t, v }] (yalniz IC anahtarlar, timeline sn), degistir?, eski?: [t] }], degistir: bool, dogrusal: bool }
 * Her oge yazilmadan once dogrulanir: ozellik ayni (kimlik), t0 ve t1'de anahtar var ve degerleri ~ v0/v1,
 * arada anahtar yok (degistir ise once silinir; eski verildiyse yalniz o zamanlardaki anahtarlar, baska ic
 * anahtar varsa icAnahtar). Opaklikta degerler 0..100. Bir ogenin reddi digerini durdurmaz.
 * tur 'yaylan' ogeleri (3.4 adim 14, varista yaylanma) KS_easeYaylanOge ile yazilir: inis anahtarindan SONRA, Bezier (5)
 * ya da 2 karede bir sik. Doner:
 * { basarili, sonuclar: [{ i, ok, kod, yazilan, silinen, interp? ('bezier' | 'yogun') }], records: [...], yazilan, dogrusal,
 *   bezier (Bezier yapilan yaylanma anahtari), yogun (Bezier yazilamadigi icin sik yazilan yaylanma ogesi) }.
 */
function KS_easeBake(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_errKod("sekansYok", "Aktif sequence yok.");
    var h = p.target || {};
    if (h.seqId && String(h.seqId) !== String(seq.sequenceID)) return KS_errKod("sekans", "Egri baska bir sekans icin hazirlandi.");
    var fps = KS_easeFps(seq), tol = KS_EASE_TOL_KARE / fps;
    var items = p.items;
    if (!items || typeof items.length !== "number" || !items.length || items.length > KS_EASE_MAX_PROPS) return KS_errKod("gecersiz", "Gecersiz egri plani.");
    var clip = KS_easeKlipBul(seq, h, fps);
    if (!clip) return KS_errKod("klipYok", "Klip bulunamadi.");
    // kilitli katmana yazilmaz (ExtendScript kilidi uygulamaz; Suflo'nun diger yazma yollari gibi)
    if (KS_easeKilitli(seq, clip)) return KS_errKod("kilitli", "Katman kilitli.");
    var oz = KS_easeKlipOzeti(clip);
    if (h.clipStart !== undefined && h.clipStart !== null && Math.abs(oz.clipStart - Number(h.clipStart)) > tol) {
      return KS_errKod("klipTasindi", "Klip tasinmis.");
    }
    var kay = KS_easeKaynak(clip, oz.clipStart, oz.clipEnd);
    var toplamYaz = 0;
    for (var s = 0; s < items.length; s++) {
      var sy = items[s] || {};
      var n1 = sy.keys && sy.keys.length ? sy.keys.length : 0, n2 = sy.yogunKeys && sy.yogunKeys.length ? sy.yogunKeys.length : 0;
      toplamYaz += Math.max(n1, n2);
    }
    if (toplamYaz > KS_EASE_MAX_WRITE) return KS_errKod("cokFazla", "Cok fazla anahtar kare.");

    var sonuclar = [], records = [], yazilanToplam = 0, dogrusalSayi = 0, bezierSayi = 0, yogunSayi = 0;
    var sonYazim = null;   // en son yazilan anahtar: UI yalniz onda tazelenir
    var seqKimlik = String(seq.sequenceID);
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var r = { i: i, ok: false, kod: "", yazilan: 0, silinen: 0 };
      sonuclar.push(r);
      var comp = null, prop = null;
      try { comp = clip.components[Number(it.compIdx)]; } catch (eC) { comp = null; }
      try { prop = comp ? comp.properties[Number(it.propIdx)] : null; } catch (eP) { prop = null; }
      if (!prop || KS_easeKimlik(comp, prop) !== String(it.matchName || "")) { r.kod = "ozellik"; continue; }
      if (it.tur === "yaylan") {
        var yo = KS_easeYaylanOge(clip, oz, kay, comp, prop, it, p.degistir === true, tol, seqKimlik);
        r.silinen = yo.silinen;
        if (yo.sonYazim) sonYazim = yo.sonYazim;
        if (!yo.kayit) { r.kod = yo.kod || "yazilamadi"; if (yo.ic) r.ic = yo.ic; continue; }
        r.ok = true;
        r.kod = yo.kod;
        r.yazilan = yo.kayit.times.length;
        r.interp = yo.bezier ? "bezier" : "yogun";
        yazilanToplam += r.yazilan;
        if (yo.bezier) bezierSayi += yo.interp; else yogunSayi++;
        records.push(yo.kayit);
        continue;
      }
      var t0 = Number(it.t0), t1 = Number(it.t1);
      if (!(isFinite(t0) && isFinite(t1) && t1 > t0)) { r.kod = "gecersiz"; continue; }
      var plan = it.keys && typeof it.keys.length === "number" ? it.keys : [];
      if (plan.length > KS_EASE_MAX_ITEM_KEYS) { r.kod = "cokFazla"; continue; }
      var an = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd, kay);
      var j0 = KS_easeBulIndis(an, t0, tol), j1 = KS_easeBulIndis(an, t1, tol);
      if (j0 < 0 || j1 < 0) { r.kod = "ucYok"; continue; }
      var d0 = KS_easeDegerAt(prop, an[j0].k), d1 = KS_easeDegerAt(prop, an[j1].k);
      if (d0 === null || d1 === null || !KS_easeAyni(d0, it.v0) || !KS_easeAyni(d1, it.v1)) { r.kod = "degisti"; continue; }
      var ic = [];
      for (var a = 0; a < an.length; a++) if (an[a].t > t0 + tol && an[a].t < t1 - tol) ic.push(an[a]);
      // degistir: cagri geneli ya da oge basina (panel yalniz kendi canli kaydinin araligini degistirir)
      if (ic.length && !(p.degistir === true || it.degistir === true)) { r.kod = "icAnahtar"; r.ic = ic.length; continue; }
      // degistir + eski (panelin canli kaydinin zamanlari): yalniz Suflo'nun eski egrisi silinir. Kullanici
      // araya kendi anahtarini eklediyse yazilmaz: o anahtar sessizce silinmesin (Geri al da onu korur)
      if (ic.length && it.eski && typeof it.eski.length === "number") {
        var eskiZ = [];
        for (var ez = 0; ez < it.eski.length && ez < 4096; ez++) eskiZ.push(it.eski[ez]);
        var eskiEs = KS_easeEslestir(ic, eskiZ, tol);
        if (eskiEs.length < ic.length) { r.kod = "icAnahtar"; r.ic = ic.length - eskiEs.length; continue; }
      }
      // Opaklik 0..100: panel kirpar; host da kirpar (dil / ad tanimasi panelde tutmasa da deger tasmasin)
      var opak = KS_easeOpakMi(comp, prop);
      // plan dogrulamasi: her anahtar uclarin arasinda, deger ozelligin turunde
      var temiz = [], bozuk = false;
      for (var q = 0; q < plan.length; q++) {
        var pt = Number(plan[q] && plan[q].t), pv = KS_easeDeger(plan[q] ? plan[q].v : null);
        if (!isFinite(pt) || pt <= t0 + tol || pt >= t1 - tol || pv === null || (typeof pv === "number") !== (typeof d0 === "number")) { bozuk = true; break; }
        if (opak && typeof pv === "number") pv = Math.max(0, Math.min(100, pv));
        temiz.push({ t: pt, v: pv });
      }
      if (bozuk) { r.kod = "gecersiz"; continue; }
      for (var x = ic.length - 1; x >= 0; x--) {
        try { prop.removeKey(ic[x].k); r.silinen++; } catch (eRm) {}
      }
      var yazilan = [];
      var interp = p.dogrusal !== false && typeof prop.setInterpolationTypeAtKey === "function";
      for (var w = 0; w < temiz.length; w++) {
        var src = KS_easeKaynaga(kay, temiz[w].t, oz.clipStart, oz.clipEnd);
        if (!isFinite(src) || src < 0) continue;
        var zt = KS_presetTime(src);
        var eklendi = false;
        try { prop.addKey(zt); eklendi = true; } catch (eAdd) {}
        try {
          prop.setValueAtKey(zt, temiz[w].v, false);
        } catch (eSet) {
          // anahtar eklendi ama degeri yazilamadi: ara degerle duran, kayitsiz (Geri al'in bilmedigi) bir
          // anahtar kalmasin
          if (eklendi) { try { prop.removeKey(zt); } catch (eRm2) {} }
          continue;
        }
        yazilan.push(temiz[w].t);
        sonYazim = { prop: prop, t: zt, v: temiz[w].v };
        // 0 = dogrusal: sik anahtarlar arasinda Bezier dalgalanmasi olmasin (kullanicinin uc anahtarlarina dokunulmaz)
        if (interp) { try { prop.setInterpolationTypeAtKey(zt, 0, false); dogrusalSayi++; } catch (eI) {} }
      }
      // dogrulama: yazilan zamanlar gercekten anahtar mi (Premiere cagriyi hatasiz kabul edip yazmayabilir)
      var sonra = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd, kay), dogru = [];
      var bulunan = KS_easeEslestir(sonra, yazilan, tol);
      for (var y = 0; y < bulunan.length; y++) dogru.push(Math.round(sonra[bulunan[y]].t * 1000000) / 1000000);
      r.yazilan = dogru.length;
      yazilanToplam += dogru.length;
      if (!dogru.length) { r.kod = temiz.length ? "yazilamadi" : "bos"; continue; }
      r.ok = true;
      if (dogru.length < temiz.length) r.kod = "eksik";
      records.push({ tur: "egri", seqId: String(seq.sequenceID), nodeId: oz.nodeId, clipName: oz.clipName, clipStart: oz.clipStart,
        clipEnd: oz.clipEnd, clipIn: kay.clipIn, clipOut: kay.clipOut, ters: kay.ters, matchName: String(it.matchName), compIdx: Number(it.compIdx), propIdx: Number(it.propIdx), uclar: [t0, t1], times: dogru,
        kenarDegerleri: [{ t: t0, v: d0 }, { t: t1, v: d1 }] });
    }
    // Effect Controls / Program bir kez tazelensin: yalniz en son yazimda updateUI (her anahtarda true
    // vermek panel cizimini saniyelerce kilitler)
    if (sonYazim) { try { sonYazim.prop.setValueAtKey(sonYazim.t, sonYazim.v, true); } catch (eUi) {} }
    var basarili = 0;
    for (var b = 0; b < sonuclar.length; b++) if (sonuclar[b].ok) basarili++;
    return KS_ok({ basarili: basarili, sonuclar: sonuclar, records: records, yazilan: yazilanToplam, dogrusal: dogrusalSayi,
      bezier: bezierSayi, yogun: yogunSayi, seqId: String(seq.sequenceID), nodeId: oz.nodeId, clipName: oz.clipName });
  } catch (e) { return KS_err(e); }
}

/*
 * Varista yaylanma ogesi (3.4 adim 14; KS_easeBake icinden). it: { tur: 'yaylan', t0 (inis anahtari), v0, t1 / v1 (sonraki
 * anahtar; null: inis son anahtar), keys (seyrek plan: tepe / cukurlar ve pencere sonu), yogunKeys (2 karede bir), degistir?,
 * eski?: [t] }. Dogrulama: t0'da anahtar var ve degeri ~ v0; t1 verildiyse orada anahtar var ('sonrakiYok') ve degeri ~ v1;
 * aradaki (t1 yoksa inisten sonraki tum) anahtarlar yalniz eski (ayni inisin canli yaylanmasi) olabilir, baska anahtar varsa
 * 'icAnahtar'. degistir ile eskinin inisten sonra hala duran tum anahtarlari once silinir (kullanici pencerenin ortasina anahtar
 * koyduysa onun otesindekiler de: sahipsiz kalmasin). Yazilan her anahtar inisten SONRA, sonraki anahtardan ve klibin sonundan once.
 * Premiere ara degerlemeyi yazabiliyorsa (setInterpolationTypeAtKey var; KS_apiProbe kfInterp ile ayni denetim) seyrek plan yazilir
 * ve her yeni anahtar Bezier (5) yapilir: tepe / cukurlar yumusak okunur. Yazamiyorsa 2 karede bir sik plan (Premiere'in varsayilan
 * dogrusal ara degeri); islev var ama bir anahtarda bile Bezier yapamazsa yeni seyrek anahtarlar silinip sik plan yazilir (interp
 * 'yogun'). Opaklik 0..100, Olcek >= 0 kirpilir. Inis ve sonraki anahtar kullanicinindir: degerine de ara degerlemesine de dokunulmaz.
 * Doner: { kod, ic?, silinen, kayit (tur 'yaylan'; uclar null, kenarDegerleri [inis]) | null, bezier, interp (5 yapilan), sonYazim }
 */
function KS_easeYaylanOge(clip, oz, kay, comp, prop, it, degistirHepsi, tol, seqId) {
  var o = { kod: "", silinen: 0, kayit: null, bezier: false, interp: 0, sonYazim: null };
  var t0 = Number(it.t0), t1 = it.t1 === null || it.t1 === undefined ? null : Number(it.t1);
  if (!isFinite(t0) || (t1 !== null && !(isFinite(t1) && t1 > t0))) { o.kod = "gecersiz"; return o; }
  var bezier = typeof prop.setInterpolationTypeAtKey === "function";
  var seyrek = it.keys && typeof it.keys.length === "number" ? it.keys : [];
  var yogun = it.yogunKeys && typeof it.yogunKeys.length === "number" ? it.yogunKeys : [];
  if (bezier && !seyrek.length) bezier = false;
  var plan = bezier ? seyrek : yogun;
  if (!plan.length) { o.kod = "bos"; return o; }
  if (plan.length > KS_EASE_MAX_ITEM_KEYS) { o.kod = "cokFazla"; return o; }
  var an = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd, kay);
  var j0 = KS_easeBulIndis(an, t0, tol);
  if (j0 < 0) { o.kod = "ucYok"; return o; }
  var d0 = KS_easeDegerAt(prop, an[j0].k);
  if (d0 === null || !KS_easeAyni(d0, it.v0)) { o.kod = "degisti"; return o; }
  var ust = Number(oz.clipEnd);
  if (t1 !== null) {
    var j1 = KS_easeBulIndis(an, t1, tol);
    if (j1 < 0) { o.kod = "sonrakiYok"; return o; }
    var d1 = KS_easeDegerAt(prop, an[j1].k);
    if (d1 === null || !KS_easeAyni(d1, it.v1)) { o.kod = "degisti"; return o; }
    if (t1 < ust) ust = t1;
  }
  var ic = [], sonrasi = [];
  for (var a = 0; a < an.length; a++) {
    if (an[a].t <= t0 + tol) continue;
    sonrasi.push(an[a]);
    if (t1 === null || an[a].t < t1 - tol) ic.push(an[a]);
  }
  // degistir + eski: ayni inisin eski yaylanmasinin hala duran anahtarlari (inisten sonra, nerede olursa olsun: kullanici
  // pencerenin ortasina anahtar koyduysa yeni yaylanma ondan once biter, eskisinin otesindeki anahtarlari da sahipsiz kalmaz)
  var sil = [];
  if ((degistirHepsi || it.degistir === true) && it.eski && typeof it.eski.length === "number") {
    var eskiZ = [];
    for (var ez = 0; ez < it.eski.length && ez < 4096; ez++) eskiZ.push(it.eski[ez]);
    var es = KS_easeEslestir(sonrasi, eskiZ, tol);
    for (var e1 = 0; e1 < es.length; e1++) sil.push(sonrasi[es[e1]]);
  }
  // aradaki her anahtar eski yaylanmanin olmali; kullanicinin araya ekledigi anahtar varsa yazilmaz (sessizce silinmez)
  var yabanci = 0;
  for (var c1 = 0; c1 < ic.length; c1++) {
    var eskiMi = false;
    for (var c2 = 0; c2 < sil.length && !eskiMi; c2++) if (sil[c2] === ic[c1]) eskiMi = true;
    if (!eskiMi) yabanci++;
  }
  if (yabanci) { o.kod = "icAnahtar"; o.ic = yabanci; return o; }
  // Opaklik 0..100, Olcek >= 0 (panel asimi sinira sigdirir; bu yalniz son guvence)
  var opak = KS_easeOpakMi(comp, prop), olcek = !opak && KS_easeOlcekMi(comp, prop, Number(it.propIdx));
  function temizle(liste) {
    var out = [];
    for (var q = 0; q < liste.length; q++) {
      var pt = Number(liste[q] && liste[q].t), pv = KS_easeDeger(liste[q] ? liste[q].v : null);
      if (!isFinite(pt) || pt <= t0 + tol || pt >= ust - tol || pv === null || (typeof pv === "number") !== (typeof d0 === "number")) return null;
      if (opak && typeof pv === "number") pv = Math.max(0, Math.min(100, pv));
      if (olcek && typeof pv === "number" && pv < 0) pv = 0;
      out.push({ t: pt, v: pv });
    }
    return out;
  }
  var temiz = temizle(plan);
  if (!temiz) { o.kod = "gecersiz"; return o; }
  // Bezier yazilamazsa (islev var ama cagri hata verir) yedek: 2 karede bir sik plan
  var yedek = bezier && yogun.length && yogun.length <= KS_EASE_MAX_ITEM_KEYS ? temizle(yogun) : null;
  for (var x = sil.length - 1; x >= 0; x--) {
    try { prop.removeKey(sil[x].k); o.silinen++; } catch (eRm) {}
  }
  // liste: temiz anahtarlar; bez: her yeni anahtar Bezier (5) yapilir. Doner: { t: [timeline sn], z: [Time], interp }
  function yaz(liste, bez) {
    var r = { t: [], z: [], interp: 0 };
    for (var w = 0; w < liste.length; w++) {
      var src = KS_easeKaynaga(kay, liste[w].t, oz.clipStart, oz.clipEnd);
      if (!isFinite(src) || src < 0) continue;
      var zt = KS_presetTime(src);
      var eklendi = false;
      try { prop.addKey(zt); eklendi = true; } catch (eAdd) {}
      try {
        prop.setValueAtKey(zt, liste[w].v, false);
      } catch (eSet) {
        if (eklendi) { try { prop.removeKey(zt); } catch (eRm2) {} }
        continue;
      }
      r.t.push(liste[w].t);
      r.z.push(zt);
      o.sonYazim = { prop: prop, t: zt, v: liste[w].v };
      // 5 = Premiere'in Bezier'i (KS_presetKeys'teki seyrek anahtarlar gibi): tepe / cukurlar arasi yumusak
      if (bez) { try { prop.setInterpolationTypeAtKey(zt, 5, false); r.interp++; } catch (eI) {} }
    }
    return r;
  }
  var yazim = yaz(temiz, bezier);
  if (bezier && yazim.interp < yazim.t.length) {
    // setInterpolationTypeAtKey var ama Bezier yapamadi: seyrek tepeler Premiere'in varsayilan ara degeriyle koseli zikzak
    // olurdu. Yedek varsa yeni yazilan seyrek anahtarlar silinir, sik plan yazilir; panel "2 karede bir yazildi" der
    bezier = false;
    if (yedek) {
      for (var g = yazim.z.length - 1; g >= 0; g--) { try { prop.removeKey(yazim.z[g]); } catch (eRm3) {} }
      o.sonYazim = null;
      temiz = yedek;
      yazim = yaz(temiz, false);
    }
  }
  var yazilan = yazim.t;
  o.interp = bezier ? yazim.interp : 0;
  var sonra = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd, kay), dogru = [];
  var bulunan = KS_easeEslestir(sonra, yazilan, tol);
  for (var y = 0; y < bulunan.length; y++) dogru.push(Math.round(sonra[bulunan[y]].t * 1000000) / 1000000);
  o.bezier = bezier;
  if (!dogru.length) { o.kod = "yazilamadi"; return o; }
  if (dogru.length < temiz.length) o.kod = "eksik";
  o.kayit = { tur: "yaylan", seqId: seqId, nodeId: oz.nodeId, clipName: oz.clipName, clipStart: oz.clipStart, clipEnd: oz.clipEnd,
    clipIn: kay.clipIn, clipOut: kay.clipOut, ters: kay.ters, matchName: String(it.matchName), compIdx: Number(it.compIdx), propIdx: Number(it.propIdx),
    uclar: null, times: dogru, kenarDegerleri: [{ t: t0, v: d0 }] };
  return o;
}

var KS_EASE_CANLI_ORAN = 0.6;   // SufloKeyRecords.canli ile ayni esik
// Geri al, canli olmayan Egri kaydi (uclar yerinde): kayitli zamanlarin bu orandan azi yerindeyse eslesenler rastlantidir
// (Suflo'nun anahtarlari Ctrl+Z ile gitti, kullanici ayni karelere kendi anahtarini koydu): kayit biter ('yok'). Bu oran ile
// %60 arasinda Suflo'nun anahtarlarinin bir kismi hala duruyor: hicbiri silinmez, kayit saklanir ('kismi').
var KS_EASE_KALINTI_ORAN = 0.2;

function KS_easeKaydir(dizi, d) {
  var out = [];
  for (var i = 0; i < dizi.length; i++) { var v = Number(dizi[i]); if (isFinite(v)) out.push(v + d); }
  return out;
}

function KS_easeSayi(v) { return typeof v === "number" && isFinite(v); }

/*
 * Kaydin kaynak capasindan (kayittaki clipStart / clipEnd / clipIn / clipOut / ters) bugunku klibe kayma: kayit
 * zamani -> o gunku eslemeyle kaynak saniyesi -> bugunku klibin timeline saniyesi. Klibin hizi ve yonu ayniyken
 * (tasima, slip, bastan / sondan duz ya da ripple kirpma ve bunlarin bilesimi) tum anahtarlar ayni kadar kayar.
 * a, b: kaydin uclari; iki uctaki kayma tol / 2'den cok ayrisirsa (hiz ya da yon degisti) ya da kayitta capa
 * yoksa (eski kayit) NaN. oz: { clipStart, clipEnd }, kay: KS_easeKaynak. (Panelde egri-model.js capaKaymasi.)
 */
function KS_easeCapaKaymasi(rec, oz, kay, a, b, tol) {
  if (!KS_easeSayi(rec.clipStart) || !KS_easeSayi(rec.clipEnd) || !KS_easeSayi(rec.clipIn) || !KS_easeSayi(rec.clipOut)) return NaN;
  if (!kay || (rec.ters === true) !== (kay.ters === true)) return NaN;
  var bas = Number(oz.clipStart), son = Number(oz.clipEnd);
  var rDur = rec.clipEnd - rec.clipStart, rKay = rec.clipOut - rec.clipIn;
  var kKay = kay.clipOut - kay.clipIn;
  if (!(rDur > 0.000001) || !(Math.abs(rKay) > 0.000001) || !(son - bas > 0.000001) || !(Math.abs(kKay) > 0.000001)) return NaN;
  function yeni(t) {
    var oran = (t - rec.clipStart) / rDur;
    var src = rec.ters === true ? rec.clipOut - rKay * oran : rec.clipIn + rKay * oran;
    return KS_easeKaynaktan(kay, src, bas, son);
  }
  var d0 = yeni(a) - a, d1 = yeni(b) - b;
  if (!isFinite(d0) || !isFinite(d1) || Math.abs(d1 - d0) > tol / 2) return NaN;
  return (d0 + d1) / 2;
}

/*
 * Kaydin bugunku anahtarlarla eslesmesi (SufloKeyRecords.canliAyrinti'nin host esi). Kaydin anahtarlari
 * klibin KAYNAK zamaninda durur: klip duzenlenince (tasima, slip, ripple kirpma) anahtarlar timeline'da
 * kayar, kayit (timeline saniyesi) kaymaz. Adaylar sirasiyla: kaydin kaynak capasindan kayma
 * (KS_easeCapaKaymasi; hiz ve yon ayniyken), kaymasiz (duz bas kirpma anahtari yerinde birakir) ve klibin
 * baslangic kaymasi kadar (capasiz eski kayit: kayit.clipStart -> bugunku baslangic). Canli aday: iki uc
 * yerinde ve zamanlarin en az %60'i eslesir. oz: { clipStart, clipEnd }, kay: KS_easeKaynak.
 * Doner: { canli, d, es (eslesen anahtar indisleri), koru (kullanicinin uclari, kaydirilmis) } ya da
 * { canli: false, ciftVar (bir adayda iki uc yerinde) }.
 */
function KS_easeKayitEsle(an, rec, oz, kay, tol) {
  var times = KS_easeKaydir(rec.times && typeof rec.times.length === "number" ? rec.times : [], 0);
  var koru = null;
  if (rec.uclar && rec.uclar.length === 2) {
    koru = [Number(rec.uclar[0]), Number(rec.uclar[1])];
    if (!(isFinite(koru[0]) && isFinite(koru[1]))) koru = null;
  }
  // uc yoksa (baska araclarin kaydi) ilk ve son zaman uc sayilir (SufloKeyRecords gibi); onlar korunmaz
  var gerekli = koru || (times.length ? [times[0], times[times.length - 1]] : null);
  if (!gerekli) return { canli: false, ciftVar: false, enCok: 0, toplam: 0, capaTutarsiz: false };
  var adaylar = [];
  var dc = KS_easeCapaKaymasi(rec, oz, kay, gerekli[0], gerekli[1], tol);
  // Kayitta kaynak capasi var ama bugunku klibe sabit kaymayla oturmuyor (klibin hizi ya da yonu degisti): anahtarlar
  // yerinde olabilir, yalniz bulunamaz. Hicbiri eslesmese de "zaten kaldirilmis" ('yok') denmez (cagiran 'degisti' der).
  var capaTutarsiz = KS_easeSayi(rec.clipStart) && KS_easeSayi(rec.clipEnd) && KS_easeSayi(rec.clipIn) && KS_easeSayi(rec.clipOut) && !isFinite(dc);
  if (isFinite(dc) && Math.abs(dc) > 0.000001) adaylar.push(dc);
  adaylar.push(0);
  var klipBas = Number(oz.clipStart);
  if (KS_easeSayi(rec.clipStart) && isFinite(klipBas) && Math.abs(klipBas - rec.clipStart) > tol) {
    var dm = klipBas - rec.clipStart;
    if (!isFinite(dc) || Math.abs(dm - dc) > 0.000001) adaylar.push(dm);
  }
  // enCok: herhangi bir adayda yerinde duran kayitli zaman sayisinin en buyugu (0: Suflo'nun anahtarlarinin hepsi
  // gitmis: Premiere'de geri alinmis ya da silinmis; KS_removeSufloKeys kaydi bitirir)
  var ciftVar = false, enCok = 0;
  for (var a = 0; a < adaylar.length; a++) {
    var d = adaylar[a];
    var tz = KS_easeKaydir(times, d);
    var es = KS_easeEslestir(an, tz, tol);
    if (es.length > enCok) enCok = es.length;
    var ucVar = KS_easeBulIndis(an, gerekli[0] + d, tol) >= 0 && KS_easeBulIndis(an, gerekli[1] + d, tol) >= 0;
    if (!ucVar) continue;
    ciftVar = true;
    if (tz.length && es.length >= KS_EASE_CANLI_ORAN * tz.length - 1e-9) {
      return { canli: true, d: d, es: es, koru: koru ? [koru[0] + d, koru[1] + d] : null, gerekli: [gerekli[0] + d, gerekli[1] + d], enCok: es.length,
        toplam: times.length, capaTutarsiz: false };
    }
  }
  return { canli: false, ciftVar: ciftVar, enCok: enCok, toplam: times.length, capaTutarsiz: capaTutarsiz };
}

/*
 * p: { records: [SufloKeyRecords kaydi] }. Yalniz CANLI kayitta (KS_easeKayitEsle: iki uc yerinde, zamanlarin
 * en az %60'i; klip tasindi, slip ya da ripple kirpildiysa kaymasiyla) kaydedilen ve HALA duran zamanlar (0,25 kare tolerans) silinir;
 * kayit uclari (kullanicinin anahtarlari) ve kullanicinin sonradan ekledigi anahtarlar kalir. Sonra t0'daki
 * deger updateUI ile yeniden yazilir (Program monitoru tazelensin). Canli degilse hicbir sey silinmez:
 * cift yerinde ama Suflo'nun anahtarlari gitmis (Ctrl+Z, elle silme) -> sonuclar'da kod 'yok' (kayit biter);
 * cift de yoksa (klibin hizi / uc anahtarlar degisti) -> atlanan 'degisti' (panel saklar). Baska sekanstaki /
 * bulunamayan klibin / degisen ozelligin kaydi da dokunulmadan atlanan'da doner.
 * egriler (istege bagli, 3.4 adim 14): ayni sekansin diger Egri sekmesi kayitlari. Varista yaylanmanin anahtari baska bir
 * Egri'nin ucuysa (kullanici iki yaylanma anahtari arasina egri uyguladiysa) o Egri'nin ic anahtarlari da silinir, kaydi biter
 * (KS_kayitEgriUclari; KS_removeSufloKeys'teki gibi).
 * Doner: { sonuclar: [{ id, ok, kod, silinen }], atlanan: [{ id, kod }], egriBiten: [id] }.
 */
function KS_easeUndo(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_errKod("sekansYok", "Aktif sequence yok.");
    var fps = KS_easeFps(seq), tol = KS_EASE_TOL_KARE / fps;
    var recs = p.records && typeof p.records.length === "number" ? p.records : [];
    var egriler = p.egriler && typeof p.egriler.length === "number" ? p.egriler : [];
    var egriBitti = {}, egriBiten = [];
    for (var eb = 0; eb < recs.length && eb < 300; eb++) if (recs[eb] && recs[eb].id) egriBitti[String(recs[eb].id)] = 1;
    // Once Egri kayitlari, sonra varista yaylanmalar (Tumunu geri al'da liste depo sirasinda gelir): ucu bir yaylanma
    // anahtarinda duran Egri, yaylanma o ucu silmeden geri alinir; yoksa canli sayilmaz ('degisti'), ic anahtarlari kalirdi
    var sira = [];
    for (var s1 = 0; s1 < recs.length && s1 < 300; s1++) if (!(recs[s1] && recs[s1].tur === "yaylan")) sira.push(s1);
    for (var s2 = 0; s2 < recs.length && s2 < 300; s2++) if (recs[s2] && recs[s2].tur === "yaylan") sira.push(s2);
    var sonuclar = [], atlanan = [];
    // Klipler cagri basina bir kez dizinlenir (kayit basina tum sekansi yurumek binlerce klipte yavas)
    var dizin = null;
    for (var si = 0; si < sira.length; si++) {
      var rec = recs[sira[si]] || {};
      var id = String(rec.id || "");
      if (rec.seqId && String(rec.seqId) !== String(seq.sequenceID)) { atlanan.push({ id: id, kod: "sekans" }); continue; }
      if (!dizin) dizin = KS_klipDizini(seq);
      var clip = KS_klipDizindeBul(dizin, rec, fps);
      if (!clip) { atlanan.push({ id: id, kod: "klipYok" }); continue; }
      // kilitli katmana yazilmaz: kayit saklanir, kilit acilinca yeniden denenir
      if (KS_easeKilitli(seq, clip, dizin)) { atlanan.push({ id: id, kod: "kilitli" }); continue; }
      var comp = null, prop = null;
      try { comp = clip.components[Number(rec.compIdx)]; } catch (eC) { comp = null; }
      try { prop = comp ? comp.properties[Number(rec.propIdx)] : null; } catch (eP) { prop = null; }
      if (!prop || KS_easeKimlik(comp, prop) !== String(rec.matchName || "")) { atlanan.push({ id: id, kod: "ozellik" }); continue; }
      var oz = KS_easeKlipOzeti(clip);
      var kay = KS_easeKaynak(clip, oz.clipStart, oz.clipEnd);
      var an = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd, kay);
      var esle = KS_easeKayitEsle(an, rec, oz, kay, tol);
      if (!esle.canli) {
        // ucsuz kayit (varista yaylanma; uclari kendi anahtarlari): Suflo'nun anahtarlarindan hicbiri yerinde degilse biter
        // (KS_removeSufloKeys gibi; klibin hizi / yonu degistiyse anahtarlar bulunamaz ama durabilir: 'degisti').
        // Uclu Egri kaydi, kullanicinin uclari yerinde: kayitli zamanlarin %20'sinden azi duruyorsa (rastlanti: Ctrl+Z sonrasi
        // kullanicinin ayni kareye koydugu anahtar) kayit biter; daha cogu duruyorsa Suflo'nun anahtarlarinin bir kismi hala
        // klipte: hicbiri silinmez (canli degil), kayit saklanir ('kismi'), panel nedenini soyler.
        var ucsuz = !(rec.uclar && rec.uclar.length === 2);
        if (ucsuz) {
          if (!(esle.enCok > 0) && !esle.capaTutarsiz) sonuclar.push({ id: id, ok: true, silinen: 0, kod: "yok" });
          else atlanan.push({ id: id, kod: "degisti" });
        } else if (esle.ciftVar) {
          if (!(esle.enCok > 0) || esle.enCok < KS_EASE_KALINTI_ORAN * esle.toplam - 1e-9) sonuclar.push({ id: id, ok: true, silinen: 0, kod: "yok" });
          else atlanan.push({ id: id, kod: "kismi", kalan: esle.enCok });
        } else atlanan.push({ id: id, kod: "degisti" });
        continue;
      }
      var uc = esle.gerekli, koru = esle.koru;
      var sil = [], es = esle.es;
      for (var k = 0; k < es.length; k++) {
        var a = an[es[k]];
        // uclar kullanicinin: kayitta gecse bile silinmez
        if (koru && (Math.abs(a.t - koru[0]) <= tol || Math.abs(a.t - koru[1]) <= tol)) continue;
        sil.push(a);
      }
      // Ucu bu anahtarlarda duran diger Egri sekmesi kayitlari (silmeden once, ayni anahtar listesiyle)
      var egriAday = egriler.length ? KS_kayitEgriUclari(egriler, egriBitti, seq, fps, clip, oz, kay,
        String(rec.matchName || ""), an, sil, tol, dizin) : [];
      var silinen = 0;
      for (var s = sil.length - 1; s >= 0; s--) {
        try { prop.removeKey(sil[s].k); silinen++; } catch (eR) {}
      }
      for (var ea = 0; silinen && ea < egriAday.length; ea++) {
        var eg = egriAday[ea], egSil = 0;
        for (var ek = eg.keys.length - 1; ek >= 0; ek--) {
          var ayni = false;
          for (var sk = 0; sk < sil.length && !ayni; sk++) if (Math.abs(sil[sk].t - eg.keys[ek].t) <= tol) ayni = true;
          if (ayni) continue;
          try { prop.removeKey(eg.keys[ek].k); egSil++; } catch (eR3) {}
        }
        egriBitti[eg.id] = 1;
        egriBiten.push(eg.id);
        silinen += egSil;
      }
      if (silinen) {
        // Program monitoru tazelensin: kalan bir uc anahtarin degeri updateUI ile yeniden yazilir
        var kalan = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd, kay);
        var j = uc ? KS_easeBulIndis(kalan, uc[0], tol) : -1;
        if (j < 0 && uc) j = KS_easeBulIndis(kalan, uc[1], tol);
        if (j < 0 && kalan.length) j = 0;
        if (j >= 0) {
          var v = null;
          try { v = prop.getValueAtKey(kalan[j].k); } catch (eV) { v = null; }
          if (v !== null && v !== undefined) { try { prop.setValueAtKey(kalan[j].k, KS_presetCloneValue(v), true); } catch (eU) {} }
        }
      }
      sonuclar.push({ id: id, ok: true, silinen: silinen, kod: silinen ? "" : "yok" });
    }
    return KS_ok({ sonuclar: sonuclar, atlanan: atlanan, egriBiten: egriBiten });
  } catch (e) { return KS_err(e); }
}

/* ======================================================================
 * Suflo'nun yazdigi anahtar karelerin kaydi ve guvenli kaldirma (3.4 adim 11)
 *
 * Gecis (KS_applyCutTransition), Zoom (KS_autoZoom) ve Hareket onayari (KS_applyMotionPreset) yazdiklari her
 * ozellik icin bir KAYIT dondurur (js/key-records.js bicimi; tur 'gecis' | 'zoom' | 'hareket'):
 *   { tur, seqId, nodeId, clipName, clipStart, clipEnd, clipIn, clipOut, ters (kaynak capasi), matchName
 *     (KS_easeKimlik), compIdx, propIdx, uclar: null, times (yazilip dogrulanan anahtarlarin timeline saniyesi),
 *     kenarDegerleri: [{ t, v }] (yazilacak araligin iki ucunda, Suflo yazmadan once ozelligin degeri) }
 * Panel kayitlari proje basina saklar (SufloKeyRecords; js/kayit-kaldir.js). KS_removeSufloKeys yalniz CANLI
 * kayitlarin (iki uc yerinde ve zamanlarin en az %60'i; KS_easeKayitEsle) kaydedilen ve hala duran
 * anahtarlarini siler; kullanicinin anahtarlarina dokunmaz, kenar degerlerini geri koyar.
 * Suflo'nun kendi kodu (temiz oda).
 * ====================================================================== */

var KS_GECIS_MAX_HALF = 0.8;     // js/transitions.js'teki en buyuk yari sure (KS_applyCutTransition penceresi)
var KS_KALDIR_MAX_KAYIT = 300;   // tek cagrida en cok kayit (SufloKeyRecords proje siniri)

function KS_projeYolu() {
  try { return String(app.project.path || ""); } catch (e) { return ""; }
}

// Kayit toplayici: KS_kayitliYaz yazilan her ozelligin kaydini kayitlar'a, KS_kayitTemizle yazmadan once temizlenen
// pencereleri temizlenen'e ekler (panel eski kayitlarin yerine gecilip gecilmedigine bununla karar verir)
function KS_kayitToplayici(seq, tur) { return { seq: seq, tur: tur, kayitlar: [], temizlenen: [] }; }

// Kayitlarin toplam anahtar sayisi (3.4 adim 12: ozel egriyle yazilan sik anahtarlar bildirimde)
function KS_kayitYazilan(kt) {
  var n = 0;
  for (var i = 0; kt && kt.kayitlar && i < kt.kayitlar.length; i++) n += kt.kayitlar[i].times ? kt.kayitlar[i].times.length : 0;
  return n;
}

// Eslesme toleransi (0,25 kare, saniye): panel temizlenen zamanlari eski kayitlarla bununla karsilastirir
function KS_kayitTol(kt) {
  var fps = 30;
  try { fps = KS_easeFps(kt.seq); } catch (e) {}
  return KS_EASE_TOL_KARE / fps;
}

/*
 * Pencereyi [ta, tb] (timeline saniyesi) temizler (KS_presetClearKeys) ve ne oldugunu soyler. kt ve yer
 * (KS_presetProps().yer[ad]) verilirse kt.temizlenen'e bir girdi eklenir (ayni klip + ozellik birlesir):
 *   { seqId, nodeId, clipName, clipStart, clipEnd, clipIn, clipOut, ters, matchName, pencereler: [[a, b]],
 *     times (silinmeden once duran ve silinen anahtarlarin timeline saniyesi), bosaldi (ozellikte anahtar kalmadi) }
 * Doner: { n (silinen), bosaldi, ilk, son }: ilk / son, temizlik ozelligi bosaltacaksa (tum anahtarlar pencerede)
 * silinmeden once okunan ilk ve son anahtarin degeri (pencerenin hemen oncesi / sonrasi; yoksa null).
 */
function KS_kayitTemizle(kt, clip, start, end, prop, yer, ta, tb) {
  var r = { n: 0, bosaldi: false, ilk: null, son: null };
  if (!prop) return r;
  var lo = Math.min(ta, tb), hi = Math.max(ta, tb);
  var once = KS_easeAnahtarlar(clip, prop, start, end);
  if (once.length && once[0].t >= lo - 0.003 && once[once.length - 1].t <= hi + 0.003) {
    r.ilk = KS_easeDegerAt(prop, once[0].k);
    r.son = KS_easeDegerAt(prop, once[once.length - 1].k);
  }
  r.n = KS_presetClearKeys(prop, KS_presetSourceTime(clip, ta, start, end), KS_presetSourceTime(clip, tb, start, end));
  var sonra = r.n ? KS_easeAnahtarlar(clip, prop, start, end) : once;
  r.bosaldi = once.length > 0 && sonra.length === 0;
  // silinenler: once'de olup sonra'da olmayanlar (iki sirali dizide birlestirme yuruyusu)
  var silinen = [];
  if (r.n) {
    var j = 0;
    for (var i = 0; i < once.length; i++) {
      while (j < sonra.length && sonra[j].t < once[i].t - 0.000001) j++;
      if (j < sonra.length && Math.abs(sonra[j].t - once[i].t) <= 0.000001) { j++; continue; }
      silinen.push(Math.round(once[i].t * 1000000) / 1000000);
    }
  }
  if (!kt || !kt.temizlenen || !yer) return r;
  var oz = KS_easeKlipOzeti(clip), kimlik = KS_easeKimlik(yer.comp, prop);
  for (var q = 0; q < kt.temizlenen.length; q++) {
    var g = kt.temizlenen[q];
    if (g.nodeId === oz.nodeId && g.clipStart === start && g.matchName === kimlik) {
      g.pencereler.push([lo, hi]);
      for (var s = 0; s < silinen.length; s++) g.times.push(silinen[s]);
      g.times.sort(function (x, y) { return x - y; });
      if (r.bosaldi) g.bosaldi = true;
      return r;
    }
  }
  var kay = KS_easeKaynak(clip, start, end), seqId = "";
  try { seqId = String(kt.seq.sequenceID); } catch (eS) {}
  kt.temizlenen.push({ seqId: seqId, nodeId: oz.nodeId, clipName: oz.clipName, clipStart: start, clipEnd: end, clipIn: kay.clipIn,
    clipOut: kay.clipOut, ters: kay.ters, matchName: kimlik, pencereler: [[lo, hi]], times: silinen, bosaldi: r.bosaldi });
  return r;
}

// Ozelligin degeri (kaynak saniyesinde): sayi ya da [x,y]; okunamazsa null
function KS_kayitDegerAt(prop, src) {
  try {
    if (prop.getValueAtTime) {
      var v = KS_easeDeger(prop.getValueAtTime(KS_presetTime(src)));
      if (v !== null) return v;
    }
  } catch (e) {}
  try { return KS_easeDeger(prop.getValue()); } catch (e2) {}
  return null;
}

/*
 * KS_presetClipKeys'in kayit ureten esi (ayni imza; props: KS_presetProps, ad: 'scale' | 'position' | 'opacity'):
 *   1) KS_presetKeys'in silecegi aralik once temizlenir (yazim da onu temizlerdi; sonuc ayni; KS_kayitTemizle
 *      silinenleri kt.temizlenen'e bildirir),
 *   2) yazilacak araligin iki ucundaki deger okunur: Suflo yazmadan onceki hal, kaldirma bunu geri koyar. Temizlik
 *      ozelligin TUM anahtarlarini sildiyse Premiere ozelligi silinen ilk anahtarin degerinde birakir (ornegin
 *      Karartma'nin 0'i, eski Fade In'in 0'i): o artik okunmaz, pencerenin disindaki (dinlenme) deger alinir: pencere
 *      klibin sonuna varmiyorsa son anahtarin, varip basina varmiyorsa ilk anahtarin degeri (silinmeden once okunur).
 *      Pencere tum klibi kapliyorsa (Zoom) baska bilgi yok; panel, yerine gectigi canli kaydin degerini devralir.
 *   3) yazilir (KS_presetClipKeys: kaynak zamani eslemesi, son anahtarda updateUI, ilk/son anahtar dogrulamasi),
 *   4) planli zamanlardan gercekten anahtar olanlar (0,25 kare tolerans) kt.kayitlar'a bir kayit olarak girer.
 * Doner: KS_presetClipKeys'in sonucu (yazildi mi).
 */
function KS_kayitliYaz(kt, clip, start, end, props, ad, keys, clearA, clearB, dense) {
  var prop = props ? props[ad] : null;
  if (!prop || !keys || !keys.length) return false;
  // 3.4 adim 12: ozel egrinin sik anahtarlari (kare alti sikisanlar seyreltilir; kayit her zaman dondurulur)
  if (dense === true) {
    var sFps = 30;
    try { sFps = KS_easeFps(kt && kt.seq ? kt.seq : KS_seq()); } catch (eF) {}
    keys = KS_yogunSeyrelt(keys, sFps);
  }
  var kay = KS_easeKaynak(clip, start, end);
  var ca = clearA === undefined ? Number(keys[0].time) : Number(clearA);
  var cb = clearB === undefined ? Number(keys[keys.length - 1].time) : Number(clearB);
  var yer = props.yer ? props.yer[ad] : null;
  var tm = KS_kayitTemizle(kt, clip, start, end, prop, yer, ca, cb);
  var dinlenme = null;
  if (tm.bosaldi) {
    if (Math.max(ca, cb) < end - 0.001) dinlenme = tm.son;
    else if (Math.min(ca, cb) > start + 0.001) dinlenme = tm.ilk;
  }
  var tl = [], tA = 1e15, tB = -1e15, srcA = 0, srcB = 0;
  for (var i = 0; i < keys.length; i++) {
    var src = KS_presetSourceTime(clip, keys[i].time, start, end);
    var t = KS_easeKaynaktan(kay, src, start, end);
    if (!isFinite(t)) continue;
    tl.push(t);
    if (t < tA) { tA = t; srcA = src; }
    if (t > tB) { tB = t; srcB = src; }
  }
  var kenar = [];
  if (tl.length) {
    var vA = dinlenme !== null ? dinlenme : KS_kayitDegerAt(prop, srcA);
    if (vA !== null) kenar.push({ t: tA, v: vA });
    if (tB > tA) {
      var vB = dinlenme !== null ? dinlenme : KS_kayitDegerAt(prop, srcB);
      if (vB !== null) kenar.push({ t: tB, v: vB });
    }
  }
  var ok = KS_presetClipKeys(clip, start, end, prop, keys, clearA, clearB, dense === true);
  if (!ok || !kt || !tl.length) return ok;
  if (!yer) return ok;
  var fps = KS_easeFps(kt.seq), tol = KS_EASE_TOL_KARE / fps;
  var an = KS_easeAnahtarlar(clip, prop, start, end);
  var es = KS_easeEslestir(an, tl, tol);
  var times = [];
  for (var k = 0; k < es.length; k++) times.push(Math.round(an[es[k]].t * 1000000) / 1000000);
  if (!times.length) return ok;
  var oz = KS_easeKlipOzeti(clip);
  var seqId = "";
  try { seqId = String(kt.seq.sequenceID); } catch (eS) {}
  kt.kayitlar.push({ tur: kt.tur, seqId: seqId, nodeId: oz.nodeId, clipName: oz.clipName, clipStart: start, clipEnd: end,
    clipIn: kay.clipIn, clipOut: kay.clipOut, ters: kay.ters, matchName: KS_easeKimlik(yer.comp, prop), compIdx: yer.ci, propIdx: yer.pi,
    uclar: null, times: times, kenarDegerleri: kenar });
  return ok;
}

// Kaydin ozelligi: kayittaki dizinlerde kimlik tutuyorsa o; tutmuyorsa (efekt sirasi degisti) ayni kimlikli ilk ozellik.
// { comp, prop } | null
function KS_kayitOzellik(clip, rec) {
  var hedef = String(rec.matchName || "");
  if (!hedef) return null;
  var comps = null;
  try { comps = clip.components; } catch (e) { comps = null; }
  if (!comps) return null;
  try {
    var c0 = comps[Number(rec.compIdx)];
    var p0 = c0 && c0.properties ? c0.properties[Number(rec.propIdx)] : null;
    if (p0 && KS_easeKimlik(c0, p0) === hedef) return { comp: c0, prop: p0 };
  } catch (e0) {}
  try {
    for (var i = 0; i < comps.numItems; i++) {
      var c = comps[i], pl = null;
      try { pl = c.properties; } catch (eL) { pl = null; }
      if (!pl) continue;
      for (var j = 0; j < pl.numItems; j++) {
        if (pl[j] && KS_easeKimlik(c, pl[j]) === hedef) return { comp: c, prop: pl[j] };
      }
    }
  } catch (e1) {}
  return null;
}

// Kayit kapsam kliplerinden birine ait olabilir mi (KS_easeKlipBul'un yollari: nodeId ya da ad + baslangic)
function KS_kayitKapsamAday(ozetler, rec, yari) {
  for (var i = 0; i < ozetler.length; i++) {
    var o = ozetler[i];
    if (rec.nodeId && o.nodeId && String(rec.nodeId) === o.nodeId) return true;
    if (rec.clipName !== undefined && KS_easeSayi(rec.clipStart) && String(rec.clipName) === o.clipName && Math.abs(o.clipStart - rec.clipStart) <= yari) return true;
  }
  return false;
}

// Klibin secimdeki yeri (yoksa -1). secimNid (istege bagli): secimin nodeId'leri onceden okunmus; nid: klibin nodeId'si
// (KS_easeAyniKlip ile ayni kural, karsilastirma basina Premiere'e gidilmez)
function KS_kayitSeciliIndis(secim, clip, secimNid, nid) {
  if (secimNid) {
    for (var s = 0; s < secim.length; s++) if (secim[s] === clip || (nid && secimNid[s] && secimNid[s] === nid)) return s;
    return -1;
  }
  for (var q = 0; q < secim.length; q++) if (KS_easeAyniKlip(secim[q], clip)) return q;
  return -1;
}

// Kaydin kenar degerleri d kadar kaydirilmis, zamana gore sirali: [{ t, v }]
function KS_kayitKenarlar(rec, d) {
  var out = [], k = rec.kenarDegerleri;
  if (!k || typeof k.length !== "number") return out;
  for (var i = 0; i < k.length && i < 8; i++) {
    var e = k[i], v = e ? KS_easeDeger(e.v) : null;
    if (e && KS_easeSayi(Number(e.t)) && v !== null) out.push({ t: Number(e.t) + d, v: v });
  }
  out.sort(function (x, y) { return x.t - y.t; });
  return out;
}

// Ozellik sabit degere doner (anahtari kalmadi): zamanla degismez yapilir, deger updateUI ile yazilir.
// Deger turu ozelligin turuyle uyusmuyorsa (sayi / [x,y]) dokunulmaz. Doner: yazildi mi
function KS_kayitSabitle(prop, v) {
  var simdi = null;
  try { simdi = KS_easeDeger(prop.getValue()); } catch (e) { simdi = null; }
  if (simdi !== null && (typeof simdi === "number") !== (typeof v === "number")) return false;
  try { if (prop.setTimeVarying) prop.setTimeVarying(false); } catch (eT) {}
  try { prop.setValue(KS_presetCloneValue(v), true); return true; } catch (eV) {}
  return false;
}

// Kenara eski degerle anahtar (deger zaten ayniysa ya da okunamiyorsa yazilmaz). Doner: { t: Time, v } | null
function KS_kayitKenarAnahtar(clip, prop, oz, e) {
  var src = KS_presetSourceTime(clip, e.t, oz.clipStart, oz.clipEnd, true);
  if (!isFinite(src) || src < 0) return null;
  var simdi = KS_kayitDegerAt(prop, src);
  if (simdi === null || (typeof simdi === "number") !== (typeof e.v === "number") || KS_easeAyni(simdi, e.v)) return null;
  var zt = KS_presetTime(src);
  var eklendi = false;
  try { prop.addKey(zt); eklendi = true; } catch (eA) {}
  try {
    prop.setValueAtKey(zt, KS_presetCloneValue(e.v), false);
  } catch (eS) {
    if (eklendi) { try { prop.removeKey(zt); } catch (eR) {} }
    return null;
  }
  return { t: zt, v: e.v };
}

/*
 * Suflo'nun anahtarlari silindikten sonra kenar degerleri geri: ozellikte hic anahtar kalmadiysa onceki sabit
 * degerine doner (kenarlarin ilki). Anahtar kaldiysa egri onlarindir; yalniz kenarin o yaninda HIC anahtar
 * kalmadiysa ve oradaki deger Suflo'dan onceki degerden farkliysa kenara eski degerle bir anahtar eklenir
 * (kullanicinin araliga ekledigi anahtar tum klibe yayilmasin). Doner: { eklenen, ui (updateUI yapildi), son }
 */
function KS_kayitKenarGeri(clip, prop, oz, kenar, tol) {
  var r = { eklenen: 0, ui: false, son: null };
  if (!kenar.length) return r;
  var kalan = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd);
  if (!kalan.length) {
    r.ui = KS_kayitSabitle(prop, kenar[0].v);
    return r;
  }
  var sol = kenar[0], sag = kenar[kenar.length - 1], z;
  if (kalan[0].t > sol.t + tol) {
    z = KS_kayitKenarAnahtar(clip, prop, oz, sol);
    if (z) { r.eklenen++; r.son = z; }
  }
  if (kenar.length > 1 && kalan[kalan.length - 1].t < sag.t - tol) {
    z = KS_kayitKenarAnahtar(clip, prop, oz, sag);
    if (z) { r.eklenen++; r.son = z; }
  }
  return r;
}

// Gecis kaydi bu kesimde mi: A yaninin (cikis) son anahtari, B yaninin (giris) ilk anahtari kesimdedir (d: klibin
// kaymasi); tum anahtarlar en genis gecis penceresinin icinde.
function KS_kayitKesimde(rec, d, kesim, yanA, tol) {
  var t = rec.times;
  if (!t || !t.length) return false;
  var ilk = Number(t[0]) + d, son = Number(t[t.length - 1]) + d, pay = Math.max(tol * 2, 0.002);
  if (ilk < kesim.cut - KS_GECIS_MAX_HALF - pay || son > kesim.cut + KS_GECIS_MAX_HALF + pay) return false;
  return yanA ? Math.abs(son - kesim.cut) <= pay : Math.abs(ilk - kesim.cut) <= pay;
}

// Kaydin bugunku yeri: { clip, oz, kay, yer, an, esle } (klip bulunamazsa clip null; ozellik yoksa yer / an / esle null).
// dizin (istege bagli): KS_klipDizini (cagri basina bir kez; kayit basina sekansi yurumez)
function KS_kayitYeri(seq, rec, fps, tol, dizin) {
  var y = { clip: dizin ? KS_klipDizindeBul(dizin, rec, fps) : KS_easeKlipBul(seq, rec, fps), oz: null, kay: null, yer: null, an: null, esle: null };
  if (!y.clip) return y;
  y.oz = KS_easeKlipOzeti(y.clip);
  y.kay = KS_easeKaynak(y.clip, y.oz.clipStart, y.oz.clipEnd);
  y.yer = KS_kayitOzellik(y.clip, rec);
  if (y.yer) {
    y.an = KS_easeAnahtarlar(y.clip, y.yer.prop, y.oz.clipStart, y.oz.clipEnd, y.kay);
    y.esle = KS_easeKayitEsle(y.an, rec, y.oz, y.kay, tol);
  }
  return y;
}

// Kesim kapsaminda kaydin kaymasi: canliysa eslesmenin kaymasi, degilse klip baslangicinin kaymasi
function KS_kayitKesimKaymasi(rec, y) {
  if (y.esle && y.esle.canli) return y.esle.d;
  return KS_easeSayi(rec.clipStart) ? y.oz.clipStart - rec.clipStart : 0;
}

/*
 * Gecisi kaldirmanin kesimi: playhead'e kTol icindeki kesimlerden, bu kayitlardan biri (anahtarlarindan en az biri hala
 * duran) o kesimde olan en yakini; hicbirinde yoksa playhead'e en yakin kesim. Uygulamadan (KS_gecisKesimBul) farkli
 * olarak secim oncelik vermez: secili klibe dokunan baska bir kesim, playhead'in altindaki Suflo gecisinin onune gecip
 * onaylanan eski yontemle oradaki kullanici anahtarlarini sildirmesin. Secim yalniz altyazi/grafik (MOGRT) sinirini aday
 * yapar; Suflo kaydi olan grafik siniri her zaman adaydir. Esitlikte ust katman. Doner: KS_gecisKesimBul gibi | null
 */
function KS_kayitKesimSec(seq, ph, kTol, recs, fps, tol, dizinAl) {
  var liste = KS_gecisKesimler(seq, ph, kTol);
  if (!liste.length) return null;
  var ozet = [], kayitli = [];
  for (var c = 0; c < liste.length; c++) { ozet.push(KS_easeKlipOzeti(liste[c].a)); ozet.push(KS_easeKlipOzeti(liste[c].b)); }
  for (var i = 0; i < recs.length && i < KS_KALDIR_MAX_KAYIT; i++) {
    var rec = recs[i] || {};
    if (rec.seqId && String(rec.seqId) !== String(seq.sequenceID)) continue;
    if (!KS_kayitKapsamAday(ozet, rec, 0.5 / fps)) continue;
    var y = KS_kayitYeri(seq, rec, fps, tol, dizinAl ? dizinAl() : null);
    if (!y.clip || !y.esle || !(y.esle.canli || y.esle.enCok > 0)) continue;
    var dk = KS_kayitKesimKaymasi(rec, y);
    for (var k = 0; k < liste.length; k++) {
      if (kayitli[k]) continue;
      var yanA = KS_easeAyniKlip(y.clip, liste[k].a);
      if (!yanA && !KS_easeAyniKlip(y.clip, liste[k].b)) continue;
      if (KS_kayitKesimde(rec, dk, liste[k], yanA, tol)) kayitli[k] = true;
    }
  }
  var enIyi = null, yedek = null;
  for (var j = 0; j < liste.length; j++) {
    var a = liste[j];
    if (kayitli[j] && KS_gecisDahaIyi(a, enIyi)) enIyi = a;
    if ((!a.grafik || a.sec) && KS_gecisDahaIyi(a, yedek)) yedek = a;
  }
  return enIyi || yedek;
}

/*
 * Silinecek anahtarlarda (sil) ucu duran canli Egri kayitlari (3.4 adim 10): Egri iki anahtarin arasina ic anahtarlar
 * yazar. Ucu silinince ic anahtarlar sahipsiz kalir: gecis / zoom / onayar kalkmis gorunurken rampa durur, Egri'nin
 * Geri al'i ucu gitmis kaydi bulamaz ('degisti'). Bu Egri'lerin kayitli ve hala duran ic anahtarlari da silinir (uclar
 * Egri'nin degil: onlara burada dokunulmaz) ve kayit biter. Varista yaylanma (tur 'yaylan', 3.4 adim 14) da ayni: inis
 * anahtari (kenarDegerleri[0]) silinirse ardindaki yaylanma sahipsiz kalir, kayitli anahtarlarinin hepsi silinir.
 * egriler: panelin verdigi Egri sekmesi kayitlari; bitti: { id: 1 }
 * (bu cagrida bitenler); clip / oz / kay: aracin klibi; matchName: aracin ozelligi; an: ozelligin anahtarlari (silmeden
 * once). Doner: [{ id, keys: [an ogesi] }]
 */
function KS_kayitEgriUclari(egriler, bitti, seq, fps, clip, oz, kay, matchName, an, sil, tol, dizin) {
  var out = [];
  if (!egriler || !egriler.length || !sil.length) return out;
  for (var i = 0; i < egriler.length && i < KS_KALDIR_MAX_KAYIT; i++) {
    var e = egriler[i] || {};
    var id = String(e.id || "");
    var tur = String(e.tur || "egri");
    if (!id || bitti[id] || (tur !== "egri" && tur !== "yaylan") || String(e.matchName || "") !== matchName) continue;
    var inis = NaN;
    if (tur === "yaylan") {
      try { inis = Number(e.kenarDegerleri[0].t); } catch (eK) { inis = NaN; }
      if (!isFinite(inis)) continue;
    } else if (!e.uclar || e.uclar.length !== 2) continue;
    if (e.seqId && String(e.seqId) !== String(seq.sequenceID)) continue;
    // ayni klip mi: iki nodeId de varsa onlar; yoksa Egri'nin klibi bulunur
    if (e.nodeId && oz.nodeId) {
      if (String(e.nodeId) !== oz.nodeId) continue;
    } else {
      var ce = dizin ? KS_klipDizindeBul(dizin, e, fps) : KS_easeKlipBul(seq, e, fps);
      if (!ce || !KS_easeAyniKlip(ce, clip)) continue;
    }
    var es = KS_easeKayitEsle(an, e, oz, kay, tol);
    if (!es.canli || (tur === "egri" && !es.koru)) continue;
    var ucGider = false;
    for (var s = 0; s < sil.length && !ucGider; s++) {
      if (tur === "yaylan") { if (Math.abs(sil[s].t - (inis + es.d)) <= tol) ucGider = true; }
      else if (Math.abs(sil[s].t - es.koru[0]) <= tol || Math.abs(sil[s].t - es.koru[1]) <= tol) ucGider = true;
    }
    if (!ucGider) continue;
    var keys = [];
    for (var k = 0; k < es.es.length; k++) {
      var a = an[es.es[k]];
      if (es.koru && (Math.abs(a.t - es.koru[0]) <= tol || Math.abs(a.t - es.koru[1]) <= tol)) continue;
      keys.push(a);
    }
    out.push({ id: id, keys: keys });
  }
  return out;
}

/*
 * p: { records: [SufloKeyRecords kaydi], secili?: true, kesim?: { tolerance }, egriler?: [Egri kaydi] }
 *   secili: yalniz su an secili kliplerin kayitlari (Zoom, Hareket onayari). kesim: yalniz playhead'e yakin bir
 *   kesimdeki (KS_kayitKesimSec: tolerance icinde bu kayitlardan birinin oldugu en yakin kesim, yoksa en yakin kesim;
 *   secim oncelik vermez) iki klibin o kesimdeki kayitlari (Gecis).
 *   Kapsamli cagride baska sekansin / bulunamayan klibin kaydi kapsam disidir (sayilmaz, saklanir).
 *   egriler: ayni sekansin Egri kayitlari (3.4 adim 10); ucu silinen anahtarlarda duran canli Egri'nin ic anahtarlari da
 *   silinir, kayit biter (KS_kayitEgriUclari; egriBiten).
 * Her kayit: klip nodeId ile (yoksa ad + baslangic) bulunur; tasinmis klip de bulunur, kaydirmasi kaynak capasindan
 * hesaplanir (KS_easeKayitEsle). Yalniz CANLI kayitta kaydedilen ve hala duran anahtarlar (0,25 kare) silinir;
 * kullanicinin sonradan ekledigi anahtar kalir. Sonra kenar degerleri geri konur (KS_kayitKenarGeri) ve
 * Effect Controls / Program updateUI ile tazelenir.
 *   Suflo'nun anahtarlarindan hicbiri yerinde degil (Premiere'de geri alindi / silindi): sonuclar kod 'yok' (kayit biter).
 *   Bir kismi yerinde ama kayit canli degil (uc anahtar silinmis, %60'in alti): dokunulmaz, atlanan 'degisti'.
 *   Canli ama Premiere anahtarlarin hicbirini silmedi (removeKey hata verdi): atlanan 'silinemedi' (kayit saklanir).
 *   Klip bulunamadi: atlanan 'klipYok' (kayit saklanir, sonra yeniden denenir). Ozellik yok: 'ozellik'. Baska sekans: 'sekans'.
 * Doner: { eslesen (kapsamdaki kayit), sonuclar: [{ id, ok, kod, silinen (Egri ic anahtarlari dahil), eklenen, egri: [id] }],
 *   atlanan: [{ id, kod }], egriBiten: [Egri kayit id'si], kesim? ({ cut, track (1'den) }: kaldirilan / eski yontemin
 *   temizleyecegi kesim), secim? (secili kapsamda secili klip sayisi), kayitsiz? (secili kapsamda bu kayitlarin hicbirinin
 *   eslesmedigi secili video klipleri: [{ nodeId, clipName, clipStart, clipEnd }]; onlara dokunulmadi, panel soyler) }
 */
function KS_removeSufloKeys(encoded) {
  try {
    var p = KS_arg(encoded);
    var seq = KS_seq();
    if (!seq) return KS_errKod("sekansYok", "Aktif sequence yok.");
    var fps = KS_easeFps(seq), tol = KS_EASE_TOL_KARE / fps;
    var recs = p.records && typeof p.records.length === "number" ? p.records : [];
    var egriler = p.egriler && typeof p.egriler.length === "number" ? p.egriler : [];
    var seciliMod = p.secili === true;
    // Klipler cagri basina bir kez dizinlenir (yalniz gerekince): kayit basina tum sekansi yurumek (O(kayit x klip) Premiere
    // okumasi) binlerce klipli timeline'da dakikalar surer, panel K.call zaman asimina duser
    var dizin = null;
    function dizinAl() { if (!dizin) dizin = KS_klipDizini(seq); return dizin; }
    var kesim = null;
    if (p.kesim) {
      var ph = 0;
      try { ph = Number(seq.getPlayerPosition().seconds) || 0; } catch (eP) {}
      var kTol = Number(p.kesim.tolerance);
      if (!isFinite(kTol) || kTol <= 0) kTol = 1.0;
      kesim = KS_kayitKesimSec(seq, ph, kTol, recs, fps, tol, dizinAl);
      if (!kesim) return KS_errKod("kesimYok", "Playhead'in yakininda kesim yok.");
    }
    var kapsamli = seciliMod || !!kesim;
    var secim = [], secimNid = [];
    if (seciliMod) {
      try { var sa = seq.getSelection(); if (sa) for (var s0 = 0; s0 < sa.length; s0++) secim.push(sa[s0]); } catch (eS) {}
      for (var s1 = 0; s1 < secim.length; s1++) {
        var sn = "";
        try { sn = String(secim[s1].nodeId || ""); } catch (eSn) {}
        secimNid.push(sn);
      }
    }
    // Hizli on suzgec (klip aramasi tum katmanlari yurur): kapsamdaki kliplerin nodeId / ad + baslangic ozeti.
    // KS_easeKlipBul'un iki yoluyla da eslesmeyen kayit kapsam disidir.
    var kapsamOzet = null;
    if (kapsamli) {
      var adaylar = kesim ? [kesim.a, kesim.b] : secim;
      kapsamOzet = [];
      for (var c0 = 0; c0 < adaylar.length; c0++) kapsamOzet.push(KS_easeKlipOzeti(adaylar[c0]));
    }
    var sonuclar = [], atlanan = [], eslesen = 0, kayitli = [], egriBitti = {}, egriBiten = [];
    for (var i = 0; i < recs.length && i < KS_KALDIR_MAX_KAYIT; i++) {
      var rec = recs[i] || {};
      var id = String(rec.id || "");
      if (rec.seqId && String(rec.seqId) !== String(seq.sequenceID)) {
        if (!kapsamli) atlanan.push({ id: id, kod: "sekans" });
        continue;
      }
      if (kapsamOzet && !KS_kayitKapsamAday(kapsamOzet, rec, 0.5 / fps)) continue;
      var y = KS_kayitYeri(seq, rec, fps, tol, dizinAl());
      var clip = y.clip;
      if (!clip) {
        if (!kapsamli) atlanan.push({ id: id, kod: "klipYok" });
        continue;
      }
      if (seciliMod) {
        var si = KS_kayitSeciliIndis(secim, clip, secimNid, y.oz.nodeId);
        if (si < 0) continue;
        kayitli[si] = true;
      }
      var yanA = false;
      if (kesim) {
        yanA = KS_easeAyniKlip(clip, kesim.a);
        if (!yanA && !KS_easeAyniKlip(clip, kesim.b)) continue;
        if (!KS_kayitKesimde(rec, KS_kayitKesimKaymasi(rec, y), kesim, yanA, tol)) continue;
      }
      var oz = y.oz, yer = y.yer, an = y.an, esle = y.esle;
      eslesen++;
      if (!yer) { atlanan.push({ id: id, kod: "ozellik" }); continue; }
      if (!esle.canli) {
        // Hicbiri yerinde degil: Premiere'de geri alinmis / silinmis ('yok', kayit biter). Ama kaydin kaynak capasi bugunku
        // klibe oturmuyorsa (hizi ya da yonu degisti) anahtarlar yerinde olup bulunamamis olabilir: 'degisti' (kayit saklanir)
        if (!(esle.enCok > 0) && !esle.capaTutarsiz) sonuclar.push({ id: id, ok: true, silinen: 0, eklenen: 0, kod: "yok" });
        else atlanan.push({ id: id, kod: "degisti" });
        continue;
      }
      var prop = yer.prop, koru = esle.koru, es = esle.es, sil = [];
      for (var k = 0; k < es.length; k++) {
        var a = an[es[k]];
        // Egri kaydinin uclari kullanicinindir (bu araclarin kayitlarinda uc yok)
        if (koru && (Math.abs(a.t - koru[0]) <= tol || Math.abs(a.t - koru[1]) <= tol)) continue;
        sil.push(a);
      }
      // Ucu bu anahtarlarda duran Egri'ler (silmeden once, ayni anahtar listesiyle olculur)
      var egriAday = KS_kayitEgriUclari(egriler, egriBitti, seq, fps, clip, oz, y.kay, String(rec.matchName || ""), an, sil, tol, dizinAl());
      var silinen = 0;
      for (var s = sil.length - 1; s >= 0; s--) {
        try { prop.removeKey(sil[s].k); silinen++; } catch (eR) {}
      }
      // Anahtarlar yerinde ama Premiere hicbirini silmedi: 'yok' (zaten kaldirilmis) DEGIL; kayit saklanir, panel uyarir
      if (sil.length && !silinen) { atlanan.push({ id: id, kod: "silinemedi" }); continue; }
      var egriIdler = [];
      if (silinen) {
        for (var ea = 0; ea < egriAday.length; ea++) {
          var eg = egriAday[ea], egSil = 0, egDene = 0;
          for (var ek = eg.keys.length - 1; ek >= 0; ek--) {
            var ekT = eg.keys[ek].t, ayni = false;
            for (var sk0 = 0; sk0 < sil.length && !ayni; sk0++) if (Math.abs(sil[sk0].t - ekT) <= tol) ayni = true;
            if (ayni) continue;   // aracin anahtariyla ayni yerde: zaten silindi
            egDene++;
            try { prop.removeKey(eg.keys[ek].k); egSil++; } catch (eR2) {}
          }
          // Premiere ic anahtarlarin hicbirini silmediyse kayit saklanir
          if (egDene && !egSil) continue;
          egriBitti[eg.id] = 1;
          egriBiten.push(eg.id);
          egriIdler.push(eg.id);
          silinen += egSil;
        }
      }
      var g = silinen ? KS_kayitKenarGeri(clip, prop, oz, KS_kayitKenarlar(rec, esle.d), tol) : { eklenen: 0, ui: false, son: null };
      if (silinen && !g.ui) {
        // Program monitoru / Effect Controls tazelensin: son eklenen kenar anahtari ya da kalan en yakin anahtar
        // degeriyle updateUI'li yeniden yazilir
        if (g.son) {
          try { prop.setValueAtKey(g.son.t, KS_presetCloneValue(g.son.v), true); } catch (eU) {}
        } else {
          var kalan = KS_easeAnahtarlar(clip, prop, oz.clipStart, oz.clipEnd, y.kay);
          var hedefT = Number(rec.times[0]) + esle.d, j = -1, enYakin = 1e15;
          for (var q = 0; q < kalan.length; q++) {
            if (Math.abs(kalan[q].t - hedefT) < enYakin) { enYakin = Math.abs(kalan[q].t - hedefT); j = q; }
          }
          if (j >= 0) {
            var v = null;
            try { v = prop.getValueAtKey(kalan[j].k); } catch (eV) { v = null; }
            if (v !== null && v !== undefined) { try { prop.setValueAtKey(kalan[j].k, KS_presetCloneValue(v), true); } catch (eU2) {} }
          }
        }
      }
      sonuclar.push({ id: id, ok: true, silinen: silinen, eklenen: g.eklenen, kod: silinen ? "" : "yok", egri: egriIdler });
    }
    var out = { eslesen: eslesen, sonuclar: sonuclar, atlanan: atlanan, egriBiten: egriBiten };
    if (kesim) out.kesim = { cut: kesim.cut, track: kesim.track + 1 };
    if (seciliMod) {
      out.secim = secim.length;   // 0: hic klip secili degil (panel "once klip sec" der)
      var kayitsiz = [];
      for (var sk = 0; sk < secim.length; sk++) {
        if (kayitli[sk] || !KS_easeVideoMu(seq, secim[sk])) continue;
        var ko = KS_easeKlipOzeti(secim[sk]), tekrar = false;
        for (var sq = 0; sq < kayitsiz.length; sq++) if (kayitsiz[sq].nodeId && kayitsiz[sq].nodeId === ko.nodeId) tekrar = true;
        if (!tekrar) kayitsiz.push(ko);
      }
      out.kayitsiz = kayitsiz;
    }
    return KS_ok(out);
  } catch (e) { return KS_err(e); }
}
