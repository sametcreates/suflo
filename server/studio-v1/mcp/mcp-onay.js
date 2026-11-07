/*
 * Suflo Studio sohbet baglantisi onay sayfasi (oauth/authorize). Yer: public_html/<uygulama>/mcp-onay.js.
 * Karar ayni kaynaga fetch ile gider (CSP form-action 'none' oldugu icin form gonderilmez); yanittaki adrese yonlendirir.
 */
(function () {
  "use strict";
  var kutu = document.getElementById("onay");
  if (!kutu) return;
  var hata = document.getElementById("hata");
  var sifre = document.getElementById("sifre");
  var yaz = document.getElementById("yaz");
  var izinB = document.getElementById("izin");
  var retB = document.getElementById("ret");
  function goster(m) { hata.textContent = m || ""; hata.hidden = !m; }
  function kilit(k) { izinB.disabled = k; retB.disabled = k; }
  function gonder(karar) {
    if (karar === "izin" && !sifre.value) { goster("Studio şifresini yaz."); sifre.focus(); return; }
    kilit(true);
    goster("");
    var g = new URLSearchParams();
    g.set("onay_istegi", kutu.getAttribute("data-istek"));
    g.set("csrf", kutu.getAttribute("data-csrf"));
    g.set("karar", karar);
    if (karar === "izin") {
      g.set("sifre", sifre.value);
      g.set("yaz", yaz && yaz.checked ? "1" : "0");
    }
    fetch(kutu.getAttribute("data-adres"), {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Suflo-Onay": "1" },
      body: g.toString()
    }).then(function (y) {
      return y.json().catch(function () { return {}; });
    }).then(function (j) {
      if (j && typeof j.yonlendir === "string" && /^https?:\/\//.test(j.yonlendir)) {
        sifre.value = "";
        window.location.replace(j.yonlendir);
        return;
      }
      goster((j && j.hata) || "Bir sorun oluştu. Yeniden dene.");
      kilit(false);
      sifre.value = "";
      sifre.focus();
    }).catch(function () {
      goster("Sunucuya ulaşılamadı. Bağlantını kontrol edip yeniden dene.");
      kilit(false);
    });
  }
  izinB.addEventListener("click", function () { gonder("izin"); });
  retB.addEventListener("click", function () { gonder("ret"); });
  sifre.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); gonder("izin"); } });
})();
