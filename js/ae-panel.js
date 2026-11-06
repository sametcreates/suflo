/*
 * Suflo — After Effects paneli (deneysel)
 *
 * Panel After Effects'te açıldığında (K.hostKodu() === "AEFT"; Premiere'de bu modül hiçbir şey yapmaz):
 *   - body.host-ae: Premiere'e özgü araçlar gizlenir (sol menüde yalnız Altyazı ve Ayarlar; Altyazı sekmesinde In → Out /
 *     Sekans kapsamı, caption izi / MOGRT / video katmanı ekleme, Viral anlar, B-roll, marker düğmeleri). Gizleme CSS'le
 *     (data-yalniz-premiere, data-ae-gizli): modüller öğelerini kendileri açsa da AE'de görünmez. Üstte Türkçe not.
 *   - jsx/host-ae.jsx aynı ExtendScript motoruna $.evalFile ile yüklenir (manifestin ScriptPath'i host.jsx).
 *   - Transkript Premiere'deki "Seçili klip" akışıyla aynı: K.call("KS_getSelectedClips") AE'de seçili katmanın kaynak
 *     dosyasına çevrilir (js/ae-plan.js klipSekli; katmanın inPoint / startTime / esnetmesi). Motor değişmez.
 *   - "Metin katmanı olarak ekle" (ücretsiz, Premiere'in ücretsiz caption izi gibi) ve "Altyazı Efektleriyle ekle"
 *     (denemesiz Pro.gate("overlay")). Deneme hakkı YOK: AE çıktısı düzenlenebilir yerel metin katmanlarıdır, filigran da
 *     yalnız silinebilir bir katman olurdu (Premiere'de filigran render'a gömülür); bir deneme temiz Pro çıktısı verirdi.
 *     Premiere'in yerel kuralıyla aynı: düzenlenebilir stilli yerel çıktı yalnız Pro. Plan js/ae-plan.js'te, yürütme
 *     host-ae.jsx'te.
 *   - "Suflo altyazılarını kaldır": yalnız Suflo'nun eklediği katmanlar (yorum işareti), tek geri al adımı.
 *
 * After Effects'te gerçek denemesi YAPILMADI (README). ES5 (CEF 74).
 */
