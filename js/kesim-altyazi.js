/*
 * Suflo — kesimden sonra altyazı (3.4 adım 8): Otomatik Kesim ve Konuşmadan kes kartlarındaki eylem satırı.
 *
 * KS_applyCuts başarıyla dönünce kesim kaydedilir (SufloKesimEsle.uyarlamaPlani → KCaptions.kesimKaydet). Mod:
 * rippleFallback → boşluk, yoksa istenen; "Sadece kes + seç" hiçbir şey silmediği için kayıt da eylem de yok.
 *   - "Altyazıyı yeni kurguya uyarla": Altyazı sekmesindeki belge bu kesimden önceki kurguya aitse (aynı sekans ya da
 *     "— Suflo Temiz" kopyasının kaynağı; arada birden çok kesim olduysa hepsi sırayla) — KCaptions.kurguyaUyarla.
 *   - "Altyazıya aktar" (yalnız Konuşmadan kes): kesilmeyen kelimeler yeni kurgunun zamanlarıyla Altyazı sekmesine
 *     (KCaptions.yukleKelimeler, satırlar Satır uzunluğu seçimiyle kurulur).
 * Satır yalnız kesilen sekans (kopyada kopya) Premiere'de açıkken görünür. Ücretsiz (Pro kesim araçlarından tetiklenir).
 * Panel Premiere'in geri almasını görmez: kayıt host'un kurgu izini taşıyorsa (esleme.izSonra) iki düğme de önce taze
 * izi sorar (KS_kurguIzi, salt okur). Kesim geri alındıysa uyarlanmaz; kurgu başka türlü değiştiyse uyarı + "Yine de
 * uyarla". Kesim kısmen uygulandıysa (host esleme.eksik: silinemeyip seçilen parça) iki eylem de önerilmez.
 * Hesap saf modülde (js/kesim-esle.js), belge KCaptions'ta (js/captions.js); burası yalnız DOM yapıştırıcısı.
 *
 * Kullanım: var eylem = KKesimAltyazi({ kutu, metin, uyarla, aktar? }); KS_applyCuts'tan sonra
 * eylem.kesimSonrasi(r, { removeMode, kaynak, kaynakAd, ranges, kare, kelimeler?, dil?, sonSinir? }).
 */
