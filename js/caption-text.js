/*
 * Suflo Caption Text
 *
 * Altyazi metni ve zamanlamasi uzerinde calisan saf (DOM'suz, durumsuz)
 * islevler: halusinasyon temizligi, karaoke, bolme, terim sozlugu.
 * captions.js bunlari kullanir; Node testleri ayni kodu dogrudan calistirir.
 *
 * Portions adapted from Raunen (https://github.com/Zeyphers/raunen), MIT, Copyright (c) 2026 Jacob Szczepaniak. See THIRD_PARTY_NOTICES.md.
 * (Ses etiketi filtresi: NOISE_PATTERNS / isNoise, Türkçe sözlükle genişletildi.)
 */
(function (root, factory) {
  // Ölçülmüş kelime zamanları (js/whisper-words.js) bu modülden ÖNCE yüklenir; yoksa eski yol
  var WW = (root && root.SufloWhisperWords) || null;
  if (!WW && typeof require === "function") { try { WW = require("./whisper-words.js"); } catch (e) { WW = null; } }
  // Okunabilir satır düzeni (js/caption-layout.js): kelimeden satır, 2 × 42, birleştirme, bölme, süre
  var CL = (root && root.SufloCaptionLayout) || null;
  if (!CL && typeof require === "function") { try { CL = require("./caption-layout.js"); } catch (e2) { CL = null; } }
  var api = factory(WW, CL);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloCaptionText = api;
})(typeof window !== "undefined" ? window : this, function (WW, CL) {
  "use strict";

  function kelimeli(s) { return !!(s && s.words && s.words.length); }
  // Boşluksuz yazı (Kana, Çince/Japonca ideogram, Tay): whisper belirteçleri boşlukla başlamaz,
  // "kelime" satırın tamamıdır; N kelimelik gruplama satırları birleştirirdi
  var BOSLUKSUZ_YAZI = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\u0E00-\u0E7F]/;

  /*
   * Ses etiketleri (konuşma olmayan sesler): Whisper müzikte, alkışta, sessizlikte
   * "[Müzik]", "(alkış)", "*laughs*", "♪♪" ya da "[BLANK_AUDIO]" yazar. Bunlar altyazı değildir.
   *   - Yalnız etiketten oluşan satır atılır; konuşmayla karışık satır konuşmasını korur,
   *     satır içindeki etiket silinir ("Merhaba [müzik]" -> "Merhaba").
   *   - *etiket* yalnız içi sözlükteki bir ses adıysa etikettir: Suflo'nun *vurgu*
   *     işareti gerçek kelimelerde ("*kelime*") olduğu gibi kalır.
   *   - "Ses etiketlerini koru" (Ayarlar › Altyazı) açıkken etiketler erişilebilirlik için
   *     tutulur, "[Müzik]" biçimine getirilir; [BLANK_AUDIO] yine atılır, yalnız notadan
   *     oluşan satır "♪" olur.
   * whisper-cli'nin -sns (non-speech token bastırma) bayrağı KULLANILMAZ: noktalama benzeri
   * belirteçleri de bastırıyor.
   */
  // Raunen: NOISE_PATTERNS (sözlük; Türkçe adlar ve çoğul/-ing biçimleri Suflo'nun eki).
  // Altyazı metni (kullanıcı içeriği), arayüz metni değil: çevrilmez. Küçük harfle yazılır,
  // "[Müzik]" biçimi ilk harf büyütülerek kurulur (i ile başlayan Türkçe ad yok: "Inaudible" doğru).
  var SES_ETIKETLERI = ["müzik", "music", "alkış", "alkışlar", "applause", "gülüşme", "gülüşmeler",
    "kahkaha", "kahkahalar", "laughter", "laughs", "laughing", "sessizlik", "silence", "gürültü",
    "noise", "anlaşılmıyor", "inaudible", "şarkı", "singing", "nefes", "öksürük", "cough"];
  // Türkçe-duyarlı katlama: "MÜZİK", "ALKIŞ", "INAUDIBLE" sözlükle eşleşsin (İ/I/ı -> i)
  function katla(s) { return String(s).replace(/[İIı]/g, "i").toLowerCase(); }
  // Yalnız kendi anahtarları sayılır: "(constructor)", "[__proto__]" gibi Object.prototype adları etiket değildir
  var ETIKET_ADI = {};
  var KENDI = Object.prototype.hasOwnProperty;
  for (var ei = 0; ei < SES_ETIKETLERI.length; ei++) {
    ETIKET_ADI[katla(SES_ETIKETLERI[ei])] = SES_ETIKETLERI[ei].charAt(0).toUpperCase() + SES_ETIKETLERI[ei].slice(1);
  }
  var NOTA = /[\u2669\u266A\u266B\u266C]/;           // ♩ ♪ ♫ ♬
  var NOTALAR = /[\u2669\u266A\u266B\u266C]/g;
  // Aday etiket: [..], (..) ya da *..* (içi en çok 40 karakter, satır atlamaz)
  var ADAY_KAYNAK = "\\[([^\\[\\]\\n]{1,40})\\]|\\(([^()\\n]{1,40})\\)|\\*([^*\\s][^*\\n]{0,39}?)\\*";
  // nota ile iki yandan sarılmış etiket ("♪ [Müzik] ♪") önce, çıplak etiket sonra
  var SARILI = new RegExp("[\u2669\u266A\u266B\u266C]\\s*(?:" + ADAY_KAYNAK + ")\\s*[\u2669\u266A\u266B\u266C]", "g");
  var CIPLAK = new RegExp(ADAY_KAYNAK, "g");
  // Etiket ya da nota silindikten sonra geriye bunlardan başkası kalmadıysa satır yalnız ses etiketidir
  var GERI_KALAN = /[^\s.,!?;:…\-–—"'«»“”‘’]/;

  // Etiket içi: { ad: "Müzik" } | { bos: true } ([BLANK_AUDIO]) | null (etiket değil)
  function etiketIci(ic, yildiz) {
    var t = String(ic || "").replace(NOTALAR, " ").replace(/[.,!?;:…]+/g, " ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    if (!t) return null;
    if (!yildiz && /^blank[_ ]audio$/i.test(t)) return { bos: true };
    var anahtar = katla(t);
    return KENDI.call(ETIKET_ADI, anahtar) ? { ad: ETIKET_ADI[anahtar] } : null;
  }
  function etiketleriGez(text, fn) {
    function degis(tam, a, b, c) {
      // katılmayan grup CEF 74'te undefined; boş dizgi de olamaz ({1,40})
      var e = etiketIci(a || b || c, !a && !b && !!c);
      return e ? fn(e) : tam;
    }
    return String(text).replace(SARILI, degis).replace(CIPLAK, degis);
  }

  /*
   * Satır yalnız ses etiketinden mi oluşuyor? [BLANK_AUDIO], sözlükteki [..] / (..) / *..*
   * etiketleri (♪ ile sarılı olabilir) ve yalnız ♪/♫'dan oluşan satır. Konuşma içeren satır false.
   */
  // Raunen: isNoise
  function gurultuMu(text) {
    var t = String(text == null ? "" : text);
    if (!/\S/.test(t)) return false;
    var bulundu = false;
    var kalan = etiketleriGez(t, function () { bulundu = true; return " "; });
    if (NOTA.test(kalan)) { bulundu = true; kalan = kalan.replace(NOTALAR, " "); }
    return bulundu && !GERI_KALAN.test(kalan);
  }

  /*
   * Metindeki ses etiketlerini temizle (koru: false) ya da "[Müzik]" biçimine getir (koru: true).
   * Yalnız etiketten oluşan satır koru kapalıyken "" olur. Etiket yoksa metin AYNEN döner.
   */
  function sesEtiketleri(text, koru) {
    var t = String(text == null ? "" : text);
    if (!/\S/.test(t)) return t;
    if (gurultuMu(t)) {
      if (!koru) return "";
      var adlar = [];
      etiketleriGez(t, function (e) {
        if (e.ad && adlar.indexOf("[" + e.ad + "]") === -1) adlar.push("[" + e.ad + "]");
        return " ";
      });
      if (adlar.length) return adlar.join(" ");
      return NOTA.test(t) ? "\u266A" : "";          // yalnız nota: "♪"; yalnız [BLANK_AUDIO]: at
    }
    var degisti = false;
    var cikti = etiketleriGez(t, function (e) {
      degisti = true;
      return (e.bos || !koru) ? " " : " [" + e.ad + "] ";
    });
    if (!degisti) return t;
    cikti = cikti.replace(/\s+/g, " ").replace(/\s+([.,!?;:…])/g, "$1").replace(/^\s+|\s+$/g, "");
    // etiketten arta kalan noktalama/nota satırı konuşma değildir
    if (!GERI_KALAN.test(cikti.replace(NOTALAR, " "))) return koru ? cikti : "";
    return cikti;
  }

  function kelimeKopya(w, text, son) {
    var y = {};
    for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k)) y[k] = w[k];
    y.text = text;
    if (son !== undefined) y.end = son;
    return y;
  }

  /*
   * Kelime listesinden ses etiketi kelimelerini at (koru: "[Müzik]" biçiminde tek kelime yap).
   * Boşlukla bölünmüş etiket ("(", "alkış", ")" ya da "[Müzik" "]") en çok 4 komşu kelimeyle
   * birleştirilip denenir. Ölçülmüş kelime (whisper -ojf) ve bulut kelime öğeleri için.
   */
  function kelimeEtiketleri(words, koru) {
    var out = [];
    var liste = words || [];
    for (var i = 0; i < liste.length; i++) {
      var w = liste[i];
      if (!w) continue;
      var metin = String(w.text == null ? "" : w.text);
      var j = i, birlesik = metin;
      if (!gurultuMu(metin) && /^[\u2669\u266A\u266B\u266C\s]*[\[(*]/.test(metin)) {
        for (var k = i + 1; k < liste.length && k <= i + 4; k++) {
          birlesik += " " + String(liste[k] && liste[k].text || "");
          if (gurultuMu(birlesik)) { j = k; break; }
        }
        if (j === i) birlesik = metin;
      }
      if (gurultuMu(birlesik)) {
        var ad = koru ? sesEtiketleri(birlesik, true) : "";
        if (ad) {
          var y = kelimeKopya(w, ad, liste[j].end);
          for (var q = i + 1; q <= j; q++) if (liste[q] && liste[q].p !== undefined && (y.p === undefined || liste[q].p < y.p)) y.p = liste[q].p;
          out.push(y);
        }
        i = j;
        continue;
      }
      var yeni = sesEtiketleri(metin, koru);          // "Merhaba[Müzik]" gibi yapışık
      if (yeni !== metin) { if (yeni) out.push(kelimeKopya(w, yeni)); continue; }
      out.push(w);
    }
    return out;
  }

  // Satırın etiketsiz kopyası: metin yeni; ölçülmüş kelimelerden etiketler atılır. Baştaki ya da
  // sondaki etiket atıldıysa satır o kenarda kalan kelimeye daralır (müzik boyunca ekranda beklemesin).
  // Daralma "koru" ayarından bağımsızdır: [BLANK_AUDIO] koru açıkken de atılır. Tutulan etiket
  // kopyası özgün kelimenin zamanını taşır, kenar kelimesi atılmadıkça satır daralmaz.
  function etiketsizSatir(s, metin, koru) {
    var y = kelimeKopya(s, metin);
    if (kelimeli(s)) {
      var ws = kelimeEtiketleri(s.words, koru);
      if (ws.length) {
        y.words = ws;
        // kalan ilk kelime özgün ilk kelimeden geç başlıyorsa baştaki kelime(ler) atıldı; sonda tersi
        var a = Number(ws[0].start), b = Number(ws[ws.length - 1].end);
        var a0 = Number(s.words[0].start), b0 = Number(s.words[s.words.length - 1].end);
        if (isFinite(a) && a > a0 && a > y.start && a < y.end) y.start = a;
        if (isFinite(b) && b < b0 && b < y.end && b > y.start) y.end = b;
      } else delete y.words;
    }
    return y;
  }

  // Whisper'ın bilinen halüsinasyonlarını süz
  var JUNK = /^(altyaz[ıi]\s*m\.?\s*k\.?|abone olmay[ıi] unutmay[ıi]n)$/i;
  /*
   * secenek.etiketKoru: true -> ses etiketleri atılmaz, "[Müzik]" biçimine getirilir
   * (Ayarlar › Altyazı › Ses etiketlerini koru). Girdi satırları değiştirilmez: etiketli
   * satırın yerine kopyası döner.
   */
  function cleanSegments(segs, secenek) {
    var koru = !!(secenek && secenek.etiketKoru);
    var out = [];
    var junk = JUNK;
    var lastText = "", repeat = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var t = s.text;
      if (!t) continue;
      var et = sesEtiketleri(t, koru);
      // Yalnız ses etiketinden oluşan satır ("(alkış)", "[Müzik]") takılma zincirini keser: iki
      // konuşma arasındaki alkış onları "art arda aynı satır" yapmaz (filtre öncesi davranış).
      // Böylece aynı ses, "Ses etiketlerini koru" açık da kapalı da aynı konuşmayı verir.
      if (et !== t && !et) { lastText = ""; repeat = 0; continue; }   // atılan etiket satırı
      if (koru && gurultuMu(t)) {
        // koru: etiket satırı takılma sayılmaz (uzun müzikte motor her pencereye "[Müzik]" yazar)
        if (et !== t) s = etiketsizSatir(s, et, koru);
        lastText = ""; repeat = 0;
        out.push(s);
        continue;
      }
      if (et !== t) {
        s = etiketsizSatir(s, et, koru);
        t = et;
      }
      var norm = t.toLowerCase().replace(/[.,!?;:…]/g, "").replace(/\s+/g, " ").trim();
      if (!norm) continue; // sadece noktalamadan olusan segment ("...")
      if (junk.test(norm)) continue;
      if (norm === lastText) {
        repeat++;
        if (repeat >= 2) continue; // 3+ kez aynı satır: takılma, at
      } else { repeat = 0; }
      lastText = norm;
      out.push(s);
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
        // ölçülmüş kelimeler konuşmanın sürdüğünü gösteriyorsa son kelimeden önce kırpma
        if (kelimeli(s)) yeni = Math.max(yeni, Math.min(s.end, Number(s.words[s.words.length - 1].end) || yeni));
        var next = segs[i + 1];
        if (next && yeni > next.start - GAP) yeni = Math.max(s.start + 0.5, next.start - GAP);
        var kirpik = { start: s.start, end: yeni, text: s.text, confidence: s.confidence };
        if (kelimeli(s)) {
          var kalan = s.words.filter(function (w) { return Number(w.start) < yeni; }).map(function (w) {
            var y = { text: w.text, start: w.start, end: Math.min(Number(w.end), yeni) };
            if (w.p !== undefined) y.p = w.p;
            return y;
          });
          if (kalan.length) kirpik.words = kalan;
        }
        return kirpik;
      }
      return s;
    });
  }

  /*
   * Satır uzunluğunu (maxLines satır × maxChars) ya da maxDur süresini aşan satırı kelime sınırında
   * böler: parça sayısı açgözlü karakter doldurmayla bulunur, parçalar dengelenir (caption-layout.js
   * karakterleBol). Eski eşit kelime bölmesi bütçeyi aşabiliyordu ("kötü değil, değil mi?" 20 karakterde
   * 21 olurdu). Ölçülmüş kelimeler metinle bire bir tutuyorsa parçalar ÖLÇÜLMÜŞ zamanla bölünür (parça =
   * ilk kelimesinin başı); tutmuyorsa süre karakter oranıyla paylaşılır, kelimeler orta noktalarıyla dağılır.
   */
  function splitLong(segs, maxChars, maxDur, maxLines) {
    var out = [];
    maxLines = Math.max(1, Math.floor(Number(maxLines)) || 1);
    segs.forEach(function (s) {
      var text = String(s.text || "").trim();
      var dur = s.end - s.start;
      if (!text) return;
      var sigar = maxLines > 1 && CL ? CL.sigarMi(text.split(/\s+/), maxChars, maxLines) : text.length <= maxChars;
      if (sigar && dur <= maxDur) { out.push(s); return; }
      if (!CL) { out.push(s); return; }      // düzen modülü yoksa (olmamalı) satır bölünmeden kalır
      var enAz = dur > maxDur ? Math.ceil(dur / maxDur) : 1;
      CL.karakterleBol(s, maxChars, { maxLines: maxLines, enAz: enAz }).forEach(function (p) { out.push(p); });
    });
    return out;
  }

  /*
   * Motor çıktısından (sekans zamanına taşınmış) ekrandaki altyazı satırları.
   * captions.js go() ve rehberin hazır örnek transkripti (ornekYukle) AYNI yolu
   * kullanır: iki yol ayrışırsa örnekte görülen satırlar gerçek çıktıyla tutmaz.
   *   lenVal: "k1" kelime kelime · "kc" birikimli · "wN" N kelime · "cN" N karakter (eski yol)
   *           "l32" / "l42" kelime zamanından tek satır · "c42x2" iki satır × 42 (YouTube / TV)
   *   secenek.etiketKoru: ses etiketlerini "[Müzik]" biçiminde tut (varsayılan: at)
   *   secenek.maxWords: satır modlarında kelime sınırı (0 = kapalı, 2..12)
   *   secenek.birlestir: kısa parçaları birleştir (varsayılan açık; kelime modlarında hiç)
   *   secenek.minSure / maxSure: satır modlarında en kısa / en uzun ekran süresi (0,8 / 6 sn)
   *   secenek.sonSinir: en kısa süre uzatmasının üst sınırı, sekans zamanı (klip / In-Out / ses sonu);
   *           verilmezse motor satırlarının en geç bitişi: son satır sesin ötesine uzamaz
   * l32/l42/c42x2 satırları ölçülmüş kelimelerden kurulur (caption-layout.js kelimedenSatirlar);
   * kelime yoksa l32/l42 bugünkü c32/c42 yolunun aynısıdır, c42x2 aynı yolu iki satırlık bütçeyle izler.
   * Döner: { segments, mode } — mode: "k1" | "kc" | "w" | "plain"
   */
  function segmentleriKur(mapped, lenVal, secenek) {
    lenVal = String(lenVal || "c42");
    secenek = secenek || {};
    var liste = (mapped || []).slice();
    var olculmus = !!WW && liste.some(kelimeli);
    if (/^k/.test(lenVal)) {
      // Satırlar ölçülmüş kelime taşıyorsa (yerel -ojf) kelime cue'ları onlardan kurulur:
      // tek transkripsiyon, tek önbellek girdisi. Satırın kelimesi yoksa satırın kendisi tek öğe.
      // Bulut kelime öğelerinde de ses etiketi kelimeleri ("[Music]", "(alkış)") atılır.
      if (olculmus) liste = WW.duzlestir(cleanSegments(liste, secenek));
      else liste = kelimeEtiketleri(liste, !!secenek.etiketKoru);
      // kelime bazında yalnız boş/noktalama filtresi; tekrar filtresi meşru kelimeleri yer.
      // Boşluklu tire (" - ", " — ") ölçülmüş kelimelerde kendi öğesidir: tek başına cue olmaz
      liste = liste.filter(function (s) {
        return String(s.text || "").replace(/[.,!?;:…\-–—]/g, "").trim();
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
    if (/^w\d+$/.test(lenVal)) {
      var n = parseInt(lenVal.slice(1), 10) || 3;
      var temiz = cleanSegments(liste, secenek);
      // her satırın ölçülmüş kelimesi varsa: segment sınırını aşan N kelimelik gruplar (duraklama
      // ve cümle sonunda kırılır); yoksa bugünkü orantılı bölme
      if (olculmus && temiz.length && temiz.every(kelimeli) && !temiz.some(function (x) { return BOSLUKSUZ_YAZI.test(x.text); })) {
        return { segments: WW.kelimeGrupla(WW.duzlestir(temiz), n), mode: "w" };
      }
      return { segments: splitWords(trimOverlongCues(temiz), n), mode: "w" };
    }
    var ayar = CL ? CL.uzunlukAyari(lenVal) : null;
    if (ayar && (ayar.tur === "l" || ayar.maxLines > 1)) return satirModu(liste, ayar, olculmus, secenek);
    liste = trimOverlongCues(cleanSegments(liste, secenek));
    return { segments: splitLong(liste, parseInt(lenVal.slice(1), 10) || 42, 4.5), mode: "plain" };
  }

  /*
   * Bozuk kelime zamanı: motor kelimeleri bir ana yığmış (belirteç zamanı gelmemiş). Ölçüt:
   *   - bir satırın 5+ kelimesi, kelime başına 0,06 sn'den az aralıkla başlıyor (saniyede ~16+ kelime:
   *     konuşmada olmaz): kelimeSegmentiBozuk, ya da
   *   - 8+ kelimenin hepsi 1 sn'den kısa bir aralıkta başlıyor (k1 / kc korumasıyla aynı ölçüt):
   *     kelimelerHepsiYigili.
   * kelimeZamaniBozuk: ikisinden biri (tek bir bozuk satır yeter). Satır modu bütün transkripti yalnız
   * ikinci ölçütte (ya da HER satır bozukken) kelimesiz kurar; tek tük bozuk satırın kelimeleri kendi
   * satırına yayılır, sağlam satırlar ölçülmüş kelimelerini korur (satirModu).
   */
  // Satırın geçerli kelime başlangıçları: { n, bas, son } (kelimesizse n = 0)
  function kelimeAraligi(s) {
    var bas = Infinity, son = -Infinity, n = 0;
    if (!kelimeli(s)) return { n: 0, bas: bas, son: son };
    for (var j = 0; j < s.words.length; j++) {
      var t = Number(s.words[j] && s.words[j].start);
      if (!isFinite(t)) continue;
      n++;
      if (t < bas) bas = t;
      if (t > son) son = t;
    }
    return { n: n, bas: bas, son: son };
  }
  function kelimeSegmentiBozuk(s) {
    var a = kelimeAraligi(s);
    return a.n >= 5 && a.son - a.bas < 0.06 * (a.n - 1);
  }
  function kelimelerHepsiYigili(segs) {
    var tMin = Infinity, tMax = -Infinity, say = 0;
    (segs || []).forEach(function (s) {
      var a = kelimeAraligi(s);
      if (!a.n) return;
      say += a.n;
      if (a.bas < tMin) tMin = a.bas;
      if (a.son > tMax) tMax = a.son;
    });
    return say >= 8 && tMax - tMin < 1;
  }
  function kelimeZamaniBozuk(segs) {
    var saglam = [];
    for (var i = 0; i < (segs || []).length; i++) {
      if (kelimeSegmentiBozuk(segs[i])) return true;
      saglam.push(segs[i]);
    }
    return kelimelerHepsiYigili(saglam);
  }

  /*
   * Bozuk satırın kelimeleri (bir ana yığılmış) satırın kendi süresine karakter ağırlığıyla yayılır:
   * stil motorunun kelimesiz satırdaki yedeğiyle aynı tahmin. VAD'ın uzattığı satır sonu önce makul
   * okuma süresine kırpılır (trimOverlongCues): yoksa kelimeler aralarındaki boşlukta tek tek kırılırdı.
   * Kelime metinleri ve p korunur; girdi değişmez.
   */
  function kelimeleriYay(s) {
    var kopya = {};
    for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k) && k !== "words") kopya[k] = s[k];
    var bas = Number(s.start), son = Number(s.end);
    if (!isFinite(bas)) bas = 0;
    if (!isFinite(son) || son < bas) son = bas;
    son = Math.max(bas, Number(trimOverlongCues([{ start: bas, end: son, text: String(s.text || "") }])[0].end) || bas);
    var kelimeler = s.words.filter(function (w) { return w && String(w.text == null ? "" : w.text).trim(); });
    var toplam = 0;
    kelimeler.forEach(function (w) { toplam += Math.max(1, String(w.text).trim().length); });
    var acc = 0;
    kopya.words = kelimeler.map(function (w) {
      var a = bas + (son - bas) * (acc / toplam);
      acc += Math.max(1, String(w.text).trim().length);
      var y = { text: w.text, start: Math.round(a * 1000) / 1000, end: Math.round((bas + (son - bas) * (acc / toplam)) * 1000) / 1000 };
      if (w.p !== undefined) y.p = w.p;
      return y;
    });
    if (!kopya.words.length) delete kopya.words;
    return kopya;
  }

  // Satır modunda ekran süresi uzatmasının üst sınırı: verilen ses / klip sonu, yoksa motor satırlarının
  // en geç bitişi (son satır sesin, klibin ya da sekansın sonundan öteye uzamasın)
  function uzamaSiniri(liste, secenek) {
    var verilen = Number(secenek && secenek.sonSinir);
    if (secenek && secenek.sonSinir !== null && secenek.sonSinir !== undefined && secenek.sonSinir !== "" &&
        isFinite(verilen) && verilen > 0) return verilen;
    var enGec = -Infinity;
    (liste || []).forEach(function (s) {
      var e = Number(s && s.end);
      if (isFinite(e) && e > enGec) enGec = e;
    });
    return isFinite(enGec) ? enGec : undefined;
  }

  // Okunabilir satır modu (l32 / l42 / c42x2): ayar = CL.uzunlukAyari(lenVal)
  function satirModu(liste, ayar, olculmus, secenek) {
    var o = {
      maxChars: ayar.maxChars, maxLines: ayar.maxLines, maxWords: secenek.maxWords, araKir: 0.6,
      minSure: secenek.minSure, maxSure: secenek.maxSure, aralik: 0.2, sonSinir: uzamaSiniri(liste, secenek)
    };
    function sure(x, v, enAz) { var n = Number(x); return x !== null && x !== undefined && x !== "" && isFinite(n) && n >= enAz ? n : v; }
    o.minSure = sure(secenek.minSure, 0.8, 0);
    o.maxSure = sure(secenek.maxSure, 6, 0.5);
    if (o.maxSure < o.minSure) o.maxSure = o.minSure;
    var birlestir = secenek.birlestir !== false;
    var temiz = cleanSegments(liste, secenek);
    // bozuk kelime zamanı (motor kelimeleri bir ana yığmış): bütün kelimeler bir anda ya da HER kelimeli
    // satır bozuksa ölçülmüş kelimeler bırakılır, satırlar segment zamanlarıyla kurulur (k1 korumasının
    // "satır modunu kullan" önerisi burada çalışmalı). Yalnız bazı satırlar bozuksa (ör. sondaki yığılmış
    // "İzlediğiniz için teşekkürler") yalnız onların kelimeleri kendi satırına yayılır: sağlam satırlar
    // ölçülmüş kelimelerini (satır içi karaoke, kelime hizalama, ölçülmüş bölme) korur.
    if (olculmus) {
      var kelimeliSay = 0, bozukSay = 0;
      temiz.forEach(function (s) {
        if (!kelimeli(s)) return;
        kelimeliSay++;
        if (kelimeSegmentiBozuk(s)) bozukSay++;
      });
      if (kelimelerHepsiYigili(temiz) || (kelimeliSay && bozukSay === kelimeliSay)) {
        temiz = WW.kelimesizKopya(temiz);
        olculmus = false;
      } else if (bozukSay) {
        temiz = temiz.map(function (s) { return kelimeSegmentiBozuk(s) ? kelimeleriYay(s) : s; });
      }
    }
    var cues;
    if (olculmus && temiz.length && temiz.every(kelimeli) && !temiz.some(function (x) { return BOSLUKSUZ_YAZI.test(x.text); })) {
      // ölçülmüş kelimelerden: segment sınırını aşar; karakter, kelime, duraklama, cümle sonu ve sürede kırılır.
      // kelimedenSatirlar her öbeği zaten en az satırla kurar ve öbekler yalnız cümle sonunda ya da
      // araKir'dan (0,6 sn) uzun duraklamada ayrılır: birleştirme burada bir şey değiştirmez (güvenlik ağı)
      cues = CL.kelimedenSatirlar(WW.duzlestir(temiz), o);
      if (birlestir) cues = CL.kisaBirlestir(cues, o);
      cues = CL.zamanHijyeni(cues, o);
    } else if (ayar.maxLines > 1) {
      // kelimesiz iki satır: bugünkü yol, iki satırlık bütçe ve ekran süresi kurallarıyla. En uzun süreyi
      // aşan satır önce bölünür (zamanHijyeni yalnız bölünemeyen tek kelimeyi kırpar; konuşma sürerken
      // altyazı kaybolmaz)
      cues = trimOverlongCues(temiz);
      if (birlestir) cues = CL.kisaBirlestir(cues, o);
      cues = CL.zamanHijyeni(splitLong(cues, ayar.maxChars, o.maxSure, ayar.maxLines), o);
    } else {
      // kelimesiz l32 / l42: bugünkü c32 / c42 yolunun aynısı
      return { segments: splitLong(trimOverlongCues(temiz), ayar.maxChars, 4.5), mode: "plain" };
    }
    if (ayar.maxLines > 1) cues.forEach(function (c) { c.text = CL.dengeliSar(c.text, ayar.maxChars, ayar.maxLines); });
    return { segments: cues, mode: "plain" };
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
   * Anahtar kelime vurgusu (*kelime*). Altyazi Efektleri isaretli kelimeyi vurgu
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
    // satır kırılımı (2 satır × 42, Shift+Enter) korunur; yalnız noktalamadan oluşan satır düşer
    if (!o.punct) out = out.replace(NOKTALAMA, " ").replace(/[^\S\n]+/g, " ").replace(/ *\n[\s]*/g, "\n").trim();
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
    gurultuMu: gurultuMu,
    sesEtiketleri: sesEtiketleri,
    kelimeEtiketleri: kelimeEtiketleri,
    SES_ETIKETLERI: SES_ETIKETLERI.slice(),
    sondaTakilma: sondaTakilma,
    katmanSuresi: katmanSuresi,
    logoKatmanKalan: logoKatmanKalan,
    karaokeWords: karaokeWords,
    karaokeCumulative: karaokeCumulative,
    splitWords: splitWords,
    trimOverlongCues: trimOverlongCues,
    splitLong: splitLong,
    segmentleriKur: segmentleriKur,
    kelimeZamaniBozuk: kelimeZamaniBozuk,
    kelimeSegmentiBozuk: kelimeSegmentiBozuk,
    kelimelerHepsiYigili: kelimelerHepsiYigili,
    parseGlossary: parseGlossary,
    trReplace: trReplace
  };
});
