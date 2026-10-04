/*
 * suflo.app davet betigi (docs/index.html script#davet-site): ?d= ve ?ref= dogrulanir, 30 gun
 * saklanir ve Lemon Squeezy odeme baglantilarina eklenir. Sahte DOM ile vm'de calistirilir.
 * Ortaklik sayfasi ve site haritasi da denetlenir.
 */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");
var ROOT = path.join(__dirname, "..");
var gecen = 0, kalan = 0;
function ok(ad, k, ek) { if (k) gecen++; else kalan++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined && !k ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var html = fs.readFileSync(path.join(ROOT, "docs", "index.html"), "utf8");
var m = /<script id="davet-site">([\s\S]*?)<\/script>/.exec(html);
ok("davet betigi var", !!m);
var KOD = m ? m[1] : "";
ok("davet betigi lemon.js'ten once", m && html.indexOf('<script id="davet-site">') < html.indexOf("app.lemonsqueezy.com/js/lemon.js"));
ok("indirim bilgisi ogesi gizli baslar", /id="davet-bilgi" hidden/.test(html) && /%15 davet indirimi uygulandı/.test(html));
ok("altbilgide ortaklik sayfasi", /href="\/ortaklik\.html"/.test(html));

var CHECKOUT = "https://suflo.lemonsqueezy.com/checkout/buy/e33dda31?checkout%5Bcustom%5D%5Bsource%5D=suflo_website&checkout%5Bcustom%5D%5Bfeature%5D=pricing";
function ortam(search, depo, depoHata, simdi) {
  var linkler = [CHECKOUT, CHECKOUT.replace("pricing", "footer")].map(function (h) {
    var a = { nodeType: 1, attrs: { href: h }, classList: { contains: function (c) { return c === "lemonsqueezy-button"; } },
      getAttribute: function (k) { return this.attrs[k]; }, setAttribute: function (k, v) { this.attrs[k] = v; } };
    return a;
  });
  var baska = { nodeType: 1, attrs: { href: "https://github.com/sametcreates/suflo" }, classList: { contains: function () { return false; } },
    getAttribute: function (k) { return this.attrs[k]; }, setAttribute: function (k, v) { this.attrs[k] = v; } };
  var sahte = { nodeType: 1, attrs: { href: "https://evil.example/checkout/x" }, classList: { contains: function (c) { return c === "lemonsqueezy-button"; } },
    getAttribute: function (k) { return this.attrs[k]; }, setAttribute: function (k, v) { this.attrs[k] = v; } };
  var bilgiB = { textContent: "" };
  var bilgi = { hidden: true, querySelector: function () { return bilgiB; } };
  var dinleyici = {};
  var ls = {
    getItem: function (k) { if (depoHata) throw new Error("engelli"); return Object.prototype.hasOwnProperty.call(depo, k) ? depo[k] : null; },
    setItem: function (k, v) { if (depoHata) throw new Error("engelli"); depo[k] = String(v); }
  };
  var doc = {
    readyState: "complete",
    querySelectorAll: function () { return linkler.concat([sahte]); },
    getElementById: function (id) { return id === "davet-bilgi" ? bilgi : null; },
    addEventListener: function (t, f) { dinleyici[t] = f; }
  };
  var ctx = { document: doc, window: null, Date: { now: function () { return simdi || 1.8e12; } }, JSON: JSON, RegExp: RegExp, String: String, Number: Number, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent };
  ctx.window = { localStorage: ls, location: { search: search } };
  vm.createContext(ctx);
  vm.runInContext(KOD, ctx);
  return { linkler: linkler, baska: baska, sahte: sahte, bilgi: bilgi, bilgiB: bilgiB, dinleyici: dinleyici, depo: depo };
}
function q(href) { var o = {}; href.split("?")[1].split("&").forEach(function (p) { var kv = p.split("="); o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); }); return o; }

var o1 = ortam("?d=SFLAB2CD3", {});
var p1 = q(o1.linkler[0].attrs.href);
ok("?d= gecerli kod odeme baglantisina eklenir", p1["checkout[discount_code]"] === "SFLAB2CD3", o1.linkler[0].attrs.href);
ok("checkout[custom] alanlari korunur", p1["checkout[custom][source]"] === "suflo_website" && p1["checkout[custom][feature]"] === "pricing");
ok("ikinci odeme dugmesi de guncellenir", q(o1.linkler[1].attrs.href)["checkout[discount_code]"] === "SFLAB2CD3");
ok("Lemon Squeezy olmayan adres degismez", o1.sahte.attrs.href === "https://evil.example/checkout/x");
ok("indirim bilgisi gorunur, kod yazilir", o1.bilgi.hidden === false && o1.bilgiB.textContent === "SFLAB2CD3");
ok("kod 30 gun icin saklanir", JSON.parse(o1.depo.suflo_davet).d === "SFLAB2CD3");
// tiklama aninda (lemon.js'ten once) tekrar uygulanir ama cogaltmaz
o1.dinleyici.click({ target: o1.linkler[0] });
ok("tiklamada parametre cogalmaz", (o1.linkler[0].attrs.href.match(/discount_code/g) || []).length === 1, o1.linkler[0].attrs.href);

