/*
 * Suflo — Tek Tık Temizlik: tekrar çekimler ve yarım başlangıçlar
 *
 * Kelime zamanlı transkriptten, konuşmacının BAŞTAN ALDIĞI cümleleri bulur:
 *   - tekrar çekim  (aynı cümle iki-üç kez okunmuş: "Bugün size … gösterecağim." ×3)
 *   - yarım çekim   (cümle yarıda bırakılıp baştan alınmış)
 *   - yarım başlangıç ("Şimdi şu…" — iki sözcük sonra kesip yeniden başlamak)
 * Her grupta bir çekim tutulur (politika: son / en uzun / en akıcı / senaryo /
 * AI cevabı), gerisi kesilir. İsteğe bağlı senaryo hizalaması ve AI cevabının
 * sıkı doğrulaması da burada. Kesim aralıkları ÜRETİLMEZ: labelWords kelimeleri
 * etiketler, mevcut SufloTextCut.buildCuts aralıkları kurar.
 *
 * Saf ve durumsuz (ES5, UMD): DOM'a ve Premiere'e dokunmaz; Node'da test edilir.
 * Kural eşikleri bir prototipte bulunan yanlış pozitiflere göre sıkılaştırıldı:
 * yalnız KOMŞU cümleler karşılaştırılır (ortak açılışlar — "Şimdi size…",
 * "Bu videoda…" — böylece işaretlenmez).
 */
