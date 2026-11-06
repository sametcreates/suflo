// Suflo testi: metin temizliği (parti 6) — dolgu sesleri, emojisiz stilli katman, noktalama, ayarlar ve
// Otomatik emoji seçenekleri. captions.js / app.js'in GERÇEK işlevleri imzayla kesilip sahte DOM'da çalışır.
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var C = require(path.join(KOK, "js", "caption-text.js"));
var CL = require(path.join(KOK, "js", "caption-layout.js"));
var Q = require(path.join(KOK, "js", "caption-quality.js"));
var AE = require(path.join(KOK, "js", "auto-emoji.js"));
var EN = fs.readFileSync(path.join(KOK, "i18n", "en.js"), "utf8");

var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }

/* ---------------- dolgu sesleri ---------------- */
var D = function (t) { return C.dolgulariAt([{ start: 0, end: 2, text: t }], "tr").segments.map(function (s) { return s.text; }); };
ok("dolgular: ııı, ıı, eee, ee, ehm, hmm, ımm, um, uh tek başına atılır",
  ["ııı", "ıı", "eee", "ee", "ehm", "hmm", "ımm", "um", "uh", "Iıı", "EEE", "Hmm...", " ııı", "ııı,"].every(function (w) { return C.dolguMu(w); }));
ok("dolgu olmayanlar: e, eh, hm değil 'ham', 'emm'… 'III' (Roma rakamı), 'umut', 'ee' içeren sözcük",
  ["e", "eh", "Eh,", "III", "umut", "eemek", "ehliyet", "hamam", "imza"].every(function (w) { return !C.dolguMu(w); }));
ok("metinden atılır, *vurgu* komşuya geçer, satır başı büyür", J(D("Iıı, bugün *ııı önemli* bir şey")) === J(["Bugün *önemli* bir şey"]), J(D("Iıı, bugün *ııı önemli* bir şey")));
ok("cümle sonu noktası önceki sözcüğe taşınır", J(D("geldik ııı.")) === J(["geldik."]));
ok("yalnız dolgudan oluşan satır düşer", J(D("eee... hmm")) === "[]");
ok("dolgusuz satır AYNI nesne (dokunulmaz)", (function () { var s = { start: 0, end: 1, text: "temiz satır" }; return C.dolgulariAt([s]).segments[0] === s; })());
var seg = { start: 0, end: 3, text: "ııı bugün eee *çok* başlıyoruz", words: [
  { text: "ııı", start: 0, end: 0.5 }, { text: "bugün", start: 0.5, end: 1 }, { text: "eee", start: 1, end: 1.6 },
  { text: "çok", start: 1.6, end: 2 }, { text: "başlıyoruz", start: 2, end: 3 }] };
var r = C.dolgulariAt([seg], "tr"), y = r.segments[0];
ok("kelimeler metinle aynı ölçütle ayıklanır: içerikli sözcük sayısı = words sayısı", r.sayi === 2 &&
  y.text.split(/\s+/).filter(function (w) { return w.replace(/\*/g, ""); }).length === y.words.length && y.words.length === 3, J(y));
ok("kalan kelimeler ölçülmüş zamanlarını korur, sıralı ve satırın içinde", y.words.every(function (w, i) {
  return w.start >= y.start && w.end <= y.end && w.end >= w.start && (i === 0 || w.start >= y.words[i - 1].end);
}) && y.words[0].start === 0.5 && y.words[1].start === 1.6);
ok("baştaki dolgu atılınca satır kalan ilk kelimeye daralır", y.start === 0.5 && y.end === 3);
ok("kelimeleriHizala değişmezi: hizalamak sonucu değiştirmez", J(CL.kelimeleriHizala(y.words, y.text, y.start, y.end, "tr").map(function (w) { return [w.start, w.end]; })) ===
  J(y.words.map(function (w) { return [w.start, w.end]; })));
ok("girdi değişmez", seg.text === "ııı bugün eee *çok* başlıyoruz" && seg.words.length === 5 && seg.start === 0);
ok("segmentleriKur dolguSil: yeni transkriptte dolgu yok, kapalıyken aynen",
  C.segmentleriKur([{ start: 0, end: 2, text: "ııı merhaba dünya" }], "c42", { dolguSil: true }).segments[0].text === "merhaba dünya" &&
  C.segmentleriKur([{ start: 0, end: 2, text: "ııı merhaba dünya" }], "c42", {}).segments[0].text === "ııı merhaba dünya");
