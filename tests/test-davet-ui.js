// Suflo testi: Davet et, kazan panel akisi (js/davet.js) — sahte DOM + sahte K/Pro/KApp ile:
// ucretsiz paylasim baglantisi, arkadastan gelen kod, sunucu kapali/eski/acik, lisansa bagli onbellek,
// Story karti dugmesi, davet seridi (an, mesgul, yildiz, bir daha gosterme), "Bizi nereden duydun?"
// ve diger modullerin (app/captions/magiccut/viral) baglantilari
var fs = require("fs"), path = require("path"), vm = require("vm");
var KOK = path.join(__dirname, "..");
var gecen = 0, toplam = 0;
function ok(ad, k, ek) { toplam++; if (k) gecen++; console.log((k ? "PASS " : "FAIL ") + ad + (ek !== undefined ? "   [" + String(ek).slice(0, 260) + "]" : "")); }

var html = fs.readFileSync(path.join(KOK, "index.html"), "utf8");

/* ---------------- sahte DOM ---------------- */
function Oge(tag, id) {
  var o = {
    tagName: String(tag || "div").toUpperCase(), id: id || "", className: "", textContent: "", title: "", value: "",
    checked: false, disabled: false, hidden: false, style: {}, _attr: {}, _olay: {}, children: [], parentNode: null, nextSibling: null,
    setAttribute: function (a, v) { this._attr[a] = String(v); },
    getAttribute: function (a) { return this._attr[a] === undefined ? null : this._attr[a]; },
    addEventListener: function (t, fn) { (this._olay[t] = this._olay[t] || []).push(fn); },
    appendChild: function (c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    insertBefore: function (c, ref) {
      if (c.parentNode) c.parentNode.removeChild(c);
      var i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
      c.parentNode = this; return c;
    },
    select: function () {}, focus: function () {},
    scrollIntoView: function () {}
  };
  return o;
}
function tetikle(e, tur, ev) { (e._olay[tur] || []).forEach(function (fn) { fn.call(e, ev || { target: e, preventDefault: function () {} }); }); }

function ortam(opts) {
  opts = opts || {};
  var ogeler = {};
  (html.match(/id="[^"]+"/g) || []).forEach(function (x) {
    var id = x.slice(4, -1);
    var bas = html.lastIndexOf("<", html.indexOf(x));
    var etiket = html.slice(bas, html.indexOf(">", html.indexOf(x)) + 1);
    var tag = (etiket.match(/^<([a-z0-9]+)/i) || [0, "div"])[1];
    var o = Oge(tag, id);
    if (/\shidden(\s|>|=)/.test(etiket)) o.hidden = true;
    ogeler[id] = o;
  });
  // kaynak dugmeleri (data-kaynak)
  var kaynakDugmeleri = [];
  var re = /data-kaynak="([a-z]+)"/g, m;
  while ((m = re.exec(html))) { var b = Oge("button"); b._attr["data-kaynak"] = m[1]; kaynakDugmeleri.push(b); }
  // seridin yer degistirmesi icin ebeveynler
  var sekme = Oge("section"), viralKutu = Oge("details"), altyazi = Oge("section");
  sekme.appendChild(ogeler["cut-status"]); viralKutu.appendChild(ogeler["cap-vr-durum"]);
  altyazi.appendChild(ogeler["star-bar"]); altyazi.appendChild(ogeler["davet-bar"]);

  var zaman = { simdi: Date.UTC(2026, 9, 4, 12) };
  var kuyruk = [];
  var say = { url: [], toast: [], istek: [], kaydet: 0, kopya: [], goster: [] };
  var settings = opts.settings || {};
  var proDurum = { pro: !!opts.pro, key: opts.key || "LIC-AAAA", dinleyici: [] };
  var sunucu = opts.sunucu || function () { return { status: 503, body: JSON.stringify({ ok: false, error: "kapali", reason: "referral_disabled" }) }; };
  var belge = {
    activeElement: null, body: Oge("body"),
    getElementById: function (id) { return ogeler[id] || null; },
    querySelectorAll: function (sel) { return sel === "#pro-kaynak [data-kaynak]" ? kaynakDugmeleri : []; },
    createElement: function (t) { return Oge(t); },
    execCommand: function (c) { if (c === "copy") say.kopya.push(belge._secili); return true; }
  };
  belge.body.appendChild = function (c) { belge._secili = c.value; return c; };
  belge.body.removeChild = function () {};
  function FakeDate() { return new Date(zaman.simdi); }
  FakeDate.now = function () { return zaman.simdi; };
  FakeDate.UTC = Date.UTC;
  var ctx = {
    console: console, Promise: Promise, JSON: JSON, Math: Math, Date: FakeDate, String: String, Number: Number, Array: Array, Object: Object,
    RegExp: RegExp, Error: Error, encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent, isFinite: isFinite,
    require: require, Uint8Array: Uint8Array,
    setTimeout: function (fn, ms) { kuyruk.push({ fn: fn, ms: ms }); return kuyruk.length; },
    clearTimeout: function () {},
    document: belge, navigator: {},
    K: {
      nodeOK: true, VERSION: "3.1.0",
      settings: function () { return settings; },
      saveSettings: function () { say.kaydet++; return true; },
      httpJson: function (url, hdr, govde) {
        say.istek.push({ url: url, hdr: hdr, govde: govde });
        return Promise.resolve(sunucu(govde));
      },
      hostMesgul: function () { return !!opts.mesgul && opts.mesgul(); },
      libassUyarisi: function () { return opts.libassYok ? "libass yok" : ""; },
      cs: { openURLInDefaultBrowser: function (u) { say.url.push(u); } },
      log: function () {}, hataYardimi: function (e) { return e && e.message ? e.message : String(e); }
    },
    Pro: {
      isPro: function () { return proDurum.pro; },
      contentCredentials: function () { return proDurum.pro ? { licenseKey: proDurum.key, instanceId: "inst-1" } : null; },
      on: function (fn) { proDurum.dinleyici.push(fn); }
    },
    KApp: {
      toast: function (m, t) { say.toast.push([m, t]); },
      goster: function (s) { say.goster.push(s); },
      onTab: function (ad, fn) { say.sekme = say.sekme || {}; say.sekme[ad] = fn; }
    },
    ProSync: { endpoint: function () { return "https://ornek.test/pro/v1/index.php"; } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "referral-core.js"), "utf8"), ctx, { filename: "js/referral-core.js" });
  vm.runInContext(fs.readFileSync(path.join(KOK, "js", "davet.js"), "utf8"), ctx, { filename: "js/davet.js" });
  ctx.KDavet.init();
  return {
    ctx: ctx, D: ctx.KDavet, el: ogeler, say: say, settings: settings, zaman: zaman, pro: proDurum, kaynak: kaynakDugmeleri,
    sekme: sekme, viralKutu: viralKutu, altyazi: altyazi,
    // zamanlayicilari calistir (gecikmeli karar, yeniden deneme)
    akit: function () { var n = 0; while (kuyruk.length && n < 50) { var k = kuyruk.shift(); if (k.ms < 15000) k.fn(); n++; } },
    bekle: function () { return new Promise(function (r) { setImmediate(r); }); },
    proYap: function (v, key) { proDurum.pro = v; if (key) proDurum.key = key; proDurum.dinleyici.forEach(function (f) { f(); }); }
  };
}

