/*
 * Suflo — Yazı kütüphanesi (MOGRT text animasyonları)
 *
 * Rush düzeni: solda kategori menüsü (adet rozetleriyle), sağda büyük kartlar.
 * Kullanıcının mogrt klasörünü tarar, her paketin içindeki thumb.png'yi
 * (mogrt bir ZIP arşividir) önbelleğe çıkarıp kartlarda gösterir; "Ekle"
 * playhead'e yerleştirir (host: KS_placeMogrt). Kalp = favori (ayarlarda kalıcı).
 *
 * Suflo Originals paketle birlikte salt-okunur gelir. Kullanicinin kendi
 * dosyalari ise ayri klasorden okunur; hicbiri tasinmaz veya degistirilmez.
 */
window.KLib = (function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  var paketler = [];        // gercek paketler + ucretsiz kullanici icin Pro vitrin kartlari
  var arama = "";
  var kategori = "mogrt";   // "mogrt" | "captions" | "custom" | "buton" | "fav"
  var busyKart = null;
  var taraNo = 0;

  /* ---------------- klasörler ---------------- */

  function kokDir() {
    if (!K.nodeOK || !K.path || !K.os) return "";
    var sp = K.settingsPath ? K.settingsPath() : null;
    return sp ? K.path.dirname(sp) : K.path.join(K.os.homedir(), "Kesit");
  }
  function mogrtDir() {
    if (!K.nodeOK || !K.fs || !K.path) return "";
    var d = K.path.join(kokDir(), "mogrt");
    try { if (!K.fs.existsSync(d)) K.fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }
  function builtinMogrtDir() {
    if (!K.nodeOK || !K.path || !K.extensionPath) return "";
    var root = K.extensionPath();
    return root ? K.path.join(root, "content", "mogrt") : "";
  }
  // Suflo Pro Paketi: musteri Lemon Squeezy'den indirdigi paketi gosterir.
  // Icerik eklentiyle GELMEZ (public repoda olsa bedava olurdu) — sadece
  // satin alan lisanslinin gosterdigi klasorden okunur. Pakette "mogrt" alt
  // klasoru varsa onu, yoksa kokun kendisini tarariz (topla zaten .mogrt suzer).
  function proPackMogrtDir() {
    if (!K.nodeOK || !K.fs || !K.path) return "";
    var pack = String(K.settings().proPackKlasor || "").trim();
    if (!pack || !K.fs.existsSync(pack)) return "";
    var alt = K.path.join(pack, "mogrt");
    try { if (K.fs.existsSync(alt) && K.fs.statSync(alt).isDirectory()) return alt; } catch (e) {}
    return pack;
  }
  function adobeMogrtDir() {
    // CEP USER_DATA/Kesit'in bir ustu Adobe'nin ortak kullanici veri klasorudur:
    // Windows'ta AppData/Roaming, macOS'ta Library/Application Support.
    if (!K.nodeOK || !K.fs || !K.path) return "";
    var dir = K.path.join(K.path.dirname(kokDir()), "Adobe", "Common", "Motion Graphics Templates");
    try { return K.fs.existsSync(dir) && K.fs.statSync(dir).isDirectory() ? dir : ""; } catch (e) { return ""; }
  }
  function pathKey(p) { return String(p || "").replace(/\\/g, "/").toLowerCase(); }

  function mogrtNameKey(value) {
    var base = String(value || "").replace(/\\/g, "/").split("/").pop();
    base = base.replace(/\.mogrt$/i, "");
    base = base.replace(/^SUFLO\s+(?:TEXT|BUTON|MOGRT)\s*-\s*(?:\d+[.\)]?\s*)?/i, "");
    return base.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, "");
  }

  // Saf yazi hareketleri ustte kalir. Lower third, yorum, liste, logo, ikon,
  // subtitle ve sosyal paketler metin icerebilse de baska bir kurgu amacidir;
  // "Diger Animasyonlar" bolumunde gosterilir.
  function textAnimationMi(relativePath) {
    var rel = String(relativePath || "").replace(/\\/g, "/");
    return /(^|\/)(?:Text Animations?|Text Effects?|Typewriter|Text MOGRT Collection)(?:\/|$)/i.test(rel);
  }

  function mogrtGrubu(ad, relativePath, sourceKind) {
    var hay = String(relativePath || "").replace(/\\/g, "/") + " " + String(ad || "");
    if (/^SUFLO\s+BUTON\b/i.test(ad)) return "buton";
    if (sourceKind === "adobe" && /(?:^|\/)(?:Captioneer|Captions?(?: and)? Subtitles?)(?:\/|$)/i.test(hay)) return "caption";
    if (/\b(?:subtitles?|captions?)\b/i.test(hay)) return "caption";
    // Bir MOGRT metin kontrolu tasisa bile asil isi logo, yorum, lower third,
    // liste, ikon veya sosyal arayuzse saf "Yazi Animasyonu" degildir.
    if (/\b(?:icons?|speech bubble|thinking bubble|logo|lower[\s_-]*third|comments?|list elements?|podcast title|camera overlay|focus frame|shapes?|transition|electro|energy seamless|grid|magic sparks?)\b/i.test(hay)) return "other";
    if (/^SUFLO\s+TEXT\b/i.test(ad) || textAnimationMi(relativePath)) return "text";
    return "other";
  }

  function pathHash(value) {
    var h = 2166136261, text = pathKey(value);
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function builtinCatalog() {
    var out = { byFile: {}, aliases: {} };
    var dir = builtinMogrtDir();
    if (!dir) return out;
    try {
      var raw = JSON.parse(K.fs.readFileSync(K.path.join(dir, "catalog.json"), "utf8"));
      (raw.items || []).forEach(function (item) {
        if (!item || !item.file) return;
        out.byFile[String(item.file).toLowerCase()] = item;
        [item.file, item.source, item.name].forEach(function (alias) {
          var key = mogrtNameKey(alias);
          if (key) out.aliases[key] = true;
        });
      });
    } catch (e) { K.log("[yazi] Suflo Originals katalogu okunamadi: " + (e && e.message)); }
    return out;
  }

  // Ucretsiz kurulumdaki satis vitrini. Burada yalniz isimler ve kucuk
  // onizlemeler vardir; MOGRT dosyalari public pakete girmez.
  async function showcaseCatalog() {
    if (K.nodeOK && K.fs && K.path && K.extensionPath) {
      try {
        var root = K.extensionPath();
        if (root) {
          var raw = JSON.parse(K.fs.readFileSync(K.path.join(root, "assets", "pro-mogrt-showcase", "catalog.json"), "utf8"));
          return Array.isArray(raw.items) ? raw.items : [];
        }
      } catch (e) { K.log("[yazi] Pro vitrin katalogu okunamadi: " + (e && e.message)); }
    }
    // Tarayici onizleme modu Node dosya sistemine sahip degildir. Public
    // katalog yalniz ad + kucuk gorsel tasidigi icin ayni vitrini HTTP'den oku.
    try {
      if (typeof fetch === "function") {
        var res = await fetch("assets/pro-mogrt-showcase/catalog.json", { cache: "no-store" });
        if (res.ok) {
          var webRaw = await res.json();
          return Array.isArray(webRaw.items) ? webRaw.items : [];
        }
      }
    } catch (e2) { K.log("[yazi] Pro web vitrini okunamadi: " + (e2 && e2.message)); }
    return [];
  }

  function showcasePreview(item) {
    var rel = String(item && item.preview || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!/^previews\/[a-z0-9._-]+$/i.test(rel)) return null;
    return "assets/pro-mogrt-showcase/" + rel;
  }

  function showcaseVideo(item) {
    var rel = String(item && item.video || "").replace(/\\/g, "/").replace(/^\/+/, "");
    if (!/^previews\/[a-z0-9._-]+\.webm$/i.test(rel)) return null;
    return "assets/pro-mogrt-showcase/" + rel;
  }
  function cacheDir() {
    var d = K.path.join(kokDir(), "mogrt-cache");
    try { if (!K.fs.existsSync(d)) K.fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
  }

  /* ---------------- favoriler (ayarlarda kalıcı) ---------------- */

  function favlar() {
    var s = K.settings();
    if (!s.mogrtFavs) s.mogrtFavs = [];
    return s.mogrtFavs;
  }
  function favMi(ad) { return favlar().indexOf(ad) !== -1; }
  function favDegistir(ad) {
    var f = favlar();
    var i = f.indexOf(ad);
    if (i === -1) f.push(ad); else f.splice(i, 1);
    K.saveSettings();
    sayaclar();
  }

  /* ---------------- tarama + thumbnail ---------------- */

  async function thumbCikar(mogrtYolu, adSlug) {
    var hedefDir = K.path.join(cacheDir(), adSlug);
    var thumbYolu = K.path.join(hedefDir, "thumb.png");
    var videoYolu = K.path.join(hedefDir, "thumb.mp4");
    if (K.fs.existsSync(thumbYolu)) {
      return { thumb: thumbYolu, video: K.fs.existsSync(videoYolu) ? videoYolu : null };
    }
    try {
      var tmpZip = K.path.join(cacheDir(), adSlug + ".zip");
      K.fs.copyFileSync(mogrtYolu, tmpZip);
      await K.unzip(tmpZip, hedefDir);
      try { K.fs.unlinkSync(tmpZip); } catch (e1) {}
      if (K.fs.existsSync(thumbYolu)) {
        return { thumb: thumbYolu, video: K.fs.existsSync(videoYolu) ? videoYolu : null };
      }
      var pngler = K.fs.readdirSync(hedefDir).filter(function (f) { return /\.png$/i.test(f); });
      if (pngler.length) return { thumb: K.path.join(hedefDir, pngler[0]), video: K.fs.existsSync(videoYolu) ? videoYolu : null };
    } catch (e) { K.log("[yazi] thumb cikarilamadi: " + adSlug + " — " + (e && e.message)); }
    return null;
  }

  function dataUri(pngYolu) {
    try { return "data:image/png;base64," + K.fs.readFileSync(pngYolu).toString("base64"); }
    catch (e) { return null; }
  }

  function vitrinEkle(items, gorulen) {
    (items || []).forEach(function (item, si) {
      if (!item || !item.name) return;
      var display = String(item.name);
      var uniqueKey = mogrtNameKey(item.match || display) || display.toLowerCase();
      if (gorulen[uniqueKey]) return;
      var preview = showcasePreview(item);
      if (!preview) return;
      gorulen[uniqueKey] = 1;
      paketler.push({
        path: "",
        ad: String(item.id || ("suflo-pro-preview-" + si)),
        display: display,
        thumb: preview,
        video: showcaseVideo(item),
        builtin: false,
        pro: true,
        showcase: true,
        group: "text",
        category: String(item.category || "Text Animation")
      });
    });
  }

  async function tara() {
    var buTarama = ++taraNo;
    if (!K.nodeOK || !K.fs || !K.path) {
      paketler = [];
      if (typeof Pro !== "undefined" && !Pro.isPro()) vitrinEkle(await showcaseCatalog(), {});
      sayaclar();
      ciz();
      altyaziStilleriniGonder();
      return;
    }
    /*
     * Uc kaynak: paketle gelen Suflo Originals + panelin veri klasoru +
     * kullanicinin gosterdigi EK klasor
     * (Ayarlar > Yazi kutuphanesi). Boylece 20 GB'lik bir arsivi tasimak
     * gerekmez — oldugu yerden okunur. Vault gibi derin arsivlerin tum alt
     * klasorlerine iner; gizli klasorleri ve makul olmayan derinligi atlar.
     */
    function topla(dir, limit, derinlik) {
      var out = [];
      limit = limit || 5000;
      derinlik = derinlik === undefined ? 12 : derinlik;
      if (!dir || derinlik < 0 || !K.fs.existsSync(dir)) return out;
      try {
        K.fs.readdirSync(dir).forEach(function (f) {
          if (out.length >= limit || f.charAt(0) === ".") return;
          var tam = K.path.join(dir, f);
          try {
            if (/\.mogrt$/i.test(f)) out.push(tam);
            else if (K.fs.statSync(tam).isDirectory()) {
              out = out.concat(topla(tam, limit - out.length, derinlik - 1));
            }
          } catch (e1) {}
        });
      } catch (e) {}
      return out;
    }

    var builtinDir = builtinMogrtDir();
    var builtinFiles = topla(builtinDir);
    var builtinSet = {};
    builtinFiles.forEach(function (p) { builtinSet[pathKey(p)] = 1; });
    var catalogInfo = builtinCatalog();
    var catalog = catalogInfo.byFile;
    var yollar = builtinFiles.concat(topla(mogrtDir()));
    var ek = (K.settings().mogrtEkKlasor || "").trim();
    if (ek && K.fs.existsSync(ek)) yollar = yollar.concat(topla(ek));
    // Suflo Pro Paketi (satin alanin gosterdigi klasor) — resmi animasyonlar
    var proRoot = proPackMogrtDir();
    var proPackFiles = topla(proRoot);
    var proPackSet = {};
    proPackFiles.forEach(function (p) { proPackSet[pathKey(p)] = 1; });
    yollar = yollar.concat(proPackFiles);
    // Premiere'in Graphic Templates paneline kurulmus kullanici MOGRT'lari.
    // Dosyalar tasinmaz; Captioneer gibi yerel altyazi paketleri Suflo'da
    // otomatik "Altyazi Sablonlari" bolumunde gorunur.
    var adobeRoot = adobeMogrtDir();
    var adobeFiles = topla(adobeRoot, 5000, 8);
    var adobeSet = {};
    adobeFiles.forEach(function (p) { adobeSet[pathKey(p)] = 1; });
    yollar = yollar.concat(adobeFiles);

    // ayni gorunen ada sahip cift dosyalari tekle (Suflo Originals once gelir)
    var gorulen = {};
    paketler = [];
    var thumbQueue = [];
    for (var i = 0; i < yollar.length; i++) {
      var tam2 = yollar[i];
      var ad = K.path.basename(tam2).replace(/\.mogrt$/i, "");
      var isBuiltin = !!builtinSet[pathKey(tam2)];
      var isPro = !isBuiltin && !!proPackSet[pathKey(tam2)];
      var isAdobe = !isBuiltin && !isPro && !!adobeSet[pathKey(tam2)];
      // Adobe ana klasorunde duran eski Subtitle 01-05 dosyalari Premiere'de
      // hata veren, genellenmis kalintilar. Captioneer alt klasorundeki gercek
      // sablonlara dokunmadan yalniz bu bes kok dosyayi Suflo'da gizle.
      if (isAdobe && /^Subtitle\s+0[1-5]$/i.test(ad) &&
          pathKey(K.path.dirname(tam2)) === pathKey(adobeRoot)) continue;
      var meta = isBuiltin ? catalog[K.path.basename(tam2).toLowerCase()] : null;
      // Vault'ta ayni Suflo Original farkli bir dosya adi/klasorle bulunabilir.
      // Katalogdaki kaynak adlari bu kopyalari yakalar; yerlesik kart tek kalir.
      if (!isBuiltin && catalogInfo.aliases[mogrtNameKey(ad)]) continue;
      var butonMu = /^SUFLO\s+BUTON\b/i.test(ad);
      var display = meta && meta.name ? String(meta.name) : ad.replace(/^SUFLO\s+(?:TEXT|BUTON|MOGRT)\s*-\s*(?:\d+[.\)]?\s*)?/i, "");
      var uniqueKey = mogrtNameKey(display) || display.toLowerCase();
      if (gorulen[uniqueKey]) continue;
      gorulen[uniqueKey] = 1;
      var slug = (ad.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 52) || ("paket-" + i)) + "-" + pathHash(tam2);
      var relPath = !isBuiltin && ek ? tam2.slice(ek.length).replace(/^[\\\/]+/, "") : "";
      var relPro = isPro && proRoot ? tam2.slice(proRoot.length).replace(/^[\\\/]+/, "") : "";
      var relAdobe = isAdobe && adobeRoot ? tam2.slice(adobeRoot.length).replace(/^[\\\/]+/, "") : "";
      var group = butonMu ? "buton" : (isBuiltin ? "text" : mogrtGrubu(ad, relPro || relPath || relAdobe, isAdobe ? "adobe" : (isPro ? "pro" : "personal")));
      var proFolder = relPro && relPro.indexOf(K.path.sep) !== -1 ? relPro.split(K.path.sep)[0] : "";
      if (!proFolder && relPro.indexOf("/") !== -1) proFolder = relPro.split("/")[0];
      var paket = {
        path: tam2,
        ad: ad,
        display: display,
        thumb: null,
        builtin: isBuiltin,
        pro: isPro,
        localAdobe: isAdobe,
        group: group,
        category: meta && meta.category ? String(meta.category) :
          (group === "text" ? "Text Animation" : (group === "caption" ? "Premiere Subtitle Template" : (proFolder ? proFolder.replace(/[-_]+/g, " ") : "Other Animation")))
      };
      paketler.push(paket);
      thumbQueue.push({ paket: paket, slug: slug });
    }

    // Lisansi olmayan kullanici gercek dosyalar kurulmamissa bile urunun ne
    // sundugunu gorur. Ayni efekt diskte zaten varsa sanal kart eklenmez.
    if (typeof Pro !== "undefined" && !Pro.isPro()) {
      vitrinEkle(await showcaseCatalog(), gorulen);
    }
    // Kart adlari ve sayaclar ONCE gorunsun. Buyuk arsivlerde thumbnail acma
    // saniyeler surebilir; eski akis hepsi bitene dek 0/bos ekran gosteriyordu.
    sayaclar();
    ciz();
    altyaziStilleriniGonder();

    for (var qi = 0; qi < thumbQueue.length; qi++) {
      if (buTarama !== taraNo) return;
      var q = thumbQueue[qi];
      var tp = await thumbCikar(q.paket.path, q.slug);
      if (buTarama !== taraNo) return;
      if (tp && tp.thumb) q.paket.thumb = dataUri(tp.thumb);
      if (tp && tp.video) q.paket.previewVideo = "file:///" + tp.video.replace(/\\/g, "/");
      // Onizlemeleri kucuk partilerle ekrana getir; her dosyada tum grid'i
      // yeniden kurup paneli titretme.
      if ((qi + 1) % 8 === 0 || qi === thumbQueue.length - 1) {
        ciz();
        altyaziStilleriniGonder();
      }
    }
  }

  /* ---------------- çizim ---------------- */

  function altyaziStilleriniGonder() {
    if (window.KCaptions && typeof window.KCaptions.refreshMogrtStyles === "function") {
      window.KCaptions.refreshMogrtStyles(paketler.filter(function (p) {
        return p.group === "caption" && !p.showcase;
      }));
    }
  }

  function sayaclar() {
    var s1 = el("yazi-sayac");
    if (s1) s1.textContent = String(paketler.filter(function (p) { return p.group === "text"; }).length);
    var s0 = el("custom-sayac");
    if (s0) s0.textContent = String(paketler.filter(function (p) { return p.group === "other"; }).length);
    var sc = el("caption-sayac");
    if (sc) sc.textContent = String(paketler.filter(function (p) { return p.group === "caption"; }).length);
    var sb = el("buton-sayac");
    if (sb) sb.textContent = String(paketler.filter(function (p) { return p.group === "buton"; }).length);
    var favSayisi = paketler.filter(function (p) { return favMi(p.ad); }).length;
    var s2 = el("fav-sayac"); if (s2) s2.textContent = String(favSayisi);
  }

  function ciz() {
    var grid = el("mogrt-grid");
    var bos = el("mogrt-bos");
    if (!grid) return;

    var liste = paketler.filter(function (p) {
      if (kategori === "mogrt" && p.group !== "text") return false;
      if (kategori === "captions" && p.group !== "caption") return false;
      if (kategori === "custom" && p.group !== "other") return false;
      if (kategori === "buton" && p.group !== "buton") return false;
      if (kategori === "fav" && !favMi(p.ad)) return false;
      return !arama || (p.display + " " + p.ad + " " + p.category).toLowerCase().indexOf(arama) !== -1;
    });

    var baslik = el("ki-baslik"), alt = el("ki-alt");
    if (baslik) baslik.textContent = kategori === "fav"
      ? "Favoriler"
      : (kategori === "buton" ? "Butonlar"
        : (kategori === "captions" ? "Altyazı Şablonları" : (kategori === "custom" ? "Diğer Animasyonlar" : "Yazı Animasyonları")));
    var vitrinSayisi = liste.filter(function (p) { return p.showcase; }).length;
    if (alt) alt.textContent = liste.length
      ? (vitrinSayisi === liste.length
        ? vitrinSayisi + " Pro efekti · kilidi açınca timeline'a hazır"
        : (vitrinSayisi
          ? liste.length + " efekt · " + vitrinSayisi + " Pro önizlemesi"
          : liste.length + " paket timeline'a hazır"))
      : (kategori === "fav"
        ? "kalbe tıklayıp favori ekle"
        : (kategori === "captions" ? "Premiere Graphic Templates klasöründeki yerel subtitle MOGRT'ları" : (kategori === "custom" ? "logo, ikon, lower third ve diğer MOGRT paketleri" : "Suflo Originals + saf text efektleri")));

    grid.innerHTML = "";
    if (bos) bos.hidden = paketler.length > 0;
    if (!liste.length && paketler.length) {
      grid.innerHTML = '<p class="hint" style="grid-column:1/-1">' +
        (kategori === "fav"
          ? "Henüz favori yok — kartların kalbine tıkla."
          : (kategori === "custom" ? "Bağlı klasörde gösterilecek diğer animasyon yok." : "Aramayla eşleşen yazı animasyonu yok.")) + "</p>";
      return;
    }

    liste.forEach(function (p) {
      var kart = document.createElement("div");
      var kilitli = !!p.showcase || (typeof Pro !== "undefined" && !Pro.isPro());
      kart.className = "mogrt-kart" + (kilitli ? " locked" : "");
      kart.setAttribute("role", "group");
      kart.setAttribute("aria-label", p.display + " · " + (kilitli ? "Suflo Pro efekti, kilitli" : "timeline'a eklenebilir MOGRT"));
      var kaynak = p.builtin ? "SUFLO ORIGINAL" : (p.pro || p.showcase ? "SUFLO PRO" : (p.localAdobe ? "PREMIERE LOCAL" : "PERSONAL MOGRT"));
      var aksiyon = kilitli
        ? '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg><span>LOCKED</span>'
        : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4"/></svg><span>DRAG</span>';
      kart.innerHTML =
        '<span class="mogrt-thumb">' +
          (p.video
            ? '<video class="mogrt-preview-video" muted loop playsinline preload="metadata" poster="' + esc(p.thumb) + '" aria-hidden="true"><source src="' + esc(p.video) + '" type="video/webm"></video>'
            : (p.thumb
            ? '<img src="' + p.thumb + '" alt="" loading="lazy">'
            : '<span class="mogrt-yazi">' + esc(p.display.split(/[\s_-]/)[0] || "Aa") + "</span>")) +
          '<span class="mogrt-source">' + kaynak + "</span>" +
          '<button type="button" class="mogrt-kalp' + (favMi(p.ad) ? " sevildi" : "") + '" title="Favori" aria-label="' + esc(p.display) + (favMi(p.ad) ? " favorilerden çıkar" : " favorilere ekle") + '" aria-pressed="' + (favMi(p.ad) ? "true" : "false") + '">♥</button>' +
          (kilitli ? '<span class="mogrt-lock"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg></span>' : "") +
        "</span>" +
        '<span class="mogrt-card-body">' +
          '<span class="mogrt-meta"><b title="' + esc(p.display) + '">' + esc(p.display) + "</b><i>" + esc(p.category) + " · MOGRT</i></span>" +
          '<button type="button" class="mogrt-ekle-btn' + (kilitli ? " is-locked" : "") + '" title="' + (kilitli ? "Suflo Pro ile aç" : "Playhead konumuna ekle") + '" aria-label="' + esc(p.display) + (kilitli ? " · Suflo Pro ile kilidi aç" : " · playhead konumuna ekle") + '">' + aksiyon + "</button>" +
        "</span>";

      kart.querySelector(".mogrt-kalp").addEventListener("click", function (e) {
        e.stopPropagation();
        favDegistir(p.ad);
        var secili = favMi(p.ad);
        this.classList.toggle("sevildi", secili);
        this.setAttribute("aria-pressed", secili ? "true" : "false");
        this.setAttribute("aria-label", p.display + (secili ? " favorilerden çıkar" : " favorilere ekle"));
        if (kategori === "fav") ciz();
      });
      kart.querySelector(".mogrt-ekle-btn").addEventListener("click", function () { yerlestir(p, kart); });
      kart.querySelector(".mogrt-thumb").addEventListener("click", function () { yerlestir(p, kart); });
      var previewVideo = kart.querySelector(".mogrt-preview-video");
      if (previewVideo) {
        kart.addEventListener("mouseenter", function () {
          var oynat = previewVideo.play();
          if (oynat && oynat.catch) oynat.catch(function () {});
        });
        kart.addEventListener("mouseleave", function () {
          try { previewVideo.pause(); previewVideo.currentTime = 0; } catch (e0) {}
        });
        kart.addEventListener("focusin", function () {
          var oynat = previewVideo.play();
          if (oynat && oynat.catch) oynat.catch(function () {});
        });
        kart.addEventListener("focusout", function () {
          try { previewVideo.pause(); previewVideo.currentTime = 0; } catch (e0) {}
        });
      }
      if (!kilitli) {
        kart.setAttribute("draggable", "true");
        kart.addEventListener("dragstart", function (e) {
          kart.classList.add("dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "copy";
            try { e.dataTransfer.setData("text/plain", p.path); } catch (e1) {}
          }
        });
        // CEP disina surukleme kesin bir timeline koordinati vermez; birakildiginda
        // mevcut playhead'e guvenli yerlestirme yapar. Dugmeye tiklamak da ayni isi yapar.
        kart.addEventListener("dragend", function () {
          kart.classList.remove("dragging");
          yerlestir(p, kart);
        });
      }
      grid.appendChild(kart);
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------------- yerleştirme ---------------- */

  async function yerlestir(p, kart) {
    if (busyKart) return;
    // Vitrin kartinin arkasinda bilerek dosya yoktur. Ucretsiz kullanicida
    // satin alma penceresini acar; lisans yeni acildiysa paket esitlemesini
    // beklemesini soyler ve asla bos path'i Premiere'e gondermez.
    if (p.showcase) {
      if (typeof Pro !== "undefined" && !Pro.isPro()) Pro.gate("mogrt");
      else if (window.KApp) KApp.toast("Pro içeriklerini eşitleyince bu efekt kullanıma açılır.");
      return;
    }
    if (typeof Pro !== "undefined" && !Pro.gate("mogrt")) return;
    busyKart = kart;
    kart.classList.add("busy");
    try {
      var r = await K.call("KS_placeMogrt", { path: p.path, name: p.display }, 60000);
      if (!r.ok) throw new Error(r.error || "yerleştirilemedi");
      kart.classList.add("ok");
      KApp.toast("Sahneye eklendi · " + r.trackName + ", playhead", "good");
      setTimeout(function () { kart.classList.remove("ok"); }, 900);
    } catch (e) {
      KApp.toast("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      kart.classList.remove("busy");
      busyKart = null;
    }
  }

  /* ---------------- kilit rozetleri ---------------- */

  function kilitTazele() {
    var kilitli = typeof Pro !== "undefined" && !Pro.isPro();
    Array.prototype.forEach.call(document.querySelectorAll(".ky-kilit[data-kilit]"), function (k) {
      k.hidden = !kilitli;
    });
  }

  /* ---------------- başlat ---------------- */

  function init() {
    if (!el("tab-text")) return;

    var ara = el("yazi-ara");
    if (ara) ara.addEventListener("input", function () {
      arama = this.value.trim().toLowerCase();
      ciz();
    });

    // kategori gecisi artik global sol menuden gelir (app.js -> setKategori)

    var ac = el("yazi-klasor-ac");
    if (ac) ac.addEventListener("click", function () {
      K.run(K.MAC ? "open" : "explorer", [mogrtDir()]).catch(function () {});
    });

    var yenile = el("yazi-yenile");
    if (yenile) yenile.addEventListener("click", function () { tara(); });

    var yol = el("yazi-klasor-yol");
    if (yol) yol.textContent = mogrtDir();

    if (typeof Pro !== "undefined") Pro.on(function () { kilitTazele(); tara(); });
    kilitTazele();

    KApp.onTab("text", function () { if (!paketler.length) tara(); });
    tara();
  }

  function setKategori(kat) {
    kategori = (kat === "fav" || kat === "custom" || kat === "buton" || kat === "captions") ? kat : "mogrt";
    ciz();
  }

  return {
    init: init,
    tara: tara,
    setKategori: setKategori,
    // Disariya raporlanan sayilar yalniz gercek dosyalardir. Vitrin kartlari
    // kutuphane saglik kontrolunde kurulu MOGRT gibi sayilmaz.
    sayisi: function () { return paketler.filter(function (p) { return !p.showcase; }).length; },
    gorunenSayisi: function () { return paketler.length; },
    vitrinSayisi: function () { return paketler.filter(function (p) { return p.showcase; }).length; },
    yerlesikSayisi: function () { return paketler.filter(function (p) { return p.builtin; }).length; },
    hariciSayisi: function () { return paketler.filter(function (p) { return !p.builtin && !p.showcase; }).length; },
    yaziSayisi: function () { return paketler.filter(function (p) { return p.group === "text" && !p.showcase; }).length; },
    altyaziSayisi: function () { return paketler.filter(function (p) { return p.group === "caption" && !p.showcase; }).length; },
    altyaziStilleri: function () { return paketler.filter(function (p) { return p.group === "caption" && !p.showcase; }).slice(); },
    digerSayisi: function () { return paketler.filter(function (p) { return p.group === "other" && !p.showcase; }).length; }
  };
})();
