/*
 * Suflo — Yapay zekâ köprüsü (MCP) Ayarlar kartı ve eylem yürütücüleri (3.4, Deneysel)
 *
 * İnce yapıştırıcı: kurallar js/otomasyon.js (eylem listesi, doğrulama, temizlik) ve
 * js/otomasyon-sunucu.js'te (127.0.0.1 sunucusu). Burada yalnız:
 *  - Ayarlar kartı: Aç/Kapat (Pro: kapı + 3 deneme hakkı), Düzenlemeye izin ver,
 *    Yıkıcı eylemlerde onay iste, Yeni jeton, etkinlik listesi, Claude kopyala düğmeleri,
 *    Node denetimi
 *  - her eylem panel düğmelerinin çağırdığı AYNI işlevi çağırır (aynı doğrulama, kapı,
 *    deneme hakkı, kopya sekans); Pro eylemde ücretsiz kullanıcının hakkı varsa deneme
 *    kurulur (Pro.denemeBaslat), hak yalnız başarıda düşer (modülün kendi denemeHarca'sı)
 *  - yıkıcı eylemlerde panel içi onay kartı (Onayla / Reddet, 60 sn)
 *
 * Panel açılışında sunucu AÇILMAZ, Premiere'e / ağa gidilmez; açık durum kaydedilmez,
 * panel yeniden yüklenince kapanır. Kalmış bağlantı dosyası (çökme) açılışta silinir.
 */
