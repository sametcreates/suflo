// Suflo testi: 3.4 adım 20 — Araç ara (Ctrl+K / ⌘K komut paleti)
//  - js/arac-ara.js saf modülü: Türkçe katlama, puanlama ve sıralama, kayıt, favori / son kullanılan kalıcılığı
//    (bozuk depo yok sayılır), kısayol, yazı alanı ayrımı, CEP tuş ilgisi birleştirme
//  - kayıt gerçek index.html'in sol menüsünden kurulur; eylemlerin hedef düğmeleri markup'ta var
//  - js/app.js'teki ince arayüz katmanı (GERÇEK kod kesilip sahte DOM ile çalıştırılır): aç, ara, ↑↓, Enter,
//    Esc, yıldız, eylemin düğmesine gitme, gizli düğmede ipucu, Pro rozeti
//  - captions.js'in önizleme sahnesi tuş ilgisi araç aramanın Ctrl+K ilgisini silmez
var fs = require("fs"), path = require("path");
var KOK = path.join(__dirname, "..");
var AA = require(path.join(KOK, "js", "arac-ara.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function J(x) { return JSON.stringify(x); }
var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");
var appSrc = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8").replace(/\r\n/g, "\n");
var capSrc = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8").replace(/\r\n/g, "\n");

/* ---------------- Türkçe katlama ---------------- */

ok("katla: ş→s, ı/İ/I→i, ğ→g, ç→c, ö→o, ü→u, â/î/û; büyük harf küçülür", AA.katla("ŞşİIıiĞğÇçÖöÜüÂâÎîÛû") === "ssiiiiggccoouuaaiiuu", AA.katla("ŞşİIıiĞğÇçÖöÜüÂâÎîÛû"));
ok("katla: uzunluk korunur (İ'nin toLowerCase'i iki karakterdir; burada tek), harf/rakam dışı boşluk",
  AA.katla("İstanbul › 4K").length === "İstanbul › 4K".length && AA.katla("İstanbul › 4K") === "istanbul   4k", J(AA.katla("İstanbul › 4K")));
ok("katla: diğer Latin aksanları (é, ñ, ə) da sadeleşir", AA.katla("Éñə") === "ene");
ok("sade: boşluklar teke iner, kenarlar kırpılır", AA.sade("  Hız   Rampası · ") === "hiz rampasi");

/* ---------------- gerçek sol menüden kayıt ---------------- */

// index.html'deki .yan-menu girdileri (app.js aramaKaydi'nin DOM'dan okuduğunun aynısı)
function navlariOku(src) {
  var out = [], re = /<button class="ky-oge[^"]*" data-tab="([^"]+)"(?: data-kat="([^"]+)")?>([\s\S]*?)<\/button>/g, m;
  while ((m = re.exec(src))) {
    var b = /<b>([\s\S]*?)<\/b>/.exec(m[3]), i = /<i>([\s\S]*?)<\/i>/.exec(m[3]);
    out.push({ tab: m[1], kat: m[2] || "", ad: b ? b[1].replace(/<em[^>]*>[\s\S]*?<\/em>/g, "").trim() : "", alt: i ? i[1].trim() : "", pro: /data-kilit/.test(m[3]) });
  }
  return out;
}
var yanMenu = html.slice(html.indexOf('<aside class="yan-menu"'), html.indexOf("</aside>"));
var navlar = navlariOku(yanMenu);
var sekmeler = {};
(html.match(/id="tab-[a-z-]+"/g) || []).forEach(function (x) { sekmeler[x.slice(8, -1)] = true; });
var kayit = AA.kayitKur(navlar, { mevcut: function (e) { return !!sekmeler[e.tab]; } });
var kim = {};
kayit.forEach(function (o) { kim[o.id] = o; });
ok("kayıt: sol menünün her girdisi bir araç (Altyazı, Otomatik Kesim, Hız Rampası, Yazı Animasyonları, Ayarlar…)",
  navlar.length >= 18 && !!kim["tab:captions"] && !!kim["tab:cut"] && !!kim["tab:hiz"] && !!kim["tab:text/mogrt"] && !!kim["tab:settings"] &&
  kayit.filter(function (o) { return o.tur === "arac"; }).length === navlar.length, navlar.length + " girdi");
ok("kayıt: 'YENİ' rozeti ada karışmaz, alt yazı ve PRO kilidi okunur", kim["tab:cut"].ad === "Otomatik Kesim" && kim["tab:cut"].alt === "sessizlik · konuşma · dolgu" &&
  kim["tab:cut"].pro === true && kim["tab:captions"].pro === false && kim["tab:hiz"].ad === "Hız Rampası", J(kim["tab:cut"]));
ok("kayıt: aynı sekmenin farklı kategorileri ayrı (Yazı Animasyonları / Altyazı Şablonları / Favoriler)",
  kim["tab:text/mogrt"].kat === "mogrt" && kim["tab:text/captions"].ad === "Altyazı Şablonları" && kim["tab:text/fav"].ad === "Favoriler");
ok("kayıt: eylemler sekmenin adını alt yazı olarak alır, Pro anahtarı taşır", kim["eylem:sessizlik-bul"].alt === "Otomatik Kesim" &&
  kim["eylem:rampa-uygula"].pro === "speedramp" && kim["eylem:ayar-motor"].alt === "Ayarlar" && kim["eylem:altyazi-olustur"].pro === "");
ok("kayıt: sekmesi bu sürümde olmayan eylem (Eğri) listelenmez; sekme gelince listelenir",
  !sekmeler.egri ? !kim["eylem:egri-uygula"] && !!AA.kayitKur(navlar, { mevcut: function () { return true; } }).filter(function (o) { return o.id === "eylem:egri-uygula"; }).length : !!kim["eylem:egri-uygula"]);
ok("kayıt: aynı kimlik iki kez girmez (Ayarlar hem üst çubukta hem menüde)", AA.kayitKur([{ tab: "settings", ad: "Ayarlar" }, { tab: "settings", ad: "Ayarlar" }]).filter(function (o) { return o.tur === "arac"; }).length === 1);
ok("temizAd: sondaki YENİ / NEW / PRO atılır", AA.temizAd("Geçişler  YENİ") === "Geçişler" && AA.temizAd("Transitions NEW PRO") === "Transitions" && AA.temizAd("Proje") === "Proje");

// Eylemlerin hedefleri gerçekten var (sekmesi olmayan Eğri hariç)
var eksikHedef = [];
AA.EYLEMLER.forEach(function (e) {
  if (!sekmeler[e.tab]) { if (e.tab !== "egri") eksikHedef.push(e.id + " → #tab-" + e.tab); return; }
  if (!e.hedef.length || !e.hedef.some(function (id) { return html.indexOf('id="' + id + '"') !== -1; })) eksikHedef.push(e.id + " → " + e.hedef.join("|"));
});
ok("her eylemin sekmesi ve hedef düğmesi index.html'de (Eğri yalnız sekmesi gelince)", eksikHedef.length === 0, eksikHedef.join(" · ") || AA.EYLEMLER.length + " eylem");
var disarda = AA.EYLEMLER.filter(function (e) {
  if (!sekmeler[e.tab]) return false;
  var bas = html.indexOf('<section id="tab-' + e.tab + '"'), son = html.indexOf('<section id="tab-', bas + 5);
  if (son < 0) son = html.indexOf("</main>");
  return !e.hedef.some(function (id) { var i = html.indexOf('id="' + id + '"'); return i > bas && i < son; });
}).map(function (e) { return e.id; });
ok("eylem hedefi sekmesinin içinde (ör. #cut-analyze #tab-cut'ta)", disarda.length === 0, disarda.join(", "));
var proSrc = fs.readFileSync(path.join(KOK, "js", "pro.js"), "utf8");
ok("eylemlerin Pro anahtarları pro.js'te tanımlı", AA.EYLEMLER.every(function (e) { return !e.pro || new RegExp("\\n\\s+" + e.pro + ":\\s+'").test(proSrc); }));
ok("plan örnekleri listede: Altyazı oluştur, Sessizlikleri bul, Rampayı uygula, Eğri uygula, Ayarlar › Motor",
  ["Altyazı oluştur", "Sessizlikleri bul", "Rampayı uygula", "Eğri uygula", "Ayarlar › Motor"].every(function (a) { return AA.EYLEMLER.some(function (e) { return e.ad === a; }); }));

/* ---------------- arama ve sıralama ---------------- */

function ilk(q, d) { var r = AA.ara(kayit, q, d || null); return r.length ? r[0].oge.ad : ""; }
function adlar(q, n, d) { return AA.ara(kayit, q, d || null).slice(0, n || 5).map(function (r) { return r.oge.ad; }); }
ok("'sessizlik' → 'Sessizlikleri bul' (ilk sırada)", ilk("sessizlik") === "Sessizlikleri bul", J(adlar("sessizlik")));
ok("aksan ve büyük harf duyarsız: SESSİZLİK, sessızlık, sessızlık → 'Sessizlikleri bul'",
  ilk("SESSİZLİK") === "Sessizlikleri bul" && ilk("sessızlık") === "Sessizlikleri bul" && ilk("Sessizlik") === "Sessizlikleri bul");
ok("'hiz rampasi' ve 'HIZ RAMPASI' → Hız Rampası", ilk("hiz rampasi") === "Hız Rampası" && ilk("HIZ RAMPASI") === "Hız Rampası");
ok("'altyazi' → önce tam ad Altyazı, sonra 'Altyazı ' ile başlayanlar, sonra kelimenin bir kısmı", J(adlar("altyazi", 4)) === J(["Altyazı", "Altyazı Şablonları", "Altyazı oluştur", "Altyazıyı çevir"]), J(adlar("altyazi", 6)));
ok("adda tam kelime, kelimenin başından önce: 'kesim' → Otomatik Kesim, sonra Kesimleri uygula", J(adlar("kesim", 2)) === J(["Otomatik Kesim", "Kesimleri uygula"]), J(adlar("kesim")));
ok("'motor' → Ayarlar › Motor; Ayarlar alt yazısından (motor · dil · lisans) da bulunur", ilk("motor") === "Ayarlar › Motor" && adlar("motor", 6).indexOf("Ayarlar") !== -1, J(adlar("motor")));
ok("çok kelime: her kelime bir yerde geçmeli ('ayarlar motor', 'sess bul')", ilk("ayarlar motor") === "Ayarlar › Motor" && ilk("sess bul") === "Sessizlikleri bul" &&
  AA.ara(kayit, "sessizlik zebra", null).length === 0);
ok("baş harfler: 'hr' → Hız Rampası", ilk("hr") === "Hız Rampası", J(adlar("hr")));
ok("anahtar kelime (İngilizce de): 'silence' → Otomatik Kesim / Sessizlikleri bul; 'speed ramp' ve 'slow motion' → Hız Rampası ilk üçte",
  /Sessizlikleri bul|Otomatik Kesim/.test(ilk("silence")) && adlar("speed ramp", 3).indexOf("Hız Rampası") !== -1 && adlar("slow motion", 3).indexOf("Hız Rampası") !== -1,
  J([adlar("silence"), adlar("speed ramp"), adlar("slow motion")]));
ok("eşleşmeyen sorgu boş liste", AA.ara(kayit, "qqzzxx", null).length === 0);
ok("puan: 0 eşleşmeme, ad başı > ad içi > alt yazı", AA.puanla(kim["tab:hiz"], "zebra") === 0 &&
  AA.puanla(kim["tab:hiz"], "hiz") > AA.puanla(kim["tab:hiz"], "rampa") && AA.puanla(kim["tab:hiz"], "rampa") > AA.puanla(kim["tab:hiz"], "cekim"));
// İngilizce arayüz: gösterilen İngilizce ad da aranır
var enKayit = AA.kayitKur([{ tab: "cut", ad: "Otomatik Kesim", alt: "sessizlik · konuşma · dolgu", pro: true }], { mevcut: function (e) { return e.tab === "cut"; } });
enKayit.forEach(function (o) { o.adGoster = { "Otomatik Kesim": "Auto Cut", "Sessizlikleri bul": "Find silences" }[o.ad] || o.ad; });
ok("İngilizce arayüz: gösterilen ad ('Find silences') ve Türkçe ad ('sessizlik') ikisi de bulur",
  AA.ara(enKayit, "find sil", null)[0].oge.ad === "Sessizlikleri bul" && AA.ara(enKayit, "sessizlik", null)[0].oge.ad === "Sessizlikleri bul" &&
  AA.ara(enKayit, "auto cut", null)[0].oge.ad === "Otomatik Kesim");
ok("eşleşen parça (vurgu): gösterilen metinde [bas, son)", J(AA.eslesme("Sessizlikleri bul", "sessizlik")) === J({ bas: 0, son: 9 }) &&
  J(AA.eslesme("Hız Rampası", "rampa")) === J({ bas: 4, son: 9 }) && J(AA.eslesme("Ayarlar › Motor", "motor")) === J({ bas: 10, son: 15 }) &&
  AA.eslesme("Hız Rampası", "") === null && AA.eslesme("Hız Rampası", "zebra") === null);
ok("sonuç sınırı (en çok 40, isteğe bağlı daha az)", AA.ara(kayit, "a", null).length <= AA.SONUC_MAX && AA.ara(kayit, "a", null, { sinir: 3 }).length <= 3);

/* ---------------- boş sorgu: bölümler, favoriler, son kullanılanlar ---------------- */

var d0 = AA.favoriDegistir(null, "eylem:rampa-uygula");
d0 = AA.sonEkle(d0, "tab:cut");
d0 = AA.sonEkle(d0, "eylem:rampa-uygula");
var bos = AA.ara(kayit, "", d0);
var bolumSirasi = [];
bos.forEach(function (r) { if (bolumSirasi[bolumSirasi.length - 1] !== r.bolum) bolumSirasi.push(r.bolum); });
ok("boş sorgu: Favoriler, Son kullanılanlar, Araçlar, Eylemler; favori son kullanılanlarda tekrar etmez",
  J(bolumSirasi) === J(["fav", "son", "arac", "eylem"]) && bos[0].oge.id === "eylem:rampa-uygula" && bos[0].fav === true &&
  bos[1].oge.id === "tab:cut" && bos[1].bolum === "son" && bos.filter(function (r) { return r.oge.id === "eylem:rampa-uygula"; }).length === 1 &&
  bos.length === kayit.length, J(bolumSirasi));
ok("bölüm adları Türkçe (İngilizcesi i18n'de)", AA.BOLUMLER.fav === "Favoriler" && AA.BOLUMLER.son === "Son kullanılanlar" && AA.BOLUMLER.eylem === "Eylemler");
ok("favori ve son kullanılan sırada küçük ek puan alır", (function () {
  var x = AA.ara(kayit, "uygula", null).map(function (r) { return r.oge.id; });
  var y = AA.ara(kayit, "uygula", AA.favoriDegistir(null, x[x.length - 1])).map(function (r) { return r.oge.id; });
  return y.indexOf(x[x.length - 1]) < x.length - 1;
})());

/* ---------------- kalıcılık (localStorage) ---------------- */

function depo(ilkDeger) {
  var m = {};
  if (ilkDeger !== undefined) m[AA.DEPO_ANAHTARI] = ilkDeger;
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, m: m };
}
var dp = depo();
var dd = AA.durumOku(dp);
ok("depo boş: boş durum", J(dd) === J({ fav: [], son: [] }));
dd = AA.favoriDegistir(dd, "tab:hiz");
dd = AA.favoriDegistir(dd, "eylem:sessizlik-bul");
for (var i = 0; i < 12; i++) dd = AA.sonEkle(dd, "tab:x" + i);
dd = AA.sonEkle(dd, "tab:x5");
ok("durumYaz → durumOku gidip gelir (yeni bir okuyucu da aynısını görür)", AA.durumYaz(dp, dd) === true && J(AA.durumOku(dp)) === J(dd) &&
  /"s":1/.test(dp.m[AA.DEPO_ANAHTARI]), dp.m[AA.DEPO_ANAHTARI]);
ok("son kullanılanlar: en çok 8, en yeni başta, yinelenen öne taşınır", dd.son.length === 8 && dd.son[0] === "tab:x5" && dd.son[1] === "tab:x11" &&
  dd.son.filter(function (x) { return x === "tab:x5"; }).length === 1 && dd.son.indexOf("tab:x3") === -1 && AA.sonEkle(dd, "tab:x2").son[0] === "tab:x2", J(dd.son));
ok("favori aç / kapa (sıra korunur), favoriMi", J(dd.fav) === J(["tab:hiz", "eylem:sessizlik-bul"]) && AA.favoriMi(dd, "tab:hiz") &&
  J(AA.favoriDegistir(dd, "tab:hiz").fav) === J(["eylem:sessizlik-bul"]) && J(dd.fav) === J(["tab:hiz", "eylem:sessizlik-bul"]));
ok("favori sınırı FAV_MAX", (function () { var x = null; for (var k = 0; k < 60; k++) x = AA.favoriDegistir(x, "tab:t" + k); return x.fav.length === AA.FAV_MAX; })());
var bozuklar = ["{bozuk json", "null", "42", "\"metin\"", "[]", J({ fav: "tab:cut", son: 7 }),
  J({ fav: [1, {}, null, "<img src=x>", "tab:cut", "tab:cut", "javascript:alert(1)", new Array(90).join("a")], son: ["eylem:rampa-uygula", "eylem:rampa uygula", "tab:"] })];
var bozukSonuc = bozuklar.map(function (b) { return J(AA.durumOku(depo(b))); });
ok("bozuk / yabancı kayıt yok sayılır: yalnız geçerli kimlikler kalır, hata atılmaz",
  bozukSonuc.slice(0, 6).every(function (x) { return x === J({ fav: [], son: [] }); }) &&
  bozukSonuc[6] === J({ fav: ["tab:cut"], son: ["eylem:rampa-uygula"] }), bozukSonuc.join(" "));
var atan = { getItem: function () { throw new Error("SecurityError"); }, setItem: function () { throw new Error("QuotaExceeded"); } };
ok("depo erişimi hata atarsa (gizli pencere, kapalı site verisi) panel çalışır: boş durum, yazma false",
  J(AA.durumOku(atan)) === J({ fav: [], son: [] }) && AA.durumYaz(atan, dd) === false && J(AA.durumOku(null)) === J({ fav: [], son: [] }) && AA.durumYaz(null, dd) === false);
ok("geçersiz kimlik favoriye / son kullanılanlara girmez", J(AA.favoriDegistir(null, "x").fav) === "[]" && J(AA.sonEkle(null, "tab:<b>").son) === "[]");

/* ---------------- kısayol ve yazı alanları ---------------- */

function tus(o) { var e = { key: "k", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }; for (var k in o) e[k] = o[k]; return e; }
ok("kısayol Windows: Ctrl+K ve Ctrl+Shift+K değil (Premiere: tüm izlerde kes), AltGr (Ctrl+Alt) değil, ⌘ değil",
  AA.kisayolMu(tus({ ctrlKey: true }), false) && AA.kisayolMu(tus({ ctrlKey: true, key: "K" }), false) &&
  !AA.kisayolMu(tus({ ctrlKey: true, shiftKey: true }), false) && !AA.kisayolMu(tus({ ctrlKey: true, altKey: true }), false) &&
  !AA.kisayolMu(tus({ metaKey: true }), false) && !AA.kisayolMu(tus({}), false) && !AA.kisayolMu(tus({ ctrlKey: true, key: "j" }), false));
ok("kısayol macOS: ⌘K; Ctrl+K değil (metin kutusunda satır sonunu siler)", AA.kisayolMu(tus({ metaKey: true }), true) &&
  !AA.kisayolMu(tus({ ctrlKey: true }), true) && !AA.kisayolMu(tus({ ctrlKey: true, metaKey: true }), true));
ok("kısayol: tuş adı yoksa keyCode 75; basılı tutma (repeat) tekrar açmaz", AA.kisayolMu(tus({ ctrlKey: true, key: "Unidentified", keyCode: 75 }), false) &&
  !AA.kisayolMu(tus({ ctrlKey: true, repeat: true }), false) && !AA.kisayolMu(null, false));
ok("kısayol metni: Ctrl+K / ⌘K", AA.kisayolMetni(false) === "Ctrl+K" && AA.kisayolMetni(true) === "⌘K");

function ogeY(etiket, o, ebeveyn) {
  var d = { nodeType: 1, tagName: etiket.toUpperCase(), parentNode: ebeveyn || null, attrs: {}, id: "" };
  for (var k in o || {}) d[k] = o[k];
  d.getAttribute = function (a) { return Object.prototype.hasOwnProperty.call(d.attrs, a) ? d.attrs[a] : null; };
  d.hasAttribute = function (a) { return Object.prototype.hasOwnProperty.call(d.attrs, a); };
  return d;
}
var govde = ogeY("body");
var segs = ogeY("div", { id: "cap-segments" }, govde), satirKutu = ogeY("div", {}, segs), tcw = ogeY("div", { id: "tc-words" }, govde);
var yok = ogeY("div", { attrs: { "data-kisayol-yok": "" } }, govde);
ok("yazı alanı: metin / arama / sayı / türsüz input, textarea, açılır liste",
  ["text", "search", "number", "email", "password", ""].every(function (t) { return AA.yaziAlaniMi(ogeY("input", { type: t }, govde)); }) &&
  AA.yaziAlaniMi(ogeY("textarea", {}, govde)) && AA.yaziAlaniMi(ogeY("select", {}, govde)));
ok("yazı alanı değil: düğme, onay kutusu, kaydırıcı, renk, düz div", !AA.yaziAlaniMi(ogeY("button", {}, govde)) &&
  ["checkbox", "radio", "range", "color", "button"].every(function (t) { return !AA.yaziAlaniMi(ogeY("input", { type: t }, govde)); }) &&
  !AA.yaziAlaniMi(ogeY("div", {}, govde)) && !AA.yaziAlaniMi(null) && !AA.yaziAlaniMi({ nodeType: 3 }));
ok("contenteditable (öğe ya da atası) yazı alanı; contenteditable=false değil",
  AA.yaziAlaniMi(ogeY("div", { isContentEditable: true }, govde)) && AA.yaziAlaniMi(ogeY("span", {}, ogeY("div", { attrs: { contenteditable: "" } }, govde))) &&
  !AA.yaziAlaniMi(ogeY("div", { attrs: { contenteditable: "false" } }, govde)));
ok("altyazı düzenleyicisi: #cap-segments ve #tc-words içindeki her şey (düğme dahil), [data-kisayol-yok]",
  AA.yaziAlaniMi(ogeY("button", {}, satirKutu)) && AA.yaziAlaniMi(ogeY("input", { type: "checkbox" }, segs)) && AA.yaziAlaniMi(ogeY("span", {}, tcw)) &&
  AA.yaziAlaniMi(ogeY("button", {}, yok)));

/* ---------------- CEP tuş ilgisi ---------------- */

ok("tuş ilgisi: Windows VK_K 75 + Ctrl, macOS kVK_ANSI_K 40 + ⌘", J(AA.tusIlgisi(false)) === J([{ keyCode: 75, ctrlKey: true }]) && J(AA.tusIlgisi(true)) === J([{ keyCode: 40, metaKey: true }]));
var cagrilar = [];
var cep = { registerKeyEventsInterest: function (j) { cagrilar.push(j); } };
var yon = AA.tusIlgisiYoneticisi(function () { return cep; });
var konum = J([{ keyCode: 37 }, { keyCode: 37, shiftKey: true }, { keyCode: 75, ctrlKey: true }]);
yon.ayarla("arac-ara", AA.tusIlgisi(false));
yon.ayarla("konum", konum);
var birlesik = JSON.parse(cagrilar[1]);
yon.ayarla("konum", "");
yon.ayarla("arac-ara", null);
ok("tuş ilgisi tek kayıt: araç arama + sahne tuşları birleşir, yinelenen tuş bir kez; sahne bırakınca Ctrl+K kalır; hepsi bırakılınca \"\"",
  cagrilar.length === 4 && J(JSON.parse(cagrilar[0])) === J([{ keyCode: 75, ctrlKey: true }]) && birlesik.length === 3 &&
  birlesik.filter(function (x) { return x.keyCode === 75; }).length === 1 && J(JSON.parse(cagrilar[2])) === J([{ keyCode: 75, ctrlKey: true }]) &&
  cagrilar[3] === "" && yon.son() === "", J(cagrilar));
ok("tuş ilgisi: CEP yoksa (test, tarayıcı) ya da hata atarsa false, panel çalışır",
  AA.tusIlgisiYoneticisi(function () { return null; }).ayarla("a", AA.tusIlgisi(false)) === false &&
  AA.tusIlgisiYoneticisi(function () { return { registerKeyEventsInterest: function () { throw new Error("x"); } }; }).ayarla("a", AA.tusIlgisi(true)) === false &&
  AA.tusIlgisiAyarla("arac-ara", AA.tusIlgisi(false)) === false);
ok("ilgiBirlestir: bozuk JSON ve keyCode'suz öğe atlanır, yalnız bilinen değiştiriciler", AA.ilgiBirlestir({ a: "{x", b: [{ k: 1 }, { keyCode: 9, ctrlKey: true, foo: 1, altKey: false }] }) === J([{ keyCode: 9, ctrlKey: true }]));

// captions.js: önizleme sahnesi konum tuşları ortak yöneticiden geçer (Ctrl+K silinmez); yönetici yoksa eski doğrudan çağrı
(function () {
  var i = capSrc.indexOf("  function konumTuslariniTut(");
  var g = capSrc.slice(i, capSrc.indexOf("\n  }\n", i) + 4);
  function kur(win) {
    return new Function("window", "K", "AE", "konumAktif", "var konumTusTutuluyor = false;\n" + g + "\nreturn konumTuslariniTut;")(win, { MAC: false },
      { konumTusIlgisi: function () { return J([{ keyCode: 37 }]); } }, function () { return true; });
  }
  var cc = [];
  var win = { __adobe_cep__: { registerKeyEventsInterest: function (j) { cc.push(j); } } };
  var yon2 = AA.tusIlgisiYoneticisi(function () { return win.__adobe_cep__; });
  win.SufloAracAra = { tusIlgisiAyarla: yon2.ayarla };
  yon2.ayarla("arac-ara", AA.tusIlgisi(false));
  var tut = kur(win);
  tut(true); tut(false);
  ok("captions.js sahne odağı: Ctrl+K ilgisiyle birleşik kayıt; odak gidince Ctrl+K kalır (\"\" ile silinmez)",
    cc.length === 3 && JSON.parse(cc[1]).length === 2 && cc[2] === J([{ keyCode: 75, ctrlKey: true }]), J(cc));
  var cc2 = [];
  var tut2 = kur({ __adobe_cep__: { registerKeyEventsInterest: function (j) { cc2.push(j); } } });
  tut2(true); tut2(false);
  ok("captions.js: arac-ara.js yüklenmemişse eski doğrudan çağrı (tut / \"\")", J(cc2) === J([J([{ keyCode: 37 }]), ""]), J(cc2));
})();

/* ---------------- app.js arayüz katmanı (gerçek kod, sahte DOM) ---------------- */

function M(t) { return { nodeType: 3, nodeValue: t, textContent: t, parentNode: null }; }
function bul(kok, f) { var out = []; (function gez(n) { (n.childNodes || []).forEach(function (c) { if (f(c)) out.push(c); gez(c); }); })(kok); return out; }
function sahne(o) {
  o = o || {};
  var belge, govdeD;
  function D(etiket, o) {
    var d = { nodeType: 1, tagName: String(etiket).toUpperCase(), attrs: {}, childNodes: [], parentNode: null, dinle: {}, hidden: false, disabled: false,
      className: "", textContent: "", value: "", title: "", type: "", tabIndex: 0, open: false, odak: 0, kaydir: 0 };
    d.classList = {
      contains: function (c) { return (" " + d.className + " ").indexOf(" " + c + " ") !== -1; },
      add: function (c) { if (!d.classList.contains(c)) d.className = (d.className + " " + c).trim(); },
      remove: function (c) { d.className = (" " + d.className + " ").replace(" " + c + " ", " ").trim(); },
      toggle: function (c, v) { if (v === undefined) v = !d.classList.contains(c); if (v) d.classList.add(c); else d.classList.remove(c); return v; }
    };
    d.setAttribute = function (k, v) { d.attrs[k] = String(v); if (k === "id") d.id = String(v); };
    d.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(d.attrs, k) ? d.attrs[k] : null; };
    d.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(d.attrs, k); };
    d.removeAttribute = function (k) { delete d.attrs[k]; };
    d.appendChild = function (c) { if (c.parentNode) c.parentNode.removeChild(c); d.childNodes.push(c); c.parentNode = d; return c; };
    d.removeChild = function (c) { var i = d.childNodes.indexOf(c); if (i !== -1) d.childNodes.splice(i, 1); c.parentNode = null; return c; };
    Object.defineProperty(d, "firstChild", { get: function () { return d.childNodes[0] || null; } });
    d.addEventListener = function (ad, f) { (d.dinle[ad] = d.dinle[ad] || []).push(f); };
    d.olay = function (ad, e) { e = e || {}; e.target = e.target || d; (d.dinle[ad] || []).forEach(function (f) { f(e); }); return e; };
    d.click = function () { d.tiklandi = (d.tiklandi || 0) + 1; d.olay("click"); };
    d.focus = function () { d.odak++; belge.activeElement = d; };
    d.scrollIntoView = function () { d.kaydir++; };
    d.cloneNode = function () { return D(d.tagName); };
    d.contains = function (x) { for (var n = x; n; n = n.parentNode) if (n === d) return true; return false; };
    // görünürlük: kendisi ya da atası hidden / kapalı details / etkin olmayan sekme ise null
    Object.defineProperty(d, "offsetParent", { get: function () {
      for (var n = d; n; n = n.parentNode) {
        if (n.hidden) return null;
        if (n.classList && n.classList.contains("tabpane") && !n.classList.contains("active")) return null;
        if (n.parentNode && n.parentNode.tagName === "DETAILS" && !n.parentNode.open && n.tagName !== "SUMMARY") return null;
      }
      return govdeD;
    } });
    d.getClientRects = function () { return []; };
    for (var k in o || {}) { if (k === "id") d.setAttribute("id", o[k]); else d[k] = o[k]; }
    return d;
  }
  govdeD = D("body");
  belge = {
    body: govdeD, activeElement: govdeD, dinle: {},
    createElement: function (t) { return D(t); },
    createTextNode: function (t) { return M(t); },
    addEventListener: function (ad, f) { (belge.dinle[ad] = belge.dinle[ad] || []).push(f); },
    querySelector: function () { return null; },
    querySelectorAll: function (sec) {
      if (sec === ".yan-menu .ky-oge[data-tab]") return bul(menu, function (c) { return c.classList && c.classList.contains("ky-oge"); });
      return [];
    }
  };
  var menu = govdeD.appendChild(D("aside", { className: "yan-menu" }));
  var tablar = {};
  function sekme(ad) { var s = govdeD.appendChild(D("section", { id: "tab-" + ad, className: "tabpane" })); tablar[ad] = s; return s; }
  function nav(tab, ad, alt, pro, kat, yeni) {
    var b = menu.appendChild(D("button", { className: "ky-oge" }));
    b.setAttribute("data-tab", tab);
    if (kat) b.setAttribute("data-kat", kat);
    var ik = b.appendChild(D("span", { className: "ky-ikon" })); ik.appendChild(D("svg"));
    var m = b.appendChild(D("span", { className: "ky-metin" }));
    var bb = m.appendChild(D("b")); bb.appendChild(M(ad));
    if (yeni) { var em = bb.appendChild(D("em", { className: "ky-yeni", textContent: "YENİ" })); em.childNodes.push(M("YENİ")); }
    m.appendChild(D("i", { textContent: alt }));
    if (pro) { var kl = b.appendChild(D("span", { className: "ky-kilit" })); kl.setAttribute("data-kilit", ""); }
    b.querySelector = function (sec) {
      if (sec === ".ky-metin b") return bb;
      if (sec === ".ky-metin i") return m.childNodes[1];
      if (sec === "[data-kilit]") return pro ? kl : null;
      if (sec === ".ky-ikon svg") return ik.childNodes[0];
      return null;
    };
    b.addEventListener("click", function () { goster(tab); gidilen.push(tab + (kat ? "/" + kat : "")); });
    return b;
  }
  var gidilen = [], toastlar = [], aktifSekme = "";
  function goster(ad) { Object.keys(tablar).forEach(function (k) { tablar[k].classList.toggle("active", k === ad); }); aktifSekme = ad; }
  nav("captions", "Altyazı", "transkript · düzenleme", false);
  nav("cut", "Otomatik Kesim ", "sessizlik · konuşma · dolgu", true, "", true);
  nav("hiz", "Hız Rampası ", "ağır çekim · hızlanma", true, "", true);
  nav("text", "Yazı Animasyonları", "text efektleri · typewriter", true, "mogrt");
  nav("settings", "Ayarlar", "motor · dil · lisans", false);
  var cap = sekme("captions"), cut = sekme("cut"), hiz = sekme("hiz"); sekme("text"); var ayar = sekme("settings");
  cap.classList.add("active");
  cap.appendChild(D("button", { id: "cap-go" }));
  cap.appendChild(D("button", { id: "cap-import-srt" }));
  var sonuc = cap.appendChild(D("div", { id: "cap-result", hidden: true }));
  sonuc.appendChild(D("select", { id: "cap-translate" }));
  var vrBox = sonuc.appendChild(D("details", { id: "cap-vr-box" }));
  vrBox.appendChild(D("button", { id: "cap-vr-bul" }));
  var ch = cap.appendChild(D("details", { id: "cap-ch-box" }));
  ch.appendChild(D("summary"));
  ch.appendChild(D("button", { id: "cap-ch-suggest" }));
  cut.appendChild(D("button", { id: "cut-analyze", disabled: !!o.analizKapali }));
  hiz.appendChild(D("button", { id: "hiz-uygula" }));
  ayar.appendChild(D("div", { id: "grp-motor" }));
  var proGrup = ayar.appendChild(D("div", { id: "grp-pro" }));
  proGrup.appendChild(D("div", { id: "pro-locked-card", hidden: !!o.pro })).appendChild(D("input", { id: "pro-key", type: "text" }));
  var ac = govdeD.appendChild(D("button", { id: "arac-ara-ac" }));
  ac.appendChild(D("kbd", { className: "arac-ara-kisayol", textContent: "Ctrl+K" }));
  ac.querySelector = function (s) { return s === ".arac-ara-kisayol" ? ac.childNodes[0] : null; };
  var kutu = govdeD.appendChild(D("div", { id: "arac-ara", hidden: true }));
  var girdi = kutu.appendChild(D("input", { id: "arac-ara-girdi", type: "text" }));
  var liste = kutu.appendChild(D("div", { id: "arac-ara-liste" }));
  var bosK = kutu.appendChild(D("div", { id: "arac-ara-bos", hidden: true }));
  var favTus = kutu.appendChild(D("kbd", { id: "arac-ara-fav-tus", textContent: "Ctrl+D" }));
  var dep = o.depo || depo();
  var win = { SufloAracAra: AA, localStorage: dep, Pro: { isPro: function () { return !!o.pro; } }, dinle: {},
    addEventListener: function (ad, f) { (win.dinle[ad] = win.dinle[ad] || []).push(f); } };
  function el(id) { return bul(govdeD, function (c) { return c.id === id; })[0] || null; }
  var K = { MAC: !!o.mac, log: function () {} };
  var i = appSrc.indexOf("  /* ---------------- Araç ara (Ctrl+K");
  var j = appSrc.indexOf("  /* ---------------- Ayarlar ---------------- */", i);
  var api = new Function("window", "document", "el", "K", "uiMetni", "uiOzgun", "toast", "goster", "setTimeout", "clearTimeout",
    appSrc.slice(i, j) + "\nreturn { baslat: aracAramaBaslat, tus: aracAraTusu, durum: function () { return arama; } };")(
    win, belge, el, K, function (s) { return o.en && o.en[s] ? o.en[s] : s; }, function (n) { return n.nodeType === 3 ? n.nodeValue : n.textContent; },
    function (m, tur) { toastlar.push([m, tur]); }, goster, function () { return 0; }, function () {});
  api.baslat();
  function belgeTusu(e) { (belge.dinle.keydown || []).forEach(function (f) { f(e); }); return e; }
  function olay(o2) {
    var e = { key: "", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, engel: 0, durdu: 0, target: girdi };
    e.preventDefault = function () { e.engel++; }; e.stopPropagation = function () { e.durdu++; };
    for (var k in o2) e[k] = o2[k];
    return e;
  }
  function satirlar() { return bul(liste, function (c) { return c.classList && c.classList.contains("arac-ara-satir"); }); }
  function satirAdi(s) {
    var b = bul(s, function (c) { return c.tagName === "B"; })[0];
    return b.childNodes.length ? b.childNodes.map(function (n) { return n.nodeType === 3 ? n.nodeValue : n.textContent; }).join("") : b.textContent;
  }
  function yaz(q) { girdi.value = q; girdi.olay("input"); }
  return { api: api, kutu: kutu, girdi: girdi, liste: liste, bos: bosK, ac: ac, favTus: favTus, el: el, win: win, belge: belge, depo: dep, gidilen: gidilen,
    toastlar: toastlar, aktifSekme: function () { return aktifSekme; }, belgeTusu: belgeTusu, olay: olay, satirlar: satirlar, satirAdi: satirAdi, yaz: yaz,
    girdiTusu: function (o2) { return girdi.olay("keydown", olay(o2)); } };
}

