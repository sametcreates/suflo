// Suflo testi: js/altyazi-efekt.js — Altyazı Efektleri oluşturucusunun saf modeli (3.3)
// Hazır görünümler, ayar doğrulama, stil motoruna giden ince ayar, eski stil kimliklerinin
// en yakın görünüme taşınması ve TranscriptAI şablonu sözleşmesi (yerel MOGRT ek yeri).
var path = require("path"), fs = require("fs");
var kok = path.join(__dirname, "..");
var AE = require(path.join(kok, "js", "altyazi-efekt.js"));
var SE = require(path.join(kok, "js", "style-engine.js"));
var SS = require(path.join(kok, "js", "style-share.js"));
var SK = require(path.join(kok, "js", "stil-kodu.js"));
var YA = require(path.join(kok, "js", "yazi-animasyonlari.js"));
var FK = require(path.join(kok, "tools", "font-kontrol.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(o) { return JSON.stringify(o); }

/* ---------------- kimlikler ---------------- */
ok("giriş / vurgu kimlikleri stil motoru ve paylaşım koduyla aynı sırada", AE.GIRISLER.map(function (g) { return g.id; }).join(",") === SE.GIRISLER.join(",") &&
  AE.AKTIFLER.map(function (g) { return g.id; }).join(",") === SE.AKTIFLER.join(",") && SS.GIRISLER.join(",") === SE.GIRISLER.join(",") &&
  SS.AKTIFLER.join(",") === SE.AKTIFLER.join(","));
ok("giriş adları: Yok, Pop, Belirme, Yukarı kay, Aşağı kay, Zıpla", AE.GIRISLER.map(function (g) { return g.ad; }).join(",") === "Yok,Pop,Belirme,Yukarı kay,Aşağı kay,Zıpla");
ok("vurgu adları: Yok, Zıpla, Titre, Glitch", AE.AKTIFLER.map(function (g) { return g.ad; }).join(",") === "Yok,Zıpla,Titre,Glitch");
ok("temel stil 'efekt' motorda var ve kelime stili", AE.STIL === "efekt" && SE.has("efekt") && SE.wordBased("efekt"));

/* ---------------- hazır görünümler ---------------- */
var ids = AE.GORUNUMLER.map(function (g) { return g.id; });
// Parti 3 (stil kütüphanesi): ilk altı görünüm aynı sırada başta, toplam ≥ 30 (ayrıntılı denetim dosyanın sonunda)
ok("ilk altı görünüm aynı sırada başta (Temiz 0. dizin), toplam ≥ 30, kimlikler tekil", ids.slice(0, 6).join(",") === "temiz,vurucu,canli,zarif,kutulu,glitch" &&
  ids.length >= 30 && ids.filter(function (x, i) { return ids.indexOf(x) === i; }).length === ids.length, ids.join(","));
var efStil = SE.preset("efekt").style;
ok("ilk görünüm (Temiz) stil motorunun efekt varsayılanıyla birebir (yazım ve noktalama: motorun metin kuralı)", Object.keys(AE.VARSAYILAN).filter(function (k) {
  return k !== "kase" && k !== "punct"; }).every(function (k) { return AE.VARSAYILAN[k] === efStil[k];
}) && AE.GORUNUMLER[0].id === "temiz" && AE.VARSAYILAN.kase === SE.preset("efekt").text.kase && AE.VARSAYILAN.punct === SE.preset("efekt").text.punct, J(efStil));
ok("her görünüm doğrulamadan aynen geçer (eksiksiz ve geçerli)", AE.GORUNUMLER.every(function (g) { return J(AE.normalize(g.ayar)) === J(g.ayar); }));
var kelimeCue = ["Bunu", "*gören*", "herkes", "şaşırdı", "bugün"].map(function (w, i) { return { start: i * 0.5, end: i * 0.5 + 0.44, text: w }; });
AE.GORUNUMLER.forEach(function (g) {
  var ov = AE.overrides(g.ayar);
  var r = SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1080, height: 1920, overrides: ov });
  var uy = [];
  // Yazı animasyonlu kütüphane görünümü (parti 3): anim SFL1 kodunun "ek"ine gider (js/stil-kodu.js), overrides'ta klasik çift
  var temiz = SS.sanitizeOverrides(AE.overrides(AE.klasikAyar(g.ayar)), uy);
  var kodYolu = SK.decode(SK.encode({ styleId: "efekt", overrides: ov }), function (id) { return SE.has(id); });
  ok("görünüm " + g.id + ": motor çizer, paylaşım koduna uyarısız girer, yazı tipi paketten", r.eventCount > 0 && r.style.font === g.ayar.font &&
    r.style.giris === g.ayar.giris && r.style.aktif === g.ayar.aktif && uy.length === 0 && temiz.giris === g.ayar.giris && !!r.fontFiles[0] &&
    kodYolu.ok && kodYolu.warnings.length === 0 && (kodYolu.recipe.overrides.anim || "") === g.ayar.anim, uy.join(",") + " " + r.fontFiles[0] + " " + J(kodYolu.warnings));
});
ok("gorunum(): kopya döner (değiştirmek listeyi bozmaz), bilinmeyen null", (function () {
  var g = AE.gorunum("vurucu"); g.ayar.renk = "#000000";
  return AE.gorunum("vurucu").ayar.renk === "#ffffff" && AE.gorunum("uzay") === null && AE.gorunum(undefined) === null;
})());
ok("gorunumuBul: görünüm ayarı → kimliği; elle değişince \"\"; yazım biçimi ve noktalama sayılmaz", AE.GORUNUMLER.every(function (g) { return AE.gorunumuBul(g.ayar) === g.id; }) &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("vurucu").ayar, { boyut: 90 })) === "" &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("vurucu").ayar, { kase: "normal", punct: true })) === "vurucu");
ok("noktalama görünümle: 3.2'nin noktalamasız stillerinin yerini alan Vurucu / Canlı / Glitch noktalamasız, diğerleri noktalamalı; normalize yalnız boolean",
  AE.gorunum("vurucu").ayar.punct === false && AE.gorunum("canli").ayar.punct === false && AE.gorunum("glitch").ayar.punct === false &&
  AE.gorunum("temiz").ayar.punct === true && AE.gorunum("zarif").ayar.punct === true && AE.normalize({ punct: "hayır" }).punct === true &&
  AE.normalize({ punct: false }).punct === false && AE.overrides({ punct: false }).punct === undefined);

/* ---------------- normalize / overrides ---------------- */
var n = AE.normalize({ giris: "uzay", aktif: "zipla", vurgu: "evet", kalin: false, renk: "#ABCDEF", vurguRenk: "red", font: "Comic Sans",
  boyut: "999", kontur: -3, satir: 7, kelime: 0, konum: 3, kase: "BÜYÜK", __proto__: { x: 1 } });
ok("normalize: geçersiz alanlar varsayılana, aralık dışı kırpılır, renk küçük harf", n.giris === "fade" && n.aktif === "zipla" && n.vurgu === true &&
  n.kalin === false && n.renk === "#abcdef" && n.vurguRenk === "#ffd23f" && n.font === "Montserrat" && n.boyut === 180 && n.kontur === 0 &&
  n.satir === 3 && n.kelime === 1 && n.konum === 2 && n.kase === "normal" && n.x === undefined, J(n));
ok("normalize: nesne olmayan → varsayılan; taban verilirse eksikler tabandan", J(AE.normalize(null)) === J(AE.VARSAYILAN) &&
  AE.normalize({ renk: "#111111" }, AE.gorunum("glitch").ayar).font === "Bebas Neue" && AE.normalize({ renk: "#111111" }, AE.gorunum("glitch").ayar).renk === "#111111");
