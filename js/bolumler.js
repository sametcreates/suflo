/*
 * Suflo — Bölümler (YouTube)
 * Altyazı editöründeki satırlardan bölüm önerir; isteğe bağlı olarak bulut
 * LLM'iyle (çeviriyle aynı anahtar) başlık üretir. Sonuç YouTube açıklamasına
 * kopyalanır ya da timeline'a "Chapter" marker'ı olarak eklenir.
 * Hesaplama js/chapters.js'te (saf, testli).
 */
window.KChapters = (function () {
  "use strict";

  var CH = window.SufloChapters;
  var list = [];   // [{ time (sequence sn), title }]
  var busy = false;

  function el(id) { return document.getElementById(id); }

  function uyari(msg, cls) {
    var e = el("cap-ch-warn");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function segs() { return window.KCaptions ? KCaptions.getSegments() : []; }
  function lang() { return window.KCaptions && KCaptions.language ? KCaptions.language() : "tr"; }
  function bitis() {
    var s = segs();
    return s.length ? s[s.length - 1].end : null;
  }

  // "1:23", "01:02:03", "83" -> saniye; gecersizse NaN
  function zamanOku(str) {
    var p = String(str || "").trim().split(":").map(Number);
    if (!p.length || p.some(function (x) { return !isFinite(x) || x < 0; })) return NaN;
    return p.reduce(function (a, x) { return a * 60 + x; }, 0);
  }

  function denetle() {
    if (!list.length) { uyari(""); return; }
    var v = CH.validate(list, { origin: 0, end: bitis() });
    if (v.ok) uyari("✓ YouTube kurallarına uygun · " + list.length + " bölüm", "good");
    else uyari("⚠ " + v.errors.slice(0, 3).join(" "), "warn");
  }

  function render() {
    var box = el("cap-ch-list");
    box.innerHTML = "";
    list.sort(function (a, b) { return a.time - b.time; });
    list.forEach(function (c, i) {
      var row = document.createElement("div");
      row.className = "ch-row";
      var t = document.createElement("input");
      t.type = "text"; t.className = "ch-time"; t.value = CH.tc(c.time);
      t.title = "Başlangıç (dk:sn)";
      t.onchange = function () {
        var v = zamanOku(t.value);
        if (isFinite(v)) { c.time = v; render(); }
        else t.value = CH.tc(c.time);
      };
      var ad = document.createElement("input");
      ad.type = "text"; ad.className = "ch-title"; ad.value = c.title; ad.maxLength = 80;
      ad.oninput = function () { c.title = ad.value; denetle(); };
      var sil = document.createElement("button");
      sil.type = "button"; sil.className = "btn tiny ch-del"; sil.textContent = "×"; sil.title = "Bölümü sil";
      sil.onclick = function () { list.splice(i, 1); render(); };
      row.appendChild(t); row.appendChild(ad); row.appendChild(sil);
      box.appendChild(row);
    });
    el("cap-ch-actions").hidden = list.length === 0;
    denetle();
  }

  function oner() {
    var s = segs();
    if (!s.length) { uyari("Önce altyazı oluştur ya da SRT içe aktar.", "warn"); return; }
    list = CH.suggest(s, { lang: lang(), origin: 0 });
    render();
  }

  async function aiBasliklar() {
    if (busy) return;
    var s = segs();
    if (!s.length) { uyari("Önce altyazı oluştur ya da SRT içe aktar.", "warn"); return; }
    var cfg = KCaptions.chatConfig();
    if (!cfg) { KApp.toast("AI başlıklar için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad"); return; }
    busy = true;
    el("cap-ch-ai").disabled = true;
    uyari("AI bölümleri çıkarıyor…");
    try {
      var p = CH.buildPrompt(s, { lang: lang(), origin: 0 });
      var json = await KCaptions.chatCall(cfg, {
        model: cfg.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }]
      });
      var content = json.choices && json.choices[0] && json.choices[0].message.content;
      var yeni = CH.parseResponse(content, s, { origin: 0 });
      if (yeni.length < 2) throw new Error("AI anlamlı bölüm döndürmedi — kural tabanlı öneriyi kullan.");
      list = yeni;
      render();
      KApp.toast(list.length + " bölüm hazır", "good");
    } catch (e) {
      uyari("✕ " + K.hataYardimi(e), "bad");
    } finally {
      busy = false;
      el("cap-ch-ai").disabled = false;
    }
  }

  function kopyala() {
    var txt = CH.format(list, { origin: 0 });
    function bitti() { KApp.toast("Bölümler kopyalandı — YouTube açıklamasına yapıştır", "good"); }
    function yedek() {
      var ta = document.createElement("textarea");
      ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      bitti();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(bitti).catch(yedek);
    } else yedek();
  }

  async function markerEkle() {
    if (!list.length) return;
    var r = await K.call("KS_addChapterMarkers", {
      chapters: list.map(function (c) { return { time: c.time, name: c.title }; }),
      replace: true
    });
    if (r.ok) {
      KApp.toast(r.added + " bölüm marker'ı eklendi" + (r.removed ? " (eskiler yenilendi)" : ""), "good");
    } else {
      uyari("✕ " + r.error, "bad");
    }
  }

  function ekle() {
    var son = list.length ? list[list.length - 1].time : 0;
    var ctx = window.KApp ? KApp.ctx() : {};
    var t = ctx && isFinite(Number(ctx.playhead)) && Number(ctx.playhead) > son ? Number(ctx.playhead) : son + 30;
    list.push({ time: t, title: "Yeni bölüm" });
    render();
  }

  function init() {
    if (!CH || !el("cap-ch-box")) return;
    el("cap-ch-suggest").addEventListener("click", oner);
    el("cap-ch-ai").addEventListener("click", aiBasliklar);
    el("cap-ch-copy").addEventListener("click", kopyala);
    el("cap-ch-markers").addEventListener("click", markerEkle);
    el("cap-ch-add").addEventListener("click", ekle);
  }

  return { init: init, list: function () { return list.slice(); } };
})();
