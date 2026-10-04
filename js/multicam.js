/*
 * Suflo Podcast Modu — mikrofona göre otomatik kamera geçişi (saf modül)
 *
 * Her konuşmacının kendi mikrofonu (ayrı ses katmanı) ve kendi kamerası (ayrı video
 * katmanı) vardır. Bu modül mikrofonların 100 ms'lik enerji serisinden kimin konuştuğunu
 * çıkarır ve kamera planı kurar: [{ start, end, cam }]. cam = konuşmacı sırası (0..n-1)
 * ya da WIDE (geniş plan). DOM'a, ağa, Premiere'e dokunmaz; panel (multicam-ui.js) ve
 * testler aynı kodu kullanır.
 *
 * Akış: energyFromPcm (dBFS) → normalizeSeries (mikrofon kazancı farkını sil, gürültü
 * tabanı kapısı) → activity (pencere başına baskın konuşmacı / sessizlik / çapraz konuşma)
 * → buildPlan (histerezis, en kısa / en uzun plan, geniş plan) → host'a kesim ve aç/kapa.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloMulticam = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var FLOOR = -100;        // sessizlik tabanı (dBFS)
  var SILENCE = -1;        // activity: kimse konuşmuyor
  var CROSSTALK = -2;      // activity: iki (ya da daha çok) kişi aynı anda
  var WIDE = -3;           // plan: geniş plan kamerası
  var GATE_OFF = -120;     // normalize edilmiş seride kapının altında kalan pencere
  var SESSIZ_P95 = -55;    // p95'i bunun altında kalan mikrofon sessiz sayılır (kapalı / solo)
  var COK_GECIS = 400;     // bu sayının üstünde geçiş "çok sık" uyarısı alır
  var ADAY_SESSIZ = 1.0;   // aday konuşmacı bu kadar susarsa adaylığı düşer (sn)

  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

  /*
   * İşaretli 16 bit PCM (Int16Array ya da sayı dizisi) → pencere başına dBFS.
   * Tam ölçek sinüs (genlik 1) RMS'i 1/√2'dir: −3.01 dBFS. Sessizlik FLOOR'a kırpılır.
   * Son yarım pencere de (varsa) kendi örnekleriyle hesaplanır.
   */
  function energyFromPcm(pcm, sr, win) {
    sr = num(sr, 8000); win = num(win, 0.1);
    var n = pcm ? pcm.length : 0;
    var ws = Math.max(1, Math.round(sr * win));
    var out = [];
    for (var i = 0; i < n; i += ws) {
      var son = Math.min(n, i + ws), toplam = 0;
      for (var j = i; j < son; j++) { var s = pcm[j] / 32768; toplam += s * s; }
      var rms = Math.sqrt(toplam / (son - i));
      var db = rms > 0 ? 20 * Math.log(rms) / Math.LN10 : FLOOR;
      out.push(db < FLOOR ? FLOOR : Math.round(db * 100) / 100);
    }
    return out;
  }

  function percentile(arr, p) {
    if (!arr || !arr.length) return FLOOR;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
    return s[idx];
  }

  /*
   * Mikrofonlar arası kazanç farkını sil: her mikrofonun p95'i (konuşma seviyesi) 0 dB'e
   * çekilir. p10 gürültü tabanıdır; tabanın biraz üstünde kalmayan pencere kapıda kalır
   * (GATE_OFF). Kapı konuşma seviyesinin 20 dB yakınına girmez: hep konuşulan bir mikrofonda
   * p10 konuşmaya denk gelse bile konuşma kesilmez.
   * Dönüş: { levels: [[...]], p95: [], p10: [], ref: [konuşma seviyesi], silent: [mikrofon sırası] }
   */
  function normalizeSeries(series, opts) {
    opts = opts || {};
    var tabanPay = num(opts.floorMarginDb, 6);
    var esik = num(opts.silentDb, SESSIZ_P95);
    var out = { levels: [], p95: [], p10: [], ref: [], silent: [] };
    (series || []).forEach(function (s, k) {
      s = s || [];
      var p95 = percentile(s, 95), p10 = percentile(s, 10);
      // Sahibi sürenin %5'inden azında konuşan mikrofonda p95 komşunun sızıntısına denk gelir;
      // p99 p95'ten 6 dB'den fazla yüksekse konuşma seviyesi oradadır
      var p99 = percentile(s, 99);
      var ref = p99 - p95 > 6 ? p99 : p95;
      // taban kapısı konuşma seviyesinin 20 dB yakınına girmez (hep konuşulan mikrofonda p10 konuşmadır)
      var kapi = Math.min(p10 + tabanPay, ref - 20);
      out.p95.push(p95); out.p10.push(p10); out.ref.push(ref);
      if (p95 < esik) out.silent.push(k);
      out.levels.push(s.map(function (v) {
        return (v > kapi && v > FLOOR) ? Math.round((v - ref) * 100) / 100 : GATE_OFF;
      }));
    });
    return out;
  }

  /*
   * Pencere başına baskın konuşmacı. Baskınlık = kendi normalize seviyesi eksi en gürültülü
   * diğer mikrofon: komşu mikrofona sızan ses (bleed) birkaç dB geride kaldığı için geçişe
   * yol açmaz. Dönüş: konuşmacı sırası, SILENCE (-1) ya da CROSSTALK (-2).
   * levels: normalizeSeries(...).levels ya da doğrudan normalize seri dizisi.
   */
  function activity(levels, opts) {
    opts = opts || {};
    if (levels && levels.levels) levels = levels.levels;
    var marj = num(opts.switchMarginDb, 6), kapi = num(opts.gateDb, -25);
    var k = levels ? levels.length : 0, n = 0, i, w;
    for (i = 0; i < k; i++) n = Math.max(n, (levels[i] || []).length);
    var out = [];
    for (w = 0; w < n; w++) {
      var en = -1, enV = -Infinity, ikinciV = -Infinity;
      for (i = 0; i < k; i++) {
        var v = num(levels[i][w], GATE_OFF);
        if (v > enV) { ikinciV = enV; enV = v; en = i; }
        else if (v > ikinciV) ikinciV = v;
      }
      if (en < 0 || enV <= kapi) { out.push(SILENCE); continue; }
      if (enV - ikinciV >= marj || ikinciV <= kapi) out.push(en);
      else out.push(CROSSTALK);
    }
    return out;
  }

  /*
   * Kamera planı. act: activity çıktısı (pencere başına). Seçenekler (saniye):
   *   win 0.1 · minShot 2 · maxShot 12 · holdMs 400 · wideCam (geniş plan var mı)
   *   wideOnCrosstalk (çapraz konuşmada geniş) · widePeriodic (her N sn'de geniş; 0 kapalı)
   *   wideDur (zorunlu geniş planın süresi, en az minShot) · duration (yoksa act uzunluğu)
   * Kurallar: aday konuşmacı holdMs boyunca sürmeli VE mevcut plan minShot'ı doldurmuş
   * olmalı; sessizlik kamerayı tutar; çapraz konuşma geniş plana (yoksa tutar); maxShot'ı
   * aşan tek kişilik konuşma ve widePeriodic geniş plana kısa bir kaçış yapar.
   * Dönüş: [0, duration]'ı boşluksuz kaplayan [{ start, end, cam }].
   */
  function buildPlan(act, opts) {
    opts = opts || {};
    act = act || [];
    var win = num(opts.win, 0.1);
    var minShot = Math.max(0, num(opts.minShot, 2));
    var maxShot = num(opts.maxShot, 12);
    var hold = Math.max(0, num(opts.holdMs, 400)) / 1000;
    var genis = !!opts.wideCam;
    var capraz = genis && opts.wideOnCrosstalk !== false;
    var periyot = genis ? Math.max(0, num(opts.widePeriodic, 0)) : 0;
    var genisSure = Math.max(minShot, num(opts.wideDur, 2.5));
    var sure = num(opts.duration, act.length * win);
    if (!(sure > 0)) return [];
    var eps = win / 1000;
    function zaman(w) { return Math.round(w * win * 1e6) / 1e6; }

    // ilk kamera: ilk net konuşmacı; hiç yoksa geniş (varsa) ya da 0
    var cur = genis ? WIDE : 0, i;
    for (i = 0; i < act.length; i++) {
      if (act[i] >= 0) { cur = act[i]; break; }
      if (act[i] === CROSSTALK && capraz) { cur = WIDE; break; }
    }
    // ilk plan için minShot beklenmez: baştaki kısa parça sonra komşusuna katılır
    var plan = [], curStart = 0, curMin = 0;
    // Zorunlu geniş kaçıştan sonra konuşan hâlâ konuşuyorsa aday olur ve curMin dolunca dönülür;
    // sessizlikte geniş planda kalınır (yeni konuşan gelince ona geçilir).
    var cand = null, candStart = 0, candN = 0, candSon = 0;
    var sonGenis = 0;   // son geniş planın bittiği an (periyodik geniş plan sayacı)
    function gec(t, cam, enAz) {
      if (t <= curStart + eps) { cur = cam; curMin = enAz; return; }
      plan.push({ start: curStart, end: t, cam: cur });
      if (cur === WIDE) sonGenis = t;
      cur = cam; curStart = t; curMin = enAz; cand = null;
    }

    for (var w = 0; w < act.length; w++) {
      var t = zaman(w), tSon = zaman(w + 1);
      if (t >= sure - eps) break;
      var a = act[w];
      var hedef;
      if (a >= 0) hedef = a;
      else if (a === CROSSTALK) hedef = capraz ? WIDE : cur;
      else hedef = null;   // sessizlik: kamerayı tut, adayı bozma

      if (hedef !== null) {
        if (hedef === cur) cand = null;
        else if (cand !== hedef) { cand = hedef; candStart = t; candN = 0; }
        if (cand === hedef) { candN++; candSon = tSon; }
      } else if (cand !== null && t - candSon > ADAY_SESSIZ) cand = null;   // aday sustu
      // aday yalnız kendi konuştuğu pencerelerle birikir: kısa bir "evet"in ardından gelen
      // sessizlik geçişe yol açmaz
      if (cand !== null && cand !== cur && candN * win >= hold - eps && tSon >= curStart + curMin - eps) {
        gec(Math.max(candStart, curStart + curMin), cand, minShot);
        continue;
      }
      // tek kişilik uzun plan / periyodik geniş plan: kısa geniş kaçış
      if (genis && cur !== WIDE && tSon - curStart >= curMin - eps) {
        var uzun = maxShot > 0 && tSon - curStart >= maxShot - eps;
        var vakit = periyot > 0 && tSon - sonGenis >= periyot - eps;
        if ((uzun || vakit) && tSon + genisSure <= sure + eps) {
          gec(tSon, WIDE, genisSure);
          continue;
        }
      }
    }
    plan.push({ start: curStart, end: sure, cam: cur });
    return mergePlan(plan, minShot);
  }

  // minShot'tan kısa parçaları komşusuna kat, aynı kameralı komşuları birleştir
  function mergePlan(plan, minShot) {
    var p = plan.filter(function (s) { return s.end > s.start; }).map(function (s) { return { start: s.start, end: s.end, cam: s.cam }; });
    var degisti = true;
    while (degisti && p.length > 1) {
      degisti = false;
      for (var i = 0; i < p.length; i++) {
        if (p[i].end - p[i].start >= minShot - 1e-6) continue;
        if (i > 0) p[i - 1].end = p[i].end; else p[i + 1].start = p[i].start;
        p.splice(i, 1);
        degisti = true;
        break;
      }
      for (var j = p.length - 1; j > 0; j--) {
        if (p[j].cam === p[j - 1].cam) { p[j - 1].end = p[j].end; p.splice(j, 1); degisti = true; }
      }
    }
    return p;
  }

  // Bir kameranın açılıp kapandığı anlar (yalnız kendi geçişleri; 0 ve son hariç)
  function switchTimesForCam(plan, cam) {
    var out = [];
    for (var i = 1; i < (plan || []).length; i++) {
      var once = plan[i - 1].cam === cam, simdi = plan[i].cam === cam;
      if (once !== simdi) out.push(plan[i].start);
    }
    return out;
  }

  // t anındaki kamera (ikili arama); plan dışı anlar en yakın uca düşer
  function camAt(plan, t) {
    if (!plan || !plan.length) return null;
    var lo = 0, hi = plan.length - 1;
    if (t < plan[0].start) return plan[0].cam;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (plan[mid].start <= t) lo = mid; else hi = mid - 1;
    }
    return plan[lo].cam;
  }

  /*
   * [a, b] aralığında en çok konuşan (activity çoğunluğu). src: { act, win } ya da act dizisi.
   * Kimse konuşmuyorsa -1. Eşitlikte aralığın ortasındaki konuşmacı kazanır.
   */
  function speakerFor(src, a, b) {
    var act = src && src.act ? src.act : src;
    var win = src && src.win ? src.win : 0.1;
    if (!act || !act.length || !(b >= a)) return -1;
    var i0 = Math.max(0, Math.floor(a / win + 1e-9)), i1 = Math.min(act.length - 1, Math.max(i0, Math.ceil(b / win - 1e-9) - 1));
    if (i0 > act.length - 1) return -1;
    var say = {}, en = -1, enN = 0;
    for (var i = i0; i <= i1; i++) {
      var v = act[i];
      if (v < 0) continue;
      say[v] = (say[v] || 0) + 1;
      if (say[v] > enN) { enN = say[v]; en = v; }
    }
    if (en < 0) return -1;
    var orta = act[Math.min(act.length - 1, Math.floor((a + b) / 2 / win))];
    if (orta >= 0 && orta !== en && say[orta] === enN) return orta;
    return en;
  }

  // Özet: geçiş sayısı ve kamera payları (0..1). Metin panelde kurulur (çeviri katmanı).
  function planStats(plan) {
    plan = plan || [];
    var toplam = 0, pay = {}, sira = [];
    plan.forEach(function (s) {
      var d = s.end - s.start;
      toplam += d;
      if (!(s.cam in pay)) { pay[s.cam] = 0; sira.push(s.cam); }
      pay[s.cam] += d;
    });
    sira.forEach(function (c) { pay[c] = toplam > 0 ? pay[c] / toplam : 0; });
    var gecis = Math.max(0, plan.length - 1);
    return { switches: gecis, share: pay, cams: sira, duration: toplam, warn: gecis > COK_GECIS };
  }

  function chunk(arr, n) {
    n = Math.max(1, Math.floor(num(n, 40)));
    var out = [];
    for (var i = 0; i < (arr || []).length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  /*
   * Host'a giden biçim. camTracks: konuşmacı sırasına göre video katmanı; wideTrack geniş
   * plan katmanı (yoksa -1). Dönüş: { plan: [{ s, e, t }], cuts: [{ track, t }], tracks: [...] }
   * Her kamera katmanı yalnız kendi açılış / kapanış anlarında kesilir.
   */
  function hostPlan(plan, camTracks, wideTrack) {
    function iz(cam) { return cam === WIDE ? wideTrack : camTracks[cam]; }
    var tracks = [];
    (camTracks || []).forEach(function (t) { if (t >= 0 && tracks.indexOf(t) < 0) tracks.push(t); });
    if (wideTrack >= 0 && tracks.indexOf(wideTrack) < 0) tracks.push(wideTrack);
    var hp = (plan || []).map(function (s) { return { s: s.start, e: s.end, t: iz(s.cam) }; });
    // aynı katmana düşen komşular birleşir (iki konuşmacı tek kamerayı paylaşıyorsa)
    var birlesik = [];
    hp.forEach(function (s) {
      var son = birlesik[birlesik.length - 1];
      if (son && son.t === s.t) son.e = s.e; else birlesik.push({ s: s.s, e: s.e, t: s.t });
    });
    var cuts = [];
    tracks.forEach(function (t) {
      for (var i = 1; i < birlesik.length; i++) {
        if ((birlesik[i - 1].t === t) !== (birlesik[i].t === t)) cuts.push({ track: t, t: birlesik[i].s });
      }
    });
    cuts.sort(function (a, b) { return a.t - b.t || a.track - b.track; });
    return { plan: birlesik, cuts: cuts, tracks: tracks };
  }


  /*
   * Katman düzeninden eşleme önerisi (Sekansı tara). Katman sırasıyla: klipli ses katmanları
   * mikrofon, klipli (multicam olmayan) video katmanları kamera; konuşmacı sayısı 2–4.
   * Konuşmacılardan fazla kamera katmanı varsa ve kameralar kadar uzunsa sıradaki geniş plan olur.
   * Dönüş: { speakers: [{ name, mic, cam }], wide: video sırası ya da -1 }
   */
  var HARF = ["A", "B", "C", "D"];
  function suggestMapping(layout, n) {
    layout = layout || {};
    var ses = (layout.audio || []).filter(function (t) { return t.clipCount > 0; });
    var vid = (layout.video || []).filter(function (t) { return t.clipCount > 0 && !t.hasMulticam; });
    if (!n) n = Math.max(2, Math.min(4, ses.length, Math.max(2, vid.length)));
    n = Math.max(2, Math.min(4, n));
    var sp = [];
    for (var i = 0; i < n; i++) {
      var a = ses[i], v = vid[i];
      var ad = a && a.name && !/^(audio|ses|a)\s*\d+$/i.test(a.name) ? String(a.name).slice(0, 24) : HARF[i];
      sp.push({ name: ad, mic: a ? a.index : -1, cam: v ? v.index : -1 });
    }
    // geniş plan yalnız kameralar kadar uzun bir katmansa önerilir (logo / yazı katmanı kesilmesin)
    var ref = 0;
    for (i = 0; i < n; i++) if (vid[i]) ref = Math.max(ref, vid[i].last - vid[i].first);
    var aday = vid[n], w = aday && ref > 0 && (aday.last - aday.first) >= ref * 0.9 ? aday.index : -1;
    return { speakers: sp, wide: w };
  }

  // Eşleme denetimi: hata kodları panelde metne çevrilir
  function checkMapping(m) {
    var sp = (m && m.speakers) || [];
    if (sp.length < 2 || sp.length > 4) return { kod: "sayi" };
    var mic = {}, i;
    for (i = 0; i < sp.length; i++) {
      if (!(sp[i].mic >= 0)) return { kod: "mik_yok", i: i };
      if (!(sp[i].cam >= 0)) return { kod: "kam_yok", i: i };
      if (mic[sp[i].mic]) return { kod: "mik_ayni", i: i };
      mic[sp[i].mic] = 1;
    }
    if (m.wide >= 0) for (i = 0; i < sp.length; i++) if (sp[i].cam === m.wide) return { kod: "genis_ayni", i: i };
    return null;
  }

  /*
   * Ses dosyası → 8 kHz mono 16 bit ham PCM → dBFS serisi. dep: { run(cmd, args, opts) → Promise<{ code }>,
   * fs, path }. o: { ff, input, tmpDir, ss, t, offset (sn, başa eklenen sessizlik), silInput, win }
   * Geçici dosyalar (ham PCM ve silInput ise girdi) her durumda silinir.
   */
  var PCM_SR = 8000;
  function pcmArgs(input, out, o) {
    o = o || {};
    var a = ["-hide_banner", "-nostdin", "-y"];
    if (o.ss > 0) a.push("-ss", String(o.ss));
    if (o.t > 0) a.push("-t", String(o.t));
    a.push("-i", input, "-vn", "-ac", "1", "-ar", String(PCM_SR), "-f", "s16le", "-acodec", "pcm_s16le", out);
    return a;
  }
  function bufferToInt16(buf) {
    var n = Math.floor(buf.length / 2), out = new Int16Array(n);
    for (var i = 0; i < n; i++) { var v = buf[2 * i] | (buf[2 * i + 1] << 8); out[i] = v >= 32768 ? v - 65536 : v; }
    return out;
  }
  // Buffer'ı kopyalamadan örnek dizisi gibi okuyan hafif görünüm (energyFromPcm yalnız length ve [i] ister)
  function int16Gorunum(buf) {
    var n = Math.floor(buf.length / 2);
    if (buf.byteOffset % 2 === 0) return new Int16Array(buf.buffer, buf.byteOffset, n);
    return bufferToInt16(buf);
  }
  function energyFromFile(dep, o) {
    o = o || {};
    var win = num(o.win, 0.1);
    var raw = dep.path.join(o.tmpDir, "suflo-podcast-" + Date.now() + "-" + Math.floor(Math.random() * 1e6) + ".pcm");
    function temizle() {
      try { if (dep.fs.existsSync(raw)) dep.fs.unlinkSync(raw); } catch (e1) {}
      if (o.silInput) { try { if (dep.fs.existsSync(o.input)) dep.fs.unlinkSync(o.input); } catch (e2) {} }
    }
    var is;
    try {
      is = Promise.resolve(dep.run(o.ff, pcmArgs(o.input, raw, o), { timeout: num(o.timeout, 1800000) }));
    } catch (e) { temizle(); return Promise.reject(e); }
    return is.then(function (r) {
      if (!r || r.code !== 0 || !dep.fs.existsSync(raw)) {
        throw new Error("ffmpeg ses çözülemedi" + (r && r.stderr ? ": " + String(r.stderr).split(/\r?\n/).filter(Boolean).slice(-1)[0] : ""));
      }
      // Buffer doğrudan okunur: saatlik kayıtta ikinci bir Int16 kopyası belleği ikiye katlamasın
      var seri = energyFromPcm(int16Gorunum(dep.fs.readFileSync(raw)), PCM_SR, win);
      var bas = Math.round(num(o.offset, 0) / win);
      if (bas > 0) { var on = []; for (var i = 0; i < bas; i++) on.push(FLOOR); seri = on.concat(seri); }
      temizle();
      return seri;
    }).catch(function (e) { temizle(); throw e; });
  }

  // Mikrofon serilerini aynı uzunluğa getir (eksik uç sessizlik)
  function padSeries(series, n) {
    var m = n || 0;
    (series || []).forEach(function (s) { m = Math.max(m, (s || []).length); });
    return (series || []).map(function (s) {
      s = (s || []).slice(0, m);
      while (s.length < m) s.push(FLOOR);
      return s;
    });
  }

  return {
    FLOOR: FLOOR, SILENCE: SILENCE, CROSSTALK: CROSSTALK, WIDE: WIDE, GATE_OFF: GATE_OFF,
    SESSIZ_P95: SESSIZ_P95, COK_GECIS: COK_GECIS,
    energyFromPcm: energyFromPcm,
    percentile: percentile,
    normalizeSeries: normalizeSeries,
    activity: activity,
    buildPlan: buildPlan,
    mergePlan: mergePlan,
    switchTimesForCam: switchTimesForCam,
    camAt: camAt,
    speakerFor: speakerFor,
    planStats: planStats,
    chunk: chunk,
    hostPlan: hostPlan,
    suggestMapping: suggestMapping,
    checkMapping: checkMapping,
    pcmArgs: pcmArgs,
    bufferToInt16: bufferToInt16,
    energyFromFile: energyFromFile,
    padSeries: padSeries,
    PCM_SR: PCM_SR
  };
});
