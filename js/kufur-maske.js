/*
 * Suflo Küfür Maskesi — "Küfürleri maskele" (Ayarlar › Altyazı, varsayılan kapalı)
 *
 * Çıktı anında çalışır: transkript (editördeki metin) DEĞİŞMEZ; stilli katman, önizleme, caption
 * izi, SRT / VTT / ASS / TXT ve After Effects aynı maskeyi görür (captions.js cueler). İlk harf
 * kalır, gerisi yıldız olur ("siktir" -> "s*****").
 *
 * Liste bilerek küçük ve her kalıp TAM sözcüğe (Türkçe-duyarlı sınırla, izinli eklerle) eşleşir:
 * önek eşleşmesi "sikke", "amca", "götür", "boks" gibi masum sözcükleri yerdi (Scunthorpe sorunu).
 * Kesme işaretinden sonraki ek ("orospu'nun") sözcüğün eki sayılır, kök denetlenir.
 * Saf modül: DOM'a dokunmaz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloKufurMaske = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // Altyazı metni (kullanıcı içeriği) üzerinde çalışır; arayüz metni değil, çevrilmez
  var KALIPLAR = [
    // Türkçe
    /^sik(tir|tirin|tiri|tiğim|tiğimin|erim|eyim|ey|er|ik|ikler|im|iş|işmek|mek|sin|ti|en)?$/,
    /^(amk|aq|amına|amını|amcık|amcığ[ıa]|amcıklar)$/,
    /^orospu[a-zçğıöşü]*$/,
    /^piç(ler|lik|in|i)?$/,
    /^yarra[kğ][a-zçğıöşü]*$/,
    /^göt(ü|ün|e|te|ten|ler|veren)?$/,
    /^bok(lu|tan|a|u|un|lar)?$/,
    /^kahpe[a-zçğıöşü]*$/,
    /^ibne[a-zçğıöşü]*$/,
    /^pezevenk[a-zçğıöşü]*$/,
    /^şerefsiz[a-zçğıöşü]*$/,
    // English
    /^(mother)?fu+c?k+(s|ed|er|ers|ing|in)?$/,
    /^shit(s|ty|ting|ted|head)?$/,
    /^bitch(es|y|ing)?$/,
    /^assholes?$/,
    /^cunts?$/,
    /^bastards?$/
  ];

  // Harf: Latin (Türkçe dahil), Kiril; sözcük sınırı bunların dışındaki her şey
  var HARF = "A-Za-z\\u00C0-\\u024F\\u0400-\\u04FF";
  var SOZCUK = new RegExp("[" + HARF + "]+", "g");

  function trKucuk(s) {
    s = String(s).replace(/İ/g, "i").replace(/I/g, "ı");
    try { s = s.toLocaleLowerCase("tr"); } catch (e) { s = s.toLowerCase(); }
    return s.replace(/\u0307/g, "");
  }

  // Sözcük listede mi? (Türkçe ve düz küçük harfle iki kez denenir: "SHIT" Türkçe katlamada "shıt" olur)
  function kufurMu(sozcuk) {
    var w = String(sozcuk == null ? "" : sozcuk);
    if (!w) return false;
    var a = trKucuk(w), b = w.toLowerCase();
    for (var i = 0; i < KALIPLAR.length; i++) if (KALIPLAR[i].test(a) || KALIPLAR[i].test(b)) return true;
    return false;
  }

  /*
   * Metindeki küfürleri maskele. o.koruma: true -> yıldızlardan sonra sıfır genişlikli boşluk (U+200B)
   * eklenir; *vurgu* işaretini okuyan stil motoru "s*****" sonundaki yıldızları kapanış işareti sanmasın
   * (yalnız Suflo Stili / Altyazı Efektleri yolu; SRT gibi düz çıktılarda kullanılmaz).
   * Eşleşme yoksa metin AYNEN döner.
   */
  function maskele(text, o) {
    var t = String(text == null ? "" : text);
    var koruma = !!(o && o.koruma);
    return t.replace(SOZCUK, function (w, konum) {
      // kesme işaretinden sonraki ek ("orospu'nun"): kök ayrı sözcük olarak zaten denetlenir; ek dokunulmaz
      var once = t.charAt(konum - 1);
      if ((once === "'" || once === "’") && konum > 1 && new RegExp("[" + HARF + "]").test(t.charAt(konum - 2))) return w;
      if (!kufurMu(w)) return w;
      var maske = w.charAt(0) + new Array(w.length).join("*");
      return koruma ? maske + "\u200B" : maske;
    });
  }

  function varMi(text) {
    var bulundu = false;
    String(text == null ? "" : text).replace(SOZCUK, function (w) { if (kufurMu(w)) bulundu = true; return w; });
    return bulundu;
  }

  return { maskele: maskele, kufurMu: kufurMu, varMi: varMi };
});
