/* Pro lisans sahipligi, cache ve private icerik kimligi sozlesmesi. */
var fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm"), events = require("events");
var ROOT = path.join(__dirname, "..");
var TMP = path.join(os.tmpdir(), "suflo-pro-license-test");
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
fs.mkdirSync(TMP, { recursive: true });

var replies = [], requests = [];
function reply(data, status) { replies.push({ status: status || 200, data: data }); }
var fakeHttps = {
  request: function (opts, cb) {
    var req = new events.EventEmitter(), body = "";
    req.setTimeout = function () {};
    req.write = function (chunk) { body += String(chunk); };
    req.end = function () {
      var next = replies.shift();
      if (!next) { req.emit("error", new Error("missing fake response")); return; }
      requests.push({ path: opts.path, body: body });
      var res = new events.EventEmitter();
      res.statusCode = next.status;
      res.setEncoding = function () {};
      cb(res);
      process.nextTick(function () { res.emit("data", JSON.stringify(next.data)); res.emit("end"); });
    };
    req.destroy = function (err) { req.emit("error", err); };
    return req;
  }
};
function owned(extra) {
  var base = {
    activated: true, valid: true, error: null,
    license_key: { status: "active", expires_at: null },
    instance: { id: "instance-owned" },
    meta: { store_id: 454844, product_id: 1302656, variant_id: 1, customer_email: "editor@example.com" }
  };
  Object.keys(extra || {}).forEach(function (k) { base[k] = extra[k]; });
  return base;
}
var DENEME_SRC = fs.readFileSync(path.join(ROOT, "js", "deneme.js"), "utf8");
var PRO_SRC = fs.readFileSync(path.join(ROOT, "js", "pro.js"), "utf8");

/* Upsell penceresi icin en kucuk sahte DOM: innerHTML'deki id'li ogeler getElementById ile bulunur */
function sahteDom() {
  var els = {}, html = "";
  var document = {
    activeElement: null,
    getElementById: function (id) { return els[id] || null; },
    createElement: function () {
      var e = { style: {}, parentNode: null, appendChild: function () {}, addEventListener: function () {} };
      Object.defineProperty(e, "innerHTML", { set: function (h) { e._html = h; }, get: function () { return e._html || ""; } });
      return e;
    },
    createTextNode: function (t) { return { t: t }; },
    addEventListener: function () {}, removeEventListener: function () {},
    head: { appendChild: function () {} },
    body: {
      appendChild: function (w) {
        w.parentNode = document.body; html = w._html || "";
        var re = /<(\w+) id="([^"]+)"(?: class="([^"]*)")?[^>]*>([^<]*)/g, m;
        while ((m = re.exec(html))) els[m[2]] = { id: m[2], cls: m[3] || "", text: m[4], focus: function () { document.activeElement = this; } };
      },
      removeChild: function (w) { w.parentNode = null; Object.keys(els).forEach(function (k) { delete els[k]; }); }
    }
  };
  return { document: document, els: els, html: function () { return html; } };
}
function sahteLs() {
  var d = {};
  return { d: d, getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: function (k, v) { d[k] = String(v); } };
}
// Her senaryo taze bir panel: pro.js bellek durumu (kurulum, onbellek) paylasilmaz
function baglam(appdata, o) {
  o = o || {};
  var dom = sahteDom(), zaman = [], toastlar = [];
  var c = {
    console: console, Buffer: Buffer, process: { env: { APPDATA: appdata }, platform: "win32" },
    setTimeout: function (fn) { zaman.push(fn); return 1; }, clearTimeout: function () {},
    document: dom.document, localStorage: o.ls,
    KApp: { toast: function (m, t) { toastlar.push([m, t]); } },
    require: function (name) {
      if (name === "https") return fakeHttps;
      if (name === "os") return { hostname: function () { return "test-pc"; }, homedir: os.homedir };
      return require(name);
    }
  };
  c.window = c;
  vm.createContext(c);
  if (o.deneme !== false) vm.runInContext(DENEME_SRC, c, { filename: "js/deneme.js" });
  vm.runInContext(PRO_SRC, c, { filename: "js/pro.js" });
  c._dom = dom; c._zaman = zaman; c._toast = toastlar;
  return c;
}

var ctx = baglam(TMP);