(function () {
  var s = sahne();
  ok("başlangıç: pencere kapalı; düğme başlığı 'Araç ara (Ctrl+K)', Windows'ta Ctrl+D", s.kutu.hidden === true && s.ac.title === "Araç ara (Ctrl+K)" &&
    s.ac.getAttribute("aria-keyshortcuts") === "Control+K" && s.favTus.textContent === "Ctrl+D");
  var mac = sahne({ mac: true });
  ok("macOS: '⌘K' başlığı, kısayol metni ve ⌘D", mac.ac.title === "Araç ara (⌘K)" && mac.ac.childNodes[0].textContent === "⌘K" && mac.favTus.textContent === "⌘D" &&
    mac.ac.getAttribute("aria-keyshortcuts") === "Meta+K");
  // Ctrl+K belge üzerinde (odak bir düğmede)
  var dugmede = s.belgeTusu(s.olay({ key: "k", ctrlKey: true, target: s.el("cap-go") }));
  ok("Ctrl+K (odak düğmede): pencere açılır, odak arama kutusunda, tarayıcı varsayılanı engellenir", s.kutu.hidden === false && s.belge.activeElement === s.girdi &&
    dugmede.engel === 1 && s.ac.getAttribute("aria-expanded") === "true");
  var adlarBos = s.satirlar().map(s.satirAdi);
  ok("boş sorgu: tüm araçlar, sonra eylemler (bölüm başlıklı); ilk satır etkin", adlarBos[0] === "Altyazı" && adlarBos.indexOf("Otomatik Kesim") === 1 &&
    adlarBos.indexOf("Sessizlikleri bul") > adlarBos.indexOf("Ayarlar") && s.satirlar()[0].classList.contains("aktif") &&
    s.girdi.getAttribute("aria-activedescendant") === "arac-ara-s0" && bul(s.liste, function (c) { return c.classList && c.classList.contains("arac-ara-bolum"); }).length === 2,
    J(adlarBos));
  ok("Pro olmayan kullanıcıda Pro araç ve eylemlerde PRO rozeti; ücretsizlerde yok", (function () {
    var r = s.satirlar(), kesim = r[adlarBos.indexOf("Otomatik Kesim")], altyazi = r[0], ramp = r[adlarBos.indexOf("Rampayı uygula")];
    function rozet(x) { return bul(x, function (c) { return c.classList && c.classList.contains("arac-ara-kilit"); }).length; }
    return rozet(kesim) === 1 && rozet(altyazi) === 0 && rozet(ramp) === 1;
  })());
  s.yaz("sessızlık");
  ok("yazdıkça süzülür: 'sessızlık' → 'Sessizlikleri bul', eşleşen parça <mark> içinde", s.satirAdi(s.satirlar()[0]) === "Sessizlikleri bul" &&
    bul(s.satirlar()[0], function (c) { return c.tagName === "MARK"; })[0].textContent === "Sessizlik");
  s.yaz("zzqq");
  ok("eşleşme yoksa liste boş, 'Eşleşen araç yok' görünür", s.satirlar().length === 0 && s.bos.hidden === false);
  s.yaz("rampa");
  var ilkAd = s.satirAdi(s.satirlar()[0]);
  s.girdiTusu({ key: "ArrowDown" });
  var ikinci = s.api.durum().aktif;
  s.girdiTusu({ key: "ArrowUp" }); s.girdiTusu({ key: "ArrowUp" });
  ok("↓ / ↑ etkin satırı gezdirir (başa / sona sarar), Tab da gezer", ikinci === 1 && s.api.durum().aktif === s.satirlar().length - 1 &&
    (s.girdiTusu({ key: "Tab" }), s.api.durum().aktif === 0) && s.satirlar()[0].getAttribute("aria-selected") === "true", ilkAd);
  // Enter: Rampayı uygula → Hız Rampası sekmesi, düğme odakta ve vurgulu, çalıştırılmaz
  var enter = s.girdiTusu({ key: "Enter" });
  var hu = s.el("hiz-uygula");
  ok("Enter: eylem sekmesini açar (menü girdisiyle), düğmeyi kaydırır, odaklar ve vurgular; düğmeye TIKLANMAZ (Pro kapısı orada)",
    enter.engel === 1 && s.kutu.hidden === true && s.aktifSekme() === "hiz" && s.gidilen.indexOf("hiz") !== -1 && s.belge.activeElement === hu &&
    hu.classList.contains("arac-ara-vurgu") && hu.kaydir === 1 && !hu.tiklandi && ilkAd === "Rampayı uygula", ilkAd);
  ok("seçilen son kullanılanlara yazılır (localStorage)", J(AA.durumOku(s.depo).son) === J(["eylem:rampa-uygula"]), s.depo.m[AA.DEPO_ANAHTARI]);
  // yeniden aç: son kullanılan en üstte
  s.belgeTusu(s.olay({ key: "k", ctrlKey: true, target: s.belge.body }));
  ok("yeniden açınca 'Son kullanılanlar' en üstte, kutu temiz", s.girdi.value === "" && s.satirAdi(s.satirlar()[0]) === "Rampayı uygula" &&
    bul(s.liste, function (c) { return c.classList && c.classList.contains("arac-ara-bolum"); })[0].textContent === "Son kullanılanlar");
  // yıldız: favori + kalıcı
  s.yaz("ayarlar");
  var hedefAd = s.satirAdi(s.satirlar()[0]);
  var yildiz = bul(s.satirlar()[0], function (c) { return c.classList && c.classList.contains("arac-ara-yildiz"); })[0];
  yildiz.olay("click", { stopPropagation: function () {} });
  var yildiz2 = bul(s.satirlar()[0], function (c) { return c.classList && c.classList.contains("arac-ara-yildiz"); })[0];
  ok("yıldız: favoriye ekler (★, aria-pressed), localStorage'a yazar, odak arama kutusunda kalır", hedefAd === "Ayarlar" && yildiz2.textContent === "★" &&
    yildiz2.getAttribute("aria-pressed") === "true" && J(AA.durumOku(s.depo).fav) === J(["tab:settings"]) && s.belge.activeElement === s.girdi);
  s.girdiTusu({ key: "d", ctrlKey: true });
  ok("Ctrl+D etkin satırın favorisini kapatır", J(AA.durumOku(s.depo).fav) === "[]");
  s.girdiTusu({ key: "d", ctrlKey: true });
  // Esc: kapanır, odak önceki öğeye döner; olay belgeye yayılmaz
  var esc = s.girdiTusu({ key: "Escape" });
  ok("Esc: pencere kapanır, odak açmadan önceki öğeye döner, Esc belgeye yayılmaz", s.kutu.hidden === true && esc.durdu === 1 && s.belge.activeElement !== s.girdi &&
    s.ac.getAttribute("aria-expanded") === "false");
  // arama kutusunda Ctrl+K: kapatır (aç / kapa)
  s.belgeTusu(s.olay({ key: "k", ctrlKey: true, target: s.belge.body }));
  var sabit = s.satirAdi(s.satirlar()[0]);
  var kk = s.girdiTusu({ key: "k", ctrlKey: true });
  ok("pencere açıkken Ctrl+K kapatır; favori kalıcı (yeniden açınca Favoriler başta)", s.kutu.hidden === true && kk.durdu === 1 && sabit === "Ayarlar");
  // araç satırı: menü girdisine tıklar (kategori dahil)
  s.belgeTusu(s.olay({ key: "k", ctrlKey: true, target: s.belge.body }));
  s.yaz("yazi animasyon");
  s.girdiTusu({ key: "Enter" });
  ok("araç satırı: sol menüdeki girdiye tıklar (Yazı Animasyonları kategorisiyle), odak o girdide", s.gidilen[s.gidilen.length - 1] === "text/mogrt" &&
    s.aktifSekme() === "text" && s.belge.activeElement.getAttribute("data-kat") === "mogrt");
  // eylem: düğme henüz yok (transkript yok) → ipucu
  s.belgeTusu(s.olay({ key: "k", ctrlKey: true, target: s.belge.body }));
  s.yaz("altyazıyı çevir");
  s.girdiTusu({ key: "Enter" });
  ok("gizli düğme (transkript yok): 'Önce altyazı oluştur…' ipucu, odaklanmaz", s.toastlar.length === 1 && s.toastlar[0][0] === "Önce altyazı oluştur ya da SRT içe aktar." &&
    s.toastlar[0][1] === "warn" && s.belge.activeElement !== s.el("cap-translate"));
  // eylem: kapalı <details> açılır
  s.belgeTusu(s.olay({ key: "k", ctrlKey: true, target: s.belge.body }));
  s.yaz("bölüm öner");
  s.girdiTusu({ key: "Enter" });
  ok("kapalı <details> içindeki düğme: details açılır, düğme odaklanır", s.el("cap-ch-box").open === true && s.belge.activeElement === s.el("cap-ch-suggest"));
  // Ayarlar › Motor: kap vurgulanır (odaklanabilir değil)
  s.belgeTusu(s.olay({ key: "k", ctrlKey: true, target: s.belge.body }));
  s.yaz("motor");
  s.girdiTusu({ key: "Enter" });
  ok("'Ayarlar › Motor': Ayarlar açılır, #grp-motor kaydırılır ve vurgulanır", s.aktifSekme() === "settings" && s.el("grp-motor").classList.contains("arac-ara-vurgu") &&
    s.el("grp-motor").kaydir === 1);
  // ilk hedef gizliyse ikincisi (Pro'da lisans anahtarı kutusu gizli → #grp-pro)
  var p = sahne({ pro: true });
  p.belgeTusu(p.olay({ key: "k", ctrlKey: true, target: p.belge.body }));
  p.yaz("pro lisans");
  p.girdiTusu({ key: "Enter" });
  ok("ilk görünen hedef seçilir (Pro'da #pro-key gizli → #grp-pro); Pro kullanıcıda PRO rozeti yok", p.el("grp-pro").classList.contains("arac-ara-vurgu") &&
    (p.belgeTusu(p.olay({ key: "k", ctrlKey: true, target: p.belge.body })), bul(p.liste, function (c) { return c.classList && c.classList.contains("arac-ara-kilit"); }).length === 0));
  // kapalı (disabled) düğme: vurgulanır ama odaklanmaz
  var k2 = sahne({ analizKapali: true });
  k2.belgeTusu(k2.olay({ key: "k", ctrlKey: true, target: k2.belge.body }));
  k2.yaz("sessizlik");
  k2.girdiTusu({ key: "Enter" });
  ok("kapalı düğme (klip seçilmedi): vurgulanır, odaklanmaz, tıklanmaz", k2.el("cut-analyze").classList.contains("arac-ara-vurgu") && k2.el("cut-analyze").odak === 0 && !k2.el("cut-analyze").tiklandi);
  // İngilizce arayüz: gösterilen ad çevrilmiş, Türkçe de bulunur
  var en = sahne({ en: { "Sessizlikleri bul": "Find silences", "Otomatik Kesim": "Auto Cut", "Araç ara (Ctrl+K)": "x" } });
  en.belgeTusu(en.olay({ key: "k", ctrlKey: true, target: en.belge.body }));
  en.yaz("find sil");
  var enAd = en.satirAdi(en.satirlar()[0]);
  en.yaz("sessizlik");
  ok("İngilizce arayüz: satırlar İngilizce ('Find silences'), Türkçe sorgu da bulur", enAd === "Find silences" && en.satirAdi(en.satirlar()[0]) === "Find silences");
  // tuş ilgisi panel açılışında yok; ilk etkileşimde bir kez
  var cc = [];
  var t = sahne();
  ok("CEP tuş ilgisi panel açılışında çağrılmaz; ilk odak / tıklama / tuş için dinleyici kurulur",
    !!t.win.dinle.focus && /document\.addEventListener\("pointerdown", aramaTusIlgisi, true\)/.test(appSrc) &&
    !/AA\.tusIlgisiAyarla/.test(appSrc.slice(appSrc.indexOf("function aracAramaBaslat("), appSrc.indexOf("/* ---------------- Ayarlar ---------------- */"))), J(cc));
  // depo erişilemezse de çalışır
  var dz = sahne({ depo: { getItem: function () { throw new Error("x"); }, setItem: function () { throw new Error("y"); } } });
  dz.belgeTusu(dz.olay({ key: "k", ctrlKey: true, target: dz.belge.body }));
  dz.yaz("hiz");
  dz.girdiTusu({ key: "Enter" });
  ok("localStorage hata atsa da palet açılır ve seçim çalışır", dz.aktifSekme() === "hiz");
})();

