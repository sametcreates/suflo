/*
 * suflo.app ölçüm izni + Meta pikseli + ödeme atıf köprüsü (docs/js/olcum.js).
 * Sahte DOM ile vm'de çalıştırılır; hiçbir ağ isteği yapılmaz.
 *  - izin verilmeden: Meta betiği istenmez, fbq yok, çerez yazılmaz, ödeme bağlantısı değişmez
 *  - ret: yalnız yanıt saklanır; sonraki ziyarette şerit de piksel de yok
 *  - kabul: fbevents.js bir kez istenir; PageView / ViewContent / InitiateCheckout doğru
 *    parametre ve eventID ile çağrılır; _fbc URL'deki fbclid'den kurulur; ödeme bağlantısına
 *    checkout[custom][event_id|fbc|fbp|ua] eklenir, var olan alanlar korunur
 *  - geri çekme: consent revoke, çerezler silinir, bağlantılar eski hâline döner
 *  - sayfalar: betik yalnız satın alma sayfalarında; sıkı CSP'li paylaşım sayfalarında yok
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var ROOT = path.join(__dirname, "..");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) {
  if (k) gecen++; else kalan++;
  console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 400) + "]" : ""));
}
function oku(p) { return fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); }

var KOD = oku("docs/js/olcum.js");
var PIKSEL = "1084974704080878";
var META = "https://connect.facebook.net/en_US/fbevents.js";
var SIMDI = 1795000000000;
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
var FBCLID = "IwY2xjawN1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-AbC";

var trHtml = oku("docs/index.html");
var GERCEK = Array.from(trHtml.matchAll(/href="(https:\/\/suflo\.lemonsqueezy\.com\/checkout\/[^"]+)"/g)).map(function (m) { return m[1].replace(/&amp;/g, "&"); });
// app_version her sürümde değişir: beklenen değer bağlantının kendisinden okunur
var SURUM = decodeURIComponent((/app_version%5D=([^&]+)/.exec(GERCEK[0] || "") || [])[1] || "");
ok("ödeme bağlantısı sürüm taşıyor", /^\d+\.\d+\.\d+$/.test(SURUM), SURUM);
ok("ana sayfada iki ödeme bağlantısı var (fiyat + kapanış)", GERCEK.length === 2 && /feature%5D=pricing/.test(GERCEK[0]) && /feature%5D=footer/.test(GERCEK[1]), GERCEK.join(" | "));

/* ---------------- sahte DOM ---------------- */
function Eleman(tag) {
  this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.attrs = {}; this.children = []; this.parentNode = null;
  this.dinleyici = {}; this.className = ""; this.textContent = ""; this.hidden = false; this.id = ""; this.odak = 0;
  this.rect = { top: 5000, bottom: 5600, width: 800, height: 600 };
  var kendi = this;
  this.classList = { contains: function (c) { return (" " + kendi.className + " ").indexOf(" " + c + " ") !== -1; } };
}
Eleman.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
Eleman.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
Eleman.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };
Eleman.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
Eleman.prototype.removeChild = function (c) { var i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); c.parentNode = null; return c; };
Eleman.prototype.addEventListener = function (t, f) { (this.dinleyici[t] = this.dinleyici[t] || []).push(f); };
Eleman.prototype.focus = function () { this.odak++; };
Eleman.prototype.getBoundingClientRect = function () { return this.rect; };
Eleman.prototype.tikla = function () { var b = this; (this.dinleyici.click || []).forEach(function (f) { f({ target: b, preventDefault: function () {} }); }); };
function agac(kok, kosul, cikti) {
  cikti = cikti || [];
  kok.children.forEach(function (c) { if (kosul(c)) cikti.push(c); agac(c, kosul, cikti); });
  return cikti;
}
function tumMetin(e) { return e.textContent + e.children.map(tumMetin).join(" "); }

