// Suflo testi: Yapay zekâ köprüsü (MCP) eylem kaydı — js/otomasyon.js
// Şema doğrulaması, bilinmeyen eylem/anahtar reddi, yol temizliği, boyut ve dizi sınırları,
// sınıf ataması, kalıcı olarak dışarıda kalan yetenekler, MCP araç listesi.
var path = require("path");
var O = require(path.join(__dirname, "..", "js", "otomasyon.js"));
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }

/* ---------------- v1 izin listesi ve sınıflar ---------------- */
var BEKLENEN = {
  oku: ["suflo_baglam", "suflo_izler", "suflo_secim", "suflo_altyazi_oku", "suflo_is_durumu", "suflo_doktor"],
  yaz: ["suflo_oynatma_kafasi", "suflo_marker_ekle", "suflo_altyazi_olustur", "suflo_altyazi_kanala", "suflo_altyazi_disari", "suflo_sessizlik_analiz", "suflo_zoom", "suflo_egri_uygula"],
  yikici: ["suflo_sessizlik_kes", "suflo_metinden_kes", "suflo_hiz_rampasi"]
};
var hepsi = [].concat(BEKLENEN.oku, BEKLENEN.yaz, BEKLENEN.yikici);
ok("izin listesi tam olarak v1 eylemleri (3.4 adım 10 eğri pişirme dahil)", js(O.adlar().slice().sort()) === js(hepsi.slice().sort()), js(O.adlar()));
Object.keys(BEKLENEN).forEach(function (sinif) {
  ok("sınıf " + sinif + ": doğru atanmış", BEKLENEN[sinif].every(function (a) { return O.eylem(a).sinif === sinif; }));
});
ok("her eylem: ad, EN açıklama, sınıf, şema nesnesi", O.EYLEMLER.every(function (e) {
  return /^suflo_[a-z_]+$/.test(e.ad) && typeof e.aciklama === "string" && e.aciklama.length > 20 && !/[ıİşŞğĞ]/.test(e.aciklama) &&
    O.SINIFLAR.indexOf(e.sinif) !== -1 && e.sema && typeof e.sema === "object";
}));
ok("Pro eylemleri mevcut kapı anahtarlarını kullanır", O.eylem("suflo_sessizlik_analiz").pro === "cut" && O.eylem("suflo_sessizlik_kes").pro === "cut" &&
  O.eylem("suflo_metinden_kes").pro === "textcut" && O.eylem("suflo_zoom").pro === "zoom" && O.eylem("suflo_hiz_rampasi").pro === "speedramp" && O.eylem("suflo_egri_uygula").pro === "curves" &&
  O.eylem("suflo_baglam").pro === null && O.eylem("suflo_altyazi_olustur").pro === null);
var D = require(path.join(__dirname, "..", "js", "deneme.js"));
ok("Pro eylemlerinin anahtarları aracın kendi deneme listesinde (aynı kapı)", O.EYLEMLER.every(function (e) { return !e.pro || D.listede(e.pro); }));
// Kurucu kademesi: köprüyü açmak yalnız Pro, köprünün kendi deneme hakkı yok (inceleme bulgusu)
ok("köprünün kendi anahtarı 'mcp' deneme listesinde YOK", !D.listede("mcp") && D.kalan(D.bos(), "mcp") === 0 && !Object.prototype.hasOwnProperty.call(D.AD, "mcp"));

/* ---------------- dallar birleşince: eğri pişirme eylemi unutulmasın ---------------- */
// Plan adım 22 v1 izin listesindeki suflo_egri_uygula (adım 10, js/egri.js) yerel-34-egri birleşirken eklendi (kurucu
// notu MCP.5); js/egri.js depodayken eylem listeden düşerse bu test KALIR.
var egriVar = require("fs").existsSync(path.join(__dirname, "..", "js", "egri.js"));
ok("eğri modülü varsa suflo_egri_uygula yazma eylemi listede" + (egriVar ? "" : " (js/egri.js bu dalda yok)"),
  !egriVar || (!!O.eylem("suflo_egri_uygula") && O.eylem("suflo_egri_uygula").sinif === "yaz"));

