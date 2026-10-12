/*
 * Suflo Anahtar kare kayıtları — saf modül (DOM'a, Premiere'e dokunmaz)
 * window.SufloKeyRecords · module.exports  (3.4, plan adım 9; temiz oda, Suflo'nun kendi kodu)
 *
 * Suflo bir özelliğe anahtar kare yazdığında (Eğri, Geçiş, Zoom, Hareket önayarı, varışta
 * yaylanma) neyi yazdığını bir KAYIT olarak saklar. Kaldırırken yalnız kendi yazdığı ve hâlâ
 * yerinde duran anahtar kareleri siler; kullanıcının sonradan eklediği kareye dokunmaz.
 *
 * Kayıt:
 *   { id, tur: 'egri'|'gecis'|'zoom'|'hareket'|'yaylan', seqId, nodeId, clipName, clipStart,
 *     matchName, compIdx, propIdx, uclar: [t0, t1] | null, times: [...], kenarDegerleri, createdAt }
 *   times: Suflo'nun yazdığı anahtar karelerin timeline saniyeleri (artan).
 *   uclar: Eğri'de çiftin kullanıcıya ait iki ucu; null ise times'ın ilk ve son elemanı.
 *   kenarDegerleri: yazmadan önceki kenar değerleri [{ t, v }] (v sayı ya da [x,y]); kaldırmada
 *   geri konur.
 *
 * canli(kayit, canliZamanlar, fps): iki uç hâlâ var VE kaydedilen zamanların en az %60'ı yerinde
 * (sıralı iki dizide birleştirme yürüyüşü, tolerans 0,25 kare). Bu eşikler Suflo'nundur.
 *
 * Depo: proje başına bir localStorage anahtarı; projede en çok 300, toplam en çok 2000 kayıt
 * (fazlası en eskiden atılır). Her okuma/yazma try/catch içinde; bozuk veri yok sayılır.
 * Depo yalnız bu bilgisayardaki panelin kolaylığıdır: silinirse eski davranış (onaylı) çalışır.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SufloKeyRecords = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var TURLER = ["egri", "gecis", "zoom", "hareket", "yaylan"];
  var TOLERANS_KARE = 0.25;     // eşleşme toleransı: 0,25 kare
  var CANLI_ORAN = 0.6;         // en az %60'ı yerinde
  var PROJE_SINIR = 300;        // proje başına kayıt
  var TOPLAM_SINIR = 2000;      // tüm projelerde kayıt
  var ZAMAN_SINIR = 4096;       // kayıt başına zaman
  var KENAR_SINIR = 8;
  var ONEK = "suflo.anahtarKayit.v1:";
  var DIZIN = "suflo.anahtarKayit.v1.dizin";
  var VARSAYILAN_FPS = 30;

  function sonlu(v) { return typeof v === "number" && isFinite(v); }
  function metin(v, en) { return typeof v === "string" ? v.slice(0, en) : (sonlu(v) ? String(v).slice(0, en) : ""); }
  function r4(v) { var r = Math.round(v * 10000) / 10000; return r === 0 ? 0 : r; }   // 0,1 ms; 0,25 karenin çok altında

  var sayac = 0;
  function yeniId(simdi) {
    sayac = (sayac + 1) % 1679616;
    return "kr" + Math.floor(sonlu(simdi) ? simdi : Date.now()).toString(36) + sayac.toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  function degerOku(v) {
    if (sonlu(v)) return v;
    if (Array.isArray(v) && v.length >= 1 && v.length <= 4 && v.every(sonlu)) return v.slice();
    return null;
  }

  // sonlu sayılar, (isteğe bağlı) yuvarlanmış, artan, tekrarsız; en çok `sinir` eleman
  function siraliZamanlar(dizi, sinir, yuvarla) {
    if (!Array.isArray(dizi)) return [];
    var z = [];
    for (var i = 0; i < dizi.length && z.length < sinir * 2; i++) { if (sonlu(dizi[i])) z.push(yuvarla ? yuvarla(dizi[i]) : dizi[i]); }
    z.sort(function (a, b) { return a - b; });
    var out = [];
    for (var j = 0; j < z.length && out.length < sinir; j++) {
      if (!out.length || z[j] - out[out.length - 1] > 1e-9) out.push(z[j]);
    }
    return out;
  }

  /*
   * Ham nesneyi güvenli kayda çevirir; geçersizse null. Zamanlar 0,1 ms'ye yuvarlanır (depoda
   * yer kaplamasın), sıralanır, tekrarlar atılır.
   */
  function kayit(o, simdi) {
    if (!o || typeof o !== "object") return null;
    if (TURLER.indexOf(o.tur) === -1) return null;
    var times = siraliZamanlar(o.times, ZAMAN_SINIR, r4);
    if (!times.length) return null;
    var uclar = null;
    if (Array.isArray(o.uclar) && o.uclar.length === 2 && sonlu(o.uclar[0]) && sonlu(o.uclar[1]) && o.uclar[1] > o.uclar[0]) {
      uclar = [r4(o.uclar[0]), r4(o.uclar[1])];
    }
    var kenar = [];
    if (Array.isArray(o.kenarDegerleri)) {
      for (var i = 0; i < o.kenarDegerleri.length && kenar.length < KENAR_SINIR; i++) {
        var k = o.kenarDegerleri[i], v = k ? degerOku(k.v) : null;
        if (k && sonlu(k.t) && v !== null) kenar.push({ t: r4(k.t), v: v });
      }
    }
    var id = typeof o.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(o.id) ? o.id : yeniId(simdi);
    function tamsayi(v) { return sonlu(v) && v >= 0 && Math.floor(v) === v ? v : -1; }
    return {
      id: id,
      tur: o.tur,
      seqId: metin(o.seqId, 128),
      nodeId: metin(o.nodeId, 128),
      clipName: metin(o.clipName, 256),
      clipStart: sonlu(o.clipStart) ? r4(o.clipStart) : null,
      matchName: metin(o.matchName, 128),
      compIdx: tamsayi(o.compIdx),
      propIdx: tamsayi(o.propIdx),
      uclar: uclar,
      times: times,
      kenarDegerleri: kenar,
      createdAt: sonlu(o.createdAt) && o.createdAt > 0 ? o.createdAt : (sonlu(simdi) ? simdi : Date.now())
    };
  }

  function tolerans(fps) {
    var f = Number(fps);
    if (!(isFinite(f) && f > 0 && f <= 1000)) f = VARSAYILAN_FPS;
    return TOLERANS_KARE / f;
  }

  // sıralı dizide t'ye tol içinde bir eleman var mı (ikili arama)
  function varMi(sirali, t, tol) {
    var lo = 0, hi = sirali.length - 1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      if (Math.abs(sirali[m] - t) <= tol) return true;
      if (sirali[m] < t) lo = m + 1; else hi = m - 1;
    }
    return false;
  }

  /*
   * Birleştirme yürüyüşü: iki sıralı dizide tol içinde eşleşen çiftler. Her canlı zaman en
   * çok bir kayıtlı zamanla eşleşir. Döner: { sayi, zamanlar: eşleşen CANLI zamanlar }.
   */
  function eslestir(kayitli, canliZ, tol) {
    var i = 0, j = 0, out = [];
    while (i < kayitli.length && j < canliZ.length) {
      var a = kayitli[i], b = canliZ[j];
      if (Math.abs(a - b) <= tol) { out.push(b); i++; j++; }
      else if (a < b) i++;
      else j++;
    }
    return { sayi: out.length, zamanlar: out };
  }

  /*
   * Ayrıntılı canlılık: { canli, uclar (iki uç da yerinde mi), eslesen, toplam, oran,
   * zamanlar (Suflo'nun yazdığı ve hâlâ duran CANLI zamanlar — kaldırmada yalnız bunlar silinir) }.
   */
  function canliAyrinti(rec, canliZamanlar, fps) {
    var r = rec && rec.times && rec.tur ? kayit(rec) : null;
    var bos = { canli: false, uclar: false, eslesen: 0, toplam: 0, oran: 0, zamanlar: [] };
    if (!r) return bos;
    var tol = tolerans(fps);
    var canliZ = siraliZamanlar(canliZamanlar, 100000);
    var uc = r.uclar || [r.times[0], r.times[r.times.length - 1]];
    var uclarVar = varMi(canliZ, uc[0], tol) && varMi(canliZ, uc[1], tol);
    var e = eslestir(r.times, canliZ, tol);
    var oran = e.sayi / r.times.length;
    return {
      canli: uclarVar && e.sayi >= CANLI_ORAN * r.times.length - 1e-9,
      uclar: uclarVar, eslesen: e.sayi, toplam: r.times.length, oran: oran, zamanlar: e.zamanlar
    };
  }

  function canli(rec, canliZamanlar, fps) { return canliAyrinti(rec, canliZamanlar, fps).canli; }

  // Liste süzgeci: { tur, seqId, nodeId } (verilenler eşleşmeli)
  function filtrele(liste, f) {
    f = f || {};
    return (Array.isArray(liste) ? liste : []).filter(function (r) {
      if (!r) return false;
      if (f.tur && r.tur !== f.tur) return false;
      if (f.seqId && r.seqId !== String(f.seqId)) return false;
      if (f.nodeId && r.nodeId !== String(f.nodeId)) return false;
      return true;
    });
  }

  // En yeni `sinir` kaydı tutar (createdAt'e göre; eşitlikte listedeki sıra)
  function enYeniler(liste, sinir) {
    if (liste.length <= sinir) return liste.slice();
    var sirali = liste.map(function (r, i) { return { r: r, i: i }; });
    sirali.sort(function (a, b) { return (b.r.createdAt - a.r.createdAt) || (b.i - a.i); });
    var tut = {};
    sirali.slice(0, sinir).forEach(function (x) { tut[x.i] = 1; });
    return liste.filter(function (r, i) { return tut[i] === 1; });
  }

  /* ---------------- proje anahtarı ---------------- */
  // FNV-1a (iki tohum, 64 bit görünüm): proje yolu depoda açık durmasın, anahtar kısa kalsın
  function fnv(s, tohum) {
    var h = tohum >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  function projeKimligi(proje) {
    var s = typeof proje === "string" ? proje : "";
    s = s.replace(/^\s+|\s+$/g, "").replace(/\\/g, "/").toLowerCase();
    return s || "(kaydedilmemis)";
  }
  function depoAnahtari(proje) {
    var s = projeKimligi(proje);
    return ONEK + fnv(s, 0x811c9dc5) + fnv(s, 0x01000193);
  }

  /* ---------------- depo ---------------- */
  function varsayilanDepo() {
    try { return typeof window !== "undefined" && window.localStorage ? window.localStorage : null; } catch (e) { return null; }
  }

  /*
   * depo(storage?, { simdi? }) → { oku, ekle, kaldir, degistir, temizle, toplam, anahtar }
   * storage: getItem/setItem/removeItem (+ isteğe bağlı key/length) — varsayılan window.localStorage.
   * Hiçbir çağrı hata fırlatmaz.
   */
  function depo(storage, ayar) {
    var ls = storage === undefined ? varsayilanDepo() : storage;
    ayar = ayar || {};
    function simdi() { return typeof ayar.simdi === "function" ? ayar.simdi() : Date.now(); }

    function al(k) { try { return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
    function koy(k, v) { try { if (!ls) return false; ls.setItem(k, v); return true; } catch (e) { return false; } }
    function sil(k) { try { if (!ls) return false; ls.removeItem(k); return true; } catch (e) { return false; } }
    function json(ham) { if (!ham) return null; try { return JSON.parse(ham); } catch (e) { return null; } }

    function kovaOku(anahtar) {
      var o = json(al(anahtar));
      var ham = o && typeof o === "object" && !Array.isArray(o) && Array.isArray(o.k) ? o.k : [];
      var out = [];
      for (var i = 0; i < ham.length && i < PROJE_SINIR * 2; i++) { var r = kayit(ham[i]); if (r) out.push(r); }
      return out;
    }

    // dizin: { anahtar: { n: kayıt sayısı, t: son yazma } }. Bozuksa depodaki kovalar taranır.
    function dizinOku() {
      var d = json(al(DIZIN));
      if (d && typeof d === "object" && !Array.isArray(d)) {
        var temiz = {};
        Object.keys(d).forEach(function (k) {
          var e = d[k];
          if (k.indexOf(ONEK) === 0 && e && sonlu(e.n) && e.n >= 0 && sonlu(e.t)) temiz[k] = { n: Math.floor(e.n), t: e.t };
        });
        return temiz;
      }
      var yeni = {};
      try {
        if (ls && sonlu(ls.length) && typeof ls.key === "function") {
          for (var i = 0; i < ls.length; i++) {
            var k = ls.key(i);
            if (typeof k === "string" && k.indexOf(ONEK) === 0) {
              var n = kovaOku(k).length;
              if (n) yeni[k] = { n: n, t: 0 };
            }
          }
        }
      } catch (e) {}
      return yeni;
    }
    function dizinYaz(d) { return koy(DIZIN, JSON.stringify(d)); }

    function kovaYaz(anahtar, liste) {
      if (!liste.length) return sil(anahtar);
      return koy(anahtar, JSON.stringify({ v: 1, k: liste }));
    }

    // toplam sınırı ve kota: başka projelerin en eski kayıtları atılır (en eski yazılan proje önce)
    function toplamiSinirla(d, korunan) {
      var toplamN = 0;
      Object.keys(d).forEach(function (k) { toplamN += d[k].n; });
      if (toplamN <= TOPLAM_SINIR) return;
      var digerleri = Object.keys(d).filter(function (k) { return k !== korunan; })
        .sort(function (a, b) { return d[a].t - d[b].t; });
      for (var i = 0; i < digerleri.length && toplamN > TOPLAM_SINIR; i++) {
        var k = digerleri[i], liste = kovaOku(k);
        var fazla = toplamN - TOPLAM_SINIR;
        var kalan = liste.length > fazla ? enYeniler(liste, liste.length - fazla) : [];
        toplamN -= (d[k].n - kalan.length);
        kovaYaz(k, kalan);
        if (kalan.length) d[k].n = kalan.length; else delete d[k];
      }
      if (toplamN > TOPLAM_SINIR && d[korunan]) {
        var kendi = kovaOku(korunan), tut = Math.max(0, kendi.length - (toplamN - TOPLAM_SINIR));
        kendi = enYeniler(kendi, tut);
        kovaYaz(korunan, kendi);
        if (kendi.length) d[korunan].n = kendi.length; else delete d[korunan];
      }
    }

    function kaydet(proje, liste) {
      var anahtar = depoAnahtari(proje);
      liste = enYeniler(liste, PROJE_SINIR);
      var d = dizinOku();
      var ok = kovaYaz(anahtar, liste);
      // kota dolduysa: diğer projeleri en eskiden boşalt, sonra kendi listesinin yarısıyla dene
      if (!ok) {
        var digerleri = Object.keys(d).filter(function (k) { return k !== anahtar; }).sort(function (a, b) { return d[a].t - d[b].t; });
        for (var i = 0; i < digerleri.length && !ok; i++) { sil(digerleri[i]); delete d[digerleri[i]]; ok = kovaYaz(anahtar, liste); }
        while (!ok && liste.length > 1) { liste = enYeniler(liste, Math.floor(liste.length / 2)); ok = kovaYaz(anahtar, liste); }
      }
      if (!ok) return { ok: false, liste: kovaOku(anahtar) };
      if (liste.length) d[anahtar] = { n: liste.length, t: simdi() }; else delete d[anahtar];
      toplamiSinirla(d, anahtar);
      dizinYaz(d);
      return { ok: true, liste: d[anahtar] ? kovaOku(anahtar) : [] };
    }

    return {
      anahtar: depoAnahtari,
      // Projenin geçerli kayıtları (bozuk girdiler atlanır)
      oku: function (proje) { return kovaOku(depoAnahtari(proje)); },
      // Kayıt(lar) ekler; aynı id varsa yenisi yerine geçer. { ok, eklenen, liste }
      ekle: function (proje, kayitlar) {
        var gelen = (Array.isArray(kayitlar) ? kayitlar : [kayitlar]).map(function (r) { return kayit(r, simdi()); })
          .filter(function (r) { return r; });
        if (!gelen.length) return { ok: false, eklenen: 0, liste: kovaOku(depoAnahtari(proje)) };
        var idler = {};
        gelen.forEach(function (r) { idler[r.id] = 1; });
        var liste = kovaOku(depoAnahtari(proje)).filter(function (r) { return !idler[r.id]; }).concat(gelen);
        var s = kaydet(proje, liste);
        return { ok: s.ok, eklenen: s.ok ? gelen.length : 0, liste: s.liste };
      },
      // id(ler)i siler. { ok, silinen, liste }
      kaldir: function (proje, idler) {
        var set = {};
        (Array.isArray(idler) ? idler : [idler]).forEach(function (id) { if (typeof id === "string") set[id] = 1; });
        var once = kovaOku(depoAnahtari(proje));
        var sonra = once.filter(function (r) { return !set[r.id]; });
        if (sonra.length === once.length) return { ok: true, silinen: 0, liste: once };
        var s = kaydet(proje, sonra);
        return { ok: s.ok, silinen: s.ok ? once.length - sonra.length : 0, liste: s.liste };
      },
      // Projenin listesini bütünüyle değiştirir (ör. canlı olmayanları ayıkladıktan sonra)
      degistir: function (proje, liste) {
        var temiz = (Array.isArray(liste) ? liste : []).map(function (r) { return kayit(r, simdi()); }).filter(function (r) { return r; });
        return kaydet(proje, temiz);
      },
      temizle: function (proje) { return kaydet(proje, []).ok; },
      toplam: function () { var d = dizinOku(), n = 0; Object.keys(d).forEach(function (k) { n += d[k].n; }); return n; }
    };
  }

  return {
    TURLER: TURLER.slice(), TOLERANS_KARE: TOLERANS_KARE, CANLI_ORAN: CANLI_ORAN,
    PROJE_SINIR: PROJE_SINIR, TOPLAM_SINIR: TOPLAM_SINIR, ONEK: ONEK, DIZIN: DIZIN,
    kayit: kayit, canli: canli, canliAyrinti: canliAyrinti, eslestir: eslestir, tolerans: tolerans,
    filtrele: filtrele, enYeniler: enYeniler, depoAnahtari: depoAnahtari, depo: depo, yeniId: yeniId
  };
});
