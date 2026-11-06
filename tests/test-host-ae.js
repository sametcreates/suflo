/*
 * After Effects (deneysel) — jsx/host-ae.jsx sahte After Effects nesneleriyle (gerçek AE'de denenmedi):
 * host.jsx'in AE'de zararsız yüklenmesi, bağlam / seçili katmanların ham zamanları (panel js/ae-plan.js ile çevirir),
 * planın yürütülmesi (metin, yazı, in / out, çapa + konum, gölge, giriş anahtarları, kelime animatörleri: Units Index,
 * Based On Words, Hold anahtarlar), addProperty sonrası geçersizleşen özellik nesneleri (AE davranışı), eksik font /
 * italik bildirimi, hata olursa eklenenlerin silinmesi, tek geri al grubu ve yalnız Suflo katmanlarını kaldırma.
 * Çalıştır: node tests/test-host-ae.js
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var ROOT = path.join(__dirname, "..");
var P = require(path.join(ROOT, "js", "ae-plan.js"));
var AE = require(path.join(ROOT, "js", "altyazi-efekt.js"));

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + (evidence === undefined ? "" : "   [" + String(evidence).slice(0, 300) + "]")); }
}
function js(x) { return JSON.stringify(x); }
function kopya(v) { return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v; }

/* ---------------- sahte After Effects ---------------- */

var HOLD = 6614, LINEAR = 6612, BEZIER = 6613;

/*
 * Özellik ağacı: her property() çağrısı yeni bir sarmalayıcı verir; bir gruba addProperty yapılınca grubun altındaki
 * TÜM eski sarmalayıcılar geçersizleşir (AE'nin "Object is invalid" davranışı). Geçersiz sarmalayıcıya dokunmak fırlatır.
 */
function Dugum(ad, tur, ek) {
  this.ad = ad; this.tur = tur;           // "grup" | "yaprak" | "metin"
  this.cocuklar = []; this.verilen = [];
  this.deger = ek && ek.deger !== undefined ? kopya(ek.deger) : null;
  this.anahtarlar = [];
  this.ekle = ek && ek.ekle ? ek.ekle : null;   // addProperty(matchName) → Dugum
  this.adi = ad;
}
Dugum.prototype.altAgac = function (f) { f(this); this.cocuklar.forEach(function (c) { c.altAgac(f); }); };
// Bir grubun altındaki eski sarmalayıcılar geçersizleşir (addProperty / remove sonrası AE davranışı)
Dugum.prototype.gecersizKil = function () { this.cocuklar.forEach(function (c) { c.altAgac(function (x) { x.verilen.forEach(function (v) { v.gecersiz = true; }); x.verilen = []; }); }); };
Dugum.prototype.sar = function (ctx) {
  var d = this, w = { gecersiz: false };
  d.verilen.push(w);
  function bak() { if (w.gecersiz) throw new Error("Object is invalid (" + d.ad + ")"); }
  w.property = function (k) {
    bak();
    var c = typeof k === "number" ? d.cocuklar[k - 1] : d.cocuklar.filter(function (x) { return x.ad === k; })[0];
    return c ? c.sar(ctx) : null;
  };
  w.addProperty = function (mn) {
    bak();
    if (!d.ekle) throw new Error("addProperty desteklenmiyor: " + d.ad);
    // AE: grubun altındaki eski nesneler geçersizleşir
    d.gecersizKil();
    var yeni = d.ekle(mn);
    yeni.ust = d;
    d.cocuklar.push(yeni);
    return yeni.sar(ctx);
  };
  w.remove = function () {
    bak();
    var u = d.ust;
    if (!u) throw new Error("kök silinemez");
    u.gecersizKil();
    u.cocuklar.splice(u.cocuklar.indexOf(d), 1);
    ctx.silinen.push(d.ad);
  };
  Object.defineProperty(w, "expression", { get: function () { bak(); return d.ifade || ""; }, set: function (v) {
    bak();
    if (ctx.ifadeYok) throw new Error("ifade desteklenmiyor");
    d.ifade = String(v);
  } });
  Object.defineProperty(w, "canSetExpression", { get: function () { bak(); return d.tur !== "grup"; } });
  w.removeKey = function (k) { bak(); d.anahtarlar.splice(k - 1, 1); };
  // Zamansal yumuşatma: boyut sayısı özelliğe bağlı (Position 1, Scale 3); yanlış boyut fırlatır
  w.setTemporalEaseAtKey = function (k, gir, cik) {
    bak();
    var beklenen = d.easeBoyut || 1;
    if (gir.length !== beklenen || cik.length !== beklenen) throw new Error("ease boyutu " + beklenen + " olmalı");
    if (!gir.every(function (e) { return e instanceof ctx.KeyframeEase; })) throw new Error("KeyframeEase değil");
    d.anahtarlar[k - 1].ease = gir.map(function (e) { return e.influence; });
  };
  Object.defineProperty(w, "numProperties", { get: function () { bak(); return d.cocuklar.length; } });
  Object.defineProperty(w, "name", { get: function () { bak(); return d.adi; }, set: function (v) { bak(); d.adi = String(v); } });
  Object.defineProperty(w, "matchName", { get: function () { return d.ad; } });
  Object.defineProperty(w, "value", { get: function () { bak(); return d.tur === "metin" ? d.deger.kopya() : kopya(d.deger); } });
  Object.defineProperty(w, "numKeys", { get: function () { bak(); return d.anahtarlar.length; } });
  w.setValue = function (v) {
    bak();
    if (d.tur === "metin") {
      var td = v.kopya();
      // Kurulu olmayan font: AE başka fontla değiştirir (geri okunan ad farklı)
      ctx.fontDenemeleri.push(td.font);
      if (ctx.eksikFontlar.indexOf(td.font) !== -1) td.font = "MyriadPro-Regular";
      d.deger = td;
    } else d.deger = kopya(v);
  };
  w.setValueAtTime = function (t, v) {
    bak();
    if (d.gerek && !d.gerek()) throw new Error("özellik bu katmanda yok: " + d.ad);
    d.anahtarlar = d.anahtarlar.filter(function (a) { return Math.abs(a.t - t) > 1e-9; });
    d.anahtarlar.push({ t: t, v: kopya(v), ic: LINEAR, dis: LINEAR });
    d.anahtarlar.sort(function (a, b) { return a.t - b.t; });
  };
  // Toplu anahtar (AE setValuesAtTimes); o.topluYok: eski / kısıtlı sürüm benzetimi (fırlatır, host tek tek yazar)
  w.setValuesAtTimes = function (ts, vs) {
    bak();
    if (ctx.topluYok) throw new Error("setValuesAtTimes yok");
    if (ts.length !== vs.length) throw new Error("uzunluk");
    ctx.toplu++;
    for (var i = 0; i < ts.length; i++) w.setValueAtTime(ts[i], vs[i]);
  };
  w.setInterpolationTypeAtKey = function (k, i, o) { bak(); d.anahtarlar[k - 1].ic = i; d.anahtarlar[k - 1].dis = o; };
  return w;
};

