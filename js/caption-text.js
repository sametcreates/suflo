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

  /*
   * Anahtar kelime vurgusu (*kelime*). Suflo Stilleri isaretli kelimeyi vurgu
   * renginde cizer; SRT/VTT/normal caption izi gibi ciktilarda isaret kaldirilir.
   */
  // Kapanis yildizindan sonra noktalama gelebilir: "*100 TL*." (otomatik vurgunun bicimi)
  var VURGU_UC = /^\*+|\*+(?=[.,!?;:…»"')\]]*$)/g;
  function stripEmphasis(text) {
    return String(text == null ? "" : text).split(/(\s+)/).map(function (p) {
      return /\S/.test(p) && p.replace(/\*/g, "") ? p.replace(VURGU_UC, "") : p;
    }).join("");
  }
  function hasEmphasis(text) { return /(^|\s)\*\S|\S\*[.,!?;:…»"')\]]*(\s|$)/.test(String(text || "")); }

  // Tek kelimeyi isaretle/isareti kaldir (editorde tiklayarak)
  function toggleWord(text, index) {
    var parts = String(text || "").split(/(\s+)/), n = -1;
    for (var i = 0; i < parts.length; i++) {
      if (!/\S/.test(parts[i])) continue;
      n++;
      if (n !== index) continue;
      var p = parts[i];
      var m = /^(.*?)([.,!?;:…»"')\]]*)$/.exec(p.replace(VURGU_UC, ""));
      var isaretli = /^\*/.test(p) && /\*[.,!?;:…»"')\]]*$/.test(p) && p.replace(/\*/g, "").length > 0;
      // isaretliyse kaldir; degilse "*kelime*." (noktalama disarida) — tek bicim
      parts[i] = isaretli ? m[1] + m[2] : (m[1] ? "*" + m[1] + "*" + m[2] : p);
      break;
    }
    return parts.join("");
  }

  // Kelime bazinda isaret durumu: [bool] (cok kelimeli *a b* araliklari dahil)
  function emphasisMask(text) {
    var acik = false;
    return String(text || "").trim().split(/\s+/).filter(Boolean).map(function (w) {
      var dolu = w.replace(/\*/g, "").length > 0;
      var bas = dolu && /^\*/.test(w), son = dolu && /\*[.,!?;:…»"')\]]*$/.test(w);
      var v = acik || bas;
      if (bas && !son) acik = true;
      if (son) acik = false;
      return v;
    });
  }

  /*
   * AI duzeltmesinden donen (isaretsiz) metne eski satirin isaretlerini
   * kelime sirasiyla geri koy. Kelime sayisi degistiyse null (cagiran eskiyi korur).
   */
  function reapplyEmphasis(orig, yeni) {
    var mask = emphasisMask(orig);
    if (!mask.some(Boolean)) return yeni;
    var parts = String(yeni || "").split(/(\s+)/), n = -1;
    var kelime = parts.filter(function (p) { return /\S/.test(p); }).length;
    if (kelime !== mask.length) return null;
    for (var i = 0; i < parts.length; i++) {
      if (!/\S/.test(parts[i])) continue;
      n++;
      if (mask[n]) parts[i] = toggleWord(stripEmphasis(parts[i]), 0);
    }
    return parts.join("");
  }

  // Modelin ekleyebildigi markdown kalinligi (**x**) tek yildiza indirgenir
  function normalizeEmphasis(text) {
    return String(text == null ? "" : text).replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
  }

  var VURGU_DURAK = /^(ve|ile|bir|bu|şu|o|da|de|ki|mi|mı|mu|mü|için|ama|fakat|çünkü|gibi|daha|çok|en|hem|ya|yani|şey|işte|zaten|sonra|önce|kadar|olarak|olan|diye|bunu|şunu|onu|bunun|benim|senin|bizim|onların|the|a|an|and|or|of|to|in|on|is|are|was|that|this|with|for|it|you|your|they|have|just|really|about|because|there|their|what|which|would|could|should)$/i;
  var BIRIM = /^(%|tl|lira|dolar|euro|avro|\$|€|₺|bin|milyon|milyar|yüzde|percent|k|m|dk|sn|saat|gün|yıl|ay|kg|km|x)$/i;

  /*
   * Otomatik vurgu: sayilar (birimiyle: "100 TL", "%50", "3 milyon") her zaman;
   * sayisiz ve 4+ kelimelik satirda en anlamli tek kelime. Elle isaretlenmis
   * satirlara dokunulmaz. Doner: yeni metin (degisiklik yoksa ayni metin).
   */
  function autoEmphasis(text) {
    var t = String(text || "");
    if (!t.trim() || hasEmphasis(t)) return t;
    var parts = t.split(/(\s+)/);
    var idx = [];
    for (var i = 0; i < parts.length; i++) if (/\S/.test(parts[i])) idx.push(i);
    var isaret = {};
    idx.forEach(function (pi, k) {
      if (/\d/.test(parts[pi])) {
        isaret[k] = true;
        var sonraki = idx[k + 1];
        var temiz = sonraki != null ? parts[sonraki].replace(/[.,!?;:…]+$/, "") : "";
        if (sonraki != null && BIRIM.test(temiz)) isaret[k + 1] = true;
      }
    });
    if (!Object.keys(isaret).length && idx.length >= 4) {
      var en = -1, puan = 0;
      idx.forEach(function (pi, k) {
        var w = parts[pi].replace(/[^0-9A-Za-z\u00C0-\u024F\u0400-\u04FF]/g, "");
        if (VURGU_DURAK.test(w) || w.length < 5) return;
        var p = w.length + (/[!?]$/.test(parts[pi]) ? 3 : 0);
        if (p > puan) { puan = p; en = k; }
      });
      if (en >= 0) isaret[en] = true;
    }
    var ks = Object.keys(isaret).map(Number).sort(function (a, b) { return a - b; });
    if (!ks.length) return t;
    // ardisik isaretli kelimeler tek * ... * araliginda birlesir
    var gruplar = [];
    ks.forEach(function (k) {
      var g = gruplar[gruplar.length - 1];
      if (g && g[1] === k - 1) g[1] = k; else gruplar.push([k, k]);
    });
    gruplar.forEach(function (g) {
      var a = idx[g[0]], b = idx[g[1]];
      // sondaki noktalama yildizin disinda kalsin: "*100 TL*."
      var m = /^(.*?)([.,!?;:…]*)$/.exec(parts[b]);
      parts[a] = "*" + parts[a];
      if (a === b) m = /^(.*?)([.,!?;:…]*)$/.exec(parts[a]);
      parts[b] = m[1] + "*" + m[2];
    });
    return parts.join("");
  }

  return {
    stripEmphasis: stripEmphasis,
    hasEmphasis: hasEmphasis,
    toggleWord: toggleWord,
    emphasisMask: emphasisMask,
    reapplyEmphasis: reapplyEmphasis,
    normalizeEmphasis: normalizeEmphasis,
    autoEmphasis: autoEmphasis,
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
