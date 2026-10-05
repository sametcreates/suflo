// Suflo testi: Konuşmadan kes paneli (js/konusma-kes.js) — sahte DOM + sahte K/KCaptions ile
// tekrar çekim çipleri, politika, inceleme listesi, önbellek satırı, AI geçişi (bayat cevap
// ve hata), 300 kesim sınırı ve kopya sekans adı uçtan uca
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");

function Oge(tag, id) {
  var o = {
    tagName: String(tag || "div").toUpperCase(), id: id || "", className: "", textContent: "", title: "", value: "", type: "",
    checked: false, disabled: false, hidden: false, dataset: {}, _attr: {}, _olay: {}, children: [], parentNode: null,
    setAttribute: function (a, v) { this._attr[a] = String(v); },
    getAttribute: function (a) { return this._attr[a] === undefined ? null : this._attr[a]; },
    appendChild: function (c) {
      if (c._frag) { var self = this; c.children.slice().forEach(function (x) { self.appendChild(x); }); c.children = []; return c; }
      c.parentNode = this; this.children.push(c); return c;
    },
    insertBefore: function (c) { c.parentNode = this; this.children.push(c); return c; },
    addEventListener: function (t, fn) { (this._olay[t] = this._olay[t] || []).push(fn); },
    querySelectorAll: function () { return []; },
    classList: { toggle: function () {}, add: function () {}, remove: function () {} }
  };
  Object.defineProperty(o, "innerHTML", { set: function () { this.children = []; }, get: function () { return ""; } });
  return o;
}
function hepsi(kok, kosul, out) {
  out = out || [];
  (kok.children || []).forEach(function (c) { if (kosul(c)) out.push(c); hepsi(c, kosul, out); });
  return out;
}
function sinifli(kok, cls) { return hepsi(kok, function (c) { return (" " + c.className + " ").indexOf(" " + cls + " ") !== -1; }); }
function bekle() { return new Promise(function (r) { setTimeout(r, 0); }); }
function tetikle(e, tur) { return Promise.all((e._olay[tur] || []).map(function (fn) { return fn.call(e, { target: e }); })); }

// Kelimeler: "Merhaba." + aynı cümle iki kez + yarım başlangıç (orta) + kapanış
function kelimeler(bas) {
  var c = ["Merhaba ııı arkadaşlar.", "Bugün size kamerayı nasıl ayarladığımı anlatacağım.", "Bugün size kamerayı nasıl ayarladığımı anlatacağım.",
    "Şimdi size", "Şimdi size ışığı göstereceğim.", "Hadi başlayalım."];
  var w = [], t = bas;
  c.forEach(function (s, ci) {
    if (ci > 0) t += 1.0;
    s.split(" ").forEach(function (x, i) { if (i > 0) t += 0.1; w.push({ start: t, end: t + 0.3, text: x, confidence: 0.9 }); t += 0.3; });
  });
  return w;
}