window.SufloAePanel = (function () {
  "use strict";

  // After Effects'te açık kalan sekmeler (gerisi Premiere'e özgü)
  var AE_SEKMELERI = ["captions", "settings"];
  var kod = "";
  var hostSozu = null;
  var sonHata = 0;   // son başarısız host-ae.jsx yüklemesinin zamanı (otomatik denemeleri seyreltir)
  var mesgul = false;

  function el(id) { return document.getElementById(id); }
  function AP() { return window.SufloAePlan || null; }
  function toast(m, tur, sure) { if (window.KApp && KApp.toast) KApp.toast(m, tur, sure); }
  function proVar() { return typeof Pro !== "undefined" && Pro; }

  function aktif() { return kod === "AEFT"; }

  /*
   * host-ae.jsx'i yükle (bir kez). Yol uzantı kökünden; ters bölü ExtendScript metninde kaçış sorunu çıkarmasın diye "/".
   * otomatik: köprünün her KSAE_* çağrısından önceki denemesi (bridge.js call; 2,5 sn'lik bağlam yoklaması dahil). Kalıcı
   * bir hatada betik her yoklamada yeniden evalFile edilmesin: son başarısızlıktan 10 sn geçmeden beklemeden false.
   * Kullanıcı eylemi (ekle / kaldır) her zaman hemen yeniden dener.
   * Döner: Promise<bool> (KSAE_baglam tanımlandı mı).
   */
  function hostYukle(otomatik) {
    if (hostSozu) return hostSozu;
    if (otomatik === true && sonHata && Date.now() - sonHata < 10000) return Promise.resolve(false);
    hostSozu = new Promise(function (resolve) {
      var kok = K.extensionPath ? String(K.extensionPath() || "") : "";
      if (!kok) { resolve(false); return; }
      var yol = kok.replace(/\\/g, "/").replace(/\/+$/, "") + "/jsx/host-ae.jsx";
      var betik = "(function(){try{$.evalFile(new File(" + JSON.stringify(yol) + "));" +
        "return typeof KSAE_baglam==='function'?'ok':'no-fn';}catch(e){return 'error: '+e;}})()";
      try {
        K.cs.evalScript(betik, function (r) {
          if (r !== "ok") K.log("host-ae.jsx yuklenemedi: " + r);
          resolve(r === "ok");
        });
      } catch (e) {
        K.log("host-ae.jsx yuklenemedi: " + (e && e.message ? e.message : e));
        resolve(false);
      }
    }).then(function (ok) {
      if (!ok) { hostSozu = null; sonHata = Date.now(); }   // yüklenemediyse sonraki eylem yeniden dener
      else sonHata = 0;
      return ok;
    });
    return hostSozu;
  }

  function arayuzuHazirla() {
    document.body.classList.add("host-ae");
    Array.prototype.forEach.call(document.querySelectorAll(".yan-menu .ky-oge[data-tab]"), function (b) {
      if (AE_SEKMELERI.indexOf(b.getAttribute("data-tab")) === -1) b.setAttribute("data-ae-gizli", "");
    });
    // "Kütüphane" başlığı: altındaki girdilerin hepsi gizli
    var basliklar = document.querySelectorAll(".yan-menu .ky-baslik");
    for (var i = 1; i < basliklar.length; i++) basliklar[i].setAttribute("data-ae-gizli", "");
    Array.prototype.forEach.call(document.querySelectorAll(".tabpane"), function (p) {
      if (AE_SEKMELERI.indexOf(String(p.id || "").replace(/^tab-/, "")) === -1) p.setAttribute("data-ae-gizli", "");
    });
    if (el("host-ad")) el("host-ad").textContent = "AFTER EFFECTS";
    if (el("host-status")) el("host-status").title = "After Effects bağlantısı";
    var klip = document.querySelector('#cap-scope button[data-s="clip"]');
    if (klip) klip.textContent = "Seçili katman";
  }

  function dugmeler(kilitli) {
    ["ae-ekle", "ae-ekle-stil", "ae-kaldir"].forEach(function (id) { if (el(id)) el(id).disabled = !!kilitli; });
  }

  function hataMetni(e) { return e && e.message ? e.message : String(e || ""); }

  // İş kimliği: aynı işin katmanları yorumda aynı kimliği taşır (base36 zaman; plan bunu aynen yazar)
  function isKimligi() { return Date.now().toString(36); }

  /*
   * Altyazıyı aktif kompozisyona metin katmanları olarak ekle. stilli: Altyazı Efektleri (yalnız Pro, deneme hakkı yok;
   * modül başındaki not); değilse düz ve ücretsiz. Kapı "Video katmanı ekle"ninkiyle aynı özellik ("overlay"), denemesiz.
   */
  async function ekle(stilli) {
    if (mesgul) return;
    if (!window.KCaptions || !KCaptions.hasSegments()) { toast("Önce altyazı oluştur ya da SRT içe aktar.", "warn"); return; }
    var P = proVar();
    if (stilli && P && !P.gate("overlay", { yeniden: function () { ekle(true); } })) return;
    mesgul = true;
    dugmeler(true);
    try {
      if (!(await hostYukle())) throw new Error("After Effects betiği (host-ae.jsx) yüklenemedi.");
      var b = await K.call("KS_getContext", undefined, 20000);
      if (!b || !b.ok) throw new Error((b && b.error) || "After Effects'e bağlanılamadı.");
      if (!b.hasSeq) throw new Error(AP().HATA.comp);
      var v = KCaptions.aeVerisi(stilli);
      // dil: altyazının dili (kalite motoru: kart / satır kırılımı önizleme ve Premiere çıktısıyla aynı)
      var plan = AP().plan(v.cues, { mod: stilli ? "stilli" : "duz", ayar: v.ayar, cueKind: v.cueKind, guvenli: v.guvenli,
        w: b.width, h: b.height, fps: b.fps, sure: b.seqDur, filigran: false, isId: isKimligi(), dil: v.dil });
      if (!plan.katmanlar.length) throw new Error("Kompozisyonun süresine düşen altyazı yok.");
      var r = await K.call("KSAE_altyaziOlustur", plan, 600000);
      if (!r || !r.ok) throw new Error((r && r.error) || "Altyazı katmanları eklenemedi.");
      toast(r.adet + " altyazı katmanı eklendi", "good", 7000);
      var notlar = plan.uyarilar.slice();
      if (r.eksikFont && r.eksikFont.length) notlar.push("After Effects'te kurulu olmayan font: " + r.eksikFont.join(", ") + ". Fontu kurup katmanlarda yeniden seçebilirsin.");
      if (r.italikYok) notlar.push("Bu After Effects sürümü italiği betikten açamıyor; yazı düz eklendi.");
      notlar.forEach(function (n) { toast(n, "warn", 9000); });
    } catch (e) {
      toast(hataMetni(e), "bad", 9000);
    } finally {
      mesgul = false;
      dugmeler(false);
    }
  }

  // Aktif kompozisyondaki Suflo altyazı katmanlarını sil (yalnız Suflo'nun yorum işaretli katmanları)
  async function kaldir() {
    if (mesgul) return;
    mesgul = true;
    dugmeler(true);
    try {
      if (!(await hostYukle())) throw new Error("After Effects betiği (host-ae.jsx) yüklenemedi.");
      var r = await K.call("KSAE_altyaziKaldir", {}, 120000);
      if (!r || !r.ok) throw new Error((r && r.error) || "Suflo altyazıları kaldırılamadı.");
      if (r.removed > 0) toast(r.removed + " Suflo altyazı katmanı kaldırıldı", "good");
      else toast("Bu kompozisyonda Suflo altyazısı yok.", "warn");
    } catch (e) {
      toast(hataMetni(e), "bad", 9000);
    } finally {
      mesgul = false;
      dugmeler(false);
    }
  }

  function init() {
    try { kod = window.K && K.hostKodu ? K.hostKodu() : ""; } catch (e) { kod = ""; }
    if (!aktif()) return;
    arayuzuHazirla();
    hostYukle();
    if (el("ae-ekle")) el("ae-ekle").addEventListener("click", function () { ekle(false); });
    if (el("ae-ekle-stil")) el("ae-ekle-stil").addEventListener("click", function () { ekle(true); });
    if (el("ae-kaldir")) el("ae-kaldir").addEventListener("click", kaldir);
  }

  return {
    init: init,
    aktif: aktif,
    AE_SEKMELERI: AE_SEKMELERI.slice(),
    // testler ve app.js için
    ekle: ekle,
    kaldir: kaldir,
    hostYukle: hostYukle
  };
})();
