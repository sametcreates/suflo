/*
 * Suflo — Viral anlar (Shorts / Reels / TikTok bulucu)
 * Altyazıdan, bulut LLM'iyle (çeviriyle aynı anahtar) 15-60 sn'lik güçlü
 * anları seçer; her an için In/Out ayarlanır ya da süreli marker eklenir.
 * İstem ve denetim js/highlights.js'te (saf, testli).
 */
window.KViral = (function () {
  "use strict";

  var HL = window.SufloHighlights;
  var anlar = [];
  var busy = false;

  function el(id) { return document.getElementById(id); }

  function durum(msg, cls) {
    var e = el("cap-vr-durum");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function tc(sec) {
    var t = Math.max(0, Math.floor(sec)), m = Math.floor(t / 60), s = t % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function sureler() {
    var v = String(el("cap-vr-sure").value || "20-60").split("-");
    return { minDur: Number(v[0]) || 20, maxDur: Number(v[1]) || 60 };
  }

  function render() {
    var box = el("cap-vr-liste");
    box.innerHTML = "";
    anlar.forEach(function (a, i) {
      var kart = document.createElement("div");
      kart.className = "vr-kart";
      var ust = document.createElement("div");
      ust.className = "vr-ust";
      var no = document.createElement("span");
      no.className = "vr-puan";
      no.textContent = String(Math.round(a.score));
      no.title = "Viral puanı (1-10)";
      var b = document.createElement("b");
      b.textContent = a.title;
      ust.appendChild(no); ust.appendChild(b);
      var alt = document.createElement("div");
      alt.className = "vr-alt";
      alt.textContent = tc(a.start) + "–" + tc(a.end) + " · " + Math.round(a.end - a.start) + " sn" + (a.hook ? " · " + a.hook : "");
      var sec = document.createElement("button");
      sec.type = "button";
      sec.className = "btn tiny";
      sec.textContent = "In/Out ayarla";
      sec.title = "Sekansın In/Out noktalarını bu ana ayarlar: dışa aktar ya da yeni sekans yap";
      sec.addEventListener("click", async function () {
        var r = await K.call("KS_setInOut", { start: a.start, end: a.end });
        if (r.ok) KApp.toast("In/Out ayarlandı: " + a.title + " — Dışa aktar (Ctrl+M) ile Shorts'u çıkar", "good");
        else durum("✕ " + r.error, "bad");
      });
      kart.appendChild(ust); kart.appendChild(alt); kart.appendChild(sec);
      box.appendChild(kart);
    });
    el("cap-vr-aksiyon").hidden = anlar.length === 0;
  }

  async function bul() {
    if (typeof Pro !== "undefined" && !Pro.gate("highlights")) return;
    if (busy || !HL) return;
    var segs = window.KCaptions ? KCaptions.getSegments() : [];
    if (!segs.length) { durum("Önce altyazı oluştur ya da SRT içe aktar.", "warn"); return; }
    var toplam = segs[segs.length - 1].end - segs[0].start;
    if (toplam < 60) { durum("Viral an bulmak için en az 1 dakikalık konuşma gerekir.", "warn"); return; }
    var cfg = KCaptions.chatConfig();
    if (!cfg) { KApp.toast("Viral anlar için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad"); return; }
    busy = true;
    el("cap-vr-bul").disabled = true;
    durum("Yapay zekâ konuşmayı izliyor…");
    try {
      var s = sureler();
      var p = HL.buildPrompt(segs, { lang: KCaptions.language ? KCaptions.language() : "tr", minDur: s.minDur, maxDur: s.maxDur, adet: 5 });
      var json = await KCaptions.chatCall(cfg, {
        model: cfg.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }]
      });
      var content = json.choices && json.choices[0] && json.choices[0].message.content;
      anlar = HL.parseResponse(content, segs, { minDur: s.minDur, maxDur: s.maxDur, adim: p.adim });
      if (!anlar.length) throw new Error("Uygun an bulunamadı — süreyi değiştirip tekrar dene.");
      durum("");
      render();
      KApp.toast(anlar.length + " viral an bulundu", "good");
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      busy = false;
      el("cap-vr-bul").disabled = false;
    }
  }

  async function markerEkle() {
    if (!anlar.length) return;
    var r = await K.call("KS_addRangeMarkers", {
      ranges: anlar.map(function (a) { return { start: a.start, end: a.end, name: "🔥 " + a.title, comment: a.hook }; }),
      replace: true
    });
    if (r.ok) KApp.toast(r.added + " viral an marker'ı eklendi (kırmızı, süreli)", "good");
    else durum("✕ " + r.error, "bad");
  }

  function kopyala() {
    var txt = HL.format(anlar);
    function bitti() { KApp.toast("Liste kopyalandı", "good"); }
    function yedek() {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      bitti();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(bitti).catch(yedek);
    else yedek();
  }

  function init() {
    if (!HL || !el("cap-vr-box")) return;
    el("cap-vr-bul").addEventListener("click", bul);
    el("cap-vr-marker").addEventListener("click", markerEkle);
    el("cap-vr-kopyala").addEventListener("click", kopyala);
  }

  return { init: init };
})();
