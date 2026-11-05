/*
 * Suflo — After Effects tarafı (ExtendScript, ES3; DENEYSEL)
 *
 * Yalnız After Effects'te yüklenir: panel (js/ae-panel.js) $.evalFile ile çağırır; Premiere'de hiç çalışmaz.
 * jsx/host.jsx manifestin ScriptPath'i olarak AE'de de yüklenir ama yalnız işlev tanımlar (üst düzeyde Premiere
 * nesnesine dokunmaz; test-host-ae bunu denetler) ve panel AE'de onun KS_* işlevlerini çağırmaz (js/ae-plan.js
 * hostCagrisi).
 *
 * Kararların hepsi panelde (js/ae-plan.js plan(): zaman, metin, konum, yazı, anahtarlar); burası planı yürütür:
 *   KSAE_baglam / KSAE_seciliKatmanlar   aktif kompozisyon ve seçili katmanların ham zamanları (inPoint, startTime,
 *                                         stretch, Time Remap) ve kaynak dosyası; panel Premiere biçimine çevirir
 *   KSAE_oynatmaKafasi / KSAE_projeKlasoru  oynatma kafası, proje klasörü
 *   KSAE_altyaziOlustur(plan)           her kart bir metin katmanı (tek geri al grubu; hata olursa eklenenler silinir)
 *   KSAE_altyaziKaldir                  yalnız yorumu "Suflo altyazi" ile başlayan katmanları siler (tek geri al grubu)
 *
 * After Effects'te gerçek denemesi YAPILMADI; tests/test-host-ae.js sahte AE nesneleriyle sınar.
 * Girdiler encodeURIComponent'lenmiş JSON, çıktılar JSON metni (host.jsx ile aynı sözleşme).
 */

/* ---------- Mini JSON (host.jsx yüklenmemişse; ExtendScript'te yerleşik JSON yok) ---------- */
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

// Kayit isareti: js/ae-plan.js ISARET ve ETIKET ile ayni (test eslesmeyi denetler)
var KSAE_ISARET = "Suflo altyazi";
var KSAE_PLAN_SURUMU = 1;

function KSAE_arg(encoded) {
  if (!encoded) return {};
  var text = decodeURIComponent(encoded);
  if (text === "undefined" || text === "null" || text === "") return {};
  try { return KJSON.parse(text); } catch (e) { throw new Error("Panelden gelen arguman okunamadi."); }
}
function KSAE_ok(data) { data = data || {}; data.ok = true; return KJSON.stringify(data); }
function KSAE_err(msg) { return KJSON.stringify({ ok: false, error: String(msg) }); }

/* ---------- Kompozisyon ve katmanlar ---------- */

function KSAE_compMu(it) {
  try { return !!it && it instanceof CompItem; } catch (e) { return false; }
}

// Aktif kompozisyon: zaman cizelgesi / goruntuleyicide acik olan; panel odaktayken de AE son etkin ogeyi verir
function KSAE_comp() {
  try {
    var it = app.project ? app.project.activeItem : null;
    if (KSAE_compMu(it)) return it;
  } catch (e) {}
  return null;
}

// Katmanin turu ve kaynak dosyasi: "dosya" (video / ses dosyasi), "comp" (on kompozisyon), "diger" (kati renk, metin...)
function KSAE_katmanBilgisi(ly) {
  var out = { index: 0, name: "", tur: "diger", mediaPath: "", hasAudio: false, inPoint: 0, outPoint: 0, startTime: 0, stretch: 100, timeRemap: false };
  try { out.index = Number(ly.index) || 0; } catch (e0) {}
  try { out.name = String(ly.name); } catch (e1) {}
  try { out.hasAudio = ly.hasAudio === true; } catch (e2) {}
  try { out.inPoint = Number(ly.inPoint) || 0; out.outPoint = Number(ly.outPoint) || 0; out.startTime = Number(ly.startTime) || 0; } catch (e3) {}
  try { out.stretch = Number(ly.stretch) || 100; } catch (e4) {}
  try { out.timeRemap = ly.timeRemapEnabled === true; } catch (e5) {}
  var src = null;
  try { src = ly.source; } catch (e6) { src = null; }
  if (src) {
    if (KSAE_compMu(src)) out.tur = "comp";
    else {
      var f = null;
      try { f = src.file; } catch (e7) { f = null; }
      if (f && f.fsName) { out.tur = "dosya"; out.mediaPath = String(f.fsName); }
    }
  }
  return out;
}

function KSAE_compBilgisi(comp) {
  return { name: String(comp.name), id: Number(comp.id) || 0, width: Number(comp.width) || 0, height: Number(comp.height) || 0,
    fps: Number(comp.frameRate) || 0, duration: Number(comp.duration) || 0, time: Number(comp.time) || 0 };
}

