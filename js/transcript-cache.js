/*
 * Suflo — transkript önbelleği
 *
 * Aynı klibi ikinci kez yazıya dökmek dakikalar sürüyordu: Konuşmadan kes'te
 * politika değiştirmek, kesimden sonra kalan alt klibi yeniden incelemek ya da
 * altyazıdan sonra kesime geçmek hep yeniden transkripsiyon demekti.
 *
 *   - Kelimeler KAYNAK zamanında saklanır (klip başlangıcı/hız eşlemesinden önce),
 *     USER_DATA/Kesit/transcripts/ altında, girdi başına bir JSON.
 *   - Anahtar: sha1(mediaPath, boyut, mtimeMs, inPoint, dur, dil, motor+model, istem türü).
 *   - get(): önce birebir anahtar, sonra "kapsayan" girdi (aynı ortam, boyut ve
 *     mtime; aralığı isteneni içine alıyor): kesilip kaydırılarak döner. Kesimden
 *     sonra kalan alt klipler de önbellekten gelir.
 *   - LRU: 50 girdi ya da 100 MB (index.json lastUsed).
 *   - Yazımlar atomik (tmp + rename). Bozuk/eksik dizin = ıska; asla fırlatmaz.
 *   - Girdi gövdesi v2: satırlar + ölçülmüş kelimeleri (yerel -ojf) { v: 2, lang, segments:
 *     [{ start, end, text, confidence, words: [{ text, start, end, p }] }] }. v1 gövdesi
 *     ({ v: 1, words }) geçerli kalır: öğeleri kelimesiz satır sayılır. get() ikisinde de
 *     düz kelime listesi (words) ve satırları (segments) döner; satır ve kelime kelime
 *     altyazı aynı girdiyi paylaşır.
 *
 * Saf çekirdek: fs, path, crypto dışarıdan verilir (panel K.fs ve require('crypto')
 * bağlar). Yalnız Node 12 API'leri (klasör silme yerine dosya dosya unlink).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloTranscriptCache = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var SURUM = 1;          // index.json biçimi (değişmedi: eski girdiler görünür kalır)
  var GOVDE_SURUM = 2;    // girdi gövdesi: 2 = satır + ölçülmüş kelime, 1 = düz liste
  var EPS = 0.002;

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }
  function dizi(x) { return Object.prototype.toString.call(x) === "[object Array]"; }
  function guven(x) {
    if (x === null || x === undefined || x === "") return null;
    var n = Number(x);
    return isFinite(n) ? n : null;
  }
  // { text, start, end, p } — kaynak zamanına (+ofs) taşınmış, geçersiz zaman atılır
  function kelimeYaz(w, ofs) {
    if (!w || !isFinite(Number(w.start)) || !isFinite(Number(w.end))) return null;
    // ms'ye yuvarlanır: kelime başına 17 haneli kayan nokta girdiyi şişirmesin
    var x = { text: String(w.text || ""), start: Math.round((ofs + Number(w.start)) * 1000) / 1000, end: Math.round((ofs + Number(w.end)) * 1000) / 1000 };
    var p = guven(w.p);
    if (p !== null) x.p = p;
    return x;
  }

  function create(o) {
    o = o || {};
    var fs = o.fs, path = o.path, crypto = o.crypto, dir = o.dir;
    var maxEntries = o.maxEntries > 0 ? o.maxEntries : 50;
    var maxBytes = o.maxBytes > 0 ? o.maxBytes : 100 * 1024 * 1024;
    var now = typeof o.now === "function" ? o.now : function () { return Date.now(); };
    var tmpSay = 0;
    var hazir = !!(fs && path && crypto && dir);

    function indexPath() { return path.join(dir, "index.json"); }

    function klasor() {
      try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); return true; } catch (e) { return false; }
    }

    function atomikYaz(hedef, metin) {
      var tmp = hedef + ".tmp" + process_pid() + "_" + (tmpSay++);
      fs.writeFileSync(tmp, metin, "utf8");
      try { fs.renameSync(tmp, hedef); }
      catch (e) {
        // Windows: hedef açıksa rename düşebilir — eskisini silip bir kez daha dene
        try { fs.unlinkSync(hedef); } catch (e2) {}
        try { fs.renameSync(tmp, hedef); } catch (e3) { try { fs.unlinkSync(tmp); } catch (e4) {} throw e3; }
      }
    }
    function process_pid() {
      try { return typeof process !== "undefined" && process.pid ? process.pid : 0; } catch (e) { return 0; }
    }

    function dizinOku() {
      try {
        var j = JSON.parse(fs.readFileSync(indexPath(), "utf8"));
        if (!j || j.v !== SURUM || !Array.isArray(j.entries)) return { v: SURUM, entries: [] };
        j.entries = j.entries.filter(function (e) { return e && typeof e.key === "string" && /^[0-9a-f]{40}$/.test(e.key); });
        return j;
      } catch (e) { return { v: SURUM, entries: [] }; }
    }
    function dizinYaz(ix) {
      try { if (klasor()) atomikYaz(indexPath(), JSON.stringify(ix)); return true; } catch (e) { return false; }
    }

    function key(m) {
      var parca = [
        String(m.mediaPath || ""), num(m.size), num(m.mtimeMs),
        num(m.inPoint).toFixed(3), num(m.dur).toFixed(3),
        String(m.lang || "auto"), String(m.engine || ""), String(m.prompt || "")
      ];
      return crypto.createHash("sha1").update(JSON.stringify(parca), "utf8").digest("hex");
    }

    function ayniOrtam(e, m) {
      return e.mediaPath === String(m.mediaPath || "") && num(e.size) === num(m.size) &&
        num(e.mtimeMs) === num(m.mtimeMs) && String(e.lang) === String(m.lang || "auto") &&
        String(e.engine) === String(m.engine || "");
    }

    // v2: segments; v1: words (öğeleri kelimesiz satır olarak okunur)
    function girdiOku(e) {
      try {
        var d = JSON.parse(fs.readFileSync(path.join(dir, e.key + ".json"), "utf8"));
        if (!d) return null;
        if (dizi(d.segments)) return d;
        if (dizi(d.words)) return { v: 1, lang: d.lang, segments: d.words };
        return null;
      } catch (er) { return null; }
    }

    /*
     * Kaynak-mutlak satırları istenen [inPoint, inPoint+dur] aralığına kes, inPoint'e
     * göre kaydır. Satır orta noktasıyla, kelimeler KENDİ orta noktalarıyla seçilir:
     * kapsayan girdide aralığa taşan uzun satırın içerideki kelimeleri kaybolmaz.
     * Döner: { segments, words } — words düz liste (satırın kelimesi yoksa satırın kendisi).
     */
    function kes(d, inPoint, dur) {
      var a = num(inPoint), b = a + num(dur);
      function icinde(s, e) { var orta = (s + e) / 2; return orta >= a - EPS && orta <= b + EPS; }
      function kaydir(s, e) { return { start: Math.max(0, s - a), end: Math.max(0, Math.min(b, e) - a) }; }
      var segments = [], words = [];
      d.segments.forEach(function (g) {
        if (!g) return;
        var s = num(g.start), e = num(g.end);
        var kel = [];
        if (dizi(g.words)) {
          g.words.forEach(function (w) {
            if (!w) return;
            var ws = num(w.start), we = num(w.end);
            if (!icinde(ws, we)) return;
            var z = kaydir(ws, we);
            var y = { text: String(w.text || ""), start: z.start, end: z.end };
            var p = guven(w.p);
            if (p !== null) y.p = p;
            kel.push(y);
            var duz = { start: z.start, end: z.end, text: y.text };
            if (p !== null) duz.confidence = p;
            words.push(duz);
          });
        }
        var satirIcinde = icinde(s, e);
        var kelimesiz = !dizi(g.words) || !g.words.length;
        if (kelimesiz && satirIcinde) {
          var z2 = kaydir(s, e);
          var x = { start: z2.start, end: z2.end, text: String(g.text || "") };
          if (guven(g.confidence) !== null) x.confidence = Number(g.confidence);
          words.push(x);
        }
        if (satirIcinde || kel.length) {
          var z3 = kaydir(Math.max(s, a), e);
          var sg = { start: z3.start, end: z3.end, text: String(g.text || "") };
          if (guven(g.confidence) !== null) sg.confidence = Number(g.confidence);
          if (kel.length) sg.words = kel;
          segments.push(sg);
        }
      });
      words.sort(function (x, y) { return x.start - y.start; });
      return { segments: segments, words: words };
    }

    /*
     * get(meta, { prompts: ["dolgu", "altyazi"] })
     * Doner: null | { words (düz kelime listesi, meta.inPoint'e göreli), segments (satırlar,
     *        ölçülmüş kelimeleriyle), lang, prompt, covering }
     * prompts verilmezse yalnız meta.prompt aranır. Sıra: her istem için önce
     * birebir anahtar, sonra kapsayan girdi.
     */
    function get(meta, opts) {
      if (!hazir || !meta || !meta.mediaPath) return null;
      try {
        var istemler = (opts && opts.prompts && opts.prompts.length) ? opts.prompts : [meta.prompt || ""];
        var ix = dizinOku();
        if (!ix.entries.length) return null;
        for (var p = 0; p < istemler.length; p++) {
          var m = {};
          for (var k in meta) if (Object.prototype.hasOwnProperty.call(meta, k)) m[k] = meta[k];
          m.prompt = istemler[p];
          var anahtar = key(m), bulunan = null, kapsayan = false;
          for (var i = 0; i < ix.entries.length; i++) if (ix.entries[i].key === anahtar) { bulunan = ix.entries[i]; break; }
          if (!bulunan) {
            var a = num(m.inPoint), b = a + num(m.dur), enDar = null;
            ix.entries.forEach(function (e) {
              if (String(e.prompt) !== String(m.prompt) || !ayniOrtam(e, m)) return;
              if (num(e.inPoint) <= a + EPS && num(e.inPoint) + num(e.dur) >= b - EPS) {
                if (!enDar || num(e.dur) < num(enDar.dur)) enDar = e;
              }
            });
            if (enDar) { bulunan = enDar; kapsayan = true; }
          }
          if (!bulunan) continue;
          var d = girdiOku(bulunan);
          if (!d) continue;
          bulunan.lastUsed = now();
          dizinYaz(ix);
          var kesik = kes(d, m.inPoint, m.dur);
          return { words: kesik.words, segments: kesik.segments, lang: d.lang || "", prompt: m.prompt, covering: kapsayan };
        }
      } catch (e) {}
      return null;
    }

    /*
     * put(meta, { segments | words (meta.inPoint'e göreli kaynak saniyesi), lang })
     *   segments: satırlar, her biri isteğe bağlı words: [{ text, start, end, p }] (yerel -ojf)
     *   words:    eski biçim — düz liste (kelimesiz satır olarak saklanır)
     * Doner: true / false (asla fırlatmaz)
     */
    function put(meta, data) {
      var kaynak = data && (dizi(data.segments) ? data.segments : (dizi(data.words) ? data.words : null));
      if (!hazir || !meta || !meta.mediaPath || !kaynak) return false;
      try {
        if (!klasor()) return false;
        var ip = num(meta.inPoint);
        var segments = kaynak.filter(function (w) {
          return w && isFinite(Number(w.start)) && isFinite(Number(w.end));
        }).map(function (w) {
          var x = { start: ip + Number(w.start), end: ip + Number(w.end), text: String(w.text || "") };
          if (w.confidence != null && isFinite(Number(w.confidence))) x.confidence = Number(w.confidence);
          if (dizi(w.words) && w.words.length) {
            var kel = w.words.map(function (k) { return kelimeYaz(k, ip); }).filter(Boolean);
            if (kel.length) x.words = kel;
          }
          return x;
        });
        var anahtar = key(meta);
        var govde = JSON.stringify({ v: GOVDE_SURUM, lang: String(data.lang || ""), segments: segments });
        atomikYaz(path.join(dir, anahtar + ".json"), govde);
        var ix = dizinOku();
        ix.entries = ix.entries.filter(function (e) { return e.key !== anahtar; });
        ix.entries.push({
          key: anahtar, mediaPath: String(meta.mediaPath), size: num(meta.size), mtimeMs: num(meta.mtimeMs),
          inPoint: ip, dur: num(meta.dur), lang: String(meta.lang || "auto"), engine: String(meta.engine || ""),
          prompt: String(meta.prompt || ""), bytes: Buffer_byteLength(govde), lastUsed: now()
        });
        budama(ix);
        return dizinYaz(ix);
      } catch (e) { return false; }
    }

    function Buffer_byteLength(s) {
      try { if (typeof Buffer !== "undefined") return Buffer.byteLength(s, "utf8"); } catch (e) {}
      return String(s).length * 2;
    }

    // LRU: en eski kullanılandan başlayarak sil
    function budama(ix) {
      ix.entries.sort(function (a, b) { return num(a.lastUsed) - num(b.lastUsed); });
      var toplam = 0;
      ix.entries.forEach(function (e) { toplam += num(e.bytes); });
      while (ix.entries.length > maxEntries || (toplam > maxBytes && ix.entries.length > 1)) {
        var e = ix.entries.shift();
        toplam -= num(e.bytes);
        try { fs.unlinkSync(path.join(dir, e.key + ".json")); } catch (er) {}
      }
    }

    function clear() {
      if (!hazir) return 0;
      var n = 0;
      try {
        fs.readdirSync(dir).forEach(function (f) {
          try { fs.unlinkSync(path.join(dir, f)); n++; } catch (e) {}
        });
      } catch (e2) {}
      return n;
    }

    function stats() {
      var ix = hazir ? dizinOku() : { entries: [] };
      var bytes = 0;
      ix.entries.forEach(function (e) { bytes += num(e.bytes); });
      return { entries: ix.entries.length, bytes: bytes };
    }

    return { key: key, get: get, put: put, clear: clear, stats: stats, dir: dir };
  }

  return { create: create };
});
