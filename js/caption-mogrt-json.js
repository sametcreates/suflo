/*
 * Suflo — Altyazı Efektleri › Premiere yerel çıktı (render yok) için saf model (3.3 adım 21)
 *
 * Altyazı Efektleri oluşturucusunun ana çıktısı Premiere'in kendi klibidir: TranscriptAI'ın (Animated Captions,
 * MIT, Copyright (c) 2026 Aktuğ Antika) altyazı şablonu assets/mogrt/altyazi-efekt-v1.mogrt yazarın izniyle pakette
 * gelir (THIRD_PARTY_NOTICES.md). Şablonun "JSON_Input" metin kontrolü tek bir dizi okur:
 *   [vurguRGB, yaziRGB, font (PostScript adı), punto, kontur [1,r,g,b,kalınlık]|[0], gölge [1,r,g,b,opak,mesafe,yumuşak]|[0],
 *    kutu [1,r,g,b,opak]|[0], textAnim 0-5, hlAnim 0-3, satırlar [[başMs, sonMs, metin, [kb, ks, kb, ks, …]], …]]
 * Satır zamanları klibin başına göre ms'dir. İlk dokuz alan js/altyazi-efekt.js sablonStili'nden gelir (1:1 eşleme).
 *
 * Bu modül:
 *   - build(cues, ayar, o): kartları önizlemeyle AYNI kurar (stil motorunun efektSatirlari'ı: kelimeye bölme, *vurgu*,
 *     en çok kelime, satır kırılımı) ve parçalara böler: her parça bir klip, en çok 45 sn ve 8 KB (şablonun metin
 *     sınırı ve her karedeki JSON.parse maliyeti; Premiere denemesi sonrası ayarlanır). Parça sınırları kareye oturur.
 *     *Vurgu* işaretleri ayıklanır (şablonda kelime başına vurgu bayrağı yok: sayısı vurguKaybi'nde).
 *   - yerlesim(w, h, oran): şablonun 1920×1080 kompozisyonunu sekansa sığdıran Motion › Scale ve Caption_Position.
 *   - fontSecimi / fontKuruluMu / fontKlasorleri / fontKurulumPlani: Premiere yalnız sisteme kurulu fontu çizer.
 *     Bilinen aile (PostScript eşlemesi olan) kurulu değilse ya da aile bilinmiyorsa Arial'a düşülür ve uyarılır;
 *     isteğe bağlı "Suflo fontlarını kur" kullanıcı font klasörüne kopyalar (Windows: HKCU kaydı, reg args dizisiyle).
 *   - yerelDestek(app, probe): Premiere 22 (2022) ve üstü, importMGT var.
 *
 * Bilinen şablon özelliği: EG'deki Highlight_Color kontrolü yok sayılır (ifadesi değeri okumaz); renk JSON'dan gelir,
 * Suflo o kontrole yazmaz. DOM'a, Premiere'e, dosya sistemine dokunmaz. ES5, UMD (Node 12 / CEF 74).
 */
