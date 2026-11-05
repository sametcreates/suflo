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

var HOLD = 6614, LINEAR = 6612;

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
    d.cocuklar.forEach(function (c) { c.altAgac(function (x) { x.verilen.forEach(function (v) { v.gecersiz = true; }); x.verilen = []; }); });
    var yeni = d.ekle(mn);
    d.cocuklar.push(yeni);
    return yeni.sar(ctx);
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
      if (ctx.eksikFontlar.indexOf(td.font) !== -1) td.font = "ArialMT";
      d.deger = td;
    } else d.deger = kopya(v);
  };
  w.setValueAtTime = function (t, v) {
    bak();
    d.anahtarlar = d.anahtarlar.filter(function (a) { return Math.abs(a.t - t) > 1e-9; });
    d.anahtarlar.push({ t: t, v: kopya(v), ic: LINEAR, dis: LINEAR });
    d.anahtarlar.sort(function (a, b) { return a.t - b.t; });
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

function yaprak(ad, deger) { return new Dugum(ad, "yaprak", { deger: deger }); }
function grup(ad, cocuklar, ekle) { var g = new Dugum(ad, "grup", { ekle: ekle }); g.cocuklar = cocuklar || []; return g; }

function secici() {
  return grup("ADBE Text Selector", [
    yaprak("ADBE Text Index Start", 0), yaprak("ADBE Text Index End", 0),
    grup("ADBE Text Range Advanced", [yaprak("ADBE Text Range Units", 1), yaprak("ADBE Text Range Type2", 1)])
  ]);
}
function animator() {
  return grup("ADBE Text Animator", [
    grup("ADBE Text Animator Properties", [], function (mn) {
      if (mn === "ADBE Text Fill Color") return yaprak(mn, [1, 0, 0]);
      if (mn === "ADBE Text Scale 3D") return yaprak(mn, [100, 100, 100]);
      throw new Error("bilinmeyen animatör özelliği " + mn);
    }),
    grup("ADBE Text Selectors", [], function (mn) { if (mn !== "ADBE Text Selector") throw new Error(mn); return secici(); })
  ]);
}
function golgeEfekti() {
  return grup("ADBE Drop Shadow", ["0001", "0002", "0003", "0004", "0005"].map(function (n) { return yaprak("ADBE Drop Shadow-" + n, 0); }));
}

function kur(o) {
  o = o || {};
  var durum = { undoAc: 0, undoKapa: 0, undoAdlari: [], rectSayac: 0 };
  var ctx = { eksikFontlar: o.eksikFontlar || [] };

  function Katman(ad, ek) {
    ek = ek || {};
    this.name = ad; this.comment = ek.comment || ""; this.label = 0; this.locked = !!ek.locked;
    this._in = ek.inPoint || 0; this._out = ek.outPoint !== undefined ? ek.outPoint : 60;
    this.startTime = ek.startTime || 0; this.stretch = ek.stretch || 100; this.timeRemapEnabled = !!ek.timeRemap;
    this.hasAudio = ek.hasAudio !== false; this.source = ek.source || null;
    this.kok = {};
    this.metin = !!ek.metin;
  }
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
        if (mn !== "ADBE Text Animator") throw new Error(mn); return animator(); })]);
      ly.kok["ADBE Transform Group"] = grup("ADBE Transform Group", [yaprak("ADBE Anchor Point", [0, 0]), yaprak("ADBE Position", [960, 540]),
        yaprak("ADBE Scale", [100, 100]), yaprak("ADBE Opacity", 100)]);
      ly.kok["ADBE Effect Parade"] = grup("ADBE Effect Parade", [], function (mn) { if (mn !== "ADBE Drop Shadow") throw new Error(mn); return golgeEfekti(); });
      comp._katmanlar.unshift(ly);
      return ly;
    }
  };
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
    KeyframeInterpolationType: { HOLD: HOLD, LINEAR: LINEAR },
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
    sb: sandbox, comp: comp, durum: durum, hostHata: hostHata, katmanEkle: katmanEkle, kullanici: kullanici, FootageItem: FootageItem, CompItem: CompItem,
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
ok("plan sürümü uyuşmuyorsa / boşsa yürütülmez", /surum/.test(h8.call("KSAE_altyaziOlustur", { surum: 2, katmanlar: [{}] }).error) &&
  /Eklenecek altyazi yok/.test(h8.call("KSAE_altyaziOlustur", { surum: 1, katmanlar: [] }).error) && h8.comp._katmanlar.length === 0 && h8.durum.undoAc === 0);

/* ---------------- kaldırma ---------------- */
var h9 = kur();
var benzer = h9.katmanEkle("Benzer", { comment: "Benim Suflo altyazi notum" });
var bos = h9.katmanEkle("Boş yorum", {});
h9.call("KSAE_altyaziOlustur", duz);
h9.call("KSAE_altyaziOlustur", P.plan(cues, { mod: "stilli", ayar: ayar, w: 1920, h: 1080, fps: 25, filigran: true, isId: "s2" }));
var once = h9.comp._katmanlar.length;
var r9a = h9.call("KSAE_altyaziKaldir", { isId: "d1" });
ok("iş kimliğiyle kaldırma yalnız o işin katmanlarını siler", r9a.ok && r9a.removed === 2 && h9.comp._katmanlar.length === once - 2 &&
  h9.comp._katmanlar.some(function (l) { return /\| s2 \|/.test(l.comment); }));
var r9 = h9.call("KSAE_altyaziKaldir", {});
ok("tümünü kaldır: kilitli filigran dahil yalnız Suflo katmanları; benzer yorumlu ve yorumsuz kullanıcı katmanı kalır", r9.ok &&
  h9.comp._katmanlar.length === 2 && h9.comp._katmanlar.indexOf(benzer) !== -1 && h9.comp._katmanlar.indexOf(bos) !== -1, js(r9));
ok("kaldırma her çağrıda tek geri al grubu", h9.durum.undoAc === 4 && h9.durum.undoKapa === 4 && /kaldir/.test(h9.durum.undoAdlari[3]));
ok("Suflo katmanı yoksa 0 silinir (hata değil)", h9.call("KSAE_altyaziKaldir", {}).removed === 0);

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