/* ---------------- Kalıcı olarak dışarıda kalanlar ---------------- */
var yasakAd = /extendscript|qe|eval|script|project|save|close|delete|remove|export_media|render|setting|license|lisans|api|key|anahtar|http|fetch|url|path|yol|dosya_ac|ag_/i;
ok("hiçbir eylem adı yasak yeteneği çağrıştırmaz", O.adlar().every(function (a) { return !yasakAd.test(a.replace(/^suflo_/, "")); }), O.adlar().filter(function (a) { return yasakAd.test(a.replace(/^suflo_/, "")); }).join(","));
ok("hiçbir şemada yol / betik / URL alanı yok", O.EYLEMLER.every(function (e) {
  return Object.keys(e.sema).every(function (k) { return !/path|yol|script|betik|url|dosya|kod/i.test(k); });
}));
ok("HARIC listesi ExtendScript/QE, proje, render, ayar, lisans, ağ içerir", ["execute_extendscript", "execute_qe_script", "open_project", "save_project", "render", "settings", "license", "api_key", "http"].every(function (x) { return O.HARIC.indexOf(x) !== -1; }));
ok("bilinmeyen eylem reddedilir", O.dogrula("execute_extendscript", {}).hata === "bilinmeyen_eylem" && O.dogrula("__proto__", {}).ok === false && O.dogrula("constructor", {}).ok === false && O.dogrula(42, {}).ok === false);

/* ---------------- Şema doğrulaması ---------------- */
ok("argümansız eylem: boş / undefined kabul", O.dogrula("suflo_baglam").ok && O.dogrula("suflo_baglam", {}).ok);
ok("bilinmeyen anahtar reddedilir", O.dogrula("suflo_baglam", { x: 1 }).hata === "gecersiz" && /unknown key/.test(O.dogrula("suflo_baglam", { x: 1 }).mesaj));
ok("dizi / null dışı argüman reddedilir", !O.dogrula("suflo_baglam", [1]).ok && !O.dogrula("suflo_baglam", "a").ok);
ok("gerekli alan", !O.dogrula("suflo_oynatma_kafasi", {}).ok && O.dogrula("suflo_oynatma_kafasi", { saniye: 12.5 }).ok);
ok("sayı min/max ve tür", !O.dogrula("suflo_oynatma_kafasi", { saniye: -1 }).ok && !O.dogrula("suflo_oynatma_kafasi", { saniye: 86401 }).ok &&
  !O.dogrula("suflo_oynatma_kafasi", { saniye: "5" }).ok && !O.dogrula("suflo_oynatma_kafasi", { saniye: NaN }).ok && !O.dogrula("suflo_oynatma_kafasi", { saniye: Infinity }).ok);
ok("tamsayı", !O.dogrula("suflo_altyazi_oku", { adet: 1.5 }).ok && O.dogrula("suflo_altyazi_oku", { adet: 2000 }).ok && !O.dogrula("suflo_altyazi_oku", { adet: 2001 }).ok);
ok("enum", O.dogrula("suflo_altyazi_disari", { bicim: "vtt" }).ok && !O.dogrula("suflo_altyazi_disari", { bicim: "ass" }).ok && !O.dogrula("suflo_altyazi_disari", { bicim: "../x" }).ok);
ok("desen ve maxLen", O.dogrula("suflo_is_durumu", { is: "is_abc123" }).ok && !O.dogrula("suflo_is_durumu", { is: "../../etc" }).ok &&
  !O.dogrula("suflo_altyazi_olustur", { dil: "turkish!" }).ok && O.dogrula("suflo_altyazi_olustur", { dil: "tr", kapsam: "entire", mod: "kelime" }).ok);
ok("mantıksal", !O.dogrula("suflo_marker_ekle", { markerlar: [], bolum: "evet" }).ok);
var m200 = [], m201 = [];
for (var i = 0; i < 201; i++) { if (i < 200) m200.push({ saniye: i }); m201.push({ saniye: i }); }
ok("marker en çok 200 (maxItems)", O.dogrula("suflo_marker_ekle", { markerlar: m200 }).ok && !O.dogrula("suflo_marker_ekle", { markerlar: m201 }).ok);
ok("iç nesne: bilinmeyen anahtar ve uzun ad reddedilir", !O.dogrula("suflo_marker_ekle", { markerlar: [{ saniye: 1, renk: 3 }] }).ok &&
  !O.dogrula("suflo_marker_ekle", { markerlar: [{ saniye: 1, ad: new Array(130).join("a") }] }).ok);
