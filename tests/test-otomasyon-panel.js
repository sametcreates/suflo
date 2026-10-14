// Suflo testi: Yapay zekâ köprüsü (MCP) panel yapıştırıcısı — js/otomasyon-panel.js
// Her eylemin yürütücüsü var ve panel düğmelerinin işlevlerini çağırır; Pro eylemde deneme
// hakkı kurulur (harcanmaz); açılışta sunucu/Premiere/ağ yok; Ayarlar kartı öğeleri index.html'de.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8"); }

function kur(dom, o) {
  dom = dom || {};
  o = o || {};
  var c = { call: [], baslat: [], harca: [], olustur: 0, dinle: [], goster: [], toast: [], sunucuBaslat: [], sureSiniri: [], proDinleyici: [] };
  var win = {};
  var sb = {
    window: win, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    Promise: Promise, JSON: JSON, Date: Date, Math: Math, Object: Object, Array: Array, String: String, Number: Number, RegExp: RegExp, Buffer: Buffer,
    // CEP'te olduğu gibi Node: köprü sunucusu gerçek loopback'te açılır (yalnız _ac ile)
    require: require, process: process,
    document: { getElementById: function (id) { return dom[id] || null; }, createElement: function () { return {}; }, body: {} },
    K: {
      nodeOK: true, VERSION: "3.4.0",
      call: function (fn, arg) { c.call.push([fn, arg]); return Promise.resolve({ ok: true, added: arg && arg.times ? arg.times.length : 0 }); },
      settingsPath: function () { return o.ayarYolu || "/tmp/Kesit/settings.json"; }, extensionPath: function () { return "/ext"; },
      path: require("path"), fs: { existsSync: function () { return false; }, unlinkSync: function () {} },
      hostMesgul: function () { return false; }, log: function () {}, ffmpegKurulu: function () { return "/x/ffmpeg"; },
      run: function () { return Promise.resolve({ code: 0, stdout: "v20.1.0\n" }); }
    },
    Pro: {
      denemeBaslat: function (f) { c.baslat.push(f); return true; },
      denemeHarca: function (f) { c.harca.push(f); return 2; },
      izinVar: function () { return { ok: true, deneme: true }; },
      gate: function () { return true; },
      // Pro durumu (pro.js'teki gibi): isPro + on(dinleyici); _degis lisans değişimini (emit) taklit eder
      _pro: o.pro !== undefined ? o.pro : true,
      isPro: function () { return sb.Pro._pro; },
      on: function (fn) { c.proDinleyici.push(fn); },
      _degis: function (v) { sb.Pro._pro = v; c.proDinleyici.forEach(function (fn) { fn({ pro: v }); }); }
    },
    KApp: {
      toast: function (m, t, sure, eylem) {
        c.toast.push({ m: m, t: t, sure: sure, eylem: eylem });
        if (dom.toasts) dom.toasts.ekle({ m: m, kaldirildi: false, remove: function () { this.kaldirildi = true; } });
      },
      goster: function (ad) { c.goster.push(ad); if (dom["tab-settings"]) dom["tab-settings"].aktif = ad === "settings"; }
    }
  };
  sb.window.addEventListener = function (ad) { c.dinle.push(ad); };
  sb.window.KApp = sb.KApp;   // panelde window === global: window.KApp ile KApp aynı nesne
  vm.createContext(sb);
  vm.runInContext(oku("js/otomasyon.js"), sb, { filename: "otomasyon.js" });
  vm.runInContext(oku("js/otomasyon-sunucu.js"), sb, { filename: "otomasyon-sunucu.js" });
  // sunucu kurulumu sayılır (açılışta HİÇ kurulmamalı)
  var gercek = sb.window.SufloOtomasyonSunucu.olustur;
  sb.window.SufloOtomasyonSunucu.olustur = function (s) {
    c.olustur++;
    var x = gercek(s);
    // açılış seçenekleri (deneme süre sınırı) ve süre sınırı değişimleri kaydedilir
    var b = x.baslat, ss = x.sureSiniri;
    x.baslat = function (a) { c.sunucuBaslat.push(a === undefined ? "yok" : a); return b(a); };
    x.sureSiniri = function (ms) { c.sureSiniri.push(ms); return ss(ms); };
    return x;
  };
  sb.window.KCaptions = {
    getSegments: function () { return [{ start: 0, end: 1.5, text: "Merhaba" }, { start: 1.5, end: 3, text: "dünya" }]; },
    mcpOlustur: function (a) { c.olustur_a = a; return new Promise(function (r) { setTimeout(function () { r({ ok: true, satir: 2 }); }, 30); }); },
    mesgulMu: function () { return false; }, engineReady: function () { return true; }, localEngineReady: function () { return false; }
  };
  sb.window.KCut = { mcpAnaliz: function (a) { c.analiz = a; return Promise.resolve({ ok: true, araliklar: [] }); }, mcpKes: function () { return Promise.resolve({ ok: true }); } };
  vm.runInContext(oku("js/otomasyon-panel.js"), sb, { filename: "otomasyon-panel.js" });
  return { sb: sb, c: c, P: sb.window.KOtomasyon, O: sb.window.SufloOtomasyon };
}

