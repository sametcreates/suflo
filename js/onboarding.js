/*
 * Suflo — "İlk altyazın 2 dakikada" (ilk açılış rehberi)
 *
 * Altyazı sekmesinin üstündeki #ilk-adim kartı dört adım yürütür:
 *   1 Motor  dile uygun küçük model (Türkçe: Small 190 MB); örnek klip varsa ffmpeg arkada,
 *            kurulu cuBLAS motoru korunur. Adım atlanınca #cap-setup sekmedeki yerine döner
 *   2 Örnek  15 sn'lik Türkçe örnek klip projeye alınır, altyazısı çıkar
 *            (örnek dosyalar yoksa: "kendi klibinle ilk altyazı")
 *   3 Stil   Creator Punch kendi altyazınla önizlenir (önceki görünüm geri gelir;
 *            kullanıcı bir karta ya da görünüm ayarına kendisi dokunursa onun seçimi kalır)
 *   4 AI     ücretsiz Groq anahtarı sihirbazı (doğrulama + panodan alma)
 * Ayrıca: bağlam şeridinin kardeşi #onb-chip ("Kurulum 2/4"), AI düğmelerinin
 * yanında "anahtar gerekli · 1 dk" çipleri, Ayarlar > Destek'te "Kurulum
 * rehberini aç". Kurallar saf modülde: js/onboarding-steps.js (SufloOnboarding).
 *
 * KESİN KURAL: init ve ilk çizim YALNIZ Node gerçeklerini okur (ayarlar, kurulu
 * modeller, motor dosyası, RAM, örnek dosyalar). Premiere'e giden her çağrı
 * (K.call, KCaptions.go, KCaptions.applyStyled, KApp.pollNow) yalnız adı "Tikla"
 * ile biten ve YALNIZ "click" olayına bağlanan işleyicilerdedir: Premiere 26.3
 * açılışta arka plan evalScript'iyle donabiliyor (app.js). tests/test-onboarding.js
 * bunu kaynaktan ve sahte DOM'da çalıştırarak denetler.
 */
