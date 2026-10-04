// Suflo testi: js/deneme.js — Pro'yu dene: her araca 3 kalıcı hak (saf durum mantığı)
var path = require("path");
var D = require(path.join(__dirname, "..", "js", "deneme.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var LISTE = ["cut", "textcut", "highlights", "zoom", "transitions", "audioclean", "overlay", "translate", "beat"];
var KILITLI = ["mogrt", "sfx", "motionbg", "presets", "propack", "captionStyles", "batch", "assexport", "shortsPaket", "multicam", "glossary", "pro", "", "__proto__", "toString"];

/* ---------------- temel ---------------- */
ok("HAK = 3, 9 özellik (spec sırası)", D.HAK === 3 && JSON.stringify(D.OZELLIKLER) === JSON.stringify(LISTE), JSON.stringify(D.OZELLIKLER));
var b = D.bos();
ok("bos() geçerli", D.gecerliMi(b));
ok("listedeki her özellik 3 hakla başlar", LISTE.every(function (f) { return D.kalan(b, f) === 3; }));
ok("liste dışı özellikler ve içerik kütüphaneleri 0", KILITLI.every(function (f) { return D.kalan(b, f) === 0; }), KILITLI.filter(function (f) { return D.kalan(b, f) !== 0; }).join(","));
ok("her özelliğin kısa adı var", LISTE.every(function (f) { return typeof D.AD[f] === "string" && D.AD[f].length > 2; }));
D.OZELLIKLER.push("mogrt");
ok("dışa verilen liste kopya: değiştirmek kilidi açmaz", D.kalan(D.bos(), "mogrt") === 0 && D.OZELLIKLER.length === 10);

/* ---------------- harca ---------------- */
var s0 = D.bos();
var s1 = D.harca(s0, "cut");
ok("harca: 3 → 2", D.kalan(s1, "cut") === 2 && D.kalan(s1, "zoom") === 3);
ok("harca girdiyi değiştirmez", JSON.stringify(s0) === JSON.stringify(D.bos()) && D.kalan(s0, "cut") === 3, JSON.stringify(s0));
var s3 = D.harca(D.harca(s1, "cut"), "cut");
ok("üç harcamadan sonra 0", D.kalan(s3, "cut") === 0);
var s4 = D.harca(s3, "cut");
ok("harca 0'ın altına inmez (sayaç da 3'te kalır)", D.kalan(s4, "cut") === 0 && s4.kullanilan.cut === 3, JSON.stringify(s4));
var sm = D.harca(s0, "mogrt");
ok("liste dışı özelliği harcamak durumu değiştirmez", JSON.stringify(sm.kullanilan) === "{}" && D.kalan(sm, "mogrt") === 0);
ok("geçersiz duruma harca → tükenmiş (hak açılmaz)", LISTE.every(function (f) { return D.kalan(D.harca({ bozuk: 1 }, "cut"), f) === 0; }));

/* ---------------- birlestir ---------------- */
var a = { v: 1, kullanilan: { cut: 2, zoom: 1 } };
var c = { v: 1, kullanilan: { cut: 1, beat: 3 } };
var m = D.birlestir(a, c);
ok("birlestir: özellik başına harcananın büyüğü", m.kullanilan.cut === 2 && m.kullanilan.zoom === 1 && m.kullanilan.beat === 3, JSON.stringify(m));
ok("birlestir değişmeli (a,b) = (b,a)", JSON.stringify(D.ozet(D.birlestir(a, c))) === JSON.stringify(D.ozet(D.birlestir(c, a))));
ok("birlestir girdileri değiştirmez", a.kullanilan.cut === 2 && !("beat" in a.kullanilan) && c.kullanilan.cut === 1);
ok("bir depo silinse (boş) haklar geri dolmaz", D.kalan(D.birlestir(D.bos(), a), "cut") === 1 && D.kalan(D.birlestir(a, null), "cut") === 1);
ok("birlestir tükenmişle: hep 0", LISTE.every(function (f) { return D.kalan(D.birlestir(D.bos(), D.tukenmis()), f) === 0; }));
var gelecek = { v: 1, kullanilan: { cut: 1, yeniArac: 2 } };
ok("bilinmeyen (daha yeni sürüm) anahtar korunur ama hak vermez", D.gecerliMi(gelecek) && D.birlestir(gelecek, D.bos()).kullanilan.yeniArac === 2 && D.kalan(gelecek, "yeniArac") === 0);

/* ---------------- gecerliMi ---------------- */
var lisans = { key: "ABCD-1234", instanceId: "inst-1", status: "active", storeId: 454844, productId: 1302656, variantId: 1,
  email: "x@y.z", expiresAt: null, activatedAt: 1, lastValidated: 1, _sig: "deadbeef" };
ok("gecerliMi: Pro lisans biçimli nesneyi reddeder", !D.gecerliMi(lisans));
ok("gecerliMi: imza alanı (_sig) olan geçerli durum kabul", D.gecerliMi({ v: 1, kullanilan: { cut: 1 }, _sig: "x" }));
var kotuler = [null, undefined, 3, "x", [], { v: 2, kullanilan: {} }, { v: 1 }, { v: 1, kullanilan: [] }, { v: 1, kullanilan: { cut: -1 } },
  { v: 1, kullanilan: { cut: 1.5 } }, { v: 1, kullanilan: { cut: "1" } }, { v: 1, kullanilan: { cut: NaN } }, { v: 1, kullanilan: { cut: 1e9 } },
  JSON.parse('{"v":1,"kullanilan":{"__proto__":1}}'), { v: 1, kullanilan: { "a-b": 1 } }];
ok("gecerliMi: bozuk biçimler reddedilir", kotuler.every(function (x) { return !D.gecerliMi(x); }), kotuler.filter(D.gecerliMi).map(JSON.stringify).join(" | "));
ok("geçersiz durumda kalan 0 (sıfırlanmaz)", kotuler.every(function (x) { return D.kalan(x, "cut") === 0; }));
ok("tükenmiş: her özellik 0", LISTE.every(function (f) { return D.kalan(D.tukenmis(), f) === 0; }) && D.gecerliMi(D.tukenmis()));

/* ---------------- ozet + mesaj ---------------- */
var oz = D.ozet({ v: 1, kullanilan: { cut: 1, overlay: 3 } });
ok("ozet: 9 satır, kalan ve toplam", oz.ozellikler.length === 9 && oz.hak === 3 && oz.toplamKalan === 27 - 4 &&
  oz.ozellikler[0].id === "cut" && oz.ozellikler[0].kalan === 2 && oz.ozellikler[0].ad === "Otomatik kesim", JSON.stringify(oz.ozellikler[0]));
ok("harcama mesajı", D.harcamaMesaji(2) === "1 deneme hakkı kullanıldı · 2 kaldı" && /hakkın bitti/.test(D.harcamaMesaji(0)), D.harcamaMesaji(2));

/* ---------------- deneme çıktıları ---------------- */
function kayit(n, ek) {
  var k = { tur: "altyazi", sequenceId: "seq-1", sekans: "Sekans 01", start: 0, path: "/srt/suflo-altyazi-" + n + ".mov", ad: "Suflo Stil · mrbeast",
    assTemiz: "[Script Info]\n[Events]\nDialogue: 0,0:00:00.00,0:00:01.00,Suflo,,0,0,0,,Merhaba", fontFiles: ["ArchivoBlack.ttf"], g: 1920, y: 1080, fps: 25, sure: 3 };
  for (var x in ek || {}) k[x] = ek[x];
  return k;
}
ok("çıktı kaydı geçerli", D.ciktiGecerliMi(kayit(1)) && D.ciktiGecerliMi(kayit(2, { tur: "kanca", fontFiles: [] })));
var kotuKayit = [kayit(1, { tur: "srt" }), kayit(1, { path: "" }), kayit(1, { assTemiz: "x" }), kayit(1, { g: 0 }), kayit(1, { start: -1 }),
  kayit(1, { fontFiles: ["../../etc/passwd.ttf"] }), kayit(1, { fontFiles: ["/abs/Anton.ttf"] }), kayit(1, { fontFiles: ["C:\\x\\Anton.ttf"] }),
  kayit(1, { fontFiles: "Anton.ttf" }), kayit(1, { sequenceId: "" }), kayit(1, { g: 1919.5 })];
ok("çıktı kaydı: bozuk tür/yol/font adı reddedilir", kotuKayit.every(function (k) { return !D.ciktiGecerliMi(k); }), kotuKayit.filter(D.ciktiGecerliMi).map(function (k) { return JSON.stringify(k).slice(0, 60); }).join(" | "));
var liste = [];
for (var i = 0; i < 13; i++) liste = D.ciktiEkle(liste, kayit(i));
ok("çıktı listesi en yeni 10 ile sınırlı", liste.length === D.CIKTI_MAX && D.CIKTI_MAX === 10 && liste[0].path === "/srt/suflo-altyazi-3.mov" && liste[9].path === "/srt/suflo-altyazi-12.mov");
var once = JSON.stringify(liste);
var l2 = D.ciktiEkle(liste, kayit(12, { start: 5 }));
ok("aynı dosya yeniden eklenince tek kayıt (yenisi)", l2.length === 10 && l2.filter(function (k) { return k.path === "/srt/suflo-altyazi-12.mov"; }).length === 1 && l2[9].start === 5 && JSON.stringify(liste) === once);
ok("geçersiz kayıt eklenmez, listedeki bozuklar atılır", D.ciktiEkle([kayit(1), { tur: "x" }], { tur: "x" }).length === 1);
ok("ciktiSil yola göre siler", D.ciktiSil(l2, "/srt/suflo-altyazi-12.mov").length === 9 && D.ciktiSil(null, "x").length === 0);

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
