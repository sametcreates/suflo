// Suflo testi: Yapay zekâ köprüsü (MCP) — altyazı ve otomatik kesim yürütücüleri
// js/captions.js (apply, mcpKanala, mcpOlustur) ve js/magiccut.js (analyze, mcpAnaliz) GERÇEK kaynağı
// sahte DOM / Premiere ile çalıştırılır. İnceleme bulguları:
//  - suflo_altyazi_kanala sonucu #cap-status'tan okuyordu: onay isteyen / başarısız her dal ok:true dönüyordu,
//    ikinci çağrı panelin "Yine de yeni iz ekle" onayını kullanıcı yerine geçiyordu
//  - suflo_altyazi_olustur dil:'auto' hiç kabul edilmiyordu; mod kullanıcının satır düzenini eziyordu
//  - suflo_sessizlik_analiz klip yokken / iptalde ok:true + boş aralık dönüyor, panel listesini bozuyordu
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var O = require(path.join(KOK, "js", "otomasyon.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

function kaynak(f) { return fs.readFileSync(path.join(KOK, "js", f), "utf8").replace(/\r\n/g, "\n"); }
function kes(src, imza) {
  var i = src.indexOf(imza);
  if (i === -1) throw new Error("bulunamadi: " + imza);
  var son = src.indexOf("\n  }\n", i);
  if (son === -1) throw new Error("kapanis yok: " + imza);
  return src.slice(i, son + 4);
}

// tek satırlık işlev (ör. "function etkinMod(hedef) { ... }")
function satir(src, imza) {
  var i = src.indexOf(imza);
  if (i === -1) throw new Error("bulunamadi: " + imza);
  return src.slice(i, src.indexOf("\n", i) + 1);
}
// 3.4 Otomatik Kesim saf modülü (zarf / kesim haritası; analyze ve apply kullanır)
var S = require(path.join(KOK, "js", "sessizlik.js"));

/* ---------------- captions.js ---------------- */
var cap = kaynak("captions.js");
var capKod = [
  kes(cap, "async function apply(stilIle, secenek)"),
  kes(cap, "function durumOku()"),
  kes(cap, "function secimDegistir("),
  kes(cap, "async function mcpOlustur(o, geri)"),
  kes(cap, "async function mcpKanala()"),
  kes(cap, "async function mcpDisari(bicim)")
].join("\n");

function olay(tur) { return { type: tur }; }
function secici(id, degerler, deger) {
  var e = { id: id, value: deger, olaylar: [], options: degerler.map(function (v) { return { value: v }; }),
    dispatchEvent: function (ev) { e.olaylar.push(ev.type); return true; } };
  return e;
}

function altyaziKur(o) {
  o = o || {};
  var c = { call: [], toast: [], go: [] };
  var dom = {
    "cap-status": { textContent: "", className: "inline-status" },
    "cap-apply": { textContent: "Normal altyazı izi ekle", classList: { add: function () { c.warnBtn = true; }, remove: function () {} } },
    "cap-lang": secici("cap-lang", ["tr", "az", "en", "ru", "de", "ar", "es", "fr", "pt", "it", ""], o.dil === undefined ? "tr" : o.dil),
    "cap-maxlen": secici("cap-maxlen", ["w2", "w3", "w4", "w5", "l32", "l42", "c42x2", "c60", "k1", "kc"], o.maxlen || "c42x2"),
    "cap-scope": { querySelector: function (q) {
      var m = /data-s="([a-z]+)"/.exec(q);
      if (!m || ["clip", "inout", "entire"].indexOf(m[1]) === -1) return null;
      return { click: function () { c.kapsam = m[1]; } };
    } }
  };
  var E = {
    segments: o.segments || [{ start: 0, end: 1, text: "Merhaba" }],
    uygulananSekans: o.uygulananSekans || {},
    kritik: o.kritik || 0,
    dom: dom,
    Event: function (tur) { this.type = tur; },
    window: { SufloOtomasyon: O },
    KApp: { ctx: function () { return { sequenceId: "s1", sequence: "Kurgu" }; }, toast: function (m, t) { c.toast.push([m, t]); } },
    K: {
      srtDir: function () { return "/tmp/suflo-srt"; },
      call: function (fn, arg) { c.call.push([fn, arg]); return Promise.resolve(o.cevap ? o.cevap(fn, arg) : { ok: true, captionTrack: true }); },
      fs: { existsSync: function () { return false; },
        accessSync: function (d) { if (o.salt) { var e = new Error("EACCES: permission denied, access '" + d + "'"); e.code = "EACCES"; throw e; } },
        writeFileSync: function (f) { if (o.yazmaHatasi) { var e = new Error("ENOSPC: no space left on device, open '" + f + "'"); e.code = "ENOSPC"; throw e; } c.yazildi = f; },
        constants: { W_OK: 2 } },
      path: path, clearDraft: function () {}
    },
    go: function (opts) { c.go.push(opts); return Promise.resolve(o.go ? o.go(opts, dom) : true); }
  };
  var f = new Function("E", [
    "var segments = E.segments, ornekBelge = false, ornekSekansId = '', secilenMogrt = null, secilenMotorStili = '';",
    // 3.4 adım 8: kesimden sonra uyarlanan belge yok (Uygula her sekansa gider)
    "var belgeKesimAdi = null, belgeSekansId = '';",
    "var uygulananSekans = E.uygulananSekans, onayBekleyen = null, kaliteOnayBekleyen = '', shortsYuklenen = '';",
    "var busy = false, scope = 'clip', Pro, KApp = E.KApp, K = E.K, window = E.window, Event = E.Event;",
    "function el(id) { return E.dom[id] || null; }",
    "function qualityReport() { return { bad: E.kritik }; }",
    "function buildSrt() { return '1\\n00:00:00,000 --> 00:00:01,000\\nMerhaba\\n'; }",
    "function ciftDilAcik() { return false; }",
    "function uygulaEtiketiniSifirla() { onayBekleyen = null; kaliteOnayBekleyen = ''; }",
    "function overlayUygula() {} function mogrtStiliniUygula() {} function status() {}",
    "function cancelDraft() {} function hideRestore() {} function yildizIste() {}",
    "function go(opts) { return E.go(opts); }",
    "function dosyaDilEki() { return ''; } function buildVtt() { return 'WEBVTT'; } function styleText(t) { return t; }",
    "var CL = { duzMetin: function (t) { return t; } }, CT = { stripEmphasis: function (t) { return t; } };",
    capKod,
    "return { apply: apply, mcpKanala: mcpKanala, mcpOlustur: mcpOlustur, mcpDisari: mcpDisari,",
    "  durum: function () { return { onayBekleyen: onayBekleyen, kaliteOnayBekleyen: kaliteOnayBekleyen, uygulanan: uygulananSekans }; } };"
  ].join("\n"));
  return { api: f(E), c: c, dom: dom };
}

/* ---------------- magiccut.js ---------------- */
var mc = kaynak("magiccut.js");
var mcKod = [
  kes(mc, "function parseSilence("),
  // 3.4 adım 6: canlı eşik yardımcıları (kaydırıcı değerleri, silencedetect çağrısı, sekans zamanına çeviri)
  kes(mc, "function ayarlar()"),
  kes(mc, "function kesimAyari(a)"),
  kes(mc, "function sekansaCevir(sonuc)"),
  kes(mc, "function sessizlikBul(ff, a, jeton)"),
  satir(mc, "function sdAnahtar(a)"),
  kes(mc, "async function analyze(ev)"),
  kes(mc, "function durumMetni()"),
  kes(mc, "function kaydir("),
  kes(mc, "async function mcpAnaliz(o)")
].join("\n");

function kesimKur(o) {
  o = o || {};
  var c = { run: 0, toast: [] };
  function eleman(id, deger) {
    var e = { id: id, value: deger, textContent: "", className: "inline-status", hidden: false, olaylar: [],
      dispatchEvent: function (ev) { e.olaylar.push(ev.type); return true; } };
    return e;
  }
  var dom = { "cut-status": eleman("cut-status"), "cut-noise": eleman("cut-noise", "-38"), "cut-minsil": eleman("cut-minsil", "0.8"),
    "cut-pad": eleman("cut-pad", "0.15"), "cut-result": eleman("cut-result") };
  var E = {
    dom: dom, sel: o.sel === undefined ? { name: "klip.mp4", mediaPath: "/m/klip.mp4", inPoint: 0, outPoint: 20, clipStart: 10, clipEnd: 30 } : o.sel,
    ranges: o.ranges || [],
    S: S,
    Event: function (tur) { this.type = tur; },
    KApp: { ctx: function () { return { sel: E.sel }; }, toast: function (m, t) { c.toast.push([m, t]); } },
    K: {
      findFfmpeg: function () { return Promise.resolve("/x/ffmpeg"); },
      iptalJetonu: function () { return { iptalEdildi: false }; },
      run: function () { c.run++; return Promise.resolve(o.run ? o.run() : { code: 0, stderr: "silence_start: 2\nsilence_end: 4\n" }); },
      log: function () {}
    }
  };
  E.sonKonum = o.ranges && E.sel ? S.anahtar(E.sel.mediaPath, E.sel.inPoint, E.sel.outPoint - E.sel.inPoint) + "@" + Number(E.sel.clipStart) : "";
  var f = new Function("E", [
    "var clip = null, ranges = E.ranges, busy = false, iptalJetonu = null, baslatAcilis = 0, Pro;",
    "var KApp = E.KApp, K = E.K, Event = E.Event, S = E.S;",
    // 3.4: Seçili klip kapsamı, PCM zarfı yok (K.runAkis yok → silencedetect akışı), katman düzeni okunmadı.
    // Önceki aralıklar verildiyse aynı klibin aynı yerdeki analizidir (sonKonum tutar): iptal / hata onları korur.
    "var kapsam = 'clip', uygulaniyor = false, adalar = [], kapatilanlar = [], zarf = null, hamSessizlik = null, farkUyarisi = false;",
    "var analizSeqId = '', sdOnbellek = {}, otoMesaj = null, katman = null, secImza = null, sonAnahtar = E.sonKonum ? E.sonKonum.split('@')[0] : '', sonKonum = E.sonKonum;",
    "var zarfOnbellek = { al: function () { return null; }, koy: function () {} };",
    "function katmanBolumuAcik() { return false; } function wavSil() {} function yenidenHesapla() {}",
    "function el(id) { return E.dom[id] || null; }",
    "function status(m, cls) { var e = el('cut-status'); e.className = 'inline-status' + (cls ? ' ' + cls : ''); e.textContent = m || ''; }",
    "function sesiKapat() {} function setBusy() {} function render() {}",
    mcKod,
    "return { mcpAnaliz: mcpAnaliz, ranges: function () { return ranges; } };"
  ].join("\n"));
  return { api: f(E), c: c, dom: dom };
}

// suflo_sessizlik_kes: apply + mcpKes GERÇEK kaynağı; hedef düğmesi (Kopya / Bu sekansta) target'a yazar
var mcUygulaKod = [
  kes(mc, "function activeRanges()"),
  satir(mc, "function etkinMod(hedef)"),
  kes(mc, "async function apply(ek)"),
  kes(mc, "function durumMetni()"),
  kes(mc, "async function mcpKes()")
].join("\n");
function kesimUygulaKur(o) {
  o = o || {};
  var c = { call: [], bekleyen: [], toast: [] };
  function eleman(id, deger) { return { id: id, value: deger, textContent: "", className: "inline-status", hidden: false, disabled: false }; }
  var dom = { "cut-status": eleman("cut-status"), "cut-apply": eleman("cut-apply"), "cut-mode": eleman("cut-mode", o.mod || "ripple") };
  var E = {
    dom: dom,
    ranges: [{ start: 12, end: 13, keep: true }, { start: 15, end: 16, keep: true }],
    S: S,
    KApp: { toast: function (m, t) { c.toast.push([m, t]); } },
    K: {
      // KS_applyCuts uzun sürer: test bitirene kadar bekler (kesim sürerken hedef düğmesine basılabilir)
      call: function (fn, arg) {
        c.call.push([fn, arg]);
        return new Promise(function (r) { c.bekleyen.push(function () { r({ ok: true, newSeq: arg.cloneFirst ? "Vlog — kopya" : "", removed: arg.ranges.length }); }); });
      }
    }
  };
  var f = new Function("E", [
    "var target = " + JSON.stringify(o.hedef || "clone") + ", ranges = E.ranges, Pro;",
    "var KApp = E.KApp, K = E.K, S = E.S;",
    // 3.4: analiz edilmiş seçili klip; silencedetect doğrulaması önizlemeyle aynı, klip yerinde, korunan katman yok
    "var clip = { mediaPath: '/m/klip.mp4', inPoint: 0, outPoint: 20, clipStart: 10, clipEnd: 30 };",
    "var busy = false, uygulaniyor = false, zorlaBosluk = false, farkUyarisi = false, katman = null, secImza = null, analizSeqId = '', altyaziEylemi = null;",
    "function boslukluUygula() {} function videoRippleEngeli() { return false; } function korumaHesapla() { return null; }",
    "async function kesimleriDogrula() { return ranges; } async function klipYeriniDenetle() { return null; }",
    "function onbellekleriBosalt() {} function analiziBirak() {} function kilidiAc() { uygulaniyor = false; }",
    "function el(id) { return E.dom[id] || null; }",
    "function status(m, cls) { var e = el('cut-status'); e.className = 'inline-status' + (cls ? ' ' + cls : ''); e.textContent = m || ''; }",
    "function sesiKapat() {}",
    mcUygulaKod,
    // init'teki hedef düğmesi işleyicisinin yaptığı: target = b.dataset.m
    "return { mcpKes: mcpKes, apply: apply, hedefSec: function (m) { target = m; } };"
  ].join("\n"));
  return { api: f(E), c: c, dom: dom };
}
function birTur() { return new Promise(function (r) { setTimeout(r, 0); }); }

async function main() {
  /* ---- suflo_altyazi_kanala ---- */
  var a = altyaziKur({ uygulananSekans: { s1: 1 } });
  var r = await a.api.mcpKanala();
  ok("zaten uygulanmış sekans: ok:false onay_gerekli, Premiere'e gidilmez", r.ok === false && r.hata === "onay_gerekli" && a.c.call.length === 0, js(r));
  ok("köprü onay durumunu KURMAZ (düğme 'Yine de yeni iz ekle'ye dönmez)", a.api.durum().onayBekleyen === null && !a.c.warnBtn, js(a.api.durum()));
  r = await a.api.mcpKanala();
  ok("ikinci köprü çağrısı da reddedilir: kullanıcı yerine yinelenen iz eklenmez", r.ok === false && r.hata === "onay_gerekli" && a.c.call.length === 0, js(r));
  ok("panelde aynı uyarı gösterilir", a.c.toast.some(function (t) { return t[1] === "warn" && /zaten altyazı uygulandı/.test(t[0]); }), js(a.c.toast));

  var b = altyaziKur({ uygulananSekans: { s1: 1 } });
  var p = await b.api.apply(false);
  ok("panel düğmesi: ilk tık uyarır ve ikinci tık onayını kurar (davranış korunur)", p.ok === false && p.kod === "onay_gerekli" && b.api.durum().onayBekleyen === "s1" && b.c.call.length === 0, js(p));
  r = await b.api.mcpKanala();
  ok("kullanıcı panelde bir kez tıklamış olsa da köprü ikinci tık yerine geçmez", r.ok === false && r.hata === "onay_gerekli" && b.c.call.length === 0, js(r));
  p = await b.api.apply(false);
  ok("kullanıcının ikinci tıkı yeni izi ekler", p.ok === true && b.c.call.some(function (x) { return x[0] === "KS_importSrtAsCaptions"; }), js(p));

  var k = altyaziKur({ kritik: 2 });
  r = await k.api.mcpKanala();
  ok("kritik kalite sorunu: ok:false kalite_onayi, uygulanmaz, onay kurulmaz", r.ok === false && r.hata === "kalite_onayi" && /2 critical/.test(r.mesaj) && k.c.call.length === 0 && k.api.durum().kaliteOnayBekleyen === "", js(r));

  var h = altyaziKur({ cevap: function (fn) { return fn === "KS_projectDir" ? { ok: false } : { ok: false, error: "Aktif sequence yok." }; } });
  r = await h.api.mcpKanala();
  ok("KS_importSrtAsCaptions hatası: ok:false uygulanamadi + Premiere'in hatası", r.ok === false && r.hata === "uygulanamadi" && r.mesaj === "Aktif sequence yok.", js(r));

  var y = altyaziKur({ cevap: function (fn) { return fn === "KS_projectDir" ? { ok: false } : { ok: true, captionTrack: false }; } });
  r = await y.api.mcpKanala();
  ok("SRT alındı ama caption izi oluşmadı: ok:false iz_olusmadi (izde sanılmaz)", r.ok === false && r.hata === "iz_olusmadi", js(r));

  var s = altyaziKur({ cevap: function (fn) { return fn === "KS_projectDir" ? { ok: false } : { ok: true, captionTrack: true }; } });
  // eski hata metni durum satırında kalsa bile başarı başarıdır
  s.dom["cap-status"].className = "inline-status bad";
  s.dom["cap-status"].textContent = "✕ eski hata";
  r = await s.api.mcpKanala();
  ok("başarı: ok:true, iz:true (durum satırındaki eski hata sonucu etkilemez)", r.ok === true && r.iz === true && r.satir === 1 && s.api.durum().uygulanan.s1 > 0, js(r));
  r = await s.api.mcpKanala();
  ok("başarıdan sonra ikinci köprü çağrısı yinelenen iz eklemez", r.ok === false && r.hata === "onay_gerekli" && s.c.call.filter(function (x) { return x[0] === "KS_importSrtAsCaptions"; }).length === 1, js(r));

  /* ---- suflo_altyazi_disari: yazılamayan proje klasörü ---- */
  var PD = function (fn) { return fn === "KS_projectDir" ? { ok: true, dir: "/Users/samet/Gizli Musteri/Proje" } : { ok: true }; };
  var d1 = altyaziKur({ cevap: PD, salt: true });
  r = await d1.api.mcpDisari("srt");
  ok("salt okunur proje klasörü: ok:false yazilamiyor, yol yok, dosya yazılmaz", r.ok === false && r.hata === "yazilamiyor" && !/Gizli|Users|\//.test(r.mesaj) && !d1.c.yazildi, js(r));
  var d2 = altyaziKur({ cevap: PD, yazmaHatasi: true });
  r = await d2.api.mcpDisari("vtt");
  ok("yazma hatası (dolu disk): ok:false yazilamiyor, yalnız dosya adı ve hata kodu", r.ok === false && r.hata === "yazilamiyor" && /suflo-altyazi\.vtt/.test(r.mesaj) && /ENOSPC/.test(r.mesaj) && !/Gizli|Users/.test(r.mesaj), js(r));
  var d3 = altyaziKur({ cevap: PD });
  r = await d3.api.mcpDisari("srt");
  ok("başarı: yalnız dosya adı döner, proje klasörüne yazılır", r.ok === true && r.dosya === "suflo-altyazi.srt" && d3.c.yazildi === path.join("/Users/samet/Gizli Musteri/Proje", "suflo-altyazi.srt"), js(r));

  /* ---- suflo_altyazi_olustur ---- */
  var g = altyaziKur({ dil: "tr", maxlen: "c42x2" });
  r = await g.api.mcpOlustur({ dil: "auto", kapsam: "entire", mod: "satir" });
  ok("dil 'auto' → 'Otomatik' (''), change olayıyla; kapsam düğmesi; 2 satır × 42 korunur", r.ok === true && g.dom["cap-lang"].value === "" && js(g.dom["cap-lang"].olaylar) === '["change"]' &&
    g.c.kapsam === "entire" && g.dom["cap-maxlen"].value === "c42x2" && g.dom["cap-maxlen"].olaylar.length === 0, js([r, g.dom["cap-lang"].value, g.dom["cap-maxlen"].value]));
  ok("go köprü bilgisiyle çağrılır (upsell açmaz)", g.c.go.length === 1 && g.c.go[0] && typeof g.c.go[0].mcp === "object");
  // İnceleme bulgusu: köprü iş kimliğini go() başlamadan veriyordu; başlamadan dönen ret (pro_gerekli) kodunu kaybediyordu
  var basladiSay = 0;
  var gb = altyaziKur({ go: function (opts) { if (opts.mcp.basladi) opts.mcp.basladi(); return true; } });
  r = await gb.api.mcpOlustur({}, { basladi: function () { basladiSay++; } });
  ok("mcpOlustur 'basladi' geri çağrısını go()'ya iletir (iş gerçekten başlayınca çağrılır)", r.ok === true && basladiSay === 1 && typeof gb.c.go[0].mcp.basladi === "function", js(r));
  var goGovde = cap.slice(cap.indexOf("async function go(opts)"), cap.indexOf("function setBusy("));
  var mesgulSira = goGovde.indexOf("busy = true;"), basladiSira = goGovde.indexOf("mcpBilgi.basladi()");
  var ilkAwait = goGovde.indexOf("await ");
  ok("go(): basladi yalnız meşgule geçtikten sonra, ilk await'ten önce; pro_gerekli reddi ondan önce döner",
    mesgulSira > 0 && basladiSira > mesgulSira && (ilkAwait === -1 || basladiSira < ilkAwait) && goGovde.indexOf('mcpBilgi.hata = "pro_gerekli"') < mesgulSira,
    [mesgulSira, basladiSira, ilkAwait].join(","));
  var g2 = altyaziKur({ maxlen: "c42x2" });
  r = await g2.api.mcpOlustur({ mod: "kelime" });
  ok("mod 'kelime': satır düzeninden kelime kelimeye geçer (change olayıyla)", g2.dom["cap-maxlen"].value === "k1" && js(g2.dom["cap-maxlen"].olaylar) === '["change"]');
  var g3 = altyaziKur({ dil: "tr" });
  r = await g3.api.mcpOlustur({ dil: "xx", kapsam: "entire" });
  ok("sunulmayan dil: ok:false dil; kapsam ve seçimler DEĞİŞMEZ, iş başlamaz", r.ok === false && r.hata === "dil" && !g3.c.kapsam && g3.dom["cap-lang"].value === "tr" && g3.c.go.length === 0, js(r));
  var g4 = altyaziKur({ go: function (opts) { opts.mcp.hata = "pro_gerekli"; opts.mcp.mesaj = "needs Pro"; return false; } });
  r = await g4.api.mcpOlustur({});
  ok("go içindeki Pro engeli: pro_gerekli döner", r.ok === false && r.hata === "pro_gerekli" && r.mesaj === "needs Pro", js(r));
  var g5 = altyaziKur({ go: function (opts) { opts.mcp.topluAtlandi = 2; return true; } });
  r = await g5.api.mcpOlustur({});
  ok("ücretsizde çoklu klip: yalnız ilk klip, sonuçta söylenir", r.ok === true && /2 clip/.test(r.not), js(r));

  // go(): köprüde Pro kapıları upsell açmaz (kaynak denetimi)
  var goG = cap.slice(cap.indexOf("async function go(opts)"), cap.indexOf("function setBusy("));
  ok("go(): çevrimdışı çeviri köprüde Pro.izinVar ile, upsell'siz; toplu klipte Pro.gate yalnız panelde",
    /if \(mcpBilgi && typeof Pro !== "undefined" && Pro\.izinVar\) \{/.test(goG) && goG.indexOf("Pro.izinVar(\"offlineTranslate\")") < goG.indexOf('Pro.gate("offlineTranslate"') &&
    /if \(mcpBilgi\) mcpBilgi\.topluAtlandi = sc\.clips\.length - 1;\s*else Pro\.gate\("batch"\);/.test(goG));

  /* ---- suflo_sessizlik_analiz ---- */
  var eski = [{ start: 11, end: 12, keep: true }];
  var m = kesimKur({ sel: null, ranges: eski });
  r = await m.api.mcpAnaliz({ esik_db: -45 });
  ok("klip seçili değil: ok:false klip_yok; önceki aralıklar ve kaydırıcılar değişmez", r.ok === false && r.hata === "klip_yok" && m.api.ranges() === eski && m.dom["cut-noise"].value === "-38" && m.c.run === 0, js(r));
  var mi = kesimKur({ ranges: eski, run: function () { return { iptal: true, code: 1, stderr: "" }; } });
  r = await mi.api.mcpAnaliz({});
  ok("iptal: ok:false iptal; panelin listesi ile modülün aralıkları tutarlı kalır", r.ok === false && r.hata === "iptal" && mi.api.ranges() === eski, js(r));
  var mh = kesimKur({ ranges: eski, run: function () { return { code: 1, stderr: "/Users/a/b.mp4: No such file or directory" }; } });
  r = await mh.api.mcpAnaliz({});
  ok("ffmpeg hatası: ok:false analiz_hatasi, eski aralıklar korunur", r.ok === false && r.hata === "analiz_hatasi" && mh.api.ranges() === eski, js(r));
  var mb = kesimKur({});
  r = await mb.api.mcpAnaliz({ esik_db: -45, pay: 0.1 });
  ok("bulundu: ok:true aralıklar; kaydırıcı değeri + 'input' olayı (etiket güncellenir)", r.ok === true && r.araliklar.length === 1 && r.araliklar[0].baslangic === 12.1 &&
    mb.dom["cut-noise"].value === "-45" && js(mb.dom["cut-noise"].olaylar) === '["input"]' && js(mb.dom["cut-pad"].olaylar) === '["input"]' && mb.dom["cut-minsil"].olaylar.length === 0, js(r));
  var my = kesimKur({ run: function () { return { code: 0, stderr: "" }; } });
  r = await my.api.mcpAnaliz({});
  ok("bu eşikte duraksama yok: ok:true, boş aralık (analiz gerçekten yapıldı)", r.ok === true && r.araliklar.length === 0, js(r));

  /* ---- suflo_sessizlik_kes: kopya sekans açık seçenekle, kullanıcının hedef seçimi ezilmez ---- */
  // İnceleme bulgusu: mcpKes paylaşılan target'ı "clone" yapıp finally'de geri yüklüyordu; kesim (15 dk'ya
  // kadar) sürerken kullanıcının bastığı hedef düğmesi kesim bitince eski değere dönüyor, arayüz başka şey gösteriyordu
  var u = kesimUygulaKur({ hedef: "here", mod: "ripple" });
  var kp = u.api.mcpKes();
  await birTur();
  ok("köprü kesimi: kullanıcı 'Bu sekansta' seçmiş olsa da kopyada (cloneFirst, ripple)", u.c.call.length === 1 && u.c.call[0][1].cloneFirst === true && u.c.call[0][1].removeMode === "ripple", js(u.c.call[0] && u.c.call[0][1]));
  u.api.hedefSec("clone");   // kesim sürerken kullanıcı "Kopya sekansta"ya bastı
  u.c.bekleyen.shift()();
  r = await kp;
  ok("köprü kesimi başarı: kopya sekans adı döner", r.ok === true && r.kopyaSekans === "Vlog — kopya", js(r));
  var ep = u.api.apply({ type: "click" });   // ardından elle "Uygula" (tık olayı cloneFirst taşımaz)
  await birTur();
  ok("kesim sürerken seçilen 'Kopya sekansta' ezilmez: elle 'Uygula' kopyada", u.c.call.length === 2 && u.c.call[1][1].cloneFirst === true, js(u.c.call[1] && u.c.call[1][1]));
  u.c.bekleyen.shift()(); await ep;

  var v = kesimUygulaKur({ hedef: "clone", mod: "gap" });
  kp = v.api.mcpKes();
  await birTur();
  v.api.hedefSec("here");    // kesim sürerken "Bu sekansta"
  v.c.bekleyen.shift()();
  r = await kp;
  ep = v.api.apply({ type: "click" });
  await birTur();
  ok("kesim sürerken seçilen 'Bu sekansta' geri alınmaz: elle 'Uygula' özgün sekansta, seçili yöntemle",
    r.ok === true && v.c.call.length === 2 && v.c.call[1][1].cloneFirst === false && v.c.call[1][1].removeMode === "gap", js(v.c.call[1] && v.c.call[1][1]));
  v.c.bekleyen.shift()(); await ep;
  ok("magiccut: mcpKes paylaşılan target'a yazmaz", !/target\s*=/.test(kes(mc, "async function mcpKes()")));

  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}
main().catch(function (e) { console.log("FAIL beklenmeyen hata " + (e && e.stack)); process.exit(1); });
