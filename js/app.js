/*
 * Kesit — uygulama kabuğu
 * Sekmeler, bağlam yoklaması (seçili klip otomatik algılanır), toast bildirimleri,
 * ayarlar ve ffmpeg denetimi.
 */
window.KApp = (function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  // Ödeme bağlantısı js/pricing.js'te: gösterilen fiyatla aynı para birimi (USD varyantı
  // yokken İngilizce arayüz de TRY ödemesini açar)
  function arayuzDili() {
    try { return window.SufloI18n ? SufloI18n.getLang() : "tr"; } catch (e) { return "tr"; }
  }
  function proCheckoutUrl(feature) {
    var surum = window.K && K.VERSION ? K.VERSION : "unknown";
    // Arkadaşından aldığı davet kodunu kaydettiyse indirim ödeme sayfasına kendiliğinden gelir
    var kod = window.KDavet && KDavet.odemeKodu ? KDavet.odemeKodu() : "";
    return SufloPricing.checkoutUrl(arayuzDili(), feature, surum, kod);
  }

  // Davet şeridi anı: ilk kesim (magiccut.js), ilk Shorts (viral.js), 5. başarılı uygulama (captions.js)
  function davetAni(olay) {
    try { if (window.KDavet && KDavet.ani) KDavet.ani(olay); } catch (e) { K.log("davet: " + (e && e.message ? e.message : e)); }
  }

  var ctx = { hasSeq: false, sel: null, sequence: "" };
  var ctxListeners = [];
  var polling = false;

  /* ---------------- Toast ---------------- */

  function toast(msg, kind, sure) {
    var box = el("toasts");
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add("out");
      setTimeout(function () { t.remove(); }, 300);
    }, sure || (kind === "bad" ? 5200 : 3200));
  }

  /* ---------------- Bağlam ---------------- */

  function onContext(fn) { ctxListeners.push(fn); }

  var CLAP_IC = '<svg class="ctx-ic" viewBox="0 0 16 16"><path d="M1.8 6.2 h12.4 v6.4 a1.4 1.4 0 0 1 -1.4 1.4 h-9.6 a1.4 1.4 0 0 1 -1.4-1.4 z" stroke="currentColor" stroke-width="1.3" fill="none"/><path d="M2.2 6.2 L3.4 3.3 L14.2 4.6 L13.4 6.2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linejoin="round"/><path d="M6.4 3.7 L5.4 6.2 M9.9 4.1 L8.9 6.2" stroke="currentColor" stroke-width="1.1"/></svg>';

  function renderContext() {
    var elx = el("ctx-text");
    var dot = el("host-dot");
    var strip = el("context-strip");
    if (!ctx.connected) {
      dot.className = "host-dot off";
      strip.innerHTML = CLAP_IC + '<span id="ctx-text" class="dim">' +
        (K.nodeOK ? "Premiere'e bağlanılamadı" : "önizleme modu — Premiere dışında") + "</span>";
      return;
    }
    dot.className = "host-dot ok";
    if (!ctx.hasSeq) {
      strip.innerHTML = CLAP_IC + '<span id="ctx-text" class="dim">Sequence yok</span>' +
        '<span class="pill">bir sequence aç</span>';
    } else if (ctx.sel) {
      var pill = (ctx.selCount > 1)
        ? ctx.selCount + " klip seçili"
        : ctx.sel.dur.toFixed(1) + " sn";
      strip.innerHTML = CLAP_IC + '<span id="ctx-text" class="sel-name"></span>' +
        '<span class="pill live"></span>';
      strip.querySelector(".sel-name").textContent = ctx.sel.name;
      strip.querySelector(".pill").textContent = pill;
    } else {
      strip.innerHTML = CLAP_IC + '<span id="ctx-text" class="sel-name"></span>' +
        '<span class="pill">Klip seçilmedi</span>';
      strip.querySelector(".sel-name").textContent = ctx.sequence;
    }
  }

  function esc(s) {
    var d = document.createElement("i");
    d.textContent = s || "";
    return d.innerHTML;
  }

  /*
   * Bağlam yoklaması. `polling` kilidi eşzamanlı çağrıyı engeller, ama takılı kalırsa panel
   * seçili klibi bir daha hiç görmez — bu yüzden bekçi var: makul süreyi aşan yoklama
   * terk edilmiş sayılır ve kilit açılır. K.call zaten kendi zaman aşımıyla sonuçlanıyor;
   * bu ikinci savunma katmanı.
   */
  var pollBasladi = 0;
  var POLL_BEKCI = 30000;

  async function pollContext() {
    // Premiere hala onceki bir cagriyla mesgul: yeni yoklama kuyruga girip birikmesin
    if (K.hostMesgul && K.hostMesgul()) return;
    if (polling) {
      if (Date.now() - pollBasladi < POLL_BEKCI) return;
      K.log("baglam yoklamasi takildi (" + Math.round((Date.now() - pollBasladi) / 1000) + " sn), kilit aciliyor");
      polling = false;
    }
    polling = true;
    pollBasladi = Date.now();
    try {
      var r = await K.call("KS_getContext", undefined, 20000);
      var prev = JSON.stringify({ s: ctx.sel && ctx.sel.mediaPath, n: ctx.selCount, q: ctx.sequence, qi: ctx.sequenceId, c: ctx.connected });
      if (r.ok) {
        ctx = r;
        ctx.connected = true;
      } else {
        ctx = { connected: false, hasSeq: false, sel: null, sequence: "" };
      }
      var now = JSON.stringify({ s: ctx.sel && ctx.sel.mediaPath, n: ctx.selCount, q: ctx.sequence, qi: ctx.sequenceId, c: ctx.connected });
      renderContext();
      if (prev !== now) ctxListeners.forEach(function (fn) { fn(ctx); });
    } finally {
      polling = false;
    }
  }

  var contextPollingBasladi = false;
  function contextPollingBaslat() {
    // 26.3'te ilk pointer olayi bazi macOS/CEP kombinasyonlarinda panele
    // ulasmiyor. Yoklama daha once baslamissa bile gercek bir kullanici
    // etkilesimi, baglam takili kalmisken anlik yeniden deneme yapabilsin.
    if (contextPollingBasladi) {
      if (!ctx.connected) guvenli("bağlam", pollContext);
      return;
    }
    contextPollingBasladi = true;
    guvenli("bağlam", pollContext);
    setInterval(function () {
      // Gizli/dock'ta pasif panel Premiere'e gereksiz host komutu gondermesin.
      if (!document.hasFocus || document.hasFocus()) pollContext();
    }, 2500);
  }

  // Kullanıcı eyleminden sonra (ör. rehber örnek klibi yeni sekansta açtı) bağlamı
  // beklemeden tazele. Yalnız tıklama işleyicilerinden çağrılır.
  function pollNow() {
    if (!contextPollingBasladi) { contextPollingBaslat(); return; }
    guvenli("bağlam", pollContext);
  }

  function contextEtkilesim() {
    // Arka planda host yoklamasi yapma: yalniz kullanici panelle gercekten
    // etkilesmisse baslat/yeniden dene. `click`, pointerdown'in Mac CEP'te
    // kayboldugu durumu; keydown ise klavye kullananlari kapsar.
    if (!ctx.connected) contextPollingBaslat();
  }

  /* ---------------- Görünüm: Altyazı ↔ Ayarlar ---------------- */

  /*
   * Suflo yalnizca altyazi yapar. Panelde iki gorunum var: Altyazi ve Ayarlar;
   * disli ikisi arasinda gidip gelir. (Sekme cubugu kaldirildi — SFX/Kesim/Motion
   * modulleri urunden cikarildi, tek modul icin sekme gostermek gurultu.)
   */
  var tabListeners = {};
  function onTab(name, fn) { tabListeners[name] = fn; }

  function goster(ad) {
    Array.prototype.forEach.call(document.querySelectorAll(".tabpane"), function (p) {
      p.classList.remove("active");
    });
    var hedef = el("tab-" + ad);
    if (hedef) hedef.classList.add("active");
    // sekme çubuğu + dişli: aktif işareti tek yerden
    Array.prototype.forEach.call(document.querySelectorAll(".tab[data-tab]"), function (b) {
      b.classList.toggle("active", b.dataset.tab === ad);
    });
    // sol menu: ayni sekmeye birden fazla girdi varsa (Yazi/Favoriler) ilkini isaretle
    var yanAktif = document.querySelector('.yan-menu .ky-oge.on[data-tab="' + ad + '"]');
    if (!yanAktif) {
      Array.prototype.forEach.call(document.querySelectorAll(".yan-menu .ky-oge"), function (x) {
        x.classList.toggle("on", x.dataset.tab === ad && !yanAktif && (yanAktif = x));
      });
    }
    if (tabListeners[ad]) tabListeners[ad]();
  }

  function ayarlardanCik() { goster("captions"); }

  function initTabs() {
    if (el("set-back")) el("set-back").addEventListener("click", ayarlardanCik);

    // Esc: ayarlar açıkken ve bir alana yazmıyorken çıkar
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (el("tab-settings").classList.contains("active")) { e.preventDefault(); ayarlardanCik(); }
    });

    // Sekmeler: dişli aç/kapa gibi davranır, diğerleri doğrudan geçer
    Array.prototype.forEach.call(document.querySelectorAll(".tab[data-tab]"), function (b) {
      b.addEventListener("click", function () {
        var ad = b.dataset.tab;
        if (ad === "settings" && el("tab-settings").classList.contains("active")) ad = "captions";
        goster(ad);
      });
    });

    // Sol menu: tum bolumler solda (Rush duzeni). data-kat tasiyanlar
    // Yazi sekmesini ilgili kategoriyle acar (Yazi Animasyonlari / Favoriler).
    Array.prototype.forEach.call(document.querySelectorAll(".yan-menu .ky-oge[data-tab]"), function (b) {
      b.addEventListener("click", function () {
        goster(b.dataset.tab);
        var kat = b.getAttribute("data-kat");
        if (kat && window.KLib && KLib.setKategori) KLib.setKategori(kat);
        Array.prototype.forEach.call(document.querySelectorAll(".yan-menu .ky-oge"), function (x) {
          x.classList.toggle("on", x === b);
        });
      });
    });
  }

  /* ---------------- Ayarlar ---------------- */



  /* ---------------- Yerel Whisper kurulumu ---------------- */

  var installingLocal = false;

  function refreshEngineRoute() {
    var out = el("set-engine-route");
    if (!out) return;
    var s = K.settings();
    var local = !!KEngine.activeModel() && !!K.whisperLocal();
    var cloud = s.provider !== "local" && !!s.apiKey;
    var names = { groq: "Groq", openai: "OpenAI", custom: "özel bağlantı" };
    if (local && cloud) out.textContent = "Önce yerel yüksek doğruluk · sorun olursa " + (names[s.provider] || "bulut") + " yedeği";
    else if (local) out.textContent = "Yerel, çevrimdışı ve sınırsız · bulut yedeği kapalı";
    else if (cloud) out.textContent = "Yerel çekirdek kurulu değil · " + (names[s.provider] || "bulut") + " rotası kullanılacak";
    else out.textContent = "Motor hazır değil · yerel çekirdeği kur veya bulut yedeği ekle";
  }

  function refreshLocalStatus() {
    var box = el("set-local-status");
    var btn = el("set-local-install");
    var m = KEngine.activeModel();
    var gpu = KEngine.gpuInfo();
    var derleme = KEngine.installedBuild();
    var hw = derleme === "cuda"
      ? "GPU" + (gpu && gpu.name ? " (" + gpu.name.replace(/NVIDIA\s*/i, "") + ")" : "")
      : (derleme === "metal" ? "Metal (Apple GPU)" : "CPU");
    if (m) {
      box.className = "inline-status good";
      box.textContent = "✓ " + m.label.split(" —")[0] + " · " + hw + (KEngine.vadPath() ? " · VAD" : "");
      btn.textContent = "Değiştir";
      btn.hidden = false;
    } else {
      box.className = "inline-status";
      box.textContent = installingLocal ? box.textContent : "kurulu değil";
      btn.textContent = "İndir & kur";
      btn.hidden = installingLocal;
    }
    refreshModelPicker();
    refreshEngineRoute();
  }

  // Ayarlar'daki model listesi: kurulu olanlar işaretli, seçim kalıcı
  function refreshModelPicker() {
    var sel = el("set-model");
    if (!sel) return;
    var inst = KEngine.installedModels().map(function (m) { return m.id; });
    var active = KEngine.activeModel();
    sel.innerHTML = "";
    KEngine.MODELS.forEach(function (m) {
      var o = document.createElement("option");
      o.value = m.id;
      var kurulu = inst.indexOf(m.id) !== -1;
      o.textContent = (kurulu ? "✓ " : "") + m.label + " — " + KEngine.fmtMB(m.sizeMB);
      sel.appendChild(o);
    });
    sel.value = active ? active.id : (K.settings().model || "turbo");
  }

  /*
   * opts (isteğe bağlı, rehber): { modelId, useGpu, ffmpegArkada }
   *   modelId      Ayarlar'daki seçim yerine bu model (rehber: Türkçe için Small)
   *   useGpu       true/false: GPU kararını zorla (rehber: ilk kurulumda cuBLAS İNMEZ)
   *   ffmpegArkada ffmpeg motordan sonra arka planda insin (ilk altyazı beklemesin)
   * Döner: kurulum sonucu (KEngine.install) ya da hata/iptalde null.
   */
  async function installLocalWhisper(progressEl, opts) {
    opts = opts || {};
    if (installingLocal) return null;
    if (!K.nodeOK) { toast("Bu ortamda kurulamaz — Premiere içinde dene", "bad"); return null; }
    installingLocal = true;
    var box = el("set-local-status");
    var kurulumHatasi = null;
    var sonuc = null;
    // ilerleme metnini yazdığımız öğenin kendi etiketi: iş bitince geri konur,
    // yoksa kurulum kartındaki düğme "Motor iniyor… %62" yazısında donup kalıyor
    var progressEski = progressEl ? progressEl.textContent : null;
    el("set-local-install").hidden = true;
    function say(msg) {
      box.className = "inline-status";
      box.textContent = msg;
      if (progressEl) progressEl.textContent = msg;
    }
    try {
      say("Donanım kontrol ediliyor…");
      var gpu = await KEngine.detectGpu(true);
      var useGpu = typeof opts.useGpu === "boolean" ? (opts.useGpu && gpu.kind === "cuda")
        : (gpu.kind === "cuda" && el("set-gpu") ? el("set-gpu").checked : (gpu.kind === "cuda"));
      var modelId = opts.modelId || (el("set-model") && el("set-model").value) || K.settings().model || "turbo";

      var res = await KEngine.install({
        modelId: modelId, useGpu: useGpu, onStatus: say, ffmpegArkada: !!opts.ffmpegArkada,
        onFfmpeg: function (m) {
          var fb = el("set-ffmpeg-status");
          if (fb) { fb.className = "inline-status"; fb.textContent = m; }
        }
      });
      sonuc = res;
      if (res.ffmpegIsi) {
        // ffmpeg arka planda iniyor: bittiğinde Ayarlar'daki durum ve kurulum notu tazelensin
        res.ffmpegIsi.then(function () {
          checkFfmpeg();
          KCaptions.refreshSetup();
        });
      }

      var donanim = res.build === "cuda" ? " · GPU hızlandırmalı"
        : (res.build === "metal" ? " · Metal hızlandırmalı" : " · CPU");
      toast("Hazır: " + res.model.label.split(" —")[0] + donanim +
        (res.vad ? " · sessizlik atlama açık" : ""), "good");
    } catch (e) {
      // kurulum hatası en kritik an: çözüm önerisiyle ve uzun süre göster
      kurulumHatasi = K.hataYardimi(e);
      toast(kurulumHatasi, "bad", 12000);
    } finally {
      installingLocal = false;
      if (progressEl && progressEski !== null) progressEl.textContent = progressEski;
      refreshLocalStatus();
      KCaptions.refreshSetup();
      // refreshLocalStatus kutuyu ezdiği için hata ondan SONRA basılır
      if (kurulumHatasi) {
        box.className = "inline-status bad";
        box.textContent = "✕ " + kurulumHatasi;
      }
    }
    return sonuc;
  }


  /* ---------------- Suflo Pro lisans UI ---------------- */

  // Pro durumunu arayüze yansıt: ayar kartları + sekme/buton rozetleri.
  // pro.js yapılandırılmadıysa (lansman öncesi) markLocked hiçbir şey yapmaz.
  function reflectPro() {
    if (!window.Pro) return;
    var s = Pro.status();

    var locked = el("pro-locked-card"), active = el("pro-active-card");
    if (locked && active) {
      locked.hidden = !!s.pro;
      active.hidden = !s.pro;
      var em = el("pro-email");
      if (em) em.textContent = s.email ? "· " + s.email : "";
      var rc = el("pro-recheck");
      if (rc) rc.hidden = !s.needsRecheck;
    }
    denemeListesiniCiz(s);
    temizKartiniCiz(s);

    // Pro'ya kilitli girişler: sekmeler + tekil butonlar
    Pro.markLocked(document.querySelector('.tab[data-tab="cut"]'), !s.pro);
    Pro.markLocked(document.querySelector('.tab[data-tab="beat"]'), !s.pro);
    // SFX satirinin kendi ky-kilit rozeti var; ikinci bir ::after rozeti ekleme.
    // Emoji Assets UCRETSIZ (Samet karari) — kilit rozeti yok.
    Pro.markLocked(el("cap-translate-go"), !s.pro);
    Array.prototype.forEach.call(document.querySelectorAll("[data-kilit]"), function (badge) {
      badge.hidden = !!s.pro;
    });
    var styleUpsell = el("cap-style-upsell");
    if (styleUpsell) styleUpsell.hidden = !!s.pro;

    // Kilitli secenekler (karaoke modlari, kelimeli animasyonlar) acilir
    // listede " — PRO" ekiyle gorunsun: kullanici neyin ucretli oldugunu
    // secmeyi denemeden once gorur
    Array.prototype.forEach.call(document.querySelectorAll("option[data-pro]"), function (o) {
      if (!o.dataset.temel) o.dataset.temel = o.textContent;
      o.textContent = s.pro ? o.dataset.temel : o.dataset.temel + " — PRO";
    });
    // Stil kartlari ucretsiz kullanicida canli onizlenebilir; ancak her kart
    // timeline ciktisinin Pro oldugunu acik bir kilitle anlatir.
    Array.prototype.forEach.call(document.querySelectorAll(".stil-sec"), function (card) {
      card.classList.toggle("pro-preview", !s.pro);
      var ad = card.querySelector(".ss-bilgi b");
      var aciklama = card.querySelector(".ss-bilgi i");
      var etiket = ad ? ad.textContent.trim() : "Stil";
      if (aciklama && aciklama.textContent.trim()) etiket += " — " + aciklama.textContent.trim();
      card.setAttribute("aria-label", etiket + (s.pro ? "" : " · Pro önizleme, timeline çıktısı kilitli"));
    });

    // Header PRO chip: ucretsizde satis, Pro'da statu
    var chip = el("pro-chip");
    if (chip) chip.classList.toggle("aktif", !!s.pro);

    // Kilitli sekme tanitim kartlari: Pro'da gizli
    // (emoji tanitimi yok: Emoji Assets ucretsiz, karti HTML'den kaldirildi)
    ["yazi-tanitim", "preset-tanitim", "sfx-tanitim", "motionbg-tanitim", "cut-tanitim", "beat-tanitim", "zoom-tanitim", "gecis-tanitim", "kanca-tanitim"].forEach(function (id) {
      var t = el(id);
      if (t) t.hidden = !!s.pro;
    });

    // MOGRT kartlarindaki PRO rozetleri tazelensin
    if (window.KLib && el("mogrt-grid") && el("mogrt-grid").children.length) KLib.tara();
    if (window.KPresets && el("preset-grid")) KPresets.render();
    if (window.KSfx && el("sfx-list") && el("sfx-list").children.length) KSfx.tara();
    if (window.KEmojiAssets && el("emoji-assets-grid") && el("emoji-assets-grid").children.length) KEmojiAssets.tara();
  }

  /* ---------------- Pro'yu dene: kalan haklar + satın alma sonrası temiz yeniden oluşturma ---------------- */

  // Ücretsizde her aracın kalan deneme hakkı ("Otomatik kesim 2/3"); Pro'da gizli
  function denemeListesiniCiz(s) {
    var kart = el("pro-deneme-kart"), liste = el("pro-deneme-liste");
    if (!kart || !liste) return;
    var d = s.deneme;
    kart.hidden = !!s.pro || !d || !d.ozellikler;
    if (kart.hidden) return;
    liste.innerHTML = "";
    d.ozellikler.forEach(function (o) {
      var li = document.createElement("li");
      if (o.kalan <= 0) li.className = "bitti";
      var ad = document.createElement("span");
      ad.textContent = o.ad;
      var n = document.createElement("b");
      n.textContent = o.kalan + "/" + o.hak;
      li.appendChild(ad);
      li.appendChild(n);
      liste.appendChild(li);
    });
  }

  var temizMesgul = false;
  function tarihEtiketi(ts) {
    var t = new Date(Number(ts) || 0);
    if (!ts || isNaN(t.getTime())) return "";
    function iki(n) { return (n < 10 ? "0" : "") + n; }
    return iki(t.getDate()) + "." + iki(t.getMonth() + 1) + " " + iki(t.getHours()) + ":" + iki(t.getMinutes());
  }

  // Pro'da, deneme hakkıyla üretilmiş (filigranlı) çıktı kaldıysa listele
  function temizKartiniCiz(s) {
    var kart = el("pro-temiz-kart"), liste = el("pro-temiz-liste");
    if (!kart || !liste || !Pro.denemeCiktilari) return;
    var kayitlar = s.pro ? Pro.denemeCiktilari() : [];
    kart.hidden = kayitlar.length === 0;
    if (temizMesgul) return;   // iş sürerken düğmeler yerinde kalsın
    liste.innerHTML = "";
    kayitlar.slice().reverse().forEach(function (k) {
      var satir = document.createElement("div");
      satir.className = "pro-temiz-satir";
      var bilgi = document.createElement("span");
      var tur = document.createElement("b");
      tur.textContent = k.tur === "kanca" ? "Kanca başlığı" : "Stilli altyazı";
      bilgi.appendChild(tur);
      bilgi.appendChild(document.createTextNode(" · " + (k.sekans || k.sequenceId) + (k.ts ? " · " + tarihEtiketi(k.ts) : "")));
      var yap = document.createElement("button");
      yap.type = "button";
      yap.className = "btn tiny primary";
      yap.textContent = "Temiz oluştur";
      yap.addEventListener("click", function () { denemeyiTemizle(k, yap); });
      var cikar = document.createElement("button");
      cikar.type = "button";
      cikar.className = "btn tiny";
      cikar.textContent = "Listeden çıkar";
      cikar.title = "Bu çıktıyı yeniden oluşturmayacaksan listeden kaldırır (timeline'a dokunmaz)";
      cikar.addEventListener("click", function () { if (!temizMesgul) Pro.denemeCiktisiSil(k.path); });
      satir.appendChild(bilgi);
      satir.appendChild(yap);
      satir.appendChild(cikar);
      liste.appendChild(satir);
    });
  }

  async function denemeyiTemizle(k, btn) {
    if (temizMesgul || !window.SufloOverlayRender) return;
    if (!Pro.isPro()) { Pro.gate("overlay"); return; }
    var durum = el("pro-temiz-durum");
    function yaz(m, c) { if (durum) { durum.textContent = m || ""; durum.className = "inline-status" + (c ? " " + c : ""); } }
    temizMesgul = true;
    btn.disabled = true;
    try {
      var r = await SufloOverlayRender.temizYenidenOlustur(K, k, { durum: function (m) { yaz(m); } });
      // elle: deneme klibi düzenlenmiş ve yerinde değiştirilemedi; timeline'a dokunulmadı, kayıt listede kalır
      if (!r.ok) { yaz(r.sekansAc || r.elle ? r.hata : "✕ " + r.hata, r.sekansAc || r.elle ? "warn" : "bad"); return; }
      Pro.denemeCiktisiSil(k.path);
      var son = SufloOverlayRender.sonucMesaji(r);
      // uyarı satırı kartta kalsın (bildirim kaybolur; içinde dosya yolu olabilir)
      yaz(son.tur === "warn" ? son.metin : "", son.tur === "warn" ? "warn" : "");
      toast(son.metin, son.tur, 9000);
    } catch (e) {
      yaz("✕ " + K.hataYardimi(e), "bad");
    } finally {
      temizMesgul = false;
      btn.disabled = false;
      reflectPro();
    }
  }

  // Tanıtım kartından kurulan deneme: aracın asıl düğmesinin adını söyle ve onu göster
  function denemeyeYonlendir(feature) {
    var ip = window.SufloDeneme && SufloDeneme.tanitimIpucu ? SufloDeneme.tanitimIpucu(feature) : null;
    if (!ip) return;
    toast(ip.mesaj, "good", 7000);
    var hedef = ip.hedef ? el(ip.hedef) : null;
    if (!hedef) return;
    try { hedef.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { try { hedef.scrollIntoView(); } catch (e2) {} }
    if (!hedef.disabled && hedef.tagName === "BUTTON") { try { hedef.focus({ preventScroll: true }); } catch (e3) {} }
  }

  function initPro() {
    if (!window.Pro || !el("pro-activate")) return;

    el("pro-activate").addEventListener("click", function () {
      var key = el("pro-key").value;
      var msg = el("pro-msg");
      msg.textContent = "Etkinleştiriliyor…";
      msg.className = "inline-status";
      Pro.activate(key, function (r) {
        if (r.ok) {
          msg.textContent = "";
          toast("Suflo Pro aktif — iyi kurgular! 🎬", "good");
          reflectPro();
          // deneme hakkıyla üretilmiş filigranlı çıktı varsa bir kez hatırlat (kart Ayarlar > Suflo Pro'da)
          if (Pro.denemeCiktilari && Pro.denemeCiktilari().length) {
            toast("Deneme çıktılarını temiz yeniden oluştur: Suflo Pro kartındaki listeden filigransız hale getir.", "good", 10000);
          }
          // Bir kez "Bizi nereden duydun?" ve davet kodunu hemen iste (sunucu kapalıysa sessizce geçer)
          if (window.KDavet) {
            try { KDavet.kaynakSor(); KDavet.kodGetir(true); } catch (eD) {}
          }
        } else {
          msg.textContent = r.error || "Etkinleştirilemedi.";
          msg.className = "inline-status bad";
        }
      });
    });

    el("pro-deactivate").addEventListener("click", function () {
      Pro.deactivate(function () {
        toast("Lisans bu makineden kaldırıldı.");
        reflectPro();
      });
    });

    var chipBtn = el("pro-chip");
    if (chipBtn) chipBtn.addEventListener("click", function () {
      if (Pro.isPro()) { goster("settings"); return; }
      Pro.gate("pro"); // upsell modali — oradaki "Anahtarim var" Ayarlar'a goturur
    });

    Array.prototype.forEach.call(document.querySelectorAll(".pro-ac-btn, #yazi-proya-gec"), function (b) {
      b.addEventListener("click", function () {
        var feature = b.getAttribute("data-pro-feature") || (b.id === "yazi-proya-gec" ? "mogrt" : "pro");
        // Deneme zaten kuruluysa satın alma penceresi: kurulu deneme kapıyı sessizce geçirip bu
        // düğmeyi (satın alma yolunu) ölü bırakmasın
        if (Pro.denemeAcik && Pro.denemeAcik(feature)) { Pro.gate(feature); return; }
        // Deneme listesindeki araçlarda (kesim, zoom, ritim, geçiş, kanca) pencere "Ücretsiz dene" de sunar;
        // kurulunca aracın asıl düğmesine yönlendirir. Kütüphaneler denemesiz (pro.js süzer).
        Pro.gate(feature, { deneme: true, yeniden: function () { denemeyeYonlendir(feature); } });
      });
    });

    var styleUpsell = el("cap-style-upsell");
    if (styleUpsell) styleUpsell.addEventListener("click", function () { Pro.gate("captionStyles"); });

    el("pro-buy").addEventListener("click", function (e) {
      e.preventDefault();
      // Lemon Squeezy checkout (fiyat ve para birimi: js/pricing.js)
      K.cs.openURLInDefaultBrowser(proCheckoutUrl("settings"));
    });
  }

  function arayuzDiliniBaslat() {
    if (!window.SufloI18n) return;
    SufloI18n.configure({
      load: K.settings,
      save: function () { K.saveSettings(); },
      settingsExisted: K.ayarDosyasiVardi
    });
    if (SufloI18n.getLang() === "en") SufloI18n.start();
  }

  // Bir Whisper/ffmpeg işi sürüyor mu (dil değişimi o sırada kapalı)
  function isSuruyor() {
    try { return !!(K.surecSayisi && K.surecSayisi() > 0); } catch (e) { return false; }
  }

  // Ayarlar > Destek > Arayüz dili: yeniden yüklemeden geçer (EN → TR özgün metinleri geri koyar)
  function initDilSecici() {
    var sec = el("set-ui-lang");
    if (!sec || !window.SufloI18n) return;
    sec.value = SufloI18n.getLang();
    sec.addEventListener("change", function () {
      if (isSuruyor()) {
        sec.value = SufloI18n.getLang();
        toast("Bir iş sürüyor; arayüz dilini iş bitince değiştir.", "warn");
        return;
      }
      SufloI18n.switchLang(sec.value, { busy: isSuruyor });
    });
    SufloI18n.onChange(function (l) { sec.value = l; });
    // İş sürerken seçici kapalı (ucuz yoklama: yalnız disabled bayrağı)
    setInterval(function () {
      var mesgul = isSuruyor();
      if (sec.disabled !== mesgul) sec.disabled = mesgul;
    }, 1500);
  }

  function initSettings() {
    initPro();
    initDilSecici();
    // Pro karşılaştırmasındaki fiyat tek kaynaktan (js/pricing.js); İngilizcede çevirmen değiştirir
    if (el("set-pro-fiyat") && window.SufloPricing) el("set-pro-fiyat").textContent = SufloPricing.settingsRow("tr");

    // ---- Pro icerik bulutu: lisans bir kez, MOGRT + SFX otomatik ----
    (function initProSyncUI() {
      if (!window.ProSync) return;
      var runBtn = el("set-prosync-run"), openBtn = el("set-prosync-open");
      var progress = el("set-prosync-progress"), bar = el("set-prosync-bar");
      var title = el("set-prosync-title"), detail = el("set-prosync-detail");
      var badge = el("set-prosync-badge"), status = el("set-prosync-status");
      function bytes(n) {
        n = Number(n) || 0;
        if (n < 1048576) return Math.round(n / 1024) + " KB";
        return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
      }
      function draw(s) {
        s = s || ProSync.status();
        var pro = Pro.isPro();
        var working = s.phase === "checking" || s.phase === "syncing";
        if (runBtn) {
          runBtn.disabled = working;
          runBtn.textContent = working ? (s.phase === "checking" ? "Kontrol ediliyor…" : "Eşitleniyor…") : (pro ? "Şimdi kontrol et" : "Pro ile otomatik kur");
        }
        if (openBtn) openBtn.hidden = !(s.path && K.fs && K.fs.existsSync(s.path));
        if (progress) progress.hidden = !working;
        if (bar) bar.style.width = Math.max(2, Math.round((s.progress || 0) * 100)) + "%";
        if (badge) {
          badge.className = "pro-sync-badge " + (s.phase === "ready" ? "ready" : (s.phase === "error" ? "error" : ""));
          badge.textContent = s.phase === "ready" ? (s.offline ? "OFFLINE HAZIR" : "GÜNCEL") : (working ? "SYNC" : "AUTO");
        }
        if (title) title.textContent = !pro ? "Pro içerikleri tek tıkla otomatik kurulur" : (s.phase === "ready" ? "Pro kütüphanen hazır" : (working ? "Kütüphanen hazırlanıyor" : "Bir kez etkinleştir, hep güncel kal"));
        if (detail) {
          if (s.phase === "syncing") detail.textContent = (s.detail || "İçerikler eşitleniyor") + (s.bytesTotal ? " · " + bytes(s.bytesDone) + " / " + bytes(s.bytesTotal) : "");
          else if (s.phase === "ready") detail.textContent = "262 animasyon + 1.076 SFX + 30 Motion BG + preset paketi hazır" + (s.version ? " · içerik " + s.version : "") + ". Yeni içerikler arka planda kontrol edilir.";
          else if (s.phase === "error") detail.textContent = "Kurulu içeriklerin etkilenmedi. Bağlantı geldiğinde yeniden deneyebilirsin.";
          else detail.textContent = pro ? "Suflo açıldığında yeni içerikleri kontrol eder; yalnız değişen dosyaları indirir." : "Pro lisansını etkinleştirince 17 altyazı stili, 262 animasyon, 1.076 SFX, 30 Motion BG ve preset paketi otomatik kurulur. Yeni içerikler geldiğinde yalnız değişen dosyalar indirilir.";
        }
        if (status) {
          status.className = "inline-status" + (s.phase === "error" ? " bad" : (s.phase === "ready" ? " good" : ""));
          status.textContent = s.phase === "error" ? ("✕ " + s.error) : (s.phase === "ready" ? (s.offline ? "✓ Çevrimdışı çalışmaya hazır" : "✓ Otomatik güncelleme açık") : "");
        }
      }
      ProSync.on(draw);
      if (runBtn) runBtn.addEventListener("click", function () {
        if (!Pro.isPro()) { Pro.gate("propack"); return; }
        ProSync.sync({ force: true }).then(function (r) {
          if (r && r.ok) toast(r.current ? "Pro içerikleri zaten güncel." : "Pro içerikleri hazır.", "good");
          else if (r && r.error) toast(r.error, "bad", 9000);
        });
      });
      if (openBtn) openBtn.addEventListener("click", function () { ProSync.openFolder(); });
      if (typeof Pro !== "undefined") Pro.on(function () { draw(ProSync.status()); });
    })();

    // ---- Suflo Pro Paketi (LS'ten indirilen resmi icerik; tek klasor = MOGRT + SFX) ----
    function reflectProPack() {
      var durum = el("set-propack-durum");
      var kaldir = el("set-propack-kaldir");
      var pack = String(K.settings().proPackKlasor || "").trim();
      var varMi = pack && K.fs && K.fs.existsSync(pack);
      if (kaldir) kaldir.hidden = !pack;
      if (!durum) return;
      if (varMi) {
        durum.className = "inline-status good";
        durum.textContent = "✓ Pro paketi bağlı: " + pack;
      } else if (pack) {
        durum.className = "inline-status bad";
        durum.textContent = "Paket klasörü bulunamadı: " + pack;
      } else {
        durum.className = "inline-status";
        durum.textContent = Pro.isPro()
          ? "Otomatik içerik bulutunu kullanıyorsan bu alana gerek yok. Eski ZIP paketin varsa elle bağlayabilirsin."
          : "Bu alan yalnız eski ZIP paketi olan Pro kullanıcıları için yedektir.";
      }
    }
    function proPakYukle() {
      if (!Pro.isPro()) { Pro.gate("propack"); return; }
      var yol = null;
      if (window.cep && window.cep.fs && window.cep.fs.showOpenDialogEx) {
        var r = window.cep.fs.showOpenDialogEx(false, true, "Suflo Pro paketi klasörünü seç", null, null);
        if (r && r.data && r.data.length) yol = r.data[0];
      }
      if (!yol) return;
      K.settings().proPackKlasor = yol;
      // Pakette emoji/ varsa Emoji Assets'i de otomatik bagla. Kullanicinin
      // kendi sectigi klasoru ezmeyiz; yalnizca bos ise ya da onceki baglanti
      // yine paketten otomatik geldiyse guncelleriz.
      try {
        var emojiAlt = K.path.join(yol, "emoji");
        if (K.fs.existsSync(emojiAlt) && K.fs.statSync(emojiAlt).isDirectory()) {
          var s = K.settings();
          if (!s.emojiAssetsKlasor || s.emojiAssetsPackAuto) {
            s.emojiAssetsKlasor = emojiAlt;
            s.emojiAssetsPackAuto = true;
            var ei = el("set-emoji-assets-klasor"); if (ei) ei.value = emojiAlt;
            if (window.KEmojiAssets) KEmojiAssets.tara();
          }
        }
      } catch (ePack) {}
      K.saveSettings();
      reflectProPack();
      if (window.KLib) KLib.tara();
      if (window.KSfx) KSfx.tara();
      toast("Suflo Pro paketi bağlandı — kütüphaneler tarandı.", "good");
    }
    var legacyPackBtn = el("set-propack-yukle");
    if (legacyPackBtn) legacyPackBtn.addEventListener("click", proPakYukle);
    Array.prototype.forEach.call(document.querySelectorAll("#yazi-propack-yukle, #sfx-propack-yukle"), function (b) {
      b.addEventListener("click", function () {
        if (!Pro.isPro()) { Pro.gate("propack"); return; }
        if (!window.ProSync) { goster("settings"); return; }
        b.disabled = true;
        ProSync.sync({ force: true }).then(function (r) {
          b.disabled = false;
          if (r && r.ok) toast(r.current ? "Pro içerikleri zaten güncel." : "Pro içerikleri kullanıma hazır.", "good");
          else if (r && r.error) toast(r.error, "bad", 9000);
        });
      });
    });
    var ppKaldir = el("set-propack-kaldir");
    if (ppKaldir) ppKaldir.addEventListener("click", function () {
      var s = K.settings();
      s.proPackKlasor = "";
      // Emoji klasoru paketten otomatik baglandiysa onu da temizle
      if (s.emojiAssetsPackAuto) {
        s.emojiAssetsKlasor = "";
        s.emojiAssetsPackAuto = false;
        var ei = el("set-emoji-assets-klasor"); if (ei) ei.value = "";
        if (window.KEmojiAssets) KEmojiAssets.tara();
      }
      K.saveSettings();
      reflectProPack();
      if (window.KLib) KLib.tara();
      if (window.KSfx) KSfx.tara();
      toast("Pro paketi bağlantısı kaldırıldı.");
    });
    if (typeof Pro !== "undefined") Pro.on(function () { reflectProPack(); });
    reflectProPack();

    // Yazi kutuphanesi ek klasoru
    var mk = el("set-mogrt-klasor");
    if (mk) {
      mk.value = K.settings().mogrtEkKlasor || "";
      el("set-mogrt-kaydet").addEventListener("click", function () {
        var yol = mk.value.trim().replace(/^"|"$/g, ""); // yapistirilan tirnaklari temizle
        var durum = el("set-mogrt-durum");
        if (yol && !K.fs.existsSync(yol)) {
          durum.className = "inline-status bad";
          durum.textContent = "Klasör bulunamadı: " + yol;
          return;
        }
        K.settings().mogrtEkKlasor = yol;
        K.saveSettings();
        durum.className = "inline-status good";
        durum.textContent = yol ? "✓ Kaydedildi — kütüphane bu klasörü de tarayacak" : "Ek klasör kaldırıldı";
        if (window.KLib) KLib.tara();
      });
    }

    // SFX kutuphanesi ek klasoru
    var sk = el("set-sfx-klasor");
    if (sk) {
      sk.value = K.settings().sfxEkKlasor || "";
      el("set-sfx-kaydet").addEventListener("click", function () {
        var yol = sk.value.trim().replace(/^"|"$/g, "");
        var durum = el("set-sfx-durum");
        if (yol && !K.fs.existsSync(yol)) {
          durum.className = "inline-status bad";
          durum.textContent = "Klasör bulunamadı: " + yol;
          return;
        }
        K.settings().sfxEkKlasor = yol;
        K.saveSettings();
        durum.className = "inline-status good";
        durum.textContent = yol ? "✓ Kaydedildi — SFX kütüphanesi bu klasörü tarayacak" : "Ek SFX klasörü kaldırıldı";
        if (window.KSfx) KSfx.tara();
      });
    }

    // Emoji Assets uzak katalogu: Hostinger'daki catalog.json -> yerel onbellek -> timeline.
    var eu = el("set-emoji-assets-url");
    if (eu) {
      eu.value = K.settings().emojiAssetsCatalogUrl || "";
      el("set-emoji-assets-url-kaydet").addEventListener("click", function () {
        var durum = el("set-emoji-assets-url-durum");
        var ok = window.KEmojiAssets && KEmojiAssets.saveRemoteUrl(eu.value);
        durum.className = "inline-status " + (ok ? "good" : "bad");
        durum.textContent = ok
          ? (eu.value.trim() ? "✓ Katalog kaydedildi — Emoji Assets sekmesinde bağlantı kuruluyor" : "Emoji CDN kaldırıldı")
          : "Geçerli bir HTTPS catalog.json adresi gir";
      });
    }

    // Emoji Assets yerel klasoru (ucretsiz ozellik)
    var ek = el("set-emoji-assets-klasor");
    if (ek) {
      ek.value = K.settings().emojiAssetsKlasor || "";
      el("set-emoji-assets-kaydet").addEventListener("click", function () {
        var yol = ek.value.trim().replace(/^"|"$/g, "");
        var durum = el("set-emoji-assets-durum");
        if (yol && (!K.fs.existsSync(yol) || !K.fs.statSync(yol).isDirectory())) {
          durum.className = "inline-status bad";
          durum.textContent = "Klasör bulunamadı: " + yol;
          return;
        }
        K.settings().emojiAssetsKlasor = yol;
        if (yol) K.settings().emojiAssetsCatalogUrl = "";
        K.saveSettings();
        if (eu && yol) eu.value = "";
        durum.className = "inline-status good";
        durum.textContent = yol ? "✓ Kaydedildi — Emoji Assets bu klasörü tarayacak" : "Emoji klasörü kaldırıldı";
        if (window.KEmojiAssets) KEmojiAssets.tara();
      });
    }

    var s = K.settings();
    el("set-provider").value = s.provider || "groq";
    el("set-apikey").value = s.apiKey || "";
    el("set-endpoint").value = s.endpoint || "";
    el("set-custom-row").hidden = s.provider !== "custom";

    el("set-provider").addEventListener("change", function () {
      el("set-custom-row").hidden = this.value !== "custom";
      refreshEngineRoute();
    });

    el("set-local-install").addEventListener("click", function () { installLocalWhisper(); });
    if (el("set-model")) {
      el("set-model").addEventListener("change", function () {
        var st2 = K.settings();
        var inst = KEngine.installedModels().map(function (m) { return m.id; });
        st2.model = this.value;
        K.saveSettings();
        if (inst.indexOf(this.value) === -1) {
          el("set-local-status").className = "inline-status warn";
          el("set-local-status").textContent = "bu model kurulu değil — indirmek için düğmeye bas";
          el("set-local-install").textContent = "İndir & kur";
          el("set-local-install").hidden = false;
        } else {
          refreshLocalStatus();
          KCaptions.refreshSetup();
        }
      });
    }
    // GPU tespiti arka planda: kutuyu ancak NVIDIA varsa göster
    KEngine.detectGpu().then(function (g) {
      var row = el("set-gpu-row");
      if (!row) return;
      if (g.kind === "cuda") {
        row.hidden = false;
        el("set-gpu-name").textContent = g.name.replace(/NVIDIA\s*/i, "");
        if (el("set-gpu")) el("set-gpu").checked = K.settings().engineBuild !== "cpu";
      } else {
        row.hidden = true;
      }
      refreshLocalStatus();
    });
    refreshLocalStatus();
    // Rehber (anahtar sihirbazı, "Daha doğru model") ayar değiştirdiyse Ayarlar da görsün
    document.addEventListener("suflo:ayar", function () { refreshLocalStatus(); });

    el("set-save").addEventListener("click", function () {
      var st = K.settings();
      st.provider = el("set-provider").value;
      st.apiKey = el("set-apikey").value.trim();
      st.endpoint = el("set-endpoint").value.trim();
      if (K.saveSettings()) toast("Ayarlar kaydedildi", "good");
      else toast("Ayarlar kaydedilemedi", "bad");
      KCaptions.refreshSetup();
      refreshEngineRoute();
      // AI "anahtar gerekli" çipleri ve rehber yeni anahtarı görsün
      if (KCaptions.ayarDegisti) KCaptions.ayarDegisti("ayarlar");
    });

    el("lnk-groq").addEventListener("click", function (e) {
      e.preventDefault();
      K.cs.openURLInDefaultBrowser("https://console.groq.com/keys");
    });


    el("set-ffmpeg-recheck").addEventListener("click", function () { checkFfmpeg(true); });
    el("set-ffmpeg-install").addEventListener("click", installFfmpeg);
    // macOS'ta winget yok — dugme ne yapiyorsa onu yazsin
    // mac'te Homebrew varsa onunla, yoksa dogrudan indirmeyle kurulur
    if (K.MAC && K.brewYolu()) el("set-ffmpeg-install").textContent = "Homebrew ile kur";

    // Elle ffmpeg yolu: paket yoneticisi kurmak istemeyenler icin (tek dosya indirip gosterir)
    if (el("set-ffmpeg-path")) {
      el("set-ffmpeg-path").value = s.ffmpeg || "";
      el("set-ffmpeg-path").addEventListener("change", async function () {
        var st = K.settings();
        st.ffmpeg = this.value.trim();
        K.saveSettings();
        var ff = await K.findFfmpeg(true);      // onbellegi tazele, gercekten calisiyor mu bak
        if (ff) toast("ffmpeg bulundu: " + ff, "good");
        else if (st.ffmpeg) toast("Bu yolda çalışan bir ffmpeg bulunamadı.", "bad");
        checkFfmpeg(true);
      });
    }

    // terim sözlüğü
    if (el("set-glossary")) {
      el("set-glossary").value = KCaptions.glossaryText();
      el("set-glossary-save").addEventListener("click", function () {
        var st = K.settings();
        st.glossary = KCaptions.parseGlossary(el("set-glossary").value);
        K.saveSettings();
        el("set-glossary-info").textContent = st.glossary.length + " kural kayıtlı";
        toast(st.glossary.length + " sözlük kuralı kaydedildi", "good");
      });
      var gl = K.settings().glossary || [];
      if (gl.length) el("set-glossary-info").textContent = gl.length + " kural kayıtlı";
    }

    // vekil sunucu — kurumsal ağda indirmeler buradan geçer
    if (el("set-proxy")) {
      el("set-proxy").value = s.proxyUrl || "";
      el("set-noproxy").value = s.noProxy || "";
      ["set-proxy", "set-noproxy"].forEach(function (id) {
        el(id).addEventListener("change", function () {
          var st = K.settings();
          st.proxyUrl = el("set-proxy").value.trim();
          st.noProxy = el("set-noproxy").value.trim();
          K.saveSettings();
          toast(st.proxyUrl ? "Vekil sunucu kaydedildi" : "Vekil sunucu kapatıldı");
        });
      });
    }

    function gunlukKopyala() {
      var txt = K.logText();
      var ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      return ok ? txt.split("\n").length : 0;
    }

    el("set-copy-log").addEventListener("click", function () {
      var n = gunlukKopyala();
      if (n) toast("Günlük panoya kopyalandı (" + n + " satır)", "good");
      else toast("Kopyalanamadı", "bad");
    });

    // Tek tikla sorun bildirimi: gunluk panoya, tarayicida onceden doldurulmus
    // issue formu. Gunluk URL'ye konmaz (uzunluk + kisisel yol iceriyor olabilir).
    el("set-report").addEventListener("click", function () {
      var sistem = "Windows";
      if (K.MAC) {
        var arm = false;
        try { arm = require("os").arch() === "arm64"; } catch (e) {}
        sistem = arm ? "macOS (Apple Silicon: M1/M2/M3/M4)" : "macOS (Intel)";
      }
      var ppro = "";
      try { ppro = JSON.parse(window.__adobe_cep__.getHostEnvironment()).appVersion || ""; } catch (e) {}
      var u = "https://github.com/" + K.REPO + "/issues/new?template=hata-bildirimi.yml" +
        "&title=" + encodeURIComponent("[Hata] v" + K.VERSION + ": ") +
        "&sistem=" + encodeURIComponent(sistem);
      if (ppro) u += "&premiere=" + encodeURIComponent(ppro);
      var n = gunlukKopyala();
      K.cs.openURLInDefaultBrowser(u);
      toast(n
        ? "Günlük kopyalandı. Açılan sayfada \"Panel günlüğü\" alanına yapıştır (Ctrl+V)."
        : "Bildirim sayfası açıldı. Günlüğü \"Günlüğü kopyala\" ile ekleyebilirsin.", "good", 9000);
    });

  }

  async function checkFfmpeg() {
    var box = el("set-ffmpeg-status");
    box.className = "inline-status";
    box.textContent = "kontrol ediliyor…";
    var ff = await K.findFfmpeg(true);
    if (ff) {
      box.className = "inline-status good";
      box.textContent = "✓ " + ff;
    } else {
      box.className = "inline-status bad";
      // ffmpeg olmadan HEM yerel HEM bulut altyazi calismaz: sebebi ve cikis yolunu soyle
      box.textContent = "✕ bulunamadı — altyazı çalışmaz. Aşağıdaki düğmeye bas, " +
        "panel indirip kursun (bir kerelik, yaklaşık 100 MB).";
    }
    return ff;
  }

  /*
   * ffmpeg kurulumu. Paket yoneticisi (winget/brew) DENENMEZ oncelikli yol olarak:
   * winget her makinede yok, kurumsal makinede kapali olabiliyor ve kurulum
   * basarili olsa bile PATH'i CALISAN Premiere surecine yansitmiyor. Bunun yerine
   * ikiliyi dogrudan indirip panelin kendi klasorune koyuyoruz.
   * macOS'ta Homebrew varsa once o denenir: kullanicinin sistemiyle uyumlu kalir.
   */
  var ffmpegKuruluyor = false;

  async function installFfmpeg() {
    if (ffmpegKuruluyor) return;
    ffmpegKuruluyor = true;
    var box = el("set-ffmpeg-status");
    var btn = el("set-ffmpeg-install");
    var eskiEtiket = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; }
    box.className = "inline-status";

    function say(m) { box.textContent = m; }

    try {
      if (K.MAC && K.brewYolu()) {
        say("brew install ffmpeg… (birkaç dakika sürebilir)");
        await K.run(K.brewYolu(), ["install", "ffmpeg"], { timeout: 1800000 });
        if (await K.findFfmpeg(true)) {
          toast("ffmpeg kuruldu", "good");
          await checkFfmpeg();
          return;
        }
        say("Homebrew kuramadı, doğrudan indiriliyor…");
      }

      await KEngine.installFfmpeg(say);
      var ff = await K.findFfmpeg(true);
      if (ff) {
        toast("ffmpeg hazır — altyazı alabilirsin", "good");
        await checkFfmpeg();
        KCaptions.refreshSetup();
      } else {
        throw new Error("kurulum sonrası doğrulanamadı");
      }
    } catch (e) {
      var m = K.hataYardimi(e);
      box.className = "inline-status bad";
      box.textContent = "✕ " + m;
      toast(m, "bad", 12000);
      K.log("ffmpeg kurulumu basarisiz: " + (e && e.message ? e.message : e));
    } finally {
      ffmpegKuruluyor = false;
      if (btn) { btn.disabled = false; btn.textContent = eskiEtiket; }
    }
  }

  /* ---------------- Başlat ---------------- */

  /* ---------------- Güncelleme kontrolü ---------------- */

  /*
   * Guncelleme. ZXP IMZALI oldugu icin panel kendi dosyalarini degistiremez —
   * degistirirse imza bozulur ve Premiere eklentiyi hic yuklemez. Yani "sessizce
   * guncelle" mumkun degil; yapabilecegimiz en iyi sey kullaniciyi tek tiklamayla
   * indirilmis .zxp dosyasinin onune getirmek.
   */
  var guncelleme = null;   // { surum, url, ad, not }
  var updateGizliBuOturum = false;  // ✕ artik KALICI gizlemez: yalniz bu oturum, sonraki acilista tekrar hatirlatir

  function surumDahaYeni(yeni, mevcut) {
    var a = String(yeni).split(".").map(Number);
    var b = String(mevcut).split(".").map(Number);
    for (var i = 0; i < 3; i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true;
      if ((a[i] || 0) < (b[i] || 0)) return false;
    }
    return false;
  }

  function guncelDurum(msg, cls) {
    var e = el("set-guncelleme-durum");
    if (e) { e.textContent = msg; e.className = "inline-status" + (cls ? " " + cls : ""); }
  }

  async function checkUpdate(manuel) {
    if (!K.nodeOK) {
      if (manuel) { guncelDurum("Bu ortamda denetlenemiyor", "warn"); toast("Güncelleme denetimi Premiere içinde çalışır", "warn"); }
      return;
    }
    if (manuel) guncelDurum("Denetleniyor…");
    try {
      var r = await K.httpGet("https://api.github.com/repos/" + K.REPO + "/releases/latest");
      if (r.status !== 200) {
        if (manuel) { guncelDurum("Şu an denetlenemedi", "bad"); toast("Güncelleme denetlenemedi — sonra dene", "bad"); }
        return;
      }
      var j = JSON.parse(r.body);
      var tag = String(j.tag_name || "").replace(/^v/, "");
      if (!tag || !surumDahaYeni(tag, K.VERSION)) {
        if (manuel) { guncelDurum("Güncelsin ✓ (v" + K.VERSION + ")", "good"); toast("En güncel sürümdesin ✓", "good"); }
        return;
      }

      // ✕ ile kapatildiysa bu oturumda tekrar acma — ama SONRAKI panel acilisinda
      // yeniden hatirlat (kalici gizleme yok: eski surumde kalmak donusum kaybi).
      if (!manuel && updateGizliBuOturum) { return; }

      /*
       * Asıl dağıtım v1.9'dan beri Kurulum ZIP'i; .zxp yalnız ZXP Installer
       * kullananlar için duruyor. Eskiden burada YALNIZ .zxp aranıyordu —
       * ZIP'li bir release'te düğme sessizce devre dışı kalıyordu (yaşandı,
       * v2.2.0). Sıra: Kurulum ZIP > .zxp > release sayfası.
       */
      var varliklar = j.assets || [];
      var zip = varliklar.filter(function (a) { return /-Kurulum\.zip$/i.test(a.name); })[0];
      var zxp = varliklar.filter(function (a) { return /\.zxp$/i.test(a.name); })[0];
      var paket = zip || zxp;
      // Surum notunun ilk anlamli satiri: neden guncellesin, bir cumleyle
      var ilkSatir = String(j.body || "").split("\n").map(function (s) {
        return s.replace(/^[#*\->\s]+/, "").trim();
      }).filter(function (s) { return s.length > 12; })[0] || "";

      guncelleme = {
        surum: tag,
        url: paket ? paket.browser_download_url : ("https://github.com/" + K.REPO + "/releases/latest"),
        // Ad dosya yoluna ve "cmd /c start" satirina gider: cmd'nin yeniden
        // yorumladigi & ^ % gibi karakterler hic iceri girmesin.
        ad: (paket ? paket.name : "Suflo-" + tag + "-Kurulum.zip").replace(/[^A-Za-z0-9._-]/g, "_"),
        // GitHub her release dosyasi icin "sha256:<hex>" ozeti yayinlar: indirilen
        // dosya bununla dogrulanmadan otomatik kurulum yapilmaz
        sha256: paket && /^sha256:[0-9a-f]{64}$/i.test(String(paket.digest || "")) ? String(paket.digest).slice(7).toLowerCase() : "",
        zip: !!zip,
        not: ilkSatir.slice(0, 90)
      };
      K.log("guncelleme mevcut: v" + tag);

      el("update-baslik").textContent = "🎁 Güncelle — yeni özellikler var (v" + tag + ")";
      el("update-not").textContent = guncelleme.not ||
        "Otomatik zoom, yeni altyazı stilleri, kesim ve dahası — eski sürümde göremezsin.";
      el("update-indir").disabled = !paket;
      el("update-bar").hidden = false;
      if (manuel) { guncelDurum("Yeni sürüm hazır: v" + tag, "good"); toast("Yeni sürüm v" + tag + " hazır — üstteki şeritten indir", "good"); }
    } catch (e) {
      if (manuel) { guncelDurum("Denetlenemedi", "bad"); }
    }
  }

  // Indirilen dosyayi kullanicinin onune getir: once dosyayi acmayi dene
  // (ZXP Installer kuruluysa devrali), olmazsa klasoru ac.
  async function dosyayiGoster(yol) {
    var klasor = K.path.dirname(yol);
    if (K.MAC) {
      var r = await K.run("/usr/bin/open", [yol], { timeout: 20000 });
      if (r.code !== 0) await K.run("/usr/bin/open", ["-R", yol], { timeout: 20000 });
    } else {
      // cmd /c start yolu yeniden yorumlar: "Ali&Veli" gibi kullanici adinda bolunuyordu.
      // explorer dosyayi varsayilan uygulamayla acar (ZXP Installer / zip); cikis kodu
      // basarida bile 1 olabildigi icin ona bakilmaz.
      await K.run("explorer", [yol], { timeout: 20000 });
    }
    return klasor;
  }

  /*
   * Tek tık güncelleme: ZIP'i panel kendisi açar ve panel/ içeriğini CEP
   * klasörünün üstüne kopyalar — "ayıkla + kur dosyasına çift tıkla" adımı
   * kalkar, kullanıcıya yalnız "Premiere'i yeniden başlat" kalır.
   * Herhangi bir adım tutmazsa false döner; eski elle-kur akışına düşülür.
   */
  async function otomatikKur(zipYolu, surum) {
    var acilan = K.path.join(K.tmpDir(), "guncelleme-" + surum);
    K.rmrf(acilan);
    if (!(await K.unzip(zipYolu, acilan))) return false;

    // panel/ doğrudan ya da tek alt klasörün içinde olabilir
    var kaynak = K.path.join(acilan, "panel");
    if (!K.fs.existsSync(K.path.join(kaynak, "index.html"))) {
      var altlar = K.fs.readdirSync(acilan);
      for (var i = 0; i < altlar.length; i++) {
        var aday = K.path.join(acilan, altlar[i], "panel");
        if (K.fs.existsSync(K.path.join(aday, "index.html"))) { kaynak = aday; break; }
      }
    }
    if (!K.fs.existsSync(K.path.join(kaynak, "index.html")) ||
        !K.fs.existsSync(K.path.join(kaynak, "CSXS", "manifest.xml"))) {
      K.log("[güncelleme] ZIP içinde panel/ bulunamadı — elle kuruluma düşülüyor");
      return false;
    }

    var cepHedef = K.MAC
      ? K.path.join(K.os.homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions", "com.sametcreates.kesit")
      : K.path.join(process.env.APPDATA || "", "Adobe", "CEP", "extensions", "com.sametcreates.kesit");
    // klasör yoksa kurulum başka yolla (ZXP Installer'ın kendi dizini) yapılmış
    // olabilir — yanlış yere kurmaktansa elle akışa düş
    if (!K.fs.existsSync(cepHedef)) return false;

    var hata = 0;
    (function kopyala(src, dst) {
      try { K.fs.mkdirSync(dst, { recursive: true }); } catch (eM) {}
      K.fs.readdirSync(src).forEach(function (ad) {
        var s2 = K.path.join(src, ad), d2 = K.path.join(dst, ad);
        try {
          if (K.fs.statSync(s2).isDirectory()) kopyala(s2, d2);
          else K.fs.copyFileSync(s2, d2);
        } catch (eK) { hata++; K.log("[güncelleme] kopyalanamadı: " + ad + " — " + (eK && eK.message)); }
      });
    })(kaynak, cepHedef);

    // doğrulama: hedefteki manifest yeni sürümü taşımalı
    try {
      var mf = K.fs.readFileSync(K.path.join(cepHedef, "CSXS", "manifest.xml"), "utf8");
      if (mf.indexOf(surum) === -1) return false;
    } catch (eV) { return false; }
    return hata === 0;
  }

  function dosyaOzeti(yol) {
    return new Promise(function (resolve) {
      try {
        var h = require("crypto").createHash("sha256");
        var s = K.fs.createReadStream(yol);
        s.on("data", function (c) { h.update(c); });
        s.on("end", function () { resolve(h.digest("hex")); });
        s.on("error", function () { resolve(""); });
      } catch (e) { resolve(""); }
    });
  }

  async function guncellemeyiIndir() {
    if (!guncelleme) return;
    var b = el("update-indir");
    b.disabled = true;
    var eski = b.textContent;
    b.textContent = "İniyor…";
    try {
      var indirilenler = K.path.join(K.os.homedir(), "Downloads");
      if (!K.fs.existsSync(indirilenler)) indirilenler = K.os.homedir();
      var hedef = K.path.join(indirilenler, guncelleme.ad);
      var d = await K.download(guncelleme.url, hedef, function (f) {
        b.textContent = "%" + Math.round(f * 100);
      }, 0, undefined, { key: "zxp:" + guncelleme.surum });
      if (!d.ok) throw new Error(d.error || "indirilemedi");
      if (guncelleme.sha256) {
        b.textContent = "Doğrulanıyor…";
        var ozet = await dosyaOzeti(hedef);
        if (ozet !== guncelleme.sha256) {
          try { K.fs.unlinkSync(hedef); } catch (eSil) {}
          K.log("[güncelleme] SHA-256 uyuşmadı: " + ozet + " != " + guncelleme.sha256);
          throw new Error("indirilen dosya doğrulanamadı (bozuk ya da değiştirilmiş)");
        }
      }

      // Önce tek tık kurulumu dene — başarırsa kullanıcıya yalnız yeniden başlatma kalır
      if (guncelleme.zip) {
        b.textContent = "Kuruluyor…";
        var kuruldu = false;
        try { kuruldu = await otomatikKur(hedef, guncelleme.surum); }
        catch (eOto) { K.log("[güncelleme] oto kurulum hatası: " + (eOto && eOto.message)); }
        if (kuruldu) {
          el("update-baslik").textContent = "v" + guncelleme.surum + " kuruldu ✓";
          el("update-not").textContent = "Premiere'i kapatıp yeniden aç — yeni sürüm hazır.";
          b.textContent = "Kuruldu ✓";
          toast("v" + guncelleme.surum + " kuruldu — Premiere'i yeniden başlatman yeter.", "good");
          return;
        }
      }

      await dosyayiGoster(hedef);
      // ZIP'in İÇİNDEN çalıştırılan .bat panel dosyalarını bulamaz — önce ayıklatmak şart
      el("update-not").textContent = guncelleme.zip
        ? "İndirildi. ZIP'i aç (sağ tık > Tümünü ayıkla), kur dosyasına çift tıkla, Premiere'i yeniden başlat."
        : "İndirildi. Dosyaya çift tıkla, sonra Premiere'i yeniden başlat.";
      b.textContent = "İndirildi ✓";
      toast("v" + guncelleme.surum + " indirildi: " + hedef, "good");
    } catch (e) {
      b.textContent = eski;
      b.disabled = false;
      toast("İndirilemedi: " + e.message + " — github.com/" + K.REPO + "/releases", "bad");
      K.cs.openURLInDefaultBrowser("https://github.com/" + K.REPO + "/releases/latest");
    }
  }

  /*
   * Her adımı izole çalıştır: tek bir modül yüklenemezse (ör. eski CEF'te ayrıştırılamayan
   * bir dosya) panelin tamamı boş açılmasın. Hata sessiz kalmasın diye günlüğe düşer.
   */
  function guvenli(ad, fn) {
    try { fn(); } catch (e) {
      K.log("init " + ad + " hata: " + (e && e.message ? e.message : e));
      toast(ad + " bölümü yüklenemedi — Ayarlar > Destek'ten günlüğü gönder.", "bad");
    }
  }

  function init() {
    // Global hata yakalayıcı: aksi halde bir arıza tamamen sessiz kalıyor
    window.addEventListener("error", function (ev) {
      try { K.log("js hata: " + (ev.message || "") + " @ " + (ev.filename || "") + ":" + (ev.lineno || 0)); } catch (e) {}
    });

    // Arayüz dili EN ÖNCE: bağlam yoklamasından ve her pencereden önce. Dil settings.json'da
    // (uiLang); eski kurulumlar Türkçe kalır, taze kurulumda rehberin 0. adımı sorar
    guvenli("Dil", arayuzDiliniBaslat);

    // Sürüm etiketleri tek kaynaktan (bridge.js VERSION) beslenir: elle yazılan
    // "v1.7" her yayında geride kalıyor, kullanıcı hangi sürümde olduğunu bilemiyordu
    ["brand-ver", "hakkinda-ver", "set-ver"].forEach(function (id) {
      var e = el(id);
      if (e) e.textContent = "v" + K.VERSION;
    });
    // Aktif "Güncel misin?" denetimi: Ayarlar butonu + tıklanabilir sürüm rozeti
    if (el("set-guncelleme-denetle")) el("set-guncelleme-denetle").addEventListener("click", function () { checkUpdate(true); });
    if (el("brand-ver")) {
      el("brand-ver").style.cursor = "pointer";
      el("brand-ver").title = "Güncellemeleri denetle";
      el("brand-ver").addEventListener("click", function () {
        var gear = document.querySelector('.tab[data-tab="settings"]');
        if (gear) gear.click();
        checkUpdate(true);
      });
    }

    // Premiere 26.3'te arka plandaki periyodik evalScript yoklamasi, ozellikle
    // proje/workspace acilirken ana uygulamayi kilitleyebiliyor. Panelin acilmasi
    // icin host baglami zorunlu degil. Premiere onceki calisma alaninda Suflo'yu
    // aktif birakmissa `focus` olayi da proje acilisinda gelir; bu nedenle yalniz
    // kullanicinin panel icindeki ilk gercek etkilesiminde yoklamayi baslat.
    // Yalniz pointerdown'a guvenmiyoruz: Premiere 26.3.2 + macOS'ta bu olay
    // bazen CEP paneline dusmuyor ve arayuz sonsuza kadar "baglaniyor" kaliyor.
    guvenli("ffmpeg", checkFfmpeg);
    document.addEventListener("pointerdown", contextEtkilesim, true);
    document.addEventListener("click", contextEtkilesim, true);
    document.addEventListener("keydown", contextEtkilesim, true);

    // Pro lisans durumu EN ÖNCE: modüller isPro()'yu init sırasında okuyabilsin
    guvenli("Pro", function () {
      Pro.init();
      Pro.onUpgrade(function (feature, intent) {
        if (intent === "buy") {
          K.cs.openURLInDefaultBrowser(proCheckoutUrl(feature));
          return;
        }
        if (intent === "demo") {
          K.cs.openURLInDefaultBrowser("https://suflo.app/pro");
          return;
        }
        goster("settings");
        var k = el("pro-key"); if (k) k.focus();
      });
      Pro.on(reflectPro);
    });

    guvenli("sekmeler", initTabs);
    guvenli("ayarlar", initSettings);
    guvenli("Altyazı", function () { KCaptions.init(); });
    guvenli("Kesim", function () { KCut.init(); });
    guvenli("Konuşmadan kes", function () { if (window.KTextCut) KTextCut.init(); });
    guvenli("Bölümler", function () { if (window.KChapters) KChapters.init(); });
    guvenli("Geçişler", function () { if (window.KGecis) KGecis.init(); });
    guvenli("Sahne algılama", function () { if (window.KSahne) KSahne.init(); });
    guvenli("Viral anlar", function () { if (window.KViral) KViral.init(); });
    guvenli("B-roll", function () { if (window.KBroll) KBroll.init(); });
    guvenli("Kanca başlığı", function () { if (window.KKanca) KKanca.init(); });
    guvenli("Sesi iyileştir", function () { if (window.KSes) KSes.init(); });
    guvenli("Ritim", function () { KBeat.init(); });
    guvenli("Yazı", function () { if (window.KLib) KLib.init(); });
    guvenli("Motion Presetleri", function () { if (window.KPresets) KPresets.init(); });
    guvenli("Otomatik Zoom", function () { if (window.KZoom) KZoom.init(); });
    guvenli("SFX", function () { if (window.KSfx) KSfx.init(); });
    guvenli("Motion BG", function () { if (window.KMotionBG) KMotionBG.init(); });
    guvenli("Emoji Assets", function () { if (window.KEmojiAssets) KEmojiAssets.init(); });
    guvenli("Kütüphane kontrolü", function () { if (window.KLibraryHealth) KLibraryHealth.init(); });
    guvenli("Pro içerik", function () { if (window.ProSync) ProSync.init(); });
    // İlk açılış rehberi: yalnız Node gerçeklerini okur, kullanıcı tıklamadan
    // Premiere'e (evalScript) hiçbir şey göndermez
    guvenli("Onboarding", function () { if (window.KOnboarding) KOnboarding.init(); });
    guvenli("Davet", function () { if (window.KDavet) KDavet.init(); });
    guvenli("Pro-UI", reflectPro);

    if (el("update-indir")) el("update-indir").addEventListener("click", guncellemeyiIndir);
    if (el("update-kapat")) {
      el("update-kapat").addEventListener("click", function () {
        el("update-bar").hidden = true;
        updateGizliBuOturum = true;   // yalniz bu oturum; panel yeniden acilinca tekrar hatirlatir
      });
    }

    setTimeout(checkUpdate, 4000);
    // Panel günlerce açık kalabiliyor; tek açılış kontrolü yeni sürümü hiç göstermezdi
    setInterval(checkUpdate, 6 * 3600 * 1000);
    // eski geçici ses dosyalarını süpür (disk sessizce dolmasın)
    setTimeout(function () { try { K.sweepTemp(); } catch (e) {} }, 6000);
    // Rehberin tam kartı açıksa "yenilikler" penceresi üstüne binmesin (taze kurulum
    // zaten yeniliklerGoruldu alır; takılı kullanıcıya rehber yeter)
    setTimeout(function () {
      try {
        var rehber = window.KOnboarding && KOnboarding.karar ? KOnboarding.karar() : "yok";
        if (rehber !== "tam") yenilikleriGoster();
      } catch (eY) {}
    }, 900);
  }

  /*
   * "Suflo 3.0'da yeni": surum basina bir kez. Yeni ozellikler sekmelerin
   * derinliginde (Kesim sekmesinin altinda, editorun katlanir bolumlerinde);
   * gosterilmezse kullanici guncellemenin ne getirdigini hic gormeden gecer.
   */
  var YENILIKLER = {
    surum: "3.0",
    maddeler: [
      { ikon: "✂", baslik: "Konuşmadan kes", metin: "ııı, eee ve tekrarları kelimeye tıklayarak videodan çıkar.", sekme: "cut", hedef: "tc-card" },
      { ikon: "🔥", baslik: "Viral anlar (Shorts)", metin: "En güçlü 15–60 sn'yi bulur, tek tıkla 9:16 Shorts sekansı yapar.", sekme: "captions", acilir: "cap-vr-box" },
      { ikon: "Aa", baslik: "Suflo Stilleri", metin: "Bold Box, Neon, Daktilo dahil 12 animasyonlu altyazı.", sekme: "captions", hedef: "cap-stil-grid" },
      { ikon: "♪", baslik: "Sesi iyileştir", metin: "Gürültüyü al, sesi YouTube seviyesine getir — senkron kaymaz.", sekme: "cut", hedef: "ses-card" },
      { ikon: "▭", baslik: "Kanca başlığı", metin: "Shorts açılışına animasyonlu başlık kartı, tek tık.", sekme: "kanca" },
      { ikon: "↔", baslik: "Geçişler", metin: "Kesime tek tıkla zoom, whip, itme — eklentisiz.", sekme: "gecis" },
      { ikon: "▦", baslik: "Sahne algılama · vuruşlarda böl", metin: "Klibi sahnelerde ya da müziğin vuruşlarında böl.", sekme: "cut", hedef: "sc-card" },
      { ikon: "§", baslik: "YouTube bölümleri", metin: "Konuşmadan bölüm + AI başlık, açıklamaya kopyala.", sekme: "captions", acilir: "cap-ch-box" }
    ]
  };

  function yenilikleriGoster() {
    var s = K.settings();
    if (s.yeniliklerGoruldu === YENILIKLER.surum) return;
    var arka = document.createElement("div");
    arka.className = "yenilik-arka";
    arka.setAttribute("role", "dialog");
    arka.setAttribute("aria-label", "Suflo " + YENILIKLER.surum + " yenilikleri");
    var kutu = document.createElement("div");
    kutu.className = "yenilik-kutu";
    var bas = document.createElement("div");
    bas.className = "yenilik-bas";
    bas.innerHTML = "<span>YENİ</span><b>Suflo " + YENILIKLER.surum + "</b><i>Yapay zekâ ile kurgu</i>";
    kutu.appendChild(bas);
    function kapat() {
      try { s.yeniliklerGoruldu = YENILIKLER.surum; K.saveSettings(); } catch (e) {}
      if (arka.parentNode) arka.parentNode.removeChild(arka);
    }
    YENILIKLER.maddeler.forEach(function (m) {
      var satir = document.createElement("button");
      satir.type = "button";
      satir.className = "yenilik-satir";
      var ik = document.createElement("span"); ik.className = "yenilik-ikon"; ik.textContent = m.ikon;
      var yazi = document.createElement("span"); yazi.className = "yenilik-yazi";
      var b = document.createElement("b"); b.textContent = m.baslik;
      var t = document.createElement("i"); t.textContent = m.metin;
      yazi.appendChild(b); yazi.appendChild(t);
      var git = document.createElement("span"); git.className = "yenilik-git"; git.textContent = "Göster →";
      satir.appendChild(ik); satir.appendChild(yazi); satir.appendChild(git);
      satir.addEventListener("click", function () {
        kapat();
        goster(m.sekme);
        if (m.acilir && el(m.acilir)) { el(m.acilir).open = true; }
        var odak = el(m.hedef || m.acilir);
        if (odak && odak.scrollIntoView) { try { odak.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (eS) { odak.scrollIntoView(); } }
      });
      kutu.appendChild(satir);
    });
    var tamam = document.createElement("button");
    tamam.type = "button";
    tamam.className = "btn primary yenilik-tamam";
    tamam.textContent = "Başlayalım";
    tamam.addEventListener("click", kapat);
    kutu.appendChild(tamam);
    arka.appendChild(kutu);
    arka.addEventListener("click", function (e) { if (e.target === arka) kapat(); });
    document.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") { document.removeEventListener("keydown", esc); kapat(); }
    });
    document.body.appendChild(arka);
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    toast: toast,
    goster: goster,
    onContext: onContext,
    onTab: onTab,
    ctx: function () { return ctx; },
    refreshContext: contextPollingBaslat,
    pollNow: pollNow,
    yenilikSurumu: function () { return YENILIKLER.surum; },
    davetAni: davetAni,
    proCheckoutUrl: proCheckoutUrl,
    installLocalWhisper: installLocalWhisper,
    checkUpdate: checkUpdate
  };
})();
