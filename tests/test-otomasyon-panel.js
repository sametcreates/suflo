// Suflo testi: Yapay zekâ köprüsü (MCP) panel yapıştırıcısı — js/otomasyon-panel.js
// Her eylemin yürütücüsü var ve panel düğmelerinin işlevlerini çağırır; Pro eylemde deneme
// hakkı kurulur (harcanmaz); açılışta sunucu/Premiere/ağ yok; Ayarlar kartı öğeleri index.html'de.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8"); }

function kur() {
  var c = { call: [], baslat: [], harca: [], olustur: 0, dinle: [] };
  var win = {};
  var sb = {
    window: win, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    Promise: Promise, JSON: JSON, Date: Date, Math: Math, Object: Object, Array: Array, String: String, Number: Number, RegExp: RegExp, Buffer: Buffer,
    document: { getElementById: function () { return null; }, createElement: function () { return {}; }, body: {} },
    K: {
      nodeOK: true, VERSION: "3.4.0",
      call: function (fn, arg) { c.call.push([fn, arg]); return Promise.resolve({ ok: true, added: arg && arg.times ? arg.times.length : 0 }); },
      settingsPath: function () { return "/tmp/Kesit/settings.json"; }, extensionPath: function () { return "/ext"; },
      path: require("path"), fs: { existsSync: function () { return false; }, unlinkSync: function () {} },
      hostMesgul: function () { return false; }, log: function () {}, ffmpegKurulu: function () { return "/x/ffmpeg"; },
      run: function () { return Promise.resolve({ code: 0, stdout: "v20.1.0\n" }); }
    },
    Pro: {
      denemeBaslat: function (f) { c.baslat.push(f); return true; },
      denemeHarca: function (f) { c.harca.push(f); return 2; },
      izinVar: function () { return { ok: true, deneme: true }; },
      gate: function () { return true; }
    },
    KApp: { toast: function () {} }
  };
  sb.window.addEventListener = function (ad) { c.dinle.push(ad); };
  vm.createContext(sb);
  vm.runInContext(oku("js/otomasyon.js"), sb, { filename: "otomasyon.js" });
  vm.runInContext(oku("js/otomasyon-sunucu.js"), sb, { filename: "otomasyon-sunucu.js" });
  // sunucu kurulumu sayılır (açılışta HİÇ kurulmamalı)
  var gercek = sb.window.SufloOtomasyonSunucu.olustur;
  sb.window.SufloOtomasyonSunucu.olustur = function (s) { c.olustur++; return gercek(s); };
  sb.window.KCaptions = {
    getSegments: function () { return [{ start: 0, end: 1.5, text: "Merhaba" }, { start: 1.5, end: 3, text: "dünya" }]; },
    mcpOlustur: function (a) { c.olustur_a = a; return new Promise(function (r) { setTimeout(function () { r({ ok: true, satir: 2 }); }, 30); }); },
    mesgulMu: function () { return false; }, engineReady: function () { return true; }, localEngineReady: function () { return false; }
  };
  sb.window.KCut = { mcpAnaliz: function (a) { c.analiz = a; return Promise.resolve({ ok: true, araliklar: [] }); }, mcpKes: function () { return Promise.resolve({ ok: true }); } };
  vm.runInContext(oku("js/otomasyon-panel.js"), sb, { filename: "otomasyon-panel.js" });
  return { sb: sb, c: c, P: sb.window.KOtomasyon, O: sb.window.SufloOtomasyon };
}