/* ---------------- İngilizce arayüz ---------------- */

var I18N = require(path.join(KOK, "js", "i18n.js")), EN = require(path.join(KOK, "i18n", "en.js"));
I18N.setDictionary(EN);
var cevrilmeyen = [];
AA.EYLEMLER.forEach(function (e) {
  [e.ad, e.gerekli].forEach(function (s) { if (s && I18N.translate(s) === s && EN.keep.indexOf(s) === -1) cevrilmeyen.push(s); });
});
Object.keys(AA.BOLUMLER).forEach(function (k) { if (I18N.translate(AA.BOLUMLER[k]) === AA.BOLUMLER[k]) cevrilmeyen.push(AA.BOLUMLER[k]); });
["Araç ara", "Araç ara (Ctrl+K)", "Araç ara (⌘K)", "Favorilere ekle", "Favorilerden çıkar", "Pro: uygulamak için lisans ya da deneme hakkı gerekir",
  "Eşleşen araç yok. Başka bir kelime dene.", "Araç ya da eylem ara… (ör. sessizlik, rampa)", "Araçlar ve eylemler", "seç", "aç", "favori", "kapat"].forEach(function (s) {
  if (I18N.translate(s) === s) cevrilmeyen.push(s);
});
ok("İngilizce: eylem adları, ipuçları, bölüm başlıkları, düğme başlığı ve pencere metinleri çevrili", cevrilmeyen.length === 0, cevrilmeyen.join(" | "));
ok("İngilizce örnekler: 'Settings › Engine', 'Find silences', 'Search tools (⌘K)', 'Recent'", I18N.translate("Ayarlar › Motor") === "Settings › Engine" &&
  I18N.translate("Sessizlikleri bul") === "Find silences" && I18N.translate("Araç ara (⌘K)") === "Search tools (⌘K)" && I18N.translate("Son kullanılanlar") === "Recent");