function ortam(o) {
  o = o || {};
  var ogeler = {};
  (html.match(/id="[^"]+"/g) || []).forEach(function (x) {
    var id = x.slice(4, -1);
    var bas = html.lastIndexOf("<", html.indexOf(x));
    var etiket = html.slice(bas, html.indexOf(">", html.indexOf(x)) + 1);
    var tag = (etiket.match(/^<([a-z0-9]+)/i) || [0, "div"])[1];
    var e = Oge(tag, id);
    if (/\shidden(\s|>|=)/.test(etiket)) e.hidden = true;
    if (/\schecked(\s|>)/.test(etiket)) e.checked = true;
    if (tag === "select") {
      var govde = html.slice(html.indexOf(x), html.indexOf("</select>", html.indexOf(x)));
      var sec = govde.match(/<option value="([^"]*)" selected/) || govde.match(/<option value="([^"]*)"/);
      e.value = sec ? sec[1] : "";
    }
    ogeler[id] = e;
  });
  var say = { call: [], toast: [], chat: 0, tw: [] };
  var clip = { mediaPath: "/v/a.mp4", inPoint: 0, dur: 40, clipStart: 10, clipEnd: 50, name: "a" };
  var ctx = { sel: clip, sequence: "Vlog", sequenceId: "S1" };
  var secim = { clip: clip };   // Premiere'in TAZE seçimi (ctx.sel 2.5 sn'lik yoklama, bayat olabilir)
  var cevaplar = o.chat || [];
  var sandbox = {
    window: {}, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise, JSON: JSON, Math: Math,
    document: {
      getElementById: function (id) { return ogeler[id] || null; },
      createElement: function (t) { return Oge(t); },
      createDocumentFragment: function () { var f = Oge("frag"); f._frag = true; return f; },
      createTextNode: function (t) { var n = Oge("#text"); n.textContent = t; return n; },
      addEventListener: function () {}
    },
    K: {
      settings: function () { return { extraFillers: o.extraFillers || "" }; },
      log: function () {},
      hataYardimi: function (e) { return e && e.message ? e.message : String(e); },
      call: function (fn, arg) {
        say.call.push([fn, arg]);
        if (fn === "KS_getSelectedClips") return Promise.resolve({ ok: true, clips: [secim.clip] });
        return Promise.resolve(fn === "KS_getContext" ? { ok: true, sequence: "Vlog", sequenceId: "S1" } : { ok: true, newSeq: arg && arg.cloneName, removed: 1 });
      }
    },
    KApp: { ctx: function () { return ctx; }, toast: function (m, c) { say.toast.push([m, c]); }, onContext: function () {} },
    KCaptions: {
      transcribeWords: function (op) { say.tw.push(op); var c = op.clip || clip; return Promise.resolve({ clip: c, lang: "tr", words: kelimeler(c.clipStart), fromCache: !!o.fromCache, motor: "yerel:small" }); },
      motorKimligi: function () { return "yerel:small"; },
      chatConfig: function () { return o.anahtar ? { model: "m" } : null; },
      chatCall: function () {
        say.chat++;
        var c = cevaplar.shift();
        if (c instanceof Error) return Promise.reject(c);
        if (typeof c === "function") return c();
        return Promise.resolve({ choices: [{ message: { content: c || '{"groups":[]}' } }] });
      }
    }
  };
  sandbox.window.KCaptions = sandbox.KCaptions;
  sandbox.window.SufloTextCut = require(path.join(KOK, "js", "textcut.js"));
  sandbox.window.SufloRetakes = require(path.join(KOK, "js", "retakes.js"));
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "konusma-kes.js"), "utf8"), sandbox);
  if (o.dil) sandbox.window.SufloI18n = sandbox.SufloI18n = { getLang: function () { return o.dil; } };
  sandbox.window.KTextCut.init();
  return { el: ogeler, say: say, ctx: ctx, sb: sandbox, secim: secim, clip: clip };
}

