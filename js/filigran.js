/*
 * Suflo — deneme filigranı (yalnız deneme hakkıyla üretilen stilli katman ve kanca başlığı)
 *
 * ASS'e tek bir stil ("SufloFiligran") ve tek bir olay ekler: sağ üstte küçük, yarı saydam
 * "suflo.app". Kullanıcının satırlarına dokunmaz (özgün satırlar bayt bayt aynı kalır),
 * ikinci çağrıda bir şey eklemez. ASLA SRT/VTT'ye, Premiere caption izine, sese ya da
 * kesimlere uygulanmaz: güvenilen şey temiz ücretsiz çekirdek.
 * Saf modül: DOM'a, dosyaya, Premiere'e dokunmaz.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloFiligran = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var STIL = "SufloFiligran";
  var METIN = "suflo.app";
  var KATMAN = 9;
  var OLCEK = 0.026;      // yazı boyu: kısa kenarın ~%2,6'sı
  var ALFA = "&H66&";     // ~%60 opak
  var STIL_BICIMI = "Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding";
  var OLAY_BICIMI = "Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text";

  function bolum(ad) { return /^\s*\[([^\]]+)\]\s*$/.exec(ad); }
  function alanlar(bicim) {
    return String(bicim).split(",").map(function (s) { return s.trim().toLowerCase(); });
  }
  // "Dialogue: a,b,c,…" → ilk n-1 alan virgülle, son alan (Text) kalan her şey
  function degerler(govde, n) {
    var parca = String(govde).split(",");
    if (parca.length <= n) return parca;
    return parca.slice(0, n - 1).concat([parca.slice(n - 1).join(",")]);
  }
  function saniye(tc) {
    var m = /^\s*(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\s*$/.exec(String(tc));
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  }
  function zaman(sn) {
    var cs = Math.max(0, Math.ceil(Number(sn || 0) * 100 - 1e-6));
    var h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return h + ":" + p(m) + ":" + p(s) + "." + p(c);
  }

  function filigranliMi(ass) {
    return typeof ass === "string" && new RegExp("^\\s*Style:\\s*" + STIL + "\\s*,", "m").test(ass);
  }

  /*
   * ass: tam ASS metni · o: { width, height } (PlayRes yoksa yedek)
   * Döner: filigranlı ASS ([Events] yoksa ya da zaten filigranlıysa girdi aynen)
   */
  function ekle(ass, o) {
    if (typeof ass !== "string" || !/^\s*\[Events\]\s*$/m.test(ass) || filigranliMi(ass)) return ass;
    o = o || {};
    var eol = ass.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
    var satirlar = ass.split(/\r?\n/);

    var w = 0, h = 0, kesit = "";
    var stilBicimi = null, stilBicimiNo = -1, sonStilNo = -1, ilkFont = "";
    var olayBicimi = null, olayBolumNo = -1, sonOlayNo = -1, sonBitis = 0, stilBolumNo = -1;
    satirlar.forEach(function (s, i) {
      var b = bolum(s);
      if (b) {
        kesit = b[1].trim().toLowerCase();
        if (kesit === "events") olayBolumNo = i;
        if (/^v4\+? styles$/.test(kesit)) stilBolumNo = i;
        return;
      }
      var m = /^\s*([A-Za-z]+)\s*:\s?(.*)$/.exec(s);
      if (!m) return;
      var anahtar = m[1].toLowerCase(), govde = m[2];
      if (kesit === "script info") {
        if (anahtar === "playresx") w = Number(govde) || 0;
        if (anahtar === "playresy") h = Number(govde) || 0;
      } else if (/^v4\+? styles$/.test(kesit)) {
        if (anahtar === "format") { stilBicimi = alanlar(govde); stilBicimiNo = i; }
        if (anahtar === "style") {
          sonStilNo = i;
          if (!ilkFont) {
            var fi = (stilBicimi || alanlar(STIL_BICIMI)).indexOf("fontname");
            ilkFont = String(degerler(govde, 99)[fi >= 0 ? fi : 1] || "").trim();
          }
        }
      } else if (kesit === "events") {
        if (anahtar === "format") olayBicimi = alanlar(govde);
        if (anahtar === "dialogue") {
          var ob = olayBicimi || alanlar(OLAY_BICIMI);
          var ei = ob.indexOf("end");
          var d = degerler(govde, ob.length);
          sonBitis = Math.max(sonBitis, saniye(d[ei >= 0 ? ei : 2]));
        }
        if (s.trim()) sonOlayNo = i;
      }
    });

    if (!(w > 0 && h > 0)) { w = Number(o.width) || 1920; h = Number(o.height) || 1080; }
    var dikey = h > w;
    var boy = Math.max(10, Math.round(Math.min(w, h) * OLCEK));
    var font = ilkFont || "Arial";

    var stilDeger = {
      name: STIL, fontname: font, fontsize: String(boy),
      primarycolour: "&H00FFFFFF", secondarycolour: "&H00FFFFFF", outlinecolour: "&H00000000", backcolour: "&H00000000",
      bold: "0", italic: "0", underline: "0", strikeout: "0", scalex: "100", scaley: "100", spacing: "0", angle: "0",
      borderstyle: "1", outline: "1", shadow: "0", alignment: "9", marginl: "0", marginr: "0", marginv: "0", encoding: "1"
    };
    var stilSatiri = "Style: " + (stilBicimi || alanlar(STIL_BICIMI)).map(function (a) {
      return Object.prototype.hasOwnProperty.call(stilDeger, a) ? stilDeger[a] : "0";
    }).join(",");

    var x = Math.round(w * 0.97), y = Math.round(h * (dikey ? 0.10 : 0.04));
    var olayDeger = {
      layer: String(KATMAN), start: zaman(0), end: zaman(sonBitis + 1), style: STIL, name: "",
      marginl: "0", marginr: "0", marginv: "0", effect: "",
      text: "{\\an9\\pos(" + x + "," + y + ")\\alpha" + ALFA + "}" + METIN
    };
    var olayAlanlari = olayBicimi || alanlar(OLAY_BICIMI);
    // Text her zaman son alan olmalı (ASS kuralı); değilse standart biçimle yaz
    if (olayAlanlari[olayAlanlari.length - 1] !== "text") olayAlanlari = alanlar(OLAY_BICIMI);
    var olaySatiri = "Dialogue: " + olayAlanlari.map(function (a) {
      return Object.prototype.hasOwnProperty.call(olayDeger, a) ? olayDeger[a] : "";
    }).join(",");

    var olayYeri = sonOlayNo >= 0 ? sonOlayNo + 1 : olayBolumNo + 1;
    var stilYeri, stilEki;
    if (stilBolumNo >= 0) {
      stilYeri = sonStilNo >= 0 ? sonStilNo + 1 : (stilBicimiNo >= 0 ? stilBicimiNo + 1 : stilBolumNo + 1);
      stilEki = [stilSatiri];
    } else {
      // stil bölümü hiç yoksa [Events]'ten önce standart bölüm aç
      stilYeri = olayBolumNo;
      stilEki = ["[V4+ Styles]", "Format: " + STIL_BICIMI, stilSatiri, ""];
    }
    // Önce sondaki ekleme: öndeki ekleme sonraki satırların indeksini kaydırmasın
    var ekler = [[olayYeri, [olaySatiri]], [stilYeri, stilEki]].sort(function (a, b) { return b[0] - a[0]; });
    ekler.forEach(function (e) { Array.prototype.splice.apply(satirlar, [e[0], 0].concat(e[1])); });
    return satirlar.join(eol);
  }

  return { ekle: ekle, filigranliMi: filigranliMi, STIL: STIL, METIN: METIN };
});
