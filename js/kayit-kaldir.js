/*
 * Suflo — kayıt tabanlı güvenli kaldırma, panel tarafı (3.4, plan adım 11)
 * window.SufloKaldir · module.exports  (Suflo'nun kendi kodu; temiz oda)
 *
 * Geçiş (KS_applyCutTransition), Zoom (KS_autoZoom) ve Hareket önayarı (KS_applyMotionPreset) yazdıkları her
 * özellik için bir kayıt döndürür (records + proje). Bu modül onları proje başına saklar (SufloKeyRecords;
 * tur 'gecis' | 'zoom' | 'hareket') ve kaldırırken host'a verir: KS_removeSufloKeys yalnız Suflo'nun yazdığı ve
 * hâlâ yerinde duran anahtar kareleri siler, kullanıcının anahtarlarına dokunmaz, kenar değerlerini geri koyar.
 *
 * Kaldırmak hiçbir zaman ücretli değil (Pro kapısı yok). Kayıt bulunamazsa (eski proje, başka bilgisayar,
 * silinmiş yerel depo) araç eski yöntemi YALNIZ onayla çalıştırır (yedekGerekli).
 *
 * Saf kısım (DOM'suz, node ile test edilir): cakisanlar, ozet, mesajParcalari, yedekGerekli, hataMetni.
 * olustur({ call, depo, simdi }) → { sakla, kayitlar, kaldir }: call = K.call (Promise), depo = SufloKeyRecords.depo().
 * Depo yazılamazsa kayıtlar bu oturumun belleğinde kalır (panel açıkken kaldırma yine çalışır).
 * Premiere'e yalnız kullanıcı eyleminde gidilir (kaldir): panel açılışında çağrı yok.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloKaldir = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";

  var KR = (root && root.SufloKeyRecords) || null;
  if (!KR && typeof require === "function") {
    try { KR = require("./key-records.js"); } catch (e) { KR = null; }
  }

  var TURLER = ["gecis", "zoom", "hareket"];
  var EN_COK = 300;   // tek çağrıda host'a giden kayıt (KS_removeSufloKeys sınırı)

  // Kaldırma başarı metni (araç başına; sayı birleştirilir, i18n/en.js'te {n} kalıbıyla çevrilir)
  var BASARI = {
    gecis: function (n) { return "Geçiş kaldırıldı: " + n + " anahtar kare silindi."; },
    zoom: function (n) { return "Zoom kaldırıldı: " + n + " anahtar kare silindi."; },
    hareket: function (n) { return "Önayar kaldırıldı: " + n + " anahtar kare silindi."; }
  };
  // Kalan (saklanan / dokunulmayan) kayıtların nedeni, host'un atlanan kodu başına
  var KALAN = {
    sekans: function (n) { return n + " kayıt başka bir sekansta; saklandı, o sekansı açıp yeniden dene."; },
    klipYok: function (n) { return n + " kaydın klibi bulunamadı; kayıt saklandı, klip yerindeyken yeniden dene."; },
    ozellik: function (n) { return n + " kaydın özelliği bulunamadı; kayıt saklandı."; },
    degisti: function (n) { return n + " kaydın anahtar kareleri sonradan değiştirilmiş; dokunulmadı."; }
  };
  function kenarMetni(n) { return "Kendi anahtar karelerin korundu; kenarlara " + n + " anahtar kare eski değerle eklendi."; }
  var HATALAR = {
    sekansYok: "Aktif sekans yok.",
    kesimYok: "Playhead'in yakınında kesim yok. Playhead'i iki klibin birleştiği yere getir.",
    erisim: "Premiere'e ulaşılamadı; biraz sonra yeniden dene."
  };

  function sayi(n) { return String(Math.max(0, Math.floor(Number(n) || 0))); }
  function doldur(kalip, n) { return kalip(sayi(n)); }
  function aracMi(tur) { return TURLER.indexOf(tur) !== -1; }

  function aralik(r) {
    var t = r && Array.isArray(r.times) ? r.times : [];
    return t.length ? [t[0], t[t.length - 1]] : null;
  }

  /*
   * Yeni kaydın yerini aldığı eski araç kayıtları: aynı sekans, klip ve özellik, zaman aralıkları kesişiyor.
   * Araç yazmadan önce o pencereyi temizler: eski kaydın anahtarları gitti; kalsaydı yenisinin anahtarlarını
   * kendininmiş gibi eşleyip kaldırmayı bölebilirdi. Eğri kayıtlarına dokunulmaz.
   */
  function cakisanlar(liste, yeni) {
    var ya = aralik(yeni);
    if (!yeni || !ya) return [];
    var pay = 1e-4;
    return (Array.isArray(liste) ? liste : []).filter(function (r) {
      if (!r || r === yeni || r.id === yeni.id || !aracMi(r.tur)) return false;
      if (r.seqId !== yeni.seqId || r.nodeId !== yeni.nodeId || r.matchName !== yeni.matchName) return false;
      var ra = aralik(r);
      return !!ra && ra[0] <= ya[1] + pay && ya[0] <= ra[1] + pay;
    });
  }

  /*
   * KS_removeSufloKeys cevabının özeti: { eslesen, silinen, eklenen, biten (host'un bitirdiği kayıt id'leri:
   * silindi ya da Suflo'nun anahtarları zaten yoktu), yok (zaten kaldırılmış sayısı), kalan: { kod: sayı },
   * kalanSayi, degistiSayi }
   */
  function ozet(r) {
    var o = { eslesen: 0, silinen: 0, eklenen: 0, biten: [], yok: 0, kalan: {}, kalanSayi: 0, degistiSayi: 0 };
    if (!r || typeof r !== "object") return o;
    o.eslesen = Math.max(0, Number(r.eslesen) || 0);
    (Array.isArray(r.sonuclar) ? r.sonuclar : []).forEach(function (s) {
      if (!s || typeof s.id !== "string") return;
      o.biten.push(s.id);
      o.silinen += Math.max(0, Number(s.silinen) || 0);
      o.eklenen += Math.max(0, Number(s.eklenen) || 0);
      if (s.kod === "yok" && !Number(s.silinen)) o.yok++;
    });
    (Array.isArray(r.atlanan) ? r.atlanan : []).forEach(function (a) {
      var kod = a && KALAN[a.kod] ? a.kod : "klipYok";
      o.kalan[kod] = (o.kalan[kod] || 0) + 1;
      o.kalanSayi++;
      if (kod === "degisti") o.degistiSayi++;
    });
    return o;
  }

  /*
   * Eski yöntem (onaylı) gerekiyor mu: 'yok' — kapsamda hiç kayıt yok; 'degisti' — kayıtlar var ama hiçbiri
   * silinemedi, çünkü Suflo'nun anahtarları sonradan değiştirilmiş. Aksi hâlde false.
   */
  function yedekGerekli(o) {
    if (!o || o.kayitYok || !o.eslesen) return "yok";
    if (!o.silinen && o.degistiSayi > 0 && o.degistiSayi === o.kalanSayi && !o.yok) return "degisti";
    return false;
  }

  /* Durum / bildirim metni parçaları (her parça ayrı çevrilir) ve sınıfı: { parcalar, tur: 'good' | 'warn' } */
  function mesajParcalari(tur, o) {
    var p = [];
    if (o.silinen) p.push(doldur(BASARI[tur] || BASARI.gecis, o.silinen));
    else if (o.yok && !o.kalanSayi) p.push("Suflo'nun anahtar kareleri zaten kaldırılmış (Premiere'de geri alınmış ya da silinmiş); kayıt temizlendi.");
    else if (!o.kalanSayi) p.push("Kaldırılacak Suflo anahtar karesi yok.");
    if (o.eklenen) p.push(doldur(kenarMetni, o.eklenen));
    Object.keys(KALAN).forEach(function (kod) { if (o.kalan[kod]) p.push(doldur(KALAN[kod], o.kalan[kod])); });
    var iyi = o.silinen > 0 && !o.kalanSayi;
    return { parcalar: p, tur: iyi ? "good" : "warn" };
  }

  function hataMetni(kod) { return HATALAR[kod] || ""; }

  function hata(kod, yedek) {
    var e = new Error(hataMetni(kod) || yedek || "Kaldırılamadı.");
    e.kod = kod || "";
    return e;
  }

  /*
   * o: { call: (fn, arg, ms) → Promise, depo?: SufloKeyRecords.depo(), simdi?: () → ms }
   */
  function olustur(o) {
    o = o || {};
    var call = o.call;
    var depoNesnesi = o.depo !== undefined ? o.depo : null;
    var bellek = [];   // { proje, r }: depoya yazılamayan kayıtlar (bu oturum)
    function simdi() { return typeof o.simdi === "function" ? o.simdi() : Date.now(); }
    function depo() {
      if (depoNesnesi === null && KR) { try { depoNesnesi = KR.depo(); } catch (e) { depoNesnesi = false; } }
      return depoNesnesi || null;
    }
    function anahtar(proje) { return KR ? KR.depoAnahtari(proje) : String(proje || ""); }

    // Projenin araç kayıtları (depo + bu oturumun belleği); f: { tur, seqId, idler }
    function kayitlar(proje, f) {
      f = f || {};
      var d = depo(), liste = [];
      try { liste = d ? d.oku(proje) : []; } catch (e) { liste = []; }
      var idler = {}, k = anahtar(proje);
      liste.forEach(function (r) { idler[r.id] = 1; });
      bellek.forEach(function (b) { if (b.proje === k && !idler[b.r.id]) liste.push(b.r); });
      var sec = null;
      if (Array.isArray(f.idler)) { sec = {}; f.idler.forEach(function (id) { sec[id] = 1; }); }
      return liste.filter(function (r) {
        if (!r || !aracMi(r.tur)) return false;
        if (f.tur && r.tur !== f.tur) return false;
        if (f.seqId && r.seqId !== String(f.seqId)) return false;
        if (sec && !sec[r.id]) return false;
        return true;
      });
    }

    function sil(proje, idler) {
      if (!idler || !idler.length) return;
      var set = {};
      idler.forEach(function (id) { set[id] = 1; });
      bellek = bellek.filter(function (b) { return !set[b.r.id]; });
      try { var d = depo(); if (d) d.kaldir(proje, idler); } catch (e) {}
    }

    /*
     * Host'un döndürdüğü kayıtları saklar; aynı pencerenin eski araç kayıtları atılır (cakisanlar).
     * Doner: { ok (depoya yazıldı), idler (bu uygulamanın kayıtları: bildirimdeki Geri al) }
     */
    function sakla(proje, records) {
      if (!KR) return { ok: false, idler: [] };
      var yeni = (Array.isArray(records) ? records : []).map(function (r) {
        var k = KR.kayit(r, simdi());
        if (k) k.id = KR.yeniId(simdi());
        return k;
      }).filter(function (r) { return r && aracMi(r.tur); });
      if (!yeni.length) return { ok: true, idler: [] };
      var eski = kayitlar(proje), at = {};
      yeni.forEach(function (r) { cakisanlar(eski, r).forEach(function (x) { at[x.id] = 1; }); });
      var atilacak = Object.keys(at);
      bellek = bellek.filter(function (b) { return !at[b.r.id]; });
      var ok = false, d = depo();
      try {
        if (d && atilacak.length) d.kaldir(proje, atilacak);
        ok = !!(d && d.ekle(proje, yeni).ok);
      } catch (e) { ok = false; }
      if (!ok) { var k = anahtar(proje); yeni.forEach(function (r) { bellek.push({ proje: k, r: r }); }); }
      return { ok: ok, idler: yeni.map(function (r) { return r.id; }) };
    }

    /*
     * opts: { tur, secili?: true | kesim?: { tolerance } | idler?: [id] (bildirimdeki Geri al), proje? }
     * Doner: ozet(...) + { kayitYok, proje, seqId }. Hata: Error (kod: 'sekansYok' | 'kesimYok' | 'erisim' | host kodu).
     */
    async function kaldir(opts) {
      opts = opts || {};
      if (typeof call !== "function") throw hata("erisim");
      var pk = await call("KS_easePeek", undefined, 10000);
      if (!pk || !pk.ok) throw hata(pk && pk.kod ? pk.kod : "erisim", pk && pk.error);
      if (!pk.seqId) throw hata("sekansYok");
      var proje = typeof opts.proje === "string" ? opts.proje : (pk.proje || "");
      var f = { tur: opts.tur };
      if (Array.isArray(opts.idler)) f.idler = opts.idler; else f.seqId = pk.seqId;
      var liste = kayitlar(proje, f).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, EN_COK);
      // Kayıt yoksa da kapsamlı çağrı host'a gider (boş listeyle hiçbir şey silinmez): playhead yakınında kesim
      // yoksa ya da hiç klip seçili değilse eski yöntem sorulmadan önce bunu söyler. Yalnız id kapsamı kısa yoldan döner.
      if (!liste.length && !opts.secili && !opts.kesim) {
        var bos = ozet(null);
        bos.kayitYok = true; bos.proje = proje; bos.seqId = pk.seqId;
        return bos;
      }
      var arg = { records: liste };
      if (opts.secili) arg.secili = true;
      if (opts.kesim) arg.kesim = { tolerance: Number(opts.kesim.tolerance) || 1 };
      var r = await call("KS_removeSufloKeys", arg, 120000);
      if (!r || !r.ok) throw hata(r && r.kod, r && r.error);
      var oz = ozet(r);
      sil(proje, oz.biten);
      oz.kayitYok = oz.eslesen === 0;
      oz.proje = proje;
      oz.seqId = pk.seqId;
      if (r.kesim) oz.kesim = r.kesim;
      if (typeof r.secim === "number") oz.secim = r.secim;
      return oz;
    }

    /*
     * Araçların ortak kaldırma akışı (DOM'a dokunmaz; gösterilecek metni döndürür).
     * o: { tur, kapsam (kaldir seçenekleri), onay: (soru) → bool,
     *      yedek?: async () → { parcalar, tur } (eski yöntem), yedekMetni?: { yok, degisti } (onay sorusu),
     *      kayitYokMetni?: kayıt yoksa ve eski yöntem yoksa gösterilecek metin }
     * Eski yöntem YALNIZ onayla çalışır. Doner: { parcalar, tur: 'good' | 'warn', yedek, iptal }
     */
    async function akis(o) {
      o = o || {};
      var kapsam = {};
      Object.keys(o.kapsam || {}).forEach(function (k) { kapsam[k] = o.kapsam[k]; });
      kapsam.tur = o.tur;
      var oz = await kaldir(kapsam);
      if (kapsam.secili && oz.secim === 0) return { parcalar: ["Önce timeline'da bir klip seç."], tur: "warn", yedek: false, iptal: false };
      var y = yedekGerekli(oz);
      if (y && typeof o.yedek === "function" && o.yedekMetni && o.yedekMetni[y]) {
        if (!(typeof o.onay === "function" && o.onay(o.yedekMetni[y]))) return { parcalar: ["Hiçbir şey silinmedi."], tur: "warn", yedek: false, iptal: true };
        var s = await o.yedek();
        return { parcalar: s && s.parcalar ? s.parcalar : [], tur: s && s.tur ? s.tur : "good", yedek: true, iptal: false };
      }
      if (y === "yok" && o.kayitYokMetni) return { parcalar: [o.kayitYokMetni], tur: "warn", yedek: false, iptal: false };
      var m = mesajParcalari(o.tur, oz);
      return { parcalar: m.parcalar, tur: m.tur, yedek: false, iptal: false };
    }

    return { sakla: sakla, kayitlar: kayitlar, kaldir: kaldir, akis: akis, sil: sil };
  }

  // Panelin paylaşılan örneği (Geçişler, Zoom, Hareket önayarları aynı depoyu ve oturum belleğini kullanır)
  var paylasilan = null;
  function panel() {
    if (!paylasilan) {
      paylasilan = olustur({ call: function (fn, arg, ms) {
        var K = root && root.K;
        return K && K.call ? K.call(fn, arg, ms) : Promise.resolve({ ok: false, kod: "erisim" });
      } });
    }
    return paylasilan;
  }

  /* DOM yardımcısı: parçalar ayrı metin düğümleri (i18n her birini ayrı çevirir), " · " ile */
  function dugum(parcalar) {
    if (typeof document === "undefined") return null;
    var kap = document.createElement("span");
    (parcalar || []).forEach(function (p, i) {
      if (i) kap.appendChild(document.createTextNode(" · "));
      kap.appendChild(document.createTextNode(String(p)));
    });
    return kap;
  }

  return {
    TURLER: TURLER.slice(), BASARI: BASARI, KALAN: KALAN, HATALAR: HATALAR, kenarMetni: kenarMetni,
    cakisanlar: cakisanlar, ozet: ozet, yedekGerekli: yedekGerekli, mesajParcalari: mesajParcalari,
    hataMetni: hataMetni, olustur: olustur, panel: panel, dugum: dugum
  };
});