var o2 = ortam("?d=sfl-ab2cd3", {});
ok("kucuk harf ve tire normallesir", q(o2.linkler[0].attrs.href)["checkout[discount_code]"] === "SFLAB2CD3");

["?d=SFL", "?d=SFLAB2CD3%22%3E%3Cscript%3E", "?d=ABCAB2CD3", "?d=SFLAB2CD1", "?d=SFLAB2CD3X"].forEach(function (s) {
  var o = ortam(s, {});
  ok("gecersiz kod reddedilir: " + s, o.linkler[0].attrs.href === CHECKOUT && !o.depo.suflo_davet && o.bilgi.hidden === true, o.linkler[0].attrs.href);
});

var depo = { suflo_davet: JSON.stringify({ d: "SFLAB2CD3", t: 1.8e12 - 5 * 864e5 }) };
var o3 = ortam("", depo);
ok("saklanan kod sonraki ziyarette uygulanir", q(o3.linkler[0].attrs.href)["checkout[discount_code]"] === "SFLAB2CD3");
var o4 = ortam("", { suflo_davet: JSON.stringify({ d: "SFLAB2CD3", t: 1.8e12 - 31 * 864e5 }) });
ok("30 gunden eski kod uygulanmaz", o4.linkler[0].attrs.href === CHECKOUT);
var o5 = ortam("", { suflo_davet: JSON.stringify({ d: "<x>", t: 1.8e12 }) });
ok("bozuk saklanan kod uygulanmaz", o5.linkler[0].attrs.href === CHECKOUT);
var o6 = ortam("?d=SFLAB2CD3", {}, true);
ok("localStorage engelliyken de URL'deki kod uygulanir", q(o6.linkler[0].attrs.href)["checkout[discount_code]"] === "SFLAB2CD3");

var o7 = ortam("?ref=abcde23456", {});
var p7 = q(o7.linkler[0].attrs.href);
ok("?ref= checkout[custom][ref] olarak eklenir, indirim yok", p7["checkout[custom][ref]"] === "abcde23456" && !p7["checkout[discount_code]"] && o7.bilgi.hidden === true, o7.linkler[0].attrs.href);
var o8 = ortam("?ref=ABC", {});
ok("gecersiz ref reddedilir", o8.linkler[0].attrs.href === CHECKOUT);
var o9 = ortam("?d=SFLAB2CD3&ref=abcde23456", {});
var p9 = q(o9.linkler[0].attrs.href);
ok("kod ve ref birlikte eklenir", p9["checkout[discount_code]"] === "SFLAB2CD3" && p9["checkout[custom][ref]"] === "abcde23456");
var o10 = ortam("", {});
ok("parametre yoksa hicbir sey degismez ve tiklama dinleyicisi kurulmaz", o10.linkler[0].attrs.href === CHECKOUT && !o10.dinleyici.click);

var ort = fs.readFileSync(path.join(ROOT, "docs", "ortaklik.html"), "utf8");
ok("ortaklik sayfasi: baslik, canonical, affiliate kaydi, IBAN ve kod istegi", /<title>Ortaklık ve Davet \| Suflo<\/title>/.test(ort) &&
  /rel="canonical" href="https:\/\/suflo\.app\/ortaklik\.html"/.test(ort) && /lemonsqueezy\.com\/affiliates/.test(ort) && /IBAN/.test(ort) && /indirim kodu/.test(ort));
ok("ortaklik sayfasi: e-posta adresi yazilana dek e-posta dugmesi gizli", /id="ortak-eposta" data-eposta="" href="#" hidden/.test(ort));
ok("ortaklik sayfasinda kisisel e-posta yok", !/@gmail\.com/i.test(ort));
var sm = fs.readFileSync(path.join(ROOT, "docs", "sitemap.xml"), "utf8");
ok("site haritasinda ortaklik sayfasi", /<loc>https:\/\/suflo\.app\/ortaklik\.html<\/loc>/.test(sm));

console.log("\n" + gecen + "/" + (gecen + kalan) + " gecti");
process.exit(kalan ? 1 : 0);
