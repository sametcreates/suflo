/*
 * Suflo — Davet et, kazan (panel denetleyicisi)
 *
 * Ayarlar'daki #grp-davet kartı, işin bittiği mutlu anda çıkan #davet-bar şeridi ve
 * Pro etkinleşince bir kez sorulan "Bizi nereden duydun?". Mantık js/referral-core.js'te
 * (saf, testli); burada yalnız DOM, pano, tarayıcı ve sunucu çağrısı var.
 *
 *  - Pro sahibi + sunucudan kod: kod, Kopyala, WhatsApp, X, Instagram (yalnız kopyala),
 *    Story kartı (1080x1920 PNG, masaüstüne) ve "2/3 davet" ilerlemesi.
 *  - Ücretsiz kullanıcı ya da sunucu kodu yok (sunucu kapalı / eski sunucu / ağ yok):
 *    "Suflo'yu paylaş" ve kişisel bilgi taşımayan ?ref= bağlantısı.
 * Şerit asla modal değildir; iş sürerken ve yıldız şeridi açıkken çıkmaz.
 */
window.KDavet = (function () {
  "use strict";

  var R = window.SufloReferral;
  var YENILEME_MS = 6 * 3600 * 1000;   // sunucudaki kod/sayac en sik 6 saatte bir sorulur
  var ISTEK_MS = 15000;
  var ORTAKLIK_URL = "https://suflo.app/ortaklik.html";
  var KAYNAKLAR = ["youtube", "instagram", "tiktok", "arkadas", "kod", "google", "diger"];
  var istekte = false, storyMesgul = false, sonDeneme = 0;

  function el(id) { return document.getElementById(id); }
  function ayar() { return K.settings(); }
  function kaydet() { try { K.saveSettings(); } catch (e) {} }
  function toast(m, t, s) { if (window.KApp && KApp.toast) KApp.toast(m, t, s); }
  function proMu() { return !!(window.Pro && Pro.isPro && Pro.isPro()); }
  // Paylasim metni arayuz dilinde (İngilizce arayuz 5. maddede baglanir)
  function dil() { return window.SufloI18n && SufloI18n.getLang ? SufloI18n.getLang() : "tr"; }

  function durum(msg, cls) {
    var e = el("davet-durum");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  // Ucretsiz paylasim baglantisinin kimligi: rastgele, makine kimligiyle iliskisiz
  function refId() {
    var s = ayar();
    if (!R.isValidRefId(s.davetRefId)) { s.davetRefId = R.newRefId(); kaydet(); }
    return s.davetRefId;
  }

  // Onbellek hangi lisansa ait: anahtarin kendisi degil, kisa ozeti saklanir
  function lisansIzi(anahtar) {
    var t = String(anahtar || "");
    if (!t) return "";
    try { return require("crypto").createHash("sha256").update("suflo-davet:" + t).digest("hex").slice(0, 16); } catch (e) {}
    var h = 5381;
    for (var i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return "d" + h.toString(16);
  }
  function guncelIz() {
    var c = window.Pro && Pro.contentCredentials ? Pro.contentCredentials() : null;
    return c ? lisansIzi(c.licenseKey) : "";
  }

  // Sunucudan alinmis gecerli kod (yalniz Pro iken ve ayni lisans icin gosterilir)
  function sunucuKodu() {
    var d = ayar().davetKod;
    if (!proMu() || !d || !R.isValidCode(d.kod)) return null;
    if (d.iz !== guncelIz()) return null;   // baska bir lisansin kodu
    return d;
  }

  function metin(kanal) {
    var d = sunucuKodu();
    // baglanti her zaman koddan kurulur: sunucunun gonderdigi adrese kor guvenilmez
    if (d) return R.shareText(dil(), kanal, { code: d.kod, link: R.shareUrl(d.kod), percent: d.yuzde });
    return R.shareText(dil(), kanal, { link: R.freeRefUrl(refId()) });
  }

  function panoya(txt, mesaj) {
    function bitti() { toast(mesaj, "good", 6000); }
    function yedek() {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      bitti();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(bitti).catch(yedek);
    else yedek();
  }

  function tarayicida(url) {
    if (!url) return;
    try { K.cs.openURLInDefaultBrowser(url); } catch (e) { try { window.open(url, "_blank"); } catch (e2) {} }
  }

  /* ---------------- Kart ---------------- */

  function ciz() {
    if (!el("grp-davet")) return;
    var d = sunucuKodu();
    el("davet-kodlu").hidden = !d;
    el("davet-serbest").hidden = !!d;
    if (d) {
      el("davet-kod").textContent = d.kod;
      var il = R.ilerleme(d.sayi, dil());
      el("davet-ilerleme-metin").textContent = il.metin;
      el("davet-odul").textContent = il.odul;
      el("davet-bar-dolu").style.width = Math.round(il.oran * 100) + "%";
      var dolu = el("davet-ilerleme");
      if (dolu) dolu.setAttribute("aria-label", il.metin);
      // libass'siz ffmpeg Story kartini cizemez: dugmeyi hic gosterme
      el("davet-story").hidden = !!(K.libassUyarisi && K.libassUyarisi());
    } else {
      el("davet-link").value = R.freeRefUrl(refId());
      el("davet-serbest-not").textContent = proMu()
        ? "Kişisel indirim kodun hazır olunca burada görünür. Şimdilik bu bağlantıyı paylaş."
        : "Bağlantı yalnız kimden geldiğini gösterir, kişisel bilgi taşımaz.";
    }
    var girSar = el("davet-girilen-sar");
    if (girSar) girSar.hidden = proMu();
    var gir = el("davet-girilen");
    if (gir && document.activeElement !== gir) gir.value = R.isValidCode(ayar().davetGirilenKod) ? ayar().davetGirilenKod : "";
  }

  /* ---------------- Sunucu ---------------- */

  function endpoint() {
    return window.ProSync && ProSync.endpoint ? ProSync.endpoint() : "https://assets.suflo.app/pro/v1/index.php";
  }

  // JSON POST, en gec 15 sn: sonuc { status, json }
  function istek(govde) {
    return new Promise(function (resolve) {
      var bitti = false;
      function son(v) { if (!bitti) { bitti = true; resolve(v); } }
      setTimeout(function () { son({ status: 0, json: null }); }, ISTEK_MS);
      if (!K.nodeOK || !K.httpJson) { son({ status: 0, json: null }); return; }
      K.httpJson(endpoint(), { "User-Agent": "Suflo-Davet/" + K.VERSION, "Accept": "application/json" }, govde).then(function (r) {
        var j = null;
        try { j = JSON.parse(r && r.body); } catch (e) {}
        son({ status: Number(r && r.status) || 0, json: j });
      }, function () { son({ status: 0, json: null }); });
    });
  }

  /*
   * Pro sahibinin kodunu ve davet sayisini al. Sunucu davet sistemini henuz acmadiysa
   * (503), eski sunucuysa (400) ya da ag yoksa sessizce ucretsiz paylasima duser;
   * daha once alinmis kod korunur.
   */
  function kodGetir(zorla) {
    if (istekte || !proMu() || !K.nodeOK) return Promise.resolve(false);
    var creds = Pro.contentCredentials && Pro.contentCredentials();
    if (!creds) return Promise.resolve(false);
    var iz = lisansIzi(creds.licenseKey);
    var s = ayar(), d = s.davetKod && s.davetKod.iz === iz ? s.davetKod : null, simdi = Date.now();
    var alindi = d ? Number(d.alindi) || 0 : 0;
    if (!zorla && alindi && alindi <= simdi && simdi - alindi < YENILEME_MS) return Promise.resolve(false);
    if (simdi - sonDeneme < 60000) return Promise.resolve(false);   // ag hatasinda dakikada en cok bir
    istekte = true;
    sonDeneme = simdi;
    return istek({ action: "referral", license_key: creds.licenseKey, instance_id: creds.instanceId, client_version: K.VERSION }).then(function (r) {
      var j = r.json;
      var s2 = ayar();
      var eski = s2.davetKod && s2.davetKod.iz === iz && R.isValidCode(s2.davetKod.kod) ? s2.davetKod : null;
      if (r.status === 200 && j && j.ok === true && R.isValidCode(j.code)) {
        var yuzde = Math.round(Number(j.percent));
        s2.davetKod = {
          kod: j.code,
          sayi: Math.max(0, Math.floor(Number(j.count) || 0)),
          kademe: R.tierFor(j.count),
          yuzde: yuzde > 0 && yuzde < 100 ? yuzde : R.VARSAYILAN_YUZDE,
          alindi: Date.now(),
          iz: iz
        };
        kaydet();
        return true;
      }
      if (r.status === 0) return false;   // ag yok: onbellege dokunma, sonra yine denenir
      // 503 kapali / 400 eski sunucu / 403 / 429: bu lisansin eski kodu varsa korunur, yoksa "kod yok" onbellegi
      s2.davetKod = eski ? { kod: eski.kod, sayi: eski.sayi, kademe: eski.kademe, yuzde: eski.yuzde, alindi: Date.now(), iz: iz }
        : { kod: "", sayi: 0, kademe: 0, alindi: Date.now(), iz: iz };
      kaydet();
      return false;
    }).then(function (v) { istekte = false; ciz(); return v; }, function () { istekte = false; ciz(); return false; });
  }

  /* ---------------- Story karti ---------------- */

  function uzantiDizini() {
    try { return K.extensionPath ? K.extensionPath() : ""; } catch (e) { return ""; }
  }

  async function story() {
    var d = sunucuKodu();
    if (!d || storyMesgul) return;
    var btn = el("davet-story");
    storyMesgul = true;
    btn.disabled = true;
    durum("Story kartı hazırlanıyor…");
    var dizin = "";
    try {
      var ff = await K.findFfmpeg();
      if (!ff) throw new Error("Story kartı için ffmpeg gerekli (Ayarlar → ffmpeg).");
      if (K.libassUyarisi && K.libassUyarisi()) throw new Error(K.libassUyarisi());
      var st = R.storyAss(d.kod, 1080, 1920, { lang: dil(), percent: d.yuzde });
      dizin = K.path.join(K.tmpDir(), "davet-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
      K.fs.mkdirSync(dizin, { recursive: true });
      K.fs.writeFileSync(K.path.join(dizin, "davet.ass"), st.ass, "utf8");
      // kanca.js tarifi: ffmpeg filtre yolunda mutlak yol kullanilamaz, dosyanin klasorunde calisir
      var fontsdir = "";
      st.fontFiles.forEach(function (f) {
        try {
          var kaynak = K.path.join(uzantiDizini(), "fonts", f);
          if (K.fs.existsSync(kaynak)) { K.fs.copyFileSync(kaynak, K.path.join(dizin, f)); fontsdir = ":fontsdir=."; }
        } catch (e) { K.log("[davet] font kopyalanamadı: " + e.message); }
      });
      var png = K.path.join(dizin, "kart.png");
      var r = await K.run(ff, ["-y", "-f", "lavfi", "-i", "color=c=0x101522:s=" + st.w + "x" + st.h + ":d=1",
        "-vf", "subtitles=f=davet.ass" + fontsdir, "-frames:v", "1", png], { timeout: 60000, cwd: dizin });
      if (r.code !== 0 || !K.fs.existsSync(png)) throw new Error("Story kartı üretilemedi: " + String(r.stderr || "").split("\n").slice(-2).join(" ").slice(0, 160));
      var masaustu = K.path.join(K.os.homedir(), "Desktop");
      if (!K.fs.existsSync(masaustu)) masaustu = K.os.homedir();
      var hedef = K.path.join(masaustu, R.storyDosyaAdi(d.kod));
      K.fs.copyFileSync(png, hedef);
      durum("✓ Masaüstüne kaydedildi: " + hedef, "good");
      toast("Story kartı masaüstünde: " + R.storyDosyaAdi(d.kod), "good", 7000);
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      if (dizin) { try { K.rmrf(dizin); } catch (eR) {} }
      storyMesgul = false;
      btn.disabled = false;
    }
  }

  /* ---------------- Arkadasindan gelen kod (odemede indirim) ---------------- */

  function girilenKaydet() {
    var gir = el("davet-girilen");
    var ham = String(gir.value || "").trim();
    var s = ayar();
    if (!ham) {
      delete s.davetGirilenKod;
      kaydet();
      durum("Davet kodu kaldırıldı.");
      return;
    }
    var kod = R.kodTemizle(ham);
    if (!kod) { durum("Bu bir Suflo davet kodu değil: SFL ile başlar, 9 karakterdir.", "warn"); return; }
    s.davetGirilenKod = kod;
    kaydet();
    gir.value = kod;
    durum("✓ Kod kaydedildi: Pro'yu panelden alırken indirim ödeme sayfasına kendiliğinden eklenir.", "good");
  }

  // app.js proCheckoutUrl: odeme baglantisina eklenecek kod ("" = yok)
  function odemeKodu() {
    var k = ayar().davetGirilenKod;
    return R.isValidCode(k) ? k : "";
  }

  /* ---------------- Davet seridi ---------------- */

  var SERIT_METNI = {
    cut: "Kesim tamam! Suflo işini kolaylaştırdıysa bir arkadaşına önerir misin?",
    shorts: "Shorts'ların hazır! Suflo işini kolaylaştırdıysa bir arkadaşına önerir misin?",
    apply: "Suflo işini kolaylaştırdıysa bir arkadaşına önerir misin?"
  };
  // Şerit işin yapıldığı yerde çıksın: kesim sekmesinde, viral kutusunda ya da yıldız şeridinin yanında
  var SERIT_YERI = { cut: "cut-status", shorts: "cap-vr-durum", apply: "star-bar" };

  function seritGoster(tur) {
    var bar = el("davet-bar");
    if (!bar) return;
    var yer = el(SERIT_YERI[tur] || "star-bar") || el("star-bar");
    if (yer && yer.parentNode && yer.nextSibling !== bar) yer.parentNode.insertBefore(bar, yer.nextSibling);
    el("davet-bar-metin").textContent = SERIT_METNI[tur] || SERIT_METNI.apply;
    bar.hidden = false;
  }

  function seritKapat() { var bar = el("davet-bar"); if (bar) bar.hidden = true; }

  function olayTuru(event) { return typeof event === "string" ? event : (event && event.type) || ""; }

  // Kararı kısa bir gecikmeyle ver: host çağrısı yeni bittiyse yoklama sürüyor olabilir
  function dene(event, n) {
    var s = ayar();
    var yildiz = el("star-bar");
    var k = R.olayIsle(s.davetIstem, Date.now(), event, {
      busy: !!(K.hostMesgul && K.hostMesgul()),
      starVisible: !!(yildiz && !yildiz.hidden)
    });
    if (k.neden === "busy" && n < 3) { setTimeout(function () { dene(event, n + 1); }, 4000); return; }
    s.davetIstem = k.state;
    kaydet();
    if (k.goster) seritGoster(olayTuru(event));
  }

  // magiccut.js (ilk kesim), viral.js (ilk Shorts), captions.js (5. başarılı uygulama) çağırır
  function ani(event) {
    if (!R || !el("davet-bar")) return;
    setTimeout(function () { try { dene(event, 0); } catch (e) { K.log("[davet] " + e.message); } }, 1200);
  }

  function kartaGit() {
    if (window.KApp && KApp.goster) KApp.goster("settings");
    var kart = el("grp-davet");
    if (kart) { try { kart.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { kart.scrollIntoView(); } }
  }

  /* ---------------- "Bizi nereden duydun?" ---------------- */

  function kaynakSor() {
    var s = ayar();
    var kutu = el("pro-kaynak");
    if (!kutu || s.kaynakSoruldu) return;
    kutu.hidden = false;
  }

  function kaynakBitir(cevap) {
    var s = ayar();
    s.kaynakSoruldu = true;
    kaydet();
    var kutu = el("pro-kaynak");
    if (kutu) kutu.hidden = true;
    if (!cevap || KAYNAKLAR.indexOf(cevap) === -1) return;
    toast("Teşekkürler!", "good");
    // Ateşle ve unut: eski sunucu (400) ya da ağ hatası sessizce yok sayılır
    var creds = window.Pro && Pro.contentCredentials ? Pro.contentCredentials() : null;
    istek({ action: "attribution", answer: cevap, license_key: creds ? creds.licenseKey : "", client_version: K.VERSION }).then(function () {}, function () {});
  }

  /* ---------------- Baslat ---------------- */

  function init() {
    if (!R || !el("grp-davet")) return;
    el("davet-kopyala").addEventListener("click", function () { panoya(metin("plain"), "Davet metni kopyalandı: WhatsApp'ta ya da DM'de yapıştır"); });
    el("davet-paylas").addEventListener("click", function () { panoya(metin("plain"), "Paylaşım metni kopyalandı: bir arkadaşına yapıştır"); });
    el("davet-wa").addEventListener("click", function () { tarayicida(R.channelUrl("whatsapp", metin("whatsapp"))); });
    el("davet-x").addEventListener("click", function () { tarayicida(R.channelUrl("x", metin("x"))); });
    el("davet-ig").addEventListener("click", function () { panoya(metin("instagram"), "Metin kopyalandı: Instagram hikâyene ya da DM'e yapıştır"); });
    el("davet-story").addEventListener("click", story);
    el("davet-girilen-kaydet").addEventListener("click", girilenKaydet);
    el("davet-girilen").addEventListener("keydown", function (e) { if (e.key === "Enter") girilenKaydet(); });
    el("davet-ortaklik").addEventListener("click", function (e) { e.preventDefault(); tarayicida(ORTAKLIK_URL); });

    el("davet-bar-paylas").addEventListener("click", function () {
      panoya(metin("plain"), "Davet metni kopyalandı. Diğer seçenekler: Ayarlar › Davet et, kazan");
      seritKapat();
    });
    el("davet-bar-asla").addEventListener("click", function () {
      var s = ayar();
      var st = R.olayIsle(s.davetIstem, Date.now(), "", {}).state;
      st.never = true;
      s.davetIstem = st;
      kaydet();
      seritKapat();
    });
    el("davet-bar-kapat").addEventListener("click", seritKapat);
    el("davet-bar-secenek").addEventListener("click", function () { seritKapat(); kartaGit(); });

    Array.prototype.forEach.call(document.querySelectorAll("#pro-kaynak [data-kaynak]"), function (b) {
      b.addEventListener("click", function () { kaynakBitir(b.getAttribute("data-kaynak")); });
    });
    if (el("pro-kaynak-atla")) el("pro-kaynak-atla").addEventListener("click", function () { kaynakBitir(""); });

    if (window.Pro && Pro.on) Pro.on(function () { ciz(); });
    if (window.KApp && KApp.onTab) KApp.onTab("settings", function () { ciz(); kodGetir(false); });
    ciz();
  }

  return { init: init, ani: ani, ciz: ciz, kodGetir: kodGetir, kaynakSor: kaynakSor, odemeKodu: odemeKodu, metin: metin };
})();
