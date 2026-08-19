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

  var paketler = [];        // { path, ad, display, thumb, builtin, category }
  var arama = "";
  var kategori = "mogrt";   // "mogrt" (Suflo Originals) | "custom" | "fav"
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
  function pathKey(p) { return String(p || "").replace(/\\/g, "/").toLowerCase(); }

  function mogrtNameKey(value) {
    var base = String(value || "").replace(/\\/g, "/").split("/").pop();
    base = base.replace(/\.mogrt$/i, "");
    base = base.replace(/^SUFLO\s+(?:TEXT|MOGRT)\s*-\s*(?:\d+\s*)?/i, "");
    return base.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, "");
  }

  // Saf yazi hareketleri ustte kalir. Lower third, yorum, liste, logo, ikon,
  // subtitle ve sosyal paketler metin icerebilse de baska bir kurgu amacidir;
  // "Diger Animasyonlar" bolumunde gosterilir.
  function textAnimationMi(relativePath) {
    var rel = String(relativePath || "").replace(/\\/g, "/");
    return /(^|\/)(?:Text Animations?|Text Effects?|Typewriter|Text MOGRT Collection)(?:\/|$)/i.test(rel);
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
    if (K.fs.existsSync(thumbYolu)) return thumbYolu;
    try {
      var tmpZip = K.path.join(cacheDir(), adSlug + ".zip");
      K.fs.copyFileSync(mogrtYolu, tmpZip);
      await K.unzip(tmpZip, hedefDir);
      try { K.fs.unlinkSync(tmpZip); } catch (e1) {}
      if (K.fs.existsSync(thumbYolu)) return thumbYolu;
      var pngler = K.fs.readdirSync(hedefDir).filter(function (f) { return /\.png$/i.test(f); });
      if (pngler.length) return K.path.join(hedefDir, pngler[0]);
    } catch (e) { K.log("[yazi] thumb cikarilamadi: " + adSlug + " — " + (e && e.message)); }
    return null;
  }

  function dataUri(pngYolu) {
    try { return "data:image/png;base64," + K.fs.readFileSync(pngYolu).toString("base64"); }
    catch (e) { return null; }
  }

  async function tara() {
    var buTarama = ++taraNo;
    if (!K.nodeOK || !K.fs || !K.path) {
      paketler = [];
      sayaclar();
      ciz();
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
    var proPackFiles = topla(proPackMogrtDir());
    var proPackSet = {};
    proPackFiles.forEach(function (p) { proPackSet[pathKey(p)] = 1; });
    yollar = yollar.concat(proPackFiles);

    // ayni gorunen ada sahip cift dosyalari tekle (Suflo Originals once gelir)
    var gorulen = {};
    paketler = [];
    var thumbQueue = [];
    for (var i = 0; i < yollar.length; i++) {
      var tam2 = yollar[i];
      var ad = K.path.basename(tam2).replace(/\.mogrt$/i, "");
      var isBuiltin = !!builtinSet[pathKey(tam2)];
      var isPro = !isBuiltin && !!proPackSet[pathKey(tam2)];
      var meta = isBuiltin ? catalog[K.path.basename(tam2).toLowerCase()] : null;
      // Vault'ta ayni Suflo Original farkli bir dosya adi/klasorle bulunabilir.
      // Katalogdaki kaynak adlari bu kopyalari yakalar; yerlesik kart tek kalir.
      if (!isBuiltin && catalogInfo.aliases[mogrtNameKey(ad)]) continue;
      var display = meta && meta.name ? String(meta.name) : ad.replace(/^SUFLO TEXT\s*-\s*\d+\s*/i, "");
      var uniqueKey = mogrtNameKey(display) || display.toLowerCase();
      if (gorulen[uniqueKey]) continue;
      gorulen[uniqueKey] = 1;
      var slug = ad.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || ("paket-" + i);
      var relPath = !isBuiltin && ek ? tam2.slice(ek.length).replace(/^[\\\/]+/, "") : "";
      var group = isBuiltin || isPro || textAnimationMi(relPath) ? "text" : "other";
      var paket = {
        path: tam2,
        ad: ad,
        display: display,
        thumb: null,
        builtin: isBuiltin,
        pro: isPro,
        group: group,
        category: meta && meta.category ? String(meta.category) : (group === "text" ? "Text Animation" : "Other Animation")
      };
      paketler.push(paket);
      thumbQueue.push({ paket: paket, slug: slug });
    }
    // Kart adlari ve sayaclar ONCE gorunsun. Buyuk arsivlerde thumbnail acma
    // saniyeler surebilir; eski akis hepsi bitene dek 0/bos ekran gosteriyordu.
    sayaclar();
    ciz();

    for (var qi = 0; qi < thumbQueue.length; qi++) {
      if (buTarama !== taraNo) return;
      var q = thumbQueue[qi];
      var tp = await thumbCikar(q.paket.path, q.slug);
      if (buTarama !== taraNo) return;
      if (tp) q.paket.thumb = dataUri(tp);
      // Onizlemeleri kucuk partilerle ekrana getir; her dosyada tum grid'i
      // yeniden kurup paneli titretme.
      if ((qi + 1) % 8 === 0 || qi === thumbQueue.length - 1) ciz();
    }
  }

  /* ---------------- çizim ---------------- */

  function sayaclar() {
    var s1 = el("yazi-sayac");
    if (s1) s1.textContent = String(paketler.filter(function (p) { return p.group === "text"; }).length);
    var s0 = el("custom-sayac");
    if (s0) s0.textContent = String(paketler.filter(function (p) { return p.group === "other"; }).length);
    var favSayisi = paketler.filter(function (p) { return favMi(p.ad); }).length;
    var s2 = el("fav-sayac"); if (s2) s2.textContent = String(favSayisi);
  }

  function ciz() {
    var grid = el("mogrt-grid");
    var bos = el("mogrt-bos");
    if (!grid) return;

    var liste = paketler.filter(function (p) {
      if (kategori === "mogrt" && p.group !== "text") return false;
      if (kategori === "custom" && p.group !== "other") return false;
      if (kategori === "fav" && !favMi(p.ad)) return false;
      return !arama || (p.display + " " + p.ad + " " + p.category).toLowerCase().indexOf(arama) !== -1;
    });

    var baslik = el("ki-baslik"), alt = el("ki-alt");
    if (baslik) baslik.textContent = kategori === "fav"
      ? "Favoriler"
      : (kategori === "custom" ? "Diğer Animasyonlar" : "Yazı Animasyonları");
    if (alt) alt.textContent = liste.length
      ? liste.length + " paket timeline'a hazır"
      : (kategori === "fav"
        ? "kalbe tıklayıp favori ekle"
        : (kategori === "custom" ? "logo, ikon, lower third ve diğer MOGRT paketleri" : "Suflo Originals + saf text efektleri"));

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
      var kilitli = typeof Pro !== "undefined" && !Pro.isPro();
      kart.className = "mogrt-kart" + (kilitli ? " locked" : "");
      var kaynak = p.builtin ? "SUFLO ORIGINAL" : (p.pro ? "SUFLO PRO" : "PERSONAL MOGRT");
      var aksiyon = kilitli
        ? '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg><span>LOCKED</span>'
        : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M12 6l4 4-4 4"/></svg><span>DRAG</span>';
      kart.innerHTML =
        '<span class="mogrt-thumb">' +
          (p.thumb
            ? '<img src="' + p.thumb + '" alt="" loading="lazy">'
            : '<span class="mogrt-yazi">' + esc(p.display.split(/[\s_-]/)[0] || "Aa") + "</span>") +
          '<span class="mogrt-source">' + kaynak + "</span>" +
          '<button type="button" class="mogrt-kalp' + (favMi(p.ad) ? " sevildi" : "") + '" title="Favori">♥</button>' +
          (kilitli ? '<span class="mogrt-lock"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.7a3 3 0 0 1 6 0V9"/></svg></span>' : "") +
        "</span>" +
        '<span class="mogrt-card-body">' +
          '<span class="mogrt-meta"><b title="' + esc(p.display) + '">' + esc(p.display) + "</b><i>" + esc(p.category) + " · MOGRT</i></span>" +
          '<button type="button" class="mogrt-ekle-btn' + (kilitli ? " is-locked" : "") + '" title="' + (kilitli ? "Suflo Pro ile aç" : "Playhead konumuna ekle") + '">' + aksiyon + "</button>" +
        "</span>";

      kart.querySelector(".mogrt-kalp").addEventListener("click", function (e) {
        e.stopPropagation();
        favDegistir(p.ad);
        this.classList.toggle("sevildi", favMi(p.ad));
        if (kategori === "fav") ciz();
      });
      kart.querySelector(".mogrt-ekle-btn").addEventListener("click", function () { yerlestir(p, kart); });
      kart.querySelector(".mogrt-thumb").addEventListener("click", function () { yerlestir(p, kart); });
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

    if (typeof Pro !== "undefined") Pro.on(function () { kilitTazele(); ciz(); });
    kilitTazele();

    KApp.onTab("text", function () { if (!paketler.length) tara(); });
    tara();
  }

  function setKategori(kat) {
    kategori = kat === "fav" ? "fav" : (kat === "custom" ? "custom" : "mogrt");
    ciz();
  }

  return {
    init: init,
    tara: tara,
    setKategori: setKategori,
    sayisi: function () { return paketler.length; },
    yerlesikSayisi: function () { return paketler.filter(function (p) { return p.builtin; }).length; },
    hariciSayisi: function () { return paketler.filter(function (p) { return !p.builtin; }).length; },
    yaziSayisi: function () { return paketler.filter(function (p) { return p.group === "text"; }).length; },
    digerSayisi: function () { return paketler.filter(function (p) { return p.group === "other"; }).length; }
  };
})();
