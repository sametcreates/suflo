/*
 * suflo.app — ölçüm izni, Meta pikseli ve ödeme atıf köprüsü.
 *
 * Ziyaretçi "Kabul et" demeden bu dosya HİÇBİR ŞEY yüklemez ve tarayıcıya hiçbir şey yazmaz:
 * Meta betiği istenmez, çerez kurulmaz, ödeme bağlantısına alan eklenmez. Yalnız verilen yanıt
 * (kabul / ret) localStorage'da "suflo_olcum_izni" anahtarında tutulur.
 *
 * Kabulden sonra:
 *  - Meta pikseli (fbevents.js) yüklenir: PageView; Pro bölümü/sayfası görülünce ViewContent;
 *    satın al düğmesine basılınca InitiateCheckout. Her olay kendi eventID'siyle gider.
 *  - Reklamdan gelindiyse (URL'de fbclid) ve _fbc çerezi yoksa _fbc kurulur (90 gün).
 *  - Lemon Squeezy ödeme bağlantılarına checkout[custom][event_id | fbc | fbp | ua] eklenir.
 *    Sunucu (server/pro-v1/ls-webhook.php) siparişi bu alanlarla Meta Conversions API'ye
 *    Purchase olarak bildirir. event_id alanı aynı zamanda "bu alıcı onay verdi" işaretidir:
 *    alan yoksa sunucu Meta'ya hiçbir şey göndermez.
 *
 * Piksel yalnız suflo.app'te gerçekten yüklenir. Yerel önizlemede (localhost) betik istenmez;
 * olaylar window.fbq.queue içinde birikir, böylece akış ağa çıkmadan denetlenebilir.
 *
 * Tercih, sayfadaki [data-olcum-ac] bağlantısıyla ("Çerez tercihleri") her an değiştirilebilir.
 */