(function (root, factory) {
  var TC = (root && root.SufloTextCut) ||
    (typeof require === "function" ? require("./textcut.js") : null);
  var api = factory(TC);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloRetakes = api;
})(typeof window !== "undefined" ? window : this, function (TC) {
  "use strict";

  var PAUSE = 0.6;          // bu kadar sessizlik cümleyi böler (sn)
  var MAX_TOK = 25;         // çok uzun "cümle" bölünür
  var KOMSU = 3;            // j en fazla sonraki 3 cümle içinde
  var KOMSU_SN = 30;        // j, i bittikten en geç 30 sn sonra başlar
  var FS_SN = 8;            // yarım başlangıç: 8 sn içinde yeniden açılış

  var CUES = {
    tr: ["baştan alıyorum", "baştan alayım", "bir daha", "tekrar alayım", "tekrar alıyorum", "pardon", "dur dur", "yok yok", "kes kes"],
    az: ["bir daha", "yenidən", "bağışlayın"],
    en: ["let me start over", "start over", "again", "sorry", "one more time", "let me redo that"]
  };

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // Belirteç: normalize (Türkçe İ/ı), kesme işareti/boşluk yok ("İstanbul'da" = "istanbulda")
  function tokOf(text, lang) {
    return TC.normalize(text, lang).replace(/ /g, "");
  }

  var tokEq = TC.stemEq;

  // tokEq ile en uzun ortak alt dizi (yalnız uzunluk)
  function lcs(a, b) {
    var n = a.length, m = b.length;
    if (!n || !m) return 0;
    var prev = new Array(m + 1), cur = new Array(m + 1), i, j;
    for (j = 0; j <= m; j++) prev[j] = 0;
    for (i = 1; i <= n; i++) {
      cur[0] = 0;
      for (j = 1; j <= m; j++) {
        cur[j] = tokEq(a[i - 1], b[j - 1]) ? prev[j - 1] + 1 : (prev[j] > cur[j - 1] ? prev[j] : cur[j - 1]);
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[m];
  }

  /*
   * sim(a, b): { dice, pref }
   *   dice = 2·LCS/(|a|+|b|)
   *   pref = LCS(a, b[0..|a|+1])/|a| (yalnız |a| < |b| iken; yoksa 0) — a, b'nin yarım bırakılmış başı mı?
   */
  function sim(a, b) {
    var L = lcs(a, b);
    var dice = (a.length + b.length) ? 2 * L / (a.length + b.length) : 0;
    var pref = 0;
    if (a.length && a.length < b.length) pref = lcs(a, b.slice(0, a.length + 1)) / a.length;
    return { dice: dice, pref: pref };
  }

  function bitti(text) { return /[.!?。！？]["'”’»)]*$/.test(String(text || "").trim()); }
  function yarimMi(text) { return /(…|\.\.\.|-|–)["'”’»)]*$/.test(String(text || "").trim()); }
  function noktalamaVar(words) {
    for (var i = 0; i < words.length; i++) if (/[.!?…,]/.test(String(words[i] && words[i].text || ""))) return true;
    return false;
  }

  /*
   * Kelimeleri cümlelere böl. Doner: [{ id, a, b (kelime indeksleri, dahil),
   *   start, end, text, tok[], terminated, yarim, fillers, conf }]
   * Groq/OpenAI kelimelerinde noktalama yok: yalnız duraksamaya göre bölünür,
   * noktalama kuralları (terminated/yarım) kapanır. whisper.cpp noktalaması ipucudur.
   */
  function sentences(words, opts) {
    opts = opts || {};
    var lang = opts.lang || "tr";
    var pause = opts.pause != null ? Number(opts.pause) : PAUSE;
    var punct = opts.punct != null ? !!opts.punct : noktalamaVar(words || []);
    var out = [], cur = null;
    function kapat() {
      if (!cur) return;
      var son = words[cur.b];
      cur.terminated = punct && (bitti(son.text) || yarimMi(son.text));
      cur.yarim = punct && yarimMi(son.text);
      cur.end = Number(son.end);
      cur.conf = cur._nc ? cur._cs / cur._nc : null;
      delete cur._cs; delete cur._nc;
      cur.text = cur._t.join(" "); delete cur._t;
      cur.id = out.length;
      out.push(cur);
      cur = null;
    }
    for (var i = 0; i < (words || []).length; i++) {
      var w = words[i];
      if (!w || !isFinite(Number(w.start)) || !isFinite(Number(w.end))) continue;
      if (cur && Number(w.start) - Number(words[cur.b].end) >= pause) kapat();
      if (!cur) cur = { a: i, b: i, start: Number(w.start), tok: [], fillers: 0, _cs: 0, _nc: 0, _t: [], n: 0 };
      cur.b = i;
      cur.n++;
      cur._t.push(String(w.text || "").trim());
      if (isFinite(Number(w.confidence))) { cur._cs += Number(w.confidence); cur._nc++; }
      if (TC.fillerKind(w.text, lang)) cur.fillers++;
      else { var t = tokOf(w.text, lang); if (t) cur.tok.push(t); }
      if ((punct && (bitti(w.text) || yarimMi(w.text))) || cur.n >= MAX_TOK) kapat();
    }
    kapat();
    out.punct = punct;
    return out;
  }

  function cueMu(s, lang) {
    var liste = (CUES[lang] || []).concat(lang === "en" ? [] : CUES.en.filter(function (c) { return c === "sorry"; }));
    if (!s.tok.length) return false;
    var metin = " " + s.tok.join(" ") + " ";
    for (var i = 0; i < liste.length; i++) {
      var c = liste[i].split(" ").map(function (x) { return tokOf(x, lang); }).join(" ");
      // cümle neredeyse yalnız bu işaretten oluşmalı ("bir daha asla" bir işaret değil)
      if (metin.indexOf(" " + c + " ") !== -1 && s.tok.length <= c.split(" ").length + 2) return true;
    }
    return false;
  }

  // İki cümle arasındaki bağ: null | { rule, conf, dice }
  function bag(si, sj, punct) {
    var a = si.tok, b = sj.tok;
    if (!a.length || !b.length) return null;
    if (sj.start - si.end > KOMSU_SN) return null;
    var s = sim(a, b);
    if (a.length >= 3 && b.length >= 3) {
      if (s.dice >= 0.9) return { rule: "retake", conf: "yuksek", dice: s.dice };
      if (s.dice >= 0.7) {
        var sonA = a.slice(-2), sonB = b.slice(-3), tamam = true;
        for (var k = 0; k < sonA.length; k++) {
          var var_ = false;
          for (var q = 0; q < sonB.length; q++) if (tokEq(sonA[k], sonB[q])) var_ = true;
          if (!var_) tamam = false;
        }
        if (tamam) return { rule: "retake", conf: si.yarim ? "yuksek" : "orta", dice: s.dice };
      }
    }
    if (a.length >= 3 && a.length < b.length && s.pref >= 0.8) {
      return { rule: "abandoned", conf: "yuksek", dice: s.dice };
    }
    // yarım başlangıç: kısa, bitmemiş (ya da yarım) cümle, ilk iki kökü j'yi açıyor
    if (a.length >= 2 && a.length <= 5 && a.length < b.length && (!si.terminated || si.yarim) &&
        b.length >= 2 && tokEq(a[0], b[0]) && tokEq(a[1], b[1]) && sj.start - si.end <= FS_SN) {
      return { rule: "falsestart", conf: si.yarim && punct ? "yuksek" : "orta", dice: s.dice };
    }
    return null;
  }

  // union-find
  function UF(n) {
    var p = []; for (var i = 0; i < n; i++) p.push(i);
    function bul(x) { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }
    return { bul: bul, birlestir: function (a, b) { a = bul(a); b = bul(b); if (a !== b) p[b < a ? a : b] = b < a ? b : a; } };
  }

  /*
   * Akıcılık için cümle başına: dolgu + tekrar + yeniden başlama sayısı
   */
  function puruz(words, s, lang) {
    var parca = words.slice(s.a, s.b + 1);
    var k = TC.classify(parca, { lang: lang, soft: true, phraseRepeats: true });
    var n = 0;
    for (var i = 0; i < k.length; i++) if (k[i]) n++;
    return n;
  }

  /*
   * Grubun tutulacak çekimi. group.takes cümle kimlikleri (sıralı).
   *   policy: "son" | "uzun" | "akici"
   *   ctx: { sents, words, lang } ; group.scriptScore {sid: dice} / group.llmKeep önceliklidir
   * Yarım çekim asla tutulmaz (hepsi yarımsa sonuncusu).
   */
  function choose(group, policy, ctx) {
    var sents = ctx.sents;
    var takes = group.takes.slice();
    var aday = takes.filter(function (id) { return !sents[id].yarim; });
    if (!aday.length) return takes[takes.length - 1];
    if (group.scriptScore) {
      var enIyi = null, puan = -1;
      aday.forEach(function (id) {
        var p = Number(group.scriptScore[id]) || 0;
        if (p >= puan) { puan = p; enIyi = id; }    // eşitlikte sonraki
      });
      if (enIyi != null && puan > 0) return enIyi;
    }
    if (group.llmKeep != null && aday.indexOf(group.llmKeep) !== -1) return group.llmKeep;
    var uz = function (id) { return sents[id].tok.length; };
    if (policy === "uzun") {
      var u = aday[0];
      aday.forEach(function (id) { if (uz(id) >= uz(u)) u = id; });
      return u;
    }
    if (policy === "akici") {
      var words = ctx.words || [], lang = ctx.lang || "tr", punct = sents.punct !== false;
      var best = null, bs = null;
      aday.forEach(function (id) {
        var s = sents[id];
        var skor = [punct && s.terminated ? 1 : 0, -puruz(words, s, lang), s.conf != null ? s.conf : 0];
        var dahaIyi = !bs;
        for (var i = 0; !dahaIyi && i < skor.length; i++) {
          if (skor[i] > bs[i]) { dahaIyi = true; break; }
          if (skor[i] < bs[i]) break;
          if (i === skor.length - 1) dahaIyi = true;  // tam eşitlik: sonraki çekim
        }
        if (dahaIyi) { best = id; bs = skor; }
      });
      return best;
    }
    // "son": son TAM çekim (en uzunun ≥0.7'si) — yarıda kalan son deneme tutulmaz
    var enUzun = 0;
    aday.forEach(function (id) { if (uz(id) > enUzun) enUzun = uz(id); });
    for (var j = aday.length - 1; j >= 0; j--) if (uz(aday[j]) >= 0.7 * enUzun) return aday[j];
    return aday[aday.length - 1];
  }

  /*
   * Senaryo hizalaması: senaryo satırları × cümleler üzerinde tekdüze (monoton) DP.
   * Maliyet = 1 − dice; ortak kökü olmayan çift hiç hesaplanmaz. Bir cümle bir
   * satıra eşlenir ya da "senaryo dışı" kalır (sabit ceza). Aynı satıra birden
   * fazla cümle eşlenebilir (çekimler).
   * Doner: { lineOf: [satır | -1], lines: [{ line, takes, keep, scores }], offscript: [sid] }
   *   - ≥2 çekimli satırda en iyisi tutulur (eşitlikte sonuncusu)
   *   - tek çekimli satırlara dokunulmaz; senaryo dışı cümleler yalnız listelenir
   */
  var ATLA = 0.55;
  function scriptLines(text, lang) {
    var satirlar = [];
    String(text || "").split(/\r?\n/).forEach(function (l) {
      // bir satırda birden çok cümle varsa ayır
      String(l).replace(/([.!?…])\s+/g, "$1\n").split("\n").forEach(function (p) {
        var tok = TC.normalize(p, lang).split(" ").filter(function (t) { return t && !TC.fillerKind(t, lang); })
          .map(function (t) { return tokOf(t, lang); }).filter(Boolean);
        if (tok.length) satirlar.push({ text: p.trim(), tok: tok });
      });
    });
    return satirlar;
  }
  // tokEq(a, b) ise ilk 3 harf ortaktır: bu anahtar LCS için güvenli bir üst sınır verir
  function kokSeti(tok) {
    var o = {};
    for (var i = 0; i < tok.length; i++) o[tok[i].slice(0, 3)] = 1;
    return o;
  }
  function ortakSayi(set, tok) {
    var n = 0;
    for (var i = 0; i < tok.length; i++) if (has(set, tok[i].slice(0, 3))) n++;
    return n;
  }

  function alignScript(scriptText, sents, opts) {
    opts = opts || {};
    var lang = opts.lang || "tr";
    var lines = Array.isArray(scriptText) ? scriptText : scriptLines(scriptText, lang);
    var S = sents.length, L = lines.length;
    var sonuc = { lineOf: [], lines: [], offscript: [], dice: [] };
    if (!L || !S) {
      for (var z = 0; z < S; z++) { sonuc.lineOf.push(-1); sonuc.dice.push(0); }
      return sonuc;
    }
    var kokler = lines.map(function (l) { return kokSeti(l.tok); });
    // dp: son eşlenen satır l (0..L-1) ya da hiç (indeks L) — Float64Array satır satır
    var INF = 1e18;
    var dp = new Float64Array(L + 1), yeni = new Float64Array(L + 1);
    for (var l0 = 0; l0 < L; l0++) dp[l0] = INF;
    dp[L] = 0;
    var secim = [];   // her cümle için: Int32Array(L+1) — -2 atlandı, yoksa önceki satır (L = hiç)
    var maliyetler = [];
    for (var s = 0; s < S; s++) {
      var tk = sents[s].tok;
      var tkSet = kokSeti(tk);
      var mal = new Float64Array(L);
      for (var l = 0; l < L; l++) {
        var lt = lines[l].tok;
        // ön süzgeç: LCS ≤ ortak kök sayısı; dice üst sınırı eşleşmeye yetmiyorsa hesaplama
        var ust = tk.length ? Math.min(ortakSayi(kokler[l], tk), ortakSayi(tkSet, lt)) : 0;
        if (!ust || 2 * ust / (lt.length + tk.length) <= 1 - ATLA) { mal[l] = 1; continue; }
        mal[l] = 1 - sim(lt, tk).dice;
      }
      maliyetler.push(mal);
      var ch = new Int32Array(L + 1);
      // önek-minimum: hiç (L) en başta, sonra 0..l
      var enAz = dp[L], enAzIx = L;
      for (var l2 = 0; l2 < L; l2++) {
        if (dp[l2] < enAz) { enAz = dp[l2]; enAzIx = l2; }
        var atla = dp[l2] + ATLA;
        var esle = mal[l2] < ATLA ? enAz + mal[l2] : INF;
        if (esle <= atla) { yeni[l2] = esle; ch[l2] = enAzIx; }
        else { yeni[l2] = atla; ch[l2] = -2; }
      }
      yeni[L] = dp[L] + ATLA; ch[L] = -2;
      secim.push(ch);
      var t = dp; dp = yeni; yeni = t;
    }
    // geri iz
    var son = L, sonM = dp[L];
    for (var l3 = 0; l3 < L; l3++) if (dp[l3] < sonM) { sonM = dp[l3]; son = l3; }
    var lineOf = new Array(S);
    for (var s2 = S - 1; s2 >= 0; s2--) {
      var c = secim[s2][son];
      if (c === -2) { lineOf[s2] = -1; }
      else { lineOf[s2] = son; son = c; }
    }
    sonuc.lineOf = lineOf;
    var satirCekim = {};
    for (var s3 = 0; s3 < S; s3++) {
      var li = lineOf[s3];
      sonuc.dice.push(li >= 0 ? 1 - maliyetler[s3][li] : 0);
      if (li < 0) { if (sents[s3].tok.length) sonuc.offscript.push(s3); continue; }
      (satirCekim[li] = satirCekim[li] || []).push(s3);
    }
    Object.keys(satirCekim).map(Number).sort(function (a, b) { return a - b; }).forEach(function (li2) {
      var takes = satirCekim[li2];
      if (takes.length < 2) return;
      var scores = {}, keep = takes[0], bp = -1;
      takes.forEach(function (id) {
        var p = 1 - maliyetler[id][li2];
        scores[id] = p;
        if (!sents[id].yarim && p >= bp) { bp = p; keep = id; }
      });
      sonuc.lines.push({ line: li2, takes: takes, keep: keep, scores: scores });
    });
    return sonuc;
  }

  /* ---------------- İsteğe bağlı AI geçişi ---------------- */

  // ~60 cümlelik parçalar, 5 cümle örtüşmeli: [{ from, to }] (to hariç)
  function llmChunks(n, size, overlap) {
    size = size || 60; overlap = overlap != null ? overlap : 5;
    var out = [];
    if (n <= 0) return out;
    var adim = Math.max(1, size - overlap);
    for (var a = 0; a < n; a += adim) {
      out.push({ from: a, to: Math.min(n, a + size) });
      if (a + size >= n) break;
    }
    return out;
  }

  function llmRequest(sents, chunk, model) {
    var satirlar = [];
    for (var i = chunk.from; i < chunk.to; i++) satirlar.push(i + ": " + sents[i].text);
    return {
      model: model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You clean up raw video transcripts. Speakers often say the same sentence several times (retakes) or start a sentence and restart it. " +
            "Given numbered sentences, find groups of sentences that are takes of the SAME sentence. Only group sentences that are close to each other. " +
            "Do not group sentences that merely start the same way but say different things. For each group choose the best take to keep. " +
            "Reply ONLY with JSON: {\"groups\": [{\"ids\": [12, 13], \"keep\": 13}]}. Use {\"groups\": []} if there are none."
        },
        { role: "user", content: satirlar.join("\n") }
      ]
    };
  }

  /*
   * AI cevabını sıkı doğrula; hiçbir girdide fırlatmaz.
   *   chunk: { from, to } — kimlikler bu aralıkta olmalı
   * Kurallar: ≥2 tam sayı kimlik; hepsi parçada; bir kimlik iki grupta olamaz;
   * yayılım ≤6 cümle ve ≤30 sn; keep grubun kimliklerinden biri.
   */
  function parseLLM(text, chunk, sents) {
    var out = [];
    try {
      var t = String(text == null ? "" : text).trim();
      t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
      var j = JSON.parse(t);
      var groups = j && (Array.isArray(j) ? j : j.groups);
      if (!Array.isArray(groups)) return out;
      var kullanilan = {};
      groups.forEach(function (g) {
        if (!g || !Array.isArray(g.ids)) return;
        var ids = [], gecerli = true, gordum = {};
        g.ids.forEach(function (x) {
          var n = Number(x);
          if (typeof x === "boolean" || x === null || x === "" || !isFinite(n) || Math.floor(n) !== n) { gecerli = false; return; }
          if (n < chunk.from || n >= chunk.to || !sents[n]) { gecerli = false; return; }
          if (has(gordum, n)) return;
          gordum[n] = 1;
          ids.push(n);
        });
        if (!gecerli || ids.length < 2) return;
        ids.sort(function (a, b) { return a - b; });
        if (ids[ids.length - 1] - ids[0] > 6) return;
        if (sents[ids[ids.length - 1]].start - sents[ids[0]].end > KOMSU_SN) return;
        for (var i = 0; i < ids.length; i++) if (has(kullanilan, ids[i])) return;
        var keep = Number(g.keep);
        if (ids.indexOf(keep) === -1) return;
        ids.forEach(function (id) { kullanilan[id] = 1; });
        out.push({ ids: ids, keep: keep });
      });
    } catch (e) { return []; }
    return out;
  }

  /* ---------------- Ana giriş ---------------- */

  /*
   * detect(words, opts)
   *   opts.lang, opts.pause, opts.policy ("son" | "uzun" | "akici")
   *   opts.script   yapıştırılmış senaryo metni (isteğe bağlı)
   *   opts.llm      parseLLM sonuçları [{ids, keep}] (isteğe bağlı; sezgisel gruplar çakışmada kazanır)
   * Doner: { sents, groups: [{ id, takes, cues, conf, kind, keep, dropped, on, source, start, end }],
   *          offscript: [sid] }
   */
  function detect(words, opts) {
    opts = opts || {};
    var lang = opts.lang || "tr";
    var sents = sentences(words, { lang: lang, pause: opts.pause, punct: opts.punct });
    var n = sents.length;
    var uf = UF(n);
    var kenar = {};      // "i-j" -> bag
    var cue = [];
    for (var c = 0; c < n; c++) cue.push(cueMu(sents[c], lang));
    function kok(i) { return uf.bul(i); }
    // aradaki cümle atlanabilir mi: kısa, dolgu-yalnız, işaret ya da zaten i/j ile bağlı
    function araUygun(i, j) {
      for (var k = i + 1; k < j; k++) {
        var s = sents[k];
        if (s.tok.length <= 4 || cue[k]) continue;
        if (kok(k) === kok(i) || kok(k) === kok(j)) continue;
        return false;
      }
      return true;
    }
    for (var mesafe = 1; mesafe <= KOMSU; mesafe++) {
      for (var i = 0; i + mesafe < n; i++) {
        var j = i + mesafe;
        if (cue[i] || cue[j]) continue;
        if (mesafe > 1 && !araUygun(i, j)) continue;
        var b = bag(sents[i], sents[j], sents.punct);
        if (!b) continue;
        kenar[i + "-" + j] = b;
        uf.birlestir(i, j);
      }
    }
    // gruplar
    var groups = [];
    for (var s1 = 0; s1 < n; s1++) {
      var r1 = kok(s1);
      if (r1 !== s1) continue;
      var uyeler = [];
      for (var s2 = s1; s2 < n; s2++) if (kok(s2) === r1) uyeler.push(s2);
      if (uyeler.length < 2) continue;
      groups.push(grupKur(uyeler, "heuristic"));
    }
    function grupKur(takes, kaynak) {
      var tumYuksek = true, hepsiFs = true, varKenar = false;
      for (var a = 0; a < takes.length; a++) {
        for (var b2 = a + 1; b2 < takes.length; b2++) {
          var e = kenar[takes[a] + "-" + takes[b2]];
          if (!e) continue;
          varKenar = true;
          if (e.conf !== "yuksek") tumYuksek = false;
          if (e.rule !== "falsestart") hepsiFs = false;
        }
      }
      var cues = [];
      for (var k = takes[0] + 1; k < takes[takes.length - 1]; k++) if (cue[k] && takes.indexOf(k) === -1) cues.push(k);
      var conf = kaynak === "llm" ? "orta" : ((varKenar && tumYuksek) || cues.length ? "yuksek" : "orta");
      return { takes: takes, cues: cues, conf: conf, kind: varKenar && hepsiFs ? "falsestart" : "retake", source: kaynak };
    }
    // AI grupları: sezgisel gruba (ya da birbirine) değen atılır
    var dolu = {};
    groups.forEach(function (g) { g.takes.concat(g.cues).forEach(function (id) { dolu[id] = 1; }); });
    (opts.llm || []).forEach(function (lg) {
      if (!lg || !lg.ids || lg.ids.length < 2) return;
      for (var i2 = 0; i2 < lg.ids.length; i2++) if (has(dolu, lg.ids[i2]) || !sents[lg.ids[i2]]) return;
      var g = grupKur(lg.ids.slice().sort(function (a, b) { return a - b; }), "llm");
      g.cues = g.cues.filter(function (id) { return !has(dolu, id); });
      g.llmKeep = lg.keep;
      g.takes.concat(g.cues).forEach(function (id) { dolu[id] = 1; });
      groups.push(g);
    });
    // senaryo
    var offscript = [];
    if (opts.script && String(opts.script).trim()) {
      var al = alignScript(opts.script, sents, { lang: lang });
      var tutulan = {};
      al.lines.forEach(function (ln) {
        // sezgisel grupla örtüşüyorsa skorları ona ver; yoksa senaryo grubu kur
        var hedef = null;
        groups.forEach(function (g) {
          for (var q = 0; q < ln.takes.length; q++) if (g.takes.indexOf(ln.takes[q]) !== -1) hedef = hedef || g;
        });
        if (hedef) {
          hedef.scriptScore = hedef.scriptScore || {};
          ln.takes.forEach(function (id) { if (hedef.takes.indexOf(id) !== -1) hedef.scriptScore[id] = ln.scores[id]; });
        } else {
          var temiz = ln.takes.filter(function (id) { return !has(dolu, id); });
          if (temiz.length < 2) return;
          var sg = grupKur(temiz, "script");
          sg.conf = ln.scores[ln.keep] >= 0.7 ? "yuksek" : "orta";
          sg.scriptScore = ln.scores;
          temiz.forEach(function (id) { dolu[id] = 1; });
          groups.push(sg);
        }
        ln.takes.forEach(function (id) { tutulan[id] = 1; });
      });
      offscript = al.offscript.filter(function (id) { return !has(dolu, id) && !has(tutulan, id); });
    }
    groups.sort(function (a, b) { return a.takes[0] - b.takes[0]; });
    var ctx = { sents: sents, words: words, lang: lang };
    groups.forEach(function (g, gi) {
      g.id = gi;
      g.keep = choose(g, opts.policy || "son", ctx);
      g.dropped = g.takes.filter(function (id) { return id !== g.keep; }).concat(g.cues);
      g.on = g.conf === "yuksek";
      g.start = sents[g.takes[0]].start;
      g.end = sents[g.takes[g.takes.length - 1]].end;
    });
    return { sents: sents, groups: groups, offscript: offscript };
  }

  // Grubun tutulan çekimini değiştir (UI çipi): dropped yeniden hesaplanır
  function setKeep(res, group, sid) {
    if (group.takes.indexOf(sid) === -1) return false;
    group.keep = sid;
    group.dropped = group.takes.filter(function (id) { return id !== sid; }).concat(group.cues);
    return true;
  }

  /*
   * Kelime etiketleri: "retake" | "falsestart" | "kept" | null.
   * Yalnız açık (on) grupların atılan çekimleri kesim etiketi alır; "kept"
   * görsel içindir (kesilmez). Yarım başlangıç grubunda ve yarım cümlelerde
   * etiket "falsestart". Sonuç TC.classify önerisinin ÜSTÜNE bindirilir,
   * aralıkları mevcut TC.buildCuts kurar.
   */
  function labelWords(words, res) {
    var out = [];
    for (var i = 0; i < words.length; i++) out.push(null);
    if (!res) return out;
    var sents = res.sents;
    res.groups.forEach(function (g) {
      if (!g.on) return;
      g.dropped.forEach(function (sid) {
        var s = sents[sid];
        var etiket = g.kind === "falsestart" || s.yarim ? "falsestart" : "retake";
        for (var k = s.a; k <= s.b; k++) out[k] = etiket;
      });
      var ks = sents[g.keep];
      for (var k2 = ks.a; k2 <= ks.b; k2++) if (!out[k2]) out[k2] = "kept";
    });
    return out;
  }

  // Kelime → { group, sid, rol: "keep" | "drop" | "cue" } (UI için)
  function wordIndex(res) {
    var m = {};
    if (!res) return m;
    res.groups.forEach(function (g) {
      g.takes.concat(g.cues).forEach(function (sid) {
        var s = res.sents[sid];
        var rol = g.cues.indexOf(sid) !== -1 ? "cue" : (sid === g.keep ? "keep" : "drop");
        for (var k = s.a; k <= s.b; k++) m[k] = { group: g.id, sid: sid, rol: rol };
      });
    });
    return m;
  }

  // Açık gruplarda atılan çekim sayısı (özet satırı)
  function droppedCount(res) {
    var n = 0;
    if (!res) return 0;
    res.groups.forEach(function (g) { if (g.on) n += g.takes.length - 1; });
    return n;
  }

  /*
   * Tek inceleme çekmecesi: her kesim aralığı bir satır (işaretli), artı henüz
   * kesilmeyen adaylar (orta güvenli gruplar, senaryo dışı cümleler; işaretsiz).
   *   o.words, o.cut [bool] (son karar: öneri + elle), o.labels [classify + retake etiketi],
   *   o.elle {i: bool}, o.cuts (buildCuts), o.res (detect sonucu)
   * Doner: [{ type: "range" | "group" | "offscript", start, end, reason, checked, words: [i], gid?, sid?, conf? }]
   * reason: "dolgu" | "tekrar" | "tekrar-cekim" | "yarim" | "duraksama" | "senaryo-disi" | "elle"
   */
  function reviewRows(o) {
    var words = o.words || [], cut = o.cut || [], labels = o.labels || [], elle = o.elle || {};
    var res = o.res, rows = [];
    var dis = {};
    if (res && res.offscript) res.offscript.forEach(function (sid) {
      var s = res.sents[sid];
      for (var k = s.a; k <= s.b; k++) dis[k] = sid;
    });
    var ix = 0;
    (o.cuts || []).forEach(function (r) {
      var ws = [];
      while (ix < words.length && (Number(words[ix].start) + Number(words[ix].end)) / 2 < r.start) ix++;
      for (var j = ix; j < words.length && (Number(words[j].start) + Number(words[j].end)) / 2 <= r.end; j++) {
        if (cut[j]) ws.push(j);
      }
      var neden = "duraksama";
      var oncelik = ["retake", "falsestart", "dis", "repeat", "filler", "soft", "elle"];
      var en = oncelik.length;
      ws.forEach(function (i) {
        var l = labels[i], p;
        if (l === "retake") p = 0;
        else if (l === "falsestart") p = 1;
        else if (has(dis, i) && elle[i] === true) p = 2;
        else if (l === "repeat") p = 3;
        else if (l === "filler") p = 4;
        else if (l === "soft") p = 5;
        else p = 6;
        if (p < en) en = p;
      });
      if (ws.length) neden = ["tekrar-cekim", "yarim", "senaryo-disi", "tekrar", "dolgu", "dolgu", "elle"][en];
      rows.push({ type: "range", start: r.start, end: r.end, reason: neden, checked: true, words: ws });
    });
    if (res) {
      res.groups.forEach(function (g) {
        if (g.on) return;
        var ws = [];
        g.dropped.forEach(function (sid) { var s = res.sents[sid]; for (var k = s.a; k <= s.b; k++) ws.push(k); });
        var s0 = res.sents[g.dropped[0]];
        rows.push({ type: "group", gid: g.id, start: s0 ? s0.start : g.start, end: g.end, reason: g.kind === "falsestart" ? "yarim" : "tekrar-cekim",
          conf: g.conf, checked: false, words: ws });
      });
      (res.offscript || []).forEach(function (sid) {
        var s = res.sents[sid], ws = [], biri = false;
        for (var k = s.a; k <= s.b; k++) { ws.push(k); if (cut[k]) biri = true; }
        if (biri) return;          // (bir kısmı) zaten kesim satırında görünüyor
        rows.push({ type: "offscript", sid: sid, start: s.start, end: s.end, reason: "senaryo-disi", checked: false, words: ws });
      });
    }
    rows.sort(function (a, b) { return a.start - b.start; });
    return rows;
  }

  return {
    reviewRows: reviewRows,
    sentences: sentences,
    tokEq: tokEq,
    tokOf: tokOf,
    lcs: lcs,
    sim: sim,
    choose: choose,
    alignScript: alignScript,
    scriptLines: scriptLines,
    llmChunks: llmChunks,
    llmRequest: llmRequest,
    parseLLM: parseLLM,
    detect: detect,
    setKeep: setKeep,
    labelWords: labelWords,
    wordIndex: wordIndex,
    droppedCount: droppedCount,
    CUES: CUES
  };
});