function ortam(sec) {
  sec = sec || {};
  var depo = sec.depo || {}, cerezler = sec.cerezler || {}, cerezYazimlari = [], zamanlayici = [], yaratilan = [], ag = [];
  var sayac = 0;
  var html = new Eleman("html"), head = new Eleman("head"), body = new Eleman("body");
  html.setAttribute("lang", sec.lang || "tr");
  var linkler = (sec.linkler || GERCEK).map(function (h) { var a = new Eleman("a"); a.setAttribute("href", h); a.className = "btn lemonsqueezy-button"; return a; });
  var baska = new Eleman("a"); baska.setAttribute("href", "https://github.com/sametcreates/suflo/releases/latest"); baska.className = "btn";
  var sahte = new Eleman("a"); sahte.setAttribute("href", "https://evil.example/checkout/buy/x?a=1"); sahte.className = "btn lemonsqueezy-button";
  var icSpan = new Eleman("span"); linkler[0].appendChild(icSpan);
  var bolumler = (sec.bolumler || ["pro", "fiyat"]).map(function (id) { var s = new Eleman("section"); s.id = id; return s; });
  var tercih = new Eleman("a"); tercih.setAttribute("href", "#cerez-tercihleri"); tercih.setAttribute("data-olcum-ac", "");
  var bilgiB = new Eleman("b"), bilgi = new Eleman("p"); bilgi.hidden = true; bilgi.id = "davet-bilgi";
  bilgi.querySelector = function () { return bilgiB; };
  var belgeDinleyici = {}, pencereDinleyici = {};
  var doc = {
    readyState: "complete", documentElement: html, head: head, body: body,
    createElement: function (t) { var e = new Eleman(t); yaratilan.push(e); return e; },
    getElementById: function (id) {
      if (id === "davet-bilgi") return bilgi;
      return agac(head, function (e) { return e.id === id; }).concat(agac(body, function (e) { return e.id === id; }))[0] || null;
    },
    querySelectorAll: function (s) {
      if (s === "a.lemonsqueezy-button") return linkler.concat([sahte]);
      if (s === "#pro, #fiyat, #pricing") return bolumler;
      return [];
    },
    addEventListener: function (t, f, yakala) { (belgeDinleyici[t] = belgeDinleyici[t] || []).push({ f: f, yakala: yakala === true }); }
  };
  Object.defineProperty(doc, "cookie", {
    get: function () { return Object.keys(cerezler).map(function (k) { return k + "=" + cerezler[k]; }).join("; "); },
    set: function (v) {
      cerezYazimlari.push(String(v));
      var p = String(v).split(";").map(function (x) { return x.trim(); });
      var i = p[0].indexOf("="), ad = p[0].slice(0, i), dgr = p[0].slice(i + 1), omur = null;
      p.slice(1).forEach(function (x) { var m = /^max-age=(-?\d+)$/i.exec(x); if (m) omur = Number(m[1]); });
      if (omur !== null && omur <= 0) delete cerezler[ad]; else cerezler[ad] = dgr;
    }
  });
  var win = {
    localStorage: {
      getItem: function (k) { if (sec.depoHata) throw new Error("engelli"); return Object.prototype.hasOwnProperty.call(depo, k) ? depo[k] : null; },
      setItem: function (k, v) { if (sec.depoHata) throw new Error("engelli"); depo[k] = String(v); }
    },
    location: { hostname: sec.host || "suflo.app", protocol: sec.protokol || "https:", search: sec.search || "", pathname: sec.yol || "/" },
    navigator: { userAgent: sec.ua || UA, sendBeacon: function (u) { ag.push("beacon " + u); return true; } },
    crypto: { randomUUID: function () { sayac++; return "00000000-0000-4000-8000-" + ("000000000000" + sayac).slice(-12); } },
    innerHeight: 800,
    setTimeout: function (f) { zamanlayici.push(f); return zamanlayici.length; },
    addEventListener: function (t, f) { (pencereDinleyici[t] = pencereDinleyici[t] || []).push(f); }
  };
  var ctx = {
    window: win, document: doc, Date: { now: function () { return sec.simdi || SIMDI; } },
    fetch: function (u) { ag.push("fetch " + u); }, XMLHttpRequest: function () { ag.push("xhr"); }, Image: function () { ag.push("image"); }
  };
  vm.createContext(ctx);
  if (sec.once) vm.runInContext(sec.once, ctx);
  vm.runInContext(KOD, ctx);
  var o = {
    win: win, doc: doc, head: head, body: body, depo: depo, cerezler: cerezler, cerezYazimlari: cerezYazimlari, linkler: linkler, baska: baska,
    sahte: sahte, icSpan: icSpan, bolumler: bolumler, tercih: tercih, yaratilan: yaratilan, ag: ag, bilgi: bilgi, bilgiB: bilgiB,
    serit: function () { return agac(body, function (e) { return e.id === "olcum-serit"; })[0] || null; },
    dugme: function (sinif) { var s = o.serit(); return s ? agac(s, function (e) { return e.classList.contains(sinif); })[0] || null : null; },
    metaBetikleri: function () { return agac(head, function (e) { return e.tagName === "SCRIPT"; }).concat(agac(body, function (e) { return e.tagName === "SCRIPT"; })); },
    kuyruk: function () { return win.fbq && win.fbq.queue ? win.fbq.queue.map(function (a) { return Array.prototype.slice.call(a); }) : []; },
    olaylar: function (ad) { return o.kuyruk().filter(function (a) { return a[0] === "track" && a[1] === ad; }); },
    belge: function (tur, hedef) {
      var onlendi = false, olay = { target: hedef, preventDefault: function () { onlendi = true; } };
      (belgeDinleyici[tur] || []).forEach(function (d) { d.f(olay); });
      return onlendi;
    },
    belgeYakalama: function (tur) { return (belgeDinleyici[tur] || []).every(function (d) { return d.yakala; }); },
    pencere: function (tur) { (pencereDinleyici[tur] || []).forEach(function (f) { f({}); }); },
    ileri: function () { var l = zamanlayici.splice(0); l.forEach(function (f) { f(); }); return l.length; },
    izin: function () { try { return JSON.parse(depo.suflo_olcum_izni).d; } catch (e) { return ""; } }
  };
  return o;
}
function q(href) {
  var s = String(href).split("#")[0], i = s.indexOf("?"), o = {};
  if (i === -1) return o;
  s.slice(i + 1).split("&").forEach(function (p) { var kv = p.split("="); o[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join("=")); });
  return o;
}
function anahtarlar(href) { return String(href).split("?")[1].split("&").map(function (p) { return decodeURIComponent(p.split("=")[0]); }); }
var K = { e: "checkout[custom][event_id]", c: "checkout[custom][fbc]", c2: "checkout[custom][fbc2]", p: "checkout[custom][fbp]", u: "checkout[custom][ua]", u2: "checkout[custom][ua2]",
  s: "checkout[custom][source]", f: "checkout[custom][feature]", v: "checkout[custom][app_version]" };
function bizimAlanYok(href) { var p = q(href); return !(K.e in p) && !(K.c in p) && !(K.c2 in p) && !(K.p in p) && !(K.u in p) && !(K.u2 in p); }
// Lemon Squeezy 255 karakterden uzun özel alanda ödeme sayfasını HTTP 422 ile reddeder
function enUzunOzel(href) { var p = q(href), m = 0; Object.keys(p).forEach(function (k) { if (/^checkout\[custom\]/.test(k)) m = Math.max(m, p[k].length); }); return m; }

/* ---------------- 1) izin verilmeden hiçbir şey yüklenmez ---------------- */
var a = ortam({ search: "?fbclid=" + FBCLID });
ok("ilk ziyaret: onay şeridi gösterilir", !!a.serit() && a.serit().getAttribute("role") === "region" && a.serit().getAttribute("lang") === "tr");
ok("şerit engellemez: odak çalınmaz, iletişim kutusu değildir", a.serit().odak === 0 && a.serit().getAttribute("role") !== "dialog" && a.serit().getAttribute("aria-modal") === null);
ok("şeritte Reddet ve Kabul et düğmeleri var (ikisi de gerçek düğme)", a.dugme("olc-r") && a.dugme("olc-k") && a.dugme("olc-r").tagName === "BUTTON" &&
  a.dugme("olc-k").tagName === "BUTTON" && a.dugme("olc-r").textContent === "Reddet" && a.dugme("olc-k").textContent === "Kabul et");