function TextDocument(t) {
  this.text = t; this.font = "MyriadPro-Regular"; this.fontSize = 36; this.applyFill = true; this.fillColor = [0.5, 0.5, 0.5];
  this.applyStroke = false; this.strokeColor = [0, 0, 0]; this.strokeWidth = 0; this.strokeOverFill = true; this.justification = 0;
}
TextDocument.prototype.kopya = function () {
  var t = new TextDocument(this.text);
  for (var k in this) if (Object.prototype.hasOwnProperty.call(this, k)) t[k] = kopya(this[k]);
  // Eski AE: fauxItalic salt okunur (yazmak fırlatır)
  if (this._italikYok) Object.defineProperty(t, "fauxItalic", { set: function () { throw new Error("salt okunur"); }, get: function () { return false; } });
  return t;
};

function yaprak(ad, deger, ek) { var d = new Dugum(ad, "yaprak", { deger: deger }); for (var k in ek || {}) d[k] = ek[k]; return d; }
function grup(ad, cocuklar, ekle) {
  var g = new Dugum(ad, "grup", { ekle: ekle });
  g.cocuklar = cocuklar || [];
  g.cocuklar.forEach(function (c) { c.ust = g; });
  return g;
}

function secici() {
  return grup("ADBE Text Selector", [
    yaprak("ADBE Text Percent Start", 0), yaprak("ADBE Text Percent End", 100), yaprak("ADBE Text Percent Offset", 0),
    yaprak("ADBE Text Index Start", 0), yaprak("ADBE Text Index End", 0), yaprak("ADBE Text Index Offset", 0),
    grup("ADBE Text Range Advanced", [yaprak("ADBE Text Range Units", 1), yaprak("ADBE Text Range Type2", 1), yaprak("ADBE Text Selector Mode", 1),
      yaprak("ADBE Text Selector Max Amount", 100), yaprak("ADBE Text Range Shape", 1), yaprak("ADBE Text Selector Smoothness", 100)])
  ]);
}
// Animatör özellikleri (AE varsayılanlarıyla); desteklenmeyen (eski sürüm benzetimi) addProperty'de fırlatır
var ANIM_OZ = { "ADBE Text Opacity": 100, "ADBE Text Position 3D": [0, 0, 0], "ADBE Text Scale 3D": [100, 100, 100], "ADBE Text Rotation": 0,
  "ADBE Text Blur": [0, 0], "ADBE Text Tracking Amount": 0, "ADBE Text Fill Color": [1, 0, 0], "ADBE Text Stroke Color": [1, 0, 0] };
function animator(ctx) {
  var ozler = grup("ADBE Text Animator Properties", [], function (mn) {
    if (!Object.prototype.hasOwnProperty.call(ANIM_OZ, mn) || ctx.desteklenmeyen.indexOf(mn) !== -1) throw new Error("bilinmeyen animatör özelliği " + mn);
    // Tracking Amount eklemek Tracking Type'ı da ekler (AE)
    if (mn === "ADBE Text Tracking Amount") { var tt = yaprak("ADBE Text Track Type", 1); tt.ust = ozler; ozler.cocuklar.push(tt); }
    return yaprak(mn, ANIM_OZ[mn]);
  });
  return grup("ADBE Text Animator", [ozler,
    grup("ADBE Text Selectors", [], function (mn) { if (mn !== "ADBE Text Selector") throw new Error(mn); return secici(); })
  ]);
}
function maskeAtom() { return grup("ADBE Mask Atom", [yaprak("ADBE Mask Shape", null), yaprak("ADBE Mask Opacity", 100)]); }
// Şekil katmanı içeriği: grup → Contents (dikdörtgen, dolgu)
function vektorGrubu() {
  return grup("ADBE Vector Group", [grup("ADBE Vectors Group", [], function (mn) {
    if (mn === "ADBE Vector Shape - Rect") return grup(mn, [yaprak("ADBE Vector Rect Size", [100, 100]), yaprak("ADBE Vector Rect Position", [0, 0]),
      yaprak("ADBE Vector Rect Roundness", 0)]);
    if (mn === "ADBE Vector Graphic - Fill") return grup(mn, [yaprak("ADBE Vector Fill Color", [1, 0, 0, 1]), yaprak("ADBE Vector Fill Opacity", 100)]);
    throw new Error("bilinmeyen vektör " + mn);
  })]);
}
function golgeEfekti() {
  return grup("ADBE Drop Shadow", ["0001", "0002", "0003", "0004", "0005"].map(function (n) { return yaprak("ADBE Drop Shadow-" + n, 0); }));
}

