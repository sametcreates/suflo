// Suflo testi: js/marka-kiti-ui.js — Ayarlar › Marka Kiti kartı (sahte DOM + sahte K, vm)
var fs = require("fs"), path = require("path"), vm = require("vm"), os = require("os");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }

var kok = path.join(__dirname, "..");
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-mk-ui-"));
var logo = path.join(tmp, "marka logo.png");
fs.writeFileSync(logo, Buffer.from("89504e470d0a1a0a", "hex"));

var DOM = {}, dinleyici = {};
function elem(id, ek) {
  var e = { id: id, value: "", checked: false, hidden: false, disabled: false, textContent: "", title: "", className: "",
    addEventListener: function (olay, fn) { (dinleyici[id + ":" + olay] = dinleyici[id + ":" + olay] || []).push(fn); } };
  for (var k in ek || {}) e[k] = ek[k];
  DOM[id] = e;
}
["grp-marka-kiti", "mk-acik", "mk-font", "mk-konum", "mk-renk-acik", "mk-renk", "mk-renk-kontur", "mk-renk-vurgu", "mk-logo-ad", "mk-logo-sec",
  "mk-logo-kaldir", "mk-logo-kose", "mk-logo-oran", "mk-logo-oran-deger", "mk-doldur", "mk-durum", "mk-konum-xy", "mk-gorunum"].forEach(function (id) { elem(id); });
function tetikle(id, olay) { (dinleyici[id + ":" + olay] || []).forEach(function (f) { f(); }); }

var ayarlar = { markaKiti: { on: true, stil: { overrides: { font: "Lora", renk: "#FF0000", konum: 8 } }, logo: { kose: "as", oran: 0.2 }, cta: { metin: "Abone ol" } } };
var kayit = 0, olaylar = [], kancaYenile = 0, dialogSonuc = null;
var altyaziStili = { aile: "neon", font: "Bebas Neue", renk: "#F4FBFF", konturRenk: "#0b1020", vurguRenk: "#2af5ff", konum: 5 };
var window_ = {
  SufloStyleShare: require(path.join(kok, "js", "style-share.js")),
  SufloMarkaKiti: require(path.join(kok, "js", "marka-kiti.js")),
  SufloStyleEngine: require(path.join(kok, "js", "style-engine.js")),
  SufloHookTitle: require(path.join(kok, "js", "hook-title.js")),
  KKanca: { kitDegisti: function () { kancaYenile++; } },
  KCaptions: { stilAyarlari: function () { return altyaziStili; } },
  cep: { fs: { showOpenDialogEx: function () { return dialogSonuc; } } }
};
var ctx = {
  window: window_, document: { getElementById: function (id) { return DOM[id] || null; }, dispatchEvent: function (e) { olaylar.push(e); } },
  CustomEvent: function (ad, o) { this.type = ad; this.detail = o && o.detail; },
  K: { settings: function () { return ayarlar; }, saveSettings: function () { kayit++; }, fs: fs },
  JSON: JSON, Object: Object, Math: Math, Number: Number, String: String
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(kok, "js", "marka-kiti-ui.js"), "utf8"), ctx);
var UI = window_.KMarkaKiti;
UI.init();

ok("kayıttaki kit alanlara dolar", DOM["mk-acik"].checked && DOM["mk-font"].value === "Lora" && DOM["mk-konum"].value === "8" &&
  DOM["mk-renk-acik"].checked && DOM["mk-renk"].value === "#ff0000" && DOM["mk-logo-kose"].value === "as" && DOM["mk-logo-oran"].value === "20" &&
  DOM["mk-logo-oran-deger"].textContent === "%20", JSON.stringify([DOM["mk-font"].value, DOM["mk-renk"].value, DOM["mk-logo-oran-deger"].textContent]));
ok("logo yoksa ad boş, Kaldır gizli", DOM["mk-logo-ad"].textContent === "" && DOM["mk-logo-kaldir"].hidden === true);

// renkleri kapat → kitten renkler çıkar, konum "stilin kendi"
DOM["mk-renk-acik"].checked = false; DOM["mk-konum"].value = "";
tetikle("mk-renk-acik", "change");
var k1 = ayarlar.markaKiti;
ok("renkler kapalı: kitte renk yok, konum stilin kendi", !k1.stil.overrides.renk && k1.stil.overrides.konum === undefined && k1.stil.overrides.font === "Lora" && k1.stil.overrides.fontFile === "Lora.ttf", JSON.stringify(k1.stil));
ok("renk kutuları kapanır", DOM["mk-renk"].disabled && DOM["mk-renk-vurgu"].disabled);
ok("kaydedildi, olay yayıldı, kanca tazelendi", kayit >= 1 && olaylar.length >= 1 && olaylar[0].type === "suflo:markaKiti" && kancaYenile >= 1);
ok("kitin cta alanı (8. adım) korunur", k1.cta.metin === "Abone ol");

