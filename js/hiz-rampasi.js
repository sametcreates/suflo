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
 *
 * Özel eğri (3.4 adım 13): "Özel eğri" kartı seçilince düzenleyici açılır (SufloEgriEditor mod 'hiz', js/egri.js;
 * geometri SufloSpeedRamp.ozel). Her önayar kartının "Düzenle"si o kartın anahtarlarını düzenleyiciye kopyalar. Her
 * düzenlemede (80 ms ertelenerek) önizleme ve okuma satırı yeniden çizilir: saf, K.call yok. Son özel eğri ve en çok
 * 12 adlı özel rampa bu görüntüleyicinin yerel deposunda (her erişim korumalı). Uygulama aynı 'speedramp' kapısından
 * ve 3 deneme hakkından geçer; plan aynı yoldan (SufloSpeedRamp.plan 'ozel').
 *
 * Paylaşım (3.4 adım 15, ücretsiz; uygulamak yine 'speedramp' kapısından): Kodu kopyala (SFC1 'hiz' kodu + suflo.app/egri
 * bağlantısı), kod kutusu (tek kod düzenleyiciye; birden çok kod / dosya metni kayıtlı rampalara, içindeki eğriler Eğri
 * sekmesine), İçe aktar / Dışa aktar (.suflo-egri; window.cep.fs pencereleri, js/egri.js SufloEgriPaylas), kayıtlı
 * rampaları yeniden adlandırma ve sürükleyerek sıralama. Kod / dosya biçimi SufloEase'te, liste işlemleri SufloSpeedRamp'te.
 */