var ov = AE.overrides({ giris: "pop", aktif: "titre", satir: 1, kelime: 2, kase: "upper" });
ok("overrides: motorun beklediği alanlar, yazım biçimi (kase) yok", J(Object.keys(ov).sort()) ===
  J(["aktif", "boyut", "font", "giris", "golge", "italik", "kalin", "kelime", "kontur", "konturRenk", "konum", "konumX", "konumY", "kutu", "kutuOpak", "kutuRenk",
    "renk", "satir", "vurgu", "vurguRenk"]) && ov.kase === undefined, J(ov));
var ass = SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: ov }).ass;
ok("oluşturucu → motor: Pop girişi, titreme katmanı, tek satır, kartta en çok 2 kelime", /\\fscx0\\fscy0\\t\(0,300,\\fscx100\\fscy100\)/.test(ass) &&
  /^Dialogue: 2,/m.test(ass) && !/\\N/.test(ass) && ass.split("\n").filter(function (l) { return /^Dialogue: 1,/.test(l); }).length === 5);

/* ---------------- eski stil kimlikleri ---------------- */
var ESKI = ["mrbeast", "capcut", "saas", "viral", "pop", "doc", "premium", "hormozi", "neon", "daktilo", "ziplama", "dolgu"];
ok("her eski stilin en yakın görünümü var", ESKI.every(function (id) { return ids.indexOf(AE.eskiGorunum(id)) !== -1; }) &&
  AE.eskiGorunum("efekt") === null && AE.eskiGorunum("__proto__") === null && AE.eskiGorunum(5) === null);
ok("en yakınlar: Bold Box → Vurucu, Neon → Glitch, Premium → Zarif, Dolgu → Temiz, Zıplayan → Canlı",
  AE.eskiGorunum("hormozi") === "vurucu" && AE.eskiGorunum("neon") === "glitch" && AE.eskiGorunum("premium") === "zarif" &&
  AE.eskiGorunum("dolgu") === "temiz" && AE.eskiGorunum("ziplama") === "canli");
