/*
 * Suflo Caption Text
 *
 * Altyazi metni ve zamanlamasi uzerinde calisan saf (DOM'suz, durumsuz)
 * islevler: halusinasyon temizligi, karaoke, bolme, terim sozlugu.
 * captions.js bunlari kullanir; Node testleri ayni kodu dogrudan calistirir.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloCaptionText = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // Whisper'ın bilinen halüsinasyonlarını süz
  function cleanSegments(segs) {
    var out = [];
    var junk = /^(altyaz[ıi]\s*m\.?\s*k\.?|abone olmay[ıi] unutmay[ıi]n)$/i;
    var lastText = "", repeat = 0;
    for (var i = 0; i < segs.length; i++) {
      var t = segs[i].text;
      if (!t) continue;
      var norm = t.toLowerCase().replace(/[.,!?;:…]/g, "").replace(/\s+/g, " ").trim();
      if (!norm) continue; // sadece noktalamadan olusan segment ("...")
      if (junk.test(norm)) continue;
      if (norm === lastText) {
        repeat++;
        if (repeat >= 2) continue; // 3+ kez aynı satır: takılma, at
      } else { repeat = 0; }
      lastText = norm;
      out.push(segs[i]);
    }
    return out;
  }

  // kelime cue'ları: her kelime kendi zamanında, bir sonrakiyle çakışmadan
  function karaokeWords(words) {
    var out = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var end = Math.max(w.end, w.start + 0.12);
      if (words[i + 1] && end > words[i + 1].start) end = words[i + 1].start;
      if (end <= w.start) end = w.start + 0.05;
      out.push({ start: w.start, end: end, text: w.text, confidence: w.confidence });
    }
    return out;
  }

  // birikimli karaoke: satır kelime kelime dolar (n kelimede ya da uzun boşlukta sıfırlanır)
  function karaokeCumulative(words, n) {
    var out = [];
    var line = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var prev = words[i - 1];
      if (line.length >= n || (prev && w.start - prev.end > 1.2)) line = [];
      line.push(w.text);
      var end = Math.max(w.end, w.start + 0.12);
      if (words[i + 1] && end > words[i + 1].start) end = words[i + 1].start;
      if (end <= w.start) end = w.start + 0.05;
      out.push({ start: w.start, end: end, text: line.join(" "), confidence: w.confidence });
    }
    return out;
  }

  // kelime modu: her satırda en fazla n kelime, süre orantılı bölünür
  function splitWords(segs, n) {
    var out = [];
    segs.forEach(function (s) {
      var words = String(s.text || "").trim().split(/\s+/).filter(Boolean);
      if (!words.length) return;
      var pieces = Math.ceil(words.length / n);
      var dur = s.end - s.start;
      var step = dur / pieces;
      for (var i = 0; i < pieces; i++) {
        out.push({
          start: s.start + step * i,
          end: s.start + step * (i + 1),
          text: words.slice(i * n, (i + 1) * n).join(" "),
          confidence: s.confidence
        });
      }
    });
    return out;
  }

  /*
   * Whisper (özellikle VAD açıkken) bir cue'nun sonunu sonraki konuşma başlayana
   * kadar uzatabiliyor: 3 saniyelik cümle 17 saniye ekranda kalıyor.
   * Metnin okunması için gereken makul süreyi aşan sonları kırp.
   */
  function trimOverlongCues(segs) {
    var GAP = 0.12;
    return segs.map(function (s, i) {
      var chars = s.text.length;
      // ~13 karakter/sn okuma hızı + 0.7 sn tampon, en az 1.2 sn
      var makul = Math.max(1.2, chars / 13 + 0.7);
      var dur = s.end - s.start;
      if (dur > makul * 1.8) {
        var yeni = s.start + makul;
        var next = segs[i + 1];
        if (next && yeni > next.start - GAP) yeni = Math.max(s.start + 0.5, next.start - GAP);
        return { start: s.start, end: yeni, text: s.text, confidence: s.confidence };
      }
      return s;
    });
  }

  function splitLong(segs, maxChars, maxDur) {
    var out = [];
    segs.forEach(function (s) {
      var text = String(s.text || "").trim();
      var dur = s.end - s.start;
      if (!text) return;
      if (text.length <= maxChars && dur <= maxDur) { out.push(s); return; }
      var pieces = Math.ceil(Math.max(text.length / maxChars, dur / maxDur));
      var words = text.split(/\s+/);
      var per = Math.ceil(words.length / pieces);
      var acc = [];
      for (var i = 0; i < pieces; i++) acc.push(words.slice(i * per, (i + 1) * per).join(" "));
      acc = acc.filter(Boolean);
      var step = dur / acc.length;
      acc.forEach(function (w, i) {
        out.push({ start: s.start + step * i, end: s.start + step * (i + 1), text: w, confidence: s.confidence });
      });
    });
    return out;
  }

  /*
   * Whisper Türkçe'de marka/kişi adlarını ve jargonu tutarlı biçimde yanlış yazar.
   * Sözlük transkripsiyon SONRASI çalışır — dil algılamayı ve çıktıyı bozmaz,
   * deterministiktir, kullanıcı sonucu görüp kuralı düzeltebilir.
   * Biçim: her satır "yanlış => doğru"
   */
  function parseGlossary(text) {
    var out = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      var m = line.split("=>");
      if (m.length !== 2) return;
      var from = m[0].trim(), to = m[1].trim();
      if (from) out.push({ from: from, to: to });
    });
    return out;
  }

  /*
   * Harf/rakam sınırı testi. Unicode özellik kaçışları (\p{L}) Chromium 64+ ister; REGEX
   * LİTERALİ olarak yazılırsa eski CEF'te ayrıştırma anında SyntaxError verir ve tüm modül
   * düşer (panel bomboş açılır). new RegExp ile kurulunca hata yakalanabilir hale gelir.
   */
  var HARF = (function () {
    try { return new RegExp("[\\p{L}\\p{N}]", "u"); }
    catch (eU) {
      // eski CEF yedegi: carpma (00D7) ve bolme (00F7) isaretleri dislanir
      return new RegExp("[0-9A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F" +
        "\\u0370-\\u1FFF\\u2C00-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD]");
    }
  })();

  // Türkçe-duyarlı kelime bazlı değiştirme (İ/ı eşleşmesi doğru çalışır)
  function trReplace(text, from, to, loc) {
    loc = loc || "tr";
    var lowText = text.toLocaleLowerCase(loc);
    var lowFrom = from.toLocaleLowerCase(loc);
    if (lowText.indexOf(lowFrom) === -1) return text;
    var out = "";
    var i = 0;
    var harf = HARF;
    while (i < text.length) {
      if (lowText.startsWith(lowFrom, i)) {
        var oncesi = i === 0 ? "" : text[i - 1];
        var sonrasi = text[i + from.length] || "";
        var sinirOK = (!oncesi || !harf.test(oncesi)) && (!sonrasi || !harf.test(sonrasi));
        if (sinirOK) { out += to; i += from.length; continue; }
      }
      out += text[i];
      i++;
    }
    return out;
  }

  return {
    cleanSegments: cleanSegments,
    karaokeWords: karaokeWords,
    karaokeCumulative: karaokeCumulative,
    splitWords: splitWords,
    trimOverlongCues: trimOverlongCues,
    splitLong: splitLong,
    parseGlossary: parseGlossary,
    trReplace: trReplace
  };
});
