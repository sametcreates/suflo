/*
 * Suflo Studio: hesap cekirdegi (arayuzden bagimsiz, saf fonksiyonlar).
 * Tarayicida window.StudioCore, Node'da require() ile kullanilir (testler).
 *
 * Tarihler Europe/Istanbul yerel tarihidir ve 'YYYY-AA-GG' metni olarak tutulur, saatler 'SS:DD'.
 * Turkiye 2016'dan beri yaz saati uygulamadigi icin gun aritmetigi UTC gun numarasi uzerinden yapilir.
 * "Bugun" her fonksiyona disaridan verilir; boylece testler sabit tarihle calisir.
 */
(function (kok, fabrika) {
  if (typeof module === "object" && module.exports) module.exports = fabrika();
  else kok.StudioCore = fabrika();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------- Sabitler ---------------- */

  var DURUMLAR = [
    { k: "fikir", ad: "Fikir" },
    { k: "cekim_planlandi", ad: "Çekim planlandı" },
    { k: "cekildi", ad: "Çekildi" },
    { k: "kurguda", ad: "Kurguda" },
    { k: "onayda", ad: "Müşteri onayında" },
    { k: "revizyonda", ad: "Revizyonda" },
    { k: "hazir", ad: "Yayına hazır" },
    { k: "yayinlandi", ad: "Yayınlandı" }
  ];
  var TURLER = [
    { k: "reels", ad: "Reels" }, { k: "video", ad: "Video" }, { k: "post", ad: "Post" },
    { k: "story", ad: "Story" }, { k: "diger", ad: "Diğer" }
  ];
  var ONCELIKLER = [{ k: "yuksek", ad: "Yüksek" }, { k: "normal", ad: "Normal" }, { k: "dusuk", ad: "Düşük" }];
  var ETKINLIK_TURLERI = [{ k: "cekim", ad: "Çekim" }, { k: "toplanti", ad: "Toplantı" }, { k: "diger", ad: "Diğer" }];
  var ETKINLIK_DURUMLARI = [{ k: "planlandi", ad: "Planlandı" }, { k: "tamamlandi", ad: "Tamamlandı" }, { k: "iptal", ad: "İptal" }];
  var SIKLIKLAR = [
    { k: "belirsiz", ad: "Belirlenmedi" }, { k: "gunluk", ad: "Her gün 1" },
    { k: "uc_gun", ad: "3 günde 1" }, { k: "haftalik", ad: "Haftalık (seçili günler)" }
  ];
  var SLOT_TURLERI = [{ k: "video", ad: "Video (Reels / video)" }, { k: "post", ad: "Post" }, { k: "story", ad: "Story" }, { k: "diger", ad: "Diğer" }];
  var GUN_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  var GUN_UZUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  var AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  // Kurgu teslimi henuz yapilmamis durumlar (teslim tarihi bunlarda izlenir)
  var TESLIM_BEKLEYEN = ["fikir", "cekim_planlandi", "cekildi", "kurguda", "revizyonda"];
  // Hazirlikta sayilan durumlar (cekilmis ama henuz yayina hazir degil)
  var HAZIRLIKTA = ["cekildi", "kurguda", "onayda", "revizyonda"];

  function harita(liste) { var m = {}; liste.forEach(function (x) { m[x.k] = x.ad; }); return m; }
  var DURUM_AD = harita(DURUMLAR), TUR_AD = harita(TURLER), ONCELIK_AD = harita(ONCELIKLER);
  var ETKINLIK_TUR_AD = harita(ETKINLIK_TURLERI), ETKINLIK_DURUM_AD = harita(ETKINLIK_DURUMLARI);

  /** Icerik turunun stok grubu: reels ve video = "video"; post, story, diger kendi gruplari. */
  function turGrubu(tur) { return tur === "reels" || tur === "video" ? "video" : (tur || "diger"); }

  /* ---------------- Tarih ---------------- */

  function iki(n) { return (n < 10 ? "0" : "") + n; }
  function gunNo(s) { var p = String(s).split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
  function noGun(n) { var d = new Date(n * 864e5); return d.getUTCFullYear() + "-" + iki(d.getUTCMonth() + 1) + "-" + iki(d.getUTCDate()); }
  function gunEkle(s, n) { return noGun(gunNo(s) + n); }
  function gunFarki(a, b) { return gunNo(b) - gunNo(a); }
  /** ISO hafta gunu: 1 = Pazartesi ... 7 = Pazar */
  function haftaGunu(s) { var w = new Date(gunNo(s) * 864e5).getUTCDay(); return w === 0 ? 7 : w; }
  function haftaBasi(s) { return gunEkle(s, 1 - haftaGunu(s)); }
  function ayBasi(s) { return String(s).slice(0, 8) + "01"; }
  function ayEkle(s, n) {
    var y = +s.slice(0, 4), a = +s.slice(5, 7) - 1 + n;
    y += Math.floor(a / 12); a = ((a % 12) + 12) % 12;
    return y + "-" + iki(a + 1) + "-01";
  }
  function gecerliTarih(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return noGun(gunNo(s)) === s;
  }
  /**
   * Kayda yazilabilir tarih: gecerli ve 2000-2099 arasi. Masaustunde yil iki haneli yazilinca tarih girdisi "0026-10-21"
   * verir; boyle tarih sunucuda gecerli sayilir ama takvimde ve listelerde bos gorunurdu.
   */
  function makulTarih(s) { return gecerliTarih(s) && s >= "2000-01-01" && s <= "2099-12-31"; }
  function gecerliSaat(s) { return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

  // Istanbul bicimleyicisi bir kez kurulur: her satirda yeniden kurmak listeyi ve panoyu belirgin yavaslatir.
  // Kurulamazsa (Intl yok ya da saat dilimi taninmiyor) null kalir ve sabit UTC+3 kullanilir.
  var istBicim;
  function istanbulBicimi() {
    if (istBicim === undefined) {
      try {
        istBicim = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hourCycle: "h23"
        });
      } catch (e) { istBicim = null; }
    }
    return istBicim;
  }
  /** Europe/Istanbul'da su anki tarih ve saat. Intl yoksa sabit UTC+3. */
  function istanbulSimdi(an) {
    an = an || new Date();
    var f = istanbulBicimi();
    if (f) {
      try {
        var p = {};
        f.formatToParts(an).forEach(function (x) { p[x.type] = x.value; });
        var saat = p.hour === "24" ? "00" : p.hour;
        if (p.year && p.month && p.day) return { tarih: p.year + "-" + p.month + "-" + p.day, saat: saat + ":" + p.minute };
      } catch (e) { /* asagidaki yedek */ }
    }
    var d = new Date(an.getTime() + 3 * 3600e3);
    return { tarih: d.toISOString().slice(0, 10), saat: d.toISOString().slice(11, 16) };
  }
  function damga(an) { var s = istanbulSimdi(an); return s.tarih + " " + s.saat; }

  function tarihUzun(s) {
    if (!gecerliTarih(s)) return "";
    return +s.slice(8, 10) + " " + AYLAR[+s.slice(5, 7) - 1] + " " + s.slice(0, 4) + ", " + GUN_UZUN[haftaGunu(s) - 1];
  }
  function tarihKisa(s, yilla) {
    if (!gecerliTarih(s)) return "";
    return +s.slice(8, 10) + " " + AYLAR[+s.slice(5, 7) - 1] + (yilla ? " " + s.slice(0, 4) : "");
  }
  function tarihGunlu(s) { return gecerliTarih(s) ? tarihKisa(s) + " " + GUN_KISA[haftaGunu(s) - 1] : ""; }
  function ayAdi(s) { return AYLAR[+s.slice(5, 7) - 1] + " " + s.slice(0, 4); }
  /** 'bugun', 'yarin', '3 gun sonra', '2 gun gecti' */
  function goreli(s, bugun) {
    if (!gecerliTarih(s)) return "";
    var f = gunFarki(bugun, s);
    if (f === 0) return "bugün";
    if (f === 1) return "yarın";
    if (f === -1) return "dün";
    return f > 0 ? f + " gün sonra" : (-f) + " gün geçti";
  }

  /** Ay gorunumu icin Pazartesi baslayan hafta satirlari. */
  function ayIzgarasi(s) {
    var bas = haftaBasi(ayBasi(s)), sonGun = gunEkle(ayEkle(s, 1), -1), son = gunEkle(haftaBasi(sonGun), 6);
    var haftalar = [], h = [];
    for (var d = bas; gunNo(d) <= gunNo(son); d = gunEkle(d, 1)) {
      h.push(d);
      if (h.length === 7) { haftalar.push(h); h = []; }
    }
    return haftalar;
  }

  /* ---------------- Metin ---------------- */

  /** Turkce kucuk harf + harf katlama (arama icin: "Çağrı Işık" ~ "cagri isik"). */
  function temizMetin(s) {
    s = String(s == null ? "" : s);
    if (s.normalize) s = s.normalize("NFC");
    return s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  }
  function katla(s) {
    return temizMetin(s).replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase()
      .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
      .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u").replace(/\s+/g, " ").trim();
  }
  /** Sunucudaki norm() ile ayni: Turkce kucuk harf, bosluklar tek (musteri ad + kurum tekilligi icin). */
  function norm(s) {
    return temizMetin(s).trim().replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase().replace(/\s+/g, " ");
  }
  /** Ucret metnini TL tam sayiya cevirir: "10.000", "10000", "10 000 TL", "10.000,00". Bos -> null, belirsiz/kusuratli -> NaN. */
  function ucretCoz(s) {
    s = String(s == null ? "" : s).replace(/\s|TL|₺/gi, "");
    if (s === "") return null;
    var m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(s);
    if (!m || (m[2] && +m[2] !== 0)) return NaN;
    return +m[1].replace(/\./g, "");
  }
  function para(n) {
    if (n === null || n === undefined || n === "") return "Belirlenmedi";
    return String(Math.round(+n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " TL";
  }
  function musteriAdi(m) { return m ? m.ad + (m.kurum ? " · " + m.kurum : "") : "Müşteri yok"; }
  /**
   * Yayin sikligi metni. bugun verilirse 3 gunde 1'de kayitli baslangic yerine gercek siradaki paylasim gunu yazilir
   * (bugun de paylasim gunuyse bugun). bugun verilmezse (CSV) kayitli baslangic tarihi yazilir.
   */
  function siklikMetni(m, bugun) {
    var s = (m && m.siklik) || {};
    if (s.tur === "gunluk") return "Her gün 1";
    if (s.tur === "uc_gun" && gecerliTarih(s.baslangic) && gecerliTarih(bugun)) {
      var siradaki = s.baslangic >= bugun ? s.baslangic : gunEkle(bugun, (3 - gunFarki(s.baslangic, bugun) % 3) % 3);
      return "3 günde 1 (sıradaki: " + tarihKisa(siradaki, siradaki.slice(0, 4) !== bugun.slice(0, 4)) + " " + GUN_KISA[haftaGunu(siradaki) - 1] + ")";
    }
    if (s.tur === "uc_gun") return "3 günde 1" + (s.baslangic ? " (sıradaki/başlangıç: " + tarihKisa(s.baslangic, true) + ")" : " (başlangıç tarihi yok)");
    if (s.tur === "haftalik") {
      var adet = s.haftalikAdet ? "Haftada " + s.haftalikAdet : "Haftalık";
      var tAd = { video: "video", post: "post", story: "story", diger: "diğer" };
      return adet + (s.gunler && s.gunler.length ? ": " + s.gunler.map(function (g) {
        var t = s.gunTurleri && s.gunTurleri[g];
        return GUN_KISA[g - 1] + (t && t !== (m.slotTuru || "video") ? " (" + tAd[t] + ")" : "");
      }).join(", ") : " (günler seçilmedi)");
    }
    return "Belirlenmedi";
  }
  /** Baska cihazda acilmayacak yerel dosya yolu mu? */
  function yerelYol(s) {
    s = String(s || "").trim();
    return /^(file:|[a-zA-Z]:[\\/]|\\\\|~[\\/]|\/(Users|home|Volumes|mnt|media|private|var|tmp)\/)/.test(s);
  }
  /** Tiklanabilir guvenli baglanti mi (yalniz http / https). */
  function guvenliLink(s) { return /^https?:\/\/[^\s]+$/i.test(String(s || "").trim()); }

  /* ---------------- Kayit yardimcilari ---------------- */

  function aktif(x) { return !!x && !x.arsiv; }
  function kopya(x) { return JSON.parse(JSON.stringify(x)); }
  function idHaritasi(liste) { var m = {}; (liste || []).forEach(function (x) { m[x.id] = x; }); return m; }

  /**
   * Durum degisimi: yeni kayit doner (ayni durumsa null). Yayinlandi -> yayin tarihi (bossa) bugun; yayinlanmisliktan cikinca temizlenir.
   * yayinTarihi verilirse (or. "planlanan gunde yayinlandi" dugmesi) ve gecerli, bugunden ileri olmayan bir tarihse bugun yerine o yazilir.
   */
  function durumDegistir(ic, yeni, zaman, bugun, yayinTarihi) {
    if (!DURUM_AD[yeni]) throw new Error("gecersiz durum: " + yeni);
    if (ic.durum === yeni) return null;
    var n = kopya(ic);
    n.durum = yeni;
    if (yeni === "yayinlandi" && !n.yayinTarihi) n.yayinTarihi = gecerliTarih(yayinTarihi) && yayinTarihi <= bugun ? yayinTarihi : bugun;
    if (ic.durum === "yayinlandi" && yeni !== "yayinlandi") n.yayinTarihi = null;
    n.gecmis = (n.gecmis || []).concat([{ z: zaman, m: (DURUM_AD[ic.durum] || ic.durum) + " → " + DURUM_AD[yeni] }]).slice(-60);
    return n;
  }
  /** Geri alma: onceki alanlari geri koyar, gecmisi korur ve not dusurur. */
  function geriAl(simdiki, onceki, zaman) {
    var n = kopya(onceki);
    n.id = simdiki.id;
    n.surum = simdiki.surum;
    n.gecmis = (simdiki.gecmis || []).concat([{ z: zaman, m: "Geri alındı: " + (DURUM_AD[simdiki.durum] || simdiki.durum) + " → " + (DURUM_AD[onceki.durum] || onceki.durum) }]).slice(-60);
    return n;
  }
  // Is akisinda dogal sonraki adimlar ve dugme etiketleri. Onayda iki yol var: onaylandi (yayina hazir) ya da revizyon.
  var SONRAKI = {
    fikir: [["cekim_planlandi", "Çekim planlandı"]], cekim_planlandi: [["cekildi", "Çekildi"]], cekildi: [["kurguda", "Kurguya al"]],
    kurguda: [["onayda", "Onaya gönder"]], onayda: [["hazir", "Onaylandı"], ["revizyonda", "Revizyon"]], revizyonda: [["onayda", "Onaya gönder"]],
    hazir: [["yayinlandi", "Yayınlandı"]], yayinlandi: []
  };
  /** Tek tikla gecilebilecek sonraki durumlar: [{ k: durum, ad: dugme etiketi }]. Yayinlandi ve bilinmeyen durumda bos. */
  function sonrakiDurumlar(durum) {
    return (Object.prototype.hasOwnProperty.call(SONRAKI, durum) ? SONRAKI[durum] : []).map(function (x) { return { k: x[0], ad: x[1] }; });
  }
  /**
   * Icerigin musteri onayina gittigi gun (YYYY-AA-GG): gecmisteki son "… → Müşteri onayında" ya da "Eklendi (Müşteri onayında)"
   * satirinin tarihi. "Geri alındı: …" satirlari sayilmaz (geri alma onceki gonderimi geri getirir). Boyle satir yoksa
   * (eski ya da ice aktarilmis kayit) null: tarih uydurulmaz.
   */
  function onayaGidis(i) {
    var g = (i && i.gecmis) || [];
    for (var k = g.length - 1; k >= 0; k--) {
      var m = String((g[k] && g[k].m) || ""), z = String((g[k] && g[k].z) || "").slice(0, 10);
      if (/^Geri alındı/.test(m) || !/(→ Müşteri onayında|\(Müşteri onayında\))$/.test(m)) continue;
      return gecerliTarih(z) ? z : null;
    }
    return null;
  }

  /* ---------------- Stok ---------------- */

  function musteriIcerikleri(veri, mid) {
    return (veri.icerikler || []).filter(function (i) { return aktif(i) && i.musteriId === mid; });
  }

  /**
   * Hazir stok = yalniz durum "hazir" (musteri onayi alinmis, yayina hazir, yayinlanmamis) ve video turundeki icerikler.
   * Ileri tarihe atanmis + tarihi gecmis + atanmamis = toplam (cift sayim yok; her icerik yalniz birinde).
   * Tarihi gecmis ama yayinlanmamis hazir icerik o gune sayilmaz, ileriki gunler icin bosta stok gibi oneri havuzuna girer.
   * Postlar ve storyler ayri tutulur, videoya sayilmaz.
   * bilinen = stok girisi yapildi mi; yapilmadiysa arayuz sayi yerine "stok girisi yapilmadi" gosterir.
   */
  function stok(veri, musteri, bugun) {
    var ic = musteriIcerikleri(veri, musteri.id);
    var hazir = ic.filter(function (i) { return i.durum === "hazir"; });
    var video = hazir.filter(function (i) { return turGrubu(i.tur) === "video"; });
    var atanmis = video.filter(function (i) { return !!i.planTarihi && i.planTarihi >= bugun; });
    var gecmis = video.filter(function (i) { return !!i.planTarihi && i.planTarihi < bugun; });
    var atanmamis = video.filter(function (i) { return !i.planTarihi; });
    var diger = { post: 0, story: 0, diger: 0 };
    hazir.forEach(function (i) { var g = turGrubu(i.tur); if (g !== "video") diger[g] = (diger[g] || 0) + 1; });
    return {
      bilinen: !!musteri.stokGirisi,
      toplam: video.length,
      atanmis: atanmis.length,
      atanmamis: atanmamis.length,
      gecmisTarihli: gecmis.length,
      hazirlikta: ic.filter(function (i) { return HAZIRLIKTA.indexOf(i.durum) !== -1 && turGrubu(i.tur) === "video"; }).length,
      digerHazir: diger,
      idler: { atanmis: atanmis.map(function (i) { return i.id; }), gecmisTarihli: gecmis.map(function (i) { return i.id; }), atanmamis: atanmamis.map(function (i) { return i.id; }) }
    };
  }

  /** Yayin duzeni tanimli mi; degilse ne eksik. Gun / baslangic tarihi asla uydurulmaz. */
  function duzenDurumu(m) {
    var s = (m && m.siklik) || {};
    if (s.tur === "gunluk") return { tamam: true };
    if (s.tur === "uc_gun") return gecerliTarih(s.baslangic) ? { tamam: true } : { tamam: false, eksik: "3 günde 1 için başlangıç ya da sıradaki yayın tarihi girilmeli" };
    if (s.tur === "haftalik") {
      var n = s.gunler ? s.gunler.length : 0;
      if (!n) return { tamam: false, eksik: "Haftalık yayın günleri seçilmeli" };
      if (s.haftalikAdet && n < s.haftalikAdet) return { tamam: false, eksik: "Haftada " + s.haftalikAdet + " paylaşım için " + s.haftalikAdet + " gün seçilmeli (" + n + " seçili)" };
      return { tamam: true };
    }
    return { tamam: false, eksik: "Yayın sıklığı belirlenmedi" };
  }

  /** [bas, bas+gunSayisi) araligindaki paylasim gunleri. Duzen eksikse null. */
  function slotlar(m, bas, gunSayisi) {
    if (!duzenDurumu(m).tamam) return null;
    var s = m.siklik, out = [];
    for (var k = 0; k < gunSayisi; k++) {
      var d = gunEkle(bas, k);
      if (s.tur === "gunluk") out.push(d);
      else if (s.tur === "uc_gun") { var f = gunFarki(s.baslangic, d); if (f >= 0 && f % 3 === 0) out.push(d); }
      else if (s.tur === "haftalik" && s.gunler.indexOf(haftaGunu(d)) !== -1) out.push(d);
    }
    return out;
  }

  var ONCELIK_SIRA = { yuksek: 0, normal: 1, dusuk: 2 };
  function oncelikSira(i) { var v = ONCELIK_SIRA[i && i.oncelik]; return v === undefined ? 1 : v; }

  /** Paylasim gununun beklenen icerik grubu: o gun icin ozel tur (slotIstisna) > haftalik gune ozel tur > musterinin turu. */
  function slotGrubu(m, d) {
    var ist = m && m.slotIstisna && !Array.isArray(m.slotIstisna) ? m.slotIstisna[d] : null;
    if (ist) return ist;
    var s = (m && m.siklik) || {}, gt = s.tur === "haftalik" && s.gunTurleri ? s.gunTurleri[haftaGunu(d)] : null;
    return gt || (m && m.slotTuru) || "video";
  }

  /**
   * Onumuzdeki gunSayisi gun icin paylasim ihtiyaci ve karsilanmasi.
   * Her slot: "planli" (o tarihe atanmis, ayni turde hazir icerik), "yayinlandi" (o gun ayni turde yayinlanmis),
   * "oneri" (atanmamis hazir stoktan karsilanabilir; KAYDEDILMEZ, yalniz oneri), "acik" (hazir icerik yok),
   * "bilinmiyor" (stok girisi yapilmadigi icin karsilanip karsilanmadigi bilinmiyor).
   * Ayni icerik iki slotu karsilamaz; slot turu (video / post / story / diger) eslesmeyen icerik o slotu karsilamaz.
   * Aralikta tarihe atanmis ama hicbir slotu karsilamayan hazir icerik aciklama icin sayilir (tahmini degistirmez):
   * ayniGunFazla (ayni paylasim gunune ayni turde ikinci icerik), turUyumsuz (baska turde beklenen bir paylasim gunune
   * planli; turUyumsuzGunler: { tarih, grup, beklenen, icerikId }), slotDisiPlanli (paylasim gunu olmayan bir gune planli).
   */
  function kapsama(veri, m, bugun, gunSayisi) {
    var duzen = duzenDurumu(m);
    var r = {
      gunSayisi: gunSayisi, grup: m.slotTuru || "video", karisik: false, duzenTamam: duzen.tamam, eksik: duzen.eksik || null,
      stokBilinen: !!m.stokGirisi, slotlar: [], ihtiyac: null, planli: 0, yayinlandi: 0, oneri: 0, acik: null,
      ilkAcik: null, ilkPlansiz: null, slotDisiPlanli: 0, ayniGunFazla: 0, turUyumsuz: 0, turUyumsuzGunler: []
    };
    if (!duzen.tamam) return r;
    var son = gunEkle(bugun, gunSayisi - 1);
    var planli = {}, yayin = {}, hazirlikta = {}, havuz = {};
    var koy = function (h, k, i) { (h[k] = h[k] || []).push(i); };
    musteriIcerikleri(veri, m.id).forEach(function (i) {
      var g = turGrubu(i.tur);
      // tarihi gecmis ama yayinlanmamis hazir icerik ileriki gunler icin atanmamis sayilir (stokta "tarihi gecmis" gorunur)
      if (i.durum === "hazir" && i.planTarihi && i.planTarihi >= bugun) koy(planli, i.planTarihi + "|" + g, i);
      else if (i.durum === "hazir") koy(havuz, g, i);
      else if (i.durum === "yayinlandi" && i.yayinTarihi) koy(yayin, i.yayinTarihi + "|" + g, i);
      else if (i.durum !== "yayinlandi" && i.planTarihi) koy(hazirlikta, i.planTarihi + "|" + g, i);
    });
    Object.keys(havuz).forEach(function (g) {
      havuz[g].sort(function (a, b) {
        return oncelikSira(a) - oncelikSira(b) || (a.olusturma || 0) - (b.olusturma || 0);
      });
    });
    var kullanilan = {}, slotAnahtari = {}, gruplar = {}, slotGunu = {};
    slotlar(m, bugun, gunSayisi).forEach(function (d) {
      var g = slotGrubu(m, d), k = d + "|" + g;
      slotAnahtari[k] = 1;
      gruplar[g] = 1;
      slotGunu[d] = g;
      var p = (planli[k] || []).filter(function (x) { return !kullanilan[x.id]; })[0];
      if (p) { kullanilan[p.id] = 1; r.slotlar.push({ tarih: d, grup: g, durum: "planli", icerikId: p.id }); r.planli++; return; }
      var y = (yayin[k] || []).filter(function (x) { return !kullanilan[x.id]; })[0];
      if (y) { kullanilan[y.id] = 1; r.slotlar.push({ tarih: d, grup: g, durum: "yayinlandi", icerikId: y.id }); r.yayinlandi++; return; }
      var h = (hazirlikta[k] || [])[0];
      r.slotlar.push({ tarih: d, grup: g, durum: null, icerikId: null, hazirlikta: h ? h.id : null });
    });
    r.karisik = Object.keys(gruplar).length > 1;
    var hi = {};
    r.slotlar.forEach(function (s) {
      if (s.durum !== null) return;
      if (!r.ilkPlansiz) r.ilkPlansiz = s.tarih;
      var hv = havuz[s.grup] || [], n = hi[s.grup] || 0;
      if (n < hv.length) { s.durum = "oneri"; s.icerikId = hv[n].id; hi[s.grup] = n + 1; r.oneri++; return; }
      // Stok girisi yapilmadan karsilanmayan gun "acik" sayilmaz, "bilinmiyor" kalir.
      if (!r.stokBilinen) { s.durum = "bilinmiyor"; return; }
      s.durum = "acik";
      if (!r.ilkAcik) r.ilkAcik = s.tarih;
    });
    r.ihtiyac = r.slotlar.length;
    r.acik = r.stokBilinen ? r.slotlar.filter(function (s) { return s.durum === "acik"; }).length : null;
    Object.keys(planli).forEach(function (k) {
      var d = k.slice(0, 10), g = k.slice(11);
      if (d < bugun || d > son) return;
      planli[k].forEach(function (i) {
        if (kullanilan[i.id]) return;
        if (slotAnahtari[k]) r.ayniGunFazla++;
        else if (slotGunu[d]) { r.turUyumsuz++; r.turUyumsuzGunler.push({ tarih: d, grup: g, beklenen: slotGunu[d], icerikId: i.id }); }
        else if (gruplar[g]) r.slotDisiPlanli++;
      });
    });
    r.turUyumsuzGunler.sort(function (a, b) { return a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0; });
    return r;
  }

  /**
   * Musteri stok uyarisi. Esik: musteri esigi, yoksa varsayilan; ikisi de yoksa yalniz 7 gunluk acik slotlara bakilir.
   * Esik musterinin beklenen paylasim turundeki (slotTuru) hazir icerikle karsilastirilir: post paylasan musteride hazir post.
   */
  function stokUyarisi(veri, m, bugun, varsayilanEsik) {
    if (!m.stokGirisi) return { seviye: "bilinmiyor", nedenler: ["Stok girişi yapılmadı"] };
    var st = stok(veri, m, bugun), k7 = kapsama(veri, m, bugun, 7), n = [];
    var esik = m.stokUyari !== null && m.stokUyari !== undefined ? m.stokUyari : (varsayilanEsik !== null && varsayilanEsik !== undefined ? varsayilanEsik : null);
    var grup = m.slotTuru || "video", adet = grup === "video" ? st.toplam : (st.digerHazir[grup] || 0);
    var grupAd = grup === "video" ? "video" : (TUR_AD[grup] || grup).toLowerCase();
    if (esik !== null && adet < esik) n.push("Hazır " + grupAd + " stoku " + adet + " (eşik " + esik + ")");
    if (k7.duzenTamam && k7.acik > 0) n.push("7 gün içinde " + k7.acik + " paylaşım hazır içerikle karşılanmıyor (ilk: " + tarihGunlu(k7.ilkAcik) + ")");
    return n.length ? { seviye: "dusuk", nedenler: n, esik: esik } : { seviye: "tamam", nedenler: [], esik: esik };
  }

  /* ---------------- Takvim ---------------- */

  /** Etkinligin [baslangic, bitis) araligi 'YYYY-AA-GG SS:DD' metni olarak. Tum gun: bitis gununun ertesi 00:00. */
  function aralik(e) {
    var bit = e.bitTarih || e.basTarih;
    if (e.tumGun) return [e.basTarih + " 00:00", gunEkle(bit, 1) + " 00:00"];
    return [e.basTarih + " " + e.basSaat, bit + " " + e.bitSaat];
  }
  function sayilanEtkinlik(e) { return aktif(e) && e.durum !== "iptal"; }
  /** Iki etkinlik ust uste biniyor mu (uc uca degmek cakisma degil). */
  function ustUste(a, b) { var x = aralik(a), y = aralik(b); return x[0] < y[1] && y[0] < x[1]; }
  /** aday ile cakisan (iptal ve arsiv haric) etkinlikler. */
  function cakisanlar(etkinlikler, aday) {
    if (!sayilanEtkinlik(aday)) return [];
    return (etkinlikler || []).filter(function (e) { return e.id !== aday.id && sayilanEtkinlik(e) && ustUste(e, aday); });
  }
  /** id -> cakistigi etkinlik idleri */
  function cakismaHaritasi(etkinlikler) {
    var a = (etkinlikler || []).filter(sayilanEtkinlik).map(function (e) { return { e: e, r: aralik(e) }; });
    a.sort(function (x, y) { return x.r[0] < y.r[0] ? -1 : x.r[0] > y.r[0] ? 1 : 0; });
    var m = {};
    for (var i = 0; i < a.length; i++) {
      for (var j = i + 1; j < a.length && a[j].r[0] < a[i].r[1]; j++) {
        if (a[i].r[0] < a[j].r[1]) {
          (m[a[i].e.id] = m[a[i].e.id] || []).push(a[j].e.id);
          (m[a[j].e.id] = m[a[j].e.id] || []).push(a[i].e.id);
        }
      }
    }
    return m;
  }
  /** Etkinlik verilen gunu kapsiyor mu (gece yarisini asan saatli etkinlik iki gunde de gorunur). */
  function gundeMi(e, gun) {
    var r = aralik(e);
    return r[0] < gunEkle(gun, 1) + " 00:00" && gun + " 00:00" < r[1];
  }
  function saatMetni(e) {
    var bit = e.bitTarih || e.basTarih;
    if (e.tumGun) return bit !== e.basTarih ? "Tüm gün, " + tarihKisa(e.basTarih) + " – " + tarihKisa(bit) : "Tüm gün";
    return e.basSaat + "–" + e.bitSaat + (bit !== e.basTarih ? " (" + tarihKisa(bit) + ")" : "");
  }
  /** Takvimde o gune dusen kismin saat metni: baslangic gunu "10:00", ara gun "devam", bitis gunu "–01:00". */
  function gundekiSaat(e, gun) {
    if (e.tumGun) return "Tüm gün";
    var bit = e.bitTarih || e.basTarih;
    if (gun === e.basTarih) return e.basSaat;
    if (gun === bit) return "–" + e.bitSaat;
    return "devam";
  }
  function etkinlikSirala(a, b) {
    var x = aralik(a)[0], y = aralik(b)[0];
    return x < y ? -1 : x > y ? 1 : 0;
  }

  /* ---------------- Genel bakis ---------------- */

  function genelBakis(veri, bugun, ayar) {
    var musteriler = (veri.musteriler || []).filter(aktif);
    var mHar = idHaritasi(veri.musteriler);
    var icerikler = (veri.icerikler || []).filter(function (i) { return aktif(i) && aktif(mHar[i.musteriId]); });
    var etk = (veri.etkinlikler || []).filter(sayilanEtkinlik);
    var hafta = gunEkle(bugun, 7), uc = gunEkle(bugun, 3);
    var esik = ayar && ayar.varsayilanStokUyari !== undefined ? ayar.varsayilanStokUyari : null;

    var bugunEtk = etk.filter(function (e) { return gundeMi(e, bugun); }).sort(etkinlikSirala);
    var yaklasanEtk = etk.filter(function (e) { return e.basTarih > bugun && e.basTarih <= hafta; }).sort(etkinlikSirala);
    var gecmisPlanli = etk.filter(function (e) { return e.durum === "planlandi" && aralik(e)[1] <= bugun + " 00:00"; }).sort(etkinlikSirala);
    var eHar = idHaritasi(veri.etkinlikler);

    var teslim = icerikler.filter(function (i) { return i.teslimTarihi && TESLIM_BEKLEYEN.indexOf(i.durum) !== -1; });
    var geciken = teslim.filter(function (i) { return i.teslimTarihi < bugun; });
    var yaklasanTeslim = teslim.filter(function (i) { return i.teslimTarihi >= bugun && i.teslimTarihi <= uc; });
    var tarihSira = function (alan) { return function (a, b) { return a[alan] < b[alan] ? -1 : a[alan] > b[alan] ? 1 : 0; }; };

    var stokUyarilari = [], stokBilinmeyen = [], duzenEksik = [], acikTarihler = [], oneriSayisi = 0;
    musteriler.forEach(function (m) {
      var u = stokUyarisi(veri, m, bugun, esik);
      if (u.seviye === "dusuk") stokUyarilari.push({ musteri: m, nedenler: u.nedenler });
      if (u.seviye === "bilinmiyor") stokBilinmeyen.push(m);
      var k = kapsama(veri, m, bugun, 7);
      if (!k.duzenTamam) { duzenEksik.push({ musteri: m, eksik: k.eksik }); return; }
      k.slotlar.forEach(function (s) {
        if (s.durum === "acik" || s.durum === "bilinmiyor") acikTarihler.push({ musteri: m, tarih: s.tarih, durum: s.durum, hazirlikta: s.hazirlikta });
        if (s.durum === "oneri") oneriSayisi++;
      });
    });
    acikTarihler.sort(function (a, b) { return a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0; });

    var sayilar = musteriler.map(function (m) {
      var s = { musteri: m, stokBilinen: !!m.stokGirisi, cekildi: 0, kurguda: 0, onayda: 0, revizyonda: 0, hazir: 0 };
      icerikler.forEach(function (i) { if (i.musteriId === m.id && typeof s[i.durum] === "number") s[i.durum]++; });
      return s;
    });

    return {
      bugun: bugun,
      bugunEtkinlik: bugunEtk,
      yaklasanEtkinlik: yaklasanEtk,
      gecmisPlanliEtkinlik: gecmisPlanli,
      gecikenTeslim: geciken.sort(tarihSira("teslimTarihi")),
      yaklasanTeslim: yaklasanTeslim.sort(tarihSira("teslimTarihi")),
      // en uzun bekleyen once; gonderim gunu bilinmeyenler sonda
      onayda: icerikler.filter(function (i) { return i.durum === "onayda"; }).map(function (i, k) { return { i: i, d: onayaGidis(i), k: k }; }).sort(function (a, b) {
        if (a.d !== b.d) return !a.d ? 1 : !b.d ? -1 : a.d < b.d ? -1 : 1;
        return a.k - b.k;
      }).map(function (x) { return x.i; }),
      revizyonda: icerikler.filter(function (i) { return i.durum === "revizyonda"; }),
      // cekimi tamamlanmis ama hala "Fikir" / "Çekim planlandı"da kalan (cekildi yapilmasi unutulmus) icerikler
      cekimiBitenPlanli: icerikler.filter(function (i) { return cekimiBitti(i, eHar); }),
      gecmisPlanYayinlanmamis: icerikler.filter(function (i) { return i.planTarihi && i.planTarihi < bugun && i.durum !== "yayinlandi"; }).sort(tarihSira("planTarihi")),
      // bugune planli, yayina hazir (henuz yayinlanmamis) icerikler; sira Icerikler listesindekiyle ayni
      bugunPaylasilacaklar: icerikler.filter(function (i) { return i.durum === "hazir" && i.planTarihi === bugun; }).sort(icerikSirala),
      // yayin duzeni ya da stok bilgisinden bagimsiz: 7 gun icinde yayina planli ama hazir olmayan icerikler
      planliHazirDegil: icerikler.filter(function (i) { return i.planTarihi && i.planTarihi >= bugun && i.planTarihi < hafta && i.durum !== "hazir" && i.durum !== "yayinlandi"; }).sort(tarihSira("planTarihi")),
      stokUyarilari: stokUyarilari,
      stokBilinmeyen: stokBilinmeyen,
      duzenEksik: duzenEksik,
      acikTarihler: acikTarihler,
      oneriSayisi: oneriSayisi,
      sayilar: sayilar
    };
  }

  /** Icerigin bagli cekimi tamamlandi ama icerik hala cekilmemis gorunuyor mu (eHar: etkinlik id -> kayit). */
  function cekimiBitti(i, eHar) {
    var e = i && i.cekimId ? eHar[i.cekimId] : null;
    return !!e && e.durum === "tamamlandi" && (i.durum === "fikir" || i.durum === "cekim_planlandi");
  }

  /** Aylik ucret ozeti (anlasma tutari; tahsilat ya da alacak degil). Ucreti bilinmeyen 0 sayilmaz. */
  function ucretOzeti(musteriler) {
    var a = (musteriler || []).filter(aktif), bilinen = a.filter(function (m) { return m.ucret !== null && m.ucret !== undefined; });
    return {
      aktif: a.length,
      bilinen: bilinen.length,
      bilinmeyen: a.length - bilinen.length,
      toplam: bilinen.reduce(function (t, m) { return t + m.ucret; }, 0)
    };
  }

  /* ---------------- Filtre ve arama ---------------- */

  /** f: { musteri, durum, oncelik, tur, tarihAlan (plan|teslim|yayin), bas, bit, q, arsiv, cekim } */
  function icerikFiltrele(veri, f) {
    f = f || {};
    var mHar = idHaritasi(veri.musteriler);
    var q = f.q ? katla(f.q) : "";
    var durumlar = f.durum ? String(f.durum).split(",") : null;
    var alan = { plan: "planTarihi", teslim: "teslimTarihi", yayin: "yayinTarihi" }[f.tarihAlan || "plan"];
    return (veri.icerikler || []).filter(function (i) {
      if (f.arsiv ? !i.arsiv : i.arsiv) return false;
      if (f.musteri && i.musteriId !== f.musteri) return false;
      if (durumlar && durumlar.indexOf(i.durum) === -1) return false;
      if (f.oncelik && i.oncelik !== f.oncelik) return false;
      if (f.tur && (f.tur === "video_grubu" ? turGrubu(i.tur) !== "video" : i.tur !== f.tur)) return false;
      if (f.cekim && i.cekimId !== f.cekim) return false;
      if (f.plansiz && i.planTarihi) return false;
      if (f.bas || f.bit) {
        var t = i[alan];
        if (!t || (f.bas && t < f.bas) || (f.bit && t > f.bit)) return false;
      }
      if (q) {
        var m = mHar[i.musteriId];
        var hay = katla([i.baslik, i.not, i.revizyonNotu, m && m.ad, m && m.kurum].join(" "));
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }
  /** Liste sirasi: yayinlanmamislar tarihe gore once, yayinlananlar en sonda (yeniden eskiye). */
  function icerikSirala(a, b) {
    var ay = a.durum === "yayinlandi", by = b.durum === "yayinlandi";
    if (ay !== by) return ay ? 1 : -1;
    if (ay) return (b.yayinTarihi || "") < (a.yayinTarihi || "") ? -1 : (b.yayinTarihi || "") > (a.yayinTarihi || "") ? 1 : 0;
    var x = a.planTarihi || a.teslimTarihi || "9999", y = b.planTarihi || b.teslimTarihi || "9999";
    if (x !== y) return x < y ? -1 : 1;
    return oncelikSira(a) - oncelikSira(b) || (b.guncelleme || 0) - (a.guncelleme || 0);
  }

  function ara(veri, sorgu) {
    var q = katla(sorgu);
    if (!q) return { musteriler: [], icerikler: [], etkinlikler: [] };
    var mHar = idHaritasi(veri.musteriler);
    var var_ = function (parcalar) { return katla(parcalar.join(" ")).indexOf(q) !== -1; };
    return {
      musteriler: (veri.musteriler || []).filter(function (m) { return var_([m.ad, m.kurum, m.not]); }),
      icerikler: (veri.icerikler || []).filter(function (i) {
        var m = mHar[i.musteriId];
        return var_([i.baslik, i.not, i.revizyonNotu, m && m.ad, m && m.kurum]);
      }),
      etkinlikler: (veri.etkinlikler || []).filter(function (e) {
        var m = mHar[e.musteriId];
        return var_([e.baslik, e.konum, e.not, m && m.ad, m && m.kurum]);
      })
    };
  }

  /* ---------------- CSV ---------------- */

  function csvHucre(v) {
    var s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // tablo programlarinda formul calismasin
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(satirlar) {
    return "﻿" + satirlar.map(function (r) { return r.map(csvHucre).join(";"); }).join("\r\n") + "\r\n";
  }
  function musterilerCsv(veri) {
    var rows = [["Ad", "Kurum", "Aylık ücret (TL)", "Yayın sıklığı", "Beklenen paylaşım türü", "Stok uyarı eşiği", "Stok girişi", "Not", "Arşiv"]];
    (veri.musteriler || []).forEach(function (m) {
      var slot = SLOT_TURLERI.filter(function (x) { return x.k === (m.slotTuru || "video"); })[0];
      rows.push([m.ad, m.kurum, m.ucret === null || m.ucret === undefined ? "" : m.ucret, siklikMetni(m), slot ? slot.ad : m.slotTuru,
        m.stokUyari === null || m.stokUyari === undefined ? "" : m.stokUyari, m.stokGirisi ? "evet" : "hayır", m.not, m.arsiv ? "evet" : "hayır"]);
    });
    return csv(rows);
  }
  function iceriklerCsv(veri) {
    var mHar = idHaritasi(veri.musteriler), eHar = idHaritasi(veri.etkinlikler);
    var rows = [["Müşteri", "Başlık", "Tür", "Durum", "Öncelik", "Bağlı çekim", "Kurgu teslim", "Planlanan yayın", "Yayınlandığı tarih",
      "Ham görüntü bağlantısı", "Proje dosyası bağlantısı", "Final bağlantısı", "Revizyon notu", "Not", "Arşiv"]];
    (veri.icerikler || []).forEach(function (i) {
      var d = i.dosyalar || {}, e = eHar[i.cekimId];
      rows.push([musteriAdi(mHar[i.musteriId]), i.baslik, TUR_AD[i.tur] || i.tur, DURUM_AD[i.durum] || i.durum, ONCELIK_AD[i.oncelik] || i.oncelik,
        e ? e.baslik + " (" + e.basTarih + ")" : "", i.teslimTarihi, i.planTarihi, i.yayinTarihi, d.ham, d.proje, d.final, i.revizyonNotu, i.not, i.arsiv ? "evet" : "hayır"]);
    });
    return csv(rows);
  }

  /** Ice aktarma dosyasini ortak bicime cevirir: { musteriler, icerikler, etkinlikler } ya da hata metni. */
  function yedekCoz(obj) {
    if (!obj || typeof obj !== "object") return { hata: "Bu dosya bir Suflo Studio yedeği değil." };
    var v = obj.format === "suflo-studio-yedek" ? obj.veriler : obj;
    if (!v || typeof v !== "object") return { hata: "Yedek içinde veri yok." };
    var ok = ["musteriler", "icerikler", "etkinlikler"].some(function (k) { return Array.isArray(v[k]); });
    if (!ok) return { hata: "Bu dosyada müşteri, içerik ya da çekim listesi bulunamadı. Suflo Studio’dan indirdiğin JSON yedeğini seç." };
    var out = { musteriler: v.musteriler || [], icerikler: v.icerikler || [], etkinlikler: v.etkinlikler || [] };
    // yedekte ayar acikca bos (null) ise de iletilir: "tumunu degistir" mevcut ayari da kaldirir
    if (v.ayar === null && Object.prototype.hasOwnProperty.call(v, "ayar")) out.ayar = null;
    else if (v.ayar && typeof v.ayar === "object") out.ayar = v.ayar;
    // taninmayan ust duzey alanlar (ornegin elle hazirlanmis "cekimler" listesi) sessizce yok sayilmaz, onizlemede uyarilir
    var bilinen = { musteriler: 1, icerikler: 1, etkinlikler: 1, ayar: 1 };
    var bilinmeyen = Object.keys(v).filter(function (k) { return !bilinen[k]; });
    if (obj.format === "suflo-studio-yedek") {
      var ust = { format: 1, surum: 1, olusturma: 1, veriler: 1 };
      bilinmeyen = bilinmeyen.concat(Object.keys(obj).filter(function (k) { return !ust[k]; }));
    }
    return { veriler: out, bilinmeyen: bilinmeyen };
  }

  return {
    DURUMLAR: DURUMLAR, TURLER: TURLER, ONCELIKLER: ONCELIKLER, ETKINLIK_TURLERI: ETKINLIK_TURLERI,
    ETKINLIK_DURUMLARI: ETKINLIK_DURUMLARI, SIKLIKLAR: SIKLIKLAR, SLOT_TURLERI: SLOT_TURLERI,
    GUN_KISA: GUN_KISA, GUN_UZUN: GUN_UZUN, AYLAR: AYLAR, TESLIM_BEKLEYEN: TESLIM_BEKLEYEN, HAZIRLIKTA: HAZIRLIKTA,
    DURUM_AD: DURUM_AD, TUR_AD: TUR_AD, ONCELIK_AD: ONCELIK_AD, ETKINLIK_TUR_AD: ETKINLIK_TUR_AD, ETKINLIK_DURUM_AD: ETKINLIK_DURUM_AD,
    turGrubu: turGrubu,
    gunEkle: gunEkle, gunFarki: gunFarki, haftaGunu: haftaGunu, haftaBasi: haftaBasi, ayBasi: ayBasi, ayEkle: ayEkle,
    gecerliTarih: gecerliTarih, makulTarih: makulTarih, gecerliSaat: gecerliSaat, istanbulSimdi: istanbulSimdi, damga: damga,
    tarihUzun: tarihUzun, tarihKisa: tarihKisa, tarihGunlu: tarihGunlu, ayAdi: ayAdi, goreli: goreli, ayIzgarasi: ayIzgarasi,
    katla: katla, norm: norm, para: para, ucretCoz: ucretCoz, musteriAdi: musteriAdi, siklikMetni: siklikMetni, yerelYol: yerelYol, guvenliLink: guvenliLink,
    aktif: aktif, kopya: kopya, idHaritasi: idHaritasi, cekimiBitti: cekimiBitti, durumDegistir: durumDegistir, geriAl: geriAl, sonrakiDurumlar: sonrakiDurumlar, onayaGidis: onayaGidis,
    stok: stok, duzenDurumu: duzenDurumu, slotlar: slotlar, slotGrubu: slotGrubu, kapsama: kapsama, stokUyarisi: stokUyarisi,
    aralik: aralik, ustUste: ustUste, cakisanlar: cakisanlar, cakismaHaritasi: cakismaHaritasi, gundeMi: gundeMi,
    saatMetni: saatMetni, gundekiSaat: gundekiSaat, etkinlikSirala: etkinlikSirala,
    genelBakis: genelBakis, ucretOzeti: ucretOzeti, icerikFiltrele: icerikFiltrele, icerikSirala: icerikSirala, ara: ara,
    csv: csv, musterilerCsv: musterilerCsv, iceriklerCsv: iceriklerCsv, yedekCoz: yedekCoz
  };
});
