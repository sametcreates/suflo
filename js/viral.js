/*
 * Suflo — Viral anlar (Shorts / Reels / TikTok bulucu) · Viral Skor 2.0
 * Altyazıdan, bulut LLM'iyle (çeviriyle aynı anahtar) güçlü anları seçer;
 * her ana 0-100 açıklamalı puan, 3 kanca başlığı ve ±1 cümle kenar düğmeleri.
 * Her an için In/Out ayarlanır (Önizle), süreli marker ya da Shorts sekansı olur.
 * İstem, puanlama ve kenar kuralları js/highlights.js'te (saf, testli).
 */
window.KViral = (function () {
  "use strict";

  var HL = window.SufloHighlights;
  // Ana liste (parseResponse sırası, her an kalıcı bir id taşır); ekrandaki görünüm filtreSirala ile türetilir
  var anlar = [];
  var busy = false;
  // anlarin bulundugu transkript ve sekans: Shorts sonra baska sekansta/transkriptte olusturulmasin
  var bulSegs = null, bulSekans = "";
  // aramanin gordugu temiz satirlar: from/to indeksleri buna gore (sonraki altyazi duzenlemeleri kaydirmasin)
  var bulSegsTemiz = null;
  var bulSure = { minDur: 20, maxDur: 60 };
  // In/Out en son hangi karttan ayarlandi (kenar kayinca In/Out canli guncellenir)
  var sonInOutId = null;
  // her basarili aramada artar: canli sekans sorgusu surerken biten aramayi ayirt eder
  var aramaNesli = 0;
  // id -> kart ogesi; id -> [{ b, kenar, yon }] (komsu kart kayinca yalniz dugme durumlari tazelenir)
  var kartlar = {}, kenarDugmeleri = {};

  var IPUCU = {
    hook: "İlk saniyeler kaydırmayı durduruyor mu",
    standalone: "Tek başına anlaşılıyor mu",
    emotion: "Duygu yoğunluğu: şaşırtma, mizah, gerilim, ilham",
    value: "İzleyiciye kalan bilgi ya da fayda",
    payoff: "Son yerine oturuyor mu"
  };

  function el(id) { return document.getElementById(id); }

  // Sabit arayüz metni (İngilizce arayüz bağlanınca çevrilir; kullanıcı/AI metni asla buradan geçmez)
  function T(s) {
    var I = window.SufloI18n;
    return I && I.tr ? I.tr(s) : s;
  }

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

  /* ---------------- ayarlar (K.settings) ---------------- */

  function secenekler() {
    return {
      tur: HL.turSec(el("cap-vr-tur") ? el("cap-vr-tur").value : ""),
      adet: HL.adetSinirla(el("cap-vr-adet") ? el("cap-vr-adet").value : HL.VARSAYILAN.adet),
      odak: HL.odakTemizle(el("cap-vr-odak") ? el("cap-vr-odak").value : ""),
      minPuan: el("cap-vr-min") && el("cap-vr-min").checked ? 60 : 0,
      sira: el("cap-vr-sira") && el("cap-vr-sira").value === "zaman" ? "zaman" : "puan"
    };
  }

  function ayarYukle() {
    var s = K.settings() || {};
    if (el("cap-vr-tur") && s.viralTur && HL.turSec(s.viralTur) === s.viralTur) el("cap-vr-tur").value = s.viralTur;
    if (el("cap-vr-adet") && s.viralAdet !== undefined) el("cap-vr-adet").value = String(HL.adetSinirla(s.viralAdet));
    if (el("cap-vr-odak") && typeof s.viralOdak === "string") el("cap-vr-odak").value = HL.odakTemizle(s.viralOdak);
    if (el("cap-vr-min")) el("cap-vr-min").checked = Number(s.viralMinPuan) >= 60;
    if (el("cap-vr-sira") && (s.viralSira === "puan" || s.viralSira === "zaman")) el("cap-vr-sira").value = s.viralSira;
  }

  function ayarKaydet() {
    var o = secenekler();
    var s = K.settings();
    s.viralTur = o.tur;
    s.viralAdet = o.adet;
    s.viralOdak = o.odak;
    s.viralMinPuan = o.minPuan;
    s.viralSira = o.sira;
    K.saveSettings();
  }

  /* ---------------- liste ---------------- */

  function indeks(id) {
    for (var i = 0; i < anlar.length; i++) if (anlar[i].id === id) return i;
    return -1;
  }

  function gorunenler() {
    var o = secenekler();
    return HL.filtreSirala(anlar, { minPuan: o.minPuan, sira: o.sira });
  }

  function olustur(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // *vurgu* -> <b>; metin her zaman textContent ile (AI ciktisi HTML olarak yorumlanmaz)
  function vurguluYaz(kap, metin) {
    String(metin || "").split("*").forEach(function (p, i) {
      if (!p) return;
      var e = olustur(i % 2 ? "b" : "span");
      e.textContent = p;
      kap.appendChild(e);
    });
  }

  // Cakisma yalniz EKRANDAKI kartlarla denetlenir: "Yalnız ≥60" ile gizlenen an, gorunen
  // kartin kenarini sebebi gorunmeden kilitlemesin (marker ve Shorts da yalniz gorunenleri kullanir)
  function kenarAyar(a) {
    return {
      hardMin: 5, hardMax: 180, minDur: bulSure.minDur, maxDur: bulSure.maxDur,
      others: gorunenler().filter(function (o) { return o.id !== a.id; })
    };
  }

  function halka(a) {
    var p = Math.max(0, Math.min(100, Math.round(Number(a.score) || 0)));
    var kap = olustur("div", "vr-skor");
    var ring = olustur("div", "vr-ring " + HL.puanBandi(p));
    // conic-gradient Chromium 69+; desteklenmezse atama yok sayilir, CSS'teki duz halka kalir
    ring.style.background = "conic-gradient(currentColor " + p + "%, rgba(255,255,255,.08) 0)";
    ring.title = T("Viral puanı (0–100, yapay zekâ tahmini)");
    var ic = olustur("div", "vr-ring-ic");
    ic.textContent = String(p);
    ring.appendChild(ic);
    var alt = olustur("small");
    alt.textContent = T("/100 tahmini");
    kap.appendChild(ring);
    kap.appendChild(alt);
    return kap;
  }

  function barlar(sub) {
    var g = olustur("div", "vr-barlar");
    HL.ALT_SIRA.forEach(function (k) {
      var v = sub[k];
      var ad = olustur("span", "vr-bar-ad");
      ad.textContent = T(HL.ALT_ETIKET[k]);
      ad.title = T(IPUCU[k]);
      var bar = olustur("span", "vr-bar");
      bar.title = T(IPUCU[k]);
      var dolu = olustur("i");
      dolu.style.width = (v === null || v === undefined ? 0 : v) + "%";
      bar.appendChild(dolu);
      var deger = olustur("span", "vr-bar-deger");
      deger.textContent = v === null || v === undefined ? "–" : String(v);
      g.appendChild(ad); g.appendChild(bar); g.appendChild(deger);
    });
    return g;
  }

  function kancaSecenekleri(a) {
    var g = olustur("div", "vr-kancalar");
    g.setAttribute("role", "radiogroup");
    g.setAttribute("aria-label", T("Kanca başlığı seçenekleri"));
    var bas = olustur("span", "vr-kanca-bas");
    bas.textContent = T("Kanca başlığı (Başlık ekle bunu kullanır):");
    g.appendChild(bas);
    var secili = Math.round(Number(a.kancaNo) || 0);
    a.hooks.forEach(function (h, i) {
      // label degil div: AI metni arayuz cevirisine girmesin; tiklama radyoyu secer
      var satir = olustur("div", "vr-kanca");
      var r = document.createElement("input");
      r.type = "radio";
      r.name = "vr-kanca-" + a.id;
      r.value = String(i);
      r.checked = secili === i;
      r.setAttribute("aria-label", h.replace(/\*/g, ""));
      var yazi = olustur("span", "vr-kanca-metin");
      vurguluYaz(yazi, h);
      r.addEventListener("change", function () { if (r.checked) kancaSec(a.id, i); });
      satir.addEventListener("click", function (e) {
        if (e && e.target === r) return;
        r.checked = true;
        kancaSec(a.id, i);
      });
      satir.appendChild(r); satir.appendChild(yazi);
      g.appendChild(satir);
    });
    return g;
  }

  function kancaSec(id, i) {
    var k = indeks(id);
    if (k >= 0) anlar[k].kancaNo = i;
  }

  function sinirSatiri(a) {
    var row = olustur("div", "vr-sinir");
    function dugme(metin, ipucu, kenar, yon) {
      var b = olustur("button", "btn tiny vr-sinir-btn");
      b.type = "button";
      b.textContent = metin;
      b.title = ipucu;
      b.disabled = !(bulSegsTemiz && HL.moveEdge(bulSegsTemiz, a, kenar, yon, kenarAyar(a)));
      b.addEventListener("click", function () { return kenarTasi(a.id, kenar, yon); });
      kenarDugmeleri[a.id].push({ b: b, kenar: kenar, yon: yon });
      return b;
    }
    kenarDugmeleri[a.id] = [];
    row.appendChild(dugme("◀ +1 cümle", "Başa bir cümle ekle", "start", 1));
    row.appendChild(dugme("−1", "Baştan bir cümle çıkar", "start", -1));
    var ayrac = olustur("span", "vr-sinir-ayrac");
    ayrac.textContent = "|";
    ayrac.setAttribute("aria-hidden", "true");
    row.appendChild(ayrac);
    row.appendChild(dugme("−1", "Sondan bir cümle çıkar", "end", -1));
    row.appendChild(dugme("+1 cümle ▶", "Sona bir cümle ekle", "end", 1));
    return row;
  }

  function eylemler(a) {
    var row = olustur("div", "vr-eylem");
    var onz = olustur("button", "btn tiny");
    onz.type = "button";
    onz.textContent = "Önizle";
    onz.title = "Sekansın In/Out noktalarını bu ana ayarlar ve playhead'i başına götürür: oynat, dışa aktar ya da yeni sekans yap";
    onz.addEventListener("click", function () { return onizle(a.id); });
    row.appendChild(onz);
    var baslik = olustur("button", "btn tiny");
    baslik.type = "button";
    baslik.textContent = "Başlık ekle";
    baslik.title = "Seçili kanca başlığını bu anın başına koyar (stil ve süre: Kanca Başlığı sekmesi)";
    baslik.hidden = !window.KKanca;
    baslik.addEventListener("click", async function () {
      var k = indeks(a.id);
      if (k < 0) return;
      var an = anlar[k];
      baslik.disabled = true;
      try { await KKanca.ekle({ text: HL.secilenKanca(an) || an.title, at: an.start }); } finally { baslik.disabled = false; }
    });
    row.appendChild(baslik);
    return row;
  }

  function kart(a) {
    var k = olustur("div", "vr-kart" + (a.low ? " dusuk" : ""));
    k.setAttribute("data-id", String(a.id));
    var ust = olustur("div", "vr-ust");
    ust.appendChild(halka(a));
    var bilgi = olustur("div", "vr-bilgi-blok");
    var b = olustur("b", "vr-baslik");
    b.textContent = a.title;
    var sure = olustur("span", "vr-sure" + (a.disiSure ? " uyari" : ""));
    sure.textContent = tc(a.start) + "–" + tc(a.end) + " · " + Math.round(a.end - a.start) + " sn";
    if (a.disiSure) sure.title = T("Seçili süre aralığının (" + bulSure.minDur + "–" + bulSure.maxDur + " sn) dışında");
    bilgi.appendChild(b);
    bilgi.appendChild(sure);
    if (a.low) {
      var dusuk = olustur("span", "vr-dusuk");
      dusuk.textContent = T("60 altı — en iyi aday");
      bilgi.appendChild(dusuk);
    }
    ust.appendChild(bilgi);
    k.appendChild(ust);
    if (a.reason) {
      var neden = olustur("div", "vr-neden");
      neden.textContent = a.reason;
      k.appendChild(neden);
    }
    if (!a.legacy && a.sub) k.appendChild(barlar(a.sub));
    if (a.hooks && a.hooks.length) k.appendChild(kancaSecenekleri(a));
    k.appendChild(sinirSatiri(a));
    k.appendChild(eylemler(a));
    return k;
  }

  function render() {
    var box = el("cap-vr-liste");
    box.innerHTML = "";
    kartlar = {};
    kenarDugmeleri = {};
    var liste = gorunenler();
    liste.forEach(function (a) {
      var k = kart(a);
      kartlar[a.id] = k;
      box.appendChild(k);
    });
    var var_ = anlar.length > 0;
    el("cap-vr-aksiyon").hidden = !var_;
    el("cap-vr-liste-ust").hidden = !var_;
    el("cap-vr-not").hidden = !var_;
    var bilgi = "";
    if (var_ && liste.length && liste[0].low) bilgi = "60 ve üstü an yok — en iyi " + liste.length + " an gösteriliyor";
    else if (var_ && liste.length < anlar.length) bilgi = (anlar.length - liste.length) + " an gizli (60 altı)";
    el("cap-vr-bilgi").textContent = bilgi;
  }

  // Yalniz tek karti yeniden ciz (kenar kaydirma): diger kartlarin secimi ve odagi korunur
  function kartiYenile(id) {
    var eski = kartlar[id];
    var a = null;
    gorunenler().forEach(function (x) { if (x.id === id) a = x; });
    if (!eski || !a || !eski.parentNode) { render(); return; }
    // odak bu kartin bir kenar dugmesindeyse yeni kartta ayni dugmeye gecer (klavyeyle art arda ±1)
    var odak = null, aktif = document.activeElement;
    (kenarDugmeleri[id] || []).forEach(function (d) { if (aktif && d.b === aktif) odak = d; });
    var yeni = kart(a);
    eski.parentNode.replaceChild(yeni, eski);
    kartlar[id] = yeni;
    if (odak) kenarOdakla(id, odak.kenar, odak.yon);
  }

  // Ayni dugme artik kapaliysa ayni kenarin ters yonu, sonra diger kenarin dugmeleri
  function kenarOdakla(id, kenar, yon) {
    var obur = kenar === "start" ? "end" : "start";
    var sira = [[kenar, yon], [kenar, -yon], [obur, yon], [obur, -yon]];
    var dugmeler = kenarDugmeleri[id] || [];
    for (var i = 0; i < sira.length; i++) {
      for (var j = 0; j < dugmeler.length; j++) {
        var d = dugmeler[j];
        if (d.kenar === sira[i][0] && d.yon === sira[i][1] && !d.b.disabled) { d.b.focus(); return; }
      }
    }
  }

  // Bir kart kayinca digerlerinin cakisma durumu degisir: onlari yeniden cizmeden dugmelerini tazele
  function kenarlariTazele(haric) {
    Object.keys(kenarDugmeleri).forEach(function (anahtar) {
      var id = Number(anahtar), i = indeks(id);
      if (id === haric || i < 0) return;
      kenarDugmeleri[anahtar].forEach(function (d) {
        d.b.disabled = !(bulSegsTemiz && HL.moveEdge(bulSegsTemiz, anlar[i], d.kenar, d.yon, kenarAyar(anlar[i])));
      });
    });
  }

  /* ---------------- kart eylemleri ---------------- */

  /*
   * Premiere'deki etkin sekans, CANLI sorgu. KApp.ctx() yalnız panel odaktayken 2,5 sn'de
   * bir tazelenir: kullanıcı Premiere'de sekans değiştirip hemen panele dönerse eski kalır.
   * KS_setInOut ve KS_makeShorts kimlik denetlemeden ETKİN sekansa yazar, bu yüzden
   * denetim bayat bağlamla yapılmaz. Döner: sekans kimliği ("" = sekans yok), sorgu
   * başarısızsa null.
   */
  async function etkinSekans() {
    var c = await K.call("KS_getContext", undefined, 20000);
    return c && c.ok ? String(c.sequenceId || "") : null;
  }

  // Anlar başka bir sekansta mı bulundu (canlı sorgu; sorgu başarısızsa son bilinen bağlam)
  async function baskaSekansta() {
    var simdiki = await etkinSekans();
    if (simdiki === null) simdiki = String(KApp.ctx().sequenceId || "");
    return !!(bulSekans && simdiki && simdiki !== bulSekans);
  }

  async function onizle(id) {
    if (indeks(id) < 0) return;
    var nesil = aramaNesli;
    if (await baskaSekansta()) {
      durum("Viral anlar başka bir sekansta bulundu: o sekansı açıp tekrar dene (ya da anları yeniden bul).", "warn");
      return;
    }
    // sorgu surerken yeni arama bitmis olabilir (id'ler 1'den yeniden baslar): eski karta ait tiklama
    var k = indeks(id);
    if (k < 0 || nesil !== aramaNesli) return;
    var a = anlar[k];
    var r = await K.call("KS_setInOut", { start: a.start, end: a.end });
    if (r.ok) {
      sonInOutId = id;
      KApp.toast("In/Out ayarlandı: " + a.title + " — Dışa aktar (Ctrl+M) ile Shorts'u çıkar", "good");
    } else durum("✕ " + r.error, "bad");
  }

  async function kenarTasi(id, kenar, yon) {
    var k = indeks(id);
    if (k < 0 || !bulSegsTemiz) return;
    var yeni = HL.moveEdge(bulSegsTemiz, anlar[k], kenar, yon, kenarAyar(anlar[k]));
    if (!yeni) {
      // kart cizildikten sonra komsu kart buyumus olabilir: durumu tazele
      kartiYenile(id);
      durum("Bu kenar daha fazla kaydırılamaz: başka bir anla çakışır, 5–180 sn sınırını aşar ya da cümle ortasına düşer.", "warn");
      return;
    }
    anlar[k] = yeni;
    durum("");
    kartiYenile(id);
    kenarlariTazele(id);
    // In/Out bu karttan ayarlandiysa ve Premiere'de (canli sorgu) hala ayni sekans aciksa guncelle
    if (sonInOutId === id && bulSekans) {
      var simdiki = await etkinSekans();
      // sorgu surerken yeni arama ya da baska kaydirma olmus olabilir: en guncel kenarlar
      var k2 = indeks(id);
      if (sonInOutId !== id || k2 < 0) return;
      if (simdiki !== bulSekans) {
        if (simdiki) durum("In/Out güncellenmedi: Premiere'de başka bir sekans açık.", "warn");
        return;
      }
      var r = await K.call("KS_setInOut", { start: anlar[k2].start, end: anlar[k2].end });
      if (!r.ok) durum("✕ " + r.error, "bad");
    }
  }

  /* ---------------- arama ---------------- */

  async function bul() {
    if (typeof Pro !== "undefined" && !Pro.gate("highlights")) return;
    if (busy || !HL) return;
    var segs = window.KCaptions ? KCaptions.getSegments() : [];
    if (!segs.length) { durum("Önce altyazı oluştur ya da SRT içe aktar.", "warn"); return; }
    var toplam = segs[segs.length - 1].end - segs[0].start;
    if (toplam < 60) { durum("Viral an bulmak için en az 1 dakikalık konuşma gerekir.", "warn"); return; }
    var cfg = KCaptions.chatConfig();
    if (!cfg) {
      if (window.KOnboarding) KOnboarding.anahtarIste("Viral anlar");
      else KApp.toast("Viral anlar için ücretsiz bir Groq anahtarı gerekli — Ayarlar'dan gir.", "bad");
      return;
    }
    busy = true;
    el("cap-vr-bul").disabled = true;
    durum("Yapay zekâ konuşmayı izliyor…");
    // AI cagrisi surerken sekans/transkript degisebilir: kaynak simdiden yakalanir
    var segsHam = KCaptions.rawSegments ? KCaptions.rawSegments() : null;
    var sekansHam = String(KApp.ctx().sequenceId || "");
    var temiz = HL.clean(segs);
    try {
      var s = sureler();
      var o = secenekler();
      ayarKaydet();
      var p = HL.buildPrompt(segs, { lang: KCaptions.language ? KCaptions.language() : "tr", minDur: s.minDur, maxDur: s.maxDur,
        adet: o.adet, tur: o.tur, odak: o.odak });
      var json = await KCaptions.chatCall(cfg, {
        model: cfg.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }]
      });
      var content = json.choices && json.choices[0] && json.choices[0].message.content;
      // istenen adetten fazlasi donerse puani en yuksek o kadar an kalir
      var bulunan = HL.parseResponse(content, segs, { minDur: s.minDur, maxDur: s.maxDur, adim: p.adim, adet: o.adet });
      if (!bulunan.length) throw new Error("Uygun an bulunamadı — süreyi değiştirip tekrar dene.");
      // basarili arama: tum durum birlikte degisir (hata olursa onceki sonuclar bozulmadan kalir)
      anlar = bulunan.map(function (a, i) { a.id = i + 1; a.kancaNo = 0; return a; });
      aramaNesli++;
      bulSegsTemiz = temiz;
      bulSure = s;
      bulSegs = segsHam;
      bulSekans = sekansHam;
      sonInOutId = null;
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
    var liste = gorunenler();
    if (!liste.length) return;
    var r = await K.call("KS_addRangeMarkers", {
      ranges: liste.map(function (a) {
        return { start: a.start, end: a.end, name: "🔥 " + a.title, comment: Math.round(a.score) + "/100" + (a.reason ? " · " + a.reason : "") };
      }),
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

  // Ekrandaki her an icin alt sekans (+ istege bagli 9:16 Auto Reframe), "Suflo Shorts" kutusunda
  async function shortsOlustur() {
    if (!anlar.length || busy) return;
    var dikey = !!(el("cap-vr-dikey") && el("cap-vr-dikey").checked);
    busy = true;
    var btn = el("cap-vr-shorts");
    btn.disabled = true;
    var yapilan = 0, dikeySay = 0, hatalar = [];
    try {
      if (await baskaSekansta()) {
        durum("Viral anlar başka bir sekansta bulundu: o sekansı açıp tekrar dene (ya da anları yeniden bul).", "warn");
        return;
      }
      var liste = gorunenler();
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
    var txt = HL.format(gorunenler(), { detay: true });
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
    try { ayarYukle(); } catch (e) {}
    el("cap-vr-bul").addEventListener("click", bul);
    el("cap-vr-marker").addEventListener("click", markerEkle);
    if (el("cap-vr-shorts")) el("cap-vr-shorts").addEventListener("click", shortsOlustur);
    el("cap-vr-kopyala").addEventListener("click", kopyala);
    // Ayar degisince kaydet; siralama ve filtre yeni arama istemez
    ["cap-vr-tur", "cap-vr-adet", "cap-vr-odak"].forEach(function (id) {
      if (el(id)) el(id).addEventListener("change", ayarKaydet);
    });
    ["cap-vr-sira", "cap-vr-min"].forEach(function (id) {
      if (el(id)) el(id).addEventListener("change", function () { ayarKaydet(); render(); });
    });
  }

  /*
   * Ekrandaki anlar (filtre + sıralama uygulanmış kopyalar). Seçili kanca başlığı
   * için HL.secilenKanca(an). Shorts paketi (yol haritası 8. madde) bunu kullanır.
   */
  return { init: init, liste: gorunenler };
})();