async function main() {
  var t = kur();
  ok("her eylemin bir yürütücüsü var, fazlası yok", js(Object.keys(t.P._YURUT).sort()) === js(t.O.adlar().slice().sort()));
  t.P.init();
  ok("açılış: kart yokken hiçbir şey kurulmaz, Premiere'e çağrı yok", t.c.olustur === 0 && t.c.call.length === 0 && !t.P.acikMi());

  var r = await t.P._yurut("suflo_baglam", {}, { deneme: false });
  ok("okuma eylemi KS_getContext çağırır", r.ok && t.c.call[0][0] === "KS_getContext");
  await t.P._yurut("suflo_sessizlik_analiz", { esik_db: -40 }, { deneme: true });
  ok("Pro eylem + deneme: hak kurulur (denemeBaslat), harcanmaz; panel işlevine argüman geçer", js(t.c.baslat) === '["cut"]' && t.c.harca.length === 0 && t.c.analiz.esik_db === -40);
  await t.P._yurut("suflo_sessizlik_analiz", {}, { deneme: false });
  ok("Pro kullanıcıda deneme kurulmaz", t.c.baslat.length === 1);
  t.c.call = [];
  r = await t.P._yurut("suflo_marker_ekle", { markerlar: [{ saniye: 1, ad: "A" }, { saniye: 2, ad: "B" }, { saniye: 3, ad: "A" }] }, {});
  ok("markerlar ada göre gruplanır: KS_addMarkers ad başına bir kez", r.ok && r.eklenen === 3 && t.c.call.length === 2 && js(t.c.call[0][1]) === js({ name: "A", times: [1, 3] }), js(t.c.call));
  t.c.call = [];
  await t.P._yurut("suflo_marker_ekle", { markerlar: [{ saniye: 5, ad: "Giriş" }], bolum: true }, {});
  ok("bolum: true → KS_addChapterMarkers", t.c.call[0][0] === "KS_addChapterMarkers" && t.c.call[0][1].chapters[0].name === "Giriş");
  r = await t.P._yurut("suflo_altyazi_oku", { baslangic: 1, adet: 5 }, {});
  ok("altyazı oku: dilim, yalnız metin ve zaman", r.toplam === 2 && r.satirlar.length === 1 && js(r.satirlar[0]) === js({ baslangic: 1.5, bitis: 3, metin: "dünya" }));
  r = await t.P._yurut("suflo_altyazi_olustur", { kapsam: "entire" }, {});
  ok("altyazı oluştur: hemen iş kimliği döner", r.ok && /^is_/.test(r.is) && t.c.olustur_a.kapsam === "entire");
  var d1 = await t.P._yurut("suflo_is_durumu", { is: r.is }, {});
  await new Promise(function (ok2) { setTimeout(ok2, 60); });
  var d2 = await t.P._yurut("suflo_is_durumu", { is: r.is }, {});
  ok("iş durumu: sürüyor → bitti", d1.durum === "suruyor" && d2.durum === "bitti" && d2.sonuc.satir === 2, js([d1, d2]));
  r = await t.P._yurut("suflo_is_durumu", { is: "is_yok" }, {});
  ok("bilinmeyen iş kimliği hata", r.ok === false && r.hata === "bilinmeyen_is");
  r = await t.P._yurut("execute_extendscript", {}, {});
  ok("listede olmayan ad yürütülmez", r.ok === false && r.hata === "bilinmeyen_eylem");

  /* ---- kaynak denetimleri ---- */
  var src = oku("js/otomasyon-panel.js");
  var init = src.slice(src.indexOf("function init()"), src.indexOf("return {", src.indexOf("function init()")));
  ok("init: K.call / K.run / sunucu açılışı yok (yalnız kalmış bağlantı dosyasını siler)", !/K\.call|K\.run|baslat\(|sunucuKur\(/.test(init) && /kalanDosyayiSil\(\)/.test(init));
  ok("panel kapanınca köprü kapanır (beforeunload + unload)", /beforeunload/.test(init) && /"unload"/.test(init));
  ok("evalScript ya da rastgele betik yok", !/evalScript|new Function|eval\(/.test(src));
  ok("köprüyü açmak Pro kapısından geçer, hak yalnız açılınca düşer", /Pro\.gate\("mcp", \{ deneme: true, yeniden: ac \}\)/.test(src) && src.indexOf('Pro.denemeHarca("mcp"') > src.indexOf("if (sonuc.ok) {"));
  ok("izinler bellekte, varsayılan: düzenleme kapalı, onay açık", /var izin = \{ duzenleme: false, onay: true \}/.test(src) && !/saveSettings/.test(src));
  ok("Pro.izinVar ile etkileşimsiz kapı", /Pro\.izinVar\(f\)/.test(src) && /function izinVar\(feature\)/.test(oku("js/pro.js")) && /izinVar: izinVar/.test(oku("js/pro.js")));
  var html = oku("index.html");
  var idler = (src.match(/el\("([a-z0-9-]+)"\)/g) || []).map(function (x) { return x.slice(4, -2); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  var eksik = idler.filter(function (id) { return id !== "zoom-status" && id !== "hiz-status" ? html.indexOf('id="' + id + '"') === -1 : html.indexOf('id="' + id + '"') === -1; });
  ok("Ayarlar kartının tüm öğeleri index.html'de", eksik.length === 0, eksik.join(","));
  ok("kart 'Deneysel' etiketli, varsayılan kapalı (aç düğmesi)", /Yapay zekâ köprüsü \(MCP\) <span class="mcp-deneysel">Deneysel<\/span>/.test(html) && />Köprüyü aç</.test(html) && /id="mcp-onay" checked/.test(html) && !/id="mcp-duzenleme" checked/.test(html));
  ok("app.js kartı başlatır", /KOtomasyon\.init\(\)/.test(oku("js/app.js")));

  console.log("\n" + gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}
main().catch(function (e) { console.log("FAIL beklenmeyen hata " + (e && e.stack)); process.exit(1); });
