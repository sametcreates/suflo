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
  var JUNK = /^(altyaz[ıi]\s*m\.?\s*k\.?|abone olmay[ıi] unutmay[ıi]n)$/i;
  function cleanSegments(segs) {
    var out = [];
    var junk = JUNK;
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

  /*
   * Whisper bazen ayni satira takilip sesin SONUNA kadar onu tekrarlar
   * (art arda kisa, tekrarli ifadelerden sonra; sonuna cogu kez "Altyazi M.K."
   * gibi bir halusinasyon ekler). cleanSegments tekrarlari attigi icin altyazi
   * orada bitmis gibi gorunur. Takilmanin basladigi indeksi doner, yoksa -1:
   *  - transkript (bos/halusinasyon satirlari sayilmadan) en az `enAz` ayni
   *    satirla bitiyorsa, ya da
   *  - herhangi bir yerde `uzun` (varsayilan 8) ya da daha fazla ayni satir
   *    art arda geliyorsa (gercek konusmada bu olmaz).
   * Ortadaki kisa tekrarlar (konusmacinin gercekten tekrar etmesi) sayilmaz.
   */
  function sondaTakilma(segs, enAz, uzun) {
    enAz = enAz || 3;
    uzun = uzun || 8;
    function norm(t) {
      return String(t || "").toLowerCase().replace(/[.,!?;:…]/g, "").replace(/\s+/g, " ").trim();
    }
    var dizi = [];
    for (var i = 0; i < segs.length; i++) {
      var n = norm(segs[i].text);
      if (n && !JUNK.test(n)) dizi.push({ i: i, n: n });
    }
    if (!dizi.length) return -1;
    // uzun dizi: ilk gorulen yer
    for (var a = 0, b; a < dizi.length; a = b) {
      for (b = a + 1; b < dizi.length && dizi[b].n === dizi[a].n; b++) {}
      if (b - a >= uzun) return dizi[a].i;
    }
    // sona kadar suren dizi
    var bas = dizi.length - 1;
    while (bas > 0 && dizi[bas - 1].n === dizi[dizi.length - 1].n) bas--;
    return dizi.length - bas >= enAz ? dizi[bas].i : -1;
  }

  /*
   * Stilli katmanin suresi: son altyazidan sonra 2 sn kuyruk (tam saniyeye
   * yuvarli). Kuyruk sekansin sonunu GECMEZ: Shorts'ta altyazi sekans sonuna
   * kadar gidiyor ve katman sekansi ~3 sn bos goruntuyle uzatiyordu. Altyazilar
   * zaten sekansa sigmiyorsa (kalan bilinmiyor/tutarsiz) dokunulmaz.
   * tamSekans (Marka Kiti logosu): katman sekansin kalanini tam kaplar; kare izgarasina
   * ASAGI yuvarlanir, hicbir zaman sekanstan uzun olmaz. Kalan bilinmiyorsa eski davranis.
   */
  function katmanSuresi(sonBitis, sekansKalan, fps, tamSekans) {
    if (tamSekans && sekansKalan > 0) {
      var tam = fps > 0 ? Math.floor(sekansKalan * fps + 1e-6) / fps : sekansKalan;
      if (tam > 0) return tam;
    }
    var sure = Math.max(1, Math.ceil(sonBitis + 2));
    if (sekansKalan > 0 && sekansKalan >= sonBitis - 0.05 && sure > sekansKalan) {
      // ffmpeg -t'yi bir sonraki kareye tamamlar: kare izgarasina ASAGI yuvarla ki tek kare bile tasmasin
      var kare = fps > 0 ? Math.floor(sekansKalan * fps + 1e-6) / fps : sekansKalan;
      sure = Math.max(sonBitis, kare);
    }
    return sure;
  }

  /*
   * Marka Kiti logolu katmanın uzanabileceği süre (katman başlangıcına göre, sn):
   * "entire" → sekans sonu; "inout" → Out noktası (Out > In ise, sekans sonunu aşmaz);
   * "clip" → 0 (tam süre yok: katman altyazılar boyunca, logosuz katmanla aynı).
   * Altyazılar bu sınırdan taşıyorsa 0 (logosuz hesap kullanılır).
   */
  function logoKatmanKalan(scope, spec, baslangic, sonBitis) {
    if (scope === "clip") return 0;
    spec = spec || {};
    var son = Number(spec.end) || 0;
    if (scope === "inout") {
      var gir = Number(spec.inPoint) || 0, cik = Number(spec.outPoint) || 0;
      if (cik > gir && (son <= 0 || cik < son)) son = cik;
    }
    var kalan = son - (Number(baslangic) || 0);
    return kalan > 0 && kalan >= (Number(sonBitis) || 0) - 0.05 ? kalan : 0;
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
   * Motor çıktısından (sekans zamanına taşınmış) ekrandaki altyazı satırları.
   * captions.js go() ve rehberin hazır örnek transkripti (ornekYukle) AYNI yolu
   * kullanır: iki yol ayrışırsa örnekte görülen satırlar gerçek çıktıyla tutmaz.
   *   lenVal: "k1" kelime kelime · "kc" birikimli · "wN" N kelime · "cN" N karakter
   * Döner: { segments, mode } — mode: "k1" | "kc" | "w" | "plain"
   */
  function segmentleriKur(mapped, lenVal) {
    lenVal = String(lenVal || "c42");
    var liste = (mapped || []).slice();
    if (/^k/.test(lenVal)) {
      // kelime bazında yalnız boş/noktalama filtresi; tekrar filtresi meşru kelimeleri yer
      liste = liste.filter(function (s) {
        return String(s.text || "").replace(/[.,!?;:…]/g, "").trim();
      });
      // bozulmuş kelime zamanı korumasi: 8+ kelime var ama hepsi ayni ana yigilmis
      if (liste.length >= 8) {
        var tMin = liste[0].start, tMax = liste[0].start;
        liste.forEach(function (s) {
          if (s.start < tMin) tMin = s.start;
          if (s.start > tMax) tMax = s.start;
        });
        if (tMax - tMin < 1) {
          var hata = new Error("Motor kelime zamanlarını veremedi (tüm kelimeler aynı anda). " +
            "Ayarlar > Destek'ten günlüğü kopyalayıp bildir; şimdilik satır modunu kullan.");
          hata.ayrinti = liste.length + " kelimenin tümü " + tMin.toFixed(2) + " sn civarında";
          throw hata;
        }
      }
      return lenVal === "kc"
        ? { segments: karaokeCumulative(liste, 4), mode: "kc" }
        : { segments: karaokeWords(liste), mode: "k1" };
    }
    liste = trimOverlongCues(cleanSegments(liste));
    if (/^w\d+$/.test(lenVal)) return { segments: splitWords(liste, parseInt(lenVal.slice(1), 10) || 3), mode: "w" };
    return { segments: splitLong(liste, parseInt(lenVal.slice(1), 10) || 42, 4.5), mode: "plain" };
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
  // Kapanis: yildizdan sonra Turkce ek ("*Instagram*'da") ve/veya noktalama gelebilir
  var KAPANIS = /\*+((?:['’][^\s*'’.,!?;:…»"()\[\]]+)?[.,!?;:…»"'’)\]]*)$/;
  function isaretsiz(w) { return w.replace(/^\*+/, "").replace(KAPANIS, "$1"); }
  function kapaniyor(w) { return KAPANIS.test(w); }
  function stripEmphasis(text) {
    return String(text == null ? "" : text).split(/(\s+)/).map(function (p) {
      return /\S/.test(p) && p.replace(/\*/g, "") ? isaretsiz(p) : p;
    }).join("");
  }
  function hasEmphasis(text) {
    return String(text || "").split(/\s+/).some(function (w) {
      return w.replace(/\*/g, "").length > 0 && (/^\*/.test(w) || kapaniyor(w));
    });
  }

  // Tek kelimeyi isaretle/isareti kaldir (editorde tiklayarak)
  function toggleWord(text, index) {
    var parts = String(text || "").split(/(\s+)/), n = -1;
    for (var i = 0; i < parts.length; i++) {
      if (!/\S/.test(parts[i])) continue;
      n++;
      if (n !== index) continue;
      var p = parts[i];
      var m = /^(.*?)([.,!?;:…»"')\]]*)$/.exec(isaretsiz(p));
      var isaretli = /^\*/.test(p) && kapaniyor(p) && p.replace(/\*/g, "").length > 0;
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
      var bas = dolu && /^\*/.test(w), son = dolu && kapaniyor(w);
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

  /*
   * Satirdaki ilk vurgulu kelime ve tahmini ani (sn): sure, karakter konumuyla
   * orantili paylastirilir (kelime zamani yoksa). Vurgu yoksa null.
   *   seg: { start, end, text }
   */
  function emphasisInfo(seg) {
    var text = String(seg && seg.text || "");
    var mask = emphasisMask(text);
    var k = mask.indexOf(true);
    if (k < 0) return null;
    var kelimeler = stripEmphasis(text).trim().split(/\s+/);
    var once = kelimeler.slice(0, k).join(" ").length + (k ? 1 : 0);
    var toplam = Math.max(1, kelimeler.join(" ").length);
    var a = Number(seg.start) || 0, b = Number(seg.end) || a;
    return {
      kelime: String(kelimeler[k] || "").replace(/[.,!?;:…»"')\]]+$/, ""),
      t: a + (b - a) * (once / toplam),
      adet: mask.filter(Boolean).length
    };
  }

  // Modelin ekleyebildigi markdown kalinligi (**x**) tek yildiza indirgenir
  function normalizeEmphasis(text) {
    return String(text == null ? "" : text).replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
  }

  /*
   * Editor kisayolu: [bas, son) secimine (ya da imlecteki kelimeye) dokunan
   * kelimelerin hepsi vurguluysa vurguyu kaldir, degilse tek *aralik* yap.
   * Doner: { text, caret } (imlec araligin sonunda)
   */
  function toggleRange(text, bas, son) {
    text = String(text || "");
    bas = Math.max(0, Math.min(text.length, Number(bas) || 0));
    son = Math.max(bas, Math.min(text.length, son == null ? bas : Number(son)));
    var parts = text.split(/(\s+)/), konum = 0, secili = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], b = konum, e = konum + p.length;
      konum = e;
      if (!/\S/.test(p)) continue;
      // imlec kelimenin icinde ya da kenarinda / secim kelimeyle kesisiyor
      if (bas === son ? (bas >= b && bas <= e) : (b < son && e > bas)) secili.push(i);
    }
    // yalniz yildiz/noktalamadan olusan "kelime" isaretlenmez (her basista yildiz biriktirirdi)
    secili = secili.filter(function (pi) { return /[^\s*.,!?;:…»«"'’“”()\[\]\-–—]/.test(parts[pi]); });
    if (!secili.length) return { text: text, caret: son };
    if (bas === son && secili.length > 1) secili = [secili[0]];
    var kelimeIdx = [], n = -1;
    for (var k = 0; k < parts.length; k++) { if (/\S/.test(parts[k])) n++; kelimeIdx[k] = n; }
    var mask = emphasisMask(text);
    var hepsi = secili.every(function (pi) { return mask[kelimeIdx[pi]]; });
    var ilk = secili[0], sonP = secili[secili.length - 1];
    if (hepsi) {
      // araligin disinda kalan kisimlar vurgulu kalsin: once tum araligi coz,
      // sonra kalan vurgulu kelimeleri tek tek yeniden isaretle
      var aralikBas = ilk, aralikSon = sonP;
      while (aralikBas > 0 && mask[kelimeIdx[aralikBas]] && !/^\*/.test(parts[aralikBas])) aralikBas -= 2;
      while (aralikSon < parts.length - 1 && mask[kelimeIdx[aralikSon]] && !kapaniyor(parts[aralikSon])) aralikSon += 2;
      for (var q = aralikBas; q <= aralikSon; q += 2) {
        var cozulmus = stripEmphasis(parts[q]);
        parts[q] = (q < ilk || q > sonP) ? toggleWord(cozulmus, 0) : cozulmus;
      }
    } else {
      for (var r = ilk; r <= sonP; r += 2) parts[r] = stripEmphasis(parts[r]);
      var m = /^(.*?)([.,!?;:…»"')\]]*)$/.exec(parts[sonP]);
      if (ilk === sonP) parts[ilk] = m[1] ? "*" + m[1] + "*" + m[2] : parts[ilk];
      else { parts[ilk] = "*" + parts[ilk]; parts[sonP] = m[1] + "*" + m[2]; }
    }
    var caret = 0;
    for (var c = 0; c <= sonP; c++) caret += parts[c].length;
    return { text: parts.join(""), caret: caret };
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

  /*
   * Stilin metin kurali: büyük/küçük harf ve noktalama (captions.js styleText'in saf hâli).
   * o: { kase: "upper" | "lower" | "normal", punct: bool (false: noktalama boşluğa döner),
   *      loc: "tr-TR" | "az" | "ru" | undefined } — tr/az'de i → İ, I → ı.
   * *vurgu* yıldızları noktalama sayılmaz, korunur.
   */
  var NOKTALAMA = /[.,!?;:…»«""()\-–—\u060C\u061F\u061B]/g;   // + Arapça ، ؟ ؛
  function metinStili(t, o) {
    o = o || {};
    var out = String(t == null ? "" : t);
    if (!o.punct) out = out.replace(NOKTALAMA, " ").replace(/\s+/g, " ").trim();
    var loc = o.loc || undefined;
    if (o.kase === "upper") out = loc ? out.toLocaleUpperCase(loc) : out.toUpperCase();
    else if (o.kase === "lower") out = loc ? out.toLocaleLowerCase(loc) : out.toLowerCase();
    return out;
  }

  /*
   * libass'in çizemediği (renkli) emoji: surrogate çiftleri, VS16 ve Emoji_Presentation=Yes
   * olan dar BMP kümesi. ♪ ★ ✓ gibi sıradan semboller emoji sayılmaz (çizilir).
   */
  var EMOJI = /[\uD800-\uDFFF\uFE0F\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u270A\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55]/;
  var EMOJI_TUMU = new RegExp(EMOJI.source + "|\u200D|\u20E3", "g");
  function emojiVar(text) { return EMOJI.test(String(text || "")); }
  // Emojiyi (ve birleştirici ZWJ / tuş kapağı izlerini) at, kalan boşlukları topla
  function emojiSil(text) {
    return String(text == null ? "" : text).replace(EMOJI_TUMU, " ").replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n").trim();
  }

  return {
    metinStili: metinStili,
    emojiVar: emojiVar,
    emojiSil: emojiSil,
    stripEmphasis: stripEmphasis,
    hasEmphasis: hasEmphasis,
    toggleWord: toggleWord,
    toggleRange: toggleRange,
    emphasisMask: emphasisMask,
    reapplyEmphasis: reapplyEmphasis,
    emphasisInfo: emphasisInfo,
    normalizeEmphasis: normalizeEmphasis,
    autoEmphasis: autoEmphasis,
    cleanSegments: cleanSegments,
    sondaTakilma: sondaTakilma,
    katmanSuresi: katmanSuresi,
    logoKatmanKalan: logoKatmanKalan,
    karaokeWords: karaokeWords,
    karaokeCumulative: karaokeCumulative,
    splitWords: splitWords,
    trimOverlongCues: trimOverlongCues,
    splitLong: splitLong,
    segmentleriKur: segmentleriKur,
    parseGlossary: parseGlossary,
    trReplace: trReplace
  };
});
