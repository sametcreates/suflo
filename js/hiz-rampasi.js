/*
 * Suflo — Hız Rampası paneli (v3.2)
 *
 * Eğri kartları ve canlı eğri/basamak önizlemesi ücretsiz; timeline'a uygulamak Pro (3 deneme
 * hakkı, hak yalnız en az bir klip rampalandığında düşer). Plan: js/speedramp.js (saf, testli).
 * Uygulama: host KS_speedRampTargets → klip başına KS_applySpeedRamp (sırayla, 120 sn zaman
 * aşımı) · Geri al / Rampayı kaldır: KS_removeSpeedRamp (kapısız; Ctrl+Z rampayı tek adımda
 * geri almaz). Panel açılışında Premiere'e gidilmez: önizleme bağlamdan (KApp.ctx) çizilir.
 * Kullanıcı adları (klip, kopya sekans) bildirim ve durum satırında data-i18n-skip içinde:
 * İngilizce arayüz "Röportaj"ı "Interview" yapmasın.
 */
window.KHizRampasi = (function () {
  "use strict";

  var SR = window.SufloSpeedRamp;
  var KAYIT_ANAHTAR = "suflo.hizRampa.kayitlar";
  var KAL_ANAHTAR = "suflo.hizRampa.kalibrasyon";
  var AYAR_ANAHTAR = "suflo.hizRampa.ayar";
  var EN_COK_KLIP = 12, EN_COK_KAYIT = 30;
  var W = 320, H = 120;

  var secili = "dalis";
  var mesgul = false;
  var ctx = null;
  var aralikElle = false, kopyaElle = false;
  var medya = {};            // medya yolu (küçük harf) → { duration, fps } | null (ffmpeg -i)
  var medyaSuruyor = {};
  // Bu oturumda Suflo'nun açtığı kopya sekanslar (seqId → ad): bu sekanslardayken kopya kutusu
  // kendiliğinden işaretlenmez (kopyanın kopyası olmasın; özgün sekans zaten dokunulmadı)
  var kopyaSekanslar = {};

  function el(id) { return document.getElementById(id); }

  /* ---------------- metin parçaları ---------------- */
  // Dize = arayüz metni (kendi metin düğümünde, çevrilir); { ad } = kullanıcı adı (çevrilmez)
  function dugum(parcalar) {
    var kap = document.createElement("span");
    (parcalar || []).forEach(function (p) {
      if (p && typeof p === "object") {
        var b = document.createElement("b");
        b.setAttribute("data-i18n-skip", "");
        b.textContent = String(p.ad);
        kap.appendChild(b);
      } else if (p !== null && p !== undefined && p !== "") kap.appendChild(document.createTextNode(String(p)));
    });
    return kap;
  }
  function duz(parcalar) {
    return (parcalar || []).map(function (p) { return p && typeof p === "object" ? String(p.ad) : String(p === null || p === undefined ? "" : p); }).join("");
  }
  function hataAt(parcalar) {
    var e = new Error(duz(parcalar));
    e.parcalar = parcalar;
    throw e;
  }

  function durum(msg, cls) {
    var e = el("hiz-status");
    if (!e) return;
    e.className = "inline-status" + (cls ? " " + cls : "");
    if (Array.isArray(msg)) { e.textContent = ""; e.appendChild(dugum(msg)); }
    else e.textContent = msg || "";
  }

  /* ---------------- yerel depo (yalnız bu görüntüleyicinin kolaylığı; her erişim korumalı) ---------------- */
  function depoOku(anahtar, varsayilan) {
    try {
      var ls = window.localStorage;
      var ham = ls ? ls.getItem(anahtar) : null;
      if (!ham) return varsayilan;
      var v = JSON.parse(ham);
      return v === null || v === undefined ? varsayilan : v;
    } catch (e) { return varsayilan; }
  }
  function depoYaz(anahtar, deger) {
    try { if (window.localStorage) window.localStorage.setItem(anahtar, JSON.stringify(deger)); return true; } catch (e) { return false; }
  }
  function kayitlar() { var k = depoOku(KAYIT_ANAHTAR, []); return Array.isArray(k) ? k : []; }
  function kalibrasyon(surum) {
    var t = depoOku(KAL_ANAHTAR, {});
    var c = t && surum && t[surum];
    return c && (c.units === "ratio" || c.units === "percent") ? { units: c.units, sig: String(c.sig || "") } : null;
  }
  function kalibrasyonYaz(surum, cal) {
    if (!surum || !cal || !cal.units) return;
    var t = depoOku(KAL_ANAHTAR, {});
    if (!t || typeof t !== "object" || Array.isArray(t)) t = {};
    t[surum] = { units: cal.units, sig: String(cal.sig || "") };
    depoYaz(KAL_ANAHTAR, t);
  }
  function kayitlariSakla(basarili, surum, cal) {
    var liste = kayitlar();
    basarili.forEach(function (b) {
      var k = b.r.record;
      if (!k) return;
      liste = liste.filter(function (x) { return !(x.seqId === k.seqId && x.track === k.track && Math.abs(x.t0 - k.t0) < 0.001); });
      var kopya = {};
      for (var a in k) if (Object.prototype.hasOwnProperty.call(k, a)) kopya[a] = k[a];
      kopya.preset = b.p.id;
      kopya.zaman = Date.now();
      liste.push(kopya);
    });
    depoYaz(KAYIT_ANAHTAR, liste.slice(-EN_COK_KAYIT));
    kalibrasyonYaz(surum, cal);
  }
  function kayitSil(rec) {
    depoYaz(KAYIT_ANAHTAR, kayitlar().filter(function (x) { return !(x.seqId === rec.seqId && x.track === rec.track && Math.abs(x.t0 - rec.t0) < 0.001); }));
  }
  // Seçili klip / hedef bir kayıtlı rampanın içinde mi
  function kayitBul(seqId, track, sn, yol) {
    var y = String(yol || "").toLowerCase();
    var l = kayitlar();
    for (var i = l.length - 1; i >= 0; i--) {
      var k = l[i];
      if (seqId && k.seqId !== seqId) continue;
      if (track !== null && track !== undefined && k.track !== track) continue;
      if (y && String(k.mediaPath || "").toLowerCase() !== y) continue;
      if (sn >= k.t0 - 0.01 && sn < k.t1 - 0.01) return k;
    }
    return null;
  }
  // Rampanın bir parçası mı (aralığın tamamını kaplayan tek klip değil: Ctrl+Z ile tamamen geri
  // dönmüş tek %100 klip rampa sayılmaz)
  function rampaParcasi(k, bas, son) {
    return !!k && !(Math.abs(Number(bas) - k.t0) < 0.001 && Math.abs(Number(son) - k.t1) < 0.001);
  }

  /* ---------------- seçenekler ---------------- */
  function secenek() {
    return {
      k: Number(el("hiz-yogunluk").value) || 1,
      ease: el("hiz-gecis").value,
      density: el("hiz-parca").value,
      mode: el("hiz-kaynak").value,
      onBeat: el("hiz-ritim-yon") ? el("hiz-ritim-yon").value : "slow"
    };
  }
  function ayarKaydet() {
    depoYaz(AYAR_ANAHTAR, { secili: secili, k: el("hiz-yogunluk").value, ease: el("hiz-gecis").value, density: el("hiz-parca").value,
      mode: el("hiz-kaynak").value, ses: el("hiz-ses").value, akis: el("hiz-akis").value, bulanik: !!el("hiz-bulanik").checked,
      vurus: !!el("hiz-vurus").checked, yon: el("hiz-ritim-yon") ? el("hiz-ritim-yon").value : "slow" });
  }
  function ayarYukle() {
    var a = depoOku(AYAR_ANAHTAR, null);
    if (!a || typeof a !== "object") return;
    if (a.secili && SR.has(a.secili)) secili = a.secili;
    function ata(id, v) { var e = el(id); if (e && v !== undefined && v !== null) { if (e.type === "checkbox") e.checked = !!v; else e.value = String(v); } }
    ata("hiz-yogunluk", a.k); ata("hiz-gecis", a.ease); ata("hiz-parca", a.density); ata("hiz-kaynak", a.mode);
    ata("hiz-ses", a.ses); ata("hiz-akis", a.akis); ata("hiz-bulanik", a.bulanik); ata("hiz-vurus", a.vurus); ata("hiz-ritim-yon", a.yon);
  }

  /* ---------------- Ritim analizi (Ritme Rampa) ---------------- */
  var VURUS_YOK = "Önce Ritim sekmesinde müziği analiz et";
  var VURUS_BASKA = "Ritim analizi başka bir sekansta yapıldı; bu sekansta müziği analiz et";
  // Son analizin vuruşları yalnız analizin yapıldığı sekansta geçerli (timeline saniyesi)
  // { durum: "yok" | "baska" | "var", liste, start, end }
  function vurusBilgi(seqId) {
    var B = window.KBeat || null, liste = [], a = null;
    try { liste = B && typeof B.vuruslar === "function" ? B.vuruslar() : []; } catch (e) { liste = []; }
    if (!liste || !liste.length) return { durum: "yok", liste: [] };
    try { a = B && typeof B.analiz === "function" ? B.analiz() : null; } catch (e2) { a = null; }
    var seq = String(seqId || (ctx && ctx.sequenceId) || "");
    if (a && a.seqId && seq && String(a.seqId) !== seq) return { durum: "baska", liste: [] };
    return { durum: "var", liste: liste, start: a ? a.start : null, end: a ? a.end : null };
  }
  function vuruslar() { return vurusBilgi().liste; }
  function sn1(x) { return Math.round(Number(x) * 10) / 10; }
  // Plan "vurusYok" dediğinde: analiz yok, başka sekansta ya da bu aralıkta vuruş yok
  function vurusYokMetni(b) {
    if (!b || b.durum === "yok") return VURUS_YOK;
    if (b.durum === "baska") return VURUS_BASKA;
    if (typeof b.start === "number" && typeof b.end === "number" && b.end > b.start) {
      return "Bu aralıkta vuruş yok (analiz edilen müzik " + sn1(b.start) + "–" + sn1(b.end) + " sn)";
    }
    return "Bu aralıkta vuruş yok";
  }

  /* ---------------- hedef ve ücretsiz önizleme (Premiere'e gitmez) ---------------- */
  function bagSure() { return ctx && ctx.frame > 0 ? ctx.frame : 1 / 30; }
  function inOutVar(c) {
    if (!c || !(c.seqOut > c.seqIn)) return false;
    var fr = c.frame > 0 ? c.frame : 1 / 30;
    return c.seqOut - c.seqIn > fr && (c.seqIn > fr || (c.seqDur > 0 && c.seqOut < c.seqDur - fr));
  }
  function onizlemeHedefi() {
    var c = ctx, aralik = el("hiz-aralik").value;
    if (c && c.hasSeq) {
      // In/Out hep Dengeli (uygula da t.partial'ı zorlar): okunan hızlar yazılacak hızlardır
      if (aralik === "inout" && inOutVar(c)) return { rangeStart: c.seqIn, rangeEnd: c.seqOut, partial: true, outPoint: null, inout: true };
      if (aralik === "clips" && c.sel) {
        // Az önce uygulanan rampanın parçaları seçili (host hepsini seçer): yeni hedef gibi planlanmaz
        var k = kayitBul(c.sequenceId, null, Number(c.sel.clipStart), c.sel.mediaPath);
        if (rampaParcasi(k, c.sel.clipStart, c.sel.clipEnd)) return { rampa: k };
        return { rangeStart: c.sel.clipStart, rangeEnd: c.sel.clipEnd, partial: false, outPoint: c.sel.outPoint, mediaPath: c.sel.mediaPath,
          name: c.sel.name, adet: c.selCount || 1 };
      }
    }
    // Klip yokken örnek eğri: 3 sn, 30 fps, Dengeli (uyarısız, yalnız biçimi gösterir)
    return { rangeStart: 0, rangeEnd: 3, partial: true, outPoint: null, ornek: true, frame: 1 / 30 };
  }

  function hedefCiz(h) {
    var kutu = el("hiz-hedef");
    if (!kutu) return;
    kutu.innerHTML = "";
    if (h.ornek) { kutu.textContent = "Timeline'da bir klip seç ya da Giriş/Çıkış (In/Out) koy."; return; }
    if (h.rampa) { kutu.textContent = "Bu klip bir hız rampasının parçası · değiştirmek için önce Rampayı kaldır"; return; }
    if (h.adet > 1) { kutu.textContent = h.adet + " klip seçili"; return; }
    var a = document.createElement("span"); a.textContent = "Hedef:";
    var ad = document.createElement("b");
    if (h.inout) ad.textContent = "Giriş–Çıkış arası";
    else { ad.setAttribute("data-i18n-skip", ""); ad.textContent = h.name || ""; }
    var sure = document.createElement("span");
    sure.textContent = (Math.round((h.rangeEnd - h.rangeStart) * 10) / 10) + " sn";
    kutu.appendChild(a); kutu.appendChild(document.createTextNode(" "));
    kutu.appendChild(ad); kutu.appendChild(document.createTextNode(" · "));
    kutu.appendChild(sure);
  }

  function svgCubuklar(p) {
    return SR.steps(p, W, H).map(function (r) {
      return '<rect class="hiz-basamak" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"></rect>';
    }).join("");
  }

  var UYARI = {
    yogunlukDustu: "Tutamak yetmedi: yoğunluk düşürüldü",
    dengeliyeGecti: "Klibin sonrasında yeterli görüntü yok: Dengeli kullanılıyor",
    sureYok: "Medya süresi okunamadı: Dengeli kullanılıyor",
    sinirlandi: "Bazı hızlar %10–%1000 sınırına çekildi",
    vurusYok: VURUS_YOK
  };

  function ozetSatirlari(p, frame, h) {
    var o = SR.summary(p, frame), satir = [];
    satir.push(o.pieces + " parça · en yavaş %" + o.minPct + " · en hızlı %" + o.maxPct);
    satir.push("Süre aynı: " + o.timelineSec + " sn · kaynak " + o.srcSec + " sn");
    if (p.mode === "exact") {
      // B > 1: klibin Out'undan sonrası kullanılır; B < 1: klibin sonu kullanılmaz (kırpılır)
      if (p.B > 1.0005) satir.push("Tam hız (klibin sonrasındaki görüntü kullanılır)");
      else if (p.B < 0.9995) satir.push("Tam hız: klibin son " + (Math.round((1 - p.B) * p.F * frame * 100) / 100) + " sn'si kullanılmaz");
      else satir.push("Tam hız, kaynak aynı kalır");
    } else satir.push("Dengeli: hızlar ×" + (Math.round(p.c * 100) / 100) + " ölçeklendi, kaynak aynı kalır");
    p.warnings.forEach(function (w) {
      if (w === "vurusYok") satir.push(vurusYokMetni(vurusBilgi()));
      else if (w === "sureYok" && h && h.mediaPath && medyaSuruyor[String(h.mediaPath).toLowerCase()]) satir.push("Medya süresi okunuyor…");
      else if (UYARI[w]) satir.push(UYARI[w]);
      else if (w === "hitKaydi" && p.hit) satir.push("Darbe anı " + (Math.round(p.hit.err * 100) / 100) + " sn kaydı");
      else if (w === "takilabilir") {
        var m = medyaBilgisiOnbellek(h && h.mediaPath), q = m && m.fps ? SR.quality(p, p.fps, m.fps) : null;
        if (q) satir.push("Kaynak " + m.fps + " fps: %" + Math.round(q.cleanMin * 100) + " altı takılabilir, Optik akış'ı dene");
      }
    });
    return satir;
  }

  function ozetYaz(satirlar) {
    var oz = el("hiz-ozet");
    if (!oz) return;
    oz.innerHTML = "";
    satirlar.forEach(function (s, i) {
      var d = document.createElement("div");
      d.textContent = s;
      if (i > 1) d.className = "hiz-not";
      oz.appendChild(d);
    });
  }

  function onizlemeCiz() {
    var svg = el("hiz-onizleme"), oz = el("hiz-ozet");
    if (!svg || !SR) return;
    var h = onizlemeHedefi();
    hedefCiz(h);
    if (h.rampa) {
      svg.innerHTML = "";
      var uyg = h.rampa.preset && SR.get(h.rampa.preset);
      ozetYaz(uyg ? ["Uygulanan eğri: " + uyg.name] : []);
      return;
    }
    var fr = h.frame || bagSure();
    var p;
    try {
      p = SR.plan(secili, secenek(), SR.clipFor(h, fr, { media: medyaBilgisiOnbellek(h.mediaPath), playhead: ctx ? ctx.playhead : null,
        hizala: !!el("hiz-vurus").checked && !h.ornek, beats: vuruslar() }));
    } catch (e) {
      svg.innerHTML = "";
      if (oz) oz.textContent = /çok kısa/.test(e.message) ? "Rampa için en az 12 kare gerekli." : e.message;
      return;
    }
    var taban = SR.base(H);
    var vurus = "";
    if (p.hit) {
      var vx = Math.round(p.hit.u * W * 100) / 100, vy = SR.yAt(SR.speedAt(p.keys, p.hit.u, p.ease), H);
      vurus = '<line class="hiz-vurus-cizgi" x1="' + vx + '" x2="' + vx + '" y1="0" y2="' + H + '"></line><circle class="hiz-vurus" cx="' + vx + '" cy="' + vy + '" r="4"></circle>';
    }
    svg.innerHTML = svgCubuklar(p) +
      '<line class="hiz-taban" x1="0" x2="' + W + '" y1="' + taban + '" y2="' + taban + '"></line>' +
      '<text class="hiz-eksen" x="3" y="' + (taban - 3) + '">100%</text>' +
      '<path class="hiz-egri" d="' + SR.path(p.keys, p.ease, W, H) + '"></path>' + vurus;
    ozetYaz(ozetSatirlari(p, fr, h));
  }

  /* ---------------- kartlar ---------------- */
  // Küçük resimler yalnız yoğunluk / yumuşatma / vuruş yönü ya da vuruş durumu değişince yeniden çizilir
  var sonVurusDurum = "";
  function kartlar() {
    var grid = el("hiz-grid");
    if (!grid) return;
    grid.innerHTML = "";
    var o = secenek(), vb = vurusBilgi();
    sonVurusDurum = vb.durum;
    SR.list().forEach(function (p) {
      var kart = document.createElement("button");
      kart.type = "button";
      kart.className = "preset-card hiz-card" + (p.id === secili ? " on" : "");
      kart.setAttribute("aria-pressed", p.id === secili ? "true" : "false");
      kart.setAttribute("data-id", p.id);
      var t = SR.thumb(p.id, 120, 56, { k: o.k, ease: o.ease, onBeat: o.onBeat });
      var resim = document.createElement("span");
      resim.className = "hiz-resim";
      resim.innerHTML = '<svg viewBox="0 0 120 56" aria-hidden="true">' +
        '<line class="hiz-taban" x1="0" x2="120" y1="' + t.base + '" y2="' + t.base + '"></line>' +
        '<path class="hiz-egri" d="' + t.path + '"></path>' +
        (t.hit ? '<circle class="hiz-vurus" cx="' + t.hit.x + '" cy="' + t.hit.y + '" r="3"></circle>' : "") + "</svg>";
      var bilgi = document.createElement("span");
      bilgi.className = "hiz-bilgi";
      var b = document.createElement("b"); b.textContent = p.name;
      var i = document.createElement("i");
      var kapali = !!p.beats && vb.durum !== "var";
      i.textContent = kapali ? (vb.durum === "baska" ? VURUS_BASKA : VURUS_YOK) : p.desc;
      bilgi.appendChild(b); bilgi.appendChild(i);
      kart.appendChild(resim); kart.appendChild(bilgi);
      if (kapali) { kart.disabled = true; kart.className += " kapali"; }
      kart.addEventListener("click", function () { sec(p.id); });
      grid.appendChild(kart);
    });
  }

  // Seçimi yerinde güncelle: ızgara yeniden kurulmaz, klavye odağı tıklanan kartta kalır
  function kartSecimi() {
    var grid = el("hiz-grid");
    var kids = grid ? grid.children : null;
    if (!kids) return;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i], on = k.getAttribute && k.getAttribute("data-id") === secili;
      if (!k.getAttribute || k.getAttribute("data-id") === null) continue;
      k.setAttribute("aria-pressed", on ? "true" : "false");
      k.className = String(k.className || "").replace(/(^|\s)on(?=\s|$)/g, "") + (on ? " on" : "");
    }
  }

  function sec(id) {
    if (!SR.has(id)) return;
    if (id === "ritim" && !vuruslar().length) return;
    secili = id;
    var yon = el("hiz-ritim-yon-kutu");
    if (yon) yon.hidden = secili !== "ritim";
    kartSecimi();
    onizlemeCiz();
    ayarKaydet();
  }

  // Kilitliyken de düğmenin adı "Rampayı uygula": tanıtım kartındaki deneme bildirimi bu adı söyler.
  // Kilit simgesi ve sınıfla gösterilir; deneme kurulunca (odak / üzerine gelme) hemen kalkar.
  function dugmeCiz() {
    var b = el("hiz-uygula");
    if (!b) return;
    var kilitli = typeof Pro !== "undefined" && Pro.isPro && !Pro.isPro() && !(Pro.denemeAcik && Pro.denemeAcik("speedramp"));
    b.textContent = kilitli ? "🔒 Rampayı uygula" : "Rampayı uygula";
    if (b.classList) b.classList.toggle("is-locked", !!kilitli);
  }

  function render() {
    if (secili === "ritim" && !vuruslar().length) secili = "dalis";
    var yon = el("hiz-ritim-yon-kutu");
    if (yon) yon.hidden = secili !== "ritim";
    kartlar();
    onizlemeCiz();
    dugmeCiz();
  }

  /* ---------------- bağlam ---------------- */
  function refresh(c) {
    ctx = c || ctx;
    // Sekans değişti (analiz başka sekansta kaldı) ya da analiz geldi: Ritme Rampa kartı tazelenir
    var vd = vurusBilgi().durum;
    if (vd !== sonVurusDurum && el("hiz-grid")) {
      if (secili === "ritim" && vd !== "var") secili = "dalis";
      var yon = el("hiz-ritim-yon-kutu");
      if (yon) yon.hidden = secili !== "ritim";
      kartlar();
    }
    if (ctx && !aralikElle && el("hiz-aralik")) el("hiz-aralik").value = ctx.sel ? "clips" : (inOutVar(ctx) ? "inout" : "clips");
    // Bu Premiere sürümünde kalibrasyon yoksa ilk rampa kopya sekansta (kullanıcı kutuya dokunmadıysa);
    // Suflo'nun bu oturumda açtığı kopya sekanstaysak yeniden kopyalanmaz
    if (ctx && ctx.app && !kopyaElle && el("hiz-kopya")) {
      el("hiz-kopya").checked = !kalibrasyon(String(ctx.app)) && !kopyaSekanslar[String(ctx.sequenceId || "")];
    }
    onizlemeCiz();
    if (ctx && ctx.sel && ctx.sel.mediaPath && sekmeAcik()) medyaYokla(ctx.sel.mediaPath);
  }
  function sekmeAcik() { var t = el("tab-hiz"); return !!(t && t.classList && t.classList.contains("active")); }

  /* ---------------- ffmpeg -i: medya süresi (tutamak) ve kare hızı ---------------- */
  function medyaBilgisiOnbellek(yol) {
    if (!yol) return null;
    var m = medya[String(yol).toLowerCase()];
    return m || null;
  }
  async function medyaBilgisi(yol) {
    if (!yol) return null;
    var a = String(yol).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(medya, a)) return medya[a];
    var sonuc = null;
    try {
      var ff = K.findFfmpeg ? await K.findFfmpeg() : null;
      if (ff && K.run) {
        var r = await K.run(ff, ["-hide_banner", "-i", yol], { timeout: 20000 });
        var m = SR.parseMedia(String((r && r.stderr) || "") + "\n" + String((r && r.stdout) || ""));
        if (m.duration !== null) sonuc = m;
      }
    } catch (e) { sonuc = null; }
    medya[a] = sonuc;
    return sonuc;
  }
  function medyaYokla(yol) {
    var a = String(yol).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(medya, a) || medyaSuruyor[a]) return;
    medyaSuruyor[a] = true;
    medyaBilgisi(yol).then(function () { medyaSuruyor[a] = false; onizlemeCiz(); }, function () { medyaSuruyor[a] = false; });
  }

  /* ---------------- metinler ---------------- */
  var HATA = {
    secimYok: "Bir video klip seç ya da Giriş/Çıkış koy.",
    grafik: "Grafik, MOGRT, ayar katmanı ya da fotoğrafa hız rampası uygulanmaz.",
    ters: "Ters oynatılan klipte rampa yapılamaz.",
    remap: "Bu klipte Zaman Yeniden Eşleme var gibi görünüyor; önce kapat.",
    warp: "Warp Stabilizer hız değişikliğiyle çalışmaz. Klibi iç içe sekans yapıp yeniden dene.",
    multicam: "Multicam ve birleştirilmiş kliplerde hız yazılamıyor.",
    kisa: "Rampa için en az 12 kare gerekli.",
    qeYok: "Bu Premiere sürümünde Suflo hız yazamıyor. Premiere'i güncelle; Doctor'da ayrıntı var.",
    linkedConflict: "Klip sesle bağlı ve bu sürümde bağ koparılamıyor. Klibi seç, Ctrl+L ile bağlantıyı kopar, yeniden uygula.",
    tutamak: "Medya yetmedi: hızlanma için klibin sonrasında yeterli görüntü yok. Kaynak: Dengeli'yi seç.",
    // Dengeli zaten seçiliyken "Dengeli'yi seç" denmez
    tutamakDengeli: "Medya yetmedi: rampa klibin görüntüsüne sığmadı; klip eski haline getirildi. Daha hafif yoğunluk ya da daha uzun bir aralık dene.",
    hizYazilamadi: "Premiere hızı kabul etmedi; klip eski haline getirildi.",
    yerlesim: "Parçalar beklenen yere oturmadı; klip eski haline getirildi.",
    geriAlinamadi: "Klip eski haline getirilemedi. Ctrl+Z ile geri al ya da kopya sekansı kullan.",
    degisti: "Rampa parçaları değişmiş; Suflo bunlara dokunmadı.",
    sekans: "Aktif sekans değişti; işlem durduruldu.",
    kopya: "Kopya sekans oluşturulamadı. Önce sekansı kopyala kutusunu kapatıp dene.",
    plan: "Rampa planı geçersiz.",
    // Rampayı kaldır: seçimde rampa yok (In/Out'tan söz edilmez, kaldırma onu kullanmaz)
    kaldirSecimYok: "Seçili klipte Suflo rampası bulunamadı. Rampanın parçalarından birini seç."
  };
  // mod: başarısız planın kaynağı ("balanced" ise tutamak metni Dengeli önermez)
  function hataMetni(r, mod) {
    if (!r) return "Premiere işlemi tamamlanamadı.";
    if (r.restored === false) return HATA.geriAlinamadi;
    if (r.kod === "hizli") return "Bu klibin hızı zaten %" + (r.pct !== null && r.pct !== undefined ? r.pct : "?") + ". Önce Hız/Süre'den %100'e al ya da Rampayı kaldır'ı kullan.";
    if (r.kod === "kilitli") return "Katman kilitli: V" + (Number(r.track) + 1) + ". Kilidi açıp yeniden dene.";
    if (r.kod === "tutamak" && mod === "balanced") return HATA.tutamakDengeli;
    if (r.kod && Object.prototype.hasOwnProperty.call(HATA, r.kod)) return HATA[r.kod];
    return r.error || "Premiere işlemi tamamlanamadı.";
  }
  var KISA = { grafik: "grafik", ters: "ters", remap: "zaman eşleme", warp: "Warp", kilitli: "kilitli", multicam: "multicam", kisa: "kısa",
    qeYok: "hız yazılamadı", linkedConflict: "bağlı ses", tutamak: "medya yetmedi", hizYazilamadi: "hız yazılamadı", yerlesim: "yerleşmedi",
    geriAlinamadi: "geri alınamadı", degisti: "değişmiş", sekans: "sekans değişti", plan: "plan", vurusYok: "vuruş yok", fazla: "12 klip sınırı" };
  // "2 klip atlandı: logo.png (grafik), Röportaj (hızı %50)": şablon, her ad ve her neden ayrı düğüm
  function atlamaParcalari(liste) {
    if (!liste || !liste.length) return [];
    var out = [liste.length === 1 ? "1 klip atlandı: " : liste.length + " klip atlandı: "];
    liste.forEach(function (s, i) {
      if (i) out.push(", ");
      out.push(s.name ? { ad: s.name } : "klip");
      out.push(" (");
      out.push(s.kod === "hizli" ? "hızı %" + (s.pct !== null && s.pct !== undefined ? s.pct : "?") : (KISA[s.kod] || String(s.kod || "?")));
      out.push(")");
    });
    return out;
  }
  function atlamaOzeti(liste) { return duz(atlamaParcalari(liste)); }
  function kopyaAcikParcalari(ad) { return [" Kopya sekans açık: ", { ad: ad }, ". Özgün sekansına dokunulmadı."]; }

  /* ---------------- uygula ---------------- */
  function kilitle(b) {
    ["hiz-uygula", "hiz-kaldir"].forEach(function (id) { var e = el(id); if (e) e.disabled = !!b; });
  }
  function kopyala(o) { var y = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) y[k] = o[k]; return y; }

  async function uygula() {
    if (typeof Pro !== "undefined" && !Pro.gate("speedramp", { deneme: true, yeniden: function () { uygula(); } })) return;
    if (mesgul) return;
    mesgul = true;
    kilitle(true);
    var basarili = [], hatalar = [], atlanan = [], kopyaAdi = "", bildirildi = false;
    try {
      durum("Hedefler okunuyor…");
      var aralik = el("hiz-aralik").value === "inout" ? "inout" : "clips";
      var hd = await K.call("KS_speedRampTargets", { range: aralik }, 30000);
      if (!hd || !hd.ok) throw new Error(hataMetni(hd));
      atlanan = (hd.skipped || []).slice();
      var hedefler = (hd.targets || []).slice(0, EN_COK_KLIP);
      (hd.targets || []).slice(EN_COK_KLIP).forEach(function (t) { atlanan.push({ name: t.name, track: t.track, kod: "fazla" }); });
      // Eski bir rampanın parçaları seçiliyse yeniden rampalanmaz: önce kaldırılmalı
      // (hızı %100 olmayan parça ya da tam aralığı kaplamayan %100 parça; Ctrl+Z ile geri dönmüş
      // tek klip engellenmez)
      var eskiler = [];
      hedefler.concat(atlanan).forEach(function (t) {
        var k = kayitBul(hd.seqId, t.track, Number(t.start), t.mediaPath || "");
        if (!k || eskiler.indexOf(k) !== -1) return;
        var parca = t.kod === "hizli" || (!t.kod && rampaParcasi(k, t.start, t.end));
        if (parca) eskiler.push(k);
      });
      if (eskiler.length) {
        KApp.toast("Bu klipte zaten bir hız rampası var.", "warn", 9000, { metin: "Eski rampayı kaldırıp yeniden uygula", fn: function () { yenidenUygula(eskiler); } });
        throw new Error("Bu klipte zaten bir hız rampası var. Önce Rampayı kaldır'ı kullan.");
      }
      if (!hedefler.length) {
        if (atlanan.length) hataAt(atlamaParcalari(atlanan));
        throw new Error(hataMetni({ kod: "secimYok" }));
      }
      if (hd.caps && hd.caps.setSpeed === false) throw new Error(hataMetni({ kod: "qeYok" }));
      var o = secenek(), kal = kalibrasyon(hd.appVersion);
      // Kopya, gerçekten bir çağrı kopyayı oluşturana dek her çağrıda istenir: ilk hedef panelde
      // atlansa (vuruş yok, plan hatası) ya da host kopyadan önce reddetse (degisti, linkedConflict…)
      // sonraki hedef özgün sekansta uygulanmasın
      var kopya = !!el("hiz-kopya").checked, klonlandi = false;
      var sesModu = el("hiz-ses").value === "keep" ? "keep" : "mute";
      var interp = { slow: Number(el("hiz-akis").value) || 0, fast: el("hiz-bulanik").checked ? 1 : 0 };
      var beklenen = hd.seqId, vb = vurusBilgi(hd.seqId), beats = vb.liste;
      for (var i = 0; i < hedefler.length; i++) {
        var t = hedefler[i];
        // In/Out her zaman Dengeli: önizleme bunu gösterir; host klip kenarına 1 kareden yakın
        // In/Out'u kenara yapıştırıp partial:false dese de (tam hız klibin Out'undan sonrasını oynatırdı)
        if (aralik === "inout" && !t.partial) { t = kopyala(t); t.partial = true; }
        durum("Rampa uygulanıyor… " + (i + 1) + "/" + hedefler.length);
        var m = await medyaBilgisi(t.mediaPath);
        // vuruş anı yalnız playhead'in altındaki klipte hizalanır; her klip kendi vuruşlarını alır
        var cl = SR.clipFor(t, hd.frame, { media: m, playhead: hd.playhead, hizala: !!el("hiz-vurus").checked, beats: beats });
        var p = null;
        try { p = SR.plan(secili, o, cl); } catch (eP) { hatalar.push({ t: t, r: { kod: "plan", error: eP.message } }); continue; }
        if (p.warnings.indexOf("vurusYok") !== -1) { hatalar.push({ t: t, r: { kod: "vurusYok", error: vurusYokMetni(vb) } }); continue; }
        var kopyaIste = kopya && !klonlandi;
        var arg = { target: { track: t.track, start: t.start, end: t.end, mediaPath: t.mediaPath }, range: { start: t.rangeStart, end: t.rangeEnd },
          plan: SR.hostPlan(p), audio: sesModu, interp: interp, cal: kal, expectSeqId: beklenen,
          cloneFirst: kopyaIste, cloneName: kopyaIste ? (t.name ? "Suflo Rampa · " + t.name : "Suflo Rampa").slice(0, 70) : "" };
        var r = await K.call("KS_applySpeedRamp", arg, 120000);
        if (r && r.seqId) beklenen = r.seqId;
        if (r && r.newSeq) { kopyaAdi = r.newSeq; klonlandi = true; kopyaSekanslar[String(r.seqId || "")] = r.newSeq; }
        // ffmpeg tutamak tahmini tutmadı (değişken kare hızı vb.): bir kez Dengeli ile yeniden dene
        if (r && !r.ok && r.kod === "tutamak" && p.mode === "exact" && o.mode === "auto" && r.restored !== false) {
          var o2 = kopyala(o);
          o2.mode = "balanced";
          p = SR.plan(secili, o2, cl);
          arg.plan = SR.hostPlan(p);
          arg.cloneFirst = kopya && !klonlandi;
          if (!arg.cloneFirst) arg.cloneName = "";
          arg.expectSeqId = beklenen;
          r = await K.call("KS_applySpeedRamp", arg, 120000);
          if (r && r.seqId) beklenen = r.seqId;
          if (r && r.newSeq) { kopyaAdi = r.newSeq; klonlandi = true; kopyaSekanslar[String(r.seqId || "")] = r.newSeq; }
        }
        if (r && r.ok) {
          basarili.push({ t: t, r: r, p: p });
          if (r.cal && r.cal.units) kal = r.cal;
        } else {
          hatalar.push({ t: t, r: r, mod: p.mode });
          if (r && (r.kod === "kopya" || r.kod === "sekans" || r.restored === false)) break;
        }
      }
      if (!basarili.length) throw new Error(hatalar.length ? hataMetni(hatalar[0].r, hatalar[0].mod) : hataMetni(null));
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("speedramp", KApp.toast);   // deneme: yalnız başarıda
      kayitlariSakla(basarili, hd.appVersion, kal);
      bildir(basarili, hatalar, atlanan, kopyaAdi);
      bildirildi = true;
    } catch (e) {
      var parcalar = ["✕ "].concat(e && e.parcalar ? e.parcalar : [String(e && e.message ? e.message : e)]);
      // Kopya oluşturulup iş başarısız olduysa: Premiere artık kopya sekansı gösteriyor, söyle; yeniden
      // denemede kopyanın kopyası alınmasın (kutu kendiliğinden kalkar, kopya sekansta kalınır)
      if (kopyaAdi && !bildirildi) {
        parcalar = parcalar.concat(kopyaAcikParcalari(kopyaAdi));
        if (!kopyaElle && el("hiz-kopya")) el("hiz-kopya").checked = false;
      }
      durum(parcalar, "bad");
    } finally {
      mesgul = false;
      kilitle(false);
      dugmeCiz();
    }
  }

  function bildir(basarili, hatalar, atlanan, kopyaAdi) {
    var ilk = basarili[0];
    var msg = basarili.length === 1
      ? ["⏩ ", ilk.t.name ? { ad: ilk.t.name } : SR.get(ilk.p.id).name, " · ", ilk.r.pieces + " parça", " · V" + (ilk.r.track + 1)]
      : [basarili.length + " klibe rampa uygulandı"];
    var yarim = hatalar.map(function (h) { return { name: h.t.name, kod: h.r ? h.r.kod : "?", pct: h.r ? h.r.pct : null }; }).concat(atlanan);
    KApp.toast(dugum(msg), yarim.length ? "warn" : "good");
    if (yarim.length) KApp.toast(dugum(atlamaParcalari(yarim)), "warn", 7000);
    var uyari = [];
    basarili.forEach(function (b) { (b.r.warnings || []).forEach(function (w) { if (uyari.indexOf(w) === -1) uyari.push(w); }); });
    if (uyari.indexOf("sesKapanmadi") !== -1) KApp.toast("Ses kapatılamadı; rampadaki sesi Premiere'de elle kapat.", "warn", 7000);
    if (uyari.indexOf("kaynakKaydi") !== -1) KApp.toast("Rampanın kaynağı 2 kareden fazla kaydı; sonu kontrol et.", "warn", 7000);
    if (kopyaAdi) KApp.toast(dugum(["Kopya sekansta uygulandı: ", { ad: kopyaAdi }]), "good", 5000);
    var kayit = basarili.map(function (b) { return b.r.record; });
    KApp.toast("Ctrl+Z bunu tek adımda geri almaz; Rampayı kaldır'ı kullan.", "", 9000, { metin: "Geri al", fn: function () { kaldir(kayit); } });
    durum(msg, "good");
  }

  async function yenidenUygula(eskiler) {
    var ok = await kaldir(eskiler);
    if (ok) uygula();
  }

  /* ---------------- kaldır (kapısız: deneme rampası da her zaman geri alınır) ---------------- */
  async function kaldir(liste) {
    if (mesgul) return false;
    mesgul = true;
    kilitle(true);
    var tamam = 0;
    try {
      durum("Rampa kaldırılıyor…");
      // Bu Premiere sürümünün setSpeed biçimi: kayıtta yoksa (seçimden kurulan kayıt, eski kayıt) host
      // bunu kullanır; yanlış birimle denemek ilk parçayı bozabilirdi
      var c = ctx || (window.KApp && KApp.ctx ? KApp.ctx() : null);
      var kal = c && c.app ? kalibrasyon(String(c.app)) : null;
      var istekler = [];
      if (liste && liste.length) liste.forEach(function (k) { istekler.push({ record: k, cal: kal }); });
      else {
        var k = c && c.sel ? kayitBul(c.sequenceId, null, Number(c.sel.clipStart), c.sel.mediaPath) : null;
        istekler.push(k ? { record: k, cal: kal } : { fromSelection: true, cal: kal });
      }
      var hata = null;
      for (var i = 0; i < istekler.length; i++) {
        var r = await K.call("KS_removeSpeedRamp", istekler[i], 120000);
        if (r && r.ok) { tamam++; if (istekler[i].record) kayitSil(istekler[i].record); }
        else hata = r && r.kod === "secimYok" ? { kod: "kaldirSecimYok" } : r;
      }
      if (!tamam) throw new Error(hataMetni(hata));
      KApp.toast("Rampa kaldırıldı, klip %100'e döndü", "good");
      durum(hata ? hataMetni(hata) : "", hata ? "warn" : "");
      onizlemeCiz();
    } catch (e) {
      durum(["✕ ", String(e && e.message ? e.message : e)], "bad");
    } finally {
      mesgul = false;
      kilitle(false);
    }
    return tamam > 0;
  }

  function init() {
    if (!SR || !el("tab-hiz") || !el("hiz-grid")) return;
    ayarYukle();
    render();
    ["hiz-yogunluk", "hiz-gecis", "hiz-ritim-yon"].forEach(function (id) {
      var e = el(id);
      if (e) e.addEventListener("change", function () { kartlar(); onizlemeCiz(); ayarKaydet(); });
    });
    ["hiz-parca", "hiz-kaynak", "hiz-vurus"].forEach(function (id) {
      el(id).addEventListener("change", function () { onizlemeCiz(); ayarKaydet(); });
    });
    ["hiz-ses", "hiz-akis", "hiz-bulanik"].forEach(function (id) { el(id).addEventListener("change", ayarKaydet); });
    el("hiz-aralik").addEventListener("change", function () { aralikElle = true; onizlemeCiz(); });
    el("hiz-kopya").addEventListener("change", function () { kopyaElle = true; });
    el("hiz-uygula").addEventListener("click", function () { uygula(); });
    // Tanıtım kartından kurulan deneme Pro olayı yaymaz; app.js düğmeye odaklanır: kilit hemen kalkar
    el("hiz-uygula").addEventListener("focus", dugmeCiz);
    el("hiz-uygula").addEventListener("mouseenter", dugmeCiz);
    el("hiz-kaldir").addEventListener("click", function () { kaldir(); });
    if (window.KApp && KApp.onContext) KApp.onContext(refresh);
    // Ritim analizi başka sekmede yapılır: sekmeye dönünce kartlar (Ritme Rampa) tazelenir
    if (window.KApp && KApp.onTab) KApp.onTab("hiz", function () { render(); if (ctx && ctx.sel && ctx.sel.mediaPath) medyaYokla(ctx.sel.mediaPath); });
    if (typeof Pro !== "undefined" && Pro.on) { try { Pro.on(render); } catch (e) {} }
  }

  return {
    init: init,
    uygula: uygula,
    kaldir: kaldir,
    // testler / tanılama
    _sec: sec,
    _secili: function () { return secili; },
    _atlamaOzeti: atlamaOzeti,
    _atlamaParcalari: atlamaParcalari,
    _hataMetni: hataMetni,
    _refresh: refresh,
    _medya: medya
  };
})();
