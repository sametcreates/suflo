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
 * Hesap saf modülde (js/kesim-esle.js), belge KCaptions'ta (js/captions.js); burası yalnız DOM yapıştırıcısı.
 *
 * Kullanım: var eylem = KKesimAltyazi({ kutu, metin, uyarla, aktar? }); KS_applyCuts'tan sonra
 * eylem.kesimSonrasi(r, { removeMode, kaynak, kaynakAd, ranges, kare, kelimeler?, dil?, sonSinir? }).
 */
window.KKesimAltyazi = function (ids) {
  "use strict";

  ids = ids || {};
  var bekleyen = null;   // { plan, hedef, hedefAd, sira, aktifSekans, kelimeler, dil, sonSinir }

  function el(id) { return id ? document.getElementById(id) : null; }
  function modul() { return window.SufloKesimEsle || null; }
  function altyazi() { return window.KCaptions || null; }

  var NEDEN = {
    mesgul: "Altyazı oluşturulurken uyarlanamaz; iş bitince yeniden dene.",
    bos: "Altyazı sekmesinde uyarlanacak belge yok.",
    sekans: "Altyazı sekmesindeki belge bu kurgunun sekansına ait değil.",
    guncel: "Altyazı zaten yeni kurguya göre."
  };

  // Kesim KCaptions'a kaydedilir (kopyanın kimliği bilinince)
  function kaydet() {
    if (!bekleyen || bekleyen.sira || !bekleyen.hedef) return;
    var c = altyazi();
    if (!c || !c.kesimKaydet) return;
    var p = bekleyen.plan;
    bekleyen.sira = c.kesimKaydet({ kaynak: p.kaynak, hedef: bekleyen.hedef, hedefAd: bekleyen.hedefAd, mod: p.mod, cuts: p.cuts, kare: p.kare, imza: p.imza }) || 0;
  }

  function tazele() {
    var kutu = el(ids.kutu);
    if (!kutu) return;
    var uyarla = false, aktar = false, metin = "";
    if (bekleyen && bekleyen.hedef && bekleyen.aktifSekans === bekleyen.hedef) {
      var c = altyazi();
      var d = c && c.kurguDurumu ? c.kurguDurumu(bekleyen.hedef) : { ok: false };
      uyarla = !!d.ok;
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

  function uyarlaTikla() {
    var c = altyazi();
    if (!bekleyen || !bekleyen.hedef || !c || !c.kurguyaUyarla) return;
    var r = c.kurguyaUyarla(bekleyen.hedef) || {};
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

  function aktarTikla() {
    var c = altyazi();
    if (!bekleyen || !bekleyen.hedef || !bekleyen.kelimeler || !c || !c.yukleKelimeler) return;
    var r = c.yukleKelimeler(bekleyen.kelimeler, { sekansId: bekleyen.hedef, sira: bekleyen.sira, sekansAd: bekleyen.hedefAd,
      dil: bekleyen.dil, sonSinir: bekleyen.sonSinir }) || {};
    if (r.ok) {
      bekleyen.kelimeler = null;   // tek sefer: ikinci tık ikinci belge kurmaz
      KApp.toast(r.satir + " altyazı satırı yeni kurguya göre Altyazı sekmesinde", "good");
      if (KApp.goster) KApp.goster("captions");
    } else {
      KApp.toast(r.neden === "mesgul" ? "Altyazı oluşturulurken aktarılamaz; iş bitince yeniden dene." : "Altyazıya aktarılacak kelime kalmadı.", "warn");
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
      if (bilgi.kelimeler && bilgi.kelimeler.length) {
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
