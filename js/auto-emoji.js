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
   * [emoji, [kökler]] — kök, sözcüğün BAŞINA eşleşir (Türkçe ekler serbest).
   * Kısa ve çok anlamlı kökler (or. "art" -> "artık") bilerek yok: yanlış emoji,
   * emojisizden kötü. Sonu boşlukla biten kök ("dua ") yalnız TAM sözcüğe uyar.
   * Sıra önceliktir: üstteki kural önce kazanır.
   */
  var KURALLAR = {
    tr: [
      ["💰", ["para", "kazan", "zengin", "maaş", "gelir", "bütçe", "dolar", "euro", "lira"]],
      ["💸", ["harca", "masraf", "borç", "pahalı", "ödeme", "zarar"]],
      ["📈", ["büyüme", "büyüyor", "büyüdü", "artış", "artıyor", "arttı", "yüksel", "grafik", "istatistik", "satış"]],
      ["🚀", ["başla", "hızlı", "roket", "uçuyor", "uçtu", "fırla", "lansman", "patla"]],
      ["🔥", ["ateş", "sıcak", "efsane", "harika", "muhteşem", "çılgın", "viral", "trend"]],
      ["💡", ["fikir", "ipucu", "tüyo", "öneri", "püf", "akıl", "çözüm"]],
      ["⚠️", ["dikkat", "uyarı", "tehlike", "sakın", "hata", "yanlış"]],
      ["✅", ["doğru", "başar", "bitir", "hallet", "kesinlikle"]],
      ["❌", ["hayır", "asla", "yasak", "olmaz", "yapma "]],
      ["❓", ["neden", "niye", "nasıl", "acaba", "soru"]],
      ["🤔", ["düşün", "merak", "sanırım", "belki"]],
      ["😂", ["güldü", "gülme", "komik", "espri", "şaka", "kahkaha"]],
      ["😱", ["korku", "kork", "şok", "inanılmaz", "inanamad"]],
      ["😍", ["aşk", "aşığ", "bayıl", "sevgi", "güzel"]],
      ["❤️", ["seviyorum", "sevdim", "seviyor", "kalp", "teşekkür", "minnet"]],
      ["🙏", ["lütfen", "rica ", "dua ", "dualar", "şükür"]],
      ["💪", ["güçlü", "spor", "antrenman", "kaslar", "pes etme", "azim"]],
      ["🏆", ["kazanan", "şampiyon", "ödül", "birinci", "zafer", "rekor"]],
      ["🎯", ["hedef", "amaç", "odak", "nişan"]],
      ["⏰", ["saat ", "saatte", "dakika", "geç kal", "acele", "erken"]],
      ["📱", ["telefon", "uygulama", "instagram", "tiktok", "mesaj", "iphone", "android"]],
      ["🎬", ["video", "film", "kurgu", "montaj", "sahne", "çekim"]],
      ["🎥", ["kamera", "kayıt", "lens"]],
      ["🎧", ["kulaklık", "dinle", "podcast"]],
      ["🎵", ["müzik", "şarkı", "melodi", "ritim"]],
      ["🎁", ["hediye", "çekiliş", "sürpriz", "bedava", "ücretsiz"]],
      ["😴", ["uyku", "uyu", "yorgun", "sıkıcı"]],
      ["🥶", ["soğuk", "buz", "kış", "dondu"]],
      ["🤯", ["akıl almaz", "beyin", "çıldır"]],
      ["👏", ["tebrik", "alkış", "bravo", "helal"]],
      ["🤝", ["anlaş", "ortak", "işbirliği", "birlikte", "sponsor"]],
      ["👇", ["aşağı", "yorum", "açıklama"]],
      ["⭐", ["yıldız", "favori", "en iyi"]],
      ["📌", ["önemli", "not al", "unutma", "kaydet"]]
    ],
    en: [
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
      ["🏆", ["win ", "winner", "won ", "champion", "award", "record"]],
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
  var EMOJI_RE = /[\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;

  function loc(lang) { return lang === "az" ? "az" : (lang === "en" ? undefined : "tr"); }

  function sozcukler(text, lang) {
    var l = loc(lang);
    var s = String(text || "");
    s = l ? s.toLocaleLowerCase(l) : s.toLowerCase();
    return s.replace(/[.,!?;:…"'“”‘’«»()\[\]{}\-–—]/g, " ").replace(/\s+/g, " ").trim();
  }

  // Satır için en uygun emoji (yoksa null)
  function pick(text, lang) {
    var kurallar = KURALLAR[lang] || KURALLAR.tr;
    var s = " " + sozcukler(text, lang) + " ";
    if (s.trim() === "") return null;
    for (var i = 0; i < kurallar.length; i++) {
      var kokler = kurallar[i][1];
      for (var k = 0; k < kokler.length; k++) {
        // sözcük başı eşleşmesi; çok sözcüklü kök ("pes etme") aynen aranır
        if (s.indexOf(" " + kokler[k]) !== -1) return kurallar[i][0];
      }
    }
    return null;
  }

  function hasEmoji(text) { return EMOJI_RE.test(String(text || "")); }

  /*
   * Satırlara emoji öner.
   *   opts.density  0..1 — en fazla satırların bu oranı emoji alır (varsayılan 0.25)
   *   opts.minGap   iki emojili satır arasında en az kaç satır (varsayılan 2)
   *   opts.repeatGap aynı emoji en az kaç satır sonra tekrar edebilir (varsayılan 6)
   * Doner: [{ index, emoji }] — metinler DEĞİŞMEZ; uygulamak çağırana kalır.
   */
  function suggest(segments, opts) {
    opts = opts || {};
    var lang = opts.lang || "tr";
    var density = opts.density != null ? Number(opts.density) : 0.25;
    var minGap = opts.minGap != null ? Number(opts.minGap) : 2;
    var repeatGap = opts.repeatGap != null ? Number(opts.repeatGap) : 6;
    var segs = segments || [];
    var limit = Math.max(1, Math.floor(segs.length * density));
    var out = [];
    var sonIndex = -Infinity;
    var sonKullanim = {};
    for (var i = 0; i < segs.length && out.length < limit; i++) {
      var t = segs[i] && segs[i].text;
      if (!t || hasEmoji(t)) { if (hasEmoji(t)) sonIndex = i; continue; }
      if (i - sonIndex <= minGap) continue;
      var e = pick(t, lang);
      if (!e) continue;
      if (sonKullanim.hasOwnProperty(e) && i - sonKullanim[e] < repeatGap) continue;
      out.push({ index: i, emoji: e });
      sonIndex = i;
      sonKullanim[e] = i;
    }
    return out;
  }

  // "metin" + emoji -> "metin 🔥" (sondaki noktalamadan sonra)
  function append(text, emoji) {
    var t = String(text || "").replace(/\s+$/, "");
    return t ? t + " " + emoji : emoji;
  }

  function emojis() {
    var set = {};
    Object.keys(KURALLAR).forEach(function (l) { KURALLAR[l].forEach(function (r) { set[r[0]] = 1; }); });
    return Object.keys(set);
  }

  return { pick: pick, suggest: suggest, append: append, hasEmoji: hasEmoji, emojis: emojis };
});
