/*
 * Suflo Caption Quality
 *
 * Transkripsiyon motorundan bagimsiz, deterministik altyazi kalite katmani.
 * Metni normalize eder, okunabilirlik/zamanlama sorunlarini bulur ve kullanici
 * isterse satirlari guvenli sinirlara getirir. Node testleri ve CEP ayni kodu
 * calistirsin diye UMD olarak yazildi.
 */
(function (root, factory) {
  // Okunabilir satir duzeni (2 satir × 42 kirilimi, karakter butcesiyle bolme): js/caption-layout.js ONCE yuklenir
  var CL = (root && root.SufloCaptionLayout) || null;
  if (!CL && typeof require === "function") { try { CL = require("./caption-layout.js"); } catch (e) { CL = null; } }
  var api = factory(CL);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloCaptionQuality = api;
})(typeof window !== "undefined" ? window : this, function (CL) {
  "use strict";

  var VERSION = 1;

  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : (fallback || 0);
  }

  function copySegment(s) {
    var out = {};
    Object.keys(s || {}).forEach(function (k) { out[k] = s[k]; });
    out.start = num(out.start, 0);
    out.end = num(out.end, out.start);
    out.text = String(out.text || "");
    return out;
  }

  function locale(lang) {
    lang = String(lang || "").toLowerCase();
    return lang === "tr" || lang === "az" ? lang : undefined;
  }

  function capitalize(text, lang) {
    var loc = locale(lang);
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (/[A-Za-z\u00c0-\u024f\u0400-\u04ff]/.test(ch)) {
        var up = loc ? ch.toLocaleUpperCase(loc) : ch.toUpperCase();
        return text.slice(0, i) + up + text.slice(i + 1);
      }
    }
    return text;
  }

  /*
   * Virgül / noktadan sonra eksik boşluk ("geldik.Sonra", "evet,tamam"): yalnız ardından HARF geliyorsa
   * eklenir; sayılar (3,5 / 1.250 / 12.30) zaten harf değildir. Dokunulmayanlar: URL ve e-posta (://, @,
   * www.), alan adı (suflo.app, google.com.tr — bilinen uzantılar), kısaltmalar (Dr., vb., örn.) ve tek
   * harfli kısaltma zinciri (A.B.D., e.g., T.C.).
   */
  var HARF = "A-Za-z\u00C0-\u024F\u0400-\u04FF";
  var KISALTMA = /^(dr|prof|doç|av|uzm|op|sn|vb|vs|örn|bkz|yy|mö|ms|mr|mrs|st|no|etc|vol|inc|ltd|co|jr|sr|vd|bknz|hz|yrd)$/i;
  var UZANTI = /^(com|net|org|app|io|dev|ai|co|tr|me|tv|gov|edu|info|xyz|de|uk|us|eu|ly|gg|so|to|fm|art|shop|store|site|online|blog|tech|link|page)$/;
  var NOKTA_ARDI = new RegExp("([,.])(?=[" + HARF + "])", "g");
  var HARF_KOSUSU_SON = new RegExp("[" + HARF + "]+$");
  var HARF_KOSUSU_BAS = new RegExp("^[" + HARF + "]+");
  function eksikBosluk(sozcuk) {
    if (/:\/\/|@|^www\./i.test(sozcuk)) return sozcuk;
    return sozcuk.replace(NOKTA_ARDI, function (m, p, konum, tum) {
      if (p === ",") return ", ";
      var once = (HARF_KOSUSU_SON.exec(tum.slice(0, konum)) || [""])[0];
      var sonra = (HARF_KOSUSU_BAS.exec(tum.slice(konum + 1)) || [""])[0];
      if (KISALTMA.test(once)) return m;
      // A.B.D. / e.g.: tek harf . tek harf .
      if (once.length === 1 && sonra.length === 1 && (tum.charAt(konum + 2) === "." || tum.charAt(konum - 2) === ".")) return m;
      // alan adı: önünde harf / rakam, ardından bilinen uzantı (sonrası bitiş, /, nokta ya da kesme işaretiyle ek)
      var kalan = tum.slice(konum + 1 + sonra.length);
      if (UZANTI.test(sonra) && /[0-9A-Za-z-]$/.test(tum.slice(0, konum)) && /^(|[\/.'’][\s\S]*|[,;:!?)]*)$/.test(kalan)) return m;
      // yalnız büyük harfle başlayan sözcük yeni cümledir ("geldik.Sonra"); küçük harf ya da tümü büyük
      // harf kalanı dosya uzantısı / teknik addır (Node.js, video.mp4, ASP.NET, C#.NET) — dokunulmaz
      var bas = sonra.charAt(0), govde = sonra.slice(1);
      if (bas === bas.toLowerCase() || (govde && govde === govde.toUpperCase())) return m;
      return ". ";
    });
  }

  // URL / e-posta / alan adı: boşluk ve büyük harf kuralları içine dokunmaz ("https://", "ali@ornek.com")
  var ADRES = /(?:https?:\/\/|www\.)[^\s]+|[^\s@]+@[^\s@]+\.[^\s@]+/gi;
  function adresMi(sozcuk) {
    var m = /^([0-9A-Za-z-]+)\.([a-z]+)/.exec(sozcuk);
    return /^(?:https?:\/\/|www\.)|@/i.test(sozcuk) || !!(m && UZANTI.test(m[2]));
  }

  function normalizeText(text, lang) {
    var adresler = [];
    // satir kirilimi (2 satir × 42, Shift+Enter) tek "\n" olarak kalir; bos satir ve kenar bosluklari gider
    var s = String(text || "")
      .replace(ADRES, function (a) {
        // sondaki cümle noktalaması adresin parçası değil
        var son = /[.,;:!?)]+$/.exec(a);
        var govde = son ? a.slice(0, -son[0].length) : a;
        adresler.push(govde);
        return "\u0000" + (adresler.length - 1) + "\u0000" + (son ? son[0] : "");
      })
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]*\n\s*/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      // saat / oran ("12:30", "16:9") iki nokta kuralına girmez
      .replace(/([!?;:])([^\s!?;:])/g, function (m, a, b, konum, tum) { return a === ":" && /\d/.test(tum.charAt(konum - 1)) && /\d/.test(b) ? m : a + " " + b; })
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/([!?])\1{2,}/g, "$1$1")
      // üç (ve daha çok) nokta tek üç nokta karakteri
      .replace(/\.{3,}/g, "…")
      // özel ad eki: tipografik kesme ("Instagram’da") düz kesmeye; tırnak olarak kullanılan ’ (ardı boşluk) kalır
      .replace(new RegExp("([" + HARF + "0-9])\u2019(?=[" + HARF + "])", "g"), "$1'")
      .trim();
    // virgül / nokta yalnız harften önce boşluk alır (sayı, adres ve kısaltma hariç)
    s = s.split("\n").map(function (satir) {
      return satir.split(" ").map(eksikBosluk).join(" ");
    }).join("\n");
    s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return adresler[Number(i)]; });
    // adresle başlayan satır büyük harfe çevrilmez ("www.suflo.app", "suflo.app'te")
    return adresMi(s.split(/\s/)[0] || "") ? s : capitalize(s, lang);
  }

  function maxChars(options) {
    var m = parseInt(options && options.maxChars, 10);
    return m > 10 ? m : 42;
  }

  // Satir modunun satir sayisi (2 satir × 42 = 2); elle eklenen tek kirilim her modda kabul edilir
  function maxLines(options) {
    var m = parseInt(options && options.maxLines, 10);
    return m >= 2 ? Math.min(3, m) : 1;
  }

  // Metin satir sinirlarina uyuyor mu: her satir maxChars'i asmaz, satir sayisi max(2, maxLines)'i asmaz
  function satirlarUyar(text, options) {
    var satirlar = String(text || "").split("\n");
    if (satirlar.length > Math.max(2, maxLines(options))) return false;
    var limit = maxChars(options);
    for (var i = 0; i < satirlar.length; i++) if (satirlar[i].trim().length > limit) return false;
    return true;
  }

  function issue(code, level, label) {
    return { code: code, level: level, label: label };
  }

  function inspectSegment(s, index, all, options) {
    options = options || {};
    var start = num(s && s.start, 0);
    var end = num(s && s.end, start);
    var text = String(s && s.text || "").trim();
    var dur = Math.max(0, end - start);
    var cps = dur > 0 ? text.length / dur : 0;
    var issues = [];
    var wordMode = !!options.wordMode;
    var next = all && all[index + 1];
    var confidence = s && s.confidence !== undefined ? num(s.confidence, 1) : null;

    if (!text) issues.push(issue("empty", "bad", "Boş satır"));
    if (end <= start) issues.push(issue("time", "bad", "Geçersiz süre"));
    if (next && end > num(next.start, end) + 0.015) issues.push(issue("overlap", "bad", "Sonraki satırla çakışıyor"));
    if (!wordMode && dur > 0 && dur < 0.55) issues.push(issue("short", "warn", "Ekranda çok kısa kalıyor"));
    if (!wordMode && dur > 7.0) issues.push(issue("long-time", "warn", "Ekranda gereğinden uzun kalıyor"));
    if (!wordMode && !satirlarUyar(text, options)) issues.push(issue("long-text", "warn", "Satır çok uzun"));
    if (!wordMode && cps > 22) issues.push(issue("fast", "bad", "Okuma hızı çok yüksek"));
    else if (!wordMode && cps > 18) issues.push(issue("fast", "warn", "Hızlı okunuyor"));
    if (/\s{2,}|\s+[,.!?;:]/.test(String(s && s.text || ""))) issues.push(issue("spacing", "warn", "Boşluk düzeni bozuk"));
    if (/\b([^\s]+)(?:\s+\1){2,}\b/i.test(text)) issues.push(issue("repeat", "warn", "Tekrarlanan kelime"));
    if (confidence !== null && confidence < 0.62) issues.push(issue("confidence", "bad", "Motor bu metinden emin değil"));
    else if (confidence !== null && confidence < 0.78) issues.push(issue("confidence", "warn", "Kontrol edilmesi önerilir"));

    return {
      index: index,
      duration: dur,
      chars: text.length,
      words: text ? text.split(/\s+/).length : 0,
      cps: cps,
      confidence: confidence,
      issues: issues,
      bad: issues.some(function (x) { return x.level === "bad"; }),
      flagged: issues.length > 0
    };
  }

  function analyze(segments, options) {
    var list = segments || [];
    var rows = list.map(function (s, i) { return inspectSegment(s, i, list, options); });
    var bad = 0, warn = 0, words = 0, chars = 0, duration = 0, flagged = 0;
    rows.forEach(function (r) {
      words += r.words;
      chars += r.chars;
      duration += r.duration;
      if (r.flagged) flagged++;
      r.issues.forEach(function (x) { if (x.level === "bad") bad++; else warn++; });
    });
    var score = Math.max(0, Math.min(100, Math.round(100 - bad * 12 - warn * 4 - (list.length ? flagged / list.length * 8 : 0))));
    return {
      version: VERSION,
      rows: rows,
      total: list.length,
      words: words,
      chars: chars,
      duration: duration,
      flagged: flagged,
      bad: bad,
      warn: warn,
      avgCps: duration > 0 ? chars / duration : 0,
      score: score
    };
  }

  function splitText(text, limit) {
    var words = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var out = [], line = "";
    words.forEach(function (w) {
      var candidate = line ? line + " " + w : w;
      if (line && candidate.length > limit) { out.push(line); line = w; }
      else line = candidate;
    });
    if (line) out.push(line);
    return out;
  }

  function splitOverlong(segments, options) {
    var out = [];
    var limit = maxChars(options);
    var ml = maxLines(options);
    (segments || []).forEach(function (source) {
      var s = copySegment(source);
      if (satirlarUyar(s.text, options)) { out.push(s); return; }
      var duz = s.text.replace(/\s+/g, " ").trim();
      var parts;
      if (ml > 1 && CL) {
        // iki satir: butceye (ml × limit) sigan parcalar, her biri dengeli kirilimla
        // kalite motoru: parça ve satır kırılımı altyazının dilinde Türkçe-duyarlı (options.lang)
        parts = CL.karakterleBol({ start: s.start, end: s.end, text: duz }, limit, { maxLines: ml, dil: options && options.lang }).map(function (p) {
          return CL.dengeliSar(p.text, limit, ml, options && options.lang);
        });
      } else {
        parts = splitText(duz, limit);
      }
      if (parts.length <= 1) { if (parts.length) s.text = parts[0]; out.push(s); return; }
      var totalChars = parts.reduce(function (n, p) { return n + Math.max(1, p.length); }, 0);
      var cursor = s.start;
      parts.forEach(function (part, i) {
        var share = Math.max(1, part.length) / totalChars;
        var end = i === parts.length - 1 ? s.end : cursor + Math.max(0.25, (s.end - s.start) * share);
        if (end > s.end) end = s.end;
        var piece = copySegment(s);
        piece.start = cursor;
        piece.end = Math.max(cursor + 0.12, end);
        piece.text = part;
        // ölçülmüş kelimeler (yerel -ojf) parçalara orta noktalarıyla dağılır; boş kalan parçada alan olmaz
        if (s.words && s.words.length) {
          var son = i === parts.length - 1;
          var ic = s.words.filter(function (w) {
            var orta = (num(w.start, 0) + num(w.end, 0)) / 2;
            return (i === 0 || orta >= piece.start) && (son || orta < piece.end);
          });
          if (ic.length) piece.words = ic; else delete piece.words;
        }
        out.push(piece);
        cursor = piece.end;
      });
    });
    return out;
  }

  function fixTiming(segments, options) {
    options = options || {};
    var gap = options.wordMode ? 0.01 : 0.08;
    var minDur = options.wordMode ? 0.08 : 0.60;
    var out = (segments || []).map(copySegment).sort(function (a, b) { return a.start - b.start; });
    out.forEach(function (s, i) {
      s.start = Math.max(0, s.start);
      s.end = Math.max(s.start + minDur, s.end);
      var next = out[i + 1];
      if (next && s.end > next.start - gap) {
        var clipped = next.start - gap;
        s.end = clipped > s.start + (options.wordMode ? 0.04 : 0.25) ? clipped : Math.max(s.start + (options.wordMode ? 0.04 : 0.25), next.start);
      }
    });
    return out;
  }

  function autoFix(segments, options) {
    options = options || {};
    var out = (segments || []).map(function (source) {
      var s = copySegment(source);
      var eski = s.text;
      s.text = normalizeText(s.text, options.lang);
      // eklenen boşluk sözcük sayısını değiştirebilir ("geldik.Sonra"): ölçülmüş kelimeler yeni metne hizalanır
      if (s.text !== eski && s.words && s.words.length && CL && CL.kelimeleriHizala) {
        var hiza = CL.kelimeleriHizala(s.words, s.text, s.start, s.end, options.lang);
        if (hiza.length) s.words = hiza; else delete s.words;
      }
      return s;
    }).filter(function (s) { return !!s.text; });
    if (!options.wordMode) out = splitOverlong(out, options);
    return fixTiming(out, options);
  }

  return {
    version: VERSION,
    normalizeText: normalizeText,
    inspectSegment: inspectSegment,
    analyze: analyze,
    splitText: splitText,
    splitOverlong: splitOverlong,
    fixTiming: fixTiming,
    autoFix: autoFix
  };
});