function KSAE_seciliListesi(comp) {
  var out = [];
  var sec = null;
  try { sec = comp.selectedLayers; } catch (e) { sec = null; }
  if (!sec) return out;
  for (var i = 0; i < sec.length; i++) out.push(KSAE_katmanBilgisi(sec[i]));
  return out;
}

function KSAE_baglam() {
  try {
    var comp = KSAE_comp();
    var proje = "";
    try { proje = app.project && app.project.file ? String(app.project.file.name) : ""; } catch (eP) {}
    if (!comp) return KSAE_ok({ app: String(app.version), project: proje, comp: null, katmanlar: [] });
    return KSAE_ok({ app: String(app.version), project: proje, comp: KSAE_compBilgisi(comp), katmanlar: KSAE_seciliListesi(comp) });
  } catch (e) { return KSAE_err(e); }
}

function KSAE_seciliKatmanlar() {
  try {
    var comp = KSAE_comp();
    if (!comp) return KSAE_ok({ comp: null, katmanlar: [] });
    return KSAE_ok({ comp: KSAE_compBilgisi(comp), katmanlar: KSAE_seciliListesi(comp) });
  } catch (e) { return KSAE_err(e); }
}

function KSAE_oynatmaKafasi(encoded) {
  try {
    var a = KSAE_arg(encoded);
    var comp = KSAE_comp();
    if (!comp) return KSAE_err("Aktif kompozisyon yok.");
    var t = Number(a.sec);
    if (!isFinite(t)) return KSAE_err("Gecersiz zaman.");
    comp.time = Math.max(0, Math.min(t, Number(comp.duration) || t));
    return KSAE_ok({ time: Number(comp.time) });
  } catch (e) { return KSAE_err(e); }
}

function KSAE_projeKlasoru() {
  try {
    var f = app.project ? app.project.file : null;
    if (!f) return KSAE_ok({ dir: "" });
    var d = f.parent;
    if (!d || !d.exists) return KSAE_ok({ dir: "" });
    return KSAE_ok({ dir: String(d.fsName) });
  } catch (e) { return KSAE_ok({ dir: "" }); }
}

/* ---------- Metin katmani ---------- */

/*
 * NOT — AE'de bir ozellik grubuna addProperty yapmak ayni gruptaki onceki ozellik nesnelerini gecersiz kilabiliyor
 * ("Object is invalid"). Bu yuzden her adimda ozellik katmandan yolla yeniden alinir (KSAE_yol).
 */
function KSAE_yol(ly, adlar) {
  var p = ly;
  for (var i = 0; i < adlar.length; i++) {
    if (!p) return null;
    p = p.property(adlar[i]);
  }
  return p;
}

function KSAE_tutKey(prop) {
  try {
    for (var k = 1; k <= prop.numKeys; k++) prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
  } catch (e) {}
}

/*
 * Kelime animatoru: Fill Color (renk) ve / ya da Scale (olcek); Range Selector birimi Index, temeli Words.
 * Doner: secicinin yolu (Start / End buradan yazilir).
 */
function KSAE_animatorEkle(ly, ad, renk, olcek) {
  var anims = KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text Animators"]);
  anims.addProperty("ADBE Text Animator");
  var ai = KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text Animators"]).numProperties;
  var yol = ["ADBE Text Properties", "ADBE Text Animators", ai];
  KSAE_yol(ly, yol).name = ad;
  var ozYol = yol.concat(["ADBE Text Animator Properties"]);
  if (renk) {
    KSAE_yol(ly, ozYol).addProperty("ADBE Text Fill Color");
    KSAE_yol(ly, ozYol.concat(["ADBE Text Fill Color"])).setValue(renk);
  }
  if (olcek) {
    KSAE_yol(ly, ozYol).addProperty("ADBE Text Scale 3D");
    KSAE_yol(ly, ozYol.concat(["ADBE Text Scale 3D"])).setValue([olcek, olcek, 100]);
  }
  KSAE_yol(ly, yol.concat(["ADBE Text Selectors"])).addProperty("ADBE Text Selector");
  var selYol = yol.concat(["ADBE Text Selectors", 1]);
  // Units: 1 Percentage, 2 Index · Based On: 1 Characters, 2 Characters Excluding Spaces, 3 Words, 4 Lines
  KSAE_yol(ly, selYol.concat(["ADBE Text Range Advanced", "ADBE Text Range Units"])).setValue(2);
  KSAE_yol(ly, selYol.concat(["ADBE Text Range Advanced", "ADBE Text Range Type2"])).setValue(3);
  return selYol;
}

