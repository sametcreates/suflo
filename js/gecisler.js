/*
 * Suflo — Geçişler (v3.0)
 * Playhead'e en yakın kesime iki tarafa eşleşik keyframe yazar.
 * Plan: js/transitions.js (saf, testli) · Uygulama: host KS_applyCutTransition.
 * Kaldırma (3.4, plan adım 11): uygulama her yazdığı özellik için bir kayıt döndürür; js/kayit-kaldir.js saklar.
 * "Geçişi kaldır" playhead'in yakınındaki (en çok 1 sn) Suflo geçişini kayıtla kaldırır (kullanıcının anahtar karelerine
 * dokunmaz): kesimi host seçer, Suflo kaydı olan en yakın kesim; seçili klip uygulamadaki gibi öne geçmez. Kaldırmak
 * ücretsiz (Pro kapısı yok). Kayıt yoksa eski yöntem (geçiş penceresini temizlemek) yalnız onayla; onay hangi kesim
 * olduğunu söyler (V1, 00:09.04) ve eski yöntem yeniden aramadan tam o kesimi temizler.
 * Özel eğri (3.4, plan adım 12): #gecis-egri seçicisi (SufloEgriSecici). Otomatik (varsayılan) iken host'a giden plan
 * bayt bayt eskisi; başka eğride plan js/egri-secim.js ile yoğunlaşır (hostPlan ease + sekansın kare hızı), host
 * Bezier'siz yazar. Seçmek ücretsiz; uygulamak Geçişler'in kendi Pro kapısından (transitions, 3 deneme) geçer.
 */
