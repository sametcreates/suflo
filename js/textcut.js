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
    }
  };

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
    var tablo = DOLGU[lang] || DOLGU.tr;
    var n = normalize(text, lang);
    if (!n) return null;
    var sq = squeeze(n);
    if (tablo.kesin.indexOf(n) !== -1 || tablo.kesin.indexOf(sq) !== -1) return "filler";
    if (tablo.yumusak.indexOf(n) !== -1) return "soft";
    return null;
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
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var kind = fillerKind(w.text, lang);
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
   * Whisper dolgu seslerini cogu zaman yazmaz ("ııı"yi atlar). Bu kisa ipucu
   * motoru onlari yazmaya iter; yazmasa bile duraksama kesimi o bosluklari yakalar.
   */
  function fillerPrompt(lang) {
    if (lang === "en") return "Umm, uh, er, so... I mean, like, hmm.";
    if (lang === "ru") return "Э-э, м-м, ну, это самое, хм.";
    if (lang === "az") return "Ee, ıı, hmm, yəni, şey.";
    return "Iıı, eee, hmm, şey, yani... ıı, ee.";
  }

  /*
   * "Dinle" onizlemesi: kesimler uygulanmis gibi sesi tek dosyada duyur.
   * cuts sequence zamaninda; ffmpeg klibin kaynagindan -ss inPoint -t dur ile
   * okur, bu yuzden zamanlar klip-ici KAYNAK saniyesine cevrilir (hiz carpani).
   *   clip: { clipStart, clipEnd, dur }   (dur = kaynak sure)
   * Doner: ffmpeg -af ifadesi; kesim yoksa "" (oldugu gibi cal).
   */
  function previewFilter(cuts, clip) {
    var tl = Number(clip.clipEnd) - Number(clip.clipStart);
    var hiz = Number(clip.dur) > 0 && tl > 0 ? tl / Number(clip.dur) : 1;
    var parcalar = (cuts || []).map(function (c) {
      var a = Math.max(0, (Number(c.start) - Number(clip.clipStart)) / hiz);
      var b = Math.max(0, (Number(c.end) - Number(clip.clipStart)) / hiz);
      return b > a ? "between(t," + a.toFixed(3) + "," + b.toFixed(3) + ")" : "";
    }).filter(Boolean);
    if (!parcalar.length) return "";
    // aselect kesilen ornekleri atar, asetpts zamani kesintisiz yeniden numaralar
    return "aselect='not(" + parcalar.join("+") + ")',asetpts=N/SR/TB";
  }

  return {
    previewFilter: previewFilter,
    normalize: normalize,
    fillerKind: fillerKind,
    classify: classify,
    buildCuts: buildCuts,
    totalSeconds: totalSeconds,
    fillerPrompt: fillerPrompt,
    DOLGU: DOLGU
  };
});