// Doğrulama: tek "em" ("get 'em", Portekizce "em casa") dolgu değil; um / uh yalnız tr / az / en / bilinmeyen dilde dolgu
// (Almanca "um 8 Uhr", Portekizce "um dia" gerçek sözcük — düzeltmeden önce atılıyordu)
ok("dolgu: tek 'em' ve \"'em\" dolgu değil; 'emm', 'ehm' dolgu", !C.dolguMu("em") && !C.dolguMu("'em") && !C.dolguMu("Em") && C.dolguMu("emm") && C.dolguMu("ehm"));
ok("dolgu: Almanca / Portekizce metinde 'um' / 'uh' sözcük kalır, Türkçe / İngilizce / bilinmeyen dilde dolgu",
  !C.dolguMu("um", "de") && !C.dolguMu("um", "pt") && !C.dolguMu("Uh", "de") && C.dolguMu("um", "en") && C.dolguMu("um", "tr-TR") && C.dolguMu("uh", "az") && C.dolguMu("um") &&
  C.dolguMu("ııı", "de") && C.dolguMu("hmm", "pt"));
ok("dolgulariAt dil: 'Treffen um 8 Uhr' (de) ve 'em casa um dia' (pt) aynen",
  C.dolgulariAt([{ start: 0, end: 2, text: "Treffen um 8 Uhr, hmm" }], "de").segments[0].text === "Treffen um 8 Uhr," &&
  C.dolgulariAt([{ start: 0, end: 2, text: "Fiquei em casa um dia" }], "pt").segments[0].text === "Fiquei em casa um dia" &&
  C.dolgulariAt([{ start: 0, end: 2, text: "Fiquei em casa um dia" }], "pt").sayi === 0,
  J(C.dolgulariAt([{ start: 0, end: 2, text: "Treffen um 8 Uhr, hmm" }], "de").segments));
ok("dolgulariAt dil: ölçülmüş kelimeler de aynı dil kuralıyla (um kalır, hmm gider)", (function () {
  var r2 = C.dolgulariAt([{ start: 0, end: 2, text: "um acht hmm", words: [{ text: "um", start: 0, end: 0.5 }, { text: "acht", start: 0.5, end: 1 }, { text: "hmm", start: 1, end: 2 }] }], "de");
  return r2.segments[0].text === "um acht" && r2.segments[0].words.length === 2 && r2.segments[0].words[0].text === "um";
})());
var kw = C.segmentleriKur([seg], "k1", { dolguSil: true }).segments;
ok("kelime modunda (k1) dolgu kelimeleri cue olmaz", kw.map(function (s) { return s.text; }).join(" ").indexOf("ııı") === -1 && kw.length === 3, J(kw.map(function (s) { return s.text; })));

/* ---------------- emojisiz stilli katman ---------------- */
var ec = C.emojisizCueler([
  { start: 0, end: 1, text: "Harika 🔥 *iş* 🚀", words: [{ text: "Harika", start: 0, end: 0.3 }, { text: "🔥", start: 0.3, end: 0.4 }, { text: "iş", start: 0.4, end: 0.7 }, { text: "🚀", start: 0.7, end: 1 }] },
  { start: 1, end: 2, text: "🔥" }, { start: 2, end: 3, text: "*harika 🔥*" }, { start: 3, end: 4, text: "düz satır" }]);
ok("emojisizCueler: emoji düşer, kelimeler birlikte ayıklanır, vurgu kapanışı korunur, yalnız emoji satırı düşer",
  J(ec.map(function (c) { return c.text; })) === J(["Harika *iş*", "*harika*", "düz satır"]) && ec[0].words.length === 2 && ec[0].words[1].text === "iş" && !C.emojiVar(ec.map(function (c) { return c.text; }).join(" ")),
  J(ec));
// Doğrulama: emojiden sonra yalnız noktalama kalan sözcük ("👍.") tek başına "." olarak kalmasın; nokta önceki sözcüğe
// geçer, kelime sayısı metinle tutar (düzeltmeden önce "tamam ." ve 2 kelime)
var ecN = C.emojisizCueler([{ start: 0, end: 1, text: "tamam 👍.", words: [{ text: "tamam", start: 0, end: 0.5 }, { text: "👍.", start: 0.5, end: 1 }] },
  { start: 1, end: 2, text: "Harika (🔥) oldu" }, { start: 2, end: 3, text: "Harika 🔥 — oldu ..." }]);