ok("izinsiz: Meta betiği istenmez (script/img/iframe yaratılmaz)", a.metaBetikleri().length === 0 &&
  a.yaratilan.every(function (e) { return ["SCRIPT", "IMG", "IFRAME"].indexOf(e.tagName) === -1; }), a.yaratilan.map(function (e) { return e.tagName; }).join(","));
ok("izinsiz: fbq tanımlanmaz, ağ isteği yok", a.win.fbq === undefined && a.win._fbq === undefined && a.ag.length === 0, a.ag.join(","));
ok("izinsiz: çerez yazılmaz (URL'de fbclid olsa da), depoya bir şey yazılmaz", a.cerezYazimlari.length === 0 && Object.keys(a.depo).length === 0, a.cerezYazimlari.join(" | "));
ok("izinsiz: ödeme bağlantıları değişmez", a.linkler[0].getAttribute("href") === GERCEK[0] && a.linkler[1].getAttribute("href") === GERCEK[1]);
a.belge("pointerdown", a.linkler[0]);
a.belge("click", a.linkler[0]);
a.pencere("scroll"); a.pencere("load"); a.ileri();
ok("izinsiz: satın al tıklaması da bir şey eklemez, olay göndermez", a.linkler[0].getAttribute("href") === GERCEK[0] && a.win.fbq === undefined &&
  a.cerezYazimlari.length === 0 && a.metaBetikleri().length === 0);
ok("tıklama dinleyicileri yakalama aşamasında (lemon.js'ten önce)", a.belgeYakalama("click") && a.belgeYakalama("pointerdown"));
ok("Ayrıntı düğmesi açıklamayı açar: Meta pikseli, çerez adları, süre ve e-posta özeti anlatılır", (function () {
  var ayr = a.dugme("olc-a"), det = a.dugme("olc-ayr");
  if (!ayr || !det || det.hidden !== true || ayr.getAttribute("aria-expanded") !== "false") return false;
  ayr.tikla();
  var acik = det.hidden === false && ayr.getAttribute("aria-expanded") === "true";
  return acik && /Meta pikseli/.test(det.textContent) && /Facebook\/Instagram/.test(det.textContent) && /_fbp/.test(det.textContent) && /_fbc/.test(det.textContent) && /90 gün/.test(det.textContent) && /SHA-256/.test(det.textContent) && /Çerez tercihleri/.test(det.textContent);
})());

/* ---------------- 2) ret ---------------- */
a.dugme("olc-r").tikla();
ok("ret: yanıt saklanır, şerit kapanır", a.izin() === "red" && a.serit() === null);
ok("ret: Meta betiği, fbq, çerez yok; bağlantılar aynı", a.metaBetikleri().length === 0 && a.win.fbq === undefined && a.cerezYazimlari.length === 0 &&
  a.linkler[0].getAttribute("href") === GERCEK[0] && a.ag.length === 0);
var a2 = ortam({ depo: a.depo, search: "?fbclid=" + FBCLID });
a2.belge("click", a2.linkler[0]); a2.pencere("scroll"); a2.ileri();
ok("ret sonraki ziyarette hatırlanır: şerit yok, piksel yok, çerez yok, bağlantı aynı", a2.serit() === null && a2.metaBetikleri().length === 0 &&
  a2.win.fbq === undefined && a2.cerezYazimlari.length === 0 && a2.linkler[0].getAttribute("href") === GERCEK[0]);
ok("ret edenin deposunda yalnız yanıt var", JSON.stringify(Object.keys(a2.depo)) === '["suflo_olcum_izni"]' && Object.keys(JSON.parse(a2.depo.suflo_olcum_izni)).sort().join(",") === "d,t,v");

/* ---------------- 3) kabul: piksel, _fbc, bağlantılar ---------------- */
var b = ortam({ search: "?utm_source=ig&fbclid=" + FBCLID });
b.dugme("olc-k").tikla();
ok("kabul: yanıt saklanır, şerit kapanır", b.izin() === "kabul" && b.serit() === null);
var betik = b.metaBetikleri();
ok("kabul: fbevents.js tam bir kez, async istenir", betik.length === 1 && betik[0].src === META && betik[0].async === true, betik.map(function (s) { return s.src; }).join(","));
var kq = b.kuyruk();
ok("kabul: autoConfig kapatılır, piksel başlatılır, PageView gider (bu sırayla)", kq.length === 3 &&
  JSON.stringify(kq[0]) === JSON.stringify(["set", "autoConfig", false, PIKSEL]) && JSON.stringify(kq[1]) === JSON.stringify(["init", PIKSEL]) &&
  kq[2][0] === "track" && kq[2][1] === "PageView" && /^[A-Za-z0-9._-]{8,64}$/.test(kq[2][3].eventID), JSON.stringify(kq));
ok("kabul: _fbc URL'deki fbclid'den kurulur (fb.1.<ms>.<fbclid>, büyük/küçük harf korunur)", b.cerezler._fbc === "fb.1." + SIMDI + "." + FBCLID, b.cerezler._fbc);
var fbcYazimi = b.cerezYazimlari.filter(function (c) { return /^_fbc=/.test(c); })[0] || "";
ok("_fbc: 90 gün, path=/, .suflo.app, SameSite=Lax, Secure", /max-age=7776000/.test(fbcYazimi) && /path=\//.test(fbcYazimi) && /domain=\.suflo\.app/.test(fbcYazimi) &&
  /SameSite=Lax/.test(fbcYazimi) && /; Secure/.test(fbcYazimi), fbcYazimi);
