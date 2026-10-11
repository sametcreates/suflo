// Suflo testi: js/hiz-rampasi.js — Hız Rampası paneli (sahte DOM, sahte Premiere köprüsü, sahte Pro)
// Kapı 'speedramp' + deneme; hak yalnız en az bir klip rampalanınca ve bir kez düşer; kaldır kapısız;
// tutamak tahmini tutmazsa bir kez Dengeli ile yeniden dener; kayıt + kalibrasyon yerel depoda
// (depo atsa da iş bozulmaz); atlama özeti; Ritme Rampa kartı vuruş yokken kapalı; klip adı çevrilmez.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var SR = require(path.join(KOK, "js", "speedramp.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms || 5); }); }

function eleman(tag, id) {
  var x = { tagName: String(tag || "div").toUpperCase(), id: id || "", children: [], className: "", disabled: false, hidden: false, value: "", checked: false,
    type: "", style: {}, _o: {}, _a: {}, _html: "", _text: "" };
  Object.defineProperty(x, "innerHTML", { get: function () { return x._html; }, set: function (v) { x._html = String(v); x.children = []; x._text = ""; } });
  Object.defineProperty(x, "textContent", {
    get: function () { return x.children.length ? x.children.map(function (c) { return c.textContent; }).join("") : x._text; },
    set: function (v) { x._text = String(v); x.children = []; x._html = ""; }
  });
  x.appendChild = function (c) { x.children.push(c); return c; };
  x.addEventListener = function (t, fn) { x._o[t] = fn; };
  x.setAttribute = function (k, v) { x._a[k] = String(v); };
  x.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(x._a, k) ? x._a[k] : null; };
  var sinif = {};
  x.classList = {
    add: function (c) { sinif[c] = 1; }, remove: function (c) { delete sinif[c]; }, contains: function (c) { return !!sinif[c]; },
    toggle: function (c, on) { if (on === undefined ? !sinif[c] : on) sinif[c] = 1; else delete sinif[c]; }
  };
  return x;
}

function kur(o) {
  o = o || {};
  var dom = {}, cagri = [], kapi = [], harcanan = [], toastlar = [];
  ["tab-hiz", "hiz-status", "hiz-hedef", "hiz-grid", "hiz-onizleme", "hiz-ozet", "hiz-uygula", "hiz-kaldir", "hiz-ritim-yon-kutu", "hiz-tanitim"].forEach(function (id) { dom[id] = eleman("div", id); });
  var degerler = { "hiz-aralik": "clips", "hiz-yogunluk": "1", "hiz-gecis": "smooth", "hiz-parca": "normal", "hiz-kaynak": o.kaynak || "auto", "hiz-ses": "mute", "hiz-akis": "1", "hiz-ritim-yon": "slow" };
  Object.keys(degerler).forEach(function (id) { dom[id] = eleman("select", id); dom[id].value = degerler[id]; });
  ["hiz-bulanik", "hiz-vurus", "hiz-kopya"].forEach(function (id) { dom[id] = eleman("input", id); dom[id].type = "checkbox"; });
  dom["hiz-kopya"].checked = o.kopya !== false;
  var depo = o.depo || {};
  var ls = o.lsAtar ? { getItem: function () { throw new Error("SecurityError"); }, setItem: function () { throw new Error("QuotaExceeded"); } }
    : { getItem: function (k) { return Object.prototype.hasOwnProperty.call(depo, k) ? depo[k] : null; }, setItem: function (k, v) { depo[k] = String(v); } };
  var dinleyici = { ctx: null, tab: {} };
  var win = { SufloSpeedRamp: SR, localStorage: ls, KBeat: { vuruslar: function () { return (o.vuruslar || []).slice(); }, analiz: function () { return o.analiz || null; } } };
  var ctx = {
    window: win,
    document: { getElementById: function (id) { return dom[id] || null; }, createElement: function (t) { return eleman(t); }, createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; } },
    K: {
      call: function (fn, arg, sure) { cagri.push({ fn: fn, arg: JSON.parse(JSON.stringify(arg === undefined ? null : arg)), sure: sure }); return Promise.resolve(o.cevap(fn, arg, cagri.length)); },
      findFfmpeg: function () { return Promise.resolve(o.ffmpeg === false ? null : "ffmpeg"); },
      run: function (ff, args) { cagri.push({ fn: "ffmpeg", arg: args }); return Promise.resolve({ code: 1, stdout: "", stderr: o.ffCikti || "" }); }
    },
    KApp: {
      toast: function (m, t, s, e) { toastlar.push({ m: m, t: t, e: e }); },
      ctx: function () { return o.ctx || null; },
      onContext: function (fn) { dinleyici.ctx = fn; }, onTab: function (ad, fn) { dinleyici.tab[ad] = fn; },
      onPoll: function (fn) { dinleyici.poll = fn; }
    },
    Pro: {
      isPro: function () { return !!o.pro; }, on: function () {}, denemeAcik: function () { return !!o.kurulu || !!o.acik; },
      gate: function (f, op) { kapi.push([f, op]); return !!o.kurulu || !!o.pro; },
      denemeHarca: function (f, bildir) { harcanan.push(f); bildir("1 deneme hakkı kullanıldı · 2 kaldı", "good"); return 2; }
    },
    console: console, Date: Date
  };
  ctx.window.KApp = ctx.KApp;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "hiz-rampasi.js"), "utf8"), ctx);
  var H = ctx.window.KHizRampasi;
  H.init();
  return { H: H, dom: dom, cagri: cagri, kapi: kapi, harcanan: harcanan, toastlar: toastlar, depo: depo, dinleyici: dinleyici,
    uygulamalar: function () { return cagri.filter(function (c) { return c.fn === "KS_applySpeedRamp"; }); } };
}

function hedef(ad, bas, son, ek) {
  var t = { track: 0, start: bas, end: son, inPoint: 10, outPoint: 10 + (son - bas), mediaPath: "C:\\cekim\\" + ad, name: ad, rangeStart: bas, rangeEnd: son,
    partial: false, srcIn: 10, audio: [], hasLinked: false };
  for (var k in ek || {}) t[k] = ek[k];
  return t;
}
function hedefler(liste, atlanan) { return { ok: true, seqId: "s1", frame: 0.04, fps: 25, playhead: 0, appVersion: "26.0.0", targets: liste, skipped: atlanan || [], caps: { setSpeed: true } }; }
// Gerçek host gibi: cloneFirst ile kopya oluşturulduysa newSeq + kopyanın seqId'si döner
function basari(arg, seqId) {
  if (arg.cloneFirst && !seqId) seqId = arg.expectSeqId + "-kopya";
  return { ok: true, pieces: arg.plan.segments.length, track: arg.target.track, seqId: seqId || arg.expectSeqId || "s1", newSeq: arg.cloneFirst ? arg.cloneName : "", srcErr: 0, undoSteps: 9, warnings: [], speeds: [],
    cal: { units: "ratio", sig: "5" },
    record: { v: 1, seqId: seqId || arg.expectSeqId || "s1", track: arg.target.track, t0: arg.range.start, t1: arg.range.end, srcIn: 10, mediaPath: arg.target.mediaPath, name: "x", audio: [], unlinked: false, mode: arg.plan.mode } };
}

