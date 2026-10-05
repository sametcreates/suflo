/*
 * Suflo — altyazı (transkripsiyon) dilleri
 *
 * Whisper'ın tanıdığı dillerin ISO kodları ve kendi dillerindeki adları. #cap-lang
 * seçicisinde öne çıkan 10 dilin altına "Diğer diller" grubu olarak eklenir; README'deki
 * "99 dil" sözü seçicide de karşılık bulsun. Adlar her arayüz dilinde aynı kalır.
 *
 * Yakılmış (stilli) altyazının yazı tipleri Latin, Kiril, Yunan ve Arapça alfabeleri
 * kapsar; CJK ve Hint alfabeleri için glif sözü verilmez (glyphWarning).
 * Saf modül: tarayıcıda window.SufloDiller, Node'da module.exports.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloDiller = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // Seçicide zaten olanlar (index.html): bunlar "Diğer diller"de tekrar edilmez
  var ONE_CIKAN = ["tr", "az", "en", "ru", "de", "ar", "es", "fr", "pt", "it"];

  // Whisper dil listesi (openai/whisper tokenizer.py LANGUAGES, whisper.cpp ile aynı kodlar)
  var WHISPER = [
    ["en", "English"], ["zh", "中文"], ["de", "Deutsch"], ["es", "Español"], ["ru", "Русский"], ["ko", "한국어"],
    ["fr", "Français"], ["ja", "日本語"], ["pt", "Português"], ["tr", "Türkçe"], ["pl", "Polski"], ["ca", "Català"],
    ["nl", "Nederlands"], ["ar", "العربية"], ["sv", "Svenska"], ["it", "Italiano"], ["id", "Bahasa Indonesia"],
    ["hi", "हिन्दी"], ["fi", "Suomi"], ["vi", "Tiếng Việt"], ["he", "עברית"], ["uk", "Українська"], ["el", "Ελληνικά"],
    ["ms", "Bahasa Melayu"], ["cs", "Čeština"], ["ro", "Română"], ["da", "Dansk"], ["hu", "Magyar"], ["ta", "தமிழ்"],
    ["no", "Norsk"], ["th", "ไทย"], ["ur", "اردو"], ["hr", "Hrvatski"], ["bg", "Български"], ["lt", "Lietuvių"],
    ["la", "Latina"], ["mi", "Māori"], ["ml", "മലയാളം"], ["cy", "Cymraeg"], ["sk", "Slovenčina"], ["te", "తెలుగు"],
    ["fa", "فارسی"], ["lv", "Latviešu"], ["bn", "বাংলা"], ["sr", "Српски"], ["az", "Azərbaycanca"], ["sl", "Slovenščina"],
    ["kn", "ಕನ್ನಡ"], ["et", "Eesti"], ["mk", "Македонски"], ["br", "Brezhoneg"], ["eu", "Euskara"], ["is", "Íslenska"],
    ["hy", "Հայերեն"], ["ne", "नेपाली"], ["mn", "Монгол"], ["bs", "Bosanski"], ["kk", "Қазақша"], ["sq", "Shqip"],
    ["sw", "Kiswahili"], ["gl", "Galego"], ["mr", "मराठी"], ["pa", "ਪੰਜਾਬੀ"], ["si", "සිංහල"], ["km", "ខ្មែរ"],
    ["sn", "chiShona"], ["yo", "Yorùbá"], ["so", "Soomaali"], ["af", "Afrikaans"], ["oc", "Occitan"], ["ka", "ქართული"],
    ["be", "Беларуская"], ["tg", "Тоҷикӣ"], ["sd", "سنڌي"], ["gu", "ગુજરાતી"], ["am", "አማርኛ"], ["yi", "ייִדיש"],
    ["lo", "ລາວ"], ["uz", "Oʻzbekcha"], ["fo", "Føroyskt"], ["ht", "Kreyòl ayisyen"], ["ps", "پښتو"], ["tk", "Türkmençe"],
    ["nn", "Nynorsk"], ["mt", "Malti"], ["sa", "संस्कृतम्"], ["lb", "Lëtzebuergesch"], ["my", "မြန်မာ"], ["bo", "བོད་ཡིག"],
    ["tl", "Tagalog"], ["mg", "Malagasy"], ["as", "অসমীয়া"], ["tt", "Татарча"], ["haw", "ʻŌlelo Hawaiʻi"], ["ln", "Lingála"],
    ["ha", "Hausa"], ["ba", "Башҡортса"], ["jw", "Basa Jawa"], ["su", "Basa Sunda"], ["yue", "粵語"]
  ];

  // Yazı tiplerimizde glifi olmayabilecek alfabeler: CJK, Hint ve Güneydoğu Asya alfabeleri,
  // Tibet, Etiyopya, Gürcü, Ermeni, Sinhala
  var GLIF_YOK = { zh: 1, ja: 1, ko: 1, yue: 1, hi: 1, bn: 1, ta: 1, te: 1, ml: 1, kn: 1, mr: 1, gu: 1, pa: 1, si: 1,
    ne: 1, sa: 1, as: 1, th: 1, lo: 1, km: 1, my: 1, bo: 1, am: 1, ka: 1, hy: 1 };

  function sahip(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  // "Diğer diller" grubu: öne çıkanlar hariç, ada göre sıralı [kod, ad]
  function moreLanguages() {
    return WHISPER.filter(function (d) { return ONE_CIKAN.indexOf(d[0]) === -1; })
      .slice().sort(function (a, b) { return a[1].localeCompare(b[1]); });
  }

  function isWhisperLang(code) {
    for (var i = 0; i < WHISPER.length; i++) if (WHISPER[i][0] === code) return true;
    return false;
  }

  // Bu dilde stilli (yakılmış) altyazı için glif uyarısı gösterilmeli mi?
  function glyphWarning(code) { return sahip(GLIF_YOK, String(code || "")); }

  return { WHISPER: WHISPER, FEATURED: ONE_CIKAN, moreLanguages: moreLanguages, isWhisperLang: isWhisperLang, glyphWarning: glyphWarning };
});
