/*
 * Suflo — B-roll önerileri (Altyazı editörü)
 * İstem ve ayrıştırma js/broll.js'te (saf, testli). Öneriler listelenir,
 * timeline'a yeşil süreli marker olarak eklenir; her öneri Pexels / Pixabay
 * aramasını tarayıcıda açar.
 */
window.KBroll = (function () {
  "use strict";

  var BR = window.SufloBroll;
  var oneriler = [];
  var busy = false;

  function el(id) { return document.getElementById(id); }

  function durum(msg, cls) {
    var e = el("cap-br-durum");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function tc(sec) {
    var t = Math.max(0, Math.floor(sec)), m = Math.floor(t / 60), s = t % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function ac(url) {
    try { K.cs.openURLInDefaultBrowser(url); } catch (e) { window.open(url, "_blank"); }
  }

  function render() {
    var box = el("cap-br-liste");
    box.innerHTML = "";
    oneriler.forEach(function (o) {
      var kart = document.createElement("div");
      kart.className = "vr-kart";
      var ust = document.createElement("div");
      ust.className = "vr-ust";
      var zaman = document.createElement("span");
      zaman.className = "vr-puan br-zaman";
      zaman.textContent = tc(o.start);
      zaman.title = "Bu ana git";
      zaman.style.cursor = "pointer";
      zaman.onclick = function () { K.call("KS_setPlayerPosition", { sec: o.start }); };
      var b = document.createElement("b");
      b.textContent = o.keywords;
      ust.appendChild(zaman); ust.appendChild(b);
      kart.appendChild(ust);
      if (o.why) {
        var alt = document.createElement("div");
        alt.className = "vr-alt";
        alt.textContent = o.why;
        kart.appendChild(alt);
      }
      var u = BR.searchUrls(o.keywords);
      var row = document.createElement("div");
      row.className = "vr-dugmeler";
      [["Pexels'te ara", u.pexels], ["Pixabay'de ara", u.pixabay]].forEach(function (x) {
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "btn tiny"; btn.textContent = x[0];
        btn.onclick = function () { ac(x[1]); };
        row.appendChild(btn);
      });
      kart.appendChild(row);
      box.appendChild(kart);
    });
    el("cap-br-aksiyon").hidden = oneriler.length === 0;
  }

  async function bul() {
    if (typeof Pro !== "undefined" && !Pro.gate("highlights")) return;
    if (busy || !BR) return;
    var segs = window.KCaptions ? KCaptions.getSegments() : [];
    if (!segs.length) { durum("Önce altyazı oluştur ya da SRT içe aktar.", "warn"); return; }
    var cfg = KCaptions.chatConfig();
    if (!cfg) {
      if (window.KOnboarding) KOnboarding.anahtarIste("B-roll önerileri");
      else KApp.toast("B-roll önerileri için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad");
      return;
    }
    busy = true;
    el("cap-br-bul").disabled = true;
    durum("Konuşmada görselleştirilecek anlar aranıyor…");
    try {
      var p = BR.buildPrompt(segs, { lang: KCaptions.language ? KCaptions.language() : "tr" });
      var json = await KCaptions.chatCall(cfg, {
        model: cfg.model, temperature: 0.4, response_format: { type: "json_object" },
        messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }]
      });
      oneriler = BR.parseResponse(json.choices && json.choices[0] && json.choices[0].message.content, segs);
      if (!oneriler.length) throw new Error("Uygun an bulunamadı, tekrar dene.");
      render();
      durum("");
      KApp.toast(oneriler.length + " B-roll önerisi", "good");
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      busy = false;
      el("cap-br-bul").disabled = false;
    }
  }

  async function markerEkle() {
    if (!oneriler.length) return;
    var r = await K.call("KS_addRangeMarkers", {
      ranges: oneriler.map(function (o) { return { start: o.start, end: o.end, name: "B-roll: " + o.keywords, comment: o.why }; }),
      replace: true, etiket: "Suflo B-roll", renk: 0
    });
    if (r.ok) KApp.toast(r.added + " B-roll marker'ı eklendi (yeşil)" + (r.removed ? " · eskiler yenilendi" : ""), "good");
    else durum("✕ " + r.error, "bad");
  }

  function init() {
    if (!BR || !el("cap-br-box")) return;
    el("cap-br-bul").addEventListener("click", bul);
    el("cap-br-marker").addEventListener("click", markerEkle);
  }

  return { init: init };
})();