// logo seç
dialogSonuc = { data: [logo] };
tetikle("mk-logo-sec", "click");
ok("logo seçilir, ad gösterilir", ayarlar.markaKiti.logo.path === logo && DOM["mk-logo-ad"].textContent === "marka logo.png" && DOM["mk-logo-kaldir"].hidden === false, DOM["mk-logo-ad"].textContent);
dialogSonuc = { data: [path.join(tmp, "x.gif")] };
tetikle("mk-logo-sec", "click");
ok("gif reddedilir, eski logo kalır", ayarlar.markaKiti.logo.path === logo && /PNG ya da JPG/.test(DOM["mk-durum"].textContent), DOM["mk-durum"].textContent);
dialogSonuc = { data: [path.join(tmp, "yok.png")] };
tetikle("mk-logo-sec", "click");
ok("olmayan dosya reddedilir", ayarlar.markaKiti.logo.path === logo && /okunamadı/.test(DOM["mk-durum"].textContent));
dialogSonuc = null;
tetikle("mk-logo-sec", "click");
ok("iptal: değişiklik yok", ayarlar.markaKiti.logo.path === logo);

// oran kaydırıcısı
DOM["mk-logo-oran"].value = "9";
tetikle("mk-logo-oran", "input");
tetikle("mk-logo-oran", "change");
ok("oran %9 → 0.09", ayarlar.markaKiti.logo.oran === 0.09 && DOM["mk-logo-oran-deger"].textContent === "%9");

tetikle("mk-logo-kaldir", "click");
ok("logo kaldırılır", ayarlar.markaKiti.logo.path === "" && DOM["mk-logo-kaldir"].hidden === true);

// şimdiki ayarlardan doldur (konum seçili değil → konum alınmaz)
tetikle("mk-doldur", "click");
var k2 = ayarlar.markaKiti;
ok("şimdiki ayarlardan: yazı tipi + renkler, stil kimliği", k2.stil.overrides.font === "Bebas Neue" && k2.stil.overrides.renk === "#f4fbff" && k2.stil.id === "neon" &&
  k2.stil.overrides.konum === undefined && DOM["mk-renk-acik"].checked && DOM["mk-font"].value === "Bebas Neue", JSON.stringify(k2.stil));
ok("açık kit doldurulunca iyi haber", /kite alındı/.test(DOM["mk-durum"].textContent), DOM["mk-durum"].textContent);

// kapat
DOM["mk-acik"].checked = false;
tetikle("mk-acik", "change");
ok("kapatılınca on:false ve olayda bildirilir", ayarlar.markaKiti.on === false && olaylar[olaylar.length - 1].detail.on === false);

// eksik logo dosyası uyarısı (init)
ayarlar.markaKiti.logo.path = path.join(tmp, "silinmis.png");
UI.init();
ok("kayıtlı logo silinmişse uyarı", /bulunamadı/.test(DOM["mk-durum"].textContent), DOM["mk-durum"].textContent);

// 3.3 adım 17: kitte serbest konum, gölge ve arka plan kutusu
ayarlar.markaKiti = { on: true, stil: { overrides: { font: "Lora", konum: 2, konumX: 30, konumY: 70, golge: { renk: "#112233", opak: 60, mesafe: 4, yumusak: 8 },
  kutu: true, kutuRenk: "#000000", kutuOpak: 55 } } };
UI.init();
ok("kitteki serbest konum 'Serbest konum' seçeneğiyle görünür, gölge / kutu anahtarı açık", DOM["mk-konum"].value === "xy" && DOM["mk-konum-xy"].hidden === false &&
  DOM["mk-gorunum"].checked === true, DOM["mk-konum"].value);
DOM["mk-renk-acik"].checked = true;
tetikle("mk-renk-acik", "change");
var k17 = ayarlar.markaKiti.stil.overrides;
ok("başka alan değişince serbest konum, gölge ve kutu kitte kalır (kaydedilir)", k17.konumX === 30 && k17.konumY === 70 && k17.konum === 2 &&
  k17.golge && k17.golge.opak === 60 && k17.kutu === true && k17.kutuOpak === 55 && k17.renk === DOM["mk-renk"].value.toLowerCase(), JSON.stringify(k17));
