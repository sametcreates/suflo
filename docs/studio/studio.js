/*
 * Suflo Studio arayuzu. Veri yalniz sunucuda (Suflo Studio API) durur; tarayicida yalniz bellekte tutulur.
 * localStorage yalniz gorunum tercihi icin kullanilir (liste / pano, takvim gorunumu).
 * Kullanici verisi DOM'a hep metin dugumu olarak girer (innerHTML yok); dis baglantilar yalniz http(s).
 */
(function () {
  "use strict";
  if (window.top !== window.self) { document.documentElement.textContent = ""; return; }
  var C = window.StudioCore;
  // Arayuz API ile ayni adresten (yerel deneme ya da assets.suflo.app/studio/) sunuluyorsa goreli yol kullanilir.
  var AYNI_KAYNAK = /^(127\.0\.0\.1|localhost|assets\.suflo\.app)$/.test(location.hostname);
  var API = AYNI_KAYNAK ? "/studio/v1/index.php" : "https://assets.suflo.app/studio/v1/index.php";
  var kok = document.getElementById("uygulama");
  var S = { veri: bosVeri(), girisli: false, el: null, rota: null, secili: {}, sonYukleme: 0 };
  function bosVeri() { return { musteriler: [], icerikler: [], etkinlikler: [], ayar: null }; }

  /* ================= DOM yardimcilari ================= */

  function h(etiket, oz) {
    var e = document.createElement(etiket), deger;
    if (oz) Object.keys(oz).forEach(function (k) {
      var v = oz[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "value") deger = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") e.addEventListener(k.slice(2), v);
      else if (k === "checked" || k === "disabled" || k === "selected" || k === "hidden") e[k] = true;
      else e.setAttribute(k, v === true ? "" : String(v));
    });
    ekle(e, Array.prototype.slice.call(arguments, 2));
    if (deger !== undefined) e.value = deger;
    return e;
  }
  function ekle(e, c) {
    c.forEach(function (x) {
      if (x === null || x === undefined || x === false) return;
      if (Array.isArray(x)) ekle(e, x);
      else e.appendChild(x.nodeType ? x : document.createTextNode(String(x)));
    });
    return e;
  }
  /** Ogeleri ayiriciyla birlestirir (bos ogeler atlanir). */
  function dizi(liste, ayrac) {
    var out = [];
    liste.filter(function (x) { return x !== null && x !== undefined && x !== false && x !== ""; }).forEach(function (x, i) {
      if (i) out.push(ayrac === undefined ? " · " : ayrac);
      out.push(x);
    });
    return out;
  }
  function rotaLink(ad, p, id) { return "#/" + ad + (id ? "/" + id : "") + paramMetni(p); }
  function ic(href, metin, oz) { return h("a", Object.assign({ href: href }, oz || {}), metin); }
  function disLink(url, metin) {
    return C.guvenliLink(url) ? h("a", { href: String(url).trim(), target: "_blank", rel: "noopener noreferrer" }, metin || "Aç") : null;
  }
  function logo() { return h("img", { src: "favicon.svg", alt: "", width: "24", height: "24" }); }
  function bul(liste, id) { for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i]; return null; }
  function musteri(id) { return id ? bul(S.veri.musteriler, id) : null; }
  function etkinlik(id) { return id ? bul(S.veri.etkinlikler, id) : null; }
  function icerikBul(id) { return bul(S.veri.icerikler, id); }
  function bugun() { return C.istanbulSimdi().tarih; }
  function adSirala(a, b) { return a.ad.localeCompare(b.ad, "tr"); }
  function aktifMusteriler() { return S.veri.musteriler.filter(C.aktif).sort(adSirala); }
  function tercih(k, v) {
    try {
      if (v === undefined) return localStorage.getItem("suflo-studio." + k);
      localStorage.setItem("suflo-studio." + k, v);
    } catch (e) { /* tercih saklanamazsa varsayilan kullanilir */ }
    return null;
  }


  /* ================= Sunucu ================= */

  var HATA = {
    sifre: "Şifre yanlış.", kilit: "Çok fazla hatalı deneme. Biraz sonra yeniden dene.",
    kurulum: "Suflo Studio sunucusu henüz kurulmadı.", oturum: "Oturum sona erdi. Yeniden giriş yap.",
    cakisma: "Bu kayıt başka bir cihazda değişmiş. Güncel hali yüklendi; değişikliğini yeniden yap.",
    ayni_ad: "Aynı ad (ve kurum) ile bir müşteri zaten var.", veritabani: "Sunucu veritabanına bağlanamadı.",
    onay: "Onay metni gerekli.", yok: "Kayıt bulunamadı.", buyuk: "Dosya çok büyük.",
    kaynak: "Bu adresten erişim yok.", ag: "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.",
    mesgul: "Sunucu şu an meşgul; birkaç saniye sonra yeniden dene."
  };
  function hataMetni(j) {
    if (j.hata === "gecersiz") return "Kaydedilemedi: " + (j.mesaj || "geçersiz bilgi");
    return HATA[j.hata] || j.mesaj || "Beklenmeyen hata.";
  }
  function api(islem, govde) {
    return fetch(API, {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Studio": "1" },
      body: JSON.stringify(Object.assign({ islem: islem }, govde || {}))
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, hata: "yanit", mesaj: "Sunucu yanıtı okunamadı (" + r.status + ")." }; })
        .then(function (j) { j.status = r.status; return j; });
    }, function () { return { ok: false, hata: "ag", status: 0 }; }).then(function (j) {
      if (j.hata === "oturum" && islem !== "oturum" && S.girisli) oturumBitti();
      return j;
    });
  }
  function veriYukle() {
    return api("veri").then(function (j) {
      if (!j.ok) { if (j.hata !== "oturum") toast(hataMetni(j), "hata"); return false; }
      S.veri = j.veri;
      S.sonYukleme = Date.now();
      return true;
    });
  }
  function liste(tur) { return tur === "musteri" ? S.veri.musteriler : tur === "icerik" ? S.veri.icerikler : S.veri.etkinlikler; }
  function yerlestir(tur, k) {
    if (tur === "ayar") { S.veri.ayar = k; return; }
    var l = liste(tur);
    for (var i = 0; i < l.length; i++) if (l[i].id === k.id) { l[i] = k; return; }
    l.push(k);
  }
  function sade(k) {
    var v = C.kopya(k);
    delete v.id; delete v.surum; delete v.olusturma; delete v.guncelleme;
    return v;
  }
  /** Tek kayit. Basarida kaydi, hatada null doner (hata bildirilir). */
  function kaydet(tur, kayit) {
    var govde = { tur: tur, veri: sade(kayit) };
    if (kayit.id) { govde.id = kayit.id; govde.surum = kayit.surum; }
    return api("kaydet", govde).then(function (j) {
      if (j.ok) { yerlestir(tur, j.kayit); return j.kayit; }
      if (j.hata === "cakisma" && j.guncel) { yerlestir(tur, j.guncel); yenile(); }
      if (j.hata !== "oturum") toast(hataMetni(j), "hata");
      return null;
    });
  }
  /** Bir islemde birden cok kayit (hepsi ya da hicbiri); ham sunucu yanitini doner. kayitlar: [{tur, kayit}] */
  function kaydetHam(kayitlar) {
    return api("toplu", { kayitlar: kayitlar.map(function (x) {
      var o = { tur: x.tur, veri: sade(x.kayit) };
      if (x.kayit.id) { o.id = x.kayit.id; o.surum = x.kayit.surum; }
      return o;
    }) }).then(function (j) {
      if (j.ok) j.kayitlar.forEach(function (k, i) { yerlestir(kayitlar[i].tur, k); });
      else if (j.hata === "cakisma" && j.guncel && j.sira !== undefined && kayitlar[j.sira]) yerlestir(kayitlar[j.sira].tur, j.guncel);
      return j;
    });
  }
  /** kaydetHam + hata bildirimi. Basarida kaydedilen kayitlar, hatada null. */
  function topluKaydet(kayitlar) {
    return kaydetHam(kayitlar).then(function (j) {
      if (j.ok) return j.kayitlar;
      if (j.hata === "oturum") return null;
      toast(hataMetni(j) + (j.sira !== undefined && kayitlar.length > 1 ? " (" + (j.sira + 1) + ". kayıt)" : ""), "hata");
      if (j.hata === "cakisma") veriYukle().then(yenile);
      return null;
    });
  }

  /**
   * Alan bazinda birlestirme: formda kullanicinin degistirdigi alanlar (acilistaki degerden farkli olanlar) tabana
   * yazilir; dokunulmayan alanlar tabandan (cakismada guncel kayittan) gelir. Alanlar butun olarak karsilastirilir
   * (ornegin siklik, gunTurleri tek deger); yalniz dosya baglantilari tek tek birlesir.
   */
  var ALT_NESNE = { dosyalar: 1 };
  function degisenYollar(ilk, simdi) {
    var y = [];
    Object.keys(simdi).forEach(function (k) {
      if (ALT_NESNE[k] && simdi[k] && ilk && ilk[k]) {
        Object.keys(simdi[k]).forEach(function (a) { if (JSON.stringify(simdi[k][a]) !== JSON.stringify(ilk[k][a])) y.push([k, a]); });
      } else if (JSON.stringify(simdi[k]) !== JSON.stringify(ilk ? ilk[k] : undefined)) y.push([k]);
    });
    return y;
  }
  function yolAl(o, y) { return y.length === 1 ? (o || {})[y[0]] : ((o || {})[y[0]] || {})[y[1]]; }
  function yolYaz(o, y, v) {
    v = v === undefined ? null : C.kopya(v);
    if (y.length === 1) o[y[0]] = v;
    else { o[y[0]] = o[y[0]] && typeof o[y[0]] === "object" ? o[y[0]] : {}; o[y[0]][y[1]] = v; }
  }
  function degisenleriUygula(taban, ilk, simdi) {
    var n = C.kopya(taban || {});
    degisenYollar(ilk, simdi).forEach(function (y) { yolYaz(n, y, yolAl(simdi, y)); });
    return n;
  }
  /** yollar arasinda bu alan (ya da alt alani) var mi */
  function degisti(yollar, a, b) { return yollar.some(function (y) { return y[0] === a && (b === undefined || y.length === 1 || y[1] === b); }); }
  /**
   * Penceredeki kaydi kaydeder. Cakismada (kayit bu arada baska yerde degisti) pencere acik kalir: taban guncel
   * kayitla yenilenir, formun dokunulmamis alanlari guncel degerlerle doldurulur, kullanicinin degistirdigi alanlar durur.
   */
  function pencereKaydet(tur, n, hataP, tabanYenile) {
    return kaydetHam([{ tur: tur, kayit: n }]).then(function (j) {
      if (j.ok) return j.kayitlar[0];
      // Istek surerken pencere kapandiysa hata kaybolmasin: bildirimle soyle
      var acik = hataP.isConnected;
      if (j.hata === "cakisma" && j.guncel) {
        // Guncel kayit bu cihazin henuz bilmedigi bir musteri / cekime bagliysa once veriyi tazele (secim kutularinda gorunsun)
        var gu = j.guncel;
        var eksik = (gu.musteriId && !musteri(gu.musteriId)) || (gu.cekimId && !etkinlik(gu.cekimId));
        return (eksik ? veriYukle() : Promise.resolve(true)).then(function () {
          yenile();
          if (!hataP.isConnected) { toast("Kaydedilmedi: kayıt bu arada başka bir yerde değişti. Yeniden açıp düzenle.", "hata"); return null; }
          tabanYenile(C.kopya(gu));
          hataP.textContent = "Bu kayıt sen düzenlerken başka bir yerde değişti; form güncel hale getirildi. Senin değiştirdiğin alanlar duruyor: kontrol edip yeniden “Kaydet”e bas.";
          return null;
        });
      }
      if (j.hata !== "oturum") { if (acik) hataP.textContent = hataMetni(j); else toast("Kaydedilmedi: " + hataMetni(j), "hata"); }
      return null;
    });
  }

  /* ================= Bildirim ve pencereler ================= */

  function toast(metin, tur, eylem) {
    var kap = document.querySelector(".toastlar");
    if (!kap) { kap = h("div", { class: "toastlar", role: "status", "aria-live": "polite" }); document.body.appendChild(kap); }
    var t = h("div", { class: "toast " + (tur || "") }, h("span", null, metin));
    var kaldir = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    if (eylem) t.appendChild(h("button", { class: "btn ince", type: "button", onclick: function () { kaldir(); eylem.f(); } }, eylem.ad));
    t.appendChild(h("button", { class: "kapat", type: "button", "aria-label": "Kapat", onclick: kaldir }, "×"));
    kap.appendChild(t);
    while (kap.children.length > 3) kap.removeChild(kap.firstChild);
    setTimeout(kaldir, eylem ? 12000 : (tur === "hata" ? 9000 : 5000));
  }
  /** Pencere: govde dugumleri + alt dugmeler; gonderilince gonder(form) cagrilir. */
  function pencere(baslik, govde, alt, gonder, genis) {
    var d = h("dialog", { class: "pencere" + (genis ? " genis" : "") });
    var gonderiliyor = false;
    // Cift tiklama / cift Enter ayni kaydi iki kez gondermesin: istek surerken gonderme kapali
    var form = h("form", { class: "p-form", novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (!gonder || gonderiliyor) return;
      var p = gonder();
      if (p && typeof p.then === "function") {
        gonderiliyor = true;
        var dugmeler = form.querySelectorAll("button[type=submit]");
        dugmeler.forEach(function (b) { b.disabled = true; });
        var bitti = function () { gonderiliyor = false; dugmeler.forEach(function (b) { b.disabled = false; }); };
        p.then(bitti, bitti);
      }
    } },
      h("div", { class: "p-bas" }, h("h2", null, baslik), h("button", { class: "kapat", type: "button", "aria-label": "Kapat", onclick: function () { d.close(); } }, "×")),
      h("div", { class: "p-govde" }, govde),
      alt && alt.length ? h("div", { class: "p-alt" }, alt) : null);
    d.appendChild(form);
    d.addEventListener("close", function () { if (d.parentNode) d.parentNode.removeChild(d); });
    document.body.appendChild(d);
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    var ilk = d.querySelector("input:not([type=hidden]):not([type=checkbox]), select, textarea");
    if (ilk && !("ontouchstart" in window)) ilk.focus();
    return d;
  }
  /**
   * Penceredeki arsiv dugmesi. Hedef (arsivle / arsivden cikar) dugme kurulurken sabitlenir: etiket ve islem ayni
   * kalir; pencere acikken kayit baska yerde degisse (cakismada form tazelense) bile etiketin tersi yapilmaz.
   */
  function arsivDugmesi(hedef, f) {
    return h("button", { class: "btn sol " + (hedef ? "tehlike" : ""), type: "button", onclick: function () { f(hedef); } }, hedef ? "Arşivle" : "Arşivden çıkar");
  }
  function vazgec(d) { return h("button", { class: "btn", type: "button", onclick: function () { (d.d || d).close(); } }, "Vazgeç"); }
  /** Onay penceresi. yazilacak verilirse kullanicinin o metni yazmasi gerekir. Promise<boolean> */
  function onayla(baslik, metin, dugme, yazilacak, tehlike) {
    return new Promise(function (coz) {
      var sonuc = false, girdi = yazilacak ? h("input", { type: "text", autocomplete: "off", "aria-label": "Onay metni" }) : null;
      var hataP = h("p", { class: "hata", role: "alert" });
      var ref = {};
      var govde = [h("p", null, metin), yazilacak ? h("label", { class: "alan" }, h("span", null, "Onaylamak için " + yazilacak + " yaz"), girdi) : null, hataP];
      ref.d = pencere(baslik, govde, [vazgec(ref), h("button", { class: "btn " + (tehlike ? "tehlike" : "birincil"), type: "submit" }, dugme)], function () {
        if (yazilacak && girdi.value.trim() !== yazilacak) { hataP.textContent = "Onay metni eşleşmedi."; return; }
        sonuc = true;
        ref.d.close();
      });
      ref.d.addEventListener("close", function () { coz(sonuc); });
    });
  }
  function alan(etiket, girdi, ipucu, sinif) {
    return h("label", { class: "alan" + (sinif ? " " + sinif : "") }, h("span", null, etiket), girdi, ipucu || null);
  }
  function secim(liste, deger, bos) {
    return h("select", { value: deger === null || deger === undefined ? "" : deger },
      bos !== undefined ? h("option", { value: "" }, bos) : null,
      liste.map(function (x) { return h("option", { value: x.k }, x.ad); }));
  }
  /** Secim kutusunda bu musteri yoksa (ornegin baska cihazda eklendi, arsivde) secenegini ekler. */
  function musteriSecenegi(sel, id) {
    if (!id || Array.prototype.some.call(sel.options, function (o) { return o.value === id; })) return;
    var m = musteri(id);
    if (m) sel.appendChild(h("option", { value: m.id }, C.musteriAdi(m) + (m.arsiv ? " (arşiv)" : "")));
  }
  function musteriSecimi(deger, bos, arsivDahil) {
    var l = (arsivDahil ? S.veri.musteriler.slice().sort(adSirala) : aktifMusteriler());
    var sec = musteri(deger);
    if (sec && l.indexOf(sec) === -1) l.push(sec);
    return h("select", { value: deger || "" }, h("option", { value: "" }, bos),
      l.map(function (m) { return h("option", { value: m.id }, C.musteriAdi(m) + (m.arsiv ? " (arşiv)" : "")); }));
  }
  function tarihGirdisi(v) { return h("input", { type: "date", value: v || "" }); }
  function metinKutusu(v, satir, maks) { return h("textarea", { rows: String(satir || 3), maxlength: String(maks || 5000), value: v || "" }); }

  /* ================= Giris ================= */

  function basla() {
    kok.textContent = "";
    kok.appendChild(h("p", { class: "yukleniyor" }, "Bağlanıyor…"));
    api("oturum").then(function (j) {
      if (!j.ok) return durumEkrani(j.hata === "kurulum" ? "Suflo Studio sunucusu henüz kurulmadı" + (j.mesaj ? ": " + j.mesaj : ".") :
        j.hata === "ag" ? "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et; sorun sürerse sunucu kurulumu tamamlanmamış olabilir." : hataMetni(j), true);
      if (!j.kurulu) return durumEkrani("Suflo Studio sunucusu kuruldu ama giriş şifresi henüz ayarlanmadı.", false);
      if (!j.girisli) return girisEkrani();
      return veriYukle().then(kabukKur);
    });
  }
  function durumEkrani(metin, tekrar) {
    kok.textContent = "";
    kok.appendChild(h("main", { class: "giris" }, h("div", { class: "giris-kart" }, logo(), h("h1", null, "Suflo Studio"), h("p", { class: "soluk" }, metin),
      tekrar ? h("button", { class: "btn", type: "button", onclick: basla }, "Yeniden dene") : null)));
  }
  function girisEkrani(mesaj) {
    S.girisli = false;
    S.veri = bosVeri();
    kok.textContent = "";
    var sifre = h("input", { type: "password", id: "studio-sifre", autocomplete: "current-password", required: true });
    var durum = h("p", { class: "hata", role: "alert" }, mesaj || "");
    var btn = h("button", { class: "btn birincil", type: "submit" }, "Giriş yap");
    var form = h("form", { class: "giris-kart", onsubmit: function (ev) {
      ev.preventDefault();
      if (!sifre.value) { durum.textContent = "Şifreyi yaz."; return; }
      btn.disabled = true;
      durum.textContent = "";
      api("giris", { sifre: sifre.value }).then(function (j) {
        btn.disabled = false;
        if (!j.ok) { durum.textContent = hataMetni(j); sifre.select(); return; }
        sifre.value = "";
        veriYukle().then(kabukKur);
      });
    } }, logo(), h("h1", null, "Suflo Studio"), h("p", { class: "soluk" }, "Özel çalışma alanı. Yalnız yetkili kullanıcı girebilir."),
      h("label", { for: "studio-sifre" }, "Şifre"), sifre, durum, btn);
    kok.appendChild(h("main", { class: "giris" }, form));
    sifre.focus();
  }
  function oturumBitti() {
    document.querySelectorAll("dialog").forEach(function (d) { d.close(); });
    girisEkrani("Oturum sona erdi. Yeniden giriş yap.");
  }
  function cikis() {
    api("cikis").then(function () { girisEkrani("Çıkış yapıldı."); });
  }

  /* ================= Kabuk ve yonlendirme ================= */

  var MENU = [["genel", "Genel Bakış"], ["musteriler", "Müşteriler"], ["icerikler", "İçerikler"], ["cekim", "Çekim Takvimi"],
    ["yayin", "Yayın Takvimi"], ["stok", "Stok"], ["ayarlar", "Ayarlar"]];
  var SAYFALAR = {};
  var aramaZamanlayici = null;

  function kabukKur(yuklendi) {
    if (yuklendi === false) return;
    S.girisli = true;
    kok.textContent = "";
    var el = S.el = {};
    el.nav = h("nav", { class: "yan-menu", "aria-label": "Ana menü" }, MENU.map(function (m) {
      return h("a", { href: "#/" + m[0], "data-rota": m[0], onclick: function () { var k = document.querySelector(".kabuk"); if (k) k.classList.remove("menu-acik"); } }, m[1]);
    }));
    el.yan = h("aside", { class: "yan" }, h("div", { class: "marka" }, logo(), h("span", null, "Suflo Studio")), el.nav,
      h("button", { class: "btn ince cikis", type: "button", onclick: cikis }, "Çıkış"));
    el.ara = h("input", { type: "search", class: "ara", placeholder: "Ara: müşteri, içerik, çekim", "aria-label": "Hızlı arama", enterkeyhint: "search",
      oninput: function () {
        clearTimeout(aramaZamanlayici);
        aramaZamanlayici = setTimeout(function () {
          var q = el.ara.value.trim();
          if (q) git("ara", { q: q }, null, S.rota && S.rota.ad === "ara");
          else if (S.rota && S.rota.ad === "ara") history.back();
        }, 250);
      } });
    el.ust = h("header", { class: "ust" },
      h("button", { class: "menu-dugme", type: "button", "aria-label": "Menü", onclick: function () { el.kabuk.classList.toggle("menu-acik"); } }, "☰"),
      el.ara, h("span", { class: "bosluk" }),
      h("button", { class: "btn birincil", type: "button", onclick: hizliEkle }, "+ Ekle"));
    el.sayfa = h("main", { class: "sayfa", id: "sayfa", tabindex: "-1" });
    el.kabuk = h("div", { class: "kabuk" }, el.yan, h("div", { class: "ortu", onclick: function () { el.kabuk.classList.remove("menu-acik"); } }),
      h("div", { class: "govde" }, el.ust, el.sayfa));
    kok.appendChild(el.kabuk);
    ciz();
  }
  function rota() {
    var hs = location.hash.replace(/^#\/?/, ""), q = hs.indexOf("?"), yol = q === -1 ? hs : hs.slice(0, q), p = {};
    if (q !== -1) new URLSearchParams(hs.slice(q + 1)).forEach(function (v, k) { p[k] = v; });
    var parca = yol.split("/");
    return { ad: parca[0] || "genel", id: parca[1] || null, p: p };
  }
  function paramMetni(p) {
    var u = new URLSearchParams();
    Object.keys(p || {}).forEach(function (k) { if (p[k] !== "" && p[k] !== null && p[k] !== undefined && p[k] !== false) u.set(k, p[k]); });
    var s = u.toString();
    return s ? "?" + s : "";
  }
  function git(ad, p, id, yerinde) {
    var url = rotaLink(ad, p, id);
    if (yerinde) { history.replaceState(null, "", url); ciz(true); }
    else location.hash = url;
  }
  function ciz(kaydirmaKalsin) {
    if (!S.girisli || !S.el) return;
    var r = S.rota = rota();
    var menuAd = r.ad === "musteri" ? "musteriler" : r.ad;
    S.el.nav.querySelectorAll("a").forEach(function (a) { a.classList.toggle("aktif", a.getAttribute("data-rota") === menuAd); });
    S.el.kabuk.classList.remove("menu-acik");
    if (r.ad !== "ara" && document.activeElement !== S.el.ara) S.el.ara.value = "";
    var y = window.scrollY;
    S.el.sayfa.textContent = "";
    var f = SAYFALAR[r.ad] || SAYFALAR.genel;
    ekle(S.el.sayfa, [f(r)]);
    var ad = (MENU.filter(function (m) { return m[0] === menuAd; })[0] || [null, r.ad === "ara" ? "Arama" : "Genel Bakış"])[1];
    document.title = ad + " · Suflo Studio";
    window.scrollTo(0, kaydirmaKalsin ? y : 0);
  }
  /** Veri degistikten sonra ayni sayfayi yeniden ciz (kaydirma korunur). */
  function yenile() { ciz(true); }
  window.addEventListener("hashchange", function () { ciz(false); });
  // Arka planda yenileme (baska cihazdaki degisiklikler). Pencere aciksa ya da Ayarlar'daysa (ice aktarma onizlemesi,
  // secilen dosya) sayfa yeniden cizilmez.
  function arkaPlanYenile(esik) {
    if (document.visibilityState !== "visible" || !S.girisli || Date.now() - S.sonYukleme <= esik) return;
    if (document.querySelector("dialog[open]") || (S.rota && S.rota.ad === "ayarlar")) return;
    veriYukle().then(function (ok) { if (ok && !document.querySelector("dialog[open]") && !(S.rota && S.rota.ad === "ayarlar")) yenile(); });
  }
  document.addEventListener("visibilitychange", function () { arkaPlanYenile(30000); });
  setInterval(function () { arkaPlanYenile(120000); }, 30000);

  /* ================= Ortak parcalar ================= */

  function sayfaBasligi(metin, alt, eylemler) {
    return h("div", { class: "sayfa-bas" }, h("div", null, h("h1", null, metin), alt ? h("p", { class: "soluk" }, alt) : null),
      eylemler ? h("div", { class: "eylemler" }, eylemler) : null);
  }
  function bolum(ad, sayi, link, govde, aciklama) {
    return h("section", { class: "bolum" },
      h("div", { class: "bolum-bas" }, h("h2", null, ad, sayi !== null && sayi !== undefined ? h("span", { class: "sayi" }, sayi) : null),
        link ? ic(link, "Listeyi aç →", { class: "kucuk-link" }) : null),
      aciklama ? h("p", { class: "soluk kucuk" }, aciklama) : null,
      govde);
  }
  function durumRozet(d) { return h("span", { class: "rozet d-" + d }, C.DURUM_AD[d] || d); }
  function musteriLink(m) { return m ? ic(rotaLink("musteri", null, m.id), m.ad) : h("span", { class: "soluk" }, "Müşteri yok"); }

  function icerikSatiri(i, onEk) {
    var m = musteri(i.musteriId), b = bugun(), tarih = [];
    if (i.teslimTarihi && C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1) tarih.push(h("span", { class: i.teslimTarihi < b ? "gecikti" : null }, "Teslim " + C.tarihGunlu(i.teslimTarihi)));
    if (i.planTarihi && i.durum !== "yayinlandi") tarih.push(h("span", { class: i.planTarihi < b ? "gecikti" : null }, "Yayın " + C.tarihGunlu(i.planTarihi)));
    if (i.durum === "yayinlandi" && i.yayinTarihi) tarih.push("Yayınlandı " + C.tarihGunlu(i.yayinTarihi));
    return h("div", { class: "satir" + (i.arsiv ? " arsivli" : "") }, onEk || null, durumRozet(i.durum),
      h("button", { class: "satir-ad", type: "button", onclick: function () { icerikPenceresi(i.id); } }, i.baslik),
      i.oncelik === "yuksek" ? h("span", { class: "oncelik" }, "Öncelikli") : null,
      h("span", { class: "satir-bilgi" }, dizi([musteriLink(m), C.TUR_AD[i.tur] || i.tur].concat(tarih).concat([i.arsiv ? "Arşivde" : null]))));
  }
  function etkinlikSatiri(e, cak, ekDugmeler) {
    var m = musteri(e.musteriId), c = cak && cak[e.id];
    return h("div", { class: "satir" + (e.durum === "iptal" ? " iptal" : "") + (e.arsiv ? " arsivli" : "") },
      h("span", { class: "rozet e-" + e.tur }, C.ETKINLIK_TUR_AD[e.tur] || e.tur),
      h("button", { class: "satir-ad", type: "button", onclick: function () { etkinlikPenceresi(e.id); } }, e.baslik),
      h("span", { class: "satir-bilgi" }, dizi([C.tarihGunlu(e.basTarih) + ", " + C.saatMetni(e), musteriLink(m), e.konum || null, C.ETKINLIK_DURUM_AD[e.durum]])),
      c ? h("span", { class: "uyari-rozet", title: "Çakışıyor: " + c.map(function (id) { return (etkinlik(id) || {}).baslik; }).join(", ") }, "Çakışma") : null,
      ekDugmeler ? h("span", { class: "sag" }, ekDugmeler) : null);
  }

  /** Bir veya birden cok kaydi degistirir; basarida "Geri al" teklif eder. degisim: [{tur, yeni, onceki}] */
  function uygula(degisim, mesaj) {
    if (!degisim.length) return Promise.resolve(false);
    return topluKaydet(degisim.map(function (d) { return { tur: d.tur, kayit: d.yeni }; })).then(function (sonuc) {
      if (!sonuc) return false;
      degisim.forEach(function (d, i) { d.sonraki = sonuc[i]; });
      yenile();
      toast(mesaj, "", { ad: "Geri al", f: function () { geriAl(degisim); } });
      return true;
    });
  }
  /**
   * Geri alma: degisiklikten hemen sonraki surumle gonderilir. Arada kayit (bu ya da baska cihazda) yeniden
   * degistiyse sunucu 409 doner ve sonraki degisiklik sessizce ezilmez. degisim: [{tur, onceki, sonraki}]
   */
  function geriAl(degisim) {
    var zaman = C.damga();
    var kayitlar = degisim.filter(function (d) { return d.sonraki; }).map(function (d) {
      var n;
      if (d.tur === "icerik") {
        n = C.geriAl(d.sonraki, d.onceki, zaman);
        if (d.sonraki.durum === d.onceki.durum) n.gecmis[n.gecmis.length - 1].m = "Son değişiklik geri alındı";
      } else {
        n = C.kopya(d.onceki);
        n.surum = d.sonraki.surum;
      }
      return { tur: d.tur, kayit: n };
    });
    if (!kayitlar.length) return;
    kaydetHam(kayitlar).then(function (j) {
      if (j.ok) { yenile(); toast("Geri alındı."); return; }
      if (j.hata === "oturum") return;
      yenile();
      toast(j.hata === "cakisma" ? "Geri alınamadı: kayıt bu arada yeniden değişti. Güncel hali gösteriliyor." : hataMetni(j), "hata");
    });
  }
  function durumlariDegistir(idler, yeni) {
    var zaman = C.damga(), b = bugun(), degisim = [];
    idler.forEach(function (id) {
      var i = icerikBul(id);
      if (!i) return;
      var n = C.durumDegistir(i, yeni, zaman, b);
      if (n) degisim.push({ tur: "icerik", yeni: n, onceki: C.kopya(i) });
    });
    if (!degisim.length) return Promise.resolve(false);
    return uygula(degisim, (degisim.length === 1 ? "“" + degisim[0].yeni.baslik + "”" : degisim.length + " içerik") + " → " + C.DURUM_AD[yeni]);
  }
  function arsivDegistir(tur, kayit, arsiv) {
    var n = C.kopya(kayit);
    n.arsiv = arsiv;
    if (tur === "icerik") n.gecmis = (n.gecmis || []).concat([{ z: C.damga(), m: arsiv ? "Arşivlendi" : "Arşivden çıkarıldı" }]).slice(-60);
    var ad = kayit.ad || kayit.baslik;
    return uygula([{ tur: tur, yeni: n, onceki: C.kopya(kayit) }], "“" + ad + "” " + (arsiv ? "arşivlendi" : "arşivden çıkarıldı"));
  }

  /* ================= Genel Bakis ================= */

  SAYFALAR.genel = function () {
    var b = bugun(), gb = C.genelBakis(S.veri, b, S.veri.ayar), cak = C.cakismaHaritasi(S.veri.etkinlikler);
    var bos = [];
    var dolu = function (ad, liste, link, satir, aciklama) {
      if (!liste.length) { bos.push(ad); return null; }
      return bolum(ad, liste.length, link, liste.slice(0, 12).map(satir).concat(liste.length > 12 ? [h("p", { class: "soluk kucuk" }, "+" + (liste.length - 12) + " tane daha")] : []), aciklama);
    };
    var kok_ = h("div", null, sayfaBasligi("Bugün ne yapmalıyım?", C.tarihUzun(b)));
    if (!S.veri.musteriler.length) {
      kok_.appendChild(h("div", { class: "uyari-kutu" }, "Henüz kayıt yok. ", ic(rotaLink("musteriler"), "Müşteri ekle"),
        " ya da müşteri listeni ", ic(rotaLink("ayarlar"), "Ayarlar → İçe aktar"), " ile yükle."));
    }
    var gecmisDugme = function (e) {
      return [h("button", { class: "btn ince", type: "button", onclick: function () { etkinlikDurumu(e, "tamamlandi"); } }, "Tamamlandı"),
        h("button", { class: "btn ince", type: "button", onclick: function () { etkinlikDurumu(e, "iptal"); } }, "İptal")];
    };
    ekle(kok_, [
      dolu("Bugün: çekim ve etkinlikler", gb.bugunEtkinlik, rotaLink("cekim", { g: "gun", t: b }), function (e) { return etkinlikSatiri(e, cak); }),
      dolu("Önümüzdeki 7 gün: çekimler", gb.yaklasanEtkinlik, rotaLink("cekim", { g: "hafta", t: C.gunEkle(b, 1), kayan: "1" }), function (e) { return etkinlikSatiri(e, cak); }),
      dolu("Durumu güncellenmemiş geçmiş çekimler", gb.gecmisPlanliEtkinlik, null, function (e) { return etkinlikSatiri(e, cak, gecmisDugme(e)); },
        "Geçmiş çekimler kendiliğinden tamamlanmaz. Çekimin tamamlanması kurgunun bittiği anlamına gelmez."),
      dolu("Geciken kurgu teslimleri", gb.gecikenTeslim, rotaLink("icerikler", { ozel: "geciken" }), function (i) { return icerikSatiri(i); }),
      dolu("3 gün içinde kurgu teslimi", gb.yaklasanTeslim, rotaLink("icerikler", { ozel: "yaklasan" }), function (i) { return icerikSatiri(i); }),
      dolu("Müşteri onayında", gb.onayda, rotaLink("icerikler", { durum: "onayda" }), function (i) { return icerikSatiri(i); }),
      dolu("Revizyonda", gb.revizyonda, rotaLink("icerikler", { durum: "revizyonda" }), function (i) { return icerikSatiri(i); }),
      dolu("Hazır içerikle karşılanmayan paylaşımlar (7 gün)", gb.acikTarihler.filter(function (x) { return x.durum === "acik"; }), rotaLink("yayin", { g: "hafta", t: b, kayan: "1" }), function (x) {
        var hz = x.hazirlikta ? icerikBul(x.hazirlikta) : null;
        return h("div", { class: "satir" }, h("b", null, C.tarihGunlu(x.tarih)), musteriLink(x.musteri),
          h("span", { class: "satir-bilgi" }, "hazır içerik yok"),
          hz ? h("span", { class: "satir-bilgi" }, "Bu tarihe planlı ama hazır değil: ", h("button", { class: "satir-ad", type: "button", onclick: function () { icerikPenceresi(hz.id); } }, hz.baslik), " (" + C.DURUM_AD[hz.durum] + ")") : null);
      }, gb.oneriSayisi ? gb.oneriSayisi + " paylaşım günü, tarihe atanmamış ya da tarihi geçmiş hazır içerikle karşılanabilir (öneri; plana çevirmek için müşteri sayfasından ata)." : null),
      dolu("Hazır stoku azalan müşteriler", gb.stokUyarilari, rotaLink("stok", { f: "uyari" }), function (x) {
        return h("div", { class: "satir" }, musteriLink(x.musteri), h("span", { class: "satir-bilgi uyari" }, x.nedenler.join(" · ")));
      }),
      dolu("7 gün içinde yayına planlı ama hazır değil", gb.planliHazirDegil, rotaLink("icerikler", { ozel: "planlihazirdegil" }), function (i) { return icerikSatiri(i); },
        "Yayın düzeni ya da stok girişinden bağımsız: planlanan yayın tarihi yaklaşan ama henüz yayına hazır olmayan içerikler."),
      dolu("Planlanan tarihi geçti, yayınlandı işaretlenmedi", gb.gecmisPlanYayinlanmamis, rotaLink("icerikler", { ozel: "gecmisplan" }), function (i) { return icerikSatiri(i); },
        "Planlanan paylaşımlar kendiliğinden yayınlandı sayılmaz."),
      gb.stokBilinmeyen.length ? bolum("Stok girişi yapılmadı", gb.stokBilinmeyen.length, rotaLink("stok", { f: "giris" }),
        h("p", { class: "satir-bilgi" }, dizi(gb.stokBilinmeyen.map(musteriLink), ", "))) : null,
      gb.duzenEksik.length ? bolum("Yayın düzeni kurulmalı", gb.duzenEksik.length, rotaLink("stok", { f: "duzen" }),
        h("p", { class: "satir-bilgi" }, dizi(gb.duzenEksik.map(function (x) { return musteriLink(x.musteri); }), ", "))) : null,
      bos.length ? h("p", { class: "temiz" }, "Boş: " + bos.join(" · ")) : null,
      gb.sayilar.length ? bolum("Müşteri bazında durum", null, rotaLink("icerikler"), musteriSayiTablosu(gb.sayilar)) : null
    ]);
    return kok_;
  };
  function musteriSayiTablosu(sayilar) {
    var kolonlar = [["cekildi", "Çekildi"], ["kurguda", "Kurguda"], ["onayda", "Onayda"], ["revizyonda", "Revizyonda"], ["hazir", "Yayına hazır"]];
    return h("div", { class: "tablo-kap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Müşteri"), kolonlar.map(function (k) { return h("th", { class: "sayi-h" }, k[1]); }))),
      h("tbody", null, sayilar.map(function (s) {
        // stok girisi yapilmamis musteride sifirlar "0" degil "—" (bilinmiyor) gorunur
        return h("tr", null, h("td", null, musteriLink(s.musteri), s.stokBilinen ? null : h("div", { class: "soluk kucuk" }, "Stok girişi yapılmadı")), kolonlar.map(function (k) {
          return h("td", { class: "sayi-h" }, s[k[0]] ? ic(rotaLink("icerikler", { musteri: s.musteri.id, durum: k[0] }), String(s[k[0]])) :
            h("span", { class: "soluk", title: s.stokBilinen ? null : "Stok girişi yapılmadı" }, s.stokBilinen ? "0" : "—"));
        }));
      }))));
  }
  function etkinlikDurumu(e, durum) {
    var n = C.kopya(e);
    n.durum = durum;
    uygula([{ tur: "etkinlik", yeni: n, onceki: C.kopya(e) }], "“" + e.baslik + "” → " + C.ETKINLIK_DURUM_AD[durum]);
  }

  /* ================= Musteriler ================= */

  SAYFALAR.musteriler = function (r) {
    var arsiv = r.p.arsiv === "1", b = bugun();
    var l = S.veri.musteriler.filter(function (m) { return !!m.arsiv === arsiv; }).sort(adSirala);
    var oz = C.ucretOzeti(S.veri.musteriler);
    var ozet = oz.aktif + " aktif müşteri · Bilinen aylık ücret toplamı " + C.para(oz.toplam) + " (" + oz.bilinen + " müşteri)" +
      (oz.bilinmeyen ? " · " + oz.bilinmeyen + " müşterinin ücreti belirlenmedi" : "");
    var arsivSayi = S.veri.musteriler.filter(function (m) { return m.arsiv; }).length;
    return h("div", null,
      sayfaBasligi("Müşteriler", ozet, [
        h("div", { class: "gorunum" },
          h("button", { class: "btn" + (!arsiv ? " secili" : ""), type: "button", onclick: function () { git("musteriler", {}, null, true); } }, "Aktif"),
          h("button", { class: "btn" + (arsiv ? " secili" : ""), type: "button", onclick: function () { git("musteriler", { arsiv: "1" }, null, true); } }, "Arşiv (" + arsivSayi + ")")),
        h("button", { class: "btn birincil", type: "button", onclick: function () { musteriPenceresi(null); } }, "Müşteri ekle")]),
      h("p", { class: "soluk kucuk" }, "Aylık ücret anlaşma tutarıdır; tahsil edilen para ya da alacak değildir."),
      l.length ? h("div", { class: "tablo-kap" }, h("table", null,
        h("thead", null, h("tr", null, h("th", null, "Müşteri"), h("th", { class: "sayi-h" }, "Aylık ücret"), h("th", null, "Yayın düzeni"),
          h("th", { class: "sayi-h" }, "Hazır video"), h("th", { class: "sayi-h" }, "Açık işler"))),
        h("tbody", null, l.map(function (m) {
          var st = C.stok(S.veri, m, b), duzen = C.duzenDurumu(m);
          var acikIs = S.veri.icerikler.filter(function (i) { return i.musteriId === m.id && !i.arsiv && i.durum !== "yayinlandi" && i.durum !== "hazir"; }).length;
          return h("tr", { class: "tik", onclick: function (ev) { if (ev.target.tagName !== "A") git("musteri", null, m.id); } },
            h("td", null, ic(rotaLink("musteri", null, m.id), m.ad), m.kurum ? h("div", { class: "soluk kucuk" }, m.kurum) : null),
            h("td", { class: "sayi-h" }, m.ucret === null || m.ucret === undefined ? h("span", { class: "uyari" }, "Belirlenmedi") : C.para(m.ucret)),
            h("td", null, C.siklikMetni(m), duzen.tamam ? null : h("div", { class: "uyari kucuk" }, "Yayın düzeni kurulmalı")),
            h("td", { class: "sayi-h" }, st.bilinen ? String(st.toplam) : h("span", { class: "soluk kucuk" }, "Stok girişi yapılmadı")),
            h("td", { class: "sayi-h" }, String(acikIs)));
        })))) : h("p", { class: "temiz" }, arsiv ? "Arşivde müşteri yok." : "Henüz müşteri yok."));
  };

  SAYFALAR.musteri = function (r) {
    var m = musteri(r.id);
    if (!m) return h("div", null, sayfaBasligi("Müşteri bulunamadı"), ic(rotaLink("musteriler"), "← Müşteriler"));
    var b = bugun(), cak = C.cakismaHaritasi(S.veri.etkinlikler);
    var icl = S.veri.icerikler.filter(function (i) { return i.musteriId === m.id && !i.arsiv; });
    var etl = S.veri.etkinlikler.filter(function (e) { return e.musteriId === m.id && !e.arsiv; }).sort(C.etkinlikSirala);
    var yaklasan = etl.filter(function (e) { return C.aralik(e)[1] > b + " 00:00"; });
    var gecmis = etl.filter(function (e) { return C.aralik(e)[1] <= b + " 00:00"; }).reverse().slice(0, 8);
    var duzen = C.duzenDurumu(m);
    var sayilar = C.DURUMLAR.map(function (d) {
      var n = icl.filter(function (i) { return i.durum === d.k; }).length;
      return n ? h("span", null, ic(rotaLink("icerikler", { musteri: m.id, durum: d.k }), d.ad + " " + n)) : null;
    });
    var esik = m.stokUyari !== null && m.stokUyari !== undefined ? m.stokUyari : null;
    var varsEsik = S.veri.ayar && S.veri.ayar.varsayilanStokUyari !== null && S.veri.ayar.varsayilanStokUyari !== undefined ? S.veri.ayar.varsayilanStokUyari : null;
    return h("div", null,
      h("p", { class: "kucuk" }, ic(rotaLink("musteriler"), "← Müşteriler")),
      sayfaBasligi(m.ad + (m.arsiv ? " (arşiv)" : ""), m.kurum || null, [
        h("button", { class: "btn", type: "button", onclick: function () { musteriPenceresi(m.id); } }, "Düzenle"),
        h("button", { class: "btn", type: "button", onclick: function () { icerikPenceresi(null, { musteriId: m.id }); } }, "İçerik ekle"),
        h("button", { class: "btn", type: "button", onclick: function () { etkinlikPenceresi(null, { musteriId: m.id }); } }, "Çekim ekle"),
        h("button", { class: "btn" + (m.arsiv ? "" : " tehlike"), type: "button", onclick: function () { arsivDegistir("musteri", m, !m.arsiv); } }, m.arsiv ? "Arşivden çıkar" : "Arşivle")]),
      h("dl", { class: "bilgi" },
        h("dt", null, "Aylık ücret"), h("dd", null, m.ucret === null || m.ucret === undefined ? h("span", { class: "uyari" }, "Belirlenmedi") : C.para(m.ucret)),
        h("dt", null, "Yayın düzeni"), h("dd", null, C.siklikMetni(m), duzen.tamam ? null : h("div", { class: "uyari kucuk" }, "Yayın düzeni kurulmalı: " + duzen.eksik)),
        h("dt", null, "Paylaşım türü"), h("dd", null, (C.SLOT_TURLERI.filter(function (x) { return x.k === (m.slotTuru || "video"); })[0] || {}).ad),
        h("dt", null, "Stok uyarı eşiği"), h("dd", null, esik !== null ? String(esik) : varsEsik !== null ? varsEsik + " (varsayılan)" : "Yok")),
      bolum("Stok ve yayın ihtiyacı", null, null, stokBlogu(m, true)),
      bolum("Çekimler", yaklasan.length, rotaLink("cekim", { musteri: m.id }),
        [yaklasan.length ? yaklasan.map(function (e) { return etkinlikSatiri(e, cak); }) : h("p", { class: "soluk kucuk" }, "Yaklaşan çekim yok."),
          gecmis.length ? h("details", null, h("summary", { class: "soluk kucuk" }, "Geçmiş çekimler (" + gecmis.length + ")"), gecmis.map(function (e) { return etkinlikSatiri(e, cak); })) : null]),
      bolum("İçerikler", icl.length, rotaLink("icerikler", { musteri: m.id }), [
        h("p", { class: "satir-bilgi" }, dizi(sayilar)),
        icl.filter(function (i) { return i.durum !== "yayinlandi"; }).sort(C.icerikSirala).slice(0, 15).map(function (i) { return icerikSatiri(i); })]),
      m.not ? bolum("Not", null, null, h("p", { class: "not-metni" }, m.not)) : null);
  };

  function stokBlogu(m, detay) {
    var b = bugun(), st = C.stok(S.veri, m, b), k7 = C.kapsama(S.veri, m, b, 7), k14 = C.kapsama(S.veri, m, b, 14);
    var parcalar = [];
    if (!st.bilinen) {
      parcalar.push(h("div", { class: "satir" }, h("span", { class: "uyari" }, "Stok girişi yapılmadı"),
        h("button", { class: "btn ince", type: "button", onclick: function () { stokGirisPenceresi(m.id); } }, "Stok girişi yap")));
    } else {
      var diger = Object.keys(st.digerHazir).filter(function (k) { return st.digerHazir[k]; }).map(function (k) { return "hazır " + (C.TUR_AD[k] || k).toLowerCase() + " " + st.digerHazir[k]; });
      parcalar.push(h("div", { class: "satir" }, h("b", null, "Hazır video " + st.toplam),
        h("span", { class: "satir-bilgi" }, dizi(["tarihe atanmış " + st.atanmis, st.gecmisTarihli ? "tarihi geçmiş, yayınlanmamış " + st.gecmisTarihli : null, "atanmamış " + st.atanmamis,
          "hazırlıkta " + st.hazirlikta].concat(diger.length ? [diger.join(", ") + " (videoya sayılmaz)"] : []))),
        detay ? h("button", { class: "btn ince", type: "button", onclick: function () { stokGirisPenceresi(m.id); } }, "Toplu stok ekle") : null));
    }
    if (!k7.duzenTamam) {
      parcalar.push(h("div", { class: "satir" }, h("span", { class: "uyari" }, "Yayın düzeni kurulmalı"), h("span", { class: "satir-bilgi" }, k7.eksik),
        h("button", { class: "btn ince", type: "button", onclick: function () { musteriPenceresi(m.id); } }, "Düzeni gir")));
    } else {
      [k7, k14].forEach(function (k) {
        var bilgi = [k.ihtiyac + " paylaşım günü", k.planli ? k.planli + " tarihe atanmış hazırla karşılanıyor" : (k.yayinlandi || !k.stokBilinen ? null : "tarihe atanmış hazır yok"),
          k.yayinlandi ? k.yayinlandi + " bugün yayınlandı" : null,
          k.oneri ? k.oneri + " atanmamış ya da tarihi geçmiş hazırla karşılanabilir (öneri)" : null,
          k.stokBilinen ? (k.acik ? k.acik + " açık" : "açık yok") : "stok bilinmediği için kalan " + (k.ihtiyac - k.planli - k.yayinlandi - k.oneri) + " gün belirsiz",
          k.ilkAcik ? "ilk karşılanmayan: " + C.tarihGunlu(k.ilkAcik) : null,
          k.slotDisiPlanli ? k.slotDisiPlanli + " hazır içerik paylaşım günü dışındaki bir tarihe planlı" : null];
        parcalar.push(h("div", { class: "satir" }, h("b", null, k.gunSayisi + " gün"), h("span", { class: "satir-bilgi" + (k.acik ? " uyari" : "") }, dizi(bilgi))));
      });
      if (detay) parcalar.push(slotDizisi(m, k14));
    }
    return parcalar;
  }
  function slotDizisi(m, k) {
    var ad = { planli: "planlı", yayinlandi: "yayınlandı", oneri: "öneri", acik: "açık", bilinmiyor: "bilinmiyor" };
    var turAd = function (g) { return ((C.SLOT_TURLERI.filter(function (x) { return x.k === g; })[0] || {}).ad || g).replace(/ \(.*\)$/, "").toLowerCase(); };
    return h("div", null, h("p", { class: "soluk kucuk" }, "Önümüzdeki 14 gündeki paylaşım günleri (" + (k.karisik ? "türler güne göre" : turAd(k.grup)) + "):"),
      h("div", { class: "slot-dizi" }, k.slotlar.map(function (s) {
        var i = s.icerikId ? icerikBul(s.icerikId) : null;
        var etiket = C.tarihGunlu(s.tarih) + (k.karisik ? " " + turAd(s.grup) : "") + ": " + ad[s.durum] + (i ? " · " + i.baslik : "");
        return h("button", { class: "slot " + s.durum, type: "button", title: "Bu gün: beklenen tür" + (s.durum === "oneri" ? " ve öneriyi plana çevirme" : ""),
          onclick: function () { slotPenceresi(m, s, i); } }, etiket + (s.durum === "oneri" ? " → ata" : ""));
      })));
  }
  /** Tek paylasim gunu: o gunun beklenen turu (istisna) ve varsa onerinin plana cevrilmesi. */
  function slotPenceresi(m, s, oneri) {
    var mg = musteri(m.id) || m, istisna = (mg.slotIstisna && !Array.isArray(mg.slotIstisna) ? mg.slotIstisna : {})[s.tarih] || "";
    var sec = h("select", { value: istisna }, h("option", { value: "" }, "Müşterinin olağan türü"), C.SLOT_TURLERI.map(function (x) { return h("option", { value: x.k }, x.ad); }));
    var ref = {};
    ref.d = pencere(C.tarihUzun(s.tarih) + " · " + mg.ad, [
      s.durum === "oneri" && oneri ? h("div", { class: "satir" }, h("span", null, "Öneri: “" + oneri.baslik + "” (" + (oneri.planTarihi ? "tarihi geçmiş hazır, " + C.tarihKisa(oneri.planTarihi) : "atanmamış hazır") + ")"),
        h("button", { class: "btn ince birincil", type: "button", onclick: function () { ref.d.close(); oneriyiAta(oneri, s.tarih); } }, "Bu tarihe ata")) : null,
      alan("Bu gün beklenen paylaşım türü", sec, h("small", null, "Yalnız bu tarih için. Olağan tür müşteri ayarındadır."))
    ], [vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Türü kaydet")], function () {
      var n = C.kopya(mg), yeniIst = C.kopya(mg.slotIstisna && !Array.isArray(mg.slotIstisna) ? mg.slotIstisna : {});
      if (sec.value) yeniIst[s.tarih] = sec.value; else delete yeniIst[s.tarih];
      n.slotIstisna = yeniIst;
      ref.d.close();
      return uygula([{ tur: "musteri", yeni: n, onceki: C.kopya(mg) }], C.tarihGunlu(s.tarih) + " için beklenen tür: " + (sec.value ? sec.options[sec.selectedIndex].text : "olağan tür"));
    });
  }
  function oneriyiAta(i, tarih) {
    var n = C.kopya(i);
    n.planTarihi = tarih;
    n.gecmis = (n.gecmis || []).concat([{ z: C.damga(), m: "Yayın tarihi atandı: " + C.tarihKisa(tarih, true) }]).slice(-60);
    uygula([{ tur: "icerik", yeni: n, onceki: C.kopya(i) }], "“" + i.baslik + "” " + C.tarihGunlu(tarih) + " tarihine atandı");
  }

  function musteriPenceresi(id) {
    var m = id ? musteri(id) : null;
    var v = m ? C.kopya(m) : { ad: "", kurum: "", ucret: null, siklik: { tur: "belirsiz", haftalikAdet: null, gunler: [], baslangic: null }, slotTuru: "video", stokUyari: null, stokGirisi: false, not: "", arsiv: false };
    var s = v.siklik || {};
    var g = {
      ad: h("input", { type: "text", maxlength: "120", value: v.ad, autocomplete: "off" }),
      kurum: h("input", { type: "text", maxlength: "120", value: v.kurum || "", autocomplete: "off" }),
      ucret: h("input", { type: "text", inputmode: "numeric", value: v.ucret === null || v.ucret === undefined ? "" : String(v.ucret), placeholder: "Boş = belirlenmedi" }),
      siklik: secim(C.SIKLIKLAR, s.tur || "belirsiz"),
      baslangic: tarihGirdisi(s.baslangic),
      adet: h("input", { type: "number", min: "1", max: "7", value: s.haftalikAdet ? String(s.haftalikAdet) : "" }),
      slot: secim(C.SLOT_TURLERI, v.slotTuru || "video"),
      esik: h("input", { type: "number", min: "0", max: "999", value: v.stokUyari === null || v.stokUyari === undefined ? "" : String(v.stokUyari), placeholder: "Boş = varsayılan" }),
      not: metinKutusu(v.not, 3)
    };
    var gunKutulari = C.GUN_UZUN.map(function (ad, i) { return h("input", { type: "checkbox", value: String(i + 1), checked: (s.gunler || []).indexOf(i + 1) !== -1 }); });
    var gunTurleri = C.GUN_UZUN.map(function (ad, i) {
      var t = (s.gunTurleri || {})[i + 1] || "";
      return h("select", { "aria-label": C.GUN_UZUN[i] + " paylaşım türü", value: t },
        h("option", { value: "" }, "Varsayılan tür"), C.SLOT_TURLERI.map(function (x) { return h("option", { value: x.k }, x.ad.replace(/ \(.*\)$/, "")); }));
    });
    function gunTuruGoster() { gunKutulari.forEach(function (k, i) { gunTurleri[i].hidden = !k.checked; }); }
    gunKutulari.forEach(function (k) { k.addEventListener("change", gunTuruGoster); });
    gunTuruGoster();
    var ucAlan = alan("Başlangıç / sıradaki yayın tarihi", g.baslangic, h("small", null, "3 günde 1 döngüsü bu tarihten sayılır. Boş bırakırsan tahmin yapılmaz."), "tam");
    var hfAlan = h("div", { class: "tam alan" }, h("span", null, "Yayın günleri"),
      h("div", { class: "gunler" }, gunKutulari.map(function (k, i) { return h("span", { class: "gun-secim" }, h("label", null, k, C.GUN_KISA[i]), gunTurleri[i]); })),
      h("small", null, "Gün seçmezsen tahmin yapılmaz (\"yayın düzeni kurulmalı\"). Bir gün farklı türde paylaşılıyorsa (ör. Cuma post) yanından seç."));
    var adetAlan = alan("Haftada kaç paylaşım", g.adet, h("small", null, "İsteğe bağlı. Tahmin seçili günlerin hepsinden yapılır; haftada daha az paylaşılıyorsa yalnız o günleri seç."));
    function goster() { ucAlan.hidden = g.siklik.value !== "uc_gun"; hfAlan.hidden = adetAlan.hidden = g.siklik.value !== "haftalik"; }
    g.siklik.addEventListener("change", goster);
    goster();
    function formDegeri() {
      var tur = g.siklik.value, ucret = C.ucretCoz(g.ucret.value);
      return {
        ad: g.ad.value.trim(), kurum: g.kurum.value.trim(), ucret: isNaN(ucret) ? null : ucret,
        siklik: {
          tur: tur,
          haftalikAdet: tur === "haftalik" && g.adet.value ? Math.max(1, Math.min(7, parseInt(g.adet.value, 10) || 1)) : null,
          gunler: tur === "haftalik" ? gunKutulari.filter(function (k) { return k.checked; }).map(function (k) { return +k.value; }) : [],
          gunTurleri: tur === "haftalik" ? gunKutulari.reduce(function (o, k, i) { if (k.checked && gunTurleri[i].value) o[k.value] = gunTurleri[i].value; return o; }, {}) : {},
          baslangic: tur === "uc_gun" ? (g.baslangic.value || null) : null
        },
        slotTuru: g.slot.value, stokUyari: g.esik.value === "" ? null : Math.max(0, parseInt(g.esik.value, 10) || 0), not: g.not.value
      };
    }
    var ilk = formDegeri();
    function doldur(k, yollar) {
      if (!degisti(yollar, "ad")) g.ad.value = k.ad || "";
      if (!degisti(yollar, "kurum")) g.kurum.value = k.kurum || "";
      if (!degisti(yollar, "ucret")) g.ucret.value = k.ucret === null || k.ucret === undefined ? "" : String(k.ucret);
      if (!degisti(yollar, "siklik")) {
        var s2 = k.siklik || {};
        g.siklik.value = s2.tur || "belirsiz";
        g.baslangic.value = s2.baslangic || "";
        g.adet.value = s2.haftalikAdet ? String(s2.haftalikAdet) : "";
        gunKutulari.forEach(function (kt, i) { kt.checked = (s2.gunler || []).indexOf(i + 1) !== -1; });
        gunTurleri.forEach(function (sel, i) { sel.value = (s2.gunTurleri || {})[i + 1] || ""; });
        goster();
        gunTuruGoster();
      }
      if (!degisti(yollar, "slotTuru")) g.slot.value = k.slotTuru || "video";
      if (!degisti(yollar, "stokUyari")) g.esik.value = k.stokUyari === null || k.stokUyari === undefined ? "" : String(k.stokUyari);
      if (!degisti(yollar, "not")) g.not.value = k.not || "";
    }
    function tabanYenile(guncel) {
      var yollar = degisenYollar(ilk, formDegeri());
      v = guncel;
      doldur(v, yollar);
      ilk = formDegeri();
      yollar.forEach(function (y) { yolYaz(ilk, y, yolAl(v, y)); });
    }
    var hataP = h("p", { class: "hata", role: "alert" });
    var ref = {};
    ref.d = pencere(m ? "Müşteriyi düzenle" : "Müşteri ekle", [
      h("div", { class: "izgara" },
        alan("Ad", g.ad), alan("Kurum", g.kurum, h("small", null, "İsteğe bağlı")),
        alan("Aylık ücret (TL)", g.ucret, h("small", null, "Anlaşma tutarı. Bilinmiyorsa boş bırak (0 sayılmaz).")),
        alan("Yayın sıklığı", g.siklik), adetAlan, ucAlan, hfAlan,
        alan("Beklenen paylaşım türü", g.slot, h("small", null, "Stok ve ihtiyaç bu türe göre hesaplanır. Post videoya sayılmaz.")),
        alan("Stok uyarı eşiği (hazır video)", g.esik),
        alan("Not", g.not, null, "tam")),
      hataP
    ], [vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Kaydet")], function () {
      var ucret = C.ucretCoz(g.ucret.value);
      if (!g.ad.value.trim()) { hataP.textContent = "Ad gerekli."; g.ad.focus(); return; }
      if (typeof ucret === "number" && isNaN(ucret)) { hataP.textContent = "Ücret TL olarak tam sayı olmalı (ör. 10000 ya da 10.000) ya da boş."; g.ucret.focus(); return; }
      var fs_ = formDegeri().siklik;
      if (fs_.tur === "haftalik" && fs_.haftalikAdet && fs_.gunler.length && fs_.gunler.length < fs_.haftalikAdet) {
        hataP.textContent = "Haftada " + fs_.haftalikAdet + " paylaşım için en az " + fs_.haftalikAdet + " gün seç (" + fs_.gunler.length + " seçili) ya da sayıyı düzelt.";
        g.adet.focus();
        return;
      }
      var n = degisenleriUygula(v, ilk, formDegeri());
      var anahtar = C.norm(n.ad) + "|" + C.norm(n.kurum);
      if (S.veri.musteriler.some(function (x) { return x.id !== v.id && C.norm(x.ad) + "|" + C.norm(x.kurum) === anahtar; })) {
        hataP.textContent = "Aynı ad ve kurumla bir müşteri zaten var.";
        return;
      }
      return pencereKaydet("musteri", n, hataP, tabanYenile).then(function (k) {
        if (!k) return;
        ref.d.close();
        if (!m) git("musteri", null, k.id); else yenile();
        toast(m ? "Müşteri güncellendi." : "Müşteri eklendi." + (k.stokGirisi ? "" : " Stok girişi için müşteri sayfasını kullan."));
      });
    });
  }

  /* ================= Icerikler ================= */

  function ozelFiltre(o) {
    var b = bugun(), uc = C.gunEkle(b, 3);
    return function (i) {
      var teslimde = i.teslimTarihi && C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1;
      if (o === "geciken") return teslimde && i.teslimTarihi < b;
      if (o === "yaklasan") return teslimde && i.teslimTarihi >= b && i.teslimTarihi <= uc;
      if (o === "gecmisplan") return !!i.planTarihi && i.planTarihi < b && i.durum !== "yayinlandi";
      if (o === "plansiz") return !i.planTarihi && i.durum === "hazir";
      if (o === "planlihazirdegil") return !!i.planTarihi && i.planTarihi >= b && i.planTarihi < C.gunEkle(b, 7) && i.durum !== "hazir" && i.durum !== "yayinlandi";
      return true;
    };
  }
  var OZEL_AD = { geciken: "Geciken kurgu teslimleri", yaklasan: "3 gün içinde teslim", gecmisplan: "Tarihi geçmiş, yayınlanmamış planlar", plansiz: "Tarihe atanmamış hazırlar", planlihazirdegil: "7 gün içinde planlı, hazır değil" };

  SAYFALAR.icerikler = function (r) {
    var p = r.p, gorunum = p.gorunum || tercih("gorunum") || "liste";
    var degistir = function (k, v) { var y = Object.assign({}, p); if (v === "" || v === null || v === false) delete y[k]; else y[k] = v; git("icerikler", y, null, true); };
    var f = { musteri: p.musteri, durum: p.durum, oncelik: p.oncelik, tur: p.tur, tarihAlan: p.tarih || "plan", bas: p.bas, bit: p.bit, arsiv: p.arsiv === "1", cekim: p.cekim, q: p.q };
    var mHar = C.idHaritasi(S.veri.musteriler);
    var l = C.icerikFiltrele(S.veri, f).filter(ozelFiltre(p.ozel)).filter(function (i) {
      return f.musteri || f.arsiv || C.aktif(mHar[i.musteriId]);
    }).sort(C.icerikSirala);
    var gorunurId = {};
    l.forEach(function (i) { gorunurId[i.id] = 1; });
    Object.keys(S.secili).forEach(function (id) { if (!gorunurId[id]) delete S.secili[id]; });

    var durumSec = secim(C.DURUMLAR, p.durum && p.durum.indexOf(",") === -1 ? p.durum : "", "Tüm durumlar");
    if (p.durum && p.durum.indexOf(",") !== -1) { durumSec.appendChild(h("option", { value: p.durum }, "Seçili durumlar")); durumSec.value = p.durum; }
    var filtreler = h("div", { class: "filtreler" },
      alan("Müşteri", h("select", { value: p.musteri || "", onchange: function (e) { degistir("musteri", e.target.value); } },
        h("option", { value: "" }, "Tüm müşteriler"), S.veri.musteriler.slice().sort(adSirala).map(function (m) { return h("option", { value: m.id }, m.ad + (m.arsiv ? " (arşiv)" : "")); }))),
      alan("Durum", (durumSec.addEventListener("change", function (e) { degistir("durum", e.target.value); }), durumSec)),
      alan("Öncelik", (function () { var s = secim(C.ONCELIKLER, p.oncelik, "Tümü"); s.addEventListener("change", function (e) { degistir("oncelik", e.target.value); }); return s; })()),
      alan("Tür", (function () {
        var s = h("select", { value: p.tur || "" }, h("option", { value: "" }, "Tümü"), h("option", { value: "video_grubu" }, "Video (Reels + video)"),
          C.TURLER.map(function (x) { return h("option", { value: x.k }, x.ad); }));
        s.addEventListener("change", function (e) { degistir("tur", e.target.value); });
        return s;
      })()),
      alan("Tarih", (function () {
        var s = h("select", { value: p.tarih || "plan" }, h("option", { value: "plan" }, "Planlanan yayın"), h("option", { value: "teslim" }, "Kurgu teslim"), h("option", { value: "yayin" }, "Yayınlandığı"));
        s.addEventListener("change", function (e) { degistir("tarih", e.target.value === "plan" ? "" : e.target.value); });
        return s;
      })()),
      alan("Başlangıç", h("input", { type: "date", value: p.bas || "", onchange: function (e) { degistir("bas", e.target.value); } })),
      alan("Bitiş", h("input", { type: "date", value: p.bit || "", onchange: function (e) { degistir("bit", e.target.value); } })),
      h("label", { class: "secenek" }, h("input", { type: "checkbox", checked: f.arsiv, onchange: function (e) { degistir("arsiv", e.target.checked ? "1" : ""); } }), "Arşiv"),
      Object.keys(p).filter(function (k) { return k !== "gorunum"; }).length ? h("button", { class: "btn ince", type: "button", onclick: function () { git("icerikler", p.gorunum ? { gorunum: p.gorunum } : {}, null, true); } }, "Filtreleri temizle") : null);

    var gorunumDugme = function (ad, etiket) {
      return h("button", { class: "btn" + (gorunum === ad ? " secili" : ""), type: "button", onclick: function () { tercih("gorunum", ad); degistir("gorunum", ad); } }, etiket);
    };
    var bas = sayfaBasligi("İçerikler", (p.ozel ? OZEL_AD[p.ozel] + " · " : "") + l.length + " içerik" + (p.cekim && etkinlik(p.cekim) ? " · Çekim: " + etkinlik(p.cekim).baslik : ""), [
      h("div", { class: "gorunum" }, gorunumDugme("liste", "Liste"), gorunumDugme("pano", "Pano")),
      h("button", { class: "btn", type: "button", onclick: function () { topluIcerikPenceresi({ musteriId: p.musteri, cekimId: p.cekim }); } }, "Toplu ekle"),
      h("button", { class: "btn birincil", type: "button", onclick: function () { icerikPenceresi(null, { musteriId: p.musteri || "", cekimId: p.cekim || null }); } }, "İçerik ekle")]);
    // Telefonda filtreler katlanir (etkin filtre varsa acik baslar)
    var etkinFiltre = ["musteri", "durum", "oncelik", "tur", "bas", "bit", "arsiv", "cekim", "ozel"].filter(function (k) { return p[k]; }).length;
    filtreler = h("details", { class: "filtre-kap", open: window.innerWidth > 860 || etkinFiltre > 0 },
      h("summary", null, "Filtreler" + (etkinFiltre ? " (" + etkinFiltre + ")" : "")), filtreler);
    if (gorunum === "pano") {
      var durumlar = p.durum ? p.durum.split(",") : C.DURUMLAR.map(function (d) { return d.k; });
      return h("div", null, bas, filtreler, h("p", { class: "soluk kucuk" }, "Kartı başka sütuna sürükleyerek durumunu değiştir. Telefonda karta dokunup durumu seç."), pano(l, durumlar));
    }
    var seciliSayi = Object.keys(S.secili).length;
    var topluDurum = secim(C.DURUMLAR, "", "Durum seç");
    var hepsi = h("input", { type: "checkbox", "aria-label": "Tümünü seç", checked: l.length > 0 && seciliSayi === l.length,
      onchange: function (e) { S.secili = {}; if (e.target.checked) l.forEach(function (i) { S.secili[i.id] = 1; }); yenile(); } });
    var topluCubuk = seciliSayi ? h("div", { class: "toplu-cubuk" }, h("b", null, seciliSayi + " seçili"), topluDurum,
      h("button", { class: "btn ince birincil", type: "button", onclick: function () {
        if (!topluDurum.value) { toast("Önce yeni durumu seç.", "hata"); return; }
        if (Object.keys(S.secili).length > 500) { toast("Bir seferde en çok 500 içerik değiştirilebilir.", "hata"); return; }
        durumlariDegistir(Object.keys(S.secili), topluDurum.value).then(function (ok) { if (ok) { S.secili = {}; yenile(); } });
      } }, "Durumu değiştir"),
      h("button", { class: "btn ince", type: "button", onclick: function () {
        if (Object.keys(S.secili).length > 500) { toast("Bir seferde en çok 500 içerik arşivlenebilir.", "hata"); return; }
        var degisim = Object.keys(S.secili).map(icerikBul).filter(Boolean).filter(function (i) { return !i.arsiv; }).map(function (i) {
          var n = C.kopya(i); n.arsiv = true; n.gecmis = (n.gecmis || []).concat([{ z: C.damga(), m: "Arşivlendi" }]).slice(-60);
          return { tur: "icerik", yeni: n, onceki: C.kopya(i) };
        });
        uygula(degisim, degisim.length + " içerik arşivlendi").then(function (ok) { if (ok) { S.secili = {}; yenile(); } });
      } }, "Arşivle"),
      h("button", { class: "btn ince", type: "button", onclick: function () { S.secili = {}; yenile(); } }, "Seçimi temizle")) : null;
    return h("div", null, bas, filtreler, topluCubuk,
      l.length ? h("div", null, h("label", { class: "secenek soluk kucuk" }, hepsi, "Tümünü seç"),
        l.map(function (i) {
          var kutu = h("input", { type: "checkbox", "aria-label": "Seç: " + i.baslik, checked: !!S.secili[i.id], onchange: function (e) {
            if (e.target.checked) S.secili[i.id] = 1; else delete S.secili[i.id];
            yenile();
          } });
          return icerikSatiri(i, kutu);
        })) : h("p", { class: "temiz" }, "Bu filtreye uyan içerik yok."));
  };

  function pano(l, durumlar) {
    return h("div", { class: "pano" }, durumlar.map(function (d) {
      var ogeler = l.filter(function (i) { return i.durum === d; });
      var kol = h("div", { class: "kolon", "data-durum": d,
        ondragover: function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; kol.classList.add("uzerinde"); },
        ondragleave: function () { kol.classList.remove("uzerinde"); },
        ondrop: function (ev) {
          ev.preventDefault();
          kol.classList.remove("uzerinde");
          var id = ev.dataTransfer.getData("text/plain");
          if (id && icerikBul(id)) durumlariDegistir([id], d);
        } },
      h("div", { class: "kolon-bas" }, durumRozet(d), h("span", { class: "sayi" }, ogeler.length)),
      ogeler.map(function (i) {
        var m = musteri(i.musteriId), b = bugun();
        return h("div", { class: "kart", draggable: "true", tabindex: "0", "data-id": i.id,
          ondragstart: function (ev) { ev.dataTransfer.setData("text/plain", i.id); ev.dataTransfer.effectAllowed = "move"; ev.currentTarget.classList.add("tasiniyor"); },
          ondragend: function (ev) { ev.currentTarget.classList.remove("tasiniyor"); },
          onclick: function () { icerikPenceresi(i.id); },
          onkeydown: function (ev) { if (ev.key === "Enter") icerikPenceresi(i.id); } },
          h("b", null, i.baslik), h("span", { class: "soluk kucuk" }, dizi([m ? m.ad : null, C.TUR_AD[i.tur], i.oncelik === "yuksek" ? "Öncelikli" : null])),
          i.teslimTarihi && C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1 ? h("span", { class: "kucuk" + (i.teslimTarihi < b ? " gecikti" : "") }, "Teslim " + C.tarihGunlu(i.teslimTarihi)) : null,
          i.planTarihi && i.durum !== "yayinlandi" ? h("span", { class: "kucuk" + (i.planTarihi < b ? " gecikti" : "") }, "Yayın " + C.tarihGunlu(i.planTarihi)) : null);
      }));
      return kol;
    }));
  }

  function cekimSecenekleri(sel, musteriId, secili) {
    sel.textContent = "";
    var l = S.veri.etkinlikler.filter(function (e) {
      return (e.id === secili) || (!e.arsiv && e.tur !== "toplanti" && (!musteriId || !e.musteriId || e.musteriId === musteriId));
    }).sort(C.etkinlikSirala).reverse();
    sel.appendChild(h("option", { value: "" }, "Bağlı çekim yok"));
    l.forEach(function (e) { sel.appendChild(h("option", { value: e.id }, C.tarihKisa(e.basTarih, true) + " · " + e.baslik)); });
    sel.value = secili || "";
  }
  function linkGirdisi(deger) {
    var girdi = h("input", { type: "text", value: deger || "", maxlength: "1000", placeholder: "https://… (bağlantı)" });
    var ipucu = h("small", null);
    function denetle() {
      var v = girdi.value.trim();
      ipucu.textContent = "";
      ipucu.className = "";
      if (!v) return;
      if (C.yerelYol(v)) { ipucu.className = "uyari"; ipucu.textContent = "Bu yerel bir dosya yolu: başka cihazda ya da tarayıcıda açılmaz."; }
      else if (C.guvenliLink(v)) ipucu.appendChild(disLink(v, "Bağlantıyı aç ↗"));
      else { ipucu.className = "uyari"; ipucu.textContent = "Tıklanabilir bağlantı değil (http:// ya da https:// ile başlamalı)."; }
    }
    girdi.addEventListener("input", denetle);
    denetle();
    return { girdi: girdi, ipucu: ipucu };
  }

  function icerikPenceresi(id, vars) {
    var ic_ = id ? icerikBul(id) : null;
    var v = ic_ ? C.kopya(ic_) : Object.assign({ musteriId: "", baslik: "", tur: "reels", durum: "fikir", oncelik: "normal", cekimId: null, teslimTarihi: null,
      planTarihi: null, yayinTarihi: null, revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [], arsiv: false }, vars || {});
    if (!ic_ && v.cekimId && !vars.durum) { var ce = etkinlik(v.cekimId); v.durum = ce && ce.durum === "tamamlandi" ? "cekildi" : "cekim_planlandi"; }
    var d = v.dosyalar || {};
    var g = {
      musteri: musteriSecimi(v.musteriId, "Müşteri seç", true),
      baslik: h("input", { type: "text", maxlength: "200", value: v.baslik, autocomplete: "off" }),
      tur: secim(C.TURLER, v.tur), durum: secim(C.DURUMLAR, v.durum), oncelik: secim(C.ONCELIKLER, v.oncelik),
      cekim: h("select"), teslim: tarihGirdisi(v.teslimTarihi), plan: tarihGirdisi(v.planTarihi), yayin: tarihGirdisi(v.yayinTarihi),
      revizyon: metinKutusu(v.revizyonNotu, 2), not: metinKutusu(v.not, 2),
      ham: linkGirdisi(d.ham), proje: linkGirdisi(d.proje), final: linkGirdisi(d.final)
    };
    cekimSecenekleri(g.cekim, v.musteriId, v.cekimId);
    g.musteri.addEventListener("change", function () { cekimSecenekleri(g.cekim, g.musteri.value, g.cekim.value); });
    var yayinAlan = alan("Yayınlandığı tarih", g.yayin, h("small", null, "Boş bırakırsan bugün yazılır."));
    var revAlan = alan("Revizyon notu", g.revizyon, null, "tam");
    function goster() { yayinAlan.hidden = g.durum.value !== "yayinlandi"; }
    g.durum.addEventListener("change", goster);
    goster();
    function formDegeri() {
      return {
        musteriId: g.musteri.value, baslik: g.baslik.value.trim(), tur: g.tur.value, durum: g.durum.value, oncelik: g.oncelik.value,
        cekimId: g.cekim.value || null, teslimTarihi: g.teslim.value || null, planTarihi: g.plan.value || null,
        yayinTarihi: g.durum.value === "yayinlandi" ? (g.yayin.value || null) : null,
        revizyonNotu: g.revizyon.value, not: g.not.value,
        dosyalar: { ham: g.ham.girdi.value.trim(), proje: g.proje.girdi.value.trim(), final: g.final.girdi.value.trim() }
      };
    }
    var ilk = formDegeri();
    function doldur(k, yollar) {
      if (!degisti(yollar, "musteriId")) { musteriSecenegi(g.musteri, k.musteriId); g.musteri.value = k.musteriId || ""; }
      if (!degisti(yollar, "baslik")) g.baslik.value = k.baslik || "";
      if (!degisti(yollar, "tur")) g.tur.value = k.tur;
      if (!degisti(yollar, "durum")) g.durum.value = k.durum;
      if (!degisti(yollar, "oncelik")) g.oncelik.value = k.oncelik;
      cekimSecenekleri(g.cekim, g.musteri.value, degisti(yollar, "cekimId") ? g.cekim.value : (k.cekimId || ""));
      if (!degisti(yollar, "teslimTarihi")) g.teslim.value = k.teslimTarihi || "";
      if (!degisti(yollar, "planTarihi")) g.plan.value = k.planTarihi || "";
      if (!degisti(yollar, "yayinTarihi")) g.yayin.value = k.yayinTarihi || "";
      if (!degisti(yollar, "revizyonNotu")) g.revizyon.value = k.revizyonNotu || "";
      if (!degisti(yollar, "not")) g.not.value = k.not || "";
      ["ham", "proje", "final"].forEach(function (a) {
        if (degisti(yollar, "dosyalar", a)) return;
        g[a].girdi.value = (k.dosyalar || {})[a] || "";
        g[a].girdi.dispatchEvent(new Event("input"));
      });
      goster();
    }
    function tabanYenile(guncel) {
      var yollar = degisenYollar(ilk, formDegeri());
      v = guncel;
      doldur(v, yollar);
      ilk = formDegeri();
      yollar.forEach(function (y) { yolYaz(ilk, y, yolAl(v, y)); });
    }
    var hataP = h("p", { class: "hata", role: "alert" });
    var ref = {};
    var gecmis = (v.gecmis || []).slice().reverse();
    ref.d = pencere(ic_ ? "İçerik" : "İçerik ekle", [
      h("div", { class: "izgara" },
        alan("Müşteri", g.musteri), alan("Başlık", g.baslik),
        alan("Tür", g.tur), alan("Durum", g.durum),
        alan("Öncelik", g.oncelik), alan("Bağlı çekim", g.cekim),
        alan("Kurgu teslim tarihi", g.teslim), alan("Planlanan yayın tarihi", g.plan, h("small", null, "Hazır içerik bu tarihe atanmış sayılır.")),
        yayinAlan, revAlan,
        alan("Ham görüntü bağlantısı", g.ham.girdi, g.ham.ipucu), alan("Proje dosyası bağlantısı", g.proje.girdi, g.proje.ipucu),
        alan("Final bağlantısı", g.final.girdi, g.final.ipucu), alan("Not", g.not)),
      h("p", { class: "soluk kucuk" }, "Dosya yüklenmez; yalnız bağlantı saklanır. Yerel dosya yolları başka cihazda açılmaz."),
      gecmis.length ? h("details", null, h("summary", { class: "soluk kucuk" }, "Geçmiş (" + gecmis.length + ")"),
        h("div", { class: "gecmis" }, gecmis.map(function (x) { return h("div", null, x.z + " · " + x.m); }))) : null,
      hataP
    ], [
      ic_ ? arsivDugmesi(!v.arsiv, function (hedef) { var g2 = icerikBul(ic_.id) || ic_; ref.d.close(); if (!!g2.arsiv !== hedef) arsivDegistir("icerik", g2, hedef); else toast(hedef ? "Kayıt zaten arşivde." : "Kayıt zaten arşivden çıkarılmış."); }) : null,
      vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Kaydet")
    ], function () {
      if (!g.musteri.value) { hataP.textContent = "Müşteri seç."; g.musteri.focus(); return; }
      if (!g.baslik.value.trim()) { hataP.textContent = "Başlık yaz."; g.baslik.focus(); return; }
      var zaman = C.damga(), b = bugun();
      var n = degisenleriUygula(v, ilk, formDegeri());
      if (n.durum === "yayinlandi" && !n.yayinTarihi) n.yayinTarihi = b;
      if (n.durum !== "yayinlandi") n.yayinTarihi = null;
      // Gecmis, pencerenin tabanina (acildigi ya da cakismada alinan guncel hal) gore yazilir
      var gec = (v.gecmis || []).slice();
      if (!ic_) gec.push({ z: zaman, m: "Eklendi (" + C.DURUM_AD[n.durum] + ")" });
      else {
        if (n.durum !== v.durum) gec.push({ z: zaman, m: C.DURUM_AD[v.durum] + " → " + C.DURUM_AD[n.durum] });
        if ((n.revizyonNotu || "") !== (v.revizyonNotu || "") && n.revizyonNotu) gec.push({ z: zaman, m: "Revizyon notu güncellendi" });
        if ((n.planTarihi || "") !== (v.planTarihi || "")) gec.push({ z: zaman, m: n.planTarihi ? "Yayın tarihi: " + C.tarihKisa(n.planTarihi, true) : "Yayın tarihi kaldırıldı" });
      }
      n.gecmis = gec.slice(-60);
      var taban = C.kopya(v);
      return pencereKaydet("icerik", n, hataP, tabanYenile).then(function (k) {
        if (!k) return;
        ref.d.close();
        yenile();
        if (!ic_) toast("İçerik eklendi.");
        else toast("Kaydedildi.", "", { ad: "Geri al", f: function () { geriAl([{ tur: "icerik", onceki: taban, sonraki: k }]); } });
      });
    }, true);
  }

  function topluIcerikPenceresi(vars) {
    vars = vars || {};
    var g = {
      musteri: musteriSecimi(vars.musteriId || "", "Müşteri seç"), cekim: h("select"),
      tur: secim(C.TURLER, "reels"), durum: secim(C.DURUMLAR, "fikir"), oncelik: secim(C.ONCELIKLER, "normal"), teslim: tarihGirdisi(null),
      basliklar: h("textarea", { rows: "8", placeholder: "Her satıra bir içerik başlığı" })
    };
    cekimSecenekleri(g.cekim, vars.musteriId, vars.cekimId);
    var cekimDurumu = function () {
      var e = etkinlik(g.cekim.value);
      if (e) g.durum.value = e.durum === "tamamlandi" ? "cekildi" : "cekim_planlandi";
    };
    cekimDurumu();
    g.cekim.addEventListener("change", cekimDurumu);
    g.musteri.addEventListener("change", function () { cekimSecenekleri(g.cekim, g.musteri.value, g.cekim.value); });
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {};
    ref.d = pencere("Toplu içerik ekle", [
      h("div", { class: "izgara" }, alan("Müşteri", g.musteri), alan("Bağlı çekim", g.cekim, h("small", null, "Bir çekimden birden çok içerik çıkabilir.")),
        alan("Tür", g.tur), alan("Durum", g.durum), alan("Öncelik", g.oncelik), alan("Kurgu teslim tarihi", g.teslim),
        alan("Başlıklar", g.basliklar, h("small", null, "Her satır ayrı bir içerik olur (en çok 300)."), "tam")),
      hataP
    ], [vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Ekle")], function () {
      var satirlar = g.basliklar.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!g.musteri.value) { hataP.textContent = "Müşteri seç."; return; }
      if (!satirlar.length) { hataP.textContent = "En az bir başlık yaz."; return; }
      if (satirlar.length > 300) { hataP.textContent = "Bir seferde en çok 300 içerik."; return; }
      if (satirlar.some(function (s) { return s.length > 200; })) { hataP.textContent = "Başlıklar en çok 200 karakter olmalı."; return; }
      var zaman = C.damga();
      var kayitlar = satirlar.map(function (s) {
        return { tur: "icerik", kayit: { musteriId: g.musteri.value, baslik: s, tur: g.tur.value, durum: g.durum.value, oncelik: g.oncelik.value,
          cekimId: g.cekim.value || null, teslimTarihi: g.teslim.value || null, planTarihi: null, yayinTarihi: g.durum.value === "yayinlandi" ? bugun() : null,
          revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [{ z: zaman, m: "Toplu eklendi (" + C.DURUM_AD[g.durum.value] + ")" }], arsiv: false } };
      });
      return topluKaydet(kayitlar).then(function (k) { if (k) { ref.d.close(); yenile(); toast(k.length + " içerik eklendi."); } });
    });
  }

  /* ================= Etkinlikler (cekim / toplanti) ================= */

  function etkinlikPenceresi(id, vars) {
    var e = id ? etkinlik(id) : null;
    var b = (vars && vars.basTarih) || bugun();
    var v = e ? C.kopya(e) : Object.assign({ musteriId: null, baslik: "", tur: "cekim", tumGun: false, basTarih: b, basSaat: "10:00", bitTarih: b, bitSaat: "12:00",
      konum: "", not: "", durum: "planlandi", arsiv: false }, vars || {});
    var g = {
      musteri: musteriSecimi(v.musteriId || "", "Müşteri yok (etkinlik / organizasyon)", true),
      baslik: h("input", { type: "text", maxlength: "200", value: v.baslik, autocomplete: "off" }),
      tur: secim(C.ETKINLIK_TURLERI, v.tur), durum: secim(C.ETKINLIK_DURUMLARI, v.durum),
      tumGun: h("input", { type: "checkbox", checked: !!v.tumGun }),
      basTarih: tarihGirdisi(v.basTarih), basSaat: h("input", { type: "time", value: v.basSaat || "10:00", step: "300" }),
      bitTarih: tarihGirdisi(v.bitTarih || v.basTarih), bitSaat: h("input", { type: "time", value: v.bitSaat || "12:00", step: "300" }),
      konum: h("input", { type: "text", maxlength: "300", value: v.konum || "" }), not: metinKutusu(v.not, 2)
    };
    var basSaatAlan = alan("Başlangıç saati", g.basSaat), bitSaatAlan = alan("Bitiş saati", g.bitSaat);
    var cakismaKutu = h("div", { class: "uyari-kutu", hidden: true });
    var bagliIcerik = e ? S.veri.icerikler.filter(function (i) { return i.cekimId === e.id && !i.arsiv; }) : [];
    function aday() {
      return { id: v.id, musteriId: g.musteri.value || null, tumGun: g.tumGun.checked, basTarih: g.basTarih.value, bitTarih: g.bitTarih.value || g.basTarih.value,
        basSaat: g.tumGun.checked ? null : g.basSaat.value, bitSaat: g.tumGun.checked ? null : g.bitSaat.value, durum: g.durum.value, arsiv: false };
    }
    function denetle() {
      basSaatAlan.hidden = bitSaatAlan.hidden = g.tumGun.checked;
      var a = aday();
      cakismaKutu.hidden = true;
      cakismaKutu.textContent = "";
      if (!C.gecerliTarih(a.basTarih) || !C.gecerliTarih(a.bitTarih) || (!a.tumGun && (!C.gecerliSaat(a.basSaat) || !C.gecerliSaat(a.bitSaat)))) return;
      if (C.aralik(a)[1] <= C.aralik(a)[0]) return;
      var c = C.cakisanlar(S.veri.etkinlikler, a);
      if (c.length) {
        cakismaKutu.hidden = false;
        ekle(cakismaKutu, ["Çakışma: bu zaman aralığında başka etkinlik var: ",
          dizi(c.map(function (x) { return x.baslik + " (" + C.tarihKisa(x.basTarih) + ", " + C.saatMetni(x) + ")"; }), "; "), ". Yine de kaydedebilirsin."]);
      }
    }
    function formDegeri() {
      var a = aday();
      return { musteriId: a.musteriId, tumGun: a.tumGun, basTarih: a.basTarih, bitTarih: a.bitTarih, basSaat: a.basSaat, bitSaat: a.bitSaat, durum: a.durum,
        baslik: g.baslik.value.trim(), tur: g.tur.value, konum: g.konum.value.trim(), not: g.not.value };
    }
    var ilk = formDegeri();
    function doldur(k, yollar) {
      if (!degisti(yollar, "musteriId")) { musteriSecenegi(g.musteri, k.musteriId); g.musteri.value = k.musteriId || ""; }
      if (!degisti(yollar, "baslik")) g.baslik.value = k.baslik || "";
      if (!degisti(yollar, "tur")) g.tur.value = k.tur;
      if (!degisti(yollar, "durum")) g.durum.value = k.durum;
      if (!degisti(yollar, "tumGun")) g.tumGun.checked = !!k.tumGun;
      if (!degisti(yollar, "basTarih")) g.basTarih.value = k.basTarih || "";
      if (!degisti(yollar, "bitTarih")) g.bitTarih.value = k.bitTarih || k.basTarih || "";
      if (!degisti(yollar, "basSaat") && k.basSaat) g.basSaat.value = k.basSaat;
      if (!degisti(yollar, "bitSaat") && k.bitSaat) g.bitSaat.value = k.bitSaat;
      if (!degisti(yollar, "konum")) g.konum.value = k.konum || "";
      if (!degisti(yollar, "not")) g.not.value = k.not || "";
      denetle();
    }
    function tabanYenile(guncel) {
      var yollar = degisenYollar(ilk, formDegeri());
      v = guncel;
      doldur(v, yollar);
      ilk = formDegeri();
      yollar.forEach(function (y) { yolYaz(ilk, y, yolAl(v, y)); });
    }
    [g.tumGun, g.basTarih, g.basSaat, g.bitTarih, g.bitSaat, g.durum].forEach(function (x) { x.addEventListener("change", denetle); x.addEventListener("input", denetle); });
    g.basTarih.addEventListener("change", function () { if (!g.bitTarih.value || g.bitTarih.value < g.basTarih.value) g.bitTarih.value = g.basTarih.value; denetle(); });
    denetle();
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {};
    ref.d = pencere(e ? "Çekim / etkinlik" : "Çekim / etkinlik ekle", [
      h("div", { class: "izgara" },
        alan("Müşteri", g.musteri, h("small", null, "Müşterisiz etkinlikler (ör. organizasyon) ücretli müşteri sayılmaz.")), alan("Başlık", g.baslik),
        alan("Tür", g.tur), alan("Durum", g.durum, h("small", null, "Geçmiş çekimler kendiliğinden tamamlanmaz.")),
        h("label", { class: "secenek tam" }, g.tumGun, "Tüm gün (birden çok gün sürebilir)"),
        alan("Başlangıç tarihi", g.basTarih), basSaatAlan, alan("Bitiş tarihi", g.bitTarih), bitSaatAlan,
        alan("Konum", g.konum), alan("Not", g.not)),
      cakismaKutu,
      e ? h("div", null, h("p", { class: "soluk kucuk" }, "Bu çekimden çıkan içerikler (" + bagliIcerik.length + "). Çekimin tamamlanması kurgu ya da teslimin bittiği anlamına gelmez."),
        bagliIcerik.map(function (i) { return h("div", { class: "satir" }, durumRozet(i.durum), h("button", { class: "satir-ad", type: "button", onclick: function () { ref.d.close(); icerikPenceresi(i.id); } }, i.baslik)); }),
        h("button", { class: "btn ince", type: "button", onclick: function () { ref.d.close(); topluIcerikPenceresi({ musteriId: e.musteriId, cekimId: e.id }); } }, "Bu çekimden içerik ekle")) : null,
      hataP
    ], [
      e ? arsivDugmesi(!v.arsiv, function (hedef) { var g2 = etkinlik(e.id) || e; ref.d.close(); if (!!g2.arsiv !== hedef) arsivDegistir("etkinlik", g2, hedef); else toast(hedef ? "Kayıt zaten arşivde." : "Kayıt zaten arşivden çıkarılmış."); }) : null,
      vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Kaydet")
    ], function () {
      var a = aday();
      if (!g.baslik.value.trim()) { hataP.textContent = "Başlık yaz."; g.baslik.focus(); return; }
      if (!C.gecerliTarih(a.basTarih)) { hataP.textContent = "Başlangıç tarihini gir."; return; }
      if (!a.tumGun && (!C.gecerliSaat(a.basSaat) || !C.gecerliSaat(a.bitSaat))) { hataP.textContent = "Başlangıç ve bitiş saatini gir ya da Tüm gün seç."; return; }
      if (a.bitTarih < a.basTarih || C.aralik(a)[1] <= C.aralik(a)[0]) { hataP.textContent = "Bitiş başlangıçtan sonra olmalı."; return; }
      var n = degisenleriUygula(v, ilk, formDegeri());
      if (!e) delete n.id;
      var cak = C.cakisanlar(S.veri.etkinlikler, n).length, taban = C.kopya(v);
      return pencereKaydet("etkinlik", n, hataP, tabanYenile).then(function (k) {
        if (!k) return;
        ref.d.close();
        yenile();
        toast((e ? "Kaydedildi." : "Eklendi.") + (cak ? " Dikkat: " + cak + " etkinlikle çakışıyor." : ""), cak ? "hata" : "",
          e ? { ad: "Geri al", f: function () { geriAl([{ tur: "etkinlik", onceki: taban, sonraki: k }]); } } : null);
      });
    }, true);
  }

  /* ================= Takvimler ================= */

  SAYFALAR.cekim = function (r) { return takvim(r, "cekim"); };
  SAYFALAR.yayin = function (r) { return takvim(r, "yayin"); };

  function takvim(r, katman) {
    var b = bugun(), p = r.p;
    var g = p.g || tercih("takvim") || (window.innerWidth < 700 ? "gun" : "hafta");
    if (["gun", "hafta", "ay"].indexOf(g) === -1) g = "hafta";
    var t = C.gecerliTarih(p.t) ? p.t : b, ikisi = p.ikisi === "1", mf = p.musteri || "";
    var gunler;
    if (g === "gun") gunler = [t];
    else if (g === "hafta") { var hb = p.kayan === "1" ? t : C.haftaBasi(t); gunler = [0, 1, 2, 3, 4, 5, 6].map(function (k) { return C.gunEkle(hb, k); }); }
    else gunler = [].concat.apply([], C.ayIzgarasi(t));
    var ilk = gunler[0], son = gunler[gunler.length - 1];
    var ogeler = takvimOgeleri(katman, ikisi, ilk, son, mf);
    var param = function (ek) { return Object.assign({}, p, ek); };
    var kaydir = function (yon) {
      var y = g === "gun" ? C.gunEkle(t, yon) : g === "hafta" ? C.gunEkle(t, 7 * yon) : C.ayEkle(t, yon);
      git(katman, param({ t: y }), null, true);
    };
    var donem = g === "gun" ? C.tarihUzun(t) : g === "hafta" ? C.tarihKisa(ilk) + " – " + C.tarihKisa(son, true) : C.ayAdi(t);
    var gorDugme = function (ad, et) {
      return h("button", { class: "btn" + (g === ad ? " secili" : ""), type: "button", onclick: function () { tercih("takvim", ad); git(katman, param({ g: ad }), null, true); } }, et);
    };
    var ust = h("div", { class: "takvim-ust" },
      h("button", { class: "btn", type: "button", "aria-label": "Önceki", onclick: function () { kaydir(-1); } }, "‹"),
      h("button", { class: "btn", type: "button", onclick: function () { git(katman, param({ t: "" }), null, true); } }, "Bugün"),
      h("button", { class: "btn", type: "button", "aria-label": "Sonraki", onclick: function () { kaydir(1); } }, "›"),
      h("span", { class: "donem" }, donem),
      h("div", { class: "gorunum" }, gorDugme("gun", "Gün"), gorDugme("hafta", "Hafta"), gorDugme("ay", "Ay")),
      h("select", { "aria-label": "Müşteri", value: mf, onchange: function (ev) { git(katman, param({ musteri: ev.target.value }), null, true); } },
        h("option", { value: "" }, "Tüm müşteriler"), aktifMusteriler().map(function (m) { return h("option", { value: m.id }, m.ad); })),
      h("label", { class: "secenek" }, h("input", { type: "checkbox", checked: ikisi, onchange: function (ev) { git(katman, param({ ikisi: ev.target.checked ? "1" : "" }), null, true); } }),
        katman === "cekim" ? "Paylaşımları da göster" : "Çekimleri de göster"));
    // Ekleme icin varsayilan gun: gun gorunumunde o gun; hafta/ay gorunumunde bugun goruntulenen donemdeyse bugun, yoksa donemin ilk gunu
    // (ay gorunumunde izgaranin onceki aydan gelen ilk hucresi degil, ayin 1'i)
    var varsayilanGun = function () {
      if (g === "gun") return t;
      if (g === "ay") return b.slice(0, 7) === t.slice(0, 7) ? b : C.ayBasi(t);
      return b >= ilk && b <= son ? b : ilk;
    };
    var eylem = katman === "cekim"
      ? h("button", { class: "btn birincil", type: "button", onclick: function () { etkinlikPenceresi(null, { basTarih: varsayilanGun(), musteriId: mf || null }); } }, "Çekim / etkinlik ekle")
      : h("button", { class: "btn birincil", type: "button", onclick: function () { icerikPenceresi(null, { musteriId: mf, planTarihi: g === "gun" ? t : null }); } }, "İçerik ekle");
    var govde;
    var gunBas = function (d, uzun) {
      return h("button", { class: "gun-bas" + (d === b ? " bugun" : ""), type: "button", onclick: function () { git(katman, param({ g: "gun", t: d }), null, true); } },
        uzun ? C.tarihUzun(d) : C.GUN_KISA[C.haftaGunu(d) - 1] + " " + C.tarihKisa(d));
    };
    if (g === "ay") {
      var ay = t.slice(0, 7);
      govde = h("div", { class: "ay" }, C.GUN_KISA.map(function (x) { return h("div", { class: "gb" }, x); }), gunler.map(function (d) {
        var l = ogeler[d] || [];
        return h("div", { class: "hucre" + (d.slice(0, 7) !== ay ? " disari" : "") + (d === b ? " bugun" : "") },
          h("button", { class: "gun-no", type: "button", onclick: function () { git(katman, param({ g: "gun", t: d }), null, true); } }, String(+d.slice(8))),
          l.length ? h("span", { class: "nokta" }, "● " + l.length) : null,
          l.slice(0, 3).map(takvimOgesi),
          l.length > 3 ? h("button", { class: "daha", type: "button", onclick: function () { git(katman, param({ g: "gun", t: d }), null, true); } }, "+" + (l.length - 3) + " daha") : null);
      }));
    } else if (g === "hafta") {
      govde = h("div", { class: "hafta" }, gunler.map(function (d) {
        var l = ogeler[d] || [];
        return h("div", { class: "gun-kolon" + (d === b ? " bugun" : "") }, gunBas(d), l.length ? l.map(takvimOgesi) : h("span", { class: "soluk kucuk" }, "—"));
      }));
    } else {
      var l1 = ogeler[t] || [];
      govde = h("div", { class: "gun-liste" }, l1.length ? l1.map(takvimOgesi) : h("p", { class: "temiz" }, "Bu gün için kayıt yok."));
    }
    var lejant = h("div", { class: "lejant" },
      (katman === "cekim" || ikisi) ? [h("span", null, h("i", { class: "t-cekim" }), "Çekim"), h("span", null, h("i", { class: "t-toplanti" }), "Toplantı / diğer"), h("span", null, h("i", { class: "lej-cakisma" }), "Çakışma")] : null,
      (katman === "yayin" || ikisi) ? [h("span", null, h("i", { class: "t-plan-hazir" }), "Planlı, hazır"), h("span", null, h("i", { class: "t-plan-hazirlikta" }), "Planlı, hazır değil"),
        h("span", null, h("i", { class: "t-yayinlandi" }), "Yayınlandı"), h("span", null, h("i", { class: "t-ihtiyac" }), "Paylaşım günü, hazır içerik yok"),
        h("span", null, h("i", { class: "t-ihtiyac oneri" }), "Atanmamış / tarihi geçmiş hazırdan karşılanabilir")] : null);
    return h("div", null, sayfaBasligi(katman === "cekim" ? "Çekim Takvimi" : "Yayın Takvimi", "Saatler Türkiye saatidir (Europe/Istanbul).", [eylem]), ust, govde, lejant);
  }
  function takvimOgeleri(katman, ikisi, ilk, son, mf) {
    var m = {}, koy = function (d, o) { (m[d] = m[d] || []).push(o); };
    var b = bugun(), mHar = C.idHaritasi(S.veri.musteriler);
    if (katman === "cekim" || ikisi) {
      var cak = C.cakismaHaritasi(S.veri.etkinlikler);
      S.veri.etkinlikler.filter(function (e) { return !e.arsiv && (!mf || e.musteriId === mf); }).forEach(function (e) {
        var bit = e.bitTarih || e.basTarih, d = e.basTarih < ilk ? ilk : e.basTarih, sonD = bit > son ? son : bit;
        for (; d <= sonD; d = C.gunEkle(d, 1)) {
          if (C.gundeMi(e, d)) koy(d, { tur: "etkinlik", e: e, gun: d, cak: cak[e.id], sira: e.tumGun ? "0" : "1" + (d === e.basTarih ? e.basSaat : "00:00") });
        }
      });
    }
    if (katman === "yayin" || ikisi) {
      S.veri.icerikler.filter(function (i) { return !i.arsiv && C.aktif(mHar[i.musteriId]) && (!mf || i.musteriId === mf); }).forEach(function (i) {
        if (i.durum === "yayinlandi") { if (i.yayinTarihi && i.yayinTarihi >= ilk && i.yayinTarihi <= son) koy(i.yayinTarihi, { tur: "yayin", i: i, sira: "2" }); }
        else if (i.planTarihi && i.planTarihi >= ilk && i.planTarihi <= son) koy(i.planTarihi, { tur: "plan", i: i, hazir: i.durum === "hazir", sira: "2" });
      });
      if (son >= b) {
        var n = Math.min(C.gunFarki(b, son) + 1, 120);
        aktifMusteriler().filter(function (mu) { return !mf || mu.id === mf; }).forEach(function (mu) {
          var k = C.kapsama(S.veri, mu, b, n);
          if (!k.duzenTamam) return;
          k.slotlar.forEach(function (s) {
            if (s.tarih >= ilk && (s.durum === "acik" || s.durum === "bilinmiyor" || s.durum === "oneri")) koy(s.tarih, { tur: "ihtiyac", m: mu, s: s, sira: "3" });
          });
        });
      }
    }
    Object.keys(m).forEach(function (d) { m[d].sort(function (x, y) { return x.sira < y.sira ? -1 : x.sira > y.sira ? 1 : 0; }); });
    return m;
  }
  function takvimOgesi(o) {
    if (o.tur === "etkinlik") {
      var e = o.e, mu = musteri(e.musteriId);
      return h("button", { class: "t-oge t-" + e.tur + (e.durum === "iptal" ? " iptal" : "") + (e.durum === "tamamlandi" ? " tamam" : "") + (o.cak ? " cakisma" : ""), type: "button",
        title: e.baslik + " · " + C.saatMetni(e) + (mu ? " · " + mu.ad : "") + (e.konum ? " · " + e.konum : "") + " · " + C.ETKINLIK_DURUM_AD[e.durum] + (o.cak ? " · ÇAKIŞMA" : ""),
        onclick: function () { etkinlikPenceresi(e.id); } },
        h("span", { class: "t-saat" }, C.gundekiSaat(e, o.gun || e.basTarih)), " ", e.baslik, o.cak ? " ⚠" : "", e.durum !== "planlandi" ? " (" + C.ETKINLIK_DURUM_AD[e.durum].toLowerCase() + ")" : "");
    }
    if (o.tur === "plan" || o.tur === "yayin") {
      var i = o.i, m = musteri(i.musteriId);
      return h("button", { class: "t-oge " + (o.tur === "yayin" ? "t-yayinlandi" : o.hazir ? "t-plan-hazir" : "t-plan-hazirlikta"), type: "button",
        title: (m ? m.ad + ": " : "") + i.baslik + " · " + C.DURUM_AD[i.durum], onclick: function () { icerikPenceresi(i.id); } },
        (m ? m.ad + ": " : "") + i.baslik, o.tur === "plan" && !o.hazir ? " (" + C.DURUM_AD[i.durum].toLowerCase() + ")" : "");
    }
    var metin = (o.s.grup && o.s.grup !== "video" ? ({ post: "post", story: "story", diger: "diğer" })[o.s.grup] + " günü, " : "") +
      (o.s.durum === "acik" ? "hazır içerik yok" : o.s.durum === "oneri" ? "atanmamış ya da tarihi geçmiş hazırdan karşılanabilir" : "paylaşım günü (stok bilinmiyor)");
    return h("a", { class: "t-oge t-ihtiyac" + (o.s.durum === "oneri" ? " oneri" : o.s.durum === "bilinmiyor" ? " bilinmiyor" : ""), href: rotaLink("musteri", null, o.m.id),
      title: o.m.ad + ": " + metin }, o.m.ad + ": " + metin);
  }

  /* ================= Stok ================= */

  var STOK_SUZGEC = { uyari: "Stok uyarısı olanlar", giris: "Stok girişi yapılmayanlar", duzen: "Yayın düzeni kurulmamış olanlar" };
  SAYFALAR.stok = function (r) {
    var l = aktifMusteriler(), b = bugun(), f = r && r.p ? r.p.f : "";
    var esik = S.veri.ayar ? S.veri.ayar.varsayilanStokUyari : null;
    var bilinmeyen = l.filter(function (m) { return !m.stokGirisi; });
    if (STOK_SUZGEC[f]) l = l.filter(function (m) {
      if (f === "giris") return !m.stokGirisi;
      if (f === "duzen") return !C.duzenDurumu(m).tamam;
      return C.stokUyarisi(S.veri, m, b, esik).seviye === "dusuk";
    });
    return h("div", null,
      sayfaBasligi("Stok", "Hazır stok: müşteri onayı alınmış, yayına hazır ve henüz yayınlanmamış videolar (Reels / video). Postlar videoya sayılmaz."),
      h("p", { class: "soluk kucuk" }, "İleri tarihe atanmış, tarihi geçip yayınlanmamış ve atanmamış hazırlar ayrı sayılır; üçünün toplamı hazır stoktur. Önümüzdeki 7 / 14 gün yayın düzenindeki gerçek günlerden hesaplanır. ",
        "“Öneri” atanmamış ya da tarihi geçmiş bir hazırın o güne konabileceğini gösterir; plana sen çevirmedikçe kaydedilmez."),
      STOK_SUZGEC[f] ? h("p", { class: "kucuk" }, "Gösterilen: " + STOK_SUZGEC[f] + " (" + l.length + ") · ", ic(rotaLink("stok"), "Tüm müşteriler")) : null,
      bilinmeyen.length ? h("div", { class: "uyari-kutu" }, bilinmeyen.length + " müşteride stok girişi yapılmadı; bunlarda stok 0 sayılmaz, “bilinmiyor” görünür.") : null,
      l.length ? l.map(function (m) {
        var u = C.stokUyarisi(S.veri, m, b, S.veri.ayar ? S.veri.ayar.varsayilanStokUyari : null);
        return h("div", { class: "stok-musteri" },
          h("div", { class: "ust-satir" }, h("b", null, musteriLink(m)), h("span", { class: "soluk kucuk" }, C.siklikMetni(m)),
            u.seviye === "dusuk" ? h("span", { class: "uyari-rozet" }, "Stok uyarısı") : null),
          stokBlogu(m, false),
          u.seviye === "dusuk" ? h("p", { class: "uyari kucuk" }, u.nedenler.join(" · ")) : null);
      }) : h("p", { class: "temiz" }, "Henüz müşteri yok."));
  };

  function stokGirisPenceresi(id) {
    var m = musteri(id);
    if (!m) return;
    var mevcut = S.veri.icerikler.filter(function (i) { return i.musteriId === m.id && !i.arsiv; });
    var hazirSayi = mevcut.filter(function (i) { return i.durum === "hazir"; }).length;
    var hazirlikSayi = mevcut.filter(function (i) { return C.HAZIRLIKTA.indexOf(i.durum) !== -1; }).length;
    var g = {
      hazir: h("textarea", { rows: "5", placeholder: "Her satıra bir başlık (isteğe bağlı)" }),
      hazirAdet: h("input", { type: "number", min: "0", max: "200", placeholder: "ya da yalnız adet" }),
      hazirTur: secim(C.TURLER, "reels"),
      hazirlik: h("textarea", { rows: "4", placeholder: "Her satıra bir başlık" }),
      hazirlikDurum: secim(C.DURUMLAR.filter(function (d) { return C.HAZIRLIKTA.indexOf(d.k) !== -1; }), "kurguda"),
      hazirlikTur: secim(C.TURLER, "reels")
    };
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {};
    ref.d = pencere("Stok girişi: " + m.ad, [
      h("p", { class: "soluk" }, "Şu an elindeki içerikleri gir. Hiç hazır içerik yoksa boş bırakıp kaydet: stok “0” olarak bilinir hale gelir."),
      mevcut.length ? h("p", { class: "soluk kucuk" }, "Sistemde bu müşteri için zaten " + hazirSayi + " hazır ve " + hazirlikSayi + " hazırlıkta içerik var; bunlar korunur, yenileri eklenir.") : null,
      h("div", { class: "izgara" },
        alan("Yayına hazır (onaylı, yayınlanmamış)", g.hazir, null, "tam"), alan("Adet (başlık yazmadıysan)", g.hazirAdet), alan("Tür", g.hazirTur),
        alan("Hazırlıkta olanlar", g.hazirlik, null, "tam"), alan("Durumları", g.hazirlikDurum), alan("Tür", g.hazirlikTur)),
      hataP
    ], [vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, m.stokGirisi ? "Ekle" : "Kaydet ve stok girişini tamamla")], function () {
      var satir = function (t) { return t.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); };
      var hz = satir(g.hazir), hzl = satir(g.hazirlik), adet = parseInt(g.hazirAdet.value, 10) || 0;
      if (!hz.length && adet > 0) { for (var k = 1; k <= Math.min(adet, 200); k++) hz.push("Hazır içerik " + k); }
      if (hz.concat(hzl).some(function (s) { return s.length > 200; })) { hataP.textContent = "Başlıklar en çok 200 karakter olmalı."; return; }
      if (hz.length + hzl.length > 400) { hataP.textContent = "Bir seferde en çok 400 içerik."; return; }
      var zaman = C.damga();
      var yeni = function (baslik, durum, tur) {
        return { tur: "icerik", kayit: { musteriId: m.id, baslik: baslik, tur: tur, durum: durum, oncelik: "normal", cekimId: null, teslimTarihi: null, planTarihi: null,
          yayinTarihi: null, revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [{ z: zaman, m: "Stok girişiyle eklendi (" + C.DURUM_AD[durum] + ")" }], arsiv: false } };
      };
      var kayitlar = hz.map(function (s) { return yeni(s, "hazir", g.hazirTur.value); }).concat(hzl.map(function (s) { return yeni(s, g.hazirlikDurum.value, g.hazirlikTur.value); }));
      var mg = musteri(id) || m; // gonderim anindaki (cakismadan sonra yenilenmis) kayit
      if (!mg.stokGirisi) { var mn = C.kopya(mg); mn.stokGirisi = true; kayitlar.push({ tur: "musteri", kayit: mn }); }
      if (!kayitlar.length) { ref.d.close(); return; }
      return topluKaydet(kayitlar).then(function (k) {
        if (!k) return;
        ref.d.close();
        yenile();
        toast(m.ad + ": " + (hz.length + hzl.length) + " içerik eklendi" + (m.stokGirisi ? "." : ", stok girişi tamamlandı."));
      });
    }, true);
  }

  /* ================= Arama ================= */

  SAYFALAR.ara = function (r) {
    var q = r.p.q || "";
    if (S.el && document.activeElement !== S.el.ara) S.el.ara.value = q;
    var s = C.ara(S.veri, q), cak = C.cakismaHaritasi(S.veri.etkinlikler);
    var toplam = s.musteriler.length + s.icerikler.length + s.etkinlikler.length;
    return h("div", null, sayfaBasligi("Arama: " + q, toplam + " sonuç"),
      s.musteriler.length ? bolum("Müşteriler", s.musteriler.length, null, s.musteriler.map(function (m) {
        return h("div", { class: "satir" + (m.arsiv ? " arsivli" : "") }, musteriLink(m), h("span", { class: "satir-bilgi" }, dizi([m.kurum, C.siklikMetni(m), m.arsiv ? "Arşivde" : null])));
      })) : null,
      s.icerikler.length ? bolum("İçerikler", s.icerikler.length, null, s.icerikler.slice(0, 100).map(function (i) { return icerikSatiri(i); })) : null,
      s.etkinlikler.length ? bolum("Çekim ve etkinlikler", s.etkinlikler.length, null, s.etkinlikler.slice().sort(C.etkinlikSirala).map(function (e) { return etkinlikSatiri(e, cak); })) : null,
      toplam ? null : h("p", { class: "temiz" }, "Sonuç yok."));
  };

  /* ================= Hizli ekle ================= */

  function hizliEkle() {
    var r = S.rota || {}, mid = r.ad === "musteri" ? r.id : (r.p && r.p.musteri) || "";
    var ref = {};
    var sec = function (baslik, aciklama, f) {
      return h("button", { class: "btn", type: "button", onclick: function () { ref.d.close(); f(); } }, baslik, h("small", null, aciklama));
    };
    ref.d = pencere("Ekle", [h("div", { class: "secim-izgara" },
      sec("İçerik", "Tek içerik kartı", function () { icerikPenceresi(null, { musteriId: mid }); }),
      sec("Toplu içerik", "Bir çekimden çıkan birden çok içerik", function () { topluIcerikPenceresi({ musteriId: mid }); }),
      sec("Çekim / etkinlik", "Çekim, toplantı ya da organizasyon", function () { etkinlikPenceresi(null, { musteriId: mid || null }); }),
      sec("Müşteri", "Yeni müşteri kaydı", function () { musteriPenceresi(null); }))], null, null);
  }

  /* ================= Ayarlar ================= */

  SAYFALAR.ayarlar = function () {
    var ayar = S.veri.ayar || {};
    var esik = h("input", { type: "number", min: "0", max: "999", value: ayar.varsayilanStokUyari === null || ayar.varsayilanStokUyari === undefined ? "" : String(ayar.varsayilanStokUyari), placeholder: "Boş = eşik yok" });
    var anlikKutu = h("div", null, h("p", { class: "soluk kucuk" }, "Yükleniyor…"));
    anliklariYukle(anlikKutu);
    var dosya = h("input", { type: "file", accept: "application/json,.json" });
    var onizleme = h("div");
    dosya.addEventListener("change", function () { iceAktarmaBasla(dosya, onizleme); });
    return h("div", null, sayfaBasligi("Ayarlar"),
      bolum("Stok uyarısı", null, null, h("form", { class: "filtreler", onsubmit: function (ev) {
        ev.preventDefault();
        var v = esik.value === "" ? null : Math.max(0, parseInt(esik.value, 10) || 0);
        kaydet("ayar", Object.assign({}, ayar.id ? { id: "ayar", surum: ayar.surum } : {}, { varsayilanStokUyari: v })).then(function (k) { if (k) { toast("Kaydedildi."); yenile(); } });
      } }, alan("Varsayılan eşik (hazır video)", esik, h("small", null, "Müşteride eşik yoksa bu kullanılır. Boşsa yalnız 7 günlük açık günlere bakılır.")),
        h("button", { class: "btn", type: "submit" }, "Kaydet"))),
      bolum("Yedekleme", null, null, [
        h("div", { class: "uyari-kutu" }, "Yedek dosyaları müşteri, ücret ve takvim bilgisi içerir. Güvenli bir yerde sakla; kimseyle paylaşma, herkese açık bir klasöre koyma."),
        h("div", { class: "eylemler" },
          h("button", { class: "btn", type: "button", onclick: jsonYedekIndir }, "JSON yedeği indir"),
          h("button", { class: "btn", type: "button", onclick: function () { indir("suflo-studio-musteriler-" + bugun() + ".csv", C.musterilerCsv(S.veri), "text/csv;charset=utf-8"); } }, "Müşteriler (CSV)"),
          h("button", { class: "btn", type: "button", onclick: function () { indir("suflo-studio-icerikler-" + bugun() + ".csv", C.iceriklerCsv(S.veri), "text/csv;charset=utf-8"); } }, "İçerikler (CSV)"))]),
      bolum("İçe aktar / geri yükle", null, null, [
        h("p", { class: "soluk kucuk" }, "Suflo Studio JSON yedeği ya da { musteriler, etkinlikler, icerikler } listesi seç. Önce önizleme gösterilir; aynı kayıtlar ikinci kez eklenmez, hiçbir şey sessizce silinmez. Uygulamadan önce otomatik kopya alınır."),
        alan("Dosya", dosya), onizleme]),
      bolum("Otomatik kopyalar", null, null, [h("p", { class: "soluk kucuk" }, "İçe aktarma ve geri yüklemeden önce sunucu tüm verinin kopyasını alır (son 30)."), anlikKutu]),
      bolum("Güvenlik", null, null, [
        h("div", { class: "eylemler" },
          h("button", { class: "btn", type: "button", onclick: sifrePenceresi }, "Şifreyi değiştir"),
          h("button", { class: "btn", type: "button", onclick: function () {
            onayla("Tüm oturumları kapat", "Telefon ve bilgisayar dahil tüm cihazlarda oturum kapanır; yeniden şifreyle girmen gerekir.", "Tümünü kapat").then(function (e) {
              if (e) api("oturumlari_kapat").then(function (j) { if (j.ok) girisEkrani("Tüm oturumlar kapatıldı."); else toast(hataMetni(j), "hata"); });
            });
          } }, "Tüm cihazlarda çıkış yap"),
          h("button", { class: "btn", type: "button", onclick: cikis }, "Çıkış"))]),
      bolum("Bilgi", null, null, h("dl", { class: "bilgi" },
        h("dt", null, "Saat dilimi"), h("dd", null, "Europe/Istanbul (UTC+3)"),
        h("dt", null, "Veri"), h("dd", null, "Suflo Studio sunucusunda; bu tarayıcıda saklanmaz. Telefon ve bilgisayar aynı kayıtları görür."),
        h("dt", null, "Silme"), h("dd", null, "Tek tek silme yok; kayıtlar arşivlenir. “Tümünü değiştir” ve “Bu kopyaya dön” mevcut kayıtları kaldırır; öncesinde otomatik kopya alınır (son 30 kopya saklanır)."))));
  };
  function indir(ad, icerik, tur) {
    var url = URL.createObjectURL(new Blob([icerik], { type: tur }));
    var a = h("a", { href: url, download: ad });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function jsonYedekIndir() {
    api("disa_aktar").then(function (j) {
      if (!j.ok) { toast(hataMetni(j), "hata"); return; }
      var metin = JSON.stringify(j.yedek, null, 2);
      indir("suflo-studio-yedek-" + bugun() + ".json", metin, "application/json");
      var govdeBayt = baytBoyutu({ islem: "ice_aktar", veriler: j.yedek.veriler });
      if (govdeBayt > GOVDE_SINIRI) toast("Yedek indirildi ama verisi " + (govdeBayt / 1048576).toFixed(1).replace(".", ",") + " MB; tek seferde geri yüklenebilecek boyutu (8 MB) aşıyor. Sunucudaki otomatik kopyalar yine geçerli.", "hata");
      else toast("Yedek indirildi. Özel bilgi içerir; güvenli yerde sakla.");
    });
  }
  function anliklariYukle(kutu) {
    api("anliklar").then(function (j) {
      kutu.textContent = "";
      if (!j.ok) { kutu.appendChild(h("p", { class: "hata" }, hataMetni(j))); return; }
      if (!j.anliklar.length) { kutu.appendChild(h("p", { class: "soluk kucuk" }, "Henüz otomatik kopya yok.")); return; }
      var neden = { ice_aktarma_oncesi: "İçe aktarma öncesi", geri_yukleme_oncesi: "Geri yükleme öncesi", anlik_geri_oncesi: "Kopyaya dönüş öncesi" };
      j.anliklar.forEach(function (a) {
        var z = C.istanbulSimdi(new Date(a.zaman * 1000));
        kutu.appendChild(h("div", { class: "satir" }, h("b", null, C.tarihKisa(z.tarih, true) + " " + z.saat), h("span", { class: "satir-bilgi" }, dizi([neden[a.neden] || a.neden, a.ozet])),
          h("span", { class: "sag" }, h("button", { class: "btn ince", type: "button", onclick: function () {
            onayla("Bu kopyaya dön", "Tüm veri " + C.tarihKisa(z.tarih, true) + " " + z.saat + " kopyasındaki haline döner (" + a.ozet + "). Şu anki hal önce otomatik kopyalanır.", "Kopyaya dön", "GERI YUKLE", true).then(function (e) {
              if (!e) return;
              api("anlik_geri", { id: a.id, onay: "GERI YUKLE" }).then(function (k) {
                if (!k.ok) { toast(hataMetni(k), "hata"); return; }
                veriYukle().then(function () { yenile(); toast("Kopyaya dönüldü."); });
              });
            });
          } }, "Bu kopyaya dön"))));
      });
    });
  }
  // Sunucu oturumlu istekte en cok 8 MB govde okur; sinir, dosyanin degil gonderilecek sikistirilmis JSON'un bayt boyutudur
  var GOVDE_SINIRI = 8 * 1024 * 1024 - 64 * 1024, DOSYA_SINIRI = 64 * 1024 * 1024;
  function baytBoyutu(o) { return new Blob([JSON.stringify(o)]).size; }
  function iceAktarmaBasla(dosyaGirdi, kutu) {
    kutu.textContent = "";
    var f = dosyaGirdi.files && dosyaGirdi.files[0];
    if (!f) return;
    if (f.size > DOSYA_SINIRI) { kutu.appendChild(h("p", { class: "hata" }, "Dosya çok büyük.")); return; }
    f.text().then(function (metin) {
      var obj;
      try { obj = JSON.parse(metin); } catch (e) { kutu.appendChild(h("p", { class: "hata" }, "Dosya geçerli JSON değil.")); return; }
      var c = C.yedekCoz(obj);
      if (c.hata) { kutu.appendChild(h("p", { class: "hata" }, c.hata)); return; }
      if (baytBoyutu({ islem: "ice_aktar", veriler: c.veriler, kip: "degistir", onay: "GERI YUKLE" }) > GOVDE_SINIRI) {
        kutu.appendChild(h("p", { class: "hata" }, "Veri tek seferde içe aktarılamayacak kadar büyük (sunucu sınırı 8 MB).")); return;
      }
      var dosyaUyarisi = (c.bilinmeyen || []).map(function (k) { return "bilinmeyen alan '" + String(k).slice(0, 40) + "' (dosyanın üst düzeyi): yok sayılacak"; });
      kutu.appendChild(h("p", { class: "soluk kucuk" }, "Önizleme hazırlanıyor…"));
      api("ice_aktar", { veriler: c.veriler, onizleme: true }).then(function (j) {
        kutu.textContent = "";
        if (!j.ok) { kutu.appendChild(h("p", { class: "hata" }, hataMetni(j))); return; }
        onizlemeGoster(kutu, j.onizleme, c.veriler, dosyaGirdi, dosyaUyarisi);
      });
    });
  }
  var SIKLIK_AD = { gunluk: "her gün", uc_gun: "3 günde 1", haftalik: "haftalık", belirsiz: "sıklık belirlenmedi" };
  function onizlemeGoster(kutu, o, veriler, dosyaGirdi, dosyaUyarisi) {
    dosyaUyarisi = dosyaUyarisi || [];
    if (dosyaUyarisi.length) o.uyarilar = dosyaUyarisi.concat(o.uyarilar || []);
    var s = o.sayilar;
    var hataVar = o.hataSayisi > 0;
    var tekrar = function () {
      kutu.textContent = "";
      kutu.appendChild(h("p", { class: "soluk kucuk" }, "Önizleme yenileniyor…"));
      api("ice_aktar", { veriler: veriler, onizleme: true }).then(function (j) {
        kutu.textContent = "";
        if (!j.ok) { kutu.appendChild(h("p", { class: "hata" }, hataMetni(j))); return; }
        onizlemeGoster(kutu, j.onizleme, veriler, dosyaGirdi, dosyaUyarisi);
      });
    };
    var bitir = function (j) {
      if (j.hata === "onizleme_eski") { toast("Veri önizlemeden sonra değişti; önizleme yenilendi, yeniden kontrol et.", "hata"); tekrar(); return; }
      // Uygulama sirasinda dogrulama hatasi (ornegin baska cihazda eklenen kayitla cakisma): guncel onizlemeyi goster
      if (!j.ok && j.onizleme) { toast(hataMetni(j), "hata"); tekrar(); return; }
      if (!j.ok) { toast(hataMetni(j), "hata"); return; }
      dosyaGirdi.value = "";
      kutu.textContent = "";
      veriYukle().then(function () {
        yenile();
        toast("İçe aktarma tamamlandı: " + j.sonuc.sayilar.musteri + " müşteri, " + j.sonuc.sayilar.icerik + " içerik, " + j.sonuc.sayilar.etkinlik + " etkinlik eklendi.");
      });
    };
    var hataKutusu = function (liste, baslik) {
      return h("div", { class: "uyari-kutu kirmizi" }, h("b", null, baslik), liste.map(function (x) { return h("div", null, x); }));
    };
    var u = o.ucret || {};
    var degistirKutu = h("div");
    ekle(kutu, [
      h("dl", { class: "bilgi" }, h("dt", null, "Eklenecek"), h("dd", null, s.musteri + " müşteri, " + s.icerik + " içerik, " + s.etkinlik + " çekim / etkinlik"),
        h("dt", null, "Atlanacak"), h("dd", null, s.atlanan + " kayıt (zaten var ya da dosyada tekrar; mükerrer eklenmez)"),
        s.musteri ? [h("dt", null, "Eklenecek müşterilerin ücreti"), h("dd", null, "Bilinen aylık toplam " + C.para(u.toplam || 0) + " (" + (u.bilinen || 0) + " müşteri)" +
          (u.belirsiz ? " · " + u.belirsiz + " müşterinin ücreti belirlenmedi" : ""))] : null,
        h("dt", null, "Hatalı"), h("dd", { class: hataVar ? "uyari" : null }, String(o.hataSayisi))),
      hataVar ? hataKutusu(o.hatalar, "Hatalı kayıtlar düzeltilmeden içe aktarma yapılmaz:") : null,
      o.uyarilar && o.uyarilar.length ? h("div", { class: "uyari-kutu" }, h("b", null, "Uyarı (bu alanlar kaydedilmeyecek):"), o.uyarilar.map(function (x) { return h("div", null, x); })) : null,
      o.ekle.length ? h("details", null, h("summary", { class: "soluk kucuk" }, "Eklenecekler (müşteri bağlantısı ve ücretiyle)"), o.ekle.map(function (x) {
        if (x.tur === "musteri") return h("div", { class: "kucuk" }, "Müşteri: " + x.ad + " · " + C.para(x.ucret) + " · " + (SIKLIK_AD[x.siklik] || x.siklik));
        return h("div", { class: "kucuk" }, ({ icerik: "İçerik", etkinlik: "Etkinlik" })[x.tur] + ": " + x.ad + " → " + (x.bag || "müşteri yok"));
      })) : null,
      o.atla.length ? h("details", null, h("summary", { class: "soluk kucuk" }, "Atlananlar"), o.atla.map(function (x) { return h("div", { class: "kucuk" }, x.ad + " (" + x.neden + ")"); })) : null,
      h("div", { class: "eylemler" },
        h("button", { class: "btn birincil", type: "button", disabled: hataVar || !(s.musteri + s.icerik + s.etkinlik), onclick: function (ev) {
          var dugme = ev.target;
          dugme.disabled = true;
          api("ice_aktar", { veriler: veriler, beklenen: Object.assign({}, s, { durum: o.durum }) }).then(function (j) {
            if (!j.ok && j.hata !== "onizleme_eski") dugme.disabled = false;
            bitir(j);
          });
        } }, "Yalnız yenileri ekle"),
        h("button", { class: "btn tehlike", type: "button", onclick: function (ev) {
          // "Tumunu degistir" icin ayri, gercek onizleme: neyin silinip neyin gelecegi ve hatalar onaydan once gosterilir
          var dugme = ev.target;
          dugme.disabled = true;
          api("ice_aktar", { veriler: veriler, kip: "degistir", onizleme: true }).then(function (p) {
            dugme.disabled = false;
            degistirKutu.textContent = "";
            if (!p.ok) { toast(hataMetni(p), "hata"); return; }
            var d = p.onizleme, k = d.kaldirilacak || {}, e2 = d.sayilar;
            if (d.hataSayisi) { degistirKutu.appendChild(hataKutusu(d.hatalar, "Bu dosyayla tümünü değiştirme yapılamaz; hatalı kayıtlar:")); return; }
            onayla("Tüm veriyi bu dosyayla değiştir",
              "Şu anki kayıtlar silinecek: " + (k.musteri || 0) + " müşteri, " + (k.icerik || 0) + " içerik, " + (k.etkinlik || 0) + " çekim / etkinlik. " +
              "Yerine dosyadan gelecek: " + e2.musteri + " müşteri, " + e2.icerik + " içerik, " + e2.etkinlik + " çekim / etkinlik" + (d.ayar ? " ve ayarlar" : "") + ". " +
              (d.ayarSil ? "Yedekte ayar olmadığı için şu anki ayarlar (varsayılan stok eşiği) da kaldırılır. " : "") +
              "Şu anki hal önce otomatik kopyalanır (Ayarlar → Otomatik kopyalar).", "Değiştir", "GERI YUKLE", true).then(function (e) {
              if (e) api("ice_aktar", { veriler: veriler, kip: "degistir", onay: "GERI YUKLE", beklenen: Object.assign({}, e2, { durum: d.durum }) }).then(bitir);
            });
          });
        } }, "Tüm veriyi bu dosyayla değiştir…")),
      degistirKutu
    ]);
  }
  function sifrePenceresi() {
    var eski = h("input", { type: "password", autocomplete: "current-password" });
    var yeni = h("input", { type: "password", autocomplete: "new-password", minlength: "12" });
    var yeni2 = h("input", { type: "password", autocomplete: "new-password" });
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {};
    ref.d = pencere("Şifreyi değiştir", [alan("Mevcut şifre", eski), alan("Yeni şifre", yeni, h("small", null, "En az 12 karakter.")), alan("Yeni şifre (tekrar)", yeni2),
      h("p", { class: "soluk kucuk" }, "Değişince diğer tüm cihazlarda oturum kapanır."), hataP],
    [vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Değiştir")], function () {
      if (yeni.value.length < 12) { hataP.textContent = "Yeni şifre en az 12 karakter olmalı."; return; }
      if (yeni.value !== yeni2.value) { hataP.textContent = "Yeni şifreler aynı değil."; return; }
      return api("sifre_degistir", { eski: eski.value, yeni: yeni.value }).then(function (j) {
        if (!j.ok) { hataP.textContent = hataMetni(j); return; }
        ref.d.close();
        toast("Şifre değişti. Diğer cihazlarda yeniden giriş gerekecek.");
      });
    });
  }

  basla();
})();
