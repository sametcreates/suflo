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

  var SURUM = 1;
  var EPS = 0.002;

  function num(x) { var n = Number(x); return isFinite(n) ? n : 0; }

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

    function girdiOku(e) {
      try {
        var d = JSON.parse(fs.readFileSync(path.join(dir, e.key + ".json"), "utf8"));
        if (!d || !Array.isArray(d.words)) return null;
        return d;
      } catch (er) { return null; }
    }

    // Kaynak-mutlak kelimeleri istenen [inPoint, inPoint+dur] aralığına kes, inPoint'e göre kaydır
    function kes(d, inPoint, dur) {
      var a = num(inPoint), b = a + num(dur);
      var out = [];
      d.words.forEach(function (w) {
        var s = num(w.start), e = num(w.end);
        var orta = (s + e) / 2;
        if (orta < a - EPS || orta > b + EPS) return;
        var x = { start: Math.max(0, s - a), end: Math.max(0, Math.min(b, e) - a), text: String(w.text || "") };
        if (w.confidence != null && isFinite(Number(w.confidence))) x.confidence = Number(w.confidence);
        out.push(x);
      });
      return out;
    }

    /*
     * get(meta, { prompts: ["dolgu", "altyazi"] })
     * Doner: null | { words (meta.inPoint'e göreli), lang, prompt, covering }
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
          return { words: kes(d, m.inPoint, m.dur), lang: d.lang || "", prompt: m.prompt, covering: kapsayan };
        }
      } catch (e) {}
      return null;
    }

    /*
     * put(meta, { words (meta.inPoint'e göreli kaynak saniyesi), lang })
     * Doner: true / false (asla fırlatmaz)
     */
    function put(meta, data) {
      if (!hazir || !meta || !meta.mediaPath || !data || !Array.isArray(data.words)) return false;
      try {
        if (!klasor()) return false;
        var ip = num(meta.inPoint);
        var words = data.words.filter(function (w) {
          return w && isFinite(Number(w.start)) && isFinite(Number(w.end));
        }).map(function (w) {
          var x = { start: ip + Number(w.start), end: ip + Number(w.end), text: String(w.text || "") };
          if (w.confidence != null && isFinite(Number(w.confidence))) x.confidence = Number(w.confidence);
          return x;
        });
        var anahtar = key(meta);
        var govde = JSON.stringify({ v: SURUM, lang: String(data.lang || ""), words: words });
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