var passed = 0, failed = 0;
function ok(name, condition, evidence) {
  if (condition) { passed++; console.log("PASS " + name); }
  else { failed++; console.log("FAIL " + name + "   [" + String(evidence) + "]"); }
}
function activate(key) { return new Promise(function (resolve) { ctx.Pro.activate(key, resolve); }); }
function validate() { return new Promise(function (resolve) { ctx.Pro.validate(resolve); }); }

(async function () {
  /* ================= Pro'yu dene: her araca 3 kalici hak ================= */
  var DT = path.join(TMP, "deneme");
  fs.mkdirSync(DT, { recursive: true });
  var DF = path.join(DT, "Suflo", "pro-deneme.json");
  var ls = sahteLs();
  var d1 = baglam(DT, { ls: ls });
  var P = d1.Pro;
  ok("deneme: dosya yokken her araca 3 hak", P.denemeKalan("cut") === 3 && P.status().deneme.ozellikler.length === 9 && P.status().deneme.toplamKalan === 27, JSON.stringify(P.status().deneme && P.status().deneme.toplamKalan));
  ok("deneme: kurulmadan deneme+silent kapi false", P.gate("cut", { deneme: true, silent: true }) === false && P.gate("cut", { silent: true }) === false);
  ok("deneme: kurulmadan harcama yok (-1), dosya yazilmaz", P.denemeHarca("cut") === -1 && !fs.existsSync(DF));
  ok("deneme: denemeBaslat('mogrt') ve diger kutuphaneler false", ["mogrt", "sfx", "motionbg", "presets", "propack", "captionStyles", "batch", "assexport"].every(function (f) { return P.denemeBaslat(f) === false; }));
  ok("deneme: denemeBaslat('cut') true", P.denemeBaslat("cut") === true && P.denemeAcik("cut") && !P.denemeAcik("zoom"));
  ok("deneme: kurulunca kapi yalniz cut icin ve yalniz deneme:true ile gecer",
    P.gate("cut", { deneme: true, silent: true }) === true && P.gate("cut", { silent: true }) === false &&
    P.gate("zoom", { deneme: true, silent: true }) === false && P.gate("textcut", { deneme: true, silent: true }) === false);
  ok("deneme: filigran gerekli (Pro degil)", P.filigranGerekli() === true);
  var bildirilen = [];
  var kalanCut = P.denemeHarca("cut", function (m, t) { bildirilen.push([m, t]); });
  ok("deneme: denemeHarca 2 doner ve bildirir", kalanCut === 2 && bildirilen.length === 1 && bildirilen[0][0] === "1 deneme hakkı kullanıldı · 2 kaldı" && bildirilen[0][1] === "good", JSON.stringify(bildirilen));
  ok("deneme: harcama kurulumu kaldirir", !P.denemeAcik("cut") && P.gate("cut", { deneme: true, silent: true }) === false && P.denemeHarca("cut") === -1);
  var yazilan = JSON.parse(fs.readFileSync(DF, "utf8"));
  var imzasiz = {}; Object.keys(yazilan).forEach(function (k) { if (k !== "_sig") imzasiz[k] = yazilan[k]; });
  var beklenenSig = require("crypto").createHmac("sha256", PRO_SRC.match(/CACHE_SECRET = '([^']+)'/)[1]).update(JSON.stringify(imzasiz)).digest("hex");
  ok("deneme: dosya gecerli _sig ile yazildi", yazilan.v === 1 && yazilan.kullanilan.cut === 1 && yazilan._sig === beklenenSig, JSON.stringify(yazilan));
  ok("deneme: dosya 0600 ve .tmp kalmadi", (process.platform === "win32" || (fs.statSync(DF).mode & 511) === 384) && !fs.existsSync(DF + ".tmp"));
  ok("deneme: localStorage aynasi ayni imzali durumu tutar", ls.d["suflo.deneme"] === fs.readFileSync(DF, "utf8"));
  ok("deneme: status().deneme cut 2/3", P.status().deneme.ozellikler[0].kalan === 2 && P.status().deneme.toplamKalan === 26);

  var d2 = baglam(DT, { ls: sahteLs() });
  ok("deneme: yeni oturum dosyadan 2 okur (hak suresiz kalir)", d2.Pro.denemeKalan("cut") === 2 && d2.Pro.denemeKalan("zoom") === 3);

  fs.unlinkSync(DF);
  var d3 = baglam(DT, { ls: ls });
  ok("deneme: dosya silinse de localStorage aynasi haklari geri doldurmaz", d3.Pro.denemeKalan("cut") === 2);
  ok("deneme: dosya da ayna da yoksa 3 (taze)", baglam(DT, { ls: sahteLs() }).Pro.denemeKalan("cut") === 3);

  fs.writeFileSync(DF, ls.d["suflo.deneme"].replace('"cut":1', '"cut":0'));
  var d4 = baglam(DT, { ls: sahteLs() });
  ok("deneme: kurcalanmis sayi (imza tutmuyor) 0 hak verir, 3 degil", ["cut", "zoom", "overlay", "beat"].every(function (f) { return d4.Pro.denemeKalan(f) === 0; }) && d4.Pro.denemeBaslat("zoom") === false);
  fs.writeFileSync(DF, "{bozuk json");
  ok("deneme: bozuk dosya da 0 hak", baglam(DT, { ls: sahteLs() }).Pro.denemeKalan("cut") === 0);
  fs.writeFileSync(DF, ls.d["suflo.deneme"]);
  var kotuLs = sahteLs(); kotuLs.d["suflo.deneme"] = '{"v":1,"kullanilan":{},"_sig":"sahte"}';
  ok("deneme: kurcalanmis localStorage aynasi da 0 hak", baglam(DT, { ls: kotuLs }).Pro.denemeKalan("cut") === 0);
  ok("deneme: deneme.js yuklenmediyse deneme kapali (her sey kilitli kalir)", baglam(DT, { deneme: false }).Pro.denemeBaslat("cut") === false &&
    baglam(DT, { deneme: false }).Pro.status().deneme === null);

  // Upsell: "Ucretsiz dene · N hakkin var" -> kur, kapat, eylemi yeniden calistir
  var d5 = baglam(DT, { ls: sahteLs() });
  var tekrar = 0;
  var sonuc = d5.Pro.gate("zoom", { deneme: true, yeniden: function () { tekrar++; } });
  var els = d5._dom.els;
  ok("upsell: deneme kabul eden kapida birincil dugme #pro-upsell-deneme", sonuc === false && els["pro-upsell-deneme"] && els["pro-upsell-deneme"].text === "Ücretsiz dene · 3 hakkın var" &&
    /pro-btn-primary/.test(els["pro-upsell-deneme"].cls) && /pro-btn-ghost/.test(els["pro-upsell-go"].cls), JSON.stringify(els["pro-upsell-deneme"]));
  ok("upsell: hakkin yalniz basarida dustugu yazar; filigran notu yalniz stilli katmanda", /Hak yalnız işlem başarıyla bitince düşer<\/p>/.test(d5._dom.html()) && !/filigran/.test(d5._dom.html()));
  ok("upsell: ilk odak deneme dugmesinde", d5.document.activeElement === els["pro-upsell-deneme"]);
  var dBtn = els["pro-upsell-deneme"];
  dBtn.onclick();
  ok("upsell: tiklayinca kurulur, pencere kapanir, eylem setTimeout ile yeniden calisir", d5.Pro.denemeAcik("zoom") && !d5._dom.els["pro-upsell-deneme"] && d5._zaman.length === 1 && tekrar === 0);
  d5._zaman.shift()();
  ok("upsell: yeniden cagrisi kapiyi gecer", tekrar === 1 && d5.Pro.gate("zoom", { deneme: true, yeniden: function () {} }) === true);
  d5.Pro.gate("overlay", { deneme: true });
  ok("upsell: stilli katmanda filigran notu", /stilli katmanlarda küçük suflo\.app filigranı olur/.test(d5._dom.html()));
  d5._dom.els["pro-upsell-deneme"].onclick();
  ok("upsell: yeniden yoksa 'Deneme açık — tekrar tıkla' bildirimi", d5._toast.some(function (t) { return t[0] === "Deneme açık — tekrar tıkla"; }) && d5.Pro.denemeAcik("overlay"), JSON.stringify(d5._toast));
  d5.Pro.gate("mogrt", { deneme: true });
  ok("upsell: kutuphane kapisinda deneme dugmesi yok", !d5._dom.els["pro-upsell-deneme"] && /pro-btn-primary/.test(d5._dom.els["pro-upsell-go"].cls));
  d5._dom.els["pro-upsell-x"].onclick && d5._dom.els["pro-upsell-x"].onclick();
  d5.Pro.gate("cut");
  ok("upsell: deneme:true vermeyen cagri (sahne algilama gibi) deneme sunmaz", !d5._dom.els["pro-upsell-deneme"]);
  ok("odak tuzagi listesinde #pro-upsell-deneme", /ids = \['pro-upsell-x', 'pro-upsell-deneme', 'pro-upsell-go'/.test(PRO_SRC));

  // Deneme ciktilari (temiz yeniden olusturma kaydi)
  var kayit = { tur: "kanca", sequenceId: "s1", sekans: "Sekans", start: 4, path: "/x/suflo-kanca-1.mov", ad: "Suflo Kanca · x",
    assTemiz: "[Events]\nDialogue: 0,0:00:00.00,0:00:03.00,K,,0,0,0,,x", fontFiles: ["Anton.ttf"], g: 1080, y: 1920, fps: 30, sure: 3 };
  ok("çıktı: geçerli kayıt eklenir, bozuk eklenmez", d5.Pro.denemeCiktisiEkle(kayit) === true && d5.Pro.denemeCiktisiEkle({ tur: "srt" }) === false);
  ok("çıktı: yeni oturum dosyadan okur", baglam(DT).Pro.denemeCiktilari().length === 1 && baglam(DT).Pro.denemeCiktilari()[0].path === "/x/suflo-kanca-1.mov");
  d5.Pro.denemeCiktisiSil("/x/suflo-kanca-1.mov");
  ok("çıktı: silinen kayıt gider", baglam(DT).Pro.denemeCiktilari().length === 0);

  ok("Lisans yokken private icerik kimligi verilmez", ctx.Pro.contentCredentials() === null);

  var wrong = owned(); wrong.meta.product_id = 999;
  reply(wrong); reply({ deactivated: true });
  var rejected = await activate("WRONG-PRODUCT");
  ok("Baska Lemon urununun anahtari reddedilir", rejected.ok === false && /baska bir urune/i.test(rejected.error), rejected.error);
  ok("Reddedilen aktivasyon koltugu geri birakir", requests.some(function (r) { return /licenses\/deactivate/.test(r.path) && /WRONG-PRODUCT/.test(r.body); }), JSON.stringify(requests));

  reply(owned());
  var accepted = await activate("OWNED-LICENSE");
  ok("Dogru store ve product anahtari Pro'yu acar", accepted.ok === true && ctx.Pro.isPro());
  var creds = ctx.Pro.contentCredentials();
  ok("Icerik bulutu yalniz lisans ve instance kopyasini alir", creds && creds.licenseKey === "OWNED-LICENSE" && creds.instanceId === "instance-owned");
  creds.licenseKey = "mutated";
  ok("Disa verilen kimlik nesnesi ic cache'i degistiremez", ctx.Pro.contentCredentials().licenseKey === "OWNED-LICENSE");
  ok("Public durum nesnesi lisans anahtarini sizdirmaz", !("key" in ctx.Pro.status()) && !("instanceId" in ctx.Pro.status()));

  // Pro kullanicisi: deneme hic devreye girmez, dosya yazilmaz
  var PF = path.join(TMP, "Suflo", "pro-deneme.json");
  ok("Pro: kapi her zaman acik, deneme yok", ctx.Pro.gate("cut", { deneme: true, silent: true }) === true && ctx.Pro.gate("mogrt", { silent: true }) === true);
  ok("Pro: denemeBaslat false, denemeHarca -1, filigran yok, status().deneme null",
    ctx.Pro.denemeBaslat("cut") === false && ctx.Pro.denemeHarca("cut") === -1 && ctx.Pro.filigranGerekli() === false && ctx.Pro.status().deneme === null);
  ok("Pro: deneme dosyasi hic yazilmaz", !fs.existsSync(PF));

  var validationWrong = owned(); validationWrong.meta.product_id = 777;
  reply(validationWrong);
  var revoked = await validate();
  ok("Periyodik dogrulama da urun sahipligini yeniden kontrol eder", revoked.revoked === true && !ctx.Pro.isPro(), JSON.stringify(revoked));
  ok("Reddedilen lisans cache'i silinir", !fs.existsSync(path.join(TMP, "Suflo", "pro-license.json")));

  console.log("\n" + passed + "/" + (passed + failed) + " gecti");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(failed ? 1 : 0);
})().catch(function (e) {
  console.log("FAIL test kosumu   [" + (e && e.stack ? e.stack : e) + "]");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