// 3.3 adım 17 inceleme: 3.2'nin kutulu stilleri (metnin arkasında koyu panel) arka plan kutusunu kaybetmez
ok("kutulu eski stiller (Clean Pill, SaaS Glass, Belgesel) → Kutulu: arka plan kutusu açık; yazı tipi / renk / konum eski stilden",
  ["capcut", "saas", "doc"].every(function (id) {
    var p = SE.preset(id).style, t = AE.eskiStilden(id, p);
    return AE.eskiGorunum(id) === "kutulu" && t.kutu === true && t.kutuOpak === AE.gorunum("kutulu").ayar.kutuOpak && t.font === p.font &&
      t.renk === p.renk.toLowerCase() && t.konum === p.konum && /SufloKutu/.test(SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", overrides: AE.overrides(t) }).ass);
  }) && AE.eskiStilden("doc", SE.preset("doc").style).font === "Lora");
var hz = SE.preset("hormozi").style;
var tasinan = AE.eskiStilden("hormozi", hz);
ok("eskiStilden: görünüm + eski stilin yazı tipi, renkleri ve konumu; punto / kontur görünümden", tasinan.font === hz.font && tasinan.renk === hz.renk &&
  tasinan.vurguRenk === hz.vurguRenk && tasinan.konum === hz.konum && tasinan.boyut === AE.gorunum("vurucu").ayar.boyut && tasinan.aktif === "zipla", J(tasinan));
var kodTasi = AE.eskiStilden("neon", { font: "Lora", renk: "#FF0000", vurguRenk: "kirmizi", konum: 8, boyut: 160, fontFile: "../x.ttf" });
ok("eskiStilden: 3.2 kodunun ince ayarı doğrulanır (geçersiz renk atılır, fontFile girmez)", kodTasi.font === "Lora" && kodTasi.renk === "#ff0000" &&
  kodTasi.vurguRenk === AE.gorunum("glitch").ayar.vurguRenk && kodTasi.konum === 8 && kodTasi.boyut === 118 && kodTasi.fontFile === undefined, J(kodTasi));
ok("eskiStilden: bilinmeyen kimlik null", AE.eskiStilden("uzayli", {}) === null && AE.eskiStilden("efekt", {}) === null);
ok("eski stiller motorda hâlâ kendi çıktılarını üretir (kayıtlı tercih / eski kod / paket işi)", ESKI.every(function (id) {
  return SE.compile({ styleId: id, cues: kelimeCue, cueKind: "words", width: 1920, height: 1080 }).eventCount > 0;
}));
ok("taşınan eski stil efekt olarak çizilir", SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", overrides: AE.overrides(tasinan) }).eventCount > 0);

/* ---------------- TranscriptAI şablonu sözleşmesi ---------------- */
// textAnim 0-5: None, Pop, Fade In, Slide Up, Slide Down, Bounce · hlAnim 0-3: None, Bounce, Shake, Glitch
var SABLON_GIRIS = { yok: 0, pop: 1, fade: 2, yukari: 3, asagi: 4, zipla: 5 };
var SABLON_AKTIF = { yok: 0, zipla: 1, titre: 2, glitch: 3 };
ok("sablonIndeksleri: giriş / vurgu kimliği şablonun textAnim / hlAnim değeri", Object.keys(SABLON_GIRIS).every(function (g) {
  return AE.sablonIndeksleri({ giris: g }).textAnim === SABLON_GIRIS[g];
}) && Object.keys(SABLON_AKTIF).every(function (a) { return AE.sablonIndeksleri({ aktif: a }).hlAnim === SABLON_AKTIF[a]; }));
var st = AE.sablonStili(AE.gorunum("vurucu").ayar, { olcek: 1920 / 1080 });
ok("sablonStili: [vurguRGB, yazıRGB, font, punto×ölçek, kontur, gölge, kutu, textAnim, hlAnim]", st.length === 9 && J(st[0]) === "[255,230,0]" &&
  J(st[1]) === "[255,255,255]" && st[2] === "Anton-Regular" && st[3] === Math.round(112 * 1920 / 1080) && J(st[4]) === "[1,0,0,0,8]" &&
  J(st[5]) === "[1,0,0,0,85,7,0]" && J(st[6]) === "[0]" && st[7] === 1 && st[8] === 1, J(st));
// Yazı tipi alanı setFont'a giden PostScript adı (TranscriptAI istemcisi gibi aile + kalın + italik → ad);
// yalnız paketteki yüzler: kurulu olmayan ad şablonda yazı tipini tümden düşürür
ok("sablonFontu: PostScript adı, kalın paketteki yüzden (Montserrat-Bold / -Regular, Lora-Bold), tek ağırlıklıda Regular",
  AE.sablonFontu({ font: "Montserrat", kalin: true }) === "Montserrat-Bold" && AE.sablonFontu({ font: "Montserrat", kalin: false }) === "Montserrat-Regular" &&
  AE.sablonFontu({ font: "Lora", kalin: true }) === "Lora-Bold" && AE.sablonFontu({ font: "Lora", kalin: false }) === "Lora-Regular" &&
  AE.sablonFontu({ font: "Archivo Black", kalin: true }) === "ArchivoBlack-Regular" && AE.sablonFontu({ font: "Bebas Neue" }) === "BebasNeue-Regular" &&
  AE.sablonFontu({ font: "Bungee", kalin: false }) === "Bungee-Regular" && AE.sablonStili(AE.gorunum("temiz").ayar)[2] === "Montserrat-Bold" &&
  AE.sablonStili(AE.gorunum("zarif").ayar)[2] === "Lora-Regular");
ok("sablonFontu: paketlenmemiş italik yüz istenmez (Montserrat-Italic kurulu değil → Regular / Bold)",
  AE.sablonFontu({ font: "Montserrat", kalin: true, italik: true }) === "Montserrat-Bold" && AE.sablonFontu({ font: "Lora", kalin: false, italik: true }) === "Lora-Regular");
var psAdlari = { "Anton.ttf": "Anton-Regular", "ArchivoBlack.ttf": "ArchivoBlack-Regular", "BebasNeue.ttf": "BebasNeue-Regular", "Bungee.ttf": "Bungee-Regular",
  "Lora.ttf": "Lora-Regular", "Montserrat-Bold.ttf": "Montserrat-Bold", "Montserrat-Regular.ttf": "Montserrat-Regular",
  // 3.3 adım 18: yeni fontların statik yüzleri
  "Bangers.ttf": "Bangers-Regular", "LibreCaslonDisplay.ttf": "LibreCaslonDisplay-Regular",
  "Inter-Regular.ttf": "Inter-Regular", "Inter-Bold.ttf": "Inter-Bold", "Poppins-Regular.ttf": "Poppins-Regular", "Poppins-Bold.ttf": "Poppins-Bold",
  "Nunito-Regular.ttf": "Nunito-Regular", "Nunito-Bold.ttf": "Nunito-Bold", "Exo2-Regular.ttf": "Exo2-Regular", "Exo2-Bold.ttf": "Exo2-Bold",
  "ChakraPetch-Regular.ttf": "ChakraPetch-Regular", "ChakraPetch-Bold.ttf": "ChakraPetch-Bold" };
ok("3.3 adım 18: yeni fontların şablon adı paketteki yüzden (kalın → -Bold, tek ağırlıklıda Regular); her paket fontunun şablon adı var",
  AE.sablonFontu({ font: "Exo 2", kalin: true }) === "Exo2-Bold" && AE.sablonFontu({ font: "Exo 2", kalin: false }) === "Exo2-Regular" &&
  AE.sablonFontu({ font: "Inter", kalin: true }) === "Inter-Bold" && AE.sablonFontu({ font: "Bangers", kalin: true }) === "Bangers-Regular" &&
  AE.sablonFontu({ font: "Libre Caslon Display", kalin: true }) === "LibreCaslonDisplay-Regular" &&
  SS.fontNames().every(function (n) { return AE.sablonFontu({ font: n, kalin: false }) !== n || n === "Bangers"; }) &&
  SS.fontNames().every(function (n) { return psAdlari[SS.fontFile(n)] && psAdlari[SS.fontFile(n, true)]; }));
ok("yeni fontlar oluşturucuda seçilebilir (normalize korur)", ["Bangers", "Exo 2", "Libre Caslon Display", "Chakra Petch"].every(function (n) { return AE.normalize({ font: n }).font === n; }));
// name tablosundaki PostScript adı (nameID 6, Windows UTF-16BE kaydı) dosyadan okunur
function psAdi(dosya) {
  var b = fs.readFileSync(path.join(__dirname, "..", "fonts", dosya)), n = b.readUInt16BE(4);
  for (var i = 0; i < n; i++) {
    var r = 12 + i * 16;
    if (b.toString("latin1", r, r + 4) !== "name") continue;
    var t = b.readUInt32BE(r + 8), sayi = b.readUInt16BE(t + 2), depo = t + b.readUInt16BE(t + 4);
    for (var j = 0; j < sayi; j++) {
      var k = t + 6 + j * 12;
      if (b.readUInt16BE(k) === 3 && b.readUInt16BE(k + 6) === 6) {
        var u = b.slice(depo + b.readUInt16BE(k + 10), depo + b.readUInt16BE(k + 10) + b.readUInt16BE(k + 8)), s = "";
        for (var c = 0; c + 1 < u.length; c += 2) s += String.fromCharCode(u.readUInt16BE(c));
        return s;
      }
    }
  }
  return "";
}
ok("sablonFontu adları paketteki dosyaların gerçek PostScript adları", Object.keys(psAdlari).every(function (f) { return psAdi(f) === psAdlari[f]; }),
  Object.keys(psAdlari).map(function (f) { return f + "=" + psAdi(f); }).join(" "));
var st0 = AE.sablonStili({ vurgu: false, kontur: 0, renk: "#102030" });
ok("sablonStili: vurgu kapalı → vurgu rengi = yazı rengi; kontur 0 → [0]; ölçek yoksa 1", J(st0[0]) === J(st0[1]) && J(st0[0]) === "[16,32,48]" &&
  J(st0[4]) === "[0]" && st0[3] === AE.VARSAYILAN.boyut, J(st0));

/* ---------------- 3.3 adım 17: gölge, kutu, serbest konum ---------------- */
ok("adım 17: şablon sözleşmesinde gölge [1,r,g,b,opaklık,mesafe,yumuşaklık], kutu [1,r,g,b,opaklık]; kapalıysa [0]",
  J(AE.sablonStili(AE.gorunum("kutulu").ayar)[6]) === "[1,0,0,0,65]" && J(AE.sablonStili(AE.gorunum("kutulu").ayar)[5]) === "[0]" &&
  J(AE.sablonStili({ golge: { renk: "#102030", opak: 40, mesafe: 12, yumusak: 30 } })[5]) === "[1,16,32,48,40,12,30]" &&
  J(AE.sablonStili(AE.gorunum("temiz").ayar).slice(5, 7)) === "[[0],[0]]");
var n17 = AE.normalize({ golge: { renk: "MAVI", opak: 400, mesafe: "8", yumusak: -1 }, kutu: "true", kutuRenk: "#ABCDEF", kutuOpak: 140, konumX: 0, konumY: 200 });
ok("adım 17 normalize: gölge alanları şablon varsayılanına / aralığa, kutu yalnız boolean, renk küçük harf, konum %5-95",
  J(n17.golge) === '{"renk":"#000000","opak":100,"mesafe":8,"yumusak":0}' && n17.kutu === false && n17.kutuRenk === "#abcdef" && n17.kutuOpak === 100 &&
  n17.konumX === 5 && n17.konumY === 95, J(n17));
ok("adım 17 normalize: konum ikisi birlikte (biri eksik / bozuksa hazır konum); gölge null / false = yok",
  AE.normalize({ konumX: 40 }).konumX === null && AE.normalize({ konumX: 40, konumY: "a" }).konumY === null &&
  AE.normalize({ konumX: 40, konumY: "60" }).konumY === 60 && AE.normalize({ golge: false }).golge === null &&
  AE.normalize({ golge: "var" }).golge === null && AE.normalize({ golge: null }, AE.gorunum("vurucu").ayar).golge === null);
ok("adım 17 gorunumuBul: gölge / kutu / konum değişince görünüm bırakılır; kutu kapalıyken kutu rengi sayılmaz",
  AE.gorunumuBul(Object.assign({}, AE.gorunum("vurucu").ayar, { golge: null })) === "" &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("vurucu").ayar, { golge: { renk: "#000000", opak: 85, mesafe: 8, yumusak: 0 } })) === "" &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("temiz").ayar, { konumX: 50, konumY: 50 })) === "" &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("temiz").ayar, { kutuRenk: "#ff0000", kutuOpak: 10 })) === "temiz" &&
  AE.gorunumuBul(Object.assign({}, AE.gorunum("kutulu").ayar, { kutuOpak: 64 })) === "");