ok("emojisizCueler: emojiden sonra yalnız noktalama kalırsa sözcük düşer, nokta öncekine geçer; emojisiz '—' kalır",
  J(ecN.map(function (c) { return c.text; })) === J(["tamam.", "Harika oldu", "Harika — oldu ..."]) && ecN[0].words.length === 1 && ecN[0].words[0].text === "tamam", J(ecN));

// VS16'lı emoji (❤️ ⚠️ ©️ ↔️) ve tuş kapağı (1️⃣): taban sembol de düşer; libass onu yedek fontta tek renk çizerdi
var ecV = C.emojisizCueler([{ start: 0, end: 1, text: "Sizi çok seviyorum ❤️" }, { start: 1, end: 2, text: "Buna dikkat ⚠️ edin" },
  { start: 2, end: 3, text: "1️⃣ birinci" }, { start: 3, end: 4, text: "güzel ↔️" }, { start: 4, end: 5, text: "etiket ©️" }, { start: 5, end: 6, text: "nota ♪ ve © işareti" }]);
ok("emojisizCueler: VS16 emojinin taban sembolü ve tuş kapağı rakamı da düşer; VS16'sız ♪ / © metin glifi kalır",
  J(ecV.map(function (c) { return c.text; })) === J(["Sizi çok seviyorum", "Buna dikkat edin", "birinci", "güzel", "etiket", "nota ♪ ve © işareti"]) &&
  ecV.every(function (c) { return !/[\u2764\u26A0\u2194\u00A9\uFE0F\u20E3]/.test(c.text) || c.text === "nota ♪ ve © işareti"; }), J(ecV.map(function (c) { return c.text; })));
ok("emojiSil: aynı düzeltme (Shorts eklerinin çağrısı)", C.emojiSil("seviyorum ❤️ çok") === "seviyorum çok" && C.emojiSil("2️⃣ adım") === "adım", C.emojiSil("seviyorum ❤️ çok"));

/* ---------------- noktalama (Nizami düzelt) ---------------- */
function N(t) { return Q.normalizeText(t, "tr"); }
ok("eksik boşluk: virgül / noktadan sonra harf", N("geldik.Sonra gittik") === "Geldik. Sonra gittik" && N("evet,tamam") === "Evet, tamam");
ok("eksik boşluk: teknik ad ve dosya adı bölünmez (Node.js, ASP.NET, video.mp4)", N("Node.js kur") === "Node.js kur" && N("Next.js ile") === "Next.js ile" &&
  N("ASP.NET Core") === "ASP.NET Core" && N("C#.NET dersi") === "C#.NET dersi" && N("bu video.mp4 dosyası") === "Bu video.mp4 dosyası" &&
  N("aç index.html dosyasını") === "Aç index.html dosyasını" && N("sonra package.json güncelle") === "Sonra package.json güncelle" && N("bu ffmpeg.exe çalışır") === "Bu ffmpeg.exe çalışır" &&
  N("geldik.Şimdi gidelim") === "Geldik. Şimdi gidelim" && N("geldik.İşte") === "Geldik. İşte" && N("tamam.O zaman") === "Tamam. O zaman",
  [N("Node.js kur"), N("ASP.NET Core"), N("bu video.mp4 dosyası"), N("aç index.html dosyasını"), N("tamam.O zaman")].join(" | "));
var afT = Q.autoFix([{ start: 0, end: 2, text: "Node.js kur", words: [{ text: "Node.js", start: 0, end: 1 }, { text: "kur", start: 1, end: 2 }] }], { lang: "tr" });
ok("Nizami düzelt teknik adı ve kelime zamanlamasını bozmaz", afT[0].text === "Node.js kur" && afT[0].words.length === 2, J(afT));
ok("sayılara dokunmaz: 3,5 / 1.250 / 12.30 / 12:30 / 16:9", N("tam 3,5 kilo") === "Tam 3,5 kilo" && N("1.250 TL") === "1.250 TL" && N("saat 12.30'da") === "Saat 12.30'da" &&
  N("saat 12:30") === "Saat 12:30" && N("oran 16:9 olsun") === "Oran 16:9 olsun" && N("not:bunu") === "Not: bunu", [N("saat 12:30"), N("not:bunu")].join(" | "));
