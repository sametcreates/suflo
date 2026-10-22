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
  var S = { veri: bosVeri(), girisli: false, el: null, rota: null, secili: {}, listeAdet: null, sonYukleme: 0 };
  function bosVeri() { return { musteriler: [], icerikler: [], etkinlikler: [], bloklar: [], ozelgunler: [], ayar: null }; }

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
    sifre: "Şifre yanlış.", kilit: "Çok fazla hatalı deneme. Kilit kendiliğinden açılır; yaklaşık 15 dakika sonra yeniden dene.",
    kurulum: "Suflo Studio sunucusu henüz kurulmadı.", oturum: "Oturum sona erdi. Yeniden giriş yap.",
    cakisma: "Bu kayıt başka bir cihazda değişmiş. Güncel hali yüklendi; değişikliğini yeniden yap.",
    ayni_ad: "Aynı ad (ve kurum) ile bir müşteri zaten var.", veritabani: "Sunucu veritabanına bağlanamadı.",
    onay: "Onay metni gerekli.", yok: "Kayıt bulunamadı.", buyuk: "Dosya çok büyük.",
    kaynak: "Bu adresten erişim yok.", ag: "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.",
    mesgul: "Sunucu şu an meşgul; birkaç saniye sonra yeniden dene.",
    sunucu: "Sunucuda beklenmeyen bir hata oldu. Biraz sonra yeniden dene; sürerse son değişikliğin kaydedilip kaydedilmediğini kontrol et.",
    islem: "Sunucu bu işlemi tanımıyor. Sayfayı yenile; sürerse sunucudaki Studio dosyası güncel değildir.",
    onizleme_eski: "Veri önizlemeden sonra değişti; önizlemeyi yenile.",
    veritabani_sinir: "Veri, sunucu veritabanının tek seferde kabul ettiği sınırı aştı; hosting panelinden artırılması gerekir."
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
      // calisma bloklari ve ozel gunler bu surumle geldi; eski sunucu yanitinda yoksa bos liste
      S.veri.bloklar = S.veri.bloklar || [];
      S.veri.ozelgunler = S.veri.ozelgunler || [];
      S.sonYukleme = Date.now();
      return true;
    });
  }
  function liste(tur) {
    if (tur === "blok") return (S.veri.bloklar = S.veri.bloklar || []);
    if (tur === "ozelgun") return (S.veri.ozelgunler = S.veri.ozelgunler || []);
    return tur === "musteri" ? S.veri.musteriler : tur === "icerik" ? S.veri.icerikler : S.veri.etkinlikler;
  }
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
  /**
   * Yeni kayit icin istemci kimligi (sunucu bicimi [a-z0-9]{8,40}). Pencere acikken ayni kalir: yaniti kaybolan kaydetme
   * yeniden gonderilince sunucu ayni kimligi tanir, ikinci kayit olusmaz.
   */
  function yeniId() {
    var b = new Uint8Array(12);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
  }
  /**
   * Toplu pencerede satir kimlikleri: ayni satir (ayni alanlarla; ayni satir birden cok kez yazildiysa kacinci oldugu da)
   * yeniden gonderilince ayni kimligi alir. Duzeltilen satir yeni kimlik alir, eski haliyle yazilmis kayit sessizce yerine gecmez.
   */
  function satirKimlikleri(harita, kayitlar) {
    var sayac = {};
    kayitlar.forEach(function (x) {
      if (x.kayit.id) return;
      var v = sade(x.kayit);
      delete v.gecmis; // gecmis satirindaki dakika her denemede degisebilir
      var k = x.tur + "|" + JSON.stringify(v);
      sayac[k] = (sayac[k] || 0) + 1;
      k += "#" + sayac[k];
      x.kayit.id = harita[k] || (harita[k] = yeniId());
    });
    return kayitlar;
  }
  function kayitBul(tur, id) { return tur === "ayar" ? S.veri.ayar : bul(liste(tur), id); }
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
      var x = j.sira !== undefined ? kayitlar[j.sira] : null;
      if (j.hata === "cakisma" && j.guncel && x && x.kayit.id && x.kayit.surum === undefined && j.guncel.id === x.kayit.id) {
        // Bu pencerenin onceki denemesi yazilmis, yaniti kaybolmus (toplu yazma ya hep ya hic; kimlik bu pencerede uretildi).
        // Veri tazelenir; yalniz hala eksik olan yeni kayitlar gonderilir, yazilmis olanlar ikinci kez eklenmez.
        return veriYukle().then(function (tamam) {
          if (!tamam) return null;
          var eksik = kayitlar.filter(function (y) { return y.kayit.id && y.kayit.surum === undefined && !kayitBul(y.tur, y.kayit.id); });
          return (eksik.length ? topluKaydet(eksik) : Promise.resolve([])).then(function (k) {
            return k ? kayitlar.map(function (y) { return kayitBul(y.tur, y.kayit.id) || y.kayit; }) : null;
          });
        });
      }
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
      if (j.hata === "cakisma" && j.guncel && n.id && n.surum === undefined && j.guncel.id === n.id && j.guncel.guncelleme === j.guncel.olusturma) {
        // Bu pencerenin onceki denemesi yazilmis, yaniti kaybolmus; kayit o zamandan beri degismedi (ayni tekrari sunucu
        // zaten basarili sayar). Ikinci kayit eklenmez: kayit penceredeki son haliyle bir kez guncellenir.
        var n2 = C.kopya(n);
        n2.surum = j.guncel.surum;
        return pencereKaydet(tur, n2, hataP, tabanYenile);
      }
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

  /**
   * Bildirim. eylem: { ad, f } ya da birden cok eylem icin dizi. kalici: kendiliginden kapanmaz (toplu degisikligin
   * "Geri al"i), yalniz x ile ya da eylemle kapanir.
   * En cok 3 bildirim durur; fazlasinda once eylemsizler, sonra kalici olmayanlar, en son en eskisi kalkar.
   */
  function toast(metin, tur, eylem, kalici) {
    var kap = document.querySelector(".toastlar");
    if (!kap) { kap = h("div", { class: "toastlar", role: "status", "aria-live": "polite" }); document.body.appendChild(kap); }
    var t = h("div", { class: "toast " + (tur || "") + (eylem ? " eylemli" : "") + (kalici ? " kalici" : "") }, h("span", null, metin));
    var kaldir = function () { if (t.parentNode) t.parentNode.removeChild(t); };
    (eylem ? [].concat(eylem) : []).forEach(function (x) {
      t.appendChild(h("button", { class: "btn ince", type: "button", onclick: function () { kaldir(); x.f(); } }, x.ad));
    });
    t.appendChild(h("button", { class: "kapat", type: "button", "aria-label": "Kapat", onclick: kaldir }, "×"));
    kap.appendChild(t);
    while (kap.children.length > 3) {
      var at = kap.querySelector(".toast:not(.eylemli):not(.kalici)") || kap.querySelector(".toast:not(.kalici)") || kap.firstChild;
      kap.removeChild(at);
    }
    if (!kalici) setTimeout(kaldir, eylem ? 12000 : (tur === "hata" ? 9000 : 5000));
  }
  /** Formdaki tum girdilerin anlik hali (degisiklik var mi karsilastirmasi icin). */
  function formDurumu(form) {
    return JSON.stringify(Array.prototype.map.call(form.querySelectorAll("input, select, textarea"), function (x) {
      return x.type === "checkbox" || x.type === "radio" ? x.checked : x.value;
    }));
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
      h("div", { class: "p-bas" }, h("h2", null, baslik), h("button", { class: "kapat", type: "button", "aria-label": "Kapat", onclick: function () { kapatIste(); } }, "×")),
      h("div", { class: "p-govde" }, govde),
      alt && alt.length ? h("div", { class: "p-alt" }, alt) : null);
    d.appendChild(form);
    d.addEventListener("close", function () { if (d.parentNode) d.parentNode.removeChild(d); });
    document.body.appendChild(d);
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    var ilk = d.querySelector("input:not([type=hidden]):not([type=checkbox]), select, textarea");
    if (ilk && !("ontouchstart" in window)) ilk.focus();
    // Kaydedilmemis yazi sessizce kaybolmasin: Esc, x, Vazgec ve telefonda geri tusu once sorar. Hicbir sey degismediyse
    // ya da kaydetme surerken (sonuc bildirimle gelir) hemen kapanir. Onay pencereleri (korumasiz) sormaz.
    var ilkDurum = formDurumu(form), soru = null;
    d.kirli = function () { return !d.korumasiz && d.open && formDurumu(form) !== ilkDurum; };
    function kapatIste() {
      if (gonderiliyor || !d.kirli()) { d.close(); return; }
      if (soru && soru.open) return; // soru zaten acik
      var p = onayla("Kaydedilmemiş değişiklik", "Bu pencerede kaydetmediğin değişiklikler var. Kapatırsan kaybolur.", "Kaydetmeden kapat", null, true);
      var acik = document.querySelectorAll("dialog[open]");
      soru = acik[acik.length - 1];
      p.then(function (e) {
        if (e) d.close();
        else if (ilk && !("ontouchstart" in window) && !d.contains(document.activeElement)) ilk.focus(); // odak pencereye doner (Esc yine bu pencereye gelir)
      });
    }
    d.kapatIste = kapatIste;
    d.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !gonderiliyor && d.kirli()) { ev.preventDefault(); kapatIste(); }
    });
    d.addEventListener("cancel", function (ev) {
      if (!gonderiliyor && d.kirli()) { ev.preventDefault(); kapatIste(); }
    });
    return d;
  }
  /**
   * Penceredeki arsiv dugmesi. Hedef (arsivle / arsivden cikar) dugme kurulurken sabitlenir: etiket ve islem ayni
   * kalir; pencere acikken kayit baska yerde degisse (cakismada form tazelense) bile etiketin tersi yapilmaz.
   */
  function arsivDugmesi(hedef, f) {
    return h("button", { class: "btn sol " + (hedef ? "tehlike" : ""), type: "button", onclick: function () { f(hedef); } }, hedef ? "Arşivle" : "Arşivden çıkar");
  }
  function vazgec(d) { return h("button", { class: "btn", type: "button", onclick: function () { var x = d.d || d; if (x.kapatIste) x.kapatIste(); else x.close(); } }, "Vazgeç"); }
  /** Onay penceresi. yazilacak verilirse kullanicinin o metni yazmasi gerekir. Promise<boolean> */
  function onayla(baslik, metin, dugme, yazilacak, tehlike) {
    return new Promise(function (coz) {
      var sonuc = false, girdi = yazilacak ? h("input", { type: "text", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", "aria-label": "Onay metni" }) : null;
      var hataP = h("p", { class: "hata", role: "alert" });
      var ref = {};
      var govde = [h("p", null, metin), yazilacak ? h("label", { class: "alan" }, h("span", null, "Onaylamak için " + yazilacak + " yaz"), girdi) : null, hataP];
      ref.d = pencere(baslik, govde, [vazgec(ref), h("button", { class: "btn " + (tehlike ? "tehlike" : "birincil"), type: "submit" }, dugme)], function () {
        // Buyuk / kucuk harf ve Turkce harf farki onemsiz ("geri yükle", "GERI YUKLE" de olur)
        if (yazilacak && C.katla(girdi.value) !== C.katla(yazilacak)) { hataP.textContent = "Onay metni eşleşmedi. Kutuya " + yazilacak + " yaz."; return; }
        sonuc = true;
        ref.d.close();
      });
      ref.d.korumasiz = true;
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
  function tarihGirdisi(v) { return h("input", { type: "date", min: "2000-01-01", max: "2099-12-31", value: v || "" }); }
  /**
   * Kaydetmeden once tarih kutularini denetler: [[girdi, kayittaki deger]]. Yili iki haneli yazilan (masaustunde "0026")
   * ya da 2000-2099 disindaki tarih kaydedilmez; kayitta zaten oyle duran (eski / ice aktarilmis) deger dokunulmadikca engellemez.
   */
  function tarihHatasi(hataP, ciftler) {
    for (var k = 0; k < ciftler.length; k++) {
      var gd = ciftler[k][0], d = gd.value;
      if (d && !C.makulTarih(d) && d !== (ciftler[k][1] || "")) {
        hataP.textContent = "Tarih geçersiz: yıl 4 haneli ve 2000 ile 2099 arasında olmalı (ör. " + bugun().slice(0, 4) + ").";
        gd.focus();
        return true;
      }
    }
    return false;
  }
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
      h("label", { for: "studio-sifre" }, "Şifre"), sifre, durum, btn,
      // Sifre e-postayla sifirlanmaz; yol kurulum notundadir (sunucu yolu bu herkese acik sayfaya yazilmaz)
      h("details", { class: "sifre-yardim soluk kucuk" }, h("summary", null, "Şifreni mi unuttun?"),
        h("p", null, "Şifre e-postayla sıfırlanmaz. Sunucudaki ayar dosyasına yeni şifrenin özeti yazılarak sıfırlanır; adımlar kurulum notunda (README → Bakım → “Şifre unutulursa”)."),
        h("p", null, "Verilerin silinmez. Sıfırlamadan sonra tüm cihazlarda yeniden giriş yapman gerekir.")));
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

  var MENU = [["genel", "Genel Bakış"], ["musteriler", "Müşteriler"], ["icerikler", "İçerikler"], ["cekim", "Takvim"],
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
  // Geri / ileri ile donulen sayfa kalinan yerden acilir: sayfadan ayrilmadan hemen once kaydirma konumu o gecmis
  // kaydina yazilir (yalniz dokunma ve gecislerde; kaydirma sirasinda yazilmaz). Yeni acilan sayfa en ustten baslar.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  function konumSakla() {
    try { history.replaceState(Object.assign({}, history.state || {}, { y: Math.round(window.scrollY) }), "", location.href); } catch (e) { /* konum saklanamazsa en ustten acilir */ }
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href^='#/']");
    if (a) konumSakla();
  }, true);
  function git(ad, p, id, yerinde) {
    var url = rotaLink(ad, p, id);
    if (yerinde) { history.replaceState(null, "", url); ciz(true); }
    else { konumSakla(); location.hash = url; }
  }
  function ciz(kaydirmaKalsin, donusY) {
    if (!S.girisli || !S.el) return;
    var r = S.rota = rota();
    var menuAd = r.ad === "musteri" ? "musteriler" : r.ad === "takvim" ? "cekim" : r.ad;
    S.el.nav.querySelectorAll("a").forEach(function (a) { a.classList.toggle("aktif", a.getAttribute("data-rota") === menuAd); });
    S.el.kabuk.classList.remove("menu-acik");
    if (r.ad !== "ara" && document.activeElement !== S.el.ara) S.el.ara.value = "";
    var y = window.scrollY;
    tkKapat();
    S.el.sayfa.className = "sayfa" + (menuAd === "cekim" ? " tk-sayfa" : "");
    S.el.sayfa.textContent = "";
    var f = SAYFALAR[r.ad] || SAYFALAR.genel;
    ekle(S.el.sayfa, [f(r)]);
    if (menuAd === "cekim") tkSeritSigdir(); // kolon genisligi ancak sayfa yerlesince olculur
    var ad = (MENU.filter(function (m) { return m[0] === menuAd; })[0] || [null, r.ad === "ara" ? "Arama" : "Genel Bakış"])[1];
    document.title = ad + " · Suflo Studio";
    window.scrollTo(0, kaydirmaKalsin ? y : (typeof donusY === "number" ? donusY : 0));
  }
  /** Veri degistikten sonra ayni sayfayi yeniden ciz (kaydirma korunur). */
  function yenile() { ciz(true); }
  window.addEventListener("hashchange", function () { var st = history.state; ciz(false, st && typeof st.y === "number" ? st.y : null); });
  // Degisiklik yapilmis bir pencere acikken sekme kapatilir ya da sayfa yenilenirse tarayici sorar
  window.addEventListener("beforeunload", function (ev) {
    // takvimde iyimser gosterilip henuz sunucuya yazilmamis (kuyrukta / gonderilmekte) degisiklik varsa da sorar
    if (!TK.calisiyor && !TK.kuyruk.length && !Array.prototype.some.call(document.querySelectorAll("dialog[open]"), function (d) { return d.kirli && d.kirli(); })) return;
    ev.preventDefault();
    ev.returnValue = "";
  });
  // Arka planda yenileme (baska cihazdaki degisiklikler). Pencere aciksa ya da Ayarlar'daysa (ice aktarma onizlemesi,
  // secilen dosya) sayfa yeniden cizilmez.
  function arkaPlanYenile(esik) {
    if (document.visibilityState !== "visible" || !S.girisli || Date.now() - S.sonYukleme <= esik) return;
    // takvimde surukleme, acik kucuk pencere ya da bekleyen kaydetme varken de yenilenmez (iyimser degisiklik ezilmesin)
    if (document.querySelector("dialog[open]") || (S.rota && S.rota.ad === "ayarlar") || tkMesgul()) return;
    veriYukle().then(function (ok) { if (ok && !document.querySelector("dialog[open]") && !(S.rota && S.rota.ad === "ayarlar") && !tkMesgul()) yenile(); });
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

  /**
   * Tek tikla sonraki durum dugmeleri (pencere acilmaz; "Geri al" bildirimi gelir). Arsivdeki icerikte yok.
   * haric: gosterilmeyecek hedef durumlar (or. satirin kendi "yayinlandi" dugmeleri varsa).
   */
  function hizliDurum(i, haric) {
    if (i.arsiv) return [];
    return C.sonrakiDurumlar(i.durum).filter(function (x) { return !haric || haric.indexOf(x.k) === -1; }).map(function (x) {
      return h("button", { class: "btn ince hizli", type: "button", title: "Durumu “" + C.DURUM_AD[x.k] + "” yap",
        onclick: function (ev) { ev.stopPropagation(); durumlariDegistir([i.id], x.k); } }, "→ " + x.ad);
    });
  }
  /** Musteri onayinda bekleme suresi ("3 gündür onayda"); gonderim gunu gecmiste yoksa null (uydurulmaz). 3 gunden itibaren uyari renginde. */
  function onayBeklemesi(i, sinif) {
    var d = i.durum === "onayda" ? C.onayaGidis(i) : null;
    if (!d) return null;
    var n = Math.max(0, C.gunFarki(d, bugun()));
    return h("span", { class: (sinif || "") + (n >= 3 ? " uyari" : ""), title: "Onaya gönderildiği gün: " + C.tarihKisa(d, true) }, n ? n + " gündür onayda" : "bugün onaya gitti");
  }
  /** Satirin bos yerine dokununca kaydi acar; satirdaki baglanti, dugme ve secim kutusu kendi isini yapar. */
  function satirDokun(f) {
    return function (ev) { if (!ev.target.closest("a, button, input, select, label")) f(); };
  }
  function icerikSatiri(i, onEk, ekDugmeler) {
    var m = musteri(i.musteriId), b = bugun(), tarih = [];
    if (i.teslimTarihi && C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1) tarih.push(h("span", { class: i.teslimTarihi < b ? "gecikti" : null }, "Teslim " + C.tarihGunlu(i.teslimTarihi)));
    if (i.planTarihi && i.durum !== "yayinlandi") tarih.push(h("span", { class: i.planTarihi < b ? "gecikti" : null }, "Yayın " + C.tarihGunlu(i.planTarihi)));
    if (i.durum === "yayinlandi" && i.yayinTarihi) tarih.push("Yayınlandı " + C.tarihGunlu(i.yayinTarihi));
    var dugmeler = hizliDurum(i, ekDugmeler ? ["yayinlandi"] : null).concat(ekDugmeler || []);
    return h("div", { class: "satir dokun" + (i.arsiv ? " arsivli" : ""), onclick: satirDokun(function () { icerikPenceresi(i.id); }) }, onEk || null, durumRozet(i.durum),
      h("button", { class: "satir-ad", type: "button", onclick: function () { icerikPenceresi(i.id); } }, i.baslik),
      i.oncelik === "yuksek" ? h("span", { class: "oncelik" }, "Öncelikli") : null,
      h("span", { class: "satir-bilgi" }, dizi([musteriLink(m), C.TUR_AD[i.tur] || i.tur].concat(tarih).concat([onayBeklemesi(i), revizyonNotuKisa(i), i.arsiv ? "Arşivde" : null]))),
      dugmeler.length ? h("span", { class: "sag" }, dugmeler) : null);
  }
  function etkinlikSatiri(e, cak, ekDugmeler) {
    var m = musteri(e.musteriId), c = cak && cak[e.id];
    return h("div", { class: "satir dokun" + (e.durum === "iptal" ? " iptal" : "") + (e.arsiv ? " arsivli" : ""), onclick: satirDokun(function () { etkinlikPenceresi(e.id); }) },
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
      // toplu degisikligin geri alma bildirimi kapatilana kadar durur
      toast(mesaj, "", { ad: "Geri al", f: function () { geriAl(degisim); } }, degisim.length >= 5);
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
    // Revizyona alirken ne duzeltilecegi ve yeni teslim gunu sorulur (pano, toplu cubuk, tek tik dugmesi)
    if (yeni === "revizyonda") return revizyonPenceresi(idler);
    var zaman = C.damga(), b = bugun(), degisim = [];
    idler.forEach(function (id) {
      var i = icerikBul(id);
      if (!i) return;
      var n = C.durumDegistir(i, yeni, zaman, b);
      if (n) degisim.push({ tur: "icerik", yeni: n, onceki: C.kopya(i) });
    });
    if (!degisim.length) return Promise.resolve(false);
    // Planlanan gunu gecmis icerik gec isaretlenirse yayin tarihine bugun yazildigi sessiz kalmaz (icerikten duzeltilebilir)
    var gecIsaret = yeni === "yayinlandi" && degisim.some(function (d) { return d.yeni.yayinTarihi === b && d.onceki.planTarihi && d.onceki.planTarihi < b; });
    return uygula(degisim, (degisim.length === 1 ? "“" + degisim[0].yeni.baslik + "”" : degisim.length + " içerik") + " → " + C.DURUM_AD[yeni] +
      (gecIsaret ? " (yayın tarihi: bugün)" : ""));
  }
  /** Revizyon notunun gecmise yazilan satiri (sunucu satiri 300 karakterle sinirlar). */
  function revizyonGecmisi(not) { return "Revizyon notu: " + not.slice(0, 250) + (not.length > 250 ? "…" : ""); }
  /**
   * Revizyona alma penceresi: "Ne düzeltilecek?" ve istege bagli yeni teslim tarihi. Eski teslim tarihi kendiliginden
   * degismez (yalniz gosterilir). Not gecmise metniyle yazilir: ikinci revizyonda ilk not kaybolmaz. Durum, not ve
   * tarih tek degisiklikle kaydedilir ("Geri al" hepsini geri getirir). Promise<boolean>
   */
  function revizyonPenceresi(idler) {
    var liste = idler.map(icerikBul).filter(function (i) { return i && i.durum !== "revizyonda"; });
    if (!liste.length) return Promise.resolve(false);
    return new Promise(function (coz) {
      var sonuc = false, tek = liste.length === 1 ? liste[0] : null, b = bugun();
      // Tek icerikte mevcut not gorunur (degistirilip yazilir); birden coklu secimde bos kalirsa notlar degismez
      var not = metinKutusu(tek ? tek.revizyonNotu : "", 3), teslim = tarihGirdisi(null);
      var eski = tek && C.gecerliTarih(tek.teslimTarihi) ? "Önceki teslim tarihi: " + C.tarihKisa(tek.teslimTarihi, true) + (tek.teslimTarihi < b ? " (geçti)" : "") + ". " : "";
      var hataP = h("p", { class: "hata", role: "alert" }), ref = {};
      ref.d = pencere(tek ? "Revizyon: " + tek.baslik : liste.length + " içerik revizyona", [
        alan("Ne düzeltilecek?", not, h("small", null, "Müşterinin istediği değişiklik. Önceki notlar içeriğin geçmişinde kalır.")),
        alan("Revizyon teslim tarihi", teslim, h("small", null, eski + "Boş bırakırsan teslim tarihi değişmez.")),
        hataP
      ], [vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Revizyona al")], function () {
        if (tarihHatasi(hataP, [[teslim, null]])) return;
        var zaman = C.damga(), metin = not.value.trim(), degisim = [];
        liste.forEach(function (i0) {
          var i = icerikBul(i0.id) || i0, n = C.durumDegistir(i, "revizyonda", zaman, b);
          if (!n) return;
          if (metin && metin !== String(i.revizyonNotu || "").trim()) { n.revizyonNotu = metin; n.gecmis.push({ z: zaman, m: revizyonGecmisi(metin) }); }
          if (teslim.value) { n.teslimTarihi = teslim.value; n.gecmis.push({ z: zaman, m: "Teslim tarihi: " + C.tarihKisa(teslim.value, true) }); }
          n.gecmis = n.gecmis.slice(-60);
          degisim.push({ tur: "icerik", yeni: n, onceki: C.kopya(i) });
        });
        if (!degisim.length) { ref.d.close(); return; }
        return uygula(degisim, (degisim.length === 1 ? "“" + degisim[0].yeni.baslik + "”" : degisim.length + " içerik") + " → " + C.DURUM_AD.revizyonda +
          (teslim.value ? " (teslim " + C.tarihGunlu(teslim.value) + ")" : "")).then(function (ok) {
          if (ok) { sonuc = true; ref.d.close(); }
        });
      });
      ref.d.addEventListener("close", function () { coz(sonuc); });
    });
  }
  /** Revizyondaki icerigin notu, listede kisaltilmis (tamami ustune gelince). */
  function revizyonNotuKisa(i, sinif) {
    var t = i.durum === "revizyonda" && i.revizyonNotu ? String(i.revizyonNotu).trim() : "";
    if (!t) return null;
    return h("span", { class: (sinif || "") + " rev-not", title: t }, "Revizyon: " + (t.length > 100 ? t.slice(0, 100) + "…" : t));
  }
  /** Planlanan gunu gecmis icerigi o gun yayinlanmis olarak isaretler (yayin tarihi = planlanan gun; geri alinabilir). */
  function planlananGundeYayinla(id) {
    var i = icerikBul(id);
    if (!i) return Promise.resolve(false);
    var n = C.durumDegistir(i, "yayinlandi", C.damga(), bugun(), i.planTarihi);
    if (!n) return Promise.resolve(false);
    return uygula([{ tur: "icerik", yeni: n, onceki: C.kopya(i) }], "“" + n.baslik + "” → " + C.DURUM_AD.yayinlandi + " (" + C.tarihGunlu(n.yayinTarihi) + ")");
  }
  function arsivDegistir(tur, kayit, arsiv) {
    var n = C.kopya(kayit);
    n.arsiv = arsiv;
    if (tur === "icerik") n.gecmis = (n.gecmis || []).concat([{ z: C.damga(), m: arsiv ? "Arşivlendi" : "Arşivden çıkarıldı" }]).slice(-60);
    var ad = kayit.ad || kayit.baslik || (tur === "blok" ? blokBaslik(kayit) : "");
    return uygula([{ tur: tur, yeni: n, onceki: C.kopya(kayit) }], "“" + ad + "” " + (arsiv ? "arşivlendi" : "arşivden çıkarıldı"));
  }

  /* ================= Genel Bakis ================= */

  /** Son JSON yedeginin indirildigi gun (ayar.sonYedek) ve kac gun once; hic yoksa null. */
  function sonYedek() {
    var d = S.veri.ayar && S.veri.ayar.sonYedek;
    if (!C.gecerliTarih(d)) return null;
    return { tarih: d, gun: Math.max(0, C.gunFarki(d, bugun())) };
  }
  function sonYedekMetni() {
    var y = sonYedek();
    if (!y) return "Bu sunucudan henüz JSON yedeği indirilmedi.";
    return "Son JSON yedeği: " + C.tarihKisa(y.tarih, true) + " (" + (y.gun ? y.gun + " gün önce" : "bugün") + ").";
  }
  var YEDEK_HATIRLATMA_GUN = 14;

  SAYFALAR.genel = function () {
    var b = bugun(), gb = C.genelBakis(S.veri, b, S.veri.ayar), cak = C.cakismaHaritasi(S.veri.etkinlikler);
    var bos = [], cipler = [], SINIR = 5;
    // Ust ozet: bos olmayan her bolum icin bir dugme (bolum basligindaki sayiyla ayni); dokununca o bolume kayar
    var kayit = function (sec, id, kisa, sayi) { sec.id = "gb-" + id; cipler.push({ id: sec.id, ad: kisa, n: sayi }); return sec; };
    // o: { id, ad, kisa, liste, link, satir, aciklama, sayi (varsayilan liste uzunlugu), birim ("+N … daha") }
    var dolu = function (o) {
      if (!o.liste.length) { bos.push(o.ad); return null; }
      var sayi = o.sayi !== undefined ? o.sayi : o.liste.length, kalan = o.liste.length - SINIR;
      var sec = bolum(o.ad, sayi, o.link, o.liste.slice(0, SINIR).map(o.satir), o.aciklama);
      var daha = "+" + kalan + " " + (o.birim || "tane") + " daha";
      if (kalan > 0 && o.link) sec.appendChild(h("p", { class: "daha-satir" }, ic(o.link, daha + " → listeyi aç", { class: "kucuk-link" })));
      else if (kalan > 0) {
        // Listesi olmayan bolumde kalanlar yerinde acilir
        var dugme = h("button", { class: "btn ince daha-satir", type: "button", onclick: function () {
          dugme.replaceWith.apply(dugme, o.liste.slice(SINIR).map(o.satir));
        } }, daha + " göster");
        sec.appendChild(dugme);
      }
      return kayit(sec, o.id, o.kisa, sayi);
    };
    var kok_ = h("div", null, sayfaBasligi("Bugün ne yapmalıyım?", C.tarihUzun(b)));
    var cipKutu = h("nav", { class: "ozet-cipler", "aria-label": "Bölümlere git" });
    kok_.appendChild(cipKutu);
    if (!S.veri.musteriler.length) {
      kok_.appendChild(h("div", { class: "uyari-kutu" }, "Henüz kayıt yok. ", ic(rotaLink("musteriler"), "Müşteri ekle"),
        " ya da müşteri listeni ", ic(rotaLink("ayarlar"), "Ayarlar → İçe aktar"), " ile yükle."));
    } else {
      // Sunucu dışındaki tek kopya indirilen JSON yedeği: 14 günü geçtiyse ya da hiç indirilmediyse nazikçe hatırlat
      var y = sonYedek();
      if (!y || y.gun > YEDEK_HATIRLATMA_GUN) {
        kok_.appendChild(h("p", { class: "yedek-hatirlatma uyari kucuk" }, (y ? "Son JSON yedeğini " + y.gun + " gün önce indirdin." : "Henüz JSON yedeği indirmedin.") +
          " Yeni yedek için: ", ic(rotaLink("ayarlar"), "Ayarlar → Yedekleme")));
      }
    }
    var gecmisDugme = function (e) {
      return [h("button", { class: "btn ince", type: "button", onclick: function () { etkinlikDurumu(e, "tamamlandi"); } }, "Tamamlandı"),
        h("button", { class: "btn ince", type: "button", onclick: function () { etkinlikDurumu(e, "iptal"); } }, "İptal")];
    };
    var icerikS = function (i) { return icerikSatiri(i); };
    // Bugunku cekim bittiyse (bitis saati gectiyse) yarini beklemeden durumu guncellenebilir
    var simdi = C.damga();
    var bugunS = function (e) { return etkinlikSatiri(e, cak, e.durum === "planlandi" && C.aralik(e)[1] <= simdi ? gecmisDugme(e) : null); };
    // Karsilanmayan paylasim gunleri musteri basina tek satir; baslik sayisi gun sayisidir
    var acik = gb.acikTarihler.filter(function (x) { return x.durum === "acik"; }), acikGrup = [], grupHar = {};
    acik.forEach(function (x) {
      var g = grupHar[x.musteri.id];
      if (!g) { g = grupHar[x.musteri.id] = { musteri: x.musteri, gunler: [] }; acikGrup.push(g); }
      g.gunler.push(x);
    });
    ekle(kok_, [
      dolu({ id: "bugun", ad: "Bugün: çekim ve etkinlikler", kisa: "Bugün çekim", liste: gb.bugunEtkinlik, link: rotaLink("cekim", { g: "gun", t: b }), satir: bugunS }),
      dolu({ id: "paylasim", ad: "Bugün paylaşılacaklar", kisa: "Bugün paylaşılacak", liste: gb.bugunPaylasilacaklar || [], link: rotaLink("icerikler", { durum: "hazir", bas: b, bit: b }), satir: icerikS,
        aciklama: "Bugüne planlı, yayına hazır içerikler. Paylaşınca “Yayınlandı”ya bas; yanlış basarsan “Geri al”." }),
      dolu({ id: "yaklasan", ad: "Önümüzdeki 7 gün: çekim ve etkinlikler", kisa: "7 gün çekim", liste: gb.yaklasanEtkinlik, link: rotaLink("cekim", { g: "hafta", t: C.gunEkle(b, 1), kayan: "1" }), satir: function (e) { return etkinlikSatiri(e, cak); } }),
      dolu({ id: "gecmiscekim", ad: "Durumu güncellenmemiş geçmiş çekim ve etkinlikler", kisa: "Geçmiş çekim", liste: gb.gecmisPlanliEtkinlik, satir: function (e) { return etkinlikSatiri(e, cak, gecmisDugme(e)); },
        aciklama: "Geçmiş çekimler kendiliğinden tamamlanmaz. Çekimin tamamlanması kurgunun bittiği anlamına gelmez." }),
      dolu({ id: "cekimbitti", ad: "Çekimi tamamlandı, içerik “Çekildi” yapılmadı", kisa: "Çekildi yapılmadı", liste: gb.cekimiBitenPlanli || [], link: rotaLink("icerikler", { ozel: "cekimbitti" }), satir: icerikS,
        aciklama: "Bağlı çekimi “Tamamlandı” olan ama hâlâ “Fikir” ya da “Çekim planlandı”da duran içerikler." }),
      dolu({ id: "geciken", ad: "Geciken kurgu teslimleri", kisa: "Geciken teslim", liste: gb.gecikenTeslim, link: rotaLink("icerikler", { ozel: "geciken" }), satir: icerikS }),
      dolu({ id: "teslim", ad: "3 gün içinde kurgu teslimi", kisa: "3 gün teslim", liste: gb.yaklasanTeslim, link: rotaLink("icerikler", { ozel: "yaklasan" }), satir: icerikS }),
      dolu({ id: "onayda", ad: "Müşteri onayında", kisa: "Onayda", liste: gb.onayda, link: rotaLink("icerikler", { durum: "onayda" }), satir: icerikS }),
      dolu({ id: "revizyon", ad: "Revizyonda", kisa: "Revizyonda", liste: gb.revizyonda, link: rotaLink("icerikler", { durum: "revizyonda" }), satir: icerikS }),
      dolu({ id: "acik", ad: "Hazır içerikle karşılanmayan paylaşım günleri (7 gün)", kisa: "Karşılanmayan gün", liste: acikGrup, sayi: acik.length, birim: "müşteri",
        link: rotaLink("yayin", { g: "hafta", t: b, kayan: "1" }), satir: function (g) {
          return h("div", { class: "satir" }, musteriLink(g.musteri), h("span", { class: "satir-bilgi" }, dizi(g.gunler.map(function (x) {
            var hz = x.hazirlikta ? icerikBul(x.hazirlikta) : null;
            return hz ? h("span", null, C.tarihGunlu(x.tarih) + " (planlı ama hazır değil: ",
              h("button", { class: "satir-ad", type: "button", onclick: function () { icerikPenceresi(hz.id); } }, hz.baslik), ", " + C.DURUM_AD[hz.durum] + ")") : C.tarihGunlu(x.tarih);
          }), ", ")));
        }, aciklama: gb.oneriSayisi ? gb.oneriSayisi + " paylaşım günü, tarihe atanmamış ya da tarihi geçmiş hazır içerikle karşılanabilir (öneri; plana çevirmek için müşteri sayfasından ata)." : null }),
      dolu({ id: "stok", ad: "Hazır stoku azalan müşteriler", kisa: "Stok azalan", liste: gb.stokUyarilari, link: rotaLink("stok", { f: "uyari" }), satir: function (x) {
        return h("div", { class: "satir" }, musteriLink(x.musteri), h("span", { class: "satir-bilgi uyari" }, x.nedenler.join(" · ")));
      } }),
      dolu({ id: "planli", ad: "7 gün içinde yayına planlı ama hazır değil", kisa: "Planlı, hazır değil", liste: gb.planliHazirDegil, link: rotaLink("icerikler", { ozel: "planlihazirdegil" }), satir: icerikS,
        aciklama: "Yayın düzeni ya da stok girişinden bağımsız: planlanan yayın tarihi yaklaşan ama henüz yayına hazır olmayan içerikler." }),
      dolu({ id: "gecmisplan", ad: "Planlanan tarihi geçti, yayınlandı işaretlenmedi", kisa: "Yayın işaretlenmedi", liste: gb.gecmisPlanYayinlanmamis, link: rotaLink("icerikler", { ozel: "gecmisplan" }), satir: function (i) {
        return icerikSatiri(i, null, [
          h("button", { class: "btn ince", type: "button", onclick: function () { planlananGundeYayinla(i.id); } }, "Planlanan günde yayınlandı (" + C.tarihKisa(i.planTarihi) + ")"),
          h("button", { class: "btn ince", type: "button", onclick: function () { durumlariDegistir([i.id], "yayinlandi"); } }, "Bugün yayınlandı")]);
      }, aciklama: "Planlanan paylaşımlar kendiliğinden yayınlandı sayılmaz. Paylaştığın günü seç; yanlış basarsan “Geri al”." }),
      gb.stokBilinmeyen.length ? kayit(bolum("Stok girişi yapılmadı", gb.stokBilinmeyen.length, rotaLink("stok", { f: "giris" }),
        h("p", { class: "satir-bilgi" }, dizi(gb.stokBilinmeyen.map(musteriLink), ", "))), "stokgiris", "Stok girişi yok", gb.stokBilinmeyen.length) : null,
      gb.duzenEksik.length ? kayit(bolum("Yayın düzeni kurulmalı", gb.duzenEksik.length, rotaLink("stok", { f: "duzen" }),
        h("p", { class: "satir-bilgi" }, dizi(gb.duzenEksik.map(function (x) { return musteriLink(x.musteri); }), ", "))), "duzen", "Düzen eksik", gb.duzenEksik.length) : null,
      bos.length ? h("p", { class: "temiz" }, "Şu an boş olan başlıklar: " + bos.join(" · ")) : null,
      gb.sayilar.length ? musteriSayiBolumu(gb.sayilar) : null
    ]);
    if (cipler.length) ekle(cipKutu, cipler.map(function (c) {
      return h("button", { class: "cip", type: "button", "data-hedef": c.id, onclick: function () {
        var el = document.getElementById(c.id);
        if (el) el.scrollIntoView({ block: "start" });
      } }, c.ad, h("span", { class: "sayi" }, c.n));
    }));
    else cipKutu.remove();
    return kok_;
  };
  /** Musteri bazinda durum tablosu: katlanabilir; acik / kapali tercihi bu tarayicida hatirlanir (telefonda kapali baslar). */
  function musteriSayiBolumu(sayilar) {
    var t = tercih("genelTablo"), acik = t ? t === "acik" : window.innerWidth > 860;
    var kat = h("details", { class: "tablo-katla", open: acik }, h("summary", null, h("h2", null, "Müşteri bazında durum"), h("span", { class: "soluk kucuk" }, " " + sayilar.length + " müşteri")),
      musteriSayiTablosu(sayilar), h("p", { class: "kucuk" }, ic(rotaLink("icerikler"), "Tüm içerikler →")));
    var son = acik; // toggle olayi ilk cizimde de gelebilir: yalniz gercek degisiklik saklanir
    kat.addEventListener("toggle", function () { if (kat.open !== son) { son = kat.open; tercih("genelTablo", son ? "acik" : "kapali"); } });
    return h("section", { class: "bolum" }, kat);
  }
  function musteriSayiTablosu(sayilar) {
    var kolonlar = [["cekildi", "Çekildi"], ["kurguda", "Kurguda"], ["onayda", "Onayda"], ["revizyonda", "Revizyonda"], ["hazir", "Yayına hazır"]];
    return h("div", { class: "tablo-kap" }, h("table", { class: "kartli" },
      h("thead", null, h("tr", null, h("th", null, "Müşteri"), kolonlar.map(function (k) { return h("th", { class: "sayi-h" }, k[1]); }))),
      h("tbody", null, sayilar.map(function (s) {
        // stok girisi yapilmamis musteride sifirlar "0" degil "—" (bilinmiyor) gorunur
        return h("tr", null, h("td", null, musteriLink(s.musteri), s.stokBilinen ? null : h("div", { class: "soluk kucuk" }, "Stok girişi yapılmadı")), kolonlar.map(function (k) {
          return h("td", { class: "sayi-h", "data-etiket": k[1] }, s[k[0]] ? ic(rotaLink("icerikler", { musteri: s.musteri.id, durum: k[0] }), String(s[k[0]])) :
            h("span", { class: "soluk", title: s.stokBilinen ? null : "Stok girişi yapılmadı" }, s.stokBilinen ? "0" : "—"));
        }));
      }))));
  }
  function etkinlikDurumu(e, durum) {
    var n = C.kopya(e);
    n.durum = durum;
    // "Bugün N iş tamamladın" sayimi icin tamamlanma ani (tamamlanmadiysa bos)
    // zaten tamamlanmis kayit yeniden tamamlandi yapilirsa ani uydurulmaz (eski kayitta yoksa bos kalir)
    n.tamamZaman = durum === "tamamlandi" ? (e.durum === "tamamlandi" ? (e.tamamZaman || null) : C.damga()) : null;
    return uygula([{ tur: "etkinlik", yeni: n, onceki: C.kopya(e) }], "“" + e.baslik + "” → " + C.ETKINLIK_DURUM_AD[durum]).then(function (ok) {
      if (ok && durum === "tamamlandi" && e.durum !== "tamamlandi") cekimBittiTeklifi(etkinlik(e.id) || n);
      return ok;
    });
  }
  /**
   * Cekim "Tamamlandı" yapilinca: bagli ve hala cekilmemis gorunen icerikleri tek tikla "Çekildi"ye alma ve bu cekimden
   * icerik ekleme teklifi. Tiklanmadikca hicbir sey degismez (unutulanlar Genel Bakis'ta gorunur). Yalniz tur "cekim":
   * toplanti ve diger etkinlikten icerik cikmaz, teklif gosterilmez.
   */
  function cekimBittiTeklifi(e) {
    if (!e || e.tur !== "cekim") return;
    var t = cekimTeklifi(e);
    toast("“" + e.baslik + "” tamamlandı." + t.metin, "", t.eylemler);
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
      l.length ? h("div", { class: "tablo-kap" }, h("table", { class: "kartli" },
        h("thead", null, h("tr", null, h("th", null, "Müşteri"), h("th", { class: "sayi-h" }, "Aylık ücret"), h("th", null, "Yayın düzeni"),
          h("th", { class: "sayi-h" }, "Hazır video"), h("th", { class: "sayi-h" }, "Açık işler"))),
        h("tbody", null, l.map(function (m) {
          var st = C.stok(S.veri, m, b), duzen = C.duzenDurumu(m);
          var acikIs = S.veri.icerikler.filter(function (i) { return i.musteriId === m.id && !i.arsiv && i.durum !== "yayinlandi" && i.durum !== "hazir"; }).length;
          return h("tr", { class: "tik", onclick: function (ev) { if (ev.target.tagName !== "A") git("musteri", null, m.id); } },
            h("td", null, ic(rotaLink("musteri", null, m.id), m.ad), m.kurum ? h("div", { class: "soluk kucuk" }, m.kurum) : null),
            h("td", { class: "sayi-h", "data-etiket": "Aylık ücret" }, m.ucret === null || m.ucret === undefined ? h("span", { class: "uyari" }, "Belirlenmedi") : C.para(m.ucret)),
            h("td", { "data-etiket": "Yayın düzeni" }, C.siklikMetni(m, b), duzen.tamam ? null : h("div", { class: "uyari kucuk" }, "Yayın düzeni kurulmalı")),
            h("td", { class: "sayi-h", "data-etiket": "Hazır video" }, st.bilinen ? String(st.toplam) : h("span", { class: "soluk kucuk" }, "Stok girişi yapılmadı")),
            h("td", { class: "sayi-h", "data-etiket": "Açık işler" }, String(acikIs)));
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
        h("dt", null, "Yayın düzeni"), h("dd", null, C.siklikMetni(m, b), duzen.tamam ? null : h("div", { class: "uyari kucuk" }, "Yayın düzeni kurulmalı: " + duzen.eksik)),
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
        var bilgi = [k.ihtiyac + " paylaşım günü", k.planli ? k.planli + " tarihe atanmış hazır içerikle karşılanıyor" : (k.yayinlandi || !k.stokBilinen ? null : "tarihe atanmış hazır içerik yok"),
          k.yayinlandi ? k.yayinlandi + " bugün yayınlandı" : null,
          k.oneri ? k.oneri + " atanmamış ya da tarihi geçmiş hazır içerikle karşılanabilir (öneri)" : null,
          k.stokBilinen ? (k.acik ? k.acik + " açık" : "açık yok") : "stok bilinmediği için kalan " + (k.ihtiyac - k.planli - k.yayinlandi - k.oneri) + " gün belirsiz",
          k.ilkAcik ? "ilk karşılanmayan: " + C.tarihGunlu(k.ilkAcik) : null,
          k.slotDisiPlanli ? k.slotDisiPlanli + " hazır içerik paylaşım günü dışındaki bir tarihe planlı" : null,
          k.ayniGunFazla ? k.ayniGunFazla + " hazır içerik aynı paylaşım gününe ikinci olarak planlı (o günü bir kez karşılar)" : null,
          k.turUyumsuz ? k.turUyumsuz + " hazır içerik başka türde beklenen bir paylaşım gününe planlı (o günü karşılamaz)" : null];
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
      s.durum === "oneri" && oneri ? h("div", { class: "satir" }, h("span", null, "Öneri: “" + oneri.baslik + "” (" + (oneri.planTarihi ? "tarihi geçmiş hazır içerik, " + C.tarihKisa(oneri.planTarihi) : "atanmamış hazır içerik") + ")"),
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
    var yeniKimlik = m ? null : yeniId();
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
        h("option", { value: "" }, "Olağan tür"), C.SLOT_TURLERI.map(function (x) { return h("option", { value: x.k }, x.ad.replace(/ \(.*\)$/, "")); }));
    });
    function gunTuruGoster() { gunKutulari.forEach(function (k, i) { gunTurleri[i].hidden = !k.checked; }); }
    gunKutulari.forEach(function (k) { k.addEventListener("change", gunTuruGoster); });
    gunTuruGoster();
    var ucAlan = alan("Başlangıç / sıradaki yayın tarihi", g.baslangic, h("small", null, "3 günde 1 döngüsü bu tarihten sayılır. Boş bırakırsan tahmin yapılmaz."), "tam");
    var hfAlan = h("div", { class: "tam alan" }, h("span", null, "Yayın günleri"),
      h("div", { class: "gunler" }, gunKutulari.map(function (k, i) { return h("span", { class: "gun-secim" }, h("label", null, k, C.GUN_KISA[i]), gunTurleri[i]); })),
      h("small", null, "Gün seçmezsen tahmin yapılmaz (“yayın düzeni kurulmalı”). Bir gün farklı türde paylaşılıyorsa (ör. Cuma post) yanından seç."));
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
        alan("Stok uyarı eşiği (beklenen türde hazır içerik)", g.esik),
        alan("Not", g.not, null, "tam")),
      hataP
    ], [vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Kaydet")], function () {
      var ucret = C.ucretCoz(g.ucret.value);
      if (!g.ad.value.trim()) { hataP.textContent = "Ad gerekli."; g.ad.focus(); return; }
      if (typeof ucret === "number" && isNaN(ucret)) { hataP.textContent = "Ücret TL olarak tam sayı olmalı (ör. 10000 ya da 10.000) ya da boş."; g.ucret.focus(); return; }
      if (g.esik.value !== "" && !(parseInt(g.esik.value, 10) <= 999)) { hataP.textContent = "Stok uyarı eşiği 0 ile 999 arasında olmalı (boş = varsayılan)."; g.esik.focus(); return; }
      var fs_ = formDegeri().siklik;
      if (fs_.tur === "uc_gun" && tarihHatasi(hataP, [[g.baslangic, (v.siklik || {}).baslangic]])) return;
      if (fs_.tur === "haftalik" && fs_.haftalikAdet && fs_.gunler.length && fs_.gunler.length < fs_.haftalikAdet) {
        hataP.textContent = "Haftada " + fs_.haftalikAdet + " paylaşım için en az " + fs_.haftalikAdet + " gün seç (" + fs_.gunler.length + " seçili) ya da sayıyı düzelt.";
        g.adet.focus();
        return;
      }
      var n = degisenleriUygula(v, ilk, formDegeri());
      if (!m) n.id = yeniKimlik;
      var anahtar = C.norm(n.ad) + "|" + C.norm(n.kurum);
      if (S.veri.musteriler.some(function (x) { return x.id !== n.id && C.norm(x.ad) + "|" + C.norm(x.kurum) === anahtar; })) {
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
    var b = bugun(), uc = C.gunEkle(b, 3), eHar = o === "cekimbitti" ? C.idHaritasi(S.veri.etkinlikler) : null;
    return function (i) {
      if (o === "cekimbitti") return C.cekimiBitti(i, eHar);
      var teslimde = i.teslimTarihi && C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1;
      if (o === "geciken") return teslimde && i.teslimTarihi < b;
      if (o === "yaklasan") return teslimde && i.teslimTarihi >= b && i.teslimTarihi <= uc;
      if (o === "gecmisplan") return !!i.planTarihi && i.planTarihi < b && i.durum !== "yayinlandi";
      if (o === "plansiz") return !i.planTarihi && i.durum === "hazir";
      if (o === "planlihazirdegil") return !!i.planTarihi && i.planTarihi >= b && i.planTarihi < C.gunEkle(b, 7) && i.durum !== "hazir" && i.durum !== "yayinlandi";
      return true;
    };
  }
  var OZEL_AD = { geciken: "Geciken kurgu teslimleri", yaklasan: "3 gün içinde teslim", gecmisplan: "Tarihi geçmiş, yayınlanmamış planlar", plansiz: "Tarihe atanmamış hazır içerikler", planlihazirdegil: "7 gün içinde planlı, hazır değil",
    cekimbitti: "Çekimi tamamlandı, “Çekildi” yapılmadı" };

  SAYFALAR.icerikler = function (r) {
    var p = r.p, gorunum = p.gorunum || tercih("gorunum") || "liste";
    var degistir = function (k, v) { var y = Object.assign({}, p); if (v === "" || v === null || v === false) delete y[k]; else y[k] = v; git("icerikler", y, null, true); };
    var f = { musteri: p.musteri, durum: p.durum, oncelik: p.oncelik, tur: p.tur, tarihAlan: p.tarih || "plan", bas: p.bas, bit: p.bit, arsiv: p.arsiv === "1", cekim: p.cekim, q: p.q };
    var mHar = C.idHaritasi(S.veri.musteriler);
    // Arama (q) ile acilan liste arsivdeki musterilerin iceriklerini de gosterir: hizli aramadaki sayiyla ayni olur
    var l = C.icerikFiltrele(S.veri, f).filter(ozelFiltre(p.ozel)).filter(function (i) {
      return f.musteri || f.arsiv || f.q || C.aktif(mHar[i.musteriId]);
    }).sort(C.icerikSirala);
    // Varsayilan gorunumde 14 gunden eski yayinlanmislar gizlenir (liste ve pano aylar sonra da kisa kalir). Durum ya da
    // tarih filtresi, arama, cekim, arsiv ya da "Göster" (eski=1) ile hepsi gorunur. Yayin tarihi olmayan kayit gizlenmez.
    var eskiSinir = C.gunEkle(bugun(), -ESKI_YAYIN_GUN), eskiSayi = 0;
    if (!p.durum && !p.bas && !p.bit && !p.q && !p.cekim && !f.arsiv && p.eski !== "1") l = l.filter(function (i) {
      var eski = i.durum === "yayinlandi" && C.gecerliTarih(i.yayinTarihi) && i.yayinTarihi < eskiSinir;
      if (eski) eskiSayi++;
      return !eski;
    });
    var eskiBag = function (metin, v) { return h("a", { href: rotaLink("icerikler", Object.assign({}, p, { eski: v })), onclick: function (ev) { ev.preventDefault(); degistir("eski", v); } }, metin); };
    var eskiNotu = eskiSayi ? h("p", { class: "soluk kucuk eski-notu" }, eskiSayi + " eski yayınlanmış içerik gizli (" + ESKI_YAYIN_GUN + " günden önce yayınlanan) · ", eskiBag("Göster", "1")) :
      p.eski === "1" ? h("p", { class: "soluk kucuk eski-notu" }, "Eski yayınlanmış içerikler de gösteriliyor · ", eskiBag("Gizle", "")) : null;
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
    var etkinFiltre = ["musteri", "durum", "oncelik", "tur", "bas", "bit", "arsiv", "cekim", "ozel", "eski"].filter(function (k) { return p[k]; }).length;
    filtreler = h("details", { class: "filtre-kap", open: window.innerWidth > 860 || etkinFiltre > 0 },
      h("summary", null, "Filtreler" + (etkinFiltre ? " (" + etkinFiltre + ")" : "")), filtreler);
    if (gorunum === "pano") {
      var durumlar = p.durum ? p.durum.split(",") : C.DURUMLAR.map(function (d) { return d.k; });
      return h("div", null, bas, filtreler, h("p", { class: "soluk kucuk" }, "Kartı başka sütuna sürükleyerek durumunu değiştir. Telefonda karta dokunup durumu seç."), eskiNotu, pano(l, durumlar, p));
    }
    // Secim degisince liste yeniden cizilmez: yalniz toplu cubuk, "Tümünü seç" ve gorunen kutular yerinde guncellenir
    // (uzun listede de aninda tepki verir, odak tiklanan kutuda kalir).
    var kutular = {}, seciliYazi = h("b");
    var topluDurum = secim(C.DURUMLAR, "", "Durum seç");
    // Durum secilmeden "Durumu değiştir" kapali: hata bildirimi cubugun ustune binmez
    var durumDugme = h("button", { class: "btn ince birincil", type: "button", disabled: true, onclick: function () {
      if (!topluDurum.value) { toast("Önce yeni durumu seç.", "hata"); return; }
      if (Object.keys(S.secili).length > 500) { toast("Bir seferde en çok 500 içerik değiştirilebilir.", "hata"); return; }
      durumlariDegistir(Object.keys(S.secili), topluDurum.value).then(function (ok) { if (ok) { S.secili = {}; yenile(); } });
    } }, "Durumu değiştir");
    topluDurum.addEventListener("change", function () { durumDugme.disabled = !topluDurum.value; });
    var topluCubuk = h("div", { class: "toplu-cubuk", hidden: true }, seciliYazi, topluDurum, durumDugme,
      // Arsiv gorunumunde ayni dugme toplu "Arşivden çıkar" olur; 10 ve daha fazla icerigi arsivlemeden once sorulur
      h("button", { class: "btn ince", type: "button", onclick: function () {
        var hedef = !f.arsiv;
        if (Object.keys(S.secili).length > 500) { toast("Bir seferde en çok 500 içerik " + (hedef ? "arşivlenebilir." : "arşivden çıkarılabilir."), "hata"); return; }
        var degisim = Object.keys(S.secili).map(icerikBul).filter(Boolean).filter(function (i) { return !!i.arsiv !== hedef; }).map(function (i) {
          var n = C.kopya(i); n.arsiv = hedef; n.gecmis = (n.gecmis || []).concat([{ z: C.damga(), m: hedef ? "Arşivlendi" : "Arşivden çıkarıldı" }]).slice(-60);
          return { tur: "icerik", yeni: n, onceki: C.kopya(i) };
        });
        if (!degisim.length) return;
        var soru = hedef && degisim.length >= 10 ? onayla(degisim.length + " içerik arşivlenecek",
          "Seçili " + degisim.length + " içerik listelerden kalkar. Silinmez: İçerikler → Arşiv filtresinden geri çıkarabilirsin.", "Arşivle") : Promise.resolve(true);
        soru.then(function (e) {
          if (!e) return;
          uygula(degisim, degisim.length + " içerik " + (hedef ? "arşivlendi" : "arşivden çıkarıldı")).then(function (ok) { if (ok) { S.secili = {}; yenile(); } });
        });
      } }, f.arsiv ? "Arşivden çıkar" : "Arşivle"),
      // dar ekranda yalniz "×" gorunur (cubuk iki satira sigar); erisilebilir adi hep "Seçimi temizle"
      h("button", { class: "btn ince secim-temizle", type: "button", "aria-label": "Seçimi temizle", onclick: function () { S.secili = {}; seciminiGoster(); } },
        h("span", { class: "uzun-ad" }, "Seçimi temizle"), h("span", { class: "kisa-ad", "aria-hidden": "true" }, "×")));
    var hepsi = h("input", { type: "checkbox", "aria-label": "Tümünü seç",
      onchange: function (e) { S.secili = {}; if (e.target.checked) l.forEach(function (i) { S.secili[i.id] = 1; }); seciminiGoster(); } });
    function seciminiGoster() {
      var n = Object.keys(S.secili).length;
      seciliYazi.textContent = n + " seçili";
      topluCubuk.hidden = !n;
      hepsi.checked = l.length > 0 && n === l.length;
      hepsi.indeterminate = n > 0 && n < l.length;
      Object.keys(kutular).forEach(function (id) { kutular[id].checked = !!S.secili[id]; });
    }
    // Uzun listede ilk LISTE_ADIM satir cizilir; "Daha fazla göster" ile artar (filtre degisince basa doner, geri donuste kalir)
    var anahtar = location.hash.replace(/[?&]gorunum=[^&]*/, "");
    if (!S.listeAdet || S.listeAdet.k !== anahtar) S.listeAdet = { k: anahtar, n: LISTE_ADIM };
    var gorunen = l.slice(0, S.listeAdet.n), kalan = l.length - gorunen.length;
    // Shift ile tiklanan kutu: son tiklanan satirla arasindaki gorunen satirlar ayni duruma gelir
    var sonIdx = null, shiftBasili = false;
    var satirlar = gorunen.map(function (i, idx) {
      var kutu = kutular[i.id] = h("input", { type: "checkbox", "aria-label": "Seç: " + i.baslik, checked: !!S.secili[i.id], onchange: function (e) {
        var secildi = e.target.checked;
        var bas_ = shiftBasili && sonIdx !== null ? Math.min(sonIdx, idx) : idx, son_ = shiftBasili && sonIdx !== null ? Math.max(sonIdx, idx) : idx;
        gorunen.slice(bas_, son_ + 1).forEach(function (x) { if (secildi) S.secili[x.id] = 1; else delete S.secili[x.id]; });
        sonIdx = idx;
        shiftBasili = false;
        seciminiGoster();
      } });
      // daha genis dokunma alani; satira dokunmak icerigi acar, kutunun cevresi yalniz secer
      return icerikSatiri(i, h("label", { class: "sec-kutu", onpointerdown: function (ev) { shiftBasili = ev.shiftKey; } }, kutu));
    });
    seciminiGoster();
    return h("div", null, bas, filtreler, topluCubuk, eskiNotu,
      l.length ? h("div", { class: "icerik-liste" }, h("label", { class: "secenek soluk kucuk" }, hepsi, "Tümünü seç" + (kalan ? " (" + l.length + ")" : "")),
        satirlar,
        kalan ? h("p", { class: "eylemler daha-satir" }, h("button", { class: "btn", type: "button", onclick: function () { S.listeAdet.n += LISTE_ADIM; yenile(); } },
          "Daha fazla göster (" + kalan + " içerik daha)")) : null) : h("p", { class: "temiz" }, "Bu filtreye uyan içerik yok."));
  };
  var LISTE_ADIM = 200, PANO_SINIRI = 60, ESKI_YAYIN_GUN = 14;

  function pano(l, durumlar, p) {
    var b = bugun();
    return h("div", { class: "pano" }, durumlar.map(function (d) {
      // Sutunda en cok PANO_SINIRI kart; sayi gercek toplam, kalanlar ayni filtreli listede
      var hepsiD = l.filter(function (i) { return i.durum === d; }), ogeler = hepsiD.slice(0, PANO_SINIRI);
      var kol = h("div", { class: "kolon", "data-durum": d,
        ondragover: function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; kol.classList.add("uzerinde"); },
        ondragleave: function () { kol.classList.remove("uzerinde"); },
        ondrop: function (ev) {
          ev.preventDefault();
          kol.classList.remove("uzerinde");
          var id = ev.dataTransfer.getData("text/plain");
          if (id && icerikBul(id)) durumlariDegistir([id], d);
        } },
      h("div", { class: "kolon-bas" }, durumRozet(d), h("span", { class: "sayi" }, hepsiD.length)),
      ogeler.map(function (i) {
        var m = musteri(i.musteriId);
        return h("div", { class: "kart", draggable: "true", tabindex: "0", "data-id": i.id,
          ondragstart: function (ev) { ev.dataTransfer.setData("text/plain", i.id); ev.dataTransfer.effectAllowed = "move"; ev.currentTarget.classList.add("tasiniyor"); },
          ondragend: function (ev) { ev.currentTarget.classList.remove("tasiniyor"); },
          onclick: function () { icerikPenceresi(i.id); },
          onkeydown: function (ev) { if (ev.key === "Enter" && ev.target === ev.currentTarget) icerikPenceresi(i.id); } },
          h("b", null, i.baslik), h("span", { class: "soluk kucuk" }, dizi([m ? m.ad : null, C.TUR_AD[i.tur], i.oncelik === "yuksek" ? "Öncelikli" : null])),
          i.teslimTarihi && C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1 ? h("span", { class: "kucuk" + (i.teslimTarihi < b ? " gecikti" : "") }, "Teslim " + C.tarihGunlu(i.teslimTarihi)) : null,
          i.planTarihi && i.durum !== "yayinlandi" ? h("span", { class: "kucuk" + (i.planTarihi < b ? " gecikti" : "") }, "Yayın " + C.tarihGunlu(i.planTarihi)) : null,
          onayBeklemesi(i, "kucuk"), revizyonNotuKisa(i, "kucuk"),
          (function () { var hz = hizliDurum(i); return hz.length ? h("span", { class: "hizli-dugmeler" }, hz) : null; })());
      }),
      hepsiD.length > ogeler.length ? ic(rotaLink("icerikler", Object.assign({}, p, { gorunum: "liste", durum: d })), "+" + (hepsiD.length - ogeler.length) + " tane daha · listede aç", { class: "kucuk-link kolon-daha" }) : null);
      return kol;
    }));
  }

  /**
   * Bagli cekim secenekleri: musterisiz ve bu musterinin cekimleri. Secili cekim baska musteriye aitse secim kaldirilir
   * (sunucu bu bagi reddeder) ve true doner; cagiran yaninda nedenini yazar.
   */
  var BAG_KALDIRILDI = "Seçili çekim başka müşteriye ait olduğu için bağ kaldırıldı.";
  function cekimSecenekleri(sel, musteriId, secili) {
    var es = secili ? etkinlik(secili) : null, dustu = !!(es && musteriId && es.musteriId && es.musteriId !== musteriId);
    if (dustu) secili = "";
    sel.textContent = "";
    var l = S.veri.etkinlikler.filter(function (e) {
      return (e.id === secili) || (!e.arsiv && e.tur !== "toplanti" && (!musteriId || !e.musteriId || e.musteriId === musteriId));
    }).sort(C.etkinlikSirala).reverse();
    sel.appendChild(h("option", { value: "" }, "Bağlı çekim yok"));
    l.forEach(function (e) { sel.appendChild(h("option", { value: e.id }, C.tarihKisa(e.basTarih, true) + " · " + e.baslik)); });
    sel.value = secili || "";
    return dustu;
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
    var yeniKimlik = ic_ ? null : yeniId();
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
    var cekimNotu = h("small", { class: "uyari" });
    cekimSecenekleri(g.cekim, v.musteriId, v.cekimId);
    g.musteri.addEventListener("change", function () { cekimNotu.textContent = cekimSecenekleri(g.cekim, g.musteri.value, g.cekim.value) ? BAG_KALDIRILDI : ""; });
    g.cekim.addEventListener("change", function () { cekimNotu.textContent = ""; });
    // Planlanan gun gecmisse tek tikla yayin tarihi olarak secilebilir (bos birakilirsa bugun yazilir)
    var planGunu = h("button", { class: "btn ince", type: "button", onclick: function () { g.yayin.value = g.plan.value; goster(); } });
    var yayinAlan = alan("Yayınlandığı tarih", g.yayin, h("small", null, "Boş bırakırsan bugün yazılır; planlanan günde paylaştıysan o günü seç. ", planGunu));
    var revAlan = alan("Revizyon notu", g.revizyon, null, "tam");
    function goster() {
      yayinAlan.hidden = g.durum.value !== "yayinlandi";
      var p = g.plan.value;
      planGunu.hidden = g.durum.value !== "yayinlandi" || !!g.yayin.value || !C.gecerliTarih(p) || p >= bugun();
      planGunu.textContent = C.gecerliTarih(p) ? "Planlanan gün: " + C.tarihKisa(p, true) : "";
    }
    g.durum.addEventListener("change", goster);
    ["input", "change"].forEach(function (o) { g.yayin.addEventListener(o, goster); g.plan.addEventListener(o, goster); });
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
    ref.d = pencere(ic_ ? "İçeriği düzenle" : "İçerik ekle", [
      h("div", { class: "izgara" },
        alan("Müşteri", g.musteri), alan("Başlık", g.baslik),
        alan("Tür", g.tur), alan("Durum", g.durum),
        alan("Öncelik", g.oncelik), alan("Bağlı çekim", g.cekim, cekimNotu),
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
      if (tarihHatasi(hataP, [[g.teslim, v.teslimTarihi], [g.plan, v.planTarihi]].concat(g.durum.value === "yayinlandi" ? [[g.yayin, v.yayinTarihi]] : []))) return;
      var zaman = C.damga(), b = bugun();
      var n = degisenleriUygula(v, ilk, formDegeri());
      if (n.durum === "yayinlandi" && !n.yayinTarihi) n.yayinTarihi = b;
      if (n.durum !== "yayinlandi") n.yayinTarihi = null;
      // Gecmis, pencerenin tabanina (acildigi ya da cakismada alinan guncel hal) gore yazilir
      var gec = (v.gecmis || []).slice();
      if (!ic_) gec.push({ z: zaman, m: "Eklendi (" + C.DURUM_AD[n.durum] + ")" });
      else {
        if (n.durum !== v.durum) gec.push({ z: zaman, m: C.DURUM_AD[v.durum] + " → " + C.DURUM_AD[n.durum] });
        if ((n.revizyonNotu || "") !== (v.revizyonNotu || "") && n.revizyonNotu) gec.push({ z: zaman, m: revizyonGecmisi(n.revizyonNotu) });
        if ((n.planTarihi || "") !== (v.planTarihi || "")) gec.push({ z: zaman, m: n.planTarihi ? "Yayın tarihi: " + C.tarihKisa(n.planTarihi, true) : "Yayın tarihi kaldırıldı" });
      }
      n.gecmis = gec.slice(-60);
      if (!ic_) n.id = yeniKimlik;
      var taban = C.kopya(v);
      return pencereKaydet("icerik", n, hataP, tabanYenile).then(function (k) {
        if (!k) return;
        ref.d.close();
        yenile();
        // takvimde tek "Geri al" bildirimi: onceki takvim geri alma bildirimi (eski surumle 409 olurdu) kalkar
        var bildir = tkRotada() ? tkToast : toast;
        if (!ic_) bildir("İçerik eklendi.");
        else bildir("Kaydedildi.", "", { ad: "Geri al", f: function () { geriAl([{ tur: "icerik", onceki: taban, sonraki: k }]); } });
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
    var topluCekimNotu = h("small", { class: "uyari" });
    g.musteri.addEventListener("change", function () { topluCekimNotu.textContent = cekimSecenekleri(g.cekim, g.musteri.value, g.cekim.value) ? BAG_KALDIRILDI : ""; });
    g.cekim.addEventListener("change", function () { topluCekimNotu.textContent = ""; });
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {}, kimlikler = {};
    ref.d = pencere("Toplu içerik ekle", [
      h("div", { class: "izgara" }, alan("Müşteri", g.musteri), alan("Bağlı çekim", g.cekim, [h("small", null, "Bir çekimden birden çok içerik çıkabilir."), topluCekimNotu]),
        alan("Tür", g.tur), alan("Durum", g.durum), alan("Öncelik", g.oncelik), alan("Kurgu teslim tarihi", g.teslim),
        alan("Başlıklar", g.basliklar, h("small", null, "Her satır ayrı bir içerik olur (en çok 300)."), "tam")),
      hataP
    ], [vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Ekle")], function () {
      var satirlar = g.basliklar.value.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!g.musteri.value) { hataP.textContent = "Müşteri seç."; return; }
      if (!satirlar.length) { hataP.textContent = "En az bir başlık yaz."; return; }
      if (satirlar.length > 300) { hataP.textContent = "Bir seferde en çok 300 içerik."; return; }
      if (satirlar.some(function (s) { return s.length > 200; })) { hataP.textContent = "Başlıklar en çok 200 karakter olmalı."; return; }
      if (tarihHatasi(hataP, [[g.teslim, null]])) return;
      var zaman = C.damga();
      var kayitlar = satirlar.map(function (s) {
        return { tur: "icerik", kayit: { musteriId: g.musteri.value, baslik: s, tur: g.tur.value, durum: g.durum.value, oncelik: g.oncelik.value,
          cekimId: g.cekim.value || null, teslimTarihi: g.teslim.value || null, planTarihi: null, yayinTarihi: g.durum.value === "yayinlandi" ? bugun() : null,
          revizyonNotu: "", dosyalar: { ham: "", proje: "", final: "" }, not: "", gecmis: [{ z: zaman, m: "Toplu eklendi (" + C.DURUM_AD[g.durum.value] + ")" }], arsiv: false } };
      });
      return topluKaydet(satirKimlikleri(kimlikler, kayitlar)).then(function (k) { if (k) { ref.d.close(); yenile(); toast(k.length + " içerik eklendi."); } });
    });
  }

  /* ================= Etkinlikler (cekim / toplanti) ================= */

  function etkinlikPenceresi(id, vars) {
    var e = id ? etkinlik(id) : null;
    var yeniKimlik = e ? null : yeniId();
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
      sureAl();
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
    // Baslangic gunu degisince sure (gun olarak) korunur: iki gunluk ya da gece yarisini asan cekim baska gune
    // tasininca kisalmaz / uzamaz. Yarim yazilmis (gecersiz ya da yili iki haneli) tarih sureyi bozmaz.
    var sureGun = 0;
    function sureAl() { var bs = g.basTarih.value, bt = g.bitTarih.value; if (C.makulTarih(bs) && C.makulTarih(bt) && bt >= bs) sureGun = C.gunFarki(bs, bt); }
    sureAl();
    g.bitTarih.addEventListener("change", sureAl);
    g.basTarih.addEventListener("change", function () {
      if (C.makulTarih(g.basTarih.value)) g.bitTarih.value = C.gunEkle(g.basTarih.value, sureGun);
      else if (!g.bitTarih.value || g.bitTarih.value < g.basTarih.value) g.bitTarih.value = g.basTarih.value;
      denetle();
    });
    denetle();
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {};
    ref.d = pencere(e ? "Çekimi / etkinliği düzenle" : "Çekim / etkinlik ekle", [
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
      if (!g.basTarih.value) { hataP.textContent = "Başlangıç tarihini gir."; g.basTarih.focus(); return; }
      if (tarihHatasi(hataP, [[g.basTarih, v.basTarih], [g.bitTarih, v.bitTarih]])) return;
      if (!C.gecerliTarih(a.basTarih)) { hataP.textContent = "Başlangıç tarihini gir."; return; }
      if (!a.tumGun && (!C.gecerliSaat(a.basSaat) || !C.gecerliSaat(a.bitSaat))) { hataP.textContent = "Başlangıç ve bitiş saatini gir ya da Tüm gün seç."; return; }
      if (!a.tumGun && a.bitTarih === a.basTarih && a.bitSaat < a.basSaat) {
        hataP.textContent = "Bitiş saati başlangıçtan önce. Çekim gece yarısını geçiyorsa bitiş tarihini ertesi gün (" + C.tarihKisa(C.gunEkle(a.basTarih, 1)) + ") yap.";
        return;
      }
      if (a.bitTarih < a.basTarih || C.aralik(a)[1] <= C.aralik(a)[0]) { hataP.textContent = "Bitiş başlangıçtan sonra olmalı."; return; }
      // Sunucu, baska musterinin icerigi bagli cekimin musterisini degistirmez; arsivdeki icerikler de sayilir
      var baskaBagli = e && a.musteriId ? S.veri.icerikler.filter(function (i) { return i.cekimId === e.id && i.musteriId !== a.musteriId; }) : [];
      if (baskaBagli.length) {
        hataP.textContent = "Bu çekime başka müşterinin " + baskaBagli.length + " içeriği bağlı: " +
          baskaBagli.slice(0, 5).map(function (i) { return "“" + i.baslik + "”" + (i.arsiv ? " (arşivde)" : ""); }).join(", ") + (baskaBagli.length > 5 ? " …" : "") +
          ". Müşteriyi değiştirmeden önce o içeriklerin “Bağlı çekim” alanını boşalt.";
        return;
      }
      var n = degisenleriUygula(v, ilk, formDegeri());
      if (!e) n.id = yeniKimlik;
      // tamamlanma ani yalniz durum simdi tamamlandi'ya geciyorsa yazilir: eski tamamlanmis kayit (tamamZaman yok)
      // baska bir alani duzenlenince bugun tamamlanmis sayilmaz
      if (n.durum === "tamamlandi" && v.durum !== "tamamlandi" && !n.tamamZaman) n.tamamZaman = C.damga();
      if (n.durum !== "tamamlandi") n.tamamZaman = null;
      var cak = C.cakisanlar(S.veri.etkinlikler, n).length, taban = C.kopya(v);
      var pk = pencereKaydet("etkinlik", n, hataP, tabanYenile);
      if (tkRotada()) tkKayitIzle(pk);
      return pk.then(function (k) {
        if (!k) return;
        ref.d.close();
        yenile();
        (tkRotada() ? tkToast : toast)((e ? "Kaydedildi." : "Çekim / etkinlik eklendi.") + (cak ? " Dikkat: " + cak + " etkinlikle çakışıyor." : ""), cak ? "hata" : "",
          e ? { ad: "Geri al", f: function () { geriAl([{ tur: "etkinlik", onceki: taban, sonraki: k }]); } } : null);
        if (k.durum === "tamamlandi" && taban.durum !== "tamamlandi") cekimBittiTeklifi(k);
      });
    }, true);
  }

  /* ================= Takvimler ================= */

  /* ================= Takvim: saatli izgara (cekim + edit) ================= */
  /*
   * Haftalik / gunluk / aylik saatli takvim. Kayit turleri: etkinlik (cekim, toplanti, diger) ve blok (edit zamani).
   * Her degisiklik mevcut kaydet akisiyla (kaydetHam, beklenen surum) sunucuya gider; ekran iyimser guncellenir,
   * sunucu reddederse eski haline doner. Surum cakismasinda (baska sekme / cihaz) veri yeniden yuklenir, hicbir sey
   * sessizce ezilmez. Geri al = onceki degerlerle yeni bir kaydetme. localStorage yalniz gorunum tercihidir.
   */
  var SVG_NS = "http://www.w3.org/2000/svg";
  // Simge tanimlari: [etiket, oznitelikler]. Kullanici verisi icermez; innerHTML kullanilmaz.
  var IKON = {
    kamera: [["path", { d: "M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" }], ["circle", { cx: 12, cy: 12.5, r: 3.5 }]],
    makas: [["circle", { cx: 6, cy: 6, r: 3 }], ["circle", { cx: 6, cy: 18, r: 3 }], ["path", { d: "M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" }]],
    kisiler: [["circle", { cx: 9, cy: 8, r: 3.5 }], ["path", { d: "M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" }]],
    saat: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 7v5l3 2" }]],
    teslim: [["path", { d: "M4 4v16M4 5h11l-2 4 2 4H4" }]],
    tatil: [["rect", { x: 3, y: 5, width: 18, height: 16, rx: 2 }], ["path", { d: "M3 10h18M8 3v4M16 3v4" }]],
    yildiz: [["path", { d: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" }]],
    pasta: [["path", { d: "M4 21h16v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2zM4 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5M12 11V7M12 4.5v.01" }]],
    sol: [["path", { d: "m15 18-6-6 6-6" }]], sag: [["path", { d: "m9 18 6-6-6-6" }]], asagi: [["path", { d: "m6 9 6 6 6-6" }]],
    ayar: [["circle", { cx: 12, cy: 12, r: 3 }], ["path", { d: "M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" }]],
    cekmece: [["path", { d: "M22 12h-6l-2 3h-4l-2-3H2" }], ["path", { d: "M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" }]],
    pusula: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "m15.5 8.5-2 5-5 2 2-5z" }]],
    kapat: [["path", { d: "M18 6 6 18M6 6l12 12" }]], arti: [["path", { d: "M12 5v14M5 12h14" }]]
  };
  function ikon(ad, sinif) {
    var s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "tk-ikon" + (sinif ? " " + sinif : ""));
    s.setAttribute("aria-hidden", "true");
    (IKON[ad] || []).forEach(function (p) {
      var e = document.createElementNS(SVG_NS, p[0]);
      Object.keys(p[1]).forEach(function (k) { e.setAttribute(k, String(p[1][k])); });
      s.appendChild(e);
    });
    return s;
  }
  function tikSvg() {
    var s = document.createElementNS(SVG_NS, "svg"), p = document.createElementNS(SVG_NS, "path");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    p.setAttribute("d", "M5 12.5 10 17 19 7");
    s.appendChild(p);
    return s;
  }
  // Satir ici stil yalniz CSSOM ile (CSP style-src 'self' satir ici style ozniteligine izin vermez)
  function stil(e, o) { Object.keys(o).forEach(function (k) { e.style[k] = o[k]; }); return e; }

  var TK = { kayit: "tamam", kayitNot: null, kuyruk: [], calisiyor: false, sonKayit: {}, oneriSira: 0, sonTik: null, kaydirma: null, kolonlar: [], suruk: null, odakId: null, gorunum: null, ref: null };
  var TK_SAAT_YUK = { masa: 52, tel: 56 };
  function tkMod() { return window.innerWidth < 700 ? "tel" : "masa"; }
  function tkKatman() {
    var o = { tatil: true, ozel: true, dogum: true };
    try { var t = JSON.parse(tercih("takvimKatman") || "{}"); Object.keys(o).forEach(function (k) { if (typeof t[k] === "boolean") o[k] = t[k]; }); } catch (e) { /* varsayilan */ }
    return o;
  }
  function tkFiltre() { var f = tercih("takvimFiltre"); return f === "cekim" || f === "edit" ? f : "birlikte"; }
  function tkSesAcik() { return tercih("takvimSes") === "1"; }
  function tkCalisma() { return C.calismaSaatleri(S.veri.ayar); }
  function tkSimdi() { return C.istanbulSimdi(); }
  function tkMesgul() { return !!(TK.suruk || TK.calisiyor || TK.kuyruk.length || document.querySelector(".tk-acilir")); }
  function tkGunAdi(g) { return C.GUN_UZUN[C.haftaGunu(g) - 1]; }
  function tkGunKisa(g) { return C.GUN_KISA[C.haftaGunu(g) - 1]; }
  function tkMusteriAd(k) { var m = musteri(k.musteriId); return m ? m.ad : "Müşterisiz"; }
  function blokIcerikleri(b) { return (b.icerikIdler || []).map(icerikBul).filter(Boolean); }
  function blokBaslik(b) {
    if (b.baslik) return b.baslik;
    var l = blokIcerikleri(b).filter(C.aktif);
    return l.length === 1 ? l[0].baslik : l.length ? C.turOzeti(l) + " · edit" : "Edit";
  }
  function tkOge(tur, k) {
    var tip = tur === "blok" ? "edit" : k.tur === "cekim" ? "cekim" : k.tur === "toplanti" ? "toplanti" : "diger";
    return { tur: tur, k: k, tip: tip, tamam: k.durum === "tamamlandi", iptal: k.durum === "iptal" };
  }
  function tkOgeAd(o) { return o.tur === "blok" ? blokBaslik(o.k) : o.k.baslik; }
  var TIP_IKON = { cekim: "kamera", edit: "makas", toplanti: "kisiler", diger: "saat" };
  var TIP_AD = { cekim: "Çekim", edit: "Edit bloğu", toplanti: "Toplantı", diger: "Etkinlik" };
  /** Gosterilecek kayitlar (filtre: cekim = etkinlikler, edit = bloklar, birlikte = hepsi; toplanti / diger "Çekim" altinda). */
  function tkOgeler(mf, filtre) {
    var l = [];
    if (filtre !== "edit") S.veri.etkinlikler.forEach(function (e) { if (!e.arsiv && (!mf || e.musteriId === mf)) l.push(tkOge("etkinlik", e)); });
    if (filtre !== "cekim") (S.veri.bloklar || []).forEach(function (b) { if (!b.arsiv && (!mf || b.musteriId === mf)) l.push(tkOge("blok", b)); });
    return l;
  }
  /** Kaydin mutlak dakikasi: referans gunden (gorunumun ilk gunu) itibaren. */
  function tkMutlak(tarih, saat) { return C.gunFarki(TK.ref, tarih) * 1440 + C.saatDk(saat); }
  function tkAralik(k) { return { bas: tkMutlak(k.basTarih, k.basSaat), bit: tkMutlak(k.bitTarih || k.basTarih, k.bitSaat) }; }
  /** Mutlak dakikadan kayit alanlari. */
  function tkZamandan(bas, bit) {
    var a = C.anNoktasi(TK.ref, bas), b = C.anNoktasi(TK.ref, bit);
    return { basTarih: a.tarih, basSaat: a.saat, bitTarih: b.tarih, bitSaat: b.saat };
  }
  function tkZamanMetni(k) {
    if (k.tumGun) return C.saatMetni(k);
    var bit = k.bitTarih || k.basTarih, f = C.gunFarki(k.basTarih, bit);
    return k.basSaat + "–" + k.bitSaat + (f === 1 ? " (" + tkGunKisa(bit) + ")" : f > 1 ? " (" + C.tarihKisa(bit) + ")" : "");
  }
  function tkCakisanlar(aday) {
    return C.zamanCakisanlari(S.veri, aday).map(function (x) { return x.k; });
  }
  function tkCakismaMetni(l) {
    return l.map(function (k) { return (musteri(k.musteriId) || {}).ad || (k.icerikIdler ? "Edit" : k.baslik); }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(", ");
  }

  /* ---------- Kaydetme kuyrugu, iyimser guncelleme, geri alma ---------- */

  function tkKaldir(tur, id) { var l = liste(tur); for (var i = 0; i < l.length; i++) if (l[i].id === id) { l.splice(i, 1); return; } }
  function tkGeriKoy(degisim) {
    degisim.slice().reverse().forEach(function (d) { if (d.onceki) yerlestir(d.tur, C.kopya(d.onceki)); else tkKaldir(d.tur, d.yeni.id); });
  }
  function tkKayitGoster() {
    document.querySelectorAll("[data-tk-kayit]").forEach(kayitDoldur);
  }
  function kayitDoldur(e) {
    var s = TK.kayit;
    e.className = "tk-kayit " + s;
    e.textContent = "";
    // telefonda yalniz isaret gorunur (yazi ekran okuyucuda kalir); hata yazisi her zaman gorunur
    ekle(e, [s === "tamam" ? h("span", { "aria-hidden": "true" }, "✓ ") : null, h("span", { class: "ad" }, s === "surer" ? "Kaydediliyor…" : s === "hata" ? "Kaydedilemedi" : "Kaydedildi")]);
    e.title = s === "hata" ? (TK.kayitNot || "Son değişiklik sunucuya yazılamadı; ekran sunucudaki hale döndü.") : "";
    return e;
  }
  /**
   * Takvimden baslayip tkKaydet disindan giden kaydetmeler (pencere, "Edit işini tamamla", takvim ayarlari) da kayit
   * gostergesini gunceller. pr: Promise (true ya da kayit = basarili). Ayni sonucu doner.
   */
  function tkKayitIzle(pr) {
    TK.kayit = "surer";
    TK.kayitNot = null;
    tkKayitGoster();
    return pr.then(function (ok) {
      TK.kayit = ok === true || (ok && typeof ok === "object") ? (TK.kuyruk.length || TK.calisiyor ? "surer" : "tamam") : "hata";
      if (TK.kayit === "hata") TK.kayitNot = "Son değişiklik sunucuya yazılamadı; açıklama bildirimde ya da pencerede.";
      tkKayitGoster();
      return ok;
    });
  }
  function tkRotada() { return !!(S.rota && (S.rota.ad === "cekim" || S.rota.ad === "takvim")); }
  /** Klavyeyle tasinan kart yeniden cizimden hemen sonra odagi geri alir (sonraki tus kaybolmasin). */
  function tkOdakla() {
    if (!TK.odakId) return;
    var el = document.querySelector(".tk-kart[data-id='" + TK.odakId + "']"), a = document.activeElement;
    if (el && el.hidden && el._fazla) el = el._fazla; // kart dar kolonda sigmadiysa odak "+N" dugmesinde
    if (el && (!a || a === document.body || a.closest(".tk"))) { el.focus(); TK.odakId = null; }
  }
  function toastTemizle() { var k = document.querySelector(".toastlar"); if (k) k.textContent = ""; }
  /** Takvim bildirimi: ayni anda tek bildirim (onceki geri al bildirimi kalkar). */
  function tkToast(metin, tur, eylem, kalici) { toastTemizle(); toast(metin, tur, eylem, kalici); }
  /** Ekran okuyucu duyurusu: bolge sayfa disinda kalici (takvim yeniden cizilince duyuru kaybolmaz). */
  function duyur(m) {
    var d = document.getElementById("tk-duyuru");
    if (!d) { d = h("div", { class: "tk-sr", id: "tk-duyuru", "aria-live": "polite" }); document.body.appendChild(d); }
    d.textContent = "";
    setTimeout(function () { d.textContent = m; }, 30);
  }
  /**
   * Takvim degisikligi: degisim [{tur, yeni, onceki (yeni kayitta null)}]. Ekran hemen guncellenir, istek sira ile gider.
   * opt: { geriAlinabilir, eylemler (ek bildirim dugmeleri), sonra(kayitlar), odak (id) }. Promise<boolean>.
   */
  function tkKaydet(degisim, metin, opt) {
    opt = opt || {};
    tkKapat();
    degisim.forEach(function (d) { yerlestir(d.tur, d.yeni); });
    TK.kayit = "surer";
    TK.kayitNot = null;
    if (opt.odak) TK.odakId = opt.odak;
    yenile();
    if (opt.odak) { tkOdakla(); TK.odakId = opt.odak; } // kayit donunce yeniden cizilir: odak orada da korunur
    return new Promise(function (coz) {
      TK.kuyruk.push({ degisim: degisim, metin: metin, opt: opt, coz: coz });
      tkKuyrukIsle();
    });
  }
  function tkKuyrukIsle() {
    if (TK.calisiyor || !TK.kuyruk.length) return;
    var is_ = TK.kuyruk.shift();
    TK.calisiyor = true;
    // Ayni kayda arka arkaya iki degisiklik: ikincisi birincinin sunucudan donen surumuyle gider (yalniz bizim zincirimiz)
    is_.degisim.forEach(function (d) {
      var sk = TK.sonKayit[d.tur + "|" + d.yeni.id];
      if (sk && d.yeni.surum === sk.once) d.yeni.surum = sk.sonra;
    });
    kaydetHam(is_.degisim.map(function (d) { return { tur: d.tur, kayit: d.yeni }; })).then(function (j) {
      TK.calisiyor = false;
      var bekleyen;
      if (j.ok) {
        j.kayitlar.forEach(function (k, i) {
          var d = is_.degisim[i];
          d.sonraki = k;
          TK.sonKayit[d.tur + "|" + k.id] = { once: d.yeni.surum, sonra: k.surum };
        });
        // kuyruktaki iyimser degisiklikler ekranda kalsin
        TK.kuyruk.forEach(function (q) { q.degisim.forEach(function (d) { yerlestir(d.tur, d.yeni); }); });
        TK.kayit = TK.kuyruk.length ? "surer" : "tamam";
        if (is_.opt.geriAlinabilir) {
          tkToast(is_.metin, "", [{ ad: "Geri al", f: function () { tkGeriAl(is_.degisim); } }].concat(is_.opt.eylemler || []));
        } else if (is_.metin) tkToast(is_.metin, "", is_.opt.eylemler || null);
        // bildirim bolgesi metni zaten okur; bildirimsiz kayitta kisa duyuru (ayni degisiklik iki kez okunmasin)
        if (!is_.metin) duyur("Kaydedildi");
        if (is_.opt.sonra) is_.opt.sonra(j.kayitlar);
        if (is_.opt.odak) TK.odakId = is_.opt.odak;
        is_.coz(true);
        yenile();
        tkOdakla();
        TK.sonTik = null;
      } else if (j.hata === "oturum") {
        bekleyen = TK.kuyruk.splice(0);
        bekleyen.forEach(function (q) { q.coz(false); });
        TK.kayit = "hata";
        is_.coz(false);
      } else if (j.hata === "cakisma") {
        // Baska sekme / cihaz bu kaydi degistirmis: ustune yazilmaz; guncel veri yuklenir ve soylenir
        bekleyen = TK.kuyruk.splice(0);
        bekleyen.forEach(function (q) { q.coz(false); });
        TK.kayit = "hata";
        is_.coz(false);
        veriYukle().then(function () {
          yenile();
          tkToast("Kaydedilmedi: bu kayıt bu arada başka bir yerde (başka sekme ya da cihaz) değişti. Güncel hali yüklendi; istersen değişikliği yeniden yap.", "hata");
        });
      } else if (j.hata === "ag" || j.status === 0 || j.hata === "yanit" || j.hata === "sunucu") {
        // Sonuc belirsiz: istek sunucuya ulasip yazilmis, yaniti kaybolmus olabilir. Geri alindi denmez; sunucudaki
        // guncel hal yuklenir (ekran sunucuya doner). "Tekrar dene" ayni kimlik / surumle gider: yazilmissa ikinci kez yazilmaz.
        bekleyen = TK.kuyruk.splice(0);
        bekleyen.forEach(function (q) { q.coz(false); });
        TK.kayit = "hata";
        TK.kayitNot = "Sonuç bilinmiyor; sunucudaki güncel hal yükleniyor.";
        TK.calisiyor = true; // yukleme bitene kadar yeni degisiklik gonderilmez (eski surumle gitmesin)
        is_.coz(false);
        var tekrar2 = is_.degisim.map(function (d) { return { tur: d.tur, yeni: C.kopya(d.yeni), onceki: d.onceki }; });
        var neden = j.hata === "ag" || j.status === 0 ? "Bağlantı koptu" : "Sunucu yanıtı alınamadı";
        veriYukle().then(function (yuklendi) {
          TK.calisiyor = false;
          // yukleme sirasinda kuyruga giren iyimser degisiklikler ekranda kalsin
          TK.kuyruk.forEach(function (q) { q.degisim.forEach(function (d) { yerlestir(d.tur, d.yeni); }); });
          if (!yuklendi) { bekleyen.slice().reverse().forEach(function (q) { tkGeriKoy(q.degisim); }); tkGeriKoy(is_.degisim); }
          TK.kayitNot = yuklendi ? "Değişikliğin kaydedilip kaydedilmediği bilinmiyor; ekran sunucudaki güncel hali gösteriyor." :
            "Sunucuya ulaşılamadı; değişikliğin kaydedilip kaydedilmediği bilinmiyor.";
          yenile();
          tkToast(neden + "; değişikliğin kaydedilip kaydedilmediği bilinmiyor." + (yuklendi ? " Güncel hal yüklendi." : " Bağlantı gelince yeniden dene."), "hata",
            { ad: "Tekrar dene", f: function () { tkKaydet(tekrar2, is_.metin, is_.opt); } });
          tkKayitGoster();
          tkKuyrukIsle();
        });
      } else {
        // Sunucu / ag hatasi: bu ve kuyruktaki degisiklikler geri alinir, ekran sunucudaki hale doner
        bekleyen = TK.kuyruk.splice(0);
        bekleyen.reverse().forEach(function (q) { tkGeriKoy(q.degisim); q.coz(false); });
        tkGeriKoy(is_.degisim);
        TK.kayit = "hata";
        is_.coz(false);
        yenile();
        var tekrar = is_.degisim.map(function (d) { return { tur: d.tur, yeni: C.kopya(d.yeni), onceki: d.onceki }; });
        tkToast((j.hata === "gecersiz" ? hataMetni(j) : "Kaydedilemedi: " + hataMetni(j)) + " Değişiklik geri alındı.", "hata",
          { ad: "Tekrar dene", f: function () { tkKaydet(tekrar, is_.metin, is_.opt); } });
      }
      tkKayitGoster();
      tkKuyrukIsle();
    });
  }
  /** Geri al: onceki degerlerle yeni kaydetme (degisiklikten hemen sonraki surumle; arada degistiyse 409). Yeni kayit arsivlenir. */
  function tkGeriAl(degisim) {
    var zaman = C.damga();
    // Kayit bu sekmede sonradan (ör. pencereden) degistiyse eski surumle gonderilmez: 409 "başka sekme ya da cihaz" demesin
    var sonradan = degisim.some(function (d) { var g = d.sonraki && kayitBul(d.tur, d.sonraki.id); return g && g.surum !== d.sonraki.surum; });
    if (sonradan) { tkToast("Bu kayıt sonradan değişti; geri alınamadı.", "hata"); return; }
    var ters = degisim.filter(function (d) { return d.sonraki; }).map(function (d) {
      var guncel = kayitBul(d.tur, d.sonraki.id) || d.sonraki, n;
      if (!d.onceki) { n = C.kopya(d.sonraki); n.arsiv = true; }
      else if (d.tur === "icerik") n = C.geriAl(d.sonraki, d.onceki, zaman);
      else { n = C.kopya(d.onceki); n.surum = d.sonraki.surum; }
      return { tur: d.tur, yeni: n, onceki: C.kopya(guncel) };
    });
    if (ters.length) tkKaydet(ters, "Geri alındı.", { geriAlinabilir: false });
  }

  /* ---------- Tamamlama, ses, hedef ---------- */

  function sesCal() {
    if (!tkSesAcik()) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext, ac = new AC(), t = ac.currentTime;
      [[660, 0], [880, 0.09]].forEach(function (x) {
        var o = ac.createOscillator(), v = ac.createGain();
        o.type = "sine";
        o.frequency.value = x[0];
        v.gain.setValueAtTime(0, t + x[1]);
        v.gain.linearRampToValueAtTime(0.06, t + x[1] + 0.02);
        v.gain.exponentialRampToValueAtTime(0.0001, t + x[1] + 0.25);
        o.connect(v);
        v.connect(ac.destination);
        o.start(t + x[1]);
        o.stop(t + x[1] + 0.3);
      });
      setTimeout(function () { try { ac.close(); } catch (e) { /* yok */ } }, 800);
    } catch (e) { /* ses calinamazsa sessiz */ }
  }
  function haftaTamam() { return C.haftaTamamlanan(S.veri, bugun()).toplam; }
  function haftalikHedef() { var x = S.veri.ayar && S.veri.ayar.haftalikHedef; return typeof x === "number" && x > 0 ? x : 0; }
  /** Haftalik hedef bu degisiklikle dolduysa tek, sakin bir bildirim. */
  function hedefKontrol(onceki) {
    var hd = haftalikHedef(), su = haftaTamam();
    if (!hd || onceki >= hd || su < hd) return;
    setTimeout(function () {
      toast("Haftalık hedefin tamam: bu hafta " + su + " iş bitirdin.", "kutlama");
      document.querySelectorAll(".tk-hedef").forEach(function (e) { e.classList.remove("kutla"); void e.offsetWidth; e.classList.add("kutla"); });
    }, 700);
  }
  /** Cekim tamamlaninca bildirimdeki ek secenekler (yalniz tur cekim; tiklanmadikca hicbir sey degismez). */
  function cekimTeklifi(e) {
    if (!e || e.tur !== "cekim") return { metin: "", eylemler: [] };
    var eHar = {};
    eHar[e.id] = e;
    var bekleyen = S.veri.icerikler.filter(function (i) { return !i.arsiv && C.cekimiBitti(i, eHar); });
    var eylemler = [];
    if (bekleyen.length) eylemler.push({ ad: "Bağlı " + bekleyen.length + " içeriği “Çekildi” yap", f: function () {
      durumlariDegistir(bekleyen.map(function (i) { return i.id; }).filter(icerikBul), "cekildi");
    } });
    eylemler.push({ ad: "İçerik ekle", f: function () { topluIcerikPenceresi({ musteriId: e.musteriId, cekimId: e.id }); } });
    return { metin: bekleyen.length ? " Bağlı " + bekleyen.length + " içerik henüz “Çekildi” yapılmadı." : "", eylemler: eylemler };
  }
  function tkTamamla(o) {
    var k = kayitBul(o.tur, o.k.id) || o.k, yeni = k.durum !== "tamamlandi", once = haftaTamam();
    var n = C.kopya(k);
    n.durum = yeni ? "tamamlandi" : "planlandi";
    n.tamamZaman = yeni ? C.damga() : null;
    var metin, teklif = { metin: "", eylemler: [] };
    if (!yeni) metin = "Tamamlanmadı olarak işaretlendi: " + tkOgeAd(o);
    else if (o.tur === "blok") metin = "Blok tamamlandı: " + tkMusteriAd(k) + ". İçeriklerin durumu değişmedi.";
    else if (o.tip === "cekim") {
      var bv = C.bekleyenVideo(S.veri, k.id);
      teklif = cekimTeklifi(n); // tamamlanmis haliyle: bagli ve hala cekilmemis gorunen icerikler sayilir
      metin = "Çekim tamamlandı: " + k.baslik + (bv.bekleyen ? " · " + bv.bekleyen + " video edit bekliyor." : ".") + teklif.metin;
    } else metin = "Tamamlandı: " + k.baslik;
    return tkKaydet([{ tur: o.tur, yeni: n, onceki: C.kopya(k) }], metin, { geriAlinabilir: true, eylemler: teklif.eylemler, odak: k.id,
      // tik animasyonu kayit sunucuya yazilinca cizilen kartta oynar (hareket azaltilmissa CSS kapatir)
      sonra: function () { if (yeni) { TK.sonTik = k.id; sesCal(); hedefKontrol(once); } } });
  }
  /** Blogun icerikleri: hazir / yayinlandi olmayan aktif olanlar "Yayına hazır" yapilir (mevcut durum akisi, geri alinabilir). */
  function editIsiniTamamla(b) {
    var ids = blokIcerikleri(b).filter(function (i) { return C.aktif(i) && i.durum !== "hazir" && i.durum !== "yayinlandi"; }).map(function (i) { return i.id; });
    if (!ids.length) { tkToast("Bu bloğun içerikleri zaten yayına hazır."); return Promise.resolve(false); }
    var once = haftaTamam();
    tkKapat();
    toastTemizle();
    return tkKayitIzle(durumlariDegistir(ids, "hazir")).then(function (ok) {
      if (ok) { sesCal(); hedefKontrol(once); }
      return ok;
    });
  }

  /* ---------- Acilir pencere (masaustunde yanda, telefonda alttan) ---------- */

  function tkKapat() { document.querySelectorAll(".tk-acilir, .tk-perde").forEach(function (x) { x.remove(); }); }
  function tkAcilir(icerik, olay, baslik) {
    var donus = document.activeElement;
    if (donus && donus.closest && donus.closest(".tk-acilir")) donus = TK.donus; // pencere icinden acilan pencere: ilk donus noktasi kalir
    tkKapat();
    TK.donus = donus && donus !== document.body ? donus : null;
    var tel = tkMod() === "tel";
    var p = h("div", { class: "tk-acilir" + (tel ? " tk-alt" : ""), role: "dialog", "aria-label": baslik || "Ayrıntı", "aria-modal": tel ? "true" : null, tabindex: tel ? "-1" : null },
      h("button", { class: "btn ince yalin tk-kapat", type: "button", "aria-label": "Kapat", onclick: tkKapat }, ikon("kapat")), icerik);
    if (tel) document.body.appendChild(h("div", { class: "tk-perde", onclick: tkKapat }));
    document.body.appendChild(p);
    // telefonda klavye acilmasin diye girdiye degil pencerenin kendisine odaklanilir (ekran okuyucu basligi okur)
    if (tel) p.focus();
    if (!tel) {
      var hedef = olay && olay.currentTarget && olay.currentTarget.getBoundingClientRect ? olay.currentTarget : olay && olay.target && olay.target.getBoundingClientRect ? olay.target : null;
      var r = hedef ? hedef.getBoundingClientRect() : { left: window.innerWidth / 2 - 165, right: window.innerWidth / 2 - 165, top: 120, bottom: 120 };
      var pr = p.getBoundingClientRect();
      var x = r.right + 8;
      if (x + pr.width > window.innerWidth - 8) x = Math.max(8, r.left - pr.width - 8);
      var y = Math.min(Math.max(8, r.top), window.innerHeight - pr.height - 8);
      stil(p, { left: x + "px", top: Math.max(8, y) + "px" });
      // icerik buyuyunce (ör. "Taşı" formu acilinca) ekranin altina tasmasin
      if (window.ResizeObserver) new ResizeObserver(function (girdiler, gozcu) {
        if (!p.isConnected) { gozcu.disconnect(); return; }
        var b = p.getBoundingClientRect();
        if (b.bottom > window.innerHeight - 8) p.style.top = Math.max(8, window.innerHeight - b.height - 8) + "px";
      }).observe(p);
      // gorunur ilk girdi ya da dugme (gizli "Taşı" formundaki girdiler atlanir)
      var ilk = Array.prototype.filter.call(p.querySelectorAll("input:not([type=checkbox]), select, .eylem button, button:not(.tk-kapat)"), function (x) { return x.offsetParent !== null; })[0];
      if (ilk) ilk.focus();
    }
    return p;
  }
  document.addEventListener("keydown", function (ev) {
    var alt = document.querySelector(".tk-acilir.tk-alt");
    if (ev.key === "Tab" && alt && !document.querySelector("dialog[open]")) {
      // alt sayfa modal: Tab arkadaki takvime gecmez, pencere icinde doner
      var od = Array.prototype.filter.call(alt.querySelectorAll("button, input, select, textarea, a[href], [tabindex='0']"), function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!od.length) return;
      var a = document.activeElement, i = od.indexOf(a);
      if (!alt.contains(a) || (ev.shiftKey && i <= 0) || (!ev.shiftKey && i === od.length - 1)) { ev.preventDefault(); od[ev.shiftKey ? od.length - 1 : 0].focus(); }
      return;
    }
    if (ev.key === "Escape" && document.querySelector(".tk-acilir") && !document.querySelector("dialog[open]")) {
      ev.preventDefault();
      tkKapat();
      if (TK.donus && TK.donus.isConnected) TK.donus.focus(); // klavyeyle acilan pencere kapaninca odak karta doner
    }
  });
  document.addEventListener("pointerdown", function (ev) {
    var a = document.querySelector(".tk-acilir");
    if (a && !a.contains(ev.target) && !(ev.target.closest && ev.target.closest(".toast, dialog, .tk-perde"))) tkKapat();
  }, true);

  /* ---------- Sayfa ---------- */

  function tkParam(r, ek) { return Object.assign({}, r.p, ek); }
  function tkGit(ek) { var r = S.rota; git(r && r.ad === "takvim" ? "takvim" : "cekim", tkParam(r || { p: {} }, ek), null, true); }
  function takvimSayfasi(r) {
    var p = r.p, b = bugun(), mod = tkMod();
    var g = p.g || tercih("takvim") || (mod === "tel" ? "gun" : "hafta");
    if (["gun", "hafta", "ay"].indexOf(g) === -1) g = "hafta";
    var t = C.gecerliTarih(p.t) ? p.t : b, kayan = g === "hafta" && p.kayan === "1", mf = p.musteri && musteri(p.musteri) ? p.musteri : "";
    var gunler = g === "gun" ? [t] : g === "hafta" ? C.gunListesi(kayan ? t : C.haftaBasi(t), 7) : [].concat.apply([], C.ayIzgarasi(t));
    var filtre = tkFiltre();
    TK.ref = gunler[0];
    TK.kumeler = [];
    TK.gorunum = { g: g, t: t, kayan: kayan, mf: mf, gunler: gunler, mod: mod, filtre: filtre };
    var ogeler = tkOgeler(mf, filtre);
    var kap = h("div", { class: "tk tk-" + mod });
    if (mod === "tel") ekle(kap, [telUst(), tatilNotu(gunler)]);
    else ekle(kap, [masaUst(), tatilNotu(gunler)]);
    var govde = g === "ay" ? tkAyCiz(gunler, ogeler) : tkIzgara(gunler, ogeler, mod);
    if (mod === "tel") {
      kap.appendChild(govde);
      if (g === "gun") gunKaydirma(govde);
      kap.appendChild(telAlt());
    } else {
      var cekAcik = tercih("takvimCekmece") !== "0";
      kap.appendChild(h("div", { class: "tk-icerik" }, govde, cekAcik ? tkCekmece(mf, filtre) : null));
    }
    // ic kaydirma konumu korunur; ilk acilista calisma saatinin basina / simdiye yakin
    requestAnimationFrame(function () {
      if (!kap.isConnected) return; // bu arada yeniden cizildi: odak ve kaydirma yeni cizimde
      tkKayitGoster();
      var k = kap.querySelector(".tk-kaydirma");
      if (k) {
        if (TK.kaydirma !== null) k.scrollTop = TK.kaydirma;
        else if (TK.gece) {
          var cs = tkCalisma(), sd = C.saatDk(tkSimdi().saat), pp = TK_SAAT_YUK[mod] / 60;
          k.scrollTop = Math.max(0, (Math.max(cs.bas - 30, Math.min(sd - 120, cs.bit - 240))) * pp);
        }
        k.addEventListener("scroll", function () { TK.kaydirma = k.scrollTop; });
      }
      if (TK.odakId) {
        var el = kap.querySelector(".tk-kart[data-id='" + TK.odakId + "']");
        if (el && el.hidden && el._fazla) el = el._fazla;
        if (el && (document.activeElement === document.body || !document.activeElement || document.activeElement.closest(".tk"))) el.focus();
        TK.odakId = null;
      }
    });
    return kap;
  }
  function donemMetni() {
    var v = TK.gorunum, gl = v.gunler;
    if (v.g === "gun") return tkGunAdi(v.t) + ", " + C.tarihKisa(v.t, true);
    if (v.g === "ay") return C.ayAdi(v.t);
    var a = gl[0], z = gl[6];
    return a.slice(0, 7) === z.slice(0, 7) ? +a.slice(8) + "–" + +z.slice(8) + " " + C.AYLAR[+a.slice(5, 7) - 1] + " " + a.slice(0, 4) : C.tarihKisa(a) + " – " + C.tarihKisa(z, true);
  }
  function tkKaydir(yon) {
    var v = TK.gorunum;
    tkGit({ t: v.g === "gun" ? C.gunEkle(v.t, yon) : v.g === "hafta" ? C.gunEkle(v.t, 7 * yon) : C.ayEkle(v.t, yon) });
  }
  function filtreSecim() {
    var f = TK.gorunum.filtre;
    return h("div", { class: "tk-secim", role: "group", "aria-label": "Gösterilen işler" },
      [["cekim", "Çekim"], ["edit", "Edit"], ["birlikte", "Birlikte"]].map(function (x) {
        return h("button", { type: "button", "aria-pressed": String(f === x[0]), onclick: function () { tercih("takvimFiltre", x[0]); yenile(); } },
          x[0] !== "birlikte" ? ikon(x[0] === "cekim" ? "kamera" : "makas", x[0]) : null, x[1]); // tur renk + simge + yazi ile
      }));
  }
  function gorunumSecim() {
    var g = TK.gorunum.g;
    return h("div", { class: "tk-secim", role: "group", "aria-label": "Görünüm" }, [["gun", "Gün"], ["hafta", "Hafta"], ["ay", "Ay"]].map(function (x) {
      return h("button", { type: "button", "aria-pressed": String(g === x[0]), onclick: function () { tercih("takvim", x[0]); tkGit({ g: x[0], kayan: "" }); } }, x[1]);
    }));
  }
  function ilerlemeMetni() {
    var b = bugun(), bt = C.bugunTamamlanan(S.veri, b).toplam, ht = haftaTamam(), hd = haftalikHedef();
    return h("span", { class: "tk-ilerleme" },
      bt ? h("span", null, "Bugün ", h("b", null, String(bt)), " iş tamamladın") : h("span", null, "Bugün henüz tamamlanan yok"),
      hd ? h("span", { class: "tk-hedef", title: "Haftalık hedef (Ayarlar → takvim ayarları)" }, "· Hafta " + Math.min(ht, hd) + "/" + hd,
        h("span", { class: "tk-cubuk" }, stil(h("i"), { width: Math.min(100, ht / hd * 100) + "%" }))) : null);
  }
  // Kayit durumu canli bolge degil: basari ve hata bildirimi (toast) zaten okunur; gosterge ayni seyi ikinci kez okutmaz
  function kayitRozeti() { return kayitDoldur(h("span", { class: "tk-kayit", "data-tk-kayit": "", "aria-live": "off" })); }
  function musteriFiltresi() {
    var mf = TK.gorunum.mf;
    return h("select", { "aria-label": "Müşteri", value: mf, onchange: function (ev) { tkGit({ musteri: ev.target.value }); } },
      h("option", { value: "" }, "Tüm müşteriler"), aktifMusteriler().map(function (m) { return h("option", { value: m.id }, m.ad); }));
  }
  /** Yeni is icin varsayilan gun: gun gorunumunde o gun; hafta / ayda bugun donemdeyse bugun, yoksa donemin (ayin) ilk gunu. */
  function varsayilanGun() {
    var v = TK.gorunum, b = bugun();
    if (v.g === "gun") return v.t;
    if (v.g === "ay") return b.slice(0, 7) === v.t.slice(0, 7) ? b : C.ayBasi(v.t);
    return b >= v.gunler[0] && b <= v.gunler[6] ? b : v.gunler[0];
  }
  function yeniIsDugmesi(olay) {
    var gun = varsayilanGun(), cs = tkCalisma(), sd = C.saatDk(tkSimdi().saat);
    var bas = gun === bugun() ? Math.max(cs.bas, Math.ceil(sd / 30) * 30) : cs.bas;
    if (bas > 1380) bas = 1380;
    hizliOlustur(gun, bas, bas + 60, olay);
  }
  function masaUst() {
    var n = C.planlanacaklar(S.veri, tkSimdi()).length, cekAcik = tercih("takvimCekmece") !== "0";
    return [
      h("div", { class: "tk-arac" },
        h("h1", null, "Takvim"),
        h("button", { class: "btn", type: "button", onclick: function () { TK.kaydirma = null; tkGit({ t: "" }); } }, "Bugün"),
        h("button", { class: "btn yalin", type: "button", "aria-label": "Önceki", onclick: function () { tkKaydir(-1); } }, ikon("sol")),
        h("button", { class: "btn yalin", type: "button", "aria-label": "Sonraki", onclick: function () { tkKaydir(1); } }, ikon("sag")),
        h("button", { class: "tk-donem", type: "button", "aria-label": "Tarih seç: " + donemMetni(), onclick: function (ev) { miniTakvim(ev); } }, donemMetni(), ikon("asagi")),
        h("span", { class: "tk-bosluk" }), ilerlemeMetni(), kayitRozeti()),
      h("div", { class: "tk-arac ikinci" }, filtreSecim(), gorunumSecim(), musteriFiltresi(),
        h("span", { class: "tk-bosluk" }),
        h("button", { class: "btn", type: "button", onclick: yeniIsDugmesi }, ikon("arti"), "Yeni"),
        h("button", { class: "btn", type: "button", onclick: function (ev) { simdiNePenceresi(ev); } }, ikon("pusula"), "Şimdi ne yapayım?"),
        h("button", { class: "btn", type: "button", "aria-pressed": String(cekAcik), onclick: function () { tercih("takvimCekmece", cekAcik ? "0" : "1"); yenile(); } },
          ikon("cekmece"), "Planlanacaklar" + (n ? " · " + n : "")),
        h("button", { class: "btn yalin", type: "button", "aria-label": "Takvim ayarları", onclick: function (ev) { ayarPenceresi(ev); } }, ikon("ayar")))
    ];
  }
  function telUst() {
    var v = TK.gorunum, b = bugun(), hb = C.haftaBasi(v.g === "hafta" ? v.gunler[0] : v.t);
    // dar telefonda gun basligi kisa yazilir ("Pzt 31 Ağustos"); uzun hali ekran okuyucuda kalir
    var baslik = v.g === "gun" ? [h("span", { class: "uzun" }, tkGunAdi(v.t) + ", " + C.tarihKisa(v.t)), h("span", { class: "kisa", "aria-hidden": "true" }, tkGunKisa(v.t) + " " + C.tarihKisa(v.t))] : donemMetni();
    var serit = h("div", { class: "tk-hafta-serit" }, C.gunListesi(hb, 7).map(function (gn) {
      var l = tkOgeler(v.mf, v.filtre).filter(function (o) { return !o.iptal && C.takvimParcalari(o.k, gn, gn).length; });
      return h("button", { type: "button", class: (gn === v.t && v.g === "gun" ? "secili " : "") + (gn === b ? "bugun" : ""), "aria-pressed": String(gn === v.t && v.g === "gun"),
        "aria-label": tkGunAdi(gn) + " " + C.tarihKisa(gn) + ", " + l.length + " iş", onclick: function () { tkGit({ g: "gun", t: gn, kayan: "" }); } },
        tkGunKisa(gn), h("b", null, String(+gn.slice(8))),
        h("span", { class: "isaret" }, l.some(function (o) { return o.tip === "cekim"; }) ? h("i", { class: "cekim" }) : null, l.some(function (o) { return o.tip === "edit"; }) ? h("i", { class: "edit" }) : null));
    }));
    return h("div", { class: "tk-tel-ust" },
      h("div", { class: "s1" }, h("h1", null, baslik),
        v.t !== b ? h("button", { class: "btn ince", type: "button", onclick: function () { tkGit({ t: "" }); } }, "Bugün") : null, kayitRozeti(),
        h("button", { class: "btn ince yalin", type: "button", "aria-label": "Tarih seç", onclick: function (ev) { miniTakvim(ev); } }, ikon("tatil")),
        h("button", { class: "btn ince yalin", type: "button", "aria-label": "Takvim ayarları", onclick: function (ev) { ayarPenceresi(ev); } }, ikon("ayar"))),
      h("div", { class: "s1" },
        h("button", { class: "btn ince yalin", type: "button", "aria-label": "Önceki hafta", onclick: function () { tkGit({ t: C.gunEkle(v.t, -7) }); } }, ikon("sol")),
        serit,
        h("button", { class: "btn ince yalin", type: "button", "aria-label": "Sonraki hafta", onclick: function () { tkGit({ t: C.gunEkle(v.t, 7) }); } }, ikon("sag"))),
      h("div", { class: "s1" }, filtreSecim(), gorunumSecim()),
      h("div", { class: "s1" }, ilerlemeMetni(), v.mf ? h("span", { class: "kucuk soluk" }, "· " + (musteri(v.mf) || {}).ad + " ", h("button", { class: "btn ince", type: "button", onclick: function () { tkGit({ musteri: "" }); } }, "Tüm müşteriler")) : null));
  }
  function telAlt() {
    var n = C.planlanacaklar(S.veri, tkSimdi()).length;
    return h("div", { class: "tk-tel-alt" },
      h("button", { class: "btn", type: "button", onclick: function (ev) { telCekmece(ev); } }, ikon("cekmece"), "Planlanacaklar" + (n ? " · " + n : "")),
      h("button", { class: "btn", type: "button", "aria-label": "Şimdi ne yapayım?", onclick: function (ev) { simdiNePenceresi(ev); } }, ikon("pusula"), "Şimdi?"),
      h("button", { class: "tk-fab", type: "button", "aria-label": "Yeni iş", onclick: yeniIsDugmesi }, "+"));
  }
  /** Telefonda gun gorunumunde yana kaydirarak gun degistirme. */
  function gunKaydirma(govde) {
    var kay = govde.querySelector(".tk-kaydirma");
    if (!kay) return;
    var x0 = null, y0 = null;
    kay.addEventListener("pointerdown", function (e) { x0 = e.clientX; y0 = e.clientY; });
    kay.addEventListener("pointercancel", function () { x0 = null; }); // dikey kaydirmaya donen dokunma
    kay.addEventListener("pointerup", function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) tkGit({ t: C.gunEkle(TK.gorunum.t, dx < 0 ? 1 : -1) });
    });
  }
  function tatilNotu(gunler) {
    if (!tkKatman().tatil) return null;
    var yillar = gunler.map(function (g) { return +g.slice(0, 4); }).filter(function (y, i, a) { return a.indexOf(y) === i; });
    var eksik = yillar.filter(function (y) { return !C.resmiTatiller(y).diniBilinen; });
    return eksik.length ? h("p", { class: "tk-not" }, eksik.join(", ") + ": " + C.resmiTatiller(eksik[0]).not + ". Sabit resmî tatiller gösteriliyor.") : null;
  }

  /* ---------- Tum gun seridi: resmi tatil, ozel gun, dogum gunu, teslim bayraklari, tum gun etkinlikler ---------- */

  function gununOzelleri(g) {
    var kt = tkKatman(), l = [];
    if (kt.tatil) C.gununTatilleri(g).forEach(function (t) { l.push({ tur: "tatil", ad: t.ad + (t.yarim ? " (13.00'ten sonra)" : "") }); });
    C.gununOzelGunleri(S.veri.ozelgunler || [], g).forEach(function (o) { if (kt[o.tur === "dogum" ? "dogum" : "ozel"]) l.push({ tur: o.tur === "dogum" ? "dogum" : "ozel", ad: o.baslik, k: o }); });
    return l;
  }
  /** Gunun teslimleri musteri basina gruplu (ince bayrak; calisma zamani degil). */
  function gununTeslimleri(g) {
    var v = TK.gorunum;
    if (v.filtre === "cekim") return [];
    var mHar = C.idHaritasi(S.veri.musteriler), gr = {}, sira = [];
    S.veri.icerikler.forEach(function (i) {
      if (i.arsiv || i.teslimTarihi !== g || !C.aktif(mHar[i.musteriId]) || (v.mf && i.musteriId !== v.mf)) return;
      if (!gr[i.musteriId]) { gr[i.musteriId] = { musteri: mHar[i.musteriId], icerikler: [] }; sira.push(i.musteriId); }
      gr[i.musteriId].icerikler.push(i);
    });
    return sira.map(function (k) { return gr[k]; });
  }
  function ozelSerit(x) {
    var tAd = x.tur === "tatil" ? "Resmî tatil" : x.tur === "dogum" ? "Doğum günü" : "Özel gün";
    return h("button", { class: "tk-serit " + x.tur, type: "button", title: x.ad + " · " + tAd,
      onclick: function (ev) { ev.stopPropagation(); tkAcilir([h("h3", null, ikon(x.tur === "tatil" ? "tatil" : x.tur === "dogum" ? "pasta" : "yildiz"), x.ad), h("div", { class: "soluk kucuk" }, tAd + (x.k && x.k.herYil ? " · her yıl" : "")),
        x.k ? h("div", { class: "eylem" }, h("button", { class: "btn ince", type: "button", onclick: function () { tkKapat(); ozelGunPenceresi(x.k.id); } }, "Düzenle")) : null], ev, x.ad); } },
      ikon(x.tur === "tatil" ? "tatil" : x.tur === "dogum" ? "pasta" : "yildiz"), h("span", null, x.ad));
  }
  function teslimSerit(g, t) {
    var b = bugun(), f = C.gunFarki(b, g);
    var bekleyen = t.icerikler.filter(function (i) { return C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1; });
    var sinif = !bekleyen.length ? " bitti" : f < 0 ? " gecikti" : f <= 2 ? " yakin" : "";
    var ad = t.icerikler.length === 1 ? t.icerikler[0].baslik : C.turOzeti(t.icerikler);
    // durum renkten bagimsiz da okunur: "Gecikti · …", bitti "✓ Teslim · …" (ustu cizili)
    var onEk = !bekleyen.length ? "✓ Teslim · " : f < 0 ? "Gecikti · " : "Teslim · ";
    return h("button", { class: "tk-serit teslim" + sinif, type: "button", title: "Teslim: " + t.musteri.ad + " — " + ad + (!bekleyen.length ? " (teslim edildi / hazır)" : f < 0 ? " (gecikti)" : ""),
      onclick: function (ev) { ev.stopPropagation(); teslimPenceresi(g, t, ev); } }, ikon("teslim"), h("span", null, onEk + t.musteri.ad + " " + ad));
  }
  function teslimPenceresi(g, t, olay) {
    var bek = t.icerikler.filter(function (i) { return C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1 && i.durum !== "fikir"; });
    tkAcilir([h("h3", null, ikon("teslim"), "Teslim: " + t.musteri.ad),
      h("div", { class: "soluk kucuk" }, tkGunAdi(g) + ", " + C.tarihKisa(g, true) + " · son tarih (çalışma zamanı değil)"),
      h("ul", null, t.icerikler.map(function (i) {
        return h("li", null, durumRozet(i.durum), h("button", { class: "satir-ad", type: "button", onclick: function () { tkKapat(); icerikPenceresi(i.id); } }, i.baslik));
      })),
      bek.length ? h("div", { class: "eylem" }, h("button", { class: "btn ince", type: "button", onclick: function () {
        var z = C.bosAralik(S.veri, { sure: C.tahminiSure({ adet: bek.length }), simdi: tkSimdi(), ayar: S.veri.ayar });
        if (!z) { tkToast("7 gün içinde çalışma saatlerinde boş yer yok.", "hata"); return; }
        blokEkle(t.musteri.id, bek.map(function (i) { return i.id; }), z);
      } }, "Edit zamanı ayır")) : null], olay, "Teslim");
  }
  function tumGunSerit(g, ogeler) {
    var l = [];
    gununOzelleri(g).forEach(function (x) { l.push(ozelSerit(x)); });
    gununTeslimleri(g).forEach(function (t) { l.push(teslimSerit(g, t)); });
    ogeler.filter(function (o) { return o.k.tumGun && C.takvimParcalari(o.k, g, g).length; }).forEach(function (o) {
      l.push(h("button", { class: "tk-serit etk " + o.tip + (o.tamam ? " tamam" : "") + (o.iptal ? " iptal" : ""), type: "button", "data-id": o.k.id,
        title: tkOgeAd(o) + " · " + tkMusteriAd(o.k) + " · " + C.saatMetni(o.k), onclick: function (ev) { ev.stopPropagation(); ayrintiPenceresi(o, ev); } },
        ikon(TIP_IKON[o.tip]), h("span", null, tkMusteriAd(o.k) + " · " + tkOgeAd(o))));
    });
    return l;
  }

  /* ---------- Saatli izgara ---------- */

  function gorunurAralik() {
    var cs = tkCalisma();
    return TK.gece ? [0, 1440] : [Math.max(0, Math.floor((cs.bas - 60) / 60) * 60), Math.min(1440, Math.ceil((cs.bit + 60) / 60) * 60)];
  }
  function tkIzgara(gunler, ogeler, mod) {
    TK.gece = tercih("takvimGece") === "1";
    var cs = tkCalisma(), va = gorunurAralik(), vBas = va[0], vBit = va[1], pp = TK_SAAT_YUK[mod] / 60, yuk = (vBit - vBas) * pp;
    var saatGen = mod === "tel" ? 46 : 56, sablon = saatGen + "px repeat(" + gunler.length + ",minmax(0,1fr))";
    var b = bugun(), simdi = tkSimdi(), simdiDk = C.saatDk(simdi.saat);
    var cak = C.takvimCakismalari(S.veri), ilk = gunler[0], son = gunler[gunler.length - 1];
    var kap = h("div", { class: "tk-izgara-kap" });
    if (gunler.length > 1 || mod === "masa") kap.appendChild(stil(h("div", { class: "tk-bas-satir" }, h("div"), gunler.map(function (g) {
      return h("button", { class: "tk-gun-bas" + (g === b ? " bugun" : ""), type: "button", "aria-label": tkGunAdi(g) + " " + C.tarihKisa(g) + (g === b ? ", bugün" : "") + ": gün görünümü",
        onclick: function () { tkGit({ g: "gun", t: g, kayan: "" }); } }, tkGunKisa(g), h("b", null, String(+g.slice(8))));
    })), { gridTemplateColumns: sablon }));
    kap.appendChild(stil(h("div", { class: "tk-tumgun" }, h("div"), gunler.map(function (g) { return h("div", { class: "hucre", "data-gun": g }, tumGunSerit(g, ogeler)); })), { gridTemplateColumns: sablon }));
    var kay = h("div", { class: "tk-kaydirma" });
    if (!TK.gece) kay.appendChild(h("button", { class: "tk-gece-dugme", type: "button", onclick: function () { geceAc(cs.bas - 60); } }, "Gece saatlerini göster (00.00–" + C.dkSaat(vBas) + " ve " + C.dkSaat(vBit) + "–24.00)"));
    var iz = stil(h("div", { class: "tk-izgara" }), { gridTemplateColumns: sablon, height: yuk + "px" });
    var saatler = h("div", { class: "tk-saatler" });
    for (var m = vBas + 60; m <= vBit; m += 60) saatler.appendChild(stil(h("span", null, m === 1440 ? "24:00" : C.dkSaat(m)), { top: (m - vBas) * pp + "px" }));
    iz.appendChild(saatler);
    TK.kolonlar = [];
    TK.kumeler = [];
    // parcalar gun basina
    var gunParca = {};
    ogeler.forEach(function (o) {
      if (o.k.tumGun) return;
      C.takvimParcalari(o.k, ilk, son).forEach(function (p) { (gunParca[p.gun] = gunParca[p.gun] || []).push({ o: o, p: p }); });
    });
    gunler.forEach(function (g, gi) {
      var kol = h("div", { class: "tk-kolon" + (g === b ? " bugun" : ""), "data-gun": g, role: "group", "aria-label": tkGunAdi(g) + " " + C.tarihKisa(g) + (g === b ? ", bugün" : "") });
      for (var dm = vBas; dm < vBit; dm += 30) kol.appendChild(stil(h("div", { class: "tk-dilim" + (dm % 60 ? " yarim" : "") }), { top: (dm - vBas) * pp + "px" }));
      if (cs.bas > vBas) kol.appendChild(stil(h("div", { class: "tk-disari" }), { top: "0", height: (cs.bas - vBas) * pp + "px" }));
      if (cs.bit < vBit) kol.appendChild(stil(h("div", { class: "tk-disari" }), { top: (cs.bit - vBas) * pp + "px", height: (vBit - cs.bit) * pp + "px" }));
      var pl = gunParca[g] || [];
      var gizliUst = pl.filter(function (x) { return x.p.bit <= vBas; }), gizliAlt = pl.filter(function (x) { return x.p.bas >= vBit; });
      var gor = pl.filter(function (x) { return x.p.bit > vBas && x.p.bas < vBit; }).sort(function (a, c) { return a.p.bas - c.p.bas || c.p.bit - a.p.bit; });
      // ust uste binen kartlar yan yana (hicbiri kaydirilmaz)
      var kume = [], kumeBit = -1, kumeler = [];
      var kapat = function () {
        var s = kume.reduce(function (mx, x) { return Math.max(mx, x.serit + 1); }, 0);
        kume.forEach(function (x) { x.toplam = s; });
        if (kume.length) kumeler.push(kume);
        kume = [];
      };
      gor.forEach(function (x) {
        if (x.p.bas >= kumeBit) { kapat(); kumeBit = -1; }
        var dolu = kume.filter(function (y) { return y.p.bit > x.p.bas; }).map(function (y) { return y.serit; }), s = 0;
        while (dolu.indexOf(s) !== -1) s++;
        x.serit = s;
        kume.push(x);
        kumeBit = Math.max(kumeBit, x.p.bit);
      });
      kapat();
      gor.forEach(function (x) { x.el = tkKart(x, vBas, vBit, pp, cak); kol.appendChild(x.el); });
      // seritler sayfa yerlesince kolon genisligine gore sigdirilir (tkSeritSigdir)
      kumeler.forEach(function (km) {
        TK.kumeler.push({ kol: kol, toplam: km[0].toplam, uyeler: km.map(function (x) {
          var ust = Math.max(x.p.bas, vBas);
          return { el: x.el, o: x.o, serit: x.serit || 0, ust: (ust - vBas) * pp, alt: (ust - vBas) * pp + Math.max(20, (Math.min(x.p.bit, vBit) - ust) * pp - 2) };
        }) });
      });
      if (gizliUst.length) kol.appendChild(stil(h("button", { class: "tk-gece-ipucu", type: "button", onclick: function () { geceAc(gizliUst[0].p.bas); } }, "↑ " + gizliUst.length + " iş gece"), { top: "2px" }));
      if (gizliAlt.length) kol.appendChild(stil(h("button", { class: "tk-gece-ipucu", type: "button", onclick: function () { geceAc(gizliAlt[0].p.bas - 60); } }, "↓ " + gizliAlt.length + " iş · " + C.dkSaat(gizliAlt[0].p.bas)), { bottom: "2px" }));
      if (g === simdi.tarih && simdiDk >= vBas && simdiDk <= vBit) kol.appendChild(stil(h("div", { class: "tk-simdi", title: "Şimdi " + simdi.saat + " (Türkiye)", "data-vbas": String(vBas), "data-pp": String(pp) }), { top: (simdiDk - vBas) * pp + "px" }));
      kol.addEventListener("pointerdown", function (e) { aralikSecBasla(e, kol, g); });
      iz.appendChild(kol);
      TK.kolonlar.push({ gun: g, no: gi, el: kol, vBas: vBas, vBit: vBit, pp: pp });
    });
    kay.appendChild(iz);
    if (TK.gece) kay.appendChild(h("button", { class: "tk-gece-dugme", type: "button", onclick: function () { tercih("takvimGece", "0"); TK.kaydirma = 0; yenile(); } }, "Gece saatlerini gizle"));
    kap.appendChild(kay);
    return kap;
  }
  function geceAc(dk) {
    tercih("takvimGece", "1");
    TK.kaydirma = Math.max(0, dk) * TK_SAAT_YUK[tkMod()] / 60;
    yenile();
  }
  // Simdi cizgisi dakikada bir yerini gunceller (sayfa yeniden cizilmez)
  setInterval(function () {
    var s = document.querySelector(".tk-simdi");
    if (!s) return;
    var su = tkSimdi(), kol = s.parentNode;
    if (!kol || kol.getAttribute("data-gun") !== su.tarih) { s.remove(); return; }
    s.style.top = (C.saatDk(su.saat) - +s.getAttribute("data-vbas")) * +s.getAttribute("data-pp") + "px";
    s.title = "Şimdi " + su.saat + " (Türkiye)";
  }, 60000);

  /*
   * Cakisan isler yan yana seritlere bolunur. Kolon dar oldugunda serit en az TK_SERIT_EN px kalir (musteri adi okunur);
   * sigmayan seritlerdeki isler gizlenir ve kumenin sagindaki "+N" dugmesi onlari listeler (hicbir is kaydirilmaz).
   * Kolon genisligi sayfa yerlesince olculur: ciz() sonrasi ve pencere boyutu degisince cagrilir.
   */
  var TK_SERIT_EN = 60, TK_FAZLA_GEN = 22, TK_FAZLA_GEN_TEL = 46;
  function tkSeritSigdir() {
    if (TK.suruk) return; // surukleme sirasinda kart gizlenmez (bir sonraki cizimde sigdirilir)
    var genler = {};
    (TK.kumeler || []).forEach(function (km) {
      if (!km.kol.isConnected) return;
      var W = genler[km.kol.getAttribute("data-gun")] = genler[km.kol.getAttribute("data-gun")] || km.kol.clientWidth, n = km.toplam, V = n, pay = 0;
      if (!W) return; // olculemedi (gizli sayfa): kartlar esit seritlerde kalir
      if (km.fazla) { km.fazla.remove(); km.fazla = null; }
      // telefonda "+N" dugmesi 44 px genis (dokunma hedefi)
      var fg = tkMod() === "tel" ? TK_FAZLA_GEN_TEL : TK_FAZLA_GEN;
      if (n > 1 && n * TK_SERIT_EN > W) { V = Math.max(1, Math.floor((W - fg) / TK_SERIT_EN)); pay = fg; }
      // tek serit bile "+N" ile sigmiyorsa (telefonda hafta) ince serit cizilmez: hepsi gizlenir, tek dugme kolon genisliginde hepsini listeler
      var hepsi = n > 1 && W - fg - 6 < TK_SERIT_EN;
      if (hepsi) { V = 0; pay = 0; }
      var gizli = [];
      km.uyeler.forEach(function (u) {
        u.el.hidden = u.serit >= V;
        u.el._fazla = null;
        if (u.el.hidden) { gizli.push(u); return; }
        stil(u.el, { left: "calc((100% - " + pay + "px) * " + u.serit / V + " + 3px)", width: "calc((100% - " + pay + "px) / " + V + " - 6px)" });
        u.el.classList.toggle("dar", (W - pay) / V - 6 < 84);
      });
      if (!gizli.length) return;
      var ust = Math.min.apply(null, gizli.map(function (u) { return u.ust; })), alt = Math.max.apply(null, gizli.map(function (u) { return u.alt; }));
      var adlar = gizli.map(function (u) { return tkMusteriAd(u.o.k) + " (" + u.o.k.basSaat + ")"; }).join(", ");
      var b = h("button", { class: "tk-fazla" + (hepsi ? " hepsi" : ""), type: "button", "aria-label": gizli.length + (hepsi ? " iş" : " iş daha") + " bu saatlerde: " + adlar,
        title: gizli.length + (hepsi ? " iş: " : " iş daha: ") + adlar,
        onclick: function (ev) { ev.stopPropagation(); fazlaPenceresi(gizli.map(function (u) { return u.o; }), ev); } },
        hepsi ? [String(gizli.length), h("span", { class: "tk-sr" }, " iş")] : ["+" + gizli.length, h("span", { class: "tk-sr" }, " iş daha")]);
      stil(b, { top: ust + "px", height: Math.max(tkMod() === "tel" ? 44 : 20, alt - ust) + "px" });
      km.kol.appendChild(b);
      km.fazla = b;
      gizli.forEach(function (u) { u.el._fazla = b; });
    });
  }
  var tkSigdirBekliyor = false;
  window.addEventListener("resize", function () {
    if (tkSigdirBekliyor) return;
    tkSigdirBekliyor = true;
    requestAnimationFrame(function () { tkSigdirBekliyor = false; tkSeritSigdir(); });
  });
  /** "+N" dugmesi: sigmayan isleri listeler; birine basinca ayrintisi acilir. */
  function fazlaPenceresi(ogeler, olay) {
    tkAcilir([h("h3", null, "Aynı saatlerde"), h("div", { class: "kucuk soluk" }, "Sütun dar olduğu için bu işler kart olarak sığmadı; hiçbiri kaydırılmadı."),
      h("ul", null, ogeler.map(function (o) {
        var k = kayitBul(o.tur, o.k.id) || o.k;
        return h("li", null, h("button", { class: "satir-ad", type: "button", onclick: function (ev) { ayrintiPenceresi(o, ev); } },
          ikon(TIP_IKON[o.tip]), TIP_AD[o.tip] + ": " + tkMusteriAd(k) + " · " + tkOgeAd(o) + " · " + tkZamanMetni(k)));
      }))], olay, "Aynı saatlerde");
  }

  function kartBilgisi(o, cakVar) {
    if (cakVar) return h("div", { class: "bilgi cak" }, "⚠ Çakışma");
    if (o.tip === "cekim") {
      var bv = C.bekleyenVideo(S.veri, o.k.id);
      if (o.tamam) return bv.bekleyen ? h("div", { class: "bilgi" }, bv.bekleyen + " video edit bekliyor") : bv.bagli ? h("div", { class: "bilgi" }, bv.bagli + " video, edit bitti") : null;
      return bv.bagli ? h("div", { class: "bilgi" }, bv.bagli + " video bağlı") : null;
    }
    if (o.tur === "blok") {
      var t = blokIcerikleri(o.k).filter(C.aktif).reduce(function (m, i) { return C.gecerliTarih(i.teslimTarihi) && (!m || i.teslimTarihi < m) ? i.teslimTarihi : m; }, null);
      return t ? h("div", { class: "bilgi" }, "Teslim " + (t === bugun() ? "bugün" : tkGunKisa(t) + " " + C.tarihKisa(t))) : null;
    }
    return o.k.konum ? h("div", { class: "bilgi" }, o.k.konum) : null;
  }
  function parcaSaati(o, p) {
    var k = o.k;
    if (p.ilk && p.son) return k.basSaat + "–" + k.bitSaat;
    if (p.ilk) return k.basSaat + "–" + k.bitSaat + (C.gunFarki(k.basTarih, k.bitTarih) === 1 ? " (ertesi gün)" : " (" + C.tarihKisa(k.bitTarih) + ")");
    if (p.son) return "…–" + C.dkSaat(p.bit);
    return "devam ediyor";
  }
  function tkKart(x, vBas, vBit, pp, cak) {
    var o = x.o, p = x.p, k = o.k;
    var ust = Math.max(p.bas, vBas), alt = Math.min(p.bit, vBit), yuk = Math.max(20, (alt - ust) * pp - 2);
    var gen = 100 / (x.toplam || 1), cakVar = !o.tamam && !o.iptal && !!cak[k.id];
    var tasinir = !o.tamam && !o.iptal;
    var kisa = yuk < 38;
    var tik = o.iptal ? null : h("button", { class: "tk-tik" + (o.tamam ? " dolu" + (TK.sonTik === k.id ? " cizil" : "") : ""), type: "button",
      "aria-label": o.tamam ? "Tamamlandı; geri almak için bas" : (o.tur === "blok" ? "Bloğu tamamla" : o.tip === "cekim" ? "Çekimi tamamla" : "Tamamla"),
      title: o.tamam ? "Tamamlandı" : o.tur === "blok" ? "Bu bloğu tamamla (içerik durumu değişmez)" : o.tip === "cekim" ? "Çekimi tamamla (videoların editi ayrı izlenir)" : "Tamamla",
      onpointerdown: function (e) { e.stopPropagation(); }, onclick: function (e) { e.stopPropagation(); tkTamamla(o); } }, tikSvg());
    // cakisma renkten bagimsiz: buyuk kartta "⚠ Çakışma" satiri, bilgi satiri olmayan kartta ⚠ isareti
    var cakIsaret = cakVar && (kisa || yuk <= 66) ? h("span", { class: "cak-isaret", "aria-hidden": "true" }, "⚠") : null;
    // role group: kartin icindeki tamamla dugmesi ekran okuyucuda ayri bir denetim olarak kalir (role=button icindeki
    // dugme sunumsal sayilir). alcak: telefonda 44 px'lik dokunma alani sigmaz, tamamlama ayrinti penceresinden yapilir.
    var el = h("div", { class: "tk-kart " + o.tip + (o.tamam ? " tamam" : "") + (o.iptal ? " iptal" : "") + (kisa ? " kucuk-kart" : "") + (yuk < 44 ? " alcak" : ""), tabindex: "0", role: "group", "data-id": k.id,
      title: TIP_AD[o.tip] + ": " + tkMusteriAd(k) + " · " + tkOgeAd(o) + " · " + tkZamanMetni(k) + (o.tamam ? " · tamamlandı" : o.iptal ? " · iptal" : "") + (cakVar ? " · çakışma var" : ""),
      "aria-label": TIP_AD[o.tip] + ": " + tkMusteriAd(k) + ", " + tkOgeAd(o) + ", " + tkGunAdi(k.basTarih) + " " + tkZamanMetni(k) + (o.tamam ? ", tamamlandı" : o.iptal ? ", iptal" : "") +
        (cakVar ? ", çakışma var" : "") + (tasinir ? ". Ok tuşlarıyla taşı, Shift ile süreyi değiştir, Enter ile ayrıntı." : ". Enter ile ayrıntı.") },
      h("div", { class: "ust-s" }, ikon(TIP_IKON[o.tip]), h("span", { class: "mus" }, tkMusteriAd(k)), cakIsaret, tik),
      h("div", { class: "is" }, tkOgeAd(o)),
      !kisa ? h("div", { class: "zaman" }, parcaSaati(o, p)) : null,
      !kisa && yuk > 66 ? kartBilgisi(o, cakVar) : null,
      tasinir && p.son ? h("div", { class: "tut", "aria-hidden": "true" }) : null);
    stil(el, { top: (ust - vBas) * pp + "px", height: yuk + "px", left: "calc(" + gen * (x.serit || 0) + "% + 3px)", width: "calc(" + gen + "% - 6px)" });
    if (tasinir) el.addEventListener("pointerdown", function (e) { surukBasla(e, o, el); });
    el.addEventListener("keydown", function (e) { kartTus(e, o); });
    el.addEventListener("click", function (e) { if (!el._suruklendi) ayrintiPenceresi(o, e); el._suruklendi = false; });
    return el;
  }

  /* ---------- Surukle-birak: tasima, alt kenardan sure, cakisma hayaleti ---------- */

  function kolonBul(x) {
    for (var i = 0; i < TK.kolonlar.length; i++) { var r = TK.kolonlar[i].el.getBoundingClientRect(); if (x >= r.left && x < r.right) return TK.kolonlar[i]; }
    return null;
  }
  function kolonDk(k, y) { var r = k.el.getBoundingClientRect(); return k.vBas + (y - r.top) / k.pp; }
  function mutlakNokta(k, y) { return k.no * 1440 + kolonDk(k, y); }
  function yuvarla(m) { return Math.round(m / 15) * 15; }
  function hayaletTemizle() { document.querySelectorAll(".tk-hayalet").forEach(function (x) { x.remove(); }); }
  function hayaletCiz(bas, bit, tip, baslik, cak) {
    hayaletTemizle();
    var no = Math.floor(bas / 1440), k = TK.kolonlar[no];
    if (!k) return;
    var gb = bas - no * 1440, ust = Math.max(gb, k.vBas), alt = Math.min(bit - no * 1440, k.vBit, 1440);
    var e = h("div", { class: "tk-hayalet " + tip + (cak.length ? " cakisma" : "") },
      C.dkSaat(gb) + "–" + C.dkSaat(bit) + (Math.floor((bit - 1) / 1440) > no ? " (ertesi gün)" : "") + " · " + baslik,
      cak.length ? h("small", null, "Çakışıyor: " + tkCakismaMetni(cak) + " · diğer işler kaydırılmaz") : null);
    stil(e, { top: (ust - k.vBas) * k.pp + "px", height: Math.max(18, (alt - ust) * k.pp - 2) + "px" });
    k.el.appendChild(e);
  }
  function aday(k, bas, bit) { var z = tkZamandan(bas, bit); return Object.assign({ id: k.id }, z); }
  function surukBasla(e, o, el) {
    if (e.button !== 0 || tkMod() === "tel" || e.target.closest(".tk-tik")) return;
    var k = kolonBul(e.clientX);
    if (!k) return;
    var boyut = e.target.classList.contains("tut"), ar = tkAralik(o.k);
    e.preventDefault();
    TK.suruk = { tur: boyut ? "boyut" : "tasi", o: o, el: el, x0: e.clientX, y0: e.clientY, basladi: false, tut: mutlakNokta(k, e.clientY) - ar.bas, ar: ar, hedef: null };
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* yok */ }
    el.addEventListener("pointermove", surukHareket);
    el.addEventListener("pointerup", surukBitir, { once: true });
    el.addEventListener("pointercancel", surukTemizle, { once: true });
  }
  function surukHareket(e) {
    var s = TK.suruk;
    if (!s) return;
    if (!s.basladi) {
      if (Math.abs(e.clientX - s.x0) + Math.abs(e.clientY - s.y0) < 5) return;
      s.basladi = true;
      s.el.classList.add("surukleniyor");
    }
    var sure = s.ar.bit - s.ar.bas, son = TK.kolonlar.length * 1440, k, bas, bit;
    if (s.tur === "tasi") {
      k = kolonBul(e.clientX) || TK.kolonlar[Math.max(0, Math.min(TK.kolonlar.length - 1, Math.floor(s.ar.bas / 1440)))];
      if (!k) return;
      bas = Math.max(0, Math.min(son - 15, yuvarla(mutlakNokta(k, e.clientY) - s.tut)));
      bit = bas + sure;
    } else {
      k = TK.kolonlar[Math.floor(s.ar.bas / 1440)] || TK.kolonlar[0];
      var kn = kolonBul(e.clientX) || k;
      bas = s.ar.bas;
      bit = Math.max(bas + 15, Math.min(bas + 24 * 60, yuvarla(mutlakNokta(kn, e.clientY))));
    }
    s.hedef = { bas: bas, bit: bit };
    hayaletCiz(bas, bit, s.o.tip, tkMusteriAd(s.o.k), tkCakisanlar(aday(s.o.k, bas, bit)));
  }
  function surukBitir() {
    var s = TK.suruk;
    surukTemizle();
    if (!s || !s.basladi || !s.hedef) return;
    s.el._suruklendi = true;
    if (s.hedef.bas === s.ar.bas && s.hedef.bit === s.ar.bit) return;
    zamanDegistir(s.o, s.hedef.bas, s.hedef.bit, s.tur === "tasi" ? "Taşındı" : "Süre değişti");
  }
  function surukTemizle() {
    var s = TK.suruk;
    if (s) { s.el.classList.remove("surukleniyor"); s.el.removeEventListener("pointermove", surukHareket); }
    hayaletTemizle();
    document.querySelectorAll(".tk-yuzen").forEach(function (x) { x.remove(); });
    TK.suruk = null;
  }
  /** Kaydin zamanini degistirir (mutlak dakika, gorunum referansina gore). Diger isler kaydirilmaz. */
  function zamanDegistir(o, bas, bit, onEk) {
    var k = kayitBul(o.tur, o.k.id) || o.k, z = tkZamandan(bas, bit), n = C.kopya(k);
    Object.assign(n, z);
    var cak = tkCakisanlar(Object.assign({ id: k.id }, z));
    var metin = onEk + ": " + tkMusteriAd(k) + ", " + tkGunKisa(z.basTarih) + " " + C.tarihKisa(z.basTarih) + " " + z.basSaat + "–" + z.bitSaat +
      (z.bitTarih !== z.basTarih ? " (" + tkGunKisa(z.bitTarih) + ")" : "") + (cak.length ? " · çakışma: " + tkCakismaMetni(cak) + " (kaydırılmadı)" : "");
    return tkKaydet([{ tur: o.tur, yeni: n, onceki: C.kopya(k) }], metin, { geriAlinabilir: true, odak: k.id });
  }
  /** Klavye: oklar 15 dk / 1 gun tasir, Shift + yukari / asagi sureyi degistirir, Enter ayrinti. */
  function kartTus(e, o) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ayrintiPenceresi(o, e); return; }
    if (o.tamam || o.iptal || ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.key) === -1) return;
    e.preventDefault();
    var ar = tkAralik(o.k), bas = ar.bas, bit = ar.bit;
    if (e.shiftKey && e.key === "ArrowUp") bit = Math.max(bas + 15, bit - 15);
    else if (e.shiftKey && e.key === "ArrowDown") bit += 15;
    else if (e.key === "ArrowUp") { bas -= 15; bit -= 15; }
    else if (e.key === "ArrowDown") { bas += 15; bit += 15; }
    else if (e.key === "ArrowLeft") { bas -= 1440; bit -= 1440; }
    else { bas += 1440; bit += 1440; }
    if (bas === ar.bas && bit === ar.bit) return;
    var z = tkZamandan(bas, bit), cak = tkCakisanlar(Object.assign({ id: o.k.id }, z));
    zamanDegistir(o, bas, bit, e.shiftKey ? "Süre değişti" : "Taşındı");
    duyur(tkGunAdi(z.basTarih) + " " + z.basSaat + " ile " + z.bitSaat + " arası" + (cak.length ? ", çakışma var: " + tkCakismaMetni(cak) : ""));
  }
  /** Bos araligi secip hizli olusturma (masaustunde surukleyerek, telefonda dokunarak bir saat). */
  function aralikSecBasla(e, kol, gun) {
    if (e.button !== 0 || (e.target !== kol && !e.target.classList.contains("tk-dilim") && !e.target.classList.contains("tk-disari"))) return;
    var k = TK.kolonlar.filter(function (x) { return x.gun === gun; })[0];
    if (!k) return;
    if (tkMod() === "tel") {
      // telefonda dokunup birakinca (kaydirma degilse) bir saatlik aralik
      // Dokunma kaydirmaya donerse tarayici pointercancel gonderir, pointerup gelmez: dinleyiciler o zaman da kaldirilir
      // (yoksa kalan eski dinleyici sonraki bir birakmada yanlislikla "Yeni iş" acar).
      var y0 = e.clientY, x0 = e.clientX, t0 = Date.now();
      var temizle = function () { kol.removeEventListener("pointerup", birak); kol.removeEventListener("pointercancel", temizle); };
      var birak = function (ev) {
        temizle();
        if (ev.pointerId !== e.pointerId || Math.abs(ev.clientY - y0) + Math.abs(ev.clientX - x0) > 10 || Date.now() - t0 > 800) return;
        var b0 = Math.floor(kolonDk(k, ev.clientY) / 30) * 30;
        // Alt sayfa pointerup'ta acilirsa tarayicinin ardindan gonderdigi click ayni noktada yeni pencereye duser
        // (perdeye: pencere kapanir; tur dugmesine: Çekim olur; girdiye: klavye acilir). Pencere o click'te acilir;
        // click hic gelmezse (tarayici gondermedi) kisa bir sure sonra yine acilir.
        var acildi = false;
        var ac = function (olay) {
          if (acildi) return;
          acildi = true;
          kol.removeEventListener("click", ac);
          if (kol.isConnected) hizliOlustur(gun, b0, Math.min(1440, b0 + 60), olay);
        };
        kol.addEventListener("click", ac);
        setTimeout(function () { ac(ev); }, 600);
      };
      kol.addEventListener("pointerup", birak);
      kol.addEventListener("pointercancel", temizle);
      return;
    }
    e.preventDefault();
    var b0 = Math.floor(kolonDk(k, e.clientY) / 15) * 15, sec = { bas: b0, bit: Math.min(1440, b0 + 60) };
    var kutu = h("div", { class: "tk-secili-aralik" });
    kol.appendChild(kutu);
    var goster = function () { stil(kutu, { top: (sec.bas - k.vBas) * k.pp + "px", height: (sec.bit - sec.bas) * k.pp + "px" }); kutu.textContent = C.dkSaat(sec.bas) + "–" + C.dkSaat(sec.bit); };
    goster();
    var hareket = function (ev) {
      var m = Math.max(0, Math.min(1440, yuvarla(kolonDk(k, ev.clientY))));
      sec = m > b0 ? { bas: b0, bit: Math.max(b0 + 15, m) } : { bas: m, bit: b0 + 15 };
      goster();
    };
    try { kol.setPointerCapture(e.pointerId); } catch (x) { /* yok */ }
    var bitir = function (ev) {
      kol.removeEventListener("pointermove", hareket);
      kol.removeEventListener("pointerup", bitir);
      kol.removeEventListener("pointercancel", bitir);
      if (ev.type === "pointercancel") { kutu.remove(); return; }
      hizliOlustur(gun, sec.bas, sec.bit, ev, kutu);
    };
    kol.addEventListener("pointermove", hareket);
    kol.addEventListener("pointerup", bitir);
    kol.addEventListener("pointercancel", bitir);
  }

  /* ---------- Planlanacaklar cekmecesi ---------- */

  function cekmeceGruplari(mf) { return C.planlanacaklar(S.veri, tkSimdi()).filter(function (g) { return !mf || g.musteriId === mf; }); }
  function grupAraligi(g) { return C.bosAralik(S.veri, { sure: C.tahminiSure(g), simdi: tkSimdi(), ayar: S.veri.ayar }); }
  function cekmeceKart(g, tel) {
    var z = grupAraligi(g), b = bugun(), ce = g.cekim;
    var el = h("div", { class: "tk-cek-kart", tabindex: "0", role: "group", "aria-label": g.baslik, "data-anahtar": g.anahtar },
      h("b", null, g.baslik),
      h("div", { class: "meta" }, g.teslim ? h("span", { class: g.teslim < b ? "gecikti" : null }, "Teslim " + tkGunKisa(g.teslim) + " " + C.tarihKisa(g.teslim) + (g.teslim < b ? " (gecikti)" : "")) : h("span", null, "Teslim tarihi yok"),
        h("span", null, "~" + C.tahminiSure(g) / 60 + " sa"), g.oncelik === "yuksek" ? h("span", { class: "uyari" }, "Öncelikli") : null),
      ce ? h("div", { class: "meta" }, h("span", null, "Çekim: " + tkGunKisa(ce.basTarih) + " " + C.tarihKisa(ce.basTarih) + (ce.durum === "tamamlandi" ? " (çekildi)" : " (henüz çekilmedi)"))) : null,
      h("div", { class: "alt" }, h("button", { class: "btn ince", type: "button", disabled: !z, title: z ? "Önerilen boş aralık: " + tkGunAdi(z.gun) + " " + z.basSaat : "7 gün içinde çalışma saatlerinde boş yer yok",
        onclick: function () { if (z) grupBlokEkle(g, z); } }, z ? "Zaman ayır · " + (z.gun === b ? "bugün " : tkGunKisa(z.gun) + " ") + z.basSaat : "Boş yer yok")));
    if (!tel) el.addEventListener("pointerdown", function (e) { cekmeceSurukle(e, g, el); });
    return el;
  }
  function tkCekmece(mf, filtre) {
    var l = filtre === "cekim" ? [] : cekmeceGruplari(mf);
    return h("aside", { class: "tk-cekmece", "aria-label": "Planlanacaklar" },
      h("div", { class: "tk-cekmece-bas" }, h("h2", null, "Planlanacaklar"),
        h("button", { class: "btn ince yalin", type: "button", "aria-label": "Çekmeceyi kapat", onclick: function () { tercih("takvimCekmece", "0"); yenile(); } }, ikon("kapat"))),
      h("div", { class: "tk-ipucu" }, "Edit zamanı ayrılmamış içerikler. Takvime sürükle ya da “Zaman ayır”a bas."),
      h("div", { class: "tk-cekmece-govde" }, filtre === "cekim" ? h("div", { class: "tk-bos" }, "Çekim filtresinde edit işleri gizli.") :
        l.length ? l.map(function (g) { return cekmeceKart(g, false); }) : h("div", { class: "tk-bos" }, "Hepsine zaman ayrıldı.")));
  }
  function telCekmece(olay) {
    var l = cekmeceGruplari(TK.gorunum.mf);
    tkAcilir([h("h3", null, ikon("cekmece"), "Planlanacaklar"), h("div", { class: "soluk kucuk" }, "Bir işe “Zaman ayır” de; önerilen boş zamana eklenir."),
      l.length ? l.map(function (g) { return cekmeceKart(g, true); }) : h("div", { class: "tk-bos" }, "Hepsine zaman ayrıldı.")], olay, "Planlanacaklar");
  }
  function cekmeceSurukle(e, g, el) {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();
    var basladi = false, hedef = null, x0 = e.clientX, y0 = e.clientY, sure = C.tahminiSure(g);
    try { el.setPointerCapture(e.pointerId); } catch (x) { /* yok */ }
    var yuzen = h("div", { class: "tk-yuzen" }, g.baslik);
    TK.suruk = { el: el, cekmece: true };
    var hareket = function (ev) {
      if (!basladi) {
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 5) return;
        basladi = true;
        el.classList.add("surukleniyor");
        document.body.appendChild(yuzen);
      }
      stil(yuzen, { left: ev.clientX + 12 + "px", top: ev.clientY + 12 + "px" });
      var k = kolonBul(ev.clientX), kay = k && k.el.closest(".tk-kaydirma"), r = kay && kay.getBoundingClientRect();
      if (!k || ev.clientY < r.top || ev.clientY > r.bottom) { hedef = null; hayaletTemizle(); return; }
      var bas = Math.max(k.no * 1440, Math.min(k.no * 1440 + 1425, yuvarla(mutlakNokta(k, ev.clientY) - 15)));
      hedef = { bas: bas, bit: bas + sure };
      hayaletCiz(bas, bas + sure, "edit", g.baslik, tkCakisanlar(aday({ id: null }, bas, bas + sure)));
    };
    el.addEventListener("pointermove", hareket);
    var bitir = function () {
      el.removeEventListener("pointermove", hareket);
      el.classList.remove("surukleniyor");
      yuzen.remove();
      hayaletTemizle();
      TK.suruk = null;
      if (basladi && hedef) grupBlokEkle(g, tkZamandan(hedef.bas, hedef.bit));
    };
    el.addEventListener("pointerup", bitir, { once: true });
    el.addEventListener("pointercancel", function () { hedef = null; bitir(); }, { once: true });
  }
  function grupBlokEkle(g, z) { return blokEkle(g.musteriId, g.icerikler.map(function (i) { return i.id; }), z); }
  /** Yeni calisma blogu (edit zamani). z: { basTarih, basSaat, bitTarih, bitSaat }. */
  function blokEkle(musteriId, icerikIdler, z, baslik) {
    var n = { id: yeniId(), musteriId: musteriId, icerikIdler: icerikIdler.slice(0, 50), baslik: baslik || "", basTarih: z.basTarih, basSaat: z.basSaat,
      bitTarih: z.bitTarih, bitSaat: z.bitSaat, durum: "planlandi", tamamZaman: null, not: "", arsiv: false };
    var cak = tkCakisanlar(n), m = musteri(musteriId);
    return tkKaydet([{ tur: "blok", yeni: n, onceki: null }], "Edit zamanı ayrıldı: " + (m ? m.ad : "") + ", " + tkGunKisa(z.basTarih) + " " + z.basSaat + "–" + z.bitSaat +
      (cak.length ? " · çakışma: " + tkCakismaMetni(cak) + " (kaydırılmadı)" : ""), { geriAlinabilir: true, odak: n.id });
  }

  /* ---------- Hizli olusturma ---------- */

  function hizliOlustur(gun, bas, bit, olay, kutu) {
    var tip = TK.gorunum && TK.gorunum.filtre === "cekim" ? "cekim" : "edit";
    var musS = h("select", { "aria-label": "Müşteri" }, h("option", { value: "" }, "Müşteri seç"), aktifMusteriler().map(function (m) { return h("option", { value: m.id }, m.ad); }));
    var adS = h("input", { type: "text", maxlength: "200", placeholder: "İş adı (ör. 2 reels kurgu)", "aria-label": "İş adı", autocomplete: "off" });
    var icKutu = h("div", { class: "tk-icerik-sec", hidden: true });
    var hataP = h("div", { class: "tk-hata", role: "alert" });
    var sec = h("div", { class: "tk-secim", role: "group", "aria-label": "Tür" });
    var z = { gun: gun, bas: bas, bit: bit };
    var icerikleriGoster = function () {
      icKutu.textContent = "";
      var eHar = C.idHaritasi(S.veri.etkinlikler);
      var l = tip === "edit" && musS.value ? S.veri.icerikler.filter(function (i) { return i.musteriId === musS.value && C.editIsiMi(i, eHar); }).slice(0, 40) : [];
      icKutu.hidden = !l.length;
      if (l.length) ekle(icKutu, [h("span", { class: "soluk kucuk" }, "Bu blokta çalışılacak içerikler (isteğe bağlı)"), l.map(function (i) {
        return h("label", { class: "secenek kucuk" }, h("input", { type: "checkbox", value: i.id }), i.baslik + " · " + C.DURUM_AD[i.durum]);
      })]);
    };
    var secCiz = function () {
      sec.textContent = "";
      ekle(sec, [["edit", "Edit"], ["cekim", "Çekim"]].map(function (t) {
        return h("button", { type: "button", "aria-pressed": String(tip === t[0]), onclick: function () { tip = t[0]; secCiz(); icerikleriGoster(); } }, ikon(t[0] === "cekim" ? "kamera" : "makas"), t[1]);
      }));
    };
    secCiz();
    musS.addEventListener("change", icerikleriGoster);
    var zaman = function () { var a = C.anNoktasi(z.gun, z.bas), b2 = C.anNoktasi(z.gun, z.bit); return { basTarih: a.tarih, basSaat: a.saat, bitTarih: b2.tarih, bitSaat: b2.saat }; };
    var p = tkAcilir([h("h3", null, "Yeni iş"), h("div", { class: "soluk kucuk" }, tkGunAdi(gun) + ", " + C.tarihKisa(gun, true) + " · " + C.dkSaat(bas) + "–" + (bit >= 1440 ? "24:00" : C.dkSaat(bit))),
      sec, alan("Müşteri", musS), alan("İş adı", adS), icKutu, hataP,
      h("div", { class: "eylem" },
        h("button", { class: "btn ince yalin", type: "button", onclick: function () {
          var zz = zaman(), mid = musS.value || null;
          tkKapat();
          if (tip === "cekim") etkinlikPenceresi(null, Object.assign({ musteriId: mid, baslik: adS.value.trim(), tur: "cekim" }, zz));
          else blokPenceresi(null, Object.assign({ musteriId: mid || "", baslik: adS.value.trim(), icerikIdler: secilenler() }, zz));
        } }, "Ayrıntılı form"),
        h("button", { class: "btn ince birincil", type: "button", onclick: function () {
          if (!musS.value) { hataP.textContent = "Müşteri seç; takvim müşteriyi tahminle atamaz."; musS.focus(); return; }
          var zz = zaman();
          if (tip === "edit") { blokEkle(musS.value, secilenler(), zz, adS.value.trim()); return; }
          var n = Object.assign({ id: yeniId(), musteriId: musS.value, baslik: adS.value.trim() || "Çekim", tur: "cekim", tumGun: false, konum: "", not: "", durum: "planlandi", tamamZaman: null, arsiv: false }, zz);
          var cak = tkCakisanlar(n);
          tkKaydet([{ tur: "etkinlik", yeni: n, onceki: null }], "Çekim eklendi: " + (musteri(n.musteriId) || {}).ad + ", " + tkGunKisa(n.basTarih) + " " + n.basSaat +
            (cak.length ? " · çakışma: " + tkCakismaMetni(cak) + " (kaydırılmadı)" : ""), { geriAlinabilir: true, odak: n.id });
        } }, "Kaydet"))], olay, "Yeni iş");
    function secilenler() { return Array.prototype.filter.call(icKutu.querySelectorAll("input:checked"), function () { return true; }).map(function (x) { return x.value; }); }
    if (kutu) {
      var gozcu = new MutationObserver(function () { if (!p.isConnected) { kutu.remove(); gozcu.disconnect(); } });
      gozcu.observe(document.body, { childList: true });
    }
  }

  /* ---------- Ayrinti penceresi: notlar, baglantilar, tasi / ertele, tamamla ---------- */

  function bagliIcerikler(cekimId) { return S.veri.icerikler.filter(function (i) { return !i.arsiv && i.cekimId === cekimId; }); }
  /** Cekim ertelenirse etkilenebilecekler: bagli iceriklerin planli bloklari ve teslim tarihleri (degistirilmez, yalniz listelenir). */
  function cekimEtkilenenler(e) {
    var ic = bagliIcerikler(e.id), ids = ic.map(function (i) { return i.id; }), out = [];
    (S.veri.bloklar || []).forEach(function (b) {
      if (b.arsiv || b.durum !== "planlandi" || !(b.icerikIdler || []).some(function (id) { return ids.indexOf(id) !== -1; })) return;
      out.push("Edit bloğu: " + blokBaslik(b) + " · " + tkGunKisa(b.basTarih) + " " + C.tarihKisa(b.basTarih) + " " + b.basSaat);
    });
    ic.forEach(function (i) { if (C.gecerliTarih(i.teslimTarihi) && C.TESLIM_BEKLEYEN.indexOf(i.durum) !== -1) out.push("Teslim: " + i.baslik + " · " + C.tarihKisa(i.teslimTarihi)); });
    return out;
  }
  function baglantilar(i) {
    var d = i.dosyalar || {};
    return [["ham", "Ham"], ["proje", "Proje"], ["final", "Final"]].map(function (x) { return disLink(d[x[0]], x[1] + " ↗"); }).filter(Boolean);
  }
  function ayrintiPenceresi(o, olay) {
    var k = kayitBul(o.tur, o.k.id) || o.k;
    o = tkOge(o.tur, k);
    var tasinir = !o.tamam && !o.iptal && !k.tumGun;
    var cakIds = C.takvimCakismalari(S.veri)[k.id] || [];
    var cakL = cakIds.map(function (id) { return kayitBul("etkinlik", id) || kayitBul("blok", id); }).filter(Boolean);
    var icerik = [
      h("h3", null, ikon(TIP_IKON[o.tip]), tkMusteriAd(k)),
      h("div", null, h("b", null, tkOgeAd(o)), h("div", { class: "soluk kucuk" }, tkGunAdi(k.basTarih) + ", " + C.tarihKisa(k.basTarih, true) + " · " + tkZamanMetni(k)),
        h("div", { class: "satir-s" }, h("span", { class: "tk-etiket " + (o.tip === "cekim" || o.tip === "edit" ? o.tip : "") }, TIP_AD[o.tip]),
          o.tamam ? h("span", { class: "tk-etiket" }, "✓ Tamamlandı") : o.iptal ? h("span", { class: "tk-etiket" }, "İptal") : null)),
      cakL.length ? h("div", { class: "tk-uyari" }, "Çakışıyor: " + cakL.map(function (c) { return tkMusteriAd(c) + " (" + c.basSaat + "–" + c.bitSaat + ")"; }).join(", ") + ". Hiçbir iş kendiliğinden kaydırılmadı.") : null,
      k.konum ? h("div", { class: "soluk kucuk" }, "Konum: " + k.konum) : null,
      k.not ? h("div", { class: "not" }, k.not) : null
    ];
    if (o.tip === "cekim") {
      var bagli = bagliIcerikler(k.id), bv = C.bekleyenVideo(S.veri, k.id);
      icerik.push(h("div", { class: "ayrac" }), h("div", { class: "kucuk soluk" }, "Bu çekime bağlı işler (" + bv.bagli + " video" + (bv.bekleyen ? ", " + bv.bekleyen + " edit bekliyor" : "") + ")"),
        bagli.length ? h("ul", null, bagli.map(function (i) {
          return h("li", null, durumRozet(i.durum), h("button", { class: "satir-ad", type: "button", onclick: function () { tkKapat(); icerikPenceresi(i.id); } }, i.baslik),
            i.teslimTarihi ? h("span", null, "· teslim " + C.tarihKisa(i.teslimTarihi)) : null, baglantilar(i));
        })) : h("div", { class: "kucuk soluk" }, "Bağlı video yok."),
        h("div", { class: "kucuk soluk" }, "Çekimi tamamlamak videoların editini tamamlamaz; içeriklerin durumu değişmez."));
    }
    if (o.tur === "blok") {
      var ic = blokIcerikleri(k), bitmemis = ic.filter(function (i) { return C.aktif(i) && i.durum !== "hazir" && i.durum !== "yayinlandi"; });
      icerik.push(h("div", { class: "ayrac" }), h("div", { class: "kucuk soluk" }, "Bu blokta çalışılacak içerikler"),
        ic.length ? h("ul", null, ic.map(function (i) {
          return h("li", null, durumRozet(i.durum), h("button", { class: "satir-ad", type: "button", onclick: function () { tkKapat(); icerikPenceresi(i.id); } }, i.baslik + (i.arsiv ? " (arşivde)" : "")),
            i.teslimTarihi ? h("span", null, "· teslim " + C.tarihKisa(i.teslimTarihi)) : null, baglantilar(i));
        })) : h("div", { class: "kucuk soluk" }, "Bu bloğa bağlı içerik yok."),
        h("div", { class: "kucuk soluk" }, "Bloğu bitirmek işi tamamlamaz. İçerikler bitince “Edit işini tamamla” ile yayına hazır yap."));
      o.bitmemis = bitmemis;
    }
    var tasiKutu = h("div", { hidden: true });
    var eylem = h("div", { class: "eylem" });
    if (tasinir) eylem.appendChild(h("button", { class: "btn ince", type: "button", onclick: function () { tasiKutu.hidden = !tasiKutu.hidden; if (!tasiKutu.hidden) { var x = tasiKutu.querySelector("input"); if (x) x.focus(); } } },
      o.tip === "cekim" ? "Ertele / taşı" : "Taşı"));
    eylem.appendChild(h("button", { class: "btn ince", type: "button", onclick: function () { tkKapat(); if (o.tur === "blok") blokPenceresi(k.id); else etkinlikPenceresi(k.id); } }, "Düzenle"));
    if (!o.iptal) eylem.appendChild(h("button", { class: "btn ince " + (o.tamam ? "" : "birincil"), type: "button", onclick: function () { tkTamamla(o); } },
      o.tamam ? "Tamamlanmadı yap" : o.tur === "blok" ? "Bloğu tamamla" : o.tip === "cekim" ? "Çekimi tamamla" : "Tamamla"));
    if (o.tur === "blok" && o.bitmemis.length) eylem.appendChild(h("button", { class: "btn ince", type: "button", title: "Bağlı " + o.bitmemis.length + " içerik “Yayına hazır” olur (geri alınabilir)",
      onclick: function () { editIsiniTamamla(k); } }, "Edit işini tamamla"));
    if (tasinir) {
      // Suruklemeden tasima / erteleme (klavye ve telefon icin de)
      var sureDk = tkAralik(k).bit - tkAralik(k).bas;
      var gunS = tarihGirdisi(k.basTarih), basS = h("input", { type: "time", value: k.basSaat, step: "900", "aria-label": "Başlangıç saati" });
      var sureler = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];
      if (sureler.indexOf(sureDk) === -1) sureler.push(sureDk);
      sureler.sort(function (a, c) { return a - c; });
      var sureS = h("select", { "aria-label": "Süre", value: String(sureDk) }, sureler.map(function (m) { return h("option", { value: String(m) }, m < 60 ? m + " dk" : (m / 60).toString().replace(".", ",") + " sa"); }));
      var etk = o.tip === "cekim" ? cekimEtkilenenler(k) : [];
      var tHata = h("div", { class: "tk-hata", role: "alert" });
      ekle(tasiKutu, [h("div", { class: "ayrac" }),
        h("div", { class: "izgara2" }, alan("Gün", gunS), alan("Başlangıç", basS)), alan("Süre", sureS),
        etk.length ? h("div", { class: "tk-uyari" }, "Bu çekim ertelenirse etkilenebilir: " + etk.join("; ") + ". Bunların tarihleri değişmez; istersen tek tek taşı.") : null,
        tHata,
        h("div", { class: "eylem" }, h("button", { class: "btn ince birincil", type: "button", onclick: function () {
          var gn = gunS.value, bs = C.saatDk(basS.value);
          if (!C.makulTarih(gn) || isNaN(bs)) { tHata.textContent = "Gün ya da saat geçersiz."; return; }
          var refBas = tkMutlak(gn, basS.value);
          zamanDegistir(o, refBas, refBas + +sureS.value, o.tip === "cekim" ? "Ertelendi / taşındı" : "Taşındı");
        } }, "Uygula"))]);
    }
    if (tkMod() === "tel" && tasinir) {
      var adim = function (dg, db, ds) {
        var ar = tkAralik(k);
        zamanDegistir(o, ar.bas + dg * 1440 + db, Math.max(ar.bas + dg * 1440 + db + 15, ar.bit + dg * 1440 + db + ds), ds ? "Süre değişti" : "Taşındı");
      };
      icerik.push(h("div", { class: "ayrac" }), h("div", { class: "kucuk soluk" }, "Sürüklemeden taşı"),
        h("div", { class: "tk-adim" }, h("button", { class: "btn", type: "button", "aria-label": "15 dakika önce", onclick: function () { adim(0, -15, 0); } }, "−15"), h("span", null, "Saat " + k.basSaat),
          h("button", { class: "btn", type: "button", "aria-label": "15 dakika sonra", onclick: function () { adim(0, 15, 0); } }, "+15")),
        h("div", { class: "tk-adim" }, h("button", { class: "btn", type: "button", "aria-label": "Önceki gün", onclick: function () { adim(-1, 0, 0); } }, "‹"), h("span", null, tkGunKisa(k.basTarih) + " " + C.tarihKisa(k.basTarih)),
          h("button", { class: "btn", type: "button", "aria-label": "Sonraki gün", onclick: function () { adim(1, 0, 0); } }, "›")),
        h("div", { class: "tk-adim" }, h("button", { class: "btn", type: "button", "aria-label": "Süreyi 15 dakika kısalt", onclick: function () { adim(0, 0, -15); } }, "−15"),
          h("span", null, "Süre " + (tkAralik(k).bit - tkAralik(k).bas) + " dk"), h("button", { class: "btn", type: "button", "aria-label": "Süreyi 15 dakika uzat", onclick: function () { adim(0, 0, 15); } }, "+15")));
    }
    icerik.push(eylem, tasiKutu);
    tkAcilir(icerik, olay, tkMusteriAd(k) + ": " + tkOgeAd(o));
  }

  /* ---------- Simdi ne yapayim? ---------- */

  function simdiNePenceresi(olay) {
    var r = C.simdiNe(S.veri, tkSimdi(), S.veri.ayar, TK.oneriSira);
    if (!r) { tkAcilir([h("h3", null, ikon("pusula"), "Şimdi ne yapayım?"), h("div", { class: "soluk" }, "Edit bekleyen iş yok.")], olay, "Şimdi ne yapayım?"); return; }
    var g = r.grup, z = r.aralik;
    var planli = {};
    g.planliBloklar.forEach(function (b) { (b.icerikIdler || []).forEach(function (id) { planli[id] = 1; }); });
    var ids = g.icerikler.filter(function (i) { return !planli[i.id]; }).map(function (i) { return i.id; });
    if (!ids.length) ids = g.icerikler.map(function (i) { return i.id; });
    tkAcilir([h("h3", null, ikon("pusula"), "Şimdi ne yapayım?"),
      h("div", { class: "tk-oneri" }, h("b", null, g.baslik), h("ul", null, r.nedenler.map(function (n) { return h("li", null, n); }))),
      h("div", { class: "kucuk soluk" }, "Öneri teslim tarihi, öncelik ve boş zamana göre kurallarla seçilir. Sen eklemedikçe takvime hiçbir şey konmaz."),
      h("div", { class: "eylem" },
        r.adaySayisi > 1 ? h("button", { class: "btn ince", type: "button", onclick: function () { TK.oneriSira = r.sira + 1; simdiNePenceresi(olay); } }, "Başka öner") : null,
        z ? h("button", { class: "btn ince birincil", type: "button", onclick: function () {
          blokEkle(g.musteriId, ids, z);
        } }, (z.gun === bugun() ? "Bugün " : tkGunKisa(z.gun) + " ") + z.basSaat + "’e yerleştir") : null)], olay, "Şimdi ne yapayım?");
  }

  /* ---------- Tarih secici ---------- */

  function miniTakvim(olay) {
    var v = TK.gorunum, ay = C.ayBasi(v.t), b = bugun();
    var kap = h("div");
    var ciz_ = function () {
      kap.textContent = "";
      ekle(kap, [h("div", { class: "satir-s" },
        h("button", { class: "btn ince yalin", type: "button", "aria-label": "Önceki ay", onclick: function () { ay = C.ayEkle(ay, -1); ciz_(); } }, ikon("sol")),
        h("b", { class: "tk-bosluk" }, C.ayAdi(ay)),
        h("button", { class: "btn ince yalin", type: "button", "aria-label": "Sonraki ay", onclick: function () { ay = C.ayEkle(ay, 1); ciz_(); } }, ikon("sag"))),
        h("div", { class: "tk-mini-ay" }, C.GUN_KISA.map(function (x) { return h("div", { class: "gb" }, x.slice(0, 2)); }),
          [].concat.apply([], C.ayIzgarasi(ay)).map(function (gn) {
            return h("button", { type: "button", class: (gn.slice(0, 7) !== ay.slice(0, 7) ? "disari " : "") + (gn === b ? "bugun " : "") + (v.gunler.indexOf(gn) !== -1 && v.g !== "ay" ? "secili" : ""),
              "aria-label": tkGunAdi(gn) + " " + C.tarihKisa(gn, true), onclick: function () { tkKapat(); tkGit({ t: gn }); } }, String(+gn.slice(8)));
          }))]);
    };
    ciz_();
    tkAcilir([h("h3", null, "Tarihe git"), kap], olay, "Tarih seç");
  }

  /* ---------- Ay gorunumu ---------- */

  function tkAyCiz(gunler, ogeler) {
    var v = TK.gorunum, ay = v.t.slice(0, 7), b = bugun();
    return h("div", { class: "tk-ay" }, C.GUN_KISA.map(function (x) { return h("div", { class: "gb" }, x); }), gunler.map(function (g) {
      var l = ogeler.filter(function (o) { return !o.k.tumGun && C.takvimParcalari(o.k, g, g).length; }).sort(function (a, c) { return C.etkinlikSirala(a.k, c.k); });
      var git_ = function () { tkGit({ g: "gun", t: g, kayan: "" }); };
      return h("div", { class: "tk-hucre" + (g.slice(0, 7) !== ay ? " disari" : "") + (g === b ? " bugun" : ""), "data-gun": g, onclick: function (ev) { if (!ev.target.closest("button")) git_(); } },
        h("button", { class: "no", type: "button", "aria-label": tkGunAdi(g) + " " + C.tarihKisa(g) + ": gün görünümü", onclick: git_ }, String(+g.slice(8))),
        tumGunSerit(g, ogeler),
        l.slice(0, 3).map(function (o) {
          return h("button", { class: "tk-cip " + o.tip + (o.tamam ? " tamam" : "") + (o.iptal ? " iptal" : ""), type: "button", "data-id": o.k.id, title: tkMusteriAd(o.k) + " · " + tkOgeAd(o) + " · " + tkZamanMetni(o.k),
            "aria-label": TIP_AD[o.tip] + ": " + tkMusteriAd(o.k) + ", " + tkOgeAd(o) + ", " + tkZamanMetni(o.k) + (o.tamam ? ", tamamlandı" : o.iptal ? ", iptal" : ""),
            onclick: function (ev) { ayrintiPenceresi(o, ev); } }, ikon(TIP_IKON[o.tip]), h("span", null, (g === o.k.basTarih ? o.k.basSaat : "…") + " " + tkMusteriAd(o.k)));
        }),
        l.length > 3 ? h("button", { class: "daha", type: "button", onclick: git_ }, "+" + (l.length - 3) + " daha") : null);
    }));
  }

  /* ---------- Takvim ayarlari: katmanlar, calisma saatleri, haftalik hedef, ses, ozel gunler ---------- */

  function ayarPenceresi(olay) {
    var kt = tkKatman(), cs = tkCalisma(), a = S.veri.ayar || {};
    var kat = function (k, ad, ik) {
      return h("label", { class: "secenek" }, h("input", { type: "checkbox", checked: kt[k], onchange: function (e) {
        var y = tkKatman(); y[k] = e.target.checked; tercih("takvimKatman", JSON.stringify(y)); yenileAcik();
      } }), ikon(ik), ad);
    };
    // Secenekler tam saatler; kayitli deger tam saat degilse (ör. 08:30, ice aktarma ya da API) kendisi de secenek olur:
    // pencere dokunulmayan saati yuvarlayip geri yazmaz
    var saatSec = function (deger, ad) {
      var dk = [];
      for (var i = 0; i <= 24; i++) dk.push(i * 60);
      if (dk.indexOf(deger) === -1) { dk.push(deger); dk.sort(function (x, y) { return x - y; }); }
      return h("select", { "aria-label": ad, value: String(deger) }, dk.map(function (m) { return h("option", { value: String(m) }, m === 1440 ? "24:00" : C.dkSaat(m)); }));
    };
    var basS = saatSec(cs.bas, "Çalışma başı"), bitS = saatSec(cs.bit, "Çalışma sonu");
    var hedefS = h("input", { type: "number", min: "0", max: "99", value: a.haftalikHedef ? String(a.haftalikHedef) : "", placeholder: "Hedef yok", "aria-label": "Haftalık hedef" });
    var hataP = h("div", { class: "tk-hata", role: "alert" });
    // Pencerenin acildigi (ya da cakismada yuklenen) degerler: yalniz kullanicinin degistirdigi alanlar gonderilir
    var ilk = { bas: basS.value, bit: bitS.value, hedef: hedefS.value };
    var alanlariDoldur = function (ayar) {
      var c2 = C.calismaSaatleri(ayar);
      [[basS, c2.bas, "Çalışma başı"], [bitS, c2.bit, "Çalışma sonu"]].forEach(function (x) {
        var yeni = saatSec(x[1], x[2]);
        x[0].textContent = "";
        ekle(x[0], Array.prototype.slice.call(yeni.children));
        x[0].value = String(x[1]);
      });
      hedefS.value = ayar && ayar.haftalikHedef ? String(ayar.haftalikHedef) : "";
      ilk = { bas: basS.value, bit: bitS.value, hedef: hedefS.value };
    };
    var kaydetD = h("button", { class: "btn ince birincil", type: "button", onclick: function () {
      var cb = +basS.value, ce = +bitS.value, hd = hedefS.value === "" ? null : parseInt(hedefS.value, 10);
      if (ce <= cb) { hataP.textContent = "Çalışma sonu başlangıçtan sonra olmalı."; return; }
      if (hd !== null && !(hd >= 0 && hd <= 99)) { hataP.textContent = "Haftalık hedef 0 ile 99 arasında olmalı (boş = hedef yok)."; return; }
      var degisen = {};
      if (basS.value !== ilk.bas) degisen.calismaBas = cb;
      if (bitS.value !== ilk.bit) degisen.calismaBit = ce;
      if (hedefS.value !== ilk.hedef) degisen.haftalikHedef = hd;
      if (!Object.keys(degisen).length) { tkKapat(); return; }
      kaydetD.disabled = true;
      hataP.textContent = "";
      tkKayitIzle(calismaAyariKaydet(degisen, { bas: +ilk.bas, bit: +ilk.bit, hedef: ilk.hedef === "" ? null : parseInt(ilk.hedef, 10) })).then(function (ok) {
        kaydetD.disabled = false;
        if (ok === true) { tkKapat(); return; }
        if (ok === "cakisma") {
          // Kullanicinin degistirdigi alan baska yerde de degismis: ustune yazilmaz, guncel degerler yuklenir ve soylenir
          if (!kaydetD.isConnected) { tkToast("Kaydedilmedi: takvim ayarları bu arada başka bir yerde değişti. Güncel değerler yüklendi.", "hata"); return; }
          alanlariDoldur(S.veri.ayar);
          hataP.textContent = "Bu ayarlar bu arada başka bir yerde (başka sekme ya da cihaz) değişti; güncel değerler yüklendi. İstersen değişikliğini yeniden yap.";
          return;
        }
        hataP.textContent = "Kaydedilemedi; bildirimdeki açıklamaya bak.";
      });
    } }, "Kaydet");
    var ozel = (S.veri.ozelgunler || []).slice().sort(function (x, y) { return x.tarih < y.tarih ? -1 : x.tarih > y.tarih ? 1 : 0; });
    var aktifOzel = ozel.filter(C.aktif), arsivOzel = ozel.filter(function (o) { return o.arsiv; });
    var ozelSatir = function (o) {
      return h("li", null, ikon(o.tur === "dogum" ? "pasta" : "yildiz"), h("span", { class: "tk-bosluk" }, o.baslik + " · " + C.tarihKisa(o.tarih, true) + (o.herYil ? " (her yıl)" : "")),
        o.arsiv ? h("button", { class: "btn ince", type: "button", onclick: function () { tkKapat(); arsivDegistir("ozelgun", o, false); } }, "Arşivden çıkar") :
          h("button", { class: "btn ince", type: "button", onclick: function () { tkKapat(); ozelGunPenceresi(o.id); } }, "Düzenle"));
    };
    tkAcilir([h("h3", null, ikon("ayar"), "Takvim ayarları"),
      h("div", { class: "kucuk soluk" }, "Katmanlar (bu cihazda saklanır)"), kat("tatil", "Resmî tatiller", "tatil"), kat("ozel", "Özel günlerim", "yildiz"), kat("dogum", "Doğum günleri", "pasta"),
      h("div", { class: "ayrac" }),
      h("div", { class: "kucuk soluk" }, "Çalışma saatleri ve haftalık hedef (sunucuda; telefon ve bilgisayar aynısını görür)"),
      h("div", { class: "izgara2" }, alan("Çalışma başı", basS), alan("Çalışma sonu", bitS)),
      alan("Haftalık hedef (tamamlanan iş)", hedefS), hataP, h("div", { class: "eylem" }, kaydetD),
      h("div", { class: "ayrac" }),
      h("label", { class: "secenek" }, h("input", { type: "checkbox", checked: tkSesAcik(), onchange: function (e) { tercih("takvimSes", e.target.checked ? "1" : "0"); if (e.target.checked) sesCal(); } }),
        "Tamamlama sesi (kısa, yumuşak; bu cihazda)"),
      h("div", { class: "ayrac" }),
      h("div", { class: "satir-s" }, h("b", { class: "tk-bosluk" }, "Özel günler"), h("button", { class: "btn ince", type: "button", onclick: function () { tkKapat(); ozelGunPenceresi(null); } }, "Özel gün ekle")),
      aktifOzel.length ? h("ul", null, aktifOzel.map(ozelSatir)) : h("div", { class: "kucuk soluk" }, "Henüz özel gün yok (ör. stüdyo bakım günü, doğum günü)."),
      arsivOzel.length ? h("details", null, h("summary", { class: "kucuk soluk" }, "Arşivdeki özel günler (" + arsivOzel.length + ")"), h("ul", null, arsivOzel.map(ozelSatir))) : null,
      h("div", { class: "ayrac" }),
      h("div", { class: "kucuk soluk" }, "Google Takvim eşitlemesi yok; hiçbir veri Google’a ya da başka bir servise gitmez.")], olay, "Takvim ayarları");
  }
  /** Ayar penceresi acikken katman degisince takvimi ciz, pencereyi koru. */
  function yenileAcik() {
    var p = document.querySelector(".tk-acilir");
    if (p) p.remove();
    var pr = document.querySelector(".tk-perde");
    yenile();
    if (p) { document.body.appendChild(p); if (pr && !document.querySelector(".tk-perde")) document.body.insertBefore(pr, p); }
  }
  /**
   * Takvim ayarlari: degisen yalniz kullanicinin degistirdigi alanlar ({ calismaBas, calismaBit, haftalikHedef } alt kumesi);
   * gonderilmeyen alani sunucu saklananla korur. ilk: pencerenin acildigi degerler { bas, bit, hedef }.
   * Surum cakismasinda (baska sekme / cihaz): kullanicinin degistirdigi alan orada da degistiyse yazilmaz ("cakisma" doner,
   * S.veri.ayar guncel); degismediyse yalniz bu alanlar guncel surumle bir kez yeniden gonderilir. Promise<true | false | "cakisma">
   */
  function calismaAyariKaydet(degisen, ilk, tekrar) {
    var a = S.veri.ayar, n = C.kopya(degisen);
    // eski arayuz alanlari (esik) korunur; gonderilmeyen son yedek ve takvim alanlari sunucuda korunur
    if (a) { n.id = "ayar"; n.surum = a.surum; n.varsayilanStokUyari = a.varsayilanStokUyari === undefined ? null : a.varsayilanStokUyari; }
    return kaydetHam([{ tur: "ayar", kayit: n }]).then(function (j) {
      if (j.ok) { yenile(); tkToast("Takvim ayarları kaydedildi."); return true; }
      if (j.hata === "cakisma" && j.guncel) {
        S.veri.ayar = j.guncel;
        var g = C.calismaSaatleri(j.guncel), gh = typeof j.guncel.haftalikHedef === "number" && j.guncel.haftalikHedef > 0 ? j.guncel.haftalikHedef : null;
        var baskaYerde = ("calismaBas" in degisen && g.bas !== ilk.bas) || ("calismaBit" in degisen && g.bit !== ilk.bit) || ("haftalikHedef" in degisen && gh !== (ilk.hedef || null));
        if (!baskaYerde && !tekrar) return calismaAyariKaydet(degisen, ilk, true);
        yenileAcik();
        return "cakisma";
      }
      if (j.hata !== "oturum") tkToast(hataMetni(j), "hata");
      return false;
    });
  }

  /* ---------- Ozel gun penceresi ---------- */

  function ozelGunPenceresi(id) {
    var o = id ? bul(S.veri.ozelgunler || [], id) : null, yeniKimlik = o ? null : yeniId();
    var v = o ? C.kopya(o) : { baslik: "", tarih: bugun(), tur: "ozel", herYil: false, arsiv: false };
    var g = {
      baslik: h("input", { type: "text", maxlength: "120", value: v.baslik, autocomplete: "off" }), tarih: tarihGirdisi(v.tarih),
      tur: secim([{ k: "ozel", ad: "Özel gün" }, { k: "dogum", ad: "Doğum günü" }], v.tur), herYil: h("input", { type: "checkbox", checked: !!v.herYil })
    };
    function formDegeri() { return { baslik: g.baslik.value.trim(), tarih: g.tarih.value || null, tur: g.tur.value, herYil: g.herYil.checked }; }
    var ilk = formDegeri();
    function tabanYenile(guncel) {
      var yollar = degisenYollar(ilk, formDegeri());
      v = guncel;
      if (!degisti(yollar, "baslik")) g.baslik.value = v.baslik || "";
      if (!degisti(yollar, "tarih")) g.tarih.value = v.tarih || "";
      if (!degisti(yollar, "tur")) g.tur.value = v.tur || "ozel";
      if (!degisti(yollar, "herYil")) g.herYil.checked = !!v.herYil;
      ilk = formDegeri();
      yollar.forEach(function (y) { yolYaz(ilk, y, yolAl(v, y)); });
    }
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {};
    ref.d = pencere(o ? "Özel günü düzenle" : "Özel gün ekle", [
      h("div", { class: "izgara" }, alan("Başlık", g.baslik), alan("Tarih", g.tarih), alan("Tür", g.tur),
        h("label", { class: "secenek" }, g.herYil, "Her yıl tekrar et")),
      h("p", { class: "soluk kucuk" }, "Takvimin üst şeridinde görünür; çalışma zamanını kapatmaz. Katmanı takvim ayarlarından gizleyebilirsin."), hataP
    ], [
      o ? arsivDugmesi(!v.arsiv, function (hedef) { var g2 = bul(S.veri.ozelgunler || [], o.id) || o; ref.d.close(); if (!!g2.arsiv !== hedef) arsivDegistir("ozelgun", g2, hedef); }) : null,
      vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Kaydet")
    ], function () {
      if (!g.baslik.value.trim()) { hataP.textContent = "Başlık yaz."; g.baslik.focus(); return; }
      if (!g.tarih.value) { hataP.textContent = "Tarih seç."; g.tarih.focus(); return; }
      if (tarihHatasi(hataP, [[g.tarih, v.tarih]])) return;
      var n = degisenleriUygula(v, ilk, formDegeri());
      if (!o) n.id = yeniKimlik;
      return pencereKaydet("ozelgun", n, hataP, tabanYenile).then(function (k) {
        if (!k) return;
        ref.d.close();
        yenile();
        toast(o ? "Özel gün kaydedildi." : "Özel gün eklendi.");
      });
    });
  }

  /* ---------- Calisma blogu penceresi (ayrintili form) ---------- */

  function blokPenceresi(id, vars) {
    var b = id ? bul(S.veri.bloklar || [], id) : null, yeniKimlik = b ? null : yeniId(), gun = bugun();
    var v = b ? C.kopya(b) : Object.assign({ musteriId: "", icerikIdler: [], baslik: "", basTarih: gun, basSaat: "10:00", bitTarih: gun, bitSaat: "12:00", durum: "planlandi", tamamZaman: null, not: "", arsiv: false }, vars || {});
    var g = {
      musteri: musteriSecimi(v.musteriId || "", "Müşteri seç", true),
      baslik: h("input", { type: "text", maxlength: "200", value: v.baslik || "", autocomplete: "off", placeholder: "Boşsa içeriklerden üretilir" }),
      basTarih: tarihGirdisi(v.basTarih), basSaat: h("input", { type: "time", step: "300", value: v.basSaat || "10:00" }),
      bitTarih: tarihGirdisi(v.bitTarih || v.basTarih), bitSaat: h("input", { type: "time", step: "300", value: v.bitSaat || "12:00" }),
      durum: secim([{ k: "planlandi", ad: "Planlandı" }, { k: "tamamlandi", ad: "Tamamlandı" }], v.durum), not: metinKutusu(v.not, 3)
    };
    var icKutu = h("div", { class: "tk-icerik-sec" });
    function icerikleriCiz(secili) {
      icKutu.textContent = "";
      var mid = g.musteri.value;
      var l = S.veri.icerikler.filter(function (i) { return i.musteriId === mid && (secili.indexOf(i.id) !== -1 || (!i.arsiv && i.durum !== "yayinlandi")); });
      if (!l.length) { icKutu.appendChild(h("span", { class: "soluk kucuk" }, mid ? "Bu müşterinin açık içeriği yok." : "Önce müşteri seç.")); return; }
      ekle(icKutu, l.map(function (i) { return h("label", { class: "secenek kucuk" }, h("input", { type: "checkbox", value: i.id, checked: secili.indexOf(i.id) !== -1 }), i.baslik + " · " + C.DURUM_AD[i.durum] + (i.arsiv ? " (arşivde)" : "")); }));
    }
    function secilenler() { return Array.prototype.map.call(icKutu.querySelectorAll("input:checked"), function (x) { return x.value; }); }
    icerikleriCiz(v.icerikIdler || []);
    g.musteri.addEventListener("change", function () { icerikleriCiz([]); });
    function formDegeri() {
      return { musteriId: g.musteri.value, icerikIdler: secilenler(), baslik: g.baslik.value.trim(), basTarih: g.basTarih.value, basSaat: g.basSaat.value,
        bitTarih: g.bitTarih.value || g.basTarih.value, bitSaat: g.bitSaat.value, durum: g.durum.value, not: g.not.value };
    }
    var ilk = formDegeri();
    function tabanYenile(guncel) {
      var yollar = degisenYollar(ilk, formDegeri());
      v = guncel;
      if (!degisti(yollar, "musteriId")) { musteriSecenegi(g.musteri, v.musteriId); g.musteri.value = v.musteriId || ""; }
      if (!degisti(yollar, "icerikIdler")) icerikleriCiz(v.icerikIdler || []);
      if (!degisti(yollar, "baslik")) g.baslik.value = v.baslik || "";
      ["basTarih", "basSaat", "bitTarih", "bitSaat", "durum"].forEach(function (a) { if (!degisti(yollar, a)) g[a].value = v[a] || ""; });
      if (!degisti(yollar, "not")) g.not.value = v.not || "";
      ilk = formDegeri();
      yollar.forEach(function (y) { yolYaz(ilk, y, yolAl(v, y)); });
    }
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {};
    ref.d = pencere(b ? "Edit bloğunu düzenle" : "Edit zamanı ekle", [
      h("div", { class: "izgara" }, alan("Müşteri", g.musteri), alan("Başlık", g.baslik),
        alan("Başlangıç tarihi", g.basTarih), alan("Başlangıç saati", g.basSaat), alan("Bitiş tarihi", g.bitTarih), alan("Bitiş saati", g.bitSaat),
        alan("Durum", g.durum, h("small", null, "Bloğu tamamlamak içeriklerin durumunu değiştirmez.")),
        h("div", { class: "alan tam" }, h("span", null, "Bu blokta çalışılacak içerikler"), icKutu), alan("Not", g.not, null, "tam")),
      hataP
    ], [
      b ? arsivDugmesi(!v.arsiv, function (hedef) { var g2 = bul(S.veri.bloklar || [], b.id) || b; ref.d.close(); if (!!g2.arsiv !== hedef) arsivDegistir("blok", g2, hedef); }) : null,
      vazgec(ref), h("button", { class: "btn birincil", type: "submit" }, "Kaydet")
    ], function () {
      var f = formDegeri();
      if (!f.musteriId) { hataP.textContent = "Müşteri seç."; g.musteri.focus(); return; }
      if (tarihHatasi(hataP, [[g.basTarih, v.basTarih], [g.bitTarih, v.bitTarih]])) return;
      if (!C.gecerliTarih(f.basTarih) || !C.gecerliSaat(f.basSaat) || !C.gecerliSaat(f.bitSaat)) { hataP.textContent = "Başlangıç ve bitiş gününü / saatini gir."; return; }
      if (f.bitTarih + " " + f.bitSaat <= f.basTarih + " " + f.basSaat) {
        hataP.textContent = f.bitTarih === f.basTarih ? "Bitiş başlangıçtan sonra olmalı. Gece yarısını geçiyorsa bitiş tarihini ertesi gün (" + C.tarihKisa(C.gunEkle(f.basTarih, 1)) + ") yap." : "Bitiş başlangıçtan sonra olmalı.";
        return;
      }
      if (f.icerikIdler.length > 50) { hataP.textContent = "Bir blokta en çok 50 içerik olabilir."; return; }
      var n = degisenleriUygula(v, ilk, f);
      if (n.durum === "tamamlandi" && v.durum !== "tamamlandi" && !n.tamamZaman) n.tamamZaman = C.damga();
      if (n.durum !== "tamamlandi") n.tamamZaman = null;
      if (!b) n.id = yeniKimlik;
      var taban = C.kopya(v);
      var pk = pencereKaydet("blok", n, hataP, tabanYenile);
      if (tkRotada()) tkKayitIzle(pk);
      return pk.then(function (k) {
        if (!k) return;
        ref.d.close();
        yenile();
        tkToast(b ? "Edit bloğu kaydedildi." : "Edit zamanı eklendi.", "", b ? { ad: "Geri al", f: function () { geriAl([{ tur: "blok", onceki: taban, sonraki: k }]); } } : null);
      });
    }, true);
  }
  // Pencere boyutu telefon / masaustu sinirini gecince takvim yeniden cizilir
  var tkSonMod = tkMod();
  window.addEventListener("resize", function () {
    var m = tkMod();
    if (m === tkSonMod) return;
    tkSonMod = m;
    if (S.rota && (S.rota.ad === "cekim" || S.rota.ad === "takvim") && !tkMesgul()) { TK.kaydirma = null; yenile(); }
  });

  SAYFALAR.cekim = SAYFALAR.takvim = takvimSayfasi;
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
      // Telefonda musteri secimi ve ikinci katman "Filtreler" altinda katlanir (etkin filtre varsa acik); masaustunde hep acik
      h("details", { class: "filtre-kap takvim-filtre", open: window.innerWidth > 860 || !!mf || ikisi },
        h("summary", null, "Filtreler" + (mf || ikisi ? " (" + ((mf ? 1 : 0) + (ikisi ? 1 : 0)) + ")" : "")),
        h("div", { class: "takvim-filtre-ic" },
          h("select", { "aria-label": "Müşteri", value: mf, onchange: function (ev) { git(katman, param({ musteri: ev.target.value }), null, true); } },
            h("option", { value: "" }, "Tüm müşteriler"), aktifMusteriler().map(function (m) { return h("option", { value: m.id }, m.ad); })),
          h("label", { class: "secenek" }, h("input", { type: "checkbox", checked: ikisi, onchange: function (ev) { git(katman, param({ ikisi: ev.target.checked ? "1" : "" }), null, true); } }),
            katman === "cekim" ? "Paylaşımları da göster" : "Çekimleri de göster"))));
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
        // Hucrenin bos yerine dokununca o gun acilir (telefonda hucrede yalniz nokta ve sayi var)
        return h("div", { class: "hucre" + (d.slice(0, 7) !== ay ? " disari" : "") + (d === b ? " bugun" : ""),
          onclick: function (ev) { if (!ev.target.closest("button, a")) git(katman, param({ g: "gun", t: d }), null, true); } },
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
        h("span", null, h("i", { class: "t-yayinlandi" }), "Yayınlandı"), h("span", null, h("i", { class: "t-ihtiyac" }), "Paylaşım günü, beklenen türde hazır yok"),
        h("span", null, h("i", { class: "t-ihtiyac oneri" }), "Atanmamış ya da tarihi geçmiş hazır içerikle karşılanabilir")] : null);
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
    // Acik gunde tur video gunlerinde de yazilir: ayni gune planli baska turdeki hazirla ("Planlı, hazır") celismesin
    var tAd = ({ video: "video", post: "post", story: "story", diger: "diğer" })[o.s.grup || "video"] || o.s.grup;
    var metin = o.s.durum === "acik" ? tAd + " günü, hazır " + (o.s.grup === "diger" ? "içerik" : tAd) + " yok" :
      (o.s.grup && o.s.grup !== "video" ? tAd + " günü, " : "") + (o.s.durum === "oneri" ? "atanmamış ya da tarihi geçmiş hazır içerikle karşılanabilir" : "paylaşım günü (stok bilinmiyor)");
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
    // Acil olanlar ustte: stok uyarisi olanlar (ilk karsilanmayan paylasim gunu en yakin olan once), sonra stok girisi
    // yapilmayanlar, sonra digerleri; esitlikte ada gore
    var sira = {};
    l.forEach(function (m) {
      var u = C.stokUyarisi(S.veri, m, b, esik), k = C.kapsama(S.veri, m, b, 7);
      sira[m.id] = (u.seviye === "dusuk" ? "0" : u.seviye === "bilinmiyor" ? "1" : "2") + "|" + (k.duzenTamam && k.ilkAcik ? k.ilkAcik : "9999");
    });
    l = l.slice().sort(function (x, y) { return sira[x.id] < sira[y.id] ? -1 : sira[x.id] > sira[y.id] ? 1 : adSirala(x, y); });
    return h("div", null,
      sayfaBasligi("Stok", "Hazır stok: müşteri onayı alınmış, yayına hazır ve henüz yayınlanmamış videolar (Reels / video). Postlar videoya sayılmaz."),
      h("p", { class: "soluk kucuk" }, "İleri tarihe atanmış, tarihi geçip yayınlanmamış ve atanmamış hazır içerikler ayrı sayılır; üçünün toplamı hazır stoktur. Önümüzdeki 7 / 14 gün yayın düzenindeki gerçek günlerden hesaplanır. ",
        "“Öneri” atanmamış ya da tarihi geçmiş bir hazır içeriğin o güne konabileceğini gösterir; plana sen çevirmedikçe kaydedilmez. Acil olanlar üstte."),
      STOK_SUZGEC[f] ? h("p", { class: "kucuk" }, "Gösterilen: " + STOK_SUZGEC[f] + " (" + l.length + ") · ", ic(rotaLink("stok"), "Tüm müşteriler")) : null,
      bilinmeyen.length ? h("div", { class: "uyari-kutu" }, bilinmeyen.length + " müşteride stok girişi yapılmadı; bunlarda stok 0 sayılmaz, “bilinmiyor” görünür.") : null,
      l.length ? l.map(function (m) {
        var u = C.stokUyarisi(S.veri, m, b, S.veri.ayar ? S.veri.ayar.varsayilanStokUyari : null);
        return h("div", { class: "stok-musteri" },
          h("div", { class: "ust-satir" }, h("b", null, musteriLink(m)), h("span", { class: "soluk kucuk" }, C.siklikMetni(m, b)),
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
    var hataP = h("p", { class: "hata", role: "alert" }), ref = {}, kimlikler = {};
    ref.d = pencere("Stok girişi: " + m.ad, [
      h("p", { class: "soluk" }, "Şu an elindeki içerikleri gir. Hiç hazır içerik yoksa boş bırakıp kaydet: stok “0” olarak bilinir hale gelir."),
      mevcut.length ? h("p", { class: "soluk kucuk" }, "Sistemde bu müşteri için zaten " + hazirSayi + " hazır ve " + hazirlikSayi + " hazırlıkta içerik var; bunlar korunur, yenileri eklenir.") : null,
      h("div", { class: "izgara" },
        alan("Yayına hazır (onaylı, yayınlanmamış)", g.hazir, null, "tam"), alan("Adet (başlık yazmadıysan)", g.hazirAdet), alan("Tür", g.hazirTur),
        alan("Hazırlıkta olanlar", g.hazirlik, null, "tam"), alan("Hazırlıktakilerin durumu", g.hazirlikDurum), alan("Tür", g.hazirlikTur)),
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
      var kayitlar = satirKimlikleri(kimlikler, hz.map(function (s) { return yeni(s, "hazir", g.hazirTur.value); }).concat(hzl.map(function (s) { return yeni(s, g.hazirlikDurum.value, g.hazirlikTur.value); })));
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

  var ARAMA_ICERIK = 100, ARAMA_CEKIM = 50;
  SAYFALAR.ara = function (r) {
    var q = r.p.q || "";
    if (S.el && document.activeElement !== S.el.ara) S.el.ara.value = q;
    var s = C.ara(S.veri, q), cak = C.cakismaHaritasi(S.veri.etkinlikler), b = bugun();
    var toplam = s.musteriler.length + s.icerikler.length + s.etkinlikler.length;
    // Icerikler listedeki siraya gore (yayinlanmamislar once, yayinlananlar yeniden eskiye, arsivdekiler en sonda); ilk
    // ARAMA_ICERIK gosterilir, kalani "+N tane daha" ve ayni aramayla acilan listeden. Cekimler: yaklasanlar once, sonra
    // gecmis yeniden eskiye; ilk ARAMA_CEKIM gosterilir, kalani yerinde acilir (hicbiri erisilemez kalmaz).
    var icl = s.icerikler.slice().sort(function (x, y) { return (x.arsiv ? 1 : 0) - (y.arsiv ? 1 : 0) || C.icerikSirala(x, y); });
    var etl = s.etkinlikler.slice().sort(C.etkinlikSirala);
    etl = etl.filter(function (e) { return C.aralik(e)[1] > b + " 00:00"; }).concat(etl.filter(function (e) { return C.aralik(e)[1] <= b + " 00:00"; }).reverse());
    var etkS = function (e) { return etkinlikSatiri(e, cak); };
    var cekimDaha = etl.length > ARAMA_CEKIM ? h("button", { class: "btn ince daha-satir", type: "button", onclick: function () {
      cekimDaha.replaceWith.apply(cekimDaha, etl.slice(ARAMA_CEKIM).map(etkS));
    } }, "+" + (etl.length - ARAMA_CEKIM) + " tane daha göster") : null;
    // Kalanlar iki listede: arsivde olmayanlar (q ile) ve arsivdekiler (q + arsiv=1); baglantilardaki sayilar acilan listelerinkiyle ayni
    var listeLink = rotaLink("icerikler", { gorunum: "liste", q: q }), arsivLink = rotaLink("icerikler", { gorunum: "liste", q: q, arsiv: "1" });
    var aktifSayi = icl.filter(function (i) { return !i.arsiv; }).length, arsivSayi = icl.length - aktifSayi;
    return h("div", null, sayfaBasligi("Arama: " + q, toplam + " sonuç"),
      s.musteriler.length ? bolum("Müşteriler", s.musteriler.length, null, s.musteriler.map(function (m) {
        return h("div", { class: "satir" + (m.arsiv ? " arsivli" : "") }, musteriLink(m), h("span", { class: "satir-bilgi" }, dizi([m.kurum, C.siklikMetni(m, b), m.arsiv ? "Arşivde" : null])));
      })) : null,
      icl.length ? bolum("İçerikler", icl.length, icl.length > ARAMA_ICERIK && aktifSayi ? listeLink : null, [icl.slice(0, ARAMA_ICERIK).map(function (i) { return icerikSatiri(i); }),
        icl.length > ARAMA_ICERIK ? h("p", { class: "daha-satir" }, "+" + (icl.length - ARAMA_ICERIK) + " tane daha → ",
          dizi([aktifSayi ? ic(listeLink, "İçerikler listesinde aç (" + aktifSayi + ")", { class: "kucuk-link" }) : null,
            arsivSayi ? ic(arsivLink, "arşivde " + arsivSayi, { class: "kucuk-link" }) : null])) : null]) : null,
      etl.length ? bolum("Çekim ve etkinlikler", etl.length, null, [etl.slice(0, ARAMA_CEKIM).map(etkS), cekimDaha]) : null,
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
      } }, alan("Varsayılan eşik (müşterinin paylaşım türünde hazır içerik)", esik, h("small", null, "Müşteride eşik yoksa bu kullanılır. Boşsa yalnız 7 günlük açık günlere bakılır.")),
        h("button", { class: "btn", type: "submit" }, "Kaydet"))),
      bolum("Yedekleme", null, null, [
        h("div", { class: "uyari-kutu" }, "Yedek dosyaları müşteri, ücret ve takvim bilgisi içerir. Güvenli bir yerde sakla; kimseyle paylaşma, herkese açık bir klasöre koyma."),
        h("p", { class: "son-yedek kucuk" + (sonYedek() && sonYedek().gun <= YEDEK_HATIRLATMA_GUN ? " soluk" : " uyari") }, sonYedekMetni()),
        h("div", { class: "eylemler" },
          h("button", { class: "btn", type: "button", onclick: jsonYedekIndir }, "JSON yedeği indir"),
          h("button", { class: "btn", type: "button", onclick: function () { indir("suflo-studio-musteriler-" + bugun() + ".csv", C.musterilerCsv(S.veri), "text/csv;charset=utf-8"); } }, "Müşteriler (CSV)"),
          h("button", { class: "btn", type: "button", onclick: function () { indir("suflo-studio-icerikler-" + bugun() + ".csv", C.iceriklerCsv(S.veri), "text/csv;charset=utf-8"); } }, "İçerikler (CSV)"))]),
      bolum("İçe aktar / geri yükle", null, null, [
        h("p", { class: "soluk kucuk" }, "Suflo Studio’dan indirdiğin JSON yedeğini ya da müşteri / çekim / içerik listesi içeren bir JSON dosyasını seç. Önce önizleme gösterilir; aynı kayıtlar ikinci kez eklenmez, hiçbir şey sessizce silinmez. Uygulamadan önce otomatik kopya alınır."),
        alan("Dosya", dosya), onizleme]),
      bolum("Otomatik kopyalar", null, null, [h("p", { class: "soluk kucuk" }, "Sunucu her gün ilk değişiklikten önce (günlük kopya) ve her içe aktarma / geri yüklemeden önce tüm verinin kopyasını alır. Son 14 günlük kopya ve son 30 diğer kopya saklanır."), anlikKutu]),
      bolum("Güvenlik", null, null, [
        h("div", { class: "eylemler" },
          h("button", { class: "btn", type: "button", onclick: sifrePenceresi }, "Şifreyi değiştir"),
          h("button", { class: "btn", type: "button", onclick: function () {
            onayla("Tüm cihazlarda çıkış yap", "Telefon ve bilgisayar dahil tüm cihazlarda oturum kapanır; yeniden şifreyle girmen gerekir.", "Tümünü kapat").then(function (e) {
              if (e) api("oturumlari_kapat").then(function (j) { if (j.ok) girisEkrani("Tüm oturumlar kapatıldı."); else toast(hataMetni(j), "hata"); });
            });
          } }, "Tüm cihazlarda çıkış yap"),
          h("button", { class: "btn", type: "button", onclick: cikis }, "Çıkış"))]),
      bolum("Bilgi", null, null, h("dl", { class: "bilgi" },
        h("dt", null, "Saat dilimi"), h("dd", null, "Europe/Istanbul (UTC+3)"),
        h("dt", null, "Veri"), h("dd", null, "Suflo Studio sunucusunda; bu tarayıcıda saklanmaz. Telefon ve bilgisayar aynı kayıtları görür."),
        h("dt", null, "Silme"), h("dd", null, "Tek tek silme yok; kayıtlar arşivlenir. “Tüm veriyi bu dosyayla değiştir” ve “Bu kopyaya dön” mevcut kayıtları kaldırır; öncesinde otomatik kopya alınır (Otomatik kopyalar)."))));
  };
  function indir(ad, icerik, tur) {
    var url = URL.createObjectURL(new Blob([icerik], { type: tur }));
    var a = h("a", { href: url, download: ad });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  /**
   * Son yedek gununu ayar kaydina yazar (telefon ve bilgisayar ayni tarihi gorur). Sessizdir: yazilamazsa yedek yine iner.
   * Ayar bu arada baska yerde degistiyse guncel surumle bir kez daha denenir (esik korunur).
   */
  function sonYedekYaz(tekrar) {
    var a = S.veri.ayar, n = { sonYedek: bugun() };
    if (a) { n.id = "ayar"; n.surum = a.surum; n.varsayilanStokUyari = a.varsayilanStokUyari === undefined ? null : a.varsayilanStokUyari; }
    return kaydetHam([{ tur: "ayar", kayit: n }]).then(function (j) {
      if (j.ok) return true;
      if (j.hata === "cakisma" && j.guncel && !tekrar) { S.veri.ayar = j.guncel; return sonYedekYaz(true); }
      return false;
    });
  }
  function jsonYedekIndir() {
    api("disa_aktar").then(function (j) {
      if (!j.ok) { toast(hataMetni(j), "hata"); return; }
      return sonYedekYaz().then(function () { yedegiIndir(j); });
    });
  }
  function yedegiIndir(j) {
    var p = document.querySelector(".son-yedek");
    if (p) { p.textContent = sonYedekMetni(); p.className = "son-yedek kucuk" + (sonYedek() ? " soluk" : " uyari"); }
    var metin = JSON.stringify(j.yedek, null, 2);
    indir("suflo-studio-yedek-" + bugun() + ".json", metin, "application/json");
    var govdeBayt = baytBoyutu({ islem: "ice_aktar", veriler: j.yedek.veriler });
    if (govdeBayt > GOVDE_SINIRI) toast("Yedek indirildi ama verisi " + (govdeBayt / 1048576).toFixed(1).replace(".", ",") + " MB; tek seferde geri yüklenebilecek boyutu (8 MB) aşıyor. Sunucudaki otomatik kopyalar yine geçerli.", "hata");
    else toast("Yedek indirildi. Özel bilgi içerir; güvenli yerde sakla.");
  }
  /**
   * Kopya ozetindeki sayilar: "1 müşteri, 2 içerik, 3 çekim / etkinlik" (eski kopyalarda "1 musteri, 2 icerik, 3 etkinlik").
   * Okunamazsa null.
   */
  function sayilarOzet(oz) {
    var m = /(\d+) m[uü][sş]teri, (\d+) i[cç]erik, (\d+) (?:çekim \/ )?etkinlik/.exec(String(oz || ""));
    return m ? { musteri: +m[1], icerik: +m[2], etkinlik: +m[3] } : null;
  }
  function sayiMetni(x) { return x.musteri + " müşteri, " + x.icerik + " içerik, " + x.etkinlik + " çekim / etkinlik"; }
  function anliklariYukle(kutu) {
    api("anliklar").then(function (j) {
      kutu.textContent = "";
      if (!j.ok) { kutu.appendChild(h("p", { class: "hata" }, hataMetni(j))); return; }
      if (!j.anliklar.length) { kutu.appendChild(h("p", { class: "soluk kucuk" }, "Henüz otomatik kopya yok.")); return; }
      var neden = { gunluk: "Günlük kopya", ice_aktarma_oncesi: "İçe aktarma öncesi", geri_yukleme_oncesi: "Geri yükleme öncesi", anlik_geri_oncesi: "Kopyaya dönüş öncesi" };
      j.anliklar.forEach(function (a) {
        var z = C.istanbulSimdi(new Date(a.zaman * 1000));
        var kopyaSayi = sayilarOzet(a.ozet);
        kutu.appendChild(h("div", { class: "satir" }, h("b", null, C.tarihKisa(z.tarih, true) + " " + z.saat), h("span", { class: "satir-bilgi" }, dizi([neden[a.neden] || a.neden, kopyaSayi ? sayiMetni(kopyaSayi) : a.ozet])),
          h("span", { class: "sag" }, h("button", { class: "btn ince", type: "button", onclick: function () {
            // Neyin degisecegi acikca yazilir: su anki sayilar (arsiv dahil) ve kopyadakiler
            var su = { musteri: S.veri.musteriler.length, icerik: S.veri.icerikler.length, etkinlik: S.veri.etkinlikler.length };
            var metin = kopyaSayi ? "Şu an: " + sayiMetni(su) + ". Kopyada: " + sayiMetni(kopyaSayi) + ". Tüm veri " + C.tarihKisa(z.tarih, true) + " " + z.saat +
              " kopyasındaki haline döner; kopyadan sonra eklenen ve değiştirilen her şey geri alınır. Şu anki hal önce otomatik kopyalanır." :
              "Tüm veri " + C.tarihKisa(z.tarih, true) + " " + z.saat + " kopyasındaki haline döner (" + a.ozet + "); kopyadan sonra eklenen ve değiştirilen her şey geri alınır. Şu anki hal önce otomatik kopyalanır.";
            onayla("Bu kopyaya dön", metin, "Kopyaya dön", "GERİ YÜKLE", true).then(function (e) {
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
    if (f.size > DOSYA_SINIRI) { kutu.appendChild(h("p", { class: "hata" }, "Dosya çok büyük (en çok 64 MB).")); return; }
    f.text().then(function (metin) {
      var obj;
      try { obj = JSON.parse(metin); } catch (e) { kutu.appendChild(h("p", { class: "hata" }, "Dosya okunamadı: geçerli bir JSON yedeği değil.")); return; }
      var c = C.yedekCoz(obj);
      if (c.hata) { kutu.appendChild(h("p", { class: "hata" }, c.hata)); return; }
      if (baytBoyutu({ islem: "ice_aktar", veriler: c.veriler, kip: "degistir", onay: "GERI YUKLE" }) > GOVDE_SINIRI) {
        kutu.appendChild(h("p", { class: "hata" }, "Veri tek seferde içe aktarılamayacak kadar büyük (sunucu sınırı 8 MB).")); return;
      }
      var dosyaUyarisi = (c.bilinmeyen || []).map(function (k) { return "Tanınmayan bölüm '" + String(k).slice(0, 40) + "': içe aktarılmayacak"; });
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
        toast("İçe aktarma tamamlandı: " + j.sonuc.sayilar.musteri + " müşteri, " + j.sonuc.sayilar.icerik + " içerik, " + j.sonuc.sayilar.etkinlik + " çekim / etkinlik eklendi.");
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
      o.uyarilar && o.uyarilar.length ? h("div", { class: "uyari-kutu" }, h("b", null, "Uyarılar (içe aktarma yine yapılabilir):"), o.uyarilar.map(function (x) { return h("div", null, x); })) : null,
      o.ekle.length ? h("details", null, h("summary", { class: "soluk kucuk" }, "Eklenecekler (müşteri bağlantısı ve ücretiyle)"), o.ekle.map(function (x) {
        if (x.tur === "musteri") return h("div", { class: "kucuk" }, "Müşteri: " + x.ad + " · " + (x.ucret === null || x.ucret === undefined ? "ücret belirlenmedi" : C.para(x.ucret)) + " · " + (SIKLIK_AD[x.siklik] || x.siklik));
        return h("div", { class: "kucuk" }, ({ icerik: "İçerik", etkinlik: "Etkinlik" })[x.tur] + ": " + x.ad + " → " + (x.bag || "müşteri yok"));
      })) : null,
      o.atla.length ? h("details", null, h("summary", { class: "soluk kucuk" }, "Atlananlar"), o.atla.map(function (x) { return h("div", { class: "kucuk" }, x.ad + " — " + x.neden); })) : null,
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
              "Şu anki hal önce otomatik kopyalanır (Ayarlar → Otomatik kopyalar).", "Değiştir", "GERİ YÜKLE", true).then(function (e) {
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
        if (!j.ok) { hataP.textContent = j.hata === "sifre" ? "Mevcut şifre yanlış." : hataMetni(j); return; }
        ref.d.close();
        toast("Şifre değişti. Diğer cihazlarda yeniden giriş gerekecek.");
      });
    });
  }

  basla();
})();