ok("_fbp'yi biz yazmayız (pikselin işi)", b.cerezYazimlari.every(function (c) { return !/^_fbp=/.test(c); }));
var p0 = q(b.linkler[0].getAttribute("href"));
ok("kabul anında ödeme bağlantıları hazırlanır: event_id + fbc + ua", /^[A-Za-z0-9._-]{8,64}$/.test(p0[K.e]) && p0[K.c] === b.cerezler._fbc && p0[K.u] === UA && !(K.p in p0), b.linkler[0].getAttribute("href"));
ok("var olan source / feature / app_version alanları ve sıraları korunur", p0[K.s] === "suflo_website" && p0[K.f] === "pricing" && p0[K.v] === SURUM &&
  JSON.stringify(anahtarlar(b.linkler[0].getAttribute("href")).slice(0, 3)) === JSON.stringify([K.s, K.f, K.v]) &&
  b.linkler[0].getAttribute("href").indexOf(GERCEK[0]) === 0, b.linkler[0].getAttribute("href"));
ok("ikinci düğme de hazırlanır, kendi feature değeriyle", q(b.linkler[1].getAttribute("href"))[K.f] === "footer" && !!q(b.linkler[1].getAttribute("href"))[K.e]);
ok("Lemon Squeezy olmayan adres ve başka bağlantılar değişmez", b.sahte.getAttribute("href") === "https://evil.example/checkout/buy/x?a=1" &&
  b.baska.getAttribute("href") === "https://github.com/sametcreates/suflo/releases/latest");

// piksel _fbp çerezini kendi yazar; tıklamada bağlantıya eklenir
b.cerezler._fbp = "fb.1." + (SIMDI + 900) + ".1234567890";
var onceki = q(b.linkler[0].getAttribute("href"))[K.e];
b.belge("pointerdown", b.icSpan);
ok("basışta (orta tık / yeni sekme dahil) alanlar tazelenir, olay gönderilmez, event_id aynı kalır", q(b.linkler[0].getAttribute("href"))[K.p] === b.cerezler._fbp &&
  q(b.linkler[0].getAttribute("href"))[K.e] === onceki && b.olaylar("InitiateCheckout").length === 0);
b.belge("click", b.icSpan);   // düğmenin içindeki öğeye tıklama
var p1 = q(b.linkler[0].getAttribute("href")), ic = b.olaylar("InitiateCheckout");
ok("satın al tıklaması: InitiateCheckout, değer 749 TRY", ic.length === 1 && ic[0][2].value === 749 && ic[0][2].currency === "TRY" &&
  JSON.stringify(ic[0][2].content_ids) === '["suflo-pro"]' && ic[0][2].content_type === "product" && ic[0][2].num_items === 1, JSON.stringify(ic));
ok("InitiateCheckout eventID = bağlantıdaki checkout[custom][event_id] (her tıklamada yeni)", ic[0][3].eventID === p1[K.e] && p1[K.e] !== onceki, p1[K.e] + " / " + onceki);
ok("tıklamada fbc + fbp + ua birlikte gider", p1[K.c] === b.cerezler._fbc && p1[K.p] === "fb.1." + (SIMDI + 900) + ".1234567890" && p1[K.u] === UA);
b.belge("click", b.linkler[0]);
var p2 = q(b.linkler[0].getAttribute("href")), href2 = b.linkler[0].getAttribute("href");
ok("ikinci tıklama: alanlar çoğalmaz, yeni event_id, ikinci InitiateCheckout", (href2.match(/event_id/g) || []).length === 1 && (href2.match(/%5Bfbc%5D/g) || []).length === 1 &&
  (href2.match(/%5Bua%5D/g) || []).length === 1 && p2[K.e] !== p1[K.e] && b.olaylar("InitiateCheckout").length === 2 && b.olaylar("InitiateCheckout")[1][3].eventID === p2[K.e], href2);
b.belge("click", b.baska);
b.belge("click", b.sahte);
ok("başka bağlantıya tıklama InitiateCheckout göndermez", b.olaylar("InitiateCheckout").length === 2);
ok("olay kimlikleri birbirinden farklı", (function () {
  var l = b.kuyruk().filter(function (x) { return x[0] === "track"; }).map(function (x) { return x[3].eventID; });
  return l.length >= 3 && l.every(function (v, i) { return l.indexOf(v) === i; });
})());
ok("betik kendi başına ağ isteği yapmaz (fetch / XHR / beacon / Image yok)", b.ag.length === 0, b.ag.join(","));
ok("Meta betiği yine tek", b.metaBetikleri().length === 1);

/* ---------------- 4) ViewContent ---------------- */
ok("Pro bölümü ekranda değilken ViewContent gitmez", b.olaylar("ViewContent").length === 0);
b.pencere("scroll"); b.ileri();
ok("kaydırma sonrası da görünmüyorsa gitmez", b.olaylar("ViewContent").length === 0);
b.bolumler[0].rect = { top: 300, bottom: 1500, width: 800, height: 1200 };
b.pencere("scroll"); b.pencere("scroll");
ok("kaydırma seyreltilir (tek zamanlayıcı)", b.ileri() === 1);
var vc = b.olaylar("ViewContent");
ok("Pro bölümü görününce ViewContent: Suflo Pro, 749 TRY, eventID", vc.length === 1 && vc[0][2].content_name === "Suflo Pro" && vc[0][2].value === 749 && vc[0][2].currency === "TRY" &&
  JSON.stringify(vc[0][2].content_ids) === '["suflo-pro"]' && /^[A-Za-z0-9._-]{8,64}$/.test(vc[0][3].eventID), JSON.stringify(vc));