(function () {
  "use strict";
  var w = window, d = document;
  if (w.SufloOlcum) return;

  var PIKSEL = "1084974704080878";
  var FIYAT = 749, PARA = "TRY";
  var ANAHTAR = "suflo_olcum_izni", SURUM = 1;
  var IZIN_OMRU = 365 * 864e5;      // yanıt bir yıl geçerli, sonra yeniden sorulur
  var CEREZ_OMRU = 90 * 86400;      // _fbc: Meta'nın önerdiği 90 gün (saniye)
  var KAYNAK = "https://connect.facebook.net/en_US/fbevents.js";
  var CANLI = /^(www\.)?suflo\.app$/i.test(String(w.location.hostname || ""));
  var EN = /^en\b/i.test(String(d.documentElement.getAttribute("lang") || ""));
  var LS = /^https:\/\/[a-z0-9-]+\.lemonsqueezy\.com\/checkout\//i;
  var OZEL = "checkout%5Bcustom%5D%5B";
  var ALAN = { kimlik: OZEL + "event_id%5D", fbc: OZEL + "fbc%5D", fbp: OZEL + "fbp%5D", ua: OZEL + "ua%5D" };
  var TIK = /^[A-Za-z0-9_.\-]{8,1000}$/;
  var FBC = /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_.\-]{8,1000}$/;
  var FBP = /^fb\.[0-9]\.[0-9]{10,16}\.[0-9]{1,24}$/;

  var M = EN ? {
    baslik: "Cookie choice",
    metin: "We'd like to use the Meta pixel to see whether our ads work. If you accept, Meta advertising cookies are stored in your browser; if you decline, nothing is loaded.",
    ayrinti: "Details",
    ayrintiMetni: "If you accept, Meta's (Facebook/Instagram) measurement script is loaded. Your page view, viewing the Pro section and clicking the buy button are reported to Meta, and the _fbp cookie (plus _fbc if you came from an ad) is stored in your browser for 90 days. If you buy, the order amount, these cookie values, your browser's user agent and an irreversible hash (SHA-256) of your email are sent to Meta. If you decline, the site works exactly the same. You can change your choice any time with \"Cookie preferences\" at the bottom of the page.",
    red: "Decline", kabul: "Accept",
    simdi: "Current choice: ", kabulEdildi: "accepted", reddedildi: "declined"
  } : {
    baslik: "Çerez tercihi",
    metin: "Reklamlarımızın işe yarayıp yaramadığını görmek için Meta pikselini kullanmak istiyoruz. Kabul edersen tarayıcına Meta reklam çerezleri yazılır; reddedersen hiçbir şey yüklenmez.",
    ayrinti: "Ayrıntı",
    ayrintiMetni: "Kabul edersen Meta'nın (Facebook/Instagram) ölçüm betiği yüklenir. Sayfayı görüntülemen, Pro bölümüne bakman ve satın alma düğmesine basman Meta'ya bildirilir; tarayıcına _fbp ve reklamdan geldiysen _fbc çerezi yazılır (90 gün). Satın alırsan sipariş tutarı, bu çerez değerleri, tarayıcı bilgin ve e-postanın geri döndürülemez özeti (SHA-256) Meta'ya iletilir. Reddedersen site aynı şekilde çalışır. Tercihini sayfanın altındaki \"Çerez tercihleri\" bağlantısından istediğin an değiştirebilirsin.",
    red: "Reddet", kabul: "Kabul et",
    simdi: "Şu anki tercihin: ", kabulEdildi: "kabul", reddedildi: "ret"
  };

  var STIL = [
    ".olc{position:fixed;left:16px;right:16px;bottom:16px;bottom:max(16px,env(safe-area-inset-bottom));z-index:9000;",
    "box-sizing:border-box;max-width:780px;margin:0 auto;padding:14px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;",
    "background:#0f0f12;border:1px solid #26262e;border-radius:14px;box-shadow:0 20px 50px -24px rgba(0,0,0,.9);",
    "color:#a3a3ad;font-family:inherit;font-size:13.5px;font-weight:500;line-height:1.5;letter-spacing:0;text-align:left;",
    "animation:olcGel .28s cubic-bezier(.16,1,.3,1)}",
    ".olc:focus{outline:none}",
    ".olc p{margin:0;padding:0;max-width:none;color:inherit;font:inherit;letter-spacing:0}",
    ".olc .olc-m{flex:1 1 340px;min-width:0}",
    ".olc .olc-d{display:flex;gap:8px;margin-left:auto;flex:0 0 auto}",
    ".olc button{font-family:inherit;font-size:13px;font-weight:700;line-height:1.2;letter-spacing:0;cursor:pointer;border-radius:999px;",
    "padding:9px 16px;border:1px solid #33333d;background:transparent;color:#f4f4f7;min-height:36px}",
    ".olc button:hover{border-color:#55555f}",
    ".olc button:focus-visible{outline:2px solid #8b7cf6;outline-offset:2px}",
    ".olc .olc-k{background:#f4f4f7;border-color:#f4f4f7;color:#0a0a0c}",
    ".olc .olc-k:hover{background:#fff;border-color:#fff}",
    ".olc .olc-a{min-height:0;padding:0;border:0;border-radius:4px;background:none;color:#b6aaff;font-weight:600;",
    "text-decoration:underline;text-underline-offset:3px;margin-left:6px}",
    ".olc .olc-ayr{flex:1 1 100%;font-size:12.5px;color:#8a8a96;border-top:1px solid #1c1c22;padding-top:10px}",
    ".olc .olc-s{flex:1 1 100%;font-size:12px;color:#70707c}",
    ".olc [hidden]{display:none!important}",
    "[data-olcum-ac]{cursor:pointer;text-decoration:underline;text-underline-offset:3px}",
    "@keyframes olcGel{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}",
    "@media(max-width:560px){.olc{left:10px;right:10px;bottom:10px;bottom:max(10px,env(safe-area-inset-bottom));padding:13px 14px}",
    ".olc-d{width:100%}.olc-d button{flex:1 1 0}}",
    "@media(prefers-reduced-motion:reduce){.olc{animation:none}}"
  ].join("");

  /* ---------------- izin kaydı (yalnız yanıtın kendisi saklanır) ---------------- */
  function depoOku() { try { return w.localStorage.getItem(ANAHTAR); } catch (e) { return null; } }
  function depoYaz(v) { try { w.localStorage.setItem(ANAHTAR, v); } catch (e) {} }
  function izinOku() {
    var o = null;
    try { o = JSON.parse(depoOku() || "null"); } catch (e) { o = null; }
    if (!o || o.v !== SURUM || (o.d !== "kabul" && o.d !== "red")) return "";
    var yas = Date.now() - Number(o.t);
    if (!(yas < IZIN_OMRU && yas > -864e5)) return "";
    return o.d;
  }
  var secim = izinOku();
  function izinYaz(deger) {
    secim = deger;
    depoYaz(JSON.stringify({ v: SURUM, d: deger, t: Date.now() }));
  }

  /* ---------------- çerezler (yalnız kabulden sonra dokunulur) ---------------- */
  function cerezOku(ad) {
    var p = ("; " + String(d.cookie || "")).split("; " + ad + "=");
    return p.length > 1 ? p[p.length - 1].split(";")[0] : "";
  }
  // Meta pikseli çerezlerini ana alan adına (.suflo.app) yazar; aynısını kullan ki çift çerez oluşmasın
  function alanAdi() { return /(^|\.)suflo\.app$/i.test(String(w.location.hostname || "")) ? "; domain=.suflo.app" : ""; }
  function cerezYaz(ad, deger, saniye) {
    d.cookie = ad + "=" + deger + "; path=/" + alanAdi() + "; max-age=" + saniye + "; SameSite=Lax" +
      (w.location.protocol === "https:" ? "; Secure" : "");
  }
  function cerezSil(ad) {
    d.cookie = ad + "=; path=/; max-age=0; SameSite=Lax";
    if (alanAdi()) d.cookie = ad + "=; path=/" + alanAdi() + "; max-age=0; SameSite=Lax";
  }
  function param(ad) {
    var m = new RegExp("[?&]" + ad + "=([^&#]*)").exec(String(w.location.search || ""));
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch (e) { return ""; }
  }
  // _fbc yoksa (ya da başka bir reklam tıklamasına aitse) URL'deki fbclid'den kurulur.
  // Biçim Meta'nın belgelediği gibi: fb.<alan düzeyi>.<ms>.<fbclid>; tıklama kimliğine dokunulmaz.
  function fbcAl() {
    var tik = param("fbclid"), mevcut = cerezOku("_fbc");
    if (TIK.test(tik) && (!FBC.test(mevcut) || mevcut.split(".").slice(3).join(".") !== tik)) {
      mevcut = "fb.1." + Date.now() + "." + tik;
      cerezYaz("_fbc", mevcut, CEREZ_OMRU);
    }
    return FBC.test(mevcut) ? mevcut : "";
  }
  function fbpAl() { var v = cerezOku("_fbp"); return FBP.test(v) ? v : ""; }
  function tarayici() {
    var s = "";
    try { s = String(w.navigator.userAgent || ""); } catch (e) { s = ""; }
    return s.replace(/[^\x20-\x7e]/g, "").slice(0, 300);
  }
  function kimlik() {
    try { if (w.crypto && typeof w.crypto.randomUUID === "function") return w.crypto.randomUUID(); } catch (e) {}
    var s = "";
    try {
      var a = new Uint32Array(4);
      w.crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) s += a[i].toString(36);
    } catch (e2) {
      s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    return (Date.now().toString(36) + "-" + s).slice(0, 48);
  }

  /* ---------------- Meta pikseli ---------------- */
  var yuklendi = false, durduruldu = false;
  function urun(ek) {
    var o = { content_ids: ["suflo-pro"], content_name: "Suflo Pro", content_type: "product", value: FIYAT, currency: PARA };
    if (ek) for (var k in ek) if (Object.prototype.hasOwnProperty.call(ek, k)) o[k] = ek[k];
    return o;
  }
  function olay(ad, veri, kim) {
    var k = kim || kimlik();
    if (typeof w.fbq === "function") w.fbq("track", ad, veri || {}, { eventID: k });
    return k;
  }
  function pikselYukle() {
    if (yuklendi) {
      if (durduruldu && typeof w.fbq === "function") { w.fbq("consent", "grant"); durduruldu = false; }
      return;
    }
    yuklendi = true;
    if (!w.fbq) {
      // Meta'nın standart kuyruğu: betik inene kadar çağrılar burada bekler
      var n = w.fbq = function () { if (n.callMethod) n.callMethod.apply(n, arguments); else n.queue.push(arguments); };
      if (!w._fbq) w._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    }
    if (CANLI) {
      var s = d.createElement("script");
      s.async = true;
      s.src = KAYNAK;
      (d.head || d.documentElement).appendChild(s);
    }
    // autoConfig kapalı: düğme tıklamaları ve sayfa üstverisi kendiliğinden gönderilmez;
    // Meta'ya yalnız şeritte söylenen üç olay gider
    w.fbq("set", "autoConfig", false, PIKSEL);
    w.fbq("init", PIKSEL);
    olay("PageView");
  }

  /* ---------------- Pro bölümü görüldü mü (ViewContent, sayfa başına bir kez) ---------------- */
  var proGoruldu = false, proZaman = null;
  var PRO_SAYFASI = /^\/en\/pro(\.html)?\/?$/i.test(String(w.location.pathname || ""));
  function proKontrol() {
    if (proGoruldu || secim !== "kabul") return;
    var gorunur = PRO_SAYFASI;
    if (!gorunur) {
      var vh = w.innerHeight || d.documentElement.clientHeight || 0;
      var l = d.querySelectorAll("#pro, #fiyat, #pricing");
      for (var i = 0; i < l.length && !gorunur; i++) {
        var r = l[i].getBoundingClientRect();
        if ((r.width || r.height) && r.top < vh * 0.75 && r.bottom > vh * 0.25) gorunur = true;
      }
    }
    if (!gorunur) return;
    proGoruldu = true;
    olay("ViewContent", urun());
  }
  // IntersectionObserver bazı ortamlarda geri çağırmıyor (ana sayfadaki not): ölçüm kaydırmada yapılır
  function proPlanla() {
    if (proGoruldu || proZaman !== null || secim !== "kabul") return;
    proZaman = w.setTimeout(function () { proZaman = null; proKontrol(); }, 200);
  }

  /* ---------------- ödeme bağlantıları (atıf köprüsü) ---------------- */
  function koy(url, ad, deger) {
    var s = String(url || ""), hash = "", h = s.indexOf("#");
    if (h !== -1) { hash = s.slice(h); s = s.slice(0, h); }
    var q = s.indexOf("?"), taban = q === -1 ? s : s.slice(0, q), hedef = decodeURIComponent(ad);
    var parca = (q === -1 ? [] : s.slice(q + 1).split("&")).filter(function (p) {
      if (!p) return false;
      var k = p.split("=")[0];
      try { k = decodeURIComponent(k); } catch (e) {}
      return k !== hedef;
    });
    if (deger) parca.push(ad + "=" + encodeURIComponent(deger));
    return taban + (parca.length ? "?" + parca.join("&") : "") + hash;
  }
  function deger(url, ad) {
    var s = String(url || "").split("#")[0], q = s.indexOf("?"), hedef = decodeURIComponent(ad);
    if (q === -1) return "";
    var l = s.slice(q + 1).split("&");
    for (var i = 0; i < l.length; i++) {
      var kv = l[i].split("="), k = kv[0];
      try { k = decodeURIComponent(k); } catch (e) {}
      if (k === hedef) { try { return decodeURIComponent(kv.slice(1).join("=")); } catch (e2) { return ""; } }
    }
    return "";
  }
  function odemeBaglantisi(t) {
    while (t && t.nodeType === 1) {
      if (String(t.tagName || "").toUpperCase() === "A" && LS.test(t.getAttribute("href") || "")) return t;
      t = t.parentNode;
    }
    return null;
  }
  // İzin varsa alanları ekler/tazeler, yoksa (ret, geri çekme) bizim eklediklerimizi söker.
  // source / feature / app_version / ref / discount_code alanlarına dokunmaz.
  function isle(a, yeniKimlik) {
    var href = a.getAttribute("href") || "";
    if (!LS.test(href)) return "";
    var k = "";
    if (secim === "kabul") {
      k = yeniKimlik ? kimlik() : (deger(href, ALAN.kimlik) || kimlik());
      href = koy(href, ALAN.kimlik, k);
      href = koy(href, ALAN.fbc, fbcAl());
      href = koy(href, ALAN.fbp, fbpAl());
      href = koy(href, ALAN.ua, tarayici());
    } else {
      href = koy(href, ALAN.kimlik, "");
      href = koy(href, ALAN.fbc, "");
      href = koy(href, ALAN.fbp, "");
      href = koy(href, ALAN.ua, "");
    }
    if (href !== a.getAttribute("href")) a.setAttribute("href", href);
    return k;
  }
  function hepsi() {
    var l = d.querySelectorAll("a.lemonsqueezy-button");
    for (var i = 0; i < l.length; i++) isle(l[i], false);
  }

  /* ---------------- onay şeridi ---------------- */
  var serit = null;
  function el(etiket, sinif, metin) {
    var e = d.createElement(etiket);
    if (sinif) e.className = sinif;
    if (metin) e.textContent = metin;
    return e;
  }
  function seritKapat() {
    if (serit && serit.parentNode) serit.parentNode.removeChild(serit);
    serit = null;
  }
  function seritGoster(odakla) {
    if (!d.body) return;
    if (serit) { if (odakla) serit.focus(); return; }
    if (!d.getElementById("olcum-stil")) {
      var st = d.createElement("style");
      st.id = "olcum-stil";
      st.textContent = STIL;
      (d.head || d.documentElement).appendChild(st);
    }
    serit = el("div", "olc");
    serit.id = "olcum-serit";
    serit.setAttribute("role", "region");
    serit.setAttribute("aria-label", M.baslik);
    serit.setAttribute("lang", EN ? "en" : "tr");
    serit.setAttribute("tabindex", "-1");

    var metin = el("p", "olc-m", M.metin);
    var ayr = el("button", "olc-a", M.ayrinti);
    ayr.setAttribute("type", "button");
    ayr.setAttribute("aria-expanded", "false");
    ayr.setAttribute("aria-controls", "olcum-ayrinti");
    metin.appendChild(ayr);

    var dugmeler = el("div", "olc-d");
    var red = el("button", "olc-r", M.red), kab = el("button", "olc-k", M.kabul);
    red.setAttribute("type", "button");
    kab.setAttribute("type", "button");
    dugmeler.appendChild(red);
    dugmeler.appendChild(kab);

    var ayrinti = el("p", "olc-ayr", M.ayrintiMetni);
    ayrinti.id = "olcum-ayrinti";
    ayrinti.hidden = true;

    serit.appendChild(metin);
    serit.appendChild(dugmeler);
    if (secim) serit.appendChild(el("p", "olc-s", M.simdi + (secim === "kabul" ? M.kabulEdildi : M.reddedildi)));
    serit.appendChild(ayrinti);

    ayr.addEventListener("click", function () {
      ayrinti.hidden = !ayrinti.hidden;
      ayr.setAttribute("aria-expanded", ayrinti.hidden ? "false" : "true");
    });
    red.addEventListener("click", reddet);
    kab.addEventListener("click", kabulEt);
    d.body.appendChild(serit);
    if (odakla) serit.focus();
  }

  /* ---------------- kabul / ret ---------------- */
  function basla() {
    fbcAl();
    pikselYukle();
    hepsi();
    proKontrol();
  }
  function kabulEt() {
    izinYaz("kabul");
    seritKapat();
    basla();
  }
  function reddet() {
    var onceki = secim;
    izinYaz("red");
    seritKapat();
    if (yuklendi && !durduruldu && typeof w.fbq === "function") { w.fbq("consent", "revoke"); durduruldu = true; }
    // Onay geri çekildiyse bizim ve pikselin yazdığı çerezler silinir, bağlantılar eski hâline döner
    if (onceki === "kabul" || yuklendi) { cerezSil("_fbc"); cerezSil("_fbp"); }
    hepsi();
  }

  /* ---------------- olaylar ---------------- */
  // lemon.js adresi tıklama anında okur (e.currentTarget.href); yakalama aşaması ondan önce çalışır
  d.addEventListener("click", function (e) {
    var t = e.target;
    while (t && t.nodeType === 1 && !(t.hasAttribute && t.hasAttribute("data-olcum-ac"))) t = t.parentNode;
    if (t && t.nodeType === 1) {
      if (e.preventDefault) e.preventDefault();
      seritGoster(true);
      return;
    }
    var a = odemeBaglantisi(e.target);
    if (!a) return;
    var k = isle(a, true);
    if (k) olay("InitiateCheckout", urun({ num_items: 1 }), k);
  }, true);
  // Orta tık / "yeni sekmede aç" click olayı üretmez: basış anında alanlar tazelenir (olay gönderilmez)
  d.addEventListener("pointerdown", function (e) {
    var a = odemeBaglantisi(e.target);
    if (a) isle(a, false);
  }, true);
  w.addEventListener("scroll", proPlanla, { passive: true });
  w.addEventListener("resize", proPlanla);
  w.addEventListener("load", proPlanla);

  function ilk() {
    if (secim === "kabul") basla();
    else if (secim === "") seritGoster(false);
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", ilk);
  else ilk();

  w.SufloOlcum = {
    izin: function () { return secim; },
    ac: function () { seritGoster(true); },
    canli: CANLI
  };
})();