window.KHizRampasi = (function () {
  "use strict";

  var SR = window.SufloSpeedRamp;
  var KAYIT_ANAHTAR = "suflo.hizRampa.kayitlar";
  var KAL_ANAHTAR = "suflo.hizRampa.kalibrasyon";
  var AYAR_ANAHTAR = "suflo.hizRampa.ayar";
  var OZEL_ANAHTAR = "suflo.hizRampa.ozel";              // son özel eğri { keys: [[t, %]], hit, sonHit }
  var OZEL_KAYIT_ANAHTAR = "suflo.hizRampa.ozelKayitlar"; // adlı özel rampalar (en çok 12)
  var OZEL_GECIKME = 80;                                  // düzenlerken önizleme gecikmesi (ms)
  var EN_COK_KLIP = 12, EN_COK_KAYIT = 30;
  var W = 320, H = 120;

  var secili = "dalis";
  var mesgul = false;
  var ctx = null;
  var aralikElle = false, kopyaElle = false;
  var medya = {};            // medya yolu (küçük harf) → { duration, fps } | null (ffmpeg -i)
  var medyaSuruyor = {};
  // Bu oturumda Suflo'nun açtığı kopya sekanslar (seqId → { ad, kaynak: kopyalanan sekansın seqId'si }):
  // bu sekanslardayken kopya kutusu kendiliğinden işaretlenmez (kopyanın kopyası olmasın; özgün sekans
  // zaten dokunulmadı). Kopya özgünle aynı timeline'dır: özgünde yapılan ritim analizi kopyada da geçerli
  var kopyaSekanslar = {};
  // Bağlam yoklamasının (2.5 sn) önizlemeyi ilgilendiren alanları: playhead, In/Out, seçili klibin yeri
  var sonAnahtar = "";
  // Özel eğri: anahtarlar [[t, %]] ve ağır çekim anı (null: yok); sonHit: kutu yeniden açılınca dönülecek yer
  var ozel = { keys: SR ? SR.OZEL_VARSAYILAN.keys : [], hit: SR ? SR.OZEL_VARSAYILAN.hit : null, sonHit: 0.5 };
  var editor = null, ozelZaman = null;
  // CEP tuş ilgisi (tuslariTut): odaktaki öğenin türü ('editor' | 'duzenle' | '') ve CEP'e son bildirilen
  var tusOdak = "", tusTutuluyor = "";

  function el(id) { return document.getElementById(id); }
  function tr(s) { var I = window.SufloI18n; return I && I.tr ? I.tr(s) : s; }

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
  // Özel eğrinin anahtarları her zaman eklenir (kart küçük resmi); plan yalnız "ozel"de okur. Kopya: uygulama iş
  // başında aldığı seçenekle sürer, düzenleyici sonradan değişse de kalan klipler aynı eğriyi alır
  function secenek() {
    return {
      k: Number(el("hiz-yogunluk").value) || 1,
      ease: el("hiz-gecis").value,
      density: el("hiz-parca").value,
      mode: el("hiz-kaynak").value,
      onBeat: el("hiz-ritim-yon") ? el("hiz-ritim-yon").value : "slow",
      ozelKeys: ozel.keys.map(function (k) { return [k[0], k[1]]; }),
      ozelHit: ozel.hit
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
    if (a && a.seqId && seq && !ayniTimeline(String(a.seqId), seq)) return { durum: "baska", liste: [] };
    return { durum: "var", liste: liste, start: a ? a.start : null, end: a ? a.end : null };
  }
  function vuruslar() { return vurusBilgi().liste; }
  // seq, analiz sekansının kendisi ya da Suflo'nun bu oturumda ondan açtığı (kopyanın kopyası da) kopya mı
  function ayniTimeline(analiz, seq) {
    var s = String(seq || ""), adim = 0;
    while (s && adim++ < 16) {
      if (s === analiz) return true;
      var k = kopyaSekanslar[s];
      s = k && k.kaynak ? String(k.kaynak) : "";
    }
    return false;
  }
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

  // Önizleme genişliği: viewBox ölçülen genişlikle kurulur, metin ve vuruş noktası yatayda gerilmez
  // (preserveAspectRatio="none" yalnız ölçülemezse ya da yeniden çizimden önceki boyutlamada devrede)
  function onizlemeGenislik(svg) {
    var w = 0;
    try { w = svg.getBoundingClientRect ? svg.getBoundingClientRect().width : Number(svg.clientWidth) || 0; } catch (e) { w = 0; }
    w = Math.round(Number(w) || 0);
    return w >= 80 ? Math.min(w, 4000) : W;
  }

  function svgCubuklar(p, gw) {
    return SR.steps(p, gw || W, H).map(function (r) {
      return '<rect class="hiz-basamak" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"></rect>';
    }).join("");
  }

  var UYARI = {
    yogunlukDustu: "Klibin sonrasında yeterli görüntü yok: yoğunluk düşürüldü",
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
        // Optik akış zaten seçiliyse öneri anlamsız: satır gösterilmez
        var m = medyaBilgisiOnbellek(h && h.mediaPath), q = m && m.fps ? SR.quality(p, p.fps, m.fps) : null;
        if (q && !(el("hiz-akis") && el("hiz-akis").value === "2")) satir.push("Kaynak " + m.fps + " fps: %" + Math.round(q.cleanMin * 100) + " altı takılabilir, Optik akış'ı dene");
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
    var p, so = secenek();
    try {
      p = SR.plan(secili, so, SR.clipFor(h, fr, { media: medyaBilgisiOnbellek(h.mediaPath), playhead: ctx ? ctx.playhead : null,
        hizala: !!el("hiz-vurus").checked && !h.ornek, beats: vuruslar() }));
    } catch (e) {
      svg.innerHTML = "";
      if (oz) oz.textContent = /çok kısa/.test(e.message) ? "Rampa için en az 12 kare gerekli." : (e.kod === "duz" ? HATA[duzKodu(secili, so)] : e.message);
      return;
    }
    var gw = onizlemeGenislik(svg);
    if (svg.setAttribute) svg.setAttribute("viewBox", "0 0 " + gw + " " + H);
    var taban = SR.base(H);
    var vurus = "";
    if (p.hit) {
      var vx = Math.round(p.hit.u * gw * 100) / 100, vy = SR.yAt(SR.speedAt(p.keys, p.hit.u, p.ease), H);
      vurus = '<line class="hiz-vurus-cizgi" x1="' + vx + '" x2="' + vx + '" y1="0" y2="' + H + '"></line><circle class="hiz-vurus" cx="' + vx + '" cy="' + vy + '" r="4"></circle>';
    }
    svg.innerHTML = svgCubuklar(p, gw) +
      '<line class="hiz-taban" x1="0" x2="' + gw + '" y1="' + taban + '" y2="' + taban + '"></line>' +
      '<text class="hiz-eksen" x="3" y="' + (taban - 3) + '">100%</text>' +
      '<path class="hiz-egri" d="' + SR.path(p.keys, p.ease, gw, H) + '"></path>' + vurus;
    ozetYaz(ozetSatirlari(p, fr, h));
  }

  /* ---------------- kartlar ---------------- */
  // Küçük resimler yalnız yoğunluk / yumuşatma / vuruş yönü ya da vuruş durumu değişince yeniden çizilir
  // (Özel eğri kartınınki düzenledikçe de: ozelResim)
  var sonVurusDurum = "";
  function resimHtml(id, o) {
    var t = SR.thumb(id, 120, 56, { k: o.k, ease: o.ease, onBeat: o.onBeat, ozelKeys: o.ozelKeys, ozelHit: o.ozelHit });
    return '<svg viewBox="0 0 120 56" aria-hidden="true">' +
      '<line class="hiz-taban" x1="0" x2="120" y1="' + t.base + '" y2="' + t.base + '"></line>' +
      '<path class="hiz-egri" d="' + t.path + '"></path>' +
      (t.hit ? '<circle class="hiz-vurus" cx="' + t.hit.x + '" cy="' + t.hit.y + '" r="3"></circle>' : "") + "</svg>";
  }
  function kartlar() {
    var grid = el("hiz-grid");
    if (!grid) return;
    // Odaktaki Düzenle ızgarayla birlikte kaldırılır (CEF 74 blur yaymaz): Enter / Space Premiere'e geri verilir
    if (tusOdak === "duzenle") tusOdakAta("");
    grid.innerHTML = "";
    var o = secenek(), vb = vurusBilgi();
    sonVurusDurum = vb.durum;
    SR.list().forEach(function (p) {
      var kart = document.createElement("button");
      kart.type = "button";
      kart.className = "preset-card hiz-card" + (p.id === secili ? " on" : "") + (p.id === "ozel" ? " hiz-card-ozel" : "");
      kart.setAttribute("aria-pressed", p.id === secili ? "true" : "false");
      kart.setAttribute("data-id", p.id);
      var resim = document.createElement("span");
      resim.className = "hiz-resim";
      resim.innerHTML = resimHtml(p.id, o);
      var bilgi = document.createElement("span");
      bilgi.className = "hiz-bilgi";
      var b = document.createElement("b"); b.textContent = p.name;
      var i = document.createElement("i");
      var kapali = !!p.beats && vb.durum !== "var";
      i.textContent = kapali ? (vb.durum === "baska" ? VURUS_BASKA : VURUS_YOK) : p.desc;
      bilgi.appendChild(b); bilgi.appendChild(i);
      kart.appendChild(resim); kart.appendChild(bilgi);
      // Düzenle: bu önayarın anahtarlarını Özel eğri düzenleyicisine kopyalar (vuruşlu Ritme Rampa ve Özel eğrinin
      // kendisi hariç). Kartın içinde (ızgarada kart başına tek öğe kalır); tıklaması kartı ayrıca seçmez
      if (!p.beats && p.id !== "ozel") {
        var dz = document.createElement("i");
        dz.className = "hiz-duzenle";
        dz.setAttribute("role", "button");
        dz.setAttribute("tabindex", "0");
        dz.setAttribute("title", "Bu eğriyi Özel eğri düzenleyicisine kopyala");
        dz.textContent = "Düzenle";
        dz.addEventListener("click", function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); duzenle(p.id); });
        dz.addEventListener("keydown", function (ev) {
          if (!ev || (ev.key !== "Enter" && ev.key !== " " && ev.keyCode !== 13 && ev.keyCode !== 32)) return;
          if (ev.preventDefault) ev.preventDefault();
          if (ev.stopPropagation) ev.stopPropagation();
          duzenle(p.id);
        });
        // Odaktayken Enter / Space panelde tutulur (CEP ikisini de Premiere'e verirdi: Enter render, Space oynatma)
        dz.addEventListener("focus", function () { tusOdakAta("duzenle"); });
        dz.addEventListener("blur", function () { if (tusOdak === "duzenle") tusOdakAta(""); });
        kart.appendChild(dz);
      }
      if (kapali) { kart.disabled = true; kart.className += " kapali"; }
      kart.addEventListener("click", function () { sec(p.id); });
      grid.appendChild(kart);
    });
  }
  // Yalnız Özel eğri kartının küçük resmi (düzenlerken ızgara yeniden kurulmaz: odak ve kaydırma yerinde kalır)
  function ozelResim() {
    var grid = el("hiz-grid"), kids = grid ? grid.children : null;
    if (!kids) return;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (!k.getAttribute || k.getAttribute("data-id") !== "ozel") continue;
      var r = k.children && k.children[0];
      if (r) r.innerHTML = resimHtml("ozel", secenek());
    }
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
    // Uygulama sürerken eğri değişmez (kalan klipler başka eğriyle rampalanmasın)
    if (mesgul || !SR.has(id)) return;
    if (id === "ritim" && !vuruslar().length) return;
    secili = id;
    var yon = el("hiz-ritim-yon-kutu");
    if (yon) yon.hidden = secili !== "ritim";
    kartSecimi();
    ozelKutu();
    onizlemeCiz();
    ayarKaydet();
  }

  /* ---------------- Özel eğri (3.4 adım 13) ---------------- */
  // Son özel eğri: bozuk / eski kayıt başlangıç eğrisinde bırakır
  function ozelYukle() {
    var a = depoOku(OZEL_ANAHTAR, null);
    if (!a || typeof a !== "object" || !SR.ozelGecerliMi(a.keys)) return;
    ozel.keys = SR.ozelYuzde(a.keys);
    ozel.hit = SR.ozelHit(a.hit);
    var sh = SR.ozelHit(a.sonHit);
    ozel.sonHit = ozel.hit !== null ? ozel.hit : (sh !== null ? sh : 0.5);
  }
  function ozelKaydet() { depoYaz(OZEL_ANAHTAR, { keys: ozel.keys, hit: ozel.hit, sonHit: ozel.sonHit }); }
  // Düzenleyici kutusu yalnız Özel eğri seçiliyken görünür
  function ozelKutu() {
    var k = el("hiz-ozel");
    if (k) k.hidden = secili !== "ozel";
    var h = el("hiz-ozel-hit");
    if (h) h.checked = ozel.hit !== null;
    if (secili === "ozel" && editor) editor.ciz();
  }
  // Düzenleyiciden her değişiklik: durum hemen, önizleme ve kart resmi 80 ms ertelenerek (sürüklerken her olayda
  // çizilmez); depoya yalnız bırakınca yazılır
  function ozelDegisti(keys, o) {
    ozel.keys = keys;
    if (o && o.hit !== undefined) ozel.hit = SR.ozelHit(o.hit);
    if (ozel.hit !== null) ozel.sonHit = ozel.hit;
    var h = el("hiz-ozel-hit");
    if (h) h.checked = ozel.hit !== null;
    ozelZamanla();
    if (o && o.bitti) ozelKaydet();
  }
  function ozelZamanla() {
    if (ozelZaman) clearTimeout(ozelZaman);
    ozelZaman = setTimeout(function () { ozelZaman = null; ozelResim(); onizlemeCiz(); }, OZEL_GECIKME);
  }
  // Seçili noktaya göre düğmeler: Sert basamak ve Noktayı sil yalnız aradaki bir nokta seçiliyken
  function ozelSecim(i, bilgi) {
    var ic = !!(bilgi && bilgi.ic);
    var b = el("hiz-ozel-basamak"), s = el("hiz-ozel-sil");
    if (b) { b.disabled = !ic; b.textContent = bilgi && bilgi.basamak ? "Basamağı kaldır" : "Sert basamak"; }
    if (s) s.disabled = !ic;
  }
  // Düzenleyiciye dışarıdan eğri (Düzenle, kayıtlı rampa, Sıfırla): Özel eğri seçilir, önizleme hemen çizilir.
  // Yerine geçilen eğri başka yoldan geri gelmiyorsa (elle çizilmiş, adıyla kaydedilmemiş: SR.ozelBilinen) bildirimde
  // "Geri al" çıkar: Düzenle rozeti kart resminin köşesinde, kartı seçmek isterken de basılabilir (depoya hemen yazılır)
  function ozelAta(keys, hit) {
    var eski = { keys: ozel.keys, hit: ozel.hit };
    ozel.keys = SR.ozelYuzde(keys);
    ozel.hit = SR.ozelHit(hit);
    if (ozel.hit !== null) ozel.sonHit = ozel.hit;
    if (editor) editor.ata(ozel.keys, ozel.hit);
    ozelKaydet();
    kayitSecimiBirak();
    if (secili === "ozel") { ozelKutu(); onizlemeCiz(); }
    else sec("ozel");
    ozelResim();
    if (!SR.ozelAyni(eski, ozel) && !SR.ozelBilinen(eski, ozelKayitlar()) && window.KApp && KApp.toast) {
      KApp.toast("Kaydedilmemiş özel eğrinin yerine yenisi geldi.", "warn", 9000, { metin: "Geri al", fn: function () { ozelGeriAl(eski); } });
    }
  }
  function ozelGeriAl(eski) {
    if (mesgul || !eski) return;
    ozelAta(eski.keys, eski.hit);
    durum("Önceki özel eğri geri geldi.", "good");
  }
  function duzenle(id) {
    if (mesgul) return;
    var p = SR.get(id);
    if (!p || p.beats || p.id === "ozel") return;
    ozelAta(p.keys, p.hit);
    durum([p.name + " özel eğriye kopyalandı; noktaları sürükleyerek değiştir."], "good");
  }
  function ozelSifirla() {
    if (mesgul) return;
    ozelAta(SR.OZEL_VARSAYILAN.keys, SR.OZEL_VARSAYILAN.hit);
    durum("");
  }
  function ozelHitDegisti() {
    ozel.hit = el("hiz-ozel-hit").checked ? (ozel.sonHit !== null ? ozel.sonHit : 0.5) : null;
    if (editor) editor.hit(ozel.hit);
    ozelKaydet();
    ozelResim();
    onizlemeCiz();
  }

  /*
   * CEP tuş ilgisi: odak metin kutusunda değilken basılan tuşlar Premiere'e de gider. Özel eğri düzenleyicisi odaktayken
   * Delete seçili timeline klibini silerdi (Eğri sekmesinin aynı düzenleyicisinde Delete noktayı siler), bir Düzenle
   * odaktayken Enter efektleri render eder, Space oynatırdı. Odaktaki öğenin tuşları (SR.ozel.tusIlgisi) panelde tutulur;
   * odak gidince, Düzenle ızgarayla kaldırılınca ve sekmeden çıkınca "" ile bırakılır (CEF 74 gizlenen ya da kaldırılan
   * öğeden blur yaymayabilir: tıklama ve yoklama yeniden bakar). Eğri sekmesi kendi ilgisini yalnız kendi sekmesi
   * açıkken tutar (js/egri.js tuslariTut). Paketteki CSInterface.js'te sarmalayıcı yok: doğrudan window.__adobe_cep__;
   * CEP dışında (test, tarayıcı) hiçbir şey yapmaz.
   */
  function tuslariTut() {
    var tur = tusOdak && sekmeAcik() ? tusOdak : "";
    if (tur === tusTutuluyor) return;
    var cep = window.__adobe_cep__;
    if (!cep || typeof cep.registerKeyEventsInterest !== "function") return;
    try {
      cep.registerKeyEventsInterest(tur ? SR.ozel.tusIlgisi(tur, !!(typeof K !== "undefined" && K && K.MAC)) : "");
      tusTutuluyor = tur;
    } catch (e) {}
  }
  function tusOdakAta(tur) { tusOdak = tur || ""; tuslariTut(); }
  // Düzenleyicide Delete / Backspace: seçili noktayı siler (Noktayı sil düğmesi gibi; seçim yoksa nedeni söyler).
  // Ctrl / Alt / Cmd'li hâller ve sekme kapalıyken basılanlar Premiere'in
  function ozelTus(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || !editor || mesgul || !sekmeAcik() || secili !== "ozel") return;
    var k = String(e.key || "");
    if (!(k === "Delete" || k === "Backspace" || (!k && (e.keyCode === 46 || e.keyCode === 8)))) return;
    if (e.preventDefault) e.preventDefault();
    editor.sil();
  }

  /* ---- adlı özel rampalar (bu görüntüleyicinin yerel deposu, en çok 12) ---- */
  function ozelKayitlar() { return SR.ozelKayitlar(depoOku(OZEL_KAYIT_ANAHTAR, [])); }
  var seciliKayit = "";      // seçili (yüklenen) kayıtlı rampa: Adı değiştir onu yeniden adlandırır (3.4 adım 15)
  var suruklenenKayit = "";  // sürüklenen kayıt
  function kayitSinif(e, ad, on) { try { if (e.classList) e.classList.toggle(ad, !!on); } catch (eS) {} }
  // Kayıt çipini sürüklenebilir yap: başka bir çipin üstüne bırakınca o sıraya taşınır (3.4 adım 15)
  function kayitSurukleBagla(b, k) {
    b.setAttribute("draggable", "true");
    b.draggable = true;
    b.addEventListener("dragstart", function (e) {
      suruklenenKayit = k.id;
      try { if (e && e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k.id); } } catch (eD) {}
      kayitSinif(b, "surukleniyor", true);
    });
    b.addEventListener("dragover", function (e) {
      if (!suruklenenKayit || suruklenenKayit === k.id) return;
      if (e && e.preventDefault) e.preventDefault();
      kayitSinif(b, "birak", true);
    });
    b.addEventListener("dragleave", function () { kayitSinif(b, "birak", false); });
    b.addEventListener("drop", function (e) {
      if (e && e.preventDefault) e.preventDefault();
      kayitSinif(b, "birak", false);
      var id = suruklenenKayit;
      suruklenenKayit = "";
      if (id && id !== k.id) ozelKayitSurukle(id, k.id);
    });
    b.addEventListener("dragend", function () { suruklenenKayit = ""; kayitSinif(b, "surukleniyor", false); });
  }
  function ozelKayitlariCiz() {
    var kap = el("hiz-ozel-kayitlar");
    var liste = ozelKayitlar();
    if (seciliKayit && !liste.some(function (x) { return x.id === seciliKayit; })) seciliKayit = "";
    var ad = el("hiz-ozel-adlandir");
    if (ad) ad.disabled = !seciliKayit;
    if (!kap) return;
    kap.innerHTML = "";
    kap.hidden = !liste.length;
    liste.forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "hiz-ozel-kayit" + (k.id === seciliKayit ? " on" : "");
      b.setAttribute("data-id", k.id);
      b.setAttribute("aria-pressed", k.id === seciliKayit ? "true" : "false");
      var ad = document.createElement("span");
      // kullanıcının verdiği ad çevrilmez
      ad.setAttribute("data-i18n-skip", "");
      ad.textContent = k.ad;
      b.appendChild(ad);
      var x = document.createElement("i");
      x.className = "hiz-ozel-kayit-sil";
      x.setAttribute("role", "button");
      x.setAttribute("title", "Özel rampayı sil");
      x.textContent = "×";
      x.addEventListener("click", function (ev) { if (ev && ev.stopPropagation) ev.stopPropagation(); ozelKayitSil(k.id); });
      b.appendChild(x);
      kayitSurukleBagla(b, k);
      b.addEventListener("click", function () { ozelKayitSec(k.id); });
      kap.appendChild(b);
    });
  }
  /*
   * Düzenleyiciye başka bir eğri geldi (Düzenle, Sıfırla, Geri al, kod; ozelAta): seçili kayıt bırakılır, ad kutusunda o
   * kaydın adı duruyorsa silinir. Yoksa Kaydet o kaydın üstüne başka eğriyi yazardı (3.4 adım 15 incelemesi). Kayıt çipi
   * (ozelKayitSec) seçimi ozelAta'dan sonra yeniden kurar; elle sürüklenen noktalar seçimi bozmaz (Kaydet onu günceller).
   */
  var kodAdi = "";          // kod kutusundan yüklenen eğrinin ad kutusuna yazılan adı (inceleme r2)
  function kayitSecimiBirak() {
    // Koddan yüklenen eğrinin yerine başka eğri geldi (Geri al, Düzenle, Sıfırla, çip): kutuda hâlâ kodun adı duruyorsa
    // silinir; yoksa Kaydet / Kodu kopyala kullanıcının eğrisini arkadaşının adıyla saklar / paylaşırdı
    if (kodAdi) {
      var kg = el("hiz-ozel-ad");
      if (kg && String(kg.value || "").replace(/^\s+|\s+$/g, "").toLowerCase() === kodAdi.toLowerCase()) kg.value = "";
      kodAdi = "";
    }
    if (!seciliKayit) return;
    var k = ozelKayitlar().filter(function (x) { return x.id === seciliKayit; })[0], girdi = el("hiz-ozel-ad");
    if (girdi && k && String(girdi.value || "").replace(/^\s+|\s+$/g, "").toLowerCase() === k.ad.toLowerCase()) girdi.value = "";
    seciliKayit = "";
    ozelKayitlariCiz();
  }
  function ozelKayitSec(id) {
    if (mesgul) return;
    var k = ozelKayitlar().filter(function (x) { return x.id === id; })[0];
    if (!k) return;
    ozelAta(k.keys, k.hit);
    seciliKayit = k.id;
    // ad kutusuna kaydın adı gelir: Kaydet aynı adla günceller, Adı değiştir yeniden adlandırır
    var girdi = el("hiz-ozel-ad");
    if (girdi) girdi.value = k.ad;
    ozelKayitlariCiz();
    durum(["Yüklendi: ", { ad: k.ad }], "good");
  }
  function ozelKayitKaydet() {
    var liste = ozelKayitlar(), girdi = el("hiz-ozel-ad");
    var yazilan = girdi ? String(girdi.value || "") : "";
    var ad = /\S/.test(yazilan) ? yazilan : tr(SR.ozelKayitAdi(liste, tr));
    var r = SR.ozelKayitEkle(liste, ad, ozel.keys, ozel.hit, Date.now());
    if (!r.ok) { durum(r.kod === "dolu" ? "En çok 12 özel rampa saklanır; birini sil." : "Özel rampaya bir ad yaz.", "warn"); return; }
    // aynı adlı (büyük / küçük harf ayrımsız) kaydın eğrisi değişecekse eskisi bildirimdeki Geri al için tutulur
    var eskiK = r.guncellendi ? liste.filter(function (x) { return x.id === r.id; })[0] : null;
    if (!depoYaz(OZEL_KAYIT_ANAHTAR, r.liste)) { durum("Özel rampa bu bilgisayarda saklanamadı.", "warn"); return; }
    var kayit = r.liste.filter(function (x) { return x.id === r.id; })[0];
    if (girdi) { girdi.value = ""; girdi.setAttribute("placeholder", SR.ozelKayitAdi(r.liste, tr)); }
    kodAdi = "";
    seciliKayit = r.id;
    ozelKayitlariCiz();
    durum([r.guncellendi ? "Güncellendi: " : "Kaydedildi: ", { ad: kayit ? kayit.ad : ad }], "good");
    if (eskiK && !SR.ozelAyni(eskiK, ozel) && window.KApp && KApp.toast) {
      KApp.toast("Kayıtlı özel rampanın eğrisi yenisiyle değişti.", "warn", 9000, { metin: "Geri al", fn: function () { ozelKayitGeriKoy(eskiK, -1); } });
    }
  }
  // Silinen ya da üstüne yazılan kaydı geri koy (bildirimdeki Geri al): aynı id varsa eğrisi eskiye döner, yoksa eski
  // sırasına eklenir (liste doluysa söylenir)
  function ozelKayitGeriKoy(eski, sira) {
    if (!eski) return;
    var liste = ozelKayitlar(), var1 = false;
    liste = liste.map(function (x) { if (x.id !== eski.id) return x; var1 = true; return { id: x.id, ad: x.ad, keys: eski.keys, hit: eski.hit }; });
    if (!var1) {
      if (liste.length >= SR.ozel.KAYIT) { durum("En çok 12 özel rampa saklanır; birini sil.", "warn"); return; }
      liste.splice(sira >= 0 && sira <= liste.length ? sira : liste.length, 0, { id: eski.id, ad: eski.ad, keys: eski.keys, hit: eski.hit });
    }
    if (!depoYaz(OZEL_KAYIT_ANAHTAR, liste)) { durum("Özel rampa bu bilgisayarda saklanamadı.", "warn"); return; }
    var girdi = el("hiz-ozel-ad");
    if (girdi) girdi.setAttribute("placeholder", SR.ozelKayitAdi(ozelKayitlar(), tr));
    ozelKayitlariCiz();
    durum(["Geri geldi: ", { ad: eski.ad }], "good");
  }
  function ozelKayitSil(id) {
    var once = ozelKayitlar(), sira = -1;
    once.forEach(function (x, i) { if (x.id === id) sira = i; });
    if (sira < 0) return;
    var eski = once[sira];
    var liste = SR.ozelKayitSil(once, id);
    if (!depoYaz(OZEL_KAYIT_ANAHTAR, liste)) { durum("Özel rampa bu bilgisayarda saklanamadı.", "warn"); return; }
    if (seciliKayit === id) seciliKayit = "";
    var girdi = el("hiz-ozel-ad");
    if (girdi) girdi.setAttribute("placeholder", SR.ozelKayitAdi(liste, tr));
    ozelKayitlariCiz();
    // çipin küçük × işareti yanlışlıkla basılabilir: silinen rampa bildirimdeki Geri al ile yerine döner
    if (window.KApp && KApp.toast) KApp.toast("Özel rampa silindi.", "warn", 9000, { metin: "Geri al", fn: function () { ozelKayitGeriKoy(eski, sira); } });
  }

  /* ---- paylaşım (3.4 adım 15; ücretsiz, Premiere'e gitmez; uygulamak yine 'speedramp' kapısından) ---- */
  function P() { return window.SufloEgriPaylas || null; }
  function EZ() { return window.SufloEase || null; }
  function paylasimHatasi(kod) { var p = P(); return p ? p.hataMetni(kod) : "Geçersiz kod."; }
  // Seçili kaydı ad kutusundaki adla yeniden adlandır
  function ozelKayitAdlandir() {
    var girdi = el("hiz-ozel-ad");
    var r = SR.ozelKayitAdlandir(ozelKayitlar(), seciliKayit, girdi ? String(girdi.value || "") : "");
    if (!r.ok) {
      durum(r.kod === "ayni" ? "Bu adla başka bir özel rampa var; başka bir ad yaz." : r.kod === "ad" ? "Özel rampaya bir ad yaz." : "Önce kayıtlı bir rampa seç.", "warn");
      return false;
    }
    if (!depoYaz(OZEL_KAYIT_ANAHTAR, r.liste)) { durum("Özel rampa bu bilgisayarda saklanamadı.", "warn"); return false; }
    var k = r.liste.filter(function (x) { return x.id === seciliKayit; })[0];
    ozelKayitlariCiz();
    durum(["Adı değişti: ", { ad: k ? k.ad : "" }], "good");
    return true;
  }
  function ozelKayitSurukle(id, hedefId) {
    var once = ozelKayitlar(), h = -1;
    once.forEach(function (x, i) { if (x.id === hedefId) h = i; });
    if (h < 0) return;
    if (!depoYaz(OZEL_KAYIT_ANAHTAR, SR.ozelKayitTasi(once, id, h))) { durum("Özel rampa bu bilgisayarda saklanamadı.", "warn"); return; }
    ozelKayitlariCiz();
  }
  // Paylaşılacak ad: seçili kayıt (eğri aynıysa), yoksa ad kutusuna yazılan ad; o ad eğrisi başka olan bir kayda aitse
  // (seçili kayıt dışında) adsız paylaşılır: kod başka bir rampanın adını taşımasın
  function paylasilacakAd() {
    var liste = ozelKayitlar(), k = liste.filter(function (x) { return x.id === seciliKayit; })[0];
    if (k && SR.ozelAyni(k, ozel)) return k.ad;
    var girdi = el("hiz-ozel-ad"), ad = girdi ? String(girdi.value || "").replace(/^\s+|\s+$/g, "") : "";
    var baska = liste.some(function (x) { return x.id !== seciliKayit && x.ad.toLowerCase() === ad.toLowerCase() && !SR.ozelAyni(x, ozel); });
    return baska ? "" : ad;
  }
  function ozelKodKopyala() {
    var E = EZ(), p = P();
    var kod = E ? E.paylasimKodla({ tur: "hiz", ad: paylasilacakAd(), keys: ozel.keys, hit: ozel.hit }) : null;
    if (!kod || !p) { durum("Bu özel eğri paylaşılamadı.", "warn"); return; }
    var I = window.SufloI18n, dil = I && I.getLang ? I.getLang() : "tr";
    p.kopyala(kod + "\n" + E.egriAdresi(kod, dil), function (ok) {
      if (ok) { if (window.KApp && KApp.toast) KApp.toast("Hız Rampası kodu ve suflo.app/egri bağlantısı kopyalandı", "good", 7000); return; }
      var g = el("hiz-ozel-kod");
      if (g) { g.value = kod; try { if (g.focus) g.focus(); if (g.select) g.select(); } catch (e) {} }
      durum("Kopyalanamadı; kod aşağıdaki kutuda, Ctrl+C ile kopyala.", "warn");
    });
  }
  // kutu (kod kutusu): yalnız saklanamayan kalmadıysa boşalır (liste dolu / depo yazılamadı: kodlar kutuda kalır, yer açınca
  // yeniden yüklenir; hepsi yinelenense boşalır)
  function iceAlGoster(r, kutu) {
    var p = P();
    if (!p) { durum(paylasimHatasi("diyalog"), "warn"); return false; }
    var s = p.iceAl(r);
    durum(s.ozet.parcalar, s.ozet.uyari ? "warn" : "good");
    if (kutu && !(s.kalan > 0)) kutu.value = "";
    return s.ozet.eklenen > 0;
  }
  /*
   * Kod kutusu: tek Hız Rampası kodu düzenleyiciye gelir (adı ad kutusuna; Kaydet ile saklanır); tek eğri kodu /
   * cubic-bezier burada kullanılamaz (Eğri sekmesine yönlendirilir); birden çok kod ya da dosya metni önayarlara eklenir
   * (hız eğrileri kayıtlı rampalara, eğriler Eğri sekmesine).
   */
  function ozelKodYukle() {
    if (mesgul) return false;
    var E = EZ(), g = el("hiz-ozel-kod"), metin = g ? String(g.value || "") : "";
    if (!E) { durum(paylasimHatasi("bozuk"), "warn"); return false; }
    var r = E.iceAktar(metin);
    if (!r.ok) { durum(paylasimHatasi(/^\s*\{/.test(metin) && r.hata === "bicim" ? "dosyaBicim" : r.hata), "warn"); return false; }
    var tek = (r.bicim === "kod" || r.bicim === "css") && r.presets.length === 1 && !r.uyarilar.length && !r.yinelenen;
    if (tek && r.presets[0].tur === "egri") { durum(paylasimHatasi("egriKodu"), "warn"); return false; }
    if (tek) {
      if (g) g.value = "";
      var p = r.presets[0];
      ozelAta(p.keys, p.hit);
      // ad kutusu: aynı ad ve eğriyle kayıtlıysa o kayıt seçilir; ad başka bir kaydınsa "Ad (2)" (Kaydet kullanıcının
      // kendi rampasının üstüne yazmasın; içe aktarmanın kuralı)
      var girdi = el("hiz-ozel-ad"), liste = ozelKayitlar();
      var ayni = p.ad ? liste.filter(function (x) { return x.ad.toLowerCase() === p.ad.toLowerCase() && SR.ozelAyni(x, p); })[0] : null;
      seciliKayit = ayni ? ayni.id : "";
      if (girdi) girdi.value = ayni ? ayni.ad : (p.ad ? SR.ozelKayitBenzersizAd(liste, p.ad) : "");
      kodAdi = !ayni && girdi ? String(girdi.value || "") : "";
      ozelKayitlariCiz();
      durum(p.ad ? ["Yüklendi: ", { ad: p.ad }, ". Saklamak için Kaydet'e bas."] : "Özel eğri yüklendi. Saklamak için Kaydet'e bas.", "good");
      return true;
    }
    return iceAlGoster(r, g);
  }
  function ozelDosyaIceAktar() {
    var E = EZ(), p = P();
    if (!E || !p) { durum(paylasimHatasi("diyalog"), "warn"); return false; }
    var d = p.dosyaAc("Eğri dosyası seç (.suflo-egri ya da JSON)");
    if (!d.ok) { if (d.hata !== "iptal") durum(paylasimHatasi(d.hata), "warn"); return false; }
    var r = E.iceAktar(d.metin);
    if (!r.ok) { durum(paylasimHatasi(r.hata === "bicim" ? "dosyaBicim" : r.hata), "warn"); return false; }
    return iceAlGoster(r);
  }
  function ozelDosyaDisaAktar() {
    var E = EZ(), p = P();
    if (!E || !p) { durum(paylasimHatasi("diyalog"), "warn"); return false; }
    var liste = SR.ozelKayitlarDisa(ozelKayitlar());
    if (!liste.length) { durum("Dışa aktarılacak özel rampa yok: önce bir eğriyi adıyla Kaydet.", "warn"); return false; }
    var y = E.dosyaYaz(liste);
    var s = p.dosyaKaydet(y.metin, "suflo-hiz-rampalari." + p.UZANTI, "Özel rampaları kaydet");
    if (!s.ok) { if (s.hata !== "iptal") durum(paylasimHatasi(s.hata), "warn"); return false; }
    durum(["Dışa aktarıldı: " + y.adet + " özel rampa → ", { ad: s.yol }], "good");
    return true;
  }
  /*
   * Başka sekmeden gelen özel rampaları ekle (SufloEgriPaylas.iceAl: Eğri sekmesinin İçe aktar'ı / kod kutusu).
   * Döner: { ok (depoya yazıldı), eklenen: [id], yinelenen, dolu }
   */
  function ozelKayitlariIceAl(gelenler) {
    if (!SR) return { ok: false, eklenen: [], yinelenen: 0, dolu: 0 };
    var r = SR.ozelKayitlarIceAl(ozelKayitlar(), gelenler, Date.now(), tr);
    if (r.eklenen.length && !depoYaz(OZEL_KAYIT_ANAHTAR, r.liste)) return { ok: false, eklenen: [], yinelenen: 0, dolu: 0 };
    var girdi = el("hiz-ozel-ad");
    if (girdi) girdi.setAttribute("placeholder", SR.ozelKayitAdi(r.liste, tr));
    ozelKayitlariCiz();
    return { ok: true, eklenen: r.eklenen, yinelenen: r.yinelenen, dolu: r.dolu };
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
    if (secili === "ritim" && !vuruslar().length && !mesgul) secili = "dalis";
    var yon = el("hiz-ritim-yon-kutu");
    if (yon) yon.hidden = secili !== "ritim";
    kartlar();
    ozelKutu();
    onizlemeCiz();
    dugmeCiz();
  }

  /* ---------------- bağlam ---------------- */
  // Sekans değişti (analiz başka sekansta kaldı) ya da analiz geldi: Ritme Rampa kartı tazelenir.
  // Uygulama sürerken (ilk klibin kopyası Premiere'i kopya sekansa geçirir) eğri seçimi değişmez;
  // uzlaştırma iş bitince yapılır
  function vurusUzlas() {
    var vd = vurusBilgi().durum;
    if (vd !== sonVurusDurum && el("hiz-grid") && !mesgul) {
      if (secili === "ritim" && vd !== "var") secili = "dalis";
      var yon = el("hiz-ritim-yon-kutu");
      if (yon) yon.hidden = secili !== "ritim";
      kartlar();
    }
  }
  function refresh(c) {
    ctx = c || ctx;
    vurusUzlas();
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
  function canliBaglam() { var c = window.KApp && KApp.ctx ? KApp.ctx() : null; return c || ctx; }
  function baglamAnahtari(c) {
    if (!c) return "";
    var s = c.sel || {};
    return [c.sequenceId, c.playhead, c.seqIn, c.seqOut, s.clipStart, s.clipEnd, s.mediaPath, c.selCount].join("|");
  }
  // Her yoklamada (app.js onPoll): seçim anahtarı değişmese de playhead, In/Out ya da aynı medyanın başka
  // klibine geçiş önizlemeyi ve aralığı tazeler. Sekme kapalıyken yalnız bağlam saklanır.
  function yoklama(c) {
    tuslariTut();   // sekmeden çıkılmışsa tutulan tuşlar Premiere'e geri verilir
    if (!c) return;
    var a = baglamAnahtari(c);
    if (a === sonAnahtar) return;
    if (!sekmeAcik()) { ctx = c; return; }
    sonAnahtar = a;
    refresh(c);
  }

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
    duz: "Bu ayarlarla rampa oluşmuyor: parçaların hepsi aynı hızda. Daha uzun bir aralık, Parça: Çok ya da başka bir Yumuşatma dene.",
    // Noktaları aynı hızdaki özel eğri: aralık, Parça, Yumuşatma ve Yoğunluk bunu değiştirmez (SR.ozelDuz)
    ozelDuz: "Özel eğrinin noktaları aynı hızda: bir noktayı yukarı ya da aşağı sürükle.",
    inoutKlipYok: "Giriş–Çıkış tek bir video klibin içinde olmalı (kilitli ya da gizli katmanlar sayılmaz).",
    // getLinkedItems ve unlinkSelection yok: Ctrl+L önerilmez (bağ koparılsa da Suflo bunu göremez)
    linkedBilinmiyor: "Bu Premiere sürümünde Suflo klibin sesle bağını okuyamıyor ve koparamıyor. Premiere'i güncelle; Doctor'da ayrıntı var.",
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
    geriAlinamadi: "geri alınamadı", degisti: "değişmiş", sekans: "sekans değişti", plan: "plan", vurusYok: "vuruş yok", fazla: "12 klip sınırı",
    duz: "tek hız", ozelDuz: "tek hız", linkedBilinmiyor: "bağlı ses" };
  // Plan "duz" ile reddetti: özel eğrinin noktaları aynı hızdaysa özel eğriye göre neden ve çözüm (ozelDuz)
  function duzKodu(presetId, o) { return presetId === "ozel" && SR.ozelDuz(o && o.ozelKeys) ? "ozelDuz" : "duz"; }
  // "2 klip atlandı: logo.png (grafik), Röportaj (hızı %50)": şablon, her ad ve her neden ayrı düğüm
  function atlamaParcalari(liste) {
    if (!liste || !liste.length) return [];
    var out = [liste.length === 1 ? "1 klip atlandı: " : liste.length + " klip atlandı: "];
    liste.forEach(function (s, i) {
      if (i) out.push(", ");
      out.push(s.name ? { ad: s.name } : "adsız klip");
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

  // ek: { hedefler: [{track, start}] } — seçim yerine bu klipler ('kaldırıp yeniden uygula': kaldırma seçimi
  // değiştirir, aynı klipler açıkça istenir)
  async function uygula(ek) {
    if (typeof Pro !== "undefined" && !Pro.gate("speedramp", { deneme: true, yeniden: function () { uygula(); } })) return;
    if (mesgul) return;
    mesgul = true;
    kilitle(true);
    // Eğri ve seçenekler iş başında sabitlenir: uygulama sürerken kart, kutu ya da bağlam (kopya sekansa
    // geçiş) kalan klipleri değiştirmesin
    // (özel eğri ve Ağır çekim anı da burada okunur: hedefler okunurken düzenleyicide yapılan değişiklik bu işe girmez)
    var presetId = secili, hizala = !!el("hiz-vurus").checked, o0 = secenek();
    var basarili = [], hatalar = [], atlanan = [], kopyaAdi = "", bildirildi = false;
    try {
      durum("Hedefler okunuyor…");
      var acik = ek && ek.hedefler && ek.hedefler.length ? ek.hedefler : null;
      var aralik = !acik && el("hiz-aralik").value === "inout" ? "inout" : "clips";
      var hd = await K.call("KS_speedRampTargets", acik ? { range: "clips", items: acik } : { range: aralik }, 30000);
      if (!hd || !hd.ok) throw new Error(hataMetni(hd));
      atlanan = (hd.skipped || []).slice();
      var hedefler = (hd.targets || []).slice(0, EN_COK_KLIP);
      (hd.targets || []).slice(EN_COK_KLIP).forEach(function (t) { atlanan.push({ name: t.name, track: t.track, kod: "fazla" }); });
      // Eski bir rampanın parçaları seçiliyse yeniden rampalanmaz: önce kaldırılmalı
      // (hızı %100 olmayan parça ya da tam aralığı kaplamayan %100 parça; Ctrl+Z ile geri dönmüş
      // tek klip engellenmez)
      // (kayitBul her çağrıda depodan yeni nesne okur: aynı kayıt sekans/katman/t0 ile bir kez alınır)
      var eskiler = [], eskiAnahtar = {};
      hedefler.concat(atlanan).forEach(function (t) {
        var k = kayitBul(hd.seqId, t.track, Number(t.start), t.mediaPath || "");
        if (!k) return;
        var a = k.seqId + "|" + k.track + "|" + Number(k.t0).toFixed(3);
        if (eskiAnahtar[a]) return;
        var parca = t.kod === "hizli" || (!t.kod && rampaParcasi(k, t.start, t.end));
        if (parca) { eskiAnahtar[a] = 1; eskiler.push(k); }
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
      var o = o0, kal = kalibrasyon(hd.appVersion);
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
        var cl = SR.clipFor(t, hd.frame, { media: m, playhead: hd.playhead, hizala: hizala, beats: beats });
        var p = null;
        try { p = SR.plan(presetId, o, cl); } catch (eP) { hatalar.push({ t: t, r: { kod: eP && eP.kod === "duz" ? duzKodu(presetId, o) : "plan", error: eP.message } }); continue; }
        if (p.warnings.indexOf("vurusYok") !== -1) { hatalar.push({ t: t, r: { kod: "vurusYok", error: vurusYokMetni(vb) } }); continue; }
        var kopyaIste = kopya && !klonlandi;
        var arg = { target: { track: t.track, start: t.start, end: t.end, mediaPath: t.mediaPath }, range: { start: t.rangeStart, end: t.rangeEnd },
          plan: SR.hostPlan(p), audio: sesModu, interp: interp, cal: kal, expectSeqId: beklenen,
          cloneFirst: kopyaIste, cloneName: kopyaIste ? (t.name ? "Suflo Rampa · " + t.name : "Suflo Rampa").slice(0, 70) : "" };
        var kaynakSeq = beklenen;
        var r = await K.call("KS_applySpeedRamp", arg, 120000);
        if (r && r.seqId) beklenen = r.seqId;
        if (r && r.newSeq) { kopyaAdi = r.newSeq; klonlandi = true; kopyaSekanslar[String(r.seqId || "")] = { ad: r.newSeq, kaynak: String(kaynakSeq || "") }; }
        // ffmpeg tutamak tahmini tutmadı (değişken kare hızı vb.): bir kez Dengeli ile yeniden dene
        var p2 = null;
        if (r && !r.ok && r.kod === "tutamak" && p.mode === "exact" && o.mode === "auto" && r.restored !== false) {
          var o2 = kopyala(o);
          o2.mode = "balanced";
          try { p2 = SR.plan(presetId, o2, cl); } catch (eP2) { p2 = null; }
        }
        if (p2) {
          p = p2;
          arg.plan = SR.hostPlan(p);
          arg.cloneFirst = kopya && !klonlandi;
          if (!arg.cloneFirst) arg.cloneName = "";
          arg.expectSeqId = beklenen;
          kaynakSeq = beklenen;
          r = await K.call("KS_applySpeedRamp", arg, 120000);
          if (r && r.seqId) beklenen = r.seqId;
          if (r && r.newSeq) { kopyaAdi = r.newSeq; klonlandi = true; kopyaSekanslar[String(r.seqId || "")] = { ad: r.newSeq, kaynak: String(kaynakSeq || "") }; }
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
      // iş sürerken ertelenen uzlaşma (Ritme Rampa kartı, önizleme): şimdi. Kopya kutusuna dokunulmaz
      // (bağlam henüz kopya sekansı görmemiş olabilir; sonraki yoklama tazeler)
      vurusUzlas();
      onizlemeCiz();
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

  // Kaldırma seçimi değiştirir (host geri gelen klibi seçer, iç adımlar seçimi boşaltır): yeniden uygulama
  // seçimi okumaz, geri gelen klipleri açıkça ister. In/Out aralığında Giriş/Çıkış zaten yerinde.
  async function yenidenUygula(eskiler) {
    var inout = el("hiz-aralik").value === "inout";
    var geri = await kaldirIc(eskiler);
    if (!geri.length) return;
    uygula(inout ? null : { hedefler: geri.map(function (r) { return { track: r.track, start: r.t0 }; }) });
  }

  /* ---------------- kaldır (kapısız: deneme rampası da her zaman geri alınır) ---------------- */
  // Doner: başarıyla kaldırılanların host sonuçları ({ track, t0, t1, … })
  async function kaldirIc(liste) {
    if (mesgul) return [];
    mesgul = true;
    kilitle(true);
    var geri = [];
    try {
      durum("Rampa kaldırılıyor…");
      // Bu Premiere sürümünün setSpeed biçimi: kayıtta yoksa (seçimden kurulan kayıt, eski kayıt) host
      // bunu kullanır; yanlış birimle denemek ilk parçayı bozabilirdi
      var c = canliBaglam();
      var kal = c && c.app ? kalibrasyon(String(c.app)) : null;
      var istekler = [];
      if (liste && liste.length) liste.forEach(function (k) { istekler.push({ record: k, cal: kal }); });
      // Seçim host'ta CANLI okunur: panelin bağlamı aynı medyanın başka klibinde kalmış olabilir. Kayıtlar
      // host'a gider; seçili parçayı içeren kayıt orada eşlenir, yoksa rampa geometriden kurulur
      else istekler.push({ fromSelection: true, records: kayitlar(), cal: kal });
      var hata = null, sesKayitsiz = false;
      for (var i = 0; i < istekler.length; i++) {
        var r = await K.call("KS_removeSpeedRamp", istekler[i], 120000);
        if (r && r.ok) {
          geri.push(r);
          if (istekler[i].record) kayitSil(istekler[i].record);
          else kayitSil(r.kayit && r.kayit.seqId ? r.kayit : { seqId: r.seqId, track: r.track, t0: r.t0 });
          if ((r.warnings || []).indexOf("sesKayitsiz") !== -1) sesKayitsiz = true;
        } else hata = r && r.kod === "secimYok" ? { kod: "kaldirSecimYok" } : r;
      }
      if (!geri.length) throw new Error(hataMetni(hata));
      KApp.toast("Rampa kaldırıldı, klip %100'e döndü", "good");
      if (sesKayitsiz) KApp.toast("Suflo bu rampanın kaydını bulamadı; kapalı sese dokunmadı. Rampadaki ses kapalıysa Premiere'de aç ve klibe bağla.", "warn", 9000);
      durum(hata ? hataMetni(hata) : "", hata ? "warn" : "");
      onizlemeCiz();
    } catch (e) {
      durum(["✕ ", String(e && e.message ? e.message : e)], "bad");
    } finally {
      mesgul = false;
      kilitle(false);
    }
    return geri;
  }
  async function kaldir(liste) { return (await kaldirIc(liste)).length > 0; }

  // Özel eğri düzenleyicisi ve düğmeleri (kutu yoksa sessizce atlanır). Premiere'e gitmez
  function ozelKur() {
    var kap = el("hiz-ozel-editor"), ED = window.SufloEgriEditor;
    if (kap && ED && ED.olustur) {
      editor = ED.olustur(kap, { mod: "hiz", anahtarlar: ozel.keys, hit: ozel.hit, ease: el("hiz-gecis").value,
        degisti: ozelDegisti, secim: ozelSecim, uyari: function (m) { durum(m, "warn"); } });
      // odaktayken Delete / Backspace panelde (Premiere seçili klibi silmesin) ve seçili noktayı siler
      kap.addEventListener("focus", function () { tusOdakAta("editor"); });
      kap.addEventListener("blur", function () { if (tusOdak === "editor") tusOdakAta(""); });
      kap.addEventListener("keydown", ozelTus);
    }
    ozelSecim(-1, null);
    var h = el("hiz-ozel-hit");
    if (h) h.addEventListener("change", ozelHitDegisti);
    var b = el("hiz-ozel-basamak");
    if (b) b.addEventListener("click", function () { if (editor && !mesgul) editor.basamak(); });
    var s = el("hiz-ozel-sil");
    if (s) s.addEventListener("click", function () { if (editor && !mesgul) editor.sil(); });
    var z = el("hiz-ozel-sifirla");
    if (z) z.addEventListener("click", ozelSifirla);
    var k = el("hiz-ozel-kaydet");
    if (k) k.addEventListener("click", ozelKayitKaydet);
    var a = el("hiz-ozel-ad");
    if (a) {
      a.setAttribute("placeholder", SR.ozelKayitAdi(ozelKayitlar(), tr));
      a.addEventListener("keydown", function (e) {
        if (e && (e.key === "Enter" || e.keyCode === 13)) { if (e.preventDefault) e.preventDefault(); ozelKayitKaydet(); }
      });
    }
    // Paylaşım (3.4 adım 15): ücretsiz, Premiere'e gitmez
    function bagla(id, olay, fn) { var e = el(id); if (e) e.addEventListener(olay, fn); }
    bagla("hiz-ozel-adlandir", "click", function () { ozelKayitAdlandir(); });
    bagla("hiz-ozel-kod-yukle", "click", function () { ozelKodYukle(); });
    // kod kutusu çok satırlı (textarea): Enter yükler, Shift+Enter alt satıra geçer
    bagla("hiz-ozel-kod", "keydown", function (e) {
      if (e && !e.shiftKey && (e.key === "Enter" || e.keyCode === 13)) { if (e.preventDefault) e.preventDefault(); ozelKodYukle(); }
    });
    bagla("hiz-ozel-kod-kopyala", "click", ozelKodKopyala);
    bagla("hiz-ozel-ice-aktar", "click", function () { ozelDosyaIceAktar(); });
    bagla("hiz-ozel-disa-aktar", "click", function () { ozelDosyaDisaAktar(); });
    ozelKayitlariCiz();
  }

  function init() {
    if (!SR || !el("tab-hiz") || !el("hiz-grid")) return;
    ayarYukle();
    ozelYukle();
    ozelKur();
    render();
    ["hiz-yogunluk", "hiz-gecis", "hiz-ritim-yon"].forEach(function (id) {
      var e = el(id);
      if (e) e.addEventListener("change", function () { if (id === "hiz-gecis" && editor) editor.ease(e.value); kartlar(); onizlemeCiz(); ayarKaydet(); });
    });
    ["hiz-parca", "hiz-kaynak", "hiz-vurus", "hiz-akis"].forEach(function (id) {
      el(id).addEventListener("change", function () { onizlemeCiz(); ayarKaydet(); });
    });
    ["hiz-ses", "hiz-bulanik"].forEach(function (id) { el(id).addEventListener("change", ayarKaydet); });
    el("hiz-aralik").addEventListener("change", function () { aralikElle = true; onizlemeCiz(); });
    el("hiz-kopya").addEventListener("change", function () { kopyaElle = true; });
    el("hiz-uygula").addEventListener("click", function () { uygula(); });
    // Tanıtım kartından kurulan deneme Pro olayı yaymaz; app.js düğmeye odaklanır: kilit hemen kalkar
    el("hiz-uygula").addEventListener("focus", dugmeCiz);
    el("hiz-uygula").addEventListener("mouseenter", dugmeCiz);
    el("hiz-kaldir").addEventListener("click", function () { kaldir(); });
    if (window.KApp && KApp.onContext) KApp.onContext(function (c) { sonAnahtar = baglamAnahtari(c); refresh(c); });
    if (window.KApp && KApp.onPoll) KApp.onPoll(yoklama);
    // Ritim analizi başka sekmede yapılır: sekmeye dönünce kartlar (Ritme Rampa) ve önizleme canlı bağlamla
    // (playhead, In/Out) tazelenir
    if (window.KApp && KApp.onTab) KApp.onTab("hiz", function () {
      ctx = canliBaglam();
      sonAnahtar = baglamAnahtari(ctx);
      render();
      refresh();
      tuslariTut();   // odak düzenleyicide kaldıysa tuşları yeniden tut
    });
    // Başka sekmeye geçilince (odak gizlenen düzenleyicide kalsa da) tuşlar Premiere'e geri verilir: tıklamanın sekme
    // geçişinden SONRA bakılır
    if (typeof document.addEventListener === "function") document.addEventListener("click", function () { setTimeout(tuslariTut, 0); });
    // Panel genişliği değişince önizleme yeni genişlikte yeniden çizilir (gerilmiş metin / elips kalmasın)
    if (typeof window.addEventListener === "function") {
      var boyutZaman = null;
      window.addEventListener("resize", function () {
        if (boyutZaman) clearTimeout(boyutZaman);
        boyutZaman = setTimeout(function () { boyutZaman = null; if (sekmeAcik()) onizlemeCiz(); }, 150);
      });
    }
    if (typeof Pro !== "undefined" && Pro.on) { try { Pro.on(render); } catch (e) {} }
  }

  return {
    init: init,
    uygula: uygula,
    kaldir: kaldir,
    // paylaşım (3.4 adım 15): Eğri sekmesinin İçe aktar'ı özel rampaları buraya ekler
    ozelKayitlariIceAl: ozelKayitlariIceAl,
    ozelKodYukle: ozelKodYukle,
    ozelKodKopyala: ozelKodKopyala,
    ozelDosyaIceAktar: ozelDosyaIceAktar,
    ozelDosyaDisaAktar: ozelDosyaDisaAktar,
    ozelKayitAdlandir: ozelKayitAdlandir,
    // testler / tanılama
    _sec: sec,
    _secili: function () { return secili; },
    _atlamaOzeti: atlamaOzeti,
    _atlamaParcalari: atlamaParcalari,
    _hataMetni: hataMetni,
    _refresh: refresh,
    _yoklama: yoklama,
    _kopyaSekanslar: kopyaSekanslar,
    _medya: medya,
    _duzenle: duzenle,
    _ozel: function () { return { keys: ozel.keys.map(function (k) { return [k[0], k[1]]; }), hit: ozel.hit, sonHit: ozel.sonHit }; },
    _editor: function () { return editor; },
    _ozelKayitSec: ozelKayitSec
  };
})();