ok("URL ve e-postaya dokunmaz (iki nokta kuralı ve büyük harf dahil)", N("https://suflo.app/fiyat") === "https://suflo.app/fiyat" &&
  N("Bak: https://suflo.app/fiyat.") === "Bak: https://suflo.app/fiyat." && N("mail: ali@ornek.com.tr") === "Mail: ali@ornek.com.tr" &&
  N("www.suflo.app") === "www.suflo.app" && N("suflo.app'te bul") === "suflo.app'te bul", [N("https://suflo.app/fiyat"), N("suflo.app'te bul")].join(" | "));
ok("kısaltmalara dokunmaz: Dr., vb., A.B.D., e.g.", N("Dr.Ahmet geldi") === "Dr.Ahmet geldi" && N("kitap vb.şeyler") === "Kitap vb.şeyler" &&
  N("A.B.D.'de oldu") === "A.B.D.'de oldu" && N("e.g. this") === "E.g. this");
ok("tipografik kesme özel ad ekinde düz kesme; tırnak olarak kalır", N("Instagram’da gör") === "Instagram'da gör" && N("‘merhaba’ dedi") === "‘Merhaba’ dedi");
ok("tam üç nokta (ve fazlası) …", N("bekle...sonra") === "Bekle…sonra" && N("bekle.... sonra") === "Bekle… sonra");
ok("eski kurallar korunur", N("  şimdi  başlıyoruz  !  ") === "Şimdi başlıyoruz!" && N("inanılmaz!!!!") === "İnanılmaz!!");
var af = Q.autoFix([{ start: 0, end: 2, text: "geldik.Sonra gittik", words: [{ text: "geldik.Sonra", start: 0, end: 1 }, { text: "gittik", start: 1, end: 2 }] }], { lang: "tr" });
ok("Nizami düzelt yeni noktalamayı uygular ve kelimeleri yeni metne hizalar", af[0].text === "Geldik. Sonra gittik" && af[0].words.length === 3 && af[0].words[2].start === 1, J(af));

/* ---------------- sahte DOM: captions.js / app.js gerçek işlevleri ---------------- */
var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");
var app = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8").replace(/\r\n/g, "\n");
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8").replace(/\r\n/g, "\n");
function govde(kaynak, imza) { var i = kaynak.indexOf(imza); if (i < 0) throw new Error("yok: " + imza); return kaynak.slice(i, kaynak.indexOf("\n  }\n", i) + 4); }
function dugum(id, ek) {
  var d = { id: id, hidden: false, disabled: false, value: "", checked: false, textContent: "", dinle: {} };
  d.addEventListener = function (t, f) { (d.dinle[t] = d.dinle[t] || []).push(f); };
  d.yay = function (t) { (d.dinle[t] || []).slice().forEach(function (f) { f.call(d, { type: t, target: d }); }); };
  d.click = function () { if (!d.disabled) d.yay("click"); };
  for (var k in ek || {}) d[k] = ek[k];
  return d;
}

// app.js: Ayarlar › Altyazı anahtarları
(function () {
  var dom = { "set-dolgu-sil": dugum("set-dolgu-sil"), "set-kufur-maske": dugum("set-kufur-maske") };
  var ayar = { kufurMaske: true }, kayit = 0;
  var f = new Function("el", "K", govde(app, "function metinTemizlikAyarlari(") + "\nreturn metinTemizlikAyarlari;")(
    function (id) { return dom[id] || null; }, { settings: function () { return ayar; }, saveSettings: function () { kayit++; } });
  f(ayar);
  ok("Ayarlar: anahtarlar kayıttan yüklenir (varsayılan kapalı)", dom["set-dolgu-sil"].checked === false && dom["set-kufur-maske"].checked === true);
  dom["set-dolgu-sil"].checked = true; dom["set-dolgu-sil"].yay("change");
  dom["set-kufur-maske"].checked = false; dom["set-kufur-maske"].yay("change");
  ok("Ayarlar: değişince kaydedilir", ayar.dolguSil === true && ayar.kufurMaske === false && kayit === 2, J(ayar));
  ok("app.js: init metinTemizlikAyarlari(s) çağırır", /metinTemizlikAyarlari\(s\);/.test(app));
})();
var grp = html.slice(html.indexOf('id="grp-altyazi"'), html.indexOf('id="grp-marka-kiti"'));
ok("index.html: Ayarlar › Altyazı'da iki anahtar, ikisi de varsayılan kapalı",
  /<input id="set-dolgu-sil" type="checkbox">/.test(grp) && />Dolgu seslerini altyazıdan çıkar</.test(grp) &&
  /<input id="set-kufur-maske" type="checkbox">/.test(grp) && />Küfürleri maskele</.test(grp));