(async function () {
  var E = ortam();
  ok("AI anahtarı yoksa #tc-ai kapalı", E.el["tc-ai"].disabled === true);
  await tetikle(E.el["tc-analyze"], "click"); await bekle();
  ok("analiz: sonuç açıldı, önbellek satırı gizli", E.el["tc-result"].hidden === false && E.el["tc-cache"].hidden === true);
  ok("analiz: transcribeWords önbelleğe açık çağrılır", E.say.tw[0] && E.say.tw[0].cache === undefined);
  var satirlar = sinifli(E.el["tc-words"], "tc-take-row");
  ok("iki grup satırı (tekrar ×2 yüksek, yarım başlangıç orta)", satirlar.length === 2, satirlar.length);
  var tekrarSatiri = satirlar.filter(function (r) { return r.children[0].textContent === "Tekrar ×2"; })[0];
  ok("'Tekrar ×2' satırı: ✓ ikinci çekimde", tekrarSatiri && /2 ✓/.test(sinifli(tekrarSatiri, "tc-chip")[1].textContent));
  var yarimSatiri = satirlar.filter(function (r) { return /^Yarım başlangıç/.test(r.children[0].textContent); })[0];
  ok("yarım başlangıç satırı: 'orta güven' rozeti, işaretsiz", yarimSatiri && / off/.test(yarimSatiri.className) && sinifli(yarimSatiri, "tc-conf")[0].textContent === "orta güven");
  var ozet = E.el["tc-summary"].textContent;
  ok("özet ' · 1 tekrar çekim'", / · 1 tekrar çekim$/.test(ozet), ozet);
  var retake = sinifli(E.el["tc-words"], "retake"), kept = sinifli(E.el["tc-words"], "retake-kept");
  ok("ilk çekim .retake, ikinci .retake-kept", retake.length === 6 && kept.length === 6, retake.length + "/" + kept.length);
  var rv = E.el["tc-review"].children;
  ok("inceleme: işaretli tekrar çekim + işaretsiz yarım başlangıç adayı", rv.some(function (r) { return r.children[1].textContent === "tekrar çekim" && r.children[0].checked; }) &&
    rv.some(function (r) { return r.children[1].textContent === "yarım başlangıç" && !r.children[0].checked; }), rv.map(function (r) { return r.children[1].textContent + (r.children[0].checked ? "+" : "-"); }).join(" "));

  // bulut tarzı (1 sn duraksamalı) 'Şimdi size ⏸ Şimdi size ışığı…': orta güven grubu işaretsiz; cümle içi kural kesmez
  var simdi = E.el["tc-words"].children.filter(function (c) { return c.tagName === "SPAN" && c.textContent === "Şimdi"; });
  ok("orta güvenli yarım başlangıç kelimeleri kesilmez (cümle içi kural grubu ezmez)", simdi.length === 2 && simdi.every(function (c) { return !/falsestart|retake|cut/.test(c.className); }), simdi.map(function (c) { return c.className; }).join(" | "));
  ok("inceleme: işaretli 'yarım başlangıç' satırı yok", !rv.some(function (r) { return r.children[1].textContent === "yarım başlangıç" && r.children[0].checked; }));
  ok("inceleme işaret ipucu çevrilebilir (data-i18n-ui)", rv.every(function (r) { return r.children[0].getAttribute("data-i18n-ui") === ""; }));

  // duraksama satırı: işaret kaldırılınca satır kalır (işaretsiz), yeniden işaretlenebilir
  function rvBul(neden, isaretli) { return E.el["tc-review"].children.filter(function (r) { return r.children[1].textContent === neden && r.children[0].checked === isaretli; }); }
  var dur0 = rvBul("duraksama", true).length;
  var dur = rvBul("duraksama", true)[0];
  ok("duraksama satırı metni çevrilebilir ada (data-i18n-ui)", dur && dur.children[dur.children.length - 1].getAttribute("data-i18n-ui") === "" && /^⏸ /.test(dur.children[dur.children.length - 1].textContent));
  dur.children[0].checked = false; dur.children[0].onchange();
  ok("duraksama işareti kaldırılınca satır işaretsiz kalır", rvBul("duraksama", true).length === dur0 - 1 && rvBul("duraksama", false).length === 1);
  var pauseSpan = sinifli(E.el["tc-words"], "tc-pause").filter(function (c) { return / kept/.test(c.className); });
  ok("kelime görünümündeki ⏸ korunan duraksamayı gösterir ve tıklanabilir", pauseSpan.length === 1 && typeof pauseSpan[0].onclick === "function" && /olduğu gibi kalacak/.test(pauseSpan[0].title), pauseSpan.length);
  pauseSpan[0].onclick();
  ok("⏸ tıklanınca duraksama yeniden kısaltılır", rvBul("duraksama", true).length === dur0 && rvBul("duraksama", false).length === 0);
  var dur2 = rvBul("duraksama", true)[0];
  dur2.children[0].checked = false; dur2.children[0].onchange();
  var durOff = rvBul("duraksama", false)[0];
  durOff.children[0].checked = true; durOff.children[0].onchange();
  ok("işaretsiz duraksama satırı yeniden işaretlenebilir", rvBul("duraksama", true).length === dur0 && rvBul("duraksama", false).length === 0);

  // dolgu satırı: işaret kaldırılınca satır kalır, yeniden işaretlenince kelime yine kesilir
  var dolgu = rvBul("dolgu", true)[0];
  dolgu.children[0].checked = false; dolgu.children[0].onchange();
  var iii = function () { return E.el["tc-words"].children.filter(function (c) { return c.tagName === "SPAN" && c.textContent === "ııı"; })[0]; };
  ok("dolgu işareti kaldırılınca satır işaretsiz kalır, kelime kalır", rvBul("dolgu", false).length === 1 && / kept/.test(iii().className));
  var dolguOff = rvBul("dolgu", false)[0];
  dolguOff.children[0].checked = true; dolguOff.children[0].onchange();
  ok("işaretsiz dolgu satırı yeniden işaretlenince kesilir", rvBul("dolgu", true).length === 1 && rvBul("dolgu", false).length === 0 && / filler/.test(iii().className));

  // çip: ilk çekimi tut
  sinifli(tekrarSatiri, "tc-chip")[0].onclick();
  var tekrar2 = sinifli(E.el["tc-words"], "tc-take-row").filter(function (r) { return r.children[0].textContent === "Tekrar ×2"; })[0];
  ok("çip tıklaması: ✓ birinci çekime geçer", /1 ✓/.test(sinifli(tekrar2, "tc-chip")[0].textContent));
  var ilkKelime = E.el["tc-words"].children.filter(function (c) { return c.tagName === "SPAN" && c.textContent === "Bugün"; });
  ok("çip tıklaması: kelime sınıfları yer değiştirir", /retake-kept/.test(ilkKelime[0].className) && / retake/.test(ilkKelime[1].className), ilkKelime.map(function (x) { return x.className; }).join(" | "));
  // politika değişince kullanıcı seçimi politikaya bırakılır
  E.el["tc-policy"].value = "son";
  await tetikle(E.el["tc-policy"], "change");
  var tekrar3 = sinifli(E.el["tc-words"], "tc-take-row").filter(function (r) { return r.children[0].textContent === "Tekrar ×2"; })[0];
  ok("politika değişimi: 'son' yeniden ikinci çekimi tutar", /2 ✓/.test(sinifli(tekrar3, "tc-chip")[1].textContent));

  // inceleme: yarım başlangıç adayını işaretle → grup açılır
  var aday = E.el["tc-review"].children.filter(function (r) { return r.children[1].textContent === "yarım başlangıç" && !r.children[0].checked; })[0];
  aday.children[0].checked = true; aday.children[0].onchange();
  ok("aday işaretlenince kesim satırı olur ve özet 2 tekrar çekim", / · 2 tekrar çekim$/.test(E.el["tc-summary"].textContent) &&
    E.el["tc-review"].children.some(function (r) { return r.children[1].textContent === "yarım başlangıç" && r.children[0].checked; }), E.el["tc-summary"].textContent);
  // inceleme: tekrar çekim satırının işaretini kaldır → elle korunur
  var tk = E.el["tc-review"].children.filter(function (r) { return r.children[1].textContent === "tekrar çekim"; })[0];
  tk.children[0].checked = false; tk.children[0].onchange();
  ok("tekrar çekim işareti kaldırılınca grup kapanır: satır işaretsiz kalır, kelimeler kalır", !E.el["tc-review"].children.some(function (r) { return r.children[1].textContent === "tekrar çekim" && r.children[0].checked; }) &&
    E.el["tc-review"].children.some(function (r) { return r.children[1].textContent === "tekrar çekim" && !r.children[0].checked; }) &&
    sinifli(E.el["tc-words"], "retake").length === 0);
  ok("tekrar çekim işareti kaldırılınca özet 'tekrar çekim' saymaz (yalnız yarım başlangıç)", / · 1 tekrar çekim$/.test(E.el["tc-summary"].textContent), E.el["tc-summary"].textContent);
  await tetikle(E.el["tc-reset"], "click");
  ok("Önerilere dön: grup kararları ve elle sıfırlanır", sinifli(E.el["tc-words"], "retake").length === 6 && / · 1 tekrar çekim$/.test(E.el["tc-summary"].textContent));

  // retake kapatılınca eski davranış
  E.el["tc-retake"].checked = false;
  await tetikle(E.el["tc-retake"], "change");
  ok("#tc-retake kapalı: grup satırı yok, özet eki yok", sinifli(E.el["tc-words"], "tc-take-row").length === 0 && !/tekrar çekim/.test(E.el["tc-summary"].textContent));
  E.el["tc-retake"].checked = true;
  await tetikle(E.el["tc-retake"], "change");

  // uygula: kopya sekans adı
  await tetikle(E.el["tc-apply"], "click"); await bekle();
  var ac = E.say.call.filter(function (c) { return c[0] === "KS_applyCuts"; })[0];
  ok("uygula: ripple + kopya + '<sekans> — Suflo Temiz'", ac && ac[1].removeMode === "ripple" && ac[1].cloneFirst === true && ac[1].cloneName === "Vlog — Suflo Temiz", JSON.stringify(ac && ac[1]).slice(0, 200));
  ok("uygula sonrası sonuç kapanır", E.el["tc-result"].hidden === true);

  // ikinci analiz: aynı klip bellekten (uygulamadan sonra bellek temizlendi → yeniden yazıya döker)
  await tetikle(E.el["tc-analyze"], "click"); await bekle();
  await tetikle(E.el["tc-analyze"], "click"); await bekle();
  ok("aynı klip ikinci kez: bellekten, 'önbellekten' satırı görünür", E.say.tw.length === 2 && E.el["tc-cache"].hidden === false, E.say.tw.length);
  await tetikle(E.el["tc-retranscribe"], "click"); await bekle();
  ok("Yeniden yazıya dök: cache:false", E.say.tw.length === 3 && E.say.tw[2].cache === false);
  ok("transcribeWords'e taze seçilen klip verilir", E.say.tw[2].clip === E.clip);
  // bayat bağlam: ctx.sel hâlâ eski klip, Premiere'de B seçili → bellek ıskalar, B yazıya dökülür
  var klipB = { mediaPath: "/v/b.mp4", inPoint: 0, dur: 40, clipStart: 60, clipEnd: 100, name: "b" };
  E.secim.clip = klipB;
  await tetikle(E.el["tc-analyze"], "click"); await bekle();
  ok("bayat ctx.sel: taze seçim (B) yazıya dökülür, A'nın transkripti gelmez", E.say.tw.length === 4 && E.say.tw[3].clip === klipB && E.el["tc-cache"].hidden === true, E.say.tw.length);
  E.secim.clip = E.clip;
  E.el["cap-lang"].value = "en";
  await tetikle(E.el["tc-analyze"], "click"); await bekle();
  ok("dil değişince bellek ıskalar (anahtar dil içerir)", E.say.tw.length === 5, E.say.tw.length);
  await tetikle(E.el["tc-analyze"], "click"); await bekle();
  ok("aynı dil + klip: bellekten", E.say.tw.length === 5 && E.el["tc-cache"].hidden === false, E.say.tw.length);

  // İngilizce arayüz: kopya sekans adı İngilizce
  var EN = ortam({ dil: "en" });
  await tetikle(EN.el["tc-analyze"], "click"); await bekle();
  await tetikle(EN.el["tc-apply"], "click"); await bekle();
  var acEn = EN.say.call.filter(function (c) { return c[0] === "KS_applyCuts"; })[0];
  ok("EN arayüz: '<sekans> — Suflo Clean'", acEn && acEn[1].cloneName === "Vlog — Suflo Clean", JSON.stringify(acEn && acEn[1].cloneName));

  /* ---- AI geçişi ---- */
  var A = ortam({ anahtar: true, chat: ['```json\n{"groups":[{"ids":[0,5],"keep":5},{"ids":[1,2],"keep":1}]}\n```'] });
  A.el["tc-ai"].checked = true;
  await tetikle(A.el["tc-analyze"], "click"); await bekle(); await bekle();
  ok("AI: anahtar varsa açık, sırayla çağrılır", A.el["tc-ai"].disabled === false && A.say.chat === 1);
  var aiSat = sinifli(A.el["tc-words"], "tc-take-row").filter(function (r) { return sinifli(r, "tc-conf").some(function (c) { return c.textContent === "AI"; }); });
  ok("AI: yalnız AI'nın bulduğu grup eklendi (sezgisel çakışan reddedildi), orta + işaretsiz", aiSat.length === 1 && / off/.test(aiSat[0].className), aiSat.length);
  ok("AI: bildirim", A.say.toast.some(function (t) { return /AI 1 grup daha buldu/.test(t[0]); }), JSON.stringify(A.say.toast));

  var B = ortam({ anahtar: true, chat: [new Error("429 Too Many Requests")] });
  B.el["tc-ai"].checked = true;
  await tetikle(B.el["tc-analyze"], "click"); await bekle(); await bekle();
  ok("AI hata (429): uyarı, sezgisel sonuç kalır", B.say.toast.some(function (t) { return /AI gruplama yapılamadı/.test(t[0]) && t[1] === "warn"; }) && sinifli(B.el["tc-words"], "tc-take-row").length === 2);

  // bayat cevap: AI sürerken klip değişti (yeniden analiz) → eski cevap uygulanmaz
  var coz;
  var C = ortam({ anahtar: true, chat: [function () { return new Promise(function (r) { coz = r; }); }, '{"groups":[]}'] });
  C.el["tc-ai"].checked = true;
  await tetikle(C.el["tc-analyze"], "click"); await bekle();
  C.el["tc-ai"].checked = false; await tetikle(C.el["tc-ai"], "change");   // kullanıcı kapattı
  coz({ choices: [{ message: { content: '{"groups":[{"ids":[0,5],"keep":5}]}' } }] });
  await bekle(); await bekle();
  ok("bayat AI cevabı uygulanmaz", sinifli(C.el["tc-words"], "tc-take-row").every(function (r) { return !sinifli(r, "tc-conf").some(function (c) { return c.textContent === "AI"; }); }));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
})().catch(function (e) { console.log("FAIL istisna " + e.stack); process.exit(1); });