// hazır konum noktaları stil motorunun efekt bağlantı noktasıyla aynı (1920×1080, giriş yok)
ok("adım 17: hazır konum noktaları motorun yerleşimiyle aynı (±0,5%)", [1, 2, 5, 8].every(function (k) {
  var l = SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: { konum: k, giris: "yok" } }).ass
    .split("\n").filter(function (x) { return /^Dialogue: 1,/.test(x); })[0];
  var m = /\\pos\((\d+),(\d+)\)/.exec(l), p = AE.KONUM_NOKTALARI[k];
  return m && Math.abs(Number(m[1]) / 19.2 - p.x) <= 0.5 && Math.abs(Number(m[2]) / 10.8 - p.y) <= 0.5;
}));
var tz = AE.gorunum("temiz").ayar;
/*
 * 3.3 adım 17 inceleme: sürükleme modeli kartın ORTASIYLA çalışır (serbest konum \an5 kart ortası). Hazır konumun
 * noktası da kart ortası: 1920×1080 Temiz'de Alt (bağlantı %84, kartın altı) → orta %76,9; Üst (%22, kartın üstü) →
 * %29,1; Alt sol %30,4 · %78,4 (gerçek çizimle denetimi tests/test-style-engine.js'te). Serbest Y çizilen banda
 * (kart kadraja sığar: %11-89) kırpılır.
 */
var olc = AE.konumOlcusu(tz);
ok("konumOlcusu: hazır konumların kart ortası stil motorundan (1920×1080 Temiz: Alt 50 · 76,9, Orta 50 · 62, Üst 50 · 29,1, Alt sol 30,4 · 78,4), Y bandı 11-89",
  [1, 2, 5, 8].every(function (k) { var m = SE.efektKonumlari(AE.overrides(tz), 1920, 1080).noktalar[k];
    return olc.noktalar[k].x === m.x && olc.noktalar[k].y === m.y && olc.noktalar[k].ad === AE.KONUM_NOKTALARI[k].ad; }) && olc.noktalar[2].y === 76.9 && olc.noktalar[5].y === 62 && olc.noktalar[8].y === 29.1 &&
  olc.noktalar[1].x === 30.4 && J(olc.ySinir) === "[11,89]", J(olc));
var s1 = AE.surukle(tz, 31.4, 40.6), s2 = AE.surukle(tz, 52.9, 74.6), s3 = AE.surukle(tz, 47, 60), s4 = AE.surukle(tz, -10, 130), s5 = AE.surukle(tz, "a", 3);
ok("surukle: serbest nokta tam sayıya yuvarlanır, hazır konum (konum) kalır", s1.konumX === 31 && s1.konumY === 41 && s1.konum === 2 && s1.yapisti === 0, J(s1));
ok("surukle: hazır konumun kart ortasına ±%3 içinde yapışır (Alt: X 50 · Y 76,9; Orta: 50 · 62), serbest konum silinir",
  s2.konum === 2 && s2.konumX === null && s2.konumY === null && s2.yapisti === 2 && s2.y === 76.9 && s3.konum === 5 && s3.yapisti === 5 && s3.konumX === null, J([s2, s3]));
// X de çizilen banda (adım 17 ikinci inceleme): örnek metin verilmezse satır ~16 karakterlik kart kadraja sığar (%23-77)
ok("surukle: X kartın kadraja sığdığı banda (örneksiz 1920×1080 Temiz: %23-77), Y çizilen banda (%11-89) kırpılır; sayı değilse ayar olduğu gibi",
  J(olc.xSinir) === "[23,77]" && s4.konumX === 23 && s4.konumY === 89 && AE.surukle(tz, 130, 40).konumX === 77 && s5.konumX === null && s5.konum === 2, J([olc.xSinir, s4, s5]));
ok("surukle: eski bağlantı noktasına (Alt %84, kartın altı) bırakmak yapışmaz (orada kart Alt'tan aşağıda çizilir)", AE.surukle(tz, 50, 84).yapisti === 0);
var serbest = Object.assign({}, tz, { konumX: 30, konumY: 40 });
ok("kaydir: ok tuşu %1 (Shift %5); hazır konumdan kart ortasıyla başlar (Alt'tan yukarı ok yazıyı yukarı taşır); yapışmaz; kırpılır",
  J(AE.kaydir(tz, 1, 0).konumX) === "51" && AE.kaydir(tz, 1, 0).konumY === 77 && AE.kaydir(tz, 0, -1).konumY === 76 && AE.kaydir(tz, 0, -1).konumY < olc.noktalar[2].y &&
  AE.kaydir(serbest, 0, -5).konumY === 35 &&
  AE.kaydir(Object.assign({}, tz, { konumX: 50, konumY: 85 }), 0, -1).konumY === 84 && AE.kaydir(Object.assign({}, tz, { konumX: 50, konumY: 85 }), 0, -1).konumX === 50 &&
  AE.kaydir(Object.assign({}, tz, { konumX: 74, konumY: 50 }), 5, 0).konumX === 77 && AE.kaydir(Object.assign({}, tz, { konumX: 50, konumY: 89 }), 0, 5).konumY === 89);
ok("sifirla: serbest konum silinir, hazır konum geçerli (noktası kart ortası)", J(AE.sifirla(serbest)) === '{"konum":2,"konumX":null,"konumY":null,"x":50,"y":76.9,"yapisti":2}');
ok("konumEtiketi: 'X %31 · Y %41'; yapışınca 'Alt · hazır konum'", AE.konumEtiketi(s1) === "X %31 · Y %41" && AE.konumEtiketi(s2) === "Alt · hazır konum" &&
  AE.konumEtiketi(AE.surukle(tz, 31, 79)) === "Alt sol · hazır konum" && AE.konumEtiketi(null) === "");
ok("konumNoktasi / sablonKonumu: serbest nokta ya da hazır konumun kart ortası (oran 0-1, Motion › Position için)",
  J(AE.konumNoktasi(serbest)) === '{"x":30,"y":40,"konum":2,"serbest":true}' && J(AE.sablonKonumu(tz)) === '{"x":0.5,"y":0.769,"serbest":false}' &&
  J(AE.sablonKonumu(serbest)) === '{"x":0.3,"y":0.4,"serbest":true}');

/* 9:16 (1080×1920): motor Alt'ı %74'e çeker, kart %7-78 bandına sığar; önizleme modeli çizilenle aynı yeri kullanır */
var D = { w: 1080, h: 1920 }, olcD = AE.konumOlcusu(tz, D);
ok("9:16 konumOlcusu: Alt'ın kart ortası %70,1 (bağlantı %74 − yarım kart), Orta %62, Üst %25,9; Y bandı 13-72",
  olcD.noktalar[2].y === 70.1 && olcD.noktalar[5].y === 62 && olcD.noktalar[8].y === 25.9 && J(olcD.ySinir) === "[13,72]", J(olcD));
ok("9:16 surukle: Alt'ın görünen yerine (≈%70) bırakmak Alt'a yapışır; %84'e (alt arayüz bandı) bırakmak yapışmaz, %72'ye sığar",
  AE.surukle(tz, 50, 69, D).yapisti === 2 && AE.surukle(tz, 50, 84, D).yapisti === 0 && AE.surukle(tz, 50, 84, D).konumY === 72 &&
  AE.konumEtiketi(AE.surukle(tz, 50, 90, D)) === "X %50 · Y %72");
