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
 * Kaldırılan anahtarlarda ucu duran Suflo Eğrisi (3.4 adım 10; aynı depo, tur 'egri') de kalkar: Eğri iki anahtarın
 * arasına iç anahtarlar yazar, ucu gidince onlar sahipsiz kalır (rampa durur, Eğri'nin Geri al'ı kaydı bulamaz). kaldir,
 * aynı klip ve özellikteki Eğri kayıtlarını da host'a verir (egriAdaylari); host karar verir, biten Eğri kaydı depodan düşer.
 * Geçişi kaldır'ın kesimini host seçer (playhead'in yakınında Suflo kaydı olan en yakın kesim; seçim öne geçmez); eski
 * yöntemin onayı o kesimi gösterir (kesimYeri) ve yedek tam o kesimi temizler.
 *
 * Saf kısım (DOM'suz, node ile test edilir): yerineGecis, kenarMiras, cakisanlar, ozet, mesajParcalari, yedekGerekli,
 * hataMetni, egriAdaylari, kesimYeri. olustur({ call, depo, simdi }) → { sakla, kayitlar, kaldir, akis }: call = K.call (Promise),
 * depo = SufloKeyRecords.depo().
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
    degisti: function (n) { return n + " kaydın anahtar kareleri sonradan değiştirilmiş; dokunulmadı."; },
    silinemedi: function (n) { return n + " kaydın anahtar karelerini Premiere silmedi; kayıt saklandı, yeniden dene."; }
  };
  // Seçili kapsamda Suflo kaydı eşleşmeyen video klipleri (önceki sürümde uygulanmış olabilir): dokunulmaz, söylenir
  function kayitsizMetni(n) { return n + " seçili klipte Suflo'nun kaydı yok; onlara dokunulmadı (önceki sürümde uygulandıysa yalnız o klibi seçip yeniden dene)."; }
  // Kalan anahtarlar kullanıcının ya da başka bir Suflo aracının olabilir (ör. zoom'un ortasındaki Punch): "senin" denmez
  function kenarMetni(n) { return "Klipteki diğer anahtar kareler korundu; kenarlara " + n + " anahtar kare eski değerle eklendi."; }
  function egriMetni(n) { return "Uçları bu anahtar karelerde olan " + n + " Suflo eğrisi de kaldırıldı."; }
  // Geçişi kaldır'ın kesimi: { cut (sn), track (1'den) } → "Kesim: V1, 00:09.04" (onay sorusu ve sonuç bildirimi)
  function kesimYeri(k) {
    if (!k || !sonlu(Number(k.cut))) return "";
    var cs = Math.round(Math.max(0, Number(k.cut)) * 100), s = Math.floor(cs / 100), sa = Math.floor(s / 3600), dk = Math.floor((s % 3600) / 60);
    var sn = s % 60, ys = cs % 100;
    function iki(x) { return (x < 10 ? "0" : "") + x; }
    var z = (sa ? sa + ":" + iki(dk) : iki(dk)) + ":" + iki(sn) + "." + iki(ys);
    var iz = Math.max(1, Math.floor(Number(k.track) || 1));
    return "Kesim: V" + iz + ", " + z;
  }
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
   * Eski araç kayıtlarından yeni kaydın aralığıyla kesişenler (aynı sekans, klip ve özellik; Eğri kayıtları hariç).
   * Yalnız aralığa bakar; bir kaydın yerine geçilip geçilmediğine bununla karar verilmez (yerineGecis, host'un
   * bildirdiği silinen anahtarlarla karar verir: başka aracın küçük penceresi tüm klibe yayılan zoom'u atmasın).
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

  function sonlu(v) { return typeof v === "number" && isFinite(v); }
  function kopya(v) { return Array.isArray(v) ? v.slice() : v; }
  function ayniTur(a, b) {
    if (typeof a === "number" || typeof b === "number") return typeof a === "number" && typeof b === "number";
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length;
  }

  /*
   * Host'un bildirdiği temizlik (KS_kayitTemizle; cevaptaki temizlenen): araç yazmadan önce bir klibin bir özelliğinde
   * hangi pencereleri temizledi, o an duran hangi anahtarlar silindi (timeline saniyesi), özellik boşaldı mı.
   * Bozuk girdi atılır.
   */
  function temizlenenler(ek) {
    var liste = ek && Array.isArray(ek.temizlenen) ? ek.temizlenen : [];
    var out = [];
    liste.slice(0, 2000).forEach(function (e) {
      if (!e || typeof e.matchName !== "string" || !sonlu(Number(e.clipStart))) return;
      var pencereler = (Array.isArray(e.pencereler) ? e.pencereler : []).filter(function (w) {
        return Array.isArray(w) && sonlu(w[0]) && sonlu(w[1]);
      }).slice(0, 16).map(function (w) { return [Math.min(w[0], w[1]), Math.max(w[0], w[1])]; });
      var times = (Array.isArray(e.times) ? e.times : []).filter(sonlu).slice(0, 20000).sort(function (a, b) { return a - b; });
      out.push({ seqId: String(e.seqId || ""), nodeId: String(e.nodeId || ""), clipName: String(e.clipName || ""),
        clipStart: Number(e.clipStart), clipEnd: Number(e.clipEnd), clipIn: Number(e.clipIn), clipOut: Number(e.clipOut), ters: e.ters === true,
        matchName: e.matchName, pencereler: pencereler, times: times, bosaldi: e.bosaldi === true });
    });
    return out;
  }

  // Kayıt ile temizlik girdisi aynı klibin aynı özelliği mi: sekans + özellik kimliği + klip (nodeId; yoksa ad + başlangıç)
  function ayniYer(r, e, tol) {
    if (!r || !e || String(r.seqId || "") !== String(e.seqId || "") || r.matchName !== e.matchName) return false;
    if (r.nodeId && e.nodeId) return String(r.nodeId) === String(e.nodeId);
    return String(r.clipName || "") === String(e.clipName || "") && sonlu(r.clipStart) && Math.abs(r.clipStart - e.clipStart) <= Math.max(tol, 1e-3);
  }

  // sıralı dizide t'ye tol içinde bir eleman var mı (ikili arama)
  function icinde(sirali, t, tol) {
    var lo = 0, hi = sirali.length - 1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      if (Math.abs(sirali[m] - t) <= tol) return true;
      if (sirali[m] < t) lo = m + 1; else hi = m - 1;
    }
    return false;
  }

  /*
   * Eski kaydın (x) bugünkü klibe (e: temizlik girdisinin kaynak çapası) kayması: x'in zamanı → o günkü eşlemeyle
   * kaynak saniyesi → bugünkü klibin timeline saniyesi (host KS_easeCapaKaymasi ile aynı hesap). Hız ya da yön
   * değiştiyse ya da çapa yoksa NaN.
   */
  function capaKaymasi(x, e, tol) {
    if (!sonlu(x.clipStart) || !sonlu(x.clipEnd) || !sonlu(x.clipIn) || !sonlu(x.clipOut)) return NaN;
    if (!sonlu(e.clipStart) || !sonlu(e.clipEnd) || !sonlu(e.clipIn) || !sonlu(e.clipOut) || (x.ters === true) !== (e.ters === true)) return NaN;
    var rDur = x.clipEnd - x.clipStart, rKay = x.clipOut - x.clipIn, dur = e.clipEnd - e.clipStart, kKay = e.clipOut - e.clipIn;
    if (!(rDur > 1e-6) || !(Math.abs(rKay) > 1e-6) || !(dur > 1e-6) || !(Math.abs(kKay) > 1e-6)) return NaN;
    function yeni(t) {
      var oran = (t - x.clipStart) / rDur;
      var src = x.ters === true ? x.clipOut - rKay * oran : x.clipIn + rKay * oran;
      var o2 = e.ters === true ? (e.clipOut - src) / kKay : (src - e.clipIn) / kKay;
      return e.clipStart + o2 * dur;
    }
    var t = x.times, d0 = yeni(t[0]) - t[0], d1 = yeni(t[t.length - 1]) - t[t.length - 1];
    if (!sonlu(d0) || !sonlu(d1) || Math.abs(d1 - d0) > tol / 2) return NaN;
    return (d0 + d1) / 2;
  }

  // Aday kaymalar (host KS_easeKayitEsle sırası): kaynak çapasından, kaymasız, klip başlangıcının kayması
  function kaymalar(x, e, tol) {
    var out = [], dc = capaKaymasi(x, e, tol);
    if (sonlu(dc) && Math.abs(dc) > 1e-6) out.push(dc);
    out.push(0);
    var dm = sonlu(x.clipStart) ? e.clipStart - x.clipStart : NaN;
    if (sonlu(dm) && Math.abs(dm) > tol && (!sonlu(dc) || Math.abs(dm - dc) > 1e-6)) out.push(dm);
    return out;
  }

  /*
   * Eski kaydın bu temizlikten sonraki hâli: { silindi (kayıt temizlikten hemen önce CANLIYDI — iki uç ve zamanların en
   * az %60'ı o an duruyordu — ve o anahtarlar şimdi silindi: yeni yazım onun yerine geçti), d (kayma), kalan (kaydın
   * kendi zamanlarından silinmeyen ve temizlenen pencerelerin dışında kalanlar; pencerenin içindekiler artık yok) }.
   */
  function olcum(x, e, tol) {
    var T = e.times, n = x.times.length, oran = KR ? KR.CANLI_ORAN : 0.6, enIyi = null;
    kaymalar(x, e, tol).forEach(function (d) {
      var m = 0;
      x.times.forEach(function (t) { if (icinde(T, t + d, tol)) m++; });
      var silindi = n > 0 && icinde(T, x.times[0] + d, tol) && icinde(T, x.times[n - 1] + d, tol) && m >= oran * n - 1e-9;
      if (!enIyi || (silindi && !enIyi.silindi) || (!enIyi.silindi && !silindi && m > enIyi.m)) enIyi = { d: d, m: m, silindi: silindi };
    });
    var pay = 1e-3;
    enIyi.kalan = x.times.filter(function (t) {
      var u = t + enIyi.d;
      if (icinde(T, u, tol)) return false;
      return !e.pencereler.some(function (w) { return u >= w[0] - pay && u <= w[1] + pay; });
    });
    return enIyi;
  }

  /*
   * Yeniden uygulama: araç yazmadan önce pencereyi temizledi ve özellikte hiç anahtar kalmadıysa (Premiere özelliği
   * silinen ilk anahtarın değerinde bırakır) yeni kaydın "önceki değeri" eski Suflo anahtarlarının izini taşıyabilir
   * (ör. ilk anahtarı yakınlaşmış zoom: 112; tüm klibi kaplayan pencerenin dışı yok). adaylar: bu yazımın yerine geçtiği,
   * temizlikten hemen önce CANLI olan kayıtlar (yerineGecis doğrular; Premiere'de geri alınmış eski kayıt aday olmaz).
   * En eskisinin kenar değerleri (Suflo'dan önceki hâl; o da devralmış olabilir) yeni kaydın iki ucuna geçer; değer
   * türü uyuşmayan uç (sayı ↔ [x,y]) kendi değerinde kalır. r yerinde değişir. Doner: devralındı mı.
   */
  function kenarMiras(r, adaylar) {
    var k = r && r.kenarDegerleri;
    if (!Array.isArray(k) || !k.length) return false;
    var aday = (adaylar || []).filter(function (x) {
      return x && Array.isArray(x.kenarDegerleri) && x.kenarDegerleri.length;
    }).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    if (!aday.length) return false;
    var ok = aday[0].kenarDegerleri, s = k.length - 1, os = ok.length - 1, oldu = false;
    if (ayniTur(k[0].v, ok[0].v)) { k[0] = { t: k[0].t, v: kopya(ok[0].v) }; oldu = true; }
    if (s > 0 && ayniTur(k[s].v, ok[os].v)) { k[s] = { t: k[s].t, v: kopya(ok[os].v) }; oldu = true; }
    return oldu;
  }

  /*
   * Yeni yazımın eski araç kayıtlarına etkisi (host'un bildirdiği temizliğe göre; araçtan bağımsız):
   *  - temizlikten hemen önce canlı olup anahtarları silinen kayıt, bu yazımın yerine geçtiği kayıttır: atılır; özellik
   *    boşaldıysa önceki değeri yeni kayda geçer (kenarMiras);
   *  - kısmen temizlenen kayıt (ör. tüm klibe yayılan zoom'un kesimdeki ilk anahtarı) kırpılır: pencerenin içindeki
   *    zamanları düşer, gerisi kalır (sonra kaldırılırken yeni yazımın anahtarını kendininmiş gibi silmez);
   *  - zamanlarının hepsi pencerenin içinde ama hiçbiri durmayan kayıt (Premiere'de geri alınmış) atılır, devralınmaz;
   *  - temizlenen pencereye değmeyen kayda (ör. ortadaki Punch'ın penceresi zoom anahtarlarına değmez) dokunulmaz.
   * eski / yeni: kayıtlar (yeni yerinde değişir), temiz: temizlenenler(...), tol: eşleşme toleransı (sn).
   * Doner: { at: { id: 1 }, kirpilan: [kayıt kopyası (aynı id, kalan zamanlarla)], miras: devralan yeni kayıt sayısı }
   */
  function yerineGecis(eski, yeni, temiz, tol) {
    var at = {}, kirpilan = [], gecilen = [], miras = 0;
    tol = sonlu(tol) && tol > 0 ? tol : (KR ? KR.tolerans(30) : 1 / 120);
    (temiz || []).forEach(function (e, ei) {
      gecilen[ei] = [];
      (Array.isArray(eski) ? eski : []).forEach(function (x) {
        if (!x || at[x.id] || !aracMi(x.tur) || !Array.isArray(x.times) || !x.times.length || !ayniYer(x, e, tol)) return;
        var o = olcum(x, e, tol);
        if (o.silindi) { at[x.id] = 1; gecilen[ei].push(x); return; }
        if (o.kalan.length === x.times.length) return;
        if (!o.kalan.length) { at[x.id] = 1; return; }
        var k = {};
        Object.keys(x).forEach(function (a) { k[a] = x[a]; });
        k.times = o.kalan;
        kirpilan.push(k);
      });
    });
    (yeni || []).forEach(function (r) {
      (temiz || []).forEach(function (e, ei) {
        if (e.bosaldi && gecilen[ei].length && ayniYer(r, e, tol) && kenarMiras(r, gecilen[ei])) miras++;
      });
    });
    var gorulen = {};
    kirpilan = kirpilan.filter(function (k) { if (at[k.id] || gorulen[k.id]) return false; gorulen[k.id] = 1; return true; });
    return { at: at, kirpilan: kirpilan, miras: miras };
  }

  /*
   * Eğri kayıtlarından (tur 'egri') host'a gidecek adaylar: araç kayıtlarından biriyle aynı sekansta, aynı özellikte
   * (matchName) ve aynı klipte (iki nodeId de varsa onlar, yoksa klip adı) olanlar; en yeniler önce, en çok EN_COK. Host
   * yalnız ucu silinen anahtarlarda duran canlı Eğri'ye dokunur (KS_kayitEgriUclari); burada yalnız gereksiz yük ayıklanır.
   */
  function egriAdaylari(egriler, liste) {
    var araclar = (Array.isArray(liste) ? liste : []).filter(function (r) { return r && aracMi(r.tur); });
    if (!araclar.length) return [];
    return (Array.isArray(egriler) ? egriler : []).filter(function (e) {
      if (!e || e.tur !== "egri" || !Array.isArray(e.uclar) || e.uclar.length !== 2 || !Array.isArray(e.times) || !e.times.length) return false;
      return araclar.some(function (r) {
        if (r.matchName !== e.matchName || String(r.seqId || "") !== String(e.seqId || "")) return false;
        if (r.nodeId && e.nodeId) return String(r.nodeId) === String(e.nodeId);
        return String(r.clipName || "") === String(e.clipName || "");
      });
    }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, EN_COK);
  }

  /*
   * KS_removeSufloKeys cevabının özeti: { eslesen, silinen, eklenen, biten (host'un bitirdiği kayıt id'leri:
   * silindi ya da Suflo'nun anahtarları zaten yoktu), yok (zaten kaldırılmış sayısı), kalan: { kod: sayı },
   * kalanSayi, degistiSayi, kayitsiz (seçili kapsamda kaydı eşleşmeyen seçili video klibi sayısı),
   * egriBiten (uçları silindiği için host'un kaldırdığı Eğri kayıtlarının id'leri), egri (sayısı) }
   */
  function ozet(r) {
    var o = { eslesen: 0, silinen: 0, eklenen: 0, biten: [], yok: 0, kalan: {}, kalanSayi: 0, degistiSayi: 0, kayitsiz: 0, egriBiten: [], egri: 0 };
    if (!r || typeof r !== "object") return o;
    o.eslesen = Math.max(0, Number(r.eslesen) || 0);
    o.kayitsiz = Array.isArray(r.kayitsiz) ? r.kayitsiz.length : 0;
    var gorulen = {};
    o.egriBiten = (Array.isArray(r.egriBiten) ? r.egriBiten : []).filter(function (id) {
      if (typeof id !== "string" || !id || gorulen[id]) return false;
      gorulen[id] = 1;
      return true;
    });
    o.egri = o.egriBiten.length;
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
    if (o.egri) p.push(doldur(egriMetni, o.egri));
    if (o.eklenen) p.push(doldur(kenarMetni, o.eklenen));
    Object.keys(KALAN).forEach(function (kod) { if (o.kalan[kod]) p.push(doldur(KALAN[kod], o.kalan[kod])); });
    if (o.kayitsiz) p.push(doldur(kayitsizMetni, o.kayitsiz));
    var iyi = o.silinen > 0 && !o.kalanSayi && !o.kayitsiz;
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

    // Projenin bu sekanstaki Eğri kayıtları (depo; Eğri'nin oturum belleğindekiler onun panelinde kalır)
    function egriKayitlari(proje, seqId) {
      var d = depo(), liste = [];
      try { liste = d ? d.oku(proje) : []; } catch (e) { liste = []; }
      return liste.filter(function (r) { return r && r.tur === "egri" && (!seqId || r.seqId === String(seqId)); });
    }

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
     * Host'un döndürdüğü kayıtları saklar. ek: host cevabı ({ temizlenen, tol }): yazmadan önce temizlenen anahtarlara
     * göre eski araç kayıtları atılır ya da kırpılır; özellik boşaldıysa yerine geçilen canlı kaydın önceki değeri
     * devralınır (yerineGecis). Doner: { ok (depoya yazıldı), idler (bu uygulamanın kayıtları: bildirimdeki Geri al) }
     */
    function sakla(proje, records, ek) {
      if (!KR) return { ok: false, idler: [] };
      var yeni = (Array.isArray(records) ? records : []).map(function (r) {
        var k = KR.kayit(r, simdi());
        if (k) k.id = KR.yeniId(simdi());
        return k;
      }).filter(function (r) { return r && aracMi(r.tur); });
      var temiz = temizlenenler(ek);
      if (!yeni.length && !temiz.length) return { ok: true, idler: [] };
      var d = depo(), depodaki = {};
      try { (d ? d.oku(proje) : []).forEach(function (r) { depodaki[r.id] = 1; }); } catch (e0) { depodaki = {}; }
      var y = yerineGecis(kayitlar(proje), yeni, temiz, Number(ek && ek.tol));
      var kirp = {};
      y.kirpilan.forEach(function (k) { kirp[k.id] = k; });
      bellek = bellek.filter(function (b) { return !y.at[b.r.id]; }).map(function (b) {
        return kirp[b.r.id] && !depodaki[b.r.id] ? { proje: b.proje, r: kirp[b.r.id] } : b;
      });
      var atilacak = Object.keys(y.at);
      var depoya = yeni.concat(y.kirpilan.filter(function (k) { return depodaki[k.id]; }));
      var ok = false;
      try {
        if (d && atilacak.length) d.kaldir(proje, atilacak);
        ok = !!(d && (depoya.length ? d.ekle(proje, depoya).ok : true));
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
      var egriler = egriAdaylari(egriKayitlari(proje, pk.seqId), liste);
      if (egriler.length) arg.egriler = egriler;
      if (opts.secili) arg.secili = true;
      if (opts.kesim) arg.kesim = { tolerance: Number(opts.kesim.tolerance) || 1 };
      var r = await call("KS_removeSufloKeys", arg, 120000);
      if (!r || !r.ok) throw hata(r && r.kod, r && r.error);
      var oz = ozet(r);
      sil(proje, oz.biten.concat(oz.egriBiten));
      oz.kayitYok = oz.eslesen === 0;
      if (!opts.secili) oz.kayitsiz = 0;
      oz.proje = proje;
      oz.seqId = pk.seqId;
      if (r.kesim) oz.kesim = r.kesim;
      if (typeof r.secim === "number") oz.secim = r.secim;
      return oz;
    }

    /*
     * Araçların ortak kaldırma akışı (DOM'a dokunmaz; gösterilecek metni döndürür).
     * o: { tur, kapsam (kaldir seçenekleri), onay: (soru) → bool,
     *      yedek?: async (oz) → { parcalar, tur } (eski yöntem; oz.kesim: host'un seçtiği kesim, tam o temizlenir),
     *      yedekMetni?: { yok, degisti } (onay sorusu; metin ya da (oz) → metin),
     *      kayitYokMetni?: kayıt yoksa ve eski yöntem yoksa gösterilecek metin }
     * Eski yöntem YALNIZ onayla çalışır. Doner: { parcalar, tur: 'good' | 'warn', yedek, iptal, kesim (host'un seçtiği | null) }
     */
    async function akis(o) {
      o = o || {};
      var kapsam = {};
      Object.keys(o.kapsam || {}).forEach(function (k) { kapsam[k] = o.kapsam[k]; });
      kapsam.tur = o.tur;
      var oz = await kaldir(kapsam);
      var kesim = oz.kesim || null;
      if (kapsam.secili && oz.secim === 0) return { parcalar: ["Önce timeline'da bir klip seç."], tur: "warn", yedek: false, iptal: false, kesim: kesim };
      var y = yedekGerekli(oz);
      if (y && typeof o.yedek === "function" && o.yedekMetni && o.yedekMetni[y]) {
        var soru = typeof o.yedekMetni[y] === "function" ? o.yedekMetni[y](oz) : o.yedekMetni[y];
        if (!(typeof o.onay === "function" && o.onay(soru))) return { parcalar: ["Hiçbir şey silinmedi."], tur: "warn", yedek: false, iptal: true, kesim: kesim };
        var s = await o.yedek(oz);
        return { parcalar: s && s.parcalar ? s.parcalar : [], tur: s && s.tur ? s.tur : "good", yedek: true, iptal: false, kesim: kesim };
      }
      if (y === "yok" && o.kayitYokMetni) return { parcalar: [o.kayitYokMetni], tur: "warn", yedek: false, iptal: false, kesim: kesim };
      var m = mesajParcalari(o.tur, oz);
      return { parcalar: m.parcalar, tur: m.tur, yedek: false, iptal: false, kesim: kesim };
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
    TURLER: TURLER.slice(), BASARI: BASARI, KALAN: KALAN, HATALAR: HATALAR, kenarMetni: kenarMetni, kayitsizMetni: kayitsizMetni,
    egriMetni: egriMetni, kesimYeri: kesimYeri, egriAdaylari: egriAdaylari,
    cakisanlar: cakisanlar, kenarMiras: kenarMiras, yerineGecis: yerineGecis, temizlenenler: temizlenenler, ozet: ozet, yedekGerekli: yedekGerekli, mesajParcalari: mesajParcalari,
    hataMetni: hataMetni, olustur: olustur, panel: panel, dugum: dugum
  };
});