ok("kontrol karakterleri reddedilir", !O.dogrula("suflo_marker_ekle", { markerlar: [{ saniye: 1, ad: "a\u0000b" }] }).ok);
var d = O.dogrula("suflo_marker_ekle", { markerlar: [{ saniye: 1, ad: "Giriş" }], bolum: true });
ok("doğrulanmış argüman temiz kopya döner", d.ok && js(d.args) === js({ markerlar: [{ saniye: 1, ad: "Giriş" }], bolum: true }));
ok("sessizlik analizi aralıkları paneldeki kaydırıcılarla aynı", !O.dogrula("suflo_sessizlik_analiz", { esik_db: -70 }).ok && O.dogrula("suflo_sessizlik_analiz", { esik_db: -38, min_sessizlik: 0.8, pay: 0.15 }).ok);

/* ---------------- temizle(): yollar, boyut, diziler ---------------- */
var t = O.temizle({ ok: true, mediaPath: "C:\\Users\\Ayşe\\Videolar\\röportaj.mp4", mac: "/Users/samet/Movies/klip.mov", unc: "\\\\sunucu\\pay\\a.wav",
  linux: "/home/u/x/y.srt", metin: "Dosya C:\\Proje\\x.prproj bulunamadı", ad: "Sequence 01", oran: "16/9", fn: function () {} });
ok("mutlak yollar dosya adına iner", t.mediaPath === "röportaj.mp4" && t.mac === "klip.mov" && t.unc === "a.wav" && t.linux === "y.srt", js(t));
ok("metin içindeki yol da kısalır; sıradan metin ve oran bozulmaz", /x\.prproj/.test(t.metin) && !/Proje/.test(t.metin) && t.ad === "Sequence 01" && t.oran === "16/9", t.metin);
ok("işlevler düşer, __proto__ kopyalanmaz", t.fn === null && O.temizle(JSON.parse('{"__proto__":{"x":1},"a":1}')).x === undefined);
// İnceleme bulguları: boşluklu klasör adı sızıyordu; altyazı metnindeki URL ve "/home …" bozuluyordu
var yollar = [
  ["Dosya okunamadı: C:\\Users\\Samet Kaygısız\\Videos\\ham.mp4", "Dosya okunamadı: ham.mp4"],
  ["Error: /Volumes/Extreme SSD/Projeler/Acme Corp/klip.mp4 not found", "Error: klip.mp4 not found"],
  ["ses analizi başarısız: C:\\Users\\Ad Soyad\\Videos\\x.mp4: No such file", "ses analizi başarısız: x.mp4: No such file"],
  ["EACCES: permission denied, open '/Users/samet/Projeler/Gizli Musteri/suflo-altyazi.srt'", "EACCES: permission denied, open 'suflo-altyazi.srt'"],
  ["/Users/a/b.mov ve /Users/c/d.mov", "b.mov ve d.mov"],
  ["~/Masaüstü/x.srt", "x.srt"],
  ["C:\\Proje\\", "Proje"],
  ["(C:/Users/x/y.mp4)", "(y.mp4)"],
  // 3.4 inceleme: kesme işaretli klasör adları (Türkçe ek, O'Brien) sızıyordu; kapanan tırnak yine durur
  ["C:\\Users\\Sean O'Brien\\Videos\\Ayşe'nin Düğünü\\Gelin Hazırlık\\klip.mp4", "klip.mp4"],
  ["/Users/ayse/Movies/İstanbul'da Çekim/Müşteri X Lansman/b.mov", "b.mov"],
  ["open '/Users/bob/Movies/Gizli Müşteri/x.srt'", "open 'x.srt'"],
  ["'/Users/a/b.mov','/Users/c/d.mov'", "'b.mov','d.mov'"],
  ["Ayşe'nin videosu: C:\\Users\\Ayşe\\Ali'nin Klasörü\\a.mp4 bulunamadı", "Ayşe'nin videosu: a.mp4 bulunamadı"]
];
yollar.forEach(function (y) { ok("yol temizliği: " + y[0].slice(0, 40), O.temizle(y[0]) === y[1], O.temizle(y[0])); });
var dokunma = ["Daha fazlası için https://suflo.app/indir adresine gidin", "/home sayfasına dön", "https://example.com/home/x/y", "ve/veya", "16/9 kare",
  "Saat 10:30/11:00 arası", "http://site.com/Users/a/b.html"];
dokunma.forEach(function (m) { ok("altyazı metni bozulmaz: " + m.slice(0, 40), O.temizle(m) === m, O.temizle(m)); });
var cue = O.temizle({ ok: true, satirlar: [{ metin: "Linke tıkla: https://suflo.app/indir" }, { metin: "/home sayfasına dön" }] }, { diziSiniri: O.ALTYAZI_SINIRI });
ok("suflo_altyazi_oku satırları URL ve '/home' metniyle aynen döner", cue.satirlar[0].metin === "Linke tıkla: https://suflo.app/indir" && cue.satirlar[1].metin === "/home sayfasına dön", js(cue));

