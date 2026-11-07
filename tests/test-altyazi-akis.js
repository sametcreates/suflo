// Suflo testi: üç adımlı altyazı akışının saf durum makinesi (js/altyazi-akis.js, parti 4)
//  - adimDurumu: 64 girdinin (altyaziVar, uretiliyor, stilSecili, mogrtSecili, uygulandi, ae) hepsi
//  - uygulaTuru: varsayılan (stil / MOGRT seçiliyse stilli, değilse düz), hatırlanan seçim, AE'de MOGRT yok
var path = require("path");
var A = require(path.join(__dirname, "..", "js", "altyazi-akis.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }

ok("modül: ADIMLAR olustur / stil / uygula; durum metinleri bekliyor / şu an / hazır ✓",
  J(A.ADIMLAR) === J(["olustur", "stil", "uygula"]) && A.DURUM_METNI.bekliyor === "bekliyor" && A.DURUM_METNI.aktif === "şu an" && A.DURUM_METNI.tamam === "hazır ✓");
ok("Gelişmiş ayarlar hatırlanan bölümlerde değil (hiç kodla açılmaz)", A.HATIRLANAN.indexOf(A.GELISMIS) === -1 && A.GELISMIS === "cap-gelismis" &&
  J(A.HATIRLANAN) === J(["cap-ozellestir", "cap-diger-araclar", "cap-mogrt-sar"]));

/* ---------------- adimDurumu: bütün birleşimler ---------------- */
var ANAHTAR = ["altyaziVar", "uretiliyor", "stilSecili", "mogrtSecili", "uygulandi", "ae"];
var hatalar = [], tumu = 0;
for (var n = 0; n < 64; n++) {
  var d = {};
  ANAHTAR.forEach(function (k, i) { d[k] = !!(n & (1 << i)); });
  var s = A.adimDurumu(d);
  tumu++;
  // Bağımsız beklenti (kurallar düz yazıyla):
  //  stil hazır = Altyazı Efektleri görünümü seçili ya da (Premiere'de) MOGRT seçili; AE'de MOGRT sayılmaz
  //  transkript yok ya da üretiliyor → 1 şu an, 3 bekliyor, 2 stil hazırsa hazır ✓ değilse bekliyor
  //  transkript var → 1 hazır ✓; uygulandıysa 3 hazır ✓ (2 stil hazırsa ✓, değilse bekliyor: düz iz stilsiz)
  //  uygulanmadıysa: stil hazırsa 2 ✓ / 3 şu an, değilse 2 şu an / 3 bekliyor
  var stilHazir = d.stilSecili || (d.mogrtSecili && !d.ae);
  var hazir = d.altyaziVar && !d.uretiliyor;
  var b;
  if (!hazir) b = { olustur: "aktif", stil: stilHazir ? "tamam" : "bekliyor", uygula: "bekliyor" };
  else if (d.uygulandi) b = { olustur: "tamam", stil: stilHazir ? "tamam" : "bekliyor", uygula: "tamam" };
  else if (stilHazir) b = { olustur: "tamam", stil: "tamam", uygula: "aktif" };
  else b = { olustur: "tamam", stil: "aktif", uygula: "bekliyor" };
  if (J(s) !== J(b)) hatalar.push(J(d) + " → " + J(s) + " beklenen " + J(b));
  // Değişmezler
  var aktifSayisi = A.ADIMLAR.filter(function (a) { return s[a] === "aktif"; }).length;
  if (aktifSayisi > 1) hatalar.push("birden çok şu an: " + J(d));
  if (s.uygula === "tamam" && !(d.altyaziVar && d.uygulandi && !d.uretiliyor)) hatalar.push("transkriptsiz / üretimde uygulandı: " + J(d));
  if (s.uygula === "aktif" && !(d.altyaziVar && !d.uretiliyor)) hatalar.push("transkriptsiz uygula şu an: " + J(d));
  if ((s.olustur === "aktif") !== (!d.altyaziVar || d.uretiliyor)) hatalar.push("oluştur durumu: " + J(d));
  A.ADIMLAR.forEach(function (a) { if (["bekliyor", "aktif", "tamam"].indexOf(s[a]) === -1) hatalar.push("geçersiz durum " + s[a]); });
}
ok("adimDurumu: 64 birleşimin hepsi kurala uyar, en çok bir adım 'şu an'", tumu === 64 && hatalar.length === 0, hatalar.slice(0, 4).join(" | "));

ok("ilk açılış (transkript yok, varsayılan görünüm seçili): 1 şu an, 2 hazır ✓, 3 bekliyor",
  J(A.adimDurumu({ stilSecili: true })) === J({ olustur: "aktif", stil: "tamam", uygula: "bekliyor" }));
ok("transkript geldi, stil seçili: 3 şu an", J(A.adimDurumu({ altyaziVar: true, stilSecili: true })) === J({ olustur: "tamam", stil: "tamam", uygula: "aktif" }));
ok("transkript geldi, stil yok: 2 şu an", J(A.adimDurumu({ altyaziVar: true })) === J({ olustur: "tamam", stil: "aktif", uygula: "bekliyor" }));
ok("yeni transkript üretilirken eski uygulama sayılmaz", J(A.adimDurumu({ altyaziVar: true, uretiliyor: true, uygulandi: true, stilSecili: true })) ===
  J({ olustur: "aktif", stil: "tamam", uygula: "bekliyor" }));
ok("AE: MOGRT seçimi stil sayılmaz", A.adimDurumu({ altyaziVar: true, mogrtSecili: true, ae: true }).stil === "aktif" &&
  A.adimDurumu({ altyaziVar: true, mogrtSecili: true }).stil === "tamam");
ok("boş / eksik girdi: 1 şu an", J(A.adimDurumu()) === J({ olustur: "aktif", stil: "bekliyor", uygula: "bekliyor" }) && J(A.adimDurumu(null)) === J(A.adimDurumu({})));

/* ---------------- uygulaTuru ---------------- */
var T = [
  // [girdi, beklenen, açıklama]
  [{}, "duz", "hiçbir şey seçili değil → düz"],
  [{ stilSecili: true }, "stil", "Altyazı Efektleri görünümü seçili → stilli"],
  [{ mogrtSecili: true }, "stil", "MOGRT seçili → stilli"],
  [{ mogrtSecili: true, ae: true }, "duz", "AE'de MOGRT yok → düz"],
  [{ stilSecili: true, ae: true }, "stil", "AE'de efekt görünümü → stilli"],
  [{ kayitli: "duz", stilSecili: true }, "duz", "hatırlanan düz seçim stil seçiliyken de kalır"],
  [{ kayitli: "duz", mogrtSecili: true }, "duz", "hatırlanan düz, MOGRT seçili"],
  [{ kayitli: "stil", stilSecili: true }, "stil", "hatırlanan stilli"],
  [{ kayitli: "stil" }, "duz", "hatırlanan stilli ama stil yok → düz (stilli düğme kapalı olurdu)"],
  [{ kayitli: "stil", mogrtSecili: true, ae: true }, "duz", "hatırlanan stilli, AE'de yalnız MOGRT → düz"],
  [{ kayitli: "bozuk", stilSecili: true }, "stil", "geçersiz kayıt yok sayılır → varsayılan"],
  [{ kayitli: "bozuk" }, "duz", "geçersiz kayıt, stil yok → düz"]
];
T.forEach(function (t) { ok("uygulaTuru: " + t[2], A.uygulaTuru(t[0]) === t[1], A.uygulaTuru(t[0])); });
ok("uygulaTuru: girdi yok → düz", A.uygulaTuru() === "duz" && A.uygulaTuru(null) === "duz");
// Bütün birleşimler: sonuç her zaman stil | duz; stil yalnız bir stil hazırken
var tHata = [];
["", "stil", "duz", "x"].forEach(function (k) {
  for (var m = 0; m < 8; m++) {
    var g = { kayitli: k, stilSecili: !!(m & 1), mogrtSecili: !!(m & 2), ae: !!(m & 4) };
    var r = A.uygulaTuru(g);
    var hazir = g.stilSecili || (g.mogrtSecili && !g.ae);
    if (r !== "stil" && r !== "duz") tHata.push("geçersiz " + r);
    if (r === "stil" && !hazir) tHata.push("stilsiz stilli: " + J(g));
    if (k === "duz" && r !== "duz") tHata.push("düz kaydı ezildi: " + J(g));
    if (k !== "duz" && hazir && r !== "stil") tHata.push("stil hazırken düz: " + J(g));
  }
});
ok("uygulaTuru: 32 birleşimde stilli yalnız stil hazırken, düz kaydı hep korunur", tHata.length === 0, tHata.join(" | "));

console.log("\n" + gecen + "/" + toplam + " gecti");
if (gecen !== toplam) process.exit(1);