/* ---------------- CSS: CEF 74 ---------------- */

var css = fs.readFileSync(path.join(KOK, "css", "style.css"), "utf8").replace(/\r\n/g, "\n");
var kurallar = [], re = /([^{}]*arac-ara[^{}]*)\{([^{}]*)\}/g, m;
while ((m = re.exec(css))) kurallar.push({ secici: m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), govde: m[2] });
var sorun = kurallar.filter(function (k) { return /(^|[;\s])(row-|column-)?gap:/.test(k.govde) || /overflow-wrap:\s*anywhere/.test(k.govde) || /(^|[^a-z])(min|max|clamp)\(/.test(k.govde); });
ok("CSS (araç ara): flex gap, overflow-wrap:anywhere, min()/max()/clamp() yok (CEF 74)", kurallar.length >= 20 && sorun.length === 0, kurallar.length + " kural · " + sorun.map(function (k) { return k.secici; }).join(" | "));
ok("CSS: pencere gizliyken görünmez, boş durum gizlenebilir, vurgu hareket azaltmada durur",
  /\.arac-ara-arka\[hidden\] \{ display: none; \}/.test(css) && /\.arac-ara-bos\[hidden\] \{ display: none; \}/.test(css) &&
  /prefers-reduced-motion: reduce\) \{ \.arac-ara-vurgu \{ animation: none; \} \}/.test(css));

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
