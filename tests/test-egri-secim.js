// Suflo testi: js/egri-secim.js — Geçiş, Zoom ve Hareket önayarlarında özel eğri (3.4 adım 12): ease alanı,
// seçici listesi, yoğunlaştırma (her kare / 1 sn'den uzun parçada 2 karede bir, aynı yönlü anahtarların birleşmesi,
// çapalar), Hareket önayarı tablosu ve SufloEase'in SFC1 eğri kodu çekirdeği (sfcKodla / sfcCoz). Suflo'nun kendi kodu.
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var E = require(path.join(KOK, "js", "ease-curve.js"));
var S = require(path.join(KOK, "js", "egri-secim.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function yakin(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol); }
function artan(liste, al) { for (var i = 1; i < liste.length; i++) if (!(al(liste[i]) > al(liste[i - 1]))) return false; return true; }
function karede(t, fps) { return yakin(t * fps, Math.round(t * fps), 1e-6); }

/* ================= SFC1 eğri kodu (SufloEase.sfcKodla / sfcCoz) ================= */
var cokNokta = E.builtin("cift-yumusak").curve;
var kod = E.sfcKodla({ ad: "Benim eğrim ğüşİöç", curve: cokNokta });
var geri = E.sfcCoz(kod);
ok("SFC1: kodla → çöz gidiş dönüş (çok noktalı eğri, Türkçe ad)", /^SFC1\.[A-Za-z0-9_-]+$/.test(kod) && geri.ok && geri.tur === "egri" &&
  geri.ad === "Benim eğrim ğüşİöç" && js(geri.curve) === js(E.normalize(cokNokta)), js(geri));
ok("SFC1: yay ve Penner eğrileri de taşınır", E.sfcCoz(E.sfcKodla({ curve: { type: "spring", response: 0.5, bounce: 0.4 } })).curve.type === "spring" &&
  E.sfcCoz(E.sfcKodla({ curve: { type: "penner", name: "bounceOut" } })).curve.name === "bounceOut");
ok("SFC1: boşluk / satır sonu ve paylaşım bağlantısı yok sayılır", E.sfcCoz(kod.slice(0, 10) + " \n " + kod.slice(10)).ok &&
  E.sfcCoz("https://suflo.app/egri#" + kod).ok);
function b64(o) { return Buffer.from(JSON.stringify(o), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
var dokuzNokta = { type: "multi", pts: [] };
for (var dn = 0; dn < 9; dn++) dokuzNokta.pts.push({ x: dn / 8, y: dn / 8 });
ok("SFC1: geçersiz girdiler reddedilir (önek, bozuk base64, JSON değil, sürüm, tür, 8'den çok nokta, NaN, çok uzun)",
  E.sfcCoz("SFL1.abc").hata === "onek" && E.sfcCoz("SFC1.@@@").hata === "bozuk" && E.sfcCoz("SFC1." + Buffer.from("x{").toString("base64")).hata === "bozuk" &&
  E.sfcCoz("SFC1." + b64({ v: 2, tur: "egri", curve: cokNokta })).hata === "surum" &&
  E.sfcCoz("SFC1." + b64({ v: 1, tur: "hiz", keys: [] })).hata === "tur" &&
  E.sfcCoz("SFC1." + b64({ v: 1, tur: "egri", curve: dokuzNokta })).hata === "egri" &&
  E.sfcCoz("SFC1." + b64({ v: 1, tur: "egri", curve: { type: "bezier", x1: "NaN", y1: 0, x2: 1, y2: 1 } })).hata === "egri" &&
  E.sfcCoz("SFC1." + b64({ v: 1, tur: "egri", curve: { type: "penner", name: "__proto__" } })).hata === "egri" &&
  E.sfcCoz("SFC1." + new Array(5000).join("A")).hata === "uzun" && E.sfcCoz(42).hata === "bos" && E.sfcCoz("  ").hata === "bos");
var kirli = E.sfcCoz("SFC1." + b64({ v: 1, tur: "egri", ad: "a\u0000b\u001fc " + new Array(60).join("x"), curve: { type: "bezier", x1: 0.2, y1: 0, x2: 0.8, y2: 1 } }));
ok("SFC1: addaki denetim karakterleri atılır, ad 40 karakterde kesilir", kirli.ok && kirli.ad.indexOf("\u0000") === -1 && kirli.ad.indexOf(" ") === -1 &&
  kirli.ad.slice(0, 3) === "abc" && kirli.ad.length === 40, js(kirli.ad));
ok("SFC1: geçersiz eğri kodlanmaz", E.sfcKodla({ curve: { type: "yok" } }) === null && E.sfcKodla(null) === null);

/* ================= ease alanı ================= */
ok("coz: tanımsız / boş / 'auto' → otomatik", ["auto", "", "  ", undefined, null].every(function (e) { var c = S.coz(e); return c.ok && c.tur === "otomatik" && c.curve === null && c.ease === "auto"; }));
ok("coz: hazır eğri kimliği", S.coz("ziplama").ok && S.coz("ziplama").tur === "hazir" && S.coz("ziplama").curve.name === "bounceOut" && S.coz(" yumusak ").ease === "yumusak");
var css = S.coz("CUBIC-BEZIER(0.3,0,0.2,1)");
ok("coz: cubic-bezier metni kanonik biçime döner", css.ok && css.tur === "css" && css.ease === "cubic-bezier(0.3, 0, 0.2, 1)" && css.curve.type === "bezier", js(css));
var kc = S.coz(kod);
ok("coz: SFC1 kodu (adıyla) yeniden kodlanmış kanonik metin", kc.ok && kc.tur === "kod" && kc.ad === "Benim eğrim ğüşİöç" && kc.ease === E.sfcKodla({ ad: geri.ad, curve: geri.curve }) &&
  S.coz(kc.ease).ease === kc.ease);
ok("coz: geçersiz metin ok:false ve 'auto'ya düşer (kanonik)", !S.coz("cubic-bezier(2,0,1,1)").ok && S.coz("cubic-bezier(2,0,1,1)").hata === "css" &&
  !S.coz("dalga").ok && S.coz("dalga").hata === "gecersiz" && !S.coz(5).ok && S.kanonik("dalga") === "auto" && S.kanonik("tasma") === "tasma" &&
  S.otomatikMi("auto") && !S.otomatikMi("tasma") && S.otomatikMi("SFC1.bozuk"));
ok("egridenEase: hazır eğriyle aynıysa kimlik, bezier → CSS, diğerleri → SFC1", S.egridenEase(E.builtin("guclu-s").curve) === "guclu-s" &&
  S.egridenEase({ type: "bezier", x1: 0.1, y1: 0.2, x2: 0.3, y2: 1 }) === "cubic-bezier(0.1, 0.2, 0.3, 1)" &&
  /^SFC1\./.test(S.egridenEase({ type: "spring", response: 0.3, bounce: 0.2 }, "Yayım")) && S.egridenEase({ type: "yok" }) === null);

/* ================= seçici listesi ================= */
var kullanici = [
  { id: "u1", ad: "Kıvrak", curve: { type: "bezier", x1: 0.1, y1: 0.2, x2: 0.3, y2: 1 } },
  { id: "u2", ad: "Kopya", curve: E.builtin("yumusak").curve },           // hazır eğriyle aynı: tekrar gösterilmez
  { id: "u3", ad: "Dalga", curve: { type: "multi", pts: [{ x: 0, y: 0 }, { x: 0.5, y: 0.8 }, { x: 1, y: 1 }] } }
];
var sec = S.secenekler({ dil: "en", kullanici: kullanici, duzenleyici: { type: "bezier", x1: 0.5, y1: 0, x2: 0.5, y2: 1 } });
ok("secenekler: Otomatik başta, sonra Eğri sekmesindeki eğri, 15 hazır eğri (arayüz dilinde), kullanıcı önayarları (tekrarsız)",
  sec[0].ease === "auto" && sec[0].adCevrilir && sec[1].tur === "duzenleyici" && sec[1].ease === "cubic-bezier(0.5, 0, 0.5, 1)" &&
  sec.filter(function (o) { return o.tur === "hazir"; }).length === 15 && sec.filter(function (o) { return o.tur === "hazir"; })[1].ad === "Ease" &&
  sec.filter(function (o) { return o.tur === "kullanici"; }).map(function (o) { return o.ad; }).join(",") === "Kıvrak,Dalga" &&
  /^SFC1\./.test(sec[sec.length - 1].ease) && sec.every(function (o) { return S.coz(o.ease).ok; }), js(sec.map(function (o) { return o.ad; })));
var secTr = S.secenekler({ dil: "tr", duzenleyici: E.builtin("tasma").curve });
ok("secenekler: Eğri sekmesindeki eğri hazır eğriyle aynıysa ayrı kart yok; Türkçe adlar", secTr.length === 16 && secTr[2].ad === "Yumuşak" &&
  !secTr.some(function (o) { return o.tur === "duzenleyici"; }));
ok("bul: listedeki kart; listede olmayan kod / CSS / geçersiz", S.bul("ziplama", sec).tur === "hazir" && S.bul("auto", []).ad === "Otomatik" &&
  S.bul(kod, []).ad === "Benim eğrim ğüşİöç" && S.bul("cubic-bezier(0.2,0,0.2,1)", []).ad === "cubic-bezier(0.2, 0, 0.2, 1)" &&
  S.bul(E.sfcKodla({ curve: cokNokta }), []).ad === "Özel eğri" && S.bul("dalga", sec) === null);

/* ================= yoğunlaştırma ================= */
var ease = E.builtin("yumusak-giris-cikis").curve;
// tek parça: uçlar aynen, iç anahtarlar her karede, uçlardan yarım kare içeride
var tek = S.yogunlastir([{ t: 0, v: 1 }, { t: 0.5, v: 2 }], { curve: ease, fps: 24 });
ok("yogunlastir: uçlar seyrek plandakiyle aynı ve çapa (a: 1); iç anahtarlar her karede (0,5 sn · 24 kare → 11)",
  tek.keys.length === 13 && tek.keys[0].t === 0 && tek.keys[0].v === 1 && tek.keys[0].a === 1 && tek.keys[12].t === 0.5 && tek.keys[12].v === 2 && tek.keys[12].a === 1 &&
  tek.keys.slice(1, 12).every(function (k) { return !k.a && karede(k.t, 24); }) && artan(tek.keys, function (k) { return k.t; }) && tek.eklenen === 11 && !tek.capped, js(tek.keys.length));
var f = E.toFunction(ease);
ok("yogunlastir: değerler eğrinin kendisi", tek.keys.slice(1, 12).every(function (k) { return yakin(k.v, 1 + f(k.t / 0.5), 1e-5); }));
var uzun = S.yogunlastir([{ t: 0, v: 0 }, { t: 1.5, v: 1 }], { curve: ease, fps: 30 });
ok("yogunlastir: 1 sn'den uzun parça 2 karede bir", uzun.keys.length === 2 + 22 && uzun.keys.slice(1, -1).every(function (k) { return yakin(k.t * 30 % 2, 0, 1e-6); }), uzun.keys.length);
var sinir = S.yogunlastir([{ t: 0, v: 0 }, { t: 1, v: 1 }], { curve: ease, fps: 30 });
ok("yogunlastir: tam 1 sn parça her karede", sinir.keys.length === 2 + 29, sinir.keys.length);
// aynı yönlü ardışık anahtarlar tek parça (Zoom İçeri: 1 → 1,18 → 1,55); yön değiştiren anahtar (taşma) korunur
var zi = S.yogunlastir([{ t: -0.25, v: 1 }, { t: -0.0875, v: 1.18 }, { t: 0, v: 1.55 }], { curve: ease, fps: 25 });
ok("yogunlastir: aynı yönlü ara anahtar birleşir (Suflo'nun ivme biçiminin yerini eğri alır)", zi.keys.filter(function (k) { return k.a; }).length === 2 &&
  zi.keys.every(function (k) { return Math.abs(k.v - 1.18) > 1e-9 || !k.a; }), js(zi.keys));
var tasma = S.yogunlastir([{ t: 0, v: 1.4 }, { t: 0.15, v: 0.985 }, { t: 0.25, v: 1 }], { curve: ease, fps: 30 });
ok("yogunlastir: yön değiştiren anahtar (taşma tepe noktası) çapa olarak korunur", tasma.keys.filter(function (k) { return k.a; }).map(function (k) { return k.v; }).join(",") === "1.4,0.985,1", js(tasma.keys));
var birlesmesin = S.yogunlastir([{ t: -0.25, v: 1 }, { t: -0.0875, v: 1.18 }, { t: 0, v: 1.55 }], { curve: ease, fps: 25, birlestir: false });
ok("yogunlastir: birlestir:false her seyrek anahtarı korur", birlesmesin.keys.filter(function (k) { return k.a; }).length === 3);
var duz = S.yogunlastir([{ t: 0, v: 1.05 }, { t: 0.36, v: 1.05 }, { t: 0.45, v: 1 }], { curve: ease, fps: 30 });
ok("yogunlastir: değeri değişmeyen parça yoğunlaştırılmaz; duruş → kalkış anı çapa", duz.keys.filter(function (k) { return k.a; }).length === 3 &&
  duz.keys.filter(function (k) { return k.t > 0 && k.t < 0.36; }).length === 0, js(duz.keys));
// [x, y]: bir bileşen yön değiştirirse anahtar kalır
var xy = S.yogunlastir([{ t: 0, v: [0, 0] }, { t: 0.2, v: [0.5, 0.1] }, { t: 0.4, v: [1, 0] }], { curve: ease, fps: 30 });
ok("yogunlastir: [x, y] — y yön değiştirince ara anahtar korunur; değerler 2 bileşenli", xy.keys.filter(function (k) { return k.a; }).length === 3 &&
  xy.keys.every(function (k) { return Array.isArray(k.v) && k.v.length === 2; }));
var xyAyni = S.yogunlastir([{ t: 0, v: [0, 0] }, { t: 0.2, v: [0.5, 0] }, { t: 0.4, v: [1, 0] }], { curve: ease, fps: 30 });
ok("yogunlastir: [x, y] — iki bileşen de aynı yönde (y sabit) → birleşir", xyAyni.keys.filter(function (k) { return k.a; }).length === 2);
var op = S.yogunlastir([{ t: 0, v: 0 }, { t: 0.5, v: 1 }], { curve: E.builtin("tasma").curve, fps: 30, clampMin: 0, clampMax: 1 });
ok("yogunlastir: clampMin/clampMax (Opaklık çarpanı 0..1; Taşma aşamaz)", op.keys.every(function (k) { return k.v >= 0 && k.v <= 1; }) && op.keys.some(function (k) { return !k.a && k.v === 1; }));
// sınır: toplam ara anahtar 2000'i aşarsa adım ikiye katlanır
var cok = [], cv = 1;
for (var ci = 0; ci < 120; ci++) { cok.push({ t: ci * 1, v: cv }); cok.push({ t: ci * 1 + 0.9, v: cv === 1 ? 1.2 : 1 }); cv = cv === 1 ? 1.2 : 1; }
var kesik = S.yogunlastir(cok, { curve: ease, fps: 60 });
// 120 hareket × 0,9 sn × 60 kare ≈ 6360 ara anahtar → adım 4 karede bir (1560)
ok("yogunlastir: 2000 ara anahtar sınırı aşılınca adım katlanır (capped)", kesik.capped && kesik.carpan === 4 && kesik.eklenen <= 2000 && kesik.eklenen > 1000 &&
  artan(kesik.keys, function (k) { return k.t; }), js({ e: kesik.eklenen, c: kesik.carpan }));
ok("yogunlastir: maxKeys seçeneği (parça başına en az bir ara anahtar kalır)", S.yogunlastir(cok, { curve: ease, fps: 60, maxKeys: 500 }).eklenen <= 500 &&
  S.yogunlastir(cok, { curve: ease, fps: 60, maxKeys: 10 }).eklenen >= 120 && S.yogunlastir(cok, { curve: ease, fps: 60, maxKeys: 10 }).eklenen <= 240);
ok("yogunlastir: geçersiz eğri / bozuk girdi → anahtarlar olduğu gibi (çapa), ekleme yok",
  S.yogunlastir([{ t: 0, v: 0 }, { t: 1, v: 1 }], { curve: { type: "yok" } }).eklenen === 0 &&
  S.yogunlastir([{ t: 1, v: 0 }, { t: 0, v: 1 }], { curve: ease }).keys.length === 0 &&
  S.yogunlastir([{ t: 0, v: 0 }, { t: 1, v: [1, 2] }], { curve: ease }).keys.length === 0 && S.yogunlastir(null, { curve: ease }).keys.length === 0);
ok("yogunlastir: fps yoksa 30", S.yogunlastir([{ t: 0, v: 0 }, { t: 0.5, v: 1 }], { curve: ease }).eklenen === 14);
var zt = S.yogunZaman([{ time: 0, value: 1 }, { time: 0.4, value: 1.12 }], { curve: ease, fps: 25 });
ok("yogunZaman: { time, value, a? } biçimi korunur", zt.keys.length === 11 && zt.keys[0].a === 1 && zt.keys[0].time === 0 && zt.keys[10].value === 1.12 &&
  zt.keys.every(function (k) { return "time" in k && "value" in k && !("t" in k); }));
var pxy = S.yogunXY([{ t: 0, x: 1.05, y: 0 }, { t: 0.25, x: 0, y: 0 }], { curve: ease, fps: 30 });
ok("yogunXY: { t, x, y, a? } biçimi", pxy.keys[0].a === 1 && pxy.keys[0].x === 1.05 && pxy.keys.every(function (k) { return "x" in k && "y" in k && !("v" in k); }) && pxy.keys.length === 2 + 6);
ok("ayna: Yumuşak çıkış'ın aynası Yumuşak giriş", js(S.ayna(E.builtin("yumusak-cikis").curve)) === js(E.builtin("yumusak-giris").curve));

/* ================= Hareket önayarı tablosu ve süre ================= */
var hm = S.hareketEgrisi("sert-cikis");
ok("hareketEgrisi: 241 değer, uçlar 0 ve 1, eğriyle aynı; otomatik / geçersizde null", hm.ease === "sert-cikis" && hm.tablo.length === 241 && hm.tablo[0] === 0 &&
  hm.tablo[240] === 1 && yakin(hm.tablo[120], E.toFunction(E.builtin("sert-cikis").curve)(0.5), 1e-6) && S.hareketEgrisi("auto") === null && S.hareketEgrisi("dalga") === null);
ok("cagriSuresi: taban + anahtar başına 50 ms (Eğri sekmesinin KS_easeBake payı), en çok 10 dk", S.ANAHTAR_MS === 50 && S.cagriSuresi(30000, 400) === 50000 &&
  S.cagriSuresi(30000, 1e9) === 600000 && S.cagriSuresi(60000, 0) === 60000 && S.cagriSuresi(30000, -5) === 30000);
// Hareket önayarı: üst sınır seçili klip sayısıyla, önayar süresiyle ve kare hızıyla büyür (inceleme: 60 sn sabitti)
ok("hareketAnahtari: klip × 2 özellik × (ceil(süre × fps) + 5)", S.hareketAnahtari({ klip: 30, sure: 1.5, fps: 59.94 }) === 30 * 2 * (90 + 5) &&
  S.hareketAnahtari({ klip: 1, sure: 0.45, fps: 25 }) === 2 * (12 + 5) && S.hareketAnahtari({ klip: 2, sure: 1, fps: 30 }) === 2 * 2 * (30 + 5),
  js([S.hareketAnahtari({ klip: 30, sure: 1.5, fps: 59.94 }), S.hareketAnahtari({ klip: 1, sure: 0.45, fps: 25 })]));
ok("hareketAnahtari: klip yok / 0 / bozuk → 1; fps yok → 30; süre host'taki gibi (0,18–1,5 dışı 0,45)",
  S.hareketAnahtari({ sure: 1, fps: 30 }) === S.hareketAnahtari({ klip: 0, sure: 1, fps: 30 }) && S.hareketAnahtari({ klip: "x", sure: 1, fps: 30 }) === 70 &&
  S.hareketAnahtari({ klip: 1, sure: 1 }) === 70 && S.hareketAnahtari({ klip: 1, sure: 3, fps: 30 }) === S.hareketAnahtari({ klip: 1, sure: 0.45, fps: 30 }) &&
  S.hareketAnahtari({ klip: 1, sure: 0.1, fps: 30 }) === S.hareketAnahtari({ klip: 1, sure: 0.45, fps: 30 }) && S.hareketAnahtari() === 2 * (14 + 5));
ok("cagriSuresi + hareketAnahtari: 30 klip, 1,5 sn, 59,94 kare/sn → 60 sn'nin çok üstünde (30 sn + 5700 × 50 ms)",
  S.cagriSuresi(30000, S.hareketAnahtari({ klip: 30, sure: 1.5, fps: 59.94 })) === 30000 + 5700 * 50 && S.HAREKET_EN_COK === 6000);

/* ================= temiz oda ================= */
var src = fs.readFileSync(path.join(KOK, "js", "egri-secim.js"), "utf8");
ok("temiz oda: lisanssız kaynağın adı / sözdizimi yok", !new RegExp("open" + "curve", "i").test(src));

console.log(gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
