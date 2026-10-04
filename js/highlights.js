/*
 * Suflo Highlights — viral anlar (Shorts / Reels / TikTok bulucu) · Viral Skor 2.0
 *
 * Uzun bir konuşmanın altyazısından kendi başına anlam taşıyan, güçlü bir
 * kancayla başlayan bölümleri seçer. Seçimi bulut LLM yapar (çeviriyle aynı
 * anahtar); istem, yanıt ayrıştırma, puanlama ve sınır denetimi burada.
 *
 * Viral Skor 2.0:
 *   - Model her klibe 5 alt puan verir (kanca, bağımsızlık, duygu, değer, kapanış).
 *     Toplam puan YEREL hesaplanır (weightedScore); modelin kendi toplamı yok sayılır.
 *   - Aralıklar satır sınırına oturur ve cümle sınırına kaydırılır (snapEdges):
 *     klip cümle ortasında başlamaz/bitmez. Noktalama yoksa ≥0,6 sn duraksama sınırdır.
 *   - Kart düğmeleri ±1 cümle kaydırır (moveEdge); girdi asla değiştirilmez.
 *
 * Saf modül: DOM'a, ağa ve Premiere'e dokunmaz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloHighlights = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var VARSAYILAN = { minDur: 15, maxDur: 60, adet: 5 };
  var ADET_MIN = 3, ADET_MAX = 10;
  var ODAK_MAX = 120;
  // Cumle siniri: noktalama yoksa bu kadar (sn) sessizlik de cumle sonu sayilir
  var DURAK = 0.6;
  // snapEdges: "to" ileri kayarken maxDur en fazla %15 asilabilir; "from" en fazla 8 sn geri kayar
  var SNAP_TOLERANS = 1.15, BAS_GERI = 8;
  // moveEdge: bir cumle siniri en fazla bu kadar (sn) otede aranir; yoksa tek satir adim
  var ADIM_PENCERE = 20;
  var EPS = 0.01;

  /* ---------------- Puanlama ---------------- */

  var WEIGHTS = { hook: 0.30, standalone: 0.25, emotion: 0.20, value: 0.15, payoff: 0.10 };
  var ALT_SIRA = ["hook", "standalone", "emotion", "value", "payoff"];
  var ALT_ETIKET = { hook: "Kanca", standalone: "Bağımsızlık", emotion: "Duygu", value: "Değer", payoff: "Kapanış" };

  /*
   * Video türleri (beyaz liste). Bilinmeyen tür istemde yok sayılır.
   * ad: panelde görünen ad; istem: modele verilen İngilizce yönlendirme.
   */
  var TUR_SIRA = ["genel", "podcast", "egitim", "komedi", "motivasyon", "inceleme", "roportaj", "oyun"];
  var TURLER = {
    genel: { ad: "Genel", istem: "" },
    podcast: { ad: "Podcast", istem: "Genre: podcast / long conversation. Favour bold opinions, personal stories, disagreements and quotable lines." },
    egitim: { ad: "Eğitim", istem: "Genre: educational. Favour clear 'aha' explanations, surprising facts, practical tips and common mistakes." },
    komedi: { ad: "Komedi", istem: "Genre: comedy. Favour complete jokes and funny stories with setup and punchline; never cut before the punchline." },
    motivasyon: { ad: "Motivasyon", istem: "Genre: motivational. Favour emotional peaks, strong one-liners, personal turning points and calls to action." },
    inceleme: { ad: "Ürün inceleme", istem: "Genre: product review. Favour clear verdicts, pros and cons, price/value judgements, surprising flaws and comparisons." },
    roportaj: { ad: "Röportaj", istem: "Genre: interview. Favour revealing answers, confessions and strong reactions; include the question when the answer needs it." },
    oyun: { ad: "Oyun", istem: "Genre: gaming. Favour big reactions, clutch moments, funny fails and hot takes." }
  };

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function num(v) { v = Number(v); return isFinite(v) ? v : NaN; }

  // "85", "8,5", "85/100", 85 -> sayi; bos / bool / null / anlamsiz -> NaN
  function sayiOku(v) {
    if (v === null || v === undefined || typeof v === "boolean") return NaN;
    if (typeof v === "string") {
      var t = v.replace(",", ".").trim();
      if (!t) return NaN;
      return num(parseFloat(t));
    }
    return typeof v === "number" ? num(v) : NaN;
  }

  function sinirla(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /*
   * Alt puanları 0-100'e normalize et.
   *   - sayısal metin kabul edilir; geçersiz/eksik alt puan yok sayılır
   *   - mevcut değerlerin HEPSİ ≤10 ise model 0-10 ölçeği kullanmıştır: ×10
   *   - aralık dışı değerler 0-100'e kırpılır
   * Döner: { hook: n|null, ... } ya da hiç geçerli alt puan yoksa null.
   */
  function normalizeSub(sub) {
    if (!sub || typeof sub !== "object" || sub instanceof Array) return null;
    var ham = {}, var_ = [];
    ALT_SIRA.forEach(function (k) {
      var v = sayiOku(sub[k]);
      if (isFinite(v)) { ham[k] = v; var_.push(k); }
    });
    if (!var_.length) return null;
    var onluk = var_.every(function (k) { return ham[k] <= 10; });
    var out = {};
    ALT_SIRA.forEach(function (k) {
      out[k] = has(ham, k) ? Math.round(sinirla(onluk ? ham[k] * 10 : ham[k], 0, 100)) : null;
    });
    return out;
  }

  /*
   * Ağırlıklı toplam (0-100, tamsayı). Eksik alt puanlar, mevcut ağırlıklar
   * üzerinden yeniden normalize edilir. Geçerli alt puan yoksa null.
   */
  function weightedScore(sub) {
    var n = normalizeSub(sub);
    if (!n) return null;
    var top = 0, agirlik = 0;
    ALT_SIRA.forEach(function (k) {
      if (n[k] === null) return;
      top += n[k] * WEIGHTS[k];
      agirlik += WEIGHTS[k];
    });
    return agirlik > 0 ? Math.round(sinirla(top / agirlik, 0, 100)) : null;
  }

  // Eski biçim tek puan: ≤10 → ×10; 11-100 aynen; geçersiz → null
  function legacyScore(score) {
    var s = sayiOku(score);
    if (!isFinite(s)) return null;
    if (s <= 10) s = s * 10;
    return Math.round(sinirla(s, 0, 100));
  }

  /*
   * Bir klibin puanı. Alt puanlar varsa yerel ağırlıklı toplam (modelin
   * toplamı yok sayılır); yoksa eski {score} biçimi (legacy: true → arayüz
   * alt puan çubuklarını gizler). Hiç puan yoksa 50.
   */
  function puanla(c) {
    c = c || {};
    var sub = normalizeSub(c.sub || c.subs || c.scores);
    if (sub) return { score: weightedScore(sub), sub: sub, legacy: false };
    var s = legacyScore(c.score);
    return { score: s === null ? 50 : s, sub: null, legacy: true };
  }

  // ≥80 iyi (yeşil), 60-79 orta (sarı), <60 zayıf
  function puanBandi(p) {
    p = Number(p) || 0;
    return p >= 80 ? "iyi" : p >= 60 ? "orta" : "zayif";
  }

  /* ---------------- Ayar temizliği ---------------- */

  function adetSinirla(n) {
    n = n === null || n === undefined || n === "" ? NaN : Math.round(Number(n));
    if (!isFinite(n)) n = VARSAYILAN.adet;
    return sinirla(n, ADET_MIN, ADET_MAX);
  }

  // Odak metni: satır sonları tek boşluk, en fazla 120 karakter (istemde tırnak içinde)
  function odakTemizle(s) {
    return String(s == null ? "" : s).replace(/[\r\n\t\u2028\u2029]+/g, " ").replace(/"/g, "'")
      .replace(/\s+/g, " ").trim().slice(0, ODAK_MAX).trim();
  }

  // Beyaz liste: yalnız TURLER'in kendi anahtarları ("constructor" gibi miras adlar geçmez)
  function turSec(t) {
    t = String(t == null ? "" : t).toLowerCase();
    return has(TURLER, t) ? t : "genel";
  }

  /* ---------------- Satırlar ---------------- */

  /*
   * Boş/bozuk satırları at, zamana göre sırala. from/to indeksleri BU dizinin
   * indeksleridir: panel aramanın gördüğü sonucu saklar (sonraki altyazı
   * düzenlemeleri indeksleri kaydırmasın).
   */
  function clean(segments) {
    return (segments || []).filter(function (s) {
      return s && String(s.text || "").trim() && isFinite(Number(s.start)) && isFinite(Number(s.end));
    }).map(function (s) {
      return { start: Number(s.start), end: Number(s.end), text: String(s.text).replace(/\s+/g, " ").trim() };
    }).sort(function (a, b) { return a.start - b.start; });
  }

  /* ---------------- Cümle sınırları ---------------- */

  // Satır sonu: [.!?…。！？؟] + istege bagli kapanan tirnak/parantez (*vurgu* yildizi ve emoji atlanir)
  var SON_EK = /[\s*\u200d\ufe0f\u2600-\u27bf\ud800-\udfff]+$/;
  var CUMLE_SONU = /[.!?\u2026\u3002\uff01\uff1f\u061f]["'\u201d\u2019\u00bb)\]\uff09\u300d\u300f]*$/;
  function cumleSonu(text) {
    return CUMLE_SONU.test(String(text == null ? "" : text).replace(SON_EK, ""));
  }

  // i. satır bir cümle sonu mu: noktalama, ≥0,6 sn duraksama ya da konuşmanın sonu
  function cumleBitisi(segs, i) {
    if (i >= segs.length - 1) return true;
    if (i < 0) return true;
    return cumleSonu(segs[i].text) || segs[i + 1].start - segs[i].end >= DURAK - 0.001;
  }
  // i. satır bir cümle başı mı: önceki satır cümle sonuysa (ya da konuşmanın başıysa)
  function cumleBasi(segs, i) { return i <= 0 || cumleBitisi(segs, i - 1); }

  function sure(segs, a, b) { return segs[b].end - segs[a].start; }

  /*
   * Kenarları cümle sınırına oturt (parseResponse içinde, min/max döngüsünden
   * sonra, çakışma elemeden önce). segs: clean() çıktısı.
   *   to:   ileride maxDur×1.15 içinde ilk cümle sonuna; yoksa minDur'u koruyan son
   *         cümle sonuna geri; ikisi de yoksa değişmez
   *   from: en fazla 8 sn geri ya da en fazla 1 satır ileri, öncülü cümle sonu olan satıra
   * Döner: yeni { from, to } (girdi değişmez).
   */
  function snapEdges(segs, clip, opts) {
    opts = opts || {};
    var a = clip.from, b = clip.to;
    if (!segs || !segs.length || !(a >= 0) || !(b >= a) || b > segs.length - 1) return { from: a, to: b };
    var son = segs.length - 1;
    var minDur = opts.minDur || VARSAYILAN.minDur, maxDur = opts.maxDur || VARSAYILAN.maxDur;
    var minEff = Math.min(minDur, segs[son].end - segs[0].start);
    var ust = maxDur * SNAP_TOLERANS;
    var j;
    if (!cumleBitisi(segs, b)) {
      var yeniB = -1;
      for (j = b + 1; j <= son && sure(segs, a, j) <= ust + EPS; j++) {
        if (cumleBitisi(segs, j)) { yeniB = j; break; }
      }
      if (yeniB < 0) {
        for (j = b - 1; j >= a && sure(segs, a, j) >= minEff - EPS; j--) {
          if (cumleBitisi(segs, j)) { yeniB = j; break; }
        }
      }
      if (yeniB >= 0) b = yeniB;
    }
    if (!cumleBasi(segs, a)) {
      var yeniA = -1;
      for (j = a - 1; j >= 0 && segs[a].start - segs[j].start <= BAS_GERI + EPS && sure(segs, j, b) <= ust + EPS; j--) {
        if (cumleBasi(segs, j)) { yeniA = j; break; }
      }
      if (yeniA < 0 && a + 1 <= b && cumleBasi(segs, a + 1) && sure(segs, a + 1, b) >= minEff - EPS) yeniA = a + 1;
      if (yeniA >= 0) a = yeniA;
    }
    return { from: a, to: b };
  }

  function kopya(c) {
    var o = {};
    for (var k in c) if (has(c, k)) o[k] = c[k];
    if (c.sub && typeof c.sub === "object") {
      o.sub = {};
      for (var s in c.sub) if (has(c.sub, s)) o.sub[s] = c.sub[s];
    }
    if (c.hooks instanceof Array) o.hooks = c.hooks.slice();
    return o;
  }

  function disiSure(dur, minDur, maxDur) { return dur < minDur - EPS || dur > maxDur + EPS; }

  /*
   * Kart düğmeleri: bir kenarı ±1 cümle kaydır.
   *   kenar: "start" | "end";  yon: +1 = bir cümle EKLE (klip uzar), -1 = bir cümle ÇIKAR
   *   opts: { hardMin: 5, hardMax: 180, minDur, maxDur, others: [diğer kartlar] }
   * Komşu cümle sınırına gider; ADIM_PENCERE içinde sınır yoksa (noktalama yok)
   * tek satır kayar. Sert sınırı bozan ya da başka kartla çakışan hareket → null.
   * Hazır ayarın min/max'ını aşmak serbesttir (bilerek): disiSure işaretlenir.
   * Girdi asla değiştirilmez; döner: yeni klip nesnesi.
   */
  function moveEdge(segs, clip, kenar, yon, opts) {
    opts = opts || {};
    if (!segs || !segs.length || !clip) return null;
    var son = segs.length - 1;
    var a = clip.from, b = clip.to;
    if (!(a >= 0) || !(b >= a) || b > son || Math.round(a) !== a || Math.round(b) !== b) return null;
    var hardMin = isFinite(Number(opts.hardMin)) ? Number(opts.hardMin) : 5;
    var hardMax = isFinite(Number(opts.hardMax)) ? Number(opts.hardMax) : 180;
    var minDur = opts.minDur || VARSAYILAN.minDur, maxDur = opts.maxDur || VARSAYILAN.maxDur;
    var buyut = Number(yon) > 0, j, hedef = -1;
    if (kenar === "end") {
      if (buyut) {
        for (j = b + 1; j <= son && segs[j].end - segs[b].end <= ADIM_PENCERE + EPS; j++) if (cumleBitisi(segs, j)) { hedef = j; break; }
        if (hedef < 0 && b + 1 <= son) hedef = b + 1;
      } else {
        for (j = b - 1; j >= a && segs[b].end - segs[j].end <= ADIM_PENCERE + EPS; j--) if (cumleBitisi(segs, j)) { hedef = j; break; }
        if (hedef < 0 && b - 1 >= a) hedef = b - 1;
      }
      if (hedef < 0) return null;
      b = hedef;
    } else if (kenar === "start") {
      if (buyut) {
        for (j = a - 1; j >= 0 && segs[a].start - segs[j].start <= ADIM_PENCERE + EPS; j--) if (cumleBasi(segs, j)) { hedef = j; break; }
        if (hedef < 0 && a - 1 >= 0) hedef = a - 1;
      } else {
        for (j = a + 1; j <= b && segs[j].start - segs[a].start <= ADIM_PENCERE + EPS; j++) if (cumleBasi(segs, j)) { hedef = j; break; }
        if (hedef < 0 && a + 1 <= b) hedef = a + 1;
      }
      if (hedef < 0) return null;
      a = hedef;
    } else return null;
    var start = segs[a].start, end = segs[b].end, dur = end - start;
    if (dur < hardMin - EPS || dur > hardMax + EPS) return null;
    if (buyut) {
      var digerleri = opts.others || [];
      for (var i = 0; i < digerleri.length; i++) {
        var o = digerleri[i];
        if (!o || o === clip || (o.id !== undefined && o.id === clip.id)) continue;
        if (start < Number(o.end) - EPS && Number(o.start) < end - EPS) return null;
      }
    }
    var yeni = kopya(clip);
    yeni.from = a; yeni.to = b; yeni.start = start; yeni.end = end;
    yeni.disiSure = disiSure(dur, minDur, maxDur);
    return yeni;
  }

  /*
   * Liste görünümü: minPuan filtresi + sıralama. minPuan hepsini elerse en iyi
   * 2 an kalır ve low: true işaretlenir. sira: "puan" (varsayılan) | "zaman".
   * Döner: yeni dizi (kopyalar; girdi değişmez).
   */
  function filtreSirala(clips, opts) {
    opts = opts || {};
    var minPuan = Number(opts.minPuan) || 0;
    var hepsi = (clips || []).filter(function (c) { return c && typeof c === "object"; }).map(function (c) {
      var o = kopya(c);
      delete o.low;
      return o;
    });
    function puanSirasi(x, y) { return (Number(y.score) || 0) - (Number(x.score) || 0) || x.start - y.start; }
    var liste = hepsi.filter(function (c) { return (Number(c.score) || 0) >= minPuan; });
    if (!liste.length && hepsi.length) {
      liste = hepsi.slice().sort(puanSirasi).slice(0, 2);
      liste.forEach(function (c) { c.low = true; });
    }
    return liste.sort(opts.sira === "zaman" ? function (x, y) { return x.start - y.start; } : puanSirasi);
  }

  /* ---------------- İstem ---------------- */

  /*
   * LLM istemi: numaralı satırlar ([i] [sn] metin). Model satır NUMARASI döndürür;
   * saniye döndürmesinden daha güvenilir (uydurma zaman yerine var olan sınır).
   *   opts: lang, minDur, maxDur, adet (3-10), tur (TURLER), odak (≤120 karakter), maxChars
   */
  function buildPrompt(segments, opts) {
    opts = opts || {};
    var segs = clean(segments);
    var minDur = opts.minDur || VARSAYILAN.minDur, maxDur = opts.maxDur || VARSAYILAN.maxDur;
    var adet = adetSinirla(opts.adet === undefined ? VARSAYILAN.adet : opts.adet);
    var tur = turSec(opts.tur !== undefined ? opts.tur : opts.genre);
    var odak = odakTemizle(opts.odak !== undefined ? opts.odak : opts.focus);
    var maxChars = opts.maxChars || 16000;
    var lines = segs.map(function (s, i) { return "[" + i + "] [" + Math.round(s.start) + "s] " + s.text; });
    // Cok uzun metin: satirlari esit aralikla seyrelt (numaralar korunur)
    var toplam = lines.reduce(function (a, l) { return a + l.length + 1; }, 0);
    var adim = 1;
    if (toplam > maxChars) {
      adim = Math.ceil(toplam / maxChars);
      lines = lines.filter(function (l, i) { return i % adim === 0; });
    }
    var dil = { tr: "Turkish", az: "Azerbaijani", en: "English", ru: "Russian", de: "German", ar: "Arabic", es: "Spanish", fr: "French", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese" }[opts.lang || "tr"] || "the transcript's language";
    return {
      system: "You are a short-form video editor. From a long talk transcript, pick the " + adet +
        " best standalone clips for YouTube Shorts / Reels / TikTok. " +
        (TURLER[tur].istem ? TURLER[tur].istem + " " : "") +
        (odak ? "The editor is looking for: \"" + odak + "\". Prefer clips that match it; if few match, still return the best clips. " : "") +
        "Each clip must: start with a strong hook (a surprising claim, question, or emotional line), make sense without the rest " +
        "of the video, end on a complete sentence (never mid-thought), and last " + minDur + "-" + maxDur + " seconds. Do not overlap clips. " +
        "Rate every clip with five sub-scores from 0 to 100: hook (do the first seconds stop the scroll), standalone (is it understood " +
        "on its own), emotion (surprise, humour, tension or inspiration), value (what the viewer learns or gets), payoff (does the ending " +
        "land). Calibration: an average clip ≈ 50; use the full range; rank the clips against each other, do not give every clip 80+. " +
        "Do not add a total score; it is computed from the sub-scores. " +
        "Reply ONLY with JSON {\"clips\":[{\"from\":<first line number>,\"to\":<last line number>," +
        "\"title\":\"<catchy title, max 7 words, in " + dil + ">\"," +
        "\"reason\":\"<why it works, max 20 words, in " + dil + ">\"," +
        "\"hooks\":[\"<3 different on-screen hook titles, max 7 words each, in " + dil + "; wrap 1-2 key words in *asterisks*>\"]," +
        "\"sub\":{\"hook\":<0-100>,\"standalone\":<0-100>,\"emotion\":<0-100>,\"value\":<0-100>,\"payoff\":<0-100>}}]} best first.",
      user: "Transcript lines as [line number] [start seconds] text:\n" + lines.join("\n"),
      // seyreltme adimi: model yalniz her adim'inci satiri gordu (parseResponse'a verilir)
      adim: adim
    };
  }

  /* ---------------- Yanıt ---------------- */

  function metin(v, max) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
  }

  // Kanca başlığı seçenekleri: **x** → *x*, tırnak ve hashtag atılır, en çok 9 kelime, tekrarsız, en çok 3
  function kancalar(v) {
    // dizi beklenir; tek metin gelirse satir satir (ya da " | " ile) bolunur
    var raw = v instanceof Array ? v : (typeof v === "string" && v.trim() ? v.split(/\r?\n|\s\|\s/) : []);
    var gorulen = {}, out = [];
    raw.forEach(function (h) {
      if (h && typeof h === "object") h = h.text || h.title || h.hook || "";
      if (out.length >= 3 || (typeof h !== "string" && typeof h !== "number")) return;
      var t = String(h).replace(/^\s*(?:\d+[.)]|[-•])\s+/, "").replace(/\*\*([^*]+)\*\*/g, "*$1*").replace(/^["'\u201c\u201d\u2018\u2019\u00ab\u00bb\s]+|["'\u201c\u201d\u2018\u2019\u00ab\u00bb\s]+$/g, "")
        .replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
      var kelimeler = t.split(" ");
      if (kelimeler.length > 9) t = kelimeler.slice(0, 9).join(" ");
      t = t.slice(0, 90).trim();
      // tek kalan yildiz (kirpma/hata) -> yildizlari tamamen at
      if ((t.match(/\*/g) || []).length % 2) t = t.replace(/\*/g, "");
      var k = t.replace(/\*/g, "").toLowerCase();
      if (!k || gorulen[k]) return;
      gorulen[k] = 1;
      out.push(t);
    });
    return out;
  }

  /*
   * Yanıtı ayrıştır ve denetle. Döner:
   *   [{ from, to, start, end, title, reason, hooks, hook, score (0-100), sub, legacy, disiSure }]
   *   - satır numaraları geçerli aralığa sıkıştırılır, from>to ise yer değişir
   *   - süre minDur'dan kısaysa komşu satırlarla uzatılır, maxDur'dan uzunsa kırpılır
   *     (her zaman satır sınırında), sonra kenarlar cümle sınırına oturur
   *   - üst üste binenlerden puanı yüksek olan kalır
   *   - hook = hooks[0] || reason (marker yorumu ve eski akışlar için)
   */
  function parseResponse(content, segments, opts) {
    opts = opts || {};
    var segs = clean(segments);
    if (!segs.length) return [];
    var minDur = opts.minDur || VARSAYILAN.minDur, maxDur = opts.maxDur || VARSAYILAN.maxDur;
    var data;
    try { data = typeof content === "string" ? JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) : content; } catch (e) { return []; }
    var raw = data && (data.clips || data.Clips || data.highlights);
    if (!(raw instanceof Array)) return [];
    var son = segs.length - 1;
    var adim = Math.max(1, Math.round(Number(opts.adim) || 1));
    var adaylar = [];
    raw.forEach(function (c) {
      // null / eksik girdi: atla (num(null) 0 olur ve modelin secmedigi bir klip uretirdi)
      if (!c || typeof c !== "object" || c.from == null || c.to == null) return;
      var a = Math.round(num(c.from)), b = Math.round(num(c.to));
      if (!isFinite(a) || !isFinite(b)) return;
      if (a > b) { var t = a; a = b; b = t; }
      a = Math.max(0, Math.min(son, a));
      b = Math.max(0, Math.min(son, b));
      // Seyreltilmis istemde model "to" olarak gordugu son satiri verdi; dusunce
      // gizli satirlarda (to+1 .. to+adim-1) suruyor olabilir: o satirlari da kapsa
      if (adim > 1) b = Math.min(son, b + adim - 1);
      // cok kisa: once sona dogru uzat; sona eklemek ust siniri asacaksa (uzun bosluk)
      // basa dogru uzat
      while (segs[b].end - segs[a].start < minDur && (b < son || a > 0)) {
        var ileri = b < son && segs[b + 1].end - segs[a].start <= maxDur;
        if (ileri) b++;
        else if (a > 0) a--;
        else if (b < son) b++;
        else break;
      }
      // cok uzun: sondan kirp (kanca basta kalsin)
      while (segs[b].end - segs[a].start > maxDur && b > a) b--;
      var dur = segs[b].end - segs[a].start;
      if (dur < Math.min(minDur, segs[son].end - segs[0].start) - EPS || dur > maxDur + EPS) return;
      // cumle ortasinda baslamasin / bitmesin
      var kenar = snapEdges(segs, { from: a, to: b }, { minDur: minDur, maxDur: maxDur });
      a = kenar.from; b = kenar.to;
      var p = puanla(c);
      var title = metin(c.title, 80);
      var hooks = kancalar(c.hooks);
      // eski bicimde "hook" alani "neden ise yariyor" aciklamasiydi: gerekce sayilir
      var reason = metin(c.reason || c.why || (typeof c.hook === "string" ? c.hook : ""), 200);
      var dur2 = segs[b].end - segs[a].start;
      adaylar.push({
        from: a, to: b, start: segs[a].start, end: segs[b].end,
        title: title || ("Klip " + (adaylar.length + 1)),
        reason: reason,
        hooks: hooks,
        hook: (hooks[0] || reason).slice(0, 140),
        score: p.score, sub: p.sub, legacy: p.legacy,
        disiSure: disiSure(dur2, Math.min(minDur, segs[son].end - segs[0].start), maxDur)
      });
    });
    // puana gore sirala, cakisanlari ele
    adaylar.sort(function (x, y) { return y.score - x.score || x.start - y.start; });
    var secilen = [];
    adaylar.forEach(function (c) {
      var cakisir = secilen.some(function (s) { return c.start < s.end - EPS && s.start < c.end - EPS; });
      if (!cakisir) secilen.push(c);
    });
    return secilen;
  }

  /*
   * Shorts alt sekansi icin ana transkriptten aralik: [start, end] ile ortusen
   * satirlar (orta noktasi aralikta olanlar) 0'a kaydirilip kirpilir. Satirlarin
   * diger alanlari (orig, *vurgu*) korunur. Doner: yeni dizi.
   */
  function sliceSegments(segments, start, end) {
    start = Number(start); end = Number(end);
    if (!(end > start)) return [];
    return (segments || []).filter(function (s) {
      var a = Number(s && s.start), b = Number(s && s.end);
      if (!isFinite(a) || !isFinite(b)) return false;
      var orta = (a + b) / 2;
      return orta >= start && orta <= end;
    }).map(function (s) {
      var o = JSON.parse(JSON.stringify(s));
      o.start = Math.max(0, Number(s.start) - start);
      o.end = Math.min(end - start, Math.max(o.start + 0.05, Number(s.end) - start));
      return o;
    });
  }

  // "87/100 tahmini (kanca 90 · bağımsızlık 85 · …)"; eski biçimde yalnız toplam
  function puanMetni(c) {
    var s = Math.round(Number(c.score) || 0) + "/100 tahmini";
    if (c.legacy || !c.sub) return s;
    var parcalar = ALT_SIRA.filter(function (k) { return c.sub[k] !== null && c.sub[k] !== undefined; }).map(function (k) {
      return ALT_ETIKET[k].toLowerCase() + " " + c.sub[k];
    });
    return parcalar.length ? s + " (" + parcalar.join(" · ") + ")" : s;
  }

  // Seçili kanca başlığı (kart radyo düğmesi: kancaNo), yoksa ilki
  function secilenKanca(c) {
    var h = c && c.hooks instanceof Array ? c.hooks : [];
    var i = Math.round(Number(c && c.kancaNo) || 0);
    return h[i] || h[0] || "";
  }

  /*
   * Sonuç metni (kopyalanabilir liste). Seçeneksiz çağrı eski çıktıyla birebir aynıdır.
   *   opts.detay: puan + alt puanlar, gerekçe ve seçili kanca başlığı
   */
  function format(clips, opts) {
    opts = opts || {};
    function tc(sec) {
      var t = Math.max(0, Math.floor(sec)), m = Math.floor(t / 60), s = t % 60;
      return m + ":" + (s < 10 ? "0" : "") + s;
    }
    return (clips || []).map(function (c, i) {
      var bas = (i + 1) + ". " + c.title + " (" + tc(c.start) + "–" + tc(c.end) + ", " + Math.round(c.end - c.start) + " sn)";
      if (!opts.detay) return bas + (c.hook ? " — " + c.hook : "");
      var neden = c.reason || c.hook || "";
      var kanca = secilenKanca(c).replace(/\*/g, "");
      return bas + " · " + puanMetni(c) + (neden ? " — " + neden : "") + (kanca && kanca !== neden ? "\n   Kanca: " + kanca : "");
    }).join("\n");
  }

  return {
    VARSAYILAN: VARSAYILAN, WEIGHTS: WEIGHTS, ALT_SIRA: ALT_SIRA, ALT_ETIKET: ALT_ETIKET, TURLER: TURLER, TUR_SIRA: TUR_SIRA,
    ADET_MIN: ADET_MIN, ADET_MAX: ADET_MAX, ODAK_MAX: ODAK_MAX, DURAK: DURAK,
    clean: clean, adetSinirla: adetSinirla, odakTemizle: odakTemizle, turSec: turSec,
    buildPrompt: buildPrompt, parseResponse: parseResponse,
    normalizeSub: normalizeSub, weightedScore: weightedScore, legacyScore: legacyScore, puanla: puanla, puanBandi: puanBandi,
    cumleSonu: cumleSonu, cumleBitisi: cumleBitisi, cumleBasi: cumleBasi, snapEdges: snapEdges, moveEdge: moveEdge,
    filtreSirala: filtreSirala, secilenKanca: secilenKanca, puanMetni: puanMetni,
    sliceSegments: sliceSegments, format: format
  };
});
