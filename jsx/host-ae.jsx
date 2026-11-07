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
 *   KSAE_altyaziOlustur(plan)           her kart bir metin katmanı (tek geri al grubu; hata olursa eklenenler silinir):
 *                                         yazı, gölge, giriş / animasyon anahtarları, metin animatörleri (Range Selector),
 *                                         maske (perde) ve kutu için metne bağlı şekil katmanı; kurulamayan animatör /
 *                                         anahtar / kutu işi durdurmaz, "atlanan" listesiyle panele bildirilir
 *   KSAE_altyaziKaldir                  yalnız yorumu "Suflo altyazi" ile başlayan katmanları siler (metin, kutu,
 *                                         filigran; tek geri al grubu)
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
var KSAE_PLAN_SURUMU = 2;

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
 * Plan v2 (js/ae-plan.js): metin animatoru { ad, tabani, ozellikler, anahtarlar, secici }. Ozellik adlari → AE
 * eslesme adlari; animatorun ozellikleri bu sirayla eklenir (deterministik agac).
 */
var KSAE_OZ = { opaklik: "ADBE Text Opacity", konum: "ADBE Text Position 3D", olcek: "ADBE Text Scale 3D", donme: "ADBE Text Rotation",
  bulaniklik: "ADBE Text Blur", izleme: "ADBE Text Tracking Amount", dolguRengi: "ADBE Text Fill Color", konturRengi: "ADBE Text Stroke Color" };
var KSAE_OZ_SIRA = ["opaklik", "konum", "olcek", "donme", "bulaniklik", "izleme", "dolguRengi", "konturRengi"];
// Based On: 1 Characters, 2 Characters Excluding Spaces, 3 Words, 4 Lines
var KSAE_TABAN = { karakter: 2, kelime: 3, satir: 4 };
// Shape: 1 Square, 2 Ramp Up, 3 Ramp Down, 4 Triangle, 5 Round, 6 Smooth
var KSAE_SEKIL = { kare: 1, yukari_rampa: 2, asagi_rampa: 3, ucgen: 4, yuvarlak: 5, yumusak: 6 };
// Anchor Point Grouping: 1 Character, 2 Word, 3 Line, 4 All
var KSAE_GRUP = { karakter: 1, kelime: 2, satir: 3, hepsi: 4 };
// Katman anahtarlari (Transform) ve panelin uyarisindaki adlari
var KSAE_DONUSUM = { opaklik: "ADBE Opacity", olcek: "ADBE Scale", konum: "ADBE Position", donme: "ADBE Rotate Z", xDonme: "ADBE Rotate X" };
var KSAE_DONUSUM_AD = { opaklik: "Katman opakligi", olcek: "Katman olcegi", konum: "Katman konumu", donme: "Katman donmesi", xDonme: "X donmesi" };

function KSAE_sahip(o, k) { return !!o && typeof o === "object" && o.hasOwnProperty(k); }

// Kurulamayan parca: bir kez listelenir (panel Turkce uyarida gosterir); is durmaz
function KSAE_atla(not, ad) {
  var a = String(ad || "?");
  if (not.atlanan.hasOwnProperty(a)) return;
  not.atlanan[a] = 1;
  not.atlananSira.push(a);
}

function KSAE_tutulsunMu(tut, ad) {
  if (tut === true) return true;
  if (!(tut instanceof Array)) return false;
  for (var i = 0; i < tut.length; i++) if (tut[i] === ad) return true;
  return false;
}

/*
 * Anahtarlar: once toplu (setValuesAtTimes; yuzlerce katmanli uzun transkriptte daktilonun harf anahtarlari tek cagri),
 * olmazsa tek tek. Toplu cagri ya hep ya hic yazar.
 */
function KSAE_anahtarla(prop, an, tut) {
  var t = [], v = [], toplu = false;
  for (var i = 0; i < an.length; i++) { t.push(Number(an[i][0])); v.push(an[i][1]); }
  if (an.length > 1) { try { prop.setValuesAtTimes(t, v); toplu = true; } catch (eT) { toplu = false; } }
  if (!toplu) for (var j = 0; j < an.length; j++) prop.setValueAtTime(t[j], v[j]);
  if (tut) KSAE_tutKey(prop);
}

function KSAE_dizi(v, n) { var a = []; for (var i = 0; i < n; i++) a.push(v); return a; }