function kur(o) {
  o = o || {};
  var durum = { undoAc: 0, undoKapa: 0, undoAdlari: [], rectSayac: 0 };
  function KeyframeEase(hiz, etki) { this.speed = hiz; this.influence = etki; }
  function Shape() { this.vertices = []; this.closed = false; }
  var ctx = { eksikFontlar: o.eksikFontlar || [], desteklenmeyen: o.desteklenmeyen || [], silinen: [], ifadeYok: !!o.ifadeYok, KeyframeEase: KeyframeEase,
    topluYok: !!o.topluYok, toplu: 0,
    fontDenemeleri: [] };

  function Katman(ad, ek) {
    ek = ek || {};
    this.name = ad; this.comment = ek.comment || ""; this.label = 0; this.locked = !!ek.locked;
    this._in = ek.inPoint || 0; this._out = ek.outPoint !== undefined ? ek.outPoint : 60;
    this.startTime = ek.startTime || 0; this.stretch = ek.stretch || 100; this.timeRemapEnabled = !!ek.timeRemap;
    this.hasAudio = ek.hasAudio !== false; this.source = ek.source || null;
    this.kok = {};
    this.metin = !!ek.metin;
    this.parent = null;
    this._uc = false;
  }
  Object.defineProperty(Katman.prototype, "threeDLayer", { get: function () { return this._uc; }, set: function (v) {
    if (o.ucBoyutYok) throw new Error("3B desteklenmiyor");
    this._uc = !!v; } });
  Katman.prototype.moveAfter = function (ly) {
    var i = comp._katmanlar.indexOf(this);
    comp._katmanlar.splice(i, 1);
    comp._katmanlar.splice(comp._katmanlar.indexOf(ly) + 1, 0, this);
  };
  Object.defineProperty(Katman.prototype, "inPoint", { get: function () { return this._in; }, set: function (v) {
    if (this.locked) throw new Error("kilitli katman");
    if (v >= this._out) throw new Error("inPoint outPoint'ten büyük olamaz"); this._in = v; } });
  Object.defineProperty(Katman.prototype, "outPoint", { get: function () { return this._out; }, set: function (v) {
    if (this.locked) throw new Error("kilitli katman");
    if (v <= this._in) throw new Error("outPoint inPoint'ten küçük olamaz"); this._out = v; } });
  Object.defineProperty(Katman.prototype, "index", { get: function () { return comp._katmanlar.indexOf(this) + 1; } });
  Katman.prototype.property = function (ad) { var d = this.kok[ad]; return d ? d.sar(ctx) : null; };
  Katman.prototype.remove = function () {
    if (this.locked) throw new Error("kilitli katman silinemez");
    comp._katmanlar.splice(comp._katmanlar.indexOf(this), 1);
  };
  Katman.prototype.sourceRectAtTime = function (t, ext) {
    durum.rectSayac++;
    if (o.rectHata && durum.rectSayac === o.rectHata) throw new Error("rect patladı");
    var td = this.kok["ADBE Text Properties"].cocuklar[0].deger;
    return { left: -100, top: -td.fontSize, width: 200, height: td.fontSize * 1.2, _t: t, _ext: ext };
  };

  function CompItem() {}
  function FootageItem(p) { this.file = p ? { fsName: p } : null; this.name = p ? path.basename(p) : "Katı"; }
  var comp = Object.create(CompItem.prototype);
  comp.name = "Ana kompozisyon"; comp.id = 42; comp.width = o.w || 1920; comp.height = o.h || 1080; comp.frameRate = 25; comp.duration = 60; comp.time = 0;
  comp._katmanlar = [];
  Object.defineProperty(comp, "numLayers", { get: function () { return comp._katmanlar.length; } });
  comp.layer = function (i) { return comp._katmanlar[i - 1]; };
  comp.selectedLayers = [];
  comp.layers = {
    addText: function (t) {
      var ly = new Katman(String(t), { metin: true, outPoint: comp.duration });
      var tdD = new Dugum("ADBE Text Document", "metin"); tdD.deger = new TextDocument(String(t));
      if (o.italikYok) tdD.deger._italikYok = true;
      ly.kok["ADBE Text Properties"] = grup("ADBE Text Properties", [tdD, grup("ADBE Text Animators", [], function (mn) {
        if (mn !== "ADBE Text Animator") throw new Error(mn); return animator(ctx); }),
        grup("ADBE Text More Options", [yaprak("ADBE Text Anchor Point Option", 1), yaprak("ADBE Text Anchor Point Align", [0, 0])])]);
      ly.kok["ADBE Transform Group"] = donusumGrubu(ly);
      ly.kok["ADBE Effect Parade"] = grup("ADBE Effect Parade", [], function (mn) { if (mn !== "ADBE Drop Shadow") throw new Error(mn); return golgeEfekti(); });
      ly.kok["ADBE Mask Parade"] = grup("ADBE Mask Parade", [], function (mn) { if (mn !== "ADBE Mask Atom") throw new Error(mn); return maskeAtom(); });
      comp._katmanlar.unshift(ly);
      return ly;
    },
    addShape: function () {
      if (o.sekilYok) throw new Error("şekil katmanı eklenemedi");
      var ly = new Katman("Şekil Katmanı 1", { outPoint: comp.duration });
      ly.sekil = true;
      ly.kok["ADBE Root Vectors Group"] = grup("ADBE Root Vectors Group", [], function (mn) { if (mn !== "ADBE Vector Group") throw new Error(mn); return vektorGrubu(); });
      ly.kok["ADBE Transform Group"] = donusumGrubu(ly);
      comp._katmanlar.unshift(ly);
      return ly;
    }
  };
  // Transform: X Rotation yalnız 3B katmanda anahtar alır; Scale 3 boyutlu yumuşatma ister
  function donusumGrubu(ly) {
    return grup("ADBE Transform Group", [yaprak("ADBE Anchor Point", [0, 0]), yaprak("ADBE Position", [960, 540]),
      yaprak("ADBE Scale", [100, 100], { easeBoyut: 3 }), yaprak("ADBE Rotate X", 0, { gerek: function () { return ly._uc; } }),
      yaprak("ADBE Rotate Z", 0), yaprak("ADBE Opacity", 100)]);
  }
  var kullanici = [];
  function katmanEkle(ad, ek) { var ly = new Katman(ad, ek); comp._katmanlar.push(ly); kullanici.push(ly); return ly; }

  var sandbox = {
    app: {
      version: "24.6.0x55",
      project: { activeItem: o.compYok ? null : comp, file: o.projeYok ? null : { name: "Proje.aep", parent: { exists: true, fsName: "D:\\İşler\\Proje" } } },
      beginUndoGroup: function (ad) { durum.undoAc++; durum.undoAdlari.push(ad); },
      endUndoGroup: function () { durum.undoKapa++; }
    },
    CompItem: CompItem, FootageItem: FootageItem,
    ParagraphJustification: { CENTER_JUSTIFY: 7415, LEFT_JUSTIFY: 7413 },
    KeyframeInterpolationType: { HOLD: HOLD, LINEAR: LINEAR, BEZIER: BEZIER }, KeyframeEase: KeyframeEase, Shape: Shape,
    Math: Math, Number: Number, String: String, Error: Error, isFinite: isFinite,
    decodeURIComponent: decodeURIComponent, encodeURIComponent: encodeURIComponent,
    File: function (p) { this.fsName = p; }, Folder: function () {}, $: { sleep: function () {} }
  };
  vm.createContext(sandbox);
  var hostHata = null;
  try { vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host.jsx"), "utf8"), sandbox, { filename: "jsx/host.jsx" }); }
  catch (e) { hostHata = e; }
  vm.runInContext(fs.readFileSync(path.join(ROOT, "jsx", "host-ae.jsx"), "utf8"), sandbox, { filename: "jsx/host-ae.jsx" });
  return {
    sb: sandbox, comp: comp, durum: durum, ctx: ctx, hostHata: hostHata, katmanEkle: katmanEkle, kullanici: kullanici, FootageItem: FootageItem, CompItem: CompItem,
    call: function (ad, arg) { return JSON.parse(arg === undefined ? sandbox[ad]() : sandbox[ad](encodeURIComponent(JSON.stringify(arg)))); }
  };
}

function metinDegeri(ly) { return ly.kok["ADBE Text Properties"].cocuklar[0].deger; }
function donusum(ly, ad) { return ly.kok["ADBE Transform Group"].cocuklar.filter(function (c) { return c.ad === ad; })[0]; }
function animatorler(ly) { return ly.kok["ADBE Text Properties"].cocuklar[1].cocuklar; }
function alt(d, ad) { return d.cocuklar.filter(function (c) { return c.ad === ad; })[0]; }
function sec(an) { return alt(an, "ADBE Text Selectors").cocuklar[0]; }

/* ---------------- yükleme ---------------- */
var h = kur();
ok("host.jsx AE'de yüklenir (üst düzeyde Premiere nesnesine dokunmaz)", h.hostHata === null, h.hostHata);
ok("host-ae.jsx işlevleri tanımlı, işaret js/ae-plan.js ile aynı", typeof h.sb.KSAE_baglam === "function" && typeof h.sb.KSAE_altyaziOlustur === "function" &&
  typeof h.sb.KSAE_altyaziKaldir === "function" && h.sb.KSAE_ISARET === P.ISARET && h.sb.KSAE_PLAN_SURUMU === P.SURUM);

/* ---------------- bağlam / seçili katmanlar ---------------- */
var hk = kur({ compYok: true });
var b0 = hk.call("KSAE_baglam");
ok("kompozisyon yokken bağlam: comp null → panelde hasSeq false", b0.ok && b0.comp === null && P.baglamSekli(b0).hasSeq === false && b0.project === "Proje.aep");
var h2 = kur();
var vid = h2.katmanEkle("Röportaj.mp4", { source: new h2.FootageItem("C:\\Video\\Röportaj.mp4"), inPoint: 2, outPoint: 12, startTime: -3, stretch: 100 });
var on = h2.katmanEkle("Ön komp", { source: Object.create(h2.CompItem.prototype) });
var kati = h2.katmanEkle("Katı", { source: new h2.FootageItem(null), hasAudio: false });
h2.comp.selectedLayers = [on, vid, kati];
var b1 = h2.call("KSAE_baglam");
ok("bağlam: kompozisyon bilgisi (boyut, fps, süre, zaman)", b1.ok && b1.comp.name === "Ana kompozisyon" && b1.comp.id === 42 && b1.comp.width === 1920 &&
  b1.comp.fps === 25 && b1.comp.duration === 60, js(b1.comp));
var hv = b1.katmanlar.filter(function (k) { return k.name === "Röportaj.mp4"; })[0];
ok("seçili katmanın ham zamanları ve kaynak dosyası", hv && hv.tur === "dosya" && hv.mediaPath === "C:\\Video\\Röportaj.mp4" && hv.inPoint === 2 &&
  hv.outPoint === 12 && hv.startTime === -3 && hv.stretch === 100 && hv.timeRemap === false && hv.hasAudio === true && hv.index === 1, js(hv));
ok("ön kompozisyon 'comp', katı renk 'diger'", b1.katmanlar.filter(function (k) { return k.name === "Ön komp"; })[0].tur === "comp" &&
  b1.katmanlar.filter(function (k) { return k.name === "Katı"; })[0].tur === "diger");
var kl = P.klipSekli(h2.call("KSAE_seciliKatmanlar"));
ok("panel çevirisi: yalnız dosyalı katman Premiere klibi olur (ss = 5, süre 10)", kl.ok && kl.clips.length === 1 && kl.clips[0].inPoint === 5 && kl.clips[0].dur === 10 &&
  kl.clips[0].clipStart === 2, js(kl));
var ok1 = h2.call("KSAE_oynatmaKafasi", { sec: 12.5 });
ok("oynatma kafası kompozisyon zamanına (süreye kırpılır)", ok1.ok && h2.comp.time === 12.5 && h2.call("KSAE_oynatmaKafasi", { sec: 999 }).time === 60);
ok("proje klasörü", h2.call("KSAE_projeKlasoru").dir === "D:\\İşler\\Proje" && kur({ projeYok: true }).call("KSAE_projeKlasoru").dir === "");

/* ---------------- düz plan ---------------- */
var h3 = kur();
var kullaniciMetni = h3.katmanEkle("Başlığım", { comment: "kendi notum" });
var duz = P.plan([{ start: 1, end: 2.5, text: "Merhaba dünya" }, { start: 3, end: 4, text: "İki\nsatır" }], { mod: "duz", w: 1920, h: 1080, fps: 25, sure: 60, isId: "d1" });
var r3 = h3.call("KSAE_altyaziOlustur", duz);
var suflo = h3.comp._katmanlar.filter(function (l) { return P.suflonunMu(l.comment); });
ok("düz: her satır bir metin katmanı, kullanıcı katmanına dokunulmaz", r3.ok && r3.adet === 2 && r3.filigran === false && suflo.length === 2 &&
  h3.comp._katmanlar.indexOf(kullaniciMetni) !== -1 && kullaniciMetni.comment === "kendi notum", js(r3));
var l1 = suflo.filter(function (l) { return l.name.indexOf("Suflo 001") === 0; })[0], l2 = suflo.filter(function (l) { return l.name.indexOf("Suflo 002") === 0; })[0];
ok("düz: yorum işareti + iş kimliği, etiket rengi", l1.comment === P.yorum("d1", "satir") && l1.label === P.ETIKET);
ok("düz: in / out planla aynı (kareye oturmuş: 2,5 sn 25 fps'te 2,52)", l1.inPoint === duz.katmanlar[0].bas && l1.outPoint === duz.katmanlar[0].son &&
  l1.outPoint === 2.52 && l2.inPoint === 3 && l2.outPoint === 4, js([l1.inPoint, l1.outPoint, l2.inPoint, l2.outPoint]));
var td1 = metinDegeri(l1), td2 = metinDegeri(l2);
ok("düz: metin, Arial Bold, punto, beyaz dolgu, siyah kontur (dolgu üstte), ortalı", td1.text === "Merhaba dünya" && td1.font === "Arial-BoldMT" &&
  td1.fontSize === 60 && js(td1.fillColor) === "[1,1,1]" && td1.applyStroke === true && td1.strokeWidth === 8 && td1.strokeOverFill === false &&
  td1.justification === 7415, js(td1));
ok("düz: iki satır AE kırılımıyla (\\r)", td2.text === "İki\rsatır");
ok("düz: çapa yazı kutusunun alt ortası, konum alt güvenli bölge", js(donusum(l1, "ADBE Anchor Point").deger) === js([0, -60 + 72]) &&
  js(donusum(l1, "ADBE Position").deger) === js(duz.katmanlar[0].konum), js([donusum(l1, "ADBE Anchor Point").deger, donusum(l1, "ADBE Position").deger]));
ok("düz: animatör, efekt, anahtar yok", animatorler(l1).length === 0 && l1.kok["ADBE Effect Parade"].cocuklar.length === 0 &&
  donusum(l1, "ADBE Scale").anahtarlar.length === 0);
ok("tek geri al grubu (açılan kapanır)", h3.durum.undoAc === 1 && h3.durum.undoKapa === 1 && /altyazi ekle/.test(h3.durum.undoAdlari[0]));

/* ---------------- stilli plan + filigran ---------------- */
var h4 = kur({ w: 1080, h: 1920 });
var ayar = AE.gorunum("vurucu").ayar;
var cues = [{ start: 1, end: 3, text: "Merhaba *dünya* bu bir deneme cümlesi" }, { start: 3.2, end: 5, text: "ikinci satır burada" }];
var st = P.plan(cues, { mod: "stilli", ayar: ayar, w: 1080, h: 1920, fps: 30, sure: 60, filigran: true, isId: "s1" });
var r4 = h4.call("KSAE_altyaziOlustur", st);
ok("stilli: kart sayısı kadar katman + kilitli filigran", r4.ok && r4.adet === st.katmanlar.length && r4.filigran === true &&
  h4.comp._katmanlar.length === st.katmanlar.length + 1, js(r4));
var fl = h4.comp._katmanlar.filter(function (l) { return /\| filigran$/.test(l.comment); })[0];
ok("filigran: suflo.app, kilitli, %60 opak, sağ üst çapa, kompozisyon boyunca", fl && metinDegeri(fl).text === "suflo.app" && fl.locked === true &&
  donusum(fl, "ADBE Opacity").deger === 60 && js(donusum(fl, "ADBE Anchor Point").deger) === js([100, -metinDegeri(fl).fontSize]) &&
  fl.inPoint === 0 && fl.outPoint === 60 && fl.comment === P.yorum("s1", "filigran"));
var k1 = h4.comp._katmanlar.filter(function (l) { return l.name === st.katmanlar[0].ad; })[0];
var p1 = st.katmanlar[0];
ok("stilli: yazı tipi / punto / renk / kontur plandan", metinDegeri(k1).font === p1.yazi.font && metinDegeri(k1).fontSize === p1.yazi.boyut &&
  metinDegeri(k1).strokeWidth === p1.yazi.kontur, js(metinDegeri(k1)));
ok("stilli: çapa kutunun ortası, konum Altyazı Efektleri noktası", js(donusum(k1, "ADBE Anchor Point").deger) === js([0, -p1.yazi.boyut + p1.yazi.boyut * 1.2 / 2]) &&
  js(donusum(k1, "ADBE Position").deger) === js(p1.konum));
var gol = k1.kok["ADBE Effect Parade"].cocuklar[0];
ok("stilli: Drop Shadow (renk, opaklık 0-255, 135°, mesafe, yumuşaklık)", gol && gol.ad === "ADBE Drop Shadow" &&
  js(alt(gol, "ADBE Drop Shadow-0001").deger) === js(p1.golge.renk) && Math.abs(alt(gol, "ADBE Drop Shadow-0002").deger - p1.golge.opak * 2.55) < 1e-9 &&
  alt(gol, "ADBE Drop Shadow-0003").deger === 135 && alt(gol, "ADBE Drop Shadow-0004").deger === p1.golge.mesafe && alt(gol, "ADBE Drop Shadow-0005").deger === p1.golge.yumusak);
var olc = donusum(k1, "ADBE Scale").anahtarlar;
ok("stilli: Pop girişi Scale anahtarları (kart başında 0, sonra 100)", olc.length === 2 && olc[0].t === p1.bas && js(olc[0].v) === "[0,0]" && js(olc[1].v) === "[100,100]");
var anlar = animatorler(k1);
var etkin = anlar.filter(function (a) { return a.adi === "Suflo etkin kelime"; })[0];
var sabit = anlar.filter(function (a) { return /^Suflo vurgu/.test(a.adi); });
ok("stilli: *vurgu* için sabit animatör, etkin kelime için ayrı animatör", etkin && sabit.length === p1.sabitVurgu.length && sabit.length === 1);
var es = sec(etkin), adv = alt(es, "ADBE Text Range Advanced");
ok("seçici: Units = Index (2), Based On = Words (3)", alt(adv, "ADBE Text Range Units").deger === 2 && alt(adv, "ADBE Text Range Type2").deger === 3);
var bas = alt(es, "ADBE Text Index Start").anahtarlar, son = alt(es, "ADBE Text Index End").anahtarlar;
ok("etkin kelime: Start = i, End = i + 1 her kelime başında (planın anahtarları)", bas.length === p1.aktif.anahtarlar.length &&
  bas.every(function (a, i) { return a.t === p1.aktif.anahtarlar[i][0] && a.v === p1.aktif.anahtarlar[i][1] && son[i].t === a.t && son[i].v === a.v + 1; }),
  js([bas, p1.aktif.anahtarlar]));
ok("etkin kelime: bütün anahtarlar Hold", bas.concat(son).every(function (a) { return a.ic === HOLD && a.dis === HOLD; }));
var ozler = alt(etkin, "ADBE Text Animator Properties");
ok("etkin kelime: Fill Color vurgu rengi, Scale %112 (Zıpla)", js(alt(ozler, "ADBE Text Fill Color").deger) === js(p1.aktif.renk) &&
  js(alt(ozler, "ADBE Text Scale 3D").deger) === "[112,112,100]");
var ss = sec(sabit[0]);
ok("*vurgu*: sabit Start / End (anahtarsız), kelimenin dizini", alt(ss, "ADBE Text Index Start").deger === p1.sabitVurgu[0].i0 &&
  alt(ss, "ADBE Text Index End").deger === p1.sabitVurgu[0].i1 && alt(ss, "ADBE Text Index Start").anahtarlar.length === 0 &&
  alt(alt(sec(sabit[0]), "ADBE Text Range Advanced"), "ADBE Text Range Type2").deger === 3);
ok("stilli: geçersizleşen özellik nesnesine hiç dokunulmadı (her adımda yeniden alındı) ve tek geri al grubu", r4.ok && h4.durum.undoAc === 1 && h4.durum.undoKapa === 1);

/* ---------------- eksik font, italik ---------------- */
var h5 = kur({ eksikFontlar: ["Anton-Regular"], italikYok: true });
var it = P.plan(cues, { mod: "stilli", ayar: (function () { var a = AE.gorunum("vurucu").ayar; a.italik = true; return a; })(), w: 1920, h: 1080, fps: 25, isId: "f" });
var r5 = h5.call("KSAE_altyaziOlustur", it);
ok("kurulu olmayan font bildirilir (bir kez), italik yazılamazsa bildirilir", r5.ok && js(r5.eksikFont) === '["Anton-Regular"]' && r5.italikYok === true, js(r5));
var h5m = h5.comp._katmanlar.filter(function (l) { return l.metin; });
ok("eksik font: katmanlar yedek fonta (Arial Bold) geçer; eksik font iş başına bir kez denenir, sonraki katman doğrudan yedekle",
  h5m.length === it.katmanlar.length && h5m.every(function (l) { return metinDegeri(l).font === "Arial-BoldMT"; }) &&
  h5.ctx.fontDenemeleri.filter(function (f) { return f === "Anton-Regular"; }).length === 1 && it.katmanlar[0].yazi.yedekFont === "Arial-BoldMT",
  js(h5.ctx.fontDenemeleri));

/* ---------------- hata: yarım iş bırakılmaz ---------------- */
var h6 = kur({ rectHata: 2 });
var kendi = h6.katmanEkle("Kullanıcı", {});
var r6 = h6.call("KSAE_altyaziOlustur", duz);
ok("ikinci katmanda hata: eklenen katmanlar silinir, kullanıcınınki kalır, Türkçe hata", !r6.ok && /eklenemedi/.test(r6.error) &&
  h6.comp._katmanlar.length === 1 && h6.comp._katmanlar[0] === kendi, js(r6));
ok("hata yolunda da geri al grubu kapanır", h6.durum.undoAc === 1 && h6.durum.undoKapa === 1);
var h7 = kur({ compYok: true });
ok("kompozisyon yokken ekleme / kaldırma: Türkçe hata, geri al grubu açılmaz", !h7.call("KSAE_altyaziOlustur", duz).ok &&
  /Aktif kompozisyon yok/.test(h7.call("KSAE_altyaziKaldir", {}).error) && h7.durum.undoAc === 0);
var h8 = kur();
ok("plan sürümü uyuşmuyorsa (eski v1 plan da) / boşsa yürütülmez", /surum/.test(h8.call("KSAE_altyaziOlustur", { surum: 1, katmanlar: [{}] }).error) &&
  /surum/.test(h8.call("KSAE_altyaziOlustur", { surum: 3, katmanlar: [{}] }).error) &&
  /Eklenecek altyazi yok/.test(h8.call("KSAE_altyaziOlustur", { surum: P.SURUM, katmanlar: [] }).error) && h8.comp._katmanlar.length === 0 && h8.durum.undoAc === 0);

/* ---------------- kaldırma ---------------- */
var h9 = kur();
var benzer = h9.katmanEkle("Benzer", { comment: "Benim Suflo altyazi notum" });
var bos = h9.katmanEkle("Boş yorum", {});
// İnceleme bulgusu: önek ayraçsızdı; yorumu "Suflo altyazi" ile BAŞLAYAN kullanıcı katmanları da kilidi açılıp siliniyordu
var yakin1 = h9.katmanEkle("Referans", { comment: "Suflo altyazisi icin referans", locked: true });
var yakin2 = h9.katmanEkle("Çıplak işaret", { comment: "Suflo altyazi" });
h9.call("KSAE_altyaziOlustur", duz);
h9.call("KSAE_altyaziOlustur", P.plan(cues, { mod: "stilli", ayar: ayar, w: 1920, h: 1080, fps: 25, filigran: true, isId: "s2" }));
var once = h9.comp._katmanlar.length;
var r9a = h9.call("KSAE_altyaziKaldir", { isId: "d1" });
ok("iş kimliğiyle kaldırma yalnız o işin katmanlarını siler", r9a.ok && r9a.removed === 2 && h9.comp._katmanlar.length === once - 2 &&
  h9.comp._katmanlar.some(function (l) { return /\| s2 \|/.test(l.comment); }));
var r9 = h9.call("KSAE_altyaziKaldir", {});
ok("tümünü kaldır: kilitli filigran dahil yalnız Suflo katmanları; benzer yorumlu ve yorumsuz kullanıcı katmanı kalır", r9.ok &&
  h9.comp._katmanlar.indexOf(benzer) !== -1 && h9.comp._katmanlar.indexOf(bos) !== -1 &&
  !h9.comp._katmanlar.some(function (l) { return P.suflonunMu(l.comment); }), js(r9));
ok("tümünü kaldır: yorumu 'Suflo altyazi' ile başlayan ama ayraçsız kullanıcı katmanları kalır (kilitli olan kilitli kalır)",
  h9.comp._katmanlar.length === 4 && h9.comp._katmanlar.indexOf(yakin1) !== -1 && yakin1.locked === true && h9.comp._katmanlar.indexOf(yakin2) !== -1,
  js(h9.comp._katmanlar.map(function (l) { return l.comment; })));
ok("kaldırma her çağrıda tek geri al grubu", h9.durum.undoAc === 4 && h9.durum.undoKapa === 4 && /kaldir/.test(h9.durum.undoAdlari[3]));
ok("Suflo katmanı yoksa 0 silinir (hata değil)", h9.call("KSAE_altyaziKaldir", {}).removed === 0);


/* ---------------- Parti 7: yazı animasyonları (metin animatörleri), kutu, maske ---------------- */
var YA = require(path.join(ROOT, "js", "yazi-animasyonlari.js"));
var aCues = [{ start: 1, end: 3.4, text: "Merhaba *dünya* bu bir deneme cümlesi", words: [
  { start: 1, end: 1.4, text: "Merhaba" }, { start: 1.45, end: 1.8, text: "dünya" }, { start: 1.8, end: 1.95, text: "bu" },
  { start: 2, end: 2.2, text: "bir" }, { start: 2.2, end: 2.6, text: "deneme" }, { start: 2.6, end: 3.4, text: "cümlesi" }] },
  { start: 3.6, end: 6, text: "ikinci kart burada sakin" }];
function animAyar(id, ek) {
  var a = AE.gorunum("kutulu").ayar;   // kutu açık
  a.anim = id; a.golge = { renk: "#000000", opak: 60, mesafe: 3, yumusak: 4 };
  for (var k in ek || {}) a[k] = ek[k];
  return a;
}
function animPlani(id, ek, kad) {
  kad = kad || {};
  return P.plan(aCues, { mod: "stilli", ayar: animAyar(id, ek), cueKind: "lines", w: kad.w || 1920, h: kad.h || 1080, fps: 25, sure: 60, isId: "a-" + id });
}
function anahtarDegerleri(d) { return d.anahtarlar.map(function (a) { return [a.t, a.v]; }); }
function metinKatmanlari(h) { return h.comp._katmanlar.filter(function (l) { return l.metin; }); }
function kutuKatmanlari(h) { return h.comp._katmanlar.filter(function (l) { return l.sekil; }); }
// Planın animatörü ↔ katmandaki animatör: ad, taban, birim, şekil, sabit / anahtarlı Start-End-Offset, Amount, özellikler
var TABAN = { karakter: 2, kelime: 3, satir: 4 }, SEKIL = { kare: 1 }, OZ = { opaklik: "ADBE Text Opacity", konum: "ADBE Text Position 3D",
  olcek: "ADBE Text Scale 3D", donme: "ADBE Text Rotation", bulaniklik: "ADBE Text Blur", izleme: "ADBE Text Tracking Amount", dolguRengi: "ADBE Text Fill Color" };
function animatorUyar(an, pa) {
  var hata = [];
  function bak(k, m) { if (!k) hata.push(m); }
  bak(an.adi === pa.ad, "ad " + an.adi);
  var se = sec(an), adv = alt(se, "ADBE Text Range Advanced"), s = pa.secici, ind = s.birim === "indeks";
  bak(alt(adv, "ADBE Text Range Units").deger === (ind ? 2 : 1), "birim");
  if (TABAN[pa.tabani]) bak(alt(adv, "ADBE Text Range Type2").deger === TABAN[pa.tabani], "taban");
  if (s.sekil) bak(alt(adv, "ADBE Text Range Shape").deger === SEKIL[s.sekil], "şekil");
  [["baslangic", "Start"], ["son", "End"], ["ofset", "Offset"]].forEach(function (p) {
    var d = alt(se, (ind ? "ADBE Text Index " : "ADBE Text Percent ") + p[1]);
    if (typeof s[p[0]] === "number") bak(d.anahtarlar.length ? true : d.deger === s[p[0]], p[0] + " sabit");
    var an2 = s[p[0] + "Anahtarlari"];
    if (an2) {
      bak(js(anahtarDegerleri(d)) === js(an2), p[0] + " anahtarları " + js(anahtarDegerleri(d)).slice(0, 80));
      var tut = s.tut === true || (s.tut instanceof Array && s.tut.indexOf(p[0]) !== -1);
      bak(d.anahtarlar.every(function (a) { return (a.ic === HOLD) === tut; }), p[0] + " Hold");
    }
  });
  if (s.miktarAnahtarlari) bak(js(anahtarDegerleri(alt(adv, "ADBE Text Selector Max Amount"))) === js(s.miktarAnahtarlari), "miktar");
  var oz = alt(an, "ADBE Text Animator Properties");
  Object.keys(pa.ozellikler).forEach(function (k) {
    var d = alt(oz, OZ[k]);
    bak(d && js(d.deger) === js(pa.ozellikler[k]), "özellik " + k);
    if (pa.anahtarlar && pa.anahtarlar[k]) bak(d && js(anahtarDegerleri(d)) === js(pa.anahtarlar[k]), "özellik anahtarı " + k);
  });
  return hata;
}

var ozet = {}, hepsiHata = [];
YA.kimlikler().forEach(function (id) {
  var hh = kur();
  var pl = animPlani(id);
  var rr = hh.call("KSAE_altyaziOlustur", pl);
  var mk = metinKatmanlari(hh), kk = kutuKatmanlari(hh), hata = [];
  if (!rr.ok) hata.push(rr.error);
  if (rr.atlanan && rr.atlanan.length) hata.push("atlanan " + js(rr.atlanan));
  if (hh.durum.undoAc !== 1 || hh.durum.undoKapa !== 1) hata.push("geri al grubu");
  if (mk.length !== pl.katmanlar.length || kk.length !== pl.katmanlar.length || rr.kutu !== pl.katmanlar.length) hata.push("katman sayısı");
  pl.katmanlar.forEach(function (pk) {
    var ly = mk.filter(function (l) { return l.name === pk.ad; })[0];
    if (!ly) { hata.push("katman yok " + pk.ad); return; }
    var anlar = animatorler(ly);
    // Sıra: *vurgu* sabitleri, etkin kelime, yazı animasyonu
    var beklenen = pk.sabitVurgu.length + (pk.aktif ? 1 : 0) + pk.animatorler.length;
    if (anlar.length !== beklenen) hata.push("animatör sayısı " + anlar.length + " ≠ " + beklenen);
    pk.animatorler.forEach(function (pa, j) {
      var an = anlar[pk.sabitVurgu.length + (pk.aktif ? 1 : 0) + j];
      hata = hata.concat(an ? animatorUyar(an, pa).map(function (x) { return pa.ad + ": " + x; }) : [pa.ad + " yok"]);
    });
    var DON = { opaklik: "ADBE Opacity", olcek: "ADBE Scale", konum: "ADBE Position", donme: "ADBE Rotate Z", xDonme: "ADBE Rotate X" };
    pk.katmanAnahtarlari.forEach(function (ka) {
      var d = donusum(ly, DON[ka.ozellik]);
      if (js(anahtarDegerleri(d)) !== js(ka.anahtarlar)) hata.push("katman anahtarı " + ka.ozellik);
      if (ka.yumusatma && !d.anahtarlar.every(function (a) { return a.ic === BEZIER && a.ease && a.ease.length === (DON[ka.ozellik] === "ADBE Scale" ? 3 : 1) && a.ease[0] === ka.yumusatma; })) hata.push("yumuşatma " + ka.ozellik);
    });
    var mo = ly.kok["ADBE Text Properties"].cocuklar[2];
    if (pk.gruplama === "kelime" && (alt(mo, "ADBE Text Anchor Point Option").deger !== 2 || js(alt(mo, "ADBE Text Anchor Point Align").deger) !== "[0,-50]")) hata.push("gruplama");
    if (!pk.gruplama && alt(mo, "ADBE Text Anchor Point Option").deger !== 1) hata.push("gereksiz gruplama");
    if (ly._uc !== pk.ucBoyut) hata.push("3B");
    var maskeler = ly.kok["ADBE Mask Parade"].cocuklar;
    if (pk.maske ? !(maskeler.length === 1 && maskeler[0].adi === pk.maske.ad && maskeler[0].cocuklar[0].ifade === pk.maske.ifade &&
      maskeler[0].cocuklar[0].deger && maskeler[0].cocuklar[0].deger.closed === true && maskeler[0].cocuklar[0].deger.vertices.length === 4) : maskeler.length) hata.push("maske");
    // Kutu: metnin hemen altında, ona bağlı, aynı in / out, işaretli; ifadeler plandan; dolgu rengi RGBA, opaklık
    var kl = hh.comp._katmanlar[hh.comp._katmanlar.indexOf(ly) + 1];
    if (!kl || !kl.sekil || kl.parent !== ly || kl.comment !== P.yorum(pl.isId, "kutu") || kl.label !== P.ETIKET || kl.inPoint !== ly.inPoint || kl.outPoint !== ly.outPoint) { hata.push("kutu katmanı"); return; }
    var vg = kl.kok["ADBE Root Vectors Group"].cocuklar[0].cocuklar[0], rect = alt(vg, "ADBE Vector Shape - Rect"), dol = alt(vg, "ADBE Vector Graphic - Fill");
    var tg = kl.kok["ADBE Transform Group"];
    if (alt(rect, "ADBE Vector Rect Size").ifade !== pk.kutu.ifade.boyut || js(alt(rect, "ADBE Vector Rect Position").deger) !== "[0,0]" ||
      js(alt(dol, "ADBE Vector Fill Color").deger) !== js(pk.kutu.renk.concat([1])) || alt(dol, "ADBE Vector Fill Opacity").deger !== pk.kutu.opak ||
      alt(tg, "ADBE Position").ifade !== pk.kutu.ifade.konum || alt(tg, "ADBE Scale").ifade !== pk.kutu.ifade.olcek ||
      alt(tg, "ADBE Rotate Z").ifade !== pk.kutu.ifade.donme || js(alt(tg, "ADBE Anchor Point").deger) !== "[0,0]") hata.push("kutu içeriği / ifadeleri");
  });
  ozet[id] = pl.katmanlar[0].animatorler.length + pl.katmanlar[0].katmanAnahtarlari.length;
  if (hata.length) hepsiHata.push(id + ": " + hata.slice(0, 3).join(" | "));
});
ok("her katalog animasyonu: host planı hatasız yürütür (animatör ağacı, seçici birim / taban / şekil, Start / End / Offset / Amount anahtarları ve Hold, özellik değerleri ve anahtarları, katman anahtarları ve yumuşatma, gruplama, 3B, maske, kutu katmanı), atlanan yok, tek geri al grubu",
  hepsiHata.length === 0, hepsiHata.join(" || "));
ok("'yok' animasyonlar animatörsüz (klasik çift), diğerleri yerel", YA.ANIMASYONLAR.every(function (a) { return (a.ae === "yok") === (ozet[a.id] === 0); }), js(ozet));

// Daktilo: harf harf Opacity 0, Characters Excluding Spaces, Index, Hold Start anahtarları
var hd = kur(), pd = animPlani("daktilo");
hd.call("KSAE_altyaziOlustur", pd);
var dly = metinKatmanlari(hd).filter(function (l) { return l.name === pd.katmanlar[0].ad; })[0];
var dan = animatorler(dly).filter(function (a) { return a.adi === "Suflo daktilo"; })[0];
var dsel = sec(dan), dSt = alt(dsel, "ADBE Text Index Start").anahtarlar;
ok("daktilo: Opacity 0 animatörü, Based On karakter (boşluksuz), Units Index, End = harf sayısı, Start her harfte +1 (Hold)",
  alt(alt(dan, "ADBE Text Animator Properties"), "ADBE Text Opacity").deger === 0 && alt(alt(dsel, "ADBE Text Range Advanced"), "ADBE Text Range Type2").deger === 2 &&
  alt(dsel, "ADBE Text Index End").deger === pd.katmanlar[0].metin.replace(/\s/g, "").length && dSt[dSt.length - 1].v === alt(dsel, "ADBE Text Index End").deger &&
  dSt.every(function (a, i) { return a.ic === HOLD && (!i || (a.t > dSt[i - 1].t && a.v > dSt[i - 1].v)); }), js(anahtarDegerleri({ anahtarlar: dSt })).slice(0, 200));

// Ölçek darbesi: Scale 122 etkin kelimede; Amount 0 → 100 → 0 kelimenin adımında
var ho = kur(), po = animPlani("olcek-darbe");
ho.call("KSAE_altyaziOlustur", po);
var oan = animatorler(metinKatmanlari(ho).filter(function (l) { return l.name === po.katmanlar[0].ad; })[0]).filter(function (a) { return a.adi === "Suflo ölçek darbesi"; })[0];
var oam = alt(alt(sec(oan), "ADBE Text Range Advanced"), "ADBE Text Selector Max Amount").anahtarlar;
ok("ölçek darbesi: Scale [122,122,100], kelime gruplaması, Amount her kelimede 0 → 100 → 0 (doğrusal)",
  js(alt(alt(oan, "ADBE Text Animator Properties"), "ADBE Text Scale 3D").deger) === "[122,122,100]" && oam.length >= 9 &&
  oam.every(function (a) { return a.ic === LINEAR && (a.v === 0 || a.v === 100); }) && oam.filter(function (a) { return a.v === 100; }).length === po.katmanlar[0].kelimeSayisi);

// Yandan kay: Position anahtarları yumuşatmalı (1 boyut), opaklık doğrusal; kutu kartla kayar (ifade o anki zamanla)
var hy = kur(), py = animPlani("yandan-kay");
hy.call("KSAE_altyaziOlustur", py);
var yly = metinKatmanlari(hy)[metinKatmanlari(hy).length - 1];
ok("yandan kay: konum soldan (−%8 genişlik) gelir, Bezier + yumuşatma; kutu konum ifadesi o anki zamanla (kartla kayar)",
  donusum(yly, "ADBE Position").anahtarlar[0].v[0] === py.katmanlar[0].konum[0] - Math.round(1920 * 0.08) &&
  donusum(yly, "ADBE Position").anahtarlar.every(function (a) { return a.ic === BEZIER && js(a.ease) === "[50]"; }) &&
  donusum(yly, "ADBE Opacity").anahtarlar.every(function (a) { return a.ic === LINEAR; }) &&
  /parent\.toComp\(\[[^\]]+\], time\)/.test(py.katmanlar[0].kutu.ifade.konum) && /, T\)\)$/.test(animPlani("netles").katmanlar[0].kutu.ifade.konum));

