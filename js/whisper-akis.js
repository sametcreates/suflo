/*
 * Suflo — canlı transkripsiyon akışı (saf, DOM'suz, durumsuz modül)
 *
 * whisper-cli'ye -np verilmediğinde (Suflo vermez) her segmenti bitirir bitirmez stdout'a
 * yazar ve fflush eder:
 *     [00:00:01.380 --> 00:00:04.000]   Merhaba dünya
 * satirAyristirici bu satırları parça parça gelen stdout'tan çıkarır: Caption Editor'ın üstünde
 * motor çalışırken akan, salt okunur "canlı" satırlar. Nihai satırlar yine -ojf JSON'undan gelir;
 * bunlar yalnız göstermeliktir (taslağa, önbelleğe, geri al yığınına girmez).
 *
 * ilerlemeYumusat: -pp'nin seyrek yüzdeleri (whisper.cpp her ~30 sn'lik ses penceresinde bir
 * ilerleme bildirir, %5 adımla yazar) akıcı bir yüzdeye, kalan süreye ve gerçek zaman çarpanına
 * çevrilir.
 *
 * Fikir: Premiere TR (akan satırlar) ve Raunen (ilerleme yumuşatma, gerçek zaman çarpanı), ikisi
 * de MIT. Kod Suflo'nun kendi; taşınmadı (whisper.cpp'nin kendi stdout biçimi okunur).
 * Çalışma ortamı: CEF 74 / Node 12 (ES5).
 */