/*
 * Zamansal yumusatma (Easy Ease benzeri; hiz 0, etki %). Boyut sayisi ozellige ve surume bagli (Position 1, Scale 3):
 * 1, 2, 3 sirayla denenir. Yazilamazsa anahtarlar dogrusal kalir (hareket yine dogru).
 */
function KSAE_yumusat(prop, etki) {
  var e = new KeyframeEase(0, etki > 0 && etki <= 100 ? etki : 50), boyut = 0;
  for (var k = 1; k <= prop.numKeys; k++) {
    try { prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (eT) {}
    if (boyut) { prop.setTemporalEaseAtKey(k, KSAE_dizi(e, boyut), KSAE_dizi(e, boyut)); continue; }
    for (var d = 1; d <= 3 && !boyut; d++) {
      try { prop.setTemporalEaseAtKey(k, KSAE_dizi(e, d), KSAE_dizi(e, d)); boyut = d; } catch (eD) {}
    }
    if (!boyut) return;
  }
}

function KSAE_ifade(prop, metin) {
  if (!prop) throw new Error("ozellik yok");
  if (prop.canSetExpression === false) throw new Error("ifade yazilamiyor");
  prop.expression = String(metin);
}

// Sekil katmani renkleri RGBA (4); bazi surumler RGB kabul eder
function KSAE_renk(prop, rgb) {
  try { prop.setValue([rgb[0], rgb[1], rgb[2], 1]); } catch (e) { prop.setValue([rgb[0], rgb[1], rgb[2]]); }
}

/*
 * Metin animatoru (plan v2). Range Selector: Units / Based On / Shape (Advanced), Start / End / Offset (Index ya da
 * Percent) sabit ya da anahtarli, Amount anahtarlari; sonra ozellikler (sabit deger ve / veya anahtar). Bir adim
 * patlarsa yarim animator silinir (ornegin secicisi kurulamamis Opacity 0 animatoru yaziyi tumden gizlerdi) ve hata
 * cagirana gecer.
 */
function KSAE_animatorKur(ly, a) {
  var anYol = ["ADBE Text Properties", "ADBE Text Animators"];
  KSAE_yol(ly, anYol).addProperty("ADBE Text Animator");
  var ai = KSAE_yol(ly, anYol).numProperties;
  var yol = anYol.concat([ai]);
  try {
    KSAE_yol(ly, yol).name = String(a.ad || "Suflo");
    var s = a.secici || {};
    KSAE_yol(ly, yol.concat(["ADBE Text Selectors"])).addProperty("ADBE Text Selector");
    var sel = yol.concat(["ADBE Text Selectors", 1]);
    var adv = sel.concat(["ADBE Text Range Advanced"]);
    var indeks = s.birim === "indeks";
    if (indeks) KSAE_yol(ly, adv.concat(["ADBE Text Range Units"])).setValue(2);
    if (KSAE_sahip(KSAE_TABAN, a.tabani)) KSAE_yol(ly, adv.concat(["ADBE Text Range Type2"])).setValue(KSAE_TABAN[a.tabani]);
    if (s.sekil && KSAE_sahip(KSAE_SEKIL, s.sekil)) KSAE_yol(ly, adv.concat(["ADBE Text Range Shape"])).setValue(KSAE_SEKIL[s.sekil]);
    var on = indeks ? "ADBE Text Index " : "ADBE Text Percent ";
    var parca = [["baslangic", "Start"], ["son", "End"], ["ofset", "Offset"]];
    for (var p = 0; p < parca.length; p++) {
      var pYol = sel.concat([on + parca[p][1]]);
      if (typeof s[parca[p][0]] === "number") KSAE_yol(ly, pYol).setValue(Number(s[parca[p][0]]));
      var an = s[parca[p][0] + "Anahtarlari"];
      if (an && an.length) KSAE_anahtarla(KSAE_yol(ly, pYol), an, KSAE_tutulsunMu(s.tut, parca[p][0]));
    }
    if (s.miktarAnahtarlari && s.miktarAnahtarlari.length) {
      KSAE_anahtarla(KSAE_yol(ly, adv.concat(["ADBE Text Selector Max Amount"])), s.miktarAnahtarlari, KSAE_tutulsunMu(s.tut, "miktar"));
    }
    var ozYol = yol.concat(["ADBE Text Animator Properties"]);
    var oz = a.ozellikler || {}, ank = a.anahtarlar || {};
    for (var o = 0; o < KSAE_OZ_SIRA.length; o++) {
      var k = KSAE_OZ_SIRA[o];
      if (!KSAE_sahip(oz, k) && !KSAE_sahip(ank, k)) continue;
      KSAE_yol(ly, ozYol).addProperty(KSAE_OZ[k]);
      if (KSAE_sahip(oz, k)) KSAE_yol(ly, ozYol.concat([KSAE_OZ[k]])).setValue(oz[k]);
      if (ank[k] && ank[k].length) KSAE_anahtarla(KSAE_yol(ly, ozYol.concat([KSAE_OZ[k]])), ank[k], false);
    }
  } catch (e) {
    try { KSAE_yol(ly, anYol.concat([ai])).remove(); } catch (eR) {}
    throw e;
  }
}

// Animator kurulamazsa (surumde olmayan ozellik) is durmaz: o animator atlanir, panel uyarir
function KSAE_animatorDene(ly, a, not) {
  try { KSAE_animatorKur(ly, a); } catch (e) { KSAE_atla(not, a && a.ad); }
}

function KSAE_varsayilan(ozellik, k) {
  if (ozellik === "opaklik") return typeof k.opaklik === "number" ? k.opaklik : 100;
  if (ozellik === "olcek") return [100, 100];
  if (ozellik === "konum") return k.konum;
  return 0;
}

/*
 * Katman (Transform) anahtarlari: [{ ozellik, anahtarlar, yumusatma }]. Patlarsa o ozelligin anahtarlari silinir ve
 * duragan degerine doner (yarim opaklik anahtari yaziyi gizli birakmasin); panel uyarir.
 */
function KSAE_katmanKeyleri(ly, liste, k, not) {
  for (var i = 0; i < liste.length; i++) {
    var e = liste[i];
    if (!KSAE_sahip(KSAE_DONUSUM, e.ozellik)) continue;
    var yol = ["ADBE Transform Group", KSAE_DONUSUM[e.ozellik]];
    try {
      KSAE_anahtarla(KSAE_yol(ly, yol), e.anahtarlar || [], false);
    } catch (eK) {
      try {
        var pr = KSAE_yol(ly, yol);
        while (pr.numKeys > 0) pr.removeKey(1);
        pr.setValue(KSAE_varsayilan(e.ozellik, k));
      } catch (eG) {}
      KSAE_atla(not, KSAE_DONUSUM_AD[e.ozellik]);
      continue;
    }
    if (e.yumusatma) { try { KSAE_yumusat(KSAE_yol(ly, yol), Number(e.yumusatma)); } catch (eY) {} }
  }
}

/*
 * Plan katmani → metin katmani. k: { ad, metin, bas, son, konum, capa, yazi, golge, giris, aktif, sabitVurgu, opaklik,
 * animatorler, katmanAnahtarlari, gruplama, ucBoyut, maske }.
 * not: { eklenen, eksikFont: {}, italikYok: bool, atlanan: {}, atlananSira: [] } (cagirana bildirilir).
 */
function KSAE_metinKatmani(comp, k, yorum, etiket, not) {
  var ly = comp.layers.addText(String(k.metin));
  not.eklenen.push(ly);
  ly.name = String(k.ad || "Suflo");
  var y = k.yazi || {};
  var tp = KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text Document"]);
  var td = tp.value;
  td.text = String(k.metin);
  /*
   * Yazi tipi: planin PostScript adi (paket fontlari AE'ye kurulu olmayabilir). Kurulu degilse AE baska fontla degistirir:
   * geri okunan ad farkliysa font isin eksik listesine girer (panel bir kez soyler) ve katman yedek fonta (Arial) gecer;
   * ayni isin sonraki katmanlari eksik fontu yeniden denemeden yedekle baslar.
   */
  var font = y.font ? String(y.font) : "", yedek = y.yedekFont ? String(y.yedekFont) : "";
  if (font && yedek && not.eksikFont.hasOwnProperty(font)) font = yedek;
  if (font) td.font = font;
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
  try {
    var geri = String(KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text Document"]).value.font);
    if (font && geri !== font) {
      if (font === String(y.font)) not.eksikFont[font] = 1;
      if (yedek && font !== yedek) {
        var td2 = KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text Document"]).value;
        td2.font = yedek;
        KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text Document"]).setValue(td2);
      }
    }
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
  // Kapak cevir: 3B katman (X donmesi); capa ve konum 2B yazildiktan sonra (z 0 olur)
  if (k.ucBoyut) { try { ly.threeDLayer = true; } catch (e3) { KSAE_atla(not, "3B katman"); } }

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

  // Giris animasyonu (klasik) ve yazi animasyonunun katman anahtarlari: Transform
  KSAE_katmanKeyleri(ly, k.giris || [], k, not);
  KSAE_katmanKeyleri(ly, k.katmanAnahtarlari || [], k, not);

  // Anchor Point Grouping: kelime olcegi / donmesi kelimenin ortasinda (varsayilan harf harf)
  if (k.gruplama && KSAE_sahip(KSAE_GRUP, k.gruplama)) {
    try {
      KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text More Options", "ADBE Text Anchor Point Option"]).setValue(KSAE_GRUP[k.gruplama]);
      KSAE_yol(ly, ["ADBE Text Properties", "ADBE Text More Options", "ADBE Text Anchor Point Align"]).setValue([0, -50]);
    } catch (eG) { KSAE_atla(not, "Gruplama"); }
  }

  // *Vurgu*lu kelimeler: kelime basina sabit renk animatoru
  var sv = k.sabitVurgu || [];
  for (var si = 0; si < sv.length; si++) {
    KSAE_animatorDene(ly, { ad: "Suflo vurgu " + (si + 1), tabani: "kelime", ozellikler: { dolguRengi: sv[si].renk },
      secici: { birim: "indeks", baslangic: Number(sv[si].i0), son: Number(sv[si].i1) } }, not);
  }

  // Etkin kelime: Start = i, End = i + 1 kelime basinda (Hold anahtar)
  if (k.aktif && k.aktif.anahtarlar && k.aktif.anahtarlar.length && (k.aktif.renk || k.aktif.olcek)) {
    var an2 = k.aktif.anahtarlar, bs = [], sn = [], oz = {};
    for (var ai2 = 0; ai2 < an2.length; ai2++) {
      bs.push([Number(an2[ai2][0]), Number(an2[ai2][1])]);
      sn.push([Number(an2[ai2][0]), Number(an2[ai2][1]) + 1]);
    }
    if (k.aktif.renk) oz.dolguRengi = k.aktif.renk;
    if (k.aktif.olcek) oz.olcek = [k.aktif.olcek, k.aktif.olcek, 100];
    KSAE_animatorDene(ly, { ad: "Suflo etkin kelime", tabani: "kelime", ozellikler: oz,
      secici: { birim: "indeks", baslangicAnahtarlari: bs, sonAnahtarlari: sn, tut: true } }, not);
  }

  // Yazi animasyonu (plan v2): metin animatorleri
  var am = k.animatorler || [];
  for (var mi = 0; mi < am.length; mi++) KSAE_animatorDene(ly, am[mi], not);

  // Perde: sourceRectAtTime'a bagli maske yolu ifadesi. Duragan yol butun kadraji kaplar: ifade calismazsa yazi gizli kalmaz
  if (k.maske && k.maske.ifade) {
    var mk = 0;
    try {
      KSAE_yol(ly, ["ADBE Mask Parade"]).addProperty("ADBE Mask Atom");
      mk = KSAE_yol(ly, ["ADBE Mask Parade"]).numProperties;
      KSAE_yol(ly, ["ADBE Mask Parade", mk]).name = String(k.maske.ad || "Suflo");
      var sekil = new Shape();
      sekil.vertices = [[-100000, -100000], [100000, -100000], [100000, 100000], [-100000, 100000]];
      sekil.closed = true;
      KSAE_yol(ly, ["ADBE Mask Parade", mk, "ADBE Mask Shape"]).setValue(sekil);
      KSAE_ifade(KSAE_yol(ly, ["ADBE Mask Parade", mk, "ADBE Mask Shape"]), k.maske.ifade);
    } catch (eM) {
      try { if (mk) KSAE_yol(ly, ["ADBE Mask Parade", mk]).remove(); } catch (eMR) {}
      KSAE_atla(not, k.maske.ad || "Maske");
    }
  }
  return ly;
}

/*
 * Arka plan kutusu: metin katmanina bagli (parent) sekil katmani, metnin hemen altinda. Dikdortgenin boyutu ve katmanin
 * konum / olcek / donmesi plandaki ifadeler (sourceRectAtTime; ust katmanin olcegi ve donmesi geri alinir). Yorum
 * isareti metninkiyle ayni onek ("| kutu"): kaldirma onu da siler. Kurulamazsa silinir, panel uyarir.
 */
function KSAE_kutuKatmani(comp, ly, k, yorum, etiket, not) {
  var b = k.kutu, f = b.ifade || {}, sh = null;
  try {
    sh = comp.layers.addShape();
    not.eklenen.push(sh);
    sh.name = String(k.ad || "Suflo") + " (kutu)";
    sh.comment = yorum;
    try { sh.label = etiket; } catch (eL) {}
    sh.inPoint = Number(k.bas);
    sh.outPoint = Number(k.son);
    sh.moveAfter(ly);
    sh.parent = ly;
    var kok = ["ADBE Root Vectors Group"];
    KSAE_yol(sh, kok).addProperty("ADBE Vector Group");
    var g = kok.concat([KSAE_yol(sh, kok).numProperties, "ADBE Vectors Group"]);
    KSAE_yol(sh, g).addProperty("ADBE Vector Shape - Rect");
    KSAE_yol(sh, g).addProperty("ADBE Vector Graphic - Fill");
    var rect = g.concat(["ADBE Vector Shape - Rect"]), dolgu = g.concat(["ADBE Vector Graphic - Fill"]);
    KSAE_yol(sh, rect.concat(["ADBE Vector Rect Position"])).setValue([0, 0]);
    KSAE_ifade(KSAE_yol(sh, rect.concat(["ADBE Vector Rect Size"])), f.boyut);
    KSAE_renk(KSAE_yol(sh, dolgu.concat(["ADBE Vector Fill Color"])), b.renk || [0, 0, 0]);
    KSAE_yol(sh, dolgu.concat(["ADBE Vector Fill Opacity"])).setValue(Number(b.opak));
    KSAE_yol(sh, ["ADBE Transform Group", "ADBE Anchor Point"]).setValue([0, 0]);
    KSAE_ifade(KSAE_yol(sh, ["ADBE Transform Group", "ADBE Position"]), f.konum);
    KSAE_ifade(KSAE_yol(sh, ["ADBE Transform Group", "ADBE Scale"]), f.olcek);
    KSAE_ifade(KSAE_yol(sh, ["ADBE Transform Group", "ADBE Rotate Z"]), f.donme);
    return sh;
  } catch (e) {
    if (sh) {
      not.eklenen.pop();
      try { sh.remove(); } catch (eR) {}
    }
    KSAE_atla(not, "Arka plan kutusu");
    return null;
  }
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
  var not = { eklenen: [], eksikFont: {}, italikYok: false, atlanan: {}, atlananSira: [] };
  var etiket = Number(plan.etiket) || 0;
  var kutu = 0;
  app.beginUndoGroup("Suflo: altyazi ekle");
  try {
    for (var i = 0; i < plan.katmanlar.length; i++) {
      var pk = plan.katmanlar[i];
      var ly = KSAE_metinKatmani(comp, pk, KSAE_yorum(plan.isId, "satir"), etiket, not);
      if (pk.kutu && KSAE_kutuKatmani(comp, ly, pk, KSAE_yorum(plan.isId, "kutu"), etiket, not)) kutu++;
    }
    var filigran = false;
    if (plan.filigran) {
      var fl = KSAE_metinKatmani(comp, plan.filigran, KSAE_yorum(plan.isId, "filigran"), etiket, not);
      // Deneme filigrani kilitli: yanlislikla secilip tasinmaz (Suflo altyazilarini kaldir kilidi acip siler)
      fl.locked = true;
      filigran = true;
    }
    var eksik = [];
    for (var f in not.eksikFont) if (not.eksikFont.hasOwnProperty(f)) eksik.push(f);
    return KSAE_ok({ adet: plan.katmanlar.length, filigran: filigran, comp: String(comp.name), eksikFont: eksik, italikYok: not.italikYok,
      kutu: kutu, atlanan: not.atlananSira });
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
  // Ayrac sart: yorumu yalniz "Suflo altyazi" ile BASLAYAN kullanici katmani ("Suflo altyazisi icin not") Suflo'nun sayilmaz
  var onek = KSAE_ISARET + " | " + (a && a.isId ? String(a.isId) + " | " : "");
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