// Kapak çevir: 3B katman, X Rotation 70 → 0
var hk2 = kur(), pk2 = animPlani("kapak-cevir");
hk2.call("KSAE_altyaziOlustur", pk2);
var kly = metinKatmanlari(hk2)[0];
ok("kapak çevir: katman 3B, X Rotation 70 → 12 → 0, opaklık 0 → 100", kly._uc === true &&
  js(donusum(kly, "ADBE Rotate X").anahtarlar.map(function (a) { return a.v; })) === "[70,12,0]" && donusum(kly, "ADBE Opacity").anahtarlar[0].v === 0);

/* ---------------- bozulmadan geri çekilme: desteklenmeyen özellik iş durdurmaz ---------------- */
var hb = kur({ desteklenmeyen: ["ADBE Text Blur"] }), pb = animPlani("netles");
var rb = hb.call("KSAE_altyaziOlustur", pb);
var bly = metinKatmanlari(hb);
ok("desteklenmeyen animatör özelliği (Text Blur): iş biter, animatör yarım kalmaz (silinir), atlanan bir kez; opaklık girişi ve kutu yerinde",
  rb.ok && js(rb.atlanan) === '["Suflo netleş"]' && bly.length === pb.katmanlar.length &&
  bly.every(function (l) { return !animatorler(l).some(function (a) { return a.adi === "Suflo netleş"; }) && donusum(l, "ADBE Opacity").anahtarlar.length === 2; }) &&
  kutuKatmanlari(hb).length === pb.katmanlar.length && hb.durum.undoAc === 1 && hb.durum.undoKapa === 1, js(rb));