// Doğrulama: süre / birleştirme ipucu kendi ayarlarının hemen altında kalır (yeni anahtarlar araya girip ipucunu
// "Küfürleri maskele"nin açıklaması gibi gösteriyordu)
ok("Ayarlar: 'Satır modlarında…' ipucu 'Kısa parçaları birleştir'in hemen altında, yeni anahtarlardan önce",
  /Kısa parçaları birleştir<\/span>\s*<\/label>\s*<p class="hint">Satır modlarında/.test(grp) && grp.indexOf("Satır modlarında") < grp.indexOf('id="set-dolgu-sil"'));
ok("captions.js: kurSecenekleri dolguSil'i taşır", /dolguSil: s\.dolguSil === true,/.test(govde(cap, "function kurSecenekleri(")));

// captions.js: Otomatik emoji seçenekleri + dolguları çıkar
function capOrtam(o) {
  o = o || {};
  var dom = {
    "cap-auto-emoji-yogunluk": dugum("cap-auto-emoji-yogunluk", { value: "seyrek" }),
    "cap-auto-emoji-yer": dugum("cap-auto-emoji-yer", { value: "son" }),
    "cap-emoji-atla": dugum("cap-emoji-atla", { hidden: true })
  };
  var ayar = o.ayar || {}, kayit = { n: 0 }, olay = { anlik: [], toast: [], status: [], call: [], render: 0 };
  var ortam = {
    el: function (id) { return dom[id] || null; },
    K: { settings: function () { return ayar; }, saveSettings: function () { kayit.n++; }, call: function (ad) { olay.call.push(ad); return Promise.resolve(o.spec || { ok: false, error: "durdu" }); }, hataYardimi: function (e) { return String(e && e.message || e); } },
    KApp: { toast: function (m, k) { olay.toast.push([m, k]); } },
    CT: C, CL: CL, segments: o.segments || [],
    window: { SufloAutoEmoji: AE, SufloKufurMaske: null, SufloStyleEngine: o.motor || null }
  };
  var kod = [
    "var segments = SEG, emojiAtlaBirKez = false, emojisizCikti = false, secilenMogrt = null, scope = 'clip', segmentsMode = 'plain', katmanIptal = null, katmanHazirlaniyor = false;",
    "function uygulamaIpucunuGuncelle() {}", govde(cap, "function uygulaDurumu("),
    "var ceviriDili = '', algilananDil = 'tr';",
    "function ceviriVar() { return false; } function cevrimdisiEn() { return false; } function arayuzDili() { return 'tr'; }",
    "function styleLocale() { return 'tr-TR'; } function styleText(t) { return t; } function motorCueTuru() { return 'lines'; }",
    "function snapshot(e) { O.anlik.push(e); } function render() { O.render++; } function saveDraftNow() {}",
    "function status(m, c) { O.status.push([m, c]); } function uygulaEtiketiniSifirla() {} function yerelCiktiSecili() { return false; }",
    "function stil() { return { aile: 'efekt', yogunluk: 'balanced' }; } function motorStiliMi() { return true; } function markaKiti() { return null; }",
    "function konusmaciRenkleri(x) { return x; } function motorAyarlari() { return {}; } function kirilimDili() { return 'tr'; }",
    "var Pro = { gate: function () { return true; }, isPro: function () { return true; } };",
    "var kelimeleriYenidenHizala = function (s, eski) { if (!s || !s.words || s.text === eski) return; var h = CL.kelimeleriHizala(s.words, s.text, s.start, s.end, 'tr'); if (h.length) s.words = h; else delete s.words; };",
    "var OTO_EMOJI_YOGUNLUK = ['seyrek', 'orta', 'yogun'];",
    govde(cap, "function otomatikEmojiSecenekleri("), govde(cap, "function otomatikEmojiAyarlariniBagla("),
    govde(cap, "function otomatikEmoji("), govde(cap, "function dolgulariCikar("),
    govde(cap, "function emojiAtlaDugmesi("), govde(cap, "function emojileriAtlaVeUygula("), govde(cap, "function emojiIceriyorMu("),
    govde(cap, "async function overlayUygula("), govde(cap, "function satirlariTopla("), govde(cap, "function cueler("),
    govde(cap, "function kufurMaskesiAcik("), govde(cap, "function kufurMaskele("),
    "return { otomatikEmoji: otomatikEmoji, bagla: otomatikEmojiAyarlariniBagla, dolgulariCikar: dolgulariCikar, overlayUygula: overlayUygula,",
    "  emojileriAtlaVeUygula: emojileriAtlaVeUygula, seg: function () { return segments; }, durum: function () { return { atla: emojiAtlaBirKez, emojisiz: emojisizCikti }; } };"
  ].join("\n");
  var api = new Function("el", "K", "KApp", "CT", "CL", "SEG", "window", "O", kod)(ortam.el, ortam.K, ortam.KApp, ortam.CT, ortam.CL, ortam.segments, ortam.window, olay);
  return { api: api, dom: dom, ayar: ayar, kayit: kayit, olay: olay };
}