/* ---------------- Şemanın vaat ettiği değerler panelde karşılıklı mı ---------------- */
// İnceleme bulgusu: şema dil:'auto' diyordu, #cap-lang'de 'auto' yok ("Otomatik" değeri "")
var fs = require("fs");
var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
function secenekler(id) {
  var i = html.indexOf('<select id="' + id + '"'), j = html.indexOf("</select>", i);
  return (html.slice(i, j).match(/<option value="([^"]*)"/g) || []).map(function (x) { return /value="([^"]*)"/.exec(x)[1]; });
}
var diller = secenekler("cap-lang");
var DL = require(path.join(__dirname, "..", "js", "diller.js"));
var tumDiller = diller.concat((DL.moreLanguages ? DL.moreLanguages() : []).map(function (d) { return d[0]; }));
var olustur = O.eylem("suflo_altyazi_olustur").sema;
ok("dil 'auto' şemadan geçer ve paneldeki 'Otomatik' seçeneğine ('') eşlenir", O.dogrula("suflo_altyazi_olustur", { dil: "auto" }).ok && O.dilDegeri("auto") === "" && diller.indexOf("") !== -1);
ok("dil kodu aynen geçer, verilmezse null (panel seçimi kalır)", O.dilDegeri("en") === "en" && O.dilDegeri(undefined) === null);
ok("panelin sunduğu her dil kodu şemadan geçer", tumDiller.filter(function (d) { return d; }).every(function (d) { return O.dogrula("suflo_altyazi_olustur", { dil: d }).ok && O.dilDegeri(d) === d; }),
  tumDiller.filter(function (d) { return d && !O.dogrula("suflo_altyazi_olustur", { dil: d }).ok; }).join(","));
var kapsamlar = (html.slice(html.indexOf('id="cap-scope"'), html.indexOf("</div>", html.indexOf('id="cap-scope"'))).match(/data-s="([a-z]+)"/g) || []).map(function (x) { return x.slice(8, -1); });
ok("şemadaki her kapsam paneldeki bir kapsam düğmesi", olustur.kapsam.enum.every(function (k) { return kapsamlar.indexOf(k) !== -1; }), js(kapsamlar));
var uzunluklar = secenekler("cap-maxlen");
ok("mod her mevcut seçimde paneldeki bir seçeneğe eşlenir", olustur.mod.enum.every(function (m) {
  return uzunluklar.every(function (mevcut) { return uzunluklar.indexOf(O.satirDegeri(m, mevcut)) !== -1; });
}));
// İnceleme bulgusu: mod:'satir' kullanıcının "2 satır × 42" düzenini sessizce l42 yapıyordu
ok("mod 'satir' kullanıcının satır düzenini korur (2 satır × 42, N kelime, 60 karakter)", O.satirDegeri("satir", "c42x2") === "c42x2" && O.satirDegeri("satir", "w3") === "w3" && O.satirDegeri("satir", "c60") === "c60");
ok("mod 'kelime' kelime zamanlı seçimi korur (Birikimli), aile değişirse varsayılan", O.satirDegeri("kelime", "kc") === "kc" && O.satirDegeri("kelime", "c42x2") === "k1" && O.satirDegeri("satir", "k1") === "l42");
ok("mod verilmezse seçim değişmez", O.satirDegeri(undefined, "c42x2") === "c42x2");
var buyuk = [];
for (var j = 0; j < 5000; j++) buyuk.push({ metin: "satır " + j });
var tb = O.temizle({ ok: true, liste: buyuk });
ok("diziler sınırlanır (varsayılan 500) ve kirpildi işaretlenir", tb.liste.length === O.DIZI_SINIRI && tb.kirpildi === true);
var tc = O.temizle({ ok: true, liste: buyuk }, { diziSiniri: O.ALTYAZI_SINIRI });
ok("altyazı okuma için 2000 sınırı", tc.liste.length <= O.ALTYAZI_SINIRI && tc.liste.length > 500);
var dev = [];
for (var k = 0; k < 2000; k++) dev.push({ metin: new Array(200).join("x") });
var td = O.temizle({ ok: true, liste: dev }, { diziSiniri: 2000 });
ok("çıktı 64 KB'yi aşmaz", JSON.stringify(td).length <= O.CIKTI_SINIRI && td.kirpildi === true, JSON.stringify(td).length);
ok("uzun metin kırpılır", O.temizle({ a: new Array(10000).join("y") }).a.length <= 4001);
var derin = {}, p = derin;
for (var z = 0; z < 20; z++) { p.a = {}; p = p.a; }
ok("derinlik sınırı", JSON.stringify(O.temizle(derin)).length < 200);