var UYGULA = fs.readFileSync(path.join(KOK, "js", "hiz-rampasi.js"), "utf8");
// Bildirim / durum metni: dize ya da DOM düğümü (adlar data-i18n-skip içinde)
function metin(m) { return typeof m === "string" ? m : (m && m.textContent) || ""; }
// İngilizce arayüz: gözlemcinin yaptığı gibi metin düğümlerini tek tek çevir, data-i18n-skip'e girme
var I18N = require(path.join(KOK, "js", "i18n.js"));
I18N.setDictionary(require(path.join(KOK, "i18n", "en.js")));
function cevir(n) {
  if (!n) return "";
  if (typeof n === "string") return I18N.translate(n);
  if (n.nodeType === 3) return I18N.translate(n.textContent);
  if (n.getAttribute && n.getAttribute("data-i18n-skip") !== null) return n.textContent;
  return n.children && n.children.length ? n.children.map(cevir).join("") : I18N.translate(n.textContent);
}

(async function () {
  /* ---------- 1) kapı ---------- */
  var a = kur({ kurulu: false, cevap: function () { throw new Error("çağrılmamalı"); } });
  await a.H.uygula();
  ok("kurulmamışken Premiere'e gidilmez; kapı 'speedramp' + deneme:true + yeniden", a.cagri.length === 0 && a.kapi.length === 1 && a.kapi[0][0] === "speedramp" &&
    a.kapi[0][1].deneme === true && typeof a.kapi[0][1].yeniden === "function" && a.harcanan.length === 0, js(a.kapi));
  ok("ilk satır kapı (kaynakta)", /async function uygula\(ek\) \{\n    if \(typeof Pro !== "undefined" && !Pro\.gate\("speedramp", \{ deneme: true, yeniden: function \(\) \{ uygula\(\); \} \}\)\) return;/.test(UYGULA.replace(/\r\n/g, "\n")));

  /* ---------- 2) iki hedef: biri başarılı biri başarısız → tek hak; kayıt + kalibrasyon ---------- */
  var b = kur({ kurulu: true, cevap: function (fn, arg, n) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6), hedef("B.mp4", 8, 12)]);
    if (fn === "KS_applySpeedRamp") return arg.target.start === 2 ? basari(arg) : { ok: false, kod: "hizYazilamadi", restored: true };
    if (fn === "KS_removeSpeedRamp") return { ok: true, track: 0 };
    return { ok: false };
  } });
  await b.H.uygula();
  var u = b.uygulamalar();
  ok("hedefler sırayla, klip başına bir çağrı, 120 sn zaman aşımı", u.length === 2 && u[0].arg.target.start === 2 && u[1].arg.target.start === 8 && u.every(function (c) { return c.sure === 120000; }), js(u.map(function (c) { return c.arg.target; })));
  ok("kopya bir kez (ilk çağrı kopyaladı); sonrakiler kopya sekansı ister", u[0].arg.cloneFirst === true && u[1].arg.cloneFirst === false && u[1].arg.expectSeqId === "s1-kopya", js(u.map(function (c) { return [c.arg.cloneFirst, c.arg.expectSeqId]; })));
  ok("en az bir başarıda hak bir kez düşer", b.harcanan.join(",") === "speedramp" && b.toastlar.some(function (t) { return t.m === "1 deneme hakkı kullanıldı · 2 kaldı"; }), js(b.harcanan));
  var kayit = JSON.parse(b.depo["suflo.hizRampa.kayitlar"] || "[]"), kal = JSON.parse(b.depo["suflo.hizRampa.kalibrasyon"] || "{}");
  ok("kayıt ve kalibrasyon yerel depoda", kayit.length === 1 && kayit[0].t0 === 2 && kayit[0].preset === "dalis" && kal["26.0.0"] && kal["26.0.0"].units === "ratio" && kal["26.0.0"].sig === "5", js([kayit, kal]));
  ok("başarısız klip atlama özetinde", b.toastlar.some(function (t) { return metin(t.m) === "1 klip atlandı: B.mp4 (hız yazılamadı)"; }), js(b.toastlar.map(function (t) { return metin(t.m); })));
  var geriAl = b.toastlar.filter(function (t) { return t.e && t.e.metin === "Geri al"; })[0];
  ok("Ctrl+Z uyarısı 'Geri al' eylemiyle", !!geriAl && geriAl.m === "Ctrl+Z bunu tek adımda geri almaz; Rampayı kaldır'ı kullan.", js(b.toastlar));
  ok("başarı bildirimi '⏩ ad · n parça · V1'", b.toastlar.some(function (t) { return /^⏩ A\.mp4 · \d+ parça · V1$/.test(metin(t.m)); }), js(b.toastlar.map(function (t) { return metin(t.m); })));
  var onceKapi = b.kapi.length;
  geriAl.e.fn();
  await bekle(10);
  var kal2 = b.cagri.filter(function (c) { return c.fn === "KS_removeSpeedRamp"; });
  ok("'Geri al' kaydı KS_removeSpeedRamp'e verir, kapı çağrılmaz", kal2.length === 1 && kal2[0].arg.record && kal2[0].arg.record.t0 === 2 && b.kapi.length === onceKapi, js(kal2));
  ok("kaldırılan kayıt depodan silinir", JSON.parse(b.depo["suflo.hizRampa.kayitlar"]).length === 0);

  /* ---------- 3) hepsi başarısız → hak düşmez ---------- */
  var c = kur({ kurulu: true, cevap: function (fn) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6)]);
    return { ok: false, kod: "linkedConflict", restored: true };
  } });
  await c.H.uygula();
  ok("hiçbir klip rampalanmazsa hak düşmez, kod metni durumda", c.harcanan.length === 0 && /Ctrl\+L/.test(c.dom["hiz-status"].textContent) && /bad/.test(c.dom["hiz-status"].className), c.dom["hiz-status"].textContent);
  var c2 = kur({ kurulu: true, cevap: function (fn) { return fn === "KS_speedRampTargets" ? hedefler([], [{ name: "logo.png", track: 1, start: 0, kod: "grafik", pct: null }]) : { ok: false }; } });
  await c2.H.uygula();
  ok("hedef yok, hepsi atlandı: özet durumda, uygulama çağrılmaz, hak düşmez", c2.uygulamalar().length === 0 && c2.harcanan.length === 0 &&
    c2.dom["hiz-status"].textContent === "✕ 1 klip atlandı: logo.png (grafik)", c2.dom["hiz-status"].textContent);

  /* ---------- 4) tutamak → bir kez Dengeli ile yeniden ---------- */
  var ff = "  Duration: 00:01:40.00, start: 0.000000, bitrate: 9000 kb/s\n    Stream #0:0(und): Video: h264, yuv420p, 1920x1080, 25 fps, 25 tbr, 12800 tbn\n";
  var d = kur({ kurulu: true, ffCikti: ff, cevap: function (fn, arg, n) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("C.mp4", 2, 6)]);
    // tutamak adım 6'da çıkar: kopya o sırada çoktan oluşmuştur (host newSeq döner)
    if (fn === "KS_applySpeedRamp") return arg.plan.mode === "exact" ? { ok: false, kod: "tutamak", restored: true, seqId: "s1-kopya", newSeq: arg.cloneName } : basari(arg, "s1-kopya");
    return { ok: false };
  } });
  d.H._sec("cikis");
  await d.H.uygula();
  var du = d.uygulamalar();
  ok("tutamak (auto + exact): Dengeli ile bir kez yeniden denenir ve başarılır", du.length === 2 && du[0].arg.plan.mode === "exact" && du[1].arg.plan.mode === "balanced" &&
    du[1].arg.cloneFirst === false && d.harcanan.length === 1, js(du.map(function (x) { return x.arg.plan.mode; })));
  ok("ffmpeg -i medya süresi bir kez okunur (tutamak = süre − Out)", d.cagri.filter(function (x) { return x.fn === "ffmpeg"; }).length === 1);
  var d2 = kur({ kurulu: true, kaynak: "balanced", cevap: function (fn) { return fn === "KS_speedRampTargets" ? hedefler([hedef("C.mp4", 2, 6)]) : { ok: false, kod: "tutamak", restored: true }; } });
  await d2.H.uygula();
  ok("Dengeli seçiliyken tutamak hatası yeniden denenmez", d2.uygulamalar().length === 1 && d2.harcanan.length === 0);

  /* ---------- 5) depo atıyor ---------- */
  var e = kur({ kurulu: true, lsAtar: true, cevap: function (fn, arg) { return fn === "KS_speedRampTargets" ? hedefler([hedef("A.mp4", 2, 6)]) : basari(arg); } });
  var hata = null;
  try { await e.H.uygula(); } catch (x) { hata = x; }
  ok("yerel depo atsa da iş biter (hak düşer, bildirim gelir)", !hata && e.harcanan.length === 1 && e.toastlar.some(function (t) { return /^⏩ /.test(metin(t.m)); }), String(hata));

  /* ---------- 6) eski rampanın parçası seçiliyse yeniden rampalanmaz ---------- */
  var depo6 = { "suflo.hizRampa.kayitlar": JSON.stringify([{ v: 1, seqId: "s1", track: 0, t0: 2, t1: 6, srcIn: 10, mediaPath: "C:\\cekim\\A.mp4", name: "A", audio: [], unlinked: true, mode: "balanced" }]) };
  var f = kur({ kurulu: true, depo: depo6, cevap: function (fn) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 3.2, 4)], [{ name: "A.mp4", track: 0, start: 2, kod: "hizli", pct: 40 }]);
    if (fn === "KS_removeSpeedRamp") return { ok: true };
    return { ok: false };
  } });
  await f.H.uygula();
  var teklif = f.toastlar.filter(function (t) { return t.e && t.e.metin === "Eski rampayı kaldırıp yeniden uygula"; })[0];
  ok("eski rampa parçaları: uygulanmaz, 'Eski rampayı kaldırıp yeniden uygula' önerilir", f.uygulamalar().length === 0 && !!teklif && f.harcanan.length === 0, js(f.toastlar));

  /* ---------- 7) atlama özeti ve hata metinleri ---------- */
  ok("atlama özeti", f.H._atlamaOzeti([{ name: "logo.png", kod: "grafik" }, { name: "Röportaj", kod: "hizli", pct: 50 }]) === "2 klip atlandı: logo.png (grafik), Röportaj (hızı %50)");
  ok("hata metni: hizli yüzdeyle, kilitli katmanla, geri yüklenemediyse geriAlinamadi", f.H._hataMetni({ kod: "hizli", pct: 50 }) === "Bu klibin hızı zaten %50. Önce Hız/Süre'den %100'e al ya da Rampayı kaldır'ı kullan." &&
    f.H._hataMetni({ kod: "kilitli", track: 1 }) === "Katman kilitli: V2. Kilidi açıp yeniden dene." &&
    f.H._hataMetni({ kod: "tutamak", restored: false }) === "Klip eski haline getirilemedi. Ctrl+Z ile geri al ya da kopya sekansı kullan.");

  /* ---------- 8) kartlar: Ritme Rampa vuruş yokken kapalı ---------- */
  var g = kur({ cevap: function () { return { ok: false }; } });
  var kartlar = g.dom["hiz-grid"].children;
  var ritim = kartlar.filter(function (k) { return k.getAttribute("data-id") === "ritim"; })[0];
  ok("11 kart, seçili olan aria-pressed", kartlar.length === 11 && kartlar.filter(function (k) { return k.getAttribute("aria-pressed") === "true"; }).length === 1);
  ok("vuruş yokken Ritme Rampa kapalı ve neden yazar", ritim.disabled === true && ritim.children[1].children[1].textContent === "Önce Ritim sekmesinde müziği analiz et", ritim.children[1].children[1].textContent);
  ok("kartlarda küçük resim SVG'si (eğri + %100 çizgisi)", /<path class="hiz-egri" d="M/.test(kartlar[0].children[0].innerHTML) && /hiz-taban/.test(kartlar[0].children[0].innerHTML));
  var g2 = kur({ vuruslar: [{ t: 2.5, guc: 1 }, { t: 3.5, guc: 0.8 }], cevap: function () { return { ok: false }; } });
  var ritim2 = g2.dom["hiz-grid"].children.filter(function (k) { return k.getAttribute("data-id") === "ritim"; })[0];
  ok("vuruş varken Ritme Rampa seçilebilir; yön seçicisi görünür", ritim2.disabled === false && (g2.H._sec("ritim"), g2.H._secili() === "ritim") && g2.dom["hiz-ritim-yon-kutu"].hidden === false);
  ok("önizleme: basamak çubukları, eğri ve özet satırları (Premiere'e gitmeden)", /<rect class="hiz-basamak"/.test(g.dom["hiz-onizleme"].innerHTML) && /hiz-egri/.test(g.dom["hiz-onizleme"].innerHTML) &&
    /^\d+ parça · en yavaş %\d+ · en hızlı %\d+$/.test(g.dom["hiz-ozet"].children[0].textContent) && g.cagri.length === 0, g.dom["hiz-ozet"].children.map(function (x) { return x.textContent; }).join(" | "));

  /* ---------- 9) hedef satırı: klip adı çeviriden muaf ---------- */
  g.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 3, selCount: 1, sel: { name: "Giriş.mp4", mediaPath: "C:\\cekim\\Giriş.mp4", clipStart: 2, clipEnd: 6, inPoint: 10, outPoint: 14 } });
  var hc = g.dom["hiz-hedef"].children;
  var adEl = hc.filter(function (x) { return x.getAttribute && x.getAttribute("data-i18n-skip") !== null; })[0];
  ok("klip adı data-i18n-skip içinde, süre ayrı", !!adEl && adEl.textContent === "Giriş.mp4" && hc[0].textContent === "Hedef:" && hc[hc.length - 1].textContent === "4 sn", js(hc.map(function (x) { return x.textContent; })));
  ok("kalibrasyon yokken 'Önce sekansı kopyala' işaretli", g.dom["hiz-kopya"].checked === true);
  var h = kur({ depo: { "suflo.hizRampa.kalibrasyon": JSON.stringify({ "26.0.0": { units: "ratio", sig: "5" } }) }, cevap: function () { return { ok: false }; } });
  h.dinleyici.ctx({ hasSeq: true, app: "26.0.0", frame: 0.04, sel: null, seqIn: 0, seqOut: 0 });
  ok("bu sürümün kalibrasyonu varsa kutu kendiliğinden kalkar", h.dom["hiz-kopya"].checked === false);

  /* ---------- 10) kaldır kapısız ---------- */
  var k = kur({ kurulu: false, ctx: null, cevap: function (fn) { return fn === "KS_removeSpeedRamp" ? { ok: true, track: 0 } : { ok: false }; } });
  await k.H.kaldir();
  var kc = k.cagri.filter(function (x) { return x.fn === "KS_removeSpeedRamp"; });
  ok("kaldir() kapısız: kayıt yoksa seçimden kaldırır", k.kapi.length === 0 && kc.length === 1 && kc[0].arg.fromSelection === true &&
    k.toastlar.some(function (t) { return t.m === "Rampa kaldırıldı, klip %100'e döndü"; }), js(kc));
  var kaldirGovde = UYGULA.slice(UYGULA.indexOf("async function kaldirIc("), UYGULA.indexOf("function init()"));
  ok("kaldir() gövdesinde Pro yok", kaldirGovde.length > 100 && !/Pro\./.test(kaldirGovde));

  /* ---------- 11) kopya, gerçekten oluşana dek her çağrıda istenir ---------- */
  var v11 = [{ t: 9, guc: 1 }, { t: 10.5, guc: 1 }];
  var m = kur({ kurulu: true, vuruslar: v11, analiz: { seqId: "s1", start: 0, end: 30 }, cevap: function (fn, arg) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6), hedef("B.mp4", 8, 12)]);
    if (fn === "KS_applySpeedRamp") return basari(arg);
    return { ok: false };
  } });
  m.H._sec("ritim");
  await m.H.uygula();
  var mu = m.uygulamalar();
  ok("ilk hedef panelde atlanırsa (Ritme Rampa, vuruş yok) kopyayı sonraki hedef ister", m.H._secili() === "ritim" && mu.length === 1 && mu[0].arg.target.mediaPath === "C:\\cekim\\B.mp4" &&
    mu[0].arg.cloneFirst === true && mu[0].arg.cloneName === "Suflo Rampa · B.mp4", js(mu.map(function (c) { return [c.arg.target.mediaPath, c.arg.cloneFirst]; })));
  var n11 = kur({ kurulu: true, cevap: function (fn, arg, n) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6), hedef("B.mp4", 8, 12)]);
    if (fn === "KS_applySpeedRamp") return arg.target.start === 2 ? { ok: false, kod: "degisti" } : basari(arg);
    return { ok: false };
  } });
  await n11.H.uygula();
  var nu = n11.uygulamalar();
  ok("host kopyadan önce reddederse (degisti) sonraki hedef yine kopya ister; özgün sekansa yazılmaz", nu.length === 2 && nu[0].arg.cloneFirst === true &&
    nu[1].arg.cloneFirst === true && nu[1].arg.expectSeqId === "s1" && n11.toastlar.some(function (t) { return metin(t.m) === "Kopya sekansta uygulandı: Suflo Rampa · B.mp4"; }),
    js(nu.map(function (c) { return [c.arg.cloneFirst, c.arg.expectSeqId]; })));

  /* ---------- 12) kopya oluşturulup iş başarısızsa: söylenir, kutu kalkar, kopyada kalınır ---------- */
  var q12 = kur({ kurulu: true, cevap: function (fn, arg) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6)]);
    return { ok: false, kod: "hizYazilamadi", restored: true, newSeq: "Suflo Rampa · A.mp4", seqId: "s1-kopya" };
  } });
  await q12.H.uygula();
  var st12 = q12.dom["hiz-status"];
  var ad12 = st12.children[0].children.filter(function (x) { return x.getAttribute && x.getAttribute("data-i18n-skip") !== null; });
  ok("başarısız + kopya: durum kopya sekansın adını söyler (ad çeviriden muaf), kutu kalkar, hak düşmez",
    st12.textContent === "✕ Premiere hızı kabul etmedi; klip eski haline getirildi. Kopya sekans açık: Suflo Rampa · A.mp4. Özgün sekansına dokunulmadı." &&
    ad12.length === 1 && ad12[0].textContent === "Suflo Rampa · A.mp4" && q12.dom["hiz-kopya"].checked === false && q12.harcanan.length === 0, st12.textContent);
  q12.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1-kopya", frame: 0.04, sel: null, seqIn: 0, seqOut: 0 });
  ok("kalibrasyon yokken de Suflo'nun açtığı kopya sekansta kutu yeniden işaretlenmez", q12.dom["hiz-kopya"].checked === false);
  q12.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s9", frame: 0.04, sel: null, seqIn: 0, seqOut: 0 });
  ok("başka (özgün) sekansta kutu yine işaretli", q12.dom["hiz-kopya"].checked === true);

  /* ---------- 13) In/Out her zaman Dengeli (host kenara yapıştırıp partial:false dese de) ---------- */
  var ffUzun = "  Duration: 00:10:00.00, start: 0.000000\n    Stream #0:0: Video: h264, 25 fps, 25 tbr\n";
  var r13 = kur({ kurulu: true, ffCikti: ffUzun, cevap: function (fn, arg) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6)]);
    return basari(arg);
  } });
  r13.dom["hiz-aralik"].value = "inout";
  r13.H._sec("cikis");
  await r13.H.uygula();
  var u13 = r13.uygulamalar();
  ok("In/Out: hedef kenara yapışıp partial:false olsa da plan Dengeli (önizlemenin gösterdiği)", u13.length === 1 && u13[0].arg.plan.mode === "balanced" &&
    r13.cagri[0].arg.range === "inout", js(u13.map(function (c) { return c.arg.plan.mode; })));
  var r13b = kur({ kurulu: true, ffCikti: ffUzun, cevap: function (fn, arg) { return fn === "KS_speedRampTargets" ? hedefler([hedef("A.mp4", 2, 6)]) : basari(arg); } });
  r13b.H._sec("cikis");
  await r13b.H.uygula();
  ok("seçili klip (tamamı) ve yeterli medya: tam hız (exact) korunur", r13b.uygulamalar()[0].arg.plan.mode === "exact");

  /* ---------- 14) İngilizce arayüz: adlar çevrilmez, her neden çevrilir, tekil "clip" ---------- */
  var s14 = f.H._atlamaParcalari([{ name: "logo.png", kod: "grafik" }, { name: "Röportaj", kod: "hizli", pct: 50 }, { name: "Giriş", kod: "fazla" }]);
  var en14 = cevir({ children: s14.map(function (p) { return typeof p === "object" ? { textContent: p.ad, getAttribute: function (k) { return k === "data-i18n-skip" ? "" : null; } } : { nodeType: 3, textContent: p }; }) });
  ok("atlama özeti EN: 'Röportaj' ve 'Giriş' adları aynen, nedenlerin hepsi çevrilir", en14 === "3 clips skipped: logo.png (graphic), Röportaj (speed 50%), Giriş (12-clip limit)", en14);
  var tek14 = cevir({ children: f.H._atlamaParcalari([{ name: "Röportaj", kod: "kisa" }]).map(function (p) { return typeof p === "object" ? { textContent: p.ad, getAttribute: function (k) { return k === "data-i18n-skip" ? "" : null; } } : { nodeType: 3, textContent: p }; }) });
  ok("tek klip: '1 clip skipped' (1 clips değil)", tek14 === "1 clip skipped: Röportaj (too short)", tek14);
  ok("TR atlama özeti: fazla → 12 klip sınırı (ham kod değil)", f.H._atlamaOzeti([{ name: "A", kod: "fazla" }]) === "1 klip atlandı: A (12 klip sınırı)");
  var bb = b.toastlar.filter(function (t) { return /^⏩ /.test(metin(t.m)); })[0];
  ok("başarı bildirimi EN: klip adı çevrilmez", !!bb && cevir(bb.m) === "⏩ A.mp4 · " + /(\d+) parça/.exec(metin(bb.m))[1] + " segments · V1", bb && cevir(bb.m));
  ok("durum satırı EN: '✕ ' önekli noktalı kalıplar çevrilir", I18N.translate("✕ " + f.H._hataMetni({ kod: "hizli", pct: 50 })) === "✕ This clip is already at 50%. Set it back to 100% in Speed/Duration or use Remove ramp." &&
    I18N.translate("✕ " + f.H._hataMetni({ kod: "kilitli", track: 1 })) === "✕ Track V2 is locked. Unlock it and try again.");
  var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
  ok("önizleme aria-label'ı SVG'nin dışında (çeviri SVG'ye girmez)", /role="img" aria-label="Hız eğrisi önizlemesi">\s*<svg id="hiz-onizleme"[^>]*aria-hidden="true"/.test(html) &&
    !/<svg id="hiz-onizleme"[^>]*aria-label/.test(html));

  /* ---------- 15) okuma satırı doğru söyler ---------- */
  var ozet = function (x) { return x.dom["hiz-ozet"].children.map(function (c) { return c.textContent; }); };
  var o15 = kur({ cevap: function () { return { ok: false }; } });
  o15.H._medya["c:\\cekim\\d.mp4"] = { duration: 600, fps: 25 };
  o15.H._sec("doruk");
  o15.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 1, sel: { name: "D.mp4", mediaPath: "C:\\cekim\\D.mp4", clipStart: 2, clipEnd: 6, inPoint: 10, outPoint: 14 } });
  var oz15 = ozet(o15);
  ok("tam hız, B < 1: 'klibin son X sn'si kullanılmaz' (sonrası kullanılır denmez)", oz15.some(function (x) { return /^Tam hız: klibin son 0\.\d+ sn'si kullanılmaz$/.test(x); }) &&
    !oz15.some(function (x) { return /sonrasındaki görüntü kullanılır/.test(x); }), oz15.join(" | "));
  var o15b = kur({ ffmpeg: false, cevap: function () { return { ok: false }; } });
  o15b.H._medya["c:\\cekim\\e.mp4"] = null;
  o15b.H._sec("cikis");
  o15b.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 1, sel: { name: "E.mp4", mediaPath: "C:\\cekim\\E.mp4", clipStart: 2, clipEnd: 6, inPoint: 10, outPoint: 14 } });
  var oz15b = ozet(o15b);
  ok("medya süresi bilinmiyor: 'görüntü yok' değil 'Medya süresi okunamadı'", oz15b.indexOf("Medya süresi okunamadı: Dengeli kullanılıyor") !== -1 &&
    !oz15b.some(function (x) { return /yeterli görüntü yok/.test(x); }), oz15b.join(" | "));

  /* ---------- 16) Ritme Rampa sekansa ve aralığa bağlı ---------- */
  var r16 = kur({ vuruslar: [{ t: 2.5, guc: 1 }], analiz: { seqId: "baska", start: 0, end: 30 }, cevap: function () { return { ok: false }; } });
  r16.H._sec("ritim");
  var once16 = r16.H._secili();
  // sekme açıkken sekans değişir (bağlam yoklaması): kart sekme değiştirmeden tazelenir
  r16.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, sel: null, seqIn: 0, seqOut: 0 });
  var g16 = r16.dom["hiz-grid"].children.filter(function (k) { return k.getAttribute("data-id") === "ritim"; })[0];
  ok("başka sekansın vuruşları: Ritme Rampa kapalı, nedenini söyler, seçim başka eğriye geçer", once16 === "ritim" && r16.H._secili() === "dalis" && g16.disabled === true &&
    g16.children[1].children[1].textContent === "Ritim analizi başka bir sekansta yapıldı; bu sekansta müziği analiz et", g16.children[1].children[1].textContent);
  var a16 = kur({ kurulu: true, vuruslar: [{ t: 1, guc: 1 }, { t: 20, guc: 1 }], analiz: { seqId: "s1", start: 0, end: 30 }, cevap: function (fn, arg) {
    return fn === "KS_speedRampTargets" ? hedefler([hedef("A.mp4", 40, 45)]) : basari(arg);
  } });
  a16.H._sec("ritim");
  await a16.H.uygula();
  ok("vuruş var ama aralıkta yok: 'analiz et' değil, aralığı söyler", a16.dom["hiz-status"].textContent === "✕ Bu aralıkta vuruş yok (analiz edilen müzik 0–30 sn)" && a16.uygulamalar().length === 0,
    a16.dom["hiz-status"].textContent);

  /* ---------- 17) tanıtım kartından deneme: düğme adı bildirimdeki adla aynı, odakta kilit kalkar ---------- */
  var d17o = { cevap: function () { return { ok: false }; } };
  var d17 = kur(d17o);
  ok("kilitliyken de düğme 'Rampayı uygula' der (kilit simge ve sınıfla)", d17.dom["hiz-uygula"].textContent === "🔒 Rampayı uygula" && d17.dom["hiz-uygula"].classList.contains("is-locked"));
  d17o.acik = true;
  d17.dom["hiz-uygula"]._o.focus();
  ok("deneme kurulup düğmeye odaklanınca kilit hemen kalkar", d17.dom["hiz-uygula"].textContent === "Rampayı uygula" && !d17.dom["hiz-uygula"].classList.contains("is-locked"));

  /* ---------- 18) kart seçimi ızgarayı yeniden kurmaz (klavye odağı kalır) ---------- */
  var k18 = kur({ cevap: function () { return { ok: false }; } });
  var once18 = k18.dom["hiz-grid"].children.slice();
  var darbe = once18.filter(function (x) { return x.getAttribute("data-id") === "darbe"; })[0];
  darbe._o.click();
  var sonra18 = k18.dom["hiz-grid"].children;
  ok("kart seçimi yerinde: aynı düğmeler, aria-pressed ve 'on' güncel", sonra18.length === once18.length && sonra18.every(function (x, i) { return x === once18[i]; }) &&
    darbe.getAttribute("aria-pressed") === "true" && /(^|\s)on(\s|$)/.test(darbe.className) &&
    sonra18.filter(function (x) { return x.getAttribute("aria-pressed") === "true"; }).length === 1 && !/(^|\s)on(\s|$)/.test(once18[0].className), darbe.className);

  /* ---------- 19) rampanın parçası seçiliyken yeni hedef gibi planlanmaz; kaldırırken net metin ---------- */
  var depo19 = { "suflo.hizRampa.kayitlar": JSON.stringify([{ v: 1, seqId: "s1", track: 0, t0: 2, t1: 6, srcIn: 10, mediaPath: "C:\\cekim\\A.mp4", name: "A", audio: [], unlinked: true, mode: "balanced", preset: "dalis" }]) };
  var p19 = kur({ depo: depo19, cevap: function () { return { ok: false }; } });
  p19.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 15, sel: { name: "A.mp4", mediaPath: "C:\\cekim\\A.mp4", clipStart: 2, clipEnd: 2.36, inPoint: 10, outPoint: 10.4 } });
  ok("rampanın parçaları seçili: 'rampanın parçası' der, 12 kare uyarısı yok", p19.dom["hiz-hedef"].textContent === "Bu klip bir hız rampasının parçası · değiştirmek için önce Rampayı kaldır" &&
    js(ozet(p19)) === js(["Uygulanan eğri: Ağır Çekim Dalışı"]), p19.dom["hiz-hedef"].textContent + " | " + ozet(p19).join(" | "));
  p19.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 1, sel: { name: "A.mp4", mediaPath: "C:\\cekim\\A.mp4", clipStart: 2, clipEnd: 6, inPoint: 10, outPoint: 14 } });
  ok("Ctrl+Z ile tek %100 klibe dönmüş aralık rampa sayılmaz: normal önizleme", /^Hedef:/.test(p19.dom["hiz-hedef"].textContent), p19.dom["hiz-hedef"].textContent);
  var depoKal = { "suflo.hizRampa.kalibrasyon": JSON.stringify({ "26.0.0": { units: "percent", sig: "1" } }) };
  var x19 = kur({ depo: depoKal, ctx: { hasSeq: true, app: "26.0.0", sequenceId: "s1", sel: { clipStart: 0, clipEnd: 4, mediaPath: "C:\\cekim\\Z.mp4" } }, cevap: function (fn) { return fn === "KS_removeSpeedRamp" ? { ok: false, kod: "secimYok" } : { ok: false }; } });
  await x19.H.kaldir();
  var xk = x19.cagri.filter(function (c) { return c.fn === "KS_removeSpeedRamp"; })[0];
  ok("kaldır: secimYok → 'Seçili klipte Suflo rampası bulunamadı' (In/Out'tan söz etmez)", x19.dom["hiz-status"].textContent === "✕ Seçili klipte Suflo rampası bulunamadı. Rampanın parçalarından birini seç.", x19.dom["hiz-status"].textContent);
  ok("kaldır: seçimden kaldırmada bu sürümün kalibrasyonu host'a gider", xk && xk.arg.fromSelection === true && xk.arg.cal && xk.arg.cal.units === "percent" && xk.arg.cal.sig === "1", js(xk && xk.arg));

  /* ---------- 20) Dengeli zaten seçiliyken tutamak metni Dengeli önermez ---------- */
  var t20 = kur({ kurulu: true, kaynak: "balanced", cevap: function (fn) { return fn === "KS_speedRampTargets" ? hedefler([hedef("C.mp4", 2, 6)]) : { ok: false, kod: "tutamak", restored: true }; } });
  await t20.H.uygula();
  ok("Dengeli + tutamak: 'Dengeli'yi seç' denmez", !/Dengeli'yi seç/.test(t20.dom["hiz-status"].textContent) && /sığmadı/.test(t20.dom["hiz-status"].textContent), t20.dom["hiz-status"].textContent);

  /* ---------- 21) 'Eski rampayı kaldırıp yeniden uygula': kaldırma seçimi boşaltır, hedefler açıkça istenir ---------- */
  var depo21 = { "suflo.hizRampa.kayitlar": JSON.stringify([{ v: 1, seqId: "s1", track: 0, t0: 2, t1: 6, srcIn: 10, mediaPath: "C:\\cekim\\A.mp4", name: "A", audio: [], unlinked: true, mode: "balanced", preset: "dalis" }]) };
  var y21 = kur({ kurulu: true, depo: depo21, cevap: function (fn, arg, n) {
    if (fn === "KS_speedRampTargets") {
      // gerçek host gibi: kaldırmadan sonra seçim yoksa secimYok; açık hedeflerle (items) geri gelen klip
      if (arg.items) return hedefler([hedef("A.mp4", 2, 6)]);
      return y21.cagri.some(function (c) { return c.fn === "KS_removeSpeedRamp"; }) ? { ok: false, kod: "secimYok" }
        : hedefler([hedef("A.mp4", 3.2, 4)], [{ name: "A.mp4", track: 0, start: 2, kod: "hizli", pct: 40 }]);
    }
    if (fn === "KS_removeSpeedRamp") return { ok: true, track: 0, t0: 2, t1: 6, removed: 14, audio: 1, seqId: "s1", kayit: null, warnings: [] };
    if (fn === "KS_applySpeedRamp") return basari(arg);
    return { ok: false };
  } });
  await y21.H.uygula();
  var teklif21 = y21.toastlar.filter(function (t) { return t.e && t.e.metin === "Eski rampayı kaldırıp yeniden uygula"; })[0];
  teklif21.e.fn();
  await bekle(30);
  var hd21 = y21.cagri.filter(function (c) { return c.fn === "KS_speedRampTargets"; });
  ok("kaldırıp yeniden uygula: kayıt kaldırılır, yeniden uygulama geri gelen klibi açıkça ister (items), rampa uygulanır",
    y21.cagri.filter(function (c) { return c.fn === "KS_removeSpeedRamp"; })[0].arg.record.t0 === 2 && hd21.length === 2 &&
    js(hd21[1].arg.items) === js([{ track: 0, start: 2 }]) && y21.uygulamalar().length === 1 && y21.uygulamalar()[0].arg.target.start === 2 &&
    !/✕/.test(y21.dom["hiz-status"].textContent), js(hd21.map(function (c) { return c.arg; })) + " | " + y21.dom["hiz-status"].textContent);

  /* ---------- 22) eğri ve seçenekler iş başında sabit; iş sürerken kart seçimi yok sayılır ---------- */
  var s22 = kur({ kurulu: true, cevap: function (fn, arg, n) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6), hedef("B.mp4", 8, 12), hedef("C.mp4", 14, 18)]);
    if (fn === "KS_applySpeedRamp") {
      if (arg.target.start === 2) {   // kullanıcı 1. klip uygulanırken 'Vites' kartına tıklar, hizala kutusunu açar
        var vites = s22.dom["hiz-grid"].children.filter(function (k) { return k.getAttribute("data-id") === "vites"; })[0];
        vites._o.click();
        s22.dom["hiz-vurus"].checked = true;
      }
      return basari(arg);
    }
    return { ok: false };
  } });
  await s22.H.uygula();
  var pr22 = JSON.parse(s22.depo["suflo.hizRampa.kayitlar"]).map(function (k) { return k.preset; });
  var dalisN = SR.plan("dalis", {}, SR.clipFor(hedef("B.mp4", 8, 12), 0.04, {})).segments.length;
  ok("iş sürerken kart tıklaması: üç klip de başta seçilen eğriyle (Dalış), seçim değişmedi", js(pr22) === js(["dalis", "dalis", "dalis"]) && s22.H._secili() === "dalis" &&
    s22.uygulamalar().every(function (c) { return c.arg.plan.segments.length === dalisN; }), js(pr22) + " " + s22.uygulamalar().map(function (c) { return c.arg.plan.segments.length; }));
  var r22 = kur({ kurulu: true, vuruslar: [{ t: 3, guc: 1 }, { t: 4.5, guc: 1 }, { t: 9, guc: 1 }, { t: 10.5, guc: 1 }], analiz: { seqId: "s1", start: 0, end: 30 }, cevap: function (fn, arg) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6), hedef("B.mp4", 8, 12)]);
    if (fn === "KS_applySpeedRamp") {
      // 1. klipten sonra bağlam yoklaması BAŞKA bir sekansı bildirir (Ritme Rampa 'baska' olur)
      if (arg.target.start === 2) r22.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s9", frame: 0.04, sel: null, seqIn: 0, seqOut: 0 });
      return basari(arg);
    }
    return { ok: false };
  } });
  r22.H._sec("ritim");
  await r22.H.uygula();
  var pr22b = JSON.parse(r22.depo["suflo.hizRampa.kayitlar"]).map(function (k) { return k.preset; });
  ok("iş sürerken bağlam değişse de kalan klip aynı eğri (Ritme Rampa); uzlaşma iş bitince", js(pr22b) === js(["ritim", "ritim"]) && r22.H._secili() === "dalis", js(pr22b) + " " + r22.H._secili());

  /* ---------- 23) Suflo'nun kopya sekansı analiz sekansıyla aynı timeline ---------- */
  var k23 = kur({ kurulu: true, vuruslar: [{ t: 3, guc: 1 }, { t: 4.5, guc: 1 }], analiz: { seqId: "s1", start: 0, end: 30 }, cevap: function (fn, arg) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6)]);
    return basari(arg);
  } });
  k23.H._sec("ritim");
  await k23.H.uygula();
  k23.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1-kopya", frame: 0.04, sel: null, seqIn: 0, seqOut: 0 });
  var g23 = k23.dom["hiz-grid"].children.filter(function (k) { return k.getAttribute("data-id") === "ritim"; })[0];
  ok("Suflo kopyasında (s1-kopya) Ritme Rampa açık kalır, seçim değişmez", k23.H._kopyaSekanslar["s1-kopya"] && k23.H._kopyaSekanslar["s1-kopya"].kaynak === "s1" &&
    g23.disabled === false && k23.H._secili() === "ritim", js(k23.H._kopyaSekanslar));

  /* ---------- 24) kaldır: seçim host'ta canlı okunur, kayıtlar host'a gider, dönen kayıt silinir ---------- */
  var depo24 = { "suflo.hizRampa.kayitlar": JSON.stringify([
    { v: 1, seqId: "s1", track: 0, t0: 2, t1: 6, srcIn: 10, mediaPath: "C:\\cekim\\L.mp4", name: "L", audio: [], unlinked: true, mode: "balanced", preset: "dalis" },
    { v: 1, seqId: "s1", track: 0, t0: 20, t1: 24, srcIn: 28, mediaPath: "C:\\cekim\\L.mp4", name: "L", audio: [], unlinked: true, mode: "balanced", preset: "darbe" }]) };
  // panelin önbellekteki bağlamı hâlâ A rampasında (aynı medya: seçim anahtarı değişmedi)
  var k24 = kur({ depo: depo24, ctx: { hasSeq: true, app: "26.0.0", sequenceId: "s1", sel: { clipStart: 2, clipEnd: 2.4, mediaPath: "C:\\cekim\\L.mp4" } }, cevap: function (fn, arg) {
    if (fn === "KS_removeSpeedRamp") return { ok: true, track: 0, t0: 20, t1: 24, removed: 9, audio: 1, seqId: "s1", kayit: { seqId: "s1", track: 0, t0: 20 }, warnings: ["sesKayitsiz"] };
    return { ok: false };
  } });
  await k24.H.kaldir();
  var a24 = k24.cagri.filter(function (c) { return c.fn === "KS_removeSpeedRamp"; })[0].arg;
  var kalan24 = JSON.parse(k24.depo["suflo.hizRampa.kayitlar"]);
  ok("kaldır: önbellekteki seçimin kaydı gönderilmez; fromSelection + tüm kayıtlar, host'un eşlediği (B) silinir, A kalır", a24.fromSelection === true && !a24.record &&
    a24.records.length === 2 && kalan24.length === 1 && kalan24[0].t0 === 2, js(a24) + " " + js(kalan24));
  ok("kayıtsız kaldırmada ses uyarısı", k24.toastlar.some(function (t) { return /kaydını bulamadı/.test(metin(t.m)) && t.t === "warn"; }), js(k24.toastlar.map(function (t) { return metin(t.m); })));

  /* ---------- 25) her yoklamada canlı bağlam: playhead ve In/Out önizlemeyi tazeler ---------- */
  var p25 = kur({ cevap: function () { return { ok: false }; } });
  p25.dom["tab-hiz"].classList.add("active");
  p25.dom["hiz-vurus"].checked = true;
  var sel25 = { name: "D.mp4", mediaPath: "C:\\cekim\\D.mp4", clipStart: 2, clipEnd: 6, inPoint: 10, outPoint: 14 };
  p25.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0.5, selCount: 1, sel: sel25 });
  var once25 = p25.dom["hiz-onizleme"].innerHTML;
  p25.dinleyici.poll({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 4.2, selCount: 1, sel: sel25 });
  ok("playhead klibe girince (seçim aynı) darbe anı önizlemede görünür", !/class="hiz-vurus"/.test(once25) && /class="hiz-vurus"/.test(p25.dom["hiz-onizleme"].innerHTML));
  var i25 = kur({ cevap: function () { return { ok: false }; } });
  i25.dom["tab-hiz"].classList.add("active");
  i25.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 0, sel: null, seqIn: 0, seqOut: 0, seqDur: 60 });
  i25.dinleyici.poll({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 0, sel: null, seqIn: 4, seqOut: 8, seqDur: 60 });
  ok("seçim yokken In/Out konunca aralık 'inout'a geçer, hedef 'Giriş–Çıkış arası'", i25.dom["hiz-aralik"].value === "inout" && /^Hedef: Giriş–Çıkış arası · 4 sn$/.test(i25.dom["hiz-hedef"].textContent), i25.dom["hiz-hedef"].textContent);
  var t25 = { hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 1, sel: { name: "Canlı.mp4", mediaPath: "C:\\cekim\\Canlı.mp4", clipStart: 30, clipEnd: 33, inPoint: 0, outPoint: 3 } };
  var o25 = { ctx: null, cevap: function () { return { ok: false }; } };
  var tt25 = kur(o25);
  o25.ctx = t25;
  tt25.dinleyici.tab.hiz();
  ok("sekmeye girince canlı bağlam (KApp.ctx) kullanılır", /Canlı\.mp4/.test(tt25.dom["hiz-hedef"].textContent), tt25.dom["hiz-hedef"].textContent);
  var app25 = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
  ok("app.js: onPoll dinleyicileri her başarılı yoklamada çağrılır ve dışa açık", /pollListeners\.forEach/.test(app25) && /onPoll: onPoll/.test(app25));

  /* ---------- 26) okuma satırı ve metinler ---------- */
  var q26 = kur({ cevap: function () { return { ok: false }; } });
  q26.H._medya["c:\\cekim\\f.mp4"] = { duration: 600, fps: 25 };
  q26.dom["hiz-akis"].value = "1";
  q26.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 1 / 50, playhead: 0, selCount: 1, sel: { name: "F.mp4", mediaPath: "C:\\cekim\\F.mp4", clipStart: 2, clipEnd: 6, inPoint: 10, outPoint: 14 } });
  var var26 = ozet(q26).some(function (x) { return /takılabilir/.test(x); });
  q26.dom["hiz-akis"].value = "2";
  q26.dom["hiz-akis"]._o.change();
  ok("Optik akış zaten seçiliyken 'Optik akış'ı dene' satırı yok (değişince önizleme tazelenir)", var26 && !ozet(q26).some(function (x) { return /takılabilir/.test(x); }), ozet(q26).join(" | "));
  ok("yoğunluk düştü metni sade ('Tutamak' yok)", !/Tutamak/.test(UYGULA) && I18N.translate("Klibin sonrasında yeterli görüntü yok: yoğunluk düşürüldü") === "Not enough footage after the clip: intensity lowered");
  var ad26 = cevir({ children: f.H._atlamaParcalari([{ name: "", kod: "grafik" }]).map(function (p) { return typeof p === "object" ? { textContent: p.ad, getAttribute: function (k) { return k === "data-i18n-skip" ? "" : null; } } : { nodeType: 3, textContent: p }; }) });
  ok("adsız atlanan klip EN: 'unnamed clip'", ad26 === "1 clip skipped: unnamed clip (graphic)", ad26);
  ok("hata metinleri: inoutKlipYok, duz, linkedBilinmiyor (Ctrl+L vaadi yok) ve İngilizceleri", /tek bir video klibin içinde/.test(f.H._hataMetni({ kod: "inoutKlipYok" })) &&
    /aynı hızda/.test(f.H._hataMetni({ kod: "duz" })) && !/Ctrl\+L/.test(f.H._hataMetni({ kod: "linkedBilinmiyor" })) &&
    ["inoutKlipYok", "duz", "linkedBilinmiyor"].every(function (k) { var tr = f.H._hataMetni({ kod: k }); return I18N.translate(tr) !== tr; }));
  var d26 = kur({ kurulu: true, cevap: function (fn, arg) { return fn === "KS_speedRampTargets" ? hedefler([hedef("A.mp4", 2, 6)]) : basari(arg); } });
  d26.dom["hiz-gecis"].value = "step";
  d26.H._sec("cikis");
  ok("tek hız çıkan plan (Basamaklı Hızlı Çıkış): önizleme nedenini söyler", /aynı hızda/.test(d26.dom["hiz-ozet"].textContent), d26.dom["hiz-ozet"].textContent);
  await d26.H.uygula();
  ok("...ve uygulanmaz, hak düşmez, durum satırı aynı metni verir", d26.uygulamalar().length === 0 && d26.harcanan.length === 0 && /aynı hızda/.test(d26.dom["hiz-status"].textContent), d26.dom["hiz-status"].textContent);

  /* ---------- 27) önizleme ölçülen genişlikte (metin ve nokta gerilmez); durum satırı canlı bölge ---------- */
  var w27 = kur({ cevap: function () { return { ok: false }; } });
  w27.dom["hiz-onizleme"].getBoundingClientRect = function () { return { width: 520, height: 120 }; };
  w27.H._sec("darbe");
  ok("viewBox ölçülen genişlikte (0 0 520 120), taban çizgisi 520'ye", w27.dom["hiz-onizleme"].getAttribute("viewBox") === "0 0 520 120" && /x2="520"/.test(w27.dom["hiz-onizleme"].innerHTML), w27.dom["hiz-onizleme"].getAttribute("viewBox"));
  ok("#hiz-status role=status aria-live=polite", /<div id="hiz-status" class="inline-status" role="status" aria-live="polite">/.test(html));

  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); process.exit(1); });
