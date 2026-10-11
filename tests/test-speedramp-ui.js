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
  var win = { SufloSpeedRamp: SR, localStorage: ls, KBeat: { vuruslar: function () { return (o.vuruslar || []).slice(); } } };
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
      onContext: function (fn) { dinleyici.ctx = fn; }, onTab: function (ad, fn) { dinleyici.tab[ad] = fn; }
    },
    Pro: {
      isPro: function () { return !!o.pro; }, on: function () {}, denemeAcik: function () { return !!o.kurulu; },
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
function basari(arg, seqId) {
  return { ok: true, pieces: arg.plan.segments.length, track: arg.target.track, seqId: seqId || "s1", newSeq: "", srcErr: 0, undoSteps: 9, warnings: [], speeds: [],
    cal: { units: "ratio", sig: "5" },
    record: { v: 1, seqId: seqId || "s1", track: arg.target.track, t0: arg.range.start, t1: arg.range.end, srcIn: 10, mediaPath: arg.target.mediaPath, name: "x", audio: [], unlinked: false, mode: arg.plan.mode } };
}

var UYGULA = fs.readFileSync(path.join(KOK, "js", "hiz-rampasi.js"), "utf8");

(async function () {
  /* ---------- 1) kapı ---------- */
  var a = kur({ kurulu: false, cevap: function () { throw new Error("çağrılmamalı"); } });
  await a.H.uygula();
  ok("kurulmamışken Premiere'e gidilmez; kapı 'speedramp' + deneme:true + yeniden", a.cagri.length === 0 && a.kapi.length === 1 && a.kapi[0][0] === "speedramp" &&
    a.kapi[0][1].deneme === true && typeof a.kapi[0][1].yeniden === "function" && a.harcanan.length === 0, js(a.kapi));
  ok("ilk satır kapı (kaynakta)", /async function uygula\(\) \{\n    if \(typeof Pro !== "undefined" && !Pro\.gate\("speedramp", \{ deneme: true, yeniden: function \(\) \{ uygula\(\); \} \}\)\) return;/.test(UYGULA.replace(/\r\n/g, "\n")));

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
  ok("kopya yalnız ilk çağrıda; sonrakiler beklenen sekansı ister", u[0].arg.cloneFirst === true && u[1].arg.cloneFirst === false && u[1].arg.expectSeqId === "s1", js(u.map(function (c) { return [c.arg.cloneFirst, c.arg.expectSeqId]; })));
  ok("en az bir başarıda hak bir kez düşer", b.harcanan.join(",") === "speedramp" && b.toastlar.some(function (t) { return t.m === "1 deneme hakkı kullanıldı · 2 kaldı"; }), js(b.harcanan));
  var kayit = JSON.parse(b.depo["suflo.hizRampa.kayitlar"] || "[]"), kal = JSON.parse(b.depo["suflo.hizRampa.kalibrasyon"] || "{}");
  ok("kayıt ve kalibrasyon yerel depoda", kayit.length === 1 && kayit[0].t0 === 2 && kayit[0].preset === "dalis" && kal["26.0.0"] && kal["26.0.0"].units === "ratio" && kal["26.0.0"].sig === "5", js([kayit, kal]));
  ok("başarısız klip atlama özetinde", b.toastlar.some(function (t) { return t.m === "1 klip atlandı: B.mp4 (hız yazılamadı)"; }), js(b.toastlar.map(function (t) { return t.m; })));
  var geriAl = b.toastlar.filter(function (t) { return t.e && t.e.metin === "Geri al"; })[0];
  ok("Ctrl+Z uyarısı 'Geri al' eylemiyle", !!geriAl && geriAl.m === "Ctrl+Z bunu tek adımda geri almaz; Rampayı kaldır'ı kullan.", js(b.toastlar));
  ok("başarı bildirimi '⏩ ad · n parça · V1'", b.toastlar.some(function (t) { return /^⏩ A\.mp4 · \d+ parça · V1$/.test(t.m); }), js(b.toastlar.map(function (t) { return t.m; })));
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
    if (fn === "KS_applySpeedRamp") return arg.plan.mode === "exact" ? { ok: false, kod: "tutamak", restored: true, seqId: "s1" } : basari(arg);
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
  ok("yerel depo atsa da iş biter (hak düşer, bildirim gelir)", !hata && e.harcanan.length === 1 && e.toastlar.some(function (t) { return /^⏩ /.test(t.m); }), String(hata));

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
  var kaldirGovde = UYGULA.slice(UYGULA.indexOf("async function kaldir("), UYGULA.indexOf("function init()"));
  ok("kaldir() gövdesinde Pro yok", kaldirGovde.length > 100 && !/Pro\./.test(kaldirGovde));

  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); process.exit(1); });