window.KOtomasyon = (function () {
  "use strict";

  var O = window.SufloOtomasyon;
  var S = window.SufloOtomasyonSunucu;
  var sunucu = null;
  var etkinlik = [];
  var isler = O ? O.isTablosu() : null;
  var izin = { duzenleme: false, onay: true };   // bellekte: her açılışta güvenli varsayılan
  var bekleyenOnay = null;                         // { coz, saat }
  var mesgul = false;

  function el(id) { return document.getElementById(id); }
  function toast(m, t) { try { if (window.KApp && KApp.toast) KApp.toast(m, t); } catch (e) {} }
  function durum(msg, cls) {
    var e = el("mcp-durum");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function baglantiDosyasi() {
    try { var p = K.settingsPath(); return p ? K.path.join(K.path.dirname(p), "otomasyon.json") : ""; } catch (e) { return ""; }
  }
  function shimYolu() {
    var ext = "";
    try { ext = K.extensionPath(); } catch (e) {}
    return ext ? K.path.join(ext, "mcp", "suflo-mcp.js") : "<Suflo>/mcp/suflo-mcp.js";
  }

  /* ---------------- Yürütücüler: düğmelerin aynı işlevleri ---------------- */

  function durumla(id) {
    var e = el(id);
    var metin = e ? (e.textContent || "") : "";
    var kotu = e ? /\b(bad|warn)\b/.test(e.className) : false;
    return kotu ? { ok: false, hata: "uygulanamadi", mesaj: metin || "Not applied." } : { ok: true, durum: metin };
  }

  function markerGrubu(markerlar) {
    var gruplar = {}, sira = [];
    markerlar.forEach(function (m) {
      var ad = m.ad ? String(m.ad) : "Suflo";
      if (!Object.prototype.hasOwnProperty.call(gruplar, ad)) { gruplar[ad] = []; sira.push(ad); }
      gruplar[ad].push(m.saniye);
    });
    return sira.map(function (ad) { return { name: ad, times: gruplar[ad] }; });
  }

  var YURUT = {
    suflo_baglam: function () { return K.call("KS_getContext", undefined, 20000); },
    suflo_izler: function () { return K.call("KS_getTrackLayout", undefined, 20000); },
    suflo_secim: function () { return K.call("KS_getSelectedClips", undefined, 20000); },
    suflo_altyazi_oku: function (a) {
      var segs = window.KCaptions && window.KCaptions.getSegments ? (window.KCaptions.getSegments() || []) : [];
      var bas = a.baslangic || 0, adet = a.adet || O.ALTYAZI_SINIRI;
      return {
        ok: true, toplam: segs.length, baslangic: bas,
        satirlar: segs.slice(bas, bas + adet).map(function (s) {
          return { baslangic: Number(s.start) || 0, bitis: Number(s.end) || 0, metin: String(s.text || "") };
        })
      };
    },
    suflo_is_durumu: function (a) {
      return isler.oku(a.is) || { ok: false, hata: "bilinmeyen_is", mesaj: "Unknown or expired job id." };
    },
    suflo_doktor: async function () {
      var p = await K.call("KS_apiProbe", undefined, 30000);
      var cap = window.KCaptions || {};
      return {
        ok: true, surum: K.VERSION, premiere: p,
        motor: { hazir: !!(cap.engineReady && cap.engineReady()), yerel: !!(cap.localEngineReady && cap.localEngineReady()) },
        ffmpeg: !!(K.ffmpegKurulu && K.ffmpegKurulu())
      };
    },
    suflo_oynatma_kafasi: function (a) { return K.call("KS_setPlayerPosition", { sec: a.saniye }, 20000); },
    suflo_marker_ekle: async function (a) {
      if (a.bolum) {
        return K.call("KS_addChapterMarkers", { chapters: a.markerlar.map(function (m) { return { time: m.saniye, name: m.ad || "Bölüm" }; }) }, 60000);
      }
      var eklenen = 0, hatalar = [];
      var gruplar = markerGrubu(a.markerlar);
      for (var i = 0; i < gruplar.length; i++) {
        var r = await K.call("KS_addMarkers", gruplar[i], 60000);
        if (r && r.ok) eklenen += Number(r.added) || 0;
        else hatalar.push(r && r.error ? r.error : "?");
      }
      return eklenen > 0 ? { ok: true, eklenen: eklenen } : { ok: false, hata: "marker", mesaj: hatalar[0] || "No marker added." };
    },
    suflo_altyazi_olustur: function (a) {
      if (!window.KCaptions || !window.KCaptions.mcpOlustur) return { ok: false, hata: "yok", mesaj: "Captions module unavailable." };
      if (window.KCaptions.mesgulMu && window.KCaptions.mesgulMu()) return { ok: false, hata: "premiere_mesgul", mesaj: "Caption generation is already running." };
      var id = isler.ekle("altyazi");
      window.KCaptions.mcpOlustur(a).then(function (r) {
        isler.bitir(id, !!(r && r.ok), r && r.ok ? O.temizle(r) : (r && r.mesaj) || "failed");
      }, function (e) { isler.bitir(id, false, e && e.message ? e.message : String(e)); });
      return { ok: true, is: id, durum: "suruyor" };
    },
    suflo_altyazi_kanala: function () { return window.KCaptions.mcpKanala(); },
    suflo_altyazi_disari: function (a) { return window.KCaptions.mcpDisari(a.bicim); },
    suflo_sessizlik_analiz: function (a) { return window.KCut.mcpAnaliz(a); },
    suflo_zoom: async function () {
      if (!window.KZoom || !window.KZoom.calistir) return { ok: false, hata: "yok", mesaj: "Auto Zoom unavailable." };
      await window.KZoom.calistir();
      return durumla("zoom-status");
    },
    suflo_sessizlik_kes: function () { return window.KCut.mcpKes(); },
    suflo_metinden_kes: function () { return window.KTextCut.mcpKes(); },
    suflo_hiz_rampasi: async function () {
      if (!window.KHizRampasi || !window.KHizRampasi.uygula) return { ok: false, hata: "yok", mesaj: "Speed Ramp unavailable." };
      await window.KHizRampasi.uygula();
      return durumla("hiz-status");
    }
  };

  // Sunucunun çağırdığı tek giriş: eylem listede ve yürütücüsü var
  function yurut(ad, args, baglam) {
    var e = O.eylem(ad);
    if (!e || !Object.prototype.hasOwnProperty.call(YURUT, ad)) return Promise.resolve({ ok: false, hata: "bilinmeyen_eylem", mesaj: "Unknown action." });
    // Ücretsiz kullanıcının deneme hakkı: düğmedeki "Ücretsiz dene" gibi kurulur, modülün kapısı geçer,
    // hak yalnız işlem başarıyla bitince modülün kendi denemeHarca'sıyla düşer
    if (e.pro && baglam && baglam.deneme && typeof Pro !== "undefined" && Pro.denemeBaslat) Pro.denemeBaslat(e.pro);
    try { return Promise.resolve(YURUT[ad](args || {})); }
    catch (er) { return Promise.reject(er); }
  }

  /* ---------------- Onay kartı ---------------- */

  function onayIste(ad, args, ozet, sure) {
    return new Promise(function (resolve) {
      var kart = el("mcp-onay-kart");
      if (!kart) { resolve(false); return; }
      if (bekleyenOnay) bekleyenOnay.coz(false);
      var bitis = Date.now() + (sure || 60000);
      el("mcp-onay-ozet").textContent = ozet;
      kart.hidden = false;
      function sayac() {
        var k = Math.max(0, Math.ceil((bitis - Date.now()) / 1000));
        el("mcp-onay-sure").textContent = k + " sn";
        if (k <= 0) coz(false);
      }
      var saat = setInterval(sayac, 500);
      sayac();
      function coz(v) {
        if (!bekleyenOnay || bekleyenOnay.coz !== coz) return;
        clearInterval(saat);
        bekleyenOnay = null;
        kart.hidden = true;
        resolve(v === true);
      }
      bekleyenOnay = { coz: coz };
      try { kart.scrollIntoView({ block: "nearest" }); } catch (e) {}
      toast("Yapay zekâ köprüsü onay bekliyor: " + ozet, "warn");
    });
  }

  /* ---------------- Etkinlik listesi ---------------- */

  function iki(n) { return (n < 10 ? "0" : "") + n; }
  function etkinlikCiz() {
    var ul = el("mcp-etkinlik");
    if (!ul) return;
    ul.textContent = "";
    if (!etkinlik.length) {
      var bos = document.createElement("li");
      bos.className = "dim";
      bos.textContent = "Henüz çağrı yok.";
      ul.appendChild(bos);
      return;
    }
    etkinlik.slice().reverse().forEach(function (k) {
      var li = document.createElement("li");
      var d = new Date(k.zaman);
      var zaman = document.createElement("span");
      zaman.className = "dim";
      zaman.textContent = iki(d.getHours()) + ":" + iki(d.getMinutes()) + ":" + iki(d.getSeconds());
      var ad = document.createElement("b");
      ad.textContent = O.trAd(k.ad);
      var s = document.createElement("span");
      s.className = k.sonuc === "ok" ? "mcp-ok" : "mcp-hata";
      s.textContent = k.sonuc === "ok" ? "✓" : "✕ " + k.kod;
      li.appendChild(zaman); li.appendChild(ad); li.appendChild(s);
      ul.appendChild(li);
    });
  }
  function kaydet(k) {
    etkinlik = O.etkinlikEkle(etkinlik, k);
    etkinlikCiz();
  }

  /* ---------------- Aç / kapat ---------------- */

  function arayuz() {
    var acik = !!(sunucu && sunucu.acikMi());
    var b = el("mcp-ac");
    if (b) { b.textContent = acik ? "Köprüyü kapat" : "Köprüyü aç"; b.classList.toggle("primary", !acik); b.disabled = mesgul; }
    if (el("mcp-jeton")) el("mcp-jeton").disabled = !acik;
    if (el("mcp-acik-rozet")) el("mcp-acik-rozet").hidden = !acik;
  }

  function sunucuKur() {
    return S.olustur({
      otomasyon: O,
      dosya: baglantiDosyasi(),
      yurut: yurut,
      mesgulMu: function () {
        return (K.hostMesgul && K.hostMesgul()) || !!(window.KCaptions && window.KCaptions.mesgulMu && window.KCaptions.mesgulMu());
      },
      izinler: function () { return { duzenleme: izin.duzenleme, onay: izin.onay }; },
      onayIste: onayIste,
      proIzin: function (f) {
        if (typeof Pro === "undefined" || !Pro.izinVar) return { ok: true, deneme: false };
        return Pro.izinVar(f);
      },
      kayit: kaydet,
      gunluk: function (m) { try { K.log(m); } catch (e) {} },
      onKapandi: function (neden) {
        if (bekleyenOnay) bekleyenOnay.coz(false);
        if (neden === "bosta") { durum("30 dakika çağrı gelmedi: köprü kapandı.", "warn"); toast("Yapay zekâ köprüsü kapandı (30 dakika boşta)", "warn"); }
        arayuz();
      }
    });
  }

  async function nodeDenetle() {
    var e = el("mcp-node");
    if (e) e.textContent = "Node aranıyor…";
    var r = null;
    try { r = await K.run("node", ["--version"], { timeout: 8000 }); } catch (er) { r = null; }
    var surum = r && r.code === 0 ? String(r.stdout || "").trim() : "";
    var ana = Number((/^v(\d+)/.exec(surum) || [])[1] || 0);
    if (e) {
      if (!surum) e.textContent = "Node bulunamadı: Claude Desktop ya da Claude Code köprüyü \"node\" ile başlatır. nodejs.org'dan Node 18 ya da üstünü kur.";
      else if (ana < 18) e.textContent = "Node " + surum + " eski: köprü için Node 18 ya da üstü gerekir.";
      else e.textContent = "Node " + surum + " hazır.";
    }
    return ana >= 18;
  }

  async function ac(ev) {
    if (mesgul || (sunucu && sunucu.acikMi())) return;
    if (!O || !S || !K.nodeOK) { durum("Bu ortamda köprü açılamaz (Node yok).", "bad"); return; }
    // Pro: köprüyü açmak (ücretsizde 3 deneme hakkı; hak yalnız köprü açılınca düşer). Her eylem ayrıca kendi kapısında.
    if (typeof Pro !== "undefined" && !Pro.gate("mcp", { deneme: true, yeniden: ac })) return;
    mesgul = true;
    arayuz();
    durum("Köprü açılıyor…");
    if (!sunucu) sunucu = sunucuKur();
    var sonuc = await sunucu.baslat().then(function (r) { return { ok: true, port: r.port }; },
      function (e) { return { ok: false, hata: e && e.message ? e.message : String(e) }; });
    mesgul = false;
    if (sonuc.ok) {
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("mcp", KApp.toast);   // deneme: yalniz basarida
      durum("Köprü açık: yalnız bu bilgisayardan (127.0.0.1), 30 dakika boşta kalırsa kapanır.", "good");
      nodeDenetle();
    } else {
      durum("✕ Köprü açılamadı: " + sonuc.hata, "bad");
    }
    arayuz();
  }

  function kapat() {
    if (sunucu) sunucu.durdur("kapat");
    if (bekleyenOnay) bekleyenOnay.coz(false);
    durum("Köprü kapalı.");
    arayuz();
  }

  function panoya(metin, mesaj) {
    var ta = document.createElement("textarea");
    ta.value = metin;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove();
    toast(ok ? mesaj : "Kopyalanamadı", ok ? "good" : "bad");
  }

  // Çökmüş oturumdan kalan bağlantı dosyası: yalnız dosya sistemi, ağ yok
  function kalanDosyayiSil() {
    try {
      var f = baglantiDosyasi();
      if (f && K.fs.existsSync(f)) K.fs.unlinkSync(f);
    } catch (e) {}
  }

  function init() {
    if (!el("mcp-ac") || !O || !S) return;
    kalanDosyayiSil();
    el("mcp-ac").addEventListener("click", function (ev) {
      if (sunucu && sunucu.acikMi()) kapat(); else ac(ev);
    });
    var d = el("mcp-duzenleme"), o = el("mcp-onay");
    if (d) { d.checked = false; d.addEventListener("change", function () { izin.duzenleme = !!d.checked; }); }
    if (o) { o.checked = true; o.addEventListener("change", function () { izin.onay = !!o.checked; }); }
    if (el("mcp-jeton")) el("mcp-jeton").addEventListener("click", function () {
      if (sunucu && sunucu.jetonYenile()) toast("Yeni jeton oluşturuldu: eski jeton artık geçmez", "good");
    });
    if (el("mcp-kopyala-desktop")) el("mcp-kopyala-desktop").addEventListener("click", function () {
      panoya(O.claudeDesktopJson(shimYolu()), "Claude Desktop ayarı kopyalandı");
    });
    if (el("mcp-kopyala-code")) el("mcp-kopyala-code").addEventListener("click", function () {
      panoya(O.claudeCodeKomutu(shimYolu()), "Claude Code komutu kopyalandı");
    });
    if (el("mcp-node-denetle")) el("mcp-node-denetle").addEventListener("click", nodeDenetle);
    if (el("mcp-guvenlik-link")) el("mcp-guvenlik-link").addEventListener("click", function (e) {
      e.preventDefault();
      try { K.cs.openURLInDefaultBrowser("https://suflo.app/mcp-guvenlik"); } catch (er) {}
    });
    if (el("mcp-onayla")) el("mcp-onayla").addEventListener("click", function () { if (bekleyenOnay) bekleyenOnay.coz(true); });
    if (el("mcp-reddet")) el("mcp-reddet").addEventListener("click", function () { if (bekleyenOnay) bekleyenOnay.coz(false); });
    // Panel yeniden yüklenir / Premiere kapanırken köprü kapanır, bağlantı dosyası silinir
    window.addEventListener("beforeunload", function () { if (sunucu) sunucu.durdur("panel"); });
    window.addEventListener("unload", function () { if (sunucu) sunucu.durdur("panel"); });
    etkinlikCiz();
    arayuz();
  }

  return {
    init: init,
    acikMi: function () { return !!(sunucu && sunucu.acikMi()); },
    // testler
    _yurut: yurut,
    _YURUT: YURUT,
    _izin: izin,
    _etkinlik: function () { return etkinlik.slice(); }
  };
})();
