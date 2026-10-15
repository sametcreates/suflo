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
 *   geri konur. Varışta yaylanmada (tur 'yaylan', uclar null) kenarDegerleri[0] iniş anahtarıdır.
 *   İsteğe bağlı kaynak çapası { clipEnd, clipIn, clipOut, ters }: yazıldığı andaki klip bitişi, kaynak
 *   giriş / çıkış noktası ve ters oynatma. Anahtarlar klibin kaynak zamanında durur; slip ya da baştan
 *   ripple kırpma onları timeline'da kaydırır, kaldırırken bu çapayla bulunur (Eğri; 3.4 adım 10).
 *
 * canli(kayit, canliZamanlar, fps): iki uç hâlâ var VE kaydedilen zamanların en az %60'ı yerinde
 * (sıralı iki dizide birleştirme yürüyüşü, tolerans 0,25 kare). Bu eşikler Suflo'nundur.
 *
 * Depo: proje başına bir localStorage anahtarı; projede sınıf başına en çok 300 (Eğri kayıtları ve araç kayıtları
 * — Geçiş, Zoom, Hareket önayarı… — ayrı sayılır: çok kliple tek bir araç uygulaması Eğri'nin Geri al kayıtlarını
 * atmaz; 3.4 adım 11), toplam en çok 2000 kayıt.
 * Kayıt sayısının yanında BOYUT da sınırlı: proje kovası en çok 400 000, tüm kovalar en çok
 * 1 000 000 karakter (diskteki JSON uzunluğu). localStorage kotası (~5 M karakter) panelin geri
 * kalanıyla (deneme sayacı aynası, Hız Rampası kayıtları…) ortak; bu pay ona yer bırakır.
 * Zamanlar diskte sıkıştırılır ('z': 0,1 ms birimli ilk değer + artışlar, 36 tabanında; aynı artış
 * yinelenirse 'artış*adet'), anahtar başına ~3 karakter.
 * Sınır aşılınca kayıtlar TEK TEK, en eskiden atılır: önce diğer projelerinkiler, sonra bu projenin
 * eski kayıtları, en son (yalnız başka yol kalmadıysa) yeni eklenenler. Yazma kota hatası verirse
 * (yalnız kota hatasında; başka hatada hiçbir şey silinmez) birkaç kayıtlık yer açılıp yeniden
 * denenir. Yeni kayıtların hiçbiri sığmıyorsa ya da yazma sonunda başarısızsa atılanlar geri konur (kazanç
 * getirmeyen atma diskte kalmaz). ekle() kaç kaydın gerçekten saklandığını (eklenen) ve kaç eski kaydın atıldığını
 * (atilan) bildirir. Her okuma/yazma try/catch içinde; bozuk veri yok sayılır: dizin (proje başına sayı / boyut)
 * yalnız tahmindir, depodaki kovalarla uzlaştırılır, sınır aşılıyor görünürse gerçek kovalardan yeniden hesaplanır;
 * yazılamazsa silinir (sonraki okuma kovalardan kurar). Kayıt başına en çok 4096 zaman: fazlası kesilmez, reddedilir.
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
  var ZAMAN_UST = 1e8;          // |zaman| üst sınırı (sn); ötesi anlamsız, sıkıştırma tamsayıda kalsın
  var KENAR_SINIR = 8;
  var PROJE_KARAKTER = 400000;  // proje kovası en çok (diskteki JSON karakteri)
  var TOPLAM_KARAKTER = 1000000; // tüm kovalar en çok
  var KOTA_ADIM = 2048;         // kota hatasında bir denemede açılacak en az yer (karakter; birkaç kayıt)
  var KOTA_DENEME = 24;
  var KOTA_PAY = 256;           // kota hatasında: önceden sığan boyutun bu kadar altına inince durulur
  var KOTA = "kota";
  var ONEK = "suflo.anahtarKayit.v1:";
  var DIZIN = "suflo.anahtarKayit.v1.dizin";
  var VARSAYILAN_FPS = 30;

  function sonlu(v) { return typeof v === "number" && isFinite(v); }
  function metin(v, en) { return typeof v === "string" ? v.slice(0, en) : (sonlu(v) ? String(v).slice(0, en) : ""); }
  function r4(v) { var r = Math.round(v * 10000) / 10000; return r === 0 ? 0 : r; }   // 0,1 ms; 0,25 karenin çok altında

  /* ---------------- zamanların sıkıştırılması ---------------- */
  var BIRIM = 10000;            // 0,1 ms
  // sıralı, tekrarsız, r4'lü zamanlar → "ilk,artış,artış*adet,…" (36 tabanı)
  function zamanKodla(times) {
    var u = [], i;
    for (i = 0; i < times.length; i++) u.push(Math.round(times[i] * BIRIM));
    if (!u.length) return "";
    var out = [u[0].toString(36)];
    i = 1;
    while (i < u.length) {
      var d = u[i] - u[i - 1], k = 1;
      while (i + k < u.length && u[i + k] - u[i + k - 1] === d) k++;
      if (k >= 3) { out.push(d.toString(36) + "*" + k.toString(36)); i += k; }
      else { out.push(d.toString(36)); i++; }
    }
    return out.join(",");
  }
  // Tüm kodun biçimi tek geçişte denetlenir (parçalar ',' ile ayrık; geri izleme patlaması yok)
  var KOD_BICIM = /^-?[0-9a-z]{1,9}(?:,[0-9a-z]{1,9}(?:\*[0-9a-z]{1,3})?)*$/;
  // zamanKodla'nın tersi; bozuk kodda boş dizi (kayıt geçersiz sayılır)
  function zamanCoz(s) {
    if (typeof s !== "string" || !s || s.length > ZAMAN_SINIR * 12 || !KOD_BICIM.test(s)) return [];
    var parca = s.split(","), u = parseInt(parca[0], 36), out = [u / BIRIM];
    for (var i = 1; i < parca.length && out.length < ZAMAN_SINIR; i++) {
      var p = parca[i], yildiz = p.indexOf("*");
      var v = parseInt(p, 36);   // '*'da durur
      var k = yildiz < 0 ? 1 : parseInt(p.slice(yildiz + 1), 36);
      if (!(v > 0) || !(k >= 1)) return [];
      for (var j = 0; j < k && out.length < ZAMAN_SINIR; j++) { u += v; out.push(u / BIRIM); }
    }
    return out;
  }

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
    var sirali = true;
    for (var i = 0; i < dizi.length && z.length < sinir * 2; i++) {
      if (sonlu(dizi[i]) && Math.abs(dizi[i]) <= ZAMAN_UST) {
        var v = yuvarla ? yuvarla(dizi[i]) : dizi[i];
        if (z.length && v < z[z.length - 1]) sirali = false;
        z.push(v);
      }
    }
    if (!sirali) z.sort(function (a, b) { return a - b; });   // depodan gelen zamanlar zaten sıralı
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
    // Kayıt başına en çok ZAMAN_SINIR zaman: fazlası KESİLMEZ, kayıt reddedilir (ekle ok: false). Kesik kayıt Suflo'nun
    // yazdığı anahtarların bir kısmını unutur: kaldırma geri kalanını bırakır, canlılık oranı yanlış listeyle ölçülür.
    // Üreticiler bunun çok altında: özellik başına en çok 2000 ara anahtar (bakePlan, yogunlastir, host KS_EGRI_EN_COK)
    // ve birkaç yüz çapa.
    if (Array.isArray(o.times) && o.times.length > ZAMAN_SINIR * 2) return null;
    var times = siraliZamanlar(o.times, ZAMAN_SINIR + 1, r4);
    if (!times.length || times.length > ZAMAN_SINIR) return null;
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
    var out = {
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
    // İsteğe bağlı kaynak çapası (yalnız dördü de geçerliyse; diğer araçların kaydında yer tutmaz)
    if (sonlu(o.clipStart) && sonlu(o.clipEnd) && o.clipEnd > o.clipStart && sonlu(o.clipIn) && sonlu(o.clipOut) && o.clipOut !== o.clipIn &&
      Math.abs(o.clipEnd) <= ZAMAN_UST && Math.abs(o.clipIn) <= ZAMAN_UST && Math.abs(o.clipOut) <= ZAMAN_UST) {
      out.clipEnd = r4(o.clipEnd);
      out.clipIn = r4(o.clipIn);
      out.clipOut = r4(o.clipOut);
      out.ters = o.ters === true;
    }
    return out;
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

  // Kayıt sınıfı: Eğri sekmesinin Geri al kayıtları ('egri' ve varışta yaylanma 'yaylan', 3.4 adım 14) ya da araç kayıtları
  // (diğer türler). Proje kovasında her sınıfın kendi sınırı var ve yer açmak için bir sınıfın kayıtları yalnız kendi sınıfının
  // eskilerini atar.
  function sinif(r) { return r && (r.tur === "egri" || r.tur === "yaylan") ? "egri" : "arac"; }

  // Sınıf başına en yeni `sinir` kaydı tutar (enYeniler her sınıfa ayrı; listedeki sıra korunur)
  function sinifEnYeniler(liste, sinir) {
    var gruplar = { egri: [], arac: [] }, tut = {};
    liste.forEach(function (r, i) { gruplar[sinif(r)].push({ r: r, i: i }); });
    Object.keys(gruplar).forEach(function (s) {
      var g = gruplar[s];
      if (g.length > sinir) {
        g.sort(function (a, b) { return (b.r.createdAt - a.r.createdAt) || (b.i - a.i); });
        g = g.slice(0, sinir);
      }
      g.forEach(function (x) { tut[x.i] = 1; });
    });
    return liste.filter(function (r, i) { return tut[i] === 1; });
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

  /* ---------------- disk biçimi ve boyut ---------------- */
  // Diskteki kayıt: 'times' yerine sıkıştırılmış 'z'
  function diske(r) {
    var o = {};
    Object.keys(r).forEach(function (k) { if (k !== "times") o[k] = r[k]; });
    o.z = zamanKodla(r.times);
    return o;
  }
  // Diskten okunan ham kayıt: 'z' varsa 'times'a açılır (eski biçimdeki 'times' dizisi de okunur)
  function diskten(h) {
    if (!h || typeof h !== "object" || Array.isArray(h.times) || typeof h.z !== "string") return h;
    var o = {};
    Object.keys(h).forEach(function (k) { if (k !== "z") o[k] = h[k]; });
    o.times = zamanCoz(h.z);
    return o;
  }
  function kotaHatasi(e) {
    if (!e) return false;
    var ad = String(e.name || "");
    return ad === "QuotaExceededError" || ad === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014;
  }
  // Kova paketi: kayıtlar + her birinin diskteki JSON metni (boyut bir kez hesaplanır)
  function paketle(liste) {
    return { liste: liste.slice(), parca: liste.map(function (r) { return JSON.stringify(diske(r)); }) };
  }
  function paketMetni(p) { return "{\"v\":2,\"k\":[" + p.parca.join(",") + "]}"; }
  function paketBoyutu(p) {   // = paketMetni(p).length; boş kova diskte yer tutmaz (silinir)
    if (!p.liste.length) return 0;
    var b = 14 + p.parca.length - 1;
    for (var i = 0; i < p.parca.length; i++) b += p.parca[i].length;
    return b;
  }
  // Paketten en eski kayıtları TEK TEK atar (önce korunmayanlar, sonra korunanlar; createdAt
  // artan) — hedefKarakter karakterlik yer açılana ve hedefSayi kayıt atılana dek. { sayi, serbest }
  // Korunanlar (bu çağrıda eklenenler) varsa başka sınıfın kayıtları en sona kalır: araç kayıtları için Eğri'ninkiler
  // (ve tersi) atılmaz, yer yetmezse yeni eklenenler saklanamaz (ekle ok: false).
  function paketten(p, hedefKarakter, hedefSayi, korunan) {
    var siniflar = {}, korunanVar = false;
    p.liste.forEach(function (r) { if (korunan[r.id]) { siniflar[sinif(r)] = 1; korunanVar = true; } });
    var sira = p.liste.map(function (r, i) {
      return { i: i, k: korunan[r.id] ? 1 : (korunanVar && !siniflar[sinif(r)] ? 2 : 0), c: r.createdAt };
    });
    sira.sort(function (a, b) { return a.k - b.k || a.c - b.c || a.i - b.i; });
    var at = {}, serbest = 0, sayi = 0;
    for (var j = 0; j < sira.length && (serbest < hedefKarakter || sayi < hedefSayi); j++) {
      at[sira[j].i] = 1; serbest += p.parca[sira[j].i].length + 1; sayi++;
    }
    if (sayi) {
      p.liste = p.liste.filter(function (r, i) { return !at[i]; });
      p.parca = p.parca.filter(function (s, i) { return !at[i]; });
    }
    return { sayi: sayi, serbest: serbest };
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
    // true: yazıldı · KOTA: depo dolu (QuotaExceededError) · false: başka hata (erişim yok vb.)
    function koy(k, v) {
      try { if (!ls) return false; ls.setItem(k, v); return true; } catch (e) { return kotaHatasi(e) ? KOTA : false; }
    }
    function sil(k) { try { if (!ls) return false; ls.removeItem(k); return true; } catch (e) { return false; } }
    function json(ham) { if (!ham) return null; try { return JSON.parse(ham); } catch (e) { return null; } }

    function kovaCoz(metinHam) {
      var o = json(metinHam);
      var ham = o && typeof o === "object" && !Array.isArray(o) && Array.isArray(o.k) ? o.k : [];
      var out = [];
      for (var i = 0; i < ham.length && i < PROJE_SINIR * 2; i++) { var r = kayit(diskten(ham[i])); if (r) out.push(r); }
      return out;
    }
    function kovaOku(anahtar) { return kovaCoz(al(anahtar)); }

    // Depodaki kova anahtarları { anahtar: 1 } (yalnız adlar okunur, ucuz); depo key()/length vermiyorsa null
    function kovaAnahtarlari() {
      try {
        if (!ls || !sonlu(ls.length) || typeof ls.key !== "function") return null;
        var out = {};
        for (var i = 0; i < ls.length; i++) {
          var k = ls.key(i);
          if (typeof k === "string" && k.indexOf(ONEK) === 0) out[k] = 1;
        }
        return out;
      } catch (e) { return null; }
    }

    // dizin: { anahtar: { n: kayıt sayısı, t: son yazma, b: kovanın karakter boyutu } }.
    // Bozuksa depodaki kovalar taranır; boyutu bilinmeyen kovanın boyutu gerektiğinde okunur.
    // Dizin yalnız bir TAHMİNDİR: depodaki kova adlarıyla uzlaştırılır (kovası olmayan girdi atılır, dizinde olmayan
    // kova eklenir) ve bir sınır aşılıyor görünürse kaydet() gerçek kovaları okuyup yeniden hesaplar; bozuk ya da eski
    // bir dizin geçerli kayıtları sildirmez.
    function dizinOku() {
      var d = json(al(DIZIN)), mevcut = kovaAnahtarlari();
      var temiz = {};
      if (d && typeof d === "object" && !Array.isArray(d)) {
        Object.keys(d).forEach(function (k) {
          var e = d[k];
          if (k.indexOf(ONEK) === 0 && e && sonlu(e.n) && e.n >= 0 && sonlu(e.t) && (!mevcut || mevcut[k])) {
            temiz[k] = { n: Math.min(Math.floor(e.n), PROJE_SINIR * 2), t: e.t, b: sonlu(e.b) && e.b >= 0 ? Math.floor(e.b) : -1 };
          }
        });
      }
      if (mevcut) {
        Object.keys(mevcut).forEach(function (k) {
          if (temiz[k]) return;
          var n = kovaOku(k).length;
          if (n) temiz[k] = { n: n, t: 0, b: -1 };
        });
      }
      return temiz;
    }
    function dizinYaz(d) { return koy(DIZIN, JSON.stringify(d)); }
    // Dizin yazılamazsa (kota) eski dizin bırakılmaz: silinir, bir sonraki okuma kovalardan yeniden kurar
    // (yanlış sayılar sınırları bozmasın).
    function dizinKaydet(d) {
      var s = dizinYaz(d);
      if (s !== true) sil(DIZIN);
      return s;
    }
    function boyutu(d, k) {
      if (d[k].b < 0) { var ham = al(k); d[k].b = typeof ham === "string" ? ham.length : 0; }
      return d[k].b;
    }
    function kovaKoy(anahtar, p) {
      if (!p.liste.length) return sil(anahtar);
      return koy(anahtar, paketMetni(p));
    }

    /*
     * Projenin listesini yazar; sayı ve boyut sınırlarını uygular. korunan: { id: 1 } — bu çağrıda
     * eklenen kayıtlar, en son atılır. Atma sırası (hep en eskiden, tek tek): diğer projelerin
     * kayıtları (tüm projelerde createdAt sırasıyla), bu projenin eski kayıtları, korunanlar.
     * Kazanç getirmeyen atma diskte KALMAZ: korunanların hiçbiri saklanamıyorsa ya da yazma sonunda başarısızsa
     * diske geçmiş atmalar geri konur ve bu projenin kovasına dokunulmaz (ok: false, atilan 0).
     * Döner: { ok, liste, atilan }.
     */
    function kaydet(proje, liste, korunan) {
      korunan = korunan || {};
      var korunanVar = Object.keys(korunan).length > 0;
      var anahtar = depoAnahtari(proje);
      var d = dizinOku();
      var eskiKova = al(anahtar);
      var eskiBoyut = typeof eskiKova === "string" ? eskiKova.length : 0;
      var p = paketle(sinifEnYeniler(liste, PROJE_SINIR));
      var atilanKendi = liste.length - p.liste.length, atilanDiger = 0;
      // korunanlardan (bu çağrıda eklenenler) en az biri listede mi; korunan yoksa hep evet
      function yeniVar() {
        if (!korunanVar) return true;
        for (var i = 0; i < p.liste.length; i++) if (korunan[p.liste[i].id]) return true;
        return false;
      }

      // diğer projelerin kovaları yalnız gerektiğinde okunur; atmalar önce bellekte yapılır. Okununca dizin gerçek
      // değerlerle düzeltilir (bozuk / eski dizin girdisine güvenilmez). ham: okunduğu andaki metin (geri koymak için).
      var digerleri = null;
      function digerleriAl() {
        if (!digerleri) {
          digerleri = Object.keys(d).filter(function (k) { return k !== anahtar; }).map(function (k) {
            var ham = al(k), x = { anahtar: k, ham: ham, p: paketle(kovaCoz(ham)), bekleyen: 0, diskte: 0, dOnce: null };
            if (x.p.liste.length) d[k] = { n: x.p.liste.length, t: d[k].t, b: paketBoyutu(x.p) }; else delete d[k];
            x.dOnce = d[k] ? { n: d[k].n, t: d[k].t, b: d[k].b } : null;
            return x;
          });
        }
        return digerleri;
      }
      function digerOzet() {
        var o = { n: 0, b: 0 };
        if (digerleri) digerleri.forEach(function (x) { o.n += x.p.liste.length; o.b += paketBoyutu(x.p); });
        else Object.keys(d).forEach(function (k) { if (k !== anahtar) { o.n += d[k].n; o.b += boyutu(d, k); } });
        return o;
      }
      function digerlerinden(hedefKarakter, hedefSayi) {
        var kv = digerleriAl(), aday = [];
        kv.forEach(function (x, xi) {
          var t = d[x.anahtar] ? d[x.anahtar].t : 0;
          x.p.liste.forEach(function (r, i) { aday.push({ x: xi, i: i, c: r.createdAt, t: t }); });
        });
        aday.sort(function (a, b) { return a.c - b.c || a.t - b.t || a.x - b.x || a.i - b.i; });
        var at = {}, serbest = 0, sayi = 0;
        for (var j = 0; j < aday.length && (serbest < hedefKarakter || sayi < hedefSayi); j++) {
          var a = aday[j];
          (at[a.x] = at[a.x] || {})[a.i] = 1;
          serbest += kv[a.x].p.parca[a.i].length + 1; sayi++;
        }
        kv.forEach(function (x, xi) {
          var m = at[xi];
          if (!m) return;
          var n0 = x.p.liste.length;
          x.p.liste = x.p.liste.filter(function (r, i) { return !m[i]; });
          x.p.parca = x.p.parca.filter(function (s, i) { return !m[i]; });
          x.bekleyen += n0 - x.p.liste.length;
        });
        return { sayi: sayi, serbest: serbest };
      }
      // bellekte kısalan diğer kovaları diske yazar (küçülen yazım yer açar); diske geçen atma sayısı
      function digerleriYaz() {
        var yazilan = 0;
        (digerleri || []).forEach(function (x) {
          if (!x.bekleyen) return;
          if (kovaKoy(x.anahtar, x.p) === true) {
            atilanDiger += x.bekleyen; yazilan += x.bekleyen; x.diskte += x.bekleyen;
            if (x.p.liste.length) d[x.anahtar] = { n: x.p.liste.length, t: d[x.anahtar] ? d[x.anahtar].t : 0, b: paketBoyutu(x.p) };
            else delete d[x.anahtar];
          } else {
            x.p = paketle(kovaOku(x.anahtar));   // yazılamadı: bellek diskle yeniden eşlenir
          }
          x.bekleyen = 0;
        });
        return yazilan;
      }
      // diske geçmiş ama kazanç getirmemiş atmaları geri koyar (kovalar okunduğu hâline döner; toplam boyut çağrı
      // öncesine iner, o zaman sığıyordu). Geri konamayan kova kısalmış kalır ve dizine öyle yazılır.
      function geriKoy() {
        var dizinDegisti = false;
        (digerleri || []).forEach(function (x) {
          if (!x.diskte) return;
          var s = typeof x.ham === "string" ? koy(x.anahtar, x.ham) : sil(x.anahtar);
          if (s === true) {
            atilanDiger -= x.diskte; x.diskte = 0;
            if (x.dOnce) d[x.anahtar] = x.dOnce; else delete d[x.anahtar];
          } else dizinDegisti = true;
        });
        return dizinDegisti;
      }
      function basarisiz() {
        if (geriKoy() || atilanDiger) dizinKaydet(d);
        return { ok: false, liste: kovaOku(anahtar), atilan: atilanDiger > 0 ? atilanDiger : 0 };
      }
      function kendinden(hedefKarakter, hedefSayi) {
        var r = paketten(p, hedefKarakter, hedefSayi, korunan);
        atilanKendi += r.sayi;
        return r;
      }

      // 1) proje boyut payı
      var fazla = paketBoyutu(p) - PROJE_KARAKTER;
      if (fazla > 0) kendinden(fazla, 0);
      // 2) toplam boyut ve toplam kayıt sınırı: önce diğer projelerin en eskileri, sonra bu projeninkiler. Dizin bir
      // sınırı aşıyor gösteriyorsa önce gerçek kovalar okunur ve fazlalık onlardan yeniden hesaplanır.
      var tahmin = digerOzet();
      if (tahmin.b + paketBoyutu(p) > TOPLAM_KARAKTER || tahmin.n + p.liste.length > TOPLAM_SINIR) digerleriAl();
      fazla = digerOzet().b + paketBoyutu(p) - TOPLAM_KARAKTER;
      if (fazla > 0) { fazla -= digerlerinden(fazla, 0).serbest; if (fazla > 0) kendinden(fazla, 0); }
      var fazlaN = digerOzet().n + p.liste.length - TOPLAM_SINIR;
      if (fazlaN > 0) { fazlaN -= digerlerinden(0, fazlaN).sayi; if (fazlaN > 0) kendinden(0, fazlaN); }
      // yeni kayıtların hiçbiri sığmıyorsa hiçbir şey yazılmaz (bellekteki atmalar diske geçmez)
      if (!yeniVar()) return basarisiz();

      // 3) yaz. YALNIZ kota hatasında küçük adımlarla (birkaç kayıt) yer açılır — önce diğer
      // projelerin en eskileri — ve yeniden denenir. Başka hatada hiçbir kayıt silinmez.
      // Üst sınır: Suflo verisi bu çağrıdan önce depoda duran boyutun (once) KOTA_PAY altına inince
      // durulur; o boyut zaten sığıyordu, hata sürüyorsa sebep yer değildir, silmek işe yaramaz.
      // Yeni kayıtların sonuncusu da atılmak zorunda kalırsa durulur: atmalar geri konur.
      var sonuc = kovaKoy(anahtar, p);
      if (sonuc === KOTA) {
        var once = eskiBoyut;
        digerleriAl().forEach(function (x) { once += typeof x.ham === "string" ? x.ham.length : 0; });
        var ust = once - KOTA_PAY;
        var adim = Math.max(KOTA_ADIM, Math.ceil((paketBoyutu(p) + digerOzet().b - ust) / 16));
        for (var deneme = 0; sonuc === KOTA && deneme < KOTA_DENEME; deneme++) {
          var gerek = paketBoyutu(p) + digerOzet().b - ust;
          if (gerek <= 0) break;
          var hedef = Math.min(adim, gerek);
          var digerden = digerlerinden(hedef, 0);
          var yazilan = digerleriYaz();
          var kendiden = digerden.serbest < hedef ? kendinden(hedef - digerden.serbest, 0) : { sayi: 0 };
          // ilerleme yoksa (küçülen kova bile yazılamıyor: depo yer yüzünden reddetmiyor) dur
          if (!yazilan && !kendiden.sayi) break;
          if (!yeniVar()) break;
          sonuc = kovaKoy(anahtar, p);
        }
      }
      if (sonuc !== true) return basarisiz();
      digerleriYaz();
      if (p.liste.length) d[anahtar] = { n: p.liste.length, t: simdi(), b: paketBoyutu(p) }; else delete d[anahtar];
      dizinKaydet(d);
      return { ok: true, liste: p.liste.slice(), atilan: atilanKendi + atilanDiger };
    }

    return {
      anahtar: depoAnahtari,
      // Projenin geçerli kayıtları (bozuk girdiler atlanır)
      oku: function (proje) { return kovaOku(depoAnahtari(proje)); },
      // Kayıt(lar) ekler; aynı id varsa yenisi yerine geçer. { ok, eklenen, atilan, liste }
      // eklenen: gerçekten saklanan yeni kayıt sayısı; ok yalnız hepsi saklandıysa true.
      // atilan: yer açmak için atılan eski kayıt sayısı (bu ve diğer projelerden).
      // Geçersiz girdi (ör. ZAMAN_SINIR'dan çok zaman) saklanmaz ve ok false olur.
      ekle: function (proje, kayitlar) {
        var girdi = Array.isArray(kayitlar) ? kayitlar : [kayitlar];
        var gelen = girdi.map(function (r) { return kayit(r, simdi()); }).filter(function (r) { return r; });
        if (!gelen.length) return { ok: false, eklenen: 0, atilan: 0, liste: kovaOku(depoAnahtari(proje)) };
        var idler = {};
        gelen.forEach(function (r) { idler[r.id] = 1; });
        var liste = kovaOku(depoAnahtari(proje)).filter(function (r) { return !idler[r.id]; }).concat(gelen);
        var s = kaydet(proje, liste, idler);
        var eklenen = 0;
        if (s.ok) s.liste.forEach(function (r) { if (idler[r.id]) eklenen++; });
        var atilan = s.ok ? s.atilan - (gelen.length - eklenen) : s.atilan;   // atılan yeniler "eski" sayılmaz
        return { ok: s.ok && eklenen === girdi.length, eklenen: eklenen, atilan: atilan > 0 ? atilan : 0, liste: s.liste };
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
    PROJE_SINIR: PROJE_SINIR, TOPLAM_SINIR: TOPLAM_SINIR, PROJE_KARAKTER: PROJE_KARAKTER, TOPLAM_KARAKTER: TOPLAM_KARAKTER,
    ONEK: ONEK, DIZIN: DIZIN, zamanKodla: zamanKodla, zamanCoz: zamanCoz,
    kayit: kayit, canli: canli, canliAyrinti: canliAyrinti, eslestir: eslestir, tolerans: tolerans,
    filtrele: filtrele, enYeniler: enYeniler, sinifEnYeniler: sinifEnYeniler, sinif: sinif, depoAnahtari: depoAnahtari, depo: depo, yeniId: yeniId
  };
});