window.KGecis = (function () {
  "use strict";

  var TR = window.SufloTransitions;
  var busy = false;
  var secici = null;   // Eğri seçicisi (3.4 adım 12)

  // Kaydı olmayan (önceki sürümde ya da başka bilgisayarda uygulanmış) geçiş: eski yöntem onay sorusu
  var YEDEK_SORU = {
    yok: "Bu kesimde Suflo'nun geçiş kaydı yok (önceki sürümde ya da başka bilgisayarda uygulanmış, ya da kaydı çok eski olduğu için silinmiş olabilir). Eski yöntemle kesimin iki yanındaki geçiş penceresinde (en çok 0,8 sn) Ölçek, Konum ve Opaklık anahtar kareleri silinsin mi? O aralıktaki kendi anahtar karelerin de silinir.",
    degisti: "Suflo'nun geçiş kaydı bu kesimin anahtar kareleriyle artık eşleşmiyor (anahtar kareler sonradan değiştirilmiş). Eski yöntemle kesimin iki yanındaki geçiş penceresinde (en çok 0,8 sn) Ölçek, Konum ve Opaklık anahtar kareleri silinsin mi? O aralıktaki kendi anahtar karelerin de silinir."
  };

  // Onay sorusu: önce hangi kesim (host'un seçtiği), sonra soru (satır satır çevrilir)
  function soruMetni(kod) {
    return function (oz) {
      var yer = oz && oz.kesim ? SufloKaldir.kesimYeri(oz.kesim) : "";
      return (yer ? yer + "\n\n" : "") + YEDEK_SORU[kod];
    };
  }

  function el(id) { return document.getElementById(id); }
  function uiMetni(s) { return window.SufloI18n && SufloI18n.tr ? SufloI18n.tr(s) : s; }
  function kd() { return window.SufloKaldir ? SufloKaldir.panel() : null; }

  function status(msg, cls) {
    var e = el("gecis-status");
    e.className = "inline-status" + (cls ? " " + cls : "");
    e.textContent = msg || "";
  }

  function secenek() {
    return {
      duration: Number(el("gecis-sure").value) || 0.5,
      strength: Number(el("gecis-guc").value) || 1
    };
  }

  // Host planı: seçili eğri ve sekansın kare hızıyla (Otomatik'te plan eskisiyle aynı)
  function hostPlani(t) {
    var o = secenek();
    o.ease = secici ? secici.deger() : "auto";
    var S = window.SufloEgriSecim;
    if (S && window.KApp && KApp.ctx) o.fps = S.kareHizi(KApp.ctx());
    return TR.hostPlan(t.id, o);
  }

  async function uygula(t, btn) {
    // Pro (ucretsizde 3 deneme hakki; hak yalniz gecis yazilinca duser)
    if (typeof Pro !== "undefined" && !Pro.gate("transitions", { deneme: true, yeniden: function () { uygula(t, btn); } })) return;
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    status(t.name + " uygulanıyor…");
    try {
      var plan = hostPlani(t);
      // Yoğun (özel eğri) yazım daha çok anahtar demek: süre anahtar sayısıyla büyür
      var sure = plan.dense && window.SufloEgriSecim ? SufloEgriSecim.cagriSuresi(60000, SufloEgriSecim.planAnahtari(plan)) : 60000;
      var r = await K.call("KS_applyCutTransition", { plan: plan, tolerance: 1.0 }, sure);
      if (!r.ok) throw new Error(r.error);
      if (typeof Pro !== "undefined" && Pro.denemeHarca) Pro.denemeHarca("transitions", KApp.toast);   // deneme: yalniz basarida
      status("");
      // Kaldırma kaydı (kapısız Geri al: yalnız bu uygulamanın anahtarları)
      var saklama = kd() ? kd().sakla(r.proje || "", r.records, r) : { ok: true, idler: [] };
      var proje = r.proje || "";
      KApp.toast("↔ " + t.name + " · V" + r.track + " kesimine eklendi" +
        (r.half < secenek().duration / 2 - 0.01 ? " (kısa klip: süre kısaltıldı)" : ""), "good",
        saklama.idler.length ? 9000 : undefined,
        saklama.idler.length ? { metin: "Geri al", fn: function () { kaldir({ idler: saklama.idler, proje: proje }); } } : undefined);
      if (!saklama.ok) KApp.toast("Kaldırma kaydı bu bilgisayarda saklanamadı; kayıt yalnız panel açıkken kullanılabilir.", "warn", 9000);
    } catch (e) {
      status("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  /*
   * Kapısız kaldırma. kapsam: varsayılan playhead'e en yakın kesim ({ kesim }); bildirimdeki Geri al
   * { idler, proje } ile yalnız o uygulamanın kayıtlarını kaldırır (eski yönteme düşmez).
   */
  async function kaldir(kapsam) {
    if (busy) return;
    var k = kd();
    if (!k) return;
    var tekUygulama = !!(kapsam && kapsam.idler);
    busy = true;
    var btn = el("gecis-kaldir");
    if (btn) btn.disabled = true;
    status("Geçiş kaldırılıyor…");
    try {
      var s = await k.akis({
        tur: "gecis",
        kapsam: kapsam || { kesim: { tolerance: 1.0 } },
        onay: function (soru) { return window.confirm ? window.confirm(uiMetni(soru)) : false; },
        yedekMetni: tekUygulama ? null : { yok: soruMetni("yok"), degisti: soruMetni("degisti") },
        kayitYokMetni: tekUygulama ? "Bu geçişin kaydı bulunamadı; hiçbir şey silinmedi." : "",
        yedek: async function (oz) {
          // Onayda gösterilen kesim: yeniden aranmaz (seçim başka bir kesimi öne geçirip oradaki anahtarları sildirmesin)
          if (!oz || !oz.kesim) throw new Error(SufloKaldir.hataMetni("kesimYok"));
          var r = await K.call("KS_applyCutTransition", { temizle: true, tolerance: 1.0, cut: oz.kesim.cut, track: oz.kesim.track }, 60000);
          if (!r || !r.ok) throw new Error(r && r.error ? r.error : "Temizlenemedi.");
          k.sakla(r.proje || "", [], r);   // penceresi temizlenen (artık ölü) kayıtlar düşer; eski yöntem kayıt yazmaz
          return { parcalar: ["Geçiş penceresi eski yöntemle temizlendi: " + (Number(r.removedKeys) || 0) + " anahtar kare silindi."], tur: "good" };
        }
      });
      status("");
      // Hangi kesimde çalışıldı (playhead'e en yakın Suflo geçişi; seçim öne geçmez)
      var parcalar = s.kesim ? [SufloKaldir.kesimYeri(s.kesim)].concat(s.parcalar) : s.parcalar;
      KApp.toast(SufloKaldir.dugum(parcalar), s.tur, 7000);
    } catch (e) {
      status("✕ " + (e && e.message ? e.message : e), "bad");
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  function render() {
    var grid = el("gecis-grid");
    grid.innerHTML = "";
    var kilitli = typeof Pro !== "undefined" && !Pro.isPro();
    TR.list().forEach(function (t) {
      var card = document.createElement("div");
      card.className = "preset-card gecis-card" + (kilitli ? " locked" : "");
      var sahne = document.createElement("div");
      sahne.className = "gecis-sahne gecis-" + t.id;
      sahne.innerHTML = '<span class="gs-a">A</span><span class="gs-b">B</span>';
      var bilgi = document.createElement("div");
      bilgi.className = "gecis-bilgi";
      var b = document.createElement("b"); b.textContent = t.name;
      var i = document.createElement("i"); i.textContent = t.desc;
      bilgi.appendChild(b); bilgi.appendChild(i);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn preset-apply" + (kilitli ? " is-locked" : "");
      btn.textContent = kilitli ? "🔒 Pro" : "Uygula";
      btn.addEventListener("click", function () { return uygula(t, btn); });
      card.appendChild(sahne); card.appendChild(bilgi); card.appendChild(btn);
      grid.appendChild(card);
    });
    if (el("gecis-sayac")) el("gecis-sayac").textContent = String(TR.list().length);
  }

  function init() {
    if (!TR || !el("gecis-grid")) return;
    if (window.SufloEgriSecici && el("gecis-egri")) secici = SufloEgriSecici.olustur(el("gecis-egri"), { arac: "gecis" });
    render();
    var kb = el("gecis-kaldir");
    if (kb) kb.addEventListener("click", function () { return kaldir(); });
    if (typeof Pro !== "undefined" && Pro.on) { try { Pro.on(render); } catch (e) {} }
  }

  return { init: init, kaldir: kaldir, _hostPlani: hostPlani, _secici: function () { return secici; } };
})();