var h3b = kur({ ucBoyutYok: true }), p3b = animPlani("kapak-cevir");
var r3b = h3b.call("KSAE_altyaziOlustur", p3b);
ok("3B açılamazsa: X Rotation anahtarları geri alınır (0'da durağan), opaklık girişi kalır, iki parça bildirilir",
  r3b.ok && js(r3b.atlanan) === '["3B katman","X donmesi"]' && metinKatmanlari(h3b).every(function (l) {
    return donusum(l, "ADBE Rotate X").anahtarlar.length === 0 && donusum(l, "ADBE Rotate X").deger === 0 && donusum(l, "ADBE Opacity").anahtarlar.length === 2;
  }), js(r3b));
var hs = kur({ sekilYok: true }), rs = hs.call("KSAE_altyaziOlustur", animPlani("renk-gecis"));
ok("şekil katmanı eklenemezse: metin katmanları eklenir, kutu atlanır ve bildirilir", rs.ok && rs.kutu === 0 && js(rs.atlanan) === '["Arka plan kutusu"]' &&
  kutuKatmanlari(hs).length === 0 && metinKatmanlari(hs).length === rs.adet, js(rs));
var hi = kur({ ifadeYok: true }), ri = hi.call("KSAE_altyaziOlustur", animPlani("perde"));
ok("ifade yazılamazsa: perde maskesi ve kutu silinir (yazı gizli kalmaz), ikisi bildirilir", ri.ok && js(ri.atlanan) === '["Suflo perde","Arka plan kutusu"]' &&
  kutuKatmanlari(hi).length === 0 && metinKatmanlari(hi).every(function (l) { return l.kok["ADBE Mask Parade"].cocuklar.length === 0; }), js(ri));

