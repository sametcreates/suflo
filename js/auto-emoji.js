/*
 * Suflo Auto Emoji — altyazıya anlamına göre emoji
 *
 * Satırdaki anahtar sözcüklere bakarak satır sonuna tek bir emoji önerir.
 * Türkçe ekler için kök eşleşmesi kullanılır ("para", "paraları", "paramı"
 * → 💰). Yoğunluk sınırı ve tekrar koruması vardır: art arda satırlara emoji
 * yağdırmaz, aynı emojiyi yakın satırlarda tekrar etmez. Yalnız panelin
 * çevrimdışı SVG yedeği olan emojiler kullanılır (emoji/esleme.json).
 * Saf modül: DOM'a dokunmaz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloAutoEmoji = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  /*
   * [emoji, [kökler], ek?] — kök, sözcüğün BAŞINA eşleşir (Türkçe ekler serbest).
   * Kısa ve çok anlamlı kökler (or. "art" -> "artık") bilerek yok: yanlış emoji,
   * emojisizden kötü. Sonu boşlukla biten kök ("dua ") yalnız TAM sözcüğe uyar.
   * Sıra önceliktir: üstteki kural önce kazanır. Bu yüzden özgül kökler genel olanlardan
   * önce gelir ("kazanan" 🏆, "kazan" 💰'dan önce; aynı emoji birden çok kuralda olabilir).
   * ek (isteğe bağlı):
   *   haric: kökle başlayan ama başka anlamdaki sözcük başları ("sakın" → "sakınca"); sonu boşlukla biten
   *          yalnız TAM sözcüğü dışlar ("hatay " şehir, "Hatay'da" dahil; "hatayı" / "hataya" ⚠️ alır)
   *   tam:   yalnız TAM sözcük olarak eşleşen kökler (ek almaz)
   *   fiil:  -yor öncesi ünlü daralması olan fiil kökleri ("başla" → "başlıyor", "bekle" → "bekliyor");
   *          kökün kendisi de normal kök gibi eşleşir
   *   baglam: satırın (küçük harfli, boşlukla çevrili) metnine bakan işlev; false ise kural atlanır
   */
  // "doğru" çoğu kez yön/edat ("eve doğru"): yalnız cevap olarak ("Doğru!", "çok doğru", "doğru mu") ✅
  var DOGRU_CEVAP = / (çok|kesinlikle|aynen|gayet|tamamen|bu|evet) doğru |^ doğru( evet)? $| doğru (mu|mı|değil mi|söylüyorsun|söyledin|cevap) /;
  var KURALLAR = {
    tr: [
      ["🏆", ["kazanan", "şampiyon"]],
      ["💰", ["para", "kazan", "zengin", "maaş", "gelir", "bütçe", "dolar", "euro", "lira"],
        { haric: ["paralel", "paraşüt", "parazit", "parantez", "paramparça", "paragraf", "paradoks", "parametre", "paravan"] }],
      ["💸", ["harca", "masraf", "borç", "pahalı", "ödeme", "zarar"], { fiil: ["harca"] }],
      ["📈", ["büyüme", "büyüyor", "büyüdü", "artış", "artıyor", "arttı", "yüksel", "grafik", "istatistik", "satış"]],
      ["🚀", ["hızlı", "roket", "uçuyor", "uçtu", "lansman"], { fiil: ["başla", "fırla", "patla"] }],
      ["🔥", ["ateş", "sıcak", "efsane", "harika", "muhteşem", "çılgın", "viral", "trend"], { haric: ["ateşkes"] }],
      ["💡", ["fikir", "ipucu", "tüyo", "öneri", "püf", "akıl", "çözüm"], { haric: ["akıl almaz"] }],
      ["⚠️", ["dikkat", "uyarı", "tehlike", "sakın", "hata", "yanlış"], { haric: ["hatay ", "hatasız", "sakınca", "dikkate değer", "dikkat çekici"] }],
      ["✅", ["başar", "bitir", "hallet", "kesinlikle"], { haric: ["başarısız"] }],
      ["✅", ["doğru"], { tam: ["doğru"], baglam: function (s) { return DOGRU_CEVAP.test(s); } }],
      ["❌", ["hayır", "asla", "yasak", "olmaz", "yapma "]],
      ["❓", ["neden", "niye", "nasıl", "acaba", "soru"], { haric: ["nedeniyle"] }],
      ["🤔", ["düşün", "merak", "sanırım", "belki"]],
      ["😂", ["güldü", "gülme", "komik", "espri", "şaka", "kahkaha"]],
      ["😱", ["korku", "kork", "şok", "inanılmaz", "inanamad"]],
      ["😍", ["aşk", "aşığ", "bayıl", "sevgi", "güzel"]],
      ["❤️", ["seviyorum", "sevdim", "seviyor", "kalp", "teşekkür", "minnet"], { haric: ["kalp kriz"] }],
      ["🙏", ["lütfen", "rica ", "dua ", "dualar", "şükür"]],
      ["💪", ["güçlü", "spor", "antrenman", "kaslar", "pes etme", "azim"]],
      ["🏆", ["ödül", "birinci", "zafer", "rekor"]],
      ["🎯", ["hedef", "amaç", "odak", "nişan"]],
      ["⏰", ["saat ", "saatte", "dakika", "geç kal", "acele", "erken"], { fiil: ["bekle"] }],
      ["📱", ["telefon", "uygulama", "instagram", "tiktok", "mesaj", "iphone", "android"]],
      ["🎬", ["video", "film", "kurgu", "montaj", "sahne", "çekim"]],
      ["🎥", ["kamera", "kayıt", "lens"]],
      ["🎧", ["kulaklık", "dinle", "podcast"]],
      ["🎵", ["müzik", "şarkı", "melodi", "ritim"]],
      ["🎁", ["hediye", "çekiliş", "sürpriz", "bedava", "ücretsiz"]],
      ["😴", ["uyku", "uyu", "yorgun", "sıkıcı"], { haric: ["uyumlu", "uyul", "uyuş"] }],
      ["🥶", ["soğuk", "buz", "kış", "dondu"]],
      ["🤯", ["akıl almaz", "beyin", "çıldır"]],
      ["👏", ["tebrik", "alkış", "bravo", "helal"]],
      ["🤝", ["anlaş", "ortak", "işbirliği", "birlikte", "sponsor"]],
      ["👇", ["aşağı", "yorum", "açıklama"]],
      ["⭐", ["yıldız", "favori", "en iyi"]],
      ["📌", ["önemli", "not al", "unutma", "kaydet"]]
    ],
    en: [
      ["🏆", ["winner", "champion"]],
      ["💰", ["money", "cash", "rich", "earn", "salary", "income", "profit", "dollar"]],
      ["💸", ["spend", "expensive", "debt", "cost", "pay"]],
      ["📈", ["grow", "increase", "rise", "sales", "chart"]],
      ["🚀", ["launch", "start", "fast", "rocket", "boost"]],
      ["🔥", ["fire", "hot ", "amazing", "insane", "crazy", "viral", "awesome"]],
      ["💡", ["idea", "tip", "hack", "trick", "solution"]],
      ["⚠️", ["warning", "careful", "danger", "mistake", "wrong"]],
      ["✅", ["correct", "done", "yes", "success", "right"]],
      ["❌", ["never", "don t ", "forbidden"]],
      ["❓", ["why", "how", "question"]],
      ["🤔", ["think", "wonder", "maybe", "perhaps"]],
      ["😂", ["funny", "laugh", "joke", "lol"]],
      ["😱", ["scary", "shock", "unbelievable"]],
      ["❤️", ["love", "heart", "thank"]],
      ["💪", ["strong", "power", "workout", "gym"]],
      ["🏆", ["win ", "won ", "award", "record"]],
      ["🎯", ["goal", "target", "focus"]],
      ["⏰", ["time ", "hour", "minute", "late ", "hurry"]],
      ["📱", ["phone", "app ", "apps ", "instagram", "tiktok", "message"]],
      ["🎬", ["video", "film", "edit", "scene"]],
      ["🎵", ["music", "song", "beat"]],
      ["🎁", ["gift", "giveaway", "free", "surprise"]],
      ["👇", ["comment", "below", "description"]]
    ]
  };

  // Diger semboller (⏰ 23F0, ⭐ 2B50) + cesitli semboller + astral (cift vekil) emojiler
  var EMOJI_RE = /[⌀-⏿☀-➿⬀-⯿]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;

  function loc(lang) { return lang === "az" ? "az" : (lang === "en" ? undefined : "tr"); }

  // Türkçe büyük harf: toLocaleLowerCase("tr") yerel destek olmayan motorda "İ"yi "i\u0307" yapar; önce elle
  function kucult(s, l) {
    s = String(s || "");
    if (l) {
      s = s.replace(/İ/g, "i").replace(/I/g, "ı");
      try { s = s.toLocaleLowerCase(l); } catch (e) { s = s.toLowerCase(); }
      return s.replace(/\u0307/g, "");
    }
    return s.toLowerCase();
  }

  var AYIRAC = /[.,!?;:…"'“”‘’«»()\[\]{}\-–—*]/g;
  function sozcukler(text, lang) {
    return kucult(text, loc(lang)).replace(AYIRAC, " ").replace(/\s+/g, " ").trim();
  }

  /*
   * -yor öncesi ünlü daralması: kök a/e ile bitiyorsa son ünlü, öncesindeki ünlüye göre
   * ı/i/u/ü olur ("başla" → "başlı", "bekle" → "bekli", "oyna" → "oynu", "söyle" → "söylü").
   * Dönen biçim önek olarak eşleşir ("başlıyoruz", "bekliyorlar"). Uymayan kökte null.
   */
  var UNLU = ["a", "e", "ı", "i", "o", "ö", "u", "ü"];
  var DAR = ["ı", "i", "ı", "i", "u", "ü", "u", "ü"];
  function daralt(kok) {
    kok = String(kok || "");
    var son = kok.charAt(kok.length - 1);
    if (son !== "a" && son !== "e") return null;
    var govde = kok.slice(0, -1), onceki = "";
    for (var i = govde.length - 1; i >= 0; i--) if (/[aeıioöuü]/.test(govde.charAt(i))) { onceki = govde.charAt(i); break; }
    var u = UNLU.indexOf(onceki);
    var dar = u >= 0 ? DAR[u] : DAR[son === "a" ? 0 : 1];
    return govde + dar + "yor";
  }

  // Kuralların derlenmiş hali (bir kez): [{ emoji, kokler: [{ k, tam }], haric, baglam }]
  var derli = {};
  function derle(lang) {
    var anahtar = KURALLAR[lang] ? lang : "tr";
    if (derli[anahtar]) return derli[anahtar];
    derli[anahtar] = KURALLAR[anahtar].map(function (r) {
      var ek = r[2] || {}, kokler = [];
      r[1].forEach(function (k) { kokler.push({ k: k, tam: / $/.test(k) || (ek.tam || []).indexOf(k) !== -1 }); });
      (ek.fiil || []).forEach(function (k) {
        kokler.push({ k: k, tam: false });
        var d = daralt(k);
        if (d) kokler.push({ k: d, tam: false });
      });
      return { emoji: r[0], kokler: kokler, haric: ek.haric || [], baglam: ek.baglam || null };
    });
    return derli[anahtar];
  }

  /*
   * Olumsuzluk: eşleşen sözcükten sonra (en çok 3 sözcük) "değil…", ya da öncesinde İngilizce "not / isn t…".
   * "değil mi" onay sorusudur ("Komik, değil mi?"), olumsuzluk sayılmaz.
   */
  var TR_OLUMSUZ = /^değil/;
  var SORU_EKI = /^m[iıuü]$/, TR_DEGIL = /^değil$/;
  var EN_OLUMSUZ = /(^| )(not|never|no|isn t|wasn t|aren t|weren t|don t|doesn t|didn t|ain t)( [a-z]+)?$/;
  function olumsuz(tokens, i, j, lang) {
    for (var k = j + 1; k <= j + 3 && k < tokens.length; k++) {
      if (TR_OLUMSUZ.test(tokens[k]) && !(TR_DEGIL.test(tokens[k]) && SORU_EKI.test(tokens[k + 1] || ""))) return true;
    }
    if (lang === "en") {
      var once = tokens.slice(Math.max(0, i - 3), i).join(" ");
      if (EN_OLUMSUZ.test(once)) return true;
    }
    return false;
  }

  /*
   * Satırın emojisi ve onu tetikleyen sözcük. Döner: { emoji, kelime } ya da null.
   * kelime: metnin boşlukla ayrılmış sözcüklerinden tetikleyenin sırası (çok sözcüklü kökte son sözcük).
   */
  function eslesme(text, lang) {
    var l = loc(lang);
    var parcalar = String(text || "").split(/\s+/).filter(Boolean);
    var tokens = [], kaynak = [];
    parcalar.forEach(function (p, pi) {
      kucult(p, l).replace(AYIRAC, " ").split(" ").forEach(function (t) {
        if (t) { tokens.push(t); kaynak.push(pi); }
      });
    });
    if (!tokens.length) return null;
    var s = " " + tokens.join(" ") + " ";
    // her sözcüğün s içindeki başlangıcı (boşluk dahil)
    var baslar = [], konum = 0;
    tokens.forEach(function (t) { baslar.push(konum); konum += t.length + 1; });
    function sozcukSirasi(p) { var i = 0; while (i + 1 < baslar.length && baslar[i + 1] <= p) i++; return i; }
    var kurallar = derle(lang);
    for (var r = 0; r < kurallar.length; r++) {
      var kural = kurallar[r];
      if (kural.baglam && !kural.baglam(s)) continue;
      for (var k = 0; k < kural.kokler.length; k++) {
        var kok = kural.kokler[k];
        var aranan = " " + kok.k.replace(/ $/, "") + (kok.tam ? " " : "");
        var p = s.indexOf(aranan);
        while (p !== -1) {
          var i = sozcukSirasi(p);
          var son = sozcukSirasi(p + aranan.replace(/ $/, "").length - 1);
          var kalan = s.slice(p + 1);
          var haric = kural.haric.some(function (h) { return kalan.indexOf(h) === 0; });
          if (!haric && !olumsuz(tokens, i, son, lang)) return { emoji: kural.emoji, kelime: kaynak[son] };
          p = s.indexOf(aranan, p + 1);
        }
      }
    }
    return null;
  }

  // Satır için en uygun emoji (yoksa null)
  function pick(text, lang) {
    var e = eslesme(text, lang);
    return e ? e.emoji : null;
  }

  function hasEmoji(text) { return EMOJI_RE.test(String(text || "")); }

  /*
   * Yoğunluk düzeyleri (Otomatik emoji'nin yanındaki seçenek). "seyrek" bugünkü varsayılandır.
   */
  var YOGUNLUK = {
    seyrek: { density: 0.25, minGap: 2, repeatGap: 6 },
    orta: { density: 0.4, minGap: 1, repeatGap: 4 },
    yogun: { density: 0.6, minGap: 0, repeatGap: 3 }
  };

  /*
   * Satırlara emoji öner.
   *   opts.yogunluk  "seyrek" (varsayılan) | "orta" | "yogun" — aşağıdaki üçünün hazır değerleri
   *   opts.density  0..1 — en fazla satırların bu oranı emoji alır (varsayılan 0.25)
   *   opts.minGap   iki emojili satır arasında en az kaç satır (varsayılan 2)
   *   opts.repeatGap aynı emoji en az kaç satır sonra tekrar edebilir (varsayılan 6)
   * Doner: [{ index, emoji, kelime }] — metinler DEĞİŞMEZ; uygulamak çağırana kalır
   * (kelime: tetikleyen sözcüğün sırası, yer: "kelime" için).
   */
  function suggest(segments, opts) {
    opts = opts || {};
    var lang = opts.lang || "tr";
    var hazir = YOGUNLUK[opts.yogunluk] || YOGUNLUK.seyrek;
    var density = opts.density != null ? Number(opts.density) : hazir.density;
    var minGap = opts.minGap != null ? Number(opts.minGap) : hazir.minGap;
    var repeatGap = opts.repeatGap != null ? Number(opts.repeatGap) : hazir.repeatGap;
    var segs = segments || [];
    var limit = Math.max(1, Math.floor(segs.length * density));
    var out = [];
    var sonIndex = -Infinity;
    var sonKullanim = {};
    for (var i = 0; i < segs.length && out.length < limit; i++) {
      var t = segs[i] && segs[i].text;
      if (!t || hasEmoji(t)) { if (hasEmoji(t)) sonIndex = i; continue; }
      if (i - sonIndex <= minGap) continue;
      var e = eslesme(t, lang);
      if (!e) continue;
      if (sonKullanim.hasOwnProperty(e.emoji) && i - sonKullanim[e.emoji] < repeatGap) continue;
      out.push({ index: i, emoji: e.emoji, kelime: e.kelime });
      sonIndex = i;
      sonKullanim[e.emoji] = i;
    }
    return out;
  }

  // "metin" + emoji -> "metin 🔥" (sondaki noktalamadan sonra)
  function append(text, emoji) {
    var t = String(text || "").replace(/\s+$/, "");
    return t ? t + " " + emoji : emoji;
  }

  /*
   * Emojiyi yerleştir: yer "kelime" ise tetikleyen sözcükten (noktalamasıyla, *vurgu*su
   * bozulmadan) hemen sonra, yoksa satır sonuna. Satır kırılımı (\n) korunur.
   */
  function yerlestir(text, emoji, kelime, yer) {
    var t = String(text || "");
    if (yer !== "kelime" || kelime == null || kelime < 0) return append(t, emoji);
    var parts = t.split(/(\s+)/), n = -1;
    for (var i = 0; i < parts.length; i++) {
      if (!/\S/.test(parts[i])) continue;
      n++;
      if (n !== kelime) continue;
      // son sözcükse satır sonu ile aynı
      var sonra = parts.slice(i + 1).join("");
      if (!/\S/.test(sonra)) return append(t, emoji);
      parts[i] = parts[i] + " " + emoji;
      return parts.join("");
    }
    return append(t, emoji);
  }

  function emojis() {
    var set = {};
    Object.keys(KURALLAR).forEach(function (l) { KURALLAR[l].forEach(function (r) { set[r[0]] = 1; }); });
    return Object.keys(set);
  }

  return { pick: pick, eslesme: eslesme, suggest: suggest, append: append, yerlestir: yerlestir, hasEmoji: hasEmoji,
    emojis: emojis, daralt: daralt, YOGUNLUKLAR: Object.keys(YOGUNLUK) };
});