window.KKesimAltyazi = function (ids) {
  "use strict";

  ids = ids || {};
  var bekleyen = null;   // { plan, hedef, hedefAd, sira, aktifSekans, kelimeler, dil, sonSinir, geriAlma? }
  var sorguda = false;   // KS_kurguIzi yanıtı bekleniyor (çift tık ikinci sorgu açmaz)

  function el(id) { return id ? document.getElementById(id) : null; }
  function modul() { return window.SufloKesimEsle || null; }
  function altyazi() { return window.KCaptions || null; }

  var NEDEN = {
    mesgul: "Altyazı oluşturulurken uyarlanamaz; iş bitince yeniden dene.",
    bos: "Altyazı sekmesinde uyarlanacak belge yok.",
    sekans: "Altyazı sekmesindeki belge bu kurgunun sekansına ait değil.",
    guncel: "Altyazı zaten yeni kurguya göre.",
    eksik: "Arada tam uygulanamamış ya da artık hatırlanmayan bir kesim var; altyazıyı bu kurgu için yeniden oluştur.",
    geriAlma: "Kesim Premiere'de geri alınmış; altyazı zaten bu kurguya göre."
  };

  // Kesim KCaptions'a kaydedilir (kopyanın kimliği bilinince)
  function kaydet() {
    if (!bekleyen || bekleyen.sira || !bekleyen.hedef) return;
    var c = altyazi();
    if (!c || !c.kesimKaydet) return;
    var p = bekleyen.plan;
    bekleyen.sira = c.kesimKaydet({ kaynak: p.kaynak, hedef: bekleyen.hedef, hedefAd: bekleyen.hedefAd, mod: p.mod, cuts: p.cuts, kare: p.kare, imza: p.imza,
      izOnce: p.izOnce, izSonra: p.izSonra, eksik: !!p.eksik }) || 0;
  }

  function tazele() {
    var kutu = el(ids.kutu);
    if (!kutu) return;
    var uyarla = false, aktar = false, metin = "";
    if (bekleyen && bekleyen.hedef && bekleyen.aktifSekans === bekleyen.hedef) {
      var c = altyazi();
      var d = c && c.kurguDurumu ? c.kurguDurumu(bekleyen.hedef) : { ok: false };
      uyarla = !!d.ok && !bekleyen.geriAlma;
      aktar = !!(ids.aktar && bekleyen.kelimeler && bekleyen.kelimeler.length);
      if (uyarla) metin = "Altyazı sekmesindeki " + d.satir + " satır kesimden önceki kurguya göre.";
      else if (aktar) metin = "Kesilmeyen " + bekleyen.kelimeler.length + " kelime yeni kurgunun zamanlarıyla altyazıya hazır.";
    }
    kutu.hidden = !(uyarla || aktar);
    var m = el(ids.metin);
    if (m) m.textContent = metin;
    var bu = el(ids.uyarla), ba = el(ids.aktar);
    if (bu) bu.hidden = !uyarla;
    if (ba) ba.hidden = !aktar;
  }

  function dugmeler(kapali) {
    var bu = el(ids.uyarla), ba = el(ids.aktar);
    if (bu) bu.disabled = !!kapali;
    if (ba) ba.disabled = !!kapali;
  }

  /*
   * Hedef sekansın bugünkü kurgu izi (KS_kurguIzi). devam(iz): iz = taze iz, "" = okunamadı, null = köprü yok
   * (denetlenemez). Yanıt beklenirken düğmeler kapalı; döner: Promise ya da null.
   */
  function tazeIz(hedef, devam) {
    var K = window.K;
    if (!K || typeof K.call !== "function") { devam(null); return null; }
    if (sorguda) return null;
    sorguda = true;
    dugmeler(true);
    return Promise.resolve()
      .then(function () { return K.call("KS_kurguIzi", { seqId: hedef }, 30000); })
      .then(function (r) { return r && r.ok && r.iz ? String(r.iz) : ""; }, function () { return ""; })
      .then(function (iz) { sorguda = false; dugmeler(false); devam(iz); });
  }
  /*
   * Kurgu kesimden sonra değişti (ya da okunamadı): uyarı + eylem düğmesi. etiket: düğmenin yaptığı iş — "Yine de uyarla"
   * (belgeyi yeni kurguya taşır) ya da "Yine de aktar" (Altyazıya aktar: belgenin YERİNE kelimelerden yeni belge kurar;
   * "uyarla" demek kullanıcıya eski satırlarının yeniden zamanlanacağını vaat ederdi).
   */
  function degistiUyar(okundu, zorla, etiket) {
    KApp.toast(okundu
      ? "Kurgu kesimden sonra Premiere'de değişti (geri alma ya da başka bir düzenleme); altyazı bu kurguya uymayabilir."
      : "Kurgu Premiere'den okunamadı; altyazı bu kurguya uymayabilir.", "warn", 10000, { metin: etiket || "Yine de uyarla", fn: zorla });
  }

  function uyarlaTikla() {
    var c = altyazi();
    if (!bekleyen || !bekleyen.hedef || !c || !c.kurguyaUyarla) return null;
    var hedef = bekleyen.hedef, b = bekleyen;
    var d = c.kurguDurumu ? c.kurguDurumu(hedef) : { ok: true };
    if (!d.ok || !d.izli) { uyarlaSonuc(c.kurguyaUyarla(hedef)); return null; }
    return tazeIz(hedef, function (iz) {
      if (iz === null) { uyarlaSonuc(c.kurguyaUyarla(hedef)); return; }
      var r = iz ? c.kurguyaUyarla(hedef, { guncelIz: iz }) : { ok: false, neden: "degisti" };
      if (!r.ok && r.neden === "degisti") {
        degistiUyar(!!iz, function () { uyarlaSonuc(c.kurguyaUyarla(hedef)); });
        tazele();
        return;
      }
      if (!r.ok && r.neden === "geriAlma") b.geriAlma = true;
      uyarlaSonuc(r);
    });
  }

  function uyarlaSonuc(r) {
    r = r || {};
    if (r.ok) {
      // parça parça (" · "): çevirmen her parçayı ayrı çevirir
      var parcalar = ["Altyazı yeni kurguya uyarlandı: " + r.satir + " satır"];
      if (r.dusen) parcalar.push("kesilen " + r.dusen + " satır çıkarıldı");
      if (r.kirpilan) parcalar.push(r.kirpilan + " satır kısaldı");
      KApp.toast(parcalar.join(" · "), "good");
    } else {
      KApp.toast(NEDEN[r.neden] || "Altyazı uyarlanamadı.", "warn");
    }
    tazele();
  }

  // Kelimeler bu kesimden hemen sonraki kurgunun zamanlarında: kurgu o zamandan beri değiştiyse önce uyarılır
  function aktarTikla() {
    var c = altyazi();
    if (!bekleyen || !bekleyen.hedef || !bekleyen.kelimeler || !c || !c.yukleKelimeler) return null;
    var b = bekleyen, beklenen = b.plan && b.plan.izSonra ? String(b.plan.izSonra) : "";
    if (!beklenen) { aktar(b); return null; }
    return tazeIz(b.hedef, function (iz) {
      if (iz === null || iz === beklenen) { aktar(b); return; }
      degistiUyar(!!iz, function () { aktar(b); }, "Yine de aktar");
    });
  }

  function aktar(b) {
    var c = altyazi();
    if (!b || !b.kelimeler || !c || !c.yukleKelimeler) return;
    var r = c.yukleKelimeler(b.kelimeler, { sekansId: b.hedef, sira: b.sira, sekansAd: b.hedefAd,
      dil: b.dil, sonSinir: b.sonSinir }) || {};
    if (r.ok) {
      b.kelimeler = null;   // tek sefer: ikinci tık ikinci belge kurmaz
      KApp.toast(r.satir + " altyazı satırı yeni kurguya göre Altyazı sekmesinde", "good");
      if (KApp.goster) KApp.goster("captions");
    } else if (r.neden === "mesgul") {
      KApp.toast("Altyazı oluşturulurken aktarılamaz; iş bitince yeniden dene.", "warn");
    } else if (r.neden === "kur") {
      /*
       * Satır kurucu kelimeleri reddetti (ör. Kelime kelime / Birikimli'de 8+ kelime aynı anda: "Motor kelime zamanlarını
       * veremedi … şimdilik satır modunu kullan."): kendi metni ve çaresi gösterilir; "kelime kalmadı" satırdaki
       * "Kesilmeyen N kelime … hazır" ile çelişirdi. Kelimeler durur: satır moduna geçip yeniden aktarılabilir.
       */
      KApp.toast(r.hata || "Altyazı satırları kurulamadı.", "warn", 10000);
    } else {
      KApp.toast("Altyazıya aktarılacak kelime kalmadı.", "warn");
    }
    tazele();
  }

  /*
   * KS_applyCuts döndükten sonra. r: host sonucu; bilgi: { removeMode (istenen), kaynak (analiz edilen sekans), kaynakAd,
   * ranges (gönderilen kesimler), kare (bağlamın karesi), kelimeler? (Konuşmadan kes: kesilmeyecek kelimeler, sekans
   * zamanı), dil?, sonSinir? (klibin sekanstaki sonu) }. Döner: bekleyen eylem ya da null.
   */
  function kesimSonrasi(r, bilgi) {
    bilgi = bilgi || {};
    var m = modul();
    bekleyen = null;
    var plan = m ? m.uyarlamaPlani(r, { removeMode: bilgi.removeMode, kaynak: bilgi.kaynak, kaynakAd: bilgi.kaynakAd,
      ranges: bilgi.ranges, kare: bilgi.kare }) : null;
    if (plan) {
      // Premiere kesilen sekansı (kopyada kopyayı) etkin yaptı: bağlam yoklaması değişeni bildirene dek o açık sayılır
      bekleyen = { plan: plan, hedef: plan.hedef, hedefAd: plan.hedefAd, sira: 0, aktifSekans: plan.hedef, kelimeler: null,
        dil: String(bilgi.dil || ""), sonSinir: 0 };
      // kısmen uygulanan kesim (silinemeyip seçilen parça): kaydedilir (yolu keser) ama kelimeler bu kurguya eşlenemez
      if (bilgi.kelimeler && bilgi.kelimeler.length && !plan.eksik) {
        bekleyen.kelimeler = m.kelimeEsle(bilgi.kelimeler, plan.cuts, { mod: plan.mod, kare: plan.kare });
        var son = Number(bilgi.sonSinir);
        if (son > 0) bekleyen.sonSinir = m.zamanEsle(son, m.kareyeOturt(plan.cuts, plan.kare), plan.mod, "son");
      }
      kaydet();
    }
    tazele();
    return bekleyen;
  }

  function baglamDegisti(ctx) {
    if (!bekleyen) return;
    var id = ctx && ctx.sequenceId ? String(ctx.sequenceId) : "";
    // kopyanın kimliği host raporunda yoksa: Premiere kopyayı açınca bağlamdan (aynı ad)
    if (!bekleyen.hedef && id && bekleyen.hedefAd && String(ctx.sequence || "") === bekleyen.hedefAd) {
      bekleyen.hedef = id;
      kaydet();
    }
    bekleyen.aktifSekans = id;
    tazele();
  }

  if (el(ids.uyarla)) el(ids.uyarla).addEventListener("click", uyarlaTikla);
  if (el(ids.aktar)) el(ids.aktar).addEventListener("click", aktarTikla);
  if (window.KApp && KApp.onContext) KApp.onContext(baglamDegisti);
  // Altyazı sekmesinde belge değişince (yeni transkript, geri al) satır tazelenir
  if (document.addEventListener) document.addEventListener("suflo:altyazi-belge", function () { tazele(); });
  tazele();   // bekleyen eylem yok: satır gizli başlar

  return {
    kesimSonrasi: kesimSonrasi,
    tazele: tazele,
    gizle: function () { bekleyen = null; tazele(); },
    durum: function () { return bekleyen; }
  };
};
