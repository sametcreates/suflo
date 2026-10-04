/*
 * Suflo Text Cut — metinden kurgu
 *
 * Kelime zamanli transkriptten kesim araliklari uretir: kullanici bir kelimeyi
 * silerse videodan da o kisim kesilir. Dolgu seslerini (ııı, eee, hmm),
 * kekeme tekrarlarini ("ben ben") ve uzun duraksamalari otomatik isaretler.
 *
 * Saf ve durumsuz: DOM'a ve Premiere'e dokunmaz. Uretilen araliklar
 * KS_applyCuts'a aynen verilir (sequence zamani, saniye).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloTextCut = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /*
   * Kesin dolgu: anlam tasimayan duraksama sesleri. Uzatilmis bicimleri
   * ("ııııı", "eeee", "hmmm") harf tekrari indirgenerek yakalanir.
   * Yumusak dolgu: cumlede anlamli da olabilen sozcukler ("yani", "şey");
   * varsayilan olarak isaretlenmez, kullanici acarsa isaretlenir.
   */
  var DOLGU = {
    tr: {
      kesin: ["ı", "ım", "e", "em", "a", "ah", "eh", "hm", "m", "ıh", "öh", "ö", "ee", "ıı", "aa"],
      yumusak: ["şey", "yani", "işte", "hani", "falan", "ee yani"]
    },
    az: {
      kesin: ["ı", "ım", "e", "em", "a", "hm", "m", "ee"],
      yumusak: ["yəni", "şey", "hə"]
    },
    en: {
      kesin: ["um", "uh", "er", "erm", "ah", "hm", "m", "mm", "uhm"],
      yumusak: ["like", "you know", "i mean", "basically", "actually", "so"]
    },
    ru: {
      // "а" Rusca'da cok yaygin baglac ("ve/ama"): kesin dolgu degil, ara soz
      kesin: ["э", "м", "эм", "ээ", "хм"],
      yumusak: ["а", "ну", "типа", "как бы", "короче", "вот"]
    },
    // Tek harfli "a", "e" bu dillerde gercek sozcuk (ve, -e, var): dolgu sayilmaz
    de: { kesin: ["äh", "ähm", "öh", "hm", "m", "mhm"], yumusak: ["also", "halt", "quasi", "sozusagen", "irgendwie"] },
    es: { kesin: ["eh", "ehm", "em", "hm", "mm"], yumusak: ["pues", "o sea", "bueno", "este", "vale"] },
    fr: { kesin: ["euh", "heu", "hum", "hm", "bah"], yumusak: ["genre", "bref", "en fait", "du coup", "voilà"] },
    it: { kesin: ["ehm", "ehh", "mmh", "hm", "uhm"], yumusak: ["cioè", "tipo", "allora", "insomma", "praticamente"] },
    pt: { kesin: ["hum", "hm", "ehh", "éé", "ãh"], yumusak: ["tipo", "então", "né", "assim", "sabe"] },
    ar: { kesin: ["اه", "امم", "مم", "هم"], yumusak: ["يعني", "طيب", "اممم"] }
  };

  // Tablosu olmayan dil: yalniz her dilde anlamsiz kapali-agiz sesleri. Turkce
  // tabloya dusmek "a"/"e" gibi gercek sozcukleri kesiyordu.
  var EVRENSEL = { kesin: ["hm", "m", "mm", "mhm"], yumusak: [] };

  /*
   * Turkce ikilemeler ("yavaş yavaş", "koşa koşa") kekemelik degil, dilin
   * kendisi: tekrar olarak isaretlenmez. Kekemelik cogunlukla kisa islev
   * sozcuklerinde ve zamirlerde olur ("ben ben", "bu bu").
   */
  var IKILEME = ["yavaş", "çok", "koşa", "güle", "ağır", "tek", "ara", "sık", "yan", "uzun", "kısa",
    "büyük", "küçük", "sıcak", "soğuk", "ayrı", "iyi", "güzel", "bol", "kat", "derin", "yeni", "eski",
    "renk", "çeşit", "bölük", "parça", "damla", "akın", "sıra", "kıvrım", "dolu", "hızlı", "ağlaya",
    "gide", "bile", "döne", "düşe", "gülüm", "boy", "kimi", "yer", "tıka", "bas", "çabuk", "acı"];

  function locOf(lang) {
    return lang === "az" ? "az" : (lang === "tr" ? "tr" : undefined);
  }

  // Noktalama ve bosluklari at, kucuk harfe cevir (Turkce I/ı kurallariyla)
  function normalize(text, lang) {
    var loc = locOf(lang);
    var s = String(text || "");
    s = loc ? s.toLocaleLowerCase(loc) : s.toLowerCase();
    return s.replace(/[.,!?;:…"'“”‘’«»()\[\]{}\-–—]/g, " ").replace(/\s+/g, " ").trim();
  }

  // "ıııı" -> "ı", "hmmm" -> "hm", "eeem" -> "em": uzatilmis sesleri tek bicime indir
  function squeeze(s) {
    return String(s).replace(/(.)\1+/g, "$1");
  }

  function fillerKind(text, lang) {
    var tablo = DOLGU[lang] || EVRENSEL;
    var n = normalize(text, lang);
    if (!n) return null;
    var sq = squeeze(n);
    if (tablo.kesin.indexOf(n) !== -1 || tablo.kesin.indexOf(sq) !== -1) return "filler";
    if (tablo.yumusak.indexOf(n) !== -1) return "soft";
    return null;
  }

  /*
   * Kullanicinin ek dolgu listesi (Ayarlar > "Konuşmadan kes için"): satir basina
   * bir dolgu, dil onekiyle ("tr: yani yani", "en: you see"). Oneksiz satir her
   * dilde gecerli ("*"). Doner: { tr: ["yani yani"], "*": [...] } (normalize edilmis).
   */
  function parseExtraFillers(metin) {
    var out = {};
    String(metin || "").split(/\r?\n/).forEach(function (satir) {
      var t = satir.trim();
      if (!t || t.charAt(0) === "#") return;
      var m = /^([a-z]{2,3})\s*:\s*(.+)$/i.exec(t);
      var dil = m ? m[1].toLowerCase() : "*";
      var ifade = normalize(m ? m[2] : t, dil === "*" ? undefined : dil);
      if (!ifade) return;
      if (!out[dil]) out[dil] = [];
      if (out[dil].indexOf(ifade) === -1) out[dil].push(ifade);
    });
    return out;
  }

  // classify icin: bu dilde gecerli ek dolgular, sozcuk dizileri olarak (uzun olan once)
  function extraFillerList(extra, lang) {
    if (!extra) return [];
    if (typeof extra === "string") extra = parseExtraFillers(extra);
    var liste = [];
    [lang, "*"].forEach(function (k) {
      (extra[k] || []).forEach(function (f) {
        var p = normalize(f, lang);
        if (p) liste.push(p.split(" "));
      });
    });
    liste.sort(function (a, b) { return b.length - a.length; });
    return liste;
  }

  /*
   * Ucuz Turkce kok esitligi: ayni; ya da biri digerinin onekiyse ve >=3 harf;
   * ya da ikisi de >=5 harf ve ilk 4 harf ortak ("size/sizlere", "kamera/kamerayı").
   * Girdi normalize edilmis belirtecler (kesme isareti zaten bosluga donmus olabilir).
   */
  function stemEq(a, b) {
    a = String(a || ""); b = String(b || "");
    if (!a || !b) return false;
    if (a === b) return true;
    var kisa = a.length <= b.length ? a : b, uzun = kisa === a ? b : a;
    if (kisa.length >= 3 && uzun.indexOf(kisa) === 0) return true;
    return a.length >= 5 && b.length >= 5 && a.slice(0, 4) === b.slice(0, 4);
  }

  /*
   * Cumle ici yeniden baslama: 2-4 belirteclik bir dizi, 8 belirtec icinde ve
   * <=1.5 sn sonra yeniden baslarsa ("bu ürünü ııı bu ürünü kesinlikle",
   * "bu video bu videoda") ILK kopya "falsestart" olur. Dolgular atlanir;
   * ikileme ("yavaş yavaş") ve tek sozcuk tekrari ("ben ben", repeat kurali) bu
   * kuralin isi degil. Doner: isaretlenecek kelime indeksleri.
   */
  function findRestarts(words, lang) {
    var toks = [];
    for (var i = 0; i < words.length; i++) {
      if (!valid(words[i])) continue;
      if (fillerKind(words[i].text, lang)) continue;
      var n = normalize(words[i].text, lang).replace(/ /g, "");
      if (n) toks.push({ i: i, t: n, w: words[i] });
    }
    var isaret = {};
    var ikilemeDil = lang === "tr" || lang === "az";
    for (var a = 0; a < toks.length; a++) {
      var bulundu = false;
      for (var len = 4; len >= 2 && !bulundu; len--) {
        if (a + len > toks.length) continue;
        var hepsiIkileme = true;
        for (var q = 0; q < len; q++) {
          if (!(ikilemeDil && IKILEME.indexOf(toks[a + q].t) !== -1)) hepsiIkileme = false;
        }
        if (hepsiIkileme) continue;
        // ikinci kopya ilk kopyanin hemen ardindan (en fazla 8 belirtec icinde) baslar
        for (var b = a + len; b <= a + 8 && b + len <= toks.length; b++) {
          var bosluk = Number(toks[b].w.start) - Number(toks[a + len - 1].w.end);
          if (bosluk > 1.5) break;
          if (toks[b].t !== toks[a].t) continue;   // ilk sozcuk birebir ayni olmali
          var esit = true;
          for (var r = 1; r < len; r++) {
            if (!stemEq(toks[a + r].t, toks[b + r].t)) { esit = false; break; }
          }
          // arada kalan belirtecler de ilk kopyanin parcasi (vazgecilen baslangic)
          if (esit && b - a <= 8) {
            for (var x = a; x < b; x++) isaret[toks[x].i] = true;
            bulundu = true;
            break;
          }
        }
      }
    }
    return Object.keys(isaret).map(Number).sort(function (p, q2) { return p - q2; });
  }

  /*
   * Her kelimeye bir etiket ver:
   *   "filler"  kesin dolgu sesi
   *   "soft"    yumusak dolgu (yalniz opts.soft acikken)
   *   "repeat"  hemen ardindan ayni kelime tekrar edilmis (ilk kopyasi isaretlenir)
   *   null      normal kelime
   */
  function classify(words, opts) {
    opts = opts || {};
    var lang = opts.lang || "tr";
    var maxRepeatGap = opts.maxRepeatGap != null ? opts.maxRepeatGap : 0.8;
    var out = [];
    // Kullanicinin ek dolgulari (cok sozcuklu olabilir): eslesen dizinin her kelimesi dolgu
    var ekDolgu = {};
    var ekListe = extraFillerList(opts.extraFillers, lang);
    if (ekListe.length) {
      var normler = words.map(function (x) { return normalize(x && x.text, lang); });
      for (var e = 0; e < words.length; e++) {
        for (var f = 0; f < ekListe.length; f++) {
          var dizi = ekListe[f], tamam = e + dizi.length <= words.length;
          for (var d = 0; tamam && d < dizi.length; d++) if (normler[e + d] !== dizi[d]) tamam = false;
          if (tamam) { for (var d2 = 0; d2 < dizi.length; d2++) ekDolgu[e + d2] = true; break; }
        }
      }
    }
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var kind = ekDolgu[i] ? "filler" : fillerKind(w.text, lang);
      if (kind === "soft" && !opts.soft) kind = null;
      if (!kind && opts.repeats !== false) {
        var next = words[i + 1];
        var a = normalize(w.text, lang);
        var ikileme = (lang === "tr" || lang === "az") && IKILEME.indexOf(a) !== -1;
        if (next && a && a.length > 1 && !ikileme && a === normalize(next.text, lang) &&
            Number(next.start) - Number(w.end) <= maxRepeatGap) {
          kind = "repeat";
        }
      }
      out.push(kind);
    }
    // Cumle ici yeniden baslama (varsayilan kapali: eski davranis aynen)
    if (opts.phraseRepeats) {
      findRestarts(words, lang).forEach(function (ix) { if (!out[ix]) out[ix] = "falsestart"; });
    }
    return out;
  }

  function valid(w) {
    return w && isFinite(Number(w.start)) && isFinite(Number(w.end)) && Number(w.end) >= Number(w.start);
  }

  /*
   * Silinen kelimelerden ve uzun duraksamalardan kesim araliklari uret.
   *   words   [{start, end, text}] sequence zamaninda, zamana gore sirali
   *   removed [bool] her kelime icin: true = videodan cikar
   *   opts.gap       kesimin iki yanina birakilacak dogal nefes (sn) — varsayilan 0.10
   *   opts.maxPause  bu sureden uzun kelime arasi duraksamalari kisalt (sn); null = kapali
   *   opts.minCut    bundan kisa kesimleri atla (sn) — varsayilan 0.12
   *   opts.edge      bastaki/sondaki silinen kelimede tasma payi (sn) — varsayilan 0.05
   *   opts.clipStart / opts.clipEnd  araliklar bu sinirlar disina tasmaz
   * Doner: [{start, end, reason}] — sirali, cakismasiz.
   */
  function buildCuts(words, removed, opts) {
    opts = opts || {};
    var gap = opts.gap != null ? Number(opts.gap) : 0.10;
    var minCut = opts.minCut != null ? Number(opts.minCut) : 0.12;
    var edge = opts.edge != null ? Number(opts.edge) : 0.05;
    var maxPause = opts.maxPause != null && opts.maxPause !== "" ? Number(opts.maxPause) : null;
    var lo = opts.clipStart != null ? Number(opts.clipStart) : -Infinity;
    var hi = opts.clipEnd != null ? Number(opts.clipEnd) : Infinity;

    var list = [];
    for (var i = 0; i < words.length; i++) {
      if (valid(words[i])) list.push({ w: words[i], cut: !!(removed && removed[i]) });
    }
    var raw = [];

    // 1) Silinen kelime gruplari: komsu tutulan kelimelere dokunmadan, araya
    //    dogal bir nefes payi birakarak kes.
    var k = 0;
    while (k < list.length) {
      if (!list[k].cut) { k++; continue; }
      var bas = k;
      while (k < list.length && list[k].cut) k++;
      var son = k - 1;
      var runStart = Number(list[bas].w.start), runEnd = Number(list[son].w.end);
      var prev = bas > 0 ? list[bas - 1].w : null;
      var next = k < list.length ? list[k].w : null;
      var a = prev
        ? Math.max(Number(prev.end), Math.min(runStart, Number(prev.end) + gap))
        : runStart - edge;
      var b = next
        ? Math.min(Number(next.start), Math.max(runEnd, Number(next.start) - gap))
        : runEnd + edge;
      raw.push({ start: a, end: b, reason: "word" });
    }

    // 2) Tutulan ardisik kelimeler arasindaki uzun duraksamalar
    if (maxPause != null && isFinite(maxPause) && maxPause > 0) {
      var kept = list.filter(function (x) { return !x.cut; }).map(function (x) { return x.w; });
      for (var j = 0; j + 1 < kept.length; j++) {
        var pa = Number(kept[j].end), pb = Number(kept[j + 1].start);
        if (pb - pa > maxPause) {
          // duraksamayi maxPause uzunluguna indir: yarisi once, yarisi sonra kalsin
          var half = maxPause / 2;
          raw.push({ start: pa + half, end: pb - half, reason: "pause" });
        }
      }
    }

    // 3) Sinirla, kisalari at, birlestir
    raw = raw.map(function (r) {
      return { start: Math.max(lo, r.start), end: Math.min(hi, r.end), reason: r.reason };
    }).filter(function (r) {
      // Kullanicinin sildigi kelime ne kadar kisa olursa olsun kesilir (1 kare);
      // minCut yalniz otomatik duraksama kesimlerine uygulanir
      return r.end - r.start >= (r.reason === "word" ? 0.04 : minCut);
    });
    raw.sort(function (x, y) { return x.start - y.start; });
    var out = [];
    raw.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r.start <= last.end + 0.02) {
        if (r.end > last.end) last.end = r.end;
        if (last.reason !== r.reason) last.reason = "word";
      } else {
        out.push({ start: r.start, end: r.end, reason: r.reason });
      }
    });
    return out;
  }

  function totalSeconds(ranges) {
    return (ranges || []).reduce(function (a, r) { return a + Math.max(0, r.end - r.start); }, 0);
  }

  /*
   * Premiere yuzlerce kesimde yavaslar (FireCut: ~500 kesimden sonra). Once
   * mergeGap'ten kisa bosluklu komsu kesimler birlesir (aradaki nefes de gider);
   * hala max'tan fazlaysa EN KISA kesimler birakilir — konusma asla yutulmaz.
   * Doner: { ranges, merged (birlesen kesim sayisi), dropped (birakilan) }.
   */
  function capCuts(ranges, opts) {
    opts = opts || {};
    var max = opts.max > 0 ? Math.floor(opts.max) : 300;
    var mergeGap = opts.mergeGap != null ? Number(opts.mergeGap) : 0.25;
    var list = (ranges || []).filter(function (r) {
      return r && isFinite(Number(r.start)) && isFinite(Number(r.end)) && Number(r.end) > Number(r.start);
    }).map(function (r) {
      var o = {}; for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
      o.start = Number(r.start); o.end = Number(r.end);
      return o;
    }).sort(function (a, b) { return a.start - b.start; });
    if (list.length <= max) return { ranges: list, merged: 0, dropped: 0 };
    var out = [], merged = 0;
    list.forEach(function (r) {
      var last = out[out.length - 1];
      if (last && r.start - last.end <= mergeGap) {
        if (r.end > last.end) last.end = r.end;
        merged++;
      } else out.push(r);
    });
    var dropped = 0;
    if (out.length > max) {
      dropped = out.length - max;
      out = out.map(function (r, i) { return { r: r, i: i }; })
        .sort(function (a, b) { return (b.r.end - b.r.start) - (a.r.end - a.r.start) || a.i - b.i; })
        .slice(0, max)
        .sort(function (a, b) { return a.i - b.i; })
        .map(function (x) { return x.r; });
    }
    return { ranges: out, merged: merged, dropped: dropped };
  }

  // [lo, hi] icinde araliklarin tumleyeni (tutulan parcalar)
  function invertRanges(ranges, lo, hi) {
    lo = Number(lo); hi = Number(hi);
    if (!(hi > lo)) return [];
    var list = (ranges || []).map(function (r) {
      return { start: Math.max(lo, Number(r.start)), end: Math.min(hi, Number(r.end)) };
    }).filter(function (r) { return isFinite(r.start) && isFinite(r.end) && r.end > r.start; })
      .sort(function (a, b) { return a.start - b.start; });
    var out = [], imlec = lo;
    list.forEach(function (r) {
      if (r.start > imlec) out.push({ start: imlec, end: r.start });
      if (r.end > imlec) imlec = r.end;
    });
    if (imlec < hi) out.push({ start: imlec, end: hi });
    return out;
  }

  /*
   * Whisper dolgu seslerini cogu zaman yazmaz ("ııı"yi atlar). Bu kisa ipucu
   * motoru onlari yazmaya iter; yazmasa bile duraksama kesimi o bosluklari yakalar.
   */
  function fillerPrompt(lang) {
    var ipucu = {
      tr: "Iıı, eee, hmm, şey, yani... ıı, ee.",
      en: "Umm, uh, er, so... I mean, like, hmm.",
      ru: "Э-э, м-м, ну, это самое, хм.",
      az: "Ee, ıı, hmm, yəni, şey.",
      de: "Äh, ähm, hm, also... halt, sozusagen.",
      es: "Eh, ehm, pues... o sea, bueno, este.",
      fr: "Euh, heu, hum... en fait, du coup, bah.",
      it: "Ehm, mmh, cioè... allora, tipo, insomma.",
      pt: "Hum, ãh, então... tipo, né, assim.",
      ar: "اه، امم، يعني... طيب."
    };
    // Bilinmeyen dilde Turkce ipucu motoru yanlis dile cekerdi: tarafsiz ses ipucu
    return ipucu[lang] || "Hmm, mm.";
  }

  /*
   * Dolgu ipucunun dili: #cap-lang secimi; "Otomatik" ("" ya da "auto") ise
   * once motorun algiladigi dil, o da yoksa arayuz dili (EN arayuzde Ingilizce
   * ipucu; Turkce arayuzde eskisi gibi Turkce).
   */
  function promptLang(secim, algilanan, arayuz) {
    if (secim && secim !== "auto") return secim;
    if (algilanan && algilanan !== "auto") return algilanan;
    return arayuz || "tr";
  }

  /*
   * "Dinle" onizlemesi: kesimler uygulanmis gibi sesi tek dosyada duyur.
   * cuts sequence zamaninda; ffmpeg klibin kaynagindan -ss inPoint -t dur ile
   * okur, bu yuzden zamanlar klip-ici KAYNAK saniyesine cevrilir (hiz carpani).
   *   clip: { clipStart, clipEnd, dur }   (dur = kaynak sure)
   *   maxSn: yalniz ilk maxSn kaynak saniyesi dinlenecekse sonrasindaki kesimler
   *          atilir (uzun kliplerde komut satiri sinirini asmamak icin)
   *   opts.only: true ise TERSI — yalniz kesilecek parcalar calinir
   *          ("Yalnız kesilecekleri dinle"); kesim yoksa "" (calinacak bir sey yok)
   * Doner: ffmpeg -af ifadesi; kesim yoksa "" (oldugu gibi cal).
   */
  function previewFilter(cuts, clip, maxSn, opts) {
    var tl = Number(clip.clipEnd) - Number(clip.clipStart);
    var hiz = Number(clip.dur) > 0 && tl > 0 ? tl / Number(clip.dur) : 1;
    var sinir = Number(maxSn) > 0 ? Number(maxSn) : Infinity;
    var parcalar = (cuts || []).map(function (c) {
      var a = Math.max(0, (Number(c.start) - Number(clip.clipStart)) / hiz);
      var b = Math.min(sinir, Math.max(0, (Number(c.end) - Number(clip.clipStart)) / hiz));
      return b > a ? "between(t," + a.toFixed(3) + "," + b.toFixed(3) + ")" : "";
    }).filter(Boolean);
    if (!parcalar.length) return "";
    if (opts && opts.only) return "aselect='" + parcalar.join("+") + "',asetpts=N/SR/TB";
    // aselect kesilen ornekleri atar, asetpts zamani kesintisiz yeniden numaralar
    return "aselect='not(" + parcalar.join("+") + ")',asetpts=N/SR/TB";
  }

  return {
    previewFilter: previewFilter,
    capCuts: capCuts,
    invertRanges: invertRanges,
    parseExtraFillers: parseExtraFillers,
    stemEq: stemEq,
    findRestarts: findRestarts,
    IKILEME: IKILEME,
    normalize: normalize,
    fillerKind: fillerKind,
    classify: classify,
    buildCuts: buildCuts,
    totalSeconds: totalSeconds,
    fillerPrompt: fillerPrompt,
    promptLang: promptLang,
    DOLGU: DOLGU
  };
});