ok("9:16 kaydir: Alt'tan yukarı ok yazıyı yukarı taşır (%70,1 → 69), aşağı ok bandın altında kalır",
  AE.kaydir(tz, 0, -1, D).konumY === 69 && AE.kaydir(tz, 0, 5, D).konumY === 72 && AE.kaydir(tz, 0, -1, D).konumY < olcD.noktalar[2].y);
ok("9:16 konumNoktasi: başka kadrajdan kalan serbest Y (85) çizildiği yerde (bandın içinde) gösterilir",
  AE.konumNoktasi(Object.assign({}, tz, { konumX: 50, konumY: 85 }), D).y === 72 && AE.konumNoktasi(Object.assign({}, tz, { konumX: 50, konumY: 85 })).y === 85);
ok("9:16 Alt sol ile Alt'ın yapışma bölgesi örtüşünce en yakın kazanır", AE.surukle(tz, 50, 70.1, D).yapisti === 2 && AE.surukle(tz, olcD.noktalar[1].x - 0.5, 70.1, D).yapisti === 1);
ok("guvenli (Platform arayüzünden kaçın) ölçüye geçer: Alt sol kartı ikon sütunundan uzak, daha solda",
  AE.konumOlcusu(tz, { w: 1080, h: 1920, guvenli: true }).noktalar[1].x < olcD.noktalar[1].x);

/*
 * Adım 17 ikinci inceleme: serbest X de çizilen yere kırpılır. Eskiden X yalnız %5-95'e kırpılıyordu: motor kartı kadraja
 * sığdırınca (serbestKart) etiket / artı işareti / kaydedilen X "%95" derken yazı 16:9'da %74,5'te, 9:16'da %54,6'da
 * çiziliyordu; kenardan Shift+sol basışları ekranda hiçbir şeyi kımıldatmıyordu. Örnek: panelin gerçek önizlemesine
 * giden kartlar (transkript yokken motorOnizlemeCueleri'nin cümlesi).
 */
var ornekCue = ["Bunu", "*sakın*", "kaçırma", "arkadaşlar", "bugün"].map(function (w, i) { return { start: 0.15 + i * 0.62, end: 0.7 + i * 0.62, text: w }; });
function cizilenXler(ayar, d) {
  var ov = AE.overrides(ayar); ov.guvenli = d.guvenli === true;
  return SE.compile({ styleId: "efekt", cues: ornekCue, cueKind: "words", width: d.w, height: d.h, overrides: ov }).ass.split("\n")
    .filter(function (l) { return /^Dialogue: [13],/.test(l); })
    .map(function (l) { var m = /\\pos\((\d+),/.exec(l) || /\\move\([^,]+,[^,]+,(\d+),/.exec(l); return m ? Number(m[1]) / d.w * 100 : null; })
    .filter(function (x) { return x !== null; });
}
// etiketteki X (konumEtiketi) ile her kartın çizildiği X arasındaki en büyük fark
function etiketFarki(ayar, r, d) {
  var etiketX = Number(/X %(\d+)/.exec(AE.konumEtiketi(r))[1]);
  return Math.max.apply(null, cizilenXler(Object.assign({}, ayar, { konum: r.konum, konumX: r.konumX, konumY: r.konumY }), d).map(function (x) { return Math.abs(x - etiketX); }));
}
[["9:16", { w: 1080, h: 1920 }], ["9:16 güvenli", { w: 1080, h: 1920, guvenli: true }], ["16:9", { w: 1920, h: 1080 }]].forEach(function (k) {
  var d = Object.assign({ ornek: { cues: ornekCue, cueKind: "words" } }, k[1]);
  ["temiz", "kutulu", "vurucu"].forEach(function (gid) {
    var a = Object.assign({}, AE.gorunum(gid).ayar, { konum: 5 });
    var sag = AE.surukle(a, 95, 40, d), sol = AE.surukle(a, 5, 40, d);
    ok(k[0] + " " + gid + ": kenara sürüklenen yazının etiketindeki X, motorun çizdiği X (±%1,5): sağ " + AE.konumEtiketi(sag) + ", sol " + AE.konumEtiketi(sol),
      etiketFarki(a, sag, k[1]) <= 1.5 && etiketFarki(a, sol, k[1]) <= 1.5 && sag.konumX < 95 && sol.konumX > 5,
      etiketFarki(a, sag, k[1]).toFixed(2) + " / " + etiketFarki(a, sol, k[1]).toFixed(2));
  });
});
(function () {
  var D9 = { w: 1080, h: 1920, ornek: { cues: ornekCue, cueKind: "words" } }, a = Object.assign({}, tz, { konum: 5 });
  var r = AE.surukle(a, 95, 40, D9), adimlar = [r.konumX], ciz = [cizilenXler(Object.assign({}, a, r), D9)[0]];
  for (var i = 0; i < 2; i++) {
    r = AE.kaydir(Object.assign({}, a, { konumX: r.konumX, konumY: r.konumY }), -5, 0, D9);
    adimlar.push(r.konumX); ciz.push(cizilenXler(Object.assign({}, a, r), D9)[0]);
  }
  // bu örnekte kart kadrajın ~%85'i: bant %46-54; iki Shift+sol 54 → 49 → 46 (bandın kenarı), yazı her basışta etiket kadar kayar
  ok("9:16 Temiz: sağ kenardan Shift+sol her basışta yazıyı da kaydırır (etiket ile çizilen X birlikte; eskiden 90→65 boyunca yazı yerinde kalıyordu)",
    J(adimlar) === "[54,49,46]" && ciz.every(function (x, j) {
      return Math.abs(x - adimlar[j]) <= 1.5 && (j === 0 || Math.abs((ciz[j - 1] - x) - (adimlar[j - 1] - adimlar[j])) <= 0.5);
    }), J([adimlar, ciz.map(function (x) { return x.toFixed(1); })]));
  var eski = Object.assign({}, a, { konumX: 95, konumY: 40 });
  ok("kaydedilmiş X 95 (eski sürüm / başka kadraj) çizildiği yerde gösterilir; sablonKonumu (Motion › Position) da çizilen yer",
    AE.konumNoktasi(eski, D9).x === 54 && Math.abs(cizilenXler(eski, D9)[0] - 54) <= 1.5 && AE.sablonKonumu(eski, D9).x === 0.54 &&
    AE.konumNoktasi(eski, { w: 1920, h: 1080, ornek: D9.ornek }).x === 74, J([AE.konumNoktasi(eski, D9), AE.sablonKonumu(eski, D9)]));
  var D16 = { w: 1920, h: 1080, ornek: D9.ornek }, o16 = AE.surukle(a, 95, 40, D16), xs = [o16.konumX];
  for (var j = 0; j < 4; j++) { o16 = AE.kaydir(Object.assign({}, a, { konumX: o16.konumX, konumY: o16.konumY }), -5, 0, D16); xs.push(o16.konumX); }
  ok("16:9 Orta: sağ kenardan (X %74) dört Shift+sol yazıyı her seferinde %5 kaydırır (eskiden X 95→75 boyunca yazı kımıldamıyordu)",
    J(xs) === "[74,69,64,59,54]" && xs.every(function (x) { return Math.abs(cizilenXler(Object.assign({}, a, { konumX: x, konumY: 40 }), D16)[0] - x) <= 1.5; }), J(xs));
})();

/* Sürüklerken yapışma bölgesinden geçmek hazır konumu değiştirmez (taban: sürükleme başındaki hazır konum) */
var gecis = AE.surukle(tz, 50, 61, { taban: 2 });
var sonra = AE.surukle(Object.assign({}, tz, { konum: gecis.konum, konumX: gecis.konumX, konumY: gecis.konumY }), 30, 40, { taban: 2 });
ok("surukle: Orta bölgesinden geçip serbest noktaya varınca hazır konum sürükleme başındaki (Alt) kalır; sıfırla Alt'a döner",
  gecis.yapisti === 5 && gecis.konum === 5 && sonra.konum === 2 && sonra.konumX === 30 && sonra.konumY === 40 &&
  AE.sifirla(Object.assign({}, tz, sonra)).konum === 2 && AE.sifirla(Object.assign({}, tz, sonra)).y === 76.9, J([gecis, sonra]));
ok("surukle: geçersiz taban yok sayılır (ayarın konumu)", AE.surukle(Object.assign({}, tz, { konum: 8 }), 30, 40, { taban: 3 }).konum === 8 &&
  AE.surukle(Object.assign({}, tz, { konum: 8 }), 30, 40, { taban: "__proto__" }).konum === 8);
var kutuluAss = SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: AE.overrides(AE.gorunum("kutulu").ayar) }).ass;
ok("Kutulu görünümü motorda kutuyla, Vurucu / Zarif gölgeyle çizilir", /Style: SufloKutu,/.test(kutuluAss) && /\\3a&H59&/.test(kutuluAss) &&
  /\\4a&H26&\\shad4\.9\}/.test(SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: AE.overrides(AE.gorunum("vurucu").ayar) }).ass) &&
  /\\shad2\.1\\blur5/.test(SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: AE.overrides(AE.gorunum("zarif").ayar) }).ass));

