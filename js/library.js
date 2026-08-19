/*
 * Suflo — Yazı kütüphanesi (MOGRT text animasyonları)
 *
 * Kullanıcının mogrt klasörünü tarar, her paketin içindeki thumb.png'yi
 * (mogrt bir ZIP arşividir) önbelleğe çıkarıp kart ızgarasında gösterir;
 * tıklanınca playhead'e yerleştirir (host: KS_placeMogrt).
 *
 * İçerik felsefesi: paketler KULLANICININ dosyalarıdır — panel hiçbir
 * hazır mogrt taşımaz; klasöre ne konursa onu listeler.
 */
window.KLib = (function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  var paketler = [];        // { path, ad, thumb (dataURI|null), boyut }
  var arama = "";
  var busyKart = null;

  /* ---------------- klasörler ---------------- */

  function kokDir() {
    // settings.json ile aynı kök: USER_DATA/Kesit
    var sp = K.settingsPath ? K.settingsPath() : null;
    var kok = sp ? K.path.dirname(sp) : K.path.join(K.os.homedir(), "Kesit");
    return kok;
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

  /* ---------------- tarama + thumbnail ---------------- */

  async function thumbCikar(mogrtYolu, adSlug) {
    var hedefDir = K.path.join(cacheDir(), adSlug);
    var thumbYolu = K.path.join(hedefDir, "thumb.png");
    if (K.fs.existsSync(thumbYolu)) return thumbYolu;
    try {
      // mogrt = zip; unzip zip uzantisi ister — gecici kopya
      var tmpZip = K.path.join(cacheDir(), adSlug + ".zip");
      K.fs.copyFileSync(mogrtYolu, tmpZip);
      await K.unzip(tmpZip, hedefDir);
      try { K.fs.unlinkSync(tmpZip); } catch (e1) {}
      if (K.fs.existsSync(thumbYolu)) return thumbYolu;
      // bazi paketlerde ad farkli olabilir: ilk png'yi ara
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
      paketler.push({
        path: K.path.join(dir, f),
        ad: ad,
        thumb: tp ? dataUri(tp) : null
      });
    }
    ciz();
  }

  /* ---------------- çizim ---------------- */

  function ciz() {
    var grid = el("mogrt-grid");
    var bos = el("mogrt-bos");
    var sayac = el("yazi-sayac");
    if (!grid) return;

    var goster = paketler.filter(function (p) {
      return !arama || p.ad.toLowerCase().indexOf(arama) !== -1;
    });
    if (sayac) sayac.textContent = String(paketler.length);

    grid.innerHTML = "";
    if (bos) bos.hidden = paketler.length > 0;
    if (!goster.length && paketler.length) {
      grid.innerHTML = '<p class="hint" style="grid-column:1/-1">Aramayla eşleşen paket yok.</p>';
      return;
    }

    goster.forEach(function (p) {
      var kart = document.createElement("button");
      kart.type = "button";
      kart.className = "mogrt-kart";
      var proEtiket = (typeof Pro !== "undefined" && !Pro.isPro())
        ? '<span class="mogrt-pro">PRO</span>' : "";
      kart.innerHTML =
        '<span class="mogrt-thumb">' +
          (p.thumb
            ? '<img src="' + p.thumb + '" alt="" loading="lazy">'
            : '<span class="mogrt-yazi">' + esc(p.ad.split(/[\s_-]/)[0] || "Aa") + "</span>") +
          proEtiket +
          '<span class="mogrt-ekle">＋ Playhead\'e ekle</span>' +
        "</span>" +
        '<span class="mogrt-meta"><b>' + esc(p.ad) + "</b><i>MOGRT · yazı animasyonu</i></span>";
      kart.addEventListener("click", function () { yerlestir(p, kart); });
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

  /* ---------------- başlat ---------------- */

  function init() {
    if (!el("tab-text")) return;

    var ara = el("yazi-ara");
    if (ara) ara.addEventListener("input", function () {
      arama = this.value.trim().toLowerCase();
      ciz();
    });

    var ac = el("yazi-klasor-ac");
    if (ac) ac.addEventListener("click", function () {
      var d = mogrtDir();
      // explorer bazen 1 döndürür — hata sayma
      K.run(K.MAC ? "open" : "explorer", [d]).catch(function () {});
    });

    var yenile = el("yazi-yenile");
    if (yenile) yenile.addEventListener("click", function () { tara(); });

    var yol = el("yazi-klasor-yol");
    if (yol) yol.textContent = mogrtDir();

    KApp.onTab("text", function () { if (!paketler.length) tara(); });
    tara();
  }

  return { init: init, tara: tara };
})();