/* ---------------- MCP araç listesi ---------------- */
var araclar = O.araclar();
ok("tools/list: her eylem için araç, JSON Schema additionalProperties false", araclar.length === O.EYLEMLER.length && araclar.every(function (a) {
  return a.inputSchema.type === "object" && a.inputSchema.additionalProperties === false && typeof a.description === "string";
}));
var kafa = araclar.filter(function (a) { return a.name === "suflo_oynatma_kafasi"; })[0];
ok("gerekli alan ve sınırlar şemada", js(kafa.inputSchema.required) === '["saniye"]' && kafa.inputSchema.properties.saniye.minimum === 0 && kafa.inputSchema.properties.saniye.maximum === 86400);
var mk = araclar.filter(function (a) { return a.name === "suflo_marker_ekle"; })[0];
ok("iç içe dizi şeması", mk.inputSchema.properties.markerlar.type === "array" && mk.inputSchema.properties.markerlar.maxItems === 200 && mk.inputSchema.properties.markerlar.items.additionalProperties === false);
// İnceleme bulgusu: uyarı yalnız 4 okuma aracındaydı; sessizlik analizi (klip adı), kesimler (kopya sekans adı),
// doktor ve iş durumu da kullanıcı içeriği döner. Artık her araçta, bir kez.
ok("her aracın açıklaması güvenilmez içerik uyarısı taşır (klip, sekans, iz, marker adı, transkript), bir kez", araclar.every(function (a) {
  return (a.description.match(/untrusted user content/g) || []).length === 1 && /sequence/.test(a.description) && /clip/.test(a.description);
}), araclar.filter(function (a) { return (a.description.match(/untrusted user content/g) || []).length !== 1; }).map(function (a) { return a.name; }).join(","));
ok("kullanıcı adı döndüren araçlar dahil (analiz, kesimler, doktor, iş durumu)", ["suflo_sessizlik_analiz", "suflo_sessizlik_kes", "suflo_metinden_kes", "suflo_hiz_rampasi", "suflo_doktor", "suflo_is_durumu", "suflo_baglam"].every(function (n) {
  return /untrusted user content/.test(araclar.filter(function (a) { return a.name === n; })[0].description);
}));
ok("ipuçları: okuma readOnly, yıkıcı destructive", araclar.every(function (a) {
  var e = O.eylem(a.name);
  return a.annotations.readOnlyHint === (e.sinif === "oku") && a.annotations.destructiveHint === (e.sinif === "yikici") && a.annotations.openWorldHint === false;
}));

/* ---------------- Onay özeti, etkinlik, iş tablosu, bağlantı ---------------- */
ok("onay özeti Türkçe", O.ozet("suflo_sessizlik_kes", {}) === "Sessizlikleri kes (kopyada)" && O.ozet("suflo_marker_ekle", { markerlar: [{ saniye: 1 }, { saniye: 2 }], bolum: true }) === "Marker ekle: 2 bölüm");
var et = [];
for (var n = 0; n < 60; n++) et = O.etkinlikEkle(et, { zaman: n, ad: "suflo_baglam", sonuc: n % 2 ? "ok" : "hata", kod: "x", sure: 3 });
ok("etkinlik listesi son 50", et.length === 50 && et[0].zaman === 10 && et[49].zaman === 59);
var it = O.isTablosu(function () { return "ABC"; });
var id1 = it.ekle("altyazi");
ok("iş kimliği desene uyar ve dogrula'dan geçer", /^is_[a-z0-9]+$/.test(id1) && O.dogrula("suflo_is_durumu", { is: id1 }).ok, id1);
ok("iş durumu: sürüyor → bitti", it.oku(id1).durum === "suruyor" && (it.bitir(id1, true, { satir: 3 }), it.oku(id1).durum === "bitti" && it.oku(id1).sonuc.satir === 3));
var id2 = it.ekle("altyazi");
it.bitir(id2, false, "hata!");
ok("iş durumu: hata", it.oku(id2).durum === "hata" && it.oku(id2).hata === "hata!" && it.oku("is_yok") === null);
// İnceleme bulgusu: başarısız işin hata KODU (pro_gerekli…) kayboluyordu, yalnız mesaj kalıyordu
var id3 = it.ekle("altyazi");
it.bitir(id3, false, { hata: "pro_gerekli", mesaj: "needs Pro" });
ok("iş durumu: hata kodu ve mesajı ayrı tutulur", it.oku(id3).durum === "hata" && it.oku(id3).kod === "pro_gerekli" && it.oku(id3).hata === "needs Pro", js(it.oku(id3)));
var tok = new Array(65).join("a");
ok("bağlantı dosyası doğrulaması", O.baglantiGecerli({ v: 1, port: 5000, token: tok }) && !O.baglantiGecerli({ v: 1, port: 0, token: tok }) &&
  !O.baglantiGecerli({ v: 1, port: 5000, token: "kisa" }) && !O.baglantiGecerli({ v: 2, port: 5000, token: tok }) && !O.baglantiGecerli(null));
