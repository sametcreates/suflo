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
  // Özel eğri düzenleyicisi (SVG, js/egri.js mod 'hiz') için: firstChild / removeChild, odak, işaretçi yakalama, ölçü (viewBox ile aynı)
  Object.defineProperty(x, "firstChild", { get: function () { return x.children[0] || null; } });
  x.removeChild = function (c) { x.children = x.children.filter(function (k) { return k !== c; }); return c; };
  x.focus = function () {}; x.setPointerCapture = function () {}; x.releasePointerCapture = function () {};
  x.getBoundingClientRect = function () { return { left: 0, top: 0, width: SR.ozel.ED.W, height: SR.ozel.ED.H }; };
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
  // 3.4 adım 13: Özel eğri kutusu (o.ozelYok: eski index.html gibi kutusuz)
  if (!o.ozelYok) {
    ["hiz-ozel", "hiz-ozel-editor", "hiz-ozel-kayitlar"].forEach(function (id) { dom[id] = eleman("div", id); });
    ["hiz-ozel-basamak", "hiz-ozel-sil", "hiz-ozel-sifirla", "hiz-ozel-kaydet"].forEach(function (id) { dom[id] = eleman("button", id); });
    dom["hiz-ozel-hit"] = eleman("input", "hiz-ozel-hit"); dom["hiz-ozel-hit"].type = "checkbox"; dom["hiz-ozel-hit"].checked = true;
    dom["hiz-ozel-ad"] = eleman("input", "hiz-ozel-ad"); dom["hiz-ozel-ad"].type = "text";
    dom["hiz-ozel"].hidden = true;
  }
  var depo = o.depo || {};
  var ls = o.lsAtar ? { getItem: function () { throw new Error("SecurityError"); }, setItem: function () { throw new Error("QuotaExceeded"); } }
    : { getItem: function (k) { return Object.prototype.hasOwnProperty.call(depo, k) ? depo[k] : null; }, setItem: function (k, v) { depo[k] = String(v); } };
  var dinleyici = { ctx: null, tab: {} };
  var win = { SufloSpeedRamp: SR, localStorage: ls, KBeat: { vuruslar: function () { return (o.vuruslar || []).slice(); }, analiz: function () { return o.analiz || null; } } };
  var ctx = {
    window: win,
    document: { getElementById: function (id) { return dom[id] || null; }, createElement: function (t) { return eleman(t); }, createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; },
      createElementNS: function (ns, t) { var e = eleman(t); e.tagName = String(t); return e; } },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
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
  // index.html sırası: speedramp.js → hiz-rampasi.js → … → egri.js → app.js (init); düzenleyici init'te kurulur
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "hiz-rampasi.js"), "utf8"), ctx);
  if (!o.editorYok) vm.runInContext(fs.readFileSync(path.join(KOK, "js", "egri.js"), "utf8"), ctx);
  var H = ctx.window.KHizRampasi;
  H.init();
  return { H: H, dom: dom, cagri: cagri, kapi: kapi, harcanan: harcanan, toastlar: toastlar, depo: depo, dinleyici: dinleyici, ctx: ctx,
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
  ok("12 kart (11 önayar + Özel eğri), seçili olan aria-pressed", kartlar.length === 12 && kartlar.filter(function (k) { return k.getAttribute("aria-pressed") === "true"; }).length === 1);
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
  // 12 karede Nabız: parçalar ortalamada %100 (Basamaklı Hızlı Çıkış eskiden buraya düşerdi; artık 1:6 basamak, aşağıda)
  var d26 = kur({ kurulu: true, cevap: function (fn, arg) { return fn === "KS_speedRampTargets" ? hedefler([hedef("A.mp4", 2, 2.48)]) : basari(arg); } });
  d26.dinleyici.ctx({ hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 1, sel: { name: "A.mp4", mediaPath: "C:\\cekim\\A.mp4", clipStart: 2, clipEnd: 2.48, inPoint: 10, outPoint: 10.48 } });
  d26.H._sec("nabiz");
  ok("tek hız çıkan plan (12 karede Nabız): önizleme nedenini söyler", /aynı hızda/.test(d26.dom["hiz-ozet"].textContent), d26.dom["hiz-ozet"].textContent);
  await d26.H.uygula();
  ok("...ve uygulanmaz, hak düşmez, durum satırı aynı metni verir", d26.uygulamalar().length === 0 && d26.harcanan.length === 0 && /aynı hızda/.test(d26.dom["hiz-status"].textContent), d26.dom["hiz-status"].textContent);
  var s26 = kur({ kurulu: true, cevap: function (fn, arg) { return fn === "KS_speedRampTargets" ? hedefler([hedef("A.mp4", 2, 6)]) : basari(arg); } });
  s26.dom["hiz-gecis"].value = "step";
  s26.H._sec("cikis");
  ok("Basamaklı Hızlı Çıkış: önizleme 2 parçalı basamak ('aynı hızda' değil)", !/aynı hızda/.test(s26.dom["hiz-ozet"].textContent) && /2 parça/.test(s26.dom["hiz-ozet"].textContent), s26.dom["hiz-ozet"].textContent);
  await s26.H.uygula();
  var u26 = s26.uygulamalar(), g26 = u26.length ? u26[0].arg.plan.segments : [];
  ok("...ve uygulanır: tek çağrı, 2 parça, son parça ilkinin 6 katı hızda, hak bir kez düşer", u26.length === 1 && g26.length === 2 &&
    Math.abs(g26[1][1] / g26[0][1] - 6) < 0.01 && s26.harcanan.length === 1, js(g26));

  /* ---------- 27) önizleme ölçülen genişlikte (metin ve nokta gerilmez); durum satırı canlı bölge ---------- */
  var w27 = kur({ cevap: function () { return { ok: false }; } });
  w27.dom["hiz-onizleme"].getBoundingClientRect = function () { return { width: 520, height: 120 }; };
  w27.H._sec("darbe");
  ok("viewBox ölçülen genişlikte (0 0 520 120), taban çizgisi 520'ye", w27.dom["hiz-onizleme"].getAttribute("viewBox") === "0 0 520 120" && /x2="520"/.test(w27.dom["hiz-onizleme"].innerHTML), w27.dom["hiz-onizleme"].getAttribute("viewBox"));
  ok("#hiz-status role=status aria-live=polite", /<div id="hiz-status" class="inline-status" role="status" aria-live="polite">/.test(html));

  /* ================= 3.4 adım 13: Hız Rampası için Özel eğri editörü ================= */
  var Z = SR.ozel;
  function bul(kok, kosul, out) { out = out || []; (kok.children || []).forEach(function (c) { if (kosul(c)) out.push(c); bul(c, kosul, out); }); return out; }
  function kart(x, id) { return x.dom["hiz-grid"].children.filter(function (k) { return k.getAttribute("data-id") === id; })[0]; }
  function kok(x) { return x.dom["hiz-ozel-editor"].children[0]; }
  function ev(px, py, ek) { var e = { clientX: px, clientY: py, pointerId: 1, shiftKey: false, altKey: false, preventDefault: function () {}, stopPropagation: function () {} }; for (var k in ek || {}) e[k] = ek[k]; return e; }
  function gecerli(keys) { return Array.isArray(keys) && keys.length >= 2 && keys.length <= 8 && js(SR.ozelYuzde(keys)) === js(keys); }
  function yolD(x) { return bul(kok(x), function (c) { return c.getAttribute && c.getAttribute("class") === "egri-yol"; })[0].getAttribute("d"); }

  /* ---------- 28) kart ve düzenleyici kutusu ---------- */
  var z28 = kur({ cevap: function () { return { ok: false }; } });
  var oz28 = kart(z28, "ozel"), kartlar28 = z28.dom["hiz-grid"].children;
  var dz28 = kartlar28.filter(function (k) { return bul(k, function (c) { return c.className === "hiz-duzenle"; }).length; }).map(function (k) { return k.getAttribute("data-id"); });
  ok("Özel eğri kartı sonda (hiz-card-ozel), Özel eğri ve Ritme Rampa dışındaki 10 kartta 'Düzenle'", !!oz28 && kartlar28[kartlar28.length - 1] === oz28 && /hiz-card-ozel/.test(oz28.className) &&
    dz28.length === 10 && dz28.indexOf("ozel") === -1 && dz28.indexOf("ritim") === -1, js(dz28));
  var dzEl = bul(kart(z28, "darbe"), function (c) { return c.className === "hiz-duzenle"; })[0];
  ok("'Düzenle' klavyeyle de erişilir (role=button, tabindex=0, başlık)", dzEl.textContent === "Düzenle" && dzEl.getAttribute("role") === "button" && dzEl.getAttribute("tabindex") === "0" &&
    dzEl.getAttribute("title") === "Bu eğriyi Özel eğri düzenleyicisine kopyala");
  ok("düzenleyici kutusu yalnız Özel eğri seçiliyken görünür; düzenleyici 'hiz' modunda kurulur", z28.dom["hiz-ozel"].hidden === true && z28.H._editor() && z28.H._editor().mod === "hiz" &&
    (z28.H._sec("ozel"), z28.dom["hiz-ozel"].hidden === false) && (z28.H._sec("dalis"), z28.dom["hiz-ozel"].hidden === true));
  var svg28 = kok(z28);
  var etiket28 = bul(svg28, function (c) { return c.tagName === "text" && /hiz-ozel-eksen/.test(c.getAttribute("class") || ""); }).map(function (c) { return c.textContent; });
  ok("düzenleyici: log2 hız ekseni, 25 / 50 / 100 / 200 / 400 / 800 % çizgileri, başlangıç eğrisi ve ağır çekim anı", svg28.tagName === "svg" &&
    svg28.getAttribute("viewBox") === "0 0 " + Z.ED.W + " " + Z.ED.H && js(etiket28) === js(["25%", "50%", "100%", "200%", "400%", "800%"]) &&
    /^M/.test(yolD(z28)) && js(z28.H._ozel().keys) === js(SR.OZEL_VARSAYILAN.keys) && z28.H._ozel().hit === 0.5 &&
    bul(svg28, function (c) { return /hiz-ozel-hit-tutamac/.test(c.getAttribute && c.getAttribute("class") || ""); }).length === 1, js(etiket28));
  ok("init / render / önizleme Premiere'e gitmez (düzenleyici kurulu)", z28.cagri.length === 0, js(z28.cagri));

  /* ---------- 29) Düzenle önayarın anahtarlarını kopyalar ---------- */
  var z29 = kur({ cevap: function () { return { ok: false }; } });
  var hedef29 = { hasSeq: true, app: "26.0.0", sequenceId: "s1", frame: 0.04, playhead: 0, selCount: 1, sel: { name: "D.mp4", mediaPath: "C:\\cekim\\D.mp4", clipStart: 2, clipEnd: 6, inPoint: 10, outPoint: 14 } };
  z29.H._medya["c:\\cekim\\d.mp4"] = { duration: 600, fps: 25 };
  z29.dinleyici.ctx(hedef29);
  z29.H._sec("darbe");
  var darbeSvg = z29.dom["hiz-onizleme"].innerHTML, darbeOzet = z29.dom["hiz-ozet"].textContent;
  bul(kart(z29, "darbe"), function (c) { return c.className === "hiz-duzenle"; })[0]._o.click({ stopPropagation: function () {} });
  ok("Düzenle: Özel eğri seçilir, anahtarlar ve darbe anı kopyalanır, önizleme ve okuma satırı hazır önayarla aynı", z29.H._secili() === "ozel" &&
    js(z29.H._ozel().keys) === js(SR.ozelYuzde(SR.get("darbe").keys)) && z29.H._ozel().hit === 0.5 && z29.dom["hiz-onizleme"].innerHTML === darbeSvg &&
    z29.dom["hiz-ozet"].textContent === darbeOzet && z29.dom["hiz-ozel"].hidden === false, z29.dom["hiz-ozet"].textContent + " | " + darbeOzet);
  ok("Düzenle: son özel eğri yerel depoda; durum satırı önayarın adını söyler (çevrilir)", js(JSON.parse(z29.depo["suflo.hizRampa.ozel"]).keys) === js(z29.H._ozel().keys) &&
    z29.dom["hiz-status"].textContent === "Darbe özel eğriye kopyalandı; noktaları sürükleyerek değiştir." &&
    I18N.translate(z29.dom["hiz-status"].textContent) === "Impact copied to the custom curve; drag the points to change it.", z29.dom["hiz-status"].textContent);
  bul(kart(z29, "vites"), function (c) { return c.className === "hiz-duzenle"; })[0]._o.keydown({ key: "Enter", preventDefault: function () {}, stopPropagation: function () {} });
  ok("Düzenle Enter ile: Vites'in sert basamakları korunur, Vites'in planı", js(z29.H._ozel().keys) === js(SR.ozelYuzde(SR.get("vites").keys)) && z29.H._ozel().hit === 0.4 &&
    js(SR.plan("ozel", { ozelKeys: z29.H._ozel().keys, ozelHit: 0.4 }, { frames: 100, fps: 25 }).segments) === js(SR.plan("vites", {}, { frames: 100, fps: 25 }).segments));
  ok("Düzenle Premiere'e gitmez", z29.cagri.filter(function (c) { return c.fn !== "ffmpeg"; }).length === 0);

  /* ---------- 30) düzenleyici geçerli anahtar verir; önizleme 80 ms ertelenir, K.call yok ---------- */
  var z30 = kur({ cevap: function () { return { ok: false }; } });
  z30.H._sec("ozel");
  var k30 = kok(z30), once30 = z30.dom["hiz-onizleme"].innerHTML, kartOnce30 = kart(z30, "ozel").children[0].innerHTML;
  k30._o.pointerdown(ev(Z.ekranX(0.25), Z.ekranY(2)));
  ok("tıkla: nokta eklenir (durum hemen), önizleme ve kart resmi henüz çizilmez", z30.H._ozel().keys.length === 4 && js(z30.H._ozel().keys[1]) === js([0.25, 200]) &&
    z30.dom["hiz-onizleme"].innerHTML === once30 && kart(z30, "ozel").children[0].innerHTML === kartOnce30, js(z30.H._ozel().keys));
  k30._o.pointermove(ev(Z.ekranX(0.3), Z.ekranY(4)));
  k30._o.pointermove(ev(Z.ekranX(0.32), Z.ekranY(3.9)));
  ok("sürüklerken depoya yazılmaz", !z30.depo["suflo.hizRampa.ozel"]);
  k30._o.pointerup(ev(Z.ekranX(0.32), Z.ekranY(3.9)));
  await bekle(120);
  var son30 = z30.H._ozel().keys;
  ok("bırakınca: nokta (0,32, %390), geçerli anahtarlar depoda; 80 ms sonra önizleme ve kart resmi yeni eğriyle", js(son30[1]) === js([0.32, 390]) && gecerli(son30) &&
    js(JSON.parse(z30.depo["suflo.hizRampa.ozel"]).keys) === js(son30) && z30.dom["hiz-onizleme"].innerHTML !== once30 &&
    kart(z30, "ozel").children[0].innerHTML !== kartOnce30 &&
    kart(z30, "ozel").children[0].innerHTML.indexOf('d="' + SR.thumb("ozel", 120, 56, { ozelKeys: son30, ozelHit: 0.5 }).path + '"') !== -1, js(son30));
  // rastgele etkileşim: her adımda geçerli anahtarlar, hiç K.call yok
  var tohum30 = 5, gecersiz30 = [];
  function r30() { tohum30 = (tohum30 * 1103515245 + 12345) % 2147483648; return tohum30 / 2147483648; }
  for (var a30 = 0; a30 < 150; a30++) {
    var px = r30() * Z.ED.W, py = r30() * Z.ED.H, tur = r30();
    var e30 = ev(px, py, { shiftKey: r30() < 0.3, altKey: r30() < 0.15 });
    if (tur < 0.45) k30._o.pointerdown(e30);
    else if (tur < 0.8) k30._o.pointermove(e30);
    else if (tur < 0.93) k30._o.pointerup(e30);
    else k30._o.dblclick(e30);
    if (!gecerli(z30.H._ozel().keys)) gecersiz30.push(a30 + " " + js(z30.H._ozel().keys));
  }
  k30._o.pointerup(ev(0, 0));
  await bekle(120);
  ok("150 rastgele tıklama / sürükleme / çift tık / Alt / Shift: düzenleyici her an geçerli anahtar verir (2–8 nokta, uçlar 0 ve 1)", gecersiz30.length === 0 &&
    gecerli(z30.H._editor().anahtarlar()), gecersiz30.slice(0, 2).join(" | "));
  ok("düzenlerken Premiere'e hiç gidilmez (K.call yok)", z30.cagri.length === 0, js(z30.cagri));
  var hrSrc = UYGULA.replace(/\r\n/g, "\n"), egSrc = fs.readFileSync(path.join(KOK, "js", "egri.js"), "utf8").replace(/\r\n/g, "\n");
  function govde(src, bas) { var i = src.indexOf(bas); if (i < 0) return ""; var d = 0, j = src.indexOf("{", i); for (var k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } return ""; }
  var kCallYok = ["function ozelDegisti(", "function ozelZamanla(", "function ozelAta(", "function duzenle(", "function ozelKur(", "function kartlar(", "function ozelResim(",
    "function ozelKayitKaydet(", "function ozelHitDegisti(", "function onizlemeCiz(", "function render("].filter(function (f) { var g = govde(hrSrc, f); return !(g.length > 40) || /K\.call\(/.test(g); });
  ok("kaynak: özel eğri işlevleri, render ve onizlemeCiz K.call içermez; düzenleyicinin 'hiz' modu da", kCallYok.length === 0 && govde(egSrc, "function hizOlustur(").length > 500 &&
    !/K\.call\(/.test(govde(egSrc, "function hizOlustur(")), js(kCallYok));
  ok("kaynak: önizleme gecikmesi 80 ms", /var OZEL_GECIKME = 80;/.test(hrSrc) && /setTimeout\(function \(\) \{ ozelZaman = null; ozelResim\(\); onizlemeCiz\(\); \}, OZEL_GECIKME\)/.test(hrSrc));

  /* ---------- 31) düzenleyici işlemleri: Shift, Alt, çift tık, ağır çekim anı, düğmeler, Yumuşatma ---------- */
  var z31 = kur({ cevap: function () { return { ok: false }; } });
  z31.H._sec("ozel");
  var k31 = kok(z31);
  k31._o.pointerdown(ev(Z.ekranX(0.263), Z.ekranY(1.8), { shiftKey: true }));
  k31._o.pointerup(ev(0, 0));
  ok("Shift+tıkla: zaman %5'e, hız ızgara çizgisine (%200)", js(z31.H._ozel().keys[1]) === js([0.25, 200]), js(z31.H._ozel().keys));
  ok("seçili iç nokta: Sert basamak / Noktayı sil etkin", z31.dom["hiz-ozel-basamak"].disabled === false && z31.dom["hiz-ozel-sil"].disabled === false);
  k31._o.pointerdown(ev(Z.ekranX(0.5), Z.ekranY(0.3), { altKey: true }));
  var k31b = z31.H._ozel().keys;
  ok("Alt+tık: sert basamak (aynı t'de iki nokta), düğme 'Basamağı kaldır' olur", k31b.length === 5 && k31b[2][0] === 0.5 && k31b[3][0] === 0.5 && k31b[2][1] === 30 &&
    k31b[3][1] === 100 && z31.dom["hiz-ozel-basamak"].textContent === "Basamağı kaldır" && I18N.translate("Basamağı kaldır") === "Remove step", js(k31b));
  z31.dom["hiz-ozel-basamak"]._o.click();
  ok("Basamağı kaldır düğmesi: basamak kapanır", z31.H._ozel().keys.length === 4 && z31.dom["hiz-ozel-basamak"].textContent === "Sert basamak", js(z31.H._ozel().keys));
  k31._o.dblclick(ev(Z.ekranX(0.25), Z.ekranY(2)));
  ok("çift tık: nokta silinir; seçim kalkınca düğmeler kapanır", z31.H._ozel().keys.length === 3 && z31.dom["hiz-ozel-sil"].disabled === true, js(z31.H._ozel().keys));
  k31._o.dblclick(ev(Z.ekranX(0), Z.ekranY(1)));
  ok("çift tık uçta: silinmez, uyarı durum satırında (çevrilir)", z31.H._ozel().keys.length === 3 && /Uç noktalar silinmez/.test(z31.dom["hiz-status"].textContent) &&
    I18N.translate(z31.dom["hiz-status"].textContent) !== z31.dom["hiz-status"].textContent);
  for (var n31 = 0; n31 < 6; n31++) { k31._o.pointerdown(ev(Z.ekranX(0.06 + n31 * 0.07), Z.ekranY(1.5))); k31._o.pointerup(ev(0, 0)); }
  k31._o.pointerdown(ev(Z.ekranX(0.9), Z.ekranY(3)));
  ok("8 noktada yeni nokta eklenmez; neden durum satırında", z31.H._ozel().keys.length === 8 && /En çok 8 nokta/.test(z31.dom["hiz-status"].textContent), z31.H._ozel().keys.length + " " + z31.dom["hiz-status"].textContent);
  z31.dom["hiz-ozel-sifirla"]._o.click();
  ok("Sıfırla: başlangıç eğrisi ve ağır çekim anı", js(z31.H._ozel().keys) === js(SR.OZEL_VARSAYILAN.keys) && z31.H._ozel().hit === 0.5);
  k31._o.pointerdown(ev(Z.ekranX(0.5), Z.ED.PAD));
  k31._o.pointermove(ev(Z.ekranX(0.7), Z.ED.PAD + 30));
  k31._o.pointerup(ev(0, 0));
  ok("ağır çekim anı üstteki tutamacından sürüklenir (nokta eklenmez)", z31.H._ozel().hit === 0.7 && z31.H._ozel().keys.length === 3, js(z31.H._ozel()));
  z31.dom["hiz-ozel-hit"].checked = false;
  z31.dom["hiz-ozel-hit"]._o.change();
  var p31 = SR.plan("ozel", { ozelKeys: z31.H._ozel().keys, ozelHit: z31.H._ozel().hit }, { frames: 100, fps: 25, hitFrac: 0.5 });
  ok("Ağır çekim anı kapalı: hit yok (playhead'e hizalanmaz), çizgi kalkar", z31.H._ozel().hit === null && p31.hit === null &&
    bul(kok(z31), function (c) { return /hiz-ozel-hit-tutamac/.test(c.getAttribute && c.getAttribute("class") || ""); }).length === 0);
  z31.dom["hiz-ozel-hit"].checked = true;
  z31.dom["hiz-ozel-hit"]._o.change();
  ok("yeniden açınca son yerine (0,7) döner", z31.H._ozel().hit === 0.7 && JSON.parse(z31.depo["suflo.hizRampa.ozel"]).hit === 0.7);
  var yolOnce = yolD(z31);
  z31.dom["hiz-gecis"].value = "step";
  z31.dom["hiz-gecis"]._o.change();
  ok("Yumuşatma seçicisi düzenleyicideki geçişi de değiştirir (Basamaklı)", z31.H._editor().ease() === "step" && yolD(z31) !== yolOnce && yolD(z31) === Z.yol(z31.H._ozel().keys, "step"));

  /* ---------- 32) uygula: aynı kapı ve deneme; plan özel eğriden; iş başındaki eğri kalan kliplerde de ---------- */
  var depo32 = { "suflo.hizRampa.ozel": JSON.stringify({ keys: [[0, 100], [0.3, 400], [0.6, 25], [1, 100]], hit: 0.6, sonHit: 0.6 }),
    "suflo.hizRampa.ayar": JSON.stringify({ secili: "ozel" }) };
  var kilitli32 = kur({ depo: depo32, cevap: function () { throw new Error("çağrılmamalı"); } });
  await kilitli32.H.uygula();
  ok("Özel eğride de kapı 'speedramp' + deneme; kurulmamışken Premiere'e gidilmez", kilitli32.kapi.length === 1 && kilitli32.kapi[0][0] === "speedramp" && kilitli32.kapi[0][1].deneme === true &&
    kilitli32.cagri.length === 0 && kilitli32.H._secili() === "ozel");
  var u32;
  var z32 = kur({ kurulu: true, depo: depo32, cevap: function (fn, arg) {
    if (fn === "KS_speedRampTargets") return hedefler([hedef("A.mp4", 2, 6), hedef("B.mp4", 8, 12)]);
    if (fn === "KS_applySpeedRamp") {
      // ilk klip uygulanırken kullanıcı eğriyi değiştirir: kalan klip yine iş başındaki eğriyle
      if (arg.target.start === 2) { var kk = kok(z32); kk._o.pointerdown(ev(Z.ekranX(0.8), Z.ekranY(8))); kk._o.pointerup(ev(0, 0)); }
      return basari(arg);
    }
    return { ok: false };
  } });
  var basKeys = z32.H._ozel().keys;
  await z32.H.uygula();
  u32 = z32.uygulamalar();
  var bek32 = function (t) { return js(SR.hostPlan(SR.plan("ozel", { ozelKeys: basKeys, ozelHit: 0.6 }, SR.clipFor(t, 0.04, { playhead: 0, hizala: false, beats: [] })))); };
  ok("uygulama: plan özel eğriden (host yükü SR.plan('ozel') ile aynı), hak bir kez düşer, kayıt preset 'ozel'", u32.length === 2 && js(u32[0].arg.plan) === bek32(hedef("A.mp4", 2, 6)) &&
    z32.harcanan.join(",") === "speedramp" && JSON.parse(z32.depo["suflo.hizRampa.kayitlar"]).every(function (k) { return k.preset === "ozel"; }), js(u32.map(function (c) { return c.arg.plan.segments.length; })));
  ok("iş sürerken eğri değişse de ikinci klip iş başındaki eğriyle; düzenleme sonra geçerli", js(u32[1].arg.plan) === bek32(hedef("B.mp4", 8, 12)) &&
    z32.H._ozel().keys.length === basKeys.length + 1, js(z32.H._ozel().keys));
  ok("bildirim: adsız klipte değil, klip adıyla; 'Uygulanan eğri: Özel eğri' çevrilir", I18N.translate("Uygulanan eğri: Özel eğri") === "Applied curve: Custom curve");

  /* ---------- 33) depo: yükleme, bozuk veri, depo atınca ---------- */
  var z33 = kur({ depo: { "suflo.hizRampa.ozel": JSON.stringify({ keys: [[0.4, 250], [0, 100], [1, 100], ["x", 3]], hit: null, sonHit: 0.3 }), "suflo.hizRampa.ayar": JSON.stringify({ secili: "ozel" }) },
    cevap: function () { return { ok: false }; } });
  ok("son özel eğri yüklenir (doğrulanarak), ağır çekim anı kapalı, kutu açık, düzenleyici aynı eğride", js(z33.H._ozel().keys) === js([[0, 100], [0.4, 250], [1, 100]]) &&
    z33.H._ozel().hit === null && z33.H._ozel().sonHit === 0.3 && z33.dom["hiz-ozel-hit"].checked === false && z33.dom["hiz-ozel"].hidden === false &&
    js(z33.H._editor().anahtarlar()) === js(z33.H._ozel().keys) && z33.H._editor().hit() === null);
  var bozuk = [kur({ depo: { "suflo.hizRampa.ozel": "{bozuk" }, cevap: function () { return { ok: false }; } }),
    kur({ depo: { "suflo.hizRampa.ozel": JSON.stringify({ keys: "x" }), "suflo.hizRampa.ozelKayitlar": JSON.stringify({ a: 1 }) }, cevap: function () { return { ok: false }; } }),
    kur({ lsAtar: true, cevap: function () { return { ok: false }; } })];
  ok("bozuk depo / depo atıyor: başlangıç eğrisi, hata yok", bozuk.every(function (b) { return js(b.H._ozel().keys) === js(SR.OZEL_VARSAYILAN.keys) && b.dom["hiz-ozel-kayitlar"].hidden === true; }));
  var ls33 = bozuk[2];
  ls33.H._sec("ozel");
  kok(ls33)._o.pointerdown(ev(Z.ekranX(0.2), Z.ekranY(3)));
  kok(ls33)._o.pointerup(ev(0, 0));
  ok("depo atarken de düzenleme çalışır (yalnız saklanmaz)", ls33.H._ozel().keys.length === 4);
  var eski = kur({ ozelYok: true, cevap: function () { return { ok: false }; } });
  eski.H._sec("ozel");
  ok("kutusu olmayan index.html (eski): kart seçilir, başlangıç eğrisi önizlenir, hata yok", eski.H._secili() === "ozel" && /hiz-egri/.test(eski.dom["hiz-onizleme"].innerHTML) && !eski.H._editor());

  /* ---------- 34) adlı özel rampalar (en çok 12) ---------- */
  var z34 = kur({ cevap: function () { return { ok: false }; } });
  ok("ad kutusunun yer tutucusu 'Özel rampa 1'; liste boşken gizli", z34.dom["hiz-ozel-ad"].getAttribute("placeholder") === "Özel rampa 1" && z34.dom["hiz-ozel-kayitlar"].hidden === true);
  bul(kart(z34, "atilim"), function (c) { return c.className === "hiz-duzenle"; })[0]._o.click({ stopPropagation: function () {} });
  z34.dom["hiz-ozel-ad"].value = "Röportaj vuruşu";
  z34.dom["hiz-ozel-kaydet"]._o.click();
  var kl34 = JSON.parse(z34.depo["suflo.hizRampa.ozelKayitlar"]);
  var cip = z34.dom["hiz-ozel-kayitlar"].children;
  ok("Kaydet: depoda adıyla; çip kullanıcı adını çevirmez; kutu boşalır", kl34.length === 1 && kl34[0].ad === "Röportaj vuruşu" && js(kl34[0].keys) === js(SR.ozelYuzde(SR.get("atilim").keys)) &&
    cip.length === 1 && cip[0].children[0].getAttribute("data-i18n-skip") === "" && cip[0].children[0].textContent === "Röportaj vuruşu" && z34.dom["hiz-ozel-ad"].value === "" &&
    z34.dom["hiz-ozel-kayitlar"].hidden === false && /Kaydedildi: Röportaj vuruşu/.test(z34.dom["hiz-status"].textContent), js(kl34));
  z34.dom["hiz-ozel-sifirla"]._o.click();
  z34.dom["hiz-ozel-kaydet"]._o.click();
  var kl34b = JSON.parse(z34.depo["suflo.hizRampa.ozelKayitlar"]);
  ok("adsız Kaydet: 'Özel rampa 2' (sonraki numara)", kl34b.length === 2 && kl34b[1].ad === "Özel rampa 2", js(kl34b.map(function (k) { return k.ad; })));
  z34.dom["hiz-ozel-kayitlar"].children[0]._o.click();
  ok("çipe tıkla: kayıtlı rampa düzenleyiciye yüklenir, Özel eğri seçili", js(z34.H._ozel().keys) === js(kl34[0].keys) && z34.H._secili() === "ozel" &&
    js(z34.H._editor().anahtarlar()) === js(kl34[0].keys));
  z34.dom["hiz-ozel-ad"].value = "röportaj VURUŞU";
  z34.dom["hiz-ozel-kaydet"]._o.click();
  ok("aynı ad (büyük / küçük harf): üzerine yazılır, sayı artmaz", JSON.parse(z34.depo["suflo.hizRampa.ozelKayitlar"]).length === 2 && /Güncellendi:/.test(z34.dom["hiz-status"].textContent));
  bul(z34.dom["hiz-ozel-kayitlar"].children[1], function (c) { return c.className === "hiz-ozel-kayit-sil"; })[0]._o.click({ stopPropagation: function () {} });
  ok("× siler", JSON.parse(z34.depo["suflo.hizRampa.ozelKayitlar"]).length === 1 && z34.dom["hiz-ozel-kayitlar"].children.length === 1);
  var dolu34 = [];
  for (var d34 = 0; d34 < 12; d34++) dolu34.push({ id: "r" + d34, ad: "R" + d34, keys: [[0, 100], [1, 300]], hit: null });
  var y34 = kur({ depo: { "suflo.hizRampa.ozelKayitlar": JSON.stringify(dolu34) }, cevap: function () { return { ok: false }; } });
  y34.dom["hiz-ozel-ad"].value = "On üçüncü";
  y34.dom["hiz-ozel-kaydet"]._o.click();
  ok("12 doluyken: saklanmaz, neden söylenir (çevrilir)", JSON.parse(y34.depo["suflo.hizRampa.ozelKayitlar"]).length === 12 && y34.dom["hiz-ozel-kayitlar"].children.length === 12 &&
    y34.dom["hiz-status"].textContent === "En çok 12 özel rampa saklanır; birini sil." && I18N.translate(y34.dom["hiz-status"].textContent) === "Up to 12 custom ramps are kept; delete one first.");
  ok("adlı rampalar Premiere'e gitmez", z34.cagri.length === 0 && y34.cagri.length === 0);

  /* ---------- 35) metinler İngilizce ---------- */
  var enEksik35 = ["Düzenle", "Bu eğriyi Özel eğri düzenleyicisine kopyala", "Sert basamak", "Basamağı kaldır", "Özel rampayı sil", "Özel rampaya bir ad yaz.",
    "Özel rampa bu bilgisayarda saklanamadı.", "En çok 8 nokta. Yeni nokta için birini çift tıklayıp sil.", "Başka bir noktaya çok yakın; biraz yana tıkla.",
    "Uç noktada sert basamak olmaz; aradaki bir noktayı seç.", "Önce eğride bir nokta seç.", "Özel rampa 3", "Kendi hız eğrini çiz: nokta ekle, sürükle, sert basamak yap"].filter(function (s) { return I18N.translate(s) === s; });
  ok("özel eğri metinleri İngilizcede çevrilir", enEksik35.length === 0, enEksik35.join(" | "));

  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + (e && e.stack)); process.exit(1); });
