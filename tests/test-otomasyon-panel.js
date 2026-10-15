// Suflo testi: Yapay zekâ köprüsü (MCP) panel yapıştırıcısı — js/otomasyon-panel.js
// Her eylemin yürütücüsü var ve panel düğmelerinin işlevlerini çağırır; Pro eylemde deneme
// hakkı kurulur (harcanmaz); köprüyü açmak yalnız Pro (deneme yok); açılışta sunucu/Premiere/ağ yok,
// başka sürecin bağlantı dosyası silinmez; Ayarlar kartı öğeleri index.html'de.
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 300) + "]" : "")); }
function js(x) { return JSON.stringify(x); }
function oku(f) { return fs.readFileSync(path.join(KOK, f), "utf8"); }

function kur(dom, o) {
  dom = dom || {};
  o = o || {};
  var c = { call: [], baslat: [], harca: [], olustur: 0, dinle: [], goster: [], toast: [], sunucuBaslat: [], sureSiniri: [], proDinleyici: [], gate: [] };
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
      path: require("path"), fs: o.fs || { existsSync: function () { return false; }, unlinkSync: function () {} },
      hostMesgul: function () { return false; }, log: function () {}, ffmpegKurulu: function () { return "/x/ffmpeg"; },
      run: function () { return Promise.resolve({ code: 0, stdout: "v20.1.0\n" }); }
    },
    Pro: {
      denemeBaslat: function (f) { c.baslat.push(f); return true; },
      denemeHarca: function (f) { c.harca.push(f); return 2; },
      izinVar: function () { return { ok: true, deneme: true }; },
      // pro.js gate gibi: Pro ise geçer; ücretsizde yalnız deneme kabul eden çağrı (kurulu hak varsayılır) geçer,
      // denemesiz çağrı upsell açar ve geçmez
      gate: function (f, op) { c.gate.push([f, op === undefined ? "yok" : op]); return sb.Pro._pro || !!(op && op.deneme === true); },
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
    // captions.js gibi: go() işi başlatınca geri.basladi() çağrılır, iş sonra biter
    mcpOlustur: function (a, geri) {
      c.olustur_a = a;
      if (o.mcpOlustur) return o.mcpOlustur(a, geri);
      return new Promise(function (r) { if (geri && geri.basladi) geri.basladi(); setTimeout(function () { r({ ok: true, satir: 2 }); }, 30); });
    },
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

  /* ---- suflo_altyazi_olustur: iş kimliği yalnız iş başlayınca (inceleme bulgusu) ---- */
  // Eskiden iş kimliği go() başlamadan veriliyordu: go()'nun anında reddi (çevrimdışı çeviri seçili, Pro / hak yok ->
  // pro_gerekli) ok:true "suruyor" olarak dönüyor, iş kaydında da kod kayboluyordu (shim isError:false veriyordu)
  var ra = kur(null, { mcpOlustur: function () { return Promise.resolve({ ok: false, hata: "pro_gerekli", mesaj: "Offline English translation is selected in the Captions tab and needs Suflo Pro." }); } });
  r = await ra.P._yurut("suflo_altyazi_olustur", { kapsam: "clip" }, {});
  ok("başlamadan reddedilen altyazı işi: iş kimliği YOK, ok:false + pro_gerekli hemen döner", r.ok === false && r.hata === "pro_gerekli" && !r.is && /needs Suflo Pro/.test(r.mesaj), js(r));
  var rb = kur(null, { mcpOlustur: function (a, geri) {
    geri.basladi();
    return new Promise(function (res6) { setTimeout(function () { res6({ ok: false, hata: "motor", mesaj: "Whisper model missing." }); }, 30); });
  } });
  r = await rb.P._yurut("suflo_altyazi_olustur", {}, {});
  ok("başlayan iş: hemen iş kimliği", r.ok === true && /^is_/.test(r.is) && r.durum === "suruyor", js(r));
  await bekle(60);
  var rd = await rb.P._yurut("suflo_is_durumu", { is: r.is }, {});
  ok("başladıktan sonra başarısız iş: suflo_is_durumu ok:false + işin hata kodu (asistan 'bitti' sanmaz)", rd.ok === false && rd.hata === "motor" && /Whisper model missing/.test(rd.mesaj), js(rd));
  var rc = kur(null, { mcpOlustur: function () { return Promise.reject(new Error("beklenmeyen")); } });
  r = await rc.P._yurut("suflo_altyazi_olustur", {}, {});
  ok("başlamadan istisna: ok:false olusturulamadi (iş kimliği yok)", r.ok === false && r.hata === "olusturulamadi" && !r.is, js(r));

  /* ---- Pro: köprüyü açmak yalnız Pro, deneme hakkı yok (inceleme bulgusu) ---- */
  // Kurucu kademesi "enabling the bridge requires Pro": eskiden Pro.gate("mcp", { deneme: true }) ücretsiz
  // kullanıcıya 3 deneme oturumu veriyordu
  var os = require("os");
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suflo-mcp-panel-"));
  function kartDom() {
    var d = {};
    ["mcp-ac", "mcp-jeton", "mcp-acik-rozet", "mcp-durum", "mcp-node", "mcp-onay-kart", "mcp-onay-ozet", "mcp-onay-sure", "mcp-onayla", "mcp-reddet", "mcp-duzenleme"].forEach(function (id) { d[id] = eleman(id); d[id].className = ""; });
    d["mcp-ac"].classList = { toggle: function () {} };
    d["mcp-onay-kart"].hidden = true;
    return d;
  }
  var bagFile = path.join(tmp, "otomasyon.json");
  var dd = kartDom();
  var dn = kur(dd, { pro: false, ayarYolu: path.join(tmp, "settings.json") });
  dn.P.init();
  ok("init: Pro durumu dinlenir (yalnız dinleyici kaydı, sunucu yok)", dn.c.proDinleyici.length === 1 && dn.c.olustur === 0);
  await dn.P._ac();
  ok("ücretsiz hesap: köprü AÇILMAZ (deneme hakkı yok), sunucu kurulmaz, dosya yazılmaz, hak harcanmaz",
    !dn.P.acikMi() && dn.c.olustur === 0 && !fs.existsSync(bagFile) && dn.c.harca.length === 0, js(dn.c.harca));
  ok("açılış kapısı Pro.gate('mcp') deneme seçeneği OLMADAN (upsell'de 'Ücretsiz dene' yok)", js(dn.c.gate) === '[["mcp","yok"]]', js(dn.c.gate));
  dn.sb.Pro._degis(false);
  ok("kapalı köprüde Pro olayı bir şey yapmaz", !dn.P.acikMi() && dn.c.olustur === 0);

  // Pro ile açılan köprü: süre sınırı yok; lisans gidince (Pro.deactivate / iade) hemen kapanır
  var dp = kartDom();
  var pp = kur(dp, { pro: true, ayarYolu: path.join(tmp, "settings.json") });
  pp.P.init();
  await pp.P._ac();
  ok("Pro kullanıcı: köprü süre sınırı OLMADAN açılır, deneme hakkı harcanmaz", pp.P.acikMi() && pp.c.sunucuBaslat[0] === "yok" && pp.c.harca.length === 0 && fs.existsSync(bagFile), js(pp.c.sunucuBaslat));
  ok("durum satırı açık köprüyü söyler, 'deneme' demez", /Köprü açık/.test(dp["mcp-durum"].textContent) && !/deneme/.test(dp["mcp-durum"].textContent), dp["mcp-durum"].textContent);
  pp.sb.Pro._degis(true);
  ok("Pro olayı (hâlâ Pro): köprü açık kalır", pp.P.acikMi());

  /* ---- Düzenlemeye izin ver kapatılınca bekleyen onay kartı kapanır (inceleme bulgusu) ---- */
  dp["mcp-duzenleme"].checked = true;
  dp["mcp-duzenleme"].dinle.change();
  ok("izin kutusu belleğe yansır", pp.P._izin.duzenleme === true);
  var kartSonuc = "bekliyor";
  pp.P._onayIste("suflo_sessizlik_kes", {}, "Sessizlikleri kes (kopyada)", 5000).then(function (v) { kartSonuc = v; });
  await bekle(20);
  ok("onay kartı açık", dp["mcp-onay-kart"].hidden === false && kartSonuc === "bekliyor");
  dp["mcp-duzenleme"].checked = false;
  dp["mcp-duzenleme"].dinle.change();
  await bekle(20);
  ok("izin kapatılınca kart hemen kapanır, istek onaylanmamış sayılır (sunucu izin_yok döner)", kartSonuc === false && dp["mcp-onay-kart"].hidden === true && pp.P._izin.duzenleme === false, String(kartSonuc));

  /* ---- Yeni jeton yazılamazsa: istisna tıklamadan kaçmaz, köprü kapanır, söylenir (inceleme bulgusu) ---- */
  var jetonTik = dp["mcp-jeton"].dinle.click;
  var gercekYenile = pp.P._sunucu().jetonYenile;
  pp.P._sunucu().jetonYenile = function () { var e = new Error("EPERM: operation not permitted, rename"); e.code = "EPERM"; throw e; };
  var kacti = null;
  try { jetonTik(); } catch (e) { kacti = e; }
  ok("jetonYenile istisnası tıklama işleyicisinden kaçmaz; köprü kapanır, dosya silinir", kacti === null && !pp.P.acikMi() && !fs.existsSync(bagFile), String(kacti));
  ok("durum satırı ve bildirim söyler (yeşil AÇIK kalmaz)", /Jeton yenilenemedi \(EPERM\)/.test(dp["mcp-durum"].textContent) && /bad/.test(dp["mcp-durum"].className) &&
    pp.c.toast.some(function (x) { return /Jeton yenilenemedi/.test(x.m) && x.t === "bad"; }) && dp["mcp-acik-rozet"].hidden === true, dp["mcp-durum"].textContent);
  await pp.P._ac();
  // sunucu dosyayı yazamayıp kendisi kapatırsa ({ ok:false, hata }) da aynı
  pp.P._sunucu().jetonYenile = function () { pp.P._sunucu().durdur("dosya"); return { ok: false, hata: "ENOSPC" }; };
  jetonTik();
  ok("{ ok:false, ENOSPC }: köprü kapalı, durum satırında neden", !pp.P.acikMi() && /ENOSPC/.test(dp["mcp-durum"].textContent), dp["mcp-durum"].textContent);
  pp.P._sunucu().jetonYenile = gercekYenile;
  await pp.P._ac();
  var eskiJeton = pp.P._sunucu()._token();
  jetonTik();
  ok("başarılı Yeni jeton: köprü açık, dosyada yeni jeton, bildirim", pp.P.acikMi() && JSON.parse(fs.readFileSync(bagFile, "utf8")).token === pp.P._sunucu()._token() &&
    pp.P._sunucu()._token() !== eskiJeton && pp.c.toast.some(function (x) { return /Yeni jeton oluşturuldu/.test(x.m); }));

  pp.sb.Pro._degis(false);
  ok("Pro.deactivate / iade: köprü hemen kapanır, dosya silinir, kullanıcıya söylenir",
    !pp.P.acikMi() && !fs.existsSync(bagFile) && /Pro lisansı artık etkin değil/.test(dp["mcp-durum"].textContent) &&
    pp.c.toast.some(function (x) { return /Pro lisansı etkin değil/.test(x.m); }), dp["mcp-durum"].textContent);
  var acilis = pp.c.sunucuBaslat.length;
  pp.sb.Pro._degis(false);
  ok("kapalı köprüde Pro olayı bir şey yapmaz (Pro)", !pp.P.acikMi() && pp.c.sunucuBaslat.length === acilis);

  /* ---- açılışta kalan bağlantı dosyası: yalnız sahibi ölmüşse silinir (inceleme bulgusu) ---- */
  // Aynı anda açık iki Premiere sürümü aynı Kesit klasörünü paylaşır: eski kod, diğer sürümün açık köprüsünün
  // dosyasını her panel açılışında siliyordu (o köprü "AÇIK" görünürken Claude "köprü kapalı" alıyordu)
  var kf = kur(kartDom(), { ayarYolu: path.join(tmp, "settings.json"), fs: fs });
  function dosyaYaz(icerik) { fs.writeFileSync(bagFile, typeof icerik === "string" ? icerik : JSON.stringify(icerik)); }
  var tok = new Array(65).join("a");
  var yasayan = process.ppid;   // bu testi başlatan süreç: yaşıyor, bizden farklı
  dosyaYaz({ v: 1, port: 5000, token: tok, pid: yasayan, baslangic: "x" });
  kf.P._kalanDosyayiSil();
  ok("başka bir yaşayan sürecin (açık köprü) dosyası SİLİNMEZ", fs.existsSync(bagFile), yasayan);
  var olu = require("child_process").spawnSync(process.execPath, ["-e", ""]).pid;
  dosyaYaz({ v: 1, port: 5000, token: tok, pid: olu, baslangic: "x" });
  kf.P._kalanDosyayiSil();
  ok("süreci ölmüş (çökme) dosya silinir", !fs.existsSync(bagFile), olu);
  dosyaYaz({ v: 1, port: 5000, token: tok, pid: process.pid, baslangic: "x" });
  kf.P._kalanDosyayiSil();
  ok("bu sürecin kendi kalmış dosyası (panel yeniden yüklendi) silinir", !fs.existsSync(bagFile));
  dosyaYaz("{bozuk");
  kf.P._kalanDosyayiSil();
  ok("okunamayan dosya silinir", !fs.existsSync(bagFile));
  try { fs.rmdirSync(tmp); } catch (e) {}

  /* ---- kaynak denetimleri ---- */
  var src = oku("js/otomasyon-panel.js");
  var init = src.slice(src.indexOf("function init()"), src.indexOf("return {", src.indexOf("function init()")));
  ok("init: K.call / K.run / sunucu açılışı yok (yalnız kalmış bağlantı dosyasını siler)", !/K\.call|K\.run|baslat\(|sunucuKur\(/.test(init) && /kalanDosyayiSil\(\)/.test(init));
  ok("panel kapanınca köprü kapanır (beforeunload + unload)", /beforeunload/.test(init) && /"unload"/.test(init));
  ok("evalScript ya da rastgele betik yok", !/evalScript|new Function|eval\(/.test(src));
  ok("köprüyü açmak denemesiz Pro kapısından geçer, köprü hakkı harcanmaz", /Pro\.gate\("mcp"\)\) return;/.test(src) && src.indexOf('Pro.denemeHarca("mcp"') === -1 && !/Pro\.gate\("mcp",/.test(src));
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