/* ---------------- Parti 3: stil kütüphanesi (kategoriler, 24+ özgün görünüm, tipografi kuralları) ---------------- */
var KAT = AE.KATEGORILER.map(function (k) { return k.id; });
ok("KATEGORILER: altı Suflo kategorisi + yeni koleksiyon (\"Yeni\"; panelde AutoCaptions adı yazmaz), Türkçe adlarıyla", J(AE.KATEGORILER) === J([{ id: "viral", ad: "Viral · Shorts" }, { id: "minimal", ad: "Minimal" },
  { id: "podcast", ad: "Podcast" }, { id: "egitim", ad: "Eğitim" }, { id: "sinematik", ad: "Sinematik" }, { id: "marka", ad: "Marka" },
  { id: "autocaptions", ad: "Yeni" }]), J(AE.KATEGORILER));
// AutoCaptions koleksiyonu (ClashiVFX AutoCaptions, yazarın izniyle): 19 görünüm, hepsi kütüphanenin sonunda, koleksiyon işaretli
var ACG = AE.GORUNUMLER.filter(function (g) { return g.kategori === "autocaptions"; });
ok("AutoCaptions koleksiyonu: 19 görünüm, kimlikler ac-, koleksiyon: autocaptions yalnız onlarda, listenin sonunda, en az 8'i koleksiyonun animasyonlarıyla",
  ACG.length === 19 && ACG.every(function (g) { return /^ac-[a-z]+(-[a-z]+)*$/.test(g.id) && g.koleksiyon === "autocaptions"; }) &&
  AE.GORUNUMLER.every(function (g) { return (g.koleksiyon === "autocaptions") === (g.kategori === "autocaptions"); }) &&
  AE.GORUNUMLER.slice(-19).every(function (g) { return g.kategori === "autocaptions"; }) &&
  ACG.filter(function (g) { var k = g.ayar.anim && YA.bul(g.ayar.anim); return k && k.koleksiyon === "autocaptions"; }).length >= 8,
  ACG.map(function (g) { return g.id; }).join(","));
ok("AutoCaptions koleksiyonu: normalize meta alanı (koleksiyon) ayara girmez", ACG.every(function (g) {
  return AE.normalize(Object.assign({ koleksiyon: "autocaptions" }, g.ayar)).koleksiyon === undefined && !("koleksiyon" in AE.overrides(g.ayar));
}));
ok("ilk altının kategorisi: Temiz minimal, Vurucu / Canlı / Glitch viral, Zarif sinematik, Kutulu podcast",
  J(AE.GORUNUMLER.slice(0, 6).map(function (g) { return g.kategori; })) === J(["minimal", "viral", "viral", "sinematik", "podcast", "viral"]));
ok("her görünümün geçerli kategorisi ve tek satırlık Türkçe açıklaması var", AE.GORUNUMLER.every(function (g) {
  return KAT.indexOf(g.kategori) !== -1 && typeof g.aciklama === "string" && g.aciklama.length >= 20 && g.aciklama.length <= 110 && !/\n/.test(g.aciklama) &&
    typeof g.ad === "string" && g.ad.length > 0;
}), AE.GORUNUMLER.filter(function (g) { return KAT.indexOf(g.kategori) === -1 || !g.aciklama; }).map(function (g) { return g.id; }).join(","));
var katSay = {};
AE.GORUNUMLER.forEach(function (g) { katSay[g.kategori] = (katSay[g.kategori] || 0) + 1; });
ok("her kategoride ≥ 4 görünüm (Marka ≥ 3); toplam ≥ 30; kütüphaneye ≥ 24 yeni görünüm", KAT.every(function (k) { return katSay[k] >= (k === "marka" ? 3 : 4); }) &&
  AE.GORUNUMLER.length >= 30 && AE.GORUNUMLER.length - 6 >= 24, J(katSay));
ok("gruplar(): kategori sırasıyla, her görünüm tam bir grupta", J(AE.gruplar().map(function (k) { return k.id; })) === J(KAT) &&
  AE.gruplar().reduce(function (t, k) { return t + k.gorunumler.length; }, 0) === AE.GORUNUMLER.length &&
  AE.gruplar().every(function (k) { return k.gorunumler.every(function (x) { return AE.gorunum(x.id).kategori === k.id; }); }));
ok("Marka görünümleri marka: true (yalnız onlar), Marka kategorisinde", AE.GORUNUMLER.every(function (g) { return (g.marka === true) === (g.kategori === "marka"); }) &&
  AE.GORUNUMLER.filter(function (g) { return g.marka; }).length >= 3);
ok("normalize meta alanları yok sayar (kategori / aciklama / marka ayara girmez, ayar aynı kalır)", AE.GORUNUMLER.every(function (g) {
  var n = AE.normalize(Object.assign({ kategori: g.kategori, aciklama: g.aciklama, marka: true, id: g.id, ad: g.ad }, g.ayar));
  return J(n) === J(g.ayar) && n.kategori === undefined && n.aciklama === undefined && n.marka === undefined && !("kategori" in AE.overrides(n));
}));
ok("her görünüm: normalize gidip gelir, gorunumuBul kendini bulur, görünür ayarlar tekil (iki görünüm aynı değil)", AE.GORUNUMLER.every(function (g) {
  return J(AE.normalize(g.ayar)) === J(g.ayar) && AE.gorunumuBul(g.ayar) === g.id && AE.gorunumuBul(JSON.parse(J(g.ayar))) === g.id;
}) && (function () {
  // kase / punct gorunurAyar'a girmez: tekillik onlarsız da sağlanmalı
  var g = {};
  return AE.GORUNUMLER.every(function (x) { var a = Object.assign({}, x.ayar, { kase: "normal", punct: true }), k = J(AE.normalize(a)).replace(/"kase":"\w+","punct":\w+,/, "");
    if (!x.ayar.kutu) k = k.replace(/"kutuRenk":"#\w+","kutuOpak":\d+,/, "");
    if (g[k]) return false; g[k] = 1; return true; });
})());
ok("yazı animasyonlu görünümler: anim katalogda, giris / aktif katalogdaki klasik çift; ilk altı klasik", AE.GORUNUMLER.every(function (g, i) {
  if (!g.ayar.anim) return true;
  var k = YA.klasik(g.ayar.anim);
  return i >= 6 && !!YA.bul(g.ayar.anim) && k.giris === g.ayar.giris && k.aktif === g.ayar.aktif;
}) && AE.GORUNUMLER.slice(0, 6).every(function (g) { return g.ayar.anim === ""; }) && AE.GORUNUMLER.filter(function (g) { return g.ayar.anim; }).length >= 6);