window.KOnboarding = (function () {
  "use strict";

  var SO = window.SufloOnboarding;
  function el(id) { return document.getElementById(id); }

  var GROQ_ANAHTAR_SAYFASI = "https://console.groq.com/keys";
  var GROQ_DOGRULAMA = "https://api.groq.com/openai/v1/models";
  var STIL_ORNEGI = "mrbeast";   // Creator Punch

  var basladi = false;
  var kararDegeri = "yok";
  var kayit = null;
  var ornekBilgi;            // undefined: bakılmadı · null: yok · { kok, m }
  var stilYedek = null;      // stil adımı açıkken önceki altyazı görünümü (kayit.stilYedek'te de durur)
  var stilDeneniyor = false;
  var anahtarOzellik = "";
  var dogrulaniyor = false;
  var ornekSuruyor = false;
  var setupYeri = null;      // #cap-setup'ın kart dışındaki asıl yeri
  var acikAdim = "";         // kullanıcının başlığına tıklayıp açtığı adım (sırayı beklemeden)

  // Anahtar isteyen yapay zekâ düğmeleri: yanlarına "anahtar gerekli · 1 dk" çipi
  // (Pro'ya bağlı olanlar SO.aiProOzelligi ile bulunur: ücretsizde çip yerine düğmenin Pro rozeti konuşur)
  var AI_HEDEFLER = [
    { id: "cap-proofread", ozellik: "AI metin kontrolü" },
    { id: "cap-translate-go", ozellik: "Çeviri" },
    { id: "cap-ch-ai", ozellik: "AI bölüm başlıkları" },
    { id: "cap-yt-go", ozellik: "Paylaşım metni" },
    { id: "cap-vr-bul", ozellik: "Viral anlar" },
    { id: "cap-br-bul", ozellik: "B-roll önerileri" },
    { id: "kanca-ai", ozellik: "Kanca önerileri" },
    { id: "tc-ai-lbl", ozellik: "AI tekrar gruplama" }
  ];

  /* ---------------- Gerçekler (yalnız Node) ---------------- */

  function modelVar() {
    try { return !!(window.KEngine && KEngine.activeModel() && K.whisperLocal()); } catch (e) { return false; }
  }
  function anahtarVar() { return !!String(K.settings().apiKey || "").trim(); }
  function aiHazir() {
    try { return !!(window.KCaptions && KCaptions.chatConfig && KCaptions.chatConfig()); } catch (e) { return anahtarVar(); }
  }
  function proMu() { return !!(window.Pro && Pro.isPro && Pro.isPro()); }
  // Bu yapay zekâ özelliği bu kullanıcıda açık mı? (Pro kapısı sessiz sorulur; kapısı deneme
  // kabul eden özellikte hakkı kalan ücretsiz kullanıcı da çalıştırabilir: ona da çip görünür)
  function ozellikAcik(ozellik) {
    var anahtar = SO.aiProOzelligi(ozellik);
    if (!anahtar || !window.Pro || !Pro.gate) return true;
    try {
      if (Pro.gate(anahtar, { silent: true }) === true) return true;
      if (!SO.aiDenemeKabul(ozellik)) return false;
      return !!(Pro.denemeKalan && Pro.denemeKalan(anahtar) > 0);
    } catch (e) { return true; }
  }
  function cudaKurulu() {
    try {
      return !!(window.KEngine && KEngine.installedBuild && KEngine.installedBuild() === "cuda" &&
        K.whisperLocal && K.whisperLocal({ skipModel: true }));
    } catch (e) { return false; }
  }
  function uygulandi() {
    var s = K.settings();
    return Number(s.basariliUygulama) > 0 || s.yildizSoruldu === true;
  }

  // Eklentideki assets > onboarding klasörü: ornek.json ve listelediği dosyalar
  // (kurucunun kaydı; yoksa 2. adım "kendi klibinle ilk altyazı" olur)
  function ornekOku() {
    if (ornekBilgi !== undefined) return ornekBilgi;
    ornekBilgi = null;
    if (!K.nodeOK || !K.extensionPath) return null;
    try {
      var ext = K.extensionPath();
      if (!ext) return null;
      var kok = K.path.join(ext, "assets", "onboarding");
      var manifestYolu = K.path.join(kok, "ornek.json");
      if (!K.fs.existsSync(manifestYolu)) return null;
      var m = SO.ornekManifestDogrula(JSON.parse(K.fs.readFileSync(manifestYolu, "utf8")));
      if (!m.ok) { K.log("[rehber] ornek.json gecersiz: " + m.hata); return null; }
      var eksik = Object.keys(m.dosyalar).filter(function (k) {
        return !K.fs.existsSync(K.path.join(kok, m.dosyalar[k]));
      });
      if (eksik.length) { K.log("[rehber] ornek dosyasi eksik: " + eksik.join(", ")); return null; }
      ornekBilgi = { kok: kok, m: m };
    } catch (e) {
      K.log("[rehber] ornek okunamadi: " + (e && e.message ? e.message : e));
      ornekBilgi = null;
    }
    return ornekBilgi;
  }

  function gercekler() {
    var s = K.settings();
    return {
      modelVar: modelVar(),
      apiKey: anahtarVar(),
      provider: s.provider || "local",
      ornekVar: !!ornekOku(),
      ilkAltyazi: uygulandi()
    };
  }

  function kararVer() {
    var s = K.settings();
    return SO.gosterimKarari({
      ayarDosyasiVardi: K.ayarDosyasiVardi ? K.ayarDosyasiVardi() : true,
      onboarding: s.onboarding,
      yeniliklerGoruldu: s.yeniliklerGoruldu,
      modelVar: modelVar(),
      apiKey: anahtarVar(),
      uygulandi: uygulandi()
    });
  }

  function modelSecimi() {
    var ram = 0;
    try { ram = K.os.totalmem() / 1073741824; } catch (e) {}
    var gpu = null;
    try { gpu = window.KEngine && KEngine.gpuInfo ? KEngine.gpuInfo() : null; } catch (eG) {}
    var motor = false;
    try { motor = !!(K.whisperLocal && K.whisperLocal({ skipModel: true })); } catch (eW) {}
    return SO.modelSec({
      lang: (el("cap-lang") && el("cap-lang").value) || "tr",
      ramGB: ram,
      gpu: gpu ? gpu.kind : "",
      mac: !!K.MAC,
      brew: !!(K.brewYolu && K.brewYolu()),
      motorVar: motor
    });
  }

  /* ---------------- Kayıt ---------------- */

  function kayitYaz() {
    var s = K.settings();
    s.onboarding = kayit;
    K.saveSettings();
  }

  function durum(metin, sinif) {
    var d = el("ia-durum");
    if (!d) return;
    d.className = "inline-status" + (sinif ? " " + sinif : "");
    d.textContent = metin || "";
  }

  function gorunur(id, acik) { var e = el(id); if (e) e.hidden = !acik; }
  function yaz(id, metin) { var e = el(id); if (e) e.textContent = metin; }

  function kaydir(hedef) {
    if (!hedef || !hedef.scrollIntoView) return;
    try { hedef.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { hedef.scrollIntoView(); }
  }

  /* ---------------- Çizim ---------------- */

  function rehberAcik() {
    return basladi && kararDegeri === "tam" && !kayit.kapandi;
  }

  /*
   * Tek kurulum kartı: #cap-setup YALNIZ motor adımının gövdesi görünürken (aktif ya da
   * başlığından açılmış) o adımın içine taşınır. Adım atlanınca/kapanınca kart Altyazı
   * sekmesindeki eski yerine döner: motor yokken kurulum düğmesi hiç gözden kaybolmaz.
   */
  function setupYerlestir(kartta) {
    var setup = el("cap-setup"), govde = el("ia-motor-govde");
    if (!setup || !govde) return;
    if (!setupYeri) setupYeri = { ebeveyn: setup.parentNode, sonraki: setup.nextSibling };
    if (kartta) {
      if (setup.parentNode !== govde) govde.insertBefore(setup, el("ia-motor-ek"));
    } else if (setupYeri.ebeveyn && setup.parentNode !== setupYeri.ebeveyn) {
      setupYeri.ebeveyn.insertBefore(setup, setupYeri.sonraki);
    }
  }

  /*
   * 0. adım (yalnız taze kurulumda, dil henüz seçilmemişken): iki dilli iki düğme.
   * Premiere'in arayüz dili (navigator.language) yalnız hangi düğmenin vurgulanacağını
   * belirler; dili kullanıcı seçer. Seçim settings.json'a (uiLang) yazılır.
   */
  function dilCiz(acik) {
    var kutu = el("ia-dil"), I = window.SufloI18n;
    if (!kutu) return;
    var sor = !!(acik && I && I.needsChoice && I.needsChoice());
    kutu.hidden = !sor;
    if (!sor) return;
    var oneri = I.detect ? I.detect() : "tr";
    ["tr", "en"].forEach(function (l) {
      var b = el("ia-dil-" + l);
      if (b) b.className = "btn" + (l === oneri ? " primary" : "");
    });
  }
  function dilSec(l) {
    var I = window.SufloI18n;
    if (!I || !I.switchLang) return;
    I.switchLang(l, { busy: function () { return !!(K.surecSayisi && K.surecSayisi() > 0); } });
    ciz();
  }

  function ciz() {
    if (!basladi) return;
    var h = SO.adimlariHesapla(kayit, gercekler());
    if (h.bitti && !kayit.bitti) {
      kayit.bitti = true;
      stilKapat();
      kayitYaz();
      if (rehberAcik()) KApp.toast("Kurulum tamam — Suflo hazır. İyi kurgular!", "good", 6000);
    }
    var acik = rehberAcik();
    var kart = el("ilk-adim");
    if (kart) {
      kart.hidden = !acik;
      kart.classList.toggle("bitti", h.bitti);
    }
    dilCiz(acik);
    var motorEk = acik && motorEkVar(h);
    setupYerlestir(acik && adimGovdesiAcik(h, "motor", motorEk));
    cipCiz(h, acik);
    if (!acik) return;

    yaz("ilk-adim-sayac", h.tamamlanan + "/" + h.toplam);
    var cubuk = el("ilk-adim-cubuk");
    if (cubuk) cubuk.style.width = Math.round(100 * h.tamamlanan / h.toplam) + "%";
    yaz("ilk-adim-alt", h.bitti ? "Hazırsın: altyazın çıktı, stil ve yapay zekâ bir tık uzakta."
      : "Dört kısa adım · istediğini atlayabilirsin");
    SO.ADIMLAR.forEach(function (ad) {
      var li = el("ia-" + ad);
      if (!li) return;
      var d = h.adimlar[ad];
      var ek = ad === "motor" && motorEk;
      li.className = "ia-adim " + (d === "tamam" ? "tamam" : (d === "atlandi" ? "atlandi" : (h.siradaki === ad ? "aktif" : "bekliyor"))) +
        ((acikAdim === ad || ek) ? " acik" : "");
      yaz("ia-" + ad + "-rozet", d === "tamam" ? "✓" : (d === "atlandi" ? "atlandı" : ""));
      // klavye ve ekran okuyucu: başlık bir düğme, gövdenin açık olup olmadığını söyler
      var bas = el("ia-" + ad + "-bas");
      if (bas) bas.setAttribute("aria-expanded", adimGovdesiAcik(h, ad, ek) ? "true" : "false");
    });
    motorCiz(h);
    ornekCiz(h);
    stilCiz(h);
    aiCiz(h);
    gorunur("ilk-adim-atla", !!h.siradaki);
  }

  // Adımın gövdesi görünüyor mu (CSS: .aktif ya da .acik)
  function adimGovdesiAcik(h, ad, ek) {
    return h.siradaki === ad || acikAdim === ad || !!ek;
  }

  // İlk altyazıdan SONRA isteğe bağlı ekler (daha doğru model, NVIDIA hızlandırma) var mı
  function motorEkBilgisi(h) {
    var aktif = null;
    try { aktif = window.KEngine ? KEngine.activeModel() : null; } catch (e) {}
    var ilkSonra = h.adimlar.ornek === "tamam" && h.adimlar.motor === "tamam" && !!aktif;
    var turboVar = false;
    try { turboVar = KEngine.installedModels().some(function (m) { return m.id === "turbo" || m.id === "large"; }); } catch (eT) {}
    var gpu = null;
    try { gpu = KEngine.gpuInfo(); } catch (eG) {}
    var cudaYok = !!(gpu && gpu.kind === "cuda" && KEngine.installedBuild() !== "cuda");
    return { aktif: aktif, turbo: ilkSonra && !turboVar, cublas: ilkSonra && cudaYok };
  }
  function motorEkVar(h) {
    var b = motorEkBilgisi(h);
    return b.turbo || b.cublas;
  }

  function motorCiz(h) {
    var hazir = h.adimlar.motor === "tamam";
    var secim = modelSecimi();
    var ekBilgi = motorEkBilgisi(h);
    var aktif = ekBilgi.aktif;
    if (hazir) {
      yaz("ia-motor-metin", aktif
        ? "Hazır: " + aktif.label.split(" —")[0] + " · yerel, çevrimdışı ve sınırsız."
        : "Hazır: Groq bulut motoru (ücretsiz anahtarla).");
    } else if (secim.bulut) {
      yaz("ia-motor-metin", "Mac'te yerel motor Homebrew ile kurulur ve Homebrew bulunamadı. En hızlı başlangıç: ücretsiz Groq anahtarıyla bulut motoru.");
    } else {
      yaz("ia-motor-metin", (secim.model === "base" ? "Base" : "Small") + " modeli (" + secim.sizeMB +
        " MB) iner. Hesap, abonelik ya da kredi yok.");
    }
    gorunur("ia-motor-bulut", !hazir && !!secim.bulut);

    // İlk altyazıdan SONRA isteğe bağlı: daha doğru model ve NVIDIA hızlandırma
    // (tamamlanmış motor adımı kapalı durur; bunlar varsa ciz() onu "acik" çizer)
    gorunur("ia-turbo", ekBilgi.turbo);
    gorunur("ia-cublas", ekBilgi.cublas);
    gorunur("ia-motor-ek", ekBilgi.turbo || ekBilgi.cublas);
  }

  function ornekCiz(h) {
    var d = h.adimlar.ornek;
    var ornekModu = h.ornekModu === "ornek";
    yaz("ia-ornek-baslik", ornekModu ? "Örnekte dene" : "İlk altyazın");
    var motorHazir = h.adimlar.motor === "tamam";
    var dugme = el("ia-ornek-dene");
    if (d === "tamam") {
      yaz("ia-ornek-metin", "Altyazın hazır. \"Normal altyazı izi ekle\" ücretsiz caption izi oluşturur.");
    } else if (ornekModu) {
      yaz("ia-ornek-metin", motorHazir
        ? "15 saniyelik Türkçe örnek klip projene alınır (Suflo Ornek kutusu, Suflo Deneme sekansı) ve altyazısı çıkar."
        : "Motor kurulmadan da olur: örnek klip projene alınır, elle doğrulanmış örnek transkript yüklenir.");
    } else if (!motorHazir) {
      // kendi klibinle: motor (ya da anahtar) olmadan "Altyazı oluştur" kapalı kalır
      yaz("ia-ornek-metin", "Önce motoru kur: kendi klibinden altyazı çıkarmak için yerel motor ya da ücretsiz bir Groq anahtarı gerekir.");
    } else {
      yaz("ia-ornek-metin", "Timeline'da bir klip seç ve Altyazı oluştur'a bas.");
    }
    if (dugme) {
      dugme.hidden = d === "tamam";
      dugme.textContent = ornekModu ? "Örnekte dene" : (motorHazir ? "Altyazı oluştur'a git" : "Motoru kur");
      dugme.disabled = ornekSuruyor;
    }
  }

  function stilCiz(h) {
    var pro = proMu();
    yaz("ia-stil-metin", h.adimlar.stil === "tamam"
      ? "Stil adımı tamam. Stilleri her zaman aşağıdaki Stil kartından önizleyebilirsin."
      : "Creator Punch'ı kendi altyazınla önizle. Normal altyazı izi ücretsiz; animasyonlu stil katmanı " +
        (pro ? "Pro'da açık." : "Pro'dadır."));
    gorunur("ia-stil-dugmeler", h.adimlar.stil !== "tamam");
  }

  // Ücretsiz kullanıcıya Pro özellikleri "anahtarla çalışır" diye vaat edilmez (SO.aiMetni)
  function aiCiz(h) {
    yaz("ia-ai-metin", SO.aiMetni(proMu(), h.adimlar.ai === "tamam"));
    gorunur("ia-ai-ac", h.adimlar.ai !== "tamam");
  }

  // Bağlam şeridinin KARDEŞİ (şeridin innerHTML'i her yoklamada yeniden kuruluyor)
  function cipCiz(h, kartAcik) {
    var cip = el("onb-chip");
    if (!cip) return;
    if (kartAcik && !h.bitti) {
      cip.textContent = SO.ilerlemeMetni(h);
      cip.setAttribute("data-mod", "kurulum");
      cip.title = "İlk altyazı rehberine git";
      cip.hidden = false;
    } else if (kararDegeri === "cip" && !kayit.kapandi && !aiHazir()) {
      cip.textContent = "AI anahtarı · 1 dk";
      cip.setAttribute("data-mod", "anahtar");
      cip.title = "Yapay zekâ özelliklerini ücretsiz Groq anahtarıyla aç";
      cip.hidden = false;
    } else {
      cip.hidden = true;
    }
  }

  // Yapay zekâ düğmeleri tıklanabilir kalır (Pro kapısı önce çalışsın); anahtar
  // yoksa yanlarında sihirbazı açan küçük bir çip durur. Pro'ya bağlı düğmede (Çeviri,
  // Viral anlar, B-roll) ücretsiz kullanıcıya çip gösterilmez: anahtar onu açmaz.
  function cipleriGuncelle() {
    var anahtarYok = !aiHazir();
    AI_HEDEFLER.forEach(function (h) {
      var hedef = el(h.id);
      if (!hedef || !hedef.parentNode) return;
      var gerek = anahtarYok && ozellikAcik(h.ozellik);
      var cip = document.getElementById(h.id + "-anahtar");
      if (!cip) {
        if (!gerek) return;
        cip = document.createElement("button");
        cip.type = "button";
        cip.id = h.id + "-anahtar";
        cip.className = "onb-anahtar-cip";
        cip.textContent = "anahtar gerekli · 1 dk";
        cip.title = h.ozellik + " ücretsiz bir Groq anahtarıyla açılır";
        cip.addEventListener("click", function () { anahtarIste(h.ozellik, "cip"); });
        hedef.parentNode.insertBefore(cip, hedef.nextSibling);
      }
      cip.hidden = !gerek;
    });
  }

  function yenile() {
    if (!basladi) return;
    ciz();
    cipleriGuncelle();
  }

  /* ---------------- Adım eylemleri ---------------- */

  // Adım başlığı: sırayı beklemeden aç/kapat (ör. önce yapay zekâ anahtarı)
  function adimBasligi(ad) {
    acikAdim = acikAdim === ad ? "" : ad;
    ciz();
  }

  function adimTamam(ad) {
    if (kayit.adimlar[ad] === "tamam") return;
    kayit.adimlar[ad] = "tamam";
    kayitYaz();
    ciz();
  }

  // Başlığından açılmış ve hâlâ bekleyen bir adım varsa "Atla" onu, yoksa sıradakini atlar
  function adimiAtla() {
    var h = SO.adimlariHesapla(kayit, gercekler());
    var ad = SO.atlanacakAdim(h, acikAdim);
    if (!ad) return;
    if (ad === "stil") stilKapat();
    kayit.adimlar[ad] = "atlandi";
    if (acikAdim === ad) acikAdim = "";
    kayitYaz();
    durum("");
    ciz();
  }

  function kapat() {
    stilKapat();
    kayit.kapandi = true;
    kayitYaz();
    anahtarModalKapat();
    ciz();
    KApp.toast("Rehber kapandı. Ayarlar > Destek > Kurulum rehberini aç ile geri gelir.", "", 6000);
  }

  function rehberiAc() {
    kayit.kapandi = false;
    kayit.bitti = false;
    kayitYaz();
    kararDegeri = "tam";
    yenile();
    KApp.goster("captions");
    kaydir(el("ilk-adim"));
  }

  function cipTiklandi() {
    var cip = el("onb-chip");
    if (cip && cip.getAttribute("data-mod") === "anahtar") { anahtarIste("", "cip"); return; }
    KApp.goster("captions");
    kaydir(el("ilk-adim"));
  }

  // Rehber açıkken motor kurulumu (captions.js #cap-local-install, tıklamada okunur)
  // (kurulu cuBLAS motoru korunur; ffmpeg yalnız örnek klip varken arkaya bırakılır — SO.kurulumSecenekleri)
  function kurulumSecenekleri() {
    if (!rehberAcik() || kayit.bitti) return null;
    var secim = modelSecimi();
    if (secim.bulut) return null;
    kayit.model = secim.model;
    kayitYaz();
    return SO.kurulumSecenekleri({ model: secim.model, cudaKurulu: cudaKurulu(), ornekVar: !!ornekOku() });
  }

  // Örnek klip dosyalarını ayar klasörüne kopyala: güncelleme eklenti klasörünü
  // değiştirse de projedeki örnek medya çevrimdışı kalmaz. Whisper'a giden WAV
  // yolu KEngine.buildArgs içinde K.guvenliYol ile ASCII-güvenli yapılır.
  function ornekKopyala(o) {
    var hedef = K.path.join(K.path.dirname(K.settingsPath()), "onboarding");
    K.fs.mkdirSync(hedef, { recursive: true });
    var out = {};
    Object.keys(o.m.dosyalar).forEach(function (k) {
      var ad = o.m.dosyalar[k];
      var kaynak = K.path.join(o.kok, ad), dst = K.path.join(hedef, ad);
      var ayni = false;
      try { ayni = K.fs.statSync(dst).size === K.fs.statSync(kaynak).size; } catch (e) {}
      if (!ayni) K.fs.copyFileSync(kaynak, dst);
      out[k] = dst;
    });
    return out;
  }

  // Motor yokken 2. adım (kendi klibinle) kullanıcıyı 1. adımın kurulum kartına götürür
  function motoraGit() {
    KApp.goster("captions");
    acikAdim = "motor";
    ciz();
    kaydir(el("ia-motor"));
    var b = el("cap-local-install");
    if (b && b.focus && !b.disabled) { try { b.focus(); } catch (e) {} }
    durum("Önce motoru kur ya da ücretsiz anahtar gir; sonra kendi klibinden altyazı çıkar.");
  }

  function ilkAltyaziyaGit() {
    KApp.goster("captions");
    var go = el("cap-go");
    kaydir(go);
    if (go && go.focus) { try { go.focus(); } catch (e) {} }
    durum("Timeline'da konuşma içeren bir klip seç, sonra Altyazı oluştur'a bas.");
  }

  function sekansaUygulaVurgula() {
    var b = el("cap-apply");
    if (!b) return;
    b.classList.add("onb-vurgu");
    kaydir(b);
    setTimeout(function () { b.classList.remove("onb-vurgu"); }, 9000);
  }

  /*
   * TIKLAMA: örnek klibi Premiere'e al (KS_importSample), altyazısını çıkar.
   * Motor ya da anahtar yoksa elle doğrulanmış hazır transkript yüklenir.
   */
  async function ornekDeneTikla() {
    if (ornekSuruyor) return;
    var o = ornekOku();
    if (!o) {
      if (SO.adimlariHesapla(kayit, gercekler()).adimlar.motor !== "tamam") motoraGit();
      else ilkAltyaziyaGit();
      return;
    }
    ornekSuruyor = true;
    var dugme = el("ia-ornek-dene");
    if (dugme) dugme.disabled = true;
    try {
      durum("Örnek klip hazırlanıyor…");
      var yerel = ornekKopyala(o);
      var veri = SO.ornekKelimeleri(JSON.parse(K.fs.readFileSync(yerel.words, "utf8")));
      durum("Örnek klip projene alınıyor…");
      var r = await K.call("KS_importSample", { path: yerel.video, seqName: o.m.sekans }, 60000);
      if (!r || !r.ok) throw new Error(SO.ornekHataMetni(r));
      KApp.pollNow();
      var sonuc = SO.ornekSonucu(r);
      if (sonuc === "ac") {
        // Sekans var ama açılamadı (modal pencere vb.): altyazı çıkarılmaz, yoksa
        // "Normal altyazı izi ekle" örneği kullanıcının açık sekansına koyardı
        durum("\"" + o.m.sekans + "\" sekansı açılamadı. Proje panelinde ona çift tıkla, sonra tekrar dene.", "warn");
        return;
      }
      // uygula yalnız örneğin kendi sekansına (bilinmiyorsa — sürükleme — koruma yok)
      if (KCaptions.ornekHedefi) KCaptions.ornekHedefi(sonuc === "hazir" ? r.sequenceId : "");
      var offset = Number(r.offset) || 0;
      var basarili = false;
      if (KCaptions.engineReady()) {
        durum("Örnek klibin altyazısı çıkarılıyor…");
        basarili = await KCaptions.go({ ornek: { wav: yerel.wav, mp3: yerel.mp3 || "", lang: o.m.lang, offset: offset, sure: o.m.sure } });
      } else {
        basarili = KCaptions.ornekYukle(veri, offset);
        if (basarili) KApp.toast("Örnek transkript yüklendi. Motoru kurunca kendi kliplerinden de böyle çıkar.", "good", 7000);
      }
      if (basarili) {
        adimTamam("ornek");
        if (sonuc === "surukle") {
          // sekans kurulamadı: uygula düğmesi vurgulanmaz (açık sekans kullanıcınınki olabilir)
          durum("Klibi Yeni Öğe simgesine sürükle; sekans açılınca \"Normal altyazı izi ekle\"ye bas.", "warn");
        } else {
          durum("Altyazın hazır. \"Normal altyazı izi ekle\" ile sekansa uygula — ücretsiz.", "good");
          sekansaUygulaVurgula();
        }
      } else if (r.needsDrag) {
        durum("Klibi Yeni Öğe simgesine sürükle, sonra tekrar dene.", "warn");
      } else {
        durum("");
      }
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      ornekSuruyor = false;
      if (dugme) dugme.disabled = false;
    }
  }

  /* ---------------- Stil adımı ---------------- */

  /*
   * Önizleme öncesi görünüm (stilYedek) bellekte VE kayıtta (settings.onboarding.stilYedek)
   * durur: deneme sürerken panel kapanırsa bir sonraki açılışta geri konur — ücretsiz
   * kullanıcının varsayılanı sessizce Pro stiline dönmesin. Hangi dokunuşun bilinçli seçim
   * sayılıp yedeği bıraktığına SO.stilDokunusuSecimMi karar verir: ücretsiz kullanıcıda
   * kart dokunuşları önizlemedir (adım kapanınca geri alınır); Pro kullanıcıda kilitsiz
   * bir kartı seçmek ya da bir görünüm ayarını değiştirmek seçimdir.
   */
  function stilYedekAyarla(y) {
    stilYedek = y || null;
    if (stilYedek && SO.stilYedegiGecerli(stilYedek)) kayit.stilYedek = stilYedek;
    else delete kayit.stilYedek;
    kayitYaz();
  }

  function stilGoster() {
    if (!stilYedek) stilYedekAyarla(KCaptions.stilYedegi());
    KApp.goster("captions");
    stilDeneniyor = true;
    try { KCaptions.stilDene(STIL_ORNEGI); } finally { stilDeneniyor = false; }
    if (!KCaptions.hasSegments()) durum("Creator Punch önizleniyor. Altyazın çıkınca kendi satırlarınla oynar.");
    else if (proMu()) durum("Creator Punch kendi altyazınla oynuyor. Beğendiğin karta dokun; seçtiğin stil kalır.");
    else durum("Creator Punch kendi altyazınla oynuyor. Diğer kartlara dokunarak da önizleyebilirsin; \"Tamam\" deyince önceki görünümün geri gelir.");
  }

  // Adım kapanınca önceki görünüm geri gelir (kullanıcı kendisi bir seçim yaptıysa o kalır)
  function stilKapat() {
    if (!stilYedek) return;
    var y = stilYedek;
    stilYedekAyarla(null);
    try { KCaptions.stilYedeginiYukle(y); } catch (e) { K.log("[rehber] stil geri yuklenemedi: " + (e && e.message)); }
  }

  // Stil ızgarasında tıklama: kartın kendi işleyicisinden SONRA (kabarcık evresi) bakılır,
  // böylece seçimin gerçekten o karta geçip geçmediği (.secili) bilinir
  function stilIzgarasiTiklandi(e) {
    if (!stilYedek || stilDeneniyor) return;
    var t = SO.stilTiklamasi(e && e.target, el("cap-stil-grid"));
    t.tur = "kart";
    t.pro = proMu();
    if (SO.stilDokunusuSecimMi(t)) stilYedekAyarla(null);   // bilinçli seçim: geri yükleme yok
  }

  function stilAyariDegisti(id) {
    if (!stilYedek || stilDeneniyor) return;
    if (SO.stilDokunusuSecimMi({ tur: "ayar", pro: proMu(), id: id })) stilYedekAyarla(null);
  }

  function stilTamam() {
    stilKapat();
    adimTamam("stil");
    durum("");
  }

  /*
   * TIKLAMA: stilli katmanı timeline'a koy (Pro overlay).
   * Seçili bir stil varsa (önizlenen Creator Punch, kullanıcının sonradan dokunduğu kart
   * ya da daha önce kaydettiği stil) O uygulanır; hiç stil yoksa Creator Punch önizlenip konur.
   * Ücretsizde Suflo Stili, Altyazı sekmesindeki "… ile ekle" gibi stilli katman deneme hakkıyla
   * (filigranlı) konur: pencere "Ücretsiz dene" sunar, kurulunca bu tıklama yeniden çalışır.
   * Seçili stil bir MOGRT ise kütüphane penceresi (deneme yok).
   */
  function stilKoyTikla() {
    if (!KCaptions.hasSegments()) { KApp.toast("Önce altyazı oluştur ya da örnekte dene.", "warn"); return; }
    if (!proMu()) {
      if (!window.Pro || !Pro.gate) return;
      if (KCaptions.mogrtSecili && KCaptions.mogrtSecili()) { Pro.gate("captionStyles"); return; }
      // Pencere kapatılırsa önizleme yedeği kalır: "Tamam" önceki görünümü yine geri getirir
      if (!Pro.gate("overlay", { deneme: true, yeniden: stilKoyTikla })) return;
    }
    var secili = KCaptions.stilSecili ? KCaptions.stilSecili() : !!stilYedek;
    if (!secili) stilGoster();
    if (stilYedek) stilYedekAyarla(null);   // kullanıcı bu stili bilerek kullandı: geri yükleme yok
    Promise.resolve(KCaptions.applyStyled()).then(function () { adimTamam("stil"); });
  }

  /* ---------------- Daha doğru model / GPU (ilk altyazıdan sonra) ---------------- */

  function turboKur() {
    var b = el("ia-turbo");
    if (b) b.disabled = true;
    KEngine.installModel("turbo", function (m) { durum(m); }).then(function () {
      var s = K.settings();
      var yeni = SO.modelGecisi(s.model, kayit.model || SO.ONBOARDING_MODELI, "turbo");
      if (yeni) {
        s.model = yeni;
        K.saveSettings();
        KApp.toast("Turbo hazır: sonraki altyazılar daha doğru.", "good");
      } else {
        KApp.toast("Turbo indi; seçtiğin model değişmedi (Ayarlar > Doğruluk modeli).", "good");
      }
      durum("");
      KCaptions.refreshSetup();
      KCaptions.ayarDegisti("model");
    }, function (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    }).then(function () {
      if (b) b.disabled = false;
      ciz();
    });
  }

  function cublasKur() {
    var m = null;
    try { m = KEngine.activeModel(); } catch (e) {}
    KApp.installLocalWhisper(el("ia-cublas"), { modelId: m ? m.id : (K.settings().model || SO.ONBOARDING_MODELI), useGpu: true })
      .then(function () { ciz(); });
  }

  /* ---------------- Yapay zekâ anahtarı sihirbazı ---------------- */

  function modalDurum(metin, sinif) {
    var d = el("onb-anahtar-durum");
    if (!d) return;
    d.className = "inline-status" + (sinif ? " " + sinif : "");
    d.textContent = metin || "";
  }

  // AI düğmeleri anahtar yoksa bunu çağırır (eski "Ayarlar'dan gir" bildiriminin yerine)
  function anahtarIste(ozellik, baglam) {
    var modal = el("onb-anahtar");
    if (!basladi || !modal) {
      KApp.toast(ozellik ? ozellik + " için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir."
        : "Yapay zekâ özellikleri için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad");
      return;
    }
    anahtarOzellik = String(ozellik || "");
    yaz("onb-anahtar-neden", anahtarOzellik && ozellikAcik(anahtarOzellik)
      ? anahtarOzellik + " ücretsiz bir Groq anahtarıyla çalışır. Bir kez bağlaman yeter."
      : SO.aiMetni(proMu(), false));
    /*
     * Yerel motor hazır değilken kaydedilen anahtar bulut motorunu da açar (anahtarKaydet
     * sağlayıcıyı Groq yapar): sonraki "Altyazı oluştur"da ses Groq'a gider. Hangi
     * düğmeden gelinirse gelinsin bu açıkça söylenir.
     */
    var bulut = baglam === "motor";
    try { if (KCaptions.anahtarSesiBulutaGonderir) bulut = bulut || KCaptions.anahtarSesiBulutaGonderir(); } catch (eB) {}
    gorunur("onb-anahtar-onay", bulut);
    modalDurum("");
    modal.hidden = false;
    var girdi = el("onb-anahtar-girdi");
    if (girdi) { try { girdi.focus(); } catch (e) {} }
  }

  function anahtarModalKapat() {
    var modal = el("onb-anahtar");
    if (modal) modal.hidden = true;
    var girdi = el("onb-anahtar-girdi");
    if (girdi) girdi.value = "";
    anahtarOzellik = "";
  }

  // Panodan yalnız TIKLAMAYLA okunur; anahtar hiçbir yere günlüklenmez
  async function panodanAl() {
    if (!K.nodeOK) { modalDurum("Pano bu ortamda okunamıyor; anahtarı elle yapıştır (Ctrl+V).", "warn"); return; }
    var r = K.MAC
      ? await K.run("/usr/bin/pbpaste", [], { timeout: 8000 })
      : await K.run("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard"], { timeout: 15000 });
    var anahtar = SO.anahtarAyikla(r && r.code === 0 ? r.stdout : "");
    if (!anahtar) { modalDurum("Panoda Groq anahtarı bulunamadı. Groq'ta anahtarı kopyalayıp tekrar dene.", "warn"); return; }
    var girdi = el("onb-anahtar-girdi");
    if (girdi) girdi.value = anahtar;
    modalDurum("Anahtar panodan alındı. Doğrula ve kaydet'e bas.", "good");
  }

  async function anahtariDogrula() {
    if (dogrulaniyor) return;
    var girdi = el("onb-anahtar-girdi");
    var anahtar = SO.anahtarAyikla(girdi ? girdi.value : "");
    if (!anahtar) {
      modalDurum("Bu bir Groq anahtarına benzemiyor. Anahtar gsk_ ile başlar; tamamını kopyaladığından emin ol.", "bad");
      return;
    }
    if (girdi) girdi.value = anahtar;
    dogrulaniyor = true;
    var kaydetBtn = el("onb-anahtar-kaydet");
    if (kaydetBtn) kaydetBtn.disabled = true;
    modalDurum("Anahtar doğrulanıyor…");
    var r = null;
    try { r = await K.httpGet(GROQ_DOGRULAMA, { "Authorization": "Bearer " + anahtar }); } catch (e) { r = null; }
    var sonuc = SO.anahtarSonucu(r ? r.status : 0);
    dogrulaniyor = false;
    if (kaydetBtn) kaydetBtn.disabled = false;
    if (!sonuc.kaydet) {
      modalDurum("Groq bu anahtarı kabul etmedi (geçersiz ya da silinmiş). Groq'ta yeni bir anahtar oluşturup tekrar yapıştır.", "bad");
      return;
    }
    var ozellik = anahtarOzellik;
    KCaptions.anahtarKaydet(anahtar, { saglayici: "groq" });
    K.log("[rehber] AI anahtari kaydedildi (" + sonuc.durum + ")");
    var mesaj = sonuc.durum === "ok" ? "Anahtar doğrulandı ve kaydedildi ✓"
      : (sonuc.durum === "limit" ? "Anahtar geçerli ve kaydedildi. Groq şu an yoğun; birkaç saniye sonra dene."
        : "İnternete ulaşılamadı; anahtar doğrulanamadı ama kaydedildi. Bağlantı gelince çalışır.");
    anahtarModalKapat();
    KApp.toast(mesaj + (ozellik && ozellikAcik(ozellik) ? " · " + ozellik + " şimdi çalışır, düğmeye tekrar bas." : ""),
      sonuc.durum === "ok" ? "good" : "warn", 8000);
    yenile();
  }

  /* ---------------- Olaylar + başlat ---------------- */

  function tikla(id, fn) {
    var e = el(id);
    if (e) e.addEventListener("click", fn);
  }

  function olaylariBagla() {
    tikla("ilk-adim-kapat", kapat);
    // başlıklar <button>: fare, Enter ve Boşluk aynı "click"i üretir
    SO.ADIMLAR.forEach(function (ad) {
      var bas = el("ia-" + ad + "-bas");
      if (bas) bas.addEventListener("click", function () { adimBasligi(ad); });
    });
    tikla("ilk-adim-atla", adimiAtla);
    tikla("ia-dil-tr", function () { dilSec("tr"); });
    tikla("ia-dil-en", function () { dilSec("en"); });
    tikla("ia-motor-bulut", function () { anahtarIste("", "motor"); });
    tikla("ia-ornek-dene", ornekDeneTikla);
    tikla("ia-stil-goster", stilGoster);
    tikla("ia-stil-koy", stilKoyTikla);
    tikla("ia-stil-tamam", stilTamam);
    tikla("ia-ai-ac", function () { anahtarIste("", "rehber"); });
    tikla("ia-turbo", turboKur);
    tikla("ia-cublas", cublasKur);
    tikla("onb-chip", cipTiklandi);
    tikla("set-onb-ac", rehberiAc);

    tikla("onb-anahtar-kapat", anahtarModalKapat);
    tikla("onb-anahtar-al", function () { K.cs.openURLInDefaultBrowser(GROQ_ANAHTAR_SAYFASI); });
    tikla("onb-anahtar-pano", panodanAl);
    tikla("onb-anahtar-kaydet", anahtariDogrula);
    var modal = el("onb-anahtar");
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) anahtarModalKapat(); });
    var girdi = el("onb-anahtar-girdi");
    if (girdi) girdi.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); anahtariDogrula(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modal && !modal.hidden) { e.preventDefault(); anahtarModalKapat(); }
    });

    // Stil kartına ya da görünüm ayarına dokunuş bilinçli seçim mi (SO.stilDokunusuSecimMi)?
    // stilDene değerleri koddan yazar, olay üretmez. Izgara dinleyicisi kabarcık evresinde:
    // kartın kendi işleyicisi seçimi yaptıktan sonra çalışır.
    var grid = el("cap-stil-grid");
    if (grid) grid.addEventListener("click", stilIzgarasiTiklandi);
    var kontroller = window.KCaptions && KCaptions.stilKontrolleri ? KCaptions.stilKontrolleri() : [];
    kontroller.forEach(function (id) {
      var k = el(id);
      if (!k) return;
      var degisti = function () { stilAyariDegisti(id); };
      k.addEventListener("change", degisti);
      k.addEventListener("input", degisti);
    });

    document.addEventListener("suflo:ayar", yenile);
    if (window.KCaptions && KCaptions.onSonuc) {
      KCaptions.onSonuc(function () {
        if (!basladi) return;
        // kayıt yalnız rehber tam kartken yazılır (varlığı "rehber sürüyor" demektir)
        if (kararDegeri === "tam" && kayit.adimlar.ornek !== "tamam") { kayit.adimlar.ornek = "tamam"; kayitYaz(); }
        yenile();
      });
    }
    // Pro durumu değişince metinler ve Pro'ya bağlı düğmelerin çipleri de tazelensin
    if (window.Pro && Pro.on) Pro.on(function () { if (basladi) yenile(); });
  }

  function init() {
    if (basladi || !SO || !window.K) return;
    var s = K.settings();
    var tazeKurulum = K.ayarDosyasiVardi ? !K.ayarDosyasiVardi() : false;
    kayit = SO.kayitDuzelt(s.onboarding);
    kararDegeri = kararVer();
    basladi = true;
    // Önceki oturum stil denemesi sürerken kapandı: önceki görünümü geri koy
    if (kayit.stilYedek) {
      stilYedek = kayit.stilYedek;
      stilKapat();
    }
    if (kararDegeri === "tam") {
      // Taze kurulumda "Suflo 3.1'de yeni" penceresi rehberin üstüne binmesin
      if (tazeKurulum) s.yeniliklerGoruldu = KApp.yenilikSurumu ? KApp.yenilikSurumu() : "3.1";
      kayitYaz();
    }
    olaylariBagla();
    yenile();
  }

  return {
    init: init,
    yenile: yenile,
    karar: function () { return kararDegeri; },
    anahtarIste: anahtarIste,
    kurulumSecenekleri: kurulumSecenekleri,
    ac: rehberiAc
  };
})();
