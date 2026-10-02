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
  // anlarin bulundugu transkript ve sekans: Shorts sonra baska sekansta/transkriptte olusturulmasin
  var bulSegs = null, bulSekans = "";

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
      var baslik = document.createElement("button");
      baslik.type = "button";
      baslik.className = "btn tiny";
      baslik.textContent = "Başlık ekle";
      baslik.title = "Bu anın başına kanca başlığı koyar (stil ve süre: Kanca Başlığı sekmesi)";
      baslik.hidden = !window.KKanca;
      baslik.addEventListener("click", async function () {
        baslik.disabled = true;
        try { await KKanca.ekle({ text: a.title, at: a.start }); } finally { baslik.disabled = false; }
      });
      var dugmeler = document.createElement("div");
      dugmeler.className = "vr-dugmeler";
      dugmeler.appendChild(sec); dugmeler.appendChild(baslik);
      kart.appendChild(ust); kart.appendChild(alt); kart.appendChild(dugmeler);
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
    // AI cagrisi surerken sekans/transkript degisebilir: kaynak simdiden yakalanir
    var segsHam = KCaptions.rawSegments ? KCaptions.rawSegments() : null;
    var sekansHam = String(KApp.ctx().sequenceId || "");
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
      bulSegs = segsHam;
      bulSekans = sekansHam;
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

  // Olusan Shorts sekansi -> ana transkriptin o araligi (Altyazi sekmesi yeniden
  // yaziya dokmeden yukler). Ayarlarda en yeni 30 sekans tutulur.
  function shortsKaydet(items, an) {
    if (!window.KCaptions || !KCaptions.rawSegments || !HL.sliceSegments) return;
    var segs = HL.sliceSegments(bulSegs || KCaptions.rawSegments(), an.start, an.end);
    if (!segs.length) return;
    var s = K.settings();
    var harita = s.shortsAltyazi || {};
    var kayit = { ad: an.title, start: an.start, end: an.end, mod: KCaptions.mode ? KCaptions.mode() : "plain",
      ceviriDili: KCaptions.translationLang ? KCaptions.translationLang() : "", segs: segs, ts: Date.now() };
    // her sekansin kendi kopyasi: yatay Shorts'ta duzenleme dikeyi degistirmesin
    items.forEach(function (it) {
      if (it.id) harita[it.id] = JSON.parse(JSON.stringify(kayit));
      if (it.dikeyId) harita[it.dikeyId] = JSON.parse(JSON.stringify(kayit));
    });
    var anahtarlar = Object.keys(harita).sort(function (x, y) { return (harita[y].ts || 0) - (harita[x].ts || 0); });
    anahtarlar.slice(30).forEach(function (k) { delete harita[k]; });
    s.shortsAltyazi = harita;
    K.saveSettings();
  }

  // Her an icin alt sekans (+ istege bagli 9:16 Auto Reframe), "Suflo Shorts" kutusunda
  async function shortsOlustur() {
    if (!anlar.length || busy) return;
    var simdiki = String(KApp.ctx().sequenceId || "");
    if (bulSekans && simdiki && simdiki !== bulSekans) {
      durum("Viral anlar başka bir sekansta bulundu: o sekansı açıp tekrar dene (ya da anları yeniden bul).", "warn");
      return;
    }
    var dikey = !!(el("cap-vr-dikey") && el("cap-vr-dikey").checked);
    busy = true;
    var btn = el("cap-vr-shorts");
    btn.disabled = true;
    var liste = anlar.slice();
    var yapilan = 0, dikeySay = 0, hatalar = [];
    try {
      // Aralik basina ayri cagri: ilerleme gorunur, uzun Auto Reframe tek bir
      // zaman asimina takilip tum isi tekrarlatmaz (cift sekans olusmaz)
      for (var i = 0; i < liste.length; i++) {
        durum("Shorts " + (i + 1) + "/" + liste.length + " oluşturuluyor" + (dikey ? " (9:16 Auto Reframe sürebilir)…" : "…"));
        var a = liste[i];
        var r = await K.call("KS_makeShorts", {
          ranges: [{ start: a.start, end: a.end, name: "Shorts " + (i + 1) + " · " + a.title }],
          dikey: dikey
        }, 600000);
        if (!r.ok) { hatalar.push("Shorts " + (i + 1) + ": " + r.error); continue; }
        yapilan += r.made; dikeySay += r.vertical;
        shortsKaydet(r.items || [], a);
        (r.errors || []).forEach(function (h) { hatalar.push(h); });
      }
      if (!yapilan) throw new Error(hatalar.join("; ") || "Sekans oluşturulamadı.");
      durum(hatalar.length ? "Bazıları atlandı: " + hatalar.join("; ").slice(0, 220) : "", hatalar.length ? "warn" : "");
      KApp.toast(yapilan + " Shorts sekansı oluşturuldu" + (dikeySay ? " · " + dikeySay + " dikey (9:16)" : "") +
        " — Proje panelinde \"Suflo Shorts\" kutusu", "good", 8000);
    } catch (e) {
      durum("✕ " + K.hataYardimi(e), "bad");
    } finally {
      busy = false;
      btn.disabled = false;
    }
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
    if (el("cap-vr-shorts")) el("cap-vr-shorts").addEventListener("click", shortsOlustur);
    el("cap-vr-kopyala").addEventListener("click", kopyala);
  }

  return { init: init };
})();
