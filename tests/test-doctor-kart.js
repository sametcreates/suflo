/*
 * Suflo testi: Ayarlar › Suflo Doctor kartı gerçek tarayıcıda (Playwright, panel genişlikleri 340 / 520 / 780 px).
 *  - kartın iç boşluğu var: .set-group (padding 13px 0) .doctor-card'ın 16 px'ini ezmez; logo sola, "Taramayı başlat"
 *    sağa yapışmaz
 *  - düğmeler ve "Panel menüde görünmüyor mu?" bağlantısı birbirine değmez (en az 8 px), kartın dışına taşmaz
 * Playwright / Chromium yoksa atlanır.
 */
var path = require("path");
var pw = null;
try { pw = require("playwright"); } catch (e) { pw = null; }
if (!pw) { console.log("ATLA playwright yok"); process.exit(0); }
var KOK = path.join(__dirname, "..");
var gecti = 0, kaldi = 0;
function ok(ad, k, ek) { if (k) gecti++; else kaldi++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

(async function () {
  var tarayici;
  try { tarayici = await pw.chromium.launch(); } catch (e) { console.log("ATLA chromium açılamadı: " + (e && e.message)); process.exit(0); }
  try {
    for (var genislik of [340, 520, 780]) {
      var sayfa = await tarayici.newPage({ viewport: { width: genislik, height: 1000 }, deviceScaleFactor: 1 });
      sayfa.on("pageerror", function () {});
      await sayfa.goto("file://" + KOK.split(path.sep).join("/") + "/index.html");
      var o = await sayfa.evaluate(function () {
        document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
        var s = document.getElementById("tab-settings"); s.classList.add("active");
        ["set-doctor-fix-all", "set-library-health-copy"].forEach(function (id) { document.getElementById(id).hidden = false; });
        function kutu(sec) { var r = document.querySelector(sec).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; }
        var kart = kutu("#set-doctor-card");
        var cs = getComputedStyle(document.getElementById("set-doctor-card"));
        var aks = Array.prototype.slice.call(document.querySelectorAll("#set-doctor-card .doctor-actions > :not([hidden])")).map(function (e) {
          var r = e.getBoundingClientRect(); return { id: e.id, l: r.left, r: r.right, t: r.top, b: r.bottom };
        });
        return { kart: kart, pl: parseFloat(cs.paddingLeft), pr: parseFloat(cs.paddingRight), logo: kutu(".doctor-mark"), tara: kutu("#set-library-health-run"), aks: aks };
      });
      ok(genislik + " px: kartın yatay iç boşluğu 16 px (.set-group ezmez)", o.pl === 16 && o.pr === 16, o.pl + "/" + o.pr);
      ok(genislik + " px: logo sol kenara yapışık değil (≥ 12 px)", o.logo.l - o.kart.l >= 12, Math.round(o.logo.l - o.kart.l));
      ok(genislik + " px: Taramayı başlat sağ kenara yapışık değil (≥ 12 px)", o.kart.r - o.tara.r >= 12, Math.round(o.kart.r - o.tara.r));
      var deger = true, kanit = [];
      o.aks.forEach(function (a, i) {
        if (a.l - o.kart.l < 12 || o.kart.r - a.r < 12) { deger = false; kanit.push(a.id + " kenarda"); }
        o.aks.slice(i + 1).forEach(function (b) {
          var ayniSatir = a.t < b.b && b.t < a.b;
          var aralik = ayniSatir ? Math.max(b.l - a.r, a.l - b.r) : Math.max(b.t - a.b, a.t - b.b);
          if (aralik < 8) { deger = false; kanit.push(a.id + "↔" + b.id + " " + Math.round(aralik)); }
        });
      });
      ok(genislik + " px: düğmeler ve panel rehberi bağlantısı birbirine değmez (≥ 8 px), kart içinde", deger && o.aks.length === 4, kanit.join(", ") || o.aks.length);
      await sayfa.close();
    }
  } finally { await tarayici.close(); }
  console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
  process.exit(kaldi ? 1 : 0);
})().catch(function (e) { console.log("FAIL " + (e && e.stack || e)); process.exit(1); });