function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

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

  /* ---- Zoom / Hız Rampası: modülün açık sonucu (meşgulken dönen çağrı başarı sayılmaz) ---- */
  // inceleme bulgusu: KZoom.calistir / KHizRampasi.uygula meşgulken hiçbir şey yapmadan dönüyordu ve
  // köprü durum satırındaki eski "analiz ediliyor…" metnine bakıp ok:true diyordu
  t.sb.window.KZoom = { calistir: function () { return Promise.resolve({ ok: false, hata: "mesgul", mesaj: "Auto Zoom is already running." }); } };
  r = await t.P._yurut("suflo_zoom", {}, {});
  ok("zoom meşgulken ok:false mesgul", r.ok === false && r.hata === "mesgul", js(r));
  t.sb.window.KZoom = { calistir: function () { return Promise.resolve(undefined); } };
  r = await t.P._yurut("suflo_zoom", {}, {});
  ok("zoom sonuç döndürmeden biterse başarı sayılmaz", r.ok === false && r.hata === "uygulanamadi", js(r));
  t.sb.window.KZoom = { calistir: function () { return Promise.resolve({ ok: true, hareket: 4 }); } };
  r = await t.P._yurut("suflo_zoom", {}, {});
  ok("zoom başarısı modülün sonucundan", r.ok === true && r.hareket === 4, js(r));
  t.sb.window.KHizRampasi = { uygula: function () { return Promise.resolve({ ok: false, hata: "mesgul", mesaj: "Speed Ramp is already running." }); } };
  r = await t.P._yurut("suflo_hiz_rampasi", {}, {});
  ok("hız rampası meşgulken ok:false mesgul", r.ok === false && r.hata === "mesgul", js(r));
  t.sb.window.KHizRampasi = { uygula: function () { return Promise.resolve(undefined); } };
  r = await t.P._yurut("suflo_hiz_rampasi", {}, {});
  ok("hız rampası kapıdan dönerse (undefined) başarı sayılmaz", r.ok === false, js(r));
  var zs = oku("js/zoom.js"), hs = oku("js/hiz-rampasi.js");
  ok("zoom.js calistir / hiz-rampasi.js uygula meşgul dalı açık sonuç döner", /if \(busy\) return \{ ok: false, hata: "mesgul"/.test(zs) && /if \(mesgul\) return \{ ok: false, hata: "mesgul"/.test(hs) &&
    /return \{ ok: true, hareket: plan\.toggles/.test(zs) && /return sonuc;\n  \}/.test(hs.replace(/\r\n/g, "\n")));

  /* ---- onay kartı: Ayarlar sekmesine geçer, bekleyen kart değiştirilmez ---- */
  function eleman(id) {
    var e = { id: id, hidden: false, disabled: false, textContent: "", dinle: {}, kaydirildi: 0,
      addEventListener: function (ad, fn) { e.dinle[ad] = fn; }, scrollIntoView: function () { e.kaydirildi++; } };
    return e;
  }
  var dom = {};
  ["mcp-ac", "mcp-onay-kart", "mcp-onay-ozet", "mcp-onay-sure", "mcp-onayla", "mcp-reddet", "tab-settings"].forEach(function (id) { dom[id] = eleman(id); });
  dom["mcp-ac"].classList = { toggle: function () {} };
  dom["mcp-onay-kart"].hidden = true;
  dom.toasts = { liste: [], ekle: function (x) { this.liste.push(x); this.lastElementChild = x; }, lastElementChild: null };
  var u = kur(dom);
  u.P.init();
  ok("init: Onayla / Reddet düğmeleri bağlanır, sunucu açılmaz", typeof dom["mcp-onayla"].dinle.click === "function" && typeof dom["mcp-reddet"].dinle.click === "function" && u.c.olustur === 0 && !u.P.acikMi());
  var p1 = u.P._onayIste("suflo_sessizlik_kes", {}, "Sessizlikleri kes (kopyada)", 1500);
  ok("onay kartı açılınca Ayarlar sekmesine geçilir ve kart görünür kaydırılır (başka sekmedeyken gizli kalmasın)",
    js(u.c.goster) === '["settings"]' && dom["tab-settings"].aktif === true && dom["mcp-onay-kart"].hidden === false && dom["mcp-onay-kart"].kaydirildi === 1, js(u.c.goster));
  var bildirim = u.c.toast[u.c.toast.length - 1];
  ok("bildirim süre boyunca kalır ve karta götüren düğmesi var", bildirim.sure === 1500 && bildirim.eylem && bildirim.eylem.metin === "Onay kartını göster" && typeof bildirim.eylem.fn === "function", js(bildirim));
  ok("Onayla kart belirdiği an kısa süre kapalı (yanlış tık onay sayılmasın)", dom["mcp-onayla"].disabled === true);
  var p2sonuc = "bekliyor";
  u.P._onayIste("suflo_hiz_rampasi", {}, "Hız rampası uygula", 1500).then(function (v) { p2sonuc = v; });
  await bekle(20);
  ok("bekleyen kart varken ikinci istek kartı DEĞİŞTİRMEZ, hemen reddedilir; ilki beklemede kalır",
    p2sonuc === false && dom["mcp-onay-ozet"].textContent === "Sessizlikleri kes (kopyada)" && dom["mcp-onay-kart"].hidden === false);
  await bekle(900);
  ok("kısa kilitten sonra Onayla açılır", dom["mcp-onayla"].disabled === false);
  var p1sonuc = "bekliyor";
  p1.then(function (v) { p1sonuc = v; });
  dom["mcp-onayla"].dinle.click();
  await bekle(20);
  ok("Onayla: ilk istek onaylanır, kart kapanır, bildirimi kaldırılır", p1sonuc === true && dom["mcp-onay-kart"].hidden === true && dom.toasts.liste[0].kaldirildi === true, String(p1sonuc));
  var p3 = u.P._onayIste("suflo_metinden_kes", {}, "Konuşmadan kes (kopyada)", 600);
  var p3sonuc = await p3;
  ok("yanıt gelmezse süre dolunca reddedilir", p3sonuc === false && dom["mcp-onay-kart"].hidden === true);

  /* ---- Pro / deneme oturumu (inceleme bulgusu) ---- */
  // Deneme hakkıyla açılan köprü, çağrılar boşta sayacını sıfırladıkça süresiz açık kalıyordu; Pro yalnız
  // açılışta denetleniyordu (Pro.deactivate / iade sonrası köprü panel yeniden yüklenene kadar açık kalıyordu)
  var os = require("os");
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-mcp-panel-"));
  function kartDom() {
    var d = {};
    ["mcp-ac", "mcp-jeton", "mcp-acik-rozet", "mcp-durum", "mcp-node", "mcp-onay-kart"].forEach(function (id) { d[id] = eleman(id); d[id].className = ""; });
    d["mcp-ac"].classList = { toggle: function () {} };
    return d;
  }
  var bagFile = path.join(tmp, "otomasyon.json");
  var dd = kartDom();
  var dn = kur(dd, { pro: false, ayarYolu: path.join(tmp, "settings.json") });
  dn.P.init();
  ok("init: Pro durumu dinlenir (yalnız dinleyici kaydı, sunucu yok)", dn.c.proDinleyici.length === 1 && dn.c.olustur === 0);
  await dn.P._ac();
  ok("ücretsiz + deneme hakkı: köprü açılır, 'deneme' oturumu, hak açılınca düşer",
    dn.P.acikMi() && dn.P._oturum() === "deneme" && js(dn.c.harca) === '["mcp"]' && fs.existsSync(bagFile), dn.P._oturum() + " " + js(dn.c.harca));
  ok("deneme oturumu 30 dakikalık MUTLAK süre sınırıyla açılır (çağrılar uzatmaz)",
    dn.P.DENEME_OTURUMU === 30 * 60000 && dn.c.sunucuBaslat.length === 1 && dn.c.sunucuBaslat[0] && dn.c.sunucuBaslat[0].sure === 30 * 60000, js(dn.c.sunucuBaslat));
  ok("durum satırı deneme oturumunu ve süresini söyler", /deneme/.test(dd["mcp-durum"].textContent) && /30 dakika/.test(dd["mcp-durum"].textContent), dd["mcp-durum"].textContent);
  dn.sb.Pro._degis(false);   // başka bir Pro olayı (ör. hak sayısı değişti): deneme oturumu sürer
  ok("deneme oturumunda Pro olayı (hâlâ ücretsiz) köprüyü kapatmaz", dn.P.acikMi() && dn.P._oturum() === "deneme");
  // süre dolunca kapanır (sınır testte kısaltılır)
  dn.P._sunucu().sureSiniri(40);
  await bekle(150);
  ok("deneme süresi dolunca köprü kapanır, dosya silinir, kullanıcıya söylenir",
    !dn.P.acikMi() && dn.P._oturum() === "" && !fs.existsSync(bagFile) && /deneme oturumu doldu/.test(dd["mcp-durum"].textContent) &&
    dn.c.toast.some(function (x) { return /deneme oturumu doldu/.test(x.m); }), dd["mcp-durum"].textContent);

  // deneme oturumunda Pro alınırsa süre sınırı kalkar
  dn.c.sureSiniri = [];
  await dn.P._ac();
  ok("ikinci deneme açılışı da süre sınırlı", dn.P._oturum() === "deneme" && dn.c.sunucuBaslat[dn.c.sunucuBaslat.length - 1].sure === 30 * 60000);
  dn.sb.Pro._degis(true);
  ok("deneme oturumunda Pro alınınca: oturum Pro'ya döner, süre sınırı kaldırılır (sureSiniri(0))",
    dn.P.acikMi() && dn.P._oturum() === "pro" && js(dn.c.sureSiniri) === "[0]" && !/deneme/.test(dd["mcp-durum"].textContent), js(dn.c.sureSiniri));
  // ... ve sonra lisans giderse köprü kapanır
  dn.sb.Pro._degis(false);
  ok("Pro'ya dönen oturumda lisans gidince köprü kapanır", !dn.P.acikMi() && dn.P._oturum() === "");

  // Pro ile açılan köprü: lisans gidince (Pro.deactivate / iade) hemen kapanır
  var dp = kartDom();
  var pp = kur(dp, { pro: true, ayarYolu: path.join(tmp, "settings.json") });
  pp.P.init();
  await pp.P._ac();
  ok("Pro kullanıcı: köprü süre sınırı OLMADAN açılır, deneme hakkı harcanmaz", pp.P.acikMi() && pp.P._oturum() === "pro" && pp.c.sunucuBaslat[0] === "yok", js(pp.c.sunucuBaslat));
  pp.sb.Pro._degis(true);
  ok("Pro olayı (hâlâ Pro): köprü açık kalır", pp.P.acikMi());
  pp.sb.Pro._degis(false);
  ok("Pro.deactivate / iade: köprü hemen kapanır, dosya silinir, kullanıcıya söylenir",
    !pp.P.acikMi() && !fs.existsSync(bagFile) && /Pro lisansı artık etkin değil/.test(dp["mcp-durum"].textContent) &&
    pp.c.toast.some(function (x) { return /Pro lisansı etkin değil/.test(x.m); }), dp["mcp-durum"].textContent);
  pp.sb.Pro._degis(false);
  ok("kapalı köprüde Pro olayı bir şey yapmaz", !pp.P.acikMi() && pp.c.sunucuBaslat.length === 1);
  try { fs.rmdirSync(tmp); } catch (e) {}

  /* ---- kaynak denetimleri ---- */
  var src = oku("js/otomasyon-panel.js");
  var init = src.slice(src.indexOf("function init()"), src.indexOf("return {", src.indexOf("function init()")));
  ok("init: K.call / K.run / sunucu açılışı yok (yalnız kalmış bağlantı dosyasını siler)", !/K\.call|K\.run|baslat\(|sunucuKur\(/.test(init) && /kalanDosyayiSil\(\)/.test(init));
  ok("panel kapanınca köprü kapanır (beforeunload + unload)", /beforeunload/.test(init) && /"unload"/.test(init));
  ok("evalScript ya da rastgele betik yok", !/evalScript|new Function|eval\(/.test(src));
  ok("köprüyü açmak Pro kapısından geçer, hak yalnız açılınca düşer", /Pro\.gate\("mcp", \{ deneme: true, yeniden: ac \}\)/.test(src) && src.indexOf('Pro.denemeHarca("mcp"') > src.indexOf("if (sonuc.ok) {"));
  ok("izinler bellekte, varsayılan: düzenleme kapalı, onay açık", /var izin = \{ duzenleme: false, onay: true \}/.test(src) && !/saveSettings/.test(src));
  // inceleme bulgusu: köprünün Pro penceresi başlığı "Bu ozellik" diyordu (FEATURE_LABELS'ta 'mcp' yoktu)
  var proSrc = oku("js/pro.js"), etiket = /\n\s+mcp:\s+'([^']+)'/.exec(proSrc);
  var enS = require(path.join(KOK, "i18n", "en.js"));
  var enSozluk = enS.strings || (enS.default && enS.default.strings) || {};
  ok("Pro penceresi köprüyü adıyla anar (FEATURE_LABELS.mcp + İngilizcesi)", !!etiket && /Yapay zekâ köprüsü/.test(etiket[1]) && !!enSozluk[etiket[1]], etiket && etiket[1]);
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
