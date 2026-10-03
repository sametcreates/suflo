/*
 * Suflo — "İlk altyazın 2 dakikada" (ilk açılış rehberi)
 *
 * Altyazı sekmesinin üstündeki #ilk-adim kartı dört adım yürütür:
 *   1 Motor  dile uygun küçük model (Türkçe: Small 190 MB), ffmpeg arkada
 *   2 Örnek  15 sn'lik Türkçe örnek klip projeye alınır, altyazısı çıkar
 *            (örnek dosyalar yoksa: "kendi klibinle ilk altyazı")
 *   3 Stil   Creator Punch kendi altyazınla önizlenir (tercih geri yüklenir)
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
  var stilYedek = null;      // stil adımı açıkken önceki altyazı görünümü
  var stilDeneniyor = false;
  var anahtarOzellik = "";
  var dogrulaniyor = false;
  var ornekSuruyor = false;
  var setupYeri = null;      // #cap-setup'ın kart dışındaki asıl yeri
  var acikAdim = "";         // kullanıcının başlığına tıklayıp açtığı adım (sırayı beklemeden)

  // Anahtar isteyen yapay zekâ düğmeleri: yanlarına "anahtar gerekli · 1 dk" çipi
  var AI_HEDEFLER = [
    { id: "cap-proofread", ozellik: "AI metin kontrolü" },
    { id: "cap-translate-go", ozellik: "Çeviri" },
    { id: "cap-ch-ai", ozellik: "AI bölüm başlıkları" },
    { id: "cap-yt-go", ozellik: "Paylaşım metni" },
    { id: "cap-vr-bul", ozellik: "Viral anlar" },
    { id: "cap-br-bul", ozellik: "B-roll önerileri" },
    { id: "kanca-ai", ozellik: "Kanca önerileri" }
  ];

  /* ---------------- Gerçekler (yalnız Node) ---------------- */

  function modelVar() {
    try { return !!(window.KEngine && KEngine.activeModel() && K.whisperLocal()); } catch (e) { return false; }
  }
  function anahtarVar() { return !!String(K.settings().apiKey || "").trim(); }
  function aiHazir() {
    try { return !!(window.KCaptions && KCaptions.chatConfig && KCaptions.chatConfig()); } catch (e) { return anahtarVar(); }
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

  // Tek kurulum kartı: rehber açıkken #cap-setup motor adımının içine taşınır
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
    setupYerlestir(acik);
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
      li.className = "ia-adim " + (d === "tamam" ? "tamam" : (d === "atlandi" ? "atlandi" : (h.siradaki === ad ? "aktif" : "bekliyor"))) +
        (acikAdim === ad ? " acik" : "");
      yaz("ia-" + ad + "-rozet", d === "tamam" ? "✓" : (d === "atlandi" ? "atlandı" : ""));
    });
    motorCiz(h);
    ornekCiz(h);
    stilCiz(h);
    aiCiz(h);
    gorunur("ilk-adim-atla", !!h.siradaki);
  }

  function motorCiz(h) {
    var hazir = h.adimlar.motor === "tamam";
    var secim = modelSecimi();
    var aktif = null;
    try { aktif = window.KEngine ? KEngine.activeModel() : null; } catch (e) {}
    if (hazir) {
      yaz("ia-motor-metin", aktif
        ? "Hazır: " + aktif.label.split(" —")[0] + " · yerel, çevrimdışı ve sınırsız."
        : "Hazır: Groq bulut motoru (ücretsiz anahtarla).");
    } else if (secim.bulut) {
      yaz("ia-motor-metin", "Mac'te yerel motor Homebrew ile kurulur ve Homebrew bulunamadı. En hızlı başlangıç: ücretsiz Groq anahtarıyla bulut motoru.");
    } else {
      yaz("ia-motor-metin", (secim.model === "base" ? "Base" : "Small") + " modeli (" + secim.sizeMB +
        " MB) iner; ffmpeg arkada kurulur. Hesap, abonelik ya da kredi yok.");
    }
    gorunur("ia-motor-bulut", !hazir && !!secim.bulut);

    // İlk altyazıdan SONRA isteğe bağlı: daha doğru model ve NVIDIA hızlandırma
    var ilkSonra = h.adimlar.ornek === "tamam" && hazir && !!aktif;
    var turboVar = false;
    try { turboVar = KEngine.installedModels().some(function (m) { return m.id === "turbo" || m.id === "large"; }); } catch (eT) {}
    var gpu = null;
    try { gpu = KEngine.gpuInfo(); } catch (eG) {}
    var cudaYok = !!(gpu && gpu.kind === "cuda" && KEngine.installedBuild() !== "cuda");
    var ekVar = ilkSonra && (!turboVar || cudaYok);
    gorunur("ia-turbo", ilkSonra && !turboVar);
    gorunur("ia-cublas", ilkSonra && cudaYok);
    gorunur("ia-motor-ek", ekVar);
    // tamamlanmış motor adımı kapalı durur; "Daha doğru model" varsa açık kalsın
    var li = el("ia-motor");
    if (li) li.classList.toggle("acik", ekVar || acikAdim === "motor");
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
    } else {
      yaz("ia-ornek-metin", "Timeline'da bir klip seç ve Altyazı oluştur'a bas.");
    }
    if (dugme) {
      dugme.hidden = d === "tamam";
      dugme.textContent = ornekModu ? "Örnekte dene" : "Altyazı oluştur'a git";
      dugme.disabled = ornekSuruyor;
    }
  }

  function stilCiz(h) {
    var pro = !!(window.Pro && Pro.isPro && Pro.isPro());
    yaz("ia-stil-metin", h.adimlar.stil === "tamam"
      ? "Stil adımı tamam. Stilleri her zaman aşağıdaki Stil kartından önizleyebilirsin."
      : "Creator Punch'ı kendi altyazınla önizle. Normal altyazı izi ücretsiz; animasyonlu stil katmanı " +
        (pro ? "Pro'da açık." : "Pro'dadır."));
    gorunur("ia-stil-dugmeler", h.adimlar.stil !== "tamam");
  }

  function aiCiz(h) {
    yaz("ia-ai-metin", h.adimlar.ai === "tamam"
      ? "Yapay zekâ açık: çeviri, AI metin kontrolü, viral anlar ve bölüm başlıkları hazır."
      : "Çeviri, AI metin kontrolü, viral anlar, bölüm başlıkları ve paylaşım metni ücretsiz bir Groq anahtarıyla çalışır.");
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
  // yoksa yanlarında sihirbazı açan küçük bir çip durur
  function cipleriGuncelle() {
    var gerek = !aiHazir();
    AI_HEDEFLER.forEach(function (h) {
      var hedef = el(h.id);
      if (!hedef || !hedef.parentNode) return;
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

  function adimiAtla() {
    var h = SO.adimlariHesapla(kayit, gercekler());
    if (!h.siradaki) return;
    if (h.siradaki === "stil") stilKapat();
    kayit.adimlar[h.siradaki] = "atlandi";
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
  function kurulumSecenekleri() {
    if (!rehberAcik() || kayit.bitti) return null;
    var secim = modelSecimi();
    if (secim.bulut) return null;
    kayit.model = secim.model;
    kayitYaz();
    return { modelId: secim.model, useGpu: false, ffmpegArkada: true };
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
    if (!o) { ilkAltyaziyaGit(); return; }
    ornekSuruyor = true;
    var dugme = el("ia-ornek-dene");
    if (dugme) dugme.disabled = true;
    try {
      durum("Örnek klip hazırlanıyor…");
      var yerel = ornekKopyala(o);
      var veri = SO.ornekKelimeleri(JSON.parse(K.fs.readFileSync(yerel.words, "utf8")));
      durum("Örnek klip projene alınıyor…");
      var r = await K.call("KS_importSample", { path: yerel.video, seqName: o.m.sekans }, 60000);
      if (!r || !r.ok) throw new Error(r && r.error ? r.error : "Premiere örnek klibi alamadı.");
      KApp.pollNow();
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
        durum(r.needsDrag
          ? "Klibi Yeni Öğe simgesine sürükle; sekans açılınca \"Normal altyazı izi ekle\"ye bas."
          : "Altyazın hazır. \"Normal altyazı izi ekle\" ile sekansa uygula — ücretsiz.", r.needsDrag ? "warn" : "good");
        sekansaUygulaVurgula();
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

  function stilGoster() {
    if (!stilYedek) stilYedek = KCaptions.stilYedegi();
    KApp.goster("captions");
    stilDeneniyor = true;
    try { KCaptions.stilDene(STIL_ORNEGI); } finally { stilDeneniyor = false; }
    durum(KCaptions.hasSegments()
      ? "Creator Punch kendi altyazınla oynuyor. Diğer kartlara dokunarak da önizleyebilirsin."
      : "Creator Punch önizleniyor. Altyazın çıkınca kendi satırlarınla oynar.");
  }

  // Adım kapanınca önceki görünüm geri gelir (kullanıcı kendisi bir karta bastıysa o seçim kalır)
  function stilKapat() {
    if (!stilYedek) return;
    var y = stilYedek;
    stilYedek = null;
    try { KCaptions.stilYedeginiYukle(y); } catch (e) { K.log("[rehber] stil geri yuklenemedi: " + (e && e.message)); }
  }

  function stilTamam() {
    stilKapat();
    adimTamam("stil");
    durum("");
  }

  // TIKLAMA: stilli katmanı timeline'a koy (Pro overlay; ücretsizde satış penceresi)
  function stilKoyTikla() {
    if (!(window.Pro && Pro.isPro && Pro.isPro())) {
      if (window.Pro && Pro.gate) Pro.gate("captionStyles");
      return;
    }
    if (!KCaptions.hasSegments()) { KApp.toast("Önce altyazı oluştur ya da örnekte dene.", "warn"); return; }
    if (!stilYedek) stilGoster();
    stilYedek = null;   // kullanıcı bu stili bilerek kullandı: geri yükleme yok
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
    yaz("onb-anahtar-neden", anahtarOzellik
      ? anahtarOzellik + " ücretsiz bir Groq anahtarıyla çalışır. Bir kez bağla, tüm yapay zekâ özellikleri açılsın."
      : "Çeviri, AI metin kontrolü, viral anlar, bölüm başlıkları ve paylaşım metni ücretsiz bir Groq anahtarıyla çalışır.");
    // Bulut motoru (Mac'te Homebrew yokken): ses Groq'a gider — açıkça söylenir
    gorunur("onb-anahtar-onay", baglam === "motor");
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
    KApp.toast(mesaj + (ozellik ? " · " + ozellik + " şimdi çalışır, düğmeye tekrar bas." : ""),
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
    SO.ADIMLAR.forEach(function (ad) {
      var li = el("ia-" + ad);
      var bas = li && li.querySelector ? li.querySelector(".ia-adim-bas") : null;
      if (bas) bas.addEventListener("click", function () { adimBasligi(ad); });
    });
    tikla("ilk-adim-atla", adimiAtla);
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

    // Kullanıcı stil kartına KENDİSİ dokunursa bu bilinçli seçimdir: geri yükleme yapılmaz
    var grid = el("cap-stil-grid");
    if (grid) grid.addEventListener("click", function () {
      if (stilYedek && !stilDeneniyor) stilYedek = null;
    }, true);

    document.addEventListener("suflo:ayar", yenile);
    if (window.KCaptions && KCaptions.onSonuc) {
      KCaptions.onSonuc(function () {
        if (!basladi) return;
        if (kayit.adimlar.ornek !== "tamam") { kayit.adimlar.ornek = "tamam"; kayitYaz(); }
        yenile();
      });
    }
    if (window.Pro && Pro.on) Pro.on(function () { if (basladi) ciz(); });
  }

  function init() {
    if (basladi || !SO || !window.K) return;
    var s = K.settings();
    var tazeKurulum = K.ayarDosyasiVardi ? !K.ayarDosyasiVardi() : false;
    kayit = SO.kayitDuzelt(s.onboarding);
    kararDegeri = kararVer();
    basladi = true;
    if (kararDegeri === "tam") {
      // Taze kurulumda "Suflo 3.0'da yeni" penceresi rehberin üstüne binmesin
      if (tazeKurulum) s.yeniliklerGoruldu = KApp.yenilikSurumu ? KApp.yenilikSurumu() : "3.0";
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