// WCAG 2.x göreli parlaklık ve kontrast oranı
function parlaklik(hex) {
  var c = [1, 3, 5].map(function (i) { var v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function kontrast(a, b) { var x = parlaklik(a), y = parlaklik(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
ok("kontrast yardımcısı WCAG değerleri verir (siyah / beyaz 21, aynı renk 1, #777777 / beyaz ≈ 4,48)", Math.abs(kontrast("#000000", "#ffffff") - 21) < 1e-9 &&
  kontrast("#123456", "#123456") === 1 && Math.abs(kontrast("#777777", "#ffffff") - 4.48) < 0.01);
// Yazının okunduğu zemin: kutu varsa kutu, yoksa kontur, ikisi de yoksa gölge (gölge de yoksa null: kural dışı)
function zemin(a) { return a.kutu ? a.kutuRenk : a.kontur > 0 ? a.konturRenk : a.golge ? a.golge.renk : null; }
var kontrastlar = AE.GORUNUMLER.map(function (g) { var z = zemin(g.ayar); return [g.id, z ? kontrast(g.ayar.renk, z) : 0]; });
ok("yazı ile kontur / kutu arasında kontrast ≥ 4,5 (kontur ve kutu yoksa gölge zorunlu, gölgeyle)", kontrastlar.every(function (k) { return k[1] >= 4.5; }),
  kontrastlar.map(function (k) { return k[0] + " " + k[1].toFixed(1); }).join(", "));
ok("konturu ve kutusu olmayan görünümde gölge var, yeterince koyu ve yumuşak (opaklık ≥ 50, mesafe + yumuşaklık ≥ 6)", AE.GORUNUMLER.every(function (g) {
  var a = g.ayar;
  return a.kontur > 0 || a.kutu || (a.golge && a.golge.opak >= 50 && a.golge.mesafe + a.golge.yumusak >= 6);
}));
ok("vurgu rengi de zeminde okunur (kontrast ≥ 3, vurgu açıksa)", AE.GORUNUMLER.every(function (g) { return !g.ayar.vurgu || kontrast(g.ayar.vurguRenk, zemin(g.ayar)) >= 3; }),
  AE.GORUNUMLER.map(function (g) { return g.id + " " + kontrast(g.ayar.vurguRenk, zemin(g.ayar)).toFixed(1); }).join(", "));
ok("vurgu rengi yazı renginden belirgin (stil motorunun renk uzaklığı ≥ VURGU_YAKIN)", typeof SE.renkUzakligi === "function" && SE.VURGU_YAKIN === 150 &&
  AE.GORUNUMLER.every(function (g) { return SE.renkUzakligi(g.ayar.renk, g.ayar.vurguRenk) >= SE.VURGU_YAKIN; }),
  AE.GORUNUMLER.map(function (g) { return g.id + " " + Math.round(SE.renkUzakligi(g.ayar.renk, g.ayar.vurguRenk)); }).join(", "));
var BUYUK_HARFLI = ["Anton", "Bebas Neue", "Bungee", "Bangers"];
ok("yalnız büyük harfli görüntü fontları (Anton, Bebas Neue, Bungee, Bangers) yalnız BÜYÜK HARF ile", AE.GORUNUMLER.every(function (g) {
  return BUYUK_HARFLI.indexOf(g.ayar.font) === -1 || g.ayar.kase === "upper";
}), AE.GORUNUMLER.filter(function (g) { return BUYUK_HARFLI.indexOf(g.ayar.font) !== -1; }).map(function (g) { return g.id + ":" + g.ayar.kase; }).join(","));
ok("punto 56-130 (1080 tabanı)", AE.GORUNUMLER.every(function (g) { return g.ayar.boyut >= 56 && g.ayar.boyut <= 130; }));
ok("satır / kelime kategoriye uygun: viral 1-2 satır ve ≤ 4 kelime; podcast ve eğitim 2 satır, 5-7 kelime", AE.GORUNUMLER.every(function (g) {
  var a = g.ayar;
  if (g.kategori === "viral") return a.satir >= 1 && a.satir <= 2 && a.kelime <= 4;
  if (g.kategori === "podcast" || g.kategori === "egitim") return a.satir === 2 && a.kelime >= 5 && a.kelime <= 7;
  return true;
}), AE.GORUNUMLER.map(function (g) { return g.id + " " + g.ayar.satir + "/" + g.ayar.kelime; }).join(", "));
// Font cmap'i (tools/font-kontrol.js): görünümün çizildiği yüz(ler) Türkçe harflerin tamamını içerir
var yuzler = {};
AE.GORUNUMLER.forEach(function (g) { [SS.fontFile(g.ayar.font), SS.fontFile(g.ayar.font, true)].forEach(function (f) { if (f) yuzler[f] = 1; }); });
var cmap = Object.keys(yuzler).map(function (f) { var r = FK.denetle(fs.readFileSync(path.join(kok, "fonts", f))); return [f, r.hata ? ["hata"] : r.eksik]; });
ok("her görünümün yazı tipi ğĞüÜşŞıİöÖçÇ harflerinin tamamını içerir (cmap)", cmap.length >= 10 && cmap.every(function (x) { return x[1].length === 0; }) &&
  "ğĞüÜşŞıİöÖçÇ".split("").every(function (h) { return Object.prototype.hasOwnProperty.call(FK.TURKCE, h); }), J(cmap));
ok("adlar ve renkler özgün: rakip / üretici adı yok", AE.GORUNUMLER.every(function (g) {
  return !/mr\.?\s*beast|hormozi|capcut|clashi|submagic|veed|opus|tiktok|reels|instagram|youtube/i.test(g.id + " " + g.ad + " " + g.aciklama);
}));

// Her görünüm × kadraj: NaN yok, kartlar kadrajın içinde; 9:16 + "Platform arayüzünden kaçın" ile GUVENLI_ALAN dışında
var KUTU_GEN = SS.widths(), KAD_CUE = ["Bugün", "*sizlere*", "çok", "önemli", "bir", "şey", "anlatacağım", "arkadaşlar", "dikkat", "edin"]
  .map(function (w, i) { return { start: 0.2 + i * 0.45, end: 0.2 + i * 0.45 + 0.4, text: w }; });
// ASS olaylarının tahmini kutuları (fontun ortalama genişlik katsayısı; \pos ya da \move'un iki ucu; \an hizası)
function olayKutulari(ass) {
  var fontu = {}, out = [];
  ass.split("\n").forEach(function (l) { var m = /^Style: ([^,]+),([^,]+),/.exec(l); if (m) fontu[m[1]] = m[2]; });
  ass.split("\n").forEach(function (l) {
    if (!/^Dialogue:/.test(l)) return;
    var p = l.split(","), metin = p.slice(9).join(",");
    var an = Number((/\\an(\d)/.exec(metin) || [0, 2])[1]);
    var pos = /\\pos\(([-\d.]+),([-\d.]+)\)/.exec(metin), mv = /\\move\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/.exec(metin);
    var noktalar = pos ? [[+pos[1], +pos[2]]] : mv ? [[+mv[1], +mv[2]], [+mv[3], +mv[4]]] : [];
    var fsz = Number((/\\fs([\d.]+)/.exec(metin) || [0, 0])[1]), sx = Number((/\\fscx([\d.]+)/.exec(metin) || [0, 100])[1]);
    var bord = Number((/\\[xy]?bord([\d.]+)/.exec(metin) || [0, 0])[1]);
    var satirlar = metin.replace(/\{[^}]*\}/g, "").split("\\N");
    var en = Math.max.apply(null, satirlar.map(function (x) { return x.length; }));
    var bw = en * fsz * KUTU_GEN[fontu[p[3]]] * sx / 100 + 2 * bord, bh = satirlar.length * fsz * 1.2 + 2 * bord;
    noktalar.forEach(function (n) {
      var x0 = an % 3 === 1 ? n[0] : an % 3 === 2 ? n[0] - bw / 2 : n[0] - bw, y0 = an <= 3 ? n[1] - bh : an <= 6 ? n[1] - bh / 2 : n[1];
      out.push({ x0: x0, y0: y0, x1: x0 + bw, y1: y0 + bh });
    });
  });
  return out;
}
var GA = SE.GUVENLI_ALAN, kadrajHatasi = [];
AE.GORUNUMLER.forEach(function (g) {
  [[1920, 1080, false], [1080, 1920, false], [1080, 1920, true], [1080, 1080, false]].forEach(function (k) {
    var w = k[0], h = k[1], ov = AE.overrides(g.ayar);
    ov.guvenli = k[2];
    var r = SE.compile({ styleId: "efekt", cues: KAD_CUE, cueKind: "words", width: w, height: h, overrides: ov });
    var kutular = olayKutulari(r.ass), ad = g.id + "@" + w + "x" + h + (k[2] ? "g" : "");
    if (!(r.eventCount > 0) || /NaN|undefined|Infinity/.test(r.ass) || !kutular.length) { kadrajHatasi.push(ad + " olay/NaN"); return; }
    kutular.forEach(function (b) {
      if ([b.x0, b.y0, b.x1, b.y1].some(function (v) { return !isFinite(v); }) || b.x0 < 0 || b.y0 < 0 || b.x1 > w || b.y1 > h) kadrajHatasi.push(ad + " kadraj dışı " + J(b));
      if (k[2] && (b.y0 < GA[0].h * h || b.y1 > GA[2].y * h || (b.y1 > GA[1].y * h && b.y0 < (GA[1].y + GA[1].h) * h && b.x1 > GA[1].x * w))) kadrajHatasi.push(ad + " güvenli alanda " + J(b));
    });
  });
});
ok("her görünüm 16:9, 9:16 (güvenli açık / kapalı) ve 1:1'de NaN'sız derlenir, kartlar kadrajın içinde; 9:16 güvenlide platform arayüzünün dışında",
  kadrajHatasi.length === 0, kadrajHatasi.slice(0, 4).join(" | "));
// Yerel MOGRT sözleşmesi her görünümde geçerli
ok("sablonStili her görünümde geçerli sözleşme (9 alan, RGB 0-255, paket PostScript adı, punto, textAnim 0-5, hlAnim 0-3)", AE.GORUNUMLER.every(function (g) {
  var st = AE.sablonStili(g.ayar, { olcek: 1920 / 1080 });
  function rgbMi(x) { return x instanceof Array && x.length === 3 && x.every(function (v) { return v >= 0 && v <= 255 && v === Math.round(v); }); }
  return st.length === 9 && rgbMi(st[0]) && rgbMi(st[1]) && /^[A-Za-z0-9]+-(Regular|Bold)$/.test(st[2]) && st[3] === Math.round(g.ayar.boyut * 1920 / 1080) &&
    (st[4].length === 1 ? g.ayar.kontur === 0 : st[4].length === 5) && (st[5].length === 1) === !g.ayar.golge && (st[6].length === 1) === !g.ayar.kutu &&
    st[7] >= 0 && st[7] <= 5 && st[8] >= 0 && st[8] <= 3 && st[7] === SE.GIRISLER.indexOf(g.ayar.giris) && st[8] === SE.AKTIFLER.indexOf(g.ayar.aktif);
}));
// Eski panel: kütüphane görünümünün stil kodu, yazı animasyonunu bilmeyen çözücüde (SS.decode) klasik karşılığıyla açılır
ok("yeni görünümün stil kodu eski panelde (SS.decode, 'ek' bilinmez) aklı başında klasik görünüm: efekt, aynı yazı tipi / renk, klasik giriş / vurgu", AE.GORUNUMLER.slice(6).every(function (g) {
  var d = SS.decode(SK.encode({ styleId: "efekt", overrides: AE.overrides(g.ayar), text: { kase: g.ayar.kase, punct: g.ayar.punct } }), function (id) { return SE.has(id); });
  var o = d.recipe && d.recipe.overrides;
  return d.ok && d.recipe.styleId === "efekt" && o.font === g.ayar.font && o.renk === g.ayar.renk && o.vurguRenk === g.ayar.vurguRenk && o.anim === undefined &&
    o.giris === AE.klasikAyar(g.ayar).giris && o.aktif === AE.klasikAyar(g.ayar).aktif && d.warnings.every(function (w) { return w === "ek"; }) &&
    SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", overrides: o }).eventCount > 0;
}));

/* ---------------- kart gruplama: CJK cümle sonu ve uzun koşuda doğrusal süre ---------------- */
function uzunCue(n, f) { var a = []; for (var i = 0; i < n; i++) a.push({ start: i * 0.3, end: i * 0.3 + 0.25, text: f(i) }); return a; }
var jaKart = SE.efektSatirlari({ cues: uzunCue(200, function (i) { return i % 7 === 6 ? "です。" : "日本語"; }), cueKind: "words", dil: "ja" }, {});
var jaGecen = jaKart.filter(function (k) { return k.kelimeler.slice(0, -1).some(function (w) { return /。$/.test(w.text); }); });
ok("efektGrupla: Japonca '。' cümle sonu, kart onu aşmaz", jaKart.length > 0 && jaGecen.length === 0, jaGecen.length + " / " + jaKart.length);
var t0 = Date.now();
var trUzun = SE.efektSatirlari({ cues: uzunCue(9000, function (i) { return ["bugün", "size", "kamerayla", "ilgili", "birkaç", "şey"][i % 6]; }), cueKind: "words", dil: "tr" }, {});
var trSure = Date.now() - t0;
ok("efektGrupla: 9000 kelimelik noktalamasız koşu dondurmaz (< 2,5 sn; eskiden ~8 sn), kart sayısı ceil(n / 5)", trSure < 2500 && trUzun.length === 1800, trSure + " ms, " + trUzun.length + " kart");
var kisaKosu = SE.efektSatirlari({ cues: uzunCue(40, function (i) { return ["bugün", "size", "kamerayla", "ilgili", "birkaç", "şey"][i % 6]; }), cueKind: "words", dil: "tr" }, {});
ok("efektGrupla: pencere eşiğinin altındaki koşu eskisi gibi tek DP (40 kelime → 8 kart)", kisaKosu.length === 8, kisaKosu.length);

console.log("\n" + gecen + "/" + toplam + " geçti");
process.exit(gecen === toplam ? 0 : 1);