/*
 * Plan katmani → metin katmani. k: { ad, metin, bas, son, konum, capa, yazi, golge, giris, aktif, sabitVurgu, opaklik }.
 * not: { eksikFont: {}, italikYok: bool } (cagirana bildirilir).
 */
function KSAE_metinKatmani(comp, k, yorum, etiket, not) {
  var ly = comp.layers.addText(String(k.metin));
  not.eklenen.push(ly);
  ly.name = String(k.ad || "Suflo");
  var y = k.yazi || {};
  var tp = KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text Document"]);
  var td = tp.value;
  td.text = String(k.metin);
  if (y.font) td.font = String(y.font);
  if (y.boyut > 0) td.fontSize = Number(y.boyut);
  td.applyFill = true;
  if (y.renk) td.fillColor = y.renk;
  if (y.kontur > 0) {
    td.applyStroke = true;
    td.strokeColor = y.konturRenk || [0, 0, 0];
    td.strokeWidth = Number(y.kontur);
    td.strokeOverFill = false;
  } else td.applyStroke = false;
  td.justification = ParagraphJustification.CENTER_JUSTIFY;
  if (y.italik) {
    // fauxItalic yazilabilirligi surume bagli: yazilamazsa duz yuz kalir, panel uyarir
    try { td.fauxItalic = true; } catch (eI) { not.italikYok = true; }
  }
  tp.setValue(td);
  // Kurulu olmayan fontu AE baska fontla degistirir: geri okunan ad farkliysa panel uyarir
  try {
    var geri = KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text Document"]).value.font;
    if (y.font && String(geri) !== String(y.font)) not.eksikFont[String(y.font)] = 1;
  } catch (eF) {}

  ly.comment = yorum;
  try { ly.label = etiket; } catch (eL) {}
  // Yeni metin katmani kompozisyonun tamamini kaplar (0 - sure): once giris, sonra cikis
  ly.inPoint = Number(k.bas);
  ly.outPoint = Number(k.son);

  // Capa: yazinin kutusunun (sourceRectAtTime) capa noktasi; konum o noktanin kompozisyondaki yeri
  var capa = k.capa || [0.5, 0.5];
  var r = ly.sourceRectAtTime(Number(k.bas), false);
  KSAE_yol(ly, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([r.left + r.width * capa[0], r.top + r.height * capa[1]]);
  KSAE_yol(ly, ["ADBE Transform Group", "ADBE Position"]).setValue(k.konum);
  if (typeof k.opaklik === "number") KSAE_yol(ly, ["ADBE Transform Group", "ADBE Opacity"]).setValue(k.opaklik);

  // Golge: Drop Shadow (yon 135 = sag alt). Opaklik betikte 0-255 olcegiyle yazilir (arayuz % gosterir);
  // gercek After Effects'te dogrulanmadi
  if (k.golge) {
    KSAE_yol(ly, ["ADBE Effect Parade"]).addProperty("ADBE Drop Shadow");
    var fxYol = ["ADBE Effect Parade", KSAE_yol(ly, ["ADBE Effect Parade"]).numProperties];
    KSAE_yol(ly, fxYol.concat(["ADBE Drop Shadow-0001"])).setValue(k.golge.renk);
    KSAE_yol(ly, fxYol.concat(["ADBE Drop Shadow-0002"])).setValue(Number(k.golge.opak) * 2.55);
    KSAE_yol(ly, fxYol.concat(["ADBE Drop Shadow-0003"])).setValue(Number(k.golge.aci));
    KSAE_yol(ly, fxYol.concat(["ADBE Drop Shadow-0004"])).setValue(Number(k.golge.mesafe));
    KSAE_yol(ly, fxYol.concat(["ADBE Drop Shadow-0005"])).setValue(Number(k.golge.yumusak));
  }

  // Giris animasyonu: Transform anahtarlari
  var OZ = { opaklik: "ADBE Opacity", olcek: "ADBE Scale", konum: "ADBE Position" };
  var g = k.giris || [];
  for (var gi = 0; gi < g.length; gi++) {
    var ad = OZ[g[gi].ozellik];
    if (!ad) continue;
    var an = g[gi].anahtarlar || [];
    for (var ki = 0; ki < an.length; ki++) KSAE_yol(ly, ["ADBE Transform Group", ad]).setValueAtTime(Number(an[ki][0]), an[ki][1]);
  }

  // *Vurgu*lu kelimeler: kelime basina sabit renk animatoru
  var sv = k.sabitVurgu || [];
  for (var si = 0; si < sv.length; si++) {
    var sYol = KSAE_animatorEkle(ly, "Suflo vurgu " + (si + 1), sv[si].renk, 0);
    KSAE_yol(ly, sYol.concat(["ADBE Text Index Start"])).setValue(Number(sv[si].i0));
    KSAE_yol(ly, sYol.concat(["ADBE Text Index End"])).setValue(Number(sv[si].i1));
  }

  // Etkin kelime: Start = i, End = i + 1 kelime basinda (Hold anahtar)
  if (k.aktif && k.aktif.anahtarlar && k.aktif.anahtarlar.length) {
    var aYol = KSAE_animatorEkle(ly, "Suflo etkin kelime", k.aktif.renk, k.aktif.olcek);
    var an2 = k.aktif.anahtarlar;
    for (var ai2 = 0; ai2 < an2.length; ai2++) {
      KSAE_yol(ly, aYol.concat(["ADBE Text Index Start"])).setValueAtTime(Number(an2[ai2][0]), Number(an2[ai2][1]));
      KSAE_yol(ly, aYol.concat(["ADBE Text Index End"])).setValueAtTime(Number(an2[ai2][0]), Number(an2[ai2][1]) + 1);
    }
    KSAE_tutKey(KSAE_yol(ly, aYol.concat(["ADBE Text Index Start"])));
    KSAE_tutKey(KSAE_yol(ly, aYol.concat(["ADBE Text Index End"])));
  }
  return ly;
}

function KSAE_yorum(isId, tur) { return KSAE_ISARET + " | " + String(isId || "") + " | " + String(tur || "satir"); }

function KSAE_altyaziOlustur(encoded) {
  var comp, plan;
  try {
    plan = KSAE_arg(encoded);
    comp = KSAE_comp();
  } catch (e0) { return KSAE_err(e0); }
  if (!comp) return KSAE_err("Aktif kompozisyon yok. After Effects'te altyazilarin eklenecegi kompozisyonu acip yeniden dene.");
  if (!plan || plan.surum !== KSAE_PLAN_SURUMU || !(plan.katmanlar instanceof Array)) return KSAE_err("Altyazi plani okunamadi (surum uyusmuyor).");
  if (!plan.katmanlar.length) return KSAE_err("Eklenecek altyazi yok.");
  var not = { eklenen: [], eksikFont: {}, italikYok: false };
  var etiket = Number(plan.etiket) || 0;
  app.beginUndoGroup("Suflo: altyazi ekle");
  try {
    for (var i = 0; i < plan.katmanlar.length; i++) KSAE_metinKatmani(comp, plan.katmanlar[i], KSAE_yorum(plan.isId, "satir"), etiket, not);
    var filigran = false;
    if (plan.filigran) {
      var fl = KSAE_metinKatmani(comp, plan.filigran, KSAE_yorum(plan.isId, "filigran"), etiket, not);
      // Deneme filigrani kilitli: yanlislikla secilip tasinmaz (Suflo altyazilarini kaldir kilidi acip siler)
      fl.locked = true;
      filigran = true;
    }
    var eksik = [];
    for (var f in not.eksikFont) if (not.eksikFont.hasOwnProperty(f)) eksik.push(f);
    return KSAE_ok({ adet: plan.katmanlar.length, filigran: filigran, comp: String(comp.name), eksikFont: eksik, italikYok: not.italikYok });
  } catch (e) {
    // Yarim is birakilmaz: bu cagrida eklenen her katman silinir
    for (var j = not.eklenen.length - 1; j >= 0; j--) {
      try { not.eklenen[j].locked = false; } catch (eK) {}
      try { not.eklenen[j].remove(); } catch (eR) {}
    }
    return KSAE_err("Altyazi katmanlari eklenemedi: " + (e && e.message ? e.message : e));
  } finally {
    app.endUndoGroup();
  }
}

// arg.isId verilirse yalniz o isin katmanlari; verilmezse kompozisyondaki tum Suflo altyazilari
function KSAE_altyaziKaldir(encoded) {
  var comp, a;
  try {
    a = KSAE_arg(encoded);
    comp = KSAE_comp();
  } catch (e0) { return KSAE_err(e0); }
  if (!comp) return KSAE_err("Aktif kompozisyon yok.");
  var onek = KSAE_ISARET + (a && a.isId ? " | " + String(a.isId) + " | " : "");
  var silinen = 0;
  app.beginUndoGroup("Suflo: altyazilari kaldir");
  try {
    for (var i = comp.numLayers; i >= 1; i--) {
      var ly = comp.layer(i);
      var y = "";
      try { y = String(ly.comment || ""); } catch (eY) { y = ""; }
      if (y.indexOf(onek) !== 0) continue;
      try { ly.locked = false; } catch (eK) {}
      ly.remove();
      silinen++;
    }
    return KSAE_ok({ removed: silinen, comp: String(comp.name) });
  } catch (e) {
    return KSAE_err("Suflo altyazilari kaldirilamadi: " + (e && e.message ? e.message : e));
  } finally {
    app.endUndoGroup();
  }
}