/* ---------------- kaldırma: metin + kutu katmanları ---------------- */
var hr = kur();
var kullaniciSekil = hr.katmanEkle("Kendi şeklim", { comment: "logo" });
hr.call("KSAE_altyaziOlustur", animPlani("dalga"));
var oncekiSayi = hr.comp._katmanlar.length;
var rr2 = hr.call("KSAE_altyaziKaldir", {});
ok("kaldır: metin ve kutu katmanlarının hepsi gider, kullanıcı katmanı kalır, tek geri al grubu", rr2.ok && rr2.removed === oncekiSayi - 1 &&
  hr.comp._katmanlar.length === 1 && hr.comp._katmanlar[0] === kullaniciSekil && hr.durum.undoAc === 2 && hr.durum.undoKapa === 2, js(rr2));

/* ---------------- uzun transkript ---------------- */
var uzunCues = [];
for (var u = 0; u < 400; u++) {
  var t0 = u * 2.5;
  uzunCues.push({ start: t0, end: t0 + 2.2, text: "kelime bir iki üç dört", words: ["kelime", "bir", "iki", "üç", "dört"].map(function (w, j) {
    return { start: t0 + j * 0.44, end: t0 + j * 0.44 + 0.4, text: w };
  }) });
}
var hu = kur(), bas0 = Date.now();
hu.comp.duration = 1200;
var pu = P.plan(uzunCues, { mod: "stilli", ayar: animAyar("daktilo"), cueKind: "lines", w: 1920, h: 1080, fps: 25, sure: 1200, isId: "uzun" });
var ru = hu.call("KSAE_altyaziOlustur", pu);
var sureU = Date.now() - bas0;
ok("uzun transkript (400 kart, daktilo + kutu): hepsi eklenir, atlanan yok, makul sürede; anahtarlar toplu yazılır (setValuesAtTimes)",
  ru.ok && ru.adet === pu.katmanlar.length && pu.katmanlar.length >= 400 && ru.kutu === ru.adet && !ru.atlanan.length && sureU < 20000 && hu.ctx.toplu >= ru.adet,
  ru.adet + " katman, " + sureU + " ms, toplu " + hu.ctx.toplu);
var htk = kur({ topluYok: true }), ptk = animPlani("daktilo"), rtk = htk.call("KSAE_altyaziOlustur", ptk);
var tkSt = sec(animatorler(metinKatmanlari(htk).filter(function (l) { return l.name === ptk.katmanlar[0].ad; })[0]).filter(function (a) { return a.adi === "Suflo daktilo"; })[0]);
ok("setValuesAtTimes yoksa anahtarlar tek tek yazılır (aynı sonuç, Hold)", rtk.ok && !rtk.atlanan.length && htk.ctx.toplu === 0 &&
  js(anahtarDegerleri(alt(tkSt, "ADBE Text Index Start"))) === js(ptk.katmanlar[0].animatorler[0].secici.baslangicAnahtarlari) &&
  alt(tkSt, "ADBE Text Index Start").anahtarlar.every(function (a) { return a.ic === HOLD; }));

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
