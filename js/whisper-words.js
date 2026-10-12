/*
 * Suflo — whisper.cpp kelime zamanları (-ojf)
 *
 * Portions adapted from Raunen (https://github.com/Zeyphers/raunen), MIT, Copyright (c) 2026 Jacob Szczepaniak. See THIRD_PARTY_NOTICES.md.
 *
 * Yerel motor (whisper-cli) -oj ile yalnız satır zamanı yazıyordu; belirteç başına
 * metin, zaman (offsets) ve olasılık (p) yalnız -ojf ile gelir. Bu modül o çıktıyı
 * Suflo'nun satır + ölçülmüş kelime modeline çevirir:
 *
 *   segmentleriCoz(json)  -> [{ start, end, text, confidence, words: [{ text, start, end, p }] }]
 *   kelimelereAyir(seg)   -> tek whisper segmentinin kelimeleri (alt-kelime belirteçleri birleşir)
 *   kelimeGrupla(words, n, araKir) -> N kelimelik satırlar (segment sınırını aşar)
 *   duzlestir(segs)       -> düz kelime listesi
 *
 * Böylece tek transkripsiyon hem satır hem kelime kelime (k1/kc/wN) modunu besler,
 * yerel motorun güven değeri (confidence) yeniden tanımlıdır ve karaoke için ikinci
 * "-ml 1 -sow" turuna gerek kalmaz.
 *
 * Saf UMD modülü: DOM yok, dosya sistemi yok, ES5 (CEF 74 / Node 12.3).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloWhisperWords = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // whisper'ın özel belirteçleri: [_BEG_], [_TT_150], [_SOT_]..., <|endoftext|>, <|tr|>
  var OZEL = /^\s*(\[_|<\|)/;
  // Yalnız noktalamadan oluşan belirteç/kelime (sözcüğe yapışır, kendi başına kelime değil)
  var NOKTA = /^[.,!?;:…"'«»“”‘’„()\[\]{}\-–—¿¡、。，！？・]+$/;
  // Açılış işaretleri SONRAKİ kelimeye yapışır, gerisi öncekine
  var ACILIS = /^[«“‘„(\[{¿¡]+$/;
  // Boşlukla ayrılmış tire / uzun tire ara söz işaretidir, sondaki noktalama değil: kendi kelimesi kalır
  var TIRE = /^[\-–—]+$/;
  var CUMLE_SONU = /[.!?…]["'”’»)\]]*$/;
  var HIZA_TOLERANS = 0.02;

  function sayi(x) { var n = Number(x); return isFinite(n) ? n : NaN; }
  function dizi(x) { return Object.prototype.toString.call(x) === "[object Array]"; }
  function ms(x) { return Math.round(x * 1000) / 1000; }
  function kimlik(s) { return s; }
  function olasilik(x) {
    if (x === null || x === undefined || x === "") return null;
    var p = Number(x);
    return isFinite(p) && p >= 0 && p <= 1 ? p : null;
  }

  /*
   * Eski whisper-cli derlemeleri (v1.9.1 öncesi) çok baytlı bir harfi iki belirtece
   * bölüp geçersiz UTF-8 yazabiliyordu. O zaman dosya "latin1" (bayt = karakter)
   * okunur ve UTF-8 çözümü kelime BİRLEŞTİKTEN sonra yapılır: "de" + 0xC4 + 0x9F + "il"
   * yine "değil" olur. Çözülemeyen bayt U+FFFD'ye düşer, asla fırlatmaz.
   */
  function utf8Coz(s) {
    s = String(s == null ? "" : s);
    try {
      if (typeof Buffer !== "undefined" && Buffer.from) return Buffer.from(s, "latin1").toString("utf8");
    } catch (e) {}
    try { return decodeURIComponent(escape(s)); } catch (e2) { return s; }
  }

  // "00:00:01,380" -> 1.38 (offsets yoksa ya da bozuksa timestamps dizgesinden)
  function tcCoz(t) {
    var m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(String(t || ""));
    if (!m) return NaN;
    return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + parseFloat("0." + m[4]);
  }

  // Segmentin sınırları (sn). Önce offsets (ms), sonra timestamps, sonra start/end (sn).
  function segmentSiniri(t) {
    t = t || {};
    var s = NaN, e = NaN;
    if (t.offsets && t.offsets.from !== null && t.offsets.from !== undefined) {
      s = sayi(t.offsets.from) / 1000;
      e = sayi(t.offsets.to) / 1000;
    }
    if ((!isFinite(s) || (s === 0 && e === 0)) && t.timestamps && t.timestamps.from) {
      s = tcCoz(t.timestamps.from);
      e = tcCoz(t.timestamps.to);
    }
    if (!isFinite(s) && isFinite(sayi(t.start))) { s = sayi(t.start); e = sayi(t.end); }
    if (!isFinite(s)) s = 0;
    if (!isFinite(e) || e < s) e = s;
    return { start: s, end: e };
  }

  function belirtecZamani(tok) {
    var o = tok && tok.offsets;
    if (!o || o.from === null || o.from === undefined || o.to === null || o.to === undefined) return null;
    var a = sayi(o.from), b = sayi(o.to);
    if (!isFinite(a) || !isFinite(b)) return null;
    return { from: a / 1000, to: b / 1000 };
  }

  /*
   * whisper.cpp v1.9.1, --vad açıkken SEGMENT zamanlarını özgün sese eşler ama
   * belirteç zamanlarını eşlemez (src/whisper.cpp: whisper_full_get_segment_t0 VAD
   * tablosundan geçer, whisper_full_get_token_data geçmez). Yalnız VAD AÇIKKEN ve
   * stderr'de VAD tablosu (vadEslemesi) bulunamadığında kullanılır: belirteç zamanları
   * segmentin aralığına doğrusal olarak taşınır.
   * VAD kapalıyken KULLANILMAZ: belirteçler segmentle aynı zaman tabanındadır ama
   * aralıkları tutmaz. Pencerenin ilk segmenti dışında segmentin başlangıç zaman
   * belirteci yazılmaz; ilk metin belirtecinin t0'ı önceki segmentin sonundan başlar ve
   * ses enerjisine göre konuşma başına kayar (whisper_exp_compute_token_level_timestamps).
   * O zaman tMin != segment başı olağandır ve doğrusal taşıma kelimeleri erkene çekerdi.
   */
  function zamanHizasi(tokens, sinir) {
    var tMin = Infinity, tMax = -Infinity;
    for (var i = 0; i < tokens.length; i++) {
      var z = belirtecZamani(tokens[i]);
      if (!z) continue;
      if (z.from < tMin) tMin = z.from;
      if (z.to > tMax) tMax = z.to;
    }
    if (!(tMax > tMin) || !(sinir.end > sinir.start)) return kimlik;
    if (Math.abs(tMin - sinir.start) <= HIZA_TOLERANS && Math.abs(tMax - sinir.end) <= HIZA_TOLERANS) return kimlik;
    var k = (sinir.end - sinir.start) / (tMax - tMin);
    return function (t) { return sinir.start + (t - tMin) * k; };
  }

  /*
   * --vad açıkken whisper-cli stderr'e her konuşma parçası için şu satırı yazar (-np yokken):
   *   "whisper_vad: vad_segment_info: orig_start: 12.34, orig_end: 15.60, vad_start: 0.00, vad_end: 3.26"
   * Bu satırlardan whisper'ın KENDİ eşleme tablosu kurulur (src/whisper.cpp whisper_vad: parça
   * başı/sonu, parça sonrası 0,1 sn sessizlik; map_processed_to_original_time: doğrusal ara
   * değer, uçlarda sabit). Belirteç zamanları özgün sese segmentlerle aynı biçimde taşınır;
   * satırın ortasındaki sessizlik de doğru atlanır. Satır yoksa null (doğrusal hizalamaya düşülür).
   */
  function vadEslemesi(stderr) {
    var re = /vad_segment_info:\s*orig_start:\s*([\d.]+),\s*orig_end:\s*([\d.]+),\s*vad_start:\s*([\d.]+),\s*vad_end:\s*([\d.]+)/g;
    var parcalar = [], m;
    var metin = String(stderr == null ? "" : stderr);
    while ((m = re.exec(metin))) parcalar.push({ os: +m[1], oe: +m[2], vs: +m[3], ve: +m[4] });
    if (!parcalar.length) return null;
    var tablo = [];
    parcalar.forEach(function (p, i) {
      tablo.push({ p: p.vs, o: p.os, s: tablo.length });
      tablo.push({ p: p.ve, o: p.oe, s: tablo.length });
      var sonraki = parcalar[i + 1];
      if (sonraki) {
        tablo.push({ p: sonraki.vs - 0.1, o: p.oe, s: tablo.length });   // sessizlik başı
        tablo.push({ p: sonraki.vs, o: sonraki.os, s: tablo.length });   // sessizlik sonu
      }
    });
    tablo.sort(function (a, b) { return a.p - b.p || a.s - b.s; });
    var tekil = [];
    tablo.forEach(function (x) { if (!tekil.length || Math.abs(tekil[tekil.length - 1].p - x.p) > 1e-6) tekil.push(x); });
    return function (t) {
      if (t <= tekil[0].p) return tekil[0].o;
      var son = tekil[tekil.length - 1];
      if (t >= son.p) return son.o;
      for (var i = 1; i < tekil.length; i++) {
        if (tekil[i].p >= t) {
          var a = tekil[i - 1], b = tekil[i];
          if (Math.abs(b.p - t) <= 1e-9) return b.o;
          var fark = b.p - a.p;
          return fark > 0 ? a.o + (t - a.p) * (b.o - a.o) / fark : a.o;
        }
      }
      return son.o;
    };
  }

  function sinirla(x, a, b) { return x < a ? a : (x > b ? b : x); }

  // Zamanı olmayan belirteçler: bilinen komşular arasına karakter ağırlığıyla yayılır
  function bosluklariDoldur(liste, sinir) {
    var n = liste.length, i = 0;
    while (i < n) {
      if (liste[i].bas !== null) { i++; continue; }
      var j = i;
      while (j < n && liste[j].bas === null) j++;
      var L = i > 0 ? liste[i - 1].son : sinir.start;
      var R = j < n ? liste[j].bas : sinir.end;
      if (R < L) R = L;
      var toplam = 0, k;
      for (k = i; k < j; k++) toplam += liste[k].agirlik;
      var acc = 0;
      for (k = i; k < j; k++) {
        liste[k].bas = L + (R - L) * (acc / toplam);
        acc += liste[k].agirlik;
        liste[k].son = L + (R - L) * (acc / toplam);
      }
      i = j;
    }
  }

  /*
   * Tek whisper segmentini (-ojf "transcription" öğesi) kelimelere ayırır.
   * Alt-kelime belirteçleri birleşir: boşlukla başlayan belirteç yeni kelime açar.
   * Özel belirteçler ve boş belirteçler atlanır; zamansız belirteçler komşuları
   * arasına yayılır, hepsi segmente sıkıştırılır. Kelime p = belirteçlerinin en
   * düşük p'si (noktalama belirteci kelimenin zamanına ve p'sine katılmaz).
   * Sondaki noktalama kelimesinde kalır ("değil," / "mi?").
   *   opts.coz     ikili (latin1) okunmuş metin için UTF-8 çözücü
   *   opts.sinir   segment sınırı (yoksa segmentin kendisinden okunur)
   *   opts.vad     vadEslemesi() sonucu: belirteç zamanları whisper'ın VAD tablosuyla taşınır
   *   opts.vadAcik false: VAD kapalıydı, belirteç zamanları olduğu gibi (yalnız segmente
   *                sıkıştırılır). true / verilmezse tablo yoksa doğrusal hizalama (zamanHizasi).
   * Yalnız noktalamadan oluşan kelime öncekine yapışır (açılış işareti sonrakine); boşlukla
   * ayrılmış tire / uzun tire (" - ", " – ", " — ") kendi kelimesidir: kelimeler satır metniyle tutar.
   * Döner: [{ text, start, end, p? }] (belirteç yoksa [])
   */
  // Raunen: tokensToWords
  function kelimelereAyir(seg, opts) {
    opts = opts || {};
    var coz = typeof opts.coz === "function" ? opts.coz : kimlik;
    var tokens = seg && seg.tokens;
    if (!dizi(tokens) || !tokens.length) return [];
    var sinir = opts.sinir || segmentSiniri(seg);
    var esle = typeof opts.vad === "function" ? opts.vad : (opts.vadAcik === false ? kimlik : zamanHizasi(tokens, sinir));

    var liste = [];
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i] || {};
      var ham = String(tok.text == null ? "" : tok.text);
      if (!ham || OZEL.test(ham)) continue;
      if (!/\S/.test(ham) && !liste.length) continue;
      var duz = coz(ham);
      var temiz = duz.replace(/^\s+|\s+$/g, "");
      var z = belirtecZamani(tok);
      var bas = null, son = null;
      if (z) {
        bas = sinirla(esle(z.from), sinir.start, sinir.end);
        son = sinirla(esle(z.to), sinir.start, sinir.end);
        if (son < bas) son = bas;
      }
      liste.push({
        ham: ham, yeni: /^\s/.test(duz) || !liste.length,
        bas: bas, son: son, p: olasilik(tok.p),
        zamansiz: !temiz || NOKTA.test(temiz),
        agirlik: Math.max(1, temiz.length)
      });
    }
    if (!liste.length) return [];
    bosluklariDoldur(liste, sinir);

    // alt-kelime belirteçlerini birleştir
    var gruplar = [];
    liste.forEach(function (t) {
      if (t.yeni || !gruplar.length) gruplar.push({ ham: t.ham, tok: [t] });
      else { gruplar[gruplar.length - 1].ham += t.ham; gruplar[gruplar.length - 1].tok.push(t); }
    });
    var kelimeler = [];
    gruplar.forEach(function (g) {
      var text = coz(g.ham).replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
      if (!text) return;
      var zamanli = g.tok.filter(function (t) { return !t.zamansiz; });
      if (!zamanli.length) zamanli = g.tok;
      var p = null;
      zamanli.forEach(function (t) { if (t.p !== null && (p === null || t.p < p)) p = t.p; });
      kelimeler.push({ text: text, start: zamanli[0].bas, end: zamanli[zamanli.length - 1].son, p: p, nokta: NOKTA.test(text) });
    });

    // yalnız noktalamadan oluşan kelime: açılış işareti sonrakine, gerisi öncekine yapışır;
    // boşlukla ayrılmış tire kendi kelimesidir ("Evet - hayır" -> Evet | - | hayır, "Evet-" değil)
    var out = [];
    var bekleyen = "";
    for (var k = 0; k < kelimeler.length; k++) {
      var w = kelimeler[k];
      if (w.nokta && !TIRE.test(w.text)) {
        var onceVar = out.length > 0;
        var sonraVar = false;
        for (var m = k + 1; m < kelimeler.length; m++) if (!kelimeler[m].nokta) { sonraVar = true; break; }
        if ((ACILIS.test(w.text) && sonraVar) || !onceVar) { bekleyen += w.text; continue; }
        out[out.length - 1].text += w.text;
        continue;
      }
      if (bekleyen) { w.text = bekleyen + w.text; bekleyen = ""; }
      out.push(w);
    }
    if (bekleyen && out.length) out[out.length - 1].text += bekleyen;

    // sıra ve sınır: başlangıçlar azalmaz, bitiş başlangıçtan önce olmaz
    var onceki = sinir.start;
    return out.map(function (w) {
      var s = Math.max(onceki, sinirla(w.start, sinir.start, sinir.end));
      var e = Math.max(s, sinirla(w.end, sinir.start, sinir.end));
      onceki = s;
      var x = { text: w.text, start: ms(s), end: ms(e) };
      if (w.p !== null) x.p = Math.round(w.p * 1000) / 1000;
      return x;
    });
  }

  function ikiliMi(x) {
    return !!x && typeof x === "object" && typeof x.readUInt8 === "function" && typeof x.toString === "function";
  }

  /*
   * -ojf çıktısını Suflo segmentlerine çevirir.
   *   json: ayrıştırılmış nesne, JSON metni ya da Buffer (readFileSync çıktısı;
   *         geçersiz UTF-8 varsa bayt düzeyinde birleştirilir)
   *   bilgi (isteğe bağlı): { dil, belirtecli, vad } doldurulur
   *   secenek.stderr (isteğe bağlı): whisper-cli stderr'i; --vad satırları varsa belirteç
   *         zamanları whisper'ın kendi VAD tablosuyla taşınır (yoksa doğrusal hizalama)
   *   secenek.vadAcik (isteğe bağlı): koşu --vad ile mi yapıldı. false: belirteç zamanları
   *         segmentle aynı tabanda, olduğu gibi kullanılır (doğrusal hizalama YAPILMAZ).
   *         Verilmezse VAD açık olabilir sayılır (tablo yoksa doğrusal hizalama).
   * Döner: [{ start, end, text, confidence, words }] — belirteç yazmayan eski
   * derlemelerde words [] ve confidence undefined.
   */
  function segmentleriCoz(json, bilgi, secenek) {
    var vadAcik = secenek && secenek.vadAcik === false ? false : (secenek && secenek.vadAcik === true ? true : undefined);
    var vad = vadAcik !== false && secenek && secenek.stderr ? vadEslemesi(secenek.stderr) : null;
    var veri = json, coz = kimlik;
    if (ikiliMi(json)) {
      var metin = json.toString("utf8");
      if (metin.indexOf("�") === -1) veri = JSON.parse(metin);
      else { veri = JSON.parse(json.toString("latin1")); coz = utf8Coz; }
    } else if (typeof json === "string") {
      veri = JSON.parse(json);
    }
    var belirtecli = false;
    var liste = veri && dizi(veri.transcription) ? veri.transcription : [];
    var out = liste.map(function (t) {
      t = t || {};
      var sinir = segmentSiniri(t);
      var words = kelimelereAyir(t, { coz: coz, sinir: sinir, vad: vad, vadAcik: vadAcik });
      var ps = [];
      (dizi(t.tokens) ? t.tokens : []).forEach(function (tok) {
        if (!tok || OZEL.test(String(tok.text == null ? "" : tok.text))) return;
        var p = olasilik(tok.p);
        if (p !== null) ps.push(p);
      });
      if (dizi(t.tokens) && t.tokens.length) belirtecli = true;
      var confidence;
      if (ps.length) {
        var top = 0;
        for (var i = 0; i < ps.length; i++) top += ps[i];
        confidence = Math.round(top / ps.length * 1000) / 1000;
      }
      return {
        start: ms(sinir.start), end: ms(sinir.end),
        text: coz(String(t.text == null ? "" : t.text)).replace(/^\s+|\s+$/g, ""),
        confidence: confidence, words: words
      };
    });
    if (bilgi && typeof bilgi === "object") {
      bilgi.dil = veri && veri.result && veri.result.language ? coz(String(veri.result.language)) : "";
      bilgi.belirtecli = belirtecli;
      bilgi.vad = !!vad;
      // kelime zamanlarının özgün sese nasıl taşındığı (günlük / tanı için)
      bilgi.hiza = vad ? "vad-tablosu" : (vadAcik === false ? "yok" : "dogrusal");
    }
    return out;
  }

  // Tek kelime nesnesini düzle: p bilinmiyorsa confidence (bulut kelimeleri) okunur
  function kelime(w) {
    var p = olasilik(w.p);
    if (p === null) p = olasilik(w.confidence);
    var x = { text: String(w.text == null ? "" : w.text).replace(/^\s+|\s+$/g, ""), start: Number(w.start) || 0, end: Number(w.end) || 0 };
    if (x.end < x.start) x.end = x.start;
    if (p !== null) { x.p = p; x.confidence = p; }
    return x;
  }

  function kelimeVar(segs) {
    for (var i = 0; segs && i < segs.length; i++) if (segs[i] && dizi(segs[i].words) && segs[i].words.length) return true;
    return false;
  }

  /*
   * Düz kelime listesi (başlangıca göre sıralı). Kelimesi olmayan segment kendisi tek
   * öğe olur: eski "-ml 1 -sow" ve bulut kelime çıktısı zaten kelime başına segmenttir.
   * Her öğe: { text, start, end, p?, confidence? } (confidence = p; eski tüketiciler için)
   */
  function duzlestir(segs) {
    var out = [];
    (segs || []).forEach(function (s) {
      if (!s) return;
      if (dizi(s.words) && s.words.length) {
        s.words.forEach(function (w) { if (w) { var x = kelime(w); if (x.text) out.push(x); } });
      } else if (String(s.text || "").replace(/\s+/g, "")) {
        var y = kelime({ text: s.text, start: s.start, end: s.end, p: s.p, confidence: s.confidence });
        out.push(y);
      }
    });
    // kararlı sıralama (V8 7.0+ / CEF 74'te Array#sort kararlı)
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  /*
   * Kelimeleri N kelimelik satırlara toplar. Segment sınırlarında sıfırlanmaz
   * (whisper'ın segmentlemesi burada keyfi: her ifadeden sonra bir-iki kelimelik
   * cılız satır kalırdı). Boşalt: her n kelimede, araKir'dan uzun duraklamada ve
   * cümle sonu (. ! ? …) kelimesinden sonra.
   * Döner: [{ start, end, text, confidence, words }]
   */
  // Raunen: splitByWords
  function kelimeGrupla(words, n, araKir) {
    n = Math.max(1, Math.floor(Number(n)) || 3);
    araKir = isFinite(Number(araKir)) && araKir !== null && araKir !== undefined ? Number(araKir) : 0.8;
    var out = [], tampon = [];
    function bosalt() {
      if (!tampon.length) return;
      var parca = tampon;
      tampon = [];
      var text = parca.map(function (w) { return w.text; }).join(" ").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
      if (!text) return;
      var ps = [];
      parca.forEach(function (w) { if (w.p !== undefined) ps.push(w.p); });
      var g = {
        start: parca[0].start,
        end: Math.max(parca[parca.length - 1].end, parca[0].start + 0.05),
        text: text,
        words: parca.map(function (w) { var y = { text: w.text, start: w.start, end: w.end }; if (w.p !== undefined) y.p = w.p; return y; })
      };
      if (ps.length) {
        var top = 0;
        for (var i = 0; i < ps.length; i++) top += ps[i];
        g.confidence = top / ps.length;
      }
      out.push(g);
    }
    (words || []).forEach(function (w0) {
      if (!w0) return;
      var w = kelime(w0);
      if (!w.text) return;
      var onceki = tampon[tampon.length - 1];
      if (onceki && w.start - onceki.end > araKir) bosalt();
      tampon.push(w);
      if (tampon.length >= n || CUMLE_SONU.test(w.text)) bosalt();
    });
    bosalt();
    return out;
  }

  // Segmentleri (ve kelimelerini) sekans zamanına taşı: t' = ofset + t * carpan
  function zamanEsle(segs, ofset, carpan) {
    ofset = Number(ofset) || 0;
    carpan = Number(carpan) > 0 ? Number(carpan) : 1;
    return (segs || []).map(function (s) {
      var x = {};
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) x[k] = s[k];
      x.start = ofset + Number(s.start) * carpan;
      x.end = ofset + Number(s.end) * carpan;
      if (dizi(s.words)) {
        // kelimeler ms'ye yuvarlanır: taslak, geri al yığını ve önbellek şişmesin
        x.words = s.words.map(function (w) {
          var y = {};
          for (var j in w) if (Object.prototype.hasOwnProperty.call(w, j)) y[j] = w[j];
          y.start = ms(ofset + Number(w.start) * carpan);
          y.end = ms(ofset + Number(w.end) * carpan);
          return y;
        });
      }
      return x;
    });
  }

  /* ---------------- Editör: kelimeleri satırla birlikte taşı ---------------- */

  // *vurgu* işaretleri ayıklandıktan sonra kalan kelime sayısı (yalnız yıldızdan oluşan parça sayılmaz)
  function belirtecSayisi(text) {
    return String(text || "").split(/\s+/).filter(function (w) { return w.replace(/\*/g, "").length > 0; }).length;
  }

  // Metin yalnız *vurgu* işaretleriyle mi değişti? (o zaman ölçülmüş kelimeler geçerli kalır)
  function yalnizVurgu(eski, yeni) {
    function n(t) { return String(t || "").replace(/\*/g, "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""); }
    return n(eski) === n(yeni);
  }

  function kelimeleriKaydir(words, d) {
    if (!dizi(words)) return words;
    d = Number(d) || 0;
    return words.map(function (w) {
      var y = {};
      for (var k in w) if (Object.prototype.hasOwnProperty.call(w, k)) y[k] = w[k];
      y.start = ms(Number(w.start) + d);
      y.end = ms(Number(w.end) + d);
      return y;
    });
  }

  /*
   * Satır bölme: a | b metinlerinin kelime sayısı satırın kelimeleriyle tutuyorsa
   * kesme noktası ÖLÇÜLMÜŞ zamandır (b'nin ilk kelimesinin başı); tutmuyorsa
   * verilen tahmin kullanılır ve kelimeler orta noktalarına göre zamanla dağıtılır.
   * Döner: { kesme, olculmus, a: [..]|null, b: [..]|null }
   */
  function bolmeNoktasi(seg, aMetin, bMetin, tahmin) {
    var words = seg && dizi(seg.words) ? seg.words : null;
    var sonuc = { kesme: tahmin, olculmus: false, a: null, b: null };
    if (!words || !words.length) return sonuc;
    var na = belirtecSayisi(aMetin), nb = belirtecSayisi(bMetin);
    var bas = Number(seg.start), son = Number(seg.end);
    if (na > 0 && nb > 0 && na + nb === words.length) {
      var k = Number(words[na].start);
      if (isFinite(k) && k > bas + 0.05 && k < son - 0.05) {
        sonuc.kesme = k;
        sonuc.olculmus = true;
        sonuc.a = words.slice(0, na);
        sonuc.b = words.slice(na);
        return sonuc;
      }
    }
    var a = [], b = [];
    words.forEach(function (w) { ((Number(w.start) + Number(w.end)) / 2 < sonuc.kesme ? a : b).push(w); });
    sonuc.a = a.length ? a : null;
    sonuc.b = b.length ? b : null;
    return sonuc;
  }

  // Satır birleştirme: iki tarafın da kelimesi varsa (boş metinli taraf kelimesiz sayılır) birleşir
  function birlestirKelimeler(a, b) {
    function taraf(s) {
      if (s && dizi(s.words) && s.words.length) return s.words;
      return belirtecSayisi(s && s.text) === 0 ? [] : null;
    }
    var wa = taraf(a), wb = taraf(b);
    if (!wa || !wb) return null;
    var hepsi = wa.concat(wb);
    if (!hepsi.length) return null;
    hepsi.sort(function (x, y) { return Number(x.start) - Number(y.start); });
    return hepsi;
  }

  /*
   * Ayarlara (settings.json) yazılacak satır kopyası: ölçülmüş kelimeler (words, origWords)
   * düşer. Shorts kayıtları settings.json'da durur ve dosya her ayar değişikliğinde baştan,
   * girintili yazılır; kelime başına nesne dosyayı birkaç kat şişirirdi. Kelimesiz satırda
   * stil motoru karakter ağırlıklı yedeğe döner. Girdi değişmez.
   */
  function kelimesizKopya(segs) {
    return (dizi(segs) ? segs : []).map(function (s) {
      var x = JSON.parse(JSON.stringify(s == null ? null : s));
      if (x && typeof x === "object") { delete x.words; delete x.origWords; }
      return x;
    });
  }

  return {
    kelimesizKopya: kelimesizKopya,
    kelimelereAyir: kelimelereAyir,
    segmentleriCoz: segmentleriCoz,
    vadEslemesi: vadEslemesi,
    kelimeGrupla: kelimeGrupla,
    duzlestir: duzlestir,
    kelimeVar: kelimeVar,
    zamanEsle: zamanEsle,
    belirtecSayisi: belirtecSayisi,
    yalnizVurgu: yalnizVurgu,
    kelimeleriKaydir: kelimeleriKaydir,
    bolmeNoktasi: bolmeNoktasi,
    birlestirKelimeler: birlestirKelimeler,
    segmentSiniri: segmentSiniri,
    utf8Coz: utf8Coz
  };
});