(function () {
  var o = capOrtam({ ayar: { otoEmojiYogunluk: "yogun", otoEmojiYer: "kelime" }, segments: [{ start: 0, end: 1, text: "Bu harika bir video" }] });
  o.api.bagla();
  ok("Otomatik emoji: seçenekler kayıttan yüklenir", o.dom["cap-auto-emoji-yogunluk"].value === "yogun" && o.dom["cap-auto-emoji-yer"].value === "kelime");
  o.dom["cap-auto-emoji-yogunluk"].value = "orta"; o.dom["cap-auto-emoji-yogunluk"].yay("change");
  o.dom["cap-auto-emoji-yer"].value = "son"; o.dom["cap-auto-emoji-yer"].yay("change");
  ok("Otomatik emoji: seçenek değişince hatırlanır", o.ayar.otoEmojiYogunluk === "orta" && o.ayar.otoEmojiYer === "son" && o.kayit.n === 2, J(o.ayar));
  o.dom["cap-auto-emoji-yogunluk"].value = "__proto__"; o.dom["cap-auto-emoji-yogunluk"].yay("change");
  ok("Otomatik emoji: bilinmeyen değer seyreğe düşer", o.ayar.otoEmojiYogunluk === "seyrek");
  o.dom["cap-auto-emoji-yer"].value = "kelime";
  o.api.otomatikEmoji();
  ok("Otomatik emoji 'Kelimeden sonra': emoji tetikleyen kelimenin ardına, anlık görüntüyle (Ctrl+Z)", o.api.seg()[0].text === "Bu harika 🔥 bir video" && o.olay.anlik[0] === "otomatik emoji",
    o.api.seg()[0].text);
  var o2 = capOrtam({ segments: [{ start: 0, end: 1, text: "Bu harika bir video" }] });
  o2.api.bagla();
  o2.api.otomatikEmoji();
  ok("Otomatik emoji varsayılan: seyrek, satır sonu (bugünkü davranış)", o2.api.seg()[0].text === "Bu harika bir video 🔥", o2.api.seg()[0].text);
  var w = { start: 0, end: 2, text: "Bu harika bir video", words: [{ text: "Bu", start: 0, end: 0.4 }, { text: "harika", start: 0.4, end: 1 }, { text: "bir", start: 1, end: 1.4 }, { text: "video", start: 1.4, end: 2 }] };
  var o3 = capOrtam({ ayar: { otoEmojiYer: "kelime" }, segments: [w] });
  o3.api.bagla(); o3.api.otomatikEmoji();
  ok("Otomatik emoji ölçülmüş kelimeleri yeni metne hizalar (sayı tutar)", o3.api.seg()[0].words.length === 5 && o3.api.seg()[0].words[0].start === 0 && o3.api.seg()[0].words[4].end === 2,
    J(o3.api.seg()[0].words));
})();

(function () {
  var o = capOrtam({ segments: [{ start: 0, end: 1, text: "ııı merhaba" }, { start: 1, end: 2, text: "eee" }, { start: 2, end: 3, text: "temiz" }] });
  o.api.dolgulariCikar();
  ok("Dolguları çıkar: metin temizlenir, anlık görüntü (geri alınır), sayı bildirilir",
    J(o.api.seg().map(function (s) { return s.text; })) === J(["merhaba", "temiz"]) && o.olay.anlik[0] === "dolguları çıkar" && /2 dolgu/.test(o.olay.toast[0][0]), J(o.olay.toast));
  var o2 = capOrtam({ segments: [{ start: 0, end: 1, text: "temiz satır" }] });
  o2.api.dolgulariCikar();
  ok("Dolguları çıkar: dolgu yoksa anlık görüntü yok, uyarı", !o2.olay.anlik.length && o2.olay.toast[0][1] === "warn");
})();