(function (root, factory) {
  function yukle(ad, yol) {
    var m = (root && root[ad]) || null;
    if (!m && typeof require === "function") { try { m = require(yol); } catch (e) { m = null; } }
    return m;
  }
  var api = factory(function () { return yukle("SufloAltyaziEfekt", "./altyazi-efekt.js"); },
    function () { return yukle("SufloStyleEngine", "./style-engine.js"); });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloCaptionMogrtJson = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (aeBul, seBul) {
  "use strict";

  var AE_ = null, SE_ = null;
  function AE() { if (!AE_ && aeBul) AE_ = aeBul(); return AE_; }
  function SE() { if (!SE_ && seBul) SE_ = seBul(); return SE_; }

  // Paketteki şablon (yol uzantı köküne göre) ve sözleşmesi
  var SABLON = {
    yol: "assets/mogrt/altyazi-efekt-v1.mogrt",
    sha256: "32c2394de3f639fede180bc274e30166daa0375298af5c5f7ae3dfbf73989969",
    genislik: 1920,
    yukseklik: 1080,
    veriParam: "JSON_Input",
    konumParam: "Caption_Position",
    // Kompozisyon 1 saat: klip ucu kırpılır (zaman esnetmesi / Responsive Design yok)
    sure: 3600
  };
  // Parça sınırları: süre (sn) ve JSON_Input uzunluğu (karakter ≈ bayt; Türkçe harfler iki bayt sayılır)
  var SINIR = { sure: 45, bayt: 8000 };
  // Doğrulama tutmazsa (şablonun metin sınırı) panel daha küçük parçalarla yeniden dener
  var BAYT_KADEMELERI = [8000, 4000, 2000];
  var EN_AZ_PREMIERE = 22;

  function sayi(v) { var n = Number(v); return typeof v !== "boolean" && v !== null && v !== "" && isFinite(n) ? n : null; }
  function own(o, k) { return o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k); }

  /*
   * Metin güvenliği: JSON.stringify tırnak, ters bölü ve satır sonunu kaçırır; ama U+2028 / U+2029 ve diğer kontrol
   * karakterleri JSON.stringify'dan ham geçer ve ExtendScript'in eval tabanlı KJSON.parse'ında (ES3) dizgeyi
   * böler. Kart içindeki satır sonu yalnız "\n" (şablon satırı kırar); gerisi boşluk.
   */
  function temizMetin(t) {
    return String(t == null ? "" : t).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim();
  }

  // UTF-8 bayt sayısı (Türkçe harfler 2 bayt; şablon sınırı bayt cinsinden ölçülür)
  function baytSay(s) {
    var n = 0, t = String(s);
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }

  /*
   * Kartlar → satırlar: [{ start, end, text ("\n" satır kırılımı), kelimeler: [[bas, son], …], vurgu: [bool] }].
   * Kelime k, sonraki kelimenin başına kadar etkin (önizlemenin renderEfekt'iyle aynı); son kelime kart sonuna.
   * Kartlar üst üste binmez: kart sonu sonraki kartın başını geçemez. Metindeki kelime sayısı zaman çifti
   * sayısına HER ZAMAN eşittir (boş / yalnız kontrol karakterli kelime kart dışı kalır).
   */
  function satirlar(cues, ayar, o) {
    var se = SE();
    if (!se || typeof se.efektSatirlari !== "function") throw new Error("Stil motoru yüklenemedi.");
    var ae = AE();
    var ov = ae ? ae.overrides(ayar) : (ayar || {});
    var kartlar = se.efektSatirlari({ cues: cues || [], cueKind: o && o.cueKind ? o.cueKind : "lines" }, ov);
    var out = [];
    kartlar.forEach(function (k) {
      var kel = [], kir = k.kir || [];
      k.kelimeler.forEach(function (w, i) {
        // Kelime boşluksuzdur (stil motoru \s+ ile böler): içindeki kontrol karakteri silinir, kelime bölünmez
        var t = String(w.text == null ? "" : w.text).replace(/[\u0000-\u001f\u007f\u2028\u2029\s]+/g, "");
        if (!t) return;
        kel.push({ start: Number(w.start) || 0, end: Number(w.end) || 0, text: t, vurgu: !!w.vurgu, kir: kir.indexOf(i) !== -1 });
      });
      if (!kel.length) return;
      var bas = kel[0].start, son = Math.max(kel[kel.length - 1].end, bas + 0.05);
      var metin = "", zam = [], vur = [], onceki = bas;
      kel.forEach(function (w, i) {
        if (i > 0) metin += w.kir ? "\n" : " ";
        metin += w.text;
        var kb = Math.max(onceki, Math.min(son, w.start));
        var ks = i + 1 < kel.length ? Math.max(kb, Math.min(son, kel[i + 1].start)) : son;
        zam.push([kb, ks]);
        vur.push(w.vurgu);
        onceki = kb;
      });
      out.push({ start: bas, end: son, text: metin, kelimeler: zam, vurgu: vur });
    });
    out.sort(function (a, b) { return a.start - b.start; });
    for (var i = 0; i + 1 < out.length; i++) {
      if (out[i].end > out[i + 1].start) {
        out[i].end = Math.max(out[i].start + 0.01, out[i + 1].start);
        out[i].kelimeler.forEach(function (z) { z[0] = Math.min(z[0], out[i].end); z[1] = Math.min(z[1], out[i].end); });
      }
    }
    return out;
  }

  function kare(t, fps, yukari) {
    if (!(fps > 0)) return t;
    var f = t * fps;
    var r = Math.round(f);
    if (Math.abs(f - r) < 1e-6) return r / fps;
    return (yukari ? Math.ceil(f) : Math.floor(f)) / fps;
  }

  function msDizi(satir, c0) {
    function ms(t) { return Math.max(0, Math.round((t - c0) * 1000)); }
    var z = [];
    satir.kelimeler.forEach(function (p) { z.push(ms(p[0])); z.push(ms(p[1])); });
    return [ms(satir.start), ms(satir.end), satir.text, z];
  }

  /*
   * Şablon stili (sözleşmenin ilk 9 alanı) + font seçimi. o.font: PostScript adı (fontSecimi; verilmezse
   * altyazi-efekt.js sablonFontu), o.punto: kompozisyon pikseli cinsinden punto çarpanı (yerlesim().punto).
   */
  function stilDizisi(ayar, o) {
    var ae = AE();
    if (!ae) throw new Error("Altyazı Efektleri modeli yüklenemedi.");
    var carpan = o && sayi(o.punto) !== null && o.punto > 0 ? Number(o.punto) : 1;
    var st = ae.sablonStili(ayar, { olcek: carpan });
    if (o && typeof o.font === "string" && o.font) st[2] = o.font;
    st[3] = Math.max(8, st[3]);
    return st;
  }

  /*
   * build(cues, ayar, o) → { parcalar: [{ start, end, json, bayt, satir }], satirSayisi, vurguKaybi, asiri }
   * o: { cueKind ("lines" | "words" | "cumulative"), fps, font, punto, sure (sn), bayt }
   * Parça başı ve sonu kare sınırına oturur (Premiere klibi kareye yuvarlar; komşu parçalar aynı izde çakışmasın),
   * satır zamanları parçanın (kareye oturmuş) başına göredir. Tek satır sınırı aşarsa yine kendi parçasıdır (asiri).
   */
  function build(cues, ayar, o) {
    o = o || {};
    var sureSinir = sayi(o.sure) > 0 ? Number(o.sure) : SINIR.sure;
    var baytSinir = sayi(o.bayt) > 0 ? Number(o.bayt) : SINIR.bayt;
    var fps = sayi(o.fps) > 0 ? Number(o.fps) : 0;
    var stil = stilDizisi(ayar, o);
    var liste = satirlar(cues, ayar, o);
    var vurguKaybi = 0;
    liste.forEach(function (s) { s.vurgu.forEach(function (v) { if (v) vurguKaybi++; }); });

    function paket(gruplar, c0) {
      return JSON.stringify(stil.concat([gruplar.map(function (s) { return msDizi(s, c0); })]));
    }

    var parcalar = [], asiri = 0, i = 0, oncekiSon = 0;
    while (i < liste.length) {
      var c0 = Math.max(oncekiSon, kare(liste[i].start, fps, false));
      var grup = [liste[i]];
      var json = paket(grup, c0);
      var j = i + 1;
      while (j < liste.length) {
        var aday = grup.concat([liste[j]]);
        if (liste[j].end - c0 > sureSinir) break;
        var aJson = paket(aday, c0);
        if (baytSay(aJson) > baytSinir) break;
        grup = aday; json = aJson; j++;
      }
      if (baytSay(json) > baytSinir) asiri++;
      var son = kare(grup[grup.length - 1].end, fps, true);
      if (j < liste.length) son = Math.min(son, Math.max(c0 + (fps > 0 ? 1 / fps : 0.04), kare(liste[j].start, fps, false)));
      son = Math.max(son, c0 + (fps > 0 ? 1 / fps : 0.04));
      parcalar.push({ start: c0, end: son, json: json, bayt: baytSay(json), satir: grup.length });
      oncekiSon = son;
      i = j;
    }
    return { parcalar: parcalar, satirSayisi: liste.length, vurguKaybi: vurguKaybi, asiri: asiri };
  }

  /*
   * Şablon 1920×1080. Premiere AE şablonunu kendi kompozisyon boyutunda, sekansın ortasına koyar (Responsive Design
   * yok): klibin Motion › Scale'i kompozisyonu sekansın tamamını kaplayacak kadar büyütür / küçültür (s = en büyük
   * oran), Caption_Position da kartın ortasının (oran: altyazi-efekt.js sablonKonumu, kadrajın 0-1'i) kompozisyondaki
   * pikselidir. Punto, önizlemedeki gibi kısa kenara (min(w, h) / 1080) göre; ölçekten arındırılır.
   * Döner: { olcek (%), konum: [x, y] (kompozisyon px), konumOran: [x / 1920, y / 1080], punto (çarpan) }
   */
  function yerlesim(w, h, oran) {
    var W = sayi(w) > 0 ? Number(w) : SABLON.genislik, H = sayi(h) > 0 ? Number(h) : SABLON.yukseklik;
    var s = Math.max(W / SABLON.genislik, H / SABLON.yukseklik);
    var fx = oran && sayi(oran.x) !== null ? Math.max(0, Math.min(1, Number(oran.x))) : 0.5;
    var fy = oran && sayi(oran.y) !== null ? Math.max(0, Math.min(1, Number(oran.y))) : 0.84;
    var cx = SABLON.genislik / 2 + (fx * W - W / 2) / s;
    var cy = SABLON.yukseklik / 2 + (fy * H - H / 2) / s;
    function yuvarla(v, b) { var k = Math.pow(10, b); return Math.round(v * k) / k; }
    return {
      olcek: yuvarla(s * 100, 2),
      konum: [yuvarla(cx, 1), yuvarla(cy, 1)],
      konumOran: [yuvarla(cx / SABLON.genislik, 4), yuvarla(cy / SABLON.yukseklik, 4)],
      punto: yuvarla(Math.min(W, H) / 1080 / s, 4)
    };
  }

  /* ---------------- Fontlar: Premiere yalnız sisteme kurulu fontu çizer ---------------- */

  function anahtar(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

  // Aile bu dosya adlarından birinde var mı (Montserrat-Bold.ttf, ArchivoBlack.ttf, anton-regular.otf…)
  function fontKuruluMu(aile, dosyalar) {
    var k = anahtar(aile);
    if (!k) return false;
    return (dosyalar || []).some(function (d) {
      var ad = String(d || "").replace(/^.*[\\\/]/, "");
      if (!/\.(ttf|otf|ttc)$/i.test(ad)) return false;
      return anahtar(ad.replace(/\.[^.]+$/, "")).indexOf(k) === 0;
    });
  }

  function arial(kalin, italik) {
    if (kalin && italik) return "Arial-BoldItalicMT";
    if (kalin) return "Arial-BoldMT";
    if (italik) return "Arial-ItalicMT";
    return "ArialMT";
  }

  /*
   * Şablona giden font. kurulu: işletim sisteminin font klasörlerindeki dosya adları (verilmezse denetlenmez).
   * Aile Suflo'nun PostScript eşlemesinde (altyazi-efekt.js sablonFontu) değilse "bilinmiyor", kurulu değilse
   * "kurulu-degil": ikisinde de Arial (kalın / italik korunur) ve önizlemeyle sonucun farklı olabileceği uyarısı.
   * Döner: { ps, aile, yedek, neden: "" | "kurulu-degil" | "bilinmiyor" }
   */
  function fontSecimi(ayar, kurulu) {
    var ae = AE();
    var n = ae ? ae.normalize(ayar) : (ayar || {});
    var ps = ae ? ae.sablonFontu(n) : String(n.font || "");
    var bilinen = !!ps && ps !== n.font;
    if (!bilinen) return { ps: arial(n.kalin, n.italik), aile: n.font, yedek: true, neden: "bilinmiyor" };
    if (kurulu && !fontKuruluMu(n.font, kurulu)) return { ps: arial(n.kalin, n.italik), aile: n.font, yedek: true, neden: "kurulu-degil" };
    return { ps: ps, aile: n.font, yedek: false, neden: "" };
  }

  function birlestir(platform, a, b) {
    var ayrac = platform === "win32" ? "\\" : "/";
    return String(a).replace(/[\\\/]+$/, "") + ayrac + b;
  }

  // Taranacak font klasörleri (sistem + kullanıcı); env: { LOCALAPPDATA, WINDIR, HOME }
  function fontKlasorleri(platform, env) {
    env = env || {};
    if (platform === "win32") {
      var out = [birlestir(platform, env.WINDIR || env.windir || "C:\\Windows", "Fonts")];
      if (env.LOCALAPPDATA) out.push(birlestir(platform, env.LOCALAPPDATA, "Microsoft\\Windows\\Fonts"));
      return out;
    }
    if (platform === "darwin") {
      var m = ["/Library/Fonts", "/System/Library/Fonts", "/System/Library/Fonts/Supplemental"];
      if (env.HOME) m.unshift(birlestir(platform, env.HOME, "Library/Fonts"));
      return m;
    }
    return [];
  }

  /*
   * Paketin fonts/ klasöründen kurulacak dosyalar: aile başına (dosya adının "-" öncesi) statik yüzler varsa
   * (Montserrat-Regular / -Bold) onlar, yoksa tek dosya (Anton.ttf). Değişken ana dosya statiklerle birlikte
   * kurulmaz (Windows aynı aileyi iki kez görüp yanlış yüzü seçebilir). Lisans metinleri (.txt) dışarıda.
   */
  function paketFontlari(dosyalar) {
    var aileler = {}, sira = [];
    (dosyalar || []).forEach(function (d) {
      var ad = String(d || "").replace(/^.*[\\\/]/, "");
      if (!/\.(ttf|otf)$/i.test(ad)) return;
      var taban = ad.replace(/\.[^.]+$/, "");
      var aile = anahtar(taban.split("-")[0]);
      if (!aile) return;
      if (!aileler[aile]) { aileler[aile] = { tek: [], statik: [] }; sira.push(aile); }
      (taban.indexOf("-") !== -1 ? aileler[aile].statik : aileler[aile].tek).push(ad);
    });
    var out = [];
    sira.forEach(function (a) { out = out.concat(aileler[a].statik.length ? aileler[a].statik : aileler[a].tek); });
    return out;
  }

  var REG_FONTS = "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts";

  /*
   * "Suflo fontlarını kur" planı: dosyalar [{ dosya (ad), kaynak (tam yol) }] kullanıcı font klasörüne kopyalanır.
   * Windows 10 1809+: %LOCALAPPDATA%\Microsoft\Windows\Fonts + HKCU Fonts değeri; reg komutu args dizisi
   * (kabuk yok). macOS: ~/Library/Fonts. Başka platform ya da klasör bilinmiyorsa boş plan.
   * Döner: [{ kaynak, hedef, reg: [args] | null }]
   */
  function fontKurulumPlani(platform, env, dosyalar) {
    env = env || {};
    var dizin = "";
    if (platform === "win32" && env.LOCALAPPDATA) dizin = birlestir(platform, env.LOCALAPPDATA, "Microsoft\\Windows\\Fonts");
    else if (platform === "darwin" && env.HOME) dizin = birlestir(platform, env.HOME, "Library/Fonts");
    if (!dizin) return [];
    var gorulen = {};
    return (dosyalar || []).filter(function (d) {
      var ad = d && String(d.dosya || "").replace(/^.*[\\\/]/, "");
      if (!ad || !/\.(ttf|otf)$/i.test(ad) || gorulen[ad.toLowerCase()] || !d.kaynak) return false;
      gorulen[ad.toLowerCase()] = 1;
      return true;
    }).map(function (d) {
      var ad = String(d.dosya).replace(/^.*[\\\/]/, "");
      var hedef = birlestir(platform, dizin, ad);
      var deger = ad.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") + (/\.otf$/i.test(ad) ? " (OpenType)" : " (TrueType)");
      return {
        kaynak: String(d.kaynak),
        hedef: hedef,
        dizin: dizin,
        reg: platform === "win32" ? ["add", REG_FONTS, "/v", deger, "/t", "REG_SZ", "/d", hedef, "/f"] : null
      };
    });
  }

  /*
   * Premiere 22 (2022) ve üstü + aktif sekansta importMGT. probe: KS_captionJsonMogrtProbe çıktısı
   * ({ app, seq, importMGT }). Döner: { ok, neden: "" | "surum" | "sekans" | "api" }
   */
  function yerelDestek(app, probe) {
    var ana = parseInt(String(app || (probe && probe.app) || ""), 10);
    if (!(ana >= EN_AZ_PREMIERE)) return { ok: false, neden: "surum" };
    if (probe && probe.seq === false) return { ok: false, neden: "sekans" };
    if (probe && probe.importMGT === false) return { ok: false, neden: "api" };
    return { ok: true, neden: "" };
  }

  return {
    SABLON: JSON.parse(JSON.stringify(SABLON)),
    SINIR: JSON.parse(JSON.stringify(SINIR)),
    BAYT_KADEMELERI: BAYT_KADEMELERI.slice(),
    EN_AZ_PREMIERE: EN_AZ_PREMIERE,
    temizMetin: temizMetin,
    baytSay: baytSay,
    satirlar: satirlar,
    stilDizisi: stilDizisi,
    build: build,
    yerlesim: yerlesim,
    fontKuruluMu: fontKuruluMu,
    fontSecimi: fontSecimi,
    fontKlasorleri: fontKlasorleri,
    paketFontlari: paketFontlari,
    fontKurulumPlani: fontKurulumPlani,
    yerelDestek: yerelDestek
  };
});