ok("Claude Desktop JSON ve Claude Code komutu", JSON.parse(O.claudeDesktopJson("C:\\S\\mcp\\suflo-mcp.js")).mcpServers.suflo.command === "node" &&
  JSON.parse(O.claudeDesktopJson("/a/mcp/suflo-mcp.js")).mcpServers.suflo.args[0] === "/a/mcp/suflo-mcp.js" &&
  O.claudeCodeKomutu("/a b/mcp/suflo-mcp.js") === 'claude mcp add suflo -- node "/a b/mcp/suflo-mcp.js"');

/* ---------------- 3.4.1 istemci bağlantı durumu ---------------- */
ok("istemci adı yalnız bilinen tam adlardan: claude-ai → desktop, claude-code → code, gerisi diger",
  O.istemciKodu("claude-ai") === "desktop" && O.istemciKodu("Claude-Code") === "code" && O.istemciKodu("claude") === "diger" &&
  O.istemciKodu("cursor") === "diger" && O.istemciKodu(undefined) === "diger" && O.istemciKodu({}) === "diger");
ok("istemciAdi: diger için ad yok", O.istemciAdi("desktop") === "Claude Desktop" && O.istemciAdi("code") === "Claude Code" && O.istemciAdi("diger") === "");
var T0 = 1000000;
ok("köprü kapalıyken durum 'kapali' (eski temas gösterilmez)", O.istemciDurumu({ desktop: { son: T0, veda: false } }, false, T0 + 1).durum === "kapali");
ok("temas yokken 'bekliyor'", O.istemciDurumu({}, true, T0).durum === "bekliyor" && O.istemciDurumu(null, true, T0).durum === "bekliyor");
var dB = O.istemciDurumu({ desktop: { son: T0, veda: false } }, true, T0 + 30000);
ok("taze nabız: 'bagli', ad ve son iletişim", dB.durum === "bagli" && js(dB.adlar) === js(["Claude Desktop"]) && dB.son === T0, js(dB));
ok("eşikten (75 sn) eski nabız: 'koptu', bağlı gösterilmez", O.istemciDurumu({ desktop: { son: T0, veda: false } }, true, T0 + O.NABIZ_ESIGI + 1).durum === "koptu");
ok("veda gelince hemen 'koptu'", O.istemciDurumu({ code: { son: T0, veda: true } }, true, T0 + 10).durum === "koptu");
var dI = O.istemciDurumu({ desktop: { son: T0, veda: true }, code: { son: T0 + 5, veda: false }, diger: { son: T0 - 999999, veda: false } }, true, T0 + 20);
ok("iki istemci: kapanan listeden düşer, canlı olan kalır; tanınmayan eski istemci adı görünmez", dI.durum === "bagli" && js(dI.adlar) === js(["Claude Code"]) && dI.son === T0 + 5, js(dI));
var dD = O.istemciDurumu({ diger: { son: T0, veda: false } }, true, T0 + 1);
ok("tanınmayan istemci bağlıyken ad listesi boş (panel 'Bir MCP istemcisi bağlı' der)", dD.durum === "bagli" && dD.adlar.length === 0);
ok("nabız aralığı eşiğin yarısından kısa (iki nabız kaçmadan 'kesildi' denmez)", O.NABIZ_ARALIGI * 2 < O.NABIZ_ESIGI);

console.log("\n" + gecen + "/" + toplam + " gecti");
process.exit(gecen === toplam ? 0 : 1);