b.pencere("scroll"); b.ileri(); b.pencere("resize"); b.ileri();
ok("ViewContent sayfa başına bir kez", b.olaylar("ViewContent").length === 1);
var gizli = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) } });
gizli.bolumler[0].rect = { top: 0, bottom: 0, width: 0, height: 0 };
gizli.pencere("scroll"); gizli.ileri();
ok("gizli (boyutsuz) bölüm görülmüş sayılmaz", gizli.olaylar("ViewContent").length === 0);
var fiyatGor = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) } });
fiyatGor.bolumler[1].rect = { top: 100, bottom: 900, width: 800, height: 800 };
fiyatGor.pencere("load"); fiyatGor.ileri();
ok("#fiyat bölümü de ViewContent sayılır", fiyatGor.olaylar("ViewContent").length === 1);
var enPro = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) }, yol: "/en/pro", lang: "en", bolumler: ["pricing"] });
ok("/en/pro sayfası açılışta ViewContent gönderir", enPro.olaylar("ViewContent").length === 1 && enPro.olaylar("PageView").length === 1);
var enProHtml = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) }, yol: "/en/pro.html", lang: "en", bolumler: ["pricing"] });
ok("/en/pro.html de Pro sayfasıdır", enProHtml.olaylar("ViewContent").length === 1);

/* ---------------- 5) kayıtlı kabul: sonraki ziyaret ---------------- */
var c = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI - 20 * 864e5 }) }, cerezler: { _fbc: "fb.1.1790000000000.EskiTiklama_123", _fbp: "fb.1.1790000000001.987654321" } });
ok("kayıtlı kabul: şerit yok, piksel açılışta yüklenir", c.serit() === null && c.metaBetikleri().length === 1 && c.olaylar("PageView").length === 1);
ok("kayıtlı kabul, URL'de fbclid yok: var olan _fbc'ye dokunulmaz", c.cerezler._fbc === "fb.1.1790000000000.EskiTiklama_123" && c.cerezYazimlari.length === 0, c.cerezYazimlari.join("|"));
var pc = q(c.linkler[0].getAttribute("href"));
ok("kayıtlı kabul: bağlantılar çerezdeki fbc ve fbp ile hazırlanır", pc[K.c] === "fb.1.1790000000000.EskiTiklama_123" && pc[K.p] === "fb.1.1790000000001.987654321" && !!pc[K.e]);
var c2 = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) }, cerezler: { _fbc: "fb.1.1790000000000.EskiTiklama_123" }, search: "?fbclid=YeniTiklama_456" });
ok("yeni reklam tıklaması eski _fbc'nin yerini alır", c2.cerezler._fbc === "fb.1." + SIMDI + ".YeniTiklama_456");
var c3 = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) }, cerezler: { _fbc: "fb.1.1790000000000.AyniTiklama_789" }, search: "?fbclid=AyniTiklama_789" });
ok("aynı tıklamada _fbc'nin ilk zamanı korunur", c3.cerezler._fbc === "fb.1.1790000000000.AyniTiklama_789" && c3.cerezYazimlari.length === 0);
['?fbclid=kisa', '?fbclid=%3Cscript%3Ealert(1)%3C%2Fscript%3E', '?fbclid=a%20b%3Bc%3Dd_0123456', '?fbclid=%E0%A4%A'].forEach(function (s) {
  var x = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) }, search: s });
  ok("geçersiz fbclid çereze ve bağlantıya girmez: " + s, x.cerezler._fbc === undefined && !(K.c in q(x.linkler[0].getAttribute("href"))), x.cerezler._fbc);
});
var bozuk = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) }, cerezler: { _fbc: "bozuk;deger", _fbp: "fb.1.abc.def" } });
var pb = q(bozuk.linkler[0].getAttribute("href"));
ok("biçimi bozuk çerez değerleri bağlantıya eklenmez", !(K.c in pb) && !(K.p in pb) && !!pb[K.e] && pb[K.u] === UA);

/* ---------------- 6) süre, sürüm, depo hatası ---------------- */
var eski = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI - 366 * 864e5 }) } });
ok("bir yıldan eski yanıt geçersiz: yeniden sorulur, piksel yüklenmez", !!eski.serit() && eski.metaBetikleri().length === 0 && eski.win.fbq === undefined);
var surum = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 0, d: "kabul", t: SIMDI }) } });
ok("başka sürümün yanıtı geçersiz", !!surum.serit() && surum.win.fbq === undefined);
["{bozuk", JSON.stringify({ v: 1, d: "evet", t: SIMDI }), JSON.stringify({ v: 1, d: "kabul", t: SIMDI + 3 * 864e5 }), "null", JSON.stringify(["kabul"])].forEach(function (ham, i) {
  var x = ortam({ depo: { suflo_olcum_izni: ham } });
  ok("bozuk / tutarsız kayıt izin sayılmaz #" + (i + 1), !!x.serit() && x.win.fbq === undefined && x.metaBetikleri().length === 0);
});
var engel = ortam({ depoHata: true });
ok("localStorage engelliyken: şerit gösterilir, hata yok", !!engel.serit() && engel.win.fbq === undefined);
engel.dugme("olc-k").tikla();
ok("localStorage engelliyken kabul bu sayfada geçerli olur", engel.metaBetikleri().length === 1 && engel.olaylar("PageView").length === 1 && !!q(engel.linkler[0].getAttribute("href"))[K.e]);

/* ---------------- 7) izni geri çekme ---------------- */
var g = ortam({ depo: { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) }, cerezler: { _fbc: "fb.1.1790000000000.Tiklama_0001", _fbp: "fb.1.1790000000001.555", baska: "kalir" },
  linkler: [GERCEK[0] + "&checkout%5Bdiscount_code%5D=SFLAB2CD3&checkout%5Bcustom%5D%5Bref%5D=abcde23456"] });
