/*
 * Suflo — Yazı kütüphanesi (MOGRT text animasyonları)
 *
 * Rush düzeni: solda kategori menüsü (adet rozetleriyle), sağda büyük kartlar.
 * Kullanıcının mogrt klasörünü tarar, her paketin içindeki thumb.png'yi
 * (mogrt bir ZIP arşividir) önbelleğe çıkarıp kartlarda gösterir; "Ekle"
 * playhead'e yerleştirir (host: KS_placeMogrt). Kalp = favori (ayarlarda kalıcı).
 *
 * İçerik felsefesi: paketler KULLANICININ dosyalarıdır — panel hiçbir
 * hazır mogrt taşımaz; klasöre ne konursa onu listeler.
 */
window.KLib = (function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  var paketler = [];        // { path, ad, thumb (dataURI|null) }
  var arama = "";
  var kategori = "mogrt";   // "mogrt" | "fav"
  var busyKart = null;

  /* ---------------- klasörler ---------------- */

  function kokDir() {
    var sp = K.settingsPath ? K.settingsPath() : null;
    return sp ? K.path.dirname(sp) : K.path.join(K.os.homedir(), "Kesit");
  }
  function mogrtDir() {
    var d = K.path.join(kokDir(), "mogrt");
    try { if (!K.fs.existsSync(d)) K.fs.mkdirSync(d, { recursive: true }); } catch (e) {}
    return d;
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
    var dir = mogrtDir();
    var dosyalar = [];
    try {
      dosyalar = K.fs.readdirSync(dir).filter(function (f) { return /\.mogrt$/i.test(f); });
    } catch (e) { dosyalar = []; }

    paketler = [];
    for (var i = 0; i < dosyalar.length; i++) {
      var f = dosyalar[i];
      var ad = f.replace(/\.mogrt$/i, "");
      var slug = ad.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60) || ("paket-" + i);
      var tp = await thumbCikar(K.path.join(dir, f), slug);
      paketler.push({ path: K.path.join(dir, f), ad: ad, thumb: tp ? dataUri(tp) : null });
    }
    sayaclar();
    ciz();
  }

  /* ---------------- çizim ---------------- */

  function sayaclar() {
    var s1 = el("yazi-sayac"); if (s1) s1.textContent = String(paketler.length);
    var favSayisi = paketler.filter(function (p) { return favMi(p.ad); }).length;
    var s2 = el("fav-sayac"); if (s2) s2.textContent = String(favSayisi);
  }

  function ciz() {
    var grid = el("mogrt-grid");
    var bos = el("mogrt-bos");
    if (!grid) return;

    var liste = paketler.filter(function (p) {
      if (kategori === "fav" && !favMi(p.ad)) return false;
      return !arama || p.ad.toLowerCase().indexOf(arama) !== -1;
    });

    var baslik = el("ki-baslik"), alt = el("ki-alt");
    if (baslik) baslik.textContent = kategori === "fav" ? "Favoriler" : "Yazı Animasyonları";
    if (alt) alt.textContent = liste.length
      ? liste.length + " paket timeline'a hazır"
      : (kategori === "fav" ? "kalbe tıklayıp favori ekle" : "timeline'a hazır paketler");

    grid.innerHTML = "";
    if (bos) bos.hidden = paketler.length > 0;
    if (!liste.length && paketler.length) {
      grid.innerHTML = '<p class="hint" style="grid-column:1/-1">' +
        (kategori === "fav" ? "Henüz favori yok — kartların kalbine tıkla." : "Aramayla eşleşen paket yok.") + "</p>";
      return;
    }

    liste.forEach(function (p) {
      var kart = document.createElement("div");
      kart.className = "mogrt-kart";
      var proEtiket = (typeof Pro !== "undefined" && !Pro.isPro())
        ? '<span class="mogrt-pro">PRO</span>' : "";
      kart.innerHTML =
        '<span class="mogrt-thumb">' +
          (p.thumb
            ? '<img src="' + p.thumb + '" alt="" loading="lazy">'
            : '<span class="mogrt-yazi">' + esc(p.ad.split(/[\s_-]/)[0] || "Aa") + "</span>") +
          proEtiket +
          '<button type="button" class="mogrt-kalp' + (favMi(p.ad) ? " sevildi" : "") + '" title="Favori">♥</button>' +
        "</span>" +
        '<span class="mogrt-meta"><b>' + esc(p.ad) + "</b><i>MOGRT · yazı animasyonu</i></span>" +
        '<button type="button" class="mogrt-ekle-btn">Ekle</button>';

      kart.querySelector(".mogrt-kalp").addEventListener("click", function (e) {
        e.stopPropagation();
        favDegistir(p.ad);
        this.classList.toggle("sevildi", favMi(p.ad));
        if (kategori === "fav") ciz();
      });
      kart.querySelector(".mogrt-ekle-btn").addEventListener("click", function () { yerlestir(p, kart); });
      kart.querySelector(".mogrt-thumb").addEventListener("click", function () { yerlestir(p, kart); });
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
      var r = await K.call("KS_placeMogrt", { path: p.path, name: p.ad }, 60000);
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
    kategori = kat === "fav" ? "fav" : "mogrt";
    ciz();
  }

  return { init: init, tara: tara, setKategori: setKategori };
})();
