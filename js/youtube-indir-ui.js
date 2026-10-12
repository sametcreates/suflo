/*
 * Suflo — YouTube indirici paneli (v3.3)
 *
 * Bağlantıyı yapıştır → "Bilgi al" (ücretsiz: yt-dlp -J --no-playlist) → kalite (MP3 / 720p / 1080p / 4K)
 * → "İndir" (Pro, 3 deneme hakkı; hak yalnız dosya Premiere'e hazır olunca düşer). Dosya hedef
 * klasöre (varsayılan: proje klasörü › Suflo İndirilenler) iner, Premiere'in açamayacağı codec
 * (VP9 / AV1 / Opus) Suflo'nun ffmpeg'iyle H.264 / AAC MP4'e çevrilir ve projedeki "Suflo İndirilenler"
 * kutusuna alınır (KS_importDownloaded; timeline'a dokunulmaz).
 *
 * yt-dlp pakette yok: ilk kullanımda GitHub'daki son sürüm ve AYNI sürümün SHA2-256SUMS dosyası iner,
 * özet tutmadan dosya çalıştırılabilir adını almaz, chmod / ilk çalıştırma doğrulamadan sonra. Her
 * oturumda ilk çalıştırmadan önce dosyanın özeti kurulum kaydıyla (suflo-ytdlp.json) yeniden
 * karşılaştırılır. Kararların hepsi js/youtube-indir.js'te (saf, testli); burası yalnız DOM, dosya,
 * süreç ve Premiere köprüsü. Panel açılışında Premiere'e ya da ağa gidilmez: proje klasörü sekme
 * açılınca, ağ yalnız Bilgi al / İndir / Güncelle'de.
 */