ok("geri çekme öncesi: alanlar ekli", !bizimAlanYok(g.linkler[0].getAttribute("href")));
var onlendi = g.belge("click", g.tercih);
ok("Çerez tercihleri bağlantısı şeridi açar, odaklar, varsayılan gezinmeyi durdurur", onlendi === true && !!g.serit() && g.serit().odak === 1 && g.olaylar("InitiateCheckout").length === 0);
ok("açılan şerit şu anki tercihi söyler", /Şu anki tercihin: kabul/.test(tumMetin(g.serit())));
g.dugme("olc-r").tikla();
var gk = g.kuyruk();
ok("geri çekme: fbq consent revoke çağrılır", JSON.stringify(gk[gk.length - 1]) === JSON.stringify(["consent", "revoke"]) && g.izin() === "red" && g.serit() === null);
ok("geri çekme: _fbc ve _fbp silinir, başka çerezlere dokunulmaz", g.cerezler._fbc === undefined && g.cerezler._fbp === undefined && g.cerezler.baska === "kalir" &&
  g.cerezYazimlari.some(function (x) { return /^_fbp=; .*domain=\.suflo\.app.*max-age=0/.test(x); }) && g.cerezYazimlari.some(function (x) { return /^_fbc=; path=\/; max-age=0/.test(x); }), g.cerezYazimlari.join(" | "));
var gp = q(g.linkler[0].getAttribute("href"));
ok("geri çekme: bizim alanlar sökülür; source, feature, app_version, indirim kodu ve ref kalır", bizimAlanYok(g.linkler[0].getAttribute("href")) && gp[K.s] === "suflo_website" &&
  gp[K.f] === "pricing" && gp[K.v] === SURUM && gp["checkout[discount_code]"] === "SFLAB2CD3" && gp["checkout[custom][ref]"] === "abcde23456", g.linkler[0].getAttribute("href"));
var oncekiOlay = g.kuyruk().length;
g.belge("click", g.linkler[0]); g.pencere("scroll"); g.ileri();
ok("geri çekmeden sonra tıklama olay göndermez, alan eklemez", g.kuyruk().length === oncekiOlay && bizimAlanYok(g.linkler[0].getAttribute("href")));
g.belge("click", g.tercih);
ok("ret sonrası şerit yeniden açılabilir ve tercihi gösterir", !!g.serit() && /Şu anki tercihin: ret/.test(tumMetin(g.serit())));
g.dugme("olc-k").tikla();
var gk2 = g.kuyruk();
ok("yeniden kabul: betik ikinci kez istenmez, consent grant çağrılır, bağlantılar yeniden hazırlanır", g.metaBetikleri().length === 1 &&
  gk2.some(function (x) { return x[0] === "consent" && x[1] === "grant"; }) && g.olaylar("PageView").length === 1 && !!q(g.linkler[0].getAttribute("href"))[K.e] && g.izin() === "kabul");
var ilkRet = ortam({ cerezler: { baska: "kalir" } });
ilkRet.dugme("olc-r").tikla();
ok("hiç kabul etmeden ret: çerezlere hiç dokunulmaz", ilkRet.cerezYazimlari.length === 0);

/* ---------------- 8) yerel önizleme ve dil ---------------- */
var yerel = ortam({ host: "localhost", protokol: "http:", search: "?fbclid=" + FBCLID });
yerel.dugme("olc-k").tikla();
ok("yerel önizleme: Meta betiği istenmez, olaylar yalnız kuyruğa yazılır", yerel.metaBetikleri().length === 0 && yerel.olaylar("PageView").length === 1 && yerel.win.SufloOlcum.canli === false);
var yerelFbc = yerel.cerezYazimlari.filter(function (x) { return /^_fbc=/.test(x); })[0] || "";
ok("yerelde çerez alan adsız ve Secure'suz yazılır", /^_fbc=fb\.1\.\d+\./.test(yerelFbc) && !/domain=/.test(yerelFbc) && !/Secure/.test(yerelFbc), yerelFbc);
["suflo.app", "www.suflo.app"].forEach(function (h) { ok("canlı alan adı: " + h, ortam({ host: h }).win.SufloOlcum.canli === true); });
["sametcreates.github.io", "suflo.app.evil.example", "evilsuflo.app", "127.0.0.1"].forEach(function (h) {
  var x = ortam({ host: h }); x.dugme("olc-k").tikla();
  ok("başka alan adında Meta betiği istenmez: " + h, x.metaBetikleri().length === 0 && x.win.SufloOlcum.canli === false);
});
var en = ortam({ lang: "en" });
ok("İngilizce sayfada İngilizce şerit", en.serit().getAttribute("lang") === "en" && en.dugme("olc-r").textContent === "Decline" && en.dugme("olc-k").textContent === "Accept" &&
  /use cookies to see whether our ads work/.test(en.dugme("olc-m").textContent) && /If you decline, nothing is loaded/.test(en.dugme("olc-m").textContent) &&
  /Meta pixel/.test(en.dugme("olc-ayr").textContent) && !/[ğışĞİŞçöüÇÖÜ]/.test(tumMetin(en.serit())), tumMetin(en.serit()));
var trSerit = ortam();
ok("Türkçe şeridin ilk cümlesi sade: çerez, ne için ve reddin sonucu", /çerez kullanmak istiyoruz/.test(trSerit.dugme("olc-m").textContent) && /Reklamlarımızın/.test(trSerit.dugme("olc-m").textContent) &&
  /Reddedersen hiçbir şey yüklenmez/.test(trSerit.dugme("olc-m").textContent), trSerit.dugme("olc-m").textContent);