DOM["mk-konum"].value = "8";
tetikle("mk-konum", "change");
ok("hazır konum seçilince kitin serbest konumu bırakılır", ayarlar.markaKiti.stil.overrides.konum === 8 && ayarlar.markaKiti.stil.overrides.konumX === undefined);
DOM["mk-gorunum"].checked = false;
tetikle("mk-gorunum", "change");
ok("anahtar kapanınca gölge ve kutu kitten çıkar", ["golge", "kutu", "kutuRenk", "kutuOpak"].every(function (k) { return ayarlar.markaKiti.stil.overrides[k] === undefined; }));
altyaziStili = { aile: "efekt", font: "Anton", renk: "#ffffff", konturRenk: "#000000", vurguRenk: "#ffe600", konum: 5, konumX: 44, konumY: 55,
  golge: { renk: "#000000", opak: 85, mesafe: 7, yumusak: 0 }, kutu: false, kutuRenk: "#000000", kutuOpak: 50 };
DOM["mk-gorunum"].checked = true;
tetikle("mk-gorunum", "change");
ok("anahtar açılınca gölge ve kutu Altyazı sekmesinden alınır", JSON.stringify(ayarlar.markaKiti.stil.overrides.golge) === '{"renk":"#000000","opak":85,"mesafe":7,"yumusak":0}' &&
  ayarlar.markaKiti.stil.overrides.kutu === false, JSON.stringify(ayarlar.markaKiti.stil.overrides));
tetikle("mk-doldur", "click");
ok("şimdiki ayarlardan doldur (konum seçili): Altyazı sekmesindeki serbest konum kite girer, 'Serbest konum' seçilir",
  ayarlar.markaKiti.stil.overrides.konumX === 44 && ayarlar.markaKiti.stil.overrides.konumY === 55 && ayarlar.markaKiti.stil.overrides.konum === 5 &&
  DOM["mk-konum"].value === "xy" && DOM["mk-konum-xy"].hidden === false && ayarlar.markaKiti.stil.overrides.golge.opak === 85, JSON.stringify(ayarlar.markaKiti.stil.overrides));

/*
 * 3.3 adım 17 inceleme: "Serbest konum" seçeneği seçili kalıp kitte serbest konum yokken kart onu söylememeli.
 * Kit {Alt, X 30 · Y 70} → Üst kaydedilir → "Serbest konum" yeniden seçilir: kitin serbest konumu geri gelir
 * (eskiden kit {konum: 8} kalıyordu, seçici "Serbest konum" diyordu).
 */
ayarlar.markaKiti = { on: true, stil: { overrides: { font: "Lora", konum: 2, konumX: 30, konumY: 70 } } };
UI.init();
DOM["mk-konum"].value = "8";
tetikle("mk-konum", "change");
var ustKit = JSON.parse(JSON.stringify(ayarlar.markaKiti.stil.overrides));
ok("Üst seçilince kitte hazır konum; 'Serbest konum' seçeneği geri dönülebilsin diye görünür kalır",
  ustKit.konum === 8 && ustKit.konumX === undefined && DOM["mk-konum-xy"].hidden === false, JSON.stringify(ustKit));
DOM["mk-konum"].value = "xy";
tetikle("mk-konum", "change");
var xyKit = ayarlar.markaKiti.stil.overrides;
ok("'Serbest konum' yeniden seçilince kitin son serbest konumu geri gelir (seçili ama boş kalmaz)",
  xyKit.konumX === 30 && xyKit.konumY === 70 && xyKit.konum === 2 && DOM["mk-konum"].value === "xy", JSON.stringify(xyKit));
// Serbest konumu hiç olmamış kitte "xy" seçili kalamaz: seçici kitin gerçek konumunu gösterir
ayarlar.markaKiti = { on: true, stil: { overrides: { font: "Lora", konum: 8 } } };
UI.init();
DOM["mk-konum"].value = "xy";
tetikle("mk-konum", "change");
ok("serbest konumu olmayan kitte 'Serbest konum' seçili kalmaz: kitin hazır konumu (Üst) korunur ve seçicide görünür, seçenek gizli",
  DOM["mk-konum"].value === "8" && DOM["mk-konum-xy"].hidden === true && ayarlar.markaKiti.stil.overrides.konum === 8 &&
  ayarlar.markaKiti.stil.overrides.konumX === undefined, DOM["mk-konum"].value + " " + JSON.stringify(ayarlar.markaKiti.stil.overrides));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
console.log("\n" + gecen + "/" + toplam + " geçti");
process.exit(gecen === toplam ? 0 : 1);