window.KYoutube = (function () {
  "use strict";

  var Y = window.SufloYoutubeIndir;
  var META_ADI = "suflo-ytdlp.json";
  var IPTAL_ACIKLAMA = "İndirme iptal edildi — inen kısım korundu, yeniden başlatınca kaldığı yerden devam eder.";

  var bilgi = null;          // son Bilgi al özeti (Y.bilgiOzeti)
  var bilgiUrl = "";         // özetin kanonik adresi
  var durumlar = null;       // Y.kaliteDurumu(bilgi)
  var kalite = "";
  var mesgul = false;
  var isTuru = "";
  var jeton = null;          // süren işin iptal jetonu (K.iptalJetonu)
  var iptalKapali = false;   // Premiere'e ekleme adımı: KS_importDownloaded yarıda kesilemez, İptal kapalı
  var zorlaGuncelle = false; // "yt-dlp çalıştırılamadı" sonrası Güncelle: sürüm aynı olsa da yeniden indirir
  var iptalAcilis = 0, baslatAcilis = 0;
  var sonDosya = "";
  var kurulumIsi = null;     // paylaşılan yt-dlp kurulum / güncelleme işi
  var dogrulama = null;      // bu oturumda özeti doğrulanmış ikili: { anahtar, sha }
  var kodlayiciOnbellek = {};
  var projeKlasoru = null;   // KS_projectDir sonucu (sekme açılınca tazelenir); null = sorulmadı

  function el(id) { return document.getElementById(id); }
  function uiMetni(s) { return window.SufloI18n && SufloI18n.tr ? SufloI18n.tr(s) : s; }
  function toast(m, t, s) { if (window.KApp && KApp.toast) KApp.toast(m, t, s); }
  // Günlük destekle paylaşılır: yt-dlp'nin hata satırında geçebilecek vekil parolası (//kullanici:parola@) gizlenir
  function log(m) { try { if (K.log) K.log("[youtube] " + String(m).replace(/\/\/[^\/\s:@]+:[^\/\s@]+@/g, "//***@")); } catch (e) {} }

  /* ---------------- metin parçaları ---------------- */
  // Dize = arayüz metni (çevrilir); { ad } = kullanıcı içeriği (dosya / kutu adı; çevrilmez)
  function dugum(parcalar) {
    var kap = document.createElement("span");
    (parcalar || []).forEach(function (p) {
      if (p && typeof p === "object") {
        var b = document.createElement("b");
        b.setAttribute("data-i18n-skip", "");
        b.textContent = String(p.ad);
        kap.appendChild(b);
      } else if (p !== null && p !== undefined && p !== "") kap.appendChild(document.createTextNode(String(p)));
    });
    return kap;
  }
  function durum(msg, cls) {
    var e = el("yt-durum");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    if (Array.isArray(msg)) { e.textContent = ""; e.appendChild(dugum(msg)); }
    else e.textContent = msg || "";
  }
  function ilerleme(oran) {
    var kap = el("yt-ilerleme"), cubuk = el("yt-ilerleme-cubuk");
    if (!kap) return;
    if (oran === null || oran === undefined) { kap.hidden = true; return; }
    kap.hidden = false;
    if (cubuk) cubuk.style.width = Math.round(Math.max(0.01, Math.min(1, Number(oran) || 0)) * 1000) / 10 + "%";
  }
  // ekNot: süren aşamanın kalıcı açıklaması (4K dönüştürmede "uzun sürer"); ilerleme satırının sonuna eklenir
  var ekNot = "";
  function ilerlemeGoster(d) {
    if (!d) return;
    ilerleme(d.oran);
    durum(Y.ilerlemeMetni(d) + (ekNot ? " · " + ekNot : ""));
  }

  /* ---------------- ortam ---------------- */
  function platform() {
    try { if (typeof process !== "undefined" && process.platform) return process.platform; } catch (e) {}
    return K.MAC ? "darwin" : "win32";
  }
  function mimari() { try { return K.os.arch(); } catch (e) { return "x64"; } }
  function ytDir() { return K.path.join(K.path.dirname(K.whisperDir()), "yt-dlp"); }
  function exeYolu() { return K.path.join(ytDir(), Y.yerelAd(platform())); }
  function metaYolu() { return K.path.join(ytDir(), META_ADI); }
  function ayar() { return K.settings ? K.settings() : {}; }
  function ayarKaydet() { try { if (K.saveSettings) K.saveSettings(); } catch (e) {} }

  function metaOku() {
    try {
      var m = JSON.parse(String(K.fs.readFileSync(metaYolu(), "utf8")).replace(/^\uFEFF/, ""));
      return Y.metaGecerliMi(m) ? m : null;
    } catch (e) { return null; }
  }
  function metaYaz(m) {
    var hedef = metaYolu(), gecici = hedef + ".yaziliyor";
    K.fs.writeFileSync(gecici, JSON.stringify(m, null, 2), "utf8");
    K.fs.renameSync(gecici, hedef);
  }
  function sil(yol) { try { K.fs.unlinkSync(yol); return true; } catch (e) { return false; } }
  function varMi(yol) { try { return !!yol && K.fs.existsSync(yol); } catch (e) { return false; } }
  function listele(yol) { try { return K.fs.readdirSync(yol); } catch (e) { return []; } }

  /*
   * yt-dlp'nin süreç ortamı: Suflo'nun kendi geçici klasörü (TMPDIR / TEMP / TMP). PyInstaller'ın her
   * çalıştırmada açtığı _MEI… klasörü, süreç zorla öldürülünce (İptal, zaman aşımı, Premiere kapanması)
   * burada kalır ve bir sonraki yt-dlp çalıştırmasından önce silinir. Paneldeki yt-dlp işleri tek tek
   * sürer (mesgul / kurulumIsi): silme anında çalışan başka yt-dlp yok. Klasör kurulamazsa ortam
   * değişmez (yt-dlp sistemin geçici klasörünü kullanır).
   */
  function ytOrtam() {
    var d = K.path.join(ytDir(), "tmp");
    try { K.fs.mkdirSync(d, { recursive: true }); } catch (e) { return undefined; }
    var n = 0;
    listele(d).forEach(function (ad) {
      if (!Y.meiArtigiMi(ad)) return;
      try { if (K.rmrf) { K.rmrf(K.path.join(d, ad)); n++; } } catch (eS) {}
    });
    if (n) log("yt-dlp geçici artığı silindi: " + n);
    return Y.geciciOrtam(d) || undefined;
  }

  function dosyaOzeti(yol) {
    return new Promise(function (resolve) {
      try {
        var h = require("crypto").createHash("sha256");
        var st = K.fs.createReadStream(yol);
        st.on("data", function (c) { h.update(c); });
        st.on("end", function () { resolve(h.digest("hex")); });
        st.on("error", function () { resolve(""); });
      } catch (e) { resolve(""); }
    });
  }

  function iptalHatasi(m) { return K.iptalHatasi ? K.iptalHatasi(m) : (function () { var e = new Error(m || "İptal edildi"); e.iptal = true; return e; })(); }
  function iptalDenetle(iptal, m) { if (iptal && iptal.iptalEdildi) throw iptalHatasi(m); }
  // Başkasının başlattığı işi beklerken İptal: yalnız bekleme biter, iş sürer
  function bekle(is, iptal) {
    if (!iptal || typeof iptal.dinle !== "function") return is;
    return new Promise(function (resolve, reject) {
      var birak = iptal.dinle(function () { reject(iptalHatasi("Bekleme iptal edildi — başka bir kurulum indirmeye devam ediyor.")); });
      is.then(function (v) { birak(); resolve(v); }, function (e) { birak(); reject(e); });
    });
  }

  /* ---------------- yt-dlp ikilisi: doğrulama, kurulum, güncelleme ---------------- */

  // Kurulu ikili bu oturumda doğrulandı mı (özet kurulum kaydıyla aynı); değilse null — ÇALIŞTIRILMAZ
  async function dogrulanmisIkili() {
    var meta = metaOku(), yol = exeYolu();
    if (!meta) return null;
    var st;
    try { st = K.fs.statSync(yol); } catch (e) { return null; }
    if (!st || !st.isFile()) return null;
    var anahtar = yol + "|" + st.size + "|" + (st.mtimeMs || 0);
    if (dogrulama && dogrulama.anahtar === anahtar && dogrulama.sha === meta.sha256) return { yol: yol, meta: meta };
    var sha = await dosyaOzeti(yol);
    if (sha !== meta.sha256) {
      dogrulama = null;
      log("yt-dlp özeti kurulum kaydıyla uyuşmuyor; çalıştırılmadı");
      return null;
    }
    dogrulama = { anahtar: anahtar, sha: sha };
    return { yol: yol, meta: meta };
  }

  async function sonSurum() {
    try {
      var r = await K.httpGet(Y.API_ADRESI, { "Accept": "application/vnd.github+json" });
      return r && r.status === 200 ? Y.surumCoz(r.body) : null;
    } catch (e) { return null; }
  }

  /*
   * zorla: false ise ve GitHub'daki son sürüm kurulu, doğrulanmış sürümle aynıysa indirilmez (yalnız
   * "denetlendi" zamanı yazılır). Döner: { yol, meta, guncel }.
   */
  async function kurulumYap(say, iptal, zorla) {
    if (!K.nodeOK) throw new Error("Bu ortamda kurulamaz — Premiere içinde dene.");
    var dir = ytDir();
    K.fs.mkdirSync(dir, { recursive: true });
    var plat = platform(), arch = mimari();
    say("yt-dlp'nin son sürümü denetleniyor…");
    var api = await sonSurum();
    iptalDenetle(iptal, IPTAL_ACIKLAMA);
    if (!zorla && api) {
      var mevcut = await dogrulanmisIkili();
      if (mevcut && Y.surumKarsilastir(api.etiket, mevcut.meta.surum) <= 0) {
        mevcut.meta.denetim = Date.now();
        try { metaYaz(mevcut.meta); } catch (eM) {}
        return { yol: mevcut.yol, meta: mevcut.meta, guncel: true };
      }
    }
    var adaylar = Y.varlikAdaylari(plat, arch);
    if (!adaylar.length) throw new Error("yt-dlp bu işletim sisteminde desteklenmiyor.");
    var ilk = Y.indirmeAdresleri(api ? api.etiket : "", adaylar[0]);

    // 1) Aynı sürümün SHA2-256SUMS listesi
    var sumsYolu = K.path.join(dir, "SHA2-256SUMS.indirme");
    sil(sumsYolu);
    var d1 = await K.download(ilk.sums, sumsYolu, null, 0, undefined, { key: "ytdlp-sums:" + (ilk.etiket || "latest"), iptal: iptal || null });
    if (d1.iptal) throw iptalHatasi(IPTAL_ACIKLAMA);
    if (!d1.ok) throw new Error("yt-dlp sürüm listesi (SHA2-256SUMS) indirilemedi: " + d1.error);
    var sums;
    try { sums = Y.sumsCoz(K.fs.readFileSync(sumsYolu, "utf8")); } finally { sil(sumsYolu); }
    var varlik = Y.varlikSec(sums, plat, arch);
    if (!varlik) throw new Error(Y.dogrulamaMesaji("listedeYok"));
    var adres = Y.indirmeAdresleri(ilk.etiket, varlik);

    // 2) İkili, çalıştırılabilir OLMAYAN geçici adla
    var gecici = K.path.join(dir, varlik + ".dogrulanmadi");
    var mb = plat === "darwin" ? 36 : 18;
    say("yt-dlp iniyor… (≈ " + mb + " MB)");
    var d2 = await K.download(adres.ikili, gecici, function (f) {
      say("yt-dlp iniyor… %" + Math.round(f * 100) + " (≈ " + mb + " MB)");
    }, 0, undefined, { key: "ytdlp:" + (adres.etiket || "latest") + ":" + varlik, expectedMB: mb, iptal: iptal || null });
    if (d2.iptal) throw iptalHatasi(IPTAL_ACIKLAMA);
    if (!d2.ok) throw new Error("yt-dlp indirilemedi: " + d2.error);

    // 3) SHA-256: tutmazsa dosya silinir, hiç çalıştırılmaz
    say("yt-dlp doğrulanıyor (SHA-256)…");
    var sha = await dosyaOzeti(gecici);
    var dog = Y.ozetDogrula(sums, varlik, sha, api && api.ozetler ? api.ozetler[varlik] : "");
    if (!dog.ok) {
      sil(gecici);
      log("yt-dlp doğrulanamadı (" + dog.kod + "): " + varlik + " " + String(sha).slice(0, 16));
      throw new Error(Y.dogrulamaMesaji(dog.kod));
    }

    // 4) Yerine koy; çalıştırma izni ve karantina temizliği ancak doğrulamadan sonra
    var hedef = exeYolu(), yedek = hedef + ".eski";
    sil(yedek);
    var eskiVar = varMi(hedef);
    if (eskiVar) { try { K.fs.renameSync(hedef, yedek); } catch (eR) { sil(hedef); eskiVar = false; } }
    K.fs.renameSync(gecici, hedef);
    dogrulama = null;
    if (plat !== "win32") {
      K.fs.chmodSync(hedef, 493);   // 0755
      if (plat === "darwin") { try { await K.run("/usr/bin/xattr", ["-d", "com.apple.quarantine", hedef], { timeout: 30000 }); } catch (eQ) {} }
    }

    // 5) İlk çalıştırma (doğrulanmış dosya): sürüm okunamazsa eski ikili geri gelir
    say("yt-dlp deneniyor…");
    var t = await K.run(hedef, ["--version"], { timeout: 120000, env: ytOrtam() });
    var surum = Y.ytdlpSurumu(t && t.stdout);
    if (!t || t.code !== 0 || !surum) {
      sil(hedef);
      if (eskiVar) { try { K.fs.renameSync(yedek, hedef); } catch (eG) {} }
      var h = Y.hataSinifla(t ? t.stderr : "", "");
      throw new Error("İndirilen yt-dlp çalışmadı. " + (h.kod === "calismadi" ? h.mesaj : String(t && t.stderr || "").trim().split(/\r?\n/).pop() || ""));
    }
    var simdi = Date.now();
    var meta = { v: 1, surum: surum, etiket: adres.etiket, varlik: varlik, sha256: sha, kuruldu: simdi, denetim: simdi };
    metaYaz(meta);
    sil(yedek);
    dogrulama = null;
    log("yt-dlp kuruldu: " + surum + " (" + varlik + ", sha256 " + sha.slice(0, 12) + "…)");
    return { yol: hedef, meta: meta, guncel: false };
  }

  // Tek iş: Bilgi al, İndir, Güncelle ve Doctor aynı anda isterse ikinci çağıran ilkini bekler
  function kur(say, iptal, zorla) {
    if (kurulumIsi) return bekle(kurulumIsi, iptal);
    var is = kurulumYap(say || function () {}, iptal, !!zorla);
    kurulumIsi = is;
    var birak = function () { if (kurulumIsi === is) kurulumIsi = null; };
    is.then(birak, birak);
    return is;
  }

  // Çalıştırmadan önce: doğrulanmış ikili ya da (yoksa / doğrulanamadıysa) doğrulanmış yeni kurulum
  async function hazirla(say, iptal) {
    if (!K.nodeOK || !K.fs || !K.path) throw new Error("Bu ortamda kurulamaz — Premiere içinde dene.");
    // Süren kurulum / güncelleme (ör. Doctor'un Güncelle'si) ikiliyi değiştirirken eski dosya çalıştırılmasın
    if (kurulumIsi) {
      say(Y.ASAMA_METNI.kur);
      try { await bekle(kurulumIsi, iptal); } catch (eB) { if (eB && eB.iptal) throw eB; }
    }
    var v = await dogrulanmisIkili();
    if (v) return v;
    if (varMi(exeYolu())) say("yt-dlp doğrulanamadı; yeniden indiriliyor…");
    var r = await kur(say, iptal, true);
    return { yol: r.yol, meta: r.meta };
  }

  async function ffmpegHazirla(say, iptal) {
    var ff = K.findFfmpeg ? await K.findFfmpeg() : null;
    if (ff) return ff;
    if (!window.KEngine || !KEngine.installFfmpeg) throw new Error(Y.HATALAR.ffmpegYok.mesaj);
    say("ffmpeg kuruluyor…");
    await KEngine.installFfmpeg(say, iptal);
    ff = await K.findFfmpeg(true);
    if (!ff) throw new Error(Y.HATALAR.ffmpegYok.mesaj);
    return ff;
  }

  function jsCalistirici() {
    var ev = "";
    try { ev = K.os.homedir(); } catch (e) {}
    var aday = Y.denoAdaylari(platform(), ev);
    for (var i = 0; i < aday.length; i++) if (varMi(aday[i])) return aday[i];
    return "";
  }
  function ortakSecenek(meta) {
    return { surum: meta ? meta.surum : "", jsRuntime: jsCalistirici(), proxy: Y.vekilAdresi(ayar().proxyUrl) };
  }

  /* ---------------- iş durumu ---------------- */
  function dugmeler() {
    var ac = !mesgul;
    // iş sürerken bağlantı değişmesin (indirme başladığı videonun bilgisiyle sürer)
    if (el("yt-url")) el("yt-url").disabled = !ac;
    if (el("yt-bilgi")) el("yt-bilgi").disabled = !ac;
    if (el("yt-yapistir")) el("yt-yapistir").disabled = !ac;
    if (el("yt-klasor-degistir")) el("yt-klasor-degistir").disabled = !ac;
    if (el("yt-klasor-varsayilan")) el("yt-klasor-varsayilan").disabled = !ac;
    if (el("yt-guncelle")) el("yt-guncelle").disabled = !ac;
    var indir = el("yt-indir");
    if (indir) {
      indir.hidden = mesgul;
      indir.disabled = !ac || !bilgi || !kalite || !durumlar || !durumlar[kalite] || !durumlar[kalite].acik || !!Y.canliEngeli(bilgi);
    }
    var iptal = el("yt-iptal");
    if (iptal) { iptal.hidden = !mesgul; iptal.disabled = mesgul && iptalKapali; }
    ciplerCiz();
  }
  function isBaslat(tur) {
    mesgul = true;
    isTuru = tur;
    iptalKapali = false;
    jeton = K.iptalJetonu();
    iptalAcilis = Date.now();
    if (el("yt-sonuc")) el("yt-sonuc").hidden = true;
    dugmeler();
    return jeton;
  }
  function isBitir() {
    mesgul = false;
    isTuru = "";
    iptalKapali = false;
    jeton = null;
    baslatAcilis = Date.now();
    ilerleme(null);
    dugmeler();
  }
  function iptalEt(ev) {
    if (!mesgul || !jeton || iptalKapali) return;
    if (ev && K.iptalTikiGecerli && !K.iptalTikiGecerli(ev, iptalAcilis)) return;
    if (el("yt-iptal")) el("yt-iptal").disabled = true;
    durum("İptal ediliyor…", "warn");
    jeton.iptal();
  }
  function baslatGecerli(ev) { return !ev || !K.baslatTikiGecerli || K.baslatTikiGecerli(ev, baslatAcilis); }

  // zorla: kutu "yt-dlp çalıştırılamadı" için açıldı; Güncelle sürüm aynı olsa da doğrulanmış ikiliyi yeniden indirir
  function guncelleKutusu(metin, zorla) {
    zorlaGuncelle = !!metin && !!zorla;
    var kutu = el("yt-guncelle-kutu");
    if (!kutu) return;
    kutu.hidden = !metin;
    if (el("yt-guncelle-metin")) el("yt-guncelle-metin").textContent = metin || "";
  }
  function jsNotu(goster) { if (el("yt-js-not")) { el("yt-js-not").hidden = !goster; el("yt-js-not").textContent = goster ? Y.JS_YOK_METNI : ""; } }

  // Hata: sınıflandırılmış yt-dlp hatası ya da genel hata; Güncelle gerekiyorsa kutu açılır
  function hataGoster(e) {
    if (e && e.iptal) { durum(e.message && e.message !== "İptal edildi" ? e.message : "İptal edildi.", "warn"); return; }
    var h = e && e.ytHata ? e.ytHata : null;
    if (h) {
      durum(h.kod === "bilinmeyen" && h.satir ? h.mesaj + " " + h.satir : h.mesaj, "bad");
      if (h.kod === "calismadi") guncelleKutusu("Güncelle yt-dlp'yi yeniden indirip doğrular.", true);
      else if (h.guncelle) guncelleKutusu("yt-dlp'yi güncellemek bu hatayı çözebilir.");
      log("hata " + h.kod + ": " + String(h.satir || "").slice(0, 200));
      return;
    }
    var m = e && e.message ? e.message : String(e || "");
    // ağ / disk / izin gibi genel hatalara köprünün "Çözüm:" satırı eklenir
    durum(K.hataYardimi ? K.hataYardimi(e) : m, "bad");
    log("hata: " + m.slice(0, 200));
  }
  function ytHatasi(h) { var e = new Error(h.mesaj); e.ytHata = h; return e; }
  function hazirHata(kod) { var h = Y.HATALAR[kod] || Y.HATALAR.bilinmeyen; return { kod: kod, mesaj: h.mesaj, guncelle: !!h.guncelle, satir: "" }; }

  /* ---------------- kalite çipleri ---------------- */
  var KALITE_NOTU = {
    mp3: "Yalnız ses: en yüksek kalitede MP3.",
    "720": "H.264 + AAC MP4: Premiere doğrudan açar.",
    "1080": "H.264 + AAC MP4: Premiere doğrudan açar.",
    "2160": "4K: YouTube 4K'yı VP9 / AV1 verir; Premiere için H.264'e dönüştürülür. Dönüştürme uzun sürer (videonun süresi kadar ya da daha fazla)."
  };
  function ciplerCiz() {
    Y.KALITELER.forEach(function (k) {
      var b = el("yt-k-" + k);
      if (!b) return;
      var d = durumlar && durumlar[k] ? durumlar[k] : null;
      var acik = !!(d && d.acik);
      b.disabled = mesgul || !acik;
      b.textContent = d ? d.etiket : Y.KALITE_ADI[k];
      b.classList.toggle("on", acik && kalite === k);
      b.setAttribute("aria-checked", acik && kalite === k ? "true" : "false");
      // title Türkçe yazılır: çeviri katmanı öznitelikleri kendisi çevirir (ve EN → TR'de geri alır)
      b.setAttribute("title", acik ? "" : (bilgi ? "Bu videoda bu kalite yok" : "Önce Bilgi al'a bas"));
    });
    var not = el("yt-kalite-not");
    if (not) not.textContent = bilgi && kalite && KALITE_NOTU[kalite] ? KALITE_NOTU[kalite] : "";
  }
  function kaliteSec(k) {
    if (mesgul || !durumlar || !durumlar[k] || !durumlar[k].acik) return;
    kalite = k;
    var s = ayar();
    s.ytKalite = k;
    ayarKaydet();
    dugmeler();
  }

  /* ---------------- önizleme kartı ---------------- */
  function onizlemeCiz() {
    var kart = el("yt-onizleme");
    if (!kart) return;
    kart.hidden = !bilgi;
    if (!bilgi) return;
    if (el("yt-baslik")) el("yt-baslik").textContent = bilgi.baslik || "";
    if (el("yt-kanal")) el("yt-kanal").textContent = bilgi.kanal || "";
    if (el("yt-sure")) el("yt-sure").textContent = bilgi.sureMetni || "";
    var img = el("yt-kucuk");
    if (img) {
      if (bilgi.kucukResim) { img.src = bilgi.kucukResim; img.hidden = false; }
      else { img.removeAttribute("src"); img.hidden = true; }
    }
  }
  function bilgiyiTemizle() {
    bilgi = null; bilgiUrl = ""; durumlar = null;
    onizlemeCiz();
    jsNotu(false);
    dugmeler();
  }

  /* ---------------- hedef klasör ---------------- */
  async function projeKlasoruAl() {
    try {
      var r = await K.call("KS_projectDir", undefined, 15000);
      projeKlasoru = r && r.ok && r.dir ? String(r.dir) : "";
    } catch (e) { projeKlasoru = ""; }
    return projeKlasoru;
  }
  function varsayilanYol(proje) {
    var ev = "";
    try { ev = K.os.homedir(); } catch (e) {}
    return Y.varsayilanKlasor({ projeKlasoru: proje, ev: ev, platform: platform(), sep: K.path ? K.path.sep : "/" });
  }
  function klasorGoster() {
    var ozel = String(ayar().ytKlasor || "");
    var yolEl = el("yt-klasor-yol"), ipucu = el("yt-klasor-ipucu");
    var yol = ozel || (projeKlasoru !== null ? varsayilanYol(projeKlasoru) : "");
    // yol kullanıcı içeriği (data-i18n-skip); ipucu ("Proje klasörü › Suflo İndirilenler") yol bilinmezken.
    // Dar panelde uzun yolun BAŞI kırpılır, sondaki klasör adı görünür (css: dış kutu sağdan sola, içteki
    // yol soldan sağa yalıtılmış); tam yol title'da.
    if (yolEl) {
      yolEl.textContent = "";
      var ic = document.createElement("span");
      ic.className = "yt-klasor-ic";
      ic.textContent = yol;
      yolEl.appendChild(ic);
      yolEl.hidden = !yol;
      yolEl.setAttribute("title", yol);
    }
    if (ipucu) ipucu.hidden = !!yol;
    var not = el("yt-klasor-not");
    if (not) {
      not.hidden = !(!ozel && projeKlasoru === "");
      if (!not.hidden) not.textContent = Y.klasorNotu(platform());
    }
    if (el("yt-klasor-varsayilan")) el("yt-klasor-varsayilan").hidden = !ozel;
  }
  async function hedefKlasor() {
    var ozel = String(ayar().ytKlasor || "");
    if (ozel) return { yol: ozel, ozel: true };
    var proje = await projeKlasoruAl();
    klasorGoster();
    return { yol: varsayilanYol(proje), ozel: false };
  }
  // Klasör oluşturulur ve gerçekten yazılabilir mi denenir (salt okunur disk, izin, dolu disk)
  function klasorHazirla(yol) {
    try {
      K.fs.mkdirSync(yol, { recursive: true });
      var dene = K.path.join(yol, ".suflo-yazma-" + Date.now());
      K.fs.writeFileSync(dene, "1");
      sil(dene);
    } catch (e) {
      var kod = e && e.code ? String(e.code) : "";
      log("hedef klasör yazılamıyor (" + (kod || "?") + ")");
      throw ytHatasi(hazirHata(kod === "ENOSPC" ? "disk" : "yazilamaz"));
    }
  }
  // Kilitli dosya (Windows'ta süreç henüz tam kapanmadı): birkaç kez dener
  function temizle(klasor, adlar) {
    var kalan = (adlar || []).map(function (a) { return K.path.join(klasor, a); });
    return new Promise(function (resolve) {
      var deneme = 0;
      (function tur() {
        kalan = kalan.filter(function (y) { return !sil(y) && varMi(y); });
        if (!kalan.length || ++deneme >= 6) {
          if (kalan.length) log("silinemeyen geçici dosya: " + kalan.length);
          resolve(kalan.length);
          return;
        }
        setTimeout(tur, 400);
      })();
    });
  }
  function klasorDegistir() {
    if (mesgul) return;
    if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
      var bas = String(ayar().ytKlasor || "") || (projeKlasoru ? varsayilanYol(projeKlasoru) : "");
      var r = window.cep.fs.showOpenDialogEx(false, true, uiMetni("YouTube indirmeleri için klasör seç"), bas || null, null);
      if (r && r.data && r.data.length && r.data[0]) {
        var s = ayar();
        s.ytKlasor = String(r.data[0]);
        ayarKaydet();
        klasorGoster();
      }
      return;
    }
    toast("Klasör seçme penceresi bu ortamda yok.", "bad");
  }
  function klasorVarsayilan() {
    if (mesgul) return;
    var s = ayar();
    s.ytKlasor = "";
    ayarKaydet();
    klasorGoster();
  }

  /* ---------------- Bilgi al (ücretsiz) ---------------- */
  async function bilgiAl(ev) {
    if (mesgul || !baslatGecerli(ev)) return;
    var u = Y.urlCoz(el("yt-url") ? el("yt-url").value : "");
    if (!u.ok) { bilgiyiTemizle(); durum(u.mesaj, "bad"); return; }
    var j = isBaslat("bilgi");
    guncelleKutusu("");
    jsNotu(false);
    var say = function (m) { durum(m); };
    try {
      say(Y.ASAMA_METNI.kur);
      var ikili = await hazirla(say, j);
      iptalDenetle(j);
      durum(Y.ASAMA_METNI.bilgi);
      var r = await K.run(ikili.yol, Y.bilgiArgs(u.url, ortakSecenek(ikili.meta)), { timeout: 180000, iptal: j, surecGrubu: true, env: ytOrtam() });
      if (r.iptal) { durum("İptal edildi.", "warn"); return; }
      if (r.code !== 0) {
        if (/\[zaman aşımı\]/.test(String(r.stderr))) throw ytHatasi(hazirHata("ag"));
        throw ytHatasi(Y.hataSinifla(r.stderr, ""));
      }
      var oz = Y.bilgiOzeti(r.stdout);
      if (!oz) throw new Error("yt-dlp video bilgisini okuyamadı.");
      bilgi = oz;
      bilgiUrl = u.url;
      durumlar = Y.kaliteDurumu(oz);
      kalite = Y.varsayilanKalite(durumlar, String(ayar().ytKalite || ""));
      onizlemeCiz();
      jsNotu(Y.uyarilar(r.stderr).jsYok);
      var ipucu = Y.guncellemeIpucu(ikili.meta, Date.now());
      if (ipucu) guncelleKutusu(ipucu.metin);
      var engel = Y.canliEngeli(oz);
      if (engel) durum(engel, "warn");
      else if (!kalite) durum("Bu videoda indirilebilir bir kalite bulunamadı.", "bad");
      else durum(u.listeVardi ? "Oynatma listesinden yalnız bu video indirilir. Kaliteyi seç, İndir'e bas." : "Kaliteyi seç, İndir'e bas.", "good");
      log("bilgi: " + oz.id + " en iyi " + oz.enIyi + "p" + (oz.canli ? " (" + oz.canli + ")" : ""));
      if (!String(ayar().ytKlasor || "")) { await projeKlasoruAl(); klasorGoster(); }
    } catch (e) {
      hataGoster(e);
    } finally {
      isBitir();
    }
  }

  /* ---------------- tek seferlik onay ---------------- */
  var onayDevam = null;
  function onayGoster(devam) {
    var d = el("yt-onay");
    if (!d) { devam(); return; }
    onayDevam = devam;
    if (el("yt-onay-cb")) el("yt-onay-cb").checked = false;
    if (el("yt-onay-tamam")) el("yt-onay-tamam").disabled = true;
    d.hidden = false;
    try { if (el("yt-onay-cb") && el("yt-onay-cb").focus) el("yt-onay-cb").focus(); } catch (e) {}
  }
  function onayKapat() {
    if (el("yt-onay")) el("yt-onay").hidden = true;
    onayDevam = null;
  }
  function onayVer() {
    if (!el("yt-onay-cb") || !el("yt-onay-cb").checked) return;
    var s = ayar();
    s.ytOnay = Y.ONAY_SURUMU;
    ayarKaydet();
    var devam = onayDevam;
    onayKapat();
    log("indirme onayı verildi");
    if (typeof devam === "function") setTimeout(devam, 0);
  }

  /* ---------------- İndir (Pro) ---------------- */
  async function indir(ev) {
    if (mesgul || !baslatGecerli(ev)) return;
    var u = Y.urlCoz(el("yt-url") ? el("yt-url").value : "");
    if (!bilgi || !u.ok || u.url !== bilgiUrl) { durum("Önce Bilgi al'a bas.", "bad"); return; }
    var engel = Y.canliEngeli(bilgi);
    if (engel) { durum(engel, "bad"); return; }
    if (!kalite || !durumlar || !durumlar[kalite] || !durumlar[kalite].acik) { durum("Bir kalite seç.", "bad"); return; }
    if (!Y.onayVarMi(ayar())) { onayGoster(function () { indir(); }); return; }
    if (typeof Pro !== "undefined" && !Pro.gate("youtube", { deneme: true, yeniden: function () { indir(); } })) return;
    var j = isBaslat("indir");
    guncelleKutusu("");
    var sonuc = null;
    try {
      sonuc = await indirmeIsi(j);
      // İndirme bitmişken gelen İptal (dönüştürme / codec yoklaması sırasında): tam dosya silinmez
      if (sonuc && !sonuc.iptal && j.iptalEdildi) sonuc = { iptal: true, korunan: sonuc.dosya || "", donusumdu: false };
      if (sonuc && sonuc.iptal) { iptalSonucu(sonuc); return; }
      if (!sonuc || !sonuc.dosya) throw new Error("İndirilen dosya bulunamadı.");
      // Premiere'e ekleme yarıda kesilemez: İptal bu adımda kapalı (hak ve ekleme birlikte)
      iptalKapali = true;
      dugmeler();
      // Hak yalnız dosya Premiere'e hazır olunca düşer (ekleme adımı projeye bağlı, hakkı etkilemez)
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("youtube", KApp.toast);
      sonDosya = sonuc.dosya;
      jsNotu(sonuc.jsYok);
      ilerleme(1);
      durum(Y.ASAMA_METNI.ice);
      var r = await K.call("KS_importDownloaded", { path: sonuc.dosya, bin: Y.KLASOR_ADI }, 180000);
      // Dosya ve kutu adı kullanıcı içeriği (çevrilmez); her arayüz parçası ayrı metin düğümü
      var ad = { ad: K.path.basename(sonuc.dosya) };
      var not = sonuc.not ? " " + sonuc.not : "";
      if (r && r.ok) {
        durum(r.reused ? ["İndirildi: ", ad, " · bu dosya projede zaten vardı, yeniden eklenmedi.", not]
          : ["İndirildi ve Premiere'e eklendi: ", ad, " · ", { ad: r.bin || Y.KLASOR_ADI }, " kutusu.", not], sonuc.not ? "warn" : "good");
      } else if (r && r.kod === "proje-yok") {
        durum(["İndirildi: ", ad, " · Premiere'de açık proje yok, projeye eklenmedi. Klasörde göster ile bulabilirsin.", not], "warn");
      } else {
        durum(["İndirildi: ", ad, " · Premiere'e eklenemedi: ", String(r && r.error ? r.error : "bilinmeyen hata"), not], "warn");
      }
      if (el("yt-sonuc")) el("yt-sonuc").hidden = false;
      log("indirildi: " + K.path.basename(sonuc.dosya) + (r && r.ok ? " (projede)" : " (projeye eklenmedi)"));
    } catch (e) {
      hataGoster(e);
    } finally {
      isBitir();
    }
  }

  /*
   * İptal sonucu. korunan yoksa indirme yarıda kaldı (yarım dosyalar silindi). korunan varsa indirme
   * bitmişti: tam dosya klasörde durur (Klasörde göster), Premiere'e eklenmez, hak düşmez; yalnız
   * dönüştürme geçicisi ve yarım dosyalar silindi. Yeniden İndir'de yt-dlp dosyayı "zaten indirildi"
   * sayar, yalnız dönüştürme yeniden yapılır.
   */
  function iptalSonucu(s) {
    if (!s.korunan) { durum("İptal edildi. Yarım dosyalar silindi.", "warn"); return; }
    sonDosya = s.korunan;
    var ad = { ad: K.path.basename(s.korunan) };
    durum(s.donusumdu ? ["Dönüştürme iptal edildi. İndirilen dosya klasörde duruyor, Premiere'e eklenmedi: ", ad]
      : ["İptal edildi. İndirme bitmişti; dosya klasörde duruyor, Premiere'e eklenmedi: ", ad], "warn");
    if (el("yt-sonuc")) el("yt-sonuc").hidden = false;
    log("iptal: indirilen dosya korundu" + (s.donusumdu ? " (donusturme)" : " (indirme bitmisti)"));
  }

  /*
   * yt-dlp ile indir, gerekirse Premiere için dönüştür. Döner: { dosya, kaynak, not, jsYok } ya da
   * { iptal: true, korunan?, donusumdu? }. İndirme sırasında İptal: bu indirmenin oluşturduğu her şey (ve
   * videonun eski yarım dosyaları) silinir. İndirme bittikten sonra İptal (codec yoklaması, dönüştürme):
   * tamamlanmış dosya KALIR, yalnız dönüştürme geçicisi ve yarım / ara dosyalar silinir. Hatada yalnız
   * yarım / ara dosyalar.
   */
  async function indirmeIsi(j) {
    // İş başladığı andaki video ve kalite (bekleme sırasında arayüz değişse de bu indirme bunlarla sürer)
    var v = bilgi, url = bilgiUrl, k = kalite, etiket = Y.dosyaEtiketi(kalite, durumlar);
    var say = function (m) { durum(m); };
    say(Y.ASAMA_METNI.kur);
    var ikili = await hazirla(say, j);
    iptalDenetle(j);
    var ff = await ffmpegHazirla(say, j);
    iptalDenetle(j);
    var hedef = await hedefKlasor();
    iptalDenetle(j);
    klasorHazirla(hedef.yol);
    var onceki = listele(hedef.yol);
    var id = v.id;
    var o = ortakSecenek(ikili.meta);
    var args = Y.indirmeArgs({ url: url, kalite: k, klasor: hedef.yol, ffmpeg: ff, dikey: v.dikey, etiket: etiket,
      surum: o.surum, jsRuntime: o.jsRuntime, proxy: o.proxy });
    var iz = Y.izleyici({ kalite: k, formatlar: v.formatlar, sesBoyutu: v.sesBoyutu });
    var dosya = "";
    var tOut = Y.satirTamponu(), tErr = Y.satirTamponu();
    function isle(satirlar) {
      satirlar.forEach(function (s) {
        var x = Y.satirCoz(s);
        if (!x) return;
        if (x.tur === "dosya") { dosya = x.yol; return; }
        var d = iz.besle(x);
        if (d) ilerlemeGoster(d);
      });
    }
    ilerlemeGoster({ asama: "indir", oran: 0 });
    log("indirme: " + id + " " + k + " → " + K.path.basename(hedef.yol));
    var r = await K.run(ikili.yol, args, {
      timeout: 6 * 3600000, iptal: j, surecGrubu: true, env: ytOrtam(),
      onStdout: function (p) { try { isle(tOut.besle(p)); } catch (e) {} },
      onStderr: function (p) { try { isle(tErr.besle(p)); } catch (e) {} }
    });
    isle(tOut.bitir());
    isle(tErr.bitir());
    if (r.iptal) {
      await temizle(hedef.yol, Y.iptalSilinecekler(onceki, listele(hedef.yol), id));
      return { iptal: true };
    }
    if (r.code !== 0) {
      await temizle(hedef.yol, Y.hataSilinecekler(listele(hedef.yol), id));
      if (/\[zaman aşımı\]/.test(String(r.stderr))) throw ytHatasi(hazirHata("ag"));
      throw ytHatasi(Y.hataSinifla(r.stderr, r.stdout));
    }
    if (!dosya || !varMi(dosya)) {
      var bulunan = Y.sonDosyaBul(listele(hedef.yol), id, k, onceki, etiket);
      dosya = bulunan ? K.path.join(hedef.yol, bulunan) : "";
    }
    if (!dosya || !varMi(dosya)) throw new Error("İndirilen dosya bulunamadı.");
    var jsYok = Y.uyarilar(r.stderr).jsYok;
    // Buradan sonra İptal tamamlanmış indirmeyi silmez
    if (j.iptalEdildi) return { iptal: true, korunan: dosya, donusumdu: false };
    var dn = await premiereIcin(dosya, ff, j);
    if (dn.iptal) {
      await temizle(hedef.yol, Y.hataSilinecekler(listele(hedef.yol), id));
      return { iptal: true, korunan: varMi(dosya) ? dosya : "", donusumdu: !!dn.donusumdu };
    }
    return { dosya: dn.dosya, kaynak: dosya, not: dn.not, jsYok: jsYok, klasor: hedef.yol };
  }

  async function kodlayicilariAl(ff, j) {
    if (kodlayiciOnbellek[ff]) return kodlayiciOnbellek[ff];
    var r = await K.run(ff, ["-hide_banner", "-encoders"], { timeout: 30000, iptal: j || null });
    var l = Y.kodlayicilar(String(r.stdout || "") + "\n" + String(r.stderr || ""));
    if (l.length) kodlayiciOnbellek[ff] = l;
    return l;
  }

  /*
   * Premiere uyumu: ffmpeg -i ile codec'e bak; H.264/HEVC + AAC MP4 değilse dönüştür (kodlayıcılar
   * sırayla denenir: donanım kodlayıcı ekran kartı yoksa açılmayabilir). Geçici ad .suflo-tmp.mp4;
   * başarıda özgün dosyanın yerini alır. Döner: { dosya, not } ya da { iptal: true, donusumdu }
   * (donusumdu: İptal dönüştürme sürerken geldi).
   */
  async function premiereIcin(dosya, ff, j) {
    var p = await K.run(ff, ["-hide_banner", "-i", dosya], { timeout: 60000, iptal: j });
    if (p.iptal || j.iptalEdildi) return { iptal: true, donusumdu: false };
    var akis = Y.akisBilgisi(p.stderr);
    var karar = Y.donusumKarari(akis, dosya);
    if (!karar.gerekli) return { dosya: dosya, not: "" };
    var adaylar = karar.video === "encode" ? Y.kodlayiciSec(await kodlayicilariAl(ff, j), platform()) : [""];
    if (j.iptalEdildi) return { iptal: true, donusumdu: false };
    if (!adaylar.length) throw new Error("Bu ffmpeg'de H.264 kodlayıcısı yok; video Premiere için dönüştürülemedi. Ayarlar › ffmpeg'den Suflo'nun ffmpeg'ini kur.");
    log("dönüştürme: " + akis.video + "/" + akis.ses + " " + akis.yukseklik + "p → H.264/AAC MP4");
    // 4K (kısa kenar 1440'tan büyük) kodlama uzun sürer: ilerleme satırı bunu söylemeye devam eder
    ekNot = karar.video === "encode" && Math.min(akis.genislik || 0, akis.yukseklik || 0) > 1440 ? "4K dönüştürme uzun sürer" : "";
    try {
      return await donusturVeYerlestir(dosya, ff, j, akis, karar, adaylar);
    } finally {
      ekNot = "";
    }
  }

  async function donusturVeYerlestir(dosya, ff, j, akis, karar, adaylar) {
    var adlar = Y.donusumAdlari(dosya, karar.sesDosyasi);
    var kullanilan = null, sonHata = "";
    for (var i = 0; i < adaylar.length && kullanilan === null; i++) {
      var bas = Date.now();
      sil(adlar.gecici);
      ilerlemeGoster({ asama: "donustur", oran: 0 });
      var r = await K.run(ff, Y.donusumArgs({ girdi: dosya, cikti: adlar.gecici, karar: karar, kodlayici: adaylar[i], yukseklik: akis.yukseklik }), {
        timeout: 12 * 3600000, iptal: j,
        onStderr: function (parca) {
          var t = Y.ffmpegZaman(parca);
          if (t === null || !(akis.sure > 0)) return;
          var oran = Math.min(1, t / akis.sure);
          ilerlemeGoster({ asama: "donustur", oran: oran, eta: Y.kalanTahmini(oran, (Date.now() - bas) / 1000) });
        }
      });
      if (r.iptal) { sil(adlar.gecici); return { iptal: true, donusumdu: true }; }
      var boyut = 0;
      try { boyut = K.fs.statSync(adlar.gecici).size; } catch (eS) {}
      if (r.code === 0 && boyut > 0) { kullanilan = adaylar[i]; break; }
      sil(adlar.gecici);
      sonHata = String(r.stderr || "");
      log("dönüştürme denemesi başarısız (" + (adaylar[i] || "kopya") + "): " + sonHata.trim().split(/\r?\n/).pop());
      // Yalnız işletim sisteminin disk hatası; video adındaki "Disk Is Full" sayılmaz (yollar ayıklanır)
      if (Y.ffmpegDiskDolu(sonHata, [dosya, adlar.gecici, adlar.son])) throw ytHatasi(hazirHata("disk"));
    }
    if (kullanilan === null) throw new Error("Video Premiere için dönüştürülemedi: " + (sonHata.trim().split(/\r?\n/).pop() || "ffmpeg hata verdi"));
    // rename hedefi değiştirir (Windows'ta da); özgün dosya ancak yenisi yerine oturunca silinir
    if (adlar.son !== dosya) sil(adlar.son);
    K.fs.renameSync(adlar.gecici, adlar.son);
    if (adlar.son !== dosya) sil(dosya);
    return { dosya: adlar.son, not: Y.donusumNotu(kullanilan, akis) };
  }

  /* ---------------- Güncelle ---------------- */
  /*
   * Doctor ve "Güncelle" düğmesi: aynı doğrulanmış indirme. Döner: { surum, guncel }.
   * zorla: GitHub'daki sürüm kurulu olanla aynı olsa da yeniden indirip doğrular ("yt-dlp çalıştırılamadı":
   * dosya doğrulanıyor ama açılamıyor; "zaten güncel" deyip hiçbir şey yapmamak hatayı çözmezdi).
   */
  async function guncelle(say, iptal, zorla) {
    if (mesgul && isTuru !== "guncelle") throw new Error("YouTube indirici çalışıyor; bitince tekrar dene.");
    var r = await kur(say || function () {}, iptal || null, !!zorla);
    return { surum: r.meta ? r.meta.surum : "", guncel: !!r.guncel };
  }
  async function guncelleTikla(ev) {
    if (mesgul || !baslatGecerli(ev)) return;
    var zorla = zorlaGuncelle;
    var j = isBaslat("guncelle");
    try {
      var r = await guncelle(function (m) { durum(m); }, j, zorla);
      guncelleKutusu("");
      durum(r.guncel ? "yt-dlp zaten güncel: " + r.surum : zorla ? "yt-dlp yeniden indirildi ve doğrulandı: " + r.surum : "yt-dlp güncellendi: " + r.surum, "good");
    } catch (e) {
      hataGoster(e);
    } finally {
      isBitir();
    }
  }

  /* ---------------- Suflo Doctor ---------------- */
  async function doctorSatirlari() {
    if (!K.nodeOK || !K.fs || !K.path) return [];
    var kurulu = varMi(exeYolu());
    var meta = metaOku();
    var v = kurulu ? await dogrulanmisIkili() : null;
    var enSon = "";
    if (kurulu) {
      var api = await sonSurum();
      if (api) enSon = api.etiket;
    }
    if (v && enSon && Y.surumKarsilastir(enSon, v.meta.surum) <= 0) {
      v.meta.denetim = Date.now();
      try { metaYaz(v.meta); } catch (e) {}
    }
    var s = Y.doctorSatiri({ kurulu: kurulu, dogrulandi: !!v, meta: v ? v.meta : meta, enSon: enSon, simdi: Date.now() });
    return [{ status: s.status, title: s.title, detail: s.detail, action: s.action, group: "system" }];
  }

  /* ---------------- Klasörde göster / Yapıştır ---------------- */
  async function klasordeGoster() {
    if (!sonDosya) return;
    var r = null;
    try {
      if (K.MAC) r = await K.run("/usr/bin/open", ["-R", sonDosya], { timeout: 10000 });
      else if (platform() === "win32") r = await K.run("explorer.exe", ["/select,", sonDosya], { timeout: 10000 });
      else r = await K.run("xdg-open", [K.path.dirname(sonDosya)], { timeout: 10000 });
    } catch (e) { r = null; }
    if (!r) toast("Klasör açılamadı.", "bad");
  }
  function yapistir() {
    var inp = el("yt-url");
    if (!inp || mesgul) return;
    function koy(t) {
      if (t) { inp.value = String(t).trim(); girdiDegisti(); }
      try { inp.focus(); } catch (e) {}
    }
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(koy, function () { yedekYapistir(); });
        return;
      }
    } catch (e) {}
    yedekYapistir();
    function yedekYapistir() {
      var once = inp.value;
      try { inp.focus(); inp.select(); document.execCommand("paste"); } catch (e2) {}
      if (inp.value && inp.value !== once) { girdiDegisti(); return; }
      toast(K.MAC ? "Panoya erişilemedi: Cmd+V ile yapıştır." : "Panoya erişilemedi: Ctrl+V ile yapıştır.", "warn");
    }
  }
  // Bağlantı değişince eski önizleme ve kalite seçimi geçersiz
  function girdiDegisti() {
    if (!bilgi || mesgul) return;
    var u = Y.urlCoz(el("yt-url").value);
    if (!u.ok || u.url !== bilgiUrl) { bilgiyiTemizle(); durum(""); }
  }

  /* ---------------- başlatma ---------------- */
  // Panel açılışında Premiere'e / ağa gidilmez (K.call yalnız sekme açılınca ve düğmelerde)
  function init() {
    if (!el("tab-youtube") || !Y) return;
    var url = el("yt-url");
    if (url) {
      url.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); bilgiAl(); } });
      url.addEventListener("input", girdiDegisti);
    }
    if (el("yt-bilgi")) el("yt-bilgi").addEventListener("click", bilgiAl);
    if (el("yt-yapistir")) el("yt-yapistir").addEventListener("click", yapistir);
    if (el("yt-indir")) el("yt-indir").addEventListener("click", indir);
    if (el("yt-iptal")) el("yt-iptal").addEventListener("click", iptalEt);
    if (el("yt-klasor-degistir")) el("yt-klasor-degistir").addEventListener("click", klasorDegistir);
    if (el("yt-klasor-varsayilan")) el("yt-klasor-varsayilan").addEventListener("click", klasorVarsayilan);
    if (el("yt-klasorde-goster")) el("yt-klasorde-goster").addEventListener("click", klasordeGoster);
    if (el("yt-guncelle")) el("yt-guncelle").addEventListener("click", guncelleTikla);
    if (el("yt-onay-cb")) el("yt-onay-cb").addEventListener("change", function () { if (el("yt-onay-tamam")) el("yt-onay-tamam").disabled = !el("yt-onay-cb").checked; });
    if (el("yt-onay-tamam")) el("yt-onay-tamam").addEventListener("click", onayVer);
    if (el("yt-onay-vazgec")) el("yt-onay-vazgec").addEventListener("click", onayKapat);
    if (el("yt-onay")) el("yt-onay").addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); onayKapat(); } });
    Y.KALITELER.forEach(function (k) {
      var b = el("yt-k-" + k);
      if (b) b.addEventListener("click", function () { kaliteSec(k); });
    });
    if (window.KApp && KApp.onTab) KApp.onTab("youtube", function () {
      klasorGoster();
      if (!mesgul && !String(ayar().ytKlasor || "")) projeKlasoruAl().then(klasorGoster, function () {});
    });
    klasorGoster();
    dugmeler();
  }

  return {
    init: init,
    bilgiAl: bilgiAl,
    indir: indir,
    iptalEt: iptalEt,
    guncelle: guncelle,
    doctorSatirlari: doctorSatirlari,
    kaliteSec: kaliteSec,
    mesgul: function () { return mesgul; },
    _durum: function () { return { bilgi: bilgi, bilgiUrl: bilgiUrl, kalite: kalite, durumlar: durumlar, sonDosya: sonDosya, mesgul: mesgul }; },
    _ytDir: ytDir
  };
})();