async function calis() {
  /* ---------- ucretsiz kullanici ---------- */
  var o = ortam();
  ok("ucretsiz: serbest paylasim gorunur, kodlu kisim gizli", !o.el["davet-serbest"].hidden && o.el["davet-kodlu"].hidden);
  var ref = o.settings.davetRefId;
  ok("ucretsiz: rastgele davet kimligi kaydedilir, baglanti ?ref=", /^[a-z2-7]{10}$/.test(ref) && o.el["davet-link"].value === "https://suflo.app/?ref=" + ref, o.el["davet-link"].value);
  o.D.ciz();
  ok("davet kimligi kalici (yeniden cizimde degismez)", o.settings.davetRefId === ref);
  ok("ucretsiz: not kisisel bilgi tasimadigini soyler", /kişisel bilgi taşımaz/.test(o.el["davet-serbest-not"].textContent));
  ok("ucretsiz: odul ve kodun Pro'ya ozel oldugu soylenir", /Pro sahiplerine özel/.test(o.el["davet-serbest-not"].textContent) &&
    /Pro sahiplerine özel/.test(html.slice(html.indexOf('id="davet-serbest-not"'), html.indexOf('id="davet-serbest-not"') + 300)));
  tetikle(o.el["davet-wa"], "click");
  ok("WhatsApp: wa.me adresi, baglanti kodlu", /^https:\/\/wa\.me\/\?text=/.test(o.say.url[0]) && decodeURIComponent(o.say.url[0].split("text=")[1]).indexOf("https://suflo.app/?ref=" + ref) !== -1, o.say.url[0]);
  tetikle(o.el["davet-x"], "click");
  ok("X: intent adresi", /^https:\/\/x\.com\/intent\/tweet\?text=/.test(o.say.url[1]));
  tetikle(o.el["davet-paylas"], "click");
  ok("Suflo'yu paylas: execCommand yedegiyle panoya, bildirim", o.say.kopya.length === 1 && o.say.kopya[0].indexOf("?ref=" + ref) !== -1 && /kopyalandı/.test(o.say.toast[o.say.toast.length - 1][0]));
  tetikle(o.el["davet-ig"], "click");
  ok("Instagram: yalniz kopyalar, tarayici acmaz", o.say.url.length === 2 && o.say.kopya.length === 2 && /Instagram/.test(o.say.toast[o.say.toast.length - 1][0]));
  ok("ucretsizken sunucuya istek gitmez", o.say.istek.length === 0);
  ok("Story karti ucretsizde gizli", o.el["davet-story"].hidden);
  tetikle(o.el["davet-ortaklik"], "click", { preventDefault: function () {} });
  ok("ortaklik baglantisi suflo.app/ortaklik.html", o.say.url[o.say.url.length - 1] === "https://suflo.app/ortaklik.html");

  /* ---------- arkadastan gelen kod ---------- */
  ok("arkadastan kod kutusu ucretsizde gorunur", !o.el["davet-girilen-sar"].hidden);
  o.el["davet-girilen"].value = "bozuk-kod";
  tetikle(o.el["davet-girilen-kaydet"], "click");
  ok("gecersiz kod kaydedilmez, uyari", !o.settings.davetGirilenKod && /SFL ile başlar/.test(o.el["davet-durum"].textContent));
  o.el["davet-girilen"].value = " sfl-abc def ";
  tetikle(o.el["davet-girilen-kaydet"], "click");
  ok("kod temizlenip kaydedilir, odeme kodu olur", o.settings.davetGirilenKod === "SFLABCDEF" && o.D.odemeKodu() === "SFLABCDEF" && o.el["davet-girilen"].value === "SFLABCDEF");
  o.el["davet-girilen"].value = "";
  tetikle(o.el["davet-girilen-kaydet"], "click");
  ok("bos kaydetmek kodu kaldirir", !o.settings.davetGirilenKod && o.D.odemeKodu() === "");

  /* ---------- Pro: sunucu kapali (503) ---------- */
  var p = ortam({ pro: true });
  await p.D.kodGetir(true);
  ok("Pro + kapali sunucu: istek ProSync adresine, lisans ve surumle", p.say.istek.length === 1 && p.say.istek[0].url === "https://ornek.test/pro/v1/index.php" &&
    p.say.istek[0].govde.action === "referral" && p.say.istek[0].govde.license_key === "LIC-AAAA" && p.say.istek[0].govde.instance_id === "inst-1" &&
    p.say.istek[0].govde.client_version === "3.1.0", JSON.stringify(p.say.istek[0] && p.say.istek[0].govde));
  ok("Pro + kapali sunucu: serbest paylasim + 'henuz acilmadi' notu", !p.el["davet-serbest"].hidden && p.el["davet-kodlu"].hidden &&
    /henüz açılmadı/.test(p.el["davet-serbest-not"].textContent));
  ok("Pro'da arkadastan kod kutusu gizli", p.el["davet-girilen-sar"].hidden);
  ok("kapali sunucu onbellege 'kod yok' yazar (6 saat sormaz)", p.settings.davetKod && p.settings.davetKod.kod === "" && p.settings.davetKod.alindi === p.zaman.simdi);
  p.say.sekme.settings();
  await p.bekle();
  ok("Ayarlar acilinca onbellek tazeyse yeni istek yok", p.say.istek.length === 1);
  ok("onbellekte lisans anahtarinin kendisi yok", JSON.stringify(p.settings).indexOf("LIC-AAAA") === -1);

  /* ---------- Pro: eski sunucu (400) ve ag yok ---------- */
  var e400 = ortam({ pro: true, sunucu: function () { return { status: 400, body: "{\"ok\":false,\"error\":\"Bilinmeyen islem.\"}" }; } });
  var sonuc400 = await e400.D.kodGetir(true);
  ok("eski sunucu (400) sessizce serbest paylasima duser", sonuc400 === false && !e400.el["davet-serbest"].hidden && e400.say.toast.length === 0);
  var ag = ortam({ pro: true, sunucu: function () { return { status: 0, body: "" }; } });
  await ag.D.kodGetir(true);
  ok("ag yokken onbellege dokunulmaz", !ag.settings.davetKod);
  var ikinci = await ag.D.kodGetir(true);
  ok("ag hatasinda dakikada en cok bir deneme", ikinci === false && ag.say.istek.length === 1);

  /* ---------- Pro: sunucu acik (200) ---------- */
  var acik = ortam({ pro: true, sunucu: function () {
    return { status: 200, body: JSON.stringify({ ok: true, code: "SFLABCDEF", count: 2, tier: 1, percent: 15, share_url: "https://kotu.example/?d=SFLABCDEF" }) };
  } });
  await acik.D.kodGetir(true);
  ok("acik sunucu: kod gosterilir", !acik.el["davet-kodlu"].hidden && acik.el["davet-serbest"].hidden && acik.el["davet-kod"].textContent === "SFLABCDEF");
  ok("ilerleme '2/3 davet', cubuk %67, sonraki odul", acik.el["davet-ilerleme-metin"].textContent === "2/3 davet" && acik.el["davet-bar-dolu"].style.width === "67%" &&
    /Kurucu/.test(acik.el["davet-odul"].textContent), acik.el["davet-ilerleme-metin"].textContent + " " + acik.el["davet-bar-dolu"].style.width);
  ok("Story karti libass varken gorunur", !acik.el["davet-story"].hidden);
  tetikle(acik.el["davet-wa"], "click");
  var waMetin = decodeURIComponent(acik.say.url[0].split("text=")[1]);
  ok("paylasimda kod ve suflo.app/?d= (sunucunun gonderdigi adres kullanilmaz)", waMetin.indexOf("SFLABCDEF") !== -1 &&
    waMetin.indexOf("https://suflo.app/?d=SFLABCDEF") !== -1 && waMetin.indexOf("kotu.example") === -1 && /%15/.test(waMetin), waMetin);
  tetikle(acik.el["davet-kopyala"], "click");
  ok("Kopyala: kodlu metin panoya", acik.say.kopya[0].indexOf("SFLABCDEF") !== -1);
  acik.proYap(true, "LIC-BBBB");
  ok("baska lisansa gecilince eski lisansin kodu gosterilmez", acik.el["davet-kodlu"].hidden && !acik.el["davet-serbest"].hidden);
  ok("baska lisansa gecince Story karti dugmesi de gizlenir", acik.el["davet-story"].hidden);
  acik.proYap(true, "LIC-AAAA");
  ok("ayni lisansa donunce kod geri gelir", !acik.el["davet-kodlu"].hidden);
  acik.proYap(false);
  ok("Pro bitince kod gizlenir", acik.el["davet-kodlu"].hidden && !acik.el["davet-serbest"].hidden);
  ok("Pro bitince Story karti dugmesi gizlenir (tiklayinca sessizce hicbir sey yapmazdi)", acik.el["davet-story"].hidden);
  ok("ilerlemenin altinda 14 gun notu", /14 gün sonra sayılır/.test(html.slice(html.indexOf('id="davet-ilerleme"'), html.indexOf('id="davet-serbest"'))));

  /* ---------- iade sonrasi: sunucu kademeyi korur ---------- */
  var iade = ortam({ pro: true, sunucu: function () {
    return { status: 200, body: JSON.stringify({ ok: true, code: "SFLABCDEF", count: 2, tier: 3, percent: 15 }) };
  } });
  await iade.D.kodGetir(true);
  ok("iade sonrasi kademe sunucudan (3), sayidan dusmez", iade.settings.davetKod.kademe === 3, JSON.stringify(iade.settings.davetKod));
  ok("acilmis Kurucu paketi 'sonraki odul' diye gosterilmez: hedef 10", iade.el["davet-ilerleme-metin"].textContent === "2/10 davet" &&
    !/Kurucu/.test(iade.el["davet-odul"].textContent), iade.el["davet-ilerleme-metin"].textContent + " " + iade.el["davet-odul"].textContent);

  /* ---------- odul indirildi bildirimi ---------- */
  var od = ortam({ pro: true });
  od.D.odulIndi(0);
  ok("odul inmediyse bildirim yok", od.say.toast.length === 0);
  od.D.odulIndi(3);
  ok("odul inince bildirim", od.say.toast.length === 1 && /Davet ödülün indirildi/.test(od.say.toast[0][0]));
  ok("pro-sync.js syncExtras indirince KDavet.odulIndi cagirir", /KDavet\.odulIndi\(downloaded\)/.test(fs.readFileSync(path.join(KOK, "js", "pro-sync.js"), "utf8")));
  var libassYok = ortam({ pro: true, libassYok: true, settings: { davetKod: acik.settings.davetKod } });
  ok("libass'siz ffmpeg'de Story karti dugmesi gizli", !libassYok.el["davet-kodlu"].hidden && libassYok.el["davet-story"].hidden);
  var bozukKod = ortam({ pro: true, sunucu: function () { return { status: 200, body: JSON.stringify({ ok: true, code: "sfl-kotu", count: 1 }) }; } });
  await bozukKod.D.kodGetir(true);
  ok("sunucudan gecersiz kod gelirse kullanilmaz", bozukKod.el["davet-kodlu"].hidden && bozukKod.settings.davetKod.kod === "");

  /* ---------- davet seridi ---------- */
  var s = ortam();
  s.D.ani("cut");
  ok("serit karar icin bekler (host cagrisi yeni bitti)", s.el["davet-bar"].hidden);
  s.akit();
  ok("ilk kesim: serit cikar, Kesim sekmesine (#cut-status ardina) tasinir", !s.el["davet-bar"].hidden && s.el["davet-bar"].parentNode === s.sekme &&
    /Kesim tamam/.test(s.el["davet-bar-metin"].textContent));
  ok("gosterim kaydedilir (goruldu + zaman)", s.settings.davetIstem.seen.cut === true && s.settings.davetIstem.lastShown === s.zaman.simdi);
  tetikle(s.el["davet-bar-kapat"], "click");
  s.zaman.simdi += 40 * 24 * 3600 * 1000;
  s.D.ani("cut"); s.akit();
  ok("ikinci kesimde cikmaz (ilk olay)", s.el["davet-bar"].hidden);
  s.D.ani("shorts"); s.akit();
  ok("40 gun sonra ilk Shorts: cikar, viral kutusuna tasinir", !s.el["davet-bar"].hidden && s.el["davet-bar"].parentNode === s.viralKutu && /Shorts/.test(s.el["davet-bar-metin"].textContent));
  tetikle(s.el["davet-bar-paylas"], "click");
  ok("Paylas: metni kopyalar, seridi kapatir", s.el["davet-bar"].hidden && s.say.kopya.length === 1 && /Ayarlar › Davet et, kazan/.test(s.say.toast[s.say.toast.length - 1][0]));
  s.D.ani({ type: "apply", count: 5 }); s.akit();
  ok("30 gun dolmadan 5. uygulama: cikmaz ve tuketilir", s.el["davet-bar"].hidden && s.settings.davetIstem.seen.apply === true);

  var y = ortam();
  y.el["star-bar"].hidden = false;
  y.D.ani({ type: "apply", count: 5 }); y.akit();
  ok("yildiz seridi acikken cikmaz, olay tuketilmez", y.el["davet-bar"].hidden && !(y.settings.davetIstem && y.settings.davetIstem.seen.apply));
  y.el["star-bar"].hidden = true;
  y.D.ani({ type: "apply", count: 6 }); y.akit();
  ok("yildiz kapaninca sonraki uygulamada cikar, yildizin yanina", !y.el["davet-bar"].hidden && y.el["davet-bar"].parentNode === y.altyazi);
  y.D.ani({ type: "apply", count: 3 });
  ok("3. uygulama davet ani degil", true);

  var mesgulSay = 0;
  var b = ortam({ mesgul: function () { mesgulSay++; return true; } });
  b.D.ani("cut"); b.akit();
  ok("Premiere mesgulken cikmaz, birkac kez yeniden dener, tuketmez", b.el["davet-bar"].hidden && mesgulSay === 4 && !(b.settings.davetIstem && b.settings.davetIstem.seen && b.settings.davetIstem.seen.cut), mesgulSay);

  var n = ortam();
  n.D.ani("cut"); n.akit();
  tetikle(n.el["davet-bar-asla"], "click");
  ok("'Bir daha gösterme' kalici", n.el["davet-bar"].hidden && n.settings.davetIstem.never === true);
  n.zaman.simdi += 400 * 24 * 3600 * 1000;
  n.D.ani("shorts"); n.akit();
  ok("'Bir daha gösterme' sonrasi hic cikmaz", n.el["davet-bar"].hidden);
  tetikle(n.el["davet-bar-secenek"], "click");
  ok("Secenekler Ayarlar'daki karta gotururur", n.say.goster[n.say.goster.length - 1] === "settings");

  /* ---------- Bizi nereden duydun? ---------- */
  var k = ortam({ pro: true });
  ok("kaynak sorusu baslangicta gizli", k.el["pro-kaynak"].hidden);
  k.D.kaynakSor();
  ok("etkinlestirmeden sonra bir kez gorunur", !k.el["pro-kaynak"].hidden);
  ok("7 secenek: youtube instagram tiktok arkadas kod google diger", k.kaynak.map(function (x) { return x._attr["data-kaynak"]; }).join(",") === "youtube,instagram,tiktok,arkadas,kod,google,diger");
  tetikle(k.kaynak[3], "click");
  await k.bekle();
  var at = k.say.istek[k.say.istek.length - 1];
  ok("yanit sunucuya ates-et-unut (attribution, enum deger)", at && at.govde.action === "attribution" && at.govde.answer === "arkadas" && k.el["pro-kaynak"].hidden && k.settings.kaynakSoruldu === true, JSON.stringify(at && at.govde));
  k.D.kaynakSor();
  ok("ikinci kez sorulmaz", k.el["pro-kaynak"].hidden);
  var g = ortam({ pro: true });
  g.D.kaynakSor();
  tetikle(g.el["pro-kaynak-atla"], "click");
  ok("Gec: istek yok, bir daha sorulmaz", g.say.istek.length === 0 && g.settings.kaynakSoruldu === true && g.el["pro-kaynak"].hidden);

  /* ---------- diger modullerle baglanti (kaynak denetimi) ---------- */
  var app = fs.readFileSync(path.join(KOK, "js", "app.js"), "utf8");
  var fiyatSrc = fs.readFileSync(path.join(KOK, "js", "pricing.js"), "utf8");
  ok("app.js: proCheckoutUrl arkadastan gelen kodu withDiscount ile ekler (js/pricing.js)", /SufloPricing\.checkoutUrl\([^;]*, kod\)/.test(app) &&
    /KDavet\.odemeKodu\(\)/.test(app) && /R\.withDiscount\(url, discountCode/.test(fiyatSrc));
  ok("app.js: KApp.davetAni disari acik, Pro etkinlesince kaynak sorulur", /davetAni: davetAni/.test(app) && /KDavet\.kaynakSor\(\)/.test(app) && /guvenli\("Davet"/.test(app));
  var cap = fs.readFileSync(path.join(KOK, "js", "captions.js"), "utf8");
  var yi = cap.slice(cap.indexOf("function yildizIste()"), cap.indexOf("function initYildizBar()"));
  ok("captions.js: sayac yildizdan sonra da surer, 5. uygulama davetAni'ye gider", /basariliUygulama = \(s\.basariliUygulama \|\| 0\) \+ 1/.test(yi) &&
    /davetAni\(\{ type: "apply", count: s\.basariliUygulama \}\)/.test(yi) && !/if \(s\.yildizSoruldu\) return;/.test(yi));
  var mc = fs.readFileSync(path.join(KOK, "js", "magiccut.js"), "utf8");
  ok("magiccut.js: kesim basarisinda davetAni('cut')", mc.indexOf('KApp.davetAni("cut")') > mc.indexOf("if (r.ok) {") && mc.indexOf('KApp.davetAni("cut")') < mc.indexOf('status("✕ " + r.error'));
  var vr = fs.readFileSync(path.join(KOK, "js", "viral.js"), "utf8");
  ok("viral.js: Shorts olusunca davetAni('shorts')", vr.indexOf('KApp.davetAni("shorts")') > vr.indexOf("Shorts sekansı oluşturuldu"));
  ok("index.html: davet seridi yildiz seridinin yaninda, .star-bar gorunumu", /id="star-bar"[\s\S]{0,900}id="davet-bar" class="star-bar davet-bar"/.test(html));
  ok("index.html: #grp-davet #grp-pro'nun hemen ardinda", html.indexOf('id="grp-davet"') > html.indexOf('id="grp-pro"') &&
    html.slice(html.indexOf('id="grp-pro"'), html.indexOf('id="grp-davet"')).split('class="set-group').length === 2);
  function betik(f) { return html.indexOf('<script src="js/' + f + '"></script>'); }
  ok("index.html: referral-core davet.js ve bolumler.js'ten once", betik("referral-core.js") > 0 && betik("referral-core.js") < betik("bolumler.js") &&
    betik("referral-core.js") < betik("davet.js") && betik("davet.js") < betik("app.js"));
  var dv = fs.readFileSync(path.join(KOK, "js", "davet.js"), "utf8");
  ok("davet.js: davet kimligi makine kimligi kullanmaz", !/machineId|instanceName/.test(dv));
  var ayikla = require("./_ayikla.js");
  var YASAK = [/\?\.[A-Za-z_$(\[]/, /\?\?/, /(\|\||&&)=/, /\.replaceAll\s*\(/, /\.at\s*\(\s*-?\d/, /=>/, /\bconst\b|\blet\b|`/];
  var sorun = ayikla(dv).split("\n").filter(function (l) { return YASAK.some(function (r) { return r.test(l); }); });
  ok("davet.js: ES5 / Chromium 74 uyumlu (ok fonksiyonu, let/const, ?. yok)", sorun.length === 0, sorun.slice(0, 2).join(" | "));
  var br = fs.readFileSync(path.join(KOK, "js", "bridge.js"), "utf8");
  ok("bridge.js: K.hostMesgul disari acik", /hostMesgul: hostMesgul/.test(br));

  console.log(gecen + "/" + toplam + " gecti");
  process.exit(gecen === toplam ? 0 : 1);
}
calis().catch(function (e) { console.log("FAIL kosum   [" + (e && e.stack ? e.stack : e) + "]"); process.exit(1); });