ok("hangi şirketin betiği yüklendiği Ayrıntı'da açıkça yazar (ilk cümlede değil)", !/Meta/.test(trSerit.dugme("olc-m").textContent) && /Meta'nın \(Facebook\/Instagram\) ölçüm betiği, yani Meta pikseli/.test(trSerit.dugme("olc-ayr").textContent));
ok("şeritte çerez resmi var, ekran okuyucudan gizli", (function () { var r = trSerit.dugme("olc-i"); return !!r && r.textContent === "\uD83C\uDF6A" && r.getAttribute("aria-hidden") === "true" && r.parentNode === trSerit.dugme("olc-u") && trSerit.dugme("olc-m").parentNode === trSerit.dugme("olc-u"); })());
ok("SufloOlcum.izin() ve ac()", (function () { var x = ortam(); var bos = x.win.SufloOlcum.izin() === ""; x.dugme("olc-r").tikla(); x.win.SufloOlcum.ac(); return bos && x.win.SufloOlcum.izin() === "red" && !!x.serit(); })());
var ikiKez = ortam({ once: "window.SufloOlcum = { izin: function () { return 'x'; } };" });
ok("betik iki kez eklenirse ikincisi çalışmaz", ikiKez.serit() === null && ikiKez.win.SufloOlcum.izin() === "x");

/* ---------------- 8b) uzun değerler: Lemon Squeezy'nin 255 karakter sınırı ---------------- */
var UZUN_UA = "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.7390.122 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/531.0.0.48.72;IABMV/1;] Instagram 401.0.0.48.79 Android (34/14; 450dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; tr_TR; 79";
function tik(n) { return ("IwY2xjawUZUN" + "AbCdEfGhIj0123456789_-".repeat(40)).slice(0, n); }
function kabul(sec) { sec.depo = { suflo_olcum_izni: JSON.stringify({ v: 1, d: "kabul", t: SIMDI }) }; return ortam(sec); }
var uz = kabul({ ua: UZUN_UA, search: "?fbclid=" + tik(300) });
uz.belge("click", uz.linkler[0]);
var pu = q(uz.linkler[0].getAttribute("href"));
ok("uygulama içi tarayıcının uzun kimliği (" + UZUN_UA.length + " karakter) iki parçaya bölünür, birleşince aynısı", UZUN_UA.length > 255 && pu[K.u].length === 250 && pu[K.u] + pu[K.u2] === UZUN_UA, (pu[K.u] || "").length + "+" + (pu[K.u2] || "").length);
ok("uzun tıklama kimliği iki parçaya bölünür, birleşince çerezdeki fbc", pu[K.c].length === 250 && pu[K.c] + pu[K.c2] === uz.cerezler._fbc && uz.cerezler._fbc === "fb.1." + SIMDI + "." + tik(300), (pu[K.c] || "").length + "+" + (pu[K.c2] || "").length);
ok("hiçbir özel alan 250 karakteri aşmaz (sınır 255)", enUzunOzel(uz.linkler[0].getAttribute("href")) === 250, enUzunOzel(uz.linkler[0].getAttribute("href")));
[8, 100, 230, 231, 232, 250, 300, 400, 470].forEach(function (n) {
  [UA, UZUN_UA, "U".repeat(700)].forEach(function (ua, i) {
    var x = kabul({ ua: ua, search: "?fbclid=" + tik(n), cerezler: { _fbp: "fb.1.1794999999000.123456789012345678901234" } });
    x.belge("pointerdown", x.linkler[0]); x.belge("click", x.linkler[0]);
    var px = q(x.linkler[0].getAttribute("href")), birlesik = (px[K.c] || "") + (px[K.c2] || "");
    ok("fbclid " + n + " karakter, tarayıcı kimliği #" + (i + 1) + ": her alan ≤ 250, fbc eksiksiz", enUzunOzel(x.linkler[0].getAttribute("href")) <= 250 && birlesik === "fb.1." + SIMDI + "." + tik(n) &&
      ((px[K.u] || "") + (px[K.u2] || "")) === ua.slice(0, 500), enUzunOzel(x.linkler[0].getAttribute("href")) + " / " + birlesik.length);
  });
});
var cokUzun = kabul({ search: "?fbclid=" + tik(471) });
ok("iki parçaya sığmayan tıklama kimliği kırpılmaz, hiç eklenmez; çerez de yazılmaz", !(K.c in q(cokUzun.linkler[0].getAttribute("href"))) && !(K.c2 in q(cokUzun.linkler[0].getAttribute("href"))) &&
  cokUzun.cerezler._fbc === undefined && !!q(cokUzun.linkler[0].getAttribute("href"))[K.e]);
var uzunCerez = kabul({ cerezler: { _fbc: "fb.1.1790000000000." + tik(480) } });
ok("pikselin yazdığı aşırı uzun _fbc bağlantıya eklenmez (ödeme bozulmasın)", !(K.c in q(uzunCerez.linkler[0].getAttribute("href"))) && enUzunOzel(uzunCerez.linkler[0].getAttribute("href")) <= 250);
var kisalan = kabul({ ua: UZUN_UA, cerezler: { _fbc: "fb.1.1790000000000." + tik(300) } });
ok("önce uzun: fbc2 ve ua2 var", !!q(kisalan.linkler[0].getAttribute("href"))[K.c2] && !!q(kisalan.linkler[0].getAttribute("href"))[K.u2]);
kisalan.cerezler._fbc = "fb.1.1790000000000.KisaTiklama_1"; kisalan.win.navigator.userAgent = UA;
kisalan.belge("click", kisalan.linkler[0]);
var pk = q(kisalan.linkler[0].getAttribute("href"));
ok("değer kısalınca eski ikinci parça bağlantıda kalmaz", pk[K.c] === "fb.1.1790000000000.KisaTiklama_1" && !(K.c2 in pk) && pk[K.u] === UA && !(K.u2 in pk), kisalan.linkler[0].getAttribute("href"));
kisalan.belge("click", kisalan.tercih); kisalan.dugme("olc-r").tikla();
var uzGeri = kabul({ ua: UZUN_UA, search: "?fbclid=" + tik(300) });
uzGeri.belge("click", uzGeri.tercih); uzGeri.dugme("olc-r").tikla();
ok("geri çekmede ikinci parçalar da sökülür", bizimAlanYok(uzGeri.linkler[0].getAttribute("href")) && uzGeri.linkler[0].getAttribute("href") === GERCEK[0], uzGeri.linkler[0].getAttribute("href"));

/* ---------------- 9) davet betiğiyle birlikte ---------------- */
var DAVET = (/<script id="davet-site">([\s\S]*?)<\/script>/.exec(trHtml) || ["", ""])[1];
var dv = ortam({ search: "?d=SFLAB2CD3&ref=abcde23456&fbclid=" + FBCLID, once: DAVET });
ok("davet betiği izinsizken de çalışır: indirim kodu eklenir, ölçüm alanı yok", q(dv.linkler[0].getAttribute("href"))["checkout[discount_code]"] === "SFLAB2CD3" && bizimAlanYok(dv.linkler[0].getAttribute("href")));
dv.dugme("olc-k").tikla();
dv.belge("click", dv.linkler[0]);
var pd = q(dv.linkler[0].getAttribute("href"));
ok("davet + ölçüm birlikte: indirim kodu, ref, source, feature, app_version ve ölçüm alanları tek tek durur", pd["checkout[discount_code]"] === "SFLAB2CD3" && pd["checkout[custom][ref]"] === "abcde23456" &&
  pd[K.s] === "suflo_website" && pd[K.f] === "pricing" && pd[K.v] === SURUM && !!pd[K.e] && /^fb\.1\.\d+\./.test(pd[K.c]) && pd[K.u] === UA &&
  Object.keys(pd).length === anahtarlar(dv.linkler[0].getAttribute("href")).length, dv.linkler[0].getAttribute("href"));
ok("lemon.js'in yaptığı gibi URL nesnesinden geçince alanlar bozulmaz", (function () {
  var u = new URL(dv.linkler[0].getAttribute("href")); u.searchParams.set("embed", 1);
  var s = new URL(u.toString()).searchParams;
  return s.get(K.e) === pd[K.e] && s.get(K.c) === pd[K.c] && s.get(K.u) === UA && s.get(K.s) === "suflo_website" && s.get("checkout[discount_code]") === "SFLAB2CD3";
})());

/* ---------------- 10) sayfalar ve kaynak ---------------- */
var ETIKET = '<script src="/js/olcum.js?v=1" defer></script>';
["docs/index.html", "docs/en/index.html", "docs/en/pro.html"].forEach(function (f) {
  var h = oku(f);
  ok(f + ": ölçüm betiği bir kez, defer ile ve <head> içinde", h.split(ETIKET).length === 2 && h.indexOf(ETIKET) < h.indexOf("</head>"));
  ok(f + ": HTML'de gömülü piksel kodu yok (fbq / facebook.net / facebook.com/tr)", !/fbq\s*\(/.test(h) && !/connect\.facebook\.net/.test(h) && !/facebook\.com\/tr/.test(h));
  ok(f + ": Çerez tercihleri bağlantısı var", /<a href="#[a-z-]+" data-olcum-ac>(Çerez tercihleri|Cookie preferences)<\/a>/.test(h));
  ok(f + ": ödeme bağlantılarında gömülü ölçüm alanı yok (yalnız izinle, tarayıcıda eklenir)", !/%5Bevent_id%5D|%5Bfbc%5D|%5Bfbp%5D|%5Bua%5D/.test(h));
});
["docs/stil.html", "docs/en/stil.html", "docs/egri.html", "docs/en/egri.html", "docs/mcp-guvenlik.html", "docs/hesap.html", "docs/pro.html"].forEach(function (f) {
  ok(f + ": ölçüm betiği yok", oku(f).indexOf("olcum.js") === -1);
});
ok("ana sayfa altbilgisi artık koşulsuz 'çerez yok' demiyor", !/Çerez yok · takip yok/.test(trHtml) && /Onay vermezsen çerez ve takip yok/.test(trHtml));
ok("Meta pikseli Lemon Squeezy'den bağımsız yüklenir (lemon.js etiketi yerinde)", trHtml.indexOf("app.lemonsqueezy.com/js/lemon.js") !== -1);
var pro = oku("docs/pro.html");
ok("/pro yönlendirmesi sorgu dizgisini (fbclid, d, ref) taşır; JS'siz yönlendirme noscript içinde", /location\.replace\("\/" \+ location\.search \+ "#pro"\)/.test(pro) &&
  /<noscript><meta http-equiv="refresh" content="0; url=\/#pro"><\/noscript>/.test(pro) && (pro.match(/http-equiv="refresh"/g) || []).length === 1);

ok("olcum.js: innerHTML / document.write / eval / ağ çağrısı yok", !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|sendBeacon|new Image/.test(KOD));
ok("olcum.js: tek dış adres Meta betiği, piksel kimliği doğru", (KOD.match(/https?:\/\/[^\s"']+/g) || []).join(",") === META && KOD.indexOf('"' + PIKSEL + '"') !== -1,
  (KOD.match(/https?:\/\/[^\s"']+/g) || []).join(","));
ok("olcum.js: parça boyu Lemon Squeezy'nin 255 sınırının altında", Number((/var PARCA = (\d+);/.exec(KOD) || [])[1]) === 250);
ok("olcum.js: depoya yalnız izin anahtarı yazılır", (KOD.match(/localStorage\.setItem\(/g) || []).length === 1 && /localStorage\.setItem\(ANAHTAR, v\)/.test(KOD) && !/sessionStorage/.test(KOD));
var Fiyat = require(path.join(ROOT, "js", "pricing.js"));
var sabit = /var FIYAT = (\d+), PARA = "([A-Z]{3})";/.exec(KOD) || [];
ok("olcum.js fiyatı canlı ödemeyle aynı (js/pricing.js: " + Fiyat.offer("tr").amount + " " + Fiyat.offer("tr").currency + ")", Number(sabit[1]) === Fiyat.offer("tr").amount &&
  sabit[2] === Fiyat.offer("tr").currency && Number(sabit[1]) === Fiyat.offer("en").amount && sabit[2] === Fiyat.offer("en").currency, sabit.join(" "));
ok("ödeme adresi kalıbı gerçek bağlantıyı tanır", /lemonsqueezy\\\.com\\\/checkout/.test(KOD) && GERCEK.every(function (u) { return u.indexOf(Fiyat.offer("tr").url) === 0; }));

console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
process.exit(kalan ? 1 : 0);
