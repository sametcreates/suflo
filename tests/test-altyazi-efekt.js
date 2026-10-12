// Suflo testi: js/altyazi-efekt.js — Altyazı Efektleri oluşturucusunun saf modeli (3.3)
// Hazır görünümler, ayar doğrulama, stil motoruna giden ince ayar, eski stil kimliklerinin
// en yakın görünüme taşınması ve TranscriptAI şablonu sözleşmesi (yerel MOGRT ek yeri).
var path = require("path"), fs = require("fs");
var kok = path.join(__dirname, "..");
var AE = require(path.join(kok, "js", "altyazi-efekt.js"));
var SE = require(path.join(kok, "js", "style-engine.js"));
var SS = require(path.join(kok, "js", "style-share.js"));
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
ok("4-6 hazır görünüm, kimlikler tekil", ids.length >= 4 && ids.length <= 6 && ids.filter(function (x, i) { return ids.indexOf(x) === i; }).length === ids.length, ids.join(","));
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
  var temiz = SS.sanitizeOverrides(ov, uy);
  ok("görünüm " + g.id + ": motor çizer, paylaşım koduna uyarısız girer, yazı tipi paketten", r.eventCount > 0 && r.style.font === g.ayar.font &&
    r.style.giris === g.ayar.giris && r.style.aktif === g.ayar.aktif && uy.length === 0 && temiz.giris === g.ayar.giris && !!r.fontFiles[0], uy.join(",") + " " + r.fontFiles[0]);
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
ok("en yakınlar: Bold Box → Vurucu, Neon → Glitch, Belgesel → Zarif, Clean Pill → Temiz, Zıplayan → Canlı",
  AE.eskiGorunum("hormozi") === "vurucu" && AE.eskiGorunum("neon") === "glitch" && AE.eskiGorunum("doc") === "zarif" &&
  AE.eskiGorunum("capcut") === "temiz" && AE.eskiGorunum("ziplama") === "canli");
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
  "Lora.ttf": "Lora-Regular", "Montserrat-Bold.ttf": "Montserrat-Bold", "Montserrat-Regular.ttf": "Montserrat-Regular" };
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
var s1 = AE.surukle(tz, 31.4, 40.6), s2 = AE.surukle(tz, 52.9, 81.2), s3 = AE.surukle(tz, 47, 60), s4 = AE.surukle(tz, -10, 130), s5 = AE.surukle(tz, "a", 3);
ok("surukle: serbest nokta tam sayıya yuvarlanır, hazır konum (konum) kalır", s1.konumX === 31 && s1.konumY === 41 && s1.konum === 2 && s1.yapisti === 0, J(s1));
ok("surukle: hazır konumun ±%3 içinde yapışır (Alt: X 50 · Y 84; Orta: 50 · 62), serbest konum silinir",
  s2.konum === 2 && s2.konumX === null && s2.konumY === null && s2.yapisti === 2 && s3.konum === 5 && s3.yapisti === 5 && s3.konumX === null, J([s2, s3]));
ok("surukle: kadraj dışı %5-95'e kırpılır; sayı değilse ayar olduğu gibi", s4.konumX === 5 && s4.konumY === 95 && s5.konumX === null && s5.konum === 2, J([s4, s5]));
var serbest = Object.assign({}, tz, { konumX: 30, konumY: 40 });
ok("kaydir: ok tuşu %1 (Shift %5); hazır konumdan noktasıyla başlar; yapışmaz; kırpılır",
  J(AE.kaydir(tz, 1, 0).konumX) === "51" && AE.kaydir(tz, 1, 0).konumY === 84 && AE.kaydir(serbest, 0, -5).konumY === 35 &&
  AE.kaydir(Object.assign({}, tz, { konumX: 50, konumY: 85 }), 0, -1).konumY === 84 && AE.kaydir(Object.assign({}, tz, { konumX: 50, konumY: 85 }), 0, -1).konumX === 50 &&
  AE.kaydir(Object.assign({}, tz, { konumX: 94, konumY: 50 }), 5, 0).konumX === 95);
ok("sifirla: serbest konum silinir, hazır konum geçerli", J(AE.sifirla(serbest)) === '{"konum":2,"konumX":null,"konumY":null,"x":50,"y":84,"yapisti":2}');
ok("konumEtiketi: 'X %31 · Y %41'; yapışınca 'Alt · hazır konum'", AE.konumEtiketi(s1) === "X %31 · Y %41" && AE.konumEtiketi(s2) === "Alt · hazır konum" &&
  AE.konumEtiketi(AE.surukle(tz, 9, 86)) === "Alt sol · hazır konum" && AE.konumEtiketi(null) === "");
ok("konumNoktasi / sablonKonumu: serbest nokta ya da hazır konumun noktası (oran 0-1, Motion › Position için)",
  J(AE.konumNoktasi(serbest)) === '{"x":30,"y":40,"konum":2,"serbest":true}' && J(AE.sablonKonumu(tz)) === '{"x":0.5,"y":0.84,"serbest":false}' &&
  J(AE.sablonKonumu(serbest)) === '{"x":0.3,"y":0.4,"serbest":true}');
var kutuluAss = SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: AE.overrides(AE.gorunum("kutulu").ayar) }).ass;
ok("Kutulu görünümü motorda kutuyla, Vurucu / Zarif gölgeyle çizilir", /Style: SufloKutu,/.test(kutuluAss) && /\\3a&H59&/.test(kutuluAss) &&
  /\\4a&H26&\\shad4\.9\}/.test(SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: AE.overrides(AE.gorunum("vurucu").ayar) }).ass) &&
  /\\shad2\.1\\blur5/.test(SE.compile({ styleId: "efekt", cues: kelimeCue, cueKind: "words", width: 1920, height: 1080, overrides: AE.overrides(AE.gorunum("zarif").ayar) }).ass));

console.log("\n" + gecen + "/" + toplam + " geçti");
process.exit(gecen === toplam ? 0 : 1);