(function (root, factory) {
  // Ses etiketi denetimi (CT.gurultuMu) js/caption-text.js'te; panelde bu modülden ÖNCE yüklenir
  var CT = (root && root.SufloCaptionText) || null;
  if (!CT && typeof require === "function") { try { CT = require("./caption-text.js"); } catch (e) { CT = null; } }
  var api = factory(CT);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloWhisperAkis = api;
})(typeof window !== "undefined" ? window : this, function (CT) {
  "use strict";

  /* ---------------- Akan satırlar ---------------- */

  // "[hh:mm:ss.mmm --> hh:mm:ss.mmm]  metin" — saat alanı 99'u aşabilir (printf %02d), ayraç
  // nokta ya da virgül olabilir. Satırın başındaki boşluk ve ANSI renk kodları (-pc) yok sayılır.
  var SATIR = /^\s*\[(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})\s*-->\s*(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})\]\s?(.*)$/;
  var ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

  function saniye(h, m, s, ms) {
    var kesir = String(ms);
    while (kesir.length < 3) kesir += "0";            // ".5" = 500 ms
    return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(kesir) / 1000;
  }
  function msYuvarla(x) { return Math.round(x * 1000) / 1000; }

  // Tek satırı çöz: { start, end, text } (kaynak zamanı) ya da null
  function satirCoz(satir) {
    var m = SATIR.exec(String(satir || "").replace(ANSI, ""));
    if (!m) return null;
    var text = String(m[9] || "").replace(/\s+/g, " ").trim();
    return { start: saniye(m[1], m[2], m[3], m[4]), end: saniye(m[5], m[6], m[7], m[8]), text: text };
  }

  /*
   * opts.offset  sekans zamanında kapsamın başı (sn): seçili klipte clip.clipStart, sekans/In-Out'ta
   *              dışa aktarımın ofseti; takılma kurtarmanın "kalan" turu kendi ofsetini alır
   * opts.carpan  hız eşlemesi (timeline süresi / kaynak süresi): nihai JSON'la aynı eşleme
   *              (WW.zamanEsle: offset + t * carpan)
   * opts.atla    fn(text) → true ise satır atlanır (varsayılan: CT.gurultuMu, yalnız ses etiketi)
   * Döner: { besle(parca) → [{ start, end, text }], bitir() → [...] }
   * Parça sınırında yarım kalan satır tamponda bekler; CRLF ve tek başına CR desteklenir.
   */
  function satirAyristirici(opts) {
    opts = opts || {};
    var ofset = Number(opts.offset) || 0;
    var carpan = Number(opts.carpan) > 0 ? Number(opts.carpan) : 1;
    var atla = typeof opts.atla === "function" ? opts.atla
      : (CT && typeof CT.gurultuMu === "function" ? CT.gurultuMu : function () { return false; });
    var tampon = "";

    function cevir(satir, out) {
      var s = satirCoz(satir);
      if (!s || !s.text) return;
      try { if (atla(s.text)) return; } catch (e) {}
      var bas = msYuvarla(ofset + s.start * carpan);
      var son = msYuvarla(ofset + s.end * carpan);
      if (!isFinite(bas) || !isFinite(son)) return;
      out.push({ start: bas, end: Math.max(bas, son), text: s.text });
    }

    return {
      besle: function (parca) {
        var out = [];
        if (parca === undefined || parca === null) return out;
        tampon += String(parca);
        // "\r\n" ve tek başına "\r" satır sonu sayılır; son parça satır sonuyla bitmiyorsa beklemede kalır
        var parcalar = tampon.split(/\r\n|\r|\n/);
        // tamponun sonu "\r" ise sonraki parça "\n" ile başlayabilir: boş satır olarak geçer, zararsız
        tampon = parcalar.pop();
        for (var i = 0; i < parcalar.length; i++) cevir(parcalar[i], out);
        // bozuk akışta (satır sonu hiç gelmiyor) tampon sınırsız büyümesin
        if (tampon.length > 65536) tampon = tampon.slice(-4096);
        return out;
      },
      bitir: function () {
        var out = [];
        if (tampon) cevir(tampon, out);
        tampon = "";
        return out;
      }
    };
  }

  /* ---------------- İlerleme yumuşatma, kalan süre, gerçek zaman çarpanı ---------------- */

  var PENCERE_SN = 30;          // whisper.cpp kod çözme penceresi: ilerleme en sık bu kadar seste bir gelir
  var ADIM_PCT = 5;             // whisper-cli -pp yüzdeyi en az bu adımla yazar (progress_step)
  var ILK_HEDEF = 5;            // ilk bildirimden önce yüzde buna doğru yavaşça yaklaşır (asla ulaşmaz)
  var ILK_TAU_MS = 20000;

  /*
   * opts.toplamSn  çözülen sesin süresi (sn); gerçek zaman çarpanı ve sonraki bildirimin tahmini için
   * opts.basMs     başlangıç anı (ms); verilmezse ilk kontrol/tahmin çağrısının anı
   * Döner:
   *   kontrol(pct, simdiMs)  stderr'deki "progress = NN%" (bildirim noktası)
   *   tahmin(simdiMs)        { pct, kalanSn, hiz }: pct tamsayı, monoton, sonraki beklenen bildirimi
   *                          geçmez; kalanSn ve hiz (sesin saniyesi / duvar saati saniyesi) ilk
   *                          bildirimden önce null
   */
  function ilerlemeYumusat(opts) {
    opts = opts || {};
    var toplamSn = Number(opts.toplamSn) > 0 ? Number(opts.toplamSn) : 0;
    var basMs = isFinite(Number(opts.basMs)) && opts.basMs !== null && opts.basMs !== undefined ? Number(opts.basMs) : null;
    var noktalar = [];          // [{ pct, t }]
    var sonGosterilen = 0;

    function bas(simdi) { if (basMs === null) basMs = simdi; return basMs; }

    // Sonraki bildirim en erken nerede gelir: bir pencere (30 sn ses) ya da yazma adımı (%5),
    // hangisi büyükse. VAD sessizliği atınca pencereler yüzdece büyür: tahmin yine alt sınırdır.
    function sonrakiNokta(pct) {
      var pencere = toplamSn ? PENCERE_SN / toplamSn * 100 : ADIM_PCT;
      return Math.min(100, pct + Math.max(ADIM_PCT, pencere));
    }

    // gözlenen hız (yüzde / ms); yeterli veri yoksa 0
    function hizPctMs() {
      if (!noktalar.length) return 0;
      var son = noktalar[noktalar.length - 1];
      if (noktalar.length >= 2) {
        // model yükleme gecikmesi ilk noktaya kadar: hız iki bildirim arasından ölçülür
        var ilk = noktalar[0];
        if (son.t > ilk.t && son.pct > ilk.pct) return (son.pct - ilk.pct) / (son.t - ilk.t);
      }
      var gecen = son.t - basMs;
      return gecen > 0 && son.pct > 0 ? son.pct / gecen : 0;
    }

    return {
      kontrol: function (pct, simdiMs) {
        pct = Number(pct);
        simdiMs = Number(simdiMs);
        if (!isFinite(pct) || !isFinite(simdiMs)) return;
        bas(simdiMs);
        pct = Math.max(0, Math.min(100, pct));
        var son = noktalar.length ? noktalar[noktalar.length - 1] : null;
        if (son && pct <= son.pct) return;            // geri giden ya da tekrarlanan bildirim
        noktalar.push({ pct: pct, t: simdiMs });
      },
      tahmin: function (simdiMs) {
        simdiMs = Number(simdiMs);
        if (!isFinite(simdiMs)) simdiMs = basMs === null ? 0 : basMs;
        var b = bas(simdiMs);
        var pct, kalanSn = null, hiz = null;
        if (!noktalar.length) {
          // henüz bildirim yok: model yükleniyor ya da ilk pencere çözülüyor; %5'e doğru yavaşla
          var gecen0 = Math.max(0, simdiMs - b);
          pct = ILK_HEDEF * (1 - Math.exp(-gecen0 / ILK_TAU_MS));
          pct = Math.min(pct, sonrakiNokta(0) - 0.5);
        } else {
          var son = noktalar[noktalar.length - 1];
          var r = hizPctMs();
          var tavan = son.pct >= 100 ? 100 : Math.min(99, sonrakiNokta(son.pct));
          pct = son.pct + (r > 0 ? r * Math.max(0, simdiMs - son.t) : 0);
          if (pct > tavan) pct = tavan;
          if (pct < son.pct) pct = son.pct;
          if (r > 0) {
            kalanSn = Math.max(0, (100 - pct) / r / 1000);
            if (toplamSn) hiz = r * 1000 / 100 * toplamSn;
          }
        }
        pct = Math.floor(pct);
        if (pct < sonGosterilen) pct = sonGosterilen;   // monoton: geri gitmez
        sonGosterilen = pct;
        return { pct: pct, kalanSn: kalanSn, hiz: hiz };
      }
    };
  }

  /* ---------------- Durum satırı ---------------- */

  // Kalan süre metni (arayüz Türkçe; i18n/en.js kalıpları çevirir): "45 sn", "1 dk 20 sn", "12 dk"
  function sureMetni(sn) {
    sn = Number(sn);
    if (!isFinite(sn) || sn < 0) return "";
    var s = Math.max(1, Math.round(sn));
    if (s < 60) {
      if (s > 10) s = Math.min(55, Math.round(s / 5) * 5);   // titremesin: 5 sn'lik adım
      return s + " sn";
    }
    if (s < 600) {
      var dk = Math.floor(s / 60), kalan = Math.round((s % 60) / 10) * 10;
      if (kalan === 60) { dk += 1; kalan = 0; }
      return kalan ? dk + " dk " + kalan + " sn" : dk + " dk";
    }
    return Math.round(s / 60) + " dk";
  }

  // 3.14 → "3,1" (Türkçe ondalık); 10 ve üstü tamsayı
  function carpanMetni(x) {
    x = Number(x);
    if (!isFinite(x) || x <= 0) return "";
    if (x >= 10) return String(Math.round(x));
    return x.toFixed(1).replace(".", ",");
  }

  /*
   * '12 satır · %34 · ~1 dk 20 sn kaldı · 3,1× gerçek zaman'
   *   d.satir    akan satır sayısı (0 ise "Transkribe ediliyor…")
   *   d.pct      yumuşatılmış yüzde
   *   d.kalanSn  null ise kalan süre yazılmaz
   *   d.hiz      gerçek zaman çarpanı; null ise yazılmaz
   *   d.etiket   ek bölüm (ör. "kalan kısım")
   * Parçalar " · " ile ayrılır: İngilizce arayüz her parçayı ayrı çevirir.
   */
  function durumMetni(d) {
    d = d || {};
    var parca = [];
    var n = Math.max(0, Math.floor(Number(d.satir) || 0));
    parca.push(n ? n + " satır" : "Transkribe ediliyor…");
    if (isFinite(Number(d.pct)) && d.pct !== null && d.pct !== undefined) parca.push("%" + Math.max(0, Math.min(100, Math.floor(Number(d.pct)))));
    if (d.kalanSn !== null && d.kalanSn !== undefined && isFinite(Number(d.kalanSn))) {
      var sure = sureMetni(d.kalanSn);
      if (sure) parca.push("~" + sure + " kaldı");
    }
    var c = carpanMetni(d.hiz);
    if (c) parca.push(c + "× gerçek zaman");
    if (d.etiket) parca.push(String(d.etiket));
    return parca.join(" · ");
  }

  return {
    satirCoz: satirCoz,
    satirAyristirici: satirAyristirici,
    ilerlemeYumusat: ilerlemeYumusat,
    sureMetni: sureMetni,
    carpanMetni: carpanMetni,
    durumMetni: durumMetni,
    PENCERE_SN: PENCERE_SN,
    ADIM_PCT: ADIM_PCT
  };
});