// Emoji bekçisi: tek tıkla "Emojileri bu katmanda atla"
(function () {
  var yakalanan = null;
  var motor = { compile: function (x) { yakalanan = x; throw new Error("derleme durduruldu (test)"); } };
  var segs = [{ start: 0, end: 1, text: "Harika 🔥 iş" }, { start: 1, end: 2, text: "devam ediyoruz" }];
  var o = capOrtam({ segments: segs, motor: motor, spec: { ok: true, width: 1920, height: 1080, fps: 25, end: 5 } });
  o.api.overlayUygula().then(function () {
    ok("emojili altyazı: stilli katman durur, Premiere çağrılmaz, 'Emojileri bu katmanda atla' görünür",
      o.olay.call.length === 0 && o.dom["cap-emoji-atla"].hidden === false && /Emojileri bu katmanda atla/.test(o.olay.status[0][0]) && o.olay.status[0][1] === "warn");
    return o.api.emojileriAtlaVeUygula();
  }).then(function () {
    ok("tek tık: aynı uygulama emojisiz sürer (Premiere yoklanır), düğme gizlenir", o.olay.call[0] === "KS_overlaySpec" && o.dom["cap-emoji-atla"].hidden === true);
    ok("motor emojisiz cue'lar alır", yakalanan && yakalanan.cues.length === 2 && !C.emojiVar(yakalanan.cues.map(function (c) { return c.text; }).join(" ")) && yakalanan.cues[0].text === "Harika iş",
      yakalanan && J(yakalanan.cues));
    ok("transkript değişmez, bayrak yalnız o render için (hata olsa da kapanır)", segs[0].text === "Harika 🔥 iş" && o.api.durum().emojisiz === false && o.api.durum().atla === false);
    return o.api.overlayUygula();
  }).then(function () {
    ok("sonraki uygulama yine sorar (atla bir kerelik)", o.dom["cap-emoji-atla"].hidden === false && o.olay.call.length === 1);
    bitir();
  }).catch(function (e) { ok("emoji bekçisi akışı hatasız", false, e && e.stack); bitir(); });
})();
ok("index.html: 'Emojileri bu katmanda atla' düğmesi (gizli) ve init bağlantısı", /<button type="button" id="cap-emoji-atla" class="btn tiny" hidden/.test(html) &&
  /el\("cap-emoji-atla"\)\.addEventListener\("click", emojileriAtlaVeUygula\)/.test(cap));
ok("index.html: Otomatik emoji yanında yoğunluk ve yer menüleri; Dolguları çıkar düğmesi", /id="cap-auto-emoji-yogunluk"[\s\S]*value="seyrek"[\s\S]*value="orta"[\s\S]*value="yogun"/.test(html) &&
  /id="cap-auto-emoji-yer"[\s\S]*value="son"[\s\S]*value="kelime"/.test(html) && /id="cap-dolgu-sil"/.test(html) &&
  /el\("cap-dolgu-sil"\)\.addEventListener\("click", dolgulariCikar\)/.test(cap) && /otomatikEmojiAyarlariniBagla\(\);/.test(cap));

/* ---------------- i18n ---------------- */
var anahtarlar = ["Seyrek", "Dengeli", "Yoğun", "Satır sonuna", "Kelimeden sonra", "Dolguları çıkar", "Emojileri bu katmanda atla",
  "Dolgu seslerini altyazıdan çıkar", "Küfürleri maskele", "Otomatik emoji: kaç satıra emoji eklensin", "Otomatik emoji: emoji nereye eklensin",
  "{n} dolgu sesi çıkarıldı · Ctrl+Z ile geri al", "Altyazıda dolgu sesi (ııı, eee, hmm) bulunamadı"];
ok("i18n/en.js: yeni arayüz metinleri çevrili", anahtarlar.every(function (k) { return EN.indexOf(JSON.stringify(k) + ":") !== -1; }),
  anahtarlar.filter(function (k) { return EN.indexOf(JSON.stringify(k) + ":") === -1; }).join(" | "));

function bitir() {
  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}
